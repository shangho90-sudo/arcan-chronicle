// 대장장이 1차 전투 규칙 (2026-11-13 전면 개편, 2026-11-19 즉석 리벳 → 튕김망치): 가열·급랭, 모루, 집게, 단조 낙인, 접이식 철벽, 튕김망치, 장인의 박자, 충격 재활용, 고철.
// 스킬 데이터는 tools/skills2/gen.py (bs1_*), 실행은 js/skillrt.js 가 이 파일의 SmithKit 을 부름(eng.smith). 화면은 js/smithfx.js.
// 이 파일은 렌더링을 직접 하지 않음 — fx(kind, a, o) 가 null 을 돌려줘도(메시 로딩 전·테스트) 규칙은 그대로 동작.
//
// 되풀이 방지 규칙 한 가지: '파생 피해'(derived) = 모루 충격파 · 모루 충돌 · 급랭 번짐 · 낙인 파괴 · 충격 방출.
//   파생 피해는 ① 가열을 쌓거나 식히지 않고 ② 낙인 타수로 세지 않고 ③ 모루를 울리지 않고 ④ 충격을 충전하지 않는다.
//   (충격 충전은 적의 공격을 철벽이 실제로 줄였을 때만 일어나므로 내 피해로는 애초에 충전되지 않음. 방출은 강화 기본 공격 또는 튕김망치의
//    직접 타격이 실제로 맞은 순간 한 번 — 충격파·빗나감·모루만 맞힘으로는 나가지 않음.)
export const SMITH = {
  heat: { max: 3, dur: 5 },                       // 가열: 최대 3중첩, 5초. 더할 때마다 시간을 5초로 다시 채움(중첩은 3에서 멈춤)
  brandGap: 0.1,                                  // 낙인 타수: 같은 순간의 겹친 판정은 한 번으로(초)
  tempo: { window: 4 },                           // 장인의 박자: 스킬을 쓴 뒤 이 시간 안의 다음 기본 공격 1회
  recycle: { hold: 8 },                           // 충격 재활용: 마지막으로 모은 뒤 이 시간이 지나면 사라짐
  scrap: { max: 3, window: 10, shieldDur: 4 },    // 고철: 10초에 3개까지, 보호막은 겹치지 않음(더 큰 쪽)
  wallFront: 0.2,                                 // 철벽: 공격자가 정면 쪽(내적 > 0.2)일 때만 줄임
  stop: 0.06, kick: [0.1, 0.1],                   // 접촉 순간: 시전자·대상만 멈춤(초), 카메라 밀림 [m, 초]
  stopHeavy: 0.08, kickHeavy: [0.14, 0.12],
  anvilHit: 0.55,                                 // 모루의 맞는 크기(반지름 m) — 망치 판정이 여기에 닿아야 울림
  anvilTop: 0.74,                                 // 모루 윗면 높이(m, fx_smith.py smith_anvil) — 튕김망치가 닿는 점
  // 튕김망치(bs1_b4): w = 날아가는 망치의 반폭(m, 조준선 판정), mobileW = 휴대폰에서 '조준선 위의 모루'로 볼 여유 폭(m),
  // behind = 휴대폰: 모루가 겨눈 적보다 이만큼 뒤에 있어도 겹친 것으로 봄(m), reach = 직선 비행의 최대 거리 여유(m, 사거리 +),
  // retarget = 튀어 떨어지는 중 대상이 쓰러지면 남은 비행 시간(초), dropT = 바닥에 떨어져 사라지는 데 걸리는 시간(초)
  throw: { w: 0.3, mobileW: 0.6, behind: 1.5, reach: 1.2, retarget: 0.24, dropT: 0.45 },
  quench: { sway: 0.26 },                         // 급랭: 일반 적이 물을 맞고 휘청이는 눌림 크기(그림만 — 실제 제어는 둔화)
};
// 화면 문구(ui.impactText): 낙인 균열 '팅' · 파괴 '쨍!' · 모루 '깡!' · 망치 직격 '쾅!' · 급랭 '치이익!'
export const SMITH_SHOUT = {
  crack: { word: '팅', col: '#ffd9c8', edge: '#5a1408', size: 0.78 },
  shatter: { word: '쨍!', col: '#fff2e6', edge: '#8a1008', size: 1.3 },
  clang: { word: '깡!', col: '#fff4d0', edge: '#5a3000', size: 1.15 },
  bonk: { word: '쾅!', col: '#ffd27a', edge: '#5a2200', size: 1.15 },
  sizzle: { word: '치이익!', col: '#ffffff', edge: '#3a4a5a', size: 0.9, per: 0.15 },
};
const fold = L => 1 + 0.06 * Math.floor((Math.max(1, L) - 1) / 2);   // 일반 규칙의 레벨 추가타 몫(한 방에 합침)
const call = (h, m, ...a) => { try { return h && h[m] ? h[m](...a) : null; } catch (e) { console.warn('smithfx', m, e); return null; } };

/** 가열 더하기(순수): 상태 목록에 n중첩을 더하고 시간을 갱신, 지금 중첩 수를 돌려줌 */
export function stackHeat(status, def, n, source, H = SMITH.heat) {
  const s = status.get('heat');
  if (s) { s.value = Math.min(H.max, (s.value || 0) + n); s.remaining = s.duration = H.dur; if (source) s.source = source; return s.value; }
  status.apply(def, H.dur, Math.min(H.max, n), source); const a = status.get('heat'); return a ? a.value : 0;
}
/** 피격 한 번을 철벽으로 줄임(순수). st = { wall: {val}|null, front } -> { amount, reduced } */
export function guardHit(st, amount) {
  const red = st.wall && st.front ? amount * st.wall.val : 0;
  return { amount: amount - red, reduced: red };
}
/** 던진 망치의 조준선(순수): o 에서 f 방향으로 R m. 가장 먼저 닿는 것 = { kind: 'enemy', t } | { kind: 'anvil' } | { kind: 'none' }.
 *  anvil = { x, z } | null(없거나 아직 떨어지는 중), enemies = [{ pos, radius }]. mobile: 조준선 위에(여유 폭 mobileW) 모루가 있고 그 모루가
 *  겨눈 적과 겹치면(적보다 behind m 뒤까지) 모루를 먼저 — 모루가 조준선 옆이면 적에게 곧장. */
