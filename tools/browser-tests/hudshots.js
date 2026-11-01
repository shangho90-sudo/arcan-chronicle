// HUD layout screenshots (minimap top-right, HP/EXP/menu block bottom-centre) in the forest, for several screen sizes.
// Usage: SIZES=1280x800,390x844t,844x390t node tools/browser-tests/hudshots.js  -> OUT/hud_<size>.png  ('t' = touch device)
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/hud'; fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const sz of (process.env.SIZES || '1280x800').split(',')) {
    const touch = sz.endsWith('t'), [W, H] = sz.replace('t', '').split('x').map(Number);
    const pg = await (await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch })).newPage(); const errs = [];
    pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    const ev = (f, a) => pg.evaluate(f, a), wait = ms => pg.waitForTimeout(ms);
    await pg.goto((process.env.URL || 'http://localhost:8765/index.html') + '?sim=4');
    const clickLabel = async (t) => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[role=button],[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)), t, { timeout: 300000 });
      await ev(t => [...document.querySelectorAll('button,[role=button],[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)).click(), t); await wait(500); };
    await clickLabel('새 게임'); if (await pg.locator('button', { hasText: '확인' }).count()) await pg.locator('button', { hasText: '확인' }).first().click();
    await clickLabel('모험 시작');
    await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading, null, { timeout: 300000 });
    await ev(() => G.loadZone(window.ZONE || 'forest', 'from_town', false)); await pg.waitForFunction(() => !G.loading && G.zone && G.zone.def.id === 'forest', null, { timeout: 300000 });
    await ev(() => { const p = G.player; p.teleport({ x: -17, z: -19.5 }); G.render.setFocus(p.pos, true); G.ui.toasts.innerHTML = ''; });
    await wait(3000);
    await pg.screenshot({ path: `${OUT}/hud_${sz}.png`, timeout: 300000 });
    const boxes = await ev(() => Object.fromEntries(['.charpanel', '.minimap', '.botbar', '.tracker', '.actions', '.target'].map(s => { const e = document.querySelector(s); if (!e) return [s, null]; const r = e.getBoundingClientRect(); return [s, [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]]; })));
    console.log(sz, JSON.stringify(boxes), errs.slice(0, 5));
    await pg.close();
  }
  await b.close();
})();
