// 한약사 2차 스킬 규칙 (2026-11-16 개편 '본초 도사'): 비전 탕약과 경락(A) · 본초 영물술(B) · 오행 침구술(C).
// 스킬 데이터는 tools/skills2/gen.py (hb_*, CUSTOM 'herb' — op.k = 칸 이름), 실행은 js/skillrt.js 가 이 파일의 HerbalKit 을 부름(eng.herbal).
// 그림은 js/herbalfx.js — 이 파일은 렌더링을 직접 하지 않는다: fx(kind, a, o) 가 null 을 돌려줘도(메시 로딩 전·테스트) 규칙은 그대로.
//
// 규칙 요약
//  * 여러 메시·여러 송이·여러 뿌리로 그려도 피해는 정해진 횟수만: 적마다 한 시전에 한 번(청룡승근·황정지맥·주작천구·현무약해),
//    자운화는 틱마다 적마다 한 번, 백호유침은 대상마다 침 4개(총 계수는 예전 4타와 같음).
//  * 소환물(반룡근·천년삼 동자·녹각수호령)은 '생명 소환물'(living) — 회복·정화·대주천·신농백초원 강화를 받는다. 씨앗 -> 성장 -> 완성:
//    그림의 완성 시각 = 실제로 행동을 시작하는 시각(grow 초). 반룡근은 2개까지(다시 쓰면 가장 오래된 것을 바꿈), 동자·수호령은 1개
//    (다시 쓰면 지금 것의 시간·체력을 새로 채움). 전체 소환물은 엔진 규칙대로 8개까지.
//  * 대상이 죽으면 다음 판단(0.25 초)에서 가장 가까운 유효한 적으로 바꿈. 방어력이 깎인 적(백호유침)을 먼저 노림.
//  * 지형 충돌을 따라 움직이고(zone.geo.move), 주인에게서 16 m 넘게 떨어지거나 높이가 다르면(보스 전장 결계 안) 주인 곁에서 다시 자람.
//  * 정리: 주인 사망·존 이동(skillrt clearTemp) -> 소환물·약초 영역·투사체·타이머 모두 정리. 영역이 끝나면 그 강화도 바로 풀림.
//  * 보스: 속박 -> 둔화(상태 규칙 boss 'slow'), 도발 안 됨(noBossTaunt, actors.js Monster.player), 밀려나지 않음(엔진 dmg 규칙).
//  * 약초 영역(herb: 백초 훈증진·자운화)은 현무약해가 지나가면 +2 초 — 한 시전에 영역마다 한 번(시전 기록), 영역마다 누적 최대 +4 초.
//  * 2026-11-20 처방 5종(사용자 기획): A1 탕약 나누기(두 잔 — 남은 한 잔 보관·같은 칸 다시 누르면 내가 마심, 비용·대기는 처음 한 번),
//    A2 보중익기탕(기력 틱 회복 — 움직여도 이어짐 + 가까운 생명 소환물 가속), A3 구풍해독탕(고른 영물 또는 나: 근접 거리만큼 일반 몬스터를
//    한 번 밀고 보호막 한 번 — 도발 중인 수호령에게 끌린 적은 밀지 않음), C3 오령산(다섯 물길이 가운데로 끌어모으고 만나는 순간 적마다 한 번),
//    C4 소경활혈탕(대상 하나 세 마디 — 셋째 마디에 방어력 감소 'defdown' = 주작천구 vsDefdown 이 보는 그 상태).
//    '고른 영물' = pc.allyTarget(actors.js onClick → game.js Zone.pickAlly, 내 생명 소환물을 누르면 고르고 다시 누르면 풂).
import { HitShape, StatusSet } from './core.js';

export const HERB = {
  think: 0.25,            // 소환물이 대상을 다시 고르는 간격(초)
  leash: 16,              // 주인과 이만큼 떨어지면 주인 곁에서 다시 자람(m)
  regrow: 0.45,           // 다시 자라는 시간(초)
  focusDefdown: 3,        // 방어력 감소(백호유침) 걸린 적을 이만큼(m) 더 가깝게 여김 — 소환물 집중
  ownerPick: 2,           // 주인이 고른 대상을 이만큼(m) 더 가깝게 여김
  buffCap: 0.5,           // 신농백초원 소환물 피해 강화 상한(다른 강화와 max, 더하지 않음)
  summonCap: 8,
  hop: { period: 0.36, air: 0.62, speed: 4.4 },   // 천년삼 동자: 깡충 — 공중에 있는 동안만 앞으로 감(미끄러지지 않음)
  deer: { speed: 4.0 },
  stop: 0.05, stopHeavy: 0.07, kick: [0.06, 0.08], kickHeavy: [0.09, 0.1],   // 강한 타격 순간만: 시전자·대상만 잠깐(초), 카메라 한 번 [m, 초]
  sfxGap: { hb_root: 0.25, hb_needle: 0.12, hb_tak: 0.08, hb_drop: 0.15, heal: 0.9, hb_simmer: 1.2, magic: 0.3, fire: 0.2, splash: 0.2, hb_bloom: 0.5 },   // 같은 소리 반복 제한(초)
};
const durL = (d, L) => d * (1 + 0.05 * (Math.max(1, L) - 1));
const call = (h, m, ...a) => { try { return h && h[m] ? h[m](...a) : null; } catch (e) { console.warn('herbalfx', m, e); return null; } };
const norm = (x, z) => { const m = Math.hypot(x, z) || 1; return { x: x / m, z: z / m }; };

/** 약초 영역 연장(순수): 시전 기록 rec(Set)에 없을 때만, 영역의 누적 연장이 cap을 넘지 않게. 늘어난 초를 돌려줌 */
export function extendField(f, sec, cap, rec) {
  if (!f || f.dead || !f.herb) return 0;
  if (rec) { if (rec.has(f.uid)) return 0; rec.add(f.uid); }
  const k = Math.max(0, Math.min(sec, cap - (f.ext || 0))); if (k <= 0) return 0;
  f.ext = (f.ext || 0) + k; f.life += k; return k;
}
/** 소환물 강화(순수): 신농백초원 영역 안이면 그 값, 여러 영역은 max, 상한 HERB.buffCap */
export function summonBuff(s, fields) {
  let b = 0; for (const f of fields) if (f.kind === 'garden' && !f.dead && f.ready && Math.hypot(s.pos.x - f.c.x, s.pos.z - f.c.z) <= f.r) b = Math.max(b, f.empower || 0);
  return Math.min(HERB.buffCap, b);
}
/** 대상 고르기(순수): 거리 - 방어력 감소 보너스 - 주인 대상 보너스, range 안에서 가장 작은 값 */
export function pickTarget(from, list, range, ownerT) {
  let best = null, bd = 1e9;
  for (const c of list) {
    if (!c || c.dead) continue; const d = Math.hypot(c.pos.x - from.x, c.pos.z - from.z) - (c.radius || 0.5);
    if (d > range) continue;
    const s = d - (c.status && c.status.has && c.status.has('defdown') ? HERB.focusDefdown : 0) - (c === ownerT ? HERB.ownerPick : 0);
    if (s < bd) { bd = s; best = c; }
  }
  return best;
}

