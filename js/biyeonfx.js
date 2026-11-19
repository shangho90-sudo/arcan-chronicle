// 비연참 (nv_a3) 원반 (2026-11-19, 사용자 '테일즈위버 비 — 떨어진 적을 원형 물체로 때리는 손맛'): a thin blue-white
// spinning disc thrown one-handed. Single target, one projectile, one hit (skill data unchanged: 340 %, 14 SP, 7 s).
//
// How the picture and the real hit fit together:
//   * cast(): from the press the disc FORMS on the real sword tip (bladePoints) — a small spinning disc that grows while
//     the arm pulls back and extends (nv_biyeon in tools/anim/swings.py, release 0.20 s). At the release it hides.
//   * proj(): the disc that rides SkillProj (js/skillrt.js). SkillProj starts it on the same sword tip (op.fromTip) and
//     flies it straight at the target's torso (op.track); flight time = contact distance / 24 m/s clamped to 0.12-0.38 s
//     (op.flight). Collision = horizontal distance <= target radius + disc radius (op.w / 2), and the last step stops
//     exactly there -> the frame the LEADING RIM touches the body is the damage frame (damage, hit sound, hit reaction).
//   * hit (handle.hit + BiyeonFx.hit): on that same frame the disc turns its face to the camera (round outline) with a
//     rim flash, its inside clears at once and it fades by 0.14 s (the hit pose stays visible); one thin ring at the contact point no wider than the target's body (radius) and
//     4-6 small light chips. Only for an enemy really damaged (MISS: the disc just turns and fades).
//   * flight look: a slightly tilted ellipse that never collapses to a line — the disc lies almost flat (normal = up) and
//     banks 15 deg about its flight direction toward the camera; seen from the 44 deg game camera the minor/major ratio
//     stays ~0.65-0.9 for any screen direction. Rim = bright blue-white, inside = pale translucent sky (centre a bit more
//     see-through), a bright crescent on one side of the rim turns with the spin (22 rad/s), a faint dark halo outside the
//     rim keeps it readable on bright town floors. Short afterimage: 3 fading copies 1-3 frames behind.
// Everything is procedural (one small shader, no texture / GLB). Pooled slots; own xorshift random (never Math.random).
// Low spec (phone / "그래픽 효과" off): 2 afterimages, 4 chips. "섬광 효과 줄이기": dimmer flash.
// (The old crescent-fan assets assets/fx/fx_biyeon.* / tools/blender/fx_biyeon.py are no longer used.)
import * as THREE from 'three';

export const BIYEON = { rim: 0x4fb8ff, inner: 0x6cc8ff, halo: 0x0a2850, diam: 0.7, spin: 22, bank: 0.26, tilt: 0.1, intensity: 1, speed: 1 };
/** impact point (GAME coords) of a disc flying along f = {x, z} (unit) into actor t: front of the body at torso height. */
export function biyeonImpact(t, f) {
  const r = t.radius || 0.5;
  return { x: t.pos.x - f.x * r, y: (t.pos.y || 0) + Math.min(1.3, 0.6 + r * 0.55), z: t.pos.z - f.z * r };
}

