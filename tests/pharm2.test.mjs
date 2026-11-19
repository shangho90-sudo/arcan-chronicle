// 약사 1차 5종 교체(2026-11-19, js/pharm1.js + js/skillrt.js)를 WebGL 없이 확인:
// 데이터(id·칸·배우는 레벨·최대 레벨·기력·재사용·종류), 예전 저장의 레벨·포인트·퀵슬롯 승계, 유봉 되던지기(구간마다 한 번·옆걸음으로 휘는 귀환·손의 유봉 숨김),
// 불꽃심지병(착탄 → 0.4초 점화 → 틱마다 실제 위치, 화상 없음, 소리 순서), 서리병 굴리기(얼음길 둔화 갱신·벽 앞 파열·벽 너머 파편 없음),
// 결정침 개화(3타 시각·움직이는 표적·표적 사망 시 흩어짐), 꿈꽃가루(수면·직접/지속/불꽃 피해에 깸·시간 만료·같은 시전 재수면 없음·보스 면역), 정확한 투척, 툴팁.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { HitShape, CombatMath, StatusSet, clamp, clamp01 } from '../js/core.js';
import { skillSound } from '../js/sfx.js';
import { SmithKit, clearLine } from '../js/smith.js';
import { PharmKit, wakeOnHit, ph1LevelText, coefAt, lastCoefAt, sleepAt, slowAt, frostPath, segDist } from '../js/pharm1.js';
import { ensureSk, isSlottable } from '../js/skillsys.js';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const S2 = JSON.parse(read('../assets/data/skills2.json')), skills = S2.skills, SK = Object.fromEntries(skills.map(s => [s.id, s]));
const STATUS = Object.fromEntries([...JSON.parse(read('../assets/data/skills.json')).statuses, ...S2.statuses].map(s => [s.id, s]));
const actions = Object.fromEntries(JSON.parse(read('../assets/models/actions.json')).map(a => [a.name, a]));
const sandbox = { HitShape, CombatMath, clamp, clamp01, skillSound, SmithKit, clearLine, PharmKit, T: p => p, console };
vm.createContext(sandbox);
vm.runInContext(read('../js/skillrt.js').replace(/^import .*;\n/gm, '').replace(/\bexport /g, '') + '\nthis.api={SkillEngine,bindSkillRt,FX,CUSTOM};', sandbox);
const { SkillEngine, bindSkillRt, FX } = sandbox.api;
Math.random = () => 0.5;
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// ------------------------------------------------------------------ data
const WANT = { ph1_a4: ['유봉 되던지기', 'attack', 13, 10, 7, 'ph_rang', 'ph_rang'], ph1_b1: ['불꽃심지병', 'attack', 10, 12, 5, 'ph_pitch', 'ph_wick'], ph1_b2: ['서리병 굴리기', 'attack', 12, 12, 6, 'ph_bowl', 'ph_frost'],
  ph1_b4: ['결정침 개화', 'attack', 18, 14, 8, 'ph_bloom', 'ph_crystal'], ph1_c1: ['꿈꽃가루', 'support', 10, 10, 14, 'ph_blow', 'ph_dream'] };
