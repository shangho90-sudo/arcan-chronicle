// 양약사 2차 스킬 이펙트 (2026-11-16, 같은 날 '화려하게' 개편). 규칙은 js/wpharm.js, 메시는 tools/blender/fx_wpharm.py -> assets/fx/fx_wpharm.glb.json
// (wp_cap_half / _granule / _ampoule / _crystal / _tablet / _vial / _shard / _sphere + 이펙트 메시 wp_star / _petal / _pillar / _helix — 정점 색만, 색은 tint 유니폼)
// + Tripo 소품 tools/tripo/wp_assets.py -> tools/blender/fx_wpharm_tripo.py -> assets/fx/fx_wpharm_tripo.glb.json (tripo_cap_a/b·tripo_ampoule·tripo_flask,
//   없으면 절차 메시). 시각 정체성: 동화풍 정밀 제약 마법 — 유리·반투명 약액·통통한 캡슐 + 금테 마법진·빛기둥·별 반짝이.
// 층(모든 스킬 공통): (1) 시전 준비 = 발밑 마법진(circle) + 손 모임 빛 (2) 본체 = 큰 메시 + 꼬리 리본 + 반짝이 (3) 명중 = 섬광·세운 고리·바닥 고리·별/파편
//   (4) 잔광 = 천천히 사라지는 마법진·연무. 큰 것(마법진·고리·빛기둥 반지름)은 실제 판정 반경 안. 가장 밝은 순간 = 실제 피해 순간(js/wpharm.js 가 handle 을 부름).
// 색 역할: 청백·청록 = 정밀·보호·회복 / 빨강·금 = 화상·촉매 / 옅은 하늘색 = 냉기·결정, 테두리는 금. 빛만 가산(색 ≤ 1 — 블룸 문턱 2.6 아래), 바닥 문양은 일반 블렌딩.
// 성능: 별·과립·파편·꽃잎·반짝이·연무는 종류마다 InstancedMesh 하나(Parts, draw call 1, 상한 cap — 차면 새 입자를 버림). 난수는 자기 것(rand)만 — 게임 Math.random 을 건드리지 않음.
// 종류 (FX.wp(kind, a, o) — 모두 null 이 될 수 있음, 규칙은 그대로):
//   mark(t)                          반응 표식: 발밑 얇은 청록 고리 + 카메라 쪽 구슬 1~3. handle {setStacks(n), dispose()} — 0이 되면 소비 섬광 뒤 사라짐
//   capsule(pc, {from, tgt(), at(), fly, split, n})   handle {launch(i, dur, ok), hit(i, pos, ok, last), fizzle(i), ring(pos, r)}
//   cryo(pc, {from, at, r, fly, film, rise, burst})   handle {burst(hits)}
//   ion(pc, {from, f, len, w, align, strike, n})      handle {strike(hits)}
//   triad(pc, {from, tgt(), at(), times})               handle {hit(i, pos, ok), fizzle(i), compound(pos, r), end()}
//   collapse(pc, {at, r, contact})                    handle {impact(n)}
//   catalyst(pc, {dur, n})  carrier(pc, {from, tgt, fly})  chain(pc, {from, tgt, first})  zone(pos, {r, life})  critical(pos, {r, burst, snap})
//   spray(pos, {r, dur, follow})  coat(pc, {dur, initial})  lastrx(pc, {dur})  made(pc, {kind: vial|capsule})  regen(pc, {status})
// 소리: 판정 순간의 소리는 규칙(js/wpharm.js)이 내고, 그림에만 있는 순간(캡슐이 갈라짐·막이 퍼짐·응축·촉매·운반체·분무·코팅·최종 처방·조제)은 여기서
//   (assets/audio/sfx_wp_*.mp3 — Runway, tools/audio/wp_runway_sfx.py).
// 저사양(휴대폰 / 그래픽 효과 끔): 입자 수만 줄임(WPFX.liteK) — 캡슐·결정·마법진·빛기둥·표식 소비는 그대로.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CookFx, cookTop } from './cookfx.js';

export const WPFX = {
  intensity: 1.0,
  col: { teal: 0x5ae6d2, tealB: 0x1a9a92, ice: 0xbfeaff, iceB: 0x4aa8f0, white: 0xf4fbff, red: 0xff4a3a, redB: 0xb8180e, gold: 0xffd27a, goldB: 0xff9a2a, capW: 0xf6f2ea, capR: 0xff5a48,
    silver: 0xd6e2ee, glass: 0xdff6ff, mint: 0x9affd8, pink: 0xffb6dc, lilac: 0xc9b4ff, sky: 0x9ad8ff, lime: 0xc8ff7a, ember: 0xff8a3a },
  mark: { pad: 0.3, w: 0.035, bead: 0.11 },
  capsule: { size: 0.17, granule: 0.07, trail: 8, trailLite: 5, arc: 1.1 },
  cryo: { rim: 8, rimLite: 6, mid: 4, crystal: 0.46, centre: 1.05, shards: 16, shardsLite: 7 },
  ion: { y: 1.05, segs: 12, branches: 4, branchesLite: 2 },
  collapse: { h: 3.2, size: 0.78, granules: 14, granulesLite: 8, shards: 22, shardsLite: 10, spikes: 10, spikesLite: 6 },
  zone: { granules: 10, granulesLite: 6 },
  liteK: 0.45,                                                           // 저사양 입자 배율
  cap: { star: 160, gran: 200, shard: 140, petal: 90, glint: 220, mist: 70 },   // 종류별 동시 입자 상한(인스턴스 수)
};
const P3 = (p) => new THREE.Vector3(p.x, p.y || 0, -p.z);
const lite = () => { const G = window.G; return !!(G && ((G.input && G.input.mobile) || (G.settings && G.settings.graphicsFx === false))); };
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const easeIn = (x) => Math.pow(clamp01(x), 2.2);
let _s = 0x2f6b9d1 | 0;                                                  // 자기 난수(xorshift) — 게임의 Math.random(명중·치명 굴림)을 건드리지 않음
const rand = () => { _s ^= _s << 13; _s ^= _s >>> 17; _s ^= _s << 5; return (_s >>> 0) / 4294967296; };
const rnd = (a, b) => a + rand() * (b - a);
const pick = (a) => (Array.isArray(a) ? a[(rand() * a.length) | 0] : a);
const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s3 = new THREE.Vector3(), _col = new THREE.Color();
const bez = (out, p0, p1, p2, t) => { const u = 1 - t; return out.set(u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y, u * u * p0.z + 2 * u * t * p1.z + t * t * p2.z); };
const mid = (t) => Math.min(1.2, 0.45 + (t.radius || 0.5) * 0.7);

const GLASS_VS = `attribute vec3 color; varying vec3 vC, vN, vV;
void main(){ vC = color; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
// 유리: 몸통은 옅은 안쪽 색(uOp), 가장자리(fresnel)는 밝게 + 정점 색(금띠) — 굴절 없음
const GLASS_FS = `uniform vec3 uTint, uRim; uniform float uA, uOp, uGlow; varying vec3 vC, vN, vV;
void main(){ vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n; vec3 L = normalize(vec3(-.4, .8, .5));
  float d = max(0., dot(n, L)), fr = pow(1. - abs(dot(n, vV)), 2.2), sp = pow(max(0., dot(reflect(-L, n), vV)), 30.);
  vec3 base = vC * uTint; vec3 c = base * (.5 + .55 * d) + uRim * fr * 1.1 + vec3(1.) * sp * .8 + base * uGlow;
  gl_FragColor = vec4(c, uA * clamp(uOp + (1. - uOp) * fr + sp, 0., 1.)); }`;
const FLAT_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
// 바닥 원판 uK: 0 결정 막(uP = 퍼진 반지름 0..1, 둘레 선 + 옅은 육각 결) / 1 과립 지대(옅은 청록 + 테두리) / 2 충격파 고리(uP = 반지름, 얇은 띠)
const DISC_FS = `uniform vec3 uW, uB; uniform float uA, uK, uP, uT, uAdd; varying vec2 vUv;
void main(){ vec2 p = vUv * 2. - 1.; float r = length(p), a = 0., core = 0.;
  if (uK < .5) { float in_ = smoothstep(uP, uP - .04, r); vec2 h = p * 7.; h.x += mod(floor(h.y), 2.) * .5; vec2 f = abs(fract(h) - .5);
    float hex = smoothstep(.44, .49, max(f.x, f.y)); a = in_ * (.22 + .18 * hex + .25 * smoothstep(uP - .25, uP, r)); core = smoothstep(uP - .05, uP - .01, r) * in_; a += core * .9; }
  else if (uK < 1.5) { a = smoothstep(1., .9, r) * (.18 + .22 * smoothstep(.35, .95, r)) + smoothstep(.97, .93, r) * smoothstep(.86, .93, r) * .7; core = smoothstep(.9, .96, r) * step(r, .98); }
  else { float w = .05 + .1 * (1. - uP); a = smoothstep(w, 0., abs(r - uP)) * step(r, 1.); core = smoothstep(w * .45, 0., abs(r - uP)); }
  vec3 c = mix(uB, uW, clamp(core, 0., 1.));
  if (uAdd > .5) gl_FragColor = vec4(c * a * uA, 1.); else gl_FragColor = vec4(c, a * uA); }`;
// 마법진(바닥 판, 반지름 1 = 판정 반경 이하): 금테 이중 고리 + 도는 룬 띠 + 안쪽 도형(uV 0 육망성 / 1 삼각 / 2 눈꽃 살 / 3 겹친 사각) + 가운데 빛,
// uP = 그려진 각도(0..1, 위에서 시계 방향으로 그려짐), uT = 시간(룬·도형 회전, 퍼지는 물결), 가운데는 옅게(적·경고 표시가 보이게). uAdd 1 = 가산 빛 층
const SIGIL_FS = `uniform vec3 uW, uB, uG; uniform float uA, uP, uT, uV, uAdd; varying vec2 vUv;
#define PI 3.14159265
float band(float r, float c, float w){ return smoothstep(w, w * .3, abs(r - c)); }
float poly(vec2 p, float n, float R, float rot, float w){ float a = atan(p.y, p.x) + rot, s = 2. * PI / n; float d = length(p) * cos(mod(a, s) - s * .5) - R * cos(s * .5); return smoothstep(w, w * .3, abs(d)); }
void main(){ vec2 p = vUv * 2. - 1.; float r = length(p); if (r > 1.) discard;
  float ang = atan(p.y, p.x), a01 = fract(.25 - ang / (2. * PI)); float drawn = smoothstep(uP + .004, uP - .004, a01) * step(.001, uP);
  float gold = band(r, .968, .024) + band(r, .9, .011) * .8;
  float ra = (ang + uT * .35) / (2. * PI) * 36., cell = floor(ra), fr_ = fract(ra), h = fract(sin(cell * 91.3) * 43.7);
  float rune = smoothstep(.905, .915, r) * smoothstep(.958, .948, r) * step(.16, fr_) * step(fr_, .3 + .55 * h);
  float lines = rune * .9 + band(r, .64, .012) * .8 + band(r, .58, .008) * .5, rot = -uT * .45;
  if (uV < .5) { lines += poly(p, 3., .86, rot, .016) + poly(p, 3., .86, rot + PI / 3., .016) + poly(p, 6., .58, -rot * 1.6, .01) * .7; }
  else if (uV < 1.5) { lines += poly(p, 3., .86, rot, .02) + poly(p, 3., .43, -rot * 2. + PI, .012) * .8; }
  else if (uV < 2.5) { float sa = mod(ang + rot, PI / 3.) - PI / 6.; lines += smoothstep(.016, .004, r * abs(sin(sa))) * step(r, .88) * (.6 + .4 * step(.3, r));
    lines += poly(p, 6., .62, rot, .012); float sb = mod(ang + rot + PI / 6., PI / 3.) - PI / 6.; lines += smoothstep(.012, .003, r * abs(sin(sb))) * step(.36, r) * step(r, .58) * .6; }
  else { lines += poly(p, 4., .86, rot, .016) + poly(p, 4., .86, rot + PI / 4., .016) + poly(p, 8., .5, -rot, .01) * .6; }
  float wave = band(r, fract(uT * .55), .05) * .35 * step(r, .95), core = exp(-r * r * 22.) * .5, fill = .07 + .12 * smoothstep(.25, .95, r);
  vec3 c = mix(uB, uW, clamp(lines + wave, 0., 1.) * .7); c = mix(c, uG, clamp(gold, 0., 1.)); c = mix(c, uW, core);
  float a = (fill + lines * .85 + gold + wave + core) * drawn * uA;
  if (uAdd > .5) gl_FragColor = vec4(c * clamp(a, 0., 1.2) * .7, 1.); else gl_FragColor = vec4(c, clamp(a, 0., .92)); }`;
// 빛기둥(열린 원통, u 둘레 / v 높이): 아래가 밝고 위로 흐려짐, 세로 줄무늬가 돌고 위로 흐름 — 가산
const PILLAR_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const PILLAR_FS = `uniform vec3 uW, uB; uniform float uA, uT; varying vec2 vUv;
void main(){ float v = vUv.y, fade = pow(1. - v, 1.5) * smoothstep(0., .05, v);
  float st = .55 + .45 * sin(vUv.x * 43.98 + uT * 3.) * sin(vUv.x * 18.85 - uT * 2.), fl = .7 + .3 * sin((v - uT * 1.4) * 17.);
  gl_FragColor = vec4(mix(uW, uB, clamp(v * 1.3, 0., 1.)) * fade * st * fl * uA, 1.); }`;
// 나선 띠(u 길이 0..1 / v 폭): uP = 머리 위치, 머리 뒤 0.5 길이만 보임 — 가산
const HELIX_FS = `uniform vec3 uW, uB; uniform float uA, uP; varying vec2 vUv;
void main(){ float e = 1. - abs(vUv.y * 2. - 1.), k = (uP - vUv.x) / .5; if (k < 0. || k > 1.) discard;
  float a = smoothstep(0., .7, e) * pow(1. - k, 1.3) * smoothstep(0., .04, k + .02); gl_FragColor = vec4(mix(uW, uB, k) * a * uA, 1.); }`;
// 인스턴스 입자: 메시(별·과립·파편·꽃잎 — 빛 받는 몸 + 자체 빛) / 빌보드(반짝이 = 가산 네 꼭지 별, 연무 = 부드러운 덩어리)
const PM_VS = `attribute vec3 color; attribute vec3 aC; attribute vec2 aA; varying vec3 vC, vN, vV; varying vec2 vA;
void main(){ vC = aC * color; vA = aA; mat3 im = mat3(instanceMatrix); vN = normalize(normalMatrix * (im * normal)); vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const PM_FS = `varying vec3 vC, vN, vV; varying vec2 vA;
void main(){ vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n; vec3 L = normalize(vec3(-.4, .8, .5)); float d = max(0., dot(n, L)), fr = pow(1. - abs(dot(n, vV)), 2.), sp = pow(max(0., dot(reflect(-L, n), vV)), 24.);
  vec3 c = vC * (.55 + .55 * d) + mix(vC, vec3(1.), .5) * fr * .6 + vec3(1.) * sp * .6 + vC * vA.y; gl_FragColor = vec4(c, vA.x); }`;
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
    this.aC = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); this.aA = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2);
    this.aC.setUsage(THREE.DynamicDrawUsage); this.aA.setUsage(THREE.DynamicDrawUsage); g.setAttribute('aC', this.aC); g.setAttribute('aA', this.aA);
    this.m = new THREE.InstancedMesh(g, mat, cap); this.m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.m.count = 0; this.m.frustumCulled = false; this.m.renderOrder = bb === 'mist' ? 4 : 6; root.add(this.m);
  }
  add(o) { if (this.p.length >= this.cap) return null; this.p.push(o); return o; }
  update(dt) {
    let n = 0; const P = this.p;
    for (let i = 0; i < P.length; i++) {
      const q = P[i]; q.t += dt; if (q.t >= q.life) continue;
      if (q.follow) { q.ox = q.follow.x; q.oz = q.follow.z; }
      const dr = Math.exp(-q.drag * dt); q.vx *= dr; q.vz *= dr; q.vy = q.vy * dr - q.g * dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.y < q.ground) { q.y = q.ground; q.vy = -q.vy * q.bounce; q.vx *= 0.5; q.vz *= 0.5; }
      q.rx += q.wx * dt; q.ry += q.wy * dt; q.rz += q.wz * dt;
      const k = q.t / q.life, s = q.s0 + (q.s1 - q.s0) * k, a = q.a * smooth(0, q.fin, q.t) * (1 - smooth(q.fo, 1, k));
      _e.set(q.rx, q.ry, q.rz); _q.setFromEuler(_e); _s3.set(s, s, s); _a.set(q.x, q.y, q.z); _m4.compose(_a, _q, _s3); this.m.setMatrixAt(n, _m4);
      this.aC.setXYZ(n, q.r, q.gc, q.b); this.aA.setXY(n, a, q.glow); P[n] = q; n++;
    }
    P.length = n; this.m.count = n;
    if (n) { this.m.instanceMatrix.needsUpdate = true; this.aC.needsUpdate = true; this.aA.needsUpdate = true; }
  }
  clear() { this.p.length = 0; this.m.count = 0; }
}

