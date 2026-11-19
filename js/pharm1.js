// 약사 1차 스킬 5종 규칙 (2026-11-19 개편): 유봉 되던지기 ph1_a4 · 불꽃심지병 ph1_b1 · 서리병 굴리기 ph1_b2 · 결정침 개화 ph1_b4 · 꿈꽃가루 ph1_c1.
// 스킬 데이터는 tools/skills2/gen.py (custom op ph_rang / ph_wick / ph_frost / ph_crystal / ph_dream — 수치는 op 필드), 실행은 js/skillrt.js 가
// 이 파일의 PharmKit 을 부름(eng.ph, CUSTOM ph_*). 화면은 js/pharm1fx.js (G.skillFx.pharm 의 rang/wick/frost/crystal/dream/moon).
// 이 파일은 렌더링을 직접 하지 않음 — fx(kind, a, o) 가 null 을 돌려줘도(메시 로딩 전·테스트) 규칙은 그대로 동작.
//
// 규칙 요약
//   유봉 되던지기: 손에 든 유봉이 실제로 날아감(ModelBody.thrownR = 손의 유봉 숨김). 나가는 길·돌아오는 길마다 적마다 한 번(구간별 집합),
//     최대 거리 또는 벽에서 방향을 틀어 '지금' 약사 쪽으로 매 프레임 방향을 다시 잡음 → 던진 뒤 옆으로 걸으면 돌아오는 길이 휨. 넉백 없음.
//   불꽃심지병: 포물선으로 날아가 깨짐 = 작은 충격 피해(정확한 투척 중심 보너스) → ignite 초 뒤 점화 → tick 초마다 ticks 번,
//     그 순간 원 안에 서 있는 적만 화염 피해(지속 피해 = 빗나감·움찔 없음). 화상 상태는 걸지 않음(중복 없음).
//   서리병 굴리기: 바닥을 굴러가며 얼음길 조각을 남김(trail 초 동안). 얼음길 위의 적 = 둔화(머무는 동안 시간만 갱신, 값은 그대로).
//     최대 거리(len + 정확한 투척 거리)·벽에서 깨짐 → 진행 방향 부채꼴 파편 피해 한 번(가운데 1/3 각도 = 중심 보너스), 벽 너머는 맞지 않음(clearLine).
//   결정침 개화: 대상 하나. 왼쪽·오른쪽·머리 위 결정이 hits 시각에 차례로 꽂힘(피해·소리 = 그 순간). 대상이 먼저 쓰러지거나 멀어지면 남은 결정은 흩어짐.
//   꿈꽃가루: 피해 0. 앞쪽 부채꼴로 wave 초 동안 퍼지는 꽃가루 — 닿은 일반 몬스터는 수면(상태 sleep: kind stun, 보스 면역 = 기존 CC 규칙).
//     시전 한 번에 대상마다 한 번만(깨어나도 같은 시전으로 다시 잠들지 않음). 피해(직접·지속)를 받으면 즉시 깨어남(wakeOnHit, js/actors.js).
import { HitShape, CombatMath } from './core.js';
import { clearLine } from './smith.js';

