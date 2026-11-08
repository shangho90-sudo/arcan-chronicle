// Frame-by-frame film of the weapon swings (attack / attack2) in the real renderer, for several facings.
// Each frame is rendered with the game loop stopped and the body stepped at a fixed 1/60 s, so timing is exact.
// Usage: ACTS=attack,attack2 DIRS=0,45,90,135,180,225,270,315 STEP=0.03 GENDER=m node tools/browser-tests/swing_film.js
//   -> OUT/swing_<act>_<dir>.png (strip of frames, left to right) + OUT/swing_probe.json (hand / blade-tip path)
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/swing'; fs.mkdirSync(OUT, { recursive: true });
const ACTS = (process.env.ACTS || 'attack,attack2').split(','), DIRS = (process.env.DIRS || '0,90,180,270').split(',').map(Number);
const STEP = +process.env.STEP || 0.035, CW = 130, CH = 150;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: 900, height: 700 } })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a), wait = ms => pg.waitForTimeout(ms);
  await pg.goto(process.env.URL || 'http://localhost:8765/index.html');
  const clickLabel = async (t) => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[role=button],[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)), t, { timeout: 300000 });
    await ev(t => [...document.querySelectorAll('button,[role=button],[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)).click(), t); await wait(500); };
  await clickLabel('새 게임');
  if (process.env.GENDER === 'f') await ev(() => { const c = document.querySelector('.choice-f'); if (c) c.click(); });
  if (await pg.locator('button', { hasText: '확인' }).count()) await pg.locator('button', { hasText: '확인' }).first().click();
  await clickLabel('모험 시작');
  await pg.waitForSelector('.prologue.on', { timeout: 60000 }).then(() => clickLabel('건너뛰기')).catch(() => {});   // 새 캐릭터 서장 건너뛰기
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.player.body && G.player.body.md, null, { timeout: 300000 });
  await wait(1500);
  await ev(() => { G.frame = () => {}; document.querySelectorAll('.hud,.controls,.toasts,.layer').forEach(e => e.style.visibility = 'hidden');
    const p = G.player; p.teleport({ x: 0, z: -14 }); p.body.place(p.pos); G.render.setFocus(p.pos, true); for (const n of G.zone.npcs) n.body && n.body.setVisible && n.body.setVisible(false); });
  const probe = {};
  for (const act of ACTS) for (const dir of DIRS) {
    const frames = await ev(([act, dir]) => { const p = G.player, B = p.body, yaw = dir * Math.PI / 180;
      B.play('idle', 1, true); B.targetYaw = B.yaw = yaw; for (let i = 0; i < 20; i++) B.update(1 / 60);
      B.play(act, 1, true); return Math.ceil(B.sh.actions[act].dur * 60) + 8; }, [act, dir]);
    const shots = [], path = [];
    let next = 0;
    for (let f = 0; f <= frames; f++) {
      const info = await ev((act) => { const p = G.player, B = p.body; if (B.action === act && B.t >= (B.sh.actions[act].lock ?? 9)) B.play('idle', 1); B.update(1 / 60); const bp = B.bladePoints(); B.root.updateMatrixWorld(true); const ft = n => { const v = new B.root.position.constructor().setFromMatrixPosition(B.bones[B.md.byName[n]].matrixWorld); return [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)]; };
        const hb = B.bones[B.md.byName.Right_Hand].matrixWorld, hp = new B.root.position.constructor().setFromMatrixPosition(hb);
        return { t: +B.t.toFixed(3), tip: bp && bp[1].toArray().map(v => +v.toFixed(3)), base: bp && bp[0].toArray().map(v => +v.toFixed(3)), hand: hp.toArray().map(v => +v.toFixed(3)), footL: ft('Left_Foot'), footR: ft('Right_Foot'), act: B.action }; }, act);
      path.push(info);
      if (info.t >= next - 1e-6) { next += STEP;
        const c = await ev(() => { const R = G.render, p = G.player; p.body.place(p.pos); R.setFocus(p.pos, true); R.render(0); const s = R.toScreen({ x: p.pos.x, y: p.pos.y + 0.8, z: p.pos.z }); return [s.x, s.y]; });
        const s = await pg.screenshot({ clip: { x: Math.round(c[0] - CW / 2), y: Math.round(c[1] - CH * 0.5), width: CW, height: CH }, timeout: 120000 }); shots.push(s.toString('base64')); }
    }
    probe[act + '_' + dir] = path;
    fs.writeFileSync(`${OUT}/swing_${act}_${dir}.json`, JSON.stringify(shots));
  }
  fs.writeFileSync(`${OUT}/swing_probe.json`, JSON.stringify(probe));
  console.log('errors', errs.slice(0, 5)); await b.close();
})();
