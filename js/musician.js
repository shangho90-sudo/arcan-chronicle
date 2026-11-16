// 음악가 2차 스킬 규칙 (2026-11-16 개편 '마에스트로'): 전장의 협주곡(A) · 생명을 잇는 선율(B) · 환영 오케스트라(C).
// 스킬 데이터는 tools/skills2/gen.py (mu_*, CUSTOM 'mu' — op.k = 칸), 실행은 js/skillrt.js 가 이 파일의 MusicKit 을 부름(eng.music).
// 그림은 js/musicfx.js — 이 파일은 렌더링을 직접 하지 않는다: fx(kind, a, o) 가 null 을 돌려줘도(메시 로딩 전·테스트) 규칙은 그대로.
//
// 규칙 요약
//  * 악절(eng.res.phrase, 상한 8 — 예전 자원 그대로): 공격 선율(A1~A4)이 실제로 맞으면 한 번 쓸 때 1개만(여러 적·여러 타여도),
//    팬텀 트리오 합주 0.5, 그랜드 심포니 1. 마에스트로의 청음(phraseGain)이 곱해짐. 메아리 반복·파생 파동·코다는 악절을 주지 않음.
//  * 파멸의 코다: 시전을 시작한 순간의 악절 수(최대 8)와 끝난 순간의 악절 수 중 작은 쪽을 시전이 확정될 때 한 번만 소비 —
//    시전 중에 얻은 악절은 이번 시전에 쓰지 않음. 악절 0이어도 기본 피해. 피해 = coef x (1 + per x 소비 수)를 현악/타악/관악/합주에 나눔.
//  * 지속 선율(아리아·행진·코랄·세레나데)은 하나만: 다른 선율을 켜면 이전 것의 능력치를 바로 지우고 새것을 적용, 같은 선율 = 시간만 새로.
//    능력치는 매 프레임 '지금 값'으로 덮어씀(예전 max 규칙은 강화가 끝나도 큰 값이 남았음) — 끝나거나 바뀌면 그 프레임에 원래대로.
//    이동·공격 스킬로 끊기지 않음, 유지 비용 없음(예전과 같음), 사망·지역 이동·전직에 끝남.
//  * 선율 강화(앙코르 60 % 12초, 심포니 50 % 10초): 기본 수치 x (1 + 강화) — 겹치면 큰 쪽만(곱하지 않음), 다시 쓰면 그 출처의 시간만 새로.
//    강화는 켜 둔 선율이 있을 때만 생기고, 강화 중 다른 선율로 바꾸면 남은 시간이 새 선율에 그대로.
//  * 에코 리프라이즈: 10초 안의 다음 공격 선율(A1~A4) 하나를 0.4초 뒤 절반 위력으로 한 번 더(궁극기·회복·소환·메아리 자신은 복제 안 함,
//    기력·악절 없음, 대상이 죽었거나 멀면 가까운 적, 없으면 사라짐). 사망·지역 이동이면 취소.
//  * 마에스트로의 청음: 다른 선율로 바꾸면(같은 선율 다시 켜기 X, 6초에 한 번) 다음 공격 선율 한 번 +20 %(+8 %/Lv) — 대기 1회, 쌓이지 않음.
//  * 공명 하프: 하나만(다시 놓으면 바뀜). 나(시전자)가 하프 반경 안이면 내 음파 공격 범위 x (1 + amp): 투사체 = 사거리, 범위 = 반경.
//    여러 개 곱하지 않음, 피해·복제 없음. 예술가 1차 음악 스킬(tags music)도 예전 증폭기처럼 반경이 넓어짐(skillrt ampMul).
//  * 팬텀 트리오: 소환물 하나(생명·기계 아님 — 회복·수리 대상 아님), 다시 부르면 새 트리오로 바뀜, 수명 15초(+5 %/Lv).
//    0.45초마다 바이올린 → 첼로 → 플루트가 차례로 0.5, 세 바퀴(9음)마다 셋이 함께 0.9 — 초당 1.33(예전 2명 x 0.6/0.9초).
//  * 레조넌스 버스트: 터지기 직전에 공격력 감소인 적을 기록 -> 본 피해 -> 기록된 적마다 추가 파동(그 적 둘레 r) — 한 번 쓸 때 적마다 추가 파동 피해 1번.
//  * 모든 피해는 quiet(전역 히트스톱·무작위 흔들림 없음): 강한 순간만 시전자·맞은 대상 freezeT + Renderer.kick 한 번.
import { HitShape } from './core.js';

export const MU = {
  cap: 8,                 // 악절 상한(예전 자원 그대로)
  icd: 6,                 // 청음 보너스가 다시 준비되기까지(초)
  echoDelay: 0.4,
  trioLeash: 14, trioThink: 0.25, trioPart: ['violin', 'cello', 'flute'],
  coralFlinch: 0.25,      // 코랄 현 떨림 표시 간격(초)
  stop: 0.04, stopHeavy: 0.07, kick: [0.05, 0.08], kickHeavy: [0.1, 0.1],
  duck: 0.35,             // 궁극기 연주 중 배경 음악 배율
  mel: {   // 지속 선율 이름·색(HUD·그림)
    aria: { name: '생명의 아리아', col: '#9af07a' }, march: { name: '영웅의 행진', col: '#ffd050' },
    coral: { name: '수호의 코랄', col: '#cfeaff' }, serenade: { name: '월광 세레나데', col: '#7ab8ff' },
  },
  sfxGap: { mu_wave_hit: 0.06, mu_note: 0.08, mu_harp_tick: 0.6, mu_flute_tick: 0.6, mu_string: 0.2 },
};
const durL = (d, L) => d * (1 + 0.05 * (Math.max(1, L) - 1));
const call = (h, m, ...a) => { try { return h && h[m] ? h[m](...a) : null; } catch (e) { console.warn('musicfx', m, e); return null; } };
const norm = (x, z) => { const m = Math.hypot(x, z) || 1; return { x: x / m, z: z / m }; };
const MEL_STATS = ['atkup', 'haste', 'dmgreduce', 'ccres'];
const ATTACKS = new Set(['a1', 'a2', 'a3', 'a4']);

