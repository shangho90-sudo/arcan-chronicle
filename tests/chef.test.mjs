// 쉐프 2차 규칙(js/chef.js + js/skillrt.js)을 WebGL 없이 확인: 스킬 id·배우는 레벨·종류·최대 레벨 유지, 예전 저장의 레벨·포인트·칸,
// 여러 번 맞히는 스킬의 총 피해, 관통·왕복 판정, 화상/둔화/빙결/열충격 순서와 대상마다 한 번, 설탕 벽 충돌·자리 검사·파편 한 번,
// 압력솥, 크로캉부슈 상한, 봉 아페티!(음식 없으면 아무것도 안 씀·강화가 겹쳐 커지지 않음), 셰프의 한 끗, 로열 그랑 디너 취소, 정리(사망·지역 이동·다시 쓰기).
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { HitShape, CombatMath, StatusSet, clamp, clamp01 } from '../js/core.js';
import { skillSound } from '../js/sfx.js';
import { SmithKit, clearLine } from '../js/smith.js';
import { ChefKit, fold, sorbetSlow, boostValue, skewerPlan, sugarSpotError, chefLevelText } from '../js/chef.js';
import { ensureSk } from '../js/skillsys.js';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const S2 = JSON.parse(read('../assets/data/skills2.json')), skills = S2.skills, SK = Object.fromEntries(skills.map(s => [s.id, s]));
const STATUS = Object.fromEntries([...JSON.parse(read('../assets/data/skills.json')).statuses, ...S2.statuses].map(s => [s.id, s])), ITEM = Object.fromEntries(S2.items.map(i => [i.id, i]));
const actions = Object.fromEntries(JSON.parse(read('../assets/models/actions.json')).map(a => [a.name, a]));
const sandbox = { HitShape, CombatMath, clamp, clamp01, skillSound, SmithKit, clearLine, ChefKit, T: p => p, console };
vm.createContext(sandbox);
vm.runInContext(read('../js/skillrt.js').replace(/^import .*;\n/gm, '').replace(/\bexport /g, '') + '\nthis.api={SkillEngine,bindSkillRt,FX,CUSTOM,Summon};', sandbox);
const { SkillEngine, bindSkillRt, FX, CUSTOM } = sandbox.api;
Math.random = () => 0.5;   // 피해 굴림 고정(총합 비교)
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

// ------------------------------------------------------------------ data: ids, levels, types, recipes, assets
const OLD = { a1: ['attack', 30], a2: ['attack', 33], a3: ['summon', 36], a4: ['attack', 40], a5: ['ultimate', 45], b1: ['attack', 30], b2: ['attack', 33], b3: ['attack', 36], b4: ['summon', 40], b5: ['ultimate', 45],
  c1: ['craft', 30], c2: ['support', 33], c3: ['support', 36], c4: ['passive', 40], c5: ['ultimate', 45] };
const cf = skills.filter(s => s.job === 'chef');
ok(cf.length === 15, '15 chef skills');
for (const [k, [type, unlock]] of Object.entries(OLD)) { const d = SK['cf_' + k]; ok(d && d.type === type && d.unlock === unlock && d.maxLv === (type === 'ultimate' ? 3 : 5) && d.tier === 2, `cf_${k}: ${type}, Lv${unlock}`); ok(d.cat === 'abc'.indexOf(k[0]), 'line ' + k); }
ok(['불꽃의 오픈 키친', '환상의 파티스리', '왕실의 테이블'].every((n, i) => cf.filter(s => s.cat === i).every(s => s.catName === n)), 'line titles A/B/C');
ok(new Set(cf.map(s => s.name)).size === 15 && cf.every(s => /[가-힣]/.test(s.desc) && s.desc.length > 30), '15 distinct Korean names + descriptions');
for (const r of ['r_course_atk', 'r_course_def', 'r_course_heal']) { const rc = S2.recipes.find(x => x.id === r); ok(rc && rc.skill === 'cf_c1' && ITEM[rc.output.item], 'recipe linked ' + r); }
ok(SK.cf_c1.recipes.length === 3, 'craft skill lists its 3 recipes');
for (const s of cf) ok(existsSync(new URL(`../assets/ui/skills/${s.id}.png`, import.meta.url)) && readFileSync(new URL(`../assets/ui/skills/${s.id}.png`, import.meta.url)).length > 1000, 'icon ' + s.id);
for (const s of cf) if (s.anim) ok(actions[s.anim], 'motion exists ' + s.anim);
const SOUNDS = ['cf_wok_toss', 'cf_sizzle', 'cf_flame', 'cf_splash', 'cf_ignite', 'cf_steam', 'cf_place', 'cf_steam_hiss', 'cf_pop', 'cf_skewer', 'cf_whoosh', 'cf_knife', 'cf_cloche_fall', 'cf_cloche_slam',
  'cf_scoop', 'cf_sorbet_hit', 'cf_frost_draw', 'cf_frost', 'cf_disc', 'cf_disc_hit', 'cf_disc_catch', 'cf_sugar', 'cf_shatter', 'cf_choux_pop', 'cf_serve', 'cf_cloche_open'];
