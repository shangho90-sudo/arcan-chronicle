// 약사 1차 스킬 이펙트 (2026-11-11, 같은 날 그래픽 개선: 얇은 발광 중심선 + 색 중간층 + 부드러운 잔광, 두꺼운 원판·안개 발광 제거).
// Assets from tools/blender/fx_pharm.py:
//   assets/fx/fx_pharm.glb.json  unit meshes (game axes, +Y up) + "cells" (atlas cell table, never hard-code UVs) + ribbonSpan
//     pharm_pestle / pharm_flask (glass) / pharm_liquid / pharm_cork / pharm_syringe   solid props (vertex colours)
//     pharm_ribbon   curved energy ribbon (arc radius 1, tail u 0 -> head u 1)          pharm_ring    thin annulus 0.86 .. 1
//     pharm_quad     unit billboard quad (every sprite cell)                           pharm_circle  flat disc radius 1
//     pharm_dome     half sphere radius 1 (보호막)                                      pharm_cracks  thin crack lines r 0.55 .. 1.75
//     pharm_piece_NN the shatter disc broken into thick paving pieces (node position = centroid)   pharm_shard_N loose chunks
//   assets/fx/fx_pharm.png         mask atlas: R = hot core (-> near white), G = body (-> skill colour), B = halo, A = coverage
//   assets/fx/fx_pharm_circle.png  회복진 문양 (thin lines, no fill)
// Kinds (js/skillrt.js FX.pharm(kind, a, o)); every effect peaks at the real damage / effect moment and never draws outside the
// real radius it is given:
//   cast(pc, {pal})                 ① thin ring at the feet, a few rising light rays + sparkles, small hand glow
//   spin(pc, {r, h, n, last, hits}) ② 유봉 휘두르기, once per strike: 2 - 3 ribbons of different radius / height / tilt whose head
//                                     follows the REAL pestle tip; ③ on the last strike a thin ground ring out to exactly r
//   pestle(pos, {fall, r})          ④ 천근쇄약: giant golden pestle (leaning so shaft + head read from the 44 deg camera) lands
//                                     after `fall` s: thin target ring, landing flash, ribbons winding up the shaft, ring out to r,
//                                     ⑤ shatter(): thick paving pieces lifted (centre higher), gold light through the gaps, crack
//                                     lines, loose chunks, dust
//   flask(pos, {elem, fall})        약병폭격: glass flask + tinted liquid + cork tumbling down, thin target ring, light streak
//   burst(pos, {elem, r})           ⑥ 약병 폭발: thin ring + bright core + short light shards + a few soft translucent puffs
//   syringe(pc, {dur})              ⑦ 아드레날린 주사: syringe to the left arm, orange flash (ring, ribbons, arrows), dim loop
//   shield(pc, {dur})               ⑧ 약 보호막: clear blue dome, thin flowing hex lines, fresnel rim, ripple where it is hit
//   circle(pos, {r, dur})           ⑨ 광역 회복진: thin green circle + slow ribbons + rising crosses; .pulse() on each heal tick
// Meshes come from small pools (one material each, reused); cleared on zone change. Low spec (phone / 그래픽 효과 끔): fewer
// particles, chunks and translucent layers, the core read (ring, ribbon, flash, dome, circle) stays.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ------------------------------------------------------------------------------------------------ tunables
export const PHARM = {
  intensity: 1.0,            // overall brightness of every additive layer (do NOT raise the global bloom instead)
  ringLift: 0.07,            // m above the ground for flat rings / circles (no z-fighting)
  pal: {                     // w = hot core, b = body, h = halo / deep tone; s1 / s2 = lit / shaded smoke
    gold:   { w: 0xfff4cc, b: 0xffb41e, h: 0xe06a00, s1: 0xd8c8a8, s2: 0x7a6a58 },
    orange: { w: 0xfff0d0, b: 0xff8a2a, h: 0xd04000 },
    fire:   { w: 0xfff2c0, b: 0xff7a1e, h: 0xc82800, s1: 0xffb070, s2: 0x5a2a18 },
    ice:    { w: 0xf0fbff, b: 0x6cd0ff, h: 0x2060d0, s1: 0xe0f6ff, s2: 0x5a90c0 },
    poison: { w: 0xf6e6ff, b: 0xb45cff, h: 0x5a18b0, s1: 0xd9a0ff, s2: 0x5a2090 },
    shield: { w: 0xe8fbff, b: 0x62c8ff, h: 0x2a70e0 },
    heal:   { w: 0xf2ffe0, b: 0x74f08a, h: 0x1fa050 },
  },
  spin: { life: 0.32, lastLife: 0.46, peak: 2.3, lastPeak: 3.0, lead: 0.5, ringTime: 0.30 },         // lead: rad the ribbon head runs ahead of the pestle tip
  pestle: { height: 4.6, lean: 0.30, drop: 5.0, stay: 0.55, glow: 0.12 },
  shatter: { k: 0.58, maxR: 2.6, lift: 0.4, thick: 0.42, tilt: 0.3, up: 0.14, hang: 0.24, fall: 0.26, rest: 1.15, life: 1.75, glow: 0.9 },   // R = min(r * k, maxR)
  burst: { ring: 0.26, core: 0.22, puffA: 0.62, puffLife: 1.2, coreA: 1.1, flareA: 1.2, ringA: 1.7 },
  buff: { flash: 1.4, loop: 0.34 },
  shield: { rx: 1.25, ry: 1.7, fill: 0.07, line: 0.34, flow: 0.6, rim: 0.6, hexN: 7.0 },
  circle: { tex: 1.0, ribbon: 0.8, pulse: 1.2 },
};
export const ELEM_COL = { fire: PHARM.pal.fire.b, ice: PHARM.pal.ice.b, poison: PHARM.pal.poison.b };

const P3 = (p) => new THREE.Vector3(p.x, p.y || 0, -p.z);
const lite = () => { const G = window.G; return !!(G && ((G.input && G.input.mobile) || (G.settings && G.settings.graphicsFx === false))); };
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const rnd = (a, b) => a + Math.random() * (b - a);
const UP = new THREE.Vector3(0, 1, 0);

async function loadWrapped(url, owner) {
  const j = await (await fetch(url)).json(); owner.cells = j.cells || {}; owner.span = (j.ribbonSpan || 210) * Math.PI / 180;
  const raw = atob(j.b64), u8 = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
  return new Promise((res, rej) => new GLTFLoader().parse(u8.buffer, '', res, rej));
}

