// 메인 퀘스트 입장 조건 + 필드 권장 레벨 (2026-11-15, tools/quests/gates.py → world.py --write).  Run: node tests/gates.test.mjs
// - 메인 단계를 처음부터 끝까지 차례로 받으며, 그 단계가 쓰는 모든 지역(주는/완료 NPC, 대화·처치·줍기·방문 목표, 퀘스트 보스,
//   목표 몬스터가 사는 곳, 2차 전직 시험 사냥터)이 열려 있고 아르칸에서 열린 지역만 지나 갈 수 있는지(막힘 없음)
// - 처음부터 열린 곳, Lv10까지 아르칸 서장, 카이리온은 서장 「첫 전직」부터(2026-11-19), 닫힌 곳의 안내 문구, 마을 워프 차단
// - 메인 퀘스트 순서대로 필드 권장 레벨이 줄지 않고, 여는 단계의 예상 레벨과 맞으며, 몬스터 무리 레벨이 범위 안
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
globalThis.window = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
const { GameData, newProfile, migrate, SAVE_VERSION, zoneLock, warpBlock, questCategory, josa } = await import('../js/core.js');
const J = n => JSON.parse(readFileSync(new URL('../assets/data/' + n, import.meta.url), 'utf8'));
const files = {}; for (const f of ['config', 'levels', 'jobs', 'skills', 'skills2', 'items', 'monsters', 'quests', 'npcs', 'zones']) files[f] = J(f + '.json');
const d = new GameData(files); let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }, eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const full = z => z.file ? Object.assign({}, z, J(z.file)) : z;
const Z = Object.fromEntries(Object.values(d.zones).map(z => [z.id, full(z)]));
const M = d.world.main; ok(M && M.order.length > 80 && M.steps, '메인 단계 표');

// 처음부터 열린 곳 / 모든 지역에 여는 단계가 있음
for (const id of ['town', 'forest', 'capital_road']) ok(!d.zones[id].unlock, id + ' 처음부터 열림');
for (const z of Object.values(d.zones)) if (z.unlock) ok(d.quests[z.unlock] && M.order.includes(z.unlock), z.id + ' 여는 단계 ' + z.unlock);
eq(Object.values(d.zones).filter(z => !z.unlock).map(z => z.id).sort(), ['capital_road', 'forest', 'town'], '열린 곳은 세 곳뿐');

// 포털 그래프 / 몬스터 사는 곳
const graph = {}; for (const z of Object.values(Z)) graph[z.id] = new Set((z.portals || []).map(p => p.targetZone));
const lives = {}; for (const z of Object.values(Z)) for (const c of z.monsters || []) (lives[c.monster] ||= new Set()).add(z.id);

// 메인 순서대로 받기
const done = new Set(), addDone = id => { if (done.has(id)) return; for (const p of d.quests[id].prereq || []) addDone(p); done.add(id); };
const prof = (active) => { const p = newProfile(d, '시험', 'm'); p.level = 50; p.quests = [...done].map(id => ({ id, state: 'completed', counts: [] })); if (active) p.quests.push({ id: active, state: 'active', counts: [] }); return p; };
const reach = p => { const seen = new Set(['town']), q = ['town']; while (q.length) { const a = q.shift(); for (const b of graph[a] || []) if (!seen.has(b) && !zoneLock(d, p, b)) { seen.add(b); q.push(b); } } return seen; };
const where = {};      // zone -> first step at which it is open (for the level check)
for (const sid of M.order) {
  const q = d.quests[sid], S = M.steps[sid];
  // 선행을 다 마치기 전에는 이 단계가 새로 여는 곳이 닫혀 있음
  const opens = Object.values(d.zones).filter(z => z.unlock === sid).map(z => z.id);
  const missing = (q.prereq || []).filter(p => !done.has(p));
  if (missing.length && opens.length) { const p0 = prof(null); for (const z of opens) ok(zoneLock(d, p0, z), `${sid} 전에는 ${z} 닫힘`); }
  for (const p of q.prereq || []) addDone(p);
  const p = prof(sid), R = reach(p);
  for (const z of Object.keys(d.zones)) if (!zoneLock(d, p, z) && !(z in where)) where[z] = sid;
  const need = new Set([S.gz, S.tz, ...S.oz.filter(Boolean)]);
  q.objectives.forEach((o, i) => {
    if (o.type === 'visit') need.add(o.target);
    if (o.spawn) need.add(o.spawn.zone); if (o.gather) need.add(o.gather.zone);
    const mons = o.type === 'kill' && !o.spawn ? [o.target] : o.drop ? o.drop.from : [];
    if (mons.length && !o.target.startsWith('boss_')) ok(mons.some(m => [...(lives[m] || [])].some(z => R.has(z))), `${sid} 목표 몬스터 ${mons} 가 열린 지역에 있음`);
    if (o.type === 'job' && o.target === 'tier2')       // 2차 전직 시험(qt_*) 사냥감
      for (const t of d.questList.filter(t => /^qt_/.test(t.id))) for (const to of t.objectives) if (to.type === 'kill') ok([...(lives[to.target] || [])].some(z => R.has(z)), `${sid} 전직 시험 ${to.target} 사냥터 열림`);
  });
  for (const z of need) ok(R.has(z), `${sid} ${q.name}: ${z} 에 열린 길로 갈 수 있음`);
  // 이야기 NPC(주는/완료/대화)는 그 단계 동안 열린 곳에 서 있음
  for (const npc of new Set([q.giver, q.turnIn, ...q.objectives.filter(o => o.type === 'talk').map(o => o.target)])) {
    const placed = d.storyNpcs.filter(e => e.npc === npc && !e.hide).map(e => e.zone).concat(Object.values(Z).filter(z => (z.npcs || []).some(x => x.npc === npc)).map(z => z.id));
    ok(placed.some(z => R.has(z)), `${sid} NPC ${npc} 가 열린 곳에 있음 (${placed})`);
  }
  addDone(sid);
}

