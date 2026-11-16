// 디자이너 2차 규칙(js/designer.js + js/skillrt.js)을 WebGL 없이 확인: id·배우는 레벨·종류·최대 레벨·계열·레시피 유지, 예전 저장의 레벨·포인트·칸,
// 시침 표식(부여·중첩 상한·시전당 1·소비·만료·사망·시전자 분리), 다단 총 피해와 적마다 상한, 교차 중심 한 번, 돌진 경로 한 번·벽, 뒤로 물러남·마네킹·망토,
// 보스 속박/끌기/도발 면역, 결합 배율 상한, 리스티치 즉시 보호막, 테일러드 퍼펙션 판정·장비 교체, 정리(사망·지역 이동·재시전), 카메라 kick 한 번.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { HitShape, CombatMath, StatusSet, clamp, clamp01, CharacterSheet } from '../js/core.js';
import { skillSound } from '../js/sfx.js';
import { SmithKit, clearLine } from '../js/smith.js';
import { DsKit, DS, fold, consumeMul, critRoom, segInfo, clearRun, stitchPath, crossCuts, runwayPaths, dsLevelText, fittingOn } from '../js/designer.js';
import { ensureSk } from '../js/skillsys.js';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const S2 = JSON.parse(read('../assets/data/skills2.json')), skills = S2.skills, SK = Object.fromEntries(skills.map(s => [s.id, s]));
const STATUS = Object.fromEntries([...JSON.parse(read('../assets/data/skills.json')).statuses, ...S2.statuses].map(s => [s.id, s])), ITEM = Object.fromEntries(S2.items.map(i => [i.id, i]));
const actions = Object.fromEntries(JSON.parse(read('../assets/models/actions.json')).map(a => [a.name, a]));
const sandbox = { HitShape, CombatMath, clamp, clamp01, skillSound, SmithKit, clearLine, DsKit, T: p => p, console };
vm.createContext(sandbox);
vm.runInContext(read('../js/skillrt.js').replace(/^import .*;\n/gm, '').replace(/\bexport /g, '') + '\nthis.api={SkillEngine,bindSkillRt,FX,CUSTOM,Summon};', sandbox);
const { SkillEngine, bindSkillRt, FX } = sandbox.api;
Math.random = () => 0.5;
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

// ------------------------------------------------------------------ data
const OLD = { a1: ['attack', 30], a2: ['attack', 33], a3: ['attack', 36], a4: ['attack', 40], a5: ['ultimate', 45], b1: ['attack', 30], b2: ['attack', 33], b3: ['summon', 36], b4: ['support', 40], b5: ['ultimate', 45],
  c1: ['craft', 30], c2: ['craft', 33], c3: ['craft', 36], c4: ['support', 40], c5: ['passive', 45] };
const ds = skills.filter(s => s.job === 'designer');
ok(ds.length === 15, '15 designer skills');
for (const [k, [type, unlock]] of Object.entries(OLD)) { const d = SK['ds_' + k]; ok(d && d.type === type && d.unlock === unlock && d.maxLv === (type === 'ultimate' ? 3 : 5) && d.tier === 2 && d.cat === 'abc'.indexOf(k[0]), `ds_${k}: ${type}, Lv${unlock}, line ${k[0]}`); }
ok(['마법 입체재단', '쿠튀르 런웨이', '마스터 아틀리에'].every((n, i) => ds.filter(s => s.cat === i).every(s => s.catName === n)), 'line titles A/B/C');
ok(new Set(ds.map(s => s.name)).size === 15 && ds.every(s => /[가-힣]/.test(s.desc) && s.desc.length > 30), '15 distinct Korean names + descriptions');
ok(ds.every(s => s.name.length <= 11), 'names fit the slot (≤ 11 chars): ' + ds.map(s => s.name.length).join());
for (const [r, sk, out] of [['r_outfit', 'ds_c1', 'a_outfit_c'], ['r_emb_atk', 'ds_c2', 't_emb_atk'], ['r_emb_def', 'ds_c2', 't_emb_def'], ['r_emb_mp', 'ds_c2', 't_emb_mp'], ['r_ribbon', 'ds_c3', 'ac_ribbon']]) {
  const rc = S2.recipes.find(x => x.id === r); ok(rc && rc.skill === sk && rc.output.item === out && ITEM[out], `recipe ${r} -> ${out} still linked to ${sk}`); }
