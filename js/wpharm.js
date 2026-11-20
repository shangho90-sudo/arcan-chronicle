// 양약사(western_pharmacist) 2차 스킬 규칙 (2026-11-16 개편, 2026-11-20 6종 교체): 정밀 제약술 · 표적 전달과 약물 반응 · 첨단 조제와 생체 보호.
// 전투 콘셉트: 적에게 제형을 붙이고(이중정·발포정), 약효가 터질 시점을 고르고(긴급 방출), 위급한 아군에게 필요한 제제를 전달(구급함·서방 패치·붕대 릴).
// 스킬 데이터는 tools/skills2/gen.py (wp_*, 수치는 op 필드), 실행은 js/skillrt.js 가 이 파일의 WpKit 을 부름(eng.wp, CUSTOM wp_*).
// 화면은 js/wpharmfx.js (FX.wp(kind, a, o)). 이 파일은 렌더링을 직접 하지 않음 — fx 가 null 이어도(메시 로딩 전·테스트) 규칙은 그대로.
//
// 반응 표식(공용, 'reaction'): 대상마다 최대 3개, 8초(더할 때마다 다시 8초), 소비하면 0. 한 번 시전으로 한 대상에 쌓이는 수 = 1 —
//   같은 시전의 여러 타격·폭발·장판 틱은 더 쌓지 않음(ctx.wpMarks). 이중정을 배운 뒤에는 약사 1차 약병 공격(태그 flask)도 던질 때마다
//   대상마다 1개(약병폭격 10병·불꽃심지병의 불 장판·서리병 얼음길은 그 한 번에 포함 — 다시 쌓지 않음).
// 제제(이중정 내핵·발포정)와 반응 표식은 서로 다른 자원: 긴급 방출은 '내 제제'만 작동시키고 표식을 쓰지 않음, 연쇄 용출·임계 농도는 표식만 소비.
// 파생 피해(서방형 미립자 지대·연쇄 용출의 둘레 폭발 피해)는 표식을 만들지 않고, 지대·연쇄를 새로 만들지 않음.
// 연쇄 용출: 시전마다 방문 집합 — 같은 적 두 번 없음, 표식 없는 적으로는 이어지지 않음, 최대 수·거리 상한.
// 최종 처방: 치명상 -> 최소 체력 + 보호막 + 짧은 재생, 내부 쿨타임 120초(eng.cd.wp_c5 — 재접속에도 유지), 같은 순간의 연속 타격은 0.3초 유예로 한 번만.
// 회복 대상: 나 + '생명 소환물'(s.living — 한약사·화가 소환물 등; 엔지니어 병기·음악가 트리오는 아님). 양약사 자신은 소환물이 없어 혼자서는 모두 나에게.
//   지원 대상 고르기: PC 에서 내 생명 소환물을 누르면 pc.allyTarget(js/actors.js onClick, game.js pickAlly). 휴대폰은 자동(아래 각 스킬).
import { HitShape } from './core.js';
import { clearLine } from './smith.js';

