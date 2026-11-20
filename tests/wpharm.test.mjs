// 양약사 2차 규칙(js/wpharm.js + js/skillrt.js)을 WebGL 없이 확인: 데이터(id·배우는 레벨·계열 이름·아이콘·제작법), 예전 저장 호환(레벨·포인트·칸·제작법),
// 작열·분열 캡슐, 표식(최대 3·8초·시전마다 대상당 1·약사 약병은 이중정을 배워야 + 던질 때마다 1·사망 정리), 발포정(작은 기포·큰 기포·둔화 보너스),
// 이온·삼상·대형 캡슐 붕괴, 이중정(정확히 두 번·따라감·2초·표식 1), 긴급 방출(고르는 순서·자원 안 씀·자연 만료와 겹쳐도 한 번),
// 연쇄 용출·임계 농도(새 수치로도 표식 수에 따라 강해짐), 서방형 미립자, 최종 처방, 구급함(가장 낮은 HP 비율·건강하면 아낌·닫힘),
// 서방 패치(세 번·움직여도·기본 나), 붕대 릴(벽 앞에서 멈춤·도착 회복·소환물 없으면 나), 다층 코팅막, 궁극기 카메라, 스킬창 수치 문구.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { HitShape, CombatMath, StatusSet, clamp, clamp01, GameData, CharacterSheet, newProfile, migrate } from '../js/core.js';
import { skillSound } from '../js/sfx.js';
import { SmithKit, clearLine } from '../js/smith.js';
import { WpKit, WP, wpLevelText } from '../js/wpharm.js';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const S2 = JSON.parse(read('../assets/data/skills2.json')), skills = S2.skills, SK = Object.fromEntries(skills.map(s => [s.id, s]));
const STATUS = Object.fromEntries(S2.statuses.map(s => [s.id, s])); STATUS.regen = { id: 'regen', name: '재생', kind: 'hot', tick: 1, debuff: false };
const actions = Object.fromEntries(JSON.parse(read('../assets/models/actions.json')).map(a => [a.name, a]));
const sandbox = { HitShape, CombatMath, clamp, clamp01, skillSound, SmithKit, clearLine, WpKit, console };
vm.createContext(sandbox);
vm.runInContext(read('../js/skillrt.js').replace(/^import .*;\n/gm, '').replace(/\bexport /g, '') + '\nthis.api={SkillEngine,bindSkillRt,FX,CUSTOM};', sandbox);
const { SkillEngine, bindSkillRt, FX, CUSTOM } = sandbox.api;
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; };
Math.random = () => 0.5;   // 피해 굴림 고정(±8% 없음, 치명 없음)

// ------------------------------------------------------------------ data
const wp = skills.filter(s => s.job === 'western_pharmacist');
ok(wp.length === 15, '15 western pharmacist skills');
const UNL = [30, 33, 36, 40, 45];
for (const c of 'abc') for (let i = 1; i <= 5; i++) { const d = SK[`wp_${c}${i}`]; ok(d && d.unlock === UNL[i - 1] && d.maxLv === (d.type === 'ultimate' ? 3 : 5) && d.tier === 2, 'id/unlock/max kept wp_' + c + i); }
ok(['정밀 제약술', '표적 전달과 약물 반응', '첨단 조제와 생체 보호'].every((n, i) => wp.filter(s => s.cat === i).every(s => s.catName === n)), 'line titles');
const NEW = { wp_b1: ['이중정', 'attack', 'wp_tablet'], wp_a2: ['발포정', 'attack', 'wp_foam'], wp_b2: ['긴급 방출', 'attack', 'wp_release'], wp_c1: ['구급함 전개', 'support', 'wp_kit'], wp_c2: ['서방 패치', 'support', 'wp_patch'], wp_c3: ['구조용 붕대 릴', 'support', 'wp_reel'] };
for (const [id, [nm, ty, fn]] of Object.entries(NEW)) ok(SK[id].name === nm && SK[id].type === ty && SK[id].ops.some(o => o.fn === fn), 'new ' + id + ' ' + nm);
ok(SK.wp_b1.unlock === 30 && SK.wp_a2.unlock === 33 && SK.wp_b2.unlock === 33 && SK.wp_c1.unlock === 30 && SK.wp_c2.unlock === 33 && SK.wp_c3.unlock === 36, 'new skills keep the slot unlock levels (30/33/33/30/33/36)');
ok(['wp_a1', 'wp_a3', 'wp_a4', 'wp_a5', 'wp_b3', 'wp_b4', 'wp_b5', 'wp_c4', 'wp_c5'].every(id => ['작열·분열 캡슐', '이온 관통술', '삼상 복합제', '대형 캡슐 붕괴', '연쇄 용출', '서방형 미립자', '임계 농도', '다층 코팅막', '최종 처방·생명 유지'].includes(SK[id].name)), 'nine kept skills');
ok(SK.wp_a5.type === 'ultimate' && SK.wp_b5.type === 'ultimate' && SK.wp_b4.type === 'passive' && SK.wp_c5.type === 'passive' && !wp.some(s => s.type === 'craft'), 'types: no craft skill left in combat lines');
ok(SK.wp_c1.recipes.join() === 'r_potion_l' && SK.wp_c2.recipes.join() === 'r_regen_hp,r_regen_sp' && SK.wp_c1.craftName && SK.wp_c2.craftName, 'recipes still linked to wp_c1 / wp_c2 (습득 효과 제작법)');
ok(S2.recipes.some(r => r.id === 'r_potion_l' && r.skill === 'wp_c1') && S2.items.some(i => i.id === 'c_potion_l') && S2.items.some(i => i.id === 'c_regen_hp') && S2.items.some(i => i.id === 'c_regen_sp'), 'consumables + recipes kept');
ok(!S2.statuses.some(s => s.id === 'catalyst' || s.id === 'prescribed') && !wp.some(s => s.ops.some(o => o.fn === 'wp_catalyst' || o.fn === 'wp_carrier')), 'catalyst charges / carrier removed');
ok(SK.wp_c5.icd === 120, 'ICD in data');
for (const s of wp) ok(existsSync(new URL(`../assets/ui/skills/${s.id}.png`, import.meta.url)), 'icon ' + s.id);
for (const a of ['wp_compound', 'wp_condense', 'wp_flick', 'wp_drop', 'wp_snap', 'wp_place', 'wp_patch', 'wp_reel']) ok(actions[a] && actions[a].stow, 'motion ' + a + ' (pestle on the back)');
for (const s of wp) ok(SK[s.id].anim === null || actions[SK[s.id].anim], 'anim exists ' + s.id);
for (const s of wp) ok(s.id === 'wp_c4' || wpLevelText(s, 1) && wpLevelText(s, s.maxLv) !== wpLevelText(s, 1), 'level text ' + s.id);
ok(/80%.*150%.*230%/.test(wpLevelText(SK.wp_b1, 1)) && /표식 1/.test(wpLevelText(SK.wp_b1, 1)), 'B1 text: 80% + 150% = 230%, mark');
ok(/쿨타임을 쓰지 않음/.test(wpLevelText(SK.wp_b2, 1)) && !/표식/.test(wpLevelText(SK.wp_b2, 1).replace('표식은', '')), 'B2 text');
ok(!/표적 전달|촉매/.test(wp.map(s => s.desc + wpLevelText(s, 1)).join()), 'no tooltip mentions the removed carrier / catalyst');

