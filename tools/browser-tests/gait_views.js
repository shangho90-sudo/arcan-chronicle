// Gait film from side / front / back / game view with a debug overlay drawn into the scene:
//   pelvis (white), knees (yellow), ankles (green = planted, red = in the air), nominal ankle targets (blue rings).
// The real movement code runs at a fixed step (DT, default 1/60) with the input held; frames are taken every EVERY steps.
// Usage: GENDER=m VIEW=side DT=0.0167 EVERY=3 N=16 SPEED=1 node tools/browser-tests/gait_views.js  -> OUT/view_<g>_<view>_<speed>.png
//   SPEED = stick magnitude (1 = full 4.6 m/s run, 0.5 = mobile half stick 2.3 m/s, 0.3 = slow walk)
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/gview'; fs.mkdirSync(OUT, { recursive: true });
const G_ = process.env.GENDER || 'm', VIEWS = (process.env.VIEW || 'side,front,back,game').split(','), DT = +process.env.DT || 1 / 60, EVERY = +process.env.EVERY || 3, N = +process.env.N || 16;
const SPEEDS = (process.env.SPEED || '1').split(',').map(Number);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: 300, height: 340 } })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(process.env.URL || 'http://localhost:8765/index.html');
  const clickLabel = async (t) => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[role=button],[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)), t, { timeout: 300000 });
    await ev(t => [...document.querySelectorAll('button,[role=button],[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)).click(), t); await pg.waitForTimeout(500); };
  await clickLabel('새 게임'); if (await pg.locator('button', { hasText: '확인' }).count()) await pg.locator('button', { hasText: '확인' }).first().click();
  await clickLabel('모험 시작');
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && G.player.body && !G.loading, null, { timeout: 300000 });
  if (G_ === 'f') await ev(async () => { G.player.sheet.p.gender = 'f'; await G.player.attachBody(); });
  await pg.waitForTimeout(1200);
  await ev(([DT]) => {
    G.frame = () => {}; document.querySelectorAll('.hud,.controls,.toasts,.layer').forEach(e => e.style.visibility = 'hidden');
    for (const n of G.zone.npcs) n.body && n.body.setVisible && n.body.setVisible(false);
    const orig = G.input.frame.bind(G.input); G.__ctl = { move: null };
    G.input.frame = () => { const r = orig(); r.move = G.__ctl.move; return r; };
    G.__run = (mv, n) => { for (let k = 0; k < n; k++) { G.__ctl.move = mv; G.step(DT, false); } };
    const T3 = window.THREE || G.render.scene.constructor && null;
    const R = G.render, THREE = R.scene.children[0].constructor && R.THREE;
    G.__dbg = []; 
  }, [DT]);
  // debug markers + cameras built with the game's own three.js
  await ev(async () => {
    const { THREE } = await import('./js/render.js'); window.__T = THREE;
    const mk = (r, c) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), new THREE.MeshBasicMaterial({ color: c, depthTest: false })); m.renderOrder = 99; G.render.scene.add(m); return m; };
    const ring = c => { const m = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 6, 20), new THREE.MeshBasicMaterial({ color: c, depthTest: false })); m.rotation.x = Math.PI / 2; m.renderOrder = 99; G.render.scene.add(m); return m; };
    window.__mk = { hip: mk(0.03, 0xffffff), kL: mk(0.025, 0xffe040), kR: mk(0.025, 0xffe040), aL: mk(0.028, 0x30e060), aR: mk(0.028, 0x30e060), tL: ring(0x4090ff), tR: ring(0x4090ff) };
    window.__cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
  });
  for (const sp of SPEEDS) for (const view of VIEWS) {
    await ev(([sp]) => { const p = G.player; p.teleport({ x: -9, z: -12 }); p.path = []; p.setFacing(1, 0); p.body.yaw = p.body.targetYaw; G.__run(null, 40); G.__run({ x: sp, z: 0 }, 50); }, [sp]);
    const shots = [];
    for (let i = 0; i < N; i++) {
      await ev(([view, sp, every]) => {
        G.__run({ x: sp, z: 0 }, every);
        const THREE = window.__T, p = G.player, B = p.body, M = window.__mk; B.root.updateMatrixWorld(true);
        const bp = n => new THREE.Vector3().setFromMatrixPosition(B.bones[B.md.byName[n]].matrixWorld);
        M.hip.position.copy(bp('Hips')); M.kL.position.copy(bp('Left_LowerLeg')); M.kR.position.copy(bp('Right_LowerLeg')); M.aL.position.copy(bp('Left_Foot')); M.aR.position.copy(bp('Right_Foot'));
        const F = B.feet; for (const [s, a, t] of [['Left', M.aL, M.tL], ['Right', M.aR, M.tR]]) { const st = F && F[s]; a.material.color.set(st && st.stance ? 0x30e060 : 0xff4040); t.visible = !!(st && st.dbg); if (st && st.dbg) t.position.set(st.dbg.x, B.root.position.y + 0.02, st.dbg.z); }
        const c = p.pos, P = new THREE.Vector3(c.x, (c.y || 0) + 0.62, -c.z), cam = window.__cam, o = 0.92;
        cam.left = -o * 300 / 340; cam.right = o * 300 / 340; cam.top = o; cam.bottom = -o; cam.updateProjectionMatrix();
        const off = { side: [0, 0, 6], front: [6, 0, 0], back: [-6, 0, 0] }[view];
        if (view === 'game') { cam.quaternion.copy(G.render.cam.quaternion); const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion); cam.position.copy(P).addScaledVector(fwd, -20); }
        else { cam.position.set(P.x + off[0], P.y + off[1], P.z + off[2]); cam.lookAt(P); }
        G.render.r.render(G.render.scene, cam);
      }, [view, sp, EVERY]);
      shots.push((await pg.screenshot()).toString('base64'));
    }
    fs.writeFileSync(`${OUT}/view_${G_}_${view}_${sp}.json`, JSON.stringify(shots));
  }
  const info = await ev(() => G.player.body.gdbg);
  console.log('gdbg', JSON.stringify(info), 'errors', errs.slice(0, 4)); await b.close();
})();