let UID = 0;
export class HerbalKit {
  constructor(eng, h) { this.eng = eng; this.h = h; this.reset(); }
  reset() { this.fields = []; this.things = []; this.timers = []; this.armor = null; this.cycle = null; this.cup = null; this.mark = null; this.sfxT = {}; this.log = { ext: 0 }; }
  get pc() { return this.eng.pc; }
  get G() { return this.h.G(); }
  get clock() { return this.eng.clock; }
  fx(kind, a, o) { try { return this.h.fx ? this.h.fx(kind, a, o) : null; } catch (e) { console.warn('herbalfx', kind, e); return null; } }
  sfx(n) { const g = HERB.sfxGap[n] || 0; if (g && this.clock - (this.sfxT[n] ?? -9) < g) return; this.sfxT[n] = this.clock; try { this.G.audio.sfx(n); } catch (e) { } }
  later(t, f) { this.timers.push({ t, f }); }
  ground(x, z) { try { return this.pc.zone.geo.ground(x, z); } catch (e) { return { x, y: 0, z }; } }
  blocked(x, z, r = 0.1) { try { return this.pc.zone.geo.blocked(x, z, r); } catch (e) { return false; } }
  status(id) { return this.eng.data.status(id); }
  apply(t, id, dur, val, lvMul = 1) { return this.h.applyStatus(t, { id, dur, val, ch: 1 }, this.pc, lvMul); }
  healPow() { const pc = this.pc; return Math.max(pc.sheet && pc.sheet.final ? pc.sheet.final.healPower || 0 : 0, pc.stat ? pc.stat('healPower') || 0 : 0); }
  get summons() { return this.eng.summons.filter(s => s.herbal && !s.dead); }
  /** 직접 피해 한 번(전역 히트스톱·무작위 흔들림 없음 — quiet). 실제로 맞았는지(MISS 아님) 돌려줌 */
  hit(t, coef, ctx, extra = {}) { if (!t || t.dead) return false; this.eng.dmg(t, coef, ctx, { quiet: true, ...extra }); return !ctx.missed; }
  /** 강한 타격 순간만: 시전자·맞은 대상만 잠깐 멈추고 카메라 한 번 (전역 G.hitStop / addShake 안 씀) */
  impact(ts, f, heavy) {
    const pc = this.pc, G = this.G, s = heavy ? HERB.stopHeavy : HERB.stop, k = heavy ? HERB.kickHeavy : HERB.kick;
    if (!ts.length) return;
    pc.freezeT = Math.max(pc.freezeT || 0, s);
    for (const t of ts) if (!t.dead) { t.freezeT = Math.max(t.freezeT || 0, s); if (t.body && t.body.punch) t.body.punch(t.pos.x - pc.pos.x, t.pos.z - pc.pos.z, heavy ? 0.18 : 0.12); }
    if (G.render && G.render.kick && !G.reduceFlash) G.render.kick(f.x, f.z, k[0], k[1]);
  }
  handPoint() { const pc = this.pc; let h = null; try { h = pc.body && pc.body.handPoint && pc.body.handPoint(); } catch (e) { h = null; } return h ? { x: h.x, y: h.y, z: -h.z } : { x: pc.pos.x + pc.facing.x * 0.35, y: (pc.pos.y || 0) + 1.1, z: pc.pos.z + pc.facing.z * 0.35 }; }

  // ------------------------------------------------------------------ dispatch (CUSTOM 'herb')
  cast(op, ctx) { const f = this['k_' + op.k]; if (f) return f.call(this, op, ctx); console.warn('herb: unknown', op.k); }
  /** 누른 순간의 준비 동작(op.what): 씨앗 뿌리기 / 쑥뜸 불붙이기 / 어깨 뒤 침 펼치기 / 호리병 */
  k_pre(op, ctx) { ctx.herbPre = this.fx('pre', this.pc, { what: op.what, lead: -(op.at || 0), facing: ctx.facing, aim: ctx.aim, hand: () => this.handPoint() }); }

