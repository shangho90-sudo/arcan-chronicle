// In-game check of the basic melee attack in 8 directions (real input path: target + held attack button).
// For each direction a monster is placed 1.3 m away; the attack is held ~1.6 s of game time. Reports hits landed, swings seen
// (attack / attack2 alternate), whether the player kept its spot, console errors. TOUCH=1 for a phone context.
// Usage: TOUCH=1 W=390 H=844 node tools/browser-tests/attack_dirs.js
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/atkdirs'; fs.mkdirSync(OUT, { recursive: true });
const W = +process.env.W || 1280, H = +process.env.H || 800, TOUCH = !!process.env.TOUCH;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: W, height: H }, hasTouch: TOUCH, isMobile: TOUCH })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a), wait = ms => pg.waitForTimeout(ms);
  await pg.goto((process.env.URL || 'http://localhost:8765/index.html') + '?sim=' + (process.env.SIM || 10));
  const clickLabel = async (t) => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[role=button],[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)), t, { timeout: 300000 });
    await ev(t => [...document.querySelectorAll('button,[role=button],[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)).click(), t); await wait(500); };
  await clickLabel('새 게임'); if (await pg.locator('button', { hasText: '확인' }).count()) await pg.locator('button', { hasText: '확인' }).first().click();
  await clickLabel('모험 시작');
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading, null, { timeout: 300000 });
  await ev(() => G.loadZone('forest', 'from_town', false)); await pg.waitForFunction(() => !G.loading && G.zone && G.zone.def.id === 'forest', null, { timeout: 300000 });
  await wait(1500);
  await ev(() => { const p = G.player; G.zone.actors = G.zone.actors.filter(a => a === p || !a.def); for (const s of G.zone.spawners || []) { s.alive.length = 0; s.timers = [9999]; }
    p.teleport({ x: -17, z: -19.5 }); p.body.place(p.pos); G.render.setFocus(p.pos, true); G.ui.toasts.innerHTML = '';
    window._acts = []; const B = p.body, o = B.play.bind(B); B.play = (n, s, r) => { if ((n === 'attack' || n === 'attack2') && (r || B.action !== n)) window._acts.push(n); return o(n, s, r); }; });
  const res = {};
  for (let d = 0; d < 8; d++) {
    const r = await ev(d => { const p = G.player, a = d * Math.PI / 4, md = G.data.monsters.mon_slime;
      for (const m of G.zone.actors.filter(x => x.def)) { m.body && m.body.dispose && m.body.dispose(); } G.zone.actors = G.zone.actors.filter(x => !x.def);
      const m = G.zone.summon('mon_slime', p.pos, 1)[0]; m.def = { ...m.def, hp: 1e5, atk: 0, detectRange: 0 }; m.hp = 1e5; m.aggro = false; m.state = 'idle';
      m.pos = G.zone.geo.ground(p.pos.x + Math.sin(a) * 1.3, p.pos.z + Math.cos(a) * 1.3); m.home = { ...m.pos }; m.homeR = 0.01; m.think = 99;
      p.hp = p.maxHp; window._acts = []; window._x0 = { ...p.pos }; window._m = m; m.hits = 0; const td = m.takeDamage.bind(m); m.takeDamage = dd => { m.hits++; return td(dd); }; window._t0 = G.player.skills.clock; G.input.hold('attack', true); return null; }, d);
    await pg.waitForFunction(() => G.player.skills.clock - window._t0 > 1.6, null, { timeout: 300000, polling: 200 });
    res['dir' + d * 45] = await ev(() => { G.input.hold('attack', false); const p = G.player, m = window._m; const f = p.facing, a = m ? Math.atan2(m.pos.x - p.pos.x, m.pos.z - p.pos.z) : 0;
      return { hits: m ? m.hits : -1, swings: window._acts.join(','), gameT: +(G.player.skills.clock - window._t0).toFixed(2), moved: +Math.hypot(p.pos.x - window._x0.x, p.pos.z - window._x0.z).toFixed(2), faceErr: +(Math.abs(Math.atan2(Math.sin(Math.atan2(f.x, f.z) - a), Math.cos(Math.atan2(f.x, f.z) - a))) * 180 / Math.PI).toFixed(1) }; });
    if (d % 2 === 0) await pg.screenshot({ path: `${OUT}/dir${d * 45}${TOUCH ? '_touch' : ''}.png`, timeout: 300000 });
  }
  res.errors = errs.slice(0, 8);
  console.log(JSON.stringify(res, null, 1)); await b.close();
})();
