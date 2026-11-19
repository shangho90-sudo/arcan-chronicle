// 대장장이 1차 규칙(js/smith.js + js/skillrt.js)을 WebGL 없이 확인: 가열 더하기·갱신·만료·급랭, 모루 하나·충격파 간격/횟수,
// 집게(일반 = 끌어옴, 보스 = 끌지 않고 접근), 철벽(정면만·다시 누르기·시간 만료), 튕김망치(직접 투척·모루 반사·튈 적 없음·충격파 다 쓴 모루·휴대폰 조준),
// 충격 재활용(상한·직접 타격 때 한 번만 방출), 급랭(물이 닿는 순간·가열 0/1/2/3), 낙인(직접 타격 3번 '팅·팅·쨍', 파생 피해 제외, 백련타 셋째 타에 깨짐), 장인의 박자(1회·안 쌓임), 정리(사망·맵 이동), 스킬 id·배우는 레벨·데이터 수치.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { HitShape, CombatMath, StatusSet, clamp, clamp01, GameData, CharacterSheet, newProfile, migrate } from '../js/core.js';
import { skillSound } from '../js/sfx.js';
import { SmithKit, clearLine, stackHeat, guardHit, throwPlan, SMITH } from '../js/smith.js';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const S2 = JSON.parse(read('../assets/data/skills2.json')), skills = S2.skills, SK = Object.fromEntries(skills.map(s => [s.id, s]));
const STATUS = Object.fromEntries(S2.statuses.map(s => [s.id, s]));
const actions = Object.fromEntries(JSON.parse(read('../assets/models/actions.json')).map(a => [a.name, a]));
const sandbox = { HitShape, CombatMath, clamp, clamp01, skillSound, SmithKit, clearLine, console };
vm.createContext(sandbox);
vm.runInContext(read('../js/skillrt.js').replace(/^import .*;\n/gm, '').replace(/\bexport /g, '') + '\nthis.api={SkillEngine,bindSkillRt,FX,CUSTOM};', sandbox);
const { SkillEngine, bindSkillRt, FX, CUSTOM } = sandbox.api;
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; };

// ------------------------------------------------------------------ data: ids, unlock levels, line titles, icons, sounds
const before = { a1: 10, a2: 12, a3: 15, a4: 18, a5: 20, b1: 10, b2: 12, b3: 15, b4: 18, b5: 20, c1: 10, c2: 12, c3: 15, c4: 18, c5: 20 };   // 개편 전 배우는 레벨(그대로)
const bs = skills.filter(s => s.job === 'blacksmith' && s.tier === 1);
ok(bs.length === 15, '15 blacksmith tier-1 skills');
for (const k of Object.keys(before)) { const d = SK['bs1_' + k]; ok(d, 'id kept bs1_' + k); ok(d.maxLv === 5 && d.unlock === before[k] && !d.prereq.length, 'Lv' + before[k] + ', five levels ' + k); }
ok(['단조와 제압', '열처리와 반격', '장인의 제작'].every((n, i) => bs.filter(s => s.cat === i).every(s => s.catName === n)), 'line titles A/B/C');
for (const s of bs) ok(readFileSync(new URL(`../assets/ui/skills/${s.id}.png`, import.meta.url)).length > 1000, 'icon ' + s.id);
for (const n of ['bs_swing', 'bs_hit', 'bs_hit_heavy', 'bs_anvil', 'bs_anvil_ring', 'bs_tongs', 'bs_quench', 'bs_steam', 'bs_steam2', 'bs_steam3', 'bs_wall', 'bs_block', 'bs_forge', 'bs_break', 'bs_throw', 'bs_clang', 'bs_drop', 'bs_crack', 'bs_stamp'])
  ok(readFileSync(new URL(`../assets/audio/sfx_${n}.mp3`, import.meta.url)).length > 2000, 'sound ' + n);
ok(STATUS.heat && STATUS.brand, 'heat / brand statuses');
ok(actions.bs_flurry.hitTimes.join() === '0.16,0.3,0.44,0.78', 'flurry contact frames');
{ // 백련타 timing in data == contact frames: taps at hitT + k * gap, finisher at hitT + at
  const d = SK.bs1_a4, [tap, fin] = d.ops, ht = actions.bs_flurry.hitFrame / actions.bs_flurry.fps;
  for (let k = 0; k < 3; k++) ok(Math.abs(ht + k * tap.gap - actions.bs_flurry.hitTimes[k]) < 0.011, 'tap ' + k + ' on contact');
  ok(Math.abs(ht + fin.at - actions.bs_flurry.hitTimes[3]) < 0.011, 'finisher on contact'); ok(fin.heat === 1 && tap.heat == null, 'finisher alone heats 1');
}
ok(SK.bs1_b3.ops[0].heat === 2, '용광로 개방 heats 2');
{ // 튕김망치 data (replaces 즉석 리벳, same id): attack, mp 12, cd 9, range 6, bounce 3.5, one throw op; motions exist
  const d = SK.bs1_b4, op = d.ops[0];
  ok(d.name === '튕김망치' && d.type === 'attack' && d.mp === 12 && d.cd === 9 && d.range === 6 && op.fn === 'smith_throw' && op.bounce === 3.5, '튕김망치 data: ' + [d.type, d.mp, d.cd, d.range, op.bounce].join());
  ok(!skills.some(s => s.ops && s.ops.some(o => o.fn === 'smith_rivets')) && !/리벳/.test(SK.bs1_b5.desc) && /튕김망치/.test(SK.bs1_b5.desc), 'no rivet skill left, 충격 재활용 text names 튕김망치');
  ok(actions.bs_toss && Math.abs(actions.bs_toss.hitFrame / actions.bs_toss.fps - 0.24) < 0.005 && actions.bs_douse && Math.abs(actions.bs_douse.hitFrame / actions.bs_douse.fps - 0.28) < 0.005, 'bs_toss releases at 0.24 s, bs_douse pours at 0.28 s');
  ok(SK.bs1_b1.anim === 'bs_douse' && SK.bs1_b4.anim === 'bs_toss', 'skills use the new motions');
}