export const PH1 = {
  stop: 0.035, stopHeavy: 0.06,      // 접촉 순간: 시전자·맞은 대상만 잠깐 멈춤(초) — 전역 G.hitStop 안 씀
  kick: [0.07, 0.09],                // 결정침 마지막 타·서리병 파편이 맞혔을 때 카메라 밀림 [m, 초] (한 번)
  sfxGap: 0.06, maxLive: 30,
};
const call = (h, m, ...a) => { try { return h && h[m] ? h[m](...a) : null; } catch (e) { console.warn('pharm1fx', m, e); return null; } };
export const coefAt = (op, L) => op.coef + (op.coefLv || 0) * (Math.max(1, L) - 1);
export const lastCoefAt = (op, L) => op.coefs[op.coefs.length - 1] + (op.lastLv || 0) * (Math.max(1, L) - 1);
export const sleepAt = (op, L) => op.sleep + (op.sleepLv || 0) * (Math.max(1, L) - 1);
export const slowAt = (op, L) => op.slow + (op.slowLv || 0) * (Math.max(1, L) - 1);
/** 점 p 와 선분 a-b 사이 거리 (바닥 x, z) */
export function segDist(p, a, b) {
  const vx = b.x - a.x, vz = b.z - a.z, L2 = vx * vx + vz * vz;
  const k = L2 > 1e-9 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / L2)) : 0;
  return Math.hypot(p.x - (a.x + vx * k), p.z - (a.z + vz * k));
}
/** 서리병이 굴러갈 길: from 에서 dir 로 len m(막히면 그 앞에서 멈춤). → { end, dist, wall } */
export function frostPath(geo, from, dir, len, r = 0.25) {
  const step = 0.1; let d = 0, wall = false;
  while (d + step <= len + 1e-9) { const x = from.x + dir.x * (d + step), z = from.z + dir.z * (d + step); if (geo.blocked(x, z, r)) { wall = true; break; } d += step; }
  if (!wall && d < len) { const x = from.x + dir.x * len, z = from.z + dir.z * len; if (!geo.blocked(x, z, r)) d = len; }
  return { end: { x: from.x + dir.x * d, z: from.z + dir.z * d }, dist: d, wall };
}
/** 잠든 몬스터가 피해(직접·지속, 실제로 1 이상)를 받으면 깨움 — js/actors.js Combatant.takeDamage 가 부름. 깨웠으면 true */
export function wakeOnHit(t, amount) {
  if (!t || t.faction === 'player' || !(amount >= 1) || !t.status || !t.status.has || !t.status.has('sleep')) return false;
  t.status.remove('sleep'); return true;
}

/** 스킬 창 수치 줄(실제 op 값으로 계산 — 수치를 바꾸면 문구도 따라감). pass(key) = 배운 패시브 값(정확한 투척 throwRange·centerBonus) */
export function ph1LevelText(d, L, pass = () => 0) {
  const op = d && d.ops && d.ops.find(o => o.op === 'custom' && /^ph_(rang|wick|frost|crystal|dream)$/.test(o.fn)); if (!op) return null;
  const m = 1 + 0.12 * (L - 1), P = v => Math.round(v * 100) + '%', f1 = v => (Math.round(v * 10) / 10).toString();
  const cb = pass('centerBonus'), tr = pass('throwRange'), out = [];
  switch (op.fn) {
    case 'ph_rang': { const c = coefAt(op, L) * m; out.push(`나갈 때 ${P(c)} + 돌아올 때 ${P(c)} (적마다 한 번씩, 총 ${P(2 * c)}) · 거리 ${f1(op.dist)}m · 넉백 없음`); break; }
    case 'ph_wick': { const c = coefAt(op, L) * m, i = op.impact * m;
      out.push(`착탄 ${P(i)}${cb ? ` (중심 +${P(cb)})` : ''} → ${f1(op.ignite)}초 뒤 점화, ${f1(op.tick)}초마다 ${P(c)} × ${op.ticks}회 (계속 서 있으면 총 ${P(i + c * op.ticks)}) · 반경 ${f1(op.r)}m · 던지는 거리 ${f1(d.range + tr)}m`); break; }
    case 'ph_frost': { const c = coefAt(op, L) * m;
      out.push(`얼음길 둔화 ${P(slowAt(op, L))} (벗어난 뒤 ${f1(op.slowDur)}초) · 구르는 거리 ${f1(op.len + tr)}m · 끝 파편 ${P(c)}${cb ? ` (가운데 +${P(cb)})` : ''} 부채꼴 ${f1(op.fanR)}m·${op.fanAng}°`); break; }
    case 'ph_crystal': { const cs = op.coefs.map((c, k) => (k === op.coefs.length - 1 ? lastCoefAt(op, L) : c) * m);
      out.push(`결정침 ${cs.map(P).join(' → ')} (총 ${P(cs.reduce((a, b) => a + b, 0))}) · 대상 하나 · 사거리 ${f1(d.range)}m`); break; }
    case 'ph_dream': out.push(`수면 ${f1(sleepAt(op, L))}초 · 부채꼴 ${f1(op.r)}m·${op.ang}° · 피해 없음 · 맞으면 깨어남 · 보스 면역`); break;
  }
  if (d.cd) out.push(`쿨타임 ${f1(d.cd * (1 - 0.03 * (L - 1)))}초`);
  out.push(`연출 등급 ${Math.max(1, Math.min(10, L))}`);
  return out.join(' · ');
}

