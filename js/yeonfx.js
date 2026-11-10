// 견습생 '연(連)' combo-slash effect: every strike of the flurry draws its own crescent along the real swing, and every
// damage event puts a small white flash + a short cut line + shards on the target. The last strike is the finisher:
// a much bigger double crescent, a cross cut and a radial burst.
//
// Assets: tools/blender/fx_yeon.py -> assets/fx/fx_yeon.glb.json (meshes, game axes +Z forward / +Y up / +X side, atlas
// cells in "cells") + assets/fx/fx_yeon.png (MASKS: R = hot core -> white, G = body -> strike colour, B = halo).
//
// Per strike (skillrt.js: scheduled LEAD s before each impact of the action's hitTimes, see release()):
//   crescent  wipes along the swing (u = start -> end), centre = the caster's chest (follows the lunge), radius = the real
//             sword-tip distance, plane rolled per pattern (tools/anim/swings.py hitFx[i].yeon), mirrored for backhands
//             -0.05 .. 0.00 head 0 -> 0.62 (= the impact), 0.00 .. 0.05 head -> 1, holds, then erodes from the tail and fades
//             by 0.20 (finisher 0.36); radius grows ~8 % while it fades
//   ghosts    2 thin afterimage arcs (1 on low spec) 0.02 / 0.04 s behind, rolled a little, smaller, fade by 0.15
//   tip       soft glow + star on the real sword tip (bladePoints) until just after the impact
// Per hit (opHit, exactly at the damage event, at the target's front surface at chest height = yeonImpact):
//   flash (camera quad, random roll, size varies) 0 -> 0.02 in, peak to 0.05, gone by 0.14 (finisher 0.26)
//   cut line along the screen-space swing direction (finisher: cross), shards (cut FIRST on low spec), finisher burst + ring
//   whiff: only a small star at the arc's front point
// All parts: one shader, depthTest on, depthWrite off, nudged towards the camera (uBias) so the body does not swallow the
// crescent; crescents blend premultiplied (a little darkening = readable without bloom), flashes are pure additive.
// Tuning: YEON (intensity, size, speed) — window.YEON_FX at runtime.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const YEON = { white: 0xffffff, sky: 0x78dfff, violet: 0x8a65ff, pink: 0xff8bd8, intensity: 1, size: 1, speed: 1, hitSize: 1 };
export const LEAD = 0.05;            // s: the crescent starts drawing this long before the damage frame
const CELLS_DEFAULT = { crescent: [0, 1, 0.75, 1], ghost: [0, 1, 0.625, 0.75], straight: [0, 0.5, 0.5, 0.625] };
const PITCH = -0.12;                 // rad: lift the front edge a little (never a flat disc on the ground)

/** impact point (GAME coords) of a strike along f = {x, z} on actor t: front surface of the body at chest height */
export function yeonImpact(t, f) {
  const r = t.radius || 0.5;
  return { x: t.pos.x - f.x * r * 0.8, y: (t.pos.y || 0) + Math.min(1.3, 0.55 + r * 0.55), z: t.pos.z - f.z * r * 0.8 };
}

const VS = `
attribute float aFade; attribute float aHue; uniform float uBias;
varying vec2 vUv; varying float vF, vH;
void main(){
  vUv = uv; vec4 p = vec4(position, 1.);
#ifdef USE_INSTANCING
  p = instanceMatrix * p; vF = aFade; vH = aHue;
#else
  vF = 1.; vH = 0.;
#endif
  vec4 mv = modelViewMatrix * p;
  mv.xyz -= normalize(mv.xyz) * uBias;
  gl_Position = projectionMatrix * mv;
}`;
const FS = `
uniform sampler2D uMap; uniform vec3 uW, uC1, uC2; uniform float uI, uA, uR, uHead, uTail, uMix; uniform vec2 uCU;
varying vec2 vUv; varying float vF, vH;
void main(){
  vec4 t = texture2D(uMap, vUv);
  float w = 1.;
  if (uTail < 4.) {                       // wipe along the swing: visible from (head - tail) to head, brightest at the head
    float ut = (vUv.x - uCU.x) / (uCU.y - uCU.x), dh = uHead - ut;
    w = smoothstep(-.015, .03, dh) * (1. - smoothstep(uTail * .55, uTail, dh));
    w *= .55 + .45 * exp(-max(dh, 0.) * 4.5);
  }
  float f = uA * vF * w, h = clamp(uMix + vH, 0., 1.);
  vec3 body = mix(uC1, uC2, h);
  vec3 c = (uW * t.r * uR * 1.5 + body * t.g * (1. - .5 * t.r * uR) * .95 + uC2 * t.b * .8) * uI * f;   // white only in the hot core, the body keeps its hue
  gl_FragColor = vec4(c, clamp((t.g * .9 + t.b * .5 + t.r * .3) * f, 0., 1.));
}`;