export const WP = {
  job: 'western_pharmacist',
  mark: { max: 3, dur: 8 },
  capsule: { fly: 0.30, split: 0.12, launch: 0.03, first: 0.56, gap: 0.085, w: [0.16, 0.16, 0.16, 0.16, 0.36] },   // 과립 피해 몫(합 1)
  cryo: { fly: 0.40, film: 0.22, rise: 0.36, burst: 1.0 },
  ion: { align: 0.22, strike: 0.30 },
  tri: { at: [0.45, 0.62, 0.79], combo: 0.12, perMark: 0.10 },
  collapse: { contact: 1.05, lock: 1.25, kick: [0.14, 0.12] },
  tablet: { fly: 0.2, core: 2.0, blinks: [1.0, 1.5], max: 4 },            // 이중정: 손을 떠나 0.2초에 붙음, 내핵 2초, 깜빡임 = 남은 1초·0.5초
  foam: { fall: 0.35, first: 0.5, gap: 0.4, max: 2 },                        // 발포정: 떨어져 닿기까지, 닿은 뒤 첫 기포, 기포 간격(마지막 큰 기포 = 작은 기포 뒤 gap+0.1)
  release: { max: 14 },                                                      // 긴급 방출이 고르는 발포정: 내 둘레 14 m 안
  kit: { fly: 0.32 },                                                        // 구급함: 패치가 날아가는 시간
  reel: { shoot: 0.14, pull: 0.42, step: 0.2, gap: 0.45 },                   // 붕대 릴: 붕대가 닿기까지, 당기는 시간, 길 검사 간격, 도착 자리(내 앞 반지름 + gap)
  chain: { first: 0.22, hop: 0.2 },
  critical: { snap: 0.15, burst: 1.05, lock: 1.2, kick: [0.12, 0.11] },
  zone: { r: 1.6, life: 4, tick: 1, max: 3, merge: 1.2 },
  lastRx: { icd: 120, shield: 5, regen: 4, regenPct: 0.03, grace: 0.3 },
};
const call = (h, m, ...a) => { try { return h && h[m] ? h[m](...a) : null; } catch (e) { console.warn('wpharmfx', m, e); return null; } };
const alive = (t) => !!(t && !t.dead && !t.removed);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class WpKit {
  constructor(eng, h) { this.eng = eng; this.h = h; this.reset(); }
  reset() { this.tablets = []; this.foams = []; this.kitS = null; this.patches = []; this.reels = []; this.zones = []; this.graceT = 0; this.log = { chains: [], zones: 0, lastRx: 0, cores: 0, finals: 0, released: [], heals: [], reels: [] }; }
  get pc() { return this.eng.pc; }
  get G() { return this.h.G(); }
  get clock() { return this.eng.clock; }
  fx(kind, a, o) { return this.h.fx(kind, a, o); }
  sfx(n) { try { this.G.audio.sfx(n); } catch (e) { } }
  lvl(id) { return Math.max(1, this.eng.book.level(id)); }
  later(sec, fn, ctx) { this.eng.pending.push({ time: this.clock + Math.max(0, sec), op: { op: '_run', run: fn }, ctx }); }
  handPoint() {
    const pc = this.pc; let h = null; try { h = pc.body && pc.body.handPoint && pc.body.handPoint(); } catch (e) { h = null; }
    return h ? { x: h.x, y: h.y, z: -h.z } : { x: pc.pos.x + pc.facing.x * 0.4, y: (pc.pos.y || 0) + 1.25, z: pc.pos.z + pc.facing.z * 0.4 };
  }
  enemiesIn(x, z, r) { return this.eng.targets(HitShape.circle(x, z, r)); }
  nearest(p, r, skip) { let best = null, bd = r; for (const t of this.enemiesIn(p.x, p.z, r)) { if (skip && skip.has(t)) continue; const d = dist(t.pos, p); if (d <= bd) { bd = d; best = t; } } return best; }

  // ------------------------------------------------------------------ 표식
  marksOf(t) { return t && t._marks ? t._marks.reaction | 0 : 0; }
  /** 시전(던짐) 한 번에 대상마다 한 번만 1개 (최대 3은 addMark 가 지킴) */
  mark(t, ctx) {
    if (!alive(t) || !ctx) return 0;
    const seen = ctx.wpMarks || (ctx.wpMarks = new Set()); if (seen.has(t)) return 0;
    seen.add(t); this.h.addMark(t, 'reaction', 1); return 1;
  }
  /** 이중정 습득 효과: 약사 1차 약병 공격(태그 flask)도 반응 표식을 남김 (js/skillrt.js onHit) */
  flaskMarks() { const b = this.eng.book; return !!(b && (b.usable ? b.usable('wp_b1') : b.level('wp_b1') > 0)); }
  take(t) { return this.h.takeMarks(t, 'reaction'); }

  // ------------------------------------------------------------------ 피해(양약사 공통: 전역 정지·흔들림 없음)
  hit(t, coef, ctx, o = {}) {
    if (!alive(t)) return { amount: 0, missed: true };
    const c = coef;
    const amount = this.eng.dmg(t, c, ctx, { elem: o.elem, quiet: true, derived: !!o.derived });
    const missed = !!ctx.missed;
    if (!missed && !o.derived) for (const s of o.st || []) this.h.applyStatus(t, s, this.pc, ctx.mult);
    return { amount, missed };
  }
  statusAfter(t, list, ctx) { for (const s of list || []) this.h.applyStatus(t, s, this.pc, ctx.mult); }

  // ------------------------------------------------------------------ 시전 훅 (skillrt cast) / 시전 전 검사 (skillrt validate — 실패하면 기력·재사용 대기 안 씀)
  onCast() { }
  validate(d, aim) {
    if (!d || d.job !== WP.job) return null;
    if (d.ops.some(o => o.fn === 'wp_release') && !this.releasePick(aim)) return '방출할 제제가 없습니다';
    return null;
  }

  // ================================================================== A. 정밀 제약술
  /** A1 작열·분열 캡슐: 손에서 캡슐이 날아가 대상 위에서 돌며 두 쪽으로 갈라짐 -> 과립 5개가 서로 다른 곡선으로 차례로 명중,
   *  마지막 과립 = 붉은 반응 고리 작은 폭발 + 화상. 대상이 죽으면 남은 과립은 가까운 적에게(op.retarget m 안), 없으면 사라짐. */
  wp_capsule(op, ctx) {
    const eng = this.eng, pc = this.pc, W = WP.capsule, n = op.n || 5, w = op.w && op.w.length === n ? op.w : n === W.w.length ? W.w : Array(n).fill(1 / n);
    const st = { tgt: alive(ctx.tgt) ? ctx.tgt : eng.targetFor(ctx.d), last: null, done: 0 };
    if (!st.tgt) return; st.last = { ...st.tgt.pos };
    const get = () => (alive(st.tgt) ? st.tgt.pos : st.last);
    const fx = this.fx('capsule', pc, { from: this.handPoint(), tgt: () => st.tgt, at: get, fly: W.fly, split: W.split, n });
    ctx.wpCapsule = st;
    const pick = () => { if (alive(st.tgt)) { st.last = { ...st.tgt.pos }; return st.tgt; } const nt = this.nearest(st.last, op.retarget || 6); if (nt) { st.tgt = nt; st.last = { ...nt.pos }; } else st.tgt = null; return st.tgt; };
    for (let i = 0; i < n; i++) {
      const tl = W.fly + W.split + i * W.launch, ta = W.first + i * W.gap;
      this.later(tl, () => { pick(); call(fx, 'launch', i, ta - tl, !!st.tgt); }, ctx);
      this.later(ta, () => {
        const t = pick(), last = i === n - 1;
        if (!t) { call(fx, 'fizzle', i); return; }
        const r = this.hit(t, op.coef * w[i], ctx, { elem: 'fire' });
        if (!r.missed) this.mark(t, ctx);
        call(fx, 'hit', i, { x: t.pos.x, y: t.pos.y || 0, z: t.pos.z, r: t.radius || 0.5 }, !r.missed, last);
        this.sfx(last ? 'wp_ring' : 'wp_granule');
        if (last) {   // 붉은 반응 고리: 실제 반경 op.finR 안의 적 모두
          const c = { ...t.pos };
          for (const x of this.enemiesIn(c.x, c.z, op.finR || 1.6)) { const rr = this.hit(x, op.fin, ctx, { elem: 'fire', st: op.st }); if (!rr.missed) this.mark(x, ctx); if (x.body && x.body.punch) x.body.punch(x.pos.x - c.x || 0.01, x.pos.z - c.z, 0.14); }
          call(fx, 'ring', { x: c.x, y: t.pos.y || 0, z: c.z }, op.finR || 1.6);
        }
      }, ctx);
    }
  }
  /** A2 발포정: 커다란 흰 발포정이 조준점에 떨어져(fall) 가장자리부터 녹음 -> 닿은 뒤 first 초부터 gap 초마다 작은 기포 ticks 번(범위 피해, 표식 없음)
   *  -> 마지막에 가운데 부푼 큰 기포가 터짐(범위 피해 + 표식 1). 둔화된 적은 기포 피해 +slowBonus(서리병 굴리기로 늦춘 뒤 그 길에 놓는 용도).
   *  긴급 방출 = 남은 작은 기포를 포기하고 큰 기포를 지금(finalBubble 한 번만 — done). 동시에 WP.foam.max 개(넘으면 가장 오래된 것이 조용히 꺼짐). */
  wp_foam(op, ctx) {
    const pc = this.pc, W = WP.foam, r = op.r || 2.2, c = this.ground(ctx.aim || pc.pos), ticks = op.ticks || 5;
    const live = this.foams.filter(F => !F.done); while (live.length >= W.max) this.endFoam(live.shift(), 'replace'); this.foams = live;
    const land = this.clock + W.fall, F = { c, r, op, ctx, L: ctx.L, landAt: land, landed: false, next: land + W.first, left: ticks, n: 0, finalAt: land + W.first + (ticks - 1) * W.gap + W.gap + 0.1, done: false, born: this.clock };
    F.fx = this.fx('foam', pc, { from: this.handPoint(), at: c, r, fall: W.fall, life: F.finalAt - this.clock, ticks });
    this.foams.push(F);
  }
  slowMul(t, op) { const s = t.status && t.status.slow; return op.slowBonus && typeof s === 'number' && s < 0.999 ? 1 + op.slowBonus : 1; }
  foamTick(F) {
    const hits = [];
    for (const t of this.enemiesIn(F.c.x, F.c.z, F.r)) { const r = this.hit(t, F.op.tick * this.slowMul(t, F.op), F.ctx, { elem: 'poison' }); if (!r.missed) hits.push(t); }
    call(F.fx, 'pop', F.n++, hits.length); this.sfx('wp_bubble'); F.left--;
  }
  /** 마지막 큰 기포 — 자연 만료든 긴급 방출이든 한 번만(F.done). boost = 긴급 방출 강화 */
  foamFinal(F, early, boost = 0) {
    if (!F || F.done) return false; F.done = true; F.early = !!early;
    const hits = [];
    for (const t of this.enemiesIn(F.c.x, F.c.z, F.r)) { const r = this.hit(t, F.op.fin * this.slowMul(t, F.op) * (1 + boost), F.ctx, { elem: 'poison' }); if (!r.missed) { hits.push(t); this.mark(t, F.ctx); if (t.body && t.body.punch) t.body.punch(t.pos.x - F.c.x || 0.01, t.pos.z - F.c.z, 0.14); } }
    if (!F.landed) { F.landed = true; call(F.fx, 'land'); }
    call(F.fx, 'final', hits.length, !!early); this.sfx('wp_bigpop'); this.log.finals++;
    if (hits.length) { this.pc.freezeT = Math.max(this.pc.freezeT || 0, 0.03); for (const t of hits) t.freezeT = Math.max(t.freezeT || 0, 0.05); }
    return true;
  }
  endFoam(F, why) { if (!F) return; F.done = true; call(F.fx, why === 'final' ? 'end' : 'dispose'); }
  /** A3 이온 관통술: 은빛 약액 구슬 3~4개가 한 줄로 정렬(짧은 경고선) -> 푸른 흰 번개 한 줄기가 관통(한 번의 피해 + 표식).
   *  옆으로 갈라지는 잔가지는 그림뿐(피해 없음). */
  wp_ion(op, ctx) {
    const pc = this.pc, W = WP.ion, f = { ...ctx.facing }, len = op.len || 9, wd = op.w || 1.2;
    const o = { ...pc.pos };
    try { this.G.skillFx && this.G.skillFx.telegraph({ x: o.x, y: o.y, z: o.z }, wd, W.strike, { color: 0x9ad8ff, shape: 'line', dir: f, length: len, width: wd }); } catch (e) { /* no telegraph */ }
    const fx = this.fx('ion', pc, { from: this.handPoint(), f, len, w: wd, align: W.align, strike: W.strike, n: ctx.L >= 3 ? 4 : 3 });
    this.later(W.strike, () => {
      const sh = HitShape.rect(o.x, o.z, f.x, f.z, wd, len), ts = this.eng.targets(sh), hits = [];
      for (const t of ts) { const r = this.hit(t, op.coef, ctx, { elem: 'shock' }); if (!r.missed) { this.mark(t, ctx); hits.push({ x: t.pos.x, y: t.pos.y || 0, z: t.pos.z, r: t.radius || 0.5 }); if (t.body && t.body.punch) t.body.punch(f.x, f.z, 0.12); } }
      call(fx, 'strike', hits); this.sfx('wp_ion');
    }, ctx);
  }
  /** A4 삼상 복합제: 붉은 캡슐(왼쪽 위 곡선)·푸른 앰플(오른쪽 곡선)·금빛 정제(위에서 수직)가 대상 둘레 삼각형으로 섰다가 화염 -> 냉기 -> 전격 순서로
   *  꽂힘. 셋 모두 같은 대상에 맞으면 복합 반응 폭발 한 번. 각 타격은 대상의 표식 1개당 +10%(소비하지 않음). */
  wp_tri(op, ctx) {
    const pc = this.pc, W = WP.tri, t0 = alive(ctx.tgt) ? ctx.tgt : this.eng.targetFor(ctx.d); if (!t0) return;
    const st = { got: new Set(), last: { ...t0.pos } };
    const fx = this.fx('triad', pc, { from: this.handPoint(), tgt: () => (alive(t0) ? t0 : null), at: () => (alive(t0) ? t0.pos : st.last), times: W.at });
    const K = [{ elem: 'fire', st: [{ id: 'burn', dur: 3, val: 0.1, ch: 1 }], sfx: 'ph_glass_fire' }, { elem: 'ice', st: [{ id: 'slow', dur: 2, val: 0.3, ch: 1 }], sfx: 'ph_glass_ice' }, { elem: 'shock', st: [], sfx: 'wp_ion' }];
    K.forEach((k, i) => this.later(W.at[i], () => {
      if (!alive(t0)) { call(fx, 'fizzle', i); return; }
      st.last = { ...t0.pos };
      const r = this.hit(t0, op.coef * (1 + W.perMark * this.marksOf(t0)), ctx, { elem: k.elem, st: k.st });
      if (!r.missed) { st.got.add(k.elem); this.mark(t0, ctx); }
      call(fx, 'hit', i, { x: t0.pos.x, y: t0.pos.y || 0, z: t0.pos.z, r: t0.radius || 0.5 }, !r.missed); this.sfx(k.sfx);
    }, ctx));
    this.later(W.at[2] + W.combo, () => {
      if (st.got.size < 3 || !alive(t0)) { call(fx, 'end', false); return; }
      const c = { ...t0.pos }, R = op.r || 2.2;
      for (const x of this.enemiesIn(c.x, c.z, R)) this.hit(x, op.combo * (1 + W.perMark * this.marksOf(x)), ctx, { elem: 'light' });
      call(fx, 'compound', { x: c.x, y: t0.pos.y || 0, z: c.z }, R); this.sfx('wp_crystal');
      ctx.wpCompound = true;
    }, ctx);
  }
  /** A5 대형 캡슐 붕괴(궁극기): 조준점 위에 거대한 반투명 캡슐 -> 과립이 가운데로 모여 핵 -> 두 쪽이 열림 -> 핵이 떨어져 땅에 닿는 순간
   *  넓은 범위 피해 + 낮은 고리 충격파 + 결정 파편, 카메라 짧게 한 번. 주 피해 = 접촉 순간. */
  wp_collapse(op, ctx) {
    const pc = this.pc, W = WP.collapse, r = op.r || 3.8, c = { ...ctx.aim }; c.y = pc.zone.geo.ground(c.x, c.z).y;
    pc.skills.lock = Math.max(pc.skills.lock || 0, W.lock);
    try { this.G.skillFx && this.G.skillFx.telegraph({ x: c.x, y: c.y, z: c.z }, r, W.contact, { color: 0x9ad8ff, shape: 'circle' }); } catch (e) { /* no telegraph */ }
    const fx = this.fx('collapse', pc, { at: c, r, contact: W.contact });
    this.later(0.05, () => this.sfx('magic'), ctx);
    this.later(W.contact, () => {
      const hits = [];
      for (const t of this.enemiesIn(c.x, c.z, r)) { const res = this.hit(t, op.coef, ctx, { elem: 'light' }); if (!res.missed) { this.mark(t, ctx); hits.push(t); if (t.body && t.body.punch) t.body.punch(t.pos.x - c.x || 0.01, t.pos.z - c.z, 0.22); } }
      call(fx, 'impact', hits.length);
      if (hits.length) { pc.freezeT = Math.max(pc.freezeT || 0, 0.05); for (const t of hits) t.freezeT = Math.max(t.freezeT || 0, 0.06); }
      const G = this.G; if (G.render && G.render.kick && !G.reduceFlash) G.render.kick(c.x - pc.pos.x, c.z - pc.pos.z, W.kick[0], W.kick[1]);   // 궁극기 주 타격 한 번만
      this.sfx('wp_collapse');
    }, ctx);
  }

  // ================================================================== B. 표적 전달과 약물 반응
  /** B1 이중정: 분할선이 새겨진 흰 정제를 손가락으로 튕겨 적 하나에 붙임(fly 초) -> 닿는 순간 흰 외층이 깨져 1차 피해 + 반응 표식 1 ->
   *  드러난 푸른 내핵이 적을 따라다니며 두 번 깜빡이고(남은 1초·0.5초) core 초 뒤 터져 2차 피해(표식 없음). 타격은 정확히 두 번.
   *  대상이 먼저 쓰러지거나 외층이 빗나가면(MISS) 내핵은 피해 없이 사라짐. 긴급 방출은 내핵을 지금 터뜨림 — 자연 만료와 겹쳐도 한 번(T.done).
   *  습득 효과(패시브처럼): 약사 1차 약병 공격도 반응 표식 (flaskMarks). */
  wp_tablet(op, ctx) {
    const pc = this.pc, W = WP.tablet, t = alive(ctx.tgt) ? ctx.tgt : this.eng.targetFor(ctx.d); if (!t) return;
    const live = this.tablets.filter(T => !T.done); while (live.length >= W.max) this.endTablet(live.shift(), 'fizzle'); this.tablets = live;
    const delay = op.delay || W.core, T = { t, op, ctx, L: ctx.L, state: 'fly', done: false, coreAt: 0, delay, blinks: 0, born: this.clock };
    T.fx = this.fx('tablet', pc, { from: this.handPoint(), tgt: t, fly: W.fly, core: delay, blinks: W.blinks });
    this.tablets.push(T); this.sfx('wp_flick');
    this.later(W.fly, () => {
      if (T.done) return;
      if (!alive(t)) return this.endTablet(T, 'fizzle');
      const r = this.hit(t, op.coef, ctx, { elem: 'light' });
      if (r.missed) return this.endTablet(T, 'fizzle');
      this.mark(t, ctx); T.state = 'core'; T.coreAt = this.clock + delay; T.shellAt = this.clock;
      call(T.fx, 'shell'); this.sfx('wp_shell');
      if (t.body && t.body.punch) t.body.punch(t.pos.x - pc.pos.x || 0.01, t.pos.z - pc.pos.z, 0.08);
    }, ctx);
  }
  /** 내핵 폭발 — 한 번만. boost = 긴급 방출 강화. 대상이 없으면 false */
  coreBurst(T, early, boost = 0) {
    if (!T || T.done || T.state !== 'core') return false;
    T.done = true; T.early = !!early;
    const t = T.t; if (!alive(t)) { call(T.fx, 'fizzle'); return false; }
    const r = this.hit(t, T.op.core * (1 + boost), T.ctx, { elem: 'shock' });
    call(T.fx, 'burst', !r.missed, !!early); this.sfx(early ? 'wp_crack' : 'wp_core'); this.log.cores++;
    if (!r.missed) { this.pc.freezeT = Math.max(this.pc.freezeT || 0, 0.03); t.freezeT = Math.max(t.freezeT || 0, 0.06); if (t.body && t.body.punch) t.body.punch(t.pos.x - this.pc.pos.x || 0.01, t.pos.z - this.pc.pos.z, 0.16); }
    return true;
  }
  endTablet(T, why) { if (!T || T.done) return; T.done = true; call(T.fx, why === 'fizzle' ? 'fizzle' : 'dispose'); }

  /** B2 긴급 방출: 내가 붙인 이중정 내핵 / 설치한 발포정 하나를 지금 작동(누를 때마다 하나). 고르는 순서(releasePick):
   *  1) 선택한 적(pc.target)에게 붙은 내 내핵(여럿이면 먼저 터질 것) 2) 조준점에서 가장 가까운 내 발포정(내 둘레 WP.release.max m 안)
   *  3) 조준점에서 가장 가까운 내 내핵. 없으면 validate 가 막음 = 기력·재사용 대기를 쓰지 않음. 반응 표식은 쓰지 않음(연쇄 용출과 다른 자원).
   *  작동한 제제의 마지막 피해 +boost (자연 만료와 겹쳐도 T.done / F.done 으로 한 번만). */
  releasePick(aim) {
    const pc = this.pc, sel = pc.target, a = aim || { x: pc.pos.x + pc.facing.x * 3, z: pc.pos.z + pc.facing.z * 3 };
    const cores = this.tablets.filter(T => T.state === 'core' && !T.done && alive(T.t));
    if (alive(sel)) { const mine = cores.filter(T => T.t === sel).sort((x, y) => x.coreAt - y.coreAt)[0]; if (mine) return { kind: 'core', T: mine }; }
    const foams = this.foams.filter(F => !F.done && dist(F.c, pc.pos) <= WP.release.max).sort((x, y) => dist(x.c, a) - dist(y.c, a));
    if (foams.length) return { kind: 'foam', F: foams[0] };
    const c2 = cores.slice().sort((x, y) => dist(x.t.pos, a) - dist(y.t.pos, a))[0];
    return c2 ? { kind: 'core', T: c2 } : null;
  }
  wp_release(op, ctx) {
    const pc = this.pc, pick = this.releasePick(ctx.aim), boost = (op.boost || 0) + (op.boostLv || 0) * (ctx.L - 1);
    if (!pick) {   // 누른 뒤 그 프레임 사이에 저절로 터짐(아주 드묾): 쓴 것을 돌려줌
      pc.sp = Math.min(pc.maxSp, pc.sp + (ctx.cost || 0)); this.eng.cd[ctx.id] = 0; return;
    }
    const at = pick.kind === 'core' ? pick.T.t.pos : pick.F.c;
    this.fx('release', pc, { from: this.handPoint(), at: { x: at.x, y: (at.y || 0) + (pick.kind === 'core' ? Math.min(1.2, 0.45 + (pick.T.t.radius || 0.5) * 0.7) : 0.15), z: at.z }, kind: pick.kind });
    const ok = pick.kind === 'core' ? this.coreBurst(pick.T, true, boost) : this.foamFinal(pick.F, true, boost);
    this.log.released.push({ kind: pick.kind, t: +this.clock.toFixed(3), ok });
    if (pick.kind === 'foam') this.endFoam(pick.F, 'final');
  }
  /** B3 연쇄 용출: 대상의 표식을 소비해 터뜨리고(op.r m 안 피해), 풀려난 입자가 곡선을 그리며 op.range m 안의 '표식이 있는' 다른 적에게 이어짐.
   *  시전마다 방문 집합 — 같은 적 두 번 없음, 최대 op.max 개, 표식 없는 적은 이어지지 않음(시작 대상만 예외). 도착할 때 그 적의 표식을 소비해 폭발. */
  wp_chain(op, ctx) {
    const pc = this.pc, W = WP.chain, start = alive(ctx.tgt) ? ctx.tgt : this.eng.targetFor(ctx.d); if (!start) return;
    const visited = new Set([start]), log = { nodes: [] }; this.log.chains.push(log); if (this.log.chains.length > 8) this.log.chains.shift();
    const max = (op.max || 5) + Math.floor((ctx.L - 1) / 2);
    const fx = this.fx('chain', pc, { from: this.handPoint(), tgt: start, first: W.first });
    const node = (t, depth, from) => {
      if (!alive(t)) { call(fx, 'fizzle', depth); return; }
      const n = this.take(t), c = { ...t.pos }, coef = (depth ? op.sub || op.coef : op.coef) * (1 + (op.perStack || 0.5) * n);
      log.nodes.push({ id: t.uid || t.id || depth, n, depth });
      this.hit(t, coef, ctx, { elem: 'poison', consume: n > 0 });
      for (const x of this.enemiesIn(c.x, c.z, op.r || 2.0)) if (x !== t) this.hit(x, coef * 0.5, ctx, { elem: 'poison', derived: true });   // 둘레: 절반, 파생(표식·연쇄 없음)
      call(fx, 'burst', depth, { x: c.x, y: t.pos.y || 0, z: c.z, r: t.radius || 0.5 }, n, op.r || 2.0);
      this.sfx(depth ? 'wp_granule' : 'wp_ring');
      if (n > 0) this.residue(c, ctx);
      // 다음: 표식이 있는 적만, 가까운 순, 남은 수만큼
      const next = this.enemiesIn(c.x, c.z, op.range || 5).filter(x => !visited.has(x) && this.marksOf(x) > 0).sort((a, b) => dist(a.pos, c) - dist(b.pos, c));
      for (const x of next) {
        if (visited.size >= max) break;
        visited.add(x); const hop = W.hop + 0.04 * Math.min(4, dist(x.pos, c));
        call(fx, 'link', depth, c, x, hop);
        this.later(hop, () => node(x, depth + 1, t), ctx);
      }
    };
    this.later(W.first, () => node(start, 0, null), ctx);
    ctx.wpVisited = visited;
  }
  /** B4 서방형 미립자(패시브): 표식 폭발 자리에 과립 지대 — 주기 피해(파생: 표식·지대·연쇄 없음), 과립 수가 남은 시간에 따라 줄어듦.
   *  동시에 최대 3개(가장 오래된 것부터 사라짐), 가까운 자리(merge m)는 새로 만들지 않고 시간만 새로. */
  residue(c, ctx) {
    const v = this.eng.book.passive('residue'); if (!v) return null;
    const Z = WP.zone, near = this.zones.find(z => dist(z.c, c) < Z.merge);
    if (near) { near.life = near.max; call(near.fx, 'refresh'); return near; }
    while (this.zones.length >= Z.max) { const z = this.zones.shift(); call(z.fx, 'end'); }
    const y = this.pc.zone.geo.ground(c.x, c.z).y, z = { c: { x: c.x, y, z: c.z }, r: Z.r, life: Z.life, max: Z.life, tick: Z.tick, coef: v, ctx: { ...ctx, mult: 1, wpCat: false, wpMarks: null }, fx: this.fx('zone', { x: c.x, y, z: c.z }, { r: Z.r, life: Z.life }) };
    this.zones.push(z); this.log.zones++; return z;
  }
  tickZones(dt) {
    for (const z of this.zones) {
      z.life -= dt; z.tick -= dt; call(z.fx, 'setLeft', Math.max(0, z.life / z.max));
      if (z.tick <= 0 && z.life > 0) { z.tick += WP.zone.tick; const ts = this.enemiesIn(z.c.x, z.c.z, z.r); for (const t of ts) this.eng.dmg(t, z.coef, z.ctx, { derived: true, quiet: true, elem: 'poison' }); if (ts.length) call(z.fx, 'pulse'); }
    }
    const gone = this.zones.filter(z => z.life <= 0); for (const z of gone) call(z.fx, 'end');
    if (gone.length) this.zones = this.zones.filter(z => z.life > 0);
  }
  /** B5 임계 농도(궁극기): 범위 안 적들의 표식을 모두 소비 -> 표식마다 가운데로 빛줄기 -> 맑은 구 안에서 결정이 자라고(크기 = 소비량) 잠깐 멈췄다가
   *  푸른 흰 충격파로 터짐. 피해 = base + per x min(소비 수, cap) (표식 없으면 낮은 기본 피해), 표적 전달 대상은 +bonus. 흰 화면 섬광 없음. */
  wp_critical(op, ctx) {
    const pc = this.pc, W = WP.critical, r = op.r || 6, c = { ...pc.pos };
    pc.skills.lock = Math.max(pc.skills.lock || 0, W.lock);
    try { this.G.skillFx && this.G.skillFx.telegraph({ x: c.x, y: c.y, z: c.z }, r, W.burst, { color: 0x9ad8ff, shape: 'circle' }); } catch (e) { }
    const fx = this.fx('critical', { x: c.x, y: c.y || 0, z: c.z }, { r, burst: W.burst, snap: W.snap });
    const S = { total: 0 };
    this.later(W.snap, () => {
      const src = [];
      for (const t of this.enemiesIn(c.x, c.z, r)) { const n = this.take(t); if (n > 0) { S.total += n; src.push({ x: t.pos.x, y: t.pos.y || 0, z: t.pos.z, n, h: Math.min(1.6, 0.6 + (t.radius || 0.5)) }); } }
      S.used = Math.min(op.cap || 9, S.total); call(fx, 'charge', src, S.used, op.cap || 9);
      this.sfx('magic');
    }, ctx);
    this.later(W.burst, () => {
      const coef = (op.base || 1.4) + (op.per || 0.65) * (S.used || 0), hits = [];
      for (const t of this.enemiesIn(c.x, c.z, r)) { const res = this.hit(t, coef, ctx, { elem: 'light', consume: (S.used || 0) > 0 }); if (!res.missed) hits.push(t); if (t.body && t.body.punch) t.body.punch(t.pos.x - c.x || 0.01, t.pos.z - c.z, 0.2); }
      call(fx, 'burst', S.used || 0);
      if ((S.used || 0) > 0) this.residue(c, ctx);
      const G = this.G; if (G.render && G.render.kick && !G.reduceFlash) G.render.kick(pc.facing.x, pc.facing.z, W.kick[0], W.kick[1]);
      this.sfx('wp_collapse'); ctx.wpCritical = { used: S.used || 0, total: S.total, coef, hits: hits.length };
      try { if (S.used) G.ui.floatText(pc.pos, '임계 ' + S.used, '#9ad8ff', 1.0, 2.2); } catch (e) { }
    }, ctx);
  }

  // ================================================================== C. 첨단 조제와 생체 보호 (회복: 나 + 생명 소환물)
  ground(p) { const g = this.pc.zone.geo.ground(p.x, p.z); return { x: p.x, y: g.y || 0, z: p.z }; }
  living() { return this.eng.summons.filter(s => s && s.living && !s.machine && !s.dead); }
  ratio(u) { return u.hp / Math.max(1, u.maxHp); }
  healPow() { const f = this.pc.sheet && this.pc.sheet.final; return 1 + ((f && f.healPower) || 0); }
  healUnit(u, pct, why) {
    if (!u || u.dead) return 0; const b = u.hp, amt = u.maxHp * pct * this.healPow();
    if (u === this.pc) u.heal(amt); else { u.hp = Math.min(u.maxHp, u.hp + amt); try { if (u.hp - b >= 1) this.G.ui.damageText(u.pos, '+' + Math.round(u.hp - b), 'heal'); } catch (e) { } }
    const got = u.hp - b; this.log.heals.push({ why, who: u === this.pc ? 'pc' : 'summon', amt: Math.round(got), t: +this.clock.toFixed(2) }); if (this.log.heals.length > 40) this.log.heals.shift();
    return got;
  }
  /** PC 에서 고른 지원 대상(내 생명 소환물, 사거리 안) — 없으면 null */
  allyPick(range) { const a = this.pc.allyTarget; return a && !a.dead && a.living && !a.machine && this.eng.summons.includes(a) && dist(a.pos, this.pc.pos) <= range + (a.radius || 0.4) ? a : null; }
  /** 적의 바닥 공격(경고 표시·독 장판) 위에 서 있는지 */
  inDanger(u) {
    const z = this.pc.zone; if (!z || !z.things) return false;
    return z.things.some(th => th && !th.dead && th.shape && typeof th.shape.overlaps === 'function' && !(th.owner && th.owner.faction === 'player') && th.shape.overlaps(u.pos.x, u.pos.z, u.radius || 0.4));
  }

  /** C1 구급함 전개: 발치(앞 0.8 m)에 작은 왕진 가방 — 뚜껑이 열리면(open 초) 응급 패치 n 장이 보임. gap 초마다 범위 r 안에서 HP 비율이 가장 낮은
   *  나 / 생명 소환물(비율 < thresh 인 것만 — 모두 건강하면 아껴 둠)에게 패치 한 장이 날아가(WP.kit.fly) 닿는 순간 최대 체력 pct 회복.
   *  n 장을 다 쓰거나 dur 초가 지나면 가방이 닫힘. 하나만(다시 쓰면 예전 가방은 닫힘). */
  wp_kit(op, ctx) {
    const pc = this.pc, f = ctx.facing, L = ctx.L; let p = { x: pc.pos.x + f.x * 0.8, z: pc.pos.z + f.z * 0.8 };
    if (pc.zone.geo.blocked(p.x, p.z, 0.3)) p = { x: pc.pos.x, z: pc.pos.z }; p = this.ground(p);
    if (this.kitS) this.closeKit('replace');
    const dur = (op.dur || 10) + (op.durLv || 0) * (L - 1);
    const K = this.kitS = { p, r: op.r || 6, n: op.n || 3, left: op.n || 3, until: this.clock + dur, next: this.clock + (op.open || 0.4), gap: op.gap || 1.0, thresh: op.thresh || 0.85,
      pct: (op.pct || 0.12) + (op.pctLv || 0) * (L - 1), fly: [], sent: 0, born: this.clock };
    K.fx = this.fx('kit', pc, { at: p, r: K.r, n: K.n, dur, open: op.open || 0.4 });
    this.sfx('wp_kit');
  }
  tickKit() {
    const K = this.kitS; if (!K) return;
    for (const q of K.fly) if (!q.done && this.clock >= q.at) { q.done = true; if (q.u && !q.u.dead) { this.healUnit(q.u, K.pct, 'kit'); call(K.fx, 'heal', q.i, q.u); this.sfx('wp_patch'); } }
    K.fly = K.fly.filter(q => !q.done);
    if (K.left > 0 && this.clock < K.until && this.clock >= K.next) {
      const cand = [this.pc, ...this.living()].filter(u => !u.dead && dist(u.pos, K.p) <= K.r + (u.radius || 0.4) && this.ratio(u) < K.thresh).sort((a, b) => this.ratio(a) - this.ratio(b));
      if (cand.length) { const u = cand[0], i = K.n - K.left; K.left--; K.sent++; K.next = this.clock + K.gap; K.fly.push({ u, i, at: this.clock + WP.kit.fly }); call(K.fx, 'send', i, u, WP.kit.fly); this.sfx('wp_flick'); }
    }
    if (!K.fly.length && (K.left <= 0 || this.clock >= K.until)) this.closeKit(K.left <= 0 ? 'used' : 'time');
  }
  closeKit(why) { const K = this.kitS; if (!K) return; this.kitS = null; K.closed = why; call(K.fx, why === 'replace' || why === 'clear' ? 'dispose' : 'close'); this.log.kitClosed = why; }

  /** C2 서방 패치: 지원 대상(고른 생명 소환물, 없으면 나)에게 세 칸 패치를 붙임 — 대상이 움직여도 따라가며 gap 초마다 최대 체력 pct, n 번 회복
   *  (한 번마다 칸 하나가 꺼짐). 같은 대상에 다시 쓰면 새 패치로 바뀜, 동시에 3장. */
  wp_patch(op, ctx) {
    const pc = this.pc, L = ctx.L, u = this.allyPick(op.range || 9) || pc;
    for (const P of this.patches.filter(P => P.u === u)) this.endPatch(P, 'replace');
    while (this.patches.length >= 3) this.endPatch(this.patches[0], 'replace');
    const P = { u, n: op.n || 3, left: op.n || 3, gap: op.gap || 1.5, next: this.clock + (op.gap || 1.5), pct: (op.pct || 0.07) + (op.pctLv || 0) * (L - 1), born: this.clock };
    P.fx = this.fx('patch', pc, { tgt: u, n: P.n, from: this.handPoint(), self: u === pc });
    this.patches.push(P); this.sfx('wp_patch');
  }
  tickPatches() {
    for (const P of this.patches.slice()) {
      if (!P.u || P.u.dead || (P.u !== this.pc && !this.eng.summons.includes(P.u))) { this.endPatch(P, 'lost'); continue; }
      if (this.clock >= P.next && P.left > 0) { P.left--; P.next += P.gap; this.healUnit(P.u, P.pct, 'patch'); call(P.fx, 'tick', P.left); this.sfx('wp_tick'); if (P.left <= 0) this.endPatch(P, 'done'); }
    }
  }
  endPatch(P, why) { const i = this.patches.indexOf(P); if (i >= 0) this.patches.splice(i, 1); call(P.fx, why === 'done' ? 'end' : 'dispose'); }

  /** C3 구조용 붕대 릴: 손목 릴에서 넓은 붕대를 쏴 생명 소환물을 내 쪽 안전한 자리로 당기고, 도착 순간 최대 체력 pct 회복.
   *  고르기(rescuePick): 1) PC 에서 고른 소환물 2) 적의 바닥 공격 위에 선 소환물(HP 비율 낮은 순) 3) HP 50% 미만 중 가장 낮은 것 — 모두 사거리 안 +
   *  붕대가 벽에 막히지 않는 것만. 없으면 나를 붕대로 감아 즉시 self 회복. 도착 자리(pullPath): 소환물 -> 내 앞(반지름 + gap) 직선을 0.2 m씩 걸으며
   *  처음 막히는 곳 앞에서 멈춤 — 벽을 지나거나 벽 속에 놓이지 않음. 당기는 동안 매 프레임 자리를 정함. */
  rescuePick(range) {
    const pc = this.pc, geo = pc.zone.geo, ok = s => dist(s.pos, pc.pos) <= range + (s.radius || 0.4) && clearLine(geo, pc.pos, s.pos, 0.12);
    const sel = this.allyPick(range); if (sel && ok(sel)) return sel;
    const L = this.living().filter(ok).sort((a, b) => this.ratio(a) - this.ratio(b));
    return L.find(s => this.inDanger(s)) || L.find(s => this.ratio(s) < 0.5) || null;
  }
  pullPath(s) {
    const pc = this.pc, geo = pc.zone.geo, R = WP.reel, dx = s.pos.x - pc.pos.x, dz = s.pos.z - pc.pos.z, d = Math.hypot(dx, dz) || 1e-3, ux = dx / d, uz = dz / d;
    const stopAt = (pc.radius || 0.4) + (s.radius || 0.4) + R.gap, want = Math.max(0, d - stopAt), sr = Math.max(0.2, (s.radius || 0.4) * 0.8);
    let go = 0; while (go + R.step <= want + 1e-6) { const x = s.pos.x - ux * (go + R.step), z = s.pos.z - uz * (go + R.step); if (geo.blocked(x, z, sr)) break; go += R.step; }
    if (go < want && want - go < R.step && !geo.blocked(s.pos.x - ux * want, s.pos.z - uz * want, sr)) go = want;
    return { from: { x: s.pos.x, z: s.pos.z }, to: { x: s.pos.x - ux * go, z: s.pos.z - uz * go }, len: go, want };
  }
  wp_reel(op, ctx) {
    const pc = this.pc, L = ctx.L, s = this.rescuePick(op.range || 9);
    if (!s) {
      const got = this.healUnit(pc, (op.self || 0.06) + (op.selfLv || 0) * (L - 1), 'wrap');
      this.fx('wrap', pc, { from: this.handPoint() }); this.sfx('wp_wrap'); this.log.reels.push({ self: true, got: Math.round(got), t: +this.clock.toFixed(2) }); return;
    }
    const R = { s, hitAt: this.clock + WP.reel.shoot, endAt: this.clock + WP.reel.shoot + WP.reel.pull, phase: 'shoot', pct: (op.pct || 0.15) + (op.pctLv || 0) * (L - 1), path: null, danger: this.inDanger(s), born: this.clock };
    R.fx = this.fx('reel', pc, { tgt: s, shoot: WP.reel.shoot, pull: WP.reel.pull });
    s.wpPulled = true; this.reels.push(R); this.sfx('wp_reel');
  }
  tickReels() {
    for (const R of this.reels.slice()) {
      const s = R.s;
      if (!s || s.dead || !this.eng.summons.includes(s)) { this.endReel(R, 'lost'); continue; }
      if (R.phase === 'shoot' && this.clock >= R.hitAt) { R.phase = 'pull'; R.path = this.pullPath(s); call(R.fx, 'taut', R.path.to); this.sfx('wp_wind'); }
      if (R.phase === 'pull') {
        const k = Math.min(1, (this.clock - R.hitAt) / WP.reel.pull), e = 1 - Math.pow(1 - k, 2), P = R.path;
        const x = P.from.x + (P.to.x - P.from.x) * e, z = P.from.z + (P.to.z - P.from.z) * e; s.pos.x = x; s.pos.z = z; s.pos.y = this.pc.zone.geo.ground(x, z).y || 0;
        if (s.knock) { s.knock.x = 0; s.knock.z = 0; }
        if (k >= 1) { const got = this.healUnit(s, R.pct, 'reel'); call(R.fx, 'arrive'); this.sfx('wp_patch');
          this.log.reels.push({ self: false, moved: +P.len.toFixed(2), want: +P.want.toFixed(2), danger: R.danger, dangerAfter: this.inDanger(s), got: Math.round(got), t: +this.clock.toFixed(2) }); this.endReel(R, 'done'); }
      }
    }
  }
  endReel(R, why) { const i = this.reels.indexOf(R); if (i >= 0) this.reels.splice(i, 1); if (R.s) R.s.wpPulled = false; call(R.fx, why === 'done' ? 'end' : 'dispose'); }

  // ------------------------------------------------------------------ C5
  /** C5 최종 처방·생명 유지(패시브): actors.js takeDamage 가 치명상일 때 부름. true = 이 피해를 무시 */
  cheatDeath() {
    const v = this.eng.book.passive('cheatDeath'); if (!v) return false;
    const pc = this.pc, R = WP.lastRx;
    if (this.graceT > 0) { pc.hp = Math.max(pc.hp, 1); return true; }        // 같은 순간의 연속 타격: 다시 발동하지 않고 흡수
    if (this.eng.cdLeft('wp_c5') > 0) return false;
    this.eng.cd.wp_c5 = this.clock + R.icd; this.eng.cdLen.wp_c5 = R.icd; this.graceT = R.grace; this.log.lastRx++;
    pc.hp = Math.max(1, Math.round(pc.maxHp * v)); pc.addShield(Math.round(pc.maxHp * v), R.shield);
    this.h.applyStatus(pc, { id: 'regen', dur: R.regen, val: pc.maxHp * R.regenPct, ch: 1 }, pc);
    try { this.G.ui.floatText(pc.pos, '최종 처방!', '#ffe08a', 1.2, 2.2); } catch (e) { }
    this.fx('lastrx', pc, { dur: R.shield }); this.sfx('ph_shield');
    return true;
  }
  icdLeft() { return this.eng.cdLeft('wp_c5'); }
  /** 버프 줄(ui.js hStatus): 최종 처방 준비/재정비 */
  statusHtml() {
    const K = this.kitS, kit = K ? ` <span style="color:#9affd8">구급함 ${K.left}장</span>` : '';
    if (!this.eng.book.passive('cheatDeath')) return kit;
    const l = this.icdLeft();
    return kit + (l > 0 ? ` <span style="color:#9aa8b8">최종 처방 재정비 ${Math.ceil(l)}s</span>` : ' <span style="color:#ffd27a">최종 처방 준비</span>');
  }

  tickTablets() {
    const W = WP.tablet;
    for (const T of this.tablets) {
      if (T.done || T.state !== 'core') continue;
      if (!alive(T.t)) { this.endTablet(T, 'fizzle'); continue; }
      const el = this.clock - T.shellAt;
      while (T.blinks < W.blinks.length && el >= W.blinks[T.blinks] * T.delay / W.core) { call(T.fx, 'blink', T.blinks); this.sfx('wp_blink'); T.blinks++; }
      if (this.clock >= T.coreAt - 1e-9) this.coreBurst(T, false, 0);
    }
    this.tablets = this.tablets.filter(T => !T.done);
  }
  tickFoams() {
    for (const F of this.foams) {
      if (F.done) continue;
      if (!F.landed && this.clock >= F.landAt) { F.landed = true; call(F.fx, 'land'); this.sfx('wp_fizz'); }
      while (F.landed && F.left > 0 && this.clock >= F.next - 1e-9 && !F.done) { this.foamTick(F); F.next += WP.foam.gap; }
      if (this.clock >= F.finalAt - 1e-9) { this.foamFinal(F, false, 0); this.endFoam(F, 'final'); }
    }
    this.foams = this.foams.filter(F => !F.done);
  }
  tick(dt) {
    if (this.graceT > 0) this.graceT -= dt;
    if (this.tablets.length) this.tickTablets();
    if (this.foams.length) this.tickFoams();
    if (this.kitS) this.tickKit();
    if (this.patches.length) this.tickPatches();
    if (this.reels.length) this.tickReels();
    if (this.zones.length) this.tickZones(dt);
  }
  /** 사망·맵 이동·전직: 남은 것 모두 정리(예약된 내핵·기포·패치는 피해·회복 없이 취소, 끌려 오던 소환물은 그 자리) */
  clear() {
    for (const T of this.tablets) this.endTablet(T, 'clear');
    for (const F of this.foams) this.endFoam(F, 'clear');
    if (this.kitS) this.closeKit('clear');
    for (const P of this.patches.slice()) this.endPatch(P, 'clear');
    for (const R of this.reels.slice()) this.endReel(R, 'clear');
    for (const z of this.zones) call(z.fx, 'dispose');
    this.tablets = []; this.foams = []; this.patches = []; this.reels = []; this.zones = []; this.graceT = 0;
  }
}