/** 점 p와 선분 a-b의 거리(xz) */
export function segDist(p, a, b) {
  const vx = b.x - a.x, vz = b.z - a.z, L2 = vx * vx + vz * vz || 1e-9, t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / L2));
  return Math.hypot(p.x - (a.x + vx * t), p.z - (a.z + vz * t));
}
/** 크레셴도 연속 기록(순수): 맞힌 대상으로 기록을 갱신하고 이번 타의 배율을 돌려줌. last = 마지막 파동, miss = 빗나감 */
export function cresStep(rec, t, last, per, miss) {
  if (miss) { rec.t = null; rec.n = 0; return 1; }
  if (rec.t === t) rec.n++; else { rec.t = t; rec.n = 1; }
  return last && rec.n >= 2 ? 1 + per * rec.n : 1;
}
/** 코다 소비 수(순수): 누른 순간과 확정 순간 중 작은 쪽, 상한 cap */
export function codaTake(atPress, atRelease, cap) { return Math.max(0, Math.min(cap, Math.floor(atPress ?? atRelease), Math.floor(atRelease))); }
/** 선율 강화 배율(순수): 여러 출처 중 큰 것만 */
export function boostOf(boosts) { let b = 0; for (const x of boosts) if (x.t > 0) b = Math.max(b, x.mul); return b; }

let SUID = 0;
export class MusicKit {
  constructor(eng, h) { this.eng = eng; this.h = h; this.reset(); }
  reset() {
    this.timers = []; this.things = []; this.harp = null; this.mel = null; this.boosts = []; this.switchArm = false; this.switchT = -99; this.lastMel = null;
    this.echoView = null; this.echoDelay = MU.echoDelay; this.watch = null; this.sfxT = {}; this.ducked = false; this.spent = null; this.flinchT = -9;
    this.log = { phrase: [], echo: 0, react: 0, switchArm: 0, coda: null, sym: null, heals: 0, mp: 0 };
  }
  get pc() { return this.eng.pc; }
  get G() { return this.h.G(); }
  get clock() { return this.eng.clock; }
  get book() { return this.pc.sheet.book; }
  fx(kind, a, o) { try { return this.h.fx ? this.h.fx(kind, a, o) : null; } catch (e) { console.warn('musicfx', kind, e); return null; } }
  sfx(n, o) { const g = MU.sfxGap[n] || 0; if (g && this.clock - (this.sfxT[n] ?? -9) < g) return; this.sfxT[n] = this.clock; try { this.G.audio.sfx(n, o); } catch (e) { } }
  later(t, f) { this.timers.push({ t, f }); }
  ground(x, z) { try { return this.pc.zone.geo.ground(x, z); } catch (e) { return { x, y: 0, z }; } }
  blocked(x, z, r = 0.1) { try { return this.pc.zone.geo.blocked(x, z, r); } catch (e) { return false; } }
  apply(t, id, dur, val) { return this.h.applyStatus(t, { id, dur, val, ch: 1 }, this.pc); }
  pass(k) { try { return this.book.passive(k) || 0; } catch (e) { return 0; } }
  healPow() { const pc = this.pc; return Math.max(pc.sheet && pc.sheet.final ? pc.sheet.final.healPower || 0 : 0, pc.stat ? pc.stat('healPower') || 0 : 0); }
  enemies() { return this.pc.zone.actors.filter(c => c && !c.dead && c.faction !== 'player' && !c.isSummon); }
  /** 직접 피해 한 번(quiet). 실제로 맞았는지(MISS 아님) */
  hit(t, coef, ctx, extra = {}) { if (!t || t.dead) return false; this.eng.dmg(t, coef, ctx, { quiet: true, elem: 'sound', ...extra }); return !ctx.missed; }
  impact(ts, f, heavy) {
    const pc = this.pc, G = this.G, s = heavy ? MU.stopHeavy : MU.stop, k = heavy ? MU.kickHeavy : MU.kick; if (!ts.length) return;
    pc.freezeT = Math.max(pc.freezeT || 0, s);
    for (const t of ts) if (!t.dead) { t.freezeT = Math.max(t.freezeT || 0, s); if (t.body && t.body.punch) t.body.punch(t.pos.x - pc.pos.x, t.pos.z - pc.pos.z, heavy ? 0.16 : 0.1); }
    if (heavy && G.render && G.render.kick && !G.reduceFlash) G.render.kick(f.x, f.z, k[0], k[1]);
  }
  handPoint() { const pc = this.pc; let h = null; try { h = pc.body && pc.body.handPoint && pc.body.handPoint(); } catch (e) { h = null; } return h ? { x: h.x, y: h.y, z: -h.z } : { x: pc.pos.x + pc.facing.x * 0.4, y: (pc.pos.y || 0) + 1.1, z: pc.pos.z + pc.facing.z * 0.4 }; }
  nearest(from, R, not) { let b = null, bd = 1e9; for (const c of this.enemies()) { if (not && not.has(c)) continue; const d = Math.hypot(c.pos.x - from.x, c.pos.z - from.z) - (c.radius || 0.5); if (d <= R && d < bd) { bd = d; b = c; } } return b; }
  /** 공명 하프 증폭(시전자가 하프 반경 안일 때만, 하나뿐이라 곱하지 않음) */
  ampK() { const h = this.harp, pc = this.pc; return h && !h.dead && h.age >= h.unfold && Math.hypot(pc.pos.x - h.c.x, pc.pos.z - h.c.z) <= h.r ? 1 + h.amp : 1; }
  ampUse(ctx) { const k = this.ampK(); if (k > 1) { ctx.muAmp = k; call(this.harp.view, 'strum'); } return k; }
  duck(on) { if (on === this.ducked) return; this.ducked = on; try { const a = this.G.audio; if (a && a.duck) a.duck(on ? MU.duck : 1); } catch (e) { } }

  // ------------------------------------------------------------------ 악절
  /** 한 번 쓸 때 한 번만(ctx.muGot), 메아리·코다는 0. 소환물·심포니는 직접 n */
  gain(ctx, n, src) {
    if (!n || (ctx && (ctx.isEcho || ctx.muGot))) return 0; if (ctx) ctx.muGot = true;
    const add = n * (1 + this.pass('phraseGain')), res = this.eng.res, before = res.phrase;
    res.phrase = Math.min(MU.cap, (res.phrase || 0) + add);
    this.log.phrase.push({ src, add: res.phrase - before, at: this.clock });
    return res.phrase - before;
  }

