// 요리사 1차 스킬 이펙트 (2026-11-13): 식칼 썰기 ck1_a1 · 팬 강타 ck1_a2 · 미트볼 던지기 ck1_b1.
// Meshes from tools/blender/fx_cook.py -> assets/fx/fx_cook.glb.json (vertex colours, no textures):
//   cook_knife (cleaver, edge y 0 down, length along x) / cook_pan (bottom y 0, rim radius 1, handle +x) / cook_meatball (radius 1)
//   cook_chip_a/b/c (carrot coin, green wedge, white cube) / cook_star (5-point, radius 1)
// Light sprites (flash, thin ring, slice line, puff) are drawn by one small procedural shader on a unit quad — no atlas.
// Kinds (js/skillrt.js FX.cook(kind, a, o)); every bright layer peaks on the real damage tick and nothing is drawn wider than
// the thing really hit (single target: the target's own footprint; meatball: its real blast radius):
//   knife(pc, {tgt, n, gap, first})   큰 식칼이 대상 머리 위에 나타나 `first` s 뒤부터 gap 간격으로 n번 내려 썬다(움직임만).
//                                      handle.strike(t, h, last) = 그 타의 실제 피해 순간(썬 자국 + 작은 섬광 + 튀는 조각), .miss() = 벨 대상이 없음 -> 칼이 물러남
//   pan(pc, {tgt, fall})               큰 프라이팬이 대상 위 공중에 나타나 fall s 뒤에 떨어짐. handle.land(t | null) = 실제 타격(고리·섬광·먼지·별) / 빗나감(옅은 먼지)
//   stun(t, {dur})                     기절 표시: 머리 위를 도는 별 3개, 기절이 풀리거나 대상이 죽으면 바로 사라짐
//   proj(pos, {})                      미트볼 하나(회전 + 짧은 김 꼬리); handle {set(pos, dir), dispose()}
//   splat(pos, {r, hit, top})          미트볼이 터짐: 작은 소스 섬광 + 얇은 고리(실제 반경 r) + 튀는 조각 + 낮은 김
// 2026-11-13 남은 스킬 (이름 그대로 보이는 큰 주방 도구·음식; 모두 handle.hit(ok) = 실제 피해 순간):
//   flip(pc, {tgt, lead})              뒤집기: 큰 뒤집개가 대상 발밑으로 미끄러져 들어가 lead s 뒤 퍼 올림. hit([t]) -> 섬광·고리, 몸은 CreatureBody.toss 로 한 바퀴
//   board(pc, {dur})                   도마 방어: 큰 도마가 정면에 세워져 따라다님. blocked(pc) = 정면 피해를 실제로 줄인 순간(칼자국 + 불티 + 밀림)
//   soup(pc, {facing, r, ang, lead})   뜨거운 국물: 큰 국자가 휘둘러지고 hit 때 실제 부채꼴(r, ang) 안으로 국물 물결·방울·김
//   pepper(pc, {aim, r, lead})         후추 뿌리기: 큰 후추통이 조준점 위에서 흔들림. hit(ok) -> 반경 r 안 후춧가루·옅은 먼지, 맞은 적 '에취!'
//   sack(pc, {aim, lead}) + flour(pos, {r, dur, pre})  밀가루 구름: 포대가 떨어져 터지고(흰 연기 한 번) 낮게 깔린 옅은 가루 + 얇은 테두리(적·경고를 가리지 않음)
//   skewer(pc, {facing, len, lead})    꼬치 찌르기: 큰 꼬치가 실제 직선(len)만큼 찔러 나감. hit(ok) -> 대상마다 관통 섬광·조각
//   eat(pc, {kind})  made(pc, {kind})  도시락·수프·한 끼·간식: 음식이 머리 위에 나타나 한 입씩 줄어듦 / 제작 완성 반짝임
// Tripo 소품(tools/blender/fx_cook_tripo.py -> fx_cook_tripo.glb.json: 도시락·수프·한 끼·쿠키·후추통·포대·꼬치)이 있으면 절차 메시 대신 씀.
// Pooled meshes (one material each); cleared on zone change. Low spec (phone / 그래픽 효과 끔): fewer chips, puffs and stars —
// the knife, the pan, the slice line, the ring and the flash stay. No global bloom / exposure / hit-stop is touched here.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const COOK = {
  intensity: 1.0,
  knife: { len: 1.25, hover: 0.85, dip: 0.22, yaw: 0.6, appear: 0.1, leave: 0.22, rock: 0.22, slide: 0.16, flash: 1.5, line: 2.6, lineW: 0.62, lineLife: 0.18, chips: 4, chipsLite: 2, chip: [0.15, 0.24] },
  pan: { height: 3.0, rest: 0.56, rMin: 0.85, rMax: 1.5, pad: 0.4, appear: 0.12, dropPart: 0.42, stay: 0.05, fade: 0.17, lift: 0.9, seeThrough: 0.5, ring: 2.0, ringLife: 0.28, flash: 1.0, flashT: 0.06, stars: 5, starsLite: 3 },
  stun: { n: 3, r: 0.42, lift: 0.28, size: 0.24, spin: 5.0 },
  ball: { r: 0.2, spin: 11 },
  splat: { life: 0.42, ring: 0.85, flash: 1.3, bits: 5, bitsLite: 2 },
  flip: { stop: 0.06, kick: [0.09, 0.1], h: 1.5, ring: 1.8, flash: 1.3 },
  board: { w: 1.0, fwd: 0.62, marks: 6, push: 0.1, spark: 1.4 },
  soup: { ladle: 1.15, wave: 0.16, lift: 0.55, drops: 9, dropsLite: 4, steam: 6, steamLite: 2, kick: [0.05, 0.08], a: 0.95 },
  pepper: { h: 2.3, back: 0.9, size: 1.3, puffs: 5, puffsLite: 2, a: 0.42 },
  flour: { size: 0.95, burst: 8, burstLite: 4, haze: 0.2, ring: 0.5, wisps: 5, wispsLite: 2 },
  skewer: { stop: 0.05, kick: [0.07, 0.09], y: 0.85, flash: 1.3, line: 1.6 },
  eat: { y: 2.55, size: 0.85, bites: 3, gap: 0.2 },
  col: { soup: 0xff9a2a, soupB: 0xd8560a, soupHi: 0xffe08a, pepper1: 0x4a3626, pepper2: 0x9a8468, flour1: 0xffffff, flour2: 0xe6dcc8, wood: 0xe0b070, steel: 0xeaf4ff, steelB: 0xa8cfff, gold: 0xffd27a, goldB: 0xff9a2a, warm: 0xfff0d0, sauce: 0xff6a2a, sauceB: 0xb83210, dust1: 0xd8c8a8, dust2: 0x7a6a58, steam1: 0xfff4e6, steam2: 0xb89880 },
};

const P3 = (p) => new THREE.Vector3(p.x, p.y || 0, -p.z);
const lite = () => { const G = window.G; return !!(G && ((G.input && G.input.mobile) || (G.settings && G.settings.graphicsFx === false))); };
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const rnd = (a, b) => a + Math.random() * (b - a);
const UP = new THREE.Vector3(0, 1, 0);
/** top of a target above its feet (same idea as bashfx bashImpact: grows with the footprint, capped) */
export const cookTop = (t) => Math.min(1.7, 0.75 + (t.radius || 0.5) * 0.9);