export class WpFx extends CookFx {
  load() {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const parse = async (url) => { const j = await (await fetch(url)).json(), raw = atob(j.b64), u8 = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i); return new Promise((res, rej) => new GLTFLoader().parse(u8.buffer, '', res, rej)); };
      const g = await parse('assets/fx/fx_wpharm.glb.json');
      g.scene.traverse(o => { if (o.isMesh) this.geo[o.name] = o.geometry; });
      this.chips = [this.geo.wp_shard].filter(Boolean); this._parts();
      this.ready = true;
      this.tw = {};
      try {   // Tripo 소품(있으면): 캡슐 반쪽·앰플·플라스크 — 없으면 절차 메시
        const t = await parse('assets/fx/fx_wpharm_tripo.glb.json');
        t.scene.traverse(o => { if (o.isMesh && o.material && o.material.map) this.tw[o.name] = { geo: o.geometry, map: o.material.map }; });
      } catch (err) { console.warn('wpharmfx: no Tripo props', err && err.message); }
    })().catch(e => console.warn('wpharmfx load', e));
    return this.loading;
  }
  _parts() {
    const C = WPFX.cap, U = () => ({}), mesh = () => new THREE.ShaderMaterial({ uniforms: U(), vertexShader: PM_VS, fragmentShader: PM_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const bb = (fs, add) => new THREE.ShaderMaterial({ uniforms: U(), vertexShader: BB_VS, fragmentShader: fs, ...(add ? ADD : { transparent: true, depthWrite: false, side: THREE.DoubleSide }) });
    const quad = this.quad.clone(); quad.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(quad.attributes.position.count * 3).fill(1), 3));
    this.ps = {
      star: new Parts(this.root, this.geo.wp_star, mesh(), C.star), gran: new Parts(this.root, this.geo.wp_granule, mesh(), C.gran),
      shard: new Parts(this.root, this.geo.wp_shard, mesh(), C.shard), petal: new Parts(this.root, this.geo.wp_petal, mesh(), C.petal),
      glint: new Parts(this.root, quad, bb(GLINT_FS, true), C.glint, 'glint'), mist: new Parts(this.root, quad, bb(MIST_FS, false), C.mist, 'mist'),
    };
  }
  /** 입자 n개: kind star|gran|shard|petal|glint|mist, at = three 좌표. o: col(색 또는 배열), speed[], up[], size[], end(크기 배율), life[], g(중력), drag,
   *  ground(y), bounce, spin, glow, a, cone(방향 벡터 — 있으면 그쪽으로 퍼짐), spread(시작 반지름), fin/fo(페이드 인/아웃 비율) */
  emit(kind, at, n, o = {}) {
    const P = this.ps && this.ps[kind]; if (!P || n <= 0) return;
    if (lite() && !o.keep) n = Math.max(1, Math.round(n * WPFX.liteK));
    const sp = o.speed || [0.6, 1.8], up = o.up || [0.6, 1.8], sz = o.size || [0.05, 0.09], lf = o.life || [0.45, 0.7];
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2), v = rnd(sp[0], sp[1]), r0 = o.spread ? Math.sqrt(rand()) * o.spread : 0; let vx = Math.cos(a) * v, vz = Math.sin(a) * v;
      if (o.cone) { const c = o.cone, j = o.jit ?? 0.35; vx = (c.x + rnd(-j, j)) * v; vz = (c.z + rnd(-j, j)) * v; }
      _col.setHex(pick(o.col ?? 0xffffff)); const s = rnd(sz[0], sz[1]);
      if (!P.add({ x: at.x + Math.cos(a) * r0, y: at.y + (o.dy ? rnd(o.dy[0], o.dy[1]) : 0), z: at.z + Math.sin(a) * r0, vx, vy: rnd(up[0], up[1]) + (o.cone ? (o.cone.y || 0) * v : 0), vz,
        g: o.g ?? 6, drag: o.drag ?? 1.2, ground: o.ground ?? -1e9, bounce: o.bounce ?? 0.25, rx: rnd(0, 6.28), ry: rnd(0, 6.28), rz: rnd(0, 6.28),
        wx: rnd(-1, 1) * (o.spin ?? 8), wy: rnd(-1, 1) * (o.spin ?? 8), wz: rnd(-1, 1) * (o.spin ?? 8), s0: s, s1: s * (o.end ?? 0.4), r: _col.r, gc: _col.g, b: _col.b,
        a: o.a ?? 1, glow: o.glow ?? 0.5, t: 0, life: rnd(lf[0], lf[1]), fin: o.fin ?? 0.03, fo: o.fo ?? 0.55 })) break;
    }
  }
  update(dt) { super.update(dt); if (this.ps) for (const k in this.ps) this.ps[k].update(dt); }
  clear() { super.clear(); if (this.ps) for (const k in this.ps) this.ps[k].clear(); }

  _mat(kind) {
    const U = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v }])), C = () => new THREE.Color(1, 1, 1);
    if (kind === 'glass') return new THREE.ShaderMaterial({ uniforms: U({ uTint: C(), uRim: C(), uA: 1, uOp: 0.35, uGlow: 0 }), vertexShader: GLASS_VS, fragmentShader: GLASS_FS, transparent: true, depthWrite: false, side: THREE.FrontSide });
    if (kind === 'disc') return new THREE.ShaderMaterial({ uniforms: U({ uW: C(), uB: C(), uA: 0, uK: 0, uP: 0, uT: 0, uAdd: 0 }), vertexShader: FLAT_VS, fragmentShader: DISC_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    if (kind === 'discA') return new THREE.ShaderMaterial({ uniforms: U({ uW: C(), uB: C(), uA: 0, uK: 2, uP: 0, uT: 0, uAdd: 1 }), vertexShader: FLAT_VS, fragmentShader: DISC_FS, ...ADD });
    if (kind === 'sigil') return new THREE.ShaderMaterial({ uniforms: U({ uW: C(), uB: C(), uG: C(), uA: 0, uP: 0, uT: 0, uV: 0, uAdd: 0 }), vertexShader: FLAT_VS, fragmentShader: SIGIL_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    if (kind === 'sigilA') return new THREE.ShaderMaterial({ uniforms: U({ uW: C(), uB: C(), uG: C(), uA: 0, uP: 0, uT: 0, uV: 0, uAdd: 1 }), vertexShader: FLAT_VS, fragmentShader: SIGIL_FS, ...ADD });
    if (kind === 'pillar') return new THREE.ShaderMaterial({ uniforms: U({ uW: C(), uB: C(), uA: 0, uT: 0 }), vertexShader: PILLAR_VS, fragmentShader: PILLAR_FS, ...ADD });
    if (kind === 'helix') return new THREE.ShaderMaterial({ uniforms: U({ uW: C(), uB: C(), uA: 0, uP: 0 }), vertexShader: PILLAR_VS, fragmentShader: HELIX_FS, ...ADD });
    return super._mat(kind);
  }
  glassM(e, geo, o = {}) { const m = this._m(e, 'glass', geo, o.order ?? 3), u = m.material.uniforms; u.uTint.value.setHex(o.tint ?? WPFX.col.glass); u.uRim.value.setHex(o.rim ?? 0xffffff); u.uA.value = o.a ?? 1; u.uOp.value = o.op ?? 0.35; u.uGlow.value = o.glow ?? 0; return m; }
  /** Tripo 소품(tex, 있으면) 또는 절차 유리 메시. 둘 다 uA·uGlow 유니폼이 있음 */
  propM(e, tri, geo, o = {}) {
    const t = this.tw && this.tw[tri];
    if (t) { const m = this._m(e, 'tex', t.geo, o.order ?? 3), u = m.material.uniforms; u.uMap.value = t.map; u.uRim.value.setHex(o.rim ?? 0xffffff); u.uA.value = o.a ?? 1; u.uGlow.value = 0; u.uGain.value = o.gain ?? 1.12; m.userData.tex = true; return m; }
    const m = this.glassM(e, geo, o); m.userData.tex = false; return m;
  }
  /** 반쪽 캡슐 둘(Tripo 반쪽 또는 절차 wp_cap_half): 그룹 g 안에 넣고 크기 s — hA 는 +Y, hB 는 -Y */
  capHalves(e, g, s, oa, ob, proc = false) {
    const hA = proc ? this.glassM(e, this.geo.wp_cap_half, oa) : this.propM(e, 'tripo_cap_a', this.geo.wp_cap_half, oa), hB = proc ? this.glassM(e, this.geo.wp_cap_half, ob) : this.propM(e, 'tripo_cap_b', this.geo.wp_cap_half, ob);
    for (const [h, sg] of [[hA, 1], [hB, -1]]) { e.g.remove(h); g.add(h); h.scale.set(s, s * sg, s); }
    if (hB.userData.tex) hB.scale.y = s;   // Tripo b 반쪽은 이미 뒤집혀(+Y로 뻗게) 저장됨 — 그룹 안에서 아래로 돌림
    if (hB.userData.tex) hB.rotation.x = Math.PI;
    return [hA, hB];
  }
  disc(e, k, w, b, add = false, order = 2) { const m = this._m(e, add ? 'discA' : 'disc', this.quad, order), u = m.material.uniforms; u.uK.value = k; u.uP.value = 0; u.uT.value = 0; u.uW.value.setHex(w); u.uB.value.setHex(b); u.uA.value = 0; m.rotation.set(-Math.PI / 2, 0, 0); return m; }
  _h(e, o = {}) { e.dispose = () => this._free(e); return Object.assign(e, o); }
  /** quad (spr) stretched from A to B (three coords), facing the camera, width w */
  seg(m, A, B, w) {
    _a.subVectors(B, A); const L = _a.length() || 1e-4; _a.multiplyScalar(1 / L);
    _b.crossVectors(_a, this.toCam); if (_b.lengthSq() < 1e-8) _b.set(0, 0, 1); _b.normalize(); _c.crossVectors(_a, _b);
    _m4.makeBasis(_a, _b, _c); m.quaternion.setFromRotationMatrix(_m4); m.position.addVectors(A, B).multiplyScalar(0.5); m.scale.set(L, w, 1);
  }
  /** short flash (star) */
  flash(at, w, b, size, life = 0.14, a = 1.2) {
    const e = this._fx('flash', life, (e) => { const k = e.t / life; f.quaternion.copy(this.camQ); f.scale.setScalar(size * (0.6 + 0.6 * easeOut(k))); f.material.uniforms.uA.value = WPFX.intensity * a * (1 - smooth(0.15, 1, k)); });
    e.g.position.copy(at); const f = this.spr(e, 3, w, b, 7); return e;
  }
  /** 세운 고리(카메라를 보는 얇은 고리)가 퍼짐 — 명중 순간 */
  vring(at, size, w, b, life = 0.26, a = 1.0) {
    const e = this._fx('vring', life, (e) => { const k = e.t / life; m.quaternion.copy(this.camQ); m.scale.setScalar(size * (0.3 + 0.9 * easeOut(k))); m.material.uniforms.uA.value = WPFX.intensity * a * (1 - smooth(0.35, 1, k)); });
    e.g.position.copy(at); const m = this.spr(e, 1, w, b, 6); return e;
  }
  /** thin ground ring that grows to r (additive), life s */
  groundRing(at, r, w, b, life = 0.3, a = 1.4) {
    const e = this._fx('gring', life, (e) => { const k = e.t / life; m.material.uniforms.uP.value = 0.25 + 0.75 * easeOut(k); m.material.uniforms.uA.value = WPFX.intensity * a * (1 - smooth(0.3, 1, k)); });
    e.g.position.copy(at); e.g.position.y += 0.06; const m = this.disc(e, 2, w, b, true, 3); m.scale.set(r * 2, r * 2, 1); return e;
  }
  /** 마법진: 바닥 판(일반 블렌딩) + 같은 무늬의 가산 빛 층. r = 반지름(판정 반경 이하). o: col [안쪽 빛, 몸, 금테], v 무늬, life, draw(그려지는 초), hold, out(사라지는 초),
   *  follow() -> three 좌표, spin(회전 배율), a, y. handle {end(), setA(k)} — end() = 지금부터 out 초에 사라짐 */
  circle(at, r, o = {}) {
    const cs = o.col || [WPFX.col.white, WPFX.col.teal, WPFX.col.gold], life = o.life ?? 1.0, dr = o.draw ?? 0.18, out = o.out ?? 0.4; let endT = -1, k2 = 1;
    const e = this._fx('circle', o.hold ? 1e9 : life, (e, dt) => {
      if (endT >= 0) { endT += dt; if (endT >= out) { e.t = e.life; return; } }
      if (o.follow) { const p = o.follow(); if (p) e.g.position.set(p.x, p.y + (o.y ?? 0.05), p.z); }
      const t = e.t, fade = endT >= 0 ? 1 - endT / out : (o.hold ? 1 : 1 - smooth(life - out, life, t)), pop = 1 + 0.12 * (1 - easeOut(smooth(0, dr + 0.1, t)));
      for (const m of [base, glow]) { const u = m.material.uniforms; u.uP.value = easeOut(smooth(0, dr, t)); u.uT.value = t * (o.spin ?? 1); m.scale.set(r * 2 * pop, r * 2 * pop, 1); }
      base.material.uniforms.uA.value = (o.a ?? 0.9) * fade * k2; glow.material.uniforms.uA.value = (o.glowA ?? 0.6) * fade * k2 * (1 + 0.5 * (1 - smooth(dr, dr + 0.35, t)));
    });
    const p0 = (o.follow && o.follow()) || at || _d.set(0, 0, 0); e.g.position.set(p0.x, p0.y + (o.y ?? 0.05), p0.z);
    const mk = (kind, order) => { const m = this._m(e, kind, this.quad, order), u = m.material.uniforms; u.uW.value.setHex(cs[0]); u.uB.value.setHex(cs[1]); u.uG.value.setHex(cs[2]); u.uV.value = o.v ?? 0; u.uA.value = 0; u.uP.value = 0; m.rotation.set(-Math.PI / 2, 0, o.rot ?? 0); return m; };
    const base = mk('sigil', 1), glow = mk('sigilA', 2);
    return this._h(e, { end: () => { if (endT < 0) endT = 0; }, setA: (k) => { k2 = k; }, dispose: () => { if (endT < 0) endT = 0; } });
  }
  /** 빛기둥: 바닥 at 에서 위로, 반지름 r, 높이 h — 빠르게 솟았다가 가늘어지며 사라짐 */
  pillar(at, r, h, o = {}) {
    const life = o.life ?? 0.5, cs = o.col || [WPFX.col.white, WPFX.col.teal];
    const e = this._fx('pillar', life, (e) => { const k = e.t / life, rise = easeOut(smooth(0, 0.25, k)); m.scale.set(r * (1 - 0.55 * smooth(0.3, 1, k)), h * (0.25 + 0.75 * rise), r * (1 - 0.55 * smooth(0.3, 1, k)));
      m.material.uniforms.uA.value = (o.a ?? 1) * WPFX.intensity * smooth(0, 0.08, k) * (1 - smooth(0.45, 1, k)); m.material.uniforms.uT.value = e.t; });
    e.g.position.copy(at); const m = this._m(e, 'pillar', this.geo.wp_pillar, 5); m.material.uniforms.uW.value.setHex(cs[0]); m.material.uniforms.uB.value.setHex(cs[1]); return e;
  }
  /** 나선 띠: follow() (three, 발밑) 둘레로 아래에서 위로 감아 오름 (반지름 r, 높이 h, life) */
  helix(follow, r, h, o = {}) {
    const life = o.life ?? 0.9, cs = o.col || [WPFX.col.white, WPFX.col.gold];
    const e = this._fx('helix', life, (e) => { const p = follow(); if (p) e.g.position.copy(p); const k = e.t / life; m.material.uniforms.uP.value = easeOut(k) * 1.5; m.rotation.y = e.t * (o.spin ?? 2.5);
      m.material.uniforms.uA.value = (o.a ?? 1) * WPFX.intensity * (1 - smooth(0.7, 1, k)); });
    const m = this._m(e, 'helix', this.geo.wp_helix, 5); m.scale.set(r, h, r); m.material.uniforms.uW.value.setHex(cs[0]); m.material.uniforms.uB.value.setHex(cs[1]); const p = follow(); if (p) e.g.position.copy(p); return e;
  }
  /** 명중 한 번: 섬광 + 세운 고리 + 별·반짝이 (size = 크기 배율) */
  bang(at, cs, size = 1, o = {}) {
    this.flash(at, WPFX.col.white, cs[0], 0.9 * size, 0.13 + 0.03 * size, 1.15);
    this.vring(at, 1.1 * size, WPFX.col.white, cs[1] ?? cs[0], 0.24 + 0.04 * size, 0.9);
    this.emit('glint', at, Math.round(5 * size), { col: cs, speed: [1.2, 2.8 * size], up: [0.4, 2.0], size: [0.16, 0.3], life: [0.3, 0.55], g: 2, drag: 3 });
    if (o.stars !== 0) this.emit('star', at, Math.round((o.stars ?? 3) * size), { col: cs, speed: [1.4, 3.0], up: [1.5, 3.2], size: [0.05, 0.085], life: [0.45, 0.75], g: 8, glow: 0.7, ground: o.ground ?? at.y - 1.4, spin: 10 });
  }
  sparkle(at, n, col, o = {}) { this.emit('gran', at, n, { col, size: o.size || [0.025, 0.045], speed: o.speed || [0.8, 2.2], up: o.up || [1.0, 2.4], ground: o.ground ?? at.y - 1.2, life: [0.4, 0.6], g: 9, glow: 0.8 }); }
  shards(at, n, col, o = {}) { this.emit('shard', at, n, { col, size: o.size || [0.09, 0.17], speed: o.speed || [1.6, 3.6], up: o.up || [1.6, 3.4], ground: o.ground ?? at.y - 0.02, life: o.life || [0.55, 0.8], g: 10, glow: 0.35, bounce: 0.3, spin: 12, fo: 0.7 }); }
  mist(at, n, r, c, o = {}) { this.emit('mist', at, n, { col: c, spread: r, speed: o.speed || [0.2, 0.6], up: o.up || [0.1, 0.4], size: o.size || [0.6, 1.0], end: o.end ?? 1.7, life: o.life || [0.6, 0.9], g: 0, drag: 1.5, a: o.a ?? 0.3, fin: 0.12, fo: 0.45 }); }

  // ------------------------------------------------------------------ 반응 표식 (메시 없이 셰이더만 — 로딩 전에도 보임)
  mark(t) {
    if (!t) return null; const C = WPFX.col, M = WPFX.mark; let n = 1, shown = 0, pop = 0.25, endT = -1;
    const R = (t.radius || 0.5) + M.pad;
    const e = this._fx('mark', 1e9, (e, dt) => {
      if ((t.dead || t.removed) && endT < 0) endT = 0;
      if (endT >= 0) { endT += dt; const k = endT / 0.28; ring.scale.setScalar(R * 2 * (1 + 0.5 * easeOut(k))); ring.material.uniforms.uA.value = 1.6 * (1 - k); gold.scale.setScalar(R * 2.3 * (1 + 0.7 * easeOut(k))); gold.material.uniforms.uA.value = 0.9 * (1 - k); for (const b of beads) b.material.uniforms.uA.value *= 0.8; if (k >= 1) e.t = e.life; return; }
      pop = Math.max(0, pop - dt); shown += (n - shown) * Math.min(1, dt * 12);
      const p = P3(t.pos); e.g.position.set(p.x, p.y + 0.05, p.z);
      ring.scale.setScalar(R * 2 * (1 + 0.25 * pop / 0.25)); ring.material.uniforms.uA.value = WPFX.intensity * (0.9 + 0.25 * n + 0.15 * Math.sin(e.t * 5));
      gold.scale.setScalar(R * 2.25 * (1 + 0.3 * pop / 0.25)); gold.rotation.z = e.t * 0.8; gold.material.uniforms.uA.value = 0.25 + 0.12 * n + 0.6 * pop / 0.25;
      _a.copy(this.toCam).setY(0).normalize(); const base = Math.atan2(_a.z, _a.x);
      beads.forEach((b, i) => { const a = base + (i - 1) * 0.42, on = i < Math.round(shown); b.position.set(Math.cos(a) * R, 0.05 + (on ? 0.04 * Math.sin(e.t * 4 + i) : 0), Math.sin(a) * R); b.quaternion.copy(this.camQ);
        b.scale.setScalar(M.bead * (on ? 1.25 + 0.4 * pop / 0.25 : 0.7)); b.material.uniforms.uA.value = on ? 1.6 : 0.25; });
    });
    const ring = this.spr(e, 1, C.white, C.teal, 3); ring.rotation.set(-Math.PI / 2, 0, 0); ring.material.uniforms.uP.value = 0.2;
    const gold = this.spr(e, 1, C.gold, C.goldB, 3); gold.rotation.set(-Math.PI / 2, 0, 0);   // 바깥 얇은 금테(쌓일 때 반짝)
    const beads = [0, 1, 2].map(() => this.spr(e, 0, C.white, C.teal, 6));
    return this._h(e, { setStacks: (v) => { if (v > n) { pop = 0.25; this.emit('glint', P3(t.pos).setY((t.pos.y || 0) + 0.3), 3, { col: [C.teal, C.gold], speed: [0.3, 0.8], up: [0.8, 1.4], size: [0.12, 0.2], life: [0.3, 0.45], g: 0 }); } n = Math.max(0, Math.min(3, v)); if (n === 0 && endT < 0) endT = 0; }, end: () => { if (endT < 0) endT = 0; }, dispose: () => { if (endT < 0) endT = 0; } });   // 소비·사망·만료: 0.28초 고리가 퍼지며 사라짐
  }

  // ------------------------------------------------------------------ A1 작열·분열 캡슐
  capsule(pc, o) {
    if (!this._ok()) return null; const C = WPFX.col, K = WPFX.capsule, low = lite(), n = o.n || 5, from = P3(o.from), s = K.size, NT = low ? K.trailLite : K.trail;
    const top = () => { const t = o.tgt(), p = o.at(); return P3({ x: p.x, y: (p.y || 0) + (t ? cookTop(t) : 1.2) + 0.85, z: p.z }); };
    const midP = () => { const t = o.tgt(), p = o.at(); return P3({ x: p.x, y: (p.y || 0) + (t ? mid(t) : 0.8), z: p.z }); };
    let splitAt = null, popped = false; const gr = [], hist = [];
    // (1) 시전 준비: 발밑 붉은·금 마법진 + 손에 모이는 빛
    this.circle(null, 1.05, { follow: () => P3(pc.pos), col: [C.white, C.red, C.gold], v: 1, life: 0.75, draw: 0.16, out: 0.35, spin: 2 });
    this.flash(from, C.white, C.gold, 0.55, 0.16, 1.0); this.emit('glint', from, 6, { col: [C.gold, C.red], speed: [0.3, 0.9], up: [-0.2, 0.5], size: [0.14, 0.24], life: [0.25, 0.4], g: 0, drag: 4 });
    const e = this._fx('capsule', 2.2, (e, dt) => {
      const t = e.t, kf = clamp01(t / o.fly);
      if (t < o.fly + o.split + 0.3) {
        const end = splitAt || top(); _c.copy(from).lerp(end, 0.5); _c.y += 1.0;
        if (t <= o.fly) bez(_d, from, _c, end, easeOut(kf)); else _d.copy(splitAt || end);
        if (t > o.fly && !splitAt) splitAt = _d.clone();
        const spin = t * (8 + 30 * smooth(o.fly - 0.05, o.fly + o.split, t)), sp = smooth(o.fly + o.split * 0.6, o.fly + o.split + 0.12, t);
        g.position.copy(_d); g.rotation.set(0.9, 0, spin);
        hA.position.set(0, s * 0.02 + sp * 0.32, 0); hB.position.set(0, -s * 0.02 - sp * 0.32, 0);
        const fa = 1 - smooth(o.fly + o.split + 0.08, o.fly + o.split + 0.3, t); hA.material.uniforms.uA.value = fa; hB.material.uniforms.uA.value = fa;
        glowS.position.copy(_d); glowS.quaternion.copy(this.camQ); glowS.scale.setScalar(0.6 + 0.7 * smooth(o.fly, o.fly + o.split, t)); glowS.material.uniforms.uA.value = 0.9 * smooth(0, 0.1, t) * fa;
        if (t <= o.fly + 0.02) { hist.unshift(_d.clone()); if (hist.length > 10) hist.length = 10; this._ribbonSet(rib, hist, 0.09); rib.material.uniforms.uA.value = 1.0;
          if ((e.f = (e.f || 0) + 1) % (low ? 3 : 1) === 0) this.emit('glint', _d, 1, { col: [C.gold, C.pink], speed: [0.1, 0.4], up: [-0.3, 0.2], size: [0.12, 0.2], life: [0.25, 0.4], g: 0 }); }
        else rib.material.uniforms.uA.value = Math.max(0, rib.material.uniforms.uA.value - dt * 5);
        if (!popped && sp > 0.05) { popped = true; this.flash(_d, C.white, C.gold, 1.0, 0.16, 1.1); this.vring(_d, 1.0, C.white, C.goldB, 0.25, 0.9);
          this.emit('star', _d, 5, { col: [C.gold, C.pink, C.red], speed: [1.2, 2.4], up: [0.6, 1.8], size: [0.05, 0.08], life: [0.4, 0.6], g: 5, glow: 0.8 }); this.sfx('wp_split'); }
      } else { hA.visible = hB.visible = glowS.visible = rib.visible = false; }
      for (const q of gr) {
        if (!q.on) continue; q.t += dt; const k = clamp01(q.t / q.dur), end = q.dead ? q.endFix : midP();
        bez(_d, q.p0, q.cp, end, easeIn(k * 0.6 + 0.4 * k * k)); q.m.position.copy(_d); q.m.material.uniforms.uA.value = q.dead ? Math.max(0, 1 - (q.t - q.dt0) / 0.15) : 1;
        q.halo.position.copy(_d); q.halo.quaternion.copy(this.camQ); q.halo.scale.setScalar(0.32); q.halo.material.uniforms.uA.value = q.m.material.uniforms.uA.value * 0.8;
        q.hist.unshift(q.m.position.clone()); if (q.hist.length > NT) q.hist.length = NT;
        if (q.rib) { this._ribbonSet(q.rib, q.hist, 0.05); q.rib.material.uniforms.uA.value = q.m.material.uniforms.uA.value * 0.95; }
        if (!q.dead && !low) this.emit('glint', _d, 1, { col: [C.gold, C.ember], speed: [0.05, 0.2], up: [-0.2, 0.1], size: [0.08, 0.14], life: [0.18, 0.3], g: 0 });
        if (q.dead && q.t - q.dt0 > 0.15) { q.on = false; q.m.visible = false; q.halo.visible = false; if (q.rib) q.rib.visible = false; }
      }
    });
    const g = new THREE.Group(); e.g.add(g);
    const [hA, hB] = this.capHalves(e, g, s, { tint: C.capR, op: 0.9, glow: 0.25 }, { tint: C.capW, op: 0.85, glow: 0.15 });
    const glowS = this.spr(e, 0, C.gold, C.red, 5), rib = this._ribbon(e, 10); rib.material.uniforms.uW.value.setHex(C.gold); rib.material.uniforms.uB.value.setHex(C.red);
    for (let i = 0; i < n; i++) { const m = this.solid(e, this.geo.wp_granule, { tint: C.gold, spec: 0.8 }); m.material.uniforms.uGlow.value = 0.45; m.scale.setScalar(K.granule * (i === n - 1 ? 1.4 : 1)); m.visible = false;
      const halo = this.spr(e, 0, C.gold, C.ember, 5); halo.visible = false;
      const rib = this._ribbon(e, NT); rib.material.uniforms.uW.value.setHex(C.gold); rib.material.uniforms.uB.value.setHex(C.goldB); rib.visible = false; gr.push({ m, halo, rib, on: false, hist: [], t: 0, dur: 0.2 }); }
    return this._h(e, {
      launch: (i, dur, ok) => { const q = gr[i]; if (!q) return; q.on = true; q.t = 0; q.dur = Math.max(0.06, dur); q.m.visible = true; q.halo.visible = true; q.rib.visible = true; q.p0 = (splitAt || top()).clone(); q.hist.length = 0;
        const a = (i / n) * Math.PI * 2 + 0.6, side = this.camR; q.cp = q.p0.clone().addScaledVector(side, Math.cos(a) * K.arc).add(_a.set(0, 0.5 + Math.sin(a) * 0.6, 0)); if (!ok) q.dead = true, q.dt0 = 0, q.endFix = q.p0.clone(); },
      hit: (i, pos, ok, last) => { const q = gr[i]; if (q) { q.on = false; q.m.visible = false; q.halo.visible = false; q.rib.visible = false; }
        const p = P3({ x: pos.x, y: (pos.y || 0) + Math.min(1.2, 0.45 + (pos.r || 0.5) * 0.7), z: pos.z });
        if (ok) { if (last) this.bang(p, [C.red, C.gold, C.pink], 1.3, { ground: (pos.y || 0) + 0.02 }); else this.bang(p, [C.gold, C.ember], 0.6, { stars: 2, ground: (pos.y || 0) + 0.02 }); } },
      fizzle: (i) => { const q = gr[i]; if (q && q.on) { q.dead = true; q.dt0 = q.t; q.endFix = q.m.position.clone(); } else if (q) { q.m.visible = false; q.halo.visible = false; q.rib.visible = false; } },
      ring: (pos, r) => { const p = P3(pos);   // 붉은 반응 고리(실제 반경 r): 마법진 + 바닥 고리 둘 + 낮은 불기둥 + 불티·연기
        this.circle(p, r, { col: [C.white, C.red, C.gold], v: 0, life: 0.95, draw: 0.1, out: 0.55, spin: 3, a: 0.85 });
        this.groundRing(p, r, C.white, C.red, 0.32, 1.6); this.groundRing(p, r * 0.7, C.gold, C.goldB, 0.26, 1.0);
        this.pillar(p, Math.min(0.7, r * 0.4), 2.2, { col: [C.gold, C.red], life: 0.42, a: 0.9 });
        this.flash(_a.copy(p).setY(p.y + 0.6), C.white, C.redB, 1.5, 0.16, 1.0);
        this.emit('gran', _a.copy(p).setY(p.y + 0.2), 10, { col: [C.ember, C.gold, C.red], spread: r * 0.5, speed: [0.6, 1.6], up: [1.8, 3.4], size: [0.02, 0.035], life: [0.5, 0.8], g: 3, glow: 1.2 });
        this.emit('star', _a.copy(p).setY(p.y + 0.5), 6, { col: [C.gold, C.red, C.pink], speed: [1.6, 3.0], up: [1.6, 3.0], size: [0.06, 0.1], life: [0.5, 0.8], g: 8, glow: 0.8, ground: p.y + 0.03 });
        this.mist(p, 4, r * 0.6, [0xffb08a, 0xff9a7a], { a: 0.28, life: [0.5, 0.8] }); },
    });
  }

  // ------------------------------------------------------------------ A2 극저온 결정화
  cryo(pc, o) {
    if (!this._ok()) return null; const C = WPFX.col, K = WPFX.cryo, low = lite(), at = P3(o.at), from = P3(o.from), r = o.r;
    const t0 = o.fly, t1 = o.fly + o.film, t2 = t1 + o.rise, TB = o.burst; let burst = -1, landed = false, sig = null;
    const cr = [], NR = low ? K.rimLite : K.rim, hist = [];
    this.circle(null, 0.95, { follow: () => P3(pc.pos), col: [C.white, C.iceB, C.gold], v: 2, life: 0.7, draw: 0.16, out: 0.3, spin: 2 });
    this.emit('glint', from, 5, { col: [C.ice, C.white], speed: [0.2, 0.7], up: [0, 0.5], size: [0.14, 0.22], life: [0.25, 0.4], g: 0, drag: 4 });
    const e = this._fx('cryo', TB + 0.6, (e, dt) => {
      const t = e.t; _c.copy(from).lerp(at, 0.5); _c.y += 1.3;
      if (t <= t0) { bez(_d, from, _c, at, easeIn(t / t0)); amp.position.copy(_d); amp.rotation.set(Math.PI * smooth(0, t0, t), 0, 0);
        hist.unshift(_d.clone()); if (hist.length > 10) hist.length = 10; this._ribbonSet(rib, hist, 0.07); rib.material.uniforms.uA.value = 1;
        if (!low || (e.f = (e.f || 0) + 1) % 2) this.emit('glint', _d, 1, { col: [C.ice, C.white], speed: [0.05, 0.3], up: [-0.2, 0.2], size: [0.12, 0.2], life: [0.25, 0.4], g: 0 }); }
      else { amp.position.copy(at).setY(at.y + 0.18 * (1 - smooth(t0, t1, t))); amp.rotation.set(Math.PI, 0, 0); rib.material.uniforms.uA.value = Math.max(0, rib.material.uniforms.uA.value - dt * 6); }
      if (!landed && t > t0) { landed = true; this.flash(_a.copy(at).setY(at.y + 0.25), C.white, C.ice, 0.8, 0.14, 1.0); this.sfx('wp_frost');
        sig = this.circle(at, r, { col: [C.white, C.iceB, C.gold], v: 2, hold: true, draw: o.film + 0.1, out: 0.9, spin: 1.2, a: 0.8 });
        this.mist(at, 6, r * 0.8, [0xe8f8ff, 0xbfe4ff], { a: 0.26, up: [0.0, 0.15], life: [0.8, 1.1] });
        this.emit('glint', _a.copy(at).setY(at.y + 0.1), 8, { col: [C.ice, C.white], spread: r * 0.7, speed: [0.1, 0.4], up: [0.2, 0.7], size: [0.12, 0.22], life: [0.4, 0.7], g: 0 }); }
      amp.material.uniforms.uA.value = 1 - smooth(t1, t1 + 0.2, t);
      const fk = smooth(t0, t1, t); film.material.uniforms.uP.value = 0.05 + 0.93 * easeOut(fk); film.material.uniforms.uA.value = (burst < 0 ? 1 : 1 - smooth(TB, TB + 0.45, t)) * 0.95 * smooth(t0, t0 + 0.05, t);
      for (const c of cr) {
        const k = burst >= 0 ? 1 : smooth(c.d0, c.d0 + 0.16, t), fade = burst >= 0 ? 1 - smooth(TB + c.fo, TB + c.fo + 0.25, t) : 1;
        if (!c.born && k > 0.05) { c.born = true; if (!low) this.emit('glint', c.m.position, 1, { col: C.ice, speed: [0, 0.1], up: [0.4, 0.8], size: [0.16, 0.24], life: [0.25, 0.35], g: 0 }); }
        c.m.scale.set(c.s * 0.8, c.s * k * (c.centre ? 0.6 + 0.4 * smooth(t2 - 0.1, TB, t) : 1), c.s * 0.8); c.m.material.uniforms.uA.value = fade * (c.centre ? 1 : 0.9);
        if (c.centre) c.m.material.uniforms.uGlow.value = 0.2 + 1.2 * smooth(t2, TB, t);
      }
    });
    const amp = this.propM(e, 'tripo_ampoule', this.geo.wp_ampoule, { tint: C.ice, op: 0.55, glow: 0.3 }); amp.scale.setScalar(0.36);
    const rib = this._ribbon(e, 10); rib.material.uniforms.uW.value.setHex(C.white); rib.material.uniforms.uB.value.setHex(C.iceB);
    const film = this.disc(e, 0, C.white, C.iceB); film.position.copy(at).setY(at.y + 0.04); film.scale.set(r * 2, r * 2, 1);
    for (let i = 0; i < NR; i++) { const a = i / NR * Math.PI * 2 + 0.2, rr = r * 0.82; cr.push({ x: Math.cos(a) * rr, z: Math.sin(a) * rr, d0: t1 + 0.02 * i / NR, s: K.crystal * rnd(0.8, 1.1), fo: 0.05 }); }
    for (let i = 0; i < K.mid; i++) { const a = i / K.mid * Math.PI * 2 + 0.8, rr = r * 0.45; cr.push({ x: Math.cos(a) * rr, z: Math.sin(a) * rr, d0: t1 + (t2 - t1) * 0.45, s: K.crystal * 1.2, fo: 0.1 }); }
    cr.push({ x: 0, z: 0, d0: t1 + (t2 - t1) * 0.8, s: K.centre, centre: true, fo: 0 });
    for (const c of cr) { c.m = this.glassM(e, this.geo.wp_crystal, { tint: C.ice, op: 0.6, glow: 0.2, order: 4 }); c.m.position.set(at.x + c.x, at.y, at.z + c.z); c.m.rotation.set(rnd(-0.18, 0.18), rnd(0, 6), rnd(-0.18, 0.18)); c.m.scale.setScalar(0.001); }
    e.dispose = () => { if (sig) sig.end(); this._free(e); };
    return Object.assign(e, { burst: (hits) => {
      burst = e.t; const top = at.clone(); top.y += K.centre * 0.8; if (sig) sig.end();
      this.flash(top, C.white, C.iceB, 1.8, 0.16, 1.1); this.vring(top, 2.0, C.white, C.iceB, 0.3, 0.9);
      this.groundRing(at, r, C.white, C.iceB, 0.34, 1.5); this.groundRing(at, r * 0.65, C.white, C.sky, 0.28, 1.0);
      this.pillar(at, Math.min(0.9, r * 0.35), 3.2, { col: [C.white, C.iceB], life: 0.5 });
      this.circle(at, r, { col: [C.white, C.sky, C.gold], v: 2, life: 1.1, draw: 0.01, out: 0.9, spin: 0.6, a: 0.5, glowA: 0.5 });   // 잔광: 서리 문양이 천천히 사라짐
      this.shards(top, low ? K.shardsLite : K.shards, C.ice, { ground: at.y + 0.03 });
      this.emit('star', top, 10, { col: [C.ice, C.white, C.sky], speed: [1.6, 3.4], up: [1.4, 3.0], size: [0.05, 0.09], life: [0.5, 0.8], g: 6, glow: 0.8, ground: at.y + 0.03 });
      this.emit('glint', top, 12, { col: [C.ice, C.white], speed: [1.5, 3.5], up: [0.5, 2.5], size: [0.16, 0.3], life: [0.35, 0.6], g: 1, drag: 3 });
      this.mist(at, 6, r * 0.7, [0xeaf8ff, 0xcfe8ff], { a: 0.3, life: [0.7, 1.0] });
      for (const h of hits || []) { const p = P3({ x: h.x, y: (h.y || 0) + 0.6, z: h.z }); this.bang(p, [C.ice, C.sky], 0.7, { stars: 2, ground: (h.y || 0) + 0.02 }); if (h.frozen) this.mist(P3(h), 3, 0.5, [0xe8f8ff, 0x8ac8f0], { a: 0.4, up: [0.3, 0.6], life: [0.5, 0.7] }); }
    } });
  }

  // ------------------------------------------------------------------ A3 이온 관통술
  ion(pc, o) {
    if (!this._ok()) return null; const C = WPFX.col, K = WPFX.ion, low = lite(), n = o.n || 3, from = P3(o.from), f = new THREE.Vector3(o.f.x, 0, -o.f.z).normalize();
    const base = P3(pc.pos); base.y += K.y; let fired = -1, aligned = false;
    const orbs = [], arcs = [], bolt = [], glow = [], br = [];
    const NB = low ? K.branchesLite : K.branches;
    this.circle(null, 0.95, { follow: () => P3(pc.pos), col: [C.white, C.sky, C.gold], v: 3, life: o.strike + 0.35, draw: 0.14, out: 0.3, spin: 3 });
    const e = this._fx('ion', o.strike + 0.6, (e) => {
      const t = e.t, k = smooth(0, o.align, t);
      if (!aligned && t > o.align * 0.5) { aligned = true; this.sfx('wp_align'); }
      orbs.forEach((q, i) => { _d.copy(base).addScaledVector(f, 0.7 + i * 0.55); q.m.position.copy(q.p0).lerp(_d, easeOut(k)); q.m.position.y += Math.sin(t * 20 + i) * 0.02 * (1 - k);
        const a = fired < 0 ? smooth(0, 0.06, t) : 1 - smooth(fired, fired + 0.12, t);
        q.m.material.uniforms.uA.value = a; q.m.material.uniforms.uGlow.value = 0.3 + 0.9 * smooth(o.align, o.strike, t);
        q.h.position.copy(q.m.position); q.h.quaternion.copy(this.camQ); q.h.scale.setScalar(0.42 + 0.25 * smooth(o.align, o.strike, t) + 0.05 * Math.sin(t * 40 + i)); q.h.material.uniforms.uA.value = 0.9 * a; });
      arcs.forEach((m, i) => { if (i + 1 >= orbs.length) return; m.visible = fired < 0 && t > o.align * 0.6; this.seg(m, orbs[i].m.position, orbs[i + 1].m.position, 0.05 + 0.03 * rand()); m.material.uniforms.uA.value = 0.6 + 0.6 * rand(); });
      if (fired < 0 && t > o.align && !low && (e.f = (e.f || 0) + 1) % 2 === 0) this.emit('glint', orbs[(rand() * orbs.length) | 0].m.position, 1, { col: [C.sky, C.white], speed: [0.4, 1.0], up: [-0.4, 0.4], size: [0.1, 0.18], life: [0.12, 0.2], g: 0 });
      if (fired >= 0) { const q = 1 - smooth(fired + 0.04, fired + 0.26, t); for (const m of bolt) m.material.uniforms.uA.value = 1.6 * q; for (const m of glow) m.material.uniforms.uA.value = 0.75 * q; for (const m of br) m.material.uniforms.uA.value = 1.2 * q;
        scorch.material.uniforms.uA.value = 0.7 * (1 - smooth(fired + 0.1, fired + 0.6, t)); }
    });
    for (let i = 0; i < n; i++) { const m = this.glassM(e, this.geo.wp_granule, { tint: C.silver, op: 0.8, glow: 0.3, order: 4 }); m.scale.setScalar(0.095); orbs.push({ m, h: this.spr(e, 0, C.white, C.iceB, 5), p0: from.clone().add(_a.set(rnd(-0.25, 0.25), rnd(-0.1, 0.3), rnd(-0.25, 0.25))) }); }
    for (let i = 0; i < n - 1; i++) arcs.push(this.spr(e, 2, C.white, C.iceB, 5));
    for (let i = 0; i < K.segs; i++) { const m = this.spr(e, 2, C.white, C.white, 7); m.visible = false; bolt.push(m); const g = this.spr(e, 2, C.sky, C.iceB, 6); g.visible = false; glow.push(g); }
    for (let i = 0; i < NB * 2; i++) { const m = this.spr(e, 2, C.white, C.ice, 6); m.visible = false; br.push(m); }
    const scorch = this.spr(e, 2, C.sky, C.iceB, 2); scorch.visible = false;   // 바닥에 남는 그은 자국(판정 직선 안)
    return this._h(e, { strike: (hits) => {
      fired = e.t; const pts = [], side = _b.crossVectors(f, UP).normalize().clone();
      for (let i = 0; i <= K.segs; i++) { const k = i / K.segs, j = i === 0 || i === K.segs ? 0 : rnd(-0.22, 0.22); pts.push(base.clone().addScaledVector(f, 0.3 + k * (o.len - 0.3)).addScaledVector(side, j * o.w * 0.5).add(_a.set(0, rnd(-0.12, 0.12) * (j ? 1 : 0), 0))); }
      bolt.forEach((m, i) => { m.visible = true; this.seg(m, pts[i], pts[i + 1], 0.16); glow[i].visible = true; this.seg(glow[i], pts[i], pts[i + 1], 0.55); });
      for (let b = 0; b < NB; b++) { const i0 = 2 + Math.floor(rnd(0, K.segs - 4)), p0 = pts[i0], p1 = p0.clone().addScaledVector(side, rnd(-0.6, 0.6) * o.w).addScaledVector(f, rnd(0.2, 0.6)).add(_a.set(0, rnd(-0.2, 0.4), 0)), p2 = p1.clone().addScaledVector(side, rnd(-0.3, 0.3) * o.w).addScaledVector(f, 0.3);
        br[b * 2].visible = br[b * 2 + 1].visible = true; this.seg(br[b * 2], p0, p1, 0.08); this.seg(br[b * 2 + 1], p1, p2, 0.06); }
      const g0 = P3(pc.pos), g1 = g0.clone().addScaledVector(f, o.len); g0.y += 0.06; g1.y += 0.06; scorch.visible = true;   // 바닥 자국: 판정 직선 위에 납작하게
      _m4.makeBasis(f, _c.crossVectors(UP, f).normalize(), UP); scorch.quaternion.setFromRotationMatrix(_m4); scorch.position.addVectors(g0, g1).multiplyScalar(0.5); scorch.scale.set(o.len, o.w * 0.55, 1);
      for (let i = 1; i < pts.length - 1; i += low ? 3 : 1) this.emit('glint', pts[i], 1, { col: [C.sky, C.white, C.ice], speed: [0.6, 1.6], up: [0.2, 1.2], size: [0.14, 0.26], life: [0.25, 0.45], g: 1, drag: 3 });
      this.emit('gran', pts[(pts.length / 2) | 0], 8, { col: [C.white, C.sky], spread: o.len * 0.3, speed: [1, 2.5], up: [0.8, 2], size: [0.015, 0.03], life: [0.3, 0.5], g: 8, glow: 1.4 });
      for (const h of hits || []) this.bang(P3({ x: h.x, y: (h.y || 0) + K.y, z: h.z }), [C.sky, C.iceB, C.white], 0.9, { stars: 2, ground: (h.y || 0) + 0.02 });
      this.flash(pts[0], C.white, C.ice, 0.8, 0.12, 1.0); this.flash(pts[pts.length - 1], C.white, C.iceB, 0.7, 0.14, 0.9);
    } });
  }

  // ------------------------------------------------------------------ A4 삼상 복합제
  triad(pc, o) {   // (이름이 tri면 CookFx의 this.tri — Tripo 소품 표 — 와 겹침)
    if (!this._ok()) return null; const C = WPFX.col, from = P3(o.from), times = o.times, low = lite();
    const centre = () => { const t = o.tgt(), p = o.at(); return P3({ x: p.x, y: (p.y || 0) + (t ? mid(t) : 0.8), z: p.z }); };
    const foot = () => { const p = o.at(); return P3(p); }, tr = o.tgt(), R0 = Math.min(1.4, (tr ? tr.radius || 0.5 : 0.5) + 0.8);
    const items = []; this.sfx('wp_triad');
    const sig = this.circle(null, R0, { follow: foot, col: [C.white, C.lilac, C.gold], v: 1, hold: true, draw: 0.3, out: 0.4, spin: 1.5, a: 0.75 });
    const e = this._fx('tri', times[2] + 0.6, (e, dt) => {
      const t = e.t, c = centre(), R = this.camR;
      items.forEach((q, i) => {
        if (q.done) return;
        const slot = _d.copy(c).addScaledVector(R, q.off[0]).add(_a.set(0, q.off[1], 0));
        const dive0 = times[i] - 0.14;
        if (t < 0.32) { _c.copy(from).lerp(slot, 0.5); _c.y += 0.8; bez(q.m.position, from, _c, slot, easeOut(t / 0.32)); }
        else if (t < dive0) { q.m.position.copy(slot); q.m.position.y += Math.sin(t * 6 + i * 2) * 0.05; }
        else { const k = easeIn((t - dive0) / 0.14); q.m.position.copy(slot).lerp(c, k); }
        q.spin(q.m, t, t >= dive0);
        for (const mt of q.mats) mt.uniforms.uA.value = smooth(0, 0.08, t);
        q.trail.position.copy(q.m.position); q.trail.quaternion.copy(this.camQ); q.trail.scale.setScalar(0.42 + 0.06 * Math.sin(t * 9 + i)); q.trail.material.uniforms.uA.value = 0.8 * smooth(0, 0.1, t);
        q.hist.unshift(q.m.position.clone()); if (q.hist.length > 8) q.hist.length = 8; this._ribbonSet(q.rib, q.hist, 0.06); q.rib.material.uniforms.uA.value = 0.9 * smooth(0, 0.1, t);
        if (!low && (e.f = (e.f || 0) + 1) % 3 === i) this.emit('glint', q.m.position, 1, { col: q.col[1], speed: [0.05, 0.3], up: [-0.2, 0.3], size: [0.12, 0.2], life: [0.2, 0.35], g: 0 });
      });
      if (t < times[2]) { for (let i = 0; i < 3; i++) { const a = items[i].m.position, b = items[(i + 1) % 3].m.position; lines[i].visible = t > 0.32; this.seg(lines[i], a, b, 0.05); lines[i].material.uniforms.uA.value = 0.6 * smooth(0.32, 0.42, t) * (1 - smooth(times[0] - 0.1, times[0], t)); } }
      else for (const l of lines) l.visible = false;
    });
    const cap = new THREE.Group(); e.g.add(cap); const [hA, hB] = this.capHalves(e, cap, 0.1, { tint: C.capR, op: 0.9, glow: 0.3, order: 4 }, { tint: C.capW, op: 0.9, glow: 0.2, order: 4 });
    const rb = (w, b) => { const r = this._ribbon(e, 8); r.material.uniforms.uW.value.setHex(w); r.material.uniforms.uB.value.setHex(b); return r; };
    items.push({ m: cap, mats: [hA.material, hB.material], off: [-1.05, 0.55], col: [C.white, C.red], spin: (m, t, dive) => m.rotation.set(0.6, 0, t * (dive ? 30 : 4)), trail: this.spr(e, 0, C.gold, C.red, 5), rib: rb(C.gold, C.red), hist: [] });
    const amp = this.propM(e, 'tripo_ampoule', this.geo.wp_ampoule, { tint: C.ice, op: 0.9, glow: 0.3, order: 4 }); amp.scale.setScalar(0.22); items.push({ m: amp, mats: [amp.material], off: [1.05, 0.55], col: [C.white, C.iceB], spin: (m, t, dive) => m.rotation.set(dive ? Math.PI : 0.3 * Math.sin(t * 3), 0, dive ? 0 : 0.2), trail: this.spr(e, 0, C.ice, C.iceB, 5), rib: rb(C.white, C.iceB), hist: [] });
    const tab = this.solid(e, this.geo.wp_tablet, { tint: C.gold, spec: 0.9 }); tab.scale.setScalar(0.16); tab.material.uniforms.uGlow.value = 0.3; items.push({ m: tab, mats: [tab.material], off: [0, 1.5], col: [C.white, C.goldB], spin: (m, t, dive) => m.rotation.set(dive ? 0 : 0.5, t * 2, 0), trail: this.spr(e, 0, C.gold, C.goldB, 5), rib: rb(C.gold, C.goldB), hist: [] });
    const lines = [0, 1, 2].map(() => this.spr(e, 2, C.white, C.gold, 4));
    const done = (i) => { const q = items[i]; q.done = true; q.m.visible = false; q.trail.visible = false; q.rib.visible = false; };
    const PAL = [[C.red, C.ember, C.gold], [C.ice, C.iceB, C.white], [C.gold, C.sky, C.white]];
    e.dispose = () => { sig.end(); this._free(e); };
    return Object.assign(e, {
      hit: (i, pos, ok) => { done(i); const p = P3({ x: pos.x, y: (pos.y || 0) + Math.min(1.2, 0.45 + (pos.r || 0.5) * 0.7), z: pos.z }); if (ok) { this.bang(p, PAL[i], 1.0, { stars: 3, ground: (pos.y || 0) + 0.02 });
        if (i === 0) this.emit('gran', p, 6, { col: [C.ember, C.gold], speed: [0.6, 1.4], up: [1.2, 2.4], size: [0.02, 0.03], life: [0.4, 0.6], g: 3, glow: 1.2 });
        else if (i === 1) this.shards(p, 5, C.ice, { ground: (pos.y || 0) + 0.02, size: [0.07, 0.12] });
        else this.emit('glint', p, 6, { col: [C.sky, C.white], speed: [1.5, 3], up: [-0.5, 1], size: [0.12, 0.22], life: [0.15, 0.3], g: 0 }); } },
      fizzle: (i) => { const q = items[i]; if (q && !q.done) { this.flash(q.m.position.clone(), C.white, C.silver, 0.3, 0.1, 0.6); done(i); } if (items.every(x => x.done)) sig.end(); },
      compound: (pos, r) => { const p = P3(pos); sig.end();   // 복합 반응: 세 색 마법진 + 금 빛기둥 + 세 색 꽃잎·별
        this.circle(p, r, { col: [C.white, C.lilac, C.gold], v: 0, life: 1.1, draw: 0.1, out: 0.7, spin: 3, a: 0.85 });
        this.groundRing(p, r, C.white, C.gold, 0.36, 1.6); this.groundRing(p, r * 0.7, C.white, C.red, 0.3, 0.9); this.groundRing(p, r * 0.45, C.white, C.iceB, 0.26, 0.9);
        this.pillar(p, Math.min(0.8, r * 0.35), 3.0, { col: [C.white, C.gold], life: 0.55 });
        this.flash(_a.copy(p).setY(p.y + 0.8), C.white, C.gold, 1.8, 0.16, 1.0); this.vring(_a.copy(p).setY(p.y + 0.8), 2.2, C.white, C.lilac, 0.32, 0.9);
        const up = _a.copy(p).setY(p.y + 0.7);
        this.emit('petal', up, 12, { col: [C.pink, C.ice, C.gold, C.lilac], speed: [1.2, 2.6], up: [1.6, 3.0], size: [0.12, 0.2], end: 0.8, life: [0.7, 1.0], g: 3, drag: 1.5, glow: 0.4, spin: 6, ground: p.y + 0.03 });
        this.emit('star', up, 8, { col: [C.red, C.ice, C.gold], speed: [1.6, 3.2], up: [1.6, 3.2], size: [0.06, 0.1], life: [0.5, 0.8], g: 7, glow: 0.8, ground: p.y + 0.03 });
        this.shards(up, 6, C.gold); },
      end: () => { sig.end(); },
    });
  }

  // ------------------------------------------------------------------ A5 대형 캡슐 붕괴 (궁극기)
  collapse(pc, o) {
    if (!this._ok()) return null; const C = WPFX.col, K = WPFX.collapse, low = lite(), at = P3(o.at), T = o.contact, S = K.size, H = K.h, NG = low ? K.granulesLite : K.granules;
    const gr = []; let hit = -1;
    // (1) 시전 준비: 조준점에 큰 마법진(실제 반경 o.r) + 안쪽에서 반대로 도는 작은 진, 시전자 발밑 진, 응축음
    const big = this.circle(at, o.r, { col: [C.white, C.teal, C.gold], v: 0, hold: true, draw: 0.5, out: 1.1, spin: 1.2, a: 0.8 });
    const inner = this.circle(at, o.r * 0.42, { col: [C.white, C.ice, C.gold], v: 2, hold: true, draw: 0.35, out: 0.6, spin: -2.4, a: 0.7, rot: 0.5 });
    this.circle(null, 1.1, { follow: () => P3(pc.pos), col: [C.white, C.teal, C.gold], v: 0, life: 1.1, draw: 0.2, out: 0.4, spin: 2.5 });
    this.helix(() => P3(pc.pos), 0.7, 2.0, { col: [C.white, C.teal], life: 0.9, spin: 3 });
    this.sfx('wp_charge');
    const e = this._fx('collapse', T + 0.9, (e, dt) => {
      const t = e.t, appear = smooth(0, 0.28, t), open = smooth(0.5, 0.74, t), fade = hit < 0 ? 1 : 1 - smooth(hit, hit + 0.4, t);
      g.position.copy(at).setY(at.y + H); g.rotation.set(0, t * 0.6, Math.PI / 2); g.scale.setScalar(0.6 + 0.4 * appear);
      hA.position.set(0, 0.06 + open * 1.1, 0); hB.position.set(0, -0.06 - open * 1.1, 0); hA.rotation.z = open * 0.5; hB.rotation.z = -open * 0.5;
      for (const h of [hA, hB]) h.material.uniforms.uA.value = appear * fade * 0.85;
      aura.position.copy(at).setY(at.y + H); aura.quaternion.copy(this.camQ); aura.scale.setScalar(2.4 + 0.3 * Math.sin(t * 6)); aura.material.uniforms.uA.value = 0.5 * appear * (1 - open) * fade;
      // granules spiral into the core (0.1 .. 0.5)
      const ck = smooth(0.1, 0.52, t);
      gr.forEach((q, i) => { const k = smooth(q.d, q.d + 0.32, t), a = q.a + t * 6 * (1 - k), rr = (1 - k) * 1.5; q.m.position.set(at.x + Math.cos(a) * rr, at.y + H + Math.sin(a * 1.3) * 0.25 * (1 - k), at.z + Math.sin(a) * rr); q.m.material.uniforms.uA.value = (1 - smooth(q.d + 0.28, q.d + 0.34, t)) * smooth(0.05, 0.12, t);
        q.hist.unshift(q.m.position.clone()); if (q.hist.length > 7) q.hist.length = 7; this._ribbonSet(q.rib, q.hist, 0.04); q.rib.material.uniforms.uA.value = q.m.material.uniforms.uA.value; });
      // core: forms, then falls after the halves open (accelerating), stops on the ground at T
      const fall = easeIn(smooth(0.74, T, t)), cy = at.y + H - (H - 0.35) * fall;
      core.position.set(at.x, cy, at.z); core.scale.setScalar(0.12 + 0.24 * ck); core.visible = hit < 0; core.material.uniforms.uGlow.value = 0.2 + 0.4 * ck;   // 핵의 모양이 보이게(하얗게 날리지 않게)
      halo.position.copy(core.position); halo.quaternion.copy(this.camQ); halo.scale.setScalar(0.8 + 0.7 * ck); halo.material.uniforms.uA.value = hit < 0 ? 0.6 * ck : 0;
      if (hit < 0 && t > 0.3 && t < 0.74 && !low && (e.f = (e.f || 0) + 1) % 2 === 0) this.emit('glint', core.position, 1, { col: [C.ice, C.gold, C.white], spread: 1.2, speed: [0.05, 0.2], up: [-0.2, 0.2], size: [0.14, 0.24], life: [0.2, 0.35], g: 0 });
      if (hit < 0 && t > 0.74) { this.seg(streak, core.position, _a.copy(core.position).setY(Math.min(at.y + H, core.position.y + 1.4 * fall + 0.2)), 0.3); streak.visible = true; streak.material.uniforms.uA.value = 1.0; } else streak.visible = false;
      for (const s of spikes) { const k = hit < 0 ? 0 : smooth(hit, hit + 0.1, t) * (1 - smooth(hit + 0.5, hit + 0.8, t)); s.m.scale.set(s.s * 0.8, s.s * k, s.s * 0.8); s.m.material.uniforms.uA.value = k; }
    });
    const g = new THREE.Group(); e.g.add(g);
    const [hA, hB] = this.capHalves(e, g, S, { tint: C.glass, op: 0.18, rim: C.ice, glow: 0.05, a: 0.85 }, { tint: C.glass, op: 0.18, rim: C.ice, glow: 0.05, a: 0.85 }, true);   // 거대한 캡슐은 맑은 유리(적을 가리지 않게)
    const aura = this.spr(e, 0, C.ice, C.teal, 2);
    for (let i = 0; i < NG; i++) { const m = this.solid(e, this.geo.wp_granule, { tint: i % 3 ? C.ice : C.gold, spec: 0.8 }); m.material.uniforms.uGlow.value = 0.5; m.scale.setScalar(0.075);
      const rib = this._ribbon(e, 7); rib.material.uniforms.uW.value.setHex(i % 3 ? C.white : C.gold); rib.material.uniforms.uB.value.setHex(i % 3 ? C.iceB : C.goldB); gr.push({ m, rib, hist: [], a: i / NG * Math.PI * 2, d: 0.08 + 0.3 * (i / NG) }); }
    const core = this.solid(e, this.geo.wp_granule, { tint: 0x7ec8ff, spec: 1 }), halo = this.spr(e, 0, C.white, C.iceB, 5), streak = this.spr(e, 2, C.white, C.ice, 5);
    const spikes = []; const NS = low ? K.spikesLite : K.spikes;
    for (let i = 0; i < NS; i++) { const a = i / NS * Math.PI * 2 + 0.3, rr = o.r * 0.62; const m = this.glassM(e, this.geo.wp_crystal, { tint: C.ice, op: 0.6, glow: 0.3, order: 4 }); m.position.set(at.x + Math.cos(a) * rr, at.y, at.z + Math.sin(a) * rr); m.rotation.set(Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35); m.scale.setScalar(0.001); spikes.push({ m, s: rnd(0.6, 0.95) }); }
    e.dispose = () => { big.end(); inner.end(); this._free(e); };
    return Object.assign(e, { impact: () => {
      hit = e.t; const p = at.clone(); big.end(); inner.end();
      const w = this._fx('shock', 0.5, (w) => { const k = w.t / 0.5; m.material.uniforms.uP.value = 0.1 + 0.9 * easeOut(k); m.material.uniforms.uA.value = 1.8 * (1 - smooth(0.4, 1, k)); m2.material.uniforms.uP.value = 0.05 + 0.75 * easeOut(k); m2.material.uniforms.uA.value = 1.0 * (1 - k); });
      w.g.position.copy(p).setY(p.y + 0.07); const m = this.disc(w, 2, C.white, C.iceB, true, 3); m.scale.set(o.r * 2, o.r * 2, 1); const m2 = this.disc(w, 2, C.white, C.teal, true, 3); m2.scale.set(o.r * 2, o.r * 2, 1);
      this.groundRing(p, o.r * 0.55, C.gold, C.goldB, 0.4, 1.1);
      this.circle(p, o.r, { col: [C.white, C.ice, C.gold], v: 0, life: 1.3, draw: 0.01, out: 1.1, spin: 0.8, a: 0.55, glowA: 0.7 });   // 잔광
      this.pillar(p, Math.min(1.5, o.r * 0.38), 4.5, { col: [C.white, C.teal], life: 0.6 });
      this.flash(_a.copy(p).setY(p.y + 0.5), C.white, C.iceB, 2.4, 0.16, 1.0); this.vring(_a.copy(p).setY(p.y + 0.9), 3.2, C.white, C.teal, 0.36, 0.9);
      const up = _a.copy(p).setY(p.y + 0.4);
      this.shards(up, low ? K.shardsLite : K.shards, C.ice, { speed: [2.5, 5], up: [2, 4], ground: p.y + 0.02, size: [0.1, 0.22] });
      this.emit('star', up, 16, { col: [C.ice, C.gold, C.white, C.teal], speed: [2.0, 4.5], up: [2.0, 4.2], size: [0.07, 0.12], life: [0.6, 1.0], g: 7, glow: 0.8, ground: p.y + 0.03, bounce: 0.35 });
      this.emit('glint', up, 18, { col: [C.ice, C.white, C.gold], spread: o.r * 0.4, speed: [1.5, 4], up: [0.8, 3], size: [0.2, 0.36], life: [0.4, 0.7], g: 1, drag: 2.5 });
      this.mist(p, 8, o.r * 0.7, [0xeaf6ff, 0xb8d8ee], { a: 0.32, life: [0.7, 1.0] });
    } });
  }

  // ------------------------------------------------------------------ B1 촉매 활성화
  catalyst(pc, o) {
    if (!this._ok()) return null; const C = WPFX.col, n = o.n || 3, amps = []; let endT = -1;
    const feet = () => (pc.dead ? null : P3(pc.pos));
    this.circle(null, 1.15, { follow: feet, col: [C.white, C.goldB, C.gold], v: 0, life: 1.3, draw: 0.22, out: 0.5, spin: 2 });
    this.helix(feet, 0.62, 2.0, { col: [C.white, C.gold], life: 0.95, spin: 3.5 }); this.pillar(P3(pc.pos), 0.65, 2.4, { col: [C.gold, C.goldB], life: 0.55, a: 0.7 });
    this.emit('glint', P3(pc.pos).setY((pc.pos.y || 0) + 0.3), 10, { col: [C.gold, C.white], spread: 0.6, speed: [0.1, 0.4], up: [1.2, 2.4], size: [0.14, 0.24], life: [0.5, 0.8], g: 0 });
    this.sfx('wp_catalyst');
    const e = this._fx('catalyst', (o.dur || 12) + 0.4, (e, dt) => {
      if (pc.dead) e.t = e.life;
      if (endT >= 0) endT += dt;
      const p = P3(pc.pos), f = _a.set(pc.facing.x, 0, -pc.facing.z).normalize(), side = _b.crossVectors(f, UP).normalize();
      amps.forEach((q, i) => {
        if (q.gone) return; const a = (i - (n - 1) / 2) * 0.55;
        q.m.position.copy(p).addScaledVector(f, -0.32).addScaledVector(side, Math.sin(a) * 0.55 + Math.sin(e.t * 2 + i) * 0.03); q.m.position.y += 1.62 + Math.cos(a) * 0.15 + Math.sin(e.t * 2.4 + i) * 0.04;
        q.m.rotation.set(0.2, e.t * 1.5 + i, a * 0.6); const fade = endT >= 0 ? 1 - smooth(0, 0.3, endT) : smooth(0, 0.2, e.t);
        q.m.material.uniforms.uA.value = fade; q.m.material.uniforms.uGlow.value = 0.25 + (q.lit ? 1.6 * (1 - smooth(0, 0.35, e.t - q.lit)) : 0);
        q.h.position.copy(q.m.position).setY(q.m.position.y + 0.1); q.h.quaternion.copy(this.camQ); q.h.scale.setScalar(0.34 + 0.04 * Math.sin(e.t * 5 + i)); q.h.material.uniforms.uA.value = 0.55 * fade;
        if (q.lit && e.t - q.lit > 0.35) { q.gone = true; q.m.visible = false; q.h.visible = false; }
      });
      if ((e.f = (e.f || 0) + 1) % (lite() ? 24 : 10) === 0 && endT < 0) { const q = amps.find(x => !x.gone); if (q) this.emit('glint', q.m.position, 1, { col: C.gold, speed: [0.05, 0.2], up: [0.2, 0.5], size: [0.1, 0.16], life: [0.4, 0.6], g: 0 }); }
      if (endT > 0.35) e.t = e.life;
    });
    for (let i = 0; i < n; i++) { const m = this.glassM(e, this.geo.wp_ampoule, { tint: C.gold, op: 0.75, glow: 0.25, order: 4 }); m.scale.setScalar(0.14); amps.push({ m, h: this.spr(e, 0, C.gold, C.goldB, 5), lit: 0, gone: false }); }
    return this._h(e, {
      fire: (left) => { const q = amps[n - 1 - left]; if (!q) return; q.lit = e.t; const p = q.m.position.clone();
        this.flash(p, C.white, C.gold, 0.7, 0.16, 1.2); this.vring(p, 0.9, C.white, C.gold, 0.25, 0.9);
        this.emit('star', p, 4, { col: [C.gold, C.white], speed: [1, 2], up: [0.4, 1.4], size: [0.04, 0.07], life: [0.35, 0.55], g: 5, glow: 0.9 });
        this.emit('gran', p, 7, { col: C.gold, size: [0.02, 0.04], speed: [1.5, 3], up: [0.2, 1.2], life: [0.35, 0.5], g: 6, glow: 1.0 }); this.sfx('wp_spark'); },
      spent: () => { endT = 0; },
    });
  }

  // ------------------------------------------------------------------ B2 정밀 표적 전달
  carrier(pc, o) {
    if (!this._ok() || !o.tgt) return null; const C = WPFX.col, t = o.tgt, from = P3(o.from); let pulse = 0, endT = -1, latched = false; const hist = [];
    this.sfx('wp_carrier'); this.flash(from, C.white, C.teal, 0.5, 0.14, 1.0);
    const tr = (t.radius || 0.5) + 0.62;
    const sig = this.circle(null, Math.min(1.3, tr), { follow: () => (t.dead || t.removed ? null : P3(t.pos)), col: [C.white, C.teal, C.gold], v: 3, hold: true, draw: 0.3, out: 0.3, spin: 1.2, a: 0 });
    const e = this._fx('carrier', 1e9, (e, dt) => {
      if (endT >= 0) { endT += dt; if (endT > 0.25) e.t = e.life; }
      if (t.dead || t.removed) { if (endT < 0) endT = 0; }
      pulse = Math.max(0, pulse - dt);
      const tp = P3(t.pos), R = (t.radius || 0.5) + 0.62, k = clamp01(e.t / o.fly), a = e.t * 1.2;
      _d.copy(tp).add(_a.set(Math.cos(a) * ((t.radius || 0.5) + 0.12), mid(t) + 0.15, Math.sin(a) * ((t.radius || 0.5) + 0.12)));
      if (k < 1) { _c.copy(from).lerp(_d, 0.5); _c.y += 0.9; bez(sph.position, from, _c, _d, easeOut(k)); } else sph.position.copy(_d);
      if (k >= 1 && !latched) { latched = true; this.flash(sph.position, C.white, C.teal, 0.8, 0.16, 1.1); this.vring(sph.position, 1.2, C.white, C.teal, 0.28, 0.9);
        this.emit('glint', sph.position, 6, { col: [C.teal, C.white, C.gold], speed: [0.8, 1.8], up: [0, 1], size: [0.14, 0.24], life: [0.3, 0.5], g: 0, drag: 3 }); }
      const fade = endT >= 0 ? 1 - endT / 0.25 : 1;
      hist.unshift(sph.position.clone()); if (hist.length > 9) hist.length = 9; this._ribbonSet(rib, hist, 0.05); rib.material.uniforms.uA.value = (k < 1 ? 1 : 0.45) * fade;
      sph.material.uniforms.uA.value = fade; sph.material.uniforms.uGlow.value = 0.2 + 0.8 * pulse / 0.3;
      core.position.copy(sph.position); core.quaternion.copy(this.camQ); core.scale.setScalar(0.24 + 0.15 * Math.sin(e.t * 4)); core.material.uniforms.uA.value = 0.9 * fade;
      ring.position.copy(tp).setY(tp.y + 0.07); ring.scale.setScalar(R * 2 * (1 + 0.15 * pulse / 0.3)); ring.material.uniforms.uA.value = (k >= 1 ? 0.9 : 0) * fade; ring.rotation.set(-Math.PI / 2, 0, e.t * 0.5);
      sig.setA((k >= 1 ? 0.55 + 0.4 * pulse / 0.3 : 0) * fade);
    });
    const sph = this.glassM(e, this.geo.wp_granule, { tint: C.teal, op: 0.4, rim: C.white, glow: 0.2, order: 4 }); sph.scale.setScalar(0.14);
    const core = this.spr(e, 0, C.white, C.teal, 5), rib = this._ribbon(e, 9); rib.material.uniforms.uW.value.setHex(C.white); rib.material.uniforms.uB.value.setHex(C.teal);
    const ring = this.spr(e, 1, C.white, C.white, 3); ring.material.uniforms.uP.value = 0;
    const end = () => { if (endT < 0) endT = 0; sig.end(); };
    e.dispose = end;
    return Object.assign(e, { refresh: () => { pulse = 0.3; this.vring(sph.position, 1.0, C.white, C.teal, 0.25, 0.8); } });
  }

  // ------------------------------------------------------------------ B3 연쇄 용출
  chain(pc, o) {
    if (!this._ok()) return null; const C = WPFX.col, low = lite();
    const e = this._fx('chain', 6, () => {}); const self = this;
    const stream = (A, getB, dur, n, arc) => {
      const parts = [], hist = []; const s = this._fx('stream', dur + 0.05, (s) => { const k = clamp01(s.t / dur);
        const B = getB(); parts.forEach((q, i) => { const kk = clamp01(k * 1.15 - i * 0.05); _c.copy(A).lerp(B, 0.5).add(q.off); bez(q.m.position, A, _c, B, easeIn(kk * 0.5 + 0.5 * kk * kk)); q.m.material.uniforms.uA.value = 1 - smooth(0.92, 1, kk); });
        hist.unshift(parts[0].m.position.clone()); if (hist.length > 8) hist.length = 8; self._ribbonSet(rib, hist, 0.06); rib.material.uniforms.uA.value = 1 - smooth(0.85, 1, k);
        if (!low) self.emit('glint', parts[0].m.position, 1, { col: [C.lime, C.teal], speed: [0.05, 0.2], up: [-0.1, 0.2], size: [0.1, 0.16], life: [0.18, 0.3], g: 0 }); });
      for (let i = 0; i < n; i++) { const m = self.solid(s, self.geo.wp_granule, { tint: i ? C.teal : C.lime, spec: 0.6 }); m.material.uniforms.uGlow.value = 0.8; m.scale.setScalar(i ? 0.045 : 0.06); parts.push({ m, off: new THREE.Vector3(rnd(-arc, arc), arc * rnd(0.8, 1.5), rnd(-arc, arc)) }); }
      parts[0].off.multiplyScalar(0.6);
      const rib = self._ribbon(s, 8); rib.material.uniforms.uW.value.setHex(C.lime); rib.material.uniforms.uB.value.setHex(C.tealB);
    };
    if (o.tgt) { const t = o.tgt; stream(P3(o.from), () => P3({ x: t.pos.x, y: (t.pos.y || 0) + mid(t), z: t.pos.z }), o.first, low ? 2 : 4, 0.5); }
    return this._h(e, {
      burst: (depth, pos, n, r) => { const p = P3({ x: pos.x, y: (pos.y || 0) + Math.min(1.2, 0.45 + (pos.r || 0.5) * 0.7), z: pos.z }), g = P3(pos);
        this.circle(g, r, { col: [C.white, n > 0 ? 0x3ad8a0 : C.silver, C.gold], v: 1, life: 0.75, draw: 0.08, out: 0.45, spin: 3, a: 0.7 + 0.1 * n });
        this.bang(p, n > 0 ? [C.lime, C.teal, C.white] : [C.silver, C.white], 0.8 + 0.25 * n, { stars: 2 + n, ground: (pos.y || 0) + 0.02 }); this.groundRing(g, r, C.white, C.teal, 0.3, 0.6 + 0.35 * n);
        this.emit('gran', p, 4 + 3 * n, { col: [C.lime, C.teal, C.mint], speed: [0.8, 2.2], up: [1.4, 3.0], size: [0.03, 0.06], end: 1.2, life: [0.45, 0.7], g: 8, glow: 0.6, ground: g.y + 0.02, bounce: 0.1 });
        if (n > 0) this.mist(g, 2 + n, r * 0.5, [0xb8ffd8, 0x6ad8b0], { a: 0.25, life: [0.5, 0.8] });
        this.sfx('wp_chain'); },
      link: (depth, from, to, hop) => { stream(P3({ x: from.x, y: (from.y || 0) + 0.9, z: from.z }), () => P3({ x: to.pos.x, y: (to.pos.y || 0) + mid(to), z: to.pos.z }), hop, low ? 2 : 3, 0.9); },
      fizzle: () => {},
    });
  }

  // ------------------------------------------------------------------ B4 서방형 미립자 지대
  zone(pos, o) {
    if (!this._ok()) return null; const C = WPFX.col, low = lite(), N = low ? WPFX.zone.granulesLite : WPFX.zone.granules, at = P3(pos), r = o.r; let left = 1, pulse = 0, endT = -1;
    const gr = [];
    const sig = this.circle(at, r, { col: [C.white, C.tealB, C.gold], v: 2, hold: true, draw: 0.25, out: 0.3, spin: 0.6, a: 0.45, glowA: 0.35 });
    const e = this._fx('zone', 1e9, (e, dt) => {
      if (endT >= 0) { endT += dt; if (endT > 0.3) e.t = e.life; }
      pulse = Math.max(0, pulse - dt); const fade = (endT >= 0 ? 1 - endT / 0.3 : 1) * smooth(0, 0.15, e.t);
      floor.material.uniforms.uA.value = fade * (0.55 + 0.45 * left); floor.material.uniforms.uT.value = e.t; sig.setA(0.4 + 0.6 * left + 0.6 * pulse / 0.3);
      const vis = Math.ceil(N * left - 1e-6);
      gr.forEach((q, i) => { q.m.visible = i < vis; q.m.position.set(at.x + q.x, at.y + 0.08 + 0.06 * Math.abs(Math.sin(e.t * 2.2 + q.ph)) + 0.25 * pulse / 0.3 * q.j, at.z + q.z); q.m.material.uniforms.uA.value = fade; q.m.material.uniforms.uGlow.value = 0.5 + 1.5 * pulse / 0.3; });
      if (endT < 0 && (e.f = (e.f || 0) + 1) % (low ? 20 : 8) === 0) this.emit('gran', _a.copy(at).setY(at.y + 0.08), 1, { col: [C.teal, C.mint], spread: r * 0.8, speed: [0, 0.1], up: [0.5, 0.9], size: [0.02, 0.035], end: 1.3, life: [0.6, 0.9], g: 0, glow: 0.7, fo: 0.5 });
    });
    const floor = this.disc(e, 1, C.white, C.tealB); floor.position.copy(at).setY(at.y + 0.03); floor.scale.set(r * 2, r * 2, 1);
    for (let i = 0; i < N; i++) { const a = rnd(0, Math.PI * 2), rr = Math.sqrt(rand()) * r * 0.85, m = this.solid(e, this.geo.wp_granule, { tint: i % 3 ? C.teal : C.gold, spec: 0.6 }); m.scale.setScalar(0.04 + 0.02 * rand()); gr.push({ m, x: Math.cos(a) * rr, z: Math.sin(a) * rr, ph: rnd(0, 6), j: rnd(0.5, 1) }); }
    const end = () => { if (endT < 0) endT = 0; sig.end(); };
    e.dispose = end;
    return Object.assign(e, { setLeft: (k) => { left = clamp01(k); }, pulse: () => { pulse = 0.3; this.groundRing(at, r, C.white, C.teal, 0.3, 0.6); this.emit('glint', _a.copy(at).setY(at.y + 0.2), 4, { col: [C.teal, C.white], spread: r * 0.7, speed: [0.1, 0.3], up: [0.4, 0.9], size: [0.12, 0.2], life: [0.3, 0.45], g: 0 }); }, refresh: () => { left = 1; pulse = 0.3; }, end });
  }

  // ------------------------------------------------------------------ B5 임계 농도 (궁극기)
  critical(pos, o) {
    if (!this._ok()) return null; const C = WPFX.col, low = lite(), at = P3(pos), H = 2.0; let size = 0.35, used = 0, cap = 9, burst = -1; const beams = [];
    const pcp = window.G && window.G.player, feet = () => (pcp && !pcp.dead ? P3(pcp.pos) : at);
    const big = this.circle(at, o.r, { col: [C.white, C.sky, C.gold], v: 0, hold: true, draw: o.snap + 0.25, out: 1.0, spin: 1.0, a: 0.7 });
    const inner = this.circle(at, Math.min(1.6, o.r * 0.28), { col: [C.white, C.ice, C.gold], v: 3, hold: true, draw: 0.3, out: 0.5, spin: -3, a: 0.8 });
    this.helix(feet, 0.75, 2.6, { col: [C.white, C.sky], life: 1.1, spin: 3 }); this.sfx('wp_charge');
    const e = this._fx('critical', o.burst + 0.8, (e, dt) => {
      const t = e.t, appear = smooth(0, 0.25, t), fade = burst < 0 ? 1 : 1 - smooth(burst, burst + 0.2, t);
      sph.position.copy(at).setY(at.y + H); sph.scale.setScalar((0.55 + 0.25 * size) * (0.7 + 0.3 * appear) * (burst < 0 ? 1 : 1 + 0.6 * smooth(burst, burst + 0.2, t))); sph.material.uniforms.uA.value = appear * fade;
      const grow = smooth(o.snap + 0.05, o.burst - 0.18, t), sz = 0.2 + size * grow;
      cr.position.copy(at).setY(at.y + H - sz * 0.45); cr.scale.set(sz * 0.9, sz, sz * 0.9); cr.rotation.y = t * 1.5; cr.material.uniforms.uA.value = fade * smooth(o.snap, o.snap + 0.1, t); cr.material.uniforms.uGlow.value = 0.3 + 1.4 * grow;
      halo.position.copy(sph.position); halo.quaternion.copy(this.camQ); halo.scale.setScalar(1.6 + 1.0 * grow + 0.1 * Math.sin(t * 8)); halo.material.uniforms.uA.value = 0.55 * appear * fade;
      for (const b of beams) { const k = clamp01((t - b.t0) / 0.3); _d.copy(b.p).lerp(sph.position, easeOut(k)); this.seg(b.m, b.p, _d, 0.09); this.seg(b.g, b.p, _d, 0.32); const a = (1 - smooth(0.6, 1, (t - b.t0) / 0.5)) * (burst < 0 ? 1 : 0); b.m.material.uniforms.uA.value = 1.3 * a; b.g.material.uniforms.uA.value = 0.6 * a;
        if (a > 0.1 && k < 1 && !low) this.emit('glint', _d, 1, { col: [C.teal, C.white], speed: [0, 0.1], up: [0, 0.1], size: [0.12, 0.2], life: [0.15, 0.25], g: 0 }); }
    });
    const sph = this.glassM(e, this.geo.wp_sphere, { tint: C.glass, op: 0.06, rim: C.ice, order: 4 });
    const cr = this.glassM(e, this.geo.wp_crystal, { tint: C.ice, op: 0.75, glow: 0.3, order: 5 }), halo = this.spr(e, 0, C.ice, C.teal, 3);
    e.dispose = () => { big.end(); inner.end(); this._free(e); };
    return Object.assign(e, {
      charge: (src, u, c) => { used = u; cap = c || 9; size = 0.35 + 0.95 * used / cap; const B = low ? 6 : 12;
        src.slice(0, B).forEach((s) => { const m = this.spr(e, 2, C.white, C.teal, 5), g = this.spr(e, 2, C.teal, C.tealB, 4); beams.push({ m, g, p: P3({ x: s.x, y: (s.y || 0) + s.h, z: s.z }), t0: e.t }); });
        for (const s of src) { const p = P3({ x: s.x, y: (s.y || 0) + s.h, z: s.z }); this.flash(p, C.white, C.teal, 0.5 + 0.14 * s.n, 0.14, 1.0); this.vring(p, 0.8 + 0.15 * s.n, C.white, C.teal, 0.25, 0.8); } },
      burst: (u) => { burst = e.t; const top = at.clone().setY(at.y + H), R = o.r; big.end(); inner.end();
        const w = this._fx('shock', 0.5, (w) => { const k = w.t / 0.5; m.material.uniforms.uP.value = 0.08 + 0.92 * easeOut(k); m.material.uniforms.uA.value = (1.4 + 0.08 * u) * (1 - smooth(0.4, 1, k)); m2.material.uniforms.uP.value = 0.05 + 0.6 * easeOut(k); m2.material.uniforms.uA.value = 1.0 * (1 - k); });
        w.g.position.copy(at).setY(at.y + 0.08); const m = this.disc(w, 2, C.white, C.iceB, true, 3); m.scale.set(R * 2, R * 2, 1); const m2 = this.disc(w, 2, C.white, C.gold, true, 3); m2.scale.set(R * 2, R * 2, 1);
        this.circle(at, R, { col: [C.white, C.ice, C.gold], v: 0, life: 1.3, draw: 0.01, out: 1.1, spin: 0.7, a: 0.5, glowA: 0.6 });
        this.pillar(at, 1.0 + 0.04 * u, 5.0, { col: [C.white, C.sky], life: 0.6 });
        this.flash(top, C.white, C.iceB, 1.5 + 0.12 * u, 0.18, 0.95); this.vring(top, 2.6 + 0.15 * u, C.white, C.sky, 0.36, 0.9);
        this.shards(top, (low ? 4 : 8) + Math.min(8, u), C.ice, { ground: at.y + 0.02, speed: [2, 4.5] });
        this.emit('star', top, 8 + u, { col: [C.ice, C.gold, C.white], speed: [2, 4.5], up: [1, 3.5], size: [0.07, 0.12], life: [0.6, 1.0], g: 6, glow: 0.8, ground: at.y + 0.03, bounce: 0.35 });
        this.emit('glint', top, 14 + u, { col: [C.ice, C.white, C.gold], speed: [2, 4.5], up: [-1, 2], size: [0.2, 0.34], life: [0.35, 0.6], g: 0, drag: 2 });
        this.mist(at, 6, R * 0.5, [0xeaf6ff, 0xb8d8ee], { a: 0.28, life: [0.7, 1.0] }); },
    });
  }

  // ------------------------------------------------------------------ C3 생체 회복 분무
  spray(pos, o) {
    if (!this._ok()) return null; const C = WPFX.col, low = lite(), N = low ? 4 : 6, pc = o.follow, dur = o.dur || 6, amps = [], mists = []; let endT = -1;
    const at = () => P3(pc && !pc.dead ? pc.pos : pos);
    const sig = this.circle(null, o.r, { follow: at, col: [C.white, C.mint, C.gold], v: 0, hold: true, draw: 0.35, out: 0.4, spin: 0.7, a: 0.55, glowA: 0.4 });
    this.helix(at, 0.6, 2.0, { col: [C.white, C.mint], life: 0.9, spin: 3 }); this.sfx('wp_spray');
    const e = this._fx('spray', dur + 0.5, (e, dt) => {
      if (endT >= 0) { endT += dt; if (endT > 0.4) e.t = e.life; }
      const fade = (endT >= 0 ? 1 - endT / 0.4 : 1) * (1 - smooth(dur - 0.4, dur, e.t)), open = easeOut(smooth(0, 0.35, e.t)), c = at();
      sig.setA(fade);
      amps.forEach((q, i) => { const a = q.a + e.t * 0.5, rr = 0.25 + 0.75 * open; q.m.position.set(c.x + Math.cos(a) * rr, c.y + 1.25 + Math.sin(e.t * 2 + i) * 0.05, c.z + Math.sin(a) * rr);
        q.m.rotation.set(0, -a, Math.PI / 2 + 0.5); q.m.material.uniforms.uA.value = fade;
        if (!low && fade > 0.3 && (e.f = (e.f || 0) + 1) % 18 === i * 3) this.emit('mist', q.m.position, 1, { col: [0xc8fff0, 0xa8f0e0], cone: { x: -Math.cos(a) * 0.3, y: -0.4, z: -Math.sin(a) * 0.3 }, speed: [1, 1.6], size: [0.25, 0.4], end: 2.2, life: [0.5, 0.7], g: 0, drag: 2, a: 0.3, fin: 0.1 }); });
      for (const s of mists) { s.k += dt / s.life; if (s.k >= 1) { s.k = 0; s.a = rnd(0, Math.PI * 2); } const rr = (1 - s.k) * (o.r * 0.85), y = 0.2 + 1.0 * (1 - s.k);
        s.m.position.set(c.x + Math.cos(s.a) * rr, c.y + y, c.z + Math.sin(s.a) * rr); s.m.quaternion.copy(this.camQ); s.m.scale.setScalar(0.5 + 0.4 * (1 - s.k)); s.m.material.uniforms.uA.value = 0.16 * fade * smooth(0, 0.2, s.k) * (1 - smooth(0.7, 1, s.k)); }
      ring.position.copy(c).setY(c.y + 0.05); ring.material.uniforms.uA.value = 0.5 * fade;
      if (fade > 0.2 && (e.g2 = (e.g2 || 0) + 1) % (low ? 16 : 6) === 0) this.emit(rand() < 0.5 ? 'petal' : 'glint', _a.copy(c).setY(c.y + 0.1), 1, { col: [C.mint, C.white, C.pink], spread: o.r * 0.8, speed: [0, 0.15], up: [0.5, 0.9], size: [0.08, 0.14], end: 0.7, life: [0.8, 1.2], g: 0, drag: 0.5, glow: 0.5, spin: 2 });
    });
    for (let i = 0; i < N; i++) { const m = this.propM(e, 'tripo_ampoule', this.geo.wp_ampoule, { tint: C.teal, op: 0.7, glow: 0.3, order: 4 }); m.scale.setScalar(0.19); amps.push({ m, a: i / N * Math.PI * 2 }); }
    for (let i = 0; i < (low ? 4 : 9); i++) mists.push({ m: this.puff(e, 0xc8fff0, C.tealB, 4), k: i / 9, a: rnd(0, 6.28), life: rnd(1.0, 1.4) });
    const ring = this.disc(e, 1, C.white, C.tealB); ring.scale.set(o.r * 2, o.r * 2, 1);
    const end = () => { if (endT < 0) endT = 0; sig.end(); };
    e.dispose = () => { sig.end(); this._free(e); };
    return Object.assign(e, {
      pulse: (t) => { if (!t || !t.pos) return; const p = P3(t.pos); this.groundRing(p, Math.min(1.2, (t.radius || 0.5) + 0.6), C.white, C.teal, 0.3, 1.0);
        const pp = p.clone().setY(p.y + 0.3); this.emit('gran', pp, 4, { col: [C.teal, C.mint], size: [0.025, 0.04], speed: [0.1, 0.4], up: [1.6, 2.6], g: 0, life: [0.5, 0.65], glow: 0.9 });
        this.emit('glint', pp, 3, { col: [C.mint, C.white], speed: [0.1, 0.3], up: [1.2, 2.0], size: [0.12, 0.2], life: [0.4, 0.6], g: 0 }); },
      end,
    });
  }

  // ------------------------------------------------------------------ C4 다층 코팅막: 실제 보호막 비율 -> 겹 수
  coat(pc, o) {
    if (!this._ok()) return null; const C = WPFX.col, init = Math.max(1, o.initial || pc.shield || 1), sh = []; let last = pc.shield;
    const feet = () => (pc.dead ? null : P3(pc.pos));
    this.circle(null, 1.0, { follow: feet, col: [C.white, C.ice, C.gold], v: 3, life: 0.9, draw: 0.2, out: 0.4, spin: 2.5 });
    this.helix(feet, 0.66, 2.1, { col: [C.white, C.ice], life: 0.8, spin: -3 }); this.sfx('wp_coat');
    this.emit('glint', P3(pc.pos).setY((pc.pos.y || 0) + 0.9), 8, { col: [C.ice, C.white, C.teal], spread: 0.5, speed: [0.3, 0.8], up: [0.2, 1.0], size: [0.14, 0.24], life: [0.4, 0.6], g: 0 });
    const e = this._fx('coat', (o.dur || 8) + 0.5, (e, dt) => {
      if (pc.dead) e.t = e.life;
      const frac = clamp01(pc.shield / init), want = pc.shield > 0.5 && (pc.shieldT == null || pc.shieldT > 0) ? Math.ceil(3 * frac - 1e-6) : 0, p = P3(pc.pos);
      sh.forEach((s, i) => {
        const formed = smooth(i * 0.1, i * 0.1 + 0.18, e.t), alive = i < want;
        if (!alive && s.peel < 0) { s.peel = 0; this.emit('shard', p.clone().setY(p.y + 0.95), 6, { col: [C.ice, C.white], spread: 0.6 * s.k, speed: [1, 2], up: [0.5, 1.6], size: [0.05, 0.09], life: [0.35, 0.5], g: 6, glow: 0.6 }); }
        if (s.peel >= 0) s.peel += dt;
        const pk = s.peel >= 0 ? smooth(0, 0.28, s.peel) : 0;
        s.m.position.copy(p).setY(p.y + 0.92); const k = s.k * (1 + 0.25 * pk) * (0.85 + 0.15 * formed);
        s.m.scale.set(0.62 * k, 1.0 * k, 0.62 * k); s.m.rotation.y = e.t * (0.3 + i * 0.2);
        s.m.material.uniforms.uA.value = formed * (1 - pk) * 0.85;
      });
      if (pc.shield < last - 0.5 && want > 0) {   // absorbed a hit: ripple on the outer layer toward the nearest enemy
        const G = window.G, z = G && G.zone; let best = null, bd = 6; if (z) for (const m of z.actors) { if (m.dead || m.faction === 'player' || m.isSummon) continue; const d = Math.hypot(m.pos.x - pc.pos.x, m.pos.z - pc.pos.z); if (d < bd) { bd = d; best = m; } }
        const dx = best ? best.pos.x - pc.pos.x : pc.facing.x, dz = best ? best.pos.z - pc.pos.z : pc.facing.z, mm = Math.hypot(dx, dz) || 1, R = 0.62 * sh[Math.max(0, want - 1)].k;
        const rp = p.clone().add(_a.set(dx / mm * R, 0.95, -dz / mm * R)); this.flash(rp, C.white, C.ice, 0.6, 0.16, 1.0); this.vring(rp, 0.7, C.white, C.ice, 0.22, 0.8);
        this.emit('glint', rp, 3, { col: [C.ice, C.white], speed: [0.6, 1.4], up: [0, 0.8], size: [0.12, 0.2], life: [0.2, 0.35], g: 0 });
      }
      last = pc.shield;
      if (e.t > 0.4 && want === 0 && sh.every(s => s.peel > 0.3)) e.t = e.life;
    });
    for (let i = 0; i < 3; i++) { const m = this.glassM(e, this.geo.wp_sphere, { tint: [C.ice, C.teal, C.white][i], op: 0.03, rim: [C.ice, C.teal, C.iceB][i], order: 3 + i }); sh.push({ m, k: 1 + i * 0.13, peel: -1 }); }
    return this._h(e);
  }

  // ------------------------------------------------------------------ C5 최종 처방·생명 유지
  lastrx(pc, o) {
    if (!this._ok()) return null; const C = WPFX.col, dur = o.dur || 5, NT = 14;
    const feet = () => (pc.dead ? null : P3(pc.pos)), p0 = P3(pc.pos);
    this.pillar(p0, 0.8, 3.4, { col: [C.white, C.gold], life: 0.8 }); this.circle(null, 1.3, { follow: feet, col: [C.white, C.goldB, C.gold], v: 0, life: 1.6, draw: 0.2, out: 0.7, spin: 2 });
    this.emit('star', p0.clone().setY(p0.y + 1.1), 12, { col: [C.gold, C.white, C.pink], speed: [1.5, 3], up: [1.2, 3], size: [0.06, 0.1], life: [0.6, 0.9], g: 6, glow: 0.9, ground: p0.y + 0.03, bounce: 0.3 });
    this.emit('glint', p0.clone().setY(p0.y + 0.5), 12, { col: [C.gold, C.white], spread: 0.6, speed: [0.2, 0.6], up: [1.2, 2.6], size: [0.16, 0.28], life: [0.6, 1.0], g: 0 });
    this.sfx('wp_lastrx');
    const e = this._fx('lastrx', dur, (e) => {
      const p = P3(pc.pos), t = e.t, br = smooth(0.1, 0.22, t);
      g.position.copy(p).setY(p.y + 1.05); g.rotation.set(0, t * 3, Math.PI / 2);
      hA.position.set(0, 0.02 + br * 0.5, 0); hB.position.set(0, -0.02 - br * 0.5, 0); for (const h of [hA, hB]) h.material.uniforms.uA.value = smooth(0, 0.06, t) * (1 - smooth(0.25, 0.45, t));
      const wk = smooth(0.15, 0.8, t), pts = [];   // gold liquid spiral wrapping the body
      for (let i = 0; i < NT; i++) { const k = i / (NT - 1), a = k * 9 + t * 6, y = 0.1 + 1.5 * clamp01(wk * 1.2 - k * 0.6); pts.push(new THREE.Vector3(p.x + Math.cos(a) * 0.48, p.y + y, p.z + Math.sin(a) * 0.48)); }
      this._ribbonSet(rib, pts, 0.07); rib.material.uniforms.uA.value = 1.2 * smooth(0.15, 0.25, t) * (1 - smooth(0.9, 1.3, t));
      layer.position.copy(p).setY(p.y + 0.92); const lk = smooth(0.6, 0.9, t); layer.scale.set(0.66 * (0.9 + 0.1 * lk), 1.05, 0.66 * (0.9 + 0.1 * lk)); layer.material.uniforms.uA.value = lk * (1 - smooth(dur - 0.5, dur, t)) * 0.9;
      if (t > 0.6 && t < dur - 0.5 && (e.f = (e.f || 0) + 1) % (lite() ? 30 : 12) === 0) this.emit('glint', _a.set(p.x, p.y + 0.3, p.z), 1, { col: C.gold, spread: 0.5, speed: [0, 0.1], up: [0.6, 1.0], size: [0.1, 0.16], life: [0.6, 0.9], g: 0 });
    });
    const g = new THREE.Group(); e.g.add(g);
    const [hA, hB] = this.capHalves(e, g, 0.12, { tint: C.gold, op: 0.9, glow: 0.4 }, { tint: C.capW, op: 0.9, glow: 0.3 });
    const rib = this._ribbon(e, NT); rib.material.uniforms.uW.value.setHex(C.white); rib.material.uniforms.uB.value.setHex(C.gold);
    const layer = this.glassM(e, this.geo.wp_sphere, { tint: C.white, op: 0.04, rim: C.ice, order: 4 });
    this.flash(P3(pc.pos).setY((pc.pos.y || 0) + 1.05), C.white, C.gold, 1.3, 0.18, 1.2); this.vring(P3(pc.pos).setY((pc.pos.y || 0) + 1.05), 2.2, C.white, C.gold, 0.35, 0.9);
    return this._h(e);
  }

  // ------------------------------------------------------------------ C1·C2 제작 완성 / 서방형 캡슐 사용
  made(pc, o) {
    if (!this._ok()) return null; const C = WPFX.col, low = lite();
    if (this._made && !this._made.dead) this._free(this._made);   // 연속 제작: 하나만(새로 시작)
    const vial = o.kind === 'vial', imp = [], gr = []; this.sfx('wp_brew');
    const e = this._made = this._fx('made', 1.5, (e) => {
      const t = e.t, p = P3(pc.pos), y = p.y + 2.35 + 0.35 * smooth(0.9, 1.5, t), fade = smooth(0, 0.1, t) * (1 - smooth(1.2, 1.5, t));
      dais.position.set(p.x, y - 0.12, p.z); dais.scale.setScalar(0.95 * (0.6 + 0.4 * easeOut(smooth(0, 0.2, t)))); dais.rotation.set(-Math.PI / 2, 0, t * 1.5); dais.material.uniforms.uA.value = 0.9 * fade; dais.material.uniforms.uP.value = easeOut(smooth(0, 0.25, t)); dais.material.uniforms.uT.value = t;
      if (vial) {
        body.position.set(p.x, y, p.z); body.scale.setScalar(body.userData.tex ? 0.4 : 0.42); body.rotation.y = t * 1.2; body.material.uniforms.uA.value = fade;
        liq.position.set(p.x, y, p.z); const fk = smooth(0.05, 0.55, t); liq.scale.set(0.36, 0.42 * 0.68 * fk + 0.001, 0.36); liq.rotation.y = t * 1.2; liq.material.uniforms.uA.value = body.userData.tex ? 0 : fade; liq.material.uniforms.uGlow.value = 0.3 + 0.8 * smooth(0.5, 0.75, t);
        imp.forEach((q, i) => { const k = smooth(0.25 + i * 0.06, 0.75 + i * 0.06, t); q.m.position.set(p.x + q.x, y + 0.1 - k * 0.9, p.z + q.z); q.m.material.uniforms.uA.value = (1 - k) * fade; });
      } else {
        g.position.set(p.x, y, p.z); g.rotation.set(0, t * 1.2, 0.25); const seal = smooth(0.5, 0.7, t);
        hA.position.set(0, 0.3 * (1 - seal), 0); for (const h of [hA, hB]) h.material.uniforms.uA.value = fade;
        gr.forEach((q, i) => { const k = smooth(0.05 + i * 0.05, 0.3 + i * 0.05, t); q.m.position.set(p.x + q.x, y + 0.5 * (1 - k) - 0.06 + q.y, p.z + q.z); q.m.material.uniforms.uA.value = fade; });
      }
      if (t < 0.7 && !low && (e.f = (e.f || 0) + 1) % 4 === 0) this.emit('glint', _a.set(p.x, y + 0.1, p.z), 1, { col: [vial ? C.teal : C.gold, C.white], spread: 0.35, speed: [0, 0.1], up: [0.2, 0.5], size: [0.1, 0.16], life: [0.3, 0.45], g: 0 });
      if (t > 0.75 && !e.spark) { e.spark = true; const q = _a.set(p.x, y, p.z); this.flash(q, C.white, vial ? C.teal : C.gold, 0.9, 0.18, 1.2); this.vring(q, 1.0, C.white, vial ? C.teal : C.gold, 0.3, 0.9);
        this.emit('star', q, 6, { col: [vial ? C.teal : C.gold, C.white, C.pink], speed: [0.6, 1.4], up: [0.6, 1.4], size: [0.04, 0.07], life: [0.5, 0.7], g: 3, glow: 0.9 }); this.sparkle(q, 5, vial ? C.teal : C.gold, { up: [0.4, 1.2], speed: [0.4, 1.0] }); }
    });
    const dais = this._m(e, 'sigilA', this.quad, 2); { const u = dais.material.uniforms; u.uW.value.setHex(C.white); u.uB.value.setHex(vial ? C.teal : C.goldB); u.uG.value.setHex(C.gold); u.uV.value = 0; }
    let body, liq, g, hA, hB;
    if (vial) { body = this.propM(e, 'tripo_flask', this.geo.wp_vial, { tint: C.glass, op: 0.25, rim: C.white, order: 5 }); liq = this.solid(e, this.geo.wp_vial, { tint: C.teal, spec: 0.5 });
      for (let i = 0; i < (low ? 3 : 5); i++) { const m = this.solid(e, this.geo.wp_granule, { tint: 0x5a4a3a, spec: 0 }); m.scale.setScalar(0.025); imp.push({ m, x: rnd(-0.08, 0.08), z: rnd(-0.08, 0.08) }); } }
    else { g = new THREE.Group(); e.g.add(g); [hA, hB] = this.capHalves(e, g, 0.12, { tint: C.teal, op: 0.4, glow: 0.2 }, { tint: C.capW, op: 0.4, glow: 0.1 });
      for (let i = 0; i < 6; i++) { const m = this.solid(e, this.geo.wp_granule, { tint: i % 2 ? C.gold : C.teal, spec: 0.6 }); m.material.uniforms.uGlow.value = 0.4; m.scale.setScalar(0.03); gr.push({ m, x: rnd(-0.05, 0.05), y: rnd(-0.05, 0.08), z: rnd(-0.05, 0.05) }); } }
    return this._h(e);
  }
  regen(pc, o) {
    if (!this._ok() || !o.status) return null; const C = WPFX.col, key = '_regen_' + o.status;
    if (this[key] && !this[key].dead) this._free(this[key]);
    const N = 8, gr = []; let shown = N;
    const e = this[key] = this._fx('regen', 30, (e) => {
      const s = pc.status && pc.status.get && pc.status.get(o.status);
      if (!s || pc.dead) { e.t = e.life; return; }
      const tick = s.def && s.def.tick ? s.def.tick : s.duration / N, T = Math.max(1, Math.ceil(s.duration / tick - 1e-6)), rt = Math.ceil(s.remaining / tick - 1e-6);   // 회복 틱이 남은 만큼 과립(틱마다 하나씩 빛나며 사라짐)
      const want = Math.max(0, Math.min(N, Math.round(N * rt / T))), p = P3(pc.pos), y = p.y + 2.25, fade = smooth(0, 0.15, e.t) * smooth(0, 0.3, s.remaining);
      if (want < shown) { for (let i = want; i < shown; i++) { const q = gr[i]; this.flash(q.m.position.clone(), C.white, o.status === 'regen' ? C.teal : C.iceB, 0.3, 0.14, 1.2); this.emit('glint', q.m.position, 2, { col: o.status === 'regen' ? C.mint : C.ice, speed: [0.2, 0.5], up: [-0.6, -0.2], size: [0.1, 0.16], life: [0.3, 0.45], g: 0 }); } shown = want; }
      g.position.set(p.x, y, p.z); g.rotation.set(0, e.t * 0.8, 1.2); for (const h of [hA, hB]) h.material.uniforms.uA.value = fade * 0.9;
      gr.forEach((q, i) => { q.m.visible = i < shown; _a.set(q.x, q.y, 0).applyEuler(g.rotation); q.m.position.set(p.x + _a.x, y + _a.y, p.z + _a.z); q.m.material.uniforms.uA.value = fade; });
    });
    const g = new THREE.Group(); e.g.add(g);
    const hA = this.glassM(e, this.geo.wp_cap_half, { tint: o.status === 'regen' ? C.teal : C.iceB, op: 0.3, glow: 0.1 }), hB = this.glassM(e, this.geo.wp_cap_half, { tint: C.capW, op: 0.3, glow: 0.1 });
    for (const [h, sg] of [[hA, 1], [hB, -1]]) { e.g.remove(h); g.add(h); h.scale.set(0.1, 0.1 * sg, 0.1); }
    for (let i = 0; i < N; i++) { const m = this.solid(e, this.geo.wp_granule, { tint: o.status === 'regen' ? C.teal : C.ice, spec: 0.6 }); m.material.uniforms.uGlow.value = 0.6; m.scale.setScalar(0.026); gr.push({ m, x: 0.03 * Math.cos(i * 2.4), y: -0.14 + i * 0.04, z: 0 }); }
    return this._h(e);
  }
}
