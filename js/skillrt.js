// Skill runtime v2: executes skills2.json data for the player (validation, costs, cooldowns, damage shapes,
// projectiles, delayed blasts, chains, areas, statuses, marks / job resources, summons, walls, channels, consumables).
// Visuals go through G.skillFx (js/skillfx.js, 3D effect library) with a generic fallback.
import { THREE, T } from './render.js';
import { HitShape, CombatMath, clamp, clamp01 } from './core.js';
import { skillSound } from './sfx.js';
import { salImpact } from './salfx.js';

let G = null; export function bindSkillRt(g) { G = g; }
const DEG = Math.PI / 180;
const rnd = (a, b) => a + Math.random() * (b - a);
const hexToArr = c => c == null ? null : [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];

// ------------------------------------------------------------------ fx facade (never throws)
let FXG = 1;            // visual grade of the op being executed (skill tier + level): higher = more spectacular
export const setFxGrade = g => { FXG = g; };
const NOOP = { set() { }, dispose() { }, setRadius() { }, setPos() { }, pulse() { }, setStacks() { }, obj: null };
export const FX = {
  get on() { return !!(G && G.skillFx); },
  burst(kind, pos, o = {}) { try { if (o.grade == null) o.grade = FXG; if (G.skillFx) return G.skillFx.burst(kind, pos, o); G.fx.play('hit', { x: pos.x, y: (pos.y || 0) + 0.5, z: pos.z }, o.radius || 1, false, hexToArr(o.color)); } catch (e) { console.warn('fx', kind, e); } },
  slash(kind, pos, dir, o = {}) { try { if (o.grade == null) o.grade = FXG; if (G.skillFx) return G.skillFx.slash(kind, pos, dir, o); G.fx.play('slash', { x: pos.x, y: (pos.y || 0) + 0.7, z: pos.z }, 1); } catch (e) { console.warn('fx', kind, e); } },
  sal(kind, pos, dir, o = {}) { try { if (G.skillFx && G.skillFx.sal) return G.skillFx.sal[kind](pos, dir, o); } catch (e) { console.warn('fx sal', e); } },   // 일격참 '살' (js/salfx.js)
  beam(kind, a, b, o = {}) { try { if (o.grade == null) o.grade = FXG; if (G.skillFx) return G.skillFx.beam(kind, a, b, o); } catch (e) { console.warn('fx', kind, e); } },
  projectile(kind, o = {}) { try { if (o.grade == null) o.grade = FXG; if (G.skillFx) return G.skillFx.projectile(kind, o) || NOOP; } catch (e) { console.warn('fx', kind, e); } return NOOP; },
  area(kind, pos, r, o = {}) { try { if (o.grade == null) o.grade = FXG; if (G.skillFx) return G.skillFx.area(kind, pos, r, o) || NOOP; } catch (e) { console.warn('fx', kind, e); } return NOOP; },
  aura(kind, getPos, o = {}) { try { if (o.grade == null) o.grade = FXG; if (G.skillFx) return G.skillFx.aura(kind, getPos, o) || NOOP; } catch (e) { console.warn('fx', kind, e); } return NOOP; },
  summon(kind, o = {}) { try { if (G.skillFx) return G.skillFx.summonModel(kind, o); } catch (e) { console.warn('fx', kind, e); } const m = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 1.2, 10), new THREE.MeshLambertMaterial({ color: 0x8888aa })); m.position.y = 0.6; const g = new THREE.Group(); g.add(m); return g; },
  telegraph(pos, r, dur, o = {}) { try { if (o.grade == null) o.grade = FXG; if (G.skillFx) return G.skillFx.telegraph(pos, r, dur, o); } catch (e) { console.warn('fx tele', e); } },
};

// ------------------------------------------------------------------ statuses with boss / immunity rules
const CC = new Set(['freeze', 'root', 'stagger']);
export function applyStatus(target, st, caster, lvMul = 1) {
  const def = G.data.status(st.id); if (!def || target.dead) return false;
  if (st.ch < 1 && Math.random() > st.ch) return false;
  let dur = st.dur * (target.isBoss && CC.has(st.id) ? 0.5 : 1), val = st.val * lvMul;
  const isBoss = !!target.isBoss;
  if (isBoss) {
    if (def.boss === 'immune') return false;
    if (def.boss === 'slow') { const sd = G.data.status('slow'); target.status.apply(sd, Math.min(dur, 2), 0.3, caster); target._ccNote = (target._ccNote || 0) + 1; return true; }
    if (def.boss === 'half') val *= 0.5;
  }
  if (target.faction === 'player' && target.status) {
    if (CC.has(st.id) && target.status.flag && target.status.flag('ccres') > 0) dur *= 1 - Math.min(0.8, target.status.flag('ccres'));
    if (st.id === 'slow' && target.status.flag && target.status.flag('slowres') > 0) return false;
  }
  if (def.kind === 'dot') { const pw = caster && caster.stat ? caster.stat(primaryPower(caster)) : 10; val = Math.max(1, pw * st.val * lvMul); }
  if (def.cap != null && def.kind !== 'dot') val = Math.min(def.cap, val);
  target.status.apply(def, dur, val, caster);
  if (target._auras) target._auras.refresh(st.id, def);
  return true;
}
export function primaryPower(c) {
  if (!c || !c.sheet) return 'atk';
  const j = c.sheet.job, fam = j && (j.parent || j.id);
  return fam === 'artist' ? 'matk' : 'atk';
}

// ------------------------------------------------------------------ marks (per target, transient)
const MARK_CAP = { reaction: 5, pattern: 5, color: 3 }, MARK_TIME = 10;
function marks(t) { return t._marks || (t._marks = { reaction: 0, pattern: 0, colors: new Set(), t: 0, temp: 0, tempT: 0, tri: new Set(), triT: 0 }); }
export function addMark(t, type, n, color) {
  const m = marks(t); m.t = MARK_TIME;
  if (type === 'color') { if (color) m.colors.add(color); }
  else m[type] = Math.min(MARK_CAP[type] || 5, (m[type] || 0) + n);
  showMarks(t);
}
function takeMarks(t, type) { const m = t._marks; if (!m) return 0; let n; if (type === 'color') { n = m.colors.size; m.colors.clear(); } else { n = m[type] || 0; m[type] = 0; } showMarks(t); return n; }
function showMarks(t) {
  const m = t._marks; if (!m) return;
  const want = { mark_reaction: m.reaction, mark_pattern: m.pattern, mark_color: m.colors.size, temperature: m.temp };
  t._markFx = t._markFx || {};
  for (const [k, n] of Object.entries(want)) {
    if (n && !t._markFx[k]) t._markFx[k] = FX.aura(k, () => t.pos, { height: (t.radius || 0.5) * 2 + 1.2 });
    if (t._markFx[k]) { if (n) t._markFx[k].setStacks(n); else { t._markFx[k].dispose(); delete t._markFx[k]; } }
  }
}
export function tickMarks(t, dt) {
  const m = t._marks; if (!m) return;
  if (m.t > 0) { m.t -= dt; if (m.t <= 0) { m.reaction = 0; m.pattern = 0; m.colors.clear(); showMarks(t); } }
  if (m.tempT > 0) { m.tempT -= dt; if (m.tempT <= 0) { m.temp = 0; showMarks(t); } }
  if (m.triT > 0) { m.triT -= dt; if (m.triT <= 0) m.tri.clear(); }
}
export function clearMarks(t) { if (t._markFx) for (const h of Object.values(t._markFx)) h.dispose(); t._markFx = null; t._marks = null; }

// ------------------------------------------------------------------ engine
export class SkillEngine {
  constructor(pc) {
    this.pc = pc; this.cd = {}; this.cdLen = {}; this.pending = []; this.casting = null; this.channel = null; this.clock = 0;
    this.things = []; this.summons = []; this.areas = []; this.res = { power: 6, phrase: 0 }; this.melody = null; this.lastFamily = ''; this.potionShared = 0;
    this.combatT = 0; this.cheatDeathT = 0; this.overclockT = 0; this.coolT = 0; this.lastMelodySwitch = 0; this.echoUsed = false;
    this.restoreCooldowns();
  }
  get book() { return this.pc.sheet.book; }
  get data() { return G.data; }
  get inCombat() { return this.combatT > 0; }
  lvl(id) { return this.book.level(id); }
  mult(d) { const L = Math.max(1, this.lvl(d.id)); return 1 + (d.type === 'ultimate' ? 0.25 : 0.12) * (L - 1); }
  cdOf(d) { const L = Math.max(1, this.lvl(d.id)); return CombatMath.cooldown(d.cd * (1 - 0.03 * (L - 1)), this.pc.stat('cdr')); }
  cdLeft(id) { return Math.max(0, (this.cd[id] || 0) - this.clock); }
  cdFrac(id) { const l = this.cdLen[id]; return l > 0 ? clamp01(this.cdLeft(id) / l) : 0; }
  mpCost(d) {
    let c = d.mp; const fl = this.book.passive('flow');
    if (fl && d.tags && this.lastFamily && !d.tags.includes(this.lastFamily) && (d.tags.includes('paint') || d.tags.includes('music'))) c *= 1 - fl;
    return Math.round(c);
  }
  // ---------------- persistence of long cooldowns (>= 30 s) across reloads
  saveCooldowns() { const sk = this.pc.sheet.p.sk; sk.cds = {}; const now = Date.now(); for (const [id, end] of Object.entries(this.cd)) { const left = end - this.clock; if (left > 1 && (this.cdLen[id] || 0) >= 30) sk.cds[id] = now + left * 1000; } }
  restoreCooldowns() { const sk = this.pc.sheet.p.sk; if (!sk || !sk.cds) return; const now = Date.now(); for (const [id, end] of Object.entries(sk.cds)) { const left = (end - now) / 1000; if (left > 0) { const d = G.data.skill2(id); this.cd[id] = this.clock + left; this.cdLen[id] = d ? this.cdOf(d) : left; } } }

