// 기본공격 5단 콤보를 게임 몸(js/model.js, IK·발 고정까지 끝난 결과) 그대로 60 fps로 구워 Blender로 넘깁니다.
// 게임 루프는 멈추고 몸만 1/60 s씩 진행, 루트 이동(adv)은 actors.js comboRoot와 같은 방식으로 루트 위치에 반영.
// 뼈마다 루트(배우) 공간의 위치·회전, 칼(오른손 소품) 행렬, 칼날 밑·끝, 루트 이동량, 앞 방향을 기록.
// Usage: GENDER=m|f URL=http://localhost:8777/index.html node tools/browser-tests/combo_bake.js
//   -> OUT (기본 tools/blender/combo5/bake_<model>.json) — tools/blender/combo5.py 가 읽음
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const ACTS = (process.env.ACTS || 'combo_full,combo_1,combo_2,combo_3,combo_4,combo_5').split(',');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: 640, height: 480 } })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(process.env.URL || 'http://localhost:8777/index.html');
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(() => localStorage.clear()); await click('새 게임');
  if (process.env.GENDER === 'f') await ev(() => { const c = document.querySelector('.choice-f'); if (c) c.click(); });
  await click('모험 시작');
  await pg.waitForSelector('.prologue.on', { timeout: 60000 }).then(() => click('건너뛰기')).catch(() => {});
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.player.body && G.player.body.md && G.player.body.props.R, null, { timeout: 300000 });
  await pg.waitForTimeout(1000);
  const out = await ev(acts => {
    G.frame = () => {};
    const p = G.player, B = p.body, THREE = G.THREE, r5 = v => Math.round(v * 1e5) / 1e5;
    const f = { x: 0, z: -1 }, pos0 = { x: p.pos.x, y: p.pos.y, z: p.pos.z };
    B.setFacing(f.x, f.z); B.yaw = B.targetYaw;
    const res = { model: B.md.cfg.file, tex: B.md.cfg.tex || null, scale: B.mesh.scale.x, bones: B.md.bones.map(b => ({ name: b.name, parent: b.parent })), acts: {} };
    const pm = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
    const rel = (o, inv) => { pm.multiplyMatrices(inv, o.matrixWorld); pm.decompose(v, q, s); return [r5(v.x), r5(v.y), r5(v.z), r5(q.x), r5(q.y), r5(q.z), r5(q.w)]; };
    for (const act of acts) {
      B.place(pos0); B.play('idle', 1, true); for (let i = 0; i < 40; i++) B.update(1 / 60);
      B.play(act, 1, true); B.fadeDur = 0; B.fromPose = null;
      const A = B.sh.actions[act], n = Math.round(A.dur * 60) + 1, frames = [];
      B.root.updateMatrixWorld(true);
      const root0 = B.root.matrixWorld.clone(), inv0 = root0.clone().invert();
      const fw = new THREE.Vector3(f.x, 0, -f.z).transformDirection(inv0);   // facing in the root space (three: game z -> -z)
      for (let i = 0; i < n; i++) {
        if (i) B.update(1 / 60); else B.update(0);
        const adv = A.combo ? (B.poseAt(B.t).adv || 0) : 0, gp = { x: pos0.x + f.x * adv, y: pos0.y, z: pos0.z + f.z * adv };
        B.place(gp); B.root.updateMatrixWorld(true);
        const inv = B.root.matrixWorld.clone().invert();
        const travel = new THREE.Vector3().setFromMatrixPosition(B.root.matrixWorld).applyMatrix4(inv0);
        const bp = B.bladePoints();
        frames.push({ t: r5(B.t), bones: B.bones.map(bn => rel(bn, inv)), prop: rel(B.props.R, inv), travel: [r5(travel.x), r5(travel.y), r5(travel.z)],
          blade: bp ? [bp[0].clone().applyMatrix4(inv).toArray().map(r5), bp[1].clone().applyMatrix4(inv).toArray().map(r5)] : null });
      }
      res.acts[act] = { dur: A.dur, hitT: A.hitT, hitTimes: A.hitTimes, chainOpen: A.chainOpen ?? null, chainClose: A.chainClose ?? null, lock: A.lock, mark: A.mark || null, trail: A.trail, fwd: fw.toArray().map(r5), frames };
    }
    const h = B.props.R; res.bladeLen = h.userData.len || null; res.weapon = B.propKind ? B.propKind.R : null;
    return res;
  }, ACTS);
  const OUT = process.env.OUT || path.join(__dirname, '..', 'blender', 'combo5', `bake_${out.model || 'player'}.json`);
  fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(out));
  console.log('wrote', OUT, 'model', out.model, 'scale', out.scale, 'weapon', out.weapon, 'bladeLen', out.bladeLen, Object.entries(out.acts).map(([k, a]) => k + ':' + a.frames.length).join(' '), 'errors', errs.slice(0, 4));
  await b.close();
})();