  // ------------------------------------------------------------------ dispatch
  cast(op, ctx) { const f = this['k_' + op.k]; if (!f) return console.warn('mu: unknown', op.k); if (ATTACKS.has(op.k)) this.attackBegin(op, ctx); return f.call(this, op, ctx); }
  /** 누른 순간(skillrt cast): 코다용 악절 수 기록, 궁극기 시전 연출(악보·하프·악단)과 배경 음악 낮추기 */
  onCast(d, ctx) {
    if (d.job !== 'musician') return;
    ctx.muPress = Math.floor(this.eng.res.phrase || 0);
    if (d.type === 'ultimate' && d.cast > 0) {
      const pc = this.pc, k = d.id === 'mu_a5' ? 'score' : d.id === 'mu_b5' ? 'encore' : 'stage';
      ctx.muPre = this.fx(k, pc, { cast: d.cast, n: Math.min(MU.cap, ctx.muPress), facing: ctx.facing, origin: { ...pc.pos }, mel: this.mel ? this.mel.id : null, low: this.lowSpec() });
      this.watch = ctx; this.duck(true); if (d.sfx) this.sfx(d.sfx);   // 궁극기 시작 구절(코다 금관·앙코르 하프·심포니 현)
    }
  }
  lowSpec() { const G = this.G; return !!(G && ((G.input && G.input.mobile) || (G.settings && G.settings.graphicsFx === false))); }
  /** 누른 순간의 악기 등장(그림만): 현 세 줄·심벌즈·바이올린·나팔구·하프·첼로·플루트·지휘봉·접힌 틀 */
  k_pre(op, ctx) {
    const pc = this.pc, tg = ctx.tgt && !ctx.tgt.dead ? ctx.tgt : null;
    ctx.muFx = this.fx('pre', pc, { what: op.what, lead: -(op.at || 0), facing: ctx.facing, aim: ctx.aim, tgt: tg, mel: this.mel ? this.mel.id : null });
  }
  /** 공격 선율 공통(A1~A4): 메아리 예약 · 청음 보너스 */
  attackBegin(op, ctx) {
    if (ctx.isEcho || ctx.muBegun) return; ctx.muBegun = true;
    const pc = this.pc, base = ctx.mult, ev = pc.status.flag ? pc.status.flag('echo') : 0;
    if (ev > 0) {
      pc.status.remove('echo'); this.log.echo++;
      const c2 = { ...ctx, isEcho: true, mult: base * ev, hitOnce: new Set(), muGot: true, muFx: null, muBegun: true };
      call(this.echoView, 'replay', this.echoDelay); this.echoView = null;
      this.later(this.echoDelay, () => { if (pc.dead) return; this.echoCast(op, c2); });
    }
    if (this.switchArm) { this.switchArm = false; ctx.mult = base * (1 + this.pass('switchBonus')); ctx.muSwitched = true; this.fx('accent', pc, { gold: true }); }
    if (this.mel && this.mel.id === 'march') ctx.muMarch = true;
  }
  /** 메아리: 같은 칸을 절반 위력으로 — 대상이 죽었거나 멀면 가까운 적으로, 없으면(대상 스킬) 조용히 사라짐 */
  echoCast(op, c) {
    const pc = this.pc, d = c.d, R = (d.range || 8) + 2;
    c.origin = { ...pc.pos }; c.facing = { ...pc.facing };
    if (d.target === 'enemy') { let t = c.tgt && !c.tgt.dead && pc.dist(c.tgt) <= R ? c.tgt : this.nearest(pc.pos, R); if (!t) { this.fx('fizzle', pc, {}); return; } c.tgt = t; c.aim = { ...t.pos }; }
    this.fx('echo', pc, { k: op.k });
    this['k_' + op.k](op, c);
  }