const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
// mode 0 = disc (rim + translucent inside + spinning crescent + dark halo), 1 = soft glow, 2 = thin ring, 3 = 4-point chip
const FS = `
uniform vec3 uRim, uIn, uHalo; uniform float uA, uSpin, uFlash, uI, uMode, uGhost, uW, uInner;
varying vec2 vUv;
void main(){
  vec2 p = (vUv - .5) * 2.2; float r = length(p);
  vec3 c = vec3(0.); float a = 0.;
  if (uMode < .5) {
    if (r > 1.1) discard;
    float aa = max(fwidth(r) * 1.2, .015);
    float inside = 1. - smoothstep(1. - aa, 1. + aa, r);
    float rim = smoothstep(.72 - aa, .82, r) * inside;                       // blue-white band
    float edge = smoothstep(.86, .91, r) * (1. - smoothstep(.95, .99, r));     // thin white line in the band
    float body = 1. - smoothstep(.74, .80, r);
    float ang = atan(p.y, p.x) - uSpin;
    float cres = smoothstep(.45, .97, cos(ang)) * smoothstep(.52, .74, r) * inside * (1. - uGhost);   // bright crescent, turns with the spin
    float swirl = .5 + .5 * sin(ang * 3. + r * 7.);
    float halo = smoothstep(.97, 1.01, r) * (1. - smoothstep(1.04, 1.1, r));
    float aIn = body * (.2 + .3 * smoothstep(.0, .7, r)) * (1. - .7 * uGhost) * uInner;
    vec3 cIn = uIn * (.8 + .35 * swirl * (1. - uGhost));
    vec3 cRim = uRim * (1.25 + 1.2 * uFlash);
    c = cIn * aIn + cRim * rim * .9 * (1. - .8 * cres) + vec3(1.6) * edge * .7 * (1. - .5 * uGhost) + vec3(2.6) * cres;
    a = max(max(aIn, rim * .92), cres * .95);
    c += uHalo * .2 * halo; a = max(a, halo * .62 * (1. - .85 * uGhost));
  } else if (uMode < 1.5) {
    float g = exp(-r * r * 5.); c = mix(uIn, vec3(1.), .5) * 1.6 * g; a = g * .55;
  } else if (uMode < 2.5) {
    float d = abs(r - .9), w = uW; float k = 1. - smoothstep(w * .45, w, d); if (r > 1.1) discard;
    c = mix(uRim, vec3(1.), .45) * 1.9 * k; a = k * .95;
  } else {
    float s = max(0., 1. - (abs(p.x) * 4.5 + abs(p.y)) ) + max(0., 1. - (abs(p.y) * 4.5 + abs(p.x)));
    s = clamp(s, 0., 1.); c = mix(uRim, vec3(1.), .5) * 1.9 * s; a = s * .85;
  }
  gl_FragColor = vec4(c * uI * uA, clamp(a * uA, 0., 1.));
}`;

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const easeOut = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
let seed = 0x9e3779b9; const rnd = (a, b) => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return a + ((seed >>> 0) / 4294967296) * (b - a); };
const lite = () => { const G = window.G; return !!(G && ((G.input && G.input.mobile) || (G.settings && G.settings.graphicsFx === false))); };
const flashK = () => { const G = window.G; return G && G.reduceFlash ? 0.6 : 1; };
const rawK = () => { const G = window.G; return G && G.settings && G.settings.graphicsFx === false ? 0.7 : 1; };
const cam = () => { const G = window.G; return G && G.render && G.render.cam ? G.render.cam : null; };
const UP = new THREE.Vector3(0, 1, 0), ZA = new THREE.Vector3(0, 0, 1);
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _f = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const PLANE = new THREE.PlaneGeometry(1, 1);

/** unit vector from p toward the camera (render coords) */
function toCam(p, out) { const c = cam(); if (!c) return out.set(0, 0.72, 0.69); out.copy(c.position).sub(p); return out.lengthSq() > 1e-6 ? out.normalize() : out.set(0, 1, 0); }
/** disc normal in flight: almost flat, banked about the flight direction toward the camera (+ a small lean to the camera) */
const _side = new THREE.Vector3();
function bankSign(p, fx, fz) { const v = toCam(p, _v); _f.set(fx, 0, fz).normalize(); return _side.crossVectors(_f, UP).dot(v) >= -0.02 ? 1 : -1; }
function flightNormal(p, fx, fz, out, sgn) {
  const v = toCam(p, _v); _f.set(fx, 0, fz).normalize();   // sgn (chosen once at launch): bank so the face turns to the camera
  _q.setFromAxisAngle(_f, BIYEON.bank * sgn); out.copy(UP).applyQuaternion(_q);
  return out.lerp(v, BIYEON.tilt).normalize();
}

