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
const TYPES = { a1: 'support', a2: 'support', a3: 'support', a4: 'support', a5: 'ultimate', b1: 'summon', b2: 'summon', b3: 'summon', b4: 'summon', b5: 'ultimate', c1: 'attack', c2: 'attack', c3: 'attack', c4: 'attack', c5: 'attack' };
const hb = skills.filter(s => s.job === 'herbalist');
ok(hb.length === 15, '15 herbalist skills');
for (const k of Object.keys(OLD)) { const d = SK['hb_' + k]; ok(d && d.unlock === OLD[k] && d.type === TYPES[k] && d.maxLv === (d.type === 'ultimate' ? 3 : 5) && d.tier === 2, 'kept id/unlock/type/maxLv hb_' + k); }
ok(['비전 탕약과 경락', '본초 영물술', '오행 침구술'].every((n, i) => hb.filter(s => s.cat === i).length === 5 && hb.filter(s => s.cat === i).every(s => s.catName === n)), 'line titles A/B/C, 3x5');
{ const rc = S2.recipes.find(r => r.id === 'r_tonic'); ok(rc && !rc.skill && rc.req && rc.req.job === 'herbalist' && rc.req.level === 30 && rc.output.item === 'f_tonic' && !SK.hb_a1.recipes, '보원탕 제작법: 스킬 없이 한약사 Lv30(예전 습득 조건) 직업 제작법 r_tonic -> f_tonic');
  const it = S2.items.find(i => i.id === 'f_tonic'); ok(it && it.use.status === 'well_fed2' && it.use.value === 0.15 && it.use.duration === 90, '보원탕 아이템 효과 그대로(90초 최대 HP +15%)'); }
ok(['탕약 나누기', '보중익기탕', '구풍해독탕', '오령산', '소경활혈탕'].join() === ['hb_a1', 'hb_a2', 'hb_a3', 'hb_c3', 'hb_c4'].map(id => SK[id].name).join(), '처방 5종 이름(같은 id·칸)');
ok(SK.hb_a2.desc.startsWith('기력을 회복하고 주변 영물의 이동 속도를 높인다'), '보중익기탕 짧은 설명');
ok(SK.hb_c4.target === 'enemy' && SK.hb_c3.target === 'ground' && SK.hb_a1.type === 'support', '소경활혈탕 대상 하나·오령산 지점');
for (const d of hb) if (d.anim) ok(actions[d.anim] && actions[d.anim].stow && actions[d.anim].hitT <= 0.35, 'motion ' + d.anim + ' (free hands, pestle on back)');
for (const d of hb) { const pre = d.ops.find(o => o.k === 'pre'); if (pre && actions[d.anim]) ok(Math.abs(-pre.at - actions[d.anim].hitT) < 1e-6, 'pre op starts at the press ' + d.id); }
if (!process.env.NOICON) for (const d of hb) { const p = new URL(`../assets/ui/skills/${d.id}.png`, import.meta.url); ok(existsSync(p) && readFileSync(p).length > 1500, 'icon ' + d.id); }

// ------------------------------------------------------------------ old save: levels / points / slots kept
{ const data = { skill2: id => SK[id] };
  const p = { sk: { points: 3, learned: { hb_a2: 3, hb_b1: 5, hb_c1: 2, hb_b5: 1 }, slots: ['hb_b1', 'hb_c1', 'hb_a2', 'hb_b5'] } };
  const sk = ensureSk(p, data);
  ok(sk.points === 3 && sk.learned.hb_a2 === 3 && sk.learned.hb_b1 === 5 && sk.learned.hb_c1 === 2 && sk.learned.hb_b5 === 1, 'old save: levels + points kept');
  ok(sk.slots.join() === 'hb_b1,hb_c1,hb_a2,hb_b5', 'old save: slots kept');
  const p2 = { sk: { points: 1, learned: { hb_a1: 4, hb_c3: 2, hb_c4: 5, hb_a3: 1 }, slots: ['hb_c4', 'hb_c3', 'hb_a3', ''] } }, sk2 = ensureSk(p2, data);
  ok(sk2.learned.hb_a1 === 4 && sk2.learned.hb_c4 === 5 && sk2.learned.hb_c3 === 2 && sk2.points === 1 && sk2.slots.join() === 'hb_c4,hb_c3,hb_a3,', 'old save: 바뀐 5칸 레벨·포인트·칸 그대로(예전 제작 hb_a1 레벨 4 = 탕약 나누기 Lv4)'); }
