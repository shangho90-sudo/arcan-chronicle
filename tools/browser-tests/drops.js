// 땅에 떨어진 아이템 확인 (2026-11-15): 퀘스트 줍기(속삭이는 숲 mq05a 병든 이끼)·몬스터 전리품(장비·재료·물약)·여러 개 한꺼번에·
// 이름표(.plate.item)·빛 표시, 줍기와 퀘스트 진행이 그대로인지.
// Usage: TAG=before|after SIZE=1280x720|390x844t URL=http://localhost:8814/index.html NODE_PATH=$(npm root -g) node tools/browser-tests/drops.js
//   -> OUT/<TAG>_<SIZE>_{quest,quest_zoom,loot,loot_zoom,many,many_zoom}.png + 결과 JSON(이름표 수·퀘스트 진행·가방 수·콘솔 오류)
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/drops'; fs.mkdirSync(OUT, { recursive: true });
const URL = process.env.URL || 'http://localhost:8814/index.html', TAG = process.env.TAG || 'after';
const SIZE = process.env.SIZE || '1280x720', TOUCH = SIZE.endsWith('t'), [VW, VH] = SIZE.replace('t', '').split('x').map(Number);
const ZOOM = +(process.env.ZOOM || 2.4);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: VW, height: VH }, hasTouch: TOUCH, isMobile: TOUCH })).newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const ev = (f, a) => pg.evaluate(f, a), shot = async n => { await pg.screenshot({ path: `${OUT}/${TAG}_${SIZE}_${n}.png`, timeout: 300000 }); };
  await pg.goto(URL);
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(() => localStorage.clear()); await click('새 게임'); await click('모험 시작'); await pg.waitForSelector('.prologue.on', { timeout: 60000 }); await click('건너뛰기');
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && !document.querySelector('.prologue'), null, { timeout: 300000 });
  await pg.waitForTimeout(1000);
  await ev(() => {
    window.T = {
      done(ids) { for (const id of ids) { const P = G.profile, q = G.data.quests[id]; const e = P.quests.find(x => x.id === id); if (e) e.state = 'completed'; else P.quests.push({ id, state: 'completed', counts: q.objectives.map(o => o.count) }); } },
      upTo(id) { const L = G.data.questList.filter(q => q.category === 'main'); const order = ['q1_start', 'q2_merchant', ...L.filter(q => /^mq/.test(q.id)).map(q => q.id)]; this.done(order.slice(0, order.indexOf(id)).concat(['q3_slime', 'q4_spore', 'q6_golem', 'q7_boss'])); },
      prog(id) { const q = G.data.quests[id]; return q.objectives.map((o, i) => G.quests.current(q, i) + '/' + o.count).join(' '); },
      zoom(z) { const c = G.render.cam; c.zoom = z; c.updateProjectionMatrix(); },
      labels() { return [...document.querySelectorAll('.plate.item')].filter(p => getComputedStyle(p).display !== 'none' && +getComputedStyle(p).opacity > 0.05).map(p => p.textContent.trim()); },
      quiet() { for (const a of G.zone.actors) if (a.faction === 'monster' && a.pos && Math.hypot(a.pos.x - G.player.pos.x, a.pos.z - G.player.pos.z) < 30) { a.takeDamage({ amount: 1e8, noMiss: true }); } },
    };
  });
  const R = { tag: TAG, size: SIZE };
  // 1) 속삭이는 숲 퀘스트 줍기 (5장 ① 병든 이끼)
  await ev(async () => { T.upTo('mq05a'); G.dev.level(8); G.quests.accept('mq05a'); await G.loadZone('forest', 'from_town', false); await new Promise(r => setTimeout(r, 400)); await G.qworld.sync(); });
  await pg.waitForTimeout(1500);
  R.questPickups = await ev(() => G.zone.things.filter(t => t.key && t.key.startsWith('mq05a')).length);
  // 숲 들머리(마을에서 온 자리) 열린 땅으로 가장 가까운 줍기 하나를 옮겨 놓고(무작위 자리는 나무 아래일 수 있음) 3.4 m 떨어져 봄
  await ev(() => {
    const P = G.player.pos, L = G.zone.things.filter(t => t.key && t.key.startsWith('mq05a'));
    const t = L.sort((a, b) => Math.hypot(a.pos.x - P.x, a.pos.z - P.z) - Math.hypot(b.pos.x - P.x, b.pos.z - P.z))[0]; window.QP = t;
    let best = null; for (let k = 0; k < 24 && !best; k++) { const a = k * 0.9, r = 3.4 + (k >> 3); const x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r; if (!G.zone.geo.blocked(x, z, 0.8) && z < P.z) best = { x, z }; }
    best = best || { x: P.x + 1.5, z: P.z - 3 }; t.pos = G.zone.geo.ground(best.x, best.z);
    G.render.setFocus(G.player.pos, true); T.quiet();
  });
  await pg.waitForTimeout(2500); R.questLabels = await ev(() => T.labels()); await shot('quest');
  await ev(z => { T.zoom(z); G.render.setFocus(QP.pos, true); }, ZOOM); await pg.waitForTimeout(1200); await shot('quest_zoom'); await ev(() => T.zoom(1));
  // 2) 몬스터 전리품: 장비(유봉·갑옷·장신구)·재료·물약
  await ev(() => {
    const P = G.player.pos, at = (dx, dz) => ({ x: P.x + dx, y: P.y, z: P.z + dz });
    G.player.teleport({ x: P.x, z: P.z }); window.LOOT0 = G.zone.things.length;
    const L = [['w_pestle_g6', -2.6, -2.4], ['a_armor_g4', 0, -3.0], ['ac_g3', 2.6, -2.4], ['m_herb', -3.0, 0.4], ['m_wolf_fang', 3.0, 0.4], ['c_potion_m', 0, 3.0]];
    for (const [id, dx, dz] of L) G.zone.dropLoot(id, 1, at(dx, dz));
    for (const t of G.zone.things.slice(LOOT0)) t.life = 1e6;
    G.render.setFocus(G.player.pos, true);
  });
  await pg.waitForTimeout(2200); R.lootLabels = await ev(() => T.labels()); await shot('loot');
  await ev(z => { T.zoom(z); G.render.setFocus(G.player.pos, true); }, ZOOM); await pg.waitForTimeout(1200); await shot('loot_zoom'); await ev(() => T.zoom(1));
  // 3) 여러 개 한꺼번에 (한 무리를 잡은 뒤처럼 14개 몰림)
  await ev(() => {
    const P = G.player.pos, ids = ['m_herb', 'm_spore', 'm_jelly', 'c_potion_s', 'm_fox_fur', 'm_wolf_fang', 'm_boar_tusk', 'c_potion_m', 'w_pestle_g3', 'a_armor_g2', 'm_herb', 'm_spore', 'ac_g1', 'm_moss_stone'];
    ids.forEach((id, i) => { const a = i * 2.4, r = 2.6 + (i % 3) * 0.6; G.zone.dropLoot(id, 1, { x: P.x + 5 + Math.cos(a) * r * 0.6, y: P.y, z: P.z - 4 + Math.sin(a) * r * 0.45 }); });
    for (const t of G.zone.things) if (!t.key) t.life = 1e6;
  });
  await pg.waitForTimeout(2200); R.manyLabels = await ev(() => T.labels()); await shot('many');
  await ev(z => { T.zoom(z * 0.8); G.render.setFocus({ x: G.player.pos.x + 4, y: G.player.pos.y, z: G.player.pos.z - 3 }, true); }, ZOOM); await pg.waitForTimeout(1200); await shot('many_zoom'); await ev(() => T.zoom(1));
  // 4) 줍기: 퀘스트 진행·가방 수·땅의 물건이 사라지는지
  R.before = await ev(() => ({ prog: T.prog('mq05a'), moss: G.player.sheet.bag.count('qi_poison_sample'), herb: G.player.sheet.bag.count('m_herb'), things: G.zone.things.length }));
  await ev(() => { G.player.teleport({ x: QP.pos.x, z: QP.pos.z }); G.render.setFocus(G.player.pos, true); });
  await pg.waitForTimeout(1500);
  await ev(() => { const h = G.zone.things.find(t => t.id === 'm_herb' && !t.dead); window.HP = h; G.player.teleport({ x: h.pos.x, z: h.pos.z }); });
  await pg.waitForTimeout(1500);
  R.after = await ev(() => ({ prog: T.prog('mq05a'), moss: G.player.sheet.bag.count('qi_poison_sample'), herb: G.player.sheet.bag.count('m_herb'), things: G.zone.things.length, questDead: !!QP.dead, herbDead: !!HP.dead, plates: document.querySelectorAll('.plate.item').length }));
  R.errs = errs;
  console.log(JSON.stringify(R, null, 1));
  fs.writeFileSync(`${OUT}/${TAG}_${SIZE}.json`, JSON.stringify(R, null, 1));
  await b.close();
})();
