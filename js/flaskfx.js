// 약사 약병 연출 공용 모듈 (2026-11-14 전면 개편: 밝은 카툰 3D '연금술' — 던짐 -> 깨짐 -> 퍼짐 -> 반응 -> 잔여물이 한 흐름).
// js/pharmfx.js(PharmFx)가 만들어 쓰며, 약병폭격(flask)·화염/냉각/부식 약병(proj -> burst)·회복진(circle 방울)·주사/보호막(gather)에 씀.
// 메시: assets/fx/fx_flask.glb.json (tools/blender/fx_flask.py) — 유리병·액체·코르크·금띠, 휜 유리 조각, 왕관 꽃잎, 액체 줄기 3종, 울퉁불퉁한 구(구름·불꽃 덩어리),
//       불꽃 혀, 물방울, 거품, 얼음 결정 2종, 불티, 원판. 텍스처 없음: 색·빛은 아래 셰이더(툰 2~3단 음영 + 딱딱한 하이라이트 + 프레넬 테).
// 그림 방식(사각형이 보이지 않게): 쿼드는 섬광 하나뿐이고 그것도 반지름 1 안에서 알파가 0이 됨; 구름·불꽃은 3D 덩어리 메시를 셰이더 잡음으로
//   계속 모양을 바꾸고(모핑) 잡음 경계로 녹여 없앰(dissolve); 바닥 얼룩·충격파·착탄 표시는 원판 셰이더(잡음 가장자리, 밖은 알파 0).
// 묶음 그리기: 같은 모양 입자는 InstancedMesh 하나(종류당 draw call 1) — 여러 폭발이 동시에 터져도 draw call이 늘지 않음. 입자 수 상한(cap)이 차면 새 입자를 버림.
// 층: 중심(작은 섬광·반응 핵, 짧고 강함) / 중간(액체 튀김·불꽃·구름, 또렷) / 바깥(유리 조각·불티·방울, 가볍고 빠름) / 바닥(얼룩·짧은 충격파·낮은 연무).
// 종류마다 속도·중력·저항이 다름: 유리 조각 빠르고 무거움, 큰 방울은 포물선, 연기는 천천히 부풀고 위로, 불티는 가볍게 위로 휘날림.
// 조명·후처리 추가 없음(폭발마다 PointLight 없음, 전역 블룸·노출 그대로). 저사양(휴대폰·그래픽 효과 끔): 입자 수만 줄이고 약병·섬광·얼룩·실제 범위는 유지.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const FLASK = {
  size: { held: 0.42, fly: 0.62, fall: 0.8 },        // 약병 높이 m (손 / 날아갈 때 / 약병폭격)
  trail: { span: 0.13, width: 0.16, a: 0.55 },        // 짧은 꼬리: 지난 0.13 s 경로만, 순간이동(1.5 m 넘게 뜀)이면 끊음
  flash: { t: 0.06, a: 1.8, size: 0.3 },            // 중심 섬광: 아주 짧게(흰색·옅은 노랑), 반지름 = r × size
  wave: { t: 0.2, a: 0.6 },                           // 바닥 충격파 (실제 범위 표시와 다르게 얇고 들쭉날쭉, 0.2 s)
  stain: { a: 0.52, grow: 0.12 },                     // 액체 얼룩
  cap: 1,                                             // 입자 수 배율 (저사양 0.5)
  // 원소별 색: liq = 액체 몸통, deep = 그늘 쪽 색, hot = 반응 핵·하이라이트, cloud / shade = 구름 밝은 면·그늘, accent = 포인트 한 가지
  pal: {
    fire:   { liq: 0xff7a1e, deep: 0xc22a10, hot: 0xfff3b0, cloud: 0x9a8a84, shade: 0x4a3a44, accent: 0xffd040, stain: 0x4a2414 },
    ice:    { liq: 0x7fdcff, deep: 0x2f74d8, hot: 0xffffff, cloud: 0xeaf8ff, shade: 0x8fb4e0, accent: 0xffffff, stain: 0x9fd8ff },
    acid:   { liq: 0xb6e83a, deep: 0x5c9a18, hot: 0xf6ffb0, cloud: 0xc8e070, shade: 0x6a8a3a, accent: 0xe8ff60, stain: 0x5e8a1a },
    poison: { liq: 0xb45cff, deep: 0x6a24c8, hot: 0xfff0ff, cloud: 0xe4a6ff, shade: 0x8a4ab8, accent: 0xff7ad8, stain: 0x5a2a8a },
    heal:   { liq: 0x5cf0c0, deep: 0x16a08a, hot: 0xfffbe0, cloud: 0xc8fff0, shade: 0x5ab0a0, accent: 0xffd860, stain: 0x2a8a70 },
    adren:  { liq: 0xff6a3a, deep: 0xc0301a, hot: 0xfff0c8, cloud: 0xffc0a0, shade: 0xa05040, accent: 0xffd040, stain: 0x8a2a14 },
    shield: { liq: 0x6ad0ff, deep: 0x2a70e0, hot: 0xf0fbff, cloud: 0xd8f2ff, shade: 0x6a9ad0, accent: 0xffffff, stain: 0x2a70e0 },
  },
};
const PAL = FLASK.pal;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
let _seed = 77; const rnd = (a, b) => { _seed = (_seed * 1664525 + 1013904223) >>> 0; return a + (_seed / 4294967296) * (b - a); };   // own generator: never touches the game's Math.random (hit / crit rolls)
const P3 = (p) => new THREE.Vector3(p.x, p.y || 0, -p.z);

