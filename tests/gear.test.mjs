// 장비(tools/gear/gear.py) 검사: 직업 계보별 무기·방어구 13계열(2026-11-17) + 예술가 악기 계열(무기만) + 장신구 20 + 예전 장비(legacy).
// 계열·단계 수·수치 공식·판매/드롭·드롭 몬스터 레벨·상점 직업 필터(견습생/1차/2차, 전직하면 바뀜)·착용 규칙·예전 저장·상인 배치.
// Run: node tests/gear.test.mjs
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
globalThis.window = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
const { GameData, CharacterSheet, Shop, newProfile, migrate, jobBuffActive, shopStockFor } = await import('../js/core.js');
const J = n => JSON.parse(readFileSync(new URL('../assets/data/' + n, import.meta.url), 'utf8'));
const files = {}; for (const f of ['config', 'levels', 'jobs', 'skills', 'skills2', 'items', 'monsters', 'quests', 'npcs', 'zones']) files[f] = J(f + '.json');
const d = new GameData(files);
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }; const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const gear = d.itemList.filter(i => i.gear);

// ---------------------------------------------------------------- 계열
// 직업 -> 무기 종류들(계열마다 하나), 단계 수. 예술가는 붓(art) + 악기(artm, 무기만), 음악가는 악기(2026-11-17 사용자 요청)
const LINES = { novice: [['sword'], 4], pharmacist: [['pestle'], 7], blacksmith: [['hammer'], 7], cook: [['knife'], 7], hairdresser: [['scissors'], 7], artist: [['brush', 'instrument'], 7],
  western_pharmacist: [['pestle'], 7], herbalist: [['pestle'], 7], engineer: [['hammer'], 7], chef: [['knife'], 7], designer: [['scissors'], 7], painter: [['brush'], 7], musician: [['instrument'], 7] };
const LV = { 4: [1, 3, 5, 8], 1: [10, 13, 16, 19, 22, 26, 31], 2: [30, 33, 36, 39, 42, 46, 50] };
const line = (job, type, kind) => gear.filter(i => i.line === job && i.type === type && (!kind || i.kind === kind)).sort((a, b) => a.levelReq - b.levelReq);
eq(Object.keys(LINES).sort(), [...new Set(gear.filter(i => i.line).map(i => i.line))].sort(), '계열 13개 = 견습생 + 1차 5 + 2차 7');
ok(d.jobList.every(j => LINES[j.id]), '모든 직업에 계열');
const lowK = L => Math.min(1, 0.5 + L / 16), P = (L, drop) => (10 + 2.2 * L) * lowK(L) * (drop ? 1.08 : 1);
const stat = (it, k) => (it.stats.find(s => s.stat === k) || {}).add;
for (const [job, [kinds, cnt]] of Object.entries(LINES)) {
  const tier = d.job(job).tier, lv = cnt === 4 ? LV[4] : LV[tier];
  for (const [type, kind] of [...kinds.map(k => ['weapon', k]), ['armor', 'armor']]) {
    const L = line(job, type, kind); eq(L.length, cnt, job + ' ' + type + ' ' + kind + ' 단계 수');
    eq(L.map(i => i.levelReq), lv, job + ' ' + type + ' 레벨');
    const sold = cnt === 4 ? 3 : 5;
    L.forEach((it, s) => {
      const drop = s >= sold;
      eq(!!it.dropFrom, drop, it.id + ' 판매/드롭'); ok(drop ? it.price === 0 : it.price > 0, it.id + ' 값');
      eq(it.tier, s + 1, it.id + ' tier'); ok(it.sellPrice > 0, it.id + ' 되팔기');
      ok(/^[가-힣 ]+$/.test(it.name) && it.desc.length > 8, it.id + ' 한국어 이름·설명');
      ok(Array.isArray(it.stand) && it.stand[1] >= 1 && it.stand[1] <= 3, it.id + ' 임시 모델');
      if (type === 'weapon') {
        eq(it.kind, kind, it.id + ' 무기 종류 = 1차 무기 종류'); eq(it.job, job === 'novice' ? '' : job, it.id + ' 착용 직업');
        const main = kind === 'brush' || kind === 'instrument' ? stat(it, 'matk') : stat(it, 'atk');
        eq(main, Math.round(P(it.levelReq, drop)), it.id + ' 주 능력치 = round((10 + 2.2L)·lowK·드롭)');
        if (kind === 'pestle') eq(stat(it, 'matk'), Math.round(main * 0.45), it.id + ' 유봉 마법력 45%');
        if (kind === 'brush' || kind === 'instrument') eq(stat(it, 'atk'), Math.round(main * 0.45), it.id + ' 붓·악기 공격력 45%');
      } else {
        eq(it.job, '', it.id + ' 방어구는 누구나(예전 규칙)');
        eq(stat(it, 'def'), Math.round((4 + 1.8 * it.levelReq) * lowK(it.levelReq) * (drop ? 1.08 : 1)), it.id + ' 방어');
        eq(stat(it, 'maxHp'), Math.round((20 + 10 * it.levelReq) * lowK(it.levelReq) * (drop ? 1.08 : 1)), it.id + ' 체력');
      }
    });
  }
}
// 직업 간 균형: 같은 단계의 방어구는 계열이 달라도 능력치가 똑같음, 같은 레벨 무기의 주 능력치도 같음
for (const [a, b] of [['pharmacist', 'cook'], ['western_pharmacist', 'musician'], ['herbalist', 'engineer']])
  line(a, 'armor').forEach((it, s) => eq(it.stats, line(b, 'armor')[s].stats, '방어구 균형 ' + it.id));
