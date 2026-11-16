// 화가 2차 스킬(2026-11-16 '그린 그림을 현실로') 규칙을 WebGL 없이 확인: 데이터(id·레벨·계열·종류·동작·아이콘), 예전 저장, 채색(부여·갱신·
// 시전자 분리·만료·사망·소비), 혼색 종류·반응 횟수·재귀 없음, 그림 소환물(그림 완성 = AI 시작, 상한·교체·갱신, 표적 변경, 편대 피해 분배·급강하
// 대상별 상한, 기사 도발 보스 제외, 분신 고정 능력치, 돌진과 물기 판정 구분), 화룡점정 관통·숨결 대상별 한 번, 임파스토 붓질 순서, 워터컬러
// 시전당 한 번, 포인틸리즘 고정 자리·횟수, 스펙트럼 걸작 강화·상한·풍경 한 번, 들판 회복(생명만·틱당 한 번), 성벽 충돌·통로·투사체·내구도/시간,
// 뇌운 예고 자리 = 번개 자리, 마스터의 구도(생성 순간 한 번), 만상갤러리 단일 발동·복원·작품 없을 때 거절, 정리(사망·존 이동).
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { HitShape, CombatMath, StatusSet, clamp, clamp01 } from '../js/core.js';
import { ensureSk } from '../js/skillsys.js';
import { skillSound } from '../js/sfx.js';
import { SmithKit, clearLine } from '../js/smith.js';
import { PaintKit, PaintSummon, PAINT, addColor, colorsOf, takeColors, tickColors, mixKind, spectrumCoef, landscapeScale, paintText } from '../js/painter.js';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const S2 = JSON.parse(read('../assets/data/skills2.json')), skills = S2.skills, SK = Object.fromEntries(skills.map(s => [s.id, s]));
const STATUS = Object.fromEntries(S2.statuses.map(s => [s.id, s]));
const actions = Object.fromEntries(JSON.parse(read('../assets/models/actions.json')).map(a => [a.name, a]));
const sandbox = { HitShape, CombatMath, clamp, clamp01, skillSound, SmithKit, clearLine, PaintKit, console };
vm.createContext(sandbox);
vm.runInContext(read('../js/skillrt.js').replace(/^import .*;\n/gm, '').replace(/\bexport /g, '') + '\nthis.api={SkillEngine,bindSkillRt,FX,CUSTOM};', sandbox);
const { SkillEngine, bindSkillRt, FX, CUSTOM } = sandbox.api;
Math.random = () => 0.5;   // 피해 = 100 × 계수 × mult (공격력 100, 방어 0, 치명 0)
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; };
const near = (a, b, e = 1.5) => Math.abs(a - b) <= e;

// ------------------------------------------------------------------ data
const OLD = { a1: 30, a2: 33, a3: 36, a4: 40, a5: 45, b1: 30, b2: 33, b3: 36, b4: 40, b5: 45, c1: 30, c2: 33, c3: 36, c4: 40, c5: 45 };
const TYPES = { a1: 'summon', a2: 'summon', a3: 'summon', a4: 'summon', a5: 'ultimate', b1: 'attack', b2: 'attack', b3: 'attack', b4: 'attack', b5: 'ultimate', c1: 'support', c2: 'summon', c3: 'attack', c4: 'passive', c5: 'ultimate' };
const pt = skills.filter(s => s.job === 'painter');
ok(pt.length === 15, '15 painter skills');
for (const k of Object.keys(OLD)) { const d = SK['pt_' + k]; ok(d && d.unlock === OLD[k] && d.type === TYPES[k] && d.maxLv === (d.type === 'ultimate' ? 3 : 5) && d.tier === 2, 'kept id/unlock/type/maxLv pt_' + k); }
ok(['생명을 그리는 화필', '색채 연성술', '현실이 되는 풍경화'].every((n, i) => pt.filter(s => s.cat === i).length === 5 && pt.filter(s => s.cat === i).every(s => s.catName === n)), 'line titles A/B/C, 3x5');
ok(pt.every(d => d.name.length <= 11), 'names short enough for the skill window');
for (const d of pt) if (d.anim) ok(actions[d.anim] && actions[d.anim].offGrip > 0, 'two-handed brush motion ' + d.anim);
for (const d of pt) { const pre = d.ops.find(o => o.k === 'pre'); if (pre) ok(Math.abs(-pre.at - actions[d.anim].hitT) < 1e-6, 'pre op starts at the press ' + d.id); }
for (const id of ['pt_a1', 'pt_a2', 'pt_a3', 'pt_a4']) { const o = SK[id].ops.find(x => x.k === id.slice(3)); ok(Math.abs(-o.at - actions.pt_sketch.hitT) < 1e-6 && actions.pt_sketch.hitT <= 0.35, 'summon drawing starts at the press ' + id); }
ok(actions.pt_eye.hitT === SK.pt_a5.cast, 'dragon eye dot = end of the cast (dragon starts moving)');
if (!process.env.NOICON) for (const d of pt) { const p = new URL(`../assets/ui/skills/${d.id}.png`, import.meta.url); ok(existsSync(p) && readFileSync(p).length > 1500, 'icon ' + d.id); }
ok(read('../js/sfx.js').includes("'pt_sketch'") && pt.filter(d => d.sfx).every(d => read('../js/sfx.js').includes(`'${d.sfx}'`)), 'sounds registered');

