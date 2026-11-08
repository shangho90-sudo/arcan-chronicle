// 휴대폰 세로 화면: 시작 화면(저장 없음/있음)·캐릭터 만들기 캡처. Usage: SIZES=390x844t,375x667t,430x932t node tools/browser-tests/portraitshots.js -> OUT/pt_<size>_*.png
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/pt'; fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const sz of (process.env.SIZES || '390x844t').split(',')) {
    const [W, H] = sz.replace('t', '').split('x').map(Number);
    const pg = await (await b.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true })).newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    const ev = (f, a) => pg.evaluate(f, a), shot = n => pg.screenshot({ path: `${OUT}/pt_${sz}_${n}.png`, timeout: 300000 });
    await pg.goto('http://localhost:8765/index.html', { timeout: 300000 });
    await ev(() => localStorage.clear()); await pg.reload({ timeout: 300000 });
    await pg.waitForSelector('.title-new', { timeout: 300000 }); await pg.waitForTimeout(1500); await shot('1_title_nosave');
    await ev(() => document.querySelector('.title-new').click()); await pg.waitForSelector('.create-start', { timeout: 60000 }); await pg.waitForTimeout(800); await shot('2_create');
    await ev(() => document.querySelector('.choice-f').click()); await pg.waitForTimeout(300); await shot('3_create_f');
    // a save so the title shows 불러오기 + the save line
    await ev(() => { const st = G.slots[0]; const { newProfile } = window.__core || {}; });
    await ev(() => document.querySelector('.create-back').click()); await pg.waitForSelector('.title-new', { timeout: 60000 });
    await ev(() => { localStorage.setItem('arcan_save_0', JSON.stringify({ version: 4, name: '카이', gender: 'm', level: 7, job: 'novice', zone: 'forest', saveTime: '2026. 11. 8. 오후 5:30:00', saveAt: Date.now() })); G.showTitleMenu(); });
    await pg.waitForTimeout(1200); await shot('4_title_save');
    const r = await ev(() => { const q = s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom), Math.round(r.left), Math.round(r.right)]; }; return { cont: q('.title-continue'), save: q('.title-save'), nw: q('.title-new'), vh: innerHeight, vw: innerWidth }; });
    console.log(sz, JSON.stringify(r), 'errors', errs);
  }
  await b.close();
})();
