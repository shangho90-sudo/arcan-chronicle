// 음악가 2차 스킬(2026-11-16 '마에스트로') 규칙을 WebGL 없이 확인: 데이터(id·레벨·종류·기력·재사용·사거리·시전 시간 그대로, 동작·준비 시각·아이콘),
// 예전 저장, 악절(시전당 1번·상한 8·메아리/파생 X·코다 확정 순간 한 번 소비·시전 중 얻은 것 제외·악절 0 기본 피해), A1 관통 적마다 1번·하프 사거리,
// A2 공격력 감소·일반 적 경직·보스 면역, A3 같은 대상 4연속 = 예전 총합·대상 사망 후 연속 기록 새로, A4 터지기 전 약화 기록·추가 파동 적마다 1번,
// 지속 선율 하나만·전환 시 능력치 즉시 복원·강화 큰 쪽만·강화 끝나면 기본값·같은 선율은 시간만, 청음 보너스(대기 1회·같은 선율 X·6초),
// 메아리(절반·악절 X·다시 메아리 X·사망 취소), 공명 하프(곱하지 않음·반경 밖 X), 팬텀 트리오(교체·초당 피해·대상 재탐색·생명/기계 아님),
// 앙코르·심포니(선율 없어도 회복·보호막, 강화 max), 코랄 피격 떨림, 정리(사망·지역 이동).
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { HitShape, CombatMath, StatusSet, clamp, clamp01 } from '../js/core.js';
import { ensureSk } from '../js/skillsys.js';
import { skillSound } from '../js/sfx.js';
import { SmithKit, clearLine } from '../js/smith.js';
import { MusicKit, MuTrio, MU, segDist, cresStep, codaTake, boostOf, muText } from '../js/musician.js';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const S2 = JSON.parse(read('../assets/data/skills2.json')), skills = S2.skills, SK = Object.fromEntries(skills.map(s => [s.id, s]));
const STATUS = Object.fromEntries(S2.statuses.map(s => [s.id, s]));
const actions = Object.fromEntries(JSON.parse(read('../assets/models/actions.json')).map(a => [a.name, a]));
const sandbox = { HitShape, CombatMath, clamp, clamp01, skillSound, SmithKit, clearLine, MusicKit, console };
vm.createContext(sandbox);
vm.runInContext(read('../js/skillrt.js').replace(/^import .*;\n/gm, '').replace(/\bexport /g, '') + '\nthis.api={SkillEngine,bindSkillRt,FX,CUSTOM};', sandbox);
const { SkillEngine, bindSkillRt, FX, CUSTOM } = sandbox.api;
Math.random = () => 0.5;   // 피해 = 100 × 계수 × mult (마법력 100, 방어 0, 치명 0)
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; };
const near = (a, b, e = 1.5) => Math.abs(a - b) <= e;

// ------------------------------------------------------------------ data (예전 값 그대로)
const OLD = { a1: [30, 'attack', 18, 4, 10, 0, 'dir'], a2: [33, 'attack', 22, 8, 3.2, 0, 'self'], a3: [36, 'attack', 22, 7, 8, 0, 'enemy'], a4: [40, 'attack', 24, 8, 8, 0, 'enemy'], a5: [45, 'ultimate', 60, 60, 2, 0.7, 'self'],
  b1: [30, 'support', 20, 6, 2, 0, 'self'], b2: [33, 'support', 20, 6, 2, 0, 'self'], b3: [36, 'support', 20, 6, 2, 0, 'self'], b4: [40, 'support', 0, 6, 2, 0, 'self'], b5: [45, 'ultimate', 60, 70, 2, 0.5, 'self'],
  c1: [30, 'support', 14, 12, 2, 0, 'self'], c2: [33, 'summon', 22, 18, 5, 0, 'ground'], c3: [36, 'summon', 28, 20, 6, 0, 'ground'], c4: [40, 'passive', 0, 0, 2, 0, 'self'], c5: [45, 'ultimate', 75, 75, 2, 0.6, 'self'] };