// ------------------------------------------------------------------ old save: levels / points / slots kept
{ const data = { skill2: id => SK[id] };
  const p = { sk: { points: 2, learned: { pt_a1: 4, pt_b1: 5, pt_c2: 2, pt_a5: 1 }, slots: ['pt_a1', 'pt_b1', 'pt_c2', 'pt_a5'] } };
  const sk = ensureSk(p, data);
  ok(sk.points === 2 && sk.learned.pt_a1 === 4 && sk.learned.pt_b1 === 5 && sk.learned.pt_c2 === 2 && sk.learned.pt_a5 === 1, 'old save: levels + points kept');
  ok(sk.slots.join() === 'pt_a1,pt_b1,pt_c2,pt_a5', 'old save: slots kept'); }

// ------------------------------------------------------------------ pure helpers: colours
{ const t = { dead: false };
  ok(addColor(t, 'pc', 'red') && !addColor(t, 'pc', 'red', 3), 'same colour again = refresh only');
  ok(t._ptc.pc.red === 3, 'refresh sets the time'); addColor(t, 'other', 'blue'); addColor(t, 'pc', 'yellow');
  ok(colorsOf(t, 'pc').join() === 'red,yellow' && colorsOf(t, 'other').join() === 'blue', 'colours kept per caster');
  ok(takeColors(t, 'pc').join() === 'red,yellow' && colorsOf(t, 'pc').length === 0 && colorsOf(t, 'other').join() === 'blue', 'take = only my colours, then gone');
  ok(!addColor(t, 'pc', 'green'), 'only red / blue / yellow');
  tickColors(t, 8.1); ok(t._ptc === null, 'colours expire');
  const d = { dead: false }; addColor(d, 'pc', 'red'); d.dead = true; tickColors(d, 0.01); ok(d._ptc === null, 'death clears colours');
  ok(mixKind([]) === 'none' && mixKind(['red']) === 'none' && mixKind(['red', 'blue']) === 'steam' && mixKind(['blue', 'yellow']) === 'wave' && mixKind(['yellow', 'red']) === 'core' && mixKind(['red', 'blue', 'yellow']) === 'tri', 'mix kinds (one reaction per combination)');
  const b5 = SK.pt_b5.ops.find(o => o.k === 'b5');
  ok(spectrumCoef(b5, 0, 0) === 6 && near(spectrumCoef(b5, 3, 99), 6 * (1 + 0.45 + 0.3), 1e-9) && spectrumCoef(b5, 5, 10) === spectrumCoef(b5, 3, 10), 'spectrum: kinds max 3, count cap 10');
  ok(near(landscapeScale(3, 0.2), 3.6, 1e-9) && landscapeScale(3, 0) === 3, 'landscape scale from the base value'); }

