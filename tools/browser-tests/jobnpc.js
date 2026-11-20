// 마스터에게 말 걸어 전직(2026-11-20 사용자 요청 — 직업 목록 창 대신): 견습생 Lv9 → '[전직] 약사로 전직' → 조건 안내 / Lv10 → 확인 대화 → '아니요'는 메뉴로 → '전직하기' → 약사
// → 다른 1차 마스터에게는 전직 버튼 없음. 2026-11-20: 1차 마스터(약사)는 2차 분기를 내밀지 않고 2차 마스터 위치만 안내 →
// Lv30 + 메인 22장(mq22a) 진행 중: 2차 마스터 머리 위 표시·갈 곳(카이리온·루미에르) → 루미에르로 이동(테스트만 lockOf 끔) →
// 음악가 마스터 하율(다른 갈래)은 전직 없음 → 한약사 마스터 운학 '[전직] 한약사로 전직' → 시험 전엔 조건 안내 → 시험 완료 → 확인 → 한약사.
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
    await ev(() => G.ui.close()); await open('master_pharmacist'); bs = await btns(); const txt = () => ev(() => document.querySelector('.window.dialog .dtext').textContent);
    ok(!bs.some(t => t.startsWith('[전직]')), '약사 → 1차 마스터는 2차 분기를 내밀지 않음 ' + JSON.stringify(bs));
    ok(/2차 전직은 각 마스터에게/.test(await txt()) && /세린/.test(await txt()) && /운학/.test(await txt()), '1차 마스터: 2차 마스터 안내 — ' + (await txt()).slice(-90)); await shot('4_master1');
    await ev(() => G.ui.close());
    // Lv30 + mq22a 진행 중 (선행은 완료로)
    await ev(() => { const Q = G.quests, done = new Set(); const add = id => { if (done.has(id)) return; for (const p of G.data.quests[id].prereq || []) add(p); done.add(id); }; for (const p of G.data.quests.mq22a.prereq) add(p);
      G.profile.quests = [...done].map(id => ({ id, state: 'completed', counts: [] })); G.profile.quests.push({ id: 'mq22a', state: 'active', counts: [0, 0] }); G.profile.level = 30; G.sheet.recalc(); G.profile.ui.track = 'mq22a'; });
    await pg.waitForTimeout(500); await ev(() => { G.ui.qprev = null; G.ui.qflash = null; G.ui.renderQuestHud(true); });   // 퀘스트 상태를 한꺼번에 바꿔서 생기는 '시작 안내 완료' 반짝임은 지움(불러오기와 같게) await pg.waitForTimeout(300);
    const ms = await ev(() => Object.fromEntries(['master2_western_pharmacist', 'master2_herbalist', 'master2_chef', 'master2_musician', 'master_pharmacist'].map(id => [id, G.mainState(id)])));
    ok(ms.master2_western_pharmacist === 'talk' && ms.master2_herbalist === 'talk' && ms.master2_chef === '' && ms.master2_musician === '' && ms.master_pharmacist === '', '메인 표시 = 약사 갈래 2차 마스터만 ' + JSON.stringify(ms));
    const tg = await ev(() => G.mainTargets().map(t => [t.quest.id, t.zone, t.zones]));
    ok(tg[0] && tg[0][0] === 'mq22a' && JSON.stringify(tg[0][2]) === '["kairion_capital","lumiere"]', '갈 곳 = 카이리온·루미에르 ' + JSON.stringify(tg));
    const hud = await ev(() => (document.querySelector('.qhud') || {}).textContent || ''); ok(/카이리온 왕도 또는 루미에르 신전/.test(hud) && /2차 전직 마스터/.test(hud), '퀘스트 창 갈 곳: ' + hud.slice(0, 160)); await shot('5_hud');
    await ev(() => { G.lockOf = () => null; }); await ev(() => G.travel('lumiere')); await pg.waitForTimeout(800);
    await pg.waitForFunction(() => G.zone && G.zone.def.id === 'lumiere' && !G.loading, null, { timeout: 400000 }); await pg.waitForTimeout(2500);
    const here = await ev(() => G.zone.npcs.filter(n => /^master2_/.test(n.def.id)).map(n => n.def.id).sort()); ok(JSON.stringify(here) === '["master2_herbalist","master2_musician"]', '루미에르에 운학·하율 ' + JSON.stringify(here));
    // 운학 쪽으로 다가가 화면에 함께 담기
    await ev(() => { const n = G.zone.npcs.find(n => n.def.id === 'master2_herbalist'); G.player.pos.x = n.pos.x + 1.6; G.player.pos.z = n.pos.z + 2.2; }); await pg.waitForTimeout(1500); await shot('6_herbalist_field');
    await open('master2_musician'); bs = await btns(); ok(!bs.some(t => t.startsWith('[전직]')) && /예술가만/.test(await txt()), '다른 갈래 마스터(하율): 전직 없음 + 안내 ' + JSON.stringify(bs)); await shot('7_other');
    await ev(() => G.ui.close()); await open('master2_herbalist'); bs = await btns();
    ok(bs[0] === '[전직] 한약사로 전직' && bs.some(t => /한약사 전직 시험/.test(t)), '운학 메뉴 ' + JSON.stringify(bs)); await shot('8_master2_menu');
    await click('[전직] 한약사로 전직'); ok(/전직 시험을 먼저/.test(await txt()), '시험 전: 조건 안내');
    await ev(() => { G.ui.close(); G.profile.quests.push({ id: 'qt_herbalist', state: 'completed', counts: [1, 10, 30] }); }); await open('master2_herbalist'); await click('[전직] 한약사로 전직');
    ok(/정말 한약사로 전직하시겠습니까/.test(await txt()) && JSON.stringify(await btns()) === '["전직하기","아니요"]', '2차 확인 대화'); await shot('9_master2_confirm');
    await click('전직하기'); await pg.waitForTimeout(1500); ok(await ev(() => G.profile.job) === 'herbalist', '전직하기 → 한약사'); await shot('10_herbalist');
    await pg.waitForTimeout(5000); await ev(() => G.ui.current && G.ui.close()); await open('master2_herbalist'); bs = await btns(); ok(!bs.some(t => t.startsWith('[전직]')), '한약사가 된 뒤엔 전직 버튼 없음');
    ok(errs.length === 0, '오류 없음 ' + errs.join(' | '));
  }
  await b.close(); console.log(fails.length ? 'FAILS ' + fails.length : 'ALL OK'); process.exit(fails.length ? 1 : 0);
})();
