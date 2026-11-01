// Line-up of every monster model in the real renderer (town plaza), all facing the camera, plus a walking frame.
// Usage: TAG=cute node tools/browser-tests/monster_lineup.js  -> OUT/lineup_<tag>.png
const { chromium } = require('playwright');
const OUT = process.env.OUT || '/tmp/mon', TAG = process.env.TAG || 'lineup';
require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: 1500, height: 760 } })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(process.env.URL || 'http://localhost:8765/index.html');
  const clickLabel = async (t) => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[role=button],[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)), t, { timeout: 300000 });
    await ev(t => [...document.querySelectorAll('button,[role=button],[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)).click(), t); await pg.waitForTimeout(500); };
  await clickLabel('새 게임');
  if (await pg.locator('button', { hasText: '확인' }).count()) await pg.locator('button', { hasText: '확인' }).first().click();
  await clickLabel('모험 시작');
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading, null, { timeout: 300000 });
  const ids = await ev(async () => {
    G.frame = () => {}; document.querySelectorAll('.hud,.controls,#world,.toasts').forEach(e => e.style.display = 'none');
    const C = await import('./js/creature.js'); const sh = await G.loadSheet ? null : null;
    const ids = Object.keys(C.CREATURES); const bodies = [];
    const actions = { name: 'm', actions: { idle: { frames: 1, fps: 1, loop: true }, walk: { frames: 8, fps: 8, loop: true } } };
    const cols = 8, R = G.render, p = G.player; p.body.setVisible(false);
    const camYaw = 45 * Math.PI / 180, fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);   // unit vector pointing towards the camera (game coords)
    for (let i = 0; i < ids.length; i++) {
      const cr = await C.loadCreature(ids[i]); const body = new C.CreatureBody(R.scene, cr, actions, 0.6);
      const row = Math.floor(i / cols), col = i % cols;
      // rows along the screen: offset along the camera's right vector, rows towards the back
      const rx = Math.cos(camYaw), rz = -Math.sin(camYaw), x = 2 + (col - 3.5) * 2.6 * rx - row * 4.5 * fx, z = -12 + (col - 3.5) * 2.6 * rz - row * 4.5 * fz;
      body.place({ x, y: 0, z }); body.setFacing(fx, fz); body.yaw = body.targetYaw; body.play(i % 2 ? 'walk' : 'idle'); body.t = 0.1; body.update(0.016);
      bodies.push(body);
    }
    R.setFocus({ x: 2 - 2.2 * fx, y: 0, z: -12 - 2.2 * fz }, true); const o = 6.2; R.cam.top = o; R.cam.bottom = -o; R.cam.left = -o * R.aspect; R.cam.right = o * R.aspect; R.cam.updateProjectionMatrix();
    R.render(0); R.cam.top = o; R.cam.bottom = -o; R.cam.left = -o * R.aspect; R.cam.right = o * R.aspect; R.cam.updateProjectionMatrix(); R.render(0);
    return ids;
  });
  await pg.screenshot({ path: `${OUT}/lineup_${TAG}.png`, timeout: 300000 });
  console.log(ids.join(' '), '\nerrors', errs.slice(0, 5));
  await b.close();
})();