for (const [id, [name, type, unlock, mp, cd, anim, fn]] of Object.entries(WANT)) {
  const d = SK[id];
  ok(d && d.name === name && d.type === type && d.unlock === unlock && d.maxLv === 5 && d.mp === mp && d.cd === cd && d.anim === anim, `${id} ${name}: ${type} Lv${unlock} 기력 ${mp} ${cd}초 ${anim}`);
  ok(d.ops.length === 1 && d.ops[0].fn === fn && isSlottable(d), `${id}: one ${fn} op, slottable`);
  ok(actions[anim] && actions[anim].hitT > 0, 'motion ' + anim);
  ok(!d.ops.some(o => o.knock || o.vsImmune || (o.st || []).some(s => ['burn', 'poison', 'defdown'].includes(s.id))), id + ': no old knockback / burn / poison / def-down');
  ok(existsSync(new URL(`../assets/ui/skills/${id}.png`, import.meta.url)), 'icon ' + id);
}
ok(actions.ph_catch && actions.ph_catch.overlay, 'catch overlay motion');
ok(actions.ph_bowl.stow && actions.ph_bloom.stow && actions.ph_blow.stow && !actions.ph_rang.stow, 'free-hand motions stow the pestle, the boomerang throw keeps it in the hand');
ok(STATUS.sleep && STATUS.sleep.kind === 'stun' && STATUS.sleep.boss === 'immune', 'sleep status: stops actions, bosses immune');
ok(!S2.recipes.some(r => r.skill === 'ph1_c1'), 'no recipe on ph1_c1 any more');
const SOUNDS = ['ph_rang_throw', 'ph_rang_hit', 'ph_rang_catch', 'ph_wick_break', 'ph_wick_sizzle', 'ph_wick_whoomp', 'ph_wick_crackle', 'ph_frost_roll', 'ph_frost_shatter',
  'ph_crystal_grow', 'ph_crystal_pierce', 'ph_crystal_shatter', 'ph_crystal_scatter', 'ph_dream_blow', 'ph_dream_sleep'];
for (const n of SOUNDS) ok(existsSync(new URL(`../assets/audio/sfx_${n}.mp3`, import.meta.url)), 'sound ' + n);
{ const used = new Set((read('../js/pharm1.js').match(/'ph_[a-z_]+'/g) || []).map(x => x.slice(1, -1)).filter(n => !/^ph_(rang|wick|frost|crystal|dream)$/.test(n))); for (const n of used) ok(SOUNDS.includes(n), 'pharm1.js sound is generated: ' + n); }
ok(read('../js/sfx.js').includes("'ph_rang_catch'"), 'sounds registered in SFX_NAMES');

// old save: levels, points and quick slots of these ids carry over to the new skills (craft c1 had no slot — now it can be equipped)
{ const data = { skill2: id => SK[id] };
  const p = { sk: { points: 2, learned: { ph1_a4: 3, ph1_b1: 2, ph1_b2: 5, ph1_b4: 1, ph1_c1: 4, ph1_a1: 2 }, slots: ['ph1_a4', 'ph1_b1', 'ph1_b4', 'ph1_b2'] } };
  const sk = ensureSk(p, data);
  ok(sk.points === 2 && sk.learned.ph1_a4 === 3 && sk.learned.ph1_b2 === 5 && sk.learned.ph1_c1 === 4 && sk.learned.ph1_b4 === 1, 'old save keeps the levels and the points');
  ok(sk.slots.join() === 'ph1_a4,ph1_b1,ph1_b4,ph1_b2', 'old save keeps the quick-slot positions: ' + sk.slots.join()); }

// pure helpers + tooltips
ok(near(segDist({ x: 1, z: 0 }, { x: 0, z: -1 }, { x: 0, z: 1 }), 1), 'segDist');
{ const g = { blocked: (x, z, r) => z + r >= 5 }, pth = frostPath(g, { x: 0, z: 0 }, { x: 0, z: 1 }, 7, 0.25); ok(pth.wall && pth.end.z < 4.8 && pth.end.z > 4.5, 'frost path stops before a wall: ' + pth.end.z.toFixed(2));
  const q = frostPath({ blocked: () => false }, { x: 0, z: 0 }, { x: 1, z: 0 }, 7); ok(!q.wall && near(q.dist, 7), 'frost path: full length on open ground'); }
for (const id of Object.keys(WANT)) for (let L = 1; L <= 5; L++) { const t = ph1LevelText(SK[id], L, k => k === 'throwRange' ? 1.5 : k === 'centerBonus' ? 0.2 : 0); ok(t && !/NaN|undefined/.test(t), `tooltip ${id} Lv${L}: ${t}`); }
ok(ph1LevelText(SK.ph1_b2, 1, k => k === 'throwRange' ? 1.5 : 0).includes('구르는 거리 8.5m'), 'tooltip: roll distance includes 정확한 투척');
ok(ph1LevelText(SK.ph1_c1, 5).includes('수면 3초'), 'tooltip: sleep grows to 3 s at Lv5');

