// 메인 퀘스트 NPC 표시 + 메인 퀘스트 진행 입장 조건 (2026-11-15).
// 새 게임 → 촌장 머리 위 금관 "!"·미니맵 금관 표시 → 받으면 대화 목표(쇠돌) 금관 "?" → 숲의 안개 골짜기 포털: 막히고 안내 →
// (테스트 훅으로 6장까지 진행) 같은 포털로 들어감 → 워프 안내인 목록(닫힌 마을 회색·이동 막힘) → 세계 지도(자물쇠·금별) →
// 닫힌 곳에 저장된 예전 저장 불러오기 → 아르칸 → 보통 진행(7장 ②까지, Lv10)으로 카이리온 길드 회관에서 1차 전직.
// Usage: (cd repo && python3 -m http.server 8811 &)  URL=http://localhost:8811/index.html SIZES=1280x720,390x844t NODE_PATH=$(npm root -g) node tools/browser-tests/gates.js
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/gate', URL = process.env.URL || 'http://localhost:8811/index.html'; fs.mkdirSync(OUT, { recursive: true });
const ONLY = process.env.ONLY || '';   // ONLY=oldsave: 예전 저장 장면만
const fails = []; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails.push(m); };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const sz of (process.env.SIZES || '1280x720,390x844t').split(',')) {
    console.log('== ' + sz);
    const touch = sz.endsWith('t'), [W, H] = sz.replace('t', '').split('x').map(Number);
    const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
    const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    const ev = (f, a) => pg.evaluate(f, a), shot = n => pg.screenshot({ path: `${OUT}/g_${sz}_${n}.png`, timeout: 300000 });
    const S = 'button,[role=button],[aria-label]';
    const find = t => pg.waitForFunction(([S, t]) => [...document.querySelectorAll(S)].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), [S, t], { timeout: 300000 });
    const click = async t => { await find(t); await ev(([S, t]) => [...document.querySelectorAll(S)].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), [S, t]); await pg.waitForTimeout(500); };
    const inZone = id => pg.waitForFunction(id => window.G && G.inWorld && G.zone && G.zone.def.id === id && G.player && !G.loading && !G.input.block, id, { timeout: 400000 });
    const near = id => ev(id => { const n = G.zone.npcs.find(n => n.def.id === id); if (!n) return false; const p = G.player; p.teleport({ x: n.pos.x, z: n.pos.z - 2.4 }); p.setFacing(0, 1); p.body.place(p.pos); G.render.setFocus(p.pos, true); return true; }, id);
    const toasts = () => ev(() => [...document.querySelectorAll('.toast, .toasts *')].map(t => t.textContent).join(' | '));
    // 테스트 훅: 메인 순서에서 `upto` 앞까지 모두(선행 서브 포함) 완료
    const progress = (upto, level) => ev(([upto, level]) => {
      const M = G.data.world.main, done = new Set(), add = id => { if (done.has(id)) return; for (const p of G.data.quests[id].prereq || []) add(p); done.add(id); };
      for (const id of M.order) { if (id === upto) break; add(id); }
      G.profile.quests = [...done].map(id => ({ id, state: 'completed', counts: G.data.quests[id].objectives.map(o => o.count) }));
      if (level) { G.sheet.p.level = level; G.sheet.recalc && G.sheet.recalc(); }
      G.ui.updateTracker && G.ui.updateTracker(); G.qworld && G.qworld.sync(); return done.size;
    }, [upto, level]);

    await pg.goto(URL, { timeout: 300000 }); await ev(() => localStorage.clear()); await pg.reload({ timeout: 300000 });
    await click('새 게임'); await click('모험 시작'); await pg.waitForSelector('.prologue.on', { timeout: 60000 }); await click('건너뛰기');
    await pg.waitForFunction(() => !document.querySelector('.prologue'), null, { timeout: 300000 }); await inZone('town');
    if (ONLY !== 'oldsave') {
    // 1) 새 게임: 첫 메인 퀘스트(q1_start)를 주는 촌장
    const giver = await ev(() => G.data.quests.q1_start.giver);
    ok(await ev(g => G.mainState(g) === 'avail' && /qmain/.test(G.questMark(g)), giver), `메인 퀘스트 주는 ${giver}: 금관 "!"`);
    await near(giver); await pg.waitForTimeout(4000);
    ok(await ev(() => !!document.querySelector('.plate .mark b.qmark.qmain')), '머리 위 금관 표시가 화면에 있음');
    ok(await ev(g => (G.ui.minimap.mainNpcs || []).includes(g), giver), '미니맵에 메인 퀘스트 NPC 표시 ' + JSON.stringify(await ev(() => G.ui.minimap.mainNpcs)));
    await shot('1_main_giver');
    // 2) 받으면: 대화 목표(쇠돌) 금관 "?", 촌장은 진행 중 표시
    await ev(() => G.quests.accept('q1_start')); await pg.waitForTimeout(600);
    ok(await ev(() => G.mainState('arcan_smith_boy') === 'talk' && /qmain/.test(G.questMark('arcan_smith_boy'))), '대화 목표 쇠돌: 금관 "?"');
    await near('arcan_smith_boy'); await pg.waitForTimeout(3000); await shot('2_talk_target');
    await ev(() => G.ui.showAreaMap()); await pg.waitForTimeout(2500);
    ok(await ev(() => /메인 퀘스트/.test(document.querySelector('.amlegend').innerText) && !!document.querySelector('.amq.main')), '지역 지도 범례 "메인 퀘스트" + 목록 금관 표시'); await shot('3_areamap');
    await ev(() => G.ui.close());
    // 3) 숲 → 안개 골짜기 포털: 닫힘 → 막히고 안내, 이동 안 함
    await ev(() => G.loadZone('forest', 'from_town')); await inZone('forest'); await pg.waitForTimeout(1500);
    const pt = await ev(() => G.zone.def.portals.find(p => p.targetZone === 'mist_valley'));
    const armed = () => pg.waitForFunction(() => G.zone.portalArmed, null, { timeout: 120000 });     // 포털 밖에서 한 번 갱신된 뒤에
    const step = async (x, z) => ev(([x, z]) => { const p = G.player; p.teleport({ x, z }); p.body.place(p.pos); G.render.setFocus(p.pos, true); }, [x, z]);
    await step(pt.pos[0] + 6, pt.pos[1]); await armed(); await step(pt.pos[0], pt.pos[1]);
    await pg.waitForFunction(() => [...document.querySelectorAll('.toast')].some(t => /안개 속 감시자/.test(t.textContent)), null, { timeout: 60000 }).catch(() => {});
    const t1 = await toasts();
    ok(await ev(() => G.zone.def.id === 'forest' && !G.loading), '닫힌 포털: 이동하지 않음');
    ok(/메인 퀘스트 6장 「안개 속 감시자 ①」을 진행해야 들어갈 수 있습니다/.test(t1), '닫힌 포털 안내: ' + t1.slice(0, 120));
    await shot('4_portal_blocked');
    // 4) 테스트 훅으로 6장까지 → 같은 포털로 들어감
    await progress('mq06a', 8); await step(pt.pos[0] + 6, pt.pos[1]); await armed(); await step(pt.pos[0], pt.pos[1]);
    await inZone('mist_valley'); ok(true, '6장 진행 뒤 같은 포털로 안개 골짜기에 들어감');
    ok(await ev(() => { const L = G.zone.def.level; return L[0] === 8 && L[1] === 11; }), '안개 골짜기 권장 Lv 8~11 ' + JSON.stringify(await ev(() => G.zone.def.level)));
    ok(await ev(() => G.zone.spawners.every(s => !s.def.level || (s.def.level >= 8 && s.def.level <= 12))), '안개 골짜기 몬스터 무리 Lv 8~12');
    await pg.waitForTimeout(2500); await shot('5_mist_valley');
    // 5) 워프 안내인: 가 본 마을이어도 메인 퀘스트로 닫히면 회색 + 이동 막힘
    await progress('q1_start', 1); await ev(() => { G.profile.towns = ['town', 'kairion_capital', 'baltern']; G.profile.gold = 1000; G.loadZone('town', 'start'); }); await inZone('town');
    await ev(() => { const n = G.zone.npcs.find(n => n.def.role === 'warp'); G.ui.showTownWarp(n.def); }); await pg.waitForTimeout(800);
    const rows = await ev(() => [...document.querySelectorAll('.window.townwarp .twrow')].map(r => ({ id: r.dataset.town, lock: r.dataset.lock || '', btn: !!r.querySelector('button'), text: r.innerText.replace(/\s+/g, ' ') })));
    const rk = rows.find(r => r.id === 'kairion_capital'), rb = rows.find(r => r.id === 'baltern');
    ok(rk && rk.lock === 'mq01a' && !rk.btn && /1장 「가을의 납품」 필요/.test(rk.text), '카이리온(가 봤지만 닫힘): ' + (rk && rk.text));
    ok(rb && rb.lock === 'mq07a' && !rb.btn, '발테른 닫힘: ' + (rb && rb.text));
    ok(await ev(() => G.townWarp('baltern') === false && G.zone.def.id === 'town'), '닫힌 마을로 직접 불러도 막힘'); await shot('6_townwarp');
    await ev(() => G.ui.close());
    // 6) 세계 지도: 닫힌 곳 자물쇠, 지금 메인 목적지 금별
    await ev(() => import('/js/worldmap.js').then(m => m.showWorldMap(G.ui))); await pg.waitForTimeout(2500);
    const wm = await ev(() => ({ locked: document.querySelectorAll('.wmnode.locked').length, goal: [...document.querySelectorAll('.wmnode.goal')].map(n => n.dataset.z), lockSvg: document.querySelectorAll('.wmnode.locked .wmlock').length }));
    ok(wm.locked > 40 && wm.lockSvg === wm.locked && wm.goal.length >= 1, '세계 지도 자물쇠 ' + JSON.stringify(wm));
    await ev(() => document.querySelector('.wmnode[data-z=mist_valley]').dispatchEvent(new MouseEvent('click', { bubbles: true }))); await pg.waitForTimeout(500);
    ok(await ev(() => /6장 「안개 속 감시자 ①」/.test(document.querySelector('.wminfotxt').innerText)), '정보 막대에 입장 조건'); await shot('7_worldmap');
    await ev(() => G.ui.close());
    // 7) 보통 진행(7장 ②까지 완료, Lv10): 왕도 가는 길 → 카이리온 → 길드 회관 마스터에게 전직
    await ev(() => G.ui.close()); await progress('mq07c', 10); await ev(() => G.quests.accept('mq07c'));
    await ev(() => G.loadZone('capital_road', 'from_town')); await inZone('capital_road'); await pg.waitForTimeout(800);
    const pk = await ev(() => G.zone.def.portals.find(p => p.targetZone === 'kairion_capital'));
    await step(pk.pos[0] + 5, pk.pos[1] + 5); await armed(); await step(pk.pos[0], pk.pos[1]); await inZone('kairion_capital');
    ok(true, '왕도 가는 길 포털로 카이리온에 들어감');
    const master = await ev(() => { const n = G.zone.npcs.find(n => n.def.role === 'jobmaster'); return n && n.def.id; });
    await near(master); await pg.waitForTimeout(3000);
    ok(await ev(m => G.mainState(m) === 'talk' && /qmain/.test(G.questMark(m)), master), '전직 목표: 마스터 ' + master + ' 금관 "?"');
    await ev(m => G.openNpcMenu(G.data.npcs[m]), master); await pg.waitForTimeout(600); await shot('9_master');
    await click('직업 상담'); await pg.waitForTimeout(600); await click('이 직업으로 전직'); await pg.waitForTimeout(1500);
    ok(await ev(() => G.profile.job !== 'novice'), '1차 전직 완료: ' + await ev(() => G.profile.job));
    ok(await ev(() => G.quests.stateOf(G.data.quests.mq07c) === 3), '7장 ③(전직) 보고 가능');
    await pg.waitForTimeout(3000); await shot('10_jobchanged');
    }
    // 8) 예전 저장: 닫힌 곳(서리 고원)에 저장 → 다시 열어 불러오면 아르칸 시작 지점
    await ev(() => { const p = JSON.parse(JSON.stringify(G.profile)); p.zone = 'frost_highland'; p.hasPos = true; p.posX = 0; p.posZ = 0; p.returnZone = 'baltern'; p.returnSpawn = 'revive'; p.quests = []; G.store.save(p); G.inWorld = false; });   // 페이지를 닫을 때 자동 저장이 덮어쓰지 않게
    await pg.reload({ timeout: 300000 }); await click('불러오기'); await pg.waitForSelector('.slotrow.auto .slotbtns button', { timeout: 300000 });
    await ev(() => document.querySelector('.slotrow.auto .slotbtns button').click()); await inZone('town');
    await pg.waitForFunction(() => [...document.querySelectorAll('.toast')].some(t => /아르칸 마을로 옮겼습니다/.test(t.textContent)), null, { timeout: 60000 }).catch(() => {});
    const t2 = await toasts();
    ok(await ev(() => G.profile.hasPos === false || G.zone.def.id === 'town'), '불러온 저장은 서리 고원이었음 → 지금 아르칸');
    ok(await ev(() => G.profile.zone === 'town' && G.profile.returnZone === 'town'), '닫힌 곳 저장 → 아르칸, 귀환 마을도 아르칸');
    ok(/아르칸 마을로 옮겼습니다/.test(t2), '옮긴 안내: ' + t2.slice(0, 160)); await pg.waitForTimeout(2000); await shot('11_oldsave');
    ok(errs.length === 0, 'page errors ' + JSON.stringify(errs.slice(0, 3))); await ctx.close();
  }
  console.log(fails.length ? 'FAILED ' + fails.length : 'all ok'); await b.close(); process.exit(fails.length ? 1 : 0);
})();
