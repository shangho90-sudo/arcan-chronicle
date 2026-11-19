// 엔지니어 2차 스킬 이펙트 (2026-11-16, 2026-11-17 fx2 '화려하게' 개편). 규칙은 js/engineer.js, 부품 메시는 tools/blender/fx_engineer.py -> assets/fx/fx_engineer.glb.json
// (부품마다 피벗이 실제 관절·회전축 — 전개·조준·반동·코일 점등·덮개 개방·냉각판은 여기서 런타임으로 움직임)
// + Tripo 덩어리 tools/tripo/en_assets.py -> tools/blender/fx_engineer_tripo.py -> assets/fx/fx_engineer_tripo.glb.json
//   (tripo_w_hull 워커 몸통 · tripo_w_thigh/_shin 워커 다리를 무릎에서 나눔 · tripo_sentry 센트리 머리 · tripo_drone 드론 몸통 — 피벗은 절차 부품과 같은 자리,
//    움직이는 부품(포신·날개·덮개·냉각판·장갑판)은 그대로 절차 부품. 파일이 없으면 모두 절차 부품).
// 시각 정체성: 동화풍 마도공학 — 강철 몸체 + 구리 코일 + 작은 동력 결정 + 가죽 끈. 색 역할(빛보다 부품의 움직임이 먼저):
//   일반 가동 청색·청록 / 실탄·폭발 주황·금 / 전자기 청백 / 과부하 주황 코어 + 붉은 경고등 + 냉각판 열림 / 정비 작은 청록 불빛 + 용접 불꽃.
// 층(fx2, 모든 스킬): (1) 시전 준비 = 발밑 '설계 마법진'(sigil: 톱니 고리·눈금·금테 + 무늬 0 톱니·육각 / 1 조준경 / 2 회로·삼각 / 3 설계도 격자, 일반 블렌딩 + 가산 빛 두 장)
//   + 손 모임 빛 (2) 본체 = 병기 메시(Tripo 덩어리 + 절차 부품) + 꼬리 리본·불티 (3) 명중 = bang(섬광·세운 고리·별·너트·톱니·불티) + 바닥 고리 + 빛기둥(en_fx_pillar)
//   (4) 잔광 = 천천히 사라지는 마법진·연기. 큰 것(마법진·고리·빛기둥·부채꼴·삼각형)은 실제 판정 크기 안.
// 병기 핸들은 규칙의 상태(s.en: phase·t·yaw·pitch·recoil·walking…)를 매 프레임 읽어 그림 — 규칙은 그림을 기다리지 않음.
// 가장 밝은 순간 = 실제 피해 순간(규칙이 그 순간 handle 메서드를 부름). 전역 블룸·노출·정지는 안 건드림(가산 색 ≤ 1 — 블룸 문턱 2.6 아래).
// 성능: 별·톱니·너트·파편·불티·탄피·반짝이·연기는 종류마다 InstancedMesh 하나(Parts, draw call 1, 상한 ENFX.cap — 차면 새 입자를 버림).
// 메시·재질은 종류별 풀(CookFx)에서 재사용. 난수는 자기 것(rand)만 — 게임 Math.random(명중·치명 굴림)을 건드리지 않음.
// 저사양(휴대폰 / 그래픽 효과 끔): 입자 수만 ENFX.liteK배 — 마법진·빛기둥·병기·탄·리본은 그대로.
// 소리: 판정 순간 소리(en_shot/pile/cannon/…)는 규칙이 내고, 그림에만 있는 순간(전개·조립·냉각판·조준 고정·낙하·코어 회수·경보·제작)은 여기서 snd() — Runway(tools/audio/en_runway_sfx.py).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { gfxOn } from './gfxq.js';
import { CookFx, cookTop } from './cookfx.js';

export const ENFX = {
  intensity: 1.0,
  col: { teal: 0x5ae6d2, tealB: 0x1a8a9a, blue: 0x5aaaff, blueB: 0x1a4aa0, ice: 0xd8f0ff, iceB: 0x5a9aff, gold: 0xffd27a, goldB: 0xff8a2a, orange: 0xff9a3a, orangeB: 0xd84a10,
    red: 0xff3a2a, redB: 0x9a1008, steam: 0xf0f4f8, steamB: 0xb0bccc, smoke: 0x9aa0aa, smokeB: 0x5a5f68, spark: 0xffe0a0,
    mint: 0x9affe8, sky: 0x9ad8ff, white: 0xf4fbff, navy: 0x163a78, brass: 0xffc860, copper: 0xff9a5a, steel: 0xc8d4e4, pink: 0xffb0c8 },
  tint: 0x9aa8bc,          // 금속 부품 색을 조금 눌러 줌(밝은 바닥에서 하얗게 뜨지 않게) — 빛나는 부품은 glowM 이 따로 정함
  walkerScale: 1.18,       // 워커 높이 약 2.7 m (캐릭터의 약 1.6배)
  sentryScale: 1.5,        // fx2: '작게 보임' — 1.3 → 1.5 (Tripo 머리 0.5 m 폭 × 1.5)
  droneScale: 1.6, spiderScale: 1.45,
  // Tripo 덩어리 크기·앞 방향(도) 보정 — 파일 원점 = 절차 부품의 피벗
  tripo: { hull: { s: 1.0, yaw: 0, y: 0 }, thigh: { s: [0.72, 1, 0.8], yaw: 90 }, shin: { s: [0.72, 1, 0.8], yaw: 90 }, sentry: { s: 1.0, yaw: 0 }, drone: { s: 1.0, yaw: 0 } },
  casings: 1, casingsLite: 0, sparks: 6, sparksLite: 3, puffs: 4, puffsLite: 2, helix: 26, helixLite: 12,
  liteK: 0.45,                                                           // 저사양 입자 배율
  cap: { star: 120, gear: 90, nut: 90, shard: 120, spark: 260, casing: 40, glint: 240, mist: 90 },   // 종류별 동시 입자 상한(인스턴스 수)
  sfxGap: 0.07,
};
const C = ENFX.col;
// 색 묶음 [밝은 선, 몸, 금테] — 설계 마법진·bang·빛기둥
const PAL = {
  teal: [0xc8fff4, 0x1a7a8a, 0xffd27a], blue: [0xd8f0ff, 0x1a3f8a, 0xffd27a], ice: [0xeef8ff, 0x2a5ab8, 0xbfe4ff], orange: [0xffe6b0, 0xa8400e, 0xffd27a],
  red: [0xffc0b0, 0x8a1208, 0xffb060], gold: [0xfff0c0, 0x8a5a10, 0xffe090], mint: [0xd8fff2, 0x137a64, 0xffd27a],
};
const P3 = (p) => new THREE.Vector3(p.x, p.y || 0, -p.z);
const lite = () => { const G = window.G; return !!(G && ((G.input && G.input.mobile) || (G.settings && G.settings.graphicsFx === false))); };
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
let _s = 0x5e17a3c | 0;                                                  // 자기 난수(xorshift) — 게임의 Math.random 을 건드리지 않음
const rand = () => { _s ^= _s << 13; _s ^= _s >>> 17; _s ^= _s << 5; return (_s >>> 0) / 4294967296; };
const rnd = (a, b) => a + rand() * (b - a);
const pick = (a) => (Array.isArray(a) ? a[(rand() * a.length) | 0] : a);
const yawRot = (yaw) => Math.atan2(Math.sin(yaw), -Math.cos(yaw));   // game yaw (atan2(fx, fz)) -> three rotation.y so local +Z looks along the facing
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _z = new THREE.Vector3(0, 0, 1), _m4 = new THREE.Matrix4(), _e = new THREE.Euler(), _s3 = new THREE.Vector3(), _col = new THREE.Color();
const FLAT_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
// 바닥 가산 층 uK: 0 부채꼴 파동(uv.x 가로 0..1, uv.y 반지름 0..1, uP = 파동 앞) / 1 삼각형 장판(uv.x = 0 가운데 .. 1 변; fx2: 회로 결) / 2 조준선(uv.x 길이, uv.y 가로 — 가장자리 두 줄)
const EN_FS = `uniform vec3 uW, uB; uniform float uA, uK, uP, uT; varying vec2 vUv;
void main(){ float a = 0., core = 0.;
  if (uK < .5) { float v = vUv.y, u = vUv.x, fr = uP; a = smoothstep(fr - .22, fr, v) * smoothstep(fr + .03, fr, v) * smoothstep(0., .12, u) * smoothstep(1., .88, u); core = smoothstep(fr - .06, fr, v) * smoothstep(fr + .02, fr, v);
    a += smoothstep(fr, fr - .5, v) * smoothstep(0., .3, v) * .14 * step(v, fr) * smoothstep(0., .12, u) * smoothstep(1., .88, u); }
  else if (uK < 1.5) { float e = vUv.x; float tr = smoothstep(.06, .0, abs(fract(e * 4. - uT * 1.3) - .5) - .44);
    a = .10 + .08 * sin(uT * 9. + e * 20.) * .5 + smoothstep(.86, .99, e) * .8 + tr * .35; core = smoothstep(.93, 1., e) + tr * .5; }
  else { float e = abs(vUv.y - .5) * 2.; a = smoothstep(.75, .98, e) * smoothstep(1., .98, e) * (.6 + .4 * sin(vUv.x * 40. - uT * 14.)) + .05; core = smoothstep(.9, .98, e); a *= smoothstep(1., .9, vUv.x);
    a += smoothstep(.12, 0., abs(fract(vUv.x * 9. - uT * 2.) - .5) - .38) * smoothstep(.7, .2, e) * .35 * smoothstep(1., .9, vUv.x); }
  gl_FragColor = vec4(mix(uB, uW, clamp(core, 0., 1.)) * a * uA, 1.); }`;
// 설계 마법진(바닥 판, 반지름 1 = 판정 반경 이하): 금테 이중 고리 + 도는 톱니 고리 + 반대로 도는 눈금 + 안쪽 무늬(uV 0 톱니·육각 / 1 조준경 / 2 회로·삼각 / 3 설계도 격자)
// uP = 그려진 각도(0..1, 위에서 시계 방향으로), uT = 시간, 가운데는 옅게(적·경고가 보이게). uAdd 1 = 가산 빛 층
const ESIG_FS = `uniform vec3 uW, uB, uG; uniform float uA, uP, uT, uV, uAdd; varying vec2 vUv;
#define PI 3.14159265
float band(float r, float c, float w){ return smoothstep(w, w * .3, abs(r - c)); }
float poly(vec2 p, float n, float R, float rot, float w){ float a = atan(p.y, p.x) + rot, s = 2. * PI / n; float d = length(p) * cos(mod(a, s) - s * .5) - R * cos(s * .5); return smoothstep(w, w * .3, abs(d)); }
float seg(vec2 p, vec2 a, vec2 b, float w){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return smoothstep(w, w * .3, length(pa - ba * h)); }
vec2 rot2(vec2 p, float a){ float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
void main(){ vec2 p = vUv * 2. - 1.; float r = length(p); if (r > 1.) discard;
  float ang = atan(p.y, p.x), a01 = fract(.25 - ang / (2. * PI)); float drawn = smoothstep(uP + .004, uP - .004, a01) * step(.001, uP);
  float gold = band(r, .968, .022) + band(r, .905, .01) * .8;
  float tooth = step(.5, fract((ang + uT * .5) / (2. * PI) * 28.));
  float gear = band(r, .8, .012) + smoothstep(.812, .822, r) * smoothstep(.872, .862, r) * tooth * .85;
  float ta = (ang - uT * .3) / (2. * PI) * 72., tk = step(fract(ta), .16) * (mod(floor(ta), 6.) < .5 ? 1. : .55);
  float ticks = smoothstep(.912, .918, r) * smoothstep(.95 , .944, r) * tk;
  float lines = gear * .9 + ticks * .8, rot = -uT * .4; vec2 q = rot2(p, rot);
  if (uV < .5) { lines += poly(p, 6., .56, rot, .014) + poly(p, 6., .34, -rot * 1.5, .01) * .7;
    for (int i = 0; i < 6; i++) { float a = float(i) * PI / 3.; lines += seg(q, vec2(cos(a), sin(a)) * .36, vec2(cos(a), sin(a)) * .74, .009) * .7; } }
  else if (uV < 1.5) { lines += band(r, .62, .01) + band(r, .3, .008) * (.5 + .5 * step(.5, fract((ang - uT) / (2. * PI) * 12.)));
    lines += seg(q, vec2(.14, 0.), vec2(.52, 0.), .01) + seg(q, vec2(-.14, 0.), vec2(-.52, 0.), .01) + seg(q, vec2(0., .14), vec2(0., .52), .01) + seg(q, vec2(0., -.14), vec2(0., -.52), .01);
    float br = band(r, .72, .016) * smoothstep(.16, .1, abs(mod(ang - uT * .7 + PI / 4., PI / 2.) - PI / 4.)); lines += br * 1.2; }
  else if (uV < 2.5) { lines += poly(p, 3., .84, rot - PI / 2., .016) + poly(p, 3., .42, -rot * 1.6 + PI / 2., .011) * .8;
    for (int i = 0; i < 9; i++) { float a = float(i) * 2. * PI / 9. + .2; vec2 d = vec2(cos(a), sin(a)); float L = .5 + .2 * mod(float(i), 2.); lines += seg(q, d * .3, d * L, .007) * .6 + smoothstep(.04, .02, length(q - d * L)) * .9; } }
  else { vec2 g = abs(fract(p * 5. + .5) - .5); lines += (smoothstep(.03, .0, min(g.x, g.y)) * .35) * step(r, .78) + band(r, .64, .009) + poly(p, 4., .6, rot, .012) * .8 + poly(p, 8., .44, -rot, .009) * .5; }
  float wave = band(r, fract(uT * .55), .05) * .35 * step(r, .95), core = exp(-r * r * 22.) * .45, fill = .12 + .18 * smoothstep(.25, .95, r);
  vec3 c = mix(uB, uW, clamp(lines + wave, 0., 1.) * .65); c = mix(c, uG, clamp(gold, 0., 1.)); c = mix(c, uW, core);
  float a = (fill + lines * 1.0 + gold + wave + core) * drawn * uA;
  if (uAdd > .5) gl_FragColor = vec4(c * clamp(a, 0., 1.2) * .7, 1.); else gl_FragColor = vec4(c, clamp(a, 0., .92)); }`;
// 빛기둥(열린 원통, u 둘레 / v 높이): 아래가 밝고 위로 흐려짐, 세로 줄무늬가 돌고 위로 흐름 + 가로 눈금(기계 느낌) — 가산
const PILLAR_FS = `uniform vec3 uW, uB; uniform float uA, uT; varying vec2 vUv;
void main(){ float v = vUv.y, fade = pow(1. - v, 1.5) * smoothstep(0., .05, v);
  float st = .55 + .45 * sin(vUv.x * 43.98 + uT * 3.) * sin(vUv.x * 18.85 - uT * 2.), fl = .7 + .3 * sin((v - uT * 1.4) * 17.), tk = 1. + .6 * smoothstep(.08, 0., abs(fract(v * 6. - uT * 2.) - .5) - .42);
  gl_FragColor = vec4(mix(uW, uB, clamp(v * 1.3, 0., 1.)) * fade * st * fl * tk * uA, 1.); }`;
// 나선 띠(u 길이 0..1 / v 폭): uP = 머리 위치, 머리 뒤 0.5 길이만 보임 — 가산
const HELIX_FS = `uniform vec3 uW, uB; uniform float uA, uP; varying vec2 vUv;
void main(){ float e = 1. - abs(vUv.y * 2. - 1.), k = (uP - vUv.x) / .5; if (k < 0. || k > 1.) discard;
  float a = smoothstep(0., .7, e) * pow(1. - k, 1.3) * smoothstep(0., .04, k + .02); gl_FragColor = vec4(mix(uW, uB, k) * a * uA, 1.); }`;
