// Quest window stays on screen and clear of the HUD while the viewport changes (phone rotation, window resize).
// Usage: node tools/browser-tests/questhud_resize.js [touch|mouse]  -> OUT/qr_<w>x<h>.png ; exits non-zero on failure
// (true fullscreen cannot be entered in headless Chromium: viewport changes stand in for it).
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/qh'; fs.mkdirSync(OUT, { recursive: true });
const touch = (process.argv[2] || 'touch') === 'touch';
const SIZES = touch ? [[844, 390], [390, 844], [915, 412], [412, 915], [844, 390]] : [[1280, 720], [800, 600], [1920, 1080], [1024, 768], [1366, 640]];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: SIZES[0][0], height: SIZES[0][1] }, hasTouch: touch, isMobile: touch });
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.addInitScript(() => { window.__fr = 0; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = f => raf(t => { window.__fr++; f(t); }); });
  const ev = (f, a) => pg.evaluate(f, a);
  const frames = async n => { const f0 = await ev(() => window.__fr); await pg.waitForFunction(([f0, n]) => window.__fr >= f0 + n, [f0, n], { timeout: 300000 }); };
  await pg.goto('http://localhost:8765/index.html?sim=2', { timeout: 300000 });
  const clickLabel = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)), t, { timeout: 300000 });
    await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)).click(), t); };
  await ev(() => localStorage.clear()); await clickLabel('새 게임'); await clickLabel('모험 시작');
  await pg.waitForFunction(() => window.G && G.inWorld && !G.loading, null, { timeout: 300000 });
  await ev(() => G.loadZone('forest', 'from_town', false)); await pg.waitForFunction(() => !G.loading && G.zone.def.id === 'forest', null, { timeout: 300000 });
  // stand next to a monster so the target bar is up as well
  await ev(() => { const p = G.player, m = G.zone.actors.find(a => a !== p && a.hp > 0 && a.def && !a.def.boss); p.teleport({ x: m.pos.x, z: m.pos.z - 1.6 }); G.render.setFocus(p.pos, true); G.input.press('attack'); });
  let fails = 0;
  for (const [w, h] of SIZES) {
    await pg.setViewportSize({ width: w, height: h }); await frames(4);
    const r = await ev(() => {
      const q = document.querySelector('.qhud'), qr = q.getBoundingClientRect(), hits = [];
      for (const s of ['.charpanel', '.feed .feeditem', '.minimap', '.botbar', '.actions .abtn', '.stickbase', '.target', '.prompt']) for (const e of document.querySelectorAll(s)) {
        const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') continue; const o = e.getBoundingClientRect(); if (!o.width) continue;
        if (Math.min(qr.right, o.right) - Math.max(qr.left, o.left) > 1 && Math.min(qr.bottom, o.bottom) - Math.max(qr.top, o.top) > 1) hits.push(s); }
      return { box: [qr.left, qr.top, qr.right, qr.bottom].map(Math.round), on: qr.left >= 0 && qr.top >= 0 && qr.right <= innerWidth && qr.bottom <= innerHeight, hits, scroll: q.querySelector('.qh-body').scrollHeight > q.querySelector('.qh-body').clientHeight };
    });
    const good = r.on && !r.hits.length; if (!good) fails++;
    console.log((good ? '  ok   ' : '  FAIL ') + `${w}x${h}`, JSON.stringify(r));
    await pg.screenshot({ path: `${OUT}/qr_${w}x${h}.png`, timeout: 300000 });
  }
  if (errs.length) { fails++; console.log('errors', errs); }
  await b.close(); console.log(fails ? 'FAILED ' + fails : 'ALL OK'); process.exit(fails ? 1 : 0);
})();
