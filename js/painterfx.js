// 화가 2차 스킬 이펙트·그림 소환물 모습 (2026-11-16 '그린 그림을 현실로'). 규칙은 js/painter.js(PaintKit), 메시는 tools/blender/fx_painter.py ->
// assets/fx/fx_painter.glb.json(늑대·종이학·기사·크로키 형상·용·액자·두루마리·팔레트·임파스토 붓 자국·점·방울·깃털·꽃·줄기·구름·성벽, 정점 색만).
// 시각 정체성: 밑그림(윤곽) -> 채색(물감이 번져 채움) -> 실체화(그림에서 떨어져 나옴) -> 작품 완성(타격·영역).
// 재료: 먹 = 가장자리 번짐·필압 굵기 / 수채 = 투명한 겹침·바닥에 스며드는 번짐 / 유화 = 두께·붓결 있는 불투명 색면 / 점묘 = 작은 점이 차례로 / 크로키 = 겹친 흑백 윤곽선.
// 원칙: 가장 밝은 순간 = 실제 피해·완성 순간, 바닥 무늬·테두리 = 실제 판정 반경(넘지 않음), 화면 전체 섬광·흰 플래시 없음, 전역 블룸·노출·히트스톱은
// 건드리지 않음. 바닥 무늬는 땅에서 띄워 그림(z-fighting 없음). 메시·재질은 종류별 풀에서 재사용(CookFx -> HerbalFx 를 이어받음), 그림 텍스처는
// 종류마다 처음 한 번만 캔버스로 만듦. 저사양(휴대폰·그래픽 효과 끔): 방울·꽃·깃털·점 같은 장식만 줄임 — 윤곽 -> 채색 -> 실체화 단계는 그대로.
// 종류 (PaintFx.make(kind, a, o) ← js/skillrt.js FX.painter ← js/painter.js kit.fx):
//   pre(pc,{what,lead,hand})   누른 순간: 붓끝에 물감이 모임(red/blue/gold/palette/green/white/ink) + 실제 붓끝 획(js/artfx.js stroke)
//   colors(t)                  채색 표시: 발밑 둘레 작은 표식 — 빨강 = 붓 자국, 파랑 = 번진 얼룩, 노랑 = 금빛 점 3개(모양으로도 구분). set(cols) · end()
//   wolf/crane/knight/clone(s,{draw,model,n})  그림 소환물: 공중 종이에 윤곽 -> 채색 -> 그림 밖으로(draw 초에 완성). sync · attack · dash · dashHit ·
//                              feathers · dive · swing · hurt · refresh · redraw · gallery(on) · erase · dispose
//   cast_a5 / dragon           화룡점정: 두루마리 펼침 -> 먹선 용 -> 눈 찍기(시전 끝) -> 용이 종이 밖으로 head(s) · pierce · breath · end
//   cast_b5 / spectrum         스펙트럼 걸작: 공중 추상화(빨·파·금 붓 자국이 모임) -> 다색 파동(실제 반경) core · land
//   cast_c5 / gallery          만상갤러리: 등 뒤 화폭 3장 -> 작품마다 금빛 붓선
//   impasto(pc,{f,r,ang,sweep}) 두꺼운 붉은 붓 자국이 오른쪽 -> 왼쪽으로 부채꼴을 채움. hit(pos, ok) 입체 자국 + 불씨 · miss()
//   wash(o,{f,len,w,speed})    낮은 반투명 청색 파도 + 뒤 번짐. front(s) · splash(pos, ok) · end()
//   dots(c,{rings,n,...})      금빛 점이 바깥 고리부터 차례로 찍힘 -> burst(i, hits) · final(i, hits)
//   fusion(c,{r,picks})        채색이 떨어져 작은 팔레트로 모임 -> 휘저음 -> 꽃처럼 펼쳐짐. react(kind, pos)
//   meadow(c,{r,dur,grow})     연두 밑칠 -> 줄기 -> 꽃이 차례로. pulse(healed[]) 빛방울 · gallery · end
//   wall(c,{f,w,grow,life})    원근 보조선·윤곽 -> 흰 물감 -> 접히듯 일어섬. crack(k) · block(pos) · gallery · end(why) 다시 평면으로 눕고 지워짐
//   storm(c,{r,dur,grow})      작은 화폭의 먹구름 -> 영역 위 높게. rain(hits) · bolt(p, hits) · gallery · end   warn(p,{r,t}) 먹빛 예고 strike · cancel
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HerbalFx } from './herbalfx.js';

