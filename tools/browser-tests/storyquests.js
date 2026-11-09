// 메인·서브 퀘스트 런타임 확인 (tools/quests/story.py + js/questworld.js):
//  이야기 NPC 배치, 퀘스트 보스 등장·처치, 패배 이벤트(yieldAt), 버티기(surviveSec), 줍기(gather), 퀘스트 전용 드롭, 완료.
// Usage: node tools/browser-tests/storyquests.js  -> OUT/story_*.png, 결과 로그
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/storyq'; fs.mkdirSync(OUT, { recursive: true });
const URL = process.env.URL || 'http://localhost:8765/index.html';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: 960, height: 600 } })).newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error' || /questworld|creature|npc model/.test(m.text())) errs.push('console: ' + m.text()); });
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(URL);
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(() => localStorage.clear()); await click('새 게임'); await click('모험 시작'); await pg.waitForSelector('.prologue.on', { timeout: 60000 }); await click('건너뛰기');
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && !document.querySelector('.prologue'), null, { timeout: 300000 });
  await pg.waitForTimeout(1500);
  const log = (...a) => console.log(...a);
  // helpers in page
  await ev(() => {
    window.T = {
      done(ids) { for (const id of ids) { const P = G.profile; const q = G.data.quests[id]; const e = P.quests.find(x => x.id === id); if (e) e.state = 'completed'; else P.quests.push({ id, state: 'completed', counts: q.objectives.map(o => o.count) }); } },
      upTo(id) { const L = G.data.questList.filter(q => q.category === 'main'); const order = ['q1_start', 'q2_merchant', ...L.filter(q => /^mq/.test(q.id)).map(q => q.id)]; const i = order.indexOf(id); this.done(order.slice(0, i).concat(['q3_slime', 'q4_spore', 'q6_golem', 'q7_boss'])); },
      async go(z, sp) { await G.loadZone(z, sp, false); await new Promise(r => setTimeout(r, 300)); },
      zoneNpcs() { return G.zone.npcs.map(n => n.def.id); },
      boss(id) { return G.zone.actors.find(a => a.def && a.def.id === id && !a.dead); },
      state(id) { return G.quests.stateOf(G.data.quests[id]); },
      prog(id) { const q = G.data.quests[id]; return q.objectives.map((o, i) => G.quests.current(q, i) + '/' + o.count).join(' '); },
    };
  });
  const R = {};
  // 1) 1장: 보스 등장 + 처치 + 완료 확인
  await ev(async () => { T.done(['q1_start', 'q2_merchant']); G.dev.level(4); G.quests.accept('mq01a'); await T.go('capital_road', 'from_town'); });
  R.ch1_boss = await ev(() => !!T.boss('qb_boar_lord'));
  await ev(() => { const m = T.boss('qb_boar_lord'); G.player.teleport({ x: m.pos.x + 2.5, z: m.pos.z }); G.render.setFocus(G.player.pos, true); });
  await pg.waitForTimeout(1500); await pg.screenshot({ path: OUT + '/story_boss_boar.png', timeout: 300000 }); console.log(JSON.stringify(R));
  await ev(() => { const m = T.boss('qb_boar_lord'); m.takeDamage({ amount: 1e7, noMiss: true, source: G.player }); for (let i = 0; i < 6; i++) G.quests.notify('kill', 'mon_mole', 1); });
  R.ch1_prog = await ev(() => T.prog('mq01a'));
  // 2) 이야기 NPC: 2장 사냥터에 아스텔
  await ev(async () => { G.quests.complete('mq01a'); G.quests.accept('mq02a'); await T.go('kairion_hunt', 'from_kairion_capital'); });
  await pg.waitForTimeout(800);
  R.ch2_npcs = await ev(() => T.zoneNpcs());
  await ev(() => { const a = G.zone.npcs.find(n => n.def.id === 'astel'); if (a) { G.player.teleport({ x: a.pos.x, z: a.pos.z + 2.5 }); G.player.setFacing(0, -1); G.render.setFocus(G.player.pos, true); } });
  await pg.waitForTimeout(1500); await pg.screenshot({ path: OUT + '/story_astel_hunt.png', timeout: 300000 }); console.log(JSON.stringify(R));
  // 3) 줍기: 2장 ② 검은 핏자국
  await ev(async () => { G.quests.notify('talk', 'astel', 1); G.quests.complete('mq02a'); G.quests.accept('mq02b'); await G.qworld.sync(); });
  R.gather_pickups = await ev(() => G.zone.things.filter(t => t.key && t.key.startsWith('mq02b')).length);
  await ev(() => { const t = G.zone.things.find(t => t.key && t.key.startsWith('mq02b')); G.player.teleport({ x: t.pos.x, z: t.pos.z }); G.render.setFocus(G.player.pos, true); });
  await pg.waitForTimeout(1200);
  R.gather_after = await ev(() => T.prog('mq02b'));
  await pg.screenshot({ path: OUT + '/story_gather.png', timeout: 300000 }); console.log(JSON.stringify(R));
  // 4) 패배 이벤트: 3장 ② 로데릭 (yieldAt 0.5)
  await ev(async () => { T.upTo('mq03b'); G.dev.level(6); G.quests.accept('mq03b'); await T.go('kairion_hills', 'from_kairion_capital'); });
  R.yield = await ev(() => { const m = T.boss('qb_roderick'); if (!m) return 'no boss'; const hp0 = m.hp; m.takeDamage({ amount: m.maxHp * 0.3, noMiss: true, source: G.player }); const mid = [m.hp, m.dead]; m.takeDamage({ amount: 1e7, noMiss: true, source: G.player }); return { hp0, mid, after: [m.hp, m.dead, m.yielded], prog: T.prog('mq03b'), state: T.state('mq03b') }; });
  // 5) 버티기: 19장 ② 그레이스 (surviveSec 30)
  await ev(async () => { T.upTo('mq19b'); G.dev.level(27); G.quests.accept('mq19b'); await T.go('capital_plain', 'from_kairion_capital'); });
  R.survive = await ev(async () => { const m = T.boss('qb_grace_1'); if (!m) return 'no boss'; m.takeDamage({ amount: 1e7, noMiss: true, source: G.player }); const alive = !m.dead && !m.yielded; m.aggro = true; m.surviveT = 29.5; for (let i = 0; i < 40; i++) G.step(1 / 30, false); return { aliveAfterHugeHit: alive, prog: T.prog('mq19b'), yielded: !!m.yielded }; });
  // 6) 퀘스트 전용 드롭: 6장 ① 검은 깃털 (바위산 고갯길)
  await ev(async () => { T.upTo('mq06a'); G.dev.level(9); G.quests.accept('mq06a'); await T.go('baltern_pass', 'from_mist_valley'); });
  R.drop = await ev(async () => { const { Monster } = await import('./js/actors.js'); const md = G.data.monsters['mon_hawk']; let n = 0; for (let i = 0; i < 12; i++) { const m = new Monster(G.zone, md, G.player.pos, G.player.pos, 3); G.zone.actors.push(m); await m.attachBody(); m.takeDamage({ amount: 1e7, noMiss: true, source: G.player }); n++; } const loot = G.zone.things.filter(t => t.id === 'qi_black_feather').length; return { killed: n, featherLoot: loot, prog: T.prog('mq06a') }; });
  // 7) 사이드: 서리 고원 사냥꾼 배치 (qs31) + 요새 NPC (qs43)
  await ev(async () => { T.done(['qs29', 'qs30']); await T.go('frost_highland', 'from_valley'); });
  R.highland_npcs = await ev(() => T.zoneNpcs());
  // 8) 마지막 장 보스 등장
  await ev(async () => { T.upTo('mq40a'); G.dev.level(50); G.quests.accept('mq40a'); await T.go('abyss_bridge', 'from_zirat_abyss_rim'); });
  R.final_boss = await ev(() => { const m = T.boss('qb_sabnak_grace'); return m ? { lv: m.level, hp: m.maxHp, name: m.name } : null; });
  await ev(() => { const m = T.boss('qb_sabnak_grace'); if (m) { G.player.teleport({ x: m.pos.x - 5, z: m.pos.z - 3 }); G.render.setFocus(G.player.pos, true); } });
  await pg.waitForTimeout(2500); await pg.screenshot({ path: OUT + '/story_final_boss.png', timeout: 300000 }); console.log(JSON.stringify(R));
  // quest window
  await ev(() => { G.ui.showQuests && G.ui.showQuests(); }); await pg.waitForTimeout(600); await pg.screenshot({ path: OUT + '/story_questwin.png', timeout: 300000 }); console.log(JSON.stringify(R));
  console.log(JSON.stringify(R, null, 1));
  console.log('errors', errs.slice(0, 8));
  await b.close();
})();
