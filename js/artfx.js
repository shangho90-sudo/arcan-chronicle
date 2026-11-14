// 예술가 1차 스킬 이펙트 (2026-11-13): 스킬 이름이 그대로 보이는 연출 — 회화는 선명한 물감 원색, 음악은 금색·보라 음표.
// Meshes from tools/blender/fx_art.py -> assets/fx/fx_art.glb.json (vertex colours, tinted here):
//   art_blob / art_drop (물감) · art_note / art_note2 (음표) · art_frame (액자) · art_bulb (전구) · art_palette · art_critter (그림 생명체) · art_scribble (낙서)
// Optional Tripo props (tools/tripo/art_assets.py -> tools/blender/fx_art_tripo.py -> assets/fx/fx_art_tripo.glb.json): replace frame / bulb / palette when present.
// Paint and light sprites (splat, ink pool, painted arc, target mark, sound arc, jagged ring, staff lines, flash, ring) are one procedural shader on a unit quad.
// Kinds (js/skillrt.js FX.art(kind, a, o), js/actors.js for the basic attack); bright layers peak on the real damage tick and nothing is drawn wider than what was really hit:
//   stroke(pc, {step, act})        기본공격: 실제 붓끝이 지나간 길에 굵은 젖은 물감 획(타마다 다른 색) — handle.end()
//   splash(t, {col, big})          대상 몸에 물감이 튐(얼룩 + 방울 + 작은 섬광) — 실제 피해 순간에만
//   proj(pos, {kind, idx})         'blob' 물감 탄환 / 'note' 음표; handle {set(pos, dir), dispose()}
//   projHit(t, {kind, dir})        탄환이 터진 물감 얼룩 / 음표의 날카로운 별빛
//   sweep(pc, {f, r, ang, hits})   붓 휘두르기: 실제 부채꼴 위에 칠해지는 물감 호 + 맞은 적마다 splash
//   pool(pos, {r, dur})            잉크 웅덩이: 잉크 덩이가 떨어져 검은 웅덩이로 퍼지고 물결침; handle {pulse(ts), end()}
//   mark(t, {})                    색칠 표식: 대상 위에 붓으로 그린 과녁, 표식(painted)이 쓰이면 터짐
//   wave(pc, {f, r, ang, hits})    음파 파동: 부채꼴을 따라 퍼지는 음파 호 + 음표
//   discord(pc, {r, hits})         작은 불협화음: 삐죽삐죽한 고리 + 깨져 튀는 음표
//   march(pc, {dur})               가벼운 행진곡: 발밑 오선 고리 + 뒤따라 통통 튀는 음표(가속이 남아 있는 동안)
//   inspire(pc, {dur, alive})      영감 충전: 머리 위 전구가 단계마다 밝아짐, 끝까지 모으면 반짝
//   improv(pc, {dur})              즉흥 창작: 몸 둘레에 삼원색 낙서가 그려지고, 버프가 남은 동안 작은 팔레트가 떠 있음
//   canvas(pos, {f})               작은 걸작: 금테 액자가 솟고 물감이 튀며 생명체가 튀어나옴;  critter() = 그 생명체의 모습(THREE.Group)
// Pooled meshes (one material each); cleared on zone change. Low spec (phone / 그래픽 효과 끔): fewer drops, notes and puffs — the named shape of every
// skill (stroke, splat, arc, pool, mark, notes, bulb, frame) stays. No global bloom / exposure / hit-stop is touched here.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const ART = {
  intensity: 1.0,
  stroke: { n: 26, sub: 3, width: [0.42, 1.18], fade: 0.45, minStep: 0.015 },
  splash: { size: 0.72, life: 0.42, flash: 0.9, alpha: 0.82, drops: 5, dropsLite: 2, ground: 0.9 },   // the splat sits in front of the target: kept small and short so the enemy stays readable
  blob: { r: 0.21, wob: 14 }, note: { size: 0.72 },
  sweep: { draw: 0.1, life: 0.55, y: 0.95 },
  pool: { fall: 0.04, grow: 0.12, fade: 0.45, bubbles: 0.5 },   // the first damage tick is at once (SkillArea): the pool must already be there
  mark: { draw: 0.26, size: 1.25 },
  wave: { n: 4, gap: 0.055, run: 0.3, y: 0.85 },
  discord: { grow: 0.2, life: 0.42, notes: 6, notesLite: 3 },
  march: { every: 0.42, hop: 0.75, life: 0.8 },
  inspire: { size: 0.5, lift: 0.45 },
  improv: { draw: 0.55, hold: 0.35, size: 0.62 },
  canvas: { size: 1.25, pop: 0.2, hold: 0.55, fade: 0.3 },
  col: { red: 0xf03a44, yel: 0xffd22e, blu: 0x2f7cf6, grn: 0x42c654, vio: 0xa066f6, org: 0xff8c24, pnk: 0xff70b8, ink: 0x15111f, inkHi: 0x5a4a8a,
    gold: 0xffe08a, goldB: 0xffaa2c, violet: 0xcbb0ff, violetB: 0x7a44e6, sour: 0xc8ff5a, white: 0xffffff, warm: 0xfff2c8 },
};
const C = ART.col;
/** stroke colour of each basic-attack step (1..5) and the paint primaries used by the skills */
export const STEP_COL = [C.red, C.yel, C.blu, C.grn, C.vio];
const PRIM = [C.red, C.yel, C.blu];

