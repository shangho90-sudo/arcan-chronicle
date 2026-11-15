// 한약사 2차 스킬(2026-11-16 '본초 도사') 규칙을 WebGL 없이 확인: 데이터(id·레벨·계열·레시피·동작·아이콘), 예전 저장, A 탕약·경락(대주천 가까운 생명
// 소환물만·금강 약갑 갱신·훈증진 회복/정화·생명 소환물만·백초귀원 흡수 순간), B 영물(성장 시간 = 행동 시작, 반룡근 2개 교체·보스는 둔화,
// 자운화 틱당 적마다 1회·중독+공격력 감소, 동자 깡충·주인 회복·다시 부르면 갱신, 수호령 도발 보스 제외·발구르기 부채꼴, 신농백초원 들어오고
// 나갈 때 강화 켜고 끔·상한), C 오행(청룡승근 적마다 1회·속박 보너스, 주작천구 날개 판정·방어력 감소 보너스, 황정지맥 1회·피해 감소, 백호유침
// 대상마다 4침·총합·방어력 감소·대상 사망, 현무약해 보스 안 밀림·시전당 1번·영역당 +4초 상한), 정리(사망·맵 이동·대상 사망).
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { HitShape, CombatMath, StatusSet, clamp, clamp01, GameData, CharacterSheet, newProfile } from '../js/core.js';
import { ensureSk } from '../js/skillsys.js';
import { skillSound } from '../js/sfx.js';
import { SmithKit, clearLine } from '../js/smith.js';
import { HerbalKit, HerbSummon, HERB, extendField, summonBuff, pickTarget } from '../js/herbal.js';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const S2 = JSON.parse(read('../assets/data/skills2.json')), skills = S2.skills, SK = Object.fromEntries(skills.map(s => [s.id, s]));
const STATUS = Object.fromEntries(S2.statuses.map(s => [s.id, s]));
const actions = Object.fromEntries(JSON.parse(read('../assets/models/actions.json')).map(a => [a.name, a]));
const sandbox = { HitShape, CombatMath, clamp, clamp01, skillSound, SmithKit, clearLine, HerbalKit, console };
vm.createContext(sandbox);
vm.runInContext(read('../js/skillrt.js').replace(/^import .*;\n/gm, '').replace(/\bexport /g, '') + '\nthis.api={SkillEngine,bindSkillRt,FX,CUSTOM};', sandbox);
const { SkillEngine, bindSkillRt, FX, CUSTOM } = sandbox.api;
Math.random = () => 0.5;   // 피해 = 100 × 계수 × mult (공격력 100, 방어 0, 치명 0) — 총합 비교
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; };
const near = (a, b, e = 1.5) => Math.abs(a - b) <= e;

// ------------------------------------------------------------------ data
const OLD = { a1: 30, a2: 33, a3: 36, a4: 40, a5: 45, b1: 30, b2: 33, b3: 36, b4: 40, b5: 45, c1: 30, c2: 33, c3: 36, c4: 40, c5: 45 };
const TYPES = { a1: 'craft', a2: 'support', a3: 'support', a4: 'support', a5: 'ultimate', b1: 'summon', b2: 'summon', b3: 'summon', b4: 'summon', b5: 'ultimate', c1: 'attack', c2: 'attack', c3: 'attack', c4: 'attack', c5: 'attack' };
const hb = skills.filter(s => s.job === 'herbalist');
ok(hb.length === 15, '15 herbalist skills');
for (const k of Object.keys(OLD)) { const d = SK['hb_' + k]; ok(d && d.unlock === OLD[k] && d.type === TYPES[k] && d.maxLv === (d.type === 'ultimate' ? 3 : 5) && d.tier === 2, 'kept id/unlock/type/maxLv hb_' + k); }
ok(['비전 탕약과 경락', '본초 영물술', '오행 침구술'].every((n, i) => hb.filter(s => s.cat === i).length === 5 && hb.filter(s => s.cat === i).every(s => s.catName === n)), 'line titles A/B/C, 3x5');
ok(S2.recipes.find(r => r.id === 'r_tonic').skill === 'hb_a1' && SK.hb_a1.recipes.includes('r_tonic') && S2.recipes.find(r => r.id === 'r_tonic').output.item === 'f_tonic', 'craft recipe still linked (r_tonic -> f_tonic)');
for (const d of hb) if (d.anim) ok(actions[d.anim] && actions[d.anim].stow && actions[d.anim].hitT <= 0.35, 'motion ' + d.anim + ' (free hands, pestle on back)');
for (const d of hb) { const pre = d.ops.find(o => o.k === 'pre'); if (pre && actions[d.anim]) ok(Math.abs(-pre.at - actions[d.anim].hitT) < 1e-6, 'pre op starts at the press ' + d.id); }
if (!process.env.NOICON) for (const d of hb) { const p = new URL(`../assets/ui/skills/${d.id}.png`, import.meta.url); ok(existsSync(p) && readFileSync(p).length > 1500, 'icon ' + d.id); }