const mu = skills.filter(s => s.job === 'musician');
ok(mu.length === 15, '15 musician skills');
for (const [k, [un, ty, mp, cd, rg, cast, tg]] of Object.entries(OLD)) { const d = SK['mu_' + k];
  ok(d && d.unlock === un && d.type === ty && d.maxLv === (ty === 'ultimate' ? 3 : 5) && d.tier === 2 && d.mp === mp && d.cd === cd && d.range === rg && (d.cast || 0) === cast && d.target === tg, 'kept id/unlock/type/mp/cd/range/cast mu_' + k); }
ok(['전장의 협주곡', '생명을 잇는 선율', '환영 오케스트라'].every((n, i) => mu.filter(s => s.cat === i).length === 5 && mu.filter(s => s.cat === i).every(s => s.catName === n)), 'line titles A/B/C, 3x5');
for (const d of mu) if (d.anim) { const a = actions[d.anim]; ok(a && a.stow, 'motion ' + d.anim + ' (brush on the back)'); }
for (const d of mu) { const pre = d.ops.find(o => o.k === 'pre'); if (pre) ok(Math.abs(-pre.at - actions[d.anim].hitT) < 1e-6 && actions[d.anim].hitT <= 0.35, 'pre op at the press ' + d.id); }
for (const id of ['mu_a5', 'mu_c5']) { const d = SK[id], o = d.ops.find(x => x.fn === 'mu'), keys = actions[d.anim].keys; for (const t of o.at_) ok(keys.some(k => Math.abs(k - (d.cast + t)) < 1e-3), `${id}: baton comes down at cast + ${t} s`); }
ok(Math.abs(actions.mu_bow.strokes[1] - actions.mu_bow.strokes[0] - SK.mu_a3.ops.find(o => o.k === 'a3').gap) < 1e-6 && Math.abs(actions.mu_bow.hitT - actions.mu_bow.strokes[0]) < 1e-6, 'a3: a wave per bow stroke');
for (const d of mu) ok(d.desc.length > 30 && /[가-힣]/.test(d.name), 'Korean name/desc ' + d.id);
for (const d of mu) if (d.type !== 'passive') ok(muText(d, 1, { phrase: 3 }).length > 8, 'tooltip ' + d.id);
ok(muText(SK.mu_c4, 1).includes('25%'), 'c4 tooltip from flags');
if (!process.env.NOICON) for (const d of mu) { const p = new URL(`../assets/ui/skills/${d.id}.png`, import.meta.url); ok(existsSync(p) && readFileSync(p).length > 1500, 'icon ' + d.id); }

// ------------------------------------------------------------------ old save: levels / points / slots kept
{ const data = { skill2: id => SK[id] };
  const p = { sk: { points: 2, learned: { mu_a1: 4, mu_b2: 3, mu_c3: 1, mu_a5: 2 }, slots: ['mu_a1', 'mu_b2', 'mu_c3', 'mu_a5'] } };
  const sk = ensureSk(p, data);
  ok(sk.points === 2 && sk.learned.mu_a1 === 4 && sk.learned.mu_b2 === 3 && sk.learned.mu_c3 === 1 && sk.learned.mu_a5 === 2, 'old save: levels + points kept');
  ok(sk.slots.join() === 'mu_a1,mu_b2,mu_c3,mu_a5', 'old save: slots kept'); }