// ------------------------------------------------------------------ engine harness
function world(o = {}) {
  const sounds = [], kicks = [], fxLog = [], toasts = [];
  for (const k of Object.keys(FX).filter(k => k !== 'on')) FX[k] = () => ({ set() {}, dispose() {}, end() {}, pulse() {} });
  const handle = (kind) => new Proxy({ kind }, { get: (t, m) => m in t ? t[m] : (...a) => { fxLog.push(kind + '.' + String(m)); return handle(kind + '.' + String(m)); } });
  FX.painter = (kind) => { fxLog.push(kind); return handle(kind); };
  const learned = Object.assign({}, o.learned || {}), passives = Object.assign({}, o.passives || {});
  const book = { sk: { slots: pt.filter(x => x.type !== 'passive' && x.type !== 'craft').map(x => x.id) }, level: id => learned[id] || 1, usable: () => true, passive: k => passives[k] || 0 };
  const boxes = [], baseBlocked = o.blocked || (() => false);
  const inBox = (x, z, r) => boxes.some(b => { const a = b.yaw * Math.PI / 180, fx = Math.sin(a), fz = Math.cos(a), dx = x - b.x, dz = z - b.z, along = dx * fx + dz * fz, lat = dx * -fz + dz * fx; return Math.abs(lat) <= b.hw + r && Math.abs(along) <= b.hd + r; });
  const blocked = (x, z, r = 0) => baseBlocked(x, z, r) || inBox(x, z, r);
  const geo = { ground: (x, z) => ({ x, y: 0, z }), blocked, boxes, removeTag(tag) { for (let i = boxes.length - 1; i >= 0; i--) if (boxes[i].tag === tag) boxes.splice(i, 1); }, move: (p, dx, dz, r) => blocked(p.x + dx, p.z + dz, r) ? { ...p } : { x: p.x + dx, y: 0, z: p.z + dz } };
  const actors = [];
  const pc = { pos: { x: 0, y: 0, z: 0 }, facing: { x: 0, z: 1 }, faction: 'player', radius: 0.4, skills: { lock: 0, busy: false }, body: { sh: { actions }, play() {} }, hp: 400, maxHp: 1000, sp: 500, maxSp: 500, dead: false,
    sheet: { p: { sk: {}, job: 'painter' }, book, job: { id: 'painter' }, final: { healPower: 0, shieldPower: 0 } }, status: new StatusSet(),
    stat(k) { return k === 'atk' ? 100 : k === 'crit' ? 0 : k === 'critDmg' ? 1.5 : k === 'def' ? 50 : 0; },
    setFacing(x, z) { const m = Math.hypot(x, z) || 1; this.facing = { x: x / m, z: z / m }; }, zone: { actors, geo, def: { portals: o.portals || [] }, nearestEnemy: () => actors.find(a => !a.dead && !a.isSummon) }, dist(t) { return Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z); },
    startLunge() {}, shield: 0, addShield(v, d) { this.shield = Math.max(this.shield, v); this.shieldT = d; }, heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); } };
  const eng = new SkillEngine(pc); pc.skills2 = eng;
  bindSkillRt({ audio: { sfx: n => sounds.push(n) }, render: { kick: (...a) => kicks.push(a), addShake() { throw new Error('no random shake'); } }, hitStop() { throw new Error('no global hit-stop'); }, ui: { floatText() {}, toast(t) { toasts.push(t); } },
    data: { status: id => STATUS[id], skill2: id => SK[id], config: {}, item: () => null, job: () => ({ id: 'painter', tier: 2 }) } });
  let MID = 0;
  const mon = (x, z, extra = {}) => { const m = { uid: 'm' + (++MID), pos: { x, y: 0, z }, radius: 0.5, hp: 1e6, maxHp: 1e6, dead: false, zone: pc.zone, faction: 'monster', status: new StatusSet(), stat: k => k === 'atk' ? 50 : 0, taken: [],
      takeDamage(hd) { this.taken.push(hd); this.hp -= hd.amount; if (this.hp <= 0) this.dead = true; }, ...extra }; actors.push(m); return m; };
  const ctx = (id, L = 1, more = {}) => ({ d: SK[id], id, L, grade: 1, mult: 1 + (SK[id].type === 'ultimate' ? 0.25 : 0.12) * (L - 1), origin: { ...pc.pos }, facing: { ...pc.facing }, aim: { x: 0, y: 0, z: 3 }, hitOnce: new Set(), ...more });
  const op = (id, k) => SK[id].ops.find(x => x.k === (k || id.slice(3)));
  const cast = (id, L = 1, more = {}) => { const c = ctx(id, L, more); CUSTOM.paint(eng, op(id), c); return c; };
  const run = (sec, dt = 0.02) => { for (let i = 0; i < Math.round(sec / dt); i++) { eng.tick(dt); for (const a of actors.slice()) if (a.isSummon && a.update) a.update(dt); } };
  return { pc, eng, kit: eng.painter, mon, ctx, op, cast, run, sounds, kicks, fxLog, actors, toasts, boxes, geo, passives };
}
const sum = (m, from = 0) => m.taken.slice(from).reduce((a, h) => a + h.amount, 0);

