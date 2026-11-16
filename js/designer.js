// 디자이너 2차 전투 규칙 (2026-11-16 개편 — '전장을 재단하고 마법 의상을 완성하며 싸우는 오트쿠튀르 마도사').
// A 마법 입체재단: 실크 드레이핑 · 패턴 브레이크 · 오트쿠튀르 스티치 · 크로스 커팅 · 그랑 패턴 피날레(궁극기)
// B 쿠튀르 런웨이: 실크 로드 · 리본 피루엣 · 미러 피팅 · 뮤즈의 초대 · 오트쿠튀르 컬렉션(궁극기)
// C 마스터 아틀리에: 시그니처 쿠튀르 · 아르카나 엠브로이더리 · 주얼 리본 크래프트(제작) · 미라클 리스티치 · 테일러드 퍼펙션(패시브)
// 스킬 데이터는 tools/skills2/gen.py (ds_*), 실행은 js/skillrt.js 가 이 파일의 DsKit 을 부름(eng.ds, CUSTOM ds_*). 화면은 js/designerfx.js.
// 이 파일은 렌더링을 직접 하지 않음 — fx(kind, a, o) 가 null 을 돌려줘도(메시 로딩 전·테스트) 규칙은 그대로 동작.
//
// 시침 표식(공통): 대상마다·시전자(DsKit)마다 따로, 최대 3중첩·8초(더할 때마다 8초로 갱신). 한 번 시전에 대상마다 1중첩까지(다단 타격·
// 마무리·파생 피해는 더 쌓지 않음). 소비 = 패턴 브레이크(그 대상)·그랑 패턴 피날레(범위) — 자기 표식만 소비(다른 시전자 표식은 그대로).
// 사망·만료·지역 이동(clearTemp)에 정리. 체력 막대·예고를 가리지 않게 그림은 발밑(작은 금빛 바늘 1~3 + 짧은 재단 점선).
// 배율 상한: (1 + 표식당 per × 소비 수) × (1 + 속박 보너스) ≤ cap, 스포트라이트(뮤즈의 초대) 치명타 피해 증가까지 합친 배율 ≤ total.
import { HitShape } from './core.js';

export const DS = {
  mark: { max: 3, dur: 8 },
  stop: 0.04, heavyStop: 0.07,           // 시전자·맞은 대상만 잠깐 멈춤(초) — 전역 G.hitStop 없음
  kick: [0.09, 0.1], ultKick: [0.13, 0.12],   // 카메라 밀림 [m, s]: 강한 절단(패턴 브레이크·크로스 커팅 교차) / 궁극기 마지막
  sfxGap: 0.06,                            // 같은 소리는 이 간격 안에 다시 내지 않음(다단 겹침 제한)
  maxLive: 24,
  probe: 0.2,                              // 돌진·뒤로 물러남 길 검사 간격(m)
};
export const fold = L => 1 + 0.06 * Math.floor((Math.max(1, L) - 1) / 2);   // 일반 규칙의 레벨 추가타 몫(총합에 곱함)
const call = (h, m, ...a) => { try { return h && h[m] ? h[m](...a) : null; } catch (e) { console.warn('designerfx', m, e); return null; } };
const fmt = v => (Math.round(v * 10) / 10).toString();
const pct = v => Math.round(v * 100) + '%';
const P = t => ({ x: t.pos.x, y: t.pos.y || 0, z: t.pos.z, r: t.radius || 0.5 });

