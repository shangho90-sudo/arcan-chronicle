// 대장장이 1차 스킬 이펙트 (2026-11-13, 2026-11-19 튕김망치·담금통·'불량' 도장). 규칙은 js/smith.js, 메시는 tools/blender/fx_smith.py -> assets/fx/fx_smith.glb.json
// (smith_anvil / _anvil_cracks / _jaw / _bar / _plate / _rivet / _drop / _scrap / _shard, 정점 색만).
// 시각 정체성: 주황빛 열기 · 검은 철 · 황금색 불티 · 하얀 수증기. 빛은 텍스처 없이 작은 셰이더(CookFx의 것 + 부채꼴·낙인·중첩 점).
// 가장 밝은 순간 = 실제 피해 순간, 링·부채꼴은 실제 판정 크기를 넘지 않음, 긴 연기 없음. 전역 블룸·노출·정지는 건드리지 않음.
// 종류 (js/skillrt.js FX.smith(kind, a, o) / js/smith.js this.fx):
//   heat(t)                       머리 위 주황 점 1~3개(가열 중첩). handle {setStacks(n), dispose()}
//   brand(t, {dur})               큰 붉은 '불량' 도장이 몸통에 꽝 → 작은 쇠 각인으로 줄어 따라다님. handle {setCracks(n) 1 실금 / 2 굵은 균열, shatter() '쨍' 조각, expire() 조용히 흐려짐, dispose()}
//   anvil(pos, {fall, r})         낙하 그림자 -> 모루 착지 -> 불티 + 얇은 지면 충격파; 남아 있는 동안 균열이 은은히 빛남.
//                                 handle {land(hit), pulse(r, last) 충격파, bump() 모루 충돌, expire(), dispose()}
//   tongs(pc, {tgt, reach, pull, heavy})   집게가 벌어진 채 뻗어 나가 grab(t|null)에 닫힘 -> 끌려오는 대상을 따라 줄어듦
//   hit(pc, {kind: tap|finish|brand|forge, f, hits, r, ang})   망치 접촉 불티 / 마무리 지면 고리 / 낙인 도장 / 용광로 쇳물 부채꼴
//   douse(pc, {ht, f, r, ang, speed, mouth})   허리 담금통(왼손) → pour({hits}) 낮은 물 부채꼴·물줄기(물 속도) → arrive({x,y,z,r,n,miss}) 양옆으로 갈라지는 물, 가열이면 주황 → 흰 수증기
//   wall(pc, {dur})               접이식 철판이 펼쳐짐. handle {block(), kick(f) -> {set(p), hit(c), end()}, fold(), dispose()}
//   toss(pc, {ht})                왼손의 손망치(누른 순간부터). handle {release(p), set(p, f) 회전 비행·금빛 꼬리, clang(top, f, pulsed) 모루 '깡' 옆 불꽃, lob(), hit(t), glance(), drop(p)}
//   tempo(pc, {dur})              강화된 망치의 주황 테두리. handle {refresh(d), spend(), dispose()}
//   emp(pc, {f, hit}) · release(t, {f}) · scrap(pos, {to})
// 저사양(휴대폰 / 그래픽 효과 끔): 불티·파편·김만 줄임 — 모루, 집게, 철판, 낙인, 고리, 섬광은 그대로.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CookFx, cookTop } from './cookfx.js';

export const SMITHFX = {
  intensity: 1.0,
  col: { hot: 0xff8a2a, hotB: 0xff4a10, gold: 0xffd27a, white: 0xfff6e4, iron: 0x9aa2b0, steam: 0xffffff, steamB: 0xb8c8d8, water: 0xdaf2ff, waterB: 0x6ab8f0, brand: 0xff5a3a, brandB: 0xa01808, dust1: 0xd8c8a8, dust2: 0x7a6a58 },
  anvil: { h: 6.0, size: 1.0, see: 0.62, ring: 1.8, glow: 0.55, sparks: 9, sparksLite: 4 },
  tongs: { jaw: 1.25, open: 0.55, shut: 0.06, y: 1.0 },
  wall: { w: 0.85, h: 0.78, dist: 0.95, unfold: 0.2, wing: 0.42 },   // 캐릭터를 가리지 않게 허리~가슴 높이(2026-11-13 화면 확인 뒤 낮춤)
  forge: { drops: 9, dropsLite: 4, life: 0.5, puddle: 1.1 },
  // 급랭(2026-11-19): life = 물결 부채꼴 시간, bucket = 담금통 크기 배율, tip = 붓는 기울기(rad), steamLife/rise = 수증기 시간(초, + 0.05 x 중첩)·솟는 높이(m)
  quench: { life: 0.62, bucket: 1.25, tip: 1.9, steamLife: 0.48, rise: 1.5 },
  // 튕김망치: size = 손망치 크기 배율(실제 0.42 m — 쿼터뷰에서 읽히게 키움), spin = 회전(rad/s), trail = 금빛 꼬리 폭, glow = 망치 둘레 빛 크기
  toss: { size: 1.45, spin: 24, trail: 0.07, glow: 0.7, dropT: 0.45 },
  // 낙인: big/small = 도장/각인 크기(+ 대상 반지름), slam = 도장이 꽝 찍히는 시간, hold = 도장 유지, shrink = 각인으로 줄어드는 시간, fade = 시간 만료 흐려짐
  brand: { big: 1.35, small: 0.5, slam: 0.06, hold: 0.2, shrink: 0.22, fade: 0.6 },
};
const P3 = (p) => new THREE.Vector3(p.x, p.y || 0, -p.z);
const lite = () => { const G = window.G; return !!(G && ((G.input && G.input.mobile) || (G.settings && G.settings.graphicsFx === false))); };
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const rnd = (a, b) => a + Math.random() * (b - a);
const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _mx = new THREE.Matrix4();

