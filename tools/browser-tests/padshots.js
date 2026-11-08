// 휴대폰 이동 패드(유리 원판 + 금테 + 별 장식) 화면 확인: 가만히 / 끌어서 움직이는 중.
// Usage: SIZES=390x844t,844x390t node tools/browser-tests/padshots.js -> OUT/pad_<size>_{idle,drag}.png
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/pad'; fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const sz of (process.env.SIZES || '390x844t').split(',')) {
    const touch = sz.endsWith('t'), [W, H] = sz.replace('t', '').split('x').map(Number);
    const pg = await (await b.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch, deviceScaleFactor: +(process.env.DPR || 1) })).newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    const ev = (f, a) => pg.evaluate(f, a);
    await pg.goto('http://localhost:8765/index.html');
    const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
    await ev(() => localStorage.clear()); await click('새 게임'); await click('모험 시작'); await pg.waitForSelector('.prologue.on', { timeout: 60000 }); await click('건너뛰기');
    await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && !document.querySelector('.prologue'), null, { timeout: 300000 });
    await ev(() => G.loadZone('forest', 'from_town')); await pg.waitForFunction(() => G.zone && G.zone.def.id === 'forest' && !G.loading, null, { timeout: 300000 });
    await pg.waitForTimeout(2500);
    const r = await ev(() => { const e = document.querySelector('.stickbase').getBoundingClientRect(); return { x: e.x + e.width / 2, y: e.y + e.height / 2 }; });
    const clip = { x: 0, y: Math.max(0, H - Math.min(H, 420)), width: W, height: Math.min(H, 420) };
    await pg.screenshot({ path: `${OUT}/pad_${sz}_idle.png`, clip, timeout: 300000 });
    await pg.mouse.move(r.x, r.y); await pg.mouse.down(); await pg.mouse.move(r.x + 50, r.y - 40, { steps: 5 }); await pg.waitForTimeout(500);
    const st = await ev(() => ({ ...G.input.stick }));
    await pg.screenshot({ path: `${OUT}/pad_${sz}_drag.png`, clip, timeout: 300000 });
    await pg.mouse.up();
    console.log(sz, 'stick while dragging', JSON.stringify(st), 'errors', errs);
  }
  await b.close();
})();
