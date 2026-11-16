// 화가 2차 스킬 규칙 (2026-11-16 개편 '그린 그림을 현실로 꺼내는 창조 마도사'): 생명을 그리는 화필(A) · 색채 연성술(B) · 현실이 되는 풍경화(C).
// 스킬 데이터는 tools/skills2/gen.py (pt_*, CUSTOM 'paint' — op.k = 칸), 실행은 js/skillrt.js 가 이 파일의 PaintKit 을 부름(eng.painter).
// 그림은 js/painterfx.js — 이 파일은 렌더링을 직접 하지 않는다: fx(kind, a, o) 가 null 을 돌려줘도(메시 로딩 전·테스트) 규칙은 그대로.
//
// 규칙 요약
//  * 그림 소환물(흑랑·채색군학·팔레트 기사·크로키 분신)은 '윤곽 -> 채색 -> 분리' 뒤에 움직인다: 그림이 완성되는 시각(draw 초, 누른 순간부터)
//    = AI 가 켜지는 시각. 흑랑 2마리(다시 그리면 가장 오래된 것 교체), 학 편대·기사 1(다시 그리면 시간·체력 새로), 분신 1(교체), 전체 8.
//    모두 '생명 소환물'(living) — 꽃의 들판 회복을 받고, 만상갤러리 공격 강화를 받는다(상한 PAINT.galleryCap, 겹치지 않음).
//  * 학 편대: 학이 몇 마리로 보이든 피해는 편대 기준(깃털 한 번 = 총 계수 feather 를 깃털 수로 나눔). 급강하는 한 번에 한 마리, 대상마다
//    dive.per 초에 한 번. 기사 도발은 일반 몬스터만(noBossTaunt). 분신은 정해진 소환 능력치(대상의 공격력·체력·기술을 복사하지 않음).
//  * 채색(빨강·파랑·노랑): 대상마다, 시전자마다, 색마다 하나(같은 색 재적중 = 시간만 갱신, PAINT.colorDur). 내 채색만 소비.
//    팔레트 퓨전·스펙트럼 걸작이 소비(그 순간 확정, 다시 소비되지 않음). 혼색·궁극기 반응 피해는 파생(derived) — 채색·반응을 다시 만들지 않음,
//    대상마다 시전당 반응 피해 한 번. 대상 사망·만료·시전자 정리(사망·존 이동) 때 표시와 함께 지움.
//  * 풍경(꽃의 들판·백색 성벽·뇌운의 캔버스): 종류마다 동시 상한(들판·폭풍 1, 성벽 2), 크기·시간은 생성 순간 한 번만 마스터의 구도로 늘림
//    (다시 계산·재시전으로 곱해지지 않음). 성벽은 늘어난 길이로 못 세우는 자리면 원래 길이, 그것도 안 되면 시전 전에 거절(자원 안 씀).
//  * 만상갤러리: 시전 순간 있는 작품마다 한 번(들판 회복 파동·성벽 내구도 회복(최대 넘지 않음)·뇌운 추가 번개·소환물 공격 강화 10초).
//    작품이 하나도 없으면 시전 전에 거절. 다시 써도 강화는 max(더하지 않음), 끝나면 정확히 원래대로.
import { HitShape, StatusSet } from './core.js';
import { pickTarget } from './herbal.js';
import { sugarSpotError, segDist } from './chef.js';

export const PAINT = {
  colorDur: 8,            // 채색 지속(초) — 같은 색 재적중은 이 시간으로 다시 채움
  think: 0.25,            // 소환물이 대상을 다시 고르는 간격(초)
  leash: 16,              // 주인과 이만큼 떨어지면 주인 곁에 다시 그려짐(m)
  redraw: 0.4,            // 다시 그려지는 시간(초)
  summonCap: 8,
  galleryCap: 0.4,        // 만상갤러리 소환물 공격 강화 상한(다른 강화와 max)
  speed: { wolf: 5.4, knight: 3.6, clone: 4.6, crane: 6.0 },
  stop: 0.04, stopHeavy: 0.07, kick: [0.06, 0.08], kickHeavy: [0.1, 0.1],   // 강한 순간만: 시전자·대상만 잠깐(초), 카메라 한 번 [m, 초]
  wallChip: 0.6,          // 성벽에 붙은 적이 1초마다 깎는 내구도 = 적 공격력 × 이 값
  sfxGap: { pt_bite: 0.25, pt_dot: 0.06, pt_ink: 0.2, heal: 0.9, pt_bolt: 0.3, pt_brush: 0.15, pt_wash: 0.3 },
};
export const COLORS = ['red', 'blue', 'yellow'];
const durL = (d, L) => d * (1 + 0.05 * (Math.max(1, L) - 1));
const call = (h, m, ...a) => { try { return h && h[m] ? h[m](...a) : null; } catch (e) { console.warn('painterfx', m, e); return null; } };
const norm = (x, z) => { const m = Math.hypot(x, z) || 1; return { x: x / m, z: z / m }; };
let SEED = 11; const rnd = (a, b) => { SEED = (SEED * 16807) % 2147483647; return a + (SEED / 2147483647) * (b - a); };   // 자기 난수(명중·치명 굴림을 건드리지 않음)

// ------------------------------------------------------------------ 채색(순수 함수): t._ptc = { [owner]: { red: 남은 초, blue, yellow } }
/** 채색 하나 더하기(같은 색이면 시간만 갱신). 새로 묻었으면 true */
export function addColor(t, owner, col, dur = PAINT.colorDur) {
  if (!t || t.dead || !COLORS.includes(col)) return false;
  const all = t._ptc || (t._ptc = {}), m = all[owner] || (all[owner] = {}); const fresh = !(m[col] > 0); m[col] = dur; return fresh;
}
/** 그 시전자의 채색 목록(빨·파·노 순) */
export function colorsOf(t, owner) { const m = t && t._ptc && t._ptc[owner]; return m ? COLORS.filter(c => m[c] > 0) : []; }
/** 그 시전자의 채색을 모두 소비(돌려준 뒤 지움) — 다른 시전자의 채색은 그대로 */
export function takeColors(t, owner) { const cols = colorsOf(t, owner); if (t && t._ptc) delete t._ptc[owner]; return cols; }
/** 시간 흐름: 끝난 색은 지움, 대상이 죽으면 모두 지움. 바뀌었으면 true */
export function tickColors(t, dt) {
  if (!t || !t._ptc) return false; let ch = false;
  for (const [o, m] of Object.entries(t._ptc)) { for (const c of COLORS) if (m[c] > 0) { m[c] -= dt; if (m[c] <= 0 || t.dead) { delete m[c]; ch = true; } } if (!COLORS.some(c => m[c] > 0)) delete t._ptc[o]; }
  if (!Object.keys(t._ptc).length) t._ptc = null; return ch;
}
/** 혼색 종류(색 조합마다 하나): 0~1색 none · 빨+파 steam · 파+노 wave · 노+빨 core · 세 색 tri */
export function mixKind(cols) {
  const s = new Set(cols), r = s.has('red'), b = s.has('blue'), y = s.has('yellow');
  if (r && b && y) return 'tri'; if (r && b) return 'steam'; if (b && y) return 'wave'; if (y && r) return 'core'; return 'none';
}
/** 스펙트럼 걸작 계수: 기본 × (1 + 종류(최대 3) × perKind + min(개수, countCap) × perCount) */
export function spectrumCoef(op, kinds, count) { return op.coef * (1 + Math.min(3, kinds) * op.perKind + Math.min(op.countCap, count) * op.perCount); }
/** 마스터의 구도: 생성 순간 한 번만 곱함(기본값에서) */
export function landscapeScale(base, pass) { return base * (1 + (pass || 0)); }