// ------------------------------------------------------------------ old save: levels / points / slots kept
{ const data = { skill2: id => SK[id] };
  const p = { sk: { points: 3, learned: { hb_a2: 3, hb_b1: 5, hb_c1: 2, hb_b5: 1 }, slots: ['hb_b1', 'hb_c1', 'hb_a2', 'hb_b5'] } };
  const sk = ensureSk(p, data);
  ok(sk.points === 3 && sk.learned.hb_a2 === 3 && sk.learned.hb_b1 === 5 && sk.learned.hb_c1 === 2 && sk.learned.hb_b5 === 1, 'old save: levels + points kept');
  ok(sk.slots.join() === 'hb_b1,hb_c1,hb_a2,hb_b5', 'old save: slots kept'); }

// ------------------------------------------------------------------ pure helpers
{ const f = { uid: 1, herb: true, life: 5, ext: 0 }, r1 = new Set(), r2 = new Set(), r3 = new Set();
  ok(extendField(f, 2, 4, r1) === 2 && extendField(f, 2, 4, r1) === 0, 'extend: once per cast record');
  ok(extendField(f, 2, 4, r2) === 2 && extendField(f, 2, 4, r3) === 0 && f.ext === 4 && f.life === 9, 'extend: per-field cap +4 s');
  ok(extendField({ uid: 2, herb: false, life: 5 }, 2, 4, new Set()) === 0, 'non-herb fields are never extended');
  const s = { pos: { x: 0, z: 0 } }, g = { kind: 'garden', c: { x: 0, z: 0 }, r: 7, ready: true, empower: 0.9 };
  ok(summonBuff(s, [g]) === HERB.buffCap, 'garden buff capped'); ok(summonBuff({ pos: { x: 8, z: 0 } }, [g]) === 0, 'outside -> no buff');
  const a = { pos: { x: 2, z: 0 }, radius: 0.5, status: new StatusSet() }, b = { pos: { x: 3.5, z: 0 }, radius: 0.5, status: new StatusSet() };
  ok(pickTarget({ x: 0, z: 0 }, [a, b], 9) === a, 'nearest first'); b.status.apply(STATUS.defdown, 5, 0.2); ok(pickTarget({ x: 0, z: 0 }, [a, b], 9) === b, 'summons focus defence-down targets');
}