  // ================================================================== A. 비전 탕약과 경락
  /** 고른 내 생명 소환물(사거리 안·살아 있음) — 없으면 null */
  allySel(range) { const pc = this.pc, a = pc.allyTarget; return a && !a.dead && a.living && this.eng.summons.includes(a) && Math.hypot(a.pos.x - pc.pos.x, a.pos.z - pc.pos.z) <= range + (a.radius || 0.4) ? a : null; }
  /** 탕약을 받을 영물: 고른 영물 우선, 없으면 다친(체력 < 최대) 생명 소환물 중 체력 비율이 가장 낮은 것(사거리 안) */
  allyFor(range) {
    const sel = this.allySel(range); if (sel) return sel; const pc = this.pc; let best = null, br = 1;
    for (const s of this.eng.summons) { if (!s || s.dead || !s.living || Math.hypot(s.pos.x - pc.pos.x, s.pos.z - pc.pos.z) > range + (s.radius || 0.4)) continue; const r = s.hp / Math.max(1, s.maxHp); if (r < br - 1e-9) { br = r; best = s; } }
    return best;
  }
  k_a1(op, ctx) {   // 탕약 나누기: 한 잔은 내가 바로, 한 잔은 영물에게(날아가 닿는 순간) — 받을 영물이 없으면 남은 한 잔을 들고 있음
    const pc = this.pc, self = pc.maxHp * op.selfHeal * ctx.mult * (1 + this.healPow()), t = this.allyFor(op.range);
    pc.heal(self); this.sfx('hb_pour'); ctx.a1 = { self, to: t };
    const fx = this.fx('cups', pc, { hand: () => this.handPoint(), to: t, keep: !t, hold: op.hold });
    if (t) {
      const from = this.handPoint(), kit = this, amt = t.maxHp * op.ally * ctx.mult;
      const cup = { pos: { x: from.x, y: from.y, z: from.z }, dead: false, t: 0, update(dt) {
        if (this.dead) return; this.t += dt; if (t.dead) { this.dead = true; call(fx, 'spill'); return; }
        const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z, m = Math.hypot(dx, dz), st = op.speed * dt;
        if (m <= Math.max(0.35, st) || this.t > 3) { this.dead = true; t.heal(amt); kit.log.a1 = { ...(kit.log.a1 || {}), ally: t.kind, amount: amt, at: kit.clock }; call(fx, 'arrive', t); kit.sfx('hb_drop'); try { kit.G.ui.damageText(t.pos, '+' + Math.round(amt), 'heal'); } catch (e) { } return; }
        this.pos = { x: this.pos.x + dx / m * st, y: this.pos.y, z: this.pos.z + dz / m * st }; call(fx, 'fly', this.pos, t);
      }, dispose() { this.dead = true; } };
      this.things.push(cup);
    } else { this.cup = { t: op.hold, max: op.hold, n: self, fx }; }
    this.log.a1 = { self, ally: t ? t.kind : null, kept: !t };
  }
  /** 같은 칸을 다시 누름: 남은 한 잔만 마심(기력·재사용 대기 없음, skillrt cast 첫 줄). 성공 = null */
  drinkStored() {
    const pc = this.pc, c = this.cup; if (!c) return '남은 잔이 없습니다'; if (pc.dead) return ''; if (pc.stunned) return '행동 불가 상태';
    pc.heal(c.n); this.cup = null; call(c.fx, 'drink'); this.sfx('hb_drop'); this.log.drink = { n: c.n, at: this.clock };
    try { if (pc.body && pc.body.sh && pc.body.sh.actions.hb_lift) pc.body.play('hb_lift', 1.6, true); } catch (e) { }
    return null;
  }
  /** 퀵슬롯 '남은 한 잔' 표시(skillui.js): 남은 초, 없으면 0 */
  cupLeft(id) { return id === 'hb_a1' && this.cup ? Math.max(0.01, this.cup.t) : 0; }
  k_a2(op, ctx) {   // 보중익기탕: 잔을 드는 순간부터 every 초마다 기력 ticks 번(움직여도 이어짐) + 가까운 생명 소환물 가속
    const pc = this.pc, dk = 1 + 0.05 * (ctx.L - 1), per = op.mp * dk, dur = durL(op.dur, ctx.L), hv = op.haste * ctx.mult;
    const near = this.summons.filter(s => s.living && Math.hypot(s.pos.x - pc.pos.x, s.pos.z - pc.pos.z) <= op.near);
    for (const s of near) this.apply(s, 'haste', dur, hv);
    const fx = this.fx('tonic', pc, { ticks: op.ticks, every: op.every, summons: near, dur });
    const rec = this.log.a2 = { ticks: 0, mp: 0, summons: near.length, haste: hv, dur, per };
    for (let i = 0; i < op.ticks; i++) this.later(i * op.every, () => {
      if (pc.dead) return; const b = pc.sp; pc.sp = Math.min(pc.maxSp, pc.sp + per); rec.ticks++; rec.mp += pc.sp - b;
      call(fx, 'tick', i); if (i === 0) this.sfx('hb_steam');
      try { this.G.ui.floatText(pc.pos, '기력 +' + Math.round(per), '#ffd870', 0.8, 1.9); } catch (e) { }
    });
  }
  /** 구풍해독탕 반경: 대상의 근접 공격 거리 정도(소환물 o.range + 반지름, 나 = 1.6 m), [reachMin, reachMax] */
  reachOf(t, op) { const r = t === this.pc ? op.reachMin : ((t.o && t.o.range) || 1.6) + (t.radius || 0.4); return Math.max(op.reachMin, Math.min(op.reachMax, r)); }
  /** 그 수호령이 끌어모은(도발 중인) 적 — actors.js Monster.player 와 같은 규칙 */
  tauntedBy(e, s) { return !!(s && s.taunt && !s.dead && Math.hypot(e.pos.x - s.pos.x, e.pos.z - s.pos.z) < 7 && !(s.noBossTaunt && (e.isBoss || (e.def && e.def.questBoss)))); }
  k_a3(op, ctx) {   // 구풍해독탕: 고른 영물에게 약액 한 줄기 -> 닿는 순간 잎이 바깥으로 한 번 + 보호막 / 고른 영물이 없으면 나를 중심으로 바로
    const pc = this.pc, t = this.allySel(op.range), rec = ctx.a3 = { to: t ? t.kind : 'self', pushed: 0, kept: 0, shield: 0 };
    const fx = this.fx('purge', pc, { hand: () => this.handPoint(), to: t });
    if (!t) return this.purgeBurst(pc, op, ctx, fx, rec);
    const from = this.handPoint(), kit = this;
    this.things.push({ pos: { ...from }, dead: false, t: 0, update(dt) {
      if (this.dead) return; this.t += dt; const tt = t.dead ? pc : t;
      const dx = tt.pos.x - this.pos.x, dz = tt.pos.z - this.pos.z, m = Math.hypot(dx, dz), st = op.speed * dt;
      if (m <= Math.max(0.3, st) || this.t > 3) { this.dead = true; kit.purgeBurst(tt, op, ctx, fx, rec); return; }
      this.pos = { x: this.pos.x + dx / m * st, y: this.pos.y, z: this.pos.z + dz / m * st }; call(fx, 'fly', this.pos, tt);
    }, dispose() { this.dead = true; call(fx, 'dispose'); } });
  }
  purgeBurst(t, op, ctx, fx, rec) {
    if (rec.done) return; rec.done = true; const pc = this.pc, R = this.reachOf(t, op), pushed = [];
    for (const e of this.eng.targets(HitShape.circle(t.pos.x, t.pos.z, R))) {
      if (e.dead || e.isBoss || (e.def && e.def.questBoss)) continue;
      if (this.tauntedBy(e, t)) { rec.kept++; if (e.body && e.body.punch) e.body.punch(e.pos.x - t.pos.x, e.pos.z - t.pos.z, 0.06); continue; }   // 수호령의 대형 유지: 끌린 적은 그 자리(살짝 움찔만)
      const dx = e.pos.x - t.pos.x, dz = e.pos.z - t.pos.z, m = Math.hypot(dx, dz) || 1;
      e.knock = { x: dx / m * op.push * 10, z: dz / m * op.push * 10 }; e.hitReact = Math.max(e.hitReact || 0, 0.35); pushed.push(e); rec.pushed++;
    }
    const sp = pc.sheet && pc.sheet.final ? pc.sheet.final.shieldPower || 0 : 0, n = Math.round(t.maxHp * (op.shield + (op.shieldLv || 0) * (ctx.L - 1)) * (1 + sp));
    t.addShield(n, op.shieldDur); rec.shield = n; rec.reach = R; rec.at = this.clock;
    call(fx, 'burst', t, { r: R, pushed: pushed.map(e => e.pos), shieldDur: op.shieldDur }); this.sfx('hb_leaf');
    try { this.G.ui.floatText(t.pos, '보호막 ' + n, '#ffd890', 0.85, 1.9); } catch (e) { }
    this.log.a3 = rec;
  }
  k_a4(op, ctx) {   // 백초 훈증진 (하나만 — 다시 쓰면 교체)
    for (const f of this.fields) if (f.kind === 'steam') this.endField(f);
    const c = this.ground(ctx.aim.x, ctx.aim.z), dur = durL(op.dur, ctx.L);
    const f = this.addField({ kind: 'steam', herb: true, c, r: op.r, life: dur + op.grow, grow: op.grow, tick: op.tick, next: 0, op, ctx });
    f.fx = this.fx('steam', c, { r: op.r, dur: f.life, grow: op.grow });
    this.sfx('hb_simmer');
  }
  tickSteam(f) {
    const pc = this.pc, op = f.op, k = f.ctx.mult, healed = [], cleansed = [];
    if (!pc.dead && Math.hypot(pc.pos.x - f.c.x, pc.pos.z - f.c.z) <= f.r + 0.3) {
      pc.heal(pc.maxHp * op.heal * k * (1 + this.healPow())); healed.push(pc);
      if (this.cleanse(pc)) cleansed.push(pc);
    }
    for (const s of this.eng.summons) if (s.living && !s.dead && Math.hypot(s.pos.x - f.c.x, s.pos.z - f.c.z) <= f.r + 0.3) {
      s.hp = Math.min(s.maxHp, s.hp + s.maxHp * op.heal * k); healed.push(s);
      if (this.cleanse(s)) cleansed.push(s);
    }
    f.heals = (f.heals || 0) + healed.length; f.cleansed = (f.cleansed || 0) + cleansed.length;
    call(f.fx, 'pulse', healed.map(x => x.pos), cleansed.map(x => x.pos));
    if (healed.length) this.sfx('heal');
  }
  cleanse(t) { const st = t.status; if (!st || !st.list) return false; const s = st.list.find(x => x.def.debuff && x.def.cleanse !== false); if (!s) return false; st.remove(s.def.id); return true; }
  k_a5(op, ctx) {   // 백초귀원: 약초가 둥글게 펼쳐짐 -> 금빛 환약 -> 몸에 흡수되는 순간(absorb) 큰 회복 + 강화 -> 빛의 약초꽃
    const pc = this.pc; ctx.herbFx = this.fx('pill', pc, { absorb: op.absorb });
    this.sfx('hb_resonance');
    this.later(op.absorb, () => {
      if (pc.dead) return;
      const n = pc.maxHp * op.heal * ctx.mult * (1 + this.healPow()); pc.heal(n);
      const dur = durL(op.dur, ctx.L);
      this.apply(pc, 'atkup', dur, op.atk * ctx.mult); this.apply(pc, 'defup', dur, op.def_ * ctx.mult); this.apply(pc, 'healup', dur, op.healup);
      call(ctx.herbFx, 'absorb'); this.sfx('hb_bloom');
      this.log.a5 = { heal: n, dur, at: this.clock };
    });
  }