let UID = 0;
export class PaintKit {
  constructor(eng, h) { this.eng = eng; this.h = h; this.owner = 'pc'; this.reset(); }
  reset() { this.fields = []; this.walls = []; this.things = []; this.timers = []; this.gallery = null; this.castFx = null; this.sfxT = {}; this.colored = new Set(); this.log = { reactions: 0, consumed: 0, bolts: 0 }; }
  get pc() { return this.eng.pc; }
  get G() { return this.h.G(); }
  get clock() { return this.eng.clock; }
  fx(kind, a, o) { try { return this.h.fx ? this.h.fx(kind, a, o) : null; } catch (e) { console.warn('painterfx', kind, e); return null; } }
  sfx(n) { const g = PAINT.sfxGap[n] || 0; if (g && this.clock - (this.sfxT[n] ?? -9) < g) return; this.sfxT[n] = this.clock; try { this.G.audio.sfx(n); } catch (e) { } }
  later(t, f) { this.timers.push({ t, f }); }
  ground(x, z) { try { return this.pc.zone.geo.ground(x, z); } catch (e) { return { x, y: 0, z }; } }
  blocked(x, z, r = 0.1) { try { return this.pc.zone.geo.blocked(x, z, r); } catch (e) { return false; } }
  passive(k) { try { return this.eng.book.passive(k) || 0; } catch (e) { return 0; } }
  apply(t, id, dur, val, lvMul = 1) { return this.h.applyStatus(t, { id, dur, val, ch: 1 }, this.pc, lvMul); }
  healPow() { const pc = this.pc; return Math.max(pc.sheet && pc.sheet.final ? pc.sheet.final.healPower || 0 : 0, pc.stat ? pc.stat('healPower') || 0 : 0); }
  get summons() { return this.eng.summons.filter(s => s.painted && !s.dead); }
  targets(sh) { return this.eng.targets(sh); }
  /** 직접 피해 한 번(전역 히트스톱·무작위 흔들림 없음 — quiet). 실제로 맞았는지(MISS 아님) */
  hit(t, coef, ctx, extra = {}) { if (!t || t.dead) return false; this.eng.dmg(t, coef, ctx, { quiet: true, ...extra }); return !ctx.missed; }
  /** 채색 묻히기(직접 공격만 — 파생 피해는 부르지 않음) */
  color(t, col) { if (!t || t.dead) return; if (addColor(t, this.owner, col)) this.log.colored = (this.log.colored || 0) + 1; this.colored.add(t); this.showColors(t); }
  showColors(t) {
    const cols = colorsOf(t, this.owner);
    if (!cols.length) { if (t._ptcFx) { call(t._ptcFx, 'end'); t._ptcFx = null; } return; }
    if (!t._ptcFx) t._ptcFx = this.fx('colors', t, {});
    call(t._ptcFx, 'set', cols);
  }
  /** 강한 순간만: 시전자·맞은 대상만 잠깐 멈추고 카메라 한 번 (전역 G.hitStop / addShake 안 씀) */
  impact(ts, f, heavy) {
    const pc = this.pc, G = this.G, s = heavy ? PAINT.stopHeavy : PAINT.stop, k = heavy ? PAINT.kickHeavy : PAINT.kick;
    if (!ts.length) return;
    pc.freezeT = Math.max(pc.freezeT || 0, s);
    for (const t of ts) if (!t.dead) { t.freezeT = Math.max(t.freezeT || 0, s); if (t.body && t.body.punch) t.body.punch(t.pos.x - pc.pos.x, t.pos.z - pc.pos.z, heavy ? 0.18 : 0.12); }
    if (heavy && G.render && G.render.kick && !G.reduceFlash) G.render.kick(f.x, f.z, k[0], k[1]);
  }
  handPoint() { const pc = this.pc; let h = null; try { h = pc.body && pc.body.bladePoints && pc.body.bladePoints(); } catch (e) { h = null; }
    if (h && h[1]) return { x: h[1].x, y: h[1].y, z: -h[1].z };   // 붓끝(three 좌표 -> 게임 좌표)
    try { const p = pc.body && pc.body.handPoint && pc.body.handPoint(); if (p) return { x: p.x, y: p.y, z: -p.z }; } catch (e) { }
    return { x: pc.pos.x + pc.facing.x * 0.6, y: (pc.pos.y || 0) + 1.2, z: pc.pos.z + pc.facing.z * 0.6 }; }

  // ------------------------------------------------------------------ hooks from skillrt
  cast(op, ctx) { const f = this['k_' + op.k]; if (f) return f.call(this, op, ctx); console.warn('paint: unknown', op.k); }
  /** 시전 시간이 있는 궁극기: 누른 순간부터 준비 그림(두루마리·추상화·화폭) — 끊기면 지움 */
  onCast(d, ctx) {
    if (d.job !== 'painter' || !(d.cast > 0)) return;
    const k = d.id.slice(3), o = { dur: d.cast, f: ctx.facing, aim: ctx.aim, hand: () => this.handPoint() };
    if (k === 'a5') { const op = d.ops.find(x => x.k === 'a5'); o.len = op.len; }
    if (k === 'b5') { o.cols = []; const op = d.ops.find(x => x.k === 'b5'); for (const t of this.targets(HitShape.circle(this.pc.pos.x, this.pc.pos.z, op.r))) o.cols.push(...colorsOf(t, this.owner)); }
    if (k === 'c5') o.works = this.works(d.ops.find(x => x.k === 'c5').range).map(w => w.pos);
    ctx.ptCast = this.castFx = this.fx('cast_' + k, this.pc, o); this.sfx('pt_sketch');
  }
  onInterrupt(ctx) { if (ctx && ctx.ptCast) { call(ctx.ptCast, 'cancel'); if (this.castFx === ctx.ptCast) this.castFx = null; } }
  /** 시전 전 검사(자원·재사용 대기를 쓰기 전에): 성벽 자리, 만상갤러리 작품 */
  validate(d, aim) {
    if (!d || d.job !== 'painter') return null;
    const op = d.ops && d.ops.find(o => o.fn === 'paint' && o.k !== 'pre'); if (!op) return null;
    if (op.k === 'c2') return this.wallPlan(d, op, aim).err;
    if (op.k === 'c5' && !this.works(op.range).length) return '강화할 작품(풍경·그림 소환물)이 없습니다';
    return null;
  }
  /** 누른 순간의 준비 연출(붓끝에 물감 모으기) — 그림만 */
  k_pre(op, ctx) { ctx.ptPre = this.fx('pre', this.pc, { what: op.what, lead: -(op.at || 0), facing: ctx.facing, aim: ctx.aim, hand: () => this.handPoint() }); }

