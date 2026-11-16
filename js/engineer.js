// 엔지니어(engineer) 2차 스킬 규칙 (2026-11-16 개편): 전술 기계공학 · 전자기 무장술 · 현장 정비와 동력 제어.
// 스킬 데이터는 tools/skills2/gen.py (en_*, 수치는 custom op 필드), 실행은 js/skillrt.js 가 이 파일의 EnKit 을 부름(eng.en, CUSTOM en_*).
// 화면은 js/engfx.js (FX.en(kind, a, o)). 이 파일은 렌더링을 하지 않음 — fx 가 null 이어도(메시 로딩 전·테스트) 규칙은 그대로.
//
// 병기(기계 소환물)는 skillrt Summon(ai 'en')으로 zone.actors 에 들어가고, 움직임·사격은 machineTick 이 맡음.
// 표적 순서(모든 병기 공통): 1) 내 테슬라 앵커가 지정한 대상 2) 사거리 안의 내 선택 대상 3) 가까운 적. 재탐색 EN.scan 초마다.
//   지정·선택은 이 엔지니어(eng)의 것만 봄 — 다른 플레이어의 앵커·선택은 섞이지 않음.
// 탄·미사일은 실제로 날아가 닿는 순간에 피해(그림과 같은 시각). 대상이 사라지면 피해 없이 사라지거나(탄) 가까운 적으로(미사일).
// 회수(리커버리 코어): 수명 종료 = 들인 전력 × 비율, 파괴 = 절반, 교체·지역 이동·쓰러짐·소모(지뢰 폭발) = 없음. 기계마다 한 번, 들인 몫을 넘지 않음.
// 레드라인: 주인 단위 상태(병기마다 값을 바꾸지 않고 매번 계산) — 새로 놓은 병기는 남은 시간만, 끝나면 정확히 원래 값, 냉각은 재소환으로 못 피함.
// 타격감: 모든 피해는 quiet(전역 G.hitStop·무작위 흔들림 없음), 카메라 kick 은 파일 벙커·워커 주포·오비탈 중심 포격 한 번씩만.
import { HitShape } from './core.js';

export const EN = {
  job: 'engineer',
  scan: 0.25,                                     // 재탐색 간격(초)
  sentry: { fly: 0.36, deploy: 0.55, turn: 10, aim: 0.3, speed: 24, muzzle: 0.62, y: 0.98 },
  spider: { fly: 0.32, unfold: 0.4, leapT: 0.24, rest: 1.2, stuck: 0.5, skip: 2.0 },
  drones: { eject: 0.12, unfold: 0.35, align: 0.3, speed: 7, far: 14, slots: [[-1.5, 1.55, 0.1], [1.5, 1.55, 0.1], [0.75, 1.35, 1.25]], bullet: 26 },
  anchor: { fly: 0.3, pin: 0.1, link: 0.35, min: 1.0 },
  walker: { drop: 0.35, assemble: 1.3, fold: 0.9, speed: 1.6, r: 0.9, gunAt: 0.25, missileAt: 2.1, chargeAt: 3.6, cannonAt: 4.0, missileSpeed: 10, shell: 32, kick: [0.12, 0.1] },
  pile: { strike: 0.28, stop: 0.07, kick: [0.11, 0.1], reach: 0.6, ang: 70 },
  breach: { fire: 0.30, back: 0.3 },
  hive: { first: 0.32, gap: 0.09, rise: 0.3, speed: 12, turn: 8.0, life: 2.6 },
  rail: { fire: 0.88, back: 0.35, mark: 8 },
  orbital: { lock0: 0.35, lockGap: 0.28, first: 1.45, gap: 0.25, core: 2.45, kick: [0.13, 0.12] },
  core: { fly: 0.55 },
  module: { speed: { rate: 1.12, dmg: 0.95 }, power: { rate: 1 / 1.06, dmg: 1.10 } },   // 무기 모듈(core.js 와 같은 장단점)이 총기 병기에도
};
const call = (h, m, ...a) => { try { return h && h[m] ? h[m](...a) : null; } catch (e) { console.warn('engfx', m, e); return null; } };
const alive = (t) => !!(t && !t.dead && !t.removed);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const GUN_KINDS = new Set(['sentry', 'drone', 'walker']);   // 모듈 어셈블리가 적용되는 병기(총기). 지뢰·앵커는 그대로
/** point in triangle (xz) */
export function inTri(p, a, b, c) {
  const s = (p1, p2, p3) => (p1.x - p3.x) * (p2.z - p3.z) - (p2.x - p3.x) * (p1.z - p3.z);
  const d1 = s(p, a, b), d2 = s(p, b, c), d3 = s(p, c, a);
  return !(((d1 < 0) || (d2 < 0) || (d3 < 0)) && ((d1 > 0) || (d2 > 0) || (d3 > 0)));
}

export class EnKit {
  constructor(eng, h) { this.eng = eng; this.h = h; this.reset(); }
  reset() { this.anchor = null; this.beacon = null; this.red = null; this.railed = new Map(); this.focusFx = null; this.focusT = null; this.log = { refunds: [], shots: 0, misses: 0 }; }
  get pc() { return this.eng.pc; }
  get G() { return this.h.G(); }
  get clock() { return this.eng.clock; }
  fx(kind, a, o) { return this.h.fx(kind, a, o); }
  sfx(n, o) { try { this.G.audio.sfx(n, o); } catch (e) { } }
  lvl(id) { return Math.max(1, this.eng.book.level(id)); }
  later(sec, fn, ctx) { this.eng.pending.push({ time: this.clock + Math.max(0, sec), op: { op: '_run', run: fn }, ctx }); }
  /** run fn at `t` s after the button press (ctx.t0, onCast) */
  at(ctx, t, fn) { this.later(t - (this.clock - (ctx.t0 ?? this.clock)), fn, ctx); }
  handPoint() {
    const pc = this.pc; let h = null; try { h = pc.body && pc.body.handPoint && pc.body.handPoint(); } catch (e) { h = null; }
    return h ? { x: h.x, y: h.y, z: -h.z } : { x: pc.pos.x + pc.facing.x * 0.4, y: (pc.pos.y || 0) + 1.2, z: pc.pos.z + pc.facing.z * 0.4 };
  }
  machines() { return this.eng.summons.filter(s => !s.dead && s.machine); }
  mine(kind) { return this.eng.summons.filter(s => !s.dead && s.en && s.en.kind === kind); }

  // ------------------------------------------------------------------ 표적
  valid(t, from, r) {
    if (!alive(t) || t.faction === 'player' || t.isSummon) return false;
    if (t.zone && this.pc.zone && t.zone !== this.pc.zone) return false;
    return !from || dist(t.pos, from) <= r + (t.radius || 0.5);
  }
  /** 내 테슬라 앵커가 지금 지정한 대상(살아 있고 삼각형 안) */
  focus() { const a = this.anchor; return a && !a.dead && a.en.phase === 'on' && this.valid(a.en.focus) ? a.en.focus : null; }
  pickTarget(from, r, cur) {
    const f = this.focus(); if (f && this.valid(f, from, r)) return f;
    const sel = this.pc.target; if (sel && this.valid(sel, from, r)) return sel;
    if (cur && this.valid(cur, from, r)) return cur;
    let best = null, bd = 1e9;
    for (const t of this.pc.zone.actors) { if (!this.valid(t, from, r)) continue; const d = dist(t.pos, from); if (d < bd) { bd = d; best = t; } }
    return best;
  }
  enemiesIn(shape) { return this.eng.targets(shape); }