  // ================================================================== A. 전장의 협주곡
  k_a1(op, ctx) {   // 스트링 피어스: 직선 관통 파동, 적마다 한 번
    const pc = this.pc, f = ctx.isEcho ? pc.facing : ctx.facing, amp = this.ampUse(ctx), len = op.len * amp, hp = this.handPoint();
    const p0 = { x: pc.pos.x + f.x * 0.5, z: pc.pos.z + f.z * 0.5 }, hits = new Set(), self = this;
    call(ctx.muFx, 'pluck');
    const view = this.fx('wave', { x: p0.x, y: hp.y, z: p0.z }, { f, len, w: op.w, speed: op.speed, echo: !!ctx.isEcho, amp: amp > 1, sw: !!ctx.muSwitched });
    const pr = { pos: { ...p0 }, trav: 0, dead: false, landed: [],
      update(dt) {
        if (this.dead) return; const a = { ...this.pos }, step = Math.min(op.speed * dt, len - this.trav); this.pos = { x: a.x + f.x * step, z: a.z + f.z * step }; this.trav += step;
        for (const c of self.enemies()) { if (hits.has(c)) continue; if (segDist(c.pos, a, this.pos) <= op.w * 0.5 + (c.radius || 0.5)) { hits.add(c); const ok = self.hit(c, op.coef, ctx); if (ok) { this.landed.push(c); self.gain(ctx, op.phrase, 'a1'); self.impact([c], f, false); } call(view, 'hit', c, ok); self.sfx('mu_wave_hit'); } }
        call(view, 'set', this.pos, this.trav / len);
        if (this.trav >= len - 1e-6 || self.blocked(this.pos.x, this.pos.z, 0.05)) this.dispose();
      },
      dispose() { if (this.dead) return; this.dead = true; call(view, 'end'); } };
    this.things.push(pr); this.log.a1 = { len, hits, pr }; return pr;
  }
  k_a2(op, ctx) {   // 디스코드 브레이크: 심벌즈가 닿는 순간 1회 — 원형 피해 + 공격력 감소 + 일반 적 경직
    const pc = this.pc, r = op.r * this.ampUse(ctx), ts = this.eng.targets(HitShape.circle(pc.pos.x, pc.pos.z, r)), landed = [];
    for (const t of ts) if (this.hit(t, op.coef, ctx)) { landed.push(t); if (!t.dead) { this.apply(t, 'atkdown', op.atkdownDur, op.atkdown); this.apply(t, 'stagger', op.stagger, 1); } }
    if (landed.length) this.gain(ctx, op.phrase, 'a2');
    call(ctx.muFx, 'clash', { r, hits: landed });
    if (!ctx.muFx) this.fx('clash', pc, { r, hits: landed, echo: !!ctx.isEcho, amp: !!ctx.muAmp });
    this.impact(landed, ctx.facing, landed.length > 0); this.log.a2 = { r, landed: landed.length };
  }
  k_a3(op, ctx) {   // 크레셴도 러시: 활을 켤 때마다 파동, 같은 대상 연속 명중이면 마지막 타 강화
    const pc = this.pc, n = op.n, amp = this.ampUse(ctx), R = ((ctx.d.range || 8) + 1) * amp, rec = { t: null, n: 0 }, log = this.log.a3 = { waves: [], rec };
    ctx.muCres = rec;
    for (let i = 0; i < n; i++) this.later(i * op.gap, () => {
      if (pc.dead) return; let t = ctx.tgt && !ctx.tgt.dead && pc.dist(ctx.tgt) <= R + 2 ? ctx.tgt : this.nearest(pc.pos, R);
      call(ctx.muFx, 'stroke', i, n); this.sfx('mu_bow', { rate: 0.94 + 0.04 * i });
      if (!t) { log.waves.push({ i, t: null }); return; }
      ctx.tgt = t; this.launchCres(op, ctx, t, i, i === n - 1, R);
    });
  }
  launchCres(op, ctx, t0, i, last, R) {
    const self = this, pc = this.pc, hp = this.handPoint(), log = this.log.a3;
    const view = this.fx('cres', { x: hp.x, y: hp.y, z: hp.z }, { i, last, echo: !!ctx.isEcho });
    const pr = { pos: { x: pc.pos.x + ctx.facing.x * 0.4, z: pc.pos.z + ctx.facing.z * 0.4 }, t: t0, dead: false, age: 0,
      update(dt) {
        if (this.dead) return; this.age += dt;
        if (!this.t || this.t.dead) { this.t = self.nearest(this.pos, 6); ctx.muCres.t = null; ctx.muCres.n = 0; if (!this.t) { log.waves.push({ i, t: null }); return this.dispose(); } }
        const dx = this.t.pos.x - this.pos.x, dz = this.t.pos.z - this.pos.z, m = Math.hypot(dx, dz), step = op.speed * dt;
        if (m - (this.t.radius || 0.5) <= step || this.age > 1.6) {
          const t = this.t, before = { ...ctx.muCres }, k = cresStep(ctx.muCres, t, last, op.cres, false), ok = self.hit(t, op.coef * k, ctx);
          if (!ok) { ctx.muCres.t = before.t; ctx.muCres.n = 0; }
          if (ok) self.gain(ctx, op.phrase, 'a3');
          log.waves.push({ i, t, k, ok }); call(view, 'hit', t, ok, k); self.sfx(last && k > 1 ? 'mu_chord' : 'mu_wave_hit');
          self.impact(ok ? [t] : [], ctx.facing, last && k > 1);
          return this.dispose();
        }
        this.pos = { x: this.pos.x + dx / m * step, z: this.pos.z + dz / m * step }; call(view, 'set', this.pos, this.t);
      },
      dispose() { if (this.dead) return; this.dead = true; call(view, 'end'); } };
    this.things.push(pr); void R; return pr;
  }
  k_a4(op, ctx) {   // 레조넌스 버스트: 나팔을 부는 순간 음압이 모이고 burst 초 뒤 공명막이 터짐
    const pc = this.pc, amp = this.ampUse(ctx), r = op.r * amp;
    let t = ctx.tgt && !ctx.tgt.dead ? ctx.tgt : this.nearest(ctx.aim || pc.pos, 3);
    const c0 = t ? { ...t.pos } : { ...(ctx.aim || pc.pos) };
    const view = ctx.muFx && ctx.muFx.what === 'bells' ? ctx.muFx : this.fx('pre', pc, { what: 'bells', lead: 0, tgt: t, aim: c0, echo: !!ctx.isEcho });
    call(view, 'blow', op.burst, r);
    this.later(op.burst, () => {
      if (pc.dead) { call(view, 'end'); return; }
      const c = t && !t.dead ? { ...t.pos } : c0, ts = this.eng.targets(HitShape.circle(c.x, c.z, r));
      const weak = ts.filter(x => x.status && x.status.has && x.status.has(op.react.need));   // 판정 순서: 터지기 직전 상태 기록 -> 본 피해 -> 추가 파동
      const landed = []; for (const x of ts) if (this.hit(x, op.coef, ctx)) landed.push(x);
      if (landed.length) this.gain(ctx, op.phrase, 'a4');
      call(view, 'burst', c, r, landed);
      const done = ctx.muReact || (ctx.muReact = new Set()), waves = [];
      for (const w of weak) {
        if (w.dead && !landed.includes(w)) continue;
        const hitBy = this.eng.targets(HitShape.circle(w.pos.x, w.pos.z, op.react.r)).filter(x => !done.has(x));
        const ok = []; for (const x of hitBy) { done.add(x); if (this.hit(x, op.react.coef, ctx, { derived: true })) ok.push(x); }
        waves.push({ at: { ...w.pos }, n: ok.length }); this.log.react += ok.length;
        call(view, 'react', w.pos, op.react.r, ok);
      }
      this.sfx('mu_burst'); this.impact(landed, ctx.facing, landed.length > 0);
      this.log.a4 = { r, landed: landed.length, weak: weak.length, waves };
    });
  }
  k_a5(op, ctx) {   // 파멸의 코다: 확정 순간 한 번 소비 -> 현악·타악·관악·쉼·합주
    const pc = this.pc, res = this.eng.res, n = codaTake(ctx.muPress, res.phrase, op.cap);
    res.phrase = Math.max(0, res.phrase - n); ctx.muReleased = true; this.spent = { n, at: this.clock };
    const total = op.coef * (1 + op.per * n), amp = this.ampUse(ctx), f = ctx.facing, o = { ...ctx.origin }, R = op.r * amp, FR = op.fr * amp;
    const view = ctx.muPre || this.fx('score', pc, { cast: 0, n, facing: f, origin: o });
    call(view, 'consume', n); this.watch = null;
    const L = this.log.coda = { n, total, stages: [] };
    op.at_.forEach((at, i) => this.later(at, () => {
      if (pc.dead) return;
      const sh = i < 3 ? HitShape.cone(o.x, o.z, f.x, f.z, R, op.ang) : HitShape.circle(o.x + f.x * op.fwd, o.z + f.z * op.fwd, FR);
      const ts = this.eng.targets(sh), landed = []; for (const t of ts) if (this.hit(t, total * op.w[i], ctx)) landed.push(t);
      L.stages.push({ i, at: this.clock, hit: landed.length, coef: total * op.w[i] });
      call(view, 'stage', i, { r: i < 3 ? R : FR, ang: op.ang, fwd: op.fwd, hits: landed });
      this.sfx(['mu_string', 'mu_cymbal', 'mu_horn', 'mu_chord'][i], i === 3 ? undefined : { rate: 1 });
      this.impact(landed, f, i === 3);
      if (i === 3) this.later(0.5, () => this.duck(false));
    }));
  }