// ------------------------------------------------------------------ 스킬창 설명(실제 계산과 같은 수치)
const pct = (x) => Math.round(x * 100) + '%';
const f1 = (x) => (Math.abs(x - Math.round(x)) < 1e-6 ? String(Math.round(x)) : x.toFixed(1));
/** 양약사 스킬의 레벨별 한 줄 수치(js/skillui.js levelText 가 부름). null = 일반 규칙 */
export function wpLevelText(d, L) {
  if (!d || d.job !== WP.job) return null;
  const m = 1 + (d.type === 'ultimate' ? 0.25 : 0.12) * (L - 1), op = d.ops.find(o => o.op === 'custom') || {}, cdt = d.cd ? ` · 쿨타임 ${f1(d.cd * (1 - 0.03 * (L - 1)))}초` : '';
  switch (op.fn) {
    case 'wp_capsule': return `과립 ${op.n || 5}개 총 ${pct(op.coef * m)}(마지막 과립이 가장 셈) + 반응 고리 ${pct(op.fin * m)}(반경 ${f1(op.finR)}m, 화상) · 표식 1${cdt}`;
    case 'wp_foam': return `작은 기포 ${pct(op.tick * m)} × ${op.ticks} + 마지막 큰 기포 ${pct(op.fin * m)}(반경 ${f1(op.r)}m, 표식 1) = 최대 ${pct((op.tick * op.ticks + op.fin) * m)} · 둔화된 적 +${pct(op.slowBonus)}${cdt}`;
    case 'wp_ion': return `관통 번개 ${pct(op.coef * m)}(길이 ${f1(op.len)}m, 폭 ${f1(op.w)}m, 한 번) · 표식 1${cdt}`;
    case 'wp_tri': return `화염·냉기·전격 ${pct(op.coef * m)} × 3 + 셋 모두 맞으면 복합 반응 ${pct(op.combo * m)}(반경 ${f1(op.r)}m) · 대상 표식 1개당 +${pct(WP.tri.perMark)} · 표식 1${cdt}`;
    case 'wp_collapse': return `낙하 핵 ${pct(op.coef * m)}(반경 ${f1(op.r)}m, ${f1(WP.collapse.contact)}초 뒤 접촉) · 표식 1${cdt}`;
    case 'wp_tablet': return `외층 ${pct(op.coef * m)} + 표식 1 → ${f1(op.delay)}초 뒤 내핵 ${pct(op.core * m)} = ${pct((op.coef + op.core) * m)}(정확히 두 번) · 습득 효과: 약사 약병 공격도 던질 때마다 표식 1${cdt}`;
    case 'wp_release': return `내 이중정 내핵 또는 발포정 하나를 지금 작동 · 그 마지막 피해 +${pct(op.boost + op.boostLv * (L - 1))} · 고를 제제가 없으면 기력·쿨타임을 쓰지 않음${cdt}`;
    case 'wp_kit': return `${f1(op.dur + op.durLv * (L - 1))}초 · 패치 ${op.n}장 · ${f1(op.gap)}초마다 반경 ${f1(op.r)}m 안 HP 비율이 가장 낮은 나/생명 소환물(HP ${pct(op.thresh)} 미만)에게 최대 HP ${pct(op.pct + op.pctLv * (L - 1))}${cdt}`;
    case 'wp_patch': return `${f1(op.gap)}초마다 최대 HP ${pct(op.pct + op.pctLv * (L - 1))} × ${op.n}번 = ${pct((op.pct + op.pctLv * (L - 1)) * op.n)} · 움직여도 따라감 · 고른 생명 소환물이 없으면 나${cdt}`;
    case 'wp_reel': return `생명 소환물을 내 쪽으로 당기고(벽은 통과하지 않음) 도착 때 최대 HP ${pct(op.pct + op.pctLv * (L - 1))} · 소환물이 없으면 나를 감아 ${pct(op.self + op.selfLv * (L - 1))} · 사거리 ${f1(op.range)}m${cdt}`;
    case 'wp_chain': return `용출 ${pct(op.coef * m)} (+표식 1개당 ${pct(op.perStack)}) · 이어진 적 ${pct(op.sub * m)} (+표식당) · 최대 ${(op.max || 5) + Math.floor((L - 1) / 2)}명 · ${f1(op.range)}m 안 표식 있는 적만${cdt}`;
    case 'wp_critical': return `기본 ${pct(op.base * m)} + 소비한 표식 1개당 ${pct(op.per * m)} (최대 ${op.cap}개 = ${pct((op.base + op.per * op.cap) * m)}) · 반경 ${f1(op.r)}m${cdt}`;
  }
  if (d.id === 'wp_b4') { const v = d.flags.residue; return `표식 폭발 자리 과립 지대 ${f1(WP.zone.life)}초 · ${pct(v[0] + v[1] * (L - 1))}/초 (반경 ${f1(WP.zone.r)}m, 최대 ${WP.zone.max}개) · 표식을 만들지 않음`; }
  if (d.id === 'wp_c5') { const v = d.flags.cheatDeath; return `치명상 때 체력 ${pct(v[0] + v[1] * (L - 1))} 남김 + 같은 양 보호막 ${WP.lastRx.shield}초 + 재생 ${pct(WP.lastRx.regenPct)}/초 ${WP.lastRx.regen}초 · 내부 쿨타임 ${WP.lastRx.icd}초`; }
  return null;
}
