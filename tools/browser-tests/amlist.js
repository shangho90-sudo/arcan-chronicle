// 지역 지도 오른쪽 아래 목록(필드 = 몬스터 종류 그림·이름·레벨, 마을 = NPC 그림·이름) + 마을 키패드(귀환 버튼 자리·주아체 숫자) 확인.
// Usage: SIZES=1280x720,390x844t node tools/browser-tests/amlist.js -> OUT/amlist_<town|forest|pad>_<size>.png
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/amlist'; fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const sz of (process.env.SIZES || '1280x720,390x844t').split(',')) {
    const touch = sz.endsWith('t'), [W, H] = sz.replace('t', '').split('x').map(Number);
    const pg = await (await b.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch })).newPage(); const errs = [];
    pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    const ev = (f, a) => pg.evaluate(f, a);
    await pg.goto('http://localhost:8765/index.html');
    const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
    await ev(() => localStorage.clear()); await click('새 게임'); await click('모험 시작'); await pg.waitForSelector('.prologue.on', { timeout: 60000 }); await click('건너뛰기');
    const ready = () => pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.zone && !document.querySelector('.prologue'), null, { timeout: 300000 });
    await ready(); await pg.waitForTimeout(1500);
    const R = {};
    R.pad = await ev(() => { const r = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width)]; };
      return { recall: r('.abtn.recall'), potion: r('.abtn.potion'), font: getComputedStyle(document.querySelector('.abtn.potion .cdt')).fontFamily }; });
    await pg.screenshot({ path: `${OUT}/amlist_pad_${sz}.png`, clip: { x: Math.max(0, W - 400), y: Math.max(0, H - 380), width: Math.min(W, 400), height: Math.min(H, 380) }, timeout: 300000 });
    const shot = async name => {
      await ev(() => G.ui.showAreaMap()); await pg.waitForTimeout(6000);
      R[name] = await ev(() => [...document.querySelectorAll('.amitem')].map(e => e.querySelector('.amname').textContent + (e.querySelector('.amthumb.on') ? '' : ' (그림 없음)')));
      await pg.screenshot({ path: `${OUT}/amlist_${name}_${sz}.png`, timeout: 300000 }); await ev(() => G.ui.close());
    };
    await shot('town');
    await ev(() => G.travel('forest')); await pg.waitForTimeout(800); await ready(); await pg.waitForTimeout(2500);
    await shot('forest');
    console.log(sz, JSON.stringify(R), 'errors', errs.slice(0, 4)); await pg.context().close();
  }
  await b.close();
})();
