const { chromium } = require('playwright');
const W = +process.env.W || 1280, H = +process.env.H || 720, DPR = +process.env.DPR || 1, TAG = process.env.TAG || 'fhd';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/three@0\.160\.0\/examples\/jsm\/(.*)/, r => { const m = r.request().url().match(/examples\/jsm\/(.*)$/); r.fulfill({ path: '/tmp/three160/examples/jsm/' + m[1], contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } }); });
  await ctx.route('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js', r => r.fulfill({ path: '/opt/dl/three.module.js', contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } }));
  const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text()); });
  const ev = (f, a) => pg.evaluate(f, a), wait = ms => pg.waitForTimeout(ms);
  await pg.goto('http://localhost:8765/index.html?sim=3');
  await pg.waitForFunction(() => !document.getElementById('loading'), null, { timeout: 300000 });
  await pg.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('새 게임')), null, { timeout: 300000 }); await pg.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('새 게임')).click()); await wait(400);
  if (await pg.locator('button', { hasText: '확인' }).count()) await pg.locator('button', { hasText: '확인' }).click();
  await pg.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('모험 시작')), null, { timeout: 300000 }); await pg.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('모험 시작')).click());
  await pg.waitForFunction(() => G.inWorld && G.player && !G.loading, null, { timeout: 300000 }); await wait(1500);
  await pg.waitForFunction(() => G.inWorld && G.player && !G.loading, null, { timeout: 300000 }); await wait(1000);
  const jobs = (process.env.JOBS || 'pharmacist,western_pharmacist,herbalist,cook,chef,blacksmith,engineer,hairdresser,designer,artist,painter,musician').split(',');
  const shotIds = new Set((process.env.SHOT || '').split(',').filter(Boolean));
  const results = {};
  // open field south-west of the fountain
  await ev(() => { G.player.teleport({ x: -14, z: -9 }); G.render.setFocus(G.player.pos, true); });
  for (const job of jobs) {
    const info = await ev(job => {
      const j = G.data.job(job); G.dev.level(j.tier === 2 ? 50 : 20);
      if (G.sheet.p.job !== job) { if (j.tier === 2) G.sheet.p.job = j.parent; else G.sheet.p.job = 'novice'; G.sheet.recalc(); const e = G.dev.job(job); if (e) return 'job error ' + e; }
      G.dev.learnAll(job); if (j.parent) G.dev.learnAll(j.parent);
      G.dev.items([['c_potion_m', 10], ['f_lunch', 5], ['f_soup', 5], ['c_potion_s', 10]]);
      // equip a job weapon so weapon skills validate
      const w = G.data.itemList.find(i => i.type === 'weapon' && i.job === (j.parent || job)); if (w) { G.sheet.bag.add(w.id, 1); const s = G.sheet.p.inventory.findIndex(x => x.id === w.id); G.sheet.bag.equipFromSlot(s); }
      return 'ok';
    }, job);
    if (info !== 'ok') { results[job] = info; console.log(job, info); continue; }
    let ids = await ev(job => G.data.skillsOf(job).map(s => s.id), job); if (process.env.ONLY) ids = ids.filter(i => process.env.ONLY.split(',').includes(i));
    for (const id of ids) {
      const r = await ev(id => {
        const d = G.data.skill2(id), p = G.player, eng = p.skills2; G.dev.full(); p.skills.lock = 0; eng.casting = null; eng.channel = null;
        for (const a of G.zone.actors.slice()) if (a.dummy) a.remove(); eng.clearTemp();
        const dummies = G.dev.dummies('mon_boar', 4, 1.0, { x: p.pos.x + 3.0, z: p.pos.z });
        for (const m of dummies) { m.thinkStep = () => { }; }
        p.target = null; p.setFacing(1, 0); p.hp = p.maxHp * 0.5; for (const id of ['poison', 'burn', 'slow', 'bleed']) p.status.apply(G.data.status(id), 8, id === 'slow' ? 0.3 : 1, null); window.__php = p.hp;
        window.__d = { dummies, hp0: dummies.map(m => m.hp), php: p.maxHp * 0.5, psh: p.shield, sp: p.sp, st: p.status.list.length, sum: eng.summons.length };
        if (d.type === 'passive' || d.type === 'craft') return { id, type: d.type, lv: G.sheet.book.level(id), skip: true };
        if (d.type === 'ultimate') G.sheet.book.equip(id, 0, false); else G.sheet.book.equip(id, 0, false);
        if (d.ops.some(o => o.op === 'consume')) G.dev.items([['c_potion_m', 2], ['f_lunch', 2]]);
        const aim = d.target === 'ground' ? { x: p.pos.x + 3.0, z: p.pos.z } : { x: p.pos.x + 1, z: p.pos.z };
        const e = eng.cast(id, aim); window.__c0 = eng.clock;
        return { id, type: d.type, lv: G.sheet.book.level(id), err: e, wait: (d.cast || 0) + Math.max(...d.ops.map(o => (o.at || 0) + (o.after || 0) + (o.op === 'custom' ? (o.start || 0) + (o.n || 0) * (o.gap || 0) : 0) + (o.dur && o.op !== 'telegraph' && o.op !== 'buff' ? Math.min(o.dur, 2.5) : 0))) };
      }, id);
      if (r.skip) { results[id] = r; continue; }
      await pg.waitForFunction(w => G.player.skills2.clock - window.__c0 >= w, Math.min(6, 1.0 + r.wait), { timeout: 400000 }).catch(() => console.log('WAIT TIMEOUT'));
      if (shotIds.has(id)) await pg.screenshot({ path: `/tmp/sk/${id}.png`, timeout: 300000, clip: { x: W * 0.15, y: H * 0.1, width: W * 0.7, height: H * 0.8 } });
      const after = await ev(() => { const w = window.__d, p = G.player, eng = p.skills2; return {
        dmg: Math.round(w.dummies.reduce((s, m, i) => s + (w.hp0[i] - m.hp), 0)), hit: w.dummies.filter((m, i) => m.hp < w.hp0[i]).length,
        st: w.dummies.reduce((s, m) => s + m.status.list.length, 0), marks: w.dummies.reduce((s, m) => s + (m._marks ? m._marks.reaction + m._marks.pattern + m._marks.colors.size + Math.abs(m._marks.temp) : 0), 0),
        heal: Math.round(p.hp - w.php), shield: Math.round(p.shield - w.psh), pst: p.status.list.length - w.st, summons: eng.summons.filter(s => !s.dead).length, areas: eng.areas.length, mp: Math.round(w.sp - p.sp), melody: !!eng.melody, buffs: p.status.list.filter(s => !s.def.debuff).map(s => s.def.id), t: +(eng.clock - window.__c0).toFixed(2) }; });
      results[id] = Object.assign(r, after);
      console.log(JSON.stringify(results[id]));
    }
  }
  require('fs').writeFileSync('/tmp/sk/results_' + (process.env.TAG || 'all') + '.json', JSON.stringify(results, null, 1));
  console.log('ERRORS', JSON.stringify(errs.slice(0, 30)));
  await b.close();
})();
