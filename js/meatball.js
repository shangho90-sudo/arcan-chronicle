// 미트볼 던지기 ck1_b1 (2026-11-14 개편: 라그나로크 '소울 스트라이크' 느낌) — 게임 쪽(시각·경로·피해). 그림은 js/cookfx.js volley.
// 스킬 데이터: custom op `meatball_volley` (tools/skills2/gen.py). 흐름(동작 ck_toss의 팬 튕김 = op 시각 0):
//   팬을 위로 튕김 -> 미트볼 5개가 팬에서 나와 캐릭터 앞 공중에 부채꼴로 벌어짐(MB.spread) -> 잠깐 떠 있음 -> 하나씩 출발해
//   서로 다른 3차 베지어 곡선(왼쪽 위·오른쪽 위·왼쪽·오른쪽·정면 위)으로 같은 한 적에게 날아가 MB.hits 시각에 차례로 맞음.
// 규칙
//   - 맞는 시각(MB.hits)이 먼저 정해지고 출발 시각 = 맞는 시각 - 비행 시간(경로 길이 / 속도, 범위 제한) — 경로 길이가 달라도 순서가 뒤집히지 않음.
//     비행은 처음엔 느리고 적에게 가까울수록 빨라짐(ease). 끝점은 매 프레임 대상의 지금 위치(몸통 높이)라 대상이 움직여도 곡선이 부드럽게 따라감.
//   - 피해는 공이 실제로 닿는 프레임에 한 번(이펙트도 같은 프레임). 총 계수 = coef x (1 + lvBonus x floor((Lv-1)/2)) (예전 split 규칙과 같음),
//     나눔 w = 15/15/15/15/40 %. 한 번 굴린 총 피해(치명타·흔들림 포함)를 나누고 반올림 오차는 마지막 공이 맞춤(skillrt dmg op.volley).
//   - 단일 대상: 주변 적은 맞지 않음. 대상이 죽거나 사라지면 남은 공은 마지막 위치로 날아가 피해 없이 사라짐(다른 적으로 바꾸지 않음).
//   - 상태이상·표식(onHit)은 처음 실제로 맞은 공에서 한 번만. 전역 G.hitStop·addShake 안 씀 — 마지막 공만 대상 freezeT + 아주 약한 카메라 kick.
import { cookTop } from './cookfx.js';

export const MB = {
  n: 5, w: [0.15, 0.15, 0.15, 0.15, 0.40], lvBonus: 0.06,
  spread: 0.17, stagger: 0.012,                         // 팬 -> 부채꼴 자리 (공마다 0.012 s씩 늦게)
  hits: [0.49, 0.605, 0.72, 0.835, 1.005],              // 맞는 시각(팬 튕김 기준). 동작 ck_toss 튕김 0.16 s -> 누른 뒤 0.65·0.765·0.88·0.995·1.165 s
  launchMin: 0.23, launchGap: 0.05, speed: 15, flight: [0.22, 0.42], ease: 0.3,   // 비행: 위치 = s(k) = ease*k + (1-ease)*k^2
  // 부채꼴 자리 [옆(+ = 시전자 오른쪽), 앞, 높이] — 공 i의 자리와 날아오는 쪽을 맞춤(왼쪽 위 공은 왼쪽 위 자리에서)
  slot: [[-0.6, 1.15, 1.8], [0.6, 1.15, 1.8], [-1.1, 0.85, 1.3], [1.1, 0.85, 1.3], [0, 1.3, 2.05]],
  // 곡선 [출발 쪽 옆, 출발 쪽 높이, 출발 쪽 앞(거리 비율), 도착 쪽 옆, 도착 쪽 높이, 도착 쪽 뒤(거리 비율)] — 옆은 A(거리에 비례, 1.0..2.0 m) 배
  arc: [[-0.8, 1.5, 0.25, -0.6, 1.25, 0.15], [0.8, 1.5, 0.25, 0.6, 1.25, 0.15], [-1.5, 0.3, 0.3, -1.2, 0.1, 0.2], [1.5, 0.3, 0.3, 1.2, 0.1, 0.2], [0.1, 2.2, 0.35, 0, 2.0, -0.02]],
  dy: [0.08, 0.12, -0.04, 0.02, 0.16],                  // 맞는 점 높이 차이(몸통 둘레에서 조금씩)
  noTarget: 5.5,                                        // 대상 없이 쓰면 이만큼 앞으로 날아가 사라짐
  stop: 0.045, kick: [0.05, 0.08],                       // 마지막 공: 대상만 짧게 멈춤 + 아주 약한 카메라 킥
  punch: [0.08, 0.16],
};

