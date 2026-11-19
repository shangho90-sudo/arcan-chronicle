// 마스터에게 말 걸어 전직(2026-11-20 사용자 요청 — 직업 목록 창 대신): 견습생 Lv9 → '[전직] 약사로 전직' → 조건 안내 / Lv10 → 확인 대화 → '아니요'는 메뉴로 → '전직하기' → 약사
// → 같은 마스터(1차 = 약사)에게 2차 분기 '[전직] 양약사…' '[전직] 한약사…'. 다른 마스터에게는 전직 버튼 없음.
// Usage: (cd repo && python3 -m http.server 8941 &) URL=http://localhost:8941/index.html SIZES=1280x720,390x844t node tools/browser-tests/jobnpc.js
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/jobnpc', URL = process.env.URL || 'http://localhost:8941/index.html'; fs.mkdirSync(OUT, { recursive: true });
const fails = []; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails.push(m); };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const sz of (process.env.SIZES || '1280x720').split(',')) {
    console.log('== ' + sz); const touch = sz.endsWith('t'), [W, H] = sz.replace('t', '').split('x').map(Number);
    const pg = await (await b.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch })).newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    const ev = (f, a) => pg.evaluate(f, a), shot = n => pg.screenshot({ path: `${OUT}/${sz}_${n}.png`, timeout: 300000 });
    const S = 'button,[role=button],[aria-label]';
    const click = async t => { await pg.waitForFunction(([S, t]) => [...document.querySelectorAll(S)].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), [S, t], { timeout: 300000 }); await ev(([S, t]) => [...document.querySelectorAll(S)].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), [S, t]); await pg.waitForTimeout(500); };
    const btns = () => ev(() => [...document.querySelectorAll('.window.dialog .dopts button')].map(b => b.textContent.trim()));
    await pg.goto(URL, { timeout: 300000 }); await ev(() => localStorage.clear()); await pg.reload({ timeout: 300000 });
    await click('게임 시작 (새 게임)'); await click('모험 시작'); await pg.waitForSelector('.prologue.on', { timeout: 60000 }); await click('건너뛰기');
    await pg.waitForFunction(() => window.G && G.inWorld && G.zone && G.player && !G.loading && !G.input.block, null, { timeout: 400000 }); await pg.waitForTimeout(2000);
    const open = m => ev(m => G.openNpcMenu(G.data.npcs[m]), m).then(() => pg.waitForTimeout(500));
    await ev(() => { G.profile.level = 9; }); await open('master_pharmacist');
    let bs = await btns(); ok(bs[0] === '[전직] 약사로 전직' && !bs.includes('직업 상담'), '견습생 → 약사 마스터 메뉴 ' + JSON.stringify(bs));
    await click('[전직] 약사로 전직'); ok(/레벨 10 이상/.test(await ev(() => document.querySelector('.window.dialog .dtext').textContent)), 'Lv9: 조건 안내만'); await shot('1_lv9');
    await ev(() => { G.profile.level = 10; }); await open('master_pharmacist'); await click('[전직] 약사로 전직');
    ok(/전직하시겠습니까/.test(await ev(() => document.querySelector('.window.dialog .dtext').textContent)) && JSON.stringify(await btns()) === '["전직하기","아니요"]', '확인 대화'); await shot('2_confirm');
    await click('아니요'); ok((await btns())[0] === '[전직] 약사로 전직' && await ev(() => G.profile.job) === 'novice', '아니요 → 메뉴, 그대로 견습생');
    await click('[전직] 약사로 전직'); await click('전직하기'); await pg.waitForTimeout(1500);
    ok(await ev(() => G.profile.job) === 'pharmacist', '전직하기 → 약사'); await shot('3_done');
    await pg.waitForTimeout(5000); await ev(() => G.ui.current && G.ui.close()); await pg.waitForTimeout(300);
    await open('master_cook'); bs = await btns(); ok(!bs.some(t => t.startsWith('[전직]')), '다른 마스터는 전직 없음 ' + JSON.stringify(bs));
    await ev(() => G.ui.close()); await open('master_pharmacist'); bs = await btns(); ok(bs.filter(t => t.startsWith('[전직]')).length === 2, '약사 → 2차 분기 2개 ' + JSON.stringify(bs)); await shot('4_tier2');
    ok(errs.length === 0, '오류 없음 ' + errs.join(' | '));
  }
  await b.close(); console.log(fails.length ? 'FAILS ' + fails.length : 'ALL OK'); process.exit(fails.length ? 1 : 0);
})();