  // ------------------------------------------------------------------ 병기 배율 (레드라인 · 냉각 · 모듈) — 매번 계산하므로 끝나면 정확히 원래 값
  heat() { const r = this.red; if (!r) return 0; if (this.clock < r.until) return 1; if (this.clock < r.coolUntil) return -1; return 0; }
  moduleOf() { const p = this.pc.sheet && this.pc.sheet.p, w = p && p.weapon, m = w && p.gearMods && p.gearMods[w] && p.gearMods[w].mod; return m === 'speed' || m === 'power' ? m : null; }
  mods(s) {
    const out = { rate: 1, dmg: 1, minGap: 0 };
    if (!s || !s.machine || s.living) return out;
    const h = this.heat(), r = this.red;
    if (h > 0) { out.rate *= r.rate; out.dmg *= 1 + r.dmg; out.minGap = r.minGap; }
    else if (h < 0) { out.rate *= r.coolRate; out.dmg *= 1 + r.coolDmg; }
    const m = s.en && GUN_KINDS.has(s.en.kind) ? this.moduleOf() : null;
    if (m) { out.rate *= EN.module[m].rate; out.dmg *= EN.module[m].dmg; }
    return out;
  }
  gap(base, s) { const m = this.mods(s); return Math.max(m.minGap || 0, base / m.rate); }

  // ------------------------------------------------------------------ 피해 (엔지니어 공통: quiet)
  hit(t, coef, ctx, o = {}) {
    if (!alive(t)) return { amount: 0, missed: true };
    const amount = this.eng.dmg(t, coef, ctx, { elem: o.elem, quiet: true, derived: !!o.derived, armorPen: o.pen || 0 });
    const missed = !!ctx.missed;
    if (!missed) for (const s of o.st || []) this.h.applyStatus(t, s, this.pc, ctx.mult);
    if (!missed) this.log.shots++; else this.log.misses++;
    return { amount, missed };
  }

  // ------------------------------------------------------------------ 시전 훅
  onCast(d, ctx) {
    if (!d || d.job !== EN.job) return;
    ctx.t0 = this.clock;
    if (d.res && d.res.gain) this.eng.gain(d.res.type, d.res.gain, ctx);   // 벌집 미사일 포드: 전력 +1 (예전 그대로)
    const pc = this.pc, f = ctx.facing;
    // 손·팔·어깨에서 바로 시작하는 장치(누른 순간부터 보임 — 규칙의 피해 시각은 op 쪽)
    const fn = (d.ops.find(o => o.op === 'custom') || {}).fn;
    if (fn === 'en_pile') ctx.enFx = this.fx('pile', pc, { f, strike: EN.pile.strike });
    else if (fn === 'en_breach') ctx.enFx = this.fx('breach', pc, { f, fire: EN.breach.fire });
    else if (fn === 'en_rail') ctx.enFx = this.fx('rail', pc, { f: { ...f }, len: d.ops[0].len, w: d.ops[0].w, fire: EN.rail.fire });
    else if (fn === 'en_hive') ctx.enFx = this.fx('pod', pc, { n: this.hiveN(d.ops[0]), first: EN.hive.first, gap: EN.hive.gap });
    else if (fn === 'en_orbital' || fn === 'en_redline' || fn === 'en_drones') ctx.enFx = this.fx('signal', pc, { kind: fn });
  }
  validate(d, aim) {
    if (!d || d.job !== EN.job) return null;
    const op = d.ops.find(o => o.op === 'custom'); if (!op) return null;
    if (op.fn === 'en_redline' && this.red && this.clock < this.red.coolUntil) return this.clock < this.red.until ? '이미 과부하 중입니다' : '냉각 중에는 쓸 수 없습니다';
    if (op.fn === 'en_sentry' || op.fn === 'en_spider' || op.fn === 'en_anchor') {
      const p = this.eng.groundAim(d, aim); if (this.pc.zone.geo.blocked(p.x, p.z, 0.4)) return '설치할 수 없는 위치입니다';
      if (this.eng.nearPortal(p, 2.5)) return '출입구 근처에는 설치할 수 없습니다';
    }
    if (op.fn === 'en_walker' && !this.walkerSpot()) return '병기를 세울 자리가 없습니다';
    return null;
  }

  // ------------------------------------------------------------------ 병기 만들기 · 끝내기
  spawn(kind, op, ctx, p, en) {
    const sop = { ...op, kind: 'en_' + kind, ai: 'en', en: kind, machine: true, living: false };
    // 종류마다 상한(가장 오래된 것 교체 — 교체는 회수 없음), 전체 8
    const lim = op.limit || 1, same = this.mine(kind).filter(s => kind !== 'drone' || s.en.lead);
    if (kind === 'drone') { if (en.idx === 0) for (const s of this.mine('drone')) { s.endWhy = 'replace'; s.vanish(false); } }
    else if (same.length >= lim) { same[0].endWhy = 'replace'; same[0].vanish(false); }
    const all = this.eng.summons.filter(s => !s.dead); if (all.length >= 8) { all[0].endWhy = 'replace'; all[0].vanish(false); }
    const s = new this.h.Summon(this.eng, sop, ctx, { x: p.x, y: p.y || 0, z: p.z });
    s.en = { kind, phase: 'fly', t: 0, yaw: Math.atan2(ctx.facing.x, ctx.facing.z), pitch: 0, recoil: 0, tgt: null, scanT: 0, cost: 0, ...en };
    const cost = ctx.d.res && ctx.d.res.cost || 0; s.en.cost = en && en.share != null ? en.share : cost;
    if (kind === 'spider') s.untargetable = true;
    this.eng.summons.push(s); this.pc.zone.actors.push(s);
    s.vh = this.fx(kind, s, { kit: this, op: sop });
    return s;
  }
  /** Summon.vanish -> 여기서 한 번: 회수(수명 종료·파괴만), 그림 정리 */
  onEnd(s, why) {
    if (!s.en || s.en.ended) return; s.en.ended = why;
    if (this.anchor === s) { this.anchor = null; this.setFocusFx(null); }
    const v = this.eng.book.passive('powerRefund'), share = s.en.cost || 0;
    if (v > 0 && share > 0 && !s.en.refunded && (why === 'expire' || why === 'broken')) {
      s.en.refunded = true;
      const n = Math.min(share, share * v * (why === 'broken' ? 0.5 : 1));
      this.eng.res.power = Math.min(10, (this.eng.res.power || 0) + n);
      this.log.refunds.push({ kind: s.en.kind, why, n });
      call(this.fx('core', { x: s.pos.x, y: (s.pos.y || 0) + 0.8, z: s.pos.z }, { to: this.pc, n }), 'noop');   // 작은 청색 코어가 공구 장치로 (그림만 — 지급은 위에서 한 번)
    }
    call(s.vh, 'end', why);
  }

