// 쉐프 2차 스킬 이펙트 (2026-11-16). 규칙은 js/chef.js, 메시는 tools/blender/fx_chef.py -> assets/fx/fx_chef.glb.json (+ 요리사 메시 fx_cook.glb.json의
// 식칼·꼬치·국자·조각 재사용). CookFx를 이어받아 풀·셰이더(정점 색 solid, 가산 spr: 0 원판 / 1 고리 / 2 베기 선 / 3 별 섬광, 알파 puff, 부채꼴 blend 5)를 그대로 씀.
// 원칙: 음식·도구는 제 색으로 또렷하게(빛은 테두리·타격에만), 소스는 낮은 바닥 효과, 김은 투명한 입자 몇 개, 흰 화면 섬광·강한 블룸 없음,
// 가장 밝은 순간 = 실제 피해 순간(js/chef.js가 부름), 고리·부채꼴은 실제 판정 반경 그대로. 매 프레임 메시·재질·텍스처를 만들지 않음(풀 재사용,
// 설탕 벽 판은 불러올 때 한 번 만든 지오메트리). 저사양(휴대폰·그래픽 효과 끔)은 장식(불티·김·조각 수)만 줄이고 웍 뒤집기·클로슈·탑 쌓기는 그대로.
// 종류(js/skillrt.js FX.chef(kind, a, o) / js/chef.js this.fx) — handle 메서드는 js/chef.js 의 call(...) 로 부름(없어도 안전):
//   wok(pc, {f, t1, t2, r1, ang1, r2, ang2})        웍이 손 앞에서 두 번 뒤집히고 재료가 포물선으로 떴다 받아짐. flame(k, hits) = 그 타의 불꽃 부채꼴
//   flambe(c, {from, f, r, splash, ignite})          소스 줄기 → 바닥 웅덩이 → 불씨 → 파란 불길이 테두리를 따라 → 주홍 불꽃. steam(p), burn(hits)
//   cooker(pos, {fuse, warn, r, sr})                 압력솥: 눈금이 오르고 뚜껑이 떨리고 김이 뿜어 나옴, 폭발 1초 전 바닥 경고. puff(), gauge(k), boom(n)
//   skewers(pc, {f, n, launch, gap})                 꼬치에 재료가 꿰이고 짧은 불에 구워짐. fire(i, p, dir) -> {set, pierce, end, dispose}
//   show(c, {f, prep, stir, cloche, wave})           반투명 조리대 + 엇갈리는 식칼(chop) → 거대한 웍(toss) → 금빛 클로슈(slam) + 낮은 불꽃 고리
//   sorbet(pc, {f, n, launch, gap})                  소르베가 부채꼴로 떠오름. fly(i) -> {set, hit(p, ok), vanish, dispose}
//   plating(c, {r, bloom, f})                        접시 테두리 → 서리 선 → 얼음꽃(bloom). shock(p), freeze(t)
//   mille(pc, {f})                                   밀푀유 원반: set(p, back), cut(p), turn(), catch(), drop(p)
//   sugar(pos, {f, w, life})                         캐러멜 선이 그려지고 굳어 설탕 벽. crack(frac), shatter()
//   tower(c, {form, layers, gap, r, rb})             슈가 나선으로 쌓이는 크로캉부슈 + 금빛 실 + 서리. frost(k), burst(i, n), ring(n)
//   broth(pos, {r, dur})                             구리 냄비·국자·김·바닥 범위 표시. pulse(t) = 회복 순간 허브 잎 물결, end()
//   bon(pc, {item, touch}) · touch(pc) · royal(pc, {times}) -> open(i), cancel() · menu(pc, {id, n}) (제작 완성 플레이팅)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CookFx, cookTop } from './cookfx.js';

export const CHEFFX = {
  intensity: 1.0,
  col: { fire: 0xff6a2a, fireB: 0xd8300a, ember: 0xffc060, amber: 0xffb040, amberB: 0xb86410, blue: 0x7ab8ff, blueB: 0x2a60e0, copper: 0xe08a50, gold: 0xffd27a, goldB: 0xd89a30,
         silver: 0xe8eef8, silverB: 0x9aa8c0, ice: 0xd8f0ff, iceB: 0x6ab0f0, cream: 0xfff4e0, herb: 0x8ad860, herbB: 0x3a8a28, steam: 0xfff8f0, steamB: 0xc8c0b8, sugar: 0xffc870, sugarB: 0xb87020 },
  fruit: [0xff8aa8, 0xffd060, 0x9ae070, 0xc8a0ff, 0xffa060],
  wok: { size: 0.42, y: 1.0, fwd: 0.55, food: 5, foodLite: 3, toss: 0.3, h: 0.9 },
  show: { counter: 1.6, wok: 1.25, cloche: 1.9, drop: 6.0 },
  tower: { tiers: [7, 5, 3, 1], h: 0.42, choux: 0.17, a: 0.85, rr: 0.55 },
  sugar: { h: 1.25, a: 0.5 },
  liteK: 0.45,                                                                    // 저사양(휴대폰·그래픽 효과 끔) 입자 배율 — 마법진·빛기둥·도구는 그대로
  cap: { star: 160, flame: 140, ember: 220, shard: 140, petal: 90, glint: 220, mist: 80 },   // 종류별 동시 입자 상한(인스턴스 수)
};
const P3 = (p) => new THREE.Vector3(p.x, p.y || 0, -p.z);
const D3 = (f) => new THREE.Vector3(f.x, 0, -f.z).normalize();
const yawOf = (f) => Math.atan2(f.z, f.x);   // local +x -> game direction f (three rotation.y)
const lite = () => { const G = window.G; return !!(G && ((G.input && G.input.mobile) || (G.settings && G.settings.graphicsFx === false))); };
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
let _seed = 20261116; const rnd = (a, b) => { _seed = (_seed * 1664525 + 1013904223) >>> 0; return a + (_seed / 4294967296) * (b - a); };   // 이펙트 전용 난수 — 게임 Math.random(명중·치명)을 건드리지 않음
const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion(), _mx = new THREE.Matrix4();
const glbParse = async (url) => { const j = await (await fetch(url)).json(), raw = atob(j.b64), u8 = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i); return new Promise((res, rej) => new GLTFLoader().parse(u8.buffer, '', res, rej)); };
const pick = (a) => (Array.isArray(a) ? a[(rnd(0, 1) * a.length) | 0] : a);
const _d = new THREE.Vector3(), _e = new THREE.Euler(), _s3 = new THREE.Vector3(), _col = new THREE.Color();