  // ---------------- validation (no resource is spent when this fails)
  validate(d, aim) {
    const pc = this.pc, b = this.book;
    if (!d) return '스킬 없음';
    if (!b.usable(d.id)) return b.level(d.id) ? '현재 직업의 스킬이 아닙니다' : '배우지 않은 스킬입니다';
    if (d.type === 'passive') return '패시브는 자동 적용됩니다';
    if (d.type === 'craft') return '제작 메뉴에서 사용합니다';
    if (d.type === 'ultimate' ? b.sk.ult !== d.id : !b.sk.slots.includes(d.id)) return '장착되지 않은 스킬입니다';
    if (pc.dead) return '';
    if (pc.stunned) return '행동 불가 상태';
    if (this.casting || this.channel || pc.skills.busy) return '';
    if (d.weapon) { const w = G.data.item(pc.sheet.p.weapon), job = G.data.job(pc.sheet.p.job), wt = job && job.weaponType; if (!w || !w.job || (w.job !== (job.parent || job.id))) return (G.data.job(job.parent || job.id)?.name || '') + ' 무기가 필요합니다'; void wt; }
    if (this.cdLeft(d.id) > 0) return '재사용 대기 중';
    if (pc.sp < this.mpCost(d)) return '기력이 부족합니다';
    if (d.res && d.res.cost && (this.res[d.res.type] || 0) < d.res.cost) return d.res.type === 'power' ? '전력이 부족합니다' : '자원이 부족합니다';
    for (const op of d.ops) if (op.op === 'consume' && !this.findConsumable(op.tag)) return op.tag === 'food' ? '먹을 음식이 없습니다' : '회복제가 없습니다';
    for (const op of d.ops) if (op.op === 'consume' && op.potionCd && pc.potionCd > 0) return '물약 재사용 대기 중';
    if (d.target === 'enemy') { const t = this.targetFor(d); if (!t) return '대상이 없습니다'; if (pc.dist(t) > this.range(d) + t.radius + 0.8) return '사거리 밖입니다'; }
    if (d.target === 'ground' && d.ops.some(o => o.op === 'summon')) { const p = this.groundAim(d, aim); if (pc.zone.geo.blocked(p.x, p.z, 0.4)) return '설치할 수 없는 위치입니다'; if (this.nearPortal(p, 2.5)) return '출입구 근처에는 설치할 수 없습니다'; }
    return null;
  }
  range(d) { let r = d.range; if (d.ops.some(o => o.tag === 'flask')) r += this.book.passive('throwRange'); if (d.tags && d.tags.includes('paint')) r += this.book.passive('paintRange'); return r; }
  nearPortal(p, m) { return (this.pc.zone.def.portals || []).some(pt => Math.hypot(pt.pos[0] - p.x, pt.pos[1] - p.z) < pt.radius + m); }
  targetFor(d) { const pc = this.pc; const t = pc.target && !pc.target.dead && pc.target.zone === pc.zone ? pc.target : pc.zone.nearestEnemy(pc, this.range(d) + 2); return t; }
  groundAim(d, aim) {
    const pc = this.pc; let a = aim || { x: pc.pos.x + pc.facing.x * Math.min(3, d.range), z: pc.pos.z + pc.facing.z * Math.min(3, d.range) };
    const dx = a.x - pc.pos.x, dz = a.z - pc.pos.z, m = Math.hypot(dx, dz), R = this.range(d);
    if (m > R) a = { x: pc.pos.x + dx / m * R, z: pc.pos.z + dz / m * R };
    return pc.zone.geo.ground(a.x, a.z);
  }

  // ---------------- cast
  cast(id, aim) {
    const d = G.data.skill2(id); const e = this.validate(d, aim); if (e != null) return e;
    const pc = this.pc;
    const cost = this.mpCost(d);
    pc.sp -= cost;
    if (d.res && d.res.cost) this.res[d.res.type] -= d.res.cost;
    const cdl = this.cdOf(d); this.cd[id] = this.clock + cdl; this.cdLen[id] = cdl;
    // aim / facing
    const tgt = d.target === 'enemy' ? this.targetFor(d) : null;
    let at = d.target === 'ground' ? this.groundAim(d, aim) : tgt ? { ...tgt.pos } : (aim || { x: pc.pos.x + pc.facing.x, z: pc.pos.z + pc.facing.z });
    const dx = at.x - pc.pos.x, dz = at.z - pc.pos.z; if (dx * dx + dz * dz > 0.01) pc.setFacing(dx, dz);
    const Lv = Math.max(1, this.lvl(id)), tier = G.data.job(d.job).tier;
    const grade = Math.max(1, Math.min(10, Math.max(0, tier - 1) * 3 + Lv + (d.type === 'ultimate' ? 2 + Lv : 0)));
    const ctx = { d, id, L: Lv, grade, mult: this.mult(d), tgt, aim: at, facing: { ...pc.facing }, origin: { ...pc.pos }, cost, hitOnce: new Set() };
    if (d.tags) { if (d.tags.includes('music') || d.tags.includes('paint')) this.lastFamily = d.tags.includes('music') ? 'music' : 'paint'; }
    if (d.job === 'musician' && d.type === 'attack') this.lastFamily = 'music';
    // animation
    const anim = d.anim || 'cast', sh = pc.body.sh; let act = sh.actions[anim] ? anim : 'attack';
    let aspd = 1; const hop = d.ops.find(o => o.hitsPerLv);
    if (hop) {
      const hits = (hop.hits || 1) + Math.floor(hop.hitsPerLv * (Lv - 1)), cv = sh.actions[anim + '_' + hits];
      // sword flurry authored for exactly this many strikes (tools/anim/swings.py): its impacts drive the hit timing
      if (cv && cv.hitTimes && cv.hitTimes.length === hits) { act = anim + '_' + hits; ctx.combo = cv; }
      else if (sh.actions[act]) { const a = sh.actions[act]; aspd = Math.max(0.6, (a.frames / a.fps) / Math.max(0.3, hits * (hop.gap || 0.13) + 0.25)); }
    }
    ctx.act = act;
    pc.body.play(act, aspd, true);
    const castT = d.cast || 0;
    if (castT > 0) { this.casting = { ctx, t: castT, cost }; G.ui.floatText(pc.pos, d.name, '#ffe08a', 1.0, 2.1); }
    else this.release(ctx);
    if (d.ops.some(o => o.op === 'consume' && o.potionCd)) pc.potionCd = G.data.config.potionCooldown;
    this.combatT = Math.max(this.combatT, d.type === 'attack' || d.type === 'ultimate' ? 5 : 0);
    return null;
  }
  /** cast time finished (or instant): schedule every op */
  release(ctx) {
    const pc = this.pc, sh = pc.body.sh, d = ctx.d, anim = ctx.act || d.anim || 'cast', cb = ctx.combo;
    G.audio.sfx(skillSound(d));
    const ht = d.cast ? 0 : Math.min(0.35, (sh.actions[anim] ? sh.actions[anim].hitFrame / sh.actions[anim].fps : 0.2) || 0.2);
    let span = 0; for (const op of d.ops) { if (op.op === 'lunge') continue; const n = (op.hits || 1) + (op.hitsPerLv ? Math.floor(op.hitsPerLv * (ctx.L - 1)) : 0); span = Math.max(span, (op.at || 0) + (cb && op.hitsPerLv ? cb.hitTimes[n - 1] - cb.hitTimes[0] : (n - 1) * (op.gap || 0.13))); }
    pc.skills.lock = Math.max(pc.skills.lock, ht + span + Math.max(d.recover || 0.3, cb && cb.recover || 0));
    for (const op of d.ops) { if (cb && cb.lunges && op.op === 'lunge') continue; this.pending.push({ time: this.clock + Math.max(0, ht + (op.at || 0)), op, ctx }); }
    // the flurry's own steps (action time = time since the cast started, the cast is instant for these skills)
    if (cb && cb.lunges) for (const [t, dist, dur] of cb.lunges) this.pending.push({ time: this.clock + t, op: { op: 'lunge', dist, dur }, ctx });
    if (d.type === 'ultimate') { G.render.addShake && !G.reduceFlash && G.render.addShake(0.12, 0.25); }
  }
  interruptCast(reason) {
    const c = this.casting; if (!c) return; this.casting = null;
    // rule: interrupted before release -> MP / resource refunded, cooldown cleared
    this.pc.sp = Math.min(this.pc.maxSp, this.pc.sp + c.cost); if (c.ctx.d.res && c.ctx.d.res.cost) this.res[c.ctx.d.res.type] += c.ctx.d.res.cost;
    this.cd[c.ctx.id] = 0; if (reason) G.ui.toast(reason);
  }
  tick(dt) {
    const pc = this.pc; this.clock += dt;
    if (this.combatT > 0) this.combatT -= dt; if (this.cheatDeathT > 0) this.cheatDeathT -= dt;
    // resources
    this.res.power = Math.min(10, this.res.power + dt * (pc.sheet.p.job === 'engineer' ? 0.5 : 0));
    if (this.casting) {
      if (pc.dead || pc.stunned) this.interruptCast('시전이 중단되었습니다');
      else { this.casting.t -= dt; if (this.casting.t <= 0) { const c = this.casting; this.casting = null; this.release(c.ctx); } }
    }
    if (this.channel) this.tickChannel(dt);
    const due = this.pending.filter(p => p.time <= this.clock);
    if (due.length) { this.pending = this.pending.filter(p => p.time > this.clock); for (const p of due) { if (pc.dead) break; try { this.exec(p.op, p.ctx); } catch (e) { console.error('skill op', p.ctx.id, p.op.op, e); } } }
    for (const t of this.things) t.update(dt);
    this.things = this.things.filter(t => !t.dead);
    for (const a of this.areas) a.update(dt);
    this.areas = this.areas.filter(a => !a.dead);
    this.summons = this.summons.filter(s => !s.dead);
    if (this.melody) this.tickMelody(dt);
    if (this.overclockT > 0) { this.overclockT -= dt; if (this.overclockT <= 0) { applyStatus(pc, { id: 'cooldown_heat', dur: this.coolT, val: 1, ch: 1 }, pc); } }
    for (const m of pc.zone.actors) if (m._marks) tickMarks(m, dt);
  }
  /** zone change / death / load: remove every temporary thing (summons, areas, projectiles, marks, melody) */
  clearTemp() {
    for (const t of this.things) t.dispose && t.dispose(); this.things = [];
    for (const a of this.areas) a.dispose(); this.areas = [];
    for (const s of this.summons) s.vanish(true); this.summons = [];
    if (this.melody) { this.melody.fx.dispose(); this.melody = null; }
    this.pending = []; this.casting = null; if (this.channel) { this.channel = null; }
    for (const m of (this.pc.zone ? this.pc.zone.actors : [])) clearMarks(m);
  }