// ------------------------------------------------------------------ engine harness
function world(o = {}) {
  const sounds = [], kicks = [], fxLog = [], toasts = [];
  for (const k of Object.keys(FX).filter(k => k !== 'on')) FX[k] = () => null;
  const handle = (kind) => new Proxy({ kind }, { get: (t, m) => m in t ? t[m] : (...a) => { fxLog.push(kind + '.' + String(m)); return null; } });
  FX.pharm = (kind) => { fxLog.push(kind); return handle(kind); };
  const learned = Object.assign({}, o.learned || {});
  const book = { sk: { slots: ['ph1_a4', 'ph1_b1', 'ph1_b2', 'ph1_b4', 'ph1_c1', 'ph1_a1'] }, level: id => learned[id] || 1, usable: () => true,
    passive: key => { let v = 0; for (const [id, lv] of Object.entries(learned)) { const f = SK[id] && SK[id].type === 'passive' && SK[id].flags && SK[id].flags[key]; if (f) v += f[0] + (f[1] || 0) * (lv - 1); } return v; } };
  const blocked = o.blocked || (() => false);
  const geo = { boxes: [], ground: (x, z) => ({ x, y: 0, z }), blocked: (x, z, r) => blocked(x, z, r || 0), removeTag() {} };
  const actors = [], body = { sh: { actions }, play() {}, thrownR: false, catches: 0, catchOver() { this.catches++; }, handPoint: () => null };
  const pc = { pos: { x: 0, y: 0, z: 0 }, facing: { x: 0, z: 1 }, faction: 'player', radius: 0.4, skills: { lock: 0, busy: false }, body, hp: 500, maxHp: 1000, sp: 200, maxSp: 200, dead: false,
    sheet: { p: { sk: {}, job: 'pharmacist', weapon: 'w_pestle_1' }, book, job: { id: 'pharmacist' }, final: { healPower: 0, foodPower: 0, shieldPower: 0 } }, status: new StatusSet(), stat: k => k === 'atk' ? 100 : k === 'crit' ? 0 : k === 'critDmg' ? 1.5 : 0,
    setFacing(x, z) { const m = Math.hypot(x, z) || 1; this.facing = { x: x / m, z: z / m }; },
    zone: { actors, geo, def: { portals: [] }, nearestEnemy: () => actors.find(a => !a.dead && a.faction !== 'player') }, dist(t) { return Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z); },
    startLunge() {}, shield: 0, addShield() {} };
  const eng = new SkillEngine(pc); pc.skills2 = eng;
  bindSkillRt({ audio: { sfx: n => sounds.push({ n, t: eng.clock }) }, render: { scene: { add() {}, remove() {} }, kick: (...a) => kicks.push(a), addShake() { throw new Error('no random shake'); } }, hitStop() { throw new Error('no global hit-stop'); },
    ui: { floatText() {}, toast: t => toasts.push(t) }, data: { status: id => STATUS[id], skill2: id => SK[id], config: {}, item: id => ({ id, job: 'pharmacist' }), job: id => ({ id, tier: 1 }) } });
  const mon = (x, z, extra = {}) => { const m = { pos: { x, y: 0, z }, radius: 0.5, hp: 1e6, maxHp: 1e6, dead: false, zone: pc.zone, faction: 'monster', status: new StatusSet(), stat: () => 0, taken: [],
      takeDamage(hd) { this.taken.push({ ...hd, at: eng.clock }); this.hp -= hd.amount; wakeOnHit(this, hd.amount); }, cancelAttack() { this.cancelled = (this.cancelled || 0) + 1; }, ...extra }; actors.push(m); return m; };
  const ctx = (id, L = 1, more = {}) => ({ d: SK[id], id, L, grade: 1, mult: 1 + 0.12 * (L - 1), origin: { ...pc.pos }, facing: { ...pc.facing }, aim: { x: 0, y: 0, z: 4 }, hitOnce: new Set(), act: SK[id].anim, ...more });
  // 몬스터 상태 시간은 존이 흐르게 함(actors.js baseUpdate) — 여기서 대신: 지속 피해 틱 = takeDamage({dot})
  const run = (sec, each) => { for (let i = 0; i < Math.round(sec / 0.01); i++) { if (each) each(eng.clock); eng.tick(0.01); for (const a of actors) if (!a.dead) a.status.tick(0.01, s => a.takeDamage({ amount: Math.max(1, s.value), dot: true, source: s.source }), () => {}); } };
  return { pc, eng, kit: eng.ph, mon, ctx, run, sounds, kicks, fxLog, toasts, learned, geo, body };
}
const coefDmg = (c) => CombatMath.compute(100, c, 0, 0, 1.5, 0, 0.5, 0.5).amount;

