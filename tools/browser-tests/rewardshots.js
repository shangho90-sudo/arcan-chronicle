// Monster-kill reward capture (속삭이는 숲 bare-dirt clearing): N slimes next to the player die at once (N=1 single,
// N=5 area kill), the game runs at fixed 1/60 s steps (other monsters frozen), frames at TIMES after the kill.
// Usage: TAG=after N=1 node tools/browser-tests/rewardshots.js -> OUT/reward_<tag>_<n>_<t>.png   (SIZE=390x844t phone)
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/reward', TAG = process.env.TAG || 'after', N = +(process.env.N || 1);
const SZ = process.env.SIZE || '1448x1086', touch = SZ.endsWith('t'), [W, H] = SZ.replace('t', '').split('x').map(Number);
const TIMES = (process.env.TIMES || '0.1,0.3,0.5,0.8,1.2,1.6').split(',').map(Number);
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
  await ev((N) => {
    G.frame = () => {}; G.ui.toasts.innerHTML = '';
    const c = { x: 36, z: -30 };
    const mons = G.zone.actors.filter(a => a !== G.player && a.def);
    for (const m of mons) m.teleport({ x: c.x + 30, z: c.z + 30 });
    const sl = mons.filter(m => m.def.id === 'mon_slime').concat(mons).slice(0, N);
    const spots = [[-1.6, -0.6], [-2.6, 0.6], [-0.4, -2.0], [-2.8, -1.8], [-1.2, 1.4]];
    sl.forEach((m, i) => { m.teleport({ x: c.x + spots[i][0], z: c.z + spots[i][1] }); m.home = { ...m.pos }; m.setFacing(1, 0); });
    G.player.teleport({ x: c.x + 60, z: c.z }); for (let i = 0; i < 20; i++) G.step(1 / 60, false);
    for (const m of mons) if (!sl.includes(m)) m.update = () => {};
    G.player.teleport({ x: c.x + 0.6, z: c.z }); G.player.setFacing(-1, 0); for (let i = 0; i < 3; i++) G.step(1 / 60, false);
    document.querySelectorAll('.controls,.toasts').forEach(e => e.style.display = 'none');
    G.render.setFocus({ x: G.player.pos.x, y: G.player.pos.y, z: G.player.pos.z }, true); G.render.render(0);   // camera settled + matrices current before the kill (reward text is projected)
    for (const m of sl) { m.hp = 1; m.die(G.player); }
    G.__t = 0;
  }, N);
  for (const t of TIMES) {
    await ev((t) => { let n = 0; while (G.__t < t - 1e-6 && n++ < 400) { G.step(1 / 60, false); G.render.render(0); G.ui.tick(1 / 60); if (G.skillFx) G.skillFx.update(1 / 60); if (G.reward) G.reward.update(1 / 60); G.__t += 1 / 60; } G.ui.updatePlates && G.ui.updatePlates(0); G.render.render(0); }, t);
    await pg.screenshot({ path: `${OUT}/reward_${TAG}_${N}_${t.toFixed(2)}.png`, timeout: 600000 });
  }
  console.log(JSON.stringify(errs.slice(0, 5)));
  await b.close();
})();