// ------------------------------------------------------------------ pure helpers
ok(near(segDist({ x: 0, z: 2 }, { x: 0, z: 0 }, { x: 0, z: 5 }), 0, 1e-9) && near(segDist({ x: 1, z: 7 }, { x: 0, z: 0 }, { x: 0, z: 5 }), Math.hypot(1, 2), 1e-9), 'segment distance');
{ const r = { t: null, n: 0 }, A = {}, B = {}; cresStep(r, A, false, 0.35); cresStep(r, A, false, 0.35); cresStep(r, A, false, 0.35);
  ok(near(cresStep(r, A, true, 0.35), 2.4, 1e-9), 'crescendo: 4 in a row on the same target = x2.4 (old total)');
  const r2 = { t: null, n: 0 }; cresStep(r2, A, false, 0.35); cresStep(r2, A, false, 0.35); ok(cresStep(r2, B, true, 0.35) === 1, 'crescendo: a new target gets no inherited bonus'); }
ok(codaTake(5, 7, 8) === 5 && codaTake(9, 9, 8) === 8 && codaTake(3, 1, 8) === 1 && codaTake(undefined, 4.6, 8) === 4, 'coda takes min(press, release), cap 8');
ok(boostOf([{ mul: 0.6, t: 3 }, { mul: 0.5, t: 5 }]) === 0.6 && boostOf([{ mul: 0.6, t: 0 }, { mul: 0.5, t: 5 }]) === 0.5, 'boost: the stronger one only');

// ------------------------------------------------------------------ engine harness
function world(o = {}) {
  const sounds = [], kicks = [], fxLog = [], ducks = [];
  for (const k of Object.keys(FX).filter(k => k !== 'on')) FX[k] = () => ({ set() {}, dispose() {}, end() {}, pulse() {} });
  const handle = (kind) => new Proxy({ kind }, { get: (t, m) => m in t ? t[m] : (...a) => { fxLog.push(kind + '.' + String(m)); return undefined; } });
  FX.music = (kind) => { fxLog.push(kind); return handle(kind); };
  const learned = Object.assign({}, o.learned || {});
  const pas = o.passive || {};
  const book = { sk: { slots: mu.filter(x => x.type !== 'passive').map(x => x.id) }, level: id => learned[id] || 1, usable: () => true, passive: k => pas[k] || 0 };
  const geo = { ground: (x, z) => ({ x, y: 0, z }), blocked: o.blocked || (() => false) };
  const actors = [];
  const pc = { pos: { x: 0, y: 0, z: 0 }, facing: { x: 0, z: 1 }, faction: 'player', skills: { lock: 0, busy: false }, body: { sh: { actions }, play() {} }, hp: 400, maxHp: 1000, sp: 100, maxSp: 500, dead: false,
    sheet: { p: { sk: {}, job: 'musician' }, book, job: { id: 'musician', parent: 'artist' }, final: { healPower: 0, shieldPower: 0 } }, status: new StatusSet(),
    stat(k) { return k === 'atk' || k === 'matk' ? 100 : k === 'critDmg' ? 1.5 : 0; },
    setFacing(x, z) { const m = Math.hypot(x, z) || 1; this.facing = { x: x / m, z: z / m }; }, zone: { actors, geo, def: { portals: [] }, nearestEnemy: () => actors.find(a => !a.dead && !a.isSummon) }, dist(t) { return Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z); },
    startLunge() {}, shield: 0, addShield(v, d) { this.shield = Math.max(this.shield, v); this.shieldT = d; }, heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); } };
  const eng = new SkillEngine(pc); pc.skills2 = eng;
  bindSkillRt({ audio: { sfx: n => sounds.push(n), duck: k => ducks.push(k) }, render: { kick: (...a) => kicks.push(a), addShake() { throw new Error('no random shake'); } }, hitStop() { throw new Error('no global hit-stop'); }, ui: { floatText() {}, toast() {} },
    data: { status: id => STATUS[id], skill2: id => SK[id], config: {}, item: () => null, job: () => ({ id: 'musician', tier: 2 }) } });
  const mon = (x, z, extra = {}) => { const m = { pos: { x, y: 0, z }, radius: 0.5, hp: 1e6, maxHp: 1e6, dead: false, zone: pc.zone, faction: 'monster', status: new StatusSet(), stat: () => 0, taken: [],
      takeDamage(hd) { this.taken.push(hd); this.hp -= hd.amount; if (this.hp <= 0) this.dead = true; }, ...extra }; actors.push(m); return m; };
  const ctx = (id, L = 1, more = {}) => ({ d: SK[id], id, L, grade: 1, mult: 1 + (SK[id].type === 'ultimate' ? 0.25 : 0.12) * (L - 1), origin: { ...pc.pos }, facing: { ...pc.facing }, aim: { x: 0, y: 0, z: 3 }, hitOnce: new Set(), ...more });
  const op = (id) => SK[id].ops.find(x => x.fn === 'mu' && x.k !== 'pre');
  const cast = (id, L = 1, more = {}) => { const c = ctx(id, L, more); CUSTOM.mu(eng, op(id), c); return c; };
  const run = (sec, dt = 0.02) => { for (let i = 0; i < Math.round(sec / dt); i++) { eng.tick(dt); for (const a of actors.slice()) if (a.isSummon && a.update) a.update(dt); } };
  const sum = (m, from = 0) => m.taken.slice(from).reduce((a, h) => a + h.amount, 0);
  return { pc, eng, kit: eng.music, mon, ctx, op, cast, run, sum, sounds, kicks, fxLog, actors, ducks, pas };
}

