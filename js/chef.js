// 쉐프 2차 전투 규칙 (2026-11-16 개편): 인페르노 웍 · 그랑 플람베 · 시그니처 압력솥 · 브로셰트 러시 · 마스터 셰프 쇼타임 /
// 소르베 퀸텟 · 프로즌 플레이팅 · 밀푀유 블레이드 · 슈가 아라베스크 · 크로캉부슈 피날레 / 황금 부용 · 봉 아페티! · 셰프의 한 끗 · 로열 그랑 디너.
// 스킬 데이터는 tools/skills2/gen.py (cf_*), 실행은 js/skillrt.js 가 이 파일의 ChefKit 을 부름(eng.chef, CUSTOM chef_*). 화면은 js/cheffx.js.
// 이 파일은 렌더링을 직접 하지 않음 — fx(kind, a, o) 가 null 을 돌려줘도(메시 로딩 전·테스트) 규칙은 그대로 동작.
//
// 반응 규칙(시너지): 그랑 플람베의 증기 폭발(맞기 직전 둔화된 적) · 프로즌 플레이팅의 열충격(맞기 직전 화상인 적, 화상을 없앰)과 빙결(맞기 직전
// 둔화된 일반 적). 조건은 그 시전이 무엇을 걸기 전의 상태로 본다(이번 시전의 둔화가 같은 시전의 빙결을 열지 않음). 반응은 대상마다 시전 한 번에 한 번,
// 반응 피해(derived)는 상태를 걸지 않고 다른 반응을 일으키지 않는다. 순서: 상태 기록 → 기본 피해 → 반응(소비) → 새 상태.
import { HitShape } from './core.js';

export const CHEF = {
  stop: 0.05, kick: [0.08, 0.1],          // 접촉 순간: 시전자·맞은 대상만 잠깐 멈춤(초) / 카메라 밀림 — 궁극기 마지막 타격에만 [m, s]
  showKick: [0.12, 0.12], showStop: 0.07,
  sfxGap: 0.07,                            // 같은 소리는 이 간격 안에 다시 내지 않음(겹침 제한)
  maxLive: 24,                             // 동시에 살아 있는 쉐프 투사체·설치 효과 수 상한(넘으면 가장 오래된 것부터 정리)
  sugarProbe: 0.4, sugarPortal: 2.5,
};
export const fold = L => 1 + 0.06 * Math.floor((Math.max(1, L) - 1) / 2);   // 일반 규칙의 레벨 추가타 몫(총합에 곱함)
const call = (h, m, ...a) => { try { return h && h[m] ? h[m](...a) : null; } catch (e) { console.warn('cheffx', m, e); return null; } };
const fmt = v => (Math.round(v * 10) / 10).toString();
const pct = v => Math.round(v * 100) + '%';

/** 소르베 둔화 한 번 더하기(순수): 지금 값 cur(없으면 null) -> 새 값. 첫 타 first, 이후 step씩, 상한 cap(보스는 절반) */
export function sorbetSlow(cur, o, boss = false) {
  const cap = o.cap * (boss ? 0.5 : 1);
  return Math.min(cap, cur == null ? o.first * (boss ? 0.5 : 1) : cur + o.step);
}
/** 봉 아페티! 강화 값(순수): 원래 음식 값 base 에서 계산 — 이미 강화돼 있어도 같은 값(겹쳐 커지지 않음) */
export const boostValue = (base, boost) => base * (1 + boost);
/** 브로셰트 러시: 레벨 -> 꼬치 수와 꼬치 하나의 계수(총합 = total × fold, 개수와 무관) */
export function skewerPlan(op, L) { const n = (op.n || 4) + Math.floor((Math.max(1, L) - 1) / 2), tot = op.total * fold(L); return { n, per: tot / n, total: tot }; }
/** 점 p 에서 선분 a-b 까지 거리 */
export function segDist(p, a, b) {
  const vx = b.x - a.x, vz = b.z - a.z, L2 = vx * vx + vz * vz, k = L2 > 1e-9 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / L2)) : 0;
  return Math.hypot(p.x - a.x - vx * k, p.z - a.z - vz * k);
}
/** 슈가 아라베스크 자리 검사(순수, geo = {blocked}, portals = [{pos, radius}]). 문제가 있으면 한국어 이유, 없으면 null */
export function sugarSpotError(geo, c, f, w, o = {}) {
  const px = -f.z, pz = f.x, n = Math.max(2, Math.ceil(w / CHEF.sugarProbe));
  const pts = []; for (let i = 0; i <= n; i++) { const s = -w / 2 + w * i / n; pts.push({ x: c.x + px * s, z: c.z + pz * s }); }
  if (pts.some(p => geo.blocked(p.x, p.z, 0.2))) return '지형과 겹쳐 세울 수 없습니다';
  if ((o.portals || []).some(pt => pts.some(p => Math.hypot(pt.pos[0] - p.x, pt.pos[1] - p.z) < pt.radius + CHEF.sugarPortal))) return '출입구 근처에는 세울 수 없습니다';
  const a = pts[0], b = pts[pts.length - 1];
  for (const u of o.allies || []) if (segDist(u.pos, a, b) < (u.radius || 0.4) + 0.4) return u.isSummon ? '소환수와 겹쳐 세울 수 없습니다' : '내 자리와 겹쳐 세울 수 없습니다';
  // 좁은 통로를 통째로 막지 않음: 두 끝 바로 바깥(0.9 m)이 모두 막혀 있으면 지나갈 틈이 없는 자리
  const e1 = { x: a.x - px * 0.9, z: a.z - pz * 0.9 }, e2 = { x: b.x + px * 0.9, z: b.z + pz * 0.9 };
  if (geo.blocked(e1.x, e1.z, 0.3) && geo.blocked(e2.x, e2.z, 0.3)) return '통로를 완전히 막는 곳에는 세울 수 없습니다';
  return null;
}

