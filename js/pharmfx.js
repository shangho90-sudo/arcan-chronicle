// 약사 1차 새 스킬 이펙트 (2026-11-11). Meshes / texture from tools/blender/fx_pharm.py:
//   assets/fx/fx_pharm.glb.json  pharm_pestle, pharm_flask, pharm_cork, pharm_syringe, pharm_circle, pharm_ring, pharm_dome
//   assets/fx/fx_pharm_circle.png  green healing circle (RGBA)
// Kinds (js/skillrt.js FX.pharm(kind, a, o)):
//   pestle(pos, {fall, r})   천근쇄약: a ~4.6 m golden pestle appears high above the aim, tilts upright while it drops and
//                            lands exactly after `fall` s (= the skill's delay blast); gold landing marker on the ground
//                            grows while it falls; on impact a gold shock ring + glow; it stays 0.3 s and fades / sinks
//   flask(pos, {elem, fall}) 약병폭격: one flask (liquid tinted fire / ice / poison) spinning down from ~7 m onto pos, with a
//                            coloured landing marker; disappears on impact (the explosion burst is the skill's blast)
//   syringe(pc, {dur})       아드레날린 주사: a syringe moves from the right hand to the left upper arm and is pressed
//                            (0.75 s), then an orange heartbeat ring + rising sparks pulse at the feet for `dur` s
//   shield(pc, {dur})        약 보호막: a cyan honeycomb dome around the caster for `dur` s (fades out early when the shield
//                            value is used up)
//   circle(pos, {r, dur})    광역 회복진: the green circle texture on the ground (slow turn, breathing glow) + rising green
//                            motes; .pulse(target) flashes a heal ring on each healing tick; .end() fades it out
// Each effect is built on use (shared Blender geometry, own small materials disposed at the end) and cleared on zone change. Low spec (phone / 그래픽 효과 off): fewer motes.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const P3 = (p) => new THREE.Vector3(p.x, p.y || 0, -p.z);
const lite = () => { const G = window.G; return !!(G && ((G.input && G.input.mobile) || (G.settings && G.settings.graphicsFx === false))); };
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const ELEM_COL = { fire: 0xff6a20, ice: 0x60c8ff, poison: 0x78e040 };

async function loadWrapped(url) {
  const j = await (await fetch(url)).json(); const raw = atob(j.b64), u8 = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
  return new Promise((res, rej) => new GLTFLoader().parse(u8.buffer, '', res, rej));
}

// solid props (gold / glass / syringe): vertex colour, fixed key light + rim, optional emissive liquid tint, fade
const SOLID_VS = `
attribute vec3 color; varying vec3 vC, vN, vV; varying float vY;
void main(){ vC = color; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vV = normalize(-mv.xyz); vY = position.y;
  gl_Position = projectionMatrix * mv; }`;