// A1 스트링 피어스: 직선 관통, 적마다 1번, 악절 1(여러 적이어도)
{ const W = world(); const a = W.mon(0, 3), b = W.mon(0.3, 6), c = W.mon(0, 9.6), side = W.mon(3, 4);
  W.cast('mu_a1'); W.run(1);
  ok(W.sum(a) === 180 && W.sum(b) === 180 && W.sum(c) === 180 && a.taken.length === 1, 'a1: pierces every enemy on the line once (180%)');
  ok(side.taken.length === 0, 'a1: off the line = no hit');
  ok(near(W.eng.res.phrase, 1, 1e-9), 'a1: one phrase per cast even with 3 hits');
  ok(W.kicks.length === 0, 'a1: no camera kick on a normal hit');
  const W2 = world(), far = W2.mon(0, 12.5); W2.cast('mu_a1'); W2.run(1.2); ok(far.taken.length === 0, 'a1: 10 m range');
  W2.cast('mu_c2'); W2.kit.harp.c = { x: 0, y: 0, z: 0 }; W2.run(0.6); W2.cast('mu_a1'); W2.run(1.2); ok(far.taken.length === 1, 'a1: resonance harp extends the range (x1.35)');
  const h2 = W2.kit.harp; W2.cast('mu_c2'); ok(h2.dead && W2.kit.harp !== h2, 'c2: one harp — a new one replaces the old');
  W2.kit.harp.c = { x: 0, y: 0, z: 0 }; W2.run(0.6); ok(near(W2.kit.ampK(), 1.35, 1e-9), 'c2: amp x1.35 (not multiplied)');
  W2.pc.pos = { x: 20, y: 0, z: 0 }; ok(W2.kit.ampK() === 1, 'c2: outside the harp = no amp'); }

// A2 디스코드 브레이크: 공격력 감소 + 일반 적 경직, 보스는 경직 면역
{ const W = world(); const a = W.mon(1.5, 0), boss = W.mon(-1.5, 0, { isBoss: true }), far = W.mon(5, 0);
  W.cast('mu_a2'); W.run(0.1);
  ok(W.sum(a) === 180 && W.sum(boss) === 180 && far.taken.length === 0, 'a2: one hit 180% in 3.2 m');
  ok(a.status.has('atkdown') && boss.status.has('atkdown') && a.status.has('stagger') && !boss.status.has('stagger'), 'a2: attack down on all, stagger only on normal enemies');
  ok(near(W.eng.res.phrase, 1, 1e-9) && W.kicks.length === 1, 'a2: one phrase, one kick on landing'); }