// ================================================================== A. 생명을 그리는 화필
// A1 흑랑: nothing before the drawing is complete, bites after, max 2 (oldest replaced), dash = separate line hit once per enemy
{ const W = world(), m = W.mon(0, 3.6);
  W.cast('pt_a1', 1, { aim: { x: 0, y: 0, z: 2.2 } }); const w = W.eng.summons[0];
  ok(w.painted && w.living && !w.machine && w.kind === 'wolf', 'a1: painted living summon');
  W.run(0.7); ok(m.taken.length === 0 && !w.ready, 'a1: still being drawn (outline -> ink fill) — AI off');
  W.run(0.12); ok(w.ready && m.taken.length === 1 && near(m.taken[0].amount, 90, 1), 'a1: first bite right when the drawing completes (90%)');
  W.cast('pt_a1'); W.cast('pt_a1'); ok(W.eng.summons.filter(s => !s.dead && s.kind === 'wolf').length === 2 && w.dead, 'a1: max 2 wolves, oldest replaced');
  const W2 = world(), a = W2.mon(0, 4.5), b = W2.mon(0.3, 3.0);   // b stands on the dash line in front of a
  W2.cast('pt_a1', 1, { aim: { x: 0, y: 0, z: 0.5 } }); const w2 = W2.eng.summons[0]; w2.dashCd = 0; w2.age = w2.drawT; W2.pc.target = a; w2.target = a;
  W2.run(0.4); ok(w2.log.dashes === 1 && b.taken.length >= 1 && a.taken.length >= 1, 'a1: dash bites everything on its short line');
  ok(near(b.taken[0].amount, 100, 1), 'a1: dash hit 100% (not the bite)'); }
// A2 편대: feathers = the flock total split (not per crane), dive once per target per 'per' s, recast refreshes the same flock
{ const W = world(), m = W.mon(0, 4);
  W.cast('pt_a2'); const f = W.eng.summons[0]; ok(f.kind === 'crane' && f.fly, 'a2: one flock summon');
  W.run(0.85); ok(f.ready, 'a2: flock folded and ready');
  W.run(0.35); const vol = sum(m); ok(near(vol, 100, 2), 'a2: one feather volley = 100% total (3 feather hits, whatever the crane count)');
  ok(f.log.maxPerTarget === SK.pt_a2.ops[0].hits && m.taken.length === 3, 'a2: hits per target per volley capped at the feather count');
  W.run(8); const dives = f.log.dives; ok(dives >= 2 && dives <= Math.ceil(8 / 2.6) + 1, 'a2: dives one by one');
  const times = []; for (const k in f.diveT) times.push(f.diveT[k]); ok(times.length === 1, 'a2: dive cooldown kept per target');
  f.life = 2; W.cast('pt_a2', 2); ok(W.eng.summons.filter(s => !s.dead && s.kind === 'crane').length === 1 && f.life > 10, 'a2: recast refreshes the flock'); }
// A3 기사: taunt flag never on bosses, cone swing up to maxT targets, recast refreshes
{ const W = world(), ms = [0, 0.6, -0.6, 1.2, -1.2].map(x => W.mon(x, 4.2)), back = W.mon(0, 0);
  W.cast('pt_a3', 1, { aim: { x: 0, y: 0, z: 2.8 } }); const k = W.eng.summons[0]; ok(k.taunt && k.noBossTaunt, 'a3: taunts normal monsters only');
  ok(/s\.noBossTaunt && \(this\.isBoss \|\| this\.def\.questBoss\)/.test(read('../js/actors.js')), 'actors.js skips noBossTaunt summons for bosses');
  W.run(1.2); ok(k.log.swings === 1 && ms.filter(m => m.taken.length).length === 4 && back.taken.length === 0, 'a3: one swing hits 4 in the front fan (max), not behind');
  ok(near(ms[0].taken[0].amount, 110, 1), 'a3: swing 110%');
  k.hp = 1; W.cast('pt_a3'); ok(W.eng.summons.filter(s => !s.dead && s.kind === 'knight').length === 1 && k.hp === k.maxHp, 'a3: recast refreshes'); }
