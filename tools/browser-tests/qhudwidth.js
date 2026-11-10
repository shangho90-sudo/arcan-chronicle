// 퀘스트 창 가로 = 미니맵 가로 확인: 화면 크기별로 두 창의 좌우 끝을 재고 오른쪽 위를 캡처. Usage: node tools/browser-tests/qhudwidth.js -> OUT/qhud_<tag>_<W>x<H>.png
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/qhud', TAG = process.env.TAG || 'after'; fs.mkdirSync(OUT, { recursive: true });
const SIZES = (process.env.SIZES || '1280x720,1920x1080,880x700,390x844').split(',').map(s => s.split('x').map(Number));
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: SIZES[0][0], height: SIZES[0][1] } })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto('http://localhost:8765/index.html');
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(() => localStorage.clear()); await click('새 게임'); await click('모험 시작'); await pg.waitForSelector('.prologue.on', { timeout: 60000 }); await click('건너뛰기');
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && !document.querySelector('.prologue'), null, { timeout: 300000 });
  for (const [w, h] of SIZES) {
    await pg.setViewportSize({ width: w, height: h }); await pg.waitForTimeout(1500);
    const r = await ev(() => { const o = {}; for (const s of ['.minimap', '.qhud']) { const c = document.querySelector(s).getBoundingClientRect(); o[s] = [Math.round(c.left), Math.round(c.right), Math.round(c.width), Math.round(c.top), Math.round(c.bottom)]; } return o; });
    console.log(`${w}x${h}`, JSON.stringify(r));
    const m = r['.minimap'], q = r['.qhud'], x0 = Math.max(0, Math.min(m[0], q[0]) - 30);
    await pg.screenshot({ path: `${OUT}/qhud_${TAG}_${w}x${h}.png`, clip: { x: x0, y: 0, width: w - x0, height: Math.min(h, Math.max(m[4], q[4]) + 20) }, timeout: 300000 });
  }
  console.log('errors', errs.slice(0, 5)); await b.close();
})();