  // ------------------------------------------------------------------ A1 전개식 센트리
  en_sentry(op, ctx) {
    const p = this.pc.zone.geo.ground(ctx.aim.x, ctx.aim.z), from = this.handPoint();
    const s = this.spawn('sentry', op, ctx, p, { from, fireCd: 0.2, streak: 0, last: null, burstCd: 0, burstLeft: 0, burstT: 0 });
    this.sfx('en_lock');
    return s;
  }
  tickSentry(s, dt) {
    const e = s.en, o = s.o, K = EN.sentry;
    if (e.phase === 'fly') { if (e.t >= K.fly) { e.phase = 'deploy'; e.t = 0; this.sfx('en_motor'); } return; }
    if (e.phase === 'deploy') { if (e.t >= K.deploy) { e.phase = 'on'; e.t = 0; } return; }
    e.scanT -= dt; e.fireCd -= dt; e.burstCd -= dt; e.recoil = Math.max(0, e.recoil - dt * 6);
    if (e.scanT <= 0 || !this.valid(e.tgt, s.pos, o.range)) { e.scanT = EN.scan; const nt = this.pickTarget(s.pos, o.range, e.tgt); if (nt !== e.tgt) { e.tgt = nt; e.streak = 0; } }
    const t = e.tgt; if (!t) { e.pitch *= 0.9; return; }
    const want = Math.atan2(t.pos.x - s.pos.x, t.pos.z - s.pos.z); let dy = want - e.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    e.yaw += Math.max(-K.turn * dt, Math.min(K.turn * dt, dy));
    e.pitch = Math.atan2(((t.pos.y || 0) + 0.6) - ((s.pos.y || 0) + K.y), Math.max(0.5, dist(t.pos, s.pos)));
    if (Math.abs(dy) > K.aim) return;
    if (e.burstLeft > 0) { e.burstT -= dt; if (e.burstT <= 0) { e.burstLeft--; e.burstT = o.burst.gap; this.fire(s, t, o.burst.coef, true); } return; }
    if (e.fireCd > 0) return;
    e.fireCd = this.gap(o.rate, s);
    this.fire(s, t, o.coef, false);
  }
  muzzle(s) { const e = s.en, K = EN.sentry; return { x: s.pos.x + Math.sin(e.yaw) * K.muzzle, y: (s.pos.y || 0) + K.y + Math.sin(e.pitch) * K.muzzle, z: s.pos.z + Math.cos(e.yaw) * K.muzzle }; }
  /** one sentry round: leaves the muzzle now, damages when it arrives; the focus streak counts real hits on the same target */
  fire(s, t, coef, burst) {
    const e = s.en; e.recoil = 1; this.sfx('en_shot', { gap: 40 });
    call(s.vh, 'fire', { burst });
    this.bullet(s, this.muzzle(s), t, coef, EN.sentry.speed, (ok) => {
      if (burst || !ok) { if (!ok) e.streak = 0; return; }
      e.streak = e.last === t ? e.streak + 1 : 1; e.last = t;
      if (e.streak >= s.o.focusN && e.burstCd <= 0) { e.streak = 0; e.burstCd = s.o.burst.cd; e.burstLeft = s.o.burst.n; e.burstT = 0.05; call(s.vh, 'focus', t); }
    });
  }
  /** a travelling round (machine gun / drone): damage when it reaches the target, nothing when the target is gone */
  bullet(s, from, t, coef, speed, done, o = {}) {
    const kit = this, ctx = s.ctx, fx = this.fx('bullet', from, { col: o.col, big: o.big });
    const p = { pos: { ...from }, dead: false, life: 0, update(dt) {
      this.life += dt; if (kit.pc.dead || !alive(t) || this.life > 1.2) { call(fx, 'dispose'); this.dead = true; if (done) done(false); return; }
      const to = { x: t.pos.x, y: (t.pos.y || 0) + Math.min(1.0, 0.35 + (t.radius || 0.5) * 0.6), z: t.pos.z }, dx = to.x - this.pos.x, dy = to.y - this.pos.y, dz = to.z - this.pos.z, m = Math.hypot(dx, dy, dz) || 1, step = speed * dt;
      if (m <= step + (t.radius || 0.5) * 0.6) {
        this.dead = true; call(fx, 'dispose');
        const c = { ...ctx, mult: ctx.mult * kit.mods(s).dmg };
        const r = kit.hit(t, coef, c, { elem: o.elem }); ctx.missed = c.missed;
        kit.fx('impact', to, { kind: o.impact || 'bullet', ok: !r.missed }); if (done) done(!r.missed); return;
      }
      this.pos = { x: this.pos.x + dx / m * step, y: this.pos.y + dy / m * step, z: this.pos.z + dz / m * step }; call(fx, 'set', this.pos, { x: dx / m, y: dy / m, z: dz / m });
    }, dispose() { this.dead = true; call(fx, 'dispose'); } };
    this.eng.things.push(p); return p;
  }

  // ------------------------------------------------------------------ A2 스파이더 마인
  en_spider(op, ctx) {
    const p = this.pc.zone.geo.ground(ctx.aim.x, ctx.aim.z);
    return this.spawn('spider', op, ctx, p, { from: this.handPoint(), run: 0, total: op.total, skip: new Map(), stuckT: 0, blink: 0 });
  }
  tickSpider(s, dt) {
    const e = s.en, o = s.o, K = EN.spider;
    if (e.phase === 'fly') { if (e.t >= K.fly) { e.phase = 'unfold'; e.t = 0; this.sfx('en_lock', { gap: 30 }); } return; }
    if (e.phase === 'unfold') { if (e.t >= K.unfold) { e.phase = 'idle'; e.t = 0; } return; }
    if (e.phase === 'leap') {
      const t = e.tgt, k = clamp01(e.t / K.leapT);
      if (alive(t)) { s.pos = { x: e.leapFrom.x + (t.pos.x - e.leapFrom.x) * k * 0.85, y: s.pos.y, z: e.leapFrom.z + (t.pos.z - e.leapFrom.z) * k * 0.85 }; }
      if (k >= 1) this.spiderBoom(s);
      return;
    }
    if (e.phase === 'rest') { if (e.t >= K.rest) { e.phase = 'idle'; e.t = 0; } return; }
    const skipOk = (t) => !(e.skip.get(t) > this.clock);
    if (e.phase === 'idle') {
      e.scanT -= dt; if (e.scanT > 0) return; e.scanT = EN.scan;
      let t = null, bd = 1e9; for (const c of this.pc.zone.actors) { if (!this.valid(c, s.pos, o.trigger) || !skipOk(c)) continue; const d = dist(c.pos, s.pos); if (d < bd) { bd = d; t = c; } }
      if (!t) return;
      if (e.total <= 0 && bd > o.leap + (t.radius || 0.5)) return;          // 쫓을 거리를 다 썼음: 바로 곁에 온 적만
      e.tgt = t; e.phase = 'chase'; e.t = 0; e.run = Math.min(o.run, e.total); e.stuckT = 0; call(s.vh, 'alert'); this.sfx('en_motor', { gap: 120 });
      return;
    }
    if (e.phase === 'chase') {
      let t = e.tgt;
      if (!this.valid(t)) { t = null; let bd = 1e9; for (const c of this.pc.zone.actors) { if (!this.valid(c, s.pos, o.trigger + 1) || !skipOk(c)) continue; const d = dist(c.pos, s.pos); if (d < bd) { bd = d; t = c; } } e.tgt = t; if (!t) { e.phase = 'idle'; e.t = 0; return; } }
      const d = dist(t.pos, s.pos);
      if (d <= o.leap + (t.radius || 0.5)) { e.phase = 'leap'; e.t = 0; e.leapFrom = { ...s.pos }; call(s.vh, 'leap'); return; }
      if (e.run <= 0) { e.phase = 'rest'; e.t = 0; return; }                  // 한 번에 쫓는 거리 끝
      const before = { ...s.pos }; s.moveTowards(t.pos, dt, o.speed); const moved = dist(before, s.pos);
      e.run -= moved; e.total -= moved;
      if (moved < o.speed * dt * 0.1) { e.stuckT += dt; if (e.stuckT > K.stuck) { e.skip.set(t, this.clock + K.skip); e.tgt = null; e.phase = 'rest'; e.t = 0; } } else e.stuckT = 0;   // 막힘: 그 적은 잠시 무시
    }
  }
  spiderBoom(s) {
    const o = s.o, c = { x: s.pos.x, z: s.pos.z }, ts = this.enemiesIn(HitShape.circle(c.x, c.z, o.r));
    for (const t of ts) this.hit(t, o.coef, s.ctx, { elem: o.elem });             // 한 번 폭발 = 대상마다 한 번
    this.fx('blast', { x: c.x, y: s.pos.y || 0, z: c.z }, { r: o.r, kind: 'mine', hit: ts.length > 0 }); this.sfx('en_pop');
    s.en.boom = ts.length; s.endWhy = 'spent'; s.vanish(true);
  }