/** 표식 소비 배율(순수): n 중첩·속박 여부 -> 배율(상한 cap) */
export function consumeMul(n, bound, o) { return Math.min(o.cap, (1 + o.per * Math.max(0, n)) * (1 + (bound ? o.bound : 0))); }
/** 스포트라이트와 겹칠 때 치명타 피해 증가 여유(순수): 배율 m, 치명타 배율 cd(= 1.5 + 치명 피해, core.js CombatMath) 에서 (cd + x) / cd × m ≤ total 이 되는 x (0 .. 0.5) */
export function critRoom(m, cd, total, spot = 0.5) { return Math.max(0, Math.min(spot, cd * (total / Math.max(1e-6, m) - 1))); }
/** 점 p 에서 선분 a-b 까지 거리와 a 에서의 투영 길이 */
export function segInfo(p, a, b) {
  const vx = b.x - a.x, vz = b.z - a.z, L2 = vx * vx + vz * vz, k = L2 > 1e-9 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / L2)) : 0;
  return { d: Math.hypot(p.x - a.x - vx * k, p.z - a.z - vz * k), s: k * Math.sqrt(L2) };
}
/** 막히지 않고 갈 수 있는 길이(순수, geo = {blocked}): from 에서 dir 로 최대 max m, step 간격, 반지름 r */
export function clearRun(geo, from, dir, max, r = 0.4, step = DS.probe) {
  let d = 0; while (d + step <= max + 1e-6) { const x = from.x + dir.x * (d + step), z = from.z + dir.z * (d + step); if (geo.blocked(x, z, r)) break; d += step; }
  return Math.min(max, d);
}
/** 오트쿠튀르 스티치 지그재그 봉제 경로(순수): 중심 c, 방향 f, 반지름 r, 바늘 수 n -> 점 n 개(시침이 나아가는 순서) */
export function stitchPath(c, f, r, n) {
  const side = { x: -f.z, z: f.x }, pts = [];
  for (let i = 0; i < n; i++) { const u = n > 1 ? i / (n - 1) : 0.5, along = (-0.72 + 1.44 * u) * r, lat = (i % 2 ? 1 : -1) * r * 0.58; pts.push({ x: c.x + f.x * along + side.x * lat, z: c.z + f.z * along + side.z * lat }); }
  return pts;
}
/** 크로스 커팅 두 절단 경로(순수): 시전 위치 o, 방향 f -> {c, cuts: [[a, b], [a, b]]} (분홍 = ↘ 대각, 은빛 = ↙ 반대 대각) */
export function crossCuts(o, f, fwd, len) {
  const c = { x: o.x + f.x * fwd, z: o.z + f.z * fwd }, s = Math.SQRT1_2, h = len / 2;
  const u1 = { x: (f.x - f.z) * s, z: (f.z + f.x) * s }, u2 = { x: (f.x + f.z) * s, z: (f.z - f.x) * s };
  return { c, cuts: [u1, u2].map(u => [{ x: c.x - u.x * h, z: c.z - u.z * h }, { x: c.x + u.x * h, z: c.z + u.z * h }]) };
}
/** 오트쿠튀르 컬렉션 분신 3명의 교차 경로(순수): 런웨이 시작 o, 방향 f, 길이 len, 폭 w */
export function runwayPaths(o, f, len, w) {
  const side = { x: -f.z, z: f.x }, at = (a, l) => ({ x: o.x + f.x * a + side.x * l, z: o.z + f.z * a + side.z * l }), h = w * 0.5;
  return [[at(0.2, -h), at(len, h)], [at(0.2, h), at(len, -h)], [at(0.0, 0), at(len, 0)]];
}

/** 스킬 창 수치 줄(실제 데이터에서): skillui.js levelText 가 디자이너 스킬에 씀. 모르는 스킬이면 null */
export function dsLevelText(d, L, data) {
  if (!d || d.job !== 'designer') return null;
  const m = 1 + (d.type === 'ultimate' ? 0.25 : 0.12) * (L - 1), out = [], P_ = c => pct(c * m), op = (d.ops || []).find(o => o.op === 'custom') || (d.ops || [])[0];
  const fl = fold(L);
  switch (op && op.fn) {
    case 'ds_drape': out.push(`피해 ${P_(op.coef)} (반경 ${op.r} m, 핀 고정 순간)`, `속박 ${fmt(op.st[0].dur)}초 (보스는 둔화)`, '시침 +1'); break;
    case 'ds_break': out.push(`가위 절단 ${P_(op.coef * fl)}`, `시침 1개당 +${pct(op.per)} · 속박 대상 +${pct(op.bound)} (배율 최대 ×${fmt(op.cap)}, 스포트라이트 포함 ×${fmt(op.total)})`, '표식 없어도 기본 피해'); break;
    case 'ds_stitch': out.push(`바늘 ${op.n}번 × ${P_(op.coef)} (적마다 최대 ${op.maxPer}번) + 실 당김 ${P_(op.fin.coef)}`, `적마다 최대 ${P_(op.coef * op.maxPer + op.fin.coef)} · 시침 +1`); break;
    case 'ds_cross': out.push(`분홍 절단 ${P_(op.coef * fl)} + 은빛 절단 ${P_(op.coef * fl)}`, `교차 중심 +${P_(op.centre.coef * fl)} (대상마다 1번)`); break;
    case 'ds_finale': out.push(`일제 절단 ${P_(op.coef)} (전방 ${op.r} m · ${op.ang}°)`, `시침 1개당 +${pct(op.per)} · 속박 대상 +${pct(op.bound)} (배율 최대 ×${fmt(op.cap)}, 스포트라이트 포함 ×${fmt(op.total)})`); break;
    case 'ds_road': out.push(`돌진 최대 ${fmt(op.dist)} m · 경로의 적 ${P_(op.coef)} (적마다 1번)`, '시침 +1 · 무적 없음'); break;
    case 'ds_pirouette': out.push(`리본 ${op.n}번 × ${P_(op.coef)} + 매듭 ${P_(op.knot.coef)} (반경 ${op.r} m)`, `총 ${P_(op.coef * op.n + op.knot.coef)} · 매듭 둔화 ${pct(op.knot.slow.val)} ${fmt(op.knot.slow.dur)}초`, '보스·무거운 적은 끌려오지 않음'); break;
    case 'ds_mirror': out.push(`뒤로 ${fmt(op.back)} m · 마네킹 ${fmt(op.life * (1 + 0.05 * (L - 1)))}초 (일반 적의 주의를 끎)`, `끝날 때 망토 ${P_(op.coef)} (반경 ${op.r} m) + 둔화 ${pct(op.slow.val)} ${fmt(op.slow.dur)}초`); break;
    case 'ds_muse': out.push(`받는 치명타 피해 +${pct(op.val)} · ${fmt(op.dur)}초 (다시 쓰면 시간만 갱신)`); break;
    case 'ds_collection': out.push(`분신 ${op.n}명 × ${P_(op.coef)} (분신마다 적 1번) + 피날레 ${P_(op.fin.coef)} (반경 ${op.fin.r} m)`, `총 최대 ${P_(op.coef * op.n + op.fin.coef)} · 이동 속도 +${pct(0.4 * m)} 10초`); break;
    case 'ds_restitch': { const sh = d.ops.find(o => o.op === 'shield'); out.push(`보호막 ${Math.round(sh.base * m)} + 공격력 ${fmt(sh.coef * m * 100)}% (${sh.dur}초, 바로 적용)`, '출혈 제거'); break; }
    default:
      if (d.type === 'passive' && d.flags && d.flags.fitting) { const v = d.flags.fitting, k = v[0] + v[1] * (L - 1); out.push(`직접 만든 의상·자수 장비 착용 시 방어 +${pct(k)} · 이동 속도 +${pct(k * 0.5)}`); break; }
      if (d.type === 'craft') { out.push(d.id === 'ds_c1' ? '고급 의상 제작' : d.id === 'ds_c2' ? '공격·방어·회복 자수 3종' : '리본 장신구 제작'); break; }
      return null;
  }
  if (d.cd) out.push(`쿨타임 ${fmt(d.cd * (1 - 0.03 * (L - 1)))}초`);
  return out.filter(Boolean).join(' · ');
}