  // ================================================================== A. 생명을 그리는 화필
  spawn(kind, op, ctx, p) {
    const eng = this.eng, pc = this.pc;
    const mine = this.summons.filter(s => s.kind === kind);
    if (op.limit === 1 && mine.length && kind !== 'clone') { const s = mine[0]; s.refresh(ctx); return s; }   // 편대·기사: 지금 것을 새로
    while (mine.length >= (op.limit || 1)) mine.shift().vanish(false);                                     // 흑랑 2·분신 1: 가장 오래된 것 교체
    const alive = eng.summons.filter(s => !s.dead); if (alive.length >= PAINT.summonCap) alive[0].vanish(false);
    const s = new PaintSummon(this, kind, op, ctx, p); eng.summons.push(s); pc.zone.actors.push(s); return s;
  }
  spot(base, r) {
    const pc = this.pc; if (!this.blocked(base.x, base.z, r)) return this.ground(base.x, base.z);
    for (let k = 1; k <= 8; k++) { const a = k * 0.785; const x = base.x + Math.cos(a) * 1.0, z = base.z + Math.sin(a) * 1.0; if (!this.blocked(x, z, r)) return this.ground(x, z); }
    return this.ground(pc.pos.x, pc.pos.z);
  }
  k_a1(op, ctx) { const s = this.spawn('wolf', op, ctx, this.spot(ctx.aim, 0.45)); this.sfx('pt_sketch'); return s; }
  k_a2(op, ctx) { const pc = this.pc, f = ctx.facing; const s = this.spawn('crane', op, ctx, this.ground(pc.pos.x - f.x * 0.8, pc.pos.z - f.z * 0.8)); this.sfx('pt_fold'); return s; }
  k_a3(op, ctx) { const s = this.spawn('knight', op, ctx, this.spot(ctx.aim, 0.5)); this.sfx('pt_sketch'); return s; }
  k_a4(op, ctx) {   // 분신: 대상 옆(나와 반대쪽)에 그려짐. 대상이 없으면 조준점
    const pc = this.pc, t = ctx.tgt && !ctx.tgt.dead ? ctx.tgt : null, c = t ? t.pos : ctx.aim, d = norm(c.x - pc.pos.x, c.z - pc.pos.z), side = { x: -d.z, z: d.x };
    const p = this.spot({ x: c.x - d.x * (t ? (t.radius || 0.5) + 0.9 : 0) + side.x * 0.8, z: c.z - d.z * (t ? (t.radius || 0.5) + 0.9 : 0) + side.z * 0.8 }, 0.4);
    const s = this.spawn('clone', op, ctx, p); s.model = t; s.target = t; this.sfx('pt_sketch'); return s;
  }
  k_a5(op, ctx) {   // 화룡점정: 눈을 찍는 순간(= 시전 완료) 용이 움직이기 시작 — 경로 관통(적마다 한 번) + 끝 먹물 숨결(적마다 한 번)
    const pc = this.pc, o = { ...pc.pos }, f = { ...ctx.facing }, done = new Set(), breathed = new Set(), kit = this, rec = { pierce: 0, breath: 0 }; ctx.a5 = rec;
    let len = op.len; for (let d = 1; d <= op.len; d += 0.5) if (this.blocked(o.x + f.x * d, o.z + f.z * d, 0.3)) { len = Math.max(2, d - 0.5); break; }   // 벽에서 숨결
    const fx = this.fx('dragon', o, { f, len, w: op.w, fly: op.fly, pre: ctx.ptCast }); this.castFx = null;
    this.sfx('pt_ink');
    const p = { s: 0, dead: false, update(dt) {
      if (this.dead) return; if (pc.dead) return this.dispose();
      const s0 = this.s; this.s = Math.min(len, this.s + len / op.fly * dt); call(fx, 'head', this.s);
      const hit = [];
      for (const t of kit.targets(HitShape.rect(o.x, o.z, f.x, f.z, op.w, this.s))) { if (done.has(t)) continue; done.add(t); rec.pierce++; if (kit.hit(t, op.pierce, ctx, { elem: 'ink' })) hit.push(t); }
      if (hit.length) { call(fx, 'pierce', hit.map(t => t.pos)); kit.impact(hit, f, false); kit.sfx('pt_bite'); }
      if (this.s >= len && s0 < len) {
        this.dead = true; const c = kit.ground(o.x + f.x * len, o.z + f.z * len), bh = [];
        for (const t of kit.targets(HitShape.circle(c.x, c.z, op.breath.r))) { if (breathed.has(t)) continue; breathed.add(t); rec.breath++; if (kit.hit(t, op.breath.coef, ctx, { elem: 'ink' })) bh.push(t); }
        call(fx, 'breath', c, { r: op.breath.r, hits: bh.map(t => t.pos) }); kit.impact(bh, f, true); kit.sfx('pt_ink');
      }
    }, dispose() { this.dead = true; call(fx, 'end'); } };
    this.things.push(p);
  }

  // ================================================================== B. 색채 연성술
  k_b1(op, ctx) {   // 진홍·임파스토: 붓질이 오른쪽에서 왼쪽으로 sweep 초 동안 지나감 — 대상마다 붓이 지나가는 순간에 피해
    const pc = this.pc, f = { ...ctx.facing }, o = { ...pc.pos }, half = op.ang / 2, rec = { hits: 0, times: [] }; ctx.b1 = rec;
    const fx = this.fx('impasto', pc, { f, r: op.r, ang: op.ang, sweep: op.sweep, pre: ctx.ptPre, act: ctx.act });
    const ts = this.targets(HitShape.cone(o.x, o.z, f.x, f.z, op.r, op.ang));
    if (!ts.length) { call(fx, 'miss'); return; }
    for (const t of ts) {
      const dx = t.pos.x - o.x, dz = t.pos.z - o.z, side = dx * f.z - dz * f.x, fwd = dx * f.x + dz * f.z, a = Math.atan2(side, Math.max(1e-3, fwd)) * 180 / Math.PI;   // + = 오른쪽
      const k = Math.min(1, Math.max(0, (half - a) / op.ang)), at = k * op.sweep;
      this.later(at, () => {
        if (pc.dead || t.dead || Math.hypot(t.pos.x - o.x, t.pos.z - o.z) > op.r + (t.radius || 0.5) + 0.6) return;
        const ok = this.hit(t, op.coef, ctx, { elem: 'fire' }); rec.hits++; rec.times.push(+(this.clock).toFixed(3));
        if (ok && !t.dead) { this.apply(t, 'burn', op.burnDur, op.burn, ctx.mult); this.color(t, 'red'); }
        call(fx, 'hit', t.pos, ok); if (ok) this.impact([t], f, false);
      });
    }
  }
  k_b2(op, ctx) {   // 청람·워터컬러: 낮은 파도가 앞으로 — 적마다 시전당 한 번, 벽에서 멈춤
    const pc = this.pc, o = { ...pc.pos }, f = { ...ctx.facing }, done = new Set(), kit = this; ctx.b2 = { hits: 0 };
    const fx = this.fx('wash', o, { f, len: op.len, w: op.w, speed: op.speed, pre: ctx.ptPre });
    const p = { s: 0.3, dead: false, update(dt) {
      if (this.dead) return; if (pc.dead) return this.dispose();
      const s0 = this.s; this.s = Math.min(op.len, this.s + op.speed * dt);
      if (kit.blocked(o.x + f.x * this.s, o.z + f.z * this.s, 0.3)) { this.s = s0; this.dead = true; call(fx, 'end'); return; }   // 벽에서 멈춤(그 너머는 안 맞음)
      call(fx, 'front', this.s);
      for (const t of kit.targets(HitShape.rect(o.x, o.z, f.x, f.z, op.w, this.s))) {
        if (done.has(t)) continue; done.add(t); ctx.b2.hits++;
        const ok = kit.hit(t, op.coef, ctx, { elem: 'water' });
        if (ok && !t.dead) { kit.apply(t, 'slow', op.slowDur, op.slow, ctx.mult); kit.color(t, 'blue'); }
        call(fx, 'splash', t.pos, ok);
      }
      if (this.s >= op.len) { this.dead = true; call(fx, 'end'); }
    }, dispose() { this.dead = true; call(fx, 'end'); } };
    this.things.push(p);
  }
  k_b3(op, ctx) {   // 황금·포인틸리즘: 처음 고른 자리에 고정 — 바깥 고리부터 안쪽으로, 마지막 가운데. 대상마다 최대 (고리 수 + 1)번
    const pc = this.pc, t0 = ctx.tgt && !ctx.tgt.dead ? ctx.tgt : null, c = t0 ? { x: t0.pos.x, y: t0.pos.y || 0, z: t0.pos.z } : this.ground(ctx.aim.x, ctx.aim.z);
    const rings = op.rings, rec = { hits: new Map(), bursts: 0 }; ctx.b3 = rec;
    const fx = this.fx('dots', c, { rings, n: op.dots, start: op.start, gap: op.gap, fin: op.fin, pre: ctx.ptPre });
    const burst = (r, coef, i, last) => {
      if (pc.dead) return; rec.bursts++; const hit = [];
      for (const t of this.targets(HitShape.circle(c.x, c.z, r))) { rec.hits.set(t, (rec.hits.get(t) || 0) + 1); if (this.hit(t, coef, ctx, { elem: 'light' })) { hit.push(t); if (!t.dead) this.color(t, 'yellow'); } }
      call(fx, last ? 'final' : 'burst', i, hit.map(t => t.pos)); this.sfx(last ? 'pt_ink' : 'pt_dot');
      if (last) this.impact(hit, ctx.facing, true); else if (hit.length) this.impact(hit, ctx.facing, false);
    };
    rings.forEach((r, i) => this.later(op.start + i * op.gap, () => burst(r, op.coef, i, false)));
    this.later(op.start + (rings.length - 1) * op.gap + op.fin.after, () => burst(op.fin.r, op.fin.coef, rings.length, true));
  }
  k_b4(op, ctx) {   // 팔레트 퓨전: 대상·둘레의 내 채색을 그 순간 모두 소비(중복 소비 없음), 기본 피해 + 색 조합마다 반응 하나(파생, 대상마다 시전당 한 번)
    const pc = this.pc, t0 = ctx.tgt && !ctx.tgt.dead ? ctx.tgt : null, c = t0 ? { ...t0.pos } : { ...ctx.aim };
    const ts = this.targets(HitShape.circle(c.x, c.z, op.r)), picks = ts.map(t => ({ t, cols: takeColors(t, this.owner) }));
    for (const p of picks) this.showColors(p.t);
    const reacted = new Set(), rec = { base: 0, kinds: [], reactions: 0 }; ctx.b4 = rec;
    const fx = this.fx('fusion', c, { r: op.r, picks: picks.map(p => ({ pos: p.t.pos, cols: p.cols })), pre: ctx.ptPre });
    const react = (t, coef) => { if (!t || t.dead || reacted.has(t)) return; reacted.add(t); rec.reactions++; this.log.reactions++; this.hit(t, coef, ctx, { derived: true, elem: 'paint' }); };
    const hit = [];
    for (const p of picks) { rec.base++; this.log.consumed += p.cols.length; if (this.hit(p.t, op.coef, ctx, { elem: 'paint' })) hit.push(p.t); }
    for (const p of picks) {
      const k = mixKind(p.cols), t = p.t; rec.kinds.push(k); if (k === 'none') continue;
      if (k === 'steam') { for (const x of this.targets(HitShape.circle(t.pos.x, t.pos.z, op.steam.r))) react(x, op.steam.coef); }
      else if (k === 'wave') { for (const x of this.targets(HitShape.circle(t.pos.x, t.pos.z, op.wave.r))) { this.apply(x, 'slow', op.wave.dur, op.wave.slow, 1); react(x, op.wave.coef); } }
      else if (k === 'core') react(t, op.core.coef);
      else if (k === 'tri') { react(t, op.tri.coef); for (const x of this.targets(HitShape.circle(t.pos.x, t.pos.z, op.steam.r))) react(x, op.tri.steam); for (const x of this.targets(HitShape.circle(t.pos.x, t.pos.z, op.wave.r))) this.apply(x, 'slow', op.wave.dur, op.tri.slow, 1); }
      call(fx, 'react', k, t.pos);
    }
    this.impact(hit, ctx.facing, rec.kinds.some(k => k !== 'none'));
  }
  k_b5(op, ctx) {   // 스펙트럼 걸작: 둘레 적의 내 채색을 거둬 그 종류·수로 강화한 파동(채색 없어도 기본). 풍경 영역마다 한 번(파생)
    const pc = this.pc, c = { ...pc.pos }, ts = this.targets(HitShape.circle(c.x, c.z, op.r)), kinds = new Set(); let count = 0;
    for (const t of ts) { const cols = takeColors(t, this.owner); count += cols.length; cols.forEach(x => kinds.add(x)); this.showColors(t); }
    this.log.consumed += count;
    const coef = spectrumCoef(op, kinds.size, count), hit = [], rec = { kinds: [...kinds], count, coef, land: 0 }; ctx.b5 = rec;
    const fx = this.fx('spectrum', pc, { r: op.r, kinds: [...kinds], count, pre: ctx.ptCast }); this.castFx = null;
    for (const t of ts) if (this.hit(t, coef, ctx, { elem: 'paint' })) hit.push(t);
    for (const t of hit) { if (t.dead) continue; if (kinds.has('red')) this.apply(t, 'burn', op.burnDur, op.burn, ctx.mult); if (kinds.has('blue')) this.apply(t, 'slow', op.slowDur, op.slow, 1); }
    if (kinds.has('yellow')) { for (const t of this.targets(HitShape.circle(c.x, c.z, op.core.r))) this.hit(t, op.core.coef, ctx, { derived: true, elem: 'light' }); call(fx, 'core', op.core.r); }
    const seen = new Set();
    for (const a of [...this.fields, ...this.walls]) {   // 풍경 영역마다 한 번(이 시전 안에서만) — 영역 안 적에게 파생 피해, 다른 영역으로 번지지 않음
      if (a.dead || seen.has(a.uid) || Math.hypot(a.c.x - c.x, a.c.z - c.z) > op.r + (a.r || a.w / 2 || 2)) continue; seen.add(a.uid); rec.land++;
      const sh = a.kind === 'wall' ? HitShape.circle(a.c.x, a.c.z, a.w / 2 + 0.8) : HitShape.circle(a.c.x, a.c.z, a.r);
      for (const t of this.targets(sh)) this.hit(t, op.land, ctx, { derived: true, elem: 'paint' });
      call(fx, 'land', a.c, a.kind === 'wall' ? a.w / 2 : a.r); call(a.fx, 'pulse');
    }
    this.impact(hit, ctx.facing, true); this.sfx('pt_mix');
  }

