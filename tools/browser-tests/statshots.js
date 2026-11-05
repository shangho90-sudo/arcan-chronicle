// 능력치 창 check: level up -> +3 points, open with P key / menu button, spend with the +1 button, stat changes, phone layout.
// Usage: SIZES=1448x1086,390x844t node tools/browser-tests/statshots.js -> OUT/st_<size>_*.png
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/stat'; fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  let bad = 0; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) bad++; };
  for (const sz of (process.env.SIZES || '1448x1086').split(',')) {
    const touch = sz.endsWith('t'), [W, H] = sz.replace('t', '').split('x').map(Number);
    const pg = await (await b.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch })).newPage(); const errs = [];
    pg.on('pageerror', e => errs.push(e.message));
    const ev = (f, a) => pg.evaluate(f, a), wait = ms => pg.waitForTimeout(ms);
    await pg.goto('http://localhost:8765/index.html?sim=2', { timeout: 300000 });
    const clickLabel = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)), t, { timeout: 300000 });
      await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)).click(), t); };
    await ev(() => localStorage.clear()); await clickLabel('새 게임'); await clickLabel('모험 시작');
    await pg.waitForFunction(() => window.G && G.inWorld && !G.loading, null, { timeout: 300000 });
    await ev(() => { const S = G.sheet; S.addExp(S.expToNext); S.addExp(S.expToNext); });
    ok(await ev(() => G.profile.apoints === 6 && G.profile.level === 3), 'Lv3 -> 6 points');
    ok(await ev(() => [...document.querySelectorAll('.toast')].some(t => t.textContent.includes('능력치 포인트 +3'))), 'level-up toast mentions the points');
    await ev(() => { G.ui.toasts.innerHTML = ''; [...document.querySelectorAll('.menubtns [data-a="stats"]')][0].click(); });
    await pg.waitForFunction(() => G.ui.currentName === 'stats', null, { timeout: 60000 }).catch(() => {});
    ok(await ev(() => G.ui.currentName === 'stats'), 'menu button opens the 능력치 window');
    const atk0 = await ev(() => G.sheet.final.atk);
    await ev(() => [...document.querySelectorAll('.atrow')][0].querySelector('.atbtns .btn').click()); await wait(300);
    ok(await ev(([a]) => G.profile.attr.str === 1 && G.profile.apoints === 5 && Math.abs(G.sheet.final.atk - a - 1.5) < 1e-6, [atk0]), '+1 on 힘 -> atk +1.5, 5 points left');
    await wait(500); await pg.screenshot({ path: `${OUT}/st_${sz}_window.png`, timeout: 300000 });
    if (!touch) { await ev(() => G.ui.close()); await pg.keyboard.press('KeyP'); await pg.waitForFunction(() => G.ui.currentName === 'stats', null, { timeout: 60000 }).catch(() => {}); ok(await ev(() => G.ui.currentName === 'stats'), 'P key opens it'); }
    await ev(() => G.ui.close()); await wait(300); await pg.screenshot({ path: `${OUT}/st_${sz}_hud.png`, timeout: 300000 });
    ok(!errs.length, 'no page errors ' + JSON.stringify(errs.slice(0, 3)));
    await pg.close();
  }
  await b.close(); console.log(bad ? 'FAILED ' + bad : 'ALL OK'); process.exit(bad ? 1 : 0);
})();
