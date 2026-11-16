// 엔지니어 2차 규칙(js/engineer.js + js/skillrt.js)을 WebGL 없이 확인: 데이터(id·배우는 레벨·유형·계열·레시피·아이콘·동작), 예전 저장 호환,
// 병기 생성·전개 완료 시점·표적 우선순위(앵커 지정 > 선택 > 가까운 적)·재탐색·소환 상한·교체, 센트리 탄(도착 순간 피해·집중 사격),
// 스파이더 마인(추적 거리·막힘·한 번 폭발), 트라이윙(편대 피해 분배·일제 사격), 테슬라 앵커(삼각형 판정 = 지정, 소유자 분리),
// 아틀라스 워커(단계·미사일 타격 상한·주포 kick 한 번·접고 해체), 파일 벙커(방어 무시·뒤 충격파·kick), 브리치 캐논(거리 배율·경직 상하한·한 번),
// 벌집 미사일(재조준·소멸·레드라인 +2), 레일캐논(누른 방향·한 번 관통·사망 시 취소), 오비탈(고정·예고 = 범위·레일 우선·취소),
// 리페어 비콘(기계만·손상 비례·상한), 리커버리 코어(기계당 한 번·비용 이하·교체/이동 없음), 레드라인(적용·종료·냉각·복원·재사용 차단),
// 정리(clearTemp), 전역 히트스톱·무작위 흔들림 없음, 스킬창 수치 문구.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { HitShape, CombatMath, StatusSet, clamp, clamp01, GameData, CharacterSheet, newProfile, migrate } from '../js/core.js';
import { skillSound } from '../js/sfx.js';
import { SmithKit, clearLine } from '../js/smith.js';
import { WpKit } from '../js/wpharm.js';
import { EnKit, EN, enLevelText, inTri } from '../js/engineer.js';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const S2 = JSON.parse(read('../assets/data/skills2.json')), skills = S2.skills, SK = Object.fromEntries(skills.map(s => [s.id, s]));
const STATUS = Object.fromEntries(S2.statuses.map(s => [s.id, s]));
const actions = Object.fromEntries(JSON.parse(read('../assets/models/actions.json')).map(a => [a.name, a]));
const sandbox = { HitShape, CombatMath, clamp, clamp01, skillSound, SmithKit, clearLine, WpKit, EnKit, console };
vm.createContext(sandbox);
vm.runInContext(read('../js/skillrt.js').replace(/^import .*;\n/gm, '').replace(/\bexport /g, '') + '\nthis.api={SkillEngine,bindSkillRt,FX,CUSTOM,Summon};', sandbox);
const { SkillEngine, bindSkillRt, FX } = sandbox.api;
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; };
Math.random = () => 0.5;   // 피해 굴림 고정(치명 없음)

// ------------------------------------------------------------------ data (ids · unlock · max · type kept)
const en = skills.filter(s => s.job === 'engineer');
ok(en.length === 15, '15 engineer skills');
const OLD_TYPE = { a1: 'summon', a2: 'summon', a3: 'summon', a4: 'summon', a5: 'ultimate', b1: 'attack', b2: 'attack', b3: 'attack', b4: 'attack', b5: 'ultimate', c1: 'craft', c2: 'craft', c3: 'support', c4: 'passive', c5: 'support' };
const UNL = [30, 33, 36, 40, 45];
for (const c of 'abc') for (let i = 1; i <= 5; i++) { const d = SK[`en_${c}${i}`]; ok(d && d.unlock === UNL[i - 1] && d.maxLv === (d.type === 'ultimate' ? 3 : 5) && d.type === OLD_TYPE[c + i] && d.cat === 'abc'.indexOf(c) && d.idx === i, 'id/unlock/max/type/pos kept en_' + c + i); }
ok(['전술 기계공학', '전자기 무장술', '현장 정비와 동력 제어'].every((n, i) => en.filter(s => s.cat === i).every(s => s.catName === n)), 'line titles');
const NAMES = ['전개식 센트리', '스파이더 마인', '트라이윙 편대', '테슬라 앵커', '아틀라스 워커', '파일 벙커', '브리치 캐논', '벌집 미사일 포드', '헬릭스 레일캐논', '오비탈 브레이커', '정밀 병기 제작', '모듈 어셈블리', '리페어 비콘', '리커버리 코어', '레드라인 프로토콜'];
ok(en.map(s => s.name).join() === NAMES.join(), 'new names');
ok(SK.en_c1.recipes.join() === 'r_pistol,r_shotgun,r_rifle' && SK.en_c2.recipes.join() === 'r_mod_speed,r_mod_area', 'craft recipes still linked');
ok(SK.en_b1.range < 3 && SK.en_b4.range >= 14, 'pile bunker short range vs railcannon long range');
if (!process.env.NOICON) for (const s of en) ok(existsSync(new URL(`../assets/ui/skills/${s.id}.png`, import.meta.url)), 'icon ' + s.id);
for (const a of ['en_toss', 'en_signal', 'en_pile', 'en_cannon', 'en_rail']) ok(actions[a] && actions[a].stow, 'motion ' + a + ' (hammer on the back)');
for (const s of en) if (s.type !== 'craft') ok(enLevelText(s, 1) && enLevelText(s, s.maxLv) !== enLevelText(s, 1), 'level text ' + s.id);
ok(/340%/.test(enLevelText(SK.en_b1, 1)) && /50% 무시/.test(enLevelText(SK.en_b1, 1)), 'pile text shows real numbers');
ok(inTri({ x: 0, z: 0 }, { x: -1, z: -1 }, { x: 1, z: -1 }, { x: 0, z: 1 }) && !inTri({ x: 2, z: 0 }, { x: -1, z: -1 }, { x: 1, z: -1 }, { x: 0, z: 1 }), 'inTri');