/** 스킬 창 수치 줄(실제 데이터에서): skillui.js levelText 가 쉐프 스킬에 씀. 모르는 스킬이면 null */
export function chefLevelText(d, L, data) {
  if (!d || d.job !== 'chef') return null;
  const m = 1 + (d.type === 'ultimate' ? 0.25 : 0.12) * (L - 1), op = d.ops && d.ops[0], out = [], P = c => pct(c * m);
  const stName = id => (data && data.status && data.status(id) && data.status(id).name) || id;
  const sts = list => (list || []).map(s => `${stName(s.id)} ${fmt(s.dur)}초`).join('·');
  if (!op && d.type !== 'passive' && d.type !== 'craft') return null;
  switch (op && (op.fn || op.ai || op.chef || op.op)) {
    case 'chef_wok': out.push(`1타 ${P(op.coef1)}(${op.r1} m·${op.ang1}°) + 2타 ${P(op.coef2)}(${op.r2} m·${op.ang2}°) = 총 ${P(op.coef1 + op.coef2)}`, `2타 ${sts(op.st)}`); break;
    case 'chef_flambe': out.push(`점화 ${P(op.coef)} (반경 ${op.r} m)`, sts(op.st), `둔화된 적 증기 폭발 +${P(op.steam.coef)} (대상마다 1번)`); break;
    case 'chef_cooker': out.push(`폭발 ${P(op.boom.coef)} (반경 ${op.boom.r} m, ${fmt(op.fuse)}초 뒤)`, `증기 둔화 ${pct(op.steam.slow)} (${op.steam.r} m)`, `최대 ${op.limit}개`); break;
    case 'chef_skewers': { const s = skewerPlan(op, L); out.push(`꼬치 ${s.n}개 × ${P(s.per)} (총 ${P(s.total)}, 관통 ${op.len} m)`); break; }
    case 'chef_show': out.push(`손질 ${P(op.prep.coef)} × ${op.prep.n} · 볶음 ${P(op.stir.coef)} × ${op.stir.n} · 클로슈 ${P(op.cloche.coef)} (총 ${P(op.prep.coef * op.prep.n + op.stir.coef * op.stir.n + op.cloche.coef)})`, `바깥 불꽃 충격파 ${P(op.wave.coef)} (${op.cloche.r}~${op.wave.r} m)`); break;
    case 'chef_sorbet': out.push(`소르베 ${op.n}개 × ${P(op.coef)} (총 ${P(op.coef * op.n)})`, `둔화 ${pct(op.slow.first)} → 최대 ${pct(op.slow.cap)} · ${fmt(op.slow.dur)}초`); break;
    case 'chef_plating': out.push(`냉기 ${P(op.coef)} (반경 ${op.r} m) · ${sts(op.st)}`, `화상 → 열충격 +${P(op.shock.coef)}`, `둔화된 일반 적 빙결 ${fmt(op.freeze)}초`); break;
    case 'chef_mille': out.push(`갈 때 ${P(op.coef)} · 올 때 ${P(op.back)} (적마다 한 번씩, ${op.len} m)`); break;
    case 'chef_sugar': out.push(`벽 ${fmt(op.width)} m · ${fmt((op.life || 8) * (1 + 0.05 * (L - 1)))}초`, `파편 ${P(op.shards.coef)} (반경 ${op.shards.r} m, 한 번)`); break;
    case 'chef_tower': out.push(`쌓이는 ${fmt(op.form)}초: 둔화 ${pct(op.aura.slow)} + ${P(op.aura.coef)} × 최대 ${op.aura.max}`, `층 ${op.layers.n} × ${P(op.layers.coef)} + 바닥 고리 ${P(op.base.coef)}`, `적마다 최대 총 ${P(op.aura.coef * op.aura.max + op.layers.coef * op.layers.n + op.base.coef)}`); break;
    case 'broth': out.push(`회복 ${fmt(op.heal * m * 100)}%/${op.tick}초 · ${fmt(op.dur * (1 + 0.05 * (L - 1)))}초 · 반경 ${op.r} m`); break;
    case 'bon': out.push(`즉시 회복 ${fmt(op.ops[0].pct * m * 100)}%`, `음식 효과 +${pct(op.boost)} · ${op.boostDur}초`); break;
    case 'chef_royal': out.push(`보호막 ${Math.round(op.shield.base * m)}+${fmt(op.shield.coef * m * 100)}% (${op.shield.dur}초)`, `공격력 +${fmt(op.atk.val * m * 100)}% (${fmt(op.atk.dur * (1 + 0.05 * (L - 1)))}초)`, `회복 ${fmt(op.heal * m * 100)}%`); break;
    default:
      if (d.type === 'passive' && d.flags && d.flags.chefTouch) { const v = d.flags.chefTouch; out.push(`직접 만든 음식 회복량·지속 시간 +${pct(v[0] + v[1] * (L - 1))}`); break; }
      if (d.type === 'craft') { out.push('고급 코스 요리 3종 제작'); break; }
      return null;
  }
  if (d.cd) out.push(`쿨타임 ${fmt(d.cd * (1 - 0.03 * (L - 1)))}초`);
  return out.filter(Boolean).join(' · ');
}