// Lv8 이상은 예전 공식(10 + 2.2L) 그대로
eq(stat(line('pharmacist', 'weapon')[0], 'atk'), Math.round(10 + 2.2 * 10), 'Lv10 유봉 = 예전 공식');
// 2차 무기 착용: 그 2차 직업만 / 1차 무기는 그 2차에게도(예전 규칙)
const sheet = (job, lv) => { const p = newProfile(d, 't', 'm'); p.level = lv; p.job = job; p.weapon = ''; return new CharacterSheet(d, p); };
ok(sheet('western_pharmacist', 40).bag.canEquip(d.item('wg_wpharm_3')) === null, '양약사 → 양약사 유봉');
ok(sheet('herbalist', 40).bag.canEquip(d.item('wg_wpharm_3')) !== null, '한약사 ✕ 양약사 유봉');
ok(sheet('pharmacist', 40).bag.canEquip(d.item('wg_wpharm_3')) !== null, '약사 ✕ 양약사 유봉');
ok(sheet('herbalist', 40).bag.canEquip(d.item('wg_pharm_3')) === null, '한약사 → 약사 유봉(1차 무기는 2차도)');
ok(sheet('cook', 20).bag.canEquip(d.item('wg_nov_3')) === null, '견습생 검은 누구나');
ok(sheet('cook', 40).bag.canEquip(d.item('ag_wpharm_2')) === null, '방어구는 다른 계열도 입음');

// ---------------------------------------------------------------- 드롭 몬스터 레벨
const levels = {};
const scan = Z => { for (const s of Z.monsters || []) (levels[s.monster] ||= []).push(s.level || d.monsters[s.monster].level); if (Z.boss && Z.boss.boss) (levels[Z.boss.boss] ||= []).push(d.monsters[Z.boss.boss].level); };
for (const z of files.zones.zones) if (!z.file) scan(z);
for (const f of readdirSync(new URL('../assets/data/world/', import.meta.url))) scan(J('world/' + f));
const dropOnly = gear.filter(i => i.dropFrom);
for (const i of dropOnly) {
  ok(i.dropFrom.length >= 1 && i.dropFrom.length <= 3, i.id + ' 드롭 몬스터 1~3');
  let fit = false;
  for (const dr of i.dropFrom) {
    const m = d.monsters[dr.monster]; ok(m, dr.monster);
    ok(m.drops.some(x => x.item === i.id && x.chance === dr.chance), i.id + ' 가 ' + dr.monster + ' 드롭 표에 합쳐짐');
    ok(dr.chance > 0 && dr.chance <= 0.3, '확률'); ok(levels[dr.monster], dr.monster + ' 가 실제로 나옴');
    if (levels[dr.monster].some(l => l >= i.levelReq - 6 && l <= i.levelReq + 4)) fit = true;
  }
  ok(fit, i.id + ' Lv' + i.levelReq + ' 에 맞는 레벨의 드롭 몬스터');
}
eq(d.validate(), [], 'data validate');