  // ------------------------------------------------------------------ A3 트라이윙 편대
  en_drones(op, ctx) {
    const pc = this.pc, n = op.n || 3, out = [];
    for (let i = 0; i < n; i++) {
      const p = { x: pc.pos.x - ctx.facing.x * 0.3, y: pc.pos.y || 0, z: pc.pos.z - ctx.facing.z * 0.3 };
      out.push(this.spawn('drone', op, ctx, p, { idx: i, n, lead: i === 0, share: (ctx.d.res && ctx.d.res.cost || 0) / n, phase: 'wait', delay: i * EN.drones.eject, h: 1.2, fireCd: 0.3 + i * (op.rate / n), salvoT: op.salvo, aligning: 0 }));
    }
    for (const s of out) s.en.squad = out;
    this.sfx('en_motor');
    return out;
  }
  slotOf(s) { const pc = this.pc, k = EN.drones.slots[s.en.idx % 3]; return { x: pc.pos.x + k[0], y: k[1], z: pc.pos.z + k[2] }; }
  tickDrone(s, dt) {
    const e = s.en, o = s.o, K = EN.drones, pc = this.pc;
    if (e.phase === 'wait') { if (e.t >= e.delay) { e.phase = 'eject'; e.t = 0; this.sfx('en_lock', { gap: 30 }); } return; }
    // 날기: 대형 자리로 부드럽게(멀면 조금 빨리, 아주 멀면 바로 옆으로)
    const want = this.slotOf(s), d = dist(want, s.pos);
    if (d > K.far) s.pos = { x: want.x, y: s.pos.y, z: want.z };
    else if (d > 0.02) { const sp = Math.min(d, (K.speed + d * 1.5) * dt), dx = want.x - s.pos.x, dz = want.z - s.pos.z; s.pos = { x: s.pos.x + dx / d * sp, y: s.pos.y, z: s.pos.z + dz / d * sp }; }
    e.h += (want.y - e.h) * Math.min(1, dt * 4);
    if (e.phase === 'eject') { if (e.t >= K.unfold) { e.phase = 'on'; e.t = 0; } return; }
    e.scanT -= dt; if (e.scanT <= 0 || !this.valid(e.tgt, s.pos, o.range)) { e.scanT = EN.scan; e.tgt = this.pickTarget(s.pos, o.range, e.tgt); }
    if (e.tgt) e.yaw = Math.atan2(e.tgt.pos.x - s.pos.x, e.tgt.pos.z - s.pos.z);
    // 편대: 리더가 일제 사격 시계를 가짐
    const lead = e.squad && e.squad.find(x => !x.dead) || s;
    if (lead === s) { e.salvoT -= dt; if (e.salvoT <= 0 && !e.aligning) { e.aligning = K.align; for (const x of e.squad) if (!x.dead) { x.en.aligning = K.align; call(x.vh, 'align'); } } }
    if (e.aligning > 0) {
      e.aligning -= dt;
      if (e.aligning <= 0) { e.aligning = 0; if (lead === s) e.salvoT = o.salvo; const t = e.tgt; if (t) this.droneShot(s, t, o.coef / e.n * o.salvoMul, true); e.fireCd = this.gap(o.rate, s); }
      return;
    }
    e.fireCd -= dt; if (e.fireCd > 0 || !e.tgt) return;
    e.fireCd = this.gap(o.rate, s); this.droneShot(s, e.tgt, o.coef / e.n, false);
  }
  droneShot(s, t, coef, salvo) {
    const from = { x: s.pos.x + Math.sin(s.en.yaw) * 0.25, y: (s.pos.y || 0) + s.en.h, z: s.pos.z + Math.cos(s.en.yaw) * 0.25 };
    s.en.recoil = 1; call(s.vh, 'fire', { salvo }); this.sfx('en_shot', { gap: salvo ? 20 : 60, rate: 1.25 });
    this.bullet(s, from, t, coef, EN.drones.bullet, null, { col: 'teal' });
  }

  // ------------------------------------------------------------------ A4 테슬라 앵커
  en_anchor(op, ctx) {
    const pc = this.pc, c = pc.zone.geo.ground(ctx.aim.x, ctx.aim.z), base = Math.atan2(c.x - pc.pos.x, c.z - pc.pos.z), geo = pc.zone.geo, pts = [];
    for (let i = 0; i < 3; i++) {
      const a = base + i * Math.PI * 2 / 3; let r = op.R;
      while (r > EN.anchor.min && geo.blocked(c.x + Math.sin(a) * r, c.z + Math.cos(a) * r, 0.3)) r -= 0.25;   // 벽 속에는 안 박음: 가운데 쪽으로 당김
      pts.push(geo.ground(c.x + Math.sin(a) * r, c.z + Math.cos(a) * r));
    }
    const s = this.spawn('anchor', op, ctx, c, { pts, from: this.handPoint(), tickT: 0, focus: null });
    this.anchor = s; this.sfx('en_lock');
    return s;
  }
  inAnchor(s, t) { const p = s.en.pts; return inTri(t.pos, p[0], p[1], p[2]); }
  tickAnchor(s, dt) {
    const e = s.en, o = s.o, K = EN.anchor;
    if (e.phase === 'fly') { if (e.t >= K.fly + 2 * K.pin) { e.phase = 'link'; e.t = 0; this.sfx('en_charge', { gap: 100 }); } return; }
    if (e.phase === 'link') { if (e.t >= K.link) { e.phase = 'on'; e.t = 0; e.tickT = 0; } return; }
    const inside = this.pc.zone.actors.filter(t => this.valid(t) && this.inAnchor(s, t));
    // 표적 지정: 삼각형 안의 내 선택 대상 > 가운데에 가장 가까운 적
    e.scanT -= dt;
    if (e.scanT <= 0 || !e.focus || !inside.includes(e.focus)) {
      e.scanT = EN.scan; const sel = this.pc.target; let f = sel && inside.includes(sel) ? sel : null;
      if (!f && e.focus && inside.includes(e.focus)) f = e.focus;
      if (!f) { let bd = 1e9; for (const t of inside) { const d = dist(t.pos, s.pos); if (d < bd) { bd = d; f = t; } } }
      if (f !== e.focus) { e.focus = f; this.setFocusFx(f); }
    }
    e.tickT -= dt; if (e.tickT > 0) return; e.tickT = o.tick;
    const c = { ...s.ctx, mult: s.ctx.mult * this.mods(s).dmg };
    for (const t of inside) { this.hit(t, o.coef, c, { elem: o.elem, st: o.st }); }
    if (inside.length) { call(s.vh, 'zap', inside.map(t => t.pos)); this.sfx('en_zap', { gap: 200 }); }
  }
  setFocusFx(t) { if (this.focusT === t) return; call(this.focusFx, 'dispose'); this.focusFx = t ? this.fx('focus', t, {}) : null; this.focusT = t; }

