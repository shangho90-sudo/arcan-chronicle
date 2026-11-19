// 대화 목표 대사(objective talkText) 확인 (2026-11-19 '첫 퀘스트 받아서 쇠돌에게 가면 아무 말도 안 해'): 새 게임 → q1_start 받음 → 쇠돌에게 말 걸기
// → 쇠돌의 퀘스트 대사가 장면으로 → 끝 쪽 '계속' → 쇠돌 메뉴(상점) → 퀘스트 목표 완료 → 두 번째 말 걸기는 평소 메뉴.
// Usage: (cd repo && python3 -m http.server 8931 &) URL=http://localhost:8931/index.html SIZES=1280x720,390x844t node tools/browser-tests/talktext.js
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/talktext', URL = process.env.URL || 'http://localhost:8931/index.html'; fs.mkdirSync(OUT, { recursive: true });
const fails = []; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails.push(m); };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const sz of (process.env.SIZES || '1280x720,390x844t').split(',')) {
    console.log('== ' + sz); const touch = sz.endsWith('t'), [W, H] = sz.replace('t', '').split('x').map(Number);
    const pg = await (await b.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch })).newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    const ev = (f, a) => pg.evaluate(f, a), shot = n => pg.screenshot({ path: `${OUT}/${sz}_${n}.png`, timeout: 300000 });
    const S = 'button,[role=button],[aria-label]';
    const click = async t => { await pg.waitForFunction(([S, t]) => [...document.querySelectorAll(S)].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), [S, t], { timeout: 300000 }); await ev(([S, t]) => [...document.querySelectorAll(S)].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), [S, t]); await pg.waitForTimeout(500); };
    await pg.goto(URL, { timeout: 300000 }); await ev(() => localStorage.clear()); await pg.reload({ timeout: 300000 });
    await click('게임 시작 (새 게임)'); await click('모험 시작'); await pg.waitForSelector('.prologue.on', { timeout: 60000 }); await click('건너뛰기');
    await pg.waitForFunction(() => window.G && G.inWorld && G.zone && G.zone.def.id === 'town' && G.player && !G.loading && !G.input.block, null, { timeout: 400000 }); await pg.waitForTimeout(2500);
    await ev(() => G.quests.accept('q1_start'));
    const talk = () => ev(() => { const n = G.zone.npcs.find(n => n.def.id === 'arcan_smith_boy'); const p = G.player; p.teleport({ x: n.pos.x, z: n.pos.z - 2.4 }); p.body.place(p.pos); G.render.setFocus(p.pos, true); G.interact(n); });
    await talk();
    await pg.waitForFunction(() => !!document.querySelector('.vnscene.on'), null, { timeout: 240000, polling: 400 });
    await pg.waitForTimeout(1500);
    const s1 = await ev(() => ({ name: document.querySelector('.vnscene .vn-nm').textContent, n: G.story.pages.length }));
    ok(s1.name === '쇠돌' && s1.n >= 3, '쇠돌 대사 장면 ' + JSON.stringify(s1)); await shot('1_scene');
    ok(await ev(() => { const q = G.data.quests.q1_start, pr = G.profile.quests.find(p => p.id === 'q1_start'); return G.quests.current(q, 0, pr) >= 1; }), '대화 목표 완료');
    await pg.waitForTimeout(600); await click('건너뛰기'); await ev(() => G.story.typing && G.story.finishType()); await pg.waitForTimeout(800);
    await pg.waitForTimeout(500); await shot('2_end');
    await click('계속'); await pg.waitForTimeout(800);
    ok(await ev(() => G.ui.currentName === 'dialog' && [...document.querySelectorAll('.window.dialog button')].some(b => b.textContent.trim() === '상점')), '계속 → 쇠돌 메뉴(상점)'); await shot('3_menu');
    await ev(() => G.ui.close()); await pg.waitForTimeout(400); await talk(); await pg.waitForTimeout(1200);
    ok(await ev(() => G.ui.currentName === 'dialog' && !document.querySelector('.vnscene.on')), '두 번째는 평소 메뉴');
    ok(errs.length === 0, '오류 없음 ' + errs.join(' | '));
  }
  await b.close(); console.log(fails.length ? 'FAILS ' + fails.length : 'ALL OK'); process.exit(fails.length ? 1 : 0);
})();