export class ChefKit {
  constructor(eng, h) { this.eng = eng; this.h = h; this.live = []; this.timers = []; this.sndT = {}; this.log = { steam: 0, shock: 0, freeze: 0, shards: 0, sorbetHits: 0 }; }
  get pc() { return this.eng.pc; }
  get G() { return this.h.G(); }
  get clock() { return this.eng.clock; }
  fx(kind, a, o) { try { return this.h.fx(kind, a, o); } catch (e) { return null; } }
  snd(n, gap = CHEF.sfxGap) { const t = this.clock; if (this.sndT[n] != null && t - this.sndT[n] < gap) return; this.sndT[n] = t; try { this.G.audio.sfx(n); } catch (e) { } }
  lvl(id) { return this.eng.book.level(id); }
  boss(t) { return !!(t && (t.isBoss || (t.def && t.def.ai === 'heavy'))); }
  /** 동작의 타격 시각(초, 누른 순간부터) — 시전 시간이 있는 스킬(궁극기)은 시전이 끝난 순간이 0 */
  hitT(ctx) {
    if (ctx.d.cast) return 0;
    let a = null; try { a = this.pc.body.sh.actions[ctx.act]; } catch (e) { a = null; }
    return Math.min(0.35, a && a.fps ? a.hitFrame / a.fps : 0.25) || 0.25;
  }
  after(t, fn) { this.timers.push({ at: this.clock + Math.max(0, t), fn }); }
  add(o) { this.live.push(o); while (this.live.length > CHEF.maxLive) { const x = this.live.shift(); call(x, 'dispose'); } return o; }
  tick(dt) {
    const pc = this.pc;
    if (this.timers.length) {
      const due = this.timers.filter(x => x.at <= this.clock); if (due.length) this.timers = this.timers.filter(x => x.at > this.clock);
      for (const x of due) { if (pc.dead) { this.timers = []; break; } try { x.fn(); } catch (e) { console.error('chef timer', e); } }
    }
    for (const o of this.live) if (!o.dead) { try { o.update(dt); } catch (e) { console.error('chef live', e); o.dead = true; } }
    if (this.live.some(o => o.dead)) this.live = this.live.filter(o => !o.dead);
    this.tickBoost(dt);
  }
  /** 사망·지역 이동·불러오기: 기다리는 효과·투사체·쟁반을 모두 취소(피해 없음) */
  clear() { this.timers = []; for (const o of this.live) call(o, 'dispose'); this.live = []; }
  targets(sh) { return this.eng.targets(sh); }
  circle(c, r) { return this.targets(HitShape.circle(c.x, c.z, r)); }
  /** 피해 한 번: 전역 히트스톱 없이(quiet), 반응 피해는 derived */
  hit(t, coef, ctx, o = {}) { if (!t || t.dead) return 0; const a = this.eng.dmg(t, coef, ctx, { quiet: true, elem: o.elem, derived: !!o.derived }); return ctx.missed ? 0 : a; }
  st(t, list, ctx) { for (const s of list || []) if (!t.dead) this.h.applyStatus(t, s, this.pc, ctx.mult); }
  touch(ts, f, stop = CHEF.stop, punch = 0.14) {
    const pc = this.pc; if (!ts.length) return; pc.freezeT = Math.max(pc.freezeT || 0, stop);
    for (const t of ts) if (!t.dead) { t.freezeT = Math.max(t.freezeT || 0, stop); if (t.body && t.body.punch) t.body.punch(t.pos.x - pc.pos.x || f.x, t.pos.z - pc.pos.z || f.z, punch); }
  }
  ground(p) { try { return this.pc.zone.geo.ground(p.x, p.z); } catch (e) { return { x: p.x, y: 0, z: p.z }; } }