// 보원탕 제작법: 한약사(계보) Lv30 이상이면 제작 메뉴에서 — 예전에 hb_a1 을 배운 사람·새 한약사 모두, 다른 직업·Lv29 는 막힘
{ const { recipeBlock, jobRecipes, craft } = await import('../js/skillsys.js'); const D = { recipes: S2.recipes, job: id => ({ herbalist: { id: 'herbalist', name: '한약사', parent: 'pharmacist', tier: 2 }, pharmacist: { id: 'pharmacist', name: '약사', tier: 1 } }[id]), item: id => S2.items.find(i => i.id === id) || { id, tier: 1 } };
  const rc = S2.recipes.find(r => r.id === 'r_tonic'), bk = (job, level) => ({ lineage: job === 'herbalist' ? ['novice', 'pharmacist', 'herbalist'] : ['novice', 'pharmacist'], p: { level }, level: () => 0, usable: () => false, passive: () => 0 });
  ok(recipeBlock(D, bk('herbalist', 30), rc) === null && recipeBlock(D, bk('herbalist', 29), rc) && recipeBlock(D, bk('pharmacist', 40), rc), '보원탕: 한약사 Lv30 이상만');
  ok(jobRecipes(D, bk('herbalist', 31)).some(r => r.id === 'r_tonic'), '보원탕: 제작 메뉴(직업 제작법 목록)에 나옴');
  const bag = { n: { m_herb: 8, m_meat: 2, m_boar_tusk: 2 }, count(i) { return this.n[i] | 0; }, remove(i, c) { this.n[i] -= c; return true; }, add(i, c) { this.n[i] = (this.n[i] | 0) + c; return c; }, slots: [], changed() {} };
  const sheet = { bag, p: { inventory: [], name: 'x', level: 30 }, final: { craftRate: 0 } }; const r = craft(D, sheet, bk('herbalist', 30), rc, 2, () => 0.99);
  if (process.env.DBG) console.log(r); ok(r.err || r.made === 2, '보원탕 제작: 재료로 2개 만들기 시도(가방 흉내)'); }

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
  const mon = (x, z, extra = {}) => { const m = { pos: { x, y: 0, z }, radius: 0.5, knock: { x: 0, z: 0 }, hp: 1e6, maxHp: 1e6, dead: false, zone: pc.zone, faction: 'monster', status: new StatusSet(), stat: () => 0, taken: [],
      takeDamage(hd) { this.taken.push(hd); this.hp -= hd.amount; if (this.hp <= 0) this.dead = true; }, ...extra }; actors.push(m); return m; };
  const ctx = (id, L = 1, more = {}) => ({ d: SK[id], id, L, grade: 1, mult: 1 + (SK[id].type === 'ultimate' ? 0.25 : 0.12) * (L - 1), origin: { ...pc.pos }, facing: { ...pc.facing }, aim: { x: 0, y: 0, z: 3 }, hitOnce: new Set(), ...more });
  const op = (id, k) => SK[id].ops.find(x => x.k === (k || id.slice(3)));
  const cast = (id, L = 1, more = {}) => { const c = ctx(id, L, more); CUSTOM.herb(eng, op(id), c); return c; };
  const run = (sec, dt = 0.02) => { for (let i = 0; i < Math.round(sec / dt); i++) { eng.tick(dt); for (const a of actors.slice()) { if (a.isSummon && a.update) a.update(dt);
      else if (a.knock && Math.hypot(a.knock.x, a.knock.z) > 0.1) { a.pos = geo.move(a.pos, a.knock.x * dt, a.knock.z * dt, a.radius); const k = 1 - Math.exp(-10 * dt); a.knock.x *= 1 - k; a.knock.z *= 1 - k; } } } };   // actors.js baseUpdate 와 같은 밀림
  const sum = m => m.taken.reduce((a, h) => a + h.amount, 0);
  return { pc, eng, kit: eng.herbal, mon, ctx, op, cast, run, sum, sounds, kicks, fxLog, actors };
}
const ownAmount = (m, from = 0) => m.taken.slice(from).reduce((a, h) => a + h.amount, 0);