export class DsKit {
  constructor(eng, h) { this.eng = eng; this.h = h; this.live = []; this.timers = []; this.sndT = {}; this.marked = new Set(); this.fitOn = null;
    this.log = { marksAdded: 0, marksTaken: 0, centre: 0, stitches: 0, pulled: 0, mannequin: 0, cloak: 0 }; }
  get pc() { return this.eng.pc; }
  get G() { return this.h.G(); }
  get clock() { return this.eng.clock; }
  fx(kind, a, o) { try { return this.h.fx(kind, a, o); } catch (e) { return null; } }
  snd(n, gap = DS.sfxGap) { const t = this.clock; if (this.sndT[n] != null && t - this.sndT[n] < gap) return; this.sndT[n] = t; try { this.G.audio.sfx(n); } catch (e) { } }
  boss(t) { return !!(t && (t.isBoss || (t.def && t.def.ai === 'heavy'))); }
  hitT(ctx) {
    if (ctx.d.cast) return 0;
    let a = null; try { a = this.pc.body.sh.actions[ctx.act]; } catch (e) { a = null; }
    return Math.min(0.4, a && a.fps ? a.hitFrame / a.fps : 0.25) || 0.25;
  }
  after(t, fn) { this.timers.push({ at: this.clock + Math.max(0, t), fn }); }
  add(o) { this.live.push(o); while (this.live.length > DS.maxLive) { const x = this.live.shift(); call(x, 'dispose'); } return o; }
  tick(dt) {
    const pc = this.pc;
    if (this.timers.length) {
      const due = this.timers.filter(x => x.at <= this.clock); if (due.length) this.timers = this.timers.filter(x => x.at > this.clock);
      for (const x of due) { if (pc.dead) { this.timers = []; break; } try { x.fn(); } catch (e) { console.error('designer timer', e); } }
    }
    for (const o of this.live) if (!o.dead) { try { o.update(dt); } catch (e) { console.error('designer live', e); o.dead = true; } }
    if (this.live.some(o => o.dead)) this.live = this.live.filter(o => !o.dead);
    this.tickMarks(dt);
    this.tickFit();
  }
  /** 사망·지역 이동·불러오기·전직: 기다리는 타격·분신·표식을 모두 취소(피해 없음) */
  clear() { this.timers = []; for (const o of this.live) call(o, 'dispose'); this.live = []; for (const t of [...this.marked]) this.dropMark(t, 'clear'); this.marked.clear(); call(this.pre, 'dispose'); this.pre = null; }
  targets(sh) { return this.eng.targets(sh); }
  circle(c, r) { return this.targets(HitShape.circle(c.x, c.z, r)); }
  /** 피해 한 번: 전역 히트스톱 없이(quiet). o.critRoom = 스포트라이트 여유(결합 상한) */
  hit(t, coef, ctx, o = {}) { if (!t || t.dead) return 0; const a = this.eng.dmg(t, coef, ctx, { quiet: true, elem: o.elem, derived: !!o.derived, critRoom: o.critRoom }); return ctx.missed ? 0 : a; }
  st(t, list, ctx) { for (const s of list || []) if (!t.dead) this.h.applyStatus(t, s, this.pc, ctx.mult); }
  touch(ts, f, stop = DS.stop, punch = 0.12) {
    const pc = this.pc; if (!ts.length) return; if (stop) pc.freezeT = Math.max(pc.freezeT || 0, stop);
    for (const t of ts) if (!t.dead) { if (stop) t.freezeT = Math.max(t.freezeT || 0, stop); if (t.body && t.body.punch) t.body.punch(t.pos.x - pc.pos.x || f.x, t.pos.z - pc.pos.z || f.z, punch); }
  }
  kick(f, k = DS.kick) { const G = this.G; if (G && G.render && G.render.kick && !G.reduceFlash) G.render.kick(f.x, f.z, k[0], k[1]); }
  ground(p) { try { return this.pc.zone.geo.ground(p.x, p.z); } catch (e) { return { x: p.x, y: 0, z: p.z }; } }
  pull(t, to, m) { if (this.boss(t) || t.dead) return false; const dx = to.x - t.pos.x, dz = to.z - t.pos.z, d = Math.hypot(dx, dz); if (d < 0.35) return false; const k = Math.min(m, d - 0.3); t.knock = { x: dx / d * k * 3, z: dz / d * k * 3 }; this.log.pulled++; return true; }

