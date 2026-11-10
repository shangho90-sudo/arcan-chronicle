// 비연참 (nv_a3) '비연파(飛燕破)' effect: a fan of crescent wind blades thrown by one big horizontal sweep.
//
// The skill stays SINGLE TARGET (one projectile, no pierce). How the fan and the real hit fit together:
//   * the CENTRE crescent IS the projectile: it rides SkillProj (js/skillrt.js) from the swing to the first enemy it
//     touches, with a thin trail skimming the ground under it. It is the biggest / brightest blade.
//   * the SIDE crescents (6, phone / "그래픽 효과" off: 4) are decoration only: they leave the sweep a few hundredths of a
//     second apart, fly 2.3-3.2 m on a forward fan (±16/32/48 deg; low spec ±20/40), slow down and dissolve by ~0.6 s. They never deal damage.
//   * the hit (cross flash + core + small ring burst + shards + rising motes) is spawned ONLY by the projectile's damage
//     event, at the real impact point on the damaged enemy (biyeonImpact = the front of its body at chest height).
//     A whiff (no enemy within range) only dissolves the centre blade at the end of its flight.
//
// Timeline (t = 0 at the cast; the sweep impact of the nv_biyeon action is at 0.22 s, read from the action):
//   0.00 - 0.12  wind-up: glow at the real sword tip + faint ground ring at the feet
//   0.16 - 0.30  sweep: white flash at the blade + a wide flat crescent across the sweep
//   0.22         the centre crescent leaves with the projectile (13 m/s); side crescents follow at +0.02 .. +0.08
//   0.25 - 0.60  fan spreads, side blades slow and fade (sky -> blue-violet), a few motes rise
//   hit          (typically 0.40 - 0.75) cross flash peaks in 0.03 s, collapses by 0.22, ring / shards to ~0.4, motes to ~0.7
//   a whiff dissolves the centre blade over 0.25 s at the end of its reach
//
// Assets: tools/blender/fx_biyeon.py -> assets/fx/fx_biyeon.glb.json (+ "cells") + assets/fx/fx_biyeon.png (MASKS:
// R = hot core, G = body, B = halo, recoloured here with BIYEON.white / sky / violet / pale).
// Materials: depthTest on, depthWrite off, additive-ish (one + slight background darkening so the blades read without
// bloom). Ground parts are lifted 4 cm with polygonOffset (no z-fighting). Pooled slots, nothing is allocated per frame
// after warm-up except small temp vectors.
// Low spec (phone or "그래픽 효과" off): drops motes and 2 side blades, fewer shards; the centre blade, trail, sweep and
// the cross flash stay. "섬광 효과 줄이기": dimmer flashes.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const BIYEON = { white: 0xffffff, sky: 0x8be8ff, violet: 0x777bff, pale: 0xddf8ff, intensity: 1, size: 1, speed: 1 };
const DEPTH_BIAS = 0.35, FLASH_BIAS = 1.2;
/** impact point (GAME coords) of a blade flying along f = {x, z} (unit) into actor t: front of the body at chest height. */
export function biyeonImpact(t, f) {
  const r = t.radius || 0.5;
  return { x: t.pos.x - f.x * r * 0.85, y: (t.pos.y || 0) + Math.min(1.3, 0.6 + r * 0.55), z: t.pos.z - f.z * r * 0.85 };
}

const VS = `
attribute float aFade; attribute float aHue; uniform float uBias, uBill;
varying vec2 vUv; varying float vF, vH;
void main(){
  vUv = uv; vF = 1.; vH = 0.; vec4 mv;
#ifdef USE_INSTANCING
  vF = aFade; vH = aHue;
  if (uBill > .5) { mv = modelViewMatrix * instanceMatrix * vec4(0., 0., 0., 1.); mv.xy += position.xy * length(instanceMatrix[0].xyz); }
  else mv = modelViewMatrix * instanceMatrix * vec4(position, 1.);
#else
  mv = modelViewMatrix * vec4(position, 1.);
#endif
  mv.xyz -= normalize(mv.xyz) * uBias;
  gl_Position = projectionMatrix * mv;
}`;
const FS = `
uniform sampler2D uMap; uniform vec3 uW, uS, uV, uP; uniform float uI, uA, uHue, uR, uDark;
varying vec2 vUv; varying float vF, vH;
void main(){
  vec4 t = texture2D(uMap, vUv);
  float h = clamp(uHue + vH, 0., 1.), f = uA * vF;
  vec3 core = mix(uW, uP, h), body = mix(uS, uV, smoothstep(.3, 1., h));
  vec3 c = (core * t.r * uR + body * t.g * (1. - .4 * t.r * uR) + uV * t.b * .55) * uI * f;
  gl_FragColor = vec4(c, clamp((t.g * .6 + t.b * .35 + t.r * .2) * f * uDark, 0., 1.));
}`;

