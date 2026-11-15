// 양약사(western_pharmacist) 2차 스킬 규칙 (2026-11-16 개편): 정밀 제약술 · 표적 전달과 약물 반응 · 첨단 조제와 생체 보호.
// 스킬 데이터는 tools/skills2/gen.py (wp_*, 수치는 op 필드), 실행은 js/skillrt.js 가 이 파일의 WpKit 을 부름(eng.wp, CUSTOM wp_*).
// 화면은 js/wpharmfx.js (FX.wp(kind, a, o)). 이 파일은 렌더링을 직접 하지 않음 — fx 가 null 이어도(메시 로딩 전·테스트) 규칙은 그대로.
//
// 반응 표식(공용, 'reaction'): 대상마다 최대 3개, 8초(더할 때마다 다시 8초), 소비하면 0. 한 번 시전으로 한 대상에 쌓이는 수 =
//   1 (+ 촉매 활성화 충전으로 강화된 시전 1) (+ 그 대상에 정밀 표적 전달 1) — 같은 시전의 여러 타격·폭발은 더 쌓지 않음.
// 파생 피해(서방형 미립자 지대·연쇄 용출의 둘레 폭발 피해)는 표식을 만들지 않고, 지대·연쇄를 새로 만들지 않음.
// 연쇄 용출: 시전마다 방문 집합 — 같은 적 두 번 없음, 표식 없는 적으로는 이어지지 않음, 최대 수·거리 상한.
// 최종 처방: 치명상 -> 최소 체력 + 보호막 + 짧은 재생, 내부 쿨타임 120초(eng.cd.wp_c5 — 재접속에도 유지), 같은 순간의 연속 타격은 0.3초 유예로 한 번만.
import { HitShape } from './core.js';