const SOLID_VS = `
attribute vec3 color; varying vec3 vC, vN, vV;
void main(){ vC = color; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const SOLID_FS = `
uniform vec3 uTint, uRim; uniform float uA, uGlow, uSpec;
varying vec3 vC, vN, vV;
void main(){
  vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
  vec3 L = normalize(vec3(-.4, .8, .5));
  float d = max(0., dot(n, L)), rim = pow(1. - max(0., dot(n, vV)), 2.5);
  vec3 base = vC * uTint;
  vec3 c = base * (.46 + .74 * d) + uRim * rim * .55;
  vec3 h = reflect(-L, n); c += vec3(1., .96, .86) * pow(max(0., dot(h, vV)), 24.) * uSpec;
  c += vec3(1., .97, .9) * uGlow;
  gl_FragColor = vec4(c, uA);
}`;
const TEX_VS = `
varying vec3 vN, vV; varying vec2 vUv;
void main(){ vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const TEX_FS = `
uniform sampler2D uMap; uniform vec3 uRim; uniform float uA, uGlow, uGain;
varying vec3 vN, vV; varying vec2 vUv;
void main(){
  vec3 base = texture2D(uMap, vUv).rgb * uGain, n = normalize(vN); if (!gl_FrontFacing) n = -n;
  vec3 L = normalize(vec3(-.4, .8, .5)); float d = max(0., dot(n, L)), rim = pow(1. - max(0., dot(n, vV)), 2.5);
  vec3 c = base * (.56 + .62 * d) + uRim * rim * .3 + vec3(1., .97, .9) * uGlow;
  gl_FragColor = vec4(c, uA);
}`;
const FLAT_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
// uK: 0 soft disc, 1 thin ring (uP = inner fade), 2 slice line (thin, tapered ends), 3 four-point star flash, 4 puff (alpha blended)
const SPR_FS = `
uniform vec3 uW, uB; uniform float uA, uK, uP; varying vec2 vUv;
void main(){
  vec2 p = vUv * 2. - 1.; float r = length(p), a = 0., core = 0.;
  if (uK < .5) { a = pow(clamp(1. - r, 0., 1.), 2.2); core = pow(clamp(1. - r * 1.6, 0., 1.), 2.); }
  else if (uK < 1.5) { float w = .045; a = smoothstep(1., 1. - w, r) * smoothstep(1. - w * 4.5, 1. - w, r); core = smoothstep(1. - w * 2.6, 1. - w, r) * smoothstep(1., 1. - w, r); a += uP * .16 * smoothstep(.2, .95, r) * step(r, .96); }
  else if (uK < 2.5) { float e = 1. - pow(abs(p.x), 2.4); a = clamp(e, 0., 1.) * exp(-abs(p.y) * 9.); core = clamp(e, 0., 1.) * exp(-abs(p.y) * 30.); }
  else if (uK < 3.5) { float s = exp(-abs(p.x) * 16.) * clamp(1. - abs(p.y), 0., 1.) + exp(-abs(p.y) * 16.) * clamp(1. - abs(p.x), 0., 1.); a = s + pow(clamp(1. - r, 0., 1.), 3.) * .9; core = pow(clamp(1. - r * 2.2, 0., 1.), 1.5) + s * .5; }
  else if (uK < 4.5) { a = pow(clamp(1. - r, 0., 1.), 1.4); core = clamp(.5 + p.y * .5, 0., 1.); gl_FragColor = vec4(mix(uB, uW, core), a * uA); return; }
  else if (uK < 5.5) {   // soup fan (uv.x across the cone 0..1, uv.y radius 0..1, uP = wave front): crest bright, thin trail behind, scalloped edge
    float u = vUv.x, v = vUv.y, sc = .035 * sin(u * 38.) + .02 * sin(u * 91. + 1.7), fr = uP + sc;
    float body = smoothstep(fr, fr - .05, v) * (.45 + .55 * smoothstep(fr - .6, fr - .02, v)) * smoothstep(.0, .12, v);
    float side = smoothstep(0., .1, u) * smoothstep(1., .9, u), st = .75 + .25 * sin(u * 60. + v * 9.);
    core = smoothstep(fr - .13, fr - .02, v); gl_FragColor = vec4(mix(uB, uW, core * st), body * side * uA); return; }
  else if (uK < 6.5) {   // pepper specks: dark grains scattered over a disc (uP scrolls them down / outward a little)
    vec2 q = p * 13. + vec2(0., uP * 2.); vec2 c = floor(q), f = fract(q) - .5; float h = fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453), h2 = fract(h * 91.7);
    float g = step(.62, h) * smoothstep(.34, .12, length(f - (vec2(h2, fract(h2 * 7.3)) - .5) * .5));
    gl_FragColor = vec4(mix(uB, uW, h2), g * smoothstep(1., .82, r) * uA); return; }
  else {                 // flour on the floor: soft low haze with slow blotches, strongest near the rim so the middle stays readable
    vec2 q = p * 2.6 + vec2(uP * .35, -uP * .2); float nz = .5 + .25 * sin(q.x * 2.3 + sin(q.y * 1.7)) + .25 * sin(q.y * 2.9 - q.x * 1.3);
    a = smoothstep(1., .86, r) * (.35 + .65 * smoothstep(.15, .95, r)) * (.55 + .45 * nz); gl_FragColor = vec4(mix(uB, uW, nz), a * uA); return; }
  gl_FragColor = vec4(mix(uB, uW, clamp(core, 0., 1.)) * (a * uA), 1.);
}`;
const ADD = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide };

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _mx = new THREE.Matrix4();