export function throwPlan(o, f, R, anvil, enemies, mobile, T = SMITH.throw, AH = SMITH.anvilHit) {
  const lineOf = (p) => { const dx = p.x - o.x, dz = p.z - o.z; return { al: dx * f.x + dz * f.z, la: Math.abs(dx * f.z - dz * f.x) }; };
  let best = null;
  for (const t of enemies) { const r = t.radius || 0.5, L = lineOf(t.pos); if (L.al > 0 && L.al <= R + r && L.la <= r + T.w && (!best || L.al < best.al)) best = { kind: 'enemy', t, al: L.al }; }
  if (anvil) {
    const L = lineOf(anvil);
    if (L.al > 0.2 && L.al <= R + AH) {
      if (L.la <= AH + T.w && (!best || L.al < best.al)) return { kind: 'anvil', al: L.al };
      if (mobile && L.la <= AH + T.w + T.mobileW && (!best || L.al <= best.al + T.behind)) return { kind: 'anvil', al: L.al };
    }
  }
  return best || { kind: 'none', al: R };
}
/** 장애물 너머인지: 두 점 사이를 0.3 m씩 걸으며 지형 충돌을 봄 */
export function clearLine(geo, a, b, r = 0.15) {
  const dx = b.x - a.x, dz = b.z - a.z, m = Math.hypot(dx, dz), n = Math.max(1, Math.ceil(m / 0.3));
  for (let i = 1; i < n; i++) { const k = i / n; if (geo.blocked(a.x + dx * k, a.z + dz * k, r)) return false; }
  return true;
}

export class SmithKit {
  constructor(eng, h) { this.eng = eng; this.h = h; this.reset(); }
  reset() { this.anvil = null; this.wall = null; this.hammers = []; this.tempoT = 0; this.tempoFx = null; this.stored = 0; this.storedT = 0; this.pulls = []; this.scraps = []; this.heated = new Set(); this.brands = new Set(); this.log = { scrap: 0 }; }
  get pc() { return this.eng.pc; }
  get G() { return this.h.G(); }
  get clock() { return this.eng.clock; }
  fx(kind, a, o) { return this.h.fx(kind, a, o); }
  sfx(n) { try { this.G.audio.sfx(n); } catch (e) { } }
  lvl(id) { return this.eng.book.level(id); }
  isHeavy(t) { return !!(t.isBoss || (t.def && t.def.ai === 'heavy')); }
  /** 동작의 타격(손을 놓는) 시각, 초 — 테스트에서도 실제 actions.json 값 */
  hitT(ctx, def) { const pc = this.pc, A = pc.body && pc.body.sh && pc.body.sh.actions && pc.body.sh.actions[ctx.act || ctx.d.anim]; return A && A.fps ? A.hitFrame / A.fps : def; }
  get mobile() { const G = this.G; return !!(G && G.input && G.input.mobile); }
  /** 타격감 문구(ui.impactText, 없으면 조용히) — SMITH_SHOUT */
  shout(pos, kind, o = {}) {
    const S = SMITH_SHOUT[kind], ui = this.G && this.G.ui; if (!S || !ui || !ui.impactText || !pos) return;
    const r = o.r ?? 0.5, n = o.n || 0;
    try { ui.impactText({ x: pos.x, y: pos.y || 0, z: pos.z }, S.word, { key: o.key || null, col: S.col, edge: S.edge, size: S.size * (1 + (S.per || 0) * n), top: o.top ?? Math.min(1.7, 0.75 + r * 0.9), r, from: this.pc.pos, force: !!o.force }); } catch (e) { /* no ui */ }
  }
  /** 왼손(던지는 손·담금통 손) 위치, 게임 좌표 — 몸이 없으면 몸 앞 허리 높이 */
  handL() {
    const pc = this.pc; let h = null; try { h = pc.body && pc.body.handPointL && pc.body.handPointL(); } catch (e) { h = null; }
    if (h) return { x: h.x, y: h.y, z: -h.z };
    const f = pc.facing; return { x: pc.pos.x + f.x * 0.35, y: (pc.pos.y || 0) + 1.0, z: pc.pos.z + f.z * 0.35 };
  }
  /** 접촉 순간의 타격감: 시전자와 맞은 대상만 잠깐 멈추고(max — 겹쳐도 안 쌓임), 대상이 눌리고, 카메라가 한 번 밀림 */
  impact(t, f, heavy) {
    const pc = this.pc, G = this.G, s = heavy ? SMITH.stopHeavy : SMITH.stop, k = heavy ? SMITH.kickHeavy : SMITH.kick;
    pc.freezeT = Math.max(pc.freezeT || 0, s);
    if (t && !t.dead) { t.freezeT = Math.max(t.freezeT || 0, s); if (t.body && t.body.punch) t.body.punch(f.x, f.z, heavy ? 0.22 : 0.16); }
    if (G.render && G.render.kick && !G.reduceFlash) G.render.kick(f.x, f.z, k[0], k[1]);
  }

