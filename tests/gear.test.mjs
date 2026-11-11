// 장비 40종(tools/gear/gear.py) 검사: 개수·판매/드롭 규칙·드롭 몬스터 레벨·직업 전용 효과·상인 배치.  Run: node tests/gear.test.mjs
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
globalThis.window = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
const { GameData, CharacterSheet, Shop, newProfile, jobBuffActive } = await import('../js/core.js');
const J = n => JSON.parse(readFileSync(new URL('../assets/data/' + n, import.meta.url), 'utf8'));
const files = {}; for (const f of ['config', 'levels', 'jobs', 'skills', 'skills2', 'items', 'monsters', 'quests', 'npcs', 'zones']) files[f] = J(f + '.json');
const d = new GameData(files);
const gear = d.itemList.filter(i => i.gear);
const of = t => gear.filter(i => i.type === t).sort((a, b) => a.levelReq - b.levelReq);
const W = of('weapon'), A = of('armor'), C = of('accessory');
assert.equal(W.length, 10, '유봉 10'); assert.equal(A.length, 10, '갑옷 10'); assert.equal(C.length, 20, '장신구 20');
assert.ok(W.every(i => i.job === 'pharmacist'), '유봉은 약사 계열 무기');
const jobAcc = C.filter(i => i.jobBuff); assert.equal(jobAcc.length, 8, '직업 전용 장신구 8');

// 판매: 무기 상점 = 낮은 유봉 5, 방어구 상점 = 낮은 갑옷 5 + 낮은(직업 전용이 아닌) 장신구 5 — 나머지 25개는 어디서도 팔지 않음
const sold = new Set(Object.values(d.shops).flatMap(s => s.items));
const low5 = L => L.slice(0, 5).map(i => i.id);
const general = C.filter(i => !i.jobBuff);
const shopSet = [...low5(W), ...low5(A), ...low5(general)];
for (const id of shopSet) { assert.ok(sold.has(id), id + ' 판매'); assert.ok(d.item(id).price > 0, id + ' 값'); assert.ok(!d.item(id).dropFrom, id + ' 드롭 아님'); }
assert.deepEqual(d.shops.shop_weapons.items.filter(id => d.item(id).gear), low5(W));
assert.deepEqual(d.shops.shop_armor.items.filter(id => d.item(id).gear), [...low5(A), ...low5(general)]);
const dropOnly = gear.filter(i => !shopSet.includes(i.id)); assert.equal(dropOnly.length, 25);
for (const i of dropOnly) assert.ok(!sold.has(i.id) && i.price === 0, i.id + ' 는 팔지 않음');
for (const s of Object.values(d.shops)) if (!['shop_weapons', 'shop_armor'].includes(s.id)) assert.ok(!s.items.some(id => d.item(id) && d.item(id).gear), s.id + ' 에는 새 장비 없음');
assert.ok(!d.shops[d.npcs.master_blacksmith.shop].items.some(id => ['weapon', 'armor', 'accessory'].includes(d.item(id).type)), '철산은 장비를 팔지 않음');

// 드롭: 25개 모두 드롭 몬스터가 있고, 그중 하나는 실제로 [L-6, L+4] 레벨로 나오는 곳이 있음
const levels = {};      // monster id -> 나오는 레벨들
const scan = Z => { for (const s of Z.monsters || []) (levels[s.monster] ||= []).push(s.level || d.monsters[s.monster].level); if (Z.boss && Z.boss.boss) (levels[Z.boss.boss] ||= []).push(d.monsters[Z.boss.boss].level); };
for (const z of files.zones.zones) if (!z.file) scan(z);
for (const f of readdirSync(new URL('../assets/data/world/', import.meta.url))) scan(J('world/' + f));
for (const i of dropOnly) {
  assert.ok(i.dropFrom && i.dropFrom.length >= 1 && i.dropFrom.length <= 3, i.id + ' 드롭 몬스터 1~3');
  let fit = false;
  for (const dr of i.dropFrom) {
    const m = d.monsters[dr.monster]; assert.ok(m, dr.monster);
    assert.ok(m.drops.some(x => x.item === i.id && x.chance === dr.chance), i.id + ' 가 ' + dr.monster + ' 드롭 표에 합쳐짐');
    assert.ok(dr.chance > 0 && dr.chance <= 0.3, '확률'); assert.ok(levels[dr.monster], dr.monster + ' 가 실제로 나옴');
    if (levels[dr.monster].some(l => l >= i.levelReq - 6 && l <= i.levelReq + 4)) fit = true;
  }
  assert.ok(fit, i.id + ' Lv' + i.levelReq + ' 에 맞는 레벨의 드롭 몬스터');
}
assert.deepEqual(d.validate(), [], 'data validate');

