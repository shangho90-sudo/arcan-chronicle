// 스킬 이펙트 리마스터(테일즈위버풍, 2026-11-19) 공용 키트 — 여러 직업 스킬이 같이 쓰는 다층 메시 이펙트.
// 사양(사용자): 단순 파티클·원형 폭발·직선 발사체 대신 밝은 중심 / 색 중간층 / 반투명 외곽층을 따로 그리는 메시 이펙트,
// 이동 = 잔상·빛 궤적·속성 입자, 명중 = 0.03~0.08초 섬광 + 스파크 + 땅 충격파, 마무리 = 잔광이 천천히 사라짐.
// 메시: tools/blender/fx_rm.py -> assets/fx/fx_rm.glb.json (rm_cres·rm_cres_big·rm_comet·rm_crown·rm_ring·rm_streak·rm_drop·rm_star, 이미지 없음 — 빛·색은 여기 셰이더가 UV로).
// 규칙: 그림만(피해·시각·판정·카메라 kick은 부르는 쪽 그대로), 난수는 이 파일의 xorshift(게임 Math.random 안 씀), 전역 블룸·노출·히트스톱 안 건드림.
// 품질: 부르는 쪽이 gfxOn()일 때만 씀(낮음 = 예전 연출). 보통(gfxQ 'medium' 또는 휴대폰·그래픽 효과 끔) = 입자 수 RMFX.liteK배·꼬리 짧게.
// draw call: 효과마다 층 메시 몇 개(풀 재사용) + 입자 종류마다 InstancedMesh 하나(streak·drop·star, 상한 RMFX.cap — 차면 새 입자를 버림).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { gfxQ } from './gfxq.js';

export const RMFX = {
  cap: 260, liteK: 0.5, intensity: 1,
  // 물감 탄환(예술가 ar1_a1): 혜성 세 층 + 꼬리 리본 + 물감 방울, 명중 왕관 + 섬광 + 땅 충격파 + 얼룩
  paint: { core: 0.1, mid: [0.95, 0.95, 0.7], outer: [1.45, 1.45, 1.1], wob: 13, trail: 20, trailW: 0.46, fleck: 0.05,
    flash: 0.055, flashSize: 1.15, crown: 0.55, crownLife: 0.36, ring: 1.25, ringLife: 0.26, stain: 1.0, stainLife: 1.1, drops: 12, sparks: 7, glow: 0.9 },
};
const P3 = (p) => new THREE.Vector3(p.x, p.y || 0, -p.z);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
let seed = 0x2545f491;
const rand = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
const rnd = (a, b) => a + rand() * (b - a);
const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion(), _m4 = new THREE.Matrix4(), _s = new THREE.Vector3(), _col = new THREE.Color();
/** reduced counts: medium quality, phone or 그래픽 효과 끔 */
export const rmLite = () => { const G = window.G; return gfxQ() === 'medium' || !!(G && ((G.input && G.input.mobile) || (G.settings && G.settings.graphicsFx === false))); };
const rawK = () => { const G = window.G; return G && G.settings && G.settings.graphicsFx === false ? 0.55 : 1; };   // no tonemap -> keep additive whites from clipping