  // ------------------------------------------------------------------ 가열 / 급랭
  addHeat(t, n) {
    if (!t || t.dead || !t.status || !t.status.get) return 0;
    const def = this.eng.data.status('heat'); if (!def) return 0;
    const v = stackHeat(t.status, def, n, this.pc);
    if (t.body) t.body.heat = v;
    if (!t._heatFx || t._heatFx.dead) t._heatFx = this.fx('heat', t, {});
    call(t._heatFx, 'setStacks', v); this.heated.add(t); return v;
  }
  heatOf(t) { const s = t && t.status && t.status.get ? t.status.get('heat') : null; return s ? s.value | 0 : 0; }
  takeHeat(t) { const n = this.heatOf(t); if (n) { t.status.remove('heat'); this.coolDown(t); } return n; }
  coolDown(t) { if (t.body) t.body.heat = 0; call(t._heatFx, 'dispose'); t._heatFx = null; this.heated.delete(t); }
  /** 급랭 담금질(2026-11-19): 누른 순간 담금통을 쥠(그림) → 동작의 붓는 순간(bs_douse hitT)에 통 입구에서 물이 낮은 부채꼴로 나감 →
   *  물이 각 적에게 닿는 순간(거리 / 물 속도) 피해 + 둔화. 가열된 적은 그 순간 가열을 모두 식히며 중첩마다 추가 피해 + 수증기(곁의 적에게 파생 피해).
   *  일반 적의 휘청임은 그림(punch)만 — 실제 제어는 둔화. 카메라 kick은 한 번(가장 먼저 식힌 적), 시전자·대상만 freezeT. */
  smith_quench(op, ctx) {
    const pc = this.pc, eng = this.eng, ht = this.hitT(ctx, 0.28);
    const h = this.fx('douse', pc, { ht, f: ctx.facing, r: op.r, ang: op.ang, speed: op.speed, mouth: op.mouth });
    ctx.quench = { n: 0, top: 0, arrived: 0 };
    eng.pending.push({ time: eng.clock + ht, op: { op: '_run', run: () => this.pour(op, ctx, h) }, ctx });
  }
  pour(op, ctx, h) {
    const eng = this.eng, pc = this.pc, f = ctx.facing; if (pc.dead) { call(h, 'dispose'); return; }
    const o = { x: pc.pos.x, z: pc.pos.z }, sh = eng.shapeOf({ shape: 'cone', r: op.r, ang: op.ang }, { ...ctx, origin: o, facing: f }), ts = eng.targets(sh);
    const arr = ts.map(t => ({ t, dt: Math.max(0, pc.dist(t) - (t.radius || 0.5) - (op.mouth || 0.6)) / (op.speed || 9) }));
    call(h, 'pour', { hits: arr.map(a => ({ dt: a.dt, x: a.t.pos.x, y: a.t.pos.y || 0, z: a.t.pos.z, r: a.t.radius })) });
    this.sfx('bs_quench'); ctx.quench.n = ts.length;
    for (const a of arr) eng.pending.push({ time: eng.clock + a.dt, op: { op: '_run', run: () => this.splashOn(a.t, op, ctx, h, o, f) }, ctx });
  }
  /** 물이 한 적에게 닿음 */
  splashOn(t, op, ctx, h, o, f) {
    const eng = this.eng, pc = this.pc; if (pc.dead || t.dead || t.removed) return;
    if (Math.hypot(t.pos.x - o.x, t.pos.z - o.z) > op.r + (t.radius || 0.5) + 1.0) return;     // 물이 닿기 전에 멀리 달아남
    const n = this.heatOf(t), at = { x: t.pos.x, y: t.pos.y || 0, z: t.pos.z, r: t.radius, n };
    eng.dmg(t, op.coef * fold(ctx.L) * (1 + op.per * n), ctx, { elem: 'ice', quiet: true });
    if (ctx.missed) { call(h, 'arrive', { ...at, n: 0, miss: true }); return; }
    if (n) this.takeHeat(t);
    eng.onHit(t, { st: op.st }, ctx);
    call(h, 'arrive', { ...at, f });
    const Q = ctx.quench; Q.arrived++; Q.top = Math.max(Q.top, n);
    if (n) {
      for (const x of eng.targets(this.circle(t.pos, op.splashR))) if (x !== t && !x.dead) eng.dmg(x, op.splash * n, ctx, { derived: true, quiet: true });   // 번진 피해는 가열을 건드리지 않음
      this.sfx(n >= 3 ? 'bs_steam3' : n === 2 ? 'bs_steam2' : 'bs_steam');
      this.shout(t.pos, 'sizzle', { key: t, r: t.radius, n, force: true });
      if (!Q.kicked) { Q.kicked = true; this.impact(t, f, n >= 3); }
      else { const s = n >= 3 ? SMITH.stopHeavy : SMITH.stop; pc.freezeT = Math.max(pc.freezeT || 0, s); if (!t.dead) t.freezeT = Math.max(t.freezeT || 0, s); if (t.body && t.body.punch) t.body.punch(f.x, f.z, 0.2); }
    } else if (t.body && t.body.punch && !t.dead) t.body.punch(f.x, f.z, SMITH.quench.sway);   // 일반 적: 물보라에 상체가 짧게 휘청(그림만)
  }
  circle(p, r) { return { overlaps: (x, z, tr) => Math.hypot(x - p.x, z - p.z) <= r + tr }; }

  // ------------------------------------------------------------------ 단조 낙인 (불량품 판정)
  /** skillrt onHit: 적중한 대상에게 붙는 것들 (op.heat = 가열 중첩, op.brand = 낙인) */
  onHit(t, op, ctx) {
    if (t.dead) return;
    if (op.heat) this.addHeat(t, op.heat);
    if (op.brand) {
      const b = op.brand;
      this.h.applyStatus(t, { id: 'brand', dur: b.dur, val: 1, ch: 1 }, this.pc);
      if (!t.status.has || !t.status.has('brand')) return;
      call(t._brandFx, 'dispose');
      t._brand = { n: 0, need: b.n, last: this.clock, spec: b, ctx };           // last = now: the stamping blow itself never counts
      t._brandFx = this.fx('brand', t, { dur: b.dur, need: b.n }); this.brands.add(t); this.sfx('bs_stamp');
    }
  }
  /** 내 직접 공격 한 번이 실제로 맞음(스킬 타격·기본 공격; 지속 피해·파생 피해는 부르지 않음) */
  directHit(t) {
    const b = t && t._brand; if (!b || t.dead || !t.status.has('brand')) return;
    if (this.clock - b.last < SMITH.brandGap) return;
    b.last = this.clock; b.n++; call(t._brandFx, 'setCracks', b.n);
    if (b.n >= b.need) this.breakBrand(t);
    else { this.sfx('bs_crack'); this.shout(t.pos, 'crack', { key: t, r: t.radius, force: true }); }   // 첫 타 실금 '팅', 둘째 타 굵은 균열 '팅'
  }
  breakBrand(t) {
    const b = t._brand, eng = this.eng, pc = this.pc; if (!b) return;
    t.status.remove('brand'); t._brand = null; this.brands.delete(t);
    call(t._brandFx, 'shatter'); t._brandFx = null;
    const f = this.dirTo(t);
    eng.dmg(t, b.spec.coef * fold(b.ctx.L), b.ctx, { derived: true, quiet: true });
    if (!t.dead) this.h.applyStatus(t, { id: 'defdown', dur: b.spec.defDur, val: b.spec.defdown + (b.spec.defLv || 0) * (b.ctx.L - 1), ch: 1 }, pc);   // defdown: '더 큰 값만' 규칙이라 다시 깨도 겹치지 않음(보스 포함)
    this.sfx('bs_break'); this.impact(t, f, true); this.scrap(t.pos);
    this.shout(t.pos, 'shatter', { key: t, r: t.radius, force: true });
  }
  dirTo(t) { const pc = this.pc, dx = t.pos.x - pc.pos.x, dz = t.pos.z - pc.pos.z, m = Math.hypot(dx, dz); return m > 1e-3 ? { x: dx / m, z: dz / m } : { ...pc.facing }; }