  // ================================================================== B. 지속 선율
  k_b1(op, ctx) { this.startMel(op, ctx); }
  k_b2(op, ctx) { this.startMel(op, ctx); }
  k_b3(op, ctx) { this.startMel(op, ctx); }
  k_b4(op, ctx) { this.startMel(op, ctx); }
  startMel(op, ctx) {
    const pc = this.pc, cur = this.mel, dur = durL(op.dur, ctx.L);
    if (cur && cur.id === op.mel) { cur.t = dur; cur.op = op; cur.ctx = ctx; call(cur.view, 'refresh', dur); return cur; }   // 같은 선율: 시간만 새로(보너스 없음)
    const prev = cur ? cur.id : this.lastMel;
    if (cur) this.endMel(true);
    const self = this, m = this.mel = this.eng.melody = { mu: true, id: op.mel, op, ctx, t: dur, tick: op.tick || 1, dur,
      get boost() { return self.mel === m ? boostOf(self.boosts) : 0; }, fx: { dispose: () => { if (self.mel === m) self.endMel(false); } },
      view: this.fx('melody', pc, { mel: op.mel, dur, near: op.near }) };
    try { this.G.ui.floatText(pc.pos, MU.mel[op.mel].name, MU.mel[op.mel].col, 0.9, 1.8); } catch (e) { }
    if (prev && prev !== op.mel && this.pass('switchBonus') > 0 && this.clock - this.switchT >= MU.icd) {   // 마에스트로의 청음
      this.switchArm = true; this.switchT = this.clock; this.log.switchArm++; this.fx('tune', pc, { mel: op.mel }); this.sfx('mu_tune');
    }
    this.lastMel = op.mel; this.tickMel(0); return m;
  }
  /** 능력치를 '지금 값'으로 덮어씀(내가 건 것만, _mu 표시) */
  hold(id, val) {
    const pc = this.pc, st = pc.status; if (!st || !st.get) return;
    let s = st.get(id);
    if (!s) { this.apply(pc, id, 0.6, val); s = st.get(id); if (s) s._mu = true; return; }
    if (s._mu) { const cap = s.def && s.def.cap != null ? s.def.cap : Infinity; s.value = Math.min(cap, val); s.remaining = Math.max(s.remaining, 0.6); s.duration = Math.max(s.duration, 0.6); }
    else this.apply(pc, id, 0.6, val);
  }
  dropStats() { const st = this.pc.status; if (!st || !st.list) return; st.list = st.list.filter(s => !(s._mu && MEL_STATS.includes(s.def.id))); }
  tickMel(dt) {
    const m = this.mel; if (!m) return; const pc = this.pc, op = m.op, b = boostOf(this.boosts), k = (1 + b) * m.ctx.mult;
    m.t -= dt;
    if (m.t <= 0) { this.endMel(false); return; }
    if (op.atk) this.hold('atkup', op.atk * k);
    if (op.speed) this.hold('haste', op.speed * k);
    if (op.dr) this.hold('dmgreduce', op.dr * k);
    if (op.ccres) this.hold('ccres', op.ccres);
    call(m.view, 'boost', b, this.boostSrc());
    if (dt > 0 && (op.heal || op.mp)) {
      m.tick -= dt;
      if (m.tick <= 0) {
        m.tick += op.tick || 1;
        if (op.heal) {
          const hp = this.healPow(), n = pc.maxHp * op.heal * k * (1 + hp); pc.heal(n, false); const healed = [pc];
          for (const s of this.eng.summons) if (s.living && !s.dead && Math.hypot(s.pos.x - pc.pos.x, s.pos.z - pc.pos.z) <= (op.near || 6)) { s.hp = Math.min(s.maxHp, s.hp + s.maxHp * op.heal * k); healed.push(s); }
          this.log.heals += healed.length; call(m.view, 'pulse', healed); this.sfx('mu_harp_tick');
        }
        if (op.mp) { const before = pc.sp; pc.sp = Math.min(pc.maxSp, pc.sp + pc.maxSp * op.mp * k); this.log.mp += pc.sp - before; call(m.view, 'pulse', [pc]); this.sfx('mu_flute_tick'); }
      }
    }
  }
  endMel(switching) {
    const m = this.mel; if (!m) return; this.mel = null; if (this.eng.melody === m) this.eng.melody = null;
    this.dropStats(); call(m.view, 'end', switching);
  }
  boostSrc() { let s = null, b = 0; for (const x of this.boosts) if (x.t > 0 && x.mul > b) { b = x.mul; s = x.src; } return s; }
  addBoost(src, mul, dur) {
    if (!this.mel) return false;   // 켜 둔 선율이 있을 때만
    const x = this.boosts.find(y => y.src === src); if (x) { x.mul = mul; x.t = dur; } else this.boosts.push({ src, mul, t: dur });
    return true;
  }
  /** 수호의 코랄: 맞은 쪽 현이 잠깐 떨림 (actors.js Player.takeDamage) */
  onPlayerHit(d) {
    const m = this.mel; if (!m || m.id !== 'coral' || !d || d.dot || !d.source || !d.source.pos) return;
    if (this.clock - this.flinchT < MU.coralFlinch) return; this.flinchT = this.clock;
    const pc = this.pc; call(m.view, 'flinch', norm(d.source.pos.x - pc.pos.x, d.source.pos.z - pc.pos.z));
  }
  k_b5(op, ctx) {   // 앙코르: 두 팔을 올리는 순간 회복 + 보호막 + 선율 강화(있을 때만)
    const pc = this.pc; ctx.muReleased = true; this.watch = null;
    const n = pc.maxHp * op.heal * ctx.mult * (1 + this.healPow()); pc.heal(n);
    const sp = pc.sheet && pc.sheet.final ? pc.sheet.final.shieldPower || 0 : 0, mp = pc.stat ? pc.stat('matk') || pc.stat('atk') || 0 : 0;
    const sh = Math.round((op.shBase + op.shCoef * mp) * ctx.mult * (1 + sp)); pc.addShield(sh, op.shDur);
    const boosted = this.addBoost('encore', op.boost, op.boostDur);
    try { this.G.ui.floatText(pc.pos, '보호막 ' + sh, '#8ce6ff', 0.9, 1.6); } catch (e) { }
    call(ctx.muPre || this.fx('encore', pc, { cast: 0, mel: this.mel ? this.mel.id : null }), 'raise', { mel: boosted ? this.mel.id : null });
    this.later(0.6, () => this.duck(false));
    this.log.b5 = { heal: n, shield: sh, boosted };
  }

