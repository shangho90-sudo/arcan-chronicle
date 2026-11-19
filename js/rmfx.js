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
// uJ > 0: jagged radial wobble (discord rings on rm_band — the ring wall shakes in and out round the circle)
const VS = `uniform float uJ, uT; varying vec2 vUv; varying vec3 vN, vV;
void main(){ vUv = uv; vec3 P = position; if (uJ > 0.) { float a = atan(P.z, P.x); P.xz *= 1. + uJ * (sin(a * 9. + uT * 25.) * .6 + sin(a * 5. - uT * 17.) * .4); }
  vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(P, 1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
// uS shape: 0 energy body (fresnel: bright core where it faces the camera, uW -> uB towards the rim) / 1 halo shell (only the rim glows)
//           2 crown petals (v = height: wet paint, light rim at the tips, erodes from the tips with uE) / 3 ground ring (v across: thin bright edge + soft inner)
//           4 flash quad (four-point star + round core) / 5 ground stain disc (noisy edge, uE erodes) / 6 soft round glow quad
//           7 / 8 / 9 sword energy core / body / halo on rm_cres (uE = head 0..1 along the swing, uT = tail length) / 10 heal sigil quad
//           11 fire ground fan (fan geo: uv.x across the cone, uv.y radius; uE = shock front radius 0..1.1, runes behind it)
//           12 frost ground fan (dendrite frost lines growing to uE) / 14 fire sigil quad (hexagram, drawn in by uE, uT = turn)
//           15 fire pillar on rm_band (flame tongues scrolling up, uE = height cut) / 16 sound wall (rm_wave / rm_band: grooves, uE > 1.5 = closed ring)
//           17 ice crystal body (translucent fresnel + bright tip) / 18 ice sigil quad (snowflake, drawn in by uE) / 19 heat shimmer quad (faint wavy bands)
const FS = `uniform vec3 uW, uB; uniform float uA, uS, uE, uT, uQ, uAdd, uJ; varying vec2 vUv; varying vec3 vN, vV;
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
  else if (uS < 9.5) {   // 7 blade core / 8 blade body / 9 blade halo: wipe along the swing (head uE, tail length uT), bright at the head
    float u = vUv.x, v = vUv.y, dh = uE - u, w = smoothstep(-.02, .03, dh) * (1. - smoothstep(uT * .55, uT, dh)), hd = exp(-max(dh, 0.) * 5.);
    float ends = smoothstep(0., .08, u) * smoothstep(1., .9, u);
    if (uS < 7.5) { a = exp(-pow((v - .9) * 9., 2.)) * (.45 + .9 * hd); core = 1.; }
    else if (uS < 8.5) { a = smoothstep(.25, .75, v) * smoothstep(1.02, .9, v) * (.45 + .55 * hd); core = smoothstep(.6, 1., v); a *= .85 + .15 * vn(vec2(u * 30. + uQ, v * 4.)); }
    else { a = exp(-pow((v - .7) * 2.6, 2.)) * .7 * (.4 + .6 * hd) * (.7 + .3 * vn(vec2(u * 12. - uQ * 3., v * 3.))); core = .2; }
    a *= w * ends; }
  else if (uS > 10.5) {
    vec2 p = vUv * 2. - 1.; float r = length(p), ang = atan(p.y, p.x), x = vUv.x, y = vUv.y, edge = smoothstep(0., .07, x) * smoothstep(1., .93, x);
    if (uS < 11.5) { float fl = vn(vec2(x * 9. + uQ, y * 5. - uT * 3.)), fl2 = vn(vec2(x * 23. - uQ, y * 11. - uT * 5.));
      float front = exp(-pow((y - uE) * 10., 2.)) * smoothstep(0., .2, uE), body = step(y, uE) * smoothstep(0., .12, y) * (.25 + .75 * smoothstep(.35, .85, fl * .7 + fl2 * .5));
      float runes = (exp(-pow((y - .42) * 70., 2.)) + exp(-pow((y - .76) * 70., 2.))) * step(.45, fract(x * 12. + uT * .7)) * step(y, uE);
      a = (front * 1.3 + body * .55 + runes * .9) * edge * smoothstep(1.02, .9, y); core = front + runes * .7 + body * fl2 * .4; }
    else if (uS < 12.5) { vec2 q = vec2(x * 6., y * 9.); float n1 = vn(q * 1.6 + uQ), n2 = vn(q * 4.1 - uQ);
      float lines = smoothstep(.07, 0., abs(n1 - .5)) + .65 * smoothstep(.05, 0., abs(n2 - .5)), sp = smoothstep(.035, 0., abs(fract(x * 7. + n2 * .25) - .5));
      float grow = step(y, uE + (n1 - .5) * .18); a = (lines + sp * .5 + .16) * grow * edge * smoothstep(1., .86, y); core = lines * .8; }
    else if (uS < 14.5) { float sh = step(ang + 3.14159, uE * 6.2832 + .001), an = mod(ang + uT, 2.0944) - 1.0472, an2 = mod(ang + uT + 1.0472, 2.0944) - 1.0472;
      float rings = exp(-pow((r - .93) * 40., 2.)) + .7 * exp(-pow((r - .74) * 50., 2.)), star = (exp(-pow((r * cos(an) - .37) * 45., 2.)) + exp(-pow((r * cos(an2) - .37) * 45., 2.))) * step(r, .75);
      float dots = step(.55, fract(ang * 3.8197 - uT * 2.)) * exp(-pow((r - .835) * 34., 2.));
      a = (rings + star * .85 + dots * .7) * sh + .16 * smoothstep(1., .1, r) * sh; core = rings * .8 + star * .6; }
    else if (uS < 15.5) { float v = vUv.y, n = vn(vec2(vUv.x * 10. + uQ, v * 3. - uT * 4.)), n2 = vn(vec2(vUv.x * 22. - uQ, v * 6. - uT * 7.));
      float tg = smoothstep(.45, .95, n * .75 + n2 * .55 - v * .9 + .25); a = tg * smoothstep(0., .08, v) * (1. - smoothstep(uE - .35, uE, v)) * (.35 + .3 * fr); core = smoothstep(.75, 1., tg) * (1. - v) * .6; }
    else if (uS < 16.5) { float v = vUv.y, pr = exp(-pow((v - .5) * 3.2, 2.)), gr = .55 + .45 * sin(v * 26. + uT * 14.), ends = uE > 1.5 ? 1. : smoothstep(0., .1, vUv.x) * smoothstep(1., .9, vUv.x);
      a = pr * gr * (.45 + .65 * fr) * ends; core = pr * gr * .7 + pow(fr, 3.) * .4; }
    else if (uS < 17.5) { a = .3 + .55 * pow(fr, 1.4); core = pow(1. - fr, 3.) * .45 + smoothstep(.72, 1., vUv.y) * .7 + .25 * vn(vUv * vec2(6., 12.) + uQ); }
    else if (uS < 18.5) { float sh = step(ang + 3.14159, uE * 6.2832 + .001), am = abs(mod(ang + uT, 1.0472) - .5236);
      float spokes = smoothstep(.05, 0., am * r) * step(r, .8), br = smoothstep(.05, 0., abs(am * r - abs(r - .5) * .55)) * step(.32, r) * step(r, .72);
      float rings = exp(-pow((r - .93) * 42., 2.)) + .6 * exp(-pow((r - .82) * 60., 2.)) + .5 * exp(-pow((r - .22) * 40., 2.));
      a = (rings + spokes * .9 + br * .7) * sh + .14 * smoothstep(1., .1, r) * sh; core = rings * .8 + spokes * .7; }
    else if (uS < 19.5) { float w = .5 + .5 * sin(vUv.y * 38. + uT * 13. + vn(vUv * 6. + uQ) * 6.); a = .5 * w * pow(clamp(1. - r, 0., 1.), 1.5); core = 0.; }
    else if (uS < 20.5) {   // 20 ground crack star (flat quad): ~9 jagged radial cracks grown out to uE, hot crater glow in the middle
      float an = ang + (vn(vec2(r * 7. + uQ, uQ)) - .5) * .6 + (vn(vec2(r * 19. - uQ, 3.)) - .5) * .18, sec = fract(an / 6.2832 * 9. + uQ * .37), d = abs(sec - .5) / 9. * 6.2832 * r;
      float br = step(.55, vn(vec2(floor(an / 6.2832 * 9. + uQ * .37) * 3.1, 1.))), len = mix(.7, 1., br);
      float line = smoothstep(.03 + .012 * (1. - r), 0., d) * step(.06, r) * smoothstep(len, len - .12, r);
      a = (line * (.65 + .35 * (1. - r)) + exp(-r * r * 16.) * .9) * smoothstep(uE, uE - .14, r) * smoothstep(1., .86, r); core = line * smoothstep(.6, 0., r) + exp(-r * r * 30.); }
    else {   // 21 dust wall on rm_band: soft noisy ring of dust rising, thinning upward, eroding with uE
      float v = vUv.y, n = vn(vec2(vUv.x * 16. + uQ, v * 3. - uT * 1.4)) * .65 + vn(vec2(vUv.x * 37. - uQ, v * 7. - uT * 2.)) * .35;
      a = pow(1. - v, 1.4) * smoothstep(.25, .75, n + (1. - v) * .25) * smoothstep(0., .06, v) * (1. - smoothstep(uE - .3, uE, n * .6 + v * .7)); core = .15 * n; }
  }
  else {   // 10 heal sigil (flat quad): double ring + 8 leaf petals + rotating dots, drawn in by uE (0..1), uT = time
    vec2 p = vUv * 2. - 1.; float r = length(p), ang = atan(p.y, p.x), sh = step(ang + 3.14159, uE * 6.2832 + .001);
    float rings = exp(-pow((r - .93) * 40., 2.)) + .7 * exp(-pow((r - .8) * 50., 2.)) + .5 * exp(-pow((r - .38) * 45., 2.));
    float pa = mod(ang + uT * .35, 6.2832 / 8.) - 3.14159 / 8., leaf = smoothstep(.12, 0., abs(pa) * r * 3. - (.22 - abs(r - .6)) * .9) * step(.4, r) * step(r, .78);
    float dots = smoothstep(.05, .0, length(vec2(mod(ang - uT * .6, 6.2832 / 24.) - 3.14159 / 24., (r - .865) * 5.)) * 1.);
    a = (rings + leaf * .55 + dots * .8) * sh + .12 * smoothstep(1., .2, r); core = rings * .8 + dots; }
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