  // ================================================================== C. 현실이 되는 풍경화
  addField(o) { this.fields = this.fields.filter(x => !x.dead); const f = { uid: ++UID, dead: false, ready: !(o.grow > 0), maxLife: o.life, age: 0, ...o }; this.fields.push(f); return f; }
  endField(f) { if (f.dead) return; f.dead = true; call(f.fx, 'end'); }
  k_c1(op, ctx) {   // 꽃의 들판 (하나만)
    for (const f of this.fields) if (f.kind === 'meadow') this.endField(f);
    const c = this.ground(ctx.aim.x, ctx.aim.z), r = landscapeScale(op.r, this.passive('landscapeSize')), dur = landscapeScale(durL(op.dur, ctx.L), this.passive('landscapeTime'));
    const f = this.addField({ kind: 'meadow', c, r, life: dur + op.grow, grow: op.grow, tick: op.tick, next: 0, op, ctx, heals: 0 });
    f.fx = this.fx('meadow', c, { r, dur: f.life, grow: op.grow, extra: this.passive('landscapeSize') > 0 });
  }
  tickMeadow(f) {   // 회복은 틱마다 대상마다 한 번(꽃 수와 무관)
    const pc = this.pc, op = f.op, boost = this.gallery && this.gallery.t > 0 ? 1 + this.gallery.boost : 1, k = f.ctx.mult * boost, healed = [];
    if (!pc.dead && Math.hypot(pc.pos.x - f.c.x, pc.pos.z - f.c.z) <= f.r + 0.3) { pc.heal(pc.maxHp * op.heal * k * (1 + this.healPow())); healed.push(pc); }
    for (const s of this.eng.summons) if (s.living && !s.machine && !s.dead && Math.hypot(s.pos.x - f.c.x, s.pos.z - f.c.z) <= f.r + 0.3) { s.hp = Math.min(s.maxHp, s.hp + s.maxHp * op.heal * k); healed.push(s); }
    f.heals += healed.length; call(f.fx, 'pulse', healed.map(x => x.pos));
    if (healed.length) this.sfx('heal');
  }
  /** 성벽 계획: 늘어난 길이 -> 안 되면 원래 길이 -> 그래도 안 되면 이유 */
  wallPlan(d, op, aim) {
    const pc = this.pc, a = this.eng.groundAim(d, aim), dx = a.x - pc.pos.x, dz = a.z - pc.pos.z, m = Math.hypot(dx, dz);
    const f = m > 0.05 ? { x: dx / m, z: dz / m } : { ...pc.facing }, o = { portals: (pc.zone.def && pc.zone.def.portals) || [], allies: [pc, ...this.eng.summons.filter(s => !s.dead)] };
    const wBig = landscapeScale(op.width, this.passive('landscapeSize'));
    let err = sugarSpotError(pc.zone.geo, a, f, wBig, o); if (!err) return { c: a, f, w: wBig, err: null };
    if (wBig !== op.width) { const e2 = sugarSpotError(pc.zone.geo, a, f, op.width, o); if (!e2) return { c: a, f, w: op.width, err: null }; err = e2; }
    return { c: a, f, w: op.width, err };
  }
  k_c2(op, ctx) {   // 원근화법·백색 성벽 (최대 2 — 넘으면 가장 오래된 것 지움)
    const pc = this.pc, plan = this.wallPlan(ctx.d, op, ctx.aim); if (plan.err) { try { this.G.ui.toast(plan.err); } catch (e) { } return; }
    this.walls = this.walls.filter(w => !w.dead); while (this.walls.length >= op.limit) { this.endWall(this.walls[0], 'replace'); this.walls.shift(); }
    const geo = pc.zone.geo, f = plan.f, ang = Math.atan2(f.x, f.z) * 180 / Math.PI, uid = ++UID, tag = 'pwall:' + uid;
    const sp = pc.sheet && pc.sheet.final ? pc.sheet.final.shieldPower || 0 : 0, maxHp = Math.round(pc.maxHp * op.hp * ctx.mult * (1 + sp));
    const w = { uid, kind: 'wall', c: plan.c, f, w: plan.w, hp: maxHp, maxHp, life: landscapeScale(durL(op.life, ctx.L), this.passive('landscapeTime')), grow: op.grow, age: 0, tag, dead: false, chipT: 1, ctx, zone: pc.zone, blockedShots: 0 };
    geo.boxes.push({ x: w.c.x, z: w.c.z, hw: w.w / 2, hd: 0.3, yaw: ang, tag }); geo._grid = null;
    // 벽 자리에 있던 적은 자기 쪽으로 밀려남(갇히지 않음)
    for (const t of this.targets(HitShape.circle(w.c.x, w.c.z, w.w / 2 + 1))) {
      const sd = (t.pos.x - w.c.x) * f.x + (t.pos.z - w.c.z) * f.z, lat = Math.abs((t.pos.x - w.c.x) * -f.z + (t.pos.z - w.c.z) * f.x);
      if (lat > w.w / 2 + (t.radius || 0.5) || Math.abs(sd) > 0.3 + (t.radius || 0.5)) continue;
      const k = (sd >= 0 ? 1 : -1) * (0.35 + (t.radius || 0.5)) - sd, np = { x: t.pos.x + f.x * k, z: t.pos.z + f.z * k };
      if (!geo.blocked(np.x, np.z, t.radius || 0.4)) { t.pos.x = np.x; t.pos.z = np.z; }
    }
    w.fx = this.fx('wall', w.c, { f, w: w.w, grow: op.grow, life: w.life, extra: plan.w > op.width });
    this.walls.push(w);
    ctx.c2 = { w: w.w, hp: maxHp };
    return w;
  }
  endWall(w, why) { if (w.dead) return; w.dead = true; try { w.zone.geo.removeTag(w.tag); } catch (e) { } call(w.fx, 'end', why); if (why !== 'clear') this.sfx('pt_fold'); }
  damageWall(w, n) { if (w.dead) return; w.hp -= n; call(w.fx, 'crack', 1 - Math.max(0, w.hp) / w.maxHp); if (w.hp <= 0) this.endWall(w, 'break'); }
  /** 적 직선 투사체가 막혔을 때(actors.js Projectile): 근처 성벽이 받아 내구도를 깎음 */
  projBlocked(pos, proj) {
    let best = null, bd = 0.9; for (const w of this.walls) { if (w.dead) continue; const px = -w.f.z, pz = w.f.x, a = { x: w.c.x - px * w.w / 2, z: w.c.z - pz * w.w / 2 }, b = { x: w.c.x + px * w.w / 2, z: w.c.z + pz * w.w / 2 }, d = segDist(pos, a, b); if (d < bd) { bd = d; best = w; } }
    if (!best) return false; best.blockedShots++;
    const atk = proj && proj.owner && proj.owner.stat ? proj.owner.stat('atk') : 10; this.damageWall(best, Math.max(1, atk * (proj && proj.coef || 1))); call(best.fx, 'block', pos); return true;
  }
  tickWalls(dt) {
    for (const w of this.walls) {
      if (w.dead) continue; w.age += dt; w.life -= dt;
      if (w.life <= 0) { this.endWall(w, 'expire'); continue; }
      w.chipT -= dt; if (w.chipT > 0) continue; w.chipT = 1;
      const px = -w.f.z, pz = w.f.x, a = { x: w.c.x - px * w.w / 2, z: w.c.z - pz * w.w / 2 }, b = { x: w.c.x + px * w.w / 2, z: w.c.z + pz * w.w / 2 };
      for (const t of this.pc.zone.actors) if (t && !t.dead && t.faction !== 'player' && !t.isSummon && segDist(t.pos, a, b) <= (t.radius || 0.5) + 0.65) this.damageWall(w, Math.max(1, (t.stat ? t.stat('atk') : 10) * PAINT.wallChip));
    }
    this.walls = this.walls.filter(w => !w.dead);
  }
  k_c3(op, ctx) {   // 폭풍화·뇌운의 캔버스 (하나만): 비(틱마다 적마다 한 번) + 예고 뒤 번개(예고 자리 = 번개 자리)
    for (const f of this.fields) if (f.kind === 'storm') this.endField(f);
    const c = this.ground(ctx.aim.x, ctx.aim.z), r = landscapeScale(op.r, this.passive('landscapeSize')), dur = landscapeScale(durL(op.dur, ctx.L), this.passive('landscapeTime')), grow = 0.5;
    const f = this.addField({ kind: 'storm', c, r, life: dur + grow, grow, tick: op.rainTick, next: 0, boltT: 0.2, op, ctx, rains: 0, bolts: [] });
    f.fx = this.fx('storm', c, { r, dur: f.life, grow, extra: this.passive('landscapeSize') > 0 });
  }
  tickStorm(f) {
    const op = f.op, k = this.gallery && this.gallery.t > 0 ? 1 + this.gallery.boost : 1, hit = [];
    for (const t of this.targets(HitShape.circle(f.c.x, f.c.z, f.r))) if (this.hit(t, op.rain * k, f.ctx, { elem: 'water', derived: true })) hit.push(t);
    f.rains++; call(f.fx, 'rain', hit.map(t => t.pos));
  }
  /** 번개 하나 예약: 예고(warn 초) -> 같은 자리에 번개. 폭풍이 먼저 끝나면 취소 */
  bolt(f, pos, coef) {
    const op = f.op, p = this.ground(pos.x, pos.z), wf = this.fx('warn', p, { r: op.boltR, t: op.warn });
    f.bolts.push(p);
    this.later(op.warn, () => {
      if (f.dead || this.pc.dead) { call(wf, 'cancel'); return; }
      const k = this.gallery && this.gallery.t > 0 ? 1 + this.gallery.boost : 1, hit = [];
      for (const t of this.targets(HitShape.circle(p.x, p.z, op.boltR))) if (this.hit(t, coef * k, f.ctx, { elem: 'shock' })) hit.push(t);
      this.log.bolts++; call(f.fx, 'bolt', p, hit.map(t => t.pos)); call(wf, 'strike'); this.sfx('pt_bolt');
      if (hit.length) this.impact(hit, f.ctx.facing, false);
    });
  }
  boltSpot(f) {   // 안의 적(가운데에 가까운 순으로 돌아가며), 없으면 범위 안 아무 곳
    const ts = this.targets(HitShape.circle(f.c.x, f.c.z, f.r)).sort((a, b) => Math.hypot(a.pos.x - f.c.x, a.pos.z - f.c.z) - Math.hypot(b.pos.x - f.c.x, b.pos.z - f.c.z));
    if (ts.length) { const t = ts[(f.bolts.length) % ts.length]; return { x: t.pos.x, z: t.pos.z }; }
    const a = rnd(0, 6.283), rr = Math.sqrt(rnd(0, 1)) * f.r * 0.85; return { x: f.c.x + Math.cos(a) * rr, z: f.c.z + Math.sin(a) * rr };
  }
  tickFields(dt) {
    for (const f of this.fields) {
      if (f.dead) continue; f.life -= dt; f.age += dt;
      if (!f.ready && f.age >= f.grow) f.ready = true;
      if (f.life <= 0) { this.endField(f); continue; }
      if (!f.ready) continue;
      if (f.kind === 'storm') { f.boltT -= dt; if (f.boltT <= 0 && f.life > f.op.warn) { f.boltT += f.op.boltEvery; this.bolt(f, this.boltSpot(f), f.op.bolt); } }
      f.next -= dt; if (f.next > 0) continue; f.next += f.tick;
      if (f.kind === 'meadow') this.tickMeadow(f); else if (f.kind === 'storm') this.tickStorm(f);
    }
    this.fields = this.fields.filter(f => !f.dead);
  }
  /** 지금 있는 작품(만상갤러리 대상): 내 풍경·성벽·그림 소환물, range m 안 */
  works(range = 20) {
    const pc = this.pc, near = p => Math.hypot(p.x - pc.pos.x, p.z - pc.pos.z) <= range, out = [];
    for (const f of this.fields) if (!f.dead && near(f.c)) out.push({ kind: f.kind, pos: f.c, ref: f });
    for (const w of this.walls) if (!w.dead && near(w.c)) out.push({ kind: 'wall', pos: w.c, ref: w });
    for (const s of this.summons) if (s.zone === pc.zone && near(s.pos)) out.push({ kind: 'summon', pos: s.pos, ref: s });
    return out;
  }
  k_c5(op, ctx) {   // 만상갤러리: 시전 순간 있는 작품마다 한 번
    const pc = this.pc, works = this.works(op.range), rec = { heal: 0, repair: 0, bolts: 0, summons: 0 }; ctx.c5 = rec;
    const fx = this.fx('gallery', pc, { works: works.map(w => w.pos), pre: ctx.ptCast }); this.castFx = null;
    for (const w of works) {
      if (w.kind === 'meadow') {   // 즉시 회복 파동 한 번
        const f = w.ref, healed = [];
        if (!pc.dead && Math.hypot(pc.pos.x - f.c.x, pc.pos.z - f.c.z) <= f.r + 0.3) { pc.heal(pc.maxHp * op.heal * ctx.mult * (1 + this.healPow())); healed.push(pc); }
        for (const s of this.eng.summons) if (s.living && !s.machine && !s.dead && Math.hypot(s.pos.x - f.c.x, s.pos.z - f.c.z) <= f.r + 0.3) { s.hp = Math.min(s.maxHp, s.hp + s.maxHp * op.heal * ctx.mult); healed.push(s); }
        rec.heal += healed.length; call(f.fx, 'pulse', healed.map(x => x.pos)); call(f.fx, 'gallery');
      } else if (w.kind === 'wall') { const x = w.ref, before = x.hp; x.hp = Math.min(x.maxHp, x.hp + x.maxHp * op.repair); rec.repair += x.hp - before; call(x.fx, 'crack', 1 - x.hp / x.maxHp); call(x.fx, 'gallery'); }
      else if (w.kind === 'storm') { this.bolt(w.ref, this.boltSpot(w.ref), op.bolt); rec.bolts++; call(w.ref.fx, 'gallery'); }
      else if (w.kind === 'summon') rec.summons++;
    }
    // 소환물 공격 강화 + 풍경 강화: 다시 써도 max(더하지 않음), 끝나면 정확히 원래대로
    const dur = durL(op.dur, ctx.L), val = Math.min(PAINT.galleryCap, op.summonAtk * ctx.mult);
    if (this.gallery && this.gallery.t > 0) { this.gallery.t = Math.max(this.gallery.t, dur); this.gallery.val = Math.max(this.gallery.val, val); this.gallery.boost = Math.max(this.gallery.boost, op.boost); }
    else this.gallery = { t: dur, val, boost: op.boost };
    for (const s of this.summons) { s.galleryAtk = this.gallery.val; call(s.view, 'gallery', true); }
    this.sfx('pt_frame');
  }

