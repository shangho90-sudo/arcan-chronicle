// 미니맵의 퀘스트 NPC 초록 "?" 표시 + 미니맵을 눌러 여는 지역 전체 지도(확대·축소·이동).
// Usage: SIZES=1280x720,390x844t node tools/browser-tests/areamap.js -> OUT/am_<size>_*.png
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/am'; fs.mkdirSync(OUT, { recursive: true });
const fails = []; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails.push(m); };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const sz of (process.env.SIZES || '1280x720').split(',')) {
    console.log('== ' + sz);
    const touch = sz.endsWith('t'), [W, H] = sz.replace('t', '').split('x').map(Number);
    const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
    const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    const ev = (f, a) => pg.evaluate(f, a), shot = (n, clip) => pg.screenshot({ path: `${OUT}/am_${sz}_${n}.png`, timeout: 300000, clip });
    const S = 'button,[role=button],[aria-label]';
    const click = async t => { await pg.waitForFunction(([S, t]) => [...document.querySelectorAll(S)].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), [S, t], { timeout: 300000 });
      await ev(([S, t]) => [...document.querySelectorAll(S)].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), [S, t]); await pg.waitForTimeout(400); };
    await pg.goto('http://localhost:8765/index.html', { timeout: 300000 });
    await ev(() => localStorage.clear()); await pg.reload({ timeout: 300000 });
    await click('새 게임'); await click('모험 시작'); await pg.waitForSelector('.prologue.on', { timeout: 60000 }); await click('건너뛰기');
    await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && !document.querySelector('.prologue'), null, { timeout: 300000 });
    await pg.waitForTimeout(2500);
    const qs = await ev(() => G.zone.npcs.map(n => n.def.name + ':' + G.questState(n.def.id)));
    console.log('  npc quest states', JSON.stringify(qs));
    ok(qs.some(s => /:(avail|ready)$/.test(s)), 'some town NPC has a quest (green ? on the minimap)');
    const r = await ev(() => { const e = document.querySelector('.minimap').getBoundingClientRect(); return { x: e.x, y: e.y, width: e.width, height: e.height }; });
    await shot('1_minimap', { x: Math.max(0, r.x - 10), y: Math.max(0, r.y - 10), width: Math.min(W - Math.max(0, r.x - 10), r.width + 20), height: r.height + 20 });
    await ev(() => document.querySelector('#hMap').click()); await pg.waitForTimeout(1500);
    ok(await ev(() => G.ui.currentName === 'areamap'), 'clicking the minimap opens the area map');
    await shot('2_full');
    await click('확대'); await click('확대'); await pg.waitForTimeout(800); await shot('3_zoom');
    const v1 = await ev(() => ({ ...G.ui.amView }));
    // drag to pan
    const c = await ev(() => { const e = document.querySelector('.amcanvas').getBoundingClientRect(); return { x: e.x + e.width / 2, y: e.y + e.height / 2 }; });
    await pg.mouse.move(c.x, c.y); await pg.mouse.down(); await pg.mouse.move(c.x - 120, c.y + 40, { steps: 6 }); await pg.mouse.up(); await pg.waitForTimeout(600);
    const v2 = await ev(() => ({ ...G.ui.amView }));
    ok(v1.zoom > 2 && (v2.x !== v1.x || v2.z !== v1.z), 'zoom ' + v1.zoom.toFixed(2) + ' + drag pans ' + JSON.stringify([v1.x.toFixed(1), v1.z.toFixed(1), v2.x.toFixed(1), v2.z.toFixed(1)]));
    await click('전체 보기'); await pg.waitForTimeout(500);
    ok(await ev(() => G.ui.amView.zoom === 1), '전체 보기 resets to the whole area');
    // a field
    await ev(() => G.ui.close()); await ev(() => G.loadZone('forest', 'from_town')); await pg.waitForFunction(() => G.zone && G.zone.def.id === 'forest' && !G.loading, null, { timeout: 300000 }); await pg.waitForTimeout(3000);
    await ev(() => G.ui.showAreaMap()); await pg.waitForTimeout(1500); await shot('4_forest');
    ok(!errs.length, 'no page errors ' + JSON.stringify(errs));
    await ctx.close();
  }
  await b.close(); if (fails.length) { console.log('FAILED', fails); process.exit(1); }
})();