// lightning (one merged strip mesh per layer: main bolt + branches): uv.x along a polyline, uv.y across, aI = brightness per vertex
// uS 0 = additive light (white-hot core line + coloured glow) / 1 = soft dark outer (normal blending — the bolt reads on a bright floor)
const BOLT_VS = `attribute float aI; varying vec2 vUv; varying float vI; void main(){ vUv = uv; vI = aI; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const BOLT_FS = `uniform vec3 uW, uB; uniform float uA, uS; varying vec2 vUv; varying float vI;
void main(){ float v = abs(vUv.y * 2. - 1.), core = exp(-v * v * 26.), glow = exp(-v * v * 3.2) * (1. - v);
  if (uS < .5) { vec3 c = mix(uB, uW, core); gl_FragColor = vec4(c * (core * 1.6 + glow * .5) * vI * uA, 1.); }
  else gl_FragColor = vec4(uB, glow * .55 * vI * uA); }`;

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
      this.parts = { streak: new Parts(this.geo.rm_streak, true, cap), drop: new Parts(this.geo.rm_drop, false, cap), star: new Parts(this.geo.rm_star, true, Math.round(cap / 2)),
        shard: new Parts(this.geo.rm_shard || this.geo.rm_drop, false, Math.round(cap / 3)) };   // 얼음 파편(반투명, 빛 받음)
      for (const k in this.parts) this.root.add(this.parts[k].mesh);
      this.ready = true;
    })().catch(e => console.warn('rmfx load', e));
    return this.loading;
  }
  ok() { if (!this.ready) { this.load(); return false; } return true; }
  // ------------------------------------------------------------------ pooled layer meshes
  _mat(kind) {
    const u = U({ uW: new THREE.Color(1, 1, 1), uB: new THREE.Color(1, 1, 1), uA: 0, uS: 0, uE: 2, uT: 0, uQ: 0, uJ: 0, uAdd: kind === 'add' ? 1 : 0 });
    if (kind === 'paint') return new THREE.ShaderMaterial({ uniforms: u, vertexShader: VS, fragmentShader: PAINT_FS, transparent: true, depthWrite: true, side: THREE.DoubleSide });
    return new THREE.ShaderMaterial({ uniforms: u, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: kind === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending });
  }
  /** kind: 'add' (additive light layer) / 'alpha' (soft translucent layer) / 'paint' (lit wet body) */
  _m(e, kind, geo, o = {}) {
    const p = this.pool[kind] || (this.pool[kind] = []); let m = p.pop();
    if (!m) { m = new THREE.Mesh(geo, this._mat(kind)); m.frustumCulled = false; m.userData.kind = kind; }
    m.geometry = geo; m.position.set(0, 0, 0); m.quaternion.identity(); m.scale.set(1, 1, 1); m.visible = true; m.renderOrder = o.order ?? (kind === 'add' ? 7 : 5);
    const u = m.material.uniforms; u.uW.value.setHex(o.w ?? 0xffffff); u.uB.value.setHex(o.b ?? 0xffffff); u.uA.value = 0; u.uS.value = o.s ?? 0; u.uE.value = 2; u.uT.value = 0; u.uQ.value = rnd(0, 10); if (u.uJ) u.uJ.value = 0; m.material.depthTest = true;
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
    m.userData.mats[0].uniforms.uS.value = 0; m.userData.mats[1].uniforms.uS.value = 1; m.geometry.setDrawRange(0, 0); m.visible = true; return m;
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
    const geo = o.fin ? this.geo.rm_cres_big : this.geo.rm_cres, c1 = o.c1 ?? 0x78dfff, c2 = o.c2 ?? 0x8a65ff, lite = rmLite();
    const halo = this._take('add', geo, { w: c1, b: c2, s: 9, order: 8 }), body = this._take('alpha', geo, { w: c1, b: c2, s: 8, order: 9 }), core = this._take('add', geo, { w: 0xffffff, b: 0xffffff, s: 7, order: 10 });
    // afterimage: dimmer copies of the body whose head lags behind (o.ghosts, 1 on medium / phone)
    const gh = []; for (let i = 0; i < Math.min(o.ghosts || 0, lite ? 1 : 2); i++) { const m = this._take('add', geo, { w: c1, b: c2, s: 8, order: 7 }); m.scale.set(0.985 - 0.02 * i, 1, 0.985 - 0.02 * i); gh.push(m); }
    for (const m of [halo, body, core, ...gh]) { m.material.depthTest = false; parent.add(m); }
    halo.scale.set(1.07, 1, 1.07); body.scale.set(1, 1, 1);
    // n / a0 / a1 / lite / c1: the head sparkle dust in bladeSet (angles = the rm_cres / rm_cres_big arc in fx_rm.py)
    return { halo, body, core, gh, fin: !!o.fin, n: 0, a0: o.fin ? 112 : 92, a1: o.fin ? -104 : -80, lite, c1 };
  }
  /** per frame: head 0..1 along the swing, tail length, fade 0..1, k = intensity */
  bladeSet(L, head, tail, fade, k = 1) {
    if (!L) return; const I = RMFX.intensity * rawK() * k;
    for (const [m, a] of [[L.halo, 1.1 * I], [L.body, 0.85], [L.core, 2.0 * I]]) { const u = m.material.uniforms; u.uE.value = head; u.uT.value = Math.max(0.001, tail); u.uA.value = a * fade; m.visible = fade > 0.003; }
    (L.gh || []).forEach((m, i) => { const u = m.material.uniforms, lag = 0.07 * (i + 1); u.uE.value = head - lag; u.uT.value = Math.max(0.001, tail * 0.85); u.uA.value = I * (0.5 - 0.18 * i) * fade; m.visible = fade > 0.003 && head - lag > 0.02; });
    // sparkle dust shed from the moving head of the blade (the outer cutting edge), while it sweeps
    const par = L.core.parent;
    if (par && head > 0.04 && head < 0.99 && fade > 0.3 && (L.n++ % (L.lite ? 3 : 1)) === 0) {
      const a = (L.a0 + (L.a1 - L.a0) * head) * Math.PI / 180, p = par.localToWorld(_a.set(Math.sin(a) * 0.96, 0, Math.cos(a) * 0.96));
      this.emit('star', 1, () => ({ p, v: _c.set(rnd(-0.5, 0.5), rnd(0.2, 1.1), rnd(-0.5, 0.5)), s: rnd(0.035, 0.06), col: rand() < 0.5 ? 0xffffff : L.c1, life: rnd(0.25, 0.4), spin: 7, drag: 2 }));
      if (L.fin || !L.lite) this.emit('streak', 1, () => ({ p, v: _c.set(rnd(-1, 1), rnd(0, 1.5), rnd(-1, 1)), s: 0.04, col: L.c1, life: 0.14, drag: 6, stretch: 0.12 }));
    }
  }
  bladeFree(L) { if (!L) return; this._give(L.halo); this._give(L.body); this._give(L.core); for (const m of L.gh || []) this._give(m); L.gh = []; }
  /** a sword hit: white streak sparks thrown along the cut + stars; the finisher adds a ground shock ring pair and a flat crescent wave
   *  running forward on the ground (all at the real target, never wider than ~1.6 m) */
  slashHit(pos, o = {}) {
    if (!this.ok()) return null;
    const low = rmLite(), fin = !!o.fin, c1 = o.c1 ?? 0x78dfff, c2 = o.c2 ?? 0x8a65ff, at = P3(pos), gy = o.groundY != null ? o.groundY : at.y - 0.85, I = RMFX.intensity * rawK();
    const f = o.dir ? new THREE.Vector3(o.dir.x, 0, -o.dir.z).normalize() : new THREE.Vector3(0, 0, -1), tan = o.tan || new THREE.Vector3(-f.z, 0, f.x);
    if (o.flash) {   // 0.03~0.08 s white star flash + coloured glow on the cut (sword combo — the same frame as the damage)
      const fl0 = fin ? 1.35 : 0.95, fdur = fin ? 0.08 : 0.055;
      const ef = this._fx('slashFlash', 0.3, (e) => { const tt = e.t;
        this._face(fl, fl0 * (0.55 + 0.6 * easeOut(tt / 0.03))); fl.rotateZ(o.roll || 0.5); fl.material.uniforms.uA.value = I * 1.35 * (1 - smooth(0.012, fdur, tt));
        this._face(gw, fl0 * 0.85 * (0.6 + 0.6 * easeOut(tt / 0.1))); gw.material.uniforms.uA.value = I * 0.6 * (1 - smooth(0.03, 0.22, tt)); });
      ef.g.position.copy(at);
      const fl = this._m(ef, 'add', this.quad, { w: 0xffffff, b: c1, s: 4, order: 11 }), gw = this._m(ef, 'add', this.quad, { w: c1, b: c2, s: 6, order: 10 });
      for (const m of [fl, gw]) m.material.depthTest = false;
    }
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

  // ================================================================== 견습생 기본 5단 콤보 검기 (actors.js tryCast: 일반 combo_N + 검을 들었을 때)
  /** a 3-layer crescent (rm_cres, 5th = rm_cres_big) laid on the REAL swing: the sword tip is sampled (relative to the caster's root)
   *  through the action's trail window, a circle is fitted through first / middle / latest tip and the crescent is oriented in that
   *  plane, its head following the real tip angle (so every strike points the way it was swung). Afterimage ghosts trail the head.
   *  o: {act (action def), name (action name), fin, c1, c2}. Returns the effect (o.tan(): world swing tangent at the latest tip). */
  swordArc(pc, o = {}) {
    if (!this.ok() || !pc || !pc.body) return null;
    const act = o.act || {}, name = o.name, tw = act.trail ? (typeof act.trail[0] === 'number' ? act.trail : act.trail[0]) : [0.15, 0.25];
    const fin = !!o.fin, hitT = (act.hitTimes && act.hitTimes[0]) || act.hitT || tw[0] + 0.05, w0 = tw[0] - 0.05, w1 = tw[1] + 0.03;
    const c1 = o.c1 ?? (fin ? 0xffe6a0 : 0x8fe6ff), c2 = o.c2 ?? (fin ? 0xff9a4a : 0x7a6bff), smp = [], arcDeg = fin ? 216 : 172;
    const root = new THREE.Vector3(), X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(), C = new THREE.Vector3(), tan = new THREE.Vector3();
    let L = null, R = 1, head = 0, fitT = -1, freeze = false, tFit = 0;
    const angOf = (q) => { _b.copy(q).sub(C); let a = Math.atan2(_b.dot(Z), _b.dot(X)) * 180 / Math.PI; if (a < -40) a += 360; return a; };
    const fit = () => {
      const p0 = smp[0], pl = smp[smp.length - 1], pm = smp[Math.floor(smp.length / 2)];
      // circumcentre of p0, pm, pl
      const a = _a.copy(p0).sub(pl), b = _b.copy(pm).sub(pl), axb = _c.crossVectors(a, b), d = 2 * axb.lengthSq();
      let ok = d > 1e-6;
      if (ok) { const t1 = new THREE.Vector3().crossVectors(axb, a).multiplyScalar(b.lengthSq()), t2 = new THREE.Vector3().crossVectors(b, axb).multiplyScalar(a.lengthSq());
        C.copy(t1).add(t2).divideScalar(d).add(pl); R = C.distanceTo(p0); ok = R > 0.35 && R < 2.2; }
      if (!ok) { C.set(0, 1.05, 0); R = Math.max(0.6, Math.min(1.6, C.distanceTo(p0))); }
      X.copy(p0).sub(C); const n = new THREE.Vector3().crossVectors(X, _a.copy(pm).sub(C));
      if (n.lengthSq() < 1e-8) n.crossVectors(X, _a.copy(pl).sub(C)); if (n.lengthSq() < 1e-8) n.set(0, 1, 0);
      n.normalize(); X.addScaledVector(n, -X.dot(n)).normalize(); Y.copy(n).negate(); Z.crossVectors(X, Y).normalize();
      R = Math.min(1.7, Math.max(0.75, R * 1.06)) * (fin ? 1.18 : 1);
      L = this.bladeLayers(e.g, { fin, c1, c2, ghosts: 2 });
      if (L) { _m4.makeBasis(X, Y, Z); e.g.quaternion.setFromRotationMatrix(_m4); e.g.scale.set(R, R * 2.2, R); for (const m of [L.halo, L.body, L.core, ...L.gh]) m.material.depthTest = true; }
      fitT = e.t; tFit = pc.body.t;
    };
    const e = this._fx('swordArc', 1.2, (e, dt) => {
      const b = pc.body, mine = b && b.action === name && !pc.dead, bt = mine ? b.t : 99;
      if (!freeze) root.copy(P3(pc.pos));
      if (mine && bt >= w0 && bt <= w1 && !freeze) { let bp = null; try { bp = b.bladePoints(); } catch (err) { bp = null; }
        if (bp) { smp.push(bp[1].clone().sub(root)); const n = smp.length; if (n >= 2) tan.copy(smp[n - 1]).sub(smp[n - 2]).normalize(); } }
      if (fitT < 0 && smp.length >= 3 && (bt >= hitT - 0.02 || bt > w1 || !mine)) fit();
      if (fitT < 0) { if (!mine || e.t > 1) e.t = e.life; return; }
      e.g.position.copy(root).add(C);
      if (bt > w1 + 0.12 || !mine) freeze = true;
      const u = e.t - fitT, life = fin ? 0.42 : 0.3;
      // head = the real tip angle (while sampled) then a short follow-through to the end of the arc
      const real = clamp01(angOf(smp[smp.length - 1]) / arcDeg + 0.06);
      head = Math.max(head, bt <= w1 ? real : Math.min(1, real + 0.35 * easeOut(u / 0.08)));
      const fade = 1 - smooth(fin ? 0.14 : 0.08, life, u), tail = 1.3 * (1 - smooth(0.04, life, u)) + 0.05;
      { const gs = R * (1 + (fin ? 0.1 : 0.06) * smooth(0, life, u)); e.g.scale.set(gs, gs * 2.2, gs); }   // thicker ridge: a vertical swing seen edge-on still reads as a blade
      this.bladeSet(L, head, tail, fade, fin ? 1.25 : 1);
      if (u > life) e.t = e.life;
    });
    e.free = () => { if (L) { this.bladeFree(L); L = null; } };
    e.tan = () => tan; e.fitted = () => fitT >= 0;
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

  // ================================================================== 4묶음 원소 (용광로 개방·뜨거운 국물·온풍/냉풍 드라이·음파 파동·불협화음)
  // 모든 큰 층은 실제 판정 안: 부채꼴 판(_fanGeo)은 판정 반지름·각도 그대로, 마법진·기둥·결정은 부채꼴 안쪽 점에서 그 점이 부채꼴을 벗어나지 않는 크기.
  /** flat fan in the XZ plane, apex at the origin, centred on local +X; uv.x = across the cone, uv.y = radius 0..1 (cached per angle) */
  _fanGeo(ang) {
    const key = Math.round(ang); this.fans = this.fans || {}; if (this.fans[key]) return this.fans[key];
    const A = 24, R = 10, h = key * Math.PI / 360, pos = [], uv = [], nrm = [], idx = [];
    for (let j = 0; j <= R; j++) for (let i = 0; i <= A; i++) { const th = -h + 2 * h * i / A, r = j / R; pos.push(Math.cos(th) * r, 0, Math.sin(th) * r); uv.push(i / A, r); nrm.push(0, 1, 0); }
    for (let j = 0; j < R; j++) for (let i = 0; i < A; i++) { const a = j * (A + 1) + i, b = a + A + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setIndex(idx);
    return (this.fans[key] = g);
  }
  /** cone frame (three coords): apex g0 on the ground, forward d, side s, yaw for the fan mesh */
  _cone(pc, o) { const f = o.f || pc.facing || { x: 0, z: 1 }, m = Math.hypot(f.x, f.z) || 1, d = new THREE.Vector3(f.x / m, 0, -f.z / m);
    return { g0: P3(pc.pos), d, s: new THREE.Vector3(-d.z, 0, d.x), yaw: Math.atan2(f.z / m, f.x / m), r: o.r || 3.2, h: (o.ang || 60) * Math.PI / 360 }; }
  /** a point inside the cone (three): angle fraction a (-1..1 of the half angle), distance k (0..1 of r) */
  _inCone(c, a, k, y = 0) { const th = a * c.h; return c.g0.clone().addScaledVector(c.d, Math.cos(th) * k * c.r).addScaledVector(c.s, Math.sin(th) * k * c.r).setY(c.g0.y + y); }
  static PAL = {
    fire: { w: 0xfff2b0, b: 0xff5a14, mid: 0xff9a2a, deep: 0xc8300a, ember: [0xffd27a, 0xff8a2a, 0xffffff] },
    soup: { w: 0xffeaa8, b: 0xff7a1e, mid: 0xffb040, deep: 0xc85010, ember: [0xffe08a, 0xff9a2a, 0xfff4e6] },
    forge: { w: 0xfff6c8, b: 0xff4a0a, mid: 0xffb02a, deep: 0xa82008, ember: [0xffe6a0, 0xffb040, 0xff6a1a] },
    ice: { w: 0xffffff, b: 0x5ab8ff, mid: 0xa8e4ff, deep: 0x2a6ad8, ember: [0xffffff, 0xbfe8ff, 0x7ac8ff] },
    gold: { w: 0xfff6d0, b: 0xffb020, mid: 0xffd27a, deep: 0x6a4210, ember: [0xfff2b0, 0xffd27a, 0xffffff], dust: [0xd8c8a0, 0x8a7458] },
    pan: { w: 0xfff2d8, b: 0xff9a3a, mid: 0xffd08a, deep: 0x5a3416, ember: [0xfff0c0, 0xffc060, 0xffffff], dust: [0xe0d4b8, 0x9a8466] },
    anvil: { w: 0xfff2c0, b: 0xff6a1a, mid: 0xffb040, deep: 0x3a2418, ember: [0xffe6a0, 0xffa030, 0xff6a1a], dust: [0xb0a090, 0x6a5a4a] },
    sky: { w: 0xffffff, b: 0x6ab8ff, mid: 0xb8e2ff, deep: 0x1a3a9a, ember: [0xffffff, 0xbfe8ff, 0x7ac8ff], dust: [0xd8dce8, 0x8a90a8] },
  };
  /** fire in a cone (용광로 개방·뜨거운 국물·온풍 드라이). o: {f (game facing), r, ang, at (s until the burst = damage frame), dur (sustain s, channel), pal}
   *  준비(at 전): 부채꼴 안 지면 마법진이 그려짐 / 발동: 섬광 + 불꽃 부채꼴의 충격 앞선(= 원형 충격파를 판정 부채꼴로 자름) + 도는 불꽃 혀 + 솟는 불기둥 + 불티 + 열기 아지랑이 / 끝: 천천히 꺼짐.
   *  handle: pulse() = 채널 틱마다 앞선을 다시 보냄, stop() = 일찍 끝. */
  fireCone(pc, o = {}) {
    if (!this.ok() || !pc) return null;
    const low = rmLite(), P = RmFx.PAL[o.pal] || RmFx.PAL.fire, I = RMFX.intensity * rawK(), c = this._cone(pc, o), at = Math.max(0, o.at || 0), dur = o.dur || 0, sustain = dur > 0;
    const sigD = 0.55, sigR = Math.min(0.95, sigD * c.r * Math.sin(c.h) * 0.92, 0.42 * c.r), sigP = this._inCone(c, 0, sigD, 0.07);
    const nFl = low ? 4 : 8, nPil = low ? 1 : 2, fl = [], pil = [];
    let front0 = 0, endT = at + (sustain ? dur : 0.55), emT = 0, flT = 0;
    const e = this._fx('fireCone', at + (sustain ? dur : 0.55) + 0.5, (e, dt) => {
      const t = e.t, T = t - at, out = 1 - smooth(endT, endT + 0.45, t), on = T >= 0;
      // ground sigil inside the cone: drawn in before the burst, turns, flares at the burst, fades with the rest
      sig.material.uniforms.uE.value = easeOut(at > 0 ? t / Math.max(0.12, at) : t / 0.15); sig.material.uniforms.uT.value = t * 0.9; sig.material.uniforms.uA.value = I * (0.85 + 0.6 * Math.exp(-Math.max(0, T) * 9) * (on ? 1 : 0)) * smooth(0, 0.06, t) * out;
      sigA.material.uniforms.uE.value = sig.material.uniforms.uE.value; sigA.material.uniforms.uT.value = t * 0.9; sigA.material.uniforms.uA.value = 0.55 * smooth(0, 0.06, t) * out;
      // the fire fan: shock front racing to the edge (one-shot), pulsing on every channel tick
      const kf = on ? (T - front0) / 0.24 : -1; fan.visible = fanA.visible = on;
      if (on) { const fe = Math.min(1.1, 0.05 + 1.05 * easeOut(clamp01(kf))), body = sustain ? 1 : 1 - smooth(0.25, 0.55, T);
        for (const [m, a] of [[fan, I * 1.15], [fanA, 0.5]]) { const u = m.material.uniforms; u.uE.value = fe; u.uT.value = t; u.uA.value = a * out * Math.max(body, kf < 1 ? 1 - smooth(0.6, 1, kf) : 0) * smooth(0, 0.03, T); } }
      // flash at the burst (0.05 s), on the cone mouth
      this._face(fx, 1.1 * (0.6 + 0.5 * easeOut(T / 0.03))); fx.material.uniforms.uA.value = on ? I * 1.4 * (1 - smooth(0.012, 0.06, T)) : 0;
      // flame tongues swirling round the cone axis, born at the burst (and again through a channel), growing, licking up, shrinking
      flT -= dt; if (on && t < endT && flT <= 0 && sustain) { flT = low ? 0.22 : 0.12; spawnFlame(); }
      for (const q of fl) { const k = (t - q.t0) / q.life; q.m.visible = k > 0 && k < 1; if (!q.m.visible) continue;
        q.ang += dt * q.w; const p = this._inCone(c, Math.sin(q.ang) * 0.75, q.k + 0.08 * Math.cos(q.ang), 0); q.m.position.copy(p).add(_a.set(0, 0.04 + 0.25 * k, 0));
        const sz = q.s * Math.sin(Math.PI * Math.min(1, k * 1.25)) ** 0.7; q.m.scale.set(sz, sz * (1.2 + 0.5 * k), sz); q.m.rotation.y = q.ang * 2; q.m.material.uniforms.uA.value = I * 1.2 * out; q.m.material.uniforms.uT.value = t; }
      // rising fire pillars (rm_band) at points inside the cone
      for (const q of pil) { const k = (T - q.d) / q.life, vis = k > 0 && k < 1; q.m.visible = q.a.visible = vis; if (!vis) continue;
        const hh = q.H * easeOut(Math.min(1, k * 2.5)); q.m.scale.set(q.R * (1 + 0.2 * k), hh, q.R * (1 + 0.2 * k)); q.m.material.uniforms.uE.value = 1.25 - 0.9 * smooth(0.55, 1, k); q.m.material.uniforms.uT.value = t;
        const fs = 2.2 * q.R / 0.18 * 0.5 * (1 - smooth(0.6, 1, k)); q.a.scale.set(fs, hh * 0.85, fs); q.a.rotation.y = t * 5;
        q.m.material.uniforms.uA.value = I * 1.3 * out; q.a.material.uniforms.uA.value = I * 1.1 * out; }
      // heat shimmer over the cone (faint wavy quads facing the camera)
      for (const m of shim) { this._face(m, null); m.scale.set(c.r * 0.55, c.r * 0.38, 1); m.material.uniforms.uT.value = t; m.material.uniforms.uA.value = on ? 0.5 * out * smooth(0, 0.15, T) : 0; }
      // embers rising out of the cone (inside it)
      emT -= dt; if (on && t < endT + 0.15 && emT <= 0) { emT = low ? 0.05 : 0.025; const p = this._inCone(c, rnd(-0.9, 0.9), rnd(0.2, 0.95), rnd(0.05, 0.4));
        this.emit('streak', 1, () => ({ p, v: _c.set(rnd(-0.4, 0.4), rnd(1.6, 3.2), rnd(-0.4, 0.4)), s: rnd(0.035, 0.055), col: P.ember[(rand() * 3) | 0], life: rnd(0.35, 0.6), drag: 1.5, stretch: 0.09 })); }
    });
    e.g.position.set(0, 0, 0);
    const sig = this._m(e, 'add', this.quad, { w: P.w, b: P.b, s: 14, order: 3 }); this._flat(sig, sigR * 2, 0); sig.position.copy(sigP);
    const sigA = this._m(e, 'alpha', this.quad, { w: P.mid, b: P.deep, s: 14, order: 2 }); this._flat(sigA, sigR * 2, 0); sigA.position.copy(sigP).setY(sigP.y - 0.01);
    const fan = this._m(e, 'add', this._fanGeo(o.ang || 60), { w: P.w, b: P.b, s: 11, order: 3 }), fanA = this._m(e, 'alpha', this._fanGeo(o.ang || 60), { w: P.mid, b: P.deep, s: 11, order: 2 });
    for (const m of [fan, fanA]) { m.position.copy(c.g0).setY(c.g0.y + (m === fan ? 0.06 : 0.05)); m.rotation.set(0, c.yaw, 0); m.scale.set(c.r, 1, c.r); m.visible = false; }
    const fx = this._m(e, 'add', this.quad, { w: 0xffffff, b: P.mid, s: 4, order: 9 }); fx.position.copy(this._inCone(c, 0, Math.min(0.3, 0.8 / c.r), 1.0));
    const spawnFlame = () => { const q = fl.find(q => e.t - q.t0 > q.life); if (q) { Object.assign(q, mk(q.m)); return; } if (fl.length < 14) fl.push(mk()); };   // reuse a finished tongue's mesh
    const mk = (m0) => { const m = m0 || this._m(e, 'add', this.geo.rm_flame, { w: P.w, b: P.b, s: 0, order: 6 }); m.visible = false;
      return { m, t0: Math.max(e.t, at) + rnd(0, 0.08), life: rnd(0.4, 0.62), ang: rnd(0, 6.28), w: rnd(4, 7) * (rand() < 0.5 ? 1 : -1), k: rnd(0.3, 0.82), s: rnd(0.75, 1.15) * Math.min(1.25, c.r / 3) }; };
    for (let i = 0; i < nFl; i++) fl.push(mk());
    for (let i = 0; i < nPil; i++) { const a = nPil === 1 ? 0 : (i ? 0.45 : -0.45), k = 0.62 + 0.12 * i, p = this._inCone(c, a, k, 0), R = Math.min(0.34, k * c.r * Math.sin(c.h * (1 - Math.abs(a))) * 0.5 + 0.12);
      const m = this._m(e, 'add', this.geo.rm_band, { w: P.mid, b: P.b, s: 15, order: 6 }), am = this._m(e, 'add', this.geo.rm_flame, { w: P.w, b: P.b, s: 0, order: 6 });   // pillar wall + a tall flame tongue inside it
      m.position.copy(p); am.position.copy(p); m.visible = am.visible = false; pil.push({ m, a: am, d: 0.03 + 0.07 * i, life: sustain ? Math.min(0.9, dur) : 0.6, H: 1.5 + 0.3 * i, R: Math.min(0.26, R) }); }
    const shim = low ? [] : [0, 1].map(i => { const m = this._m(e, 'add', this.quad, { w: P.mid, b: P.b, s: 19, order: 4 }); m.position.copy(this._inCone(c, i ? 0.35 : -0.3, 0.55, 0.9)); return m; });
    e.handle = { pulse: () => { if (e.t >= at) front0 = e.t - at; for (const q of pil) if (e.t - at - q.d > q.life) q.d = e.t - at; },
      stop: () => { if (e.t < endT) { endT = e.t; e.life = Math.min(e.life, e.t + 0.5); } } };
    return e.handle;
  }
  /** fire landing on a target (game pos p with y, radius r): orange-white flash 0.05 s, small fire pillar, ground shock ring, embers, flame tongues; o.small = one channel tick */
  fireHit(p, r = 0.5, o = {}) {
    if (!this.ok() || !p) return null;
    const low = rmLite(), P = RmFx.PAL[o.pal] || RmFx.PAL.fire, I = RMFX.intensity * rawK(), g = P3(p), small = !!o.small, ch = g.clone().setY(g.y + Math.min(1.1, 0.45 + r * 0.6));
    const life = small ? 0.35 : 0.6, R = Math.min(1.2, r + 0.35);
    const e = this._fx('fireHit', life, (e) => { const t = e.t;
      this._face(fl, (small ? 0.6 : 1.0) * (0.6 + 0.5 * easeOut(t / 0.03))); fl.material.uniforms.uA.value = I * 1.35 * (1 - smooth(0.012, small ? 0.045 : 0.065, t));
      const kr = t / (small ? 0.22 : 0.3); ring.visible = kr < 1; ring.scale.set(R * (0.3 + 0.7 * easeOut(kr)), 1, R * (0.3 + 0.7 * easeOut(kr))); ring.material.uniforms.uA.value = I * (small ? 0.8 : 1.2) * (1 - smooth(0.4, 1, kr)); ring.material.uniforms.uT.value = t;
      if (pl) { const k = t / life; pl.scale.set(r * 0.9, 1.3 * easeOut(Math.min(1, k * 3)), r * 0.9); pl.material.uniforms.uE.value = 1.25 - smooth(0.4, 1, k); pl.material.uniforms.uT.value = t; pl.material.uniforms.uA.value = I * 1.2 * (1 - smooth(0.6, 1, k)); }
      for (const q of tg) { const k = t / q.life; q.m.visible = k < 1; const sz = q.s * Math.sin(Math.PI * Math.min(1, k * 1.2)); q.m.scale.set(sz, sz * 1.4, sz); q.m.position.y = g.y + 0.25 * k; q.m.material.uniforms.uA.value = I * 1.2; q.m.material.uniforms.uT.value = t; }
    });
    e.g.position.set(0, 0, 0);
    const fl = this._m(e, 'add', this.quad, { w: 0xffffff, b: P.mid, s: 4, order: 9 }); fl.position.copy(ch); fl.material.depthTest = false;
    const ring = this._m(e, 'add', this.geo.rm_ring, { w: P.w, b: P.b, s: 3, order: 4 }); ring.position.copy(g).setY(g.y + 0.06);
    const pl = null;   // (a pillar round the target read as a glass jar — flame tongues round its feet instead)
    const tg = []; if (!small) for (let i = 0; i < (low ? 3 : 5); i++) { const a = i / (low ? 2 : 4) * 6.28 + rnd(-0.3, 0.3), m = this._m(e, 'add', this.geo.rm_flame, { w: P.w, b: P.b, s: 0, order: 6 });
      m.position.set(g.x + Math.cos(a) * r * 0.8, g.y, g.z + Math.sin(a) * r * 0.8); tg.push({ m, life: rnd(0.35, 0.5), s: rnd(0.6, 0.9) }); }
    this.emit('streak', Math.round((small ? 3 : 8) * (low ? RMFX.liteK : 1)), () => ({ p: _a.copy(ch).add(_b.set(rnd(-r, r) * 0.6, rnd(-0.3, 0.2), rnd(-r, r) * 0.6)), v: _c.set(rnd(-1, 1), rnd(1.5, 3.4), rnd(-1, 1)), s: rnd(0.04, 0.06), col: P.ember[(rand() * 3) | 0], life: rnd(0.3, 0.55), drag: 2, stretch: 0.09 }));
    return e;
  }
  /** ice in a cone (냉풍 드라이): 지면 서리 문양 마법진 → 섬광 + 서리 무늬가 부채꼴로 자람 → 얼음 결정이 솟음(반투명) → 0.75초에 깨져 파편·반짝임 → 서리가 녹음 */
  iceCone(pc, o = {}) {
    if (!this.ok() || !pc) return null;
    const low = rmLite(), P = RmFx.PAL.ice, I = RMFX.intensity * rawK(), c = this._cone(pc, o), at = Math.max(0, o.at || 0), shatter = at + (o.hold || 0.75);
    const sigD = 0.55, sigR = Math.min(0.9, sigD * c.r * Math.sin(c.h) * 0.92), sigP = this._inCone(c, 0, sigD, 0.07), cr = []; let broke = false;
    const e = this._fx('iceCone', shatter + 0.9, (e) => {
      const t = e.t, T = t - at, on = T >= 0, out = 1 - smooth(shatter + 0.2, shatter + 0.85, t);
      sig.material.uniforms.uE.value = easeOut(at > 0 ? t / Math.max(0.12, at) : t / 0.15); sig.material.uniforms.uT.value = t * 0.5; sig.material.uniforms.uA.value = I * (0.8 + 0.6 * (on ? Math.exp(-T * 8) : 0)) * smooth(0, 0.06, t) * out;
      sigA.material.uniforms.uE.value = sig.material.uniforms.uE.value; sigA.material.uniforms.uT.value = t * 0.5; sigA.material.uniforms.uA.value = 0.6 * smooth(0, 0.06, t) * out;
      fan.visible = fanA.visible = on; if (on) { const fe = Math.min(1.08, 0.05 + 1.05 * easeOut(T / 0.35)); for (const [m, a] of [[fan, I * 0.9], [fanA, 0.75]]) { m.material.uniforms.uE.value = fe; m.material.uniforms.uA.value = a * out * smooth(0, 0.04, T); } }
      this._face(fx, 1.0 * (0.6 + 0.5 * easeOut(T / 0.03))); fx.material.uniforms.uA.value = on ? I * 1.4 * (1 - smooth(0.012, 0.06, T)) : 0;
      for (const q of cr) { const k = (T - q.d) / 0.18, vis = on && k > 0 && !broke; q.m.visible = q.a.visible = vis; if (!vis) continue; const g = easeOut(Math.min(1, k)) * (1 + 0.12 * Math.exp(-Math.max(0, k - 1) * 6) * Math.sin(k * 9));
        for (const m of [q.m, q.a]) m.scale.set(q.s, q.s * q.hh * g, q.s); q.m.material.uniforms.uA.value = 0.85; q.a.material.uniforms.uA.value = I * 0.6 * (0.6 + 0.4 * Math.exp(-Math.max(0, k - 1) * 3)); }
      if (!broke && t >= shatter) { broke = true;   // the crystals shatter: translucent shards + sparkles + a small blue flash each
        for (const q of cr) { if (!(T - q.d > 0)) continue; const p = q.m.position.clone().setY(q.m.position.y + q.s * q.hh * 0.5);
          this.emit('shard', low ? 1 : 3, () => ({ p, v: _c.set(rnd(-1.6, 1.6), rnd(1.0, 2.8), rnd(-1.6, 1.6)), s: rnd(0.07, 0.13) * q.s / 1.2, col: rand() < 0.5 ? 0xe8f8ff : P.mid, a: 0.75, life: rnd(0.45, 0.7), grav: 8, floor: c.g0.y + 0.02, spin: 9 }));
          if (!low) this.emit('star', 1, () => ({ p, v: _c.set(0, rnd(0.4, 0.9), 0), s: rnd(0.05, 0.08), col: 0xffffff, life: 0.35, spin: 6 })); }
        sh0 = t; }
      this._face(shf, 0.9); shf.material.uniforms.uA.value = broke ? I * 0.9 * (1 - smooth(0, 0.08, t - sh0)) : 0;
    });
    let sh0 = 0;
    e.g.position.set(0, 0, 0);
    const sig = this._m(e, 'add', this.quad, { w: P.w, b: P.b, s: 18, order: 3 }); this._flat(sig, sigR * 2, 0); sig.position.copy(sigP);
    const sigA = this._m(e, 'alpha', this.quad, { w: 0xffffff, b: P.deep, s: 18, order: 2 }); this._flat(sigA, sigR * 2, 0); sigA.position.copy(sigP).setY(sigP.y - 0.01);
    const fan = this._m(e, 'add', this._fanGeo(o.ang || 60), { w: P.w, b: P.b, s: 12, order: 3 }), fanA = this._m(e, 'alpha', this._fanGeo(o.ang || 60), { w: 0xffffff, b: P.mid, s: 12, order: 2 });
    for (const m of [fan, fanA]) { m.position.copy(c.g0).setY(c.g0.y + (m === fan ? 0.06 : 0.05)); m.rotation.set(0, c.yaw, 0); m.scale.set(c.r, 1, c.r); m.visible = false; }
    const fx = this._m(e, 'add', this.quad, { w: 0xffffff, b: P.b, s: 4, order: 9 }); fx.position.copy(this._inCone(c, 0, Math.min(0.3, 0.8 / c.r), 1.0));
    const shf = this._m(e, 'add', this.quad, { w: 0xffffff, b: P.b, s: 6, order: 8 }); shf.position.copy(this._inCone(c, 0, 0.6, 0.4));
    const n = low ? 4 : 7;
    for (let i = 0; i < n; i++) { const a = (i / (n - 1) * 2 - 1) * 0.8 + rnd(-0.1, 0.1), k = rnd(0.35, 0.9), p = this._inCone(c, a, k, 0), s = rnd(0.9, 1.3) * Math.min(1.2, c.r / 3);
      const m = this._m(e, 'alpha', this.geo.rm_crystal, { w: 0xffffff, b: P.mid, s: 17, order: 6 }), am = this._m(e, 'add', this.geo.rm_crystal, { w: 0xffffff, b: P.b, s: 1, order: 7 });
      m.position.copy(p); am.position.copy(p); _q.setFromEuler(new THREE.Euler(rnd(-0.35, 0.35), rnd(0, 6), rnd(-0.35, 0.35))); m.quaternion.copy(_q); am.quaternion.copy(_q); m.visible = am.visible = false;
      cr.push({ m, a: am, d: 0.05 + k * 0.25, s, hh: rnd(0.7, 1.15) });
      if (i % 2 === 0) for (let j = 0; j < (low ? 0 : 2); j++) { const p2 = p.clone().add(_b.set(rnd(-0.22, 0.22), 0, rnd(-0.22, 0.22))), m2 = this._m(e, 'alpha', this.geo.rm_crystal, { w: 0xffffff, b: P.mid, s: 17, order: 6 }), a2 = this._m(e, 'add', this.geo.rm_crystal, { w: 0xffffff, b: P.b, s: 1, order: 7 });
        m2.position.copy(p2); a2.position.copy(p2); _q.setFromEuler(new THREE.Euler(rnd(-0.6, 0.6), rnd(0, 6), rnd(-0.6, 0.6))); m2.quaternion.copy(_q); a2.quaternion.copy(_q); m2.visible = a2.visible = false; cr.push({ m: m2, a: a2, d: 0.08 + k * 0.25, s: s * 0.6, hh: rnd(0.6, 0.9) }); } }
    return e;
  }
  /** ice on a target: blue flash, frost ring, crystal cluster growing round its feet, shattering at 0.65 s into translucent shards */
  iceHit(p, r = 0.5) {
    if (!this.ok() || !p) return null;
    const low = rmLite(), P = RmFx.PAL.ice, I = RMFX.intensity * rawK(), g = P3(p), ch = g.clone().setY(g.y + Math.min(1.1, 0.45 + r * 0.6)), cr = [], R = Math.min(1.2, r + 0.3); let broke = false;
    const e = this._fx('iceHit', 1.0, (e) => { const t = e.t;
      this._face(fl, 0.95 * (0.6 + 0.5 * easeOut(t / 0.03))); fl.material.uniforms.uA.value = I * 1.4 * (1 - smooth(0.012, 0.065, t));
      const kr = t / 0.3; ring.visible = kr < 1; ring.scale.set(R * (0.3 + 0.7 * easeOut(kr)), 1, R * (0.3 + 0.7 * easeOut(kr))); ring.material.uniforms.uA.value = I * 1.2 * (1 - smooth(0.4, 1, kr));
      for (const q of cr) { const k = t / 0.12; q.m.visible = q.a.visible = !broke; if (broke) continue; const gg = easeOut(Math.min(1, k)); for (const m of [q.m, q.a]) m.scale.set(q.s, q.s * gg * q.hh, q.s); q.m.material.uniforms.uA.value = 0.85; q.a.material.uniforms.uA.value = I * 0.55; }
      if (!broke && t > 0.65) { broke = true; this._face(fl, 0.7); for (const q of cr) { const pp = q.m.position.clone().setY(q.m.position.y + 0.15);
          this.emit('shard', low ? 1 : 2, () => ({ p: pp, v: _c.set(rnd(-1.4, 1.4), rnd(0.8, 2.2), rnd(-1.4, 1.4)), s: rnd(0.06, 0.1), col: rand() < 0.5 ? 0xe8f8ff : P.mid, a: 0.75, life: rnd(0.4, 0.6), grav: 8, floor: g.y + 0.02, spin: 9 })); } b0 = t; }
      bf.material.uniforms.uA.value = broke ? I * 0.8 * (1 - smooth(0, 0.07, t - b0)) : 0; this._face(bf, 0.8);
    });
    let b0 = 0; e.g.position.set(0, 0, 0);
    const fl = this._m(e, 'add', this.quad, { w: 0xffffff, b: P.b, s: 4, order: 9 }); fl.position.copy(ch); fl.material.depthTest = false;
    const bf = this._m(e, 'add', this.quad, { w: 0xffffff, b: P.b, s: 6, order: 8 }); bf.position.copy(g).setY(g.y + 0.3);
    const ring = this._m(e, 'add', this.geo.rm_ring, { w: 0xffffff, b: P.b, s: 3, order: 4 }); ring.position.copy(g).setY(g.y + 0.06);
    const n = low ? 3 : 6;
    for (let i = 0; i < n; i++) { const a = (i + rnd(-0.25, 0.25)) / n * 6.28, rr = r * rnd(0.8, 1.05), m = this._m(e, 'alpha', this.geo.rm_crystal, { w: 0xffffff, b: P.mid, s: 17, order: 6 }), am = this._m(e, 'add', this.geo.rm_crystal, { w: 0xffffff, b: P.b, s: 1, order: 7 });
      const pp = new THREE.Vector3(g.x + Math.cos(a) * rr, g.y, g.z + Math.sin(a) * rr); m.position.copy(pp); am.position.copy(pp);
      _q.setFromUnitVectors(UP, _b.set(Math.cos(a) * 0.45, 1, Math.sin(a) * 0.45).normalize()); m.quaternion.copy(_q); am.quaternion.copy(_q); cr.push({ m, a: am, s: rnd(0.7, 1.0) * Math.min(1.3, 0.7 + r * 0.6), hh: rnd(0.6, 0.95) }); }
    if (!low) this.emit('star', 3, () => ({ p: _a.copy(ch).add(_b.set(rnd(-0.3, 0.3), rnd(-0.2, 0.3), rnd(-0.3, 0.3))), v: _c.set(0, rnd(0.2, 0.6), 0), s: rnd(0.05, 0.08), col: rand() < 0.5 ? 0xffffff : P.mid, life: 0.45, spin: 6 }));
    return e;
  }
  /** 음파 파동: 3D 소리 벽(rm_wave, 60° 호)이 차례로 판정 부채꼴 끝까지 퍼짐 — 금·보라 번갈아, 홈 무늬가 흐름 + 앞을 미는 빛줄기 */
  soundWave(pc, o = {}) {
    if (!this.ok() || !pc) return null;
    const low = rmLite(), I = RMFX.intensity * rawK(), c = this._cone(pc, o), n = low ? 3 : 4, gap = 0.06, run = 0.34, ws = [], cols = o.cols || [[0xfff0b0, 0xffb02a], [0xf0d8ff, 0x9a5aff]];
    const sx = Math.tan(c.h) / Math.tan(Math.PI / 6);   // mesh = 60°: widen / narrow to the real angle
    const e = this._fx('soundWave', run + n * gap + 0.1, (e) => { const t = e.t;
      ws.forEach((q, i) => { const k = (t - i * gap) / run, vis = k > 0 && k < 1; q.m.visible = q.a.visible = vis; if (!vis) return;
        const rr = c.r * (0.15 + 0.85 * easeOut(k)) * 0.97, hh = 0.75 + 0.4 * Math.sin(k * Math.PI);
        for (const m of [q.m, q.a]) { m.scale.set(rr * sx, hh, rr); m.material.uniforms.uT.value = t + i; }
        q.m.material.uniforms.uA.value = I * (1.6 - 0.15 * i) * smooth(0, 0.1, k) * (1 - smooth(0.6, 1, k)); q.a.material.uniforms.uA.value = 0.65 * smooth(0, 0.1, k) * (1 - smooth(0.55, 1, k)); });
    });
    e.g.position.copy(c.g0).setY(c.g0.y + 0.25); e.g.rotation.set(0, Math.atan2(c.d.x, c.d.z), 0);
    for (let i = 0; i < n; i++) { const [w, b] = cols[i % 2]; const m = this._m(e, 'add', this.geo.rm_wave, { w, b, s: 16, order: 6 }), a = this._m(e, 'alpha', this.geo.rm_wave, { w, b, s: 16, order: 5 }); m.visible = a.visible = false; ws.push({ m, a }); }
    this.emit('streak', low ? 4 : 9, () => { const th = rnd(-c.h, c.h) * 0.85, d = _b.copy(c.d).applyAxisAngle(UP, th);
      return { p: _a.copy(c.g0).addScaledVector(d, 0.6).setY(c.g0.y + rnd(0.4, 1.1)), v: _c.copy(d).multiplyScalar(c.r * rnd(2.0, 2.6)), s: rnd(0.05, 0.07), col: rand() < 0.5 ? cols[0][0] : cols[1][1], life: c.r / (c.r * 2.3) * 0.9, drag: 0.5, stretch: 0.05 }; });
    return e;
  }
  /** 불협화음: 삐죽하게 떨리는 고리 벽 두 개(rm_band, uJ 흔들림)가 엇갈린 색으로 판정 원(r) 안에서 퍼짐 + 가운데 섬광 + 사방으로 튀는 빛줄기 */
  discordRing(pc, o = {}) {
    if (!this.ok() || !pc) return null;
    const low = rmLite(), I = RMFX.intensity * rawK(), g0 = P3(pc.pos), r = o.r || 2.6, rs = [];
    const e = this._fx('discord', 0.6, (e) => { const t = e.t;
      rs.forEach((q, i) => { const k = (t - q.d) / 0.4, vis = k > 0 && k < 1; q.m.visible = q.a.visible = vis; if (!vis) return; const rr = r * (0.2 + 0.72 * easeOut(k)), hh = 0.5 + 0.25 * Math.sin(k * Math.PI);
        for (const m of [q.m, q.a]) { m.scale.set(rr, hh, rr); m.material.uniforms.uT.value = t * (i ? -1 : 1); m.material.uniforms.uJ.value = 0.07 * (1 - 0.5 * k); }
        q.m.material.uniforms.uA.value = I * 1.3 * smooth(0, 0.08, k) * (1 - smooth(0.55, 1, k)); q.a.material.uniforms.uA.value = 0.45 * (1 - smooth(0.5, 1, k)); });
      this._face(fl, 1.2 * (0.6 + 0.5 * easeOut(t / 0.03))); fl.material.uniforms.uA.value = I * 1.3 * (1 - smooth(0.012, 0.07, t));
    });
    e.g.position.copy(g0).setY(g0.y + 0.15);
    for (const [i, w, b] of [[0, 0xffc8ff, 0xc84aff], [1, 0xeaffb0, 0x8ac81a]]) { const m = this._m(e, 'add', this.geo.rm_band, { w, b, s: 16, order: 6 }), a = this._m(e, 'alpha', this.geo.rm_band, { w, b, s: 16, order: 5 });
      for (const x of [m, a]) { x.material.uniforms.uE.value = 2; x.visible = false; } rs.push({ m, a, d: i * 0.07 }); }
    const fl = this._m(e, 'add', this.quad, { w: 0xffffff, b: 0xc84aff, s: 4, order: 9 }); fl.position.y = 0.85;
    this.emit('streak', low ? 5 : 12, (i) => { const a = rnd(0, 6.28), d = _b.set(Math.cos(a), 0, Math.sin(a)); return { p: _a.copy(g0).addScaledVector(d, 0.4).setY(g0.y + rnd(0.5, 1.1)), v: _c.copy(d).multiplyScalar(rnd(5, 7)).setY(rnd(-0.5, 0.8)), s: rnd(0.05, 0.07), col: i % 2 ? 0xff7aff : 0xc8ff5a, life: r / 7, drag: 1, stretch: 0.07 }; });
    return e;
  }

  // ================================================================== 휘두르기·찌르기 (8묶음: 붓 휘두르기·유봉 휘두르기·꼬치 찌르기)
  /** a flat 3-layer crescent (bladeLayers on rm_cres) swept round centre c (three) in the ground plane at height y:
   *  o: {yaw (local +Z = forward), R (radius), y, dir (+1 right->left like the swing, -1 mirrored), draw (s for the head to sweep), life, fin, c1, c2, ghosts, tilt}.
   *  The caller keeps it inside the real hit shape (centre / radius chosen from the fan or circle). */
  flatArc(c, o = {}) {
    if (!this.ok()) return null;
    const draw = o.draw ?? 0.14, life = o.life ?? 0.32, R = o.R ?? 1;
    let L = null;
    const e = this._fx('flatArc', draw + life + 0.05, (e) => { const t = e.t, head = clamp01(easeOut(t / draw)) * 1.02, u = Math.max(0, t - draw), fade = 1 - smooth(0.02, life, u), tail = 1.2 * (1 - smooth(0.05, life, u)) + 0.08;
      this.bladeSet(L, head, tail, fade, o.k ?? 1); });
    e.g.position.copy(c.isVector3 ? c : P3(c)); e.g.position.y += o.y ?? 0.9;
    e.g.rotation.set(o.tilt ?? 0, o.yaw ?? 0, 0, 'YXZ'); e.g.scale.set(R * (o.dir === -1 ? -1 : 1), R * (o.thick ?? 1.6), R);
    L = this.bladeLayers(e.g, { fin: !!o.fin, c1: o.c1, c2: o.c2, ghosts: o.ghosts ?? 2 });
    if (L) for (const m of [L.halo, L.body, L.core, ...L.gh]) m.material.depthTest = true;
    e.free = () => { if (L) { this.bladeFree(L); L = null; } };
    return e;
  }
  /** a straight thrust of light A -> B (three or game coords): the lance head runs out in `run` s leaving a tapered light ribbon over a coloured ribbon, then it fades;
   *  a small star flash at the tip when it arrives (the real line length — the caller passes the hit line). */
  lance(A0, B0, o = {}) {
    if (!this.ok()) return null;
    const low = rmLite(), I = RMFX.intensity * rawK(), A = A0.isVector3 ? A0.clone() : P3(A0), B = B0.isVector3 ? B0.clone() : P3(B0), run = o.run ?? 0.08, life = o.life ?? 0.3, col = o.col ?? 0xffb060, hi = o.hi ?? 0xffffff, w = o.w ?? 0.34, N = 14, pts = [];
    for (let i = 0; i < N; i++) pts.push(new THREE.Vector3());
    const e = this._fx('lance', run + life, (e) => { const t = e.t, k = easeOut(t / run), fade = 1 - smooth(run * 0.6, run + life, t);
      for (let i = 0; i < N; i++) pts[i].copy(A).lerp(B, k * i / (N - 1));
      this._ribFill(ribP, pts, (q) => w * (0.25 + 0.75 * q)); this._ribFill(ribL, pts, (q) => w * 0.45 * (0.2 + 0.8 * q));
      ribP.material.uniforms.uA.value = 0.85 * fade; ribL.material.uniforms.uA.value = I * 1.3 * fade;
      const ft = t - run; tip.visible = ft > -0.02; this._face(tip, (o.flash ?? 0.8) * (0.6 + 0.5 * easeOut(Math.max(0, ft) / 0.03))); tip.position.copy(pts[N - 1]); tip.rotateZ(0.5); tip.material.uniforms.uA.value = I * 1.3 * (1 - smooth(0.01, 0.06, Math.max(0, ft)));
    });
    e.g.position.set(0, 0, 0);
    const tip = this._m(e, 'add', this.quad, { w: 0xffffff, b: col, s: 4, order: 10 }); tip.material.depthTest = false;
    const ribP = this._rib(N), ribL = this._rib(N); ribP.material = ribP.userData.mats[0]; ribL.material = ribL.userData.mats[1];
    for (const [m, a, b, o2] of [[ribP, o.light ?? col, col, 5], [ribL, hi, col, 6]]) { const u = m.material.uniforms; u.uW.value.setHex(a); u.uB.value.setHex(b); u.uQ.value = rnd(0, 20); u.uA.value = 0; m.renderOrder = o2; this.root.add(m); }
    e.ribs = [ribP, ribL];
    this.emit('streak', Math.round(5 * (low ? RMFX.liteK : 1)), () => { _b.subVectors(B, A).normalize(); return { p: B, v: _c.copy(_b).multiplyScalar(rnd(3, 6)).add(_a.set(rnd(-1.5, 1.5), rnd(0, 1.5), rnd(-1.5, 1.5))), s: rnd(0.04, 0.06), col: rand() < 0.5 ? hi : col, life: rnd(0.12, 0.2), drag: 7, stretch: 0.09, t: -run }; });
    return e;
  }

  /** 돌풍(드라이 돌풍): 판정 부채꼴 안을 감아 도는 바람 리본 n개(머리가 앞으로 달려 나가며 나선으로 꼬임 — 빛 리본 + 옅은 색 리본), 앞으로 밀려 나가는 바람 띠 빛줄기.
   *  o: {f (game facing), r, ang, at (s), cols [hi, col]} */
  windCone(pc, o = {}) {
    if (!this.ok() || !pc) return null;
    const low = rmLite(), I = RMFX.intensity * rawK(), c = this._cone(pc, o), at = o.at || 0, n = low ? 3 : 5, N = 16, run = 0.32, hi = (o.cols || [])[0] ?? 0xeafff6, col = (o.cols || [])[1] ?? 0x5ad8b0, ws = [];
    const e = this._fx('wind', at + run + 0.45, (e) => { const T = e.t - at;
      ws.forEach((q) => { const k = (T - q.d) / run; q.L.visible = q.P.visible = k > 0; if (k <= 0) return; const head = easeOut(Math.min(1, k)), fade = 1 - smooth(0.7, 1.6, k);
        for (let i = 0; i < N; i++) { const u = head * i / (N - 1), d = 0.35 + u * (c.r * 0.93 - 0.35), tw = q.ph + u * q.turns * 6.283 + T * 6, rr = (0.12 + 0.28 * u) * q.amp;
          q.pts[i].copy(this._inCone(c, Math.max(-0.95, Math.min(0.95, q.a + Math.sin(tw) * rr / Math.max(0.6, d) * 0.6)), d / c.r, q.y + Math.cos(tw) * rr)); }
        this._ribFill(q.L, q.pts, (kk) => q.w * 0.5 * (0.2 + 0.8 * kk)); this._ribFill(q.P, q.pts, (kk) => q.w * (0.25 + 0.75 * kk));
        q.L.material.uniforms.uA.value = I * 1.05 * fade; q.P.material.uniforms.uA.value = 0.6 * fade; });
    });
    e.g.position.set(0, 0, 0); e.ribs = [];
    for (let i = 0; i < n; i++) { const L = this._rib(N), P = this._rib(N); L.material = L.userData.mats[1]; P.material = P.userData.mats[0];
      for (const [m, a, b, o2] of [[P, hi, col, 5], [L, 0xffffff, col, 6]]) { const u = m.material.uniforms; u.uW.value.setHex(a); u.uB.value.setHex(b); u.uQ.value = rnd(0, 20); u.uA.value = 0; m.renderOrder = o2; m.visible = false; this.root.add(m); }
      const pts = []; for (let j = 0; j < N; j++) pts.push(new THREE.Vector3());
      ws.push({ L, P, pts, d: i * 0.045, a: (n === 1 ? 0 : (i / (n - 1)) * 1.4 - 0.7) + rnd(-0.08, 0.08), y: rnd(0.35, 1.0), ph: rnd(0, 6.283), turns: rnd(1.2, 2), amp: rnd(0.7, 1.1), w: rnd(0.16, 0.24) }); e.ribs.push(L, P); }
    this.emit('streak', low ? 4 : 9, () => { const th = rnd(-c.h, c.h) * 0.85, d = _b.copy(c.d).applyAxisAngle(UP, th);
      return { p: _a.copy(c.g0).addScaledVector(d, 0.5).setY(c.g0.y + rnd(0.3, 1.1)), v: _c.copy(d).multiplyScalar(c.r * rnd(2.2, 2.8)), s: rnd(0.04, 0.06), col: rand() < 0.5 ? 0xffffff : col, life: 0.32, drag: 0.6, stretch: 0.07, t: -at }; });
    return e;
  }

  // ================================================================== 무거운 내려찍기 (7묶음: 모루 떨구기·천근쇄약·팬 강타·백련타 마무리)
  /** heavy ground slam at p (game coords, ground y): 0.06 s white star flash + hot crater glow, radial crack star growing out (light + dark layers),
   *  two shock rings, a low dust wall that rises and thins, rubble chunks + hot sparks. Everything inside r (the real hit radius, capped). */
  slam(p, o = {}) {
    if (!this.ok() || !p) return null;
    const low = rmLite(), P = RmFx.PAL[o.pal] || RmFx.PAL.gold, I = RMFX.intensity * rawK(), g = p.isVector3 ? p.clone() : P3(p), r = Math.min(o.r ?? 1.6, o.maxR ?? 3.2), k = o.k ?? 1;
    const fs = Math.min(1.6, 0.7 + r * 0.35) * k, life = 0.95;
    const e = this._fx('slam', life, (e) => { const t = e.t;
      this._face(fl, fs * (0.55 + 0.6 * easeOut(t / 0.03))); fl.rotateZ(0.4); fl.material.uniforms.uA.value = I * 1.4 * (1 - smooth(0.012, 0.065, t));
      this._face(gw, fs * 0.9 * (0.6 + 0.5 * easeOut(t / 0.12))); gw.material.uniforms.uA.value = I * 0.6 * (1 - smooth(0.04, 0.3, t));
      const ce = 0.12 + 1.0 * easeOut(t / 0.14); for (const [m, a] of [[cr, I * 1.25 * (1 - smooth(0.25, 0.85, t))], [crD, 0.75 * (1 - smooth(0.45, 0.95, t))]]) { m.material.uniforms.uE.value = ce; m.material.uniforms.uA.value = a; }
      const k1 = t / 0.26, k2 = (t - 0.06) / 0.38;
      r1.visible = k1 < 1; r1.scale.set(r * (0.2 + 0.8 * easeOut(k1)), 1, r * (0.2 + 0.8 * easeOut(k1))); r1.material.uniforms.uA.value = I * 1.3 * (1 - smooth(0.4, 1, k1)); r1.material.uniforms.uT.value = t;
      r2.visible = k2 > 0 && k2 < 1; r2.scale.set(r * 0.8 * (0.2 + 0.8 * easeOut(k2)), 1, r * 0.8 * (0.2 + 0.8 * easeOut(k2))); r2.material.uniforms.uA.value = I * 0.8 * (1 - smooth(0.3, 1, k2));
      const kd = t / 0.8, dr = r * (0.3 + 0.62 * easeOut(kd * 1.4)), dh = (0.22 + 0.22 * k) * (0.4 + 0.6 * easeOut(kd * 2));
      dust.scale.set(dr, dh, dr); dust.material.uniforms.uT.value = t; dust.material.uniforms.uE.value = 1.3 - 1.2 * smooth(0.25, 1, kd); dust.material.uniforms.uA.value = 0.8 * smooth(0, 0.05, t) * (1 - smooth(0.45, 0.85, kd));
    });
    e.g.position.copy(g);
    const fl = this._m(e, 'add', this.quad, { w: 0xffffff, b: P.mid, s: 4, order: 10 }); fl.position.y = 0.45; fl.material.depthTest = false;
    const gw = this._m(e, 'add', this.quad, { w: P.mid, b: P.b, s: 6, order: 9 }); gw.position.y = 0.35;
    const crD = this._m(e, 'alpha', this.quad, { w: P.deep, b: P.deep, s: 20, order: 2 }); this._flat(crD, r * 2, 0.045);
    const cr = this._m(e, 'add', this.quad, { w: P.w, b: P.b, s: 20, order: 3 }); this._flat(cr, r * 2, 0.055); cr.material.uniforms.uQ.value = crD.material.uniforms.uQ.value;
    const r1 = this._m(e, 'add', this.geo.rm_ring, { w: 0xffffff, b: P.b, s: 3, order: 4 }); r1.position.y = 0.07;
    const r2 = this._m(e, 'add', this.geo.rm_ring, { w: P.mid, b: P.b, s: 3, order: 4 }); r2.position.y = 0.08;
    const dc = P.dust || [0xd8c8a0, 0x8a7458], dust = this._m(e, 'alpha', this.geo.rm_band, { w: dc[0], b: dc[1], s: 21, order: 5 }); dust.position.y = 0.02;
    const nR = Math.round((o.rubble ?? 10) * k * (low ? RMFX.liteK : 1)), nS = Math.round(9 * k * (low ? RMFX.liteK : 1));
    this.emit('shard', nR, () => { const a = rnd(0, 6.283), sp = rnd(1.2, 2.6) * Math.min(1.3, r / 1.5); return { p: _a.copy(g).add(_b.set(Math.cos(a) * 0.25, 0.15, Math.sin(a) * 0.25)), v: _c.set(Math.cos(a) * sp, rnd(2.2, 4.2), Math.sin(a) * sp), s: rnd(0.07, 0.13), col: rand() < 0.5 ? dc[1] : dc[0], a: 1, life: rnd(0.5, 0.75), grav: 12, floor: g.y + 0.03, spin: 10 }; });
    this.emit('streak', nS, () => { const a = rnd(0, 6.283); return { p: _a.copy(g).setY(g.y + 0.25), v: _c.set(Math.cos(a) * rnd(3, 6), rnd(1.5, 4), Math.sin(a) * rnd(3, 6)), s: rnd(0.04, 0.06), col: P.ember[(rand() * 3) | 0], life: rnd(0.16, 0.3), drag: 5, stretch: 0.09, grav: 6 }; });
    if (!low) this.emit('star', 3, () => ({ p: _a.copy(g).add(_b.set(rnd(-0.4, 0.4), rnd(0.3, 0.8), rnd(-0.4, 0.4))), v: _c.set(0, rnd(0.5, 1), 0), s: rnd(0.06, 0.09), col: 0xffffff, life: 0.45, spin: 6, t: -rnd(0.02, 0.12) }));
    return e;
  }

  // ================================================================== 번개 (6묶음): 불규칙하게 갈라지는 번개 경로(번쩍일 때마다 새로) · 연속 낙뢰 · 전기 스파크 · 땅/대상에 남는 전류
  // 그림: 층 메시 두 장(가산 빛 = 흰 심 + 색 번짐 / 알파 = 짙은 남색 외곽 — 밝은 바닥에서도 읽힘)에 본 줄기 + 가지를 한꺼번에 채움(draw call 2).
  /** pooled merged strip mesh for bolts (its own geometry, capacity N points) */
  _boltM(e, add) {
    const kind = add ? 'boltL' : 'boltD', p = this.pool[kind] || (this.pool[kind] = []); let m = p.pop();
    if (!m) { const N = 220, g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 6), 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(N * 4), 2).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aI', new THREE.BufferAttribute(new Float32Array(N * 2), 1).setUsage(THREE.DynamicDrawUsage)); g.setIndex(new THREE.BufferAttribute(new Uint16Array(N * 6), 1).setUsage(THREE.DynamicDrawUsage)); g.setDrawRange(0, 0);
      m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: U({ uW: new THREE.Color(), uB: new THREE.Color(), uA: 0, uS: add ? 0 : 1 }), vertexShader: BOLT_VS, fragmentShader: BOLT_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }));
      m.frustumCulled = false; m.userData.kind = kind; m.userData.N = N; }
    m.geometry.setDrawRange(0, 0); m.visible = true; m.renderOrder = add ? 9 : 6; m.material.uniforms.uA.value = 0; e.items.push(m); e.g.add(m); return m;
  }
  /** lines: [{pts: [Vector3], w, i (brightness), tip (fade toward the end)}] -> camera-facing strips in one geometry; wk = width multiplier */
  _boltFill(m, lines, wk) {
    const g = m.geometry, N = m.userData.N, pos = g.attributes.position, uv = g.attributes.uv, ai = g.attributes.aI, idx = g.index.array; let v = 0, n = 0;
    for (const L of lines) { const P = L.pts, c = P.length; if (c < 2 || v + c > N) continue;
      for (let i = 0; i < c; i++) { const p = P[i], pa = P[Math.max(0, i - 1)], pb = P[Math.min(c - 1, i + 1)], k = i / (c - 1);
        _a.subVectors(pb, pa); if (_a.lengthSq() < 1e-8) _a.set(1, 0, 0); _b.subVectors(this.camPos, p); _c.crossVectors(_a, _b); if (_c.lengthSq() < 1e-10) _c.set(0, 1, 0); _c.normalize().multiplyScalar(L.w * wk * (L.tip ? 1 - 0.6 * k : 1) / 2);
        const I = L.i * (L.tip ? Math.pow(1 - k, 0.6) : 1) * (i === 0 && L.tip ? 0.6 : 1);
        pos.setXYZ((v + i) * 2, p.x - _c.x, p.y - _c.y, p.z - _c.z); pos.setXYZ((v + i) * 2 + 1, p.x + _c.x, p.y + _c.y, p.z + _c.z);
        uv.setXY((v + i) * 2, k, 0); uv.setXY((v + i) * 2 + 1, k, 1); ai.setX((v + i) * 2, I); ai.setX((v + i) * 2 + 1, I);
        if (i < c - 1) { const a = (v + i) * 2; idx[n++] = a; idx[n++] = a + 1; idx[n++] = a + 2; idx[n++] = a + 1; idx[n++] = a + 3; idx[n++] = a + 2; } }
      v += c; }
    pos.needsUpdate = uv.needsUpdate = ai.needsUpdate = true; g.index.needsUpdate = true; g.setDrawRange(0, n);
  }
  /** jagged path A -> B by midpoint displacement (amp = fraction of the length, halves each level); flat = displace in the ground plane only */
  _jag(A, B, levels, amp, flat) {
    let P = [A.clone(), B.clone()]; const len = A.distanceTo(B); let d = len * amp; const dir = _a.subVectors(B, A).normalize().clone();
    for (let l = 0; l < levels; l++) { const Q = [P[0]];
      for (let i = 0; i < P.length - 1; i++) { const m = P[i].clone().lerp(P[i + 1], 0.5 + rnd(-0.12, 0.12));
        if (flat) { _b.set(-dir.z, 0, dir.x); m.addScaledVector(_b, rnd(-d, d)); m.y += rnd(-0.03, 0.05) * d; }
        else { _b.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)); _b.addScaledVector(dir, -_b.dot(dir)); if (_b.lengthSq() < 1e-6) _b.set(1, 0, 0); m.addScaledVector(_b.normalize(), rnd(0.35, 1) * d); }
        Q.push(m, P[i + 1]); }
      P = Q; d *= 0.52; }
    return P;
  }
  /** a lightning tree: main path + branches forking off at random points (each regenerated per flash) */
  _boltTree(A, B, o, low) {
    const len = A.distanceTo(B), lv = Math.max(2, Math.min(5, Math.round(Math.log2(len / 0.16)))), main = this._jag(A, B, lv, o.jag ?? 0.2, o.flat), lines = [{ pts: main, w: o.w, i: 1 }];
    const nb = low ? Math.min(o.branches ?? 3, 2) : (o.branches ?? 3), dir = _c.subVectors(B, A).normalize().clone();
    for (let b = 0; b < nb; b++) { const i0 = Math.floor(main.length * rnd(0.18, 0.78)), p0 = main[i0], bl = len * rnd(0.16, 0.38);
      _b.set(rnd(-1, 1), o.flat ? 0 : rnd(-1, 1), rnd(-1, 1)); _b.addScaledVector(dir, -_b.dot(dir)).normalize();
      const p1 = p0.clone().addScaledVector(dir, bl * rnd(0.45, 0.85)).addScaledVector(_b, bl * rnd(0.45, 0.8)); if (o.floorY != null) p1.y = Math.max(p1.y, o.floorY + 0.03);
      const br = this._jag(p0, p1, Math.max(1, lv - 2), 0.28, o.flat); lines.push({ pts: br, w: o.w * 0.6, i: 0.7, tip: true });
      if (!low && rand() < 0.5) { const j = Math.floor(br.length * rnd(0.3, 0.7)), q0 = br[j], q1 = q0.clone().addScaledVector(dir, bl * 0.3).addScaledVector(_b.set(rnd(-1, 1), o.flat ? 0 : rnd(-0.5, 0.5), rnd(-1, 1)).normalize(), bl * 0.3);
        lines.push({ pts: this._jag(q0, q1, 1, 0.3, o.flat), w: o.w * 0.4, i: 0.5, tip: true }); } }
    return lines;
  }
  /** electric sparks (white/blue streaks) thrown from p (three) */
  _zapSparks(p, n, col, o = {}) { this.emit('streak', n, () => { _b.set(rnd(-1, 1), rnd(o.up ?? 0.1, 1), rnd(-1, 1)).normalize();
    return { p, v: _c.copy(_b).multiplyScalar(rnd(3.5, 7)), s: rnd(0.035, 0.055), col: rand() < 0.45 ? 0xffffff : col, life: rnd(0.1, 0.2), drag: 7, stretch: 0.11, grav: 4 }; }); }
  /** 번개 한 줄기(연속 낙뢰): A -> B (THREE.Vector3 = 화면 좌표, 아니면 게임 좌표 {x,y,z}). 번쩍일 때마다 경로·가지를 새로 만들고, strikes번 gap 간격으로 다시 침.
   *  o: {col, hi, deep, w, strikes, gap, branches, jag, flat, impact (B에 0.05초 섬광·땅 고리·스파크), r (고리 반지름 상한), linger (B 땅에 남는 전류 초), floorY}. 반환 = 효과 */
  lightning(A0, B0, o = {}) {
    if (!this.ok() || !A0 || !B0) return null;
    const low = rmLite(), I = RMFX.intensity * rawK(), A = A0.isVector3 ? A0.clone() : P3(A0), B = B0.isVector3 ? B0.clone() : P3(B0);
    const col = o.col ?? 0x6ab8ff, hi = o.hi ?? 0xf4fbff, deep = o.deep ?? 0x1c2c8c, strikes = Math.max(1, o.strikes ?? 2), gap = o.gap ?? 0.075, w = o.w ?? 0.11, fl = o.flash ?? 1;
    const gy = o.groundY != null ? o.groundY : B.y, life = (strikes - 1) * gap + 0.22;
    let k0 = -1;
    const e = this._fx('bolt', life + 0.05, (e) => { const t = e.t, i = Math.min(strikes - 1, Math.floor(t / gap));
      if (i !== k0) { k0 = i; const lines = this._boltTree(A, B, { w, branches: o.branches, jag: o.jag, flat: o.flat, floorY: o.floorY }, low); this._boltFill(L, lines, 3.2); this._boltFill(D, lines, 4.6);
        if (o.impact !== false) { this._zapSparks(B.clone().setY(B.y + 0.1), Math.round((i ? 3 : 7) * (low ? RMFX.liteK : 1)), col); if (i) { f0 = t; } } }
      const T = t - k0 * gap, env = (k0 === strikes - 1 ? 1 - smooth(0.02, 0.2, T) : Math.exp(-T * 22)) * (k0 ? 0.85 : 1) * (0.85 + 0.15 * Math.sin(t * 90));
      L.material.uniforms.uA.value = I * 1.25 * env; D.material.uniforms.uA.value = 0.85 * Math.min(1, env * 1.3);
      if (fx) { const ft = t - f0; this._face(fx, (o.flashSize || 0.9) * fl * (0.6 + 0.5 * easeOut(ft / 0.03))); fx.material.uniforms.uA.value = I * 1.3 * (1 - smooth(0.012, 0.06, ft)); }
      if (ring) { const kr = t / 0.28; ring.visible = kr < 1; const R = Math.min(o.r ?? 1.1, 1.4) * (0.3 + 0.7 * easeOut(kr)); ring.scale.set(R, 1, R); ring.material.uniforms.uA.value = I * 1.1 * (1 - smooth(0.4, 1, kr)); ring.material.uniforms.uT.value = t; }
    });
    let f0 = 0; e.g.position.set(0, 0, 0);
    const D = this._boltM(e, false), L = this._boltM(e, true);
    L.material.uniforms.uW.value.setHex(hi); L.material.uniforms.uB.value.setHex(col); D.material.uniforms.uB.value.setHex(deep); D.material.uniforms.uW.value.setHex(deep);
    const fx = o.impact === false ? null : this._m(e, 'add', this.quad, { w: 0xffffff, b: col, s: 4, order: 10 }); if (fx) { fx.position.copy(B).setY(B.y + 0.35); fx.material.depthTest = false; }
    const ring = o.impact === false || o.flat ? null : this._m(e, 'add', this.geo.rm_ring, { w: hi, b: col, s: 3, order: 4 }); if (ring) ring.position.copy(B).setY(gy + 0.06);
    if (o.linger) this.current(B.clone().setY(gy), { r: Math.min(o.r ?? 1.1, 1.4), dur: o.linger, col, hi, deep, delay: 0.04 });
    return e;
  }
  /** 땅에 남는 전류: p(화면 좌표, 땅 높이) 둘레 반지름 r 안에서 짧은 지그재그 전류가 0.06초마다 새로 기어다니다 사라짐 + 가끔 튀는 스파크 */
  current(p, o = {}) {
    if (!this.ok() || !p) return null;
    const low = rmLite(), I = RMFX.intensity * rawK(), c = p.isVector3 ? p.clone() : P3(p), r = o.r ?? 1, dur = o.dur ?? 0.6, n = low ? 2 : (o.n ?? 4), d0 = o.delay || 0, col = o.col ?? 0x6ab8ff;
    let nt = 0, sp = 0;
    const e = this._fx('current', d0 + dur, (e, dt) => { const t = e.t - d0; if (t < 0) return; const k = t / dur;
      nt -= dt; if (nt <= 0) { nt = 0.06; const lines = [];
        for (let i = 0; i < n; i++) { const a = rnd(0, 6.283), a2 = a + rnd(-0.9, 0.9), r0 = rnd(0, r * 0.35), r1 = rnd(r * 0.55, r * 0.95);
          const A = new THREE.Vector3(c.x + Math.cos(a) * r0, c.y + 0.05, c.z + Math.sin(a) * r0), B = new THREE.Vector3(c.x + Math.cos(a2) * r1, c.y + 0.05, c.z + Math.sin(a2) * r1);
          lines.push({ pts: this._jag(A, B, 3, 0.25, true), w: 0.06, i: rnd(0.6, 1), tip: true }); }
        this._boltFill(L, lines, 3); this._boltFill(D, lines, 4); }
      const env = (1 - smooth(0.45, 1, k)) * (0.6 + 0.4 * Math.sin(t * 70)); L.material.uniforms.uA.value = I * 1.05 * env; D.material.uniforms.uA.value = 0.5 * env;
      sp -= dt; if (sp <= 0 && k < 0.8) { sp = low ? 0.2 : 0.1; const a = rnd(0, 6.283), rr = rnd(0, r * 0.9); this._zapSparks(new THREE.Vector3(c.x + Math.cos(a) * rr, c.y + 0.08, c.z + Math.sin(a) * rr), 1, col, { up: 0.5 }); }
    });
    e.g.position.set(0, 0, 0);
    const D = this._boltM(e, false), L = this._boltM(e, true);
    L.material.uniforms.uW.value.setHex(o.hi ?? 0xf4fbff); L.material.uniforms.uB.value.setHex(col); D.material.uniforms.uB.value.setHex(o.deep ?? 0x1c2c8c);
    return e;
  }
  /** 대상에 남는 전류: 몸 둘레(반지름 0.8 r, 발 위 0.2 ~ 2r 높이)를 따라 기어다니는 짧은 호 n개, 대상을 따라감 */
  crawl(t, o = {}) {
    if (!this.ok() || !t || !t.pos) return null;
    const low = rmLite(), I = RMFX.intensity * rawK(), dur = o.dur ?? 0.5, n = low ? 2 : (o.n ?? 3), col = o.col ?? 0x6ab8ff;
    let nt = 0;
    const e = this._fx('crawl', dur, (e, dt) => { const k = e.t / dur, r = (t.radius || 0.5), h = Math.min(1.6, r * 2 + 0.2), c = P3(t.pos);
      nt -= dt; if (nt <= 0) { nt = 0.05; const lines = [];
        for (let i = 0; i < n; i++) { const a = rnd(0, 6.283), y0 = rnd(0.2, h), A = new THREE.Vector3(c.x + Math.cos(a) * r * 0.85, c.y + y0, c.z + Math.sin(a) * r * 0.85), a2 = a + rnd(-1.4, 1.4), B = new THREE.Vector3(c.x + Math.cos(a2) * r * 0.85, c.y + Math.max(0.1, y0 + rnd(-0.5, 0.5)), c.z + Math.sin(a2) * r * 0.85);
          lines.push({ pts: this._jag(A, B, 2, 0.3, false), w: 0.05, i: rnd(0.6, 1) }); }
        this._boltFill(L, lines, 3); this._boltFill(D, lines, 3.6); }
      const env = (1 - smooth(0.5, 1, k)) * (0.55 + 0.45 * Math.sin(e.t * 80)); L.material.uniforms.uA.value = I * env; D.material.uniforms.uA.value = 0.4 * env;
      if (t.dead && e.t > 0.1) e.t = Math.max(e.t, dur * 0.8);
    });
    e.g.position.set(0, 0, 0);
    const D = this._boltM(e, false), L = this._boltM(e, true);
    L.material.uniforms.uW.value.setHex(o.hi ?? 0xf4fbff); L.material.uniforms.uB.value.setHex(col); D.material.uniforms.uB.value.setHex(o.deep ?? 0x1c2c8c);
    for (const m of [L, D]) m.material.depthTest = false;
    return e;
  }

  // ================================================================== 회복 (요리사 먹기·미용사 기분 전환): 금·초록 마법진 + 몸을 감고 오르는 빛 고리 + 오르는 빛 입자
  healAura(pc, o = {}) {
    if (!this.ok() || !pc || !pc.pos) return null;
    const low = rmLite(), gold = o.gold ?? 0xffe08a, col = o.col ?? 0x7dffb0, I = RMFX.intensity * rawK(), dur = o.dur || 1.5, R = o.r || 0.95;
    let pT = 0;
    const e = this._fx('heal', dur, (e, dt) => { const t = e.t, k = t / dur;
      e.g.position.set(pc.pos.x, pc.pos.y || 0, -pc.pos.z);
      sig.material.uniforms.uE.value = easeOut(t / 0.3); sig.material.uniforms.uT.value = t; sig.material.uniforms.uA.value = I * 0.9 * (1 - smooth(0.6, 1, k));
      glow.material.uniforms.uA.value = I * 0.35 * (1 - smooth(0.5, 1, k));
      rings.forEach((m, i) => { const kk = (t - 0.12 - i * 0.22) / 0.75; m.visible = kk > 0 && kk < 1; const h = 0.1 + 1.6 * easeOut(kk), rr = 0.62 - 0.18 * kk;
        m.position.y = h; m.scale.set(rr, 1, rr); m.material.uniforms.uA.value = I * 1.1 * Math.sin(Math.PI * Math.min(1, Math.max(0, kk))); m.material.uniforms.uT.value = t; });
      pT -= dt; if (pT <= 0 && k < 0.8) { pT = low ? 0.06 : 0.03; const a = rnd(0, Math.PI * 2), rr = rnd(0.2, R * 0.8), P = e.g.position;
        this.emit('streak', 1, () => ({ p: _a.set(P.x + Math.cos(a) * rr, P.y + rnd(0, 0.4), P.z + Math.sin(a) * rr), v: _c.set(0, rnd(1.6, 2.6), 0), s: rnd(0.035, 0.05), col: rand() < 0.5 ? gold : col, life: rnd(0.45, 0.7), stretch: 0.09 }));
        if (!low && rand() < 0.5) this.emit('star', 1, () => ({ p: _a.set(P.x + Math.cos(a) * rr * 0.8, P.y + rnd(0.3, 1.4), P.z + Math.sin(a) * rr * 0.8), v: _c.set(0, rnd(0.4, 0.9), 0), s: rnd(0.04, 0.07), col: rand() < 0.5 ? 0xffffff : col, life: 0.5, spin: 5 })); }
    });
    e.g.position.set(pc.pos.x, pc.pos.y || 0, -pc.pos.z);
    const sig = this._m(e, 'add', this.quad, { w: gold, b: col, s: o.s ?? 10, order: 3 }); this._flat(sig, R * 2, 0.05);   // o.s: 10 회복 잎 / 18 눈꽃(보호막) / 14 육망성(코팅)
    const glow = this._m(e, 'add', this.quad, { w: col, b: col, s: 6, order: 2 }); this._flat(glow, R * 2.3, 0.04);
    const rings = [0, 1, 2].map(i => this._m(e, 'add', this.geo.rm_ring, { w: 0xffffff, b: i % 2 ? gold : col, s: 3, order: 7 }));
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
    if (e.dead) return; e.dead = true; if (e.free) { try { e.free(); } catch (err) { /* ignore */ } } this.root.remove(e.g);
    for (const r of e.ribs || []) { this.root.remove(r); r.material = r.userData.mats[0]; this.ribs.push(r); } e.ribs = null;
    for (const m of e.items) { if (m.parent) m.parent.remove(m); (this.pool[m.userData.kind] || (this.pool[m.userData.kind] = [])).push(m); } e.items.length = 0;
  }
  clear() { for (const e of this.live) this._free(e); this.live = []; if (this.parts) for (const k in this.parts) this.parts[k].clear(); }
  /** live effects + live particles (tests: nothing may stay behind) */
  stats() { let p = 0; if (this.parts) for (const k in this.parts) p += this.parts[k].list.length; return { live: this.live.length, parts: p }; }
}