// ---------------------------------------------------------------- 상점 목록 + 직업 필터
const sold = new Set(Object.values(d.shops).flatMap(s => s.items));
const legacy = gear.filter(i => i.legacy);
eq(legacy.length, 20, '예전 유봉 10 + 갑옷 10은 legacy로 남음');
for (const i of legacy) { ok(!sold.has(i.id) && !i.dropFrom && i.price === 0, i.id + ' 팔지도 떨어뜨리지도 않음'); ok(i.sellPrice > 0, i.id + ' 되팔기는 됨'); }
eq(d.shops.shop_weapons.items.filter(id => d.item(id).gear).sort(), gear.filter(i => i.line && i.type === 'weapon' && !i.dropFrom).map(i => i.id).sort(), '무기 상점 = 모든 계열의 판매 무기');
const C = gear.filter(i => i.type === 'accessory'); eq(C.length, 20, '장신구 20');
const generalSold = C.filter(i => !i.jobBuff).sort((a, b) => a.levelReq - b.levelReq).slice(0, 5).map(i => i.id);
eq(d.shops.shop_armor.items.filter(id => d.item(id).type === 'accessory'), generalSold, '방어구 상점 장신구 = 낮은 일반 5');
ok(!d.shops[d.npcs.master_blacksmith.shop].items.some(id => ['weapon', 'armor', 'accessory'].includes(d.item(id).type)), '철산은 장비를 팔지 않음');

const prof = (job, lv) => { const p = newProfile(d, 't', 'm'); p.job = job; p.level = lv; return p; };
const gearIn = (p, shop) => shopStockFor(d, p, shop).map(id => d.item(id)).filter(x => x.type === 'weapon' || x.type === 'armor');
const linesIn = (p, shop) => [...new Set(gearIn(p, shop).map(x => x.line || '(공통)'))].sort();
for (const [job] of Object.entries(LINES)) {
  const tier = d.job(job).tier, lv = tier === 0 ? 5 : tier === 1 ? 20 : 40;
  for (const shop of ['shop_weapons', 'shop_armor']) {
    const p = prof(job, lv), got = gearIn(p, shop);
    eq(linesIn(p, shop), [job], job + ' Lv' + lv + ' ' + shop + ' = 자기 계열만');
    eq(got.map(x => x.id).sort(), line(job, shop === 'shop_weapons' ? 'weapon' : 'armor').filter(x => !x.dropFrom).map(x => x.id).sort(), job + ' ' + shop + ' 판매 단계 전부');
  }
  // 다른 직업 무기는 다른 상점(예전 shop_smithy)에서도 안 보임 — 착용 규칙과 같은 판정
  const sm = shopStockFor(d, prof(job, lv), 'shop_smithy').map(id => d.item(id)).filter(x => x.type === 'weapon');
  ok(sm.every(x => x.job === job || (d.job(job).parent === x.job)), job + ' 대장간: 다른 직업 무기 숨김');
}
// 장신구: 일반은 누구나, 직업 전용은 그 직업에게만 (지금 상점에는 직업 전용이 없지만 규칙 확인용 가짜 상점)
const fakeShop = { id: 'x', items: ['ac_g1', 'ac_j_pharm', 'ac_j_muse', 'ac_j_cook'] };
eq(shopStockFor(d, prof('herbalist', 40), fakeShop), ['ac_g1', 'ac_j_pharm'], '한약사 장신구');
eq(shopStockFor(d, prof('musician', 40), fakeShop), ['ac_g1', 'ac_j_muse'], '음악가 장신구');
eq(shopStockFor(d, prof('novice', 5), fakeShop), ['ac_g1'], '견습생 장신구');
// 전직 직후 목록이 바뀜: 견습생 → 약사 → 양약사 (같은 프로필)
{ const p = prof('novice', 10); eq(linesIn(p, 'shop_weapons'), ['novice'], '전직 전');
  p.job = 'pharmacist'; eq(linesIn(p, 'shop_weapons'), ['pharmacist'], '약사 전직 직후');
  p.level = 30; p.job = 'western_pharmacist'; eq(linesIn(p, 'shop_weapons'), ['western_pharmacist'], '양약사 전직 직후');
  p.job = 'herbalist'; eq(linesIn(p, 'shop_armor'), ['herbalist'], '한약사 방어구'); }
// 빈 구간 없음: 자기 계열 최저 단계보다 레벨이 낮으면(예전 저장의 이른 전직) 위 계열의 그보다 낮은 단계를 함께
{ const p = prof('cook', 6);                // legacyJob: Lv10 전에 요리사
  const g = gearIn(p, 'shop_weapons'); eq([...new Set(g.map(x => x.line))].sort(), ['cook', 'novice'], 'Lv6 요리사 = 요리사 + 견습생');
  ok(g.filter(x => x.line === 'novice').every(x => x.levelReq < 10), '견습생 것은 Lv10 아래만');
  const q = prof('chef', 28); const h = gearIn(q, 'shop_armor');
  eq([...new Set(h.map(x => x.line))].sort(), ['chef', 'cook'], 'Lv28 쉐프 = 쉐프 + 요리사(Lv30 아래)'); ok(h.filter(x => x.line === 'cook').every(x => x.levelReq < 30), '요리사 것은 Lv30 아래만');
  eq(linesIn(prof('chef', 30), 'shop_armor'), ['chef'], 'Lv30 쉐프 = 쉐프만'); }
