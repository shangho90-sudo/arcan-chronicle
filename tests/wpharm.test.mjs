// 양약사 2차 규칙(js/wpharm.js + js/skillrt.js)을 WebGL 없이 확인: 데이터(id·배우는 레벨·계열 이름·아이콘), 예전 저장 호환,
// 작열·분열 캡슐(과립 5 + 고리, 총 피해 = 예전 3.4, 대상 사망 -> 다른 적 / 없으면 사라짐), 표식(최대 3·8초·시전마다 대상당 1·촉매·표적 전달·사망 정리),
// 극저온(둔화된 일반 적만 빙결, 보스 X), 이온(한 줄 한 번), 삼상(복합 반응 한 번), 연쇄 용출(표식 있는 적만·중복 없음·상한·시전끼리 섞이지 않음),
// 서방형 미립자(표식·지대를 만들지 않음, 최대 3, 합치기), 임계 농도(소비량·상한), 최종 처방(한 번만·유예·내부 쿨타임·저장/불러오기),
// 다층 코팅막·생체 회복 분무(기계 소환물 제외), 궁극기 카메라(주 타격 한 번, 무작위 흔들림 없음), 스킬창 수치 문구.
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
ok(SK.wp_a5.type === 'ultimate' && SK.wp_b5.type === 'ultimate' && SK.wp_b4.type === 'passive' && SK.wp_c5.type === 'passive' && SK.wp_c1.type === 'craft' && SK.wp_c2.type === 'craft', 'types kept');
ok(SK.wp_c1.recipes.join() === 'r_potion_l' && SK.wp_c2.recipes.join() === 'r_regen_hp,r_regen_sp', 'craft recipes still linked');
ok(SK.wp_c5.icd === 120, 'ICD in data');
for (const s of wp) ok(existsSync(new URL(`../assets/ui/skills/${s.id}.png`, import.meta.url)), 'icon ' + s.id);
ok(actions.wp_compound && actions.wp_condense && actions.wp_compound.stow && actions.wp_condense.stow, 'motions wp_compound / wp_condense (pestle on the back)');
for (const s of wp) if (s.type !== 'craft') ok(wpLevelText(s, 1) && wpLevelText(s, s.maxLv) !== wpLevelText(s, 1) || s.id === 'wp_c3' || s.id === 'wp_c4', 'level text ' + s.id);
ok(/170%|192%|214%/.test(wpLevelText(SK.wp_a1, 1)) || /160%/.test(wpLevelText(SK.wp_a1, 1)), 'A1 text shows real granule total');