const bez = (a, b, c, d, s) => { const u = 1 - s; return u * u * u * a + 3 * u * u * s * b + 3 * u * s * s * c + s * s * s * d; };
const bezD = (a, b, c, d, s) => { const u = 1 - s; return 3 * u * u * (b - a) + 6 * u * s * (c - b) + 3 * s * s * (d - c); };

/** custom op: skillrt CUSTOM.meatball_volley */
export function meatballVolley(eng, op, ctx, G) {
  const pc = eng.pc, f = ctx.facing, s = { x: -f.z, z: f.x }, L = ctx.L, n = MB.n;
  const total = (op.coef || 1.7) * (1 + (op.lvBonus ?? MB.lvBonus) * Math.floor((L - 1) / 2));
  const w = op.w || MB.w, hits = op.hits || MB.hits;
  const tgt = ctx.tgt && !ctx.tgt.dead && !ctx.tgt.removed ? ctx.tgt : null;
  const gy = (x, z) => { try { return pc.zone.geo.ground(x, z).y || 0; } catch (e) { return pc.pos.y || 0; } };
  const py = pc.pos.y || gy(pc.pos.x, pc.pos.z);
  // where the pan is (left hand prop, three space -> game), else in front of the chest
  const panAt = () => { const b = pc.body, h = b && b.props && (b.props.L || b.props.R); if (h && h.matrixWorld) { h.updateMatrixWorld(true); const e = h.matrixWorld.elements; return { x: e[12], y: e[13] + 0.1, z: -e[14] }; } return { x: pc.pos.x + f.x * 0.45 + s.x * -0.25, y: py + 1.2, z: pc.pos.z + f.z * 0.45 + s.z * -0.25 }; };
  const pan = panAt();
  const slots = MB.slot.map(([a, b, h]) => ({ x: pc.pos.x + s.x * a + f.x * b, y: py + h, z: pc.pos.z + s.z * a + f.z * b }));
  const V = { w, total: null, crit: false, given: 0 };     // one rolled total, split by w (js/skillrt.js dmg op.volley)
  let last = tgt ? { x: tgt.pos.x, z: tgt.pos.z, y: gy(tgt.pos.x, tgt.pos.z), top: cookTop(tgt), rad: tgt.radius || 0.5 } : { x: pc.pos.x + f.x * MB.noTarget, z: pc.pos.z + f.z * MB.noTarget, y: gy(pc.pos.x + f.x * MB.noTarget, pc.pos.z + f.z * MB.noTarget), top: 0.9, rad: 0.3 };
  const alive = () => tgt && !tgt.dead && !tgt.removed && tgt.zone === pc.zone;
  const track = () => { if (alive()) last = { x: tgt.pos.x, z: tgt.pos.z, y: tgt.pos.y != null ? tgt.pos.y : gy(tgt.pos.x, tgt.pos.z), top: cookTop(tgt), rad: tgt.radius || 0.5 }; };
  /** the curve of ball i from p0 to the target as it is now: [P0, P1, P2, P3] (game coords, y up) */
  const curve = (i, p0) => {
    const torso = Math.max(0.45, Math.min(1.25, last.top * 0.6)) + MB.dy[i];
    const c = { x: last.x, y: last.y + torso, z: last.z }, hx = c.x - p0.x, hz = c.z - p0.z, d = Math.hypot(hx, hz) || 1, u = { x: hx / d, z: hz / d }, sp = { x: -u.z, z: u.x };
    const A = Math.max(1.0, Math.min(2.0, d * 0.45)), [s1, h1, a1, s2, h2, a2] = MB.arc[i];
    const p1 = { x: p0.x + sp.x * s1 * A + u.x * a1 * d, y: p0.y + h1, z: p0.z + sp.z * s1 * A + u.z * a1 * d };
    let p2 = { x: c.x + sp.x * s2 * A - u.x * a2 * d, y: c.y + h2, z: c.z + sp.z * s2 * A - u.z * a2 * d };
    // contact on the near surface of the body, on the side the ball comes from (stays on the model)
    const ix = c.x - p2.x, iz = c.z - p2.z, im = Math.hypot(ix, iz) || 1, off = Math.min(0.45, last.rad * 0.5);
    const p3 = { x: c.x - ix / im * off, y: c.y, z: c.z - iz / im * off };
    p2 = { x: p2.x - ix / im * off, y: p2.y, z: p2.z - iz / im * off };
    return [p0, p1, p2, p3];
  };
  const at = (P, s_, k) => k === 'd' ? { x: bezD(P[0].x, P[1].x, P[2].x, P[3].x, s_), y: bezD(P[0].y, P[1].y, P[2].y, P[3].y, s_), z: bezD(P[0].z, P[1].z, P[2].z, P[3].z, s_) } : { x: bez(P[0].x, P[1].x, P[2].x, P[3].x, s_), y: bez(P[0].y, P[1].y, P[2].y, P[3].y, s_), z: bez(P[0].z, P[1].z, P[2].z, P[3].z, s_) };
  const len = (P) => { let l = 0, a = P[0]; for (let j = 1; j <= 10; j++) { const b = at(P, j / 10); l += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z); a = b; } return l; };
  // schedule: hit times fixed, launch = hit - flight (ordered launches, never before the fan is out)
  const balls = []; let prevL = -1;
  for (let i = 0; i < n; i++) {
    const D0 = Math.max(MB.flight[0], Math.min(MB.flight[1], len(curve(i, slots[i])) / MB.speed));
    const Lt = Math.max(MB.launchMin, hits[i] - D0, prevL + MB.launchGap); prevL = Lt;
    balls.push({ i, L: Lt, H: hits[i], D: Math.max(0.12, hits[i] - Lt), p0: null, pos: { ...pan }, done: false, last: i === n - 1 });
  }
  const fx = G.skillFx && G.skillFx.cook && G.skillFx.cook.volley ? G.skillFx.cook.volley(pc, { n, f, last: n - 1 }) : null;
  const call = (k, ...a) => { try { if (fx && fx[k]) fx[k](...a); } catch (e) { console.warn('cookfx volley', k, e); } };
  const sfx = (name, o) => { try { G.audio.sfx(name, o); } catch (e) { /* no audio */ } };
  call('toss', pan); sfx('ck_ball_toss');
  let t = 0, landed = 0;
  const thing = {
    dead: false,
    update(dt) {
      if (this.dead) return; t += dt; track();
      const lost = pc.dead || !pc.zone;
      for (const b of balls) {
        if (b.done) continue;
        if (lost) { b.done = true; call('fizzle', b.i, b.pos); continue; }
        if (t < b.L) {   // out of the pan into the fan, then hover
          const k = Math.max(0, Math.min(1, (t - b.i * MB.stagger) / MB.spread)), e = 1 - Math.pow(1 - k, 3), sl = slots[b.i];
          const bob = k >= 1 ? Math.sin((t - MB.spread) * 9 + b.i * 1.3) * 0.05 : 0;
          b.pos = { x: pan.x + (sl.x - pan.x) * e, y: pan.y + (sl.y - pan.y) * e + Math.sin(Math.PI * k) * 0.45 + bob, z: pan.z + (sl.z - pan.z) * e };
          call('ball', b.i, b.pos, { phase: 'hover', k });
          continue;
        }
        if (!b.p0) { b.p0 = { ...b.pos }; if (!(b.i % 2) || b.last) sfx('ck_ball_fly', { rate: 0.94 + 0.05 * b.i, gap: 30 }); call('launch', b.i); }
        const k = Math.min(1, (t - b.L) / b.D), s_ = MB.ease * k + (1 - MB.ease) * k * k, P = curve(b.i, b.p0);
        b.pos = at(P, s_);
        call('ball', b.i, b.pos, { phase: 'fly', k, dir: at(P, Math.max(0.02, s_), 'd') });
        if (k < 1) continue;
        // contact (this very frame): damage + the hit read, or nothing to hit -> fade where it is
        b.done = true; const d3 = at(P, 1, 'd'), dm = Math.hypot(d3.x, d3.y, d3.z) || 1, dir = { x: d3.x / dm, y: d3.y / dm, z: d3.z / dm };
        if (!alive()) { call('fizzle', b.i, b.pos); continue; }
        eng.dmg(tgt, total, ctx, { fx: { cook: 'ball' }, volley: V, vi: b.i });
        const ok = !ctx.missed;
        if (ok && !landed++) eng.onHit(tgt, op, ctx);   // statuses / marks once per volley, not five times
        call('hit', b.i, b.pos, dir, b.last, ok);
        if (!ok) continue;
        if (tgt.body && tgt.body.punch) tgt.body.punch(dir.x, dir.z, b.last ? MB.punch[1] : MB.punch[0]);
        if (b.last) {
          if (!tgt.dead) tgt.freezeT = Math.max(tgt.freezeT || 0, MB.stop);
          if (G.render && G.render.kick && !G.reduceFlash) G.render.kick(dir.x, dir.z, MB.kick[0], MB.kick[1]);
          sfx('ck_ball_fin');
        } else sfx('ck_ball_hit', { rate: [1, 1.07, 1.13, 1.2][b.i] || 1, gap: 40 });
      }
      if (balls.every(b => b.done)) { this.dead = true; call('end'); }
    },
    dispose() { if (this.dead) return; this.dead = true; for (const b of balls) if (!b.done) { b.done = true; call('fizzle', b.i, b.pos); } call('end'); },
  };
  eng.things.push(thing);
  ctx.volley = { balls, V };   // tests / tools read the schedule
  return thing;
}