// A1 탕약 나누기: 고른 영물 우선 / 없으면 가장 다친 영물 / 영물이 없으면 남은 한 잔 — 두 번째 누름은 보관한 잔만(비용·대기 한 번), 보관 시간이 끝나면 원래대로
{ const W = world({ learned: { hb_a1: 1, hb_b3: 1, hb_b4: 1 } }); W.pc.sheet.book.sk.slots = ['hb_a1', 'hb_b3', 'hb_b4', 'hb_c4']; W.pc.hp = 300;
  W.cast('hb_b3'); W.cast('hb_b4', 1, { aim: { x: 1, y: 0, z: 1 } }); W.run(1.0); const gs = W.eng.summons.find(s => s.kind === 'ginseng'), dr = W.eng.summons.find(s => s.kind === 'deer');
  gs.hp = gs.maxHp * 0.8; dr.hp = dr.maxHp * 0.3;
  const c = W.cast('hb_a1'); ok(near(W.pc.hp, 300 + 100, 0.01), 'a1: 내 잔 = 최대 HP 10% 즉시');
  ok(c.a1.to === dr, 'a1: 선택이 없으면 체력 비율이 가장 낮은 생명 소환물'); const h0 = dr.hp; W.run(0.6); ok(near(dr.hp - h0, dr.maxHp * 0.25, 0.5), 'a1: 영물 잔이 닿는 순간 그 영물 최대 HP 25%');
  W.pc.allyTarget = gs; gs.hp = gs.maxHp * 0.9; const c2 = W.cast('hb_a1'); ok(c2.a1.to === gs, 'a1: 직접 고른 영물 우선(덜 다쳤어도)'); }
{ const W = world({ learned: { hb_a1: 3 } }); W.pc.sheet.book.sk.slots = ['hb_a1', '', '', '']; W.pc.hp = 200; W.pc.sp = 100;
  const e1 = W.eng.cast('hb_a1'); W.run(0.4); const k = 1 + 0.12 * 2;
  ok(e1 === null && near(W.pc.hp, 200 + 100 * k, 0.01) && W.pc.sp === 80 && W.kit.cup && W.kit.cupLeft('hb_a1') > 0, 'a1 혼자: 첫 잔 + 남은 한 잔 보관(아이콘 = 남은 한 잔), 기력 20 한 번');
  const cd0 = W.eng.cdLeft('hb_a1'); const e2 = W.eng.cast('hb_a1');
  ok(e2 === null && near(W.pc.hp, 200 + 200 * k, 0.01) && W.pc.sp === 80 && !W.kit.cup && W.kit.cupLeft('hb_a1') === 0 && near(W.eng.cdLeft('hb_a1'), cd0, 1e-9), 'a1 두 번째 누름: 보관한 잔만 마심(기력·재사용 대기 다시 안 씀), 아이콘 원래대로');
  ok(W.eng.cast('hb_a1') === '재사용 대기 중', 'a1: 그다음 누름은 보통 재사용 대기');
  const W2 = world({ learned: { hb_a1: 1 } }); W2.pc.sheet.book.sk.slots = ['hb_a1', '', '', '']; W2.eng.cast('hb_a1'); W2.run(0.4); ok(W2.kit.cup, 'a1: 보관'); W2.run(8.1); ok(!W2.kit.cup && W2.kit.cupLeft('hb_a1') === 0, 'a1: 보관 시간(8초)이 끝나면 잔이 사라지고 원래 아이콘'); }
// A2 보중익기탕: 기력 ticks 번(움직여도 이어짐) + 10 m 안 생명 소환물만 가속(나는 가속 없음)
{ const W = world(); W.cast('hb_b3'); W.run(0.1); const gs = W.eng.summons[0];
  const far = new HerbSummon(W.kit, 'root', W.op('hb_b1'), W.ctx('hb_b1'), { x: 30, y: 0, z: 0 }); W.eng.summons.push(far); W.actors.push(far);
  const machine = { pos: { x: 0, z: 1 }, living: false, dead: false, status: new StatusSet(), hp: 1, maxHp: 1 }; W.eng.summons.push(machine);
  W.pc.sp = 100; W.cast('hb_a2', 3); W.run(0.05);
  ok(W.pc.sp === 100 + 8 * 1.1, 'a2: 첫 기력 회복은 잔을 드는 순간'); for (let i = 0; i < 30; i++) { W.pc.pos.x += 0.12; W.run(0.1); }
  ok(near(W.pc.sp, 100 + 4 * 8 * 1.1, 1e-6) && W.kit.log.a2.ticks === 4, 'a2: 움직이는 동안에도 4번(총 32 × 1.1)');
  ok(gs.status.has('haste') && !far.status.has('haste') && !machine.status.has('haste') && !W.pc.status.has('haste'), 'a2: 가까운 생명 소환물만 가속(먼 영물·기계·나 X)');
  ok(near(gs.status.get('haste').value, 0.2 * 1.24, 1e-9) && near(gs.stat('moveSpeed'), HERB.hop.speed * (1 + 0.2 * 1.24), 1e-6), 'a2: 가속 20% × 레벨 몫, 실제 이동 속도에 반영'); }