// ------------------------------------------------------------------ harness
function world(o = {}) {
  const sounds = [], kicks = [], fxLog = [];
  for (const k of Object.keys(FX).filter(k => k !== 'on')) FX[k] = () => ({ set() {}, dispose() {}, end() {}, pulse() {}, setStacks() {} });
  const handle = (kind) => new Proxy({ kind }, { get: (t, m) => m in t ? t[m] : (...a) => { fxLog.push(kind + '.' + String(m)); return null; } });
  FX.en = (kind) => { fxLog.push(kind); return handle(kind); };
  const learned = Object.assign({}, o.learned || {});
  const book = { sk: { slots: en.filter(x => x.type !== 'passive' && x.type !== 'craft').map(x => x.id).slice(0, 4) }, level: id => learned[id] || 0, usable: () => true, passive: key => { let v = 0; for (const [id, lv] of Object.entries(learned)) { const f = SK[id] && SK[id].type === 'passive' && SK[id].flags && SK[id].flags[key]; if (f) v += f[0] + (f[1] || 0) * (lv - 1); } return v; } };
  const walls = o.walls || [];
  const geo = { ground: (x, z) => ({ x, y: 0, z }), blocked: (x, z, r = 0) => walls.some(w => x + r > w[0] && x - r < w[2] && z + r > w[1] && z - r < w[3]),
    move(p, dx, dz, r) { const n = { x: p.x + dx, y: 0, z: p.z + dz }; return this.blocked(n.x, n.z, r) ? { ...p } : n; } };
  const actors = [];
  const zone = { actors, geo, def: { portals: [] }, nearestEnemy: () => actors.find(a => !a.dead && a.faction !== 'player') };
  const pc = { pos: { x: 0, y: 0, z: 0 }, facing: { x: 0, z: 1 }, faction: 'player', radius: 0.4, skills: { lock: 0, busy: false }, body: { sh: { actions }, play() {} }, hp: 500, maxHp: 500, sp: 999, maxSp: 999, target: null,
    sheet: { p: { sk: o.sk || {}, job: 'engineer', weapon: o.weapon || '', gearMods: o.gearMods || {} }, book, job: { id: 'engineer', parent: 'blacksmith' }, final: { shieldPower: 0, healPower: 0 } }, status: new StatusSet(), stat: k => k === 'atk' ? 100 : k === 'crit' ? 0 : k === 'critDmg' ? 1.5 : 0,
    setFacing(x, z) { const m = Math.hypot(x, z) || 1; this.facing = { x: x / m, z: z / m }; }, zone, dist(t) { return Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z); },
    lunges: [], startLunge(d, dist) { this.lunges.push(dist); }, shield: 0, addShield(v) { this.shield = Math.max(this.shield, v); }, heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); } };
  bindSkillRt({ audio: { sfx: n => sounds.push(n) }, render: { kick: (...a) => kicks.push(a), addShake() { throw new Error('no random shake'); }, scene: { add() {}, remove() {} } }, ui: { floatText() {}, toast() {} }, hitStop() { throw new Error('no global hit-stop'); },
    data: { status: id => STATUS[id], skill2: id => SK[id], config: {}, item: () => null, job: (id) => ({ id, tier: id === 'engineer' ? 2 : 1, parent: 'blacksmith' }) } });
  const eng = new SkillEngine(pc); pc.skills2 = eng; eng.res.power = 10;
  const mon = (x, z, extra = {}) => { const m = { pos: { x, y: 0, z }, radius: 0.5, hp: 1e6, maxHp: 1e6, dead: false, zone, faction: 'monster', status: new StatusSet(), stat: () => 0, taken: [], uid: actors.length + 1,
      takeDamage(hd) { this.taken.push(hd); this.hp -= hd.amount; }, ...extra }; actors.push(m); return m; };
  const ctx = (id, L = 1, more = {}) => ({ d: SK[id], id, L, grade: 1, mult: 1 + (SK[id].type === 'ultimate' ? 0.25 : 0.12) * (L - 1), origin: { ...pc.pos }, facing: { ...pc.facing }, aim: { x: 0, y: 0, z: 3 }, hitOnce: new Set(), ...more });
  const step = (dt) => { eng.tick(dt); for (const s of eng.summons.slice()) if (!s.dead && s.update) s.update(dt); for (const m of actors) if (m.status && m.status.list && m.status.list.length) m.status.tick(dt, () => {}, () => {}); };
  const run = (sec) => { for (let i = 0; i < Math.round(sec / 0.01); i++) step(0.01); };
  const cast = (id, L, more) => { learned[id] = L || learned[id] || 1; const c = ctx(id, learned[id], more); eng.en.onCast(SK[id], c); if (SK[id].res && SK[id].res.cost) eng.res.power -= SK[id].res.cost; for (const op of SK[id].ops) { if (op.op === 'lunge') continue; eng.exec(op, c); } return c; };
  return { pc, eng, kit: eng.en, mon, ctx, run, cast, sounds, kicks, fxLog, learned, zone };
}
const sum = (m, from = 0) => m.taken.slice(from).reduce((a, h) => a + h.amount, 0);
const quietAll = (ms) => ms.every(m => m.taken.every(h => h.localStop === 'quiet'));