// ------------------------------------------------------------------------------------------------ shaders
const NOISE = `
float h31(vec3 p){ p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }`;
// instanced solids: aP = (alpha, glow, seed, extra)
const INST_VS = `
attribute vec4 aP; varying vec3 vN, vV, vC, vO; varying vec4 vP;
void main(){ vec4 p = vec4(position, 1.); vec3 n = normal; vO = position;
#ifdef USE_INSTANCING
  p = instanceMatrix * p; n = mat3(instanceMatrix) * n;
#endif
#ifdef USE_INSTANCING_COLOR
  vC = instanceColor;
#else
  vC = vec3(1.);
#endif
  vP = aP; vec4 mv = modelViewMatrix * p; vN = normalize(normalMatrix * n); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
// uMode 0 glass shard, 1 liquid (toon), 2 ice (faceted), 3 spark (emissive, additive), 4 bubble (thin film)
const INST_FS = `
uniform float uMode; uniform vec3 uDeepK; varying vec3 vN, vV, vC, vO; varying vec4 vP;
void main(){
  vec3 n = normalize(vN), v = normalize(vV), L = normalize(vec3(-.4, .8, .5));
  if (!gl_FrontFacing) n = -n;
  float d = dot(n, L), ndv = max(0., dot(n, v)), fr = pow(1. - ndv, 2.6);
  float spec = step(.955, dot(reflect(-L, n), v));                    // hard cartoon highlight
  vec3 col = vC; float a = vP.x;
  vec3 c;
  if (uMode < .5) {                                                   // glass: mostly clear, white edges + one hard glint
    c = mix(col, vec3(1.), .55) * (.55 + .45 * fr) + vec3(1.) * spec * 1.3; a *= .28 + .62 * fr + .6 * spec;
  } else if (uMode < 1.5) {                                           // liquid: 3 tone bands, deeper hue in the shade, glossy glint, rim
    float band = smoothstep(-.05, .02, d) * .55 + smoothstep(.5, .56, d) * .45;
    c = mix(col * uDeepK, col, band) + col * fr * .45 + vec3(1., .98, .9) * spec * .85 + col * vP.y;
  } else if (uMode < 2.5) {                                           // ice: faceted, pale, bright facets toward the light, cold rim
    float band = smoothstep(.0, .1, d) * .5 + smoothstep(.55, .62, d) * .5;
    c = mix(col * vec3(.5, .72, 1.05), mix(col, vec3(1.), .6), band) + vec3(.75, .95, 1.) * fr * .8 + vec3(1.) * spec + col * vP.y;
  } else if (uMode < 3.5) {                                           // spark: hot core, coloured edge (additive)
    c = mix(col, vec3(1., .97, .85), ndv * ndv * .6) * (.75 + vP.y); gl_FragColor = vec4(c * a, 1.); return;
  } else {                                                            // bubble: clear centre, coloured rim, one glint
    c = col * (.6 + .9 * fr) + vec3(1.) * spec * 1.4; a *= .12 + .78 * fr + spec;
  }
  gl_FragColor = vec4(c, clamp(a, 0., 1.));
}`;
// morphing lumpy masses (clouds / flames / reaction core): aP = (alpha, heat, seed, erosion); uT = time
const BLOB_VS = `
uniform float uT, uAmp, uFreq; attribute vec4 aP; varying vec3 vN, vV, vC, vO, vW; varying vec4 vP;
${NOISE}
void main(){ vec3 n = normal; float s = aP.z * 17.;
  float k = vn(position * uFreq + vec3(s, s * .7, uT * 1.3 + s)) - .5;
  vec3 pos = position + n * k * uAmp * (1. + aP.w * .6);
  vO = position + vec3(s);
  vec4 p = vec4(pos, 1.);
#ifdef USE_INSTANCING
  p = instanceMatrix * p; n = mat3(instanceMatrix) * n;
#endif
#ifdef USE_INSTANCING_COLOR
  vC = instanceColor;
#else
  vC = vec3(1.);
#endif
  vP = aP; vW = (modelMatrix * p).xyz; vec4 mv = modelViewMatrix * p; vN = normalize(normalMatrix * n); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const BLOB_FS = `
uniform vec3 uShadeK, uHot, uMid, uRim; uniform float uT, uSoft; varying vec3 vN, vV, vC, vO, vW; varying vec4 vP;
${NOISE}
void main(){
  vec3 n = normalize(vN), v = normalize(vV), L = normalize(vec3(-.4, .8, .5));
  float d = dot(n, L), ndv = max(0., dot(n, v));
  float e = vn(vO * 2.6 + vec3(0., -uT * 1.8, 0.)) * .75 + vn(vO * 6.1) * .25;          // dissolve pattern
  if (e < vP.w) discard;                                                               // erosion eats the mass from its thin parts
  float edge = 1. - smoothstep(vP.w, vP.w + .07, e);                                   // a thin bright lip where it dissolves
  float heat = vP.y;
  vec3 c;
  if (heat > .01) {                                                                    // flame: bright core (faces the eye) -> yellow -> orange -> red rim
    float k = heat * (.3 + .7 * pow(ndv, 1.6)) + .08 * d;
    c = mix(uRim, uMid, smoothstep(.18, .45, k)); c = mix(c, uHot, smoothstep(.6, .88, k)); c = mix(c, vec3(1., .98, .9), smoothstep(.9, 1., k) * .6) * (.95 + .35 * heat);
    c += uMid * edge * .4;
  } else {                                                                             // puffy cloud: two tone bands + soft rim light
    float band = smoothstep(-.15, -.05, d) * .55 + smoothstep(.38, .48, d) * .45;
    c = mix(vC * uShadeK, vC, band) + vC * pow(1. - ndv, 3.) * .35 + vC * edge * .25;
  }
  float a = vP.x * mix(1., smoothstep(0., uSoft, ndv), .85);                            // soft silhouette: no hard card edge anywhere
  gl_FragColor = vec4(c, a);
}`;
// flat effects on the disc (radius 1, XZ): 0 stain, 1 shock wave, 2 landing mark, 3 alchemy glyph, 4 heal wave
const DISC_VS = `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const DISC_FS = `
uniform float uMode, uA, uGrow, uErode, uSeed, uT, uFront, uR, uRing; uniform vec3 uCol, uDeep, uHi; varying vec3 vP;
${NOISE}
void main(){
  vec2 q = vP.xz; float r = length(q), an = atan(q.y, q.x);
  if (uMode < .5) {                                                                     // stain: irregular wet edge + splatter dots + gloss, eaten away by uErode
    float edge = .62 + .16 * vn(vec3(cos(an) * 2.2, sin(an) * 2.2, uSeed)) + .1 * vn(vec3(cos(an) * 6., sin(an) * 6., uSeed + 3.));
    edge *= uGrow;
    float body = 1. - smoothstep(edge - .04, edge, r);
    vec2 g = q * 7. + uSeed; vec2 id = floor(g), f = fract(g) - .5; float hh = h31(vec3(id, uSeed));
    float dots = (1. - smoothstep(.12 + .18 * hh, .2 + .18 * hh, length(f))) * step(.62, hh) * smoothstep(edge * .9, edge + .05, r) * (1. - smoothstep(edge + .1, edge + .32 * uGrow, r));
    float m = max(body, dots);
    float er = vn(vec3(q * 3.2, uSeed + 7.)) * .7 + vn(vec3(q * 9., uSeed)) * .3;
    m *= smoothstep(uErode, uErode + .08, er + (1. - r) * .25);
    if (m < .01) discard;
    float rim = smoothstep(edge - .12, edge - .03, r) * body;
    float gloss = smoothstep(.55, .9, vn(vec3(q * 4. + vec2(-.6, .4), uSeed + 11.))) * (1. - smoothstep(0., edge * .8, r));
    vec3 c = mix(uDeep, uCol, .55 + .45 * rim) + uHi * gloss * .45;
    gl_FragColor = vec4(c, m * uA * (.75 + .25 * rim));
  } else if (uMode < 1.5) {                                                             // shock wave: thin uneven pale line racing outward (additive)
    float w = .016 + .026 * vn(vec3(cos(an) * 3., sin(an) * 3., uSeed));
    float line = exp(-pow((r - uFront) / w, 2.)), wake = smoothstep(uFront - .35, uFront, r) * (1. - smoothstep(uFront - .02, uFront, r)) * .25;
    gl_FragColor = vec4((uHi * line + uCol * (line * .6 + wake)) * uA, 1.);
  } else if (uMode < 2.5) {                                                             // landing mark: soft shadow growing as the flask nears + thin dashed ring at the REAL radius
    float sh = (1. - smoothstep(0., uGrow * .34, r)) * .55;
    float ring = exp(-pow((r - .97) / .016, 2.));
    if (sh + ring < .01) discard;
    gl_FragColor = vec4(mix(vec3(.08, .05, .1), uCol, ring), (sh + ring * uRing) * uA);
  } else if (uMode < 3.5) {                                                             // small alchemy glyph: circle + triangle + 3 dots (additive)
    float c1 = exp(-pow((r - .92) / .025, 2.)) + exp(-pow((r - .74) / .018, 2.)) * .7;
    float tri = 0.; for (int i = 0; i < 3; i++) { float b = float(i) * 2.0944 + uT; vec2 nn = vec2(cos(b), sin(b)); tri += exp(-pow((dot(q, nn) - .37) / .02, 2.)) * step(r, .76); }
    float dots = 0.; for (int i = 0; i < 3; i++) { float b = float(i) * 2.0944 + uT + 1.047; dots += 1. - smoothstep(.04, .07, length(q - vec2(cos(b), sin(b)) * .83)); }
    gl_FragColor = vec4((uCol * (c1 + tri * .8) + uHi * dots) * uA, 1.);
  } else {                                                                              // heal wave: soft liquid band flowing INWARD (uFront 1 -> 0) with ripples
    float w = .09 + .04 * sin(an * 5. + uT * 3.);
    float band = exp(-pow((r - uFront) / w, 2.)), rip = (.5 + .5 * sin((r - uFront) * 40.)) * band;
    gl_FragColor = vec4((uCol * band * .8 + uHi * rip * .35) * uA * (1. - smoothstep(.96, 1., r)), 1.);
  }
}`;
// flash: billboard (pharm_quad, uv 0..1), round core + uneven short rays; reaches 0 inside the radius (no square corners)
const FLASH_FS = `uniform float uA, uSeed; uniform vec3 uW, uC; varying vec2 vUv;
${NOISE}
void main(){ vec2 q = vUv * 2. - 1.; float r = length(q), an = atan(q.y, q.x);
  float core = exp(-r * r * 26.), glow = exp(-r * r * 9.) * .22;
  float ray = pow(vn(vec3(cos(an) * 3.5, sin(an) * 3.5, uSeed)), 3.) * exp(-r * 3.2) * (1. - smoothstep(.6, .95, r)) * 1.4;
  float k = (core + glow + ray) * (1. - smoothstep(.85, 1., r));
  gl_FragColor = vec4(mix(uC, uW, clamp(core * 1.4, 0., 1.)) * k * uA, 1.); }`;
const FLAT_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
// flask: glass shell (clear, coloured by the liquid behind it, white glints), liquid (toon, glint), cork / band (vertex colour toon)
const FLASK_VS = `attribute vec3 color; varying vec3 vN, vV, vC; void main(){ vC = color; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const FLASK_FS = `uniform float uMode, uA, uGlow; uniform vec3 uCol, uDeep; varying vec3 vN, vV, vC;
void main(){ vec3 n = normalize(vN), v = normalize(vV), L = normalize(vec3(-.4, .8, .5));
  float d = dot(n, L), ndv = max(0., dot(n, v)), fr = pow(1. - ndv, 2.4), spec = step(.94, dot(reflect(-L, n), v)), spec2 = step(.985, dot(reflect(-normalize(vec3(.6, .3, .7)), n), v));
  if (uMode < .5) { vec3 c = mix(vec3(.85, .95, 1.), vec3(1.), fr) * (.3 + .7 * fr) + vec3(1.) * (spec + spec2 * .8); gl_FragColor = vec4(c, uA * (.16 + .7 * fr + spec + spec2 * .7)); return; }
  float band = smoothstep(-.05, .02, d) * .55 + smoothstep(.45, .52, d) * .45;
  vec3 base = uMode < 1.5 ? uCol : vC;
  vec3 deep = uMode < 1.5 ? uDeep : vC * .55;
  vec3 c = mix(deep, base, band) + base * fr * .35 + vec3(1., .97, .9) * spec * (uMode < 1.5 ? .9 : .5) + base * uGlow;
  gl_FragColor = vec4(c, uA); }`;
// short soft trail ribbon (per flask, own geometry): aU = along (0 tail .. 1 head), aS = side (-1 .. 1)
const TRAIL_VS = `attribute float aU, aS; varying float vU, vS; void main(){ vU = aU; vS = aS; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const TRAIL_FS = `uniform vec3 uCol, uW; uniform float uA; varying float vU, vS;
void main(){ float across = 1. - vS * vS; float k = across * smoothstep(0., .85, vU) * uA; gl_FragColor = vec4(mix(uCol, uW, across * across * vU * .6) * k, 1.); }`;

const U = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v }]));
const ADD = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };

// ------------------------------------------------------------------------------------------------ instanced particle batch
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _v = new THREE.Vector3(), _c = new THREE.Color(), _y = new THREE.Vector3(0, 1, 0), _x = new THREE.Vector3(1, 0, 0);
class Batch {
  constructor(name, geo, mat, cap, root) {
    this.name = name; this.cap = cap; this.list = [];
    const g = geo.clone(); this.aP = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); this.aP.setUsage(THREE.DynamicDrawUsage); g.setAttribute('aP', this.aP);
    this.mesh = new THREE.InstancedMesh(g, mat, cap); this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.visible = false; this.mesh.renderOrder = mat.userData.order || 5; root.add(this.mesh);
  }
  add(p) { if (this.list.length >= this.cap) return null; p.age = -(p.delay || 0); this.list.push(p); return p; }
  update(dt, camQ) {
    const L = this.list; let n = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i]; p.age += dt;
      if (p.age < 0) { L[n++] = p; continue; }
      const u = p.age / p.life;
      if (u >= 1 || p.dead) { continue; }
      if (p.fn) p.fn(p, dt, u);
      else {
        p.vy -= (p.g || 0) * dt; if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vz *= k; if (p.dragY) p.vy *= k; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.gy != null && p.y < p.gy) { p.y = p.gy; if (p.bounce && Math.abs(p.vy) > 0.6) { p.vy = -p.vy * p.bounce; p.vx *= 0.55; p.vz *= 0.55; } else { p.vx = p.vz = p.vy = 0; if (!p.landed) { p.landed = p.age; if (p.onLand) p.onLand(p); } } }
      }
      L[n++] = p;
    }
    L.length = n;
    const M = this.mesh, aP = this.aP.array, ic = M.instanceColor.array; let k = 0;
    for (const p of L) {
      if (p.age < 0) continue;
      const u = clamp01(p.age / p.life);
      // orientation: 'vel' = +Y along the motion (drops / sparks stretch), 'cam' = billboard, else own quaternion spun about an axis
      if (p.orient === 'vel') { _v.set(p.vx, p.vy, p.vz); const sp = _v.length(); if (p.landed) _q.identity(); else if (sp > 1e-3) _q.setFromUnitVectors(_y, _v.multiplyScalar(1 / sp)); else _q.copy(p.q || _q.identity()); p.sp = sp; }
      else if (p.orient === 'cam') _q.copy(camQ);
      else { if (p.w) { p.q.multiply(_qa.setFromAxisAngle(p.ax, p.w * dt_)); } _q.copy(p.q); }
      const grow = p.grow ? easeOut(p.age / p.grow) : 1, out = p.shrink ? 1 - smooth(1 - p.shrink, 1, u) : 1, k0 = Math.max(1e-4, grow * out * (p.sk ? p.sk(u, p) : 1));
      _s.set(p.sx * k0 * (p.landed ? 1.35 : 1), p.sy * k0 * (p.landed ? 0.4 : p.stretch && p.sp ? 1 + p.sp * p.stretch : 1), p.sz * k0 * (p.landed ? 1.35 : 1));   // landed drops flatten into a small blob
      _p.set(p.x, p.y, p.z); _m4.compose(_p, _q, _s); _m4.toArray(M.instanceMatrix.array, k * 16);
      const a = p.a * (p.fadeIn ? smooth(0, p.fadeIn, p.age) : 1) * (p.fade ? 1 - smooth(1 - p.fade, 1, u) : 1);
      aP[k * 4] = a; aP[k * 4 + 1] = p.glF ? p.glF(u) : (p.glow || 0); aP[k * 4 + 2] = p.seed || 0; aP[k * 4 + 3] = p.erode ? smooth(p.erode[0], p.erode[1], u) * 1.05 : 0;
      _c.setHex(p.col); ic[k * 3] = _c.r; ic[k * 3 + 1] = _c.g; ic[k * 3 + 2] = _c.b; k++;
    }
    M.count = k; M.visible = k > 0;
    if (k) { M.instanceMatrix.needsUpdate = true; M.instanceColor.needsUpdate = true; this.aP.needsUpdate = true; }
  }
  clear() { this.list.length = 0; this.mesh.count = 0; this.mesh.visible = false; }
}
const _qa = new THREE.Quaternion(); let dt_ = 0;

// ------------------------------------------------------------------------------------------------ kit
export class FlaskKit {
  constructor(owner) { this.o = owner; this.root = new THREE.Group(); this.root.name = 'flaskfx'; owner.root.add(this.root); this.ready = false; this.geo = {}; this.B = {}; this.t = 0; this.trails = []; this.busy = 0; }
  load() {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const j = await (await fetch('assets/fx/fx_flask.glb.json')).json(), raw = atob(j.b64), u8 = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
      const g = await new Promise((res, rej) => new GLTFLoader().parse(u8.buffer, '', res, rej));
      g.scene.traverse(o => { if (o.isMesh) this.geo[o.name] = o.geometry; });
      const inst = (mode, o = {}) => { const m = new THREE.ShaderMaterial({ uniforms: U({ uMode: mode, uDeepK: new THREE.Color(o.deep ?? 0x8a6aa0) }), vertexShader: INST_VS, fragmentShader: INST_FS,
        transparent: true, depthWrite: !!o.dw, blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending, side: o.ds ? THREE.DoubleSide : THREE.FrontSide }); m.userData.order = o.order || 5; return m; };
      this.blobU = { uT: { value: 0 } };
      const blob = (o) => { const m = new THREE.ShaderMaterial({ uniforms: { ...this.blobU, ...U({ uAmp: o.amp, uFreq: o.freq, uShadeK: new THREE.Color(0x8a7aa8), uHot: new THREE.Color(0xffe85a), uMid: new THREE.Color(0xff8a1c), uRim: new THREE.Color(0xc8280c), uSoft: o.soft }) },
        vertexShader: BLOB_VS, fragmentShader: BLOB_FS, transparent: true, depthWrite: false }); m.userData.order = o.order; return m; };
      const liq = inst(1, { dw: true, order: 4, deep: 0x7a5a98 });       // liquid drops / petals / strands: opaque toon, vanish by shrinking (no sorting trouble)
      const B = this.B, R = this.root, cap = (n) => Math.max(8, Math.round(n));
      B.shardA = new Batch('shardA', this.geo.shard_1, inst(0, { ds: true, order: 6 }), cap(72), R);
      B.shardB = new Batch('shardB', this.geo.shard_2, inst(0, { ds: true, order: 6 }), cap(72), R);
      B.drop = new Batch('drop', this.geo.drop, liq, cap(180), R);
      B.petal = new Batch('petal', this.geo.petal, liq, cap(110), R);
      B.strandA = new Batch('strandA', this.geo.strand_a, liq, cap(60), R);
      B.strandB = new Batch('strandB', this.geo.strand_b, liq, cap(60), R);
      B.strandC = new Batch('strandC', this.geo.strand_c, liq, cap(60), R);
      B.bubble = new Batch('bubble', this.geo.bubble, inst(4, { order: 7 }), cap(110), R);
      B.iceA = new Batch('iceA', this.geo.ice_a, inst(2, { dw: true, order: 4 }), cap(40), R);
      B.iceB = new Batch('iceB', this.geo.ice_b, inst(2, { dw: true, order: 4 }), cap(60), R);
      B.spark = new Batch('spark', this.geo.spark, inst(3, { add: true, order: 8 }), cap(200), R);
      B.cloud = new Batch('cloud', this.geo.blob, blob({ amp: 0.42, freq: 1.6, soft: 0.42, order: 6 }), cap(110), R);
      B.flame = new Batch('flame', this.geo.blob, blob({ amp: 0.4, freq: 2.2, soft: 0.22, order: 7 }), cap(100), R);   // fire = morphing puffs (no cones)
      B.core = new Batch('core', this.geo.blob, blob({ amp: 0.3, freq: 2.0, soft: 0.3, order: 8 }), cap(24), R);
      this.batches = Object.values(B);
      this.ready = true;
    })().catch(e => console.warn('flaskfx load', e));
    return this.loading;
  }
  /** pooled materials for PharmFx._m (kinds starting with 'k') */
  mat(kind) {
    switch (kind) {
      case 'kdisc': return new THREE.ShaderMaterial({ uniforms: U({ uMode: 0, uA: 0, uGrow: 1, uErode: 0, uSeed: 0, uT: 0, uFront: 0, uR: 1, uRing: 1, uCol: new THREE.Color(), uDeep: new THREE.Color(), uHi: new THREE.Color(1, 1, 1) }),
        vertexShader: DISC_VS, fragmentShader: DISC_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      case 'kdiscA': { const m = this.mat('kdisc'); m.blending = THREE.AdditiveBlending; return m; }
      case 'kflash': return new THREE.ShaderMaterial({ uniforms: U({ uA: 0, uSeed: 0, uW: new THREE.Color(1, 1, 1), uC: new THREE.Color() }), vertexShader: FLAT_VS, fragmentShader: FLASH_FS, ...ADD, depthTest: false });
      case 'kglass': return new THREE.ShaderMaterial({ uniforms: U({ uMode: 0, uA: 1, uGlow: 0, uCol: new THREE.Color(), uDeep: new THREE.Color() }), vertexShader: FLASK_VS, fragmentShader: FLASK_FS, transparent: true, depthWrite: false });
      case 'kliq': return new THREE.ShaderMaterial({ uniforms: U({ uMode: 1, uA: 1, uGlow: 0, uCol: new THREE.Color(), uDeep: new THREE.Color() }), vertexShader: FLASK_VS, fragmentShader: FLASK_FS });
      case 'ksolid': return new THREE.ShaderMaterial({ uniforms: U({ uMode: 2, uA: 1, uGlow: 0, uCol: new THREE.Color(), uDeep: new THREE.Color() }), vertexShader: FLASK_VS, fragmentShader: FLASK_FS });
    }
    return null;
  }
  disc(e, mode, add = false, order = 2) { const o = this.o, m = o._m(e, add ? 'kdiscA' : 'kdisc', this.geo.disc, order), u = m.material.uniforms; u.uMode.value = mode; u.uA.value = 0; u.uErode.value = 0; u.uGrow.value = 1; u.uSeed.value = rnd(0, 50); u.uRing.value = 1; return m; }
  flashQuad(e, pal, order = 9) { const m = this.o._m(e, 'kflash', this.o.geo.pharm_quad, order), u = m.material.uniforms; u.uA.value = 0; u.uSeed.value = rnd(0, 50); u.uC.value.setHex(pal.accent); u.uW.value.setHex(0xfffbe8); return m; }

  // ------------------------------------------------------------------ the flask itself (pooled meshes in a group)
  /** glass bottle + coloured liquid + cork + gold band; returns the group (unit height, bottom at 0 — centred by the caller) */
  bottle(e, pal) {
    const o = this.o, grp = new THREE.Group(), gl = o._m(e, 'kglass', this.geo.flask_glass, 6), lq = o._m(e, 'kliq', this.geo.flask_liquid, 4), ck = o._m(e, 'ksolid', this.geo.flask_cork, 4), bd = o._m(e, 'ksolid', this.geo.flask_band, 4);
    lq.material.uniforms.uCol.value.setHex(pal.liq); lq.material.uniforms.uDeep.value.setHex(pal.deep); lq.material.uniforms.uGlow.value = 0.18;
    for (const m of [gl, lq, ck, bd]) { m.position.set(0, -0.45, 0); m.material.uniforms.uA.value = 1; grp.add(m); }
    e.g.add(grp); return grp;
  }
  // ------------------------------------------------------------------ short soft trail (own geometry, pooled here)
  trail(pal) {
    const N = 10; let t = this.trails.pop();
    if (!t) { const g = new THREE.BufferGeometry(), pos = new Float32Array(N * 2 * 3), aU = new Float32Array(N * 2), aS = new Float32Array(N * 2), idx = [];
      for (let i = 0; i < N; i++) { aU[i * 2] = aU[i * 2 + 1] = i / (N - 1); aS[i * 2] = -1; aS[i * 2 + 1] = 1; if (i < N - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2); }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('aU', new THREE.BufferAttribute(aU, 1)); g.setAttribute('aS', new THREE.BufferAttribute(aS, 1)); g.setIndex(idx);
      const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: U({ uCol: new THREE.Color(), uW: new THREE.Color(1, 1, 1), uA: 0 }), vertexShader: TRAIL_VS, fragmentShader: TRAIL_FS, ...ADD, side: THREE.DoubleSide }));
      m.frustumCulled = false; m.renderOrder = 5; t = { m, pts: [], N }; }
    t.pts.length = 0; t.m.material.uniforms.uCol.value.setHex(pal.liq); t.m.material.uniforms.uA.value = 0; t.m.visible = false; this.root.add(t.m); return t;
  }
  trailPush(t, p, time) {
    const last = t.pts[t.pts.length - 1];
    if (last && last.p.distanceToSquared(p) > 2.25) t.pts.length = 0;                           // a jump (teleport / reuse): never connect
    if (!last || last.p.distanceToSquared(p) > 1e-6) t.pts.push({ p: p.clone(), t: time });
    while (t.pts.length > 2 && time - t.pts[1].t > FLASK.trail.span) t.pts.shift();
    while (t.pts.length > t.N) t.pts.shift();
  }
  trailDraw(t, time, a, w) {
    const P = t.pts, pos = t.m.geometry.attributes.position.array, N = t.N, toCam = this.o.toCam;
    if (P.length < 2) { t.m.visible = false; return; }
    t.m.visible = true; t.m.material.uniforms.uA.value = a;
    for (let i = 0; i < N; i++) {      // resample the kept points (oldest -> newest) into N slices, width tapers to the tail
      const f = i / (N - 1) * (P.length - 1), i0 = Math.min(P.length - 2, Math.floor(f)), k = f - i0;
      _p.copy(P[i0].p).lerp(P[i0 + 1].p, k); _v.copy(P[i0 + 1].p).sub(P[i0].p); _s.crossVectors(_v, toCam).normalize().multiplyScalar(w * (0.25 + 0.75 * i / (N - 1)));
      if (!isFinite(_s.x)) _s.set(0, 0, 0);
      pos.set([_p.x - _s.x, _p.y - _s.y, _p.z - _s.z, _p.x + _s.x, _p.y + _s.y, _p.z + _s.z], i * 6);
    }
    t.m.geometry.attributes.position.needsUpdate = true;
  }
  trailFree(t) { if (!t) return; this.root.remove(t.m); t.pts.length = 0; this.trails.push(t); }

  // ------------------------------------------------------------------ particles
  _n(n) { const low = this.o.low(); return Math.max(1, Math.round(n * (low ? 0.5 : 1) * FLASK.cap * (this.busy > 3 ? 0.65 : 1))); }
  P(b, o) { if (!this.B[b]) return null; if (!o.q && o.orient !== 'vel' && o.orient !== 'cam') o.q = new THREE.Quaternion(); return this.B[b].add(Object.assign({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, sx: 1, sy: 1, sz: 1, a: 1, life: 1, col: 0xffffff, seed: rnd(0, 1) }, o)); }
  q(ax, ang) { return new THREE.Quaternion().setFromAxisAngle(ax, ang); }
  /** quaternion that turns local +X to the horizontal direction a (three coords: x, -z), tilted up by `up` rad, rolled by `roll` */
  qDir(a, up = 0, roll = 0) { const q = new THREE.Quaternion().setFromAxisAngle(_y, -a); q.multiply(_qa.setFromAxisAngle(new THREE.Vector3(0, 0, 1), up)); if (roll) q.multiply(_qa.setFromAxisAngle(_x, roll)); return q; }
  randAx() { return new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize(); }

  // ------------------------------------------------------------------ ground fit (slope): quaternion turning the disc's +Y to the ground normal
  groundQ(pos, r) {
    const geo = window.G && window.G.zone && window.G.zone.geo; if (!geo || !geo.ground) return new THREE.Quaternion();
    try { const h = (x, z) => geo.ground(x, z).y, d = Math.max(0.6, r * 0.7), hx = h(pos.x + d, pos.z) - h(pos.x - d, pos.z), hz = h(pos.x, pos.z + d) - h(pos.x, pos.z - d);
      const n = new THREE.Vector3(-hx / (2 * d), 1, hz / (2 * d)).normalize(); if (n.y < 0.75) n.set(0, 1, 0); return new THREE.Quaternion().setFromUnitVectors(_y, n); } catch (err) { return new THREE.Quaternion(); }
  }

  update(dt, camQ) { if (!this.ready) return; this.t += dt; dt_ = dt; this.blobU.uT.value = this.t; for (const b of this.batches) b.update(dt, camQ); }
  clear() { if (this.batches) for (const b of this.batches) b.clear(); this.busy = 0; }
  stats() { const o = {}; if (this.batches) for (const b of this.batches) o[b.name] = b.list.length; return o; }
}
export { rnd as flaskRnd, PAL as FLASK_PAL };

// ================================================================================================ effects
const G9 = 9.8;
Object.assign(FlaskKit.prototype, {
  _bur(n) { return this._n(n); },
  /** falling flask of 약병폭격: spins down from the sky onto the exact impact point (same point the blast uses); a soft shadow grows under it
   *  and a thin dashed ring marks the REAL blast radius — both are gone at the impact (no lingering circles) */
  fall(pos, o = {}) {
    const O = this.o, pal = PAL[o.elem] || PAL.poison, fall = o.fall || 0.5, R = o.r || 1.5, c = P3(pos), H = 6.5;
    const dx = rnd(-0.7, 0.7), dz = rnd(-0.7, 0.7), ax = this.randAx(), sp = rnd(9, 14) * (rnd(0, 1) < 0.5 ? -1 : 1), tr = this.trail(pal), P = new THREE.Vector3();
    const e = O._fx('ffall', fall, (e) => {
      const k = clamp01(e.t / fall), f = k * k;
      P.set(c.x + dx * (1 - f), c.y + 0.32 + H * (1 - f), c.z + dz * (1 - f)); bt.position.copy(P);
      bt.quaternion.setFromAxisAngle(ax, e.t * sp);
      this.trailPush(tr, P, e.t); this.trailDraw(tr, e.t, FLASK.trail.a * smooth(0.05, 0.3, k), FLASK.trail.width * 1.2);
      mk.material.uniforms.uGrow.value = 0.35 + 0.65 * k; mk.material.uniforms.uA.value = smooth(0, 0.25, k) * (1 - smooth(0.96, 1, k)); mk.material.uniforms.uT.value = e.t;
    });
    e.onFree = () => this.trailFree(tr);
    const bt = this.bottle(e, pal); bt.scale.setScalar(FLASK.size.fall);
    const mk = this.disc(e, 2, false, 2); mk.position.set(c.x, c.y + 0.04, c.z); mk.quaternion.copy(this.groundQ(pos, R)); mk.scale.setScalar(R); mk.material.uniforms.uCol.value.setHex(pal.liq); mk.material.uniforms.uRing.value = 0.6;
    return e;
  },
  /** thrown flask (화염·냉각·부식 + 약병폭격의 손): handle { set(pos), release(), dispose() } — the projectile drives it; the burst happens where it lands */
  proj(pos, o = {}) {
    const O = this.o, pal = PAL[o.elem] || PAL.poison, last = P3(pos), vel = new THREE.Vector3(0, 0, 1), ax = new THREE.Vector3(1, 0, 0), sp = rnd(13, 17) * (rnd(0, 1) < 0.5 ? -1 : 1);
    let t0 = o.held ? null : 0, drip = 0, spin = 0, tr = null;
    const e = O._fx('fproj', 8, (e, dt) => {
      const fly = t0 != null, ft = fly ? e.t - t0 : 0;
      bt.position.copy(last);
      if (fly) { spin += sp * dt; _v.crossVectors(vel, _y); if (_v.lengthSq() > 1e-4) ax.copy(_v.normalize()); bt.quaternion.setFromAxisAngle(ax, spin); bt.scale.setScalar(FLASK.size.held + (FLASK.size.fly - FLASK.size.held) * easeOut(ft / 0.1)); }
      else { bt.quaternion.setFromAxisAngle(_x, 0.25); bt.scale.setScalar(FLASK.size.held); }
      if (fly) { if (!tr) tr = this.trail(pal); this.trailPush(tr, last, e.t); this.trailDraw(tr, e.t, FLASK.trail.a * smooth(0, 0.06, ft), FLASK.trail.width);
        drip -= dt; if (drip <= 0 && !O.low()) { drip = rnd(0.05, 0.09); const s = rnd(0.035, 0.06); this.P('drop', { x: last.x, y: last.y - 0.1, z: last.z, vx: vel.x * 0.6, vy: -0.5, vz: vel.z * 0.6, g: 9, orient: 'vel', stretch: 0.1, sx: s, sy: s * 1.2, sz: s, col: pal.liq, life: 0.32, shrink: 0.5 }); } }
    });
    e.onFree = () => this.trailFree(tr);
    const bt = this.bottle(e, pal);
    return { set: (p) => { const n = P3(p); _v.copy(n).sub(last); const d = _v.length(); if (d > 1e-4 && d < 1.5) vel.copy(_v).multiplyScalar(1 / d); last.copy(n); },
      release: () => { if (t0 == null) t0 = e.t; }, dispose: () => O._free(e), pos: () => last.clone() };
  },
  /** the impact: flask gone -> glass + liquid burst at the same point -> chemical reaction -> residue. o.r = REAL blast radius (nothing big
   *  drawn outside it), o.linger = status seconds (frost / puddle stay faintly), o.rain = 약병폭격 (crown + clouds every time), o.big = its last flask,
   *  o.scale = visual size variation (only the look; damage is never touched here) */
  burst(pos, o = {}) {
    const O = this.o, elem = o.elem || 'poison', pal = PAL[elem] || PAL.poison, r = o.r || 1.5, linger = o.linger || 0, rain = !!o.rain, big = !!o.big;
    const S = (o.scale || 1) * (big ? 1.25 : 1), c = P3(pos), gy = c.y, y0 = gy + 0.32, n = (k) => this._n(k), ice = elem === 'ice', fire = elem === 'fire', acid = elem === 'acid', poison = elem === 'poison';
    const hold = acid && linger ? Math.min(3.2, linger * 0.6) : ice && linger ? Math.min(1.6, 0.5 + linger * 0.3) : fire ? 0.45 : 0.6;   // residue stays this long, then is eaten away
    const life = hold + 0.9; this.busy++;
    const e = O._fx('fburst', life, (e) => {
      const t = e.t;
      fl.visible = t < FLASK.flash.t + 0.03; if (fl.visible) { fl.quaternion.copy(O.camQ); fl.scale.setScalar(r * FLASK.flash.size * 2 * S * (0.7 + 0.5 * easeOut(t / 0.05))); fl.material.uniforms.uA.value = FLASK.flash.a * (big ? 1.3 : 1) * smooth(0, 0.012, t) * (1 - smooth(0.02, FLASK.flash.t + 0.03, t)); }
      wv.visible = t < FLASK.wave.t; if (wv.visible) { const u = wv.material.uniforms; u.uFront.value = 0.12 + 0.83 * easeOut(t / FLASK.wave.t); u.uA.value = FLASK.wave.a * (1 - smooth(0.06, FLASK.wave.t, t)); }
      const su = st.material.uniforms; su.uGrow.value = 0.3 + 0.7 * easeOut(t / (acid ? 0.3 : FLASK.stain.grow)); su.uErode.value = smooth(hold, life - 0.05, t); su.uA.value = FLASK.stain.a * (fire ? 0.85 : 1) * smooth(0, 0.03, t);
    });
    e.onFree = () => { this.busy = Math.max(0, this.busy - 1); };
    // ---- ground: stain (scorch / frost / puddle) + short pressure wave
    const st = this.disc(e, 0, false, 2), gq = this.groundQ(pos, r); st.position.set(c.x, gy + 0.035, c.z); st.quaternion.copy(gq); st.rotateY(rnd(0, 6.283)); st.scale.setScalar(r * Math.min(1, 0.88 * S));
    const su = st.material.uniforms;
    if (fire) { su.uCol.value.setHex(0x5a3020); su.uDeep.value.setHex(0x24140c); su.uHi.value.setHex(0xff9a40); }
    else if (ice) { su.uCol.value.setHex(0xe8f8ff); su.uDeep.value.setHex(0x8cc6f0); su.uHi.value.setHex(0xffffff); }
    else { su.uCol.value.setHex(pal.liq); su.uDeep.value.setHex(pal.stain); su.uHi.value.setHex(0xffffff); }
    const wv = this.disc(e, 1, true, 3); wv.position.set(c.x, gy + 0.05, c.z); wv.quaternion.copy(gq); wv.scale.setScalar(r * 0.98); wv.material.uniforms.uCol.value.setHex(pal.liq); wv.material.uniforms.uHi.value.setHex(0xfff8e0);
    // ---- centre: very short white / pale-yellow flash + small bright reaction core
    const fl = this.flashQuad(e, pal); fl.position.set(c.x, y0, c.z);
    this.P('core', { x: c.x, y: y0, z: c.z, sx: r * (fire ? 0.2 : 0.13) * S, sy: r * (fire ? 0.2 : 0.13) * S, sz: r * (fire ? 0.2 : 0.13) * S, grow: 0.03, life: fire ? (big ? 0.22 : 0.16) : 0.1, glow: fire ? 1 : 0, col: pal.hot, erode: [0.25, 1], q: new THREE.Quaternion() });
    // ---- outer: glass shards (fast, heavy, bounce once, stay inside the radius)
    for (let i = 0, N = n(fire ? 6 : 8); i < N; i++) { const a = rnd(0, 6.283), hs = r * 3 * rnd(0.45, 0.9), s = rnd(0.07, 0.15) * Math.min(1.3, S);
      this.P(i % 2 ? 'shardA' : 'shardB', { x: c.x, y: y0, z: c.z, vx: Math.cos(a) * hs, vz: Math.sin(a) * hs, vy: rnd(2.4, 4.6), g: 16, drag: 3, gy: gy + 0.03, bounce: 0.28, life: rnd(0.5, 0.8), q: this.q(this.randAx(), rnd(0, 6)), ax: this.randAx(), w: rnd(10, 22), sx: s, sy: s, sz: s, col: 0xdff4ff, a: 1, shrink: 0.3 }); }
    // ---- middle: radial liquid streaks — uneven angle, length, thickness and curvature (never a regular star)
    const nStr = fire ? 0 : n(acid ? 6 : 7), sb = ['strandA', 'strandB', 'strandC'];
    for (let i = 0; i < nStr; i++) { const a = (i + rnd(-0.38, 0.38)) / nStr * 6.283, L = r * rnd(0.2, 0.5) * Math.min(1.25, S), th = (acid ? 1.15 : 0.8) * rnd(0.6, 1.3) * Math.min(1.25, S), yy = y0 - 0.12, life = acid ? rnd(0.38, 0.55) : rnd(0.22, 0.34);
      this.P(sb[Math.floor(rnd(0, 2.999))], { x: c.x, y: yy, z: c.z, q: this.qDir(a, rnd(0.15, 0.95), rnd(0, 6.283)), col: pal.liq, life, L, th, y0: yy,
        fn: (p, dt, u) => { const g = easeOut(p.age / 0.07); p.sx = p.L * (0.2 + 0.8 * g) * (1 + 0.12 * u); p.sy = p.sz = p.th * Math.pow(1 - u, acid ? 0.45 : 0.7); p.y = p.y0 - u * u * (acid ? 0.35 : 0.2); } }); }
    // ---- big drops on parabolas (land inside the radius); acid drops are fatter, slower and stay a moment as sticky blobs
    for (let i = 0, N = n(acid ? 12 : fire ? 5 : 9); i < N; i++) { const a = rnd(0, 6.283), vy = acid ? rnd(1.6, 3.2) : rnd(2.6, 4.8), Tf = (vy + Math.sqrt(vy * vy + 2 * G9 * 0.3)) / G9, hs = Math.min(r * rnd(0.9, 2.4), r * rnd(0.55, 0.95) / Tf), s = (acid ? rnd(0.09, 0.16) : rnd(0.06, 0.12)) * Math.min(1.3, S), stay = acid ? rnd(0.4, 0.9) : 0.12;
      this.P('drop', { x: c.x, y: y0, z: c.z, vx: Math.cos(a) * hs, vz: Math.sin(a) * hs, vy, g: G9, gy: gy + 0.03, orient: 'vel', stretch: acid ? 0.16 : 0.1, sx: s, sy: s * 1.15, sz: s, col: ice ? 0xc8f0ff : pal.liq, life: Tf + stay, shrink: stay / (Tf + stay) + 0.05 }); }
    // ---- crown splash (petals rise and fall back) — 약병폭격 always; poison / acid flasks; ice petals freeze instead
    if (!fire && !ice) for (let i = 0, N = n(rain ? 8 : 7); i < N; i++) { const a = (i + rnd(-0.3, 0.3)) / N * 6.283, L = r * rnd(0.28, 0.5) * Math.min(1.3, S), rr = r * 0.08, gT = acid ? 0.14 : 0.09, life = acid ? rnd(0.55, 0.7) : rnd(0.36, 0.46);
      this.P('petal', { x: c.x + Math.cos(a) * rr, y: gy + 0.02, z: c.z + Math.sin(a) * rr, q: this.qDir(a, rnd(-0.15, 0.2)), col: pal.liq, life, L,
        fn: (p, dt, u) => { const g = easeOut(p.age / gT), k = p.L * g * (1 - smooth(0.45, 1, u)); p.sx = k; p.sy = k * (1 - 0.4 * smooth(0.4, 1, u)); p.sz = k; } }); }
    // ---- reaction clouds: puffy masses that swell then dissolve fast (never one opaque ball on the centre: they sit off-centre and rise)
    const nCl = fire ? n(2) : ice ? 0 : acid ? 0 : n(big ? 5 : 3);
    for (let i = 0; i < nCl; i++) { const a = rnd(0, 6.283), rr = r * rnd(0.15, 0.42), s = r * rnd(0.18, 0.28) * S, d = fire ? rnd(0.08, 0.16) : rnd(0, 0.06);
      this.P('cloud', { x: c.x + Math.cos(a) * rr, y: gy + (fire ? rnd(0.6, 1.0) : rnd(1.0, 1.4)), z: c.z - Math.sin(a) * rr, vy: rnd(0.7, 1.3), vx: Math.cos(a) * 0.4, vz: -Math.sin(a) * 0.4, drag: 1.5, q: this.q(this.randAx(), rnd(0, 6)), sx: s, sy: s * 0.9, sz: s,
        grow: 0.13, sk: (u) => 1 + 0.35 * u, erode: [0.3, 1], a: fire ? 0.5 : 0.5, col: pal.cloud, life: rnd(0.75, 1.05) * (big ? 1.2 : 1), delay: d }); }
    // ---- low vapour hugging the ground, spreading out slowly (acid = toxic mist, ice = cold flow) — thin, never hides who stands in it
    for (let i = 0, N = n(acid ? 5 : ice ? 5 : rain ? 3 : 2); i < N; i++) { const a = rnd(0, 6.283), s = r * rnd(0.18, 0.26), sp = rnd(0.7, 1.4);
      this.P('cloud', { x: c.x + Math.cos(a) * r * 0.15, y: gy + 0.1, z: c.z - Math.sin(a) * r * 0.15, vx: Math.cos(a) * sp, vz: -Math.sin(a) * sp, drag: 2.2, q: this.q(_y, rnd(0, 6)), sx: s, sy: s * 0.32, sz: s,
        grow: 0.2, sk: (u) => 1 + 0.6 * u, erode: [0.3, 1], a: acid ? 0.32 : 0.24, col: ice ? 0xf2fbff : pal.cloud, life: (acid ? Math.min(2.6, 1 + hold * 0.5) : rnd(0.9, 1.3)), delay: rnd(0.03, 0.1) }); }
    // ---- bubbles of different sizes popping out of the puddle (acid / poison); during the linger only a few
    if (acid || poison) for (let i = 0, N = n(acid ? 6 + Math.round(hold * 3) : 4); i < N; i++) { const a = rnd(0, 6.283), rr = Math.sqrt(rnd(0, 1)) * r * 0.65, s = rnd(0.05, 0.13) * (rnd(0, 1) < 0.2 ? 1.7 : 1);
      this.P('bubble', { x: c.x + Math.cos(a) * rr, y: gy + 0.06, z: c.z - Math.sin(a) * rr, vy: rnd(0.05, 0.25), sx: s, sy: s, sz: s, col: pal.liq, a: 0.95, q: new THREE.Quaternion(), life: rnd(0.35, 0.8), delay: rnd(0.08, Math.max(0.3, hold)),
        sk: (u) => u < 0.82 ? 0.35 + 0.65 * u / 0.82 : 1.35 * (1 - smooth(0.82, 1, u)) + 0.01 }); }
    // ---- fire: curling flame masses (bright core -> orange -> red rim, eaten by noise) + fast light embers + a little dark smoke
    if (fire) {
      for (let i = 0, N = n(big ? 12 : 9); i < N; i++) { const a = (i + rnd(-0.3, 0.3)) / N * 6.283, rr = r * rnd(0.22, 0.55), sz = r * rnd(0.09, 0.17) * Math.min(1.25, S), out = rnd(0.2, 0.8), l = rnd(0.3, 0.5);
        this.P('flame', { x: c.x + Math.cos(a) * rr, y: gy + rnd(0.12, 0.45), z: c.z + Math.sin(a) * rr, vx: Math.cos(a) * out, vz: Math.sin(a) * out, vy: rnd(1.4, 2.8), drag: 1.6, dragY: true,
          q: this.q(this.randAx(), rnd(0, 6)), ax: _y.clone(), w: rnd(3, 6) * (i % 2 ? 1 : -1), sx: sz, sy: sz * 1.35, sz, grow: rnd(0.04, 0.07), sk: (u) => 1 + 0.45 * u, glF: (u) => 1 - 0.8 * u, erode: [0.25, 1], a: 0.88, col: 0xffffff, life: l, delay: rnd(0, 0.09) }); }   // ring of puffs around the impact (the target in the middle stays readable)
      for (let i = 0, N = n(16); i < N; i++) { const a = rnd(0, 6.283), hs = rnd(1, 3.6), s = rnd(0.03, 0.05);
        this.P('spark', { x: c.x, y: y0, z: c.z, vx: Math.cos(a) * hs, vz: -Math.sin(a) * hs, vy: rnd(2.5, 6), g: 3, drag: 2.6, dragY: true, orient: 'vel', stretch: 0.06, sx: s * 0.6, sy: s * 1.6, sz: s * 0.6, col: pal.accent, glow: 0.1, a: 1, fade: 0.5, life: rnd(0.3, 0.65), delay: rnd(0, 0.1) }); }
    }
    // ---- ice: quick crystallisation (angular crystals snap up out of the splash), small shards flung fast, cold condensation sparkles
    if (ice) {
      for (let i = 0, N = n(big ? 9 : 7); i < N; i++) { const a = (i + rnd(-0.3, 0.3)) / N * 6.283, rr = r * rnd(0.3, 0.72), s = r * rnd(0.2, 0.34) * Math.min(1.25, S), lf = hold + rnd(0.2, 0.45), tilt = rnd(0.12, 0.32);
        const q = this.qDir(rnd(0, 6.283), 0); q.premultiply(_qa.setFromAxisAngle(new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)), -tilt));
        this.P(i % 2 ? 'iceB' : 'iceA', { x: c.x + Math.cos(a) * rr, y: gy - 0.03, z: c.z + Math.sin(a) * rr, q, sx: s, sy: s * rnd(0.9, 1.25), sz: s, grow: rnd(0.05, 0.08), shrink: 0.35 / lf, glow: 0.18, a: 1, col: 0xcff0ff, life: lf, delay: rnd(0, 0.05) + rr * 0.04 }); }
      for (let i = 0, N = n(5); i < N; i++) { const a = rnd(0, 6.283), hs = r * 3.2 * rnd(0.4, 0.9), s = rnd(0.045, 0.075);
        this.P('iceB', { x: c.x, y: y0, z: c.z, vx: Math.cos(a) * hs, vz: -Math.sin(a) * hs, vy: rnd(2, 4), g: 15, drag: 3.2, gy: gy, q: this.q(this.randAx(), rnd(0, 6)), ax: this.randAx(), w: rnd(8, 16), sx: s, sy: s * 1.6, sz: s, glow: 0.2, a: 1, col: 0xeafaff, life: rnd(0.45, 0.7), shrink: 0.3 }); }
      for (let i = 0, N = n(8); i < N; i++) { const a = rnd(0, 6.283), rr = r * rnd(0.1, 0.8), s = rnd(0.025, 0.04);
        this.P('spark', { x: c.x + Math.cos(a) * rr, y: gy + rnd(0.3, 1.0), z: c.z - Math.sin(a) * rr, vy: -rnd(0.2, 0.5), orient: 'cam', sx: s, sy: s, sz: s, col: 0xe8fbff, glow: 0.3, a: 1, fade: 0.6, life: rnd(0.4, 0.8), delay: rnd(0.05, 0.3) }); }
    }
    // ---- 약병폭격: a couple of tiny secondary pops inside the cloud (visual only — small, dim, no flash, no sound: they never read as extra hits)
    if (rain && !this.o.low()) for (let i = 0, N = big ? 3 : 1 + (rnd(0, 1) < 0.5 ? 1 : 0); i < N; i++) { const a = rnd(0, 6.283), rr = r * rnd(0.25, 0.5), s = r * rnd(0.06, 0.09);
      this.P('core', { x: c.x + Math.cos(a) * rr, y: gy + rnd(0.5, 0.9), z: c.z - Math.sin(a) * rr, sx: s, sy: s, sz: s, grow: 0.03, life: 0.12, glow: fire ? 0.6 : 0, col: pal.accent, erode: [0.2, 1], q: new THREE.Quaternion(), delay: rnd(0.1, 0.24) }); }
    // ---- poison / rain accent: a few pink motes
    if (poison) for (let i = 0, N = n(6); i < N; i++) { const a = rnd(0, 6.283), hs = rnd(0.6, 2), s = rnd(0.03, 0.05);
      this.P('spark', { x: c.x, y: y0 + 0.1, z: c.z, vx: Math.cos(a) * hs, vz: -Math.sin(a) * hs, vy: rnd(1.5, 3), g: 2, drag: 2.5, dragY: true, orient: 'cam', sx: s, sy: s, sz: s, col: pal.accent, glow: 0.3, a: 1, fade: 0.5, life: rnd(0.35, 0.6), delay: rnd(0.02, 0.12) }); }
    return e;
  },
});
const _v2 = new THREE.Vector3();

// ------------------------------------------------------------------------------------------------ heal / buff (회복진 맥동, 주사·보호막 모으기)
Object.assign(FlaskKit.prototype, {
  /** 광역 회복진: called on the REAL heal tick for the one healed — a soft mint liquid band flows INWARD across the circle, liquid droplets
   *  wrap the healed body in short curves and rise, a little gold sparkle. Brightest right at the tick, gone in ~0.7 s */
  healPulse(tgt, centre, r) {
    const O = this.o, pal = PAL.heal, c = P3(centre);
    const e = O._fx('fheal', 0.7, (e) => { const t = e.t, u = wv.material.uniforms; u.uFront.value = 0.98 - 0.85 * easeOut(t / 0.6); u.uA.value = 0.85 * (1 - smooth(0.25, 0.7, t)); u.uT.value = t; });
    const wv = this.disc(e, 4, true, 3); wv.position.set(c.x, c.y + 0.06, c.z); wv.quaternion.copy(this.groundQ(centre, r)); wv.scale.setScalar(r); wv.material.uniforms.uCol.value.setHex(pal.liq); wv.material.uniforms.uHi.value.setHex(pal.accent);
    if (!tgt || !tgt.pos) return e;
    const N = this._n(7);
    for (let i = 0; i < N; i++) { const a0 = i / N * 6.283 + rnd(-0.3, 0.3), w = rnd(4, 6) * (i % 2 ? 1 : -1), s = rnd(0.05, 0.085), h0 = rnd(0.1, 0.5), h1 = rnd(1.4, 2.0);
      this.P('drop', { col: i % 3 === 0 ? 0xbffff0 : pal.liq, life: rnd(0.55, 0.75), glow: 0.25, sx: s, sy: s * 1.3, sz: s, q: new THREE.Quaternion(), delay: i * 0.025,
        fn: (p, dt, u) => { const a = a0 + w * p.age, rr = 0.62 - 0.22 * u, P = tgt.pos; p.x = P.x + Math.cos(a) * rr; p.z = -P.z + Math.sin(a) * rr; p.y = (P.y || 0) + h0 + (h1 - h0) * easeOut(u);
          p.q.setFromUnitVectors(_y, _v2.set(-Math.sin(a) * w * rr, (h1 - h0) / p.life * 1.5, Math.cos(a) * w * rr).normalize()); const k = Math.sin(Math.PI * Math.min(1, u * 1.15)); p.sx = p.sz = s * k; p.sy = s * 1.6 * k; } }); }
    for (let i = 0, M = this._n(5); i < M; i++) { const a = rnd(0, 6.283), rr = rnd(0.2, 0.6), s = rnd(0.03, 0.05), P = tgt.pos;
      this.P('spark', { x: P.x + Math.cos(a) * rr, y: (P.y || 0) + rnd(0.6, 1.5), z: -P.z + Math.sin(a) * rr, vy: rnd(0.5, 1), orient: 'cam', sx: s, sy: s, sz: s, col: i % 2 ? pal.accent : 0xdffff4, glow: 0.2, fade: 0.6, life: rnd(0.45, 0.7), delay: rnd(0.05, 0.2) }); }
    return e;
  },
  /** 아드레날린 주사 / 약 보호막: liquid droplets gather from around the caster into one point (arrive at T s = the activation), one
   *  concentrated flash there, then a few rise along the body in a spiral; a small alchemy glyph turns at the feet for ~0.7 s */
  gather(pc, o = {}) {
    const O = this.o, pal = PAL[o.pal] || PAL.heal, T = o.T ?? 0.5, at = o.at || (() => new THREE.Vector3(pc.pos.x, (pc.pos.y || 0) + 1.1, -pc.pos.z));
    const e = O._fx('fgather', T + 0.9, (e) => { const t = e.t, P = P3(pc.pos);
      gy.position.set(P.x, P.y + 0.05, P.z); const gu = gy.material.uniforms; gu.uT.value = t * 0.8; gu.uA.value = 0.9 * smooth(0, 0.15, t) * (1 - smooth(T + 0.25, T + 0.7, t)) * (1 + 0.8 * Math.exp(-Math.pow((t - T) / 0.06, 2)));
      gy.scale.setScalar(0.95 + 0.1 * easeOut(t / 0.3));
      const ft = t - T; fl.visible = ft > -0.01 && ft < 0.12; if (fl.visible) { fl.position.copy(at()); fl.quaternion.copy(O.camQ); fl.scale.setScalar(0.9 * (0.7 + 0.5 * easeOut(ft / 0.05))); fl.material.uniforms.uA.value = 1.8 * smooth(-0.01, 0.01, ft) * (1 - smooth(0.02, 0.12, ft)); }
      if (pc.dead) e.t = e.life; });
    const gy = this.disc(e, 3, true, 3); gy.material.uniforms.uCol.value.setHex(pal.liq); gy.material.uniforms.uHi.value.setHex(pal.accent);
    const fl = this.flashQuad(e, pal); fl.material.uniforms.uC.value.setHex(pal.liq); fl.visible = false;
    const N = this._n(10), tmp = new THREE.Vector3();
    for (let i = 0; i < N; i++) { const a = i / N * 6.283 + rnd(-0.25, 0.25), R0 = rnd(1.1, 1.7), h = rnd(0.2, 1.5), d0 = rnd(0, Math.max(0.05, T * 0.35)), s = rnd(0.06, 0.1), w = rnd(4.5, 6.5) * (i % 2 ? 1 : -1), up = rnd(1.0, 1.6), rise = i % 3 === 0;
      this.P('drop', { col: i % 4 === 0 ? pal.hot : pal.liq, glow: 0.3, life: (T - d0) + (rise ? 0.6 : 0.04), delay: d0, q: new THREE.Quaternion(), sx: s, sy: s, sz: s,
        fn: (p, dt, u) => { const P = P3(pc.pos), tg = at(), k = Math.min(1, p.age / (T - d0));
          if (k < 1) { const e2 = k * k * (3 - 2 * k), aa = a + 1.2 * e2 * (i % 2 ? 1 : -1); tmp.set(P.x + Math.cos(aa) * R0, P.y + h, P.z + Math.sin(aa) * R0).lerp(tg, e2); p.q.setFromUnitVectors(_y, _v2.copy(tg).sub(tmp).normalize()); p.x = tmp.x; p.y = tmp.y; p.z = tmp.z; p.sx = p.sz = s; p.sy = s * 1.5; }
          else { const r2 = p.age - (T - d0), aa = a + w * r2, rr = 0.48; p.x = P.x + Math.cos(aa) * rr; p.z = P.z + Math.sin(aa) * rr; p.y = tg.y - 0.4 + up * easeOut(r2 / 0.6); const f = 1 - smooth(0.3, 0.6, r2); p.sx = p.sz = s * 0.8 * f; p.sy = s * 1.4 * f; } } }); }
    return e;
  },
  /** one droplet rising along the body now and then while a buff lasts (the concise loop) */
  riseOne(pc, pal) { const P = P3(pc.pos), a = rnd(0, 6.283), w = rnd(4, 6), s = 0.05, y0 = P.y + 0.3;
    this.P('drop', { col: (PAL[pal] || PAL.heal).liq, glow: 0.3, life: 0.7, sx: s, sy: s, sz: s, q: new THREE.Quaternion(),
      fn: (p, dt, u) => { const Q = P3(pc.pos), aa = a + w * p.age; p.x = Q.x + Math.cos(aa) * 0.45; p.z = Q.z + Math.sin(aa) * 0.45; p.y = Q.y + 0.3 + 1.6 * u; const k = Math.sin(Math.PI * u); p.sx = p.sz = s * k; p.sy = s * 1.5 * k; } }); },
});