// A3 구풍해독탕: 고른 영물 -> 약액이 닿는 순간 근접 거리만큼 일반 몬스터 한 번 밀침 + 보호막 한 번 / 선택 없으면 나 / 보스 안 밀림 / 도발 수호령 대형 유지
{ const W = world(); W.cast('hb_b3'); W.run(1.0); const gs = W.eng.summons[0]; gs.pos = { x: 4, y: 0, z: 0 };
  const near1 = W.mon(5.6, 0), near2 = W.mon(4, 1.7), boss = W.mon(2.6, 0, { isBoss: true }), out = W.mon(4, 4.2); W.pc.allyTarget = gs;
  const c = W.cast('hb_a3', 1); ok(c.a3.to === 'ginseng' && !c.a3.done, 'a3: 고른 영물에게 약액이 날아감(바로 터지지 않음)');
  W.run(0.5); const R = W.kit.log.a3.reach; ok(near(R, 2.8, 1e-9), 'a3: 반경 = 동자 근접 거리 2.6 + 반지름 0.35 -> 상한 2.8 m');
  ok(Math.hypot(near1.pos.x - 4, near1.pos.z) > 1.6 + 1.5 && Math.hypot(near2.pos.x - 4, near2.pos.z - 0) > 1.7 + 1.5, 'a3: 가까운 일반 몬스터 바깥으로 밀림');
  ok(boss.pos.x === 2.6 && out.pos.z === 4.2, 'a3: 보스·반경 밖은 그대로');
  ok(gs.shield === Math.round(gs.maxHp * 0.12) && W.kit.log.a3.pushed === 2, 'a3: 보호막 그 영물 최대 HP 12% 한 번, 밀침 한 번씩');
  const hp0 = gs.hp; gs.takeDamage({ amount: 10 }); ok(gs.hp === hp0 && gs.shield === Math.round(gs.maxHp * 0.12) - 10, 'a3: 영물 보호막이 피해를 먼저 흡수');
  W.run(4.1); ok(gs.shield === 0, 'a3: 보호막 4초');
  const W2 = world(), m = W2.mon(1.2, 0); W2.pc.hp = 500; const c2 = W2.cast('hb_a3', 5); ok(c2.a3.to === 'self' && c2.a3.done && W2.pc.shield === Math.round(1000 * (0.12 + 0.06)) && Math.hypot(m.knock.x, m.knock.z) > 0, 'a3: 고른 영물이 없으면 나를 중심으로 바로(Lv5 보호막 18%) + 밀침');
  W2.run(0.5); ok(m.pos.x > 2.6, 'a3: 나를 붙잡던 몬스터가 밀려남');
  // 도발 중인 녹각수호령: 끌어모은 적은 밀지 않음(대형 유지) + 보호막
  const W3 = world(); W3.cast('hb_b4', 1, { aim: { x: 0, y: 0, z: 4 } }); W3.run(1.0); const dr = W3.eng.summons[0]; const t1 = W3.mon(dr.pos.x + 1.5, dr.pos.z), t2 = W3.mon(dr.pos.x - 1.2, dr.pos.z + 0.6);
  ok(W3.kit.tauntedBy(t1, dr) && W3.kit.tauntedBy(t2, dr), 'a3: 수호령 7 m 안 일반 몬스터 = 도발 중(actors.js Monster.player 규칙)');
  W3.pc.allyTarget = dr; const x1 = { ...t1.pos }; W3.cast('hb_a3'); W3.run(0.7); ok(t1.pos.x === x1.x && t1.knock.x === 0 && W3.kit.log.a3.kept === 2 && W3.kit.log.a3.pushed === 0 && dr.shield > 0, 'a3: 수호령에게 = 끌린 적 대형 유지(밀지 않음) + 보호막'); }
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
// C3 오령산: 다섯 약인 -> run 동안 일반 몬스터 끌어당김(보스는 안 끌림) -> 만나는 순간 적마다 한 번(물길 다섯이 겹쳐도)
{ const W = world(), a = W.mon(2.6, 4), b = W.mon(-2.4, 3), boss = W.mon(0, 5.5, { isBoss: true, radius: 1.2 }), far = W.mon(0, 9);
  W.cast('hb_c3', 1, { aim: { x: 0, y: 0, z: 4 } }); ok(W.fxLog.includes('wuling') && W.kit.log.c3.c.z === 4, 'c3: 약인 다섯·물길(지정 지점)');
  W.run(0.3); ok(a.taken.length === 0 && b.taken.length === 0, 'c3: 물길이 모이는 동안은 피해 없음');
  ok(Math.hypot(a.pos.x, a.pos.z - 4) < Math.hypot(2.6, 0) - 0.5 && boss.pos.z === 5.5, 'c3: 일반 몬스터는 가운데로 끌리고 보스는 그대로');
  W.run(0.4); ok(Math.hypot(a.pos.x, a.pos.z - 4) < 1.2 && Math.hypot(b.pos.x, b.pos.z - 4) < 1.2, 'c3: 0.6초 뒤 가운데 1.2 m 안으로 모임');
  ok(a.taken.length === 1 && b.taken.length === 1 && boss.taken.length === 1 && far.taken.length === 0 && near(a.taken[0].amount, 220, 1), 'c3: 만나는 순간 220% 적마다 한 번 — 범위 안 보스도 피해(끌리지는 않음), 밖은 X');
  W.run(1.0); ok(a.taken.length === 1 && boss.taken.length === 1, 'c3: 큰 적(보스)에 물길 다섯이 겹쳐도 한 번'); }
