// 견습생 스킬 단일 대상·배쉬 밀치기 확인: 허수아비 3마리를 모아 두고 nv_a1/a2/a3/a4를 쓴 뒤 맞은 수·밀린 거리를 셈.
// Usage: node tools/browser-tests/novice_single.js -> /tmp/novice/*.png
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/novice'; fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: 960, height: 600 } })).newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  const ev = (f, a) => pg.evaluate(f, a); await pg.goto(process.env.URL || 'http://localhost:8765/index.html');
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(() => localStorage.clear()); await click('새 게임'); await click('모험 시작'); await pg.waitForSelector('.prologue.on'); await click('건너뛰기');
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && !document.querySelector('.prologue'), null, { timeout: 300000 });
  const res = {};
  for (const id of (process.env.IDS || 'nv_a1,nv_a2,nv_a3,nv_a4').split(',')) {
    res[id] = await ev(async (id) => {
      G.frame = () => {}; const p = G.player; G.dev.level(12); G.dev.full();
      for (const a of [...G.zone.actors]) if (a.def && a !== p && a.body) { a.dead = true; a.remove && a.remove(); }
      let spot = null; const [bx0, bz0, bx1, bz1] = G.zone.def.bounds; for (let zz = bz0 + 6; zz < bz1 - 6 && !spot; zz += 1.5) for (let xx = bx0 + 6; xx < bx1 - 10 && !spot; xx += 1.5) { let ok = true; for (let a = -1; a <= 7 && ok; a += 0.5) for (let o = -2; o <= 2 && ok; o += 1) if (G.zone.geo.blocked(xx + a, zz + o, 0.8)) ok = false; if (ok) spot = { x: xx, z: zz }; } p.teleport(spot); p.body.place(p.pos); p.setFacing(1, 0); p.skills2.cd = {}; if (p.skills2.cds) p.skills2.cds = {};
      const sk = G.sheet.book.sk; sk.learned[id] = 3; G.sheet.recalc(); G.sheet.book.equip(id, 0, false);
      const ds = G.dev.dummies('mon_golem', 3, 0.9, { x: p.pos.x + 1.9, z: p.pos.z }); for (const m of ds) { m.thinkStep = () => {}; m.def = { ...m.def, ai: 'heavy' }; const td = m.takeDamage.bind(m); m.touched = 0; m.takeDamage = d => { if (!d.dot) m.touched++; return td({ ...d, noMiss: true }); }; }
      const before = ds.map(m => ({ hp: m.hp, x: m.pos.x, z0: m.pos.z }));
      p.target = null; p.lockOn = null; p.path = []; G.input.block = true;
      for (let i = 0; i < 4; i++) G.step(1 / 30, false);
      const e = p.skills2.cast(id, { x: p.pos.x + 2, z: p.pos.z }); if (e) return 'cast error: ' + e;
      const pend0 = p.skills2.pending.length, tg = p.skills2.targetFor(G.data.skill2(id)); const mx = ds.map(() => 0); for (let i = 0; i < 75; i++) { G.step(1 / 30, false); ds.forEach((m, k) => mx[k] = Math.max(mx[k], Math.hypot(m.pos.x - before[k].x, m.pos.z - before[k].z0))); } window._dbg = { blocked: ds.map(m => { const dx = m.pos.x - p.pos.x, dz = m.pos.z - p.pos.z, l = Math.hypot(dx, dz); return [0.5, 1, 1.5, 2].map(s => G.zone.geo.blocked(m.pos.x + dx / l * s, m.pos.z + dz / l * s, m.radius) ? 1 : 0).join(''); }), pend0, tgt: tg && [tg.name, tg.dead, ds.includes(tg), +p.dist(tg).toFixed(2)] };
      return { dbg: window._dbg, hit: ds.filter(m => m.touched > 0).length, touches: ds.map(m => m.touched), pushed: mx.map(v => +v.toFixed(2)), final: ds.map((m, i) => +Math.hypot(m.pos.x - before[i].x, m.pos.z - before[i].z0).toFixed(2)) };
    }, id);
  }
  await ev(() => { G.ui.showSkills ? G.ui.showSkills() : null; }); await pg.waitForTimeout(800); await pg.screenshot({ path: OUT + '/skills_window.png', timeout: 300000 });
  console.log(JSON.stringify(res)); console.log('errors', errs.slice(0, 4)); await b.close();
})();