  // ------------------------------------------------------------------ frame
  tick(dt) {
    for (const t of this.timers.slice()) { t.t -= dt; if (t.t <= 0) { this.timers.splice(this.timers.indexOf(t), 1); try { t.f(); } catch (e) { console.error('paint timer', e); } } }
    for (const p of this.things) p.update(dt);
    this.things = this.things.filter(p => !p.dead);
    this.tickFields(dt); this.tickWalls(dt);
    if (this.gallery) { this.gallery.t -= dt; if (this.gallery.t <= 0) { for (const s of this.eng.summons) if (s.galleryAtk) { s.galleryAtk = 0; call(s.view, 'gallery', false); } this.gallery = null; } }
    for (const t of this.colored) { if (tickColors(t, dt) || t.dead) this.showColors(t); if (!t._ptc) { this.colored.delete(t); if (t._ptcFx) { call(t._ptcFx, 'end'); t._ptcFx = null; } } }
  }
  clear() {
    for (const t of this.things) t.dispose && t.dispose();
    for (const f of this.fields) this.endField(f);
    for (const w of this.walls) this.endWall(w, 'clear');
    for (const t of this.colored) { if (t._ptc) delete t._ptc[this.owner]; if (t._ptc && !Object.keys(t._ptc).length) t._ptc = null; if (t._ptcFx) { call(t._ptcFx, 'end'); t._ptcFx = null; } }
    for (const s of this.eng.summons) if (s.galleryAtk) s.galleryAtk = 0;
    if (this.castFx) call(this.castFx, 'cancel');
    this.reset();
  }
}