  // ------------------------------------------------------------------ A5 아틀라스 워커
  walkerSpot() {
    const pc = this.pc, geo = pc.zone.geo, f = pc.facing, R = EN.walker.r + 0.2;
    for (const dd of [2.4, 1.8, 3.0]) for (const da of [0, 0.6, -0.6, 1.2, -1.2, 2.0, -2.0, Math.PI]) {
      const a = Math.atan2(f.x, f.z) + da, x = pc.pos.x + Math.sin(a) * dd, z = pc.pos.z + Math.cos(a) * dd;
      if (!geo.blocked(x, z, R) && !this.eng.nearPortal({ x, z }, 2.0)) return geo.ground(x, z);
    }
    return null;
  }
  en_walker(op, ctx) {
    const p = this.walkerSpot(); if (!p) return null;                          // validate 가 먼저 막음
    const life = op.life * (1 + 0.05 * (ctx.L - 1));
    const s = this.spawn('walker', op, ctx, p, { phase: 'drop', run: life, walked: 0, cyc: 0, gunI: 0, misI: 0, cannon: 0, missiles: new Map() });
    s.radius = EN.walker.r; s.life = life + EN.walker.drop + EN.walker.assemble + EN.walker.fold + 5;   // 수명은 여기서 셈(접는 시간 포함)
    this.sfx('en_drop');
    return s;
  }
  tickWalker(s, dt) {
    const e = s.en, o = s.o, K = EN.walker;
    e.recoil = Math.max(0, e.recoil - dt * 4);
    if (e.phase === 'drop') { if (e.t >= K.drop) { e.phase = 'assemble'; e.t = 0; this.sfx('en_lock'); } return; }
    if (e.phase === 'assemble') { if (e.t >= K.assemble) { e.phase = 'on'; e.t = 0; e.cyc = 0; this.sfx('en_exhaust'); } return; }
    if (e.phase === 'fold') { if (e.t >= K.fold) { s.endWhy = 'expire'; s.vanish(true); } return; }
    e.run -= dt; if (e.run <= 0) { e.phase = 'fold'; e.t = 0; call(s.vh, 'fold'); this.sfx('en_exhaust'); return; }
    e.scanT -= dt; if (e.scanT <= 0 || !this.valid(e.tgt, s.pos, o.range)) { e.scanT = EN.scan; e.tgt = this.pickTarget(s.pos, o.range, e.tgt); }
    let t = e.tgt;
    // 짧은 보행: 사거리 밖(사거리 + 4 m 안)의 적에게 다가감, 모두 합쳐 walkMax m, 충돌 지킴
    if (!t && e.walked < o.walkMax) { const far = this.pickTarget(s.pos, o.range + 4, null); if (far) { const b = { ...s.pos }; s.moveTowards(far.pos, dt, K.speed); e.walked += dist(b, s.pos); e.walking = 1; } else e.walking = 0; } else e.walking = 0;
    if (t) e.yaw += Math.atan2(Math.sin(Math.atan2(t.pos.x - s.pos.x, t.pos.z - s.pos.z) - e.yaw), Math.cos(Math.atan2(t.pos.x - s.pos.x, t.pos.z - s.pos.z) - e.yaw)) * Math.min(1, dt * 6);
    const m = this.mods(s), c0 = e.cyc; e.cyc += dt; const tc = e.cyc, G0 = o.gun, M0 = o.missile;
    // 기관포: 12발 연사(레드라인·모듈은 간격만 줄이고 발 수는 그대로)
    const gg = this.gap(G0.gap, s);
    while (e.gunI < G0.n && tc >= K.gunAt + e.gunI * gg) { const i = e.gunI++; if (t) this.walkerGun(s, t, G0.coef, i); }
    while (e.misI < M0.n && tc >= K.missileAt + e.misI * M0.gap) { const i = e.misI++; if (t) this.walkerMissile(s, t, i); }
    if (e.cannon === 0 && tc >= K.chargeAt) { e.cannon = 1; call(s.vh, 'charge'); this.sfx('en_charge'); }
    if (e.cannon === 1 && tc >= K.cannonAt) { e.cannon = 2; if (t) this.walkerCannon(s, t); else call(s.vh, 'vent'); }
    if (tc >= o.cycle) { e.cyc = 0; e.gunI = 0; e.misI = 0; e.cannon = 0; e.missiles = new Map(); }
    void c0; void m;
  }
  walkerGun(s, t, coef, i) {
    const e = s.en, side = i % 2 ? 1 : -1, yaw = e.yaw, from = { x: s.pos.x + Math.sin(yaw) * 1.1 + Math.cos(yaw) * 0.55 * side, y: (s.pos.y || 0) + 1.9, z: s.pos.z + Math.cos(yaw) * 1.1 - Math.sin(yaw) * 0.55 * side };
    e.recoil = Math.max(e.recoil, 0.4); call(s.vh, 'gun', { side }); this.sfx('en_shot', { gap: 45, rate: 0.85 });
    this.bullet(s, from, t, coef, 30, null, { col: 'gold' });
  }
  walkerMissile(s, t, i) {
    const e = s.en, from = { x: s.pos.x - Math.sin(e.yaw) * 0.4, y: (s.pos.y || 0) + 2.7, z: s.pos.z - Math.cos(e.yaw) * 0.4 }, o = s.o.missile;
    call(s.vh, 'missile', { i }); this.sfx('en_missile', { gap: 60 });
    // 같은 일제 사격에서 한 대상은 최대 cap 발까지 피해(타격 상한)
    this.missile(s.ctx, from, t, { coef: o.coef * this.mods(s).dmg, r: o.r, cap: o.cap, capMap: e.missiles, retarget: 6, spread: i - (o.n - 1) / 2, owner: s });
  }
  walkerCannon(s, t) {
    const e = s.en, o = s.o.cannon, yaw = e.yaw, from = { x: s.pos.x + Math.sin(yaw) * 1.6, y: (s.pos.y || 0) + 2.2, z: s.pos.z + Math.cos(yaw) * 1.6 };
    e.recoil = 1; call(s.vh, 'cannon'); this.sfx('en_cannon');
    const to = { x: t.pos.x, y: t.pos.y || 0, z: t.pos.z }, kit = this, fx = this.fx('shell', from, { to });
    const d = Math.hypot(to.x - from.x, to.z - from.z), T = Math.max(0.12, d / EN.walker.shell);
    let tt = 0; this.eng.things.push({ dead: false, update(dt) { tt += dt; call(fx, 'set', tt / T); if (kit.pc.dead) { this.dispose(); return; } if (tt < T) return; this.dead = true; call(fx, 'dispose');
      const ts = kit.enemiesIn(HitShape.circle(to.x, to.z, o.r)), c = { ...s.ctx, mult: s.ctx.mult * kit.mods(s).dmg };
      for (const x of ts) kit.hit(x, o.coef, c, {});
      kit.fx('blast', to, { r: o.r, kind: 'cannon', hit: ts.length > 0 }); kit.sfx('en_pop', { rate: 0.7 });
      if (ts.length) kit.kick(to, EN.walker.kick); }, dispose() { this.dead = true; call(fx, 'dispose'); } });
  }
  kick(p, k) { const G = this.G, pc = this.pc; if (G.render && G.render.kick && !G.reduceFlash) G.render.kick(p.x - pc.pos.x || 0.01, p.z - pc.pos.z, k[0], k[1]); }