export class BiyeonFx {
  constructor(root) { this.root = root; this.live = []; this.free = { cast: [], proj: [], hit: [] }; this.ready = true; this.loading = null; }
  load() { return this.loading || (this.loading = Promise.resolve()); }   // procedural: nothing to download
  _mat(mode, order) {
    const m = new THREE.ShaderMaterial({
      uniforms: { uRim: { value: new THREE.Color(BIYEON.rim) }, uIn: { value: new THREE.Color(BIYEON.inner) }, uHalo: { value: new THREE.Color(BIYEON.halo) },
        uA: { value: 0 }, uSpin: { value: 0 }, uFlash: { value: 0 }, uI: { value: 1 }, uMode: { value: mode }, uGhost: { value: 0 }, uW: { value: 0.08 }, uInner: { value: 1 } },
      vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation,
    });
    const me = new THREE.Mesh(PLANE, m); me.frustumCulled = false; me.renderOrder = order; me.visible = false; return me;
  }
  /** pose a disc mesh: centre p (render), normal n, diameter d (the quad is 1.1 x the disc) */
  _disc(me, p, n, d) { me.position.copy(p); me.quaternion.setFromUnitVectors(ZA, n); me.scale.setScalar(Math.max(0.001, d * 1.1)); }
  _bill(me, p, s) { const c = cam(); me.position.copy(p); if (c) me.quaternion.copy(c.quaternion); me.scale.setScalar(Math.max(0.001, s)); }
  // ------------------------------------------------------------------ cast: the disc forms on the sword tip
  _castSlot() { let s = this.free.cast.pop(); if (s) return s; s = { kind: 'cast', g: new THREE.Group() }; s.disc = this._mat(0, 12); s.glow = this._mat(1, 11); s.g.add(s.glow, s.disc); return s; }
  /** pos/dir GAME coords; o.follow = caster (its sword tip), o.swing = release time (s). Returns the slot. */
  cast(pos, dir, o = {}) {
    const s = this._castSlot(); s.t = 0; s.follow = o.follow || null; s.swing = o.swing ?? 0.2; s.k = flashK() * rawK() * BIYEON.intensity; s.spin = rnd(0, 6.28);
    s.tip = new THREE.Vector3(pos.x, (pos.y || 0) + 1.0, -pos.z); this._tip(s); this.root.add(s.g); this.live.push(s); this._castTick(s, 0); return s;
  }
  _tip(s) { const a = s.follow; if (!a || a.dead) return; let b = null; try { b = a.body && a.body.bladePoints && a.body.bladePoints(); } catch (e) { b = null; } if (b && b[1]) s.tip.copy(b[1]); }
  _castTick(s, dt) {
    const t = s.t, sw = s.swing, U = m => m.material.uniforms; this._tip(s);
    // grows 0 -> 55 % of full size from sw - 0.16 to the release, spinning, face toward the camera; hides at the release
    const g = smooth(sw - 0.17, sw - 0.01, t), on = t < sw, d = BIYEON.diam * (0.12 + 0.43 * g);
    s.spin += dt * BIYEON.spin;
    this._disc(s.disc, s.tip, toCam(s.tip, _n), d); U(s.disc).uA.value = on ? smooth(sw - 0.17, sw - 0.1, t) : 0; U(s.disc).uSpin.value = s.spin; U(s.disc).uI.value = s.k; U(s.disc).uFlash.value = 0.4 * g; s.disc.visible = U(s.disc).uA.value > 0.003;
    // a soft glow at the tip, flaring at the release and gone 0.08 s later
    const ga = smooth(sw - 0.2, sw - 0.02, t) * (1 - smooth(sw, sw + 0.08, t));
    this._bill(s.glow, s.tip, 0.35 + 0.35 * smooth(sw - 0.05, sw, t)); U(s.glow).uA.value = ga * 0.8; U(s.glow).uI.value = s.k; s.glow.visible = ga > 0.003;
    return t < sw + 0.1;
  }
  // ------------------------------------------------------------------ proj: the flying disc (SkillProj.fx)
  _projSlot() {
    let s = this.free.proj.pop(); if (s) return s;
    s = { kind: 'proj', g: new THREE.Group() }; s.disc = this._mat(0, 13); s.ghosts = [0, 1, 2].map(i => this._mat(0, 12 - i)); s.g.add(s.disc, ...s.ghosts); return s;
  }
  /** pos/dir GAME coords; o.diam = disc diameter (= the projectile's collision width). Handle { set, hit, dispose }. */
  proj(pos, dir, o = {}) {
    const s = this._projSlot(), m = Math.hypot(dir.x, dir.z) || 1;
    s.t = 0; s.k = flashK() * rawK() * BIYEON.intensity; s.dx = dir.x / m; s.dz = -dir.z / m; s.state = 'fly'; s.endT = 0; s.d = o.diam || BIYEON.diam;
    s.p = new THREE.Vector3(pos.x, pos.y ?? 1, -pos.z); s.hist = []; s.spin = rnd(0, 6.28); s.nG = lite() ? 2 : 3; s.n = new THREE.Vector3(0, 1, 0); s.n0 = new THREE.Vector3(); s.bs = 0;
    this.root.add(s.g); this.live.push(s); this._projTick(s, 0);
    return {
      set(p, d) { if (s.state !== 'fly' || !p) return; s.p.set(p.x, p.y ?? s.p.y, -p.z); if (d) { const n = Math.hypot(d.x, d.z) || 1; s.dx = d.x / n; s.dz = -d.z / n; } },
      hit(p, ho = {}) { if (s.state !== 'fly') return; s.state = 'hit'; s.endT = s.t; s.miss = !!ho.missed; s.n0.copy(s.n); },
      dispose() { if (s.state === 'fly') { s.state = 'end'; s.endT = s.t; s.n0.copy(s.n); } },
      get pos() { return s.p; },
    };
  }
  _projTick(s, dt) {
    const t = s.t, U = m => m.material.uniforms, te = s.state === 'fly' ? 0 : t - s.endT;
    s.spin += dt * BIYEON.spin * (s.state === 'fly' ? 1 : 0.5);
    let a = smooth(0, 0.03, t), sc = 1, flash = 0, inner = 1;
    if (s.state === 'fly') { if (!s.bs) s.bs = bankSign(s.p, s.dx, s.dz); flightNormal(s.p, s.dx, s.dz, s.n, s.bs); }
    else {
      // hit: turn the face to the camera in 0.04 s (round outline), rim flash, the inside clears (the target shows through), shrink + fade by 0.14 s
      // end (whiff / reach): fade where it is over 0.18 s
      const v = toCam(s.p, _v); if (s.state === 'hit') { _q.setFromUnitVectors(s.n0, v); _q2.identity().slerp(_q, easeOut(te / 0.04)); s.n.copy(s.n0).applyQuaternion(_q2); }
      if (s.state === 'hit' && !s.miss) { flash = 1 - smooth(0.03, 0.12, te); sc = 1 - 0.18 * smooth(0.03, 0.13, te); a *= 1 - smooth(0.06, 0.14, te); inner = 1 - smooth(0, 0.04, te); }
      else a *= 1 - smooth(0, 0.18, te);
    }
    this._disc(s.disc, s.p, s.n, s.d * sc); const D = U(s.disc);
    D.uA.value = a; D.uInner.value = inner; D.uSpin.value = s.spin; D.uFlash.value = flash * flashK(); D.uI.value = s.k; s.disc.visible = a > 0.003;
    // afterimage: copies of the last frames' positions, quickly fading (gone 0.06 s after the disc stops)
    if (s.state === 'fly') { s.hist.unshift(s.p.clone()); if (s.hist.length > 4) s.hist.length = 4; }
    const gk = s.state === 'fly' ? 1 : 1 - smooth(0, 0.06, te);
    s.ghosts.forEach((gm, i) => {
      const h = s.hist[i + 1]; if (!h || i >= s.nG || gk <= 0) { gm.visible = false; return; }
      this._disc(gm, h, s.n, s.d * (0.94 - i * 0.06)); const G = U(gm); G.uGhost.value = 1; G.uSpin.value = s.spin; G.uI.value = s.k; G.uA.value = [0.38, 0.22, 0.11][i] * gk * smooth(0, 0.05, t); gm.visible = true;
    });
    return s.state === 'fly' ? t < 3 : te < 0.2;
  }
  // ------------------------------------------------------------------ hit: one thin ring (<= body width) + a few chips
  _hitSlot() { let s = this.free.hit.pop(); if (s) return s; s = { kind: 'hit', g: new THREE.Group() }; s.ring = this._mat(2, 14); s.core = this._mat(1, 14); s.chips = [0, 1, 2, 3, 4, 5].map(() => this._mat(3, 15)); s.g.add(s.ring, s.core, ...s.chips); return s; }
  /** pos = contact point (GAME coords, y = torso height), dir = flight direction {x, z}, o.r = target radius (ring <= it) */
  hit(pos, dir, o = {}) {
    const s = this._hitSlot(), m = Math.hypot(dir.x, dir.z) || 1, lo = lite(); s.t = 0; s.k = flashK() * rawK() * BIYEON.intensity;
    s.c = new THREE.Vector3(pos.x, pos.y ?? 1, -pos.z); s.R = Math.max(0.22, Math.min(0.75, (o.r || 0.5) * 0.95));
    const c = cam(), right = new THREE.Vector3(1, 0, 0), up = new THREE.Vector3(0, 1, 0); if (c) { right.applyQuaternion(c.quaternion); up.applyQuaternion(c.quaternion); }
    const back = new THREE.Vector3(-dir.x / m, 0, dir.z / m);   // chips spray back toward the thrower a little, mostly sideways on screen
    s.ch = s.chips.map((me, i) => { if (i >= (lo ? 4 : 6)) return null; const a = (i / (lo ? 4 : 6)) * 6.283 + rnd(-0.4, 0.4), sp = rnd(1.6, 2.8);
      return { me, v: right.clone().multiplyScalar(Math.cos(a) * sp).addScaledVector(up, Math.sin(a) * sp * 0.8 + 0.4).addScaledVector(back, 0.6), p: s.c.clone(), life: rnd(0.16, 0.26), sz: rnd(0.09, 0.13) }; });
    this.root.add(s.g); this.live.push(s); this._hitTick(s, 0); return s;
  }
  _hitTick(s, dt) {
    const t = s.t, U = m => m.material.uniforms;
    const ru = easeOut(t / 0.2); this._bill(s.ring, s.c, 2 * s.R * (0.45 + 0.55 * ru) * 1.1 / 0.9);   // ring radius = R x (0.45 -> 1), R <= target radius U(s.ring).uA.value = smooth(0, 0.02, t) * (1 - smooth(0.1, 0.22, t)); U(s.ring).uI.value = s.k * flashK(); U(s.ring).uW.value = 0.07 + 0.05 * (1 - ru); s.ring.visible = t < 0.22;
    const ca = 1 - smooth(0.02, 0.08, t); this._bill(s.core, s.c, s.R * 0.9); U(s.core).uA.value = ca; U(s.core).uI.value = s.k * flashK(); s.core.visible = ca > 0.003;
    for (const h of s.ch) { if (!h) continue; const u = t / h.life; if (u >= 1) { h.me.visible = false; continue; }
      h.v.multiplyScalar(Math.max(0, 1 - 6 * dt)); h.p.addScaledVector(h.v, dt); this._bill(h.me, h.p, h.sz * (1 - 0.5 * u)); U(h.me).uA.value = 1 - u * u; U(h.me).uI.value = s.k; h.me.visible = true; }
    for (let i = s.ch.length; i < s.chips.length; i++) s.chips[i].visible = false;
    s.ch.forEach((h, i) => { if (!h) s.chips[i].visible = false; });
    return t < 0.3;
  }
  /** measurement for tools/browser-tests/biyeon_disc.js: screen size (px) of the flying disc [major, minor] or null */
  discPx() {
    const s = this.live.find(x => x.kind === 'proj' && x.state === 'fly'), G = window.G; if (!s || !G || !G.render.toScreen) return null;
    const c = cam(); const r = s.d / 2, a = new THREE.Vector3().crossVectors(s.n, _v.set(0, 0, 1).applyQuaternion(c.quaternion)).normalize(), b = new THREE.Vector3().crossVectors(s.n, a).normalize();
    const P = v => { const q = G.render.toScreen({ x: v.x, y: v.y, z: -v.z }); return [q.x, q.y]; };
    const d = (u, w) => Math.hypot(u[0] - w[0], u[1] - w[1]);
    return [Math.round(d(P(s.p.clone().addScaledVector(a, r)), P(s.p.clone().addScaledVector(a, -r)))), Math.round(d(P(s.p.clone().addScaledVector(b, r)), P(s.p.clone().addScaledVector(b, -r))))];
  }
  update(dt) {
    if (!dt) return; dt *= BIYEON.speed;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const s = this.live[i]; s.t += dt;
      const alive = s.kind === 'cast' ? this._castTick(s, dt) : s.kind === 'proj' ? this._projTick(s, dt) : this._hitTick(s, dt);
      if (!alive) { this.root.remove(s.g); s.follow = null; this.live.splice(i, 1); const f = this.free[s.kind]; if (f.length < 6) f.push(s); }
    }
  }
  clear() { for (const s of this.live) { this.root.remove(s.g); s.follow = null; if (s.kind === 'proj') s.state = 'end'; if (this.free[s.kind].length < 6) this.free[s.kind].push(s); } this.live.length = 0; }
}
if (typeof window !== 'undefined') window.BIYEON_FX = BIYEON;