  // ---------------- damage
  power(ctx) { return this.pc.stat(primaryPower(this.pc)); }
  dmg(t, coef, ctx, op = {}) {
    if (!t || t.dead) return 0;
    const pc = this.pc; let c = coef * ctx.mult;
    if (op.vsStatus && op.vsStatus.mul && t.status.has(op.vsStatus.id)) c *= op.vsStatus.mul;
    if (op.vsLowHp && t.hp / t.maxHp <= op.vsLowHp.pct) c *= op.vsLowHp.mul;
    if (op.vsImmune && (t.isBoss || t.def && t.def.ai === 'heavy')) c *= op.vsImmune;
    if (t.status.has('prescribed') && op.mark) c *= 1.2;
    if (t.status.has('painted') && ctx.d.tags && ctx.d.tags.includes('paint')) { c *= 1 + t.status.list.find(s => s.def.id === 'painted').value; t.status.remove('painted'); }
    if (pc.status.flag('inspired') && ctx.d.tags) { c *= 1 + pc.status.flag('inspired'); pc.status.remove('inspired'); }
    if (t.status.has('defdown')) c *= 1 + this.book.passive('vsDefdown');
    if (op.centerHit) c *= 1 + (op.centerBonus || 0) + this.book.passive('centerBonus');
    if (pc.status.flag('cooldown_heat') && ctx.machine) c *= 0.7;
    if (this.melodyBoostT > 0 && ctx.d.job === 'musician') c *= 1.1;
    let def = t.stat('def'); if (op.armorPen) def *= 1 - op.armorPen;
    let critDmg = pc.stat('critDmg'); if (t.status.has('spotlit')) critDmg += 0.5;
    const r = CombatMath.compute(this.power(ctx), c, def, pc.stat('crit'), critDmg, t.stat('dmgReduce'));
    const kdir = { x: t.pos.x - pc.pos.x, z: t.pos.z - pc.pos.z };
    const knock = op.knock && !(t.isBoss) && !(t.def && t.def.ai === 'heavy') ? op.knock * 0.4 : 0;
    t.takeDamage({ source: pc, amount: r.amount, crit: r.crit, kdir, knockback: knock });
    if (op.push && !t.isBoss && !t.dead) { const m = Math.hypot(kdir.x, kdir.z) || 1; t.knock = { x: kdir.x / m * op.push * 10, z: kdir.z / m * op.push * 10 }; t.hitReact = Math.max(t.hitReact || 0, 0.4); }   // push = m 밀어냄(배쉬, 무거운 몬스터 포함·보스 제외)
    if (op.pull && !t.isBoss && !t.dead) { const p = op.pullTo || ctx.aim; const ddx = p.x - t.pos.x, ddz = p.z - t.pos.z, m = Math.hypot(ddx, ddz); if (m > 0.3) t.knock = { x: ddx / m * op.pull * 3, z: ddz / m * op.pull * 3 }; }
    if (op.launch && !t.isBoss && !(t.def && t.def.ai === 'heavy')) applyStatus(t, { id: 'stagger', dur: op.launch, val: 1, ch: 1 }, pc);
    this.combatT = 5;
    pc.onHitLanded && pc.onHitLanded(c >= 2);
    return r.amount;
  }
  /** shared on-hit extras: statuses, marks, temperature, gains */
  onHit(t, op, ctx) {
    if (t.dead) return;
    const pc = this.pc, stagger = 1 + this.book.passive('staggerBonus');
    for (const s of op.st || []) applyStatus(t, s.id === 'stagger' ? { ...s, dur: s.dur * stagger } : s, pc, ctx.mult);
    if (op.vsStatus && op.vsStatus.st && t.status.has(op.vsStatus.id) && !t.isBoss) applyStatus(t, op.vsStatus.st, pc);
    let mk = op.mark;
    if (!mk && op.tag === 'flask' && pc.status.flag('catalyst')) mk = { type: 'reaction', n: 1 };
    if (mk) { let n = mk.n; if (pc.status.flag('catalyst') && mk.type === 'reaction') n += 1; if (t.status.has('prescribed')) n += 1; if (!mk.every || Math.random() < 1 / mk.every) addMark(t, mk.type, n); }
    if (op.color) addMark(t, 'color', 1, op.color);
    if (op.temp) { const m = marks(t); m.temp = clamp(m.temp + op.temp * 2, -5, 5); m.tempT = 6; showMarks(t); }
    if (op.gain) this.gain(op.gain.type, op.gain.n, ctx, op.gain.once);
  }
  gain(type, n, ctx, once) {
    if (once && ctx['g_' + type]) return; ctx['g_' + type] = 1;
    if (type === 'phrase') { n *= 1 + this.book.passive('phraseGain'); this.res.phrase = Math.min(8, this.res.phrase + n); }
    else this.res[type] = Math.min(10, (this.res[type] || 0) + n);
  }
  shapeOf(op, ctx, center) {
    const pc = this.pc, f = ctx.facing, c = center || (op.atAim ? ctx.aim : op.atTarget && ctx.tgt ? ctx.tgt.pos : op.fwd ? { x: pc.pos.x + f.x * op.fwd, z: pc.pos.z + f.z * op.fwd } : pc.pos);
    switch (op.shape) {
      case 'cone': return HitShape.cone(pc.pos.x, pc.pos.z, f.x, f.z, op.r * this.ampMul(ctx), op.ang);
      case 'line': return HitShape.rect(pc.pos.x, pc.pos.z, f.x, f.z, op.w, op.len);            // rect starts at the origin and extends forward
      case 'circle': return HitShape.circle(c.x, c.z, op.r * this.ampMul(ctx));
      default: return null;
    }
  }
  ampMul(ctx) {
    let m = 1; if (ctx.d.job === 'musician' || (ctx.d.tags && ctx.d.tags.includes('music'))) for (const s of this.summons) if (s.kind === 'amplifier' && !s.dead && this.pc.dist(s) < (s.o.r || 5)) m = Math.max(m, 1 + s.o.amp);
    if (this.pc.status.flag('inspired') && ctx.d.tags) m *= 1.25; return m;
  }
  targets(shape) { return this.pc.zone.actors.filter(c => c && !c.dead && c.faction !== 'player' && !c.isSummon && shape.overlaps(c.pos.x, c.pos.z, c.radius)); }

