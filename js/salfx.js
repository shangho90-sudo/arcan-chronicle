// 일격참 '살(殺)' single-thrust effect: short gather at the sword tip -> a sharp white/pink beam shoots forward ->
// a white core + pink / purple star flash bursts on every target hit -> rays thin out, purple afterglow and shards vanish.
//
// Assets: tools/blender/fx_sal.py -> assets/fx/fx_sal.glb.json (meshes, game axes +Z forward / +Y up) + assets/fx/fx_sal.png
// (atlas of MASKS: R = hot core, G = body, B = halo, A = coverage; recoloured here with SAL.white / pink / magenta / purple).
//
// Parts (one shared shader; additive with a little background darkening so the shape reads without bloom):
//   cast  (follows the caster while the beam extends, then stays in the world)
//     tip glow (camera quad at the real sword tip) + 6 converging sparks       0.00 - 0.08
//     core needle (white) + 3 crossed membranes (pink->purple) + 3 side rays    extend 0.05 - 0.12, thin + fade to 0.34
//   hit   (spawned at the target's hit point, never follows anyone)
//     white core quad, 8 pink rays (longest along the thrust), 6 thin purple rays, purple afterglow quad, 14 shards
//     peak 0.00 - 0.06 after the hit, rays thin 0.06 - 0.20, purple afterglow + shards gone by ~0.35
// Low spec (phone or "그래픽 효과" off): no side rays / thin rays, fewer shards and sparks. "섬광 효과 줄이기": dimmer peaks.
// Tuning: SAL (colours, intensity, length / width multipliers, speed) - window.SAL_FX at runtime for quick tests.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const SAL = { white: 0xfff7ff, pink: 0xff4fd8, magenta: 0xd83cff, purple: 0x7b4dff, intensity: 1, length: 1, width: 1, speed: 1, hitSize: 1 };
const CAST_LIFE = 0.45, HIT_LIFE = 0.42, CELL0_C = 0.25, CELL0_H = 0.25 - 3 / 512;

const VS = `
attribute float aFade; attribute float aHue;
varying vec2 vUv; varying float vF, vH;
void main(){
  vUv = uv; vec4 p = vec4(position, 1.);
#ifdef USE_INSTANCING
  p = instanceMatrix * p; vF = aFade; vH = aHue;
#else
  vF = 1.; vH = 0.;
#endif
  gl_Position = projectionMatrix * modelViewMatrix * p;
}`;
const FS = `
uniform sampler2D uMap; uniform vec3 uW, uP, uM, uU; uniform float uI, uA, uHue, uThin, uR;
varying vec2 vUv; varying float vF, vH;
void main(){
  vec2 uv = vUv;
  if (uThin < .999) { float o = (uv.y - ${CELL0_C.toFixed(4)}) / max(.04, uThin); if (abs(o) > ${CELL0_H.toFixed(4)}) discard; uv.y = ${CELL0_C.toFixed(4)} + o; }
  vec4 t = texture2D(uMap, uv);
  float h = clamp(uHue + vH, 0., 1.), f = uA * vF;
  vec3 body = mix(uP, uM, smoothstep(.15, .65, h)); body = mix(body, uU, smoothstep(.55, 1., h));
  vec3 c = (uW * t.r * uR * (1. - h * .7) + body * t.g * (1. - .35 * t.r * uR) + uU * t.b * .6) * uI * f;
  gl_FragColor = vec4(c, clamp((t.g * .9 + t.b * .5 + t.r * .3) * f * .85, 0., 1.));   // darken the ground under the colour a little: the shape reads without bloom
}`;

const easeOut = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const expoOut = (x) => x >= 1 ? 1 : 1 - Math.pow(2, -10 * Math.max(0, x));
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const rnd = (a, b) => a + Math.random() * (b - a);
const lite = () => { const G = window.G; return !!(G && ((G.input && G.input.mobile) || (G.settings && G.settings.graphicsFx === false))); };
const flashK = () => { const G = window.G; return G && G.reduceFlash ? 0.6 : 1; };