  // ================================================================== A. 불꽃의 오픈 키친
  /** 인페르노 웍: 웍을 두 번 뒤집음 — 1타 짧은 불꽃 호, 2타 넓은 초승달 + 화상. 재료가 웍에 다시 떨어지는 순간이 타격 */
  chef_wok(op, ctx) {
    const pc = this.pc, f = ctx.facing, ht = this.hitT(ctx);
    const W = this.fx('wok', pc, { f, t1: ht, t2: ht + op.gap, r1: op.r1, ang1: op.ang1, r2: op.r2, ang2: op.ang2 });
    this.snd('cf_wok_toss');
    const strike = (k) => {
      if (pc.dead) return;
      const r = k ? op.r2 : op.r1, ang = k ? op.ang2 : op.ang1, ts = this.targets(HitShape.cone(pc.pos.x, pc.pos.z, f.x, f.z, r, ang)), hit = [];
      for (const t of ts) { this.hit(t, k ? op.coef2 : op.coef1, ctx, { elem: 'fire' }); if (!ctx.missed) { hit.push(t); if (k) this.st(t, op.st, ctx); } }
      call(W, 'flame', k, hit.map(t => ({ x: t.pos.x, y: t.pos.y || 0, z: t.pos.z, r: t.radius })));
      this.snd(k ? 'cf_flame' : 'cf_sizzle'); if (k === 0) this.after(op.gap - 0.12, () => this.snd('cf_wok_toss', 0.01));
      this.touch(hit, f, CHEF.stop, k ? 0.16 : 0.1);
      ctx.chefHits = (ctx.chefHits || 0) + hit.length;
    };
    this.after(ht, () => strike(0)); this.after(ht + op.gap, () => strike(1));
  }
  /** 그랑 플람베: 소스를 끼얹고(동작 타격) ignite 초 뒤 점화 = 본 피해. 맞기 직전 둔화된 적은 증기 폭발(대상마다 한 번, 반응 피해는 상태를 안 걸음) */
  chef_flambe(op, ctx) {
    const pc = this.pc, ht = this.hitT(ctx), c = this.ground(ctx.aim), from = { x: pc.pos.x, y: pc.pos.y || 0, z: pc.pos.z };
    const F = this.fx('flambe', c, { from, f: ctx.facing, r: op.r, splash: ht, ignite: ht + op.ignite });
    this.after(ht, () => this.snd('cf_splash'));
    this.after(ht + op.ignite - 0.12, () => this.snd('cf_ignite'));
    this.after(ht + op.ignite, () => {
      const ts = this.circle(c, op.r), slowed = new Set(ts.filter(t => t.status && t.status.has(op.steam.need))), done = new Set(), hit = [];   // 맞기 직전 상태 기록
      for (const t of ts) { this.hit(t, op.coef, ctx, { elem: 'fire' }); if (!ctx.missed) hit.push(t); }
      for (const t of ts) { if (!slowed.has(t) || done.has(t) || t.dead) continue; done.add(t); this.hit(t, op.steam.coef, ctx, { elem: 'fire', derived: true }); this.log.steam++; call(F, 'steam', { x: t.pos.x, y: t.pos.y || 0, z: t.pos.z, r: t.radius }); }
      for (const t of hit) this.st(t, op.st, ctx);
      call(F, 'burn', hit.map(t => ({ x: t.pos.x, y: t.pos.y || 0, z: t.pos.z }))); this.snd('cf_flame'); if (done.size) this.snd('cf_steam');
      this.touch(hit, ctx.facing, CHEF.stop, 0.12);
    });
  }
  /** 브로셰트 러시: 꼬치가 허공에서 꿰이고 구워진 뒤 차례로 날아감. 꼬치 하나 = 같은 적 한 번(맞힌 적 기록), 출발점은 조금씩 다르고 같은 앞 구역으로 모임 */
  chef_skewers(op, ctx) {
    const pc = this.pc, f = ctx.facing, ht = this.hitT(ctx), plan = skewerPlan(op, ctx.L), side = { x: -f.z, z: f.x };
    const S = this.fx('skewers', pc, { f, n: plan.n, launch: ht, gap: op.gap });
    for (let i = 0; i < plan.n; i++) this.after(ht + i * op.gap, () => {
      if (pc.dead) return;
      const off = ((i % 2 ? 1 : -1) * (0.25 + 0.18 * Math.floor(i / 2))) * Math.min(1, 4 / plan.n);
      const p0 = { x: pc.pos.x + side.x * off + f.x * 0.5, z: pc.pos.z + side.z * off + f.z * 0.5 }, end = { x: pc.pos.x + f.x * op.len, z: pc.pos.z + f.z * op.len };
      const dx = end.x - p0.x, dz = end.z - p0.z, m = Math.hypot(dx, dz) || 1, dir = { x: dx / m, z: dz / m };
      const sk = { dead: false, pos: { ...p0 }, trav: 0, max: m, hits: new Set(), h: call(S, 'fire', i, { x: p0.x, y: (pc.pos.y || 0) + 1.05, z: p0.z }, dir),
        update: (dt) => {
          if (sk.dead) return; const step = Math.min(op.speed * dt, sk.max - sk.trav), a = { ...sk.pos };
          sk.pos = { x: sk.pos.x + dir.x * step, z: sk.pos.z + dir.z * step }; sk.trav += step;
          call(sk.h, 'set', { x: sk.pos.x, y: (pc.pos.y || 0) + 1.05 - 0.25 * (sk.trav / sk.max), z: sk.pos.z });
          for (const t of this.targets(HitShape.circle((a.x + sk.pos.x) / 2, (a.z + sk.pos.z) / 2, step / 2 + op.w / 2 + 1.5))) {
            if (sk.hits.has(t) || segDist(t.pos, a, sk.pos) > op.w / 2 + (t.radius || 0.5)) continue;
            sk.hits.add(t); this.hit(t, plan.per, ctx, { elem: 'fire' });
            if (!ctx.missed) { call(sk.h, 'pierce', { x: t.pos.x, y: (t.pos.y || 0) + 0.9, z: t.pos.z }); this.snd('cf_skewer', 0.03); this.touch([t], f, 0.035, 0.08); }
          }
          if (pc.zone.geo.blocked(sk.pos.x, sk.pos.z, 0.05) || sk.trav >= sk.max - 1e-6) { call(sk.h, 'end', sk.pos); sk.dead = true; }
        },
        dispose: () => { sk.dead = true; call(sk.h, 'dispose'); } };
      this.add(sk); this.snd('cf_whoosh', 0.04);
    });
  }
  /** 마스터 셰프 쇼타임: 손질(식칼) → 볶음(웍) → 클로슈. 중심 = 시전 때 앞 fwd m. 단계마다 그 순간에 피해. 카메라는 마지막 클로슈에만 약하게 한 번 */
  chef_show(op, ctx) {
    const pc = this.pc, f = ctx.facing, c0 = { x: ctx.origin.x + f.x * op.fwd, z: ctx.origin.z + f.z * op.fwd }, c = this.ground(c0);
    const H = this.fx('show', c, { f, prep: op.prep, stir: op.stir, cloche: op.cloche, wave: op.wave });
    this.snd('cf_knife');
    const stage = (o, k, last) => {
      const ts = this.circle(c, o.r), hit = [];
      for (const t of ts) { this.hit(t, o.coef, ctx, { elem: o === op.stir ? 'fire' : undefined }); if (!ctx.missed) { hit.push(t); if (o.st) this.st(t, o.st, ctx); } }
      call(H, o === op.prep ? 'chop' : 'toss', k, hit.length); this.snd(o === op.prep ? 'cf_knife' : 'cf_flame', 0.05);
      if (last) this.touch(hit, f, 0.03, 0.08);
    };
    for (let k = 0; k < op.prep.n; k++) this.after(op.prep.t + k * op.prep.gap, () => stage(op.prep, k, true));
    for (let k = 0; k < op.stir.n; k++) this.after(op.stir.t + k * op.stir.gap, () => stage(op.stir, k, true));
    this.after(op.cloche.t - 0.35, () => this.snd('cf_cloche_fall'));
    this.after(op.cloche.t, () => {
      const inner = this.circle(c, op.cloche.r), outer = this.circle(c, op.wave.r).filter(t => !inner.includes(t)), hit = [];
      for (const t of inner) { this.hit(t, op.cloche.coef, ctx); if (!ctx.missed) hit.push(t); }
      for (const t of outer) this.hit(t, op.wave.coef, ctx, { elem: 'fire' });
      call(H, 'slam', hit.length); this.snd('cf_cloche_slam');
      this.touch(hit, f, CHEF.showStop, 0.24);
      const G = this.G; if (G.render && G.render.kick && !G.reduceFlash) G.render.kick(f.x, f.z, CHEF.showKick[0], CHEF.showKick[1]);
    });
  }