for (const n of SOUNDS) ok(existsSync(new URL(`../assets/audio/sfx_${n}.mp3`, import.meta.url)), 'sound ' + n);
{ const used = new Set((read('../js/chef.js').match(/'cf_[a-z_]+'/g) || []).map(x => x.slice(1, -1))); for (const n of used) ok(SOUNDS.includes(n), 'chef.js sound is generated: ' + n); }
ok(read('../js/sfx.js').includes("'cf_wok_toss'"), 'sounds registered in SFX_NAMES');

// old save: levels, points and slots of the chef ids survive
{ const data = { skill2: id => SK[id] }, p = { sk: { points: 3, learned: { cf_a1: 5, cf_b2: 3, cf_c3: 2, cf_a5: 3, cf_c4: 4 }, slots: ['cf_a1', 'cf_b2', 'cf_c3', 'cf_a5'] } };
  const sk = ensureSk(p, data);
  ok(sk.points === 3 && sk.learned.cf_a1 === 5 && sk.learned.cf_c4 === 4 && sk.learned.cf_a5 === 3, 'old save keeps chef levels + points');
  ok(sk.slots.join() === 'cf_a1,cf_b2,cf_c3,cf_a5', 'old save keeps chef slots'); }

// ------------------------------------------------------------------ pure helpers
{ const o = { first: 0.12, step: 0.07, cap: 0.4 };
  let v = null; const seq = []; for (let i = 0; i < 6; i++) { v = sorbetSlow(v, o); seq.push(+v.toFixed(2)); }
  ok(seq.join() === '0.12,0.19,0.26,0.33,0.4,0.4', 'sorbet slow stacks to the cap: ' + seq);
  ok(sorbetSlow(0.18, o, true) === 0.2, 'boss: half cap');
  ok(boostValue(0.15, 0.5) === boostValue(0.15, 0.5) && near(boostValue(0.15, 0.5), 0.225), 'boost from base');
  const a = skewerPlan(SK.cf_a4.ops[0], 1), b = skewerPlan(SK.cf_a4.ops[0], 5);
  ok(a.n === 4 && b.n === 6 && near(a.per * a.n, 2.2) && near(b.per * b.n, 2.2 * fold(5)), `skewers: ${a.n} -> ${b.n}, total = 2.2 x fold`);
  const geo = { blocked: (x, z) => x > 5 };
  ok(sugarSpotError(geo, { x: 4.5, z: 0 }, { x: 0, z: 1 }, 3.6) === '지형과 겹쳐 세울 수 없습니다', 'sugar: terrain');
  ok(sugarSpotError({ blocked: () => false }, { x: 0, z: 0 }, { x: 0, z: 1 }, 3.6, { portals: [{ pos: [1, 1], radius: 1 }] }) === '출입구 근처에는 세울 수 없습니다', 'sugar: portal');
  ok(sugarSpotError({ blocked: () => false }, { x: 0, z: 0 }, { x: 0, z: 1 }, 3.6, { allies: [{ pos: { x: 1, z: 0.2 }, radius: 0.4 }] }) === '내 자리와 겹쳐 세울 수 없습니다', 'sugar: not on me');
  ok(sugarSpotError({ blocked: (x) => Math.abs(x) > 2.4 }, { x: 0, z: 0 }, { x: 0, z: 1 }, 3.6) === '통로를 완전히 막는 곳에는 세울 수 없습니다', 'sugar: never seals a corridor');
  ok(sugarSpotError({ blocked: () => false }, { x: 0, z: 0 }, { x: 0, z: 1 }, 3.6) === null, 'sugar: open ground ok');
  const data = { status: id => STATUS[id] };
  for (const s of cf) { const t = chefLevelText(s, 1, data); ok(typeof t === 'string' && t.length > 4 && !/NaN|undefined/.test(t), 'level text ' + s.id + ': ' + t); }
}