const FLAT_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
// uK 0: 부채꼴 물결(평면, 꼭짓점 = 가운데, +x 방향, uH = 반각, uP = 앞머리 0..1)  1: 낙인(고리 + 망치 도장 + 균열 uP 0..3)  2: 가열 점 3개(uP = 켜진 수)
const SX_FS = `
uniform vec3 uW, uB; uniform float uA, uK, uP, uH, uT; varying vec2 vUv;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec2 p = vUv * 2. - 1.; float r = length(p), a = 0., core = 0.;
  if (uK < .5) {
    float an = abs(atan(p.y, p.x)); float side = smoothstep(uH, uH * .86, an);
    float front = smoothstep(uP, uP - .05, r) * smoothstep(uP - .5, uP - .04, r);
    float n = h21(floor(vec2(an * 9., r * 14. - uT * 6.)));
    a = side * front * (.55 + .45 * n) * step(.06, r); core = side * smoothstep(uP - .12, uP - .02, r) * smoothstep(uP, uP - .03, r);
    a += core * .8;
  } else if (uK < 1.5) {
    float ring = smoothstep(.98, .9, r) * smoothstep(.74, .84, r);
    vec2 q = abs(p); float head = step(q.x, .34) * step(abs(p.y - .22), .16), haft = step(q.x, .07) * step(abs(p.y + .2), .34);
    float seal = max(head, haft);
    float cr = 0.;
    for (int i = 0; i < 3; i++) { if (float(i) < uP - .01) { float ang = 1.1 + float(i) * 2.2; vec2 d = vec2(cos(ang), sin(ang)); float al = dot(p, d), la = dot(p, vec2(-d.y, d.x)) + .09 * sin(al * 13. + float(i) * 2.); cr = max(cr, smoothstep(.05, .012, abs(la)) * step(-.15, al) * step(al, .98)); } }
    a = max(ring, seal) * (1. - cr) + cr * 1.3 + pow(clamp(1. - r, 0., 1.), 2.) * .25; core = cr;
  } else {
    for (int i = 0; i < 3; i++) { vec2 c = vec2((float(i) - 1.) * .64, 0.); float d = length((p - c) * vec2(1., 3.)); float on = step(float(i) + .5, uP);
      a += smoothstep(.3, .2, d) * (on * 1. + (1. - on) * .16); core += smoothstep(.2, .04, d) * on; }
  }
  gl_FragColor = vec4(mix(uB, uW, clamp(core, 0., 1.)) * (a * uA), 1.);
}`;
const GLOW_VS = `attribute vec3 color; varying vec3 vC; void main(){ vC = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const GLOW_FS = `uniform float uA; varying vec3 vC; void main(){ gl_FragColor = vec4(vC * uA, 1.); }`;
const ADD = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide };
const SMITH_TOP = 0.74;   // 모루 윗면 높이 (js/smith.js SMITH.anvilTop)
// 낙인 도장·각인(텍스처) + 균열: uC 0 없음 / 1 실금 하나 / 2 굵은 균열 + 갈래, uHot = 금이 간 순간의 주황 빛(빨리 식음). 일반 블렌딩(밝은 바닥에서도 붉은 글씨가 읽히게)
const BT_FS = `
uniform sampler2D uMap; uniform float uA, uC, uHot; varying vec2 vUv;
float seg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return length(pa - ba * h); }
void main(){
  vec4 c = texture2D(uMap, vUv); vec2 p = vUv * 2. - 1.;
  float d = 9., d2 = 9.;
  if (uC > .5) d = min(min(seg(p, vec2(-.74, .5), vec2(-.12, .12)), seg(p, vec2(-.12, .12), vec2(.16, -.24))), seg(p, vec2(.16, -.24), vec2(.7, -.58)));
  if (uC > 1.5) d2 = min(min(seg(p, vec2(-.12, .12), vec2(.42, .48)), seg(p, vec2(.16, -.24), vec2(-.34, -.68))), seg(p, vec2(.42, .48), vec2(.72, .4)));
  float w = uC > 1.5 ? .05 : .018, cr = max(1. - smoothstep(w * .45, w, d), 1. - smoothstep(.012, .03, d2));
  vec3 col = mix(c.rgb, vec3(.06, .02, .02), cr * .9) + vec3(1., .5, .18) * (1. - smoothstep(0., w * 2.2, min(d, d2))) * uHot * .9;
  gl_FragColor = vec4(col, c.a * uA);
}`;

export class SmithFx extends CookFx {
  load() {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const j = await (await fetch('assets/fx/fx_smith.glb.json')).json(), raw = atob(j.b64), u8 = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
      const g = await new Promise((res, rej) => new GLTFLoader().parse(u8.buffer, '', res, rej));
      g.scene.traverse(o => { if (o.isMesh) this.geo[o.name] = o.geometry; });
      this.chips = [this.geo.smith_shard].filter(Boolean);
      this.ready = true;
    })().catch(e => console.warn('smithfx load', e));
    return this.loading;
  }
  _mat(kind) {
    const U = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v }])), C = () => new THREE.Color(1, 1, 1);
    if (kind === 'sx') return new THREE.ShaderMaterial({ uniforms: U({ uW: C(), uB: C(), uA: 0, uK: 0, uP: 0, uH: 0.6, uT: 0 }), vertexShader: FLAT_VS, fragmentShader: SX_FS, ...ADD });
    if (kind === 'btex') return new THREE.ShaderMaterial({ uniforms: U({ uMap: null, uA: 0, uC: 0, uHot: 0 }), vertexShader: FLAT_VS, fragmentShader: BT_FS, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
    if (kind === 'glow') return new THREE.ShaderMaterial({ uniforms: U({ uA: 1 }), vertexShader: GLOW_VS, fragmentShader: GLOW_FS, ...ADD });
    return super._mat(kind);
  }
  sx(e, k, w, b, order = 5) { const m = this._m(e, 'sx', this.quad, order), u = m.material.uniforms; u.uK.value = k; u.uP.value = 0; u.uT.value = 0; u.uW.value.setHex(w); u.uB.value.setHex(b); u.uA.value = 0; return m; }
  glow(e, geo, order = 4) { const m = this._m(e, 'glow', geo, order); m.material.uniforms.uA.value = 1; return m; }
  /** handle helper: e plus methods; dispose is always safe */
  _h(e, o = {}) { e.dispose = () => this._free(e); return Object.assign(e, o); }
  /** 금빛 불티: 작은 쇳물 방울이 튀어 오름 */
  sparks(at, n, o = {}) { if (this.geo.smith_drop) this._bits(at, n, { geo: this.geo.smith_drop, tint: o.tint ?? 0xffffff, size: o.size || [0.03, 0.055], speed: o.speed || [1.6, 3.4], up: o.up || [1.4, 3.2], ground: o.ground ?? at.y - 1, life: o.life || 0.42 }); }
  /** 짧은 섬광 + (선택) 얇은 고리 */
  flash(at, o = {}) {
    const I = SMITHFX.intensity, C = SMITHFX.col, s = o.size || 0.7, life = o.life || 0.14, ringR = o.ring || 0;
    const e = this._fx('flash', Math.max(life, ringR ? 0.26 : 0), (e) => {
      const k = e.t / life; fl.quaternion.copy(this.camQ); fl.scale.setScalar(s * (0.6 + 0.6 * easeOut(k))); fl.material.uniforms.uA.value = I * (o.a ?? 1.3) * (1 - smooth(0.1, 1, k));
      if (rg) { const q = e.t / 0.26; this._flat(rg, ringR * (0.45 + 0.55 * easeOut(q)), 0.07); rg.position.y = (o.gy ?? at.y) - at.y + 0.07; rg.material.uniforms.uA.value = I * 1.7 * (1 - smooth(0.25, 1, q)); }
    });
    e.g.position.copy(at);
    const fl = this.spr(e, 3, o.w ?? C.white, o.b ?? C.hot, 7), rg = ringR ? this.spr(e, 1, o.rw ?? C.white, o.rb ?? C.gold, 3) : null;
    return e;
  }

  // ------------------------------------------------------------------ 가열 표시
  heat(t) {
    if (!this._ok() || !t) return null; const C = SMITHFX.col; let n = 1, pop = 0.2;
    const e = this._fx('heat', 1e9, (e, dt) => {
      if (t.dead || t.removed) { e.t = e.life; return; }
      pop = Math.max(0, pop - dt);
      const p = P3(t.pos); m.position.set(p.x, p.y + cookTop(t) + 0.5, p.z); m.quaternion.copy(this.camQ);
      const s = 0.5 * (1 + 0.5 * pop / 0.2); m.scale.set(s, s * 0.34, 1); m.material.uniforms.uP.value = n; m.material.uniforms.uA.value = SMITHFX.intensity * (1.1 + 0.15 * Math.sin(e.t * 7));
    });
    const m = this.sx(e, 2, C.gold, C.hotB, 8);
    return this._h(e, { setStacks: (v) => { if (v !== n) pop = 0.2; n = v; } });
  }

  // ------------------------------------------------------------------ 단조 낙인 (2026-11-19: 큰 '불량' 도장 → 작은 쇠 각인 → 실금 → 굵은 균열 → '쨍!' 조각)
  /** 도장(붉은 잉크)·각인(쇠판 + 붉은 글씨) 캔버스 텍스처 — 처음 한 번 그림(주아체가 아직 없으면 기본 글꼴) */
  _brandTex() {
    if (this._btex) return this._btex;
    const mk = (draw) => { const c = document.createElement('canvas'); c.width = c.height = 256; draw(c.getContext('2d')); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 2; return t; };
    let s = 0x2468ace; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);   // 고정 난수(게임 Math.random 안 씀)
    const font = (px) => `bold ${px}px Jua, "Noto Sans KR", sans-serif`;
    const stamp = mk((g) => {
      g.translate(128, 128); g.rotate(-0.12);
      g.strokeStyle = '#d4140c'; g.lineWidth = 14; g.strokeRect(-104, -74, 208, 148); g.lineWidth = 4; g.strokeRect(-90, -60, 180, 120);
      g.fillStyle = '#d4140c'; g.font = font(92); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('불량', 0, 6);
      g.globalCompositeOperation = 'destination-out';                                        // 잉크가 고르지 않게 찍힌 자국
      for (let i = 0; i < 260; i++) { g.globalAlpha = 0.25 + 0.6 * r(); g.beginPath(); g.arc(r() * 240 - 120, r() * 180 - 90, 1 + r() * 4.5, 0, 6.3); g.fill(); }
    });
    const plate = mk((g) => {
      const gr = g.createRadialGradient(100, 90, 10, 128, 128, 120); gr.addColorStop(0, '#e6e9ee'); gr.addColorStop(0.55, '#9aa1ac'); gr.addColorStop(1, '#4a4f58');
      g.fillStyle = '#26282e'; g.beginPath(); g.arc(128, 128, 122, 0, 6.3); g.fill();
      g.fillStyle = gr; g.beginPath(); g.arc(128, 128, 110, 0, 6.3); g.fill();
      g.fillStyle = '#3a3e46'; for (let i = 0; i < 4; i++) { const a = 0.785 + i * 1.571; g.beginPath(); g.arc(128 + Math.cos(a) * 88, 128 + Math.sin(a) * 88, 9, 0, 6.3); g.fill(); }
      g.fillStyle = '#c8ccd4'; for (let i = 0; i < 4; i++) { const a = 0.785 + i * 1.571; g.beginPath(); g.arc(126 + Math.cos(a) * 88, 126 + Math.sin(a) * 88, 4, 0, 6.3); g.fill(); }
      g.font = font(84); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#5a0a06'; g.fillText('불량', 129, 135); g.fillStyle = '#e8241a'; g.fillText('불량', 128, 131);
    });
    return (this._btex = { stamp, plate });
  }
  brand(t, o = {}) {
    if (!this._ok() || !t) return null; const C = SMITHFX.col, K = SMITHFX.brand, T = this._brandTex();
    let n = 0, pop = 0, fadeT = -1, hot = 0;
    const e = this._fx('brand', (o.dur || 10) + 1.5, (e, dt) => {
      if (t.dead || t.removed) { e.t = e.life; return; }
      pop = Math.max(0, pop - dt); hot = Math.max(0, hot - dt * 3);
      const top = cookTop(t), r = t.radius || 0.5, at = P3(t.pos); at.y += top * 0.6; at.addScaledVector(this.toCam, r * 0.9 + 0.12);
      // 0 .. slam: 큰 도장이 꽝 찍힘(1.35 -> 1배) / hold / shrink: 작은 각인으로 줄어듦(도장은 사라지고 쇠판이 나타남)
      const big = K.big * (0.55 + r * 0.5), small = K.small * (0.55 + r * 0.45), k1 = smooth(0, K.slam, e.t), k2 = smooth(K.hold, K.hold + K.shrink, e.t);
      sm.position.copy(at); sm.quaternion.copy(this.camQ); sm.scale.setScalar(big * (1.35 - 0.35 * k1) * (1 - 0.65 * k2));
      sm.material.uniforms.uA.value = k1 * (1 - smooth(K.hold + K.shrink * 0.4, K.hold + K.shrink, e.t));
      const fade = fadeT >= 0 ? 1 - smooth(0, K.fade, e.t - fadeT) : 1;
      pl.position.copy(at); pl.quaternion.copy(this.camQ); pl.scale.setScalar(small * (1 + 0.35 * pop / 0.2) * (1.6 - 0.6 * k2));
      pl.material.uniforms.uA.value = smooth(K.hold + K.shrink * 0.35, K.hold + K.shrink, e.t) * fade; pl.material.uniforms.uC.value = n; pl.material.uniforms.uHot.value = hot;
      ring.position.copy(at); ring.quaternion.copy(this.camQ); ring.scale.setScalar(big * (0.8 + 0.9 * smooth(0, 0.25, e.t))); ring.material.uniforms.uA.value = SMITHFX.intensity * 1.2 * (1 - smooth(0.02, 0.28, e.t));
      if (fadeT >= 0 && e.t - fadeT > K.fade) e.t = e.life;
    });
    const sm = this._m(e, 'btex', this.quad, 9), pl = this._m(e, 'btex', this.quad, 9), ring = this.spr(e, 1, C.white, C.brand, 8);
    sm.material.uniforms.uMap.value = T.stamp; sm.material.uniforms.uC.value = 0; sm.material.uniforms.uHot.value = 0;
    pl.material.uniforms.uMap.value = T.plate; pl.material.uniforms.uA.value = 0;
    { const p = P3(t.pos); p.y += cookTop(t) * 0.6; this.flash(p, { size: 0.9, life: 0.1, b: C.brand }); this.sparks(p, lite() ? 2 : 4, { ground: P3(t.pos).y, tint: 0xffa070, life: 0.3 }); }
    const at = () => pl.position.clone();
    return this._h(e, {
      setCracks: (v) => { n = v; pop = 0.2; hot = 1; const p = at(); this.flash(p, { size: 0.35 + 0.12 * v, life: 0.08, b: C.hot }); this.sparks(p, lite() ? 1 : 2, { ground: P3(t.pos).y, tint: 0xffd0a0, life: 0.25, size: [0.02, 0.035] }); },
      shatter: () => { const p = at(), low = lite(), gy = P3(t.pos).y; this.flash(p, { size: 1.15, ring: (t.radius || 0.5) + 0.5, gy, w: 0xffffff, b: C.brand, rb: C.brand, a: 1.5 });
        this._bits(p, low ? 4 : 9, { geo: this.geo.smith_shard, tint: 0xe8ecf2, size: [0.06, 0.12], speed: [2.2, 4.0], up: [1.4, 3.0], ground: gy, life: 0.55 }); this.sparks(p, low ? 2 : 6, { tint: 0xff9070 }); this._free(e); },
      expire: () => { if (fadeT < 0) fadeT = e.t; },   // 시간 만료: 조용히 흐려짐(소리·섬광 없음)
    });
  }

  // ------------------------------------------------------------------ 모루
  anvil(pos, o = {}) {
    if (!this._ok() || !this.geo.smith_anvil) return null;
    const K = SMITHFX.anvil, C = SMITHFX.col, I = SMITHFX.intensity, fall = Math.max(0.12, o.fall || 0.34), R = o.r || 2, g0 = P3(pos), yaw = rnd(-0.5, 0.5);
    let landed = -1, out = -1, pulse = 0, sq = 0, see = 1;
    // an actor standing at / behind the anvil (pulled onto it, walking past): the iron goes see-through so it never hides them
    const near = () => { const Z = window.G && window.G.zone; if (!Z) return false; for (const c of Z.actors) if (c && !c.dead && Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z) < 1.0 + (c.radius || 0.5)) return true; return false; };
    const e = this._fx('anvil', 60, (e, dt) => {
      see += ((landed >= 0 && near() ? K.see : 1) - see) * Math.min(1, dt * 10);
      const d = landed < 0 ? clamp01(e.t / fall) : 1, y = landed < 0 ? K.h * (1 - d * d) : 0, a = (out >= 0 ? 1 - smooth(0, 0.3, e.t - out) : smooth(0, 0.08, e.t)) * see;
      pulse = Math.max(0, pulse - dt * 3.2); sq = Math.max(0, sq - dt * 7);
      av.position.set(0, y, 0); av.rotation.set(0, yaw, landed < 0 ? 0.25 * (1 - d) : 0); av.scale.set(K.size * (1 + 0.1 * sq), K.size * (1 - 0.14 * sq), K.size * (1 + 0.1 * sq)); av.material.uniforms.uA.value = a; av.material.uniforms.uGlow.value = 0.25 * pulse;
      cr.position.copy(av.position); cr.rotation.copy(av.rotation); cr.scale.copy(av.scale); cr.material.uniforms.uA.value = a * I * (landed < 0 ? 1.4 : K.glow * (0.7 + 0.3 * Math.sin(e.t * 4)) + 1.6 * pulse);
      // falling shadow: a dark disc that tightens + a thin warning ring of the real hit size, both gone at the landing
      this._flat(sh, 0.5 + 0.55 * d, 0.05); sh.material.uniforms.uA.value = landed < 0 ? 0.55 * d : 0.32 * a;
      this._flat(mk, R * (0.5 + 0.5 * d), 0.06); mk.material.uniforms.uA.value = landed < 0 ? I * 0.6 * d : 0;
      if (out >= 0 && e.t - out > 0.3) e.t = e.life;
    });
    e.g.position.copy(g0);
    const av = this.solid(e, this.geo.smith_anvil, { rim: C.hot, spec: 0.5 }), cr = this.glow(e, this.geo.smith_anvil_cracks, 5), sh = this.puff(e, 0x1a1410, 0x1a1410, 2), mk = this.spr(e, 1, C.gold, C.hot, 3);
    av.renderOrder = 4;
    const ring = (r, strong) => { const fx = this._fx('aring', 0.3, (x) => { const k = x.t / x.life; this._flat(rg, r * (0.3 + 0.7 * easeOut(k)), 0.07); rg.material.uniforms.uA.value = I * (strong ? 2.2 : K.ring) * (1 - smooth(0.3, 1, k)); }); fx.g.position.copy(g0); const rg = this.spr(fx, 1, C.white, C.gold, 3); rg.material.uniforms.uP.value = strong ? 1 : 0; };
    const top = () => g0.clone().setY(g0.y + 0.74 * K.size);
    return this._h(e, {
      land: (hit) => { if (landed >= 0) return; landed = e.t; sq = 1; pulse = 1; const low = lite(); ring(R, true); this.flash(g0.clone().setY(g0.y + 0.2), { size: 1.3, a: 1.1 });
        this.sparks(g0.clone().setY(g0.y + 0.15), low ? K.sparksLite : K.sparks, { ground: g0.y, speed: [2.2, 4.4], up: [1.8, 3.8], life: 0.5 }); this._puffs(g0, low ? 3 : 6, R * 0.6, { a: 0.4, life: 0.4 }); void hit; },
      pulse: (r, last) => { pulse = 1; sq = 0.5; ring(r, false); this.flash(top(), { size: 0.75, life: 0.12 }); this.sparks(top(), lite() ? 2 : 5, { ground: g0.y, life: 0.4 }); void last; },
      bump: () => { pulse = 1; sq = 0.7; this.flash(top(), { size: 1.0 }); this.sparks(top(), lite() ? 3 : 6, { ground: g0.y }); },
      expire: () => { if (out < 0) out = e.t; },
    });
  }

  // ------------------------------------------------------------------ 집게
  tongs(pc, o = {}) {
    if (!this._ok() || !this.geo.smith_jaw) return null;
    const K = SMITHFX.tongs, C = SMITHFX.col, tgt = o.tgt, reach = Math.max(0.08, o.reach || 0.16), heavy = !!o.heavy;
    let grabbed = -1, ok = false, last = tgt ? P3(tgt.pos) : P3(pc.pos), snap = 0;
    const e = this._fx('tongs', reach + (o.pull || 0.24) + 0.5, (e, dt) => {
      const from = P3(pc.pos); from.y += K.y;
      if (tgt && !tgt.dead && !tgt.removed) last = P3(tgt.pos);
      const to = last.clone(); to.y += Math.min(1.0, cookTop(tgt || { radius: 0.5 }) * 0.6);
      const full = Math.max(0.6, from.distanceTo(to)), dir = _a.copy(to).sub(from).normalize();
      let len, open, a = 1, lift = 0;
      if (grabbed < 0) { const k = clamp01(e.t / reach); len = full * (heavy ? 0.5 + 0.5 * k : easeOut(k)); open = K.open; a = smooth(0, 0.05, e.t); lift = heavy ? 0.9 * (1 - k * k) : 0; if (e.t > reach + 0.15) { grabbed = e.t; ok = false; } }
      else { const k = e.t - grabbed; snap = Math.max(0, snap - dt * 9); open = K.shut + (K.open - K.shut) * Math.max(0, 1 - k / 0.05);
        len = ok ? full : full * Math.max(0.15, 1 - k / 0.16); const end = ok ? (o.pull || 0.24) + 0.1 : 0.16; a = 1 - smooth(end - 0.08, end + 0.06, k); if (k > end + 0.06) e.t = e.life; }
      // frame: x along the tongs, y up-ish (tilted up while a heavy smash is raised)
      const d = _b.copy(dir); d.y += lift; d.normalize();
      const side = _c.crossVectors(d, UP).normalize(), up = new THREE.Vector3().crossVectors(side, d);
      _mx.makeBasis(d, up, side); grp.quaternion.setFromRotationMatrix(_mx); grp.position.copy(from);
      const piv = Math.max(0.3, len - 0.62 * K.jaw);
      for (const [j, sg] of [[jA, 1], [jB, -1]]) { j.position.set(piv, 0, 0); j.rotation.set(0, sg * -open, 0); j.scale.set(K.jaw, K.jaw, sg * K.jaw * (1 + 0.15 * snap)); j.material.uniforms.uA.value = a; j.material.uniforms.uGlow.value = 0.5 * snap; }
      for (const [b, sg] of [[bA, 1], [bB, -1]]) { b.position.set(piv, 0, sg * 0.04); b.rotation.set(0, sg * open * 0.12, 0); b.scale.set(piv, 1.4, 1.4); b.material.uniforms.uA.value = a; }
    });
    const grp = new THREE.Group(); e.g.add(grp);
    const mk = (geo) => { const m = this.solid(e, geo, { rim: C.hot, spec: 1.1 }); e.g.remove(m); grp.add(m); m.renderOrder = 6; return m; };
    const jA = mk(this.geo.smith_jaw), jB = mk(this.geo.smith_jaw), bA = mk(this.geo.smith_bar), bB = mk(this.geo.smith_bar);
    return this._h(e, { grab: (t) => { if (grabbed >= 0) return; grabbed = e.t; ok = !!t && !t.dead; snap = 1;
      const p = last.clone(); p.y += 0.6; if (t) { this.flash(p, { size: heavy ? 1.3 : 0.85, ring: heavy ? (t.radius || 0.5) + 0.5 : 0, gy: last.y }); this.sparks(p, lite() ? 3 : (heavy ? 9 : 6), { ground: last.y }); if (heavy) this._puffs(last.clone(), lite() ? 2 : 5, 1.0, { a: 0.38 }); } } });
  }

  // ------------------------------------------------------------------ 망치 접촉 / 용광로
  hit(pc, o = {}) {
    if (!this._ok()) return null;
    const C = SMITHFX.col, low = lite(), k = o.kind, hits = o.hits || [];
    if (k === 'forge') return this.forge(pc, o);
    for (const h of hits) {
      const g = P3(h), p = g.clone(); p.y += Math.min(1.0, 0.35 + (h.r || 0.5) * 0.7);
      if (k === 'tap') { this.flash(p, { size: 0.55, life: 0.1, b: C.hot }); this.sparks(p, low ? 1 : 3, { ground: g.y, life: 0.32 }); }
      else if (k === 'finish') { this.flash(p, { size: 1.15, ring: (h.r || 0.5) + 0.5, gy: g.y, b: C.hot }); this.sparks(p, low ? 3 : 8, { ground: g.y, speed: [2, 4], life: 0.5 }); this._puffs(g, low ? 2 : 4, 0.9, { a: 0.36, life: 0.38 }); }
      else if (k === 'brand') { this.flash(p, { size: 0.95, ring: (h.r || 0.5) + 0.3, gy: g.y, b: C.brand, rb: C.brand }); this.sparks(p, low ? 2 : 5, { ground: g.y, tint: 0xffa070 }); }
    }
    if (!hits.length && k === 'finish') { const f = o.f, g = P3({ x: pc.pos.x + f.x * 1.5, y: pc.pos.y || 0, z: pc.pos.z + f.z * 1.5 }); this._puffs(g, low ? 1 : 3, 0.7, { a: 0.3, life: 0.35 }); }
    return null;
  }
  /** 부채꼴 판(평면): 꼭짓점이 pc, +x가 f 방향 */
  _sector(e, pc, f, r, ang, w, b) {
    const m = this.sx(e, 0, w, b, 3); m.rotation.set(-Math.PI / 2, 0, Math.atan2(f.z, f.x)); m.scale.set(r * 2, r * 2, 1);
    const p = P3(pc.pos); m.position.set(p.x, p.y + 0.08, p.z); m.material.uniforms.uH.value = ang * Math.PI / 360; return m;
  }
  forge(pc, o) {
    const K = SMITHFX.forge, C = SMITHFX.col, I = SMITHFX.intensity, f = o.f, r = o.r || 3.2, ang = o.ang || 70, low = lite(), g0 = P3(pc.pos);
    const e = this._fx('forge', K.life, (e) => { const k = e.t / e.life, u = sec.material.uniforms; u.uP.value = 0.15 + 0.85 * easeOut(k * 1.5); u.uT.value = e.t; u.uA.value = I * 1.5 * (1 - smooth(0.45, 1, k)); });
    const sec = this._sector(e, pc, f, r, ang, C.gold, C.hotB);
    // heavy molten drops: thrown low along the cone, each leaves a small glowing spot where it lands (visual only)
    const n = low ? K.dropsLite : K.drops, parts = [], half = ang * Math.PI / 360;
    const d = this._fx('fdrops', 0.5 + K.puddle, (x, dt) => {
      for (const p of parts) {
        if (!p.down) { p.v.y -= 12 * dt; p.m.position.addScaledVector(p.v, dt); p.m.quaternion.setFromUnitVectors(UP, _a.copy(p.v).normalize());
          if (p.m.position.y <= g0.y + 0.05) { p.down = x.t; p.m.visible = false; p.s.position.copy(p.m.position).setY(g0.y + 0.06); } }
        else { const q = (x.t - p.down) / K.puddle; p.s.material.uniforms.uA.value = I * 0.9 * (1 - smooth(0.1, 1, q)); }
      }
    });
    const mouth = P3({ x: pc.pos.x + f.x * 0.7, y: (pc.pos.y || 0) + 1.0, z: pc.pos.z + f.z * 0.7 });
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(f.z, f.x) + rnd(-half, half) * 0.9, sp = rnd(0.45, 0.95) * r / 0.42, m = this.solid(d, this.geo.smith_drop, { rim: C.gold, spec: 0.2 }); m.material.uniforms.uGlow.value = 0.5; m.scale.setScalar(rnd(0.07, 0.11)); m.position.copy(mouth);
      const s = this.spr(d, 0, C.gold, C.hotB, 3); this._flat(s, rnd(0.16, 0.26), 0.06); s.material.uniforms.uA.value = 0;
      parts.push({ m, s, v: new THREE.Vector3(Math.cos(a) * sp, rnd(0.6, 1.8), -Math.sin(a) * sp), down: 0 });
    }
    this.flash(mouth, { size: 0.9, life: 0.16, b: C.hotB });
    for (const h of o.hits || []) { const g = P3(h), p = g.clone(); p.y += 0.55; this.flash(p, { size: 0.6, life: 0.12, b: C.hotB }); this.sparks(p, low ? 1 : 3, { ground: g.y }); }
    return e;
  }

  // ------------------------------------------------------------------ 급랭 담금질 (2026-11-19): 허리 담금통 → 낮은 물 부채꼴 → 적에게 닿은 곳에서 양옆으로 갈라짐 → (가열) 주황빛이 흰 수증기로
  douse(pc, o = {}) {
    if (!this._ok()) return null;
    const K = SMITHFX.quench, C = SMITHFX.col, I = SMITHFX.intensity, ht = o.ht ?? 0.28, r = o.r || 3.2, ang = o.ang || 80, sp = o.speed || 9, mouth = o.mouth || 0.6;
    let tp = -1, f0 = o.f || pc.facing, jets = [], mouthP = null;
    const e = this._fx('douse', ht + K.life + 1.4, (e, dt) => {
      // 담금통: 누른 순간 허리에서 쥐어 들고, 붓는 순간 앞으로 기울임
      const h = pc.body && pc.body.handPointL ? pc.body.handPointL() : null, hp = h || P3(pc.pos).setY(P3(pc.pos).y + 0.95);
      const tip = smooth(ht - 0.1, ht + 0.03, e.t) * (1 - smooth(ht + 0.3, ht + 0.5, e.t)), yaw = Math.atan2(f0.x, -f0.z);
      bk.position.copy(hp); bk.rotation.set(0, 0, 0); bk.rotateY(yaw); bk.rotateX(-K.tip * tip); bk.scale.setScalar(K.bucket);
      bk.material.uniforms.uA.value = smooth(0, 0.06, e.t) * (1 - smooth(ht + 0.45, ht + 0.6, e.t));
      if (tp < 0) return;
      const tt = e.t - tp, k = tt / K.life;
      // 낮은 부채꼴 물결: 앞머리가 물 속도로 나아감(실제 판정 반경까지)
      const u = sec.material.uniforms; u.uP.value = Math.min(1, (mouth + sp * tt) / r); u.uT.value = tt; u.uA.value = I * 1.15 * (1 - smooth(0.55, 1, k));
      for (const j of jets) {   // 물줄기: 통 입구 -> 낮은 포물선 -> 대상(또는 부채꼴 끝 바닥). 머리가 물 속도로 감
        const d = Math.min(j.len, sp * tt), pts = [];
        for (let i = 0; i < 10; i++) { const s = Math.max(0, d - i * 0.16) / j.len; pts.push(j.at(s)); }
        this._ribbonSet(j.m, pts, j.w); j.m.material.uniforms.uA.value = I * 1.1 * (d >= j.len ? 1 - smooth(0, 0.22, (sp * tt - j.len) / sp) : 1);
        if (!j.sprayed && d >= j.len && !j.hit) { j.sprayed = true; const q = j.at(1); this._splash(q, j.dir, 0.55, q.y - 0.05); }
      }
    });
    const bk = this.solid(e, this.bucketGeo(), { rim: C.water, spec: 0.5 }); bk.renderOrder = 6;
    const sec = this._sector(e, pc, f0, r, ang, C.water, C.waterB); sec.material.uniforms.uA.value = 0;
    return this._h(e, {
      pour: (q) => { tp = e.t; const f = f0, g0 = P3(pc.pos), yaw = Math.atan2(f.z, f.x);
        mouthP = bk.position.clone().add(new THREE.Vector3(f.x, 0, -f.z).multiplyScalar(0.25)); mouthP.y = Math.max(g0.y + 0.55, mouthP.y - 0.15);
        this._puffs(mouthP.clone(), lite() ? 1 : 3, 0.4, { c1: C.water, c2: C.waterB, a: 0.35, life: 0.3 });
        const mkJet = (to, w, hit) => { const from = mouthP.clone(), mid = from.clone().lerp(to, 0.5); mid.y = Math.max(from.y, to.y) + 0.18; const len = from.distanceTo(to) + 0.01;
          const m = this._ribbon(e, 10); m.material.uniforms.uW.value.setHex(C.water); m.material.uniforms.uB.value.setHex(C.waterB);
          const dir = new THREE.Vector3().subVectors(to, from).setY(0).normalize();
          jets.push({ m, len, w, hit, dir, at: (s) => { const a = 1 - s; return new THREE.Vector3(a * a * from.x + 2 * a * s * mid.x + s * s * to.x, a * a * from.y + 2 * a * s * mid.y + s * s * to.y, a * a * from.z + 2 * a * s * mid.z + s * s * to.z); } }); };
        const half = ang * Math.PI / 360, nf = lite() ? 3 : 5;   // 부채꼴을 채우는 물줄기(바닥에 떨어짐) + 대상마다 하나
        for (let i = 0; i < nf; i++) { const a = yaw + (-half + 2 * half * (i + 0.5) / nf) * 0.85; const to = g0.clone().add(new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)).multiplyScalar(r * 0.92)); to.y = g0.y + 0.05; mkJet(to, 0.07, false); }
        for (const h of q.hits || []) { const to = P3(h); to.y += Math.min(0.9, 0.3 + (h.r || 0.5) * 0.5); mkJet(to, 0.11, true); }
      },
      arrive: (h) => { const g = P3(h), p = g.clone(); p.y += Math.min(0.9, 0.3 + (h.r || 0.5) * 0.5); const dir = mouthP ? new THREE.Vector3().subVectors(p, mouthP).setY(0).normalize() : new THREE.Vector3(1, 0, 0);
        const j = jets.find(x => x.hit && x.at(1).distanceTo(p) < 0.6); if (j) j.sprayed = true;
        if (h.miss) { this._splash(p, dir, 0.5); return; }
        this._splash(p, dir, 1.0, g.y);
        if (h.n) this._steam(p, g.y, h.n, h.r || 0.5);
      },
    });
  }
  /** 물이 부딪힌 곳: 흐름의 양옆으로 갈라지는 물줄기 두 갈래 + 물방울 + 얇은 물 고리 */
  _splash(p, dir, s, gy) {
    const C = SMITHFX.col, I = SMITHFX.intensity, side = new THREE.Vector3(-dir.z, 0, dir.x), low = lite(), ground = gy ?? p.y - 0.6;
    const e = this._fx('split', 0.34, (e) => { const k = e.t / e.life;
      for (const [m, sg] of br) { const pts = []; for (let i = 0; i < 8; i++) { const u = Math.max(0, easeOut(k * 1.3) - i * 0.07); pts.push(p.clone().addScaledVector(side, sg * 0.95 * s * u).addScaledVector(dir, 0.25 * s * u).setY(p.y + 0.35 * s * u - 1.1 * u * u * s)); }
        this._ribbonSet(m, pts, 0.07 * s); m.material.uniforms.uA.value = I * 1.2 * (1 - smooth(0.5, 1, k)); }
      this._flat(rg, (0.3 + 0.6 * easeOut(k)) * s, ground + 0.06); rg.material.uniforms.uA.value = I * 1.2 * (1 - smooth(0.3, 1, k)); });
    e.g.position.set(0, 0, 0); const br = [-1, 1].map(sg => { const m = this._ribbon(e, 8); m.material.uniforms.uW.value.setHex(C.water); m.material.uniforms.uB.value.setHex(C.waterB); return [m, sg]; });
    const rg = this.spr(e, 1, C.water, C.waterB, 3); rg.position.copy(p);
    const dirs = []; for (let i = 0; i < (low ? 3 : 7); i++) { const sg = i % 2 ? 1 : -1; dirs.push(side.clone().multiplyScalar(sg).addScaledVector(dir, rnd(-0.2, 0.5)).add(new THREE.Vector3(0, rnd(0.4, 1.0), 0)).normalize()); }
    this._jet(p, dirs, { tint: 0x9ad8ff, glow: 0.35, ground, speed: [1.6, 3.2], life: 0.4, size: 1.2 });
  }
  /** 가열이 꺼지는 순간: 몸의 주황빛이 0.12초에 흰빛으로 바뀌고, 흰 수증기가 짧게 솟았다가 빨리 걷힘(중첩이 많을수록 굵게) */
  _steam(p, gy, n, r) {
    const K = SMITHFX.quench, C = SMITHFX.col, I = SMITHFX.intensity, low = lite(), hot = new THREE.Color(C.hot), wh = new THREE.Color(C.steam), tmp = new THREE.Color();
    const life = K.steamLife + 0.05 * n, ps = [];
    const e = this._fx('steam', life, (e) => { const k = e.t / e.life, c = smooth(0, 0.12, e.t);
      tmp.copy(hot).lerp(wh, c); fl.material.uniforms.uW.value.copy(tmp); fl.material.uniforms.uB.value.copy(tmp).lerp(hot, 0.5 * (1 - c));
      fl.quaternion.copy(this.camQ); fl.scale.setScalar((0.7 + 0.25 * n + r * 0.6) * (0.8 + 0.5 * easeOut(e.t / 0.15))); fl.material.uniforms.uA.value = I * (1.3 + 0.2 * n) * (1 - smooth(0.06, 0.24, e.t));
      for (const q of ps) { const u = clamp01((e.t - q.d) / (life - q.d)); q.m.quaternion.copy(this.camQ); q.m.position.copy(q.p0).addScaledVector(q.v, easeOut(u)); q.m.scale.setScalar(q.s * (0.5 + 1.1 * easeOut(u)));
        q.m.material.uniforms.uA.value = q.a * smooth(0, 0.1, u) * (1 - smooth(0.35, 1, u)); }
      if (rg) { this._flat(rg, (0.4 + 0.25 * n) * (0.4 + 0.6 * easeOut(k * 1.6)), 0.06); rg.position.y = gy - p.y + 0.06; rg.material.uniforms.uA.value = I * 1.4 * (1 - smooth(0.25, 0.8, k)); }
    });
    e.g.position.copy(p);
    const fl = this.spr(e, 0, C.hot, C.hotB, 7);
    const cnt = (low ? 1 : 2) + 2 * n;
    for (let i = 0; i < cnt; i++) { const a = rnd(0, 6.283), m = this.puff(e, C.steam, C.steamB, 6);
      ps.push({ m, d: rnd(0, 0.06), p0: new THREE.Vector3(Math.cos(a) * 0.12, rnd(-0.1, 0.1), Math.sin(a) * 0.12), v: new THREE.Vector3(Math.cos(a) * rnd(0.15, 0.4), K.rise * (0.7 + 0.25 * n) * rnd(0.7, 1.15), Math.sin(a) * rnd(0.15, 0.4)), s: (0.45 + 0.12 * n) * rnd(0.8, 1.2), a: 0.62 + 0.08 * n }); }
    const rg = n >= 2 ? this.spr(e, 1, C.steam, C.steamB, 3) : null;
  }

  // ------------------------------------------------------------------ 접이식 철벽
  wall(pc, o = {}) {
    if (!this._ok() || !this.geo.smith_plate) return null;
    const K = SMITHFX.wall, C = SMITHFX.col; let folding = -1, flashT = 0, fly = null;
    const grp = new THREE.Group(), wl = new THREE.Group(), wr = new THREE.Group();
    const e = this._fx('wall', (o.dur || 5) + 3, (e, dt) => {
      const u = fly ? 1 : folding >= 0 ? 1 - smooth(0, 0.22, e.t - folding) : easeOut(e.t / K.unfold), a = folding >= 0 ? 1 - smooth(0.05, 0.25, e.t - folding) : smooth(0, 0.06, e.t);
      flashT = Math.max(0, flashT - dt * 6);
      if (!fly) { const f = pc.facing, p = P3({ x: pc.pos.x + f.x * K.dist, y: pc.pos.y || 0, z: pc.pos.z + f.z * K.dist }); grp.position.copy(p); grp.rotation.set(0, Math.atan2(f.x, -f.z), 0); }
      else { grp.position.copy(fly.p); grp.rotation.x = Math.min(0.5, fly.t * 3); fly.t += dt; }
      const s = 0.5 + 0.5 * u; grp.scale.set(K.w * s, K.h * (0.6 + 0.4 * u), K.w * s);
      wl.rotation.y = (1 - u) * 2.6 + K.wing; wr.rotation.y = -(1 - u) * 2.6 - K.wing;
      for (const m of plates) { m.material.uniforms.uA.value = a; m.material.uniforms.uGlow.value = 0.45 * flashT; }
      if (folding >= 0 && e.t - folding > 0.25) e.t = e.life;
    });
    e.g.add(grp);
    const mk = (par, x) => { const m = this.solid(e, this.geo.smith_plate, { rim: C.iron, spec: 0.9 }); e.g.remove(m); par.add(m); m.position.x = x; m.renderOrder = 4; return m; };
    wl.position.x = -0.5; wr.position.x = 0.5; grp.add(wl); grp.add(wr);
    const plates = [mk(grp, 0), mk(wl, -0.5), mk(wr, 0.5)];
    const face = () => grp.position.clone().setY(grp.position.y + 0.7 * K.h);
    this.sparks(P3({ x: pc.pos.x + pc.facing.x * K.dist, y: (pc.pos.y || 0) + 0.2, z: pc.pos.z + pc.facing.z * K.dist }), lite() ? 2 : 4, { ground: pc.pos.y || 0, life: 0.3 });
    return this._h(e, {
      block: () => { flashT = 1; const p = face(); this.flash(p, { size: 0.7, life: 0.1 }); this.sparks(p, lite() ? 2 : 4, { ground: grp.position.y }); },
      kick: () => { fly = { p: grp.position.clone(), t: 0 }; flashT = 1; e.life = e.t + 1.2;
        return { set: (p) => { const q = P3(p); fly.p.set(q.x, fly.p.y, q.z); }, hit: (c) => { const p = P3(c.pos); p.y += 0.6; this.flash(p, { size: 0.9, b: C.hot }); this.sparks(p, lite() ? 2 : 5, { ground: P3(c.pos).y }); flashT = 1; },
          end: () => { if (folding < 0) { folding = e.t; this._puffs(fly.p.clone(), lite() ? 1 : 3, 0.6, { a: 0.3, life: 0.3 }); } } }; },
      fold: () => { if (folding < 0) folding = e.t; },
    });
  }

  // ------------------------------------------------------------------ 튕김망치 (2026-11-19) — 손망치·담금통은 절차 메시(정점 색, 텍스처 없음)
  _colored(parts) {
    const pos = [], nor = [], col = [], c = new THREE.Color();
    for (const [g0, hex, m] of parts) { const g = g0.index ? g0.toNonIndexed() : g0.clone(); if (m) g.applyMatrix4(m); g.computeVertexNormals(); c.setHex(hex);
      const P = g.attributes.position, N = g.attributes.normal; for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(N.getX(i), N.getY(i), N.getZ(i)); col.push(c.r, c.g, c.b); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); return g;
  }
  /** 손망치: 자루 +y(원점 = 자루 가운데), 머리 +x 쪽으로 길게 — 길이 0.42 m(SMITHFX.toss.size로 키움) */
  hammerGeo() {
    if (this._hgeo) return this._hgeo; const M = (x, y, z, rz = 0) => new THREE.Matrix4().makeRotationZ(rz).setPosition(x, y, z);
    return (this._hgeo = this._colored([
      [new THREE.CylinderGeometry(0.026, 0.032, 0.42, 8), 0x8a5a32, M(0, 0, 0)], [new THREE.CylinderGeometry(0.036, 0.036, 0.12, 8), 0x3a2418, M(0, -0.13, 0)],
      [new THREE.BoxGeometry(0.2, 0.085, 0.085), 0x4a4e58, M(0, 0.21, 0)], [new THREE.CylinderGeometry(0.052, 0.052, 0.035, 10), 0xc8ced8, M(0.11, 0.21, 0, Math.PI / 2)],
      [new THREE.CylinderGeometry(0.046, 0.04, 0.03, 10), 0xc8ced8, M(-0.11, 0.21, 0, Math.PI / 2)], [new THREE.BoxGeometry(0.06, 0.095, 0.095), 0xff8a2a, M(0, 0.21, 0)]]));
  }
  /** 허리 담금통: 원점 = 손잡이 꼭대기(손이 쥐는 곳), 통은 그 아래, 입구 +y(통 윗면 y -0.17) */
  bucketGeo() {
    if (this._bgeo) return this._bgeo; const M = (x, y, z, rx = 0) => new THREE.Matrix4().makeRotationX(rx).setPosition(x, y, z);
    return (this._bgeo = this._colored([
      [new THREE.CylinderGeometry(0.17, 0.14, 0.26, 12, 1, true), 0x9a6a3a, M(0, -0.30, 0)], [new THREE.CircleGeometry(0.14, 12), 0x6a4426, M(0, -0.43, 0, Math.PI / 2)],
      [new THREE.TorusGeometry(0.168, 0.013, 5, 16), 0x4a4e58, M(0, -0.21, 0, Math.PI / 2)], [new THREE.TorusGeometry(0.148, 0.013, 5, 16), 0x4a4e58, M(0, -0.39, 0, Math.PI / 2)],
      [new THREE.CircleGeometry(0.158, 14), 0x8ad4ff, M(0, -0.19, 0, -Math.PI / 2)], [new THREE.TorusGeometry(0.17, 0.009, 4, 12, Math.PI), 0x5a5e68, M(0, -0.17, 0)]]));
  }
  /** 방향을 정한 불티(옆으로 튀는 불꽃): dirs = 세 좌표 단위 벡터들 */
  _jet(at, dirs, o = {}) {
    if (!this.geo.smith_drop || !dirs.length) return; const parts = [], gy = o.ground ?? at.y - 1;
    const e = this._fx('jet', o.life || 0.4, (e, dt) => { const k = e.t / e.life;
      for (const p of parts) { p.v.y -= 9 * dt; p.m.position.addScaledVector(p.v, dt); if (p.m.position.y < gy + 0.03) { p.m.position.y = gy + 0.03; p.v.multiplyScalar(0.3); }
        p.m.quaternion.setFromUnitVectors(UP, _a.copy(p.v).normalize()); p.m.material.uniforms.uA.value = 1 - smooth(0.5, 1, k); } });
    for (const d of dirs) { const m = this.solid(e, this.geo.smith_drop, { tint: o.tint ?? 0xffffff, rim: SMITHFX.col.gold, spec: 0.2 }); m.material.uniforms.uGlow.value = o.glow ?? 0.6; m.scale.setScalar(rnd(0.03, 0.05) * (o.size || 1)); m.position.copy(at);
      parts.push({ m, v: d.clone().multiplyScalar(rnd(o.speed ? o.speed[0] : 3, o.speed ? o.speed[1] : 5.5)) }); }
  }
  toss(pc, o = {}) {
    if (!this._ok()) return null;
    const K = SMITHFX.toss, C = SMITHFX.col, I = SMITHFX.intensity, ht = o.ht ?? 0.24, trailN = 12, tr = [];
    let st = 'held', p = null, f = { x: 0, z: 1 }, spin = 0, dropT = -1, gyDrop = 0, v = null, lobbing = false;
    const e = this._fx('toss', 20, (e, dt) => {
      let a = 1;
      if (st === 'held') {                                                        // 허리춤에서 꺼내 왼손에 쥠(손을 따라감)
        const h = pc.body && pc.body.handPointL ? pc.body.handPointL() : null, pp = h || P3(pc.pos).setY(P3(pc.pos).y + 1.0);
        hm.position.copy(pp); const yaw = Math.atan2(pc.facing.x, -pc.facing.z);
        hm.rotation.set(0, yaw, 0.9 - 1.6 * smooth(0.06, ht, e.t)); a = smooth(0, 0.07, e.t); hm.scale.setScalar(K.size * (0.6 + 0.4 * smooth(0, 0.08, e.t)));
        if (e.t > ht + 0.4) e.t = e.life;
      } else if (st === 'fly') {                                                  // 돌며 날아감: 수평으로 빙글빙글(옆던지기), 금빛 꼬리
        spin += dt * K.spin; hm.position.copy(P3(p)); hm.rotation.set(0, Math.atan2(f.x, -f.z) + spin, Math.PI / 2 - 0.25); hm.scale.setScalar(K.size);
        tr.unshift(hm.position.clone()); if (tr.length > trailN) tr.length = trailN;
      } else if (st === 'drop') {                                                 // 바닥에 떨어져(작게 한 번 튐) 흐려지며 사라짐
        const k = e.t - dropT; v.y -= 14 * dt; hm.position.addScaledVector(v, dt);
        if (hm.position.y < gyDrop + 0.05) { hm.position.y = gyDrop + 0.05; v.set(v.x * 0.35, Math.abs(v.y) * 0.25, v.z * 0.35); }
        spin += dt * K.spin * Math.max(0, 1 - k * 2.5); hm.rotation.set(0, spin, Math.PI / 2); a = 1 - smooth(0.2, K.dropT, k); tr.unshift(hm.position.clone()); if (tr.length > trailN) tr.length = trailN;
        if (k > K.dropT) e.t = e.life;
      }
      hm.material.uniforms.uA.value = a; hm.material.uniforms.uGlow.value = st === 'fly' ? 0.12 : 0;
      gl.position.copy(hm.position); gl.quaternion.copy(this.camQ); gl.scale.setScalar(K.glow); gl.material.uniforms.uA.value = st === 'fly' ? I * 0.55 : st === 'drop' ? I * 0.3 * a : 0;
      if (tr.length > 1) { this._ribbonSet(rb, tr, K.trail); rb.material.uniforms.uA.value = I * (st === 'fly' ? (lobbing ? 1.0 : 0.85) : 0.5 * a); } else rb.material.uniforms.uA.value = 0;
    });
    const hm = this.solid(e, this.hammerGeo(), { rim: C.hot, spec: 0.9 }); hm.renderOrder = 6;
    const gl = this.spr(e, 0, C.gold, C.hot, 5), rb = this._ribbon(e, trailN); rb.material.uniforms.uW.value.setHex(C.gold); rb.material.uniforms.uB.value.setHex(C.hot);
    return this._h(e, {
      release: (q) => { st = 'fly'; p = q; const hp = P3(q); this.flash(hp, { size: 0.45, life: 0.08, b: C.hot }); tr.length = 0; },
      set: (q, ff) => { p = q; if (ff) f = ff; },
      lob: () => { lobbing = true; },
      clang: (top, ff, pulsed) => {   // 모루 윗면: 맑은 흰 섬광 + 불꽃이 망치가 날아온 방향의 양옆으로 갈라져 튐
        const at = P3(top), side = new THREE.Vector3(ff.z, 0, ff.x).normalize(), low = lite(), dirs = [];   // (ff.z, ff.x) in three = perpendicular of game (ff.x, ff.z)
        for (let i = 0; i < (low ? 4 : 9); i++) { const s = i % 2 ? 1 : -1; dirs.push(side.clone().multiplyScalar(s).add(new THREE.Vector3(rnd(-0.25, 0.25), rnd(0.35, 0.9), rnd(-0.25, 0.25))).normalize()); }
        this.flash(at, { size: 1.0, life: 0.1, w: 0xffffff, b: C.gold, a: 1.6, ring: pulsed ? 0 : 0.6, gy: at.y - SMITH_TOP });
        this._jet(at, dirs, { ground: at.y - SMITH_TOP, speed: [3.2, 6.0], life: 0.42 });
        lobbing = true;
      },
      hit: (t) => { const g = P3(t.pos), q = g.clone(); q.y = Math.max(g.y + 0.4, hm.position.y); this.flash(q, { size: 1.05, ring: (t.radius || 0.5) + 0.35, gy: g.y, b: C.hot }); this.sparks(q, lite() ? 3 : 7, { ground: g.y, speed: [2, 4] }); this._puffs(g, lite() ? 1 : 3, 0.7, { a: 0.3, life: 0.32 }); },
      glance: () => { this.flash(hm.position.clone(), { size: 0.4, life: 0.08, w: 0xffffff, b: C.iron }); },
      drop: (g) => { if (st === 'drop') return; st = 'drop'; dropT = e.t; gyDrop = P3(g).y; const d = new THREE.Vector3(f.x, 0, -f.z); v = d.multiplyScalar(-1.2).setY(2.2); e.life = e.t + K.dropT + 0.2; },
    });
  }

  // ------------------------------------------------------------------ 장인의 박자 (강화된 망치 테두리)
  tempo(pc, o = {}) {
    if (!this._ok()) return null; const C = SMITHFX.col, I = SMITHFX.intensity; let end = o.dur || 4;
    const tip = () => { try { const b = pc.body && pc.body.bladePoints && pc.body.bladePoints(); if (b) return new THREE.Vector3().copy(b[1]).lerp(b[0], 0.15); } catch (err) { /* no weapon */ } const p = P3(pc.pos); p.y += 1.25; return p; };
    const e = this._fx('tempo', end + 0.2, (e) => {
      const p = tip(), a = smooth(0, 0.1, e.t) * (1 - smooth(end - 0.3, end, e.t)), pu = 0.85 + 0.15 * Math.sin(e.t * 9);
      rg.position.copy(p); rg.quaternion.copy(this.camQ); rg.scale.setScalar(0.62 * pu); rg.material.uniforms.uA.value = I * 2.0 * a;
      gl.position.copy(p); gl.quaternion.copy(this.camQ); gl.scale.setScalar(0.9); gl.material.uniforms.uA.value = I * 0.5 * a * pu;
    });
    const rg = this.spr(e, 1, C.gold, C.hot, 7), gl = this.spr(e, 0, C.hot, C.hotB, 6);
    return this._h(e, { refresh: (d) => { end = e.t + d; e.life = end + 0.2; }, spend: () => { this.flash(tip(), { size: 0.8, life: 0.12, b: C.hot }); this._free(e); } });
  }
  emp(pc, o = {}) {
    if (!this._ok()) return null; const C = SMITHFX.col, h = o.hit, low = lite();
    if (!h) return null;
    const g = P3(h), p = g.clone(); p.y += Math.min(1.0, 0.35 + (h.r || 0.5) * 0.7);
    this.flash(p, { size: 1.05, ring: (h.r || 0.5) + 0.4, gy: g.y, b: C.hot }); this.sparks(p, low ? 3 : 7, { ground: g.y, speed: [2, 4] }); return null;
  }
  release(t, o = {}) {
    if (!this._ok() || !t) return null; const C = SMITHFX.col, g = P3(t.pos), p = g.clone(); p.y += 0.6;
    this.flash(p, { size: 1.3, ring: (t.radius || 0.5) + 0.7, gy: g.y, w: C.white, b: C.hotB, rb: C.hot }); this.sparks(p, lite() ? 3 : 8, { ground: g.y, speed: [2.4, 4.6] }); return null;
  }
  scrap(pos, o = {}) {
    if (!this._ok() || !this.geo.smith_scrap) return null; const to = o.to, C = SMITHFX.col, n = lite() ? 1 : 2, parts = [], g = P3(pos);
    const e = this._fx('scrap', 0.75, (e) => {
      const k = e.t / e.life, dst = to ? P3(to.pos) : g.clone(); dst.y += 1.0;
      for (const p of parts) { const u = smooth(0.25, 1, k); p.m.position.lerpVectors(p.p0, dst, u); p.m.position.y += Math.sin(Math.min(1, k * 1.4) * Math.PI) * p.h; p.m.rotation.x += 0.3; p.m.rotation.z += 0.2; p.m.scale.setScalar(p.s * (1 - 0.5 * u)); p.m.material.uniforms.uA.value = 1 - smooth(0.9, 1, k); }
      if (!e.done && k > 0.92) { e.done = true; this.flash(dst, { size: 0.5, life: 0.1, w: C.white, b: C.iron }); }
    });
    for (let i = 0; i < n; i++) { const m = this.solid(e, this.geo.smith_scrap, { rim: C.gold, spec: 1.0 }); m.renderOrder = 6; parts.push({ m, p0: g.clone().add(new THREE.Vector3(rnd(-0.3, 0.3), 0.4, rnd(-0.3, 0.3))), h: rnd(0.7, 1.1), s: rnd(0.2, 0.26) }); }
    return e;
  }
}