const SOLID_FS = `
uniform vec3 uTint, uRim, uEm; uniform float uA, uLiquid, uGlow, uSpec;
varying vec3 vC, vN, vV; varying float vY;
void main(){
  vec3 n = normalize(vN), L = normalize(vec3(-.4, .8, .5));
  float d = max(0., dot(n, L)), rim = pow(1. - max(0., dot(n, vV)), 2.5);
  vec3 base = vC;
  if (uLiquid > .5) base = mix(vec3(.85, .92, 1.) * .55, uTint, vC.r);          // flask: R = liquid, else glass
  vec3 c = base * (.42 + .75 * d) + uRim * rim * .9;
  vec3 h = reflect(-L, n); c += vec3(1., .95, .8) * pow(max(0., dot(h, vV)), 24.) * uSpec;
  c += uEm * uGlow + (uLiquid > .5 ? uTint * vC.r * .55 : vec3(0.));
  gl_FragColor = vec4(c, uA);
}`;
// additive glow on a flat mesh: ring / landing marker (u = radial across the ring for pharm_ring, disc uses radius)
const GLOW_VS = `varying vec2 vUv; varying vec3 vP; void main(){ vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const RING_FS = `uniform vec3 uC; uniform float uA; varying vec2 vUv; void main(){ float u = vUv.x; float m = smoothstep(0., .55, u) * (1. - smoothstep(.75, 1., u)) + .6 * smoothstep(.7, 1., u) * (1. - smoothstep(.95, 1., u));
  gl_FragColor = vec4(uC * m * uA, 1.); }`;
const MARK_FS = `uniform vec3 uC; uniform float uA, uK; varying vec3 vP; void main(){ float r = length(vP.xz); float ring = smoothstep(.86, .95, r) * (1. - smoothstep(.97, 1., r));
  float fill = (1. - smoothstep(0., 1., r)) * .25 * uK; float spoke = step(.2, r) * (1. - smoothstep(0., .04, abs(fract(atan(vP.z, vP.x) * 1.2732) - .5) - .45)) * .0;
  gl_FragColor = vec4(uC * (ring + fill + spoke) * uA, 1.); }`;
const CIRCLE_FS = `uniform sampler2D uMap; uniform float uA, uT; varying vec2 vUv; void main(){ vec4 t = texture2D(uMap, vUv);
  float br = .85 + .25 * sin(uT * 3.);  gl_FragColor = vec4(t.rgb * t.a * uA * br * 1.15, 1.); }`;
const DOME_FS = `uniform vec3 uC; uniform float uA, uT, uHit; varying vec2 vUv; varying vec3 vP;
  void main(){ vec2 p = vec2(vUv.x * 28., vUv.y * 9.); p.x += mod(floor(p.y), 2.) * .5; vec2 f = abs(fract(p) - .5);
    float hex = smoothstep(.40, .48, max(f.x * 1.1, f.y));
    float fres = pow(1. - vUv.y * .0 - clamp(vP.y, 0., 1.) * .0, 1.) ; float edge = smoothstep(.0, .2, vUv.y) * (1. - smoothstep(.9, 1., vUv.y) * .4);
    float band = smoothstep(.0, .06, abs(fract(vUv.y * 2. - uT * .6) - .5) - .38);
    float a = (.10 + .32 * hex + .25 * band + uHit * .4) * edge * uA;
    gl_FragColor = vec4(uC * a, 1.); }`;
const ADD = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide };

export class PharmFx {
  constructor(root) { this.root = root; this.live = []; this.ready = false; this.geo = {}; this.loading = null; }
  load() {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const [g, tex] = await Promise.all([loadWrapped('assets/fx/fx_pharm.glb.json'), new THREE.TextureLoader().loadAsync('assets/fx/fx_pharm_circle.png')]);
      g.scene.traverse(o => { if (o.isMesh) this.geo[o.name] = o.geometry; });
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; this.circleTex = tex; this.ready = true;
    })().catch(e => console.warn('pharmfx load', e));
    return this.loading;
  }
  _solid(geo, o = {}) {
    const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: { uTint: { value: new THREE.Color(o.tint || 0xffffff) }, uRim: { value: new THREE.Color(o.rim || 0xfff0c0) },
      uEm: { value: new THREE.Color(o.em || 0x000000) }, uA: { value: 1 }, uLiquid: { value: o.liquid ? 1 : 0 }, uGlow: { value: o.glow || 0 }, uSpec: { value: o.spec ?? 0.8 } },
      vertexShader: SOLID_VS, fragmentShader: SOLID_FS, transparent: true, depthWrite: true }));
    m.frustumCulled = false; return m;
  }
  _flat(geo, fs, uni, order = 3) {
    const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: uni, vertexShader: GLOW_VS, fragmentShader: fs, ...ADD }));
    m.frustumCulled = false; m.renderOrder = order; return m;
  }
  _add(e) { this.root.add(e.g); this.live.push(e); return e; }
  _ok() { if (!this.ready) { this.load(); return false; } return true; }

  pestle(pos, o = {}) {
    if (!this._ok()) return null;
    const g = new THREE.Group(), p = P3(pos), H = 4.6, fall = o.fall || 0.42, r = o.r || 4;
    const pe = this._solid(this.geo.pharm_pestle, { rim: 0xffe9a0, em: 0xffc040, glow: 0.35, spec: 1.4 }); pe.scale.setScalar(H);
    const mark = this._flat(this.geo.pharm_circle, MARK_FS, { uC: { value: new THREE.Color(0xffc850) }, uA: { value: 0 }, uK: { value: 0 } }, 2); mark.scale.setScalar(r); mark.position.y = 0.05;
    const ring = this._flat(this.geo.pharm_ring, RING_FS, { uC: { value: new THREE.Color(0xffd070) }, uA: { value: 0 } }, 4); ring.position.y = 0.08; ring.visible = false;
    const halo = this._flat(this.geo.pharm_circle, MARK_FS, { uC: { value: new THREE.Color(0xfff0b0) }, uA: { value: 0 }, uK: { value: 4 } }, 4); halo.position.y = 0.07; halo.visible = false;
    g.add(mark, ring, halo, pe); g.position.copy(p);
    const yaw = Math.random() * 6.28;
    return this._add({ kind: 'pestle', g, t: 0, life: fall + 1.0, update: (e, dt) => {
      const t = e.t;
      if (t < fall) {   // drop: from 9 m, tilted 50 deg, accelerating, upright at the end
        const k = t / fall, f = k * k;
        pe.position.set(0, 9 * (1 - f), 0); pe.rotation.set(0, yaw, (1 - smooth(0, 1, k)) * 0.9); pe.material.uniforms.uA.value = smooth(0, 0.15, k);
        pe.material.uniforms.uGlow.value = 0.35 + 0.4 * k;
        mark.material.uniforms.uA.value = 0.25 + 0.75 * k; mark.material.uniforms.uK.value = k;
      } else {
        const u = t - fall;
        pe.position.set(0, -0.6 * smooth(0.2, 0.9, u) - 0.35 * Math.min(1, u * 12), 0); pe.rotation.set(0, yaw, 0);
        pe.material.uniforms.uA.value = 1 - smooth(0.35, 0.95, u); pe.material.uniforms.uGlow.value = 0.9 * (1 - smooth(0, 0.4, u)) + 0.2;
        mark.material.uniforms.uA.value = 1 - smooth(0, 0.3, u);
        ring.visible = halo.visible = true; const s = r * (0.35 + 0.75 * Math.sqrt(smooth(0, 0.45, u)));
        ring.scale.setScalar(s); ring.material.uniforms.uA.value = 1.6 * (1 - smooth(0.1, 0.5, u));
        halo.scale.setScalar(r * 0.55); halo.material.uniforms.uA.value = 1.2 * (1 - smooth(0, 0.5, u));
      }
    } });
  }
  flask(pos, o = {}) {
    if (!this._ok()) return null;
    const g = new THREE.Group(), p = P3(pos), fall = o.fall || 0.5, col = ELEM_COL[o.elem] || 0xffffff;
    const body = this._solid(this.geo.pharm_flask, { liquid: true, tint: col, rim: 0xffffff, spec: 1.2 }), cork = this._solid(this.geo.pharm_cork, { spec: 0.2 });
    const fl = new THREE.Group(); fl.add(body, cork); fl.scale.setScalar(1.6);
    const mark = this._flat(this.geo.pharm_circle, MARK_FS, { uC: { value: new THREE.Color(col) }, uA: { value: 0 }, uK: { value: 0 } }, 2); mark.scale.setScalar(1.5); mark.position.y = 0.05;
    g.add(mark, fl); g.position.copy(p);
    const sp = (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 4), dx = (Math.random() - 0.5) * 1.5, dz = (Math.random() - 0.5) * 1.5;
    return this._add({ kind: 'flask', g, t: 0, life: fall, update: (e, dt) => {
      const k = clamp01(e.t / fall), f = k * k;
      fl.position.set(dx * (1 - f), 7 * (1 - f) + 0.2, dz * (1 - f)); fl.rotation.set(e.t * sp * 0.6, 0, e.t * sp);
      mark.material.uniforms.uA.value = 0.3 + 0.9 * k; mark.material.uniforms.uK.value = k;
    } });
  }
  syringe(pc, o = {}) {
    if (!this._ok() || !pc) return null;
    const g = new THREE.Group(), dur = o.dur || 15, low = lite();
    const sy = this._solid(this.geo.pharm_syringe, { rim: 0xffe0c0, em: 0xff7030, glow: 0.25, spec: 1.2 }); sy.scale.setScalar(0.42);
    const ring = this._flat(this.geo.pharm_ring, RING_FS, { uC: { value: new THREE.Color(0xff8a40) }, uA: { value: 0 } }, 3); ring.position.y = 0.06;
    const n = low ? 6 : 14, sparks = [];
    for (let i = 0; i < n; i++) { const m = this._flat(this.geo.pharm_circle, MARK_FS, { uC: { value: new THREE.Color(i % 2 ? 0xffb060 : 0xff6a30) }, uA: { value: 0 }, uK: { value: 4 } }, 4); m.rotation.x = Math.PI / 2; m.scale.setScalar(0.06); m.userData = { a: Math.random() * 6.28, ph: Math.random(), r: 0.35 + Math.random() * 0.35 }; sparks.push(m); g.add(m); }
    g.add(sy, ring); const fwd = new THREE.Vector3(), rt = new THREE.Vector3(), a0 = new THREE.Vector3(), a1 = new THREE.Vector3();
    return this._add({ kind: 'syringe', g, t: 0, life: dur, pc, update: (e, dt) => {
      if (pc.dead) { e.t = e.life; return; }
      g.position.copy(P3(pc.pos)); const f = pc.facing || { x: 0, z: 1 }; fwd.set(f.x, 0, -f.z).normalize(); rt.set(-fwd.z, 0, fwd.x);
      const t = e.t;
      // syringe: right hand (front right, chest) -> left upper arm, needle (+Y of the mesh) pointing at the arm; pressed 0.45 - 0.7
      if (t < 0.95) {
        sy.visible = true; const k = smooth(0.05, 0.45, t);
        a0.copy(rt).multiplyScalar(0.32).addScaledVector(fwd, 0.38).setY(1.0); a1.copy(rt).multiplyScalar(-0.42).addScaledVector(fwd, 0.08).setY(1.32);
        sy.position.lerpVectors(a0, a1, k); const dir = new THREE.Vector3().copy(rt).multiplyScalar(-1).addScaledVector(fwd, -0.15).setY(-0.25).normalize();
        sy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); sy.position.addScaledVector(dir, -0.42 * (1 - smooth(0.45, 0.7, t) * 0.25));
        sy.material.uniforms.uA.value = smooth(0, 0.08, t) * (1 - smooth(0.78, 0.95, t)); sy.material.uniforms.uGlow.value = 0.25 + 0.8 * smooth(0.45, 0.7, t);
      } else sy.visible = false;
      // heartbeat ring + sparks (fade in after the injection, fade out over the last second)
      const on = smooth(0.55, 0.9, t) * (1 - smooth(e.life - 1, e.life, t)), beat = Math.pow(Math.max(0, Math.sin(t * 7.5)), 6);
      ring.scale.setScalar(0.7 + 0.25 * beat); ring.material.uniforms.uA.value = on * (0.35 + 0.9 * beat);
      for (const m of sparks) { const u = (m.userData.ph + t * 0.6) % 1; m.position.set(Math.cos(m.userData.a + t) * m.userData.r, 0.1 + u * 1.8, Math.sin(m.userData.a + t) * m.userData.r); m.material.uniforms.uA.value = on * Math.sin(u * Math.PI) * 1.2; }
    } });
  }
  shield(pc, o = {}) {
    if (!this._ok() || !pc) return null;
    const g = new THREE.Group(), dur = o.dur || 8;
    const dome = this._flat(this.geo.pharm_dome, DOME_FS, { uC: { value: new THREE.Color(0x7ad8ff) }, uA: { value: 0 }, uT: { value: 0 }, uHit: { value: 0 } }, 6);
    dome.scale.set(1.05, 1.9, 1.05);
    const ring = this._flat(this.geo.pharm_ring, RING_FS, { uC: { value: new THREE.Color(0x8ae8ff) }, uA: { value: 0 } }, 3); ring.scale.setScalar(1.08); ring.position.y = 0.05;
    g.add(dome, ring); let gone = -1, last = pc.shield || 0;
    return this._add({ kind: 'shield', g, t: 0, life: dur, pc, update: (e, dt) => {
      if (pc.dead) { e.t = e.life; return; }
      g.position.copy(P3(pc.pos)); const t = e.t, u = dome.material.uniforms;
      if (gone < 0 && t > 0.3 && !(pc.shield > 0)) gone = t;                 // shield used up -> fade now
      const hit = (pc.shield || 0) < last - 0.5; last = pc.shield || 0; u.uHit.value = Math.max(u.uHit.value - dt * 4, hit ? 1 : 0);
      const fade = gone >= 0 ? 1 - smooth(gone, gone + 0.35, t) : 1 - smooth(e.life - 0.6, e.life, t);
      u.uA.value = smooth(0, 0.25, t) * fade; u.uT.value = t; ring.material.uniforms.uA.value = 0.8 * u.uA.value;
      if (gone >= 0 && t > gone + 0.4) e.t = e.life;
    } });
  }
  circle(pos, o = {}) {
    if (!this._ok()) return null;
    const g = new THREE.Group(), r = o.r || 3.6, dur = o.dur || 8, low = lite();
    const disc = this._flat(this.geo.pharm_circle, CIRCLE_FS, { uMap: { value: this.circleTex }, uA: { value: 0 }, uT: { value: 0 } }, 2); disc.scale.setScalar(r); disc.position.y = 0.06;
    const ring = this._flat(this.geo.pharm_ring, RING_FS, { uC: { value: new THREE.Color(0x70ff9a) }, uA: { value: 0 } }, 3); ring.position.y = 0.08;
    const n = low ? 10 : 24, motes = [];
    for (let i = 0; i < n; i++) { const m = this._flat(this.geo.pharm_circle, MARK_FS, { uC: { value: new THREE.Color(i % 3 ? 0x80ffa8 : 0xe0ffd0) }, uA: { value: 0 }, uK: { value: 4 } }, 4); m.rotation.x = Math.PI / 2; m.scale.setScalar(0.07 + Math.random() * 0.05); m.userData = { a: Math.random() * 6.28, rr: Math.sqrt(Math.random()) * r * 0.92, ph: Math.random(), sp: 0.35 + Math.random() * 0.3 }; motes.push(m); g.add(m); }
    g.add(disc, ring); g.position.copy(P3(pos));
    let pulseT = -9;
    const e = this._add({ kind: 'circle', g, t: 0, life: dur + 0.6, update: (e, dt) => {
      const t = e.t, on = smooth(0, 0.35, t) * (1 - smooth(e.endAt ?? dur, (e.endAt ?? dur) + 0.5, t));
      disc.rotation.y = t * 0.25; disc.material.uniforms.uA.value = on; disc.material.uniforms.uT.value = t;
      const pk = t - pulseT; ring.visible = pk < 0.6; if (ring.visible) { ring.scale.setScalar(r * (0.4 + 0.6 * smooth(0, 0.5, pk))); ring.material.uniforms.uA.value = on * 1.2 * (1 - smooth(0.2, 0.6, pk)); }
      for (const m of motes) { const u = (m.userData.ph + t * m.userData.sp) % 1; m.position.set(Math.cos(m.userData.a) * m.userData.rr, 0.1 + u * 2.2, Math.sin(m.userData.a) * m.userData.rr); m.material.uniforms.uA.value = on * Math.sin(u * Math.PI); }
    } });
    e.pulse = () => { pulseT = e.t; }; e.end = () => { if (e.endAt == null) { e.endAt = e.t; e.life = e.t + 0.6; } };
    return e;
  }
  update(dt) {
    for (const e of this.live) { e.t += dt; try { e.update(e, dt); } catch (err) { console.warn('pharmfx', e.kind, err); e.t = e.life; } if (e.t >= e.life) this._free(e); }
    this.live = this.live.filter(e => !e.dead);
  }
  _free(e) { if (e.dead) return; e.dead = true; this.root.remove(e.g); e.g.traverse(o => { if (o.material) o.material.dispose(); }); }
  clear() { for (const e of this.live) this._free(e); this.live = []; }
}