  /** homing missile (hive pod / walker): rise, then turn (limited rate) to the target; small blast once on arrival; target gone -> the
   *  nearest enemy within `retarget` m of the missile, none -> fizzles (no damage anywhere); lives at most EN.hive.life s */
  missile(ctx, from, t, o) {
    const kit = this, K = EN.hive, fx = this.fx('missile', from, {}), sp = o.spread || 0;
    let pos = { ...from }, vel = { x: sp * 0.9, y: 3.4, z: 0 }, life = 0, tgt = t;
    const m = { dead: false, update(dt) {
      life += dt; if (kit.pc.dead) return this.fizzle();
      if (life > K.life) return this.fizzle();
      if (!kit.valid(tgt)) { tgt = null; let bd = o.retarget; for (const c of kit.pc.zone.actors) { if (!kit.valid(c)) continue; const d = Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z); if (d < bd) { bd = d; tgt = c; } } if (!tgt) return this.fizzle(); }
      const to = { x: tgt.pos.x, y: (tgt.pos.y || 0) + 0.6, z: tgt.pos.z };
      if (life > K.rise) {   // turn towards the target, limited rate, constant speed
        const dx = to.x - pos.x, dy = to.y - pos.y, dz = to.z - pos.z, L = Math.hypot(dx, dy, dz) || 1, v = Math.hypot(vel.x, vel.y, vel.z) || 1;
        const k = Math.min(1, K.turn * dt * (1 + life));   // turns harder the longer it flies (never orbits forever)
        vel = { x: vel.x / v + (dx / L - vel.x / v) * k, y: vel.y / v + (dy / L - vel.y / v) * k, z: vel.z / v + (dz / L - vel.z / v) * k };
        const n = Math.hypot(vel.x, vel.y, vel.z) || 1; vel = { x: vel.x / n * K.speed, y: vel.y / n * K.speed, z: vel.z / n * K.speed };
      } else vel.y -= 2 * dt;
      pos = { x: pos.x + vel.x * dt, y: pos.y + vel.y * dt, z: pos.z + vel.z * dt }; call(fx, 'set', pos, vel);
      if (Math.hypot(to.x - pos.x, to.y - pos.y, to.z - pos.z) <= (tgt.radius || 0.5) + 0.35) return this.boom(to);
    }, boom(at) {
      this.dead = true; call(fx, 'dispose');
      const ts = kit.enemiesIn(HitShape.circle(at.x, at.z, o.r)); let n = 0;
      for (const x of ts) { if (o.capMap) { const k = o.capMap.get(x) || 0; if (k >= o.cap) continue; o.capMap.set(x, k + 1); } kit.hit(x, o.coef, ctx, {}); n++; }
      kit.fx('blast', { x: at.x, y: Math.max(0, at.y - 0.6), z: at.z }, { r: o.r, kind: 'missile', hit: n > 0 }); kit.sfx('en_pop', { gap: 50 });
      if (o.log) o.log.push({ hit: n }); },
    fizzle() { if (this.dead) return; this.dead = true; call(fx, 'fizzle'); call(fx, 'dispose'); if (o.log) o.log.push({ fizzle: true }); },
    dispose() { this.dead = true; call(fx, 'dispose'); } };
    this.eng.things.push(m); return m;
  }

  // ------------------------------------------------------------------ B1 파일 벙커 (op 실행 = 말뚝이 나오는 순간)
  en_pile(op, ctx) {
    const pc = this.pc, f = ctx.facing, K = EN.pile, R = this.eng.range(ctx.d);
    const front = (t) => { const dx = t.pos.x - pc.pos.x, dz = t.pos.z - pc.pos.z, m = Math.hypot(dx, dz) || 1; return (dx * f.x + dz * f.z) / m > Math.cos(K.ang * Math.PI / 360) || m < (t.radius || 0.5) + 0.3; };
    let t = ctx.tgt && this.valid(ctx.tgt, pc.pos, R + K.reach) && front(ctx.tgt) ? ctx.tgt : null;
    if (!t) { let bd = 1e9; for (const c of this.enemiesIn(HitShape.cone(pc.pos.x, pc.pos.z, f.x, f.z, R + K.reach, K.ang))) { const d = pc.dist(c); if (d < bd) { bd = d; t = c; } } }
    const h = ctx.enFx;
    if (!t) { call(h, 'strike', null); this.sfx('en_lock'); return null; }
    const r = this.hit(t, op.coef, ctx, { pen: op.pen });
    call(h, 'strike', { x: t.pos.x, y: (t.pos.y || 0) + Math.min(1.1, 0.5 + (t.radius || 0.5) * 0.5), z: t.pos.z, ok: !r.missed });
    if (r.missed) { this.sfx('en_lock'); return { t, missed: true }; }
    this.sfx('en_pile');
    pc.freezeT = Math.max(pc.freezeT || 0, K.stop); t.freezeT = Math.max(t.freezeT || 0, K.stop);
    if (t.body && t.body.punch) t.body.punch(f.x, f.z, 0.22);
    this.kick({ x: pc.pos.x + f.x, z: pc.pos.z + f.z }, K.kick);
    // 뒤쪽 원뿔 충격파: 맞은 적 뒤의 다른 적(맞은 적은 다시 맞지 않음, 파생 피해)
    const b = op.back, back = this.enemiesIn(HitShape.cone(t.pos.x, t.pos.z, f.x, f.z, b.r, b.ang)).filter(x => x !== t && ((x.pos.x - t.pos.x) * f.x + (x.pos.z - t.pos.z) * f.z) > 0);
    for (const x of back) this.hit(x, b.coef, ctx, { derived: true });
    this.fx('shock', { x: t.pos.x, y: t.pos.y || 0, z: t.pos.z }, { f, r: b.r, ang: b.ang, hits: back.length });
    return { t, back };
  }

  // ------------------------------------------------------------------ B2 브리치 캐논
  en_breach(op, ctx) {
    const pc = this.pc, f = ctx.facing, ts = this.enemiesIn(HitShape.cone(pc.pos.x, pc.pos.z, f.x, f.z, op.r, op.ang)), out = [];
    const anchorT = this.focus();
    for (const t of ts) {
      const d = Math.max(0, pc.dist(t) - (t.radius || 0.5)), k = clamp01((d - 1.0) / Math.max(0.1, op.r - 1.5));
      let mul = op.near + (op.far - op.near) * k; if (t === anchorT) mul *= 1 + op.anchorBonus;
      const r = this.hit(t, op.coef * mul, ctx, {});
      if (!r.missed && !t.dead) { const dur = op.stagger[0] + (op.stagger[1] - op.stagger[0]) * k; this.h.applyStatus(t, { id: 'stagger', dur, val: 1, ch: 1 }, pc); if (t.body && t.body.punch) t.body.punch(f.x, f.z, 0.14); }
      out.push({ t, mul, missed: r.missed });
    }
    call(ctx.enFx, 'fire', { r: op.r, ang: op.ang, hits: out.filter(x => !x.missed).map(x => x.t.pos) });
    this.sfx('en_cannon'); pc.startLunge && pc.startLunge({ x: -f.x, z: -f.z }, EN.breach.back, 0.14);   // 반동: 뒤로 살짝(충돌 지킴)
    return out;
  }

  // ------------------------------------------------------------------ B3 벌집 미사일 포드
  hiveN(op) { return (op.n || 6) + (this.heat() > 0 ? op.extra || 0 : 0); }
  en_hive(op, ctx) {
    const pc = this.pc, n = this.hiveN(op), log = ctx.enLog = [];
    const t0 = this.focus() || (ctx.tgt && this.valid(ctx.tgt) ? ctx.tgt : this.pickTarget(pc.pos, this.eng.range(ctx.d) + 2, null));
    const mul = this.heat() > 0 ? 1 + this.red.dmg : 1;
    for (let i = 0; i < n; i++) this.at(ctx, EN.hive.first + i * EN.hive.gap, () => {
      if (pc.dead) return; const tgt = alive(t0) ? t0 : this.pickTarget(pc.pos, 11, null); if (!tgt) return;
      const sh = { x: pc.pos.x - pc.facing.x * 0.25 + pc.facing.z * 0.18, y: (pc.pos.y || 0) + 1.75, z: pc.pos.z - pc.facing.z * 0.25 - pc.facing.x * 0.18 };
      call(ctx.enFx, 'launch', i); this.sfx('en_missile', { gap: 40 });
      this.missile({ ...ctx, mult: ctx.mult * mul }, sh, tgt, { coef: op.coef, r: op.r, retarget: op.retarget, spread: (i % 3 - 1) * 0.8 + (i % 2 ? 0.3 : -0.3), log });
    });
    return n;
  }

  // ------------------------------------------------------------------ B4 헬릭스 레일캐논 (방향 = 누른 순간, 발사 = EN.rail.fire)
  en_rail(op, ctx) {
    const pc = this.pc, f = { ...ctx.facing }, zone = pc.zone;
    this.at(ctx, EN.rail.fire, () => {
      if (pc.dead || pc.zone !== zone) { call(ctx.enFx, 'cancel'); return; }
      const o = { x: pc.pos.x, z: pc.pos.z }, ts = this.enemiesIn(HitShape.rect(o.x, o.z, f.x, f.z, op.w, op.len));
      for (const t of ts) { const r = this.hit(t, op.coef, ctx, { elem: op.elem }); if (!r.missed) this.railed.set(t, this.clock + EN.rail.mark); }
      call(ctx.enFx, 'fire', { hits: ts.map(t => t.pos) }); this.sfx('en_rail');
      pc.startLunge && pc.startLunge({ x: -f.x, z: -f.z }, EN.rail.back, 0.16);
      ctx.enHits = ts;
    });
  }

  // ------------------------------------------------------------------ B5 오비탈 브레이커
  en_orbital(op, ctx) {
    const pc = this.pc, zone = pc.zone, c = { ...ctx.aim }, K = EN.orbital, R = op.R;
    const h = this.fx('orbital', pc.zone.geo.ground(c.x, c.z), { R, n: op.n, r: op.r, core: op.core.r, first: K.first - K.lock0 });
    const live = () => !pc.dead && pc.zone === zone;
    const pri = (t) => (this.railed.get(t) > this.clock ? 0 : 3) + (t === this.focus() ? 0.5 : 1) + (t === pc.target ? 0.2 : 0.5);
    const locked = []; ctx.enLog = { locks: locked, strikes: [] };
    for (let i = 0; i < op.n; i++) this.at(ctx, K.lock0 + i * K.lockGap, () => {
      if (!live()) return call(h, 'cancel');
      const cand = this.enemiesIn(HitShape.circle(c.x, c.z, R)).filter(t => !locked.some(l => l.t === t)).sort((a, b) => pri(a) - pri(b) || dist(a.pos, c) - dist(b.pos, c));
      let p, t = cand[0] || null;
      if (t) p = { x: t.pos.x, z: t.pos.z }; else { const a = i * 2.1 + 0.4; p = { x: c.x + Math.sin(a) * R * 0.55, z: c.z + Math.cos(a) * R * 0.55 }; }
      p = pc.zone.geo.ground(p.x, p.z); locked.push({ t, p }); call(h, 'lock', i, p); this.sfx('en_lock', { gap: 30, rate: 1.2 });
    });
    for (let i = 0; i < op.n; i++) this.at(ctx, K.first + i * K.gap, () => {
      if (!live()) return; const L = locked[i]; if (!L) return;
      const ts = this.enemiesIn(HitShape.circle(L.p.x, L.p.z, op.r)); let n = 0;
      for (const t of ts) { const bonus = this.railed.get(t) > this.clock ? 1 + op.railBonus : 1; const r = this.hit(t, op.coef * bonus, ctx, {}); if (!r.missed) n++; }
      ctx.enLog.strikes.push({ i, n }); call(h, 'strike', i, L.p, n > 0); this.sfx('en_pop', { gap: 30, rate: 0.85 });
    });
    this.at(ctx, K.core, () => {
      if (!live()) return; const ts = this.enemiesIn(HitShape.circle(c.x, c.z, op.core.r)); let n = 0;
      for (const t of ts) { const bonus = this.railed.get(t) > this.clock ? 1 + op.railBonus : 1; const r = this.hit(t, op.core.coef * bonus, ctx, {}); if (!r.missed) n++; }
      ctx.enLog.core = n; call(h, 'core', n > 0); this.sfx('en_cannon', { rate: 0.75 }); if (n) this.kick(c, K.kick);
    });
    ctx.enFxOrb = h;
  }

  // ------------------------------------------------------------------ C3 리페어 비콘
  en_beacon(op, ctx) {
    const pc = this.pc, p = pc.zone.geo.ground(pc.pos.x, pc.pos.z);
    if (this.beacon) { call(this.beacon.fx, 'dispose'); this.beacon = null; }
    const b = this.beacon = { p, until: this.clock + op.life, next: this.clock + 0.3, op, ctx, fx: this.fx('beacon', p, { r: op.r, life: op.life }), log: [] };
    this.sfx('en_lock'); return b;
  }
  tickBeacon() {
    const b = this.beacon; if (!b) return;
    if (this.clock >= b.until) { call(b.fx, 'end'); this.beacon = null; return; }
    if (this.clock < b.next) return; b.next += b.op.tick;
    const op = b.op;
    for (const s of this.machines()) {
      if (s.living || dist(s.pos, b.p) > op.r) continue;
      const miss = 1 - s.hp / s.maxHp; if (miss <= 1e-4) continue;
      const n = s.maxHp * Math.min(op.cap, op.pct * b.ctx.mult * (1 + op.missingBonus * miss));
      s.hp = Math.min(s.maxHp, s.hp + n); b.log.push({ kind: s.en ? s.en.kind : s.kind, n });
      call(b.fx, 'weld', s); this.sfx('en_weld', { gap: 120 });
    }
  }

  // ------------------------------------------------------------------ C5 레드라인 프로토콜
  en_redline(op, ctx) {
    const L = ctx.L, dur = op.dur + (op.durLv || 0) * (L - 1);
    this.red = { until: this.clock + dur, coolUntil: this.clock + dur + op.cool, dmg: op.dmg + (op.dmgLv || 0) * (L - 1), rate: op.rate, minGap: op.minGap, coolDmg: op.coolDmg, coolRate: op.coolRate, cooled: false };
    this.h.applyStatus(this.pc, { id: 'overclock', dur, val: this.red.dmg, ch: 1 }, this.pc);
    this.sfx('en_motor'); call(this.redFx, 'dispose'); this.redFx = this.fx('redline', this.pc, { dur, cool: op.cool, kit: this });
  }
  tickRed() {
    const r = this.red; if (!r) return;
    if (!r.cooled && this.clock >= r.until) { r.cooled = true; this.h.applyStatus(this.pc, { id: 'cooldown_heat', dur: r.coolUntil - this.clock, val: 1, ch: 1 }, this.pc); this.sfx('en_exhaust'); }
    if (this.clock >= r.coolUntil) this.red = null;
  }

  // ------------------------------------------------------------------ 매 프레임
  machineTick(s, dt) {
    const e = s.en; if (!e) return; e.t += dt;
    switch (e.kind) {
      case 'sentry': return this.tickSentry(s, dt);
      case 'spider': return this.tickSpider(s, dt);
      case 'drone': return this.tickDrone(s, dt);
      case 'anchor': return this.tickAnchor(s, dt);
      case 'walker': return this.tickWalker(s, dt);
    }
  }
  tick(dt) {
    void dt; this.tickBeacon(); this.tickRed();
    if (this.railed.size) for (const [t, u] of this.railed) if (u <= this.clock || !alive(t)) this.railed.delete(t);
    if (this.focusT && !alive(this.focusT)) this.setFocusFx(null);
  }
  /** 사망·지역 이동·전직(skillrt clearTemp): 병기(Summon.vanish 가 onEnd 'clear' — 회수 없음)·예약 포격·비콘·과부하 그림 정리 */
  clear() {
    if (this.beacon) call(this.beacon.fx, 'dispose'); call(this.redFx, 'dispose'); this.setFocusFx(null);
    const red = this.red, log = this.log; this.reset(); this.red = red; this.log = log;   // 과부하·냉각 시간은 그대로 흐름(재접속·이동으로 냉각을 못 피함)
  }
}