// ------------------------------------------------------------------ harness
function world(o = {}) {
  const sounds = [], kicks = [], fxLog = [];
  for (const k of Object.keys(FX).filter(k => k !== 'on')) FX[k] = () => ({ set() {}, dispose() {}, end() {}, pulse() {}, setStacks() {} });
  const handle = (kind) => new Proxy({ kind }, { get: (t, m) => m in t ? t[m] : (...a) => { fxLog.push(kind + '.' + String(m)); return null; } });
  FX.wp = (kind) => { fxLog.push(kind); return handle(kind); };
  const learned = Object.assign({ wp_b1: 1 }, o.learned || {});
  const book = { sk: { slots: o.slots || wp.filter(x => x.type !== 'passive' && x.type !== 'craft').map(x => x.id).slice(0, 4) }, level: id => learned[id] || 0, usable: id => (learned[id] || 0) > 0, passive: key => { let v = 0; for (const [id, lv] of Object.entries(learned)) { const f = SK[id] && SK[id].type === 'passive' && SK[id].flags && SK[id].flags[key]; if (f) v += f[0] + (f[1] || 0) * (lv - 1); } return v; } };
  const geo = { ground: (x, z) => ({ x, y: 0, z }), blocked: o.blocked || (() => false), move: (p, dx, dz) => ({ x: p.x + dx, y: 0, z: p.z + dz }) };
  const actors = [];
  const things = [];
  const pc = { pos: { x: 0, y: 0, z: 0 }, radius: 0.4, facing: { x: 0, z: 1 }, target: null, faction: 'player', skills: { lock: 0, busy: false }, body: { sh: { actions }, play() {} }, hp: 500, maxHp: 500, sp: 999, maxSp: 999,
    sheet: { p: { sk: o.sk || {}, job: 'western_pharmacist', weapon: '' }, book, job: { id: 'western_pharmacist', parent: 'pharmacist' }, final: { shieldPower: 0, healPower: 0 } }, status: new StatusSet(), stat: k => k === 'atk' ? 100 : k === 'crit' ? 0 : k === 'critDmg' ? 1.5 : 0,
    setFacing(x, z) { const m = Math.hypot(x, z) || 1; this.facing = { x: x / m, z: z / m }; }, zone: { actors, things, geo, def: { portals: [] }, nearestEnemy: () => actors.find(a => !a.dead) }, dist(t) { return Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z); },
    startLunge() {}, shield: 0, dead: false, shieldT: 0, addShield(v, d) { this.shield = Math.max(this.shield, v); this.shieldT = d; }, heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); } };
  bindSkillRt({ audio: { sfx: n => sounds.push(n) }, render: { kick: (...a) => kicks.push(a), addShake() { throw new Error('no random shake'); } }, ui: { floatText() {}, toast() {}, damageText() {}, impactText() {} }, hitStop() { throw new Error('no global hit-stop'); },
    data: { status: id => STATUS[id], skill2: id => SK[id], config: {}, item: () => null, skillsOf: () => [], job: (id) => ({ id, tier: id === 'western_pharmacist' ? 2 : 1, parent: 'pharmacist' }) } });
  const eng = new SkillEngine(pc); pc.skills2 = eng;
  const mon = (x, z, extra = {}) => { const m = { pos: { x, y: 0, z }, radius: 0.5, hp: 1e6, maxHp: 1e6, dead: false, zone: pc.zone, faction: 'monster', status: new StatusSet(), stat: () => 0, taken: [], uid: actors.length + 1,
      takeDamage(hd) { this.taken.push(hd); this.hp -= hd.amount; }, ...extra }; actors.push(m); return m; };
  const ctx = (id, L = 1, more = {}) => ({ d: SK[id], id, L, grade: 1, mult: 1 + (SK[id].type === 'ultimate' ? 0.25 : 0.12) * (L - 1), origin: { ...pc.pos }, facing: { ...pc.facing }, aim: { x: 0, y: 0, z: 3 }, hitOnce: new Set(), ...more });
  const run = (sec) => { for (let i = 0; i < Math.round(sec / 0.01); i++) { eng.tick(0.01); for (const m of actors) if (m.status.list.length) m.status.tick(0.01, () => {}, () => {}); } };
  const living = (x, z, hp = 0.5, extra = {}) => { const s = { vanish() { this.dead = true; }, living: true, machine: false, dead: false, isSummon: true, faction: 'player', hp: 100 * hp, maxHp: 100, radius: 0.4, pos: { x, y: 0, z }, knock: { x: 0, z: 0 }, ...extra }; eng.summons.push(s); return s; };
  const cast = (id, L, more) => { learned[id] = L || learned[id] || 1; const c = ctx(id, learned[id], more); eng.wp.onCast(SK[id], c); for (const op of SK[id].ops) eng.exec(op, c); return c; };
  return { pc, eng, kit: eng.wp, mon, ctx, run, cast, sounds, kicks, fxLog, learned, living, things, book };
}
const sum = (m, from = 0) => m.taken.slice(from).reduce((a, h) => a + h.amount, 0);
const marks = (m) => (m._marks ? m._marks.reaction : 0);