// ------------------------------------------------------------------ pure helpers
{ const st = new StatusSet();
  ok(stackHeat(st, STATUS.heat, 2) === 2, 'heat 2'); st.get('heat').remaining = 1;
  ok(stackHeat(st, STATUS.heat, 1) === 3 && st.get('heat').remaining === SMITH.heat.dur, 'add -> 3, timer refreshed to 5 s');
  ok(stackHeat(st, STATUS.heat, 2) === 3, 'cap 3');
  st.tick(5.01, () => {}, () => {}); ok(!st.has('heat'), 'heat expires after 5 s');
  const w = guardHit({ wall: { val: 0.45 }, front: true }, 100), back = guardHit({ wall: { val: 0.45 }, front: false }, 100);
  ok(w.reduced === 45 && back.reduced === 0, 'wall: front only');
  ok(!clearLine({ blocked: (x) => x > 1 && x < 1.5 }, { x: 0, z: 0 }, { x: 3, z: 0 }) && clearLine({ blocked: () => false }, { x: 0, z: 0 }, { x: 3, z: 0 }), 'clearLine sees walls');
  // throw aim (pure): first thing on the line on PC; phone prefers the anvil only when it sits on the aim line with the enemy
  const o = { x: 0, z: 0 }, f = { x: 0, z: 1 }, e = (x, z) => ({ pos: { x, z }, radius: 0.5 });
  ok(throwPlan(o, f, 6, null, [e(0, 4)], false).kind === 'enemy', 'plan: enemy on the line');
  ok(throwPlan(o, f, 6, { x: 0, z: 2.5 }, [e(0, 4)], false).kind === 'anvil', 'plan: anvil in front of the enemy -> anvil');
  ok(throwPlan(o, f, 6, { x: 0, z: 5 }, [e(0, 3)], false).kind === 'enemy', 'PC: enemy in front of the anvil -> enemy first');
  ok(throwPlan(o, f, 6, { x: 0, z: 5 }, [e(0, 4)], true).kind === 'anvil', 'phone: anvil overlapping the aimed enemy (just behind) -> anvil');
  ok(throwPlan(o, f, 6, { x: 1.9, z: 3 }, [e(0, 4)], true).kind === 'enemy', 'phone: anvil beside the aim line -> straight to the enemy');
  ok(throwPlan(o, f, 6, { x: 1.2, z: 3 }, [e(0, 4)], false).kind === 'enemy' && throwPlan(o, f, 6, { x: 1.2, z: 3 }, [e(0, 4)], true).kind === 'anvil', 'within the phone margin only: anvil on phone, enemy on PC');
  ok(throwPlan(o, f, 6, null, [e(0, 7)], false).kind === 'none' && throwPlan(o, f, 6, null, [e(2, 3)], false).kind === 'none', 'plan: out of range / off the line -> nothing');
}

// ------------------------------------------------------------------ engine harness
function world(o = {}) {
  const sounds = [], kicks = [], fxLog = [];
  for (const k of Object.keys(FX).filter(k => k !== 'on')) FX[k] = () => ({ set() {}, dispose() {}, end() {}, pulse() {} });
  const handle = (kind) => new Proxy({ kind }, { get: (t, m) => m in t ? t[m] : (...a) => { fxLog.push(kind + '.' + String(m)); return m === 'kick' ? handle('plate') : null; } });
  FX.smith = (kind) => { fxLog.push(kind); return handle(kind); };
  const learned = Object.assign({}, o.learned || {});
  const book = o.book || { sk: { slots: bs.filter(x => x.type !== 'passive' && x.type !== 'craft').map(x => x.id) }, level: id => learned[id] || 0, usable: () => true, passive: key => { let v = 0; for (const [id, lv] of Object.entries(learned)) { const f = SK[id] && SK[id].type === 'passive' && SK[id].flags && SK[id].flags[key]; if (f) v += f[0] + (f[1] || 0) * (lv - 1); } return v; } };
  const blocked = o.blocked || (() => false);
  const geo = { ground: (x, z) => ({ x, y: 0, z }), blocked, move: (p, dx, dz, r) => blocked(p.x + dx, p.z + dz, r) ? { ...p } : { x: p.x + dx, y: 0, z: p.z + dz } };
  const actors = [];
  const pc = { pos: { x: 0, y: 0, z: 0 }, facing: { x: 0, z: 1 }, faction: 'player', skills: { lock: 0, busy: false }, body: { sh: { actions }, play() {} }, hp: 500, maxHp: 500, sp: 100, maxSp: 100,
    sheet: { p: { sk: {}, job: 'blacksmith', weapon: 'w_hammer_1' }, book, job: { id: 'blacksmith' } }, status: new StatusSet(), stat: k => k === 'atk' ? 100 : k === 'crit' ? 0 : k === 'critDmg' ? 1.5 : 0,
    setFacing(x, z) { const m = Math.hypot(x, z) || 1; this.facing = { x: x / m, z: z / m }; }, zone: { actors, geo, def: { portals: [] }, nearestEnemy: () => actors.find(a => !a.dead) }, dist(t) { return Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z); },
    lunges: [], startLunge(f, d, T) { this.lunges.push(d); this.pos = { x: this.pos.x + f.x * d, y: 0, z: this.pos.z + f.z * d }; }, shield: 0, addShield(v) { this.shield = Math.max(this.shield, v); } };
  const eng = new SkillEngine(pc); pc.skills2 = eng;
  const shouts = [];
  bindSkillRt({ input: { mobile: !!o.mobile }, audio: { sfx: n => sounds.push(n) }, render: { kick: (...a) => kicks.push(a), addShake() { throw new Error('no random shake'); } }, ui: { floatText() {}, toast() {}, impactText: (p, w) => shouts.push(w) }, data: { status: id => STATUS[id], skill2: id => SK[id], config: {}, item: () => ({ job: 'blacksmith' }), job: () => ({ id: 'blacksmith', tier: 1 }) } });
  const mon = (x, z, extra = {}) => { const m = { pos: { x, y: 0, z }, radius: 0.5, hp: 1e6, maxHp: 1e6, dead: false, zone: pc.zone, faction: 'monster', status: new StatusSet(), stat: () => 0, taken: [],
      takeDamage(hd) { if (this.missNext > 0 && !hd.noMiss) { this.missNext--; hd.missed = true; this.taken.push({ ...hd, amount: 0 }); return; } hd.t = eng.clock; hd.defdown = this.status.has('defdown'); this.taken.push(hd); this.hp -= hd.amount; }, ...extra }; actors.push(m); return m; };
  const ctx = (id, L = 1, more = {}) => ({ d: SK[id], id, L, grade: 1, mult: 1, origin: { ...pc.pos }, facing: { ...pc.facing }, aim: { x: 0, y: 0, z: 3 }, hitOnce: new Set(), ...more });
  const run = (sec) => { for (let i = 0; i < Math.round(sec / 0.01); i++) eng.tick(0.01); };
  return { pc, eng, kit: eng.smith, mon, ctx, run, sounds, kicks, fxLog, learned, shouts };
}