// ------------------------------------------------------------------ engine harness
function world(o = {}) {
  const sounds = [], kicks = [], fxLog = [];
  for (const k of Object.keys(FX).filter(k => k !== 'on')) FX[k] = () => ({ set() {}, dispose() {}, end() {}, pulse() {} });
  const handle = (kind) => new Proxy({ kind }, { get: (t, m) => m in t ? t[m] : (...a) => { fxLog.push(kind + '.' + String(m)); return handle(kind + '.' + String(m)); } });
  FX.herbal = (kind) => { fxLog.push(kind); return handle(kind); };
  const learned = Object.assign({}, o.learned || {});
  const book = { sk: { slots: hb.filter(x => x.type !== 'passive' && x.type !== 'craft').map(x => x.id) }, level: id => learned[id] || 0, usable: () => true, passive: () => 0 };
  const blocked = o.blocked || (() => false);
  const geo = { ground: (x, z) => ({ x, y: 0, z }), blocked, move: (p, dx, dz, r) => blocked(p.x + dx, p.z + dz, r) ? { ...p } : { x: p.x + dx, y: 0, z: p.z + dz } };
  const actors = [];
  const pc = { pos: { x: 0, y: 0, z: 0 }, facing: { x: 0, z: 1 }, faction: 'player', skills: { lock: 0, busy: false }, body: { sh: { actions }, play() {} }, hp: 400, maxHp: 1000, sp: 500, maxSp: 500, dead: false,
    sheet: { p: { sk: {}, job: 'herbalist' }, book, job: { id: 'herbalist' }, final: { healPower: 0, shieldPower: 0 } }, status: new StatusSet(),
    stat(k) { return k === 'atk' ? 100 : k === 'crit' ? 0 : k === 'critDmg' ? 1.5 : k === 'def' ? 50 : k === 'healPower' ? this.status.add('healPower') : 0; },
    setFacing(x, z) { const m = Math.hypot(x, z) || 1; this.facing = { x: x / m, z: z / m }; }, zone: { actors, geo, def: { portals: [] }, nearestEnemy: () => actors.find(a => !a.dead && !a.isSummon) }, dist(t) { return Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z); },
    startLunge() {}, shield: 0, addShield(v, d) { this.shield = Math.max(this.shield, v); this.shieldT = d; }, heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); } };
  const eng = new SkillEngine(pc); pc.skills2 = eng;
  bindSkillRt({ audio: { sfx: n => sounds.push(n) }, render: { kick: (...a) => kicks.push(a), addShake() { throw new Error('no random shake'); } }, hitStop() { throw new Error('no global hit-stop'); }, ui: { floatText() {}, toast() {} },
    data: { status: id => STATUS[id], skill2: id => SK[id], config: {}, item: () => null, job: () => ({ id: 'herbalist', tier: 2 }) } });
  const mon = (x, z, extra = {}) => { const m = { pos: { x, y: 0, z }, radius: 0.5, hp: 1e6, maxHp: 1e6, dead: false, zone: pc.zone, faction: 'monster', status: new StatusSet(), stat: () => 0, taken: [],
      takeDamage(hd) { this.taken.push(hd); this.hp -= hd.amount; if (this.hp <= 0) this.dead = true; }, ...extra }; actors.push(m); return m; };
  const ctx = (id, L = 1, more = {}) => ({ d: SK[id], id, L, grade: 1, mult: 1 + (SK[id].type === 'ultimate' ? 0.25 : 0.12) * (L - 1), origin: { ...pc.pos }, facing: { ...pc.facing }, aim: { x: 0, y: 0, z: 3 }, hitOnce: new Set(), ...more });
  const op = (id, k) => SK[id].ops.find(x => x.k === (k || id.slice(3)));
  const cast = (id, L = 1, more = {}) => { const c = ctx(id, L, more); CUSTOM.herb(eng, op(id), c); return c; };
  const run = (sec, dt = 0.02) => { for (let i = 0; i < Math.round(sec / dt); i++) { eng.tick(dt); for (const a of actors.slice()) if (a.isSummon && a.update) a.update(dt); } };
  const sum = m => m.taken.reduce((a, h) => a + h.amount, 0);
  return { pc, eng, kit: eng.herbal, mon, ctx, op, cast, run, sum, sounds, kicks, fxLog, actors };
}
const ownAmount = (m, from = 0) => m.taken.slice(from).reduce((a, h) => a + h.amount, 0);

// A2 대주천: self MP regen + haste, haste to living summons within 10 m only
{ const W = world(); W.cast('hb_b3'); W.run(0.1); const gs = W.eng.summons[0];
  const far = new HerbSummon(W.kit, 'root', W.op('hb_b1'), W.ctx('hb_b1'), { x: 30, y: 0, z: 0 }); W.eng.summons.push(far); W.actors.push(far);
  W.cast('hb_a2', 3);
  ok(W.pc.status.get('mpregen').value === 4 && near(W.pc.status.get('haste').value, 0.2 * 1.24, 1e-9), 'a2: mp regen + haste (x mult)');
  ok(gs.status.has('haste') && !far.status.has('haste'), 'a2: near living summon only');
  ok(near(W.pc.status.get('haste').remaining, 8 * 1.1, 1e-9), 'a2: duration 8 s x (1 + 0.05(L-1))'); }
// A3 금강 약갑: defup + ccres + shield; recast refreshes (no stacking)
{ const W = world(); W.cast('hb_a3', 5);
  ok(near(W.pc.status.get('defup').value, 0.3 * 1.48, 1e-9) && W.pc.status.get('ccres').value === 0.5, 'a3: defup x mult, ccres 50%');
  ok(W.pc.shield === Math.round(1000 * (0.06 + 0.04)), 'a3: shield 6% +1%/Lv of max HP (Lv5 = 10%)');
  W.run(3); W.cast('hb_a3', 5); ok(W.pc.shield === 100 && near(W.pc.status.get('defup').remaining, 12, 1e-6), 'a3: recast refreshes, no stacking');
  W.pc.takeHit = 1; W.kit.onPlayerHit({ source: { pos: { x: 3, z: 0 } } }); ok(W.fxLog.includes('armor.flash'), 'a3: the hit side flashes'); }
