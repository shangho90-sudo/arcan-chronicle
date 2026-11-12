// 마을 간 워프(워프 안내인) 검사: 안내인·도착 지점 배치, 삯, 가 본 마을만, 골드 부족, 예전 저장.  Run: node tests/warp.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
globalThis.window = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
const { GameData, ZoneGeometry, newProfile, migrate, SAVE_VERSION, WARP_FARE, warpTowns, warpPrice, townsKnown, discoverTown, warpBlock, payWarp } = await import('../js/core.js');
const J = n => JSON.parse(readFileSync(new URL('../assets/data/' + n, import.meta.url), 'utf8'));
const files = {}; for (const f of ['config', 'levels', 'jobs', 'skills', 'skills2', 'items', 'monsters', 'quests', 'npcs', 'zones']) files[f] = J(f + '.json');
const d = new GameData(files); let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }, eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const full = z => z.file ? Object.assign({}, z, J(z.file)) : z;

// 마을 9곳, 마을마다 워프 안내인 한 명(role warp)과 막히지 않은 도착 지점 'warp'
const towns = warpTowns(d); eq(towns.length, 9, '마을 9곳');
for (const t of towns) {
  const Z = full(t), keepers = Z.npcs.filter(q => d.npcs[q.npc] && d.npcs[q.npc].role === 'warp');
  eq(keepers.length, 1, t.id + ' 워프 안내인 1명'); const def = d.npcs[keepers[0].npc];
  ok(def.title === '워프 안내인' && def.model === 'warp_keeper' && def.name && def.lines.length, t.id + ' 안내인 정보');
  const sp = Z.spawns.find(s => s.id === 'warp'); ok(sp, t.id + " 'warp' 도착 지점");
  const geo = new ZoneGeometry(Z); ok(!geo.blocked(sp.pos[0], sp.pos[1], d.config.playerRadius), t.id + ' 도착 지점이 막히지 않음');
  const dist = Math.hypot(sp.pos[0] - keepers[0].pos[0], sp.pos[1] - keepers[0].pos[1]); ok(dist > 1.5 && dist < 4, t.id + ' 도착 지점은 안내인 앞');
}
eq(new Set(Object.values(d.npcs).filter(q => q.role === 'warp').map(q => q.name)).size, 9, '안내인 이름이 모두 다름');

// 삯: 30 G + 지도 거리 × 0.25, 5 G 단위, 최대 200 G, 양방향 같음, 같은 마을 0
eq(warpPrice(d, 'town', 'town'), 0, '같은 마을 0');
for (const a of towns) for (const b of towns) if (a.id !== b.id) {
  const p = warpPrice(d, a.id, b.id), dist = Math.hypot(a.map[0] - b.map[0], a.map[1] - b.map[1]);
  ok(p >= WARP_FARE.base && p <= WARP_FARE.max && p % WARP_FARE.step === 0, a.id + '→' + b.id + ' 삯 범위');
  eq(p, Math.min(WARP_FARE.max, Math.round((WARP_FARE.base + dist * WARP_FARE.per) / WARP_FARE.step) * WARP_FARE.step), '삯 공식'); eq(p, warpPrice(d, b.id, a.id), '양방향 같음');
}
ok(warpPrice(d, 'town', 'kairion_capital') < warpPrice(d, 'town', 'baltazar'), '멀수록 비쌈');
eq(warpPrice(d, 'town', 'forest'), 0, '마을이 아니면 0'); 

// 발견: 새 캐릭터는 시작 마을만
const p = newProfile(d, '워프', 'm'); eq(townsKnown(d, p), ['town'], '새 캐릭터는 아르칸만'); p.gold = 1000;
eq(warpBlock(d, p, 'town', 'kairion_capital'), '아직 가 보지 않은 곳입니다', '안 가 본 마을은 막힘');
eq(payWarp(d, p, 'town', 'kairion_capital'), '아직 가 보지 않은 곳입니다'); eq(p.gold, 1000, '막히면 골드 그대로');
eq(discoverTown(d, p, 'forest'), false, '필드는 기록 안 함'); eq(discoverTown(d, p, 'kairion_capital'), true, '처음 들어가면 기록'); eq(discoverTown(d, p, 'kairion_capital'), false, '두 번째는 그대로');
eq(townsKnown(d, p), ['town', 'kairion_capital']);
eq(warpBlock(d, p, 'town', 'town'), '지금 있는 마을입니다'); eq(warpBlock(d, p, 'forest', 'town'), '워프 안내인은 마을에서만 만날 수 있습니다'); eq(warpBlock(d, p, 'town', 'forest'), '갈 수 없는 곳입니다');
const fare = warpPrice(d, 'town', 'kairion_capital'); eq(payWarp(d, p, 'town', 'kairion_capital'), '', '가 본 마을은 이동'); eq(p.gold, 1000 - fare, '삯만큼 줄어듦');
p.gold = fare - 1; eq(payWarp(d, p, 'kairion_capital', 'town'), '골드가 부족합니다'); eq(p.gold, fare - 1, '부족하면 그대로');
p.gold = fare; eq(payWarp(d, p, 'kairion_capital', 'town'), ''); eq(p.gold, 0, '딱 맞으면 이동');

// 예전 저장(towns 없음): 시작 마을 + 마지막으로 들른 마을 + 지금 있는 곳(마을일 때만 유효), 버전은 그대로 4
const old = migrate({ version: 4, name: '옛', gender: 'f', level: 20, gold: 500, zone: 'mist_valley', returnZone: 'baltern', returnSpawn: 'revive' });
eq(old.version, SAVE_VERSION); eq(SAVE_VERSION, 4, '저장 버전 그대로'); eq(townsKnown(d, old).sort(), ['baltern', 'town'], '예전 저장: 아르칸 + 마지막 마을');
const old2 = migrate({ version: 2, zone: 'gravel' }); eq(townsKnown(d, old2).sort(), ['gravel', 'town'], '마을에서 저장한 예전 저장');
const again = migrate(JSON.parse(JSON.stringify(p))); eq(townsKnown(d, again), ['town', 'kairion_capital'], '새 저장은 그대로 유지');
console.log(n + ' passed');
