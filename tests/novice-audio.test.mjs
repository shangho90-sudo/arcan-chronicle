// 실제 cast → pending → hit / projectile 경로. 렌더러와 피해 수치만 대체.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { skillSound } from '../js/sfx.js';
import { CombatMath } from '../js/core.js';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const skills = JSON.parse(read('../assets/data/skills2.json')).skills;
const actions = Object.fromEntries(JSON.parse(read('../assets/models/actions.json')).map(a => [a.name, a]));
const source = read('../js/skillrt.js').replace(/^import .*;\n/gm, '').replace(/\bexport /g, '');
const sandbox = { skillSound, CombatMath, YEON_LEAD: 0.05, BASH: { stop: 0.04 },
  salImpact: t => t.pos, yeonImpact: t => t.pos, biyeonImpact: t => t.pos, bashImpact: t => t.pos,
  clamp: (n, a, b) => Math.max(a, Math.min(b, n)), clamp01: n => Math.max(0, Math.min(1, n)),
  console: { ...console, error: (...a) => { throw Error(a.join(' ')); } } };
vm.createContext(sandbox);
vm.runInContext(source + '\nthis.api = { SkillEngine, bindSkillRt, FX };', sandbox);
const { SkillEngine, bindSkillRt, FX } = sandbox.api;
const noFx = { set() {}, dispose() {} };
for (const k of Object.keys(FX).filter(k => k !== 'on')) FX[k] = () => k === 'biyeon' ? null : noFx;
const results = [];
for (const id of ['nv_a1', 'nv_a2', 'nv_a3', 'nv_a4']) for (const lv of id === 'nv_a2' ? [1, 2, 3, 4, 5] : [1]) for (const whiff of [false, true]) {
  const d = skills.find(s => s.id === id), sounds = [], damage = [];
  const target = { pos: { x: 0, y: 0, z: id === 'nv_a3' ? 4 : 1.6 }, radius: 0.5, faction: 'monster', dead: false };
  const pc = { pos: { x: 0, y: 0, z: 0 }, facing: { x: 0, z: 1 }, target, sp: 100,
    skills: { lock: 0, busy: false }, body: { sh: { actions }, play() {} },
    sheet: { p: { job: 'novice', sk: {} }, book: { level: () => lv, passive: () => 0, usable: () => true, sk: { slots: [id] } } },
    stat: () => 0, setFacing(x, z) { const n = Math.hypot(x, z); this.facing = { x: x / n, z: z / n }; },
    dist: t => Math.hypot(t.pos.x, t.pos.z), startLunge() {} };
  pc.zone = { actors: [target], geo: { blocked: () => false }, nearestEnemy: () => target.dead ? null : target }; target.zone = pc.zone;
  let eng;
  bindSkillRt({ data: { skill2: sid => skills.find(s => s.id === sid), job: () => ({ tier: 0 }) },
    audio: { sfx: name => sounds.push({ name, t: eng.clock }) }, render: { addShake() {} }, hitStop() {} });
  eng = new SkillEngine(pc); eng.dmg = () => damage.push(eng.clock); eng.onHit = () => {};
  const beforeSp = pc.sp;
  assert.equal(eng.cast(id), null); assert.equal(pc.sp, beforeSp - d.mp);
  assert.equal(sounds.length, 0, 'no premature button-press sound');
  if (whiff) target.dead = true;
  for (let i = 0; i < 200; i++) eng.tick(0.01);
  const casts = sounds.filter(s => s.name === d.sfx), hits = sounds.filter(s => s.name.endsWith('_hit'));
  const count = id === 'nv_a2' ? lv + 1 : 1;
  assert.equal(casts.length, count, `${id} Lv${lv} swings`);
  assert.equal(hits.length, whiff ? 0 : count, `${id} whiff=${whiff} impacts`);
  assert.equal(damage.length, hits.length, 'one sound per real damage event');
  hits.forEach((h, i) => assert.ok(Math.abs(h.t - damage[i]) < 0.0001, 'impact audio synchronized'));
  if (id === 'nv_a2') {
    actions[`nv_yeon_${count}`].hitTimes.forEach((t, i) => assert.ok(Math.abs(casts[i].t - Math.max(0, t - d.sfxLead)) < 0.011, 'combo swing follows authored time'));
  }
  if (id === 'nv_a3' && !whiff) assert.ok(hits[0].t - casts[0].t > 0.1, 'ranged hit waits for projectile flight');
  // A rejected cast never schedules more sound or spends SP.
  const n = sounds.length, sp = pc.sp; assert.notEqual(eng.cast(id), null); eng.tick(0.01);
  assert.equal(sounds.length, n); assert.equal(pc.sp, sp);
  results.push(`${id} Lv${lv} ${whiff ? '허공' : '명중'} ${casts.length}/${hits.length}`);
}
console.log('novice audio: real cast/runtime, 2–6-hit combos, impact timing, projectile flight, whiffs, rejected casts passed (' + results.length + ' scenarios)');