  // ------------------------------------------------------------------ 모루
  smith_anvil(op, ctx) {
    const eng = this.eng, pc = this.pc, geo = pc.zone.geo, R = eng.range(ctx.d);
    // 지정 위치: 록온한 적이 닿는 거리에 있으면 그 자리, 아니면 조준점(휴대폰·대상 없음 = 앞쪽). 막힌 곳이면 내 쪽으로 당김.
    const L = pc.lockOn && !pc.lockOn.dead && pc.dist(pc.lockOn) <= R + 0.5 ? pc.lockOn : null;
    let a = L ? { x: L.pos.x, z: L.pos.z } : { x: ctx.aim.x, z: ctx.aim.z };
    for (let k = 0; k < 8 && geo.blocked(a.x, a.z, 0.4); k++) a = { x: a.x + (pc.pos.x - a.x) * 0.25, z: a.z + (pc.pos.z - a.z) * 0.25 };
    const p = geo.ground(a.x, a.z);
    if (this.anvil) this.dropAnvil();                                                   // 플레이어당 하나
    this.anvil = { pos: p, fall: op.fall, t: op.life + (op.lifeLv || 0) * (ctx.L - 1), landed: false, pulses: 0, last: -9, op, ctx, fx: this.fx('anvil', p, { fall: op.fall, r: op.r }) };
  }
  dropAnvil() { const a = this.anvil; if (!a) return; call(a.fx, 'dispose'); this.anvil = null; }
  landAnvil(a) {
    const eng = this.eng, op = a.op, ts = eng.targets(this.circle(a.pos, op.r)); a.landed = true;
    let any = false;
    for (const t of ts) { eng.dmg(t, op.coef * fold(a.ctx.L), a.ctx, { quiet: true }); if (!a.ctx.missed) { any = true; eng.onHit(t, { st: op.st }, a.ctx); t.freezeT = Math.max(t.freezeT || 0, SMITH.stop); if (t.body && t.body.punch) t.body.punch(0, 0.001, 0.2); } }
    call(a.fx, 'land', any); this.sfx('bs_anvil');
    const G = this.G, f = this.dirTo({ pos: a.pos }); if (G.render && G.render.kick && !G.reduceFlash) G.render.kick(f.x, f.z, SMITH.kickHeavy[0], SMITH.kickHeavy[1]);
  }
  /** 내 망치 판정(shape)이 모루에 닿았으면 충격파 한 번: 발동 간격·최대 횟수 제한, 충격파 피해는 파생이라 모루를 다시 울리지 않음 */
  strikeAnvil(shape) {
    const a = this.anvil; if (!a || !a.landed || !shape || !shape.overlaps(a.pos.x, a.pos.z, SMITH.anvilHit)) return false;
    return this.pulseAnvil();
  }
  /** 모루 충격파 한 번 시도(튕김망치도 이것 — 같은 간격·최대 횟수) */
  pulseAnvil() {
    const a = this.anvil; if (!a || !a.landed) return false;
    const P = a.op.pulse; if (a.pulses >= P.max || this.clock - a.last < P.gap) return false;
    a.last = this.clock; a.pulses++;
    for (const t of this.eng.targets(this.circle(a.pos, P.r))) this.eng.dmg(t, P.coef, a.ctx, { derived: true, quiet: true });
    call(a.fx, 'pulse', P.r, a.pulses >= P.max); this.sfx('bs_anvil_ring'); return true;
  }