  // ================================================================== C. 환영 오케스트라
  k_c1(op, ctx) {   // 에코 리프라이즈: 메아리 대기(상태 echo) + 등 뒤 잔상
    const pc = this.pc, dur = durL(op.dur, ctx.L);
    this.apply(pc, 'echo', dur, op.val); this.echoDelay = op.delay ?? MU.echoDelay;
    call(this.echoView, 'end'); this.echoView = this.fx('ghost', pc, { dur });
  }
  k_c2(op, ctx) {   // 공명 하프: 하나만
    if (this.harp) this.endHarp();
    const c = this.ground(ctx.aim.x, ctx.aim.z), life = durL(op.life, ctx.L);
    this.harp = { c, r: op.r, amp: op.amp, life, age: 0, unfold: op.unfold, dead: false, view: this.fx('harp', c, { r: op.r, life, unfold: op.unfold, facing: ctx.facing }) };
  }
  endHarp() { const h = this.harp; if (!h) return; h.dead = true; call(h.view, 'end'); this.harp = null; }
  k_c3(op, ctx) {   // 팬텀 트리오: 하나만(다시 부르면 새 트리오), 소환 상한 8
    const eng = this.eng, pc = this.pc;
    for (const s of eng.summons) if (!s.dead && s.kind === 'phantom_trio') s.vanish(false);
    const alive = eng.summons.filter(s => !s.dead); if (alive.length >= 8) alive[0].vanish(false);
    const c = this.spot(ctx.aim, 0.6), s = new MuTrio(this, op, ctx, c); eng.summons.push(s); pc.zone.actors.push(s); return s;
  }
  spot(base, r) { const pc = this.pc; if (!this.blocked(base.x, base.z, r)) return this.ground(base.x, base.z); for (let k = 1; k <= 8; k++) { const a = k * 0.785, x = base.x + Math.cos(a), z = base.z + Math.sin(a); if (!this.blocked(x, z, r)) return this.ground(x, z); } return this.ground(pc.pos.x, pc.pos.z); }
  k_c5(op, ctx) {   // 그랜드 심포니: 뒤편 반원 악단 — 현악 -> 관악 -> 타악 -> 합주(앞쪽)
    const pc = this.pc, f = ctx.facing, o = { ...ctx.origin }; ctx.muReleased = true; this.watch = null;
    const boosted = this.addBoost('symph', op.boost, op.boostDur);
    const view = ctx.muPre || this.fx('stage', pc, { cast: 0, facing: f, origin: o });
    const count = new Map(), L = this.log.sym = { hits: [], fin: 0, boosted };
    const front = () => this.enemies().filter(c => { const dx = c.pos.x - o.x, dz = c.pos.z - o.z, d = Math.hypot(dx, dz); return d - (c.radius || 0.5) <= op.r && (d < 0.5 || (dx * f.x + dz * f.z) / d > -0.2); });
    const pick = () => { const ts = front(); ts.sort((a, b) => (count.get(a) || 0) - (count.get(b) || 0) || Math.hypot(a.pos.x - o.x, a.pos.z - o.z) - Math.hypot(b.pos.x - o.x, b.pos.z - o.z)); return ts[0] || null; };
    const parts = ['strings', 'brass', 'perc'];
    op.parts.forEach((cnt, pi) => { for (let j = 0; j < cnt; j++) this.later(op.at_[pi] + j * 0.15, () => {
      if (pc.dead) return; const t = pick(); call(view, 'play', parts[pi], j, t);
      if (j === 0) this.sfx(['mu_string', 'mu_horn', 'mu_cymbal'][pi]);
      if (!t) { L.hits.push({ part: parts[pi], t: null }); return; }
      count.set(t, (count.get(t) || 0) + 1); const ok = this.hit(t, op.coef, ctx); if (ok) this.gain(ctx, op.phrase, 'c5');
      L.hits.push({ part: parts[pi], t, ok }); call(view, 'land', parts[pi], t, ok); this.impact(ok ? [t] : [], f, false);
    }); });
    this.later(op.at_[3], () => {
      if (pc.dead) return;
      const ts = this.eng.targets(HitShape.cone(o.x, o.z, f.x, f.z, op.finR, op.finAng)), landed = [];
      for (const t of ts) if (this.hit(t, op.fin, ctx)) landed.push(t);
      L.fin = landed.length; call(view, 'tutti', { r: op.finR, ang: op.finAng, hits: landed }); this.sfx('mu_chord');
      this.impact(landed, f, true); this.later(0.6, () => this.duck(false));
    });
  }