export class PharmKit {
  constructor(eng, h) { this.eng = eng; this.h = h; this.live = []; this.timers = []; this.sndT = {}; this.sleepers = []; this.rang = null;
    this.log = { rangOut: 0, rangBack: 0, catch: 0, impact: 0, ticks: 0, shards: 0, blocked: 0, crystal: 0, scatter: 0, slept: 0, woke: 0, immune: 0 }; }
  get pc() { return this.eng.pc; }
  get G() { return this.h.G(); }
  get clock() { return this.eng.clock; }
  fx(kind, a, o) { try { return this.h.fx(kind, a, o); } catch (e) { return null; } }
  snd(n, gap = PH1.sfxGap) { const t = this.clock; if (this.sndT[n] != null && t - this.sndT[n] < gap) return; this.sndT[n] = t; try { this.G.audio.sfx(n); } catch (e) { } }
  /** 동작에서 손을 떠나는(타격) 시각, 누른 순간부터 초 */
  hitT(ctx) { let a = null; try { a = this.pc.body.sh.actions[ctx.act]; } catch (e) { a = null; } return a && a.fps ? a.hitFrame / a.fps : 0.25; }
  after(t, fn) { this.timers.push({ at: this.clock + Math.max(0, t), fn }); }
  add(o) { this.live.push(o); while (this.live.length > PH1.maxLive) { const x = this.live.shift(); call(x, 'dispose'); } return o; }
  /** 유봉이 손을 떠나 있는 동안 = 유봉 스킬·기본 공격을 쓸 수 없음 */
  away() { return !!(this.rang && !this.rang.dead); }
  tick(dt) {
    const pc = this.pc;
    if (this.timers.length) {
      const due = this.timers.filter(x => x.at <= this.clock); if (due.length) this.timers = this.timers.filter(x => x.at > this.clock);
      for (const x of due) { if (pc.dead) { this.timers = []; break; } try { x.fn(); } catch (e) { console.error('pharm1 timer', e); } }
    }
    for (const o of this.live) if (!o.dead) { try { o.update(dt); } catch (e) { console.error('pharm1 live', e); call(o, 'dispose'); o.dead = true; } }
    if (this.live.some(o => o.dead)) this.live = this.live.filter(o => !o.dead);
    if (this.sleepers.length) for (const s of this.sleepers.slice()) if (s.t.dead || !s.t.status.has('sleep')) { call(s.h, 'wake'); this.sleepers.splice(this.sleepers.indexOf(s), 1); this.log.woke++; }
  }
  /** 사망·지역 이동·불러오기·전직: 날아가는 유봉(손으로 돌아옴)·약병·불·얼음길·결정·꽃가루 모두 취소(피해 없음) */
  clear() { this.timers = []; for (const o of this.live) call(o, 'dispose'); this.live = []; this.rang = null; this.thrown(false); for (const s of this.sleepers) call(s.h, 'dispose'); this.sleepers = []; }
  targets(sh) { return this.eng.targets(sh); }
  circle(c, r) { return this.targets(HitShape.circle(c.x, c.z, r)); }
  geo() { return this.pc.zone.geo; }
  ground(p) { try { return this.geo().ground(p.x, p.z); } catch (e) { return { x: p.x, y: 0, z: p.z }; } }
  handPos() { let h = null; try { h = this.pc.body && this.pc.body.handPoint && this.pc.body.handPoint(); } catch (e) { h = null; } return h ? { x: h.x, y: h.y, z: -h.z } : null; }
  thrown(v) { const b = this.pc && this.pc.body; if (b) b.thrownR = !!v; }
  /** 직접 피해 한 번: 전역 히트스톱 없이(quiet). flask = 약병(촉매 활성화 반응 표식) */
  hit(t, coef, ctx, o = {}) { if (!t || t.dead) return 0; const a = this.eng.dmg(t, coef, ctx, { quiet: true }); if (o.flask && !ctx.missed) this.eng.onHit(t, { tag: 'flask' }, ctx); return ctx.missed ? 0 : a; }
  /** 지속 피해(불꽃심지병 불): 빗나감·움찔 없음, 잠든 적은 깨어남(actors.js) */
  dot(t, coef, ctx, elem) {
    if (!t || t.dead) return 0; const eng = this.eng;
    const r = CombatMath.compute(eng.power(ctx), coef * ctx.mult, t.stat('def'), 0, 0, t.stat('dmgReduce'));
    t.takeDamage({ source: this.pc, amount: r.amount, dot: true, elem, localStop: 'quiet' }); eng.combatT = 5; return r.amount;
  }
  touch(ts, f, stop = PH1.stop, punch = 0.12) {
    const pc = this.pc; if (!ts.length) return; pc.freezeT = Math.max(pc.freezeT || 0, stop);
    for (const t of ts) if (!t.dead) { t.freezeT = Math.max(t.freezeT || 0, stop); if (t.body && t.body.punch) t.body.punch(t.pos.x - pc.pos.x || f.x, t.pos.z - pc.pos.z || f.z, punch); }
  }
  kick(dx, dz) { const G = this.G; try { if (G.render && G.render.kick && !G.reduceFlash) G.render.kick(dx, dz, PH1.kick[0], PH1.kick[1]); } catch (e) { } }