  // ================================================================== B. 환상의 파티스리
  /** 소르베 퀸텟: 소르베 5개가 부채꼴로 떠오른 뒤 서로 다른 곡선으로 한 적에게 차례로. 맞을 때마다 둔화가 깊어짐(상한). 대상이 죽으면 가까운 적, 없으면 사라짐 */
  chef_sorbet(op, ctx) {
    const pc = this.pc, f = ctx.facing, ht = this.hitT(ctx), side = { x: -f.z, z: f.x };
    let tgt = ctx.tgt && !ctx.tgt.dead ? ctx.tgt : null;
    const Sf = this.fx('sorbet', pc, { f, n: op.n, launch: ht, gap: op.gap });
    this.snd('cf_scoop');
    const pick = (from) => { if (tgt && !tgt.dead && tgt.zone === pc.zone) return tgt; tgt = null; let best = null, bd = op.retarget; for (const t of this.targets(HitShape.circle(from.x, from.z, op.retarget))) { const d = Math.hypot(t.pos.x - from.x, t.pos.z - from.z); if (d < bd) { bd = d; best = t; } } return (tgt = best); };
    for (let i = 0; i < op.n; i++) this.after(ht + i * op.gap, () => {
      if (pc.dead) return;
      const k = (i - (op.n - 1) / 2) / ((op.n - 1) / 2 || 1), y0 = (pc.pos.y || 0) + 1.7 + 0.25 * (1 - k * k);
      const p0 = { x: pc.pos.x + side.x * k * 0.9 - f.x * 0.2, y: y0, z: pc.pos.z + side.z * k * 0.9 - f.z * 0.2 };
      const s = { dead: false, i, from: p0, ctrl: null, t: 0, dur: 0.3, tg: null, h: call(Sf, 'fly', i),
        aim: (from) => { s.tg = pick(from); if (!s.tg) return false; const tp = s.tg.pos, d = Math.hypot(tp.x - from.x, tp.z - from.z);
          s.from = { ...from }; s.dur = Math.max(0.18, d / op.speed + 0.08); s.t = 0;
          const bend = (i % 2 ? 1 : -1) * (0.6 + 0.35 * Math.abs(k)) + k * 0.8; s.ctrl = { x: (from.x + tp.x) / 2 + side.x * bend, y: Math.max(from.y, (tp.y || 0) + 1) + 1.0 + 0.3 * (i % 3), z: (from.z + tp.z) / 2 + side.z * bend }; return true; },
        update: (dt) => {
          if (s.dead) return; if (!s.tg || s.tg.dead) { const p = s.cur || s.from; if (!s.aim(p)) { call(s.h, 'vanish'); s.dead = true; return; } }
          s.t += dt; const u = Math.min(1, s.t / s.dur), tp = s.tg.pos, e = { x: tp.x, y: (tp.y || 0) + 0.9, z: tp.z };
          const q = 1 - u; s.cur = { x: q * q * s.from.x + 2 * q * u * s.ctrl.x + u * u * e.x, y: q * q * s.from.y + 2 * q * u * s.ctrl.y + u * u * e.y, z: q * q * s.from.z + 2 * q * u * s.ctrl.z + u * u * e.z };
          call(s.h, 'set', s.cur);
          if (u >= 1) {
            const t = s.tg; this.hit(t, op.coef, ctx, { elem: 'ice' });
            if (!ctx.missed && !t.dead) { this.slowStack(t, op.slow, ctx); this.log.sorbetHits++; }
            call(s.h, 'hit', { x: e.x, y: e.y, z: e.z }, !ctx.missed); this.snd('cf_sorbet_hit', 0.04); if (!ctx.missed) this.touch([t], f, 0.03, 0.08);
            s.dead = true;
          }
        },
        dispose: () => { s.dead = true; call(s.h, 'dispose'); } };
      if (s.aim(p0)) { this.add(s); this.snd('cf_whoosh', 0.04); } else call(s.h, 'vanish');
    });
  }
  slowStack(t, o, ctx) {
    const s = t.status && t.status.get ? t.status.get('slow') : null, boss = !!t.isBoss;
    if (s) { s.value = sorbetSlow(s.value, o, boss); s.remaining = Math.max(s.remaining, o.dur); s.duration = Math.max(s.duration, o.dur); }
    else this.h.applyStatus(t, { id: 'slow', dur: o.dur, val: o.first, ch: 1 }, this.pc, 1);
  }
  /** 프로즌 플레이팅: 접시 무늬 → 서리 선 → 얼음꽃(bloom = 피해). 상태 기록 → 피해 → 열충격(화상 소비) → 빙결(맞기 전 둔화, 일반 적) → 새 둔화 */
  chef_plating(op, ctx) {
    const pc = this.pc, ht = this.hitT(ctx), c = this.ground(ctx.aim);
    const P = this.fx('plating', c, { r: op.r, bloom: ht + op.bloom, f: ctx.facing });
    this.after(ht, () => this.snd('cf_frost_draw'));
    this.after(ht + op.bloom, () => {
      const ts = this.circle(c, op.r), pre = new Map(ts.map(t => [t, { burn: !!(t.status && t.status.has(op.shock.need)), slow: !!(t.status && t.status.has('slow')) }])), hit = [];
      for (const t of ts) { this.hit(t, op.coef, ctx, { elem: 'ice' }); if (!ctx.missed) hit.push(t); }
      for (const t of ts) {
        const s = pre.get(t); if (t.dead) continue;
        if (s.burn) { t.status.remove(op.shock.need); this.hit(t, op.shock.coef, ctx, { elem: 'ice', derived: true }); this.log.shock++; call(P, 'shock', { x: t.pos.x, y: t.pos.y || 0, z: t.pos.z, r: t.radius }); }
        if (s.slow && !t.isBoss && !t.dead && hit.includes(t)) { if (this.h.applyStatus(t, { id: 'freeze', dur: op.freeze, val: 1, ch: 1 }, pc, 1)) { this.log.freeze++; call(P, 'freeze', t); } }
      }
      for (const t of hit) this.st(t, op.st, ctx);
      call(P, 'bloom', hit.length); this.snd('cf_frost'); if (this.log.shock) this.snd('cf_steam', 0.2);
      this.touch(hit, ctx.facing, CHEF.stop, 0.1);
    });
  }
  /** 밀푀유 블레이드: 원반이 len m 꿰뚫고 갔다가 나에게 돌아옴 — 갈 때·올 때 적마다 한 번씩. 돌아올 때 나를 따라오고, 내가 쓰러지면 흩어짐 */
  chef_mille(op, ctx) {
    const pc = this.pc, f = ctx.facing, ht = this.hitT(ctx);
    this.after(ht, () => {
      if (pc.dead) return;
      const y = (pc.pos.y || 0) + 1.0, d = { dead: false, pos: { x: pc.pos.x + f.x * 0.6, z: pc.pos.z + f.z * 0.6 }, dir: { ...f }, back: false, trav: 0, t: 0, out: new Set(), ret: new Set(), h: this.fx('mille', pc, { f }),
        update: (dt) => {
          if (d.dead) return; d.t += dt;
          if (pc.dead || pc.zone !== this.eng.pc.zone) { call(d.h, 'drop', d.pos); d.dead = true; return; }
          if (d.back) { const dx = pc.pos.x - d.pos.x, dz = pc.pos.z - d.pos.z, m = Math.hypot(dx, dz); if (m < 0.6 || d.t > op.life) { call(d.h, 'catch'); this.snd('cf_disc_catch'); d.dead = true; return; } d.dir = { x: dx / m, z: dz / m }; }
          const a = { ...d.pos }, st = op.speed * (d.back ? 1.15 : 1) * dt;
          d.pos = { x: d.pos.x + d.dir.x * st, z: d.pos.z + d.dir.z * st }; d.trav += st;
          call(d.h, 'set', { x: d.pos.x, y, z: d.pos.z }, d.back);
          const rec = d.back ? d.ret : d.out;
          for (const t of this.targets(HitShape.circle(d.pos.x, d.pos.z, op.w / 2 + 1.5))) {
            if (rec.has(t) || segDist(t.pos, a, d.pos) > op.w / 2 + (t.radius || 0.5)) continue;
            rec.add(t); this.hit(t, d.back ? op.back : op.coef, ctx, { elem: 'ice' });
            if (!ctx.missed) { call(d.h, 'cut', { x: t.pos.x, y: (t.pos.y || 0) + 0.9, z: t.pos.z }); this.snd('cf_disc_hit', 0.04); this.touch([t], d.dir, 0.03, 0.08); }
          }
          if (!d.back && (d.trav >= op.len || pc.zone.geo.blocked(d.pos.x, d.pos.z, 0.05))) { d.back = true; call(d.h, 'turn'); }
        },
        dispose: () => { d.dead = true; call(d.h, 'dispose'); } };
      this.add(d); this.snd('cf_disc');
    });
  }
  /** 크로캉부슈 피날레: 쌓이는 동안 둔화 + 약한 냉기(최대 횟수) → 위층부터 차례로 터짐(층마다 적 한 번) → 바닥층 넓은 냉기 고리 + 일반 적 빙결 */
  chef_tower(op, ctx) {
    const pc = this.pc, f = ctx.facing, c = this.ground({ x: ctx.origin.x + f.x * (op.fwd || 0), z: ctx.origin.z + f.z * (op.fwd || 0) });   // 탑은 앞 fwd m(캐릭터를 가리지 않게)
    const T = this.fx('tower', c, { form: op.form, layers: op.layers.n, gap: op.layers.gap, r: op.aura.r, rb: op.base.r });
    this.snd('cf_sugar');
    const count = new Map(), cap = op.aura.max + op.layers.n + 1;   // 적마다 최대 타수
    const ok = t => { const n = count.get(t) || 0; if (n >= cap) return false; count.set(t, n + 1); return true; };
    for (let k = 1; k <= op.aura.max; k++) this.after(op.form * k / op.aura.max, () => {
      for (const t of this.circle(c, op.aura.r)) { if (!ok(t)) continue; this.h.applyStatus(t, { id: 'slow', dur: op.aura.tick + 0.3, val: op.aura.slow, ch: 1 }, pc, 1); this.hit(t, op.aura.coef, ctx, { elem: 'ice' }); }
      call(T, 'frost', k);
    });
    for (let i = 0; i < op.layers.n; i++) this.after(op.form + i * op.layers.gap, () => {
      const hit = []; for (const t of this.circle(c, op.layers.r)) { if (!ok(t)) continue; this.hit(t, op.layers.coef, ctx, { elem: 'ice' }); if (!ctx.missed) hit.push(t); }
      call(T, 'burst', i, hit.length); this.snd('cf_choux_pop', 0.05); this.touch(hit, ctx.facing, 0.03, 0.08);
    });
    this.after(op.form + op.layers.n * op.layers.gap, () => {
      const hit = []; for (const t of this.circle(c, op.base.r)) { if (!ok(t)) continue; this.hit(t, op.base.coef, ctx, { elem: 'ice' }); if (!ctx.missed) { hit.push(t); if (!t.isBoss && !t.dead) this.h.applyStatus(t, { id: 'freeze', dur: op.base.freeze, val: 1, ch: 1 }, pc, 1); } }
      call(T, 'ring', hit.length); this.snd('cf_frost'); this.touch(hit, ctx.facing, CHEF.stop, 0.14);
    });
    this.tower = { count };
  }