// ------------------------------------------------------------------ A1 sentry: deploy timing, bullets land on arrival, retarget, focus burst, limit 2
{ const W = world(), m = W.mon(0, 6);
  const c = W.cast('en_a1', 1, { aim: { x: 0, y: 0, z: 1 } }); const s = W.kit.mine('sentry')[0];
  ok(s && s.en.phase === 'fly' && W.fxLog.includes('sentry'), 'sentry spawned (thrown device)');
  W.run(EN.sentry.fly + 0.02); ok(s.en.phase === 'deploy', 'lands -> deploy'); W.run(EN.sentry.deploy); ok(s.en.phase === 'on' && !m.taken.length, 'active only after deploy, no damage before');
  W.run(0.25); ok(W.fxLog.includes('sentry.fire') && !m.taken.length, 'muzzle fired, bullet still flying'); W.run(0.3);
  ok(m.taken.length === 1 && m.taken[0].amount === 70, 'bullet damage on arrival = 70% (' + (m.taken[0] && m.taken[0].amount) + ')');
  W.run(3.4); ok(W.fxLog.includes('sentry.focus') && m.taken.length >= 4 + 3, 'same target 4 hits in a row -> focus burst');
  ok(quietAll([m]), 'no global hit-stop');
  // target dies -> retarget the other
  const n = W.mon(3, 5); m.dead = true; W.run(1.6); ok(n.taken.length >= 1, 'dead target -> rescans to another enemy');
  // out of range -> no shots
  n.pos = { x: 30, y: 0, z: 30 }; const k = n.taken.length; W.run(1.5); ok(n.taken.length === k, 'out of range -> no shots');
  W.cast('en_a1', 1); W.cast('en_a1', 1); ok(W.kit.mine('sentry').length === 2 && s.dead && s.en.ended === 'replace', 'limit 2: oldest replaced');
  void c;
}
// ------------------------------------------------------------------ targeting priority: anchor focus > selected > nearest; anchor is owner-only
{ const W = world(), near = W.mon(0, 2.5), sel = W.mon(1.5, 4), foc = W.mon(-1, 6.5);
  W.cast('en_a1', 1, { aim: { x: 0, y: 0, z: 1 } }); const s = W.kit.mine('sentry')[0]; W.run(1.2);
  ok(s.en.tgt === near, 'no selection -> nearest');
  W.pc.target = sel; W.run(0.3); ok(s.en.tgt === sel, 'player selection beats nearest');
  W.cast('en_a4', 1, { aim: { x: -1, y: 0, z: 6.5 } }); W.run(0.9); const a = W.kit.anchor;
  ok(a && a.en.phase === 'on' && a.en.focus === foc && W.fxLog.includes('focus'), 'anchor: enemy in the triangle designated (+ ring)');
  W.run(0.3); ok(s.en.tgt === foc, 'anchor focus beats player selection');
  const W2 = world(), other = W2.mon(-1, 6.5); void other; ok(W2.kit.focus() === null, 'another engineer has no focus from this anchor (owner-only)');
}
// ------------------------------------------------------------------ A4 anchor: real triangle = damage area, slow, limit 1, walls pull electrodes in
{ const W = world(), inT = W.mon(0, 3), outT = W.mon(3.2, 3);
  W.cast('en_a4', 1, { aim: { x: 0, y: 0, z: 3 } }); const a = W.kit.anchor;
  ok(inTri(inT.pos, ...a.en.pts) && !inTri(outT.pos, ...a.en.pts), 'triangle test');
  W.run(1.3); ok(inT.taken.length >= 1 && !outT.taken.length && inT.status.has('slow'), 'inside: shock + slow, outside: nothing');
  ok(inT.taken[0].amount === 20, 'tick 20% (' + inT.taken[0].amount + ')');
  W.cast('en_a4', 1); ok(W.kit.mine('anchor').length === 1 && a.dead, 'limit 1');
  const W2 = world({ walls: [[2, -10, 9, 10]] }); W2.cast('en_a4', 1, { aim: { x: 0, y: 0, z: 3 } }); ok(W2.kit.anchor.en.pts.every(p => !W2.zone.geo.blocked(p.x, p.z, 0.3)), 'electrodes never inside walls');
}
// ------------------------------------------------------------------ A2 spider: chase limited, one blast, walls stop it
{ const W = world(), m = W.mon(0, 6);
  W.cast('en_a2', 1, { aim: { x: 0, y: 0, z: 4 } }); const s = W.kit.mine('spider')[0];
  W.run(0.8); ok(s.en.phase === 'chase' || s.en.phase === 'leap', 'enemy within 2.5 m -> chase'); W.run(1.0);
  ok(s.dead && m.taken.length === 1 && m.taken[0].amount === 320 && s.en.ended === 'spent', 'leaps and explodes once (320%)');
  const W2 = world(), far = W2.mon(0, 12); W2.cast('en_a2', 1, { aim: { x: 0, y: 0, z: 4 } }); W2.run(3); const sp = W2.kit.mine('spider')[0];
  ok(sp && sp.en.phase === 'idle' && !far.taken.length, 'enemy out of trigger -> waits');
  const W3 = world({ walls: [[-5, 5.2, 5, 5.6]] }), wm = W3.mon(0, 6.3); W3.cast('en_a2', 1, { aim: { x: 0, y: 0, z: 4 } }); W3.run(4); const s3 = W3.kit.mine('spider')[0];
  ok(s3 && !s3.dead && !wm.taken.length && s3.pos.z < 5.2, 'wall between -> cannot pass, gives up (no damage through walls)');
  const W4 = world(); for (let i = 0; i < 4; i++) W4.cast('en_a2', 1, { aim: { x: i * 3, y: 0, z: 4 } }); ok(W4.kit.mine('spider').length === 3, 'limit 3');
  ok(!s.takeDamage || (s.untargetable === true), 'mine is not a damage target');
}
// ------------------------------------------------------------------ A3 tri-wing: split damage, salvo, replace squad, smooth return
{ const W = world(), m = W.mon(0, 5);
  W.cast('en_a3', 1); const ds = W.kit.mine('drone'); ok(ds.length === 3 && ds.every(d => d.en.phase === 'wait'), '3 drones, ejected one by one');
  ok(Math.abs(ds.reduce((a, d) => a + d.en.cost, 0) - 3) < 1e-9, 'power cost shared 1/1/1');
  W.run(0.2); ok(ds[0].en.phase !== 'wait' && ds[2].en.phase === 'wait', 'staggered eject');
  W.run(2.6); const shots = m.taken.filter(h => !h.derived);
  ok(shots.length >= 5 && shots.every(h => h.amount === 35), 'each drone shot = 105% / 3 (35%)');
  W.run(1.0); ok(W.fxLog.includes('drone.align') && m.taken.some(h => h.amount === Math.round(35 * 1.5)), 'formation salvo x1.5');
  const total = sum(m) / 100, secs = 3.8 - 0.36; ok(total / secs < 2.6, 'squad dps ~2.1 coef/s, never 3x (' + (total / secs).toFixed(2) + ')');
  W.pc.pos = { x: 6, y: 0, z: 0 }; W.run(0.1); ok(ds[0].pos.x < 6, 'drones glide back (no teleport for short moves)'); W.run(2); ok(Math.abs(ds[0].pos.x - (6 - 1.5)) < 0.3, 'back in formation');
  W.cast('en_a3', 1); ok(ds.every(d => d.dead) && W.kit.mine('drone').length === 3, 'recast replaces the squad');
}
// ------------------------------------------------------------------ A5 walker: spot, assembly, phases, missile cap, one kick per cannon, fold
{ const W = world(), m = W.mon(0, 6);
  W.cast('en_a5', 1); const w = W.kit.mine('walker')[0];
  ok(w && Math.hypot(w.pos.x, w.pos.z - 2.4) < 0.01, 'core dropped 2.4 m ahead');
  W.run(EN.walker.drop + EN.walker.assemble - 0.05); ok(!m.taken.length && w.en.phase === 'assemble', 'no attack while assembling');
  W.run(EN.walker.cannonAt + 0.8); ok(m.taken.filter(h => h.amount === 40).length === 12, '12 gun rounds (40%)');
  const mis = m.taken.filter(h => h.amount === 140).length; ok(mis === 3, 'missiles on one target capped at 3 per salvo (' + mis + ')');
  ok(m.taken.some(h => h.amount === 500) && W.kicks.length === 1, 'main cannon 500% + one camera kick');
  ok(quietAll([m]), 'all walker damage quiet');
  W.run(20); ok(w.dead && w.en.ended === 'expire' && W.fxLog.includes('walker.fold'), 'folds up and leaves at the end');
  const W2 = world({ walls: [[-20, -20, 20, 20]] }); ok(W2.eng.en.validate(SK.en_a5) === '병기를 세울 자리가 없습니다', 'no free spot -> not cast');
}
// ------------------------------------------------------------------ B1 pile bunker
{ const W = world(), m = W.mon(0, 1.8), back = W.mon(0, 3.4), side = W.mon(2.5, 1.0);
  const c = W.cast('en_b1', 1, { tgt: m }); ok(W.fxLog.includes('pile'), 'arm device starts at the press');
  ok(m.taken.length === 1 && m.taken[0].amount === 340, 'one stake hit 340% (' + m.taken[0].amount + ')');
  ok(back.taken.length === 1 && back.taken[0].amount === 90 && back.taken[0].derived && !side.taken.length, 'shockwave cone behind the target only');
  ok(W.kicks.length === 1 && W.pc.freezeT > 0 && m.freezeT > 0, 'local stop + one kick');
  const W2 = world(), a = W2.mon(0, 2), b = W2.mon(0, 2); a.stat = (k) => k === 'def' ? 200 : 0; b.stat = a.stat;
  const r1 = W2.eng.dmg(b, 3.4, W2.ctx('en_b1'), { quiet: true }); W2.cast('en_b1', 1, { tgt: a }); ok(a.taken[0].amount > r1, 'armour pen 50% vs no pen');
  const W3 = world(), far = W3.mon(0, 6); W3.cast('en_b1', 1, { tgt: far }); ok(!far.taken.length && !W3.kicks.length, 'out of reach: nothing');
  void c;
}
// ------------------------------------------------------------------ B2 breach: distance falloff, stagger bounds, one hit each
{ const W = world(), near = W.mon(0, 1.2), far = W.mon(0.2, 5.0), boss = W.mon(-0.5, 2.0, { isBoss: true });
  W.cast('en_b2', 1); ok(near.taken.length === 1 && far.taken.length === 1 && boss.taken.length === 1, 'one hit per enemy');
  ok(near.taken[0].amount === Math.round(280 * 1.35) && far.taken[0].amount < near.taken[0].amount && far.taken[0].amount >= Math.round(280 * 0.65) - 1, 'closer = stronger (135% .. 65%)');
  const sn = near.status.get('stagger'), sf = far.status.get('stagger'); ok(sn && sf && sn.remaining > sf.remaining && sn.remaining <= 0.6 && sf.remaining >= 0.25, 'stagger 0.6 .. 0.25 s');
  ok(W.fxLog.includes('breach.fire') && W.pc.lunges[0] > 0, 'muzzle + recoil step');
}
// ------------------------------------------------------------------ B3 hive: sequential, retarget, fizzle, redline +2
{ const W = world(), m = W.mon(0, 6), n = W.mon(2, 7);
  const c = W.cast('en_b3', 1, { tgt: m }); W.run(0.2); ok(!m.taken.length, 'nothing before launch'); W.run(0.55);
  m.dead = true; W.run(2.5); ok(n.taken.length >= 1, 'target died -> remaining missiles retarget the nearest');
  ok(c.enLog.length === 6, '6 missiles resolved');
  const W2 = world(), x = W2.mon(0, 6); const c2 = W2.cast('en_b3', 1, { tgt: x }); W2.run(0.6); x.dead = true; W2.run(3);
  ok(c2.enLog.every(r => r.fizzle || r.hit != null) && c2.enLog.some(r => r.fizzle), 'no enemy left -> fizzle, no damage elsewhere');
  ok(W2.eng.res.power === 10, 'hive: power +1 (capped 10)');
  const W3 = world(), y = W3.mon(0, 6); W3.cast('en_c5', 1); const c3 = W3.cast('en_b3', 1, { tgt: y }); W3.run(3.5); ok(c3.enLog.length === 8, 'redline: +2 missiles');
}
// ------------------------------------------------------------------ B4 rail: direction locked at the press, one hit per enemy, cancel on death
{ const W = world(), a = W.mon(0, 3), b = W.mon(0.3, 12), off = W.mon(3, 5);
  const c = W.cast('en_b4', 1); W.pc.setFacing(1, 0); W.run(0.6); ok(!a.taken.length, 'no hit while charging');
  W.run(0.4); ok(a.taken.length === 1 && b.taken.length === 1 && !off.taken.length && a.taken[0].amount === 500, 'pierce: one 500% hit each, press direction');
  ok(W.kit.railed.has(a) && W.kit.railed.has(b) && !W.kicks.length, 'pierced enemies marked for orbital, no camera shake');
  const W2 = world(), z = W2.mon(0, 3); W2.cast('en_b4', 1); W2.pc.dead = true; W2.run(1.2); ok(!z.taken.length, 'caster dead before firing -> cancelled');
  void c;
}
// ------------------------------------------------------------------ B5 orbital: locks, telegraph = damage area, rail priority + bonus, core kick, cancel
{ const W = world(), a = W.mon(0, 6), b = W.mon(2, 6), r = W.mon(-2, 7);
  W.kit.railed.set(r, 99);
  const c = W.cast('en_b5', 1, { aim: { x: 0, y: 0, z: 6 } }); W.run(EN.orbital.lock0 + 0.01);
  ok(c.enLog.locks[0].t === r, 'railcannon-pierced enemy locked first');
  W.run(EN.orbital.first - EN.orbital.lock0); ok(r.taken.length === 1 && r.taken[0].amount === Math.round(220 * 1.2), 'precision strike 220% x rail bonus 1.2 (' + r.taken[0].amount + ')');
  W.run(1.2); ok(c.enLog.strikes.length === 3 && c.enLog.core >= 1 && W.kicks.length === 1, '3 strikes + core (one kick)');
  ok(a.taken.some(h => h.amount === 600), 'core 600% at Lv1');
  const W2 = world(), t = W2.mon(0, 6); W2.cast('en_b5', 1, { aim: { x: 0, y: 0, z: 6 } }); W2.run(0.5); t.pos = { x: 20, y: 0, z: 20 }; W2.run(2.3);
  ok(!t.taken.length, 'locked ring is the real area: moved out = no hit');
  const W3 = world(), u = W3.mon(0, 6); W3.cast('en_b5', 1, { aim: { x: 0, y: 0, z: 6 } }); W3.run(0.5); W3.eng.clearTemp(); W3.run(3); ok(!u.taken.length, 'zone change / death -> scheduled strikes cancelled');
}
// ------------------------------------------------------------------ C3 beacon: machines only, more when damaged, cap
{ const W = world();
  W.cast('en_a1', 1, { aim: { x: 0, y: 0, z: 1 } }); const s = W.kit.mine('sentry')[0];
  const living = { living: true, machine: false, dead: false, hp: 10, maxHp: 100, pos: { x: 0.5, y: 0, z: 0 } }; W.eng.summons.push(living);
  s.hp = s.maxHp * 0.2; const h0 = s.hp; W.cast('en_c3', 1); W.run(0.35);
  const gain = s.hp - h0; ok(gain > 0 && Math.abs(gain - s.maxHp * Math.min(0.09, 0.06 * (1 + 0.5 * 0.8))) < 1e-6, 'repair tick = 6% x (1 + 0.5 x missing), cap 9%');
  ok(living.hp === 10, 'living summons not repaired'); ok(W.fxLog.includes('beacon.weld') && W.pc.shield > 0, 'weld sparks on the tick + armour shield');
  s.hp = s.maxHp; W.run(3); ok(s.hp === s.maxHp, 'full HP -> no overheal');
  W.run(3); ok(!W.kit.beacon, 'beacon ends after 6 s');
  ok(W.kit.mine('beacon').length === 0, 'beacon uses no summon slot');
}
// ------------------------------------------------------------------ C4 recovery core: once per machine, <= cost, broken half, none for replace / clear / spent
{ const W = world({ learned: { en_c4: 1 } }), R = () => W.kit.log.refunds;
  W.cast('en_a1', 1, { aim: { x: 0, y: 0, z: 1 } }); const s = W.kit.mine('sentry')[0];
  W.run(21); ok(s.dead && R().length === 1 && Math.abs(R()[0].n - 0.6) < 1e-9 && R()[0].why === 'expire' && W.fxLog.includes('core'), 'expired: 30% of 2 power back + core visual');
  s.vanish(true); s.destroy(false); ok(R().length === 1, 'never twice for the same machine');
  W.cast('en_a1', 1); const t = W.kit.mine('sentry')[0]; W.eng.res.power = 0; t.takeDamage({ amount: 1e9 }); ok(R().length === 2 && Math.abs(R()[1].n - 0.3) < 1e-9 && Math.abs(W.eng.res.power - 0.3) < 1e-9, 'broken: half, credited once');
  W.cast('en_a1', 1); W.cast('en_a1', 1); W.cast('en_a1', 1); ok(R().length === 2, 'replaced: nothing');
  W.eng.clearTemp(); ok(R().length === 2, 'zone change / death clear: nothing');
  const W3 = world({ learned: { en_c4: 5 } }); W3.mon(0, 4.2); W3.cast('en_a2', 1, { aim: { x: 0, y: 0, z: 4 } }); W3.run(2); ok(!W3.kit.log.refunds.length, 'mine that exploded (spent): nothing');
  const W5 = world({ learned: { en_c4: 5 } }); W5.cast('en_a3', 1); W5.run(25); const r5 = W5.kit.log.refunds;
  ok(r5.length === 3 && r5.every(x => Math.abs(x.n - 0.7) < 1e-9), 'Lv5 70%: three drones, each 70% of its 1/3 share (never more than paid)');
}
// ------------------------------------------------------------------ C5 redline: machines only, minimum gap, exact restore, cooling, no bypass
{ const W = world();
  W.cast('en_a1', 1, { aim: { x: 0, y: 0, z: 1 } }); const s = W.kit.mine('sentry')[0];
  const base = W.kit.mods(s); ok(base.rate === 1 && base.dmg === 1, 'normal');
  W.cast('en_c5', 1); const on = W.kit.mods(s); ok(on.rate === 1.4 && Math.abs(on.dmg - 1.25) < 1e-9 && W.pc.status.has('overclock'), 'redline: +40% rate, +25% fire power');
  ok(W.kit.gap(0.25, s) === 0.22, 'minimum gap 0.22 s');
  ok(W.kit.mods({ machine: false, living: true }).rate === 1, 'living summons unaffected');
  ok(W.eng.en.validate(SK.en_c5) === '이미 과부하 중입니다', 'no recast while active');
  W.run(8.05); const cool = W.kit.mods(s); ok(cool.rate === 0.8 && Math.abs(cool.dmg - 0.8) < 1e-9 && W.pc.status.has('cooldown_heat'), 'cooling: -20% / -20%');
  ok(W.eng.en.validate(SK.en_c5) === '냉각 중에는 쓸 수 없습니다', 'cannot skip cooling by recasting');
  W.cast('en_a1', 1); const s2 = W.kit.mine('sentry').at(-1); ok(W.kit.mods(s2).rate === 0.8, 'resummoned machine still cools (no bypass)');
  W.eng.clearTemp(); ok(W.kit.heat() === -1, 'zone change does not reset cooling');
  W.run(4.1); const back = W.kit.mods(s2); ok(back.rate === 1 && back.dmg === 1 && W.kit.red === null, 'exactly restored');
  // module (C2): weapon mod applies to gun machines only, never stacks
  const W2 = world({ weapon: 'w_gun_pistol', gearMods: { w_gun_pistol: { mod: 'speed' } } }); W2.cast('en_a1', 1); W2.cast('en_a2', 1, { aim: { x: 3, y: 0, z: 3 } });
  const g = W2.kit.mine('sentry')[0], sp = W2.kit.mine('spider')[0];
  ok(W2.kit.mods(g).rate === 1.12 && W2.kit.mods(g).dmg === 0.95 && W2.kit.mods(sp).rate === 1, 'speed module on gun machines only');
  W2.pc.sheet.p.gearMods.w_gun_pistol = { mod: 'power' }; ok(Math.abs(W2.kit.mods(g).dmg - 1.1) < 1e-9, 'module swap replaces, never stacks');
}
// ------------------------------------------------------------------ cleanup: death / zone change
{ const W = world(), m = W.mon(0, 6);
  W.cast('en_a1', 1); W.cast('en_a3', 1); W.cast('en_a4', 1, { aim: { x: 0, y: 0, z: 6 } }); W.cast('en_c3', 1); W.cast('en_b4', 1); W.run(0.3);
  W.eng.clearTemp(); ok(!W.eng.summons.filter(s => !s.dead).length && !W.kit.anchor && !W.kit.beacon && !W.zone.actors.some(a => a.isSummon), 'clearTemp: machines / anchor / beacon gone');
  const n = m.taken.length; W.run(1.5); ok(m.taken.length === n, 'pending rail shot cancelled');
  const W2 = world(); W2.mon(0, 5); W2.cast('en_a1', 1); W2.run(0.5); W2.pc.dead = true; W2.run(0.05); ok(W2.kit.mine('sentry').length === 0, 'caster dead -> machines removed');
}
// ------------------------------------------------------------------ old save: learned levels / slots carry over
{ const files = {}; for (const n of ['config', 'levels', 'jobs', 'skills', 'skills2', 'items', 'monsters', 'quests', 'npcs', 'zones']) files[n] = JSON.parse(read('../assets/data/' + n + '.json'));
  const data = new GameData(files);
  const p0 = newProfile(data, '옛엔지니어', 'm'); p0.level = 45; p0.job = 'engineer';
  p0.sk = { v: 1, points: 4, granted: [], learned: { en_a1: 5, en_a3: 2, en_b2: 3, en_b4: 1, en_a5: 1, en_c1: 3, en_c4: 2, en_c5: 1 }, slots: ['en_a1', 'en_b2', 'en_b4', 'en_a5'], cds: {}, npoints: 0, ngranted: [] };
  const learned = JSON.stringify(p0.sk.learned); const ch = new CharacterSheet(data, migrate(JSON.parse(JSON.stringify(p0))));
  ok(JSON.stringify(ch.book.sk.learned) === learned && ch.book.sk.slots.join() === 'en_a1,en_b2,en_b4,en_a5', 'old save: learned levels + slots unchanged');
}
console.log(`engineer: ${pass} passed`);
