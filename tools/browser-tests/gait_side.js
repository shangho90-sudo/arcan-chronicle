// Clean gait film: only the player on a grid (town hidden, no collision), fixed 60 Hz steps, close camera.
// Usage: TAG=side PITCH=8 YAW=0 MAG=1 GS=m,f CLIPS=run,turn,stop,start node tools/browser-tests/gait_side.js -> OUT/film_<tag>_<g>_<clip>_<n>.png (MAG = stick size, 0.35 = walk)
const { chromium } = require('playwright');
const fs = require('fs');
const TAG = process.env.TAG || 'film', OUT = process.env.OUT || '/tmp/gait';
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: 420, height: 420 } })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(process.env.URL || 'http://localhost:8765/index.html');
  const clickLabel = async (t) => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[role=button],[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)), t, { timeout: 300000 });
    await ev(t => [...document.querySelectorAll('button,[role=button],[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)).click(), t); await pg.waitForTimeout(500); };
  await clickLabel('새 게임');
  if (await pg.locator('button', { hasText: '확인' }).count()) await pg.locator('button', { hasText: '확인' }).first().click();
  await clickLabel('모험 시작');
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && G.player.body && !G.loading, null, { timeout: 300000 });
  await pg.waitForTimeout(1500);
  await pg.evaluate(async ([pi, ya]) => { const m = await import('/js/render.js'); if (pi) m.CAM.pitch = +pi; if (ya) m.CAM.yaw = +ya; }, [process.env.PITCH, process.env.YAW]);
  await ev(async (m) => { G.__THREE = await import('three'); G.__mag = m; }, +(process.env.MAG || 1));
  await ev(() => {
    G.frame = () => {}; G.zone.geo.blocked = () => false; document.querySelectorAll('.hud,.controls,#world,.toasts').forEach(e => e.style.display = 'none');
    const orig = G.input.frame.bind(G.input); G.__ctl = { move: null };
    G.input.frame = () => { const r = orig(); r.move = G.__ctl.move; return r; };
    G.__run = (move, n) => { for (let k = 0; k < n; k++) { G.__ctl.move = move; G.step(1 / 60, false); } };
    G.__shot = () => { const R = G.render, p = G.player; for (const c of R.scene.children) c.visible = c === p.body.root || c === p.body.shadow || c.isLight || c === G.__grid; if (!G.__grid) { G.__grid = new G.__THREE.GridHelper(200, 400, 0x555555, 0x888888); R.scene.add(G.__grid); R.scene.background = new G.__THREE.Color(0xd8d0c0); } G.__grid.position.y = p.pos.y + 0.01; R.setFocus({ x: p.pos.x, y: p.pos.y + 0.5, z: p.pos.z }, true); R.render(0); const o = 1.25, a = R.aspect; R.cam.fov = 2 * Math.atan(o / 26) * 180 / Math.PI; R.cam.updateProjectionMatrix(); R.render(0); };
  });
  const clips = [
    ['run', [-9, -12], [1, 0], [[[1, 0], 40, 0], [[1, 0], 36, 3]]],               // 0.67 s to settle, then 12 frames 1/20 s apart
    ['turn', [-6, -12], [1, 0], [[[1, 0], 50, 0], [[-1, 0], 30, 3]]],
    ['stop', [-9, -12], [1, 0], [[[1, 0], 50, 0], [null, 30, 3]]],
    ['start', [-9, -12], [1, 0], [[null, 30, 0], [[1, 0], 30, 3]]],
  ];
  for (const g of (process.env.GS||'m').split(',')) {
    if (g === 'f') await ev(async () => { G.player.sheet.p.gender = 'f'; await G.player.attachBody(); });
    for (const [name, at, face, parts] of clips.filter(c => (process.env.CLIPS||'run').split(',').includes(c[0]))) {
      await ev(([at, face]) => { const p = G.player; p.teleport({ x: at[0], z: at[1] }); p.path = []; p.setFacing(face[0], face[1]); p.body.yaw = p.body.targetYaw; G.__run(null, 30); }, [at, face]);
      let k = 0;
      for (const [mv, n, every] of parts) {
        if (!every) { await ev(([mv, n]) => G.__run(mv ? { x: mv[0] * G.__mag, z: mv[1] * G.__mag } : null, n), [mv, n]); continue; }
        for (let i = 0; i < n; i += every) { await ev(([mv, e]) => { G.__run(mv ? { x: mv[0] * G.__mag, z: mv[1] * G.__mag } : null, e); G.__shot(); }, [mv, every]); await pg.screenshot({ path: `${OUT}/film_${TAG}_${g}_${name}_${String(k++).padStart(2, '0')}.png`, timeout: 300000 }); }
      }
    }
  }
  console.log('errors', errs);
  await b.close();
})();