  // ================================================================== 시침 표식
  markOf(t) { const s = t && t._dsMarks; return s ? s.get(this) || null : null; }
  marks(t) { const m = this.markOf(t); return m ? m.n : 0; }
  /** 한 번 시전에 대상마다 1중첩까지(ctx.dsMarked). 파생 피해·장식 타격은 부르지 않음 */
  addMark(t, ctx) {
    if (!t || t.dead) return false;
    const seen = ctx.dsMarked || (ctx.dsMarked = new Set()); if (seen.has(t)) return false; seen.add(t);
    const s = t._dsMarks || (t._dsMarks = new Map()); let m = s.get(this);
    if (!m) { m = { n: 0, t: 0, fx: this.fx('mark', t, {}) }; s.set(this, m); this.marked.add(t); }
    m.n = Math.min(DS.mark.max, m.n + 1); m.t = DS.mark.dur; call(m.fx, 'setStacks', m.n); this.log.marksAdded++;
    return true;
  }
  /** 자기 표식만 모두 소비 -> 소비한 수 */
  takeMarks(t) { const m = this.markOf(t); if (!m || !m.n) return 0; const n = m.n; this.dropMark(t, 'consume'); this.log.marksTaken += n; return n; }
  dropMark(t, why) { const s = t && t._dsMarks; const m = s && s.get(this); if (!m) return; call(m.fx, why === 'consume' ? 'consume' : why === 'expire' ? 'expire' : 'dispose'); s.delete(this); if (!s.size) t._dsMarks = null; this.marked.delete(t); }
  tickMarks(dt) {
    for (const t of [...this.marked]) {
      const m = this.markOf(t); if (!m) { this.marked.delete(t); continue; }
      if (t.dead || t.removed || (this.pc.zone && t.zone && t.zone !== this.pc.zone)) { this.dropMark(t, 'dead'); continue; }
      m.t -= dt; if (m.t <= 0) this.dropMark(t, 'expire');
    }
  }
  /** 소비 배율 + 스포트라이트 결합 상한 */
  bonus(t, n, op) {
    const bound = !!(t.status && t.status.has('root')), mul = consumeMul(n, bound, op);
    const cd = 1.5 + Math.max(0, (this.pc.stat && this.pc.stat('critDmg')) || 0), spot = !!(t.status && t.status.has('spotlit'));
    return { mul, bound, critRoom: spot ? critRoom(mul, cd, op.total) : undefined };
  }

  // ================================================================== 시전 시작(시전 시간 동안의 예고) · 중단
  onCast(d, ctx) {
    if (d.job !== 'designer') return;
    const op = (d.ops || []).find(o => o.op === 'custom'); if (!op) return;
    const pc = this.pc, f = ctx.facing;
    if (op.fn === 'ds_finale') { call(this.pre, 'dispose'); this.pre = this.fx('finalePre', pc, { f, o: { ...ctx.origin }, r: op.r, ang: op.ang, lines: op.lines, dur: d.cast || 0.8 }); ctx.dsPre = this.pre; this.snd('ds_unfold'); }
    if (op.fn === 'ds_collection') { const len = clearRun(pc.zone.geo, ctx.origin, f, op.len, 0.3); ctx.dsRunway = len; call(this.pre, 'dispose'); this.pre = this.fx('runwayPre', pc, { f, o: { ...ctx.origin }, len, w: op.w, dur: d.cast || 0.4 }); ctx.dsPre = this.pre; this.snd('ds_ribbon'); }
  }
  onInterrupt(ctx) { if (ctx && ctx.dsPre) { call(ctx.dsPre, 'dispose'); if (this.pre === ctx.dsPre) this.pre = null; } }
  /** 시전 전 검사(자원을 쓰기 전): 실크 로드 앞이 바로 막혀 있으면 거절 */
  validate(d) {
    if (!d || d.job !== 'designer') return null;
    const op = (d.ops || []).find(o => o.op === 'custom'); if (!op || op.fn !== 'ds_road') return null;
    const pc = this.pc; if (clearRun(pc.zone.geo, pc.pos, pc.facing, 1.0, pc.radius || 0.4) < 0.6) return '앞이 막혀 있습니다';
    return null;
  }

