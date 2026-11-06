// Ground-shatter effect capture: 속삭이는 숲, next to the 꽃잎 곰 (mon_golem, heavy slam -> 'ground_crack') camp.
// The world is frozen (no game steps); only the skill effects advance, at fixed times after the burst.
// Usage: TAG=after KIND=ground_crack node tools/browser-tests/shattershots.js -> OUT/shatter_<tag>_<kind>_<t>.png (+ _sheet.png)
//   SIZE=1448x1086 (add t for touch / phone), KIND = ground_crack | fire_crack | explosion_big
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/shatter', TAG = process.env.TAG || 'after', KIND = process.env.KIND || 'ground_crack';
const SZ = process.env.SIZE || '1448x1086', touch = SZ.endsWith('t'), [W, H] = SZ.replace('t', '').split('x').map(Number);
const TIMES = (process.env.TIMES || '0.06,0.14,0.24,0.4,0.8,1.5,2.3').split(',').map(Number);
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(process.env.URL || 'http://localhost:8765/index.html', { timeout: 300000 });
  const clickLabel = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)), t, { timeout: 300000 });
    await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)).click(), t); };
  await ev(() => localStorage.clear()); await clickLabel('새 게임'); await clickLabel('모험 시작');
  await pg.waitForFunction(() => window.G && G.inWorld && !G.loading && G.skillFx, null, { timeout: 300000 });
  await ev(() => G.loadZone('forest', 'from_town'));
  await pg.waitForFunction(() => G.inWorld && !G.loading && G.zone && G.zone.def.id === 'forest', null, { timeout: 600000 });
  await pg.waitForTimeout(3000);
  const info = await ev(async () => {
    if (G.skillFx.shatter) await G.skillFx.shatter.load();
    G.frame = () => {}; G.ui.toasts.innerHTML = '';
    const ms = G.zone.actors.filter(a => a.def && a.def.id === 'mon_golem');
    // fixed spot: the bare-dirt clearing of the golem camp; three golems placed around the impact like the reference shot
    const c = { x: 36, z: -30 }, ring = [[-1.6, -1.2], [0, -1.6], [1.6, -1.2]];
    ms.slice(0, 3).forEach((m, i) => { m.teleport({ x: c.x + ring[i][0], z: c.z + ring[i][1] }); m.home = { ...m.pos }; m.setFacing(0, 1); });
    ms.slice(3).forEach(m => m.teleport({ x: c.x + 4, z: c.z + 3 }));
    G.player.teleport({ x: c.x + 60, z: c.z }); for (let i = 0; i < 3; i++) G.step(1 / 60, false);   // monsters settle without noticing the player
    for (const m of G.zone.actors) if (m !== G.player) m.update = () => {};
    G.player.teleport({ x: c.x, z: c.z + 0.2 }); G.player.setFacing(0, -1); for (let i = 0; i < 3; i++) G.step(1 / 60, false);
    const bn = 3;
    G.__c = G.zone.geo.ground(c.x, c.z - 0.9);
    document.querySelectorAll('.hud,.controls,.toasts').forEach(e => e.style.display = 'none'); const R = G.render; R.setFocus({ x: c.x, y: G.__c.y + 0.5, z: c.z - 0.6 }, true); R.render(0);
    return { golems: ms.length, near: bn, c };
  });
  console.log(JSON.stringify(info));
  await ev((k) => { G.skillFx.burst(k, G.__c, { radius: k === 'ground_crack' ? 2.4 * 0.55 : 1.2 }); G.__t = 0; }, KIND);
  const shots = [];
  for (const t of TIMES) {
    await ev((t) => { let n = 0; while (G.__t < t - 1e-6 && n++ < 400) { const d = Math.min(1 / 60, t - G.__t); G.skillFx.update(d); G.__t += d; } G.render.render(0); }, t);
    const f = `${OUT}/shatter_${TAG}_${KIND}_${t.toFixed(2)}.png`; await pg.screenshot({ path: f, timeout: 600000 }); shots.push(f);
  }
  console.log(JSON.stringify(errs.slice(0, 5)));
  await b.close();
})();