/** 스킬창 수치 문구(엔지니어) — 같은 op 필드로 계산 */
export function enLevelText(d, L) {
  if (!d || d.job !== EN.job) return null;
  const op = (d.ops || []).find(o => o.op === 'custom'), m = 1 + (d.type === 'ultimate' ? 0.25 : 0.12) * (L - 1), P = (x) => Math.round(x * 100) + '%', f1 = (x) => (Math.round(x * 10) / 10).toString();
  const life = (b) => f1(b * (1 + 0.05 * (L - 1)));
  const cd = d.cd ? ` · 쿨타임 ${f1(d.cd * (1 - 0.03 * (L - 1)))}초` : '', pw = d.res && d.res.cost ? ` · 전력 ${d.res.cost}` : d.res && d.res.gain ? ` · 전력 +${d.res.gain}` : '';
  if (d.type === 'passive') { const v = d.flags.powerRefund; const k = v[0] + v[1] * (L - 1); return `수명 종료 시 전력 ${P(k)} 회수 · 파괴 시 ${P(k / 2)} · 기계마다 한 번`; }
  if (d.type === 'craft') return null;
  if (!op) return null;
  switch (op.fn) {
    case 'en_sentry': return `탄 ${P(op.coef * m)} · ${f1(op.rate)}초마다 · 사거리 ${op.range} m · 같은 적 ${op.focusN}연속 명중 → 집중 사격 ${P(op.burst.coef * m)} × ${op.burst.n}(${op.burst.cd}초마다) · 수명 ${life(op.life)}초 · 최대 ${op.limit}기${pw}${cd}`;
    case 'en_spider': return `폭발 ${P(op.coef * m)} (반경 ${op.r} m, 한 번) · 감지 ${op.trigger} m · 한 번에 ${op.run} m까지 추적 · 수명 ${life(op.life)}초 · 최대 ${op.limit}개${pw}${cd}`;
    case 'en_drones': return `편대 ${P(op.coef * m)}/${f1(op.rate)}초(드론 3기가 나눔) · ${op.salvo}초마다 일제 사격 ×${op.salvoMul} · 사거리 ${op.range} m · 수명 ${life(op.life)}초${pw}${cd}`;
    case 'en_anchor': return `삼각형(반지름 ${op.R} m) 안 감전 ${P(op.coef * m)}/${op.tick}초 · 둔화 40% · 표적 지정 · 수명 ${life(op.life)}초${pw}${cd}`;
    case 'en_walker': { const g = op.gun, mi = op.missile, c = op.cannon; return `한 주기 ${op.cycle}초: 기관포 ${P(g.coef * m)} × ${g.n} → 미사일 ${P(mi.coef * m)} × ${mi.n}(반경 ${mi.r} m, 한 적 최대 ${mi.cap}발) → 주포 ${P(c.coef * m)}(반경 ${c.r} m) · 가동 ${life(op.life)}초${pw}${cd}`; }
    case 'en_pile': return `말뚝 ${P(op.coef * m)} · 방어력 ${P(op.pen)} 무시 · 뒤쪽 충격파 ${P(op.back.coef * m)}(${op.back.r} m) · 사거리 ${d.range} m${cd}`;
    case 'en_breach': return `산탄 ${P(op.coef * m)} × 거리 배율 ${op.far}~${op.near} · 경직 ${op.stagger[1]}~${op.stagger[0]}초 · ${op.r} m ${op.ang}°${cd}`;
    case 'en_hive': return `미사일 ${P(op.coef * m)} × ${op.n}발(반경 ${op.r} m, 레드라인 중 +${op.extra}발) · 사거리 ${d.range} m${pw}${cd}`;
    case 'en_rail': return `관통 ${P(op.coef * m)} · ${op.len} m 직선(폭 ${op.w} m) · 축전 ${EN.rail.fire}초${cd}`;
    case 'en_orbital': return `정밀 포격 ${P(op.coef * m)} × ${op.n}(반경 ${op.r} m) + 중심 ${P(op.core.coef * m)}(반경 ${op.core.r} m) · 레일캐논 대상 +${P(op.railBonus)}${cd}`;
    case 'en_beacon': return `${op.life}초 동안 ${op.tick}초마다 ${op.r} m 안 기계 수리 ${P(op.pct * m)}(손상 비례 최대 +${P(op.missingBonus)}, 한 번에 최대 ${P(op.cap)}) · 보호막 ${Math.round(30 * m)}+${Math.round(60 * m)}%${cd}`;
    case 'en_redline': return `${f1(op.dur + (op.durLv || 0) * (L - 1))}초 동안 병기 공격 속도 +${P(op.rate - 1)} · 화력 +${P(op.dmg + (op.dmgLv || 0) * (L - 1))} · 최소 발사 간격 ${op.minGap}초 · 이후 냉각 ${op.cool}초(속도 ${P(op.coolRate - 1)}, 화력 ${P(op.coolDmg)})${cd}`;
  }
  return null;
}