// 구매도 같은 규칙
{ const s = sheet('pharmacist', 12); s.p.gold = 99999;
  ok(Shop.buy(s, d.shops.shop_weapons, 'wg_cook_1', 1) !== null, '약사는 식칼을 못 삼');
  eq(Shop.buy(s, d.shops.shop_weapons, 'wg_pharm_1', 1), null, '약사 유봉 구매');
  const slot = s.p.inventory.findIndex(x => x.id === 'wg_pharm_1'); eq(s.bag.equipFromSlot(slot), null); eq(s.p.weapon, 'wg_pharm_1');
  eq(Shop.buy(s, d.shops.shop_armor, 'ag_pharm_1', 1), null, '약사 방어구 구매');
  ok(Shop.buy(s, d.shops.shop_armor, 'ag_cook_1', 1) !== null, '다른 계열 방어구는 못 삼');
  // 되팔기는 아무 장비나
  s.bag.add('wg_chef_2', 1); const k = s.p.inventory.findIndex(x => x.id === 'wg_chef_2'); const g0 = s.p.gold;
  eq(Shop.sell(s, k, 1), null, '다른 계열 장비 되팔기'); eq(s.p.gold - g0, d.item('wg_chef_2').sellPrice); }

// ---------------------------------------------------------------- 악기(2026-11-17 사용자: '예술가는 붓에 악기 추가, 음악가는 붓 말고 악기')
{ const wk = (p) => [...new Set(gearIn(p, 'shop_weapons').filter(x => x.type === 'weapon').map(x => x.kind))].sort();
  eq(wk(prof('artist', 20)), ['brush', 'instrument'], '예술가 상점 = 붓 + 악기');
  eq(wk(prof('musician', 40)), ['instrument'], '음악가 상점 = 악기만');
  eq(wk(prof('painter', 40)), ['brush'], '화가 상점 = 붓만');
  eq(wk(prof('musician', 28)), ['instrument'], 'Lv28 음악가(1차 계열을 빌려도 악기만)');
  ok(gearIn(prof('musician', 28), 'shop_weapons').some(x => x.line === 'artist' && x.kind === 'instrument'), 'Lv28 음악가는 예술가 악기(Lv30 아래)를 빌림');
  eq(wk(prof('painter', 28)), ['brush'], 'Lv28 화가 = 붓만');
  ok(line('artist', 'armor').every(x => !/artm/.test(x.id)), '예술가 악기 계열은 무기만(방어구 계열은 하나)');
  for (const [job, id, okk] of [['artist', 'wg_artm_3', true], ['artist', 'wg_art_3', true], ['musician', 'wg_artm_3', true], ['musician', 'wg_music_3', true],
                                ['painter', 'wg_music_3', false], ['artist', 'wg_music_3', false], ['cook', 'wg_artm_3', false]])
    eq(sheet(job, 40).bag.canEquip(d.item(id)) === null, okk, job + ' 착용 ' + id);
  // 음악가 무기는 같은 id 그대로 악기로(수치 공식이 붓과 같아 예전 저장의 능력치 그대로)
  for (let s = 1; s <= 7; s++) { const it = d.item('wg_music_' + s); eq(it.kind, 'instrument', it.id + ' 악기'); }
  const art = line('artist', 'weapon', 'brush'), artm = line('artist', 'weapon', 'instrument');
  artm.forEach((it, s) => eq(it.stats, art[s].stats, '예술가 악기 = 붓과 같은 능력치 ' + it.id));
}