  // ================================================================== B. 본초 영물술
  spawn(kind, op, ctx, p) {
    const eng = this.eng, pc = this.pc;
    const mine = this.summons.filter(s => s.kind === kind);
    if (op.limit === 1 && mine.length) { const s = mine[0]; s.refresh(ctx); return s; }   // 1개짜리: 지금 것을 새로 채움
    while (mine.length >= (op.limit || 1)) mine.shift().vanish(false);                  // 여러 개: 가장 오래된 것을 바꿈
    const alive = eng.summons.filter(s => !s.dead); if (alive.length >= HERB.summonCap) alive[0].vanish(false);
    const s = new HerbSummon(this, kind, op, ctx, p); eng.summons.push(s); pc.zone.actors.push(s); return s;
  }
  spot(base, r) {   // 막히지 않은 자리(주변을 돌며 찾음, 없으면 주인 자리)
    const pc = this.pc; if (!this.blocked(base.x, base.z, r)) return this.ground(base.x, base.z);
    for (let k = 1; k <= 8; k++) { const a = k * 0.785; const x = base.x + Math.cos(a) * 1.0, z = base.z + Math.sin(a) * 1.0; if (!this.blocked(x, z, r)) return this.ground(x, z); }
    return this.ground(pc.pos.x, pc.pos.z);
  }
  k_b1(op, ctx) { const s = this.spawn('root', op, ctx, this.spot(ctx.aim, 0.4)); this.sfx('hb_root'); return s; }
  k_b2(op, ctx) {   // 독초·자운화 (하나만)
    for (const f of this.fields) if (f.kind === 'bloom') this.endField(f);
    const c = this.ground(ctx.aim.x, ctx.aim.z), dur = durL(op.dur, ctx.L);
    const f = this.addField({ kind: 'bloom', herb: true, c, r: op.r, life: dur + op.grow, grow: op.grow, tick: op.tick, next: 0, op, ctx });
    f.fx = this.fx('bloom', c, { r: op.r, dur: f.life, grow: op.grow, tick: op.tick });
  }
  tickBloom(f) {   // 틱마다: 적마다 한 번(꽃 송이 수와 무관) 피해 + 중독 + 공격력 감소, 포자 고리와 같은 순간
    const op = f.op, ts = this.eng.targets(HitShape.circle(f.c.x, f.c.z, f.r)), hit = [];
    for (const t of ts) { this.hit(t, op.coef, f.ctx, { elem: 'poison' }); if (t.dead) continue; this.eng.onHit(t, { st: [{ id: 'poison', dur: op.poisonDur, val: op.poison, ch: 1 }, { id: 'atkdown', dur: op.poisonDur, val: op.atkdown, ch: 1 }] }, f.ctx); hit.push(t); }
    f.hits = (f.hits || 0) + ts.length; f.ticks = (f.ticks || 0) + 1;
    call(f.fx, 'spore', hit.map(t => t.pos));
    if (hit.length) this.sfx('magic');
  }
  k_b3(op, ctx) { const pc = this.pc, f = ctx.facing; const s = this.spawn('ginseng', op, ctx, this.spot({ x: pc.pos.x - f.x * 1.1 + f.z * 0.9, z: pc.pos.z - f.z * 1.1 - f.x * 0.9 }, 0.35)); this.sfx('hb_root'); return s; }
  k_b4(op, ctx) { const s = this.spawn('deer', op, ctx, this.spot(ctx.aim, 0.7)); this.sfx('hb_root'); return s; }
  k_b5(op, ctx) {   // 신농백초원: 시전 순간 뿌리 한 번 + 둔화 영역 + 안의 내 소환물 강화
    for (const f of this.fields) if (f.kind === 'garden') this.endField(f);
    const pc = this.pc, c = this.ground(pc.pos.x, pc.pos.z), dur = durL(op.dur, ctx.L);
    const f = this.addField({ kind: 'garden', c, r: op.r, life: dur, grow: 0, tick: op.tick, next: 0, op, ctx, empower: op.empower });
    f.fx = this.fx('garden', c, { r: op.r, dur });
    const ts = this.eng.targets(HitShape.circle(c.x, c.z, op.r)), hit = [];
    for (const t of ts) if (this.hit(t, op.coef, ctx, { elem: 'wood' })) hit.push(t);
    call(f.fx, 'erupt', ts.map(t => t.pos));
    this.impact(hit, ctx.facing, true); this.sfx('hb_root');
    this.log.b5 = { hit: ts.length };
  }
  tickGarden(f) { const op = f.op; for (const t of this.eng.targets(HitShape.circle(f.c.x, f.c.z, f.r))) this.h.applyStatus(t, { id: 'slow', dur: op.tick * 1.5, val: op.slow, ch: 1 }, this.pc, f.ctx.mult); }