// heat from the real ops (용광로 개방 = 2, 백련타 finisher = 1), refresh, quench consumes + bonus, splash never consumes neighbours
{ const W = world(), m = W.mon(0, 2), n = W.mon(0.9, 2.2);
  W.eng.release(W.ctx('bs1_b3')); W.run(0.8);
  ok(W.kit.heatOf(m) === 2 && W.kit.heatOf(n) === 2, 'forge: 2 heat each');
  ok(W.sounds.includes('bs_forge'), 'forge sound on hit');
  const t0 = m.taken.length; W.eng.release(W.ctx('bs1_a4')); W.run(1.4);
  ok(m.taken.length - t0 === 4, 'flurry: 3 taps + finisher hit'); ok(W.kit.heatOf(m) === 3, 'flurry finisher +1 heat -> 3');
  ok(W.fxLog.includes('hit') && W.kicks.length > 0, 'contact fx + one camera kick'); ok(W.pc.freezeT > 0 && W.pc.freezeT <= SMITH.stopHeavy && m.freezeT > 0, 'local hit-stop on caster + target only (no global)');
  // quench: m (3) and n (3 too) — each consumes its own heat; splash damage is derived and never touches heat
  const k = W.kit; n.status.get('heat').value = 1;
  const before = m.taken.length; CUSTOM.smith_quench(W.eng, SK.bs1_b1.ops[0], W.ctx('bs1_b1')); W.run(0.8);
  ok(k.heatOf(m) === 0 && k.heatOf(n) === 0, 'quench consumed heat on both');
  const direct = m.taken.slice(before).filter(h => !h.derived), derived = m.taken.slice(before).filter(h => h.derived);
  ok(direct.length === 1 && derived.length === 1, 'm: one quench hit + one splash from n (derived)');
  ok(W.sounds.includes('bs_steam3'), '3-stack quench: strong steam sound');
  // no chain: quench again on cold targets -> no splash, no steam
  const b2 = m.taken.length, s2 = W.sounds.length; CUSTOM.smith_quench(W.eng, SK.bs1_b1.ops[0], W.ctx('bs1_b1')); W.run(0.8);
  ok(m.taken.slice(b2).every(h => !h.derived) && !W.sounds.slice(s2).some(s => s.startsWith('bs_steam')), 'cold quench: no splash, no steam');
  ok(m.status.has('slow'), 'quench slows');
  // derived damage never adds heat
  ok(k.heatOf(m) === 0, 'splash did not re-heat');
}
// quench damage scales with stacks
// quench (2026-11-19): damage + slow land when the water ARRIVES (pour at bs_douse 0.28 s, then distance / speed), heat 0 / 1 / 2 / 3
{ const one = (n, z = 2) => { const W = world(), m = W.mon(0, z); if (n) W.kit.addHeat(m, n);
    W.eng.release(W.ctx('bs1_b1')); const ht = 0.28, travel = Math.max(0, z - 0.5 - SK.bs1_b1.ops[0].mouth) / SK.bs1_b1.ops[0].speed;
    W.run(ht + travel - 0.03); const early = m.taken.length; W.run(0.1);
    return { W, m, early, d: m.taken.filter(h => !h.derived)[0], heat: W.kit.heatOf(m), travel }; };
  const R0 = Math.random; Math.random = () => 0.5;   // same damage roll for every stack count
  const r0 = one(0), r1 = one(1), r2 = one(2), r3 = one(3), far = one(0, 3.4); Math.random = R0;
  ok(r0.early === 0 && r0.d && far.early === 0 && far.d, `no damage before the water arrives (travel ${r0.travel.toFixed(3)} s / far ${far.travel.toFixed(3)} s)`);
  ok(far.d.t - r0.d.t > 0.12, 'the farther enemy is hit later: ' + (far.d.t - r0.d.t).toFixed(3));
  ok(r0.m.status.has('slow') && r1.m.status.has('slow') && r2.m.status.has('slow'), 'slow on arrival (0/1/2 stacks)');
  ok(Math.abs(r1.d.amount / r0.d.amount - 1.5) < 0.03 && Math.abs(r2.d.amount / r0.d.amount - 2.0) < 0.03, `+50% per stack: ${r0.d.amount} / ${r1.d.amount} / ${r2.d.amount}`);
  ok(r3.d.amount > r0.d.amount * 2.2 && r3.d.amount < r0.d.amount * 2.8, `3 stacks ~ x2.5 (${r0.d.amount} -> ${r3.d.amount})`);
  ok([r0, r1, r2, r3].every(r => r.heat === 0), 'heat consumed');
  ok(!r0.W.sounds.some(x => x.startsWith('bs_steam')) && r1.W.sounds.includes('bs_steam') && r2.W.sounds.includes('bs_steam2') && r3.W.sounds.includes('bs_steam3'), 'sizzle grows with stacks: none / steam / steam2 / steam3');
  ok(!r0.W.shouts.includes('치이익!') && r2.W.shouts.includes('치이익!'), "'치이익!' only on a heated enemy");
  ok(r0.W.kicks.length === 0 && r1.W.kicks.length === 1, 'cold quench: no camera kick (sway is visual only); heated: one kick');
  ok(r0.W.fxLog.includes('douse') && r0.W.fxLog.includes('douse.pour') && r0.W.fxLog.includes('douse.arrive'), 'douse fx: bucket -> pour -> arrive');
}