// ---------------------------------------------------------------- 예전 저장(장비 40종 시절)
{ const old = { version: 4, name: '예전', gender: 'f', job: 'western_pharmacist', level: 41, exp: 0, gold: 500, weapon: 'w_pestle_g9', armor: 'a_armor_g8', accessory: 'ac_j_herb',
    inventory: [{ id: 'w_pestle_g3', count: 1 }, { id: 'a_armor_g1', count: 1 }, { id: 'w_knife_2', count: 1 }, { id: 'w_pestle_2', count: 1 }], learnedSkills: [], jobsUnlocked: ['pharmacist', 'western_pharmacist'],
    quests: [], flags: [], sk: {}, crafted: {}, gearMods: {}, zone: 'town', returnZone: 'town', returnSpawn: 'start', towns: ['town'] };
  const p = migrate(JSON.parse(JSON.stringify(old))); ok(p, 'migrate'); eq(p.version, 4, 'SAVE_VERSION 그대로');
  eq([p.weapon, p.armor, p.accessory], ['w_pestle_g9', 'a_armor_g8', 'ac_j_herb'], '장착 그대로');
  eq(p.inventory.map(x => x.id), old.inventory.map(x => x.id), '가방 그대로');
  const s = new CharacterSheet(d, p); s.recalc();
  for (const id of ['w_pestle_g9', 'a_armor_g8', 'w_pestle_g3', 'a_armor_g1']) ok(d.item(id) && d.item(id).legacy, id + ' 아이템이 남아 있음');
  eq(stat(d.item('w_pestle_g9'), 'atk'), 108, '예전 유봉 수치 그대로'); eq(stat(d.item('a_armor_g8'), 'def'), 72, '예전 갑옷 수치 그대로');
  ok(s.final.atk > 108 && s.final.def >= 72, '예전 장비 효과 적용');
  eq(s.bag.canEquip(d.item('w_pestle_g9')), null, '양약사가 예전 유봉 계속 착용');
  const g0 = s.p.gold, k = s.p.inventory.findIndex(x => x.id === 'w_pestle_g3'); eq(Shop.sell(s, k, 1), null, '예전 장비 되팔기'); ok(s.p.gold > g0); }

// ---------------------------------------------------------------- 직업 전용 장신구(그대로)
const it = d.item('ac_j_pharm');
for (const [job, on] of [['pharmacist', true], ['herbalist', true], ['western_pharmacist', true], ['cook', false], ['novice', false]]) {
  const s = sheet(job, 30), base = s.final.healPower, m0 = s.final.matk;
  s.p.accessory = it.id; s.recalc();
  eq(jobBuffActive(it, job), on, job);
  ok(Math.abs(s.final.healPower - base - (on ? 0.15 : 0)) < 1e-9, job + ' healPower');
  ok(Math.abs(s.final.matk - m0 * (on ? 1.08 : 1)) < 1e-6, job + ' matk');
}
eq(d.weaponFor('pharmacist', 1), 'w_pestle_1', '직업 무기 드롭(@jobweapon)은 예전 3단계 그대로');

// ---------------------------------------------------------------- 디자인 브리프
const B = JSON.parse(readFileSync(new URL('../tools/gear/design_briefs.json', import.meta.url), 'utf8'));
eq(Object.keys(B).length, 14, '브리프 14계열(13 + 예술가 악기)');
const bIds = Object.values(B).flatMap(f => f.items.map(x => x.id)).sort();
eq(bIds, gear.filter(i => i.line).map(i => i.id).sort(), '아이템마다 브리프');
for (const f of Object.values(B)) {
  ok(f.palette.length >= 2 && f.palette.length <= 3 && f.motif && f.silhouette && f.evolution.length === f.items.length / (f.weapon_only ? 1 : 2), f.family + ' 브리프 항목');
  for (const x of f.items) {
    ok(/one single (weapon|body garment)/.test(x.tripo_prompt) && /no background/.test(x.tripo_prompt), x.id + ' 프롬프트 규칙');
    ok(!/pokemon|pok[eé]mon/i.test(x.tripo_prompt), x.id + ' 포켓몬 언급 없음');
    if (x.type === 'weapon') ok(/handle at the bottom/.test(x.tripo_prompt), x.id + ' 손잡이 아래');
  }
}

// ---------------------------------------------------------------- 상인: 9개 마을 모두 무기 상인 + 방어구 상인
const towns = [files.zones.zones.find(z => z.id === 'town'), ...readdirSync(new URL('../assets/data/world/', import.meta.url)).map(f => J('world/' + f)).filter(z => z.kind === 'town')];
eq(towns.length, 9);
for (const t of towns) {
  const shops = t.npcs.map(x => d.npcs[x.npc] && d.npcs[x.npc].shop);
  ok(shops.includes('shop_weapons'), t.id + ' 무기 상인'); ok(shops.includes('shop_armor'), t.id + ' 방어구 상인');
}
console.log(`gear: ${n} passed — 13 lines + artist instruments, ${gear.filter(i => i.line).length} line items (${gear.filter(i => i.line && !i.dropFrom).length} sold / ${gear.filter(i => i.line && i.dropFrom).length} drop), legacy 20, shop filter, old save`);