// ------------------------------------------------------------------------------------------------ shaders
// solid props / stone pieces: vertex colour, fixed key light + rim, optional liquid tint, gold light from below (uUnder), fade
const SOLID_VS = `
attribute vec3 color; varying vec3 vC, vN, vV, vWN;
void main(){ vC = color; vN = normalize(normalMatrix * normal); vWN = normalize(mat3(modelMatrix) * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv; }`;
const SOLID_FS = `
uniform vec3 uTint, uRim, uEm; uniform float uA, uMode, uGlow, uSpec, uUnder;
varying vec3 vC, vN, vV, vWN;
void main(){
  vec3 n = normalize(vN), L = normalize(vec3(-.4, .8, .5));
  float d = max(0., dot(n, L)), rim = pow(1. - max(0., dot(n, vV)), 2.5);
  vec3 base = vC; float a = uA;
  if (uMode > 1.5) { base = uTint * (.75 + .25 * vC.r); }                        // liquid: the element colour
  else if (uMode > .5) { base = vec3(.80, .90, 1.) * .5; a *= .30 + .65 * rim; }    // glass shell: clear, bright at the silhouette
  vec3 c = base * (.40 + .78 * d) + uRim * rim * .8;
  vec3 h = reflect(-L, n); c += vec3(1., .95, .8) * pow(max(0., dot(h, vV)), 28.) * uSpec;
  c += uEm * uGlow + uEm * uUnder * (.25 + .75 * clamp(-vWN.y + .35, 0., 1.));     // gold light from the cracks below
  if (uMode > 1.5) c += uTint * .35;
  gl_FragColor = vec4(c, a);
}`;
// Tripo models (tools/blender/fx_pharm_tripo.py): base-colour texture, same fixed light; uTintK > 0 recolours the liquid of a flask
// (the saturated lower part, below uTintY in model space) to the element colour
const TEX_VS = `
varying vec3 vN, vV, vWN, vP; varying vec2 vUv;
void main(){ vUv = uv; vP = position; vN = normalize(normalMatrix * normal); vWN = normalize(mat3(modelMatrix) * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv; }`;
const TEX_FS = `
uniform sampler2D uMap; uniform vec3 uTint, uRim, uEm; uniform float uA, uGlow, uSpec, uUnder, uTintK, uTintY, uGain;
varying vec3 vN, vV, vWN, vP; varying vec2 vUv;
void main(){
  vec3 base = texture2D(uMap, vUv).rgb * uGain;
  float mx = max(base.r, max(base.g, base.b)), mn = min(base.r, min(base.g, base.b)), lum = dot(base, vec3(.3, .6, .1));
  float liq = uTintK * smoothstep(.12, .3, (mx - mn) / max(mx, .001)) * (1. - smoothstep(uTintY - .02, uTintY + .02, vP.y));
  base = mix(base, uTint * (.35 + 1.1 * lum), liq);
  vec3 n = normalize(vN), L = normalize(vec3(-.4, .8, .5));
  float d = max(0., dot(n, L)), rim = pow(1. - max(0., dot(n, vV)), 2.5);
  vec3 c = base * (.46 + .74 * d) + uRim * rim * .5;
  vec3 h = reflect(-L, n); c += vec3(1., .95, .8) * pow(max(0., dot(h, vV)), 28.) * uSpec;
  c += uEm * uGlow + uEm * uUnder * (.25 + .75 * clamp(-vWN.y + .35, 0., 1.)) + uTint * liq * .25;
  gl_FragColor = vec4(c, uA);
}`;
const FLAT_VS = `varying vec2 vUv; varying vec3 vP, vN, vV; void main(){ vUv = uv; vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
// atlas sprite / ribbon (additive): uCut hides the tail side of a ribbon (u < uCut), uSoft = width of that fade
const SPR_FS = `uniform sampler2D uMap; uniform vec4 uCell; uniform vec3 uW, uB, uH; uniform float uA, uCut, uSoft; varying vec2 vUv;
void main(){ vec4 t = texture2D(uMap, vec2(mix(uCell.x, uCell.y, vUv.x), mix(uCell.z, uCell.w, vUv.y)));
  float k = uA * smoothstep(uCut, uCut + uSoft, vUv.x);
  gl_FragColor = vec4((uW * t.r * t.r * .8 + uB * t.g + uH * t.b) * k, 1.); }`;
// soft smoke (normal blending): lit top -> s1, shade -> s2
const SMOKE_FS = `uniform sampler2D uMap; uniform vec4 uCell; uniform vec3 uW, uB; uniform float uA; varying vec2 vUv;
void main(){ vec4 t = texture2D(uMap, vec2(mix(uCell.x, uCell.y, vUv.x), mix(uCell.z, uCell.w, vUv.y)));
  gl_FragColor = vec4(mix(uB, uW, t.r), t.a * uA); }`;
// thin ring on pharm_ring (u = 0 inner .. 1 outer): sharp bright front line, short soft wake inside, clear centre
const RING_FS = `uniform vec3 uW, uB; uniform float uA, uWake; varying vec2 vUv;
void main(){ float u = vUv.x; float line = exp(-pow((u - .84) / .075, 2.)); float wake = smoothstep(0., .8, u) * (1. - smoothstep(.8, .97, u)) * uWake;
  gl_FragColor = vec4((uW * line * line * .3 + uB * (line + wake)) * uA, 1.); }`;
// under-glow disc (gold light under the lifted pieces): hot centre, falls off to nothing at the rim
const UNDER_FS = `uniform vec3 uW, uB; uniform float uA; varying vec3 vP;
void main(){ float r = length(vP.xz); float k = 1. - smoothstep(.72, 1., r); float c = 1. - smoothstep(0., .8, r); gl_FragColor = vec4((uB * k + uW * c * .5) * uA, 1.); }`;
const CIRCLE_FS = `uniform sampler2D uMap; uniform vec3 uB; uniform float uA; varying vec2 vUv;
void main(){ vec4 t = texture2D(uMap, vUv); gl_FragColor = vec4(t.rgb * t.a * uA, 1.); }`;
// 보호막: clear dome, thin hex lines (azimuthal map from the top), a few cells light up and drift, fresnel rim, hit ripple
const DOME_FS = `uniform vec3 uW, uB, uHitP; uniform float uA, uT, uHit, uHitT, uFill, uLine, uFlow, uRim, uHexN; varying vec3 vP, vN, vV;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec3 d = normalize(vP); float th = acos(clamp(d.y, -1., 1.)), ph = atan(d.z, d.x);
  vec2 q = vec2(cos(ph), sin(ph)) * th * uHexN; vec2 s = vec2(1., 1.7320508);
  vec2 a = mod(q, s) - s * .5, b = mod(q - s * .5, s) - s * .5; vec2 g = dot(a, a) < dot(b, b) ? a : b;
  float hd = max(abs(g.x), dot(abs(g), vec2(.5, .8660254)));
  float line = smoothstep(.435, .485, hd); float id = hash(floor((q - g) * 2. + .5));
  float lit = smoothstep(.72, 1., sin(id * 6.283 + uT * 1.1) * .5 + .5);                       // some cells glow, slowly changing
  float sweep = exp(-pow((fract(d.y * .9 - uT * .22) - .5) / .12, 2.));                      // a soft band drifting up the dome
  float fres = pow(1. - abs(dot(normalize(vN), normalize(vV))), 2.4);
  float base = smoothstep(0., .10, d.y) ;                                                      // fade right at the ground line
  float ang = acos(clamp(dot(d, normalize(uHitP)), -1., 1.));
  float wave = exp(-pow((ang - uHitT * 1.9) / .11, 2.)) * uHit;
  float k = uFill + line * (uLine + uFlow * (lit * .8 + sweep * .5)) + fres * uRim + (1. - base) * .25 + wave * 1.1;
  vec3 c = mix(uB, uW, clamp(line * lit * .45 + wave, 0., 1.));
  gl_FragColor = vec4(c * k * uA, 1.); }`;
const ADD = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide };

export class PharmFx {
  constructor(root) {
    this.root = root; this.live = []; this.ready = false; this.geo = {}; this.pieces = []; this.shards = []; this.loading = null; this.cells = {}; this.span = 3.6;
    this.tri = {}; this.triShards = []; this.pool = {}; this.camQ = new THREE.Quaternion(); this.yawQ = new THREE.Quaternion(); this.toCam = new THREE.Vector3(0, 0.7, 0.7); this.camR = new THREE.Vector3(1, 0, 0);
  }
  load() {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const L = new THREE.TextureLoader();
      const [g, tex, circ] = await Promise.all([loadWrapped('assets/fx/fx_pharm.glb.json', this), L.loadAsync('assets/fx/fx_pharm.png'), L.loadAsync('assets/fx/fx_pharm_circle.png')]);
      g.scene.traverse(o => { if (!o.isMesh) return; this.geo[o.name] = o.geometry;
        if (o.name.startsWith('pharm_piece_')) this.pieces.push({ geo: o.geometry, x: o.position.x, z: o.position.z, rho: Math.hypot(o.position.x, o.position.z) });
        if (o.name.startsWith('pharm_shard_')) this.shards.push(o.geometry); });
      tex.flipY = false; tex.colorSpace = THREE.NoColorSpace; tex.generateMipmaps = true; tex.anisotropy = 2; tex.needsUpdate = true; this.tex = tex;
      circ.colorSpace = THREE.SRGBColorSpace; circ.anisotropy = 4; this.circleTex = circ;
      try {   // optional Tripo models (황금 유봉·약병·지면 파편); without the file every prop falls back to the Blender procedural mesh
        const tg = await loadWrapped('assets/fx/fx_pharm_tripo.glb.json', {});
        tg.scene.traverse(o => { if (!o.isMesh || !o.material || !o.material.map) return; this.tri[o.name] = { geo: o.geometry, map: o.material.map }; if (o.name.startsWith('tripo_shard_')) this.triShards.push(o.name); });
      } catch (err) { console.warn('pharmfx: no Tripo models', err && err.message); }
      this.ready = true;
    })().catch(e => console.warn('pharmfx load', e));
    return this.loading;
  }
  _ok() { if (!this.ready) { this.load(); return false; } return true; }
  cell(n) { const c = this.cells[n] || [0, 1, 0, 1]; return new THREE.Vector4(c[0], c[1], c[2], c[3]); }

  // ------------------------------------------------------------------ pooled meshes (kind = material type)
  _mat(kind) {
    const U = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v }]));
    const C = () => new THREE.Color(1, 1, 1);
    switch (kind) {
      case 'spr': return new THREE.ShaderMaterial({ uniforms: U({ uMap: this.tex, uCell: new THREE.Vector4(0, 1, 0, 1), uW: C(), uB: C(), uH: C(), uA: 0, uCut: -1, uSoft: 0.3 }), vertexShader: FLAT_VS, fragmentShader: SPR_FS, ...ADD });
      case 'smoke': return new THREE.ShaderMaterial({ uniforms: U({ uMap: this.tex, uCell: new THREE.Vector4(0, 1, 0, 1), uW: C(), uB: C(), uA: 0 }), vertexShader: FLAT_VS, fragmentShader: SMOKE_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
      case 'ring': return new THREE.ShaderMaterial({ uniforms: U({ uW: C(), uB: C(), uA: 0, uWake: 0.35 }), vertexShader: FLAT_VS, fragmentShader: RING_FS, ...ADD });
      case 'under': return new THREE.ShaderMaterial({ uniforms: U({ uW: C(), uB: C(), uA: 0 }), vertexShader: FLAT_VS, fragmentShader: UNDER_FS, ...ADD, depthTest: true });
      case 'circle': return new THREE.ShaderMaterial({ uniforms: U({ uMap: this.circleTex, uB: C(), uA: 0 }), vertexShader: FLAT_VS, fragmentShader: CIRCLE_FS, ...ADD });
      case 'dome': return new THREE.ShaderMaterial({ uniforms: U({ uW: C(), uB: C(), uHitP: new THREE.Vector3(0, 0.5, 1), uA: 0, uT: 0, uHit: 0, uHitT: 0, uFill: 0, uLine: 0, uFlow: 0, uRim: 0, uHexN: 6 }),
        vertexShader: FLAT_VS, fragmentShader: DOME_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide });
      case 'tex': return new THREE.ShaderMaterial({ uniforms: U({ uMap: null, uTint: C(), uRim: new THREE.Color(0xfff0c0), uEm: new THREE.Color(0), uA: 1, uGlow: 0, uSpec: 0.5, uUnder: 0, uTintK: 0, uTintY: 0.2, uGain: 1 }),
        vertexShader: TEX_VS, fragmentShader: TEX_FS, transparent: true, depthWrite: true });
      default: return new THREE.ShaderMaterial({ uniforms: U({ uTint: C(), uRim: new THREE.Color(0xfff0c0), uEm: new THREE.Color(0), uA: 1, uMode: 0, uGlow: 0, uSpec: 0.8, uUnder: 0 }),
        vertexShader: SOLID_VS, fragmentShader: SOLID_FS, transparent: true, depthWrite: true });
    }
  }
  /** mesh from the pool of `kind`, attached to effect e (returned to the pool when e ends) */
  _m(e, kind, geo, order = 4) {
    const p = this.pool[kind] || (this.pool[kind] = []); let m = p.pop();
    if (!m) { m = new THREE.Mesh(geo, this._mat(kind)); m.frustumCulled = false; m.userData.kind = kind; }
    m.geometry = geo; m.position.set(0, 0, 0); m.quaternion.identity(); m.scale.set(1, 1, 1); m.visible = true; m.renderOrder = order;
    e.items.push(m); e.g.add(m); return m;
  }
  _pal(m, pal, k = 1) { const u = m.material.uniforms; u.uW.value.setHex(pal.w); u.uB.value.setHex(pal.b); if (u.uH) u.uH.value.setHex(pal.h); return m; }
  spr(e, cellName, pal, order = 5) { const m = this._m(e, 'spr', this.geo.pharm_quad, order); m.material.uniforms.uCell.value.copy(this.cell(cellName)); m.material.uniforms.uCut.value = -1; m.material.uniforms.uA.value = 0; return this._pal(m, pal); }
  rib(e, pal, order = 5) { const m = this._m(e, 'spr', this.geo.pharm_ribbon, order); const u = m.material.uniforms; u.uCell.value.copy(this.cell('ribbon')); u.uCut.value = 0; u.uSoft.value = 0.35; u.uA.value = 0; return this._pal(m, pal); }
  ring(e, pal, wake = 0.35, order = 3) { const m = this._m(e, 'ring', this.geo.pharm_ring, order); m.material.uniforms.uWake.value = wake; m.material.uniforms.uA.value = 0; m.position.y = PHARM.ringLift; return this._pal(m, pal); }
  smoke(e, cellName, pal, order = 4) { const m = this._m(e, 'smoke', this.geo.pharm_quad, order); const u = m.material.uniforms; u.uCell.value.copy(this.cell(cellName)); u.uW.value.setHex(pal.s1); u.uB.value.setHex(pal.s2); u.uA.value = 0; return m; }
  solid(e, geo, o = {}) { const m = this._m(e, 'solid', geo, 1); const u = m.material.uniforms; u.uTint.value.setHex(o.tint ?? 0xffffff); u.uRim.value.setHex(o.rim ?? 0xfff0c0); u.uEm.value.setHex(o.em ?? 0);
    u.uA.value = 1; u.uMode.value = o.mode || 0; u.uGlow.value = o.glow || 0; u.uSpec.value = o.spec ?? 0.8; u.uUnder.value = 0; m.material.depthWrite = (o.mode || 0) !== 1; return m; }
  /** textured Tripo model `name` (fx_pharm_tripo), or null when that file / model is missing (the procedural mesh is used instead) */
  model(e, name, o = {}) { const t = this.tri[name]; if (!t) return null; const m = this._m(e, 'tex', t.geo, 1), u = m.material.uniforms; u.uMap.value = t.map; u.uTint.value.setHex(o.tint ?? 0xffffff); u.uRim.value.setHex(o.rim ?? 0xfff0c0);
    u.uEm.value.setHex(o.em ?? 0); u.uA.value = 1; u.uGlow.value = o.glow || 0; u.uSpec.value = o.spec ?? 0.5; u.uUnder.value = 0; u.uTintK.value = o.tintK || 0; u.uTintY.value = o.tintY ?? 0.2; u.uGain.value = o.gain ?? 1; return m; }
  _fx(kind, life, update) { const e = { kind, g: new THREE.Group(), items: [], t: 0, life, update }; this.root.add(e.g); this.live.push(e); return e; }
  /** quad whose +Y runs along dir (three coords) and whose face turns to the camera as far as it can (light shards / rays) */
  _aim(m, dir) { const y = _a.copy(dir).normalize(), z = _b.copy(this.toCam).addScaledVector(y, -this.toCam.dot(y)); if (z.lengthSq() < 1e-6) z.set(0, 0, 1); z.normalize();
    const x = _c.crossVectors(y, z); _mx.makeBasis(x, y, z); m.quaternion.setFromRotationMatrix(_mx); }

  // ------------------------------------------------------------------ ① cast
  cast(pc, o = {}) {
    if (!this._ok() || !pc) return null;
    const pal = PHARM.pal[o.pal || 'gold'], low = lite(), I = PHARM.intensity;
    const e = this._fx('cast', 0.6, (e) => {
      const t = e.t; e.g.position.copy(P3(pc.pos));
      r1.scale.setScalar(0.45 + 0.6 * easeOut(t / 0.32)); r1.material.uniforms.uA.value = I * 1.2 * smooth(0, 0.05, t) * (1 - smooth(0.14, 0.42, t));
      r2.scale.setScalar(0.25 + 0.45 * easeOut((t - 0.06) / 0.3)); r2.material.uniforms.uA.value = I * 0.8 * smooth(0.06, 0.1, t) * (1 - smooth(0.2, 0.45, t));
      for (const m of rays) { const d = m.userData, u = clamp01((t - d.t0) / d.life); m.visible = u > 0 && u < 1; if (!m.visible) continue;
        m.scale.set(d.w, d.h * easeOut(u * 1.6), 1); m.position.set(d.x, m.scale.y * 0.5, d.z); m.quaternion.copy(this.yawQ); m.material.uniforms.uA.value = I * 0.9 * Math.sin(Math.PI * Math.pow(u, 0.6)); }
      for (const m of stars) { const d = m.userData, u = clamp01((t - d.t0) / d.life); m.visible = u > 0 && u < 1; if (!m.visible) continue;
        m.position.set(d.x, d.y0 + u * d.rise, d.z); m.scale.setScalar(d.s * (0.6 + 0.6 * Math.sin(u * Math.PI))); m.quaternion.copy(this.camQ); m.material.uniforms.uA.value = I * 1.3 * Math.sin(u * Math.PI); }
      const f = pc.facing || { x: 0, z: 1 }; hand.position.set(f.x * 0.35, 1.05, -f.z * 0.35); hand.quaternion.copy(this.camQ); hand.scale.setScalar(0.5 + 0.5 * easeOut(t / 0.2)); hand.material.uniforms.uA.value = I * 0.9 * (1 - smooth(0.1, 0.4, t));
    });
    const r1 = this.ring(e, pal, 0.15), r2 = this.ring(e, pal, 0.1), rays = [], stars = [];
    for (let i = 0, n = low ? 3 : 6; i < n; i++) { const m = this.spr(e, 'streak', pal), a = Math.random() * 6.283, rr = rnd(0.3, 0.85); m.userData = { x: Math.cos(a) * rr, z: Math.sin(a) * rr, w: rnd(0.12, 0.24), h: rnd(1.3, 2.5), t0: i * 0.035, life: rnd(0.3, 0.42) }; rays.push(m); }
    for (let i = 0, n = low ? 3 : 6; i < n; i++) { const m = this.spr(e, 'star', pal, 6), a = Math.random() * 6.283, rr = rnd(0.3, 1.0); m.userData = { x: Math.cos(a) * rr, z: Math.sin(a) * rr, y0: rnd(0.3, 1.0), rise: rnd(0.4, 0.9), s: rnd(0.2, 0.38), t0: rnd(0, 0.2), life: rnd(0.25, 0.38) }; stars.push(m); }
    const hand = this.spr(e, 'glow', pal, 6);
    return e;
  }

  // ------------------------------------------------------------------ ② ③ spin
  spin(pc, o = {}) {
    if (!this._ok() || !pc) return null;
    const S = PHARM.spin, pal = PHARM.pal.gold, low = lite(), I = PHARM.intensity, r = o.r || 2.8, last = !!o.last, h = o.h || 0;
    const life = last ? S.lastLife : S.life, peak = last ? S.lastPeak : S.peak;
    // the head of the outer ribbon sits on the real pestle tip (three coords); the turning sense comes from the tip's motion
    const tipAng = () => { try { const b = pc.body && pc.body.bladePoints && pc.body.bladePoints(); if (b) { const c = P3(pc.pos); return Math.atan2(b[1].z - c.z, b[1].x - c.x); } } catch (err) { /* no blade */ } return null; };
    let a0 = tipAng(), sense = this._spinSense || 1, base = a0 ?? (h * 2.4), prev = a0;
    const defs = [{ rr: 0.98, y: 0.80, tx: 0.07, tz: -0.05, off: 0, w: 1 }, { rr: 0.66, y: 1.10, tx: -0.13, tz: 0.09, off: 2.3, w: 0.8 }, { rr: 0.84, y: 0.62, tx: 0.03, tz: 0.10, off: 0.9, w: 0.55 }];
    if (last || (!low && h % 2 === 0)) defs.push({ rr: 0.42, y: 0.52, tx: 0.16, tz: 0.12, off: 4.3, w: 0.65 });
    const e = this._fx('spin', life + 0.05, (e, dt) => {
      const t = e.t; e.g.position.copy(P3(pc.pos));
      const a = tipAng(); if (a != null && prev != null) { let d = a - prev; d = Math.atan2(Math.sin(d), Math.cos(d)); if (Math.abs(d) > 0.02) { sense = d > 0 ? 1 : -1; this._spinSense = sense; } }
      if (a != null) { base = a; prev = a; } else base += sense * 18 * dt;
      const fade = 1 - smooth(0.06, life, t), cut = 0.72 * smooth(0, life, t);
      for (const m of ribs) { const d = m.userData;
        // mesh arc: tail at angle 0, head at +span towards +z (three). Head at (base + lead): rotation about Y is -angle in three.
        m.scale.set(r * d.rr, r * d.rr, sense * r * d.rr);                       // mirrored when the pestle turns the other way
        const headAt = base + sense * (S.lead + d.off * (0.25 + 0.75 * smooth(0, life, t)));
        m.rotation.set(d.tx, -(headAt - sense * this.span), d.tz, 'YXZ'); m.position.y = d.y;
        const u = m.material.uniforms; u.uA.value = I * peak * d.w * fade * smooth(0, 0.03, t); u.uCut.value = cut; }
      if (gr) { const k = easeOut(t / S.ringTime); gr.scale.setScalar(r * (0.35 + 0.65 * k)); gr.material.uniforms.uA.value = I * 1.5 * smooth(0, 0.04, t) * (1 - smooth(0.16, 0.42, t)); }
      for (const m of stars) { const d = m.userData, u = clamp01((t - d.t0) / d.life); m.visible = u > 0 && u < 1; if (!m.visible) continue;
        const an = d.a + sense * u * d.w; m.position.set(Math.cos(an) * d.rr, d.y + u * 0.3, Math.sin(an) * d.rr); m.quaternion.copy(this.camQ); m.scale.setScalar(d.s * (0.5 + Math.sin(u * Math.PI)));
        m.material.uniforms.uA.value = I * 1.4 * Math.sin(u * Math.PI); }
      for (const m of pops) { const d = m.userData, u = clamp01(t / 0.2); m.quaternion.copy(this.camQ); m.scale.setScalar(d.s * (0.4 + 0.8 * easeOut(u))); m.material.uniforms.uA.value = I * 1.5 * (1 - smooth(0.02, 0.2, t)); m.visible = t < 0.2; }
    });
    const ribs = defs.map(d => { const m = this.rib(e, pal); m.userData = d; return m; });
    const gr = last ? this.ring(e, pal, 0.3) : null, stars = [], pops = [];
    for (let i = 0, n = (last ? 8 : 3) * (low ? 0.5 : 1); i < n; i++) { const m = this.spr(e, 'star', pal, 6); m.userData = { a: Math.random() * 6.283, rr: r * rnd(0.45, 0.97), y: rnd(0.4, 1.3), w: rnd(0.5, 1.2), s: rnd(0.18, last ? 0.42 : 0.3), t0: rnd(0, 0.1), life: rnd(0.2, 0.34) }; stars.push(m); }
    // small flash on every enemy this strike touched (the hit itself, not a disc over the whole area)
    const c0 = P3(pc.pos);
    for (const hp of (o.hits || []).slice(0, low ? 3 : 8)) { const m = this.spr(e, last ? 'flare' : 'star', pal, 7), p = P3(hp); m.position.set(p.x - c0.x, 0.75, p.z - c0.z); m.userData = { s: last ? 1.5 : 0.9 }; pops.push(m); }
    return e;
  }

  // ------------------------------------------------------------------ ④ pestle (+ ⑤ shatter at the landing)
  pestle(pos, o = {}) {
    if (!this._ok()) return null;
    const Pc = PHARM.pestle, pal = PHARM.pal.gold, I = PHARM.intensity, p = P3(pos), fall = o.fall || 0.42, r = o.r || 4, low = lite();
    const yaw = Math.random() * 6.283, top = new THREE.Vector3(), q0 = new THREE.Quaternion(), qy = new THREE.Quaternion(); let hit = false;
    const e = this._fx('pestle', fall + Pc.stay + 0.7, (e) => {
      const t = e.t, u = t - fall;
      // lean towards the screen's right so the shaft and the round head both read from above
      const lean = u < 0 ? Pc.lean + 0.55 * (1 - smooth(0, 1, t / fall)) : Pc.lean * (1 - 0.25 * smooth(0, 0.2, u));
      top.copy(UP).multiplyScalar(Math.cos(lean)).addScaledVector(this.camR, Math.sin(lean)).normalize(); q0.setFromUnitVectors(UP, top); qy.setFromAxisAngle(UP, yaw);
      pe.quaternion.copy(q0).multiply(qy);
      if (u < 0) {
        const k = t / fall, f = k * k;
        pe.position.set(0, Pc.drop * (1 - f), 0); pe.material.uniforms.uA.value = smooth(0, 0.12, k); pe.material.uniforms.uGlow.value = Pc.glow + 0.25 * k;
        mark.scale.setScalar(r); mark.material.uniforms.uA.value = I * (0.3 + 0.5 * k);
        aim.scale.setScalar(r * (1 - 0.72 * k)); aim.material.uniforms.uA.value = I * 0.9 * k;                  // converging ring = where and when it lands
        trail.visible = k > 0.25; trail.quaternion.copy(this.yawQ); trail.scale.set(1.1, 4.5 * k, 1); trail.position.set(0, pe.position.y + Pc.height * 0.6 + trail.scale.y * 0.4, 0); trail.material.uniforms.uA.value = I * 0.5 * k;
        flash.visible = glow.visible = wave.visible = false; for (const m of wraps) m.visible = false;
      } else {
        if (!hit) { hit = true; this.shatter(pos, { r }); }
        pe.position.set(0, -0.3 * Math.min(1, u * 14) - 0.9 * smooth(Pc.stay, Pc.stay + 0.6, u), 0);
        pe.material.uniforms.uA.value = 1 - smooth(Pc.stay + 0.1, Pc.stay + 0.65, u); pe.material.uniforms.uGlow.value = Pc.glow + 0.5 * (1 - smooth(0, 0.3, u));
        mark.material.uniforms.uA.value = I * 0.8 * (1 - smooth(0, 0.2, u)); aim.visible = trail.visible = false;
        flash.visible = u < 0.2; flash.quaternion.copy(this.camQ); flash.position.y = 0.45; flash.scale.setScalar(2.2 + 2.6 * easeOut(u / 0.14)); flash.material.uniforms.uA.value = I * 1.7 * (1 - smooth(0.02, 0.2, u));
        glow.visible = u < 0.32; glow.quaternion.copy(this.camQ); glow.position.y = 0.5; glow.scale.setScalar(1.6 + 1.4 * easeOut(u / 0.2)); glow.material.uniforms.uA.value = I * 1.0 * (1 - smooth(0.04, 0.32, u));
        wave.visible = u < 0.5; wave.scale.setScalar(r * (0.3 + 0.7 * easeOut(u / 0.34))); wave.material.uniforms.uA.value = I * 1.6 * (1 - smooth(0.14, 0.48, u));
        for (const m of wraps) { const d = m.userData, k = clamp01(u / 0.5); m.visible = k < 1; m.scale.set(d.rr, d.rr, d.rr); m.position.y = d.y0 + k * d.rise; m.rotation.set(d.tx, -(d.a + u * d.w), 0, 'YXZ');
          const U = m.material.uniforms; U.uA.value = I * 1.3 * Math.sin(Math.PI * Math.pow(k, 0.7)); U.uCut.value = 0.5 * k; }
      }
    });
    e.g.position.copy(p);
    const pe = this.model(e, 'tripo_pestle', { rim: 0xffe9a0, em: 0xffc040, glow: Pc.glow, spec: 0.9, gain: 1.15 }) || this.solid(e, this.geo.pharm_pestle, { rim: 0xffe9a0, em: 0xffc040, glow: Pc.glow, spec: 1.3 }); pe.scale.setScalar(Pc.height);
    const mark = this.ring(e, pal, 0.0, 2), aim = this.ring(e, pal, 0.15, 3), wave = this.ring(e, pal, 0.4, 4); wave.position.y = PHARM.ringLift + 0.02;
    const trail = this.spr(e, 'streak', pal, 5), flash = this.spr(e, 'flare', pal, 8), glow = this.spr(e, 'glow', pal, 7), wraps = [];
    for (let i = 0, n = low ? 1 : 2; i < n; i++) { const m = this.rib(e, pal, 6); m.userData = { rr: 1.15 - i * 0.3, y0: 0.3 + i * 0.5, rise: 1.9, a: i * 2.6, w: 13 + i * 3, tx: i ? -0.2 : 0.16 }; wraps.push(m); }
    return e;
  }
  /** ⑤ 황금 지면 파쇄: pos = centre (game coords), o.r = the skill's real radius (visual R = min(r * k, maxR), crack lines end inside r) */
  shatter(pos, o = {}) {
    if (!this._ok()) return null;
    const S = PHARM.shatter, pal = PHARM.pal.gold, I = PHARM.intensity, low = lite(), R = Math.min((o.r || 4) * S.k, S.maxR), sy = R * S.thick;
    const e = this._fx('shatter', S.life, (e, dt) => {
      const t = e.t, out = smooth(S.rest, S.life, t);
      for (const m of pcs) { const d = m.userData, u = t - d.t0; let k = 0;                         // k = lift 0..1 (up fast, hang, fall), then rest tilted
        if (u > 0) k = u < S.up ? easeOut(u / S.up) : u < S.up + d.hang ? 1 : 1 - smooth(0, 1, (u - S.up - d.hang) / S.fall) * (1 - d.rest);
        const y = d.h * k - out * (0.22 * sy + 0.05); m.position.set(d.x * (1 + d.push * k), 0.05 + y, d.z * (1 + d.push * k));
        m.quaternion.setFromAxisAngle(d.ax, d.ang * k);
        const U = m.material.uniforms; U.uA.value = 1 - smooth(0.2, 1, out); U.uUnder.value = S.glow * 0.5 * (1 - smooth(0.05, 0.9, t)); }
      under.material.uniforms.uA.value = I * S.glow * (0.25 + 0.75 * (1 - smooth(0, 0.45, t))) * (1 - smooth(0.7, S.rest + 0.2, t)) * smooth(0, 0.03, t);
      lines.material.uniforms.uA.value = I * 1.4 * smooth(0, 0.05, t) * (1 - smooth(0.25, S.rest, t)); lines.material.uniforms.uCut.value = -1 + 0 * t;
      const grow = easeOut(t / 0.12); lines.scale.set(R * grow, 1, R * grow);
      for (const m of loose) { const d = m.userData, u = t - d.t0; m.visible = u > 0 && u < d.life; if (!m.visible) continue;
        const y = d.vy * u - 7.5 * u * u; m.position.set(d.x + d.vx * u, Math.max(0.06, 0.2 + y), d.z + d.vz * u);
        m.quaternion.setFromAxisAngle(d.ax, d.w * Math.min(u, d.land)); m.material.uniforms.uA.value = 1 - smooth(d.life - 0.3, d.life, u); m.material.uniforms.uUnder.value = 0.5 * (1 - smooth(0, 0.4, u)); }
      for (const m of dust) { const d = m.userData, u = clamp01((t - d.t0) / d.life); m.visible = u > 0 && u < 1; if (!m.visible) continue;
        m.quaternion.copy(this.camQ); m.position.set(d.x * (1 + 0.5 * u), 0.3 + u * d.rise, d.z * (1 + 0.5 * u)); m.scale.setScalar(d.s * (0.5 + 0.9 * easeOut(u))); m.material.uniforms.uA.value = 0.34 * Math.sin(Math.PI * Math.pow(u, 0.55)); }
      for (const m of stars) { const d = m.userData, u = clamp01((t - d.t0) / d.life); m.visible = u > 0 && u < 1; if (!m.visible) continue;
        m.quaternion.copy(this.camQ); m.position.set(d.x, d.y + u * d.rise, d.z); m.scale.setScalar(d.s * (0.5 + Math.sin(u * Math.PI))); m.material.uniforms.uA.value = I * 1.3 * Math.sin(u * Math.PI); }
    });
    e.g.position.copy(P3(pos));
    const pcs = this.pieces.map(pc => { const m = this.solid(e, pc.geo, { em: 0xffb030, rim: 0x2a2018, spec: 0.05 }); m.scale.set(R, sy, R);
      const cen = 1 - pc.rho;                                                              // 1 at the centre .. ~0.15 at the rim
      m.userData = { x: pc.x * R, z: pc.z * R, h: S.lift * (R / 2.4) * (0.12 + 0.88 * Math.pow(cen, 1.3)) * rnd(0.8, 1.15), t0: pc.rho * 0.09 + rnd(0, 0.03), hang: S.hang * rnd(0.7, 1.3), rest: rnd(0.10, 0.28),
        push: 0.05 + 0.10 * pc.rho, ang: S.tilt * rnd(0.4, 1.0) * (0.5 + 0.7 * cen) * (Math.random() < 0.5 ? -1 : 1), ax: new THREE.Vector3(rnd(-1, 1), rnd(-0.15, 0.15), rnd(-1, 1)).normalize() }; return m; });
    const under = this._m(e, 'under', this.geo.pharm_circle, 2); this._pal(under, pal); under.scale.setScalar(R * 1.02); under.position.y = 0.04;
    const lines = this.spr(e, 'crack', pal, 3); lines.geometry = this.geo.pharm_cracks; lines.position.y = PHARM.ringLift;
    const loose = [], dust = [], stars = [];
    for (let i = 0, n = low ? 4 : 9; i < n && this.shards.length; i++) { const m = (this.triShards.length && this.model(e, this.triShards[i % this.triShards.length], { em: 0xffb030, rim: 0x2a2018, spec: 0.05, gain: 0.9 })) || this.solid(e, this.shards[i % this.shards.length], { em: 0xffb030, rim: 0x2a2018, spec: 0.05 }), a = Math.random() * 6.283, rr = R * rnd(0.15, 0.7), sp = rnd(1.2, 3.2), s = rnd(0.10, 0.22) * (R / 2.4);
      const vy = rnd(3.4, 5.6); m.scale.setScalar(s); m.userData = { x: Math.cos(a) * rr, z: Math.sin(a) * rr, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy, land: vy / 7.5, w: rnd(6, 14), t0: rnd(0, 0.06), life: vy / 7.5 + rnd(0.35, 0.6), ax: new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize() }; loose.push(m); }
    for (let i = 0, n = low ? 0 : 4; i < n; i++) { const m = this.smoke(e, 'dust', pal), a = Math.random() * 6.283, rr = R * rnd(0.5, 0.9); m.userData = { x: Math.cos(a) * rr, z: Math.sin(a) * rr, s: rnd(1.0, 1.6), rise: rnd(0.3, 0.7), t0: rnd(0.02, 0.12), life: rnd(0.7, 1.0) }; dust.push(m); }
    for (let i = 0, n = low ? 3 : 8; i < n; i++) { const m = this.spr(e, 'star', pal, 6), a = Math.random() * 6.283, rr = R * rnd(0.2, 1.1); m.userData = { x: Math.cos(a) * rr, z: Math.sin(a) * rr, y: rnd(0.3, 1.0), rise: rnd(0.4, 1.0), s: rnd(0.2, 0.4), t0: rnd(0, 0.35), life: rnd(0.3, 0.5) }; stars.push(m); }
    return e;
  }

  // ------------------------------------------------------------------ 약병 (falling flask) + ⑥ burst
  flask(pos, o = {}) {
    if (!this._ok()) return null;
    const p = P3(pos), fall = o.fall || 0.5, pal = PHARM.pal[o.elem] || PHARM.pal.poison, I = PHARM.intensity;
    const sp = (Math.random() < 0.5 ? -1 : 1) * rnd(5, 9), dx = rnd(-0.8, 0.8), dz = rnd(-0.8, 0.8), R = o.r || 1.5;
    const e = this._fx('flask', fall, (e) => {
      const k = clamp01(e.t / fall), f = k * k;
      fl.position.set(dx * (1 - f), 7 * (1 - f) + 0.2, dz * (1 - f)); fl.rotation.set(e.t * sp * 0.6, 0, e.t * sp);
      mark.scale.setScalar(R * (1 - 0.6 * k)); mark.material.uniforms.uA.value = I * (0.25 + 0.9 * k);
      tr.quaternion.copy(this.yawQ); tr.scale.set(0.5, 2.6, 1); tr.position.set(fl.position.x, fl.position.y + 1.3, fl.position.z); tr.material.uniforms.uA.value = I * 0.55 * smooth(0.05, 0.4, k);
    });
    e.g.position.copy(p);
    const fl = new THREE.Group(); e.g.add(fl); fl.scale.setScalar(1.7); e.extra = fl;
    const tm = this.model(e, 'tripo_flask_gold', { tint: pal.b, tintK: 1, tintY: 0.21, spec: 0.8, rim: 0xffffff });   // Tripo 약병: the amber liquid takes the element colour
    if (tm) fl.add(tm);
    else { const liq = this.solid(e, this.geo.pharm_liquid, { mode: 2, tint: pal.b, spec: 0.5 }), cork = this.solid(e, this.geo.pharm_cork, { spec: 0.2 }), glass = this.solid(e, this.geo.pharm_flask, { mode: 1, rim: 0xffffff, spec: 1.4 });
      glass.renderOrder = 2; for (const m of [liq, cork, glass]) fl.add(m); }
    const mark = this.ring(e, pal, 0.1, 2), tr = this.spr(e, 'streak', pal, 5);
    return e;
  }
  burst(pos, o = {}) {
    if (!this._ok()) return null;
    const B = PHARM.burst, pal = PHARM.pal[o.elem] || PHARM.pal.poison, I = PHARM.intensity, low = lite(), r = o.r || 1.5;
    const e = this._fx('burst', B.puffLife + 0.3, (e) => {
      const t = e.t;
      ring.scale.setScalar(r * (0.3 + 0.7 * easeOut(t / B.ring))); ring.material.uniforms.uA.value = I * B.ringA * smooth(0, 0.03, t) * (1 - smooth(0.12, 0.42, t));
      core.visible = t < B.core + 0.1; core.quaternion.copy(this.camQ); core.scale.setScalar(r * (0.5 + 1.1 * easeOut(t / 0.1))); core.material.uniforms.uA.value = I * B.coreA * (1 - smooth(0.03, B.core + 0.1, t));
      flare.visible = t < 0.16; flare.quaternion.copy(this.camQ); flare.scale.setScalar(r * (1.2 + 1.4 * easeOut(t / 0.1))); flare.material.uniforms.uA.value = I * B.flareA * (1 - smooth(0.02, 0.16, t));
      for (const m of shards) { const d = m.userData, u = clamp01(t / d.life); m.visible = u < 1; if (!m.visible) continue;
        const dist = d.r0 + d.len * 1.2 * easeOut(u); m.position.copy(d.dir).multiplyScalar(dist).setY(0.5 + d.dir.y * dist); this._aim(m, d.dir); m.scale.set(d.w, d.len * (1 - 0.5 * u), 1); m.material.uniforms.uA.value = I * 1.5 * (1 - smooth(0.25, 1, u)); }
      for (const m of puffs) { const d = m.userData, u = clamp01((t - d.t0) / d.life); m.visible = u > 0 && u < 1; if (!m.visible) continue;
        m.quaternion.copy(this.camQ); m.rotateZ(d.rot + u * d.spin); m.position.set(d.x * (1 + 0.25 * u), d.y + u * d.rise, d.z * (1 + 0.25 * u)); m.scale.setScalar(d.s * (0.45 + 0.75 * easeOut(u)));
        m.material.uniforms.uA.value = B.puffA * d.a * Math.sin(Math.PI * Math.pow(u, 0.5)); }
      for (const m of bits) { const d = m.userData, u = clamp01((t - d.t0) / d.life); m.visible = u > 0 && u < 1; if (!m.visible) continue;
        m.quaternion.copy(this.camQ); m.position.set(d.x, d.y + u * d.rise, d.z); m.scale.setScalar(d.s * (0.6 + 0.5 * u)); m.material.uniforms.uA.value = I * d.a * Math.sin(u * Math.PI); }
    });
    e.g.position.copy(P3(pos));
    const ring = this.ring(e, pal, 0.3), core = this.spr(e, 'glow', pal, 7), flare = this.spr(e, 'flare', pal, 8), shards = [], puffs = [], bits = [];
    core.position.y = flare.position.y = 0.5;
    for (let i = 0, n = low ? 5 : 9; i < n; i++) { const m = this.spr(e, 'spark', pal, 6), a = (i + Math.random() * 0.7) / n * 6.283, up = rnd(0.1, 0.9);
      m.userData = { dir: new THREE.Vector3(Math.cos(a), up, Math.sin(a)).normalize(), r0: r * 0.25, len: r * rnd(0.45, 0.85), w: rnd(0.12, 0.2), life: rnd(0.2, 0.32) }; shards.push(m); }
    // soft puffs sit around the rim (not one opaque ball on the centre), so whoever stands inside stays readable
    for (let i = 0, n = low ? 3 : 6; i < n; i++) { const m = this.smoke(e, i % 2 ? 'puff' : 'puff2', pal, 4), a = (i + Math.random() * 0.6) / n * 6.283, rr = r * rnd(0.3, 0.7);
      m.userData = { x: Math.cos(a) * rr, z: Math.sin(a) * rr, y: rnd(0.35, 0.7), rise: rnd(0.5, 1.0), s: r * rnd(1.1, 1.6), a: rnd(0.75, 1), rot: Math.random() * 6.283, spin: rnd(-0.6, 0.6), t0: rnd(0.02, 0.12), life: B.puffLife * rnd(0.75, 1) }; puffs.push(m); }
    const bitCell = o.elem === 'poison' ? 'bubble' : 'star';
    for (let i = 0, n = low ? 2 : 5; i < n; i++) { const m = this.spr(e, bitCell, pal, 6), a = Math.random() * 6.283, rr = r * rnd(0.2, 0.9);
      m.userData = { x: Math.cos(a) * rr, z: Math.sin(a) * rr, y: rnd(0.3, 0.9), rise: rnd(0.5, 1.1), s: rnd(0.14, 0.3), a: bitCell === 'bubble' ? 0.9 : 1.3, t0: rnd(0.05, 0.4), life: rnd(0.4, 0.7) }; bits.push(m); }
    return e;
  }

  // ------------------------------------------------------------------ ⑦ 아드레날린 주사
  syringe(pc, o = {}) {
    if (!this._ok() || !pc) return null;
    const dur = o.dur || 15, low = lite(), pal = PHARM.pal.orange, I = PHARM.intensity, Bf = PHARM.buff, T0 = 0.58;   // T0 = the injection (flash)
    const fwd = new THREE.Vector3(), rt = new THREE.Vector3(), a0 = new THREE.Vector3(), a1 = new THREE.Vector3(), dir = new THREE.Vector3();
    const e = this._fx('syringe', dur, (e) => {
      if (pc.dead) { e.t = e.life; return; }
      e.g.position.copy(P3(pc.pos)); const f = pc.facing || { x: 0, z: 1 }; fwd.set(f.x, 0, -f.z).normalize(); rt.set(-fwd.z, 0, fwd.x);
      const t = e.t, u = t - T0;
      if (t < 0.95) {   // syringe: right hand (front right, chest) -> left upper arm, needle (+Y of the mesh) pointing at the arm; pressed 0.45 - 0.7
        sy.visible = true; const k = smooth(0.05, 0.45, t);
        a0.copy(rt).multiplyScalar(0.32).addScaledVector(fwd, 0.38).setY(1.0); a1.copy(rt).multiplyScalar(-0.42).addScaledVector(fwd, 0.08).setY(1.32);
        sy.position.lerpVectors(a0, a1, k); dir.copy(rt).multiplyScalar(-1).addScaledVector(fwd, -0.15).setY(-0.25).normalize();
        sy.quaternion.setFromUnitVectors(UP, dir); sy.position.addScaledVector(dir, -0.42 * (1 - smooth(0.45, 0.7, t) * 0.25));
        sy.material.uniforms.uA.value = smooth(0, 0.08, t) * (1 - smooth(0.78, 0.95, t)); sy.material.uniforms.uGlow.value = 0.15 + 0.5 * smooth(0.45, 0.7, t);
      } else sy.visible = false;
      const end = 1 - smooth(e.life - 1, e.life, t), on = smooth(0, 0.08, u) * end, beat = Math.pow(Math.max(0, Math.sin(t * 7.5)), 6);
      const fl = smooth(0, 0.05, u) * (1 - smooth(0.1, 0.55, u));                          // cast flash, then the dim loop
      ring.scale.setScalar(0.62 + 0.3 * easeOut(u / 0.3) + 0.04 * beat); ring.material.uniforms.uA.value = I * on * (Bf.flash * fl + Bf.loop * (0.55 + 0.45 * beat));
      for (const m of ribs) { const d = m.userData, k = clamp01(u / 0.6); m.visible = u > 0 && k < 1; if (!m.visible) continue;
        m.scale.setScalar(d.rr); m.position.y = d.y + k * 0.5; m.rotation.set(d.tx, -(d.a + u * 10), 0, 'YXZ'); const U = m.material.uniforms; U.uA.value = I * 1.2 * Math.sin(Math.PI * Math.pow(k, 0.6)) * end; U.uCut.value = 0.5 * k; }
      for (const m of rays) { const d = m.userData, k = clamp01((u - d.t0) / d.life); m.visible = k > 0 && k < 1; if (!m.visible) continue;
        m.quaternion.copy(this.yawQ); m.scale.set(d.w, d.h * easeOut(k * 1.5), 1); m.position.set(d.x, m.scale.y * 0.5, d.z); m.material.uniforms.uA.value = I * 0.8 * Math.sin(Math.PI * Math.pow(k, 0.6)); }
      // arrows: a quick volley at the flash, then one rises now and then (the loop stays quieter than any attack effect)
      for (const m of arrows) { const d = m.userData; let k;
        if (u < 1) k = clamp01((u - d.t0) / d.life); else { const ph = ((u - 1) / d.period + d.ph) % 1; k = ph < d.duty ? ph / d.duty : -1; }
        m.visible = k > 0 && k < 1; if (!m.visible) continue;
        m.quaternion.copy(this.camQ); m.position.set(d.x, 0.35 + k * 1.5, d.z); m.scale.setScalar(d.s); m.material.uniforms.uA.value = I * (u < 1 ? 1.2 : 0.55) * Math.sin(Math.PI * Math.pow(k, 0.7)) * end; }
    });
    const sy = this.solid(e, this.geo.pharm_syringe, { rim: 0xffe0c0, em: 0xff7030, glow: 0.15, spec: 1.2 }); sy.scale.setScalar(0.42);
    const ring = this.ring(e, pal, 0.2), ribs = [], rays = [], arrows = [];
    for (let i = 0; i < (low ? 1 : 2); i++) { const m = this.rib(e, pal); m.userData = { rr: 0.78 - i * 0.24, y: 0.12 + i * 0.3, a: i * 3.1, tx: i ? -0.12 : 0.1 }; ribs.push(m); }
    for (let i = 0, n = low ? 2 : 5; i < n; i++) { const m = this.spr(e, 'streak', pal), a = Math.random() * 6.283, rr = rnd(0.35, 0.7); m.userData = { x: Math.cos(a) * rr, z: Math.sin(a) * rr, w: rnd(0.1, 0.18), h: rnd(1.0, 1.9), t0: i * 0.04, life: rnd(0.3, 0.45) }; rays.push(m); }
    for (let i = 0, n = low ? 2 : 4; i < n; i++) { const m = this.spr(e, 'arrow', pal, 6), a = (i / n + 0.1) * 6.283, rr = rnd(0.45, 0.7);
      m.userData = { x: Math.cos(a) * rr, z: Math.sin(a) * rr, s: rnd(0.3, 0.42), t0: i * 0.07, life: rnd(0.45, 0.6), period: 2.4, ph: i / n, duty: 0.3 }; arrows.push(m); }
    return e;
  }

  // ------------------------------------------------------------------ ⑧ 약 보호막
  shield(pc, o = {}) {
    if (!this._ok() || !pc) return null;
    const dur = o.dur || 8, Sh = PHARM.shield, pal = PHARM.pal.shield, I = PHARM.intensity, low = lite();
    let gone = -1, last = pc.shield || 0, hitT = 9;
    const e = this._fx('shield', dur, (e, dt) => {
      if (pc.dead) { e.t = e.life; return; }
      e.g.position.copy(P3(pc.pos)); const t = e.t, u = dome.material.uniforms;
      if (gone < 0 && t > 0.3 && !(pc.shield > 0)) gone = t;                 // shield used up -> fade now
      if ((pc.shield || 0) < last - 0.5) {                                    // struck: ripple from the side the attacker stands on (else from the camera side)
        hitT = 0; let d = null; const src = pc.lastHitSource; if (src && src.pos) { d = new THREE.Vector3(src.pos.x - pc.pos.x, 0, -(src.pos.z - pc.pos.z)); if (d.lengthSq() < 1e-4) d = null; }
        (d ? d.normalize().multiplyScalar(0.85).setY(0.5) : d = this.toCam.clone().setY(0.45)); u.uHitP.value.copy(d).normalize(); }
      last = pc.shield || 0; hitT += dt; u.uHitT.value = hitT / 0.45; u.uHit.value = hitT < 0.45 ? 1 - hitT / 0.45 : 0;
      const fade = gone >= 0 ? 1 - smooth(gone, gone + 0.35, t) : 1 - smooth(e.life - 0.6, e.life, t), pop = 1 + 1.2 * (1 - smooth(0, 0.35, t));   // brighter while it forms
      const k = easeOut(t / 0.28); dome.scale.set(Sh.rx * (0.6 + 0.4 * k), Sh.ry * (0.5 + 0.5 * k), Sh.rx * (0.6 + 0.4 * k));
      u.uA.value = I * smooth(0, 0.12, t) * fade * pop; u.uT.value = t;
      ring.scale.setScalar(Sh.rx * (0.6 + 0.4 * k) * 1.02); ring.material.uniforms.uA.value = I * 0.9 * smooth(0, 0.1, t) * fade * (0.55 + 0.45 * pop / 2.2);
      for (const m of motes) { const d = m.userData, ph = (d.ph + t * d.sp) % 1; m.quaternion.copy(this.camQ); const a = d.a + t * 0.4, th = ph * 1.35;
        m.position.set(Math.cos(a) * Math.cos(th) * Sh.rx * 0.98, Math.sin(th) * Sh.ry * 0.98, Math.sin(a) * Math.cos(th) * Sh.rx * 0.98); m.scale.setScalar(d.s); m.material.uniforms.uA.value = I * 0.9 * Math.sin(ph * Math.PI) * fade * smooth(0.2, 0.5, t); }
      if (gone >= 0 && t > gone + 0.4) e.t = e.life;
    });
    const dome = this._m(e, 'dome', this.geo.pharm_dome, 6); this._pal(dome, pal);
    { const u = dome.material.uniforms; u.uFill.value = Sh.fill; u.uLine.value = Sh.line; u.uFlow.value = Sh.flow; u.uRim.value = Sh.rim; u.uHexN.value = Sh.hexN; u.uHit.value = 0; }
    const ring = this.ring(e, pal, 0.15), motes = [];
    for (let i = 0, n = low ? 3 : 7; i < n; i++) { const m = this.spr(e, 'star', pal, 7); m.userData = { a: Math.random() * 6.283, ph: Math.random(), sp: rnd(0.25, 0.45), s: rnd(0.12, 0.22) }; motes.push(m); }
    return e;
  }

  // ------------------------------------------------------------------ ⑨ 광역 회복진
  circle(pos, o = {}) {
    if (!this._ok()) return null;
    const r = o.r || 3.6, dur = o.dur || 8, low = lite(), pal = PHARM.pal.heal, I = PHARM.intensity, Cc = PHARM.circle;
    let pulseT = -9;
    const e = this._fx('circle', dur + 0.6, (e) => {
      const t = e.t, on = smooth(0, 0.3, t) * (1 - smooth(e.endAt ?? dur, (e.endAt ?? dur) + 0.5, t)), pk = t - pulseT, bump = pk < 0.5 ? 1 - smooth(0, 0.5, pk) : 0, open = 1 - smooth(0, 0.5, t);
      disc.rotation.y = t * 0.2; disc.scale.setScalar(r * (0.82 + 0.18 * easeOut(t / 0.3))); disc.material.uniforms.uA.value = I * on * Cc.tex * (0.8 + 0.5 * bump + 0.9 * open);
      edge.scale.setScalar(r); edge.material.uniforms.uA.value = I * on * (0.5 + 0.4 * bump + 0.8 * open);
      wave.visible = pk < 0.6; if (wave.visible) { wave.scale.setScalar(r * (0.3 + 0.7 * easeOut(pk / 0.45))); wave.material.uniforms.uA.value = I * on * Cc.pulse * (1 - smooth(0.15, 0.6, pk)); }
      for (const m of ribs) { const d = m.userData; m.scale.setScalar(r * d.rr); m.position.y = d.y; m.rotation.set(d.tx, -(d.a + t * d.w), 0, 'YXZ'); m.material.uniforms.uA.value = I * on * Cc.ribbon * (0.7 + 0.6 * bump + 1.2 * open); }
      for (const m of plus) { const d = m.userData, u = (d.ph + t * d.sp) % 1; m.quaternion.copy(this.camQ); m.position.set(d.x, 0.25 + u * 1.7, d.z); m.scale.setScalar(d.s * (0.7 + 0.3 * u)); m.material.uniforms.uA.value = I * on * 0.95 * Math.sin(Math.PI * Math.pow(u, 0.7)); }
      for (const m of motes) { const d = m.userData, u = (d.ph + t * d.sp) % 1; m.quaternion.copy(this.camQ); m.position.set(d.x, 0.1 + u * 2.0, d.z); m.scale.setScalar(d.s); m.material.uniforms.uA.value = I * on * 0.9 * Math.sin(u * Math.PI); }
    });
    e.g.position.copy(P3(pos));
    const disc = this._m(e, 'circle', this.geo.pharm_circle, 2); disc.position.y = PHARM.ringLift - 0.01;
    const edge = this.ring(e, pal, 0.0, 3), wave = this.ring(e, pal, 0.3, 4); wave.position.y = PHARM.ringLift + 0.02;
    const ribs = [], plus = [], motes = [];
    for (let i = 0, n = low ? 2 : 3; i < n; i++) { const m = this.rib(e, pal, 4); m.material.uniforms.uCut.value = 0; m.userData = { rr: [0.93, 0.6, 0.78][i], y: 0.10 + i * 0.05, a: i * 2.2, w: [0.9, -1.3, 1.6][i], tx: 0 }; ribs.push(m); }
    for (let i = 0, n = low ? 4 : 8; i < n; i++) { const m = this.spr(e, 'plus', pal, 6), a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * r * 0.85; m.userData = { x: Math.cos(a) * rr, z: Math.sin(a) * rr, ph: Math.random(), sp: rnd(0.28, 0.42), s: rnd(0.26, 0.4) }; plus.push(m); }
    for (let i = 0, n = low ? 5 : 14; i < n; i++) { const m = this.spr(e, 'glow', pal, 5), a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * r * 0.92; m.userData = { x: Math.cos(a) * rr, z: Math.sin(a) * rr, ph: Math.random(), sp: rnd(0.3, 0.55), s: rnd(0.10, 0.2) }; motes.push(m); }
    e.pulse = () => { pulseT = e.t; }; e.end = () => { if (e.endAt == null) { e.endAt = e.t; e.life = e.t + 0.6; } };
    return e;
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    const G = window.G, cam = G && G.render && G.render.cam;
    if (cam) { this.camQ.copy(cam.quaternion); cam.getWorldDirection(_a); this.toCam.copy(_a).multiplyScalar(-1); this.yawQ.setFromAxisAngle(UP, Math.atan2(this.toCam.x, this.toCam.z));
      this.camR.set(1, 0, 0).applyQuaternion(cam.quaternion).setY(0).normalize(); }
    for (const e of this.live) { e.t += dt; try { e.update(e, dt); } catch (err) { console.warn('pharmfx', e.kind, err); e.t = e.life; } if (e.t >= e.life) this._free(e); }
    this.live = this.live.filter(e => !e.dead);
  }
  _free(e) { if (e.dead) return; e.dead = true; this.root.remove(e.g);
    for (const m of e.items) { if (m.parent) m.parent.remove(m); (this.pool[m.userData.kind] || (this.pool[m.userData.kind] = [])).push(m); m.userData = { kind: m.userData.kind }; } e.items.length = 0; }
  clear() { for (const e of this.live) this._free(e); this.live = []; }
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _mx = new THREE.Matrix4();