ok(!/은신|위장/.test(SK.ds_b4.desc), 'no stealth system -> tooltip does not mention it');
for (const s of ds) ok(existsSync(new URL(`../assets/ui/skills/${s.id}.png`, import.meta.url)) && readFileSync(new URL(`../assets/ui/skills/${s.id}.png`, import.meta.url)).length > 1000, 'icon ' + s.id);
for (const s of ds) if (s.anim) ok(actions[s.anim], 'motion exists ' + s.anim);
ok(actions.ds_cross.keys.some(t => near(t, 0.22)) && actions.ds_cross.keys.some(t => near(t, 0.38)) && near(SK.ds_a4.ops[0].gap, 0.38 - 0.22), 'cross: two closes of the motion = the two cuts');
const SOUNDS = [...read('../js/designer.js').matchAll(/snd\('(ds_[a-z_]+)'/g)].map(m => m[1]);
ok(SOUNDS.length >= 10, 'designer.js plays ' + new Set(SOUNDS).size + ' sounds');
for (const n of new Set(SOUNDS)) ok(existsSync(new URL(`../assets/audio/sfx_${n}.mp3`, import.meta.url)) && read('../js/sfx.js').includes(`'${n}'`), 'sound generated + registered: ' + n);
// old save keeps levels / points / slots
{ const data = { skill2: id => SK[id] }, p = { sk: { points: 2, learned: { ds_a1: 5, ds_b3: 2, ds_a5: 3, ds_c5: 4, ds_c2: 1 }, slots: ['ds_a1', 'ds_b3', 'ds_a5', ''] } };
  const sk = ensureSk(p, data);
  ok(sk.points === 2 && sk.learned.ds_a1 === 5 && sk.learned.ds_c5 === 4 && sk.learned.ds_a5 === 3 && sk.learned.ds_c2 === 1, 'old save keeps designer levels + points');
  ok(sk.slots.slice(0, 3).join() === 'ds_a1,ds_b3,ds_a5', 'old save keeps designer slots'); }

// ------------------------------------------------------------------ pure helpers
{ const o = SK.ds_a2.ops[0];
  ok(near(consumeMul(0, false, o), 1) && near(consumeMul(2, false, o), 2.4) && near(consumeMul(3, true, o), o.cap), 'consume multiplier: 0 -> 1, 2 -> 2.4, 3 + bound -> cap ' + o.cap);
  ok(near(critRoom(1, 1.5, 3.2), 0.5) && near(critRoom(2.8, 1.5, 3.2), 1.5 * (3.2 / 2.8 - 1)) && critRoom(3.5, 1.5, 3.2) === 0, 'spotlight room shrinks under the combined cap');
  const pts = stitchPath({ x: 0, z: 0 }, { x: 0, z: 1 }, 2.4, 6);
  ok(pts.length === 6 && pts.every(p => Math.hypot(p.x, p.z) <= 2.4) && pts.every((p, i) => i === 0 || p.z > pts[i - 1].z) && pts.every((p, i) => i === 0 || Math.sign(p.x) !== Math.sign(pts[i - 1].x)), 'stitch: zigzag forward inside the circle');
  const X = crossCuts({ x: 0, z: 0 }, { x: 0, z: 1 }, 1.7, 3.4), [a, b] = X.cuts;
  ok(near(segInfo(X.c, a[0], a[1]).d, 0) && near(segInfo(X.c, b[0], b[1]).d, 0) && near(Math.abs((a[1].x - a[0].x) * (b[1].x - b[0].x) + (a[1].z - a[0].z) * (b[1].z - b[0].z)), 0, 1e-6), 'cross: two perpendicular diagonals crossing at the centre');
  const geo = { blocked: (x, z) => z > 3 }; ok(near(clearRun(geo, { x: 0, z: 0 }, { x: 0, z: 1 }, 5), 3, 0.21) && clearRun(geo, { x: 0, z: 0 }, { x: 0, z: -1 }, 5) === 5, 'clearRun stops before the wall');
  const R = runwayPaths({ x: 0, z: 0 }, { x: 0, z: 1 }, 7, 1.8); ok(R.length === 3 && Math.sign(R[0][0].x) !== Math.sign(R[0][1].x) && Math.sign(R[1][0].x) !== Math.sign(R[1][1].x), 'runway: two crossing paths + a straight one');
  const data = { status: id => STATUS[id] };
  for (const s of ds) { const t = dsLevelText(s, 1, data); ok(typeof t === 'string' && t.length > 4 && !/NaN|undefined/.test(t), 'level text ' + s.id + ': ' + t); }
}

// ------------------------------------------------------------------ engine harness
function world(o = {}) {
  const sounds = [], kicks = [], fxLog = [], toasts = [];
  for (const k of Object.keys(FX).filter(k => k !== 'on')) FX[k] = () => ({ set() {}, dispose() {}, end() {}, pulse() {}, setRadius() {}, setPos() {}, setStacks() {} });
  FX.summon = () => ({ position: { copy() {} }, rotation: {}, visible: true, userData: {} });
  const handle = (kind) => new Proxy({ kind }, { get: (t, m) => m in t ? t[m] : (...a) => { fxLog.push(kind + '.' + String(m)); return null; } });
  FX.ds = (kind) => { fxLog.push(kind); return handle(kind); };
  const learned = Object.assign({}, o.learned || {});
  const book = { sk: { slots: ['ds_a1', 'ds_a2', 'ds_b1', 'ds_a5'] }, level: id => learned[id] || 1, usable: () => true,
    passive: key => { let v = 0; for (const [id, lv] of Object.entries(learned)) { const f = SK[id] && SK[id].type === 'passive' && SK[id].flags && SK[id].flags[key]; if (f) v += f[0] + (f[1] || 0) * (lv - 1); } return v; } };
  const blocked = o.blocked || (() => false);
  const geo = { boxes: [], ground: (x, z) => ({ x, y: 0, z }), blocked: (x, z, r) => blocked(x, z, r), removeTag() {}, move(p, dx, dz) { return blocked(p.x + dx, p.z + dz, 0.4) ? { ...p } : { x: p.x + dx, y: 0, z: p.z + dz }; } };
  const actors = [];
  const pc = { pos: { x: 0, y: 0, z: 0 }, facing: { x: 0, z: 1 }, faction: 'player', radius: 0.4, skills: { lock: 0, busy: false }, body: { sh: { actions }, play() {} }, hp: 500, maxHp: 1000, sp: 200, maxSp: 200, dead: false, name: '나',
    sheet: { p: { sk: {}, job: 'designer', name: '나', crafted: {}, gearMods: {}, armor: '' }, book, job: { id: 'designer' }, bag: { count: () => 0 }, final: { healPower: 0, foodPower: 0, shieldPower: 0 } }, status: new StatusSet(),
    stat: k => k === 'atk' ? 100 : k === 'crit' ? (o.crit || 0) : k === 'critDmg' ? 1.5 : 0,
    heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }, setFacing(x, z) { const m = Math.hypot(x, z) || 1; this.facing = { x: x / m, z: z / m }; },
    zone: { actors, geo, def: { portals: [] }, nearestEnemy: () => actors.find(a => !a.dead && a.faction !== 'player' && !a.isSummon) }, dist(t) { return Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z); },
    startLunge() {}, shield: 0, addShield(v) { this.shield = Math.max(this.shield, v); }, dash: null,
    startDash(d, dist, speed) { this.dash = { d, left: dist, speed }; } };
  pc.zone.actors.push(pc);
  const eng = new SkillEngine(pc); pc.skills2 = eng;
  bindSkillRt({ audio: { sfx: n => sounds.push(n) }, render: { scene: { add() {}, remove() {} }, kick: (...a) => kicks.push(a), addShake() { throw new Error('no random shake'); } }, hitStop() { throw new Error('no global hit-stop'); },
    ui: { floatText() {}, toast: t => toasts.push(t) }, data: { status: id => STATUS[id], skill2: id => SK[id], config: {}, item: id => ITEM[id], job: id => ({ id, tier: id === 'designer' ? 2 : 1 }) } });
  const mon = (x, z, extra = {}) => { const m = { pos: { x, y: 0, z }, radius: 0.5, hp: 1e6, maxHp: 1e6, dead: false, zone: pc.zone, faction: 'monster', status: new StatusSet(), stat: () => 0, taken: [],
      takeDamage(hd) { this.taken.push(hd); this.hp -= hd.amount; }, ...extra }; actors.push(m); return m; };
  const ctx = (id, L = 1, more = {}) => ({ d: SK[id], id, L, grade: 1, mult: 1 + (SK[id].type === 'ultimate' ? 0.25 : 0.12) * (L - 1), origin: { ...pc.pos }, facing: { ...pc.facing }, aim: { x: 0, y: 0, z: 3 }, hitOnce: new Set(), act: SK[id].anim, ...more });
  const run = (sec) => { for (let i = 0; i < Math.round(sec / 0.01); i++) {
    if (pc.dash && pc.dash.left > 0) { const s = Math.min(pc.dash.left, pc.dash.speed * 0.01); pc.pos = { x: pc.pos.x + pc.dash.d.x * s, y: 0, z: pc.pos.z + pc.dash.d.z * s }; pc.dash.left -= s; }
    eng.tick(0.01); for (const a of actors.slice()) if (a.isSummon && !a.dead) a.update(0.01);
    for (const a of actors) if (a.knock && !a.isSummon) { a.pos.x += a.knock.x * 0.01; a.pos.z += a.knock.z * 0.01; a.knock = { x: a.knock.x * 0.9, z: a.knock.z * 0.9 }; } } };
  return { pc, eng, kit: eng.ds, mon, ctx, run, sounds, kicks, fxLog, toasts, learned, geo };
}
const sum = (m, f = () => true) => m.taken.filter(f).reduce((a, h) => a + h.amount, 0);
const coefDmg = (c) => CombatMath.compute(100, c, 0, 0, 1.5, 0).amount;
const ratio = (m, mult = 1) => sum(m) / coefDmg(mult);