// ---------------------------------------------------------------- 2026-11-17 '화려하게' 개편: 마법진·빛기둥·나선·세운 고리 + 인스턴스 입자
// 층(모든 스킬 공통): (1) 시전 준비 = 발밑 마법진(circle) + 손 모임 빛 (2) 본체 = 도구·음식 메시(Tripo 웍·압력솥·클로슈) + 꼬리 + 반짝이
// (3) 명중 = bang(별 섬광·세운 고리·별/불티/조각) + 바닥 고리 + 빛기둥 (4) 잔광 = 천천히 사라지는 마법진·김·별.
// 큰 것(마법진·고리·빛기둥 반지름)은 실제 판정 반경 안. 빛만 가산(색 ≤ 1 — 블룸 문턱 2.6 아래), 바닥 문양은 일반 블렌딩 판 + 옅은 가산 판.
// 입자: 별·불꽃·불티·조각·꽃잎·반짝이·김 = 종류마다 InstancedMesh 하나(Parts, draw call 1, 상한 CHEFFX.cap — 차면 새 입자를 버림). 난수는 rnd 만.
const FLAT_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const ADD = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide };
// 마법진(바닥 판, 반지름 1 = 판정 반경 이하): 금테 이중 고리 + 도는 룬 띠 + 안쪽 도형(uV 0 육망성 / 1 삼각 / 2 눈꽃 살 / 3 겹친 사각 / 4 꽃잎 장미창(파티스리) / 5 접시·포크 살(레스토랑))
// uP = 그려진 각도(0..1, 위에서 시계 방향으로), uT = 시간(회전·물결), 가운데는 옅게(적·경고 표시가 보이게). uAdd 1 = 가산 빛 층
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
  else if (uV < 3.5) { lines += poly(p, 4., .86, rot, .016) + poly(p, 4., .86, rot + PI / 4., .016) + poly(p, 8., .5, -rot, .01) * .6; }
  else if (uV < 4.5) { float pa = mod(ang + rot, PI / 4.) - PI / 8., pr = .62 + .24 * cos(pa * 8.); lines += smoothstep(.02, .006, abs(r - pr)) * step(.2, r);
    float pb = mod(ang - rot * 1.4, PI / 6.) - PI / 12.; lines += smoothstep(.016, .005, abs(r - (.34 + .12 * cos(pb * 12.)))) * .8; lines += band(r, .2, .01) * .6; }
  else { lines += band(r, .78, .016) + band(r, .74, .006) * .6; float sa = mod(ang + rot * .6, PI / 4.) - PI / 8.; lines += smoothstep(.014, .004, r * abs(sin(sa))) * step(.36, r) * step(r, .72) * .7;
    lines += poly(p, 8., .34, -rot, .01) * .8; float dots = step(.5, fract((ang + rot) / (2. * PI) * 24.)) * band(r, .83, .012); lines += dots * .6; }
  float wave = band(r, fract(uT * .55), .05) * .35 * step(r, .95), core = exp(-r * r * 22.) * .45, fill = .07 + .12 * smoothstep(.25, .95, r);
  vec3 c = mix(uB, uW, clamp(lines + wave, 0., 1.) * .7); c = mix(c, uG, clamp(gold, 0., 1.)); c = mix(c, uW, core);
  float a = (fill + lines * .85 + gold + wave + core) * drawn * uA;
  if (uAdd > .5) gl_FragColor = vec4(c * clamp(a, 0., 1.2) * .7, 1.); else gl_FragColor = vec4(c, clamp(a, 0., .92)); }`;
// 빛기둥(열린 원통): 아래가 밝고 위로 흐려짐, 세로 줄무늬가 돌고 위로 흐름 — 가산
const PILLAR_FS = `uniform vec3 uW, uB; uniform float uA, uT; varying vec2 vUv;
void main(){ float v = vUv.y, fade = pow(1. - v, 1.5) * smoothstep(0., .05, v);
  float st = .55 + .45 * sin(vUv.x * 43.98 + uT * 3.) * sin(vUv.x * 18.85 - uT * 2.), fl = .7 + .3 * sin((v - uT * 1.4) * 17.);
  gl_FragColor = vec4(mix(uW, uB, clamp(v * 1.3, 0., 1.)) * fade * st * fl * uA, 1.); }`;
// 나선 띠(u 길이 / v 폭): uP = 머리 위치, 머리 뒤 0.5 길이만 보임 — 가산
const HELIX_FS = `uniform vec3 uW, uB; uniform float uA, uP; varying vec2 vUv;
void main(){ float e = 1. - abs(vUv.y * 2. - 1.), k = (uP - vUv.x) / .5; if (k < 0. || k > 1.) discard;
  float a = smoothstep(0., .7, e) * pow(1. - k, 1.3) * smoothstep(0., .04, k + .02); gl_FragColor = vec4(mix(uW, uB, k) * a * uA, 1.); }`;
// 인스턴스 입자: 메시(별·불꽃·조각·꽃잎 — 빛 받는 몸 + 자체 빛) / 빌보드(반짝이 = 가산 네 꼭지 별, 김 = 부드러운 덩어리)
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

/** 한 종류의 입자 묶음 = InstancedMesh 하나. 입자: 위치·속도·중력·끌림·땅·회전·크기(시작→끝)·색·알파·자체 빛, 수명 동안 페이드 */
class Parts {
  constructor(root, geo, mat, cap, bb) {
    const g = geo.clone(); this.cap = cap; this.p = [];
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
      if (q.y < q.ground) { q.y = q.ground; q.vy = -q.vy * q.bounce; q.vx *= 0.5; q.vz *= 0.5; }
      q.rx += q.wx * dt; q.ry += q.wy * dt; q.rz += q.wz * dt;
      const k = q.t / q.life, s = q.s0 + (q.s1 - q.s0) * k, a = q.a * smooth(0, q.fin, q.t) * (1 - smooth(q.fo, 1, k));
      _e.set(q.rx, q.ry, q.rz); _q.setFromEuler(_e); _s3.set(s * q.sx, s * q.sy, s * q.sx); _a.set(q.x, q.y, q.z); _mx.compose(_a, _q, _s3); this.m.setMatrixAt(n, _mx);
      this.aC.setXYZ(n, q.r, q.gc, q.b); this.aA.setXY(n, a, q.glow); P[n] = q; n++;
    }
    P.length = n; this.m.count = n;
    if (n) { this.m.instanceMatrix.needsUpdate = true; this.aC.needsUpdate = true; this.aA.needsUpdate = true; }
  }
  clear() { this.p.length = 0; this.m.count = 0; }
}

export class ChefFx extends CookFx {
  load() {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const [a, b] = await Promise.all([glbParse('assets/fx/fx_chef.glb.json'), glbParse('assets/fx/fx_cook.glb.json')]);
      for (const g of [b, a]) g.scene.traverse(o => { if (o.isMesh) this.geo[o.name] = o.geometry; });
      this.chips = ['chef_food_a', 'chef_food_b', 'chef_food_c'].map(n => this.geo[n]).filter(Boolean);
      this._parts();
      this.pane = new THREE.PlaneGeometry(1, 1); { const n = this.pane.attributes.position.count, c = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const top = this.pane.attributes.position.getY(i) > 0; c.set(top ? [1, 0.86, 0.55] : [0.95, 0.62, 0.25], i * 3); } this.pane.setAttribute('color', new THREE.BufferAttribute(c, 3)); }   // 설탕 벽 판(한 번만 만듦, 정점 색 = 호박색 사탕)
      this.ready = true;
      try {   // Tripo 소품(있으면): 클로슈·압력솥·웍 — 없으면 절차 메시(같은 규격, tools/blender/fx_chef_tripo.py)
        const t = await glbParse('assets/fx/fx_chef_tripo.glb.json');
        t.scene.traverse(o => { if (o.isMesh && o.material && o.material.map) this.tri[o.name] = { geo: o.geometry, map: o.material.map }; });
      } catch (err) { console.warn('cheffx: no Tripo props', err && err.message); }
    })().catch(e => console.warn('cheffx load', e));
    return this.loading;
  }
  _h(e, o = {}) { e.dispose = () => this._free(e); return Object.assign(e, o); }
  _parts() {
    const C = CHEFFX.cap, mesh = () => new THREE.ShaderMaterial({ vertexShader: PM_VS, fragmentShader: PM_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const bb = (fs, add) => new THREE.ShaderMaterial({ vertexShader: BB_VS, fragmentShader: fs, ...(add ? ADD : { transparent: true, depthWrite: false, side: THREE.DoubleSide }) });
    const g = this.geo;
    this.ps = {
      star: new Parts(this.root, g.chef_star, mesh(), C.star), flame: new Parts(this.root, g.chef_flame, mesh(), C.flame), ember: new Parts(this.root, g.cook_drop || g.chef_star, mesh(), C.ember),
      shard: new Parts(this.root, g.chef_shard, mesh(), C.shard), petal: new Parts(this.root, g.chef_petal, mesh(), C.petal),
      glint: new Parts(this.root, this.quad, bb(GLINT_FS, true), C.glint, 'glint'), mist: new Parts(this.root, this.quad, bb(MIST_FS, false), C.mist, 'mist'),
    };
  }
  /** 입자 n개: kind star|flame|ember|shard|petal|glint|mist, at = three 좌표. o: col(색 또는 배열), speed[], up[], size[], end(크기 배율), life[], g(중력), drag,
   *  ground(y), bounce, spin, glow, a, cone(방향 — 그쪽으로 퍼짐, jit), spread(시작 반지름), ring(시작 고리 반지름), dy[], fin/fo(페이드), sy(세로 배율), upright, keep(저사양에서도 그대로) */
  emit(kind, at, n, o = {}) {
    const P = this.ps && this.ps[kind]; if (!P || n <= 0) return;
    if (lite() && !o.keep) n = Math.max(1, Math.round(n * CHEFFX.liteK));
    const sp = o.speed || [0.6, 1.8], up = o.up || [0.6, 1.8], sz = o.size || [0.05, 0.09], lf = o.life || [0.45, 0.7];
    for (let i = 0; i < n; i++) {
      const a = o.ring != null ? (i / n) * Math.PI * 2 + rnd(-0.1, 0.1) : rnd(0, Math.PI * 2), v = rnd(sp[0], sp[1]), r0 = o.ring != null ? o.ring : (o.spread ? Math.sqrt(rnd(0, 1)) * o.spread : 0);
      let vx = Math.cos(a) * v, vz = Math.sin(a) * v;
      if (o.cone) { const c = o.cone, j = o.jit ?? 0.35; vx = (c.x + rnd(-j, j)) * v; vz = (c.z + rnd(-j, j)) * v; }
      _col.setHex(pick(o.col ?? 0xffffff)); const s = rnd(sz[0], sz[1]);
      if (!P.add({ x: at.x + Math.cos(a) * r0, y: at.y + (o.dy ? rnd(o.dy[0], o.dy[1]) : 0), z: at.z + Math.sin(a) * r0, vx, vy: rnd(up[0], up[1]) + (o.cone ? (o.cone.y || 0) * v : 0), vz,
        g: o.g ?? 6, drag: o.drag ?? 1.2, ground: o.ground ?? -1e9, bounce: o.bounce ?? 0.25, rx: o.upright ? 0 : rnd(0, 6.28), ry: rnd(0, 6.28), rz: o.upright ? 0 : rnd(0, 6.28),
        wx: o.upright ? 0 : rnd(-1, 1) * (o.spin ?? 8), wy: rnd(-1, 1) * (o.spin ?? 8), wz: o.upright ? 0 : rnd(-1, 1) * (o.spin ?? 8), s0: s, s1: s * (o.end ?? 0.4), sx: 1, sy: o.sy ?? 1,
        r: _col.r, gc: _col.g, b: _col.b, a: o.a ?? 1, glow: o.glow ?? 0.5, t: 0, life: rnd(lf[0], lf[1]), fin: o.fin ?? 0.03, fo: o.fo ?? 0.55 })) break;
    }
  }
  update(dt) { super.update(dt); if (this.ps) for (const k in this.ps) this.ps[k].update(dt); }
  clear() { super.clear(); if (this.ps) for (const k in this.ps) this.ps[k].clear(); }
  _mat(kind) {
    const U = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v }])), C = () => new THREE.Color(1, 1, 1);
    if (kind === 'sigil') return new THREE.ShaderMaterial({ uniforms: U({ uW: C(), uB: C(), uG: C(), uA: 0, uP: 0, uT: 0, uV: 0, uAdd: 0 }), vertexShader: FLAT_VS, fragmentShader: SIGIL_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    if (kind === 'sigilA') return new THREE.ShaderMaterial({ uniforms: U({ uW: C(), uB: C(), uG: C(), uA: 0, uP: 0, uT: 0, uV: 0, uAdd: 1 }), vertexShader: FLAT_VS, fragmentShader: SIGIL_FS, ...ADD });
    if (kind === 'pillar') return new THREE.ShaderMaterial({ uniforms: U({ uW: C(), uB: C(), uA: 0, uT: 0 }), vertexShader: FLAT_VS, fragmentShader: PILLAR_FS, ...ADD });
    if (kind === 'helix') return new THREE.ShaderMaterial({ uniforms: U({ uW: C(), uB: C(), uA: 0, uP: 0 }), vertexShader: FLAT_VS, fragmentShader: HELIX_FS, ...ADD });
    return super._mat(kind);
  }
  /** Tripo 소품(있으면, this.tri) 또는 절차 메시 — 같은 규격(tools/blender/fx_chef_tripo.py). 둘 다 uA·uGlow 가 있음 */
  propC(e, tri, proc, o = {}) { return this.prop(e, tri, proc, o); }
  /** 그림에만 있는 순간의 효과음(판정 순간 소리는 js/chef.js 가 냄) — 같은 소리 0.08초 안 겹침 막음 */
  sfxq(name) { const t = performance.now(), k = this._sndT || (this._sndT = {}); if (k[name] && t - k[name] < 80) return; k[name] = t; this.sfx(name); }
  /** 마법진: 바닥 판(일반 블렌딩) + 같은 무늬의 가산 빛 층. r = 반지름(판정 반경 이하). o: col [안쪽 빛, 몸, 금테], v 무늬, life, draw(그려지는 초), hold, out,
   *  follow() -> three 좌표, spin, a, glowA, y, rot. handle {end(), setA(k)} */
  circle(at, r, o = {}) {
    const C = CHEFFX.col, cs = o.col || [C.cream, C.fire, C.gold], life = o.life ?? 1.0, dr = o.draw ?? 0.18, out = o.out ?? 0.4; let endT = -1, k2 = 1;
    const e = this._fx('circle', o.hold ? 1e9 : life, (e, dt) => {
      if (endT >= 0) { endT += dt; if (endT >= out) { e.t = e.life; return; } }
      if (o.follow) { const p = o.follow(); if (p) e.g.position.set(p.x, p.y + (o.y ?? 0.05), p.z); }
      const t = e.t, fade = endT >= 0 ? 1 - endT / out : (o.hold ? 1 : 1 - smooth(life - out, life, t)), pop = 1 + 0.12 * (1 - easeOut(smooth(0, dr + 0.1, t)));
      for (const m of [base, glow]) { const u = m.material.uniforms; u.uP.value = easeOut(smooth(0, dr, t)); u.uT.value = t * (o.spin ?? 1); m.scale.set(r * 2 * pop, r * 2 * pop, 1); }
      base.material.uniforms.uA.value = (o.a ?? 0.85) * fade * k2; glow.material.uniforms.uA.value = (o.glowA ?? 0.6) * fade * k2 * (1 + 0.5 * (1 - smooth(dr, dr + 0.35, t)));
    });
    const p0 = (o.follow && o.follow()) || at || _d.set(0, 0, 0); e.g.position.set(p0.x, p0.y + (o.y ?? 0.05), p0.z);
    const mk = (kind, order) => { const m = this._m(e, kind, this.quad, order), u = m.material.uniforms; u.uW.value.setHex(cs[0]); u.uB.value.setHex(cs[1]); u.uG.value.setHex(cs[2]); u.uV.value = o.v ?? 0; u.uA.value = 0; u.uP.value = 0; m.rotation.set(-Math.PI / 2, 0, o.rot ?? 0); return m; };
    const base = mk('sigil', 1), glow = mk('sigilA', 2);
    return this._h(e, { end: () => { if (endT < 0) endT = 0; }, setA: (k) => { k2 = k; }, dispose: () => { if (endT < 0) endT = 0; } });
  }
  /** 빛기둥: 바닥 at 에서 위로, 반지름 r, 높이 h — 빠르게 솟았다가 가늘어지며 사라짐 */
  pillar(at, r, h, o = {}) {
    const life = o.life ?? 0.5, cs = o.col || [CHEFFX.col.cream, CHEFFX.col.gold];
    const e = this._fx('pillar', life, (e) => { const k = e.t / life, rise = easeOut(smooth(0, 0.25, k)); m.scale.set(r * (1 - 0.55 * smooth(0.3, 1, k)), h * (0.25 + 0.75 * rise), r * (1 - 0.55 * smooth(0.3, 1, k)));
      m.material.uniforms.uA.value = (o.a ?? 1) * CHEFFX.intensity * smooth(0, 0.08, k) * (1 - smooth(0.45, 1, k)); m.material.uniforms.uT.value = e.t; });
    e.g.position.copy(at); const m = this._m(e, 'pillar', this.geo.chef_pillar, 5); m.material.uniforms.uW.value.setHex(cs[0]); m.material.uniforms.uB.value.setHex(cs[1]); return e;
  }
  /** 나선 띠: follow() (three, 발밑) 둘레로 아래에서 위로 감아 오름 */
  helix(follow, r, h, o = {}) {
    const life = o.life ?? 0.9, cs = o.col || [CHEFFX.col.cream, CHEFFX.col.gold];
    const e = this._fx('helix', life, (e) => { const p = follow(); if (p) e.g.position.copy(p); const k = e.t / life; m.material.uniforms.uP.value = easeOut(k) * 1.5; m.rotation.y = e.t * (o.spin ?? 2.5);
      m.material.uniforms.uA.value = (o.a ?? 1) * CHEFFX.intensity * (1 - smooth(0.7, 1, k)); });
    const m = this._m(e, 'helix', this.geo.chef_helix, 5); m.scale.set(r, h, r); m.material.uniforms.uW.value.setHex(cs[0]); m.material.uniforms.uB.value.setHex(cs[1]); const p = follow(); if (p) e.g.position.copy(p); return e;
  }
  /** 세운 고리(카메라를 보는 얇은 고리)가 퍼짐 — 명중 순간 */
  vring(at, size, w, b, life = 0.26, a = 1.0) {
    const e = this._fx('vring', life, (e) => { const k = e.t / life; m.quaternion.copy(this.camQ); m.scale.setScalar(size * (0.3 + 0.9 * easeOut(k))); m.material.uniforms.uA.value = CHEFFX.intensity * a * (1 - smooth(0.35, 1, k)); });
    e.g.position.copy(at); const m = this.spr(e, 1, w, b, 6); m.material.uniforms.uP.value = 0.75; return e;
  }
  /** 명중 한 번의 묶음: 별 섬광 + 세운 고리 + 별·반짝이(+ 불티/조각). s = 크기, cols = [밝은, 몸, 별색…] */
  bang(at, s, cols, o = {}) {
    this.flash(at, s * 1.15, cols[0], cols[1], 0.13, o.a ?? 1.1); this.vring(at, s * 1.5, cols[0], cols[1], 0.26, 0.9);
    const sc = cols.length > 2 ? cols.slice(2) : [cols[0]];
    this.emit('star', at, o.stars ?? 5, { col: sc, speed: [1.2, 2.6], up: [0.8, 2.0], size: [0.05, 0.085], life: [0.4, 0.65], g: 5, glow: 0.8, ground: o.ground });
    this.emit('glint', at, o.glints ?? 6, { col: sc, speed: [0.6, 1.8], up: [0.4, 1.4], size: [0.2, 0.34], life: [0.25, 0.45], g: 0, drag: 3, a: 0.9 });
    if (o.embers) this.emit('ember', at, o.embers, { col: [0xffd070, 0xff8a30, 0xff5a20], speed: [1.4, 3.0], up: [1.0, 2.6], size: [0.025, 0.045], life: [0.35, 0.6], g: 7, glow: 1.2, ground: o.ground });
    if (o.shards) this.emit('shard', at, o.shards, { col: o.shardCol || [0xffe0a0, 0xffc870], speed: [1.4, 3.2], up: [1.2, 2.6], size: [0.08, 0.16], life: [0.45, 0.7], g: 9, glow: 0.4, ground: o.ground, bounce: 0.2 });
  }
  /** 불꽃 덩어리가 땅에서 솟아오름(인스턴스 'flame', 노랑 → 주홍) — 반지름 r 안 */
  fireUp(at, r, n, o = {}) {
    const sz = o.size || [0.22, 0.4], k = 1.25;
    this.emit('flame', at, n, { col: o.col || [0xffc040, 0xff8a20, 0xff5a20], spread: r, speed: [0, 0.3], up: o.up ? [o.up[0] * 1.3, o.up[1] * 1.3] : [2.0, 3.2], size: [sz[0] * k, sz[1] * k], end: 0.1, life: o.life || [0.26, 0.44], g: -2.5, drag: 2, glow: 1.15, spin: 2.5, upright: true, sy: 2.2, a: 0.95, fin: 0.04, fo: 0.3, keep: o.keep });
    this.emit('glint', at, Math.max(1, n >> 1), { col: [0xffd060, 0xff8a30], spread: r, speed: [0, 0.2], up: [1.0, 2.0], size: [sz[0] * 2.2, sz[1] * 2.2], life: [0.2, 0.32], g: 0, drag: 1, a: 0.7, keep: o.keep });
  }
  /** 수직 불꽃 혀: 세로로 늘인 가산 원판(빌보드) */
  flameTongue(e, order = 6) { return this.puff(e, CHEFFX.col.fireB, CHEFFX.col.ember, order); }   // 알파 혼합(밝은 바닥에서도 읽힘): 아래 노랑 -> 위 주홍
  flash(at, s, w, b, life = 0.14, a = 1.2) {
    const e = this._fx('flash', life, (e) => { const k = e.t / life; m.quaternion.copy(this.camQ); m.scale.setScalar(s * (0.6 + 0.6 * easeOut(k))); m.material.uniforms.uA.value = CHEFFX.intensity * a * (1 - smooth(0.1, 1, k)); });
    e.g.position.copy(at); const m = this.spr(e, 3, w, b, 7); return e;
  }
  ring(at, r, w, b, life = 0.3, a = 1.4, from = 0.4) {
    const e = this._fx('ring', life, (e) => { const k = e.t / life; this._flat(m, r * (from + (1 - from) * easeOut(k)), 0.06); m.material.uniforms.uA.value = CHEFFX.intensity * a * (1 - smooth(0.3, 1, k)); });
    e.g.position.copy(at); const m = this.spr(e, 1, w, b, 3); m.material.uniforms.uP.value = 0.6; return e;
  }
  steamPuffs(at, n, r, a = 0.4) { this._puffs(at, lite() ? Math.ceil(n / 2) : n, r, { c1: CHEFFX.col.steam, c2: CHEFFX.col.steamB, a, life: 0.6, rise: 0.8 }); }
  embers(at, n, gy) { if (this.geo.cook_drop) this._bits(at, lite() ? Math.ceil(n / 2) : n, { geo: this.geo.cook_drop, tint: 0xffa040, size: [0.025, 0.045], speed: [0.8, 2.0], up: [1.6, 3.0], ground: gy ?? at.y - 1, life: 0.5 }); }
  /** 손 위치(three) — 없으면 몸 앞 */
  hand(pc, f, fwd = 0.5, y = 1.0) { let h = null; try { h = pc.body && pc.body.handPoint && pc.body.handPoint(); } catch (e) { h = null; } return h ? new THREE.Vector3(h.x, h.y, h.z) : P3({ x: pc.pos.x + f.x * fwd, y: (pc.pos.y || 0) + y, z: pc.pos.z + f.z * fwd }); }

  // ================================================================== A1 인페르노 웍
  wok(pc, o = {}) {
    if (!this._ok() || !this.geo.chef_wok) return null;
    const K = CHEFFX.wok, f = o.f || { x: 0, z: 1 }, d3 = D3(f), flips = [o.t1 || 0.22, o.t2 || 0.5], low = lite(), I = CHEFFX.intensity;
    const life = flips[1] + 0.55, foods = [];
    const e = this._fx('wok', life, (e) => {
      const base = this.hand(pc, f, K.fwd, K.y).addScaledVector(d3, 0.32); base.y = Math.max(base.y - 0.1, (pc.pos.y || 0) + 0.75);
      // 뒤집기: 손목·팔꿈치가 움직이는 동안 웍이 앞으로 기울었다 위로 튕김(타격 = 재료가 떨어지는 순간)
      let tilt = 0, lift = 0; for (const T of flips) { const u = (e.t - (T - K.toss)) / (K.toss + 0.12); if (u > 0 && u < 1) { tilt += Math.sin(u * Math.PI) * (u < 0.45 ? 0.5 : -0.25); lift += Math.sin(u * Math.PI) * 0.12; } }
      w.position.copy(base).setY(base.y + lift); w.rotation.set(0, yawOf(f) + Math.PI, tilt, 'YXZ');
      const a = smooth(0, 0.08, e.t) * (1 - smooth(life - 0.15, life, e.t)); w.scale.setScalar(K.size * (0.7 + 0.3 * easeOut(e.t / 0.1))); w.material.uniforms.uA.value = a;
      // 재료: 웍 안에서 위로 포물선 -> 다음 타격 순간 웍에 다시 떨어짐(웍을 뚫고 지나가지 않음 — 바닥 높이 = 웍 안쪽)
      for (const p of foods) {
        let y = 0.06, u = -1; for (const T of flips) { const s = (e.t - (T - K.toss)) / K.toss; if (s >= 0 && s <= 1) u = s; }
        if (u >= 0) y = 0.06 + 4 * K.h * u * (1 - u) * p.h;
        p.m.position.copy(w.position).addScaledVector(d3, p.dx * K.size).add(_a.set(-d3.z, 0, d3.x).multiplyScalar(p.dz * K.size)); p.m.position.y = w.position.y + y * (0.9 + 0.2 * p.h);
        p.m.rotation.set(p.r0 + e.t * p.w, p.r0 * 2 + e.t * p.w * 0.6, 0); p.m.material.uniforms.uA.value = a;
      }
      gl.quaternion.copy(this.camQ); gl.position.copy(w.position).setY(w.position.y + 0.1); gl.scale.setScalar(0.9); gl.material.uniforms.uA.value = I * 0.35 * a * (0.7 + 0.3 * Math.sin(e.t * 20));
    });
    const w = this.propC(e, 'tripo_wok', 'chef_wok', { rim: 0xffb070, spec: 0.9 }), gl = this.spr(e, 0, CHEFFX.col.ember, CHEFFX.col.fire, 2);
    w.renderOrder = 5;
    // (1) 시전 준비: 발밑 불꽃 마법진(반지름 1.1 — 1타 부채꼴 3 m 안) + 웍으로 모이는 불씨
    const C0 = CHEFFX.col; this.circle(null, 1.1, { follow: () => P3(pc.pos), v: 1, col: [C0.ember, C0.fire, C0.gold], life, draw: 0.16, out: 0.3, spin: 1.6, a: 0.7, glowA: 0.55 });
    this.emit('glint', this.hand(pc, f, K.fwd, K.y), 6, { col: [C0.ember, C0.gold], spread: 0.5, speed: [0.1, 0.4], up: [0.2, 0.6], size: [0.16, 0.26], life: [0.2, 0.35], g: 0, drag: 4, a: 0.8 });
    for (let i = 0; i < (low ? K.foodLite : K.food); i++) { const m = this.solid(e, this.chips[i % this.chips.length], { spec: 0.4 }); m.scale.setScalar(0.09); m.renderOrder = 6; foods.push({ m, h: rnd(0.7, 1.15), dx: rnd(-0.3, 0.35), dz: rnd(-0.35, 0.35), r0: rnd(0, 6), w: rnd(-12, 12) }); }
    return this._h(e, { flame: (k, hits) => {
      const r = k ? o.r2 : o.r1, ang = k ? o.ang2 : o.ang1, g0 = P3(pc.pos), life2 = 0.36;
      const fx = this._fx('wokfan', life2, (x) => { const q = x.t / life2; fn.material.uniforms.uP.value = 0.25 + 0.85 * easeOut(q * 1.6); fn.material.uniforms.uA.value = I * (k ? 1.0 : 0.85) * (1 - smooth(0.45, 1, q));
        for (const t of tg) { t.m.quaternion.copy(this.camQ); t.m.position.y = t.y0 + q * 0.6; t.m.scale.set(t.s * 0.45, t.s * (1 + q), 1); t.m.material.uniforms.uA.value = I * 1.2 * smooth(0, 0.15, q) * (1 - smooth(0.4, 1, q)); } });
      fx.g.position.copy(g0); const fn = this.blend(fx, 5, this.fan(ang), CHEFFX.col.ember, CHEFFX.col.fire, 3); fn.position.y = 0.6; fn.rotation.set(0, yawOf(f), 0); fn.scale.set(r, 1, r);
      const tg = []; const n = low ? 3 : 6, h = ang * Math.PI / 360;
      for (let i = 0; i < n; i++) { const aa = -h + 2 * h * (i + 0.5) / n, rr = r * rnd(0.45, 0.9), m = this.flameTongue(fx); const dx = Math.cos(aa) * rr, dz = Math.sin(aa) * rr; m.position.set(d3.x * dx - d3.z * dz, 0.5, d3.z * dx + d3.x * dz); tg.push({ m, y0: 0.5, s: rnd(0.5, 0.8) * (k ? 1.2 : 1) }); }
      this.flash(w.position.clone(), k ? 0.9 : 0.6, 0xffffff, CHEFFX.col.fire);
      this.embers(w.position.clone(), k ? 7 : 4, g0.y);
      // (2)(3) 실제 부채꼴 안에서 불꽃 덩어리가 솟고 불티가 앞으로 쏟아짐, 2타는 금빛 별 + 바닥 그을음 고리
      const nF = k ? 12 : 8, hh = ang * Math.PI / 360;
      for (let i = 0; i < nF; i++) { const aa = -hh + 2 * hh * rnd(0.05, 0.95), rr = r * rnd(0.3, 0.88); _b.set(g0.x + (d3.x * Math.cos(aa) - d3.z * Math.sin(aa)) * rr, g0.y + 0.1, g0.z + (d3.z * Math.cos(aa) + d3.x * Math.sin(aa)) * rr); this.fireUp(_b, 0.15, 1, { size: k ? [0.3, 0.5] : [0.24, 0.4] }); }
      this.emit('ember', w.position, k ? 22 : 12, { col: [0xffe080, 0xff9a30, 0xff5a20], cone: d3, jit: Math.min(0.9, hh), speed: [2.5, 5.0], up: [0.6, 2.0], size: [0.025, 0.05], life: [0.35, 0.55], g: 5, drag: 1.4, glow: 1.3, ground: g0.y });
      if (k) { this.emit('star', w.position, 8, { col: [C0.gold, C0.ember, 0xffffff], cone: d3, jit: 0.6, speed: [1.5, 3.2], up: [1, 2.4], size: [0.05, 0.09], life: [0.4, 0.65], g: 5, glow: 0.9, ground: g0.y }); this.ring(g0, r * 0.95, C0.ember, C0.fire, 0.4, 1.0, 0.3); }
      for (const p of hits || []) { const at = P3({ x: p.x, y: (p.y || 0) + 0.9, z: p.z }); this.flash(at, 0.55, CHEFFX.col.ember, CHEFFX.col.fire, 0.12, 1.0); this.bang(at, k ? 0.75 : 0.55, [0xfff0c0, C0.fire, C0.ember, C0.gold], { stars: k ? 4 : 2, glints: 4, embers: k ? 8 : 4, ground: at.y - 0.9 }); }
    } });
  }

  // ================================================================== A2 그랑 플람베
  flambe(c, o = {}) {
    if (!this._ok()) return null;
    const I = CHEFFX.intensity, C = CHEFFX.col, g0 = P3(c), r = o.r || 2.6, from = P3(o.from || c).setY((o.from ? o.from.y || 0 : 0) + 1.1), sp = o.splash || 0.24, ig = o.ignite || 0.7, low = lite();
    const life = ig + 0.9, tongues = [], W0 = P3(c); let lit = false;
    // (1) 조준점 마법진: 소스가 닿기 전부터 그려지고(실제 반경 r), 점화 순간 가장 밝음 → 잔광
    const sig = this.circle(W0, r * 0.98, { v: 1, col: [C.ember, C.fire, C.gold], life: life + 0.5, draw: sp + 0.1, out: 0.5, spin: 1.2, a: 0.75, glowA: 0.5 });
    const e = this._fx('flambe', life, (e) => {
      if (!lit && e.t >= ig) { lit = true;   // (3) 점화: 기둥 같은 불길 + 실제 반경 안 불꽃 덩어리 + 불티 고리
        sig.setA(1.25); this.pillar(W0, 0.9, 3.4, { col: [0xfff0a0, C.fire], life: 0.6, a: 0.9 }); this.pillar(W0, r * 0.7, 1.4, { col: [C.blue, C.blueB], life: 0.35, a: 0.6 });
        this.fireUp(W0, r * 0.85, 16, { size: [0.3, 0.55], up: [1.6, 2.8] });
        this.emit('ember', W0.clone().setY(W0.y + 0.2), 26, { col: [0xffe080, 0xff9a30, 0xff5a20], ring: r * 0.3, speed: [1.2, 3.0], up: [1.6, 3.6], size: [0.025, 0.05], life: [0.5, 0.8], g: 5, glow: 1.3, ground: W0.y });
        this.emit('star', W0.clone().setY(W0.y + 0.6), 8, { col: [C.gold, C.ember, 0xffffff], speed: [1.2, 2.6], up: [1.4, 2.6], size: [0.05, 0.09], life: [0.5, 0.7], g: 5, glow: 0.9, ground: W0.y });
        this.vring(W0.clone().setY(W0.y + 0.8), 2.2, 0xfff0c0, C.fire, 0.3, 0.9); }
      if (e.t > sp && e.t < ig && rnd(0, 1) < 0.35) this.emit('glint', W0, 1, { col: [C.amber, C.gold], spread: r * 0.8, speed: [0, 0.2], up: [0.3, 0.8], size: [0.18, 0.28], life: [0.25, 0.4], g: 0, drag: 2, a: 0.8 });
      // 소스 줄기: 손에서 조준점으로 포물선(누른 순간 ~ splash)
      const u = clamp01(e.t / sp); blob.position.lerpVectors(from, g0, u); blob.position.y += Math.sin(u * Math.PI) * 1.0; blob.quaternion.copy(this.camQ); blob.scale.setScalar(0.6); blob.material.uniforms.uA.value = e.t < sp ? 0.95 : 0;
      // 바닥 웅덩이: 낮고 반투명한 호박색 원판(테두리 쪽 진함)
      const pk = smooth(sp, sp + 0.12, e.t); this._flat(pool, r * (0.4 + 0.6 * easeOut((e.t - sp) / 0.15))); pool.position.y = 0.09; pool.material.uniforms.uA.value = 1.6 * pk * (1 - smooth(life - 0.4, life, e.t));
      // 불씨: 점화 0.15초 전 손에서 웅덩이로
      const eu = clamp01((e.t - (ig - 0.15)) / 0.15); em.visible = eu > 0 && eu < 1; em.position.lerpVectors(from, g0, eu); em.position.y += Math.sin(eu * Math.PI) * 0.6; em.quaternion.copy(this.camQ); em.scale.setScalar(0.3); em.material.uniforms.uA.value = I * 1.4;
      // 파란 불길이 소스를 따라 테두리로 번짐(0.12초) -> 주홍 불꽃
      const bu = (e.t - ig) / 0.14; this._flat(blue, r * (0.2 + 0.8 * easeOut(bu))); blue.position.y = 0.07; blue.material.uniforms.uA.value = bu > 0 ? I * 1.6 * (1 - smooth(0.6, 2.2, bu)) : 0;
      for (const t of tongues) { const q = (e.t - ig - t.d) / 0.55; t.m.visible = q > 0 && q < 1; if (!t.m.visible) continue; t.m.quaternion.copy(this.camQ); t.m.position.y = 0.35 + q * 0.7; t.m.scale.set(t.s * 0.5, t.s * (1.1 + 0.6 * Math.sin(q * 3.1)), 1); t.m.material.uniforms.uA.value = I * 1.25 * smooth(0, 0.12, q) * (1 - smooth(0.5, 1, q)); }
    });
    e.g.position.copy(g0); from.sub(g0); g0.set(0, 0, 0);   // 그룹 기준 좌표
    const blob = this.puff(e, 0xffa030, 0xa04a10, 5), pool = this.puff(e, 0xe08020, 0x8a3a08, 2), em = this.spr(e, 0, 0xffffff, C.ember, 7), blue = this.spr(e, 1, C.blue, C.blueB, 3);
    blue.material.uniforms.uP.value = 1;
    const n = low ? 6 : 11; for (let i = 0; i < n; i++) { const a = rnd(0, Math.PI * 2), rr = r * Math.sqrt(rnd(0.05, 0.85)), m = this.flameTongue(e); m.position.set(Math.cos(a) * rr, 0.3, Math.sin(a) * rr); tongues.push({ m, d: (rr / r) * 0.14, s: rnd(0.55, 0.95) }); }
    const at = e.g.position.clone();
    return this._h(e, {
      steam: (p) => { const q = P3({ x: p.x, y: (p.y || 0) + 0.8, z: p.z }); this.flash(q, 0.9, 0xffffff, C.steamB, 0.16, 1.0); this.steamPuffs(q, 5, 0.9, 0.5); this.ring(P3(p), Math.min(1.4, (p.r || 0.5) + 0.7), C.steam, C.steamB, 0.3, 1.0);
        this.bang(q, 0.8, [0xffffff, 0x9ad8ff, 0xffffff, C.ice], { stars: 4, glints: 6 }); this.emit('mist', q, 7, { col: [0xfff8f0, 0xe8f0ff], spread: 0.4, speed: [0.6, 1.4], up: [0.4, 1.2], size: [0.5, 0.8], end: 1.8, life: [0.5, 0.8], g: -0.5, drag: 2.5, a: 0.45, fo: 0.3 }); },
      burn: (hits) => { this.embers(at.clone().setY(at.y + 0.4), 8, at.y); for (const p of hits) { const q = P3({ x: p.x, y: (p.y || 0) + 0.7, z: p.z }); this.flash(q, 0.5, C.ember, C.fire, 0.12, 0.9); this.bang(q, 0.6, [0xfff0c0, C.fire, C.ember, C.gold], { stars: 3, glints: 4, embers: 6, ground: q.y - 0.7 }); } },
    });
  }

  // ================================================================== A3 시그니처 압력솥
  cooker(pos, o = {}) {
    if (!this._ok() || !this.geo.chef_cooker) return null;
    const C = CHEFFX.col, I = CHEFFX.intensity, g0 = P3(pos), fuse = o.fuse || 2.2, warnAt = fuse - (o.warn || 1), r = o.r || 2.8; let gauge = 0, puffT = 0;
    const e = this._fx('cooker', 1e9, (e, dt) => {
      const shake = gauge > 0.5 ? (gauge - 0.5) * 2 : 0;
      body.scale.setScalar(0.85 * (0.4 + 0.6 * easeOut(e.t / 0.15))); body.position.set(Math.sin(e.t * 47) * 0.012 * shake, 0, 0); body.material.uniforms.uGlow.value = 0.18 * shake * (0.5 + 0.5 * Math.sin(e.t * 30));
      lid.scale.copy(body.scale); lid.position.set(body.position.x, 0.62 * body.scale.y + Math.abs(Math.sin(e.t * 38)) * 0.05 * shake, 0); lid.rotation.set(Math.sin(e.t * 41) * 0.08 * shake, 0, Math.sin(e.t * 33) * 0.08 * shake);
      // 바닥 경고: 폭발 1초 전부터 실제 반경 r의 얇은 고리가 깜빡이며 차오름
      const w = smooth(warnAt, warnAt + 0.2, e.t); this._flat(wr, r); wr.material.uniforms.uA.value = I * w * (0.55 + 0.45 * Math.sin(e.t * 18)); wr.material.uniforms.uP.value = 0.3 + 0.7 * clamp01((e.t - warnAt) / (fuse - warnAt));
      this._flat(sr, o.sr || 2.4); sr.material.uniforms.uA.value = 0.18 * smooth(0, 0.3, e.t);
      if (lid.visible === false) { body.rotation.set(Math.sin(e.t * 41) * 0.05 * shake, 0, Math.sin(e.t * 33) * 0.05 * shake); body.position.y = Math.abs(Math.sin(e.t * 38)) * 0.03 * shake; }
      sig.setA(1 + 0.8 * smooth(warnAt, fuse, e.t));
      puffT -= dt; if (puffT <= 0 && e.t > 0.2) { puffT = 0.5 - 0.3 * gauge; const top = g0.clone().setY(g0.y + 0.9); this._puffs(top, lite() ? 1 : 2, 0.5, { c1: C.steam, c2: C.steamB, a: 0.35 + 0.2 * gauge, life: 0.6, rise: 1.0 });
        this.emit('mist', top, 2, { col: [0xfff8f0, 0xf0e8e0], spread: 0.15, speed: [0.1, 0.4], up: [1.2, 2.0], size: [0.35, 0.5], end: 2.2, life: [0.6, 0.9], g: -0.4, drag: 1.5, a: 0.35 + 0.25 * gauge, fo: 0.3 });
        if (gauge > 0.5) this.emit('glint', top, 2, { col: [C.ember, C.gold], spread: 0.3, speed: [0.3, 0.8], up: [0.6, 1.4], size: [0.16, 0.26], life: [0.25, 0.4], g: 0, drag: 2, a: 0.9 }); }
    });
    e.g.position.copy(g0);
    const body = this.propC(e, 'tripo_cooker', 'chef_cooker', { rim: 0xffc090, spec: 0.8 }), lid = this.solid(e, this.geo.chef_cooker_lid, { rim: 0xffffff, spec: 1.0 });
    if (body.userData.tex) lid.visible = false;   // Tripo 압력솥은 뚜껑까지 한 덩어리 — 떨림은 몸통 전체로
    const wr = this.spr(e, 1, 0xfff0d0, C.fire, 3), sr = this.spr(e, 1, C.steam, C.steamB, 2);
    let boomed = false;
    // (1) 놓는 순간: 구리빛 마법진(증기 둔화 반경 sr 안)이 그려지고 솥이 통 떨어지며 별이 튐 — 폭발·치움까지 남음
    const sig = this.circle(g0, (o.sr || 2.4) * 0.96, { v: 3, col: [C.cream, C.copper, C.gold], hold: true, draw: 0.3, out: 0.35, spin: 0.7, a: 0.55, glowA: 0.35 });
    this.bang(g0.clone().setY(g0.y + 0.3), 0.6, [0xfff0d0, C.copper, C.gold, C.cream], { stars: 4, glints: 5, ground: g0.y });
    return this._h(e, {
      puff: () => {}, gauge: (k) => { gauge = k; },
      boom: () => {
        boomed = true; const at = g0.clone().setY(g0.y + 0.6), lidFrom = lid.getWorldPosition(new THREE.Vector3()), dir = new THREE.Vector3(rnd(-0.4, 0.4), 1, rnd(-0.4, 0.4)).normalize();
        const b = this._fx('cookerboom', 0.8, (x) => { const k = x.t / 0.8; ld.position.copy(lidFrom).addScaledVector(dir, 5.5 * x.t).setY(lidFrom.y + 6 * x.t - 9 * x.t * x.t); ld.rotation.set(x.t * 14, x.t * 9, 0); ld.material.uniforms.uA.value = 1 - smooth(0.6, 1, k); });
        const ld = this.solid(b, this.geo.chef_cooker_lid, { rim: 0xffffff, spec: 1 }); ld.scale.setScalar(0.85);   // 날아가는 뚜껑: 장식(판정 없음)
        this.flash(at, 1.6, 0xffffff, C.fire, 0.16, 1.3); this.ring(g0, r, 0xfff0d0, C.fire, 0.32, 1.6); this.steamPuffs(at, 7, r * 0.6, 0.45); this.embers(at, 10, g0.y);
        // (3) 증기·불 기둥 + 실제 반경 r 안 불꽃 고리 + 구리 파편·별 + 퍼지는 김 → (4) 마법진이 밝게 터지고 사라짐
        sig.setA(1.6); sig.end(); this.pillar(g0, 1.1, 4.2, { col: [0xffffff, C.steamB], life: 0.55 }); this.pillar(g0, 0.6, 3.0, { col: [0xfff0a0, C.fire], life: 0.45 });
        this.bang(at, 1.5, [0xfff4d0, C.fire, C.gold, C.ember, 0xffffff], { stars: 10, glints: 12, embers: 18, shards: 10, shardCol: [C.copper, 0xffc090, C.silver], ground: g0.y });
        this.fireUp(g0, r * 0.85, 14, { size: [0.28, 0.5] });
        this.emit('mist', at, 12, { col: [0xfff8f0, 0xe8e4e0], ring: 0.3, speed: [2.0, 3.6], up: [0.2, 0.8], size: [0.5, 0.8], end: 2.0, life: [0.5, 0.8], g: 0, drag: 2.6, a: 0.5, fo: 0.3 });
      },
      dispose: () => { sig.end(); if (!boomed) this.steamPuffs(g0.clone().setY(g0.y + 0.4), 2, 0.4, 0.3); this._free(e); },
    });
  }

  // ================================================================== A4 브로셰트 러시
  skewers(pc, o = {}) {
    if (!this._ok() || !this.geo.cook_skewer) return null;
    const f = o.f || { x: 0, z: 1 }, d3 = D3(f), n = o.n || 4, launch = o.launch || 0.26, gap = o.gap || 0.11, side = new THREE.Vector3(-d3.z, 0, d3.x), C = CHEFFX.col, I = CHEFFX.intensity;
    const held = [];
    const e = this._fx('skewers', launch + n * gap + 0.2, (e) => {
      const base = P3(pc.pos);
      for (const h of held) {
        if (h.gone) { h.m.visible = false; continue; }
        const k = (h.i - (n - 1) / 2), a = smooth(0, 0.12, e.t - h.i * 0.03);
        h.m.position.copy(base).addScaledVector(side, k * 0.42).addScaledVector(d3, 0.2).setY(base.y + 1.55 + Math.abs(k) * 0.08); h.m.quaternion.setFromUnitVectors(_a.set(1, 0, 0), d3);
        h.m.scale.setScalar(1.7 * (0.4 + 0.6 * a)); h.m.material.uniforms.uA.value = a; h.m.material.uniforms.uGlow.value = 0.25 * smooth(launch - 0.15, launch, e.t);
        h.f.quaternion.copy(this.camQ); h.f.position.copy(h.m.position).addScaledVector(d3, 0.55).setY(h.m.position.y - 0.15); h.f.scale.set(0.35, 0.6, 1); h.f.material.uniforms.uA.value = I * 0.9 * smooth(launch - 0.2, launch - 0.08, e.t) * (0.7 + 0.3 * Math.sin(e.t * 30 + h.i));
      }
    });
    for (let i = 0; i < n; i++) held.push({ i, m: this.solid(e, this.geo.cook_skewer, { rim: 0xffd0a0, spec: 0.6 }), f: this.flameTongue(e), gone: false });
    // (1) 발밑 작은 불꽃 마법진 + 머리 위 꼬치로 모이는 불씨
    this.circle(null, 0.95, { follow: () => P3(pc.pos), v: 0, col: [C.ember, C.fire, C.gold], life: launch + n * gap + 0.35, draw: 0.15, out: 0.3, spin: 2, a: 0.6, glowA: 0.5 });
    { const top = P3(pc.pos).setY((pc.pos.y || 0) + 1.6); this.emit('glint', top, 8, { col: [C.ember, C.gold], ring: 0.9, speed: [-1.6, -1.0], up: [-0.2, 0.2], size: [0.16, 0.26], life: [0.22, 0.32], g: 0, drag: 0.5, a: 0.9 }); }
    return this._h(e, { fire: (i, p, dir) => {
      const h = held[i]; if (h) h.gone = true;
      const dd = D3(dir), x = this._fx('skewer', 3, (x) => { m.quaternion.setFromUnitVectors(_a.set(1, 0, 0), dd); tr.quaternion.copy(this.camQ); tr.position.copy(m.position).addScaledVector(dd, -0.3); tr.scale.set(0.9, 0.3, 1); tr.material.uniforms.uA.value = I * 0.7; });
      const m = this.solid(x, this.geo.cook_skewer, { rim: 0xffd0a0, spec: 0.6 }), tr = this.spr(x, 2, C.ember, C.fire, 3); m.scale.setScalar(1.7); m.material.uniforms.uGlow.value = 0.2;
      m.position.copy(P3(p)).addScaledVector(dd, -0.55);
      this._alignLine(tr, dd);
      this.emit('star', m.position, 3, { col: [C.gold, C.ember], cone: dd, jit: 0.5, speed: [1, 2], up: [0.4, 1.2], size: [0.04, 0.07], life: [0.3, 0.45], g: 3, glow: 0.9 });
      let tick = 0;
      return { set: (q) => { m.position.copy(P3(q)).addScaledVector(dd, -0.55); if ((tick++ & 1) === 0) { this.emit('ember', m.position, 2, { col: [0xffe080, 0xff8a30], spread: 0.08, speed: [0.1, 0.5], up: [0.2, 0.8], size: [0.025, 0.04], life: [0.25, 0.4], g: 2, glow: 1.3 });
          this.emit('glint', m.position, 1, { col: [C.ember, C.gold], speed: [0, 0.2], up: [0, 0.2], size: [0.2, 0.3], life: [0.18, 0.26], g: 0, a: 0.8 }); } },
        pierce: (q) => { const at = P3(q); this.flash(at, 0.6, 0xffffff, C.fire, 0.1, 1.1); if (this.chips.length) this._bits(at, lite() ? 1 : 3, { size: [0.05, 0.08], speed: [1, 2], up: [1.2, 2.2], ground: at.y - 0.9, life: 0.4 });
          this.bang(at, 0.6, [0xfff0c0, C.fire, C.gold, C.ember], { stars: 3, glints: 4, embers: 6, ground: at.y - 0.9 }); },
        end: (q) => { x.life = Math.min(x.life, x.t + 0.12); }, dispose: () => this._free(x) };
    } });
  }

  // ================================================================== A5 마스터 셰프 쇼타임
  show(c, o = {}) {
    if (!this._ok() || !this.geo.chef_cloche) return null;
    const K = CHEFFX.show, C = CHEFFX.col, I = CHEFFX.intensity, f = o.f || { x: 0, z: 1 }, g0 = P3(c), pr = o.prep, st = o.stir, cl = o.cloche, life = cl.t + 0.6, foods = [];
    const prepEnd = pr.t + pr.n * pr.gap + 0.05, stirEnd = st.t + st.n * st.gap + 0.15;
    let chopT = -9, tossT = -9;
    const e = this._fx('show', life, (e) => {
      // ① 반투명 조리대(은쟁반을 넓게) + 엇갈리는 식칼 두 자루 — 손질 단계에만
      const a1 = smooth(0, 0.1, e.t) * (1 - smooth(prepEnd, prepEnd + 0.15, e.t)); board.scale.set(K.counter, 1, K.counter); board.position.y = 0.05; board.material.uniforms.uA.value = 0.45 * a1;
      const cu = clamp01((e.t - chopT) / 0.12);
      for (let i = 0; i < 2; i++) { const kn = knives[i], s = i ? 1 : -1; kn.position.set(s * 0.35 * (1 - cu), 1.0 + 0.6 * (1 - Math.sin(cu * Math.PI)), 0); kn.rotation.set(0, Math.PI / 2, s * (0.9 - 1.6 * Math.sin(cu * Math.PI))); kn.scale.setScalar(1.3); kn.material.uniforms.uA.value = a1; }
      // ② 거대한 웍: 볶음 단계에만, 재료가 불과 함께 떠오름
      const a2 = smooth(prepEnd - 0.1, prepEnd + 0.05, e.t) * (1 - smooth(stirEnd, stirEnd + 0.15, e.t)), tu = clamp01((e.t - tossT) / 0.32);
      wk.scale.setScalar(K.wok * (0.6 + 0.4 * a2)); wk.position.y = 0.25 + 0.15 * Math.sin(tu * Math.PI); wk.rotation.set(0, yawOf(f), -0.25 * Math.sin(tu * Math.PI)); wk.material.uniforms.uA.value = a2;
      for (const p of foods) { const y = 0.4 + 2.2 * p.h * 4 * tu * (1 - tu); p.m.position.set(p.x, y, p.z); p.m.rotation.set(e.t * p.w, e.t * p.w * 0.7, 0); p.m.material.uniforms.uA.value = a2; }
      // ③ 금빛 클로슈: 하늘에서 내려와 cl.t에 바닥을 덮음
      const d = clamp01((e.t - (cl.t - 0.35)) / 0.35), after = e.t - cl.t;
      cloche.visible = e.t > cl.t - 0.4; cloche.scale.setScalar(K.cloche * (after > 0 ? 1 + 0.08 * Math.max(0, 1 - after / 0.1) : 1)); cloche.position.y = after > 0 ? Math.max(0, after - 0.25) * 3 : K.drop * (1 - d * d);
      cloche.material.uniforms.uA.value = (after > 0 ? 1 - smooth(0.25, 0.55, after) : smooth(0, 0.1, d)) * 0.95; cloche.material.uniforms.uGlow.value = after > 0 ? 0.4 * Math.max(0, 1 - after / 0.2) : 0.08;
      sh.visible = cloche.visible; this._flat(sh, K.cloche * 1.05 * (0.4 + 0.6 * d)); sh.position.y = 0.04; sh.material.uniforms.uA.value = after > 0 ? 0 : 0.7 * d;
    });
    e.g.position.copy(g0);
    const board = this.solid(e, this.geo.chef_tray, { tint: 0xd8e4f4, rim: 0xffffff, spec: 0.8 }), knives = [0, 1].map(() => this.solid(e, this.geo.cook_knife, { rim: 0xc8e0ff, spec: 1.3 }));
    const wk = this.propC(e, 'tripo_wok', 'chef_wok', { rim: 0xffb070, spec: 0.9 }), cloche = this.propC(e, 'tripo_cloche', 'chef_cloche', { tint: 0xffb22a, rim: 0xffe090, spec: 1.6, gain: 1.3 }), sh = this.puff(e, 0x402010, 0x201008, 1);
    board.renderOrder = 1; cloche.renderOrder = 7;
    // (1) 무대 마법진: 클로슈 반경(cl.r) 금빛 레스토랑 문양이 쇼 내내 돌고, 단계마다 밝아짐 → 마무리 뒤 잔광
    const sig = this.circle(g0, cl.r * 0.98, { v: 5, col: [C.cream, C.fire, C.gold], life: life + 0.6, draw: 0.35, out: 0.6, spin: 0.8, a: 0.7, glowA: 0.45 }); this.sfxq('cf_sigil');
    this.emit('glint', g0, 14, { col: [C.gold, C.ember, 0xffffff], ring: cl.r * 0.9, speed: [0, 0.2], up: [0.6, 1.4], size: [0.2, 0.32], life: [0.4, 0.7], g: 0, drag: 1, a: 0.85 });
    for (let i = 0; i < (lite() ? 4 : 7); i++) { const m = this.solid(e, this.chips[i % this.chips.length], { spec: 0.4 }); m.scale.setScalar(0.18); foods.push({ m, h: rnd(0.6, 1.1), x: rnd(-0.6, 0.6), z: rnd(-0.6, 0.6), w: rnd(-10, 10) }); }
    return this._h(e, {
      chop: (k, n) => { chopT = e.t; const at = g0.clone().setY(g0.y + 0.9); const lf = this._fx('chopline', 0.16, (x) => { const q = x.t / 0.16; ln.material.uniforms.uA.value = I * 2 * (1 - q); ln.scale.set(2.4 * (0.7 + 0.5 * q), 0.5, 1); });
        const ln = this.spr(lf, 2, 0xffffff, 0x9ad0ff, 7); lf.g.position.copy(at); this._alignLine(ln, _c.set(Math.cos(k * 1.3), 0, Math.sin(k * 1.3))); if (n) this._bits(at, lite() ? 2 : 4, { size: [0.08, 0.12], ground: g0.y, life: 0.45 });
        sig.setA(1.1 + 0.15 * k); this.vring(at, 1.6, 0xffffff, 0x9ad0ff, 0.22, 0.8); this.emit('glint', at, 6, { col: [0xffffff, 0xcfe8ff], spread: 0.8, speed: [0.8, 2.0], up: [0.2, 1.0], size: [0.2, 0.32], life: [0.2, 0.32], g: 0, drag: 3, a: 0.9 });
        this.emit('star', at, 3, { col: [0xffffff, 0xcfe8ff, C.gold], speed: [1, 2.2], up: [0.6, 1.6], size: [0.04, 0.07], life: [0.35, 0.5], g: 5, glow: 0.8, ground: g0.y }); },
      toss: (k, n) => { tossT = e.t; sig.setA(1.35); this.fireUp(g0, Math.min(o.stir.r || 4, cl.r) * 0.75, 12 + k * 4, { size: [0.32, 0.56], up: [1.8, 3.0] });
        this.emit('ember', g0.clone().setY(g0.y + 0.5), 20, { col: [0xffe080, 0xff9a30, 0xff5a20], spread: 0.6, speed: [1.5, 3.2], up: [2.0, 4.0], size: [0.03, 0.055], life: [0.5, 0.8], g: 6, glow: 1.3, ground: g0.y });
        this.pillar(g0, 1.0, 3.0, { col: [0xfff0a0, C.fire], life: 0.4, a: 0.8 }); for (let i = 0; i < (lite() ? 4 : 8); i++) { const a = i / 8 * Math.PI * 2, rr = rnd(0.6, 1.8); const m = this.flameTongue(this._fx('showflame', 0.5, (x) => { const q = x.t / 0.5; m.quaternion.copy(this.camQ); m.position.set(g0.x + Math.cos(a) * rr, g0.y + 0.4 + q * 1.2, g0.z + Math.sin(a) * rr); m.scale.set(0.45, 0.9 + q, 1); m.material.uniforms.uA.value = I * 1.2 * (1 - smooth(0.4, 1, q)); })); } },
      slam: (n) => {
        // (3) 금빛 클로슈 착지: 황금 빛기둥 + 큰 세운 고리 + 별비·금 꽃잎 + 바깥 불꽃 고리(cl.r ~ wave.r 사이 = 실제 충격파 띠) → (4) 마법진 잔광
        const wr = (o.wave && o.wave.r) || 6, top = g0.clone().setY(g0.y + 1.0); sig.setA(1.7);
        this.pillar(g0, 1.6, 6.5, { col: [0xfff4d0, C.gold], life: 0.7 }); this.pillar(g0, cl.r * 0.55, 2.2, { col: [0xfff0c0, C.goldB], life: 0.45, a: 0.7 });
        this.bang(top, 2.2, [0xfff4d0, C.gold, C.gold, 0xffffff, C.ember], { stars: 18, glints: 22, embers: 16, shards: 8, shardCol: [C.gold, 0xffe8a0], ground: g0.y });
        this.emit('star', g0.clone().setY(g0.y + 4.5), 16, { col: [C.gold, 0xffffff, C.ember], spread: cl.r * 0.8, speed: [0, 0.4], up: [-1.5, -0.5], size: [0.06, 0.1], life: [0.7, 1.0], g: 4, glow: 0.9, ground: g0.y, bounce: 0.4 });
        this.emit('petal', g0.clone().setY(g0.y + 2.5), 14, { col: [C.gold, 0xffe8a0, 0xfff4d0], spread: cl.r * 0.7, speed: [0.3, 1.0], up: [0.4, 1.4], size: [0.12, 0.2], end: 0.8, life: [0.9, 1.3], g: 1.2, drag: 1.6, spin: 4, glow: 0.6, ground: g0.y });
        for (let i = 0; i < (lite() ? 8 : 16); i++) { const a = (i / (lite() ? 8 : 16)) * Math.PI * 2, rr = (cl.r + wr) / 2; _b.set(g0.x + Math.cos(a) * rr, g0.y + 0.05, g0.z + Math.sin(a) * rr); this.fireUp(_b, 0.25, 1, { size: [0.3, 0.5], keep: true }); }
        this.helix(() => g0, 1.4, 3.2, { col: [0xfff4d0, C.gold], life: 0.9 }); sig.end();
        this.flash(g0.clone().setY(g0.y + 0.4), 2.2, 0xfff4d0, C.gold, 0.16, 1.2); this.ring(g0, cl.r, 0xfff0c0, C.gold, 0.3, 1.8, 0.6); this.ring(g0, (o.wave && o.wave.r) || 6, C.ember, C.fire, 0.45, 1.5, 0.5); this.steamPuffs(g0.clone().setY(g0.y + 0.2), 8, cl.r * 0.8, 0.4); this.embers(g0.clone().setY(g0.y + 0.3), 10, g0.y); },
    });
  }

  // ================================================================== B1 소르베 퀸텟
  sorbet(pc, o = {}) {
    if (!this._ok() || !this.geo.chef_sorbet) return null;
    const f = o.f || { x: 0, z: 1 }, d3 = D3(f), side = new THREE.Vector3(-d3.z, 0, d3.x), n = o.n || 5, launch = o.launch || 0.24, gap = o.gap || 0.09, C = CHEFFX.col, I = CHEFFX.intensity;
    const fan = [];
    const e = this._fx('sorbetfan', launch + n * gap + 0.1, (e) => {
      const base = P3(pc.pos);
      for (const s of fan) { if (s.gone) { s.m.visible = false; s.gl.visible = false; continue; }
        const k = (s.i - (n - 1) / 2) / ((n - 1) / 2 || 1), a = easeOut((e.t - s.i * 0.03) / 0.16);
        s.m.position.copy(base).addScaledVector(side, k * 0.9 * a).addScaledVector(d3, -0.2).setY(base.y + 1.2 + 0.5 * a + 0.25 * (1 - k * k)); s.m.scale.setScalar(0.17 * a); s.m.rotation.y = e.t * 2; s.m.material.uniforms.uA.value = a;
        s.gl.quaternion.copy(this.camQ); s.gl.position.copy(s.m.position); s.gl.scale.setScalar(0.5 * a); s.gl.material.uniforms.uA.value = I * 0.25 * a; }
    });
    for (let i = 0; i < n; i++) fan.push({ i, m: this.solid(e, this.geo.chef_sorbet, { tint: CHEFFX.fruit[i % 5], rim: 0xffffff, spec: 0.5 }), gl: this.spr(e, 0, C.ice, CHEFFX.fruit[i % 5], 3), gone: false });
    // (1) 발밑 파스텔 꽃잎 마법진 + 부채꼴로 떠오르는 소르베마다 반짝이
    this.circle(null, 1.0, { follow: () => P3(pc.pos), v: 4, col: [0xffffff, 0xffa8c8, C.gold], life: launch + n * gap + 0.4, draw: 0.16, out: 0.3, spin: 1.4, a: 0.6, glowA: 0.5 });
    { const top = P3(pc.pos).setY((pc.pos.y || 0) + 1.6); this.emit('glint', top, 10, { col: CHEFFX.fruit, spread: 1.0, speed: [0.2, 0.6], up: [0.2, 0.8], size: [0.18, 0.28], life: [0.3, 0.5], g: 0, drag: 2, a: 0.9 }); }
    return this._h(e, { fly: (i) => {
      if (fan[i]) fan[i].gone = true; const col = CHEFFX.fruit[i % 5], trail = [];
      const x = this._fx('sorbet', 3, (x) => { m.rotation.set(x.t * 7, x.t * 5, 0);
        for (let j = 0; j < trail.length; j++) { const t = trail[j]; t.quaternion.copy(this.camQ); t.position.lerp(m.position, 0.35 + j * 0.15); t.scale.setScalar(0.22 - j * 0.05); t.material.uniforms.uA.value = 0.35 - j * 0.1; } });
      const m = this.solid(x, this.geo.chef_sorbet, { tint: col, rim: 0xffffff, spec: 0.5 }); m.scale.setScalar(0.17);
      for (let j = 0; j < (lite() ? 1 : 3); j++) trail.push(this.puff(x, C.ice, col, 3));
      let tick = 0;
      return { set: (p) => { m.position.copy(P3(p)); if ((tick++ % 2) === 0) { this.emit('glint', m.position, 1, { col: [col, 0xffffff], speed: [0, 0.2], up: [0, 0.2], size: [0.2, 0.3], life: [0.2, 0.3], g: 0, a: 0.85 });
          this.emit('star', m.position, 1, { col: [col, 0xffffff], speed: [0.1, 0.4], up: [-0.2, 0.3], size: [0.03, 0.05], life: [0.3, 0.45], g: 1, glow: 0.9 }); } },
        hit: (p, ok) => { const at = P3(p); if (ok) { this.flash(at, 0.6, 0xffffff, col, 0.12, 1.0); this.ring(P3({ x: p.x, y: (p.y || 0) - 0.85, z: p.z }), 0.7, C.ice, C.iceB, 0.25, 0.9);
            this.bang(at, 0.65, [0xffffff, col, col, 0xffffff, C.ice], { stars: 4, glints: 5, shards: 4, shardCol: [col, C.ice, 0xffffff], ground: at.y - 0.9 }); }
          this._bits(at, lite() ? 2 : 4, { geo: this.geo.chef_shard, tint: col, size: [0.05, 0.09], speed: [1, 2.2], up: [1, 2], ground: at.y - 0.9, life: 0.4 }); this._free(x); },
        vanish: () => { this._puffs(m.position.clone(), 1, 0.2, { c1: C.ice, c2: col, a: 0.4, life: 0.3 }); this._free(x); }, dispose: () => this._free(x) };
    } });
  }

  // ================================================================== B2 프로즌 플레이팅
  plating(c, o = {}) {
    if (!this._ok()) return null;
    const C = CHEFFX.col, I = CHEFFX.intensity, g0 = P3(c), r = o.r || 2.6, bl = o.bloom || 0.6, life = bl + 0.9, lines = [], flowers = [];
    const e = this._fx('plating', life, (e) => {
      const a = smooth(0, 0.12, e.t) * (1 - smooth(life - 0.3, life, e.t));
      this._flat(rim, r * (0.92 + 0.08 * easeOut(e.t / 0.2))); rim.material.uniforms.uA.value = I * 0.9 * a; this._flat(rim2, r * 0.72); rim2.material.uniforms.uA.value = I * 0.5 * a;
      for (const l of lines) { const q = clamp01((e.t - l.d) / (bl - l.d)); l.m.scale.set(r * 0.95 * q, 0.35, 1); l.m.position.set(l.dx * r * 0.475 * q, 0.06, l.dz * r * 0.475 * q); l.m.material.uniforms.uA.value = I * 1.3 * a * (q > 0 ? 1 : 0); }
      for (const fl of flowers) { const q = (e.t - bl - fl.d) / 0.2; fl.m.visible = q > 0; if (q <= 0) continue; fl.m.scale.setScalar(fl.s * easeOut(q)); fl.m.material.uniforms.uA.value = 0.85 * (1 - smooth(life - 0.35, life, e.t)); }
    });
    e.g.position.copy(g0);
    const rim = this.spr(e, 1, C.silver, C.iceB, 3), rim2 = this.spr(e, 1, C.ice, C.iceB, 3); rim.material.uniforms.uP.value = 0.5;
    // (1) 접시 테두리 안쪽에 눈꽃 마법진(실제 반경 r 안)이 그려짐 → (4) 얼음꽃 뒤 천천히 사라짐
    const sig = this.circle(g0, r * 0.94, { v: 2, col: [0xffffff, C.iceB, C.silver], life: life + 0.5, draw: bl * 0.8, out: 0.6, spin: 0.9, a: 0.7, glowA: 0.5 });
    for (let i = 0; i < 6; i++) { const ang = i * Math.PI / 3 + 0.3, m = this.spr(e, 2, 0xffffff, C.iceB, 4); m.rotation.set(-Math.PI / 2, 0, ang); lines.push({ m, dx: Math.cos(ang), dz: -Math.sin(ang), d: i * 0.03 }); }
    if (this.geo.chef_shard) { const rings = lite() ? [[0, 1], [0.45, 5]] : [[0, 1], [0.35, 6], [0.7, 10]];
      for (const [rr, cnt] of rings) for (let j = 0; j < cnt; j++) { const a = j / cnt * Math.PI * 2 + rr, m = this.solid(e, this.geo.chef_shard, { tint: 0xd8f0ff, rim: 0xffffff, spec: 1.2 }); m.position.set(Math.cos(a) * rr * r, 0.05, Math.sin(a) * rr * r); m.rotation.set(rnd(-0.3, 0.3), a, rnd(-0.4, 0.4)); m.visible = false; flowers.push({ m, d: rr * 0.25, s: 0.85 - rr * 0.3 }); } }
    return this._h(e, {
      bloom: (n) => { sig.setA(1.5); this.pillar(g0, 0.8, 3.0, { col: [0xffffff, C.iceB], life: 0.5 });
        this.emit('shard', g0.clone().setY(g0.y + 0.1), 18, { col: [0xffffff, C.ice, 0xbfe8ff], ring: 0.3, speed: [1.6, 3.4], up: [1.6, 3.2], size: [0.1, 0.2], life: [0.5, 0.8], g: 9, drag: 1.0, glow: 0.6, ground: g0.y, bounce: 0.2 });
        this.emit('glint', g0.clone().setY(g0.y + 0.3), 18, { col: [0xffffff, C.ice], spread: r * 0.85, speed: [0, 0.3], up: [0.4, 1.4], size: [0.2, 0.34], life: [0.3, 0.6], g: 0, drag: 2, a: 0.9 });
        this.emit('star', g0.clone().setY(g0.y + 0.6), 8, { col: [0xffffff, C.ice, C.silver], speed: [1, 2.4], up: [1.2, 2.4], size: [0.05, 0.08], life: [0.45, 0.7], g: 5, glow: 0.9, ground: g0.y });
        this.vring(g0.clone().setY(g0.y + 0.8), 2.0, 0xffffff, C.iceB, 0.3, 0.8);
        this.flash(g0.clone().setY(g0.y + 0.3), 1.2, 0xffffff, C.iceB, 0.14, 1.0); this.ring(g0, r, 0xffffff, C.iceB, 0.3, 1.4, 0.2); this._puffs(g0.clone().setY(g0.y + 0.1), lite() ? 2 : 5, r * 0.7, { c1: 0xf4fbff, c2: C.iceB, a: 0.3, life: 0.6, rise: 0.15 }); },
      shock: (p) => { const at = P3({ x: p.x, y: (p.y || 0) + 0.8, z: p.z }); this.flash(at, 1.0, 0xffffff, C.fire, 0.14, 1.1); this.steamPuffs(at, 5, 0.8, 0.5);
        this.bang(at, 0.9, [0xfff0d0, C.fire, C.ember, 0xffffff, C.ice], { stars: 5, glints: 6, embers: 8 }); this.emit('mist', at, 6, { col: [0xfff8f0, 0xe8f0ff], spread: 0.3, speed: [0.6, 1.4], up: [0.4, 1.0], size: [0.45, 0.7], end: 1.8, life: [0.5, 0.8], g: -0.4, drag: 2.5, a: 0.45, fo: 0.3 }); },
      freeze: (t) => { const at = P3(t.pos); this.emit('shard', at.clone().setY(at.y + 0.05), 8, { col: [0xffffff, C.ice], ring: (t.radius || 0.5) + 0.15, speed: [0.05, 0.2], up: [0.2, 0.5], size: [0.22, 0.34], end: 1, life: [1.0, 1.3], g: 0.6, drag: 3, glow: 0.5, ground: at.y + 0.05, upright: true, spin: 0.5, fo: 0.75 });
        this.emit('glint', at.clone().setY(at.y + 0.6), 6, { col: [0xffffff, C.ice], spread: 0.5, speed: [0, 0.2], up: [0.2, 0.6], size: [0.2, 0.3], life: [0.4, 0.7], g: 0, a: 0.8 });
        if (this.geo.chef_shard) this._bits(at.clone().setY(at.y + 0.3), lite() ? 3 : 6, { geo: this.geo.chef_shard, tint: 0xd8f0ff, size: [0.12, 0.2], speed: [0.2, 0.6], up: [0.4, 1.0], ground: at.y, life: 1.2 }); this.ring(at, (t.radius || 0.5) + 0.4, 0xffffff, C.iceB, 0.5, 1.2, 0.8); },
    });
  }

  // ================================================================== B3 밀푀유 블레이드
  mille(pc, o = {}) {
    if (!this._ok() || !this.geo.chef_mille) return null;
    const C = CHEFFX.col, I = CHEFFX.intensity; let back = false, sep = 0;
    const e = this._fx('mille', 4, (e, dt) => {
      sep += ((back ? 0 : 1) - sep) * Math.min(1, dt * 8);   // 날아가는 동안 층이 벌어지고 돌아오며 다시 겹침
      d.rotation.y += dt * 22; d.scale.set(0.42, 0.42 * (1 + 1.2 * sep), 0.42); d.material.uniforms.uA.value = smooth(0, 0.06, e.t);
      gl.quaternion.copy(this.camQ); gl.scale.setScalar(0.9); gl.material.uniforms.uA.value = I * 0.35;
      tr.quaternion.copy(this.camQ); tr.scale.setScalar(0.7); tr.material.uniforms.uA.value = 0.3;
    });
    const d = this.solid(e, this.geo.chef_mille, { rim: 0xfff0d0, spec: 0.7 }), gl = this.spr(e, 0, C.cream, C.gold, 3), tr = this.puff(e, C.ice, C.iceB, 2);
    { const h0 = P3(pc.pos).setY((pc.pos.y || 0) + 1.2); this.emit('glint', h0, 8, { col: [C.gold, C.ice, 0xffffff], spread: 0.4, speed: [0.6, 1.6], up: [0.2, 0.8], size: [0.18, 0.3], life: [0.25, 0.4], g: 0, drag: 3, a: 0.9 }); }
    let last = null, mt = 0;
    return this._h(e, {
      set: (p, b) => { const n = P3(p); if (last) tr.position.copy(last).sub(n).multiplyScalar(4); last = n.clone(); e.g.position.copy(n); back = !!b;
        if ((++mt & 1) === 0) { this.emit('glint', n, 1, { col: [C.gold, 0xffffff, C.ice], speed: [0, 0.3], up: [0, 0.3], size: [0.2, 0.3], life: [0.2, 0.32], g: 0, a: 0.85 });
          this.emit('star', n, 1, { col: [C.gold, C.cream, C.ice], speed: [0.2, 0.6], up: [0, 0.5], size: [0.03, 0.05], life: [0.3, 0.45], g: 2, glow: 0.9 }); } },
      cut: (p) => { const at = P3(p); this.flash(at, 0.6, 0xffffff, C.gold, 0.1, 1.0); this.bang(at, 0.6, [0xffffff, C.gold, C.gold, C.ice, C.cream], { stars: 4, glints: 4, shards: 3, shardCol: [0xffe0a0, C.ice], ground: at.y - 0.9 }); this._bits(at, lite() ? 2 : 4, { geo: this.geo.chef_shard, tint: 0xffe0a0, size: [0.04, 0.07], speed: [1, 2], up: [1, 2], ground: at.y - 0.9, life: 0.4 }); },
      turn: () => { this.flash(e.g.position.clone(), 0.5, C.cream, C.gold, 0.1, 0.8); },
      catch: () => { this.flash(e.g.position.clone(), 0.5, 0xffffff, C.gold, 0.1, 0.9); this.emit('star', e.g.position, 4, { col: [C.gold, 0xffffff], speed: [0.6, 1.4], up: [0.6, 1.2], size: [0.04, 0.07], life: [0.35, 0.5], g: 4, glow: 0.9 }); this._free(e); },
      drop: () => { const at = e.g.position.clone(); this._puffs(at, 3, 0.4, { c1: C.cream, c2: C.gold, a: 0.4, life: 0.4 }); this._bits(at, 5, { geo: this.geo.chef_shard, tint: 0xffe0a0, size: [0.05, 0.08], ground: at.y - 1, life: 0.6 }); this._free(e); },
    });
  }

  // ================================================================== B4 슈가 아라베스크
  sugar(pos, o = {}) {
    if (!this._ok() || !this.geo.chef_curl) return null;
    const K = CHEFFX.sugar, C = CHEFFX.col, I = CHEFFX.intensity, g0 = P3(pos), f = o.f || { x: 0, z: 1 }, w = o.w || 3.6, nC = Math.max(3, Math.round(w / 0.6)), curls = []; let crack = 0;
    const e = this._fx('sugar', 1e9, (e) => {
      const draw = clamp01(e.t / 0.4), set = smooth(0.3, 0.55, e.t);
      if (draw < 1 && e.t > 0.02) { _b.set(-w / 2 + draw * w, 0.15 + rnd(0, 1) * K.h, 0); e.g.updateMatrixWorld(); e.g.localToWorld(_b); this.emit('glint', _b, 1, { col: [C.sugar, C.gold, 0xffffff], speed: [0, 0.3], up: [0.1, 0.5], size: [0.2, 0.32], life: [0.25, 0.4], g: 0, a: 0.9 });
        this.emit('star', _b, 1, { col: [C.sugar, C.gold], speed: [0.3, 0.8], up: [0.4, 1.0], size: [0.04, 0.06], life: [0.35, 0.5], g: 4, glow: 0.9, ground: g0.y }); }
      for (const c of curls) { const q = clamp01((draw * nC - c.i) / 1.2); c.m.visible = q > 0; c.m.scale.set(0.6 * q, 0.6, 0.6); c.m.material.uniforms.uA.value = 0.95; c.m.material.uniforms.uGlow.value = 0.35 * (1 - set); }
      pane.scale.set(w, K.h * set, 1); pane.position.y = K.h * set / 2 + 0.05; pane.material.uniforms.uA.value = K.a * set; pane.material.uniforms.uGlow.value = 0.08 + 0.25 * crack;
      for (const l of cracks) { l.material.uniforms.uA.value = I * 1.2 * Math.max(0, crack * 3 - l.userData.i) * set; }
    });
    e.g.position.copy(g0); e.g.rotation.y = Math.atan2(f.z, f.x) + Math.PI / 2;   // 판의 가로(로컬 x) = 시전 방향에 수직
    this.circle(g0, Math.min(1.3, w / 2.8), { v: 4, col: [0xfff4d0, C.sugar, C.gold], life: 1.1, draw: 0.3, out: 0.5, spin: 1.2, a: 0.6, glowA: 0.45 });
    const pane = this.solid(e, this.pane, { tint: 0xffd890, rim: 0xffe8b0, spec: 1.4 }); pane.renderOrder = 6;
    for (const row of [0, 1]) for (let i = 0; i < nC; i++) { const m = this.solid(e, this.geo.chef_curl, { rim: 0xffe0a0, spec: 1.0 }); m.position.set(-w / 2 + (i + 0.5) * w / nC - 0.3, row ? K.h : 0.08, 0); m.rotation.set(0, 0, -Math.PI / 2); m.renderOrder = 7; curls.push({ m, i: i + row * 0.5 }); }
    const cracks = []; for (let i = 0; i < 3; i++) { const l = this.spr(e, 2, 0xffffff, C.sugarB, 8); l.userData.i = i; l.position.set(rnd(-w / 3, w / 3), K.h * rnd(0.3, 0.7), 0.03); l.rotation.z = rnd(-1, 1); l.scale.set(rnd(0.6, 1.1), 0.25, 1); cracks.push(l); }
    let shattered = false;
    return this._h(e, {
      crack: (k) => { const k2 = clamp01(k); if (k2 > crack + 0.05) this.emit('shard', g0.clone().setY(g0.y + K.h * 0.6), 3, { col: [0xffe0a0, C.sugar], spread: w * 0.35, speed: [0.6, 1.4], up: [0.6, 1.4], size: [0.06, 0.1], life: [0.4, 0.6], g: 9, ground: g0.y, glow: 0.4 }); crack = k2; },
      shatter: () => { shattered = true; const at = g0.clone().setY(g0.y + K.h / 2); this.flash(at, 1.4, 0xfff4d0, C.sugar, 0.14, 1.1);
        this.bang(at, 1.2, [0xfff4d0, C.sugar, C.gold, C.sugar, 0xffffff], { stars: 8, glints: 12, shards: 22, shardCol: [0xffe0a0, C.sugar, 0xfff0c0], ground: g0.y }); this.vring(at, 2.4, 0xfff4d0, C.sugar, 0.3, 0.8); this.emit('shard', at, 14, { col: [0xffe0a0, C.sugar, 0xfff4d0], spread: w * 0.3, speed: [1.2, 2.8], up: [1.4, 2.8], size: [0.14, 0.26], life: [0.6, 0.9], g: 9, glow: 0.5, ground: g0.y, bounce: 0.25 });
        this._bits(at, lite() ? 6 : 14, { geo: this.geo.chef_shard, tint: 0xffe0a0, size: [0.12, 0.22], speed: [1.6, 3.4], up: [1.4, 2.8], ground: g0.y, life: 0.7 }); this.ring(g0, 2.4, 0xfff0c0, C.sugar, 0.3, 1.2); },
      dispose: () => { if (!shattered) this._puffs(g0.clone().setY(g0.y + 0.4), 2, 0.6, { c1: C.cream, c2: C.sugar, a: 0.3, life: 0.4 }); this._free(e); },
    });
  }

  // ================================================================== B5 크로캉부슈 피날레
  tower(c, o = {}) {
    if (!this._ok() || !this.geo.chef_choux) return null;
    const K = CHEFFX.tower, C = CHEFFX.col, I = CHEFFX.intensity, g0 = P3(c), form = o.form || 2, gap = o.gap || 0.15, nL = o.layers || 3, end = form + (nL + 1) * gap + 0.6;
    const choux = [], tiers = K.tiers, nT = tiers.length; let idx = 0;
    const tierBurst = new Array(nT).fill(-1);
    const e = this._fx('tower', end, (e) => {
      for (const ch of choux) {
        const bt = tierBurst[ch.tier];
        if (bt >= 0) { const q = (e.t - bt) / 0.4; ch.m.position.copy(ch.p).addScaledVector(ch.out, 2.2 * easeOut(q)); ch.m.position.y += 1.2 * q * (1 - q); ch.m.material.uniforms.uA.value = K.a * (1 - smooth(0.3, 1, q)); continue; }
        const q = clamp01((e.t - ch.d) / 0.35), a0 = ch.a + (1 - q) * 3;   // 나선을 그리며 제자리로
        ch.m.position.set(Math.cos(a0) * (ch.rr + 0.9 * (1 - q)), ch.y * q + 0.2 * (1 - q), Math.sin(a0) * (ch.rr + 0.9 * (1 - q)));
        ch.m.scale.setScalar(K.choux * easeOut(q)); ch.m.material.uniforms.uA.value = K.a * smooth(0, 0.2, q); ch.m.visible = q > 0;
      }
      const tq = smooth(form * 0.3, form, e.t), gone = tierBurst[nT - 1] >= 0 ? smooth(0, 0.3, e.t - tierBurst[nT - 1]) : 0;
      for (let i = 0; i < threads.length; i++) { const t = threads[i]; t.visible = tq > 0.02; t.scale.set(0.8 - i * 0.12, Math.max(0.05, nT * K.h * tq), 0.8 - i * 0.12); t.rotation.y = i * 2 + e.t * 0.5; t.material.uniforms.uA.value = 0.9 * tq * (1 - gone); }
      this._flat(zone, o.r || 6); zone.material.uniforms.uA.value = I * 0.35 * smooth(0, 0.3, e.t) * (1 - gone);
    });
    e.g.position.copy(g0);
    for (let t = 0; t < nT; t++) for (let j = 0; j < tiers[t]; j++) {
      const rr = tiers[t] > 1 ? (0.22 + 0.11 * tiers[t]) * K.rr : 0, a = j / tiers[t] * Math.PI * 2 + t * 0.4, m = this.solid(e, this.geo.chef_choux, { rim: 0xfff0d0, spec: 0.8 }); m.visible = false; m.renderOrder = 5;
      const y = 0.2 + t * K.h; choux.push({ m, tier: t, rr, a, y, d: idx++ * (form * 0.8 / 16), p: new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr), out: new THREE.Vector3(Math.cos(a), 0.2, Math.sin(a)).normalize() });
    }
    const threads = [0, 1].map(() => { const m = this.solid(e, this.geo.chef_curl, { rim: 0xffe0a0, spec: 1.2, tint: 0xffd080 }); m.renderOrder = 6; return m; });
    const zone = this.spr(e, 1, C.ice, C.iceB, 2); zone.material.uniforms.uP.value = 0.4;
    // (1) 둔화 범위(o.r) 꽃잎 장미창 마법진(파스텔 하늘 + 금테)이 쌓이는 동안 돌고, 금빛 나선이 탑을 감아 오름 → (4) 바닥층 고리 뒤 잔광
    const sig = this.circle(g0, (o.r || 6) * 0.97, { v: 4, col: [0xffffff, C.iceB, C.gold], life: end + 0.5, draw: 0.5, out: 0.6, spin: 0.6, a: 0.6, glowA: 0.45 }); this.sfxq('cf_sigil');
    this.helix(() => g0, 0.95, nT * K.h + 0.6, { col: [0xfff4d0, C.gold], life: form + 0.2, spin: 2.0, a: 0.9 });
    return this._h(e, {
      frost: (k) => { sig.setA(1 + 0.12 * k); this.emit('glint', g0.clone().setY(g0.y + 0.4), 8, { col: [0xffffff, C.ice, C.gold], spread: (o.r || 6) * 0.8, speed: [0, 0.2], up: [0.3, 1.0], size: [0.18, 0.3], life: [0.35, 0.6], g: 0, drag: 2, a: 0.85 }); this._puffs(g0.clone().setY(g0.y + nT * K.h + 0.3), lite() ? 1 : 3, 0.6, { c1: 0xffffff, c2: C.iceB, a: 0.35, life: 0.6, rise: -0.6 }); },
      burst: (i) => { const t = nT - 1 - i; if (t < 0) return; tierBurst[t] = e.t; const at = g0.clone().setY(g0.y + 0.2 + t * K.h);
        this.bang(at, 0.9, [0xffffff, C.iceB, C.gold, 0xffffff, C.ice], { stars: 6, glints: 8, shards: 8, shardCol: [0xfff0d0, C.ice, 0xffd890], ground: g0.y }); this.flash(at, 1.0, 0xffffff, C.iceB, 0.12, 1.0); this.ring(g0, o.r ? Math.min(o.r, 4) : 4, C.ice, C.iceB, 0.25, 0.9, 0.3); },
      ring: () => { tierBurst[0] = e.t; sig.setA(1.7); sig.end(); this.pillar(g0, 1.3, 5.5, { col: [0xffffff, C.iceB], life: 0.6 });
        this.emit('shard', g0.clone().setY(g0.y + 0.1), 24, { col: [0xffffff, C.ice, 0xbfe8ff], ring: 0.5, speed: [2.4, 4.6], up: [1.2, 2.6], size: [0.12, 0.22], life: [0.5, 0.8], g: 9, drag: 0.8, glow: 0.6, ground: g0.y, bounce: 0.2 });
        this.emit('star', g0.clone().setY(g0.y + 1.0), 12, { col: [0xffffff, C.ice, C.gold], speed: [1.5, 3.2], up: [1.2, 2.6], size: [0.05, 0.09], life: [0.5, 0.75], g: 5, glow: 0.9, ground: g0.y });
        this.emit('mist', g0.clone().setY(g0.y + 0.2), 12, { col: [0xf4fbff, 0xdcefff], ring: 0.6, speed: [2.5, 4.0], up: [0, 0.3], size: [0.6, 0.9], end: 1.8, life: [0.5, 0.8], g: 0, drag: 1.4, a: 0.4, fo: 0.3 }); this.flash(g0.clone().setY(g0.y + 0.3), 1.6, 0xffffff, C.iceB, 0.16, 1.1); this.ring(g0, o.rb || 6.5, 0xffffff, C.iceB, 0.45, 1.6, 0.2); this._puffs(g0.clone().setY(g0.y + 0.1), lite() ? 3 : 8, (o.rb || 6.5) * 0.6, { c1: 0xf4fbff, c2: C.iceB, a: 0.3, life: 0.6, rise: 0.1 }); },
    });
  }

  // ================================================================== C2 황금 부용
  broth(pos, o = {}) {
    if (!this._ok() || !this.geo.chef_pot) return null;
    const C = CHEFFX.col, I = CHEFFX.intensity, g0 = P3(pos), r = o.r || 3, dur = o.dur || 8; let puffT = 0, ending = -1;
    const e = this._fx('broth', dur + 0.5, (e, dt) => {
      const a = smooth(0, 0.2, e.t) * (ending >= 0 ? 1 - smooth(ending, ending + 0.3, e.t) : 1 - smooth(dur - 0.3, dur, e.t));
      pt.scale.setScalar(0.5 * (0.5 + 0.5 * easeOut(e.t / 0.2))); pt.material.uniforms.uA.value = a;
      ld.position.set(Math.cos(e.t * 2.4) * 0.18, 0.62, Math.sin(e.t * 2.4) * 0.18); ld.rotation.set(0.35 * Math.sin(e.t * 2.4), e.t * 2.4, 0.35 * Math.cos(e.t * 2.4)); ld.scale.setScalar(0.42); ld.material.uniforms.uA.value = a;
      this._flat(rg, r); rg.material.uniforms.uA.value = I * 0.6 * a; this._flat(sf, 0.45); sf.position.y = 0.27; sf.material.uniforms.uA.value = I * 0.5 * a * (0.8 + 0.2 * Math.sin(e.t * 5));
      puffT -= dt; if (puffT <= 0 && a > 0.5) { puffT = 0.7; this._puffs(g0.clone().setY(g0.y + 0.45), 1, 0.25, { c1: 0xfff4e0, c2: C.gold, a: 0.28, life: 0.9, rise: 0.9 }); }
      if (ending >= 0 && e.t > ending + 0.3) e.t = e.life;
    });
    e.g.position.copy(g0);
    const pt = this.solid(e, this.geo.chef_pot, { rim: 0xffd0a0, spec: 0.8 }), ld = this.solid(e, this.geo.cook_ladle, { rim: 0xffffff, spec: 1 }), rg = this.spr(e, 1, C.gold, C.goldB, 2), sf = this.spr(e, 0, C.gold, C.goldB, 3);
    rg.material.uniforms.uP.value = 0.8;
    // (1) 회복 범위 r 안 금빛 레스토랑 문양 마법진(초록 허브 빛) — 냄비가 있는 동안
    const sig = this.circle(g0, r * 0.95, { v: 5, col: [0xfff4d0, C.herbB, C.gold], hold: true, draw: 0.4, out: 0.4, spin: 0.5, a: 0.55, glowA: 0.35 });
    this.bang(g0.clone().setY(g0.y + 0.4), 0.7, [0xfff4d0, C.gold, C.gold, C.herb], { stars: 4, glints: 6, ground: g0.y });
    const _end = e.update; e.update = (x, dt) => { _end(x, dt); if (x.t >= x.life - dt * 1.5 || ending >= 0) sig.end(); };
    return this._h(e, {
      pulse: (t) => { this.ring(g0, r, C.herb, C.herbB, 0.5, 1.0, 0.15); sig.setA(1.3);
        if (t && t.pos) { const at = P3(t.pos); this.emit('petal', at.clone().setY(at.y + 0.1), 4, { col: [C.herb, 0xb8f080, C.gold], spread: 0.45, speed: [0.1, 0.4], up: [1.0, 1.8], size: [0.1, 0.16], end: 0.7, life: [0.6, 0.9], g: -0.3, drag: 1.5, spin: 3, glow: 0.6 });
          this.emit('glint', at.clone().setY(at.y + 0.6), 3, { col: [C.herb, C.gold, 0xffffff], spread: 0.4, speed: [0, 0.2], up: [0.6, 1.2], size: [0.18, 0.28], life: [0.35, 0.55], g: 0, a: 0.85 }); } if (t && t.pos && this.geo.chef_leaf) { const at = P3(t.pos); this._bits(at.clone().setY(at.y + 0.3), lite() ? 1 : 3, { geo: this.geo.chef_leaf, size: [0.1, 0.14], speed: [0.2, 0.6], up: [2, 3], ground: at.y - 5, life: 0.6 }); } },
      end: () => { if (ending < 0) ending = e.t; sig.end(); },
      dispose: () => { sig.end(); this._free(e); },
    });
  }

  // ================================================================== C3 봉 아페티! · C4 셰프의 한 끗 · C5 로열 그랑 디너 · C1 제작 플레이팅
  /** 작은 은쟁반 + 클로슈 하나: open 시각에 뚜껑이 들림. 반환 = 쟁반 묶음(그룹 좌표) */
  _tray(e, tint = 0xffffff) {
    const tr = this.solid(e, this.geo.chef_tray, { rim: 0xffffff, spec: 1 }), cl = this.solid(e, this.geo.chef_cloche, { tint, rim: 0xffffff, spec: 1.2 }), fd = this.solid(e, this.geo.chef_food_c || this.geo.chef_choux, { spec: 0.4 }), gl = this.spr(e, 0, CHEFFX.col.gold, CHEFFX.col.goldB, 4);
    return { tr, cl, fd, gl, set: (p, s, open, a) => { tr.position.copy(p); tr.scale.set(s, s, s); cl.position.copy(p).setY(p.y + open * s * 1.4); cl.rotation.z = open * 0.6; cl.scale.setScalar(s * 0.8); fd.position.copy(p).setY(p.y + 0.06 * s * 3); fd.scale.setScalar(s * 0.4);
      gl.quaternion.copy(this.camQ); gl.position.copy(p).setY(p.y + 0.2 * s); gl.scale.setScalar(s * 3 * open); tr.material.uniforms.uA.value = a; cl.material.uniforms.uA.value = a * (1 - smooth(0.5, 1, open)); fd.material.uniforms.uA.value = a * (1 - smooth(0.6, 1, open)); gl.material.uniforms.uA.value = CHEFFX.intensity * 0.9 * a * Math.sin(Math.PI * clamp01(open)); } };
  }
  bon(pc, o = {}) {
    if (!this._ok() || !this.geo.chef_tray) return null;
    const T = [];
    const e = this._fx('bon', 1.1, (e) => { const base = P3(pc.pos), f = pc.facing || { x: 0, z: 1 }, p = base.clone().add(_a.set(f.x * 0.55, 1.05, -f.z * 0.55)); const open = clamp01((e.t - 0.15) / 0.4), a = smooth(0, 0.1, e.t) * (1 - smooth(0.85, 1.1, e.t));
      T[0].set(p, 0.32, open, a); const q = clamp01((e.t - 0.4) / 0.4); glow.quaternion.copy(this.camQ); glow.position.lerpVectors(p, base.clone().setY(base.y + 1.0), easeOut(q)); glow.scale.setScalar(0.5 * (1 - q * 0.6)); glow.material.uniforms.uA.value = CHEFFX.intensity * 1.2 * (q > 0 && q < 1 ? 1 : 0); });
    T.push(this._tray(e)); const glow = this.spr(e, 0, 0xffffff, CHEFFX.col.gold, 7);
    // 뚜껑이 열리면 금빛 별이 튀고, 몸을 감아 오르는 금빛 나선 + 발밑 작은 마법진
    const C0 = CHEFFX.col, foot = () => P3(pc.pos);
    this.circle(null, 0.9, { follow: foot, v: 5, col: [0xfff4d0, C0.goldB, C0.gold], life: 1.2, draw: 0.2, out: 0.4, spin: 1.5, a: 0.55, glowA: 0.45 });
    this.helix(foot, 0.6, 2.0, { col: [0xfff4d0, C0.gold], life: 0.9, spin: 3 });
    { const b = P3(pc.pos), f = pc.facing || { x: 0, z: 1 }; this.emit('star', b.clone().add(_a.set(f.x * 0.55, 1.2, -f.z * 0.55)), 6, { col: [C0.gold, 0xffffff, C0.ember], speed: [0.6, 1.4], up: [1.0, 2.0], size: [0.04, 0.07], life: [0.45, 0.65], g: 4, glow: 0.9 }); }
    return e;
  }
  touch(pc) {
    if (!this._ok() || !this.geo.chef_leaf) return null;
    const e = this._fx('touch', 0.9, (e) => { const b = P3(pc.pos), q = e.t / 0.9; lf.position.copy(b).setY(b.y + 1.3 + q * 0.7); lf.rotation.set(0.4, e.t * 6, 0.3); lf.scale.setScalar(0.22); lf.material.uniforms.uA.value = 1 - smooth(0.6, 1, q);
      sp.quaternion.copy(this.camQ); sp.position.copy(lf.position).add(_a.set(0.18, 0.1, 0)); sp.scale.setScalar(0.35 * (1 + 0.3 * Math.sin(e.t * 20))); sp.material.uniforms.uA.value = CHEFFX.intensity * 1.2 * (1 - smooth(0.4, 1, q)); });
    const lf = this.solid(e, this.geo.chef_leaf, { spec: 0.4 }), sp = this.spr(e, 3, 0xffffff, CHEFFX.col.gold, 7);
    { const b = P3(pc.pos).setY((pc.pos.y || 0) + 1.3); this.emit('glint', b, 6, { col: [CHEFFX.col.gold, CHEFFX.col.herb, 0xffffff], spread: 0.4, speed: [0.1, 0.4], up: [0.4, 1.0], size: [0.16, 0.26], life: [0.4, 0.6], g: 0, a: 0.85 });
      this.emit('petal', b, 3, { col: [CHEFFX.col.herb, 0xb8f080], spread: 0.3, speed: [0.2, 0.5], up: [0.6, 1.2], size: [0.08, 0.12], life: [0.6, 0.9], g: -0.2, drag: 1.5, spin: 3, glow: 0.5 }); this.sfxq('cf_twinkle'); }
    return e;
  }
  royal(pc, o = {}) {
    if (!this._ok() || !this.geo.chef_tray) return null;
    const times = o.times || [0.45, 0.95, 1.45], C = CHEFFX.col, I = CHEFFX.intensity, opened = [-1, -1, -1], tint = [0xe8eef8, 0xffb080, 0xffd27a]; let cancel = -1;
    const T = [];
    const e = this._fx('royal', times[2] + 0.9, (e) => {
      const b = P3(pc.pos), a0 = smooth(0, 0.15, e.t) * (cancel >= 0 ? 1 - smooth(cancel, cancel + 0.2, e.t) : 1);
      for (let i = 0; i < 3; i++) { const ang = (i / 3) * Math.PI * 2 + Math.PI / 2, p = b.clone().add(_a.set(Math.cos(ang) * 1.0, 0.75, Math.sin(ang) * 1.0)), op = opened[i] >= 0 ? clamp01((e.t - opened[i]) / 0.45) : 0;
        T[i].set(p, 0.26, op, a0 * (1 - smooth(0.7, 1, op))); }
      if (cancel >= 0 && e.t > cancel + 0.2) e.t = e.life;
    });
    for (let i = 0; i < 3; i++) T.push(this._tray(e, tint[i]));
    // (1) 발밑 금빛 연회 마법진(쟁반 고리 안, 1.4 m) — 쟁반이 다 열릴 때까지, 쓰러지거나 이동하면 함께 사라짐
    const sig = this.circle(null, 1.4, { follow: () => P3(pc.pos), v: 5, col: [0xfff4d0, C.goldB, C.gold], life: times[2] + 0.9, draw: 0.3, out: 0.5, spin: 0.8, a: 0.7, glowA: 0.5 }); this.sfxq('cf_sigil');
    const _up = e.update; e.update = (x, dt) => { _up(x, dt); if (cancel >= 0) sig.end(); };
    return this._h(e, {
      open: (i) => { opened[i] = e.t; const b = P3(pc.pos), foot = () => P3(pc.pos), cc = [[0xffffff, C.silverB, C.silver, 0x9ad8ff], [0xfff0c0, C.fire, C.ember, C.gold], [0xfff4d0, C.gold, C.gold, C.herb]][i];
        sig.setA(1.2 + 0.2 * i); this.pillar(b, 0.85, 3.2, { col: [cc[0], cc[1]], life: 0.55 }); this.helix(foot, 0.75, 2.2, { col: [cc[0], cc[2]], life: 0.8, spin: 3 });
        this.bang(b.clone().setY(b.y + 1.2), 0.9, cc, { stars: 6, glints: 8, ground: b.y }); this.sfxq(i === 1 ? 'cf_bless' : 'cf_twinkle');
        if (i === 2) this.emit('petal', b.clone().setY(b.y + 0.2), 10, { col: [C.herb, C.gold, 0xb8f080], ring: 0.6, speed: [0.1, 0.4], up: [1.2, 2.2], size: [0.1, 0.16], end: 0.7, life: [0.8, 1.1], g: -0.2, drag: 1.4, spin: 3, glow: 0.6 });
        if (i === 0) { const s = this._fx('royalshield', 0.9, (x) => { const q = x.t / 0.9, bb = P3(pc.pos); m.position.copy(bb); m.scale.setScalar(0.9 + 0.1 * easeOut(q)); m.material.uniforms.uA.value = 0.28 * (1 - smooth(0.4, 1, q)); m.material.uniforms.uGlow.value = 0.35; });
          const m = this.solid(s, this.geo.chef_cloche, { tint: 0xf4ecd0, rim: 0xffe8a0, spec: 1.4 }); m.renderOrder = 8; }
        if (i === 1) for (let k = 0; k < (lite() ? 3 : 6); k++) { const a = k / 6 * Math.PI * 2, m = this.flameTongue(this._fx('royalatk', 0.6, (x) => { const q = x.t / 0.6, bb = P3(pc.pos); m.quaternion.copy(this.camQ); m.position.set(bb.x + Math.cos(a) * 0.45, bb.y + 0.3 + q * 1.4, bb.z + Math.sin(a) * 0.45); m.scale.set(0.3, 0.6, 1); m.material.uniforms.uA.value = I * 1.1 * (1 - smooth(0.5, 1, q)); })); }
        if (i === 2 && this.geo.cook_drop) this._bits(b.clone().setY(b.y + 0.3), lite() ? 5 : 10, { geo: this.geo.cook_drop, tint: 0xffd27a, size: [0.04, 0.07], speed: [0.2, 0.7], up: [2.2, 3.4], ground: b.y - 5, life: 0.7 });
        this.flash(b.clone().setY(b.y + 1.0), 0.8, 0xffffff, [C.silver, C.fire, C.gold][i], 0.14, 0.9); },
      cancel: () => { if (cancel < 0) cancel = e.t; sig.end(); },
    });
  }
  /** 시그니처 메뉴 제작 성공: 접시 위에 메인 → 곁들임 → 소스, 테두리에 금빛이 한 바퀴 */
  menu(pc, o = {}) {
    if (!this._ok() || !this.geo.chef_tray) return null;
    const e = this._fx('menu', 1.8, (e) => { const b = P3(pc.pos), p = b.clone().setY(b.y + 2.4), a = smooth(0, 0.15, e.t) * (1 - smooth(1.5, 1.8, e.t));
      pl.position.copy(p); pl.scale.setScalar(0.4); pl.rotation.x = 0.6; pl.material.uniforms.uA.value = a;
      const step = (t0) => smooth(t0, t0 + 0.15, e.t);
      mn.position.copy(p).add(_a.set(-0.06, 0.08, 0)); mn.scale.setScalar(0.16 * step(0.2)); mn.material.uniforms.uA.value = a;
      sd.position.copy(p).add(_a.set(0.14, 0.1, 0.05)); sd.scale.setScalar(0.12 * step(0.45)); sd.material.uniforms.uA.value = a;
      sc.position.copy(p).setY(p.y + 0.05); sc.rotation.set(-Math.PI / 2 + 0.6, 0, 0); sc.scale.setScalar(0.5 * step(0.7)); sc.material.uniforms.uA.value = CHEFFX.intensity * 0.9 * a;
      gr.position.copy(p).setY(p.y + 0.04); gr.rotation.set(-Math.PI / 2 + 0.6, 0, e.t * 4); gr.scale.setScalar(0.85); gr.material.uniforms.uA.value = CHEFFX.intensity * 1.2 * smooth(0.9, 1.0, e.t) * a; });
    const pl = this.solid(e, this.geo.chef_tray, { tint: 0xffffff, spec: 0.6 }), mn = this.solid(e, this.geo.chef_food_c, { spec: 0.5 }), sd = this.solid(e, this.geo.chef_garnish, { spec: 0.4 }), sc = this.spr(e, 1, 0xff8060, 0xa02010, 6), gr = this.spr(e, 1, 0xfff0c0, CHEFFX.col.gold, 6);
    sc.material.uniforms.uP.value = 0.2;
    // 접시 둘레에 반짝이, 완성 순간(0.95초) 별 팡 + 세운 고리
    let done = false; const _mu = e.update; e.update = (x, dt) => { _mu(x, dt); const p = P3(pc.pos).setY((pc.pos.y || 0) + 2.4);
      if (rnd(0, 1) < 0.3 && x.t < 1.2) this.emit('glint', p, 1, { col: [CHEFFX.col.gold, 0xffffff], ring: 0.45, speed: [0, 0.1], up: [0, 0.3], size: [0.16, 0.24], life: [0.25, 0.4], g: 0, a: 0.85 });
      if (!done && x.t >= 0.95) { done = true; this.bang(p, 0.7, [0xfff4d0, CHEFFX.col.gold, CHEFFX.col.gold, 0xffffff, 0xff8aa8], { stars: 8, glints: 8 }); this.sfxq('cf_twinkle'); } };
    return e;
  }
}