// A4 백초 훈증진: heal self + LIVING summons, cleanse, first tick at the growth end, one at a time
{ const W = world(); W.cast('hb_b3'); W.run(0.8); const gs = W.eng.summons[0]; gs.hp = 10;
  const machine = { pos: { x: 0, z: 0.5 }, hp: 10, maxHp: 100, living: false, dead: false, herbal: false, status: new StatusSet() }; W.eng.summons.push(machine);
  W.pc.status.apply(STATUS.poison, 9, 5); W.pc.status.apply(STATUS.slow, 9, 0.3);
  const c = W.cast('hb_a4', 1, { aim: { x: 0, y: 0, z: 0 } }); const hp0 = W.pc.hp;
  W.run(0.4); ok(W.pc.hp === hp0, 'a4: no heal while growing');
  W.run(0.2); if (process.env.DBG) console.log(W.pc.hp - hp0, gs.hp, gs.pos, machine.hp, W.kit.fields[0]); ok(near(W.pc.hp - hp0, 25, 0.01) && gs.hp > 10 && machine.hp === 10, 'a4: tick heals me + living summon (2.5%), not machines');
  ok(W.pc.status.list.filter(s => s.def.debuff).length === 1, 'a4: one debuff cleansed per tick');
  W.run(1.5); ok(W.pc.status.list.filter(s => s.def.debuff).length === 0, 'a4: next tick cleanses the next');
  W.cast('hb_a4', 1, { aim: { x: 2, y: 0, z: 0 } }); ok(W.kit.fields.filter(f => f.kind === 'steam').length === 1, 'a4: recast replaces (one field)'); void c; }
// A5 백초귀원: the big heal lands at the absorb moment
{ const W = world(); W.pc.hp = 100; W.cast('hb_a5', 1); W.run(0.5); ok(W.pc.hp === 100, 'a5: nothing before the pill is absorbed');
  W.run(0.2); ok(near(W.pc.hp, 100 + 350, 0.01) && W.pc.status.has('atkup') && W.pc.status.has('defup') && W.pc.status.has('healup'), 'a5: heal 35% + atk/def/heal buffs at absorb'); }

// B1 반룡근: acts only after growth, binds (boss: slow), max 2 (oldest replaced)
{ const W = world(), m = W.mon(0, 4), boss = W.mon(1.2, 3, { isBoss: true });
  W.cast('hb_b1', 1, { aim: { x: 0, y: 0, z: 3 } }); W.run(0.4); ok(m.taken.length === 0 && boss.taken.length === 0, 'b1: no bite while growing');
  W.run(0.2); const r = W.eng.summons[0]; if (process.env.DBG) console.log(r.age, r.ready, r.pos, m.taken.length, boss.taken.length, r.target && r.target.pos, r.cd); ok(r.ready && r.living && (m.taken.length + boss.taken.length) === 1, 'b1: first bite right at growth end');
  W.run(3); ok(m.status.has('root') && !boss.status.has('root'), 'b1: normal enemy bound');
  ok(near(ownAmount(m) / m.taken.length, 60, 1), 'b1: bite = 60%');
  W.pc.target = boss; W.run(2.2); ok(!boss.status.has('root') && (boss.status.has('slow') || boss.taken.length === 0), 'b1: boss is slowed instead of bound');
  W.cast('hb_b1'); W.cast('hb_b1'); ok(W.eng.summons.filter(s => !s.dead && s.kind === 'root').length === 2 && r.dead, 'b1: max 2, oldest replaced'); }
// B2 자운화: one hit per enemy per tick (however many flowers), poison + atkdown, grows first
{ const W = world(), m = W.mon(0, 3), n = W.mon(1, 3.5);
  W.cast('hb_b2', 1, { aim: { x: 0, y: 0, z: 3 } }); W.run(0.5); ok(m.taken.length === 0, 'b2: buds grow first');
  W.run(0.12); ok(m.taken.length === 1 && n.taken.length === 1 && m.status.has('poison') && near(m.status.get('atkdown').value, 0.1, 1e-9), 'b2: first spore ring = 1 hit each + poison + attack down');
  W.run(3); ok(m.taken.length === 4, 'b2: one per tick (1 s)'); ok(near(ownAmount(m) / 4, 45, 1), 'b2: 45% per tick');
  W.run(6); const f0 = m.taken.length; W.run(1); ok(m.taken.length === f0 && W.kit.fields.length === 0, 'b2: ends after 8 s (+growth)'); }