// A3 크레셴도 러시: 같은 대상 4연속 = 예전 총합 4.32, 대상이 죽으면 새 대상은 보너스 없음
{ const W = world(); const t = W.mon(0, 4); W.cast('mu_a3', 1, { tgt: t }); W.run(2);
  ok(t.taken.length === 4 && W.sum(t) === 80 * 3 + 192, 'a3: 4 waves, last x2.4 on 4 in a row (total 432 = old)');
  ok(near(W.eng.res.phrase, 1, 1e-9), 'a3: one phrase per cast');
  const W2 = world(); const t1 = W2.mon(0, 4, { hp: 50, maxHp: 50 }), t2 = W2.mon(1, 5); W2.cast('mu_a3', 1, { tgt: t1 }); W2.run(2);
  ok(t1.dead && t2.taken.length >= 2 && t2.taken.every(h => h.amount === 80 || h.amount === Math.round(80 * (1 + 0.35 * t2.taken.length))), 'a3: after the target dies the rest go to the next enemy');
  ok(t2.taken.length === 3 && t2.taken[2].amount === Math.round(80 * (1 + 0.35 * 3)), 'a3: streak restarts on the new target (3 in a row -> x2.05, not x2.4)'); }

// A4 레조넌스 버스트: 터지기 직전 공격력 감소 기록 -> 추가 파동, 적마다 1번
{ const W = world(); const t = W.mon(0, 5), w = W.mon(1.2, 5), x = W.mon(-1.2, 5);
  W.kit.apply(w, 'atkdown', 5, 0.2); W.kit.apply(t, 'atkdown', 5, 0.2);
  W.cast('mu_a4', 1, { tgt: t }); W.run(0.1); ok(t.taken.length === 0, 'a4: pressure gathers before the burst');
  W.run(0.5);
  ok(W.sum(t) === 240 + 140 && W.sum(w) === 240 + 140 && W.sum(x) === 240 + 140, 'a4: burst 240% + one reaction wave 140% per enemy (two weak enemies, no double)');
  ok(W.kit.log.a4.weak === 2 && near(W.eng.res.phrase, 1, 1e-9), 'a4: two weakened enemies recorded, one phrase');
  const W2 = world(); const n = W2.mon(0, 5); W2.cast('mu_a4', 1, { tgt: n }); W2.run(0.6); ok(W2.sum(n) === 240, 'a4: not weakened = no extra wave');
  // 디스코드 -> 레조넌스 연계
  const W3 = world(); const e = W3.mon(0, 1.5); W3.cast('mu_a2'); W3.run(0.1); const b0 = e.taken.length; W3.cast('mu_a4', 1, { tgt: e }); W3.run(0.6); ok(W3.sum(e, b0) === 380, 'a2 -> a4: discord makes resonance add its extra wave'); }

// A5 코다: 확정 순간 한 번 소비, 시전 중 얻은 악절 제외, 악절 0 기본 피해
{ const W = world(); const t = W.mon(0, 3); W.eng.res.phrase = 5;
  const c = W.ctx('mu_a5'); W.kit.onCast(SK.mu_a5, c); W.eng.res.phrase = 6.5;   // 시전 중 +1.5
  CUSTOM.mu(W.eng, W.op('mu_a5'), c);
  ok(near(W.eng.res.phrase, 1.5, 1e-9), 'a5: 5 consumed at release, the 1.5 gained during the cast stays');
  W.run(1.9); const tot = 400 * (1 + 0.35 * 5);
  ok(near(W.sum(t), tot, 3) && t.taken.length === 4, 'a5: strings/perc/brass/tutti = 4.0 x (1 + 0.35 x 5) total');
  ok(near(t.taken[3].amount, tot * 0.5, 1) && W.kicks.length === 1, 'a5: tutti 50 %, one kick');
  ok(W.ducks[0] === MU.duck && W.ducks[W.ducks.length - 1] === 1, 'a5: BGM ducked during the cast and restored');
  const W2 = world(); const u = W2.mon(0, 3); const c2 = W2.ctx('mu_a5'); W2.kit.onCast(SK.mu_a5, c2); CUSTOM.mu(W2.eng, W2.op('mu_a5'), c2); W2.run(1.6);
  ok(near(W2.sum(u), 400, 2), 'a5: no phrase -> base 400%');
  const W3 = world(); const v = W3.mon(0, 3); W3.eng.res.phrase = 8; const c3 = W3.ctx('mu_a5'); W3.kit.onCast(SK.mu_a5, c3); CUSTOM.mu(W3.eng, W3.op('mu_a5'), c3); W3.run(1.6);
  ok(near(W3.sum(v), 400 * 3.8, 3) && W3.eng.res.phrase === 0, 'a5: cap 8 (x3.8 = old max)');
  ok(near(W3.kit.log.phrase.length, 0, 0), 'a5: the coda grants no phrase'); }