const P3 = (p) => new THREE.Vector3(p.x, p.y || 0, -p.z);
const lite = () => { const G = window.G; return !!(G && ((G.input && G.input.mobile) || (G.settings && G.settings.graphicsFx === false))); };
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const backOut = (x) => { x = clamp01(x); const c = 1.9; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const rnd = (a, b) => a + Math.random() * (b - a);
const UP = new THREE.Vector3(0, 1, 0);
const _col = new THREE.Color(), _wh = new THREE.Color(1, 1, 1);
const light = (hex, k = 0.45) => _col.setHex(hex).lerp(_wh, k).getHex();
const dark = (hex, k = 0.35) => _col.setHex(hex).multiplyScalar(1 - k).getHex();
/** chest height of a target above its feet */
export const artMid = (t) => Math.min(1.25, 0.45 + (t.radius || 0.5) * 0.6);
const artTop = (t) => Math.min(1.9, 0.9 + (t.radius || 0.5) * 0.9);

const SOLID_VS = `
attribute vec3 color; varying vec3 vC, vN, vV; varying vec2 vUv;
void main(){ vC = color; vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const SOLID_FS = `
uniform vec3 uTint, uRim; uniform float uA, uGlow, uSpec, uRev, uTex; uniform sampler2D uMap;
varying vec3 vC, vN, vV; varying vec2 vUv;
void main(){
  if (uTex < .5 && vUv.x > uRev) discard;
  vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
  vec3 L = normalize(vec3(-.4, .8, .5));
  float d = max(0., dot(n, L)), rim = pow(1. - max(0., dot(n, vV)), 2.5);
  vec3 tc = uTex > .5 ? texture2D(uMap, vUv).rgb : vec3(1.);
  vec3 base = vC * uTint * tc;
  vec3 c = base * (.5 + .7 * d) + uRim * rim * .5;
  vec3 h = reflect(-L, n); c += vec3(1., .98, .92) * pow(max(0., dot(h, vV)), 22.) * uSpec;
  c += base * uGlow;
  gl_FragColor = vec4(c, uA);
}`;
const FLAT_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
// uK: 0 soft disc, 1 thin ring, 2 line, 3 four-point star flash, 4 puff, 5 paint splat (uQ seed, uP grow), 6 ink pool (uP grow, uT time),
//     7 painted arc (uQ half angle, uP reveal, uT < 0 = drawn the other way), 8 sound arc (uQ half angle), 9 jagged ring (uQ phase),
//     10 painted target mark (uP drawn 0..1), 11 staff lines (uT time)
const SPR_FS = `
uniform vec3 uW, uB; uniform float uA, uK, uP, uQ, uT, uAdd; varying vec2 vUv;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h21(i), h21(i + vec2(1., 0.)), f.x), mix(h21(i + vec2(0., 1.)), h21(i + vec2(1., 1.)), f.x), f.y); }
void main(){
  vec2 p = vUv * 2. - 1.; float r = length(p), ang = atan(p.x, p.y), a = 0., core = 0.;
  if (uK < .5) { a = pow(clamp(1. - r, 0., 1.), 2.2); core = pow(clamp(1. - r * 1.6, 0., 1.), 2.); }
  else if (uK < 1.5) { float w = .05; a = smoothstep(1., 1. - w, r) * smoothstep(1. - w * 4.5, 1. - w, r); core = smoothstep(1. - w * 2.6, 1. - w, r) * smoothstep(1., 1. - w, r); }
  else if (uK < 2.5) { float e = 1. - pow(abs(p.x), 2.4); a = clamp(e, 0., 1.) * exp(-abs(p.y) * 9.); core = clamp(e, 0., 1.) * exp(-abs(p.y) * 30.); }
  else if (uK < 3.5) { float s = exp(-abs(p.x) * 16.) * clamp(1. - abs(p.y), 0., 1.) + exp(-abs(p.y) * 16.) * clamp(1. - abs(p.x), 0., 1.); a = s + pow(clamp(1. - r, 0., 1.), 3.) * .9; core = pow(clamp(1. - r * 2.2, 0., 1.), 1.5) + s * .5; }
  else if (uK < 4.5) { a = pow(clamp(1. - r, 0., 1.), 1.4); core = clamp(.5 + p.y * .5, 0., 1.); }
  else if (uK < 5.5) {
    float n = vn(vec2(ang * 2.2 + uQ * 7., uQ * 3.)) * .5 + vn(vec2(ang * 5. + uQ, 1.7)) * .3;
    float g = .3 + .7 * uP, edge = (.36 + .36 * n) * g;
    a = smoothstep(edge, edge - .05, r);
    float ray = pow(max(0., vn(vec2(ang * 8. + uQ * 13., 4.)) - .5) * 2., 2.);
    a = max(a, smoothstep(0., .25, ray) * smoothstep(edge + .5 * ray * g + .02, edge, r) * step(r, .97));
    vec2 q = p * 3.4 + uQ * 5.; vec2 c = floor(q), f = fract(q) - .5; float hh = h21(c + uQ), d = length(f - (vec2(h21(c + 1.3), h21(c + 2.7)) - .5) * .5);
    a = max(a, step(.7, hh) * smoothstep(.2 * hh, .2 * hh - .06, d) * step(edge, r) * step(r, .45 + .5 * uP));
    core = smoothstep(edge * .95, edge * .15, r) * .5 + .3 * vn(p * 6. + uQ);
  }
  else if (uK < 6.5) {
    float g = max(uP, .01), w = .04 * sin(ang * 5. + uT * 1.3) + .03 * sin(ang * 9. - uT * .9) + .06 * vn(vec2(ang * 2. + 3., uT * .25)), R = (.86 + w) * g;
    a = smoothstep(R, R - .05, r);
    float rip = pow(.5 + .5 * sin(r / g * 24. - uT * 5.), 7.) * smoothstep(.08, .5, r / g);
    float gl = pow(max(0., 1. - length(p - vec2(-.22, .28) * g) / (.42 * g)), 2.5);
    core = rip * .55 + gl * .7 + smoothstep(R - .12, R - .03, r) * .4;
  }
  else if (uK < 7.5) {
    float u = ang / uQ, uu = uT < 0. ? -u : u, v = uP * 2.3 - 1.15;
    float shown = step(abs(u), 1.) * smoothstep(v + .02, v - .1, uu);
    float band = smoothstep(.5, .58, r) * smoothstep(1., .93, r), br = vn(vec2(r * 44., uu * 1.6 + 3.));
    float dry = smoothstep(.3, .8, br + (uu * .5 + .5) * .5 - .32);
    a = shown * band * (1. - dry * .8 * smoothstep(.1, 1., uu * .5 + .5)) * (.5 + .5 * smoothstep(-1., -.55, uu));
    core = br * .45 + smoothstep(.62, .8, r) * smoothstep(.95, .8, r) * .35;
  }
  else if (uK < 8.5) { float u = ang / uQ, m = step(abs(u), 1.) * pow(max(0., 1. - u * u), .6); a = m * (exp(-abs(r - .9) * 34.) + .5 * exp(-abs(r - .77) * 56.)); core = m * exp(-abs(r - .9) * 100.); }
  else if (uK < 9.5) { float t = abs(fract(ang / 6.2832 * 11. + uQ) - .5) * 2., R = .7 + .26 * t; a = (exp(-abs(r - R) * 28.) + .22 * exp(-abs(r - R) * 8.)) * step(r, 1.); core = exp(-abs(r - R) * 85.); }
  else if (uK < 10.5) {
    float sh = smoothstep(uP * 6.5, uP * 6.5 - .3, ang + 3.14159), br = vn(vec2(ang * 3., r * 30.));
    float ring = smoothstep(.6, .66, r) * smoothstep(.86, .8, r), dt = smoothstep(.2, .14, r) * step(.8, uP);
    float cx = (smoothstep(.075, .035, abs(p.x)) * step(.5, abs(p.y)) + smoothstep(.075, .035, abs(p.y)) * step(.5, abs(p.x))) * step(r, .98) * step(.55, uP);
    a = clamp(max(max(ring * sh * (.72 + .28 * br), dt), cx), 0., 1.); core = br * .35;
  }
  else { float s = 0.; for (int i = 0; i < 5; i++) { float R = .6 + float(i) * .09; s += exp(-abs(r - R) * 110.); } a = s * (.55 + .45 * sin(ang * 3. + uT * 2.5)); core = s * .5; }
  vec3 c = mix(uB, uW, clamp(core, 0., 1.));
  if (uAdd > .5) gl_FragColor = vec4(c * (a * uA), 1.); else gl_FragColor = vec4(c, clamp(a, 0., 1.) * uA);
}`;
// ribbon of wet paint along the brush tip: uv.x 0 (oldest) .. 1 (newest, at the brush), uv.y across
const RIB_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const RIB_FS = `
uniform vec3 uW, uB; uniform float uA, uS; varying vec2 vUv;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h21(i), h21(i + vec2(1., 0.)), f.x), mix(h21(i + vec2(0., 1.)), h21(i + vec2(1., 1.)), f.x), f.y); }
void main(){
  float v = vUv.y * 2. - 1., u = vUv.x, br = vn(vec2(vUv.y * 26. + uS, u * 2.5));
  float edge = 1. - smoothstep(.8, 1., abs(v) + (br - .5) * .25);
  float dry = smoothstep(.45, .9, br + (1. - u) * .55 - .2);                 // dry-brush gaps towards the old end
  float a = edge * (1. - dry * .4) * smoothstep(0., .06, u) * (1. - smoothstep(.97, 1., u) * .3);
  vec3 c = mix(uB, uW, clamp(br * .5 + (1. - abs(v)) * .25 + smoothstep(.75, 1., u) * .35, 0., 1.));
  gl_FragColor = vec4(c, a * uA);
}`;
const ADD = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide };
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _mx = new THREE.Matrix4();

export class ArtFx {
  constructor(root) {
    this.root = root; this.live = []; this.ready = false; this.geo = {}; this.mpool = {}; this.loading = null; this.ribs = [];
    this.camQ = new THREE.Quaternion(); this.toCam = new THREE.Vector3(0, 0.7, 0.7); this.camR = new THREE.Vector3(1, 0, 0);
    this.quad = new THREE.PlaneGeometry(1, 1);
  }
  load() {
    if (this.loading) return this.loading;
    const glb = async (url) => {
      const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status);
      const j = await r.json(), raw = atob(j.b64), u8 = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
      return new Promise((res, rej) => new GLTFLoader().parse(u8.buffer, '', res, rej));
    };
    this.loading = (async () => {
      const g = await glb('assets/fx/fx_art.glb.json');
      g.scene.traverse(o => { if (o.isMesh) this.geo[o.name] = o.geometry; });
      // Tripo props (tools/blender/fx_art_tripo.py): own base-colour texture, white vertex colour so the same shader tints them
      try {
        const t = await glb('assets/fx/fx_art_tripo.glb.json');
        t.scene.traverse(o => { if (!o.isMesh) return; const g2 = o.geometry, n = g2.attributes.position.count;
          if (!g2.attributes.color) g2.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
          g2.userData.map = o.material && o.material.map || null; if (g2.userData.map) g2.userData.map.colorSpace = THREE.SRGBColorSpace; this.geo[o.name] = g2; });
      } catch (e) { /* no Tripo file: the procedural meshes stay */ }
      this.ready = true;
    })().catch(e => console.warn('artfx load', e));
    return this.loading;
  }
  _ok() { if (!this.ready) { this.load(); return false; } return true; }
  _mat(kind) {
    const U = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v }])), Cw = () => new THREE.Color(1, 1, 1);
    if (kind === 'solid') return new THREE.ShaderMaterial({ uniforms: U({ uTint: Cw(), uRim: new THREE.Color(0xffffff), uA: 1, uGlow: 0, uSpec: 0.5, uRev: 2, uTex: 0, uMap: null }), vertexShader: SOLID_VS, fragmentShader: SOLID_FS, transparent: true, depthWrite: true, side: THREE.DoubleSide });
    const u = U({ uW: Cw(), uB: Cw(), uA: 0, uK: 0, uP: 1, uQ: 0, uT: 0, uAdd: kind === 'spr' ? 1 : 0 });
    if (kind === 'pnt') return new THREE.ShaderMaterial({ uniforms: u, vertexShader: FLAT_VS, fragmentShader: SPR_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    return new THREE.ShaderMaterial({ uniforms: u, vertexShader: FLAT_VS, fragmentShader: SPR_FS, ...ADD });
  }
  _m(e, kind, geo, order = 4) {
    const p = this.mpool[kind] || (this.mpool[kind] = []); let m = p.pop();
    if (!m) { m = new THREE.Mesh(geo, this._mat(kind)); m.frustumCulled = false; m.userData.kind = kind; }
    m.geometry = geo; m.position.set(0, 0, 0); m.quaternion.identity(); m.scale.set(1, 1, 1); m.visible = true; m.renderOrder = order;
    e.items.push(m); e.g.add(m); return m;
  }
  solid(e, geo, o = {}) { const m = this._m(e, 'solid', geo, 1), u = m.material.uniforms; u.uTint.value.setHex(o.tint ?? 0xffffff); u.uRim.value.setHex(o.rim ?? 0xffffff); u.uA.value = o.a ?? 1; u.uGlow.value = o.glow ?? 0; u.uSpec.value = o.spec ?? 0.5; u.uRev.value = 2; const map = geo.userData && geo.userData.map; u.uMap.value = map || null; u.uTex.value = map ? 1 : 0; return m; }
  /** additive light sprite: k 0 disc / 1 ring / 2 line / 3 star / 8 sound arc / 9 jagged ring / 11 staff */
  spr(e, k, w, b, order = 5) { const m = this._m(e, 'spr', this.quad, order), u = m.material.uniforms; u.uK.value = k; u.uP.value = 1; u.uQ.value = 0; u.uT.value = 0; u.uW.value.setHex(w); u.uB.value.setHex(b); u.uA.value = 0; return m; }
  /** alpha-blended paint sprite: k 4 puff / 5 splat / 6 ink pool / 7 painted arc / 10 target mark (b = paint colour, w = its wet highlight) */
  pnt(e, k, w, b, order = 3) { const m = this._m(e, 'pnt', this.quad, order), u = m.material.uniforms; u.uK.value = k; u.uP.value = 1; u.uQ.value = Math.random() * 10; u.uT.value = 0; u.uW.value.setHex(w); u.uB.value.setHex(b); u.uA.value = 0; return m; }
  _fx(kind, life, update) { const e = { kind, g: new THREE.Group(), items: [], t: 0, life, update }; this.root.add(e.g); this.live.push(e); return e; }
  /** flat on the ground: quad in the xz plane; with f (game facing) its +y runs along the facing */
  _flat(m, size, y = 0.07, f = null) {
    if (f) { const F = _a.set(f.x, 0, -f.z).normalize(), R = _b.crossVectors(F, UP); _mx.makeBasis(R, F, UP); m.quaternion.setFromRotationMatrix(_mx); } else m.rotation.set(-Math.PI / 2, 0, 0);
    m.scale.set(size, size, 1); m.position.y = y; return m;
  }
  _face(m, s) { m.quaternion.copy(this.camQ); if (s != null) m.scale.setScalar(s); return m; }

  // ------------------------------------------------------------------ shared: flying drops / notes, paint splash
  _bits(at, n, o = {}) {
    if (n <= 0 || !this.geo.art_blob) return;
    const parts = [], gy = o.ground ?? (at.y - 1);
    const e = this._fx('bits', o.life || 0.55, (e, dt) => {
      const k = e.t / e.life;
      for (const p of parts) { p.v.y -= (o.grav ?? 11) * dt; p.m.position.addScaledVector(p.v, dt); if (p.m.position.y < gy + 0.03) { p.m.position.y = gy + 0.03; p.v.set(0, 0, 0); p.m.scale.set(p.s * 1.6, p.s * 0.35, p.s * 1.6); }
        if (o.spin) { p.m.rotation.z += p.w * dt; p.m.rotation.x += p.w * 0.6 * dt; }
        p.m.material.uniforms.uA.value = 1 - smooth(0.6, 1, k); }
    });
    for (let i = 0; i < n; i++) {
      const cols = o.cols || [o.tint ?? 0xffffff], tint = cols[i % cols.length], m = this.solid(e, o.geo || this.geo.art_blob, { tint, rim: light(tint, 0.6), spec: 0.7 });
      const s = rnd(o.size ? o.size[0] : 0.05, o.size ? o.size[1] : 0.09), a = o.dir ? Math.atan2(o.dir.z, o.dir.x) + rnd(-(o.fan ?? 0.9), o.fan ?? 0.9) : rnd(0, Math.PI * 2), sp = rnd(o.speed ? o.speed[0] : 1.4, o.speed ? o.speed[1] : 2.8);
      m.scale.setScalar(s); m.position.copy(at); if (o.spin) m.rotation.set(rnd(0, 6), rnd(0, 6), rnd(0, 6));
      parts.push({ m, s, v: new THREE.Vector3(Math.cos(a) * sp, rnd(o.up ? o.up[0] : 1.4, o.up ? o.up[1] : 3.0), Math.sin(a) * sp), w: rnd(-10, 10) });
    }
  }
  /** paint lands on something: a splat facing the camera at `at`, a short white-to-colour flash, drops, and (ground != null) a stain on the ground */
  _splash(at, col, o = {}) {
    const K = ART.splash, I = ART.intensity, low = lite(), size = (o.size || K.size) * (o.big ? 1.35 : 1), life = K.life * (o.big ? 1.25 : 1);
    const e = this._fx('splash', o.ground != null ? Math.max(life, K.ground) : life, (e) => {
      const k = e.t / life;
      this._face(sp, size * (0.75 + 0.3 * easeOut(k * 3))); sp.material.uniforms.uP.value = easeOut(e.t / 0.09); sp.material.uniforms.uA.value = K.alpha * (1 - smooth(0.3, 0.85, k));
      this._face(fl, size * 0.85 * (0.6 + 0.6 * easeOut(e.t / 0.07))); fl.material.uniforms.uA.value = I * K.flash * (o.big ? 1.25 : 1) * (1 - smooth(0, 0.13, e.t));
      if (gs) { gs.material.uniforms.uP.value = easeOut(e.t / 0.16); gs.material.uniforms.uA.value = 0.8 * smooth(0.02, 0.1, e.t) * (1 - smooth(K.ground * 0.5, K.ground, e.t)); }
    });
    e.g.position.copy(at);
    const sp = this.pnt(e, 5, light(col, 0.5), col, 6), fl = this.spr(e, 3, 0xffffff, light(col, 0.3), 7);
    let gs = null; if (o.ground != null) { gs = this.pnt(e, 5, light(col, 0.3), dark(col, 0.12), 2); this._flat(gs, size * 1.5, o.ground - at.y + 0.06); }
    this._bits(at, (low ? K.dropsLite : K.drops) + (o.big && !low ? 3 : 0), { cols: o.cols || [col, light(col, 0.3)], ground: o.ground ?? at.y - 1, dir: o.dir, fan: o.dir ? 1.1 : undefined });
    return e;
  }
  splash(t, o = {}) {
    if (!this._ok() || !t || !t.pos) return null;
    const at = P3(t.pos); at.y += artMid(t);
    return this._splash(at, o.col ?? C.blu, { big: o.big, ground: lite() ? null : t.pos.y || 0, cols: o.cols, size: Math.min(1.0, 0.55 + (t.radius || 0.5) * 0.4) });
  }

  // ------------------------------------------------------------------ 기본공격: 붓끝의 물감 획
  _rib() {
    let m = this.ribs.pop();
    if (!m) {
      const N = ART.stroke.n * ART.stroke.sub + 2, g = new THREE.BufferGeometry(), idx = [];
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 6), 3)); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(N * 4), 2));
      for (let i = 0; i < N - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
      g.setIndex(idx); g.setDrawRange(0, 0);
      m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: { uW: { value: new THREE.Color() }, uB: { value: new THREE.Color() }, uA: { value: 0 }, uS: { value: 0 } }, vertexShader: RIB_VS, fragmentShader: RIB_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      m.frustumCulled = false; m.renderOrder = 5; m.userData.N = N;
    }
    m.geometry.setDrawRange(0, 0); m.visible = true; return m;
  }
  /** samples = [{a, b}] (near edge / tip, world); smoothed with Catmull-Rom so a slow frame rate still draws a round stroke */
  _ribFill(m, S) {
    const N = m.userData.N, pos = m.geometry.attributes.position, uv = m.geometry.attributes.uv, sub = ART.stroke.sub, n = S.length;
    if (n < 2) { m.geometry.setDrawRange(0, 0); return; }
    const cr = (p0, p1, p2, p3, t, out) => out.set(0, 0, 0).addScaledVector(p0, -0.5 * t + t * t - 0.5 * t * t * t).addScaledVector(p1, 1 - 2.5 * t * t + 1.5 * t * t * t).addScaledVector(p2, 0.5 * t + 2 * t * t - 1.5 * t * t * t).addScaledVector(p3, -0.5 * t * t + 0.5 * t * t * t);
    let k = 0; const total = (n - 1) * sub + 1;
    for (let i = 0; i < n - 1 && k < N - 1; i++) for (let s = 0; s < sub && k < N - 1; s++) {
      const t = s / sub, i0 = Math.max(0, i - 1), i3 = Math.min(n - 1, i + 2);
      cr(S[i0].a, S[i].a, S[i + 1].a, S[i3].a, t, _a); cr(S[i0].b, S[i].b, S[i + 1].b, S[i3].b, t, _b);
      pos.setXYZ(k * 2, _a.x, _a.y, _a.z); pos.setXYZ(k * 2 + 1, _b.x, _b.y, _b.z); const u = k / (total - 1); uv.setXY(k * 2, u, 0); uv.setXY(k * 2 + 1, u, 1); k++;
    }
    const L = S[n - 1]; pos.setXYZ(k * 2, L.a.x, L.a.y, L.a.z); pos.setXYZ(k * 2 + 1, L.b.x, L.b.y, L.b.z); uv.setXY(k * 2, 1, 0); uv.setXY(k * 2 + 1, 1, 1); k++;
    pos.needsUpdate = true; uv.needsUpdate = true; m.geometry.setDrawRange(0, (k - 1) * 6);
  }
  stroke(pc, o = {}) {
    if (!pc || !pc.body || !pc.body.bladePoints) return null;
    const K = ART.stroke, col = o.col ?? STEP_COL[((o.step || 1) - 1) % 5], act = o.act, S = [], body = pc.body, A = body.sh && body.sh.actions[act], win = (A && A.paint) || [0, 0.3];
    const rib = this._rib(), u = rib.material.uniforms; u.uB.value.setHex(dark(col, 0.18)); u.uW.value.setHex(light(col, 0.55)); u.uS.value = Math.random() * 20; u.uA.value = 0;
    let done = -1;
    const e = this._fx('stroke', 3, (e) => {
      const on = done < 0 && body.action === act && body.t <= win[1] + 0.02;
      if (on && body.t >= win[0]) {
        const bp = body.bladePoints();
        if (bp) { const d = _c.subVectors(bp[1], bp[0]), a = bp[0].clone().addScaledVector(d, (K.width[0] - 0.38) / 0.62), b = bp[0].clone().addScaledVector(d, (K.width[1] - 0.38) / 0.62), L = S[S.length - 1];
          if (!L || L.b.distanceToSquared(b) > K.minStep * K.minStep) { S.push({ a, b }); if (S.length > K.n) S.shift(); this._ribFill(rib, S); } }
      } else if (!on && done < 0) { done = e.t; e.life = e.t + K.fade; }
      u.uA.value = done < 0 ? 1 : 1 - smooth(0, K.fade, e.t - done);
    });
    e.g.add(rib); e.rib = rib; e.col = col; e.end = () => { if (done < 0) { done = e.t; e.life = e.t + K.fade; } };
    return e;
  }

  // ------------------------------------------------------------------ 물감 탄환 / 음표 (투사체)
  proj(pos, o = {}) {
    if (!this._ok()) return null;
    const note = o.kind === 'note', last = P3(pos), vel = new THREE.Vector3(0, 0, 1), idx = o.idx || 0, low = lite();
    const col = note ? (idx % 2 ? C.violetB : C.goldB) : (o.col ?? C.blu); let dropT = 0;
    const e = this._fx('proj', 6, (e, dt) => {
      if (note) { this._face(mb); mb.rotateZ(Math.sin(e.t * 22 + idx) * 0.28 - 0.15); mb.scale.setScalar(ART.note.size * (1 + 0.12 * Math.sin(e.t * 30))); mb.position.set(-ART.note.size * 0.1, -ART.note.size * 0.45, 0).applyQuaternion(mb.quaternion); }
      else { _mx.lookAt(_a.set(0, 0, 0), vel, UP); mb.quaternion.setFromRotationMatrix(_mx); const w = Math.sin(e.t * ART.blob.wob) * 0.14; mb.scale.set(ART.blob.r * (0.92 - w), ART.blob.r * (0.92 + w), ART.blob.r * 1.45); }
      mb.material.uniforms.uA.value = smooth(0, 0.04, e.t);
      this._face(gl, note ? 0.95 : 0.8); gl.material.uniforms.uA.value = ART.intensity * (note ? 0.75 : 0.4) * smooth(0, 0.06, e.t);
      if (!note && !low) { dropT -= dt; if (dropT <= 0) { dropT = 0.045; this._bits(e.g.position, 1, { tint: col, size: [0.035, 0.06], speed: [0.1, 0.5], up: [0.2, 0.9], life: 0.4, ground: e.g.position.y - 1 }); } }
    });
    e.g.position.copy(last);
    const mb = this.solid(e, note ? (idx % 3 === 2 && this.geo.art_note2 ? this.geo.art_note2 : this.geo.art_note) : this.geo.art_blob, { tint: col, rim: note ? 0xffffff : light(col, 0.6), spec: 0.9, glow: note ? 0.6 : 0 });
    const gl = this.spr(e, 0, note ? C.gold : light(col, 0.4), note ? C.violetB : col, 3); mb.renderOrder = 6;
    return { set: (p) => { const n = P3(p); _c.copy(n).sub(last); if (_c.lengthSq() > 1e-7) vel.copy(_c).normalize(); last.copy(n); e.g.position.copy(n); }, dispose: () => this._free(e) };
  }
  projHit(t, o = {}) {
    if (!this._ok() || !t || !t.pos) return null;
    const at = P3(t.pos); at.y += artMid(t);
    if (o.kind !== 'note') return this._splash(at, o.col ?? C.blu, { big: true, ground: t.pos.y || 0, size: Math.min(1.15, 0.7 + (t.radius || 0.5) * 0.45), cols: [o.col ?? C.blu, C.white, light(o.col ?? C.blu, 0.4)] });
    // staccato: a short sharp star, one thin ring, two tiny notes hopping off — over in 0.25 s
    const I = ART.intensity, life = 0.26, idx = o.idx || 0, w = idx % 2 ? C.violet : C.gold, b = idx % 2 ? C.violetB : C.goldB;
    const e = this._fx('notehit', life, (e) => { const k = e.t / life;
      this._face(st, 0.75 * (0.5 + 0.7 * easeOut(k * 2.5))); st.rotateZ(0.5); st.material.uniforms.uA.value = I * 0.95 * (1 - smooth(0.05, 0.6, k));
      this._face(rg, 0.85 * (0.3 + 0.7 * easeOut(k * 1.6))); rg.material.uniforms.uA.value = I * 0.9 * (1 - smooth(0.2, 1, k)); });
    e.g.position.copy(at); const st = this.spr(e, 3, 0xffffff, w, 7), rg = this.spr(e, 1, w, b, 6);
    if (!lite()) this._bits(at, 2, { geo: this.geo.art_note, cols: [C.gold, C.violet], size: [0.13, 0.17], speed: [0.8, 1.6], up: [1.8, 2.6], life: 0.4, grav: 7, spin: false });
    return e;
  }

  // ------------------------------------------------------------------ 붓 휘두르기: 칠해지는 물감 호
  sweep(pc, o = {}) {
    if (!this._ok()) return null;
    const K = ART.sweep, f = o.f || { x: 0, z: 1 }, r = o.r || 2.4, ha = (o.ang || 100) * Math.PI / 360, life = K.life, col = o.col ?? C.blu, c2 = o.col2 ?? C.pnk;
    const e = this._fx('sweep', life, (e) => {
      const k = e.t / life, rev = easeOut(e.t / K.draw);
      for (const [m, w] of [[arc, 1], [arc2, 0.82]]) { const u = m.material.uniforms; u.uP.value = rev; u.uA.value = 0.93 * w * (1 - smooth(0.45, 1, k)); }
      fl.material.uniforms.uA.value = ART.intensity * 0.5 * (1 - smooth(0, 0.16, e.t));
    });
    e.g.position.copy(P3(pc.pos));
    // right-to-left stroke like the motion (ar_sweep): revealed from the caster's right side
    const arc = this.pnt(e, 7, light(col, 0.55), col, 4), arc2 = this.pnt(e, 7, light(c2, 0.5), c2, 3);
    for (const [m, s, y] of [[arc, r * 2, K.y], [arc2, r * 2 * 0.8, K.y - 0.03]]) { this._flat(m, s, y, f); m.material.uniforms.uQ.value = ha; m.material.uniforms.uT.value = -1; }
    const fl = this.spr(e, 0, light(col, 0.6), col, 5); this._flat(fl, r * 1.3, K.y - 0.05, f); fl.position.add(_a.set(f.x, 0, -f.z).multiplyScalar(r * 0.55));
    // paint flung off the end of the stroke (caster's left) — stays inside the arc radius
    const end = P3(pc.pos).add(_a.set(f.x, 0, -f.z).applyAxisAngle(UP, ha * 0.8).multiplyScalar(r * 0.8)); end.y += K.y;
    this._bits(end, lite() ? 2 : 5, { cols: [col, c2, C.yel], ground: pc.pos.y || 0, dir: { x: _a.x, z: _a.z }, fan: 0.5, speed: [0.8, 1.8], up: [0.6, 1.8] });
    (o.hits || []).forEach((t, i) => this.splash(t, { col: i % 2 ? c2 : col, big: i === 0 }));
    return e;
  }

  // ------------------------------------------------------------------ 잉크 웅덩이
  pool(pos, o = {}) {
    if (!this._ok()) return null;
    const K = ART.pool, r = o.r || 2.4, dur = o.dur || 6, g0 = P3(pos), low = lite(); let ended = -1, bubT = 0.3;
    const e = this._fx('pool', dur + K.fade + 0.2, (e, dt) => {
      const t = e.t, grow = 0.5 + 0.5 * easeOut(t / (K.fall + K.grow)), out = ended >= 0 ? 1 - smooth(0, K.fade, t - ended) : 1;
      const u = pl.material.uniforms; u.uP.value = Math.max(0.001, grow * (0.85 + 0.15 * out)); u.uT.value = t; u.uA.value = 0.92 * smooth(0, 0.03, t) * out;
      // the ink blob drops in from above and bursts into the pool
      const d = clamp01(t / K.fall); bl.position.y = 1.2 * (1 - d * d) + 0.1; bl.scale.set(0.3 * (1 - 0.2 * d), 0.3 * (1 + 0.5 * d), 0.3 * (1 - 0.2 * d)); bl.material.uniforms.uA.value = t < K.fall ? 1 : 0;
      rm.material.uniforms.uA.value = ART.intensity * 0.5 * (1 - smooth(0, 0.35, t)); this._flat(rm, r * 2 * (0.3 + 0.7 * grow), 0.09);
      if (ended < 0 && t > K.fall + K.grow && !low) { bubT -= dt; if (bubT <= 0) { bubT = K.bubbles * rnd(0.6, 1.4); const a = rnd(0, 6.28), rr = Math.sqrt(Math.random()) * r * 0.75; this._bubble(_a.set(g0.x + Math.cos(a) * rr, g0.y + 0.1, g0.z + Math.sin(a) * rr)); } }
      if (ended < 0 && t >= dur) e.end();
    });
    e.g.position.copy(g0);
    const pl = this.pnt(e, 6, C.inkHi, C.ink, 2); this._flat(pl, r * 2 / 0.98, 0.06);   // wobbly rim stays inside the real radius
    const bl = this.solid(e, this.geo.art_blob, { tint: 0x221a33, rim: C.inkHi, spec: 1.2 }), rm = this.spr(e, 1, C.violet, C.violetB, 3);
    let landed = false;
    const land = this._fx('poolland', K.fall + 0.05, (x) => { if (!landed && x.t >= K.fall) { landed = true; this._bits(g0.clone().setY(g0.y + 0.15), low ? 3 : 8, { cols: [0x221a33, 0x3a2a5a], ground: g0.y, speed: [1.2, r * 1.3], up: [1.2, 2.6], size: [0.05, 0.1], life: 0.5 }); } });
    void land;
    /** a damage tick landed on these targets: one ripple ring from the centre and a small ink splash on each of them */
    e.pulse = (ts) => {
      if (e.dead || ended >= 0) return;
      const fx = this._fx('poolrip', 0.5, (x) => { const k = x.t / 0.5; this._flat(rg, r * 2 * (0.2 + 0.8 * easeOut(k)), 0.1); rg.material.uniforms.uA.value = ART.intensity * 0.55 * (1 - smooth(0.2, 1, k)); });
      fx.g.position.copy(g0); const rg = this.spr(fx, 1, C.violet, C.violetB, 3);
      for (const t of (ts || []).slice(0, low ? 2 : 5)) { const at = P3(t.pos); at.y += 0.25; this._bits(at, low ? 1 : 3, { cols: [0x221a33, C.inkHi], ground: t.pos.y || 0, speed: [0.5, 1.2], up: [1.4, 2.4], size: [0.04, 0.07], life: 0.42 }); }
    };
    e.end = () => { if (ended < 0) { ended = e.t; e.life = Math.min(e.life, e.t + K.fade); } };
    return e;
  }
  _bubble(at) {
    const p = at.clone(), e = this._fx('bubble', 0.4, (e) => { const k = e.t / 0.4; this._flat(m, 0.12 + 0.3 * easeOut(k), 0); m.material.uniforms.uA.value = ART.intensity * 0.7 * (1 - smooth(0.4, 1, k)); });
    e.g.position.copy(p); const m = this.spr(e, 1, C.violet, C.inkHi, 3);
  }

  // ------------------------------------------------------------------ 색칠 표식
  mark(t, o = {}) {
    if (!this._ok() || !t) return null;
    if (t._artMark && !t._artMark.dead) this._free(t._artMark);
    const K = ART.mark, col = o.col ?? C.red, size = K.size * Math.min(1.5, 0.75 + (t.radius || 0.5) * 0.6); let gone = -1, popped = false;
    const e = this._fx('mark', (o.dur || 8) + 0.5, (e) => {
      const has = !t.dead && !t.removed && t.status && t.status.has && t.status.has('painted');
      if (gone < 0 && e.t > 0.15 && !has) { gone = e.t; e.life = e.t + 0.22;
        if (!popped && !t.removed) { popped = true; const at = P3(t.pos); at.y += artMid(t); this._splash(at, col, { big: true, ground: null, cols: [col, C.yel, C.white] }); } }
      const p = P3(t.pos); p.y += artMid(t); e.g.position.copy(p).addScaledVector(this.toCam, (t.radius || 0.5) + 0.25);
      const out = gone >= 0 ? 1 - smooth(0, 0.2, e.t - gone) : 1, pulse = 1 + 0.05 * Math.sin(e.t * 5);
      this._face(mk, size * pulse * (gone >= 0 ? 1 + 0.5 * (1 - out) : 0.8 + 0.2 * backOut(e.t / K.draw))); mk.material.uniforms.uP.value = clamp01(e.t / K.draw); mk.material.uniforms.uA.value = 0.9 * out;
      this._face(fl, size * 1.2); fl.material.uniforms.uA.value = ART.intensity * 0.9 * smooth(K.draw * 0.7, K.draw, e.t) * (1 - smooth(K.draw, K.draw + 0.18, e.t));
    });
    const mk = this.pnt(e, 10, light(col, 0.5), col, 6), fl = this.spr(e, 3, 0xffffff, light(col, 0.3), 7);
    const at = P3(t.pos); at.y += artMid(t); this._bits(at, lite() ? 2 : 4, { cols: [col, light(col, 0.3)], ground: t.pos.y || 0, life: 0.45 });
    t._artMark = e; return e;
  }

  // ------------------------------------------------------------------ 음파 파동
  wave(pc, o = {}) {
    if (!this._ok()) return null;
    const K = ART.wave, f = o.f || { x: 0, z: 1 }, r = o.r || 4.5, ha = (o.ang || 60) * Math.PI / 360, n = lite() ? 3 : K.n, I = ART.intensity * (lite() ? 0.7 : 1), arcs = [];
    const e = this._fx('wave', K.run + n * K.gap + 0.12, (e) => {
      arcs.forEach((m, i) => { const k = clamp01((e.t - i * K.gap) / K.run), rr = r * (0.22 + 0.78 * easeOut(k)); this._flat(m, rr * 2 / 0.9, K.y, f); m.material.uniforms.uA.value = k <= 0 ? 0 : I * (1.5 - i * 0.2) * smooth(0, 0.12, k) * (1 - smooth(0.6, 1, k)); });
    });
    e.g.position.copy(P3(pc.pos));
    for (let i = 0; i < n; i++) { const m = this.spr(e, 8, i % 2 ? C.violet : C.gold, i % 2 ? C.violetB : C.goldB, 5); m.material.uniforms.uQ.value = ha; arcs.push(m); }
    // two notes ride the wave front along the cone axis
    const from = P3(pc.pos); from.y += K.y + 0.2; const dir = new THREE.Vector3(f.x, 0, -f.z);
    for (let i = 0; i < (lite() ? 1 : 3); i++) { const d = dir.clone().applyAxisAngle(UP, (i - 1) * ha * 0.55); this._flyNote(from, d, r * 0.85, K.run + 0.1, i); }
    (o.hits || []).slice(0, 6).forEach((t, i) => this.projHit(t, { kind: 'note', idx: i }));
    return e;
  }
  _flyNote(from, dir, dist, life, idx) {
    const e = this._fx('flynote', life, (e) => { const k = e.t / life; e.g.position.copy(from).addScaledVector(dir, dist * easeOut(k)); e.g.position.y += Math.sin(k * Math.PI * 2 + idx) * 0.12;
      this._face(m, ART.note.size * 0.9); m.rotateZ(Math.sin(e.t * 14 + idx) * 0.3); m.material.uniforms.uA.value = smooth(0, 0.1, k) * (1 - smooth(0.7, 1, k)); });
    const m = this.solid(e, idx % 2 && this.geo.art_note2 ? this.geo.art_note2 : this.geo.art_note, { tint: idx % 2 ? C.violet : C.gold, rim: 0xffffff, glow: 0.4, spec: 0.8 }); m.renderOrder = 6;
  }

  // ------------------------------------------------------------------ 작은 불협화음
  discord(pc, o = {}) {
    if (!this._ok()) return null;
    const K = ART.discord, r = o.r || 2.6, I = ART.intensity * (lite() ? 0.55 : 1), g0 = P3(pc.pos), low = lite();
    const e = this._fx('discord', K.life, (e) => {
      const k = e.t / K.life, gr = easeOut(e.t / K.grow), sh = Math.sin(e.t * 90) * 0.03 * (1 - k);
      this._flat(j1, r * 2 * (0.3 + 0.7 * gr) * (1 + sh), 0.5); j1.rotateZ(e.t * 1.5); j1.material.uniforms.uA.value = I * 1.6 * (1 - smooth(0.3, 1, k));
      this._flat(j2, r * 2 * (0.2 + 0.72 * gr) * (1 - sh), 0.62); j2.rotateZ(-e.t * 2.2); j2.material.uniforms.uA.value = I * 1.2 * (1 - smooth(0.25, 0.9, k));
      this._face(fl, 1.5 * (0.5 + 0.7 * easeOut(k * 3))); fl.material.uniforms.uA.value = I * 1.2 * (1 - smooth(0, 0.4, k));
    });
    e.g.position.copy(g0);
    const j1 = this.spr(e, 9, C.violet, C.violetB, 5), j2 = this.spr(e, 9, C.sour, 0x6a8a1a, 5), fl = this.spr(e, 3, 0xffffff, C.violet, 6); fl.position.y = 1.0; j2.material.uniforms.uQ.value = 0.5;
    // broken notes tumble outwards (to the real radius at most), clashing colours
    this._bits(g0.clone().setY(g0.y + 1.0), low ? K.notesLite : K.notes, { geo: this.geo.art_note, cols: [C.violetB, C.sour, 0xff5a8a], size: [0.16, 0.24], speed: [r * 0.9, r * 1.6], up: [0.6, 1.8], ground: g0.y, life: 0.5, grav: 6, spin: true });
    (o.hits || []).slice(0, 6).forEach((t, i) => this.projHit(t, { kind: 'note', idx: i + 1 }));
    return e;
  }

  // ------------------------------------------------------------------ 가벼운 행진곡
  march(pc, o = {}) {
    if (!this._ok() || !pc) return null;
    if (pc._artMarch && !pc._artMarch.dead) this._free(pc._artMarch);
    const K = ART.march, dur = o.dur || 8, I = ART.intensity; let next = 0.05, n = 0, gone = -1;
    const e = this._fx('march', dur + 0.6, (e) => {
      const p = P3(pc.pos); e.g.position.copy(p);
      const has = !pc.dead && pc.status && pc.status.has && pc.status.has('haste');
      if (gone < 0 && e.t > 0.4 && !has) { gone = e.t; e.life = e.t + 0.3; }
      this._flat(st, 1.5 * (0.5 + 0.5 * easeOut(e.t / 0.25)), 0.08); st.rotateZ(e.t * 1.2); st.material.uniforms.uT.value = e.t; st.material.uniforms.uA.value = I * 0.9 * (1 - smooth(0.7, 1.3, e.t));
      if (gone < 0 && e.t >= next) { next += K.every * (lite() ? 1.6 : 1); const f = pc.facing || { x: 0, z: 1 }, side = n % 2 ? 0.28 : -0.28;
        this._hopNote(p.clone().add(_a.set(-f.x * 0.45 - f.z * side, 0.25, f.z * 0.45 - f.x * side)), n++); }
    });
    const st = this.spr(e, 11, C.gold, C.goldB, 3);
    for (let i = 0; i < (lite() ? 2 : 4); i++) { const a = i * Math.PI / 2 + 0.4; this._hopNote(P3(pc.pos).add(_a.set(Math.cos(a) * 0.7, 0.2, Math.sin(a) * 0.7)), i, 1.3); }
    pc._artMarch = e; return e;
  }
  _hopNote(at, idx, k = 1) {
    const K = ART.march, p0 = at.clone(), e = this._fx('hopnote', K.life, (e) => { const u = e.t / K.life; e.g.position.copy(p0); e.g.position.y += K.hop * k * (1 - Math.pow(1 - u, 2)) + Math.abs(Math.sin(u * Math.PI * 2)) * 0.12;
      this._face(m, ART.note.size * 0.8 * k * (0.6 + 0.4 * backOut(u * 3))); m.rotateZ(Math.sin(e.t * 9 + idx) * 0.3); m.material.uniforms.uA.value = smooth(0, 0.08, u) * (1 - smooth(0.6, 1, u)); });
    const m = this.solid(e, idx % 3 === 1 && this.geo.art_note2 ? this.geo.art_note2 : this.geo.art_note, { tint: idx % 2 ? C.violet : C.gold, rim: 0xffffff, glow: 0.35, spec: 0.8 }); m.renderOrder = 6;
  }

  // ------------------------------------------------------------------ 영감 충전
  inspire(pc, o = {}) {
    if (!this._ok() || !pc) return null;
    const K = ART.inspire, dur = o.dur || 2, I = ART.intensity, tick = o.tick || 0.5, geo = this.geo.tripo_bulb || this.geo.art_bulb; let gone = -1, full = false, step = -1;
    const e = this._fx('inspire', dur + 0.6, (e) => {
      const alive = o.alive ? o.alive() : true, p = P3(pc.pos); p.y += 1.75 + K.lift; e.g.position.copy(p);
      if (gone < 0 && ((e.t > 0.1 && !alive) || e.t >= dur)) { gone = e.t; full = e.t >= dur - 0.08; e.life = e.t + (full ? 0.45 : 0.25);
        if (full) { const fx = this._fx('ping', 0.4, (x) => { const k = x.t / 0.4; this._face(st, 1.9 * (0.5 + 0.6 * easeOut(k * 2))); st.material.uniforms.uA.value = I * 1.6 * (1 - smooth(0.1, 1, k)); this._face(rg, 1.5 * (0.3 + 0.7 * easeOut(k))); rg.material.uniforms.uA.value = I * 1.0 * (1 - smooth(0.2, 1, k)); });
          fx.g.position.copy(p); const st = this.spr(fx, 3, 0xffffff, C.gold, 7), rg = this.spr(fx, 1, C.gold, C.goldB, 6); } }
      const s = Math.floor(e.t / tick), lv = clamp01((s + 1) / Math.max(1, Math.round(dur / tick)));
      if (s !== step && gone < 0) { step = s; flick = 1; if (!lite()) for (let i = 0; i < 3; i++) this._mote(pc, i * 2.1 + s); }
      flick = Math.max(0, flick - (e.dt || 0.016) * 5);
      const out = gone >= 0 ? 1 - smooth(0, e.life - gone, e.t - gone) : 1, bob = Math.sin(e.t * 4) * 0.03;
      bl.position.y = bob; bl.scale.setScalar(K.size * (0.6 + 0.4 * backOut(e.t / 0.2)) * (1 + 0.12 * flick)); bl.rotation.set(0, 0, Math.sin(e.t * 3) * 0.08); bl.position.y -= K.size * 0.5;
      const u = bl.material.uniforms; u.uGlow.value = (0.1 + 0.9 * lv) * (0.75 + 0.5 * flick) * (full || gone < 0 ? 1 : 0.2); u.uA.value = out;
      this._face(gl, (0.9 + 1.3 * lv) * (1 + 0.3 * flick)); gl.material.uniforms.uA.value = I * (0.25 + 0.8 * lv) * out * (full || gone < 0 ? 1 : 0.2);
    });
    let flick = 0;
    const bl = this.solid(e, geo, { tint: 0xffffff, rim: C.warm, spec: 1.0 }), gl = this.spr(e, 0, C.warm, C.goldB, 3); bl.renderOrder = 6;
    return e;
  }
  _mote(pc, ph) {
    const e = this._fx('mote', 0.5, (e) => { const k = e.t / 0.5, p = P3(pc.pos), a = ph + k * 5, rr = 1.1 * (1 - k); e.g.position.set(p.x + Math.cos(a) * rr, p.y + 0.6 + k * 1.3, p.z + Math.sin(a) * rr);
      this._face(m, 0.22 * (1 - 0.5 * k)); m.material.uniforms.uA.value = ART.intensity * 1.2 * smooth(0, 0.2, k) * (1 - smooth(0.8, 1, k)); });
    const m = this.spr(e, 3, 0xffffff, C.gold, 6);
  }

  // ------------------------------------------------------------------ 즉흥 창작
  improv(pc, o = {}) {
    if (!this._ok() || !pc || !this.geo.art_scribble) return null;
    if (pc._artImprov && !pc._artImprov.dead) this._free(pc._artImprov);
    const K = ART.improv, dur = o.dur || 10, low = lite(), geoP = this.geo.tripo_palette || this.geo.art_palette; let gone = -1;
    const e = this._fx('improv', dur + 0.6, (e) => {
      const p = P3(pc.pos); e.g.position.copy(p);
      const has = !pc.dead && pc.status && pc.status.flag && pc.status.flag('inspired') > 0;
      if (gone < 0 && e.t > 0.3 && !has) { gone = e.t; e.life = e.t + 0.3; if (!pc.dead) this._splash(p.clone().setY(p.y + 1.9), C.yel, { ground: null, cols: PRIM, size: 0.7 }); }
      const out = gone >= 0 ? 1 - smooth(0, 0.28, e.t - gone) : 1;
      sc.forEach((m, i) => { const k = clamp01((e.t - i * 0.08) / K.draw), fade = 1 - smooth(K.draw + K.hold, K.draw + K.hold + 0.3, e.t - i * 0.08);
        m.material.uniforms.uRev.value = k; m.material.uniforms.uA.value = fade * out; m.rotation.set(TILT[i][0], e.t * (i % 2 ? -3.2 : 3.6) + i * 2.1, TILT[i][1]); m.position.y = 0.55 + i * 0.42; m.scale.setScalar(K.size * (1 - i * 0.1) * (1 + 0.25 * smooth(K.draw + K.hold, K.draw + K.hold + 0.3, e.t))); });
      // afterwards: a small palette floats over the left shoulder while the buff lasts
      const a = e.t * 1.3, show = smooth(K.draw, K.draw + 0.3, e.t) * out;
      pa.position.set(Math.cos(a) * 0.62, 1.55 + Math.sin(e.t * 2.2) * 0.06, Math.sin(a) * 0.62); pa.rotation.set(0.9, a * -1.0, 0.25); pa.scale.setScalar(0.26 * (0.4 + 0.6 * backOut(clamp01((e.t - K.draw) / 0.3)))); pa.material.uniforms.uA.value = show;
    });
    const TILT = [[0.25, 0.1], [-0.3, 0.35], [0.5, -0.4]];
    const sc = PRIM.slice(0, low ? 2 : 3).map((c) => { const m = this.solid(e, this.geo.art_scribble, { tint: c, rim: light(c, 0.6), glow: 0.25, spec: 0.3 }); m.renderOrder = 6; return m; });
    const pa = this.solid(e, geoP, { spec: 0.4, rim: C.warm }); pa.renderOrder = 6;
    pc._artImprov = e; return e;
  }

  // ------------------------------------------------------------------ 작은 걸작
  canvas(pos, o = {}) {
    if (!this._ok()) return null;
    const K = ART.canvas, g0 = P3(pos), f = o.f || { x: 0, z: 1 }, I = ART.intensity, life = K.pop + K.hold + K.fade, geo = this.geo.tripo_canvas || this.geo.art_frame;
    const yaw = Math.atan2(-f.x, f.z) + Math.PI;     // the picture faces back towards the painter
    const e = this._fx('canvas', life, (e) => {
      const t = e.t, k = backOut(t / K.pop), out = smooth(K.pop + K.hold, life, t);
      fr.scale.set(K.size * k, K.size * k * (1 - 0.15 * out), K.size * k); fr.rotation.set(-0.5 * out, yaw + Math.sin(t * 20) * 0.04 * (1 - smooth(0, 0.3, t)), 0); fr.position.set(-f.x * 0.25 * (1 + out), 0.02, f.z * 0.25 * (1 + out));
      fr.material.uniforms.uA.value = 1 - out; fr.material.uniforms.uGlow.value = 0.5 * (1 - smooth(0, 0.3, t));
      this._face(fl, 2.2 * (0.5 + 0.6 * easeOut(t / 0.12))); fl.material.uniforms.uA.value = I * 1.3 * smooth(0, 0.03, t) * (1 - smooth(0.05, 0.3, t));
      this._flat(rg, 2.0 * (0.3 + 0.7 * easeOut(t / 0.3)), 0.08); rg.material.uniforms.uA.value = I * 0.9 * (1 - smooth(0.1, 0.4, t));
    });
    e.g.position.copy(g0);
    const fr = this.solid(e, geo, { rim: C.warm, spec: 0.9 }), fl = this.spr(e, 3, 0xffffff, C.gold, 7), rg = this.spr(e, 1, C.gold, C.goldB, 3); fl.position.y = 0.8;
    this._bits(g0.clone().setY(g0.y + 0.7), lite() ? 4 : 9, { cols: PRIM.concat([C.grn, C.vio]), ground: g0.y, speed: [1.0, 2.4], up: [1.8, 3.4], size: [0.05, 0.1], life: 0.6 });
    return e;
  }
  /** the little painted creature itself (its own material: lives in the scene as the summon's view, not in the pool) */
  critter() {
    if (!this._ok() || !this.geo.art_critter) return null;
    const geo = this.geo.tripo_critter || this.geo.art_critter, g = new THREE.Group(), m = new THREE.Mesh(geo, this._mat('solid')), mu = m.material.uniforms; mu.uSpec.value = 0.8; mu.uRim.value.setHex(C.warm);
    if (geo.userData.map) { mu.uMap.value = geo.userData.map; mu.uTex.value = 1; mu.uSpec.value = 0.5; }
    m.frustumCulled = false; g.add(m); m.scale.setScalar(0.01);
    // pops out of the canvas (scale in with a bounce), then hops as it walks and squashes on each landing
    g.userData.anim = (v, t) => { const k = backOut(clamp01((t - 0.12) / 0.3)), hop = Math.abs(Math.sin(t * 7)), sq = 1 + 0.12 * (1 - hop);
      m.scale.set(0.9 * k * sq, 0.9 * k / sq, 0.9 * k * sq); m.position.y = 0.16 * hop * k; m.rotation.z = Math.sin(t * 7) * 0.08; };
    return g;
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    const G = window.G, cam = G && G.render && G.render.cam;
    if (cam) { this.camQ.copy(cam.quaternion); cam.getWorldDirection(_a); this.toCam.copy(_a).multiplyScalar(-1); this.camR.set(1, 0, 0).applyQuaternion(cam.quaternion).setY(0).normalize(); }
    for (const e of this.live) { if (e.dead) continue; e.t += dt; e.dt = dt; try { e.update(e, dt); } catch (err) { console.warn('artfx', e.kind, err); e.t = e.life; } if (e.t >= e.life) this._free(e); }
    this.live = this.live.filter(e => !e.dead);
  }
  _free(e) { if (e.dead) return; e.dead = true; this.root.remove(e.g);
    if (e.rib) { e.g.remove(e.rib); this.ribs.push(e.rib); e.rib = null; }
    for (const m of e.items) { if (m.parent) m.parent.remove(m); (this.mpool[m.userData.kind] || (this.mpool[m.userData.kind] = [])).push(m); } e.items.length = 0; }
  clear() { for (const e of this.live) this._free(e); this.live = []; }
}