  // ================================================================== A. 마법 입체재단
  /** 실크 드레이핑: 실크 두 줄이 양옆에서 날아가 반투명 원단이 적을 감싸고, 금빛 핀이 모서리를 고정하는 순간 = 피해·속박(보스는 둔화)·시침 */
  ds_drape(op, ctx) {
    const pc = this.pc, ht = this.hitT(ctx), c = this.ground(ctx.aim), f = ctx.facing;
    const H = this.fx('drape', pc, { c, f, r: op.r, fly: ht, pin: ht + op.pin });
    this.after(ht, () => this.snd('ds_silk'));
    this.after(ht + op.pin, () => {
      const ts = this.circle(c, op.r), hit = [];
      for (const t of ts) { this.hit(t, op.coef, ctx); if (!ctx.missed) { hit.push(t); this.st(t, op.st, ctx); this.addMark(t, ctx); } }
      call(H, 'pin', hit.map(t => ({ ...P(t), boss: !!t.isBoss, root: (t.status && t.status.get && t.status.get('root')) ? t.status.get('root').remaining : 0, t })));
      this.snd('ds_pin'); this.touch(hit, f, DS.stop, 0.12);
    });
  }
  /** 패턴 브레이크: 대상에 짧은 재단 점선 -> 큰 마법 가위가 점선을 따라 한 번 닫히는 순간 피해. 내 시침을 모두 소비해 추가 피해(속박 대상 보너스, 상한) */
  ds_break(op, ctx) {
    const pc = this.pc, ht = this.hitT(ctx), f = ctx.facing, d = ctx.d;
    let tgt = ctx.tgt && !ctx.tgt.dead ? ctx.tgt : this.eng.targetFor(d);
    const H = this.fx('break', pc, { f, tgt: tgt || null, close: ht, len: op.len, marks: tgt ? this.marks(tgt) : 0 });
    this.after(Math.max(0, ht - 0.12), () => this.snd('ds_snip_open'));
    this.after(ht, () => {
      if (!tgt || tgt.dead) tgt = this.eng.targetFor(d);
      if (!tgt || pc.dist(tgt) > this.eng.range(d) + tgt.radius + 1) { call(H, 'miss'); return; }
      const n = this.takeMarks(tgt), b = this.bonus(tgt, n, op);
      this.hit(tgt, op.coef * fold(ctx.L) * b.mul, ctx, { critRoom: b.critRoom });
      const ok = !ctx.missed; ctx.dsBreak = { n, mul: b.mul, bound: b.bound, ok };
      call(H, 'close', { ...P(tgt), n, ok, bound: b.bound });
      this.snd('ds_snip'); if (ok) { this.touch([tgt], f, n ? DS.heavyStop : DS.stop, 0.2); if (n >= 2) this.kick(f); }
    });
  }
  /** 오트쿠튀르 스티치: 지그재그 봉제선을 바늘이 차례로 관통(바늘 i 의 시각·위치 = 그 타격), 적마다 최대 maxPer 번 -> 마지막 바늘이 실을 당겨 마무리 */
  ds_stitch(op, ctx) {
    const pc = this.pc, ht = this.hitT(ctx), c = this.ground(ctx.aim), f = ctx.facing, pts = stitchPath(c, f, op.r, op.n);
    const H = this.fx('stitch', pc, { c, f, r: op.r, pts, start: ht + op.start, gap: op.gap, fin: ht + op.start + op.n * op.gap + 0.12 });
    const count = new Map();
    for (let i = 0; i < op.n; i++) this.after(ht + op.start + i * op.gap, () => {
      const a = pts[Math.max(0, i - 1)], b = pts[i], hit = [];
      for (const t of this.circle(c, op.r + 0.6)) {
        if (segInfo(t.pos, a, b).d > op.w * 0.5 + (t.radius || 0.5)) continue;
        const k = count.get(t) || 0; if (k >= op.maxPer) continue; count.set(t, k + 1);
        this.hit(t, op.coef, ctx); if (!ctx.missed) { hit.push(t); this.addMark(t, ctx); }
      }
      this.log.stitches++; call(H, 'stitch', i, hit.map(P)); this.snd('ds_needle', 0.05); this.touch(hit, f, 0.025, 0.08);
    });
    this.after(ht + op.start + op.n * op.gap + 0.12, () => {
      const hit = [];
      for (const [t] of count) { if (t.dead) continue; this.hit(t, op.fin.coef, ctx); if (!ctx.missed) { hit.push(t); this.pull(t, c, op.fin.pull); } }
      call(H, 'pull', hit.map(P)); this.snd('ds_thread'); this.touch(hit, f, DS.stop, 0.14);
    });
  }
  /** 크로스 커팅: 분홍 대각 절단 -> 은빛 반대 대각 절단(X자), 두 경로 + 교차 중심(대상마다 시전에 한 번 추가 피해) */
  ds_cross(op, ctx) {
    const pc = this.pc, ht = this.hitT(ctx), f = ctx.facing, fl = fold(ctx.L);
    const X = crossCuts(ctx.origin, f, op.fwd, op.len);
    const H = this.fx('cross', pc, { f, c: X.c, cuts: X.cuts, w: op.w, t1: ht, t2: ht + op.gap, cr: op.centre.r });
    const centreDone = new Set();
    X.cuts.forEach(([a, b], k) => this.after(ht + k * op.gap, () => {
      const hit = [];
      for (const t of this.circle(X.c, op.len / 2 + 1.5)) { if (segInfo(t.pos, a, b).d > op.w / 2 + (t.radius || 0.5)) continue; this.hit(t, op.coef * fl, ctx); if (!ctx.missed) hit.push(t); }
      let centre = [];
      if (k === 1) for (const t of this.circle(X.c, op.centre.r)) { if (centreDone.has(t)) continue; centreDone.add(t); this.hit(t, op.centre.coef * fl, ctx); if (!ctx.missed) { centre.push(t); this.log.centre++; } }
      call(H, 'cut', k, hit.map(P), centre.map(P));
      this.snd(k ? 'ds_snip_silver' : 'ds_snip'); this.touch(hit, f, k ? DS.heavyStop : DS.stop, k ? 0.18 : 0.12);
      if (k === 1 && centre.length) this.kick(f);
    }));
  }
  /** 그랑 패턴 피날레(궁극기): 시전 동안 도면·점선(onCast) -> 거대 가위가 닫히는 순간 전방 부채꼴 일제 절단. 내 시침 소비·속박 대상 보너스(상한) */
  ds_finale(op, ctx) {
    const pc = this.pc, f = ctx.facing, o = ctx.origin;
    const ts = this.targets(HitShape.cone(o.x, o.z, f.x, f.z, op.r, op.ang)), hit = [];
    const H = ctx.dsPre || this.fx('finalePre', pc, { f, o: { ...o }, r: op.r, ang: op.ang, lines: op.lines, dur: 0 });
    if (this.pre === H) this.pre = null;
    for (const t of ts) {
      const n = this.takeMarks(t), b = this.bonus(t, n, op);
      this.hit(t, op.coef * b.mul, ctx, { critRoom: b.critRoom });
      if (!ctx.missed) hit.push({ ...P(t), n, bound: b.bound, t });
    }
    call(H, 'cut', hit);
    this.snd('ds_finale'); this.touch(hit.map(x => x.t), f, DS.heavyStop, 0.24); this.kick(f, DS.ultKick);
  }