// ------------------------------------------------------------------ engine harness
function world(o = {}) {
  const sounds = [], kicks = [], fxLog = [], toasts = [];
  for (const k of Object.keys(FX).filter(k => k !== 'on')) FX[k] = () => ({ set() {}, dispose() {}, end() {}, pulse() {}, setRadius() {}, setPos() {}, setStacks() {} });
  FX.summon = () => ({ position: { copy() {} }, rotation: {}, visible: true, userData: {} });
  const handle = (kind) => new Proxy({ kind }, { get: (t, m) => m in t ? t[m] : (...a) => { fxLog.push(kind + '.' + String(m)); return ['fire', 'fly'].includes(m) ? handle(kind + '_' + m) : null; } });
  FX.chef = (kind) => { fxLog.push(kind); return handle(kind); };
  const learned = Object.assign({}, o.learned || {});
  const book = { sk: { slots: cf.filter(x => !['passive', 'craft'].includes(x.type)).map(x => x.id).slice(0, 4).concat(o.slots || []) }, level: id => learned[id] || 1, usable: () => true,
    passive: key => { let v = 0; for (const [id, lv] of Object.entries(learned)) { const f = SK[id] && SK[id].type === 'passive' && SK[id].flags && SK[id].flags[key]; if (f) v += f[0] + (f[1] || 0) * (lv - 1); } return v; } };
  const blocked = o.blocked || (() => false);
  const geo = { boxes: [], ground: (x, z) => ({ x, y: 0, z }), blocked: (x, z, r) => blocked(x, z, r) || geo.boxes.some(b => { const a = -b.yaw * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), dx = x - b.x, dz = z - b.z, lx = dx * c - dz * s, lz = dx * s + dz * c; return Math.abs(lx) < b.hw + r && Math.abs(lz) < b.hd + r; }),
    removeTag(t) { this.boxes = this.boxes.filter(b => b.tag !== t); } };
  const actors = [], inv = Object.assign({}, o.bag || {});
  const bag = { count: id => inv[id] | 0, remove: (id, n) => { if ((inv[id] | 0) < n) return false; inv[id] -= n; return true; } };
  const pc = { pos: { x: 0, y: 0, z: 0 }, facing: { x: 0, z: 1 }, faction: 'player', radius: 0.4, skills: { lock: 0, busy: false }, body: { sh: { actions }, play() {} }, hp: 500, maxHp: 1000, sp: 200, maxSp: 200, dead: false,
    sheet: { p: { sk: {}, job: 'chef', crafted: o.crafted || {} }, book, job: { id: 'chef' }, bag, final: { healPower: 0, foodPower: 0, shieldPower: 0 } }, status: new StatusSet(), stat: k => k === 'atk' ? 100 : k === 'crit' ? 0 : k === 'critDmg' ? 1.5 : 0,
    heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }, setFacing(x, z) { const m = Math.hypot(x, z) || 1; this.facing = { x: x / m, z: z / m }; },
    zone: { actors, geo, def: { portals: o.portals || [] }, nearestEnemy: () => actors.find(a => !a.dead && a.faction !== 'player') }, dist(t) { return Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z); },
    startLunge() {}, shield: 0, addShield(v) { this.shield = Math.max(this.shield, v); } };
  const eng = new SkillEngine(pc); pc.skills2 = eng;
  bindSkillRt({ audio: { sfx: n => sounds.push(n) }, render: { scene: { add() {}, remove() {} }, kick: (...a) => kicks.push(a), addShake() { throw new Error('no random shake'); } }, hitStop() { throw new Error('no global hit-stop'); },
    ui: { floatText() {}, toast: t => toasts.push(t) }, data: { status: id => STATUS[id], skill2: id => SK[id], config: {}, item: id => ITEM[id], job: id => ({ id, tier: id === 'chef' ? 2 : 1 }) } });
  const mon = (x, z, extra = {}) => { const m = { pos: { x, y: 0, z }, radius: 0.5, hp: 1e6, maxHp: 1e6, dead: false, zone: pc.zone, faction: 'monster', status: new StatusSet(), stat: () => 0, taken: [],
      takeDamage(hd) { this.taken.push(hd); this.hp -= hd.amount; }, ...extra }; actors.push(m); return m; };
  const ctx = (id, L = 1, more = {}) => ({ d: SK[id], id, L, grade: 1, mult: 1 + (SK[id].type === 'ultimate' ? 0.25 : 0.12) * (L - 1), origin: { ...pc.pos }, facing: { ...pc.facing }, aim: { x: 0, y: 0, z: 3 }, hitOnce: new Set(), act: SK[id].anim, ...more });
  const run = (sec) => { for (let i = 0; i < Math.round(sec / 0.01); i++) { eng.tick(0.01); for (const a of actors.slice()) if (a.isSummon && !a.dead) a.update(0.01); } };   // 소환물은 존이 갱신(game.js) — 여기서 대신
  const sum = (m, f = () => true) => m.taken.filter(f).reduce((a, h) => a + h.amount, 0);
  return { pc, eng, kit: eng.chef, mon, ctx, run, sounds, kicks, fxLog, toasts, learned, inv, sum, geo };
}
const sum = (m, f = () => true) => m.taken.filter(f).reduce((a, h) => a + h.amount, 0);
const coefDmg = (c) => CombatMath.compute(100, c, 0, 0, 1.5, 0).amount;   // 같은 공식으로 계산한 기준 피해(방어 0)