// phrase cap 8
{ const W = world(); W.eng.res.phrase = 7.6; W.mon(0, 3); W.cast('mu_a1'); W.run(1); ok(W.eng.res.phrase === 8, 'phrase capped at 8'); }

// 지속 선율: 하나만, 전환 시 즉시 복원, 강화 큰 쪽만, 끝나면 기본값
{ const W = world(); const pc = W.pc;
  W.cast('mu_b2'); W.run(0.1); ok(near(pc.status.get('haste').value, 0.12, 1e-9) && near(pc.status.get('atkup').value, 0.15, 1e-9), 'b2: atk +15 % / speed +12 %');
  W.cast('mu_b3'); ok(!pc.status.has('atkup') && !pc.status.has('haste') && near(pc.status.get('dmgreduce').value, 0.15, 1e-9) && pc.status.flag('ccres') === 0.5, 'switch b2 -> b3: march stats gone in the same frame, coral on');
  ok(W.eng.melody && W.eng.melody.id === 'coral' && W.eng.melody.mu, 'one melody (engine.melody = coral)');
  for (let i = 0; i < 5; i++) { W.cast('mu_b2'); W.cast('mu_b3'); } W.run(0.1); ok(near(pc.status.get('dmgreduce').value, 0.15, 1e-9), 'repeated switching does not stack');
  pc.status.apply(STATUS.atkup, 30, 0.3); W.cast('mu_b2'); W.run(0.05); W.cast('mu_b1'); ok(near(pc.status.get('atkup').value, 0.3, 1e-9), "another source's atkup is kept when the melody ends");
  pc.status.remove('atkup');
  W.cast('mu_b2'); W.run(0.05);
  CUSTOM.mu(W.eng, W.op('mu_b5'), W.ctx('mu_b5')); W.run(0.05); ok(near(pc.status.get('atkup').value, 0.15 * 1.6, 1e-9), 'encore: melody x1.6');
  CUSTOM.mu(W.eng, W.op('mu_c5'), W.ctx('mu_c5')); W.run(0.05); ok(near(pc.status.get('atkup').value, 0.15 * 1.6, 1e-9), 'symphony + encore: the stronger only (not x1.6 x1.5)');
  W.cast('mu_b4'); W.cast('mu_b2'); W.run(0.05); ok(near(pc.status.get('atkup').value, 0.15 * 1.6, 1e-9), 'boost carries over a switch (remaining time)');
  W.run(12.1); ok(near(pc.status.get('atkup').value, 0.15, 1e-9), 'boosts over -> exact base value again (no lingering max)');
  W.cast('mu_b2'); ok(W.eng.melody.t > 19.9, 'same melody = refreshed only');
  W.run(20.1); ok(!W.eng.melody && !pc.status.has('atkup') && !pc.status.has('haste'), 'melody ends after 20 s and its stats go');
  CUSTOM.mu(W.eng, W.op('mu_b5'), W.ctx('mu_b5')); ok(W.kit.boosts.length === 0, 'encore without a melody: no boost');
  ok(pc.shield === Math.round(80 + 1.8 * 100) && pc.hp > 400, 'encore: heal + shield even without a melody'); }