export class CookFx {
  constructor(root) {
    this.root = root; this.live = []; this.ready = false; this.geo = {}; this.tri = {}; this.fans = {}; this.pool = {}; this.loading = null;
    this.camQ = new THREE.Quaternion(); this.toCam = new THREE.Vector3(0, 0.7, 0.7); this.camR = new THREE.Vector3(1, 0, 0);
    this.quad = new THREE.PlaneGeometry(1, 1);
  }
  load() {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const j = await (await fetch('assets/fx/fx_cook.glb.json')).json(), raw = atob(j.b64), u8 = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
      const g = await new Promise((res, rej) => new GLTFLoader().parse(u8.buffer, '', res, rej));
      g.scene.traverse(o => { if (o.isMesh) this.geo[o.name] = o.geometry; });
      this.chips = ['cook_chip_a', 'cook_chip_b', 'cook_chip_c'].map(n => this.geo[n]).filter(Boolean);
      this.ready = true;
      try {   // optional Tripo props; without the file every prop falls back to the Blender procedural mesh
        const tj = await (await fetch('assets/fx/fx_cook_tripo.glb.json')).json(), tr = atob(tj.b64), t8 = new Uint8Array(tr.length);
        for (let i = 0; i < tr.length; i++) t8[i] = tr.charCodeAt(i);
        const tg = await new Promise((res, rej) => new GLTFLoader().parse(t8.buffer, '', res, rej));
        tg.scene.traverse(o => { if (o.isMesh && o.material && o.material.map) this.tri[o.name] = { geo: o.geometry, map: o.material.map }; });
      } catch (err) { console.warn('cookfx: no Tripo props', err && err.message); }
    })().catch(e => console.warn('cookfx load', e));
    return this.loading;
  }
  _ok() { if (!this.ready) { this.load(); return false; } return true; }
  _mat(kind) {
    const U = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v }])), C = () => new THREE.Color(1, 1, 1);
    if (kind === 'solid') return new THREE.ShaderMaterial({ uniforms: U({ uTint: C(), uRim: new THREE.Color(0xfff0d0), uA: 1, uGlow: 0, uSpec: 0.6 }), vertexShader: SOLID_VS, fragmentShader: SOLID_FS, transparent: true, depthWrite: true, side: THREE.DoubleSide });
    if (kind === 'tex') return new THREE.ShaderMaterial({ uniforms: U({ uMap: null, uRim: new THREE.Color(0xfff0d0), uA: 1, uGlow: 0, uGain: 1 }), vertexShader: TEX_VS, fragmentShader: TEX_FS, transparent: true, depthWrite: true, side: THREE.DoubleSide });
    if (kind === 'puff') return new THREE.ShaderMaterial({ uniforms: U({ uW: C(), uB: C(), uA: 0, uK: 4, uP: 0 }), vertexShader: FLAT_VS, fragmentShader: SPR_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    return new THREE.ShaderMaterial({ uniforms: U({ uW: C(), uB: C(), uA: 0, uK: 0, uP: 0 }), vertexShader: FLAT_VS, fragmentShader: SPR_FS, ...ADD });
  }
  _m(e, kind, geo, order = 4) {
    const p = this.pool[kind] || (this.pool[kind] = []); let m = p.pop();
    if (!m) { m = new THREE.Mesh(geo, this._mat(kind)); m.frustumCulled = false; m.userData.kind = kind; }
    m.geometry = geo; m.position.set(0, 0, 0); m.quaternion.identity(); m.scale.set(1, 1, 1); m.visible = true; m.renderOrder = order;
    e.items.push(m); e.g.add(m); return m;
  }
  solid(e, geo, o = {}) { const m = this._m(e, 'solid', geo, 1), u = m.material.uniforms; u.uTint.value.setHex(o.tint ?? 0xffffff); u.uRim.value.setHex(o.rim ?? 0xfff0d0); u.uA.value = o.a ?? 1; u.uGlow.value = 0; u.uSpec.value = o.spec ?? 0.6; return m; }
  /** additive sprite: k 0 disc / 1 ring / 2 slice line / 3 star flash */
  spr(e, k, w, b, order = 5) { const m = this._m(e, 'spr', this.quad, order), u = m.material.uniforms; u.uK.value = k; u.uP.value = 0; u.uW.value.setHex(w); u.uB.value.setHex(b); u.uA.value = 0; return m; }
  puff(e, w, b, order = 4) { const m = this._m(e, 'puff', this.quad, order), u = m.material.uniforms; u.uK.value = 4; u.uP.value = 0; u.uW.value.setHex(w); u.uB.value.setHex(b); u.uA.value = 0; return m; }
  /** alpha-blended flat layer: k 5 soup fan / 6 pepper specks / 7 flour floor */
  blend(e, k, geo, w, b, order = 2) { const m = this._m(e, 'puff', geo, order), u = m.material.uniforms; u.uK.value = k; u.uP.value = 0; u.uW.value.setHex(w); u.uB.value.setHex(b); u.uA.value = 0; return m; }
  /** a named prop: the Tripo model when it was loaded, else the procedural mesh. Both obey the same size rules (tools/blender/fx_cook*.py) */
  prop(e, tri, proc, o = {}) {
    const t = this.tri[tri];
    if (t) { const m = this._m(e, 'tex', t.geo, 1), u = m.material.uniforms; u.uMap.value = t.map; u.uRim.value.setHex(o.rim ?? 0xfff0d0); u.uA.value = o.a ?? 1; u.uGlow.value = 0; u.uGain.value = o.gain ?? 1.08; m.userData.tex = true; return m; }
    const m = this.solid(e, this.geo[proc], o); m.userData.tex = false; return m;
  }
  /** flat cone in the xz plane pointing along local +x, radius 1 (uv.x across, uv.y radius) */
  fan(ang) {
    const key = Math.round(ang); if (this.fans[key]) return this.fans[key];
    const N = 18, R = 6, pos = [], uv = [], idx = [], h = ang * Math.PI / 360;
    for (let j = 0; j <= R; j++) for (let i = 0; i <= N; i++) { const a = -h + 2 * h * i / N, r = j / R; pos.push(Math.cos(a) * r, 0, Math.sin(a) * r); uv.push(i / N, r); }
    for (let j = 0; j < R; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    return (this.fans[key] = g);
  }
  sfx(name) { try { const G = window.G; if (G && G.audio) G.audio.sfx(name); } catch (e) { /* no audio */ } }
  _fx(kind, life, update) { const e = { kind, g: new THREE.Group(), items: [], t: 0, life, update }; this.root.add(e.g); this.live.push(e); return e; }
  /** flat on the ground (ring): quad in the xz plane */
  _flat(m, r, y = 0.07) { m.rotation.set(-Math.PI / 2, 0, 0); m.scale.set(r * 2, r * 2, 1); m.position.y = y; return m; }

  // ------------------------------------------------------------------ small shared bursts
  /** chips / bits thrown out of a point (three coords, world), with gravity; drawn as solid little meshes */
  _bits(at, n, o = {}) {
    if (n <= 0) return;
    const parts = [], gy = o.ground ?? (at.y - 1);
    const e = this._fx('bits', o.life || 0.5, (e, dt) => {
      const k = e.t / e.life;
      for (const p of parts) { p.v.y -= 11 * dt; p.m.position.addScaledVector(p.v, dt); if (p.m.position.y < gy + 0.03) { p.m.position.y = gy + 0.03; p.v.set(p.v.x * 0.3, 0, p.v.z * 0.3); }
        p.m.rotation.x += p.w * dt; p.m.rotation.z += p.w * 0.7 * dt; p.m.material.uniforms.uA.value = 1 - smooth(0.6, 1, k); }
    });
    for (let i = 0; i < n; i++) {
      const geo = o.geo || this.chips[(Math.random() * this.chips.length) | 0], m = this.solid(e, geo, { tint: o.tint ?? 0xffffff, spec: 0.3 }), s = rnd(o.size ? o.size[0] : 0.09, o.size ? o.size[1] : 0.15), a = rnd(0, Math.PI * 2), sp = rnd(o.speed ? o.speed[0] : 1.2, o.speed ? o.speed[1] : 2.4);
      m.scale.setScalar(s); m.position.copy(at); m.rotation.set(rnd(0, 6), rnd(0, 6), rnd(0, 6));
      parts.push({ m, v: new THREE.Vector3(Math.cos(a) * sp, rnd(o.up ? o.up[0] : 1.6, o.up ? o.up[1] : 3.0), Math.sin(a) * sp), w: rnd(-14, 14) });
    }
  }
  _puffs(at, n, r, o = {}) {
    if (n <= 0) return;
    const ps = [];
    const e = this._fx('puffs', o.life || 0.45, (e) => {
      const k = e.t / e.life;
      for (const p of ps) { p.m.quaternion.copy(this.camQ); p.m.position.copy(p.p0).addScaledVector(p.d, easeOut(k) * p.run).setY(p.p0.y + k * (o.rise ?? 0.25)); p.m.scale.setScalar(p.s * (0.6 + 0.9 * easeOut(k))); p.m.material.uniforms.uA.value = (o.a ?? 0.5) * smooth(0, 0.12, k) * (1 - smooth(0.35, 1, k)); }
    });
    for (let i = 0; i < n; i++) { const a = (i + rnd(-0.3, 0.3)) / n * Math.PI * 2, m = this.puff(e, o.c1 ?? COOK.col.dust1, o.c2 ?? COOK.col.dust2);
      ps.push({ m, d: new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), p0: at.clone().add(new THREE.Vector3(Math.cos(a) * r * 0.35, 0.12, Math.sin(a) * r * 0.35)), run: r * rnd(0.35, 0.6), s: rnd(0.35, 0.6) * Math.max(0.6, r) }); }
  }

  // ------------------------------------------------------------------ 식칼 썰기
  knife(pc, o = {}) {
    if (!this._ok() || !this.geo.cook_knife) return null;
    const K = COOK.knife, n = Math.max(1, o.n || 2), gap = o.gap || 0.12, first = Math.max(0.02, o.first ?? 0.22), I = COOK.intensity;
    let tgt = o.tgt || null, ended = -1, strikes = 0;
    const f = o.facing || { x: 0, z: 1 }, anchor = tgt ? P3(tgt.pos) : P3({ x: pc.pos.x + f.x * 1.3, y: pc.pos.y || 0, z: pc.pos.z + f.z * 1.3 });
    let top = tgt ? cookTop(tgt) : 0.9, rad = tgt ? (tgt.radius || 0.5) : 0.5;
    const total = first + (n - 1) * gap;
    const e = this._fx('knife', total + K.leave + 0.05, (e) => {
      if (tgt && !tgt.dead && !tgt.removed) { anchor.copy(P3(tgt.pos)); top = cookTop(tgt); rad = tgt.radius || 0.5; }
      const p = (e.t - first - shift) / gap, done = ended >= 0 ? ended : total + shift, out = e.t > done ? clamp01((e.t - done) / K.leave) : 0;
      // chop curve: up between the ticks, down ON every tick (p integer); after the last one it lifts away
      const fr = p < -1 ? 0.5 : p - Math.floor(p), up = e.t > done ? 0.25 + 0.75 * easeOut(out) : Math.pow(Math.sin(Math.PI * fr), 0.75);
      const idx = Math.max(0, Math.min(n - 1, Math.round(p))), step = Math.min(K.slide, rad * 1.5 / n), slide = (Math.max(-0.5, Math.min(n - 0.5, p)) - (n - 1) / 2) * step;
      // blade length: turned K.yaw from the camera's right so both the flat and the edge read; the cut advances along the blade normal
      _a.copy(this.camR).applyAxisAngle(UP, K.yaw); _b.crossVectors(UP, _a).normalize();           // _a = length dir (x of the mesh), _b = normal
      kn.position.copy(anchor).addScaledVector(_b, slide); kn.position.y = anchor.y + top - K.dip + (K.hover + K.dip) * up;
      _mx.makeBasis(_a, UP, _c.crossVectors(_a, UP)); kn.quaternion.setFromRotationMatrix(_mx);
      kn.rotateZ(K.rock * (up - 0.35));                                                               // tip dips into the cut, heel lifts between cuts
      const sc = K.len * Math.min(1.25, 0.8 + rad * 0.5) * (0.5 + 0.5 * easeOut(e.t / K.appear));
      kn.scale.setScalar(sc);
      const u = kn.material.uniforms; u.uA.value = smooth(0, K.appear, e.t) * (1 - out); u.uGlow.value = Math.max(0, glow) * 0.5; glow -= 6 * (e.dt || 0.016);
      gl.quaternion.copy(this.camQ); gl.position.copy(kn.position).setY(kn.position.y + 0.12 * sc); gl.scale.setScalar(sc * 1.1); gl.material.uniforms.uA.value = I * 0.22 * smooth(0, K.appear, e.t) * (1 - out);
      void idx;
    });
    let glow = 0.6, shift = 0;   // shift: the game clock stood still for a moment (critical-hit stop) -> the chops re-lock on the real damage ticks
    const kn = this.solid(e, this.geo.cook_knife, { rim: COOK.col.steelB, spec: 1.3 }), gl = this.spr(e, 0, COOK.col.steel, COOK.col.steelB, 3);
    kn.renderOrder = 6;
    const self = this;
    e.strike = (t, h, last) => {
      if (e.dead) return; strikes++;
      const sh = e.t - first - h * gap; if (Math.abs(sh - shift) > 0.02) { shift = sh; e.life = Math.max(e.life, total + shift + K.leave + 0.05); }
      if (t && t !== tgt) { tgt = t; anchor.copy(P3(t.pos)); top = cookTop(t); rad = t.radius || 0.5; }
      glow = last ? 1.4 : 0.9;
      const at = kn.position.clone(); at.y = anchor.y + top - K.dip * 0.5;
      // slice line along the blade + a small flash on the cut, both gone in ~0.16 s; chips fly out of the cut
      const dirL = _a.copy(self.camR).applyAxisAngle(UP, K.yaw).clone(), len = K.len * (last ? 1.15 : 0.9), lf = self._fx('slice', K.lineLife + (last ? 0.06 : 0), (x) => {
        const k = x.t / x.life; ln.material.uniforms.uA.value = I * K.line * (1 - smooth(0.15, 1, k)); ln.scale.set(len * (0.7 + 0.5 * easeOut(k)), K.lineW * (last ? 1.25 : 1), 1);
        fl.quaternion.copy(self.camQ); fl.scale.setScalar((last ? 0.8 : 0.55) * (0.6 + 0.6 * easeOut(k))); fl.material.uniforms.uA.value = I * K.flash * (1 - smooth(0.05, 0.7, k));
      });
      const ln = self.spr(lf, 2, 0xffffff, COOK.col.steelB, 7), fl = self.spr(lf, 3, 0xffffff, COOK.col.steel, 7);
      lf.g.position.copy(at); self._alignLine(ln, dirL);
      self._bits(at, (lite() ? K.chipsLite : K.chips) + (last && !lite() ? 2 : 0), { ground: anchor.y, life: 0.55, size: K.chip, speed: [1.5, 2.8], up: [2.0, 3.4] });
    };
    e.miss = () => { if (ended < 0) ended = e.t; e.life = Math.min(e.life, e.t + K.leave); };
    return e;
  }
  /** quad whose local x runs along dir and whose face turns to the camera as far as it can */
  _alignLine(m, dir) { const x = _a.copy(dir).normalize(), z = _b.copy(this.toCam).addScaledVector(x, -this.toCam.dot(x)); if (z.lengthSq() < 1e-6) z.set(0, 1, 0); z.normalize(); const y = _c.crossVectors(z, x); _mx.makeBasis(x, y, z); m.quaternion.setFromRotationMatrix(_mx); }

  // ------------------------------------------------------------------ 팬 강타
  pan(pc, o = {}) {
    if (!this._ok() || !this.geo.cook_pan) return null;
    const K = COOK.pan, I = COOK.intensity, fall = Math.max(0.12, o.fall || 0.3), f = o.facing || { x: 0, z: 1 };
    let tgt = o.tgt || null, landed = -1, hitT = null;
    const anchor = tgt ? P3(tgt.pos) : P3({ x: pc.pos.x + f.x * 1.4, y: pc.pos.y || 0, z: pc.pos.z + f.z * 1.4 });
    let top = tgt ? cookTop(tgt) : 0.25; const R = Math.max(K.rMin, Math.min(K.rMax, (tgt ? tgt.radius || 0.5 : 0.5) + K.pad));
    // handle points back to the caster (it is the cook's pan)
    const hd = _a.set(pc.pos.x, 0, -pc.pos.z).sub(_b.set(anchor.x, 0, anchor.z)); if (hd.lengthSq() < 1e-4) hd.set(-f.x, 0, f.z); hd.normalize(); const yaw = Math.atan2(-hd.z, hd.x);
    const dropAt = fall * (1 - K.dropPart), hd0 = hd.clone();
    const e = this._fx('pan', fall + K.stay + K.fade + 0.2, (e) => {
      if (landed < 0 && tgt && !tgt.dead && !tgt.removed) { anchor.copy(P3(tgt.pos)); top = cookTop(tgt); }
      let y, a = 1, tilt = 0, sq = 1;
      if (landed < 0) {   // appear (scale in with a wobble), hang, then the fast drop: lowest exactly at `fall`
        const d = clamp01((e.t - dropAt) / (fall - dropAt)); y = top * K.rest + (K.height - top * K.rest) * (1 - d * d * d); a = smooth(0, K.appear, e.t); tilt = 0.32 * (1 - smooth(0, 0.8, d)) + 0.06 * Math.sin(e.t * 30) * (1 - d);
        if (e.t > fall + 0.12) { landed = e.t; hitT = null; }   // the hit never came (cast interrupted): just fade
      } else { const k = e.t - landed; y = (hitT ? top * K.rest : 0.06) + K.lift * easeOut(Math.max(0, k - K.stay * 0.5) / (K.stay + K.fade)) * (hitT ? 1 : 0.4); sq = 1 + 0.12 * Math.max(0, 1 - k / 0.08); a = (1 - (1 - K.seeThrough) * smooth(0, K.stay, k)) * (1 - smooth(K.stay, K.stay + K.fade, k)); tilt = -0.25 * easeOut(k / (K.stay + K.fade)); if (k > K.stay + K.fade) e.t = e.life; }
      pn.position.copy(anchor).setY(anchor.y + y); pn.rotation.set(0, yaw, tilt, 'YXZ'); pn.scale.set(R * sq, R / sq * (landed < 0 ? 0.5 + 0.5 * easeOut(e.t / K.appear) : 1), R * sq);
      const u = pn.material.uniforms; u.uA.value = a; u.uGlow.value = landed < 0 ? 0.35 * (1 - smooth(0, K.appear * 1.5, e.t)) : 0;
      // soft warm glow where it appears + a growing shadow-ish target ring on the ground (thin, the pan's own size)
      gl.quaternion.copy(this.camQ); gl.position.copy(pn.position); gl.scale.setScalar(R * 2.6); gl.material.uniforms.uA.value = I * 0.5 * (landed < 0 ? 1 - smooth(0, K.appear * 2.2, e.t) : 0);
      this._flat(mk, R * (landed < 0 ? 0.6 + 0.4 * smooth(0, fall, e.t) : 1)); mk.position.copy(anchor).setY(anchor.y + 0.06); mk.material.uniforms.uA.value = landed < 0 ? I * 0.55 * smooth(0, fall * 0.6, e.t) : 0;
    });
    const pn = this.solid(e, this.geo.cook_pan, { rim: COOK.col.goldB, spec: 0.9 }), gl = this.spr(e, 0, COOK.col.warm, COOK.col.goldB, 3), mk = this.spr(e, 1, COOK.col.gold, COOK.col.goldB, 3);
    pn.renderOrder = 6;
    e.land = (t) => {
      if (e.dead || landed >= 0) return; landed = e.t; hitT = t || null;
      if (t) { anchor.copy(P3(t.pos)); top = cookTop(t); }
      const g0 = anchor.clone(), hp = anchor.clone().setY(anchor.y + top * K.rest), low = lite();
      if (!t) { this._puffs(g0, low ? 2 : 4, R, { a: 0.32, life: 0.4 }); return; }
      const fx = this._fx('panhit', K.ringLife + 0.1, (x) => {
        const k = x.t / K.ringLife; this._flat(rg, R * (0.55 + 0.45 * easeOut(k))); rg.material.uniforms.uA.value = I * K.ring * (1 - smooth(0.25, 1, k));
        fl.quaternion.copy(this.camQ); fl.scale.setScalar(R * 1.05 * (0.7 + 0.5 * easeOut(x.t / K.flashT))); fl.material.uniforms.uA.value = I * K.flash * (1 - smooth(0, K.flashT * 2.2, x.t));
      });
      const rg = this.spr(fx, 1, 0xfff6dc, COOK.col.gold, 3), fl = this.spr(fx, 3, 0xffffff, COOK.col.warm, 7); rg.material.uniforms.uP.value = 1;
      fx.g.position.copy(g0); fl.position.set(hd0.x * R * 0.85, top * K.rest + 0.05, hd0.z * R * 0.85);
      this._puffs(g0, low ? 3 : 6, R, { a: 0.42, life: 0.42 });
      if (this.geo.cook_star) this._bits(hp, low ? K.starsLite : K.stars, { geo: this.geo.cook_star, size: [0.07, 0.11], speed: [1.6, 2.6], up: [2.2, 3.4], ground: anchor.y, life: 0.55 });
    };
    return e;
  }

  // ------------------------------------------------------------------ 기절 별
  stun(t, o = {}) {
    if (!this._ok() || !this.geo.cook_star || !t) return null;
    const K = COOK.stun, dur = o.dur || 3, n = K.n, stars = [];
    if (t._cookStun && !t._cookStun.dead) this._free(t._cookStun);   // refreshed: never two rings of stars on one head
    const e = this._fx('stun', dur + 0.25, (e) => {
      const gone = t.dead || t.removed || (e.t > 0.25 && !(t.status && t.status.has && t.status.has('stun')));
      if (gone && e.t < e.life - 0.2) e.life = e.t + 0.2;
      const p = P3(t.pos), top = cookTop(t), rr = K.r + (t.radius || 0.5) * 0.35, a = smooth(0, 0.15, e.t) * (1 - smooth(e.life - 0.2, e.life, e.t));
      for (let i = 0; i < n; i++) { const m = stars[i], ang = e.t * K.spin + i * Math.PI * 2 / n;
        m.position.set(p.x + Math.cos(ang) * rr, p.y + top + K.lift + Math.sin(e.t * 6 + i * 2) * 0.03, p.z + Math.sin(ang) * rr * 0.55);
        m.quaternion.copy(this.camQ); m.rotateZ(e.t * 3 + i); m.scale.setScalar(K.size * (0.85 + 0.15 * Math.sin(e.t * 8 + i))); m.material.uniforms.uA.value = a; }
    });
    for (let i = 0; i < n; i++) { const m = this.solid(e, this.geo.cook_star, { spec: 0.2, rim: 0xffffff }); m.renderOrder = 7; m.material.uniforms.uGlow.value = 0.12; stars.push(m); }
    t._cookStun = e; return e;
  }

  // ------------------------------------------------------------------ 미트볼
  proj(pos, o = {}) {
    if (!this._ok() || !this.geo.cook_meatball) return null;
    const K = COOK.ball, last = P3(pos), vel = new THREE.Vector3(0, 0, 1), ax = new THREE.Vector3(rnd(-1, 1), rnd(-0.3, 0.3), rnd(-1, 1)).normalize(), sp = K.spin * rnd(0.8, 1.2);
    const e = this._fx('proj', 6, (e) => {
      mb.quaternion.setFromAxisAngle(ax, e.t * sp); mb.material.uniforms.uA.value = smooth(0, 0.05, e.t);
      tr.quaternion.copy(this.camQ); tr.position.copy(vel).multiplyScalar(-0.24); tr.scale.setScalar(0.5); tr.material.uniforms.uA.value = 0.3 * smooth(0, 0.08, e.t);
    });
    e.g.position.copy(last);
    const mb = this.solid(e, this.geo.cook_meatball, { rim: 0xffc890, spec: 0.5 }), tr = this.puff(e, COOK.col.steam1, COOK.col.steam2, 3);
    mb.scale.setScalar(K.r);
    return { set: (p) => { const n = P3(p); _c.copy(n).sub(last); if (_c.lengthSq() > 1e-7) vel.copy(_c).normalize(); last.copy(n); e.g.position.copy(n); }, dispose: () => this._free(e) };
  }
  splat(pos, o = {}) {
    if (!this._ok()) return null;
    const K = COOK.splat, I = COOK.intensity, r = o.r || 1.2, hit = !!o.hit, low = lite(), g0 = P3(pos), y = hit ? Math.min(1.1, 0.4 + (o.top || 0.5) * 0.5) : 0.1;
    const e = this._fx('splat', K.life, (e) => {
      const k = e.t / e.life;
      this._flat(rg, r * (0.35 + 0.65 * easeOut(k * 1.6))); rg.material.uniforms.uA.value = I * K.ring * (hit ? 1 : 0.45) * (1 - smooth(0.2, 0.85, k));
      fl.quaternion.copy(this.camQ); fl.scale.setScalar((hit ? 0.9 : 0.5) * (0.6 + 0.7 * easeOut(k * 2))); fl.material.uniforms.uA.value = I * K.flash * (hit ? 1 : 0.4) * (1 - smooth(0.05, 0.5, k));
    });
    e.g.position.copy(g0);
    const rg = this.spr(e, 1, COOK.col.warm, COOK.col.sauce, 3), fl = this.spr(e, 0, COOK.col.warm, COOK.col.sauce, 6); fl.position.y = y;
    const at = g0.clone().setY(g0.y + y);
    this._bits(at, low ? K.bitsLite : K.bits, { geo: this.geo.cook_meatball, size: [0.04, 0.075], speed: [1.0, 2.2], up: [1.4, 2.6], ground: g0.y, life: 0.45 });
    this._puffs(g0.clone().setY(g0.y + y * 0.6), low ? 1 : 3, r * 0.5, { c1: COOK.col.steam1, c2: COOK.col.steam2, a: 0.3, life: 0.45, rise: 0.5 });
    return e;
  }

  // ------------------------------------------------------------------ small shared pieces (2026-11-13)
  /** star flash + thin ring at a point: the read of one real hit. o: {ring r, y, size, w, b, life} */
  _pop(g0, o = {}) {
    const I = COOK.intensity, life = o.life || 0.26, r = o.r || 0, y = o.y ?? 0.6, size = o.size || 0.8;
    const e = this._fx('pop', life, (e) => {
      const k = e.t / e.life;
      fl.quaternion.copy(this.camQ); fl.scale.setScalar(size * (0.6 + 0.6 * easeOut(k * 2))); fl.material.uniforms.uA.value = I * (o.flash ?? 1.3) * (1 - smooth(0.05, 0.6, k));
      if (rg) { this._flat(rg, r * (0.5 + 0.5 * easeOut(k * 1.4))); rg.material.uniforms.uA.value = I * (o.ring ?? 1.6) * (1 - smooth(0.25, 1, k)); }
    });
    e.g.position.copy(g0);
    const fl = this.spr(e, 3, 0xffffff, o.w ?? COOK.col.warm, 7); fl.position.y = y;
    const rg = r > 0 ? this.spr(e, 1, o.w ?? COOK.col.warm, o.b ?? COOK.col.gold, 3) : null; if (rg) rg.material.uniforms.uP.value = 0.6;
    return e;
  }
  /** game-space facing -> three direction on the ground */
  _f3(f) { return new THREE.Vector3(f.x, 0, -f.z).normalize(); }

  // ------------------------------------------------------------------ 뒤집기
  flip(pc, o = {}) {
    if (!this._ok() || !this.geo.cook_spatula) return null;
    const K = COOK.flip, lead = Math.max(0.08, o.lead || 0.25), f = this._f3(o.facing || { x: 0, z: 1 });
    let tgt = o.tgt || null, hitAt = -1, tossed = false, landed = false, okT = null;
    const anchor = tgt ? P3(tgt.pos) : P3(pc.pos).addScaledVector(f, 1.3), start = P3(pc.pos).addScaledVector(f, 0.45);
    let rad = tgt ? (tgt.radius || 0.5) : 0.5; const S = Math.max(1.5, Math.min(2.6, rad * 2.0 + 0.8)), launch = o.launch || 0.8;
    const e = this._fx('flip', lead + launch + 0.5, (e) => {
      if (hitAt < 0 && tgt && !tgt.dead && !tgt.removed) anchor.copy(P3(tgt.pos));
      const hd = _a.copy(start).sub(anchor).setY(0); if (hd.lengthSq() < 1e-4) hd.copy(f).multiplyScalar(-1); hd.normalize();
      let a = 1, rot = 0, y = 0.07, back = 0;
      if (hitAt < 0) {   // slide in low under the target: the blade is fully under it exactly at `lead`
        const k = clamp01(e.t / lead); back = (1 - easeOut(k)) * (1.0 + rad); a = smooth(0, 0.06, e.t); rot = 0.1 * (1 - k);
        if (e.t > lead + 0.15) hitAt = e.t;   // the hit never came: flip the air and leave
      } else { const k = e.t - hitAt; rot = -0.85 * easeOut(k / 0.1) + 0.2 * smooth(0.1, 0.3, k); y = 0.07 + 0.5 * easeOut(k / 0.1) * (okT ? 1 : 0.6); a = (1 - 0.35 * smooth(0, 0.06, k)) * (1 - smooth(0.08, 0.24, k));   // the scoop stands up in front of the target: see-through at once, gone by 0.24 s so the tossed body reads
        if (tossed && !landed && k >= launch * 0.92) { landed = true; if (okT && !okT.removed) { const g = P3(okT.pos); this._puffs(g, lite() ? 2 : 4, okT.radius || 0.5, { a: 0.34, life: 0.38 }); this._pop(g, { r: (okT.radius || 0.5) + 0.2, y: 0.12, size: 0.4, flash: 0.5, ring: 0.9, life: 0.22 }); } }
        if (k > 0.36 && (!tossed || landed)) e.t = e.life; }
      // blade (-x of the mesh) under the target, handle back toward the cook; the scoop turns about the handle side
      sp.position.copy(anchor).addScaledVector(hd, back + rad * 0.2 + 0.3 * S); sp.position.y = anchor.y + y;
      _mx.makeBasis(hd, UP, _c.crossVectors(hd, UP)); sp.quaternion.setFromRotationMatrix(_mx); sp.rotateZ(rot); sp.scale.setScalar(S);
      sp.material.uniforms.uA.value = a;
    });
    const sp = this.solid(e, this.geo.cook_spatula, { rim: COOK.col.steelB, spec: 1.1 }); sp.renderOrder = 5;
    e.hit = (ok) => {
      if (e.dead || hitAt >= 0) return; hitAt = e.t; okT = ok && ok[0] || null;
      if (!okT) return;
      const t = okT, g0 = P3(t.pos); anchor.copy(g0); rad = t.radius || 0.5; tossed = !!o.canToss && o.canToss(t);
      this._pop(g0, { r: rad + 0.3, y: 0.25, size: tossed ? 0.8 : 1.15, flash: K.flash * (tossed ? 1 : 1.25), ring: K.ring, w: COOK.col.warm, b: COOK.col.gold });
      this._puffs(g0, lite() ? 2 : 4, rad, { a: 0.36, life: 0.4 });
      if (!tossed && this.geo.cook_star) this._bits(g0.clone().setY(g0.y + cookTop(t) * 0.6), lite() ? 2 : 4, { geo: this.geo.cook_star, size: [0.07, 0.1], speed: [1.5, 2.4], up: [2.0, 3.0], ground: g0.y, life: 0.5 });
      e.life = Math.max(e.life, e.t + (tossed ? launch : 0) + 0.45);
    };
    return e;
  }

  // ------------------------------------------------------------------ 도마 방어
  board(pc, o = {}) {
    if (!this._ok() || !this.geo.cook_board) return null;
    const K = COOK.board, dur = o.dur || 5, I = COOK.intensity; let recoil = 0, nm = 0, ended = -1;
    if (pc._cookBoard && !pc._cookBoard.dead) this._free(pc._cookBoard);
    const e = this._fx('board', dur + 0.4, (e, dt) => {
      const gone = pc.dead || (e.t > 0.3 && !(pc.status && pc.status.has && pc.status.has('frontguard')));
      if (gone && ended < 0) { ended = e.t; e.life = Math.min(e.life, e.t + 0.3); }
      const f = this._f3(pc.facing || { x: 0, z: 1 }), p = P3(pc.pos), drop = 1 - easeOut(e.t / 0.16);
      recoil = Math.max(0, recoil - dt * 5);
      const k = recoil > 0 ? Math.sin(recoil * Math.PI) : 0;
      bd.position.copy(p).addScaledVector(f, K.fwd - K.push * k); bd.position.y = p.y + 0.12 + drop * 1.6 + 0.02 * Math.sin(e.t * 3);
      // front face (+z of the mesh) looks along the facing; leans back a little, wobbles when it takes a hit
      _c.crossVectors(UP, f).normalize(); _mx.makeBasis(_c, UP, f); bd.quaternion.setFromRotationMatrix(_mx); bd.rotateX(-0.14 - 0.12 * k); bd.rotateZ(0.05 * Math.sin(e.t * 2.1) + 0.08 * k * Math.sin(e.t * 40));
      bd.scale.setScalar(K.w);
      // between the camera and the cook -> see-through, so the character stays readable
      const front = f.dot(this.toCam), fade = ended >= 0 ? 1 - clamp01((e.t - ended) / 0.3) : 1 - smooth(dur - 0.5, dur, e.t) * 0.6;
      bd.material.uniforms.uA.value = smooth(0, 0.08, e.t) * fade * (front > 0.15 ? 0.55 : 0.96); bd.material.uniforms.uGlow.value = 0.25 * k;
      for (const mk of marks) mk.material.uniforms.uA.value = bd.material.uniforms.uA.value;
    });
    const bd = this.solid(e, this.geo.cook_board, { rim: 0xffe6b0, spec: 0.25 }), marks = []; bd.renderOrder = 5; bd.material.depthWrite = false;
    this._puffs(P3(pc.pos).addScaledVector(this._f3(pc.facing || { x: 0, z: 1 }), K.fwd), lite() ? 2 : 3, 0.6, { a: 0.3, life: 0.35 });
    e.block = () => {
      if (e.dead || ended >= 0) return; recoil = 1;
      // a knife mark stays on the face (up to K.marks), a short spark where it landed
      const x = rnd(-0.3, 0.3), y = rnd(0.35, 0.95), rot = rnd(-1.0, 1.0);
      if (nm < K.marks) { const cut = this.solid(e, this.geo.cook_chip_c, { tint: 0x2a1608, spec: 0 }); bd.add(cut); cut.position.set(x, y, 0.05); cut.rotation.set(0, 0, rot); cut.scale.set(rnd(0.5, 0.8), 0.035, 0.02); cut.renderOrder = 6; marks.push(cut); nm++; }
      const w = bd.localToWorld(new THREE.Vector3(x, y, 0.08));
      const fx = this._fx('boardhit', 0.2, (q) => { const k = q.t / q.life; fl.quaternion.copy(this.camQ); fl.scale.setScalar(0.55 * (0.6 + 0.7 * easeOut(k))); fl.material.uniforms.uA.value = I * K.spark * (1 - smooth(0.05, 0.8, k)); this._alignLine(ln, _a.set(Math.cos(rot), Math.sin(rot), 0).applyQuaternion(bd.quaternion)); ln.scale.set(0.7 * (0.6 + 0.6 * easeOut(k)), 0.3, 1); ln.material.uniforms.uA.value = I * 1.6 * (1 - smooth(0.1, 1, k)); });
      fx.g.position.copy(w); const fl = this.spr(fx, 3, 0xffffff, COOK.col.gold, 7), ln = this.spr(fx, 2, 0xffffff, COOK.col.steelB, 7);
      this._bits(w, lite() ? 1 : 3, { geo: this.geo.cook_chip_c, tint: COOK.col.wood, size: [0.03, 0.06], speed: [1.0, 2.0], up: [1.0, 2.2], ground: P3(pc.pos).y, life: 0.4 });
      this.sfx('ck_board');
    };
    this.sfx('ck_board'); pc._cookBoard = e; return e;
  }
  /** actors.js: the front guard really reduced a hit */
  blocked(pc) { const b = pc && pc._cookBoard; if (b && !b.dead && b.block) { if (pc._cookBlockT && performance.now() - pc._cookBlockT < 90) return; pc._cookBlockT = performance.now(); b.block(); } }

  // ------------------------------------------------------------------ 뜨거운 국물
  soup(pc, o = {}) {
    if (!this._ok() || !this.geo.cook_ladle) return null;
    const K = COOK.soup, I = COOK.intensity, lead = Math.max(0.08, o.lead || 0.17), f = this._f3(o.facing || { x: 0, z: 1 }), r = o.r || 3.2, ang = o.ang || 60, low = lite();
    const p0 = P3(pc.pos), right = new THREE.Vector3().crossVectors(f, UP).normalize(), piv = p0.clone().addScaledVector(right, 0.35).setY(p0.y + 1.75); let thrown = -1;
    const e = this._fx('soup', lead + 0.75, (e) => {
      // the ladle swings from low behind the cook up and over to the front; the soup leaves it at `lead`
      const k = e.t / lead, a = -1.0 + (k < 1 ? 1.75 * k * k : 1.75 + 0.5 * easeOut((e.t - lead) / 0.2)), L = K.ladle;
      _a.copy(f).multiplyScalar(Math.sin(a)).addScaledVector(UP, -Math.cos(a));                    // from the pivot to the bowl
      ld.position.copy(piv).addScaledVector(_a, L);
      _b.copy(_a).multiplyScalar(-1); _c.crossVectors(right, _b).normalize(); _mx.makeBasis(right, _b, _c); ld.quaternion.setFromRotationMatrix(_mx);
      ld.scale.setScalar(L / 1.5 * 1.25); ld.material.uniforms.uA.value = smooth(0, 0.05, e.t) * (1 - smooth(lead + 0.12, lead + 0.34, e.t));
      if (thrown >= 0) {
        const t = e.t - thrown, kk = clamp01(t / K.wave);
        fn.material.uniforms.uP.value = 0.12 + 0.92 * easeOut(kk); fn.material.uniforms.uA.value = K.a * (1 - smooth(K.wave * 0.9, K.wave + 0.3, t));
        fn.position.y = p0.y + 0.07 + K.lift * (1 - kk) * (1 - kk);   // the sheet leaves the ladle at waist height and falls flat as it spreads
      } else if (e.t > lead + 0.1) thrown = e.t;
    });
    const ld = this.solid(e, this.geo.cook_ladle, { rim: COOK.col.steelB, spec: 1.1 }); ld.renderOrder = 6;
    const fn = this.blend(e, 5, this.fan(ang), COOK.col.soupHi, COOK.col.soup, 2); fn.position.copy(p0).setY(p0.y + 0.07); fn.rotation.set(0, Math.atan2(-f.z, f.x), 0); fn.scale.set(r, 1, r);
    e.hit = (ok) => {
      if (e.dead || thrown >= 0) return; thrown = e.t;
      // drops fly out inside the real cone and land inside it; steam rises where the soup fell
      const n = low ? K.dropsLite : K.drops, h = ang * Math.PI / 360, drops = [];
      const de = this._fx('soupdrops', 0.5, (q, dt) => { for (const d of drops) { d.v.y -= 9 * dt; d.m.position.addScaledVector(d.v, dt); if (d.m.position.y < p0.y + 0.05) { d.m.position.y = p0.y + 0.05; d.v.set(0, 0, 0); d.m.scale.multiplyScalar(0.8); } else { _a.copy(d.v).normalize(); d.m.quaternion.setFromUnitVectors(UP, _a); } d.m.material.uniforms.uA.value = 1 - smooth(0.7, 1, q.t / q.life); } });
      for (let i = 0; i < n; i++) { const a = rnd(-h, h) * 0.85, dist = r * rnd(0.45, 0.95), T = rnd(0.1, 0.18), dir = f.clone().applyAxisAngle(UP, a), m = this.solid(de, this.geo.cook_drop, { spec: 0.9, rim: COOK.col.soupHi });
        m.scale.setScalar(rnd(0.06, 0.11)); m.position.copy(ld.position); const dy = p0.y + 0.05 - ld.position.y, to = p0.clone().addScaledVector(dir, dist);
        drops.push({ m, v: new THREE.Vector3((to.x - ld.position.x) / T, dy / T + 4.5 * T, (to.z - ld.position.z) / T) }); }
      const ns = low ? K.steamLite : K.steam;
      for (let i = 0; i < ns; i++) { const a = rnd(-h, h) * 0.8, at = p0.clone().addScaledVector(f.clone().applyAxisAngle(UP, a), r * rnd(0.4, 0.9)); this._puffs(at.setY(p0.y + 0.15), 1, 0.5, { c1: COOK.col.steam1, c2: COOK.col.steam2, a: 0.26, life: rnd(0.5, 0.75), rise: 0.9 }); }
      for (const t of ok || []) { const g = P3(t.pos); this._pop(g, { r: 0, y: cookTop(t) * 0.55, size: 0.55, flash: 1.0, w: COOK.col.soupHi }); this._bits(g.clone().setY(g.y + cookTop(t) * 0.55), low ? 1 : 3, { geo: this.geo.cook_drop, size: [0.035, 0.06], speed: [1.0, 2.0], up: [1.2, 2.4], ground: g.y, life: 0.4 }); }
    };
    return e;
  }

  // ------------------------------------------------------------------ 후추 뿌리기
  pepper(pc, o = {}) {
    if (!this._ok() || !(this.tri.tripo_pepper || this.geo.cook_shaker)) return null;
    const K = COOK.pepper, lead = Math.max(0.08, o.lead || 0.17), r = o.r || 2.2, aim = o.aim || pc.pos, g0 = P3({ x: aim.x, y: o.ground ?? (pc.pos.y || 0), z: aim.z }), low = lite(); let shook = -1;
    // the shaker hangs a little toward the cook (straight above the aim point it covered the targets standing behind it on screen)
    const back = new THREE.Vector3(pc.pos.x - aim.x, 0, -(pc.pos.z - aim.z)); if (back.lengthSq() < 1e-4) back.set(0, 0, 1); back.normalize();
    const e = this._fx('pepper', lead + 0.9, (e) => {
      // upside down above the aim point; two sharp shakes: the first one lands exactly on the damage tick
      const t = e.t - lead, s1 = Math.exp(-Math.pow(t / 0.05, 2)), s2 = Math.exp(-Math.pow((t - 0.2) / 0.05, 2)), out = smooth(0.3, 0.46, t);
      sh.position.copy(g0).addScaledVector(back, K.back); sh.position.y = g0.y + K.h - 0.32 * (s1 + s2) + 0.5 * out; sh.position.x += 0.04 * Math.sin(e.t * 50) * (s1 + s2);
      sh.rotation.set(Math.PI - 0.5 + 0.35 * (s1 + s2), e.t * 1.2, 0.25); sh.scale.setScalar(K.size * (0.6 + 0.4 * easeOut(e.t / 0.1)));
      sh.material.uniforms.uA.value = smooth(0, 0.06, e.t) * (1 - out) * (1 - 0.3 * smooth(0.04, 0.12, t));   // after the shake it thins out so the targets under it read
      if (shook >= 0) { const k = (e.t - shook) / 0.6; sp.material.uniforms.uP.value = k * 1.2; sp.material.uniforms.uA.value = 0.85 * smooth(0, 0.08, e.t - shook) * (1 - smooth(0.45, 1, k)); this._flat(sp, r * (0.55 + 0.45 * easeOut(k * 2)), 0.06);
        this._flat(rg, r * (0.6 + 0.4 * easeOut(k * 2.4)), 0.07); rg.material.uniforms.uA.value = COOK.intensity * 0.9 * (1 - smooth(0.2, 0.8, k)); }
      else if (e.t > lead + 0.1) shook = e.t;
    });
    const sh = this.prop(e, 'tripo_pepper', 'cook_shaker', { spec: 0.4 }); sh.renderOrder = 6;
    const sp = this.blend(e, 6, this.quad, COOK.col.pepper2, COOK.col.pepper1, 2), rg = this.spr(e, 1, COOK.col.dust1, COOK.col.pepper2, 3); sp.position.copy(g0); rg.position.copy(g0);
    e.hit = (ok) => {
      if (e.dead || shook >= 0) return; shook = e.t;
      // grains fall from the shaker: a few dark bits + a low thin dust inside the real radius
      this._bits(sh.position.clone(), low ? 3 : 7, { geo: this.geo.cook_chip_c, tint: COOK.col.pepper1, size: [0.025, 0.045], speed: [0.4, r * 0.9], up: [-1.5, 0.5], ground: g0.y, life: 0.5 });
      this._puffs(g0, low ? K.puffsLite : K.puffs, r * 0.9, { c1: 0xb8a888, c2: 0x5a4a3a, a: K.a, life: 0.6, rise: 0.35 });
      for (const t of ok || []) { const g = P3(t.pos); this._puffs(g.clone().setY(g.y + cookTop(t) * 0.8), 1, 0.4, { c1: COOK.col.dust1, c2: COOK.col.pepper2, a: 0.4, life: 0.35, rise: 0.3 }); }
    };
    return e;
  }

  // ------------------------------------------------------------------ 밀가루 구름
  sack(pc, o = {}) {
    if (!this._ok() || !(this.tri.tripo_flour || this.geo.cook_sack)) return null;
    const K = COOK.flour, lead = Math.max(0.08, o.lead || 0.17), aim = o.aim || pc.pos, g0 = P3({ x: aim.x, y: o.ground ?? (pc.pos.y || 0), z: aim.z }); let burst = -1;
    const e = this._fx('sack', lead + 0.45, (e) => {
      const k = clamp01(e.t / lead);
      sk.position.copy(g0); sk.position.y = g0.y + (burst < 0 ? 2.6 * (1 - k * k) : 0); sk.rotation.set(0.3 * (1 - k), e.t * 2, 0.2 * (1 - k));
      const sq = burst < 0 ? 1 : 1 + 0.5 * easeOut((e.t - burst) / 0.12); sk.scale.set(K.size * sq, K.size / sq * (burst < 0 ? 1 : Math.max(0.2, 1 - (e.t - burst) / 0.14)), K.size * sq);
      sk.material.uniforms.uA.value = smooth(0, 0.05, e.t) * (burst < 0 ? 1 : 1 - smooth(0.04, 0.16, e.t - burst));
      if (burst < 0 && e.t > lead + 0.1) e.land();
    });
    const sk = this.prop(e, 'tripo_flour', 'cook_sack', { spec: 0.15 }); sk.renderOrder = 6;
    e.land = () => { if (burst >= 0) return; burst = e.t; e.life = Math.min(e.life, e.t + 0.2); };
    return e;
  }
  flour(pos, o = {}) {
    if (!this._ok()) return null;
    const K = COOK.flour, r = o.r || 2.6, dur = o.dur || 6, g0 = P3(pos), low = lite(), I = COOK.intensity; let ended = -1;
    if (o.pre && o.pre.land) o.pre.land();
    // one white burst when the sack lands (fast, gone in 0.5 s), then only a low thin layer + a thin rim: enemies and telegraphs stay visible
    this._puffs(g0.clone().setY(g0.y + 0.1), low ? K.burstLite : K.burst, r * 0.8, { c1: COOK.col.flour1, c2: COOK.col.flour2, a: 0.72, life: 0.55, rise: 0.6 });
    this._bits(g0.clone().setY(g0.y + 0.3), low ? 2 : 5, { geo: this.geo.cook_chip_c, tint: 0xfff8ea, size: [0.04, 0.07], speed: [1.0, 2.4], up: [1.5, 3.0], ground: g0.y, life: 0.5 });
    this.sfx('ck_flour');
    const wisps = [];
    const e = this._fx('flour', dur + 0.5, (e) => {
      const fade = ended >= 0 ? 1 - clamp01((e.t - ended) / 0.45) : smooth(0, 0.3, e.t) * (1 - smooth(dur - 0.6, dur, e.t));
      hz.material.uniforms.uP.value = e.t; hz.material.uniforms.uA.value = K.haze * fade;
      rg.material.uniforms.uA.value = I * K.ring * fade * (0.8 + 0.2 * Math.sin(e.t * 3));
      for (const w of wisps) { const a = w.a0 + e.t * w.sp; w.m.quaternion.copy(this.camQ); w.m.position.set(g0.x + Math.cos(a) * w.rr, g0.y + 0.22 + 0.06 * Math.sin(e.t * 1.3 + w.a0), g0.z + Math.sin(a) * w.rr); w.m.scale.setScalar(w.s); w.m.material.uniforms.uA.value = 0.2 * fade; }
    });
    const hz = this.blend(e, 7, this.quad, COOK.col.flour1, COOK.col.flour2, 2), rg = this.spr(e, 1, COOK.col.flour1, COOK.col.flour2, 3);
    hz.position.copy(g0); this._flat(hz, r, 0.05); rg.position.copy(g0); this._flat(rg, r, 0.06);
    for (let i = 0, n = low ? K.wispsLite : K.wisps; i < n; i++) wisps.push({ m: this.puff(e, COOK.col.flour1, COOK.col.flour2, 3), a0: i / n * Math.PI * 2, sp: rnd(0.15, 0.35) * (i % 2 ? 1 : -1), rr: r * rnd(0.55, 0.9), s: rnd(0.7, 1.1) });
    e.end = () => { if (ended < 0) { ended = e.t; e.life = Math.min(e.life, e.t + 0.45); } };
    return e;
  }

  // ------------------------------------------------------------------ 꼬치 찌르기
  skewer(pc, o = {}) {
    if (!this._ok() || !(this.tri.tripo_kebab || this.geo.cook_skewer)) return null;
    const K = COOK.skewer, I = COOK.intensity, lead = Math.max(0.1, o.lead || 0.25), len = o.len || 3.5, f = this._f3(o.facing || { x: 0, z: 1 }), p0 = P3(pc.pos); let hitAt = -1;
    const right = new THREE.Vector3().crossVectors(f, UP).normalize(); let spin = 0;
    const e = this._fx('skewer', lead + 0.42, (e) => {
      // pulled back beside the cook, then the thrust: the tip is at the far end of the real line exactly at `lead`
      const k = e.t / lead, pull = k < 0.6 ? -0.35 * easeOut(k / 0.6) : -0.35 + 1.35 * Math.pow(clamp01((k - 0.6) / 0.4), 2.2);
      // after a hit it stays run through (a small jolt per hit, Lv 2마다 추가타 = the same skewer twists again) and pulls out 0.16 s after the LAST hit
      const dh = e.t - hitAt, ext = hitAt < 0 ? Math.min(1, pull) : 1 - 0.07 * Math.sin(clamp01(dh / 0.1) * Math.PI) - 0.55 * smooth(0.16, 0.36, dh), tip = 0.2 + (len - 0.2) * Math.max(-0.3, ext);
      sk.position.copy(p0).addScaledVector(f, tip - len).addScaledVector(right, 0.28 * (1 - clamp01(ext))); sk.position.y = p0.y + K.y;
      _mx.makeBasis(f, UP, _c.crossVectors(f, UP)); sk.quaternion.setFromRotationMatrix(_mx); sk.rotateX(e.t * (hitAt < 0 ? 9 : 2) + spin); sk.scale.setScalar(len);
      sk.material.uniforms.uA.value = smooth(0, 0.07, e.t) * (hitAt < 0 ? 1 : 1 - smooth(0.2, 0.38, dh));
      if (hitAt >= 0) { const q = (e.t - hitAt) / 0.2; ln.material.uniforms.uA.value = I * K.line * (1 - smooth(0.1, 1, q)); ln.scale.set(len * (0.85 + 0.15 * easeOut(q)), 0.5 * (1 - 0.5 * q), 1); }
      else if (e.t > lead + 0.1) hitAt = e.t;
    });
    const sk = this.prop(e, 'tripo_kebab', 'cook_skewer', { spec: 1.0, rim: COOK.col.steelB }); sk.renderOrder = 6;
    const ln = this.spr(e, 2, 0xffffff, COOK.col.steelB, 5); ln.position.copy(p0).addScaledVector(f, len * 0.5).setY(p0.y + K.y); this._alignLine(ln, f);
    e.hit = (ok) => {
      if (e.dead) return; const again = hitAt >= 0; if (again && !(ok && ok.length)) return;
      hitAt = e.t; e.life = Math.max(e.life, e.t + 0.42); spin += again ? 1.6 : 0;
      for (const t of ok || []) { const g = P3(t.pos); this._pop(g, { r: 0, y: Math.min(K.y, cookTop(t) * 0.8), size: again ? 0.55 : 0.7, flash: K.flash * (again ? 0.8 : 1), w: COOK.col.steel });
        this._bits(g.clone().setY(g.y + Math.min(K.y, cookTop(t) * 0.8)), lite() ? 1 : 3, { size: [0.08, 0.13], speed: [1.2, 2.4], up: [1.4, 2.6], ground: g.y, life: 0.45 }); }
    };
    return e;
  }

  // ------------------------------------------------------------------ 음식 먹기 / 제작 완성
  _food(e, kind) {
    const T = { lunch: ['tripo_lunchbox', 'cook_lunchbox'], soup: ['tripo_soup', 'cook_bowl'], meal: ['tripo_meal', 'cook_plate'], snack: ['tripo_snack', 'cook_cookie'] }[kind] || ['tripo_meal', 'cook_plate'];
    if (!this.tri[T[0]] && !this.geo[T[1]]) return null;
    const m = this.prop(e, T[0], T[1], { spec: 0.3 }); m.renderOrder = 6; m.userData.flatFix = !m.userData.tex && kind === 'snack'; return m;
  }
  /** food appears over the head, tips toward the camera and is eaten in bites (each bite: smaller + crumbs + munch) */
  eat(pc, o = {}) {
    if (!this._ok()) return null;
    const K = COOK.eat, kind = o.kind || 'meal', bites = kind === 'snack' ? 2 : K.bites, size = K.size * (kind === 'meal' ? 1.3 : kind === 'snack' ? 0.95 : 1), t0 = 0.26, low = lite(); let done = 0;
    const e = this._fx('eat', t0 + bites * K.gap + 0.3, (e) => {
      if (pc.dead) { e.t = e.life; return; }
      const p = P3(pc.pos), nb = Math.max(0, Math.min(bites, Math.floor((e.t - t0) / K.gap) + 1)), sc = size * (0.3 + 0.7 * easeOut(e.t / 0.16)) * (1 - 0.26 * Math.min(nb, bites - 1)) * (nb >= bites ? Math.max(0, 1 - (e.t - t0 - (bites - 1) * K.gap) / 0.12) : 1);
      const down = smooth(t0 - 0.1, t0 + bites * K.gap, e.t);
      fd.position.set(p.x, p.y + K.y - 0.55 * down + 0.05 * Math.sin(e.t * 9), p.z); fd.quaternion.copy(this.camQ); fd.rotateX(0.95); if (fd.userData.flatFix) fd.rotateX(-Math.PI / 2); fd.rotateY(Math.sin(e.t * 5) * 0.12);
      fd.scale.setScalar(Math.max(0.001, sc)); fd.material.uniforms.uA.value = smooth(0, 0.06, e.t);
      gl.quaternion.copy(this.camQ); gl.position.copy(fd.position); gl.scale.setScalar(size * 2.4); gl.material.uniforms.uA.value = COOK.intensity * 0.4 * (1 - smooth(0, 0.3, e.t));
      while (done < nb) { done++; this._bits(fd.position.clone(), low ? 2 : 4, { geo: this.geo.cook_chip_c, tint: kind === 'soup' ? COOK.col.soup : kind === 'snack' ? 0xc88a48 : 0xfff0c8, size: [0.03, 0.055], speed: [0.6, 1.5], up: [0.8, 1.8], ground: p.y, life: 0.4 }); this.sfx('ck_eat');
        if (done === bites) this._pop(new THREE.Vector3(p.x, p.y, p.z), { r: 0.7, y: K.y - 0.6, size: 0.6, flash: 0.9, ring: 1.0, w: COOK.col.warm, b: COOK.col.gold, life: 0.3 }); }
      if (kind === 'soup' && !low && Math.random() < 0.25) this._puffs(fd.position.clone().setY(fd.position.y + 0.1), 1, 0.25, { c1: COOK.col.steam1, c2: COOK.col.steam2, a: 0.22, life: 0.5, rise: 0.6 });
    });
    const fd = this._food(e, kind), gl = this.spr(e, 0, COOK.col.warm, COOK.col.goldB, 3);
    if (!fd) { this._free(e); return null; }
    return e;
  }
  /** crafted in town: the finished dish pops up over the head with a sparkle */
  made(pc, o = {}) {
    if (!this._ok()) return null;
    const kind = o.kind || 'lunch', size = COOK.eat.size * 1.15;
    const e = this._fx('made', 1.1, (e) => {
      const p = P3(pc.pos), k = e.t / e.life;
      fd.position.set(p.x, p.y + COOK.eat.y + 0.12 * easeOut(k * 2), p.z); fd.quaternion.copy(this.camQ); fd.rotateX(0.95); if (fd.userData.flatFix) fd.rotateX(-Math.PI / 2); fd.rotateY(e.t * 1.6);
      fd.scale.setScalar(size * (0.3 + 0.7 * easeOut(e.t / 0.2) + 0.12 * Math.sin(Math.min(1, e.t / 0.3) * Math.PI))); fd.material.uniforms.uA.value = smooth(0, 0.06, e.t) * (1 - smooth(0.75, 1, k));
      st.quaternion.copy(this.camQ); st.rotateZ(e.t * 2); st.position.copy(fd.position); st.scale.setScalar(size * 2.6 * (0.6 + 0.4 * easeOut(e.t / 0.25))); st.material.uniforms.uA.value = COOK.intensity * 0.9 * (1 - smooth(0.1, 0.6, k));
    });
    const fd = this._food(e, kind), st = this.spr(e, 3, 0xffffff, COOK.col.gold, 3);
    if (!fd) { this._free(e); return null; }
    return e;
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    const G = window.G, cam = G && G.render && G.render.cam;
    if (cam) { this.camQ.copy(cam.quaternion); cam.getWorldDirection(_a); this.toCam.copy(_a).multiplyScalar(-1); this.camR.set(1, 0, 0).applyQuaternion(cam.quaternion).setY(0).normalize(); }
    for (const e of this.live) { if (e.dead) continue; e.t += dt; e.dt = dt; try { e.update(e, dt); } catch (err) { console.warn('cookfx', e.kind, err); e.t = e.life; } if (e.t >= e.life) this._free(e); }
    this.live = this.live.filter(e => !e.dead);
  }
  _free(e) { if (e.dead) return; e.dead = true; this.root.remove(e.g);
    for (const m of e.items) { if (m.parent) m.parent.remove(m); (this.pool[m.userData.kind] || (this.pool[m.userData.kind] = [])).push(m); } e.items.length = 0; }
  clear() { for (const e of this.live) this._free(e); this.live = []; }
}