// 2026-11-19 아르칸 서장: Lv10까지 메인은 아르칸 마을(주는/완료 NPC 모두 아르칸, 목표는 숲·왕도 가는 길·독버섯 군락지),
// 카이리온은 서장 「첫 전직」(q_job1, Lv10, 선행 = 서장 끝 mq00h)부터, 1장(mq01a)은 첫 전직 뒤
eq(d.zones.kairion_capital.unlock, 'q_job1'); eq(d.quests.q_job1.prereq, ['mq00h']); eq(d.quests.q_job1.minLevel, 10); eq(d.quests.mq01a.prereq, ['q_job1']);
{ const arc = M.order.slice(0, M.order.indexOf('q_job1'));
  eq(arc.slice(0, 2), ['q1_start', 'q2_merchant'], '서장은 촌장 인사부터');
  ok(arc.includes('q7_boss') && arc.filter(id => /^mq00/.test(id)).length === 8, '서장 = mq00a~h + 거대 독버섯: ' + arc.join(','));
  const near = new Set(['town', 'forest', 'capital_road', 'mushroom_grove']);
  let prev = 0;
  for (const id of arc) {
    const q = d.quests[id], S = M.steps[id];
    eq(S.gz, 'town', id + ' 아르칸에서 받음'); eq(S.tz, 'town', id + ' 아르칸에서 완료');
    for (const z of S.oz) ok(!z || near.has(z), `${id} 목표 지역 ${z} 는 아르칸 근처`);
    ok(q.minLevel >= prev && q.minLevel <= 9, `${id} Lv${q.minLevel} (서장은 Lv10 전)`); prev = q.minLevel;
    eq(questCategory(q), 'main', id + ' 메인');
  }
  for (const id of M.order.slice(M.order.indexOf('mq01a'))) ok(d.quests[id].minLevel >= 10, id + ' 1장부터는 첫 전직 뒤 Lv10+');
  const p = newProfile(d, '전직', 'f'); p.level = 10;
  ok(zoneLock(d, p, 'kairion_capital'), '처음엔 카이리온 닫힘');
  p.quests = ['q1_start', 'q2_merchant', 'mq00a', 'mq00b', 'mq00c', 'mq00d', 'mq00e', 'mq00f', 'mq00g', 'q7_boss'].map(id => ({ id, state: 'completed', counts: [] }));
  ok(zoneLock(d, p, 'kairion_capital') && !zoneLock(d, p, 'capital_road') && !zoneLock(d, p, 'mushroom_grove'), '서장 중에는 카이리온 닫힘');
  eq(zoneLock(d, p, 'kairion_capital').text, '메인 퀘스트 서장 「첫 전직」을 진행해야 들어갈 수 있습니다');
  p.quests.push({ id: 'mq00h', state: 'completed', counts: [] });
  ok(!zoneLock(d, p, 'kairion_capital'), '서장을 마치면 카이리온 열림 (Lv10 전직)');
  ok(Object.values(d.npcs).filter(x => x.role === 'jobmaster').every(m => Object.values(Z).some(z => z.id === 'kairion_capital' && (z.npcs || []).some(x => x.npc === m.id))), '전직 마스터는 카이리온에');
  ok(!d.quests.mq07c.objectives.some(o => o.type === 'job'), '7장 ③은 더 이상 전직 목표가 아님(중복 없음)');
  eq(d.questList.filter(q => questCategory(q) === 'main' && q.objectives.some(o => o.type === 'job' && o.target === 'any')).map(q => q.id), ['q_job1'], '1차 전직 메인 단계는 하나');
}
// 예전 저장(1장 이후로 나아간 것): 서장은 완료로, 첫 전직은 받은 상태로 → 카이리온이 막히지 않음
{ const o1 = migrate({ version: 4, name: '옛1', level: 6, job: 'novice', zone: 'kairion_hunt', quests: [{ id: 'q1_start', state: 'completed' }, { id: 'q2_merchant', state: 'completed' }, { id: 'mq01a', state: 'completed' }, { id: 'mq02a', state: 'completed' }, { id: 'mq02b', state: 'active', counts: [2, 0] }] });
  ok(!zoneLock(d, o1, 'kairion_capital') && !zoneLock(d, o1, 'kairion_hunt'), '예전 저장(2장 진행 중, Lv6 견습생): 카이리온·사냥터 그대로 열림');
  eq(o1.quests.find(q => q.id === 'q_job1').state, 'active', '첫 전직은 받은 상태'); ok(o1.quests.find(q => q.id === 'mq00h').state === 'completed', '서장은 완료');
  const n1 = o1.quests.length; migrate(o1); eq(o1.quests.length, n1, '두 번 불러도 같음');
  const o2 = migrate({ version: 4, name: '옛2', level: 3, quests: [{ id: 'q1_start', state: 'completed' }, { id: 'q2_merchant', state: 'completed' }] });
  ok(!o2.quests.some(q => /^mq00|q_job1/.test(q.id)), '1장 전의 예전 저장은 서장을 처음부터');
}