// B3 천년삼 동자: grows, hops (moves only in the air), whips, heals the owner with a delayed drop, recast refreshes
{ const W = world(), m = W.mon(0, 7); W.pc.hp = 100;
  W.cast('hb_b3'); const g = W.eng.summons[0]; W.run(0.6); ok(!g.ready && m.taken.length === 0, 'b3: still sprouting');
  let ground = 0, movedGround = false; for (let i = 0; i < 40; i++) { const p0 = { ...g.pos }; W.run(0.02); if (g.moving && g.hopT >= HERB.hop.air) { ground++; if (Math.hypot(g.pos.x - p0.x, g.pos.z - p0.z) > 1e-6) movedGround = true; } }
  ok(ground > 0 && !movedGround, 'b3: no sliding while the feet are down');
  W.run(3); ok(m.taken.length > 0 && near(m.taken[0].amount, 70, 1), 'b3: root whip 70%');
  W.pc.hp = 100; const t0 = g.log.heals; W.run(4.2); ok(g.log.heals > t0, 'b3: heal drop sent');
  W.run(0.6); ok(W.pc.hp > 100, 'b3: owner healed when the drop arrives');
  g.hp = 5; g.life = 3; W.cast('hb_b3', 2); ok(W.eng.summons.filter(s => !s.dead && s.kind === 'ginseng').length === 1 && g.hp === g.maxHp && g.life > 30, 'b3: recast refreshes the same child'); }
// B4 녹각수호령: taunts normal monsters only (flag read by actors.js), rams + periodic fan stomp
{ const W = world(), m = W.mon(0, 3.2), side = W.mon(3, 0), back = W.mon(0, -3);
  W.cast('hb_b4', 1, { aim: { x: 0, y: 0, z: 1.5 } }); const d = W.eng.summons[0]; ok(d.taunt && d.noBossTaunt && d.living, 'b4: taunt flag, never on bosses');
  const src = read('../js/actors.js'); ok(/s\.noBossTaunt && \(this\.isBoss \|\| this\.def\.questBoss\)/.test(src), 'actors.js Monster.player skips noBossTaunt summons for bosses');
  W.run(6); ok(d.log.stomps >= 1 && d.log.rams >= 1, 'b4: rams + stomps');
  ok(back.taken.length === 0, 'b4: stomp is a front fan (enemy behind untouched)'); void side; }
// B5 신농백초원: eruption once, slows, buffs my summons only while inside
{ const W = world(), m = W.mon(0, 5), out = W.mon(0, 9);
  W.cast('hb_b3'); W.run(0.8); const g = W.eng.summons[0]; g.target = null;
  W.cast('hb_b5', 1); ok(m.taken.length === 1 && out.taken.length === 0 && near(m.taken[0].amount, 240, 1), 'b5: roots erupt once (240%) inside only');
  W.run(0.05); ok(g.herbBuff === 0.5, 'b5: summon inside buffed'); ok(m.status.has('slow'), 'b5: enemies slowed');
  g.pos = { x: 20, y: 0, z: 0 }; W.kit.tick(0.01); ok(g.herbBuff === 0, 'b5: leaving removes the buff the same frame'); }

// C1 청룡승근: roots in order; each enemy once; bound bonus
{ const W = world(), a = W.mon(0, 2), b = W.mon(0.3, 2.4), c = W.mon(0, 6); a.status.apply(STATUS.root, 5, 0);
  W.cast('hb_c1'); W.run(0.6);
  ok(a.taken.length === 1 && b.taken.length === 1 && c.taken.length === 1, 'c1: one hit per enemy (many roots)');
  ok(near(a.taken[0].amount, 384, 1) && near(b.taken[0].amount, 240, 1), 'c1: 240%, x1.6 on a bound enemy');
  ok(W.kicks.length >= 1, 'c1: one camera kick on a real hit'); }
// C2 주작천구: wing-shaped impact (side reach), burn, defence-down bonus
{ const W = world(), a = W.mon(0, 6), wingT = W.mon(2.3, 6), off = W.mon(0, 8.5); wingT.status.apply(STATUS.defdown, 5, 0.2);
  W.cast('hb_c2', 1, { aim: { x: 0, y: 0, z: 9 } }); W.run(1.0);
  ok(a.taken.length === 1 && wingT.taken.length === 1 && off.taken.length === 0, 'c2: wings reach 2.3 m to the side, not 2.5 m behind');
  ok(near(a.taken[0].amount, 260, 1) && near(wingT.taken[0].amount, 325, 1), 'c2: 260%, x1.25 vs defence down');
  ok(a.status.has('burn'), 'c2: burn'); }