// ------------------------------------------------------------------ 유봉 되던지기
{ const W = world(), m = W.mon(0, 3, { radius: 1.2 }), side = W.mon(2.0, 3.2);
  W.eng.release(W.ctx('ph1_a4')); let during = false, away = false;
  W.run(3.5, () => { if (W.body.thrownR) during = true; if (W.eng.ph.away()) away = true; });
  const direct = m.taken.filter(h => !h.dot);
  ok(direct.length === 2, `boomerang: a big target overlapping for many frames is hit once out + once back (${direct.length})`);
  ok(near(direct[0].amount, coefDmg(coefAt(SK.ph1_a4.ops[0], 1)), 1), 'boomerang: 85% per pass at Lv1');
  ok(side.taken.length === 0, 'boomerang: standing still, the side target is missed both ways');
  ok(during && away && !W.body.thrownR && W.body.catches === 1 && W.kit.log.catch === 1, 'boomerang: the pestle leaves the hand (hidden), is caught once (catch motion) and shows again');
  ok(W.sounds.some(s => s.n === 'ph_rang_catch') && W.sounds.some(s => s.n === 'ph_rang_throw'), 'boomerang: throw whoosh + light catch sound');
  ok(!m.knock && !m.taken.some(h => h.knockback > 0) && W.kicks.length === 0, 'boomerang: no knockback, no camera kick');
}
{ // strafing curves the return: the same side target is hit on the way back when the caster walks sideways
  const W = world(), side = W.mon(2.0, 3.2); let blockedMsg = null;
  W.eng.release(W.ctx('ph1_a4'));
  W.run(3.5, (t) => { if (t > 0.5 && W.pc.pos.x < 3.2) W.pc.pos.x += 4.6 * 0.01; if (t > 0.4 && t < 0.42) blockedMsg = W.eng.validate(SK.ph1_a1); });
  ok(side.taken.length === 1, `boomerang: strafing right bends the return path through the side target (${side.taken.length})`);
  ok(blockedMsg === '유봉이 돌아오는 중입니다', 'boomerang: pestle skills wait for the pestle: ' + blockedMsg);
  ok(W.body.catches === 1 && W.eng.ph.away() === false, 'boomerang: still returns to the moved caster and is caught');
}
{ // a wall turns it back early; zone change / death -> back in the hand without more hits
  const W = world({ blocked: (x, z) => z > 3.5 }), far = W.mon(0, 5);
  W.eng.release(W.ctx('ph1_a4')); W.run(3.5);
  ok(far.taken.length === 0 && W.body.catches === 1, 'boomerang: a wall turns it back (nothing behind the wall is hit)');
  const D = world(), m = D.mon(0, 5); D.eng.release(D.ctx('ph1_a4')); D.run(0.4); D.eng.clearTemp(); D.run(2);
  ok(!D.body.thrownR && !D.eng.ph.away() && m.taken.length === 0, 'boomerang: clearTemp -> pestle back in the hand, no damage');
}