// A4 분신: fixed stats from the owner (never the target's), basic attack + short dash only
{ const W = world(), boss = W.mon(0, 4, { isBoss: true, hp: 9e9, maxHp: 9e9, stat: k => k === 'atk' ? 9999 : 0 });
  W.cast('pt_a4', 1, { tgt: boss, aim: { x: 0, y: 0, z: 4 } }); const c = W.eng.summons[0];
  ok(c.kind === 'clone' && c.maxHp === Math.max(10, 1000 * 1.2) && c.stat('atk') === 100, 'a4: fixed summon stats (owner based), boss values not copied');
  W.run(0.75); ok(c.ready, 'a4: sketch drawn then detached'); W.run(2);
  ok(boss.taken.length >= 1 && boss.taken.every(h => h.amount <= 100 * 1.0 + 1), 'a4: only its own basic attack / dash damage'); }
// A5 화룡점정: pierce once per enemy along the path + breath once per enemy at the end
{ const W = world(), a = W.mon(0, 4), b = W.mon(0.5, 11.5), side = W.mon(3, 6);
  W.cast('pt_a5'); ok(W.kicks.length === 0, 'a5: nothing hits before the dragon moves');
  W.run(1.2);
  ok(a.taken.length === 1 && near(a.taken[0].amount, 440, 1), 'a5: pierce 440% once');
  ok(b.taken.length === 2 && near(sum(b), 880, 2), 'a5: an enemy at the end gets pierce + breath (1 each)');
  ok(side.taken.length === 0 && W.kicks.length === 1, 'a5: outside untouched, one camera kick (breath)');
  }

// ================================================================== B. 색채 연성술
// B1 임파스토: damage when the stroke passes (right side first), burn + red
{ const W = world(), right = W.mon(1.5, 2.5), left = W.mon(-1.5, 2.5), behind = W.mon(0, -2);
  const c = W.cast('pt_b1'); W.run(0.2);
  ok(right.taken.length === 1 && left.taken.length === 1 && behind.taken.length === 0, 'b1: fan 4 m 80°');
  ok(c.b1.times.length === 2 && c.b1.times[0] < c.b1.times[1] && right.taken[0] && W.kit, 'b1: hit times follow the stroke');
  ok(right.status.has('burn') && colorsOf(right, 'pc').join() === 'red' && near(right.taken[0].amount, 220, 1), 'b1: 220% + burn + red'); }
// B2 워터컬러: once per enemy per cast, slow + blue, stops at walls
{ const W = world(), a = W.mon(0, 2), b = W.mon(0.5, 6.5), out = W.mon(0, 9.5);
  const c = W.cast('pt_b2'); W.run(1.2);
  ok(a.taken.length === 1 && b.taken.length === 1 && out.taken.length === 0 && c.b2.hits === 2, 'b2: each enemy once on the 8 m wave');
  ok(a.status.has('slow') && colorsOf(a, 'pc').join() === 'blue', 'b2: slow + blue');
  const W2 = world({ blocked: (x, z) => z > 3 && z < 3.6 }), x = W2.mon(0, 6); W2.cast('pt_b2'); W2.run(1.2); ok(x.taken.length === 0, 'b2: the wave stops at a wall'); }
// B3 포인틸리즘: fixed at the first spot (dodgeable), centre target gets rings + final = 4 hits, yellow
{ const W = world(), c0 = W.mon(0, 4), edge = W.mon(2.5, 4);
  const c = W.cast('pt_b3', 1, { tgt: c0 }); W.run(1.2);
  ok(c0.taken.length === 4 && near(sum(c0), 60 * 3 + 120, 2), 'b3: centre = 3 rings + final (300%)');
  ok(edge.taken.length === 1, 'b3: outer target only in the outer ring');
  ok(colorsOf(c0, 'pc').join() === 'yellow', 'b3: yellow');
  const W2 = world(), m = W2.mon(0, 4); W2.cast('pt_b3', 1, { tgt: m }); W2.run(0.05); m.pos = { x: 5, y: 0, z: 4 }; W2.run(1.2); ok(m.taken.length === 0, 'b3: stays where it was cast (moving out dodges)'); }