// 직업 전용 효과: 직업이 맞을 때만
const sheet = (job, lv) => { const p = newProfile(d, 't', 'm'); p.level = lv; p.job = job; p.weapon = ''; return new CharacterSheet(d, p); };
const it = d.item('ac_j_pharm');
for (const [job, on] of [['pharmacist', true], ['herbalist', true], ['western_pharmacist', true], ['cook', false], ['novice', false]]) {
  const s = sheet(job, 30), base = s.final.healPower, m0 = s.final.matk;
  s.p.accessory = it.id; s.recalc();
  assert.equal(jobBuffActive(it, job), on, job);
  assert.ok(Math.abs(s.final.healPower - base - (on ? 0.15 : 0)) < 1e-9, job + ' healPower');
  assert.ok(Math.abs(s.final.matk - m0 * (on ? 1.08 : 1)) < 1e-6, job + ' matk');
  assert.ok(s.final.maxSp > 0);
}
{ const s = sheet('painter', 40); const c0 = s.final.cdr; s.p.accessory = 'ac_j_muse'; s.recalc(); assert.ok(Math.abs(s.final.cdr - c0 - 0.08) < 1e-9, '2차 전용: 화가');
  const a = sheet('artist', 40); const c1 = a.final.cdr; a.p.accessory = 'ac_j_muse'; a.recalc(); assert.ok(Math.abs(a.final.cdr - c1) < 1e-9, '2차 전용은 1차 직업에 안 붙음'); }
for (const j of jobAcc) for (const job of j.jobBuff.jobs) assert.ok(d.job(job), job);
// 유봉: 약사 계열만 장착, 구매 가능
{ const s = sheet('pharmacist', 12); s.p.gold = 99999; assert.equal(Shop.buy(s, d.shops.shop_weapons, 'w_pestle_g1', 1), null);
  const slot = s.p.inventory.findIndex(x => x.id === 'w_pestle_g1'); assert.equal(s.bag.equipFromSlot(slot), null); assert.equal(s.p.weapon, 'w_pestle_g1');
  assert.ok(sheet('herbalist', 30).bag.canEquip(d.item('w_pestle_g5')) === null); assert.ok(sheet('cook', 30).bag.canEquip(d.item('w_pestle_g5')) !== null);
  assert.equal(d.weaponFor('pharmacist', 1), 'w_pestle_1', '직업 무기 드롭은 예전 3단계 그대로'); }

// 상인: 9개 마을 모두 무기 상인 + 방어구 상인
const towns = [files.zones.zones.find(z => z.id === 'town'), ...readdirSync(new URL('../assets/data/world/', import.meta.url)).map(f => J('world/' + f)).filter(z => z.kind === 'town')];
assert.equal(towns.length, 9);
for (const t of towns) {
  const shops = t.npcs.map(n => d.npcs[n.npc] && d.npcs[n.npc].shop);
  assert.ok(shops.includes('shop_weapons'), t.id + ' 무기 상인'); assert.ok(shops.includes('shop_armor'), t.id + ' 방어구 상인');
}
console.log('gear: 40 items, 15 sold / 25 drop-only, job buffs, merchants in 9 towns passed');
