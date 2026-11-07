// 전직 변신 capture: in town, a Lv10 novice turns into 약사 (pharmacist outfit model), frames at TIMES after 전직,
// then a last frame walking (same gait). GENDER=m|f.  Usage: GENDER=f node tools/browser-tests/jobchange.js -> OUT/job_<g>_<t>.png
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/job', GEN = process.env.GENDER || 'm';
const SZ = process.env.SIZE || '1448x1086', touch = SZ.endsWith('t'), [W, H] = SZ.replace('t', '').split('x').map(Number);
const TIMES = (process.env.TIMES || '0.5,1.2,1.8,2.4,4').split(',').map(Number);
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
  await pg.waitForTimeout(3000);
  const info = await ev(async (gen) => {
    G.frame = () => {}; document.querySelectorAll('.controls,.toasts,.questhud').forEach(e => e.style.display = 'none');
    const p = G.player; if (G.sheet.p.gender !== gen) { G.sheet.p.gender = gen; await p.attachBody(); }
    p.teleport({ x: -4, z: -14 }); p.setFacing(0.4, -1);
    G.sheet.p.level = 10; G.sheet.book.grantPoints && G.sheet.book.grantPoints(); G.sheet.recalc();
    for (let i = 0; i < 10; i++) G.step(1 / 60, false);
    G.render.setFocus({ x: p.pos.x, y: p.pos.y, z: p.pos.z }, true);
    const before = p.body.md.cfg.file, e = G.sheet.chooseJob('pharmacist'); G.__t = 0;
    return { before, err: e || null };
  }, GEN);
  console.log(JSON.stringify(info));
  for (const t of TIMES) {
    await ev(async (t) => { let n = 0; while (G.__t < t - 1e-6 && n++ < 600) { G.step(1 / 60, false); if (G.reward) G.reward.update(1 / 60); if (G.skillFx) G.skillFx.update(1 / 60); G.__t += 1 / 60; if (n % 20 === 0) await new Promise(r => setTimeout(r, 0)); } G.render.render(0); }, t);
    await pg.waitForTimeout(300); await ev(() => G.render.render(0));
    await pg.screenshot({ path: `${OUT}/job_${GEN}_${t.toFixed(2)}.png`, timeout: 600000 });
  }
  console.log(await ev(() => JSON.stringify({ after: G.player.body.md.cfg.file, job: G.sheet.p.job, bones: G.player.body.md.bones.length })));
  // walk a little: same gait system
  await ev(async () => { const p = G.player; for (let i = 0; i < 40; i++) { G.input.stick = { x: 1, y: 0 }; G.step(1 / 60, false); } G.render.render(0); });
  await pg.screenshot({ path: `${OUT}/job_${GEN}_walk.png`, timeout: 600000 });
  console.log(JSON.stringify(errs.slice(0, 5)));
  await b.close();
})();