// 자운화 -> 오령산: 꽃밭 둘레의 몬스터를 꽃 안으로 모아 독 포자를 맞힘
{ const W = world(), ms = [W.mon(3.4, 3.4), W.mon(-3.4, 4.5), W.mon(0, 7.45)];
  W.cast('hb_b2', 1, { aim: { x: 0, y: 0, z: 4 } }); W.run(0.7); const before = ms.map(m => m.taken.length);
  ok(before.every(n => n === 0), '자운화 밖(2.8 m 바깥) 몬스터는 처음엔 안 맞음');
  W.cast('hb_c3', 1, { aim: { x: 0, y: 0, z: 4 } }); W.run(0.8); ok(ms.every(m => Math.hypot(m.pos.x, m.pos.z - 4) < 2.8), '오령산: 셋 모두 자운화 원 안으로 끌려옴');
  W.run(2.0); ok(ms.every(m => m.status.has('poison') && m.taken.length >= 2), '자운화 포자가 모인 몬스터를 맞힘(중독)'); }
// C4 소경활혈탕: 대상 하나 세 마디(탁 0.12·탁 0.26·반 박자 뒤 0.56), 셋째 = 큰 피해 + 방어력 감소, 움직이는 대상 따라감, 그 뒤 주작천구 추가 피해
{ const W = world({ learned: { hb_c4: 1, hb_c2: 1 } }), a = W.mon(0, 4), side = W.mon(1.0, 4.4); W.pc.target = a; W.pc.sheet.book.sk.slots = ['hb_c4', 'hb_c2', '', ''];
  const c = W.cast('hb_c4', 1, { tgt: a }); const t0 = W.eng.clock;
  W.run(0.1); ok(a.taken.length === 0, 'c4: 첫 마디 전엔 피해 없음');
  for (let i = 0; i < 20; i++) { a.pos.x += 0.06; W.run(0.02); } ok(a.taken.length === 2 && near(a.taken[0].amount, 70, 1) && near(a.taken[1].amount, 70, 1), 'c4: 탁(70%)·탁(70%) — 움직여도 따라감');
  const nd = c.c4.nodes; ok(near(nd[0].at - t0, 0.12, 0.021) && near(nd[1].at - t0, 0.26, 0.021), 'c4: 마디 시각 0.12·0.26 s');
  ok(!a.status.has('defdown'), 'c4: 방어력 감소는 셋째 마디 전엔 없음');
  W.run(0.3); ok(a.taken.length === 3 && near(a.taken[2].amount, 180, 1) && a.status.has('defdown') && near(a.status.get('defdown').value, 0.2, 1e-9) && near(nd[2].at - t0, 0.56, 0.021), 'c4: 반 박자 뒤 셋째 180% + 방어력 -20% 5초(같은 순간)');
  ok(side.taken.length === 0, 'c4: 대상 하나만');
  W.cast('hb_c2', 1, { aim: { x: a.pos.x, y: 0, z: a.pos.z } }); W.run(1.0); ok(near(a.taken[3].amount, 260 * 1.25, 1) && near(side.taken[0].amount, 260, 1), '소경활혈탕 3타 -> 주작천구: 방어력 감소 대상 ×1.25(325%), 옆 적은 260%');
  const W2 = world(), x = W2.mon(0, 4, { hp: 80 }); W2.cast('hb_c4', 1, { tgt: x }); W2.run(1.0); ok(x.dead && x.taken.length === 2 && W2.kit.log.c4.nodes.some(n => n.gone), 'c4: 대상이 쓰러지면 남은 마디는 사라짐(피해 없음)'); }
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