  // ================================================================== 유봉 되던지기
  ph_rang(op, ctx) {
    const pc = this.pc, ht = this.hitT(ctx), zone = pc.zone, coef = coefAt(op, ctx.L);
    const H = this.fx('rang', pc, { ht, dist: op.dist, w: op.w });
    this.after(Math.max(0, ht - 0.08), () => this.snd('ph_rang_throw'));
    this.after(ht, () => {
      if (pc.dead) { call(H, 'dispose'); return; }
      const f = { ...ctx.facing }, start = { x: pc.pos.x + f.x * 0.45, z: pc.pos.z + f.z * 0.45 };
      const R = { dead: false, pos: start, dir: f, back: false, trav: 0, t: 0, spd: op.speed, out: new Set(), ret: new Set(), path: [{ ...start }],
        update: (dt) => {
          if (R.dead) return; R.t += dt;
          if (pc.dead || pc.zone !== zone) { R.dispose(); return; }
          let step = R.spd * dt;
          if (R.back) {
            const dx = pc.pos.x - R.pos.x, dz = pc.pos.z - R.pos.z, m = Math.hypot(dx, dz);
            if (m <= op.catchR || R.t > op.life) { this.rangCatch(R, H); return; }
            R.dir = { x: dx / m, z: dz / m }; R.spd = Math.min(op.back, R.spd + op.back * dt / 0.25); step = Math.min(step, m);
          }
          const a = { ...R.pos }; R.pos = { x: R.pos.x + R.dir.x * step, z: R.pos.z + R.dir.z * step };
          if (!R.back) { R.trav += step; if (R.trav >= op.dist || this.geo().blocked(R.pos.x, R.pos.z, 0.1)) { if (R.trav < op.dist) R.pos = a; R.back = true; R.spd = op.back * 0.3; call(H, 'turn', { ...R.pos }); } }
          R.path.push({ ...R.pos }); if (R.path.length > 400) R.path.shift();
          call(H, 'set', { ...R.pos }, R.back, R.dir);
          const rec = R.back ? R.ret : R.out, mid = { x: (a.x + R.pos.x) / 2, z: (a.z + R.pos.z) / 2 };
          for (const t of this.circle(mid, step / 2 + op.w / 2 + 1.6)) {
            if (rec.has(t) || segDist(t.pos, a, R.pos) > op.w / 2 + (t.radius || 0.5)) continue;
            rec.add(t); if (R.back) this.log.rangBack++; else this.log.rangOut++;
            this.hit(t, coef, ctx);
            if (!ctx.missed) { call(H, 'hit', { x: t.pos.x, y: (t.pos.y || 0) + 0.9, z: t.pos.z }); this.snd('ph_rang_hit', 0.04); this.touch([t], R.dir, 0.03, 0.1); }
          }
        },
        dispose: () => { if (R.dead) return; R.dead = true; if (this.rang === R) this.rang = null; this.thrown(false); call(H, 'dispose'); } };
      this.thrown(true); call(H, 'throw', { ...start }, f); this.rang = R; this.add(R);
    });
  }
  rangCatch(R, H) {
    R.dead = true; if (this.rang === R) this.rang = null; this.thrown(false); this.log.catch++;
    call(H, 'catch'); this.snd('ph_rang_catch');
    const b = this.pc.body; try { if (b && b.catchOver) b.catchOver(); } catch (e) { }
  }