  // ---------------- op interpreter
  exec(op, ctx) {
    const pc = this.pc, d = ctx.d, col = d.fx && d.fx.color;
    switch (op.op) {
      case 'hit': return this.opHit(op, ctx);
      case 'proj': return this.opProj(op, ctx);
      case 'delay': return this.opDelay(op, ctx);
      case 'area': return this.addArea(op, ctx, op.atSelf || d.target === 'self' ? { ...pc.pos } : ctx.aim);
      case 'buff': {
        const targets = op.target === 'all' ? [pc, ...this.summons.filter(s => !s.dead && s.living)] : op.target === 'summons' ? this.summons : [pc];
        const dur = op.dur * (1 + 0.05 * (ctx.L - 1)), val = op.val * (op.id === 'haste' || op.id === 'defup' || op.id === 'atkup' ? ctx.mult : 1);
        for (const t of targets) applyStatus(t, { id: op.id, dur, val, ch: 1 }, pc);
        const def = G.data.status(op.id); if (def) G.ui.floatText(pc.pos, def.name, def.color || '#fff', 0.85, 1.8);
        FX.aura(op.id === 'atkup' ? 'buff_atk' : op.id === 'defup' ? 'buff_def' : op.id === 'haste' ? 'buff_speed' : 'heal', () => pc.pos, { duration: Math.min(dur, 3), color: col });
        return;
      }
      case 'shield': {
        let n = (op.base + op.coef * pc.stat(op.power || primaryPower(pc))) * ctx.mult * (1 + pc.sheet.final.shieldPower);
        if (op.lowHp) n *= 1 + op.lowHp * (1 - pc.hp / pc.maxHp);
        pc.addShield(Math.round(n), op.dur); G.ui.floatText(pc.pos, '보호막 ' + Math.round(n), '#8ce6ff', 0.9, 1.6);
        FX.aura('shield', () => pc.pos, { duration: op.dur }); return;
      }
      case 'heal': { const n = (pc.maxHp * op.pct + (op.flat || 0)) * ctx.mult * (1 + pc.sheet.final.healPower + (op.boost || 0)); pc.heal(n); FX.burst('heal', pc.pos, { radius: 1.2 }); return; }
      case 'mp': { pc.sp = Math.min(pc.maxSp, pc.sp + pc.maxSp * op.pct * ctx.mult); return; }
      case 'cleanse': {
        let n = op.n; for (const s of pc.status.list.slice()) { if (n <= 0) break; if (s.def.debuff && s.def.cleanse !== false && (!op.ids.length || op.ids.includes(s.def.id))) { pc.status.remove(s.def.id); n--; } }
        FX.aura('cleanse', () => pc.pos, { duration: 1 }); return;
      }
      case 'dash': return this.opDash(op, ctx);
      // root motion during a skill: step / leap along the cast direction (keeps the skill animation playing)
      case 'lunge': { const f = op.back ? { x: -ctx.facing.x, z: -ctx.facing.z } : ctx.facing; pc.startLunge(f, op.dist, op.dur || 0.2); return; }
      case 'summon': return this.opSummon(op, ctx);
      case 'consume': {
        const it = this.findConsumable(op.tag); if (!it) return;            // validated before; item may vanish -> skip effects
        pc.sheet.bag.remove(it.id, 1);
        if (op.tag === 'food' && it.use && it.use.status) applyStatus(pc, { id: it.use.status, dur: it.use.duration * (1 + pc.sheet.final.foodPower), val: it.use.value, ch: 1 }, pc);
        for (const o of op.ops || []) this.exec(o, ctx); return;
      }
      case 'res': this.gain(op.type, op.n, ctx); return;
      case 'channel': this.channel = { op, ctx, t: op.dur, tick: 0, start: { ...pc.pos }, hits: pc._hits || 0 }; pc.skills.lock = Math.max(pc.skills.lock, op.dur); return;
      case 'telegraph': {
        const c = op.atAim ? ctx.aim : pc.pos;
        FX.telegraph(c, op.r || op.w || 2, op.dur, { color: 0xffb040, shape: op.shape, dir: ctx.facing, length: op.len, width: op.w }); return;
      }
      case 'fx': if (op.sal === 'cast') { const tg = ctx.tgt && !ctx.tgt.dead ? ctx.tgt : this.targetFor(ctx.d); ctx.salCast = FX.sal('cast', pc.pos, ctx.facing, { follow: pc, length: op.len || 3.4, width: op.w || 1, target: tg || null }); }   // beam: sword tip -> impact point (salImpact, max op.len m); the hit locks it
        if (op.slash) FX.slash(op.slash, pc.pos, ctx.facing, { radius: op.r || 1.6, angle: op.ang || 120, color: col, tilt: op.tilt || 0, mirror: !!op.mirror }); if (op.burst) FX.burst(op.burst, op.fwd ? { x: pc.pos.x + ctx.facing.x * op.fwd, y: pc.pos.y, z: pc.pos.z + ctx.facing.z * op.fwd } : pc.pos, { radius: op.r || 2, color: col }); return;   // fwd: m in front (일격참 땅 갈라짐)
      case 'repair': {
        for (const s of this.summons) if (s.machine && !s.dead) { const miss = 1 - s.hp / s.maxHp; s.hp = Math.min(s.maxHp, s.hp + s.maxHp * op.pct * ctx.mult * (1 + op.missingBonus * miss)); FX.burst('sparks', s.pos, { radius: 0.8 }); }
        return;
      }
      case 'overclock': { this.overclockT = op.dur; this.coolT = op.cool; applyStatus(pc, { id: 'overclock', dur: op.dur, val: op.mul, ch: 1 }, pc); FX.aura('overclock', () => pc.pos, { duration: op.dur }); return; }
      case 'melody': return this.startMelody(op, ctx);
      case 'melodyBoost': { this.melodyBoostT = op.dur; if (this.melody) this.melody.boost = op.mul; return; }
      case 'empower': {
        for (const a of this.areas) if (a.op.landscape) { a.life = Math.min(a.life + op.extend, a.maxLife + op.extend); a.empower = op.landscapes; a.fx.pulse(); }
        for (const s of this.summons) if (!s.dead && s.living) { s.empower = op.summons; s.life += 0; }
        FX.burst('explosion_prism', pc.pos, { radius: 3 }); return;
      }
      case 'custom': return CUSTOM[op.fn] ? CUSTOM[op.fn](this, op, ctx) : console.warn('custom op missing', op.fn);
    }
  }
  opHit(op, ctx) {
    const pc = this.pc, d = ctx.d, col = d.fx && d.fx.color, f = ctx.facing;
    const physical = !op.elem && op.coef > 0 && ctx.d.type !== 'ultimate' && op.shape !== 'circle' || (ctx.d.weapon && op.coef > 0);
    // hitsPerLv: the skill's own hit count grows with its level (견습생 '연'); noExtra: no automatic extra strikes
    const baseHits = Math.max(1, (op.hits || 1) + (op.hitsPerLv ? Math.floor(op.hitsPerLv * (ctx.L - 1)) : 0)), extra = physical && !op.noExtra && !op.hitsPerLv ? Math.floor((ctx.L - 1) / 2) : 0, hits = baseHits + extra;
    if (extra) op = { ...op, coef: op.coef * baseHits / hits * (1 + 0.06 * extra), gap: op.gap || 0.12 };   // total grows a little, split across more strikes
    for (let h = 0; h < hits; h++) {
      const run = () => {
        if (pc.dead) return;
        let ts;
        if (op.shape === 'single') { const t = ctx.tgt && !ctx.tgt.dead && !ctx.tgt.removed ? ctx.tgt : this.targetFor(d); ts = t && pc.dist(t) <= this.range(d) + t.radius + 1 ? [t] : []; }
        else ts = this.targets(this.shapeOf(op, ctx));
        // fx
        const fxp = op.atAim ? ctx.aim : op.atTarget && ctx.tgt ? ctx.tgt.pos : { x: pc.pos.x + f.x * (op.fwd || 1.0), y: pc.pos.y, z: pc.pos.z + f.z * (op.fwd || 1.0) };
        if (op.fx) {
          const cf = ctx.combo && op.hitsPerLv && ctx.combo.hitFx ? ctx.combo.hitFx[h] : null;
          if (op.fx.slash && cf) {
            // authored flurry: each strike's arc follows the real swing (direction, tilt, size); the finisher adds a burst,
            // a camera kick and a short hit-stop
            const sp = op.shape === 'single' && ts[0] ? ts[0].pos : pc.pos;
            FX.slash(cf.slash || op.fx.slash, sp, f, { color: cf.gold ? 0xffd27a : col, radius: (op.r || 2) * (cf.r || 1), angle: cf.ang || op.ang || 100, mirror: !!cf.mirror, tilt: cf.tilt || 0 });
            if (cf.burst) FX.burst(cf.burst, { x: pc.pos.x + f.x * (cf.burstFwd || 1), y: pc.pos.y, z: pc.pos.z + f.z * (cf.burstFwd || 1) }, { color: col, radius: cf.burstR || 1 });
            if (cf.shake && G.render.addShake && !G.reduceFlash) G.render.addShake(cf.shake[0], cf.shake[1]);
            if (cf.stop && ts.length) G.hitStop(cf.stop);
          } else if (op.fx.slash) {
            // sweep / alt: swing direction (alt alternates every strike and tilts the arc a little so a flurry reads as many swings)
            const mir = op.alt ? h % 2 === 1 : op.sweep > 0, tilt = op.alt ? ((h * 37) % 5 - 2) * 0.12 : 0, ca = Math.cos(tilt), sa = Math.sin(tilt);
            const fd = { x: f.x * ca - f.z * sa, z: f.x * sa + f.z * ca };
            FX.slash(op.fx.slash, op.shape === 'single' && ts[0] ? ts[0].pos : (op.atAim ? ctx.aim : pc.pos), fd, { color: op.alt && h % 3 === 2 ? 0xffd27a : col, radius: op.r || 2, angle: op.ang || 100, length: op.len, width: op.w, mirror: mir, tilt: op.alt ? [0.22, -0.3, 0.45][h % 3] : (op.sweep || 0) * 0.2 });
          }
          if (op.fx.sal) {   // '살' star flash: the full flash on the main target (closest), smaller ones on any extra target, a faint glint on a whiff
            const near = [...ts].sort((a, b) => pc.dist(a) - pc.dist(b));
            if (near.length) near.forEach((t, i) => FX.sal('hit', salImpact(t, f), f, i === 0 ? { primary: true, cast: ctx.salCast } : { secondary: true, delay: i * 0.015 }));   // same impact point as the beam end
            else FX.sal('hit', { x: pc.pos.x + f.x * (op.len || 3), y: (pc.pos.y || 0) + 1.0, z: pc.pos.z + f.z * (op.len || 3) }, f, { whiff: true });
          }
          if (op.fx.beam) FX.beam(op.fx.beam, pc.pos, { x: pc.pos.x + f.x * (op.len || 6), y: pc.pos.y, z: pc.pos.z + f.z * (op.len || 6) }, { color: col, width: op.w || 0.6 });
          if (op.fx.burst) { if (op.shape === 'circle') FX.burst(op.fx.burst, op.fwd ? fxp : pc.pos, { color: col, radius: op.fx.burstR || op.r }); else for (const t of ts.length ? ts : [{ pos: fxp }]) FX.burst(op.fx.burst, t.pos, { color: col, radius: 0.8 }); }
          if (op.shake && G.render.addShake) G.render.addShake(op.shake[0], op.shake[1]);
        }
        let consumed = 0;
        if (op.consume) for (const t of ts) consumed = Math.max(consumed, takeMarks(t, op.consume.type === 'phrase' ? 'phrase' : op.consume.type));
        if (op.consume && op.consume.type === 'phrase') { consumed = Math.floor(this.res.phrase); this.res.phrase = 0; }
        // centre bonus (cone): the target nearest the axis gets the bonus
        let centre = null; if (op.centerBonus && ts.length) centre = ts.reduce((b, t) => { const ax = Math.abs((t.pos.x - pc.pos.x) * f.z - (t.pos.z - pc.pos.z) * f.x); return !b || ax < b.ax ? { t, ax } : b; }, null).t;
        for (const t of ts) {
          let coef = op.coef;
          if (op.falloff) { const dd = pc.dist(t) / (op.r || 5); coef *= 1 + op.falloff * (1 - clamp01(dd)) - op.falloff * 0.5; }
          if (op.consume) coef *= 1 + consumed * op.consume.mulPer;
          if (op.coef > 0) this.dmg(t, coef, ctx, { ...op, centerHit: t === centre });
          this.onHit(t, op, ctx);
          if (op.centerStack && t === centre) { t._cstack = (t._cstack || 0) + 1; if (t._cstack >= op.centerStack.n) { applyStatus(t, op.centerStack.st, pc); t._cstack = 0; } }
          if (op.react) this.react(t, op.react, ctx);
          if (op.extendHerb) for (const a of this.areas) if (a.op.herb && Math.hypot(a.c.x - t.pos.x, a.c.z - t.pos.z) < a.r + 2) a.extend(op.extendHerb, op.extendCap || 4);
        }
        if (op.extendHerb) for (const a of this.areas) if (a.op.herb && this.shapeOf(op, ctx).overlaps(a.c.x, a.c.z, a.r)) a.extend(op.extendHerb, op.extendCap || 4);
        if (op.link && ts.length > 1) for (let i = 1; i < ts.length; i++) FX.beam('thread_link', ts[i - 1].pos, ts[i].pos, { duration: 2 });
        if (ts.length) G.audio.sfx(skillSound(d, op));
      };
      const ht_ = ctx.combo && op.hitsPerLv && ctx.combo.hitTimes ? ctx.combo.hitTimes[h] - ctx.combo.hitTimes[0] : h * (op.gap || 0.15);
      if (h === 0) run(); else this.pending.push({ time: this.clock + ht_, op: { op: '_run', run }, ctx });
    }
    if (op.op === 'hit') this.echo(op, ctx);
  }
  echo(op, ctx) {
    const pc = this.pc;
    if (ctx.d.job === 'musician' && !ctx.isEcho && pc.status.flag('echo') > 0 && ctx.d.type === 'attack') {
      const v = pc.status.flag('echo'); pc.status.remove('echo');
      const c2 = { ...ctx, isEcho: true, mult: ctx.mult * v };       // echoes never echo again
      this.pending.push({ time: this.clock + 0.4, op: { ...op }, ctx: c2 });
    }
  }
  react(t, r, ctx) {
    const m = t._marks, pc = this.pc;
    let ok = false;
    if (r.need === 'chilled') ok = !!(m && m.temp < 0);
    else ok = t.status.has(r.need);
    if (!ok || ctx['react_' + t.uid]) return;                 // one reaction per target per cast (no infinite chains)
    ctx['react_' + (t.uid = t.uid || Math.random())] = 1;
    if (r.consume) t.status.remove(r.consume);
    if (r.need === 'chilled' && m) { m.temp = 0; showMarks(t); }
    const ts = r.r ? this.targets(HitShape.circle(t.pos.x, t.pos.z, r.r)) : [t];
    for (const x of ts) this.dmg(x, r.coef, ctx, {});
    FX.burst(r.burst || 'explosion_steam', t.pos, { radius: r.r || 1.4 });
  }
  opProj(op, ctx) {
    const pc = this.pc, n = Math.max(1, op.count || 1);
    const speedMul = 1 + this.book.passive('projSpeed');
    for (let i = 0; i < n; i++) {
      const fire = () => { if (!pc.dead) this.things.push(new SkillProj(this, op, ctx, speedMul)); };
      if (i === 0 || !op.gap) fire(); else this.pending.push({ time: this.clock + i * op.gap, op: { op: '_run', run: fire }, ctx });
    }
    this.echo(op, ctx);
  }
  opDelay(op, ctx) {
    const pc = this.pc;
    let anchor = op.self ? () => pc.pos : op.onTarget && ctx.attached ? (() => ctx.attached.dead ? ctx.attachedPos : ctx.attached.pos) : op.atEnd ? (() => ({ x: ctx.origin.x + ctx.facing.x * (ctx.d.range || 8), z: ctx.origin.z + ctx.facing.z * (ctx.d.range || 8) })) : () => ctx.aim;
    if (op.onTarget && !ctx.attached && ctx.tgt) anchor = () => ctx.tgt.dead ? ctx.tgt.pos : ctx.tgt.pos;
    const t = { left: op.after, dead: false, update: dt => { t.left -= dt; if (t.left > 0) return; t.dead = true; this.blast(anchor(), op, ctx); }, dispose() { t.dead = true; } };
    this.things.push(t);
  }
  /** area explosion used by delayed / lob / boom ops */
  blast(c, op, ctx) {
    const pc = this.pc, r = op.r || 1.5, ts = this.targets(HitShape.circle(c.x, c.z, r));
    FX.burst(op.burst || 'explosion_fire', c, { radius: r, color: ctx.d.fx && ctx.d.fx.color });
    const cb = this.book.passive('centerBonus');
    for (const t of ts) {
      const centre = Math.hypot(t.pos.x - c.x, t.pos.z - c.z) < r * 0.35;
      this.dmg(t, op.coef, ctx, { ...op, centerHit: centre && cb > 0, centerBonus: 0 });
      this.onHit(t, op, ctx);
      if (op.react) this.react(t, op.react, ctx);
    }
    if (op.area) this.addArea({ op: 'area', ...op.area }, ctx, c);
    if (op.knock) for (const t of ts) if (!t.isBoss) { const dx = t.pos.x - c.x, dz = t.pos.z - c.z, m = Math.hypot(dx, dz) || 1; t.knock = { x: dx / m * op.knock * 3, z: dz / m * op.knock * 3 }; }
    G.audio.sfx(skillSound(ctx.d, op));
    if (op.chain && ts[0]) this.chain(ts[0], op.chain, ctx);
    return ts;
  }
  chain(from, ch, ctx) {
    const hit = new Set([from]); let cur = from;
    for (let i = 0; i < ch.n; i++) {
      const next = this.pc.zone.actors.filter(c => !c.dead && c.faction !== 'player' && !c.isSummon && !hit.has(c) && Math.hypot(c.pos.x - cur.pos.x, c.pos.z - cur.pos.z) < ch.range).sort((a, b) => Math.hypot(a.pos.x - cur.pos.x, a.pos.z - cur.pos.z) - Math.hypot(b.pos.x - cur.pos.x, b.pos.z - cur.pos.z))[0];
      if (!next) break; hit.add(next);
      FX.beam('lightning', cur.pos, next.pos, { duration: 0.3 }); FX.burst('chain_jump', next.pos, {});
      this.dmg(next, ch.coef, ctx, {}); cur = next;
    }
  }
  addArea(op, ctx, c) {
    const pc = this.pc;
    let r = op.r, dur = op.dur * (1 + 0.05 * (ctx.L - 1));
    if (op.landscape) { r *= 1 + this.book.passive('landscapeSize'); dur *= 1 + this.book.passive('landscapeTime'); }
    const a = new SkillArea(this, op, ctx, op.follow ? null : pc.zone.geo.ground(c.x, c.z), r, dur);
    // limit: max 6 areas, oldest removed
    this.areas.push(a); while (this.areas.length > 6) this.areas.shift().dispose();
    return a;
  }
  opDash(op, ctx) {
    const pc = this.pc, f = ctx.facing;
    let dir = op.side ? { x: -f.z, z: f.x } : f; if (op.side && Math.random() < 0.5) dir = { x: f.z, z: -f.x };
    const dist = op.dist, sgn = Math.sign(dist) || 1;
    const start = { ...pc.pos };
    pc.startDash({ x: dir.x * sgn, z: dir.z * sgn }, Math.abs(dist), 14, !!op.invuln);
    if (op.hit) this.pending.push({ time: this.clock + 0.12, op: op.hit, ctx });
    if (op.path) { const p = op.path, end = { x: start.x + dir.x * dist, z: start.z + dir.z * dist }, mid = { x: (start.x + end.x) / 2, z: (start.z + end.z) / 2 };
      this.pending.push({ time: this.clock + 0.18, op: { op: '_run', run: () => {
        const sh = HitShape.rect(start.x, start.z, dir.x * Math.sign(dist), dir.z * Math.sign(dist), p.w || 1.4, Math.abs(dist)); FX.beam(p.fx && p.fx.beam || 'ribbon_line', start, end, { duration: 0.6 });
        for (const t of this.targets(sh)) { this.dmg(t, p.coef, ctx, p); this.onHit(t, p, ctx); } } }, ctx }); }
  }
  opSummon(op, ctx) {
    const pc = this.pc, n = op.n || 1;
    const base = ctx.d.target === 'ground' ? ctx.aim : { x: pc.pos.x - ctx.facing.x * 1.2, z: pc.pos.z - ctx.facing.z * 1.2 };
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, off = n > 1 ? 1.2 : 0;
      let p = pc.zone.geo.ground(base.x + Math.cos(a) * off, base.z + Math.sin(a) * off);
      if (pc.zone.geo.blocked(p.x, p.z, 0.3)) p = pc.zone.geo.ground(pc.pos.x, pc.pos.z);
      // per-kind limit, then global limit 8: replace the oldest
      const same = this.summons.filter(s => !s.dead && s.kind === op.kind);
      if (same.length >= (op.limit || 1)) same[0].vanish(false);
      const alive = this.summons.filter(s => !s.dead);
      if (alive.length >= 8) alive[0].vanish(false);
      const s = new Summon(this, op, ctx, p); this.summons.push(s); pc.zone.actors.push(s);
    }
  }
  findConsumable(tag) {
    const bag = this.pc.sheet.bag, ids = tag === 'food' ? ['f_course_atk', 'f_course_def', 'f_course_heal', 'f_soup', 'f_lunch', 'f_tonic'] : ['c_potion_l', 'c_potion_m', 'c_potion_s'];
    for (const id of ids) if (bag.count(id) > 0) return G.data.item(id);
    return null;
  }
  tickChannel(dt) {
    const c = this.channel, pc = this.pc, op = c.op;
    const moved = Math.hypot(pc.pos.x - c.start.x, pc.pos.z - c.start.z) > 0.25, hurt = (pc._hits || 0) > c.hits;      // dots do not interrupt
    if (pc.dead || pc.stunned || (op.breakOnMove && moved) || (op.breakOnHit && hurt)) { this.channel = null; pc.skills.lock = 0; G.ui.toast(hurt ? '피격되어 집중이 끊겼습니다' : '이동하여 중단되었습니다'); return; }
    c.t -= dt; c.tick -= dt;
    if (c.tick <= 0) { c.tick += op.tick; for (const o of op.ops) this.exec(o, c.ctx); }
    if (c.t <= 0) { this.channel = null; pc.skills.lock = 0; }
  }
  startMelody(op, ctx) {
    const pc = this.pc;
    if (this.melody && this.melody.op.id === op.id) { this.melody.t = op.dur; return; }        // refresh
    if (this.melody) this.melody.fx.dispose();
    this.melody = { op, ctx, t: op.dur, tick: 0, boost: 0, fx: FX.aura('melody', () => pc.pos, {}) };
    this.lastMelodySwitch = this.clock; this.switchBonusReady = true;
    G.ui.floatText(pc.pos, ctx.d.name, '#a0ffd0', 0.9, 1.8);
  }
  tickMelody(dt) {
    const m = this.melody, pc = this.pc, op = m.op, k = (1 + (m.boost || 0)) * m.ctx.mult; m.t -= dt; m.tick -= dt;
    if (this.melodyBoostT > 0) this.melodyBoostT -= dt; else m.boost = 0;
    if (op.atk) applyStatus(pc, { id: 'atkup', dur: 0.6, val: op.atk * k, ch: 1 }, pc);
    if (op.speed) applyStatus(pc, { id: 'haste', dur: 0.6, val: op.speed * k, ch: 1 }, pc);
    if (op.dr) applyStatus(pc, { id: 'dmgreduce', dur: 0.6, val: op.dr * k, ch: 1 }, pc);
    if (op.ccres) applyStatus(pc, { id: 'ccres', dur: 0.6, val: op.ccres, ch: 1 }, pc);
    if (m.tick <= 0) { m.tick = op.tick || 1; if (op.heal) { pc.heal(pc.maxHp * op.heal * k, false); for (const s of this.summons) if (s.living && !s.dead) s.hp = Math.min(s.maxHp, s.hp + s.maxHp * op.heal * k); } if (op.mp) pc.sp = Math.min(pc.maxSp, pc.sp + pc.maxSp * op.mp * k); }
    if (m.t <= 0) { m.fx.dispose(); this.melody = null; }
  }
  /** player hit by lethal damage -> 생명 보존 처방 */
  cheatDeath() {
    const v = this.book.passive('cheatDeath'); if (!v || this.cheatDeathT > 0) return false;
    this.cheatDeathT = 120; const pc = this.pc; pc.hp = Math.max(1, pc.maxHp * v); pc.addShield(Math.round(pc.maxHp * v), 5);
    G.ui.floatText(pc.pos, '생명 보존!', '#8cffd0', 1.2, 2.2); FX.aura('shield', () => pc.pos, { duration: 5 }); return true;
  }
  onKill() { const v = this.book.passive('killHaste'); if (v) applyStatus(this.pc, { id: 'haste', dur: 4, val: v, ch: 1 }, this.pc); }
}