// ------------------------------------------------------------------ 불꽃심지병
{ const W = world(), stay = W.mon(0, 4), leaver = W.mon(0.6, 4.2), enterer = W.mon(5, 4);
  const op = SK.ph1_b1.ops[0];
  W.eng.release(W.ctx('ph1_b1', 1, { aim: { x: 0, y: 0, z: 4 } }));
  let landT = null;
  W.run(3.5, (t) => { if (landT == null && stay.taken.length) landT = t;
    if (landT != null && t > landT + 0.65 && leaver.pos.x < 6) leaver.pos.x = 6;          // walks out after the 1st fire tick
    if (landT != null && t > landT + 1.05) enterer.pos.x = 0.3; });                      // walks in before the 3rd tick
  const imp = stay.taken.filter(h => !h.dot), ticks = stay.taken.filter(h => h.dot);
  ok(imp.length === 1 && near(imp[0].amount, coefDmg(op.impact * (1 + W.eng.book.passive('centerBonus'))), 1), 'wick: one small impact hit');
  ok(ticks.length === op.ticks, `wick: ${op.ticks} fire ticks for the one that stays (${ticks.length})`);
  ok(near(ticks[0].at - imp[0].at, op.ignite, 0.02), `wick: ignites ${op.ignite} s after the impact (${(ticks[0].at - imp[0].at).toFixed(2)})`);
  ok(ticks.every((h, i) => i === 0 || near(h.at - ticks[i - 1].at, op.tick, 0.02)), 'wick: one tick every ' + op.tick + ' s');
  ok(leaver.taken.filter(h => h.dot).length === 1, 'wick: the enemy who leaves after the first tick takes only that one: ' + leaver.taken.filter(h => h.dot).length);
  const et = enterer.taken.filter(h => h.dot).length; ok(et >= 2 && et <= 3 && enterer.taken.filter(h => !h.dot).length === 0, 'wick: the enemy who walks in later takes only the later ticks: ' + et);
  ok(![stay, leaver, enterer].some(m => m.status.has('burn')), 'wick: no separate burn status');
  const s = n => (W.sounds.find(x => x.n === n) || {}).t;
  ok(s('ph_wick_break') != null && s('ph_wick_break') < s('ph_wick_sizzle') && s('ph_wick_sizzle') < s('ph_wick_whoomp'), 'wick: break -> wick sizzle -> whoomp in order');
  ok(near(s('ph_wick_whoomp') - s('ph_wick_break'), op.ignite, 0.02), 'wick: whoomp at the ignition');
  ok(W.fxLog.includes('wick.land') && W.fxLog.includes('wick.ignite') && W.fxLog.includes('wick.end'), 'wick: land / ignite / end drawn');
}
{ // 정확한 투척: throw range + impact centre bonus
  const W = world({ learned: { ph1_b5: 3 } }), c = W.mon(0, 4), e = W.mon(1.2, 4);
  ok(near(W.eng.range(SK.ph1_b1), 7 + 1 + 0.5 * 2), 'wick: 정확한 투척 adds throw range: ' + W.eng.range(SK.ph1_b1));
  W.eng.release(W.ctx('ph1_b1', 1, { aim: { x: 0, y: 0, z: 4 } })); W.run(1.2);
  const a = c.taken.find(h => !h.dot).amount, b = e.taken.find(h => !h.dot).amount; ok(a > b, `wick: centre target gets the 정확한 투척 bonus (${a} > ${b})`);
  ok(W.eng.range(SK.ph1_b4) === 7, 'crystal: independent of 정확한 투척 (range stays 7)');
}