  // ================================================================== 불꽃심지병
  ph_wick(op, ctx) {
    const pc = this.pc, ht = this.hitT(ctx), aim = this.ground(ctx.aim);
    this.after(ht, () => {
      if (pc.dead) return;
      const held = ctx.heldFlask && !ctx.heldFlask.dead ? ctx.heldFlask : null; let pf = null;   // 손에 든 그 약병이 그대로 날아감 (js/skillrt.js release)
      if (held) { held.dead = true; pf = held.fx; call(pf, 'release'); }
      const from = this.handPos() || { x: pc.pos.x, y: (pc.pos.y || 0) + 1.3, z: pc.pos.z };
      const m = Math.hypot(aim.x - from.x, aim.z - from.z), flight = Math.max(0.3, m / op.speed), arc = Math.min(2.2, flight * 2.6);
      const W = this.fx('wick', { x: aim.x, y: aim.y || 0, z: aim.z }, { r: op.r, ignite: op.ignite, tick: op.tick, ticks: op.ticks, flight, from });
      const B = { dead: false, t: 0, update: (dt) => {
        B.t += dt; const k = Math.min(1, B.t / flight);
        const p = { x: from.x + (aim.x - from.x) * k, y: from.y + ((aim.y || 0) - from.y) * k + Math.sin(k * Math.PI) * arc, z: from.z + (aim.z - from.z) * k };
        call(pf, 'set', p); call(W, 'fly', p);
        if (k >= 1) { B.dead = true; call(pf, 'dispose'); this.wickLand(op, ctx, aim, W); }
      }, dispose: () => { B.dead = true; call(pf, 'dispose'); call(W, 'dispose'); } };
      this.add(B);
    });
  }
  wickLand(op, ctx, c, W) {
    const pc = this.pc, r = op.r, cb = this.eng.book.passive('centerBonus'), coef = coefAt(op, ctx.L), hit = [];
    for (const t of this.circle(c, r)) { const centre = Math.hypot(t.pos.x - c.x, t.pos.z - c.z) < r * 0.35; this.hit(t, op.impact * (centre ? 1 + cb : 1), ctx, { flask: true }); if (!ctx.missed) hit.push(t); }
    this.log.impact++; call(W, 'land', hit.length); this.snd('ph_wick_break'); this.touch(hit, ctx.facing, 0.03, 0.08);
    this.after(0.07, () => this.snd('ph_wick_sizzle'));
    const F = { dead: false, t: 0, n: 0, update: (dt) => {
      F.t += dt;
      while (F.n < op.ticks && F.t >= op.ignite + F.n * op.tick - 1e-9) {
        if (F.n === 0) { call(W, 'ignite'); this.snd('ph_wick_whoomp'); } else this.snd('ph_wick_crackle', 0.2);
        const ts = this.circle(c, r); for (const t of ts) this.dot(t, coef, ctx, 'fire');
        call(W, 'tick', F.n, ts.length); F.n++; this.log.ticks++;
      }
      if (F.n >= op.ticks && F.t >= op.ignite + (op.ticks - 1) * op.tick + 0.25) { F.dead = true; call(W, 'end'); }
    }, dispose: () => { F.dead = true; call(W, 'dispose'); } };
    this.add(F);
  }