  // ================================================================== C. 오행 침구술
  k_c1(op, ctx) {   // 목행·청룡승근: 앞쪽 일직선으로 뿌리가 차례로, 마지막은 청룡 머리. 적마다 한 번
    const pc = this.pc, o = { ...pc.pos }, f = ctx.facing, step = 1.2, n = Math.max(2, Math.ceil((op.len - 0.9) / step) + 1);
    let last = n - 1; for (let i = 0; i < n; i++) { const d = 0.9 + i * step; if (this.blocked(o.x + f.x * d, o.z + f.z * d, 0.2)) { last = Math.max(0, i - 1); break; } }
    const reach = Math.min(op.len, 0.9 + last * step + 0.6), done = new Set(), rec = { hits: 0, bonus: 0 }; ctx.c1 = rec;
    const fx = this.fx('dragonLine', o, { f, n: last + 1, step, gap: op.step, w: op.w, ground: (x, z) => this.ground(x, z).y });
    for (let i = 0; i <= last; i++) this.later(i * op.step, () => {
      if (pc.dead) return; const d = Math.min(reach, 0.9 + i * step + 0.6), hit = [];
      for (const t of this.eng.targets(HitShape.rect(o.x, o.z, f.x, f.z, op.w, d))) {
        if (done.has(t)) continue; done.add(t);
        const bound = t.status && t.status.has('root'); if (bound) rec.bonus++;
        if (this.hit(t, op.coef * (bound ? op.vsRoot : 1), ctx, { elem: 'wood' })) hit.push(t); rec.hits++;
      }
      call(fx, 'root', i, i === last, hit.map(t => t.pos));
      if (i === last || hit.length) this.sfx('hb_root');
      if (hit.length) this.impact(hit, f, i === last);
    });
  }
  k_c2(op, ctx) {   // 화행·주작천구: 손의 쑥뜸 -> 주작이 낮게 날아감 -> 첫 적·조준점·벽에서 날개 모양 불꽃
    const pc = this.pc, from = this.handPoint(), to = { ...ctx.aim }, dir = norm(to.x - from.x, to.z - from.z), dist = Math.hypot(to.x - from.x, to.z - from.z);
    const fx = this.fx('bird', from, { dir, pre: ctx.herbPre });
    const kit = this, p = { pos: { x: from.x, z: from.z }, trav: 0, dead: false,
      update(dt) {
        if (this.dead) return; const s = op.speed * dt; this.pos = { x: this.pos.x + dir.x * s, z: this.pos.z + dir.z * s }; this.trav += s;
        call(fx, 'set', { x: this.pos.x, y: kit.ground(this.pos.x, this.pos.z).y + 0.9, z: this.pos.z });
        let at = null; for (const c of kit.pc.zone.actors) if (c && !c.dead && c.faction !== 'player' && !c.isSummon && Math.hypot(c.pos.x - this.pos.x, c.pos.z - this.pos.z) <= c.radius + 0.5) { at = { ...c.pos }; break; }
        if (!at && this.trav >= dist) at = { ...to };
        if (!at && kit.blocked(this.pos.x, this.pos.z, 0.1)) at = { ...this.pos };
        if (at) { this.dead = true; kit.birdImpact(at, dir, op, ctx, fx); }
      }, dispose() { this.dead = true; call(fx, 'dispose'); } };
    this.things.push(p);
  }
  birdShapes(c, dir, op) { const px = -dir.z, pz = dir.x; return [HitShape.circle(c.x, c.z, op.core), HitShape.rect(c.x - px * op.wing / 2 - dir.x * op.depth / 2, c.z - pz * op.wing / 2 - dir.z * op.depth / 2, px, pz, op.depth, op.wing)]; }
  birdImpact(c, dir, op, ctx, fx) {
    const sh = this.birdShapes(c, dir, op), ts = this.eng.zoneTargets ? null : null, hit = [], seen = new Set();
    void ts;
    for (const s of sh) for (const t of this.eng.targets(s)) {
      if (seen.has(t)) continue; seen.add(t);
      const dd = t.status && t.status.has('defdown');
      if (this.hit(t, op.coef * (dd ? op.vsDefdown : 1), ctx, { elem: 'fire' })) { hit.push(t); if (!t.dead) this.eng.onHit(t, { st: [{ id: 'burn', dur: op.burnDur, val: op.burn, ch: 1 }] }, ctx); }
    }
    const g = this.ground(c.x, c.z); call(fx, 'impact', { x: c.x, y: g.y, z: c.z }, { dir, wing: op.wing, core: op.core, depth: op.depth, hits: hit.map(t => t.pos) });
    this.sfx('fire'); this.impact(hit, dir, true);
    ctx.c2 = { at: c, hit: seen.size };
  }
  k_c3(op, ctx) {   // 오령산: 다섯 약인 -> 물길이 가운데로(run 초) 일반 몬스터를 끌어당김 -> 만나는 순간 마지막 물결(적마다 한 번)
    const pc = this.pc, c = this.ground(ctx.aim.x, ctx.aim.z), f = ctx.facing, a0 = Math.atan2(f.z, f.x), kit = this;
    const seals = []; for (let i = 0; i < 5; i++) { const a = a0 + i * Math.PI * 2 / 5; seals.push(this.ground(c.x + Math.cos(a) * op.r, c.z + Math.sin(a) * op.r)); }
    const rec = ctx.c3 = { pulled: new Set(), hits: 0, dmg: new Map(), at: null, c }; this.log.c3 = rec;
    const fx = this.fx('wuling', c, { r: op.r, run: op.run, seals }); this.sfx('hb_seal');
    const imm = e => e.isBoss || (e.def && e.def.questBoss);
    this.things.push({ t: 0, dead: false, update(dt) {
      if (this.dead) return; this.t += dt; if (pc.dead) { this.dead = true; call(fx, 'end'); return; }
      const left = Math.max(0.06, op.run - this.t);
      for (const e of kit.eng.targets(HitShape.circle(c.x, c.z, op.r + 0.4))) {   // 끌어당김(보스·퀘스트 보스는 강제 이동 면역)
        if (imm(e)) continue; const dx = c.x - e.pos.x, dz = c.z - e.pos.z, m = Math.hypot(dx, dz), stop = op.stop + (e.radius || 0.5) * 0.6;
        if (m <= stop) { e.knock = { x: 0, z: 0 }; continue; }
        const v = Math.min(op.vmax, (m - stop) / left); e.knock = { x: dx / m * v, z: dz / m * v }; rec.pulled.add(e);
      }
      call(fx, 'flow', Math.min(1, this.t / op.run));
      if (this.t >= op.run) { this.dead = true; kit.wulingWave(c, op, ctx, fx, rec); }
    }, dispose() { this.dead = true; call(fx, 'end'); } });
  }
  wulingWave(c, op, ctx, fx, rec) {   // 물길이 만나는 순간: 범위 안 적마다 한 번(물길 다섯이 겹쳐도)
    const hit = [], seen = new Set(); rec.at = this.clock;
    for (const t of this.eng.targets(HitShape.circle(c.x, c.z, op.r))) { if (seen.has(t)) continue; seen.add(t);
      const before = t.taken ? t.taken.length : 0; void before; const ok = this.hit(t, op.coef, ctx, { elem: 'water' }); rec.hits++; rec.dmg.set(t, (rec.dmg.get(t) || 0) + 1); if (ok) hit.push(t); }
    call(fx, 'surge', hit.map(t => t.pos)); this.sfx('hb_surge'); this.impact(hit, ctx.facing, true);
  }
  k_c4(op, ctx) {   // 소경활혈탕: 대상 몸 위 맥로 — 세 마디가 times 초에 차례로(탁·탁·반 박자 뒤 크게), 셋째 = 큰 피해 + 방어력 감소
    const pc = this.pc, t = ctx.tgt || this.eng.targetFor(ctx.d); const rec = ctx.c4 = { nodes: [], defdown: false }; this.log.c4 = rec;
    if (!t) return;
    const fx = this.fx('meridian', t, { times: op.times, from: this.handPoint() });
    op.times.forEach((at, i) => this.later(at, () => {
      const last = i === op.times.length - 1;
      if (pc.dead || t.dead || Math.hypot(t.pos.x - pc.pos.x, t.pos.z - pc.pos.z) > op.lose) { call(fx, 'fade'); rec.nodes.push({ i, ok: false, gone: true }); return; }
      const ok = this.hit(t, op.coefs[i], ctx, { elem: 'metal' });
      rec.nodes.push({ i, ok, at: this.clock, pos: { ...t.pos } });
      if (last && ok && !t.dead) { this.apply(t, 'defdown', op.defdownDur, op.defdown); rec.defdown = true; }
      call(fx, 'node', i, ok, last); this.sfx(last ? 'hb_node' : 'hb_tak');
      if (ok) this.impact([t], norm(t.pos.x - pc.pos.x, t.pos.z - pc.pos.z), last);
    }));
  }
  k_c5(op, ctx) {   // 수행·현무약해: 넓고 낮은 물결이 앞으로 — 적마다 한 번, 지나간 약초 영역마다 한 번 연장
    const pc = this.pc, o = { ...pc.pos }, f = ctx.facing, done = new Set(), rec = new Set(), kit = this; ctx.c5 = { hits: 0, ext: [] };
    const fx = this.fx('wave', o, { f, len: op.len, w: op.w, speed: op.speed });
    const p = { s: 0.4, dead: false, update(dt) {
      if (this.dead) return; const s0 = this.s; this.s = Math.min(op.len, this.s + op.speed * dt);
      const cx = o.x + f.x * this.s, cz = o.z + f.z * this.s;
      if (kit.blocked(cx, cz, 0.3)) this.s = op.len;   // 벽에서 멈춤
      call(fx, 'front', this.s);
      for (const t of kit.eng.targets(HitShape.rect(o.x, o.z, f.x, f.z, op.w, this.s))) {
        if (done.has(t)) continue; done.add(t); ctx.c5.hits++;
        if (kit.hit(t, op.coef, ctx, { elem: 'water', knock: op.knock }) && !t.dead) kit.eng.onHit(t, { st: [{ id: 'slow', dur: op.slowDur, val: op.slow, ch: 1 }] }, ctx);
        call(fx, 'splash', t.pos);
      }
      for (const fl of kit.fields) if (fl.herb && !fl.dead) {   // 물결 앞이 영역 원에 닿으면(앞 거리 >= 영역 쪽 가장자리, 옆으로 겹침)
        const al = (fl.c.x - o.x) * f.x + (fl.c.z - o.z) * f.z, lat = Math.abs((fl.c.x - o.x) * f.z - (fl.c.z - o.z) * f.x);
        if (lat <= op.w / 2 + fl.r && al - fl.r <= this.s && al + fl.r >= s0 - 0.01 && al + fl.r >= 0) { const k = extendField(fl, op.extend, op.extendCap, rec); if (k > 0) { kit.log.ext += k; ctx.c5.ext.push([fl.kind, k]); call(fl.fx, 'extend', k); call(fx, 'feed', fl.c); } }
      }
      if (this.s >= op.len) { this.dead = true; call(fx, 'end'); }
    }, dispose() { this.dead = true; call(fx, 'dispose'); } };
    this.things.push(p); this.sfx('splash');
  }

