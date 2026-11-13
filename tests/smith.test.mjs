// 대장장이 1차 규칙(js/smith.js + js/skillrt.js)을 WebGL 없이 확인: 가열 더하기·갱신·만료·급랭, 모루 하나·충격파 간격/횟수,
// 집게(일반 = 끌어옴, 보스 = 끌지 않고 접근), 철벽(정면만·다시 누르기·시간 만료), 리벳(소모 간격·공격 소모), 충격 재활용 상한,
// 낙인(직접 타격 3번, 파생 피해 제외), 장인의 박자(1회·안 쌓임), 정리(사망·맵 이동), 스킬 id·배우는 레벨·데이터 수치.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { HitShape, CombatMath, StatusSet, clamp, clamp01, GameData, CharacterSheet, newProfile, migrate } from '../js/core.js';
import { skillSound } from '../js/sfx.js';
import { SmithKit, clearLine, stackHeat, guardHit, SMITH } from '../js/smith.js';
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
for (const n of ['bs_swing', 'bs_hit', 'bs_hit_heavy', 'bs_anvil', 'bs_anvil_ring', 'bs_tongs', 'bs_quench', 'bs_steam', 'bs_steam3', 'bs_wall', 'bs_block', 'bs_rivet', 'bs_rivet_pop', 'bs_rivet_shot', 'bs_forge', 'bs_break'])
  ok(readFileSync(new URL(`../assets/audio/sfx_${n}.mp3`, import.meta.url)).length > 2000, 'sound ' + n);
ok(STATUS.heat && STATUS.brand, 'heat / brand statuses');
ok(actions.bs_flurry.hitTimes.join() === '0.16,0.3,0.44,0.78', 'flurry contact frames');
{ // 백련타 timing in data == contact frames: taps at hitT + k * gap, finisher at hitT + at
  const d = SK.bs1_a4, [tap, fin] = d.ops, ht = actions.bs_flurry.hitFrame / actions.bs_flurry.fps;
  for (let k = 0; k < 3; k++) ok(Math.abs(ht + k * tap.gap - actions.bs_flurry.hitTimes[k]) < 0.011, 'tap ' + k + ' on contact');
  ok(Math.abs(ht + fin.at - actions.bs_flurry.hitTimes[3]) < 0.011, 'finisher on contact'); ok(fin.heat === 1 && tap.heat == null, 'finisher alone heats 1');
}
ok(SK.bs1_b3.ops[0].heat === 2, '용광로 개방 heats 2');

// ------------------------------------------------------------------ pure helpers
{ const st = new StatusSet();
  ok(stackHeat(st, STATUS.heat, 2) === 2, 'heat 2'); st.get('heat').remaining = 1;
  ok(stackHeat(st, STATUS.heat, 1) === 3 && st.get('heat').remaining === SMITH.heat.dur, 'add -> 3, timer refreshed to 5 s');
  ok(stackHeat(st, STATUS.heat, 2) === 3, 'cap 3');
  st.tick(5.01, () => {}, () => {}); ok(!st.has('heat'), 'heat expires after 5 s');
  const rv = { n: 3, val: 0.35, gap: 0.35, last: -9 };
  const a = guardHit({ wall: null, front: false, rivets: rv, clock: 1 }, 100), b = guardHit({ wall: null, front: false, rivets: rv, clock: 1.1 }, 100);
  ok(a.rivet && Math.abs(a.amount - 65) < 1e-9 && !b.rivet && b.amount === 100 && rv.n === 2, 'one rivet per 0.35 s (simultaneous hits keep the rest)');
  const w = guardHit({ wall: { val: 0.45 }, front: true, rivets: null, clock: 0 }, 100), back = guardHit({ wall: { val: 0.45 }, front: false, rivets: null, clock: 0 }, 100);
  ok(w.reduced === 45 && back.reduced === 0, 'wall: front only');
  ok(!clearLine({ blocked: (x) => x > 1 && x < 1.5 }, { x: 0, z: 0 }, { x: 3, z: 0 }) && clearLine({ blocked: () => false }, { x: 0, z: 0 }, { x: 3, z: 0 }), 'clearLine sees walls');
}