// B4 팔레트 퓨전: consumes my colours at that moment, one reaction per combination, reaction damage once per enemy, derived (no new colours)
{ const W = world(), t = W.mon(0, 4), n1 = W.mon(1.0, 4), n2 = W.mon(-1.0, 4.2), far = W.mon(0, 9);
  addColor(t, 'pc', 'red'); addColor(t, 'pc', 'blue'); addColor(n1, 'pc', 'red'); addColor(n1, 'pc', 'blue'); addColor(n2, 'other', 'yellow'); addColor(n2, 'other', 'red');
  W.kit.colored.add(t); W.kit.colored.add(n1);
  const c = W.cast('pt_b4', 1, { tgt: t });
  ok(colorsOf(t, 'pc').length === 0 && colorsOf(n1, 'pc').length === 0 && colorsOf(n2, 'other').length === 2, 'b4: my colours consumed, other caster untouched');
  ok(c.b4.kinds.filter(k => k === 'steam').length === 2 && c.b4.kinds.filter(k => k === 'none').length === 1, 'b4: steam on both red+blue targets, none on the other');
  ok(t.taken.length === 2 && n1.taken.length === 2 && n2.taken.length === 2, 'b4: base + one reaction each (steam overlap does not double)');
  ok(t.taken[1].derived && near(t.taken[0].amount, 160, 1) && near(t.taken[1].amount, 140, 1), 'b4: base 160% + steam 140% (derived)');
  ok(far.taken.length === 0 && colorsOf(t, 'pc').length === 0, 'b4: no re-colour from the reaction');
  const W2 = world(), x = W2.mon(0, 4); for (const k of ['red', 'blue', 'yellow']) addColor(x, 'pc', k);
  const c2 = W2.cast('pt_b4', 1, { tgt: x }); ok(c2.b4.kinds.join() === 'tri' && x.taken.length === 2 && near(x.taken[1].amount, 280, 1), 'b4: three colours = tri reaction only (no 3 two-colour reactions)');
  const W3 = world(), y = W3.mon(0, 4); addColor(y, 'pc', 'red'); W3.cast('pt_b4', 1, { tgt: y }); ok(y.taken.length === 1 && near(y.taken[0].amount, 160, 1), 'b4: one colour -> base only');
  W3.cast('pt_b4', 1, { tgt: y }); ok(y.taken.length === 2, 'b4: nothing left to consume twice'); }
// B5 스펙트럼 걸작: base without colours, kinds/count bonus, red burn / blue slow / yellow core, each landscape once
{ const W = world(), a = W.mon(0, 3); W.cast('pt_b5'); ok(near(a.taken[0].amount, 600 * 1, 1) && a.taken.length === 1, 'b5: no colours = base 600%');
  const W2 = world(), x = W2.mon(0, 1.5), y = W2.mon(2, 2); for (const k of ['red', 'blue', 'yellow']) { addColor(x, 'pc', k); addColor(y, 'pc', k); }
  W2.cast('pt_c3', 1, { aim: { x: 0, y: 0, z: 2 } }); W2.cast('pt_c1', 1, { aim: { x: -4, y: 0, z: 0 } }); W2.run(0.05); const x0 = x.taken.length;
  const c = W2.cast('pt_b5');
  ok(c.b5.kinds.length === 3 && c.b5.count === 6 && near(c.b5.coef, 6 * (1 + 0.45 + 0.18), 1e-9), 'b5: 3 kinds + 6 colours');
  ok(x.status.has('burn') && x.status.has('slow'), 'b5: red burn + blue slow');
  ok(x.taken.length - x0 === 1 + 1 + 1, 'b5: main + yellow core + storm landscape once (no more)');
  ok(c.b5.land === 2 && colorsOf(x, 'pc').length === 0, 'b5: two landscapes, each once; colours consumed'); }

// ================================================================== C. 현실이 되는 풍경화
// C1 꽃의 들판: heals me + living summons once per tick (not machines), one field, size/time from the base once
{ const W = world({ passives: { landscapeSize: 0.2, landscapeTime: 0.2 } }); W.pc.hp = 100;
  const machine = { pos: { x: 0, z: 3 }, hp: 10, maxHp: 100, living: false, machine: true, dead: false, status: new StatusSet() }; W.eng.summons.push(machine);
  W.cast('pt_a1', 1, { aim: { x: 0.5, y: 0, z: 3 } }); W.run(0.8); const wolf = W.eng.summons.find(s => s.kind === 'wolf'); wolf.hp = 5; wolf.target = null; wolf.o = { ...wolf.o, range: 0 };
  W.pc.pos = { x: 0, y: 0, z: 3 };
  W.cast('pt_c1', 1, { aim: { x: 0, y: 0, z: 3 } }); const f = W.kit.fields[0];
  ok(near(f.r, 3.6, 1e-9) && near(f.life, 8 * 1.2 + 0.6, 1e-9), 'c1: radius / time x (1 + passive) once');
  W.run(0.62); ok(near(W.pc.hp - 100, 25, 0.01) && wolf.hp > 5 && machine.hp === 10, 'c1: 2.5% heal to me + living summon, not machine');
  W.cast('pt_c1', 1, { aim: { x: 0, y: 0, z: 3 } }); ok(W.kit.fields.filter(x => x.kind === 'meadow').length === 1 && near(W.kit.fields[0].r, 3.6, 1e-9), 'c1: recast replaces, size not multiplied again'); }