  // ------------------------------------------------------------------ frame
  tick(dt) {
    const pc = this.pc;
    if (pc.dead) { if (this.timers.length || this.things.length) this.clear(); return; }
    for (const t of this.timers.slice()) { t.t -= dt; if (t.t <= 0) { const i = this.timers.indexOf(t); if (i >= 0) this.timers.splice(i, 1); try { t.f(); } catch (e) { console.error('mu timer', e); } } }
    for (const p of this.things) p.update(dt);
    this.things = this.things.filter(p => !p.dead);
    for (const b of this.boosts) b.t -= dt; this.boosts = this.boosts.filter(b => b.t > 0);
    this.tickMel(dt);
    if (this.harp) { const h = this.harp; h.age += dt; h.life -= dt; if (h.life <= 0) this.endHarp(); else call(h.view, 'near', this.ampK() > 1); }
    if (this.echoView && !(pc.status && pc.status.has && pc.status.has('echo'))) { call(this.echoView, 'end'); this.echoView = null; }
    // 시전이 끊긴 궁극기: 시전 연출·배경 음악 원래대로
    const w = this.watch; if (w && !w.muReleased && !(this.eng.casting && this.eng.casting.ctx === w)) { call(w.muPre, 'cancel'); this.watch = null; this.duck(false); }
  }
  clear() {
    for (const t of this.things) t.dispose && t.dispose();
    this.endMel(false); this.endHarp(); call(this.echoView, 'end');
    if (this.watch) call(this.watch.muPre, 'cancel');
    try { if (this.pc.status && this.pc.status.remove) this.pc.status.remove('echo'); } catch (e) { }
    this.duck(false); this.reset();
  }
}

// ------------------------------------------------------------------ 팬텀 트리오 (zone.actors 안, faction player, 생명·기계 아님)
export class MuTrio {
  constructor(kit, op, ctx, p) {
    const pc = kit.pc; this.kit = kit; this.eng = kit.eng; this.kind = 'phantom_trio'; this.o = op; this.ctx = ctx; this.zone = pc.zone; this.uid = 'm' + (++SUID);
    this.pos = { x: p.x, y: p.y || 0, z: p.z }; this.radius = 0.6; this.faction = 'player'; this.isSummon = true; this.music = true; this.living = false; this.machine = false; this.taunt = false; this.fly = false;
    this.status = { list: [], has: () => false, apply: () => { }, remove: () => { }, flag: () => 0, bonus: () => 0, slow: 1, tick: () => { } };
    this.shield = 0; this.dead = false; this.invuln = 0; this.knock = { x: 0, z: 0 }; this.facing = { ...ctx.facing };
    this.maxHpV = Math.max(10, pc.maxHp * (op.hp || 0.8) * ctx.mult); this.hp = this.maxHpV;
    this.life = durL(op.life, ctx.L); this.age = 0; this.enter = op.enter || 0.25; this.cd = 0; this.turn = 0; this.think = 0; this.target = null;
    this.log = { notes: 0, chords: 0, retarget: 0, regroup: 0, parts: [0, 0, 0] };
    this.view = kit.fx('trio', this, { enter: this.enter, facing: this.facing });
  }
  get maxHp() { return this.maxHpV; }
  get ready() { return this.age >= this.enter * 3; }
  stat(s) { const pc = this.kit.pc; if (s === 'def') return pc.stat('def') * 0.6; if (s === 'dmgReduce') return 0; if (s === 'moveSpeed') return 0; return pc.stat(s); }
  get stunned() { return false; }
  get body() { return null; }
  dist(o) { return Math.hypot(this.pos.x - o.pos.x, this.pos.z - o.pos.z); }
  takeDamage(d) { if (this.dead || d.missed) return; const a = Math.max(0, d.amount || 0); this.hp -= a; try { this.kit.G.ui.floatText(this.pos, Math.round(a) + '', '#ffb0b0', 0.8); } catch (e) { } call(this.view, 'hurt'); if (this.hp <= 0) this.vanish(false); }
  heal() { }
  addShield() { }
  setFacing(x, z) { const m = Math.hypot(x, z); if (m > 1e-4) this.facing = { x: x / m, z: z / m }; }
  destroy() { this.vanish(false); }
  vanish(silent) {
    if (this.dead) return; this.dead = true; this.hp = 0;
    const i = this.zone.actors.indexOf(this); if (i >= 0) this.zone.actors.splice(i, 1);
    if (this.view) { if (silent) call(this.view, 'dispose'); else call(this.view, 'fade'); }
  }
  pick() {
    const pc = this.kit.pc, R = this.o.range, ot = pc.target && !pc.target.dead && pc.target.faction !== 'player' && !pc.target.isSummon ? pc.target : null;
    if (ot && this.dist(ot) - (ot.radius || 0.5) <= R) return ot;
    return this.kit.nearest(this.pos, R);
  }
  update(dt) {
    if (this.dead) return;
    const pc = this.kit.pc, o = this.o; this.age += dt; this.life -= dt;
    if (this.life <= 0 || pc.dead || pc.zone !== this.zone) return this.vanish(pc.zone !== this.zone);
    if (this.dist(pc) > MU.trioLeash || Math.abs((pc.pos.y || 0) - (this.pos.y || 0)) > 1.2) {   // 너무 멀거나 높이가 다르면(보스 결계) 주인 뒤로 다시 모임
      const f = pc.facing, p = this.kit.spot({ x: pc.pos.x - f.x * 1.6, z: pc.pos.z - f.z * 1.6 }, 0.6);
      this.pos = { x: p.x, y: p.y, z: p.z }; this.target = null; this.log.regroup++; call(this.view, 'regroup');
    }
    if (!this.ready) { call(this.view, 'sync', this); return; }
    this.think -= dt;
    if (this.think <= 0 || !this.target || this.target.dead || this.dist(this.target) - (this.target.radius || 0.5) > o.range) {
      this.think = MU.trioThink; const t = this.pick(); if (t !== this.target && this.target) this.log.retarget++; this.target = t;
    }
    if (this.target) this.setFacing(this.target.pos.x - this.pos.x, this.target.pos.z - this.pos.z);
    this.cd -= dt;
    if (this.cd <= 0 && this.target) {
      this.cd += o.gap; const i = this.turn % 3, t = this.target; this.turn++;
      const ok = this.hitTarget(t, o.coef); this.log.notes++; this.log.parts[i]++;
      call(this.view, 'play', i, t, ok); this.kit.sfx('mu_note', { rate: [1.0, 0.75, 1.26][i] });
      if (this.turn % (3 * (o.every || 3)) === 0) this.kit.later(0.18, () => {
        if (this.dead || !t || t.dead) return; const ok2 = this.hitTarget(t, o.chord); this.log.chords++;
        if (ok2) this.kit.gain(null, 0.5, 'trio'); call(this.view, 'chord', t, ok2); this.kit.sfx('mu_trio');
      });
    } else if (this.cd < 0) this.cd = 0;
    call(this.view, 'sync', this);
  }
  hitTarget(t, coef) { const ctx = { ...this.ctx }; this.eng.dmg(t, coef, ctx, { quiet: true, elem: 'sound' }); return !ctx.missed; }
}

