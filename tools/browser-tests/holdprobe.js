// 무기 쥔 자세 조절값 비교: 직업·성별 하나로, REST_TILT / RUN_TILT 값을 바꿔 가며 대기(무기 든 채)·달리기를 같은 카메라로 찍어 한 줄로 붙임.
// 대기 = 앞에 멧돼지 허수아비(전투 대기 자세), 달리기 = 화면 아래쪽으로, 등 = 무기를 멘 채 등을 보임.
// Usage: JOB=cook GENDER=m KIND=knife REST="0,-40,-80" RUN="" URL= OUT=/tmp/gfx7 TAG= NODE_PATH=$(npm root -g) node tools/browser-tests/holdprobe.js
//   -> OUT/<TAG>_hold_<job>_<g>.png (열 = 값마다 [대기 | 달리기])
const { chromium } = require('playwright'); const fs = require('fs'); const { execSync } = require('child_process');
const OUT = process.env.OUT || '/tmp/gfx7', TAG = process.env.TAG || 'probe', JOB = process.env.JOB || 'cook', G_ = process.env.GENDER || 'm', KIND = process.env.KIND || 'knife';
const REST = (process.env.REST || '').split(',').filter(x => x !== '').map(Number), RUN = (process.env.RUN || '').split(',').filter(x => x !== '').map(Number);
const WEAPON = { blacksmith: 'w_hammer_1', pharmacist: 'w_pestle_1', cook: 'w_knife_1', hairdresser: 'w_scissors_1', artist: 'w_brush_1' };
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--single-process', '--no-zygote'] });
  const pg = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (/^(idle|run|back) /.test(m.text())) console.log(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(process.env.URL || 'http://localhost:8817/index.html');
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(() => localStorage.clear()); await pg.reload(); await click('새 게임'); await click('모험 시작');
  await pg.waitForSelector('.prologue.on', { timeout: 60000 }).then(() => click('건너뛰기')).catch(() => {});
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.player.body && G.player.body.md, null, { timeout: 300000 });
  await ev(([job, g, w]) => { G.frame = () => {}; document.querySelectorAll('.hud,.toasts,.qhud,.qh-reopen,.plates,.layer,.controls').forEach(e => e.style.display = 'none');
    if (G.reward) { G.reward.jobChange = sw => sw && sw(); G.reward.levelUp = () => {}; } G.dev.level(12); for (const n of G.zone.npcs) if (n.body && n.body.setVisible) n.body.setVisible(false);
    const s = G.sheet; s.p.gender = g; s.p.job = 'novice'; if (job !== 'novice') G.dev.job(job); if (w) { s.bag.add(w, 1); s.p.weapon = w; } s.recalc(); return G.player.attachBody(); }, [JOB, G_, WEAPON[JOB]]);
  await pg.waitForTimeout(3000);
  const VAR = process.env.VAR, VALS = (process.env.VALS || '').split(',').filter(x => x !== '').map(Number);   // VAR=OFF_ROLL|OFF_TILT VALS=0,90
  const vals = VAR ? VALS.map(v => [VAR, v]) : (REST.length ? REST.map(v => ['REST_TILT', v]) : RUN.map(v => ['RUN_TILT', v]));
  if (!vals.length) vals.push(['REST_TILT', null]);
  const shots = [];
  for (const [tab, v] of vals) {
    for (const mode of ['idle', 'run', 'back']) {
      const c = await ev(([tab, kind, v, mode]) => { if (v !== null) window[tab][kind] = v;
        const p = G.player, B = p.body, cam = G.render.cam; cam.zoom = 3; cam.updateProjectionMatrix(); G.input.stick = { x: 0, y: 0 };
        const spot = G.zone.geo.nearestFree(-6.2, -6.6, 0.4); p.teleport(spot); p.body.place(p.pos); p.setFacing(0.94, 0.34); p.calmT = 0;
        if (mode === 'back') { p.calmT = 99; B.setArmed(false); for (let i = 0; i < 40; i++) { G.step(1 / 60, false); B.setArmed(false); } p.setFacing(Math.SQRT1_2, Math.SQRT1_2); for (let i = 0; i < 5; i++) { G.step(1 / 60, false); B.setArmed(false); } }
        else { if (mode === 'idle') { if (!window.__d) { const at = { x: spot.x + 0.94 * 1.7, z: spot.z + 0.34 * 1.7 }; window.__d = G.dev.dummies('mon_boar', 1, 0.01, at)[0]; window.__d.teleport(at); window.__d.thinkStep = () => {}; } p.target = window.__d; }
          B.setArmed(true); for (let i = 0; i < 60; i++) { G.step(1 / 60, false); if (mode !== 'idle') B.setArmed(true); } }   // idle: armed once, like jobsheet.js
        if (mode === 'run') { if (window.__d) { window.__d.remove && window.__d.remove(); window.__d = null; } p.target = null; G.input.stick = { x: 0.0, y: -1 }; for (let i = 0; i < 36; i++) { G.step(1 / 60, false); B.setArmed(true); } G.input.stick = { x: 0, y: 0 }; }
        G.render.setFocus({ x: p.pos.x, y: 0, z: p.pos.z }, true); G.render.render(0); console.log(mode, B.action, +(B.swingW || 0).toFixed(2), +(B.gaitW || 0).toFixed(2), B.over && B.over.name); return G.render.toScreen({ x: p.pos.x, y: 0.9, z: p.pos.z }); }, [tab, KIND, v, mode]);
      const fn = `${OUT}/_hp_${TAG}_${shots.length}.png`; await pg.screenshot({ path: fn, clip: { x: Math.max(0, Math.round(c.x - 170)), y: Math.max(0, Math.round(c.y - 230)), width: 340, height: 400 }, timeout: 300000 }); shots.push(fn);
    }
  }
  fs.writeFileSync('/tmp/_hp.py', `from PIL import Image, ImageDraw\nfs=${JSON.stringify(shots)}\nlab=${JSON.stringify(vals.map(v => v[0] + ' ' + v[1]))}\ns=Image.new('RGB',(340*3,400*len(lab)),(20,20,28))\nd=ImageDraw.Draw(s)\nfor i,f in enumerate(fs): s.paste(Image.open(f).convert('RGB'),((i%3)*340,(i//3)*400))\nfor r,l in enumerate(lab): d.text((6,r*400+6),l,fill=(255,255,0))\ns.save('${OUT}/${TAG}_hold_${JOB}_${G_}.png')\n`);
  execSync('python3 /tmp/_hp.py'); console.log(`${OUT}/${TAG}_hold_${JOB}_${G_}.png`, errs.slice(0, 3)); await b.close();
})();