// C2 백색 성벽: real collision box, enemies pushed out, durability and time separate, blocks projectiles, safety checks
{ const W = world(), m = W.mon(0.2, 3.1);
  ok(W.kit.validate(SK.pt_c2, { x: 0, y: 0, z: 3 }) === null, 'c2: open ground ok');
  W.cast('pt_c2', 1, { aim: { x: 0, y: 0, z: 3 } }); const w = W.kit.walls[0];
  ok(W.boxes.length === 1 && W.geo.blocked(0, 3, 0.1) && !W.geo.blocked(0, 1, 0.1), 'c2: wall blocks movement at its spot only');
  ok(Math.abs(m.pos.z - 3) > 0.4, 'c2: enemy standing there is pushed out (not trapped)');
  const life0 = w.life; W.kit.damageWall(w, w.maxHp * 0.4); ok(w.hp < w.maxHp && w.life === life0 && !w.dead, 'c2: durability separate from time');
  ok(W.kit.projBlocked({ x: 0.5, z: 3.1 }, { owner: { stat: () => 40 }, coef: 1 }) && w.blockedShots === 1, 'c2: enemy projectile blocked by the wall costs durability');
  W.kit.damageWall(w, w.maxHp); ok(w.dead && W.boxes.length === 0, 'c2: broken -> removed (back to a flat drawing)');
  W.cast('pt_c2', 1, { aim: { x: 0, y: 0, z: 3 } }); W.cast('pt_c2', 1, { aim: { x: 0, y: 0, z: 5 } }); W.cast('pt_c2', 1, { aim: { x: 3, y: 0, z: 3 } });
  ok(W.kit.walls.length === 2 && W.boxes.length === 2, 'c2: max 2 walls (oldest erased)');
  W.run(9.5); ok(W.kit.walls.length === 0 && W.boxes.length === 0, 'c2: time out -> removed');
  const W2 = world({ portals: [{ pos: [0, 3.2], radius: 1 }] }); ok(/출입구/.test(W2.kit.validate(SK.pt_c2, { x: 0, y: 0, z: 3 })), 'c2: no walls on portals');
  const W3 = world({ blocked: (x) => Math.abs(x) > 2.2 }); ok(/통로/.test(W3.kit.validate(SK.pt_c2, { x: 0, y: 0, z: 3 })), 'c2: never seals a corridor');
  ok(/내 자리/.test(world().kit.validate(SK.pt_c2, { x: 0, y: 0, z: 0.3 })), 'c2: never on me');
  const W4 = world({ passives: { landscapeSize: 0.3 }, blocked: (x) => Math.abs(x) > 2.9 }); W4.cast('pt_c2', 1, { aim: { x: 0, y: 0, z: 3 } });
  ok(W4.kit.walls.length === 1 && W4.kit.walls[0].w === 3.4, 'c2: the longer (passive) wall falls back to the base length where it would seal the way'); }
// C3 뇌운: rain once per tick per enemy, each bolt lands exactly where it was warned, after the warning
{ const W = world(), m = W.mon(0.5, 3);
  W.cast('pt_c3', 1, { aim: { x: 0, y: 0, z: 3 } }); const f = W.kit.fields[0];
  W.run(0.76); ok(W.fxLog.includes('warn') && !W.fxLog.includes('storm.bolt'), 'c3: warning first');
  W.run(0.5); ok(W.fxLog.includes('storm.bolt') && f.bolts[0].x === 0.5 && f.bolts[0].z === 3, 'c3: bolt at the warned spot (on the enemy)');
  W.run(7); ok(f.dead && f.rains >= 6 && f.rains <= 8, 'c3: rain ticks over 7 s');
  ok(m.taken.filter(h => h.derived).every(h => near(h.amount, 20, 1)) && m.taken.some(h => !h.derived && near(h.amount, 62, 1)), 'c3: rain 20% / bolt 62%'); }