const easeOut = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const easeIn = (x) => { x = Math.min(1, Math.max(0, x)); return x * x; };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const rnd = (a, b) => a + Math.random() * (b - a);
const lite = () => { const G = window.G; return !!(G && ((G.input && G.input.mobile) || (G.settings && G.settings.graphicsFx === false))); };
const flashK = () => { const G = window.G; return G && G.reduceFlash ? 0.6 : 1; };
const rawK = () => { const G = window.G; return G && G.settings && G.settings.graphicsFx === false ? 0.5 : 1; };   // no tonemap -> keep additive whites from clipping
const cam = () => window.G && window.G.render && window.G.render.cam;

async function loadWrapped(url, owner) {
  const j = await (await fetch(url)).json(); owner.cells = j.cells || CELLS_DEFAULT; const raw = atob(j.b64), u8 = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
  return new Promise((res, rej) => new GLTFLoader().parse(u8.buffer, '', res, rej));
}

/** strike frame: yaw from the facing (three.js coords), pitch, roll per pattern */
function strikeQuat(dx, dz, roll) { return new THREE.Quaternion().setFromEuler(new THREE.Euler(PITCH, Math.atan2(dx, dz), roll, 'YXZ')); }

export class YeonFx {
  constructor(root) { this.root = root; this.live = []; this.free = { strike: [], hit: [] }; this.ready = false; this.loading = null; this.geo = {}; this.cells = null; }
  load() {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const [g, tex] = await Promise.all([loadWrapped('assets/fx/fx_yeon.glb.json', this), new THREE.TextureLoader().loadAsync('assets/fx/fx_yeon.png')]);
      g.scene.traverse(o => { if (o.isMesh) this.geo[o.name] = o.geometry; });
      tex.flipY = false; tex.colorSpace = THREE.NoColorSpace; tex.generateMipmaps = true; tex.anisotropy = 2; tex.needsUpdate = true;
      this.tex = tex; this.ready = true;
    })().catch(e => { console.warn('yeonfx load', e); });
    return this.loading;
  }
  _mat(cell, add, bias) {
    const c = (cell && this.cells[cell]) || [0, 1, 0, 1];
    return new THREE.ShaderMaterial({
      uniforms: { uMap: { value: this.tex }, uW: { value: new THREE.Color(YEON.white) }, uC1: { value: new THREE.Color(YEON.sky) }, uC2: { value: new THREE.Color(YEON.violet) },
        uI: { value: 1 }, uA: { value: 0 }, uR: { value: 1 }, uHead: { value: 2 }, uTail: { value: 9 }, uMix: { value: 0 }, uCU: { value: new THREE.Vector2(c[0], c[1]) }, uBias: { value: bias } },
      vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: add ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation,
    });
  }
  _mesh(name, cell, order, add = false, bias = 0.6) { const m = new THREE.Mesh(this.geo[name], this._mat(cell, add, bias)); m.frustumCulled = false; m.renderOrder = order; return m; }
  _inst(n, order) {
    const geo = this.geo.yeon_shard.clone(); geo.setAttribute('aFade', new THREE.InstancedBufferAttribute(new Float32Array(n), 1)); geo.setAttribute('aHue', new THREE.InstancedBufferAttribute(new Float32Array(n), 1));
    const m = new THREE.InstancedMesh(geo, this._mat(null, true, 1.0), n); m.frustumCulled = false; m.renderOrder = order; m.count = 0; m.material.uniforms.uA.value = 1; return m;
  }
  _strikeSlot() {
    let s = this.free.strike.pop(); if (s) return s;
    s = { kind: 'strike', g: new THREE.Group(), arc: new THREE.Group() };
    s.mains = { a: this._mesh('yeon_crescent', 'crescent', 9), b: this._mesh('yeon_crescent_b', 'crescent', 9), fin: this._mesh('yeon_finisher', 'crescent', 9) };
    s.ghosts = [this._mesh('yeon_ghost', 'ghost', 8), this._mesh('yeon_ghost', 'ghost', 8)];
    for (const k in s.mains) s.arc.add(s.mains[k]);
    for (const m of s.ghosts) s.arc.add(m);
    s.tip = this._mesh('yeon_glow', null, 11, true, 0.8); s.star = this._mesh('yeon_spark', null, 12, true, 0.8);
    s.g.add(s.arc, s.tip, s.star);
    return s;
  }
  _hitSlot() {
    let s = this.free.hit.pop(); if (s) return s;
    s = { kind: 'hit', g: new THREE.Group() };
    s.flash = this._mesh('yeon_flash', null, 13, true, 1.3); s.burst = this._mesh('yeon_burst', null, 12, true, 1.3);
    s.cut = this._mesh('yeon_straight', 'straight', 12, true, 1.3); s.cross = this._mesh('yeon_cross', 'straight', 12, true, 1.3);
    s.glow = this._mesh('yeon_glow', null, 10, false, 1.0); s.shards = this._inst(18, 11);
    s.g.add(s.glow, s.burst, s.cut, s.cross, s.flash, s.shards); s.sh = [];
    return s;
  }
  /** one strike of the flurry. o.follow = the caster (centre / facing / sword tip follow it until the impact), o.dir = facing
   *  {x, z} (game) used when there is no actor, o.y = pattern (swings.py hitFx[i].yeon: p, roll, mirror, size, var, col, fin),
   *  o.lead = seconds until the damage frame (0 when it could not be scheduled ahead). */
  strike(o = {}) {
    if (!this.ready) { this.load(); return; }
    const s = this._strikeSlot(), y = o.y || {}, lo = lite(), a = o.follow;
    const fin = !!y.fin;
    s.t = 0; s.lead = Math.max(0, o.lead ?? LEAD); s.follow = a || null; s.fin = fin; s.lo = lo; s.k = flashK();
    s.roll = (y.roll || 0) + rnd(-0.07, 0.07); s.mir = y.mirror ? -1 : 1; s.size = (y.size || 1) * YEON.size * rnd(0.96, 1.04);
    s.life = fin ? 0.36 : 0.2;
    const f = (a && a.facing) || o.dir || { x: 0, z: 1 }, m = Math.hypot(f.x, f.z) || 1; s.dx = f.x / m; s.dz = -f.z / m;
    s.base = a ? new THREE.Vector3(a.pos.x, a.pos.y || 0, -a.pos.z) : new THREE.Vector3(o.pos.x, o.pos.y || 0, -o.pos.z);
    s.r = 1.25;
    const key = fin || y.p === 'ring' ? 'fin' : y.var === 'b' ? 'b' : 'a';
    for (const k in s.mains) s.mains[k].visible = k === key; s.main = s.mains[key];
    const c1 = new THREE.Color(y.col ? y.col[0] : YEON.sky), c2 = new THREE.Color(y.col ? y.col[1] : YEON.violet);
    for (const mm of [...Object.values(s.mains), ...s.ghosts, s.tip, s.star]) { mm.material.uniforms.uC1.value.copy(c1); mm.material.uniforms.uC2.value.copy(c2); }
    s.ghostN = lo ? 1 : 2; s.ghosts.forEach((g, i) => { g.visible = i < s.ghostN; g.rotation.set(0, 0, (i + 1) * 0.07 * (i % 2 ? -1 : 1)); g.scale.setScalar(1 - 0.06 * (i + 1)); });
    s.star.visible = !lo;
    this._place(s); this.root.add(s.g); this.live.push(s); this._strikeTick(s, 0); return s;
  }
  /** centre = chest of the caster (rides the lunge), radius = real sword-tip distance (until the impact) */
  _place(s) {
    const a = s.follow;
    if (a && !a.dead) {
      const f = a.facing, m = f ? Math.hypot(f.x, f.z) : 0; if (m) { s.dx = f.x / m; s.dz = -f.z / m; }
      s.base.set(a.pos.x, a.pos.y || 0, -a.pos.z);
      let tip = null; try { const b = a.body && a.body.bladePoints && a.body.bladePoints(); if (b) tip = b[1]; } catch (e) { tip = null; }
      s.tipP = tip ? tip.clone() : null;
    }
    const cx = s.base.x + s.dx * 0.15, cz = s.base.z + s.dz * 0.15, cy = s.base.y + 1.05;
    s.arc.position.set(cx, cy, cz);
    if (s.tipP && s.t <= s.lead + 0.02) s.r = Math.min(1.65, Math.max(1.0, Math.hypot(s.tipP.x - cx, s.tipP.y - cy, s.tipP.z - cz)));
    s.arc.quaternion.copy(strikeQuat(s.dx, s.dz, s.roll));
  }
  _strikeTick(s, dt) {
    const t = s.t, u = t - s.lead, k = s.k * YEON.intensity, U = (m) => m.material.uniforms, fin = s.fin;
    if (s.follow && u < 0.06) this._place(s);
    // head: 0 -> 0.62 over the lead (the blade accelerating into the impact), -> 1 in the follow-through
    const head = s.lead > 0 && u < 0 ? 0.62 * easeIn(t / s.lead) + 0.0 : 0.62 + 0.38 * easeOut(u / (fin ? 0.07 : 0.05)) + (s.lead > 0 ? 0 : 0);
    const end = s.life, fade = 1 - smooth(fin ? 0.12 : 0.06, end, u), tail = 1.25 * (1 - smooth(0.03, end, u));
    const grow = 1 + (fin ? 0.12 : 0.08) * smooth(0, end, u), R = s.r * s.size * grow * (fin ? 1.12 : 1);
    s.arc.scale.set(R * s.mir, R, R);
    const mm = U(s.main); mm.uHead.value = Math.max(head, s.lead > 0 ? 0 : 0.45); mm.uTail.value = Math.max(0.001, tail); mm.uA.value = fade;
    mm.uI.value = (fin ? 1.7 : 1.35) * k * (fin ? rawK() : 1); mm.uR.value = fin ? 1.25 : 1.0; mm.uMix.value = 0.15 + 0.6 * smooth(0, end, u);
    s.arc.visible = fade > 0.002;
    s.ghosts.forEach((g, i) => {
      if (i >= s.ghostN) return;
      const d = 0.022 * (i + 1), gu = u - d, gh = s.lead > 0 && gu < 0 ? 0.62 * easeIn((t - d) / s.lead) : 0.62 + 0.38 * easeOut(gu / 0.05);
      const gf = (t > d ? 1 : 0) * (1 - smooth(0.0, (fin ? 0.22 : 0.15) - d, gu)) * (i ? 0.5 : 0.8);
      const G_ = U(g); G_.uHead.value = Math.max(0, gh); G_.uTail.value = 0.9 * (1 - smooth(0.0, 0.15, gu)) + 0.05; G_.uA.value = gf; G_.uI.value = 1.25 * k; G_.uR.value = 0.6; G_.uMix.value = 0.5 + 0.4 * i;
      g.visible = gf > 0.002;
    });
    // sword tip glow: rises into the impact, gone just after it
    const c = cam(), tipA = smooth(-s.lead - 0.001, 0, u) * (1 - smooth(0.01, 0.06, u));
    if (s.tipP && tipA > 0.002) {
      s.tip.visible = true; s.star.visible = !s.lo; s.tip.position.copy(s.tipP); s.star.position.copy(s.tipP);
      if (c) { s.tip.quaternion.copy(c.quaternion); s.star.quaternion.copy(c.quaternion); s.star.rotateZ(t * 6); }
      s.tip.scale.setScalar(0.42 * (fin ? 1.4 : 1)); U(s.tip).uA.value = tipA; U(s.tip).uI.value = 1.6 * k; U(s.tip).uR.value = 1;
      s.star.scale.setScalar(0.6 * (fin ? 1.5 : 1)); U(s.star).uA.value = tipA; U(s.star).uI.value = 1.8 * k;
    } else { s.tip.visible = false; s.star.visible = false; }
    return u < end + 0.02;
  }
  /** a damage event: pos = impact point (GAME coords, y = height), o.y = the strike pattern (roll / mirror / colours / fin),
   *  o.dir = facing {x, z}; o.whiff = nothing was hit (small star only) */
  hit(pos, o = {}) {
    if (!this.ready) { this.load(); return; }
    const s = this._hitSlot(), y = o.y || {}, lo = lite(), f = o.dir || { x: 0, z: 1 }, m = Math.hypot(f.x, f.z) || 1, dx = f.x / m, dz = -f.z / m;
    s.t = 0; s.k = flashK(); s.fin = !!y.fin; s.whiff = !!o.whiff; s.size = (s.fin ? 1.5 : rnd(0.85, 1.15)) * YEON.hitSize * (s.whiff ? 0.45 : 1);
    s.life = s.fin ? 0.36 : 0.24;
    s.g.position.set(pos.x, pos.y || 0, -pos.z);
    // swing tangent at the front of the arc (world): local -X (+X when mirrored) through the strike frame
    s.tan = new THREE.Vector3(y.mirror ? 1 : -1, 0, 0).applyQuaternion(strikeQuat(dx, dz, y.roll || 0));
    s.roll = rnd(-Math.PI, Math.PI); s.cutRoll = rnd(-0.12, 0.12);
    const c1 = new THREE.Color(y.col ? y.col[0] : YEON.sky), c2 = new THREE.Color(y.col ? y.col[1] : YEON.violet);
    for (const mm of [s.flash, s.burst, s.cut, s.cross, s.glow, s.shards]) { mm.material.uniforms.uC1.value.copy(c1); mm.material.uniforms.uC2.value.copy(c2); }
    s.cut.visible = !s.whiff && !s.fin; s.cross.visible = !s.whiff && s.fin; s.burst.visible = s.fin && !s.whiff; s.glow.visible = !s.whiff;
    s.sh.length = 0;
    const n = s.whiff ? 0 : s.fin ? (lo ? 6 : 18) : (lo ? 3 : 8), fwd = new THREE.Vector3(dx, 0, dz);
    for (let i = 0; i < n; i++) {
      // fragments fly along the cut (both ways, mostly with the swing) and a little forward / up
      const along = Math.random() < 0.7 ? 1 : -1, sp = rnd(2.5, 6) * (s.fin ? 1.3 : 1);
      const v = s.tan.clone().multiplyScalar(along * rnd(0.5, 1)).addScaledVector(fwd, rnd(0.1, 0.8)).add(new THREE.Vector3(rnd(-0.3, 0.3), rnd(-0.2, 0.7), rnd(-0.3, 0.3))).normalize().multiplyScalar(sp);
      s.sh.push({ p: new THREE.Vector3(), v, life: rnd(0.16, 0.3) * (s.fin ? 1.3 : 1), len: rnd(0.14, 0.28) * (s.fin ? 1.3 : 1), hue: rnd(0, 0.4) });
    }
    this.root.add(s.g); this.live.push(s); this._hitTick(s, 0); return s;
  }
  _hitTick(s, dt) {
    const t = s.t, k = s.k * YEON.intensity, U = (m) => m.material.uniforms, sz = s.size, c = cam(), fin = s.fin;
    // screen-space angle of the swing at the impact
    let ang = 0, scr = 1;
    if (c) { const v = s.tan.clone().applyQuaternion(c.quaternion.clone().invert()); ang = Math.atan2(v.y, v.x); scr = Math.min(1, Math.max(0.5, Math.hypot(v.x, v.y))); }
    const face = (mesh, rollZ) => { if (c) { mesh.quaternion.copy(c.quaternion); mesh.rotateZ(rollZ); } };
    // flash: in 0 -> 0.02, peak to 0.05, out
    const fIn = easeOut(t / 0.02), fOut = 1 - smooth(fin ? 0.06 : 0.045, fin ? 0.2 : 0.14, t);
    face(s.flash, s.roll); s.flash.scale.setScalar((s.whiff ? 0.7 : 1.15) * sz * (0.6 + 0.4 * fIn) * (1 + 0.15 * smooth(0, 0.14, t)) + 0.001);
    U(s.flash).uA.value = fIn * fOut * (s.whiff ? 0.5 : 1); U(s.flash).uI.value = (fin ? 2.6 : 2.1) * k * rawK(); U(s.flash).uR.value = 0.4 + 0.8 * (1 - smooth(0.03, 0.1, t)); U(s.flash).uMix.value = 0.2 + 0.6 * smooth(0.03, 0.14, t);
    // cut line / cross: full length almost at once (0.03), then thins and fades
    const cIn = easeOut(t / 0.03), cOut = 1 - smooth(0.05, fin ? 0.3 : 0.16, t), thin = 1 - 0.7 * smooth(0.03, fin ? 0.3 : 0.16, t);
    const cutM = fin ? s.cross : s.cut;
    if (cutM.visible) {
      face(cutM, ang + s.cutRoll); const L = (fin ? 2.6 : 1.7) * sz / (fin ? 1.8 : 1) * (fin ? 1 : 1) * (0.55 + 0.45 * scr) * (0.5 + 0.5 * cIn);
      cutM.scale.set(L * (fin ? 1.15 : 1), L * thin * (fin ? 1.15 : 1), 1);
      U(cutM).uA.value = cIn * cOut; U(cutM).uI.value = (fin ? 2.4 : 2.0) * k * rawK(); U(cutM).uR.value = 1.1; U(cutM).uMix.value = 0.1 + 0.5 * smooth(0.04, 0.2, t);
    }
    // finisher burst + ring: expands 0 -> 0.05, fades by 0.34
    if (s.burst.visible) {
      const bIn = easeOut(t / 0.05), bOut = 1 - smooth(0.06, 0.24, t);
      face(s.burst, s.roll * 0.5); s.burst.scale.setScalar(2.5 * (0.4 + 0.6 * bIn) * (1 + 0.25 * smooth(0.05, 0.24, t)));
      U(s.burst).uA.value = bIn * bOut; U(s.burst).uI.value = 1.6 * k * rawK(); U(s.burst).uR.value = 0.8; U(s.burst).uMix.value = 0.3 + 0.6 * smooth(0.05, 0.3, t);
    }
    // soft coloured afterglow
    if (s.glow.visible) {
      face(s.glow, 0); const gA = smooth(0, 0.03, t) * (1 - smooth(0.06, s.life, t));
      s.glow.scale.setScalar((fin ? 2.2 : 1.1) * (s.whiff ? 0.5 : 1) * (0.8 + 0.3 * smooth(0, s.life, t)));
      U(s.glow).uA.value = gA * 0.5; U(s.glow).uI.value = 0.8 * k; U(s.glow).uR.value = 0.15; U(s.glow).uMix.value = 0.8;
    }
    // shards
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), fa = s.shards.geometry.attributes.aFade, hu = s.shards.geometry.attributes.aHue, Z = new THREE.Vector3(0, 0, 1), d = new THREE.Vector3();
    let n = 0;
    for (const p of s.sh) {
      if (t > p.life) continue;
      p.v.multiplyScalar(Math.max(0, 1 - 4.5 * dt)); p.v.y -= 3 * dt; p.p.addScaledVector(p.v, dt);
      const uu = t / p.life; d.copy(p.v); if (d.lengthSq() < 1e-6) d.set(0, 0, 1);
      q.setFromUnitVectors(Z, d.normalize());
      const L = p.len * (1 - uu * 0.5); m4.compose(p.p, q, sc.set(L * 0.5, L * 0.5, L * 1.6)); s.shards.setMatrixAt(n, m4);
      fa.setX(n, Math.pow(1 - uu, 0.8) * 1.4); hu.setX(n, Math.min(1, p.hue + uu * 0.7)); n++;
    }
    s.shards.count = n; s.shards.instanceMatrix.needsUpdate = true; fa.needsUpdate = true; hu.needsUpdate = true; s.shards.visible = n > 0;
    U(s.shards).uI.value = 1.6 * k; U(s.shards).uR.value = 1;
    return t < s.life + 0.02;
  }
  update(dt) {
    if (!dt) return;
    dt *= YEON.speed;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const s = this.live[i]; s.t += dt;
      const alive = s.kind === 'strike' ? this._strikeTick(s, dt) : this._hitTick(s, dt);
      if (!alive) { this.root.remove(s.g); s.follow = null; this.live.splice(i, 1); const f = this.free[s.kind]; if (f.length < 10) f.push(s); }
    }
  }
  clear() { for (const s of this.live) { this.root.remove(s.g); s.follow = null; this.free[s.kind].push(s); } this.live.length = 0; }
}
if (typeof window !== 'undefined') window.YEON_FX = YEON;
