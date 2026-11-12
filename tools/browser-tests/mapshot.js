// 세계 지도 창 캡처 + 지역 이름(큰 글씨)이 가려졌는지 출력. Usage: SIZE=1280x860 node tools/browser-tests/mapshot.js -> /tmp/mapshot/map_<size>.png
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/mapshot'; fs.mkdirSync(OUT, { recursive: true });
const SZ = process.env.SIZE || '1280x860', touch = SZ.endsWith('t'), [W, H] = SZ.replace('t', '').split('x').map(Number);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch })).newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto('http://localhost:8765/index.html');
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(() => localStorage.clear()); await click('새 게임'); await click('모험 시작'); await pg.waitForSelector('.prologue.on', { timeout: 60000 }); await click('건너뛰기');
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && !document.querySelector('.prologue'), null, { timeout: 300000 });
  await ev(() => { G.ui.toasts.innerHTML = ''; document.querySelector('.menubtns [data-a="map"]').click(); }); await pg.waitForTimeout(4000);
  const r = await ev(() => [...document.querySelectorAll('.wmregion')].map(t => [t.textContent, Math.round(+t.getAttribute('x')), Math.round(+t.getAttribute('y')), t.style.opacity || '1']));
  await pg.screenshot({ path: `${OUT}/map_${SZ}.png`, timeout: 300000 });
  console.log(JSON.stringify(r), 'errors', errs.slice(0, 3)); await b.close();
})();