// ------------------------------------------------------------------ 서리병 굴리기
{ const W = world(), onPath = W.mon(0.2, 3), end = W.mon(0, 8.6), wide = W.mon(4, 7.5);
  const op = SK.ph1_b2.ops[0];
  W.eng.release(W.ctx('ph1_b2')); let val0 = null, rem = [];
  W.run(3.0, () => { const s = onPath.status.get('slow'); if (s) { if (val0 == null) val0 = s.value; rem.push(s.remaining); } });
  ok(val0 != null && near(val0, slowAt(op, 1)), `frost: the ice trail slows (${val0})`);
  ok(rem.every(r => r <= op.slowDur + 1e-6) && onPath.status.get('slow').value === val0, 'frost: staying on the trail only refreshes the duration (value unchanged)');
  ok(onPath.taken.length === 0, 'frost: the rolling bottle passes through (no damage on the way)');
  ok(end.taken.length === 1 && wide.taken.length === 0, 'frost: shatters at max distance — one cold hit in the forward fan, nothing outside it');
  ok(W.kit.log.shards === 1 && W.sounds.some(s => s.n === 'ph_frost_shatter'), 'frost: one shatter');
  W.run(4); ok(!W.eng.ph.live.length, 'frost: trail gone after its time');
}
{ // wall in front: shatters before the wall, shards never hit the enemy behind it
  const wall = (x, z) => z >= 5 && z <= 5.4 && x <= 0.3;
  const W = world({ blocked: wall }), behind = W.mon(0, 6.6), open = W.mon(1.8, 6.4);
  W.eng.release(W.ctx('ph1_b2')); W.run(2.5);
  ok(W.kit.lastShatter && W.kit.lastShatter.wall, 'frost: breaks at the wall');
  ok(behind.taken.length === 0 && W.kit.lastShatter.blocked >= 1, 'frost: no shard through the wall');
  ok(open.taken.length === 1, 'frost: the enemy beside the wall (clear line) is hit');
}
{ const W = world({ learned: { ph1_b5: 1 } }); W.eng.release(W.ctx('ph1_b2')); W.run(2);
  const W2 = world(); W2.eng.release(W2.ctx('ph1_b2')); W2.run(2);
  ok(W.kit.lastShatter.o.z > W2.kit.lastShatter.o.z + 0.9, 'frost: 정확한 투척 rolls it 1 m further'); }

// ------------------------------------------------------------------ 결정침 개화
{ const W = world(), t = W.mon(0, 5), op = SK.ph1_b4.ops[0];
  W.eng.release(W.ctx('ph1_b4', 3, { tgt: t })); W.run(1.5, () => { t.pos.x += 2.0 * 0.01; });   // the target walks sideways
  ok(t.taken.length === 3, 'crystal: three hits on the moving target');
  const t0 = t.taken[0].at; ok(op.hits.every((h, i) => near(t.taken[i].at - t0, h - op.hits[0], 0.02)), 'crystal: hit timing ' + t.taken.map(h => (h.at - t0).toFixed(2)).join('/'));
  ok(t.taken[2].amount > t.taken[0].amount * 2, 'crystal: the last hit is the heavy one');
  ok(near(t.taken[2].amount, coefDmg(lastCoefAt(op, 3) * 1.24), 1), 'crystal: last coef grows with the level');
  const ps = W.sounds.filter(s => s.n === 'ph_crystal_pierce').length, ls = W.sounds.filter(s => s.n === 'ph_crystal_shatter').length; ok(ps === 2 && ls === 1, 'crystal: two sharp pierce sounds + one shatter on the hit frames');
  ok(W.kicks.length === 1, 'crystal: one camera kick on the last hit');
  const D = world(), u = D.mon(0, 5); D.eng.release(D.ctx('ph1_b4', 1, { tgt: u })); D.run(0.5); u.dead = true; D.run(1);
  ok(u.taken.length === 1 && D.kit.log.scatter === 1 && D.fxLog.includes('crystal.scatter'), 'crystal: target down early -> the rest scatter, no more damage');
}