  // ================================================================== 설치물 (압력솥 · 설탕 벽): skillrt Summon 에 붙는 규칙
  /** skillrt.validate 가 먼저 부름: 문제가 있으면 이유(자원·재사용 대기를 쓰지 않음) */
  validate(d, aim) {
    const op = d.ops && d.ops[0]; if (!op || op.ai !== 'chef_sugar') return null;
    const pc = this.pc, a = this.eng.groundAim(d, aim), dx = a.x - pc.pos.x, dz = a.z - pc.pos.z, m = Math.hypot(dx, dz);
    const f = m > 0.05 ? { x: dx / m, z: dz / m } : { ...pc.facing };
    return sugarSpotError(pc.zone.geo, a, f, op.width, { portals: pc.zone.def.portals || [], allies: [pc, ...this.eng.summons.filter(s => !s.dead)] });
  }
  summonInit(s) {
    const o = s.o, pc = this.pc;
    if (s.view) s.view.visible = false;   // 그림은 cheffx 가 그림(기본 소환 모형은 숨김)
    const vanish = s.vanish.bind(s);
    s.vanish = (silent) => { if (s.dead) return; call(s.chefFx, 'dispose', !!s._chefBoom || !!s._chefShards); s.chefFx = null; vanish(true); };
    if (o.ai === 'chef_cooker') {
      s.life = 99; s.fuse = o.fuse; s.steamT = 0;
      s.chefFx = this.fx('cooker', s.pos, { fuse: o.fuse, warn: o.warn, r: o.boom.r, sr: o.steam.r });
      s.destroy = () => s.vanish(true);                   // 수명·사망·지역 이동: 터지지 않고 조용히 치워짐(쓰러진 동안의 폭발 없음)
      this.snd('cf_place');
    } else if (o.ai === 'chef_sugar') {
      const f = s.ctx.facing, w = o.width, geo = s.zone.geo, ang = Math.atan2(f.x, f.z) * 180 / Math.PI;
      s.wallLife = (o.life || 8) * (1 + 0.05 * (s.ctx.L - 1)); s.life = 99;
      s.wallTag = 'swall:' + s.uid;
      geo.boxes.push({ x: s.pos.x, z: s.pos.z, hw: w / 2, hd: 0.3, yaw: ang, tag: s.wallTag }); geo._grid = null;
      // 벽 자리에 서 있던 적은 자기 쪽으로 밀려남(벽 속에 갇히지 않음)
      for (const t of this.targets(HitShape.circle(s.pos.x, s.pos.z, w / 2 + 1))) {
        const nx = f.x, nz = f.z, sd = (t.pos.x - s.pos.x) * nx + (t.pos.z - s.pos.z) * nz, lat = Math.abs((t.pos.x - s.pos.x) * -nz + (t.pos.z - s.pos.z) * nx);
        if (lat > w / 2 + (t.radius || 0.5) || Math.abs(sd) > 0.3 + (t.radius || 0.5)) continue;
        const k = (sd >= 0 ? 1 : -1) * (0.35 + (t.radius || 0.5)) - sd, np = { x: t.pos.x + nx * k, z: t.pos.z + nz * k };
        if (!geo.blocked(np.x, np.z, t.radius || 0.4)) { t.pos.x = np.x; t.pos.z = np.z; }
      }
      s.chefFx = this.fx('sugar', s.pos, { f, w, life: s.wallLife });
      s.destroy = (broken) => this.wallEnd(s, broken ? 'break' : 'end');
      this.snd('cf_sugar');
    }
  }
  /** 설탕 벽 끝: 부서짐·시간 만료는 파편 한 번, 사망·지역 이동·다시 쓰기(가장 오래된 것 치움)는 없음 */
  wallEnd(s, why) {
    if (s.dead) return; const pc = this.pc;
    if (!s._chefShards && !pc.dead && pc.zone === s.zone && (why === 'break' || why === 'expire')) {
      s._chefShards = true; this.log.shards++;
      const sh = s.o.shards; for (const t of this.circle(s.pos, sh.r)) this.hit(t, sh.coef, s.ctx, { elem: 'ice', derived: true });
      call(s.chefFx, 'shatter'); this.snd('cf_shatter');
    }
    s.vanish(true);
  }
  summonTick(s, dt) {
    const o = s.o, pc = this.pc; if (s.dead) return;
    if (o.ai === 'chef_cooker') {
      s.fuse -= dt; s.steamT -= dt;
      if (s.steamT <= 0) { s.steamT = o.steam.tick; for (const t of this.circle(s.pos, o.steam.r)) this.h.applyStatus(t, { id: 'slow', dur: o.steam.dur, val: o.steam.slow, ch: 1 }, pc, 1); call(s.chefFx, 'puff'); this.snd('cf_steam_hiss', 0.4); }
      call(s.chefFx, 'gauge', 1 - Math.max(0, s.fuse) / o.fuse);
      if (s.fuse <= 0 && !s._chefBoom) {
        s._chefBoom = true; const b = o.boom, ts = this.circle(s.pos, b.r), hit = [];
        for (const t of ts) { this.hit(t, b.coef, s.ctx, { elem: 'fire' }); if (!s.ctx.missed) { hit.push(t); this.st(t, b.st, s.ctx); } }
        for (const t of hit) if (!t.isBoss && !t.dead) { const dx = t.pos.x - s.pos.x, dz = t.pos.z - s.pos.z, m = Math.hypot(dx, dz) || 1; t.knock = { x: dx / m * b.knock * 3, z: dz / m * b.knock * 3 }; }
        call(s.chefFx, 'boom', hit.length); this.snd('cf_pop');
        for (const t of hit) { t.freezeT = Math.max(t.freezeT || 0, CHEF.stop); if (t.body && t.body.punch) t.body.punch(t.pos.x - s.pos.x, t.pos.z - s.pos.z, 0.2); }
        s.vanish(true);
      }
    } else if (o.ai === 'chef_sugar') {
      s.wallLife -= dt; call(s.chefFx, 'crack', 1 - s.hp / s.maxHp);
      if (s.wallLife <= 0) this.wallEnd(s, 'expire');
    }
  }