  // ================================================================== 서리병 굴리기
  ph_frost(op, ctx) {
    const pc = this.pc, ht = this.hitT(ctx), f = { ...ctx.facing }, len = op.len + this.eng.book.passive('throwRange'), L = ctx.L;
    const start = { x: pc.pos.x + f.x * 0.7, z: pc.pos.z + f.z * 0.7 }, path = frostPath(this.geo(), start, f, len, 0.25);
    const H = this.fx('frost', pc, { from: start, end: path.end, dir: f, wall: path.wall, fanR: op.fanR, fanAng: op.fanAng, w: op.w, ht, trail: op.trail, speed: op.speed });
    this.after(ht, () => {
      if (pc.dead) { call(H, 'dispose'); return; }
      this.snd('ph_frost_roll'); call(H, 'roll0');
      const slow = { id: 'slow', dur: op.slowDur, val: slowAt(op, L), ch: 1 };
      const B = { dead: false, t: 0, pos: { ...start }, trav: 0, last: { ...start }, segs: [], chk: 0, done: false, update: (dt) => {
        B.t += dt;
        if (!B.done) {
          const step = Math.min(op.speed * dt, path.dist - B.trav); B.trav += step; B.pos = { x: B.pos.x + f.x * step, z: B.pos.z + f.z * step };
          call(H, 'roll', { ...B.pos }, B.trav / Math.max(0.01, path.dist));
          if (Math.hypot(B.pos.x - B.last.x, B.pos.z - B.last.z) >= 0.3 || B.trav >= path.dist - 1e-6) { B.segs.push({ a: { ...B.last }, b: { ...B.pos }, born: B.t }); B.last = { ...B.pos }; }
          if (B.trav >= path.dist - 1e-6) { B.done = true; const r = this.frostShatter(op, ctx, path, f); call(H, 'shatter', { ...path.end }, r.hit.length); }
        }
        B.segs = B.segs.filter(s => B.t - s.born < op.trail);
        if ((B.chk -= dt) <= 0 && B.segs.length) {   // 얼음길 위의 적: 둔화(머무는 동안 시간만 갱신)
          B.chk = 0.2;
          for (const t of this.targets(HitShape.circle((start.x + B.pos.x) / 2, (start.z + B.pos.z) / 2, B.trav / 2 + op.w + 1.5)))
            if (B.segs.some(s => segDist(t.pos, s.a, s.b) <= op.w / 2 + (t.radius || 0.5) * 0.6)) this.h.applyStatus(t, slow, pc, 1);
        }
        if (B.done && !B.segs.length) { B.dead = true; call(H, 'end'); }
      }, dispose: () => { B.dead = true; call(H, 'dispose'); } };
      this.add(B);
    });
  }
  frostShatter(op, ctx, path, f) {
    const pc = this.pc, geo = this.geo(), o = { x: path.end.x - f.x * 0.5, z: path.end.z - f.z * 0.5 }, cb = this.eng.book.passive('centerBonus'), coef = coefAt(op, ctx.L), half = op.fanAng / 2;
    const hit = []; let blocked = 0;
    for (const t of this.targets(HitShape.cone(o.x, o.z, f.x, f.z, op.fanR, op.fanAng))) {
      if (!clearLine(geo, o, t.pos)) { blocked++; continue; }   // 벽 너머의 적은 맞지 않음
      const dx = t.pos.x - o.x, dz = t.pos.z - o.z, m = Math.hypot(dx, dz) || 1, ang = Math.acos(Math.max(-1, Math.min(1, (dx * f.x + dz * f.z) / m))) * 180 / Math.PI;
      this.hit(t, coef * (ang <= half / 3 ? 1 + cb : 1), ctx, { flask: true });
      if (!ctx.missed) { hit.push(t); this.h.applyStatus(t, { id: 'slow', dur: op.slowDur + 0.5, val: slowAt(op, ctx.L), ch: 1 }, pc, 1); }
    }
    this.log.shards++; this.log.blocked += blocked;
    this.snd('ph_frost_shatter'); this.lastShatter = { o, hit: hit.length, blocked, wall: path.wall };
    this.touch(hit, f, PH1.stop, 0.12); if (hit.length) this.kick(f.x, f.z);
    return { hit, blocked };
  }