// ------------------------------------------------------------------ engine harness
function world(o = {}) {
  const sounds = [], kicks = [], fxLog = [];
  for (const k of Object.keys(FX).filter(k => k !== 'on')) FX[k] = () => ({ set() {}, dispose() {}, end() {}, pulse() {} });
  const handle = (kind) => new Proxy({ kind }, { get: (t, m) => m in t ? t[m] : (...a) => { fxLog.push(kind + '.' + String(m)); return m === 'kick' ? handle('plate') : null; } });
  FX.smith = (kind) => { fxLog.push(kind); return handle(kind); };
  const learned = Object.assign({}, o.learned || {});
  const book = { sk: { slots: bs.filter(x => x.type !== 'passive' && x.type !== 'craft').map(x => x.id) }, level: id => learned[id] || 0, usable: () => true, passive: key => { let v = 0; for (const [id, lv] of Object.entries(learned)) { const f = SK[id] && SK[id].type === 'passive' && SK[id].flags && SK[id].flags[key]; if (f) v += f[0] + (f[1] || 0) * (lv - 1); } return v; } };
  const blocked = o.blocked || (() => false);
  const geo = { ground: (x, z) => ({ x, y: 0, z }), blocked, move: (p, dx, dz, r) => blocked(p.x + dx, p.z + dz, r) ? { ...p } : { x: p.x + dx, y: 0, z: p.z + dz } };
  const actors = [];
  const pc = { pos: { x: 0, y: 0, z: 0 }, facing: { x: 0, z: 1 }, faction: 'player', skills: { lock: 0, busy: false }, body: { sh: { actions }, play() {} }, hp: 500, maxHp: 500, sp: 100, maxSp: 100,
    sheet: { p: { sk: {}, job: 'blacksmith', weapon: 'w_hammer_1' }, book, job: { id: 'blacksmith' } }, status: new StatusSet(), stat: k => k === 'atk' ? 100 : k === 'crit' ? 0 : k === 'critDmg' ? 1.5 : 0,
    setFacing(x, z) { const m = Math.hypot(x, z) || 1; this.facing = { x: x / m, z: z / m }; }, zone: { actors, geo, def: { portals: [] }, nearestEnemy: () => actors.find(a => !a.dead) }, dist(t) { return Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z); },
    lunges: [], startLunge(f, d, T) { this.lunges.push(d); this.pos = { x: this.pos.x + f.x * d, y: 0, z: this.pos.z + f.z * d }; }, shield: 0, addShield(v) { this.shield = Math.max(this.shield, v); } };
  const eng = new SkillEngine(pc); pc.skills2 = eng;
  bindSkillRt({ audio: { sfx: n => sounds.push(n) }, render: { kick: (...a) => kicks.push(a), addShake() { throw new Error('no random shake'); } }, ui: { floatText() {}, toast() {} }, data: { status: id => STATUS[id], skill2: id => SK[id], config: {}, item: () => ({ job: 'blacksmith' }), job: () => ({ id: 'blacksmith', tier: 1 }) } });
  const mon = (x, z, extra = {}) => { const m = { pos: { x, y: 0, z }, radius: 0.5, hp: 1e6, maxHp: 1e6, dead: false, zone: pc.zone, faction: 'monster', status: new StatusSet(), stat: () => 0, taken: [],
      takeDamage(hd) { this.taken.push(hd); this.hp -= hd.amount; }, ...extra }; actors.push(m); return m; };
  const ctx = (id, L = 1, more = {}) => ({ d: SK[id], id, L, grade: 1, mult: 1, origin: { ...pc.pos }, facing: { ...pc.facing }, aim: { x: 0, y: 0, z: 3 }, hitOnce: new Set(), ...more });
  const run = (sec) => { for (let i = 0; i < Math.round(sec / 0.01); i++) eng.tick(0.01); };
  return { pc, eng, kit: eng.smith, mon, ctx, run, sounds, kicks, fxLog, learned };
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
  const before = m.taken.length; CUSTOM.smith_quench(W.eng, SK.bs1_b1.ops[0], W.ctx('bs1_b1'));
  ok(k.heatOf(m) === 0 && k.heatOf(n) === 0, 'quench consumed heat on both');
  const direct = m.taken.slice(before).filter(h => !h.derived), derived = m.taken.slice(before).filter(h => h.derived);
  ok(direct.length === 1 && derived.length === 1, 'm: one quench hit + one splash from n (derived)');
  ok(W.sounds.includes('bs_steam3'), '3-stack quench: strong steam sound');
  // no chain: quench again on cold targets -> no splash, no steam
  const b2 = m.taken.length, s2 = W.sounds.length; CUSTOM.smith_quench(W.eng, SK.bs1_b1.ops[0], W.ctx('bs1_b1'));
  ok(m.taken.slice(b2).every(h => !h.derived) && !W.sounds.slice(s2).some(s => s.startsWith('bs_steam')), 'cold quench: no splash, no steam');
  ok(m.status.has('slow'), 'quench slows');
  // derived damage never adds heat
  ok(k.heatOf(m) === 0, 'splash did not re-heat');
}
// quench damage scales with stacks
{ const dmgFor = (n) => { const W = world(), m = W.mon(0, 2); if (n) W.kit.addHeat(m, n); CUSTOM.smith_quench(W.eng, SK.bs1_b1.ops[0], W.ctx('bs1_b1')); return m.taken.filter(h => !h.derived)[0].amount; };
  const d0 = dmgFor(0), d3 = dmgFor(3); ok(d3 > d0 * 2.2 && d3 < d0 * 2.8, `3 stacks ~ x2.5 (${d0} -> ${d3})`); }

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
// rivets: one per valid hit (with a short gap), offensive consume on the empowered basic attack, expiry
{ const W = world({ learned: { bs1_a5: 1, bs1_b5: 5 } }), m = W.mon(0, 1.5);
  W.kit.smith_rivets(SK.bs1_b4.ops[0], W.ctx('bs1_b4'));
  const r1 = W.kit.guard({ source: m, amount: 100 }, 100), r2 = W.kit.guard({ source: m, amount: 100 }, 100);
  ok(r1 === 65 && r2 === 100 && W.kit.rivets.n === 2, 'two simultaneous hits eat one rivet');
  ok(W.fxLog.includes('rivets.pop') && W.sounds.includes('bs_rivet_pop'), 'defensive consume visuals/sound');
  // storage cap: huge mitigations clamp to atk * recycleCap
  for (let i = 0; i < 2; i++) { W.run(0.4); W.kit.guard({ source: m, amount: 1e5 }, 1e5); }
  ok(!W.kit.rivets, 'last rivet used');
  const cap = 100 * (SK.bs1_b5.flags.recycleCap[0] + SK.bs1_b5.flags.recycleCap[1] * 4); ok(Math.abs(W.kit.stored - cap) < 1e-6, 'stored capped at ' + cap);
  // empowered basic attack: tempo after a skill, consumed once, releases stored impact
  W.kit.smith_rivets(SK.bs1_b4.ops[0], W.ctx('bs1_b4'));
  W.kit.onCast(SK.bs1_b1); W.kit.onCast(SK.bs1_b3); ok(W.kit.empowered, 'tempo armed');
  const emp = W.kit.basicSwing(); ok(emp && emp.mul > 1.5 && !W.kit.basicSwing(), 'one empowered swing, no stacking');
  const n0 = m.taken.length; W.kit.basicLanded([m], HitShape.cone(0, 0, 0, 1, 2, 120), { x: 0, z: 1 }, emp);
  const got = m.taken.slice(n0);
  ok(got.filter(h => h.derived).length === 2, 'rivet shot + impact release (both derived)');
  ok(!W.kit.rivets && W.kit.stored === 0 && W.fxLog.includes('rivets.shoot'), 'rivets fired, storage spent');
  W.kit.onCast(SK.bs1_b1); W.run(SMITH.tempo.window + 0.1); ok(!W.kit.empowered, 'tempo times out');
  W.kit.smith_rivets(SK.bs1_b4.ops[0], W.ctx('bs1_b4')); W.run(10.2); ok(!W.kit.rivets, 'rivets expire');
  W.kit.guard({ source: m, amount: 10 }, 10); W.run(SMITH.recycle.hold + 0.1); ok(W.kit.stored === 0, 'no charge without rivets/wall; storage expires');
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
  const v = boss.status.get('defdown').value; W.eng.release(W.ctx('bs1_a3', 5, { tgt: boss })); W.run(0.6);
  for (let i = 0; i < 3; i++) { W.run(0.2); W.eng.dmg(boss, 1, W.ctx('bs1_a3')); }
  ok(boss.status.get('defdown').value <= STATUS.defdown.cap && boss.status.list.filter(s => s.def.id === 'defdown').length === 1, 'def down never stacks (max rule, cap)');
  void v;
}
// cleanup: enemy death, zone change / player death (eng.clearTemp — 사망·맵 이동·전직 때 불림)
{ const W = world(), m = W.mon(0, 2), n = W.mon(0, 2.5);
  W.kit.addHeat(m, 2); W.eng.release(W.ctx('bs1_a3', 1, { tgt: n })); W.run(0.6);
  m.dead = true; W.run(0.05); ok(!W.kit.heated.has(m) && W.fxLog.includes('heat.dispose'), 'heat visuals gone on death');
  W.kit.smith_rivets(SK.bs1_b4.ops[0], W.ctx('bs1_b4')); W.kit.smith_anvil(SK.bs1_a1.ops[0], W.ctx('bs1_a1')); W.eng.cast('bs1_b2', { x: 0, z: 3 });
  const n2 = W.mon(1, 2); W.kit.addHeat(n2, 1);
  W.eng.clearTemp();
  ok(!W.kit.anvil && !W.kit.wall && !W.kit.rivets && !W.kit.heated.size && !W.kit.brands.size && W.kit.stored === 0 && !W.kit.empowered, 'clear() removes anvil / wall / rivets / marks / storage');
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
console.log(`smith: ${pass} passed`);