  // ================================================================== C. 왕실의 테이블
  /** 셰프의 한 끗: 먹은 음식이 직접 만든 것이면(가방의 그 음식 중 직접 만든 개수) 보너스 비율, 아니면 0. 만든 개수는 하나 줄어듦 */
  foodTouch(id) {
    const p = this.pc.sheet.p, key = 'food:' + id, cr = p.crafted || (p.crafted = {});
    let n = cr[key] | 0; if (n <= 0) return 0;
    const bag = this.pc.sheet.bag; n = Math.min(n, (bag && bag.count ? bag.count(id) : n - 1) + 1);   // 판 것·버린 것 만큼은 셈에서 뺌
    cr[key] = Math.max(0, n - 1);
    const v = this.eng.book.passive('chefTouch'); if (!(v > 0)) return 0;
    this.fx('touch', this.pc, {}); return v;
  }
  /** 음식 효과 적용(가방에서 이미 뺀 뒤): 즉시 회복·지속 회복·버프 — actors.js useItem 과 같은 규칙 + 셰프의 한 끗 */
  applyFood(it, touch) {
    const pc = this.pc, u = it.use || {}, fin = pc.sheet.final || {}, k = (1 + (fin.foodPower || 0)) * (1 + touch);
    let healed = 0;
    if (u.heal > 0 || u.healPercent > 0) { healed = ((u.heal || 0) + pc.maxHp * (u.healPercent || 0)) * (1 + (fin.healPower || 0)) * (1 + touch); pc.heal(healed); }
    if (u.status) this.h.applyStatus(pc, { id: u.status, dur: u.duration * k, val: u.value * (u.status === 'regen' ? pc.maxHp : 1) * (u.status === 'regen' ? 1 + touch : 1), ch: 1 }, pc);
    return healed;
  }
  /** 봉 아페티!: 음식 하나(기존 순서) — 그 음식 효과 + 즉시 회복 + 10초 동안 그 음식 효과 강화(원래 값에서 계산, 겹쳐 커지지 않음) */
  bon(op, ctx) {
    const eng = this.eng, pc = this.pc, it = eng.findConsumable('food'); if (!it) return false;
    if (!pc.sheet.bag.remove(it.id, 1)) return false;
    const touch = this.foodTouch(it.id), u = it.use || {};
    const healed = this.applyFood(it, touch);
    for (const o of op.ops || []) eng.exec(o, ctx);
    if (u.status) {
      const s = pc.status.get(u.status);
      if (s) { const base = u.value * (u.status === 'regen' ? pc.maxHp * (1 + touch) : 1); s._cfBase = base; s.value = boostValue(base, op.boost); s._cfBoostT = op.boostDur; this.boosted = s; }
    } else if (healed > 0) pc.heal(healed * op.boost);   // 즉시 회복 음식: 그 회복량의 50%를 한 번 더
    this.fx('bon', pc, { item: it.id, touch: touch > 0 }); this.snd('cf_cloche_open');
    return true;
  }
  tickBoost(dt) {
    const s = this.boosted; if (!s) return;
    s._cfBoostT -= dt;
    if (s._cfBoostT <= 0 || s.remaining <= 0) { if (s._cfBase != null && s.value > s._cfBase) s.value = s._cfBase; this.boosted = null; }
  }
  /** 로열 그랑 디너: 은쟁반 세 개 — 뚜껑이 열리는 순간 보호막 → 공격력 → 큰 회복. 쓰러지거나 지역을 옮기면 남은 쟁반 취소(타이머 전부 지움) */
  chef_royal(op, ctx) {
    const pc = this.pc, R = this.fx('royal', pc, { times: op.times });
    const live = { dead: false, update: () => { if (pc.dead) { call(R, 'cancel'); live.dead = true; } }, dispose: () => { live.dead = true; call(R, 'cancel'); } };
    this.add(live); this.snd('cf_serve');
    const fin = pc.sheet.final || {};
    const steps = [
      () => { const n = Math.round((op.shield.base + op.shield.coef * pc.stat('atk')) * ctx.mult * (1 + (fin.shieldPower || 0))); pc.addShield(n, op.shield.dur); try { this.G.ui.floatText(pc.pos, '보호막 ' + n, '#e8f0ff', 0.9, 1.6); } catch (e) { } },
      () => { this.h.applyStatus(pc, { id: 'atkup', dur: op.atk.dur * (1 + 0.05 * (ctx.L - 1)), val: op.atk.val * ctx.mult, ch: 1 }, pc); },
      () => { pc.heal(pc.maxHp * op.heal * ctx.mult * (1 + (fin.healPower || 0))); },
    ];
    op.times.forEach((t, i) => this.after(t, () => { if (pc.dead || live.dead) return; steps[i](); call(R, 'open', i); this.snd('cf_cloche_open'); if (i === 2) live.dead = true; }));
  }
}
