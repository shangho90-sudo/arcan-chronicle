// 메인 스토리 대화 장면(js/storyscene.js) 확인 (2026-11-15).
// 새 게임 → 촌장 대화 메뉴(예전 창) → [퀘스트] 첫 메인 → 장면(반신 초상·이름 패·타자기) → 넘기기 → 수락하기 → 퀘스트 받음·장면 닫힘 →
// 세 사람 대사(2장 ① 완료) → 뒷장(19장 ②·20장 ①, 이야기 보스 화자) → 서브 퀘스트·상점은 예전 창.  휴대폰은 화면을 터치로 넘김.
// Usage: (cd repo && python3 -m http.server 8813 &)  URL=http://localhost:8813/index.html SIZES=1280x720,390x844t NODE_PATH=$(npm root -g) node tools/browser-tests/storyscene.js
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/vn', URL = process.env.URL || 'http://localhost:8813/index.html'; fs.mkdirSync(OUT, { recursive: true });
const fails = [], errs = []; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails.push(m); };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const sz of (process.env.SIZES || '1280x720,390x844t').split(',')) {
    console.log('== ' + sz);
    const touch = sz.endsWith('t'), [W, H] = sz.replace('t', '').split('x').map(Number);
    const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
    const pg = await ctx.newPage(); errs.length = 0; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); if (/UICLOSE|ADV/.test(m.text())) console.log(m.text()); });
    const ev = (f, a) => pg.evaluate(f, a), shot = n => pg.screenshot({ path: `${OUT}/vn_${sz}_${n}.png`, timeout: 300000 });
    const S = 'button,[role=button],[aria-label]';
    const find = t => pg.waitForFunction(([S, t]) => [...document.querySelectorAll(S)].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), [S, t], { timeout: 300000 });
    const click = async t => { await find(t); await ev(([S, t]) => [...document.querySelectorAll(S)].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), [S, t]); await pg.waitForTimeout(500); };
    const inZone = id => pg.waitForFunction(id => window.G && G.inWorld && G.zone && G.zone.def.id === id && G.player && !G.loading && !G.input.block, id, { timeout: 400000 });
    // 넘기기: 휴대폰은 화면 위쪽 터치, PC는 Space(타자 중이면 줄 끝내기)
    const tapNext = async () => { if (touch) await pg.touchscreen.tap(W / 2, H * 0.3); else await pg.keyboard.press('Space'); await pg.waitForTimeout(350); };
    const goNext = async () => { await ev(() => G.story.typing && G.story.finishType()); await pg.waitForTimeout(120); await tapNext(); };   // 타자기가 끝났는지와 상관없이 정확히 다음 쪽
    const st = () => ev(() => { const s = G.story, el = document.querySelector('.vnscene'); if (!el) return null;
      const por = side => { const p = el.querySelector('.vn-por.' + side); return { who: p.dataset.who || null, shown: p.classList.contains('shown'), speak: p.classList.contains('speak'), listen: p.classList.contains('listen'), none: p.classList.contains('none'), src: (p.querySelector('img').getAttribute('src') || '').slice(0, 30) }; };
      return { i: s.i, n: s.pages.length, typing: s.typing, name: el.querySelector('.vn-nm').textContent, text: el.querySelector('.vn-text').textContent, end: el.querySelector('.vn-end').classList.contains('show'),
        btns: [...el.querySelectorAll('.vn-opts button')].map(b => b.textContent), left: por('left'), right: por('right'), block: G.input.block, hudHidden: getComputedStyle(document.querySelector('.layer.hud')).opacity === '0' }; });
    const portraits = () => pg.waitForFunction(() => { const el = document.querySelector('.vnscene'); return el && [...el.querySelectorAll('.vn-por')].every(p => !p.dataset.who || p.classList.contains('shown') || p.classList.contains('none')); }, null, { timeout: 240000, polling: 400 }).catch(() => {});
    const sceneOn = () => pg.waitForFunction(() => !!document.querySelector('.vnscene.on'), null, { timeout: 240000, polling: 400 }).catch(async e => { console.log('scene state', await ev(() => [G.ui.currentName, document.querySelector('.layer.windows').innerHTML.slice(0, 300)])); throw e; });
    const toEnd = async () => { for (let k = 0; k < 40; k++) { const s = await st(); if (!s || (s.end && !s.typing)) return s; await tapNext(); } return st(); };

    await pg.goto(URL, { timeout: 300000 }); await ev(() => localStorage.clear()); await pg.reload({ timeout: 300000 });
    await click('새 게임'); await click('모험 시작'); await pg.waitForSelector('.prologue.on', { timeout: 60000 }); await click('건너뛰기');
    await pg.waitForFunction(() => !document.querySelector('.prologue'), null, { timeout: 300000 }); await inZone('town');
    await pg.waitForTimeout(3000);

    // 1) 첫 메인 퀘스트: 촌장 대화 메뉴(예전 창) → [퀘스트] → 장면
    const giver = await ev(() => G.data.quests.q1_start.giver);
    await ev(g => { const n = G.zone.npcs.find(n => n.def.id === g); const p = G.player; p.teleport({ x: n.pos.x, z: n.pos.z - 2.4 }); p.body.place(p.pos); G.render.setFocus(p.pos, true); G.interact(n); }, giver);
    await pg.waitForTimeout(800);
    ok(await ev(() => G.ui.currentName === 'dialog' && !!document.querySelector('.window.dialog')), 'NPC 메뉴는 예전 대화창');
    // 느린 타자기(6자/초)로 시작 — SwiftShader·바쁜 기계에서는 보통 속도(42자/초)면 확인하기 전에 줄이 끝남
    await ev(() => import('./js/storyscene.js').then(m => { G._storyMod = m; G.story = new m.StoryScene(G); G.story.cps = 6; }));
    const qname = await ev(() => G.data.quests.q1_start.name);
    await click('[퀘스트] ' + qname);
    await sceneOn();
    if (process.env.DEBUG) await ev(() => { const c = G.ui.close.bind(G.ui); G.ui.close = (...a) => { console.log('UICLOSE ' + new Error().stack.split('\n').slice(1, 7).join(' | ')); return c(...a); }; });
    await pg.waitForTimeout(200);
    let s = await st();
    ok(s && s.typing && s.text.length < (await ev(() => G.story.pages[0].html.replace(/<[^>]*>/g, '').length)), `타자기: 처음엔 일부만 (${s && s.text.length}자)`);
    ok(s.block && await ev(() => document.querySelector('.storyopen') !== null), '장면 동안 게임 입력 막힘·HUD 숨김');
    ok(s.name === '하람', '이름 패 = 하람 (' + s.name + ')');
    await portraits(); s = await st();
    ok(s.right.who === giver && s.right.shown && s.right.speak, '오른쪽 = 촌장 반신(3D 렌더), 말하는 중 ' + JSON.stringify(s.right));
    ok(!s.left.who && !s.left.shown, '왼쪽 비어 있음 — 플레이어 초상은 안 나옴 ' + JSON.stringify(s.left));
    await shot('1_first_typing');
    await ev(() => { G.story.cps = 0.3; G.story.type(G.story.pages[G.story.i].html); }); await pg.waitForTimeout(150);   // 느린 타자기로 다시 시작(SwiftShader는 프레임이 느려 보통 속도면 누르기 전에 끝남)
    if (process.env.DEBUG) await ev(() => { const S = G.story, a = S.advance.bind(S); S.advance = () => { console.log('ADV ' + new Error().stack.split('\n').slice(2, 5).join(' | ')); return a(); }; addEventListener('keydown', e => console.log('ADV key ' + e.code + ' ' + e.eventPhase), true); });
    const i0 = (await st()).i; await tapNext(); s = await st(); ok(!s.typing && s.i === i0 && s.text.length > 5, '타자 중 한 번 누르면 줄만 끝남(쪽은 그대로) ' + JSON.stringify({ i0, i: s.i, n: s.n, typing: s.typing, len: s.text.length })); await ev(() => { G.story.cps = 42; });
    await pg.waitForTimeout(300); await tapNext(); s = await st(); ok(s.i === i0 + 1 || s.end, '다음 누르면 다음 쪽 ' + JSON.stringify({ i0, i: s.i, end: s.end }));
    await pg.waitForTimeout(300); await shot('2_first_line_done');
    s = await toEnd();
    ok(s.end && s.btns.join(',') === '수락하기,나중에', '끝 쪽: 수락하기/나중에 ' + s.btns);
    ok(await ev(() => /보상/.test(document.querySelector('.vn-reward').textContent)), '보상 표시');
    await shot('3_first_end');
    if (touch) { const bb = await pg.$('.vn-opts button'); const r = await bb.boundingBox(); await pg.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); } else await click('수락하기');
    await pg.waitForTimeout(800);
    ok(await ev(() => G.quests.stateOf(G.data.quests.q1_start) === 1 || G.profile.quests.some(q => q.id === 'q1_start')), '수락하기 → 퀘스트 받음');
    ok(await ev(() => !document.querySelector('.vnscene') && G.ui.currentName === 'dialog'), '장면 닫히고 NPC 메뉴로 돌아감');
    await ev(() => G.ui.close()); await pg.waitForTimeout(300);
    ok(await ev(() => !G.input.block && !document.querySelector('.storyopen')), '닫은 뒤 입력·HUD 복구');

    // 2) 세 사람 대사: 2장 ① 완료 대사(아스텔·카스티야·카일러스)
    await ev(() => { const q = G.data.quests.mq02a, n = G.data.npcs[q.turnIn]; G.questTalk(n, q, q.completeText, G.back(n)); });
    await sceneOn(); await portraits();
    s = await st(); ok(s.name === '아스텔' && s.right.who === 'astel' && !s.left.who, '아스텔 오른쪽, 플레이어 없음(여러 화자) ' + JSON.stringify([s.left.who, s.right.who]));
    await goNext(); await portraits(); s = await st();
    ok(s.name === '카스티야' && s.left.who === 'castilla' && s.left.speak && s.right.listen, '두 번째 화자 왼쪽에서 말함·아스텔 어둡게');
    await pg.waitForTimeout(400); await shot('4_two_speakers');
    await goNext(); await portraits(); s = await st();
    ok(s.name === '카일러스' && (s.left.who === 'kylus' || s.right.who === 'kylus') && s.left.who !== s.right.who, '세 번째 화자는 방금 말하지 않은 쪽을 바꿈 ' + JSON.stringify([s.left.who, s.right.who]));
    s = await toEnd(); ok(s.btns.join(',') === '돌아가기,대화 종료', '완료 대사 끝: 돌아가기/대화 종료');
    await pg.waitForTimeout(300); await shot('5_three_end');
    await click('대화 종료'); ok(await ev(() => !document.querySelector('.vnscene') && !G.ui.current), '대화 종료 → 닫힘');

    // 3) 뒷장: 19장 ② 받기(아스텔·그레이스 — 그레이스는 이야기 보스, 그림이 없으면 이름 패만) + 건너뛰기
    await ev(() => { const q = G.data.quests.mq19b, n = G.data.npcs[q.giver]; G.offerQuest(n, q); });
    await sceneOn(); await goNext(); await portraits(); s = await st();
    ok(s.name === '그레이스', '보스 화자 이름 ' + s.name + ' ' + JSON.stringify(s.left));
    await pg.waitForTimeout(400); await shot('6_ch19_grace');
    await click('건너뛰기'); s = await st(); ok(s.end && s.i === s.n - 1 && s.btns[0] === '수락하기', '건너뛰기 → 마지막 쪽 단추');
    await click('나중에'); await pg.waitForTimeout(400); await ev(() => G.ui.close());
    // 20장 ①: 케린(빌린 경비병 모델) + 서술 줄
    await ev(() => { const q = G.data.quests.mq20a, n = G.data.npcs[q.turnIn]; G.questTalk(n, q, q.completeText, G.back(n)); });
    await sceneOn(); await goNext(); s = await st();
    ok(await ev(() => document.querySelector('.vn-text').classList.contains('narr') && document.querySelector('.vn-box').classList.contains('noname')), '서술 줄: 이름 패 없음·가운데 기울임');
    await pg.waitForTimeout(400); await shot('7_narration');
    await click('건너뛰기'); await click('대화 종료');

    // 4) 서브 퀘스트·상점은 예전 창
    await ev(() => { const q = G.data.quests.qs07, n = G.data.npcs[q.giver]; G.offerQuest(n, q); }); await pg.waitForTimeout(500);
    ok(await ev(() => !document.querySelector('.vnscene') && G.ui.currentName === 'dialog'), '서브 퀘스트(qs07) = 예전 대화창');
    await shot('8_sub_old'); await ev(() => G.ui.close());
    await ev(() => { const n = Object.values(G.data.npcs).find(n => n.shop); G.openNpcMenu(n); }); await pg.waitForTimeout(500);
    ok(await ev(() => !document.querySelector('.vnscene') && G.ui.currentName === 'dialog'), '상점 NPC 메뉴 = 예전 대화창');
    await ev(() => G.ui.close());
    ok(errs.length === 0, '오류 없음 ' + errs.slice(0, 3).join(' / '));
    await ctx.close();
  }
  await b.close();
  console.log(fails.length ? 'FAILED ' + fails.length : 'ALL OK'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); console.error('page errors:', errs.slice(0, 8).join('\n')); process.exit(2); });