  // ------------------------------------------------------------------ 집게
  smith_tongs(op, ctx) {
    const eng = this.eng, pc = this.pc, t = ctx.tgt, f = ctx.facing; if (!t || t.dead) return;
    if (this.isHeavy(t)) {
      // 보스·무거운 적: 끌어오지 않음 — 안전한 근접 거리까지 내가 다가가(지형 충돌은 돌진이 처리) 집게로 내려침
      const gap = pc.dist(t) - t.radius - 1.2, T0 = 0.2, T1 = 0.25;
      if (gap > 0.2) pc.startLunge(f, Math.min(gap, 6), T0);
      const h = this.fx('tongs', pc, { tgt: t, heavy: true, reach: T0 + T1 });
      pc.skills.lock = Math.max(pc.skills.lock, T0 + T1 + 0.3);
      eng.pending.push({ time: eng.clock + T0, op: { op: '_run', run: () => { if (!pc.dead && pc.body && pc.body.sh.actions.bs_slam) pc.body.play('bs_slam', 1, true); } }, ctx });
      eng.pending.push({ time: eng.clock + T0 + T1, op: { op: '_run', run: () => {
        if (pc.dead) return;
        const ok = !t.dead && pc.dist(t) <= t.radius + 2.6, ff = ok ? this.dirTo(t) : f;
        if (ok) { eng.dmg(t, op.heavy * fold(ctx.L), ctx, { quiet: true }); if (ctx.missed) { call(h, 'grab', null); return; } }
        call(h, 'grab', ok ? t : null);
        if (ok) { this.sfx('bs_tongs'); this.sfx('bs_hit_heavy'); this.impact(t, ff, true); this.strikeAnvil(eng.shapeOf({ shape: 'cone', r: 2.6, ang: 100 }, { ...ctx, facing: ff })); }
      } }, ctx });
      return;
    }
    const h = this.fx('tongs', pc, { tgt: t, reach: op.reach, pull: op.pull });
    eng.pending.push({ time: eng.clock + op.reach, op: { op: '_run', run: () => {
      if (pc.dead || t.dead || !clearLine(pc.zone.geo, pc.pos, t.pos)) { call(h, 'grab', null); return; }
      eng.dmg(t, op.coef * fold(ctx.L), ctx, { quiet: true });
      if (ctx.missed || t.dead) { call(h, 'grab', t.dead ? t : null); if (!ctx.missed) this.sfx('bs_tongs'); return; }
      call(h, 'grab', t); this.sfx('bs_tongs'); eng.onHit(t, { st: op.st }, ctx);
      t.knock = { x: 0, z: 0 }; t.freezeT = 0;
      const ff = pc.facing, d = op.stop + t.radius * 0.5;
      this.pulls.push({ t, left: op.pull, to: { x: pc.pos.x + ff.x * d, z: pc.pos.z + ff.z * d }, op, ctx });
    } }, ctx });
  }
  tickPulls(dt) {
    for (const p of this.pulls) {
      const t = p.t; if (t.dead || t.removed) { p.left = 0; p.dead = true; continue; }
      const dx = p.to.x - t.pos.x, dz = p.to.z - t.pos.z, m = Math.hypot(dx, dz), k = Math.min(1, dt / Math.max(dt, p.left));
      if (m > 0.05) { const b = { x: t.pos.x, z: t.pos.z }; t.pos = t.zone.geo.move(t.pos, dx * k, dz * k, t.radius);      // 지형에 막히면 거기서 멈춤(벽을 뚫지 않음)
        if (Math.hypot(t.pos.x - b.x, t.pos.z - b.z) < m * k * 0.2) p.left = 0; }
      p.left -= dt;
      if (p.left <= 0) { p.dead = true; this.pullDone(p); }
    }
    this.pulls = this.pulls.filter(p => !p.dead);
  }
  pullDone(p) {
    const a = this.anvil, t = p.t; if (!a || !a.landed || t.dead) return;
    if (Math.hypot(t.pos.x - a.pos.x, t.pos.z - a.pos.z) > a.op.r + t.radius) return;
    this.eng.dmg(t, p.op.anvil * fold(p.ctx.L), p.ctx, { derived: true, quiet: true });                                  // 모루 충돌: 파생 피해
    call(a.fx, 'bump'); this.sfx('bs_anvil_ring'); this.impact(t, this.dirTo(t), true);
  }

  // ------------------------------------------------------------------ 접이식 철벽
  smith_wall(op, ctx) {
    const pc = this.pc; if (this.wall) call(this.wall.fx, 'dispose');
    this.wall = { t: op.dur, dur: op.dur, val: Math.min(0.8, op.block + (op.blockLv || 0) * (ctx.L - 1)), op, ctx, id: ctx.id, fx: this.fx('wall', pc, { dur: op.dur }) };
    try { this.G.ui.floatText(pc.pos, '철벽', '#d8e0ea', 0.85, 1.8); } catch (e) { }
  }
  /** 같은 칸을 다시 누름: 철벽을 걷어차 날림(기력·재사용 대기 추가 없음). 반환값 = cast 와 같음(null = 성공) */
  kickWall(aim) {
    const eng = this.eng, pc = this.pc, w = this.wall; if (!w) return '';
    if (pc.dead) return ''; if (pc.stunned) return '행동 불가 상태'; if (eng.casting || eng.channel || pc.skills.busy) return '';
    const K = w.op.kick, f = { ...pc.facing }; this.wall = null;
    if (pc.body && pc.body.sh.actions.bs_kick) pc.body.play('bs_kick', 1, true);
    pc.skills.lock = Math.max(pc.skills.lock, 0.38);
    const plate = call(w.fx, 'kick', f); this.sfx('bs_swing'); this.onCast(w.ctx.d);
    const hit = new Set(), self = this, o = { x: pc.pos.x + f.x * 0.9, z: pc.pos.z + f.z * 0.9 }; let trav = 0, wait = 0.1, scrapped = false;
    eng.things.push({ dead: false, update(dt) {
      if (wait > 0) { wait -= dt; return; }
      const step = K.speed * dt; trav += step; const p = { x: o.x + f.x * trav, z: o.z + f.z * trav };
      call(plate, 'set', p);
      for (const c of pc.zone.actors) {
        if (c.dead || c.faction === 'player' || c.isSummon || hit.has(c)) continue;
        const dx = c.pos.x - p.x, dz = c.pos.z - p.z, al = dx * f.x + dz * f.z, la = Math.abs(dx * f.z - dz * f.x);
        if (Math.abs(al) > 0.5 + c.radius || la > K.w / 2 + c.radius) continue;
        hit.add(c); eng.dmg(c, K.coef * fold(w.ctx.L), w.ctx, { quiet: true, push: K.push });     // push: 보스는 밀리지 않음(eng.dmg)
        if (w.ctx.missed) continue;
        call(plate, 'hit', c); self.sfx('bs_hit'); c.freezeT = Math.max(c.freezeT || 0, SMITH.stop);
        if (!scrapped) { scrapped = true; self.scrap(c.pos); const G = self.G; if (G.render && G.render.kick && !G.reduceFlash) G.render.kick(f.x, f.z, SMITH.kick[0], SMITH.kick[1]); }
      }
      if (trav >= K.len || pc.zone.geo.blocked(p.x, p.z, 0.2)) this.dispose();
    }, dispose() { if (this.dead) return; this.dead = true; call(plate, 'end'); } });
    eng.combatT = 5;
    return null;
  }
  /** 칸 표시용: 철벽이 떠 있는 스킬이면 남은 시간(초), 아니면 0 */
  recastLeft(id) { return this.wall && this.wall.id === id ? Math.max(0, this.wall.t) : 0; }

