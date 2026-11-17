// 디자이너 2차 스킬 이펙트 (2026-11-16). 규칙은 js/designer.js, 메시는 tools/blender/fx_designer.py -> assets/fx/fx_designer.glb.json(가위 날·나사·바늘·보석 핀·보석·리본 매듭·
// 마네킹 받침/몸통/머리·망토·치마·티아라·모자, 정점 색만). CookFx를 이어받아 풀·셰이더(solid 정점 색, 가산 spr: 0 원판 / 1 고리 / 2 베기 선 / 3 별 섬광, 알파 puff)를 그대로 쓰고,
// 여기서 셰이더 셋을 더함: STRIP(리본·원단 — 폭 있는 납작한 면, 알파 혼합, 가장자리만 빛), DASH(재단 점선 — 가늘고 또렷), SHEET(패턴 도면).
// 구분: 실 = 가늘고 팽팽한 선(카메라 쪽 얇은 띠), 리본 = 넓고 납작한 띠(STRIP, 꼬임·휘어짐), 가위 = 두 날이 실제 축(나사)에서 여닫힘, 원단 = 얇은 격자 면(STRIP, 절차 변형).
// 원칙: 천·리본은 제 색(분홍·보라·아이보리) 그대로 반투명, 빛은 가장자리·타격 순간에만, 몸 전체를 불투명하게 덮지 않음, 흰 화면 섬광·강한 블룸 없음,
// 예고·바닥 선 = 실제 판정 범위. 매 프레임 메시·재질을 만들지 않음(풀 재사용 — 띠·격자는 크기별로 지오메트리째 재사용). 저사양(휴대폰·그래픽 효과 끔)은
// 반짝이·조각·리본 마디만 줄이고 가위 닫힘·천 펼침·바늘 봉제·분신 이동은 그대로.
// 종류(js/designer.js this.fx(kind, a, o)) — handle 메서드는 js/designer.js 의 call(...) 로 부름(없어도 안전):
//   mark(t) -> setStacks(n), consume(), expire(), dispose()          시침 표식: 발밑 작은 금빛 바늘 1~3 + 짧은 재단 점선
//   drape(pc, {c, f, r, fly, pin}) -> pin(hits)                         실크 두 줄 -> 원단이 감싸고 핀 고정 -> 속박 동안 유지 -> 풀려 사라짐
//   break(pc, {f, tgt, close, len, marks}) -> close(p), miss()          재단 점선 + 큰 마법 가위가 점선을 따라 닫힘
//   stitch(pc, {c, f, r, pts, start, gap, fin}) -> stitch(i, hits), pull(hits)   지그재그 봉제선 + 바늘 + 금빛 실
//   cross(pc, {f, c, cuts, w, t1, t2, cr}) -> cut(k, hits, centre)      X자 두 절단(분홍 -> 은빛) + 교차 섬광·실밥
//   finalePre(pc, {f, o, r, ang, lines, dur}) -> cut(hits)              패턴 도면 + 부채꼴 재단 점선(실제 범위) -> 거대 가위 일제 절단·실크 조각
//   road(pc, {f, from, len, w, speed}) -> hit(p)                        실크 길 + 뒤따르는 리본(나선으로 풀림)
//   pirouette(pc, {f, r, n, start, gap, knot}) -> lash(i, hits), knot(hits)      넓은 리본 두 줄 회전 -> 매듭
//   mannequin(pos, {f, life}) -> hp(frac), cloak(hits), unravel(), dispose()      실로 조립되는 마네킹 + 리본 망토
//   muse(t, {dur}) -> end(), dispose()                                   작은 조명 + 무대 문양 + 보석 핀 둘
//   runwayPre(pc, {f, o, len, w, dur}) -> go({paths, gap, run, fin, mid, r}), hit(i, p), finale(hits)   빛의 런웨이 + 의상이 다른 분신 셋
//   restitch(pc, {dur, amount, cured}) · fit(pc) · unfit(pc) · made(pc, {kind, pattern, n})
// fx2(2026-11-17 '더 화려하게'): 공용 층 — sigil(재단 마법진 SIG_FS) · beam(빛기둥 BM_FS) · pang(섬광·고리·별·하트) · petals · DParts 인스턴스 입자(반짝이·별·꽃잎·보석·하트),
// Tripo 소품 tmesh('mannequin'|'brooch'|'spool') ← assets/fx/fx_designer_tripo.glb.json(없으면 절차 메시), 그림 순간 소리 _snd(ds_sparkle/sigil/jewel/mannequin/flashbulb). 자세한 내용 AGENTS.md '디자이너 2차 스킬' fx2 줄.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CookFx } from './cookfx.js';

export const DSFX = {
  intensity: 1.0,
  col: { pink: 0xff8ac8, pinkB: 0xe0509a, rose: 0xff5aa0, lilac: 0xc8a8ff, lilacB: 0x8a64e0, ivory: 0xfff4e2, ivoryB: 0xd8c8b0, plat: 0xeef2ff, platB: 0x9aa4c8,
         gold: 0xffd27a, goldB: 0xd89a30, jewel: 0x7ae0ff, white: 0xffffff },
  mark: { r: 0.35, h: 0.36, size: 0.8 },   // fx2: 바늘 0.55 -> 0.8(멀리서 안 보인다는 지적)
  scissors: { size: 1.7, open: 0.5 },
  ghost: { a: 0.78 },
  // fx2(2026-11-17 '더 화려하게'): 시전 마법진 -> 본체(큰 메시·리본·입자) -> 명중 섬광·별·하트 -> 잔광 문양. 큰 것은 실제 판정 반경 안.
  fx2: true,
  cap: { spk: 640, p3: 160 },                    // 인스턴스 입자 상한(종류당 draw call 1)
  liteK: 0.45,                                   // 휴대폰·그래픽 효과 끔: 입자 수 배율(마법진·빛기둥·가위·마네킹·리본은 그대로)
  spk: { s: 1.4, a: 1.35 },                      // 반짝이 크기·밝기 배율(가산 — 색 × 밝기는 블룸 문턱 2.6 아래)
  // 팔레트: [선, 바탕, 금테] — 마법진·빛기둥·팡
  pal: { silk: [0xffa8d8, 0xc0307a, 0xffe08a], lilac: [0xd8c0ff, 0x6a3ac0, 0xffe08a], gold: [0xffe6a0, 0xb07010, 0xfff4c8], plat: [0xf0f4ff, 0x5a6aa8, 0xffe08a],
         jewel: [0xa8f0ff, 0x1a7aa8, 0xffe08a], rose: [0xff9ac0, 0xa01858, 0xffd8a0] },
  ghost2: { a: 0.9, bob: 0.13, steps: 5 },       // 분신: 더 진하게 + 걷는 듯 통통(발걸음마다 반짝)
  muse: { beamA: 1.0, coreA: 0.95, h: 3.3 },             // 뮤즈 빛기둥(알파 혼합 몸통 + 가산 안쪽)
  finale: { scH: 3.5, scA: 0.6, size: 2.0 },               // 피날레 거대 가위: 시전자 머리 위(대상을 가리지 않게), 반투명
  tripo: { mannequin: 1.75, brooch: 0.5, spool: 0.42 },   // Tripo 모델 높이(m) — assets/fx/fx_designer_tripo.glb.json, 없으면 절차 메시
  sfxGap: { ds_sparkle: 0.14, ds_flashbulb: 0.5, ds_jewel: 0.3, ds_sigil: 0.5, ds_mannequin: 0.4 },
};
const P3 = (p) => new THREE.Vector3(p.x, p.y || 0, -p.z);
const D3 = (f) => new THREE.Vector3(f.x, 0, -f.z).normalize();
const lite = () => { const G = window.G; return !!(G && ((G.input && G.input.mobile) || (G.settings && G.settings.graphicsFx === false))); };
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
let _seed = 20261117; const rnd = (a, b) => { _seed = (_seed * 1664525 + 1013904223) >>> 0; return a + (_seed / 4294967296) * (b - a); };   // 이펙트 전용 난수 — 게임 Math.random(명중·치명)을 건드리지 않음
const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _mx = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _m3 = new THREE.Matrix4(), _q0 = new THREE.Quaternion();
const glbParse = async (url) => { const j = await (await fetch(url)).json(), raw = atob(j.b64), u8 = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i); return new Promise((res, rej) => new GLTFLoader().parse(u8.buffer, '', res, rej)); };
const U = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v }]));