// ------------------------------------------------------------------ projectile
class SkillProj {
  constructor(eng, op, ctx, speedMul) {
    this.eng = eng; this.op = op; this.ctx = ctx; const pc = eng.pc;
    this.pos = { x: pc.pos.x + ctx.facing.x * 0.4, y: pc.pos.y + 1.0, z: pc.pos.z + ctx.facing.z * 0.4 };
    this.speed = (op.speed || 12) * speedMul; this.range = op.range || eng.range(ctx.d) + 1; this.trav = 0; this.hit = new Set(); this.back = false; this.t = 0;
    this.target = ctx.tgt && !ctx.tgt.dead ? ctx.tgt : null;
    const to = op.kind === 'lob' || op.toGround ? ctx.aim : this.target ? this.target.pos : { x: pc.pos.x + ctx.facing.x * this.range, z: pc.pos.z + ctx.facing.z * this.range };
    this.to = { ...to }; const dx = to.x - this.pos.x, dz = to.z - this.pos.z, m = Math.hypot(dx, dz) || 1; this.dir = { x: dx / m, z: dz / m };
    if (op.kind === 'lob') { this.from = { ...this.pos }; this.flight = Math.max(0.25, m / this.speed); }
    if (op.toGround) { this.range = m + 0.2; }
    this.fx = FX.projectile(op.fx || 'capsule', { color: ctx.d.fx && ctx.d.fx.color });
    this.fx.set(this.pos, { x: this.dir.x, y: 0, z: this.dir.z });
  }
  update(dt) {
    const op = this.op, eng = this.eng, zone = eng.pc.zone; this.t += dt;
    if (op.kind === 'lob') {
      const k = clamp01(this.t / this.flight);
      this.pos = { x: this.from.x + (this.to.x - this.from.x) * k, y: this.from.y + ((this.to.y || 0) - this.from.y) * k + Math.sin(k * Math.PI) * Math.min(2.2, this.flight * 2.6), z: this.from.z + (this.to.z - this.from.z) * k };
      this.fx.set(this.pos, { x: this.dir.x, y: Math.cos(k * Math.PI), z: this.dir.z });
      if (k >= 1) { this.landBlast(this.to); this.done(); }
      return;
    }
    if (op.kind === 'homing' && this.target && !this.target.dead) {
      const dx = this.target.pos.x - this.pos.x, dz = this.target.pos.z - this.pos.z, m = Math.hypot(dx, dz) || 1, tr = Math.min(1, dt * 6);
      this.dir = { x: this.dir.x + (dx / m - this.dir.x) * tr, z: this.dir.z + (dz / m - this.dir.z) * tr }; const n = Math.hypot(this.dir.x, this.dir.z) || 1; this.dir.x /= n; this.dir.z /= n;
    }
    if (op.kind === 'boomerang' && this.back) { const pc = eng.pc, dx = pc.pos.x - this.pos.x, dz = pc.pos.z - this.pos.z, m = Math.hypot(dx, dz); if (m < 0.6) return this.done(); this.dir = { x: dx / m, z: dz / m }; }
    const sx = this.dir.x * this.speed * dt, sz = this.dir.z * this.speed * dt;
    this.pos = { x: this.pos.x + sx, y: this.pos.y, z: this.pos.z + sz }; this.trav += Math.hypot(sx, sz);
    this.fx.set(this.pos, { x: this.dir.x, y: 0, z: this.dir.z });
    if (zone.geo.blocked(this.pos.x, this.pos.z, 0.05)) { if (op.r) this.landBlast(this.pos); else FX.burst('dust', this.pos, { radius: 0.5 }); return this.done(); }
    if (this.trav >= this.range) {
      if (op.kind === 'boomerang' && !this.back) { this.back = true; this.hit.clear(); return; }
      if (op.toGround || op.r) this.landBlast(this.pos);
      return this.done();
    }
    for (const c of zone.actors) {
      if (c.dead || c.faction === 'player' || c.isSummon || this.hit.has(c)) continue;
      if (Math.hypot(this.pos.x - c.pos.x, this.pos.z - c.pos.z) <= c.radius + (op.w ? op.w / 2 : 0.3)) {
        this.hit.add(c);
        if (!op.r) G.audio.sfx(skillSound(this.ctx.d, op));
        if (op.attach) { this.ctx.attached = c; this.ctx.attachedPos = { ...c.pos }; FX.burst('hit_pierce', c.pos, { radius: 0.5 }); this.eng.dmg(c, op.coef, this.ctx, op); return this.done(); }
        if (op.r) { this.landBlast({ ...c.pos }); return this.done(); }
        let coef = op.coef;
        if (op.crescendo) { c._cres = (c._cres || 0) + 1; if (c._cres >= (op.count || 4)) { coef *= 1 + op.crescendo * c._cres; c._cres = 0; } }
        this.eng.dmg(c, coef, this.ctx, op); this.eng.onHit(c, op, this.ctx);
        if (op.tri) { const m = marks(c); m.tri.add(op.tri); m.triT = 3; }
        if (op.stackSlow) { const s = c.status.list.find(x => x.def.id === 'slow'); if (s) s.value = Math.min(0.6, s.value + 0.06); }
        FX.burst(op.burst || 'hit_pierce', c.pos, { radius: 0.6 });
        if (op.chain) this.eng.chain(c, op.chain, this.ctx);
        if (!op.pierce && op.kind !== 'boomerang') return this.done();
      }
    }
  }
  landBlast(p) { const ts = this.eng.blast(p, { ...this.op, burst: this.op.burst }, this.ctx); for (const t of ts) if (this.op.tri) { const m = marks(t); m.tri.add(this.op.tri); m.triT = 3; } }
  done() { this.dead = true; this.fx.dispose(); }
  dispose() { this.done(); }
}