const easeOut = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const expoOut = (x) => x >= 1 ? 1 : 1 - Math.pow(2, -10 * Math.max(0, x));
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const rnd = (a, b) => a + Math.random() * (b - a);
const lite = () => { const G = window.G; return !!(G && ((G.input && G.input.mobile) || (G.settings && G.settings.graphicsFx === false))); };
const flashK = () => { const G = window.G; return G && G.reduceFlash ? 0.6 : 1; };
const rawK = () => { const G = window.G; return G && G.settings && G.settings.graphicsFx === false ? 0.6 : 1; };   // no tonemap -> whites would clip
const camQ = () => { const G = window.G; return G && G.render && G.render.cam ? G.render.cam.quaternion : null; };
const Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

async function loadWrapped(url) {
  const j = await (await fetch(url)).json(); const raw = atob(j.b64), u8 = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
  return new Promise((res, rej) => new GLTFLoader().parse(u8.buffer, '', res, rej));
}

export class BiyeonFx {
  constructor(root) { this.root = root; this.live = []; this.free = { cast: [], proj: [], hit: [] }; this.ready = false; this.loading = null; this.geo = {}; }
  load() {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const [g, tex] = await Promise.all([loadWrapped('assets/fx/fx_biyeon.glb.json'), new THREE.TextureLoader().loadAsync('assets/fx/fx_biyeon.png')]);
      g.scene.traverse(o => { if (o.isMesh) this.geo[o.name] = o.geometry; });
      tex.flipY = false; tex.colorSpace = THREE.NoColorSpace; tex.generateMipmaps = true; tex.anisotropy = 2; tex.needsUpdate = true;
      this.tex = tex; this.ready = true;
    })().catch(e => { console.warn('biyeonfx load', e); });
    return this.loading;
  }
  _mat(o = {}) {
    const m = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: this.tex }, uW: { value: new THREE.Color(BIYEON.white) }, uS: { value: new THREE.Color(BIYEON.sky) }, uV: { value: new THREE.Color(BIYEON.violet) },
        uP: { value: new THREE.Color(BIYEON.pale) }, uI: { value: 1 }, uA: { value: 0 }, uHue: { value: 0 }, uR: { value: 1 }, uDark: { value: o.dark ?? 0.6 },
        uBias: { value: o.bias ?? DEPTH_BIAS }, uBill: { value: o.bill ? 1 : 0 } },
      vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation,
    });
    if (o.ground) { m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -4; }
    return m;
  }
  _mesh(name, order, o) { const m = new THREE.Mesh(this.geo[name], this._mat(o)); m.frustumCulled = false; m.renderOrder = order; return m; }
  _inst(name, n, order, o) {
    const geo = this.geo[name].clone(); geo.setAttribute('aFade', new THREE.InstancedBufferAttribute(new Float32Array(n), 1)); geo.setAttribute('aHue', new THREE.InstancedBufferAttribute(new Float32Array(n), 1));
    const m = new THREE.InstancedMesh(geo, this._mat(o), n); m.frustumCulled = false; m.renderOrder = order; m.count = 0; m.material.uniforms.uA.value = 1; return m;
  }
  /** writes particle list ps ({p, v, life, size, hue, d, up}) into instanced mesh `im` at time t; returns count */
  _parts(im, ps, t, dt, kind) {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), d = new THREE.Vector3(), fa = im.geometry.attributes.aFade, hu = im.geometry.attributes.aHue;
    let n = 0;
    for (const p of ps) {
      const u = (t - p.d) / p.life; if (u < 0 || u >= 1) continue;
      if (kind === 'shard') { p.v.multiplyScalar(Math.max(0, 1 - 5 * dt)); p.v.y -= 1.5 * dt; } else { p.v.multiplyScalar(Math.max(0, 1 - 1.5 * dt)); p.v.y = p.up; }
      p.p.addScaledVector(p.v, dt);
      if (kind === 'shard') {
        d.copy(p.v); if (d.lengthSq() < 1e-6) d.set(0, 0, 1); q.setFromUnitVectors(Z, d.normalize());
        const s = p.size * (1 - u * 0.6); m4.compose(p.p, q, sc.set(s * 0.45, s * 0.45, s * (1.4 - u * 0.6)));
        fa.setX(n, Math.pow(1 - u, 0.8) * 1.4);
      } else {
        const s = p.size * (0.6 + 0.4 * Math.sin(Math.min(1, u * 3) * Math.PI / 2)); q.identity(); m4.compose(p.p, q, sc.set(s, s, s));
        fa.setX(n, Math.sin(Math.PI * Math.min(1, u * 1.2)) * (0.75 + 0.25 * Math.sin(t * 23 + p.d * 50)));
      }
      im.setMatrixAt(n, m4); hu.setX(n, Math.min(1, p.hue + u * 0.8)); n++;
    }
    im.count = n; im.instanceMatrix.needsUpdate = true; fa.needsUpdate = true; hu.needsUpdate = true;
    return n;
  }
  // ------------------------------------------------------------------------------------------ cast (wind-up, sweep, fan)
  _castSlot() {
    let s = this.free.cast.pop(); if (s) return s;
    s = { kind: 'cast', g: new THREE.Group() };
    s.tip = this._mesh('bi_quad', 12, { bias: 0.6 }); s.ring = this._mesh('bi_ring', 3, { ground: true, bias: 0, dark: 0.3 });
    s.flash = this._mesh('bi_quad', 12, { bias: 0.8 }); s.sweep = this._mesh('bi_crescent', 9);
    s.sides = []; for (let i = 0; i < 6; i++) { const m = this._mesh('bi_crescent', 8); s.sides.push(m); s.g.add(m); }
    s.motes = this._inst('bi_mote', 8, 11, { bill: true, dark: 0.2 });
    s.g.add(s.tip, s.ring, s.flash, s.sweep, s.motes); s.mp = [];
    return s;
  }
  /** cast at the start of the skill. pos/dir GAME coords; o.follow = caster (its sword tip / facing until the sweep);
   *  o.swing = time of the sweep impact (s, the projectile leaves then). Returns the slot (pass it to proj()). */
  cast(pos, dir, o = {}) {
    if (!this.ready) { this.load(); return null; }
    const s = this._castSlot(), lo = lite(), m = Math.hypot(dir.x, dir.z) || 1;
    s.t = 0; s.dx = dir.x / m; s.dz = -dir.z / m; s.follow = o.follow || null; s.swing = o.swing ?? 0.22; s.lite = lo; s.k = flashK() * rawK();
    s.o3 = new THREE.Vector3(pos.x, pos.y || 0, -pos.z); s.tipP = new THREE.Vector3(pos.x + s.dx * 0.8, (pos.y || 0) + 1.05, -pos.z + s.dz * 0.8); s.fixed = false;
    const angs = lo ? [-40, -20, 20, 40] : [-48, -32, -16, 16, 32, 48];
    s.fan = s.sides.map((mesh, i) => { const a = angs[i]; mesh.visible = a != null; if (a == null) return null; const k = Math.abs(a) / 48;
      return { mesh, a: a * Math.PI / 180, d: 0.02 + k * 0.06, D: 3.2 - k * 0.9, sc: (0.78 - k * 0.24) * BIYEON.size, y: 0.9 + rnd(-0.12, 0.14), roll: -Math.sign(a) * (0.12 + 0.18 * k), life: 0.34 + rnd(-0.02, 0.03) }; }).filter(Boolean);
    s.mp.length = 0;
    if (!lo) for (let i = 0; i < 8; i++) s.mp.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), d: s.swing + 0.04 + i * 0.03, life: rnd(0.5, 0.7), size: rnd(0.1, 0.16), hue: rnd(0, 0.3), up: rnd(0.5, 0.9), a: rnd(-1.4, 1.4), r: rnd(0.6, 1.6), init: false });
    this._place(s); this.root.add(s.g); this.live.push(s); this._castTick(s, 0); return s;
  }
  _place(s) {
    const a = s.follow; if (!a || a.dead || s.fixed) return;
    const f = a.facing, m = f ? Math.hypot(f.x, f.z) || 1 : 1; if (f) { s.dx = f.x / m; s.dz = -f.z / m; }
    s.o3.set(a.pos.x, a.pos.y || 0, -a.pos.z);
    let tip = null; try { const b = a.body && a.body.bladePoints && a.body.bladePoints(); if (b) tip = b[1]; } catch (e) { tip = null; }
    if (tip) s.tipP.copy(tip); else s.tipP.set(s.o3.x + s.dx * 0.8, s.o3.y + 1.05, s.o3.z + s.dz * 0.8);
  }
  _castTick(s, dt) {
    const t = s.t, k = s.k * BIYEON.intensity, U = (m) => m.material.uniforms, cq = camQ(), sw = s.swing;
    if (t <= sw + 0.02) this._place(s); else s.fixed = true;          // ride the caster until the blades leave, then stay in the world
    const yaw = Math.atan2(s.dx, s.dz), gy = s.o3.y + 0.04;
    // A. wind-up: tip glow 0 -> 0.12 (pulses in, slides with the real sword tip), ground ring at the feet
    const gIn = easeOut(t / 0.08), gOut = 1 - smooth(sw - 0.04, sw + 0.02, t);
    s.tip.position.copy(s.tipP); if (cq) s.tip.quaternion.copy(cq);
    s.tip.scale.setScalar(0.42 * gIn * (1 + 0.15 * Math.sin(t * 40)) + 0.001); U(s.tip).uA.value = gIn * gOut; U(s.tip).uI.value = 1.6 * k; s.tip.visible = gOut > 0.002;
    const rA = smooth(0, 0.06, t) * (1 - smooth(0.12, sw + 0.12, t));
    s.ring.position.set(s.o3.x, gy, s.o3.z); s.ring.rotation.set(0, yaw + t * 1.5, 0); s.ring.scale.setScalar(2.0 + 0.5 * easeOut(t / (sw + 0.1)));
    U(s.ring).uA.value = rA * 0.38; U(s.ring).uI.value = 0.9 * k; U(s.ring).uHue.value = 0.25; s.ring.visible = rA > 0.002;
    // B. sweep: white flash at the blade (sw - 0.05 .. sw + 0.08) + wide flat crescent across the sweep (sw - 0.04 .. sw + 0.14)
    const fIn = expoOut((t - (sw - 0.05)) / 0.04), fOut = 1 - smooth(sw + 0.02, sw + 0.1, t);
    s.flash.position.copy(s.tipP); if (cq) s.flash.quaternion.copy(cq);
    s.flash.scale.setScalar((0.9 + 0.5 * fIn) * BIYEON.size + 0.001); U(s.flash).uA.value = t > sw - 0.05 ? fIn * fOut : 0; U(s.flash).uI.value = 2.0 * k; U(s.flash).uR.value = 1.2; s.flash.visible = U(s.flash).uA.value > 0.002;
    const wIn = expoOut((t - (sw - 0.04)) / 0.05), wOut = 1 - smooth(sw + 0.03, sw + 0.16, t);
    s.sweep.position.set(s.o3.x + s.dx * 1.55, s.o3.y + 0.95, s.o3.z + s.dz * 1.55); s.sweep.rotation.set(0, yaw, 0);
    s.sweep.scale.setScalar(1.45 * (0.75 + 0.25 * wIn) * BIYEON.size); U(s.sweep).uA.value = t > sw - 0.04 ? wIn * wOut * 0.8 : 0; U(s.sweep).uI.value = 1.5 * k; U(s.sweep).uHue.value = 0.2 * smooth(sw, sw + 0.16, t);
    s.sweep.visible = U(s.sweep).uA.value > 0.002;
    // C. side blades: leave at sw + d, fly D m (fast, then slow), fade sky -> violet, gone by sw + d + life
    for (const b of s.fan) {
      const u = (t - sw - b.d) / b.life, M = b.mesh;
      if (u < 0 || u >= 1) { M.visible = false; continue; }
      M.visible = true;
      const ca = Math.cos(b.a), sa = Math.sin(b.a), fx = s.dx * ca - s.dz * sa, fz = s.dx * sa + s.dz * ca, dist = 0.9 + b.D * easeOut(u * 1.15);
      M.position.set(s.o3.x + fx * dist, s.o3.y + b.y, s.o3.z + fz * dist); M.rotation.set(0, Math.atan2(fx, fz), b.roll, 'YXZ');
      M.scale.setScalar(b.sc * (0.7 + 0.3 * easeOut(u * 4)) * (1 + 0.15 * u));
      U(M).uA.value = smooth(0, 0.08, u) * (1 - smooth(0.4, 1, u)) * (0.95 - 0.3 * Math.abs(b.a)); U(M).uI.value = 1.75 * k; U(M).uHue.value = 0.15 + 0.8 * smooth(0.25, 1, u); U(M).uR.value = 0.9;
    }
    // D. motes rising from the sweep
    if (s.mp.length) {
      for (const p of s.mp) if (!p.init && t >= p.d) { p.init = true; const ca = Math.cos(p.a), sa = Math.sin(p.a), fx = s.dx * ca - s.dz * sa, fz = s.dx * sa + s.dz * ca;
        p.p.set(s.o3.x + fx * p.r, s.o3.y + 0.7 + rnd(0, 0.5), s.o3.z + fz * p.r); p.v.set(fx * 0.8, 0, fz * 0.8); }
      const n = this._parts(s.motes, s.mp.filter(p => p.init), t, dt, 'mote'); U(s.motes).uI.value = 1.3 * k; s.motes.visible = n > 0;
    } else s.motes.visible = false;
    return t < sw + 0.9;
  }
  // ------------------------------------------------------------------------------------------ proj (centre blade + trail)
  _projSlot() {
    let s = this.free.proj.pop(); if (s) return s;
    s = { kind: 'proj', g: new THREE.Group() };
    s.blade = this._mesh('bi_crescent', 10); s.trail = this._mesh('bi_trail', 4, { ground: true, bias: 0, dark: 0.35 });
    s.g.add(s.trail, s.blade);
    return s;
  }
  /** the centre crescent riding the projectile. Returns a handle { set(pos, dir), hit(pos), dispose() } (SkillProj.fx). */
  proj(pos, dir, o = {}) {
    if (!this.ready) { this.load(); return null; }
    const s = this._projSlot(), m = Math.hypot(dir.x, dir.z) || 1;
    s.t = 0; s.k = flashK() * rawK(); s.dx = dir.x / m; s.dz = -dir.z / m; s.state = 'fly'; s.endT = 0;
    s.p = new THREE.Vector3(pos.x, pos.y || 1, -pos.z); s.start = s.p.clone(); s.gy = (o.groundY ?? ((pos.y || 1) - 1.0)) + 0.04;
    s.lockP = null; this.root.add(s.g); this.live.push(s); this._projTick(s, 0);
    const self = this;
    return {
      set(p, d) { if (s.state !== 'fly' || !p) return; s.p.set(p.x, p.y ?? s.p.y, -p.z); if (d) { const n = Math.hypot(d.x, d.z) || 1; s.dx = d.x / n; s.dz = -d.z / n; } },
      hit(p) { if (s.state !== 'fly') return; s.state = 'hit'; s.endT = s.t; s.lockP = new THREE.Vector3(p.x, p.y, -p.z); },
      dispose() { if (s.state === 'fly') { s.state = 'end'; s.endT = s.t; } },
      get alive() { return self.live.includes(s); },
    };
  }
  _projTick(s, dt) {
    const t = s.t, k = s.k * BIYEON.intensity, U = (m) => m.material.uniforms, B = s.blade;
    const yaw = Math.atan2(s.dx, s.dz), te = s.state === 'fly' ? 0 : t - s.endT;
    // blade: grows in 0 -> 0.08; on hit it snaps its apex onto the impact point and collapses into the cross flash (0.1 s);
    // a whiff widens a little and dissolves over 0.25 s
    if (s.lockP) B.position.copy(s.lockP); else B.position.copy(s.p);
    B.rotation.set(0, yaw, 0);
    const grow = 0.55 + 0.45 * easeOut(t / 0.08), base = 1.1 * BIYEON.size;
    let a = smooth(0, 0.04, t), sc = base * grow, hue = 0.1 * smooth(0, 0.4, t);
    if (s.state === 'hit') { a *= 1 - smooth(0, 0.1, te); sc *= 1 - 0.35 * smooth(0, 0.1, te); }
    else if (s.state === 'end') { a *= 1 - smooth(0, 0.25, te); sc *= 1 + 0.25 * smooth(0, 0.25, te); hue += 0.7 * smooth(0, 0.25, te); }
    B.scale.set(sc, sc * (1 + 0.6 * smooth(0, 0.1, te) * (s.state === 'hit' ? 1 : 0)), sc);
    U(B).uA.value = a; U(B).uI.value = 2.5 * k; U(B).uHue.value = hue; U(B).uR.value = 1.15; B.visible = a > 0.002;
    // trail on the ground: from the launch point (at most 5 m behind) to the blade, fades after it stops
    const hx = (s.lockP || s.p).x, hz = (s.lockP || s.p).z, L = Math.min(5, Math.hypot(hx - s.start.x, hz - s.start.z));
    const T = s.trail; T.position.set(hx - s.dx * L, s.gy, hz - s.dz * L); T.rotation.set(0, yaw, 0); T.scale.set(0.32 * BIYEON.size * (1 - 0.4 * smooth(0, 0.3, te)), 1, Math.max(0.01, L));
    const ta = smooth(0.02, 0.08, t) * (1 - smooth(0, 0.32, te)); U(T).uA.value = ta * 0.7; U(T).uI.value = 1.1 * k; U(T).uHue.value = 0.2 + 0.6 * smooth(0, 0.32, te); T.visible = ta > 0.002 && L > 0.05;
    return s.state === 'fly' ? t < 3 : te < 0.34;
  }
  // ------------------------------------------------------------------------------------------ hit (on the damaged enemy only)
  _hitSlot() {
    let s = this.free.hit.pop(); if (s) return s;
    s = { kind: 'hit', g: new THREE.Group() };
    s.cross = this._mesh('bi_cross', 13, { bias: FLASH_BIAS }); s.after = this._mesh('bi_quad', 10, { bias: FLASH_BIAS, dark: 0.25 }); s.core = this._mesh('bi_quad', 14, { bias: FLASH_BIAS }); s.ring = this._mesh('bi_ring', 12, { bias: FLASH_BIAS, dark: 0.2 });
    s.shards = this._inst('bi_shard', 12, 11, { bias: 0.6 }); s.motes = this._inst('bi_mote', 8, 11, { bill: true, dark: 0.2, bias: 0.6 });
    s.g.add(s.after, s.ring, s.cross, s.core, s.shards, s.motes); s.sh = []; s.mp = [];
    return s;
  }
  /** pos = impact point (GAME coords, y = height), dir = blade direction {x, z}. */
  hit(pos, dir, o = {}) {
    if (!this.ready) { this.load(); return null; }
    const s = this._hitSlot(), lo = lite(), m = Math.hypot(dir.x, dir.z) || 1, dx = dir.x / m, dz = -dir.z / m;
    s.t = 0; s.k = flashK() * rawK(); s.size = (o.size ?? 1) * BIYEON.size; s.roll = rnd(-0.2, 0.2) + 0.785 * (Math.random() < 0.5 ? 0 : 0.12);
    s.c = new THREE.Vector3(pos.x, pos.y || 1, -pos.z); s.g.position.set(0, 0, 0);
    s.sh.length = 0; s.mp.length = 0;
    const ns = lo ? 5 : 12;
    for (let i = 0; i < ns; i++) {   // mostly sideways (perpendicular to the blade = along the cut) and a little forward
      const side = (i % 2 ? 1 : -1), a = rnd(0.2, 1.3) * side, sp = rnd(3, 6.5), ca = Math.cos(a), sa = Math.sin(a);
      s.sh.push({ p: s.c.clone(), v: new THREE.Vector3((dx * ca - dz * sa) * sp, rnd(-0.3, 1.2) * sp * 0.5, (dx * sa + dz * ca) * sp), d: 0, life: rnd(0.22, 0.38), size: rnd(0.22, 0.34), hue: rnd(0, 0.3) });
    }
    if (!lo) for (let i = 0; i < 8; i++) s.mp.push({ p: s.c.clone().add(new THREE.Vector3(rnd(-0.5, 0.5), rnd(-0.4, 0.2), rnd(-0.5, 0.5))), v: new THREE.Vector3(rnd(-0.5, 0.5), 0, rnd(-0.5, 0.5)), d: 0.04 + i * 0.03, life: rnd(0.5, 0.7), size: rnd(0.1, 0.17), hue: rnd(0.1, 0.4), up: rnd(0.6, 1.1) });
    this.root.add(s.g); this.live.push(s); this._hitTick(s, 0); return s;
  }
  _hitTick(s, dt) {
    const t = s.t, k = s.k * BIYEON.intensity, U = (m) => m.material.uniforms, cq = camQ(), sz = s.size;
    for (const q of [s.cross, s.core, s.ring, s.after]) { q.position.copy(s.c); if (cq) q.quaternion.copy(cq); }
    if (cq) s.cross.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(Z, s.roll + 0.15 * smooth(0, 0.22, t)));
    // cross: in 0 -> 0.03, peak to 0.08, collapses (thinner, violet) 0.08 -> 0.22
    const cIn = expoOut(t / 0.03), cOut = 1 - smooth(0.08, 0.22, t);
    s.cross.scale.set(2.1 * sz * (0.6 + 0.4 * cIn) * (1 + 0.1 * smooth(0.03, 0.2, t)), 2.1 * sz * (0.6 + 0.4 * cIn) * (0.5 + 0.5 * cOut), 1);
    U(s.cross).uA.value = cIn * cOut; U(s.cross).uI.value = 2.4 * k; U(s.cross).uR.value = 0.4 + 0.8 * cOut; U(s.cross).uHue.value = 0.6 * smooth(0.06, 0.22, t); s.cross.visible = cOut > 0.002;
    const oIn = expoOut(t / 0.025), oOut = 1 - smooth(0.05, 0.16, t);
    s.core.scale.setScalar(0.75 * sz * oIn * (0.5 + 0.5 * oOut) + 0.001); U(s.core).uA.value = oOut; U(s.core).uI.value = 2.2 * k; s.core.visible = oOut > 0.002;
    // soft blue-violet afterglow: 0.03 -> 0.55 (the 'soft fade' after the flash)
    const aA = smooth(0.0, 0.06, t) * (1 - smooth(0.2, 0.55, t)); s.after.scale.setScalar(1.25 * sz * (0.85 + 0.3 * smooth(0, 0.5, t)));
    U(s.after).uA.value = aA * 0.5; U(s.after).uI.value = 0.8 * k; U(s.after).uR.value = 0.25; U(s.after).uHue.value = 0.9; s.after.visible = aA > 0.002;
    // short burst finish: thin ring expands 0.02 -> 0.34
    const ru = smooth(0.02, 0.34, t); s.ring.scale.setScalar(sz * (0.5 + 1.4 * easeOut(ru))); U(s.ring).uA.value = smooth(0.02, 0.06, t) * (1 - ru) * 0.8; U(s.ring).uI.value = 1.4 * k; U(s.ring).uHue.value = 0.2 + 0.6 * ru; s.ring.visible = ru < 1;
    const n1 = this._parts(s.shards, s.sh, t, dt, 'shard'); U(s.shards).uI.value = 1.4 * k; s.shards.visible = n1 > 0;
    const n2 = s.mp.length ? this._parts(s.motes, s.mp, t, dt, 'mote') : 0; U(s.motes).uI.value = 1.3 * k; s.motes.visible = n2 > 0;
    return t < 0.75;
  }
  update(dt) {
    if (!dt) return;
    dt *= BIYEON.speed;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const s = this.live[i]; s.t += dt;
      const alive = s.kind === 'cast' ? this._castTick(s, dt) : s.kind === 'proj' ? this._projTick(s, dt) : this._hitTick(s, dt);
      if (!alive) { this.root.remove(s.g); s.follow = null; this.live.splice(i, 1); const f = this.free[s.kind]; if (f.length < 6) f.push(s); }
    }
  }
  clear() { for (const s of this.live) { this.root.remove(s.g); s.follow = null; if (s.kind === 'proj') s.state = 'end'; this.free[s.kind].push(s); } this.live.length = 0; }
}
if (typeof window !== 'undefined') window.BIYEON_FX = BIYEON;