// 안내 문구 · 마을 워프 · 예전 저장
{ const p = newProfile(d, '문', 'm'); p.gold = 9999; p.towns = ['town', 'baltern'];
  const L = zoneLock(d, p, 'mist_valley'); ok(L && L.step === 'mq06a', '안개 골짜기 = 6장');
  eq(L.text, '메인 퀘스트 6장 「안개 속 감시자 ①」을 진행해야 들어갈 수 있습니다'); eq(L.short, '6장 「안개 속 감시자 ①」 필요');
  const G2 = zoneLock(d, p, 'mushroom_grove'); eq(G2 && G2.text, '메인 퀘스트 서장 「보랏빛 포자」를 진행해야 들어갈 수 있습니다', '서장 안내: ' + (G2 && G2.text));
  eq(warpBlock(d, p, 'town', 'baltern'), zoneLock(d, p, 'baltern').text, '가 본 마을이어도 메인 퀘스트로 닫히면 워프 막힘');
  eq(josa('가을의 납품', '을', '를'), '을'); eq(josa('검은 피의 사슴 ②', '을', '를'), '를'); eq(josa('별을 잇는 자 ② (에필로그)', '을', '를'), '를'); eq(josa('거대 독버섯', '을', '를'), '을');
  const old = migrate({ version: 4, name: '옛', level: 30, zone: 'frost_highland', returnZone: 'baltern', returnSpawn: 'revive', quests: [] });
  eq(old.version, SAVE_VERSION); ok(zoneLock(d, old, old.zone) && zoneLock(d, old, old.returnZone), '예전 저장: 닫힌 곳에 있으면 (게임이) 아르칸으로 옮김');
}
// 레벨 문은 쓰지 않음(포털 minLevel 0)
for (const z of Object.values(Z)) for (const pt of z.portals || []) ok(!(pt.minLevel > 0), `${z.id}→${pt.targetZone} 레벨 문 없음`);