  // ================================================================== 결정침 개화
  ph_crystal(op, ctx) {
    const pc = this.pc, t = ctx.tgt && !ctx.tgt.dead ? ctx.tgt : this.eng.targetFor(ctx.d); if (!t) return;
    const n = op.hits.length, coefs = op.coefs.map((c, k) => k === n - 1 ? lastCoefAt(op, ctx.L) : c);
    const H = this.fx('crystal', t, { pc, hits: op.hits, grow: op.grow });
    this.snd('ph_crystal_grow');
    const C = { dead: false, i: 0, t: 0, update: (dt) => {
      C.t += dt;
      const gone = t.dead || t.zone !== pc.zone || pc.dead || Math.hypot(t.pos.x - pc.pos.x, t.pos.z - pc.pos.z) > op.leash;
      if (gone) { call(H, 'scatter', C.i); C.dead = true; this.log.scatter++; this.snd('ph_crystal_scatter'); return; }
      while (C.i < n && C.t >= op.hits[C.i]) {
        const i = C.i++, last = i === n - 1, dir = { x: t.pos.x - pc.pos.x, z: t.pos.z - pc.pos.z };
        this.hit(t, coefs[i], ctx); this.log.crystal++;
        call(H, 'pierce', i, !ctx.missed); this.snd(last ? 'ph_crystal_shatter' : 'ph_crystal_pierce', 0.02);
        if (!ctx.missed) { this.touch([t], dir, last ? PH1.stopHeavy : 0.025, last ? 0.18 : 0.08); if (last) this.kick(dir.x, dir.z); }
        if (t.dead && C.i < n) { call(H, 'scatter', C.i); C.dead = true; this.log.scatter++; return; }
      }
      if (C.i >= n) C.dead = true;
    }, dispose: () => { if (!C.dead) call(H, 'dispose'); C.dead = true; } };
    this.add(C);
  }

  // ================================================================== 꿈꽃가루
  ph_dream(op, ctx) {
    const pc = this.pc, ht = this.hitT(ctx), f = { ...ctx.facing }, dur = sleepAt(op, ctx.L);
    const H = this.fx('dream', pc, { ht, r: op.r, ang: op.ang, wave: op.wave, f });
    this.after(ht, () => {
      if (pc.dead) { call(H, 'dispose'); return; }
      this.snd('ph_dream_blow'); call(H, 'blow');
      const o = { x: pc.pos.x, z: pc.pos.z }, done = new Set();   // 시전 한 번에 대상마다 한 번
      const W = { dead: false, t: 0, update: (dt) => {
        W.t += dt; const front = op.r * Math.min(1, W.t / op.wave);
        for (const t of this.targets(HitShape.cone(o.x, o.z, f.x, f.z, front, op.ang))) { if (done.has(t)) continue; done.add(t); this.sleep(t, dur); }
        if (W.t >= op.wave) W.dead = true;
      }, dispose: () => { W.dead = true; } };
      this.add(W); W.update(0);
    });
  }
  sleep(t, dur) {
    const ok = this.h.applyStatus(t, { id: 'sleep', dur, val: 1, ch: 1 }, this.pc, 1);
    if (!ok || !t.status.has('sleep')) { this.log.immune++; try { this.G.ui.floatText(t.pos, '면역', '#e8e2d4', 0.9); } catch (e) { } return false; }
    this.log.slept++; try { if (t.cancelAttack) t.cancelAttack(); } catch (e) { }
    if (!this.sleepers.some(s => s.t === t)) this.sleepers.push({ t, h: this.fx('moon', t, {}) });
    this.snd('ph_dream_sleep', 0.15);
    return true;
  }
}