// ------------------------------------------------------------------ ground area
class SkillArea {
  constructor(eng, op, ctx, c, r, dur) {
    this.eng = eng; this.op = op; this.ctx = ctx; this.c = c; this.r = r; this.life = dur; this.maxLife = dur; this.tick = 0; this.extended = 0; this.empower = 0;
    const pos = c || eng.pc.pos;
    this.fx = FX.area(op.fx || (op.kind === 'heal' ? 'healing_mist' : 'danger'), pos, r, { color: ctx.d.fx && ctx.d.fx.color, duration: 0 });
    if (op.prop) { this.prop = FX.summon(op.prop, {}); this.prop.position.copy(T(pos)); G.render.scene.add(this.prop); }
  }
  extend(sec, cap) { if (this.extended >= cap) return; const k = Math.min(sec, cap - this.extended); this.extended += k; this.life += k; this.fx.pulse(); }
  update(dt) {
    const eng = this.eng, pc = eng.pc, op = this.op; this.life -= dt; this.tick -= dt;
    const c = this.c || pc.pos; if (!this.c) this.fx.setPos(c);
    if (this.prop && this.prop.userData.anim) this.prop.userData.anim(this.prop, this.life);
    if (this.life <= 0) return this.dispose();
    if (op.selfBuff && Math.hypot(pc.pos.x - c.x, pc.pos.z - c.z) < this.r) applyStatus(pc, { id: op.selfBuff[0], dur: 0.6, val: op.selfBuff[1], ch: 1 }, pc);
    if (this.tick > 0) return; this.tick = op.tick || 1;
    const k = this.ctx.mult * (1 + this.empower);
    if (op.kind === 'heal') {
      if (Math.hypot(pc.pos.x - c.x, pc.pos.z - c.z) < this.r + 0.3) { pc.heal(pc.maxHp * op.heal * k * (1 + pc.sheet.final.healPower)); if (op.cleanse) { const s = pc.status.list.find(x => x.def.debuff && x.def.cleanse !== false); if (s) pc.status.remove(s.def.id); } }
      for (const s of eng.summons) if (s.living && !s.dead && Math.hypot(s.pos.x - c.x, s.pos.z - c.z) < this.r + 0.3) s.hp = Math.min(s.maxHp, s.hp + s.maxHp * op.heal * k);
      return;
    }
    if (op.kind === 'ward') return;
    const ts = eng.targets(HitShape.circle(c.x, c.z, this.r));
    for (const t of ts) {
      if (op.coef) eng.dmg(t, op.coef * (1 + this.empower), this.ctx, { pull: op.pull, pullTo: c });
      for (const s of op.st || []) applyStatus(t, s, pc, this.ctx.mult);
      if (op.temp) { const m = marks(t); m.temp = clamp(m.temp + op.temp, -5, 5); m.tempT = 4; }
      if (op.empowerSummons) for (const s of eng.summons) if (!s.dead && s.living) s.empower = Math.max(s.empower || 0, op.empowerSummons);
    }
  }
  dispose() { if (this.dead) return; this.dead = true; this.fx.dispose(); if (this.prop) { G.render.scene.remove(this.prop); } }
}