export const WP = {
  job: 'western_pharmacist',
  mark: { max: 3, dur: 8 },
  capsule: { fly: 0.30, split: 0.12, launch: 0.03, first: 0.56, gap: 0.085, w: [0.16, 0.16, 0.16, 0.16, 0.36] },   // 과립 피해 몫(합 1)
  cryo: { fly: 0.40, film: 0.22, rise: 0.36, burst: 1.0 },
  ion: { align: 0.22, strike: 0.30 },
  tri: { at: [0.45, 0.62, 0.79], combo: 0.12, perMark: 0.10 },
  collapse: { contact: 1.05, lock: 1.25, kick: [0.14, 0.12] },
  carrier: { fly: 0.32 },
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
  reset() { this.cat = null; this.carrier = null; this.zones = []; this.graceT = 0; this.log = { chains: [], zones: 0, lastRx: 0 }; }
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
  carried(t) { const c = this.carrier; return !!(c && c.t === t && this.clock < c.until && alive(t)); }
  /** 시전 한 번에 대상마다 한 번만: 1 + 강화 시전 1 + 표적 전달 1 (최대 3은 addMark 가 지킴) */
  mark(t, ctx) {
    if (!alive(t) || !ctx) return 0;
    const seen = ctx.wpMarks || (ctx.wpMarks = new Map()); if (seen.has(t)) return 0;
    const n = 1 + (ctx.wpCat ? 1 : 0) + (this.carried(t) ? 1 : 0);
    seen.set(t, n); this.h.addMark(t, 'reaction', n); return n;
  }
  take(t) { return this.h.takeMarks(t, 'reaction'); }

  // ------------------------------------------------------------------ 피해(양약사 공통: 전역 정지·흔들림 없음)
  hit(t, coef, ctx, o = {}) {
    if (!alive(t)) return { amount: 0, missed: true };
    let c = coef;
    if (ctx.wpCat && this.cat) c *= 1 + this.cat.bonus;                      // 촉매 충전 시전
    if (o.consume && this.carried(t)) c *= 1 + this.carrier.bonus;          // 표식을 소비하는 공격 + 표적 전달 대상
    const amount = this.eng.dmg(t, c, ctx, { elem: o.elem, quiet: true, derived: !!o.derived });
    const missed = !!ctx.missed;
    if (!missed && !o.derived) for (const s of o.st || []) this.h.applyStatus(t, s, this.pc, ctx.mult);
    return { amount, missed };
  }
  statusAfter(t, list, ctx) { for (const s of list || []) this.h.applyStatus(t, s, this.pc, ctx.mult); }

  // ------------------------------------------------------------------ 시전 훅 (skillrt cast): 촉매 충전 사용
  onCast(d, ctx) {
    if (!d || d.job !== WP.job || !(d.type === 'attack' || d.type === 'ultimate')) return;
    const c = this.cat; if (!c || this.clock >= c.until || c.charges <= 0) return;
    c.charges--; ctx.wpCat = true; call(c.fx, 'fire', c.charges);
    const s = this.pc.status.get && this.pc.status.get('catalyst'); if (s) s.value = c.charges;
    if (c.charges <= 0) this.endCatalyst(true);
  }
  endCatalyst(spent) { const c = this.cat; if (!c) return; this.cat = null; call(c.fx, spent ? 'spent' : 'dispose'); if (this.pc.status.remove) this.pc.status.remove('catalyst'); }

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
  /** A2 극저온 결정화: 앰플이 조준점에 꽂힘 -> 푸른 막이 실제 반경까지 퍼짐 -> 가장자리에서 가운데로 결정이 솟음 -> 가운데 결정이 터짐(피해·둔화,
   *  이미 둔화된 일반 적은 잠깐 빙결 — 보스는 빙결 대신 상태 규칙대로) */
  wp_cryo(op, ctx) {
    const pc = this.pc, W = WP.cryo, c = { ...ctx.aim }, r = op.r || 2.4; c.y = pc.zone.geo.ground(c.x, c.z).y;
    const fx = this.fx('cryo', pc, { from: this.handPoint(), at: c, r, fly: W.fly, film: W.film, rise: W.rise, burst: W.burst });
    this.later(W.fly, () => this.sfx('ph_glass_ice'), ctx);
    this.later(W.burst, () => {
      const ts = this.enemiesIn(c.x, c.z, r), hits = [];
      for (const t of ts) {
        const slowed = t.status && t.status.has && t.status.has('slow');
        const res = this.hit(t, op.coef, ctx, { elem: 'ice', st: op.st });
        if (res.missed) continue;
        this.mark(t, ctx); hits.push(t);
        if (slowed && !t.isBoss && op.freeze) this.h.applyStatus(t, { id: 'freeze', dur: op.freeze, val: 1, ch: 1 }, pc);
      }
      call(fx, 'burst', hits.map(t => ({ x: t.pos.x, y: t.pos.y || 0, z: t.pos.z, r: t.radius || 0.5, frozen: !!(t.status && t.status.has && t.status.has('freeze')) })));
      this.sfx('wp_crystal');
    }, ctx);
  }
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
    const fx = this.fx('tri', pc, { from: this.handPoint(), tgt: () => (alive(t0) ? t0 : null), at: () => (alive(t0) ? t0.pos : st.last), times: W.at });
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
  /** B1 촉매 활성화: dur 초 동안 충전 charges 개 — 양약사 공격 스킬을 쓸 때마다 하나를 써서(어깨 뒤 작은 앰플 하나가 빛나며 금빛 입자를 보냄)
   *  그 시전의 표식 +1·피해 +bonus. 약사 1차 약병 공격도 이 동안 표식을 남김(skillrt onHit, 충전은 쓰지 않음). 다시 쓰면 충전·시간을 새로 채움(겹치지 않음). */
  wp_catalyst(op, ctx) {
    const pc = this.pc, L = ctx.L, dur = op.dur || 12, charges = op.charges || 3, bonus = (op.dmg || 0.15) + (op.dmgLv || 0.03) * (L - 1);
    if (this.cat) call(this.cat.fx, 'dispose');
    this.cat = { until: this.clock + dur, charges, bonus, fx: this.fx('catalyst', pc, { dur, n: charges }) };
    this.h.applyStatus(pc, { id: 'catalyst', dur, val: charges, ch: 1 }, pc);
    try { this.G.ui.floatText(pc.pos, '촉매 활성화', '#9ae6ff', 0.85, 1.8); } catch (e) { }
    this.sfx('ph_adrenaline');
  }
  /** B2 정밀 표적 전달: 반투명 운반체가 날아가 대상에 붙음 — 그 대상의 표식 +1, 표식을 소비하는 공격 피해 +bonus. 한 번에 한 대상(다시 쓰면 옮겨 감·시간만 새로). */
  wp_carrier(op, ctx) {
    const pc = this.pc, t = alive(ctx.tgt) ? ctx.tgt : this.eng.targetFor(ctx.d); if (!t) return;
    const L = ctx.L, dur = (op.dur || 10) + (op.durLv || 1) * (L - 1), bonus = (op.bonus || 0.3) + (op.bonusLv || 0.05) * (L - 1);
    const old = this.carrier;
    if (old && old.t !== t) { call(old.fx, 'dispose'); if (old.t.status && old.t.status.remove) old.t.status.remove('prescribed'); }
    const fx = old && old.t === t && old.fx && !old.fx.dead ? old.fx : this.fx('carrier', pc, { from: this.handPoint(), tgt: t, fly: WP.carrier.fly });
    if (old && old.t === t) call(fx, 'refresh');
    this.carrier = { t, until: this.clock + dur, bonus, fx };
    this.h.applyStatus(t, { id: 'prescribed', dur, val: bonus, ch: 1 }, pc);
    this.sfx('ph_flask');
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

  // ================================================================== C. 첨단 조제와 생체 보호
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
    if (!this.eng.book.passive('cheatDeath')) return '';
    const l = this.icdLeft();
    return l > 0 ? ` <span style="color:#9aa8b8">최종 처방 재정비 ${Math.ceil(l)}s</span>` : ' <span style="color:#ffd27a">최종 처방 준비</span>';
  }

  tick(dt) {
    if (this.graceT > 0) this.graceT -= dt;
    if (this.cat && this.clock >= this.cat.until) this.endCatalyst(false);
    if (this.carrier && (this.clock >= this.carrier.until || !alive(this.carrier.t))) { call(this.carrier.fx, 'dispose'); this.carrier = null; }
    if (this.zones.length) this.tickZones(dt);
  }
  /** 사망·맵 이동·전직: 남은 것 모두 정리 */
  clear() {
    if (this.cat) call(this.cat.fx, 'dispose'); if (this.carrier) call(this.carrier.fx, 'dispose');
    for (const z of this.zones) call(z.fx, 'dispose');
    this.cat = null; this.carrier = null; this.zones = []; this.graceT = 0;
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
    case 'wp_cryo': return `결정 폭발 ${pct(op.coef * m)}(반경 ${f1(op.r)}m) · 둔화 40% 3초 · 이미 둔화된 일반 적 빙결 ${f1(op.freeze)}초 · 표식 1${cdt}`;
    case 'wp_ion': return `관통 번개 ${pct(op.coef * m)}(길이 ${f1(op.len)}m, 폭 ${f1(op.w)}m, 한 번) · 표식 1${cdt}`;
    case 'wp_tri': return `화염·냉기·전격 ${pct(op.coef * m)} × 3 + 셋 모두 맞으면 복합 반응 ${pct(op.combo * m)}(반경 ${f1(op.r)}m) · 대상 표식 1개당 +${pct(WP.tri.perMark)} · 표식 1${cdt}`;
    case 'wp_collapse': return `낙하 핵 ${pct(op.coef * m)}(반경 ${f1(op.r)}m, ${f1(WP.collapse.contact)}초 뒤 접촉) · 표식 1${cdt}`;
    case 'wp_catalyst': return `${f1(op.dur)}초 · 충전 ${op.charges}회: 공격 스킬마다 표식 +1, 피해 +${pct(op.dmg + op.dmgLv * (L - 1))} · 약사 약병도 표식${cdt}`;
    case 'wp_carrier': return `${f1(op.dur + op.durLv * (L - 1))}초 · 그 적의 표식 +1 · 표식을 소비하는 공격 피해 +${pct(op.bonus + op.bonusLv * (L - 1))} · 한 번에 한 적${cdt}`;
    case 'wp_chain': return `용출 ${pct(op.coef * m)} (+표식 1개당 ${pct(op.perStack)}) · 이어진 적 ${pct(op.sub * m)} (+표식당) · 최대 ${(op.max || 5) + Math.floor((L - 1) / 2)}명 · ${f1(op.range)}m 안 표식 있는 적만${cdt}`;
    case 'wp_critical': return `기본 ${pct(op.base * m)} + 소비한 표식 1개당 ${pct(op.per * m)} (최대 ${op.cap}개 = ${pct((op.base + op.per * op.cap) * m)}) · 반경 ${f1(op.r)}m${cdt}`;
  }
  if (d.id === 'wp_b4') { const v = d.flags.residue; return `표식 폭발 자리 과립 지대 ${f1(WP.zone.life)}초 · ${pct(v[0] + v[1] * (L - 1))}/초 (반경 ${f1(WP.zone.r)}m, 최대 ${WP.zone.max}개) · 표식을 만들지 않음`; }
  if (d.id === 'wp_c5') { const v = d.flags.cheatDeath; return `치명상 때 체력 ${pct(v[0] + v[1] * (L - 1))} 남김 + 같은 양 보호막 ${WP.lastRx.shield}초 + 재생 ${pct(WP.lastRx.regenPct)}/초 ${WP.lastRx.regen}초 · 내부 쿨타임 ${WP.lastRx.icd}초`; }
  return null;
}