// A1 인페르노 웍: two hits on the real motion frames, total = 2.6, burn only from the 2nd, no global hit-stop / shake
{ const W = world(), m = W.mon(0, 2), side = W.mon(2.6, 1.0);
  W.eng.release(W.ctx('cf_a1')); W.run(0.9);
  ok(m.taken.length === 2 && near(sum(m) / coefDmg(1), 2.6, 0.05), 'wok: 2 hits on the front target, total 260% (' + m.taken.map(h => h.amount) + ')');
  ok(side.taken.length === 1, 'wok: wide 2nd crescent reaches the side target, short arc does not');
  ok(m.status.has('burn') && W.fxLog.includes('wok.flame'), 'wok: burn + flame fx');
  ok(W.pc.freezeT > 0 && W.kicks.length === 0, 'wok: local hit-stop only, no camera kick');
}
// A2 그랑 플람베: ignition = main damage, pre-slowed -> one steam (derived), not slowed -> none, a second cast -> once again
{ const W = world(), a = W.mon(0, 3), b = W.mon(0.8, 3.4);
  W.eng.chef.h.applyStatus(a, { id: 'slow', dur: 5, val: 0.2, ch: 1 }, W.pc);
  W.eng.release(W.ctx('cf_a2')); W.run(0.3); ok(a.taken.length === 0, 'flambe: nothing before ignition');
  W.run(0.6);
  ok(a.taken.filter(h => !h.derived).length === 1 && a.taken.filter(h => h.derived).length === 1, 'flambe: slowed target = hit + one steam');
  ok(b.taken.length === 1 && !b.taken[0].derived, 'flambe: not slowed = hit only');
  ok(a.status.has('burn') && b.status.has('burn'), 'flambe: burn');
  W.eng.release(W.ctx('cf_a2')); W.run(1);
  ok(a.taken.filter(h => h.derived).length === 2, 'flambe: steam again on the next cast (once per cast)');
}
// B2 프로즌 플레이팅: order = record -> damage -> thermal shock (consumes burn) -> freeze (pre-slowed normal) -> slow; own slow never enables freeze; boss no freeze
{ const W = world(), burning = W.mon(0, 3), slowed = W.mon(0.7, 3), plain = W.mon(-0.7, 3), boss = W.mon(0, 3.8, { isBoss: true });
  const ap = (t, id, v = 0.2) => W.eng.chef.h.applyStatus(t, { id, dur: 5, val: v, ch: 1 }, W.pc);
  ap(burning, 'burn', 0.1); ap(slowed, 'slow'); ap(boss, 'slow');
  W.eng.release(W.ctx('cf_b2')); W.run(1);
  ok(!burning.status.has('burn') && burning.taken.filter(h => h.derived).length === 1, 'plating: burn consumed + one thermal shock');
  ok(slowed.status.has('freeze') && !plain.status.has('freeze'), 'plating: pre-slowed freezes, plain (slowed by this cast) does not');
  ok(plain.status.has('slow') && !boss.status.has('freeze'), 'plating: slow applied; boss never frozen');
  ok(slowed.taken.filter(h => h.derived).length === 0, 'plating: no shock without burn');
  // synergy chain: flambe burn -> plating shock; reaction damage applies nothing
  const V = world(), t = V.mon(0, 3); V.eng.release(V.ctx('cf_a2')); V.run(1); ok(t.status.has('burn'), 'synergy: flambe burns');
  V.eng.release(V.ctx('cf_b2')); V.run(1); ok(!t.status.has('burn') && t.taken.filter(h => h.derived).length === 1, 'synergy: plating consumes that burn (thermal shock)');
}
// B1 소르베 퀸텟: 5 hits = 5 x 64 %, slow stacks to 40 %, retarget nearest when the target dies, vanish with no target
{ const W = world(), m = W.mon(0, 4);
  W.eng.release(W.ctx('cf_b1', 1, { tgt: m })); W.run(2);
  ok(m.taken.length === 5 && near(sum(m) / coefDmg(0.64), 5, 0.1), 'sorbet: 5 hits, total 320 %');
  ok(near(m.status.get('slow').value, 0.4), 'sorbet: slow stacked to the 40 % cap');
  const R = world(), a = R.mon(0, 4), b = R.mon(1.5, 5);
  R.eng.release(R.ctx('cf_b1', 1, { tgt: a })); R.run(0.75); a.dead = true; R.run(2);
  ok(a.taken.length >= 1 && a.taken.length < 5 && b.taken.length === 5 - a.taken.length, `sorbet: ${a.taken.length} on the first, ${b.taken.length} retargeted to the nearest`);
  const N = world(), c = N.mon(0, 4); N.eng.release(N.ctx('cf_b1', 1, { tgt: c })); N.run(0.4); c.dead = true; N.run(2);
  ok(c.taken.length < 5 && N.fxLog.includes('sorbet_fly.vanish'), 'sorbet: no other target -> remaining scoops vanish');
}
// A4 브로셰트 러시: pierce the line, each skewer hits a target once, total = 2.2 x fold split over the skewers
{ for (const L of [1, 5]) { const W = world(), a = W.mon(0, 3), b = W.mon(0.2, 6), off = W.mon(3, 3);
    W.eng.release(W.ctx('cf_a4', L)); W.run(1.5); const p = skewerPlan(SK.cf_a4.ops[0], L), mult = 1 + 0.12 * (L - 1);
    ok(a.taken.length === p.n && b.taken.length === p.n && off.taken.length === 0, `skewers Lv${L}: ${p.n} skewers pierce both, miss the side`);
    ok(near(sum(a) / CombatMath.compute(100, mult, 0, 0, 1.5, 0).amount, 2.2 * fold(L), 0.15), `skewers Lv${L}: total ${(sum(a) / coefDmg(mult)).toFixed(2)} = ${(2.2 * fold(L)).toFixed(2)}`); } }