// ------------------------------------------------------------------ summons (Combatant-like; live in zone.actors, faction player)
let SUID = 0;
export class Summon {
  constructor(eng, op, ctx, p) {
    const pc = eng.pc; this.eng = eng; this.o = op; this.ctx = ctx; this.kind = op.kind; this.zone = pc.zone; this.uid = ++SUID;
    this.pos = { ...p }; this.radius = op.kind === 'tree_guardian' || op.kind === 'fortress' ? 0.8 : 0.4; this.faction = 'player'; this.isSummon = true;
    this.living = !!op.living; this.machine = !!op.machine; this.taunt = !!op.taunt; this.fly = !!op.fly;
    this.maxHpV = Math.max(10, pc.maxHp * (op.hp || 0.5) * ctx.mult); this.hp = this.maxHpV; this.shield = 0; this.dead = false;
    this.life = (op.life || 10) * (1 + 0.05 * (ctx.L - 1)); this.cd = 0.4; this.t = 0; this.empower = 0; this.invuln = 0; this.knock = { x: 0, z: 0 };
    this.status = { list: [], has: () => false, apply: () => { }, remove: () => { }, flag: () => 0, bonus: () => 0, slow: 1 };
    this.facing = { ...ctx.facing };
    this.view = FX.summon(op.kind, {}); this.view.position.copy(T(this.pos)); G.render.scene.add(this.view);
    this.bar = null;
    if (op.ai === 'wall') this.makeWall(op);
    FX.burst(this.machine ? 'sparks' : 'root_burst', this.pos, { radius: 1 });
  }
  get maxHp() { return this.maxHpV; }
  stat(s) { const pc = this.eng.pc; if (s === 'def') return pc.stat('def') * 0.6; if (s === 'dmgReduce') return 0; if (s === 'moveSpeed') return 4.2; return pc.stat(s); }
  get stunned() { return false; }
  dist(o) { return Math.hypot(this.pos.x - o.pos.x, this.pos.z - o.pos.z); }
  makeWall(op) {
    const f = this.facing, w = op.width || 3, geo = this.zone.geo;
    // perpendicular to the cast direction; never placed on the player or a portal (validated before)
    const ang = Math.atan2(f.x, f.z) * 180 / Math.PI;
    this.wallTag = 'swall:' + this.uid;
    geo.boxes.push({ x: this.pos.x, z: this.pos.z, hw: w / 2, hd: 0.35, yaw: ang, tag: this.wallTag });
    this.view.rotation.y = -ang * DEG + Math.PI;
    if (geo.blocked(this.eng.pc.pos.x, this.eng.pc.pos.z, this.eng.pc.radius)) { geo.removeTag(this.wallTag); this.wallTag = null; this.life = 0.01; G.ui.toast('그 위치에는 벽을 세울 수 없습니다'); }
  }
  takeDamage(d) {
    if (this.dead || this.o.ai === 'trap' || this.o.ai === 'mine') return;
    let a = d.amount; this.hp -= a; G.ui.floatText(this.pos, Math.round(a) + '', '#ffb0b0', 0.8);
    this.flashT = 0.12;
    if (this.hp <= 0) this.destroy(true);
  }
  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }
  addShield() { }
  destroy(broken) {
    if (this.dead) return;
    const o = this.o;
    if (broken && o.onBreak) this.eng.blast(this.pos, { ...o.onBreak, coef: o.onBreak.coef }, this.ctx);
    if (!broken && o.onExpire) this.eng.blast(this.pos, o.onExpire, this.ctx);
    if (this.machine) { const v = this.eng.book.passive('powerRefund'); const cost = this.ctx.d.res && this.ctx.d.res.cost || 0; if (v && cost) this.eng.res.power = Math.min(10, this.eng.res.power + Math.min(cost, cost * v * (broken ? 0.5 : 1))); }
    this.vanish(true);
  }
  vanish(silent) {
    if (this.dead) return; this.dead = true;
    if (this.wallTag) this.zone.geo.removeTag(this.wallTag);
    G.render.scene.remove(this.view);
    const i = this.zone.actors.indexOf(this); if (i >= 0) this.zone.actors.splice(i, 1);
    if (!silent) FX.burst('dust', this.pos, { radius: 0.8 });
  }
  enemyNear(r, from = this.pos) {
    const pc = this.eng.pc; let pick = null;
    if (pc.target && !pc.target.dead && Math.hypot(pc.target.pos.x - from.x, pc.target.pos.z - from.z) < r + 3) return pc.target;            // owner's selected target first
    const focus = this.eng.summons.find(s => s.o.focus && !s.dead);
    let bd = 1e9; for (const c of this.zone.actors) { if (c.dead || c.faction === 'player' || c.isSummon) continue; let d = Math.hypot(c.pos.x - from.x, c.pos.z - from.z); if (focus && Math.hypot(c.pos.x - focus.pos.x, c.pos.z - focus.pos.z) < 3.2) d -= 4; if (d < r && d < bd) { bd = d; pick = c; } }
    return pick;
  }
  hitTarget(t, coef, extra) {
    const pc = this.eng.pc, oc = pc.status.flag('overclock') && this.machine ? 1 + pc.status.flag('overclock') : 1;
    const ctx = { ...this.ctx, machine: this.machine, mult: this.ctx.mult * (1 + this.empower) * oc };
    this.eng.dmg(t, coef, ctx, extra || {}); if (this.o.onHit) for (const s of this.o.onHit) applyStatus(t, s, pc);
  }
  update(dt) {
    if (this.dead) return;
    const o = this.o, eng = this.eng, pc = eng.pc; this.t += dt; this.life -= dt; this.cd -= dt;
    if (this.flashT > 0) this.flashT -= dt;
    if (this.life <= 0 || pc.dead || pc.zone !== this.zone) return this.destroy(false);
    const speedMul = pc.status.flag('overclock') && this.machine ? 1.5 : 1;
    const rate = (o.rate || 1) / speedMul;
    switch (o.ai) {
      case 'static_melee': case 'taunt_aoe': {
        const t = this.enemyNear(o.range || 2); if (t && this.cd <= 0) { this.cd = rate; if (o.ai === 'taunt_aoe') { for (const x of eng.targets(HitShape.circle(this.pos.x, this.pos.z, o.range))) this.hitTarget(x, o.coef); FX.burst('root_burst', this.pos, { radius: o.range }); } else { this.hitTarget(t, o.coef); FX.burst('hit_pierce', t.pos, {}); } }
        break;
      }
      case 'follow_ranged': case 'turret': case 'fortress': {
        if (o.ai === 'follow_ranged') { const want = { x: pc.pos.x - pc.facing.x * 1.4 + Math.cos(this.t + this.uid) * 1.2, z: pc.pos.z - pc.facing.z * 1.4 + Math.sin(this.t + this.uid) * 1.2 }; this.moveTowards(want, dt, 6); }
        const t = this.enemyNear(o.range || 7);
        if (t && this.cd <= 0) { this.cd = rate; this.face(t.pos); this.shoot(t, o.proj || 'bullet', o.coef); }
        if (o.healOwner && (this._h = (this._h || 0) + dt) >= (o.healEvery || 4)) { this._h = 0; pc.heal(pc.maxHp * o.healOwner * this.ctx.mult); FX.burst('heal', pc.pos, { radius: 0.8 }); }
        if (o.missiles && (this._m = (this._m || 0) + dt) >= o.missiles.every) { this._m = 0; for (let i = 0; i < o.missiles.n; i++) { const tt = this.enemyNear(12); if (tt) this.shoot(tt, 'missile', o.missiles.coef, 1.6); } }
        break;
      }
      case 'chase_melee': case 'taunt_melee': {
        const t = this.enemyNear(9);
        if (!t) { if (this.dist(pc) > 3) this.moveTowards(pc.pos, dt, 5); break; }
        if (this.dist(t) > (o.range || 1.6) + t.radius) this.moveTowards(t.pos, dt, 5.2); else if (this.cd <= 0) { this.cd = rate; this.face(t.pos); this.hitTarget(t, o.coef); FX.slash('arc', t.pos, this.facing, { radius: 1.2 }); }
        break;
      }
      case 'mine': case 'trap': {
        const t = this.enemyNear(o.trigger || 1.2);
        if (t) {
          if (o.ai === 'mine' && o.chase && this.dist(t) > 0.9) { this.moveTowards(t.pos, dt, 6); this._armed = (this._armed || 0) + dt; if (this._armed < o.chase / 6) break; }
          const b = o.boom || o.onTrigger; this.eng.blast(this.pos, { ...b, coef: b.coef * (1 + this.empower) }, this.ctx); this.vanish(true);
        }
        break;
      }
      case 'bomb': if (this.t >= (o.fuse || 2)) { this.eng.blast(this.pos, o.boom, this.ctx); this.vanish(true); } else if (this.view.userData.anim) this.view.userData.anim(this.view, this.t); break;
      case 'aura': {
        if (this.cd <= 0) { const a = o.aura; this.cd = a.tick; for (const t of eng.targets(HitShape.circle(this.pos.x, this.pos.z, a.r))) { this.hitTarget(t, a.coef); for (const s of a.st || []) applyStatus(t, s, pc); } }
        if (!this._fx) this._fx = FX.area(o.aura.fx || 'emfield', this.pos, o.aura.r, {}); break;
      }
      case 'decoy': case 'wall': case 'amp': break;
    }
    if (this.view.userData.anim) this.view.userData.anim(this.view, this.t);
    this.view.position.copy(T({ x: this.pos.x, y: this.pos.y + (this.fly ? 1.4 + Math.sin(this.t * 3 + this.uid) * 0.15 : 0), z: this.pos.z }));
    if (!this.wallTag) this.view.rotation.y = Math.atan2(this.facing.x, -this.facing.z);
  }
  face(p) { const dx = p.x - this.pos.x, dz = p.z - this.pos.z, m = Math.hypot(dx, dz); if (m > 1e-3) this.facing = { x: dx / m, z: dz / m }; }
  moveTowards(p, dt, sp) {
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z, m = Math.hypot(dx, dz); if (m < 0.2) return;
    this.face(p); const k = Math.min(m, sp * dt);
    if (this.fly) { this.pos = { x: this.pos.x + dx / m * k, y: this.pos.y, z: this.pos.z + dz / m * k }; return; }
    const before = { ...this.pos }; this.pos = this.zone.geo.move(this.pos, dx / m * k, dz / m * k, this.radius);
    // stuck in terrain -> recover next to the owner
    if (Math.hypot(this.pos.x - before.x, this.pos.z - before.z) < k * 0.1) { this._stuck = (this._stuck || 0) + dt; if (this._stuck > 1.5) { const pc = this.eng.pc; this.pos = this.zone.geo.ground(pc.pos.x - pc.facing.x, pc.pos.z - pc.facing.z); this._stuck = 0; } }
  }
  shoot(t, kind, coef, blastR) {
    const eng = this.eng, from = { x: this.pos.x, y: this.pos.y + (this.fly ? 1.4 : 0.8), z: this.pos.z };
    const fx = FX.projectile(kind, {}); const self = this; let life = 0; const sp = kind === 'missile' ? 9 : 16;
    const p = { pos: { ...from }, dead: false, update(dt) {
      life += dt; if (t.dead || life > 2) { this.done(); return; }
      const dx = t.pos.x - p.pos.x, dz = t.pos.z - p.pos.z, m = Math.hypot(dx, dz);
      if (m < t.radius + 0.25) { if (blastR) eng.blast(t.pos, { r: blastR, coef, burst: 'explosion_fire' }, { ...self.ctx, mult: self.ctx.mult * (1 + self.empower) }); else self.hitTarget(t, coef); FX.burst('hit_pierce', t.pos, { radius: 0.5 }); this.done(); return; }
      p.pos = { x: p.pos.x + dx / m * sp * dt, y: p.pos.y + ((t.pos.y + 0.7) - p.pos.y) * Math.min(1, dt * 4), z: p.pos.z + dz / m * sp * dt }; fx.set(p.pos, { x: dx / m, y: 0, z: dz / m });
    }, done() { this.dead = true; fx.dispose(); }, dispose() { this.done(); } };
    eng.things.push(p);
  }
  // Combatant API used elsewhere
  get xz() { return this.pos; }
  setFacing() { }
  get body() { return null; }
}