// ---------------------------------------------------------------------------------------------- shaders
// one vertex shader for the layer meshes: world normal / view vector for the fresnel, uv for the shapes
const VS = `varying vec2 vUv; varying vec3 vN, vV;
void main(){ vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
// uS shape: 0 energy body (fresnel: bright core where it faces the camera, uW -> uB towards the rim) / 1 halo shell (only the rim glows)
//           2 crown petals (v = height: wet paint, light rim at the tips, erodes from the tips with uE) / 3 ground ring (v across: thin bright edge + soft inner)
//           4 flash quad (four-point star + round core) / 5 ground stain disc (noisy edge, uE erodes) / 6 soft round glow quad
//           7 / 8 / 9 sword energy core / body / halo on rm_cres (uE = head 0..1 along the swing, uT = tail length)
const FS = `uniform vec3 uW, uB; uniform float uA, uS, uE, uT, uQ, uAdd; varying vec2 vUv; varying vec3 vN, vV;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h21(i), h21(i + vec2(1., 0.)), f.x), mix(h21(i + vec2(0., 1.)), h21(i + vec2(1., 1.)), f.x), f.y); }
void main(){
  vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n; float fr = 1. - abs(dot(n, normalize(vV))), a = 0., core = 0.;
  if (uS < .5) { core = pow(1. - fr, 1.6); a = .55 + .45 * core; vec3 L = normalize(vec3(-.4, .8, .5)); core += .35 * pow(max(0., dot(reflect(-L, n), vV)), 12.); }
  else if (uS < 1.5) { a = (pow(fr, 1.4) * .55 + .12) * smoothstep(1., .82, fr) * (.6 + .4 * vn(vUv * vec2(9., 4.) + uT * 2.)); core = pow(fr, 4.) * .6; }
  else if (uS < 2.5) { float v = vUv.y, br = vn(vec2(vUv.x * 60. + uQ, v * 3.)); float cut = smoothstep(uE - .08, uE, v + br * .25 - .1); a = (1. - cut) * smoothstep(0., .08, v) * (.75 + .25 * br); core = smoothstep(.55, 1., v) * .7 + br * .2; }
  else if (uS < 3.5) { float v = vUv.y; a = exp(-pow((v - .85) * 7., 2.)) + .35 * smoothstep(0., .85, v) * (1. - smoothstep(.85, 1., v)); a *= .8 + .2 * vn(vec2(vUv.x * 40. + uQ, uT * 3.)); core = exp(-pow((v - .88) * 16., 2.)); }
  else if (uS < 4.5) { vec2 p = vUv * 2. - 1.; float r = length(p); float s = exp(-abs(p.x) * 18.) * clamp(1. - abs(p.y), 0., 1.) + exp(-abs(p.y) * 18.) * clamp(1. - abs(p.x), 0., 1.);
    float d = exp(-abs(p.x + p.y) * 26.) * clamp(1. - r * 1.4, 0., 1.) + exp(-abs(p.x - p.y) * 26.) * clamp(1. - r * 1.4, 0., 1.);
    a = s + .45 * d + pow(clamp(1. - r, 0., 1.), 2.4); core = pow(clamp(1. - r * 2., 0., 1.), 1.5) + s * .6; }
  else if (uS < 5.5) { vec2 p = vUv * 2. - 1.; float r = length(p), ang = atan(p.y, p.x); float nz = vn(vec2(ang * 2.5 + uQ, uQ)) * .22 + vn(p * 5. + uQ) * .12;
    float R = .78 + nz; a = smoothstep(R, R - .07, r) * (1. - smoothstep(uE - .1, uE, vn(p * 3.2 + uQ * 2.) * .8 + r * .35));
    float q = vn(p * 9. + uQ); core = smoothstep(R - .1, R - .02, r) * .5 + q * .25; }
  else if (uS < 6.5) { vec2 p = vUv * 2. - 1.; float r = length(p); a = pow(clamp(1. - r, 0., 1.), 2.); core = pow(clamp(1. - r * 1.8, 0., 1.), 2.); }
  else {   // 7 blade core / 8 blade body / 9 blade halo: wipe along the swing (head uE, tail length uT), bright at the head
    float u = vUv.x, v = vUv.y, dh = uE - u, w = smoothstep(-.02, .03, dh) * (1. - smoothstep(uT * .55, uT, dh)), hd = exp(-max(dh, 0.) * 5.);
    float ends = smoothstep(0., .08, u) * smoothstep(1., .9, u);
    if (uS < 7.5) { a = exp(-pow((v - .9) * 9., 2.)) * (.45 + .9 * hd); core = 1.; }
    else if (uS < 8.5) { a = smoothstep(.25, .75, v) * smoothstep(1.02, .9, v) * (.45 + .55 * hd); core = smoothstep(.6, 1., v); a *= .85 + .15 * vn(vec2(u * 30. + uQ, v * 4.)); }
    else { a = exp(-pow((v - .7) * 2.6, 2.)) * .7 * (.4 + .6 * hd) * (.7 + .3 * vn(vec2(u * 12. - uQ * 3., v * 3.))); core = .2; }
    a *= w * ends; }
  vec3 c = mix(uB, uW, clamp(core, 0., 1.));
  if (uAdd > .5) gl_FragColor = vec4(c * clamp(a, 0., 2.) * uA, 1.); else gl_FragColor = vec4(c, clamp(a, 0., 1.) * uA);
}`;
// lit wet-paint body (comet mid layer, crown core, drops): vertex normal light + soft rim + specular, uWob ripples the surface colour
const PAINT_FS = `uniform vec3 uW, uB; uniform float uA, uT, uQ; varying vec2 vUv; varying vec3 vN, vV;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h21(i), h21(i + vec2(1., 0.)), f.x), mix(h21(i + vec2(0., 1.)), h21(i + vec2(1., 1.)), f.x), f.y); }
void main(){ vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n; vec3 V = normalize(vV), L = normalize(vec3(-.4, .8, .5));
  float d = max(0., dot(n, L)), rim = pow(1. - max(0., dot(n, V)), 2.4), sp = pow(max(0., dot(reflect(-L, n), V)), 26.);
  float sw = vn(vec2(vUv.x * 5. + uT * 1.5 + uQ, vUv.y * 6.)); vec3 base = mix(uB, uW, sw * .35);
  vec3 c = base * (.55 + .6 * d) + uW * rim * .55 + vec3(1., .98, .94) * sp * .9;
  gl_FragColor = vec4(c, uA); }`;
// camera-facing ribbon (trail): uv.x 0 = oldest .. 1 = head, uv.y across; uW head colour, uB tail colour; uS 0 = paint (alpha), 1 = light (additive)
const RIB_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const RIB_FS = `uniform vec3 uW, uB; uniform float uA, uS, uQ; varying vec2 vUv;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h21(i), h21(i + vec2(1., 0.)), f.x), mix(h21(i + vec2(0., 1.)), h21(i + vec2(1., 1.)), f.x), f.y); }
void main(){ float u = vUv.x, v = abs(vUv.y * 2. - 1.), br = vn(vec2(vUv.y * 22. + uQ, u * 3.));
  if (uS < .5) { float edge = 1. - smoothstep(.62, 1., v + (br - .5) * .3); float dry = smoothstep(.5, .95, br + (1. - u) * .6 - .25);
    float a = edge * (1. - dry * .6) * smoothstep(0., .25, u); gl_FragColor = vec4(mix(uB, uW, clamp(u * .8 + br * .3 - v * .3, 0., 1.)), a * uA); }
  else { float a = exp(-v * v * 6.) * pow(u, 1.4); gl_FragColor = vec4(mix(uB, uW, pow(u, 3.) * (1. - v)) * a * uA, 1.); } }`;
// instanced particles: per-instance colour (instanceColor) + alpha (aA); uS 0 = additive glow streak/star, 1 = lit paint drop (alpha)
const PVS = `attribute float aA; varying float vA; varying vec3 vC, vN, vV; varying vec2 vUv;
void main(){ vA = aA; vUv = uv; vC = instanceColor; vec4 w = instanceMatrix * vec4(position, 1.); vN = normalize(normalMatrix * mat3(instanceMatrix) * normal); vec4 mv = modelViewMatrix * w; vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const PFS = `uniform float uS; varying float vA; varying vec3 vC, vN, vV; varying vec2 vUv;
void main(){ if (vA <= .001) discard; vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
  if (uS < .5) { float k = 1. - abs(vUv.y * 2. - 1.); k *= smoothstep(0., .5, vUv.x); vec3 c = mix(vC, vec3(1.), k * k * .7); gl_FragColor = vec4(c * vA * (.35 + k), 1.); }
  else { vec3 L = normalize(vec3(-.4, .8, .5)); float d = max(0., dot(n, L)), rim = pow(1. - max(0., dot(n, normalize(vV))), 2.5), sp = pow(max(0., dot(reflect(-L, n), normalize(vV))), 20.);
    gl_FragColor = vec4(vC * (.55 + .6 * d) + rim * .3 + sp * .7, vA); } }`;

const U = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v }]));