// A1 실크 드레이핑: damage + root + one mark at the pin moment, boss -> slow not root
{ const W = world(), m = W.mon(0.5, 3), boss = W.mon(-0.5, 3.2, { isBoss: true });
  W.eng.release(W.ctx('ds_a1')); W.run(0.3); ok(m.taken.length === 0, 'drape: nothing before the pin');
  W.run(0.5);
  ok(m.taken.length === 1 && near(ratio(m), 1.2, 0.03) && m.status.has('root') && W.kit.marks(m) === 1, 'drape: pin = 120 % + root + 1 mark');
  ok(!boss.status.has('root') && boss.status.has('slow'), 'drape: boss gets slow, not root');
  ok(W.fxLog.includes('drape.pin') && W.pc.freezeT > 0 && W.kicks.length === 0, 'drape: pin fx, local stop, no camera kick');
}
// marks: cap 3, one per cast per target, 8 s refresh, expiry, death, owner separation
{ const W = world(), m = W.mon(0, 3);
  for (let i = 0; i < 5; i++) { W.eng.release(W.ctx('ds_a1')); W.run(0.8); }
  ok(W.kit.marks(m) === 3, 'marks: capped at 3');
  W.run(7.5); ok(W.kit.marks(m) === 3, 'marks: still there before 8 s'); W.run(1); ok(W.kit.marks(m) === 0 && W.fxLog.includes('mark.expire'), 'marks: expire after 8 s');
  const S = world(), t = S.mon(0, 3); S.eng.release(S.ctx('ds_a3')); S.run(2);
  ok(t.taken.length >= 3 && S.kit.marks(t) === 1, 'marks: a multi-hit cast gives only one mark (' + t.taken.length + ' hits)');
  // owner separation: another caster's kit cannot see or consume these marks
  const other = new DsKit(S.eng, S.kit.h); ok(other.marks(t) === 0 && other.takeMarks(t) === 0 && S.kit.marks(t) === 1, 'marks: another owner cannot consume them');
  t.dead = true; S.run(0.05); ok(!t._dsMarks && S.kit.marked.size === 0, 'marks: cleared on death');
}
// A2 패턴 브레이크: base without marks, consumes own marks, bound bonus, capped; scissors close at the motion frame
{ const W = world(), m = W.mon(0, 1.5);
  W.eng.release(W.ctx('ds_a2', 1, { tgt: m })); W.run(0.2); ok(m.taken.length === 0, 'break: nothing before the scissors close');
  W.run(0.3); ok(m.taken.length === 1 && near(ratio(m), 2.0, 0.03), 'break: 200 % without marks');
  const M = world(), t = M.mon(0, 1.5); M.kit.addMark(t, {}); M.kit.addMark(t, {});
  M.eng.release(M.ctx('ds_a2', 1, { tgt: t })); M.run(0.6); ok(near(ratio(t), 2.0 * 2.4, 0.05) && M.kit.marks(t) === 0 && M.kicks.length === 1, 'break: 2 marks consumed -> x2.4, one kick');
  const C = world(), c = C.mon(0, 1.5); for (let i = 0; i < 3; i++) C.kit.addMark(c, {}); C.kit.h.applyStatus(c, { id: 'root', dur: 5, val: 1, ch: 1 }, C.pc);
  C.eng.release(C.ctx('ds_a2', 1, { tgt: c })); C.run(0.6); ok(near(ratio(c), 2.0 * SK.ds_a2.ops[0].cap, 0.06), 'break: 3 marks + bound -> capped at x' + SK.ds_a2.ops[0].cap);
  // with spotlight + crit: total multiplier stays under `total`
  const K = world({ crit: 1 }), k = K.mon(0, 1.5); for (let i = 0; i < 3; i++) K.kit.addMark(k, {}); K.kit.h.applyStatus(k, { id: 'root', dur: 5, val: 1, ch: 1 }, K.pc); K.kit.h.applyStatus(k, { id: 'spotlit', dur: 8, val: 0.5, ch: 1 }, K.pc);
  K.eng.release(K.ctx('ds_a2', 1, { tgt: k })); K.run(0.6);
  const nonCrit = coefDmg(2.0), got = sum(k); ok(got / (nonCrit * 3.0) <= SK.ds_a2.ops[0].total + 0.02 && got / (nonCrit * 3.0) > SK.ds_a2.ops[0].cap, `break: marks + bound + spotlight crit ≤ x${SK.ds_a2.ops[0].total} (${(got / (nonCrit * 3.0)).toFixed(2)})`);
  const L5 = world(), l = L5.mon(0, 1.5); L5.eng.release(L5.ctx('ds_a2', 5, { tgt: l })); L5.run(0.6); ok(near(sum(l) / coefDmg(1 + 0.12 * 4), 2.0 * fold(5), 0.05), 'break Lv5: level extra folded into one cut');
}
// A3 오트쿠튀르 스티치: needle timing in order, per-enemy cap, final pull, pull toward the centre (not boss)
{ const W = world(), mid = W.mon(0, 3), far = W.mon(0, 9), boss = W.mon(0.6, 3.4, { isBoss: true });
  W.eng.release(W.ctx('ds_a3')); W.run(2);
  const op = SK.ds_a3.ops[0], stitches = mid.taken.length - 1;
  ok(stitches >= 1 && stitches <= op.maxPer && far.taken.length === 0, `stitch: ${stitches} needle hits (cap ${op.maxPer}) + pull, outside untouched`);
  ok(ratio(mid) <= op.coef * op.maxPer + op.fin.coef + 0.05, 'stitch: total ≤ ' + (op.coef * op.maxPer + op.fin.coef));
  ok(W.fxLog.filter(x => x === 'stitch.stitch').length === op.n && W.fxLog.includes('stitch.pull'), 'stitch: one fx per needle, then the pull');
  ok(!boss.knock || (boss.knock.x === 0 && boss.knock.z === 0), 'stitch: boss not pulled');
}
// A4 크로스 커팅: two cuts, centre bonus once per target, side target on one path only
{ const W = world(), c = W.mon(0, 1.7), side = W.mon(1.25, 2.95);
  W.eng.release(W.ctx('ds_a4')); W.run(1);
  const op = SK.ds_a4.ops[0];
  ok(c.taken.length === 3 && near(ratio(c), op.coef * 2 + op.centre.coef, 0.05) && W.kit.log.centre === 1, 'cross: centre = two cuts + one centre bonus');
  ok(side.taken.length === 1, 'cross: a target on one diagonal is cut once');
  ok(W.kicks.length === 1, 'cross: one kick on the crossing');
}
// A5 그랑 패턴 피날레: damage right at release, cone not circle, marks consumed, one kick; no generic shake in cast()
{ const W = world(), f = W.mon(0, 4), back = W.mon(0, -3); W.kit.addMark(f, {});
  W.eng.release(W.ctx('ds_a5')); W.run(0.02);
  ok(f.taken.length === 1 && back.taken.length === 0 && near(ratio(f), 7.0 * 1.4, 0.1) && W.kit.marks(f) === 0, 'finale: forward cut at release, mark consumed (x1.4), nothing behind');
  ok(W.kicks.length === 1, 'finale: one kick');
  W.eng.book.sk.slots = ['ds_a5']; W.eng.cd = {}; W.pc.sp = 200; ok(W.eng.cast('ds_a5') === null && W.fxLog.includes('finalePre'), 'finale: cast() starts the pattern preview, no random shake');
  W.eng.interruptCast(); ok(W.fxLog.includes('finalePre.dispose') && W.pc.sp === 200, 'finale: interrupted -> preview gone, refunded');
}
// B1 실크 로드: road length = real travel; each enemy once; wall stops; no invulnerability
{ const W = world(), a = W.mon(0, 2), b = W.mon(0.3, 4.2), off = W.mon(2.5, 3);
  W.eng.release(W.ctx('ds_b1')); W.run(1);
  ok(a.taken.length === 1 && b.taken.length === 1 && off.taken.length === 0 && W.kit.marks(a) === 1, 'road: each enemy on the path once + mark');
  ok(near(W.pc.pos.z, 5, 0.05) && !(W.pc.invuln > 0), 'road: 5 m travel, no invulnerability');
  const B = world({ blocked: (x, z) => z > 2.5 }), c = B.mon(0, 4); B.eng.release(B.ctx('ds_b1')); B.run(1);
  ok(B.pc.pos.z <= 2.5 && near(B.pc.pos.z, B.eng.ds.log && B.pc.pos.z, 1) && c.taken.length === 0, 'road: wall -> stops before it, never hits through it');
  const V = world({ blocked: (x, z) => z > 0.3 }); V.eng.book.sk.slots = ['ds_b1']; ok(V.eng.cast('ds_b1') === '앞이 막혀 있습니다' && V.pc.sp === 200, 'road: blocked right ahead -> refused before any cost');
}
// B2 리본 피루엣: n lashes + knot, total, pull normal not boss, knot slows
{ const W = world(), m = W.mon(2, 0), boss = W.mon(-2, 0, { isBoss: true });
  W.eng.release(W.ctx('ds_b2')); W.run(2);
  const op = SK.ds_b2.ops[0];
  ok(m.taken.length === op.n + 1 && near(ratio(m), op.coef * op.n + op.knot.coef, 0.05), `pirouette: ${op.n} lashes + knot = ${op.coef * op.n + op.knot.coef}`);
  ok(m.pos.x < 2 && near(boss.pos.x, -2) && m.status.has('slow'), 'pirouette: normal pulled in, boss not, knot slows');
}
// B3 미러 피팅: back step (collision checked), mannequin at the old spot, taunt flag (no boss), cloak on expiry / break, none on zone change, one at a time
{ const W = world(), m = W.mon(0, 2);
  W.eng.release(W.ctx('ds_b3')); W.run(0.5);
  const s = W.eng.summons.find(x => !x.dead);
  ok(s && near(s.pos.z, 0) && W.pc.pos.z < -2.5 && s.taunt && s.noBossTaunt, 'mirror: stepped back 3 m, mannequin at the old spot, taunts (not bosses)');
  W.run(6.5); ok(W.kit.log.cloak === 1 && m.taken.length === 1 && m.status.has('slow'), 'mirror: expiry -> cloak burst once + slow');
  const B = world({ blocked: (x, z) => z < -0.5 }); B.eng.release(B.ctx('ds_b3')); B.run(0.5);
  ok(B.pc.pos.z > -0.6 && B.eng.summons.some(x => !x.dead), 'mirror: wall behind -> placed anyway, little / no step');
  const K = world(), k = K.mon(0, 2); K.eng.release(K.ctx('ds_b3')); K.run(0.3); const sk = K.eng.summons.find(x => !x.dead); sk.takeDamage({ amount: 1e9 });
  ok(K.kit.log.cloak === 1 && k.taken.length === 1, 'mirror: broken -> cloak burst');
  const Z = world(), z = Z.mon(0, 2); Z.eng.release(Z.ctx('ds_b3')); Z.run(0.3); Z.eng.clearTemp(); Z.run(7);
  ok(Z.kit.log.cloak === 0 && z.taken.length === 0, 'mirror: zone change -> removed, no attack');
  const R = world(), r = R.mon(0, 2); R.eng.release(R.ctx('ds_b3')); R.run(0.3); R.pc.pos = { x: 0, y: 0, z: 0 }; R.eng.release(R.ctx('ds_b3')); R.run(0.3);
  ok(R.eng.summons.filter(x => !x.dead).length === 1 && R.kit.log.cloak === 0 && r.taken.length === 0, 'mirror: recast replaces quietly');
  const D = world(), dd = D.mon(0, 2); D.eng.release(D.ctx('ds_b3')); D.run(0.3); D.pc.dead = true; D.run(7); ok(D.kit.log.cloak === 0 && dd.taken.length === 0, 'mirror: caster down -> no cloak attack');
}
// B4 뮤즈의 초대: spotlit, refresh only (no compounding), crit damage increase used by dmg
{ const W = world(), m = W.mon(0, 4);
  W.eng.release(W.ctx('ds_b4', 1, { tgt: m })); W.run(0.5); const s = m.status.get('spotlit');
  ok(s && near(s.remaining, 8, 0.3), 'muse: spotlit 8 s');
  W.run(3); W.eng.release(W.ctx('ds_b4', 1, { tgt: m })); W.run(0.5); ok(near(m.status.get('spotlit').remaining, 8, 0.3) && m.status.list.filter(x => x.def.id === 'spotlit').length === 1, 'muse: recast refreshes the time only');
  m.dead = true; W.run(0.1); ok(W.fxLog.includes('muse.end'), 'muse: light gone when the target dies');
}
// B5 오트쿠튀르 컬렉션: 3 clones each hit once + finale; haste; marks once per cast; clears on death
{ const W = world(), m = W.mon(0, 3.5), side = W.mon(4, 3.5);
  W.eng.release(W.ctx('ds_b5')); W.run(2);
  const op = SK.ds_b5.ops[1];
  ok(m.taken.length === op.n + 1 && near(ratio(m, 1), op.coef * op.n + op.fin.coef, 0.08) && W.kit.marks(m) === 1, `collection: ${op.n} clones + finale = ${op.coef * op.n + op.fin.coef}, one mark`);
  ok(side.taken.length === 0 && W.pc.status.has('haste') && W.kicks.length === 1, 'collection: outside the runway untouched, haste, one kick');
  const D = world(), d = D.mon(0, 3.5); D.eng.release(D.ctx('ds_b5')); D.run(0.2); D.pc.dead = true; D.run(2); ok(d.taken.length <= 1, 'collection: caster down -> the rest never runs');
  const B = world({ blocked: (x, z) => z > 3 }), b = B.mon(0, 5); B.eng.release(B.ctx('ds_b5')); B.run(2); ok(b.taken.length === 0, 'collection: runway stops at the wall');
}
// C4 미라클 리스티치: shield right away (same tick), bleed removed, shield without bleed too
{ const W = world(); W.kit.h.applyStatus(W.pc, { id: 'bleed', dur: 5, val: 0.1, ch: 1 }, W.pc);
  W.eng.book.sk.slots = ['ds_c4']; ok(W.eng.cast('ds_c4') === null, 'restitch: cast'); W.run(0.01);
  ok(W.pc.shield === Math.round((50 + 1.2 * 100)) && !W.pc.status.has('bleed'), 'restitch: shield at once + bleed cured');
  W.run(0.05); ok(W.fxLog.includes('restitch'), 'restitch: fx');
  const N = world(); N.eng.book.sk.slots = ['ds_c4']; N.eng.cast('ds_c4'); N.run(0.01); ok(N.pc.shield > 0, 'restitch: shield even without bleed');
}
// C5 테일러드 퍼펙션: own crafted outfit or embroidery, not someone else's; recalculated on swap; fx on activation only
{ const p = { name: '나', armor: 'a_outfit_c', crafted: { a_outfit_c: { by: '나', recipe: 'r_outfit' } }, gearMods: {} };
  ok(fittingOn(p, 0.08) && !fittingOn(p, 0), 'fitting: own outfit + passive');
  ok(!fittingOn({ ...p, crafted: { a_outfit_c: { by: '남' } } }, 0.08), 'fitting: crafted by someone else -> off');
  ok(fittingOn({ ...p, crafted: { a_outfit_c: { recipe: 'r_outfit' } } }, 0.08), 'fitting: old record without maker -> mine');
  ok(fittingOn({ ...p, armor: 'a_x', crafted: {}, gearMods: { a_x: { emb: 'def' } } }, 0.08), 'fitting: embroidered armor counts');
  ok(!fittingOn({ ...p, armor: '' }, 0.08), 'fitting: nothing worn -> off');
  const W = world({ learned: { ds_c5: 1 } }), P = W.pc.sheet.p; P.armor = 'a_cloth'; P.crafted = { a_outfit_c: { by: '나' } };
  W.run(0.05); ok(!W.fxLog.includes('fit'), 'fitting: not active, no fx'); P.armor = 'a_outfit_c'; W.run(0.05); ok(W.fxLog.filter(x => x === 'fit').length === 1, 'fitting: fx once on activation');
  W.run(1); ok(W.fxLog.filter(x => x === 'fit').length === 1, 'fitting: no constant particles'); P.armor = ''; W.run(0.05); ok(W.fxLog.includes('unfit'), 'fitting: off on unequip');
  // core.js provider gives the stat bonus only when active (same rule)
  const src = read('../js/core.js'); ok(/cr\.by === p\.name/.test(src), 'core.js fitting uses the maker check');
}
// cleanup: zone change / death clears pending designer things and marks
{ const W = world(), m = W.mon(0, 3); W.eng.release(W.ctx('ds_a3')); W.eng.release(W.ctx('ds_b5')); W.run(0.1); W.kit.addMark(m, {}); W.eng.clearTemp(); W.run(3);
  ok(m.taken.length === 0 && W.kit.live.length === 0 && W.kit.timers.length === 0 && W.kit.marks(m) === 0, 'clearTemp: no pending designer damage, marks gone'); }
// derived / decoration never add marks: stitch pull (second hit in the same cast) and finale don't add
{ const W = world(), m = W.mon(0, 4); W.eng.release(W.ctx('ds_a5')); W.run(0.1); ok(W.kit.marks(m) === 0, 'finale never adds marks'); }
console.log('designer: ' + pass + ' passed');