// 아리아 회복(나 + 6 m 생명 소환물, 기계 제외), 세레나데 기력
{ const W = world(); const pc = W.pc; pc.hp = 100;
  const liv = { pos: { x: 2, z: 0 }, living: true, hp: 10, maxHp: 100, dead: false }, mach = { pos: { x: 1, z: 0 }, machine: true, hp: 10, maxHp: 100, dead: false }, far = { pos: { x: 9, z: 0 }, living: true, hp: 10, maxHp: 100, dead: false };
  W.eng.summons.push(liv, mach, far); W.cast('mu_b1'); W.run(3.05);
  ok(near(pc.hp, 100 + 3 * 12, 0.5) && near(liv.hp, 10 + 3 * 1.2, 0.01) && mach.hp === 10 && far.hp === 10, 'b1: 1.2 %/s to me + living summons within 6 m only');
  W.eng.summons.length = 0; W.cast('mu_b4'); pc.sp = 100; W.run(2.05); ok(near(pc.sp, 100 + 2 * 10, 0.01), 'b4: 2 % max SP per second'); }

// 청음: 다른 선율로 바꾸면 다음 공격 선율 1회 +20 %, 같은 선율 X, 6초에 한 번, 쌓이지 않음
{ const W = world({ passive: { switchBonus: 0.2 } }); const t = W.mon(0, 3);
  W.cast('mu_b2'); W.cast('mu_b2'); ok(!W.kit.switchArm, 'clock: first melody / same melody = no bonus');
  W.cast('mu_b3'); ok(W.kit.switchArm, 'switch to another melody arms the bonus');
  W.cast('mu_b2'); ok(W.kit.log.switchArm === 1, 'within 6 s no second arming (no stack)');
  W.pc.status.list = W.pc.status.list.filter(s => s._mu);
  W.cast('mu_a1'); W.run(1); const a1 = t.taken[0].amount; W.cast('mu_a1'); W.run(1);
  ok(near(a1, 180 * 1.2 * 1, 2) && t.taken[1].amount === 180, 'bonus once: +20 % on the next attack melody, then normal (march atkup is a stat, not in this harness)'); }

// 메아리: 절반 위력, 악절 없음, 다시 메아리치지 않음, 사망 취소
{ const W = world(); const t = W.mon(0, 3); W.cast('mu_c1'); ok(W.pc.status.has('echo'), 'c1: echo armed');
  W.cast('mu_a1'); W.run(1.5); ok(t.taken.length === 2 && t.taken[1].amount === 90, 'echo: replayed once at 50 %');
  ok(near(W.eng.res.phrase, 1, 1e-9) && !W.pc.status.has('echo') && W.kit.log.echo === 1, 'echo: no extra phrase, consumed');
  W.cast('mu_a1'); W.run(1.5); ok(t.taken.length === 3, 'echo does not echo again');
  const W2 = world(); const u = W2.mon(0, 3); W2.cast('mu_c1'); W2.cast('mu_a2'); W2.pc.dead = true; W2.run(0.5); W2.pc.dead = false; W2.run(0.5); ok(u.taken.length === 1, 'echo cancelled when the caster dies');
  const W3 = world(); W3.cast('mu_c1'); W3.cast('mu_b2'); ok(W3.pc.status.has('echo'), 'echo only copies attack melodies (not melodies)');
  const W4 = world(); const x = W4.mon(0, 4); W4.cast('mu_c1'); W4.eng.clearTemp(); ok(!W4.pc.status.has('echo'), 'zone change clears the echo'); void x; }

