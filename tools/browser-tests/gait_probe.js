// Gait probe: drives the real player (real movement code, real ModelBody) with fixed 60 Hz logic steps and records
// foot / hip bone positions every step, for both player models. Output: OUT/gait_<tag>.json, analysed by
// tools/browser-tests/gait_report.py.  Usage: TAG=before node tools/browser-tests/gait_probe.js
// Needs the game served on http://localhost:8765. FPS=30 steps the game at 1/30 s instead of 1/60 s.
const { chromium } = require('playwright');
const fs = require('fs');
const TAG = process.env.TAG || 'probe', OUT = process.env.OUT || '/tmp/gait';
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: 640, height: 480 } })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.addInitScript(f => { window.__FPS = f; }, process.env.FPS || 60);
  await pg.goto(process.env.URL || 'http://localhost:8765/index.html');
  const clickLabel = async (t) => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[role=button],[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)), t, { timeout: 300000 });
    await ev(t => [...document.querySelectorAll('button,[role=button],[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)).click(), t); await pg.waitForTimeout(500); };
  await clickLabel('새 게임');
  if (await pg.locator('button', { hasText: '확인' }).count()) await pg.locator('button', { hasText: '확인' }).first().click();
  await clickLabel('모험 시작');
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && G.player.body && !G.loading, null, { timeout: 300000 });
  await pg.waitForTimeout(1500);
  // stop the rAF loop; from here the probe owns time (fixed 1/60 s logic steps, no rendering)
  await ev(() => {
    G.frame = () => {}; G.__dt = 1 / (+(window.__FPS || 60));
    const orig = G.input.frame.bind(G.input);
    G.__ctl = { move: null, attack: false, dodge: false };
    G.input.frame = () => { const r = orig(); const c = G.__ctl; r.move = c.move; if (c.attack) { r.down.attack = true; r.held.attack = true; } if (c.dodge) { r.down.dodge = true; c.dodge = false; } return r; };
    G.__probe = (script) => {
      const p = G.player, out = [], dt = G.__dt || 1 / 60;
      const bi = n => p.body.md.byName[n];
      const wp = i => { const e = p.body.bones[i].matrixWorld.elements; return [+e[12].toFixed(4), +e[13].toFixed(4), -e[14].toFixed(4)]; };   // three -> game coords
      let t = 0;
      for (const seg of script) {
        if (seg.at) { p.teleport({ x: seg.at[0], z: seg.at[1] }); p.path = []; p.vel = { x: 0, z: 0 }; if (seg.face) { p.setFacing(seg.face[0], seg.face[1]); p.body.yaw = p.body.targetYaw; } }
        const n = Math.round(seg.dur / dt);
        for (let k = 0; k < n; k++) {
          const c = G.__ctl; c.move = seg.move ? { x: seg.move[0], z: seg.move[1] } : null; c.attack = !!seg.attack && k < 3; if (seg.dodge && k === 0) c.dodge = true;
          G.step(dt, false);
          p.body.root.updateMatrixWorld(true);
          const B = p.body;
          const gd = B.gaitW > 0.01 && B.gdbg ? B.gdbg : null;
          out.push({ gd, t: +t.toFixed(4), seg: seg.name, pos: [+p.pos.x.toFixed(4), +p.pos.z.toFixed(4)], yaw: +B.yaw.toFixed(4), gv: +B.gaitV.toFixed(3), gw: +B.gaitW.toFixed(3), ph: +B.gaitPh.toFixed(4), act: B.action,
            hip: wp(bi('Hips')), st: B.feet ? [B.feet.Left.stance ? 1 : 0, B.feet.Right.stance ? 1 : 0] : null, tw: B.feet ? [B.feet.Left.dbg ? [B.feet.Left.dbg.x, -B.feet.Left.dbg.z] : null, B.feet.Right.dbg ? [B.feet.Right.dbg.x, -B.feet.Right.dbg.z] : null] : null, la: wp(bi('Left_Foot')), lt: wp(bi('Left_Toes')), ra: wp(bi('Right_Foot')), rt: wp(bi('Right_Toes')) });
          t += dt;
        }
      }
      return out;
    };
  });
  const S = 0.7071;
  const script = [
    { name: 'idle', at: [-9, -12], face: [1, 0], dur: 0.6 },
    { name: 'start_straight', move: [1, 0], dur: 2.4 },
    { name: 'stop', dur: 0.9 },
    { name: 'diagonal', move: [-S, -S], dur: 1.8 },
    { name: 'stop2', dur: 0.6 },
    { name: 'turn180_a', at: [-6, -12], face: [1, 0], move: [1, 0], dur: 1.2 },
    { name: 'turn180_b', move: [-1, 0], dur: 1.2 },
    { name: 'turn90_a', move: [0, -1], dur: 0.9 },
    { name: 'turn90_b', move: [1, 0], dur: 1.0 },
    { name: 'stop3', dur: 0.6 },
    { name: 'blocked', at: [-8, -19.5], face: [0, -1], move: [0, -1], dur: 1.6 },
    { name: 'stop4', dur: 0.5 },
    { name: 'run_attack', at: [-8, -12], face: [1, 0], move: [1, 0], dur: 0.8 },
    { name: 'attack', move: [1, 0], attack: true, dur: 0.6 },
    { name: 'after_attack', move: [1, 0], dur: 0.8 },
    { name: 'dash', move: [1, 0], dodge: true, dur: 0.6 },
    { name: 'after_dash', move: [1, 0], dur: 0.8 },
    { name: 'stop5', dur: 0.6 },
  ];
  const res = {};
  for (const g of ['m', 'f']) {
    if (g === 'f') await ev(async () => { G.player.sheet.p.gender = 'f'; await G.player.attachBody(); });
    const leg = await ev(() => { const L = G.player.body.md.leg; return { L: L.Left.L1 + L.Left.L2, ha: L.Left.ha, toe: L.Left.toe, hip: L.Left.hip, ankX: L.Left.ankX, toeOut: L.Left.toeOut, speed: G.player.stat('moveSpeed') }; });
    res[g] = { leg, frames: await ev(s => G.__probe(s), script) };
    console.log(g, JSON.stringify(leg), res[g].frames.length, 'frames');
  }
  res.errors = errs;
  fs.writeFileSync(`${OUT}/gait_${TAG}.json`, JSON.stringify(res)); console.log('errors', errs.length, errs.slice(0, 3));
  await b.close();
})();