  // ------------------------------------------------------------------ fields
  addField(o) { this.fields = this.fields.filter(x => !x.dead); const f = { uid: ++UID, ext: 0, dead: false, ready: !(o.grow > 0), maxLife: o.life, ...o }; this.fields.push(f); return f; }
  endField(f) { if (f.dead) return; f.dead = true; call(f.fx, 'end'); }
  tickFields(dt) {
    const pc = this.pc;
    for (const f of this.fields) {
      if (f.dead) continue; f.life -= dt; f.age = (f.age || 0) + dt;
      if (!f.ready && f.age >= f.grow) f.ready = true;
      if (f.life <= 0) { this.endField(f); continue; }
      if (f.kind === 'ward') { if (Math.hypot(pc.pos.x - f.c.x, pc.pos.z - f.c.z) <= f.r) this.apply(pc, 'dmgreduce', 0.6, f.op.dr); }
      if (!f.ready) continue;
      f.next -= dt; if (f.next > 0) continue; f.next += f.tick;
      if (f.kind === 'steam') this.tickSteam(f); else if (f.kind === 'bloom') this.tickBloom(f); else if (f.kind === 'garden') this.tickGarden(f);
    }
    this.fields = this.fields.filter(f => !f.dead);
  }

  // ------------------------------------------------------------------ frame
  tick(dt) {
    for (const t of this.timers.slice()) { t.t -= dt; if (t.t <= 0) { this.timers.splice(this.timers.indexOf(t), 1); try { t.f(); } catch (e) { console.error('herb timer', e); } } }
    for (const p of this.things) p.update(dt);
    this.things = this.things.filter(p => !p.dead);
    this.tickFields(dt);
    if (this.armor) { this.armor.t -= dt; if (this.armor.t <= 0 || !this.pc.status.has('defup')) { call(this.armor.fx, 'end'); this.armor = null; } }
    if (this.cycle) { this.cycle.t -= dt; if (this.cycle.t <= 0) { call(this.cycle.fx, 'end'); this.cycle = null; } }
    if (this.cup) { this.cup.t -= dt; if (this.cup.t <= 0 || this.pc.dead) { call(this.cup.fx, 'expire'); this.cup = null; } }   // 남은 한 잔: 보관 시간이 끝나면 원래 아이콘
    { const pc = this.pc, a = pc.allyTarget; if (a && (a.dead || !this.eng.summons.includes(a))) pc.allyTarget = null;   // 고른 영물 표시(발밑 금빛 고리)
      if (pc.allyTarget !== (this.mark && this.mark.s)) { if (this.mark) call(this.mark.fx, 'end'); this.mark = pc.allyTarget ? { s: pc.allyTarget, fx: this.fx('allyMark', pc.allyTarget, {}) } : null; } }
    // 신농백초원: 영역 안의 소환물만 강화 — 들어오고 나가는 그 프레임에 켜고 끔
    for (const s of this.summons) { const b = summonBuff(s, this.fields); if (b !== s.herbBuff) { s.herbBuff = b; call(s.view, 'buff', b > 0); } }
  }
  clear() {
    for (const t of this.things) t.dispose && t.dispose();
    for (const f of this.fields) this.endField(f);
    if (this.armor) call(this.armor.fx, 'end'); if (this.cycle) call(this.cycle.fx, 'end'); if (this.cup) call(this.cup.fx, 'expire'); if (this.mark) call(this.mark.fx, 'end');
    try { if (this.pc) this.pc.allyTarget = null; } catch (e) { }
    this.reset();
  }
}