// C3 황정지맥: pulse first, once per enemy, then damage reduction while inside
{ const W = world(), a = W.mon(0, 3), b = W.mon(1.5, 3.5);
  W.cast('hb_c3', 1, { aim: { x: 0, y: 0, z: 3 } }); W.run(0.2); ok(a.taken.length === 0, 'c3: the golden pulse travels first');
  W.run(0.5); ok(a.taken.length === 1 && b.taken.length === 1 && near(a.taken[0].amount, 220, 1), 'c3: 220% once each');
  W.pc.pos = { x: 0, y: 0, z: 3 }; W.run(0.3); ok(W.pc.status.get('dmgreduce') && W.pc.status.get('dmgreduce').value === 0.25, 'c3: 25% damage reduction inside'); }
// C4 백호유침: 4 needles per target = 2.4 total, centre gets defence down at the 3rd, dead target -> needles go on
{ const W = world(), a = W.mon(0, 4), b = W.mon(1.0, 4.5);
  W.cast('hb_c4'); W.run(1.0);
  ok(a.taken.length === 4 && b.taken.length === 4 && near(ownAmount(a), 240, 2), 'c4: 4 needles each, total 240% (same as old 4 x 60%)');
  ok(a.status.has('defdown') && !b.status.has('defdown'), 'c4: centre target defence down');
  const W2 = world(), x = W2.mon(0, 4, { hp: 50 }), y = W2.mon(0.8, 4.2); W2.cast('hb_c4'); W2.run(1.0);
  ok(x.dead && x.taken.length === 1 && y.taken.length === 7, 'c4: needles of a dead target go to the other target');
  const W3 = world(); W3.cast('hb_c4'); W3.run(0.5); ok(W3.fxLog.includes('needles.miss'), 'c4: no target -> needles fly out, no damage'); }
// C5 현무약해: knockback normal only, slow, herb field extension once per cast + per-field cap
{ const W = world(), a = W.mon(0, 3), boss = W.mon(0.6, 5, { isBoss: true });
  W.cast('hb_a4', 1, { aim: { x: 0, y: 0, z: 4 } }); W.run(0.6); const f = W.kit.fields[0], life0 = f.life;
  W.cast('hb_c5'); W.run(1.0);
  ok(a.taken.length === 1 && a.taken[0].knockback > 0 && boss.taken.length === 1 && boss.taken[0].knockback === 0, 'c5: knockback, bosses immune');
  ok(a.status.has('slow'), 'c5: slow');
  ok(near(f.life, life0 - 1.0 + 2, 0.05) && f.ext === 2, 'c5: field +2 s once per cast');
  W.cast('hb_c5'); W.run(1.0); W.cast('hb_c5'); W.run(1.0); ok(f.ext === 4, 'c5: per-field cap +4 s');
  ok(near(a.taken[0].amount, 180, 1), 'c5: 180%'); }

// cleanup: target death, zone change / death (clearTemp), owner far away (boss arena)
{ const W = world(), m = W.mon(0, 2, { hp: 70 }), m2 = W.mon(2, 2.5);
  W.cast('hb_b3'); W.run(3); const g = W.eng.summons[0]; ok(m.dead && m2.taken.length > 0, 'summon switches to the next valid target');
  W.pc.pos = { x: 40, y: 0, z: 0 }; W.run(0.1); ok(Math.hypot(g.pos.x - 40, g.pos.z) < 3 && g.log.regrow === 1, 'summon regrows next to the owner when far (boss arena)');
  W.cast('hb_a4', 1, { aim: { x: 40, y: 0, z: 0 } }); W.cast('hb_c2', 1, { aim: { x: 40, y: 0, z: 9 } });
  W.eng.clearTemp(); ok(g.dead && !W.actors.includes(g) && W.kit.fields.length === 0 && W.kit.things.length === 0 && W.kit.timers.length === 0 && W.eng.summons.length === 0, 'clearTemp removes summons, fields, projectiles, timers');
  const W2 = world(); W2.cast('hb_b4'); W2.run(0.1); W2.pc.dead = true; W2.run(0.05); ok(W2.eng.summons.every(s => s.dead) || W2.actors.every(a => !a.isSummon), 'owner death -> summons vanish'); }
// no global hit-stop / random shake anywhere above (the harness throws if they are used)
ok(true, 'no G.hitStop / addShake used');
console.log('herbal tests passed:', pass);