// anvil: one per player, landing damage + stagger, shockwave interval + max count, shockwave never rings the anvil again / never counts for the brand
{ const W = world(), m = W.mon(0, 3);
  W.eng.release(W.ctx('bs1_a1')); W.run(0.2); ok(W.kit.anvil && !W.kit.anvil.landed, 'anvil falling');
  W.run(0.4); ok(W.kit.anvil.landed && m.taken.length === 1 && m.status.has('stagger'), 'anvil landed: damage + stagger');
  ok(W.sounds.includes('bs_anvil'), 'anvil landing sound');
  const first = W.kit.anvil; W.eng.release(W.ctx('bs1_a1', 1, { aim: { x: 2, y: 0, z: 2 } })); W.run(0.6);
  ok(W.kit.anvil !== first && W.fxLog.includes('anvil.dispose'), 'second anvil replaces the first');
  const sh = HitShape.circle(2, 2, 1);
  const a = W.kit.anvil, n0 = m.taken.length;
  let fired = 0; for (let i = 0; i < 20; i++) { if (W.kit.strikeAnvil(sh)) fired++; W.run(0.05); }
  ok(fired === 3 || fired === 4, 'pulses limited by 0.4 s gap within 1 s: ' + fired);
  for (let i = 0; i < 30; i++) { W.kit.strikeAnvil(sh); W.run(0.1); }
  ok(a.pulses === SK.bs1_a1.ops[0].pulse.max, 'max ' + a.pulses + ' pulses');
  ok(m.taken.slice(n0).every(h => h.derived), 'pulse damage is derived');
  W.run(6); ok(!W.kit.anvil, 'anvil expires');
  ok(!SK.bs1_a1.ops.some(o => o.block || o.wall), 'anvil does not block movement (no collider)');
}
// tongs: normal enemy pulled in front (and anvil-bump bonus), boss not pulled -> approach + smash; walls stop it
{ const W = world(), m = W.mon(0, 6);
  W.eng.smith.smith_anvil(SK.bs1_a1.ops[0], W.ctx('bs1_a1', 1, { aim: { x: 0, y: 0, z: 1.7 } })); W.run(0.5);
  const n0 = m.taken.length; W.kit.smith_tongs(SK.bs1_a2.ops[0], W.ctx('bs1_a2', 1, { tgt: m })); W.run(0.8);
  ok(Math.hypot(m.pos.x, m.pos.z - 1.75) < 0.4, 'normal enemy pulled in front: z=' + m.pos.z.toFixed(2));
  ok(W.sounds.includes('bs_tongs'), 'tongs clamp sound');
  ok(m.taken.slice(n0).filter(h => h.derived).length === 1, 'anvil collision bonus (derived) once');
  const B = world(), boss = B.mon(0, 6, { isBoss: true }); const z0 = boss.pos.z;
  B.kit.smith_tongs(SK.bs1_a2.ops[0], B.ctx('bs1_a2', 1, { tgt: boss })); B.run(0.8);
  ok(boss.pos.z === z0 && B.pc.lunges.length === 1 && boss.taken.length === 1, 'boss: not pulled, player approaches and smashes');
  const H = world(), heavy = H.mon(0, 5, { def: { ai: 'heavy' } }); H.kit.smith_tongs(SK.bs1_a2.ops[0], H.ctx('bs1_a2', 1, { tgt: heavy })); H.run(0.8);
  ok(heavy.pos.z === 5, 'heavy enemy not pulled');
  const Wl = world({ blocked: (x, z) => z > 2.9 && z < 3.3 }), w = Wl.mon(0, 6);
  Wl.pc.lockOn = null; Wl.pc.target = w;
  ok(Wl.eng.validate(SK.bs1_a2, null) === '장애물에 막혀 있습니다', 'cannot grab through a wall');
}
// wall: frontal reduction, re-press kicks (free, no extra cooldown), boss not pushed, timeout folds
{ const W = world({ learned: { bs1_b5: 1 } }), m = W.mon(0, 2), boss = W.mon(0.5, 3, { isBoss: true });
  W.pc.sp = 100; W.eng.cast('bs1_b2', { x: 0, z: 3 }); W.run(0.4);
  ok(W.kit.wall && W.kit.recastLeft('bs1_b2') > 4, 'wall up: slot shows remaining time');
  const spAfter = W.pc.sp, cd = W.eng.cdLeft('bs1_b2'); ok(cd > 14, 'cooldown counts from first use: ' + cd.toFixed(1));
  const front = W.kit.guard({ source: m, amount: 100 }, 100), behind = W.kit.guard({ source: { pos: { x: 0, z: -3 } }, amount: 100 }, 100);
  ok(Math.abs(front - 55) < 1e-6 && behind === 100, 'front -45%, behind none');
  ok(W.kit.stored > 0, 'impact recycled from real mitigation: ' + W.kit.stored.toFixed(1));
  ok(W.kit.guard({ source: m, amount: 50, dot: true }, 50) === 50, 'DoT not reduced / not charged');
  const e = W.eng.cast('bs1_b2', { x: 0, z: 3 }); ok(e === null && !W.kit.wall && W.pc.sp === spAfter, 'second press kicks the wall for free');
  W.run(0.8); ok(m.taken.length === 1 && m.knock && Math.hypot(m.knock.x, m.knock.z) > 0, 'kick: damage + knockback on normal enemy');
  ok(boss.taken.length === 1 && !boss.knock, 'kick: boss damage only');
  ok(W.eng.cast('bs1_b2', { x: 0, z: 3 }) === '재사용 대기 중', 'third press: on cooldown');
  const T = world(); T.eng.cast('bs1_b2', { x: 0, z: 3 }); T.run(5.3); ok(!T.kit.wall && T.fxLog.includes('wall.fold'), 'wall folds after 5 s');
}
// 튕김망치: direct throw without an anvil — one heavy direct hit (counts as a direct attack), released at bs_toss 0.24 s from the hand
{ const W = world(), m = W.mon(0, 4), side = W.mon(0.3, 5.2);
  W.eng.release(W.ctx('bs1_b4')); W.run(0.2); ok(m.taken.length === 0 && W.fxLog.includes('toss'), 'hammer still in the hand before 0.24 s');
  W.run(1.0);
  const dm = m.taken.filter(h => !h.derived);
  ok(dm.length === 1 && side.taken.length === 0, 'direct: exactly one hit on the first enemy on the line, none on the one behind');
  ok(dm[0].t > 0.24 + 2.5 / 15 && dm[0].t < 0.24 + 4.0 / 15 + 0.05, 'hit lands after the flight: ' + dm[0].t.toFixed(3));
  ok(W.sounds.includes('bs_throw') && W.sounds.includes('bs_hit_heavy') && W.shouts.includes('쾅!') && m.status.has('stagger'), 'throw / bonk sounds, 쾅!, stagger');
  ok(W.kicks.length === 1 && W.pc.freezeT >= 0, 'one camera kick on the direct hit');
  W.run(1); ok(!W.kit.hammers.length && !W.eng.things.length, 'hammer gone after the hit');
  // nothing on the line: flies to range and drops
  const N = world(), off = N.mon(3, 3); N.eng.release(N.ctx('bs1_b4')); N.run(1.6);
  ok(off.taken.length === 0 && N.sounds.includes('bs_drop') && !N.kit.hammers.length, 'miss: flies past, drops and vanishes');
  // a wall in the way stops it
  const B = world({ blocked: (x, z) => z > 1.8 && z < 2.2 }), bm = B.mon(0, 4); B.eng.release(B.ctx('bs1_b4')); B.run(1.2);
  ok(bm.taken.length === 0, 'wall stops the hammer');
}
// anvil bounce: '깡!' + one shockwave try (shared 0.4 s / max 4), then a lob onto the nearest enemy within 3.5 m — damage when it lands (direct)
{ const W = world(), m = W.mon(2.2, 3.4);   // off the throw line (x = 0), 2.4 m from the anvil
  W.kit.smith_anvil(SK.bs1_a1.ops[0], W.ctx('bs1_a1', 1, { aim: { x: 0, y: 0, z: 2.6 } })); W.run(0.5);
  const a = W.kit.anvil; ok(a.landed, 'anvil down'); const n0 = m.taken.length, p0 = a.pulses;
  W.eng.release(W.ctx('bs1_b4')); W.run(0.24 + 2.0 / 15 + 0.05);
  ok(W.sounds.includes('bs_clang') && W.shouts.includes('깡!') && a.pulses === p0 + 1, "anvil: '깡!' + one shockwave");
  const after = m.taken.slice(n0); ok(after.length === 1 && after[0].derived, 'shockwave = derived area damage (no direct hit yet)');
  W.run(0.3); ok(m.taken.slice(n0).filter(h => !h.derived).length === 0, 'still in the air (lob)');
  W.run(0.6); const dh = m.taken.slice(n0).filter(h => !h.derived);
  ok(dh.length === 1 && W.eng.smith.hammers.length === 0, 'lob lands on the enemy: one direct hit, then the hammer is gone');
  ok(dh[0].t - after[0].t >= SK.bs1_b4.ops[0].lob - 0.02, 'damage at landing, not at the bounce: ' + (dh[0].t - after[0].t).toFixed(3));
  // second throw right away: the 0.4 s gap is shared with the hammer attacks
  W.kit.strikeAnvil(HitShape.circle(a.pos.x, a.pos.z, 1)); const pAfter = a.pulses; ok(pAfter === p0 + 1 || pAfter === p0 + 2, 'basic hammer on the anvil uses the same counter');
}
// exhausted anvil: the hammer still bounces (no shockwave); no enemy near: it drops by the anvil and vanishes
{ const W = world(), m = W.mon(-2, 3);
  W.kit.smith_anvil(SK.bs1_a1.ops[0], W.ctx('bs1_a1', 1, { aim: { x: 0, y: 0, z: 2.6 } })); W.run(0.5);
  const a = W.kit.anvil; a.pulses = a.op.pulse.max; const n0 = m.taken.length;
  const c = W.ctx('bs1_b4'); W.eng.release(c); W.run(1.4);
  ok(a.pulses === a.op.pulse.max && m.taken.slice(n0).filter(h => h.derived).length === 0, 'used-up anvil: no shockwave');
  ok(c.throwBounce && !c.throwBounce.pulsed && c.throwBounce.target && m.taken.slice(n0).filter(h => !h.derived).length === 1, 'used-up anvil: the hammer still bounces onto the enemy');
  const E = world(), far = E.mon(5, 0.5);
  E.kit.smith_anvil(SK.bs1_a1.ops[0], E.ctx('bs1_a1', 1, { aim: { x: 0, y: 0, z: 2.6 } })); E.run(0.5);
  const c2 = E.ctx('bs1_b4'); E.eng.release(c2); E.run(1.6);
  ok(c2.throwBounce && !c2.throwBounce.target && far.taken.filter(h => !h.derived).length === 0 && E.sounds.includes('bs_drop') && !E.kit.hammers.length && !E.eng.things.length, 'no enemy within 3.5 m: drops and vanishes');
}
// phone: the anvil beside the aim line is ignored (straight to the selected enemy); on the line with the enemy it is preferred
{ const P = world({ mobile: true }), m = P.mon(0, 4);
  P.kit.smith_anvil(SK.bs1_a1.ops[0], P.ctx('bs1_a1', 1, { aim: { x: 1.9, y: 0, z: 3 } })); P.run(0.5);
  const m0 = m.taken.length, c = P.ctx('bs1_b4'); P.eng.release(c); P.run(1.2);
  ok(c.throwPlan === 'enemy' && !P.sounds.includes('bs_clang') && m.taken.slice(m0).filter(h => !h.derived).length === 1, 'phone: anvil beside the line -> straight to the enemy');
  const Q = world({ mobile: true }), q = Q.mon(0, 3.6);
  Q.kit.smith_anvil(SK.bs1_a1.ops[0], Q.ctx('bs1_a1', 1, { aim: { x: 0.9, y: 0, z: 4.4 } })); Q.run(0.5);
  const q0 = q.taken.length, c2 = Q.ctx('bs1_b4'); Q.eng.release(c2); Q.run(1.6);
  ok(c2.throwPlan === 'anvil' && Q.sounds.includes('bs_clang') && q.taken.slice(q0).filter(h => !h.derived).length === 1, 'phone: anvil overlapping the aimed enemy -> anvil first, then onto that enemy');
}
// 충격 재활용: stored from the wall's real mitigation (cap), released ONCE on the first landed direct hit (empowered basic or hammer);
// a miss / anvil-only / shockwave keeps it
{ const W = world({ learned: { bs1_a5: 1, bs1_b5: 5 } }), m = W.mon(0, 4);
  W.eng.cast('bs1_b2', { x: 0, z: 3 }); W.run(0.4);
  for (let i = 0; i < 3; i++) W.kit.guard({ source: m, amount: 1e5 }, 1e5);
  const cap = 100 * (SK.bs1_b5.flags.recycleCap[0] + SK.bs1_b5.flags.recycleCap[1] * 4); ok(Math.abs(W.kit.stored - cap) < 1e-6, 'stored capped at ' + cap);
  const stored = W.kit.stored; W.kit.wall = null;
  m.missNext = 1; W.eng.cd = {}; W.eng.release(W.ctx('bs1_b4')); W.run(1.2);
  ok(W.kit.stored === stored && !m.taken.some(h => h.derived && h.noMiss), 'hammer MISS: storage kept');
  W.kit.basicLanded([], HitShape.cone(0, 0, 0, 1, 2, 120), { x: 0, z: 1 }, { mul: 1.6 }); ok(W.kit.stored === stored, 'empowered basic that hit nothing: kept');
  // anvil-only throw (no enemy near the anvil) + its shockwave on an enemy: kept
  const far = W.mon(5, -3); void far;
  W.kit.smith_anvil(SK.bs1_a1.ops[0], W.ctx('bs1_a1', 1, { aim: { x: -3, y: 0, z: 0 } })); W.run(0.5);
  const c = W.ctx('bs1_b4', 1, { facing: { x: -1, z: 0 } }); W.pc.facing = { x: -1, z: 0 }; W.eng.release(c); W.run(1.6); W.pc.facing = { x: 0, z: 1 };
  ok(c.throwPlan === 'anvil' && W.kit.stored === stored, 'anvil-only throw: kept');
  const pm = W.mon(-3, 1.5), np = pm.taken.length; W.kit.anvil.last = -9; W.kit.pulseAnvil(); ok(pm.taken.length > np && W.kit.stored === stored, 'shockwave never releases it');
  // hammer hits: released exactly once, as its own derived hit right after the hammer's
  const n0 = m.taken.length; W.eng.release(W.ctx('bs1_b4')); W.run(1.2);
  const got = m.taken.slice(n0); ok(got.length === 2 && !got[0].derived && got[1].derived && got[1].amount === Math.round(stored) && W.kit.stored === 0, 'hammer hit: one direct + one release of ' + Math.round(stored));
  W.eng.release(W.ctx('bs1_b4')); W.run(1.2); ok(m.taken.slice(n0 + 2).filter(h => h.derived).length === 0, 'nothing left to release on the next hit');
  // bounced hammer counts as a direct hit too
  const B = world({ learned: { bs1_b5: 1 } }), bm = B.mon(2.2, 3.4); B.kit.stored = 40; B.kit.storedT = 8;
  B.kit.smith_anvil(SK.bs1_a1.ops[0], B.ctx('bs1_a1', 1, { aim: { x: 0, y: 0, z: 2.6 } })); B.run(0.5); const b0 = bm.taken.length;
  B.eng.release(B.ctx('bs1_b4')); B.run(1.4); const bg = bm.taken.slice(b0);
  ok(bg.filter(h => h.derived && h.amount === 40).length === 1 && bg.findIndex(h => h.derived && h.amount === 40) > bg.findIndex(h => !h.derived) && B.kit.stored === 0, 'bounced hammer releases the store once, after its own hit (not on the shockwave)');
  // empowered basic attack still releases
  const E = world({ learned: { bs1_a5: 1, bs1_b5: 1 } }), em = E.mon(0, 1.5); E.kit.stored = 30; E.kit.storedT = 8; E.kit.onCast(SK.bs1_b1);
  const emp = E.kit.basicSwing(); E.kit.basicLanded([em], HitShape.cone(0, 0, 0, 1, 2, 120), { x: 0, z: 1 }, emp);
  ok(em.taken.filter(h => h.derived).length === 1 && E.kit.stored === 0 && !E.kit.basicSwing(), 'empowered basic hit: released once, tempo not stacking');
  E.kit.onCast(SK.bs1_b1); E.run(SMITH.tempo.window + 0.1); ok(!E.kit.empowered, 'tempo times out');
  E.kit.stored = 5; E.kit.storedT = 1; E.run(1.1); ok(E.kit.stored === 0, 'storage expires');
}
// 불량품 판정 -> 백련타: the three fast taps go '팅, 팅, 쨍!' (the third breaks the brand: bonus + def down) BEFORE the heavy finisher,
// so the finisher lands on the def-reduced enemy
{ const W = world(), m = W.mon(0, 1.6);
  W.eng.release(W.ctx('bs1_a3', 1, { tgt: m })); W.run(0.6); ok(m.status.has('brand') && m._brand.n === 0, 'brand stamped');
  const n0 = m.taken.length, s0 = W.sounds.length; W.eng.release(W.ctx('bs1_a4')); W.run(1.3);
  const hs = m.taken.slice(n0), direct = hs.filter(h => !h.derived), brk = hs.find(h => h.derived);
  ok(direct.length === 4, 'flurry: 3 taps + finisher');
  ok(W.sounds.slice(s0).filter(x => x === 'bs_crack' || x === 'bs_break').join() === 'bs_crack,bs_crack,bs_break', "taps: '팅, 팅, 쨍'");
  ok(W.shouts.filter(x => x === '팅' || x === '쨍!').join() === '팅,팅,쨍!', 'shouts 팅 · 팅 · 쨍!');
  ok(brk && Math.abs(brk.t - direct[2].t) < 1e-6 && direct[3].t > brk.t, 'brand breaks on the 3rd tap, before the finisher');
  ok(!direct[2].defdown && direct[3].defdown, 'finisher lands on the def-reduced enemy (3rd tap did not)');
  // derived damage (shockwave / steam spread / burn) never counts
  const D = world(), d = D.mon(0, 1.6); D.eng.release(D.ctx('bs1_a3', 1, { tgt: d })); D.run(0.6);
  D.eng.dmg(d, 1, D.ctx('bs1_a3'), { derived: true }); D.run(0.2); D.eng.dmg(d, 1, D.ctx('bs1_a3'), { derived: true });
  ok(d._brand.n === 0, 'derived hits do not crack it');
  for (let i = 0; i < 105; i++) { d.status.tick(0.1, () => {}, () => {}); D.run(0.1); } ok(!d.status.has('brand') && D.fxLog.includes('brand.expire') && !D.sounds.includes('bs_break'), 'expiry: fades quietly (no shatter / sound)');
}
// brand: 3 valid direct hits break it (derived / same-instant hits don't count), def-down capped (boss too)
{ const W = world(), boss = W.mon(0, 1.5, { isBoss: true });
  W.eng.release(W.ctx('bs1_a3', 1, { tgt: boss })); W.run(0.6);
  ok(boss.status.has('brand') && boss._brand.n === 0, 'brand stamped (stamping hit does not count)');
  W.eng.dmg(boss, 1, W.ctx('bs1_a3'), { derived: true }); ok(boss._brand.n === 0, 'derived hit not counted');
  W.eng.dmg(boss, 1, W.ctx('bs1_a3')); W.eng.dmg(boss, 1, W.ctx('bs1_a3')); ok(boss._brand.n === 1, 'two hits in the same instant count once');
  W.run(0.2); W.eng.dmg(boss, 1, W.ctx('bs1_a3')); ok(boss._brand.n === 2 && W.fxLog.includes('brand.setCracks'), 'crack grows');
  W.run(0.2); const n0 = boss.taken.length; W.eng.dmg(boss, 1, W.ctx('bs1_a3'));
  ok(!boss.status.has('brand') && boss.status.has('defdown') && boss.taken.slice(n0).some(h => h.derived), 'brand breaks: bonus + def down');
  ok(W.sounds.includes('bs_break'), 'break sound');
  ok(W.sounds.filter(x => x === 'bs_crack' || x === 'bs_break').join() === 'bs_crack,bs_crack,bs_break' && W.sounds.includes('bs_stamp'), 'stamp, then 팅 · 팅 · 쨍');
  const v = boss.status.get('defdown').value; W.eng.release(W.ctx('bs1_a3', 5, { tgt: boss })); W.run(0.6);
  for (let i = 0; i < 3; i++) { W.run(0.2); W.eng.dmg(boss, 1, W.ctx('bs1_a3')); }
  ok(boss.status.get('defdown').value <= STATUS.defdown.cap && boss.status.list.filter(s => s.def.id === 'defdown').length === 1, 'def down never stacks (max rule, cap)');
  void v;
}
// cleanup: enemy death, zone change / player death (eng.clearTemp — 사망·맵 이동·전직 때 불림)
{ const W = world(), m = W.mon(0, 2), n = W.mon(0, 2.5);
  W.kit.addHeat(m, 2); W.eng.release(W.ctx('bs1_a3', 1, { tgt: n })); W.run(0.6);
  m.dead = true; W.run(0.05); ok(!W.kit.heated.has(m) && W.fxLog.includes('heat.dispose'), 'heat visuals gone on death');
  W.kit.smith_anvil(SK.bs1_a1.ops[0], W.ctx('bs1_a1')); W.eng.cast('bs1_b2', { x: 0, z: 3 }); W.eng.release(W.ctx('bs1_b4', 1, { facing: { x: 1, z: 0 } })); W.run(0.3);
  ok(W.kit.hammers.length === 1, 'a hammer in flight');
  const n2 = W.mon(1, 2); W.kit.addHeat(n2, 1);
  W.eng.clearTemp();
  ok(!W.kit.anvil && !W.kit.wall && !W.kit.hammers.length && !W.eng.things.length && !W.kit.heated.size && !W.kit.brands.size && W.kit.stored === 0 && !W.kit.empowered, 'clear() removes anvil / wall / thrown hammer / marks / storage');
  ok(!n2.status.has('heat') && !n.status.has('brand'), 'statuses removed from enemies');
}
// old save (before the rework): learned levels, equipped slots and points carry over unchanged; reset refunds every point once
{ const files = {}; for (const n of ['config', 'levels', 'jobs', 'skills', 'skills2', 'items', 'monsters', 'quests', 'npcs', 'zones']) files[n] = JSON.parse(read('../assets/data/' + n + '.json'));
  const data = new GameData(files);
  const p0 = newProfile(data, '옛대장장이', 'm'); const ch0 = new CharacterSheet(data, p0); ch0.p.level = 25; ch0.book.grantPoints(); ch0.recalc(); assert.equal(ch0.chooseJob('blacksmith'), null);
  ch0.book.grantPoints();
  for (const [id, n] of [['bs1_a1', 3], ['bs1_b1', 2], ['bs1_b2', 2], ['bs1_a3', 1], ['bs1_c1', 2], ['bs1_b5', 1]]) for (let i = 0; i < n; i++) assert.equal(ch0.book.learn(id), null, 'learn ' + id);
  ch0.book.sk.slots = ['bs1_a1', 'bs1_b2', 'bs1_b1', 'bs1_a3'];
  const total = ch0.book.sk.points + ch0.book.spent, learned = JSON.stringify(ch0.book.sk.learned), pts = ch0.book.sk.points;
  const saved = JSON.parse(JSON.stringify(ch0.p)); const p1 = migrate(saved); const ch1 = new CharacterSheet(data, p1);
  ok(JSON.stringify(ch1.book.sk.learned) === learned && ch1.book.sk.points === pts && ch1.book.sk.slots.join() === 'bs1_a1,bs1_b2,bs1_b1,bs1_a3', 'old save: learned levels / points / slots unchanged');
  ok(ch1.book.sk.points + ch1.book.spent === total, 'points neither lost nor duplicated');
  ok(ch1.book.reset(true, false) === null && ch1.book.sk.points === total && !Object.keys(ch1.book.sk.learned).some(id => id.startsWith('bs1_')), 'reset in town refunds all ' + total);
  ok(ch1.book.reset(false, false) === '마을에서만 초기화할 수 있습니다', 'reset only in town');
  const ch2 = new CharacterSheet(data, migrate(JSON.parse(JSON.stringify(ch1.p)))); ok(ch2.book.sk.points === total, 'reset survives save/load');
}
// old save with 즉석 리벳 learned and on a quick slot: the same slot now throws 튕김망치 (same id, level kept)
{ const files = {}; for (const n of ['config', 'levels', 'jobs', 'skills', 'skills2', 'items', 'monsters', 'quests', 'npcs', 'zones']) files[n] = JSON.parse(read('../assets/data/' + n + '.json'));
  const data = new GameData(files);
  const p0 = newProfile(data, '리벳대장', 'm'); const ch0 = new CharacterSheet(data, p0); ch0.p.level = 25; ch0.book.grantPoints(); ch0.recalc(); assert.equal(ch0.chooseJob('blacksmith'), null);
  ch0.book.grantPoints();
  for (const [id, n] of [['bs1_b1', 1], ['bs1_b4', 3]]) for (let i = 0; i < n; i++) { const e = ch0.book.learn(id); if (e) { ch0.book.sk.learned[id] = (ch0.book.sk.learned[id] || 0) + 1; ch0.book.sk.points--; } }
  ch0.book.sk.slots = ['bs1_b1', 'bs1_b4', '', ''];
  const saved = JSON.parse(JSON.stringify(ch0.p)); saved.sk = saved.sk || {};
  const ch1 = new CharacterSheet(data, migrate(saved));
  ok(ch1.book.level('bs1_b4') === 3 && ch1.book.sk.slots[1] === 'bs1_b4', 'old save: 즉석 리벳 Lv3 in slot 2 -> still bs1_b4 Lv3 in slot 2');
  const W = world({ book: ch1.book }), m = W.mon(0, 4); W.pc.sheet.book = ch1.book; W.pc.sheet.p = ch1.p; W.pc.sheet.p.weapon = 'w_hammer_1';
  const e = W.eng.cast(ch1.book.sk.slots[1], { x: 0, z: 4 }); W.run(1.2);
  ok(e === null && m.taken.filter(h => !h.derived).length === 1 && W.eng.cdLeft('bs1_b4') > 7, 'cast from that slot throws 튕김망치 (hit, cooldown 9 s): ' + e);
  ok(W.pc.sp === 100 - 12, 'costs 12 기력');
}

console.log(`smith: ${pass} passed`);