export const PAINTFX = {
  intensity: 1.0,
  col: { red: 0xe8343c, redB: 0x8a0e18, blue: 0x4a8cff, blueB: 0x1a3aa8, gold: 0xffd24a, goldB: 0xc07a10, green: 0x9ae070, greenB: 0x3a8a30,
    ink: 0x1a1622, inkB: 0x4a4a68, white: 0xfffaf0, whiteB: 0xb8b4c8, paper: 0xf6eedc, violet: 0xd070ff, violetB: 0x6a2aa8, ember: 0xffa040, emberB: 0xd83010 },
  wolf: { size: 1.15 }, knight: { size: 1.85 }, crane: { size: 0.55 }, clone: { size: 1.6 },
  dragon: { size: 1.25, segs: 16, gap: 0.34 },
  wallH: 2.0, cloudH: 3.4,
};
const P = PAINTFX, C = PAINTFX.col;
const P3 = (p) => new THREE.Vector3(p.x, p.y || 0, -p.z);
const D3 = (f) => new THREE.Vector3(f.x, 0, -f.z).normalize();
const yawOf = (f) => Math.atan2(f.x, -f.z);
const lite = () => { const G = window.G; return !!(G && ((G.input && G.input.mobile) || (G.settings && G.settings.graphicsFx === false))); };
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const easeBack = (x) => { x = clamp01(x); const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
let SEED = 13; const rnd = (a, b) => { SEED = (SEED * 16807) % 2147483647; return a + (SEED / 2147483647) * (b - a); };   // 자기 난수 — 게임 Math.random 을 건드리지 않음
const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
const groundY = (x, z) => { try { return window.G.zone.geo.ground(x, z).y; } catch (e) { return 0; } };
const COLOR_HEX = { red: C.red, blue: C.blue, yellow: C.gold };

// ---------------------------------------------------------------- shaders
// 그림 재질(정점 색 위에 재료 느낌): uMode 0 먹(어두운 몸 + 번진 가장자리 + 푸른 윤기) / 1 유화(색면 + 붓결 줄) / 2 크로키(종이 흰색 + 해칭 + 연필 윤곽) / 3 종이(접힌 면 음영)
// uDraw = 그림에서 떨어져 나오는 정도(0 = 아직 그림, 1 = 완전한 실체) — 아래부터 디졸브로 나타남
const PM_VS = `attribute vec3 color; varying vec3 vC, vN, vV, vP, vW;
void main(){ vC = color; vP = position; vN = normalize(normalMatrix * normal); vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vec4 mv = viewMatrix * w; vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const PM_FS = `uniform vec3 uTint, uGlowC; uniform float uA, uGlow, uMode, uDraw, uT, uY0, uH;
varying vec3 vC, vN, vV, vP, vW;
float h31(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y), mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }
void main(){
  vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
  vec3 L = normalize(vec3(-.4, .8, .5)); float d = max(0., dot(n, L)), rim = pow(1. - max(0., dot(n, vV)), 2.2);
  vec3 base = vC * uTint, c; float a = uA;
  float hk = clamp((vW.y - uY0) / max(.01, uH), 0., 1.), nz = n3(vW * 6.);
  float cut = uDraw * 1.25 - .12 - hk + (nz - .5) * .35; if (cut < 0.) discard;   // 그림에서 아래부터 디졸브로 나타남
  float edge = smoothstep(.12, 0., cut);
  if (uMode < .5) {          // 먹: 3단 밴딩 + 가장자리 번짐(옅은 회청) + 젖은 윤기
    float band = d > .62 ? 1. : d > .25 ? .72 : .5;
    c = base * (.7 + .6 * band) + vec3(.32, .34, .5) * rim * (.5 + .5 * nz) + vec3(.6, .65, .85) * pow(max(0., dot(reflect(-L, n), vV)), 18.) * .35;
    a *= 1. - rim * .25 * nz;
  } else if (uMode < 1.5) { // 유화: 색면 + 붓결(물체 공간 줄무늬)
    float stroke = .5 + .5 * sin(vP.y * 48. + n3(vP * 9.) * 6. + vP.x * 9.);
    float band = d > .55 ? 1. : d > .2 ? .8 : .62;
    c = base * (.62 + .48 * band) * (.88 + .2 * stroke) + vec3(1., .95, .85) * rim * .18;
  } else if (uMode < 2.5) { // 크로키: 종이 + 화면 공간 해칭 + 연필 윤곽
    float tone = 1. - d * .9; vec2 sp = gl_FragCoord.xy;
    float h1 = step(.5, fract((sp.x + sp.y) * .16)), h2 = step(.5, fract((sp.x - sp.y) * .16));
    float hatch = tone > .45 ? h1 : 1.; hatch *= tone > .7 ? h2 : 1.;
    float line = smoothstep(.55, .85, rim + (nz - .5) * .3);
    c = mix(vec3(.97, .95, .9), vec3(.2, .2, .24), max(line, (1. - hatch) * .55));
    a *= .55 + .45 * max(line, (1. - hatch));
  } else {                  // 종이: 접힌 면 음영
    c = base * (.72 + .4 * d) + vec3(1.) * rim * .12;
  }
  c = mix(c, uGlowC * 1.4, edge * .8 * (1. - step(.999, uDraw)));   // 나타나는 경계는 물감 색으로 빛남
  c += uGlowC * uGlow;
  gl_FragColor = vec4(c, a);
}`;
// 종이 그림(캔버스 텍스처: R = 윤곽선, G = 칠할 면): uP1 = 윤곽이 그려진 정도(각도 순), uP2 = 물감이 번져 찬 정도(가운데부터 + 잡음), uPaper = 종이 바탕
const PP_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const PP_FS = `uniform sampler2D uMap; uniform vec3 uInk, uFill; uniform float uA, uP1, uP2, uPaper, uSeed, uAsp; varying vec2 vUv;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h21(i), h21(i + vec2(1,0)), f.x), mix(h21(i + vec2(0,1)), h21(i + vec2(1,1)), f.x), f.y); }
void main(){
  vec4 t = texture2D(uMap, vUv); vec2 q = (vUv - .5) * vec2(uAsp, 1.);
  float ord = uAsp > 1.5 ? vUv.x : fract(atan(q.y, q.x) / 6.2832 + .25);           // 긴 두루마리는 왼쪽부터, 나머지는 한 바퀴 돌며
  float wob = (n2(vUv * 9.) - .5) * .06;
  float line = t.r * smoothstep(ord - .02, ord + .02, uP1 + wob);
  float bleed = n2(vUv * 6. + uSeed) * .35 + length(q) * (uAsp > 1.5 ? .25 : .9);
  float fill = t.g * smoothstep(bleed - .04, bleed + .04, uP2 * 1.35);
  float wet = t.g * smoothstep(bleed - .02, bleed + .04, uP2 * 1.35) * (1. - smoothstep(bleed + .04, bleed + .16, uP2 * 1.35));   // 번지는 앞(진한 물감 띠)
  vec2 e = abs(vUv - .5) * 2.; float deck = 1. - smoothstep(.9, 1., max(e.x + n2(vUv * 30.) * .05, e.y + n2(vUv.yx * 30.) * .05));
  vec3 paper = vec3(.97, .94, .86) * (.94 + .06 * n2(vUv * 40.));
  vec3 c = mix(paper, uFill, fill * .92); c = mix(c, uFill * .55, wet * .6); c = mix(c, uInk, line);
  float a = max(deck * uPaper, max(fill * .95, line));
  gl_FragColor = vec4(c, a * uA);
}`;
// 바닥 무늬(원판 uv 0..1 = 반지름 1): uK 0 수채 번짐(가장자리 진한 물감·잡음 경계, uP = 번진 반경) / 1 먹 얼룩 예고(uP 자람) / 2 얇은 금선 고리 / 3 청색 번짐 자국 / 4 원근 보조선 사각형
const PG_FS = `uniform vec3 uW, uB; uniform float uA, uK, uP, uT, uSeed; varying vec2 vUv;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h21(i), h21(i + vec2(1,0)), f.x), mix(h21(i + vec2(0,1)), h21(i + vec2(1,1)), f.x), f.y); }
void main(){
  vec2 p = vUv * 2. - 1.; float r = length(p), nz = n2(p * 3.5) * .6 + n2(p * 9.) * .4, a = 0.; vec3 c = uW;
  if (uK < .5) {           // 수채: 안은 옅게, 경계에 고인 진한 물감, 잡음으로 번진 테두리. 실제 반경(r = 1)은 넘지 않음
    float edge = uP * (.9 + .1 * nz), inside = smoothstep(edge, edge - .05, r) * step(r, 1.);
    float pool = smoothstep(edge - .14, edge - .02, r) * inside;
    a = inside * (.2 + .25 * nz) + pool * .45; c = mix(uW, uB, pool * .8 + nz * .2);
  } else if (uK < 1.5) {   // 먹 예고: 가운데부터 퍼지는 먹 얼룩 + 바깥 얇은 테
    float edge = uP * (.85 + .15 * nz); a = smoothstep(edge, edge - .08, r) * (.35 + .35 * uP) + smoothstep(.04, 0., abs(r - .96)) * .5; c = mix(uB, uW, .2 * nz);
  } else if (uK < 2.5) {   // 금선 고리
    a = smoothstep(.035, .0, abs(r - .96)) * (.7 + .3 * sin(atan(p.y, p.x) * 8. + uT * 3.)); c = uW;
  } else if (uK < 3.5) {   // 청색 번짐 자국(무피해 장식)
    a = smoothstep(1., .3, r) * (.22 + .2 * nz) * step(r, 1.); c = mix(uW, uB, nz);
  } else {                 // 원근 보조선: 소실점을 향한 가는 선 + 가운데 긴 사각형 윤곽
    float lines = 0.; for (int i = 0; i < 5; i++) { float k = float(i) / 4. - .5; vec2 d = normalize(vec2(k * 1.6, 1.)); lines = max(lines, smoothstep(.012, 0., abs(p.x * d.y - (p.y + 1.) * d.x)) * step(-1., p.y)); }
    float box = smoothstep(.018, 0., min(abs(abs(p.x) - .9), abs(abs(p.y) - .22))) * step(abs(p.x), .92) * step(abs(p.y), .24);
    a = (lines * .35 * smoothstep(.0, .6, uP) + box * smoothstep(.3, .9, uP)) * step(r, 1.4); c = uW;
  }
  gl_FragColor = vec4(c, clamp(a, 0., 1.) * uA);
}`;
const PG_VS = PP_VS;

// ---------------------------------------------------------------- 그림 텍스처(캔버스, 처음 한 번)
const TEX = {};
function drawTex(kind) {
  if (TEX[kind]) return TEX[kind];
  const W = kind === 'dragon' ? 1024 : 256, H = 256, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineJoin = 'round';
  const F = 'rgb(0,255,0)', S = 'rgb(255,0,0)';
  const path = (pts, close) => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) { const [x, y] = pts[i]; g.lineTo(x, y); } if (close) g.closePath(); };
  const blob = (fn, lw = 6) => { g.fillStyle = F; fn(); g.fill(); g.strokeStyle = S; g.lineWidth = lw; fn(); g.stroke(); };
  const ell = (x, y, rx, ry, r = 0) => () => { g.beginPath(); g.ellipse(x, y, rx, ry, r, 0, 6.2832); };
  const line = (pts, lw = 5) => { g.strokeStyle = S; g.lineWidth = lw; path(pts); g.stroke(); };
  if (kind === 'wolf') {
    blob(ell(120, 132, 70, 36)); blob(ell(186, 104, 30, 26)); blob(() => path([[200, 96], [238, 108], [204, 122]], true));
    blob(() => path([[176, 82], [182, 52], [194, 80]], true), 5); blob(() => path([[192, 84], [204, 56], [208, 88]], true), 5);
    for (const x of [78, 100, 150, 168]) blob(() => path([[x - 8, 150], [x - 4, 214], [x + 8, 214], [x + 10, 150]], true), 5);
    blob(() => { g.beginPath(); g.moveTo(54, 122); g.quadraticCurveTo(20, 96, 26, 70); g.quadraticCurveTo(40, 104, 64, 136); g.closePath(); }, 5);
    line([[66, 108], [100, 96], [140, 98], [168, 92]], 4);
  } else if (kind === 'crane') {
    blob(() => path([[128, 150], [40, 110], [128, 128]], true), 5); blob(() => path([[128, 150], [216, 104], [128, 128]], true), 5);
    blob(() => path([[110, 150], [146, 150], [128, 182]], true), 5); blob(() => path([[146, 146], [196, 168], [210, 150]], true), 4); blob(() => path([[110, 146], [64, 172], [56, 156]], true), 4);
  } else if (kind === 'knight') {
    blob(ell(128, 70, 26, 28)); blob(() => path([[92, 98], [164, 98], [158, 170], [98, 170]], true));
    blob(() => path([[100, 168], [112, 230], [126, 230], [128, 170]], true), 5); blob(() => path([[128, 170], [132, 230], [146, 230], [156, 168]], true), 5);
    blob(ell(84, 140, 26, 34), 5); blob(() => path([[168, 104], [178, 100], [212, 22], [204, 18], [170, 96]], true), 5);
    line([[150, 118], [176, 104]], 6); line([[100, 52], [156, 52]], 4);
  } else if (kind === 'clone') {
    for (let k = 0; k < 3; k++) { const o = (k - 1) * 3; line([[128 + o, 40], [124 + o, 70], [128 + o, 130], [104 + o, 214]], 3); line([[128 + o, 130], [150 + o, 214]], 3); line([[96 + o, 96], [126 + o, 78], [160 + o, 100]], 3); g.strokeStyle = S; g.lineWidth = 3; g.beginPath(); g.ellipse(128 + o, 38, 16, 18, 0, 0, 6.28); g.stroke(); }
    g.fillStyle = F; g.beginPath(); g.ellipse(128, 120, 40, 90, 0, 0, 6.28); g.fill();
  } else if (kind === 'dragon') {
    g.fillStyle = F; g.lineWidth = 34; g.strokeStyle = 'rgb(0,255,0)'; g.beginPath(); g.moveTo(60, 180); for (let x = 60; x <= 860; x += 20) g.lineTo(x, 128 + Math.sin(x / 90) * 56); g.stroke();
    g.strokeStyle = S; g.lineWidth = 7; g.beginPath(); g.moveTo(60, 162); for (let x = 60; x <= 860; x += 20) g.lineTo(x, 110 + Math.sin(x / 90) * 56); g.stroke();
    g.beginPath(); g.moveTo(60, 198); for (let x = 60; x <= 860; x += 20) g.lineTo(x, 146 + Math.sin(x / 90) * 56); g.stroke();
    blob(ell(900, 110 + Math.sin(860 / 90) * 56, 70, 44), 7); blob(() => path([[930, 70], [990, 40], [960, 84]], true), 5); blob(() => path([[890, 66], [930, 30], [918, 76]], true), 5);
    line([[960, 130], [1010, 160], [1018, 196]], 4); line([[946, 134], [990, 180]], 4);
    for (let x = 120; x < 840; x += 60) line([[x, 100 + Math.sin(x / 90) * 56], [x - 10, 76 + Math.sin(x / 90) * 56]], 5);
  } else if (kind === 'cloud') {
    for (const [x, y, r] of [[90, 140, 44], [140, 118, 56], [190, 140, 42], [128, 156, 46], [60, 158, 30], [214, 160, 28]]) blob(ell(x, y, r, r * 0.8), 5);
  } else if (kind === 'flower') {
    for (const [x, y, r] of [[80, 120, 26], [150, 96, 30], [190, 150, 24], [110, 170, 22]]) { line([[x, y + r], [x + 4, 236]], 4); for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; blob(ell(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7, r * 0.5, r * 0.32, a), 3); } }
  } else if (kind === 'wall') {
    blob(() => path([[20, 200], [236, 200], [236, 90], [20, 90]], true), 5);
    for (let i = 0; i < 5; i++) blob(() => path([[24 + i * 46, 90], [24 + i * 46, 56], [52 + i * 46, 56], [52 + i * 46, 90]], true), 4);
    for (let y = 120; y < 200; y += 28) line([[22, y], [234, y]], 2);
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.NoColorSpace; t.minFilter = THREE.LinearFilter; return (TEX[kind] = t);
}

export class PaintFx extends HerbalFx {
  load() {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const j = await (await fetch('assets/fx/fx_painter.glb.json')).json(), raw = atob(j.b64), u8 = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
      const g = await new Promise((res, rej) => new GLTFLoader().parse(u8.buffer, '', res, rej));
      g.scene.traverse(o => { if (o.isMesh) this.geo[o.name] = o.geometry; });
      this.disc = new THREE.PlaneGeometry(2, 2); this.disc.rotateX(-Math.PI / 2);
      this.card = new THREE.PlaneGeometry(1, 1);
      const wv = new THREE.PlaneGeometry(1, 1, 16, 6); wv.rotateX(-Math.PI / 2); this.waveGeo = wv;
      this.ready = true;
    })().catch(e => console.warn('painterfx load', e));
    return this.loading;
  }
  _mat(kind) {
    const U = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v }])), Cc = () => new THREE.Color(1, 1, 1);
    if (kind === 'pm') return new THREE.ShaderMaterial({ uniforms: U({ uTint: Cc(), uGlowC: Cc(), uA: 1, uGlow: 0, uMode: 0, uDraw: 1, uT: 0, uY0: 0, uH: 1 }), vertexShader: PM_VS, fragmentShader: PM_FS, transparent: true, depthWrite: true, side: THREE.DoubleSide });
    if (kind === 'pma') return new THREE.ShaderMaterial({ uniforms: U({ uTint: Cc(), uGlowC: Cc(), uA: 1, uGlow: 0, uMode: 0, uDraw: 1, uT: 0, uY0: 0, uH: 1 }), vertexShader: PM_VS, fragmentShader: PM_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    if (kind === 'pp') return new THREE.ShaderMaterial({ uniforms: U({ uMap: null, uInk: new THREE.Color(0x1a1622), uFill: Cc(), uA: 0, uP1: 0, uP2: 0, uPaper: 1, uSeed: 0, uAsp: 1 }), vertexShader: PP_VS, fragmentShader: PP_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    if (kind === 'pg') return new THREE.ShaderMaterial({ uniforms: U({ uW: Cc(), uB: Cc(), uA: 0, uK: 0, uP: 1, uT: 0, uSeed: 0 }), vertexShader: PG_VS, fragmentShader: PG_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    return super._mat(kind);
  }
  /** 그림 재질 메시(정점 색) — mode 0 먹 / 1 유화 / 2 크로키 / 3 종이 */
  pm(e, name, o = {}) {
    const geo = this.geo[name]; if (!geo) return null;
    const m = this._m(e, o.see ? 'pma' : 'pm', geo, o.order ?? 2), u = m.material.uniforms;
    u.uTint.value.setHex(o.tint ?? 0xffffff); u.uGlowC.value.setHex(o.glowC ?? C.gold); u.uA.value = o.a ?? 1; u.uGlow.value = o.glow ?? 0; u.uMode.value = o.mode ?? 0; u.uDraw.value = o.draw ?? 1; u.uY0.value = 0; u.uH.value = 1;
    return m;
  }
  /** 종이 그림 판(카메라 쪽을 향하는 세로 판) */
  paper(e, kind, o = {}) {
    const m = this._m(e, 'pp', this.card, o.order ?? 3), u = m.material.uniforms;
    u.uMap.value = drawTex(kind); u.uInk.value.setHex(o.ink ?? C.ink); u.uFill.value.setHex(o.fill ?? 0x3a3448); u.uA.value = 0; u.uP1.value = 0; u.uP2.value = 0; u.uPaper.value = o.paper ?? 1; u.uSeed.value = rnd(0, 50); u.uAsp.value = o.asp ?? 1;
    return m;
  }
  pg(e, k, w, b, order = 1) { const m = this._m(e, 'pg', this.disc, order), u = m.material.uniforms; u.uK.value = k; u.uP.value = 1; u.uT.value = 0; u.uW.value.setHex(w); u.uB.value.setHex(b); u.uA.value = 0; u.uSeed.value = rnd(0, 50); return m; }
  /** 카메라 쪽을 향하되 세로로 선 판 */
  _face(m, at, w, h) { m.position.copy(at); m.quaternion.copy(this.camQ); m.scale.set(w, h, 1); }
  /** 물감 방울(정점 색 구) 흩뿌림 */
  drops(at, n, col, o = {}) {
    if (n <= 0 || !this.geo.pt_drop) return null; const ps = [], life = o.life || 0.55, gy = o.ground ?? at.y - 1.2;
    const e = this._fx('drops', life, (e, dt) => { const k = e.t / life;
      for (const p of ps) { p.v.y -= 9.8 * dt; p.m.position.addScaledVector(p.v, dt); if (p.m.position.y < gy + 0.02) { p.m.position.y = gy + 0.02; p.v.set(0, 0, 0); p.m.scale.y = p.s * 0.3; } p.m.material.uniforms.uA.value = 1 - smooth(0.6, 1, k); } });
    for (let i = 0; i < n; i++) { const a = rnd(0, 6.283), sp = rnd(0.6, 2.2) * (o.speed ?? 1), m = this.pm(e, 'pt_drop', { tint: col, mode: 1, see: true }); if (!m) break; const s = rnd(0.03, 0.07) * (o.size ?? 1); m.scale.setScalar(s); m.position.copy(at);
      ps.push({ m, s, v: new THREE.Vector3(Math.cos(a) * sp, rnd(1.0, 2.6) * (o.up ?? 1), Math.sin(a) * sp) }); }
    return e;
  }

  make(kind, a, o = {}) { if (!this._ok()) return null; const f = this['k_' + kind]; return f ? f.call(this, a, o) : null; }

  // ================================================================== 누른 순간: 붓끝에 물감
  k_pre(pc, o) {
    const what = o.what, col = { red: C.red, blue: C.blue, gold: C.gold, palette: C.violet, green: C.green, white: C.white, ink: C.ink }[what] || C.ink, lead = Math.max(0.1, o.lead || 0.3);
    const act = { red: 'pt_sweep', blue: 'pt_low', gold: 'pt_dots', palette: 'pt_mix', green: 'pt_land', white: 'pt_land', ink: 'pt_land' }[what];
    try { const art = window.G && window.G.skillFx && window.G.skillFx.art; if (art && pc.body) art.stroke(pc, { col: what === 'white' ? 0xf4f0ff : what === 'palette' ? 0xb860ff : col, act }); } catch (err) { /* no brush */ }
    const e = this._fx('pre', lead + 0.2, (e) => { const k = e.t / lead, hp = P3(o.hand ? o.hand() : pc.pos);
      g0.quaternion.copy(this.camQ); g0.position.copy(hp); g0.scale.setScalar(0.18 + 0.22 * easeOut(k)); g0.material.uniforms.uA.value = 0.85 * smooth(0, 0.1, e.t) * (1 - smooth(1, 1.3, k)); });
    const g0 = this.spr(e, 0, what === 'ink' ? C.inkB : col, what === 'ink' ? C.ink : col, 6);
    if (!lite()) this.drops(P3(o.hand ? o.hand() : pc.pos), 3, col, { speed: 0.4, up: 0.4, life: 0.4 });
    return this._h(e, {});
  }

  // ================================================================== 채색 표시(대상 발밑 둘레, 체력 막대·얼굴을 가리지 않음)
  k_colors(t, o) {
    let cols = [], fade = 1;
    const e = this._fx('colors', 1e9, (e) => {
      if (!t || t.dead) { this._free(e); return; }
      const base = P3(t.pos), r = (t.radius || 0.5) + 0.32; fade = e.ending != null ? this._fadeK(e) : 1;
      if (e.ending != null && fade <= 0.01) { this._free(e); return; }
      ['red', 'blue', 'yellow'].forEach((c, i) => {
        const on = cols.includes(c), a = -0.6 + i * 0.9 + e.t * 0.4, x = base.x + Math.cos(a) * r, z = base.z + Math.sin(a) * r, y = groundY(x, -z) + 0.06;
        const mk = marks[i]; for (const m of mk) m.visible = on;
        if (!on) return;
        if (c === 'red') { const m = mk[0]; m.position.set(x, y, z); m.rotation.set(0, -a + Math.PI / 2, 0); m.scale.set(0.5, 1.2, 1.4); m.material.uniforms.uA.value = fade; }
        else if (c === 'blue') { const m = mk[0]; m.position.set(x, y + 0.01, z); m.scale.setScalar(0.24); m.material.uniforms.uA.value = 0.9 * fade; m.material.uniforms.uT.value = e.t; }
        else mk.forEach((m, j) => { m.quaternion.copy(this.camQ); m.position.set(x + Math.cos(j * 2.1) * 0.08, y + 0.05 + j * 0.03, z + Math.sin(j * 2.1) * 0.08); m.scale.setScalar(0.11 + 0.03 * Math.sin(e.t * 6 + j)); m.material.uniforms.uA.value = 0.9 * fade; });
      });
    });
    const red = this.pm(e, 'pt_stroke', { tint: C.red, mode: 1 }), blue = this.pg(e, 0, C.blue, C.blueB, 2), gold = [0, 1, 2].map(() => this.spr(e, 0, C.gold, C.goldB, 6));
    blue.material.uniforms.uP.value = 0.95;
    const marks = [[red].filter(Boolean), [blue], gold];
    return this._h(e, { set: (c) => { cols = c.slice(); e.ending = null; e.life = 1e9; }, end: () => this._end(e, 0.3) });
  }

  // ================================================================== 그림 소환물 공통: 종이 -> 윤곽 -> 채색 -> 분리
  _drawing(e, kind, s, draw, o) {
    // 종이 판: 소환물 앞(카메라 쪽) 공중. 0 .. 0.45 draw 윤곽, 0.3 .. 0.8 draw 채색, 0.75 .. 1 draw 종이가 사라지며 몸이 앞으로 나옴
    const pp = this.paper(e, kind, { ink: o.ink ?? C.ink, fill: o.fill ?? 0x2a2438, paper: o.paperA ?? 1, order: 4 });
    e.drawT = draw; e.pp = pp; e.ppSize = o.size || 1.4; e.ppY = o.y ?? 0.9;
  }
  _drawTick(e, s) {
    const k = clamp01(e.t / e.drawT), pp = e.pp, u = pp.material.uniforms, base = P3(s.pos);
    if (k >= 1 && e.regrowT == null) { pp.visible = false; return 1; }
    pp.visible = true;
    const at = base.clone().addScaledVector(this.toCam, 0.5); at.y += e.ppY;
    this._face(pp, at, e.ppSize, e.ppSize);
    u.uP1.value = easeOut(k / 0.45); u.uP2.value = smooth(0.3, 0.8, k); u.uA.value = smooth(0, 0.08, k) * (1 - smooth(0.82, 1, k));
    return smooth(0.62, 1.0, k);   // 몸이 그림에서 나오는 정도
  }
  _view(kind, s, o, build, tick, extra = {}) {
    const e = this._fx(kind, 1e9, (e, dt) => {
      if (e.erasing != null) { const k = (e.t - e.erasing) / 0.45; for (const m of e.body) m.material.uniforms.uDraw.value = 1 - k; e.g.visible = k < 1; if (k >= 1) this._free(e); return; }
      const dk = this._drawTick(e, e.s); e.dk = dk; e.hurtK = Math.max(0, (e.hurtK || 0) - dt * 4); e.atkK = Math.max(0, (e.atkK || 0) - dt * 3); e.galK += ((e.gal ? 1 : 0) - e.galK) * Math.min(1, dt * 6);
      for (const m of e.body) { const u = m.material.uniforms; u.uDraw.value = dk; u.uY0.value = P3(e.s.pos).y - 0.05; u.uH.value = e.h || 1.5; u.uGlow.value = 0.25 * e.hurtK + 0.07 * e.galK; u.uGlowC.value.setHex(e.hurtK > 0.05 ? 0xff6060 : e.galK > 0.05 ? C.gold : (e.glowC || C.gold)); }
      tick(e, dt);
    });
    e.s = s; e.body = []; e.gal = false; e.galK = 0; e.hurtK = 0;
    build(e);
    return this._h(e, {
      sync: (s2) => { e.s = s2; },
      hurt: () => { e.hurtK = 1; },
      refresh: () => { this.ring(P3(s.pos), 1.2, C.gold, C.goldB, 0.4, 1.0, 0.2); this.drops(P3(s.pos).setY((s.pos.y || 0) + 0.8), lite() ? 3 : 6, extra.col || C.ink, { life: 0.5 }); },
      redraw: () => { e.t = 0; e.drawT = 0.4; e.regrowT = 0; setTimeout(() => { e.regrowT = null; }, 400); },
      gallery: (on) => { e.gal = !!on; },
      erase: () => { if (e.erasing == null) { e.erasing = e.t; this.drops(P3(s.pos).setY((s.pos.y || 0) + 0.6), lite() ? 3 : 6, extra.col || C.ink, { life: 0.5, speed: 0.6 }); } },
      ...extra.h ? extra.h(e) : {},
    });
  }

  // ------------------------------------------------------------------ 묵수·흑랑
  k_wolf(s, o) {
    const S = P.wolf.size;
    return this._view('wolf', s, o, (e) => {
      this._drawing(e, 'wolf', s, o.draw || 0.75, { size: 1.6, y: 0.7, fill: 0x221c30 });
      e.h = 1.1 * S; e.glowC = 0x5a6aa8;
      e.root = new THREE.Group(); e.g.add(e.root);
      const add = (n, opt = {}) => { const m = this.pm(e, n, { tint: 0xffffff, mode: 0, ...opt }); if (m) { e.body.push(m); e.root.add(m); } return m; };
      e.bodyM = add('pt_wolf_body'); e.head = add('pt_wolf_head'); e.tail = add('pt_wolf_tail'); e.legs = [0, 1, 2, 3].map(() => add('pt_wolf_leg'));
      e.step = 0; e.prints = 0; e.last = null;
    }, (e, dt) => {
      const s = e.s, base = P3(s.pos), mv = s.moving || (s.dash != null);
      e.step += dt * (s.dash ? 26 : mv ? 13 : 0); const lunge = e.atkK;
      e.root.position.copy(base).setY(base.y); e.root.rotation.set(0, yawOf(s.facing), 0); e.root.scale.setScalar(S * (0.85 + 0.15 * e.dk));
      const bob = mv ? Math.abs(Math.sin(e.step)) * 0.05 : Math.sin(e.t * 2) * 0.01;
      e.bodyM.position.set(0, 0.5 + bob, 0.02 * lunge); e.bodyM.rotation.set(-0.05 * Math.sin(e.step * 2) - 0.12 * lunge, 0, 0);
      e.head.position.set(0, 0.62 + bob, 0.48 + 0.18 * lunge); e.head.rotation.set(0.25 * lunge - 0.05, 0, 0);
      e.tail.position.set(0, 0.62 + bob, -0.5); e.tail.rotation.set(0.3 + 0.2 * Math.sin(e.t * 4), Math.sin(e.t * 3) * 0.3, 0);
      [[-0.13, 0.3], [0.13, 0.3], [-0.13, -0.32], [0.13, -0.32]].forEach(([x, z], i) => { const l = e.legs[i]; l.position.set(x, 0.48 + bob, z); l.rotation.set(mv ? Math.sin(e.step + (i % 2 ? 0 : Math.PI) + (i > 1 ? Math.PI / 2 : 0)) * 0.6 : 0, 0, 0); });
      // 움직이면 발밑 먹 자국 + 짧은 마른 붓 잔상(장식, 피해 없음)
      if (e.dk >= 1 && mv && (!e.last || e.last.distanceTo(base) > 0.55)) { e.last = base.clone(); this._print(base, s.dash ? 0.5 : 0.28, s.dash ? 0.6 : 0.9); }
    }, { col: C.ink, h: (e) => ({
      attack: (t, ok) => { e.atkK = 1; if (ok && t) { const at = P3(t.pos); at.y += 0.6; this.flash(at, C.inkB, C.ink, 0.5, 0.14, 0.9); this.drops(at, lite() ? 3 : 6, C.ink, { speed: 1.2, life: 0.45 }); } },
      dash: (f, d) => { e.atkK = 1; const at = P3(e.s.pos); this._streak(at, D3(f), d, C.ink); },
      dashHit: (p) => { const at = P3(p); at.y += 0.6; this.flash(at, C.inkB, C.ink, 0.6, 0.16, 1.0); },
    }) });
  }
  _print(at, s, life) {   // 먹 발자국(바닥, 무피해)
    const e = this._fx('print', life, (e) => { m.material.uniforms.uA.value = 0.55 * (1 - smooth(0.4, 1, e.t / life)); });
    const m = this.pg(e, 3, C.inkB, C.ink, 1); m.position.copy(at).setY(groundY(at.x, -at.z) + 0.035); m.scale.set(s * 0.45, 1, s * 0.3); m.material.uniforms.uP.value = 1;
  }
  _streak(at, dir, len, col) {   // 마른 붓 잔상(돌진 길)
    const e = this._fx('streak', 0.45, (e) => { const k = e.t / 0.45; m.material.uniforms.uA.value = 0.9 * (1 - smooth(0.2, 1, k)); });
    const m = this.spr(e, 2, col === C.ink ? C.inkB : col, col, 3); const mid = at.clone().addScaledVector(dir, len / 2); mid.y += 0.5;
    m.position.copy(mid); m.lookAt(mid.clone().add(this.toCam)); m.rotateZ(Math.atan2(dir.z, dir.x) * 0 ); m.scale.set(len, 0.35, 1);
    this._alignLine(m, dir);
  }

  // ------------------------------------------------------------------ 비화·채색군학 (편대 하나, 학은 장식 — 피해는 규칙의 편대 기준)
  k_crane(s, o) {
    const n = Math.min(o.n || 5, lite() ? 3 : 5), cols = [0xffb0b0, 0xa8d0ff, 0xfff0a0, 0xb8f0b0, 0xe0b8ff];
    return this._view('crane', s, o, (e) => {
      this._drawing(e, 'crane', s, o.draw || 0.8, { size: 1.2, y: 1.4, fill: 0xf4c0c8, ink: 0x6a5a70 });
      e.h = 3; e.cr = [];
      for (let i = 0; i < n; i++) { const g = new THREE.Group(); e.g.add(g); const b = this.pm(e, 'pt_crane', { mode: 3, tint: cols[i] }), wl = this.pm(e, 'pt_crane_wing', { mode: 3, tint: cols[i] }), wr = this.pm(e, 'pt_crane_wing', { mode: 3, tint: cols[i] });
        for (const m of [b, wl, wr]) if (m) { g.add(m); e.body.push(m); } wr && (wr.scale.x = -1); e.cr.push({ g, b, wl, wr, ph: i * 1.3, dive: -9 }); }
    }, (e) => {
      const s = e.s, c = P3(s.pos), k = e.dk;
      e.cr.forEach((q, i) => {
        const a = e.t * 1.4 + i / e.cr.length * 6.283, rr = 0.45 + 0.1 * Math.sin(e.t + i), y = groundY(c.x, -c.z) + 1.45 + 0.2 * Math.sin(e.t * 2 + i);   // 편대는 대상에서 2.9 m 떨어져 돌고 학은 그 둘레 작게(이름표·체력 막대를 가리지 않게)
        // 접힘: 그림 완성 직전(종이에서 접혀 학이 됨) — 날개가 펴짐
        const unfold = smooth(0.55, 1, k);
        let p = new THREE.Vector3(c.x + Math.cos(a) * rr * (0.3 + 0.7 * k), y, c.z + Math.sin(a) * rr * (0.3 + 0.7 * k));
        const dt0 = e.t - q.dive;
        if (dt0 >= 0 && dt0 < 0.6 && q.to) { const kk = dt0 / 0.6, dn = kk < 0.5 ? easeOut(kk * 2) : 1 - easeOut((kk - 0.5) * 2); p = p.clone().lerp(q.to.clone().setY(q.to.y + 0.6), dn); if (q.trail) { q.trail.position.copy(p); q.trail.material.uniforms.uA.value = 0.7 * (1 - kk); } }
        q.g.position.copy(p); q.g.rotation.set(0, -a + Math.PI, 0); q.g.scale.setScalar(P.crane.size * (0.3 + 0.7 * unfold));
        const flap = Math.sin(e.t * 9 + q.ph) * 0.5 * unfold; if (q.wl) q.wl.rotation.set(0, 0, 0.2 + flap); if (q.wr) q.wr.rotation.set(0, 0, -0.2 - flap);
      });
    }, { col: C.white, h: (e) => ({
      feathers: (t, nn) => { const to = P3(t.pos); to.y += 0.8; for (let i = 0; i < e.cr.length; i++) this._feather(e.cr[i].g.position.clone(), to, 0.18 + i * 0.03); },
      dive: (t, idx) => { const q = e.cr[idx % e.cr.length]; q.dive = e.t; q.to = P3(t.pos); this._streakLine(q.g.position.clone(), q.to.clone().setY(q.to.y + 0.6), 0x9ad0ff, 0.6); },
    }) });
  }
  _feather(from, to, t) {
    const e = this._fx('feather', t + 0.25, (e) => { const k = clamp01(e.t / t); if (!m) return; m.position.copy(from).lerp(to, easeOut(k)); m.position.y += Math.sin(k * Math.PI) * 0.3; m.lookAt(to); m.rotateX(Math.PI / 2); m.material.uniforms.uA.value = k >= 1 ? 1 - smooth(t, t + 0.25, e.t) : 1;
      if (k >= 1 && !e.hit) { e.hit = true; this.flash(to, C.inkB, C.ink, 0.35, 0.12, 0.8); } });
    const m = this.pm(e, 'pt_feather', { mode: 0, see: true }); if (m) m.scale.setScalar(0.28);
  }
  _streakLine(a, b, col, life = 0.5) {   // 가늘고 긴 수채 궤적
    const e = this._fx('sline', life, (e) => { m.material.uniforms.uA.value = 0.75 * (1 - smooth(0.2, 1, e.t / life)); });
    const m = this.spr(e, 2, col, col, 3), d = b.clone().sub(a); m.position.copy(a).addScaledVector(d, 0.5); m.scale.set(d.length(), 0.18, 1); this._alignLine(m, d);
  }

  // ------------------------------------------------------------------ 유화·팔레트 기사 (황금 액자에서 걸어 나옴)
  k_knight(s, o) {
    const S = P.knight.size;
    return this._view('knight', s, o, (e) => {
      this._drawing(e, 'knight', s, o.draw || 0.95, { size: 1.9, y: 1.1, fill: 0x3a62d8, ink: 0x2a2030 });
      e.h = 2 * S; e.glowC = C.gold;
      e.root = new THREE.Group(); e.g.add(e.root);
      const add = (n, opt = {}) => { const m = this.pm(e, n, { mode: 1, ...opt }); if (m) { e.body.push(m); e.root.add(m); } return m; };
      e.bodyM = add('pt_knight'); e.sword = add('pt_sword', { glowC: C.gold }); e.shield = add('pt_shield');
      e.frame = this.pm(e, 'pt_frame', { mode: 1, tint: 0xffffff }); if (e.frame) e.g.add(e.frame);   // 액자는 몸과 따로(빠르게 사라짐)
      e.swingT = -9; e.walkT = 0;
    }, (e, dt) => {
      const s = e.s, base = P3(s.pos), yaw = yawOf(s.facing);
      if (s.moving) e.walkT += dt * 9;
      e.root.position.copy(base).addScaledVector(D3(s.facing), -0.6 * (1 - e.dk)); e.root.rotation.set(0, yaw, 0); e.root.scale.setScalar(S);
      e.bodyM.position.set(0, s.moving ? Math.abs(Math.sin(e.walkT)) * 0.03 : 0, 0); e.bodyM.rotation.set(0, 0, s.moving ? Math.sin(e.walkT) * 0.04 : 0);
      const sw = e.t - e.swingT, sk = sw >= 0 && sw < 0.45 ? sw / 0.45 : 1, ang = sk < 1 ? (sk < 0.35 ? -1.2 * easeOut(sk / 0.35) : -1.2 + 2.6 * easeOut((sk - 0.35) / 0.65)) : 0;
      e.sword.position.set(0.28, 0.48, 0.12); e.sword.rotation.set(-0.3 + (sk < 1 ? 1.1 : 0), ang, sk < 1 ? -1.2 : 0); e.sword.scale.setScalar(0.62);
      e.shield.position.set(-0.27, 0.5, 0.12); e.shield.rotation.set(0, -0.5, 0); e.shield.scale.setScalar(0.24);
      // 황금 액자: 그리는 동안 서 있다가, 기사가 나온 뒤 0.35 s 에 사라짐
      if (e.frame) { const fk = 1 - smooth(1, 1.35, e.t / e.drawT); e.frame.visible = fk > 0.01; e.frame.position.copy(base).addScaledVector(D3(s.facing), -0.1); e.frame.position.y = groundY(base.x, -base.z) + 0.05; e.frame.rotation.set(0, yaw, 0); e.frame.scale.setScalar(1.7 * easeBack(clamp01(e.t / 0.25)) * fk); e.frame.material.uniforms.uA.value = fk; }
    }, { col: C.blue, h: (e) => ({
      swing: (q) => { e.swingT = e.t; this._paintArc(P3(e.s.pos), q.f, q.r, q.ang, [C.blue, C.gold, C.red][(e.n = (e.n || 0) + 1) % 3]); for (const p of q.hits) { const at = P3(p); at.y += 0.7; this.flash(at, C.gold, C.goldB, 0.5, 0.14, 0.9); } },
    }) });
  }
  /** 넓은 물감 붓 자국 호(검 궤적·임파스토): 붓 자국 메시를 호를 따라 늘어놓음 */
  _paintArc(c, f, r, ang, col, sweep = 0.16, life = 0.7, o = {}) {
    const n = lite() ? 6 : 10, ms = [], fy = yawOf(f), half = ang * Math.PI / 360;
    const e = this._fx('parc', life, (e) => { ms.forEach((m, i) => { const k = i / (n - 1), at = k * sweep, on = e.t >= at; m.visible = on; if (!on) return; const g = easeOut((e.t - at) / 0.08); m.scale.set(r * 0.55 * g, 1.6, 2.2); m.material.uniforms.uA.value = 1 - smooth(life * 0.55, life, e.t); }); });
    for (let i = 0; i < n; i++) { const k = i / (n - 1), a = fy - half + 2 * half * k, m = this.pm(e, 'pt_stroke', { mode: 1, tint: col, see: true }); if (!m) continue;
      const rr = r * 0.62, x = c.x + Math.sin(a) * rr, z = c.z + Math.cos(a) * rr; m.position.set(x, groundY(x, -z) + 0.05 + (o.lift ?? 0.5), z); m.rotation.set(0, a, 0); m.visible = false; ms.push(m); }
    return e;
  }

  // ------------------------------------------------------------------ 크로키·잔상 모사 (흑백 드로잉 분신)
  k_clone(s, o) {
    const t = o.model, S = P.clone.size * Math.max(0.8, Math.min(1.5, ((t && t.radius) || 0.5) / 0.5));
    return this._view('clone', s, o, (e) => {
      this._drawing(e, 'clone', s, o.draw || 0.7, { size: 1.5, y: 0.9, fill: 0xe8e4dc, ink: 0x2a2a30, paperA: 0.9 });
      e.h = S; e.root = new THREE.Group(); e.g.add(e.root);
      e.fig = this.pm(e, 'pt_croquis', { mode: 2, see: true }); if (e.fig) { e.body.push(e.fig); e.root.add(e.fig); }
      e.walkT = 0;
    }, (e, dt) => {
      const s = e.s, base = P3(s.pos); if (s.moving || s.dash) e.walkT += dt * (s.dash ? 20 : 10);
      e.root.position.copy(base); e.root.rotation.set(0, yawOf(s.facing), 0); e.root.scale.setScalar(S);
      if (e.fig) { e.fig.rotation.set(0.15 * e.atkK + (s.dash ? 0.25 : 0), 0, Math.sin(e.walkT) * 0.05); }
    }, { col: 0x8a8a90, h: (e) => ({
      attack: (t, ok) => { e.atkK = 1; if (ok && t) { const at = P3(t.pos); at.y += 0.6; this.flash(at, 0xe8e8f0, 0x6a6a78, 0.45, 0.12, 0.8); this._sketchMarks(at); } },
      dash: (f, d) => { e.atkK = 1; this._streak(P3(e.s.pos), D3(f), d, 0x9a9aa8); },
      dashHit: (p) => { const at = P3(p); at.y += 0.6; this._sketchMarks(at); },
    }) });
  }
  _sketchMarks(at) {   // 빠르게 겹친 연필 선(타격)
    const n = lite() ? 2 : 4, e = this._fx('sk', 0.3, (e) => { ms.forEach(m => { m.material.uniforms.uA.value = 0.9 * (1 - smooth(0.1, 0.3, e.t)); }); }), ms = [];
    for (let i = 0; i < n; i++) { const m = this.spr(e, 2, 0xf0f0f8, 0x404050, 6); const d = new THREE.Vector3(rnd(-1, 1), rnd(-0.6, 0.6), rnd(-1, 1)); m.position.copy(at); m.scale.set(0.7, 0.07, 1); this._alignLine(m, d); ms.push(m); }
  }

  // ================================================================== 화룡점정
  k_cast_a5(pc, o) {   // 시전 0.8 s: 앞 공중에 두루마리가 펼쳐지고 먹선 용이 그려짐 -> 끝에 눈(금빛 점)
    const dur = o.dur || 0.8, f = D3(o.f || pc.facing), len = Math.min(6.4, (o.len || 12) * 0.5);   // 두루마리는 화면을 덮지 않게(가로 6.4 m, 반투명 종이)
    const e = this._fx('cast_a5', dur + 1.2, (e) => {
      const base = P3(pc.pos), k = clamp01(e.t / dur), mid = base.clone().addScaledVector(f, 2.6); mid.y += 1.9;
      const r = _a.crossVectors(f, UP).normalize(), open = easeOut(clamp01(e.t / 0.22)), fade = e.flownT != null ? 1 - smooth(0, 0.5, e.t - e.flownT) : 1;
      const cu = _b.set(0, 1, 0).applyQuaternion(this.camQ);   // 축은 종이(카메라를 보는 판)의 양 끝에, 종이 높이만큼
      if (rl) rl.position.copy(mid).addScaledVector(this.camR, -len / 2 * open); if (rr) rr.position.copy(mid).addScaledVector(this.camR, len / 2 * open);
      for (const m of [rl, rr]) { if (!m) continue; m.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), cu); m.scale.set(len / 4 * 1.05, 1.4, 1.4); m.material.uniforms.uA.value = fade; }
      pp.position.copy(mid); pp.quaternion.copy(this.camQ); pp.scale.set(len * open, len / 4, 1);
      const u = pp.material.uniforms; u.uP1.value = smooth(0.1, 0.85, k); u.uP2.value = smooth(0.35, 0.95, k); u.uA.value = fade * smooth(0, 0.1, e.t);
      // 눈: 붓끝에서 마지막 점 — 시전 끝에 금빛으로 번쩍
      const eye = mid.clone().addScaledVector(r, len * 0.38); eye.y += 0.25; ey.quaternion.copy(this.camQ); ey.position.copy(eye).addScaledVector(this.toCam, 0.05);
      ey.scale.setScalar(k >= 0.98 ? 0.6 + 0.3 * Math.sin(e.t * 30) : 0.12 * smooth(0.9, 1, k)); ey.material.uniforms.uA.value = (k >= 0.98 ? 1.2 : 0.6) * fade;
    });
    const pp = this.paper(e, 'dragon', { asp: 4, fill: 0x2a2436, order: 3, paper: 0.7 }), rl = this.pm(e, 'pt_rod', { mode: 1 }), rr = this.pm(e, 'pt_rod', { mode: 1 }), ey = this.spr(e, 3, C.gold, C.goldB, 7);
    return this._h(e, { cancel: () => this._end(e, 0.3), flown: () => { e.flownT = e.t; } });
  }
  k_dragon(o3, o) {   // 용: 머리 + 마디가 머리 길을 따라감(뱀처럼), 먹 꼬리. 관통·숨결은 규칙이 정한 순간
    const f = D3(o.f), start = P3(o3), len = o.len || 12, N = lite() ? 10 : P.dragon.segs, S = P.dragon.size, hist = [];
    if (o.pre && o.pre.flown) o.pre.flown();
    let s = 0, ended = null;
    const e = this._fx('dragon', 9, (e, dt) => {
      const fade = ended != null ? 1 - smooth(0, 0.6, e.t - ended) : 1; if (ended != null && fade <= 0) { this._free(e); return; }
      const up = 1.6 + 0.9 * Math.sin(clamp01(s / len) * Math.PI) * (1 - (ended != null ? 1 : 0) * 0), wig = Math.sin(e.t * 9) * 0.5;
      const hp = start.clone().addScaledVector(f, s - 0.5 + (ended != null ? (e.t - ended) * 6 : 0)); hp.y += up; const rgt = _a.crossVectors(f, UP).normalize(); hp.addScaledVector(rgt, wig * 0.6);
      hist.unshift(hp.clone()); if (hist.length > 160) hist.pop();
      head.position.copy(hp); head.lookAt(hp.clone().add(f)); head.scale.setScalar(S * smooth(0, 0.12, e.t)); head.material.uniforms.uA.value = fade; head.material.uniforms.uDraw.value = smooth(0, 0.25, e.t);
      { let acc = 0, j = 0; segs.forEach((m, i) => { const want = (i + 1) * P.dragon.gap;   // 머리 길을 따라 일정한 간격(호 길이)으로 — 염주처럼 끊기지 않게
        while (j < hist.length - 1 && acc + hist[j].distanceTo(hist[j + 1]) < want) { acc += hist[j].distanceTo(hist[j + 1]); j++; }
        const p = hist[j], p2 = hist[Math.max(0, j - 1)]; m.position.copy(p); if (p2 && p2.distanceToSquared(p) > 1e-6) m.lookAt(p2);
        const ss = S * (0.4 - 0.24 * i / N); m.scale.setScalar(ss * smooth(0.03 * i, 0.03 * i + 0.15, e.t)); m.material.uniforms.uA.value = fade; m.material.uniforms.uDraw.value = smooth(0.03 * i, 0.03 * i + 0.25, e.t); }); }
      // 먹 꼬리(번지는 먹 연기)
      e.tr = (e.tr || 0) - dt; if (e.tr <= 0 && ended == null) { e.tr = lite() ? 0.08 : 0.04; this._puffs(hist[Math.min(hist.length - 1, 12)].clone(), 1, 0.3, { c1: 0x3a3448, c2: 0x0e0c14, a: 0.45, life: 0.6, rise: 0.1 }); }
    });
    const head = this.pm(e, 'pt_dragon_head', { mode: 0, glowC: C.gold, glow: 0.15 }), segs = []; for (let i = 0; i < N; i++) { const m = this.pm(e, 'pt_dragon_seg', { mode: 0 }); if (m) segs.push(m); }
    e.body = [head, ...segs];
    return this._h(e, {
      head: (ss) => { s = ss; },
      pierce: (hits) => { for (const p of hits) { const at = P3(p); at.y += 0.7; this.flash(at, C.inkB, C.ink, 0.8, 0.16, 1.0); this.drops(at, lite() ? 3 : 6, C.ink, { life: 0.5 }); } },
      breath: (c, q) => { const at = P3(c); this._inkBurst(at, q.r); for (const p of q.hits) { const t = P3(p); t.y += 0.6; this.flash(t, C.inkB, C.ink, 0.6, 0.16, 1.0); } },
      end: () => { if (ended == null) ended = e.t; },
    });
  }
  _inkBurst(at, r) {   // 먹물 숨결: 바닥 먹 번짐(실제 반경) + 낮은 먹 연기 + 방울
    const life = 1.1, e = this._fx('inkburst', life, (e) => { const k = e.t / life; d.material.uniforms.uP.value = easeOut(k / 0.25); d.material.uniforms.uA.value = 0.9 * (1 - smooth(0.5, 1, k)); });
    const d = this.pg(e, 1, 0x4a4a68, 0x0e0c14, 1); d.position.copy(at).setY(groundY(at.x, -at.z) + 0.04); d.scale.setScalar(r);
    this._puffs(at.clone(), lite() ? 5 : 9, r, { c1: 0x3a3448, c2: 0x0e0c14, a: 0.55, life: 0.8, rise: 0.4 });
    this.drops(at.clone().setY(at.y + 0.6), lite() ? 5 : 10, C.ink, { speed: 2.0, life: 0.7 });
    this.ring(at, r, 0x8a8ab0, 0x2a2a40, 0.4, 0.9, 0.3);
  }

  // ================================================================== B1 임파스토
  k_impasto(pc, o) {
    const f = D3(o.f), r = o.r || 4, base = P3(pc.pos);
    const arc = this._paintArc(base, o.f, r, o.ang || 80, C.red, o.sweep || 0.12, 0.75, { lift: 0.3 });
    return this._h(this._fx('impasto', 0.8, () => {}), {
      hit: (p, ok) => { const at = P3(p); at.y += 0.6; if (!ok) return; this.flash(at, C.ember, C.red, 0.55, 0.14, 0.9);
        const st = this._fx('ipatch', 0.9, (e) => { m && (m.material.uniforms.uA.value = 1 - smooth(0.5, 0.9, e.t)); }); const m = this.pm(st, 'pt_stroke', { mode: 1, tint: C.red, see: true });
        if (m) { m.position.copy(at).setY(groundY(at.x, -at.z) + 0.05); m.rotation.set(0, rnd(0, 3), 0); m.scale.set(1.0, 2.4, 2.0); }
        if (!lite()) this.motes(at, 5, { w: C.ember, b: C.emberB, r: 0.3, up: 1.2, life: 0.6 }); },
      miss: () => { void arc; void f; },
    });
  }
  // ================================================================== B2 워터컬러
  k_wash(o3, o) {
    const f = D3(o.f), start = P3(o3), w = o.w || 2.2; let s = 0.3, ended = null; const yaw = yawOf(o.f);
    const e = this._fx('wash', 9, (e) => {
      const fk = ended != null ? 1 - smooth(0, 0.5, e.t - ended) : 1; if (ended != null && fk <= 0) { this._free(e); return; }
      const front = start.clone().addScaledVector(f, s); front.y = groundY(front.x, -front.z) + 0.06;
      band.position.copy(front).addScaledVector(f, -1.2); band.rotation.set(0, yaw + Math.PI, 0); band.scale.set(w, 1, 2.4); band.material.uniforms.uA.value = 1.0 * fk; band.material.uniforms.uT.value = e.t;
      crest.position.copy(front).setY(front.y + 0.25); crest.quaternion.copy(this.camQ); crest.scale.set(w * 1.1, 0.6, 1); crest.material.uniforms.uA.value = 0.75 * fk;
      e.bl = (e.bl || 0) - (e.dt || 0.016); if (e.bl <= 0 && ended == null) { e.bl = 0.07; this._bleed(front.clone().addScaledVector(f, -0.6), w * 0.5); }
      const rgt = _a.crossVectors(f, UP).normalize();   // 파도 앞부분: 살짝 말린 투명한 청색 물감 띠(붓 자국 메시 셋)
      lips.forEach((m, i) => { m.position.copy(front).addScaledVector(rgt, (i - 1) * w / 3).addScaledVector(f, -0.1 - 0.15 * Math.abs(i - 1)); m.position.y += 0.08 + 0.05 * Math.sin(e.t * 12 + i); m.rotation.set(0, yaw, 0); m.rotateX(-0.5); m.scale.set(w / 3 * 1.15, 3.2, 2.4); m.material.uniforms.uA.value = 0.72 * fk; });
    });
    const lips = [0, 1, 2].map(() => this.pm(e, 'pt_stroke', { mode: 1, tint: 0x5a9aff, see: true })).filter(Boolean);
    const band = this._m(e, 'wv', this.waveGeo, 3); band.material.uniforms.uW.value.setHex(0xe8f4ff); band.material.uniforms.uB.value.setHex(0x2a62f0);
    const crest = this.puff(e, 0xe8f4ff, C.blue, 4);
    return this._h(e, { front: (ss) => { s = ss; }, splash: (p, ok) => { const at = P3(p); at.y += 0.4; if (ok) this.drops(at, lite() ? 3 : 6, C.blue, { speed: 1.2, up: 1.2, life: 0.5 }); }, end: () => { if (ended == null) ended = e.t; } });
  }
  _bleed(at, r) {   // 파도 뒤 옅은 번짐(장식, 무피해)
    const life = 1.4, e = this._fx('bleed', life, (e) => { d.material.uniforms.uA.value = 1.0 * (1 - smooth(0.3, 1, e.t / life)); });
    const d = this.pg(e, 3, 0x7aa4ff, C.blueB, 1); d.position.copy(at).setY(groundY(at.x, -at.z) + 0.03 + rnd(0, 0.01)); d.scale.setScalar(r * rnd(0.8, 1.1));
  }
  // ================================================================== B3 포인틸리즘
  k_dots(c, o) {
    const c3 = P3(c), rings = o.rings || [2.4, 1.7, 1.0], N = lite() ? Math.round((o.n || 18) * 0.6) : (o.n || 18), per = Math.ceil(N / rings.length), ds = [];
    const e = this._fx('dots', (o.start || 0.3) + rings.length * (o.gap || 0.15) + 1.0, (e) => {
      for (const d of ds) { const on = e.t >= d.at; d.m.visible = on; if (!on) continue; const k = (e.t - d.at) / 0.1, pop = d.burst != null ? 1 + 1.6 * easeOut((e.t - d.burst) / 0.15) : easeBack(k);
        d.m.scale.setScalar(d.s * pop); d.m.material.uniforms.uA.value = d.burst != null ? 1 - smooth(0, 0.18, e.t - d.burst) : 1; d.m.material.uniforms.uGlow.value = d.burst != null ? 0.8 : 0.3; }
      gr.material.uniforms.uA.value = 0.6 * (1 - smooth(o.start + rings.length * o.gap + 0.3, o.start + rings.length * o.gap + 0.6, e.t));
    });
    // 점은 붓끝 튕김(0~start)에 맞춰 바깥 고리부터 차례로 찍힘
    rings.forEach((rr, ri) => { for (let i = 0; i < per; i++) { const a = i / per * 6.283 + ri * 0.4, x = c3.x + Math.cos(a) * rr * 0.92, z = c3.z + Math.sin(a) * rr * 0.92, m = this.pm(e, 'pt_dot', { mode: 1, tint: C.gold, glowC: C.gold }); if (!m) continue;
      m.position.set(x, groundY(x, -z) + 0.05, z); ds.push({ m, ring: ri, at: (ri * per + i) / (rings.length * per) * (o.start || 0.3), s: 0.11 + 0.04 * (rings.length - ri) }); } });
    const cen = this.pm(e, 'pt_dot', { mode: 1, tint: C.gold, glowC: C.gold }); if (cen) { cen.position.copy(c3).setY(groundY(c3.x, -c3.z) + 0.06); ds.push({ m: cen, ring: rings.length, at: o.start || 0.3, s: 0.26 }); }
    const gr = this.pg(e, 2, C.gold, C.goldB, 1); gr.position.copy(c3).setY(groundY(c3.x, -c3.z) + 0.04); gr.scale.setScalar(rings[0]);
    return this._h(e, {
      burst: (i, hits) => { for (const d of ds) if (d.ring === i && d.burst == null) d.burst = e.t; this.ring(c3, rings[i], C.gold, C.goldB, 0.25, 1.0, 0.85); for (const p of hits) { const at = P3(p); at.y += 0.6; this.flash(at, C.gold, C.goldB, 0.4, 0.12, 0.8); } },
      final: (i, hits) => { for (const d of ds) if (d.burst == null) d.burst = e.t; this.flash(c3.clone().setY(c3.y + 0.5), C.gold, C.goldB, 1.3, 0.2, 1.1); this.ring(c3, 1.1, C.gold, C.goldB, 0.35, 1.3, 0.2); if (!lite()) this.motes(c3, 10, { w: C.gold, b: C.goldB, r: 0.6, up: 1.5, life: 0.7 }); void hits; void i; },
    });
  }
  // ================================================================== B4 팔레트 퓨전
  k_fusion(c, o) {
    const c3 = P3(c), top = c3.clone().addScaledVector(this.toCam.clone().setY(0).normalize(), 1.2).setY(c3.y + 1.3), fl = [], life = 1.2;   // 팔레트는 이름표·체력 막대 아래 카메라 쪽
    const e = this._fx('fusion', life, (e) => {
      const k = e.t / life;
      for (const q of fl) { const kk = clamp01((e.t - q.d) / 0.3); q.m.position.copy(q.p0).lerp(top, easeOut(kk)); q.m.position.y += Math.sin(kk * Math.PI) * 0.5; q.m.scale.setScalar(0.06 * (1 - 0.5 * kk)); q.m.material.uniforms.uA.value = 1 - smooth(0.32, 0.4, e.t - q.d); }
      if (pal) { pal.position.copy(top); pal.rotation.set(0.5, e.t * 4, 0); pal.scale.setScalar(0.7 * easeBack(clamp01(e.t / 0.2)) * (1 - smooth(0.55, 0.7, e.t))); pal.material.uniforms.uA.value = 1; }
      // 꽃처럼 펼쳐짐(0.45 s): 색 꽃잎이 범위 안으로
      petals.forEach((p, i) => { const kk = clamp01((e.t - 0.45) / 0.35); p.visible = e.t >= 0.45; const a = i / petals.length * 6.283; p.position.set(c3.x + Math.cos(a) * o.r * 0.45 * easeOut(kk), groundY(c3.x, -c3.z) + 0.07, c3.z - Math.sin(a) * o.r * 0.45 * easeOut(kk)); p.rotation.set(0, a, 0); p.scale.set(o.r * 0.95 * easeOut(kk), 2.0, 3.2 * easeOut(kk)); p.material.uniforms.uA.value = 0.9 * (1 - smooth(0.75, 1, k)); });
    });
    for (const pk of o.picks || []) for (const col of pk.cols) { const m = this.pm(e, 'pt_drop', { mode: 1, tint: COLOR_HEX[col] }); if (m) fl.push({ m, p0: P3(pk.pos).setY((pk.pos.y || 0) + 0.9), d: rnd(0, 0.1) }); }
    const pal = this.pm(e, 'pt_palette', { mode: 1 }), petals = []; const pc = [C.red, C.blue, C.gold, C.violet, C.red, C.blue];
    for (let i = 0; i < (lite() ? 4 : 6); i++) { const p = this.pm(e, 'pt_stroke', { mode: 1, tint: pc[i], see: true }); if (p) { p.geometry = this.geo.pt_stroke; petals.push(p); } }
    this.ring(c3, o.r, C.violet, C.violetB, 0.6, 0.8, 0.95);
    return this._h(e, {
      react: (kind, p) => { const at = P3(p); at.y += 0.5;
        if (kind === 'steam') this._puffs(at, lite() ? 4 : 7, 1.6, { c1: 0xf8f0ff, c2: 0xb070c0, a: 0.6, life: 0.7, rise: 0.8 });
        else if (kind === 'wave') this.ring(at.clone().setY(at.y - 0.45), 3.5, C.blue, C.gold, 0.5, 1.0, 0.1);
        else if (kind === 'core') this.flash(at, C.gold, C.red, 1.0, 0.18, 1.2);
        else if (kind === 'tri') { this.flash(at, 0xffffff, C.violet, 1.1, 0.2, 1.0); this.ring(at.clone().setY(at.y - 0.45), 1.6, C.red, C.blue, 0.4, 1.0, 0.2); this.ring(at.clone().setY(at.y - 0.45), 3.5, C.gold, C.goldB, 0.5, 0.8, 0.1); }
      },
    });
  }
  // ================================================================== B5 스펙트럼 걸작
  k_cast_b5(pc, o) {   // 공중 추상화: 빨·파·금 붓 자국이 모여 원을 이룸(시전 동안)
    const dur = o.dur || 0.6, n = lite() ? 6 : 12, ms = [], cols = [C.red, C.blue, C.gold];
    const e = this._fx('cast_b5', dur + 1, (e) => {
      const top = P3(pc.pos).setY((pc.pos.y || 0) + 3.2), k = clamp01(e.t / dur), fade = e.doneT != null ? 1 - smooth(0, 0.3, e.t - e.doneT) : 1;
      ms.forEach((m, i) => { const a = i / n * 6.283 + e.t * 2, rr = 0.9 * (1 - 0.45 * k); m.position.set(top.x + Math.cos(a) * rr, top.y + Math.sin(a * 2) * 0.15, top.z + Math.sin(a) * rr); m.rotation.set(0.8, -a, 0); m.scale.set(0.9 * smooth(i / n * 0.6, i / n * 0.6 + 0.2, k), 1.4, 1.8); m.material.uniforms.uA.value = fade; });
    });
    for (let i = 0; i < n; i++) { const m = this.pm(e, 'pt_stroke', { mode: 1, tint: cols[i % 3], see: true }); if (m) ms.push(m); }
    return this._h(e, { cancel: () => this._end(e, 0.3), done: () => { e.doneT = e.t; } });
  }
  k_spectrum(pc, o) {
    if (o.pre && o.pre.done) o.pre.done();
    const c3 = P3(pc.pos), r = o.r || 6, kinds = o.kinds || [], cols = kinds.length ? kinds.map(k => COLOR_HEX[k]) : [C.violet, C.white], life = 1.0;
    const e = this._fx('spectrum', life, (e) => { const k = e.t / life; rings.forEach((m, i) => { const kk = clamp01((e.t - i * 0.06) / 0.5); m.material.uniforms.uP.value = easeOut(kk); m.material.uniforms.uA.value = 0.6 * (1 - smooth(0.45, 1, k)); }); });
    const rings = cols.map((col, i) => { const m = this.pg(e, 0, col, col, 1 + i); m.position.copy(c3).setY(groundY(c3.x, -c3.z) + 0.04 + i * 0.01); m.scale.setScalar(r * (1 - i * 0.08)); return m; });
    this._paintArc(c3, pc.facing, r * 0.9, 360, cols[0], 0.3, 0.9, { lift: 0.06 });
    for (let i = 0; i < cols.length; i++) this.ring(c3, r, cols[i], cols[i], 0.5 + i * 0.1, 0.9, 0.15);
    return this._h(e, { core: (cr) => { this.flash(c3.clone().setY(c3.y + 0.6), C.gold, C.goldB, 1.4, 0.2, 1.0); this.ring(c3, cr, C.gold, C.goldB, 0.35, 1.2, 0.2); },
      land: (c, rr) => { const at = P3(c); this.ring(at, rr, C.violet, C.violetB, 0.45, 1.1, 0.3); } });
  }

  // ================================================================== C1 꽃의 들판
  k_meadow(c, o) {
    const c3 = P3(c), r = o.r || 3, grow = o.grow || 0.6, N = lite() ? 8 : 16, fl = [], cols = [0xffb8d8, 0xfff0a0, 0xb8d8ff, 0xffffff, 0xffc890];
    const e = this._fx('meadow', (o.dur || 8) + 0.6, (e) => {
      const fk = this._fadeK(e), u = wash.material.uniforms; u.uP.value = easeOut(clamp01(e.t / grow)); u.uA.value = fk; u.uT.value = e.t;
      rim.material.uniforms.uA.value = 0.55 * fk * smooth(0, grow, e.t); rim.material.uniforms.uT.value = e.t;
      fl.forEach((q, i) => { const k = clamp01((e.t - grow * 0.5 - i * 0.03) / 0.35); q.st.visible = q.fw.visible = k > 0.02; q.st.scale.set(0.5, 0.55 * easeOut(k) * q.s, 0.5); q.st.material.uniforms.uA.value = fk; q.fw.position.copy(q.p).setY(q.p.y + 0.55 * easeOut(k) * q.s); q.fw.scale.setScalar(0.42 * q.s * easeBack(clamp01((e.t - grow * 0.5 - i * 0.03 - 0.25) / 0.3))); q.fw.rotation.set(0.2, e.t * 0.3 + i, 0); q.fw.material.uniforms.uA.value = fk; });
    });
    const wash = this.pg(e, 0, 0xd8f8b0, C.greenB, 1); wash.position.copy(c3).setY(groundY(c3.x, -c3.z) + 0.035); wash.scale.setScalar(r);
    const rim = this.pg(e, 2, C.green, C.greenB, 2); rim.position.copy(c3).setY(groundY(c3.x, -c3.z) + 0.045); rim.scale.setScalar(r);
    for (let i = 0; i < N; i++) { const a = rnd(0, 6.283), rr = Math.sqrt(rnd(0.05, 0.92)) * r, x = c3.x + Math.cos(a) * rr, z = c3.z + Math.sin(a) * rr, p = new THREE.Vector3(x, groundY(x, -z), z);
      const st = this.pm(e, 'pt_stem', { mode: 1 }), fw = this.pm(e, 'pt_flower', { mode: 1, tint: cols[i % cols.length], see: true }); if (!st || !fw) continue; st.position.copy(p); fl.push({ st, fw, p, s: rnd(0.8, 1.25) }); }
    if (o.extra) this.ring(c3, r, C.gold, C.goldB, 0.6, 0.8, 0.9);   // 마스터의 구도: 가장자리 보조 붓선 한 번 더
    return this._h(e, {
      pulse: (healed) => { const lim = lite() ? 2 : 4; healed.slice(0, 4).forEach((p, j) => { const to = P3(p); to.y += 0.9; fl.slice(j * 2, j * 2 + lim).forEach(q => this.motes(q.fw.position.clone(), 1, { w: 0xfff8c0, b: C.green, to, life: 0.55, r: 0.05, a: 1.0 })); }); },
      gallery: () => { this.ring(c3, r, C.gold, C.goldB, 0.6, 1.2, 0.2); },
      end: () => this._end(e, 0.6), extend: () => { }, pulseRing: () => { },
    });
  }
  // ================================================================== C2 백색 성벽
  k_wall(c, o) {
    const c3 = P3(c), f = D3(o.f), w = o.w || 3.4, grow = o.grow || 0.5, yaw = yawOf(o.f), H = P.wallH;
    let crack = 0, endT = null, why = '';
    const e = this._fx('wall', 1e9, (e) => {
      const gy = groundY(c3.x, -c3.z);
      // 0 .. 0.5 grow: 보조선·윤곽(바닥), 그 뒤 흰 물감이 채워지며 접히듯 일어섬(경첩 = 바닥 앞 모서리), 끝나면 반대로 눕고 지워짐
      const up = endT == null ? easeOut(clamp01((e.t - grow * 0.6) / 0.35)) : 1 - easeOut(clamp01((e.t - endT) / 0.35)), gone = endT != null ? smooth(0.35, 0.7, e.t - endT) : 0;
      guide.position.set(c3.x, gy + 0.04, c3.z); guide.rotation.set(0, yaw, 0); guide.scale.set(w * 0.55, 1, 1.4); guide.material.uniforms.uP.value = clamp01(e.t / (grow * 0.8)); guide.material.uniforms.uA.value = (1 - up * 0.7) * (1 - gone);
      if (wall) { wall.position.set(c3.x, gy, c3.z).addScaledVector(f, -0.15); wall.rotation.set(0, yaw + Math.PI, 0); wall.rotateX(-(1 - up) * Math.PI / 2 * 0.98); wall.scale.set(w, H * Math.max(0.02, up > 0 ? 1 : 0.02), 1.6);
        const u = wall.material.uniforms; u.uDraw.value = Math.max(0.0001, smooth(grow * 0.3, grow * 0.9, e.t) * (1 - gone)); u.uY0.value = gy - 0.05; u.uH.value = H;
        // 카메라를 가리면(벽 뒤에 플레이어) 반투명
        let a = 1; try { const pl = window.G.player; if (pl) { const pp = P3(pl.pos), d = pp.clone().sub(c3); const along = d.dot(_b.copy(this.toCam).setY(0).normalize()), lat = Math.abs(d.dot(_a.crossVectors(_b, UP).normalize())); if (along < 0 && along > -3.5 && lat < w / 2 + 0.8) a = 0.42; } } catch (er) { /* no player */ }
        u.uA.value += (a - u.uA.value) * 0.2; u.uGlow.value = 0.1 * crack; u.uGlowC.value.setHex(0x9a8a7a); }
      if (gone >= 1) this._free(e);
    });
    const guide = this.pg(e, 4, 0x8a96c8, 0x3a3a60, 1), wall = this.pm(e, 'pt_wall', { mode: 1, see: true });
    if (wall) e.body = [wall];
    if (o.extra) this.ring(c3, w / 2, C.gold, C.goldB, 0.6, 0.7, 0.9);
    return this._h(e, {
      crack: (k) => { crack = k; },
      block: (p) => { const at = P3(p); at.y += 1.0; this.flash(at, 0xffffff, 0x8a8aa0, 0.5, 0.12, 0.7); if (!lite()) this.drops(at, 3, 0xf4f0e8, { life: 0.4 }); },
      gallery: () => { this.flash(c3.clone().setY(c3.y + 1.2), C.gold, C.goldB, 1.2, 0.2, 0.8); },
      pulse: () => { this.ring(c3, w / 2 + 0.5, C.violet, C.violetB, 0.4, 0.8, 0.3); },
      end: (w2) => { if (endT == null) { endT = e.t; why = w2; if (why === 'break') this.drops(c3.clone().setY(c3.y + 1), lite() ? 4 : 8, 0xf4f0e8, { speed: 1.4, life: 0.6 }); } void why; },
    });
  }
  // ================================================================== C3 뇌운의 캔버스
  k_storm(c, o) {
    const c3 = P3(c), r = o.r || 3, grow = o.grow || 0.5, H = P.cloudH, N = lite() ? 12 : 24, drops = [];
    const e = this._fx('storm', (o.dur || 7) + 0.8, (e, dt) => {
      const fk = this._fadeK(e), gy = groundY(c3.x, -c3.z), k = clamp01(e.t / grow);
      // 작은 화폭(공중)에서 먹구름이 그려지고 -> 흘러나와 영역 위 높게 머묾
      const cv = c3.clone().setY(gy + 2.2); this._face(pp, cv, 1.4, 1.4); pp.material.uniforms.uP1.value = easeOut(k / 0.6); pp.material.uniforms.uP2.value = smooth(0.3, 0.9, k); pp.material.uniforms.uA.value = (1 - smooth(0.85, 1.2, e.t / grow)) * fk;
      const ck = smooth(0.5, 1, k); if (cl) { cl.position.copy(c3).setY(gy + 2.2 + (H - 2.2) * ck); cl.scale.set(r * 0.7 * (0.3 + 0.7 * ck), r * 0.4 * (0.3 + 0.7 * ck), r * 0.7 * (0.3 + 0.7 * ck)); cl.rotation.y = e.t * 0.1; cl.material.uniforms.uA.value = 0.82 * fk; cl.material.uniforms.uDraw.value = Math.max(0.001, ck); cl.material.uniforms.uY0.value = gy + 2; cl.material.uniforms.uH.value = 3; }
      rim.material.uniforms.uA.value = 0.5 * fk * ck; rim.position.set(c3.x, gy + 0.04, c3.z);
      // 장식 빗방울(투사체 아님): 범위 안에서 떨어지는 가는 선
      for (const d of drops) { d.y -= dt * 9; if (d.y < gy) { const a = rnd(0, 6.283), rr = Math.sqrt(rnd(0, 1)) * r * 0.95; d.x = c3.x + Math.cos(a) * rr; d.z = c3.z + Math.sin(a) * rr; d.y = gy + H - 0.3; }
        d.m.visible = ck > 0.5 && fk > 0.05; d.m.position.set(d.x, d.y, d.z); d.m.rotation.set(0, 0, 0); d.m.scale.set(0.018, 0.2, 0.018); d.m.material.uniforms.uA.value = 0.75 * fk; }
    });
    const pp = this.paper(e, 'cloud', { fill: 0x3a3a50, ink: 0x14121c }), cl = this.pm(e, 'pt_cloud', { mode: 0, see: true }), rim = this.pg(e, 2, 0x8a9ad8, 0x3a3a60, 1); rim.scale.setScalar(r);
    for (let i = 0; i < N; i++) { const m = this.pm(e, 'pt_drop', { mode: 3, tint: 0x6a8ad8, see: true }); if (m) drops.push({ m, x: c3.x, y: -99, z: c3.z }); }   // 장식 빗방울(투사체 아님) — 밝은 바닥에서도 보이게 알파 혼합
    if (o.extra) this.ring(c3, r, C.gold, C.goldB, 0.6, 0.7, 0.9);
    return this._h(e, {
      rain: () => { },
      bolt: (p, hits) => { const at = P3(p), gy = groundY(at.x, -at.z), top = new THREE.Vector3(at.x, gy + H, at.z); this._bolt(top, at.clone().setY(gy)); this.flash(at.clone().setY(gy + 0.4), 0xe8f0ff, 0x6a8aff, 1.0, 0.14, 1.0); this.ring(at.clone().setY(gy), 1.2, 0xc8d8ff, 0x3a4a8a, 0.3, 1.0, 0.2); for (const q of hits) { const t = P3(q); t.y += 0.6; this.flash(t, 0xe8f0ff, 0x6a8aff, 0.5, 0.12, 0.8); } },
      gallery: () => { this.ring(c3, r, C.gold, C.goldB, 0.6, 1.0, 0.2); },
      pulse: () => { this.ring(c3, r, C.violet, C.violetB, 0.4, 0.8, 0.3); },
      end: () => this._end(e, 0.6),
    });
  }
  _bolt(top, bot) {   // 번개: 꺾인 먹빛 선 몇 개(0.14 s)
    const n = 5, ms = [], e = this._fx('bolt', 0.18, (e) => { ms.forEach(m => { m.material.uniforms.uA.value = 1.2 * (1 - smooth(0.05, 0.18, e.t)); }); });
    let a = top.clone(); for (let i = 1; i <= n; i++) { const b = top.clone().lerp(bot, i / n); if (i < n) { b.x += rnd(-0.35, 0.35); b.z += rnd(-0.35, 0.35); } const m = this.spr(e, 2, 0xf0f4ff, 0x5a6aff, 7), d = b.clone().sub(a); m.position.copy(a).addScaledVector(d, 0.5); m.scale.set(d.length() * 1.05, 0.22, 1); this._alignLine(m, d); ms.push(m); a = b; }
  }
  k_warn(p, o) {   // 번개 예고: 바닥 먹빛 얼룩이 자람(위치·시간 = 실제 번개)
    const at = P3(p), t = o.t || 0.45, r = o.r || 1.2;
    const e = this._fx('warn', t + 0.3, (e) => { const k = clamp01(e.t / t), f = e.struck != null ? 1 - smooth(0, 0.2, e.t - e.struck) : 1; d.material.uniforms.uP.value = 0.3 + 0.7 * easeOut(k); d.material.uniforms.uA.value = (0.9 + 0.6 * k) * f; rg.material.uniforms.uA.value = 0.9 * f; if (e.struck != null && e.t - e.struck > 0.2) this._free(e); });
    const d = this.pg(e, 1, 0x4a4a70, 0x0a0812, 2); d.position.copy(at).setY(groundY(at.x, -at.z) + 0.05); d.scale.setScalar(r);
    const rg = this.pg(e, 2, 0x2a2a48, 0x0a0812, 2); rg.position.copy(d.position).setY(d.position.y + 0.005); rg.scale.setScalar(r);
    return this._h(e, { strike: () => { e.struck = e.t; }, cancel: () => { e.struck = e.t; } });
  }
  // ================================================================== C5 만상갤러리
  k_cast_c5(pc, o) {   // 등 뒤 반투명 화폭 3장(뒤로 1.7 m·높이 1.5 m — 몸을 가리지 않게)
    const dur = o.dur || 0.5, fs = [];
    const e = this._fx('cast_c5', dur + 1.6, (e) => {
      const base = P3(pc.pos), f = this.toCam.clone().setY(0).normalize().negate(), r = _a.crossVectors(f, UP).normalize().clone(), fade = e.doneT != null ? 1 - smooth(0.8, 1.4, e.t - e.doneT) : 1;
      fs.forEach((m, i) => { const k = easeBack(clamp01((e.t - i * 0.08) / 0.3)); m.position.copy(base).addScaledVector(f, 1.6).addScaledVector(r, (i - 1) * 1.3); m.position.y += 1.2 + (i === 1 ? 0.3 : 0); m.rotation.set(0, Math.atan2(-f.x, -f.z) + (i - 1) * -0.35, 0); m.scale.setScalar(0.95 * k); m.material.uniforms.uA.value = 0.75 * fade; m.material.uniforms.uGlow.value = e.doneT != null ? 0.4 * (1 - smooth(0, 0.6, e.t - e.doneT)) : 0.1; });
      for (const p of pp) { p.m.position.copy(fs[p.i] ? fs[p.i].position : base); p.m.position.y += 0.62; p.m.quaternion.copy(this.camQ); p.m.scale.set(0.85 * clamp01(e.t / 0.3), 1.1 * clamp01(e.t / 0.3), 1); p.m.material.uniforms.uA.value = 0.55 * fade * smooth(0, 0.3, e.t); p.m.material.uniforms.uP2.value = clamp01(e.t / dur); p.m.material.uniforms.uP1.value = 1; }
    });
    for (let i = 0; i < 3; i++) { const m = this.pm(e, 'pt_frame', { mode: 1, see: true, glowC: C.gold }); if (m) fs.push(m); }
    const pp = ['meadow', 'wall', 'cloud'].map((k, i) => ({ i, m: this.paper(e, k === 'meadow' ? 'flower' : k, { fill: [C.green, C.white, 0x5a6a9a][i], paper: 0.6 }) }));
    return this._h(e, { cancel: () => this._end(e, 0.3), done: () => { e.doneT = e.t; } });
  }
  k_gallery(pc, o) {   // 작품마다 금빛 붓선(등 뒤 화폭 -> 작품)
    if (o.pre && o.pre.done) o.pre.done();
    const from = P3(pc.pos).setY((pc.pos.y || 0) + 1.6);
    for (const p of (o.works || []).slice(0, lite() ? 4 : 8)) { const to = P3(p); to.y = groundY(to.x, -to.z) + 0.6; this._streakLine(from, to, C.gold, 0.8); this.flash(to, C.gold, C.goldB, 0.7, 0.2, 0.9); }
    this.ring(P3(pc.pos), 1.4, C.gold, C.goldB, 0.5, 1.0, 0.2);
    return null;
  }
}