  // ================================================================== B. 쿠튀르 런웨이
  /** 실크 로드: 진행 방향에 얇은 실크 길(= 실제로 갈 수 있는 길이) -> 짧은 돌진. 지나가는 순간 경로의 적을 한 번씩 + 시침. 무적 없음, 벽 통과 없음 */
  ds_road(op, ctx) {
    const pc = this.pc, f = ctx.facing, from = { ...pc.pos }, len = clearRun(pc.zone.geo, from, f, op.dist, pc.radius || 0.4);
    const end = { x: from.x + f.x * len, z: from.z + f.z * len }; ctx.dsRoad = { len, from, end };
    const H = this.fx('road', pc, { f, from, len, w: op.w, speed: op.speed });
    if (len > 0.05) pc.startDash(f, len, op.speed, false, 'ds_glide');
    this.snd('ds_ribbon');
    const done = new Set();
    for (const t of this.targets(HitShape.rect(from.x, from.z, f.x, f.z, op.w, len + 0.4))) {
      const s = segInfo(t.pos, from, end); if (s.d > op.w / 2 + (t.radius || 0.5)) continue;
      this.after(Math.max(0, s.s / op.speed), () => {
        if (done.has(t) || t.dead || pc.dead) return; done.add(t);
        this.hit(t, op.coef, ctx); if (!ctx.missed) { this.addMark(t, ctx); call(H, 'hit', P(t)); this.touch([t], f, 0.03, 0.12); this.snd('ds_silk_hit', 0.04); }
      });
    }
  }
  /** 리본 피루엣: 짧게 돌며 넓은 리본 두 줄 — 주변 적을 약하게 끌어당기며 n 번(gap 간격) -> 마지막 매듭처럼 조여 마무리(+ 둔화). 보스·무거운 적은 안 끌림 */
  ds_pirouette(op, ctx) {
    const pc = this.pc, ht = this.hitT(ctx), f = ctx.facing;
    const H = this.fx('pirouette', pc, { f, r: op.r, n: op.n, start: ht, gap: op.gap, knot: ht + op.n * op.gap + 0.1 });
    this.snd('ds_ribbon');
    for (let i = 0; i < op.n; i++) this.after(ht + i * op.gap, () => {
      const c = pc.pos, hit = [];
      for (const t of this.circle(c, op.r)) { this.hit(t, op.coef, ctx); if (!ctx.missed) { hit.push(t); this.pull(t, c, op.pull); } }
      call(H, 'lash', i, hit.map(P)); this.snd('ds_cloth', 0.08); this.touch(hit, f, 0, 0.07);
    });
    this.after(ht + op.n * op.gap + 0.1, () => {
      const c = pc.pos, hit = [];
      for (const t of this.circle(c, op.r)) { this.hit(t, op.knot.coef, ctx); if (!ctx.missed) { hit.push(t); this.h.applyStatus(t, { id: 'slow', dur: op.knot.slow.dur, val: op.knot.slow.val, ch: 1 }, pc, 1); } }
      call(H, 'knot', hit.map(P)); this.snd('ds_thread'); this.touch(hit, f, DS.stop, 0.14);
    });
  }
  /** 미러 피팅: 뒤로 짧게 물러남(막히면 덜/제자리), 원래 자리 잔상이 실로 풀리며 마네킹이 조립되고 리본 망토가 입혀짐 -> 일반 적의 주의를 끎(보스 제외).
   *  끝(시간·부서짐) = 망토가 풀려 퍼지며 피해 + 둔화. 사망·지역 이동·다시 쓰기로 치워질 때는 공격 없음 */
  ds_mirror(op, ctx) {
    const pc = this.pc, f = ctx.facing, at = { ...ctx.origin }, back = { x: -f.x, z: -f.z };
    const len = clearRun(pc.zone.geo, at, back, op.back, pc.radius || 0.4); ctx.dsBack = len;
    if (len > 0.05) pc.startDash(back, len, 12, false, 'ds_glide', true);
    for (const s of this.eng.summons) if (!s.dead && s.o.ai === 'ds_mannequin') s.vanish(true);   // 하나만 — 예전 것은 조용히(망토 공격 없음)
    const o = { kind: 'ds_mannequin', ai: 'ds_mannequin', life: op.life, hp: op.hp, taunt: true, noBurst: true, limit: op.limit || 1, cloak: { r: op.r, coef: op.coef, slow: op.slow } };
    const s = this.h.summon(o, ctx, this.ground(at)); if (!s) return;
    this.log.mannequin++; this.snd('ds_thread');
  }
  summonInit(s) {
    if (s.view) s.view.visible = false;   // 그림은 designerfx 가 그림(기본 소환 모형은 숨김)
    s.noBossTaunt = true;                // 보스는 강제로 끌지 않음(actors.js Monster.player — 한약사 녹각수호령과 같은 표시)
    s.dsFx = this.fx('mannequin', s.pos, { f: s.ctx.facing, life: s.life });
    const vanish = s.vanish.bind(s);
    s.vanish = (silent) => { if (s.dead) return; call(s.dsFx, s._dsCloak ? 'unravel' : 'dispose'); s.dsFx = null; vanish(true); };
    s.destroy = (broken) => this.cloakEnd(s, broken ? 'break' : 'expire');
  }
  cloakEnd(s, why) {
    if (s.dead) return; const pc = this.pc, o = s.o.cloak;
    if (!s._dsCloak && !pc.dead && pc.zone === s.zone && (why === 'break' || why === 'expire')) {
      s._dsCloak = true; this.log.cloak++; const hit = [];
      for (const t of this.circle(s.pos, o.r)) { this.hit(t, o.coef, s.ctx); if (!s.ctx.missed) { hit.push(t); this.h.applyStatus(t, { id: 'slow', dur: o.slow.dur, val: o.slow.val, ch: 1 }, pc, 1); } }
      call(s.dsFx, 'cloak', hit.map(P)); this.snd('ds_cloth');
    }
    s.vanish(true);
  }
  summonTick(s) { if (!s.dead) call(s.dsFx, 'hp', s.hp / s.maxHp); }
  /** 뮤즈의 초대: 지정 적에 작은 조명 + 발밑 무대 문양 + 양옆 보석 핀 — 받는 치명타 피해 증가(다시 쓰면 시간만 갱신, 겹쳐 커지지 않음) */
  ds_muse(op, ctx) {
    const pc = this.pc, t = ctx.tgt && !ctx.tgt.dead ? ctx.tgt : this.eng.targetFor(ctx.d); if (!t) return;
    const ht = this.hitT(ctx);
    this.after(ht, () => {
      if (t.dead) return;
      this.h.applyStatus(t, { id: 'spotlit', dur: op.dur, val: op.val, ch: 1 }, pc, 1);
      const old = t._dsMuse; if (old && !old.dead) call(old.h, 'dispose');
      const s = t.status.get && t.status.get('spotlit'), h = this.fx('muse', t, { dur: s ? s.remaining : op.dur });
      const live = t._dsMuse = { dead: false, h, update: () => { const st = t.status.get && t.status.get('spotlit'); if (t.dead || !st) { call(h, 'end'); live.dead = true; } },
        dispose: () => { live.dead = true; call(h, 'dispose'); } };
      this.add(live); this.snd('ds_spot');
    });
  }
  /** 오트쿠튀르 컬렉션(궁극기): 전방 런웨이(실제로 갈 수 있는 길이) — 의상이 다른 분신 3명이 차례로 교차 질주(분신마다 적 1번) -> 본체가 가위와 리본을 펼치는 피날레 */
  ds_collection(op, ctx) {
    const pc = this.pc, f = ctx.facing, o = { ...ctx.origin }, len = ctx.dsRunway != null ? ctx.dsRunway : clearRun(pc.zone.geo, o, f, op.len, 0.3);
    const paths = runwayPaths(o, f, Math.max(1, len), op.w), mid = { x: o.x + f.x * len / 2, z: o.z + f.z * len / 2 };
    const H = ctx.dsPre || this.fx('runwayPre', pc, { f, o, len, w: op.w, dur: 0 }); if (this.pre === H) this.pre = null;
    call(H, 'go', { paths, gap: op.gap, run: op.run || 0.34, fin: op.fin.t, mid, r: op.fin.r });
    paths.slice(0, op.n).forEach(([a, b], i) => {
      const t0 = 0.08 + i * op.gap, run = op.run || 0.34, L = Math.hypot(b.x - a.x, b.z - a.z) || 1, done = new Set();
      this.after(t0, () => this.snd('ds_whoosh', 0.04));
      for (const t of this.targets(HitShape.circle((a.x + b.x) / 2, (a.z + b.z) / 2, L / 2 + 2))) {
        const s = segInfo(t.pos, a, b); if (s.d > 0.7 + (t.radius || 0.5)) continue;
        this.after(t0 + run * s.s / L, () => {
          if (done.has(t) || t.dead) return; done.add(t);
          this.hit(t, op.coef, ctx); if (!ctx.missed) { this.addMark(t, ctx); call(H, 'hit', i, P(t)); this.touch([t], f, 0.03, 0.12); this.snd('ds_snip', 0.05); }
        });
      }
    });
    this.after(op.fin.t, () => {
      const hit = []; for (const t of this.circle(mid, op.fin.r)) { this.hit(t, op.fin.coef, ctx); if (!ctx.missed) { hit.push(t); this.addMark(t, ctx); } }
      call(H, 'finale', hit.map(P)); this.snd('ds_finale'); this.touch(hit, f, DS.heavyStop, 0.2); this.kick(f, DS.ultKick);
    });
  }