// 리본·원단: 격자(aS -1..1 가로, aT 0..1 세로), 앞뒤 모두 보임. 몸통 색 uC1 -> uC2(aT), 가장자리(|aS| 또는 aT 끝)만 uE로 살짝 빛남, 빛은 법선으로 약하게
const STRIP_VS = `attribute float aS; attribute float aT; varying float vS; varying float vT; varying vec3 vN; varying vec3 vV;
void main(){ vS = aS; vT = aT; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const STRIP_FS = `uniform vec3 uC1, uC2, uE; uniform float uA, uGlow, uEdge, uCut; varying float vS; varying float vT; varying vec3 vN; varying vec3 vV;
void main(){
  if (vT < uCut) discard;
  vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
  float d = abs(dot(n, normalize(vec3(-.4, .8, .5)))), fres = pow(1. - abs(dot(n, vV)), 2.);
  vec3 c = mix(uC1, uC2, vT) * (.62 + .45 * d) + uE * fres * .25;
  float edge = smoothstep(.72, 1., abs(vS)) * uEdge;
  c += uE * (edge * .9 + uGlow);
  float a = uA * (.55 + .35 * fres + .4 * edge) * smoothstep(0., .06, vT - uCut);
  gl_FragColor = vec4(c, clamp(a, 0., 1.));
}`;
// 재단 점선: 길이 방향 uv.x, uN 개의 점, uP = 그려진 비율(0..1), 가늘고 또렷한 가운데 + 약한 번짐
const DASH_FS = `uniform vec3 uC, uE; uniform float uA, uN, uP, uSolid; varying vec2 vUv;
void main(){
  if (vUv.x > uP) discard;
  float y = abs(vUv.y - .5) * 2., core = smoothstep(.55, .2, y), halo = smoothstep(1., .1, y) * .35;
  float on = max(uSolid, step(fract(vUv.x * uN), .58));
  float a = (core + halo) * on * uA;
  gl_FragColor = vec4(mix(uE, uC, core), a);
}`;
// 패턴 도면: 아이보리 종이(반투명) + 금빛 격자·곡선 패턴(재단선) + 테두리
const SHEET_FS = `uniform float uA, uP; varying vec2 vUv;
void main(){
  vec2 p = vUv; if (p.y > uP) discard;
  vec3 paper = vec3(1., .96, .88);
  float g = max(step(.94, fract(p.x * 10.)), step(.94, fract(p.y * 7.))) * .25;
  vec2 q = p - vec2(.5, .55); float body = abs(length(q * vec2(1.6, 1.)) - .28); float curve = smoothstep(.012, .0, body);
  float dart = smoothstep(.01, .0, abs(p.x - .5 - (p.y - .3) * .25)) * step(.3, p.y) * step(p.y, .75) * step(.5, fract(p.y * 18.));
  float sleeve = smoothstep(.01, .0, abs(length((p - vec2(.15, .7)) * vec2(1., 1.4)) - .12)) * step(.5, fract(atan(p.y - .7, p.x - .15) * 5.));
  float edge = 1. - smoothstep(.0, .02, min(min(p.x, 1. - p.x), min(p.y, 1. - p.y)));
  vec3 gold = vec3(1., .78, .35), ink = vec3(.86, .4, .62);
  vec3 c = paper; c = mix(c, vec3(.75, .7, .8), g); c = mix(c, ink, curve); c = mix(c, gold, max(dart, sleeve)); c = mix(c, gold, edge);
  gl_FragColor = vec4(c, uA * (.42 + .4 * max(max(curve, edge), max(dart, sleeve))));
}`;
const FLAT_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;

// ---------------------------------------------------------------- fx2 셰이더 (2026-11-17 '화려하게')
// 재단 마법진(알파 혼합 — 밝은 마을 바닥에서도 선이 읽히게 선 둘레에 진한 바탕색 번짐): uv 0..1 = 반지름 1 원.
// uK 무늬 0 장미창(꽃잎 8 + 진주 점) / 1 교차 가위(두 날 X + 고리 둘) / 2 바늘 나침반(8각 별 + 줄자 눈금) / 3 퀼팅 레이스(마름모 격자 + 매듭 점)
// 공통: 금테 이중선, 돌아가는 바느질 점선 고리(uS 속도), 위에서부터 그려짐 uP, uT 시간, uW 선 · uB 바탕 · uG 금테, uA 불투명도.
const SIG_FS = `uniform vec3 uW, uB, uG; uniform float uA, uK, uP, uT, uS; varying vec2 vUv;
float CO, HA;
void ln(float d, float w, float k){ CO += smoothstep(w, 0., d) * k; HA += smoothstep(w * 5., 0., d) * k; }
float seg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return length(pa - ba * h); }
vec2 rot(vec2 p, float a){ float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
void main(){
  vec2 p = vUv * 2. - 1.; float r = length(p); if (r > 1.) discard;
  float a = atan(p.y, p.x), an = fract(a / 6.2832 + .25); CO = 0.; HA = 0.;
  float draw = step(an, uP * 1.35), inner = smoothstep(.35, .85, uP), G0;
  ln(abs(r - .962), .017, draw); ln(abs(r - .905), .009, draw); G0 = CO;
  vec2 q = rot(p, uT * uS); float aq = atan(q.y, q.x);
  float st = step(.45, fract(aq * 7.639)) * smoothstep(.016, .0, abs(r - .83)) * draw; CO += st * 1.1; HA += st * .55;   // 바느질 점선
  ln(abs(r - .76), .008, draw);
  float pearl = smoothstep(.035, .018, length(vec2(fract(aq / 6.2832 * 16.) - .5, (r - .76) * 4.))) * draw; CO += pearl * .9;
  vec2 w = rot(p, -uT * uS * .5); float k = inner, rw = length(w);
  if (uK < .5) {
    for (int i = 0; i < 8; i++) { float aa = float(i) * .7854; vec2 d = vec2(cos(aa), sin(aa)); float tt = dot(w, d), ss = abs(w.x * d.y - w.y * d.x);
      float wdt = .16 * sin(clamp((tt - .14) / .54, 0., 1.) * 3.1416); ln(abs(ss - wdt), .012, k * step(.14, tt) * step(tt, .68)); }
    ln(abs(rw - .2), .01, k); CO += smoothstep(.07, .04, rw) * k;
  } else if (uK < 1.5) {
    for (int s = 0; s < 2; s++) { float aa = s == 0 ? .7854 : -.7854; vec2 d = vec2(cos(aa), sin(aa)), n = vec2(-d.y, d.x); float tt = dot(w, d), ss = dot(w, n);
      float half_ = .07 * sin(clamp((tt + .1) / .78, 0., 1.) * 3.1416); ln(abs(abs(ss) - half_), .011, k * step(-.1, tt) * step(tt, .68));
      vec2 rc = -d * .3 + n * (s == 0 ? .1 : -.1); ln(abs(length(w - rc) - .1), .011, k); }
    CO += smoothstep(.06, .035, rw) * k;
  } else if (uK < 2.5) {
    for (int i = 0; i < 8; i++) { float aa = float(i) * .7854, L = mod(float(i), 2.) < .5 ? .68 : .42; vec2 tip = vec2(cos(aa), sin(aa)) * L;
      vec2 s0 = vec2(cos(aa + .3927), sin(aa + .3927)) * .12, s1 = vec2(cos(aa - .3927), sin(aa - .3927)) * .12; ln(seg(w, s0, tip), .01, k); ln(seg(w, s1, tip), .01, k); }
    float tk = step(.5, fract(atan(w.y, w.x) / 6.2832 * 48.)) * smoothstep(.02, .0, abs(rw - .62) - .025); CO += tk * k * .8; ln(abs(rw - .12), .01, k);
  } else {
    vec2 g = rot(w, .7854) * 4.2; vec2 fi = abs(fract(g) - .5); float dd = min(fi.x, fi.y);
    ln(dd, .025, k * step(rw, .7) * step(.5, fract((g.x + g.y) * 2.))); CO += smoothstep(.13, .08, length(fract(g) - .5)) * k * step(rw, .7); ln(abs(rw - .7), .011, k);
  }
  CO = clamp(CO, 0., 1.); HA = clamp(HA, 0., 1.);
  vec3 lineC = mix(uW, uG, clamp(G0, 0., 1.));
  float fill = .14 * smoothstep(1., .2, r) * inner + .07 * smoothstep(.75, .98, r) * draw;
  gl_FragColor = vec4(mix(uB, lineC, smoothstep(0., .6, CO)), clamp(CO * 1.2 + HA * .5 + fill, 0., 1.) * uA);
}`;
// 빛기둥(열린 원통 ds_beam, uv.y = 높이). uMode 0 = 가산(안쪽 빛, 블룸 문턱 아래 색), 1 = 알파 혼합 색 몸통(밝은 바닥에서도 보이게)
const BM_VS = `varying vec2 vUv; varying float vF; void main(){ vUv = uv; vec3 n = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vF = abs(dot(n, normalize(-mv.xyz))); gl_Position = projectionMatrix * mv; }`;
const BM_FS = `uniform vec3 uW, uB; uniform float uA, uT, uMode; varying vec2 vUv; varying float vF;
void main(){ float y = vUv.y, st = .55 + .45 * sin(vUv.x * 62.83 * 2. + y * 3. - uT * 2.) * sin(y * 14. - uT * 7. + vUv.x * 31.4);
  float sp = smoothstep(.93, 1., sin(vUv.x * 62.83 * 3. + y * 40. - uT * 11.)) * (1. - y);   // 위로 흐르는 반짝 줄
  float edge = .3 + .7 * pow(1. - vF, 1.4), a = pow(1. - y, 1.2) * smoothstep(0., .05, y) * edge * (.55 + .45 * st);
  vec3 c = mix(uB, uW, clamp(.8 - y + .4 * st + sp, 0., 1.));
  if (uMode < .5) { gl_FragColor = vec4(c * (a + sp * .6) * uA * 1.5, 1.); return; }
  float e2 = pow(1. - vF, 2.2), ab = pow(1. - y, 1.5) * smoothstep(0., .05, y) * (.06 + .94 * e2) * (.7 + .3 * st);   // 알파 몸통: 가장자리만 진하게(가운데 대상이 비쳐 보이게), 진한 바탕색 쪽으로
  gl_FragColor = vec4(mix(uB, uW, .3 + .35 * st + sp), clamp(ab * .85 + sp * .4, 0., 1.) * uA); }`;
// 피날레 부채꼴 절단 물결(CookFx.fan 지오메트리: uv.x 가로 0..1, uv.y 반지름 0..1): uP = 물결 앞(반지름 비율), 지나간 자리에 비단 결 잔광
const SWEEP_FS = `uniform vec3 uW, uB, uG; uniform float uA, uP, uT; varying vec2 vUv;
void main(){ float u = vUv.x, v = vUv.y, side = smoothstep(0., .04, u) * smoothstep(1., .96, u);
  float crest = exp(-pow((v - uP) * 14., 2.)), behind = smoothstep(uP + .01, uP - .02, v) * exp(-(uP - v) * 3.);
  float silk = .5 + .5 * sin(u * 50. + v * 8. - uT * 6.);
  float edge = (1. - side) * step(v, uP);
  vec3 c = mix(uB, uW, clamp(crest + silk * .2, 0., 1.)); c = mix(c, uG, clamp(crest * .6 + edge, 0., 1.));
  gl_FragColor = vec4(c, clamp(crest * .95 + behind * (.18 + .12 * silk) + edge * .7, 0., 1.) * side * uA * step(.04, v)); }`;
// 인스턴스 반짝이(카메라 판; aK 0 부드러운 점 / 1 네 갈래 별 / 2 고리 / 3 하트), aA 밝기, aR 화면 회전, instanceColor 색 — 가산
const SPK_VS = `attribute float aA, aK, aR; varying vec2 vUv; varying float vA, vK; varying vec3 vC;
void main(){ vUv = uv; vA = aA; vK = aK; vC = vec3(1.);
#ifdef USE_INSTANCING_COLOR
  vC = instanceColor;
#endif
  vec4 c = modelViewMatrix * instanceMatrix * vec4(0., 0., 0., 1.); float s = length(instanceMatrix[0].xyz); float cs = cos(aR), sn = sin(aR);
  vec2 q = vec2(position.x * cs - position.y * sn, position.x * sn + position.y * cs); c.xy += q * s; gl_Position = projectionMatrix * c; }`;
const SPK_FS = `varying vec2 vUv; varying float vA, vK; varying vec3 vC;
void main(){ vec2 p = vUv * 2. - 1.; float r = length(p), a;
  if (vK < .5) a = exp(-r * r * 5.) * (1. - smoothstep(.85, 1., r));
  else if (vK < 1.5) { float x = abs(p.x), y = abs(p.y); a = (exp(-x * 26.) * exp(-y * 2.6) + exp(-y * 26.) * exp(-x * 2.6)) * .9 + exp(-r * r * 30.); a *= 1. - smoothstep(.9, 1., r); }
  else if (vK < 2.5) a = smoothstep(.12, .0, abs(r - .78)) * (1. - smoothstep(.95, 1., r));
  else { vec2 h = vec2(p.x, p.y * 1.15 + .25); float hd = pow(h.x * h.x + h.y * h.y - .36, 3.) - h.x * h.x * h.y * h.y * h.y; a = smoothstep(.02, -.02, hd) * .9 + exp(-r * r * 12.) * .3; }
  vec3 c = mix(vC, vec3(1.), .55 * exp(-r * r * 40.)); gl_FragColor = vec4(c * a * vA, 1.); }`;
// 인스턴스 3D 조각(별·꽃잎·보석 조각·하트): 정점 색 × instanceColor, aA = 자체 발광
const P3_VS = `attribute vec3 color; attribute float aA; varying vec3 vC, vN; varying float vA;
void main(){ vec3 ic = vec3(1.);
#ifdef USE_INSTANCING_COLOR
  ic = instanceColor;
#endif
  vC = color * ic; vA = aA; vN = normalize(mat3(modelViewMatrix * instanceMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.); }`;
const P3_FS = `varying vec3 vC, vN; varying float vA;
void main(){ vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n; float d = max(0., dot(n, normalize(vec3(-.3, .8, .55)))), sp = pow(max(0., dot(reflect(-normalize(vec3(-.3, .8, .55)), n), vec3(0., 0., 1.))), 18.);
  gl_FragColor = vec4(vC * (.58 + .55 * d) + vC * vA + vec3(sp * .5), 1.); }`;

/** 인스턴스 입자 묶음 하나(종류당 draw call 1). bill = 카메라 판(반짝이), 아니면 3D 조각. 상한이 차면 새 입자는 버림. (js/herbalfx.js HParts 와 같은 방식) */
class DParts {
  constructor(geo, mat, cap, bill) {
    this.cap = cap; this.bill = bill; this.P = [];
    const m = new THREE.InstancedMesh(geo, mat, cap); m.frustumCulled = false; m.count = 0; m.renderOrder = bill ? 8 : 6;
    m.setColorAt(0, new THREE.Color(1, 1, 1));   // instanceColor 를 처음부터 만들어 셰이더가 USE_INSTANCING_COLOR 로 컴파일되게
    this.aA = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1); geo.setAttribute('aA', this.aA);
    if (bill) { this.aK = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1); this.aR = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1); geo.setAttribute('aK', this.aK); geo.setAttribute('aR', this.aR); }
    this.mesh = m; this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._s = new THREE.Vector3();
  }
  add(o) { if (this.P.length >= this.cap) return null; const p = Object.assign({ t: 0, life: 0.8, g: 0, drag: 0, s0: 0.15, s1: 0.05, a: 1, col: 0xffffff, k: 0, rot: 0, w: 0, rx: 0, ry: 0, rz: 0, wx: 0, wy: 0, wz: 0, inT: 0.08, outK: 0.55, glow: 0 }, o);
    if (!p.v) p.v = new THREE.Vector3(); p.c = new THREE.Color(p.col); this.P.push(p); return p; }
  step(dt) {
    const P = this.P, keep = []; let n = 0;   // t < 0 = 아직 기다리는 입자(그리지 않고 남김)
    for (let i = 0; i < P.length; i++) {
      const p = P[i]; p.t += dt; if (p.t >= p.life) continue; if (p.t < 0) { keep.push(p); continue; }
      const k = p.t / p.life;
      p.v.y += p.g * dt; if (p.drag) p.v.multiplyScalar(Math.max(0, 1 - p.drag * dt)); p.p.addScaledVector(p.v, dt);
      if (p.floor != null && p.p.y < p.floor) { p.p.y = p.floor; p.v.set(p.v.x * 0.3, 0, p.v.z * 0.3); p.wx *= 0.3; p.wz *= 0.3; }
      if (p.flut) { p.p.x += Math.sin(p.t * p.flut + p.rot) * dt * 0.5; p.p.z += Math.cos(p.t * p.flut * 0.8 + p.rot) * dt * 0.5; }
      const fa = Math.min(1, p.t / Math.max(0.001, p.inT)) * (1 - Math.max(0, (k - p.outK) / (1 - p.outK)));
      let sc = p.s0 + (p.s1 - p.s0) * k;
      if (this.bill) { if (p.tw) sc *= 0.7 + 0.3 * Math.sin(p.t * p.tw + p.rot); this._m.makeScale(sc, sc, sc).setPosition(p.p); this.aA.array[n] = p.a * fa; this.aK.array[n] = p.k; this.aR.array[n] = p.rot + p.w * p.t; }
      else { sc *= fa > 0 ? Math.min(1, 0.25 + fa) : 0; this._e.set(p.rx + p.wx * p.t, p.ry + p.wy * p.t, p.rz + p.wz * p.t); this._q.setFromEuler(this._e); this._m.compose(p.p, this._q, this._s.setScalar(sc)); this.aA.array[n] = p.glow; }
      this.mesh.setMatrixAt(n, this._m); this.mesh.setColorAt(n, p.c); keep.push(p); n++;
    }
    this.P = keep; this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; this.aA.needsUpdate = true; if (this.bill) { this.aK.needsUpdate = true; this.aR.needsUpdate = true; }
  }
  clear() { this.P.length = 0; this.mesh.count = 0; }
}

export class DesignerFx extends CookFx {
  load() {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const g = await glbParse('assets/fx/fx_designer.glb.json');
      g.scene.traverse(o => { if (o.isMesh) this.geo[o.name] = o.geometry; });
      this.piece = new THREE.PlaneGeometry(1, 0.6); { const n = this.piece.attributes.position.count, c = new Float32Array(n * 3); for (let i = 0; i < n; i++) c.set(i % 2 ? [1, 0.62, 0.84] : [0.86, 0.72, 1], i * 3); this.piece.setAttribute('color', new THREE.BufferAttribute(c, 3)); }   // 실크 조각(분홍·보라)
      if (DSFX.fx2) this._fx2Load();
      try {   // Tripo 소품(tools/blender/fx_designer_tripo.py) — 없으면 절차 메시
        const tg = await glbParse('assets/fx/fx_designer_tripo.glb.json');
        tg.scene.traverse(o => { if (o.isMesh && o.material && o.material.map) this.tri[o.name] = { geo: o.geometry, map: o.material.map }; });
      } catch (err) { console.warn('designerfx: no Tripo props', err && err.message); }
      this.ready = true;
    })().catch(e => console.warn('designerfx load', e));
    return this.loading;
  }
  // ================================================================== fx2 공용 층(2026-11-17): 재단 마법진 · 빛기둥 · 인스턴스 반짝이/별/꽃잎/보석/하트 · 팡 · 소리
  _fx2Load() {
    if (this.parts) return;
    const quad = new THREE.PlaneGeometry(1, 1), cap = DSFX.cap;
    const spkMat = new THREE.ShaderMaterial({ vertexShader: SPK_VS, fragmentShader: SPK_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const p3Mat = () => new THREE.ShaderMaterial({ vertexShader: P3_VS, fragmentShader: P3_FS, side: THREE.DoubleSide });
    this.parts = { spk: new DParts(quad, spkMat, cap.spk, true) };
    for (const [k, g] of [['star', 'ds_star'], ['petal', 'ds_petal'], ['gem', 'ds_gem'], ['heart', 'ds_heart']]) if (this.geo[g]) this.parts[k] = new DParts(this.geo[g].clone(), p3Mat(), cap.p3, false);
    for (const p of Object.values(this.parts)) this.root.add(p.mesh);
    this.beamGeo = this.geo.ds_beam || new THREE.CylinderGeometry(1, 1, 1, 24, 4, true).translate(0, 0.5, 0);
    this.disc = new THREE.PlaneGeometry(2, 2); this.disc.rotateX(-Math.PI / 2);
    this.sndT = {}; this.clk = 0;
  }
  update(dt) { this.clk = (this.clk || 0) + dt; super.update(dt); if (this.parts) for (const p of Object.values(this.parts)) p.step(dt); }
  clear() { super.clear(); if (this.parts) for (const p of Object.values(this.parts)) p.clear(); }
  _nk(n) { return Math.max(1, Math.round(n * (lite() ? DSFX.liteK : 1))); }
  /** 반짝이 하나(three 좌표): o = {v, g, life, s0, s1, a, col, k(0 점/1 별/2 고리/3 하트), tw} */
  spark(at, o = {}) { const p = this.parts && this.parts.spk.add(Object.assign({ p: at.clone() }, o)); if (p) { p.s0 *= DSFX.spk.s; p.s1 *= DSFX.spk.s; p.a *= DSFX.spk.a; } return p; }
  /** 3D 조각 하나: kind star/petal/gem/heart */
  bit(kind, at, o = {}) { const P = this.parts && this.parts[kind]; return P ? P.add(Object.assign({ p: at.clone(), rx: rnd(0, 6), ry: rnd(0, 6), rz: rnd(0, 6) }, o)) : null; }
  /** 흩날리는 장미 꽃잎(분홍·라일락·아이보리) */
  petals(at, n, o = {}) {
    n = this._nk(n); const cols = o.cols || [0xffa0cc, 0xffc8e4, 0xd8b8ff, 0xfff0f6];
    for (let i = 0; i < n; i++) { const a = rnd(0, 6.283), sp = rnd(0.3, 1.2) * (o.speed ?? 1);
      this.bit('petal', at.clone().add(new THREE.Vector3(Math.cos(a) * (o.r ?? 0.2), rnd(0, o.h ?? 0.2), Math.sin(a) * (o.r ?? 0.2))), { v: new THREE.Vector3(Math.cos(a) * sp, rnd(0.6, 1.8) * (o.up ?? 1), Math.sin(a) * sp), g: o.g ?? -1.6, drag: 1.2, flut: rnd(4, 8),
        life: rnd(0.8, 1.3) * (o.life ?? 1), s0: rnd(0.09, 0.14) * (o.size ?? 1), s1: rnd(0.06, 0.1) * (o.size ?? 1), col: cols[i % cols.length], wx: rnd(-5, 5), wy: rnd(-3, 3), wz: rnd(-5, 5), glow: 0.15, outK: 0.65, floor: o.floor }); }
  }
  /** '팡': 섬광 + 퍼지는 이중 고리 + 네 갈래 별·하트 반짝이 + 통통한 3D 별 몇 개 — 명중·완성 순간(r = 크기, 판정 반경 안에서 부를 것) */
  pang(at, pal = 'silk', o = {}) {
    if (!this.parts) return; const c = DSFX.pal[pal] || DSFX.pal.silk, r = o.r ?? 0.6, n = this._nk(o.n ?? 10);
    this.flash(at, r * 1.7, c[0], c[1], 0.16, 1.1);
    const g = at.clone(); g.y = o.ground ?? this.gy({ x: at.x, z: -at.z });
    this.ring(g, r * 1.3, c[2], c[1], 0.42, 1.1, 0.15); if (!o.noRing2) this.ring(g, r * 0.8, c[0], c[1], 0.32, 0.9, 0.1);
    for (let i = 0; i < n; i++) { const a = rnd(0, 6.283), sp = rnd(1.2, 3.0) * r;
      this.spark(at, { v: new THREE.Vector3(Math.cos(a) * sp, rnd(0.8, 2.6) * r, Math.sin(a) * sp), g: -3, drag: 2.5, life: rnd(0.4, 0.75), s0: rnd(0.16, 0.28) * Math.max(0.7, r), s1: 0.02, col: i % 3 ? c[0] : c[2], k: i % 4 === 3 ? 3 : i % 2 ? 1 : 0, a: 1.1, w: rnd(-4, 4) }); }
    const ns = o.stars ?? (lite() ? 1 : 3);
    for (let i = 0; i < ns; i++) { const a = rnd(0, 6.283), sp = rnd(1.4, 2.6), kind = i === 1 && this.parts.heart ? 'heart' : 'star';
      this.bit(kind, at, { v: new THREE.Vector3(Math.cos(a) * sp, rnd(2.2, 3.4), Math.sin(a) * sp), g: -7, life: rnd(0.55, 0.8), s0: 0.13 * Math.max(0.8, r), s1: 0.06, wz: rnd(-9, 9), wy: rnd(-4, 4), rx: 0, ry: rnd(0, 6), rz: 0, col: 0xffffff, glow: 0.45, outK: 0.6 }); }
    if (!o.quiet) this._snd('ds_sparkle');
  }
  /** 재단 마법진 메시(효과 e 안) — _sigSet 으로 매 프레임 */
  _sig(e, pat, pal, order = 2) {
    const p = this.pool.dssig || (this.pool.dssig = []); let m = p.pop();
    if (!m) { m = new THREE.Mesh(this.disc, new THREE.ShaderMaterial({ uniforms: U({ uW: new THREE.Color(), uB: new THREE.Color(), uG: new THREE.Color(), uA: 0, uK: 0, uP: 1, uT: 0, uS: 0.6 }), vertexShader: FLAT_VS, fragmentShader: SIG_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide })); m.frustumCulled = false; m.userData.kind = 'dssig'; }
    const c = DSFX.pal[pal] || DSFX.pal.silk, u = m.material.uniforms; u.uK.value = pat; u.uW.value.setHex(c[0]); u.uB.value.setHex(c[1]); u.uG.value.setHex(c[2]); u.uA.value = 0; u.uP.value = 0; u.uT.value = 0;
    m.visible = true; m.renderOrder = order; m.position.set(0, 0, 0); m.quaternion.identity(); m.scale.set(1, 1, 1); e.items.push(m); e.g.add(m); return m;
  }
  /** 바닥 마법진(three 좌표 중심, 반지름 r = 실제 범위 이하). o: pat, grow, life, a, spin, follow(()=>three 좌표), fade. handle: end(t) */
  sigil(at, r, pal, o = {}) {
    if (!this.parts) return null; const grow = o.grow ?? 0.35, A = o.a ?? 0.85;
    const e = this._fx('dssigil', o.life ?? 1.2, (e) => {
      const fk = e.ending != null ? 1 - clamp01((e.t - e.ending) / Math.max(0.01, e.life - e.ending)) : 1 - smooth(e.life - (o.fade ?? 0.45), e.life, e.t), u = m.material.uniforms;
      if (o.follow) { const p = o.follow(); if (p) m.position.set(p.x, this.gy({ x: p.x, z: -p.z }) + 0.06, p.z); }
      u.uP.value = easeOut(clamp01(e.t / grow)); u.uT.value = e.t; u.uA.value = A * fk * smooth(0, 0.06, e.t) * (o.pulse ? 0.8 + 0.2 * Math.sin(e.t * 6) : 1);
      m.scale.setScalar(r * (0.82 + 0.18 * easeOut(clamp01(e.t / grow))));
    });
    const m = this._sig(e, o.pat ?? 0, pal, 1); m.material.uniforms.uS.value = o.spin ?? 0.6;
    m.position.copy(at); m.position.y = this.gy({ x: at.x, z: -at.z }) + 0.06; m.scale.setScalar(r);
    if (o.snd) this._snd('ds_sigil');
    return this._h(e, { end: (t = 0.4) => { if (e.ending == null && !e.dead) { e.ending = e.t; e.life = e.t + t; } } });
  }
  /** 빛기둥 메시(효과 e 안): mode 0 가산 / 1 알파 혼합 */
  _beamM(e, pal, mode = 0, order = 6) {
    const key = mode ? 'dsbmA' : 'dsbm', p = this.pool[key] || (this.pool[key] = []); let m = p.pop();
    if (!m) { m = new THREE.Mesh(this.beamGeo, new THREE.ShaderMaterial({ uniforms: U({ uW: new THREE.Color(), uB: new THREE.Color(), uA: 0, uT: 0, uMode: mode }), vertexShader: BM_VS, fragmentShader: BM_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: mode ? THREE.NormalBlending : THREE.AdditiveBlending })); m.frustumCulled = false; m.userData.kind = key; }
    const c = DSFX.pal[pal] || DSFX.pal.silk; m.material.uniforms.uW.value.setHex(c[0]); m.material.uniforms.uB.value.setHex(c[1]); m.material.uniforms.uA.value = 0;
    m.visible = true; m.renderOrder = order; m.position.set(0, 0, 0); m.quaternion.identity(); m.scale.set(1, 1, 1); e.items.push(m); e.g.add(m); return m;
  }
  /** 빛기둥(three 좌표 밑, 반지름 r, 높이 h, life 초; 솟았다가 가늘어지며 사라짐) — 가산 안쪽 + 옅은 알파 몸통(밝은 바닥에서도) */
  beam(at, r, h, pal, o = {}) {
    if (!this.parts) return null; const life = o.life ?? 0.6;
    const e = this._fx('dsbeam', life, (e) => { const k = e.t / life, up = easeOut(clamp01(e.t / 0.12)), w = 1 - 0.6 * smooth(0.3, 1, k);
      for (const [m, a, s] of [[m0, o.a ?? 1.0, 0.7], [m1, (o.a ?? 1.0) * 0.7, 1.0]]) { m.position.copy(at); m.scale.set(r * w * s, h * up, r * w * s); m.material.uniforms.uT.value = e.t; m.material.uniforms.uA.value = DSFX.intensity * a * (1 - smooth(0.45, 1, k)); } });
    const m0 = this._beamM(e, pal, 0, 6), m1 = this._beamM(e, pal, 1, 5);
    return e;
  }
  /** 같은 소리 반복 제한(DSFX.sfxGap) — 규칙(js/designer.js)의 소리에 덧붙이는 연출 소리 */
  _snd(n) { const now = this.clk || 0, g = DSFX.sfxGap[n] ?? 0.12; if (this.sndT && now - (this.sndT[n] ?? -9) < g) return; if (this.sndT) this.sndT[n] = now; this.sfx(n); }
  /** Tripo 모델(있으면, CookFx 'tex' 재질) — 없으면 null. 모델은 바닥 y 0·높이 1·가로 가운데 */
  tmesh(e, name, o = {}) { const t = this.tri && this.tri['tripo_' + name]; if (!t) return null; const m = this._m(e, 'tex', t.geo, o.order ?? 4), u = m.material.uniforms; u.uMap.value = t.map; u.uRim.value.setHex(o.rim ?? 0xffe8f4); u.uA.value = o.a ?? 1; u.uGlow.value = 0; u.uGain.value = o.gain ?? 1.08; m.userData.tex = true; return m; }
  _h(e, o = {}) { e.dispose = () => this._free(e); return Object.assign(e, o); }
  // ------------------------------------------------------------------ materials / meshes (pooled)
  _matX(kind) {
    if (kind === 'strip') return new THREE.ShaderMaterial({ uniforms: U({ uC1: new THREE.Color(), uC2: new THREE.Color(), uE: new THREE.Color(), uA: 0, uGlow: 0, uEdge: 1, uCut: 0 }), vertexShader: STRIP_VS, fragmentShader: STRIP_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    if (kind === 'dash') return new THREE.ShaderMaterial({ uniforms: U({ uC: new THREE.Color(), uE: new THREE.Color(), uA: 0, uN: 8, uP: 1, uSolid: 0 }), vertexShader: FLAT_VS, fragmentShader: DASH_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    return new THREE.ShaderMaterial({ uniforms: U({ uA: 0, uP: 1 }), vertexShader: FLAT_VS, fragmentShader: SHEET_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  }
  /** a flat dashed line on the ground (or any plane): from a to b (three coords), width w */
  dash(e, col = DSFX.col.gold, edge = DSFX.col.goldB, order = 3) {
    const p = this.pool.dash || (this.pool.dash = []); let m = p.pop();
    if (!m) { m = new THREE.Mesh(this.quad, this._matX('dash')); m.frustumCulled = false; m.userData.kind = 'dash'; }
    m.geometry = this.quad; m.visible = true; m.renderOrder = order; m.position.set(0, 0, 0); m.quaternion.identity(); m.scale.set(1, 1, 1);
    const u = m.material.uniforms; u.uC.value.setHex(col); u.uE.value.setHex(edge); u.uA.value = 0; u.uN.value = 8; u.uP.value = 1; u.uSolid.value = 0;
    e.items.push(m); e.g.add(m); return m;
  }
  /** lay a dash quad flat from a to b at height y (three coords), width w; dashes ≈ every 0.32 m */
  dashSet(m, a, b, w = 0.07, y = null) {
    _a.subVectors(b, a); _a.y = 0; const L = _a.length() || 1e-3; _a.normalize();
    m.position.copy(a).add(b).multiplyScalar(0.5); if (y != null) m.position.y = y;
    _b.copy(UP); _c.crossVectors(_a, _b); _mx.makeBasis(_a, _c.multiplyScalar(-1), _b); m.quaternion.setFromRotationMatrix(_mx);
    m.scale.set(L, w, 1); m.material.uniforms.uN.value = Math.max(1, L / 0.32); return L;
  }
  sheet(e, order = 6) {
    const p = this.pool.sheet || (this.pool.sheet = []); let m = p.pop();
    if (!m) { m = new THREE.Mesh(this.quad, this._matX('sheet')); m.frustumCulled = false; m.userData.kind = 'sheet'; }
    m.visible = true; m.renderOrder = order; m.position.set(0, 0, 0); m.quaternion.identity(); m.scale.set(1, 1, 1); m.material.uniforms.uA.value = 0; m.material.uniforms.uP.value = 1;
    e.items.push(m); e.g.add(m); return m;
  }
  /** grid strip (ribbon / cloth): nu across (>= 2) × nv along; geometry kept with the mesh in its own pool */
  grid(e, nu, nv, c1 = DSFX.col.pink, c2 = DSFX.col.lilac, edge = DSFX.col.gold, order = 4) {
    const key = 'grid' + nu + 'x' + nv, p = this.pool[key] || (this.pool[key] = []); let m = p.pop();
    if (!m) {
      const g = new THREE.BufferGeometry(), N = nu * nv, aS = new Float32Array(N), aT = new Float32Array(N), idx = [];
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { aS[j * nu + i] = nu > 1 ? i / (nu - 1) * 2 - 1 : 0; aT[j * nu + i] = nv > 1 ? j / (nv - 1) : 0; }
      for (let j = 0; j < nv - 1; j++) for (let i = 0; i < nu - 1; i++) { const a = j * nu + i, b = a + 1, c = a + nu, d = c + 1; idx.push(a, c, b, b, c, d); }
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3)); g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      g.setAttribute('aS', new THREE.BufferAttribute(aS, 1)); g.setAttribute('aT', new THREE.BufferAttribute(aT, 1)); g.setIndex(idx);
      m = new THREE.Mesh(g, this._matX('strip')); m.frustumCulled = false; m.userData.kind = key; m.userData.nu = nu; m.userData.nv = nv;
    }
    m.visible = true; m.renderOrder = order; m.position.set(0, 0, 0); m.quaternion.identity(); m.scale.set(1, 1, 1);
    const u = m.material.uniforms; u.uC1.value.setHex(c1); u.uC2.value.setHex(c2); u.uE.value.setHex(edge); u.uA.value = 0; u.uGlow.value = 0; u.uEdge.value = 1; u.uCut.value = 0;
    e.items.push(m); e.g.add(m); return m;
  }
  /** fill a grid: fn(i, j, out Vector3) for every vertex (three coords); normals from neighbours */
  gridSet(m, fn) {
    const nu = m.userData.nu, nv = m.userData.nv, P = m.geometry.attributes.position, Nn = m.geometry.attributes.normal;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { fn(i, j, _a); P.setXYZ(j * nu + i, _a.x, _a.y, _a.z); }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const k = j * nu + i, i0 = Math.max(0, i - 1), i1 = Math.min(nu - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(nv - 1, j + 1);
      _b.set(P.getX(j * nu + i1) - P.getX(j * nu + i0), P.getY(j * nu + i1) - P.getY(j * nu + i0), P.getZ(j * nu + i1) - P.getZ(j * nu + i0));
      _c.set(P.getX(j1 * nu + i) - P.getX(j0 * nu + i), P.getY(j1 * nu + i) - P.getY(j0 * nu + i), P.getZ(j1 * nu + i) - P.getZ(j0 * nu + i));
      _d.crossVectors(_b, _c); if (_d.lengthSq() < 1e-10) _d.set(0, 1, 0); _d.normalize(); Nn.setXYZ(k, _d.x, _d.y, _d.z);
    }
    P.needsUpdate = true; Nn.needsUpdate = true;
  }
  /** a flat ribbon along a centre line pts (three coords, nv points): width w, side direction = sideFn(j) (unit, three coords) */
  ribbonSet(m, pts, w, sideFn) {
    const nv = m.userData.nv;
    this.gridSet(m, (i, j, out) => { const p = pts[Math.min(j, pts.length - 1)], s = sideFn(j), k = (i / (m.userData.nu - 1) - 0.5) * w * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, (j + 0.5) / nv * 1.02))); out.set(p.x + s.x * k, p.y + s.y * k, p.z + s.z * k); });
  }
  /** big magic scissors: two blades on one screw. Returns a group; set g.userData.open (0..1) */
  scissors(e, size = DSFX.scissors.size, tint = 0xffffff) {
    const g = new THREE.Group(); e.g.add(g);
    const a = this.solid(e, this.geo.ds_blade, { rim: 0xffe0f0, spec: 1.2, tint }), b = this.solid(e, this.geo.ds_blade, { rim: 0xffe0f0, spec: 1.2, tint }), s = this.solid(e, this.geo.ds_screw, { spec: 1 });
    for (const m of [a, b, s]) { g.add(m); m.renderOrder = 7; }
    b.scale.set(1, -1, 1);   // 거울상(위·아래로 겹친 두 날)
    a.position.y = 0.018; b.position.y = -0.018;
    g.scale.setScalar(size); g.userData = { a, b, s, open: 1 };
    return g;
  }
  scissorsPose(g, open, alpha, glow = 0) {
    const ang = DSFX.scissors.open * open; g.userData.a.rotation.y = ang; g.userData.b.rotation.y = -ang;
    for (const m of [g.userData.a, g.userData.b, g.userData.s]) { m.material.uniforms.uA.value = alpha; m.material.uniforms.uGlow.value = glow; }
  }
  /** orient a group so local +x runs along dir and its flat side (local y) turns to the camera */
  faceAlong(g, dir) { const x = _a.copy(dir).normalize(), y = _b.copy(this.toCam).addScaledVector(x, -this.toCam.dot(x)); if (y.lengthSq() < 1e-6) y.set(0, 1, 0); y.normalize(); const z = _c.crossVectors(x, y); _mx.makeBasis(x, y, z); g.quaternion.setFromRotationMatrix(_mx); }
  flash(at, s, w, b, life = 0.14, a = 1.0) {
    const e = this._fx('dsflash', life, (e) => { const k = e.t / life; m.quaternion.copy(this.camQ); m.scale.setScalar(s * (0.6 + 0.6 * easeOut(k))); m.material.uniforms.uA.value = DSFX.intensity * a * (1 - smooth(0.1, 1, k)); });
    e.g.position.copy(at); const m = this.spr(e, 3, w, b, 8); return e;
  }
  ring(at, r, w, b, life = 0.3, a = 1.0, from = 0.4) {
    const e = this._fx('dsring', life, (e) => { const k = e.t / life; this._flat(m, r * (from + (1 - from) * easeOut(k)), 0.06); m.material.uniforms.uA.value = DSFX.intensity * a * (1 - smooth(0.3, 1, k)); });
    e.g.position.copy(at); const m = this.spr(e, 1, w, b, 3); m.material.uniforms.uP.value = 0.4; return e;
  }
  sparkles(at, n, spread = 0.6, col = DSFX.col.gold) {
    n = lite() ? Math.ceil(n / 2) : n; const ss = [];
    const e = this._fx('sparkles', 0.6, (e) => { for (const s of ss) { const k = (e.t - s.d) / 0.4; s.m.visible = k > 0 && k < 1; if (!s.m.visible) continue; s.m.quaternion.copy(this.camQ); s.m.position.copy(s.p).setY(s.p.y + k * 0.3); s.m.scale.setScalar(0.16 * Math.sin(Math.PI * k)); s.m.material.uniforms.uA.value = DSFX.intensity * 1.1; } });
    e.g.position.copy(at); for (let i = 0; i < n; i++) ss.push({ m: this.spr(e, 3, 0xffffff, col, 8), p: new THREE.Vector3(rnd(-spread, spread), rnd(-0.2, spread), rnd(-spread, spread)), d: rnd(0, 0.18) });
    return e;
  }
  /** loose threads / silk scraps thrown out of a point */
  scraps(at, n, ground, o = {}) { if (this.piece) this._bits(at, lite() ? Math.ceil(n / 2) : n, { geo: this.piece, size: o.size || [0.07, 0.13], speed: o.speed || [1.0, 2.2], up: o.up || [1.4, 2.8], ground, life: o.life || 0.6 }); }
  threadBurst(at, n, len = 0.35) {
    n = lite() ? Math.ceil(n / 2) : n; const ls = [];
    const e = this._fx('threads', 0.4, (e) => { const k = e.t / 0.4; for (const l of ls) { l.m.position.copy(l.d).multiplyScalar(easeOut(k) * len * 1.6); l.m.scale.set(len * (1 - 0.5 * k), 0.035, 1); l.m.material.uniforms.uA.value = DSFX.intensity * (1 - smooth(0.4, 1, k)); this._alignLine(l.m, l.d); } });
    e.g.position.copy(at); for (let i = 0; i < n; i++) { const a = rnd(0, Math.PI * 2), y = rnd(-0.4, 0.8); ls.push({ m: this.spr(e, 2, DSFX.col.gold, DSFX.col.goldB, 7), d: new THREE.Vector3(Math.cos(a), y, Math.sin(a)).normalize() }); }
    return e;
  }
  hand(pc, f, fwd = 0.5, y = 1.0) { let h = null; try { h = pc.body && pc.body.handPoint && pc.body.handPoint(); } catch (e) { h = null; } return h ? new THREE.Vector3(h.x, h.y, h.z) : P3({ x: pc.pos.x + f.x * fwd, y: (pc.pos.y || 0) + y, z: pc.pos.z + f.z * fwd }); }
  gy(p) { try { const G = window.G; return G.zone.geo.ground(p.x, p.z).y; } catch (e) { return p.y || 0; } }

  // ================================================================== 시침 표식
  mark(t) {
    if (!this._ok() || !this.geo.ds_needle) return null;
    const K = DSFX.mark; let n = 0, shown = 0, gone = -1, mode = '', pop = 0;
    const e = this._fx('mark', 1e9, (e, dt) => {
      if (t && !t.removed) g0.copy(P3(t.pos));
      shown += (n - shown) * Math.min(1, dt * 14); pop = Math.max(0, pop - dt * 4);
      const out = gone >= 0 ? clamp01((e.t - gone) / 0.3) : 0, R = (t.radius || 0.5) + K.r;
      ns.forEach((q, i) => {
        const on = clamp01(shown - i), a = i * 2.1 + 0.6 + e.t * 0.35, ox = Math.cos(a) * R, oz = Math.sin(a) * R;
        let y = K.h * (0.6 + 0.4 * on) + 0.05 * Math.sin(e.t * 3 + i);
        if (mode === 'consume') y += easeOut(out) * 1.2;
        q.position.set(g0.x + ox, g0.y + y, g0.z + oz);
        _a.set(-ox, -K.h * 1.4, -oz).normalize(); _mx.lookAt(new THREE.Vector3(), _a, UP); q.quaternion.setFromRotationMatrix(_mx); q.rotateY(-Math.PI / 2);   // 바늘 끝(+x)이 대상 발밑 쪽
        if (mode === 'consume') q.rotateX(out * 8);
        q.scale.setScalar(K.size * (on > 0 ? 0.6 + 0.4 * on + pop * 0.3 : 0));
        q.material.uniforms.uA.value = on * (1 - out); q.material.uniforms.uGlow.value = pop * 0.6 + (mode === 'consume' ? out * 0.6 : 0);
      });
      ds.forEach((d, i) => { const a0 = i * 2.1 + 0.6 + e.t * 0.35 + 0.35, a1 = a0 + 0.55; this.dashSet(d, _c.set(g0.x + Math.cos(a0) * (R + 0.05), g0.y + 0.05, g0.z + Math.sin(a0) * (R + 0.05)).clone(), new THREE.Vector3(g0.x + Math.cos(a1) * (R + 0.05), g0.y + 0.05, g0.z + Math.sin(a1) * (R + 0.05)), 0.045); d.material.uniforms.uA.value = 0.9 * clamp01(shown - i) * (1 - out); d.material.uniforms.uN.value = 2.5; });
      // fx2: 발밑 작은 재단 마법진(진한 테두리 — 멀리서·밝은 바닥에서도 보임) + 바늘 머리마다 반짝이는 별 + 쌓일수록 진해짐
      if (sg) { const u = sg.material.uniforms; sg.position.set(g0.x, g0.y + 0.05, g0.z); sg.scale.setScalar(R + 0.12 + pop * 0.12); u.uP.value = Math.min(1, u.uP.value + 0.08); u.uT.value = e.t; u.uA.value = (0.5 + 0.16 * shown) * clamp01(shown) * (1 - out); }
      gl.forEach((m, i) => { const q = ns[i], on = clamp01(shown - i); _a.set(-0.42 * K.size, 0, 0).applyQuaternion(q.quaternion); m.position.copy(q.position).add(_a).addScaledVector(this.toCam, 0.05); m.quaternion.copy(this.camQ); m.scale.setScalar(0.3 * on * (0.75 + 0.25 * Math.sin(e.t * 5 + i * 2)) * (1 + pop)); m.material.uniforms.uA.value = DSFX.intensity * 0.9 * on * (1 - out); });
      if (gone >= 0 && out >= 1) e.life = 0;
    });
    const g0 = P3(t.pos), ns = [0, 1, 2].map(() => { const m = this.solid(e, this.geo.ds_needle, { rim: 0xfff0b0, spec: 1.0 }); m.renderOrder = 6; return m; });
    const ds = [0, 1, 2].map(() => this.dash(e));
    const sg = this.parts ? this._sig(e, 3, 'gold', 1) : null; if (sg) sg.material.uniforms.uS.value = 0.8;
    const gl = this.parts ? [0, 1, 2].map(() => this.spr(e, 3, 0xffffff, DSFX.col.pinkB, 7)) : [];
    const burst = (big) => { if (!this.parts) return; const at = g0.clone().setY(g0.y + 0.4); for (let i = 0; i < this._nk(big ? 7 : 3); i++) { const a = rnd(0, 6.283), sp = rnd(1, 2.4); this.bit('gem', at, { v: new THREE.Vector3(Math.cos(a) * sp, rnd(1.5, 3), Math.sin(a) * sp), g: -8, life: 0.55, s0: 0.05, s1: 0.03, col: i % 2 ? 0xffb0dc : 0xa8f0ff, wx: rnd(-9, 9), wz: rnd(-9, 9), glow: 0.35, floor: g0.y + 0.02 }); } };
    return this._h(e, { setStacks: (k) => { const up = k > n; n = Math.max(0, Math.min(3, k)); pop = 1; if (up && this.parts) for (let i = 0; i < this._nk(4); i++) { const a = rnd(0, 6.283); this.spark(g0.clone().setY(g0.y + 0.35), { v: new THREE.Vector3(Math.cos(a) * 1.2, rnd(1, 2), Math.sin(a) * 1.2), g: -3, drag: 2, life: 0.45, s0: 0.18, s1: 0.03, col: i % 2 ? DSFX.col.gold : DSFX.col.pink, k: 1 }); } },
      consume: () => { if (gone < 0) { gone = e.t; mode = 'consume'; burst(true); } }, expire: () => { if (gone < 0) { gone = e.t; mode = 'expire'; } } });
  }

  // ================================================================== A1 실크 드레이핑
  drape(pc, o = {}) {
    if (!this._ok()) return null;
    const C = DSFX.col, I = DSFX.intensity, c = P3(o.c), f = D3(o.f || { x: 0, z: 1 }), side = new THREE.Vector3(-f.z, 0, f.x), fly = o.fly || 0.22, pinT = o.pin || 0.5, r = o.r || 3;
    let hits = null, pinAt = -1; const wraps = [];
    const e = this._fx('drape', pinT + 0.4, (e) => {
      // 실크 두 줄: 양옆(손 높이)에서 대상 쪽으로 휘어져 날아감
      const u = clamp01((e.t - fly * 0.4) / (pinT - fly * 0.4)), from = this.hand(pc, o.f || { x: 0, z: 1 });
      rs.forEach((m, k) => {
        const sg = k ? 1 : -1, pts = [];
        for (let j = 0; j < NV; j++) { const s = (j / (NV - 1)) * u, x = 1 - s; const ctrl = _b.copy(from).lerp(c, 0.5).addScaledVector(side, sg * r * 0.9).setY(from.y + 1.2);
          pts.push(new THREE.Vector3(x * x * from.x + 2 * x * s * ctrl.x + s * s * c.x, x * x * from.y + 2 * x * s * ctrl.y + s * s * (c.y + 1.0), x * x * from.z + 2 * x * s * ctrl.z + s * s * c.z)); }
        this.ribbonSet(m, pts, 0.46, (j) => _d.copy(side).multiplyScalar(0.3).add(UP).normalize());
        m.material.uniforms.uA.value = 0.95 * smooth(0, 0.06, e.t) * (pinAt < 0 ? 1 : 1 - clamp01((e.t - pinAt) / 0.2)); m.material.uniforms.uCut.value = pinAt < 0 ? 0 : clamp01((e.t - pinAt) / 0.2);
        // fx2: 실크 머리에서 꽃잎·반짝이가 흩날림(본체 꼬리)
        if (this.parts && pinAt < 0 && u > 0.02 && u < 1 && e.t - (m.userData.pt || 0) > 0.05) { m.userData.pt = e.t; const hd = pts[NV - 1]; this.petals(hd, 1, { r: 0.05, up: 0.3, speed: 0.4, size: 0.9 }); this.spark(hd, { v: new THREE.Vector3(rnd(-0.4, 0.4), rnd(0.2, 0.8), rnd(-0.4, 0.4)), life: 0.5, s0: 0.2, s1: 0.03, col: k ? DSFX.col.lilac : DSFX.col.pink, k: 1, a: 1 }); }
      });
      this._flat(ring, r, 0.05); ring.material.uniforms.uA.value = I * 0.5 * smooth(0, 0.1, e.t) * (pinAt < 0 ? 1 : 1 - clamp01((e.t - pinAt) / 0.25));
    });
    const NV = lite() ? 9 : 14, rs = [this.grid(e, 2, NV, C.pink, C.lilac, C.gold, 5), this.grid(e, 2, NV, C.lilac, C.pink, C.gold, 5)];
    const ring = this.spr(e, 1, C.pink, C.pinkB, 3); ring.material.uniforms.uP.value = 0.3; ring.position.copy(c).sub(e.g.position);
    // fx2: 조준 자리에 장미창 마법진(= 실제 반경 r) — 누른 순간 그려지고 핀 고정 뒤 잔광으로 사라짐
    const sg = this.sigil(c, r, 'silk', { pat: 0, grow: pinT * 0.8, life: pinT + 0.9, a: 0.68, spin: 0.5, snd: true });
    return this._h(e, { pin: (hs) => {
      pinAt = e.t; hits = hs || [];
      if (!hits.length) { this.clothFall(c, r * 0.5); return; }
      for (const h of hits) { this.wrap(h, h.root > 0 ? h.root : 1.0); const at = P3(h); this.pang(at.clone().setY(at.y + 0.9), 'silk', { r: 0.55, n: 8, ground: at.y }); this.beam(at, 0.42, 2.4, 'silk', { life: 0.55, a: 0.9 }); this.petals(at.clone().setY(at.y + 1.0), 4, { r: 0.3 }); }
      void sg;
    } });
  }
  /** 원단이 대상을 감싸고 금빛 핀 넷이 모서리를 고정 — dur 동안 유지(속박), 끝나면 풀려 사라짐. 반투명이라 몸 전체를 가리지 않음 */
  wrap(h, dur) {
    const C = DSFX.col, I = DSFX.intensity, at = P3(h), R = (h.r || 0.5) + 0.22, H = Math.min(1.7, 0.75 + (h.r || 0.5) * 0.9), NU = lite() ? 7 : 10, NV = lite() ? 6 : 8;
    const life = dur + 0.4, t0 = h.t;
    const e = this._fx('wrap', life, (e) => {
      if (t0 && !t0.dead && !t0.removed) at.copy(P3(t0.pos)); else if (t0 && t0.dead && e.t < life - 0.4) e.t = life - 0.4;
      const wrapIn = easeOut(e.t / 0.18), out = clamp01((e.t - (life - 0.4)) / 0.4);
      this.gridSet(cl, (i, j, o) => {
        const a = (i / (NU - 1)) * Math.PI * 1.7 - Math.PI * 0.85 + Math.PI / 2, v = j / (NV - 1);
        const rr = R * (1 + 0.25 * (1 - wrapIn)) * (1 - 0.18 * Math.sin(v * Math.PI)) * (1 + out * 0.6), y = H * (0.15 + 0.85 * (1 - v)) * (0.6 + 0.4 * wrapIn) - out * 0.4 * v;
        const sway = 0.04 * Math.sin(e.t * 5 + i * 0.8 + j);
        o.set(at.x + Math.cos(a) * (rr + sway), at.y + y, at.z + Math.sin(a) * (rr + sway));
      });
      cl.material.uniforms.uA.value = 0.42 * smooth(0, 0.12, e.t) * (1 - out); cl.material.uniforms.uGlow.value = 0.35 * (1 - smooth(0, 0.25, e.t));
      pins.forEach((p, k) => { const a = (k / 3) * Math.PI * 1.5 - Math.PI * 0.75 + Math.PI / 2, y = H * (k % 2 ? 0.3 : 0.85); p.position.set(at.x + Math.cos(a) * (R + 0.04), at.y + y, at.z + Math.sin(a) * (R + 0.04));
        _a.set(-Math.cos(a), 0, -Math.sin(a)); _mx.lookAt(new THREE.Vector3(), _a, UP); p.quaternion.setFromRotationMatrix(_mx); p.rotateX(-Math.PI / 2);
        const ink = clamp01((e.t - 0.04 - k * 0.03) / 0.08); p.scale.setScalar(0.42 * (0.4 + 0.6 * ink) * (1 - out)); p.material.uniforms.uA.value = ink * (1 - out); p.material.uniforms.uGlow.value = 0.5 * (1 - smooth(0.05, 0.3, e.t)); });
    });
    const cl = this.grid(e, NU, NV, C.pink, C.lilac, C.gold, 5), pins = [0, 1, 2, 3].map(() => { const m = this.solid(e, this.geo.ds_pin, { rim: 0xfff0c0, spec: 1 }); m.renderOrder = 6; return m; });
    this.flash(at.clone().setY(at.y + H * 0.6), 0.55, C.gold, C.goldB, 0.12, 0.9);
    return e;
  }
  clothFall(c, r) {
    const C = DSFX.col, NU = 6;
    const e = this._fx('clothfall', 0.6, (e) => { const k = e.t / 0.6; this.gridSet(cl, (i, j, o) => o.set(c.x + (i / (NU - 1) - 0.5) * r, c.y + 0.9 * (1 - easeOut(k)) + 0.05 + 0.05 * Math.sin(i + e.t * 8), c.z + (j / (NU - 1) - 0.5) * r)); cl.material.uniforms.uA.value = 0.4 * (1 - smooth(0.5, 1, k)); });
    const cl = this.grid(e, NU, NU, C.pink, C.lilac, C.gold, 4); return e;
  }

  // ================================================================== A2 패턴 브레이크
  break(pc, o = {}) {
    if (!this._ok() || !this.geo.ds_blade) return null;
    const C = DSFX.col, I = DSFX.intensity, f = D3(o.f || { x: 0, z: 1 }), closeT = o.close || 0.28, len = o.len || 2.2;
    let tgt = o.tgt || null, closedAt = -1, ok = false, n = o.marks || 0;
    const at = tgt ? P3(tgt.pos) : P3({ x: pc.pos.x + o.f.x * 1.4, y: pc.pos.y || 0, z: pc.pos.z + o.f.z * 1.4 });
    const mid = () => Math.min(1.3, 0.55 + (tgt ? tgt.radius || 0.5 : 0.5) * 0.6);
    const dir = new THREE.Vector3(-f.z, 0.55, f.x).normalize();   // 대상을 비스듬히 가로지르는 재단선(시전 방향에 수직, 30° 기울기)
    const e = this._fx('break', closeT + 0.5, (e) => {
      if (tgt && !tgt.dead && !tgt.removed && closedAt < 0) at.copy(P3(tgt.pos));
      const c = _c.copy(at).setY(at.y + mid()), a = c.clone().addScaledVector(dir, -len / 2), b = c.clone().addScaledVector(dir, len / 2);
      // 점선(세로 판 — 카메라 쪽): 0.15초에 그려짐
      ln.position.copy(c); this._alignLine(ln, dir); ln.scale.set(len, 0.15, 1);
      ln.material.uniforms.uP.value = smooth(0, 0.15, e.t); ln.material.uniforms.uA.value = (closedAt < 0 ? 1 : 1 - clamp01((e.t - closedAt) / 0.2)) * (0.9 + n * 0.08); ln.material.uniforms.uN.value = 9; ln.material.uniforms.uSolid.value = closedAt >= 0 ? 1 : 0;
      // 큰 가위: 점선의 시작점에 나사, 날은 점선 방향, 닫히는 순간 = 피해
      const u = closedAt >= 0 ? 1 : smooth(closeT - 0.1, closeT, e.t), open = closedAt >= 0 ? 0 : 1 - u;
      sc.position.copy(a).addScaledVector(dir, -0.1 + 0.35 * u); this.faceAlong(sc, dir);
      const out = closedAt >= 0 ? clamp01((e.t - closedAt - 0.12) / 0.2) : 0;
      this.scissorsPose(sc, open, smooth(0, 0.1, e.t) * (1 - out), closedAt >= 0 ? Math.max(0, 0.7 - (e.t - closedAt) * 4) : 0.15 * u);
      // fx2: 벌어진 두 날 끝에서 반짝이가 흘러나옴(시전 준비) + 대상 발밑 교차 가위 마법진
      if (this.parts && closedAt < 0 && e.t - lastSp > 0.04) { lastSp = e.t; for (const bl of [sc.userData.a, sc.userData.b]) { _a.set(1, 0, 0).applyQuaternion(_q0.copy(sc.quaternion).multiply(bl.quaternion)).multiplyScalar(sc.scale.x * 0.95); this.spark(_b.copy(sc.position).add(_a), { v: new THREE.Vector3(0, rnd(0.2, 0.6), 0), life: 0.32, s0: 0.2, s1: 0.03, col: DSFX.col.pink, k: 1, a: 0.9 }); } }
      if (sg) { const g = sg.material.uniforms; sg.position.set(at.x, at.y + 0.06, at.z); g.uP.value = smooth(0, closeT * 0.8, e.t); g.uT.value = e.t; g.uA.value = 0.8 * (closedAt < 0 ? 1 : 1 - clamp01((e.t - closedAt - 0.15) / 0.3)); }
    });
    let lastSp = -1; const ln = this.dash(e, C.gold, C.goldB, 7), sc = this.scissors(e, DSFX.scissors.size * 0.9);
    const sg = this.parts ? this._sig(e, 1, 'silk', 1) : null; if (sg) sg.scale.setScalar(Math.min(1.4, (tgt ? tgt.radius || 0.5 : 0.5) + 0.6));
    return this._h(e, {
      close: (p) => { closedAt = e.t; ok = p.ok; n = p.n || 0; e.life = e.t + 0.4; if (!ok) return;
        const c = P3(p).setY((p.y || 0) + mid());
        this.flash(c, 0.55 + 0.1 * n, C.white, C.pinkB, 0.12, 0.9);
        for (let k = 0; k <= n; k++) { const off = (k - n / 2) * 0.12, d2 = dir.clone(); const lf = this._fx('cutline', 0.3, (x) => { const q = x.t / 0.3; l.scale.set(len * (0.8 + 0.3 * easeOut(q)), 0.07, 1); l.material.uniforms.uA.value = I * (k ? 0.9 : 1.2) * (1 - smooth(0.2, 1, q)); }); lf.g.position.copy(c).setY(c.y + off); const l = this.spr(lf, 2, k ? C.gold : C.white, C.goldB, 7); this._alignLine(l, d2); }
        this.scraps(c, 3 + n * 3, P3(p).y, { size: [0.08, 0.14] }); if (n) this.threadBurst(c, 4 + n * 2);
        if (p.bound) this.ring(P3(p), (p.r || 0.5) + 0.4, C.gold, C.goldB, 0.3, 0.9);
        // fx2: 팡 + 소비한 시침 수만큼 보석 조각·하트, 2개 이상이면 빛기둥
        this.pang(c, n >= 2 ? 'gold' : 'silk', { r: 0.6 + 0.12 * n, n: 8 + 3 * n, ground: P3(p).y, stars: lite() ? 1 : 2 + Math.min(2, n) });
        for (let i = 0; i < this._nk(3 * n); i++) { const a = rnd(0, 6.283), sp = rnd(1.4, 2.8); this.bit('gem', c, { v: new THREE.Vector3(Math.cos(a) * sp, rnd(1.8, 3.2), Math.sin(a) * sp), g: -8, life: 0.6, s0: 0.06, s1: 0.03, col: i % 2 ? 0xffb0dc : 0xa8f0ff, wx: rnd(-9, 9), wz: rnd(-9, 9), glow: 0.4, floor: P3(p).y + 0.02 }); }
        if (n >= 2) this.beam(P3(p), Math.min(0.9, (p.r || 0.5) + 0.2), 2.8, 'gold', { life: 0.5 });
        this.petals(c, 2 + n, { r: 0.2 });
      },
      miss: () => { closedAt = e.t; e.life = e.t + 0.35; },
    });
  }

  // ================================================================== A3 오트쿠튀르 스티치
  stitch(pc, o = {}) {
    if (!this._ok() || !this.geo.ds_needle) return null;
    const C = DSFX.col, I = DSFX.intensity, c = P3(o.c), pts = (o.pts || []).map(p => P3({ x: p.x, y: this.gy(p), z: p.z })), n = pts.length, start = o.start || 0.3, gap = o.gap || 0.13, finT = o.fin || start + n * gap, r = o.r || 2.4;
    const hist = []; let pulled = -1;
    const e = this._fx('stitch', finT + 0.6, (e) => {
      // 봉제 경로: 누른 순간부터 0.2초에 점선이 그려짐(실제 바늘이 지나갈 곳)
      segs.forEach((d, i) => { this.dashSet(d, pts[i], pts[i + 1], 0.1, pts[i].y + 0.04); d.material.uniforms.uP.value = clamp01(e.t / 0.2 * (n - 1) - i); d.material.uniforms.uA.value = 0.8 * (pulled < 0 ? 1 : 1 - clamp01((e.t - pulled) / 0.2)); });
      this._flat(ring, r, 0.05); ring.position.copy(c); ring.material.uniforms.uA.value = I * 0.35 * smooth(0, 0.15, e.t) * (1 - smooth(finT, finT + 0.3, e.t));
      // 바늘: 점 i-1 -> i 를 gap 동안, 사이에서는 떠오르고 점에서는 땅을 꿰뚫음(끝 방향 = 나아가는 방향)
      const s = (e.t - start + gap) / gap, i = Math.floor(s), u = s - i;
      if (s >= 0 && i < n && pulled < 0) {
        const a = i === 0 ? pts[0].clone().setY(pts[0].y + 0.9).addScaledVector(D3(o.f || { x: 0, z: 1 }), -0.6) : pts[i - 1], b = pts[i];
        const p = new THREE.Vector3().lerpVectors(a, b, u); p.y += Math.sin(Math.PI * u) * 0.45 - 0.08 * smooth(0.85, 1, u);
        const q = new THREE.Vector3().lerpVectors(a, b, Math.min(1, u + 0.05)); q.y += Math.sin(Math.PI * Math.min(1, u + 0.05)) * 0.45;
        nd.position.copy(p); _d.subVectors(q, p); if (_d.lengthSq() > 1e-8) { _d.normalize(); _mx.lookAt(new THREE.Vector3(), _d, UP); nd.quaternion.setFromRotationMatrix(_mx); nd.rotateY(-Math.PI / 2); }
        nd.scale.setScalar(0.95); nd.material.uniforms.uA.value = 1; nd.material.uniforms.uGlow.value = 0.35; hist.unshift(p.clone()); if (hist.length > 60) hist.length = 60;
        if (this.parts) this.spark(p, { v: new THREE.Vector3(rnd(-0.2, 0.2), rnd(0.1, 0.5), rnd(-0.2, 0.2)), life: 0.4, s0: 0.17, s1: 0.02, col: (i % 2) ? DSFX.col.gold : DSFX.col.pink, k: (i % 2) ? 1 : 0, a: 1 });
        if (sth && sp) { const top = _b.set(c.x, c.y + 2.3 + DSFX.tripo.spool * 0.5, c.z); const pts = []; for (let q = 0; q < 10; q++) { const v = q / 9; pts.push(new THREE.Vector3().lerpVectors(top, p, v).setY(top.y + (p.y - top.y) * v + Math.sin(Math.PI * v) * 0.25)); } this._ribbonSet(sth, pts.reverse(), 0.018); sth.material.uniforms.uA.value = DSFX.intensity * 0.9; }
      } else if (pulled >= 0 || i >= n) { nd.material.uniforms.uA.value = Math.max(0, nd.material.uniforms.uA.value - 0.08); if (sth) sth.material.uniforms.uA.value = Math.max(0, sth.material.uniforms.uA.value - 0.1); }
      if (sp) { const sa = (pulled < 0 ? smooth(0, 0.2, e.t) : 1 - clamp01((e.t - pulled - 0.15) / 0.3)); sp.material.uniforms.uA.value = sa; sp.scale.setScalar(DSFX.tripo.spool * Math.max(0.01, sa)); sp.position.set(c.x, c.y + 2.3 + 0.08 * Math.sin(e.t * 4) + (pulled >= 0 ? (e.t - pulled) * 1.5 : 0), c.z); sp.rotation.set(0.3, e.t * (pulled < 0 ? 14 : 4), 0); }
      // 금빛 실: 바늘이 지나간 길 그대로(당기면 가운데로 모이며 팽팽해짐)
      if (hist.length > 2) {
        const pull = pulled >= 0 ? easeOut((e.t - pulled) / 0.18) : 0, path = hist.map(p => pull ? p.clone().lerp(_b.copy(c).setY(c.y + 0.3), pull * 0.55) : p);
        this._ribbonSet(th, path, 0.03); th.material.uniforms.uA.value = I * 1.1 * (pulled < 0 ? 1 : 1 - clamp01((e.t - pulled - 0.2) / 0.3));
      }
    });
    const segs = []; for (let i = 0; i < n - 1; i++) segs.push(this.dash(e, C.pink, C.pinkB, 3));
    const ring = this.spr(e, 1, C.gold, C.goldB, 3); ring.material.uniforms.uP.value = 0.2;
    const nd = this.solid(e, this.geo.ds_needle, { rim: 0xfff4c0, spec: 1.2 }); nd.renderOrder = 7;
    const th = this._ribbon(e, 60); th.material.uniforms.uW.value.setHex(C.gold); th.material.uniforms.uB.value.setHex(C.goldB);
    // fx2: 바늘 나침반 마법진(= 실제 반경 r) + 공중의 금실 실패(Tripo, 없으면 생략)에서 바늘까지 이어진 실
    this.sigil(c, r, 'gold', { pat: 2, grow: start, life: finT + 0.8, a: 0.8, spin: 0.7 });
    const sp = this.tmesh(e, 'spool', { order: 6 }), sth = sp ? this._ribbon(e, 10) : null; if (sth) { sth.material.uniforms.uW.value.setHex(C.gold); sth.material.uniforms.uB.value.setHex(C.goldB); }
    return this._h(e, {
      stitch: (i, hits) => { const p = pts[Math.min(i, n - 1)]; this.flash(p.clone().setY(p.y + 0.08), 0.32, C.gold, C.goldB, 0.1, 0.8); for (const h of hits || []) { this.flash(P3(h).setY((h.y || 0) + 0.7), 0.34, C.white, C.gold, 0.1, 0.7); this.bit('star', P3(h).setY((h.y || 0) + 0.9), { v: new THREE.Vector3(rnd(-1, 1), 2.4, rnd(-1, 1)), g: -7, life: 0.5, s0: 0.1, s1: 0.05, rx: 0, rz: 0, wy: rnd(-6, 6), col: 0xffffff, glow: 0.4 }); }
        if (this.parts) this.spark(p.clone().setY(p.y + 0.1), { life: 0.3, s0: 0.45, s1: 0.1, col: C.gold, k: 1, a: 1.1 }); },
      pull: (hits) => { pulled = e.t; this.ring(c, r * 0.6, C.gold, C.goldB, 0.3, 1.0, 1.0); this.sparkles(c.clone().setY(c.y + 0.4), 6, r * 0.4); for (const h of hits || []) this.flash(P3(h).setY((h.y || 0) + 0.7), 0.45, C.white, C.goldB, 0.12, 0.9);
        this.pang(c.clone().setY(c.y + 0.6), 'gold', { r: 0.8, n: 12, ground: c.y }); this.beam(c, 0.7, 3.0, 'gold', { life: 0.6 }); this.petals(c.clone().setY(c.y + 0.8), 5, { r: 0.4 }); },
    });
  }

  // ================================================================== A4 크로스 커팅
  cross(pc, o = {}) {
    if (!this._ok()) return null;
    const C = DSFX.col, I = DSFX.intensity, gy = this.gy(o.c), cuts = (o.cuts || []).map(([a, b]) => [P3({ x: a.x, y: gy, z: a.z }), P3({ x: b.x, y: gy, z: b.z })]), c = P3({ x: o.c.x, y: gy, z: o.c.z }), ts = [o.t1 || 0.22, o.t2 || 0.38];
    const cutAt = [-1, -1];
    const e = this._fx('cross', ts[1] + 0.6, (e) => {
      gs.forEach((d, k) => { this.dashSet(d, cuts[k][0], cuts[k][1], 0.13, gy + 0.05); d.material.uniforms.uP.value = smooth(0, 0.12, e.t); d.material.uniforms.uSolid.value = cutAt[k] >= 0 ? 1 : 0; d.material.uniforms.uA.value = 0.8 * (cutAt[k] >= 0 ? 1 - clamp01((e.t - cutAt[k] - 0.1) / 0.3) : 0.8); });
      sl.forEach((s, k) => { if (cutAt[k] < 0) { s.material.uniforms.uA.value = 0; return; } const q = (e.t - cutAt[k]) / 0.3; s.position.copy(cuts[k][0]).add(cuts[k][1]).multiplyScalar(0.5).setY(gy + 0.9); _d.subVectors(cuts[k][1], cuts[k][0]).setY(0).normalize(); this._alignLine(s, _d); s.scale.set(cuts[k][0].distanceTo(cuts[k][1]) * (0.7 + 0.35 * easeOut(q * 2)), 0.32 * (1 - 0.5 * q), 1); s.material.uniforms.uA.value = I * 1.3 * (1 - smooth(0.25, 1, q)); });
    });
    const gs = [this.dash(e, C.pink, C.pinkB, 3), this.dash(e, C.plat, C.platB, 3)], sl = [this.spr(e, 2, C.pink, C.pinkB, 7), this.spr(e, 2, C.white, C.platB, 7)];
    // fx2: 화면에서 X로 읽히게 — 교차 중심에 카메라 쪽으로 선 두 획(화면 기준 ±42°, 바닥 선과 별개), 바닥 교차 가위 마법진(= 중심 판정 반경), 두 번째 획 = X 완성 섬광
    const xs = this.parts ? [0, 1].map(k => { const m = this.spr(e, 2, k ? C.white : 0xffd0ec, k ? C.platB : C.pinkB, 8); const g = this.spr(e, 2, C.gold, C.goldB, 7); return { m, g }; }) : [];
    const sg = this.parts ? this.sigil(c, Math.max(0.6, o.cr || 0.9), 'plat', { pat: 1, grow: ts[0], life: ts[1] + 0.8, a: 0.85, spin: 0.9 }) : null; void sg;
    const camUp = new THREE.Vector3();
    const xe = this.parts ? this._fx('crossx', ts[1] + 0.7, (x) => {
      camUp.set(0, 1, 0).applyQuaternion(this.camQ); const at = _c.copy(c).setY(gy + 1.0).addScaledVector(this.toCam, 0.6);
      xs.forEach((q, k) => { if (cutAt[k] < 0) { q.m.material.uniforms.uA.value = 0; q.g.material.uniforms.uA.value = 0; return; }
        const t = (e.t - cutAt[k]) / 0.42, ang = (k ? -1 : 1) * 0.733, d = _d.copy(this.camR).multiplyScalar(Math.cos(ang)).addScaledVector(camUp, Math.sin(ang)), grow = easeOut(clamp01(t * 5));
        for (const [m, w, a] of [[q.m, 0.42, 1.5], [q.g, 0.9, 0.7]]) { m.position.copy(at).addScaledVector(d, (grow - 1) * 1.1 * (k ? -1 : 1)); this._alignLine(m, d); m.scale.set(3.0 * grow, w * (1 - 0.6 * t), 1); m.material.uniforms.uA.value = DSFX.intensity * a * (1 - smooth(0.3, 1, t)); } });
      if (e.dead) x.life = 0;
    }) : null; void xe;
    return this._h(e, { cut: (k, hits, centre) => {
      cutAt[k] = e.t;
      for (const h of hits || []) { this.flash(P3(h).setY((h.y || 0) + 0.85), 0.36, k ? C.white : C.pink, k ? C.platB : C.pinkB, 0.1, 0.8); this.pang(P3(h).setY((h.y || 0) + 0.85), k ? 'plat' : 'silk', { r: 0.45, n: 6, stars: 1, noRing2: true, quiet: k === 0 }); }
      const at = c.clone().setY(gy + 1.0); if (this.parts) for (let i = 0; i < this._nk(6); i++) { const a = rnd(0, 6.283); this.spark(at, { v: new THREE.Vector3(Math.cos(a) * 2, rnd(0.5, 2), Math.sin(a) * 2), g: -2, drag: 2, life: 0.45, s0: 0.2, s1: 0.03, col: k ? C.plat : C.pink, k: 1 }); }
      if (k === 1 && centre && centre.length) { this.flash(at, 0.8, C.white, C.gold, 0.12, 1.0); this.threadBurst(at, 8, 0.45); this.scraps(at, 6, gy); this.pang(at, 'gold', { r: Math.min(0.9, o.cr || 0.9), n: 14, ground: gy }); this.beam(c, Math.min(0.7, o.cr || 0.9), 3.0, 'silk', { life: 0.5, a: 0.8 }); this.petals(at, 5, { r: 0.3 }); }
    } });
  }

  // ================================================================== A5 그랑 패턴 피날레 (시전 동안 예고 -> 일제 절단)
  finalePre(pc, o = {}) {
    if (!this._ok() || !this.geo.ds_blade) return null;
    const C = DSFX.col, I = DSFX.intensity, f = D3(o.f), oo = P3({ x: o.o.x, y: this.gy(o.o), z: o.o.z }), r = o.r || 6.5, ang = (o.ang || 110) * Math.PI / 180, nL = o.lines || 7, dur = Math.max(0.01, o.dur || 0);
    const yaw0 = Math.atan2(f.z, f.x), dirAt = (t) => new THREE.Vector3(Math.cos(yaw0 + t), 0, Math.sin(yaw0 + t));
    let cutAt = dur > 0.02 ? -1 : 0, hitsN = 0;
    const e = this._fx('finale', dur + 1.4, (e) => {
      const prep = clamp01(e.t / Math.max(0.05, dur * 0.95)), out = cutAt >= 0 ? clamp01((e.t - cutAt - 0.15) / 0.5) : 0;
      // 도면: 캐릭터 위에서 위로 펼쳐짐
      sh.position.copy(P3(pc.pos)).setY((pc.pos.y || 0) + 2.55); sh.quaternion.copy(this.camQ); sh.scale.set(1.5, 1.05, 1);
      sh.material.uniforms.uP.value = easeOut(clamp01(e.t / 0.3)); sh.material.uniforms.uA.value = (cutAt >= 0 ? 1 - clamp01((e.t - cutAt) / 0.3) : 1) * 0.95;
      // 실제 범위(부채꼴) 테두리 + 안쪽 재단선이 차례로
      edge.forEach((d, k) => { const t0 = k / edge.length; d.material.uniforms.uP.value = clamp01((prep - t0 * 0.3) / 0.25) || (cutAt >= 0 ? 1 : 0); d.material.uniforms.uA.value = 0.75 * (1 - out); d.material.uniforms.uSolid.value = cutAt >= 0 ? 1 : 0; });
      lines.forEach((d, k) => { const t0 = 0.15 + 0.75 * k / nL; d.material.uniforms.uP.value = cutAt >= 0 ? 1 : clamp01((prep - t0) / 0.15); d.material.uniforms.uA.value = (cutAt >= 0 ? 1.0 + 0.6 * (1 - clamp01((e.t - cutAt) / 0.15)) : 0.85) * (1 - out); d.material.uniforms.uSolid.value = cutAt >= 0 ? 1 : 0; });
      // 거대한 가위: 앞쪽 공중에서 벌어진 채 내려오다가 자르는 순간 닫힘
      const close = cutAt >= 0 ? clamp01((e.t - cutAt) / 0.08) : 0, gone = cutAt >= 0 ? clamp01((e.t - cutAt - 0.06) / 0.18) : 0;
      // fx2: 거대 가위는 시전자 머리 위·약간 뒤(앞의 몬스터를 가리지 않게), 반투명, 자른 뒤 0.25초 안에 위로 사라짐
      const pp = P3(pc.pos); sc.position.copy(pp).addScaledVector(f, -0.25).setY((pc.pos.y || 0) + DSFX.finale.scH - 0.35 * prep - 0.25 * close + gone * 0.8); this.faceAlong(sc, f);
      this.scissorsPose(sc, cutAt >= 0 ? 1 - close : 0.3 + 0.7 * prep, DSFX.finale.scA * smooth(0, 0.2, e.t) * (1 - gone), close ? 0.7 * (1 - gone) : 0.2 * prep);
      if (sw) { const u = sw.material.uniforms; u.uP.value = cutAt >= 0 ? easeOut(clamp01((e.t - cutAt) / 0.22)) : 0; u.uT.value = e.t; u.uA.value = cutAt >= 0 ? 1 - clamp01((e.t - cutAt - 0.3) / 0.45) : 0; }
      if (this.parts && cutAt < 0 && e.t - lastSp > 0.05) { lastSp = e.t; const a = rnd(0, 6.283), rr = rnd(0.8, 1.5); this.spark(pp.clone().add(new THREE.Vector3(Math.cos(a) * rr, 0.1, Math.sin(a) * rr)), { to: null, v: new THREE.Vector3(-Math.cos(a) * 0.8, rnd(1.2, 2.4), -Math.sin(a) * 0.8), life: 0.6, s0: 0.22, s1: 0.04, col: rnd(0, 1) > 0.5 ? C.gold : C.pink, k: 1, a: 0.9 }); }
    });
    let lastSp = -1;
    const sh = this.sheet(e, 6), sc = this.scissors(e, DSFX.finale.size);
    // fx2: 시전자 발밑 교차 가위 마법진(시전 0.8초 동안 그려짐) + 자르는 순간 부채꼴(= 실제 범위)을 쓸고 지나가는 비단 물결
    const sgl = this.parts ? this.sigil(P3(pc.pos), 1.15, 'silk', { pat: 1, grow: Math.max(0.2, dur * 0.8), life: dur + 1.2, a: 0.9, spin: 1.2, follow: () => P3(pc.pos), snd: true }) : null; void sgl;
    let sw = null;
    if (this.parts) { const p = this.pool.dssweep || (this.pool.dssweep = []); sw = p.pop();
      if (!sw) { sw = new THREE.Mesh(this.fan(o.ang || 110), new THREE.ShaderMaterial({ uniforms: U({ uW: new THREE.Color(), uB: new THREE.Color(), uG: new THREE.Color(), uA: 0, uP: 0, uT: 0 }), vertexShader: FLAT_VS, fragmentShader: SWEEP_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide })); sw.frustumCulled = false; sw.userData.kind = 'dssweep'; }
      sw.geometry = this.fan(o.ang || 110); sw.visible = true; sw.renderOrder = 3; sw.position.copy(oo).setY(oo.y + 0.07); sw.rotation.set(0, -yaw0, 0); sw.scale.set(r, 1, r);
      const u = sw.material.uniforms; u.uW.value.setHex(0xffd8ee); u.uB.value.setHex(0xd04890); u.uG.value.setHex(C.gold); u.uA.value = 0; u.uP.value = 0; e.items.push(sw); e.g.add(sw); }
    const edge = [], lines = [];
    const arcN = lite() ? 8 : 12;
    for (let k = 0; k < arcN; k++) { const d = this.dash(e, C.gold, C.goldB, 3); const a0 = -ang / 2 + ang * k / arcN, a1 = -ang / 2 + ang * (k + 1) / arcN; this.dashSet(d, oo.clone().addScaledVector(dirAt(a0), r), oo.clone().addScaledVector(dirAt(a1), r), 0.08, oo.y + 0.05); edge.push(d); }
    for (const s of [-1, 1]) { const d = this.dash(e, C.gold, C.goldB, 3); this.dashSet(d, oo.clone().addScaledVector(dirAt(s * ang / 2), 0.6), oo.clone().addScaledVector(dirAt(s * ang / 2), r), 0.08, oo.y + 0.05); edge.push(d); }
    for (let k = 0; k < nL; k++) {   // 안쪽 재단선: 가로 현(chord)이 앞으로 나아가며 차례로
      const rr = r * (0.25 + 0.7 * (k + 0.5) / nL), d = this.dash(e, k % 2 ? C.pink : C.gold, C.goldB, 3), wob = (k % 2 ? 0.12 : -0.12);
      this.dashSet(d, oo.clone().addScaledVector(dirAt(-ang / 2 * 0.92 + wob), rr), oo.clone().addScaledVector(dirAt(ang / 2 * 0.92 + wob), rr), 0.06, oo.y + 0.05); lines.push(d);
    }
    return this._h(e, { cut: (hits) => {
      cutAt = e.t; hitsN = (hits || []).length; e.life = e.t + 0.8;
      for (const h of hits || []) { const at = P3(h).setY((h.y || 0) + 0.8); this.flash(at, 0.5 + 0.12 * (h.n || 0), C.white, h.n ? C.gold : C.pinkB, 0.12, 0.9); if (h.n) this.threadBurst(at, 3 + 2 * h.n); }
      // 실크 조각이 재단선마다 솟음
      lines.forEach((d, k) => { if (lite() && k % 2) return; this.scraps(d.position.clone(), 3, oo.y, { up: [2.2, 3.6], speed: [0.4, 1.0], size: [0.1, 0.18], life: 0.8 }); if (this.parts) this.petals(d.position.clone().setY(oo.y + 0.3), 2, { r: 0.5, up: 1.4 }); });
      this.ring(oo.clone().addScaledVector(f, r * 0.5), r * 0.5, C.gold, C.goldB, 0.35, 0.7, 0.8);
      // fx2: 맞은 대상마다 팡 + 빛기둥(소비한 시침이 있으면 금빛), 부채꼴 안 반짝이 비
      for (const h of hits || []) { const at = P3(h); this.pang(at.clone().setY(at.y + 0.9), h.n ? 'gold' : 'silk', { r: 0.55 + 0.1 * (h.n || 0), n: 8, ground: at.y, quiet: true }); this.beam(at, 0.5, 3.0, h.n ? 'gold' : 'silk', { life: 0.6 }); }
      if (this.parts) { this._snd('ds_sparkle'); for (let i = 0; i < this._nk(26); i++) { const a = yaw0 + rnd(-ang / 2, ang / 2) * 0.95, rr = rnd(0.6, r * 0.95); this.spark(oo.clone().add(new THREE.Vector3(Math.cos(a) * rr, rnd(0.2, 1.4), Math.sin(a) * rr)), { v: new THREE.Vector3(0, rnd(0.6, 1.6), 0), life: rnd(0.5, 0.9), s0: rnd(0.2, 0.32), s1: 0.03, col: i % 3 ? C.pink : C.gold, k: i % 2 ? 1 : 3, a: 1, tw: 18 }); } }
    } });
  }

  // ================================================================== B1 실크 로드
  road(pc, o = {}) {
    if (!this._ok()) return null;
    const C = DSFX.col, I = DSFX.intensity, f = D3(o.f), from = P3({ x: o.from.x, y: this.gy(o.from), z: o.from.z }), len = Math.max(0.05, o.len || 5), w = o.w || 1.4, sp = o.speed || 14, dashT = len / sp;
    const side = new THREE.Vector3(-f.z, 0, f.x), hist = [];
    const NV = lite() ? 8 : 12, TR = lite() ? 10 : 16;
    const e = this._fx('road', dashT + 1.0, (e) => {
      const unroll = clamp01(e.t / (dashT * 0.8 + 0.02)), out = clamp01((e.t - dashT - 0.25) / 0.45);
      this.gridSet(rd, (i, j, p) => { const s = (j / (NV - 1)) * len * unroll, x = (i - 0.5) * w * (0.85 + 0.1 * Math.sin(j * 1.3 + e.t * 6)); p.copy(from).addScaledVector(f, s).addScaledVector(side, x); p.y = this.gy({ x: p.x, z: -p.z }) + 0.04 + 0.02 * Math.sin(j + e.t * 8); });
      rd.material.uniforms.uA.value = 0.5 * (1 - out);
      // 뒤따르는 리본: 시전자 허리 높이를 따라오다가 끝나면 나선으로 풀리며 사라짐
      if (e.t <= dashT + 0.05) { hist.unshift(P3(pc.pos).setY((pc.pos.y || 0) + 0.85)); if (hist.length > TR) hist.length = TR;
        // fx2: 달리는 발밑에서 꽃잎·반짝이가 깔리고 길 가장자리 금실이 반짝임
        if (this.parts && e.t - lastP > 0.035) { lastP = e.t; const q = P3(pc.pos); this.petals(q.clone().setY(q.y + 0.3), 1, { r: 0.3, up: 0.5, speed: 0.5, floor: q.y + 0.03, life: 1.4 });
          for (const sg of [-1, 1]) this.spark(q.clone().addScaledVector(side, sg * w * 0.48).setY(q.y + 0.08), { v: new THREE.Vector3(0, rnd(0.3, 0.8), 0), life: 0.6, s0: 0.2, s1: 0.04, col: sg > 0 ? DSFX.col.gold : DSFX.col.pink, k: 1, a: 0.9, tw: 20 }); } }
      if (hist.length > 1) {
        const un = clamp01((e.t - dashT) / 0.6), pts = hist.map((p, k) => { const q = p.clone(); if (un > 0) { const a = k * 0.9 + un * 6; q.addScaledVector(side, Math.cos(a) * 0.35 * un).setY(q.y + Math.sin(a) * 0.35 * un + un * 0.6 * k / TR); } return q; });
        this.ribbonSet(rb, pts, 0.32, (j) => _d.copy(UP).applyAxisAngle(f, j * 0.25 + e.t * 2));
        rb.material.uniforms.uA.value = 0.8 * (1 - un);
      }
    });
    const rd = this.grid(e, 2, NV, C.lilac, C.ivory, C.gold, 2), rb = this.grid(e, 2, TR, C.pink, C.lilac, C.gold, 5); let lastP = -1;
    this.sigil(from, Math.min(1.0, w * 0.7), 'lilac', { pat: 0, grow: 0.15, life: dashT + 0.7, a: 0.8, spin: 1.4 });
    return this._h(e, { hit: (p) => { const at = P3(p).setY((p.y || 0) + 0.8); this.flash(at, 0.38, C.white, C.pinkB, 0.1, 0.8); this.threadBurst(at, 3, 0.3); this.pang(at, 'silk', { r: 0.5, n: 7, ground: P3(p).y, stars: 1 }); } });
  }

  // ================================================================== B2 리본 피루엣
  pirouette(pc, o = {}) {
    if (!this._ok()) return null;
    const C = DSFX.col, I = DSFX.intensity, r = o.r || 2.8, start = o.start || 0.1, knotT = o.knot || 1.4, NV = lite() ? 12 : 20;
    let pulse = 0, knotAt = -1;
    const e = this._fx('pirouette', knotT + 0.55, (e, dt) => {
      const c = P3(pc.pos), open = easeOut(e.t / 0.2), knot = knotAt >= 0 ? easeOut((e.t - knotAt) / 0.18) : 0, out = knotAt >= 0 ? clamp01((e.t - knotAt - 0.2) / 0.3) : 0;
      pulse = Math.max(0, pulse - dt * 5);
      rbs.forEach((m, k) => {
        const tilt = k ? 0.32 : -0.22, rot = e.t * (k ? -7.5 : 9) + k * Math.PI, rad = r * (0.62 + 0.3 * k) * open * (1 - 0.75 * knot), h = 0.55 + 0.45 * k, span = Math.PI * 1.35;
        const pts = []; for (let j = 0; j < NV; j++) { const a = rot - span * j / (NV - 1); pts.push(new THREE.Vector3(c.x + Math.cos(a) * rad, c.y + h + Math.sin(a * 1 + k) * tilt * rad * 0.35 + 0.12 * Math.sin(e.t * 9 + j * 0.6), c.z + Math.sin(a) * rad)); }
        this.ribbonSet(m, pts, 0.42 - 0.08 * k, (j) => _d.set(0, 1, 0).applyAxisAngle(_b.set(Math.sin(rot - span * j / (NV - 1)), 0, -Math.cos(rot - span * j / (NV - 1))), 0.35 * Math.sin(j * 0.5 + e.t * 4)));
        m.material.uniforms.uA.value = 0.85 * smooth(0, 0.08, e.t) * (1 - out); m.material.uniforms.uGlow.value = pulse * 0.4;
      });
      this._flat(ring, r, 0.05); ring.position.copy(c); ring.material.uniforms.uA.value = I * 0.3 * smooth(0, 0.15, e.t) * (1 - out);
      bw.position.copy(c).setY(c.y + 1.1).addScaledVector(this.toCam, 0.5); bw.quaternion.copy(this.camQ); bw.scale.setScalar(0.32 * knot * (1 + 0.25 * Math.sin(Math.PI * clamp01((e.t - knotAt) / 0.25)))); bw.material.uniforms.uA.value = knot * (1 - out);
    });
    const rbs = [this.grid(e, 2, NV, C.pink, C.rose, C.gold, 5), this.grid(e, 2, NV, C.lilac, C.pink, C.gold, 5)];
    const ring = this.spr(e, 1, C.pink, C.pinkB, 3); ring.material.uniforms.uP.value = 0.2;
    const bw = this.solid(e, this.geo.ds_bow || this.quad, { rim: 0xffd0ea, spec: 0.6 }); bw.renderOrder = 7;
    // fx2: 발밑 장미창 마법진(= 실제 반경 r, 따라다님) + 리본 끝마다 꽃잎·하트가 원을 그리며 흩날림
    this.sigil(P3(pc.pos), r, 'rose', { pat: 0, grow: 0.25, life: knotT + 0.6, a: 0.75, spin: -2.2, follow: () => P3(pc.pos) });
    const tips = (k) => { const c = P3(pc.pos); for (const m of rbs) { const P = m.geometry.attributes.position; const j = 0, x = (P.getX(j * 2) + P.getX(j * 2 + 1)) / 2, y = (P.getY(j * 2) + P.getY(j * 2 + 1)) / 2, z = (P.getZ(j * 2) + P.getZ(j * 2 + 1)) / 2;
      const at = new THREE.Vector3(x, y, z); this.petals(at, k, { r: 0.1, up: 0.5, speed: 0.8, floor: c.y + 0.03 }); this.spark(at, { v: new THREE.Vector3(0, 0.5, 0), life: 0.45, s0: 0.24, s1: 0.04, col: DSFX.col.pink, k: 3, a: 1 }); } };
    return this._h(e, {
      lash: (i, hits) => { pulse = 1; tips(1); for (const h of hits || []) { this.flash(P3(h).setY((h.y || 0) + 0.8), 0.3, C.pink, C.pinkB, 0.1, 0.6); this.spark(P3(h).setY((h.y || 0) + 0.8), { life: 0.3, s0: 0.4, s1: 0.1, col: C.pink, k: 1, a: 1 }); } },
      knot: (hits) => { knotAt = e.t; const c = P3(pc.pos); this.ring(c, r, C.pink, C.pinkB, 0.3, 0.9, 1.0); this.sparkles(c.clone().setY(c.y + 1.1), 5, 0.4, C.pink); for (const h of hits || []) this.flash(P3(h).setY((h.y || 0) + 0.8), 0.42, C.white, C.pinkB, 0.12, 0.9);
        this.pang(c.clone().setY(c.y + 1.1), 'rose', { r: 0.9, n: 14, ground: c.y, stars: lite() ? 1 : 4 }); this.beam(c, 0.8, 3.2, 'rose', { life: 0.6 }); this.petals(c.clone().setY(c.y + 1.1), 10, { r: 0.5, speed: 1.8, up: 1.2 }); },
    });
  }

  // ================================================================== B3 미러 피팅 (마네킹)
  mannequin(pos, o = {}) {
    if (!this._ok() || !this.geo.ds_mq_torso) return null;
    const C = DSFX.col, I = DSFX.intensity, at = P3(pos), f = D3(o.f || { x: 0, z: 1 }), NT = lite() ? 3 : 5;
    let cloakAt = -1, endAt = -1, hp = 1, hitPulse = 0;
    const e = this._fx('mannequin', 1e9, (e, dt) => {
      hitPulse = Math.max(0, hitPulse - dt * 4);
      // 실이 바닥에서 나선으로 감겨 올라가며 받침 -> 몸통 -> 머리 순서로 조립(0~0.5초), 0.5초에 리본 망토가 내려앉음
      const a1 = easeOut(e.t / 0.18), a2 = easeOut((e.t - 0.14) / 0.18), a3 = easeOut((e.t - 0.28) / 0.14), cape = easeOut((e.t - 0.45) / 0.25);
      const out = endAt >= 0 ? clamp01((e.t - endAt) / 0.4) : 0, yaw = Math.atan2(f.x, f.z);
      if (tm) { const k = easeOut(e.t / 0.42), sq = 1 + 0.12 * Math.sin(Math.PI * clamp01((e.t - 0.38) / 0.22)) * (e.t > 0.38 ? 1 : 0);   // fx2: Tripo 마네킹 — 아래에서 감겨 올라오고 통 튀며 완성
        tm.position.copy(at); tm.rotation.set(0, yaw + Math.PI, 0); tm.scale.set(DSFX.tripo.mannequin * sq, DSFX.tripo.mannequin * Math.max(0.01, k) / sq, DSFX.tripo.mannequin * sq);
        tm.material.uniforms.uA.value = Math.min(1, k * 1.5) * (1 - out); tm.material.uniforms.uGlow.value = 0.22 * (1 - smooth(0.3, 0.7, e.t)) + hitPulse * 0.25; }
      else for (const [m, k] of [[st, a1], [to, a2], [hd, a3]]) { m.position.copy(at); m.rotation.set(0, yaw, 0); m.scale.set(1, Math.max(0.01, k), 1); m.material.uniforms.uA.value = Math.min(1, k * 1.5) * (1 - out); m.material.uniforms.uGlow.value = 0.25 * (1 - smooth(0.3, 0.7, e.t)) + hitPulse * 0.3; }
      if (sg) { const u = sg.material.uniforms; sg.position.set(at.x, at.y + 0.06, at.z); sg.scale.setScalar(0.85); u.uP.value = easeOut(e.t / 0.4); u.uT.value = e.t; u.uA.value = (0.7 - 0.3 * smooth(0.6, 1.2, e.t) + 0.3 * hitPulse) * (1 - out) * (1 - (cloakAt >= 0 ? clamp01((e.t - cloakAt) / 0.3) : 0)); }
      const cl = cloakAt >= 0 ? clamp01((e.t - cloakAt) / 0.35) : 0;
      const cs = tm ? 0.55 : 1;   // Tripo 마네킹은 드레스를 이미 입고 있음 — 어깨에 짧은 리본 망토만
      cp.position.copy(at).setY(at.y + (tm ? 1.42 : 1.48) + (1 - cape) * 0.8 + cl * 0.6); cp.rotation.set(0.06 * Math.sin(e.t * 2.2), yaw + cl * 3, 0.05 * Math.sin(e.t * 1.7)); cp.scale.set(cs * (1 + cl * 2.2), cs * (1.0 - cl * 0.4), cs * (1 + cl * 2.2));
      cp.material.uniforms.uA.value = (tm ? (cl > 0 ? 0.8 * (1 - cl) : 0) : cape * (1 - cl)) * (1 - out);   // Tripo 마네킹은 드레스가 있어 망토는 풀릴 때만 bw.position.copy(at).setY(cp.position.y + 0.02).addScaledVector(f, 0.12); bw.quaternion.copy(this.camQ); bw.scale.setScalar((tm ? 0.12 : 0.16) * cape * (1 - cl)); bw.material.uniforms.uA.value = cape * (1 - cl) * (1 - out);
      // 조립 실(나선) — 다 감기면 사라짐; 보호 체력이 줄면 금실 몇 가닥이 풀려 늘어짐
      ths.forEach((m, k) => { const pts = []; for (let j = 0; j < 14; j++) { const v = j / 13, a = v * 9 + k * 2.1 + e.t * 3; pts.push(new THREE.Vector3(at.x + Math.cos(a) * 0.32 * (1 - v * 0.5), at.y + v * 1.7 * clamp01(e.t / 0.4), at.z + Math.sin(a) * 0.32 * (1 - v * 0.5))); }
        this._ribbonSet(m, pts, 0.02); m.material.uniforms.uA.value = I * 0.9 * (1 - smooth(0.35, 0.6, e.t)); });
      if (endAt >= 0 && out >= 1) e.life = 0;
    });
    const tm = this.tmesh(e, 'mannequin', { order: 4 });
    const st = tm ? null : this.solid(e, this.geo.ds_mq_stand, { spec: 0.4 }), to = tm ? null : this.solid(e, this.geo.ds_mq_torso, { spec: 0.3, rim: 0xffe8f4 }), hd = tm ? null : this.solid(e, this.geo.ds_mq_head, { spec: 0.3 });
    const cp = this.solid(e, this.geo.ds_cape, { spec: 0.4, rim: 0xffd0ec }), bw = this.solid(e, this.geo.ds_bow, { spec: 0.5 });
    for (const m of [st, to, hd, cp, bw]) if (m) m.renderOrder = 4;
    const sg = this.parts ? this._sig(e, 3, 'lilac', 1) : null; if (sg) sg.material.uniforms.uS.value = 0.5;
    if (this.parts) { this._snd('ds_mannequin'); this.petals(at.clone().setY(at.y + 0.4), 5, { r: 0.4, up: 1.2 }); for (let i = 0; i < this._nk(10); i++) { const a = i / 10 * 6.283; this.spark(at.clone().add(new THREE.Vector3(Math.cos(a) * 0.5, 0.1, Math.sin(a) * 0.5)), { v: new THREE.Vector3(-Math.cos(a) * 0.4, rnd(1.2, 2.4), -Math.sin(a) * 0.4), life: 0.7, s0: 0.22, s1: 0.04, col: i % 2 ? DSFX.col.gold : DSFX.col.pink, k: 1 }); } }
    const ths = []; for (let k = 0; k < NT; k++) { const m = this._ribbon(e, 14); m.material.uniforms.uW.value.setHex(C.gold); m.material.uniforms.uB.value.setHex(C.goldB); ths.push(m); }
    this.flash(at.clone().setY(at.y + 1.0), 0.5, C.pink, C.pinkB, 0.15, 0.6);
    return this._h(e, {
      hp: (k) => { if (k < hp - 0.01) hitPulse = 1; hp = k; },
      cloak: (hits) => { cloakAt = e.t; this.ring(at, 2.6, C.pink, C.pinkB, 0.35, 0.9, 0.3); this.scraps(at.clone().setY(at.y + 1.3), 8, at.y, { speed: [1.2, 2.6] }); for (const h of hits || []) { this.flash(P3(h).setY((h.y || 0) + 0.7), 0.36, C.lilac, C.lilacB, 0.12, 0.7); this.pang(P3(h).setY((h.y || 0) + 0.8), 'lilac', { r: 0.45, n: 6, stars: 1, noRing2: true, quiet: true }); }
        this.pang(at.clone().setY(at.y + 1.3), 'lilac', { r: 1.0, n: 14, ground: at.y }); this.sigil(at, 2.6, 'lilac', { pat: 3, grow: 0.15, life: 0.8, a: 0.7, spin: 2 }); this.petals(at.clone().setY(at.y + 1.3), 12, { r: 0.3, speed: 2.4, up: 1.0 }); },
      unravel: () => { if (endAt < 0) endAt = Math.max(e.t, cloakAt >= 0 ? cloakAt + 0.25 : e.t); },
    });
  }

  // ================================================================== B4 뮤즈의 초대
  muse(t, o = {}) {
    if (!this._ok() || !this.geo.ds_pin) return null;
    const C = DSFX.col, I = DSFX.intensity; let endAt = -1;
    const e = this._fx('muse', 1e9, (e) => {
      const at = P3(t.pos), R = (t.radius || 0.5) + 0.35, inn = easeOut(e.t / 0.25), out = endAt >= 0 ? clamp01((e.t - endAt) / 0.3) : 0;
      // 얇은 조명: 위에서 대상 발치까지 세로 판 둘(엇갈림) — 가산, 낮은 밝기
      if (bA) {   // fx2: 알파 혼합 색 몸통(밝은 바닥에서도 보이는 따뜻한 분홍·금 조명) + 가산 안쪽 빛 — 대상 반지름 안팎, 위로 흐름
        for (const [m, rr, a, fl] of [[bA, R * 0.95, DSFX.muse.beamA, 1], [bC, R * 0.62, DSFX.muse.coreA, 0]]) { m.position.copy(at); if (fl) m.position.y += DSFX.muse.h; m.scale.set(rr * inn, fl ? -DSFX.muse.h : DSFX.muse.h, rr * inn);   /* 색 몸통은 뒤집어 위(조명 쪽)가 진하게 — 아래는 대상이 가림 */ m.material.uniforms.uT.value = e.t; m.material.uniforms.uA.value = I * a * inn * (1 - out) * (0.85 + 0.15 * Math.sin(e.t * 3)); }
        if (e.t - lastG > 0.07 && out < 1) { lastG = e.t; const a = rnd(0, 6.283), rr = rnd(0, R * 0.8), p0 = at.clone().add(new THREE.Vector3(Math.cos(a) * rr, rnd(2.2, 3.2), Math.sin(a) * rr)), v = new THREE.Vector3(0, -rnd(0.8, 1.3), 0);   // 위에서 내려오는 반짝이 + 작은 보석·별(불투명 — 밝은 바닥에서도 보임)
          this.spark(p0, { v, life: 1.4, s0: 0.2, s1: 0.06, col: rnd(0, 1) > 0.4 ? C.gold : C.pink, k: 1, a: 0.9, tw: 14 });
          if (lastG * 10 % 2 < 1) this.bit(rnd(0, 1) > 0.5 ? 'gem' : 'star', p0, { v: v.clone(), life: 1.6, s0: 0.05, s1: 0.04, col: rnd(0, 1) > 0.5 ? 0xffd0e8 : 0xfff0b0, wy: rnd(-4, 4), glow: 0.5, floor: at.y + 0.04, outK: 0.75 }); }
        if (sgM) { const u = sgM.material.uniforms; sgM.position.set(at.x, at.y + 0.06, at.z); sgM.scale.setScalar(R + 0.2); u.uP.value = inn; u.uT.value = e.t; u.uA.value = 0.85 * inn * (1 - out); }
      } else cones.forEach((m, k) => { m.position.copy(at).setY(at.y + 1.9); m.rotation.set(0, k * Math.PI / 2 + e.t * 0.3, 0); m.scale.set(R * 1.5 * inn, 4.2, 1); m.material.uniforms.uA.value = I * 0.32 * inn * (1 - out); });
      this._flat(st, R, 0.05); st.position.copy(at); st.material.uniforms.uA.value = I * 0.8 * inn * (1 - out);
      this._flat(st2, R * 0.65, 0.055); st2.position.copy(at); st2.rotation.z = e.t * 0.8; st2.material.uniforms.uA.value = I * 0.5 * inn * (1 - out);
      pins.forEach((p, k) => { const sg = k ? 1 : -1; p.position.copy(at).add(_a.copy(this.camR).multiplyScalar(sg * (R + 0.15))).setY(at.y); p.rotation.set(0, e.t, 0); p.scale.setScalar(1.0 * inn); p.material.uniforms.uA.value = inn * (1 - out); p.material.uniforms.uGlow.value = 0.15 + 0.1 * Math.sin(e.t * 4 + k); });
      brs.forEach((b, k) => { const a = e.t * 1.6 + k * Math.PI; b.position.set(at.x + Math.cos(a) * (R + 0.3), at.y + 0.9 + 0.12 * Math.sin(e.t * 3 + k), at.z + Math.sin(a) * (R + 0.3)); b.quaternion.copy(this.camQ); b.rotateY(-Math.PI / 2); b.scale.setScalar(DSFX.tripo.brooch * inn); /* Tripo 브로치 앞면 = +X */ b.position.y -= DSFX.tripo.brooch * 0.5 * inn; b.material.uniforms.uA.value = inn * (1 - out); b.material.uniforms.uGlow.value = 0.12 + 0.12 * Math.sin(e.t * 5 + k); });
      if (endAt >= 0 && out >= 1) e.life = 0;
      if (t.dead || t.removed) { if (endAt < 0) endAt = e.t; }
    });
    const bA = this.parts ? this._beamM(e, 'rose', 1, 4) : null, bC = this.parts ? this._beamM(e, 'gold', 0, 6) : null, sgM = this.parts ? this._sig(e, 2, 'gold', 1) : null; let lastG = -1;
    const cones = bA ? [] : [0, 1].map(() => this.puff(e, 0xfffaf0, 0xffe6a0, 3));   // (fx2 없을 때) 알파 혼합 원판을 세로로 늘인 얇은 빛기둥
    const brs = [0, 1].map(() => this.tmesh(e, 'brooch', { order: 6 })).filter(Boolean);
    if (sgM) sgM.material.uniforms.uS.value = 0.8;
    const st = this.spr(e, 1, C.gold, C.goldB, 3), st2 = this.spr(e, 3, C.gold, C.goldB, 3), pins = [this.solid(e, this.geo.ds_pin, { tint: 0xffd0ec, spec: 1 }), this.solid(e, this.geo.ds_pin, { tint: 0xb8f0ff, spec: 1 })];
    st.material.uniforms.uP.value = 0.6;
    this.sparkles(P3(t.pos).setY((t.pos.y || 0) + 1.2), 4, 0.4);
    return this._h(e, { end: () => { if (endAt < 0) endAt = e.t; } });
  }

  // ================================================================== B5 오트쿠튀르 컬렉션 (런웨이 + 의상이 다른 분신 셋)
  runwayPre(pc, o = {}) {
    if (!this._ok()) return null;
    const C = DSFX.col, I = DSFX.intensity, f = D3(o.f), oo = P3({ x: o.o.x, y: this.gy(o.o), z: o.o.z }), len = Math.max(1, o.len || 7), w = o.w || 1.8, dur = Math.max(0.05, o.dur || 0.4), side = new THREE.Vector3(-f.z, 0, f.x);
    let goAt = -1, plan = null, finAt = -1; const clones = [];
    const e = this._fx('runway', 1e9, (e) => {
      const un = easeOut(e.t / dur), out = finAt >= 0 ? clamp01((e.t - finAt - 0.3) / 0.5) : 0;
      this.gridSet(rw, (i, j, p) => { const s = (j / 9) * len * un, x = (i - 0.5) * w; p.copy(oo).addScaledVector(f, s).addScaledVector(side, x); p.y = oo.y + 0.04; });
      rw.material.uniforms.uA.value = 0.42 * (1 - out); rw.material.uniforms.uGlow.value = 0.08;
      edges.forEach((d, k) => { const sg = k ? 1 : -1; this.dashSet(d, oo.clone().addScaledVector(side, sg * w / 2), oo.clone().addScaledVector(side, sg * w / 2).addScaledVector(f, len), 0.06, oo.y + 0.06); d.material.uniforms.uP.value = un; d.material.uniforms.uA.value = 0.9 * (1 - out); d.material.uniforms.uSolid.value = 1; });
      if (goAt >= 0 && plan) {
        const tt = e.t - goAt;
        clones.forEach((cl, i) => {
          const t0 = 0.08 + i * plan.gap, u = clamp01((tt - t0) / plan.run), [a, b] = plan.paths[i], A = P3({ x: a.x, y: oo.y, z: a.z }), B = P3({ x: b.x, y: oo.y, z: b.z });
          const vis = tt >= t0 - 0.06 && u < 1 ? 1 : u >= 1 ? 1 - clamp01((tt - t0 - plan.run) / 0.2) : 0, p = new THREE.Vector3().lerpVectors(A, B, easeOut(u) * 0.15 + u * 0.85);
          _d.subVectors(B, A).normalize(); const yawD = Math.atan2(-_d.z, _d.x) - cl.phi0;
          // fx2: 미끄러지지 않게 — 걸음마다 통 튀고(bob) 좌우로 흔들리며(sway) 앞으로 기울고, 디딜 때마다 발밑 반짝 + 런웨이 끝에서 포즈(살짝 뒤로 젖힘)
          const G2 = DSFX.ghost2, ph = u * G2.steps * Math.PI, bob = u > 0 && u < 1 ? Math.abs(Math.sin(ph)) * G2.bob : 0, sway = u > 0 && u < 1 ? Math.sin(ph) * 0.09 : 0, lean = u < 1 ? 0.12 * smooth(0, 0.15, u) : -0.1 * (1 - clamp01((tt - t0 - plan.run) / 0.2));
          const step = Math.floor(u * G2.steps); if (u > 0 && u < 1 && step !== cl.step) { cl.step = step; if (this.parts) { this.spark(p.clone().setY(oo.y + 0.06), { life: 0.4, s0: 0.42, s1: 0.1, col: cl.col, k: 1, a: 1.1 }); this.spark(p.clone().setY(oo.y + 0.05), { life: 0.35, s0: 0.5, s1: 0.8, col: cl.col, k: 2, a: 0.6, rot: 0 }); this.petals(p.clone().setY(oo.y + 0.4), 1, { r: 0.1, up: 0.6, speed: 0.4, floor: oo.y + 0.03 }); } }
          if (cl.g) {   // 뼈 월드 행렬을 옮겨 돌림(붙은 SkinnedMesh는 메시 행렬이 아니라 뼈 위치로 그려짐): X = T(p) · R(yawD) · T(-base)
            _m2.makeTranslation(p.x, bob, p.z).multiply(_m3.makeRotationY(yawD)).multiply(_mx.makeRotationZ(-lean)).multiply(_m3.makeRotationX(sway)).multiply(_mx.makeTranslation(-cl.base.x, 0, -cl.base.z));
            cl.g.skeleton.bones.forEach((bn, k) => bn.matrixWorld.multiplyMatrices(_m2, cl.b0[k])); cl.g.material.opacity = G2.a * vis; }
          p.y += bob;
          cl.dress.forEach((m, k) => { m.position.copy(p).setY(oo.y + bob + cl.yAt[k]); m.rotation.set(0, Math.atan2(_d.x, _d.z) + cl.rot[k], 0); const sw = 0.12 * Math.sin(tt * 18 + k); m.rotation.x = cl.kind === 'cape' && k === 0 ? 0.35 * u + sw * 0.3 : sw * 0.15; m.material.uniforms.uA.value = vis; });
          cl.hist.unshift(p.clone().setY(oo.y + 1.0)); if (cl.hist.length > 12) cl.hist.length = 12;
          if (cl.hist.length > 1) { this.ribbonSet(cl.tr, cl.hist, 0.5, () => UP); cl.tr.material.uniforms.uA.value = 0.55 * vis; }
        });
      }
      if (finAt >= 0) {
        const k = clamp01((e.t - finAt) / 0.5), c = P3(pc.pos);
        fs.position.copy(c).setY(c.y + 2.6).addScaledVector(f, -0.2); this.faceAlong(fs, f);
        this.scissorsPose(fs, 1 - smooth(0.3, 0.45, k), smooth(0, 0.08, k) * (1 - smooth(0.6, 1, k)), 0.3);
        fr.forEach((m, j) => { const pts = []; const base = j * Math.PI * 2 / fr.length; for (let q = 0; q < 10; q++) { const v = q / 9, a = base + v * 1.6 + k * 2; pts.push(new THREE.Vector3(c.x + Math.cos(a) * (0.3 + v * 2.4 * easeOut(k)), c.y + 1.0 + v * 0.6 * Math.sin(k * Math.PI), c.z + Math.sin(a) * (0.3 + v * 2.4 * easeOut(k)))); }
          this.ribbonSet(m, pts, 0.36, () => UP); m.material.uniforms.uA.value = 0.8 * (1 - smooth(0.55, 1, k)); });
      }
      if (finAt >= 0 && e.t - finAt > 0.85) e.life = 0;
    });
    const rw = this.grid(e, 2, 10, C.ivory, C.pink, C.gold, 2), edges = [this.dash(e, C.gold, C.goldB, 3), this.dash(e, C.gold, C.goldB, 3)];
    const fs = this.scissors(e, 2.0), fr = [0, 1, 2, 3].slice(0, lite() ? 2 : 4).map((k) => this.grid(e, 2, 10, k % 2 ? C.lilac : C.pink, C.gold, C.gold, 6));
    this.scissorsPose(fs, 1, 0);
    // fx2: 런웨이 시작에 교차 가위 마법진, 양쪽 가장자리에 무대 전구(반짝이)가 앞으로 차례로 켜짐
    this.sigil(oo, Math.min(1.1, w * 0.6), 'gold', { pat: 1, grow: dur, life: dur + 2.6, a: 0.85, spin: 1.0 });
    if (this.parts) { const nb = Math.max(2, Math.floor(len / (lite() ? 1.2 : 0.7))); for (let i = 0; i < nb; i++) for (const sg of [-1, 1]) { const at = oo.clone().addScaledVector(f, (i + 0.5) / nb * len).addScaledVector(side, sg * (w / 2 + 0.05)).setY(oo.y + 0.1);
      this.spark(at, { t: -dur * i / nb, life: 2.4, inT: 0.05, s0: 0.24, s1: 0.2, col: (i + (sg > 0 ? 1 : 0)) % 2 ? C.gold : C.pink, k: 1, a: 0.85, tw: 9, outK: 0.85 }); } }
    return this._h(e, {
      go: (pl) => {
        goAt = e.t; plan = pl;
        // 분신 셋: 실제 몸의 지금 포즈 사본(반투명, 색 다름) + 서로 다른 의상 부착물(망토 / 치마 + 매듭 / 모자 + 긴 리본)
        const looks = [{ kind: 'cape', col: C.pink, dress: [['ds_cape', 1.25, 0, 0.8, 0xffffff], ['ds_crown', 1.62, 0, 1.0, 0xffffff]] },
                       { kind: 'skirt', col: C.lilac, dress: [['ds_skirt', 0.78, 0, 0.72, 0xffffff], ['ds_bow', 1.15, Math.PI, 0.2, 0xd8c0ff]] },
                       { kind: 'hat', col: C.gold, dress: [['ds_hat', 1.62, 0, 1.1, 0xffffff], ['ds_cape', 1.2, Math.PI, 0.55, 0xfff0c8]] }];
        for (let i = 0; i < Math.min(3, pl.paths.length); i++) {
          const L = looks[i], body = pc.body, cl = { kind: L.kind, hist: [], dress: [], yAt: [], rot: [], col: L.col, step: -1 };
          cl.g = body ? this.ghostOf(e, body, L.col) : null; cl.base = P3(pc.pos); cl.phi0 = Math.atan2(-f.z, f.x);
          if (cl.g) cl.b0 = cl.g.skeleton.bones.map(bn => bn.matrixWorld.clone());
          for (const [geo, y, r0, s, tint] of L.dress) { const m = this.solid(e, this.geo[geo] || this.quad, { tint, spec: 0.6, rim: 0xffe8f4 }); m.scale.setScalar(s); m.renderOrder = 5; cl.dress.push(m); cl.yAt.push(y); cl.rot.push(r0); }
          cl.tr = this.grid(e, 2, 12, L.col, C.ivory, C.gold, 3);
          clones.push(cl);
        }
      },
      hit: (i, p) => { const at = P3(p).setY((p.y || 0) + 0.85); this.flash(at, 0.42, C.white, [C.pinkB, C.lilacB, C.goldB][i % 3], 0.1, 0.85); this.threadBurst(at, 3, 0.3); this.pang(at, ['silk', 'lilac', 'gold'][i % 3], { r: 0.5, n: 7, ground: P3(p).y, stars: 1 }); },
      finale: (hits) => { finAt = e.t; const c = P3(plan ? { x: plan.mid.x, y: oo.y, z: plan.mid.z } : pc.pos); this.ring(c, plan ? plan.r : 3, C.gold, C.goldB, 0.4, 1.0, 0.5); this.sparkles(c.clone().setY(c.y + 0.8), 8, 1.2); for (const h of hits || []) this.flash(P3(h).setY((h.y || 0) + 0.85), 0.5, C.white, C.gold, 0.12, 0.9);
        // fx2: 피날레 = 무대 마법진(= 피날레 반경) + 빛기둥 + 팡 + 카메라 플래시(가장자리에서 별 섬광이 터짐)
        const R = plan ? plan.r : 3; this.sigil(c, R, 'gold', { pat: 0, grow: 0.15, life: 0.9, a: 0.8, spin: 2.4 }); this.pang(c.clone().setY(c.y + 1.0), 'gold', { r: 1.1, n: 18, ground: c.y, stars: lite() ? 2 : 5, quiet: true }); this.beam(c, Math.min(1.2, R * 0.4), 3.6, 'gold', { life: 0.7 });
        for (const h of hits || []) this.beam(P3(h), 0.45, 2.6, 'silk', { life: 0.5 });
        this.petals(c.clone().setY(c.y + 1.2), 14, { r: 0.6, speed: 2.2, up: 1.4 });
        if (this.parts) { this._snd('ds_flashbulb'); for (let i = 0; i < this._nk(7); i++) { const a = rnd(0, 6.283), rr = rnd(R * 0.5, R * 0.95); this.spark(c.clone().add(new THREE.Vector3(Math.cos(a) * rr, rnd(0.6, 1.8), Math.sin(a) * rr)), { t: -i * 0.07, inT: 0.01, life: 0.22, s0: rnd(0.8, 1.2), s1: 0.3, col: 0xfff6e8, k: 1, a: 1.2, outK: 0.2 }); } } },
    });
  }
  /** frozen translucent copy of the caster's skinned mesh (current pose) — js/hairfx.js ghost 와 같은 방법, 알파 혼합 */
  ghostOf(e, body, col) {
    const live = body && body.mesh; if (!live || !live.isSkinnedMesh || !body.bones) return null;
    body.root.updateMatrixWorld(true);
    const p = this.pool.dsghost || (this.pool.dsghost = []); let i = p.findIndex(g => g.geometry === live.geometry && g.skeleton.bones.length === body.bones.length), g = i >= 0 ? p.splice(i, 1)[0] : null;
    if (!g) {
      const bones = body.bones.map(() => { const b = new THREE.Bone(); b.matrixAutoUpdate = false; b.matrixWorldAutoUpdate = false; return b; });
      g = new THREE.SkinnedMesh(live.geometry, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      g.bind(new THREE.Skeleton(bones, live.skeleton.boneInverses), live.bindMatrix); g.frustumCulled = false; g.matrixAutoUpdate = false; g.userData.kind = 'dsghost';
    }
    g.skeleton.bones.forEach((b, k) => b.matrixWorld.copy(body.bones[k].matrixWorld));
    this.root.updateMatrixWorld(true); g.matrix.copy(this.root.matrixWorld).invert().multiply(live.matrixWorld); g.matrixWorldNeedsUpdate = true;
    g.material.color.setHex(col); g.material.opacity = 0; g.visible = true; g.renderOrder = 4;
    e.items.push(g); e.g.add(g); return g;
  }

  // ================================================================== C4 미라클 리스티치
  restitch(pc, o = {}) {
    if (!this._ok() || !this.geo.ds_needle) return null;
    const C = DSFX.col, I = DSFX.intensity, dur = o.dur || 8, init = Math.max(1, o.amount || pc.shield || 1), NU = lite() ? 10 : 14, NV = 6, NT = lite() ? 3 : 6;
    let last = pc.shield || 0, ripple = 0;
    const e = this._fx('restitch', dur + 0.3, (e, dt) => {
      const at = P3(pc.pos), sh = pc.shield || 0, frac = clamp01(sh / init), out = sh <= 0 && e.t > 0.4 ? 1 : clamp01((e.t - dur) / 0.3);
      if (sh < last - 0.5) ripple = 1; last = sh; ripple = Math.max(0, ripple - dt * 3);
      // 천 조각이 감싸고(0~0.15초) 바늘이 가장자리를 빙 둘러 꿰맴(0.1~0.45초) -> 실크 막
      const wrap = easeOut(e.t / 0.15), sew = clamp01((e.t - 0.1) / 0.35);
      this.gridSet(cl, (i, j, p) => { const a = (i / (NU - 1)) * Math.PI * 2, v = j / (NV - 1), rr = 0.62 * (1 + 0.3 * (1 - wrap)) * (1 + 0.05 * ripple * Math.sin(a * 6 + e.t * 30)), y = 0.1 + 1.45 * v;
        p.set(at.x + Math.cos(a) * rr * (1 - 0.25 * Math.pow(Math.abs(v - 0.5) * 2, 2)), at.y + y, at.z + Math.sin(a) * rr * (1 - 0.25 * Math.pow(Math.abs(v - 0.5) * 2, 2))); });
      cl.material.uniforms.uA.value = (0.26 + 0.12 * ripple) * (1 - out) * (e.t < 0.45 ? 0.6 + sew * 0.4 : 1); cl.material.uniforms.uGlow.value = 0.15 * ripple + 0.2 * (1 - smooth(0.4, 0.7, e.t)); cl.material.uniforms.uEdge.value = 0.5 + 0.5 * frac;
      const a = sew * Math.PI * 4, y = at.y + 0.3 + sew * 1.0; nd.position.set(at.x + Math.cos(a) * 0.68, y, at.z + Math.sin(a) * 0.68);
      _d.set(-Math.sin(a), 0.15, Math.cos(a)).normalize(); _mx.lookAt(new THREE.Vector3(), _d, UP); nd.quaternion.setFromRotationMatrix(_mx); nd.rotateY(-Math.PI / 2); nd.scale.setScalar(0.85); nd.material.uniforms.uA.value = e.t < 0.5 ? 1 : 1 - clamp01((e.t - 0.5) / 0.15);
      if (e.t < 0.5) { hist.unshift(nd.position.clone()); if (hist.length > 30) hist.length = 30; }
      if (hist.length > 2) { this._ribbonSet(th, hist, 0.02); th.material.uniforms.uA.value = I * (1 - smooth(0.5, 0.9, e.t)); }
      // 보호량이 줄수록 가장자리 실밥이 풀려 늘어짐
      loose.forEach((m, k) => { const on = clamp01((1 - frac) * NT - k) * (e.t > 0.5 ? 1 : 0), aa = k * 2.4 + 0.5, base = new THREE.Vector3(at.x + Math.cos(aa) * 0.62, at.y + 0.2 + (k % 3) * 0.45, at.z + Math.sin(aa) * 0.62); const pts = []; for (let q = 0; q < 6; q++) pts.push(base.clone().add(new THREE.Vector3(Math.cos(aa) * q * 0.05 * on, -q * 0.06 * on + 0.03 * Math.sin(e.t * 5 + q), Math.sin(aa) * q * 0.05 * on))); this._ribbonSet(m, pts, 0.015); m.material.uniforms.uA.value = I * 0.8 * on * (1 - out); });
      if (out >= 1) e.life = 0;
    });
    const cl = this.grid(e, NU, NV, C.lilac, C.pink, C.gold, 5), nd = this.solid(e, this.geo.ds_needle, { rim: 0xfff4c0, spec: 1.2 }), hist = [];
    nd.renderOrder = 7;
    const th = this._ribbon(e, 30); th.material.uniforms.uW.value.setHex(C.gold); th.material.uniforms.uB.value.setHex(C.goldB);
    const loose = []; for (let k = 0; k < NT; k++) { const m = this._ribbon(e, 6); m.material.uniforms.uW.value.setHex(C.gold); m.material.uniforms.uB.value.setHex(C.goldB); loose.push(m); }
    this.scraps(P3(pc.pos).setY((pc.pos.y || 0) + 1.0), 4, pc.pos.y || 0, { speed: [0.3, 0.8], up: [0.5, 1.2] });
    if (o.cured) this.sparkles(P3(pc.pos).setY((pc.pos.y || 0) + 1.0), 5, 0.5, C.pink);
    // fx2: 발밑 퀼팅 마법진(따라다님) + 머리 위 금실 실패가 돌며 실을 풀고, 꿰매기가 끝나면(0.5초) 팡·하트
    this.sigil(P3(pc.pos), 1.0, 'lilac', { pat: 3, grow: 0.3, life: 1.3, a: 0.85, spin: 1.2, follow: () => P3(pc.pos) });
    if (this.parts) { const sp = this.tmesh(e, 'spool', { order: 6 }); if (sp) e.spool = sp;
      this.after(e, 0.5, () => { if (e.dead) return; const at = P3(pc.pos).setY((pc.pos.y || 0) + 1.1); this.pang(at, 'lilac', { r: 0.6, n: 10, ground: pc.pos.y || 0 }); for (let i = 0; i < this._nk(4); i++) this.bit('heart', at, { v: new THREE.Vector3(rnd(-0.8, 0.8), rnd(1.2, 2.0), rnd(-0.8, 0.8)), g: -2.5, drag: 1, life: 0.9, s0: 0.1, s1: 0.06, rx: 0, rz: 0, wy: rnd(-4, 4), col: 0xffffff, glow: 0.3 }); });
      const u0 = e.update; e.update = (x, dt) => { u0(x, dt); if (e.spool) { const k = clamp01(x.t / 0.12) * (1 - clamp01((x.t - 0.55) / 0.2)); e.spool.position.copy(P3(pc.pos)).setY((pc.pos.y || 0) + 2.05 + 0.06 * Math.sin(x.t * 6)); e.spool.rotation.set(0, x.t * 16, 0.2); e.spool.scale.setScalar(DSFX.tripo.spool * Math.max(0.01, k)); e.spool.material.uniforms.uA.value = k; } }; }
    return e;
  }

  // ================================================================== C5 테일러드 퍼펙션 (켜지는 순간 한 번)
  fit(pc) {
    if (!this._ok()) return null;
    const C = DSFX.col, I = DSFX.intensity, NR = 3;
    const e = this._fx('fit', 0.9, (e) => {
      const at = P3(pc.pos), k = e.t / 0.9;
      rings.forEach((m, i) => { const u = clamp01((e.t - i * 0.08) / 0.55), y = at.y + 0.1 + u * 1.5; m.position.copy(at).setY(y); this._flat(m, 0.5 - 0.12 * Math.sin(u * Math.PI) * (i % 2 ? 1 : 0.6), y); m.material.uniforms.uA.value = I * 0.9 * Math.sin(Math.PI * u); });
      br.position.copy(at).setY(at.y + 1.15 - (e.tb ? DSFX.tripo.brooch * 0.5 : 0)).addScaledVector(this.toCam, 0.45); br.quaternion.copy(this.camQ); if (e.tb) br.rotateY(-Math.PI / 2); br.scale.setScalar((e.tb ? DSFX.tripo.brooch : 0.09) * (0.6 + 0.4 * easeOut(k * 3))); br.material.uniforms.uA.value = 1 - smooth(0.75, 1, k); br.material.uniforms.uGlow.value = 0.8 * Math.sin(Math.PI * clamp01((e.t - 0.4) / 0.4));
    });
    const rings = []; for (let i = 0; i < NR; i++) { const m = this.spr(e, 1, C.gold, C.goldB, 6); m.material.uniforms.uP.value = 0; rings.push(m); }
    const tb = this.tmesh(e, 'brooch', { order: 7 });   // fx2: Tripo 보석 브로치(없으면 절차 보석)
    const br = tb || this.solid(e, this.geo.ds_jewel, { tint: 0xffd27a, spec: 1.4 }); br.renderOrder = 7; if (tb) e.tb = true;
    this.after(e, 0.55, () => { this.flash(P3(pc.pos).setY((pc.pos.y || 0) + 1.15).addScaledVector(this.toCam, 0.45), 0.4, C.white, C.gold, 0.14, 0.9); this.pang(P3(pc.pos).setY((pc.pos.y || 0) + 1.15).addScaledVector(this.toCam, 0.45), 'gold', { r: 0.5, n: 8, ground: pc.pos.y || 0, quiet: true }); this._snd('ds_jewel'); });
    this.sigil(P3(pc.pos), 0.9, 'gold', { pat: 2, grow: 0.3, life: 1.0, a: 0.85, spin: 1.5, follow: () => P3(pc.pos) }); this.beam(P3(pc.pos), 0.6, 2.4, 'gold', { life: 0.8, a: 0.8 });
    return e;
  }
  unfit(pc) { if (!this._ok()) return null; return this.ring(P3(pc.pos).setY((pc.pos.y || 0) + 0.05), 0.6, DSFX.col.platB, DSFX.col.platB, 0.3, 0.5, 1.0); }
  after(e, t, fn) { return this._fx('after', t + 0.02, (x) => { if (!x._done && x.t >= t) { x._done = true; fn(); } }); }

  // ================================================================== C1~C3 제작 완성
  made(pc, o = {}) {
    if (!this._ok()) return null;
    const C = DSFX.col, I = DSFX.intensity, kind = o.kind || 'outfit', life = 2.2;
    const e = this._fx('made', life, (e) => {
      const top = P3(pc.pos).setY((pc.pos.y || 0) + 2.6), k = e.t, out = clamp01((k - (life - 0.3)) / 0.3);
      e.g.position.copy(top); e.g.scale.setScalar(1.8); e.g.rotation.y = kind === 'outfit' ? Math.max(0, k - 1.3) * 5 : 0;
      if (kind === 'outfit') {
        // 작은 마네킹 -> 원단이 걸림 -> 재단 점선 -> 바늘이 둘레를 꿰맴 -> 보석 장식 -> 한 바퀴
        if (tm) { const g = easeOut(k / 0.25), drop = easeOut((k - 0.2) / 0.3); tm.position.set(0, -0.55, 0); tm.scale.set(0.5 * g, 0.5 * Math.max(0.01, g), 0.5 * g); tm.material.uniforms.uA.value = 1 - out; tm.material.uniforms.uGlow.value = 0.35 * Math.max(0, Math.sin(Math.PI * clamp01((k - 0.2) / 0.5))) + 0.4 * Math.max(0, Math.sin(Math.PI * clamp01((k - 1.1) / 0.3))); cp.material.uniforms.uA.value = 0; cp.scale.setScalar(0.01); void drop; }
        else { [st, to].forEach(m => { m.scale.setScalar(0.32 * easeOut(k / 0.2)); m.position.set(0, -0.55, 0); m.material.uniforms.uA.value = 1 - out; });
          const drop = easeOut((k - 0.2) / 0.25); cp.position.set(0, -0.55 + 0.32 * 1.4 + (1 - drop) * 0.4, 0); cp.scale.setScalar(0.34 * Math.max(0.01, drop)); cp.material.uniforms.uA.value = drop * (1 - out); cp.rotation.y = Math.PI; }
        ln.material.uniforms.uA.value = (k > 0.45 && k < 0.75 ? 1 : 0) * (1 - out); ln.position.set(0, -0.1, 0.18); ln.scale.set(0.5, 0.05, 1); ln.material.uniforms.uP.value = clamp01((k - 0.45) / 0.15);
        const sa = clamp01((k - 0.75) / 0.35) * Math.PI * 2; nd.position.set(Math.cos(sa) * 0.24, -0.15, Math.sin(sa) * 0.24); nd.rotation.set(0, -sa, 0); nd.scale.setScalar(0.22); nd.material.uniforms.uA.value = (k > 0.75 && k < 1.15 ? 1 : 0);
        jw.position.set(0, -0.02, 0.13); jw.scale.setScalar(0.05 * easeOut((k - 1.1) / 0.15)); jw.material.uniforms.uA.value = (k > 1.1 ? 1 : 0) * (1 - out); jw.material.uniforms.uGlow.value = 0.5;
      } else if (kind === 'emb') {
        hoop.quaternion.copy(this.camQ); hoop.scale.setScalar(0.85 * easeOut(k / 0.2)); hoop.material.uniforms.uA.value = 0.8 * (1 - out); hoop.material.uniforms.uP.value = 0.7;
        const u = clamp01((k - 0.25) / 0.9), n = Math.max(2, Math.floor(u * (path.length - 1)) + 1), sub = path.slice(0, n).map(p => p.clone().applyQuaternion(this.camQ));
        if (sub.length > 1) { this._ribbonSet(th, sub.reverse(), 0.025); th.material.uniforms.uA.value = I * (1.1 + (k > 1.15 && k < 1.5 ? 0.9 : 0)) * (1 - out); }
        const tip = path[Math.min(path.length - 1, n - 1)].clone().applyQuaternion(this.camQ); nd.position.copy(tip).add(_a.copy(this.toCam).multiplyScalar(0.05)); nd.quaternion.copy(this.camQ); nd.rotateZ(0.8); nd.scale.setScalar(0.24); nd.material.uniforms.uA.value = u < 1 ? 1 : 1 - clamp01((k - 1.2) / 0.2);
        if (spl) { const g = easeOut(k / 0.2) * (1 - out); spl.position.copy(_a.set(0.42, -0.38, 0).applyQuaternion(this.camQ)); spl.rotation.set(0, k * 8, 0); spl.scale.setScalar(0.3 * Math.max(0.01, g)); spl.material.uniforms.uA.value = g; }
      } else {
        // 리본 띠가 접혀 매듭이 되고(0.1~0.6초) 가운데 보석, 주름을 따라 빛
        const fold = easeOut((k - 0.1) / 0.5); bw.quaternion.copy(this.camQ); bw.scale.set(0.42 * (1.6 - 0.6 * fold), 0.42 * Math.max(0.1, fold), 0.42); bw.material.uniforms.uA.value = 1 - out; bw.material.uniforms.uGlow.value = 0.6 * Math.max(0, Math.sin(Math.PI * clamp01((k - 0.75) / 0.4)));
        jw.position.copy(this.toCam).multiplyScalar(0.12); jw.scale.setScalar(0.07 * easeOut((k - 0.6) / 0.15)); jw.material.uniforms.uA.value = (k > 0.6 ? 1 : 0) * (1 - out); jw.material.uniforms.uGlow.value = 0.6;
      }
    });
    let st, to, cp, ln, nd, jw, hoop, th, bw, path, tm = null, spl = null;
    if (kind === 'outfit') { tm = this.tmesh(e, 'mannequin', { order: 4 }); if (!tm) { st = this.solid(e, this.geo.ds_mq_stand); to = this.solid(e, this.geo.ds_mq_torso); } cp = this.solid(e, this.geo.ds_skirt, { tint: 0xffb0d8 }); ln = this.dash(e, C.gold, C.goldB, 7); nd = this.solid(e, this.geo.ds_needle); jw = this.solid(e, this.geo.ds_jewel, { tint: 0x9ae8ff }); }
    else if (kind === 'emb') {
      hoop = this.spr(e, 1, C.ivory, C.goldB, 5); nd = this.solid(e, this.geo.ds_needle); spl = this.tmesh(e, 'spool', { order: 5 }); th = this._ribbon(e, 40); const pc_ = { star: C.rose, grid: C.lilacB, curve: C.jewel }[o.pattern] || C.gold; th.material.uniforms.uW.value.setHex(pc_); th.material.uniforms.uB.value.setHex(C.goldB);
      path = [];
      if (o.pattern === 'grid') { for (let r = 0; r < 4; r++) { const y = -0.24 + r * 0.16; path.push(new THREE.Vector3(r % 2 ? 0.25 : -0.25, y, 0), new THREE.Vector3(r % 2 ? -0.25 : 0.25, y, 0)); } for (let c = 0; c < 4; c++) { const x = 0.24 - c * 0.16; path.push(new THREE.Vector3(x, c % 2 ? -0.25 : 0.25, 0), new THREE.Vector3(x, c % 2 ? 0.25 : -0.25, 0)); } }
      else if (o.pattern === 'curve') for (let i = 0; i < 24; i++) { const u = i / 23; path.push(new THREE.Vector3(-0.3 + u * 0.6, Math.sin(u * Math.PI * 2.5) * 0.18, 0)); }
      else for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + i * Math.PI * 4 / 5 / 2 * 2, r = i % 2 ? 0.12 : 0.3, aa = -Math.PI / 2 + i * Math.PI / 5; path.push(new THREE.Vector3(Math.cos(aa) * r, -Math.sin(aa) * r, 0)); void a; }
      // 균일한 간격으로 다시 나눔(바늘이 일정한 속도로 꿰맴)
      const dense = []; for (let i = 0; i < path.length - 1; i++) for (let s = 0; s < 4; s++) dense.push(path[i].clone().lerp(path[i + 1], s / 4)); dense.push(path[path.length - 1]); path = dense;
    } else { bw = this.solid(e, this.geo.ds_bow, { spec: 0.6, rim: 0xffd8ee }); jw = this.solid(e, this.geo.ds_jewel, { tint: 0x9ae8ff, spec: 1.4 }); }
    this.after(e, kind === 'emb' ? 1.2 : 1.15, () => { const at = P3(pc.pos).setY((pc.pos.y || 0) + 2.6); this.sparkles(at, 8, 0.6); this.pang(at, kind === 'emb' ? 'jewel' : kind === 'ribbon' ? 'rose' : 'silk', { r: 0.6, n: 12, ground: pc.pos.y || 0, noRing2: true }); this.petals(at, 6, { r: 0.3, up: 0.8 }); });
    this.sigil(P3(pc.pos), 0.9, kind === 'emb' ? 'jewel' : 'silk', { pat: kind === 'emb' ? 3 : 0, grow: 0.4, life: 1.8, a: 0.75, spin: 0.8, follow: () => P3(pc.pos) });
    try { if ((o.n || 1) > 1 && window.G && window.G.ui) window.G.ui.floatText({ x: pc.pos.x, y: (pc.pos.y || 0) + 0.6, z: pc.pos.z }, '×' + o.n, '#ffd27a', 0.9, 2.6); } catch (err) { /* no ui */ }
    return e;
  }
}
