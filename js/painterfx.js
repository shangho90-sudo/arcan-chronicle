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
// fx2(2026-11-17 '더 화려하게' — 라그나로크·테일즈위버·씰 분위기만 참고): 모든 스킬에 층을 더함 — (1) 시전 준비: 발밑 화가 마법진 psig(색상환·먹 원상·액자 보조선·점묘
// 고리 + 금테, 알파 혼합) + 붓끝으로 빨려 드는 반짝이 (2) 본체: Tripo 소환물(먹물 늑대·색종이 학·유화 기사·먹 용 머리 — assets/fx/fx_painter_tripo.glb.json,
// 없으면 절차 메시), 용 몸통은 매 프레임 관 메시(애벌레 같은 구슬 마디 대신), 물감 리본 꼬리, 인스턴스 입자(HerbalFx 의 HParts 재사용 — 별·꽃잎·방울·깃털·붓 조각, 종류당
// draw call 1) (3) 명중: 섬광 + 퍼지는 고리 + 네 갈래 별 + 통통한 3D 별(pang) + 물감 왕관 튐 (4) 잔광: 천천히 사라지는 마법진·반짝이. 큰 것은 실제 판정 반경 안,
// 가산 색은 블룸 문턱 아래, 전역 히트스톱·흔들림 없음(카메라 kick 은 규칙 js/painter.js 만), 저사양은 입자 수만(HERBFX.liteK).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { gfxOn } from './gfxq.js';
import { HerbalFx, HERBFX } from './herbalfx.js';

export const PAINTFX = {
  intensity: 1.0,
  col: { red: 0xe8343c, redB: 0x8a0e18, blue: 0x4a8cff, blueB: 0x1a3aa8, gold: 0xffd24a, goldB: 0xc07a10, green: 0x9ae070, greenB: 0x3a8a30,
    ink: 0x1a1622, inkB: 0x4a4a68, white: 0xfffaf0, whiteB: 0xb8b4c8, paper: 0xf6eedc, violet: 0xd070ff, violetB: 0x6a2aa8, ember: 0xffa040, emberB: 0xd83010 },
  wolf: { size: 1.15 }, knight: { size: 1.85 }, crane: { size: 0.8 }, clone: { size: 1.6 },   // fx2: 학 0.55 -> 0.8(작다는 지적)
  dragon: { size: 1.25, segs: 16, gap: 0.34 },
  wallH: 2.0, cloudH: 3.4,
  // fx2 (2026-11-17)
  fx2: true,
  tripo: { wolf: 1.3, crane: 1.5, knight: 1.0, dragon: 1.25 },        // Tripo 모델 크기(소환물 크기에 곱함, 모델은 가로 가장 긴 변 1 / 기사는 높이 1)
  tripoYaw: { wolf: 0, crane: 0, knight: -Math.PI / 2, dragon: -Math.PI / 2 },   // 모델 앞 방향 보정(라디안) — 기사·용 머리 초안은 +X 를 봄
  inkK: { wolf: 0.75, dragon: 0.12 },                                   // Tripo 기본색을 먹빛으로 바꾸는 정도(0 = 그대로)
  sfxGap: { pt_twinkle: 0.25, pt_sigil: 0.3, pt_flap: 0.4, pt_splash: 0.12, pt_howl: 1.0, pt_clank: 0.5, pt_roar: 1.0, pt_bloom: 0.8 },
};
// 직업 색(테일즈위버식 파스텔 + 금테): [선·밝은 색, 바탕·진한 색, 강조(금)] — HerbalFx 의 pang/sigil/beam/gather 가 쓰는 표(HERBFX.el)에 'pt_' 이름으로 더함
const PT_EL = { pt_ink: [0xb8c4ff, 0x2a2a6a, 0xffd870], pt_red: [0xffa088, 0xd8202c, 0xffd060], pt_blue: [0xa8e0ff, 0x2a5ae0, 0xeaf8ff], pt_gold: [0xfff0a0, 0xc88010, 0xffffff],
  pt_violet: [0xf0b0ff, 0x7a2ac0, 0xffe08a], pt_green: [0xd0ffa8, 0x3a9a40, 0xfff0b0], pt_white: [0xffffff, 0x7a80c0, 0xffe08a], pt_storm: [0xc8e0ff, 0x3a4ab8, 0xf0f8ff],
  pt_pastel: [0xffc8e8, 0x6aa8f0, 0xfff0a0], pt_rainbow: [0xffffff, 0x9a5ae0, 0xffe08a] };
Object.assign(HERBFX.el, PT_EL);
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
    // fx2: 회색 연필 대신 무지개 색연필(높이·시간에 따라 색이 흐름) + 옅은 라벤더 종이 — '크로키 분신이 회색'이라는 지적
    vec3 lc = clamp(abs(fract(hk * .8 + uT * .22 + nz * .15 + vec3(0., .6667, .3333)) * 6. - 3.) - 1., 0., 1.) * .8 + .1;
    c = mix(vec3(.99, .96, 1.), lc * .9, max(line, (1. - hatch) * .62));
    a *= .6 + .4 * max(line, (1. - hatch));
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

