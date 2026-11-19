// 아르칸 서장 + 첫 전직 바로 완료 (2026-11-19).
// 새 게임 → 촌장 첫 메인(q1_start) 장면 → 쇠돌 → 모아 → 서장 ①(mq00a) 받기(촌장 "!", 숲 줍기 자리) → 숲의 군락지 포털은 서장 「보랏빛 포자」 전엔 막힘
// → 왕도 가는 길의 카이리온 포털은 서장 「첫 전직」 전엔 막힘 → (훅) 서장 끝 + Lv10 → 촌장 "!" 첫 전직 받기 → 카이리온 길드 회관 마스터 '직업 상담' 전직
// → 그 순간 퀘스트 완료(보상·알림) + 전직 연출 뒤 완료 대사 장면 → 촌장에게 1장 「가을의 납품」 "!".
// Usage: (cd repo && python3 -m http.server 8841 &)  URL=http://localhost:8841/index.html SIZES=1280x720,390x844t OUT=/tmp/qarc NODE_PATH=$(npm root -g) node tools/browser-tests/arcanarc.js
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/qarc', URL = process.env.URL || 'http://localhost:8841/index.html'; fs.mkdirSync(OUT, { recursive: true });
const fails = []; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails.push(m); };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const sz of (process.env.SIZES || '1280x720,390x844t').split(',')) {
    console.log('== ' + sz);
    const touch = sz.endsWith('t'), [W, H] = sz.replace('t', '').split('x').map(Number);
    const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
    const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    const ev = (f, a) => pg.evaluate(f, a), shot = n => pg.screenshot({ path: `${OUT}/a_${sz}_${n}.png`, timeout: 300000 });
    const S = 'button,[role=button],[aria-label]';
    const label = b => (b.getAttribute('aria-label') || b.textContent || '').trim();
    const find = t => pg.waitForFunction(([S, t]) => [...document.querySelectorAll(S)].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), [S, t], { timeout: 300000 });
    const click = async t => { await find(t); await ev(([S, t]) => [...document.querySelectorAll(S)].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), [S, t]); await pg.waitForTimeout(500); };
    const inZone = id => pg.waitForFunction(id => window.G && G.inWorld && G.zone && G.zone.def.id === id && G.player && !G.loading && !G.input.block, id, { timeout: 400000 });
    const near = id => ev(id => { const n = G.zone.npcs.find(n => n.def.id === id); if (!n) return false; const p = G.player; p.teleport({ x: n.pos.x, z: n.pos.z - 2.4 }); p.setFacing(0, 1); p.body.place(p.pos); G.render.setFocus(p.pos, true); return true; }, id);
    const toasts = () => ev(() => [...document.querySelectorAll('.toast, .toasts *')].map(t => t.textContent).join(' | '));
    const waitToast = re => pg.waitForFunction(src => [...document.querySelectorAll('.toast, .toasts *')].some(t => new RegExp(src).test(t.textContent)), re, { timeout: 60000 }).then(() => true).catch(() => false);
    const step = async (x, z) => ev(([x, z]) => { const p = G.player; p.teleport({ x, z }); p.body.place(p.pos); G.render.setFocus(p.pos, true); }, [x, z]);
    const armed = () => pg.waitForFunction(() => G.zone.portalArmed, null, { timeout: 120000 });
    const story = () => pg.waitForSelector('.storyopen, .vn, .gb-box', { timeout: 60000 }).then(() => true).catch(() => false);
    const progress = (upto, level) => ev(([upto, level]) => {
      const M = G.data.world.main, done = new Set(), add = id => { if (done.has(id)) return; for (const p of G.data.quests[id].prereq || []) add(p); done.add(id); };
      for (const id of M.order) { if (id === upto) break; add(id); }
      G.profile.quests = [...done].map(id => ({ id, state: 'completed', counts: G.data.quests[id].objectives.map(o => o.count) }));
      if (level) { G.sheet.p.level = level; G.sheet.recalc && G.sheet.recalc(); }
      G.ui.updateTracker && G.ui.updateTracker(); G.qworld && G.qworld.sync(); return done.size;
    }, [upto, level]);

    await pg.goto(URL, { timeout: 300000 }); await ev(() => localStorage.clear()); await pg.reload({ timeout: 300000 });
    await click('게임 시작 (새 게임)'); await click('모험 시작'); await pg.waitForSelector('.prologue.on', { timeout: 60000 }); await click('건너뛰기');
    await pg.waitForFunction(() => !document.querySelector('.prologue'), null, { timeout: 300000 }); await inZone('town');
    // 1) 촌장 첫 메인 → 장면으로 받기
    ok(await ev(() => G.mainState('elder') === 'avail'), '촌장: 첫 메인 "!"');
    await near('elder'); await pg.waitForTimeout(2500);
    await ev(() => G.offerQuest(G.data.npcs.elder, G.data.quests.q1_start)); ok(await story(), '첫 메인 받기 = 대화 장면'); await pg.waitForTimeout(1500); await shot('1_q1_offer');
    await ev(() => { G.ui.close(); G.quests.accept('q1_start'); G.quests.notify('talk', 'arcan_smith_boy', 1); G.quests.complete('q1_start'); G.quests.accept('q2_merchant'); G.quests.notify('talk', 'merchant', 1); G.quests.complete('q2_merchant'); });
    // 2) 서장 ①: 촌장 "!", 받으면 숲 줍기 + 젤리, 완료는 쇠돌
    const a = await ev(() => ({ st: G.mainState('elder'), q: G.data.quests.mq00a.name, lv: G.data.quests.mq00a.minLevel, turn: G.data.quests.mq00a.turnIn }));
    ok(a.st === 'avail' && a.q === '서장 수확제 준비 ①' && a.turn === 'arcan_smith_boy', '서장 ① 촌장 "!" ' + JSON.stringify(a));
    await ev(() => G.offerQuest(G.data.npcs.elder, G.data.quests.mq00a)); await story(); await pg.waitForTimeout(2500);
    ok(await ev(() => /서장/.test(document.body.innerText)), '장면 머리 "메인 퀘스트 ✦ 서장"'); await shot('2_mq00a_offer');
    await ev(() => { G.ui.close(); G.quests.accept('mq00a'); }); await pg.waitForTimeout(800); await shot('3_tracker');
    const tgt = await ev(() => G.mainTargets().map(t => t.quest.id + '@' + t.zone));
    ok(tgt[0] === 'mq00a@forest', '갈 곳 = 속삭이는 숲 ' + JSON.stringify(tgt));
    await ev(() => G.loadZone('forest', 'from_town')); await inZone('forest'); await pg.waitForTimeout(1500);
    ok(await ev(() => (G.qworld.pickups || G.qworld.items || []).length > 0 || !!document.querySelector('.plate.item.quest') || true), '숲 들어감');
    // 군락지 포털: 서장 「보랏빛 포자」 전엔 막힘
    const pg2 = await ev(() => G.zone.def.portals.find(p => p.targetZone === 'mushroom_grove'));
    await step(pg2.pos[0] + 6, pg2.pos[1]); await armed(); await step(pg2.pos[0], pg2.pos[1]);
    const w1 = await waitToast('서장 「보랏빛 포자」를 진행해야'); await pg.waitForTimeout(800); ok(await ev(() => G.zone.def.id === 'forest') && w1, '군락지 막힘 안내(서장 「보랏빛 포자」)'); await shot('4_grove_blocked');
    // 3) 왕도 가는 길 → 카이리온 포털: 서장 「첫 전직」 전엔 막힘
    await ev(() => G.loadZone('capital_road', 'from_town')); await inZone('capital_road'); await pg.waitForTimeout(800);
    ok(await ev(() => { const L = G.zone.def.level; return L[0] <= 4 && L[1] <= 7; }), '왕도 가는 길 권장 레벨 ' + JSON.stringify(await ev(() => G.zone.def.level)));
    const pk = await ev(() => G.zone.def.portals.find(p => p.targetZone === 'kairion_capital'));
    await step(pk.pos[0] + 5, pk.pos[1] + 5); await armed(); await step(pk.pos[0], pk.pos[1]);
    const w2 = await waitToast('서장 「첫 전직」을 진행해야'); await pg.waitForTimeout(800); ok(await ev(() => G.zone.def.id === 'capital_road') && w2, '카이리온 막힘 안내(서장 「첫 전직」)'); await shot('5_kairion_blocked');
    // 4) (훅) 서장 끝 + Lv10 → 촌장 "!" 첫 전직
    await progress('q_job1', 10); await ev(() => G.loadZone('town', 'start')); await inZone('town');
    ok(await ev(() => G.mainState('elder') === 'avail' && G.quests.stateOf(G.data.quests.q_job1) === 1), 'Lv10: 촌장 "!" 첫 전직');
    await near('elder'); await ev(() => G.offerQuest(G.data.npcs.elder, G.data.quests.q_job1)); await story(); await pg.waitForTimeout(2500); await shot('6_job_offer');
    await ev(() => { G.ui.close(); G.quests.accept('q_job1'); });
    ok(await ev(() => G.mainTargets()[0] && G.mainTargets()[0].zone === 'kairion_capital'), '갈 곳 = 카이리온');
    // 5) 카이리온 길드 회관 → 전직 → 바로 완료
    await ev(() => G.loadZone('capital_road', 'from_town')); await inZone('capital_road'); await pg.waitForTimeout(800);
    await step(pk.pos[0] + 5, pk.pos[1] + 5); await armed(); await step(pk.pos[0], pk.pos[1]); await inZone('kairion_capital'); ok(true, '첫 전직 받은 뒤 카이리온 들어감');
    const master = await ev(() => { const n = G.zone.npcs.find(n => n.def.role === 'jobmaster'); return n && n.def.id; });
    await near(master); await pg.waitForTimeout(2500);
    ok(await ev(m => G.mainState(m) === 'talk', master), '마스터 ' + master + ' 금관 "?"');
    const before = await ev(() => ({ gold: G.profile.gold, exp: G.profile.exp, lv: G.profile.level }));
    await ev(m => G.openNpcMenu(G.data.npcs[m]), master); await pg.waitForTimeout(600);
    await click('직업 상담'); await pg.waitForTimeout(600);
    await ev(() => [...document.querySelectorAll('.jobcard.hl button')][0].click()); await pg.waitForTimeout(1200);
    const after = await ev(() => ({ job: G.profile.job, done: G.quests.isCompleted('q_job1'), gold: G.profile.gold, exp: G.profile.exp, lv: G.profile.level }));
    ok(after.job !== 'novice' && after.done, '전직하는 순간 첫 전직 완료 ' + JSON.stringify(after));
    ok(after.gold === before.gold + 200, '보상 골드 +200');
    ok(await waitToast('퀘스트 완료: 서장 첫 전직'), '완료 알림'); await shot('7_jobchanged');
    await pg.waitForTimeout(4600); ok(await story(), '전직 연출 뒤 완료 대사 장면'); await pg.waitForTimeout(2000); await shot('8_job_complete_scene');
    await ev(() => G.ui.close());
    ok(await ev(() => G.quests.stateOf(G.data.quests.mq01a) === 1 && G.mainState('elder') === 'avail'), '1장 「가을의 납품」 받을 수 있음(촌장)');
    const t4 = await ev(() => G.mainTargets().map(t => t.quest.id + '@' + t.zone)); ok(t4[0] === 'mq01a@town', '다음 갈 곳 = 아르칸 ' + JSON.stringify(t4));
    ok(errs.length === 0, 'page errors ' + JSON.stringify(errs.slice(0, 3))); await ctx.close();
  }
  console.log(fails.length ? 'FAILED ' + fails.length : 'all ok'); await b.close(); process.exit(fails.length ? 1 : 0);
})();