// ------------------------------------------------------------------ harness
function world(o = {}) {
  const sounds = [], kicks = [], fxLog = [];
  for (const k of Object.keys(FX).filter(k => k !== 'on')) FX[k] = () => ({ set() {}, dispose() {}, end() {}, pulse() {}, setStacks() {} });
  const handle = (kind) => new Proxy({ kind }, { get: (t, m) => m in t ? t[m] : (...a) => { fxLog.push(kind + '.' + String(m)); return null; } });
  FX.wp = (kind) => { fxLog.push(kind); return handle(kind); };
  const learned = Object.assign({}, o.learned || {});
  const book = { sk: { slots: wp.filter(x => x.type !== 'passive' && x.type !== 'craft').map(x => x.id).slice(0, 4) }, level: id => learned[id] || 0, usable: () => true, passive: key => { let v = 0; for (const [id, lv] of Object.entries(learned)) { const f = SK[id] && SK[id].type === 'passive' && SK[id].flags && SK[id].flags[key]; if (f) v += f[0] + (f[1] || 0) * (lv - 1); } return v; } };
  const geo = { ground: (x, z) => ({ x, y: 0, z }), blocked: () => false, move: (p, dx, dz) => ({ x: p.x + dx, y: 0, z: p.z + dz }) };
  const actors = [];
  const pc = { pos: { x: 0, y: 0, z: 0 }, facing: { x: 0, z: 1 }, faction: 'player', skills: { lock: 0, busy: false }, body: { sh: { actions }, play() {} }, hp: 500, maxHp: 500, sp: 999, maxSp: 999,
    sheet: { p: { sk: o.sk || {}, job: 'western_pharmacist', weapon: '' }, book, job: { id: 'western_pharmacist', parent: 'pharmacist' }, final: { shieldPower: 0, healPower: 0 } }, status: new StatusSet(), stat: k => k === 'atk' ? 100 : k === 'crit' ? 0 : k === 'critDmg' ? 1.5 : 0,
    setFacing(x, z) { const m = Math.hypot(x, z) || 1; this.facing = { x: x / m, z: z / m }; }, zone: { actors, geo, def: { portals: [] }, nearestEnemy: () => actors.find(a => !a.dead) }, dist(t) { return Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z); },
    startLunge() {}, shield: 0, shieldT: 0, addShield(v, d) { this.shield = Math.max(this.shield, v); this.shieldT = d; }, heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); } };
  bindSkillRt({ audio: { sfx: n => sounds.push(n) }, render: { kick: (...a) => kicks.push(a), addShake() { throw new Error('no random shake'); } }, ui: { floatText() {}, toast() {} }, hitStop() { throw new Error('no global hit-stop'); },
    data: { status: id => STATUS[id], skill2: id => SK[id], config: {}, item: () => null, job: (id) => ({ id, tier: id === 'western_pharmacist' ? 2 : 1, parent: 'pharmacist' }) } });
  const eng = new SkillEngine(pc); pc.skills2 = eng;
  const mon = (x, z, extra = {}) => { const m = { pos: { x, y: 0, z }, radius: 0.5, hp: 1e6, maxHp: 1e6, dead: false, zone: pc.zone, faction: 'monster', status: new StatusSet(), stat: () => 0, taken: [], uid: actors.length + 1,
      takeDamage(hd) { this.taken.push(hd); this.hp -= hd.amount; }, ...extra }; actors.push(m); return m; };
  const ctx = (id, L = 1, more = {}) => ({ d: SK[id], id, L, grade: 1, mult: 1 + (SK[id].type === 'ultimate' ? 0.25 : 0.12) * (L - 1), origin: { ...pc.pos }, facing: { ...pc.facing }, aim: { x: 0, y: 0, z: 3 }, hitOnce: new Set(), ...more });
  const run = (sec) => { for (let i = 0; i < Math.round(sec / 0.01); i++) { eng.tick(0.01); for (const m of actors) if (m.status.list.length) m.status.tick(0.01, () => {}, () => {}); } };
  const cast = (id, L, more) => { learned[id] = L || learned[id] || 1; const c = ctx(id, learned[id], more); eng.wp.onCast(SK[id], c); for (const op of SK[id].ops) eng.exec(op, c); return c; };
  return { pc, eng, kit: eng.wp, mon, ctx, run, cast, sounds, kicks, fxLog, learned };
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
// ------------------------------------------------------------------ marks: cap 3, refresh 8 s, catalyst / carrier, death cleanup
{ const W = world(), m = W.mon(0, 4);
  for (let i = 0; i < 5; i++) { W.cast('wp_a3', 1); W.run(0.4); }
  ok(marks(m) === 3, 'marks capped at 3');
  W.run(7.0); ok(marks(m) === 3, 'still there after 7 s (refreshed on add)'); W.run(1.2); ok(marks(m) === 0, 'expire after 8 s');
  W.cast('wp_b1', 1); ok(W.kit.cat && W.kit.cat.charges === 3 && W.pc.status.has('catalyst'), 'catalyst: 3 charges');
  W.cast('wp_a3', 1); W.run(0.4); ok(marks(m) === 2 && W.kit.cat.charges === 2, 'empowered cast: 2 marks, one charge used');
  const n0 = m.taken.length; W.cast('wp_a3', 1); W.run(0.4); ok(m.taken[n0].amount === Math.round(260 * 1.15), 'empowered damage +15%');
  W.cast('wp_a3', 1); W.run(0.4); ok(!W.kit.cat && !W.pc.status.has('catalyst'), 'charges spent -> buff ends (no more triggers)');
  W.cast('wp_b1', 1); W.cast('wp_b1', 1); ok(W.kit.cat.charges === 3, 'recast refreshes, never stacks charges');
  const W2 = world(), x = W2.mon(0, 4); W2.cast('wp_a4', 1, { tgt: x }); W2.run(1.2); ok(marks(x) === 1, 'three hits in one cast -> one mark');
  const W3 = world(), y = W3.mon(0, 4); W3.cast('wp_b2', 1, { tgt: y }); W3.cast('wp_a3', 1); W3.run(0.4); ok(marks(y) === 2, 'carrier: +1 mark on that enemy');
  const z = W3.mon(0, 6); W3.cast('wp_b2', 1, { tgt: z }); ok(W3.kit.carrier.t === z && !y.status.has('prescribed'), 'one carrier per caster (moves)');
  y.dead = true; W3.run(0.05); ok(!y._marks && !y._markFx, 'dead enemy: marks + mark visuals removed');
}
// ------------------------------------------------------------------ A2 / A3
{ const W = world(), a = W.mon(0, 3), boss = W.mon(0.8, 3.2, { isBoss: true }), b = W.mon(-0.8, 3);
  for (const t of [a, boss]) t.status.apply(STATUS.slow, 3, 0.3);
  W.cast('wp_a2', 1); W.run(0.9); ok(!a.taken.length, 'no damage before the centre crystal bursts'); W.run(0.2);
  ok(a.taken.length === 1 && b.taken.length === 1 && boss.taken.length === 1, 'burst hits everyone in r once');
  ok(a.status.has('freeze') && !b.status.has('freeze') && !boss.status.has('freeze'), 'freeze only an already slowed normal enemy');
  const W2 = world(), l1 = W2.mon(0, 2), l2 = W2.mon(0.3, 7), off = W2.mon(3, 3);
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
// ------------------------------------------------------------------ B3 chain: marked only, no repeats, cap, separate casts
{ const W = world({ learned: { wp_b4: 1 } });
  const ms = [0, 1, 2, 3, 4, 5, 6, 7].map(i => W.mon(0, 3 + i * 3)); const un = W.mon(2, 4);   // 3 m apart: in range (5) of the next only
  for (const m of ms) W.kit.mark(m, W.ctx('wp_a3'));   // separate ctx objects -> each gets 1
  for (const m of ms) ok(marks(m) === 1, 'pre-marked');
  W.cast('wp_b3', 1, { tgt: ms[0] }); W.run(3);
  const log = W.kit.log.chains.at(-1);
  ok(log.nodes.length === 5, 'chain stops at max 5 (' + log.nodes.length + ')');
  ok(new Set(log.nodes.map(n => n.id)).size === log.nodes.length, 'no enemy visited twice');
  ok(marks(ms[5]) === 1 && marks(ms[0]) === 0, 'beyond the cap: marks kept');
  ok(!un._marks && un.taken.every(h => h.derived), 'unmarked neighbour never linked (only splash)');
  const before = W.kit.log.chains.length; W.cast('wp_b3', 1, { tgt: ms[6] }); W.run(3); W.cast('wp_b3', 1, { tgt: ms[6] }); W.run(3);
  ok(W.kit.log.chains.length === before + 2 && W.kit.log.chains.at(-1).nodes.length === 1, 'separate casts keep separate visited sets (second finds no marks left)');
  ok(W.kit.zones.length <= WP.zone.max, 'zones capped at 3');
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
// ------------------------------------------------------------------ B5 critical mass: scales with marks, capped
{ const dmgWith = (n) => { const W = world(); const ms = []; for (let i = 0; i < n; i++) { const m = W.mon(i % 2 ? 1 : -1, 1 + i * 0.4); for (let k = 0; k < 3; k++) W.kit.mark(m, W.ctx('wp_a3')); ms.push(m); }
    const probe = W.mon(0, 4.5); W.cast('wp_b5', 1); W.run(1.2); return { amt: probe.taken[0] && probe.taken[0].amount, ms, W }; };
  const r0 = dmgWith(0), r1 = dmgWith(1), r4 = dmgWith(4);
  ok(r0.amt === 140, 'no marks: low base 140% (' + r0.amt + ')');
  ok(r1.amt === Math.round(100 * (1.4 + 0.65 * 3)), '3 marks: +195% (' + r1.amt + ')');
  ok(r4.amt === Math.round(100 * (1.4 + 0.65 * 9)), '12 marks capped at 9 (' + r4.amt + ')');
  ok(r4.ms.every(m => marks(m) === 0), 'all marks in range consumed');
  ok(r4.W.kicks.length === 1, 'one camera kick on the main burst');
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
// ------------------------------------------------------------------ C3 / C4
{ const W = world(), pc = W.pc; pc.hp = 100;
  W.cast('wp_c4', 1); ok(pc.shield === Math.round((40 + 120) * (1 + 0.8)), 'coat: shield 40+1.2 atk, x(1 + missing HP) (' + pc.shield + ')');
  ok(W.fxLog.includes('coat'), 'coat visuals');
  pc.hp = 100; const living = { living: true, machine: false, dead: false, hp: 10, maxHp: 100, pos: { x: 0.5, y: 0, z: 0 } }, mech = { living: false, machine: true, dead: false, hp: 10, maxHp: 100, pos: { x: -0.5, y: 0, z: 0 } };
  W.eng.summons.push(living, mech); W.cast('wp_c3', 1); W.run(2.05);
  ok(pc.hp > 100 && living.hp > 10 && mech.hp === 10, 'spray heals self + living summons, not machines');
  ok(W.fxLog.includes('spray.pulse'), 'heal pulses drawn on the heal tick');
}
// ------------------------------------------------------------------ cleanup
{ const W = world({ learned: { wp_b4: 1 } }), m = W.mon(0, 3); W.kit.mark(m, W.ctx('wp_a3')); W.cast('wp_b1', 1); W.cast('wp_b2', 1, { tgt: m }); W.cast('wp_b3', 1, { tgt: m }); W.run(0.3);
  W.eng.clearTemp(); ok(!W.kit.cat && !W.kit.carrier && !W.kit.zones.length && !m._marks, 'clearTemp: catalyst / carrier / zones / marks gone');
}
// ------------------------------------------------------------------ old save: learned levels / slots / points carry over
{ const files = {}; for (const n of ['config', 'levels', 'jobs', 'skills', 'skills2', 'items', 'monsters', 'quests', 'npcs', 'zones']) files[n] = JSON.parse(read('../assets/data/' + n + '.json'));
  const data = new GameData(files);
  const p0 = newProfile(data, '옛양약사', 'f'); p0.level = 45; p0.job = 'western_pharmacist';
  p0.sk = { v: 1, points: 7, granted: [], learned: { wp_a1: 4, wp_a3: 2, wp_b3: 3, wp_b4: 1, wp_a5: 1, wp_c1: 2, wp_c5: 1 }, slots: ['wp_a1', 'wp_b3', 'wp_a3', 'wp_a5'], cds: {}, npoints: 0, ngranted: [] };
  const learned = JSON.stringify(p0.sk.learned); const ch = new CharacterSheet(data, migrate(JSON.parse(JSON.stringify(p0))));
  ok(JSON.stringify(ch.book.sk.learned) === learned && ch.book.sk.slots.join() === 'wp_a1,wp_b3,wp_a3,wp_a5', 'old save: learned levels + slots unchanged');
}
console.log(`wpharm: ${pass} passed`);