/** item id -> food prop kind for eat() / made() */
export const cookFoodKind = (id) => id === 'f_lunch' ? 'lunch' : id === 'f_soup' ? 'soup' : id && id.startsWith('f_') ? 'meal' : null;

/** 요리사 타격 순간(skillrt.js opHit, 피해를 준 뒤 한 번): handle.hit(ok) + 타격감 — 실제로 맞은 대상(ok)이 있을 때만 시전자·대상의
 *  짧은 freezeT(전역 G.hitStop 없음, max라 안 쌓임), 눌림 punch / 한 바퀴 toss, 카메라 kick 한 번, 후추의 '에취!'. */
export function cookImpact(G, pc, op, ctx, ts, ok, f) {
  const kind = op.fx.cook, k = ctx.cookFx, C = COOK;
  if (k && k.hit) k.hit(ok, ts);
  if (!ok.length) return;
  const kick = (kk) => { if (G.render.kick && !G.reduceFlash) G.render.kick(f.x, f.z, kk[0], kk[1]); };
  if (kind === 'flip') {
    const t = ok[0]; pc.freezeT = Math.max(pc.freezeT || 0, C.flip.stop); if (!t.dead) t.freezeT = Math.max(t.freezeT || 0, C.flip.stop);
    if (t.body) { if (cookCanToss(t) && t.body.toss) t.body.toss(op.launch || 0.8, C.flip.h); else if (t.body.punch) t.body.punch(f.x, f.z, 0.24); }
    kick(C.flip.kick);
  } else if (kind === 'skewer') {
    pc.freezeT = Math.max(pc.freezeT || 0, C.skewer.stop);
    for (const t of ok) { if (!t.dead) t.freezeT = Math.max(t.freezeT || 0, C.skewer.stop); if (t.body && t.body.punch) t.body.punch(f.x, f.z, 0.2); }
    kick(C.skewer.kick);
  } else if (kind === 'soup') {
    for (const t of ok) if (t.body && t.body.punch) t.body.punch(t.pos.x - pc.pos.x, t.pos.z - pc.pos.z, 0.16);
    kick(C.soup.kick);
  } else if (kind === 'pepper') {
    ok.forEach((t, i) => { if (t.dead) return; if (t.body && t.body.punch) t.body.punch(0, 0.01, 0.3); if (i < 4) G.ui.floatText(t.pos, '에취!', '#e8d8b0', 0.8, 1.5); });
  }
}
/** 뒤집기로 띄울 수 있는 대상(보스·무거운 몬스터 제외 — skillrt의 launch 규칙과 같음) */
export const cookCanToss = (t) => !!t && !t.dead && !t.isBoss && !(t.def && t.def.ai === 'heavy');
