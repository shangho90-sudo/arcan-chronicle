// 저장 칸: 일시정지(설정) → 저장하기 → 저장 1, 타이틀 '불러오기' → 저장 칸 목록 → 저장 1 이어하기.
// Usage: SIZES=1280x720,390x844t node tools/browser-tests/saveslots.js -> OUT/ss_<size>_*.png
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/ss'; fs.mkdirSync(OUT, { recursive: true });
const fails = []; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails.push(m); };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const sz of (process.env.SIZES || '1280x720').split(',')) {
    console.log('== ' + sz);
    const touch = sz.endsWith('t'), [W, H] = sz.replace('t', '').split('x').map(Number);
    const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
    const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    const ev = (f, a) => pg.evaluate(f, a), shot = n => pg.screenshot({ path: `${OUT}/ss_${sz}_${n}.png`, timeout: 300000 });
    const S = 'button,[role=button],[aria-label]';
    const find = t => pg.waitForFunction(([S, t]) => [...document.querySelectorAll(S)].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), [S, t], { timeout: 300000 });
    const click = async (t, n = 0) => { await find(t); await ev(([S, t, n]) => [...document.querySelectorAll(S)].filter(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t)[n].click(), [S, t, n]); await pg.waitForTimeout(500); };
    await pg.goto('http://localhost:8765/index.html?sim=2', { timeout: 300000 });
    await ev(() => localStorage.clear()); await pg.reload({ timeout: 300000 });
    await find('새 게임'); await pg.waitForTimeout(800); await shot('0_title_empty');
    ok(await ev(() => document.querySelector('.title-continue').disabled), 'no saves: 불러오기 disabled');
    await click('새 게임'); await click('모험 시작');
    await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading, null, { timeout: 300000 });
    await ev(() => { G.profile.gold = 777; G.player.sheet && (G.player.sheet.p.level = 3); });
    await ev(() => G.ui.showPause()); await pg.waitForTimeout(400);
    await click('저장하기'); await pg.waitForTimeout(400); await shot('1_savewin');
    ok(await ev(() => G.paused === true), 'game stays paused in the save window');
    await click('저장', 0); await pg.waitForTimeout(400); await shot('2_saved');
    const st = await ev(() => ({ s1: !!localStorage.getItem('arcan_save_1'), auto: !!localStorage.getItem('arcan_save_0'), rows: [...document.querySelectorAll('.slotrow .slotmain')].length }));
    ok(st.s1 && st.auto && st.rows === 1, 'slot 1 + auto written ' + JSON.stringify(st));
    // change progress, save into slot 2, then overwrite asks first
    await ev(() => { G.profile.gold = 1234; }); await click('저장', 0); // first empty = slot 2
    await click('덮어쓰기', 0); const q = await ev(() => document.querySelector('.window.confirm') && document.querySelector('.window.confirm').innerText);
    ok(q && q.includes('덮어쓸까요'), 'overwrite asks first'); await shot('3_overwrite'); await click('취소');
    await click('뒤로'); ok(await ev(() => G.ui.currentName === 'pause'), 'back to the pause menu');
    await click('타이틀로');
    await find('불러오기'); await pg.waitForTimeout(1500); await shot('4_title');
    ok(!(await ev(() => document.querySelector('.title-continue').disabled)), 'title: 불러오기 enabled');
    await click('불러오기'); await pg.waitForTimeout(600); await shot('5_loadwin');
    const rows = await ev(() => [...document.querySelectorAll('.slotrow')].map(r => r.innerText.replace(/\s+/g, ' ')));
    console.log('  ', JSON.stringify(rows));
    ok(rows.length === 6 && rows[0].includes('자동 저장') && rows[1].includes('저장 1') && rows[3].includes('비어 있음'), 'load list: auto + 5 slots');
    await click('불러오기', 1);   // slot 1 (index 0 = 자동 저장)
    await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading, null, { timeout: 300000 });
    const g = await ev(() => G.profile.gold); ok(g === 777, 'slot 1 progress restored (gold ' + g + ')');
    ok(!errs.length, 'no page errors ' + JSON.stringify(errs));
    await ctx.close();
  }
  await b.close(); if (fails.length) { console.log('FAILED', fails); process.exit(1); }
})();