// 권장 레벨: 메인 퀘스트가 여는 순서대로 줄지 않음 + 여는 단계의 예상 레벨 ±1 + 무리 레벨이 범위 안
let E = 0; const expAt = {}; for (const id of M.order) { E = Math.max(E, d.quests[id].minLevel); expAt[id] = E; }
// 메인이 쓰지 않아 레벨대로 연 곳(world.main.band)은 원래 레벨 그대로 — 열릴 때 예상 레벨 이상이기만
for (const id of M.band) { const z = d.zones[id]; ok(z.unlock && (z.kind === 'town' || z.level[0] <= expAt[z.unlock]), id + ' 레벨대로 엶'); }
const fields = Object.values(d.zones).filter(z => z.kind !== 'town' && z.unlock && !M.band.includes(z.id)).sort((a, b) => M.order.indexOf(a.unlock) - M.order.indexOf(b.unlock) || a.level[0] - b.level[0]);
let prevLo = 0, rows = [];
for (const z of fields) {
  const [lo, hi] = z.level, e = expAt[z.unlock];
  ok(lo >= prevLo, `${z.id} 권장 레벨 ${lo} ≥ 앞 필드 ${prevLo}`); prevLo = lo;
  ok(Math.abs(lo - e) <= 1 && hi >= lo && hi <= 50, `${z.id} Lv ${lo}~${hi} ≈ ${z.unlock} 예상 Lv ${e}`);
  for (const c of Z[z.id].monsters || []) ok(c.level >= lo && c.level <= Math.min(50, hi + 1), `${z.id} ${c.monster} 무리 Lv ${c.level} 범위 안`);
  rows.push(`${z.unlock}:${z.id}:${lo}-${hi}`);
}
ok(fields.length >= 35, '메인 퀘스트가 지나는 필드 ' + fields.length);
// 서브 퀘스트(2026-11-15): 받을 수 있게 되는 순간 쓰는 지역(주는/완료 NPC 자리, 줍기·보스 지역)이 모두 열려 있고 목표 몬스터가 열린 곳에 있음.
// needZones(story.py)가 그렇게 늦춤 — 늦춰진 퀘스트와 새로 받을 수 있는 메인 단계를 출력
{
  const subs = d.questList.filter(q => questCategory(q) === 'sub'), first = {}, naive = {};
  const place = npc => d.storyNpcs.filter(e => e.npc === npc && !e.hide).map(e => e.zone).concat(Object.values(Z).filter(z => (z.npcs || []).some(x => x.npc === npc)).map(z => z.id));
  const doneM = new Set(), addM = id => { if (doneM.has(id)) return; for (const p of d.quests[id].prereq || []) addM(p); doneM.add(id); };
  for (const sid of M.order) {
    for (const p of d.quests[sid].prereq || []) addM(p);
    for (const [rec, gate] of [[first, true], [naive, false]]) {
      const done = new Set(doneM); for (const id in rec) done.add(id);
      let more = true;
      while (more) { more = false;
        for (const q of subs) {
          if (done.has(q.id) || !(q.prereq || []).every(p => done.has(p))) continue;
          const pf = newProfile(d, '서브', 'm'); pf.quests = [...done].map(id => ({ id, state: 'completed', counts: [] }));
          if (gate && (q.needZones || []).some(z => zoneLock(d, pf, z))) continue;
          rec[q.id] = sid; done.add(q.id); more = true;
          if (!gate) continue;
          const R = reach(pf);
          for (const npc of new Set([q.giver, q.turnIn || q.giver])) ok(place(npc).some(z => R.has(z)), `${q.id} ${q.name}: NPC ${npc} 가 열린 곳에 (${place(npc)})`);
          for (const o of q.objectives) {
            for (const z of [o.gather && o.gather.zone, o.spawn && o.spawn.zone]) if (z) ok(R.has(z), `${q.id} ${z} 열림`);
            const mons = o.type === 'kill' && !o.spawn ? [o.target] : o.drop ? o.drop.from : [];
            if (mons.length) ok(mons.some(m => [...(lives[m] || [])].some(z => R.has(z))), `${q.id} 목표 ${mons} 가 열린 곳에`);
          }
        }
      }
    }
    addM(sid);
  }
  ok(subs.every(q => first[q.id]), '모든 서브 퀘스트를 언젠가 받을 수 있음 ' + subs.filter(q => !first[q.id]).map(q => q.id));
  const late = subs.filter(q => first[q.id] !== naive[q.id]).map(q => `${q.id}(${q.name}) ${naive[q.id]}→${first[q.id]}`);
  for (const id of ['qs20', 'qs30', 'qs44', 'qs45', 'qs49']) ok(M.order.indexOf(first[id]) >= M.order.indexOf(d.zones[{ qs20: 'silvern_woods', qs30: 'frost_highland', qs44: 'kreutz_snowfield', qs45: 'frozen_lake', qs49: 'dragon_ruins' }[id]].unlock) - 1, id + ' 지역이 열린 뒤에');
  console.log('늦춘 서브 퀘스트 ' + late.length + '개: ' + late.join(', '));
  // 이미 받은 것은 그대로(예전 저장)
  const pf = newProfile(d, '옛', 'm'); pf.level = 50;
  const { CharacterSheet, QuestLog, QS } = await import('../js/core.js');
  pf.quests = [{ id: 'qs30', state: 'active', counts: [0] }]; const ql = new QuestLog(d, new CharacterSheet(d, pf));
  ok(ql.stateOf(d.quests.qs30) === QS.Active, '예전 저장에서 이미 받은 서브 퀘스트는 그대로');
  pf.quests = [{ id: 'qs29', state: 'completed', counts: [] }]; ok(new QuestLog(d, new CharacterSheet(d, pf)).stateOf(d.quests.qs30) === QS.Locked, '서리 고원이 닫혀 있으면 qs30 못 받음');
}
console.log(n + ' passed (main steps ' + M.order.length + ', fields ' + fields.length + ')');