// ------------------------------------------------------------------ 생명 소환물 (zone.actors 안에서 움직임, faction player)
let SUID = 0;
const KIND = {
  root: { r: 0.5, move: false },      // 갈근·반룡근: 제자리, 범위 안 적을 묶고 묾
  ginseng: { r: 0.35, move: true },   // 천년삼 동자: 깡충깡충, 뿌리 채찍, 주인 회복
  deer: { r: 0.7, move: true },       // 영지·녹각수호령: 도발(보스 제외), 들이받기 + 발구르기 부채꼴
};
export class HerbSummon {
  constructor(kit, kind, op, ctx, p) {
    const pc = kit.pc; this.kit = kit; this.eng = kit.eng; this.kind = kind; this.o = op; this.ctx = ctx; this.zone = pc.zone; this.uid = 's' + (++SUID);
    this.pos = { x: p.x, y: p.y || 0, z: p.z }; this.radius = KIND[kind].r; this.faction = 'player'; this.isSummon = true; this.herbal = true; this.living = true; this.machine = false;
    this.taunt = kind === 'deer'; this.noBossTaunt = true; this.fly = false;
    this.status = new StatusSet(); this.shield = 0; this.dead = false; this.invuln = 0; this.knock = { x: 0, z: 0 }; this.herbBuff = 0;
    this.facing = { ...ctx.facing }; this.target = null; this.think = 0; this.t = 0; this.hopT = 0; this.moved = 0; this.log = { hits: 0, heals: 0, stomps: 0, rams: 0 };
    this.setup(ctx);
    this.view = kit.fx(kind, this, { grow: this.growT });
  }
  setup(ctx) {
    const op = this.o, pc = this.kit.pc; this.ctx = ctx;
    this.maxHpV = Math.max(10, pc.maxHp * (op.hp || 0.5) * ctx.mult); this.hp = this.maxHpV;
    this.life = durL(op.life || 10, ctx.L); this.growT = op.grow || 0.5; this.age = 0; this.cd = 0; this.cd2 = (op.stompEvery || 0) * 0.5; this.healT = 0;
  }
  /** 다시 부름(1개짜리): 시간·체력을 새로 채움 — 자리는 그대로, 짧게 다시 피어남(행동은 계속) */
  refresh(ctx) { const age = this.age; this.setup(ctx); this.age = Math.max(age, this.growT); if (this.view && this.view.refresh) this.view.refresh(); }
  get maxHp() { return this.maxHpV; }
  get ready() { return this.age >= this.growT; }
  stat(s) { const pc = this.kit.pc; if (s === 'def') return pc.stat('def') * 0.6; if (s === 'dmgReduce') return 0; if (s === 'moveSpeed') return (this.kind === 'deer' ? HERB.deer.speed : HERB.hop.speed) * (1 + this.status.bonus('moveSpeed')) * this.status.slow; return pc.stat(s); }
  get stunned() { return this.status.stunned; }
  dist(o) { return Math.hypot(this.pos.x - o.pos.x, this.pos.z - o.pos.z); }
  takeDamage(d) {
    if (this.dead || d.missed) return; let a = Math.max(0, d.amount || 0);
    if (this.shield > 0 && !d.dot) { const k = Math.min(this.shield, a); this.shield -= k; a -= k; if (this.view && this.view.shieldHit) this.view.shieldHit(); if (a <= 0) { try { this.kit.G.ui.floatText(this.pos, '흡수', '#8ce6ff', 0.8); } catch (e) { } return; } }   // 구풍해독탕 보호막
    this.hp -= a;
    try { this.kit.G.ui.floatText(this.pos, Math.round(a) + '', '#ffb0b0', 0.8); } catch (e) { }
    if (this.view && this.view.hurt) this.view.hurt();
    if (this.hp <= 0) this.vanish(false);
  }
  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }
  addShield(n, d) { this.shield = Math.max(this.shield || 0, n); this.shieldT = d; }
  setFacing(x, z) { const m = Math.hypot(x, z); if (m > 1e-4) this.facing = { x: x / m, z: z / m }; }
  get body() { return null; }
  get xz() { return this.pos; }
  destroy() { this.vanish(false); }
  vanish(silent) {
    if (this.dead) return; this.dead = true; this.hp = 0;
    const i = this.zone.actors.indexOf(this); if (i >= 0) this.zone.actors.splice(i, 1);
    if (this.view) { if (silent && this.view.dispose) this.view.dispose(); else if (this.view.wilt) this.view.wilt(); else if (this.view.dispose) this.view.dispose(); }
  }
  enemies() { return this.zone.actors.filter(c => c && !c.dead && c.faction !== 'player' && !c.isSummon); }
  hitTarget(t, coef, extra = {}) {
    const ctx = { ...this.ctx, mult: this.ctx.mult * (1 + Math.min(HERB.buffCap, this.herbBuff || 0)) };
    this.eng.dmg(t, coef, ctx, { quiet: true, derived: false, ...extra }); this.log.hits++;
    return !ctx.missed;
  }
  update(dt) {
    if (this.dead) return;
    const pc = this.kit.pc, o = this.o; this.t += dt; this.age += dt; this.life -= dt;
    if (this.life <= 0 || pc.dead || pc.zone !== this.zone) return this.vanish(pc.zone !== this.zone);
    if (this.shieldT > 0) { this.shieldT -= dt; if (this.shieldT <= 0) this.shield = 0; }
    this.status.tick(dt, s => { if (!this.dead) this.takeDamage({ amount: Math.max(1, s.value), dot: true }); }, s => this.heal(s.value));
    if (this.dead) return;
    // 주인과 너무 멀어지거나 높이가 다르면(보스 전장 결계) 주인 곁에서 다시 자람
    if (this.kind !== 'root' && (this.dist(pc) > HERB.leash || Math.abs((pc.pos.y || 0) - (this.pos.y || 0)) > 1.2)) {
      const f = pc.facing, p = this.kit.spot({ x: pc.pos.x - f.x * 1.2 + f.z * 0.8, z: pc.pos.z - f.z * 1.2 - f.x * 0.8 }, this.radius);
      this.pos = { x: p.x, y: p.y, z: p.z }; this.age = Math.min(this.age, this.growT - HERB.regrow); this.target = null; if (this.view && this.view.regrow) this.view.regrow(); this.log.regrow = (this.log.regrow || 0) + 1;
    }
    this.moving = false;
    if (this.ready && !this.stunned) {
      this.cd -= dt; this.think -= dt;
      if (this.think <= 0 || !this.target || this.target.dead) { this.think = HERB.think; this.target = this.pick(); }
      if (this.kind === 'root') this.upRoot(dt); else if (this.kind === 'ginseng') this.upGinseng(dt); else this.upDeer(dt);
    }
    if (this.view && this.view.sync) this.view.sync(this);
  }
  pick() {
    const pc = this.kit.pc, R = this.kind === 'root' ? this.o.range : 9, ot = pc.target && !pc.target.dead ? pc.target : null;
    return pickTarget(this.pos, this.enemies(), R, ot);
  }
  upRoot() {   // 제자리: 범위 안 적 하나를 묶고 묾
    const t = this.target, o = this.o; if (!t || this.cd > 0) return;
    if (this.dist(t) - t.radius > o.range) { this.target = null; return; }
    this.cd = o.rate; this.face(t.pos);
    const ok = this.hitTarget(t, o.coef, { elem: 'wood' });
    if (ok && !t.dead) this.kit.h.applyStatus(t, { id: 'root', dur: o.root, val: 0, ch: 1 }, this.kit.pc);
    if (this.view && this.view.bite) this.view.bite(t, ok); this.kit.sfx('hb_root');
  }
  upGinseng(dt) {
    const pc = this.kit.pc, o = this.o, t = this.target;
    // 주인 회복: healEvery 초마다 금빛 약방울이 주인에게 날아가 닿을 때 회복(소리는 반복 제한)
    this.healT += dt;
    if (this.healT >= o.healEvery) { this.healT = 0; const n = pc.maxHp * o.heal * this.ctx.mult; const k = this.kit; this.log.heals++;
      if (this.view && this.view.cheer) this.view.cheer();
      k.later(0.45, () => { if (!pc.dead && !this.dead) { pc.heal(n * (1 + k.healPow())); k.sfx('heal'); } });
      call(k.fx('drop', this, { to: pc, t: 0.45 }), 'noop'); }
    if (t) {
      const d = this.dist(t) - t.radius;
      if (d > o.range) this.hopTo(t.pos, dt);
      else { this.face(t.pos); if (this.cd <= 0) { this.cd = o.rate; const ok = this.hitTarget(t, o.coef, { elem: 'wood' }); if (this.view && this.view.whip) this.view.whip(t, ok); } }
    } else if (this.dist(pc) > 2.4) this.hopTo({ x: pc.pos.x - pc.facing.x * 1.2 + pc.facing.z * 0.9, z: pc.pos.z - pc.facing.z * 1.2 - pc.facing.x * 0.9 }, dt);
  }
  hopTo(p, dt) {   // 깡충: 공중 구간에서만 앞으로(평균 속도 = stat moveSpeed)
    const H = HERB.hop, dx = p.x - this.pos.x, dz = p.z - this.pos.z, m = Math.hypot(dx, dz); if (m < 0.15) return;
    this.face(p); this.moving = true; this.hopT = (this.hopT + dt / H.period) % 1;
    const air = this.hopT < H.air ? 1 / H.air : 0, k = Math.min(m, this.stat('moveSpeed') * dt * air);
    if (k > 0) this.step(dx / m * k, dz / m * k);
  }
  upDeer(dt) {
    const o = this.o, t = this.target, pc = this.kit.pc; this.cd2 -= dt;
    if (t) {
      const d = this.dist(t) - t.radius;
      if (d > o.range) { this.walk(t.pos, dt); }
      else {
        this.face(t.pos);
        if (this.cd2 <= 0) { this.cd2 = o.stompEvery; this.stomp(t); }
        else if (this.cd <= 0) { this.cd = o.rate; const ok = this.hitTarget(t, o.coef, { elem: 'wood' }); this.log.rams++; if (this.view && this.view.ram) this.view.ram(t, ok); if (ok && !t.dead && t.body && t.body.punch) t.body.punch(this.facing.x, this.facing.z, 0.14); }
      }
    } else if (this.dist(pc) > 3.2) this.walk({ x: pc.pos.x + pc.facing.z * 1.6, z: pc.pos.z - pc.facing.x * 1.6 }, dt);
  }
  stomp(t) {   // 발구르기: 뿌리가 정면 부채꼴로 — 적마다 한 번
    const o = this.o, f = this.facing, sh = HitShape.cone(this.pos.x, this.pos.z, f.x, f.z, o.stompR, o.stompAng), hit = [];
    for (const x of this.eng.targets(sh)) if (this.hitTarget(x, o.stomp, { elem: 'wood' })) hit.push(x);
    this.log.stomps++; if (this.view && this.view.stomp) this.view.stomp({ f, r: o.stompR, ang: o.stompAng, hits: hit.map(x => x.pos) }); this.kit.sfx('hb_root');
    void t;
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
export function herbText(d, L) {
  const ult = d.type === 'ultimate', m = 1 + (ult ? 0.25 : 0.12) * (L - 1), o = (d.ops || []).find(x => x.fn === 'herb' && x.k !== 'pre'); if (!o) return '';
  const D = v => sec(durL(v, L)), out = [];
  switch (o.k) {
    case 'a1': out.push(`내 잔: 최대 HP의 ${pct(o.selfHeal * m)} 회복`, `영물 잔: 그 영물 최대 HP의 ${pct(o.ally * m)} 회복(사거리 ${o.range} m — 고른 영물, 없으면 가장 다친 영물)`, `받을 영물이 없으면 남은 한 잔 ${sec(o.hold)} 보관 — 같은 칸을 다시 누르면 내가 마심(최대 HP의 ${pct(o.selfHeal * m)}, 기력·재사용 대기 없음)`); break;
    case 'a2': { const dk = 1 + 0.05 * (L - 1); out.push(`기력 +${Math.round(o.mp * dk)} × ${o.ticks}번(${sec(o.every)} 간격, 총 ${Math.round(o.mp * dk * o.ticks)} — 움직여도 이어짐)`, `나와 ${o.near} m 안 생명 소환물 이동 속도 +${pct(o.haste * m)} ${D(o.dur)}`); break; }
    case 'a3': out.push(`고른 영물(사거리 ${o.range} m) 또는 나를 중심으로`, `반경 = 대상 근접 거리(${o.reachMin}~${o.reachMax} m) 안 일반 몬스터 ${o.push} m 밀어냄(보스 제외, 한 번)`, `보호막 대상 최대 HP의 ${pct(o.shield + (o.shieldLv || 0) * (L - 1))} ${sec(o.shieldDur)}(한 번)`, '도발 중인 녹각수호령: 끌린 적은 밀지 않음'); break;
    case 'a4': out.push(`반경 ${o.r} m`, `${sec(o.tick)}마다 최대 HP의 ${pct(o.heal * m)} 회복 + 해로운 상태 1개 정화(나·생명 소환물)`, `지속 ${D(o.dur)}`, '현무약해로 최대 +4초'); break;
    case 'a5': out.push(`흡수 순간 최대 HP의 ${pct(o.heal * m)} 회복`, `공격력 +${pct(o.atk * m)} · 방어력 +${pct(o.def_ * m)} · 회복량 +${pct(o.healup)}`, `지속 ${D(o.dur)}`); break;
    case 'b1': out.push(`뿌리 물기 ${pct(o.coef * m)}/${sec(o.rate)} · 사거리 ${o.range} m`, `속박 ${sec(o.root)}(보스는 둔화)`, `${D(o.life)} · 최대 ${o.limit}개`); break;
    case 'b2': out.push(`반경 ${o.r} m · ${sec(o.tick)}마다 ${pct(o.coef * m)}`, `중독(지속 피해 ${pct(o.poison * m)}) + 공격력 -${pct(o.atkdown * m)} ${sec(o.poisonDur)}`, `지속 ${D(o.dur)}`, '현무약해로 최대 +4초'); break;
    case 'b3': out.push(`뿌리 채찍 ${pct(o.coef * m)}/${sec(o.rate)}`, `${sec(o.healEvery)}마다 주인 최대 HP의 ${pct(o.heal * m)} 회복`, `${D(o.life)} · 체력 내 최대 HP의 ${pct(o.hp * m)}`); break;
    case 'b4': out.push(`들이받기 ${pct(o.coef * m)}/${sec(o.rate)}`, `발구르기 부채꼴 ${o.stompR} m ${o.stompAng}° ${pct(o.stomp * m)}/${sec(o.stompEvery)}`, '일반 몬스터 도발(보스 제외)', `${D(o.life)} · 체력 내 최대 HP의 ${pct(o.hp * m)}`); break;
    case 'b5': out.push(`반경 ${o.r} m · 시전 순간 뿌리 ${pct(o.coef * m)}`, `적 이동 속도 -${pct(Math.min(0.7, o.slow * m))}`, `안의 내 식물·영물 소환물 피해 +${pct(Math.min(HERB.buffCap, o.empower))}`, `지속 ${D(o.dur)}`); break;
    case 'c1': out.push(`직선 ${o.len} m · ${pct(o.coef * m)}(적마다 1번)`, `속박된 적 ×${o.vsRoot}`); break;
    case 'c2': out.push(`${pct(o.coef * m)} · 날개 폭 ${o.wing} m`, `화상 ${sec(o.burnDur)}`, `방어력 감소 대상 ×${o.vsDefdown}`); break;
    case 'c3': out.push(`반경 ${o.r} m · 약인 5개`, `${sec(o.run)} 동안 일반 몬스터를 가운데로 끌어당김(보스 제외)`, `물길이 만나는 순간 ${pct(o.coef * m)}(적마다 1번)`); break;
    case 'c4': out.push(`대상 하나 세 마디: ${o.coefs.map(c => pct(c * m)).join(' · ')} (총 ${pct(o.coefs.reduce((a, b) => a + b, 0) * m)})`, `셋째 마디: 방어력 -${pct(o.defdown)} ${sec(o.defdownDur)}(주작천구 추가 피해 조건)`); break;
    case 'c5': out.push(`물결 ${o.len} m × ${o.w} m · ${pct(o.coef * m)}`, `밀어냄(보스 제외) · 둔화 ${pct(o.slow * m)} ${sec(o.slowDur)}`, `지나간 약초 영역 +${sec(o.extend)}(영역마다 최대 +${sec(o.extendCap)})`); break;
  }
  return out.join(' · ');
}