// ------------------------------------------------------------------ 그림 소환물 (zone.actors 안에서 움직임, faction player)
let SUID = 0;
const KIND = {
  wolf: { r: 0.45 },     // 묵수·흑랑: 추적·물기 + 주기적 짧은 돌진(관통, 적마다 한 번)
  crane: { r: 0.4 },     // 비화·채색군학: 편대(하나의 소환물) — 대상 둘레를 돌며 깃털, 차례로 급강하
  knight: { r: 0.55 },   // 유화·팔레트 기사: 도발(보스 제외) + 앞쪽 부채꼴 크게 베기
  clone: { r: 0.45 },    // 크로키·잔상 모사: 정해진 능력치, 기본 공격 + 짧은 돌진
};
export class PaintSummon {
  constructor(kit, kind, op, ctx, p) {
    const pc = kit.pc; this.kit = kit; this.eng = kit.eng; this.kind = kind; this.o = op; this.ctx = ctx; this.zone = pc.zone; this.uid = 'p' + (++SUID);
    this.pos = { x: p.x, y: p.y || 0, z: p.z }; this.radius = KIND[kind].r; this.faction = 'player'; this.isSummon = true; this.painted = true; this.living = true; this.machine = false;
    this.taunt = kind === 'knight'; this.noBossTaunt = true; this.fly = kind === 'crane';
    this.status = new StatusSet(); this.shield = 0; this.dead = false; this.invuln = 0; this.knock = { x: 0, z: 0 }; this.galleryAtk = 0;
    this.facing = { ...ctx.facing }; this.target = null; this.think = 0; this.t = 0; this.moved = 0; this.dash = null; this.diveT = {}; this.log = { hits: 0, bites: 0, dashes: 0, feathers: 0, dives: 0, swings: 0, maxPerTarget: 0 };
    this.setup(ctx);
    this.view = kit.fx(kind, this, { draw: this.drawT, model: ctx.tgt, n: op.n });
  }
  setup(ctx) {
    const op = this.o, pc = this.kit.pc; this.ctx = ctx;
    this.maxHpV = Math.max(10, pc.maxHp * (op.hp || 0.5) * ctx.mult); this.hp = this.maxHpV;   // 고정 소환 능력치(주인 기준) — 분신도 대상의 체력을 복사하지 않음
    this.life = durL(op.life || 10, ctx.L); this.drawT = op.draw || 0.6; this.age = 0; this.cd = 0; this.dashCd = op.dash ? op.dash.every * 0.5 : 0; this.diveCd = op.dive ? op.dive.every * 0.6 : 0; this.orbit = 0;
  }
  /** 다시 그림(1개짜리): 시간·체력을 새로 — 자리·행동은 그대로 */
  refresh(ctx) { const age = this.age; this.setup(ctx); this.age = Math.max(age, this.drawT); if (this.view && this.view.refresh) this.view.refresh(); }
  get maxHp() { return this.maxHpV; }
  get ready() { return this.age >= this.drawT; }
  stat(s) { const pc = this.kit.pc; if (s === 'def') return pc.stat('def') * 0.6; if (s === 'dmgReduce') return 0; if (s === 'moveSpeed') return (PAINT.speed[this.kind] || 4.5) * (1 + this.status.bonus('moveSpeed')) * this.status.slow; return pc.stat(s); }
  get stunned() { return this.status.stunned; }
  dist(o) { return Math.hypot(this.pos.x - o.pos.x, this.pos.z - o.pos.z); }
  takeDamage(d) {
    if (this.dead || d.missed || this.kind === 'crane' && !this.ready) return; const a = Math.max(0, d.amount || 0); this.hp -= a;
    try { this.kit.G.ui.floatText(this.pos, Math.round(a) + '', '#ffb0b0', 0.8); } catch (e) { }
    if (this.view && this.view.hurt) this.view.hurt();
    if (this.hp <= 0) this.vanish(false);
  }
  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }
  addShield() { }
  setFacing(x, z) { const m = Math.hypot(x, z); if (m > 1e-4) this.facing = { x: x / m, z: z / m }; }
  get body() { return null; }
  get xz() { return this.pos; }
  destroy() { this.vanish(false); }
  vanish(silent) {
    if (this.dead) return; this.dead = true; this.hp = 0;
    const i = this.zone.actors.indexOf(this); if (i >= 0) this.zone.actors.splice(i, 1);
    if (this.view) { if (silent && this.view.dispose) this.view.dispose(); else if (this.view.erase) this.view.erase(); else if (this.view.dispose) this.view.dispose(); }
  }
  enemies() { return this.zone.actors.filter(c => c && !c.dead && c.faction !== 'player' && !c.isSummon); }
  hitTarget(t, coef, extra = {}) {
    const ctx = { ...this.ctx, mult: this.ctx.mult * (1 + Math.min(PAINT.galleryCap, this.galleryAtk || 0)) };
    this.eng.dmg(t, coef, ctx, { quiet: true, ...extra }); this.log.hits++;
    return !ctx.missed;
  }
  update(dt) {
    if (this.dead) return;
    const pc = this.kit.pc; this.t += dt; this.age += dt; this.life -= dt;
    if (this.life <= 0 || pc.dead || pc.zone !== this.zone) return this.vanish(pc.zone !== this.zone);
    this.status.tick(dt, s => { if (!this.dead) this.takeDamage({ amount: Math.max(1, s.value), dot: true }); }, s => this.heal(s.value));
    if (this.dead) return;
    if (this.dist(pc) > PAINT.leash || Math.abs((pc.pos.y || 0) - (this.pos.y || 0)) > 1.2) {   // 너무 멀거나 높이가 다르면(보스 결계) 주인 곁에 다시 그려짐
      const f = pc.facing, p = this.kit.spot({ x: pc.pos.x - f.x * 1.2 + f.z * 0.8, z: pc.pos.z - f.z * 1.2 - f.x * 0.8 }, this.radius);
      this.pos = { x: p.x, y: p.y, z: p.z }; this.age = Math.min(this.age, this.drawT - PAINT.redraw); this.target = null; this.dash = null; if (this.view && this.view.redraw) this.view.redraw(); this.log.redraw = (this.log.redraw || 0) + 1;
    }
    this.moving = false;
    if (this.ready && !this.stunned) {
      this.cd -= dt; this.think -= dt; this.dashCd -= dt; this.diveCd -= dt;
      if (this.think <= 0 || !this.target || this.target.dead) { this.think = PAINT.think; this.target = this.pick(); }
      if (this.kind === 'crane') this.upCrane(dt); else if (this.dash) this.upDash(dt); else this.upGround(dt);
    }
    if (this.view && this.view.sync) this.view.sync(this);
  }
  pick() { const pc = this.kit.pc, ot = pc.target && !pc.target.dead ? pc.target : null; return pickTarget(this.pos, this.enemies(), this.kind === 'crane' ? this.o.range : 9, ot); }
  upGround(dt) {
    const o = this.o, t = this.target, pc = this.kit.pc, reach = this.kind === 'knight' ? o.range : o.range;
    if (!t) { if (this.dist(pc) > 2.6) this.walk({ x: pc.pos.x - pc.facing.x * 1.4 + pc.facing.z * 1.2, z: pc.pos.z - pc.facing.z * 1.4 - pc.facing.x * 1.2 }, dt); return; }
    const d = this.dist(t) - (t.radius || 0.5);
    if (o.dash && this.dashCd <= 0 && d > 1.4 && d < o.dash.dist + 1) { this.startDash(t); return; }   // 짧은 돌진: 공격과 다른 동작·판정
    if (d > reach) { this.walk(t.pos, dt); return; }
    this.face(t.pos); if (this.cd > 0) return;
    if (this.kind === 'knight') {   // 앞쪽 부채꼴 크게 베기 — 적마다 한 번, 최대 maxT
      this.cd = o.rate; const f = this.facing, hit = [];
      const ts = this.eng.targets(HitShape.cone(this.pos.x, this.pos.z, f.x, f.z, o.r, o.ang)).sort((a, b) => this.dist(a) - this.dist(b)).slice(0, o.maxT);
      for (const x of ts) if (this.hitTarget(x, o.swing, { elem: 'paint' })) hit.push(x);
      this.log.swings++; if (this.view && this.view.swing) this.view.swing({ f, r: o.r, ang: o.ang, hits: hit.map(x => x.pos) }); this.kit.sfx('pt_brush');
      for (const x of hit) if (x.body && x.body.punch) x.body.punch(f.x, f.z, 0.14);
    } else {   // 흑랑 물기 / 분신 기본 공격
      this.cd = o.rate; const ok = this.hitTarget(t, this.kind === 'wolf' ? o.bite : o.atk, { elem: 'ink' });
      if (this.kind === 'wolf') this.log.bites++;
      if (this.view && this.view.attack) this.view.attack(t, ok); this.kit.sfx('pt_bite');
      if (ok && t.body && t.body.punch) t.body.punch(this.facing.x, this.facing.z, 0.1);
    }
  }
  startDash(t) {
    const o = this.o.dash, f = norm(t.pos.x - this.pos.x, t.pos.z - this.pos.z); this.face(t.pos);
    this.dash = { f, from: { ...this.pos }, s: 0, dist: Math.min(o.dist, this.dist(t) + 1.2), done: new Set(), dur: 0.26 }; this.dashCd = o.every; this.log.dashes++;
    if (this.view && this.view.dash) this.view.dash(f, this.dash.dist);
  }
  upDash(dt) {   // 짧은 돌진: 지나가는 길의 적을 한 번씩(돌진 판정 = 폭 w 직선), 지형에 막히면 멈춤
    const D = this.dash, o = this.o.dash, step = D.dist / D.dur * dt, before = { ...this.pos };
    this.step(D.f.x * step, D.f.z * step); D.s += step;
    for (const x of this.eng.targets(HitShape.rect(D.from.x, D.from.z, D.f.x, D.f.z, o.w, D.s + 0.4))) { if (D.done.has(x)) continue; D.done.add(x); this.hitTarget(x, o.coef, { elem: 'ink' }); if (this.view && this.view.dashHit) this.view.dashHit(x.pos); }
    if (D.s >= D.dist || Math.hypot(this.pos.x - before.x, this.pos.z - before.z) < step * 0.2) { this.dash = null; this.cd = Math.max(this.cd, 0.35); }
  }
  upCrane(dt) {   // 편대: 대상이 있으면 그 둘레를 돌고, 없으면 주인 뒤를 따름. 깃털 = 편대 기준 총 계수를 깃털 수로 나눔
    const o = this.o, pc = this.kit.pc, t = this.target; this.orbit += dt * 1.6;
    const c = t ? t.pos : { x: pc.pos.x - pc.facing.x * 1.4, z: pc.pos.z - pc.facing.z * 1.4 }, R = t ? 2.9 : 0.6;
    const want = { x: c.x + Math.cos(this.orbit) * R, z: c.z + Math.sin(this.orbit) * R }, dx = want.x - this.pos.x, dz = want.z - this.pos.z, m = Math.hypot(dx, dz);
    if (m > 0.05) { const k = Math.min(m, PAINT.speed.crane * dt); this.pos = { x: this.pos.x + dx / m * k, y: this.kit.ground(this.pos.x, this.pos.z).y, z: this.pos.z + dz / m * k }; this.moving = true; }
    if (!t) return; this.face(t.pos);
    if (this.cd <= 0 && this.dist(t) - (t.radius || 0.5) <= o.range) {
      this.cd = o.rate; const n = Math.min(o.n, o.hits || o.n), per = o.feather / n; let landed = 0;   // 깃털 타수 = hits(편대 기준, 학 수와 무관)
      for (let i = 0; i < n; i++) { this.log.feathers++; this.kit.later(0.18 + i * 0.03, () => { if (this.dead || t.dead) return; if (this.hitTarget(t, per, { elem: 'ink' })) landed++; }); }
      this.log.maxPerTarget = Math.max(this.log.maxPerTarget, n);
      if (this.view && this.view.feathers) this.view.feathers(t, n); void landed;
    }
    if (this.diveCd <= 0) {   // 급강하: 한 번에 한 마리, 대상마다 dive.per 초에 한 번
      const key = t.uid || t.id || 'x', last = this.diveT[key] ?? -99;
      if (this.t - last >= o.dive.per) { this.diveCd = o.dive.every; this.diveT[key] = this.t; this.log.dives++; const idx = this.log.dives % o.n;
        if (this.view && this.view.dive) this.view.dive(t, idx); this.kit.later(0.3, () => { if (!this.dead && !t.dead) { const ok = this.hitTarget(t, o.dive.coef, { elem: 'ink' }); if (ok && t.body && t.body.punch) t.body.punch(0, 0.01, 0.12); } }); }
    }
  }
  walk(p, dt) { const dx = p.x - this.pos.x, dz = p.z - this.pos.z, m = Math.hypot(dx, dz); if (m < 0.2) return; this.face(p); this.moving = true; const k = Math.min(m, this.stat('moveSpeed') * dt); this.step(dx / m * k, dz / m * k); }
  step(dx, dz) {
    const geo = this.zone.geo, before = { ...this.pos };
    const n = geo.move ? geo.move(this.pos, dx, dz, this.radius) : { x: this.pos.x + dx, y: this.pos.y, z: this.pos.z + dz };
    this.pos = { x: n.x, y: n.y != null ? n.y : this.pos.y, z: n.z }; const mv = Math.hypot(this.pos.x - before.x, this.pos.z - before.z); this.moved += mv;
    if (mv < Math.hypot(dx, dz) * 0.1) { this._stuck = (this._stuck || 0) + 0.016; if (this._stuck > 1.5) { const pc = this.kit.pc; const p = this.kit.spot({ x: pc.pos.x - pc.facing.x, z: pc.pos.z - pc.facing.z }, this.radius); this.pos = { x: p.x, y: p.y, z: p.z }; this._stuck = 0; } } else this._stuck = 0;
  }
  face(p) { const dx = p.x - this.pos.x, dz = p.z - this.pos.z, m = Math.hypot(dx, dz); if (m > 1e-3) this.facing = { x: dx / m, z: dz / m }; }
}