  // ------------------------------------------------------------------ 튕김망치 (2026-11-19, 예전 즉석 리벳 자리 bs1_b4)
  /** 누른 순간: 왼손에 손망치(그림) → 동작의 손을 놓는 순간(bs_toss hitT)에 실제 왼손 위치에서 날아감. 조준선은 그 순간의 내 위치·시전 방향. */
  smith_throw(op, ctx) {
    const eng = this.eng, pc = this.pc, ht = this.hitT(ctx, 0.24), h = this.fx('toss', pc, { ht });
    eng.pending.push({ time: eng.clock + ht, op: { op: '_run', run: () => this.throwNow(op, ctx, h) }, ctx });
  }
  throwNow(op, ctx, h) {
    const eng = this.eng, pc = this.pc, f = ctx.facing, T = SMITH.throw; if (pc.dead) { call(h, 'dispose'); return; }
    const R = eng.range(ctx.d), a = this.anvil && this.anvil.landed ? this.anvil : null;
    const foes = eng.targets(this.lane(pc.pos, f, R + 2, 3.0)).filter(t => !t.dead);
    const mobile = ctx.mobile ?? this.mobile, plan = throwPlan(pc.pos, f, R, a ? a.pos : null, foes, mobile);
    const p = this.handL(), self = this, maxRun = R + T.reach;
    // hm.st: 'fly' (손 → 적/모루/허공, 직선 — 적이면 그 적의 지금 몸통을 따라감) -> 'lob' (모루에서 튀어 적에게 포물선) -> 'drop' (바닥에 떨어져 사라짐)
    const hm = { st: 'fly', p, plan, run: 0, hit: false, bounced: false, ctx, op, f: { ...f }, h, tgt: plan.kind === 'enemy' ? plan.t : null, dead: false,
      update(dt) { if (!this.dead) self.tickHammer(this, dt); }, dispose() { if (this.dead) return; this.dead = true; call(this.h, 'dispose'); } };
    hm.maxRun = maxRun; call(h, 'release', p, plan.kind);
    this.sfx('bs_throw'); this.hammers.push(hm); eng.things.push(hm); ctx.throwPlan = plan.kind;
    return hm;
  }
  /** 조준선 둘레 직사각형(적 찾기) */
  lane(o, f, len, w) { return { overlaps: (x, z, tr) => { const dx = x - o.x, dz = z - o.z, al = dx * f.x + dz * f.z, la = Math.abs(dx * f.z - dz * f.x); return al > -tr && al <= len + tr && la <= w / 2 + tr; } }; }
  chest(t) { return (t.pos.y || 0) + Math.min(1.0, 0.35 + (t.radius || 0.5) * 0.7); }
  anvilTop() { const a = this.anvil; return a ? { x: a.pos.x, y: (a.pos.y || 0) + SMITH.anvilTop, z: a.pos.z } : null; }
  tickHammer(hm, dt) {
    const pc = this.pc, eng = this.eng, T = SMITH.throw, op = hm.op;
    if (pc.dead) return hm.dispose();
    if (hm.st === 'fly') {
      const sp = op.speed || 15, step = sp * dt; let goal;
      if (hm.plan.kind === 'enemy' && hm.tgt && !hm.tgt.dead && !hm.tgt.removed) goal = { x: hm.tgt.pos.x, y: this.chest(hm.tgt), z: hm.tgt.pos.z };
      else if (hm.plan.kind === 'anvil' && this.anvil && this.anvil.landed) goal = this.anvilTop();
      else { if (hm.plan.kind !== 'none') hm.plan = { kind: 'none' }; goal = { x: hm.p.x + hm.f.x * 10, y: hm.p.y, z: hm.p.z + hm.f.z * 10 }; }   // 겨눈 것이 사라짐: 그대로 앞으로
      const dx = goal.x - hm.p.x, dy = goal.y - hm.p.y, dz = goal.z - hm.p.z, m = Math.hypot(dx, dy, dz) || 1, k = Math.min(1, step / m);
      hm.p = { x: hm.p.x + dx * k, y: hm.p.y + dy * k, z: hm.p.z + dz * k }; hm.run += m * k;
      const hd = Math.hypot(dx, dz); if (hd > 1e-3) hm.f = { x: dx / hd, z: dz / hd };
      call(hm.h, 'set', hm.p, hm.f);
      // 닿음: 모루(윗면) / 적(가는 길에 걸린 적 아무나 — 처음 닿은 것) / 벽 / 사거리 끝
      const a = this.anvil;
      if (hm.plan.kind === 'anvil' && k >= 1) return this.hammerAnvil(hm);
      if (hm.plan.kind === 'none' && a && a.landed && Math.hypot(hm.p.x - a.pos.x, hm.p.z - a.pos.z) <= SMITH.anvilHit + T.w && hm.p.y <= (a.pos.y || 0) + SMITH.anvilTop + 0.5) return this.hammerAnvil(hm);
      if (hm.plan.kind !== 'anvil') {
        for (const t of eng.targets(this.circle(hm.p, T.w))) if (!t.dead) return this.hammerStrike(hm, t);
      }
      if (pc.zone.geo.blocked(hm.p.x, hm.p.z, 0.1) || hm.run >= hm.maxRun) return this.hammerDrop(hm, hm.p);
      return;
    }
    if (hm.st === 'lob') {
      hm.lt += dt; const L = hm.lob;
      if (L.t && (L.t.dead || L.t.removed)) { const n = this.bounceTarget(op, [L.t]); if (n) this.startLob(hm, n, hm.p, T.retarget); else { L.t = null; L.to = { x: hm.p.x + hm.f.x * 0.6, y: pc.zone.geo.ground(hm.p.x, hm.p.z).y, z: hm.p.z + hm.f.z * 0.6 }; } }
      const to = L.t ? { x: L.t.pos.x, y: this.chest(L.t), z: L.t.pos.z } : L.to, k = Math.min(1, hm.lt / L.dur);
      hm.p = { x: L.from.x + (to.x - L.from.x) * k, y: L.from.y + (to.y - L.from.y) * k + 4 * L.hop * k * (1 - k), z: L.from.z + (to.z - L.from.z) * k };
      call(hm.h, 'set', hm.p, hm.f);
      if (k >= 1) { if (L.t && !L.t.dead) return this.hammerStrike(hm, L.t); return this.hammerDrop(hm, hm.p); }
    }
  }
  /** 모루에 닿음: '깡!' + 옆으로 튀는 불티 + 모루 충격파 한 번 시도(간격·횟수 공유, 다 썼어도 망치는 튐) → 위로 튀어 가장 가까운 적에게 포물선 */
  hammerAnvil(hm) {
    const a = this.anvil, top = this.anvilTop(), op = hm.op; hm.bounced = true;
    this.sfx('bs_clang'); this.shout(top, 'clang', { key: a, r: 0.4, top: SMITH.anvilTop + 0.5, force: true });
    const pulsed = this.pulseAnvil(); call(hm.h, 'clang', top, hm.f, pulsed); call(a.fx, 'bump');
    hm.p = { ...top }; const t = this.bounceTarget(op);
    if (t) { this.startLob(hm, t, top, op.lob); }
    else { hm.st = 'lob'; hm.lt = 0; hm.lob = { t: null, from: { ...top }, to: { x: top.x + hm.f.x * 0.9, y: a.pos.y || 0, z: top.z + hm.f.z * 0.9 }, dur: op.lob * 0.8, hop: op.hop * 0.7 }; }   // 튈 적 없음: 위로 튀었다가 모루 옆 바닥에 떨어져 사라짐
    hm.ctx.throwBounce = { pulsed, target: !!t };
  }
  bounceTarget(op, skip = []) {
    const a = this.anvil, c = a ? a.pos : null; if (!c) return null; let best = null, bd = 1e9;
    for (const t of this.eng.targets(this.circle(c, op.bounce))) { if (t.dead || skip.includes(t)) continue; const d = Math.hypot(t.pos.x - c.x, t.pos.z - c.z); if (d < bd) { bd = d; best = t; } }
    return best;
  }
  startLob(hm, t, from, dur) { hm.st = 'lob'; hm.lt = 0; hm.lob = { t, from: { ...from }, dur, hop: hm.op.hop }; const dx = t.pos.x - from.x, dz = t.pos.z - from.z, m = Math.hypot(dx, dz); if (m > 1e-3) hm.f = { x: dx / m, z: dz / m }; call(hm.h, 'lob', t); }
  /** 망치가 적을 직접 때림(던질 때마다 한 번): 묵직한 한 방 — 낙인 타수로 세고(직접 공격), 충격 재활용을 방출(맞았을 때만) */
  hammerStrike(hm, t) {
    const eng = this.eng, op = hm.op, ctx = hm.ctx, f = this.dirFrom(hm.p, t);
    if (hm.hit) return this.hammerDrop(hm, hm.p); hm.hit = true;
    eng.dmg(t, op.coef * fold(ctx.L), ctx, { quiet: true });
    ctx.throwHit = { t, missed: !!ctx.missed, bounced: hm.bounced };
    if (ctx.missed) { call(hm.h, 'glance', t); this.sfx('bs_drop'); return this.hammerDrop(hm, hm.p, true); }
    eng.onHit(t, { st: op.st }, ctx);
    call(hm.h, 'hit', t); this.sfx('bs_hit_heavy'); this.impact(t, f, true);
    this.shout(t.pos, 'bonk', { key: t, r: t.radius, force: true });
    this.releaseStored(t, f);
    this.hammerDrop(hm, hm.p, true);
  }
  dirFrom(p, t) { const dx = t.pos.x - p.x, dz = t.pos.z - p.z, m = Math.hypot(dx, dz); return m > 1e-3 ? { x: dx / m, z: dz / m } : this.dirTo(t); }
  hammerDrop(hm, p, quiet) {
    if (hm.st === 'gone') return; hm.st = 'gone';
    const g = this.pc.zone.geo.ground(p.x, p.z); call(hm.h, 'drop', { x: p.x, y: g.y, z: p.z }); if (!quiet) this.sfx('bs_drop');
    this.hammers = this.hammers.filter(x => x !== hm);
    const self = this, life = { t: SMITH.throw.dropT };
    hm.update = function (dt) { life.t -= dt; if (life.t <= 0) this.dispose(); };   // 그림이 바닥에서 사라질 시간만 남겨 둠(정리 때 함께 지움)
    void self;
  }