// B3 밀푀유 블레이드: out once + back once per enemy; caster death -> disc scatters, no more damage
{ const W = world(), a = W.mon(0, 3), b = W.mon(0, 6);
  W.eng.release(W.ctx('cf_b3')); W.run(3);
  ok(a.taken.length === 2 && b.taken.length === 2, 'mille: each enemy hit once out + once back');
  const D = world(), c = D.mon(0, 3); D.eng.release(D.ctx('cf_b3')); D.run(0.75); const n = c.taken.length; D.pc.dead = true; D.run(2);
  ok(n === 1 && c.taken.length === 1 && D.fxLog.includes('mille.drop'), 'mille: caster down during the return -> drops, no return hit');
  const M = world(), e = M.mon(0, 3); M.eng.release(M.ctx('cf_b3')); M.run(0.5); M.pc.pos = { x: 3, y: 0, z: -2 }; M.run(3);
  ok(M.fxLog.includes('mille.catch'), 'mille: follows the moving caster and is caught');
}
// A3 시그니처 압력솥: steam slows, warning, boom after fuse (knock normal, not boss), max 2 (oldest removed silently), death -> no boom
{ const W = world(), m = W.mon(0, 3.5), boss = W.mon(0.5, 2.5, { isBoss: true });
  W.eng.exec(SK.cf_a3.ops[0], W.ctx('cf_a3')); W.run(0.6);
  ok(m.status.has('slow') && m.taken.length === 0, 'cooker: steam slows before the boom');
  W.run(1.8); ok(m.taken.length === 1 && m.status.has('burn') && m.knock && boss.taken.length === 1 && !boss.knock, 'cooker: boom damage + burn, normal knocked, boss not');
  ok(W.eng.summons.every(s => s.dead) && W.fxLog.includes('cooker.boom'), 'cooker: gone after the boom');
  const L = world(), n = L.mon(0, 3); for (let i = 0; i < 3; i++) L.eng.exec(SK.cf_a3.ops[0], L.ctx('cf_a3', 1, { aim: { x: i, y: 0, z: 3 } }));
  ok(L.eng.summons.filter(s => !s.dead).length === 2, 'cooker: at most 2'); L.run(2.5);
  ok(n.taken.length === 2, 'cooker: the replaced one never exploded');
  const D = world(), d = D.mon(0, 3); D.eng.exec(SK.cf_a3.ops[0], D.ctx('cf_a3')); D.run(0.5); D.pc.dead = true; D.run(3);
  ok(d.taken.length === 0, 'cooker: caster down -> removed without exploding');
}
// B4 슈가 아라베스크: blocks movement / straight hostile projectiles (geo), shards once on break or expiry, none on zone change / replacement
{ const W = world(), m = W.mon(0.2, 6);
  W.pc.facing = { x: 0, z: 1 }; W.eng.exec(SK.cf_b4.ops[0], W.ctx('cf_b4', 1, { aim: { x: 0, y: 0, z: 3 } }));
  ok(W.geo.blocked(0, 3, 0.3) && W.geo.blocked(1.6, 3, 0.1) && !W.geo.blocked(0, 1.5, 0.3), 'sugar wall: collider across the cast line');
  const s = W.eng.summons[0]; s.takeDamage({ amount: s.maxHp + 1 });
  const near_ = W.mon(0, 4); // spawned after break -> must not be hit later
  ok(!W.geo.blocked(0, 3, 0.3) && W.kit.log.shards === 1, 'sugar wall: broken -> collider removed, shards once');
  W.run(10); ok(W.kit.log.shards === 1, 'sugar wall: no second shard burst');
  const E = world(), e = E.mon(0, 4); E.eng.exec(SK.cf_b4.ops[0], E.ctx('cf_b4', 1, { aim: { x: 0, y: 0, z: 3 } })); E.run(8.5);
  ok(E.kit.log.shards === 1 && e.taken.length === 1 && e.taken[0].derived, 'sugar wall: expiry -> shards once');
  const Z = world(), z = Z.mon(0, 4); Z.eng.exec(SK.cf_b4.ops[0], Z.ctx('cf_b4', 1, { aim: { x: 0, y: 0, z: 3 } })); Z.eng.clearTemp(); Z.run(9);
  ok(Z.kit.log.shards === 0 && z.taken.length === 0 && !Z.geo.blocked(0, 3, 0.3), 'sugar wall: zone change -> removed, no shards');
  const R = world(); for (let i = 0; i < 3; i++) R.eng.exec(SK.cf_b4.ops[0], R.ctx('cf_b4', 1, { aim: { x: i * 5, y: 0, z: 3 } }));
  ok(R.eng.summons.filter(x => !x.dead).length === 2 && R.kit.log.shards === 0, 'sugar wall: max 2, the replaced one does not burst');
  const I = world(), x = I.mon(0.3, 3.1); I.eng.exec(SK.cf_b4.ops[0], I.ctx('cf_b4', 1, { aim: { x: 0, y: 0, z: 3 } }));
  ok(!I.geo.blocked(x.pos.x, x.pos.z, 0.3), 'sugar wall: an enemy standing on it is pushed out, never trapped inside');
  // validation (no cost spent)
  const V = world({ blocked: (bx) => bx > 1.2 }); V.eng.book.sk.slots = ['cf_b4']; V.pc.sp = 100; const cdb = V.eng.cdLeft('cf_b4');
  const err = V.eng.validate(SK.cf_b4, { x: 0, z: 3 });
  ok(err === '지형과 겹쳐 세울 수 없습니다' && V.pc.sp === 100 && V.eng.cdLeft('cf_b4') === cdb, 'sugar wall: invalid spot refused before any cost');
  ok(V.eng.cast('cf_b4', { x: 0, z: 3 }) === '지형과 겹쳐 세울 수 없습니다' && V.pc.sp === 100, 'sugar wall: cast refused, nothing spent');
}
// B5 크로캉부슈 피날레: per-enemy cap, base ring freezes normal, never boss; caster death cancels
{ const W = world(), m = W.mon(1, 1), boss = W.mon(-1, 1, { isBoss: true }), far = W.mon(5.5, 0);
  W.eng.release(W.ctx('cf_b5')); W.run(3);
  const op = SK.cf_b5.ops[0], cap = op.aura.max + op.layers.n + 1;
  ok(m.taken.length === cap && far.taken.length === op.aura.max + 1, `tower: ${m.taken.length} hits on the near enemy (cap ${cap}), far one only aura + ring`);
  ok(m.status.has('freeze') && !boss.status.has('freeze'), 'tower: base ring freezes normal enemies, not the boss');
  const D = world(), d = D.mon(1, 1); D.eng.release(D.ctx('cf_b5')); D.run(1.2); const n = d.taken.length; D.pc.dead = true; D.run(3);
  ok(d.taken.length === n, 'tower: caster down -> the remaining layers never burst');
}
// A5 마스터 셰프 쇼타임: 3 stages in order, one weak camera kick at the cloche only, outer flame ring only outside the cloche
{ const W = world(), m = W.mon(0, 2), out = W.mon(0, 7.4);
  W.eng.release(W.ctx('cf_a5')); W.run(1.3); ok(m.taken.length === 5 && W.kicks.length === 0, 'show: prep x3 + stir x2 before the cloche, no kick yet');
  W.run(0.5); ok(m.taken.length === 6 && W.kicks.length === 1 && out.taken.length === 1, 'show: cloche hit + one kick; outer ring hits outside only');
  const op = SK.cf_a5.ops[0], tot = op.prep.coef * op.prep.n + op.stir.coef * op.stir.n + op.cloche.coef;
  ok(near(sum(m) / coefDmg(1), tot, 0.15), 'show: total ' + tot);
  W.eng.cast; // cast path: chef ultimates skip the generic addShake (addShake throws in this harness)
  W.eng.book.sk.slots = ['cf_a5']; W.pc.sp = 200; W.eng.cd = {}; ok(W.eng.cast('cf_a5') === null, 'show: cast() does not call the random shake');
}
// C3 봉 아페티!: no food -> refused before any cost; eat -> heal + boost from base (no compounding), reverts after 10 s
{ const W = world({ slots: ['cf_c3'] }); W.eng.book.sk.slots = ['cf_c3']; W.pc.sp = 100;
  ok(W.eng.cast('cf_c3') === '먹을 음식이 없습니다' && W.pc.sp === 100 && W.eng.cdLeft('cf_c3') === 0, 'bon: no food -> message, nothing spent');
  const F = world({ bag: { f_course_atk: 2 } }); F.eng.book.sk.slots = ['cf_c3']; F.pc.hp = 100;
  ok(F.eng.cast('cf_c3') === null, 'bon: cast with food'); F.run(0.6);
  const s = F.pc.status.get('atkup'); ok(F.inv.f_course_atk === 1 && s && near(s.value, 0.15 * 1.5) && F.pc.hp > 100, 'bon: ate one, healed, atk 15 % -> 22.5 %');
  F.eng.cd = {}; F.eng.cast('cf_c3'); F.run(0.6); ok(near(F.pc.status.get('atkup').value, 0.225), 'bon: second use does not compound');
  F.run(10.5); ok(near(F.pc.status.get('atkup').value, 0.15), 'bon: back to the food\'s own value after 10 s');
  ok(F.pc.potionCd === undefined || F.pc.potionCd === 0, 'bon: does not start the potion cooldown');
}
// C4 셰프의 한 끗: only self-crafted units get the bonus; the counter goes down per unit eaten
{ const W = world({ learned: { cf_c4: 3 }, bag: { f_course_heal: 1 }, crafted: { 'food:f_course_heal': 1 } });
  W.inv.f_course_heal = 0; const v = W.kit.foodTouch('f_course_heal');
  ok(near(v, 0.1 + 0.05 * 2) && W.pc.sheet.p.crafted['food:f_course_heal'] === 0 && W.fxLog.includes('touch'), 'touch: self-crafted -> +20 %, leaf + sparkle');
  ok(W.kit.foodTouch('f_course_heal') === 0, 'touch: bought / found food -> no bonus');
  const N = world({ bag: { f_soup: 1 }, crafted: { 'food:f_soup': 1 } }); N.inv.f_soup = 0; ok(N.kit.foodTouch('f_soup') === 0 && N.pc.sheet.p.crafted['food:f_soup'] === 0, 'touch: passive not learned -> no bonus (count still follows the bag)');
  const R = world({ learned: { cf_c4: 1 } }); R.pc.sheet.p.crafted['food:f_soup'] = 1;
  R.kit.applyFood(ITEM.f_soup, 0.1); const s = R.pc.status.get('regen'); ok(s && near(s.remaining, 20 * 1.1) && near(s.value, 0.015 * 1000 * 1.1), 'touch: regen longer and stronger');
}
// C5 로열 그랑 디너: shield -> attack -> heal at each lid; caster death cancels the rest; zone change too
{ const W = world(); W.pc.hp = 100;
  W.eng.release(W.ctx('cf_c5')); W.run(0.5); ok(W.pc.shield > 0 && !W.pc.status.has('atkup') && W.pc.hp === 100, 'royal: lid 1 -> shield only');
  W.run(0.5); ok(W.pc.status.has('atkup') && W.pc.hp === 100, 'royal: lid 2 -> attack');
  W.run(0.5); ok(W.pc.hp === 500, 'royal: lid 3 -> 40 % heal');
  const D = world(); D.pc.hp = 100; D.eng.release(D.ctx('cf_c5')); D.run(0.6); D.pc.dead = true; D.run(1.5); D.pc.dead = false; D.run(1);
  ok(D.pc.hp === 100 && !D.pc.status.has('atkup') && D.fxLog.includes('royal.cancel'), 'royal: caster down -> remaining trays cancelled (even after revival)');
  const Z = world(); Z.pc.hp = 100; Z.eng.release(Z.ctx('cf_c5')); Z.run(0.6); Z.eng.clearTemp(); Z.run(2); ok(Z.pc.hp === 100, 'royal: zone change cancels');
}
// C2 황금 부용: heals me + living summons, one pot (recast replaces)
{ const W = world(); W.pc.hp = 100; const op = SK.cf_c2.ops[0];
  W.eng.exec(op, W.ctx('cf_c2', 1, { aim: { x: 0, y: 0, z: 0 } })); W.eng.exec(op, W.ctx('cf_c2', 1, { aim: { x: 0, y: 0, z: 0 } }));
  ok(W.eng.areas.filter(a => !a.dead).length === 1, 'broth: one pot at a time'); W.run(3.05);
  ok(near(W.pc.hp, 100 + 4 * 25, 1), 'broth: 2.5 % per second (ticks at 0, 1, 2, 3 s) (' + W.pc.hp + ')');
}
// cleanup: zone change / death clears every pending chef thing
{ const W = world(), m = W.mon(0, 3); W.eng.release(W.ctx('cf_a2')); W.eng.release(W.ctx('cf_b1', 1, { tgt: m })); W.run(0.1); W.eng.clearTemp(); W.run(3);
  ok(m.taken.length === 0 && W.kit.live.length === 0 && W.kit.timers.length === 0, 'clearTemp: no pending chef damage'); }
// damage totals do not multiply with hits: data check
ok(near(SK.cf_a1.ops[0].coef1 + SK.cf_a1.ops[0].coef2, 2.6) && near(SK.cf_b1.ops[0].coef * SK.cf_b1.ops[0].n, 3.2), 'totals kept from the old chef numbers (A1 260 %, B1 320 %)');
console.log('chef: ' + pass + ' passed');