// ------------------------------------------------------------------ 툴팁(스킬 창 현재/다음 레벨): 실제 op 값으로 계산 (js/skillui.js levelText)
const pct = v => (Math.round(v * 1000) / 10).toString().replace(/\.0$/, '') + '%';
const sec = v => (Math.round(v * 10) / 10).toString() + '초';
export function paintText(d, L, pass = {}) {
  const ult = d.type === 'ultimate', m = 1 + (ult ? 0.25 : 0.12) * (L - 1), o = (d.ops || []).find(x => x.fn === 'paint' && x.k !== 'pre'), out = [];
  const D = v => sec(durL(v, L)), sz = pass.size || 0, tm = pass.time || 0;
  if (!o) { if (d.flags && d.flags.landscapeSize) { const v = d.flags.landscapeSize; out.push(`풍경 크기·지속 시간 +${pct(v[0] + v[1] * (L - 1))}(생성 순간 한 번)`); } return out.join(' · '); }
  switch (o.k) {
    case 'a1': out.push(`물기 ${pct(o.bite * m)}/${sec(o.rate)}`, `돌진 ${pct(o.dash.coef * m)}(${o.dash.dist} m, ${sec(o.dash.every)}마다)`, `${D(o.life)} · 최대 ${o.limit}마리 · 그리는 시간 ${sec(o.draw)}`); break;
    case 'a2': out.push(`깃털 ${o.hits || o.n}발 합계 ${pct(o.feather * m)}/${sec(o.rate)}(편대 기준)`, `급강하 ${pct(o.dive.coef * m)}/${sec(o.dive.every)}(대상마다 ${sec(o.dive.per)}에 한 번)`, `${D(o.life)} · 다시 쓰면 갱신`); break;
    case 'a3': out.push(`베기 ${pct(o.swing * m)}/${sec(o.rate)} · 부채꼴 ${o.r} m ${o.ang}° 최대 ${o.maxT}명`, '일반 몬스터 도발(보스 제외)', `${D(o.life)} · 체력 내 최대 HP의 ${pct(o.hp * m)}`); break;
    case 'a4': out.push(`공격 ${pct(o.atk * m)}/${sec(o.rate)} · 돌진 ${pct(o.dash.coef * m)}(${sec(o.dash.every)}마다)`, `고정 능력치 · 체력 내 최대 HP의 ${pct(o.hp * m)}`, D(o.life)); break;
    case 'a5': out.push(`관통 ${pct(o.pierce * m)}(${o.len} m × ${o.w} m, 적마다 1번)`, `먹물 숨결 ${pct(o.breath.coef * m)}(반경 ${o.breath.r} m, 적마다 1번)`); break;
    case 'b1': out.push(`부채꼴 ${o.r} m ${o.ang}° · ${pct(o.coef * m)}`, `화상 ${sec(o.burnDur)} · 빨강 채색`); break;
    case 'b2': out.push(`파도 ${o.len} m × ${o.w} m · ${pct(o.coef * m)}(적마다 1번)`, `둔화 ${pct(o.slow * m)} ${sec(o.slowDur)} · 파랑 채색`); break;
    case 'b3': out.push(`고리 ${o.rings.length}번 × ${pct(o.coef * m)}(바깥 ${o.rings[0]} m → 안쪽) + 가운데 ${pct(o.fin.coef * m)}(${o.fin.r} m)`, '처음 자리에 고정 · 맞을 때마다 노랑 채색'); break;
    case 'b4': out.push(`반경 ${o.r} m · 기본 ${pct(o.coef * m)}`, `빨+파 증기 ${pct(o.steam.coef * m)} · 파+노 둔화 파동 ${pct(o.wave.slow)} · 노+빨 일격 ${pct(o.core.coef * m)} · 세 색 ${pct(o.tri.coef * m)}`, '내 채색만 소비 · 반응은 대상마다 1번'); break;
    case 'b5': out.push(`반경 ${o.r} m · 기본 ${pct(o.coef * m)}`, `색 종류마다 +${pct(o.perKind)} · 채색 하나마다 +${pct(o.perCount)}(최대 ${o.countCap}개)`, `빨강 화상 · 파랑 둔화 · 노랑 가운데 ${pct(o.core.coef * m)}`, `풍경마다 ${pct(o.land * m)} 한 번`); break;
    case 'c1': out.push(`반경 ${fmtM(landscapeScale(o.r, sz))} m · ${sec(o.tick)}마다 최대 HP의 ${pct(o.heal * m)} 회복(나·생명 소환물)`, `지속 ${sec(landscapeScale(durL(o.dur, L), tm))}`); break;
    case 'c2': out.push(`길이 ${fmtM(landscapeScale(o.width, sz))} m · 내구도 최대 HP의 ${pct(o.hp * m)}`, `지속 ${sec(landscapeScale(durL(o.life, L), tm))} · 최대 ${o.limit}개`, '적 이동·직선 투사체 차단'); break;
    case 'c3': out.push(`반경 ${fmtM(landscapeScale(o.r, sz))} m · 비 ${pct(o.rain * m)}/${sec(o.rainTick)}`, `번개 ${pct(o.bolt * m)}/${sec(o.boltEvery)}(예고 ${sec(o.warn)})`, `지속 ${sec(landscapeScale(durL(o.dur, L), tm))}`); break;
    case 'c5': out.push(`들판 회복 파동 ${pct(o.heal * m)} · 성벽 내구도 +${pct(o.repair)} · 뇌운 추가 번개 ${pct(o.bolt * m)}`, `그림 소환물 공격 +${pct(Math.min(PAINT.galleryCap, o.summonAtk * m))} ${D(o.dur)}(겹치지 않음)`, '작품이 없으면 쓸 수 없음'); break;
  }
  return out.join(' · ');
}
const fmtM = v => (Math.round(v * 10) / 10).toString();