/** one InstancedMesh per particle kind; slots recycle, a full pool drops new particles */
class Parts {
  constructor(geo, add, cap) {
    this.n = cap; this.list = []; this.free = [];
    for (let i = cap - 1; i >= 0; i--) this.free.push(i);
    const g = geo.clone(); this.aA = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1); this.aA.setUsage(THREE.DynamicDrawUsage); g.setAttribute('aA', this.aA);
    this.mesh = new THREE.InstancedMesh(g, new THREE.ShaderMaterial({ uniforms: U({ uS: add ? 0 : 1 }), vertexShader: PVS, fragmentShader: PFS, transparent: true, depthWrite: false,
      blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide }), cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.frustumCulled = false; this.mesh.renderOrder = add ? 8 : 6;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    _m4.makeScale(0, 0, 0); for (let i = 0; i < cap; i++) { this.mesh.setMatrixAt(i, _m4); this.aA.array[i] = 0; }
    this.mesh.count = cap; this.mesh.visible = false;   // no draw call while empty
  }
  /** o: {p, v (Vector3), life, s (size) or sv (Vector3 scale), col, grav, drag, stretch (streak: length grows with speed), floor (y), spin} */
  add(o) {
    if (!this.free.length) return null;
    const i = this.free.pop(), q = { i, p: o.p.clone(), v: o.v ? o.v.clone() : new THREE.Vector3(), t: o.t ?? 0, life: o.life || 0.5, s: o.s || 0.1, sv: o.sv || null, col: o.col ?? 0xffffff,
      grav: o.grav ?? 0, drag: o.drag ?? 0, stretch: o.stretch || 0, floor: o.floor ?? -1e9, spin: o.spin || 0, rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd(0, 6), rnd(0, 6), rnd(0, 6))), a: o.a ?? 1, flat: false };
    this.mesh.setColorAt(i, _col.setHex(q.col)); this.mesh.instanceColor.needsUpdate = true; this.list.push(q); this.mesh.visible = true; return q;
  }
  update(dt) {
    const keep = [];
    for (const q of this.list) {
      q.t += dt;
      if (q.t >= q.life) { _m4.makeScale(0, 0, 0); this.mesh.setMatrixAt(q.i, _m4); this.aA.array[q.i] = 0; this.free.push(q.i); continue; }
      keep.push(q); if (q.t < 0) { this.aA.array[q.i] = 0; continue; }
      q.v.y -= q.grav * dt; if (q.drag) q.v.multiplyScalar(Math.max(0, 1 - q.drag * dt)); q.p.addScaledVector(q.v, dt);
      if (q.p.y < q.floor) { q.p.y = q.floor; q.v.set(0, 0, 0); q.flat = true; }
      const k = q.t / q.life;
      if (q.stretch) { const sp = q.v.length(); if (sp > 0.01) { _a.copy(q.v).normalize(); _q.setFromUnitVectors(_c.set(0, 0, 1), _a); } else _q.copy(q.rot); _s.set(q.s, q.s, q.s * (1 + sp * q.stretch)); }
      else { if (q.spin) q.rot.multiply(_q.setFromAxisAngle(_c.set(0.3, 1, 0.2).normalize(), q.spin * dt)); _q.copy(q.rot); if (q.sv) _s.copy(q.sv); else _s.setScalar(q.s); if (q.flat) _s.set(_s.x * 1.5, _s.y * 0.3, _s.z * 1.5); }
      _s.multiplyScalar(q.stretch ? 1 : 1 - smooth(0.6, 1, k) * 0.6);
      _m4.compose(q.p, _q, _s); this.mesh.setMatrixAt(q.i, _m4); this.aA.array[q.i] = q.a * (1 - smooth(0.55, 1, k)) * smooth(0, 0.04, q.t);
    }
    this.list = keep; this.mesh.visible = keep.length > 0; if (keep.length) { this.mesh.instanceMatrix.needsUpdate = true; this.aA.needsUpdate = true; }
  }
  clear() { for (const q of this.list) { _m4.makeScale(0, 0, 0); this.mesh.setMatrixAt(q.i, _m4); this.aA.array[q.i] = 0; this.free.push(q.i); } this.list = []; this.mesh.visible = false; this.mesh.instanceMatrix.needsUpdate = true; this.aA.needsUpdate = true; }
}