// ------------------------------------------------------------------ unique mechanics
export const CUSTOM = {
  triple_check(eng, op, ctx) {   // 삼중 처방: a target hit by fire+ice+shock within 3 s explodes once
    eng.pending.push({ time: eng.clock + 0.9, op: { op: '_run', run: () => {
      for (const t of eng.pc.zone.actors) { const m = t._marks; if (!m || t.dead || m.tri.size < 3) continue; m.tri.clear(); eng.blast(t.pos, { r: op.r, coef: op.coef, burst: 'explosion_prism' }, ctx); }
    } }, ctx });
  },
  mark_chain(eng, op, ctx) {      // 연쇄 약병 폭발: each marked enemy explodes once (no re-trigger)
    const start = ctx.tgt; if (!start) return; const done = new Set(); const queue = [start];
    while (queue.length) {
      const t = queue.shift(); if (done.has(t) || t.dead) continue; done.add(t);
      const n = takeMarks(t, 'reaction'); if (t !== start && !n) continue;
      const ts = eng.blast(t.pos, { r: 2.2, coef: op.coef * (1 + n * op.perStack), burst: 'explosion_acid' }, ctx);
      if (eng.book.passive('residue')) eng.addArea({ op: 'area', kind: 'dmg', r: 1.8, dur: 4, tick: 1, coef: eng.book.passive('residue'), fx: 'toxic_residue' }, ctx, t.pos);
      for (const x of eng.pc.zone.actors) if (!x.dead && x._marks && x._marks.reaction > 0 && !done.has(x) && Math.hypot(x.pos.x - t.pos.x, x.pos.z - t.pos.z) < op.range) { FX.beam('lightning', t.pos, x.pos, { duration: 0.3 }); queue.push(x); }
      void ts;
    }
  },
  critical_mass(eng, op, ctx) {   // 임계 반응
    const pc = eng.pc; let total = 0; const ts = eng.targets(HitShape.circle(pc.pos.x, pc.pos.z, op.r));
    for (const t of ts) total += takeMarks(t, 'reaction');
    total = Math.min(op.cap, total);
    FX.burst('explosion_big', pc.pos, { radius: op.r });
    for (const t of ts) eng.dmg(t, op.coef * (1 + total * op.perStack / Math.max(1, ts.length)), ctx, {});
    G.ui.floatText(pc.pos, '반응 ' + total, '#9ad8ff', 1.1, 2.4);
  },
  march(eng, op, ctx) {           // 불꽃 꼬치 행진 / 오픈 키친 ring
    const pc = eng.pc, f = ctx.facing, o = ctx.origin;
    for (let i = 0; i < op.n; i++) {
      const p = op.ring ? { x: pc.pos.x + Math.cos(i / op.n * 6.283) * op.ring, z: pc.pos.z + Math.sin(i / op.n * 6.283) * op.ring } : { x: o.x + f.x * (1.2 + i * op.step), z: o.z + f.z * (1.2 + i * op.step) };
      eng.pending.push({ time: eng.clock + i * op.gap, op: { op: '_run', run: () => {
        if (pc.zone.geo.blocked(p.x, p.z, 0.1)) return;
        FX.burst('explosion_fire', p, { radius: op.r }); FX.beam('skewer_row', p, { x: p.x, y: 1.2, z: p.z }, { duration: 0.6 });
        for (const t of eng.targets(HitShape.circle(p.x, p.z, op.r))) { eng.dmg(t, op.coef, ctx, {}); eng.onHit(t, { temp: op.temp, st: [{ id: 'burn', dur: 2, val: 0.08, ch: 1 }] }, ctx); }
      } }, ctx });
    }
  },
  barrage(eng, op, ctx) {         // 궤도 포격
    const c = ctx.aim; FX.summon && null;
    for (let i = 0; i < op.n; i++) eng.pending.push({ time: eng.clock + op.start + i * op.gap, op: { op: '_run', run: () => {
      const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * op.r; eng.blast({ x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r }, { r: op.blast, coef: op.coef, burst: op.burst }, ctx);
      G.render.addShake && !G.reduceFlash && G.render.addShake(0.06, 0.12);
    } }, ctx });
  },
  runway(eng, op, ctx) {          // 환상의 런웨이: ribbon dashes of afterimages through nearby enemies
    const pc = eng.pc;
    for (let i = 0; i < op.n; i++) eng.pending.push({ time: eng.clock + i * op.gap, op: { op: '_run', run: () => {
      const ts = eng.targets(HitShape.circle(pc.pos.x, pc.pos.z, op.r)); const t = ts[i % Math.max(1, ts.length)];
      if (!t) return; FX.beam('ribbon_line', pc.pos, t.pos, { duration: 0.4 }); FX.slash('cross', t.pos, pc.facing, { radius: 1.4 });
      eng.dmg(t, op.coef, ctx, {}); eng.onHit(t, { mark: op.mark }, ctx);
    } }, ctx });
  },
  dragon(eng, op, ctx) {          // 살아 있는 용화
    const o = ctx.origin, f = ctx.facing, end = { x: o.x + f.x * op.len, z: o.z + f.z * op.len };
    FX.beam('ink_stroke', o, end, { width: op.w, duration: 1.4 });
    const dragon = FX.summon('ink_dragon', {}); dragon.position.copy(T(o)); dragon.rotation.y = Math.atan2(f.x, -f.z); G.render.scene.add(dragon);
    let t = 0; eng.things.push({ dead: false, update(dt) { t += dt; const k = Math.min(1, t / 1.2); dragon.position.copy(T({ x: o.x + f.x * op.len * k, y: 0.6, z: o.z + f.z * op.len * k })); if (dragon.userData.anim) dragon.userData.anim(dragon, t); if (t > 1.6) { this.dead = true; G.render.scene.remove(dragon); } }, dispose() { G.render.scene.remove(dragon); this.dead = true; } });
    const mid = { x: (o.x + end.x) / 2, z: (o.z + end.z) / 2 };
    for (let i = 0; i < op.hits; i++) eng.pending.push({ time: eng.clock + 0.2 + i * op.gap, op: { op: '_run', run: () => { for (const x of eng.targets(HitShape.rect(o.x, o.z, f.x, f.z, op.w, op.len))) { eng.dmg(x, op.coef, ctx, {}); addMark(x, 'color', 1, 'ink'); } } }, ctx });
  },
  dots(eng, op, ctx) {            // 황금의 점묘
    const t0 = ctx.tgt; if (!t0) return; const c = { ...t0.pos };
    for (let i = 0; i < op.n; i++) {
      const a = i / op.n * 6.283, p = { x: c.x + Math.cos(a) * op.r * 0.6, z: c.z + Math.sin(a) * op.r * 0.6 };
      FX.burst('explosion_gold', p, { radius: 0.3 });
      eng.pending.push({ time: eng.clock + op.start + i * op.gap, op: { op: '_run', run: () => { for (const t of eng.blast(p, { r: op.blast, coef: op.coef, burst: op.burst }, ctx)) addMark(t, 'color', 1, 'gold'); } }, ctx });
    }
  },
  mix(eng, op, ctx) {             // 혼색 반응
    const t = ctx.tgt; if (!t) return; const n = takeMarks(t, 'color');
    eng.blast(t.pos, { r: op.r + op.rPer * n, coef: op.coef * (1 + n * op.perColor), burst: n >= 2 ? 'explosion_prism' : 'explosion_ink' }, ctx);
    G.ui.floatText(t.pos, '혼색 ' + n, '#e0a0ff', 1, 2);
  },
  prism(eng, op, ctx) {           // 프리즘 대폭발: each painted landscape area reacts once
    const pc = eng.pc; let colors = 0;
    for (const t of eng.targets(HitShape.circle(pc.pos.x, pc.pos.z, op.r))) colors += takeMarks(t, 'color');
    eng.blast(pc.pos, { r: op.r, coef: op.coef * (1 + Math.min(10, colors) * op.perColor * 0.1), burst: 'explosion_prism' }, ctx);
    for (const a of eng.areas.slice()) if (a.op.landscape && !a.prismed) { a.prismed = true; eng.blast(a.c || pc.pos, { r: a.r, coef: op.coef * 0.3, burst: 'explosion_prism' }, ctx); }
  },
  symphony(eng, op, ctx) {        // 그랜드 심포니
    const pc = eng.pc;
    for (let i = 0; i < op.n; i++) eng.pending.push({ time: eng.clock + 0.6 + i * op.gap, op: { op: '_run', run: () => {
      const ts = eng.targets(HitShape.circle(pc.pos.x, pc.pos.z, op.r)); const t = ts[Math.floor(Math.random() * ts.length)]; if (!t) return;
      FX.beam('soundwave_line', pc.pos, t.pos, { duration: 0.3 }); eng.dmg(t, op.coef, ctx, {}); eng.gain('phrase', 0.5, ctx);
    } }, ctx });
    eng.pending.push({ time: eng.clock + 0.8 + op.n * op.gap, op: { op: '_run', run: () => { eng.blast(pc.pos, { r: op.finale.r, coef: op.finale.coef, burst: 'explosion_note' }, ctx); } }, ctx });
  },
};
// internal deferred closure op
SkillEngine.prototype._origExec = SkillEngine.prototype.exec;
SkillEngine.prototype.exec = function (op, ctx) { if (ctx && ctx.grade) FXG = ctx.grade; try { if (op.op === '_run') return op.run(); return this._origExec(op, ctx); } finally { FXG = 1; } };