// C5 만상갤러리: refuses with no works (no cost), one-off per work, summon buff max (not added), restored exactly
{ const W0 = world(); ok(/작품/.test(W0.kit.validate(SK.pt_c5)), 'c5: no works -> refused before any cost');
  const W = world(), m = W.mon(0, 6); W.pc.hp = 100;
  W.cast('pt_c1', 1, { aim: { x: 0, y: 0, z: 0 } }); W.cast('pt_c2', 1, { aim: { x: 0, y: 0, z: 3 } }); W.cast('pt_c3', 1, { aim: { x: 0, y: 0, z: 6 } }); W.cast('pt_a3', 1, { aim: { x: 2, y: 0, z: 2 } });
  W.run(0.7); const wall = W.kit.walls[0]; W.kit.damageWall(wall, wall.maxHp * 0.9); const k = W.eng.summons.find(s => s.kind === 'knight');
  ok(W0.kit.validate(SK.pt_c5) && W.kit.validate(SK.pt_c5) === null, 'c5: allowed with works');
  const hp0 = W.pc.hp, c = W.cast('pt_c5');
  ok(near(W.pc.hp - hp0, 60, 0.01) && c.c5.heal >= 1, 'c5: meadow heal pulse once (6%)');
  ok(near(wall.hp, wall.maxHp * 0.1 + wall.maxHp * 0.3, 1e-6), 'c5: wall repaired 30%');
  const w2 = world(); w2.cast('pt_c2', 1, { aim: { x: 0, y: 0, z: 3 } }); w2.cast('pt_c5'); ok(w2.kit.walls[0].hp === w2.kit.walls[0].maxHp, 'c5: repair never above max');
  ok(c.c5.bolts === 1 && k.galleryAtk === 0.4, 'c5: one extra bolt, summon attack +40%');
  W.cast('pt_c5', 3); ok(k.galleryAtk === 0.4, 'c5: recast does not stack (capped max)');
  W.run(11.3); ok(k.galleryAtk === 0 && W.kit.gallery === null, 'c5: restored exactly at the end'); void m; }
// tooltips from the real op values
{ const t = paintText(SK.pt_b4, 1), t2 = paintText(SK.pt_c1, 1, { size: 0.2, time: 0.2 });
  ok(/160%/.test(t) && /증기 140%/.test(t), 'tooltip b4 from data'); ok(/3\.6 m/.test(t2), 'tooltip c1 shows the passive size');
  ok(/풍경 크기/.test(paintText(SK.pt_c4, 3)), 'tooltip c4'); }

// cleanup: target death retarget, owner far away, death / zone change (clearTemp)
{ const W = world(), a = W.mon(0, 2.4, { hp: 50 }), b = W.mon(1.5, 3);
  W.cast('pt_a1', 1, { aim: { x: 0, y: 0, z: 1.2 } }); W.run(3); const w = W.eng.summons[0]; ok(a.dead && b.taken.length > 0, 'summon switches to the next target');
  W.pc.pos = { x: 40, y: 0, z: 0 }; W.run(0.1); ok(Math.hypot(w.pos.x - 40, w.pos.z) < 3 && w.log.redraw === 1, 'summon redrawn next to the owner when far');
  addColor(b, 'pc', 'red'); W.kit.color(b, 'blue'); W.cast('pt_c3', 1, { aim: { x: 40, y: 0, z: 3 } }); W.cast('pt_c2', 1, { aim: { x: 40, y: 0, z: 3 } }); W.cast('pt_a5');
  W.eng.clearTemp(); ok(w.dead && !W.actors.includes(w) && W.kit.fields.length === 0 && W.kit.walls.length === 0 && W.boxes.length === 0 && W.kit.things.length === 0 && W.kit.timers.length === 0 && colorsOf(b, 'pc').length === 0, 'clearTemp removes summons, fields, walls, dragon, timers, my colours');
  const W2 = world(); W2.cast('pt_a3'); W2.run(0.1); W2.pc.dead = true; W2.run(0.05); ok(W2.eng.summons.every(s => s.dead), 'owner death -> summons vanish'); }
ok(true, 'no G.hitStop / addShake used');
console.log('painter tests passed:', pass);