export class RmFx {
  constructor(root) {
    this.root = root; this.live = []; this.geo = {}; this.pool = {}; this.ribs = []; this.ready = false; this.loading = null; this.parts = null; this.frame = 0;
    this.camQ = new THREE.Quaternion(); this.camPos = new THREE.Vector3(); this.quad = new THREE.PlaneGeometry(1, 1);
  }
  load() {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const j = await (await fetch('assets/fx/fx_rm.glb.json')).json(), raw = atob(j.b64), u8 = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
      const g = await new Promise((res, rej) => new GLTFLoader().parse(u8.buffer, '', res, rej));
      g.scene.traverse(o => { if (o.isMesh) this.geo[o.name] = o.geometry; });
      const cap = RMFX.cap;
      this.parts = { streak: new Parts(this.geo.rm_streak, true, cap), drop: new Parts(this.geo.rm_drop, false, cap), star: new Parts(this.geo.rm_star, true, Math.round(cap / 2)) };
      for (const k in this.parts) this.root.add(this.parts[k].mesh);
      this.ready = true;
    })().catch(e => console.warn('rmfx load', e));
    return this.loading;
  }
  ok() { if (!this.ready) { this.load(); return false; } return true; }
  // ------------------------------------------------------------------ pooled layer meshes
  _mat(kind) {
    const u = U({ uW: new THREE.Color(1, 1, 1), uB: new THREE.Color(1, 1, 1), uA: 0, uS: 0, uE: 2, uT: 0, uQ: 0, uAdd: kind === 'add' ? 1 : 0 });
    if (kind === 'paint') return new THREE.ShaderMaterial({ uniforms: u, vertexShader: VS, fragmentShader: PAINT_FS, transparent: true, depthWrite: true, side: THREE.DoubleSide });
    return new THREE.ShaderMaterial({ uniforms: u, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: kind === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending });
  }
  /** kind: 'add' (additive light layer) / 'alpha' (soft translucent layer) / 'paint' (lit wet body) */
  _m(e, kind, geo, o = {}) {
    const p = this.pool[kind] || (this.pool[kind] = []); let m = p.pop();
    if (!m) { m = new THREE.Mesh(geo, this._mat(kind)); m.frustumCulled = false; m.userData.kind = kind; }
    m.geometry = geo; m.position.set(0, 0, 0); m.quaternion.identity(); m.scale.set(1, 1, 1); m.visible = true; m.renderOrder = o.order ?? (kind === 'add' ? 7 : 5);
    const u = m.material.uniforms; u.uW.value.setHex(o.w ?? 0xffffff); u.uB.value.setHex(o.b ?? 0xffffff); u.uA.value = 0; u.uS.value = o.s ?? 0; u.uE.value = 2; u.uT.value = 0; u.uQ.value = rnd(0, 10);
    e.items.push(m); e.g.add(m); return m;
  }
  _fx(kind, life, update) { const e = { kind, g: new THREE.Group(), items: [], t: 0, life, update }; this.root.add(e.g); this.live.push(e); return e; }
  _face(m, s) { m.quaternion.copy(this.camQ); if (s != null) m.scale.setScalar(s); return m; }
  _flat(m, s, y) { m.rotation.set(-Math.PI / 2, 0, 0); m.scale.set(s, s, 1); m.position.y = y; return m; }
  // ------------------------------------------------------------------ trail ribbon (camera facing), pooled with its geometry
  _rib(n) {
    let m = this.ribs.pop();
    if (!m || m.userData.N < n) {
      const N = Math.max(n, 24), g = new THREE.BufferGeometry(), idx = [];
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 6), 3)); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(N * 4), 2));
      for (let i = 0; i < N - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
      g.setIndex(idx); g.setDrawRange(0, 0);
      const mk = (add) => new THREE.ShaderMaterial({ uniforms: U({ uW: new THREE.Color(), uB: new THREE.Color(), uA: 0, uS: add ? 1 : 0, uQ: 0 }), vertexShader: RIB_VS, fragmentShader: RIB_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
      m = new THREE.Mesh(g, mk(false)); m.userData.N = N; m.userData.mats = [m.material, mk(true)]; m.frustumCulled = false;
    }
    m.geometry.setDrawRange(0, 0); m.visible = true; return m;
  }
  /** pts: newest last; width(k) k 0 = oldest .. 1 = head */
  _ribFill(m, pts, width) {
    const N = m.userData.N, pos = m.geometry.attributes.position, uv = m.geometry.attributes.uv, n = Math.min(pts.length, N);
    if (n < 2) { m.geometry.setDrawRange(0, 0); return; }
    const s = pts.length - n;
    for (let i = 0; i < n; i++) {
      const p = pts[s + i], pa = pts[s + Math.max(0, i - 1)], pb = pts[s + Math.min(n - 1, i + 1)], k = i / (n - 1);
      _a.subVectors(pb, pa); if (_a.lengthSq() < 1e-8) _a.set(1, 0, 0);
      _b.subVectors(this.camPos, p); _c.crossVectors(_a, _b).normalize().multiplyScalar(width(k) / 2);
      pos.setXYZ(i * 2, p.x - _c.x, p.y - _c.y, p.z - _c.z); pos.setXYZ(i * 2 + 1, p.x + _c.x, p.y + _c.y, p.z + _c.z); uv.setXY(i * 2, k, 0); uv.setXY(i * 2 + 1, k, 1);
    }
    pos.needsUpdate = true; uv.needsUpdate = true; m.geometry.setDrawRange(0, (n - 1) * 6);
  }
  // ------------------------------------------------------------------ particles
  emit(kind, n, f) { if (!this.parts) return; const P = this.parts[kind]; for (let i = 0; i < n; i++) { const o = f(i); if (o) P.add(o); } }

  // ================================================================== 물감 탄환 (예술가 ar1_a1)
  /** layered paint comet. pos = game coords; returns handle {set(pos), dispose()} like artfx.proj; o.col = paint colour */
  paintComet(pos, o = {}) {
    if (!this.ok()) return null;
    const K = RMFX.paint, low = rmLite(), col = o.col ?? 0x2f7cf6, hi = o.hi ?? 0x9fe8ff, deep = o.deep ?? 0x1a3fb0, I = RMFX.intensity * rawK();
    const last = P3(pos), vel = new THREE.Vector3(0, 0, 1), pts = [], trailN = low ? 11 : K.trail, groundY = last.y - 1.0;
    let fleckT = 0, hitAt = -1, dead = false;
    const e = this._fx('paintComet', 6, (e, dt) => {
      const t = e.t, born = smooth(0, 0.05, t);
      _m4.lookAt(vel, _a.set(0, 0, 0), UP);   // +Z (the comet head) along the flight _q.setFromRotationMatrix(_m4);
      const w = Math.sin(t * K.wob) * 0.12, pul = 1 + 0.08 * Math.sin(t * 31);
      mid.quaternion.copy(_q); mid.scale.set(K.mid[0] * (1 - w), K.mid[1] * (1 + w), K.mid[2] * (1 + 0.15 * Math.sin(t * 9))); mid.material.uniforms.uA.value = born; mid.material.uniforms.uT.value = t;
      outer.quaternion.copy(_q); outer.scale.set(K.outer[0] * pul, K.outer[1] * pul, K.outer[2]); outer.material.uniforms.uA.value = I * 1.3 * born; outer.material.uniforms.uT.value = t;
      core.scale.setScalar(K.core * pul); core.position.copy(vel).multiplyScalar(0.05); core.material.uniforms.uA.value = I * 1.3 * born;
      this._face(glow, K.glow * pul); glow.material.uniforms.uA.value = I * 0.6 * born;
      shadow.position.set(0, groundY - e.g.position.y + 0.05, 0); shadow.material.uniforms.uA.value = 0.32 * born;
      pts.push(e.g.position.clone()); if (pts.length > trailN) pts.shift();
      this._ribFill(rib, pts, (k) => K.trailW * Math.pow(k, 0.7)); rib.material.uniforms.uA.value = 0.92 * born;
      this._ribFill(ribL, pts, (k) => K.trailW * 0.45 * Math.pow(k, 1.2)); ribL.material.uniforms.uA.value = I * 0.9 * born;
      fleckT -= dt;
      if (fleckT <= 0) { fleckT = low ? 0.06 : 0.03; const P = e.g.position, c3 = [col, hi, 0xffd22e, 0xf03a44];
        this.emit('drop', 1, () => ({ p: _a.copy(P).add(_b.set(rnd(-0.08, 0.08), rnd(-0.06, 0.06), rnd(-0.08, 0.08))), v: _c.set(rnd(-0.5, 0.5), rnd(0.3, 1.3), rnd(-0.5, 0.5)), s: K.fleck * rnd(0.6, 1.2), col: c3[Math.floor(rand() * (low ? 2 : 4))], life: 0.5, grav: 9, floor: groundY + 0.02 }));
        if (!low) this.emit('star', 1, () => ({ p: _a.copy(P).add(_b.set(rnd(-0.15, 0.15), rnd(-0.1, 0.12), rnd(-0.15, 0.15))), v: _c.set(0, rnd(0.2, 0.6), 0), s: rnd(0.03, 0.05), col: hi, life: 0.32, spin: 6 })); }
    });
    e.g.position.copy(last);
    const mid = this._m(e, 'paint', this.geo.rm_comet, { w: hi, b: col, order: 6 });
    const outer = this._m(e, 'add', this.geo.rm_comet, { w: hi, b: deep, s: 1, order: 7 });
    const core = this._m(e, 'add', this.geo.rm_drop, { w: 0xffffff, b: hi, s: 0, order: 8 });
    const glow = this._m(e, 'add', this.quad, { w: hi, b: col, s: 6, order: 4 });
    const shadow = this._m(e, 'alpha', this.quad, { w: deep, b: deep, s: 5, order: 2 }); this._flat(shadow, 0.55, 0);
    const rib = this._rib(trailN), ribL = this._rib(trailN); ribL.material = ribL.userData.mats[1];
    rib.material = rib.userData.mats[0];
    for (const [m, w, b] of [[rib, hi, deep], [ribL, 0xffffff, col]]) { const u = m.material.uniforms; u.uW.value.setHex(w); u.uB.value.setHex(b); u.uQ.value = rnd(0, 20); u.uA.value = 0; m.renderOrder = 5; this.root.add(m); }
    e.ribs = [rib, ribL];
    // launch: a small paint burst at the brush tip (stagefx already pops a light there)
    this.emit('drop', low ? 3 : 6, () => ({ p: last, v: _c.set(rnd(-1.2, 1.2), rnd(0.6, 2.0), rnd(-1.2, 1.2)), s: K.fleck * rnd(0.8, 1.4), col: rand() < 0.5 ? col : hi, life: 0.45, grav: 10, floor: groundY + 0.02 }));
    const handle = {
      set: (p) => { const n = P3(p); _c.copy(n).sub(last); if (_c.lengthSq() > 1e-7) vel.copy(_c).normalize(); last.copy(n); e.g.position.copy(n); },
      /** the projectile ends: on a hit the impact draws the rest; otherwise (range end / wall) the paint drips apart where it is */
      dispose: () => {
        if (dead) return; dead = true;
        if (hitAt !== this.frame) this.paintFizzle(e.g.position.clone(), { col, hi, groundY });
        this._fadeTrail(e, 0.22);
      },
      _markHit: () => { hitAt = this.frame; },
    };
    e.handle = handle; return handle;
  }
  /** keep only the ribbons of a finished projectile and let them fade (the head is gone) */
  _fadeTrail(e, d) {
    const ribs = e.ribs || [], a0 = ribs.map(r => r.material.uniforms.uA.value);
    for (const m of e.items) if (m.parent) { m.parent.remove(m); (this.pool[m.userData.kind] || (this.pool[m.userData.kind] = [])).push(m); }
    e.items.length = 0; const t0 = e.t; e.life = e.t + d;
    e.update = (e) => { const k = smooth(0, d, e.t - t0); ribs.forEach((r, i) => { r.material.uniforms.uA.value = a0[i] * (1 - k); }); };
  }
  paintFizzle(at, o) {
    const low = rmLite(), K = RMFX.paint;
    this.emit('drop', low ? 4 : 8, () => ({ p: at, v: _c.set(rnd(-1.4, 1.4), rnd(0.2, 1.6), rnd(-1.4, 1.4)), s: K.fleck * rnd(0.8, 1.5), col: rand() < 0.5 ? o.col : o.hi, life: 0.55, grav: 10, floor: o.groundY + 0.02 }));
    const e = this._fx('fizzle', 0.3, (e) => { const k = e.t / 0.3; this._face(f, 0.5 + 0.4 * easeOut(k)); f.material.uniforms.uA.value = 0.5 * (1 - k); });
    e.g.position.copy(at); const f = this._m(e, 'add', this.quad, { w: o.hi, b: o.col, s: 6 });
  }
  /** the paint comet lands on t: hit flash (RMFX.paint.flash s), wet crown splash on the body, ground shock ring, stain, drops and sparks */
  paintImpact(t, o = {}) {
    if (!this.ok() || !t || !t.pos) return null;
    for (const x of this.live) if (x.kind === 'paintComet' && x.handle && x.g.position.distanceTo(_a.set(t.pos.x, x.g.position.y, -t.pos.z)) < (t.radius || 0.5) + 1.2) x.handle._markHit();   // its dispose (same step) must not fizzle
    const K = RMFX.paint, low = rmLite(), col = o.col ?? 0x2f7cf6, hi = o.hi ?? 0x9fe8ff, deep = o.deep ?? 0x1a3fb0, I = RMFX.intensity * rawK();
    const r = t.radius || 0.5, at = P3(t.pos), gy = at.y; at.y += Math.min(1.25, 0.45 + r * 0.6);
    const dir = o.dir ? new THREE.Vector3(o.dir.x, 0, -o.dir.z).normalize() : new THREE.Vector3(0, 0, -1);
    const front = at.clone().addScaledVector(dir, -r * 0.7);
    const crR = r + 0.25, life = Math.max(K.stainLife, K.crownLife, 0.6), ringR = Math.min(K.ring, 0.7 + r * 0.9);
    const e = this._fx('paintImpact', life, (e) => {
      const tt = e.t;
      // centre: the short white flash (0 -> peak 0.02 s -> gone by K.flash) + a softer coloured core that lasts a little longer
      this._face(fl, K.flashSize * (0.55 + 0.6 * easeOut(tt / 0.04))); fl.rotateZ(0.35); fl.material.uniforms.uA.value = I * 1.4 * (1 - smooth(0.015, K.flash, tt));
      this._face(gw, 1.1 * (0.6 + 0.6 * easeOut(tt / 0.12))); gw.material.uniforms.uA.value = I * 0.7 * (1 - smooth(0.04, 0.26, tt));
      // mid: wet crown of paint opening on the body (alpha, lit tips), eroding from the tips
      const kc = tt / K.crownLife, cw = crR * (0.55 + 0.6 * easeOut(kc * 2.2)); crown.scale.set(cw, K.crown * (0.2 + 0.95 * easeOut(kc * 2.6)), cw);
      crown.material.uniforms.uA.value = 0.95 * (1 - smooth(0.7, 1, kc)); crown.material.uniforms.uE.value = 1.25 - 1.3 * smooth(0.35, 1, kc);
      crownL.scale.copy(crown.scale).multiplyScalar(1.05); crownL.material.uniforms.uA.value = I * 0.35 * (1 - smooth(0.15, 0.55, kc)); crownL.material.uniforms.uE.value = crown.material.uniforms.uE.value;
      // ground: thin shock ring racing out (0.03 -> ringLife) + the paint stain that stays and erodes
      const kr = (tt - 0.02) / K.ringLife; ring.visible = kr > 0 && kr < 1; ring.scale.set(ringR * (0.25 + 0.75 * easeOut(kr)), 1, ringR * (0.25 + 0.75 * easeOut(kr))); ring.material.uniforms.uA.value = I * 1.1 * (1 - smooth(0.45, 1, kr)); ring.material.uniforms.uT.value = tt;
      const ks = tt / K.stainLife; stain.scale.set(K.stain * (0.4 + 0.6 * easeOut(tt / 0.14)), K.stain * (0.4 + 0.6 * easeOut(tt / 0.14)), 1); stain.material.uniforms.uA.value = 0.8 * smooth(0.02, 0.08, tt); stain.material.uniforms.uE.value = 1.6 - 1.7 * smooth(0.45, 1, ks);
    });
    e.g.position.copy(front);
    const fl = this._m(e, 'add', this.quad, { w: 0xffffff, b: hi, s: 4, order: 9 });
    const gw = this._m(e, 'add', this.quad, { w: hi, b: col, s: 6, order: 8 });
    const crown = this._m(e, 'alpha', this.geo.rm_crown, { w: hi, b: col, s: 2, order: 6 });
    const crownL = this._m(e, 'add', this.geo.rm_crown, { w: 0xffffff, b: hi, s: 2, order: 7 });
    // the crown rises from the ground round the target's feet (never a disc in front of its body), leaning a little back along the flight
    _q.setFromUnitVectors(UP, _a.copy(dir).multiplyScalar(-0.25).add(UP).normalize()); crown.quaternion.copy(_q); crownL.quaternion.copy(_q);
    crown.position.set(at.x - front.x, gy - front.y + 0.02, at.z - front.z); crownL.position.copy(crown.position);
    const ring = this._m(e, 'add', this.geo.rm_ring, { w: 0xffffff, b: hi, s: 3, order: 4 }); ring.position.set(at.x - front.x, gy - front.y + 0.06, at.z - front.z);
    const stain = this._m(e, 'alpha', this.quad, { w: hi, b: col, s: 5, order: 2 }); this._flat(stain, K.stain, gy - front.y + 0.04); stain.position.x = at.x - front.x; stain.position.z = at.z - front.z;
    // outer: drops thrown back along the flight + white spark streaks + a few stars
    const nD = low ? Math.round(K.drops * RMFX.liteK) : K.drops, nS = low ? Math.round(K.sparks * RMFX.liteK) : K.sparks, cols = [col, hi, col, 0xffd22e, 0xf03a44];
    this.emit('drop', nD, (i) => { const a = rnd(0, Math.PI * 2), sp = rnd(1.4, 3.2); _b.set(Math.cos(a), 0, Math.sin(a)).addScaledVector(dir, -1.1).normalize();
      return { p: front, v: _c.copy(_b).multiplyScalar(sp).setY(rnd(1.2, 3.4)), s: K.fleck * rnd(0.9, 1.8), col: cols[i % (low ? 2 : 5)], life: rnd(0.5, 0.8), grav: 11, floor: gy + 0.02 }; });
    this.emit('streak', nS, () => { const a = rnd(0, Math.PI * 2); _b.set(Math.cos(a), rnd(-0.2, 0.9), Math.sin(a)).addScaledVector(dir, -0.6).normalize();
      return { p: front, v: _c.copy(_b).multiplyScalar(rnd(4, 7)), s: rnd(0.05, 0.08), col: hi, life: rnd(0.14, 0.22), drag: 7, stretch: 0.09 }; });
    if (!low) this.emit('star', 4, () => ({ p: _a.copy(front).add(_b.set(rnd(-0.3, 0.3), rnd(-0.1, 0.4), rnd(-0.3, 0.3))), v: _c.set(rnd(-0.4, 0.4), rnd(0.6, 1.3), rnd(-0.4, 0.4)), s: rnd(0.05, 0.09), col: 0xffffff, life: rnd(0.45, 0.7), spin: 5, t: -rnd(0.05, 0.2) }));
    return e;
  }

  // ================================================================== 검기 층 (견습생 '연' nv_a2 — yeonfx.js가 자기 반달 그룹에 붙임)
  /** pooled layer mesh outside an effect (the caller owns the parent) */
  _take(kind, geo, o) { const e = { items: [], g: { add() {} } }; const m = this._m(e, kind, geo, o); return m; }
  _give(m) { if (!m) return; if (m.parent) m.parent.remove(m); (this.pool[m.userData.kind] || (this.pool[m.userData.kind] = [])).push(m); }
  /** three layers of a 3D crescent (rm_cres / rm_cres_big) added to `parent` (yeonfx strike arc group: radius 1, swing from +X side):
   *  halo (wide soft, additive) / body (alpha: readable on a bright floor) / core (thin white-hot cutting edge, additive) */
  bladeLayers(parent, o = {}) {
    if (!this.ready) return null;
    const geo = o.fin ? this.geo.rm_cres_big : this.geo.rm_cres, c1 = o.c1 ?? 0x78dfff, c2 = o.c2 ?? 0x8a65ff;
    const halo = this._take('add', geo, { w: c1, b: c2, s: 9, order: 8 }), body = this._take('alpha', geo, { w: c1, b: c2, s: 8, order: 9 }), core = this._take('add', geo, { w: 0xffffff, b: 0xffffff, s: 7, order: 10 });
    for (const m of [halo, body, core]) { m.material.depthTest = false; parent.add(m); }
    halo.scale.set(1.07, 1, 1.07); body.scale.set(1, 1, 1);
    return { halo, body, core, fin: !!o.fin };
  }
  /** per frame: head 0..1 along the swing, tail length, fade 0..1, k = intensity */
  bladeSet(L, head, tail, fade, k = 1) {
    if (!L) return; const I = RMFX.intensity * rawK() * k;
    for (const [m, a] of [[L.halo, 1.1 * I], [L.body, 0.85], [L.core, 2.0 * I]]) { const u = m.material.uniforms; u.uE.value = head; u.uT.value = Math.max(0.001, tail); u.uA.value = a * fade; m.visible = fade > 0.003; }
    // sparkle dust shed from the moving head of the blade (the outer cutting edge), while it sweeps
    const par = L.core.parent;
    if (par && head > 0.04 && head < 0.99 && fade > 0.3 && (L.n++ % (L.lite ? 3 : 1)) === 0) {
      const a = (L.a0 + (L.a1 - L.a0) * head) * Math.PI / 180, p = par.localToWorld(_a.set(Math.sin(a) * 0.96, 0, Math.cos(a) * 0.96));
      this.emit('star', 1, () => ({ p, v: _c.set(rnd(-0.5, 0.5), rnd(0.2, 1.1), rnd(-0.5, 0.5)), s: rnd(0.035, 0.06), col: rand() < 0.5 ? 0xffffff : L.c1, life: rnd(0.25, 0.4), spin: 7, drag: 2 }));
      if (L.fin || !L.lite) this.emit('streak', 1, () => ({ p, v: _c.set(rnd(-1, 1), rnd(0, 1.5), rnd(-1, 1)), s: 0.04, col: L.c1, life: 0.14, drag: 6, stretch: 0.12 }));
    }
  }
  bladeFree(L) { if (!L) return; this._give(L.halo); this._give(L.body); this._give(L.core); }
  /** a sword hit: white streak sparks thrown along the cut + stars; the finisher adds a ground shock ring pair and a flat crescent wave
   *  running forward on the ground (all at the real target, never wider than ~1.6 m) */
  slashHit(pos, o = {}) {
    if (!this.ok()) return null;
    const low = rmLite(), fin = !!o.fin, c1 = o.c1 ?? 0x78dfff, c2 = o.c2 ?? 0x8a65ff, at = P3(pos), gy = o.groundY != null ? o.groundY : at.y - 0.85, I = RMFX.intensity * rawK();
    const f = o.dir ? new THREE.Vector3(o.dir.x, 0, -o.dir.z).normalize() : new THREE.Vector3(0, 0, -1), tan = o.tan || new THREE.Vector3(-f.z, 0, f.x);
    const nS = Math.round((fin ? 12 : 5) * (low ? RMFX.liteK : 1));
    this.emit('streak', nS, () => { _b.copy(tan).multiplyScalar(rand() < 0.7 ? 1 : -1).addScaledVector(f, rnd(0.2, 0.9)).add(_c.set(rnd(-0.3, 0.3), rnd(-0.1, 0.8), rnd(-0.3, 0.3))).normalize();
      return { p: at, v: _b.multiplyScalar(rnd(5, 9) * (fin ? 1.2 : 1)), s: rnd(0.045, 0.07), col: rand() < 0.5 ? 0xffffff : c1, life: rnd(0.12, 0.2), drag: 8, stretch: 0.08 }; });
    if (!fin) return null;
    if (!low) this.emit('star', 5, () => ({ p: _a.copy(at).add(_b.set(rnd(-0.4, 0.4), rnd(-0.2, 0.5), rnd(-0.4, 0.4))), v: _c.set(rnd(-0.5, 0.5), rnd(0.8, 1.6), rnd(-0.5, 0.5)), s: rnd(0.06, 0.1), col: rand() < 0.5 ? 0xffffff : c1, life: rnd(0.5, 0.75), spin: 6, t: -rnd(0, 0.15) }));
    const R = Math.min(1.7, o.r ?? 1.5), life = 0.55;
    const e = this._fx('slashFin', life, (e) => { const t = e.t;
      const k1 = (t - 0.0) / 0.24, k2 = (t - 0.07) / 0.3;
      r1.visible = k1 > 0 && k1 < 1; r1.scale.set(R * (0.2 + 0.8 * easeOut(k1)), 1, R * (0.2 + 0.8 * easeOut(k1))); r1.material.uniforms.uA.value = I * 1.2 * (1 - smooth(0.4, 1, k1)); r1.material.uniforms.uT.value = t;
      r2.visible = k2 > 0 && k2 < 1; r2.scale.set(R * 0.75 * (0.2 + 0.8 * easeOut(k2)), 1, R * 0.75 * (0.2 + 0.8 * easeOut(k2))); r2.material.uniforms.uA.value = I * 0.8 * (1 - smooth(0.3, 1, k2));
      // flat crescent wave sliding forward along the ground (head sweeps across, then it fades)
      const kw = t / 0.32; wave.position.copy(_a.copy(f).multiplyScalar(0.35 + 0.9 * easeOut(kw))).setY(gy - at.y + 0.08); const ws = R * (0.6 + 0.5 * easeOut(kw)); wave.scale.set(ws, ws, ws);
      wave.material.uniforms.uE.value = 0.2 + 1.0 * easeOut(kw * 1.6); wave.material.uniforms.uT.value = 1.2; wave.material.uniforms.uA.value = I * 1.1 * (1 - smooth(0.5, 1, kw)); wave.visible = kw < 1;
      waveB.position.copy(wave.position); waveB.scale.copy(wave.scale); waveB.material.uniforms.uE.value = wave.material.uniforms.uE.value; waveB.material.uniforms.uT.value = 1.2; waveB.material.uniforms.uA.value = 0.6 * (1 - smooth(0.4, 1, kw)); waveB.visible = wave.visible;
    });
    e.g.position.copy(at);
    const r1 = this._m(e, 'add', this.geo.rm_ring, { w: 0xffffff, b: c1, s: 3, order: 4 }), r2 = this._m(e, 'add', this.geo.rm_ring, { w: c1, b: c2, s: 3, order: 4 });
    r1.position.y = gy - at.y + 0.06; r2.position.y = gy - at.y + 0.07;
    const wave = this._m(e, 'add', this.geo.rm_cres_big, { w: 0xffffff, b: c1, s: 7, order: 5 }), waveB = this._m(e, 'alpha', this.geo.rm_cres_big, { w: 0xffffff, b: c1, s: 8, order: 4 });
    _q.setFromUnitVectors(_c.set(0, 0, 1), f); wave.quaternion.copy(_q); waveB.quaternion.copy(_q);
    return e;
  }

  // ================================================================== 공용 빛 궤적 + 명중 (빗 투척·스타카토 등 — 직업 모듈의 투사체 메시는 그대로 두고 둘레에 덧그림)
  /** tracer around an existing projectile: additive halo + light ribbon + sparkle dust; handle {set(pos), hit(), dispose()} */
  tracer(pos, o = {}) {
    if (!this.ok()) return null;
    const low = rmLite(), col = o.col ?? 0xff9ad0, hi = o.hi ?? 0xffffff, I = RMFX.intensity * rawK(), N = low ? 9 : (o.trail || 14), w = o.w || 0.3;
    const last = P3(pos), pts = []; let dT = 0, dead = false, hitAt = -1;
    const e = this._fx('tracer', 6, (e, dt) => {
      const born = smooth(0, 0.05, e.t), pul = 1 + 0.12 * Math.sin(e.t * 28);
      this._face(gl, (o.glow || 0.75) * pul); gl.material.uniforms.uA.value = I * 0.55 * born;
      pts.push(e.g.position.clone()); if (pts.length > N) pts.shift();
      this._ribFill(rib, pts, (k) => w * 0.55 * Math.pow(k, 0.9)); rib.material.uniforms.uA.value = I * 1.1 * born;
      this._ribFill(ribP, pts, (k) => w * Math.pow(k, 0.7)); ribP.material.uniforms.uA.value = 0.85 * born;
      dT -= dt; if (dT <= 0) { dT = low ? 0.05 : 0.025; const P = e.g.position;
        this.emit('star', 1, () => ({ p: _a.copy(P).add(_b.set(rnd(-0.12, 0.12), rnd(-0.1, 0.1), rnd(-0.12, 0.12))), v: _c.set(rnd(-0.3, 0.3), rnd(0.2, 0.8), rnd(-0.3, 0.3)), s: rnd(0.03, 0.055), col: rand() < 0.5 ? hi : col, life: 0.32, spin: 7 })); }
    });
    e.g.position.copy(last);
    const gl = this._m(e, 'add', this.quad, { w: hi, b: col, s: 6, order: 4 });
    const rib = this._rib(N), ribP = this._rib(N); rib.material = rib.userData.mats[1]; ribP.material = ribP.userData.mats[0];   // additive light core over a coloured (alpha) ribbon — readable on a bright floor
    for (const [m, a, b, o2] of [[ribP, o.light ?? col, col, 4], [rib, hi, col, 5]]) { const u = m.material.uniforms; u.uW.value.setHex(a); u.uB.value.setHex(b); u.uQ.value = rnd(0, 20); u.uA.value = 0; m.renderOrder = o2; this.root.add(m); }
    e.ribs = [ribP, rib];
    e.handle = { set: (p) => { last.copy(P3(p)); e.g.position.copy(last); }, _markHit: () => { hitAt = this.frame; },
      dispose: () => { if (dead) return; dead = true; if (hitAt !== this.frame) this.emit('star', low ? 3 : 6, () => ({ p: e.g.position, v: _c.set(rnd(-1, 1), rnd(0.2, 1.4), rnd(-1, 1)), s: rnd(0.03, 0.05), col, life: 0.4, spin: 5 })); this._fadeTrail(e, 0.2); } };
    return e.handle;
  }
  /** generic layered hit: 0.05 s white star flash + coloured glow core + thin ground shock ring + spark streaks + stars (t = actor) */
  burstOn(t, o = {}) {
    if (!this.ok() || !t || !t.pos) return null;
    for (const x of this.live) if (x.kind === 'tracer' && x.handle && x.g.position.distanceTo(_a.set(t.pos.x, x.g.position.y, -t.pos.z)) < (t.radius || 0.5) + 1.2) x.handle._markHit();
    const low = rmLite(), col = o.col ?? 0xff9ad0, hi = o.hi ?? 0xffffff, I = RMFX.intensity * rawK(), r = t.radius || 0.5, at = P3(t.pos), gy = at.y; at.y += Math.min(1.25, 0.45 + r * 0.6);
    const dir = o.dir ? new THREE.Vector3(o.dir.x, 0, -o.dir.z).normalize() : new THREE.Vector3(0, 0, -1), front = at.clone().addScaledVector(dir, -r * 0.6), sz = o.size || 1, R = Math.min(1.3, 0.6 + r * 0.9) * sz;
    const e = this._fx('burstOn', 0.5, (e) => { const tt = e.t;
      this._face(fl, 1.0 * sz * (0.55 + 0.6 * easeOut(tt / 0.035))); fl.rotateZ(0.6); fl.material.uniforms.uA.value = I * 1.35 * (1 - smooth(0.015, 0.06, tt));
      this._face(gw, 0.9 * sz * (0.6 + 0.6 * easeOut(tt / 0.1))); gw.material.uniforms.uA.value = I * 0.65 * (1 - smooth(0.04, 0.24, tt));
      const kr = (tt - 0.015) / 0.25; ring.visible = kr > 0 && kr < 1; ring.scale.set(R * (0.25 + 0.75 * easeOut(kr)), 1, R * (0.25 + 0.75 * easeOut(kr))); ring.material.uniforms.uA.value = I * (1 - smooth(0.45, 1, kr)); ring.material.uniforms.uT.value = tt;
    });
    e.g.position.copy(front);
    const fl = this._m(e, 'add', this.quad, { w: 0xffffff, b: hi, s: 4, order: 9 }), gw = this._m(e, 'add', this.quad, { w: hi, b: col, s: 6, order: 8 });
    const ring = this._m(e, 'add', this.geo.rm_ring, { w: hi, b: col, s: 3, order: 4 }); ring.position.set(at.x - front.x, gy - front.y + 0.06, at.z - front.z);
    this.emit('streak', Math.round((o.sparks || 6) * (low ? RMFX.liteK : 1)), () => { const a = rnd(0, Math.PI * 2); _b.set(Math.cos(a), rnd(-0.1, 0.9), Math.sin(a)).addScaledVector(dir, -0.7).normalize();
      return { p: front, v: _c.copy(_b).multiplyScalar(rnd(4, 7)), s: rnd(0.045, 0.07), col: rand() < 0.5 ? hi : col, life: rnd(0.12, 0.2), drag: 7, stretch: 0.09 }; });
    if (!low) this.emit('star', 4, () => ({ p: _a.copy(front).add(_b.set(rnd(-0.3, 0.3), rnd(-0.1, 0.4), rnd(-0.3, 0.3))), v: _c.set(rnd(-0.4, 0.4), rnd(0.6, 1.2), rnd(-0.4, 0.4)), s: rnd(0.05, 0.08), col: rand() < 0.5 ? 0xffffff : col, life: rnd(0.4, 0.6), spin: 5, t: -rnd(0.03, 0.15) }));
    return e;
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    this.frame++;
    const G = window.G, cam = G && G.render && G.render.cam;
    if (cam) { this.camQ.copy(cam.quaternion); this.camPos.copy(cam.position); }
    for (const e of this.live) { if (e.dead) continue; e.t += dt; try { e.update(e, dt); } catch (err) { console.warn('rmfx', e.kind, err); e.t = e.life; } if (e.t >= e.life) this._free(e); }
    this.live = this.live.filter(e => !e.dead);
    if (this.parts) for (const k in this.parts) this.parts[k].update(dt);
  }
  _free(e) {
    if (e.dead) return; e.dead = true; this.root.remove(e.g);
    for (const r of e.ribs || []) { this.root.remove(r); r.material = r.userData.mats[0]; this.ribs.push(r); } e.ribs = null;
    for (const m of e.items) { if (m.parent) m.parent.remove(m); (this.pool[m.userData.kind] || (this.pool[m.userData.kind] = [])).push(m); } e.items.length = 0;
  }
  clear() { for (const e of this.live) this._free(e); this.live = []; if (this.parts) for (const k in this.parts) this.parts[k].clear(); }
  /** live effects + live particles (tests: nothing may stay behind) */
  stats() { let p = 0; if (this.parts) for (const k in this.parts) p += this.parts[k].list.length; return { live: this.live.length, parts: p }; }
}