// ---------------------------------------------------------------- fx2 셰이더 (2026-11-17)
// 화가 마법진(알파 혼합 — 밝은 바닥에서도 읽히게): uv 0..1 = 반지름 1. uK 0 색상환(무지개 칸 + 붓 소용돌이) / 1 먹 원상(굵기 고르지 않은 붓 원 + 붉은 낙관) /
// 2 액자(네모 금테 + 원근 보조선 + 모서리 덩굴) / 3 점묘(색 점 고리). uP 그려짐(바깥 금테가 돌며 그려진 뒤 안 무늬), uT 시간, uS 회전, uW 선, uB 번짐, uG 금
const PSG_FS = `uniform vec3 uW, uB, uG; uniform float uA, uK, uP, uT, uS; varying vec2 vUv;
float CO, HA; vec3 CC; float CW;
void ln(float d, float w, float k){ float c = smoothstep(w, 0., d) * k; CO += c; HA += smoothstep(w * 5., 0., d) * k; }
void cl(float d, float w, float k, vec3 c){ float q = smoothstep(w, 0., d) * k; CC += c * q; CW += q; HA += smoothstep(w * 4., 0., d) * k * .6; }
vec2 rot(vec2 p, float a){ float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
vec3 hue(float h){ return clamp(abs(fract(h + vec3(0., .6667, .3333)) * 6. - 3.) - 1., 0., 1.) * .75 + .25; }
float h11(float x){ return fract(sin(x * 91.17) * 43758.5); }
void main(){
  vec2 p = vUv * 2. - 1.; float r = length(p); if (r > 1.) discard;
  float a = atan(p.y, p.x), an = fract(a / 6.2832 + .5); CO = 0.; HA = 0.; CC = vec3(0.); CW = 0.;
  float draw = step(an, uP * 1.35), inner = smoothstep(.35, .85, uP), G0;
  ln(abs(r - .962), .016, draw); ln(abs(r - .905), .009, draw); G0 = CO;
  vec2 q = rot(p, uT * uS), w = rot(p, -uT * uS * .6); float aq = atan(q.y, q.x), aw = atan(w.y, w.x);
  float bead = smoothstep(.03, .012, length(vec2(fract(aq / 6.2832 * 28.) - .5, (r - .835) * 9.))) * draw; CO += bead * .9; HA += bead * .4;
  if (uK < .5) {           // 색상환: 12 칸 무지개 띠 + 안쪽 붓 소용돌이 3갈래 + 가운데 팔레트 점
    float seg = floor(fract(aw / 6.2832) * 12.), sa = fract(fract(aw / 6.2832) * 12.);
    cl(abs(r - .66) - .055, .012, inner * step(.08, sa) * step(sa, .92), hue(seg / 12. + uT * .05));
    for (int i = 0; i < 3; i++) { float ph = float(i) * 2.094; float sp = fract((aw + ph) / 6.2832 - r * .9 + uT * .1); cl(abs(sp - .5) * r * 1.2, .02, inner * smoothstep(.1, .25, r) * step(r, .52), hue(float(i) / 3.)); }
    ln(abs(r - .55), .01, inner); CO += smoothstep(.09, .06, r) * inner;
  } else if (uK < 1.5) {   // 먹 원상: 위로 갈수록 마르는 굵은 붓 원(끝이 빔) + 낙관
    float t = fract(aw / 6.2832 + .1), dry = h11(floor(r * 60.)) * .5 + .5;
    float th = .07 * (1. - .7 * t) * (.7 + .3 * sin(t * 40.)), gap = step(t, .9);
    float ens = smoothstep(th, th - .02, abs(r - .62 - .02 * sin(t * 12.))) * gap * step(.25, dry + (1. - t) * .6) * inner;
    CO += ens * 1.2; HA += ens * .5;
    vec2 sq = rot(p - vec2(.24, -.26), .1); float box = max(abs(sq.x), abs(sq.y));
    cl(abs(box - .09), .012, inner, vec3(.85, .12, .15)); cl(max(box - .06, 0.) + step(.5, fract((sq.x + sq.y) * 30.)) * .02, .02, inner, vec3(.85, .12, .15));
    ln(abs(r - .3), .008, inner * .7);
  } else if (uK < 2.5) {   // 액자: 네모 금테 두 겹 + 원근 보조선 + 모서리 덩굴 원
    float bx = max(abs(w.x), abs(w.y)); ln(abs(bx - .5), .012, inner); ln(abs(bx - .44), .008, inner);
    for (int i = 0; i < 4; i++) { float aa = float(i) * 1.5708 + .7854; vec2 c = vec2(cos(aa), sin(aa)) * .707; ln(abs(length(w - c * .5) - .07), .008, inner); ln(abs(length(w - c * .5) - .13), .006, inner * .7); }
    for (int i = 0; i < 8; i++) { float aa = float(i) * .7854; vec2 d = vec2(cos(aa), sin(aa)); float t2 = dot(w, d), sd = abs(w.x * d.y - w.y * d.x); ln(sd, .006, inner * step(.5, t2) * step(t2, .8) * .8); }
  } else {                 // 점묘: 색 점 고리 셋(바깥부터)
    for (int j = 0; j < 3; j++) { float rr = .7 - float(j) * .18, n = 30. - float(j) * 8.; float idx = floor(fract(aw / 6.2832) * n);
      float d = length(vec2((fract(fract(aw / 6.2832) * n) - .5) * rr * 6.2832 / n, r - rr)); cl(d, .028 - float(j) * .004, inner * step(float(j) * .2, uP - .4), hue(idx / n + float(j) * .3)); }
  }
  CO = clamp(CO, 0., 1.); HA = clamp(HA, 0., 1.);
  vec3 lineC = mix(uW, uG, clamp(G0, 0., 1.)); vec3 col = mix(uB, lineC, smoothstep(0., .6, CO));
  if (CW > .001) col = mix(col, CC / CW, clamp(CW, 0., 1.));
  float fill = .14 * smoothstep(1., .15, r) * inner + .07 * smoothstep(.75, .98, r) * draw;
  gl_FragColor = vec4(col, clamp(max(CO, CW) * 1.2 + HA * .5 + fill, 0., 1.) * uA);
}`;
// Tripo 소환물(기본색 텍스처) + 그림 재질 규칙: uInk = 먹빛으로 바꾸는 정도, uDraw = 아래부터 디졸브로 나타남(PM_FS 와 같은 값), 나타나는 경계·uGlow 는 uGlowC 로 빛남
const PTT_VS = `varying vec3 vN, vV, vW; varying vec2 vUv; void main(){ vUv = uv; vN = normalize(normalMatrix * normal); vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vec4 mv = viewMatrix * w; vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const PTT_FS = `uniform sampler2D uMap; uniform vec3 uTint, uGlowC; uniform float uA, uGlow, uDraw, uY0, uH, uInk, uT; varying vec3 vN, vV, vW; varying vec2 vUv;
float h31(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y), mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }
void main(){
  float hk = clamp((vW.y - uY0) / max(.01, uH), 0., 1.), nz = n3(vW * 6.);
  float cut = uDraw * 1.25 - .12 - hk + (nz - .5) * .35; if (cut < 0.) discard; float edge = smoothstep(.12, 0., cut);
  vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
  vec3 tex = texture2D(uMap, vUv).rgb * 1.06; float l = dot(tex, vec3(.3, .55, .15));
  vec3 ink = mix(vec3(.05, .05, .1), vec3(.42, .5, .92), smoothstep(.08, .7, l)); vec3 base = mix(tex, ink, uInk) * uTint;
  float d = max(0., dot(n, normalize(vec3(-.4, .8, .5)))), rim = pow(1. - max(0., dot(n, vV)), 2.4), band = d > .6 ? 1. : d > .22 ? .8 : .62;
  vec3 c = base * (.55 + .55 * band) + mix(vec3(1., .95, .85), uGlowC, .5) * rim * (.22 + .25 * uInk);
  c = mix(c, uGlowC * 1.4, edge * .85 * (1. - step(.999, uDraw))); c += uGlowC * uGlow * (.4 + .6 * rim);
  gl_FragColor = vec4(c, uA);
}`;

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
      if (P.fx2) {   // fx2: HerbalFx 의 인스턴스 입자·빛기둥을 화가 메시로(이름만 빌림 — 꽃잎·깃털·별·방울·붓 조각)
        for (const [h, q] of [['hb_petal', 'pt_petal'], ['hb_leaf', 'pt_feather'], ['hb_star', 'pt_star'], ['hb_drop', 'pt_drop'], ['hb_flame', 'pt_stroke'], ['hb_beam', 'pt_beam']]) if (this.geo[q]) this.geo[h] = this.geo[q];
        this._fx2Load();
        try {   // Tripo 소환물(tools/blender/fx_painter_tripo.py) — 없으면 절차 메시
          const tj = await (await fetch('assets/fx/fx_painter_tripo.glb.json')).json(), tr = atob(tj.b64), t8 = new Uint8Array(tr.length);
          for (let i = 0; i < tr.length; i++) t8[i] = tr.charCodeAt(i);
          const tg = await new Promise((res, rej) => new GLTFLoader().parse(t8.buffer, '', res, rej));
          tg.scene.traverse(o => { if (o.isMesh && o.material && o.material.map) this.tri[o.name] = { geo: o.geometry, map: o.material.map }; });
        } catch (err) { console.warn('painterfx: no Tripo models', err && err.message); }
      }
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
    if (kind === 'psg') return new THREE.ShaderMaterial({ uniforms: U({ uW: Cc(), uB: Cc(), uG: Cc(), uA: 0, uK: 0, uP: 1, uT: 0, uS: 0.6 }), vertexShader: PG_VS, fragmentShader: PSG_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    if (kind === 'ptt') return new THREE.ShaderMaterial({ uniforms: U({ uMap: null, uTint: Cc(), uGlowC: Cc(), uA: 1, uGlow: 0, uDraw: 1, uY0: 0, uH: 1, uInk: 0, uT: 0 }), vertexShader: PTT_VS, fragmentShader: PTT_FS, transparent: true, depthWrite: true, side: THREE.DoubleSide });
    return super._mat(kind);
  }

  // ================================================================== fx2 공용(2026-11-17)
  /** 같은 소리 반복 제한(PAINTFX.sfxGap) — 규칙(js/painter.js)의 소리에 덧붙이는 그림 소리 */
  _snd(n) { const now = this.clk || 0, g = P.sfxGap[n] ?? 0.12; if (!this.sndT) this.sndT = {}; if (now - (this.sndT[n] ?? -9) < g) return; this.sndT[n] = now; this.sfx(n); }
  /** 화가 마법진(three 좌표 중심, 반지름 r = 실제 범위 이하). pat 0 색상환 / 1 먹 원상 / 2 액자 / 3 점묘. o: grow, life, a, spin, fade, follow, pulse. handle: end(t) */
  psig(at, r, el, o = {}) {
    if (!this.parts) return null; const c = HERBFX.el[el] || HERBFX.el.pt_gold, grow = o.grow ?? 0.35, A = o.a ?? 0.85;
    const e = this._fx('psig', o.life ?? 1.2, (e) => {
      const fk = this._fadeK(e), k = e.ending == null ? 1 - smooth(e.life - (o.fade ?? 0.45), e.life, e.t) : 1, u = m.material.uniforms;
      if (o.follow) { const q = o.follow(); m.position.set(q.x, q.y + 0.06, q.z); }
      u.uP.value = easeOut(clamp01(e.t / grow)); u.uT.value = e.t; u.uA.value = A * fk * k * smooth(0, 0.06, e.t) * (o.pulse ? 0.8 + 0.2 * Math.sin(e.t * 6) : 1);
      m.scale.setScalar(r * (0.82 + 0.18 * easeBack(clamp01(e.t / grow))));
    });
    const m = this._m(e, 'psg', this.disc, 1), u = m.material.uniforms; u.uK.value = o.pat ?? 0; u.uS.value = o.spin ?? 0.6; u.uW.value.setHex(c[0]); u.uB.value.setHex(c[1]); u.uG.value.setHex(c[2]); u.uA.value = 0;
    m.position.copy(at); m.position.y = (o.y ?? groundY(at.x, -at.z)) + 0.06; m.scale.setScalar(r);
    return this._h(e, { end: (t = 0.45) => this._end(e, t) });
  }
  /** Tripo 소환물(그림 재질 규칙 — uDraw 디졸브·uGlow) — 없으면 null */
  tpm(e, name, o = {}) {
    const t = this.tri && this.tri['tripo_' + name]; if (!t) return null; const m = this._m(e, 'ptt', t.geo, o.order ?? 2), u = m.material.uniforms;
    u.uMap.value = t.map; u.uA.value = o.a ?? 1; u.uGlow.value = 0; u.uGlowC.value.setHex(o.glowC ?? C.gold); u.uTint.value.setHex(o.tint ?? 0xffffff); u.uInk.value = o.ink ?? 0; u.uDraw.value = 1; u.uY0.value = 0; u.uH.value = 1;
    return m;
  }
  /** 물감 왕관 튐(바닥, 실제로 맞은 자리) — 색 col, 반지름 r */
  crown(at, col, r = 0.5, life = 0.5) {
    if (!this.geo.pt_splat) return null; const gy = groundY(at.x, -at.z);
    const e = this._fx('crown', life, (e) => { const k = e.t / life; m.scale.set(r * (0.5 + 0.6 * easeOut(k / 0.4)), r * 0.9 * easeBack(clamp01(k / 0.3)) * (1 - smooth(0.5, 1, k)), r * (0.5 + 0.6 * easeOut(k / 0.4))); m.material.uniforms.uA.value = 1 - smooth(0.55, 1, k); });
    const m = this.pm(e, 'pt_splat', { mode: 1, tint: col, see: true, glowC: col, glow: 0.12 }); if (!m) return e; m.position.set(at.x, gy + 0.02, at.z); m.rotation.y = rnd(0, 6.28);
    return e;
  }
  /** 물감 방울 3D 조각 흩뿌림(인스턴스 — draw call 1) */
  blobs(at, n, cols, o = {}) {
    n = this._nk(n); const gy = o.floor ?? groundY(at.x, -at.z) + 0.03;
    for (let i = 0; i < n; i++) { const a = rnd(0, 6.283), sp = rnd(0.8, 2.4) * (o.speed ?? 1), s = rnd(0.05, 0.1) * (o.size ?? 1);
      this.bit(o.kind || 'drop', at, { v: new THREE.Vector3(Math.cos(a) * sp, rnd(1.2, 3.0) * (o.up ?? 1), Math.sin(a) * sp), g: -9.8, floor: gy, life: rnd(0.45, 0.8) * (o.life ?? 1), s0: s, s1: s * 0.7, col: cols[i % cols.length], glow: o.glow ?? 0.15, outK: 0.65, wx: rnd(-6, 6), wz: rnd(-6, 6) }); }
  }
  /** 반짝이 비(위에서 아래로 / 아래에서 위로) — 원 c, 반지름 r 안 */
  sparkle(c, r, el, n, o = {}) {
    const col = HERBFX.el[el] || HERBFX.el.pt_gold; n = this._nk(n);
    for (let i = 0; i < n; i++) { const a = rnd(0, 6.283), rr = Math.sqrt(rnd(0, 1)) * r, p = new THREE.Vector3(c.x + Math.cos(a) * rr, (o.y ?? c.y) + rnd(0, o.h ?? 0.4), c.z + Math.sin(a) * rr);
      this.spark(p, { v: new THREE.Vector3(0, o.up ?? 1.0, 0), life: rnd(0.5, 0.9) * (o.life ?? 1), s0: rnd(0.12, 0.22) * (o.size ?? 1), s1: 0.02, col: o.cols ? o.cols[i % o.cols.length] : (i % 3 ? col[0] : col[2]), k: i % 2 ? 1 : 0, a: o.a ?? 1, tw: 18, inT: 0.1 }); }
  }
  /** 소환물 완성 연출: 발밑 마법진(그리는 동안) + 종이로 모이는 반짝이 -> 완성 순간 빛기둥 + '팡' + 소리 */
  _birth(e, s, el, pat, r, draw, snd, o = {}) {
    if (!this.parts) return; const b = P3(s.pos);
    this.psig(b, r, el, { pat, grow: draw * 0.8, life: draw + 0.7, a: 1.0, spin: 1.1, follow: () => P3(e.s.pos) });
    const paperAt = () => { const q = P3(e.s.pos).addScaledVector(this.toCam, 0.5); q.y += e.ppY ?? 0.9; return q; };
    this.gather(b, r * 0.9, paperAt, el, 12, draw * 0.8);
    this._later(draw, () => { const q = P3(e.s.pos); this.beam(q, o.beamR ?? 0.6, o.beamH ?? 2.6, el, { life: 0.6, a: 0.85 });
      this.pang(q.clone().setY(q.y + (o.popY ?? 0.7)), el, { r: o.popR ?? 0.55, n: 12, ground: q.y }); if (snd) this._snd(snd); this._snd('pt_twinkle'); }, e);
  }
  /** 살아 있는 동안 가끔 몸 둘레 반짝이(오라) */
  _aura(e, dt, el, h = 1, r = 0.5, every = 0.16) {
    if (!this.parts || e.dk < 1) return; e.auraT = (e.auraT || 0) - dt; if (e.auraT > 0) return; e.auraT = lite() ? every * 2.2 : every;
    const b = P3(e.s.pos), a = rnd(0, 6.283), c = HERBFX.el[el] || HERBFX.el.pt_gold;
    this.spark(b.clone().add(new THREE.Vector3(Math.cos(a) * r, rnd(0.15, h), Math.sin(a) * r)), { v: new THREE.Vector3(0, 0.7, 0), life: 0.7, s0: 0.13, s1: 0.02, col: rnd(0, 1) < 0.5 ? c[0] : c[2], k: 1, a: 0.85, tw: 14 });
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
    if (this.parts) {   // fx2: 발밑 화가 마법진(색마다 무늬) + 붓끝으로 빨려 드는 물감 반짝이 — 시전 준비 층
      const el = { red: 'pt_red', blue: 'pt_blue', gold: 'pt_gold', palette: 'pt_violet', green: 'pt_green', white: 'pt_white', ink: 'pt_ink' }[what] || 'pt_ink';
      const pat = { ink: 1, red: 0, blue: 0, gold: 3, palette: 0, green: 2, white: 2 }[what] ?? 0, b0 = P3(pc.pos);
      this.psig(b0, 1.15, el, { pat, grow: lead * 0.9, life: lead + 0.55, a: 0.9, spin: 1.3, follow: () => P3(pc.pos) });
      this.gather(b0, 1.0, () => P3(o.hand ? o.hand() : pc.pos), el, 10, lead);
    }
    return this._h(e, {});
  }
  _free(e) { if (e && e.tube && this.tubes) { this.tubes.push(e.tube); e.tube = null; } super._free(e); }

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
      if (e.auraEl) this._aura(e, dt, e.auraEl, e.auraH || 1, e.auraR || 0.5);
    });
    e.s = s; e.body = []; e.gal = false; e.galK = 0; e.hurtK = 0;
    build(e);
    return this._h(e, {
      sync: (s2) => { e.s = s2; },
      hurt: () => { e.hurtK = 1; },
      refresh: () => { this.ring(P3(s.pos), 1.2, C.gold, C.goldB, 0.4, 1.0, 0.2); this.drops(P3(s.pos).setY((s.pos.y || 0) + 0.8), lite() ? 3 : 6, extra.col || C.ink, { life: 0.5 });
        if (this.parts) { const q = P3(e.s.pos); this.psig(q, 1.0, e.auraEl || 'pt_gold', { pat: 2, grow: 0.25, life: 0.9, a: 0.8 }); this.sparkle(q, 0.7, e.auraEl || 'pt_gold', 8, { h: 1.2 }); } },
      redraw: () => { e.t = 0; e.drawT = 0.4; e.regrowT = 0; setTimeout(() => { e.regrowT = null; }, 400); },
      gallery: (on) => { e.gal = !!on; },
      erase: () => { if (e.erasing == null) { e.erasing = e.t; this.drops(P3(s.pos).setY((s.pos.y || 0) + 0.6), lite() ? 3 : 6, extra.col || C.ink, { life: 0.5, speed: 0.6 });
        if (this.parts) this.sparkle(P3(e.s.pos), 0.6, e.auraEl || 'pt_gold', 8, { h: 1.0, up: 1.4 }); } },
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
      e.tw = this.tpm(e, 'wolf', { ink: P.inkK.wolf, glowC: 0x8aa0ff });   // fx2: Tripo 먹물 늑대(통짜) — 없으면 절차 부위
      if (e.tw) { e.body.push(e.tw); e.root.add(e.tw); }
      else { e.bodyM = add('pt_wolf_body'); e.head = add('pt_wolf_head'); e.tail = add('pt_wolf_tail'); e.legs = [0, 1, 2, 3].map(() => add('pt_wolf_leg')); }
      e.step = 0; e.prints = 0; e.last = null; e.auraEl = 'pt_ink'; e.auraH = 0.9; e.auraR = 0.55;
      this._birth(e, s, 'pt_ink', 1, 1.1, o.draw || 0.75, 'pt_howl', { popY: 0.6 });
    }, (e, dt) => {
      const s = e.s, base = P3(s.pos), mv = s.moving || (s.dash != null);
      e.step += dt * (s.dash ? 26 : mv ? 13 : 0); const lunge = e.atkK;
      e.root.position.copy(base).setY(base.y); e.root.rotation.set(0, yawOf(s.facing), 0); e.root.scale.setScalar(S * (0.85 + 0.15 * e.dk));
      if (e.tw) {   // 통짜 모델: 뛸 때 위아래로 튀고 앞뒤로 출렁, 물 때 앞으로 내밀며 숙임, 숨쉬기
        const gal = mv ? Math.abs(Math.sin(e.step)) : 0, k = P.tripo.wolf;
        e.tw.position.set(0, gal * 0.1 + Math.sin(e.t * 2.2) * 0.01, 0.16 * lunge); e.tw.rotation.set(mv ? -0.12 * Math.sin(e.step * 2) : 0.02 * Math.sin(e.t * 2.2), P.tripoYaw.wolf, 0); e.tw.rotateX(0.22 * lunge);
        e.tw.scale.set(k * (1 + 0.04 * Math.sin(e.t * 2.2)), k * (1 - 0.06 * lunge + (mv ? 0.05 * gal : 0)), k);
        e.tw.material.uniforms.uT.value = e.t;
        if (e.dk >= 1 && mv && this.parts) { e.inkT = (e.inkT || 0) - dt; if (e.inkT <= 0) { e.inkT = lite() ? 0.12 : 0.05; const f = D3(s.facing), q = base.clone().addScaledVector(f, -0.55 * S); q.y += 0.5;
          this.bit('drop', q, { v: new THREE.Vector3(rnd(-0.3, 0.3), rnd(0.2, 0.8), rnd(-0.3, 0.3)), g: -4, floor: base.y + 0.03, life: 0.5, s0: 0.07, s1: 0.03, col: 0x2a2a58, glow: 0.05 });
          this.spark(q, { v: new THREE.Vector3(0, 0.5, 0), life: 0.45, s0: 0.12, s1: 0.02, col: 0x8a9aff, k: 0, a: 0.7 }); } }
        if (e.dk >= 1 && mv && (!e.last || e.last.distanceTo(base) > 0.55)) { e.last = base.clone(); this._print(base, s.dash ? 0.5 : 0.28, s.dash ? 0.6 : 0.9); }
        return;
      }
      const bob = mv ? Math.abs(Math.sin(e.step)) * 0.05 : Math.sin(e.t * 2) * 0.01;
      e.bodyM.position.set(0, 0.5 + bob, 0.02 * lunge); e.bodyM.rotation.set(-0.05 * Math.sin(e.step * 2) - 0.12 * lunge, 0, 0);
      e.head.position.set(0, 0.62 + bob, 0.48 + 0.18 * lunge); e.head.rotation.set(0.25 * lunge - 0.05, 0, 0);
      e.tail.position.set(0, 0.62 + bob, -0.5); e.tail.rotation.set(0.3 + 0.2 * Math.sin(e.t * 4), Math.sin(e.t * 3) * 0.3, 0);
      [[-0.13, 0.3], [0.13, 0.3], [-0.13, -0.32], [0.13, -0.32]].forEach(([x, z], i) => { const l = e.legs[i]; l.position.set(x, 0.48 + bob, z); l.rotation.set(mv ? Math.sin(e.step + (i % 2 ? 0 : Math.PI) + (i > 1 ? Math.PI / 2 : 0)) * 0.6 : 0, 0, 0); });
      // 움직이면 발밑 먹 자국 + 짧은 마른 붓 잔상(장식, 피해 없음)
      if (e.dk >= 1 && mv && (!e.last || e.last.distanceTo(base) > 0.55)) { e.last = base.clone(); this._print(base, s.dash ? 0.5 : 0.28, s.dash ? 0.6 : 0.9); }
    }, { col: C.ink, h: (e) => ({
      attack: (t, ok) => { e.atkK = 1; if (ok && t) { const at = P3(t.pos); at.y += 0.6; this.flash(at, C.inkB, C.ink, 0.5, 0.14, 0.9); this.drops(at, lite() ? 3 : 6, C.ink, { speed: 1.2, life: 0.45 });
        if (this.parts) { this._bite(at); this.pang(at, 'pt_ink', { r: 0.45, n: 8, stars: lite() ? 0 : 2 }); this.crown(at, 0x2a2a58, 0.45, 0.45); } } },
      dash: (f, d) => { e.atkK = 1; const at = P3(e.s.pos); this._streak(at, D3(f), d, C.ink);
        if (this.parts) { const dir = D3(f), n = this._nk(10); for (let i = 0; i < n; i++) { const q = at.clone().addScaledVector(dir, d * i / n); q.y += rnd(0.3, 0.9); this.spark(q, { v: new THREE.Vector3(0, 0.4, 0), life: 0.5 + i * 0.02, s0: 0.2, s1: 0.03, col: i % 2 ? 0x8a9aff : C.gold, k: i % 3 ? 0 : 1, a: 0.9 }); } } },
      dashHit: (p) => { const at = P3(p); at.y += 0.6; this.flash(at, C.inkB, C.ink, 0.6, 0.16, 1.0); if (this.parts) { this._bite(at); this.pang(at, 'pt_ink', { r: 0.5, n: 10 }); } },
    }) });
  }
  _bite(at) {   // fx2: 먹 이빨 자국 — 위아래에서 엇갈려 닫히는 초승달 두 줄(금테)
    const e = this._fx('bite', 0.3, (e) => { const k = e.t / 0.3; ms.forEach((m, i) => { const sgn = i ? -1 : 1; m.position.copy(at).addScaledVector(this.camR, 0).setY(at.y + sgn * 0.22 * (1 - easeOut(k / 0.35))); m.material.uniforms.uA.value = 1.2 * (1 - smooth(0.4, 1, k)); }); });
    const ms = [0, 1].map((i) => { const m = this.spr(e, 2, i ? C.gold : 0xc8d0ff, 0x2a2a6a, 7); m.scale.set(0.75, 0.16, 1); this._alignLine(m, this.camR); return m; });
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
      e.h = 3; e.cr = []; e.auraEl = 'pt_pastel'; e.auraH = 1.8; e.auraR = 0.6;
      const tcols = [0xffffff, 0xfff0f8, 0xf0f8ff, 0xfffff0, 0xf8f0ff];
      for (let i = 0; i < n; i++) { const g = new THREE.Group(); e.g.add(g); let b, wl, wr; const tc = this.tpm(e, 'crane', { tint: tcols[i], glowC: cols[i] });   // fx2: Tripo 색종이 학
        if (tc) { b = tc; tc.rotation.y = P.tripoYaw.crane; tc.scale.setScalar(P.tripo.crane); }
        else { b = this.pm(e, 'pt_crane', { mode: 3, tint: cols[i] }); wl = this.pm(e, 'pt_crane_wing', { mode: 3, tint: cols[i] }); wr = this.pm(e, 'pt_crane_wing', { mode: 3, tint: cols[i] }); }
        for (const m of [b, wl, wr]) if (m) { g.add(m); e.body.push(m); } wr && (wr.scale.x = -1);
        const rb = this.parts ? this._ribbon(e, 12) : null; if (rb) { rb.material.uniforms.uW.value.setHex(0xffffff); rb.material.uniforms.uB.value.setHex(cols[i]); }
        e.cr.push({ g, b, wl, wr, ph: i * 1.3, dive: -9, rb, hist: [], tri: !!tc }); }
      this._birth(e, s, 'pt_pastel', 2, 1.0, o.draw || 0.8, 'pt_flap', { popY: 1.4, beamH: 2.4 });
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
        if (q.tri) { q.g.rotateZ(0.35 * Math.sin(e.t * 1.4 + q.ph)); q.b.scale.set(P.tripo.crane * (1 + 0.08 * flap), P.tripo.crane * (1 - 0.12 * flap), P.tripo.crane); q.b.material.uniforms.uT.value = e.t; }   // 통짜 학: 기울며 날고 날갯짓은 눌림으로
        if (q.rb) { q.hist.unshift(p.clone()); if (q.hist.length > 12) q.hist.length = 12; if (q.hist.length > 1) { this._ribbonSet(q.rb, q.hist, 0.07 * unfold); q.rb.material.uniforms.uA.value = 0.85 * unfold * (e.erasing != null ? 0 : 1); } }
      });
    }, { col: C.white, h: (e) => ({
      feathers: (t, nn) => { const to = P3(t.pos); to.y += 0.8; for (let i = 0; i < e.cr.length; i++) this._feather(e.cr[i].g.position.clone(), to, 0.18 + i * 0.03, cols[i]); },
      dive: (t, idx) => { const q = e.cr[idx % e.cr.length]; q.dive = e.t; q.to = P3(t.pos); this._streakLine(q.g.position.clone(), q.to.clone().setY(q.to.y + 0.6), 0x9ad0ff, 0.6);
        if (this.parts) { this._snd('pt_flap'); this._later(0.3, () => { const at = q.to.clone().setY(q.to.y + 0.6); this.pang(at, 'pt_pastel', { r: 0.5, n: 10 }); this.blobs(at, 6, [0xffc8e8, 0xa8d8ff, 0xfff0a0], { kind: 'petal', size: 1.6, speed: 0.8, glow: 0.3 }); }, e); } },
    }) });
  }
  _feather(from, to, t, col) {   // fx2: 깃털이 그 학의 색으로 빛나고 반짝이 꼬리, 닿으면 작은 '팡'
    const e = this._fx('feather', t + 0.25, (e) => { const k = clamp01(e.t / t); if (!m) return; m.position.copy(from).lerp(to, easeOut(k)); m.position.y += Math.sin(k * Math.PI) * 0.3; m.lookAt(to); m.rotateX(Math.PI / 2); m.material.uniforms.uA.value = k >= 1 ? 1 - smooth(t, t + 0.25, e.t) : 1;
      if (k < 1 && this.parts && !lite()) this.spark(m.position, { life: 0.3, s0: 0.14, s1: 0.02, col: col || 0xffffff, k: 0, a: 0.8 });
      if (k >= 1 && !e.hit) { e.hit = true; this.flash(to, C.inkB, C.ink, 0.35, 0.12, 0.8); if (this.parts) this.pang(to, 'pt_pastel', { r: 0.3, n: 5, stars: 0, noRing2: true }); } });
    const m = this.pm(e, 'pt_feather', { mode: 0, see: true, glowC: col || C.gold, glow: col ? 0.35 : 0 }); if (m) m.scale.setScalar(0.34);
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
      e.tk = this.tpm(e, 'knight', { glowC: C.gold });   // fx2: Tripo 유화 기사(방패 포함) — 검만 절차
      if (e.tk) { e.body.push(e.tk); e.root.add(e.tk); e.bodyM = e.tk; } else { e.bodyM = add('pt_knight'); e.shield = add('pt_shield'); }
      e.sword = add('pt_sword', { glowC: C.gold });
      e.auraEl = 'pt_gold'; e.auraH = 1.6 * S / 1.85; e.auraR = 0.6;
      this._birth(e, s, 'pt_gold', 2, 1.25, o.draw || 0.95, 'pt_clank', { popY: 1.1, beamR: 0.8, beamH: 3.2, popR: 0.7 });
      e.frame = this.pm(e, 'pt_frame', { mode: 1, tint: 0xffffff }); if (e.frame) e.g.add(e.frame);   // 액자는 몸과 따로(빠르게 사라짐)
      e.swingT = -9; e.walkT = 0;
    }, (e, dt) => {
      const s = e.s, base = P3(s.pos), yaw = yawOf(s.facing);
      if (s.moving) e.walkT += dt * 9;
      e.root.position.copy(base).addScaledVector(D3(s.facing), -0.6 * (1 - e.dk)); e.root.rotation.set(0, yaw, 0); e.root.scale.setScalar(S);
      e.bodyM.position.set(0, s.moving ? Math.abs(Math.sin(e.walkT)) * 0.03 : 0, 0); e.bodyM.rotation.set(0, 0, s.moving ? Math.sin(e.walkT) * 0.04 : 0);
      const sw = e.t - e.swingT, sk = sw >= 0 && sw < 0.45 ? sw / 0.45 : 1, ang = sk < 1 ? (sk < 0.35 ? -1.2 * easeOut(sk / 0.35) : -1.2 + 2.6 * easeOut((sk - 0.35) / 0.65)) : 0;
      if (e.tk) {   // 통짜 기사: 휘두를 때 몸을 비틀고 숙임, 숨쉬기 — 검은 오른손 자리(모델 높이 1 기준)
        const tw = sk < 1 ? (sk < 0.35 ? -0.25 * easeOut(sk / 0.35) : -0.25 + 0.55 * easeOut((sk - 0.35) / 0.65)) * (1 - smooth(0.7, 1, sk)) : 0;
        e.tk.rotation.set(sk < 1 ? 0.08 : 0, P.tripoYaw.knight + tw, s.moving ? Math.sin(e.walkT) * 0.04 : 0); const k = P.tripo.knight; e.tk.scale.set(k, k * (1 + 0.015 * Math.sin(e.t * 2)), k); e.tk.material.uniforms.uT.value = e.t;
        e.sword.position.set(-0.33, 0.42, 0.14); e.sword.rotation.set(-0.3 + (sk < 1 ? 1.1 : 0), -ang + tw, sk < 1 ? 1.2 : 0); e.sword.scale.setScalar(0.66);   // Tripo 기사는 방패가 +x 쪽이라 검은 반대 손(-x)
      } else {
        e.sword.position.set(0.28, 0.48, 0.12); e.sword.rotation.set(-0.3 + (sk < 1 ? 1.1 : 0), ang, sk < 1 ? -1.2 : 0); e.sword.scale.setScalar(0.62);
        e.shield.position.set(-0.27, 0.5, 0.12); e.shield.rotation.set(0, -0.5, 0); e.shield.scale.setScalar(0.24);
      }
      e.sword.material.uniforms.uGlow.value = Math.max(e.sword.material.uniforms.uGlow.value, sk < 1 ? 0.5 * (1 - sk) : 0);
      // 황금 액자: 그리는 동안 서 있다가, 기사가 나온 뒤 0.35 s 에 사라짐
      if (e.frame) { const fk = 1 - smooth(1, 1.35, e.t / e.drawT); e.frame.visible = fk > 0.01; e.frame.position.copy(base).addScaledVector(D3(s.facing), -0.1); e.frame.position.y = groundY(base.x, -base.z) + 0.05; e.frame.rotation.set(0, yaw, 0); e.frame.scale.setScalar(1.7 * easeBack(clamp01(e.t / 0.25)) * fk); e.frame.material.uniforms.uA.value = fk; }
    }, { col: C.blue, h: (e) => ({
      swing: (q) => { e.swingT = e.t; const col = [C.blue, C.gold, C.red][(e.n = (e.n || 0) + 1) % 3]; this._paintArc(P3(e.s.pos), q.f, q.r, q.ang, col); for (const p of q.hits) { const at = P3(p); at.y += 0.7; this.flash(at, C.gold, C.goldB, 0.5, 0.14, 0.9); }
        if (this.parts) {   // fx2: 검 궤적 금빛 리본(실제 부채꼴 반지름 0.85 배 안) + 맞은 적마다 '팡' + 물감 방울
          const c0 = P3(e.s.pos), fy = yawOf(q.f), half = (q.ang || 90) * Math.PI / 360, rr = q.r * 0.75;
          this.trail((t) => { const k = clamp01((t - 0.12) / 0.16); if (t > 0.3) return null; const a = fy + half - 2 * half * easeOut(k); return new THREE.Vector3(c0.x + Math.sin(a) * rr, c0.y + 0.9 - 0.35 * k, c0.z + Math.cos(a) * rr); }, 'pt_gold', { n: 14, w: 0.16, life: 0.55, w0: 0xffffff, w1: col });
          for (const p of q.hits) { const at = P3(p); at.y += 0.7; this.pang(at, col === C.red ? 'pt_red' : col === C.blue ? 'pt_blue' : 'pt_gold', { r: 0.45, n: 8, stars: lite() ? 0 : 1 }); this.blobs(at, 4, [col, C.gold], { size: 0.8 }); } } },
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
      e.walkT = 0; e.glowC = 0xc890ff; e.auraEl = 'pt_rainbow'; e.auraH = 1.4; e.auraR = 0.45;
      this._birth(e, s, 'pt_violet', 3, 1.0, o.draw || 0.7, 'pt_sketch', { popY: 0.9 });
    }, (e, dt) => {
      const s = e.s, base = P3(s.pos); if (s.moving || s.dash) e.walkT += dt * (s.dash ? 20 : 10);
      e.root.position.copy(base); e.root.rotation.set(0, yawOf(s.facing), 0); e.root.scale.setScalar(S);
      if (e.fig) { e.fig.rotation.set(0.15 * e.atkK + (s.dash ? 0.25 : 0), 0, Math.sin(e.walkT) * 0.05); e.fig.material.uniforms.uT.value = e.t; }
    }, { col: 0x8a8a90, h: (e) => ({
      attack: (t, ok) => { e.atkK = 1; if (ok && t) { const at = P3(t.pos); at.y += 0.6; this.flash(at, 0xf8e8ff, 0x8a5ac0, 0.45, 0.12, 0.8); this._sketchMarks(at); if (this.parts) this.pang(at, 'pt_rainbow', { r: 0.4, n: 8, stars: lite() ? 0 : 1 }); } },
      dash: (f, d) => { e.atkK = 1; this._streak(P3(e.s.pos), D3(f), d, 0xc8a0ff);
        if (this.parts) { const at = P3(e.s.pos), dir = D3(f), n = this._nk(9), hc = [0xff9ac8, 0xffd870, 0x9ae0a0, 0x8ac0ff, 0xd09aff]; for (let i = 0; i < n; i++) { const q = at.clone().addScaledVector(dir, d * i / n); q.y += rnd(0.3, 1.2); this.spark(q, { v: new THREE.Vector3(0, 0.3, 0), life: 0.5, s0: 0.18, s1: 0.03, col: hc[i % 5], k: i % 2, a: 0.9 }); } } },
      dashHit: (p) => { const at = P3(p); at.y += 0.6; this._sketchMarks(at); if (this.parts) this.pang(at, 'pt_rainbow', { r: 0.45, n: 8 }); },
    }) });
  }
  _sketchMarks(at) {   // 빠르게 겹친 연필 선(타격)
    const n = lite() ? 2 : 4, e = this._fx('sk', 0.3, (e) => { ms.forEach(m => { m.material.uniforms.uA.value = 0.9 * (1 - smooth(0.1, 0.3, e.t)); }); }), ms = [];
    const hc = [0xff9ac8, 0xffd870, 0x9ae0a0, 0x8ac0ff, 0xd09aff];   // fx2: 색연필 선(무지개)
    for (let i = 0; i < n; i++) { const m = this.spr(e, 2, 0xffffff, hc[i % 5], 6); const d = new THREE.Vector3(rnd(-1, 1), rnd(-0.6, 0.6), rnd(-1, 1)); m.position.copy(at); m.scale.set(0.8, 0.09, 1); this._alignLine(m, d); ms.push(m); }
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
    if (this.parts) {   // fx2: 발밑 먹 원상 마법진 + 큰 마법 붓이 두루마리 위를 그어 가다 눈을 찍음 + 먹 반짝이가 붓으로 모임 + 눈 찍는 순간 '팡'
      this.psig(P3(pc.pos), 1.6, 'pt_ink', { pat: 1, grow: dur * 0.7, life: dur + 0.8, a: 0.9, spin: 0.8, follow: () => P3(pc.pos) });
      const br = this.pm(e, 'pt_brush', { mode: 1, glowC: C.gold }), up = e.update;
      const tip = () => { const base = P3(pc.pos), mid = base.clone().addScaledVector(f, 2.6); mid.y += 1.9; const k = clamp01(e.t / dur), rr2 = _a.crossVectors(f, UP).normalize();
        if (k < 0.85) { const q = mid.clone().addScaledVector(this.camR, -len / 2 + len * 0.92 * (k / 0.85)); q.y += 0.12 * Math.sin(k * 30); return q; }
        const eye = mid.clone().addScaledVector(rr2, len * 0.38); eye.y += 0.25; return mid.clone().addScaledVector(this.camR, len * 0.42).lerp(eye, smooth(0.85, 1, k)); };
      e.update = (q, dt) => { up(q, dt); const fade = q.flownT != null ? 1 - smooth(0, 0.3, q.t - q.flownT) : 1; if (br) { const t0 = tip(); br.position.copy(t0).addScaledVector(this.toCam, 0.3); br.position.y += 0.62 * 0.9; br.rotation.set(0, 0, 0.5 + 0.25 * Math.sin(q.t * 9)); br.quaternion.premultiply(this.camQ); br.scale.setScalar(0.9 * easeBack(clamp01(q.t / 0.2))); br.material.uniforms.uA.value = fade; br.material.uniforms.uGlow.value = 0.15; }
        if (!q.eyed && q.t >= dur * 0.98) { q.eyed = true; const t0 = tip().addScaledVector(this.toCam, 0.1); this.pang(t0, 'pt_gold', { r: 0.5, n: 14, ground: P3(pc.pos).y }); this._snd('pt_twinkle'); }
        if (q.t < dur && this.parts) { q.inkT = (q.inkT || 0) - dt; if (q.inkT <= 0) { q.inkT = lite() ? 0.08 : 0.035; this.spark(tip(), { v: new THREE.Vector3(rnd(-0.3, 0.3), rnd(-0.2, 0.4), rnd(-0.3, 0.3)), life: 0.45, s0: 0.16, s1: 0.03, col: rnd(0, 1) < 0.6 ? 0x9aa8ff : C.gold, k: 0, a: 0.9 }); } } };
      this.gather(P3(pc.pos), 1.5, tip, 'pt_ink', 14, dur * 0.8);
    }
    return this._h(e, { cancel: () => this._end(e, 0.3), flown: () => { e.flownT = e.t; } });
  }
  k_dragon(o3, o) {   // 용: 머리 + 몸통 관(머리 길을 따라 매 프레임 다시 그림 — 등 갈기 톱니·금빛 배·비늘 띠), 금 수염 리본 둘, 먹 꼬리. 관통·숨결은 규칙이 정한 순간
    const f = D3(o.f), start = P3(o3), len = o.len || 12, S = P.dragon.size, hist = [], NR = lite() ? 16 : 22, NS = 10, gap = 0.2 * S;
    if (o.pre && o.pre.flown) o.pre.flown();
    let s = 0, ended = null;
    const e = this._fx('dragon', 9, (e, dt) => {
      const fade = ended != null ? 1 - smooth(0, 0.6, e.t - ended) : 1; if (ended != null && fade <= 0) { this._free(e); return; }
      const up = 1.6 + 0.9 * Math.sin(clamp01(s / len) * Math.PI), wig = Math.sin(e.t * 9) * 0.5;
      const hp = start.clone().addScaledVector(f, s - 0.5 + (ended != null ? (e.t - ended) * 6 : 0)); hp.y += up; const rgt = _a.crossVectors(f, UP).normalize().clone(); hp.addScaledVector(rgt, wig * 0.6);
      hist.unshift(hp.clone()); if (hist.length > 220) hist.pop();
      const app = smooth(0, 0.12, e.t), dirH = hist.length > 3 ? hp.clone().sub(hist[3]).normalize() : f.clone();
      if (th) { th.position.copy(hp); th.lookAt(hp.clone().add(dirH)); th.rotateY(P.tripoYaw.dragon); const k = S * P.tripo.dragon * app; th.scale.setScalar(k); th.translateY(-0.32 * k); const u = th.material.uniforms; u.uA.value = fade; u.uDraw.value = 1; u.uY0.value = -99; u.uGlow.value = 0.12 + 0.1 * Math.sin(e.t * 8); u.uT.value = e.t; }
      if (head) { head.position.copy(hp); head.lookAt(hp.clone().add(f)); head.scale.setScalar(S * app); head.material.uniforms.uA.value = fade; head.material.uniforms.uDraw.value = smooth(0, 0.25, e.t); }
      // 몸통 관: 머리 길(호 길이 gap 간격)을 따라 고리 NR 개
      const pts = []; { let acc = 0, j = 0; for (let i = 0; i < NR; i++) { const want = (i + 0.6) * gap; while (j < hist.length - 1 && acc + hist[j].distanceTo(hist[j + 1]) < want) { acc += hist[j].distanceTo(hist[j + 1]); j++; } pts.push(hist[j]); } }
      this._tubeSet(e.tube, pts, (i) => { const k = i / (NR - 1); return S * (0.32 + 0.08 * Math.sin(Math.min(1, k * 4) * Math.PI / 2)) * (1 - 0.88 * smooth(0.35, 1, k)) * smooth(0.02 * i, 0.02 * i + 0.2, e.t); });   // 통통한 몸: 앞 1/3 은 굵게, 뒤에서 꼬리로 가늘어짐
      const u = body.material.uniforms; u.uA.value = fade; u.uDraw.value = 1; u.uY0.value = -99; u.uGlow.value = 0.04;
      // 금 수염(머리 양옆에서 뒤로 흐름)
      wh.forEach((w, i) => { const sgn = i ? 1 : -1, tip = hp.clone().addScaledVector(rgt, sgn * 0.3 * S).addScaledVector(dirH, 0.25 * S); tip.y -= 0.12 * S + 0.06 * Math.sin(e.t * 7 + i);
        w.h.unshift(tip); if (w.h.length > 14) w.h.length = 14; for (let k = 1; k < w.h.length; k++) { w.h[k].y -= dt * 0.25; w.h[k].addScaledVector(rgt, sgn * dt * 0.3); }
        if (w.h.length > 1) { this._ribbonSet(w.rb, w.h, 0.045 * S); w.rb.material.uniforms.uA.value = 1.1 * fade * app; } });
      // 먹 꼬리(번지는 먹 연기) + 몸을 따라 금빛·푸른 반짝이
      e.tr = (e.tr || 0) - dt; if (e.tr <= 0 && ended == null) { e.tr = lite() ? 0.08 : 0.04; this._puffs(pts[pts.length - 1].clone(), 1, 0.3, { c1: 0x3a3448, c2: 0x0e0c14, a: 0.45, life: 0.6, rise: 0.1 });
        if (this.parts) { const q = pts[Math.floor(rnd(1, NR - 1))]; this.spark(q.clone().add(new THREE.Vector3(rnd(-0.2, 0.2), rnd(-0.1, 0.3), rnd(-0.2, 0.2))), { v: new THREE.Vector3(0, 0.5, 0), life: 0.55, s0: 0.18, s1: 0.03, col: rnd(0, 1) < 0.5 ? C.gold : 0x9aa8ff, k: rnd(0, 1) < 0.4 ? 1 : 0, a: 0.9 }); } }
    });
    const th = this.tpm(e, 'dragon', { ink: P.inkK.dragon, glowC: C.gold }), head = th ? null : this.pm(e, 'pt_dragon_head', { mode: 0, glowC: C.gold, glow: 0.15 });
    e.tube = this._tubeGeo(NR, NS); const body = this._m(e, 'pm', e.tube, 2), bu = body.material.uniforms;
    bu.uTint.value.setHex(0xffffff); bu.uGlowC.value.setHex(C.gold); bu.uMode.value = 0; bu.uA.value = 1; bu.uGlow.value = 0;
    const wh = [0, 1].map(() => { const rb = this._ribbon(e, 14); rb.material.uniforms.uW.value.setHex(0xfff4c0); rb.material.uniforms.uB.value.setHex(C.goldB); return { rb, h: [] }; });
    e.body = [th || head, body].filter(Boolean);
    this._snd('pt_roar');
    return this._h(e, {
      head: (ss) => { s = ss; },
      pierce: (hits) => { for (const p of hits) { const at = P3(p); at.y += 0.7; this.flash(at, C.inkB, C.ink, 0.8, 0.16, 1.0); this.drops(at, lite() ? 3 : 6, C.ink, { life: 0.5 });
        if (this.parts) { this.pang(at, 'pt_ink', { r: 0.55, n: 10, stars: lite() ? 1 : 2 }); this.crown(at, 0x2a2a58, 0.55, 0.5); } } },
      breath: (c, q) => { const at = P3(c); this._inkBurst(at, q.r); for (const p of q.hits) { const t = P3(p); t.y += 0.6; this.flash(t, C.inkB, C.ink, 0.6, 0.16, 1.0); if (this.parts) this.pang(t, 'pt_ink', { r: 0.5, n: 8, stars: 1 }); }
        if (this.parts) { this.psig(at, q.r, 'pt_ink', { pat: 1, grow: 0.18, life: 1.3, a: 0.9, spin: 1.5 }); this.beam(at, Math.min(0.9, q.r * 0.4), 3.2, 'pt_ink', { life: 0.7, a: 1.0 }); this.sparkle(at, q.r * 0.9, 'pt_ink', 18, { h: 0.6, up: 1.6, cols: [C.gold, 0xb8c4ff, 0xffffff] }); this.pang(at.clone().setY(at.y + 0.6), 'pt_gold', { r: Math.min(1.0, q.r * 0.5), n: 14 }); } },
      end: () => { if (ended == null) ended = e.t; },
    });
  }
  /** 용 몸통 관 지오메트리(종류별 풀 — 같은 크기면 다시 씀): 위치·노멀·정점 색 */
  _tubeGeo(NR, NS) {
    if (!this.tubes) this.tubes = []; const i = this.tubes.findIndex(g => g.userData.NR === NR && g.userData.NS === NS); if (i >= 0) return this.tubes.splice(i, 1)[0];
    const g = new THREE.BufferGeometry(), n = NR * NS + 1, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), idx = [];
    for (let r = 0; r < NR - 1; r++) for (let j = 0; j < NS; j++) { const a = r * NS + j, b = r * NS + (j + 1) % NS, c = a + NS, d = b + NS; idx.push(a, c, b, b, c, d); }
    for (let j = 0; j < NS; j++) idx.push((NR - 1) * NS + j, NR * NS, (NR - 1) * NS + (j + 1) % NS);   // 꼬리 끝 마개
    for (let r = 0; r < NR; r++) for (let j = 0; j < NS; j++) {   // 색: 등 먹 -> 옆 남색 -> 배 금빛, 세 고리마다 밝은 비늘 띠
      const a = j / NS * Math.PI * 2, top = Math.cos(a), band = r % 3 === 0 ? 1.25 : 1, k = (r * NS + j) * 3;
      const c = top > 0.3 ? [0.07, 0.07, 0.13] : top > -0.45 ? [0.18, 0.22, 0.46] : [0.9, 0.72, 0.38];
      col[k] = Math.min(1, c[0] * band); col[k + 1] = Math.min(1, c[1] * band); col[k + 2] = Math.min(1, c[2] * band); }
    col[n * 3 - 3] = 0.07; col[n * 3 - 2] = 0.07; col[n * 3 - 1] = 0.13;
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); g.setIndex(idx);
    g.userData = { NR, NS }; return g;
  }
  _tubeSet(g, pts, radius) {
    const { NR, NS } = g.userData, a = g.attributes.position, T = new THREE.Vector3(), B = new THREE.Vector3(), N = new THREE.Vector3(), d = new THREE.Vector3();
    for (let i = 0; i < NR; i++) {
      const p = pts[Math.min(i, pts.length - 1)], pa = pts[Math.max(0, i - 1)], pb = pts[Math.min(pts.length - 1, i + 1)];
      T.copy(pa).sub(pb); if (T.lengthSq() < 1e-8) T.set(0, 0, 1); T.normalize(); B.crossVectors(T, UP); if (B.lengthSq() < 1e-6) B.set(1, 0, 0); B.normalize(); N.crossVectors(B, T).normalize();
      const r = radius(i);
      for (let j = 0; j < NS; j++) { const ang = j / NS * Math.PI * 2, crest = j === 0 ? (i % 2 ? 1.15 : 1.45) * (i < NR - 2 ? 1 : 1) : (j === 1 || j === NS - 1) ? 1.08 : 1;   // 등 갈기 톱니
        d.copy(N).multiplyScalar(Math.cos(ang) * crest).addScaledVector(B, Math.sin(ang)); a.setXYZ(i * NS + j, p.x + d.x * r, p.y + d.y * r, p.z + d.z * r); }
    }
    const last = pts[Math.min(NR, pts.length) - 1], tl = pts[Math.min(NR - 1, pts.length - 1)]; d.copy(tl).sub(pts[Math.max(0, Math.min(NR, pts.length) - 2)]); a.setXYZ(NR * NS, last.x + d.x * 0.6, last.y + d.y * 0.6, last.z + d.z * 0.6);
    a.needsUpdate = true; g.computeVertexNormals(); g.computeBoundingSphere();
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
    if (this.parts) {   // fx2: 붓질을 따라 두꺼운 주홍·금 리본 두 줄 + 호를 따라 튀는 물감 덩이·불씨 + 바닥 색상환 잔광(실제 반지름 r 안)
      const fy = yawOf(o.f), half = (o.ang || 80) * Math.PI / 360, sw = o.sweep || 0.12, c0 = base.clone();
      [[0.62, 0xffe0a0, C.red, 0.2], [0.82, 0xffffff, C.ember, 0.13]].forEach(([rk, w0, w1, wd]) => this.trail((t) => { if (t > sw + 0.08) return null; const k = clamp01(t / sw), a = fy - half + 2 * half * easeOut(k); return new THREE.Vector3(c0.x + Math.sin(a) * r * rk, groundY(c0.x, -c0.z) + 0.45 + 0.15 * Math.sin(k * 3), c0.z + Math.cos(a) * r * rk); }, 'pt_red', { n: 16, w: wd, life: 0.6, w0, w1 }));
      const n = this._nk(12); for (let i = 0; i < n; i++) { const k = i / (n - 1), a = fy - half + 2 * half * k, rr = r * rnd(0.4, 0.85), q = new THREE.Vector3(c0.x + Math.sin(a) * rr, 0, c0.z + Math.cos(a) * rr); q.y = groundY(q.x, -q.z) + 0.3;
        this._later(sw * k, () => { this.bit('flame', q, { v: new THREE.Vector3(Math.sin(a) * 1.2, rnd(1.5, 2.8), Math.cos(a) * 1.2), g: -9, floor: q.y - 0.27, life: 0.6, s0: rnd(0.16, 0.26), s1: 0.1, col: i % 3 ? C.red : C.ember, glow: 0.2 }); this.spark(q, { v: new THREE.Vector3(0, rnd(1, 2), 0), life: 0.5, s0: 0.18, s1: 0.03, col: i % 2 ? C.ember : C.gold, k: 1, a: 1 }); }); }
      this.psig(c0, Math.min(r, 1.4), 'pt_red', { pat: 0, grow: 0.15, life: 0.9, a: 0.75, spin: 2 });
    }
    return this._h(this._fx('impasto', 0.8, () => {}), {
      hit: (p, ok) => { const at = P3(p); at.y += 0.6; if (!ok) return; this.flash(at, C.ember, C.red, 0.55, 0.14, 0.9);
        if (this.parts) { this.pang(at, 'pt_red', { r: 0.5, n: 9, stars: lite() ? 0 : 1 }); this.crown(at, C.red, 0.5, 0.5); this.blobs(at, 5, [C.red, C.ember, C.gold], { size: 0.9 }); }
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
      if (band2) { band2.position.copy(front).addScaledVector(f, -0.7).setY(front.y + 0.02); band2.rotation.set(0, yaw + Math.PI, 0); band2.scale.set(w * 0.92, 1, 1.3); band2.material.uniforms.uA.value = 1.0 * fk; band2.material.uniforms.uT.value = e.t * 1.3 + 2; }
      crest.position.copy(front).setY(front.y + 0.25); crest.quaternion.copy(this.camQ); crest.scale.set(w * 1.1, 0.6, 1); crest.material.uniforms.uA.value = 0.75 * fk;
      if (this.parts && ended == null) {   // fx2: 파도 머리의 흰 물보라·물방울·반짝이(폭 w 안), 양옆 청록 리본
        e.sp = (e.sp || 0) - (e.dt || 0.016); if (e.sp <= 0) { e.sp = lite() ? 0.06 : 0.025; const rg = _a.crossVectors(f, UP).normalize(), q = front.clone().addScaledVector(rg, rnd(-0.48, 0.48) * w); q.y += rnd(0.15, 0.55);
          this.spark(q, { v: new THREE.Vector3(0, rnd(0.6, 1.4), 0).addScaledVector(f, rnd(0.5, 1.5)), g: -2, life: 0.5, s0: rnd(0.16, 0.28), s1: 0.03, col: rnd(0, 1) < 0.5 ? 0xeaf8ff : 0x7ac8ff, k: rnd(0, 1) < 0.3 ? 1 : 0, a: 1.0 });
          this.bit('drop', q, { v: new THREE.Vector3(0, rnd(1.4, 2.6), 0).addScaledVector(f, rnd(0.8, 2)).addScaledVector(rg, rnd(-0.8, 0.8)), g: -9.8, floor: front.y, life: 0.55, s0: rnd(0.05, 0.09), s1: 0.03, col: rnd(0, 1) < 0.5 ? 0x8ac8ff : 0xdaf2ff, glow: 0.35 }); }
        ribs.forEach((rb, i) => { const rg = _a.crossVectors(f, UP).normalize(), q = front.clone().addScaledVector(rg, (i ? 0.5 : -0.5) * w * 0.9).addScaledVector(f, -0.2); q.y += 0.3 + 0.12 * Math.sin(e.t * 10 + i * 2); rb.h.unshift(q); if (rb.h.length > 14) rb.h.length = 14; if (rb.h.length > 1) { this._ribbonSet(rb.m, rb.h, 0.11); rb.m.material.uniforms.uA.value = 1.0 * fk; } });
      } else ribs.forEach(rb => { rb.m.material.uniforms.uA.value *= 0.85; });
      e.bl = (e.bl || 0) - (e.dt || 0.016); if (e.bl <= 0 && ended == null) { e.bl = 0.07; this._bleed(front.clone().addScaledVector(f, -0.6), w * 0.5); }
      const rgt = _a.crossVectors(f, UP).normalize();   // 파도 앞부분: 살짝 말린 투명한 청색 물감 띠(붓 자국 메시 셋)
      lips.forEach((m, i) => { m.position.copy(front).addScaledVector(rgt, (i - 1) * w / 3).addScaledVector(f, -0.1 - 0.15 * Math.abs(i - 1)); m.position.y += 0.08 + 0.05 * Math.sin(e.t * 12 + i); m.rotation.set(0, yaw, 0); m.rotateX(-0.5); m.scale.set(w / 3 * 1.15, 3.6, 2.6); m.material.uniforms.uA.value = (P.fx2 ? 0.9 : 0.72) * fk; });
    });
    const lips = [0, 1, 2].map(() => this.pm(e, 'pt_stroke', { mode: 1, tint: 0x5a9aff, see: true })).filter(Boolean);
    const band = this._m(e, 'wv', this.waveGeo, 3); band.material.uniforms.uW.value.setHex(0xe8f4ff); band.material.uniforms.uB.value.setHex(0x2a62f0);
    const band2 = P.fx2 ? this._m(e, 'wv', this.waveGeo, 3) : null; if (band2) { band2.material.uniforms.uW.value.setHex(0xffffff); band2.material.uniforms.uB.value.setHex(0x3a9ae8); }   // fx2: 두 겹 물결(옅다는 지적)
    const crest = this.puff(e, 0xe8f4ff, C.blue, 4);
    const ribs = this.parts ? [0, 1].map(() => { const m = this._ribbon(e, 14); m.material.uniforms.uW.value.setHex(0xeaf8ff); m.material.uniforms.uB.value.setHex(0x2a8ae8); return { m, h: [] }; }) : [];
    if (this.parts) this.psig(start.clone().addScaledVector(f, -0.3), Math.min(1.3, w * 0.6), 'pt_blue', { pat: 0, grow: 0.15, life: 0.8, a: 0.8, spin: -1.5 });
    return this._h(e, { front: (ss) => { s = ss; }, splash: (p, ok) => { const at = P3(p); at.y += 0.4; if (ok) { this.drops(at, lite() ? 3 : 6, C.blue, { speed: 1.2, up: 1.2, life: 0.5 });
        if (this.parts) { this.pang(at.clone().setY(at.y + 0.2), 'pt_blue', { r: 0.5, n: 9, stars: lite() ? 0 : 1 }); this.crown(at, 0x4a9aff, 0.55, 0.5); this._snd('pt_splash'); } } }, end: () => { if (ended == null) ended = e.t; } });
  }
  _bleed(at, r) {   // 파도 뒤 옅은 번짐(장식, 무피해)
    const life = 1.4, e = this._fx('bleed', life, (e) => { d.material.uniforms.uA.value = (P.fx2 ? 1.35 : 1.0) * (1 - smooth(0.3, 1, e.t / life)); });
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
    const gy0 = groundY(c3.x, -c3.z), cen3 = c3.clone().setY(gy0);
    if (this.parts) {   // fx2: 점묘 마법진(무지개 점 고리, 실제 바깥 고리 반지름) + 점이 찍힐 때마다 작은 별 반짝임 + 공중에서 금빛 점이 비처럼
      this.psig(cen3, rings[0], 'pt_gold', { pat: 3, grow: (o.start || 0.3) + rings.length * (o.gap || 0.15), life: (o.start || 0.3) + rings.length * (o.gap || 0.15) + 0.9, a: 0.8, spin: 0.7 });
      for (const d of ds) this._later(d.at, () => { this.spark(d.m.position.clone().setY(d.m.position.y + 0.1), { v: new THREE.Vector3(0, 0.6, 0), life: 0.4, s0: 0.22, s1: 0.03, col: C.gold, k: 1, a: 1 }); }, e);
      this.sparkle(cen3, rings[0] * 0.9, 'pt_gold', 14, { y: gy0 + 2.4, up: -4, h: 0.5, life: 0.7, cols: [C.gold, 0xffffff, 0xffb0d0, 0xa8e0ff] });
    }
    return this._h(e, {
      burst: (i, hits) => { for (const d of ds) if (d.ring === i && d.burst == null) d.burst = e.t; this.ring(c3, rings[i], C.gold, C.goldB, 0.25, 1.0, 0.85); for (const p of hits) { const at = P3(p); at.y += 0.6; this.flash(at, C.gold, C.goldB, 0.4, 0.12, 0.8); if (this.parts) this.pang(at, 'pt_gold', { r: 0.35, n: 6, stars: 0, noRing2: true }); }
        if (this.parts) { const n = this._nk(10); for (let k = 0; k < n; k++) { const a = k / n * 6.283 + i, q = new THREE.Vector3(c3.x + Math.cos(a) * rings[i] * 0.92, gy0 + 0.1, c3.z + Math.sin(a) * rings[i] * 0.92); this.spark(q, { v: new THREE.Vector3(0, rnd(1, 2), 0), life: 0.45, s0: 0.2, s1: 0.03, col: [C.gold, 0xffb0d0, 0xa8e0ff, 0xffffff][k % 4], k: k % 2, a: 1 }); } this._snd('pt_twinkle'); } },
      final: (i, hits) => { for (const d of ds) if (d.burst == null) d.burst = e.t; this.flash(c3.clone().setY(c3.y + 0.5), C.gold, C.goldB, 1.3, 0.2, 1.1); this.ring(c3, 1.1, C.gold, C.goldB, 0.35, 1.3, 0.2); if (!lite()) this.motes(c3, 10, { w: C.gold, b: C.goldB, r: 0.6, up: 1.5, life: 0.7 }); void i;
        if (this.parts) { this.beam(cen3, Math.min(0.9, rings[rings.length - 1] * 0.8), 3.4, 'pt_gold', { life: 0.7, a: 1.0 }); this.pang(cen3.clone().setY(gy0 + 0.6), 'pt_gold', { r: Math.min(1.0, rings[rings.length - 1]), n: 16, ground: gy0, stars: lite() ? 1 : 4 });
          for (const p of hits) { const at = P3(p); at.y += 0.6; this.pang(at, 'pt_gold', { r: 0.4, n: 6, stars: 1 }); } } },
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
    if (this.parts) {   // fx2: 색상환 마법진(실제 반경) + 세 색 리본이 팔레트로 나선을 그리며 모임 -> 0.45 s 팔레트에서 '팡' + 물감 꽃잎이 범위 안으로 흩날림
      const gy = groundY(c3.x, -c3.z); this.psig(c3.clone().setY(gy), o.r, 'pt_violet', { pat: 0, grow: 0.3, life: 1.3, a: 0.85, spin: 2.2 });
      [C.red, C.blue, C.gold].forEach((col, i) => this.trail((t) => { if (t > 0.42) return null; const k = easeOut(clamp01(t / 0.42)), a = i * 2.094 + k * 7, rr = o.r * 0.8 * (1 - k); return new THREE.Vector3(c3.x + Math.cos(a) * rr, gy + 0.3 + (top.y - gy - 0.3) * k, c3.z + Math.sin(a) * rr).lerp(top, k * k); }, 'pt_violet', { n: 14, w: 0.13, life: 0.6, w0: 0xffffff, w1: col }));
      this._later(0.45, () => { this.pang(top, 'pt_violet', { r: 0.6, n: 14, ground: gy }); this.beam(c3.clone().setY(gy), 0.5, 2.0, 'pt_violet', { life: 0.5, a: 0.8 });
        const n = this._nk(16); for (let i = 0; i < n; i++) { const a = rnd(0, 6.283), sp = rnd(1, 2.6) * Math.min(1, o.r / 2.6); this.bit('petal', top, { v: new THREE.Vector3(Math.cos(a) * sp, rnd(0.5, 1.6), Math.sin(a) * sp), g: -2.2, drag: 1.2, floor: gy + 0.03, life: rnd(0.8, 1.1), s0: rnd(0.12, 0.18), s1: 0.1, col: [C.red, C.blue, C.gold, C.violet][i % 4], glow: 0.25, wx: rnd(-5, 5), wy: rnd(-5, 5) }); } }, e);
      this._snd('pt_sigil');
    }
    return this._h(e, {
      react: (kind, p) => { const at = P3(p); at.y += 0.5; if (this.parts) this.pang(at, kind === 'steam' ? 'pt_violet' : kind === 'wave' ? 'pt_blue' : kind === 'core' ? 'pt_red' : 'pt_rainbow', { r: 0.55, n: 10, stars: lite() ? 1 : 2 });
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
    if (this.parts) {   // fx2: 큰 색상환 마법진 + 세 색 리본이 머리 위 추상화로 감겨 오름 + 무지개 반짝이가 모임
      const b0 = P3(pc.pos); this.psig(b0, 2.2, 'pt_rainbow', { pat: 0, grow: dur * 0.8, life: dur + 0.5, a: 0.9, spin: 1.6, follow: () => P3(pc.pos) });
      const topAt = () => P3(pc.pos).setY((pc.pos.y || 0) + 3.2);
      cols.forEach((col, i) => this.trail((t) => { if (t > dur) return null; const b = P3(pc.pos), k = easeOut(clamp01(t / dur)), a = i * 2.094 + k * 9, rr = 1.3 * (1 - 0.6 * k); return new THREE.Vector3(b.x + Math.cos(a) * rr, b.y + 0.2 + 3.0 * k, b.z + Math.sin(a) * rr); }, 'pt_rainbow', { n: 16, w: 0.14, life: dur + 0.25, w0: 0xffffff, w1: col }));
      this.gather(b0, 2.0, topAt, 'pt_rainbow', 16, dur);
    }
    return this._h(e, { cancel: () => this._end(e, 0.3), done: () => { e.doneT = e.t; } });
  }
  k_spectrum(pc, o) {
    if (o.pre && o.pre.done) o.pre.done();
    const c3 = P3(pc.pos), r = o.r || 6, kinds = o.kinds || [], cols = kinds.length ? kinds.map(k => COLOR_HEX[k]) : [C.violet, C.white], life = 1.0;
    const e = this._fx('spectrum', life, (e) => { const k = e.t / life; rings.forEach((m, i) => { const kk = clamp01((e.t - i * 0.06) / 0.5); m.material.uniforms.uP.value = easeOut(kk); m.material.uniforms.uA.value = 0.6 * (1 - smooth(0.45, 1, k)); }); });
    const rings = cols.map((col, i) => { const m = this.pg(e, 0, col, col, 1 + i); m.position.copy(c3).setY(groundY(c3.x, -c3.z) + 0.04 + i * 0.01); m.scale.setScalar(r * (1 - i * 0.08)); return m; });
    this._paintArc(c3, pc.facing, r * 0.9, 360, cols[0], 0.3, 0.9, { lift: 0.06 });
    for (let i = 0; i < cols.length; i++) this.ring(c3, r, cols[i], cols[i], 0.5 + i * 0.1, 0.9, 0.15);
    if (this.parts) {   // fx2: 실제 반경의 색상환 마법진(잔광) + 가운데 무지개 빛기둥 셋 + 반경 안 무지개 반짝이 비 + 별 팡 — 가장 밝은 순간 = 피해 순간
      const gy = groundY(c3.x, -c3.z), g3 = c3.clone().setY(gy);
      this.psig(g3, r, 'pt_rainbow', { pat: 0, grow: 0.25, life: 1.8, a: 0.9, spin: 1.2, fade: 0.8 });
      cols.slice(0, 3).forEach((col, i) => { const el = col === C.red ? 'pt_red' : col === C.blue ? 'pt_blue' : col === C.gold ? 'pt_gold' : 'pt_violet'; this._later(i * 0.07, () => this.beam(g3, 0.9 - i * 0.2, 4.0 + i * 0.5, el, { life: 0.75, a: 1.0 }), e); });
      this.sparkle(g3, r * 0.92, 'pt_rainbow', 30, { y: gy + 0.1, h: 0.4, up: 2.2, life: 1.0, cols: [0xff9ab0, 0xffd870, 0x9ae8a0, 0x8ac8ff, 0xd8a0ff, 0xffffff] });
      this.pang(g3.clone().setY(gy + 0.8), 'pt_rainbow', { r: 1.0, n: 18, ground: gy, stars: lite() ? 2 : 5 });
      this._snd('pt_sigil');
    }
    return this._h(e, { core: (cr) => { this.flash(c3.clone().setY(c3.y + 0.6), C.gold, C.goldB, 1.4, 0.2, 1.0); this.ring(c3, cr, C.gold, C.goldB, 0.35, 1.2, 0.2); if (this.parts) this.pang(c3.clone().setY(c3.y + 0.6), 'pt_gold', { r: Math.min(1, cr * 0.6), n: 12, stars: 2 }); },
      land: (c, rr) => { const at = P3(c); this.ring(at, rr, C.violet, C.violetB, 0.45, 1.1, 0.3); if (this.parts) this.pang(at.clone().setY(at.y + 0.5), 'pt_violet', { r: Math.min(0.6, rr), n: 8, stars: 1 }); } });
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
    if (this.parts) {   // fx2: 꽃 마법진(액자·덩굴, 실제 반경 — 들판이 있는 동안 옅게 남음) + 피어날 때 꽃잎·반짝이 + 지속 중 꽃잎이 가끔 떠오름
      const gy = groundY(c3.x, -c3.z), g3 = c3.clone().setY(gy), dur = o.dur || 8;
      e.sig = this.psig(g3, r, 'pt_green', { pat: 2, grow: grow, life: dur + 0.6, a: 0.6, spin: 0.3, fade: 0.6 });
      this._later(grow * 0.6, () => { this.sparkle(g3, r * 0.9, 'pt_green', 16, { y: gy + 0.1, h: 0.5, up: 1.4, cols: [0xffc8e0, 0xfff0a0, 0xffffff, 0xd0ffa8] }); this._snd('pt_bloom'); }, e);
      const up = e.update; e.update = (q, dt) => { up(q, dt); if (q.t > grow && this._fadeK(q) > 0.5) { q.pt = (q.pt || 0) - dt; if (q.pt <= 0) { q.pt = lite() ? 0.4 : 0.18; const a = rnd(0, 6.283), rr = Math.sqrt(rnd(0, 0.85)) * r, at = new THREE.Vector3(c3.x + Math.cos(a) * rr, gy + 0.3, c3.z + Math.sin(a) * rr);
        this.bit('petal', at, { v: new THREE.Vector3(rnd(-0.2, 0.2), rnd(0.4, 0.8), rnd(-0.2, 0.2)), g: 0.1, life: 1.4, s0: 0.1, s1: 0.06, col: cols[Math.floor(rnd(0, cols.length))], glow: 0.25, wx: rnd(-3, 3), wy: rnd(-3, 3), outK: 0.6 }); } } };
    }
    return this._h(e, {
      pulse: (healed) => { const lim = lite() ? 2 : 4; healed.slice(0, 4).forEach((p, j) => { const to = P3(p); to.y += 0.9; fl.slice(j * 2, j * 2 + lim).forEach(q => this.motes(q.fw.position.clone(), 1, { w: 0xfff8c0, b: C.green, to, life: 0.55, r: 0.05, a: 1.0 }));
        if (this.parts) { const b = P3(p); this.sparkle(b, 0.45, 'pt_green', 7, { h: 1.2, up: 1.2, cols: [0xd0ffa8, 0xfff0b0, 0xffffff] }); this.bit('star', b.clone().setY(b.y + 1.6), { v: new THREE.Vector3(0, 1.2, 0), g: -1, life: 0.6, s0: 0.12, s1: 0.06, col: 0xfff0a0, glow: 0.4, wz: 6, rx: 0, rz: 0 }); } }); },
      gallery: () => { this.ring(c3, r, C.gold, C.goldB, 0.6, 1.2, 0.2); if (this.parts) { const gy = groundY(c3.x, -c3.z); this.psig(c3.clone().setY(gy), r, 'pt_gold', { pat: 2, grow: 0.2, life: 1.0, a: 0.8 }); this.sparkle(c3.clone().setY(gy), r * 0.9, 'pt_gold', 14, { y: gy + 0.1, up: 1.6 }); } },
      end: () => { this._end(e, 0.6); if (e.sig) e.sig.end(0.6); }, extend: () => { }, pulseRing: () => { },
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
    if (this.parts) {   // fx2: 액자 마법진(벽 반폭) + 일어설 때 벽 위 가장자리를 따라 흐르는 금빛 붓선·흰 반짝이·먼지, 서 있는 동안 위쪽 금빛 반짝임
      const gy = groundY(c3.x, -c3.z), g3 = c3.clone().setY(gy), rg = _a.crossVectors(f, UP).normalize().clone();
      this.psig(g3, Math.min(w / 2, 1.8), 'pt_white', { pat: 2, grow: grow * 0.8, life: grow + 0.9, a: 0.85, spin: 0.5 });
      this._later(grow * 0.6, () => { this.trail((t) => { if (t > 0.35) return null; const k = easeOut(clamp01(t / 0.35)); return g3.clone().addScaledVector(rg, (k - 0.5) * w).addScaledVector(f, -0.15).setY(gy + H * smooth(0, 0.6, t / 0.35) + 0.05); }, 'pt_white', { n: 16, w: 0.12, life: 0.7, w0: 0xffffff, w1: C.gold });
        this._hpuffs(g3, lite() ? 3 : 6, w * 0.5, { c1: 0xf8f4ff, c2: 0xa8a0c8, a: 0.4, life: 0.6, rise: 0.4 });
        const n = this._nk(12); for (let i = 0; i < n; i++) this.spark(g3.clone().addScaledVector(rg, rnd(-0.5, 0.5) * w).setY(gy + rnd(0.2, H)), { v: new THREE.Vector3(0, 0.8, 0), life: 0.6, s0: 0.18, s1: 0.03, col: i % 3 ? 0xffffff : C.gold, k: i % 2, a: 0.9 });
        this._snd('pt_sigil'); }, e);
      const up = e.update; e.update = (q, dt) => { up(q, dt); if (endT == null && q.t > grow + 0.3) { q.gl = (q.gl || 0) - dt; if (q.gl <= 0) { q.gl = lite() ? 0.5 : 0.25; this.spark(g3.clone().addScaledVector(rg, rnd(-0.5, 0.5) * w).addScaledVector(f, -0.15).setY(gy + H + 0.05), { v: new THREE.Vector3(0, 0.4, 0), life: 0.6, s0: 0.14, s1: 0.02, col: C.gold, k: 1, a: 0.8, tw: 14 }); } } };
    }
    return this._h(e, {
      crack: (k) => { crack = k; },
      block: (p) => { const at = P3(p); at.y += 1.0; this.flash(at, 0xffffff, 0x8a8aa0, 0.5, 0.12, 0.7); if (!lite()) this.drops(at, 3, 0xf4f0e8, { life: 0.4 }); if (this.parts) this.pang(at, 'pt_white', { r: 0.35, n: 6, stars: 0, noRing2: true }); },
      gallery: () => { this.flash(c3.clone().setY(c3.y + 1.2), C.gold, C.goldB, 1.2, 0.2, 0.8); if (this.parts) this.sparkle(c3.clone().setY(groundY(c3.x, -c3.z)), Math.min(w / 2, 1.6), 'pt_gold', 12, { h: 2, up: 1.2 }); },
      pulse: () => { this.ring(c3, w / 2 + 0.5, C.violet, C.violetB, 0.4, 0.8, 0.3); },
      end: (w2) => { if (endT == null) { endT = e.t; why = w2; if (why === 'break') { this.drops(c3.clone().setY(c3.y + 1), lite() ? 4 : 8, 0xf4f0e8, { speed: 1.4, life: 0.6 });
        if (this.parts) { const at = c3.clone().setY(groundY(c3.x, -c3.z) + 1.0); this.blobs(at, 12, [0xffffff, 0xf0ecff, C.gold], { kind: 'petal', size: 2.2, speed: 1.0, glow: 0.2 }); this.pang(at, 'pt_white', { r: 0.6, n: 10 }); } } } void why; },
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
    if (this.parts) {   // fx2: 먹 원상 마법진(영역 반경, 옅게 남음) + 구름 속 번쩍임·푸른 반짝이, 번개마다 빛기둥 + '팡' + 전기 별
      const gy = groundY(c3.x, -c3.z), dur = o.dur || 7;
      e.sig = this.psig(c3.clone().setY(gy), r, 'pt_storm', { pat: 1, grow: grow, life: dur + 0.8, a: 0.55, spin: 0.4, fade: 0.7 });
      const up = e.update; e.update = (q, dt) => { up(q, dt); if (q.t > grow && this._fadeK(q) > 0.5) { q.fl = (q.fl || 0) - dt; if (q.fl <= 0) { q.fl = lite() ? 0.3 : 0.12; const a = rnd(0, 6.283), rr = rnd(0, r * 0.6);
        this.spark(new THREE.Vector3(c3.x + Math.cos(a) * rr, gy + H + rnd(-0.3, 0.3), c3.z + Math.sin(a) * rr), { life: 0.25, s0: rnd(0.3, 0.6), s1: 0.1, col: rnd(0, 1) < 0.5 ? 0xa8c8ff : 0xe8f0ff, k: 0, a: 0.7 }); } } };
    }
    return this._h(e, {
      rain: () => { },
      bolt: (p, hits) => { const at = P3(p), gy = groundY(at.x, -at.z), top = new THREE.Vector3(at.x, gy + H, at.z);
        // 리마스터(높음·보통, js/rmfx.js lightning): 갈라지는 번개 세 번 연속(번쩍일 때마다 새 경로) + 땅에 남는 전류(번개 반경 안) + 맞은 적 몸의 전류 — 예전 꺾인 선은 낮음에서만
        const rmB = this.rm && gfxOn() && this.rm.ok() ? this.rm.lightning(top.clone().add(new THREE.Vector3(rnd(-0.4, 0.4), 0, rnd(-0.4, 0.4))), at.clone().setY(gy), { col: 0x8aa8ff, hi: 0xf4f8ff, deep: 0x1c1a4a, w: 0.24, strikes: 3, gap: 0.07, branches: 4, r: Math.min(1.2, o.boltR || 1.2), linger: 0.65, floorY: gy, flashSize: 1.1 }) : null;
        if (rmB) for (const q of hits) this.rm.crawl({ pos: q, radius: 0.5 }, { dur: 0.55, col: 0x8aa8ff, deep: 0x1c1a4a });
        if (!rmB) this._bolt(top, at.clone().setY(gy)); this.flash(at.clone().setY(gy + 0.4), 0xe8f0ff, 0x6a8aff, 1.0, 0.14, 1.0); this.ring(at.clone().setY(gy), 1.2, 0xc8d8ff, 0x3a4a8a, 0.3, 1.0, 0.2); for (const q of hits) { const t = P3(q); t.y += 0.6; this.flash(t, 0xe8f0ff, 0x6a8aff, 0.5, 0.12, 0.8); if (this.parts) this.pang(t, 'pt_storm', { r: 0.4, n: 7, stars: 1 }); }
        if (this.parts) { const g3 = at.clone().setY(gy); this.beam(g3, 0.45, H, 'pt_storm', { life: 0.35, a: 1.1 }); this.pang(g3.clone().setY(gy + 0.4), 'pt_storm', { r: 0.6, n: 12, ground: gy, stars: lite() ? 1 : 3 }); if (!rmB) this._bolt(top.clone().add(new THREE.Vector3(rnd(-0.3, 0.3), 0, rnd(-0.3, 0.3))), g3); } },
      gallery: () => { this.ring(c3, r, C.gold, C.goldB, 0.6, 1.0, 0.2); if (this.parts) this.sparkle(c3.clone().setY(groundY(c3.x, -c3.z) + P.cloudH), r * 0.6, 'pt_gold', 12, { up: -1.5 }); },
      pulse: () => { this.ring(c3, r, C.violet, C.violetB, 0.4, 0.8, 0.3); },
      end: () => { this._end(e, 0.6); if (e.sig) e.sig.end(0.6); },
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
    if (this.parts) {   // fx2: 금 액자 마법진 + 화폭 셋에 금빛이 모임 + 화폭마다 짧은 빛기둥
      const b0 = P3(pc.pos); this.psig(b0, 1.8, 'pt_gold', { pat: 2, grow: dur * 0.8, life: dur + 0.7, a: 0.9, spin: 0.9, follow: () => P3(pc.pos) });
      fs.forEach((m, i) => { this.gather(b0, 1.6, () => m.position.clone().setY(m.position.y + 0.6), 'pt_gold', 6, dur); });
      this._later(dur * 0.9, () => fs.forEach((m) => this.beam(m.position.clone().setY(groundY(m.position.x, -m.position.z)), 0.4, 2.6, 'pt_gold', { life: 0.5, a: 0.8 })), e);
      this._snd('pt_sigil');
    }
    return this._h(e, { cancel: () => this._end(e, 0.3), done: () => { e.doneT = e.t; } });
  }
  k_gallery(pc, o) {   // 작품마다 금빛 붓선(등 뒤 화폭 -> 작품)
    if (o.pre && o.pre.done) o.pre.done();
    const from = P3(pc.pos).setY((pc.pos.y || 0) + 1.6);
    for (const p of (o.works || []).slice(0, lite() ? 4 : 8)) { const to = P3(p); to.y = groundY(to.x, -to.z) + 0.6; this._streakLine(from, to, C.gold, 0.8); this.flash(to, C.gold, C.goldB, 0.7, 0.2, 0.9);
      if (this.parts) {   // fx2: 금빛 리본이 화폭에서 작품까지 포물선으로 날아가 '팡' + 작품 자리 빛기둥·반짝이
        const mid = from.clone().lerp(to, 0.5); mid.y += 1.6; const t0 = 0.35;
        this.trail((t) => { if (t > t0 + 0.05) return null; const k = easeOut(clamp01(t / t0)), a = from.clone().lerp(mid, k), b = mid.clone().lerp(to, k); return a.lerp(b, k); }, 'pt_gold', { n: 14, w: 0.13, life: 0.75, w0: 0xffffff, w1: C.goldB });
        this._later(t0, () => { const g = to.clone().setY(to.y - 0.6); this.pang(to, 'pt_gold', { r: 0.55, n: 10, ground: g.y }); this.beam(g, 0.45, 2.4, 'pt_gold', { life: 0.55, a: 0.85 }); });
      } }
    this.ring(P3(pc.pos), 1.4, C.gold, C.goldB, 0.5, 1.0, 0.2);
    if (this.parts) { const b = P3(pc.pos); this.pang(b.clone().setY(b.y + 1.6), 'pt_gold', { r: 0.6, n: 12, ground: b.y }); this.sparkle(b, 1.2, 'pt_gold', 14, { h: 2.0, up: 1.0 }); }
    return null;
  }
}