async function loadWrapped(url) {
  const j = await (await fetch(url)).json(); const raw = atob(j.b64), u8 = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
  return new Promise((res, rej) => new GLTFLoader().parse(u8.buffer, '', res, rej));
}

export class SalFx {
  constructor(root) { this.root = root; this.live = []; this.free = { cast: [], hit: [] }; this.ready = false; this.loading = null; this.geo = {}; }
  load() {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const [g, tex] = await Promise.all([loadWrapped('assets/fx/fx_sal.glb.json'), new THREE.TextureLoader().loadAsync('assets/fx/fx_sal.png')]);
      g.scene.traverse(o => { if (o.isMesh) this.geo[o.name] = o.geometry; });
      tex.flipY = false; tex.colorSpace = THREE.NoColorSpace; tex.generateMipmaps = true; tex.anisotropy = 2; tex.needsUpdate = true;
      this.tex = tex;
      this.ready = true;
    })().catch(e => { console.warn('salfx load', e); });
    return this.loading;
  }
  _mat(hue = 0) {
    return new THREE.ShaderMaterial({
      uniforms: { uMap: { value: this.tex }, uW: { value: new THREE.Color(SAL.white) }, uP: { value: new THREE.Color(SAL.pink) }, uM: { value: new THREE.Color(SAL.magenta) },
        uU: { value: new THREE.Color(SAL.purple) }, uI: { value: 1 }, uA: { value: 0 }, uHue: { value: hue }, uThin: { value: 1 }, uR: { value: 1 } },
      vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation,
    });
  }
  _mesh(name, hue, order) { const m = new THREE.Mesh(this.geo[name], this._mat(hue)); m.frustumCulled = false; m.renderOrder = order; return m; }
  _inst(n, order) {
    const geo = this.geo.sal_shard.clone(); geo.setAttribute('aFade', new THREE.InstancedBufferAttribute(new Float32Array(n), 1)); geo.setAttribute('aHue', new THREE.InstancedBufferAttribute(new Float32Array(n), 1));
    const m = new THREE.InstancedMesh(geo, this._mat(0), n); m.frustumCulled = false; m.renderOrder = order; m.count = 0; m.material.uniforms.uA.value = 1; return m;
  }
  _castSlot() {
    let s = this.free.cast.pop(); if (s) return s;
    s = { kind: 'cast', g: new THREE.Group(), beam: new THREE.Group() };
    s.core = this._mesh('sal_thrust_core', 0, 9); s.sheet = this._mesh('sal_thrust_sheet', 0.15, 8); s.side = this._mesh('sal_thrust_side', 0.3, 8); s.side.material.uniforms.uR.value = 0.5;
    s.beam.add(s.sheet, s.side, s.core);
    s.tip = this._mesh('sal_quad', 0, 10); s.sparks = this._inst(6, 10);
    s.g.add(s.beam, s.tip); s.sp = [];
    return s;
  }
  _hitSlot() {
    let s = this.free.hit.pop(); if (s) return s;
    s = { kind: 'hit', g: new THREE.Group(), star: new THREE.Group() };
    s.rays = this._mesh('sal_hit_rays', 0, 9); s.rays.material.uniforms.uR.value = 0.3; s.thin = this._mesh('sal_hit_thin', 0.85, 8); s.thin.material.uniforms.uR.value = 0.2; s.star.add(s.thin, s.rays);
    s.core = this._mesh('sal_quad', 0, 11); s.after = this._mesh('sal_quad', 1, 7); s.shards = this._inst(14, 10);
    s.g.add(s.star, s.after, s.core); s.sh = [];
    return s;
  }
  /** cast: the sword-tip gather + the forward beam. pos/dir in GAME coords ({x, y, z}, dir {x, z}); o.follow = actor whose
   *  sword tip / facing the beam follows until it has fully extended; o.length = beam length (m) from its origin. */
  cast(pos, dir, o = {}) {
    if (!this.ready) { this.load(); return; }
    const s = this._castSlot(), lo = lite(), m = Math.hypot(dir.x, dir.z) || 1;
    s.t = 0; s.dx = dir.x / m; s.dz = -dir.z / m; s.follow = o.follow || null; s.L = (o.length ?? 2.6) * SAL.length; s.W = (o.width ?? 1) * SAL.width;
    s.o3 = new THREE.Vector3(pos.x, (pos.y || 0) + 1.0, -pos.z); s.tipP = s.o3.clone(); s.lite = lo; s.k = flashK();
    s.side.visible = !lo; s.sp.length = 0;
    const n = lo ? 4 : 6;
    for (let i = 0; i < n; i++) { const a = rnd(0, Math.PI * 2), e = rnd(-0.6, 0.9), r = rnd(0.35, 0.6);
      s.sp.push({ x: Math.cos(a) * Math.cos(e) * r, y: Math.sin(e) * r, z: Math.sin(a) * Math.cos(e) * r, d: rnd(0, 0.012) }); }
    this._place(s); this.root.add(s.g); this.live.push(s); this._castTick(s, 0); return s;
  }
  /** hit: star flash at a target's hit point (GAME coords, y = height of the flash), dir = thrust direction {x, z} */
  hit(pos, dir, o = {}) {
    if (!this.ready) { this.load(); return; }
    const s = this._hitSlot(), lo = lite(), m = Math.hypot(dir.x, dir.z) || 1, dx = dir.x / m, dz = -dir.z / m;
    s.t = -(o.delay || 0); s.k = flashK(); s.size = (o.size ?? 1) * SAL.hitSize;
    s.g.position.set(pos.x, pos.y || 0, -pos.z);
    s.star.rotation.set(0, Math.atan2(dx, dz), 0); s.star.rotateZ(rnd(-0.5, 0.5));            // longest ray along the thrust, random roll
    s.thin.visible = !lo; s.sh.length = 0;
    const n = lo ? 6 : 14;
    for (let i = 0; i < n; i++) {
      const fw = Math.random() < 0.6, a = fw ? rnd(-0.6, 0.6) : rnd(-Math.PI, Math.PI), up = rnd(-0.35, 0.8), sp = rnd(3, 7.5) * (fw ? 1.2 : 0.8);
      const ca = Math.cos(a), sa = Math.sin(a), vx = dx * ca - dz * sa, vz = dx * sa + dz * ca;
      s.sh.push({ p: new THREE.Vector3(), v: new THREE.Vector3(vx * sp, up * sp * 0.6, vz * sp), life: rnd(0.2, 0.38), len: rnd(0.28, 0.5), hue: rnd(0, 0.3) });
    }
    this.root.add(s.g); this.live.push(s); this._hitTick(s, 0); return s;
  }
  _place(s) {
    const a = s.follow;
    if (a && !a.dead) {
      const f = a.facing || { x: s.dx, z: -s.dz }, m = Math.hypot(f.x, f.z) || 1; s.dx = f.x / m; s.dz = -f.z / m;
      let tip = null; try { const b = a.body && a.body.bladePoints && a.body.bladePoints(); if (b) tip = b[1].clone(); } catch (e) { tip = null; }
      const px = a.pos.x, pz = -a.pos.z, py = a.pos.y || 0;
      if (tip) s.tipP.copy(tip); else s.tipP.set(px + s.dx * 0.8, py + 1.05, pz + s.dz * 0.8);
      // the beam starts on the attack axis in front of the body, at the height of the blade
      s.o3.set(px + s.dx * 0.55, py + Math.min(1.3, Math.max(0.8, s.tipP.y - py)), pz + s.dz * 0.55);
    }
    s.beam.position.copy(s.o3); s.beam.rotation.set(0, Math.atan2(s.dx, s.dz), 0);
  }
  _castTick(s, dt) {
    const t = s.t, k = s.k * SAL.intensity, U = (m) => m.material.uniforms;
    if (t < 0.13 && s.follow) this._place(s);                     // ride the lunge while extending, then stay in the world
    // A. tip gather: quad grows fast, sparks converge 0 -> 0.05, glow gone by 0.10
    const cam = window.G && window.G.render && window.G.render.cam;
    s.tip.position.copy(s.tipP); if (cam) s.tip.quaternion.copy(cam.quaternion);
    const gIn = easeOut(t / 0.04), gOut = 1 - smooth(0.06, 0.11, t);
    s.tip.scale.setScalar(0.62 * gIn * (1 + 0.3 * smooth(0.03, 0.06, t)) + 0.001); U(s.tip).uA.value = gIn * gOut; U(s.tip).uI.value = 1.6 * k;
    s.tip.visible = gOut > 0;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), fa = s.sparks.geometry.attributes.aFade, hu = s.sparks.geometry.attributes.aHue;
    let n = 0;
    for (const p of s.sp) {
      const u = Math.min(1, Math.max(0, (t - p.d) / 0.055)); if (u >= 1) continue;
      const r = 1 - easeOut(u); v.set(s.tipP.x + p.x * r, s.tipP.y + p.y * r, s.tipP.z + p.z * r);
      q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(-p.x, -p.y, -p.z).normalize());
      m4.compose(v, q, sc.set(0.1, 0.1, 0.34 * (1 - u * 0.6))); s.sparks.setMatrixAt(n, m4); fa.setX(n, Math.sin(u * Math.PI) * 1.2); hu.setX(n, 0.1); n++;
    }
    s.sparks.count = n; s.sparks.instanceMatrix.needsUpdate = true; fa.needsUpdate = true; hu.needsUpdate = true;
    if (!s.sparks.parent && n) s.g.add(s.sparks);
    // B. beam: extends 0.05 -> 0.12 (expo out), thins 0.12 -> 0.30, fades out by 0.34
    const ext = expoOut((t - 0.05) / 0.07), thin = 1 - 0.8 * smooth(0.12, 0.3, t), fade = t < 0.13 ? smooth(0.045, 0.07, t) : Math.pow(1 - smooth(0.13, 0.34, t), 1.3);
    const L = Math.max(0.001, s.L * ext), W = s.W;
    s.beam.visible = t > 0.045 && fade > 0.002;
    s.core.scale.set(W * thin, W * thin, L); U(s.core).uA.value = fade; U(s.core).uI.value = 2.0 * k; U(s.core).uThin.value = 1;
    s.sheet.scale.set(W * (0.6 + 0.4 * thin), W * (0.6 + 0.4 * thin), L * 0.94); U(s.sheet).uA.value = fade; U(s.sheet).uI.value = 1.5 * k; U(s.sheet).uHue.value = 0.1 + 0.6 * smooth(0.12, 0.32, t);
    const sideRun = smooth(0.06, 0.3, t);
    s.side.position.z = 0; s.side.scale.set(W, W, L * (0.85 + 0.25 * sideRun)); U(s.side).uA.value = fade * (1 - 0.4 * sideRun); U(s.side).uI.value = 1.2 * k; U(s.side).uHue.value = 0.2 + 0.6 * sideRun;
    return t < CAST_LIFE / SAL.speed;
  }
  _hitTick(s, dt) {
    const t = s.t, k = s.k * SAL.intensity, sz = s.size, U = (m) => m.material.uniforms;
    s.g.visible = t >= 0; if (t < 0) return true;
    const cam = window.G && window.G.render && window.G.render.cam;
    if (cam) { s.core.quaternion.copy(cam.quaternion); s.after.quaternion.copy(cam.quaternion); }
    // C. white core: snaps in (0.02 s), holds to 0.05, collapses by 0.18
    const cIn = expoOut(t / 0.025), cOut = 1 - smooth(0.05, 0.18, t);
    s.core.scale.setScalar(0.9 * sz * cIn * (0.35 + 0.65 * cOut) + 0.001); U(s.core).uA.value = cOut; U(s.core).uI.value = 2.2 * k;
    // pink rays: shoot out in 0.035 s (overshoot a little), thin 0.06 -> 0.2, fade by 0.22
    const rIn = expoOut(t / 0.035), rThin = 1 - 0.85 * smooth(0.05, 0.2, t), rFade = 1 - smooth(0.09, 0.22, t);
    s.star.scale.setScalar(1.05 * sz * rIn * (1 + 0.12 * smooth(0.04, 0.22, t)) + 0.001);
    U(s.rays).uA.value = rFade; U(s.rays).uThin.value = rThin; U(s.rays).uI.value = 2.4 * k; U(s.rays).uHue.value = 0.4 * smooth(0.08, 0.22, t);
    // thin purple rays linger as afterglow (0.01 -> 0.35)
    const pIn = expoOut((t - 0.01) / 0.05), pFade = 1 - smooth(0.12, 0.35, t);
    U(s.thin).uA.value = pIn * pFade; U(s.thin).uThin.value = 1 - 0.6 * smooth(0.1, 0.35, t); U(s.thin).uI.value = 1.6 * k; U(s.thin).uHue.value = 0.85;
    // purple afterglow quad (soft)
    const aA = smooth(0.0, 0.04, t) * (1 - smooth(0.08, 0.38, t));
    s.after.scale.setScalar(1.25 * sz * (0.8 + 0.4 * smooth(0, 0.3, t))); U(s.after).uA.value = aA * 0.55; U(s.after).uI.value = 0.9 * k; U(s.after).uHue.value = 1;
    // D. shards: fly forward / sideways, drag, pink -> purple, shrink + fade
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), fa = s.shards.geometry.attributes.aFade, hu = s.shards.geometry.attributes.aHue, Z = new THREE.Vector3(0, 0, 1), d = new THREE.Vector3();
    let n = 0;
    for (const p of s.sh) {
      if (t > p.life) continue;
      p.v.multiplyScalar(Math.max(0, 1 - 5 * dt)); p.v.y -= 2 * dt; p.p.addScaledVector(p.v, dt);
      const u = t / p.life; d.copy(p.v); if (d.lengthSq() < 1e-6) d.set(0, 0, 1);
      q.setFromUnitVectors(Z, d.normalize());
      m4.compose(p.p, q, sc.set(p.len * 0.6 * (1 - u * 0.6), p.len * 0.6 * (1 - u * 0.6), p.len * (1 - u * 0.5) * (1 + 0.5 * (1 - u))));
      s.shards.setMatrixAt(n, m4); fa.setX(n, Math.pow(1 - u, 0.7) * 1.6); hu.setX(n, Math.min(1, p.hue + u * 0.9)); n++;
    }
    s.shards.count = n; s.shards.instanceMatrix.needsUpdate = true; fa.needsUpdate = true; hu.needsUpdate = true;
    if (!s.shards.parent && n) s.g.add(s.shards);
    U(s.shards).uI.value = 1.4 * k;
    return t < HIT_LIFE / SAL.speed;
  }
  update(dt) {
    if (!dt) return;
    dt *= SAL.speed;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const s = this.live[i]; s.t += dt;
      const alive = s.kind === 'cast' ? this._castTick(s, dt) : this._hitTick(s, dt);
      if (!alive) { this.root.remove(s.g); s.follow = null; this.live.splice(i, 1); const f = this.free[s.kind]; if (f.length < 8) f.push(s); }
    }
  }
  clear() { for (const s of this.live) { this.root.remove(s.g); s.follow = null; this.free[s.kind].push(s); } this.live.length = 0; }
}
if (typeof window !== 'undefined') window.SAL_FX = SAL;