  /** 플레이어가 맞기 직전(actors.js takeDamage): 철벽(정면)이 줄인 양을 빼고, 줄인 만큼 충격을 모음 */
  guard(d, amount) {
    if (!this.wall) return amount;
    const pc = this.pc; if (d.dot || !d.source || d.source === pc || !(amount > 0)) return amount;
    let front = false;
    if (d.source.pos) { const dx = d.source.pos.x - pc.pos.x, dz = d.source.pos.z - pc.pos.z, m = Math.hypot(dx, dz) || 1; front = (dx * pc.facing.x + dz * pc.facing.z) / m > SMITH.wallFront; }
    const r = guardHit({ wall: this.wall, front }, amount);
    if (r.reduced <= 0) return amount;
    call(this.wall.fx, 'block'); this.sfx('bs_block');
    this.charge(r.reduced);
    return r.amount;
  }
  /** 충격 재활용: 실제로 줄인 피해의 일부를 모음(상한, 유지 시간) */
  charge(reduced) {
    const bk = this.eng.book, pct = bk.passive('recycle'); if (!(pct > 0) || !(reduced > 0)) return 0;
    const cap = this.pc.stat('atk') * bk.passive('recycleCap');
    this.stored = Math.min(cap, this.stored + reduced * pct); this.storedT = SMITH.recycle.hold; return this.stored;
  }

