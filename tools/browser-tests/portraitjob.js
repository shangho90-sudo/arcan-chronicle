// 1차 전직 뒤 왼쪽 위 초상화가 검은 실루엣이 아니라 얼굴로 나오는지 확인(전직 직후 + 저장 후 다시 불러오기).
// Usage: JOBS=pharmacist,blacksmith GENDER=m node tools/browser-tests/portraitjob.js -> OUT/portrait_<job>_<when>.png
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/portraitjob'; fs.mkdirSync(OUT, { recursive: true });
const JOBS = (process.env.JOBS || 'pharmacist').split(','), GEN = process.env.GENDER || 'm';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: 1100, height: 700 } })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto('http://localhost:8765/index.html');
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(() => localStorage.clear()); await click('새 게임'); await click('모험 시작'); await pg.waitForSelector('.prologue.on', { timeout: 60000 }); await click('건너뛰기');
  const ready = () => pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.zone && !document.querySelector('.prologue'), null, { timeout: 300000 });
  await ready(); await pg.waitForTimeout(1500);
  const R = {};
  const shot = async name => { await pg.waitForTimeout(4000); R[name] = await ev(() => { const bd = document.getElementById('hBadge').parentElement; return { bg: (bd.style.backgroundImage || '').slice(0, 30), key: bd._3d }; });
    await pg.screenshot({ path: `${OUT}/portrait_${name}.png`, clip: { x: 0, y: 0, width: 420, height: 130 }, timeout: 300000 }); };
  for (const job of JOBS) {
    await ev(async ([gen, job]) => { const p = G.player; if (G.sheet.p.gender !== gen) { G.sheet.p.gender = gen; await p.attachBody(); }
      if (G.sheet.p.job !== 'novice') { G.sheet.p.job = 'novice'; await p.attachBody(); }
      G.sheet.p.level = 11; G.sheet.book.grantPoints && G.sheet.book.grantPoints(); G.sheet.recalc(); G.sheet.chooseJob(job); }, [GEN, job]);
    await shot(job + '_after_change');
  }
  // 저장 → 다시 불러오기 (마지막 직업)
  await ev(() => G.autoSave()); await pg.reload();
  await click('불러오기'); await pg.waitForSelector('.window button:not([disabled])', { timeout: 60000 });
  await ev(() => [...document.querySelectorAll('.window button')].find(b => b.textContent.trim() === '불러오기' && !b.disabled).click()); await ready(); await shot(JOBS[JOBS.length - 1] + '_after_reload');
  console.log(JSON.stringify(R), 'errors', errs.slice(0, 4)); await b.close();
})();