// 인스턴스 입자: 메시(별·톱니·너트·파편·불티·탄피 — 빛 받는 몸 + 자체 빛) / 빌보드(반짝이 = 가산 네 꼭지 별, 연기 = 부드러운 덩어리)
const PM_VS = `attribute vec3 color; attribute vec3 aC; attribute vec2 aA; varying vec3 vC, vN, vV; varying vec2 vA;
void main(){ vC = aC * color; vA = aA; mat3 im = mat3(instanceMatrix); vN = normalize(normalMatrix * (im * normal)); vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const PM_FS = `varying vec3 vC, vN, vV; varying vec2 vA;
void main(){ vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n; vec3 L = normalize(vec3(-.4, .8, .5)); float d = max(0., dot(n, L)), fr = pow(1. - abs(dot(n, vV)), 2.), sp = pow(max(0., dot(reflect(-L, n), vV)), 24.);
  vec3 c = vC * (.55 + .55 * d) + mix(vC, vec3(1.), .5) * fr * .5 + vec3(1.) * sp * .6 + vC * vA.y; gl_FragColor = vec4(c, vA.x); }`;
const BB_VS = `attribute vec3 aC; attribute vec2 aA; varying vec2 vUv; varying vec3 vC; varying vec2 vA;
void main(){ vUv = uv; vC = aC; vA = aA; vec3 c = vec3(instanceMatrix[3]); float s = length(vec3(instanceMatrix[0])); vec4 mv = modelViewMatrix * vec4(c, 1.); mv.xy += position.xy * s; gl_Position = projectionMatrix * mv; }`;
const GLINT_FS = `varying vec2 vUv; varying vec3 vC; varying vec2 vA;
void main(){ vec2 p = vUv * 2. - 1.; float r = length(p); float s = exp(-abs(p.x) * 13.) * clamp(1. - abs(p.y), 0., 1.) + exp(-abs(p.y) * 13.) * clamp(1. - abs(p.x), 0., 1.);
  float a = s + pow(clamp(1. - r, 0., 1.), 3.) * .8, core = pow(clamp(1. - r * 2.4, 0., 1.), 1.5); gl_FragColor = vec4(mix(vC, vec3(1.), core) * a * vA.x, 1.); }`;
const MIST_FS = `varying vec2 vUv; varying vec3 vC; varying vec2 vA;
void main(){ vec2 p = vUv * 2. - 1.; float r = length(p); gl_FragColor = vec4(vC, pow(clamp(1. - r, 0., 1.), 1.6) * vA.x); }`;
const ADD = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide };

/** 한 종류의 입자 묶음 = InstancedMesh 하나. 입자: 위치·속도·중력·끌림·땅·회전·크기(시작→끝)·색·알파·자체 빛, 수명 동안 페이드 */
class Parts {
  constructor(root, geo, mat, cap, bb) {
    const g = geo.clone(); this.cap = cap; this.bb = bb; this.p = [];
    if (!g.attributes.color) g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
    this.aC = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); this.aA = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2);
    this.aC.setUsage(THREE.DynamicDrawUsage); this.aA.setUsage(THREE.DynamicDrawUsage); g.setAttribute('aC', this.aC); g.setAttribute('aA', this.aA);
    this.m = new THREE.InstancedMesh(g, mat, cap); this.m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.m.count = 0; this.m.frustumCulled = false; this.m.renderOrder = bb === 'mist' ? 4 : 6; root.add(this.m);
  }
  add(o) { if (this.p.length >= this.cap) return null; this.p.push(o); return o; }
  update(dt) {
    let n = 0; const P = this.p;
    for (let i = 0; i < P.length; i++) {
      const q = P[i]; q.t += dt; if (q.t >= q.life) continue;
      const dr = Math.exp(-q.drag * dt); q.vx *= dr; q.vz *= dr; q.vy = q.vy * dr - q.g * dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.y < q.ground) { q.y = q.ground; q.vy = -q.vy * q.bounce; q.vx *= 0.5; q.vz *= 0.5; q.wx *= 0.5; q.wz *= 0.5; }
      q.rx += q.wx * dt; q.ry += q.wy * dt; q.rz += q.wz * dt;
      const k = q.t / q.life, s = q.s0 + (q.s1 - q.s0) * k, a = q.a * smooth(0, q.fin, q.t) * (1 - smooth(q.fo, 1, k));
      _e.set(q.rx, q.ry, q.rz); _q.setFromEuler(_e); _s3.set(s, s * (q.sy || 1), s); _a.set(q.x, q.y, q.z); _m4.compose(_a, _q, _s3); this.m.setMatrixAt(n, _m4);
      this.aC.setXYZ(n, q.r, q.gc, q.b); this.aA.setXY(n, a, q.glow); P[n] = q; n++;
    }
    P.length = n; this.m.count = n;
    if (n) { this.m.instanceMatrix.needsUpdate = true; this.aC.needsUpdate = true; this.aA.needsUpdate = true; }
  }
  clear() { this.p.length = 0; this.m.count = 0; }
}

export class EnFx extends CookFx {
  load() {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const parse = async (url) => { const j = await (await fetch(url)).json(), raw = atob(j.b64), u8 = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i); return new Promise((res, rej) => new GLTFLoader().parse(u8.buffer, '', res, rej)); };
      const g = await parse('assets/fx/fx_engineer.glb.json');
      g.scene.traverse(o => { if (o.isMesh) this.geo[o.name] = o.geometry; });
      this.chips = [this.geo.en_casing].filter(Boolean);
      this.tri3 = new THREE.BufferGeometry(); this._parts(); this.clock = 0; this._sndT = {};
      this.tw = {};
      try {   // Tripo 덩어리(있으면): 워커 몸통·다리, 센트리 머리, 드론 몸통 — 없으면 절차 부품
        const t = await parse('assets/fx/fx_engineer_tripo.glb.json');
        t.scene.traverse(o => { if (o.isMesh && o.material && o.material.map) { o.geometry.computeBoundingBox(); this.tw[o.name] = { geo: o.geometry, map: o.material.map }; } });
      } catch (err) { console.warn('engfx: no Tripo parts', err && err.message); }
      this.ready = true;
    })().catch(e => console.warn('engfx load', e));
    return this.loading;
  }
  _parts() {
    const Cp = ENFX.cap, mesh = () => new THREE.ShaderMaterial({ uniforms: {}, vertexShader: PM_VS, fragmentShader: PM_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const bb = (fs, add) => new THREE.ShaderMaterial({ uniforms: {}, vertexShader: BB_VS, fragmentShader: fs, ...(add ? ADD : { transparent: true, depthWrite: false, side: THREE.DoubleSide }) });
    const quad = this.quad.clone(), G = this.geo;
    this.ps = {};
    for (const [k, gname] of [['star', 'en_fx_star'], ['gear', 'en_fx_gear'], ['nut', 'en_fx_nut'], ['shard', 'en_fx_shard'], ['spark', 'en_lens'], ['casing', 'en_casing']]) if (G[gname]) this.ps[k] = new Parts(this.root, G[gname], mesh(), Cp[k]);
    this.ps.glint = new Parts(this.root, quad, bb(GLINT_FS, true), Cp.glint, 'glint'); this.ps.mist = new Parts(this.root, quad, bb(MIST_FS, false), Cp.mist, 'mist');
  }
  /** 입자 n개: kind star|gear|nut|shard|spark|casing|glint|mist, at = three 좌표. o: col(색 또는 배열), speed[], up[], size[], end(크기 배율), life[], g(중력), drag,
   *  ground(y), bounce, spin, glow, a, cone(방향 벡터), jit, spread(시작 반지름), dy[], fin/fo(페이드), sy(세로 늘림), keep(저사양에도 그대로) */
  emit(kind, at, n, o = {}) {
    const P = this.ps && this.ps[kind]; if (!P || n <= 0) return;
    if (lite() && !o.keep) n = Math.max(1, Math.round(n * ENFX.liteK));
    const sp = o.speed || [0.6, 1.8], up = o.up || [0.6, 1.8], sz = o.size || [0.05, 0.09], lf = o.life || [0.45, 0.7];
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2), v = rnd(sp[0], sp[1]), r0 = o.spread ? Math.sqrt(rand()) * o.spread : 0; let vx = Math.cos(a) * v, vz = Math.sin(a) * v;
      if (o.cone) { const c = o.cone, j = o.jit ?? 0.35; vx = (c.x + rnd(-j, j)) * v; vz = (c.z + rnd(-j, j)) * v; }
      _col.setHex(pick(o.col ?? 0xffffff)); const s = rnd(sz[0], sz[1]);
      if (!P.add({ x: at.x + Math.cos(a) * r0, y: at.y + (o.dy ? rnd(o.dy[0], o.dy[1]) : 0), z: at.z + Math.sin(a) * r0, vx, vy: rnd(up[0], up[1]) + (o.cone ? (o.cone.y || 0) * v : 0), vz,
        g: o.g ?? 6, drag: o.drag ?? 1.2, ground: o.ground ?? -1e9, bounce: o.bounce ?? 0.25, rx: rnd(0, 6.28), ry: rnd(0, 6.28), rz: rnd(0, 6.28),
        wx: rnd(-1, 1) * (o.spin ?? 8), wy: rnd(-1, 1) * (o.spin ?? 8), wz: rnd(-1, 1) * (o.spin ?? 8), s0: s, s1: s * (o.end ?? 0.4), sy: o.sy, r: _col.r, gc: _col.g, b: _col.b,
        a: o.a ?? 1, glow: o.glow ?? 0.5, t: 0, life: rnd(lf[0], lf[1]), fin: o.fin ?? 0.03, fo: o.fo ?? 0.55 })) break;
    }
  }
  update(dt) { super.update(dt); this.clock = (this.clock || 0) + dt; if (this.ps) for (const k in this.ps) this.ps[k].update(dt); }
  clear() { super.clear(); if (this.ps) for (const k in this.ps) this.ps[k].clear(); }
  /** 그림에만 있는 순간의 소리(같은 소리 ENFX.sfxGap 안 겹침 막음) */
  snd(name, gap = ENFX.sfxGap, o) { const t = this.clock || 0; if (this._sndT && t - (this._sndT[name] ?? -9) < gap) return; if (this._sndT) this._sndT[name] = t; try { const G = window.G; if (G && G.audio) G.audio.sfx(name, o); } catch (er) { /* no audio */ } }
  /** 타격감 문구(ui.impactText, 게임 좌표) — 강한 순간에만 */
  shout(pg, text, col = '#ffe7a0', edge = '#5a3a10', size = 1.4) { try { const G = window.G; if (G && G.ui && G.ui.impactText && pg) G.ui.impactText({ x: pg.x, y: pg.y || 0, z: pg.z }, text, { col, edge, size, top: 1.2 }); } catch (er) { /* no ui */ } }

  _mat(kind) {
    const U = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v }])), Cc = () => new THREE.Color(1, 1, 1);
    if (kind === 'enflat') return new THREE.ShaderMaterial({ uniforms: U({ uW: Cc(), uB: Cc(), uA: 0, uK: 0, uP: 0, uT: 0 }), vertexShader: FLAT_VS, fragmentShader: EN_FS, ...ADD });
    if (kind === 'esig') return new THREE.ShaderMaterial({ uniforms: U({ uW: Cc(), uB: Cc(), uG: Cc(), uA: 0, uP: 0, uT: 0, uV: 0, uAdd: 0 }), vertexShader: FLAT_VS, fragmentShader: ESIG_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    if (kind === 'esigA') return new THREE.ShaderMaterial({ uniforms: U({ uW: Cc(), uB: Cc(), uG: Cc(), uA: 0, uP: 0, uT: 0, uV: 0, uAdd: 1 }), vertexShader: FLAT_VS, fragmentShader: ESIG_FS, ...ADD });
    if (kind === 'epillar') return new THREE.ShaderMaterial({ uniforms: U({ uW: Cc(), uB: Cc(), uA: 0, uT: 0 }), vertexShader: FLAT_VS, fragmentShader: PILLAR_FS, ...ADD });
    if (kind === 'ehelix') return new THREE.ShaderMaterial({ uniforms: U({ uW: Cc(), uB: Cc(), uA: 0, uP: 0 }), vertexShader: FLAT_VS, fragmentShader: HELIX_FS, ...ADD });
    return super._mat(kind);
  }
  _h(e, o = {}) { e.dispose = () => this._free(e); return Object.assign(e, o); }
  /** 부품 하나: o.tri 가 있고 Tripo 덩어리가 받아졌으면 그것(텍스처), 아니면 절차 메시 */
  part(e, name, parent, o = {}) {
    const t = o.tri && this.tw && this.tw[o.tri]; let m;
    if (t) { m = this._m(e, 'tex', t.geo, o.order ?? 1); const u = m.material.uniforms; u.uMap.value = t.map; u.uRim.value.setHex(o.rim ?? 0xd8ecff); u.uA.value = 1; u.uGlow.value = 0; u.uGain.value = o.gain ?? 1.05; m.userData.tex = true; }
    else { m = this.solid(e, this.geo[name], { tint: o.tint ?? ENFX.tint, rim: o.rim ?? 0xd8ecff, spec: o.spec ?? 0.7 }); m.renderOrder = o.order ?? 1; m.userData.tex = false; }
    if (parent && parent !== e.g) parent.add(m);
    if (o.p) m.position.set(...o.p); if (o.s != null) (Array.isArray(o.s) ? m.scale.set(...o.s) : m.scale.setScalar(o.s));
    if (t && o.yaw) m.rotation.y = o.yaw * Math.PI / 180;
    return m;
  }
  /** Tripo 덩어리가 있는지(그 이름) */
  hasT(n) { return !!(this.tw && this.tw[n]); }
  /** quad (spr) stretched from A to B (three coords), facing the camera, width w (same as js/wpharmfx.js seg) */
  seg(m, A, B, w) {
    _a.subVectors(B, A); const L = _a.length() || 1e-4; _a.multiplyScalar(1 / L);
    _b.crossVectors(_a, this.toCam); if (_b.lengthSq() < 1e-8) _b.set(0, 0, 1); _b.normalize(); _c.crossVectors(_a, _b);
    _m4.makeBasis(_a, _b, _c); m.quaternion.setFromRotationMatrix(_m4); m.position.addVectors(A, B).multiplyScalar(0.5); m.scale.set(L, w, 1);
  }
  pivot(parent, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }
  glowM(m, col, k) { const u = m.material.uniforms; if (u.uTint) u.uTint.value.setHex(col); else if (u.uRim) u.uRim.value.setHex(col); u.uGlow.value = k; }
  flat(e, k, w, b, order = 2) { const m = this._m(e, 'enflat', this.quad, order), u = m.material.uniforms; u.uK.value = k; u.uP.value = 0; u.uT.value = 0; u.uW.value.setHex(w); u.uB.value.setHex(b); u.uA.value = 0; return m; }
  flash(at, w, b, size, life = 0.08, a = 1.2, k = 3) {
    const e = this._fx('enflash', life, (e) => { const t = e.t / life; f.quaternion.copy(this.camQ); f.scale.setScalar(size * (0.6 + 0.6 * easeOut(t))); f.material.uniforms.uA.value = ENFX.intensity * a * (1 - smooth(0.2, 1, t)); });
    e.g.position.copy(at); const f = this.spr(e, k, w, b, 7); return e;
  }
  ring(at, r, w, b, life = 0.3, a = 1.2, grow = true) {
    const e = this._fx('enring', life, (e) => { const t = e.t / life, s = r * 2 * (grow ? 0.3 + 0.7 * easeOut(t) : 1); m.scale.set(s, s, 1); m.material.uniforms.uA.value = ENFX.intensity * a * (1 - smooth(0.35, 1, t)); });
    e.g.position.copy(at); e.g.position.y += 0.06; const m = this.spr(e, 1, w, b, 3); m.rotation.set(-Math.PI / 2, 0, 0); return e;
  }
  /** 세운 고리(카메라를 보는 얇은 고리)가 퍼짐 — 명중 순간 */
  vring(at, size, w, b, life = 0.26, a = 1.0) {
    const e = this._fx('envring', life, (e) => { const k = e.t / life; m.quaternion.copy(this.camQ); m.scale.setScalar(size * (0.3 + 0.9 * easeOut(k))); m.material.uniforms.uA.value = ENFX.intensity * a * (1 - smooth(0.35, 1, k)); });
    e.g.position.copy(at); const m = this.spr(e, 1, w, b, 6); return e;
  }
  /** 설계 마법진: 바닥 판(일반 블렌딩) + 같은 무늬의 가산 빛 층. r = 반지름(판정 반경 이하). o: pal(PAL 키 또는 [선, 몸, 금테]), v 무늬, life, draw, hold, out,
   *  follow() -> three 좌표, spin, a, glowA, y. handle {end(), setA(k)} — end() = 지금부터 out 초에 사라짐 */
  sigil(at, r, o = {}) {
    const cs = Array.isArray(o.pal) ? o.pal : PAL[o.pal || 'teal'], life = o.life ?? 1.0, dr = o.draw ?? 0.18, out = o.out ?? 0.4; let endT = -1, k2 = 1;
    const e = this._fx('sigil', o.hold ? 1e9 : life, (e, dt) => {
      if (endT >= 0) { endT += dt; if (endT >= out) { e.t = e.life; return; } }
      if (o.follow) { const p = o.follow(); if (p) e.g.position.set(p.x, p.y + (o.y ?? 0.05), p.z); }
      const t = e.t, fade = endT >= 0 ? 1 - endT / out : (o.hold ? 1 : 1 - smooth(life - out, life, t)), pop = 1 + 0.1 * (1 - easeOut(smooth(0, dr + 0.1, t)));
      for (const m of [base, glow]) { const u = m.material.uniforms; u.uP.value = easeOut(smooth(0, dr, t)); u.uT.value = t * (o.spin ?? 1); m.scale.set(r * 2 * pop, r * 2 * pop, 1); }
      base.material.uniforms.uA.value = (o.a ?? 0.85) * fade * k2; glow.material.uniforms.uA.value = (o.glowA ?? 0.6) * fade * k2 * (1 + 0.5 * (1 - smooth(dr, dr + 0.35, t)));
    });
    const p0 = (o.follow && o.follow()) || at || _d.set(0, 0, 0); e.g.position.set(p0.x, p0.y + (o.y ?? 0.05), p0.z);
    const mk = (kind, order) => { const m = this._m(e, kind, this.quad, order), u = m.material.uniforms; u.uW.value.setHex(cs[0]); u.uB.value.setHex(cs[1]); u.uG.value.setHex(cs[2]); u.uV.value = o.v ?? 0; u.uA.value = 0; u.uP.value = 0; m.rotation.set(-Math.PI / 2, 0, o.rot ?? 0); return m; };
    const base = mk('esig', 1), glow = mk('esigA', 2);
    return this._h(e, { end: () => { if (endT < 0) endT = 0; }, setA: (k) => { k2 = k; }, dispose: () => { if (endT < 0) endT = 0; } });
  }
  /** 빛기둥: 바닥 at 에서 위로, 반지름 r, 높이 h — 빠르게 솟았다가 가늘어지며 사라짐 */
  pillar(at, r, h, o = {}) {
    if (!this.geo.en_fx_pillar) return null; const life = o.life ?? 0.5, cs = Array.isArray(o.pal) ? o.pal : PAL[o.pal || 'teal'];
    const e = this._fx('pillar', life, (e) => { const k = e.t / life, rise = easeOut(smooth(0, 0.25, k)); m.scale.set(r * (1 - 0.55 * smooth(0.3, 1, k)), h * (0.25 + 0.75 * rise), r * (1 - 0.55 * smooth(0.3, 1, k)));
      m.material.uniforms.uA.value = (o.a ?? 0.9) * ENFX.intensity * smooth(0, 0.08, k) * (1 - smooth(0.45, 1, k)); m.material.uniforms.uT.value = e.t; });
    e.g.position.copy(at); const m = this._m(e, 'epillar', this.geo.en_fx_pillar, 5); m.material.uniforms.uW.value.setHex(cs[0]); m.material.uniforms.uB.value.setHex(cs[1]); return e;
  }
  /** 나선 띠: follow() (three, 발밑) 둘레로 아래에서 위로 감아 오름 */
  helix(follow, r, h, o = {}) {
    if (!this.geo.en_fx_helix) return null; const life = o.life ?? 0.9, cs = Array.isArray(o.pal) ? o.pal : PAL[o.pal || 'teal'];
    const e = this._fx('helix', life, (e) => { const p = follow(); if (p) e.g.position.copy(p); const k = e.t / life; m.material.uniforms.uP.value = easeOut(k) * 1.5; m.rotation.y = e.t * (o.spin ?? 2.5);
      m.material.uniforms.uA.value = (o.a ?? 1) * ENFX.intensity * (1 - smooth(0.7, 1, k)); });
    const m = this._m(e, 'ehelix', this.geo.en_fx_helix, 5); m.scale.set(r, h, r); m.material.uniforms.uW.value.setHex(cs[0]); m.material.uniforms.uB.value.setHex(cs[1]); const p = follow(); if (p) e.g.position.copy(p); return e;
  }
  /** 명중 '팡': 섬광 + 세운 고리 + 반짝이 + 통통한 별 + 너트·톱니(size = 크기 배율, pal) */
  bang(at, pal, size = 1, o = {}) {
    const cs = Array.isArray(pal) ? pal : PAL[pal || 'gold'];
    this.flash(at, 0xffffff, cs[0], 0.85 * size, 0.1 + 0.03 * size, 1.15);
    this.vring(at, 1.0 * size, 0xffffff, cs[1], 0.24 + 0.04 * size, 0.9);
    this.emit('glint', at, Math.round(5 * size), { col: [cs[0], cs[2]], speed: [1.2, 2.6 * size], up: [0.4, 2.0], size: [0.14, 0.28], life: [0.3, 0.5], g: 2, drag: 3 });
    if (o.stars !== 0) this.emit('star', at, Math.round((o.stars ?? 2) * size), { col: [cs[2], cs[0]], speed: [1.4, 3.0], up: [1.5, 3.0], size: [0.05, 0.08], life: [0.45, 0.7], g: 8, glow: 0.7, ground: o.ground ?? at.y - 1.4, spin: 10 });
    if (o.bolts) { this.emit('nut', at, o.bolts, { col: [C.steel, C.brass], speed: [1.4, 3.2], up: [1.6, 3.2], size: [0.035, 0.055], life: [0.6, 0.85], g: 11, glow: 0.05, ground: o.ground ?? at.y - 1.4, bounce: 0.35, spin: 14, fo: 0.75 });
      this.emit('gear', at, Math.max(1, o.bolts >> 1), { col: [C.brass, C.copper], speed: [1.2, 2.8], up: [1.8, 3.4], size: [0.05, 0.08], life: [0.6, 0.85], g: 11, glow: 0.08, ground: o.ground ?? at.y - 1.4, bounce: 0.3, spin: 12, fo: 0.75 }); }
  }
  /** 연기·증기(인스턴스, 일반 블렌딩) */
  puffs(at, n, r, o = {}) { this.emit('mist', at.clone ? at.clone().setY(at.y + 0.1) : at, n, { col: [o.c1 ?? C.steam, o.c2 ?? C.steamB], spread: r * 0.4, speed: [0.3 * r + 0.2, 0.8 * r + 0.3], up: [0.2, (o.rise ?? 0.6) + 0.2], size: [0.32, 0.55].map(x => x * Math.max(0.7, r)), end: 1.8, life: [(o.life ?? 0.55) * 0.8, (o.life ?? 0.55) * 1.2], g: 0, drag: 2.2, a: o.a ?? 0.45, fin: 0.08, fo: 0.4 }); }
  /** 불티(빛나는 작은 구, 인스턴스) */
  sparks(at, n, o = {}) { this.emit('spark', at, n, { col: o.tint ?? [C.spark, C.gold], size: o.size || [0.014, 0.028], speed: o.speed || [1.5, 3.4], up: o.up || [1.2, 2.6], ground: o.ground ?? at.y - 1, life: [o.life || 0.35, (o.life || 0.35) * 1.4], g: 9, glow: 1.4, bounce: 0.4, spin: 0, sy: o.sy, fo: 0.5 }); }
  casing(at, yaw) { if (lite() ? ENFX.casingsLite <= 0 : ENFX.casings <= 0) return; const side = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw)); this.emit('casing', at.clone().addScaledVector(side, 0.12), 1, { col: C.brass, cone: side, jit: 0.3, speed: [0.8, 1.4], up: [1.4, 2.0], size: [1.0, 1.15], end: 1, ground: at.y - 0.9, life: [0.5, 0.6], g: 10, glow: 0.1, spin: 14, bounce: 0.3, keep: true }); }
  /** ground line quad from A to B (three coords), width w, lying flat */
  groundLine(m, A, B, w) { _a.subVectors(B, A); const L = Math.hypot(_a.x, _a.z) || 1e-4; m.position.set((A.x + B.x) / 2, Math.max(A.y, B.y) + 0.05, (A.z + B.z) / 2); m.rotation.set(-Math.PI / 2, 0, Math.atan2(-_a.z, _a.x)); m.scale.set(L, w, 1); }
  /** heat colour of the machines' core: 1 = redline (orange), -1 = cooling (grey-blue), 0 = normal teal */
  heatCol(kit) { const h = kit && kit.heat ? kit.heat() : 0; return h > 0 ? C.orange : h < 0 ? 0x8aa0c0 : C.teal; }
  /** device thrown along an arc from the hand to the ground point: returns the current position (three) */
  arc(from, to, k, h = 1.1) { return _b.copy(from).lerp(to, k).setY(from.y + (to.y - from.y) * k + Math.sin(k * Math.PI) * h); }
  /** 꼬리 리본: 매 프레임 머리 점을 넣음(hist) — CookFx _ribbon */
  trail(rib, hist, p, n, w, a) { hist.unshift(p.clone()); if (hist.length > n) hist.length = n; this._ribbonSet(rib, hist, w); rib.material.uniforms.uA.value = a; }

  // ------------------------------------------------------------------ A1 전개식 센트리 (s.en: fly → deploy → on; yaw/pitch/recoil from the rules)
  // fx2: 날아가는 동안 착지점에 톱니 설계 마법진이 그려짐 + 공구함 꼬리 반짝이 → 착지 '철컥' 먼지·너트 → 전개 끝 청록 빛기둥·고리 →
  //      사격 = 큰 총구 섬광 + 불티 + 탄피 / 집중 사격 = 주황 조준경 마법진 / 끝 = 연기·톱니. 머리는 Tripo(있으면).
  sentry(s, o) {
    if (!this._ok()) return null; const kit = o.kit, K = { fly: 0.36, deploy: 0.55 }, SC = ENFX.sentryScale, TS = this.hasT('tripo_sentry');
    let endT = -1, lastPh = '', lit = false, gT = 0; const from = s.en.from ? P3(s.en.from) : P3(s.pos).setY(1.2), re = this._fx('entrail', K.fly + 0.5, () => { }), rib = this._ribbon(re, 8), hist = [];
    const land = P3(s.pos), sig = this.sigil(land, 0.95, { pal: 'teal', v: 0, life: K.fly + K.deploy + 0.7, draw: K.fly, out: 0.45, spin: 1.6 });
    const e = this._fx('sentry', 1e9, (e, dt) => {
      const en = s.en, at = P3(s.pos);
      if (endT >= 0) { endT += dt; const k = clamp01(endT / 0.4); e.g.scale.setScalar(SC * (1 - 0.6 * k)); for (const m of e.items) if (m.material.uniforms.uA) m.material.uniforms.uA.value = 1 - k; if (k >= 1) e.t = e.life; return; }
      if (en.phase !== lastPh) {
        if (lastPh === 'fly') { this.puffs(at, 3, 0.6, { c1: 0xe8e0d0, c2: 0xa89880, a: 0.35, rise: 0.3 }); this.bang(at.clone().setY(at.y + 0.25), 'teal', 0.55, { stars: 0, bolts: 3, ground: at.y }); this.snd('en_deploy'); }
        lastPh = en.phase; }
      if (en.phase === 'fly') { e.g.scale.setScalar(1.15); e.g.position.copy(this.arc(from, at, en.t / K.fly)); base.rotation.set(en.t * 9, en.t * 5, 0); legs.forEach(l => l.rotation.x = 0); head.position.y = 0.1; head.scale.setScalar(0.01); barP.rotation.x = 0; post.scale.z = 0.01;
        this.trail(rib, hist, e.g.position, 8, 0.07, 0.9); gT -= dt; if (gT <= 0) { gT = 0.04; this.emit('glint', e.g.position, 1, { col: [C.teal, C.gold], speed: [0.1, 0.4], up: [-0.3, 0.2], size: [0.12, 0.2], life: [0.2, 0.35], g: 0 }); } return; }
      if (!re.dead) rib.material.uniforms.uA.value = Math.max(0, rib.material.uniforms.uA.value - dt * 5);
      e.g.position.copy(at); e.g.scale.setScalar(SC); base.rotation.set(0, 0, 0);
      const d = en.phase === 'deploy' ? en.t / K.deploy : 1, kl = easeOut(d / 0.55), kh = easeOut((d - 0.25) / 0.5), kb = easeOut((d - 0.55) / 0.45);
      if (d >= 1 && !lit) { lit = true; this.pillar(at, 0.36, 1.6, { pal: 'teal', life: 0.45, a: 0.55 }); this.ring(at, 0.9, C.mint, C.tealB, 0.35, 1.1); this.emit('glint', at.clone().setY(at.y + 0.9), 6, { col: [C.teal, C.gold, C.white], speed: [0.6, 1.6], up: [0.4, 1.4], size: [0.14, 0.24], life: [0.3, 0.5], g: 1 }); }
      legs.forEach(l => l.rotation.x = -0.65 * kl);                           // 지지대 세 개가 펼쳐짐
      base.scale.set(1 - 0.25 * kl, 1 - 0.62 * kl, 1 - 0.25 * kl);              // fx2: 공구함이 납작한 받침으로 접혀 들어가 지지대가 보임
      head.position.y = 0.3 + 0.28 * kh; head.scale.setScalar(Math.max(0.01, kh));
      post.scale.z = Math.max(0.01, (head.position.y - 0.08) / 0.3);
      head.rotation.y = yawRot(en.yaw);
      barP.rotation.x = d < 1 ? -1.4 * (1 - kb) : -en.pitch;                 // 포신: 접혀 있다가 들어 올려져 조준
      bar.position.z = -0.09 * (en.recoil || 0);                              // 반동
      const h = kit.heat(), mod = kit.moduleOf();
      fins.forEach((f, i) => f.rotation.z = (i ? -1 : 1) * (h > 0 ? 0.9 : 0.15) );   // 레드라인: 냉각판 열림
      drum.visible = mod === 'speed'; if (drum.visible) drum.rotation.x += dt * (6 + 30 * (en.recoil || 0));
      muz.visible = mod === 'power';
      this.glowM(lens, this.heatCol(kit), 0.5 + 0.6 * kb + (h > 0 ? 0.3 * Math.sin(e.t * 18) : 0)); lens.visible = d > 0.7;
      const hu = hm.material.uniforms; if (hu.uTint) hu.uTint.value.setHex(h > 0 ? 0xd8a088 : h < 0 ? 0x8898b8 : ENFX.tint); else hu.uRim.value.setHex(h > 0 ? 0xffa060 : h < 0 ? 0x8898c8 : 0xd8ecff);
      hu.uGlow.value = h > 0 ? 0.08 + 0.06 * Math.sin(e.t * 9) : 0;   // 과부하: 몸체가 달아오름 / 냉각: 푸르게
      warn.visible = h > 0; if (warn.visible) { warn.quaternion.copy(this.camQ); warn.material.uniforms.uA.value = 0.9 * (0.5 + 0.5 * Math.sin(e.t * 14)); }
      halo.quaternion.copy(this.camQ); halo.material.uniforms.uA.value = (0.25 + 0.12 * Math.sin(e.t * 4)) * kb; halo.material.uniforms.uW.value.setHex(this.heatCol(kit));
    });
    rib.material.uniforms.uW.value.setHex(C.mint); rib.material.uniforms.uB.value.setHex(C.tealB);
    const base = this.part(e, 'en_case', e.g), legs = [0, 1, 2].map(i => { const p = this.pivot(e.g, 0, 0.12, 0); p.rotation.y = i * 2.094; const q = this.pivot(p); this.part(e, 'en_leg', q, { s: [1.7, 1, 1.7] }); return q; });
    const post = this.part(e, 'en_piston', e.g, { p: [0, 0.08, 0], s: [1.5, 1.5, 0.01] }); post.rotation.x = -Math.PI / 2;   // fx2: 받침 → 머리 기둥(전개 때 늘어남)
    const head = this.pivot(e.g, 0, 0.3, 0), hm = this.part(e, 'en_head', head, { tri: 'tripo_sentry', yaw: ENFX.tripo.sentry.yaw, s: TS ? ENFX.tripo.sentry.s : undefined });
    let bh = 0.16, bz = 0.08; if (TS) { const bb = this.tw.tripo_sentry.geo.boundingBox; bh = (bb.max.y - bb.min.y) * 0.42; bz = bb.max.z * 0.55; }
    const barP = this.pivot(head, 0, bh, bz), bar = this.pivot(barP), barM = this.part(e, 'en_barrel', bar); void barM;
    const drum = this.part(e, 'en_drum', bar, { p: [0, 0.1, 0.12] }), muz = this.part(e, 'en_muzzle', bar, { p: [0, 0, 0.62] });
    const fins = [-1, 1].map(sx => { const p = this.pivot(head, sx * (TS ? 0.24 : 0.18), TS ? bh * 1.6 : 0.26, -0.1); this.part(e, 'en_fin', p, { s: TS ? 0.75 : 1.15 }); return p; });
    const lens = this.part(e, 'en_lens', head, { p: [0, TS ? bh * 1.9 : 0.16, TS ? 0.06 : 0.17], s: TS ? 0.035 : 0.045 });
    const warn = this.spr(e, 0, 0xffffff, C.red, 6); head.add(warn); warn.position.set(0, TS ? bh * 2.5 : 0.36, -0.12); warn.scale.setScalar(0.26);
    const halo = this.spr(e, 0, C.teal, C.tealB, 4); head.add(halo); halo.position.set(0, bh, 0); halo.scale.setScalar(0.6);   // 머리 둘레 옅은 동력 빛
    const self = this;
    return this._h(e, {
      fire(o2 = {}) { if (e.dead) return; bar.updateMatrixWorld(true); const tip = new THREE.Vector3(0, 0, 0.66).applyMatrix4(bar.matrixWorld);
        self.flash(tip, 0xffffff, o2.burst ? C.orange : C.gold, o2.burst ? 0.55 : 0.42, 0.07, 1.25); self.casing(tip.clone().setY(tip.y - 0.05), -(s.en.yaw));
        _a.set(Math.sin(s.en.yaw), 0, -Math.cos(s.en.yaw)); self.sparks(tip, o2.burst ? 4 : 2, { tint: o2.burst ? [C.orange, C.gold] : [C.gold, C.spark], speed: [1.5, 3], up: [0.2, 1.0], ground: tip.y - 1.2, life: 0.22 });
        if (o2.burst) self.emit('glint', tip, 2, { col: [C.orange, C.gold], speed: [0.4, 1.0], up: [0, 0.6], size: [0.18, 0.3], life: [0.15, 0.25], g: 0 }); },
      focus(t) { if (e.dead) return; head.updateMatrixWorld(true); const p = new THREE.Vector3(0, 0.3, 0).applyMatrix4(head.matrixWorld); self.ring(p, 0.35, C.orange, C.red, 0.25, 1.0);
        if (t && t.pos) self.sigil(P3(t.pos), Math.min(1.0, (t.radius || 0.5) + 0.35), { pal: 'orange', v: 1, life: 0.7, draw: 0.12, out: 0.3, spin: 3, a: 0.7, glowA: 0.7 }); },
      end(why) { if (endT < 0) endT = 0; sig.end(); if (why !== 'clear') { const q = P3(s.pos); self.puffs(q.clone().setY(q.y + 0.3), 3, 0.5); self.emit('gear', q.clone().setY(q.y + 0.4), 3, { col: [C.brass, C.steel], speed: [1, 2], up: [1.5, 2.6], size: [0.05, 0.08], life: [0.5, 0.7], g: 10, glow: 0.1, ground: q.y, bounce: 0.3, spin: 12 }); } },
    });
  }

  // ------------------------------------------------------------------ A2 스파이더 마인
  // fx2: 착지점 붉은 회로 마법진 → 다리 전개 '철컥' → 추적 중 발밑 붉은 조준경(따라감)·다리 끝 불티 → 도약 꼬리 → 폭발(blast mine: 주황 빛기둥·고리·파편·연기·'펑!')
  spider(s) {
    if (!this._ok()) return null; const K = { fly: 0.32, unfold: 0.4 }; let endT = -1, last = { ...s.pos }, gait = 0, yaw = Math.atan2(s.en.yaw ? Math.sin(s.en.yaw) : 0, 1), lastPh = '', aim = null, sT = 0;
    const from = s.en.from ? P3(s.en.from) : P3(s.pos).setY(1.2), SC = ENFX.spiderScale;
    const sig = this.sigil(P3(s.pos), 0.75, { pal: 'red', v: 2, life: K.fly + K.unfold + 0.6, draw: K.fly, out: 0.4, spin: 2, a: 0.75 });
    const re = this._fx('entrail', 30, () => { }), rib = this._ribbon(re, 8), hist = []; rib.material.uniforms.uW.value.setHex(C.orange); rib.material.uniforms.uB.value.setHex(C.redB);
    const e = this._fx('spider', 1e9, (e, dt) => {
      const en = s.en, at = P3(s.pos);
      if (endT >= 0) { endT += dt; const k = clamp01(endT / 0.3); for (const m of e.items) if (m.material.uniforms.uA) m.material.uniforms.uA.value = 1 - k; rib.material.uniforms.uA.value *= 0.8; if (k >= 1) { e.t = e.life; re.t = re.life; } return; }
      if (en.phase !== lastPh) {
        if (lastPh === 'fly') { this.puffs(at, 2, 0.4, { c1: 0xe8e0d0, c2: 0xa89880, a: 0.3, rise: 0.25 }); this.emit('nut', at.clone().setY(at.y + 0.2), 2, { col: [C.steel, C.brass], speed: [0.8, 1.6], up: [1.2, 2], size: [0.03, 0.045], life: [0.5, 0.7], g: 10, ground: at.y, bounce: 0.35, spin: 12, glow: 0.05 }); this.snd('en_deploy'); }
        if (en.phase === 'chase' && !aim) aim = this.sigil(null, 0.55, { pal: 'red', v: 1, hold: true, follow: () => P3(s.pos), draw: 0.12, out: 0.2, spin: 4, a: 0.7, glowA: 0.8 });
        if (en.phase !== 'chase' && en.phase !== 'leap' && aim) { aim.end(); aim = null; }
        lastPh = en.phase; }
      const mv = Math.hypot(s.pos.x - last.x, s.pos.z - last.z); if (mv > 1e-4) { yaw = Math.atan2(s.pos.x - last.x, s.pos.z - last.z); gait += mv * 9; } last = { ...s.pos };
      if (en.phase === 'fly') { e.g.scale.setScalar(SC * 0.9); e.g.position.copy(this.arc(from, at, en.t / K.fly, 0.9)); body.rotation.set(en.t * 12, 0, 0); legs.forEach(l => l.rotation.z = 1.3); this.trail(rib, hist, e.g.position, 8, 0.06, 0.8); return; }
      e.g.position.copy(at); e.g.scale.setScalar(SC); body.rotation.set(0, yawRot(yaw), 0);
      const ku = en.phase === 'unfold' ? easeOut(en.t / K.unfold) : 1;
      let lift = 0.16 * ku, bob = 0;
      if (en.phase === 'chase') { bob = Math.abs(Math.sin(gait)) * 0.04; sT -= dt; if (sT <= 0 && mv > 1e-3) { sT = 0.09; this.sparks(at.clone().setY(at.y + 0.05), 1, { tint: [C.orange, C.spark], speed: [0.4, 1], up: [0.4, 0.9], ground: at.y, life: 0.2 }); } }
      if (en.phase === 'leap') { const k = clamp01(en.t / 0.24); lift += Math.sin(k * Math.PI) * 0.7; _c.copy(at).setY(at.y + lift + 0.2); this.trail(rib, hist, _c, 8, 0.08, 1.0); }
      else rib.material.uniforms.uA.value = Math.max(0, rib.material.uniforms.uA.value - dt * 5);
      body.position.y = lift + bob;
      legs.forEach((l, i) => { const ph = gait + (i % 2) * Math.PI; l.rotation.z = 1.3 * (1 - ku) + (en.phase === 'chase' ? 0.35 * Math.sin(ph) : 0) + (en.phase === 'leap' ? 0.8 : 0); });
      const alarm = en.phase === 'chase' || en.phase === 'leap';
      this.glowM(lamp, alarm ? C.red : 0x5a2a20, alarm ? (Math.sin(e.t * 22) > 0 ? 1.4 : 0.2) : 0.15 + 0.1 * Math.sin(e.t * 3));
      halo.visible = alarm && Math.sin(e.t * 22) > 0; if (halo.visible) { halo.quaternion.copy(this.camQ); halo.material.uniforms.uA.value = 0.9; }
    });
    const body = this.pivot(e.g); this.part(e, 'en_spider', body);
    const legs = [0.6, 2.54, 3.74, 5.68].map(a => { const p = this.pivot(body, Math.sin(a) * 0.26, 0.1, Math.cos(a) * 0.26); p.rotation.y = a - Math.PI / 2; const q = this.pivot(p); this.part(e, 'en_sleg', q); return q; });
    const lamp = this.part(e, 'en_lens', body, { p: [0, 0.22, 0], s: 0.06 });
    const halo = this.spr(e, 0, 0xffffff, C.red, 6); body.add(halo); halo.position.set(0, 0.3, 0); halo.scale.setScalar(0.4);
    const self = this;
    return this._h(e, { alert() { self.emit('glint', P3(s.pos).setY((s.pos.y || 0) + 0.5), 3, { col: [C.red, C.orange], speed: [0.3, 0.8], up: [0.5, 1.2], size: [0.14, 0.22], life: [0.25, 0.4], g: 0 }); },
      leap() { }, end(why) { if (endT < 0) endT = why === 'spent' ? 0.29 : 0; sig.end(); if (aim) { aim.end(); aim = null; } } });
  }

  // ------------------------------------------------------------------ A3 트라이윙 드론 (s.en.h = 높이, eject = 등 뒤에서 솟아 날개를 폄)
  // fx2: 사출 = 등 뒤 섬광·청록 꼬리 리본·반짝이 → 날개 펼침 / 정렬 = 세 드론을 잇는 금빛 삼각 선 + 고리 / 일제 사격 = 큰 금빛 섬광. 몸통은 Tripo(있으면).
  drone(s, o) {
    if (!this._ok()) return null; const kit = o.kit, TD = this.hasT('tripo_drone'); let endT = -1, lastPh = '', jT = 0;
    const re = this._fx('entrail', 1e9, () => { }), rib = this._ribbon(re, 10), hist = []; rib.material.uniforms.uW.value.setHex(C.mint); rib.material.uniforms.uB.value.setHex(C.blueB);
    const e = this._fx('drone', 1e9, (e, dt) => {
      const en = s.en, at = P3(s.pos).setY((s.pos.y || 0) + en.h);
      if (endT >= 0) { endT += dt; const k = clamp01(endT / 0.4); e.g.position.y += dt * 1.2; for (const m of e.items) if (m.material.uniforms.uA) m.material.uniforms.uA.value = 1 - k; rib.material.uniforms.uA.value *= 0.85; if (k >= 1) { e.t = e.life; re.t = re.life; } return; }
      e.g.visible = en.phase !== 'wait'; if (!e.g.visible) return;
      if (en.phase !== lastPh) { if (en.phase === 'eject') { this.flash(at, 0xffffff, C.teal, 0.45, 0.1, 1.0); this.emit('glint', at, 4, { col: [C.teal, C.white], speed: [0.6, 1.4], up: [0.6, 1.4], size: [0.12, 0.22], life: [0.25, 0.4], g: 1 }); } lastPh = en.phase; }
      const ke = en.phase === 'eject' ? easeOut(en.t / 0.35) : 1;
      e.g.scale.setScalar(ENFX.droneScale); e.g.position.copy(at); e.g.position.y += Math.sin(e.t * 4 + en.idx) * 0.05 + (en.phase === 'eject' ? (1 - ke) * -0.3 : 0);
      e.g.rotation.set(0.12 * (en.recoil || 0), yawRot(en.yaw), 0); en.recoil = Math.max(0, (en.recoil || 0) - dt * 6);
      wings.forEach((w, i) => w.rotation.z = (i ? -1 : 1) * (1.4 * (1 - ke)) + (i ? 1 : -1) * 0.08 * Math.sin(e.t * 30));
      const al = en.aligning > 0; this.glowM(eye, al ? C.gold : this.heatCol(kit), al ? 1.2 : 0.7);
      const hot = kit.heat() > 0; jet.quaternion.copy(this.camQ); jet.material.uniforms.uA.value = 0.5 + 0.2 * Math.sin(e.t * 40); jet.material.uniforms.uW.value.setHex(hot ? C.orange : C.teal);
      // 꼬리: 사출 중엔 진하게, 날 때는 옅게(움직일 때만)
      e.g.updateMatrixWorld(true); _c.set(0, -0.02, -0.16).applyMatrix4(e.g.matrixWorld); const moving = hist.length && hist[0].distanceTo(_c) > 0.01;
      this.trail(rib, hist, _c, 10, en.phase === 'eject' ? 0.07 : 0.045, en.phase === 'eject' ? 0.9 : moving ? 0.45 : Math.max(0, rib.material.uniforms.uA.value - dt * 2));
      jT -= dt; if (jT <= 0) { jT = lite() ? 0.3 : 0.14; this.emit('glint', _c, 1, { col: hot ? [C.orange, C.gold] : [C.teal, C.mint], speed: [0.05, 0.2], up: [-0.6, -0.2], size: [0.08, 0.14], life: [0.2, 0.3], g: 0 }); }
      // 정렬: 다음 드론까지 금빛 선(셋이 삼각형)
      const nx = al && en.squad ? en.squad[(en.idx + 1) % en.squad.length] : null;
      if (nx && !nx.dead && nx.en && nx.en.phase === 'on') { this.seg(tri, at, P3(nx.pos).setY((nx.pos.y || 0) + nx.en.h), 0.06); tri.material.uniforms.uA.value = 1.0 * Math.sin(Math.PI * clamp01(1 - en.aligning / 0.3)) + 0.25; }
      else tri.material.uniforms.uA.value = 0;
    });
    const dB = this.part(e, 'en_drone', e.g, { tri: 'tripo_drone', yaw: ENFX.tripo.drone.yaw, s: TD ? ENFX.tripo.drone.s : undefined }); void dB;
    const wings = [1, -1].map(sx => { const p = this.pivot(e.g, sx * (TD ? 0.17 : 0.1), 0.02, 0); p.rotation.y = sx > 0 ? 0 : Math.PI; const q = this.pivot(p); this.part(e, 'en_wing', q); return q; });
    const eye = this.part(e, 'en_lens', e.g, { p: [0, TD ? 0.04 : 0.02, TD ? 0.24 : 0.18], s: 0.035 });
    const jet = this.spr(e, 0, C.teal, C.tealB, 5); e.g.add(jet); jet.position.set(0, -0.12, -0.12); jet.scale.setScalar(0.22);
    const tri = this.spr(re, 2, C.gold, C.goldB, 6);   // 세계 좌표 선(re 그룹 = 원점)
    const self = this;
    return this._h(e, {
      fire(o2 = {}) { if (e.dead) return; e.g.updateMatrixWorld(true); const tip = new THREE.Vector3(0, 0, 0.32).applyMatrix4(e.g.matrixWorld);
        self.flash(tip, 0xffffff, o2.salvo ? C.gold : C.teal, o2.salvo ? 0.42 : 0.24, 0.06, 1.1);
        if (o2.salvo) { self.vring(tip, 0.5, 0xffffff, C.goldB, 0.2, 0.8); self.emit('glint', tip, 3, { col: [C.gold, C.white], speed: [0.6, 1.4], up: [0, 0.8], size: [0.14, 0.24], life: [0.2, 0.32], g: 0 }); } },
      align() { if (e.dead) return; const p = e.g.position.clone().setY(e.g.position.y - 0.06); self.ring(p, 0.32, C.gold, C.goldB, 0.3, 0.9); self.emit('glint', p, 2, { col: [C.gold], speed: [0.2, 0.5], up: [0.2, 0.6], size: [0.14, 0.22], life: [0.25, 0.35], g: 0 }); },
      end() { if (endT < 0) endT = 0; },
    });
  }

  // ------------------------------------------------------------------ A4 테슬라 앵커 (전극 3개 → 코일 전개 → 전류 연결; 바닥 삼각형 = 실제 판정)
  // fx2: 전극마다 박히는 순간 청백 섬광·파편, 연결 순간 전극마다 가는 빛기둥 + 바닥 삼각형에 흐르는 회로 결(= 실제 판정 삼각형), 전류 = 밝은 심 + 넓은 겉빛 두 겹,
  //      감전 = 대상마다 작은 청백 '팡'·불티
  anchor(s, o) {
    if (!this._ok()) return null; const K = { fly: 0.3, pin: 0.1, link: 0.35 }, pts = s.en.pts.map(P3), from = s.en.from ? P3(s.en.from) : P3(s.pos).setY(1.2);
    let endT = -1, landed = 0, linked = false; const zaps = [];
    const e = this._fx('anchor', 1e9, (e, dt) => {
      const en = s.en; let a = 1;
      if (endT >= 0) { endT += dt; a = 1 - clamp01(endT / 0.35); if (a <= 0) { e.t = e.life; g.dispose(); return; } }
      const tf = en.phase === 'fly' ? en.t : K.fly + 2 * K.pin + 1, tl = en.phase === 'link' ? en.t / K.link : en.phase === 'on' ? 1 : 0;
      pyl.forEach((p, i) => { const k = clamp01((tf - i * K.pin) / K.fly); p.position.copy(k < 1 ? this.arc(from, pts[i], k, 1.0) : pts[i]); p.rotation.set(k < 1 ? (1 - k) * 4 : 0, 0, 0);
        if (k >= 1 && landed <= i && endT < 0) { landed = i + 1; this.flash(pts[i].clone().setY(pts[i].y + 0.3), 0xffffff, C.ice, 0.5, 0.08, 1.0); this.emit('shard', pts[i], 4, { col: [0x9a8a70, 0x6a5a48], speed: [0.8, 1.8], up: [1.2, 2.2], size: [0.05, 0.09], life: [0.4, 0.6], g: 10, ground: pts[i].y, glow: 0, spin: 12 }); this.sparks(pts[i].clone().setY(pts[i].y + 0.1), 3, { tint: [C.ice, C.sky], ground: pts[i].y, life: 0.25 }); }
        coils[i].forEach((c, j) => { c.position.y = 0.25 + j * 0.22 * (0.4 + 0.6 * easeOut(tl)); c.scale.setScalar(0.06 + 0.07 * easeOut(tl - j * 0.15)); });
        this.glowM(tops[i], C.ice, (tl > 0 ? 0.6 + 0.5 * Math.sin(e.t * 25 + i) : 0.1) * a); });
      // current: thin jagged lines between the pylon tops (only when linked), re-jittered every few frames
      if (!linked && tl > 0.05 && endT < 0) { linked = true; pts.forEach(q => this.pillar(q, 0.22, 1.6, { pal: 'ice', life: 0.45, a: 0.7 })); }
      const on = tl * a; for (let i = 0; i < 3; i++) { const A = pyl[i].position.clone().setY(pts[i].y + 1.0), B = pyl[(i + 1) % 3].position.clone().setY(pts[(i + 1) % 3].y + 1.0);
        segs[i].forEach((m, k) => { const t0 = k / segs[i].length, t1 = (k + 1) / segs[i].length, j0 = k === 0 ? 0 : Math.sin(e.t * 47 + i * 3 + k * 1.7) * 0.12, j1 = k === segs[i].length - 1 ? 0 : Math.sin(e.t * 47 + i * 3 + (k + 1) * 1.7) * 0.12;
          const P = A.clone().lerp(B, t0).setY(A.y + j0), Q = A.clone().lerp(B, t1).setY(A.y + j1); this.seg(m, P, Q, 0.12); m.material.uniforms.uA.value = 1.1 * on * (0.7 + 0.3 * Math.sin(e.t * 60 + k));
          const gw = glow[i][k]; this.seg(gw, P, Q, 0.42); gw.material.uniforms.uA.value = 0.32 * on * (0.75 + 0.25 * Math.sin(e.t * 33 + k * 2)); });
        this.groundLine(edges[i], pts[i], pts[(i + 1) % 3], 0.14); edges[i].material.uniforms.uA.value = 0.9 * on; edges[i].material.uniforms.uT.value = e.t; }
      fill.material.uniforms.uA.value = 0.7 * on; fill.material.uniforms.uT.value = e.t;
      for (const z of zaps) { z.t -= dt; z.m.material.uniforms.uA.value = Math.max(0, z.t / 0.12) * 1.3 * a; }
      // 리마스터(높음·보통, js/rmfx.js): 연결된 동안 삼각형(= 판정) 안 바닥을 기어가는 전류 — 한 꼭짓점 쪽에서 맞은편 변 쪽으로, 0.4초마다 새 경로
      if (on > 0.5 && endT < 0 && self.rm && gfxOn() && self.rm.ready) { e.gc = (e.gc || 0) - dt; if (e.gc <= 0) { e.gc = 0.4; const i = (rnd(0, 3) | 0) % 3, A = pts[i], B = pts[(i + 1) % 3], C2 = pts[(i + 2) % 3];
        const p0 = A.clone().lerp(c3, 0.25), p1 = B.clone().lerp(C2, rnd(0.25, 0.75)).lerp(c3, 0.25); p0.y += 0.05; p1.y += 0.05;
        self.rm.lightning(p0, p1, { col: C.sky, hi: 0xffffff, deep: C.blueB, w: 0.07, strikes: 2, gap: 0.09, branches: 2, flat: true, impact: false, jag: 0.16 }); } }
    });
    const pyl = pts.map(() => { const p = this.pivot(e.g); this.part(e, 'en_pylon', p); return p; });
    const coils = pyl.map(p => [0, 1, 2].map(() => this.part(e, 'en_coil', p, { s: 0.06 })));
    const tops = pyl.map(p => this.part(e, 'en_lens', p, { p: [0, 1.08, 0], s: 0.07 }));
    const segs = [0, 1, 2].map(() => [0, 1, 2, 3, 4].map(() => this.spr(e, 2, 0xffffff, C.iceB, 6)));
    const glow = [0, 1, 2].map(() => [0, 1, 2, 3, 4].map(() => this.spr(e, 2, C.sky, C.blueB, 5)));   // 전류 겉빛(넓고 옅게)
    for (let i = 0; i < 8; i++) zaps.push({ m: this.spr(e, 2, 0xffffff, C.iceB, 7), t: 0 }); let zi = 0;
    const edges = [0, 1, 2].map(() => this.flat(e, 2, C.ice, C.blueB, 2));
    // ground triangle fill = the real hit area (feet inside)
    const g = new THREE.BufferGeometry(), c3 = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / 3), pos = [], uv = [];
    for (let i = 0; i < 3; i++) { const A = pts[i], B = pts[(i + 1) % 3]; pos.push(c3.x, c3.y + 0.04, c3.z, A.x, A.y + 0.04, A.z, B.x, B.y + 0.04, B.z); uv.push(0, 0, 1, 0, 1, 0); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const fill = this._m(e, 'enflat', g, 2); fill.material.uniforms.uK.value = 1; fill.material.uniforms.uW.value.setHex(C.ice); fill.material.uniforms.uB.value.setHex(C.blueB);
    const self = this;
    return this._h(e, {
      zap(ps) { if (e.dead) return; for (const p of ps.slice(0, 4)) { let bi = 0, bd = 1e9; pyl.forEach((q, i) => { const d = q.position.distanceTo(P3(p)); if (d < bd) { bd = d; bi = i; } });
        const zA = pyl[bi].position.clone().setY(pts[bi].y + 1.0), zB = P3(p).setY((p.y || 0) + 0.7);
        if (self.rm && gfxOn() && self.rm.ready) { self.rm.lightning(zA, zB, { col: C.sky, hi: 0xffffff, deep: C.blueB, w: 0.09, strikes: 2, gap: 0.06, branches: 2, jag: 0.22, impact: false }); self.rm.crawl({ pos: p, radius: 0.5 }, { dur: 0.35, col: C.sky, n: 2 }); }   // 리마스터: 갈라지는 번개 + 몸의 전류
        else { const z = zaps[zi++ % zaps.length]; self.seg(z.m, zA, zB, 0.1); z.t = 0.12; }   // 미리 만든 8개를 돌려 씀
        const q = P3(p).setY((p.y || 0) + 0.7); self.flash(q, 0xffffff, C.sky, 0.45, 0.07, 1.0); self.sparks(q, 2, { tint: [C.ice, C.sky], ground: (p.y || 0), life: 0.22, speed: [1, 2.2] }); }
      },
      end() { if (endT < 0) endT = 0; },
      dispose() { g.dispose(); self._free(e); },
    });
  }
  /** 앵커 지정 대상: 발밑 얇은 청록 고리(이름표·체력 막대·경고를 가리지 않음) */
  focus(t) {
    const e = this._fx('focus', 1e9, (e) => { if (!t || t.dead || t.removed) { e.t = e.life; return; } e.g.position.copy(P3(t.pos)).setY((t.pos.y || 0) + 0.05);
      const R = (t.radius || 0.5) + 0.28; m.scale.set(R * 2, R * 2, 1); m.rotation.z = e.t * 1.5; m.material.uniforms.uA.value = 1.1 + 0.25 * Math.sin(e.t * 6); });
    const m = this.spr(e, 1, C.teal, C.tealB, 3); m.rotation.set(-Math.PI / 2, 0, 0); return this._h(e);
  }

  // ------------------------------------------------------------------ A5 아틀라스 워커 (drop → assemble → on → fold)
  // fx2: 착지점에 청색 조준경 마법진 + 하늘에서 떨어지는 코어의 빛 꼬리 → 착지 섬광·흙먼지·파편 → 부품마다 결합 불티·너트('철컥') → 기동 = 청색 빛기둥·고리 + 발밑 톱니 마법진(가동 내내) →
  //      기관포 불티·탄피 / 미사일 덮개 개방 섬광 / 주포 축전(주황 빛이 포구로 모임) → 발사 큰 섬광·세운 고리·연기 / 접기 = 톱니·너트가 흩어지고 증기. 몸통·다리는 Tripo(있으면).
  walker(s, o) {
    if (!this._ok()) return null; const kit = o.kit, K = { drop: 0.35, assemble: 1.3, fold: 0.9 }, SC = ENFX.walkerScale; let endT = -1, puffT = 0, step = 0, gunSide = 1, lastPh = '', stage = 0, chT = 0;
    const TH = this.hasT('tripo_w_hull'), TL = this.hasT('tripo_w_thigh') && this.hasT('tripo_w_shin');
    const hb = TH ? this.tw.tripo_w_hull.geo.boundingBox : null, HW = TH ? (hb.max.x - hb.min.x) / 2 : 0.65, HH = TH ? hb.max.y : 0.8, HZ = TH ? hb.max.z : 0.55;
    const land = P3(s.pos); let rune = null;
    const drop = this.sigil(land, 1.3, { pal: 'blue', v: 1, hold: true, draw: 0.3, out: 0.4, spin: 2.2, a: 0.8, glowA: 0.8 });
    const fe = this._fx('enfall', K.drop + 0.1, (x) => { const k = clamp01(x.t / K.drop), y = land.y + 6 * (1 - k * k) + 0.55 * k * k; this.seg(streak, land.clone().setY(y + 0.2), land.clone().setY(Math.min(land.y + 9, y + 2.6)), 0.18); streak.material.uniforms.uA.value = 0.9 * (1 - smooth(0.85, 1, k)); });
    const streak = this.spr(fe, 2, 0xffffff, C.blue, 6);
    const e = this._fx('walker', 1e9, (e, dt) => {
      const en = s.en, at = P3(s.pos);
      e.g.position.copy(at); e.g.rotation.y = yawRot(en.yaw); e.g.scale.setScalar(SC);
      if (endT >= 0) { endT += dt; const k = clamp01(endT / 0.45); for (const m of e.items) if (m.material.uniforms.uA) m.material.uniforms.uA.value = 1 - k; if (k >= 1) e.t = e.life; return; }
      if (en.phase !== lastPh) {
        if (en.phase === 'assemble') { this.flash(at.clone().setY(at.y + 0.6), 0xffffff, C.blue, 1.3, 0.1, 1.1); this.ring(at, 1.3, C.sky, C.blueB, 0.4, 1.1); this.puffs(at, 4, 1.0, { c1: 0xe8e0d0, c2: 0xa89880, a: 0.4, rise: 0.4 });
          this.emit('shard', at.clone().setY(at.y + 0.1), 8, { col: [0x9a8a70, 0x6a5a48, C.steel], speed: [1.5, 3], up: [1.6, 3], size: [0.06, 0.12], life: [0.5, 0.75], g: 11, ground: at.y, glow: 0, spin: 12 }); this.snd('en_assemble'); }
        if (en.phase === 'on') { drop.end(); this.pillar(at, 0.6, 3.0, { pal: 'blue', life: 0.55, a: 0.5 }); this.bang(at.clone().setY(at.y + 1.6), 'blue', 0.9, { bolts: 0, ground: at.y });
          rune = this.sigil(null, 1.1, { pal: 'blue', v: 0, hold: true, follow: () => P3(s.pos), draw: 0.25, out: 0.4, spin: 1.2, a: 0.55, glowA: 0.5 }); }
        if (en.phase === 'fold') { if (rune) { rune.end(); rune = null; } }
        lastPh = en.phase; }
      let tA = en.phase === 'drop' ? -1 : en.phase === 'assemble' ? en.t : K.assemble + 1, open = 1, hip = 1.05;
      if (en.phase === 'drop') { const k = clamp01(en.t / K.drop); core.position.y = 6 * (1 - k * k) + 0.55 * k * k; core.visible = true; }
      if (en.phase === 'fold') { const k = clamp01(en.t / K.fold); tA = K.assemble * (1 - k); }
      if (en.phase === 'assemble') for (const [th, f] of [[0.02, () => legs.map(l => W([0, -0.3, 0], l.thigh))], [0.32, () => [W([0, HH * 0.5, 0], hull)]], [0.62, () => plates.map(p => W([0, -0.3, 0.05], p))], [1.12, () => [W([0, 0.3, 0], rack), W([0, 0, 0.8], cannonP)]]])
        if (stage < 4 && tA >= th && stage === [0.02, 0.32, 0.62, 1.12].indexOf(th)) { stage++; for (const q of f()) { this.sparks(q, 3, { tint: [C.spark, C.gold, C.sky], ground: at.y, life: 0.3 }); this.emit('nut', q, 2, { col: [C.steel, C.brass], speed: [0.8, 1.6], up: [1.0, 2.0], size: [0.035, 0.05], life: [0.5, 0.7], g: 11, ground: at.y, bounce: 0.35, spin: 12, glow: 0.05 }); this.flash(q, 0xffffff, C.sky, 0.35, 0.07, 0.9); } }
      const ka = (a, b) => easeOut((tA - a) / (b - a));
      legs.forEach(l => l.thigh.scale.setScalar(Math.max(0.01, ka(0, 0.35))));
      hull.position.y = (tA < 0.75 ? 0.55 + 2.2 * (1 - ka(0.3, 0.75)) : 0.55 + 0.5 * ka(0.85, 1.15)); hull.visible = tA >= 0.3;
      hip = hull.position.y;
      plates.forEach((p) => { p.visible = !TH && tA >= 0.6;   // Tripo 몸통은 어깨 장갑이 붙어 있어 절차 장갑판은 숨김(덮개 개방 = 미사일 상자 덮개·냉각판)
         p.position.y = PY + 0.6 * (1 - ka(0.6, 0.9)); open = ka(1.1, K.assemble); p.rotation.x = -1.1 * open; });
      lid.rotation.x = -1.4 * open; core.visible = en.phase !== 'drop' ? tA < 0.75 : true; if (tA >= 0 && tA < 0.75) core.position.y = 0.55 + 0.6 * ka(0.3, 0.75);
      // legs: thigh/shin angles keep the feet on the ground as the hip rises; walking swings them
      const sw = en.walking ? Math.sin(step) * 0.35 : 0; if (en.walking) { const st0 = Math.sin(step); step += dt * 6; if (Math.sign(st0) !== Math.sign(Math.sin(step)) && !lite()) this.puffs(at, 1, 0.5, { c1: 0xe8e0d0, c2: 0xa89880, a: 0.25, rise: 0.2 }); }
      legs.forEach((l, i) => { const crouch = clamp01((1.05 - hip) / 0.5); l.thigh.position.y = hip; l.thigh.rotation.x = -0.6 * crouch + (i ? sw : -sw); l.shin.rotation.x = 1.2 * crouch - (i ? Math.max(0, sw) : Math.max(0, -sw)) * 0.6; });
      gun.rotation.z += dt * (en.recoil > 0.2 ? 30 : 2);
      cannonP.position.z = CZ - 0.25 * (en.cannon === 2 ? (en.recoil || 0) : 0);
      const ch = en.cannon === 1 ? clamp01((en.cyc - 3.6) / 0.4) : 0; this.glowM(muzzle, C.orange, ch * 1.6); muzzle.visible = ch > 0.02;
      if (ch > 0.02) { chT -= dt; if (chT <= 0) { chT = lite() ? 0.08 : 0.04; const tip = W([0, 0, 1.55], cannonP); _c.set(rnd(-1, 1), rnd(-0.6, 1), rnd(-1, 1)).normalize().multiplyScalar(0.55); this.emit('glint', tip.clone().add(_c), 1, { col: [C.orange, C.gold], cone: _c.clone().multiplyScalar(-1.6), jit: 0, speed: [1, 1], up: [0, 0], size: [0.12, 0.2], life: [0.28, 0.32], g: 0, drag: 0, fo: 0.7 }); } }
      this.glowM(eye, this.heatCol(kit), 0.6 + 0.3 * Math.sin(e.t * 5)); eye.visible = hull.visible;
      fins.forEach((f, i) => f.rotation.z = (i ? -1 : 1) * (kit.heat() > 0 ? 1.0 : 0.1));
      puffT -= dt; if ((en.phase === 'assemble' && en.t > 1.0 && en.t < 1.1) || (en.phase === 'on' && puffT <= 0 && kit.heat() < 0)) { puffT = 0.5; this.puffs(stackW(), 2, 0.4, { a: 0.5 }); }
    });
    const hull = this.pivot(e.g, 0, 1.05, 0), hm = this.part(e, 'en_w_hull', hull, { tint: 0x7f93b4, tri: 'tripo_w_hull', yaw: ENFX.tripo.hull.yaw }); void hm;
    const LX = TH ? HW * 0.6 : 0.45;
    const legs = [-1, 1].map(sx => { const thigh = this.pivot(e.g, sx * LX, 1.05, 0); this.part(e, 'en_w_thigh', thigh, { tri: TL ? 'tripo_w_thigh' : null, yaw: ENFX.tripo.thigh.yaw, s: TL ? ENFX.tripo.thigh.s : undefined }); const shin = this.pivot(thigh, 0, -0.85, 0); this.part(e, 'en_w_shin', shin, { tri: TL ? 'tripo_w_shin' : null, yaw: ENFX.tripo.shin.yaw, s: TL ? ENFX.tripo.shin.s : undefined }); return { thigh, shin }; });
    const PY = TH ? HH * 0.95 : 0.8, plates = [-1, 1].map(sx => { const p = TH ? this.pivot(hull, sx * HW * 0.78, PY, HZ * 0.5) : this.pivot(hull, sx * 0.32, 0.8, 0.58); if (TH) p.rotation.y = sx * 0.9; this.part(e, 'en_w_plate', p, { s: TH ? 0.75 : 1 }); return p; });
    const gunP = this.pivot(hull, TH ? HW + 0.08 : 0.82, TH ? HH * 0.5 : 0.5, 0.1), gun = this.pivot(gunP); this.part(e, 'en_w_gun', gun);
    const rack = this.pivot(hull, TH ? -HW * 0.42 : -0.3, TH ? HH * 0.92 : 0.84, -0.15); this.part(e, 'en_w_rack', rack); const lid = this.pivot(rack, 0, 0.3, -0.25); this.part(e, 'en_w_lid', lid);
    const CZ = TH ? HZ * 0.55 : 0.35, cannonP = this.pivot(hull, 0, TH ? HH * 0.32 : 0.45, CZ); this.part(e, 'en_w_cannon', cannonP);
    const muzzle = this.part(e, 'en_lens', cannonP, { p: [0, 0, 1.55], s: 0.12 });
    const eye = this.part(e, 'en_lens', hull, { p: [0, TH ? HH * 0.55 : 0.4, TH ? HZ + 0.02 : 0.6], s: TH ? 0.1 : 0.12 });
    const core = this.part(e, 'en_core', e.g, { s: 0.28 }); this.glowM(core, C.blue, 0.9);
    const fins = [-1, 1].map(sx => { const p = this.pivot(hull, sx * (TH ? HW * 0.8 : 0.62), TH ? HH * 0.85 : 0.84, -0.42); this.part(e, 'en_fin', p, { s: 1.4 }); return p; });
    const stackW = () => { hull.updateMatrixWorld(true); return new THREE.Vector3(TH ? -HW * 0.35 : -0.45, TH ? HH + 0.05 : 1.15, TH ? -0.25 : -0.42).applyMatrix4(hull.matrixWorld); };
    const W = (p, obj) => { obj.updateMatrixWorld(true); return new THREE.Vector3(...p).applyMatrix4(obj.matrixWorld); };
    const self = this;
    return this._h(e, {
      gun() { if (e.dead) return; gunSide = -gunSide; const tip = W([0, 0, 0.95], gun); self.flash(tip, 0xffffff, C.gold, 0.45, 0.06, 1.2); self.casing(tip.clone().setY(tip.y - 0.2), -s.en.yaw); self.sparks(tip, 2, { tint: [C.gold, C.spark], speed: [1.5, 3], up: [0.2, 0.9], ground: P3(s.pos).y, life: 0.2 }); },
      missile() { if (e.dead) return; const p = W([rnd(-0.13, 0.13), 0.35, rnd(-0.12, 0.12)], rack); self.flash(p, 0xffffff, C.orange, 0.4, 0.07, 1.0); self.puffs(p, 1, 0.2, { c1: C.smoke, c2: C.smokeB, a: 0.35 }); self.emit('glint', p, 2, { col: [C.orange, C.gold], speed: [0.3, 0.8], up: [0.6, 1.4], size: [0.14, 0.22], life: [0.2, 0.32], g: 0 }); },
      charge() { if (e.dead) return; const tip = W([0, 0, 1.55], cannonP); self.vring(tip, 0.6, C.gold, C.orangeB, 0.35, 0.8); },
      cannon() { if (e.dead) return; const tip = W([0, 0, 1.6], cannonP); self.flash(tip, 0xffffff, C.orange, 1.05, 0.1, 1.3); self.vring(tip, 1.1, 0xffffff, C.orangeB, 0.28, 1.0); self.puffs(tip, 4, 0.5, { c1: C.smoke, c2: C.smokeB });
        for (const sx of [-1, 1]) self.puffs(W([sx * 0.25, 0, 0.3], cannonP), 1, 0.3, { a: 0.5 }); self.emit('glint', tip, 4, { col: [C.orange, C.gold, C.white], speed: [1, 2.4], up: [0.2, 1.2], size: [0.16, 0.28], life: [0.2, 0.35], g: 1 }); },
      vent() { if (!e.dead) self.puffs(stackW(), 2, 0.3); },
      fold() { if (e.dead) return; const q = P3(s.pos); self.puffs(q.clone().setY(q.y + 0.6), 4, 0.9); if (rune) { rune.end(); rune = null; }
        self.emit('gear', q.clone().setY(q.y + 1.2), 5, { col: [C.brass, C.copper, C.steel], speed: [1, 2.4], up: [1.6, 3], size: [0.07, 0.12], life: [0.6, 0.9], g: 10, glow: 0.08, ground: q.y, bounce: 0.3, spin: 10 });
        self.emit('nut', q.clone().setY(q.y + 1.0), 6, { col: [C.steel, C.brass], speed: [1, 2.6], up: [1.4, 2.8], size: [0.04, 0.06], life: [0.6, 0.9], g: 11, glow: 0.05, ground: q.y, bounce: 0.35, spin: 14 }); },
      end(why) { if (endT < 0) endT = 0; drop.end(); if (rune) { rune.end(); rune = null; } if (why !== 'clear') { const q = P3(s.pos); self.puffs(q.clone().setY(q.y + 0.5), 3, 0.8); } },
    });
  }

  // ------------------------------------------------------------------ 탄·미사일·포탄·충격
  bullet(from, o = {}) {
    if (!this._ok()) return null; const col = o.col === 'teal' ? [C.ice, C.teal] : [0xffffff, C.gold];
    const e = this._fx('bullet', 2, () => { });
    const m = this.part(e, 'en_slug', e.g, { s: [0.03, 0.03, 0.13] }); this.glowM(m, col[1], 1.2); const tr = this.spr(e, 2, col[0], col[1], 6), hd = this.spr(e, 0, col[0], col[1], 6); hd.scale.setScalar(0.16);
    e.g.position.copy(P3(from)); let prev = P3(from);
    return this._h(e, { set: (p, d) => { const q = P3(p); e.g.position.copy(q); _a.set(d.x, d.y || 0, -d.z).normalize(); m.quaternion.setFromUnitVectors(_z, _a); this.seg(tr, prev, q, 0.07); tr.position.sub(e.g.position); tr.material.uniforms.uA.value = 0.9;
      hd.quaternion.copy(this.camQ); hd.material.uniforms.uA.value = 0.7; prev = prev.lerp(q, 0.45); } });
  }
  /** 탄 명중(자주 남 — 가볍게): 작은 섬광 + 세운 고리 + 불티 */
  impact(at, o = {}) { if (!this._ok()) return; const p = P3(at); if (o.ok) { const g = o.kind === 'gold'; this.flash(p, 0xffffff, g ? C.gold : C.orange, 0.38, 0.07, 1.05); this.vring(p, 0.45, 0xffffff, g ? C.goldB : C.orangeB, 0.18, 0.7); this.sparks(p, 3, { ground: p.y - 0.7, tint: [C.spark, C.gold] }); } else this.flash(p, 0xffffff, C.steamB, 0.16, 0.05, 0.5); }
  /** 폭발: 실제 반경 r 안 — 섬광·바닥 고리·세운 고리·(큰 것) 빛기둥·파편·너트·불티·연기. 지뢰 '펑!'·워커 주포 '쿠웅!'은 맞힌 적이 있을 때만 */
  blast(at, o = {}) {
    if (!this._ok()) return; const p = P3(at), r = o.r || 1, big = o.kind === 'cannon' || o.kind === 'orbital', mine = o.kind === 'mine', orb = o.kind === 'orbital', pal = orb ? 'ice' : mine ? 'orange' : 'gold';
    const c1 = orb ? C.ice : mine ? C.orange : C.gold, c2 = orb ? C.iceB : C.goldB, up = p.clone().setY(p.y + 0.45);
    this.flash(up, 0xffffff, c1, r * (big ? 1.25 : 1.05), 0.1, 1.3);
    this.ring(p, r, c1, c2, 0.32, 1.25); this.ring(p, r * 0.6, 0xffffff, c2, 0.22, 0.9);
    this.vring(up, Math.min(1.6, r * 0.9), 0xffffff, c2, 0.26, 0.9);
    if (big || mine) { this.pillar(p, Math.min(0.9, r * 0.36), 2.4, { pal, life: 0.45, a: 0.8 }); this.emit('shard', p.clone().setY(p.y + 0.1), big ? 10 : 7, { col: [0x9a8a70, 0x6a5a48, C.steel], speed: [1.5, 3.2], up: [1.8, 3.4], size: [0.06, 0.12], life: [0.55, 0.8], g: 11, ground: p.y, glow: 0, spin: 12, bounce: 0.3 }); }
    this.emit('nut', up, big ? 4 : mine ? 3 : 1, { col: [C.steel, C.brass], speed: [1.4, 3.2], up: [1.6, 3.2], size: [0.035, 0.055], life: [0.6, 0.85], g: 11, glow: 0.05, ground: p.y, bounce: 0.35, spin: 14, fo: 0.75 });
    this.puffs(p, big ? 5 : mine ? 4 : 2, r * 0.8, { c1: C.smoke, c2: C.smokeB, a: 0.4, life: 0.7, rise: 0.8 });
    this.sparks(p.clone().setY(p.y + 0.2), big ? 8 : mine ? 6 : 3, { tint: orb ? [C.ice, C.sky] : [C.orange, C.gold, C.spark], speed: [2, 4.5], up: [2, 3.6], ground: p.y });
    this.emit('glint', up, big ? 6 : 3, { col: [c1, C.white], speed: [1, 2.6], up: [0.4, 1.8], size: [0.16, 0.28], life: [0.25, 0.45], g: 2, drag: 3 });
    if (o.hit && mine) this.shout({ x: at.x, y: at.y, z: at.z }, '펑!', '#ffd08a', '#6a2a08', 1.45);
    if (o.hit && o.kind === 'cannon') this.shout({ x: at.x, y: at.y, z: at.z }, '쿠웅!', '#ffe08a', '#6a3008', 1.6);
  }
  /** 미사일: 몸통 + 꼬리 리본(주황 → 연기색) + 연기(인스턴스) + 반짝이 */
  missile(from) {
    if (!this._ok()) return null; const low = lite(); let t = 0, next = 0; const hist = [];
    const e = this._fx('missile', 4, (e, dt) => { t += dt; });
    const body = this.part(e, 'en_missile', e.g, { s: 1.1 }), fl = this.spr(e, 3, 0xffffff, C.orange, 6); fl.scale.setScalar(0.26);
    const rib = this._ribbon(e, 10); rib.material.uniforms.uW.value.setHex(C.gold); rib.material.uniforms.uB.value.setHex(0x8a8f99);
    const self = this;
    return this._h(e, {
      set(p, v) { const q = P3(p); body.position.copy(q); _a.set(v.x, v.y, -v.z).normalize(); body.quaternion.setFromUnitVectors(_z, _a); fl.position.copy(q).addScaledVector(_a, -0.24); fl.quaternion.copy(self.camQ); fl.material.uniforms.uA.value = 1.2;
        self.trail(rib, hist, fl.position, 10, 0.07, 0.8);
        if (t >= next) { next = t + (low ? 0.08 : 0.045); self.emit('mist', fl.position, 1, { col: [C.steam, C.steamB], speed: [0.05, 0.2], up: [0.05, 0.25], size: [0.12, 0.18], end: 2.4, life: [0.35, 0.5], g: 0, drag: 2, a: 0.38, fin: 0.05, fo: 0.3, keep: true });
          if (!low) self.emit('glint', fl.position, 1, { col: [C.orange, C.gold], speed: [0.05, 0.3], up: [-0.2, 0.2], size: [0.1, 0.16], life: [0.15, 0.25], g: 0 }); } },
      fizzle() { self.puffs(body.position.clone(), 1, 0.2, { c1: C.smoke, c2: C.smokeB, a: 0.3 }); },
    });
  }
  shell(from, o) {
    if (!this._ok()) return null; const A = P3(from), B = P3(o.to).setY((o.to.y || 0) + 0.3);
    const e = this._fx('shell', 3, () => { });
    const m = this.part(e, 'en_slug', e.g, { s: [0.1, 0.1, 0.34] }); this.glowM(m, C.orange, 1.2); const tr = this.spr(e, 2, 0xffffff, C.orange, 6), hd = this.spr(e, 0, C.gold, C.orangeB, 6); hd.scale.setScalar(0.5);
    return this._h(e, { set: (k) => { const p = A.clone().lerp(B, clamp01(k)); p.y += Math.sin(clamp01(k) * Math.PI) * 0.4; _a.subVectors(B, A).normalize(); m.position.copy(p); m.quaternion.setFromUnitVectors(_z, _a); this.seg(tr, A.clone().lerp(B, Math.max(0, k - 0.25)), p, 0.2); tr.material.uniforms.uA.value = 1.0;
      hd.position.copy(p); hd.quaternion.copy(this.camQ); hd.material.uniforms.uA.value = 0.8; } });
  }
  /** 파일 벙커 뒤쪽 원뿔 충격파(실제 원뿔 r·ang 그대로) */
  shock(at, o) {
    if (!this._ok()) return; const p = P3(at), f = o.f, ang = o.ang || 50, r = o.r || 2.4;
    const e = this._fx('shock', 0.32, (e) => { const k = e.t / 0.32; m.material.uniforms.uP.value = 0.1 + 0.95 * easeOut(k); m.material.uniforms.uA.value = 1.4 * (1 - smooth(0.5, 1, k)); });
    e.g.position.copy(p).setY(p.y + 0.06); const m = this._m(e, 'enflat', this.fan(ang), 3); const u = m.material.uniforms; u.uK.value = 0; u.uW.value.setHex(C.gold); u.uB.value.setHex(C.goldB);
    m.scale.setScalar(r); m.rotation.y = Math.atan2(f.z, f.x);   // fan points along local +x; game (fx, fz) -> three (fx, -fz)
    this.puffs(p, 2, r * 0.5, { a: 0.35 });
    _c.set(f.x, 0, -f.z).normalize(); this.emit('shard', p.clone().setY(p.y + 0.1), 6, { col: [0x9a8a70, 0x6a5a48], cone: _c, jit: 0.4, speed: [2, 3.6], up: [0.8, 1.8], size: [0.05, 0.1], life: [0.4, 0.6], g: 11, ground: p.y, glow: 0, spin: 12 });
    this.emit('glint', p.clone().setY(p.y + 0.3), 4, { col: [C.gold, C.white], cone: _c, jit: 0.45, speed: [2, 3.4], up: [0.2, 0.8], size: [0.14, 0.24], life: [0.2, 0.32], g: 0, drag: 3 });
  }

  // ------------------------------------------------------------------ 손·팔·어깨의 화기 (누른 순간부터; 규칙이 피해 순간을 부름)
  hand(pc) { let h = null; try { h = pc.body && pc.body.handPoint && pc.body.handPoint(); } catch (er) { h = null; } return h ? h.clone() : P3(pc.pos).setY((pc.pos.y || 0) + 1.15); }
  handL(pc) { let h = null; try { h = pc.body && pc.body.handPointL && pc.body.handPointL(); } catch (er) { h = null; } return h ? h.clone() : P3(pc.pos).setY((pc.pos.y || 0) + 1.1); }
  /** B1 파일 벙커: 오른 팔뚝 옆 장치 — 0..0.16 피스톤 압축, 0.18 잠금(구리 띠 점등), strike = 말뚝 돌출(0.05 s) → 0.14 s 뒤 되돌아감 */
  // fx2: 발밑 작은 금빛 톱니 마법진(누른 순간) + 잠금 순간 구리 띠 섬광 → 명중 = 큰 금빛 '팡'(섬광·세운 고리·별·너트·톱니) + 대상 발밑 고리·파편 + '콰앙!'
  pile(pc, o) {
    if (!this._ok()) return null; const f = o.f, rot = Math.atan2(f.x, -f.z); let stT = -1, hit = null, locked = false;
    this.sigil(null, 0.9, { pal: 'gold', v: 0, follow: () => P3(pc.pos), life: 0.75, draw: 0.16, out: 0.3, spin: 3, a: 0.75 });
    const e = this._fx('pile', 0.9, (e) => {
      e.g.position.copy(this.hand(pc)); e.g.rotation.set(0, rot, 0);
      const k0 = smooth(0, 0.16, e.t); piston.position.z = 0.32 - 0.18 * k0;
      this.glowM(lock, C.orange, e.t > 0.18 ? 0.9 : 0); const ks = stT < 0 ? 0 : e.t - stT;
      if (!locked && e.t > 0.18) { locked = true; dev.updateMatrixWorld(true); const q = new THREE.Vector3(0, 0.12, 0.22).applyMatrix4(dev.matrixWorld); this.flash(q, 0xffffff, C.orange, 0.3, 0.06, 1.0); this.sparks(q, 2, { tint: [C.orange, C.spark], ground: P3(pc.pos).y, life: 0.2 }); }
      stake.position.z = 0.1 + (stT < 0 ? 0 : 0.55 * (ks < 0.05 ? ks / 0.05 : ks < 0.2 ? 1 : Math.max(0, 1 - (ks - 0.2) / 0.15)));
      const fade = 1 - smooth(0.7, 0.9, e.t); for (const m of e.items) if (m.material.uniforms.uA) m.material.uniforms.uA.value = fade;
    });
    const dev = this.pivot(e.g, 0.06, -0.04, -0.2); this.part(e, 'en_pile', dev); const piston = this.part(e, 'en_piston', dev, { p: [0, 0, 0.32] }), stake = this.part(e, 'en_stake', dev, { p: [0, 0, 0.1] });
    const lock = this.part(e, 'en_lens', dev, { p: [0, 0.12, 0.22], s: 0.03 });
    const self = this;
    return this._h(e, { strike(p) { stT = e.t; hit = p; dev.updateMatrixWorld(true); const tip = new THREE.Vector3(0, 0, 0.9).applyMatrix4(dev.matrixWorld);
      self.puffs(new THREE.Vector3(0, 0, 0.1).applyMatrix4(dev.matrixWorld), 2, 0.25, { a: 0.4 });
      if (p && p.ok) { const at = P3(p), gy = P3({ x: p.x, y: 0, z: p.z }); gy.y = P3(pc.pos).y; self.bang(at, 'gold', 1.3, { bolts: 4, ground: gy.y, stars: 3 }); self.flash(at, 0xffffff, C.gold, 1.0, 0.07, 1.4); self.sparks(at, ENFX.sparks + 2, { ground: gy.y, tint: [C.spark, C.gold, C.orange] });
        self.ring(gy, 0.9, C.gold, C.goldB, 0.3, 1.1); self.shout({ x: p.x, y: p.y, z: p.z }, '콰앙!', '#ffe7a0', '#5a3a10', 1.55); } else self.flash(tip, 0xffffff, C.steamB, 0.25, 0.05, 0.6); void hit; } });
  }
  /** B2 브리치 캐논: 가슴 앞 짧은 포신, 탄약실 점등(0.1~0.3 s) → fire = 짧고 넓은 총구 불꽃 + 산탄 선 몇 개 + 반동 + 옆 증기 */
  // fx2: 발밑 주황 조준경 마법진 + 탄약실로 빨려 드는 주황 빛 → 발사 = 넓은 총구 섬광·세운 고리 + 부채꼴 파동(실제 r·ang) + 산탄 선 + 맞은 적마다 '팡' + 옆 증기·탄피 둘 + '쾅!'
  breach(pc, o) {
    if (!this._ok()) return null; const f = o.f, rot = Math.atan2(f.x, -f.z); let fT = -1, gT = 0;
    this.sigil(null, 1.0, { pal: 'orange', v: 1, follow: () => P3(pc.pos), life: 0.8, draw: 0.2, out: 0.3, spin: 3, a: 0.75 });
    const e = this._fx('breach', 0.95, (e) => {
      const base = P3(pc.pos).setY((pc.pos.y || 0) + 1.05); base.x += f.x * 0.45; base.z -= f.z * 0.45; e.g.position.copy(base); e.g.rotation.set(0, rot, 0);
      const kr = fT < 0 ? 0 : Math.max(0, 1 - (e.t - fT) / 0.22); cannon.position.z = -0.14 * kr; cannon.rotation.x = -0.25 * kr;
      this.glowM(ch, C.orange, fT < 0 ? smooth(0.08, 0.28, e.t) * 1.4 : Math.max(0, 1 - (e.t - fT) / 0.3));
      if (fT < 0 && e.t > 0.06) { gT -= e.dt || 0; if (gT <= 0) { gT = lite() ? 0.06 : 0.03; cannon.updateMatrixWorld(true); const q = new THREE.Vector3(0, 0.16, 0.06).applyMatrix4(cannon.matrixWorld); _c.set(rnd(-1, 1), rnd(-0.4, 1), rnd(-1, 1)).normalize().multiplyScalar(0.4);
        this.emit('glint', q.clone().add(_c), 1, { col: [C.orange, C.gold], cone: _c.clone().multiplyScalar(-2.4), jit: 0, speed: [1, 1], up: [0, 0], size: [0.1, 0.16], life: [0.16, 0.18], g: 0, drag: 0, fo: 0.7 }); } }
      const fade = 1 - smooth(0.75, 0.95, e.t); for (const m of e.items) if (m.material.uniforms.uA && m.userData.kind === 'solid') m.material.uniforms.uA.value = fade;
    });
    const cannon = this.pivot(e.g); this.part(e, 'en_breach', cannon); const ch = this.part(e, 'en_lens', cannon, { p: [0, 0.16, 0.06], s: 0.045 });
    const self = this;
    return this._h(e, { fire(o2) { fT = e.t; cannon.updateMatrixWorld(true); const tip = new THREE.Vector3(0, 0, 0.62).applyMatrix4(cannon.matrixWorld);
      self.flash(tip, 0xffffff, C.orange, 0.9, 0.07, 1.4);
      // the real cone (r, ang) lights once as a short wave; a few pellet streaks inside it (drawing only — damage was rolled once per enemy)
      const gp = P3(pc.pos).setY((pc.pos.y || 0) + 0.06), ef = self._fx('breachfan', 0.22, (x) => { const k = x.t / 0.22; fm.material.uniforms.uP.value = 0.15 + 0.9 * easeOut(k); fm.material.uniforms.uA.value = 1.2 * (1 - smooth(0.5, 1, k)); });
      ef.g.position.copy(gp); const fm = self._m(ef, 'enflat', self.fan(o2.ang), 3); fm.material.uniforms.uK.value = 0; fm.material.uniforms.uW.value.setHex(C.gold); fm.material.uniforms.uB.value.setHex(C.orangeB); fm.scale.setScalar(o2.r); fm.rotation.y = Math.atan2(f.z, f.x);
      const n = lite() ? 4 : 7, base = Math.atan2(f.z, f.x);
      for (let i = 0; i < n; i++) { const a = base + ((i + 0.5) / n - 0.5) * o2.ang * Math.PI / 180 * 0.9, L = o2.r * rnd(0.55, 0.95), A = tip.clone(), B = new THREE.Vector3(gp.x + Math.cos(a) * L, tip.y - 0.4, gp.z - Math.sin(a) * L);
        const ls = self._fx('pellet', 0.12, (x) => { lm.material.uniforms.uA.value = 1.1 * (1 - x.t / 0.12); }); const lm = self.spr(ls, 2, 0xffffff, C.gold, 6); self.seg(lm, A, B, 0.05); }
      self.vring(tip, 0.9, 0xffffff, C.orangeB, 0.24, 0.9); self.emit('glint', tip, 5, { col: [C.orange, C.gold, C.white], cone: new THREE.Vector3(f.x, 0, -f.z), jit: 0.5, speed: [2, 4], up: [0, 0.6], size: [0.16, 0.28], life: [0.18, 0.3], g: 0, drag: 3 });
      for (const t of o2.hits || []) { const q = P3(t).setY((t.y || 0) + 0.8); self.bang(q, 'orange', 0.6, { stars: 1, ground: t.y || 0 }); self.sparks(q, 2, { ground: t.y || 0 }); }
      if ((o2.hits || []).length) { const t0 = o2.hits[0]; self.shout({ x: t0.x, y: t0.y || 0, z: t0.z }, '쾅!', '#ffd08a', '#6a2a08', 1.45); }
      for (const sx of [-1, 1]) { const q = new THREE.Vector3(sx * 0.2, 0, 0.1).applyMatrix4(cannon.matrixWorld); self.puffs(q, 1, 0.2, { a: 0.5 }); self.casing(q, rot + (sx > 0 ? 0 : Math.PI)); } } });
  }
  /** B4 헬릭스 레일캐논: 두 레일이 벌어지고 코일이 뒤 → 앞으로 점등(축전), 바닥 조준선 = 실제 직선, fire = 청백 탄체 + 나선 잔상 + 레일 후퇴 + 증기 */
  // fx2: 발밑 청백 조준경 마법진 + 코일 점등마다 청백 빛이 포신으로 빨려 듦(축전) → 발사 = 밝은 심 + 넓은 겉빛 두 겹 탄도, 나선 잔상, 직선을 따라 반짝이·바닥 고리,
  //      꿰뚫린 적마다 청백 '팡'·불티 + '찌잉!'(한 번). 과한 빛 금지 — 심은 가늘고 짧게(0.35초).
  rail(pc, o) {
    if (!this._ok()) return null; const f = o.f, rot = Math.atan2(f.x, -f.z), len = o.len, FT = o.fire; let fT = -1, cancel = -1, gT = 0;
    const rsig = this.sigil(null, 1.0, { pal: 'ice', v: 1, follow: () => P3(pc.pos), life: FT + 0.4, draw: 0.25, out: 0.3, spin: 2.5, a: 0.75 });
    const e = this._fx('rail', FT + 0.7, (e) => {
      const base = P3(pc.pos).setY((pc.pos.y || 0) + 1.08); base.x += f.x * 0.4; base.z -= f.z * 0.4; e.g.position.copy(base); e.g.rotation.set(0, rot, 0);
      const ks = easeOut(e.t / 0.2), kr = fT < 0 ? 0 : Math.max(0, 1 - (e.t - fT) / 0.3), fade = cancel >= 0 ? 1 - clamp01((e.t - cancel) / 0.2) : 1 - smooth(FT + 0.45, FT + 0.65, e.t);
      rails.forEach((r, i) => { r.position.x = (i ? 1 : -1) * (0.06 + 0.1 * ks); r.position.z = -0.2 * kr; });
      coils.forEach((c, i) => { const on = fT < 0 ? smooth(0.12 + i * 0.18, 0.22 + i * 0.18, e.t) : kr; c.position.z = 0.15 + i * 0.25 - 0.2 * kr; this.glowM(c, C.ice, on * 1.3 * fade); });
      if (fT < 0 && cancel < 0 && e.t > 0.12) { gT -= e.dt || 0; if (gT <= 0) { gT = lite() ? 0.07 : 0.035; e.g.updateMatrixWorld(true); const q = new THREE.Vector3(0, 0, 0.4 + rand() * 0.6).applyMatrix4(e.g.matrixWorld); _c.set(rnd(-1, 1), rnd(-0.5, 1), rnd(-1, 1)).normalize().multiplyScalar(0.5);
        this.emit('glint', q.clone().add(_c), 1, { col: [C.ice, C.sky], cone: _c.clone().multiplyScalar(-2.6), jit: 0, speed: [1, 1], up: [0, 0], size: [0.1, 0.17], life: [0.17, 0.19], g: 0, drag: 0, fo: 0.7 }); } }
      // aim line on the ground (the real rect: from the caster along the press direction, width w)
      const A = P3(pc.pos), B = A.clone().add(new THREE.Vector3(f.x * len, 0, -f.z * len)); this.groundLine(aim, A, B, o.w); aim.material.uniforms.uA.value = (fT < 0 ? smooth(0, 0.2, e.t) * 0.9 : 0) * fade; aim.material.uniforms.uT.value = e.t;
      for (const m of e.items) if (m.userData.kind === 'solid') m.material.uniforms.uA.value = fade;
    });
    const rails = [-1, 1].map(() => { const p = this.pivot(e.g); this.part(e, 'en_rail', p); return p; });
    const coils = [0, 1, 2, 3].map(() => this.part(e, 'en_ring', e.g, { s: 0.16 }));
    const ae = this._fx('railaim', FT + 0.7, () => { }), aim = this.flat(ae, 2, C.ice, C.iceB, 2);   // 바닥 조준선은 장치(e.g)의 자식이 아니라 세계 좌표에
    const self = this;
    return this._h(e, {
      fire(o2 = {}) { if (e.dead) return; fT = e.t; e.g.updateMatrixWorld(true); const tip = new THREE.Vector3(0, 0, 1.05).applyMatrix4(e.g.matrixWorld), end = tip.clone().add(new THREE.Vector3(f.x * (len - 0.5), 0, -f.z * (len - 0.5)));
        self.flash(tip, 0xffffff, C.ice, 0.7, 0.07, 1.2);
        const n = lite() ? ENFX.helixLite : ENFX.helix, side = new THREE.Vector3(-f.z, 0, -f.x).normalize(), up = new THREE.Vector3(0, 1, 0);
        const bm = self._fx('railbeam', 0.35, (x) => { const k = x.t / 0.35; beam.material.uniforms.uA.value = 1.5 * (1 - smooth(0.1, 1, k));
          dots.forEach((d, i) => { const t = i / n, a = t * 18 + x.t * 30; d.position.copy(tip).lerp(end, t).addScaledVector(side, Math.cos(a) * 0.22).addScaledVector(up, Math.sin(a) * 0.22); d.quaternion.copy(self.camQ); d.material.uniforms.uA.value = 1.2 * (1 - smooth(0.0, 1, k + t * 0.4)); }); });
        const beam = self.spr(bm, 2, 0xffffff, C.iceB, 7); self.seg(beam, tip, end, 0.34);
        const halo = self.spr(bm, 2, C.sky, C.blueB, 6); self.seg(halo, tip, end, 0.9); const ho = bm.update; bm.update = (x, dt) => { ho(x, dt); halo.material.uniforms.uA.value = 0.45 * (1 - smooth(0.0, 1, x.t / 0.35)); };
        rsig.end(); self.vring(tip, 0.8, 0xffffff, C.iceB, 0.22, 0.9);
        const gp = P3(pc.pos); for (let k = 1; k <= 5; k++) { const q = tip.clone().lerp(end, k / 5.5); self.emit('glint', q, 1, { col: [C.ice, C.white], speed: [0.2, 0.6], up: [0.2, 0.6], size: [0.16, 0.26], life: [0.25, 0.4], g: 0 }); }
        for (const t of o2.hits || []) { const q = P3(t).setY((t.y || 0) + 0.9); self.bang(q, 'ice', 0.7, { stars: 1, ground: t.y || 0 }); self.sparks(q, 3, { tint: [C.ice, C.sky], ground: t.y || 0 }); }
        if ((o2.hits || []).length) { const t0 = o2.hits[0]; self.shout({ x: t0.x, y: t0.y || 0, z: t0.z }, '찌잉!', '#dff4ff', '#163a78', 1.45); } void gp;
        const dots = Array.from({ length: n }, () => { const d = self.spr(bm, 0, C.ice, C.iceB, 6); d.scale.setScalar(0.2); return d; });
        for (const sx of [-1, 1]) self.puffs(tip.clone().addScaledVector(side, sx * 0.2), 1, 0.25, { a: 0.5 }); },
      cancel() { if (cancel < 0) cancel = e.t; ae.life = Math.min(ae.life, ae.t + 0.2); rsig.end(); },
    });
  }
  /** B3 벌집 포드: 오른 어깨 뒤 — 덮개가 열리고(0.05~0.2 s) 미사일이 차례로 나감, 끝나면 닫힘 */
  pod(pc, o) {
    if (!this._ok()) return null; const end = o.first + o.n * o.gap + 0.35;
    const e = this._fx('pod', end + 0.3, (e) => {
      const yaw = Math.atan2(pc.facing.x, pc.facing.z); e.g.position.copy(P3(pc.pos)).setY((pc.pos.y || 0) + 1.35); e.g.rotation.set(0, yawRot(yaw), 0);
      lidP.rotation.x = -1.6 * (smooth(0.05, 0.2, e.t) * (1 - smooth(end - 0.2, end, e.t)));
      const fade = 1 - smooth(end, end + 0.25, e.t), app = easeOut(e.t / 0.12); podP.scale.setScalar(Math.max(0.01, app)); for (const m of e.items) if (m.userData.kind === 'solid') m.material.uniforms.uA.value = fade;
    });
    const podP = this.pivot(e.g, 0.2, 0, -0.28); podP.rotation.x = -0.35; this.part(e, 'en_pod', podP); const lidP = this.pivot(podP, 0, 0.41, -0.17); this.part(e, 'en_pod_lid', lidP);
    const self = this;
    this.sigil(null, 0.9, { pal: 'orange', v: 3, follow: () => P3(pc.pos), life: end + 0.2, draw: 0.2, out: 0.35, spin: 2, a: 0.7 });   // fx2: 발밑 설계도 마법진
    return this._h(e, { launch(i) { if (e.dead) return; podP.updateMatrixWorld(true); const p = new THREE.Vector3(-0.13 + (i % 3) * 0.13, 0.45, (i % 2) ? 0.08 : -0.08).applyMatrix4(podP.matrixWorld); self.flash(p, 0xffffff, C.orange, 0.3, 0.06, 1.0);
      self.emit('mist', p, 1, { col: [C.steam, C.steamB], speed: [0.2, 0.5], up: [0.2, 0.5], size: [0.18, 0.26], end: 2, life: [0.35, 0.5], g: 0, drag: 2, a: 0.35, fin: 0.05, fo: 0.3 }); self.emit('glint', p, 1, { col: [C.orange, C.gold], speed: [0.2, 0.6], up: [0.4, 1], size: [0.14, 0.2], life: [0.2, 0.3], g: 0 }); } });
  }
  /** 손목 단말 신호(드론 사출·레드라인·포격 지정): 왼손 작은 단말 + 청록(레드라인은 주황) 고리 */
  signal(pc, o) {
    if (!this._ok()) return null; const col = o.kind === 'en_redline' ? C.orange : o.kind === 'en_orbital' ? C.ice : C.teal;
    const e = this._fx('signal', 0.6, (e) => { const p = this.handL(pc); e.g.position.copy(p); wr.quaternion.copy(this.camQ); const k = e.t / 0.6; this.glowM(scr, col, 1.2 * (1 - k));
      g.quaternion.copy(this.camQ); g.scale.setScalar(0.18 + 0.4 * smooth(0.15, 0.35, e.t)); g.material.uniforms.uA.value = e.t > 0.15 ? 1.0 * (1 - smooth(0.3, 0.6, e.t)) : 0; });
    const wr = this.pivot(e.g); this.part(e, 'en_wrist', wr, { s: 1.4 }); const scr = this.part(e, 'en_lens', wr, { p: [0, 0.03, 0], s: 0.03 }); const g = this.spr(e, 1, 0xffffff, col, 6);
    { const p = this.handL(pc), pal = o.kind === 'en_redline' ? 'orange' : o.kind === 'en_orbital' ? 'ice' : 'teal'; this.emit('glint', p, 4, { col: PAL[pal].slice(0, 1).concat([C.white]), speed: [0.2, 0.6], up: [0.6, 1.4], size: [0.1, 0.18], life: [0.3, 0.45], g: 0 });
      this.sigil(null, 0.85, { pal, v: o.kind === 'en_orbital' ? 1 : 3, follow: () => P3(pc.pos), life: 0.75, draw: 0.18, out: 0.3, spin: 2.5, a: 0.7 }); }
    if (o.kind === 'en_orbital') { const p0 = P3(pc.pos).setY((pc.pos.y || 0) + 1.4); const b = this._fx('uplink', 0.45, (x) => { const k = x.t / 0.45; this.seg(m, p0, p0.clone().setY(p0.y + 2 + 10 * easeOut(k)), 0.07); m.material.uniforms.uA.value = 1.1 * (1 - k); }); const m = this.spr(b, 2, 0xffffff, C.iceB, 6); }
    return this._h(e);
  }
  /** B5 오비탈 브레이커: 조준 고리가 차례로 고정(실제 반경), 가는 낙하 궤적이 점점 밝아짐, 정밀 포격 3 → 중심 포격(낮은 원형 충격파·파편; 화면을 덮는 기둥·흰 섬광 없음) */
  orbital(at, o) {
    if (!this._ok()) return null; const c = P3(at), locks = [], R = o.R;
    let coreT = -1, cancel = -1, whist = false;
    // fx2: 중심 반경(o.core = 실제 중심 포격 범위) 청백 조준경 마법진이 그려지며 돎, 조준 고리 = 금빛 작은 마법진(실제 범위 o.r) + 낙하 궤적이 점점 굵어짐,
    //      정밀 포격 = 그 자리 금빛 빛기둥(범위 안)·폭발, 중심 포격 = 청백 빛기둥 + 낮은 원형 충격파 두 겹 + 파편 + '콰과광!'. 화면을 덮는 기둥·흰 섬광 없음.
    const csig = this.sigil(c, o.core, { pal: 'ice', v: 1, hold: true, draw: 0.5, out: 0.4, spin: 1.8, a: 0.75, glowA: 0.7 });
    const e = this._fx('orbital', 4.0, (e, dt) => {
      if (!whist && e.t > 0.9 && cancel < 0) { whist = true; this.snd('en_whistle'); }
      if (e.t > 3.7) { csig.end(); for (const L of locks) if (L && L.sig) L.sig.end(); }   // 규칙이 취소 없이 멈춘 경우(사망 등)에도 남지 않게
      const fade = cancel >= 0 ? 1 - clamp01((e.t - cancel) / 0.25) : 1;
      outer.position.copy(c).setY(c.y + 0.05); outer.scale.set(R * 2, R * 2, 1); outer.material.uniforms.uA.value = 0.35 * smooth(0, 0.3, e.t) * (coreT < 0 ? 1 : 0) * fade;
      cr.position.copy(c).setY(c.y + 0.06); const kc = smooth(0.4, 1.9, e.t); cr.scale.set(o.core * 2, o.core * 2, 1); cr.rotation.z = -e.t; cr.material.uniforms.uA.value = (coreT < 0 ? 0.5 + 0.7 * kc : 0) * fade;
      ctrail.material.uniforms.uA.value = (coreT < 0 ? 0.25 + 0.9 * kc * kc : 0) * fade; this.seg(ctrail, c.clone().setY(c.y + 14), c.clone().setY(c.y + 0.1), 0.06 + 0.1 * kc);
      for (const L of locks) { L.t += dt; const k = clamp01(L.t / 0.18), kt = clamp01(L.t / 1.0); L.ring.scale.set(o.r * 2 * (1.6 - 0.6 * easeOut(k)), o.r * 2 * (1.6 - 0.6 * easeOut(k)), 1); L.ring.rotation.z = L.t * 2;
        L.ring.material.uniforms.uA.value = (L.done ? 0 : 1.2) * fade; L.tr.material.uniforms.uA.value = (L.done ? 0 : 0.2 + 1.0 * kt * kt) * fade; this.seg(L.tr, L.p.clone().setY(L.p.y + 14), L.p.clone().setY(L.p.y + 0.1), 0.04 + 0.05 * kt); }
      if (coreT >= 0 && e.t - coreT > 0.9) e.t = e.life;
    });
    const outer = this.spr(e, 1, C.ice, C.iceB, 3); outer.rotation.set(-Math.PI / 2, 0, 0);
    const cr = this.spr(e, 1, C.ice, C.blueB, 3); cr.rotation.set(-Math.PI / 2, 0, 0); const ctrail = this.spr(e, 2, 0xffffff, C.iceB, 6);
    const self = this;
    return this._h(e, {
      lock(i, p) { if (e.dead) return; const L = { p: P3(p), t: 0, ring: self.spr(e, 1, C.gold, C.orangeB, 4), tr: self.spr(e, 2, 0xffffff, C.goldB, 6), done: false }; L.ring.rotation.set(-Math.PI / 2, 0, 0); L.ring.position.copy(L.p).setY(L.p.y + 0.06); locks[i] = L;
        L.sig = self.sigil(L.p, o.r, { pal: 'gold', v: 1, hold: true, draw: 0.16, out: 0.3, spin: 3, a: 0.8, glowA: 0.8 }); self.emit('glint', L.p.clone().setY(L.p.y + 0.3), 3, { col: [C.gold, C.white], speed: [0.3, 0.8], up: [0.6, 1.4], size: [0.12, 0.2], life: [0.25, 0.4], g: 0 }); self.snd('en_target', 0.1); },
      strike(i, p, hit) { const L = locks[i]; if (L) { L.done = true; if (L.sig) L.sig.end(); } const q = P3(p); self.flash(q.clone().setY(q.y + 0.5), 0xffffff, C.gold, 1.0, 0.07, 1.2); self.pillar(q, Math.min(0.7, o.r * 0.45), 3.2, { pal: 'gold', life: 0.4, a: 0.85 }); self.blast(p, { r: o.r, kind: 'missile', hit }); },
      core(hit) { coreT = e.t; csig.end(); const b = self._fx('orbcore', 0.16, (x) => { m.material.uniforms.uA.value = 1.4 * (1 - x.t / 0.16); }); const m = self.spr(b, 2, 0xffffff, C.iceB, 7); self.seg(m, c.clone().setY(c.y + 12), c.clone().setY(c.y + 0.1), 0.5);
        self.pillar(c, Math.min(1.1, o.core * 0.4), 4.0, { pal: 'ice', life: 0.55, a: 0.9 });
        self.blast({ x: c.x, y: c.y, z: -c.z }, { r: o.core, kind: 'orbital', hit }); self.ring(c, o.core * 1.0, C.ice, C.iceB, 0.45, 1.0); self.ring(c, o.core * 0.75, C.gold, C.goldB, 0.55, 0.8); self.sparks(c.clone().setY(c.y + 0.3), 10, { tint: [C.ice, C.sky], speed: [3, 6], up: [2.5, 4], ground: c.y });
        self.emit('star', c.clone().setY(c.y + 0.6), 4, { col: [C.ice, C.gold], speed: [1.6, 3.2], up: [2, 3.4], size: [0.06, 0.09], life: [0.5, 0.75], g: 8, glow: 0.7, ground: c.y, spin: 10 });
        if (hit) self.shout({ x: c.x, y: c.y, z: -c.z }, '콰과광!', '#dff4ff', '#163a78', 1.7); },
      cancel() { if (cancel < 0) cancel = e.t; csig.end(); for (const L of locks) if (L && L.sig) L.sig.end(); },
    });
  }

  // ------------------------------------------------------------------ C3 리페어 비콘 + 정비 드론 · C4 리커버리 코어 · C5 레드라인 · 제작
  beacon(at, o) {
    if (!this._ok()) return null; const p = P3(at); let endT = -1, weldT = 0, tgt = null; const home = p.clone().add(new THREE.Vector3(0.5, 1.4, 0.3));
    // fx2: 비콘이 박히는 순간 청록 섬광·빛기둥, 수리 범위(실제 r) 옅은 민트 설계도 마법진이 천천히 돎, 수리 틱 = 용접 불꽃(불티·반짝이) + 기계 둘레 작은 민트 고리·톱니
    const bsig = this.sigil(p, o.r, { pal: 'mint', v: 3, hold: true, draw: 0.4, out: 0.4, spin: 0.6, a: 0.42, glowA: 0.3 });
    this.flash(p.clone().setY(p.y + 0.5), 0xffffff, C.teal, 0.6, 0.1, 1.0); this.pillar(p, 0.3, 1.8, { pal: 'mint', life: 0.5, a: 0.75 });
    const e = this._fx('beacon', 1e9, (e, dt) => {
      const a = endT < 0 ? 1 : 1 - clamp01((endT += dt) / 0.35); if (a <= 0) { e.t = e.life; return; }
      const k = easeOut(e.t / 0.15); bea.position.copy(p).setY(p.y + 0.8 * (1 - k)); this.glowM(lamp, C.teal, (0.5 + 0.5 * Math.sin(e.t * 6)) * a);
      rng.position.copy(p).setY(p.y + 0.05); rng.scale.set(o.r * 2, o.r * 2, 1); rng.material.uniforms.uA.value = 0.28 * a * smooth(0, 0.3, e.t);
      weldT -= dt; const want = tgt && !tgt.dead && weldT > 0 ? P3(tgt.pos).setY((tgt.pos.y || 0) + (tgt.en && tgt.en.kind === 'drone' ? tgt.en.h + 0.3 : 0.9)).add(new THREE.Vector3(0.3, 0.2, 0.2)) : home.clone().setY(home.y + Math.sin(e.t * 3) * 0.1);
      dr.position.lerp(want, Math.min(1, dt * 5)); dr.rotation.y += dt * 2; for (const m of e.items) if (m.userData.kind === 'solid') m.material.uniforms.uA.value = a;
    });
    const bea = this.pivot(e.g); this.part(e, 'en_beacon', bea); const lamp = this.part(e, 'en_lens', bea, { p: [0, 0.82, 0], s: 0.07 });
    const rng = this.spr(e, 1, C.teal, C.tealB, 3); rng.rotation.set(-Math.PI / 2, 0, 0);
    const dr = this.pivot(e.g); dr.position.copy(home); this.part(e, 'en_drone', dr, { s: 0.55 }); this.part(e, 'en_wrench', dr, { p: [0, -0.05, 0.12], s: 1.0 });
    const self = this;
    return this._h(e, {
      weld(s) { tgt = s; weldT = 0.8; const q = P3(s.pos).setY((s.pos.y || 0) + (s.en && s.en.kind === 'drone' ? s.en.h : 0.6)); self.flash(q, 0xffffff, C.teal, 0.35, 0.08, 1.0); self.sparks(q, 6, { tint: [C.spark, C.gold, C.mint], speed: [1, 2.4], up: [0.6, 1.6], ground: (s.pos.y || 0), life: 0.4 });
        self.emit('glint', q, 3, { col: [C.mint, C.white], speed: [0.3, 0.8], up: [0.6, 1.2], size: [0.12, 0.2], life: [0.3, 0.45], g: 0 }); self.vring(q, 0.6, C.mint, C.tealB, 0.3, 0.7); self.emit('gear', q, 1, { col: [C.brass], speed: [0.3, 0.7], up: [1, 1.6], size: [0.05, 0.07], life: [0.5, 0.6], g: 8, ground: (s.pos.y || 0), glow: 0.1 }); },
      end() { if (endT < 0) endT = 0; bsig.end(); },
      dispose() { bsig.end(); self._free(e); },
    });
  }
  core(from, o) {
    if (!this._ok()) return null; const A = P3(from), pc = o.to;
    const e = this._fx('recover', 0.6, (e) => { const k = e.t / 0.55, B = P3(pc.pos).setY((pc.pos.y || 0) + 1.15); cm.position.copy(this.arc(A, B, easeOut(k), 0.9)); cm.rotation.y += 0.2; cm.scale.setScalar(0.09 * (1 - 0.5 * k));
      gl.position.copy(cm.position); gl.quaternion.copy(this.camQ); gl.material.uniforms.uA.value = 0.9; this.trail(rib, hist, cm.position, 10, 0.06, 0.85 * (1 - smooth(0.85, 1, k)));
      if (k >= 1 && !e.doneT) { e.doneT = 1; this.flash(B, 0xffffff, C.blue, 0.5, 0.12, 1.0); this.vring(B, 0.6, C.sky, C.blueB, 0.3, 0.9); this.emit('glint', B, 4, { col: [C.sky, C.white], speed: [0.4, 1], up: [0.3, 1], size: [0.12, 0.2], life: [0.3, 0.45], g: 0 }); this.snd('en_core', 0.15); } });
    const cm = this.part(e, 'en_core', e.g); this.glowM(cm, C.blue, 1.0); const gl = this.spr(e, 0, C.ice, C.blue, 5); gl.scale.setScalar(0.35);
    const rib = this._ribbon(e, 10), hist = []; rib.material.uniforms.uW.value.setHex(C.sky); rib.material.uniforms.uB.value.setHex(C.blueB);
    return this._h(e, { noop() { } });
  }
  // fx2: 시작 = 주황 나선이 몸을 감아 오름 + 발밑 주황 설계 마법진(과부하 동안 몸을 따라 옅게) + 경보음, 등 뒤 붉은 경고등 깜박임, 냉각 = 증기 + 냉각판 소리
  redline(pc, o) {
    if (!this._ok()) return null; const kit = o.kit; let puffT = 0, cooled = false;
    const foot = () => P3(pc.pos); this.helix(foot, 0.6, 2.0, { pal: 'orange', life: 0.9, spin: 3 }); this.helix(foot, 0.75, 1.6, { pal: 'red', life: 1.0, spin: -2.4, a: 0.7 });
    this.pillar(foot(), 0.55, 2.2, { pal: 'orange', life: 0.5, a: 0.7 }); this.snd('en_alarm', 0.3);
    const rs = this.sigil(null, 0.9, { pal: 'orange', v: 0, hold: true, follow: foot, draw: 0.25, out: 0.4, spin: 3.2, a: 0.45, glowA: 0.45 });
    const e = this._fx('redline', o.dur + o.cool + 0.3, (e, dt) => {
      const h = kit.heat(); const p = P3(pc.pos).setY((pc.pos.y || 0) + 1.5); const yaw = Math.atan2(pc.facing.x, pc.facing.z); p.x -= Math.sin(yaw) * 0.25; p.z += Math.cos(yaw) * 0.25;
      w.position.copy(p); w.quaternion.copy(this.camQ); w.material.uniforms.uA.value = h > 0 ? (Math.sin(e.t * 14) > 0 ? 1.0 : 0.25) : 0;
      puffT -= dt; if (h < 0 && puffT <= 0) { puffT = 0.6; this.puffs(p, 1, 0.3, { a: 0.4 }); }
      if (h <= 0 && e.t > 0.5) rs.end();
      if (h < 0 && !cooled) { cooled = true; this.snd('en_vent', 0.3); this.puffs(p, 3, 0.5, { a: 0.5 }); }
      if (h > 0 && !lite() && ((e.t * 6) | 0) !== (((e.t - dt) * 6) | 0)) this.sparks(p, 1, { tint: [C.orange, C.red], speed: [0.2, 0.6], up: [0.4, 1], ground: P3(pc.pos).y, life: 0.3 });
      if (h === 0 && e.t > 0.5) e.t = e.life;
    });
    const w = this.spr(e, 0, 0xffffff, C.red, 6); w.scale.setScalar(0.16);
    return this._h(e, { dispose: () => { rs.end(); this._free(e); } });
  }
  /** C1·C2 제작 완성: 설계도 원판 위에서 총열·몸체·코어가 모여 결합 → 완성품이 돌다 사라짐(한 번 제작 = 한 번, 여러 개도 한 묶음) */
  made(pc, o = {}) {
    if (!this._ok()) return null; const f = pc.facing, at = P3(pc.pos).add(new THREE.Vector3(f.x * 0.8, 1.2, -f.z * 0.8)), gun = o.kind !== 'module';
    // fx2: 설계도 마법진(바닥 판이 아니라 공중 원판 bp + 발밑 설계도 마법진) → 부품이 모여 결합하며 불티 → 완성 '팡'(청록·금 별·톱니) + 제작 소리
    this.sigil(null, 0.9, { pal: 'blue', v: 3, follow: () => P3(pc.pos), life: 1.6, draw: 0.3, out: 0.35, spin: 1.5, a: 0.75 }); this.snd('en_craft', 0.3);
    const e = this._fx('made', 1.6, (e) => { const k = clamp01(e.t / 0.7), out = smooth(1.2, 1.6, e.t);
      bp.position.copy(at).setY(at.y - 0.3); bp.scale.set(0.9, 0.9, 1); bp.material.uniforms.uA.value = 0.8 * smooth(0, 0.2, e.t) * (1 - out);
      parts.forEach((p, i) => { const off = new THREE.Vector3((i - 1) * 0.5, 0.2 + i * 0.1, 0).multiplyScalar(1 - easeOut(k)); p.position.copy(off); });
      grp.position.copy(at); grp.scale.setScalar(2.0); grp.rotation.y = e.t > 0.7 ? (e.t - 0.7) * 3 : 0; for (const m of e.items) if (m.userData.kind === 'solid') m.material.uniforms.uA.value = 1 - out;
      if (e.t > 0.7 && !e.lit) { e.lit = true; this.bang(at, 'teal', 0.8, { bolts: 2, ground: at.y - 1.1, stars: 2 }); this.sparks(at, 5, { tint: [C.gold, C.spark], ground: at.y - 1.1 }); } });
    const bp = this.spr(e, 1, C.blue, C.blueB, 3); bp.rotation.set(-Math.PI / 2, 0, 0);
    const grp = this.pivot(e.g); const parts = gun ? [this.part(e, 'en_barrel', grp, { s: 0.8 }), this.part(e, 'en_case', grp, { s: 0.5 }), this.part(e, 'en_core', grp, { s: 0.06 })]
      : [this.part(e, 'en_drum', grp, { s: 1.0 }), this.part(e, 'en_muzzle', grp, { s: 1.0 }), this.part(e, 'en_coil', grp, { s: 0.08 })];
    this.glowM(parts[2], C.teal, 0.8);
    return this._h(e);
  }
}
void cookTop;
