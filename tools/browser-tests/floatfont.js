// 스킬 사용 뒤 머리 위 문구(.float) 글꼴 확인: 아드레날린 주사 문구 두 줄을 띄워 캡처. Usage: node tools/browser-tests/floatfont.js -> /tmp/floatfont/float.png
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/floatfont'; fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: 1100, height: 700 } })).newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto('http://localhost:8765/index.html');
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(() => localStorage.clear()); await click('새 게임'); await click('모험 시작'); await pg.waitForSelector('.prologue.on', { timeout: 60000 }); await click('건너뛰기');
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && !document.querySelector('.prologue'), null, { timeout: 300000 });
  await pg.waitForTimeout(1500); await ev(() => document.fonts.load('20px Jua'));
  await ev(() => { const p = G.player.pos; G.ui.floatText(p, '공격 속도 증가', '#ffb060'); G.ui.floatText(p, '이동 속도 증가', '#8fd8ff'); G.ui.floatText(p, '상태이상 면역', '#9fd0ff'); });
  await pg.waitForTimeout(900);
  const r = await ev(() => [...document.querySelectorAll('.float')].map(e => [e.textContent, getComputedStyle(e).fontFamily.split(',')[0], document.fonts.check('20px Jua')]));
  await pg.screenshot({ path: `${OUT}/float.png`, clip: { x: 300, y: 120, width: 500, height: 360 }, timeout: 300000 });
  console.log(JSON.stringify(r), 'errors', errs.slice(0, 3)); await b.close();
})();