// ------------------------------------------------------------------ 툴팁(스킬 창 현재/다음 레벨): 실제 op 값으로 계산 (js/skillui.js levelText)
const pct = v => (Math.round(v * 1000) / 10).toString().replace(/\.0$/, '') + '%';
const sec = v => (Math.round(v * 10) / 10).toString() + '초';
export function muText(d, L, info = {}) {
  const ult = d.type === 'ultimate', m = 1 + (ult ? 0.25 : 0.12) * (L - 1), o = (d.ops || []).find(x => x.fn === 'mu' && x.k !== 'pre');
  if (d.id === 'mu_c4') { const g = (d.flags.phraseGain[0] + d.flags.phraseGain[1] * (L - 1)), s = (d.flags.switchBonus[0] + d.flags.switchBonus[1] * (L - 1)); return `악절 획득 +${pct(g)} · 선율을 바꾼 뒤 다음 공격 선율 1회 +${pct(s)}(${MU.icd}초에 한 번)`; }
  if (!o) return '';
  const D = v => sec(durL(v, L)), out = [], ph = n => `맞히면 악절 +${n}(한 번 쓸 때 1번)`;
  switch (o.k) {
    case 'a1': out.push(`직선 ${o.len} m 관통 · ${pct(o.coef * m)}(적마다 1번)`, ph(o.phrase)); break;
    case 'a2': out.push(`반경 ${o.r} m · ${pct(o.coef * m)}`, `공격력 -${pct(o.atkdown)} ${sec(o.atkdownDur)}`, `일반 적 경직 ${sec(o.stagger)}(보스 면역)`, ph(o.phrase)); break;
    case 'a3': out.push(`파동 ${o.n}개 × ${pct(o.coef * m)}`, `같은 적 연속 명중 시 마지막 타 ×(1 + ${o.cres} × 연속 수) — ${o.n}연속 ×${(1 + o.cres * o.n).toFixed(2)}`, ph(o.phrase)); break;
    case 'a4': out.push(`반경 ${o.r} m · ${pct(o.coef * m)}`, `공격력 감소 상태인 적: 추가 파동 ${pct(o.react.coef * m)}(둘레 ${o.react.r} m, 한 번 쓸 때 적마다 1번)`, ph(o.phrase)); break;
    case 'a5': { const n = info.phrase ?? 0, tot = o.coef * m * (1 + o.per * Math.min(o.cap, n));
      out.push(`악절 0개 ${pct(o.coef * m)} · 악절마다 +${pct(o.per)}(최대 ${o.cap}개 ${pct(o.coef * m * (1 + o.per * o.cap))})`, `현악 ${pct(o.w[0])}·타악 ${pct(o.w[1])}·관악 ${pct(o.w[2])}·합주 ${pct(o.w[3])}`, `지금 악절 ${Math.floor(n)}개 → 총 ${pct(tot)}`); break; }
    case 'b1': out.push(`1초마다 최대 HP의 ${pct(o.heal * m)} 회복(나 + ${o.near} m 안 생명 소환물)`, `지속 ${D(o.dur)}`, '지속 선율은 하나만'); break;
    case 'b2': out.push(`공격력 +${pct(o.atk * m)} · 이동 속도 +${pct(o.speed * m)}`, `지속 ${D(o.dur)}`, '지속 선율은 하나만'); break;
    case 'b3': out.push(`받는 피해 -${pct(o.dr * m)}(피해 감소)`, `상태이상 시간 -${pct(o.ccres)}`, `지속 ${D(o.dur)}`, '지속 선율은 하나만'); break;
    case 'b4': out.push(`1초마다 최대 기력의 ${pct(o.mp * m)} 회복(유지 비용 없음)`, `지속 ${D(o.dur)}`, '지속 선율은 하나만'); break;
    case 'b5': out.push(`최대 HP의 ${pct(o.heal * m)} 회복`, `보호막 ${o.shBase} + 마법력 ${pct(o.shCoef)}(×${m.toFixed(2)}) ${sec(o.shDur)}`, `켜 둔 선율 +${pct(o.boost)} ${sec(o.boostDur)}(심포니와 겹치면 큰 쪽)`); break;
    case 'c1': out.push(`다음 공격 선율 1회 반복 ${pct(o.val)} 위력`, `대기 ${D(o.dur)}`, '기력·악절 없음, 궁극기·회복·소환은 복제 안 함'); break;
    case 'c2': out.push(`하프 반경 ${o.r} m 안에서 내 음파 공격 범위 +${pct(o.amp)}(투사체 = 사거리, 범위 = 반경)`, `${D(o.life)} · 하나만`); break;
    case 'c3': { const per = (o.coef * 3 * (o.every || 3) + o.chord) / (o.gap * 3 * (o.every || 3));
      out.push(`${sec(o.gap)}마다 연주자 차례로 ${pct(o.coef * m)} · ${o.every}바퀴마다 합주 ${pct(o.chord * m)}`, `초당 약 ${pct(per * m)}`, `${D(o.life)} · 사거리 ${o.range} m · 하나만`); break; }
    case 'c5': out.push(`현악 ${o.parts[0]} · 관악 ${o.parts[1]} · 타악 ${o.parts[2]}회 × ${pct(o.coef * m)}`, `합주 부채꼴 ${o.finR} m ${o.finAng}° ${pct(o.fin * m)}`, `켜 둔 선율 +${pct(o.boost)} ${sec(o.boostDur)}(앙코르와 겹치면 큰 쪽)`); break;
  }
  return out.join(' · ');
}