// ------------------------------------------------------------------ 꿈꽃가루
{ const W = world(), a = W.mon(0, 2), b = W.mon(0.8, 2.6), c = W.mon(-0.6, 1.5), boss = W.mon(0, 2.8, { isBoss: true }), back = W.mon(0, -2);
  const op = SK.ph1_c1.ops[0];
  W.eng.release(W.ctx('ph1_c1')); W.run(0.8);
  ok(a.status.has('sleep') && b.status.has('sleep') && c.status.has('sleep') && a.status.stunned, 'dream: normal monsters in the fan fall asleep (stunned = no move / attack)');
  ok(!boss.status.has('sleep') && !back.status.has('sleep') && W.kit.log.immune === 1, 'dream: boss immune, behind = untouched');
  ok([a, b, c, boss].every(m => m.taken.length === 0), 'dream: zero damage');
  ok(W.kit.sleepers.length === 3 && W.fxLog.filter(x => x === 'moon').length === 3, 'dream: crescent moon over each sleeper');
  W.eng.dmg(a, 1, W.ctx('ph1_a1')); W.run(0.05);
  ok(!a.status.has('sleep') && W.fxLog.includes('moon.wake'), 'dream: a direct hit wakes it at once (moon gone)');
  W.eng.ph.h.applyStatus(b, { id: 'poison', dur: 3, val: 0.1, ch: 1 }, W.pc); for (let i = 0; i < 120; i++) b.status.tick(0.01, s => b.takeDamage({ amount: Math.max(1, s.value), dot: true, source: s.source }), () => {});
  ok(!b.status.has('sleep'), 'dream: damage over time wakes it');
  W.run(sleepAt(op, 1) + 0.2); ok(!c.status.has('sleep') && W.kit.sleepers.length === 0, 'dream: wakes when the sleep time ends');
}
{ // same cast never puts the same enemy back to sleep; a new cast can
  const W = world(), a = W.mon(0, 1.0);
  W.eng.release(W.ctx('ph1_c1')); let woke = false;
  W.run(0.7, () => { if (!woke && a.status.has('sleep')) { woke = true; W.eng.dmg(a, 1, W.ctx('ph1_a1')); } });
  ok(woke && !a.status.has('sleep') && W.kit.log.slept === 1, 'dream: woken during the spreading wave -> not asleep again from the same cast');
  W.eng.release(W.ctx('ph1_c1')); W.run(0.7); ok(a.status.has('sleep'), 'dream: the next cast can put it to sleep again');
}
{ // 불꽃심지병 + 꿈꽃가루: the next fire tick wakes the sleeper
  const W = world(), a = W.mon(0, 2.2);
  W.eng.release(W.ctx('ph1_b1', 1, { aim: { x: 3, y: 0, z: 2.2 } })); W.run(0.3);   // the bottle lands beside it first
  W.eng.release(W.ctx('ph1_c1')); W.run(0.6); ok(a.status.has('sleep'), 'combo: asleep');
  a.pos.x = 3; let wokeAt = null; W.run(1.5, (t) => { if (wokeAt == null && !a.status.has('sleep')) wokeAt = t; });
  ok(wokeAt != null && a.taken.some(h => h.dot && h.elem === 'fire' && near(h.at, wokeAt, 0.02)), 'combo: sleeping in the fire -> the next fire tick wakes it');
}
{ // Lv5 sleep 3 s; engine cooldown from 14 s; cost 10
  const W = world({ learned: { ph1_c1: 5 } }), a = W.mon(0, 2);
  W.eng.release(W.ctx('ph1_c1', 5)); W.run(0.6); const s = a.status.get('sleep'); ok(s && near(s.duration, 3.0), 'dream Lv5: 3 s sleep');
  ok(near(W.eng.cdOf(SK.ph1_c1), 14 * (1 - 0.12)), 'dream Lv5: cooldown 14 s - 3 %/Lv');
}
console.log(`pharm2: ${pass} passed`);