  // ------------------------------------------------------------------ 장인의 박자 / 강화 기본 공격
  /** 스킬을 씀(skillrt cast): 다음 기본 공격 1회 강화 — 겹치지 않고 시간만 다시 채움 */
  onCast(d) {
    if (!d || d.job !== 'blacksmith') return;
    const v = this.eng.book.passive('tempo'); if (!(v > 0)) return;
    this.tempoT = SMITH.tempo.window;
    if (!this.tempoFx || this.tempoFx.dead) this.tempoFx = this.fx('tempo', this.pc, { dur: SMITH.tempo.window }); else call(this.tempoFx, 'refresh', SMITH.tempo.window);
  }
  get empowered() { return this.tempoT > 0; }
  /** 기본 공격의 판정 순간(actors.js SkillRunner): 강화 상태면 소비하고 배율을 돌려줌 */
  basicSwing() {
    if (!(this.tempoT > 0)) return null;
    this.tempoT = 0; call(this.tempoFx, 'spend'); this.tempoFx = null;
    return { mul: 1 + this.eng.book.passive('tempo') };
  }
  /** 기본 공격이 끝난 뒤(ts = 실제로 맞은 대상만 — MISS 제외): 낙인 타수, 모루, 그리고 강화 타격이면 충격 방출 */
  basicLanded(ts, shape, facing, emp) {
    const pc = this.pc;
    for (const t of ts) if (!t.dead) this.directHit(t);
    this.strikeAnvil(shape);
    if (!emp) return;
    const f = facing || pc.facing, alive = ts.filter(t => !t.dead).sort((a, b) => pc.dist(a) - pc.dist(b));
    this.fx('emp', pc, { f, hit: alive[0] ? { x: alive[0].pos.x, y: alive[0].pos.y || 0, z: alive[0].pos.z, r: alive[0].radius } : null });
    if (ts.length) this.sfx('bs_anvil_ring');   // 강화 망치질: 기본 공격 타격음 위에 맑은 쇠 울림 한 번(빗나가면 기본 휘두름 소리만)
    if (alive[0]) { this.impact(alive[0], f, false); this.releaseStored(alive[0], f); }
  }
  /** 충격 재활용 방출: 모아 둔 양을 한 번에(파생 피해 — 낙인·가열·모루를 건드리지 않음). 강화 기본 공격·튕김망치 직접 타격이 실제로 맞은 순간에만 불림 */
  releaseStored(t, f) {
    if (!(this.stored >= 1) || !t || t.dead) return 0;
    const amount = Math.round(this.stored); this.stored = 0; this.storedT = 0;
    t.takeDamage({ source: this.pc, amount, noMiss: true, derived: true, localStop: 'quiet', kdir: { x: f.x, z: f.z }, knockback: 0 });
    this.fx('release', t, { f }); try { this.G.ui.floatText(t.pos, '충격 방출', '#ffb060', 0.95, 2.2); } catch (e) { }
    this.log.released = (this.log.released || 0) + amount;
    return amount;
  }

  // ------------------------------------------------------------------ 고철 (임시 전투 자원: 가방에 들어가지 않음)
  scrap(pos) {
    const bk = this.eng.book, pc = this.pc, lv = this.lvl('bs1_c4'), sh = bk.passive('scrapShield'); if (!(lv > 0) && !(sh > 0)) return false;
    const W = SMITH.scrap; this.scraps = this.scraps.filter(t => this.clock - t < W.window); if (this.scraps.length >= W.max) return false;
    this.scraps.push(this.clock); this.log.scrap++;
    this.fx('scrap', pos, { to: pc });
    if (lv > 0) { const d = this.eng.data.skill2('bs1_c4'), fl = d && d.flags && d.flags.scrap; if (fl) pc.sp = Math.min(pc.maxSp, pc.sp + fl[0] + (fl[1] || 0) * (lv - 1)); }
    if (sh > 0) pc.addShield(Math.round(pc.maxHp * sh), W.shieldDur);                // addShield = 더 큰 쪽만: 겹치지 않음
    return true;
  }

  // ------------------------------------------------------------------ 프레임 / 정리 (낙인 시간 만료 = 각인이 조용히 흐려짐 'expire')
  tick(dt) {
    if (this.tempoT > 0) { this.tempoT -= dt; if (this.tempoT <= 0) { call(this.tempoFx, 'dispose'); this.tempoFx = null; } }
    if (this.storedT > 0) { this.storedT -= dt; if (this.storedT <= 0) this.stored = 0; }
    const w = this.wall; if (w) { w.t -= dt; if (w.t <= 0) { call(w.fx, 'fold'); this.wall = null; } }
    const a = this.anvil;
    if (a) { if (!a.landed) { a.fall -= dt; if (a.fall <= 0) this.landAnvil(a); } else { a.t -= dt; if (a.t <= 0) { call(a.fx, 'expire'); this.anvil = null; } } }
    if (this.pulls.length) this.tickPulls(dt);
    if (this.heated.size) for (const t of [...this.heated]) { if (t.dead || t.removed || !t.status.has('heat')) this.coolDown(t); }
    if (this.brands.size) for (const t of [...this.brands]) { if (t.dead || t.removed || !t.status.has('brand')) { call(t._brandFx, t.dead || t.removed ? 'dispose' : 'expire'); t._brandFx = null; t._brand = null; this.brands.delete(t); } }
  }
  /** 맵 이동 · 사망 · 직업 변경: 임시 물건과 상태를 모두 지움 */
  clear() {
    if (this.anvil) call(this.anvil.fx, 'dispose'); if (this.wall) call(this.wall.fx, 'dispose'); for (const hm of this.hammers) hm.dispose(); call(this.tempoFx, 'dispose');
    for (const t of this.heated) { if (t.body) t.body.heat = 0; call(t._heatFx, 'dispose'); t._heatFx = null; if (t.status && t.status.remove) t.status.remove('heat'); }
    for (const t of this.brands) { call(t._brandFx, 'dispose'); t._brandFx = null; t._brand = null; if (t.status && t.status.remove) t.status.remove('brand'); }
    this.reset();
  }
}