// ------------------------------------------------------------------ A1 작열·분열 캡슐: total = old 0.6 + 2.8, five granules + ring, marks once
{ const W = world(), m = W.mon(0, 4);
  W.cast('wp_a1', 1, { tgt: m }); W.run(1.2);
  ok(m.taken.length === 6, 'five granules + reaction ring = 6 hits (' + m.taken.length + ')');
  ok(Math.abs(sum(m) - 340) <= 3, 'total damage = old 3.4 coef (' + sum(m) + ')');
  ok(m.taken.every(h => h.localStop === 'quiet'), 'no global hit-stop path');
  ok(marks(m) === 1, 'one mark per cast');
  ok(m.status.has('burn'), 'ring burns');
  ok(W.fxLog.filter(x => x === 'capsule.hit').length === 5 && W.fxLog.includes('capsule.ring'), 'fx: 5 granule hits + ring');
  ok(W.sounds.includes('wp_granule') && W.sounds.includes('wp_ring'), 'granule / ring sounds');
  const W5 = world(), m5 = W5.mon(0, 4); W5.cast('wp_a1', 5, { tgt: m5 }); W5.run(1.2);
  ok(Math.abs(sum(m5) - 340 * 1.48) <= 4, 'Lv5 total = 3.4 x 1.48 (' + sum(m5) + ')');
}
{ const W = world(), a = W.mon(0, 4), b = W.mon(1.5, 4.5);
  W.cast('wp_a1', 1, { tgt: a }); W.run(0.6); a.dead = true; const nb = b.taken.length; W.run(0.8);
  ok(b.taken.length - nb >= 3, 'dead target -> remaining granules retarget the nearest enemy');
  const W2 = world(), c = W2.mon(0, 4); W2.cast('wp_a1', 1, { tgt: c }); W2.run(0.6); const n2 = c.taken.length; c.dead = true; W2.run(0.8);
  ok(c.taken.length === n2 && W2.fxLog.includes('capsule.fizzle'), 'no enemy left -> granules vanish, no damage');
}
// ------------------------------------------------------------------ marks: cap 3, refresh 8 s, one per cast, flask marks need 이중정 + once per throw
{ const W = world(), m = W.mon(0, 4);
  for (let i = 0; i < 5; i++) { W.cast('wp_a3', 1); W.run(0.4); }
  ok(marks(m) === 3, 'marks capped at 3');
  W.run(7.0); ok(marks(m) === 3, 'still there after 7 s (refreshed on add)'); W.run(1.2); ok(marks(m) === 0, 'expire after 8 s');
  const W2 = world(), x = W2.mon(0, 4); W2.cast('wp_a4', 1, { tgt: x }); W2.run(1.2); ok(marks(x) === 1, 'three hits in one cast -> one mark');
  // 약사 1차 약병(tag flask): 같은 던짐(ctx)의 여러 타격·장판은 1개, 던질 때마다 1개 — 이중정을 배워야
  const W3 = world(), f = W3.mon(0, 3), c1 = W3.ctx('wp_a3');
  for (let i = 0; i < 4; i++) W3.eng.onHit(f, { tag: 'flask' }, c1); ok(marks(f) === 1, 'one flask throw (multi-hit / lingering ticks on the same ctx) -> one mark');
  W3.eng.onHit(f, { tag: 'flask' }, W3.ctx('wp_a3')); ok(marks(f) === 2, 'next throw -> +1');
  const W4 = world({ learned: { wp_b1: 0 } }), g = W4.mon(0, 3); W4.eng.onHit(g, { tag: 'flask' }, W4.ctx('wp_a3')); ok(marks(g) === 0, 'without 이중정 learned: flasks leave no mark');
  // 약병폭격(10병이 한 시전) -> 한 번
  const W5 = world(), r = W5.mon(0, 3); SK.ph1_b6 && SK.ph1_b6.ops.forEach(op => W5.eng.exec(op, W5.ctx('ph1_b6', 1, { aim: { x: 0, y: 0, z: 3 } }))); W5.run(2.5);
  ok(r.taken.length >= 2 && marks(r) === 1, 'flask bombardment: ' + r.taken.length + ' bottle hits -> 1 mark');
  const W6 = world(), y = W6.mon(0, 4); W6.cast('wp_a3', 1); W6.run(0.4); y.dead = true; W6.run(0.05); ok(!y._marks && !y._markFx, 'dead enemy: marks + mark visuals removed');
}
// ------------------------------------------------------------------ A2 발포정: drop -> small bubbles x5 -> big bubble (mark once), slowed bonus, low cap
{ const W = world(), a = W.mon(0, 3), b = W.mon(1.2, 3.5), out = W.mon(0, 6), op = SK.wp_a2.ops[0];
  W.cast('wp_a2', 1, { aim: { x: 0, y: 0, z: 3 } }); W.run(0.3); ok(!a.taken.length, 'foam: nothing before it lands');
  W.run(0.3 + 0.5); ok(a.taken.length === 1 && b.taken.length === 1 && !out.taken.length, 'first small bubble at land + 0.5 s, only inside r');
  W.run(1.7); ok(a.taken.length === 5, 'five small bubbles (' + a.taken.length + ')'); ok(marks(a) === 0, 'small bubbles leave no mark');
  W.run(0.6); ok(a.taken.length === 6 && marks(a) === 1 && marks(b) === 1, 'final big bubble: +1 hit, one mark');
  ok(Math.abs(sum(a) - 100 * (op.tick * 5 + op.fin)) <= 6, 'foam total = 0.3x5 + 1.5 = 300% (' + sum(a) + ')');
  ok(W.kit.log.finals === 1 && !W.kit.foams.length, 'foam gone after the final bubble');
  W.run(2); ok(a.taken.length === 6, 'nothing more after the final');
  const W2 = world(), s = W2.mon(0, 3), n = W2.mon(0.5, 3); s.status.apply(STATUS.slow, 6, 0.35);
  W2.cast('wp_a2', 1, { aim: { x: 0, y: 0, z: 3 } }); W2.run(3.2); ok(sum(s) > sum(n) * 1.2 && Math.abs(sum(s) / sum(n) - 1.25) < 0.03, 'slowed enemy takes +25% from the bubbles (' + sum(s) + ' vs ' + sum(n) + ')');
  const W3 = world(), d = W3.mon(0, 3); W3.cast('wp_a2', 1, { aim: { x: 0, y: 0, z: 3 } }); W3.cast('wp_a2', 1, { aim: { x: 5, y: 0, z: 3 } }); W3.cast('wp_a2', 1, { aim: { x: -5, y: 0, z: 3 } });
  ok(W3.kit.foams.length === 2 && !W3.kit.foams.some(F => F.c.x === 0), 'max 2 foams: the oldest goes quietly (no final)'); W3.run(3.2); ok(!d.taken.length, 'replaced foam never hits');
}
// ------------------------------------------------------------------ B1 이중정: exactly 2 hits, follows, 2 s, mark once, blink x2
{ const W = world(), m = W.mon(0, 4), op = SK.wp_b1.ops[0];
  W.cast('wp_b1', 1, { tgt: m }); W.run(0.15); ok(!m.taken.length, 'tablet still in flight');
  W.run(0.1); ok(m.taken.length === 1 && marks(m) === 1 && Math.abs(m.taken[0].amount - 80) <= 1, 'outer shell: 80% + one mark (' + (m.taken[0] && m.taken[0].amount) + ')');
  m.pos.x = 3; m.pos.z = 6;   // the enemy walks away: the core stays on it
  W.run(0.95); ok(W.fxLog.filter(x => x === 'tablet.blink').length === 1, 'first blink at 1.0 s left');
  W.run(0.5); ok(W.fxLog.filter(x => x === 'tablet.blink').length === 2 && m.taken.length === 1, 'second blink at 0.5 s left, no damage yet');
  W.run(0.6); ok(m.taken.length === 2 && Math.abs(m.taken[1].amount - 150) <= 1, 'core bursts 2 s after the shell: 150% (' + (m.taken[1] && m.taken[1].amount) + ')');
  ok(marks(m) === 1, 'core makes no mark'); W.run(3); ok(m.taken.length === 2, 'exactly two hits');
  ok(m.taken.every(h => h.localStop === 'quiet') && W.sounds.includes('wp_shell') && W.sounds.includes('wp_core') && W.sounds.filter(s => s === 'wp_blink').length === 2, 'quiet hits + shell / blink x2 / core sounds');
  const W5 = world(), m5 = W5.mon(0, 4); W5.cast('wp_b1', 5, { tgt: m5 }); W5.run(2.4); ok(Math.abs(sum(m5) - 230 * 1.48) <= 3, 'Lv5 = 230% x 1.48 (' + sum(m5) + ')');
  const W2 = world(), k = W2.mon(0, 4); W2.cast('wp_b1', 1, { tgt: k }); W2.run(0.5); k.dead = true; W2.run(2); ok(k.taken.length === 1 && W2.fxLog.includes('tablet.fizzle'), 'target died: core fizzles, no 2nd hit');
}
// ------------------------------------------------------------------ B2 긴급 방출: priority, no cost if nothing, never double
{ const slots = ['wp_b1', 'wp_b2', 'wp_a2', 'wp_b3'];
  const W = world({ slots, learned: { wp_b2: 1 } }), pc = W.pc, a = W.mon(0, 4), b = W.mon(3, 4);
  const sp0 = pc.sp; ok(W.eng.cast('wp_b2', { x: 0, z: 3 }) === '방출할 제제가 없습니다' && pc.sp === sp0 && !W.eng.cdLeft('wp_b2'), 'nothing to release: refused, no stamina / cooldown');
  W.cast('wp_b1', 1, { tgt: a }); W.run(0.3); W.cast('wp_a2', 1, { aim: { x: 3, y: 0, z: 4 } }); W.run(0.5);
  pc.target = a; const n0 = a.taken.length, b0 = b.taken.length;
  ok(W.eng.cast('wp_b2', { x: 3, z: 4 }) == null && pc.sp < sp0 && W.eng.cdLeft('wp_b2') > 0, 'release cast spends stamina + cooldown'); W.run(0.02);
  ok(a.taken.length === n0 + 1 && b.taken.length === b0 && W.kit.log.released.at(-1).kind === 'core', 'selected enemy\'s core first (even with the aim on the foam)');
  ok(Math.abs(a.taken.at(-1).amount - 150 * 1.1) <= 1, 'released core +10% (Lv1)');
  W.run(2.2); ok(a.taken.length === n0 + 1, 'natural expiry after a manual release: no second core hit');
  // foam: nearest to the aim, skips remaining small bubbles
  const W2 = world({ slots, learned: { wp_b2: 1 } }), e = W2.mon(0, 3), f = W2.mon(6, 3);
  W2.cast('wp_a2', 1, { aim: { x: 0, y: 0, z: 3 } }); W2.cast('wp_a2', 1, { aim: { x: 6, y: 0, z: 3 } }); W2.run(1.0);
  const e0 = e.taken.length, f0 = f.taken.length; W2.pc.target = null;
  W2.eng.cd = {}; ok(W2.eng.cast('wp_b2', { x: 5.5, z: 3 }) == null, 'release with two foams'); W2.run(0.02);
  ok(f.taken.length === f0 + 1 && e.taken.length === e0 && marks(f) === 1 && W2.kit.foams.length === 1, 'the foam nearest to the aim pops its big bubble now (+mark)');
  W2.run(3); ok(f.taken.length === f0 + 1, 'released foam: remaining small bubbles + natural final never happen');
  ok(W2.kit.log.finals === 2, 'other foam finished normally (finals counted once each)');
  // same frame: manual + natural on the same core -> one hit
  const W3 = world({ slots, learned: { wp_b2: 1 } }), g = W3.mon(0, 4); W3.cast('wp_b1', 1, { tgt: g }); W3.run(0.2 + 2.0 - 0.005); const T = W3.kit.tablets[0];
  W3.pc.target = g; W3.eng.cast('wp_b2', null); W3.eng.tick(0.01); W3.eng.tick(0.01); W3.run(0.5);
  ok(g.taken.length === 2 && W3.kit.log.cores === 1, 'manual release + natural expiry on the same frame: the core hits once');
  // release uses no reaction marks
  const W4 = world({ slots, learned: { wp_b2: 1 } }), h = W4.mon(0, 4); W4.kit.mark(h, W4.ctx('wp_a3')); W4.cast('wp_b1', 1, { tgt: h }); W4.run(0.3); const mk = marks(h); W4.pc.target = h; W4.eng.cast('wp_b2', null); W4.run(0.05);
  ok(marks(h) === mk, 'release does not consume reaction marks (chain/critical resource stays)');
}
// ------------------------------------------------------------------ B3 chain (rebalanced): marked only, no repeats, cap, separate casts, scales with marks
{ const W = world({ learned: { wp_b4: 1 } });
  const ms = [0, 1, 2, 3, 4, 5, 6, 7].map(i => W.mon(0, 3 + i * 3)); const un = W.mon(2, 4);
  for (const m of ms) W.kit.mark(m, W.ctx('wp_a3'));
  W.cast('wp_b3', 1, { tgt: ms[0] }); W.run(3);
  const log = W.kit.log.chains.at(-1);
  ok(log.nodes.length === 5, 'chain stops at max 5 (' + log.nodes.length + ')');
  ok(new Set(log.nodes.map(n => n.id)).size === log.nodes.length, 'no enemy visited twice');
  ok(marks(ms[5]) === 1 && marks(ms[0]) === 0, 'beyond the cap: marks kept');
  ok(!un._marks && un.taken.every(h => h.derived), 'unmarked neighbour never linked (only splash)');
  const before = W.kit.log.chains.length; W.cast('wp_b3', 1, { tgt: ms[6] }); W.run(3); W.cast('wp_b3', 1, { tgt: ms[6] }); W.run(3);
  ok(W.kit.log.chains.length === before + 2 && W.kit.log.chains.at(-1).nodes.length === 1, 'separate casts keep separate visited sets');
  const op = SK.wp_b3.ops[0], first = (n) => { const V = world(), t = V.mon(0, 3); for (let i = 0; i < n; i++) V.kit.mark(t, V.ctx('wp_a3')); V.cast('wp_b3', 1, { tgt: t }); V.run(0.4); return t.taken[0].amount; };
  const d0 = first(0), d1 = first(1), d3 = first(3);
  ok(d0 === Math.round(100 * op.coef) && d3 === Math.round(100 * op.coef * (1 + op.perStack * 3)) && d3 > d1 && d1 > d0, `chain start: 0/1/3 marks = ${d0}/${d1}/${d3}%`);
  ok(d3 >= 500, 'three marks without the old carrier still reach the old carried value (>= 500%, old 1.6 x 2.5 x 1.3 = 520)');
}
// ------------------------------------------------------------------ A3
{ const W2 = world(), l1 = W2.mon(0, 2), l2 = W2.mon(0.3, 7), off = W2.mon(3, 3);
  W2.cast('wp_a3', 1); W2.run(0.25); ok(!l1.taken.length, 'ion: hit lands at the strike, not before'); W2.run(0.2);
  ok(l1.taken.length === 1 && l2.taken.length === 1 && !off.taken.length, 'ion: one main hit per enemy on the line, none off it');
}
// ------------------------------------------------------------------ A4 compound once / A5 ultimate kick once at contact
{ const W = world(), m = W.mon(0, 4); W.cast('wp_a4', 1, { tgt: m }); W.run(1.3);
  ok(m.taken.length === 4 && W.fxLog.includes('triad.compound'), 'three element hits + one compound reaction');
  const W2 = world(), k = W2.mon(0, 4); W2.cast('wp_a4', 1, { tgt: k }); W2.run(0.5); k.dead = true; W2.run(0.8); ok(!W2.fxLog.includes('triad.compound'), 'no compound if not all three hit');
  const W3 = world(), u = W3.mon(0, 3), v = W3.mon(2, 3); W3.cast('wp_a5', 1, { aim: { x: 0, y: 0, z: 3 } }); W3.run(1.0);
  ok(!u.taken.length && !W3.kicks.length, 'collapse: no damage / camera before contact'); W3.run(0.1);
  ok(u.taken.length === 1 && v.taken.length === 1 && W3.kicks.length === 1, 'collapse: one hit each + one camera kick at contact');
  ok(Math.abs(u.taken[0].amount - 1000) <= 2, 'collapse Lv1 = 1000% (' + u.taken[0].amount + ')');
}
// ------------------------------------------------------------------ B4 zones: derived, no marks, merge, cap
{ const W = world({ learned: { wp_b4: 5 } }), m = W.mon(0, 3);
  W.kit.mark(m, W.ctx('wp_a3')); W.cast('wp_b3', 1, { tgt: m }); W.run(0.3);
  ok(W.kit.zones.length === 1, 'consumed marks -> one granule zone'); const n0 = m.taken.length;
  W.run(1.05); const dot = m.taken.slice(n0); ok(dot.length >= 1 && dot.every(h => h.derived), 'zone ticks are derived damage');
  ok(Math.abs(dot[0].amount - Math.round(100 * (0.25 + 0.08 * 4))) <= 1, 'zone tick = residue % (' + dot[0].amount + ')');
  ok(marks(m) === 0 && W.kit.zones.length === 1, 'zone never makes marks / zones');
  W.kit.mark(m, W.ctx('wp_a3')); W.cast('wp_b3', 1, { tgt: m }); W.run(0.3); ok(W.kit.zones.length === 1, 'same spot -> refreshed, not a new zone');
  const W2 = world({ learned: { wp_b4: 1 } }), e = W2.mon(0, 3); W2.cast('wp_b3', 1, { tgt: e }); W2.run(0.3); ok(!W2.kit.zones.length, 'no marks consumed -> no zone');
  for (let i = 0; i < 5; i++) W.kit.residue({ x: 10 + i * 3, z: 0 }, W.ctx('wp_b3')); ok(W.kit.zones.length === 3, 'max 3 zones at once');
  W.run(4.2); ok(!W.kit.zones.length, 'zones expire');
}
// ------------------------------------------------------------------ B5 critical mass (rebalanced): scales with marks, capped
{ const op = SK.wp_b5.ops[0], dmgWith = (n) => { const W = world(); const ms = []; for (let i = 0; i < n; i++) { const m = W.mon(i % 2 ? 1 : -1, 1 + i * 0.4); for (let k = 0; k < 3; k++) W.kit.mark(m, W.ctx('wp_a3')); ms.push(m); }
    const probe = W.mon(0, 4.5); W.cast('wp_b5', 1); W.run(1.2); return { amt: probe.taken[0] && probe.taken[0].amount, ms, W }; };
  const r0 = dmgWith(0), r1 = dmgWith(1), r2 = dmgWith(2), r4 = dmgWith(4);
  ok(r0.amt === Math.round(100 * op.base), 'no marks: low base (' + r0.amt + ')');
  ok(r1.amt === Math.round(100 * (op.base + op.per * 3)), '3 marks (' + r1.amt + ')');
  ok(r2.amt === Math.round(100 * (op.base + op.per * 6)) && r2.amt >= 590, '6 marks (two enemies) >= old 6-mark value with carrier (' + r2.amt + ')');
  ok(r4.amt === Math.round(100 * (op.base + op.per * 9)), '12 marks capped at 9 (' + r4.amt + ')');
  ok(r4.ms.every(m => marks(m) === 0), 'all marks in range consumed');
  ok(r4.W.kicks.length === 1, 'one camera kick on the main burst');
}
// ------------------------------------------------------------------ C1 구급함: lowest HP %, saves patches while healthy, closes on 3 used / timeout
{ const W = world(), pc = W.pc, op = SK.wp_c1.ops[0];
  pc.hp = pc.maxHp; W.cast('wp_c1', 1); W.run(3); ok(W.kit.kitS && W.kit.kitS.left === 3, 'everyone healthy: patches saved');
  const s = W.living(2, 1, 0.4); pc.hp = pc.maxHp * 0.6; W.run(0.75);
  ok(W.kit.kitS.left === 2 && s.hp > 40 && pc.hp === pc.maxHp * 0.6, 'lowest HP ratio first: the living summon (40%) before me (60%)');
  ok(Math.abs(s.hp - 40 - 100 * op.pct) < 0.5, 'patch heals 12% of max HP');
  W.run(1.1); ok(W.kit.kitS.left === 1 && Math.abs(s.hp - 64) < 0.5 && pc.hp === pc.maxHp * 0.6, 'second patch: the summon is still the lowest (52% < 60%)');
  W.run(1.1); ok(pc.hp > pc.maxHp * 0.6 && Math.abs(s.hp - 64) < 0.5, 'third patch -> me (now the lowest)');
  W.run(0.2); ok(!W.kit.kitS && W.kit.log.kitClosed === 'used', 'bag closes after the third patch');
  const mech = { living: false, machine: true, dead: false, hp: 5, maxHp: 100, radius: 0.4, pos: { x: 1, y: 0, z: 0 } }, W2 = world(); W2.eng.summons.push(mech); W2.pc.hp = W2.pc.maxHp;
  W2.cast('wp_c1', 1); W2.run(11.5); ok(mech.hp === 5 && !W2.kit.kitS && W2.kit.log.kitClosed === 'time', 'machines never healed; timeout closes the bag');
  const far = W2.living(9, 0, 0.2); W2.cast('wp_c1', 1); W2.run(2); ok(far.hp === 20, 'out of range: no patch');
  const W3 = world(); W3.pc.hp = W3.pc.maxHp * 0.3; W3.cast('wp_c1', 1); W3.run(4); ok(W3.pc.hp > W3.pc.maxHp * 0.6 && W3.kit.kitS == null, 'solo: all three patches heal me');
}
// ------------------------------------------------------------------ C2 서방 패치: 3 heals while moving, default self, selected living summon
{ const W = world(), pc = W.pc, op = SK.wp_c2.ops[0]; pc.hp = 100;
  W.cast('wp_c2', 1); ok(W.kit.patches[0].u === pc, 'no support target -> on me');
  for (let i = 0; i < 5; i++) { pc.pos.x += 1; W.run(0.5); }
  ok(W.kit.log.heals.filter(h => h.why === 'patch').length === 1, 'one heal after 1.5 s while moving');
  W.run(2.1); const hs = W.kit.log.heals.filter(h => h.why === 'patch'); ok(hs.length === 3 && !W.kit.patches.length, 'three heals then the patch is done (' + hs.length + ')');
  ok(Math.abs(pc.hp - (100 + 3 * pc.maxHp * op.pct)) < 1, '3 x 7% max HP');
  ok(W.fxLog.filter(x => x === 'patch.tick').length === 3, 'a cell turns off per heal');
  const W2 = world(), s = W2.living(3, 0, 0.3); W2.pc.allyTarget = s; W2.cast('wp_c2', 1); ok(W2.kit.patches[0].u === s, 'selected living summon gets the patch');
  s.pos.x = 6; W2.run(4.6); ok(Math.abs(s.hp - 30 - 3 * 7) < 0.5, 'follows the moving summon: 3 heals');
  const W3 = world(), far = W3.living(20, 0, 0.3); W3.pc.allyTarget = far; W3.cast('wp_c2', 1); ok(W3.kit.patches[0].u === W3.pc, 'selected summon out of range -> me');
}
// ------------------------------------------------------------------ C3 붕대 릴: wall-safe landing, arrival heal, danger pick, self fallback
{ const W = world(), pc = W.pc, op = SK.wp_c3.ops[0]; pc.hp = 100;
  W.cast('wp_c3', 1); ok(W.kit.log.reels.at(-1).self && Math.abs(pc.hp - 100 - pc.maxHp * op.self) < 1, 'no living summon: wraps me, small instant heal');
  const W2 = world(), s = W2.living(0, 7, 0.9); W2.things.push({ shape: HitShape.circle(0, 7, 2), dead: false });
  W2.cast('wp_c3', 1); W2.run(0.1); ok(Math.hypot(s.pos.x, s.pos.z - 7) < 1e-6, 'bandage still flying: not pulled yet');
  W2.run(0.6); const lg = W2.kit.log.reels.at(-1);
  ok(lg && !lg.self && lg.danger && !lg.dangerAfter && Math.abs(s.pos.z - (0.4 + 0.4 + WP.reel.gap)) < 0.25, 'summon in a boss telegraph is pulled next to me, out of it (z ' + s.pos.z.toFixed(2) + ')');
  ok(Math.abs(s.hp - 90 - 100 * op.pct) < 0.5 || s.hp === 100, 'arrival heal');
  // wall between: stops in front of the wall, never inside
  const wall = (x, z, r) => z > 3.6 - r && z < 4.4 + r && Math.abs(x) < 3;
  const W3 = world({ blocked: wall }), s3 = W3.living(0.05, 7, 0.3); W3.pc.allyTarget = s3;
  W3.cast('wp_c3', 1); ok(W3.kit.log.reels.at(-1) && W3.kit.log.reels.at(-1).self, 'bandage line blocked by a wall: no pull (wraps me instead)');
  const thin = (x, z, r) => z > 3.9 - r && z < 4.1 + r && Math.abs(x) < 3 && r > 0.15;   // a low rail: the thin bandage passes, the body does not
  const W4 = world({ blocked: thin }), s4 = W4.living(0, 7, 0.3); W4.pc.allyTarget = s4; W4.cast('wp_c3', 1); W4.run(0.7);
  ok(!W4.kit.log.reels.at(-1).self && s4.pos.z > 4.1 && !thin(s4.pos.x, s4.pos.z, 0.32), 'body stops in front of the rail, not inside (z ' + s4.pos.z.toFixed(2) + ')');
  // lowest-HP summon under 50% when nothing selected / in danger
  const W5 = world(), hi = W5.living(2, 2, 0.9), lo = W5.living(-2, 3, 0.3); W5.cast('wp_c3', 1); ok(W5.kit.reels[0].s === lo, 'nothing selected / in danger: the summon under 50%');
  const W6 = world(), ok6 = W6.living(2, 2, 0.9); W6.cast('wp_c3', 1); ok(W6.kit.log.reels.at(-1).self && ok6.pos.x === 2, 'healthy summon, not selected, not in danger: self wrap');
}
// ------------------------------------------------------------------ C5 last prescription: once, grace, ICD, save / load
{ const W = world({ learned: { wp_c5: 1 } }), pc = W.pc;
  pc.hp = 50; ok(W.eng.cheatDeath() === true && pc.hp === 75 && pc.shield === 75 && pc.status.has('regen'), 'lethal -> 15% HP + shield + regen');
  ok(W.eng.cheatDeath() === true && W.kit.log.lastRx === 1, 'same-frame second lethal hit absorbed, no second trigger');
  W.run(0.4); ok(W.eng.cheatDeath() === false, 'after the grace: ICD blocks');
  ok(W.kit.icdLeft() > 119 && /재정비/.test(W.kit.statusHtml()), 'ICD visible in the buff line');
  W.eng.saveCooldowns(); const cds = JSON.parse(JSON.stringify(pc.sheet.p.sk.cds)); ok(cds.wp_c5 > Date.now(), 'ICD saved');
  const W2 = world({ learned: { wp_c5: 1 }, sk: { cds } }); ok(W2.kit.icdLeft() > 118 && W2.eng.cheatDeath() === false, 'ICD survives save/load');
  W.run(120); ok(W.eng.cheatDeath() === true && W.kit.log.lastRx === 2, 'ready again after 120 s');
  const W3 = world(); ok(W3.eng.cheatDeath() === false && W3.kit.statusHtml() === '', 'not learned: nothing');
}
// ------------------------------------------------------------------ C4 coat
{ const W = world(), pc = W.pc; pc.hp = 100;
  W.cast('wp_c4', 1); ok(pc.shield === Math.round((40 + 120) * (1 + 0.8)), 'coat: shield 40+1.2 atk, x(1 + missing HP) (' + pc.shield + ')');
  ok(W.fxLog.includes('coat'), 'coat visuals');
}
// ------------------------------------------------------------------ cleanup
{ const W = world({ learned: { wp_b4: 1 } }), m = W.mon(0, 3); W.pc.hp = 100; const s = W.living(0, 5, 0.3); W.pc.allyTarget = s;
  W.kit.mark(m, W.ctx('wp_a3')); W.cast('wp_b1', 1, { tgt: m }); W.run(0.3); W.cast('wp_a2', 1, { aim: { x: 0, y: 0, z: 3 } }); W.cast('wp_c1', 1); W.cast('wp_c2', 1); W.cast('wp_c3', 1); W.cast('wp_b3', 1, { tgt: m }); W.run(0.3);
  const n0 = m.taken.length, hp0 = W.pc.hp;
  W.eng.clearTemp(); W.run(4);
  ok(!W.kit.tablets.length && !W.kit.foams.length && !W.kit.kitS && !W.kit.patches.length && !W.kit.reels.length && !W.kit.zones.length && !m._marks, 'clearTemp: tablets / foams / kit / patches / reels / zones / marks gone');
  ok(m.taken.length === n0 && W.pc.hp === hp0, 'nothing scheduled hits or heals after clearTemp');
}
// ------------------------------------------------------------------ old save: learned levels / points / slots / recipes carry over
{ const files = {}; for (const n of ['config', 'levels', 'jobs', 'skills', 'skills2', 'items', 'monsters', 'quests', 'npcs', 'zones']) files[n] = JSON.parse(read('../assets/data/' + n + '.json'));
  const data = new GameData(files);
  const p0 = newProfile(data, '옛양약사', 'f'); p0.level = 45; p0.job = 'western_pharmacist';
  p0.sk = { v: 1, points: 7, granted: [], learned: { wp_a1: 4, wp_a2: 3, wp_a3: 2, wp_b1: 2, wp_b2: 5, wp_b3: 3, wp_b4: 1, wp_a5: 1, wp_c1: 2, wp_c2: 1, wp_c3: 4, wp_c5: 1 }, slots: ['wp_b1', 'wp_b3', 'wp_a2', 'wp_c3'], cds: {}, npoints: 3, ngranted: Array.from({ length: 45 }, (_, i) => i + 1), adv2Bonus: true, ult: '', res: {}, dye: {} };
  p0.sk.granted = Array.from({ length: 36 }, (_, i) => i + 10);   // 이미 받은 레벨 포인트(예전 저장처럼) — 불러와도 새로 주지 않음
  const learned = JSON.stringify(p0.sk.learned); const ch = new CharacterSheet(data, migrate(JSON.parse(JSON.stringify(p0))));
  ok(JSON.stringify(ch.book.sk.learned) === learned && ch.book.sk.slots.join() === 'wp_b1,wp_b3,wp_a2,wp_c3' && ch.book.sk.points === 42 && ch.book.sk.npoints === 47, 'old save: learned levels and slots retained, historical points credited (old catalyst/cryo/spray slots now hold 이중정/발포정/붕대 릴)');
  ok(ch.book.usable('wp_c1') && ch.book.usable('wp_c2') && SK.wp_c1.recipes.includes('r_potion_l'), 'old craft learners keep the recipes (same skill ids)');
  const sys = await import('../js/skillsys.js'); const rc = data.recipes.find(r => r.id === 'r_potion_l');
  ch.bag.add('m_herb', 4); ch.bag.add('m_bottle', 1); ch.bag.add('m_wolf_fang', 1); const r = sys.craft(data, ch, ch.book, rc, 1, () => 0.0);
  ok(r.ok && ch.bag.count('c_potion_l') >= 1, 'old learner crafts 농축 회복제 after the rework (' + JSON.stringify(r.err || r.made) + ')');
  const rc2 = data.recipes.find(r => r.id === 'r_regen_hp'); ch.bag.add('m_herb', 3); ch.bag.add('m_bottle', 1); const r2 = sys.craft(data, ch, ch.book, rc2, 1, () => 0.0); ok(r2.ok && ch.bag.count('c_regen_hp') >= 1, 'old learner crafts 지속 회복 제제');
  const p1 = newProfile(data, '새양약사', 'f'); p1.level = 45; p1.job = 'western_pharmacist'; const ch1 = new CharacterSheet(data, migrate(p1));
  ch1.bag.add('m_herb', 4); ch1.bag.add('m_bottle', 1); ch1.bag.add('m_wolf_fang', 1); ok(sys.craft(data, ch1, ch1.book, rc, 1).err, 'not learned: no recipe');
}
console.log(`wpharm: ${pass} passed`);