// 팬텀 트리오: 하나만(교체), 생명·기계 아님, 초당 1.33, 대상 사망 시 재탐색
{ const W = world(); const t = W.mon(0, 5), u = W.mon(2, 6);
  const c = W.ctx('mu_c3', 1, { aim: { x: 0, y: 0, z: 2 } }); CUSTOM.mu(W.eng, W.op('mu_c3'), c); const s = W.eng.summons[0];
  ok(s instanceof MuTrio && !s.living && !s.machine && s.music, 'c3: music summon (not living, not machine)');
  W.pc.target = t; W.run(0.75 + 8 * 0.45 + 0.25);
  if (process.env.DBG) console.log(s.log, s.age, s.cd);
  ok(s.log.notes === 9 && s.log.chords === 1 && s.log.parts.join() === '3,3,3', 'c3: violin/cello/flute in turn, chord after 3 rounds');
  ok(near(W.sum(t), 9 * 50 + 90, 1), 'c3: 9 x 50 % + chord 90 % (1.33/s like before)');
  t.dead = true; t.hp = 0; W.pc.target = null; W.run(1.0); ok(u.taken.length >= 2, 'c3: target died -> next enemy');
  const c2 = W.ctx('mu_c3', 1, { aim: { x: 0, y: 0, z: 2 } }); CUSTOM.mu(W.eng, W.op('mu_c3'), c2); W.run(0.02);
  ok(s.dead && W.eng.summons.filter(x => !x.dead && x.kind === 'phantom_trio').length === 1, 'c3: recast replaces the trio');
  const s2 = W.eng.summons.find(x => !x.dead); W.run(15.2 - 0.02); ok(s2.dead, 'c3: lasts 15 s');
  const W2 = world(); W2.mon(0, 5); CUSTOM.mu(W2.eng, W2.op('mu_c3'), W2.ctx('mu_c3')); W2.pc.pos = { x: 30, y: 0, z: 0 }; W2.run(0.1); ok(W2.eng.summons[0].log.regroup === 1, 'c3: regroups behind the owner when far'); }

// 심포니: 10 x 0.9 + 합주 5.0, 선율 강화 0.5 (선율 없으면 없음)
{ const W = world(); const t = W.mon(0, 3); W.eng.res.phrase = 0;
  CUSTOM.mu(W.eng, W.op('mu_c5'), W.ctx('mu_c5')); W.run(2.2);
  ok(t.taken.length === 11 && near(W.sum(t), 10 * 90 + 500, 2), 'c5: 10 orchestra hits x 90 % + tutti 500 %');
  ok(W.kit.log.sym.hits.map(h => h.part).join() === 'strings,strings,strings,strings,brass,brass,brass,perc,perc,perc', 'c5: strings -> brass -> percussion');
  ok(near(W.eng.res.phrase, 1, 1e-9) && W.kit.boosts.length === 0 && W.kicks.length === 1, 'c5: one phrase, no boost without a melody, one kick on the tutti');
  const W2 = world(); const a = W2.mon(0, 3), b = W2.mon(1, 4); CUSTOM.mu(W2.eng, W2.op('mu_c5'), W2.ctx('mu_c5')); W2.run(1.7);
  ok(Math.abs(a.taken.length - b.taken.length) <= 1, 'c5: orchestra spreads its hits'); }

// 코랄 피격 떨림 + 정리
{ const W = world(); W.cast('mu_b3'); W.kit.onPlayerHit({ source: { pos: { x: 3, z: 0 } }, amount: 10 }); ok(W.fxLog.includes('melody.flinch'), 'b3: the hit side string trembles');
  W.kit.onPlayerHit({ dot: true }); W.cast('mu_c2'); W.cast('mu_c1');
  const t = W.mon(0, 4); W.cast('mu_a3', 1, { tgt: t }); W.eng.clearTemp();
  ok(!W.eng.melody && !W.kit.harp && W.kit.timers.length === 0 && W.kit.things.length === 0 && !W.pc.status.has('dmgreduce'), 'clearTemp: melody, harp, waves, timers gone');
  W.run(1); ok(t.taken.length === 0, 'no scheduled damage after the zone change'); }

console.log(`musician: ${pass} passed`);