  // ================================================================== C. 마스터 아틀리에
  /** 미라클 리스티치: 보호막은 누른 순간 바로(연출이 늦추지 않음) + 출혈 제거(성공 여부와 무관) — 그림은 찢어진 천 -> 바늘 봉합 -> 실크 보호막 */
  ds_restitch(op, ctx) {   // 규칙 자체는 데이터의 shield·cleanse op(같은 순간, at -1)가 함 — 여기서는 출혈 여부 기록 + 그림
    const pc = this.pc, before = !!(pc.status && pc.status.has && pc.status.has('bleed'));
    this.after(0, () => {
      ctx.dsRestitch = { shield: pc.shield, bled: before, cured: before && !(pc.status.has && pc.status.has('bleed')) };
      this.fx('restitch', pc, { dur: op.dur, amount: pc.shield, cured: ctx.dsRestitch.cured });
    });
    this.snd('ds_needle'); this.after(0.25, () => this.snd('ds_thread'));
  }
  /** 테일러드 퍼펙션: 지금 입은 의상이 직접 만든 것(제작자 = 나)이거나 자수가 있으면 true (core.js gearModsProvider 와 같은 판정) */
  fitActive() { const p = this.pc.sheet && this.pc.sheet.p; if (!p) return false; return fittingOn(p, this.eng.book.passive('fitting')); }
  tickFit() {
    const on = this.fitActive();
    if (this.fitOn === null) { this.fitOn = on; return; }   // 처음(불러오기) 상태는 연출 없이
    if (on !== this.fitOn) { this.fitOn = on; if (on) { this.fx('fit', this.pc, {}); this.snd('ds_spot'); } else this.fx('unfit', this.pc, {}); }
  }
  /** 제작 완성 연출(skillui.js 제작 버튼): 시그니처 쿠튀르 / 아르카나 엠브로이더리 / 주얼 리본 크래프트 */
  made(rc, out, n) {
    const kind = rc.skill === 'ds_c1' ? 'outfit' : rc.skill === 'ds_c2' ? 'emb' : 'ribbon';
    const pattern = out.id === 't_emb_atk' ? 'star' : out.id === 't_emb_def' ? 'grid' : out.id === 't_emb_mp' ? 'curve' : null;
    this.fx('made', this.pc, { kind, pattern, n, id: out.id }); this.snd(kind === 'emb' ? 'ds_needle' : 'ds_cloth');
  }
}

/** 테일러드 퍼펙션 판정(순수 — core.js 가 같은 함수를 씀): 패시브 값 fit > 0 이고 지금 입은 의상이 직접 만든 것(crafted[id].by = 내 이름, 예전 기록은 by 없음 = 나)이거나 자수가 있음 */
export function fittingOn(p, fit) {
  if (!(fit > 0) || !p || !p.armor) return false;
  const cr = (p.crafted || {})[p.armor], gm = (p.gearMods || {})[p.armor];
  const mine = !!cr && typeof cr === 'object' && (!cr.by || cr.by === p.name);
  return mine || !!(gm && gm.emb);
}
