// 한약사 2차 스킬 이펙트·소환물 모습 (2026-11-16 '본초 도사'). 규칙은 js/herbal.js(HerbalKit), 메시는 tools/blender/fx_herbal.py ->
// assets/fx/fx_herbal.glb.json(탕관·호리병·천년삼 동자·영지 사슴·약초꽃·두루마리·침·뿌리·청룡 머리·주작·돌기둥·거북 등껍질·약갑 판, 정점 색만).
// 시각 정체성: 펼친 약초 -> 기운 추출 -> 식물·영물로 나타남 -> 타격 또는 회복. 회복 = 호박색 + 따뜻한 금빛, 약초·생명 = 옥빛·청록, 독 = 보라,
// 오행: 목 청록(자라는 뿌리) · 화 주홍(날개) · 토 황토(땅속 맥·돌기둥) · 금 백금(가는 침·발톱 선) · 수 청옥(낮은 물결·등껍질 무늬) — 색만이 아니라 모양·움직임으로도 구분.
// 원칙: 가장 밝은 순간 = 실제 피해·회복 순간, 바닥 무늬·고리는 실제 판정 반경(넘지 않음), 화면 전체 섬광 없음, 전역 블룸·노출·히트스톱은 건드리지 않음.
// 메시·재질은 종류별 풀에서 재사용(CookFx를 이어받음), 프레임마다 새 지오메트리·재질·텍스처를 만들지 않음(두루마리 그림 텍스처는 한 번만).
// 저사양(휴대폰·그래픽 효과 끔): 입자·잎·장식 꽃 수만 줄임 — 소환물·뿌리·고리·섬광은 그대로.
// 종류 (HerbalFx.make(kind, a, o) ← js/skillrt.js FX.herbal ← js/herbal.js kit.fx):
//   pre(pc,{what,lead,hand})  누른 순간: sow 손에서 씨앗이 흩어짐 / brew 두 손 사이 기운 원 / raise 손바닥 빛 / moxa 손끝 쑥뜸 불(주작이 이어받음) / needles 어깨 뒤 침 부채 / gourd 손의 호리병
//   cycle(pc,{dur})           대주천: 발끝 -> 몸 둘레 나선 -> 손끝 청록 기운(발동 0.9 s), 버프 중 움직이면 잎 잔상. end()
//   armor(pc,{dur})           금강 약갑: 어깨·팔뚝의 옥빛 판(반투명). refresh(d) · flash(dir 게임 xz) 맞은 쪽 잎맥 금빛 · end()
//   steam(c,{r,dur,grow})     백초 훈증진: 가운데 탕관 + 둥근 약초 무늬(= 실제 r) + 가장자리 약초 + 옅은 김. pulse(healed[], cleansed[]) 호박 방울 / 흰 꽃잎 물결 · extend(k) · end()
//   pill(pc,{absorb})         백초귀원: 둥글게 약초 -> 금빛 환약 응집 -> 흡수(absorb()) -> 빛의 약초꽃
//   root/ginseng/deer(s,{grow}) 소환물 모습(handle: update(dt, s) · bite/whip/ram/stomp · cheer · hurt · buff(on) · refresh · regrow · wilt · dispose)
//   drop(s,{to,t})            금빛 약방울이 주인에게 날아감   bloom(c,{r,dur,grow,tick}) 자운화: 봉오리 -> 개화 -> spore(hits[]) 포자 고리 -> 시듦
//   garden(c,{r,dur})         신농백초원: 하늘의 두루마리 -> 빛으로 내려온 약초 -> 낮은 약초밭·가장자리 꽃·땅 뿌리. erupt(hits[]) · end()
//   dragonLine(o,{f,n,step,gap,w}) 청룡승근: root(i, last, hits[]) 차례로 솟는 뿌리, 마지막 = 청룡 머리
//   bird(from,{dir,pre})      주작천구: set(pos) · impact(c,{dir,wing,core,depth,hits}) 좌우 날개 불꽃 · dispose()
//   leyline(pc,{from,c,r,run}) 황정지맥: 금빛 맥이 땅속을 달림 -> ring(n) 둥근 지맥 -> pillar(pos, ok) 낮은 돌기둥·뿌리 -> end()
//   needles(from,{f,n,pre})   백호유침: needle(t,{at,curve}) -> {land(t, ok), fade()} · miss({f,r,ang}) · mark(t) · claw(t, f)
//   wave(o,{f,len,w})         현무약해: front(s) 낮은 청옥 물결 + 처음 0.35 s 등껍질 무늬 · splash(pos) · feed(c) · end()
//   (2026-11-20 처방 5종) cups(pc,{hand,to,keep,hold}) 탕약 나누기: 손 앞 탕관 -> 두 잔 -> fly(pos,t)/arrive(t)·spill() · 남은 한 잔: drink()/expire()
//   tonic(pc,{ticks,every,summons,dur}) 보중익기탕: 가슴 높이 약잔 + 위로 오르는 금빛 김 tick(i) · 영물 발밑 위로 감기는 금빛 바람
//   purge(pc,{hand,to})       구풍해독탕: 약액 한 줄기 fly(pos,t) -> burst(t,{r,pushed,shieldDur}) 대상에서 바깥으로 퍼지는 잎 + 보호막 막
//   meridian(t,{times,from})  소경활혈탕: 몸 위 짙은 먹선 맥로 + 세 마디 node(i, ok, last) — 붉은 빛이 차례로, 셋째는 크게 · fade()
//   wuling(c,{r,run,seals})   오령산: 다섯 푸른 약인 -> 가운데로 모이는 다섯 물길(안쪽으로 흐르는 갈매기 무늬) flow(k) -> surge(hits) 안쪽으로 조여드는 마지막 물결
//   allyMark(s)               고른 내 영물 발밑 금빛 고리(end)
//   brew(pc,{n})              보원탕 제작 완성(제작 메뉴 '한약사 탕제'): 탕관 둘레를 도는 약초 -> 빠짐 -> 호박빛 -> 금빛 김 -> 완성 탕약이 떠오름
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CookFx } from './cookfx.js';
import { gfxOn } from './gfxq.js';

export const HERBFX = {
  intensity: 1.0,
  col: { amber: 0xffb850, amberB: 0xd86a10, gold: 0xffe08a, goldB: 0xffa020, jade: 0x7af0c0, jadeB: 0x1a9a80, teal: 0x5af0e0, tealB: 0x0a8a90,
    purple: 0xd090ff, purpleB: 0x7a28c0, vermil: 0xffb060, vermilB: 0xff3010, ochre: 0xffd070, ochreB: 0xb07018, plat: 0xf4f8ff, platB: 0xa8b8d0,
    sapph: 0x9ad8ff, sapphB: 0x2a5ae0, white: 0xffffff, ash: 0xb8b0a8, ashB: 0x5a5048 },
  ginseng: { size: 1.15, hop: 0.34 },
  deer: { size: 1.25 },
  root: { size: 1.0, n: 5 },
  scroll: { h: 3.6, w: 3.0, paper: 1.1 },
  // fx2(2026-11-16 '더 화려하게'): 시전 마법진 -> 본체(큰 메시·리본·입자) -> 명중 섬광·별 -> 잔광 문양. 크기는 실제 판정 반경 안.
  fx2: true,
  cap: { spk: 700, p3: 180 },                    // 인스턴스 입자 상한(종류당 draw call 1)
  liteK: 0.45,
  spk: { s: 1.45, a: 1.45 },                     // 반짝이 크기·밝기 배율(가산 — 색 × 밝기는 블룸 문턱 2.6 아래)                                   // 휴대폰·그래픽 효과 끔: 입자 수 배율(마법진·빛기둥·소환물·리본은 그대로)
  tripo: { ginseng: 1.5, dragon: 1.9, pot: 0.62, phoenix: 1.25 },   // Tripo 모델 크기(m) — assets/fx/fx_herbal_tripo.glb.json, 없으면 절차 메시
  tripoYaw: { ginseng: 0, dragon: 0, pot: 0, phoenix: 0 },          // 모델 앞 방향 보정(라디안)
  sfxGap: { hb_drop: 0.5, hb_hop: 0.35, hb_spore: 0.6, hb_stomp: 0.4, hb_armor: 0.5 },
  // 원소 색: [선, 바탕, 금테] — 마법진·빛기둥·별
  el: { wood: [0x7af0d0, 0x1a9a80, 0xffe08a], fire: [0xffb070, 0xff4018, 0xffd870], earth: [0xffd88a, 0xb07018, 0xfff0b0], metal: [0xf4f8ff, 0x8aa0c8, 0xffe08a],
        water: [0x9ad8ff, 0x2a5ae0, 0xd8f4ff], heal: [0xffd08a, 0xd86a10, 0xfff0b0], poison: [0xe0a8ff, 0x7a28c0, 0xffd0f0], lotus: [0xffc8e8, 0xd86aa8, 0xffe08a] },
};
const H = HERBFX, C = HERBFX.col;
const P3 = (p) => new THREE.Vector3(p.x, p.y || 0, -p.z);
const D3 = (f) => new THREE.Vector3(f.x, 0, -f.z).normalize();
const yawOf = (f) => Math.atan2(f.x, -f.z);
const lite = () => { const G = window.G; return !!(G && ((G.input && G.input.mobile) || (G.settings && G.settings.graphicsFx === false))); };
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const easeBack = (x) => { x = clamp01(x); const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
let SEED = 7; const rnd = (a, b) => { SEED = (SEED * 16807) % 2147483647; return a + (SEED / 2147483647) * (b - a); };   // 자기 난수 — 게임 Math.random(명중·치명)을 건드리지 않음
const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion();
const groundY = (x, z) => { try { return window.G.zone.geo.ground(x, z).y; } catch (e) { return 0; } };

const HS_VS = `attribute vec3 color; varying vec3 vC, vN, vV;
void main(){ vC = color; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const HS_FS = `uniform vec3 uTint, uRim, uGlowC; uniform float uA, uGlow, uSpec, uVein; varying vec3 vC, vN, vV;
void main(){
  vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
  vec3 L = normalize(vec3(-.4, .8, .5)); float d = max(0., dot(n, L)), rim = pow(1. - max(0., dot(n, vV)), 2.4);
  vec3 base = vC * uTint, c = base * (.5 + .7 * d) + uRim * rim * .45;
  vec3 h = reflect(-L, n); c += vec3(1., .96, .86) * pow(max(0., dot(h, vV)), 22.) * uSpec;
  float vein = smoothstep(.62, .9, vC.g - vC.r * .5) * uVein;   // 밝은 옥색 잎맥(약갑 판)만 금빛으로
  c += uGlowC * (uGlow + vein);
  gl_FragColor = vec4(c, uA);
}`;
// 바닥 원판(uv 0..1 = 반지름 1 원), uK: 0 훈증진 약초 만다라 / 1 자운화 / 2 신농백초원 / 3 황정지맥 / 4 가는 고리만. uP = 펼쳐진 정도, uT = 시간, uA = 불투명도
const GD_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const GD_FS = `uniform vec3 uW, uB; uniform float uA, uK, uP, uT; varying vec2 vUv;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec2 p = vUv * 2. - 1.; float r = length(p), a = atan(p.y, p.x), rim = smoothstep(.985, .955, r) * smoothstep(.9, .955, r);
  float reveal = smoothstep(uP + .02, uP - .06, r), out_ = step(r, 1.);
  float al = 0.; vec3 col = uB;
  if (uK < .5) {   // 약초 만다라: 바깥 고리(실제 범위) + 안쪽 점선 고리 + 8잎 + 옅은 바탕
    float leaf = 0.; for (int i = 0; i < 8; i++) { float aa = float(i) * .7854; vec2 q = vec2(cos(aa), sin(aa)); float t = dot(p, q), s = abs(p.x * q.y - p.y * q.x);
      leaf = max(leaf, smoothstep(.02, 0., s - .11 * sin(clamp((t - .28) / .5, 0., 1.) * 3.1416)) * step(.28, t) * step(t, .78)); }
    float ring2 = smoothstep(.02, .0, abs(r - .84)) * step(.5, fract(a * 6.366 + uT * .3));
    float c0 = smoothstep(.2, .0, abs(r - .22)) * .5;
    al = rim * 1. + leaf * .32 + ring2 * .5 + c0 * .4 + .07 * smoothstep(1., .2, r);
    col = mix(uB, uW, clamp(rim + leaf * .4 + ring2, 0., 1.));
  } else if (uK < 1.5) {   // 자운화: 옅은 보라 바탕 + 얼룩 + 테두리
    float bl = h21(floor(p * 7.)) * .5 + .5 * sin(p.x * 9. + uT) * sin(p.y * 8. - uT * .7);
    al = rim * .8 + .1 * smoothstep(1., .3, r) * (.6 + .4 * bl); col = mix(uB, uW, rim);
  } else if (uK < 2.5) {   // 신농백초원: 낮은 풀빛 바탕 + 금빛 테두리 이중선 + 넝쿨 무늬
    float vine = smoothstep(.03, .0, abs(sin(a * 5. + r * 9.) * .08 - (r - .5) * .0) ) * 0.;
    float ring2 = smoothstep(.015, .0, abs(r - .93));
    float swirl = smoothstep(.04, .0, abs(fract(a * 1.909 + r * 2.2 - uT * .05) - .5) - .45) * smoothstep(.95, .2, r);
    al = rim * .95 + ring2 * .55 + swirl * .16 + .09 * smoothstep(1., .1, r) + vine; col = mix(uB, uW, clamp(rim + ring2 + swirl * .5, 0., 1.));
  } else if (uK < 3.5) {   // 황정지맥: 가운데서 뻗는 금빛 맥(가지) + 바깥 고리, uP로 자라남
    float v = 0.; for (int i = 0; i < 7; i++) { float aa = float(i) * .8976 + .3; float w = aa + sin(r * 7. + float(i)) * .18; vec2 q = vec2(cos(w), sin(w)); float s = abs(p.x * q.y - p.y * q.x), t = dot(p, q);
      v = max(v, smoothstep(.025, .0, s - .008) * step(0., t)); }
    float pulse = .6 + .4 * sin(uT * 6. - r * 8.);
    al = (rim * 1.1 + v * .8 * pulse + smoothstep(.02, 0., abs(r - .55)) * .35) * reveal + .05 * smoothstep(1., .2, r); col = mix(uB, uW, clamp(rim + v * .6, 0., 1.));
  } else { al = rim; col = uW; }
  gl_FragColor = vec4(col, clamp(al, 0., 1.) * uA * out_);
}`;
// 현무약해 물결: 띠 메시(uv.x = 너비 0..1, uv.y = 앞 0 .. 뒤 1), uA 불투명도, uT 시간
const WV_FS = `uniform vec3 uW, uB; uniform float uA, uT; varying vec2 vUv;
void main(){ float x = vUv.x, y = vUv.y, side = smoothstep(0., .12, x) * smoothstep(1., .88, x);
  float crest = exp(-y * 9.), foam = smoothstep(.55, .9, sin(x * 40. + uT * 9.) * .5 + .5) * exp(-y * 16.);
  float body = smoothstep(1., .25, y) * (.35 + .25 * sin(x * 13. - uT * 4. + y * 9.));
  vec3 c = mix(uB, uW, clamp(crest * .8 + foam, 0., 1.)); gl_FragColor = vec4(c, clamp(crest * .85 + body * .4 + foam * .5, 0., 1.) * side * uA); }`;
const TX_FS = `uniform sampler2D uMap; uniform float uA, uP; varying vec2 vUv;
void main(){ vec4 t = texture2D(uMap, vUv); float open = step(abs(vUv.x - .5), uP * .5); gl_FragColor = vec4(t.rgb, t.a * uA * open); }`;

// ---------------------------------------------------------------- fx2 셰이더 (2026-11-16)
// 마법진(알파 혼합 — 밝은 마을 바닥에서도 선이 읽히게, HDR 가산 아님): uv 0..1 = 반지름 1 원. uK 무늬 0 오행 별 / 1 팔괘 / 2 연꽃 / 3 거북 육각,
// uP 그려짐(바깥 고리가 돌며 그려진 뒤 안 무늬), uT 시간, uS 회전 속도, uW 선 색, uB 바탕, uG 금테, uA 불투명도.
const SG_FS = `uniform vec3 uW, uB, uG; uniform float uA, uK, uP, uT, uS; varying vec2 vUv;
float CO, HA;   // 선 심(밝은 색) · 둘레 번짐(진한 바탕색) — 밝은 바닥에서도 선이 읽히게 둘을 따로 모음
void ln(float d, float w, float k){ CO += smoothstep(w, 0., d) * k; HA += smoothstep(w * 5., 0., d) * k; }
float seg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return length(pa - ba * h); }
vec2 rot(vec2 p, float a){ float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
void main(){
  vec2 p = vUv * 2. - 1.; float r = length(p); if (r > 1.) discard;
  float a = atan(p.y, p.x), an = fract(a / 6.2832 + .5); CO = 0.; HA = 0.;
  float draw = step(an, uP * 1.35), inner = smoothstep(.35, .85, uP);
  float G0 = 0.;
  ln(abs(r - .962), .016, draw); ln(abs(r - .9), .01, draw); G0 = CO;   // 금테 이중선
  vec2 q = rot(p, uT * uS); float aq = atan(q.y, q.x);
  float tick = step(.5, fract(aq * 3.8197 + .25)) * smoothstep(.05, .0, abs(r - .83) - .03) * step(abs(fract(aq * 7.639) - .5), .3) * draw; CO += tick * .9; HA += tick * .5;
  ln(abs(r - .74), .011, draw);
  vec2 w = rot(p, -uT * uS * .6); float k = inner;
  if (uK < .5) {
    for (int i = 0; i < 5; i++) { float a0 = float(i) * 1.2566 + 1.5708, a1 = float(i + 2) * 1.2566 + 1.5708; vec2 v0 = vec2(cos(a0), sin(a0)) * .66, v1 = vec2(cos(a1), sin(a1)) * .66;
      ln(seg(w, v0, v1), .012, k); ln(abs(length(w - v0) - .08), .01, k); }
    ln(abs(r - .3), .01, k);
  } else if (uK < 1.5) {
    float sec = floor(fract(atan(w.y, w.x) / 6.2832 + 1. / 16.) * 8.); float am = (sec / 8.) * 6.2832; vec2 t = rot(w, -am);
    for (int j = 0; j < 3; j++) { float rr = .48 + float(j) * .075; float bit = mod(floor(sec / pow(2., float(j))), 2.);
      float bar = smoothstep(.02, .0, abs(t.x - rr)) * step(abs(t.y), .14) * (bit > .5 ? 1. : step(.035, abs(t.y))); CO += bar * 1.3 * k; HA += bar * .6 * k; }
    float yy = length(w - vec2(0., .14)), y2 = length(w + vec2(0., .14));
    ln(abs(r - .3), .01, k); ln(abs(yy - .14), .009, k * step(0., w.x)); ln(abs(y2 - .14), .009, k * step(w.x, 0.)); CO += (smoothstep(.045, .025, yy) + smoothstep(.045, .025, y2) * .6) * k;
  } else if (uK < 2.5) {
    for (int i = 0; i < 8; i++) { float aa = float(i) * .7854; vec2 d = vec2(cos(aa), sin(aa)); float tt = dot(w, d), ss = abs(w.x * d.y - w.y * d.x);
      float wdt = .13 * sin(clamp((tt - .18) / .5, 0., 1.) * 3.1416); ln(abs(ss - wdt), .011, k * step(.18, tt) * step(tt, .68)); }
    float dots = smoothstep(.03, .012, length(vec2(fract(atan(w.y, w.x) / 6.2832 * 24.) - .5, (r - .12) * 6.))); CO += dots * k; ln(abs(r - .16), .009, k);
  } else {
    vec2 h = w * 3.2; vec2 g = vec2(h.x + h.y * .577, h.y * 1.155); vec2 fi = fract(g) - .5; float hx = max(abs(fi.x), abs(fi.y)); hx = max(hx, abs(fi.x + fi.y));
    ln(abs(hx - .48), .03, k * step(r, .7)); ln(abs(r - .7), .011, k);
  }
  CO = clamp(CO, 0., 1.); HA = clamp(HA, 0., 1.);
  vec3 lineC = mix(uW, uG, clamp(G0, 0., 1.));
  float fill = .16 * smoothstep(1., .15, r) * inner + .08 * smoothstep(.75, .98, r) * draw;
  vec3 col = mix(uB, lineC, smoothstep(0., .6, CO));
  gl_FragColor = vec4(col, clamp(CO * 1.2 + HA * .55 + fill, 0., 1.) * uA);
}`;
// 빛기둥(열린 원통 hb_beam, uv.y = 높이): 위로 흐르는 줄무늬, 위쪽으로 흐려짐, 가장자리 밝게(가산, 블룸 문턱 아래 색)
// 오령산 물길(uv.x 0 = 약인 -> 1 = 가운데, uv.y 가로): 진한 남색 바탕 + 하늘빛 물 + 가운데로 흐르는 갈매기(>) 무늬 — 휴대폰에서도 '안으로' 읽히게. uP = 물 머리 위치
const CH_FS = `uniform vec3 uW, uB; uniform float uA, uT, uP; varying vec2 vUv;
void main(){
  float x = vUv.x, y = abs(vUv.y - .5) * 2.; if (x > uP) discard;
  float edge = 1. - smoothstep(.55, 1., y), head = smoothstep(uP - .12, uP, x);
  float chev = fract(x * 5. - abs(vUv.y - .5) * 1.6 - uT * 2.4); float arrow = smoothstep(.0, .12, chev) * (1. - smoothstep(.22, .38, chev));
  vec3 c = mix(uB, uW, .45 + .55 * arrow) + vec3(1.) * head * .6;
  float a = edge * (.55 + .45 * arrow + .4 * head) * uA;
  gl_FragColor = vec4(c, a);
}`;
const BM_VS = `varying vec2 vUv; varying float vF; void main(){ vUv = uv; vec3 n = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vF = abs(dot(n, normalize(-mv.xyz))); gl_Position = projectionMatrix * mv; }`;
const BM_FS = `uniform vec3 uW, uB; uniform float uA, uT; varying vec2 vUv; varying float vF;
void main(){ float y = vUv.y, st = .55 + .45 * sin(vUv.x * 62.83 * 2. + y * 3. - uT * 2.) * sin(y * 14. - uT * 9. + vUv.x * 31.4);
  float edge = .3 + .7 * pow(1. - vF, 1.4), a = pow(1. - y, 1.3) * smoothstep(0., .05, y) * edge * (.55 + .45 * st);
  gl_FragColor = vec4(mix(uB, uW, clamp(.8 - y + .4 * st, 0., 1.)) * a * uA * 1.6, 1.); }`;
// 인스턴스 반짝이(카메라 판, 종류 aK 0 부드러운 점 / 1 네 갈래 별 / 2 고리), aA 밝기, aR 화면 회전, instanceColor 색
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
  else a = smoothstep(.12, .0, abs(r - .78)) * (1. - smoothstep(.95, 1., r));
  vec3 c = mix(vC, vec3(1.), .55 * exp(-r * r * 40.)); gl_FragColor = vec4(c * a * vA, 1.); }`;
// 인스턴스 3D 조각(꽃잎·잎·별·물방울·불꽃): 정점 색 × instanceColor, aA = 자체 발광
const P3_VS = `uniform float uDesat; attribute vec3 color; attribute float aA; varying vec3 vC, vN; varying float vA;
void main(){ vec3 ic = vec3(1.);
#ifdef USE_INSTANCING_COLOR
  ic = instanceColor;
#endif
  float l = dot(color, vec3(.3, .55, .15)); vC = mix(color, vec3(.35 + .75 * l), uDesat) * ic; vA = aA; vN = normalize(mat3(modelViewMatrix * instanceMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.); }`;
const P3_FS = `varying vec3 vC, vN; varying float vA;
void main(){ vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n; float d = max(0., dot(n, normalize(vec3(-.3, .8, .55))));
  gl_FragColor = vec4(vC * (.55 + .6 * d) + vC * vA, 1.); }`;
// Tripo 모델(기본색 텍스처) + 색 있는 발광(버프 금빛·다침 빨강)
const HT_VS = `varying vec3 vN, vV; varying vec2 vUv; void main(){ vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const HT_FS = `uniform sampler2D uMap; uniform vec3 uGlowC; uniform float uA, uGlow; varying vec3 vN, vV; varying vec2 vUv;
void main(){ vec3 base = texture2D(uMap, vUv).rgb * 1.06, n = normalize(vN); if (!gl_FrontFacing) n = -n;
  float d = max(0., dot(n, normalize(vec3(-.4, .8, .5)))), rim = pow(1. - max(0., dot(n, vV)), 2.4);
  gl_FragColor = vec4(base * (.58 + .6 * d) + vec3(1., .95, .85) * rim * .22 + uGlowC * (uGlow * (.4 + .6 * rim)), uA); }`;

/** 인스턴스 입자 묶음 하나(종류당 draw call 1). bill = 카메라 판(반짝이), 아니면 3D 조각. 상한이 차면 새 입자는 버림. */
class HParts {
  constructor(geo, mat, cap, bill) {
    this.cap = cap; this.bill = bill; this.P = [];
    const m = new THREE.InstancedMesh(geo, mat, cap); m.frustumCulled = false; m.count = 0; m.renderOrder = bill ? 6 : 3;
    m.setColorAt(0, new THREE.Color(1, 1, 1));   // instanceColor 를 처음부터 만들어 셰이더가 USE_INSTANCING_COLOR 로 컴파일되게
    this.aA = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1); geo.setAttribute('aA', this.aA);
    if (bill) { this.aK = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1); this.aR = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1); geo.setAttribute('aK', this.aK); geo.setAttribute('aR', this.aR); }
    this.mesh = m; this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._s = new THREE.Vector3(); this._c = new THREE.Color();
  }
  add(o) { if (this.P.length >= this.cap) return null; const p = Object.assign({ t: 0, life: 0.8, g: 0, drag: 0, s0: 0.15, s1: 0.05, a: 1, col: 0xffffff, k: 0, rot: 0, w: 0, rx: 0, ry: 0, rz: 0, wx: 0, wy: 0, wz: 0, inT: 0.08, outK: 0.55, glow: 0 }, o);
    if (!p.v) p.v = new THREE.Vector3(); p.c = new THREE.Color(p.col); this.P.push(p); return p; }
  step(dt) {
    const P = this.P; let n = 0;
    for (let i = 0; i < P.length; i++) {
      const p = P[i]; p.t += dt; if (p.t >= p.life || (p.alive && !p.alive())) continue;
      const k = p.t / p.life;
      if (p.to) { const to = typeof p.to === 'function' ? p.to() : p.to; if (to) { const f = Math.min(1, dt * (p.pull || 6) * (0.3 + k)); p.p.lerp(to, f); } }
      else { p.v.y += p.g * dt; if (p.drag) p.v.multiplyScalar(Math.max(0, 1 - p.drag * dt)); p.p.addScaledVector(p.v, dt); if (p.floor != null && p.p.y < p.floor) { p.p.y = p.floor; p.v.set(p.v.x * 0.3, 0, p.v.z * 0.3); } }
      const fa = Math.min(1, p.t / Math.max(0.001, p.inT)) * (1 - Math.max(0, (k - p.outK) / (1 - p.outK)));
      let sc = p.s0 + (p.s1 - p.s0) * k;
      if (this.bill) { if (p.tw) sc *= 0.75 + 0.25 * Math.sin(p.t * p.tw); this._m.makeScale(sc, sc, sc).setPosition(p.p); this.aA.array[n] = p.a * fa; this.aK.array[n] = p.k; this.aR.array[n] = p.rot + p.w * p.t; }
      else { sc *= fa > 0 ? Math.min(1, 0.25 + fa) : 0; this._e.set(p.rx + p.wx * p.t, p.ry + p.wy * p.t, p.rz + p.wz * p.t); this._q.setFromEuler(this._e); this._m.compose(p.p, this._q, this._s.setScalar(sc)); this.aA.array[n] = p.glow; }
      this.mesh.setMatrixAt(n, this._m); this.mesh.setColorAt(n, p.c); P[n] = p; n++;
    }
    P.length = n; this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; this.aA.needsUpdate = true; if (this.bill) { this.aK.needsUpdate = true; this.aR.needsUpdate = true; }
  }
  clear() { this.P.length = 0; this.mesh.count = 0; }
}

/** 두루마리 종이 그림(약초 그림 4개 + 금테) — 처음 한 번만 만드는 캔버스 텍스처 */
let PAPER = null;
function paperTex() {
  if (PAPER) return PAPER;
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 192; const g = cv.getContext('2d');
  g.fillStyle = '#f6e8c4'; g.fillRect(0, 0, 512, 192);
  g.strokeStyle = '#c89a3a'; g.lineWidth = 6; g.strokeRect(8, 8, 496, 176); g.lineWidth = 2; g.strokeRect(18, 18, 476, 156);
  const herbAt = (x, kind) => {
    g.save(); g.translate(x, 160); g.strokeStyle = '#3a6a2a'; g.fillStyle = kind === 2 ? '#a050d0' : kind === 3 ? '#c84020' : '#4a9a3a'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(-6, -40, 8, -80, 0, -120); g.stroke();
    for (let i = 0; i < 5; i++) { const y = -24 - i * 20, s = i % 2 ? 1 : -1; g.beginPath(); g.ellipse(s * 16, y, 16, 7, s * -0.5, 0, 6.3); g.fill(); g.stroke(); }
    if (kind === 1) { g.fillStyle = '#e8d8b0'; g.beginPath(); g.ellipse(0, 6, 14, 22, 0, 0, 6.3); g.fill(); g.strokeStyle = '#8a6a40'; g.stroke(); }   // 인삼 뿌리
    if (kind === 2) { g.fillStyle = '#c070f0'; for (let k = 0; k < 5; k++) { g.beginPath(); g.ellipse(Math.cos(k * 1.256) * 10, -124 + Math.sin(k * 1.256) * 10, 9, 5, k * 1.256, 0, 6.3); g.fill(); } }
    if (kind === 3) { g.fillStyle = '#8a2a18'; g.beginPath(); g.ellipse(0, -126, 22, 9, 0, 0, 6.3); g.fill(); }   // 영지
    g.restore();
  };
  [96, 208, 320, 432].forEach((x, i) => herbAt(x, i));
  g.fillStyle = '#7a4a20'; g.font = 'bold 22px serif'; g.fillText('神農本草', 200, 44);
  PAPER = new THREE.CanvasTexture(cv); PAPER.colorSpace = THREE.SRGBColorSpace; return PAPER;
}

export class HerbalFx extends CookFx {
  load() {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const j = await (await fetch('assets/fx/fx_herbal.glb.json')).json(), raw = atob(j.b64), u8 = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
      const g = await new Promise((res, rej) => new GLTFLoader().parse(u8.buffer, '', res, rej));
      g.scene.traverse(o => { if (o.isMesh) this.geo[o.name] = o.geometry; });
      this.chips = [this.geo.hb_leaf].filter(Boolean);
      this.disc = new THREE.PlaneGeometry(2, 2); this.disc.rotateX(-Math.PI / 2);
      const wv = new THREE.PlaneGeometry(1, 1, 16, 6); wv.rotateX(-Math.PI / 2); this.waveGeo = wv;
      if (H.fx2) this._fx2Load();
      try {   // Tripo 소품·소환물(tools/blender/fx_herbal_tripo.py) — 없으면 절차 메시
        const tj = await (await fetch('assets/fx/fx_herbal_tripo.glb.json')).json(), tr = atob(tj.b64), t8 = new Uint8Array(tr.length);
        for (let i = 0; i < tr.length; i++) t8[i] = tr.charCodeAt(i);
        const tg = await new Promise((res, rej) => new GLTFLoader().parse(t8.buffer, '', res, rej));
        tg.scene.traverse(o => { if (o.isMesh && o.material && o.material.map) this.tri[o.name] = { geo: o.geometry, map: o.material.map }; });
      } catch (err) { console.warn('herbalfx: no Tripo models', err && err.message); }
      this.ready = true;
    })().catch(e => console.warn('herbalfx load', e));
    return this.loading;
  }
  _mat(kind) {
    const U = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v }])), Cc = () => new THREE.Color(1, 1, 1);
    if (kind === 'hs') return new THREE.ShaderMaterial({ uniforms: U({ uTint: Cc(), uRim: new THREE.Color(0xfff0d0), uGlowC: Cc(), uA: 1, uGlow: 0, uSpec: 0.4, uVein: 0 }), vertexShader: HS_VS, fragmentShader: HS_FS, transparent: true, depthWrite: true, side: THREE.DoubleSide });
    if (kind === 'hsa') return new THREE.ShaderMaterial({ uniforms: U({ uTint: Cc(), uRim: new THREE.Color(0xfff0d0), uGlowC: Cc(), uA: 1, uGlow: 0, uSpec: 0.4, uVein: 0 }), vertexShader: HS_VS, fragmentShader: HS_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    if (kind === 'gd') return new THREE.ShaderMaterial({ uniforms: U({ uW: Cc(), uB: Cc(), uA: 0, uK: 0, uP: 1, uT: 0 }), vertexShader: GD_VS, fragmentShader: GD_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    if (kind === 'wv') return new THREE.ShaderMaterial({ uniforms: U({ uW: Cc(), uB: Cc(), uA: 0, uT: 0 }), vertexShader: GD_VS, fragmentShader: WV_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    if (kind === 'sg') return new THREE.ShaderMaterial({ uniforms: U({ uW: Cc(), uB: Cc(), uG: Cc(), uA: 0, uK: 0, uP: 1, uT: 0, uS: 0.6 }), vertexShader: GD_VS, fragmentShader: SG_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    if (kind === 'bm') return new THREE.ShaderMaterial({ uniforms: U({ uW: Cc(), uB: Cc(), uA: 0, uT: 0 }), vertexShader: BM_VS, fragmentShader: BM_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    if (kind === 'ht') return new THREE.ShaderMaterial({ uniforms: U({ uMap: null, uGlowC: Cc(), uA: 1, uGlow: 0 }), vertexShader: HT_VS, fragmentShader: HT_FS, transparent: true, depthWrite: true, side: THREE.DoubleSide });
    if (kind === 'ch') return new THREE.ShaderMaterial({ uniforms: U({ uW: Cc(), uB: Cc(), uA: 0, uT: 0, uP: 0 }), vertexShader: GD_VS, fragmentShader: CH_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    if (kind === 'tx') return new THREE.ShaderMaterial({ uniforms: U({ uMap: null, uA: 0, uP: 0 }), vertexShader: GD_VS, fragmentShader: TX_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    return super._mat(kind);
  }
  /** solid vertex-colour mesh (see-through when a < 1: depthWrite off) */
  hs(e, name, o = {}) {
    const geo = this.geo[name]; if (!geo) return null;
    const m = this._m(e, o.see ? 'hsa' : 'hs', geo, o.order ?? 2), u = m.material.uniforms;
    u.uTint.value.setHex(o.tint ?? 0xffffff); u.uRim.value.setHex(o.rim ?? 0xfff0d0); u.uGlowC.value.setHex(o.glowC ?? C.gold); u.uA.value = o.a ?? 1; u.uGlow.value = o.glow ?? 0; u.uSpec.value = o.spec ?? 0.4; u.uVein.value = 0;
    return m;
  }
  gd(e, k, w, b, order = 1) { const m = this._m(e, 'gd', this.disc, order), u = m.material.uniforms; u.uK.value = k; u.uP.value = 1; u.uT.value = 0; u.uW.value.setHex(w); u.uB.value.setHex(b); u.uA.value = 0; return m; }
  _h(e, o = {}) { e.dispose = () => this._free(e); return Object.assign(e, o); }
  /** fade an effect out over `t` s then free it (handles keep working while fading) */
  _end(e, t = 0.4) { if (!e || e.dead || e.ending != null) return; e.ending = e.t; e.life = e.t + t; }
  _fadeK(e) { return e.ending != null ? 1 - clamp01((e.t - e.ending) / Math.max(0.01, e.life - e.ending)) : 1; }
  /** small additive flash at a point (three coords) */
  flash(at, w, b, s = 0.7, life = 0.18, a = 1.2) {
    const e = this._fx('hflash', life, (e) => { const k = e.t / life; fl.quaternion.copy(this.camQ); fl.scale.setScalar(s * (0.6 + 0.6 * easeOut(k))); fl.material.uniforms.uA.value = H.intensity * a * (1 - smooth(0.1, 1, k)); });
    e.g.position.copy(at); const fl = this.spr(e, 3, w, b, 7); return e;
  }
  /** thin ground ring expanding to r (three coords) */
  ring(at, r, w, b, life = 0.35, a = 1.3, r0 = 0.3) {
    const e = this._fx('hring', life, (e) => { const k = e.t / life; this._flat(rg, r * (r0 + (1 - r0) * easeOut(k)), 0.06); rg.material.uniforms.uA.value = H.intensity * a * (1 - smooth(0.3, 1, k)); });
    e.g.position.copy(at); const rg = this.spr(e, 1, w, b, 3); return e;
  }
  /** soft glowing motes (additive discs) that drift; o.to = point they fly into (absorb) */
  motes(at, n, o = {}) {
    if (n <= 0) return null; const ps = [], life = o.life || 0.8;
    const e = this._fx('motes', life, (e) => {
      const k = e.t / life;
      for (const p of ps) {
        p.m.quaternion.copy(this.camQ);
        if (o.to) { const tk = easeOut(clamp01((e.t - p.d) / (life - p.d))); p.m.position.copy(p.p0).lerp(o.to, tk); p.m.position.y += Math.sin(tk * Math.PI) * 0.4; }
        else p.m.position.copy(p.p0).addScaledVector(p.v, e.t);
        p.m.scale.setScalar(p.s * (1 - 0.5 * k)); p.m.material.uniforms.uA.value = H.intensity * (o.a ?? 0.9) * smooth(0, 0.1, k) * (1 - smooth(0.6, 1, k));
      }
    });
    for (let i = 0; i < n; i++) { const a = rnd(0, 6.283), r = rnd(0, o.r ?? 0.5); const m = this.spr(e, 0, o.w ?? C.gold, o.b ?? C.goldB, 6);
      ps.push({ m, p0: at.clone().add(new THREE.Vector3(Math.cos(a) * r, rnd(0, o.h ?? 0.3), Math.sin(a) * r)), v: new THREE.Vector3(Math.cos(a) * rnd(0.2, 0.8) * (o.spread ?? 1), rnd(0.4, 1.4) * (o.up ?? 1), Math.sin(a) * rnd(0.2, 0.8) * (o.spread ?? 1)), s: rnd(0.08, 0.18) * (o.size ?? 1), d: rnd(0, 0.25) }); }
    return e;
  }
  /** falling / rising leaves or petals (solid little meshes) */
  leaves(at, n, o = {}) {
    if (n <= 0 || !this.geo[o.geo || 'hb_leaf']) return null; const ps = [], life = o.life || 0.9;
    const e = this._fx('leaves', life, (e, dt) => {
      const k = e.t / life;
      for (const p of ps) { p.v.y += (o.g ?? -1.2) * dt; p.m.position.addScaledVector(p.v, dt); p.m.rotation.x += p.w * dt; p.m.rotation.z += p.w * 0.6 * dt; p.m.material.uniforms.uA.value = (o.a ?? 1) * (1 - smooth(0.55, 1, k)); }
    });
    for (let i = 0; i < n; i++) { const a = rnd(0, 6.283), sp = rnd(0.3, 1.0) * (o.speed ?? 1), m = this.hs(e, o.geo || 'hb_leaf', { tint: o.tint ?? 0xffffff, see: true, a: 1, glow: o.glow ?? 0, glowC: o.glowC ?? C.white });
      m.scale.setScalar(rnd(0.06, 0.11) * (o.size ?? 1)); m.position.copy(at).add(new THREE.Vector3(Math.cos(a) * (o.r ?? 0.2), rnd(0, o.h ?? 0.2), Math.sin(a) * (o.r ?? 0.2))); m.rotation.set(rnd(0, 6), rnd(0, 6), rnd(0, 6));
      ps.push({ m, v: new THREE.Vector3(Math.cos(a) * sp, rnd(0.6, 1.6) * (o.up ?? 1), Math.sin(a) * sp), w: rnd(-6, 6) }); }
    return e;
  }


  // ================================================================== fx2 공용 층(2026-11-16): 마법진 · 빛기둥 · 인스턴스 반짝이/조각 · 리본 · 소리 · 문구
  _fx2Load() {
    if (this.parts) return;
    const quad = new THREE.PlaneGeometry(1, 1), cap = H.cap;
    const spkMat = new THREE.ShaderMaterial({ vertexShader: SPK_VS, fragmentShader: SPK_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const p3Mat = (d = 0) => new THREE.ShaderMaterial({ uniforms: { uDesat: { value: d } }, vertexShader: P3_VS, fragmentShader: P3_FS, side: THREE.DoubleSide });
    this.parts = { spk: new HParts(quad, spkMat, cap.spk, true) };
    for (const [k, g] of [['petal', 'hb_petal'], ['leaf', 'hb_leaf'], ['star', 'hb_star'], ['drop', 'hb_drop'], ['flame', 'hb_flame']]) if (this.geo[g]) this.parts[k] = new HParts(this.geo[g].clone(), p3Mat(k === 'petal' ? 0.9 : 0), cap.p3, false);   // 꽃잎은 보라 정점 색을 빼고 instanceColor 로 칠함
    for (const p of Object.values(this.parts)) this.root.add(p.mesh);
    this.beamGeo = this.geo.hb_beam || new THREE.CylinderGeometry(1, 1, 1, 20, 4, true).translate(0, 0.5, 0);
    this.sndT = {};
  }
  update(dt) { this.clk = (this.clk || 0) + dt; super.update(dt); if (this.parts) for (const p of Object.values(this.parts)) p.step(dt); }
  clear() { super.clear(); if (this.parts) for (const p of Object.values(this.parts)) p.clear(); }
  _nk(n) { return Math.max(1, Math.round(n * (lite() ? H.liteK : 1))); }
  /** 반짝이 하나(three 좌표): o = {v, g, life, s0, s1, a, col, k(0 점/1 별/2 고리), to(점 또는 함수: 끌려감), tw(깜박임)} */
  spark(at, o = {}) { const p = this.parts && this.parts.spk.add(Object.assign({ p: at.clone() }, o)); if (p) { p.s0 *= H.spk.s; p.s1 *= H.spk.s; p.a *= H.spk.a; } return p; }
  /** 3D 조각 하나: kind petal/leaf/star/drop/flame */
  bit(kind, at, o = {}) { const P = this.parts && this.parts[kind]; return P ? P.add(Object.assign({ p: at.clone(), rx: rnd(0, 6), ry: rnd(0, 6), rz: rnd(0, 6) }, o)) : null; }
  /** '팡': 섬광 + 퍼지는 이중 고리 + 네 갈래 별 + 통통한 3D 별 몇 개 + 점 — 명중·완성 순간(r 이 크기, 판정 반경 안에서 부를 것) */
  pang(at, el, o = {}) {
    if (!this.parts) return; const c = H.el[el] || H.el.heal, r = o.r ?? 0.6, n = this._nk(o.n ?? 10);
    this.flash(at, c[0], c[1], r * 1.6, 0.16, 1.2);
    const g = at.clone(); g.y = o.ground ?? groundY(at.x, -at.z);
    this.ring(g, r * 1.3, c[2], c[1], 0.4, 1.3, 0.15); if (!o.noRing2) this.ring(g, r * 0.8, c[0], c[1], 0.32, 1.0, 0.1);
    for (let i = 0; i < n; i++) { const a = rnd(0, 6.283), sp = rnd(1.2, 3.2) * r;
      this.spark(at, { v: new THREE.Vector3(Math.cos(a) * sp, rnd(0.8, 2.6) * r, Math.sin(a) * sp), g: -3, drag: 2.5, life: rnd(0.4, 0.75), s0: rnd(0.16, 0.28) * Math.max(0.7, r), s1: 0.02, col: i % 3 ? c[0] : c[2], k: i % 2 ? 1 : 0, a: 1.1, w: rnd(-4, 4) }); }
    const ns = o.stars ?? (lite() ? 1 : 3);
    for (let i = 0; i < ns; i++) { const a = rnd(0, 6.283), sp = rnd(1.4, 2.6);
      this.bit('star', at, { v: new THREE.Vector3(Math.cos(a) * sp, rnd(2.2, 3.4), Math.sin(a) * sp), g: -7, life: rnd(0.55, 0.8), s0: 0.13 * Math.max(0.8, r), s1: 0.06, wz: rnd(-9, 9), wy: rnd(-4, 4), rx: 0, ry: rnd(0, 6), rz: 0, col: 0xffffff, glow: 0.45, outK: 0.6 }); }
  }
  /** 바닥 마법진(three 좌표 중심, 반지름 r = 실제 범위 이하). o: pat 0 오행/1 팔괘/2 연꽃/3 육각, grow(그려지는 초), life, a, spin, follow(()=>three 좌표). handle: end(t) */
  sigil(at, r, el, o = {}) {
    if (!this.parts) return null; const c = H.el[el] || H.el.heal, grow = o.grow ?? 0.35, A = o.a ?? 0.85;
    const e = this._fx('sigil', o.life ?? 1.2, (e) => {
      const fk = this._fadeK(e), k = e.ending == null ? 1 - smooth(e.life - (o.fade ?? 0.45), e.life, e.t) : 1, u = m.material.uniforms;
      if (o.follow) { const p = o.follow(); m.position.set(p.x, p.y + 0.06, p.z); }
      u.uP.value = easeOut(clamp01(e.t / grow)); u.uT.value = e.t; u.uA.value = A * fk * k * smooth(0, 0.06, e.t) * (o.pulse ? 0.8 + 0.2 * Math.sin(e.t * 6) : 1);
      m.scale.setScalar(r * (0.82 + 0.18 * easeBack(clamp01(e.t / grow))));
    });
    const m = this._m(e, 'sg', this.disc, 1), u = m.material.uniforms; u.uK.value = o.pat ?? 0; u.uS.value = o.spin ?? 0.6; u.uW.value.setHex(c[0]); u.uB.value.setHex(c[1]); u.uG.value.setHex(c[2]); u.uA.value = 0;
    m.position.copy(at); m.position.y = (o.y ?? groundY(at.x, -at.z)) + 0.06; m.scale.setScalar(r);
    return this._h(e, { end: (t = 0.45) => this._end(e, t) });
  }
  /** 빛기둥(three 좌표 밑, 반지름 r, 높이 h, life 초; 솟았다가 가늘어지며 사라짐) */
  beam(at, r, h, el, o = {}) {
    if (!this.parts) return null; const c = H.el[el] || H.el.heal, life = o.life ?? 0.6;
    const e = this._fx('beam', life, (e) => { const k = e.t / life, up = easeOut(clamp01(e.t / 0.12));
      if (o.follow) { const p = o.follow(); m.position.set(p.x, p.y, p.z); }
      m.scale.set(r * (1 - 0.6 * smooth(0.3, 1, k)), h * up, r * (1 - 0.6 * smooth(0.3, 1, k))); u.uT.value = e.t; u.uA.value = H.intensity * (o.a ?? 1.0) * (1 - smooth(0.45, 1, k)); });
    const m = this._m(e, 'bm', this.beamGeo, 6), u = m.material.uniforms; u.uW.value.setHex(c[0]); u.uB.value.setHex(c[1]); u.uA.value = 0; m.position.copy(at); m.scale.set(r, 0.01, r);
    return e;
  }
  /** 리본 꼬리(CookFx._ribbon 재사용): fn(t) -> three 좌표 머리 위치를 매 프레임 기록해 꼬리로 그림 */
  trail(fn, el, o = {}) {
    if (!this.parts) return null; const c = H.el[el] || H.el.heal, n = o.n ?? 14, hist = [], life = o.life ?? 1.0;
    const e = this._fx('trail', life, (e) => { const p = fn(e.t); if (p) { hist.unshift(p.clone()); if (hist.length > n) hist.length = n; }
      if (hist.length > 1) { this._ribbonSet(rb, hist, o.w ?? 0.12); rb.material.uniforms.uA.value = H.intensity * (o.a ?? 1) * (1 - smooth(life - 0.25, life, e.t)) * this._fadeK(e); } });
    const rb = this._ribbon(e, n); rb.material.uniforms.uW.value.setHex(o.w0 ?? c[2]); rb.material.uniforms.uB.value.setHex(o.w1 ?? c[0]);
    return this._h(e, { stop: () => this._end(e, 0.2) });
  }
  /** 기운이 손으로 빨려 듦(시전 준비) */
  gather(fromC, r, to, el, n = 10, life = 0.5) { const c = H.el[el] || H.el.heal; n = this._nk(n);
    for (let i = 0; i < n; i++) { const a = i / n * 6.283 + rnd(-0.2, 0.2); this.spark(fromC.clone().add(new THREE.Vector3(Math.cos(a) * r, rnd(0.05, 0.6), Math.sin(a) * r)), { to, pull: 5, life: life + rnd(0, 0.15), s0: 0.2, s1: 0.06, col: i % 2 ? c[0] : c[2], k: i % 3 ? 0 : 1, a: 1, inT: 0.12, outK: 0.8 }); } }
  /** 같은 소리 반복 제한(H.sfxGap) — 규칙(js/herbal.js)의 소리에 덧붙이는 연출 소리 */
  _snd(n) { const now = this.clk || 0, g = H.sfxGap[n] ?? 0.12; if (this.sndT && now - (this.sndT[n] ?? -9) < g) return; if (this.sndT) this.sndT[n] = now; this.sfx(n); }
  /** 타격감 문구(ui.impactText, 게임 좌표) — 한 시전에 몇 개만 */
  _shout(pg, text, col = '#ffe7a0', edge = '#5a3a10', size = 1.35) { try { const G = window.G; if (G && G.ui && G.ui.impactText && pg) G.ui.impactText({ x: pg.x, y: pg.y || 0, z: pg.z }, text, { col, edge, size, top: 1.2 }); } catch (er) { /* no ui */ } }
  /** CookFx._puffs 와 같은 연기 — 난수만 자기 것(게임 Math.random 을 건드리지 않음) */
  _hpuffs(at, n, r, o = {}) {
    if (n <= 0) return; const ps = [];
    const e = this._fx('puffs', o.life || 0.45, (e) => { const k = e.t / e.life;
      for (const p of ps) { p.m.quaternion.copy(this.camQ); p.m.position.copy(p.p0).addScaledVector(p.d, easeOut(k) * p.run).setY(p.p0.y + k * (o.rise ?? 0.25)); p.m.scale.setScalar(p.s * (0.6 + 0.9 * easeOut(k))); p.m.material.uniforms.uA.value = (o.a ?? 0.5) * smooth(0, 0.12, k) * (1 - smooth(0.35, 1, k)); } });
    for (let i = 0; i < n; i++) { const a = (i + rnd(-0.3, 0.3)) / n * Math.PI * 2, m = this.puff(e, o.c1 ?? 0xd8c8a8, o.c2 ?? 0x7a6a58);
      ps.push({ m, d: new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), p0: at.clone().add(new THREE.Vector3(Math.cos(a) * r * 0.35, 0.12, Math.sin(a) * r * 0.35)), run: r * rnd(0.35, 0.6), s: rnd(0.35, 0.6) * Math.max(0.6, r) }); }
  }
  /** t 초 뒤 fn 한 번(owner 효과가 이미 사라졌으면 부르지 않음) — 효과 시계로 돌아서 G.step 과 맞음 */
  _later(t, fn, owner) { const e = this._fx('later', t + 0.05, (q) => { if (!q.done && q.t >= t) { q.done = true; if (!owner || !owner.dead) fn(); } }); return e; }
  /** Tripo 모델(있으면) — 없으면 null */
  tmesh(e, name, o = {}) { const t = this.tri && this.tri['tripo_' + name]; if (!t) return null; const m = this._m(e, 'ht', t.geo, o.order ?? 2), u = m.material.uniforms; u.uMap.value = t.map; u.uA.value = o.a ?? 1; u.uGlow.value = 0; u.uGlowC.value.setHex(o.glowC ?? C.gold); return m; }

  make(kind, a, o = {}) { if (!this._ok()) return null; const f = this['k_' + kind]; return f ? f.call(this, a, o) : null; }

  // ================================================================== 누른 순간
  k_pre(pc, o) {
    const what = o.what, lead = Math.max(0.1, o.lead || 0.3), hand = () => P3(o.hand ? o.hand() : pc.pos);
    const e = this._fx('pre', what === 'moxa' || what === 'needles' ? 3 : lead + 0.25, (e) => {
      const k = e.t / lead, hp = hand(), base = P3(pc.pos); e.hp = hp;
      if (what === 'brew' || what === 'raise') {   // 손 사이의 청록 기운 원 / 손바닥 빛
        g0.quaternion.copy(this.camQ); g0.position.copy(hp); g0.scale.setScalar(what === 'brew' ? 0.55 + 0.2 * Math.sin(e.t * 18) : 0.4 + 0.5 * k); g0.material.uniforms.uA.value = 0.75 * smooth(0, 0.15, e.t) * (1 - smooth(1, 1.4, k));
        if (r0) { r0.position.set(base.x, base.y + 0.05, base.z); this._flat(r0, 0.5 + 0.4 * easeOut(k), 0.05); r0.material.uniforms.uA.value = 0.8 * (1 - smooth(0.7, 1.4, k)); }
      } else if (what === 'sow') {   // 손에서 씨앗이 떨어져 땅에 흩어짐 (0.1~0.22 s)
        for (const s of seeds) { const t = e.t - s.d; if (t < 0) { s.m.visible = false; continue; } s.m.visible = true; if (!s.p) s.p = hp.clone(); s.v.y -= 9.8 * (e.dt || 0.016); s.p.addScaledVector(s.v, e.dt || 0.016); const gy = groundY(s.p.x, -s.p.z); if (s.p.y < gy + 0.03) { s.p.y = gy + 0.03; s.v.set(0, 0, 0); }
          s.m.position.copy(s.p); s.m.material.uniforms.uA.value = 1 - smooth(lead, lead + 0.25, e.t); }
      } else if (what === 'moxa') {   // 손끝 쑥뜸에 불이 붙음 — 주작이 이어받기 전까지 손을 따라감
        mx.position.copy(hp); mx.scale.setScalar(0.09); mx.rotation.set(0, e.t * 2, 0); mx.material.uniforms.uGlow.value = 0.4 * smooth(0.05, 0.2, e.t);
        g0.quaternion.copy(this.camQ); g0.position.copy(hp).setY(hp.y + 0.09); g0.scale.setScalar(0.25 + 0.06 * Math.sin(e.t * 30)); g0.material.uniforms.uA.value = 1.1 * smooth(0.04, 0.16, e.t);
      } else if (what === 'needles') {   // 어깨 뒤에 백금 침이 부채처럼 펼쳐짐
        const f = D3(o.facing || pc.facing), r = _a.crossVectors(f, UP).normalize(), sh = base.clone().addScaledVector(f, -0.25).setY(base.y + 1.45);
        ndl.forEach((m, i) => { const t = (i / (ndl.length - 1) - 0.5) * 2, ang = t * 1.0 * easeOut(clamp01(e.t / 0.12));
          const dir = _b.copy(UP).multiplyScalar(Math.cos(ang)).addScaledVector(r, Math.sin(ang)).normalize();
          m.position.copy(sh).addScaledVector(dir, 0.18); _q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir); m.quaternion.copy(_q); m.scale.setScalar(0.42 * smooth(0, 0.1, e.t)); m.material.uniforms.uA.value = 1; });
        e.fanAt = sh; e.fanR = r.clone();
      } else if (what === 'gourd') {   // 손의 호리병이 기울어짐
        gd.position.copy(hp); gd.scale.setScalar(0.32 * smooth(0, 0.08, e.t)); gd.rotation.set(0, yawOf(pc.facing), 0); gd.rotateX(-1.9 * smooth(lead * 0.5, lead, e.t)); gd.material.uniforms.uA.value = 1 - smooth(lead + 0.1, lead + 0.25, e.t);
      }
    });
    let g0 = null, r0 = null, mx = null, gd = null; const seeds = [], ndl = [];
    if (what === 'brew' || what === 'raise') { g0 = this.spr(e, 0, C.teal, C.tealB, 6); r0 = this.spr(e, 1, C.jade, C.jadeB, 2); }
    if (what === 'sow') for (let i = 0; i < (lite() ? 5 : 9); i++) { const m = this.hs(e, 'hb_pill', { tint: 0x8a6a30, spec: 0.2 }); if (!m) break; m.scale.setScalar(0.03); const a = rnd(-1, 1); const f = D3(pc.facing); seeds.push({ m, d: 0.08 + i * 0.012, v: new THREE.Vector3(f.x * 1.6 + f.z * a, 1.2, f.z * 1.6 - f.x * a) }); }
    if (what === 'moxa') { mx = this.hs(e, 'hb_moxa', { glowC: C.vermil }); g0 = this.spr(e, 0, C.vermil, C.vermilB, 7); }
    if (what === 'needles') for (let i = 0; i < 9; i++) { const m = this.hs(e, 'hb_needle', { glowC: C.plat, glow: 0.3, spec: 1.2 }); if (m) ndl.push(m); }
    if (what === 'gourd') gd = this.hs(e, 'hb_gourd', { see: true });
    if (this.parts) {   // fx2: 발밑 시전 마법진(원소마다 무늬·색) + 손으로 모이는 기운 — 시전 준비 층
      const PRE = { brew: [1, 'wood'], raise: [0, 'wood'], sow: [2, 'wood'], moxa: [0, 'fire'], needles: [0, 'metal'], gourd: [3, 'water'], share: [1, 'heal'], lift: [2, 'heal'], tilt: [2, 'heal'], stroke: [0, 'fire'], scatter: [3, 'water'] }[what] || [2, 'heal'];
      const b0 = P3(pc.pos); this.sigil(b0, 1.15, PRE[1], { pat: PRE[0], grow: lead * 0.9, life: lead + 0.55, a: 0.9, spin: 1.2, follow: () => P3(pc.pos) });
      this.gather(b0, 1.0, () => hand(), PRE[1], 10, lead);
    }
    if (what === 'stroke' && this.parts) this.trail((t) => t < lead + 0.05 ? hand().clone() : null, 'fire', { n: 12, w: 0.09, life: lead + 0.4, w0: 0xffd0c0, w1: 0xc81010 });   // 붉은 탕액 한 획(손끝을 따라)
    if (what === 'scatter') { const pe = this._fx('paper', lead + 0.3, (q) => { const hp = hand(), k = q.t / lead; pp.position.copy(hp).setY(hp.y + 0.05); pp.quaternion.copy(this.camQ); pp.scale.set(1.4 * smooth(0, 0.14, q.t), 1.4 * smooth(0, 0.14, q.t), 1); pp.material.uniforms.uA.value = 1 - smooth(lead, lead + 0.25, q.t);
        if (this.parts && k > 0.5 && k < 1.1) { q.sp = (q.sp || 0) - (q.dt || 0.016); if (q.sp <= 0) { q.sp = 0.03; const f = D3(pc.facing); this.spark(hp, { v: new THREE.Vector3(f.x * 3 + rnd(-0.8, 0.8), rnd(0.3, 1), f.z * 3 + rnd(-0.8, 0.8)), g: -3, drag: 1, life: 0.5, s0: 0.12, s1: 0.03, col: rnd(0, 1) < 0.5 ? 0x9ad8ff : 0xfff0d0, k: 0, a: 1 }); } } });
      const pp = this.rx(pe, 'paper', { order: 6 }); }
    if (what === 'share' || what === 'lift' || what === 'tilt') { const pe = this._fx('vessel', lead + 0.12, (q) => { const hp = hand(), fw = D3(pc.facing); v.position.copy(hp).addScaledVector(fw, 0.15).setY(hp.y + 0.05); v.rotation.set(0, Math.atan2(fw.x, fw.z), 0); if (what === 'tilt') v.rotateX(0.9 * smooth(0, lead, q.t)); v.scale.setScalar((what === 'lift' ? 0.24 : 0.28) * smooth(0, 0.08, q.t) * (1 - smooth(lead, lead + 0.1, q.t))); });
      const v = what === 'lift' ? this.rx(pe, 'cup', { glowC: C.gold, glow: 0.2 }) : this.hs(pe, 'hb_pot', { glowC: C.amber, glow: 0.2 }); }
    return this._h(e, { what, handOff: () => { this._free(e); } });
  }

  // ================================================================== A2 대주천
  k_cycle(pc, o) {
    const dur = o.dur || 8, act = 0.9, n = lite() ? 10 : 18, ms = [];
    let leafT = 0, last = null;
    const e = this._fx('cycle', dur + 0.4, (e, dt) => {
      const base = P3(pc.pos), fk = this._fadeK(e);
      // 발동: 발밑에서 시작해 몸을 나선으로 감고 올라가 손끝(손 높이)으로 빠짐
      ms.forEach((m, i) => { const k = clamp01((e.t - i * 0.025) / act), y = 0.05 + 1.35 * easeOut(k), a = i * 0.7 + k * 9.0, r = 0.55 - 0.25 * k;
        m.quaternion.copy(this.camQ); m.position.set(base.x + Math.cos(a) * r, base.y + y, base.z + Math.sin(a) * r); m.scale.setScalar(0.16 * (1 - 0.4 * k)); m.material.uniforms.uA.value = H.intensity * 1.0 * smooth(0, 0.05, k) * (1 - smooth(0.85, 1, k)); });
      rg.position.set(base.x, base.y + 0.05, base.z); this._flat(rg, 0.75 * (0.6 + 0.4 * easeOut(e.t / 0.4)), 0.05); rg.material.uniforms.uA.value = 0.9 * (1 - smooth(0.3, act, e.t));
      // 버프 중 움직이면 잎 잔상(가끔)
      if (e.t > act && fk > 0.5) { if (last && Math.hypot(base.x - last.x, base.z - last.z) > 0.02) { leafT -= dt; if (leafT <= 0) { leafT = lite() ? 0.32 : 0.18; this.leaves(base.clone().setY(base.y + 0.25), 1, { tint: 0x9affd8, glow: 0.35, glowC: C.teal, up: 0.4, g: -0.4, speed: 0.2, life: 0.8, size: 1.4, a: 0.8 }); } } last = base; }
    });
    for (let i = 0; i < n; i++) ms.push(this.spr(e, 0, C.teal, C.tealB, 6));
    const rg = this.spr(e, 1, C.jade, C.jadeB, 2);
    if (this.parts) {   // fx2: 팔괘 진 + 몸을 감고 오르는 청록·금 기운 리본 둘 + 손끝 '팡' + 짧은 빛기둥 + 지속 중 반짝이
      this.sigil(P3(pc.pos), 1.3, 'wood', { pat: 1, grow: 0.5, life: 1.5, a: 0.9, spin: 1.4, follow: () => P3(pc.pos) });
      [0, Math.PI].forEach((ph, j) => this.trail((t) => { if (t > act) return null; const b = P3(pc.pos), k = easeOut(clamp01(t / act)), a = ph + k * 11, r = 0.62 - 0.3 * k; return new THREE.Vector3(b.x + Math.cos(a) * r, b.y + 0.08 + 1.5 * k, b.z + Math.sin(a) * r); }, 'wood', { n: 16, w: 0.11, life: act + 0.3, w0: j ? C.gold : 0xd8fff4, w1: j ? C.amberB : C.tealB }));
      this._later(act, () => { const b = P3(pc.pos); this.pang(b.clone().setY(b.y + 1.45), 'wood', { r: 0.5, n: 12, ground: b.y }); this.beam(b, 0.55, 2.8, 'wood', { life: 0.6, a: 0.9 }); }, e);
      const up = e.update; e.update = (q, dt) => { up(q, dt); if (q.t > act && this._fadeK(q) > 0.5) { q.sp = (q.sp || 0) - dt; if (q.sp <= 0) { q.sp = lite() ? 0.3 : 0.14; const b = P3(pc.pos), a = rnd(0, 6.283); this.spark(b.clone().add(new THREE.Vector3(Math.cos(a) * 0.45, rnd(0.2, 1.4), Math.sin(a) * 0.45)), { v: new THREE.Vector3(0, 0.6, 0), life: 0.6, s0: 0.12, s1: 0.03, col: C.teal, k: 1, a: 0.8 }); } } };
    }
    return this._h(e, { end: () => this._end(e, 0.3) });
  }

  // ================================================================== A3 금강 약갑
  k_armor(pc, o) {
    let dur = o.dur || 10, flashL = 0, flashR = 0;
    const spots = [['Right_UpperArm', 1], ['Left_UpperArm', -1], ['Right_LowerArm', 1], ['Left_LowerArm', -1]];
    const e = this._fx('armor', dur + 0.5, (e, dt) => {
      const fk = this._fadeK(e), grow = easeBack(e.t / 0.3), f = D3(pc.facing), r = _a.crossVectors(f, UP).normalize().clone();
      flashL = Math.max(0, flashL - dt * 3); flashR = Math.max(0, flashR - dt * 3);
      plates.forEach((m, i) => {
        const [bn, side] = spots[i]; let p = null; try { p = pc.body && pc.body.bonePoint ? pc.body.bonePoint(bn) : null; } catch (er) { p = null; }
        if (!p) { p = P3(pc.pos).addScaledVector(r, 0.3 * side); p.y += i < 2 ? 1.2 : 0.95; }
        if (i < 2) { const sh = (() => { try { return pc.body.bonePoint(side > 0 ? 'Right_Shoulder' : 'Left_Shoulder'); } catch (er) { return null; } })(); if (sh) p.lerp(sh, 0.35); p.y += 0.06; }
        m.position.copy(p).addScaledVector(r, 0.06 * side); m.rotation.set(0, yawOf(pc.facing) + (side > 0 ? -Math.PI / 2 : Math.PI / 2), 0); m.rotateX(i < 2 ? -0.5 : 0.1);
        m.scale.set(i < 2 ? 0.26 : 0.18, i < 2 ? 0.22 : 0.26, 0.26).multiplyScalar(grow);
        const u = m.material.uniforms, fl = side > 0 ? flashR : flashL; u.uA.value = 0.72 * fk; u.uVein.value = 0.25 + fl * 1.6; u.uGlow.value = 0.08 + fl * 0.25;
      });
    });
    const plates = spots.map(() => this.hs(e, 'hb_plate', { see: true, a: 0.72, glowC: C.gold, rim: 0xb0ffd8 })).filter(Boolean);
    this.leaves(P3(pc.pos).setY((pc.pos.y || 0) + 1.0), lite() ? 4 : 8, { tint: 0x8af0b0, up: 0.3, g: 0.6, speed: 0.6, r: 0.5, life: 0.5, size: 1.2 });
    const armorPop = () => {   // fx2: 육각 거북 진 + 옥빛 빛기둥 + 잎이 몸으로 감겨 들어가 판이 됨 + 가슴 '팡'
      if (!this.parts) return; const b = P3(pc.pos), chest = () => { const q = P3(pc.pos); q.y += 1.1; return q; };
      this.sigil(b, 1.0, 'wood', { pat: 3, grow: 0.3, life: 1.1, a: 0.85, spin: -1, follow: () => P3(pc.pos) });
      this.beam(b, 0.75, 2.4, 'wood', { life: 0.55, a: 0.85, follow: () => P3(pc.pos) });
      const n = this._nk(14); for (let i = 0; i < n; i++) { const a = i / n * 6.283; this.bit('leaf', b.clone().add(new THREE.Vector3(Math.cos(a) * 1.3, rnd(0.3, 1.6), Math.sin(a) * 1.3)), { to: chest, pull: 4, life: 0.45, s0: 0.16, s1: 0.06, col: i % 2 ? 0xc8ffe0 : 0xffffff, wy: 8, glow: 0.3, outK: 0.75 }); }
      this._later(0.3, () => { const q = chest(); this.pang(q, 'wood', { r: 0.5, n: 10, ground: P3(pc.pos).y, stars: lite() ? 1 : 2 }); this._snd('hb_armor'); }, e);
    };
    armorPop();
    return this._h(e, { refresh: (d) => { dur = d; e.life = e.t + d + 0.5; e.ending = null; flashL = flashR = 0.6; armorPop(); },
      flash: (dir) => { const f = pc.facing, side = dir.x * f.z - dir.z * f.x; if (side >= 0) flashR = 1; if (side <= 0) flashL = 1;
        if (this.parts) { const q = P3(pc.pos), d3 = new THREE.Vector3(dir.x, 0, -dir.z).normalize(); q.y += 1.0; q.addScaledVector(d3, 0.35); for (let i = 0; i < this._nk(6); i++) this.spark(q, { v: new THREE.Vector3(d3.x * 1.5 + rnd(-1, 1), rnd(0.5, 1.8), d3.z * 1.5 + rnd(-1, 1)), drag: 3, life: 0.35, s0: 0.16, s1: 0.03, col: i % 2 ? C.gold : C.jade, k: 1, a: 1 }); } },
      end: () => this._end(e, 0.4) });
  }

  // ================================================================== A4 백초 훈증진
  k_steam(c, o) {
    const r = o.r || 3, grow = o.grow || 0.5, c3 = P3(c), N = lite() ? 8 : 14; let steamT = 0;
    const e = this._fx('steam', (o.dur || 8) + 0.5, (e, dt) => {
      const fk = this._fadeK(e), g = clamp01(e.t / grow), ext = Math.max(0, e.ext || 0); e.ext = ext - dt * 2;
      const u = disc.material.uniforms; u.uP.value = easeOut(g); u.uT.value = e.t; u.uA.value = 0.85 * fk * smooth(0, 0.15, e.t) * (1 + 0.6 * ext);
      pot.position.copy(c3); pot.scale.setScalar(1.25 * easeBack(g)); pot.material.uniforms.uA.value = fk; pot.material.uniforms.uGlow.value = 0.1 + 0.25 * ext;
      if (tpot) pot.scale.setScalar(H.tripo.pot * easeBack(g));
      lid.position.copy(c3).setY(c3.y + POTS * 1.25 * easeBack(g) + 0.02 * Math.abs(Math.sin(e.t * 7))); lid.scale.setScalar(1.25 * easeBack(g)); lid.rotation.z = 0.06 * Math.sin(e.t * 7); lid.material.uniforms.uA.value = fk;
      herbs.forEach((h, i) => { const k = clamp01((e.t - i * 0.025) / grow); h.position.y = h.userData.y; h.scale.setScalar(h.userData.s * easeBack(k) * (fk > 0.01 ? 1 : 0)); h.rotation.z = 0.08 * Math.sin(e.t * 2 + i); h.material.uniforms.uA.value = fk; });
      steamT -= dt; if (steamT <= 0 && e.t > grow && fk > 0.5) { steamT = lite() ? 0.7 : 0.4; this._hpuffs(c3.clone().setY(c3.y + 0.65), 1, 0.15, { c1: 0xfff4dc, c2: C.gold, a: 0.28, life: 1.2, rise: 0.9 }); }
    });
    const disc = this.gd(e, 0, C.amber, C.jadeB, 1); disc.position.copy(c3).setY(c3.y + 0.04); disc.scale.setScalar(r);
    const tpot = this.tmesh(e, 'pot', {}), pot = tpot || this.hs(e, 'hb_pot', { see: false }), lid = this.hs(e, 'hb_lid', {});   // fx2: Tripo 약탕관(있으면)
    const POTS = tpot ? H.tripo.pot / 1.25 : 0.5;   // 뚜껑 높이(탕관 크기 1 당)
    const herbs = []; for (let i = 0; i < N; i++) { const a = i / N * 6.283 + rnd(-0.15, 0.15), rr = r * rnd(0.86, 0.98), h = this.hs(e, i % 3 === 2 ? 'hb_stem' : 'hb_herb', { tint: i % 2 ? 0xffffff : 0xd8ffb0 }); if (!h) continue;
      h.position.set(c3.x + Math.cos(a) * rr, groundY(c3.x + Math.cos(a) * rr, -(c3.z + Math.sin(a) * rr)), c3.z + Math.sin(a) * rr); h.userData.y = h.position.y; h.userData.s = rnd(1.5, 2.1); h.rotation.y = rnd(0, 6); herbs.push(h); }
    this.ring(c3, r, C.gold, C.amberB, 0.5, 1.1, 0.1);
    if (this.parts) {   // fx2: 놓는 순간 연꽃 진(= 실제 r)이 돌며 그려졌다 바닥 무늬에 겹쳐 남음 + 탕관 '팡' + 진 안에서 끊임없이 오르는 호박빛 기운
      const sg = this.sigil(c3, r, 'heal', { pat: 2, grow: grow + 0.2, life: (o.dur || 8) + 0.5, a: 0.55, spin: 0.35 }); e.sg = sg;
      this._later(grow * 0.8, () => { this.pang(c3.clone().setY(c3.y + 0.7), 'heal', { r: 0.55, n: 12, ground: c3.y }); this.beam(c3, 0.5, 2.2, 'heal', { life: 0.7, a: 0.8 }); }, e);
      const up = e.update; e.update = (q, dt) => { up(q, dt); if (q.t > grow && this._fadeK(q) > 0.6) { q.mt = (q.mt || 0) - dt; if (q.mt <= 0) { q.mt = lite() ? 0.22 : 0.09; const a = rnd(0, 6.283), rr = r * Math.sqrt(rnd(0.02, 0.85)), x = c3.x + Math.cos(a) * rr, z = c3.z + Math.sin(a) * rr;
        this.spark(new THREE.Vector3(x, groundY(x, -z) + 0.1, z), { v: new THREE.Vector3(0, rnd(0.5, 1.0), 0), life: rnd(0.9, 1.4), s0: rnd(0.1, 0.17), s1: 0.03, col: rnd(0, 1) < 0.5 ? C.amber : C.gold, k: rnd(0, 1) < 0.3 ? 1 : 0, a: 0.75, tw: 9 }); } } };
    }
    return this._h(e, {
      pulse: (healed, cleansed) => {   // 회복 틱: 호박빛 방울이 회복된 몸으로 떨어짐, 정화 성공: 흰 꽃잎 물결
        for (const p of healed) { const at = P3(p); this.motes(at.clone().setY(at.y + 1.6), lite() ? 3 : 5, { w: C.amber, b: C.amberB, to: at.clone().setY(at.y + 0.8), life: 0.55, r: 0.35, a: 1.0 }); }
        if (healed.length) this.ring(c3, r * 0.85, C.amber, C.amberB, 0.45, 0.6, 0.3);
        if (this.parts) { for (const p of healed) { const at = P3(p); this.beam(at, 0.45, 1.9, 'heal', { life: 0.5, a: 0.7 }); for (let i = 0; i < this._nk(5); i++) { const a = i / 5 * 6.283; this.spark(at.clone().add(new THREE.Vector3(Math.cos(a) * 0.4, 0.2, Math.sin(a) * 0.4)), { v: new THREE.Vector3(-Math.cos(a) * 0.3, rnd(1.0, 1.8), -Math.sin(a) * 0.3), life: 0.55, s0: 0.2, s1: 0.04, col: C.gold, k: 1, a: 1 }); } }
          if (healed.length) this._snd('hb_drop'); }
        for (const p of cleansed) { const at = P3(p); this.leaves(at.clone().setY(at.y + 0.5), lite() ? 5 : 9, { geo: 'hb_petal', tint: 0xffffff, glow: 0.4, glowC: C.white, up: 0.6, g: -0.6, speed: 1.2, r: 0.3, life: 0.8, size: 1.2 }); this.ring(at, 1.0, C.white, C.jade, 0.4, 1.0, 0.2); }
      },
      extend: (k = 2) => { e.ext = 1; e.life += k; this.ring(c3, r, C.sapph, C.sapphB, 0.5, 1.2, 0.85); if (e.sg) { const sg = e.sg; sg.life += k; } },
      end: () => { this._end(e, 0.5); if (e.sg) e.sg.end(0.5); } });
  }

  // ================================================================== A5 백초귀원
  k_pill(pc, o) {
    const absorb = o.absorb || 0.62, N = lite() ? 8 : 12; let absorbed = -1;
    const e = this._fx('pill', absorb + 2.0, (e) => {
      const base = P3(pc.pos), k = e.t / absorb;
      herbs.forEach((h, i) => { const a = i / N * 6.283 + e.t * 0.6, rr = 2.2 * easeOut(clamp01(e.t / 0.25)) * (1 - 0.5 * smooth(0.5, 1, k)); h.position.set(base.x + Math.cos(a) * rr, base.y + 0.05 + 0.6 * smooth(0.3, 1, k), base.z + Math.sin(a) * rr);
        h.scale.setScalar(2.0 * smooth(0, 0.15, e.t) * (absorbed < 0 ? 1 : 1 - smooth(0, 0.3, e.t - absorbed))); h.material.uniforms.uGlow.value = 0.3 * smooth(0.3, 1, k); h.material.uniforms.uA.value = 1; });
      // 기운 줄기: 약초에서 머리 위 환약으로
      streaks.forEach((m, i) => { const hp = herbs[i % herbs.length].position, top = base.clone().setY(base.y + 2.1 - 0.9 * smooth(0.72, 1, k)), q = clamp01((k * 1.3 - (i % 4) * 0.12)); m.quaternion.copy(this.camQ); m.position.copy(hp).lerp(top, easeOut(q)); m.scale.setScalar(0.26); m.material.uniforms.uA.value = absorbed < 0 ? 1.1 * smooth(0.15, 0.3, k) : 0; });
      // 환약: 응집(커짐) -> 가슴으로 내려와 흡수
      const pk = absorbed < 0 ? 1 : 1 - smooth(0, 0.12, e.t - absorbed);
      pill.position.copy(base).setY(base.y + 2.1 - 0.95 * smooth(0.7, 1, k)); pill.scale.setScalar(0.26 * easeOut(clamp01((k - 0.2) / 0.5)) * pk); pill.rotation.y = e.t * 5; pill.material.uniforms.uGlow.value = 0.4 + 0.4 * smooth(0.6, 1, k);
      gl.quaternion.copy(this.camQ); gl.position.copy(pill.position); gl.scale.setScalar(1.4 * pk * smooth(0.25, 0.7, k)); gl.material.uniforms.uA.value = H.intensity * 0.9 * pk;
      // 빛의 약초꽃(흡수 뒤): 발밑에서 큰 꽃잎이 피고 빛이 몸 안으로 흘러듦
      if (absorbed >= 0) { const t = e.t - absorbed, fk = 1 - smooth(1.1, 1.8, t);
        petals.forEach((p, i) => { const a = i / petals.length * 6.283; p.position.set(base.x, base.y + 0.05, base.z); p.rotation.set(0, a, 0); p.rotateX(0.15 + 1.1 * easeOut(clamp01(t / 0.5))); p.scale.setScalar(6.5 * easeBack(clamp01(t / 0.45))); p.material.uniforms.uA.value = 0.5 * fk; p.material.uniforms.uGlow.value = 0.6 * (1 - smooth(0, 1, t)) + 0.15; });
        rg.position.set(base.x, base.y + 0.06, base.z); this._flat(rg, 2.4 * easeOut(clamp01(t / 0.5)), 0.06); rg.material.uniforms.uA.value = 1.1 * fk;
      }
    });
    const herbs = []; for (let i = 0; i < N; i++) { const h = this.hs(e, i % 2 ? 'hb_herb' : 'hb_stem', { glowC: C.gold }); if (h) herbs.push(h); }
    const streaks = []; for (let i = 0; i < (lite() ? 6 : 12); i++) streaks.push(this.spr(e, 0, C.gold, C.amberB, 6));
    const pill = this.hs(e, 'hb_pill', { glowC: C.gold, spec: 1.2 }), gl = this.spr(e, 0, C.gold, C.amberB, 7), rg = this.spr(e, 1, C.gold, C.amberB, 2);
    const petals = []; for (let i = 0; i < 10; i++) { const p = this.hs(e, 'hb_petal', { see: true, tint: i % 2 ? 0xfff0b0 : 0xffd080, glowC: C.gold, a: 0 }); if (p) petals.push(p); }
    let lo = null;
    if (this.parts) {   // fx2: 발밑 큰 연꽃 진(약초 고리 2.2 m 안) + 약초에서 환약으로 빨려 드는 금빛 + 흡수 순간 큰 빛기둥·별·연꽃 송이·꽃잎 비 + 잔광 진
      const b0 = P3(pc.pos); this.sigil(b0, 2.3, 'lotus', { pat: 2, grow: absorb * 0.9, life: absorb + 2.2, fade: 0.9, a: 0.9, spin: 0.8, follow: () => P3(pc.pos) });
      this.sigil(b0, 1.3, 'heal', { pat: 0, grow: absorb * 0.7, life: absorb + 1.0, a: 0.75, spin: -1.6, follow: () => P3(pc.pos) });
      const top = () => { const q = P3(pc.pos); q.y += 2.1; return q; };
      for (let i = 0; i < this._nk(18); i++) { const a = i / 18 * 6.283; this.spark(b0.clone().add(new THREE.Vector3(Math.cos(a) * 2.1, rnd(0.1, 0.6), Math.sin(a) * 2.1)), { to: top, pull: 2.6, life: absorb, s0: 0.22, s1: 0.08, col: i % 2 ? C.gold : 0xffc0e0, k: i % 3 ? 0 : 1, a: 1, inT: 0.1 + (i % 4) * 0.05, outK: 0.85 }); }
      lo = this.hs(e, 'hb_lotus', { see: true, glowC: C.gold, a: 0 });
      const up = e.update; e.update = (q, dt) => { up(q, dt); if (lo) { const base = P3(pc.pos), t = absorbed < 0 ? -1 : q.t - absorbed; lo.position.copy(base).setY(base.y + 0.05 + 0.15 * smooth(0, 0.5, t)); lo.rotation.set(0, q.t * 0.6, 0); lo.scale.setScalar(t < 0 ? 0.001 : 1.7 * easeBack(clamp01(t / 0.4))); lo.material.uniforms.uA.value = t < 0 ? 0 : 0.9 * (1 - smooth(1.2, 1.9, t)); lo.material.uniforms.uGlow.value = 0.5 * (1 - smooth(0, 1, t)) + 0.12; } };
    }
    return this._h(e, { absorb: () => { absorbed = e.t; const at = P3(pc.pos); this.motes(at.clone().setY(at.y + 0.3), lite() ? 10 : 20, { w: C.gold, b: C.amberB, to: at.clone().setY(at.y + 1.0), r: 2.2, life: 0.8, a: 1.1 });
      if (this.parts) { this.beam(at, 1.0, 5, 'heal', { life: 0.9, a: 1.0, follow: () => P3(pc.pos) }); this.pang(at.clone().setY(at.y + 1.2), 'heal', { r: 1.0, n: 22, ground: at.y, stars: lite() ? 2 : 5 });
        for (let i = 0; i < this._nk(22); i++) { const a = rnd(0, 6.283), rr = rnd(0.3, 2.0); this.bit('petal', at.clone().add(new THREE.Vector3(Math.cos(a) * rr, rnd(2.2, 3.4), Math.sin(a) * rr)), { v: new THREE.Vector3(rnd(-0.3, 0.3), -rnd(0.8, 1.4), rnd(-0.3, 0.3)), life: rnd(1.2, 1.7), s0: rnd(0.9, 1.3), s1: 0.7, col: i % 3 ? 0xffd0ea : 0xfff0b0, wx: rnd(-3, 3), wz: rnd(-3, 3), glow: 0.25, floor: at.y + 0.03 }); }
        try { const G = window.G; G.render.kick && G.render.kick(0, 0.001, 0.06, 0.1); } catch (er) { /* */ } } } });
  }

  // ================================================================== 소환물 공통
  _summon(kind, s, o, build, tick) {
    const SUM = { root: ['wood', 0.9, 1.6], ginseng: ['heal', 0.8, 2.0], deer: ['earth', 1.2, 2.6] }[kind] || ['wood', 0.9, 2];
    const e = this._fx(kind, 1e9, (e, dt) => { if (e.wilting != null) { const k = (e.t - e.wilting) / 0.5; e.g.scale.setScalar(Math.max(0.001, 1 - easeOut(k))); if (k >= 1) this._free(e); return; } tick(e, dt);
      if (this.parts && !e.readyFx && e.s && e.s.ready) { e.readyFx = true; const b = P3(e.s.pos); this.pang(b.clone().setY(b.y + 0.6), SUM[0], { r: SUM[1] * 0.7, n: 14, ground: b.y, stars: lite() ? 1 : 3 }); this.beam(b, SUM[1] * 0.6, SUM[2], SUM[0], { life: 0.6, a: 0.85 }); if (kind === 'ginseng') this._snd('hb_hop'); }
      if (this.parts && e.buffOn && e.s) { e.bt = (e.bt || 0) - dt; if (e.bt <= 0) { e.bt = lite() ? 0.35 : 0.16; const b = P3(e.s.pos), a = rnd(0, 6.283); this.spark(b.clone().add(new THREE.Vector3(Math.cos(a) * 0.5, rnd(0.1, 1.2), Math.sin(a) * 0.5)), { v: new THREE.Vector3(0, 0.9, 0), life: 0.5, s0: 0.14, s1: 0.03, col: C.gold, k: 1, a: 0.9 }); } } });
    e.s = s; e.grow = o.grow || 0.5; e.buffOn = 0; e.buffK = 0; e.hurtK = 0; e.pulseK = 0;
    if (this.parts) this.sigil(P3(s.pos), SUM[1], SUM[0], { pat: 2, grow: e.grow * 0.8, life: e.grow + 0.7, a: 0.85, spin: 1.3, follow: () => P3(e.s.pos) });
    build(e);
    return this._h(e, {
      sync: (s2) => { e.s = s2; },
      buff: (on) => { e.buffOn = on ? 1 : 0; if (on) this.motes(P3(s.pos).setY((s.pos.y || 0) + 0.5), 6, { w: C.gold, b: C.goldB, r: 0.5, life: 0.6 }); },
      hurt: () => { e.hurtK = 1; },
      refresh: () => { e.pulseK = 1; this.ring(P3(s.pos), 1.2, C.jade, C.jadeB, 0.45, 1.2, 0.2); if (this.parts) { const b = P3(e.s.pos); this.pang(b.clone().setY(b.y + 0.7), SUM[0], { r: 0.6, n: 10, ground: b.y }); this.beam(b, 0.6, 2, SUM[0], { life: 0.5, a: 0.7 }); } this.leaves(P3(s.pos).setY((s.pos.y || 0) + 0.4), lite() ? 4 : 8, { up: 0.8, speed: 0.8, life: 0.7 }); },
      regrow: () => { e.regrowT = e.t; this.leaves(P3(s.pos).setY((s.pos.y || 0) + 0.3), 6, { up: 0.9, speed: 0.6, life: 0.7 }); },
      wilt: () => { if (e.wilting == null) { e.wilting = e.t; this.leaves(P3(s.pos).setY((s.pos.y || 0) + 0.4), lite() ? 4 : 8, { tint: 0xd8c070, up: 0.5, speed: 0.7, life: 0.8 }); } },
    });
  }
  /** common per-frame state: grow 0..1 (seed -> growth -> complete, = s.age / s.growT), gold buff glow */
  _sstate(e, dt) {
    const s = e.s, g = clamp01((s.age || 0) / Math.max(0.05, s.growT || e.grow));
    e.buffK += ((e.buffOn ? 1 : 0) - e.buffK) * Math.min(1, dt * 6); e.hurtK = Math.max(0, e.hurtK - dt * 6); e.pulseK = Math.max(0, e.pulseK - dt * 2);
    return g;
  }
  /** a seed sprout + soil ring while growing (shared by every summon) */
  _sprout(e, size = 1) { const sp = this.hs(e, 'hb_stem', {}), rg = this.spr(e, 1, C.jade, C.jadeB, 2), gl = this.spr(e, 0, C.jade, C.jadeB, 5); return { sp, rg, gl, size }; }
  _sproutTick(e, S, base, g) {
    S.sp.position.copy(base); S.sp.scale.setScalar(S.size * 1.6 * easeOut(clamp01(g * 1.6)) * (1 - smooth(0.85, 1, g))); S.sp.material.uniforms.uA.value = 1;
    S.rg.position.copy(base).setY(base.y + 0.05); this._flat(S.rg, S.size * (0.4 + 0.6 * g), 0.05); S.rg.material.uniforms.uA.value = 0.9 * (1 - smooth(0.9, 1.05, g));
    S.gl.quaternion.copy(this.camQ); S.gl.position.copy(base).setY(base.y + 0.3); S.gl.scale.setScalar(S.size * (0.4 + 0.9 * g)); S.gl.material.uniforms.uA.value = 0.6 * smooth(0.6, 0.95, g) * (1 - smooth(0.95, 1.15, g));
  }

  // ------------------------------------------------------------------ B1 갈근·반룡근
  k_root(s, o) {
    const N = H.root.n;
    const h = this._summon('root', s, o, (e) => {
      e.S = this._sprout(e, 0.8); e.roots = []; e.binds = []; e.biteS = null;
      for (let i = 0; i < N; i++) { const m = this.hs(e, 'hb_root', { glowC: C.gold, tint: i % 2 ? 0xffffff : 0xe0d0b0 }); if (m) e.roots.push({ m, a: i / N * 6.283 + rnd(-0.3, 0.3), h: rnd(0.9, 1.4), lean: rnd(0.25, 0.5), d: i * 0.05 }); }
      e.head = this.hs(e, 'hb_dragon', { tint: 0xc8ffe8, glowC: C.teal }); e.tip = e.roots[0];
    }, (e, dt) => {
      const s = e.s, g = this._sstate(e, dt), base = P3(s.pos); this._sproutTick(e, e.S, base, g);
      for (const r of e.roots) { const k = clamp01((g - 0.25 - r.d) / 0.55), sway = Math.sin(e.t * 2 + r.a) * 0.06;
        r.m.position.set(base.x + Math.cos(r.a) * 0.22, base.y - 0.05, base.z + Math.sin(r.a) * 0.22); r.m.rotation.set(0, -r.a, 0); r.m.rotateZ(-(r.lean + sway));
        r.m.scale.set(1.9, r.h * 1.6 * easeBack(k), 1.9); r.m.material.uniforms.uGlow.value = 0.35 * e.buffK + 0.2 * e.hurtK; }
      // 용머리: 첫 뿌리 끝에 붙어 있다가 물 때 대상 쪽으로 뻗음
      const b = e.biteS, tip = e.tip; let bk = 0, tgt = null;
      if (b) { const t = e.t - b.t; bk = t < 0.12 ? easeOut(t / 0.12) : 1 - smooth(0.12, 0.35, t); tgt = b.p; if (t > 0.4) e.biteS = null; }
      if (tip && e.head) { const top = base.clone().add(new THREE.Vector3(0, 1.25 * tip.h * clamp01((g - 0.25) / 0.55), 0)); const at = tgt ? top.clone().lerp(tgt, bk * 0.85) : top;
        e.head.position.copy(at); const f = tgt ? { x: tgt.x - base.x, z: -(tgt.z - base.z) } : { x: Math.cos(e.t * 0.5), z: Math.sin(e.t * 0.5) }; e.head.rotation.set(0, yawOf(f), 0); e.head.rotateX(0.3 - bk * 0.5);
        e.head.scale.setScalar(0.85 * smooth(0.75, 1, g)); e.head.material.uniforms.uGlow.value = 0.15 + 0.4 * bk + 0.35 * e.buffK; }
      for (const w of e.binds) { const t = e.t - w.t, k = t / w.life; w.ms.forEach((m, i) => { const a = i / w.ms.length * 6.283 + t * 1.5; m.visible = k < 1; m.position.set(w.p.x + Math.cos(a) * w.r, w.p.y - 0.05, w.p.z + Math.sin(a) * w.r); m.rotation.set(0, -a, 0); m.rotateZ(-0.9); m.scale.set(0.7, 0.6 * easeBack(clamp01(t / 0.15)) * (1 - smooth(0.8, 1, k)), 0.7); }); }
      e.binds = e.binds.filter(w => e.t - w.t < w.life);
    });
    h.bite = (t, ok) => {   // 뿌리 끝 용머리가 대상을 물고, 맞으면 대상 발을 가는 뿌리 셋이 감음(속박 시간 동안 — 보스는 묶이지 않으니 짧게)
      const p = P3(t.pos); h.biteS = { t: h.t, p: p.clone().setY(p.y + 0.45) };
      if (!ok) return;
      this.flash(p.clone().setY(p.y + 0.5), C.jade, C.tealB, 0.45, 0.14, 1.0);
      if (this.parts) this.pang(p.clone().setY(p.y + 0.55), 'wood', { r: 0.45, n: 7, ground: p.y, stars: lite() ? 0 : 1, noRing2: true });
      let w = h.binds.find(x => x.tgt === t);
      if (!w) { const ms = []; for (let i = 0; i < 3; i++) { const m = this.hs(h, 'hb_root', { tint: 0xd8c8a0 }); if (m) ms.push(m); } w = { tgt: t, ms }; h.binds.push(w); }
      w.t = h.t; w.p = p; w.r = (t.radius || 0.5) * 0.9; w.life = t.status && t.status.has && t.status.has('root') ? 1.2 : 0.45;
    };
    return h;
  }

  // ------------------------------------------------------------------ B3 천년삼 동자
  k_ginseng(s, o) {
    const SZ = H.ginseng.size;
    const h = this._summon('ginseng', s, o, (e) => {
      e.S = this._sprout(e, 0.6);
      e.tm = this.tmesh(e, 'ginseng', { glowC: C.gold });   // fx2: Tripo 천년삼 동자(통짜) — 채찍 팔은 뿌리 한 가닥
      if (e.tm) { e.whipM = this.hs(e, 'hb_root', { glowC: C.jade, tint: 0xf0e0b8 }); }
      else { e.body = this.hs(e, 'hb_gs_body', { glowC: C.gold, spec: 0.5 }); e.crown = this.hs(e, 'hb_gs_leaf', { glowC: C.gold });
        e.limbs = [0, 1, 2, 3].map(() => this.hs(e, 'hb_gs_limb', { glowC: C.gold })); }
      e.whipS = null; e.cheerS = -9; e.land = 0; e.lastHop = 0;
    }, (e, dt) => {
      const s = e.s, g = this._sstate(e, dt), base = P3(s.pos); this._sproutTick(e, e.S, base, g);
      if (e.tm) { this._ginsengTripo(e, s, g, base, dt); return; }
      const pop = easeBack(clamp01((g - 0.7) / 0.3)), vis = g > 0.7 ? 1 : 0, f = s.facing || { x: 0, z: 1 }, yaw = yawOf(f);
      // 깡충: 규칙(herbal.js hopTo)의 hopT를 그대로 — 공중 구간만 몸이 뜨고 앞으로 감, 내려앉으면 납작
      const H0 = 0.62, ph = s.moving ? s.hopT : 0, air = s.moving && ph < H0 ? Math.sin(Math.PI * ph / H0) : 0;
      if (s.moving && e.lastHop < H0 && ph >= H0) e.land = 1; e.lastHop = ph; e.land = Math.max(0, e.land - dt * 7);
      const idle = s.moving ? 0 : Math.sin(e.t * 4) * 0.02, squash = 1 - 0.18 * e.land + idle, jump = air * H.ginseng.hop * SZ + (e.t - e.cheerS < 0.5 ? Math.sin(Math.PI * (e.t - e.cheerS) / 0.5) * 0.25 : 0);
      const sc = SZ * pop * vis * (1 + 0.08 * e.pulseK);
      e.body.position.set(base.x, base.y + jump + 0.22 * sc, base.z); e.body.rotation.set(0, yaw, 0); e.body.rotateZ(s.moving ? 0.08 * Math.sin(e.t * 18) : 0); e.body.scale.set(sc * (2 - squash), sc * squash, sc * (2 - squash));
      const top = e.body.position.clone().setY(e.body.position.y + 0.92 * sc * squash);
      e.crown.position.copy(top); e.crown.rotation.set(0, yaw + Math.sin(e.t * 3) * 0.2, 0); e.crown.rotateZ(Math.sin(e.t * 2.4) * 0.12 - (s.moving ? 0.25 * air : 0)); e.crown.scale.setScalar(sc * 1.9);
      const fw = D3(f), rt = _a.crossVectors(fw, UP).normalize().clone();
      const wk = e.whipS ? clamp01((e.t - e.whipS.t) / 0.28) : 1; if (wk >= 1) e.whipS = null;
      const cheer = clamp01(1 - (e.t - e.cheerS) / 0.6);
      e.limbs.forEach((m, i) => { const arm = i < 2, side = i % 2 ? -1 : 1;
        m.position.copy(e.body.position).addScaledVector(rt, side * (arm ? 0.34 : 0.13) * sc).setY(e.body.position.y + (arm ? 0.42 : 0.12) * sc * squash);
        m.rotation.set(0, yaw, 0);
        let swing = arm ? 0.5 * side + Math.sin(e.t * 9 + i) * 0.15 : (s.moving ? 0.5 * air * side : 0);
        let len = 1;
        if (arm && side > 0 && e.whipS) { swing = -1.4 + 2.6 * easeOut(wk); len = 1 + 2.4 * Math.sin(Math.PI * wk); }   // 오른팔 뿌리 채찍: 뻗었다 돌아옴
        if (arm && cheer > 0) swing = side * (1.2 + 0.6 * cheer);
        m.rotateZ(arm ? swing : 0); m.rotateX(arm && side > 0 && e.whipS ? -1.3 * Math.sin(Math.PI * wk) : (!arm ? swing : 0));
        m.scale.set(sc * 1.35, sc * 1.35 * len, sc * 1.35); });
      for (const m of [e.body, e.crown, ...e.limbs]) { const u = m.material.uniforms; u.uGlow.value = 0.35 * e.buffK + 0.4 * e.hurtK + 0.3 * cheer * (m === e.crown ? 1 : 0); u.uGlowC.value.setHex(e.hurtK > 0.3 ? 0xff6050 : C.gold); }
    });
    h.whip = (t, ok) => { h.whipS = { t: h.t, p: P3(t.pos) }; if (ok && this.parts) { const p = P3(t.pos); this.pang(p.clone().setY(p.y + 0.6), 'wood', { r: 0.45, n: 7, ground: p.y, stars: lite() ? 0 : 1, noRing2: true }); } if (ok) { const p = P3(t.pos); this.flash(p.clone().setY(p.y + 0.6), C.jade, C.jadeB, 0.5, 0.14, 1.1); this.leaves(p.clone().setY(p.y + 0.4), lite() ? 2 : 4, { speed: 1.2, life: 0.5, size: 0.8 }); } };
    h.cheer = () => { h.cheerS = h.t; if (this.parts) { const b = P3(h.s.pos); for (let i = 0; i < this._nk(6); i++) { const a = i / 6 * 6.283; this.spark(b.clone().setY(b.y + 1.5), { v: new THREE.Vector3(Math.cos(a) * 1.2, rnd(1, 2), Math.sin(a) * 1.2), g: -3, life: 0.6, s0: 0.2, s1: 0.04, col: i % 2 ? C.gold : 0xff9a90, k: 1, a: 1 }); } this._snd('hb_hop'); } };
    return h;
  }
  /** Tripo 동자: 깡충(규칙 hopT의 공중 구간만 뜸)·내려앉으면 눌림·앞뒤 기울기·응원 점프·뿌리 채찍(오른쪽 옆에서 대상 쪽으로 뻗음) */
  _ginsengTripo(e, s, g, base, dt) {
    const SZ = H.tripo.ginseng, pop = easeBack(clamp01((g - 0.7) / 0.3)), vis = g > 0.7 ? 1 : 0, f = s.facing || { x: 0, z: 1 }, yaw = yawOf(f) + H.tripoYaw.ginseng;
    const H0 = 0.62, ph = s.moving ? s.hopT : 0, air = s.moving && ph < H0 ? Math.sin(Math.PI * ph / H0) : 0;
    if (s.moving && e.lastHop < H0 && ph >= H0) { e.land = 1; if (this.parts) for (let i = 0; i < this._nk(3); i++) this.spark(base.clone().add(new THREE.Vector3(rnd(-0.3, 0.3), 0.08, rnd(-0.3, 0.3))), { v: new THREE.Vector3(rnd(-0.6, 0.6), 0.4, rnd(-0.6, 0.6)), drag: 3, life: 0.4, s0: 0.22, s1: 0.4, col: 0xb8a070, k: 0, a: 0.5 }); }
    e.lastHop = ph; e.land = Math.max(0, e.land - dt * 7);
    const ck = e.t - e.cheerS < 0.6 ? (e.t - e.cheerS) / 0.6 : 1, cheer = ck < 1 ? Math.sin(Math.PI * ck) : 0;
    const idle = s.moving ? 0 : Math.sin(e.t * 3.2) * 0.03, squash = 1 - 0.2 * e.land + idle + 0.12 * air;
    const jump = air * H.ginseng.hop * 1.2 + cheer * 0.45, sc = SZ * pop * vis * (1 + 0.08 * e.pulseK) + 0.0001;
    const m = e.tm; m.position.set(base.x, base.y + jump, base.z); m.rotation.set(0, yaw + cheer * 6.283 * (ck < 1 ? easeOut(ck) : 0), 0);
    m.rotateX((s.moving ? 0.18 * air : 0) + (e.whipS ? -0.2 : 0)); m.rotateZ(s.moving ? 0.1 * Math.sin(e.t * 16) : Math.sin(e.t * 1.7) * 0.04);
    m.scale.set(sc * (2 - squash), sc * squash, sc * (2 - squash));
    const u = m.material.uniforms; u.uGlow.value = 0.32 * e.buffK + 0.5 * e.hurtK + 0.25 * cheer; u.uGlowC.value.setHex(e.hurtK > 0.3 ? 0xff6050 : C.gold);
    // 채찍 뿌리: 몸 오른쪽 어깨 높이에서 대상 쪽으로 뻗었다 돌아옴
    const w = e.whipM, wk = e.whipS ? clamp01((e.t - e.whipS.t) / 0.3) : 1; if (wk >= 1) e.whipS = null;
    if (w) { if (!e.whipS) { w.visible = false; } else { w.visible = true; const fw = D3(f), rt = _a.crossVectors(fw, UP).normalize(); const sh = m.position.clone().addScaledVector(rt, 0.3 * SZ).setY(m.position.y + 0.45 * SZ);
      const tp = e.whipS.p ? e.whipS.p.clone().setY(e.whipS.p.y + 0.5) : sh.clone().addScaledVector(fw, 1.5), d = tp.clone().sub(sh), L = d.length() * Math.sin(Math.PI * wk);
      w.position.copy(sh); _q.setFromUnitVectors(UP, d.normalize()); w.quaternion.copy(_q); w.scale.set(0.7, Math.max(0.01, L), 0.7); w.material.uniforms.uGlow.value = 0.35 * (1 - wk); } }
  }
  k_drop(s, o) {   // 금빛 약방울: 동자 머리 위 -> 주인 가슴, 도착 시각 = 실제 회복 시각(o.t)
    const T = o.t || 0.45, to = o.to;
    const from = P3(s.pos).setY((s.pos.y || 0) + 1.0);
    const e = this._fx('drop', T + 0.4, (e) => {
      const k = clamp01(e.t / T), end = P3(to.pos).setY((to.pos.y || 0) + 1.0);
      d.position.copy(from).lerp(end, easeOut(k)); d.position.y += Math.sin(k * Math.PI) * 0.7; d.scale.setScalar(0.07 * (k < 1 ? 1 : 0)); d.material.uniforms.uGlow.value = 0.8;
      gl.quaternion.copy(this.camQ); gl.position.copy(d.position); gl.scale.setScalar(k < 1 ? 0.35 : 0.9 * (1 - smooth(T, T + 0.35, e.t))); gl.material.uniforms.uA.value = H.intensity * (k < 1 ? 0.9 : 1.2 * (1 - smooth(T, T + 0.35, e.t)));
      if (k < 1 && this.parts) { e.tr = (e.tr || 0) - (e.dt || 0.016); if (e.tr <= 0) { e.tr = lite() ? 0.08 : 0.035; this.spark(d.position, { v: new THREE.Vector3(rnd(-0.2, 0.2), rnd(-0.2, 0.2), rnd(-0.2, 0.2)), life: 0.35, s0: 0.16, s1: 0.02, col: C.gold, k: 1, a: 0.9 }); } }
      if (k >= 1 && !e.arrived) { e.arrived = true; this.motes(end.clone().setY(end.y - 0.6), lite() ? 3 : 6, { w: C.gold, b: C.amberB, r: 0.35, up: 0.8, life: 0.6 }); if (this.parts) { this.pang(end, 'heal', { r: 0.4, n: 8, ground: end.y - 1, stars: 0, noRing2: true }); this._snd('hb_drop'); } }
    });
    const d = this.hs(e, 'hb_pill', { glowC: C.gold, tint: 0xffe0a0 }), gl = this.spr(e, 0, C.gold, C.amberB, 7);
    return this._h(e, { noop() {} });
  }

  // ------------------------------------------------------------------ B4 영지·녹각수호령
  k_deer(s, o) {
    const SZ = H.deer.size;
    const h = this._summon('deer', s, o, (e) => {
      e.S = this._sprout(e, 1.2);
      e.body = this.hs(e, 'hb_deer_body', { glowC: C.gold }); e.head = this.hs(e, 'hb_deer_head', { glowC: C.gold });
      e.legs = [0, 1, 2, 3].map(() => this.hs(e, 'hb_deer_leg', { glowC: C.gold }));
      e.ant = [0, 1].map(() => this.hs(e, 'hb_deer_antler', { glowC: C.gold }));
      e.parts = [e.body, e.head, ...e.legs, ...e.ant]; e.ramS = null; e.stompS = null; e.gait = 0;
      if (this.parts) e.aura = this.gd(e, 4, C.ochre, C.jadeB, 1);   // fx2: 발밑 금빛 영기 고리(실제 판정 아님 — 몸 둘레 1.1 m)
    }, (e, dt) => {
      if (e.aura) { const b = P3(e.s.pos); e.aura.position.set(b.x, b.y + 0.05, b.z); e.aura.scale.setScalar(1.1 + 0.05 * Math.sin(e.t * 3)); e.aura.material.uniforms.uA.value = 0.55 * clamp01(((e.s.age || 0) / Math.max(0.05, e.s.growT || e.grow) - 0.6) / 0.4) * (0.7 + 0.3 * Math.sin(e.t * 4));
        if (this.parts && e.ant && e.ant[0] && e.s.ready) { e.at = (e.at || 0) - dt; if (e.at <= 0) { e.at = lite() ? 0.5 : 0.22; const m = e.ant[(e.t * 7 | 0) % 2]; this.spark(m.position.clone().setY(m.position.y + 0.35 * H.deer.size), { v: new THREE.Vector3(rnd(-0.2, 0.2), 0.7, rnd(-0.2, 0.2)), life: 0.6, s0: 0.16, s1: 0.03, col: rnd(0, 1) < 0.5 ? C.gold : C.jade, k: 1, a: 0.9, tw: 14 }); } } }
      const s = e.s, g = this._sstate(e, dt), base = P3(s.pos); this._sproutTick(e, e.S, base, g);
      const f = s.facing || { x: 0, z: 1 }, yaw = yawOf(f), fw = D3(f), rt = _a.crossVectors(fw, UP).normalize().clone();
      // 모임: 부위가 땅에서 솟아 제자리로(성장 0.35..1)
      const as = (d) => easeOut(clamp01((g - 0.35 - d) / 0.4));
      if (s.moving) e.gait += dt * 7.5;
      const rk = e.ramS ? clamp01((e.t - e.ramS) / 0.42) : 1, ram = Math.sin(Math.PI * rk) * (rk < 1 ? 1 : 0);
      const sk = e.stompS != null ? clamp01((e.t - e.stompS) / 0.5) : 1, rear = sk < 1 ? Math.sin(Math.PI * Math.min(1, sk / 0.6)) * (sk < 0.6 ? 1 : 0) : 0;
      const hipY = 0.78 * SZ, bob = s.moving ? Math.abs(Math.sin(e.gait)) * 0.04 : Math.sin(e.t * 2) * 0.01;
      const c = base.clone().addScaledVector(fw, 0.28 * ram * SZ).setY(base.y + hipY + bob + 0.25 * rear * SZ);
      e.body.position.copy(c).setY(c.y - (1 - as(0)) * 1.0); e.body.rotation.set(0, yaw, 0); e.body.rotateX(-0.35 * rear + 0.05 * ram); e.body.scale.setScalar(SZ * Math.max(0.01, as(0)));
      const neck = c.clone().addScaledVector(fw, 0.5 * SZ).setY(c.y + 0.12 * SZ);
      e.head.position.copy(neck).setY(neck.y - (1 - as(0.1)) * 1.2); e.head.rotation.set(0, yaw, 0); e.head.rotateX(0.55 * ram - 0.2 * rear + (s.moving ? 0.05 * Math.sin(e.gait * 2) : 0)); e.head.scale.setScalar(1.35 * SZ * Math.max(0.01, as(0.1)));
      const headTop = e.head.position.clone().addScaledVector(fw, (0.18 + 0.12 * ram) * SZ).setY(e.head.position.y + (0.62 - 0.2 * ram) * SZ);
      e.ant.forEach((m, i) => { const sd = i ? -1 : 1; m.position.copy(headTop).addScaledVector(rt, sd * 0.07 * SZ); m.rotation.set(0, yaw, 0); m.scale.set(1.5 * sd * SZ * as(0.25), 1.5 * SZ * as(0.25), 1.5 * SZ * as(0.25)); m.rotateX(0.55 * ram); });
      e.legs.forEach((m, i) => { const front = i < 2, sd = i % 2 ? -1 : 1, ph = e.gait + (front ? 0 : Math.PI) + (sd > 0 ? 0 : Math.PI);
        m.position.copy(c).addScaledVector(fw, (front ? 0.36 : -0.36) * SZ).addScaledVector(rt, sd * 0.17 * SZ).setY(c.y - 0.05 * SZ);
        m.rotation.set(0, yaw, 0); m.rotateX((s.moving ? 0.45 * Math.sin(ph) : 0) + (front ? -0.9 * rear : 0.2 * rear)); m.scale.setScalar(SZ * Math.max(0.01, as(0.05 + i * 0.04))); });
      for (const m of e.parts) { const u = m.material.uniforms; u.uGlow.value = (m === e.ant[0] || m === e.ant[1] ? 0.55 : 0.18) * e.buffK + 0.35 * e.hurtK; u.uGlowC.value.setHex(e.hurtK > 0.3 ? 0xff6050 : C.gold); }
      if (e.stompS != null && sk >= 0.6 && !e.stamped) { e.stamped = true; e.doStomp && e.doStomp(); }
    });
    h.ram = (t, ok) => { h.ramS = h.t; if (ok) { const p = P3(t.pos); this.flash(p.clone().setY(p.y + 0.6), C.ochre, C.jadeB, 0.55, 0.15, 1.1); this._hpuffs(p, 3, 0.6, { a: 0.3 }); if (this.parts) this.pang(p.clone().setY(p.y + 0.6), 'earth', { r: 0.5, n: 8, ground: p.y, stars: lite() ? 0 : 1, noRing2: true }); } };
    h.stomp = (o2) => {   // 앞발을 들었다 구르면(0.3 s) 뿌리가 정면 부채꼴(= 실제 판정 r·ang)로 차례로 솟음
      h.stompS = h.t; h.stamped = false;
      h.doStomp = () => {
        const s2 = h.s, base = P3(s2.pos), f = o2.f, a0 = Math.atan2(-f.z, f.x), half = (o2.ang || 100) * Math.PI / 360, R = o2.r || 3.2;
        this.ring(base, 1.0, C.ochre, C.jadeB, 0.3, 1.0, 0.3);
        if (this.parts) { this.sigil(base, Math.min(R, 1.6), 'earth', { pat: 0, grow: 0.15, life: 0.8, a: 0.9, spin: 2 }); this.pang(base.clone().setY(base.y + 0.3), 'earth', { r: 0.7, n: 10, ground: base.y, stars: lite() ? 1 : 2 }); this._snd('hb_stomp');
          if ((o2.hits || []).length) { const q = (o2.hits || [])[0]; this._shout(q, '쿵!', '#ffe08a', '#5a3a10', 1.3); } }
        const rays = lite() ? 3 : 5, per = 3;
        for (let i = 0; i < rays; i++) for (let j = 0; j < per; j++) { const a = a0 + (rays > 1 ? (i / (rays - 1) - 0.5) * 2 * half * 0.9 : 0), d = R * (0.35 + 0.6 * j / (per - 1));
          this._rootPop(new THREE.Vector3(base.x + Math.cos(a) * d, 0, base.z + Math.sin(a) * d), 0.05 + j * 0.06, 0.8 + j * 0.15); }
        for (const p of o2.hits || []) { const q = P3(p); this.flash(q.clone().setY(q.y + 0.4), C.ochre, C.jadeB, 0.5, 0.14, 1.0); if (this.parts) this.pang(q.clone().setY(q.y + 0.5), 'earth', { r: 0.45, n: 6, ground: q.y, stars: 0, noRing2: true }); }
      };
    };
    return h;
  }
  /** one root bursting out of the ground and sinking back (three coords x,z; y from the ground) */
  _rootPop(at, delay = 0, size = 1, o = {}) {
    at.y = groundY(at.x, -at.z);
    const life = delay + (o.life || 0.75);
    const e = this._fx('rootpop', life, (e) => {
      const t = e.t - delay; if (t < 0) { m.visible = false; return; } m.visible = true;
      const up = easeBack(clamp01(t / 0.14)), down = smooth(0.4, 0.75, t);
      m.position.copy(at).setY(at.y - 0.05); m.scale.set(size * 1.1, size * 0.9 * up * (1 - down), size * 1.1); m.material.uniforms.uGlow.value = (o.glow ?? 0.15) * (1 - smooth(0, 0.3, t));
      if (!e.dusted && t > 0) { e.dusted = true; this._hpuffs(at, lite() ? 1 : 2, 0.35, { a: 0.28, life: 0.5 });
        if (this.parts) { for (let i = 0; i < this._nk(3); i++) { const a = rnd(0, 6.283); this.bit('leaf', at.clone().setY(at.y + 0.2 * size), { v: new THREE.Vector3(Math.cos(a) * 1.2, rnd(1.6, 2.6), Math.sin(a) * 1.2), g: -6, life: 0.6, s0: 0.1 * size, s1: 0.05, col: 0xd8ffd0, wx: 6, wz: 5, glow: 0.15 }); }
          this.spark(at.clone().setY(at.y + 0.3), { life: 0.25, s0: 0.5 * size, s1: 0.9 * size, col: o.glowC ?? C.gold, k: 1, a: 0.8 }); } }
    });
    const m = this.hs(e, 'hb_root', { tint: o.tint ?? 0xffffff, glowC: o.glowC ?? C.gold }); if (m) m.rotation.set(0, rnd(0, 6.283), rnd(-0.25, 0.25));
    return e;
  }

  // ------------------------------------------------------------------ B2 독초·자운화
  k_bloom(c, o) {
    const r = o.r || 2.8, grow = o.grow || 0.6, c3 = P3(c), N = lite() ? 6 : 9;
    const e = this._fx('bloom', (o.dur || 8) + 0.7, (e) => {
      const fk = this._fadeK(e), wilt = e.ending != null ? 1 - fk : 0;
      disc.material.uniforms.uA.value = 0.65 * fk * smooth(0, 0.3, e.t); disc.material.uniforms.uT.value = e.t;
      fl.forEach((F, i) => { const k = clamp01((e.t - F.d) / (grow * 0.6)), open = smooth(grow, grow + 0.25, e.t) * (1 - 0.6 * wilt);
        F.stem.position.copy(F.p); F.stem.scale.setScalar(1.6 * easeBack(k)); F.stem.rotation.set(0, F.a, 0.1 * Math.sin(e.t * 1.5 + i) + 0.6 * wilt); F.stem.material.uniforms.uA.value = fk;
        const top = F.p.clone().setY(F.p.y + 0.42 * 1.6 * easeBack(k) * (1 - 0.3 * wilt));
        F.bud.position.copy(top); F.bud.scale.setScalar(1.6 * easeBack(k) * (1 - open * 0.6)); F.bud.material.uniforms.uA.value = fk; F.bud.material.uniforms.uGlow.value = 0.25 * F.pulse;
        F.petals.forEach((p, j) => { p.position.copy(top); p.rotation.set(0, j / F.petals.length * 6.283 + F.a, 0); p.rotateX(-0.1 - 1.2 * open + 0.9 * wilt); p.scale.setScalar(1.7 * open + 0.001); p.material.uniforms.uA.value = fk; p.material.uniforms.uGlow.value = 0.3 * F.pulse; });
        F.pulse = Math.max(0, F.pulse - (e.dt || 0.016) * 3);
      });
    });
    const disc = this.gd(e, 1, C.purple, C.purpleB, 1); disc.position.copy(c3).setY(c3.y + 0.04); disc.scale.setScalar(r);
    const fl = []; for (let i = 0; i < N; i++) {   // 꽃 자리: 가운데 하나 + 둘레 두 겹(차례로 자람)
      const a = i === 0 ? 0 : (i / (N - 1)) * 6.283 * 1.0 + (i % 2) * 0.3, rr = i === 0 ? 0 : r * (i % 2 ? 0.45 : 0.75), x = c3.x + Math.cos(a) * rr, z = c3.z + Math.sin(a) * rr;
      const F = { p: new THREE.Vector3(x, groundY(x, -z), z), a: rnd(0, 6.283), d: i * (grow * 0.4 / N), pulse: 0, stem: this.hs(e, 'hb_stem', {}), bud: this.hs(e, 'hb_bud', { glowC: C.purple }), petals: [] };
      for (let j = 0; j < 5; j++) F.petals.push(this.hs(e, 'hb_petal', { glowC: C.purple })); fl.push(F); }
    let sg = null;
    if (this.parts) {   // fx2: 연꽃 진(= 실제 r, 보라·분홍)이 그려지고 옅게 남음 + 꽃이 다 피는 순간 '팡'
      sg = this.sigil(c3, r, 'poison', { pat: 2, grow: grow, life: (o.dur || 8) + 0.6, a: 0.5, spin: -0.4 });
      this._later(grow + 0.15, () => { this.pang(c3.clone().setY(c3.y + 0.6), 'poison', { r: 0.6, n: 12, ground: c3.y, stars: lite() ? 1 : 2 }); }, e);
    }
    return this._h(e, {
      spore: (hits) => {   // 피해 틱 = 포자 고리: 꽃마다 작은 보라 연기 + 범위 끝까지 퍼지는 고리 하나, 맞은 적에게 보라 점
        for (const F of fl) { F.pulse = 1; if (!lite() || fl.indexOf(F) % 2 === 0) this._hpuffs(F.p.clone().setY(F.p.y + 0.5), 1, 0.3, { c1: C.purple, c2: C.purpleB, a: 0.3, life: 0.7, rise: 0.4 }); }
        this.ring(c3, r, C.purple, C.purpleB, 0.55, 0.9, 0.15);
        for (const p of hits) { const q = P3(p); this.motes(q.clone().setY(q.y + 0.5), lite() ? 2 : 4, { w: C.purple, b: C.purpleB, r: 0.3, life: 0.5, up: 0.6 }); }
        if (this.parts) { for (const F of fl) for (let i = 0; i < (lite() ? 1 : 3); i++) { const a = rnd(0, 6.283); this.spark(F.p.clone().setY(F.p.y + 0.6), { v: new THREE.Vector3(Math.cos(a) * rnd(0.4, 1.0) * r * 0.4, rnd(0.6, 1.3), Math.sin(a) * rnd(0.4, 1.0) * r * 0.4), drag: 1.5, life: rnd(0.7, 1.0), s0: 0.24, s1: 0.1, col: i % 2 ? 0xff9ad8 : C.purple, k: 0, a: 0.8 }); }
          for (const p of hits) { const q = P3(p); this.spark(q.clone().setY(q.y + 0.7), { life: 0.35, s0: 0.3, s1: 0.8, col: C.purple, k: 2, a: 0.9 }); }
          this._snd('hb_spore'); }
      },
      extend: (k = 2) => { e.life += k; this.ring(c3, r, C.sapph, C.sapphB, 0.5, 1.1, 0.85); if (sg) sg.life += k; },
      end: () => { this._end(e, 0.6); if (sg) sg.end(0.6); } });
  }

  // ------------------------------------------------------------------ B5 신농백초원
  k_garden(c, o) {
    const r = o.r || 7, c3 = P3(c), S = H.scroll, N = lite() ? 14 : 28, F = lite() ? 10 : 18;
    const e = this._fx('garden', (o.dur || 12) + 0.8, (e) => {
      const fk = this._fadeK(e), t = e.t;
      // 두루마리: 하늘에서 펼쳐지고(0..0.5) 그림이 빛으로 내려오고(0.4..1.0) 사라짐(1.0..1.4)
      const open = easeOut(clamp01(t / 0.5)), gone = smooth(1.0, 1.4, t), sc = c3.clone().setY(c3.y + S.h);
      const fw = new THREE.Vector3(0, 0, 1).applyQuaternion(this.camQ).setY(0).normalize(), rt = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camQ).setY(0).normalize();
      paper.position.copy(sc); paper.quaternion.copy(this.camQ); paper.scale.set(S.w, S.paper, 1); paper.material.uniforms.uP.value = open; paper.material.uniforms.uA.value = 1 - gone;
      rods.forEach((m, i) => { const sd = i ? 1 : -1; m.position.copy(sc).addScaledVector(rt, sd * S.w * 0.5 * open); m.quaternion.copy(this.camQ); m.rotateZ(Math.PI / 2); m.scale.setScalar(S.paper * 1.15); m.material.uniforms.uA.value = 1 - gone; });
      void fw;
      lights.forEach((L) => { const k = clamp01((t - L.d) / 0.5); L.m.quaternion.copy(this.camQ); L.m.position.copy(sc).lerp(L.to, easeOut(k)); L.m.scale.setScalar(0.2 + 0.15 * (1 - k)); L.m.material.uniforms.uA.value = H.intensity * (k > 0 && k < 1 ? 1.0 : 0); });
      disc.material.uniforms.uA.value = 0.8 * fk * smooth(0.5, 1.0, t); disc.material.uniforms.uT.value = t;
      herbs.forEach((h, i) => { const k = clamp01((t - h.userData.d) / 0.35); h.scale.setScalar(h.userData.s * easeBack(k) * fk); h.rotation.z = 0.08 * Math.sin(t * 1.7 + i); h.material.uniforms.uA.value = 1; });
      roots.forEach((m, i) => { m.scale.set(1.2, 0.45 * easeOut(clamp01((t - 0.2 - i * 0.01) / 0.3)) * fk, 1.2); });
    });
    const paper = this._m(e, 'tx', this.quad, 8); paper.material.uniforms.uMap.value = paperTex(); paper.material.uniforms.uA.value = 0;
    const rods = [0, 1].map(() => this.hs(e, 'hb_scroll_rod', { order: 9 }));
    const disc = this.gd(e, 2, C.gold, 0x4aa040, 1); disc.position.copy(c3).setY(c3.y + 0.04); disc.scale.setScalar(r);
    const herbs = [], lights = [], roots = [];
    for (let i = 0; i < N + F; i++) {   // 낮은 약초(안) + 가장자리 꽃(테두리) — 키 큰 나무 없음
      const rim = i >= N, a = rim ? (i - N) / F * 6.283 : rnd(0, 6.283), rr = rim ? r * rnd(0.9, 0.98) : r * Math.sqrt(rnd(0.05, 0.8)), x = c3.x + Math.cos(a) * rr, z = c3.z + Math.sin(a) * rr;
      const h = this.hs(e, rim ? (i % 2 ? 'hb_bud' : 'hb_stem') : 'hb_herb', { tint: rim ? (i % 3 ? 0xfff0c0 : 0xffd8f0) : 0xffffff, glowC: C.gold }); if (!h) continue;
      h.position.set(x, groundY(x, -z), z); h.rotation.y = rnd(0, 6); h.userData.s = rim ? rnd(1.6, 2.1) : rnd(0.8, 1.3); h.userData.d = 0.6 + rnd(0, 0.5); herbs.push(h);
      if (i % 3 === 0) lights.push({ m: this.spr(e, 0, C.gold, C.goldB, 7), to: h.position.clone().setY(h.position.y + 0.3), d: 0.35 + rnd(0, 0.35) });
    }
    for (let i = 0; i < (lite() ? 6 : 12); i++) { const a = i / (lite() ? 6 : 12) * 6.283, x = c3.x + Math.cos(a) * r * 0.97, z = c3.z + Math.sin(a) * r * 0.97, m = this.hs(e, 'hb_root', { tint: 0xd8c8a0 }); if (!m) continue; m.position.set(x, groundY(x, -z) - 0.05, z); m.rotation.set(0, -a, 1.25); roots.push(m); }   // 땅 위를 기는 뿌리(테두리)
    const sgs = [];
    if (this.parts) {   // fx2: 두루마리 소리 + 큰 이중 마법진(바깥 = 실제 r, 안 오행 진) + 두루마리에서 내려오는 빛기둥 + 꽃잎 비 + 연꽃 가장자리
      this._snd('hb_scroll');
      sgs.push(this.sigil(c3, r, 'lotus', { pat: 2, grow: 1.0, life: (o.dur || 12) + 0.8, a: 0.6, spin: 0.25 }), this.sigil(c3, r * 0.45, 'heal', { pat: 0, grow: 1.0, life: 2.4, fade: 0.8, a: 0.8, spin: -0.8 }));
      const nb = lite() ? 4 : 7; for (let i = 0; i < nb; i++) { const a = i / nb * 6.283 + 0.3, rr = i ? r * 0.55 : 0, p = new THREE.Vector3(c3.x + Math.cos(a) * rr, 0, c3.z + Math.sin(a) * rr); p.y = groundY(p.x, -p.z);
        this._later(0.4 + i * 0.07, () => this.beam(p, i ? 0.35 : 0.8, S.h + 0.6, 'heal', { life: 0.75, a: 0.9 }), e); }
      this._later(0.55, () => { for (let i = 0; i < this._nk(30); i++) { const a = rnd(0, 6.283), rr = r * Math.sqrt(rnd(0, 0.8)); this.bit('petal', c3.clone().add(new THREE.Vector3(Math.cos(a) * rr, S.h - rnd(0, 1), Math.sin(a) * rr)), { v: new THREE.Vector3(rnd(-0.4, 0.4), -rnd(1.2, 2.0), rnd(-0.4, 0.4)), life: rnd(1.4, 2.0), s0: rnd(1.0, 1.4), s1: 0.8, col: i % 3 ? 0xffd8ee : 0xfff2b8, wx: rnd(-3, 3), wz: rnd(-3, 3), glow: 0.3, floor: c3.y + 0.04 }); } }, e);
      const nl = lite() ? 4 : 8; for (let i = 0; i < nl; i++) { const a = i / nl * 6.283 + 0.2, m = this.hs(e, 'hb_lotus', { glowC: C.gold }); if (!m) break; const x = c3.x + Math.cos(a) * r * 0.9, z = c3.z + Math.sin(a) * r * 0.9; m.position.set(x, groundY(x, -z), z); m.userData.s = rnd(0.7, 0.95); m.userData.d = 0.8 + i * 0.04; herbs.push(m); }
    }
    return this._h(e, {
      erupt: (hits) => {   // 시전 순간: 안의 적 발밑마다 뿌리가 솟고, 둘레에도 몇 개
        for (const p of hits) { const q = P3(p); for (let k = 0; k < 3; k++) this._rootPop(new THREE.Vector3(q.x + Math.cos(k * 2.1) * 0.35, 0, q.z + Math.sin(k * 2.1) * 0.35), k * 0.04, 1.0, { glow: 0.35 }); this.flash(q.clone().setY(q.y + 0.5), C.gold, C.jadeB, 0.6, 0.16, 1.1); }
        for (let k = 0; k < (lite() ? 6 : 12); k++) { const a = k / (lite() ? 6 : 12) * 6.283; this._rootPop(new THREE.Vector3(c3.x + Math.cos(a) * r * 0.6, 0, c3.z + Math.sin(a) * r * 0.6), 0.05 + (k % 3) * 0.03, 0.9); }
        this.ring(c3, r, C.gold, C.jadeB, 0.6, 1.1, 0.1);
        if (this.parts) { hits.slice(0, lite() ? 3 : 8).forEach((p, i) => { const q = P3(p); this.pang(q.clone().setY(q.y + 0.6), 'wood', { r: 0.55, n: 8, ground: q.y, stars: i < 3 ? 1 : 0 }); if (i < 2) this._shout(p, '쑥쑥!', '#c8ffb0', '#1a5a30', 1.3); }); }
      },
      end: () => { this._end(e, 0.7); for (const g of sgs) g.end(0.7); } });
  }

  // ================================================================== C1 목행·청룡승근
  k_dragonLine(o3, o) {
    const o0 = P3(o3), f = D3(o.f), n = o.n || 7, step = o.step || 1.2;
    const e = this._fx('dline', (n - 1) * (o.gap || 0.055) + 1.2, (e) => {
      if (head.s >= 0) { const t = e.t - head.s, up = easeBack(clamp01(t / 0.16)), fade = 1 - smooth(0.55, 0.85, t);
        head.m.position.copy(head.p).setY(head.p.y - 0.8 + 2.0 * up).addScaledVector(f, 0.6 * easeOut(clamp01(t / 0.2))); head.m.rotation.set(0, yawOf(o.f), 0); head.m.rotateX(-0.5 + 0.5 * up);
        head.m.scale.setScalar(1.7 * up * fade + 0.001); head.m.material.uniforms.uGlow.value = 0.6 * (1 - smooth(0, 0.3, t)) + 0.15; head.m.material.uniforms.uA.value = fade;
        head.g.quaternion.copy(this.camQ); head.g.position.copy(head.m.position); head.g.scale.setScalar(1.6 * (1 - smooth(0, 0.25, t))); head.g.material.uniforms.uA.value = H.intensity * 1.1 * (1 - smooth(0, 0.25, t)); }
    });
    const head = { s: -1, m: this.hs(e, 'hb_dragon', { glowC: C.teal, see: true }), g: this.spr(e, 3, C.teal, C.tealB, 7) }; if (head.m) head.m.scale.setScalar(0.001);
    const tdr = this.tmesh(e, 'dragon', { glowC: C.teal });   // fx2: Tripo 청룡(아기 용) — 땅에서 솟아 앞으로 덮침, 없으면 절차 머리
    if (tdr) { tdr.scale.setScalar(0.001); if (head.m) head.m.visible = false; const up0 = e.update; e.update = (q, dt) => { up0(q, dt); if (head.s < 0) return; const t = q.t - head.s, up = easeBack(clamp01(t / 0.2)), fade = 1 - smooth(0.6, 0.9, t);
      tdr.position.copy(head.p).setY(head.p.y - 1.2 * (1 - up) - 0.25 * smooth(0.6, 0.9, t)).addScaledVector(f, 0.7 * easeOut(clamp01(t / 0.25))); tdr.rotation.set(0, yawOf(o.f) + H.tripoYaw.dragon, 0); tdr.rotateX(0.35 * Math.sin(Math.PI * clamp01(t / 0.35)));
      tdr.scale.setScalar(H.tripo.dragon * Math.max(0.001, up) * (0.4 + 0.6 * fade) + 0.0001); tdr.material.uniforms.uA.value = fade; tdr.material.uniforms.uGlow.value = 0.55 * (1 - smooth(0, 0.35, t)) + 0.1; }; }
    return this._h(e, {
      root: (i, last, hits) => {   // 뿌리 i가 땅을 뚫고 솟음(아래에서 위로), 마지막 = 청룡 머리가 솟아 앞으로 꿰뚫음
        const p = o0.clone().addScaledVector(f, 0.9 + i * step);
        const lat = _a.crossVectors(f, UP).normalize();
        for (let k = 0; k < (lite() ? 1 : 2); k++) this._rootPop(p.clone().addScaledVector(lat, (k ? -1 : 1) * 0.25), k * 0.03, 1.45 + 0.25 * i / n, { tint: 0x70e8c8, glowC: C.teal, glow: 0.7 });
        this.ring(p.clone().setY(groundY(p.x, -p.z)), 0.6, C.teal, C.tealB, 0.3, 0.8, 0.3);
        if (last && (head.m || tdr)) { head.s = e.t; head.p = p.clone().setY(groundY(p.x, -p.z)); }
        if (this.parts) { const g3 = p.clone().setY(groundY(p.x, -p.z)); this.sigil(g3, 0.7, 'wood', { pat: 0, grow: 0.1, life: 0.55, a: 0.8, spin: 3 });
          if (last) { this.beam(g3, 0.9, 3.4, 'wood', { life: 0.7, a: 1.0 }); this.pang(g3.clone().setY(g3.y + 1.0), 'wood', { r: 0.9, n: 18, ground: g3.y, stars: lite() ? 1 : 3 }); this._snd('hb_dragon');
            [0, 2.1, 4.2].forEach((ph, j) => this.trail((t) => { if (t > 0.45) return null; const k = t / 0.45, a = ph + k * 9, rr = 0.9 - 0.4 * k; return g3.clone().add(new THREE.Vector3(Math.cos(a) * rr, 0.2 + 2.2 * easeOut(k), Math.sin(a) * rr)).addScaledVector(f, 0.5 * k); }, 'wood', { n: 14, w: 0.13, life: 0.75, w0: j === 1 ? C.gold : 0xd8fff4, w1: C.tealB }));
            if ((hits || []).length) this._shout(hits[0], '콰직!', '#c8fff0', '#0a4a40', 1.45); } }
        for (const q of hits || []) { const h3 = P3(q); this.flash(h3.clone().setY(h3.y + 0.6), C.teal, C.tealB, last ? 0.9 : 0.6, 0.16, 1.2); if (this.parts && !last) this.pang(h3.clone().setY(h3.y + 0.6), 'wood', { r: 0.45, n: 6, ground: h3.y, stars: 0, noRing2: true }); this.leaves(h3.clone().setY(h3.y + 0.4), lite() ? 2 : 4, { tint: 0xa0ffe0, speed: 1.1, life: 0.5 }); }
      } });
  }

  // ================================================================== C2 화행·주작천구
  k_bird(from, o) {
    const pre = o.pre; if (pre && pre.handOff) pre.handOff();
    const dir = D3(o.dir); let pos = P3(from), trailT = 0;
    const e = this._fx('bird', 3, (e, dt) => {
      if (e.hit) return;
      const spread = easeBack(clamp01(e.t / 0.18)), flap = Math.sin(e.t * 22) * 0.5;
      body.position.copy(pos); body.rotation.set(0, Math.atan2(dir.x, dir.z), 0); body.scale.setScalar(0.65 * Math.max(0.25, spread)); body.material.uniforms.uGlow.value = 0.55;
      wings.forEach((w, i) => { const sd = i ? -1 : 1; w.position.copy(pos); w.rotation.set(0, Math.atan2(dir.x, dir.z), 0); w.rotateZ(sd * flap * 0.6); w.scale.set(spread * sd, 1, spread); w.material.uniforms.uGlow.value = 0.6; });
      gl.quaternion.copy(this.camQ); gl.position.copy(pos); gl.scale.setScalar(1.3); gl.material.uniforms.uA.value = H.intensity * 0.55;
      trailT -= dt; if (trailT <= 0) { trailT = lite() ? 0.06 : 0.035; this.motes(pos.clone(), 1, { w: C.vermil, b: C.vermilB, r: 0.15, up: 0.3, spread: 0.2, life: 0.35, size: 1.3 }); }
    });
    const body = this.hs(e, 'hb_bird', { glowC: C.vermil }), wings = [0, 1].map(() => this.hs(e, 'hb_wing', { glowC: C.vermil, see: true })), gl = this.spr(e, 0, C.vermil, C.vermilB, 6);
    const tb = this.tmesh(e, 'phoenix', { glowC: C.vermil });   // fx2: Tripo 주작 몸통 + 반투명 불꽃 날개 + 불꽃 리본 꼬리 + 불티·불꽃 혀
    if (this.parts) {
      this._snd('hb_phoenix');
      const tr = this.trail(() => e.dead || e.hit ? null : pos.clone(), 'fire', { n: 16, w: 0.22, life: 3, w0: 0xffe090, w1: C.vermilB }); e.tr = tr;
      const up0 = e.update; e.update = (q, dt) => { if (q.hit) return; up0(q, dt);
        if (tb) { body.visible = false; tb.position.copy(pos).setY(pos.y - 0.25); tb.rotation.set(0, Math.atan2(dir.x, dir.z) + H.tripoYaw.phoenix, 0); tb.rotateZ(Math.sin(q.t * 22) * 0.12); tb.scale.setScalar(H.tripo.phoenix * Math.max(0.3, easeBack(clamp01(q.t / 0.18)))); tb.material.uniforms.uGlow.value = 0.35; wings.forEach(w => { w.material.uniforms.uA.value = 0.55; }); }
        q.ft = (q.ft || 0) - dt; if (q.ft <= 0) { q.ft = lite() ? 0.07 : 0.03; this.bit('flame', pos.clone().add(new THREE.Vector3(rnd(-0.2, 0.2), rnd(-0.1, 0.2), rnd(-0.2, 0.2))), { v: new THREE.Vector3(rnd(-0.3, 0.3), rnd(0.6, 1.2), rnd(-0.3, 0.3)).addScaledVector(dir, -1.5), life: 0.35, s0: 0.28, s1: 0.05, col: 0xffffff, rx: 0, rz: rnd(-0.4, 0.4), ry: rnd(0, 6), glow: 0.6 });
          this.spark(pos, { v: new THREE.Vector3(rnd(-1, 1), rnd(-0.2, 1), rnd(-1, 1)).addScaledVector(dir, -2), g: -2, drag: 2, life: 0.45, s0: 0.14, s1: 0.02, col: rnd(0, 1) < 0.5 ? 0xffd070 : C.vermil, k: 1, a: 1 }); } };
    }
    return this._h(e, {
      set: (p) => { pos = P3(p); },
      impact: (c, io) => {   // 착탄: 가운데 작은 섬광 + 좌우로 퍼지는 날개 모양 불꽃(= 실제 날개 판정 폭) + 쑥 재·불티
        e.hit = true; this._free(e); if (e.tr) e.tr.stop();
        const c3 = P3(c), d = D3(io.dir), lat = _a.crossVectors(d, UP).normalize().clone(), W = io.wing || 5;
        if (this.parts) {   // fx2: 불 오행 진(= 가운데 판정 core) + 빛기둥 + '팡' + 날개 판정 폭을 따라 솟는 불꽃 혀
          const core = io.core || 1.3; this.sigil(c3, core, 'fire', { pat: 0, grow: 0.12, life: 0.9, a: 0.9, spin: 2.5 }); this.beam(c3, core * 0.6, 2.6, 'fire', { life: 0.55 });
          this.pang(c3.clone().setY(c3.y + 0.7), 'fire', { r: core * 0.6, n: 16, ground: c3.y, stars: lite() ? 1 : 3 }); this._snd('hb_flameburst');
          const nf = this._nk(16); for (let i = 0; i < nf; i++) { const sd = i % 2 ? 1 : -1, kk = (((i >> 1) + 0.5) / Math.ceil(nf / 2)), at = c3.clone().addScaledVector(lat, sd * W / 2 * kk * 0.95); at.y = groundY(at.x, -at.z);
            this.bit('flame', at, { v: new THREE.Vector3(0, rnd(1.0, 1.8), 0), life: rnd(0.45, 0.65), s0: rnd(0.45, 0.65) * (1 - 0.4 * kk), s1: 0.1, col: 0xffffff, rx: 0, rz: rnd(-0.3, 0.3), ry: rnd(0, 6), glow: 0.7, inT: 0.05 }); }
          if ((io.hits || []).length) this._shout(io.hits[0], '화르륵!', '#ffd08a', '#6a1808', 1.4); }
        this.flash(c3.clone().setY(c3.y + 0.6), C.vermil, C.vermilB, 1.0, 0.16, 1.3);
        this.ring(c3, io.core || 1.3, C.vermil, C.vermilB, 0.35, 1.2, 0.2);
        const fe = this._fx('wingfire', 0.75, (q) => { const k = q.t / 0.75;
          fw.forEach((w, i) => { const sd = i ? -1 : 1; w.position.copy(c3).setY(c3.y + 0.12); w.rotation.set(0, Math.atan2(d.x, d.z), 0);
            const sz = (W / 2) * easeOut(clamp01(k / 0.3)); w.scale.set(sz * sd, 1.2, sz * 0.7); w.material.uniforms.uA.value = 0.85 * (1 - smooth(0.35, 1, k)); w.material.uniforms.uGlow.value = 1.0 * (1 - k); });
        });
        const fw = [0, 1].map(() => this.hs(fe, 'hb_wing', { see: true, glowC: C.vermil, tint: 0xffd080 }));
        const n = lite() ? 4 : 7;
        for (const sd of [1, -1]) for (let k = 1; k <= n; k++) { const at = c3.clone().addScaledVector(lat, sd * W / 2 * k / n).addScaledVector(d, -0.25 * (k / n) * (k / n)); at.y = groundY(at.x, -at.z);
          this._hpuffs(at, 1, 0.25, { c1: C.vermil, c2: C.vermilB, a: 0.4, life: 0.45, rise: 0.5 }); }
        this.leaves(c3.clone().setY(c3.y + 0.3), lite() ? 4 : 8, { geo: 'hb_leaf', tint: 0x6a625a, up: 0.9, speed: 1.6, r: 0.4, life: 0.8, size: 0.7 });   // 쑥 재
        this.motes(c3.clone().setY(c3.y + 0.2), lite() ? 6 : 12, { w: C.vermil, b: C.vermilB, r: W / 3, up: 1.4, spread: 1.2, life: 0.7 });
      } });
  }

  // ================================================================== C3 토행·황정지맥
  k_leyline(pc, o) {
    const from = P3(o.from), c3 = P3(o.c), r = o.r || 2.6, run = o.run || 0.25; let ringAt = -1;
    const e = this._fx('leyline', run + 7.5, (e) => {
      const fk = this._fadeK(e), k = clamp01(e.t / run);
      // 땅속 맥: 시전자 -> 조준점 금빛 점들이 땅 위를 달림
      dots.forEach((m, i) => { const q = clamp01(k * 1.2 - i / dots.length * 0.2); m.quaternion.copy(this.camQ); const p = from.clone().lerp(c3, q); p.y = groundY(p.x, -p.z) + 0.08; m.position.copy(p); m.scale.setScalar(0.22); m.material.uniforms.uA.value = H.intensity * (k < 1 ? 1.0 : 1 - smooth(run, run + 0.2, e.t)) * (q > 0 && q < 1 ? 1 : 0); });
      const u = disc.material.uniforms; u.uT.value = e.t; u.uP.value = ringAt < 0 ? 0 : easeOut(clamp01((e.t - ringAt) / 0.25)); u.uA.value = ringAt < 0 ? 0 : fk * (0.95 - 0.55 * smooth(ringAt + 0.6, ringAt + 1.2, e.t));
    });
    const dots = []; for (let i = 0; i < (lite() ? 6 : 10); i++) dots.push(this.spr(e, 0, C.ochre, C.ochreB, 5));
    const disc = this.gd(e, 3, C.ochre, C.ochreB, 1); disc.position.copy(c3).setY(c3.y + 0.04); disc.scale.setScalar(r);
    let sg = null, shouted = false;
    if (this.parts) this.trail((t) => { if (t > run + 0.05) return null; const p = from.clone().lerp(c3, easeOut(clamp01(t / run))); p.y = groundY(p.x, -p.z) + 0.12; return p; }, 'earth', { n: 12, w: 0.16, life: run + 0.5, w0: 0xfff0b0, w1: C.ochreB });   // fx2: 땅 위를 달리는 금빛 맥
    return this._h(e, {
      ring: () => { ringAt = e.t; this.ring(c3, r, C.ochre, C.ochreB, 0.4, 1.2, 0.15);
        if (this.parts) { sg = this.sigil(c3, r, 'earth', { pat: 1, grow: 0.3, life: 7.6, fade: 1.2, a: 0.65, spin: 0.5 }); this.pang(c3.clone().setY(c3.y + 0.4), 'earth', { r: 0.6, n: 12, ground: c3.y, stars: lite() ? 1 : 2 }); this._snd('hb_quake'); } },
      pillar: (p, ok) => {   // 실제 피해 자리: 낮은 육각 돌기둥 + 뿌리 둘이 솟음(가리지 않게 낮게), 금빛 먼지
        const q = P3(p); q.y = groundY(q.x, -q.z);
        const pe = this._fx('pillar', 0.9, (x) => { const t = x.t, up = easeBack(clamp01(t / 0.14)), down = smooth(0.5, 0.9, t); pl.position.copy(q).setY(q.y - 0.05); pl.scale.set(0.42, 0.55 * up * (1 - down) + 0.001, 0.42); pl.material.uniforms.uGlow.value = 0.5 * (1 - smooth(0, 0.3, t)); });
        const pl = this.hs(pe, 'hb_pillar', { glowC: C.ochre }); pl.rotation.y = rnd(0, 1);
        this._rootPop(q.clone().add(new THREE.Vector3(0.3, 0, 0.1)), 0.03, 0.7); this._rootPop(q.clone().add(new THREE.Vector3(-0.25, 0, -0.2)), 0.06, 0.6);
        if (ok) this.flash(q.clone().setY(q.y + 0.5), C.ochre, C.ochreB, 0.6, 0.15, 1.1);
        if (this.parts) { this.beam(q, 0.42, 1.8, 'earth', { life: 0.45, a: 0.8 }); if (ok) { this.pang(q.clone().setY(q.y + 0.6), 'earth', { r: 0.45, n: 8, ground: q.y, stars: lite() ? 0 : 1, noRing2: true }); if (!shouted) { shouted = true; this._shout(p, '쿠궁!', '#ffe8a0', '#5a3a10', 1.4); } } }
        this._hpuffs(q, lite() ? 2 : 3, 0.5, { c1: 0xf0d090, c2: 0x8a6a30, a: 0.35, life: 0.5 });
      },
      end: () => { this._end(e, 0.5); if (sg) sg.end(0.5); } });
  }

  // ================================================================== C4 금행·백호유침
  k_needles(from, o) {
    const pre = o.pre, fan = pre && pre.fanAt ? pre.fanAt.clone() : P3(from), fanR = pre && pre.fanR ? pre.fanR.clone() : _a.crossVectors(D3(o.f), UP).normalize().clone();
    if (pre && pre.handOff) pre.handOff();
    const e = this._fx('needles', 2.2, () => {});
    let idx = 0;
    const self = this;
    const flyer = (to, at, curve, opt = {}) => {   // 침 하나: 어깨 뒤 부채 자리 -> (조금씩 다른 곡선) -> to(대상 몸통, 매 프레임 따라감), 도착 = at 초
      const i = idx++, start = fan.clone().addScaledVector(fanR, ((i % 9) / 8 - 0.5) * 0.6).setY(fan.y + 0.15 * Math.cos(i));
      const n = { landed: false, faded: false, t0: e.t };
      const ne = this._fx('needle', at + 0.3, (q) => {
        if (n.landed || n.faded) { const k = (q.t - n.endT) / 0.18; m.material.uniforms.uA.value = 1 - clamp01(k); tr.material.uniforms.uA.value = 0; return; }
        const k = clamp01(q.t / at), end = typeof to === 'function' ? to() : to, mid = start.clone().lerp(end, 0.5).addScaledVector(fanR, curve).setY(Math.max(start.y, end.y) + 0.5 * Math.abs(curve) + 0.2);
        const p = start.clone().multiplyScalar((1 - k) * (1 - k)).addScaledVector(mid, 2 * k * (1 - k)).addScaledVector(end, k * k);
        const d = end.clone().sub(mid).multiplyScalar(2 * k).add(mid.clone().sub(start).multiplyScalar(2 * (1 - k))).normalize();
        m.position.copy(p); _q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), d); m.quaternion.copy(_q); m.scale.setScalar(0.42); m.material.uniforms.uA.value = 1;
        this._alignLine(tr, d); tr.position.copy(p).addScaledVector(d, -0.25); tr.scale.set(0.5, 0.06, 1); tr.material.uniforms.uA.value = H.intensity * 0.9;   // 짧은 꼬리(굵은 광선 아님)
        if (opt.fly && k >= 1) { n.faded = true; n.endT = q.t; }
      });
      const m = this.hs(ne, 'hb_needle', { glowC: C.plat, glow: 0.5, spec: 1.4 }), tr = this.spr(ne, 2, C.plat, C.platB, 5);
      if (this.parts && (i % (lite() ? 3 : 1) === 0)) this.trail(() => (n.landed || n.faded || ne.dead) ? null : m.position.clone(), 'metal', { n: 9, w: 0.05, life: at + 0.3, w0: 0xffffff, w1: i % 2 ? C.goldB : C.platB, a: 0.9 });   // fx2: 침마다 가는 백금·금 리본
      return Object.assign(n, { land: (t, ok) => { n.landed = true; n.endT = ne.t; if (ok) { const p3 = P3(t.pos); self.flash(p3.clone().setY(p3.y + 0.6), C.plat, C.platB, 0.32, 0.1, 1.0);
        if (self.parts) for (let k = 0; k < self._nk(3); k++) self.spark(m.position, { v: new THREE.Vector3(rnd(-1.2, 1.2), rnd(0.4, 1.6), rnd(-1.2, 1.2)), drag: 4, life: 0.3, s0: 0.18, s1: 0.03, col: k % 2 ? C.gold : C.plat, k: 1, a: 1.1 }); } }, fade: () => { n.faded = true; n.endT = ne.t; } });
    };
    const body = (t) => () => { const p = P3(t.pos); p.y += Math.min(1.2, 0.5 + (t.radius || 0.5) * 0.6); return p; };
    return this._h(e, {
      needle: (t, no) => flyer(body(t), no.at, no.curve),
      miss: (mo) => { const f = D3(mo.f), half = (mo.ang || 50) * Math.PI / 360; for (let i = 0; i < 9; i++) { const a = (i / 8 - 0.5) * 2 * half, d = f.clone().applyAxisAngle(UP, a); const to = P3(from).addScaledVector(d, mo.r || 6); to.y = fan.y - 0.4; flyer(to, (mo.r || 6) / 16, (i - 4) * 0.08, { fly: true }); } },
      mark: (t) => { const p = P3(t.pos); this.ring(p, (t.radius || 0.5) + 0.25, C.plat, C.platB, 0.5, 1.2, 0.5); if (this.parts) this.sigil(p, (t.radius || 0.5) + 0.3, 'metal', { pat: 0, grow: 0.12, life: 0.9, a: 0.9, spin: 2.5 }); },
      claw: (t, f) => {   // 호랑이 발톱: 금빛 선 셋이 대상에서 엇갈려 그어짐
        const p = P3(t.pos).setY((t.pos.y || 0) + 0.7), d = D3(f), lat = _a.crossVectors(d, UP).normalize().clone();
        const ce = this._fx('claw', 0.4, (q) => { const k = q.t / 0.4; ls.forEach((l, i) => { const dir = lat.clone().multiplyScalar(i === 3 ? -1 : 1).add(new THREE.Vector3(0, i === 3 ? 0.9 : -0.9, 0)).normalize(); this._alignLine(l, dir); l.position.copy(p).addScaledVector(lat, (i - 1) * 0.18 * (i === 3 ? 0 : 1)); l.scale.set(1.1 * easeOut(clamp01(k / 0.2)), 0.12, 1); l.material.uniforms.uA.value = H.intensity * 1.6 * (1 - smooth(0.3, 1, k)); }); });
        const ls = [0, 1, 2, 3].map(() => this.spr(ce, 2, C.gold, C.goldB, 8));
        if (this.parts) { this.pang(p, 'metal', { r: 0.6, n: 12, ground: P3(t.pos).y, stars: lite() ? 1 : 2 }); this._shout(t.pos, '푹!', '#ffffff', '#3a4a70', 1.45); }
      } });
  }
  _alignLine(m, dir) {   // camera-facing quad whose x axis follows dir (screen-projected)
    m.quaternion.copy(this.camQ); const loc = dir.clone().applyQuaternion(_q.copy(this.camQ).invert()); m.rotateZ(Math.atan2(loc.y, loc.x));
  }

  // ================================================================== C5 수행·현무약해
  k_wave(o3, o) {
    const o0 = P3(o3), f = D3(o.f), w = o.w || 2.4, len = o.len || 8; let front = 0.4, endAt = -1, shellT = 0;
    const e = this._fx('wave', 3, (e) => {
      const fk = endAt < 0 ? 1 : 1 - smooth(endAt, endAt + 0.35, e.t);
      const p = o0.clone().addScaledVector(f, front); p.y = groundY(p.x, -p.z) + 0.05;
      crest.position.copy(p).addScaledVector(f, -0.6); crest.rotation.set(0, Math.atan2(f.x, f.z), 0); crest.scale.set(w, 1, 1.2); crest.material.uniforms.uT.value = e.t; crest.material.uniforms.uA.value = 0.9 * fk;
      // 낮은 물마루(높이 0.35 m 정도 — 약초·캐릭터가 보이게)
      const pos = crest.geometry.attributes.position; void pos;
      lip.position.copy(p).setY(p.y + 0.18); lip.rotation.set(0, Math.atan2(f.x, f.z), 0); lip.scale.set(w * 0.5, 0.18, 0.18); lip.material.uniforms.uA.value = 0.75 * fk; lip.material.uniforms.uGlow.value = 0.3;
      shellT = e.t; const sk = clamp01(shellT / 0.35); sh.position.copy(o0.clone().addScaledVector(f, 1.1)).setY(groundY(o0.x + f.x * 1.1, -(o0.z + f.z * 1.1)) + 0.05); sh.rotation.set(0, Math.atan2(f.x, f.z), 0);
      sh.scale.set(w * 0.45 * easeOut(sk), 0.12, w * 0.45 * easeOut(sk)); sh.material.uniforms.uA.value = 0.75 * (1 - smooth(0.25, 0.5, shellT)); sh.material.uniforms.uGlow.value = 0.35;
    });
    const crest = this._m(e, 'wv', this.waveGeo, 3); crest.material.uniforms.uW.value.setHex(C.sapph); crest.material.uniforms.uB.value.setHex(C.sapphB);
    const lip = this.hs(e, 'hb_pill', { see: true, tint: 0xa8d8ff, glowC: C.sapph }), sh = this.hs(e, 'hb_shell', { see: true, glowC: C.sapph });
    let splashed = 0;
    if (this.parts) {   // fx2: 시작점 거북 육각 진(폭 w 안) + 물마루를 따라 튀는 물방울·반짝이 + 물결 소리
      this.sigil(o0.clone().addScaledVector(f, 1.0), Math.min(w / 2, 1.4), 'water', { pat: 3, grow: 0.15, life: 0.9, a: 0.85, spin: 1.5 }); this._snd('hb_wave');
      const lat = new THREE.Vector3().crossVectors(f, UP).normalize();
      const up0 = e.update; e.update = (q, dt) => { up0(q, dt); if (endAt >= 0) return; q.sp = (q.sp || 0) - dt; if (q.sp > 0) return; q.sp = lite() ? 0.06 : 0.025;
        const s = rnd(-0.45, 0.45) * w, p = o0.clone().addScaledVector(f, front).addScaledVector(lat, s); p.y = groundY(p.x, -p.z) + 0.25;
        this.bit('drop', p, { v: new THREE.Vector3(0, rnd(1.6, 2.8), 0).addScaledVector(f, rnd(1, 2.5)), g: -9, life: 0.45, s0: rnd(0.09, 0.14), s1: 0.05, col: 0xffffff, rx: 0, rz: 0, ry: 0, glow: 0.4, floor: p.y - 0.2 });
        if (rnd(0, 1) < 0.5) this.spark(p, { v: new THREE.Vector3(0, 0.8, 0).addScaledVector(f, 1.5), life: 0.35, s0: 0.14, s1: 0.03, col: 0xe8f8ff, k: 1, a: 1 }); };
    }
    return this._h(e, {
      front: (s) => { front = s; },
      splash: (p) => { if (this.parts) { const q3 = P3(p); this.pang(q3.clone().setY(q3.y + 0.5), 'water', { r: 0.45, n: 8, ground: q3.y, stars: 0, noRing2: true });
          for (let i = 0; i < this._nk(6); i++) { const a = rnd(0, 6.283); this.bit('drop', q3.clone().setY(q3.y + 0.4), { v: new THREE.Vector3(Math.cos(a) * 1.4, rnd(2, 3.2), Math.sin(a) * 1.4), g: -9, life: 0.5, s0: 0.12, s1: 0.05, col: 0xffffff, glow: 0.4, floor: q3.y }); }
          if (splashed++ === 0) this._shout(p, '촤악!', '#d8f2ff', '#183a7a', 1.4); } const q = P3(p); this.motes(q.clone().setY(q.y + 0.3), lite() ? 3 : 6, { w: C.sapph, b: C.sapphB, r: 0.3, up: 1.2, spread: 0.8, life: 0.5 }); this.ring(q, 0.8, C.sapph, C.sapphB, 0.3, 0.9, 0.3); },
      feed: (c) => { this.ring(P3(c), 1.5, C.sapph, C.sapphB, 0.5, 1.0, 0.2); if (this.parts) this.pang(P3(c).setY((c.y || 0) + 0.4), 'water', { r: 0.5, n: 8, stars: 0, noRing2: true }); },
      end: () => { if (endAt < 0) { endAt = e.t; e.life = e.t + 0.4; } },
      dispose: () => this._free(e) });
  }


  // ================================================================== 2026-11-20 처방 5종 (js/herbal.js k_a1·a2·a3·c3·c4)
  /** 정점 색이 있는 작은 절차 메시(한 번만 만들어 둠): 찻잔 cup / 보호막 bubble / 먹선 관 ink / 마디 구슬 node / 약포지 paper */
  _rx(name) {
    this._rxg = this._rxg || {}; if (this._rxg[name]) return this._rxg[name];
    let g;
    const paint = (g, fn) => { g = g.toNonIndexed ? g : g; const p = g.attributes.position, c = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) { const col = new THREE.Color(fn(p.getX(i), p.getY(i), p.getZ(i))); c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g; };
    if (name === 'cup') { const pr = [[0, 0], [0.30, 0], [0.34, 0.06], [0.42, 0.42], [0.46, 0.56], [0.44, 0.57], [0.38, 0.44], [0.30, 0.10], [0, 0.10]].map(([x, y]) => new THREE.Vector2(x, y));
      g = paint(new THREE.LatheGeometry(pr, 20), (x, y, z) => y > 0.52 ? 0xffd27a : Math.hypot(x, z) < 0.31 && y < 0.2 ? 0xd88a20 : 0xf6efe2); }
    else if (name === 'tea') { g = paint(new THREE.CircleGeometry(0.38, 20).rotateX(-Math.PI / 2).translate(0, 0.40, 0), () => 0xe0901e); }
    else if (name === 'bubble') g = paint(new THREE.SphereGeometry(1, 24, 14), (x, y) => y > 0.6 ? 0xfff4c8 : 0xffcf7a);
    else if (name === 'ink') g = paint(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true).translate(0, 0.5, 0), () => 0x2a0a0e);
    else if (name === 'node') g = paint(new THREE.SphereGeometry(1, 14, 10), () => 0x5a0c12);
    else if (name === 'paper') g = paint(new THREE.PlaneGeometry(0.42, 0.34, 2, 2), (x, y) => Math.abs(x) > 0.18 || Math.abs(y) > 0.14 ? 0xb08040 : 0xf4e2b8);
    return (this._rxg[name] = g);
  }
  rx(e, name, o = {}) { const m = this._m(e, o.see ? 'hsa' : 'hs', this._rx(name), o.order ?? 3), u = m.material.uniforms; u.uTint.value.setHex(o.tint ?? 0xffffff); u.uRim.value.setHex(o.rim ?? 0xfff0d0); u.uGlowC.value.setHex(o.glowC ?? C.gold); u.uA.value = o.a ?? 1; u.uGlow.value = o.glow ?? 0; u.uSpec.value = o.spec ?? 0.6; u.uVein.value = 0; return m; }
  get _rm() { return this.rm && gfxOn() && this.rm.ok && this.rm.ok() ? this.rm : null; }

  // ------------------------------------------------------------------ A1 탕약 나누기: '두 잔'
  k_cups(pc, o) {
    const hand = () => P3(o.hand ? o.hand() : pc.pos), f = () => D3(pc.facing);
    const st = { flyP: null, arrived: false, held: !!o.keep, drank: false, gone: false, endT: -1 };
    const e = this._fx('cups', o.keep ? (o.hold || 8) + 1.5 : 3, (e) => {
      const hp = hand(), fw = f(), lat = _a.crossVectors(fw, UP).normalize().clone(), k0 = clamp01(e.t / 0.25), t = e.t;
      // 탕관이 손 앞에 나타나 두 번 기울어짐(0~0.3 s) -> 사라짐
      pot.position.copy(hp).addScaledVector(fw, 0.18).setY(hp.y + 0.12); pot.rotation.set(0, Math.atan2(fw.x, fw.z), 0); pot.rotateX(0.6 * Math.max(Math.sin(clamp01(t / 0.3) * Math.PI * 2), 0)); pot.scale.setScalar(0.28 * easeBack(k0) * (1 - smooth(0.4, 0.6, t)));
      // 잔 둘: 손 양옆에 나란히(0.1 s) — 한 잔은 내 가슴으로 들어가 사라지고, 다른 한 잔은 날아가거나(보낸 잔) 손에 남음(남은 한 잔)
      const c1p = hp.clone().addScaledVector(lat, -0.22).setY(hp.y - 0.05), c2p = hp.clone().addScaledVector(lat, 0.22).setY(hp.y - 0.05);
      const mine = clamp01((t - 0.3) / 0.35); cup1.position.copy(c1p).lerp(P3(pc.pos).setY((pc.pos.y || 0) + 1.15), easeOut(mine)); cup1.scale.setScalar(0.24 * smooth(0.04, 0.14, t) * (1 - smooth(0.55, 0.7, t))); tea1.position.copy(cup1.position); tea1.scale.copy(cup1.scale);
      let p2 = c2p; if (st.flyP) p2 = st.flyP; else if (st.held) p2 = hp.clone().addScaledVector(lat, 0.18).setY(hp.y + 0.02 + 0.03 * Math.sin(t * 3));
      const show2 = st.arrived || st.gone || st.drank ? 0 : 1; cup2.position.copy(p2); cup2.scale.setScalar(0.24 * smooth(0.04, 0.14, t) * show2); tea2.position.copy(p2); tea2.scale.copy(cup2.scale);
      for (const [m, q] of [[gl1, cup1.position], [gl2, p2]]) { m.quaternion.copy(this.camQ); m.position.copy(q).setY(q.y + 0.18); m.scale.setScalar(0.42); }
      gl1.material.uniforms.uA.value = H.intensity * 0.7 * smooth(0.04, 0.14, t) * (1 - smooth(0.5, 0.7, t)); gl2.material.uniforms.uA.value = H.intensity * (st.held ? 0.45 + 0.2 * Math.sin(t * 5) : 0.7) * show2 * smooth(0.04, 0.14, t);
      if (show2 && this.parts && st.held) { e.sp = (e.sp || 0) - (e.dt || 0.016); if (e.sp <= 0) { e.sp = lite() ? 0.3 : 0.16; this.spark(p2.clone().setY(p2.y + 0.15), { v: new THREE.Vector3(rnd(-0.05, 0.05), 0.55, rnd(-0.05, 0.05)), life: 0.7, s0: 0.12, s1: 0.04, col: C.gold, k: 0, a: 0.8 }); } }
    });
    const pot = this.hs(e, 'hb_pot', { glowC: C.amber, glow: 0.2 }), cup1 = this.rx(e, 'cup'), cup2 = this.rx(e, 'cup', { glowC: C.amber, glow: 0.15 }), tea1 = this.rx(e, 'tea', { glowC: C.amber, glow: 0.4 }), tea2 = this.rx(e, 'tea', { glowC: C.amber, glow: 0.4 });
    const gl1 = this.spr(e, 0, C.amber, C.amberB, 6), gl2 = this.spr(e, 0, C.gold, C.amberB, 6);
    if (this.parts) { const b = P3(pc.pos); this.pang(b.clone().setY(b.y + 1.1), 'heal', { r: 0.35, n: 6, ground: b.y, stars: 0, noRing2: true }); this._snd('hb_drop'); const rm = this._rm; if (rm) rm.healAura(pc, { gold: 0xffe08a, col: 0xffb850, dur: 1.0, r: 0.8 }); }
    let trail = null;
    return this._h(e, {
      fly: (p, t) => { st.flyP = P3(p).setY((p.y || 1) + 0.15 + Math.sin(Math.min(1, e.t) * Math.PI) * 0.2); if (!trail && this.parts) trail = this.trail(() => st.flyP && !st.arrived ? st.flyP.clone() : null, 'heal', { n: 12, w: 0.08, life: 3, w0: 0xfff0b0, w1: C.amberB }); },
      arrive: (t) => { st.arrived = true; const q = P3(t.pos); if (this.parts) { this.pang(q.clone().setY(q.y + 0.8), 'heal', { r: 0.5, n: 10, ground: q.y, stars: lite() ? 1 : 2 }); this.beam(q, 0.45, 1.6, 'heal', { life: 0.5 }); } this.motes(q.clone().setY(q.y + 0.3), lite() ? 4 : 8, { w: C.gold, b: C.amberB, r: 0.4, up: 1.0, life: 0.7 }); const rm = this._rm; if (rm) rm.healAura({ pos: t.pos }, { gold: 0xffe08a, col: 0xffb850, dur: 1.0, r: 0.7 }); this._end(e, 0.3); },
      spill: () => { st.gone = true; this._end(e, 0.2); },
      drink: () => { st.drank = true; const b = P3(pc.pos); if (this.parts) { this.pang(b.clone().setY(b.y + 1.1), 'heal', { r: 0.45, n: 10, ground: b.y, stars: lite() ? 1 : 2 }); } this.motes(b.clone().setY(b.y + 0.5), lite() ? 4 : 8, { w: C.gold, b: C.amberB, r: 0.4, up: 1.0, life: 0.7 }); const rm = this._rm; if (rm) rm.healAura(pc, { gold: 0xffe08a, col: 0xffb850, dur: 1.0, r: 0.8 }); this._end(e, 0.25); },
      expire: () => { st.gone = true; const p = hand(); this._hpuffs(p, 2, 0.2, { c1: 0xfff0c0, c2: C.gold, a: 0.3, life: 0.6, rise: 0.5 }); this._end(e, 0.3); } });
  }

  // ------------------------------------------------------------------ A2 보중익기탕: '위로 오르는 금빛 김'
  k_tonic(pc, o) {
    const ticks = o.ticks || 4, every = o.every || 1, T = (ticks - 1) * every + 0.9, sums = (o.summons || []).slice();
    const e = this._fx('tonic', T + 0.4, (e) => {
      const b = P3(pc.pos), fw = D3(pc.facing), t = e.t, cp = b.clone().addScaledVector(fw, 0.28).setY(b.y + 1.12), fk = 1 - smooth(T - 0.3, T, t);
      cup.position.copy(cp); cup.scale.setScalar(0.24 * smooth(0, 0.12, t) * fk); tea.position.copy(cp); tea.scale.copy(cup.scale);
      // 탕관 주둥이 같은 잔 위 가느다란 금빛 김 — 위로 감아 오름(tick 마다 굵어짐)
      steams.forEach((m, i) => { const ph = (t * 0.9 + i / steams.length) % 1, a = ph * 9 + i; m.quaternion.copy(this.camQ); m.position.set(cp.x + Math.sin(a) * 0.08 * (1 + ph), cp.y + 0.15 + ph * 1.1, cp.z + Math.cos(a) * 0.08 * (1 + ph)); m.scale.setScalar(0.16 + 0.22 * ph + e.pulse * 0.2); m.material.uniforms.uA.value = H.intensity * (0.75 + e.pulse) * smooth(0, 0.15, ph) * (1 - smooth(0.6, 1, ph)) * fk; });
      e.pulse = Math.max(0, (e.pulse || 0) - (e.dt || 0.016) * 2.5);
      // 영물 발밑: 위로 감기는 금빛 바람(가속 동안)
      winds.forEach((w, i) => { const s = w.s; if (s.dead) { for (const m of w.ms) m.material.uniforms.uA.value = 0; return; } const sb = P3(s.pos), wk = 1 - smooth(o.dur - 0.5, o.dur, t);
        w.ms.forEach((m, j) => { const ph = (t * 1.4 + j / w.ms.length) % 1, a = ph * 10 + j * 2.1; m.quaternion.copy(this.camQ); m.position.set(sb.x + Math.cos(a) * (0.55 - 0.3 * ph), sb.y + 0.05 + ph * 0.9, sb.z + Math.sin(a) * (0.55 - 0.3 * ph)); m.scale.setScalar(0.18 * (1 - 0.5 * ph)); m.material.uniforms.uA.value = H.intensity * 0.9 * smooth(0, 0.1, ph) * (1 - smooth(0.7, 1, ph)) * wk * smooth(0, 0.3, t); }); });
    });
    e.life = Math.max(T, o.dur || 8) + 0.4; e.pulse = 0;
    const cup = this.rx(e, 'cup', { glowC: C.gold, glow: 0.2 }), tea = this.rx(e, 'tea', { glowC: C.gold, glow: 0.5 });
    const steams = []; for (let i = 0; i < (lite() ? 6 : 12); i++) steams.push(this.spr(e, 0, C.gold, C.amberB, 6));
    const winds = sums.map(s => ({ s, ms: Array.from({ length: lite() ? 4 : 8 }, () => this.spr(e, 0, C.gold, C.goldB, 6)) }));
    if (this.parts) { this.sigil(P3(pc.pos), 0.9, 'heal', { pat: 2, grow: 0.3, life: 1.2, a: 0.8, spin: 1.2, follow: () => P3(pc.pos) }); for (const s of sums) { this.sigil(P3(s.pos), 0.7, 'heal', { pat: 0, grow: 0.25, life: 1.0, a: 0.75, spin: 2, follow: () => P3(s.pos) }); this.beam(P3(s.pos), 0.35, 1.4, 'heal', { life: 0.5, a: 0.8 }); } }
    return this._h(e, { tick: (i) => { e.pulse = 1; const b = P3(pc.pos); if (this.parts) { for (let k = 0; k < this._nk(6); k++) this.spark(b.clone().setY(b.y + 1.2), { v: new THREE.Vector3(rnd(-0.3, 0.3), rnd(1.2, 2.2), rnd(-0.3, 0.3)), drag: 1.5, life: 0.8, s0: 0.18, s1: 0.04, col: k % 2 ? C.gold : 0xfff0b0, k: k % 3 ? 0 : 1, a: 1 }); if (i === 0) this.pang(b.clone().setY(b.y + 1.3), 'heal', { r: 0.4, n: 6, ground: b.y, stars: 0, noRing2: true }); } } });
  }

  // ------------------------------------------------------------------ A3 구풍해독탕: '대상에서 바깥으로 퍼지는 잎'
  k_purge(pc, o) {
    let fp = null; const e = this._fx('purge', 3.5, (e) => {
      const hp = P3(o.hand ? o.hand() : pc.pos), fw = D3(pc.facing), t = e.t;
      pot.position.copy(hp).addScaledVector(fw, 0.2).setY(hp.y + 0.1); pot.rotation.set(0, Math.atan2(fw.x, fw.z), 0); pot.rotateX(1.1 * smooth(0, 0.2, t)); pot.scale.setScalar(0.3 * smooth(0, 0.08, t) * (1 - smooth(0.35, 0.55, t)));
      if (fp) { head.quaternion.copy(this.camQ); head.position.copy(fp); head.scale.setScalar(0.38); head.material.uniforms.uA.value = H.intensity * 0.9 * (e.burst ? 0 : 1); }
    });
    const pot = this.hs(e, 'hb_pot', { glowC: C.amber, glow: 0.3 }), head = this.spr(e, 0, C.amber, C.amberB, 6);
    let tr = null;
    return this._h(e, {
      fly: (p) => { fp = P3(p).setY((p.y || 1) + 0.1); if (!tr && this.parts) tr = this.trail(() => fp && !e.burst ? fp.clone() : null, 'heal', { n: 16, w: 0.13, life: 3.4, w0: 0xffe8a0, w1: C.amberB });
        if (this.parts) { e.dp = (e.dp || 0) - (e.dt || 0.016); if (e.dp <= 0) { e.dp = lite() ? 0.08 : 0.04; this.bit('drop', fp, { v: new THREE.Vector3(rnd(-0.2, 0.2), 0.3, rnd(-0.2, 0.2)), g: -6, life: 0.4, s0: 0.07, s1: 0.03, col: 0xffc060, glow: 0.4, floor: fp.y - 1.2 }); } } },
      burst: (t, bo) => {
        e.burst = true; const c = P3(t.pos), R = bo.r || 2, gy = c.y;
        // 잎 고리: 대상 둘레에서 바깥으로 한 번(반경 = 밀어내는 거리 안)
        const nl = this._nk(18); for (let i = 0; i < nl; i++) { const a = i / nl * 6.283 + rnd(-0.1, 0.1), sp = R * rnd(2.0, 2.6);
          this.bit('leaf', c.clone().add(new THREE.Vector3(Math.cos(a) * 0.3, 0.45 + rnd(0, 0.4), Math.sin(a) * 0.3)), { v: new THREE.Vector3(Math.cos(a) * sp, rnd(0.4, 1.2), Math.sin(a) * sp), g: -2.5, drag: 3.2, life: rnd(0.5, 0.75), s0: 0.16, s1: 0.1, col: i % 3 ? 0x8ae070 : 0xffd27a, glow: 0.25, wz: rnd(-8, 8), wy: rnd(-6, 6) }); }
        for (let i = 0; i < this._nk(10); i++) { const a = rnd(0, 6.283); this.spark(c.clone().setY(gy + 0.6), { v: new THREE.Vector3(Math.cos(a) * R * 2.2, rnd(0.2, 0.8), Math.sin(a) * R * 2.2), drag: 3, life: 0.45, s0: 0.2, s1: 0.04, col: i % 2 ? C.amber : 0xfff0b0, k: 1, a: 1 }); }
        this.ring(c, R, C.amber, C.amberB, 0.42, 1.3, 0.2); this.ring(c, R * 0.6, 0xa8f070, C.jadeB, 0.36, 1.0, 0.1); this._hpuffs(c, lite() ? 3 : 6, R * 0.8, { c1: 0xfff0c8, c2: 0xc8a060, a: 0.32, life: 0.55, rise: 0.4 });
        if (this.parts) { this.sigil(c, R, 'heal', { pat: 2, grow: 0.12, life: 0.8, a: 0.8, spin: 2.5 }); this.pang(c.clone().setY(gy + 0.8), 'heal', { r: 0.55, n: 10, ground: gy, stars: lite() ? 1 : 2 }); }
        for (const q of bo.pushed || []) { const p3 = P3(q); this.flash(p3.clone().setY(p3.y + 0.6), 0xffe0a0, C.amberB, 0.45, 0.12, 1); }
        // 보호막 막: 대상을 감싸는 옅은 호박빛 구(보호막 시간 동안, 처음 0.3 s 밝게)
        const be = this._fx('shieldbub', bo.shieldDur || 4, (q) => { const k = q.t / q.life, p = P3(t.pos); m.position.copy(p).setY(p.y + 0.55 + (t.radius || 0.5) * 0.2); m.scale.setScalar(((t.radius || 0.5) + 0.45) * (0.9 + 0.1 * easeBack(clamp01(q.t / 0.25)))); m.material.uniforms.uA.value = (0.32 + 0.3 * (1 - smooth(0, 0.35, q.t))) * (1 - smooth(0.8, 1, k)) * (t.dead ? 0 : 1); m.material.uniforms.uGlow.value = 0.25 + 0.4 * (1 - smooth(0, 0.3, q.t)); });
        const m = this.rx(be, 'bubble', { see: true, glowC: C.amber, glow: 0.4, a: 0.4, spec: 1.2, order: 7 });
        const rm = this._rm; if (rm) rm.pop(c.clone().setY(gy + 0.7), { col: 0xffc060, hi: 0xfff6d0, size: 1.0, ring: R, groundY: gy, sparks: 10, stars: 3 });
        this._shout(t.pos, '휘익!', '#fff0b0', '#5a3a10', 1.2);
        this._end(e, 0.3); },
      dispose: () => this._end(e, 0.2) });
  }

  // ------------------------------------------------------------------ C4 소경활혈탕: '붉은 세 마디'
  k_meridian(t, o) {
    const times = o.times || [0.12, 0.26, 0.56], top = Math.min(1.5, 0.7 + (t.radius || 0.5) * 0.8), hs = [0.32, 0.62, 0.96].map(k => k * top);
    const lit = [-1, -1, -1]; let fadeAt = -1;
    const e = this._fx('meridian', times[2] + 1.0, (e) => {
      const b = P3(t.pos), cr = this.camR, t0 = e.t, fk = fadeAt >= 0 ? 1 - smooth(fadeAt, fadeAt + 0.25, t0) : 1 - smooth(times[2] + 0.5, times[2] + 0.95, t0);
      const pts = hs.map((h, i) => b.clone().setY(b.y + h).addScaledVector(cr, (i - 1) * 0.12 * (i === 1 ? -1 : 1)));
      const draw = smooth(0, 0.1, t0);   // 붓 한 획: 아래 -> 위로 먹선이 그려짐
      // 먹선 관: 마디 사이 두 토막
      for (let i = 0; i < 2; i++) { const a = pts[i], c = pts[i + 1], d = c.clone().sub(a), L = d.length() * clamp01(draw * 2 - i); ink[i].position.copy(a); ink[i].quaternion.setFromUnitVectors(UP, d.normalize()); ink[i].scale.set(0.035, Math.max(0.001, L), 0.035); ink[i].material.uniforms.uA.value = 0.92 * fk; }
      nodes.forEach((n, i) => { n.position.copy(pts[i]); const lk = lit[i] < 0 ? 0 : 1 - smooth(lit[i] + 0.05, lit[i] + 0.4, t0), big = i === 2; n.scale.setScalar((big ? 0.085 : 0.065) * (1 + (big ? 1.2 : 0.6) * lk) * smooth(0, 0.08, t0 - i * 0.03)); n.material.uniforms.uGlow.value = lit[i] < 0 ? 0.05 : 0.3 + 1.2 * lk; n.material.uniforms.uA.value = fk;
        gl[i].quaternion.copy(this.camQ); gl[i].position.copy(pts[i]); gl[i].scale.setScalar((big ? 0.9 : 0.5) * (0.6 + 0.6 * lk)); gl[i].material.uniforms.uA.value = H.intensity * (0.25 + 1.1 * lk) * fk * smooth(0, 0.1, t0); });
      // 붉은 빛: 마디 사이를 지나감(다음 마디가 밝아지는 순간 도착)
      let seg = -1, k = 0; for (let i = 0; i < 3; i++) { const t1 = times[i], tp = i ? times[i - 1] : times[0] - 0.1; if (t0 >= tp && t0 < t1) { seg = i; k = (t0 - tp) / Math.max(0.02, t1 - tp); } }
      if (seg >= 0 && fadeAt < 0) { const a = seg ? pts[seg - 1] : pts[0].clone().setY(pts[0].y - 0.25), c = pts[seg]; run.quaternion.copy(this.camQ); run.position.copy(a).lerp(c, easeOut(k)); run.scale.setScalar(0.32); run.material.uniforms.uA.value = H.intensity * 1.2; } else run.material.uniforms.uA.value = 0;
    });
    const ink = [0, 1].map(() => this.rx(e, 'ink', { order: 8, spec: 0.1 })), nodes = [0, 1, 2].map(() => this.rx(e, 'node', { glowC: 0xff3020, order: 9, spec: 0.8 }));
    for (const m of [...ink, ...nodes]) m.material.depthTest = false;
    const gl = [0, 1, 2].map(() => this.spr(e, 0, 0xff6a4a, 0xc81010, 10)), run = this.spr(e, 0, 0xffa080, 0xff2010, 10);
    if (this.parts && o.from) { const fr = P3(o.from); this.trail((tt) => tt < 0.12 ? fr.clone().lerp(P3(t.pos).setY((t.pos.y || 0) + hs[1]), easeOut(tt / 0.12)) : null, 'fire', { n: 10, w: 0.07, life: 0.4, w0: 0xffd0c0, w1: 0xc81010 }); }
    return this._h(e, {
      node: (i, ok, last) => { lit[i] = e.t; const b = P3(t.pos), p = b.clone().setY(b.y + hs[i]);
        this.flash(p, 0xff8a6a, 0xd01010, last ? 1.0 : 0.45, last ? 0.18 : 0.1, last ? 1.4 : 1.1);
        if (this.parts) for (let k = 0; k < this._nk(last ? 14 : 5); k++) { const a = rnd(0, 6.283), sp = last ? rnd(1.6, 3) : rnd(0.8, 1.4); this.spark(p, { v: new THREE.Vector3(Math.cos(a) * sp, rnd(0.2, 1.4), Math.sin(a) * sp), drag: 3, life: last ? 0.5 : 0.3, s0: last ? 0.24 : 0.15, s1: 0.03, col: k % 2 ? 0xff5a3a : 0xffd0b0, k: k % 3 ? 0 : 1, a: 1.1 }); }
        if (last) { this.ring(b, (t.radius || 0.5) + 0.6, 0xff6a4a, 0xa01010, 0.4, 1.3, 0.2); if (this.parts) { this.pang(p, 'fire', { r: 0.55, n: 12, ground: b.y, stars: lite() ? 1 : 2 }); this.sigil(b, (t.radius || 0.5) + 0.4, 'fire', { pat: 0, grow: 0.12, life: 0.8, a: 0.85, spin: 2.5 }); } this._shout(t.pos, '활혈!', '#ffd0c0', '#6a0a10', 1.45);
          const rm = this._rm; if (rm) rm.pop(p, { col: 0xff5a3a, hi: 0xfff0e0, size: 1.1, ring: (t.radius || 0.5) + 0.6, groundY: b.y, sparks: 10, stars: 3 }); }
        else this._shout(t.pos, '탁!', '#ffe0d8', '#5a0a10', 1.0); },
      fade: () => { if (fadeAt < 0) { fadeAt = e.t; e.life = e.t + 0.3; } } });
  }

  // ------------------------------------------------------------------ C3 오령산: '중앙으로 모이는 다섯 물길'
  k_wuling(c, o) {
    const c3 = P3(c), r = o.r || 3.2, run = o.run || 0.6, seals = (o.seals || []).map(P3); let flow = 0, surgeAt = -1;
    const e = this._fx('wuling', run + 1.6, (e) => {
      const t = e.t, fk = surgeAt >= 0 ? 1 - smooth(surgeAt + 0.15, surgeAt + 0.55, t) : 1;
      chs.forEach((m, i) => { const s = seals[i], d = c3.clone().sub(s); d.y = 0; const L = d.length(); m.position.copy(s).lerp(c3, 0.5).setY(Math.max(s.y, c3.y) + 0.05); m.rotation.set(-Math.PI / 2, 0, Math.atan2(-d.z, d.x)); m.scale.set(L, 0.62, 1);
        const u = m.material.uniforms; u.uT.value = t; u.uP.value = flow; u.uA.value = 0.95 * fk; });
      stamps.forEach((m, i) => { const s = seals[i]; m.position.copy(s).setY(s.y + 0.05); this._flat(m, 0.42 * easeBack(clamp01((t - i * 0.03) / 0.12)), s.y + 0.06); m.material.uniforms.uA.value = 1.1 * fk; });
    });
    const chs = seals.map(() => { const m = this._m(e, 'ch', this.chGeo || (this.chGeo = new THREE.PlaneGeometry(1, 1)), 2), u = m.material.uniforms; u.uW.value.setHex(0xa8e4ff); u.uB.value.setHex(0x1a3a9a); return m; });
    const stamps = seals.map(() => this.spr(e, 1, 0x9ad8ff, 0x2a5ae0, 3));
    if (this.parts) { this.sigil(c3, r, 'water', { pat: 3, grow: 0.25, life: run + 0.6, a: 0.55, spin: -1.2 }); seals.forEach((s, i) => this.sigil(s, 0.48, 'water', { pat: 1, grow: 0.12, life: run + 0.4, a: 0.95, spin: 2 })); }
    for (const s of seals) this.flash(s.clone().setY(s.y + 0.3), 0xc8eeff, 0x2a5ae0, 0.5, 0.14, 1.1);
    return this._h(e, {
      flow: (k) => { flow = k; if (this.parts && k < 1) { e.dp = (e.dp || 0) - (e.dt || 0.016); if (e.dp <= 0) { e.dp = lite() ? 0.07 : 0.035; const i = (e.di = ((e.di || 0) + 1) % seals.length), s = seals[i], p = s.clone().lerp(c3, k); p.y += 0.15; const d = c3.clone().sub(s).normalize().multiplyScalar(r * 1.6);
          this.bit('drop', p, { v: new THREE.Vector3(d.x, 1.2, d.z), g: -7, life: 0.35, s0: 0.1, s1: 0.04, col: 0xd8f4ff, glow: 0.4, floor: s.y }); } } },
      surge: (hits) => { surgeAt = e.t; flow = 1;
        // 마지막 물결: 바깥 -> 가운데로 조여드는 고리(현무약해의 '밀어내는' 물결과 반대 방향) + 가운데에서 솟는 물기둥
        const ce = this._fx('converge', 0.45, (q) => { const k = q.t / 0.45; this._flat(rg, r * (1 - 0.85 * easeOut(k)), c3.y + 0.07); rg.material.uniforms.uA.value = H.intensity * 1.4 * (1 - smooth(0.7, 1, k)); this._flat(rg2, r * 0.8 * (1 - 0.9 * easeOut(clamp01((q.t - 0.06) / 0.39))), c3.y + 0.07); rg2.material.uniforms.uA.value = H.intensity * 1.0 * (1 - smooth(0.6, 1, k)); });
        const rg = this.spr(ce, 1, 0xd8f4ff, 0x2a5ae0, 4), rg2 = this.spr(ce, 1, 0x9ad8ff, 0x1a3a9a, 4); rg.position.copy(c3); rg2.position.copy(c3);
        this._later(0.3, () => { if (this.parts) { this.beam(c3, 0.7, 2.4, 'water', { life: 0.55 }); this.pang(c3.clone().setY(c3.y + 0.7), 'water', { r: 0.8, n: 16, ground: c3.y, stars: lite() ? 1 : 3 }); for (let i = 0; i < this._nk(12); i++) { const a = rnd(0, 6.283); this.bit('drop', c3.clone().setY(c3.y + 0.4), { v: new THREE.Vector3(Math.cos(a) * 1.5, rnd(3, 4.5), Math.sin(a) * 1.5), g: -9, life: 0.6, s0: 0.13, s1: 0.05, col: 0xffffff, glow: 0.4, floor: c3.y }); } }
          for (const q of hits || []) { const p3 = P3(q); this.flash(p3.clone().setY(p3.y + 0.5), 0xc8eeff, 0x2a5ae0, 0.5, 0.12, 1.1); }
          const rm = this._rm; if (rm) rm.pop(c3.clone().setY(c3.y + 0.6), { col: 0x6ab8ff, hi: 0xf0faff, size: 1.3, ring: r * 0.6, groundY: c3.y, sparks: 12, stars: 3 });
          if ((hits || []).length) this._shout({ x: c3.x, y: c3.y, z: -c3.z }, '촤르륵!', '#d8f2ff', '#183a7a', 1.4); }, e);
        e.life = e.t + 0.7; },
      end: () => this._end(e, 0.3) });
  }

  k_allyMark(s, o) {
    const e = this._fx('allymark', 9999, (e) => { if (s.dead) { e.t = e.life; return; } const p = P3(s.pos); this._flat(rg, (s.radius || 0.4) + 0.35 + 0.05 * Math.sin(e.t * 5), p.y + 0.06); rg.position.x = p.x; rg.position.z = p.z; rg.material.uniforms.uA.value = 1.1 * this._fadeK(e);
      ar.quaternion.copy(this.camQ); ar.position.copy(p).setY(p.y + 1.4 + (s.radius || 0.4) + 0.06 * Math.sin(e.t * 4)); ar.scale.setScalar(0.32); ar.material.uniforms.uA.value = 0.9 * this._fadeK(e); });
    const rg = this.spr(e, 1, C.gold, C.amberB, 3), ar = this.spr(e, 3, C.gold, C.amberB, 6);
    return this._h(e, { end: () => this._end(e, 0.2) });
  }

  // ================================================================== A1 제작 완성 (skillui.js showCraft)
  k_brew(pc, o) {
    const n = Math.max(1, o.n || 1), base = () => P3(pc.pos), fw = D3(pc.facing || { x: 0, z: 1 });
    const e = this._fx('brew', 2.4, (e) => {
      const b = base(), c = b.clone().addScaledVector(fw, 0.9).setY(b.y + 0.9), t = e.t;
      pot.position.copy(c).setY(c.y - 0.15); pot.scale.setScalar(0.6 * easeBack(clamp01(t / 0.2)) * (1 - smooth(1.9, 2.3, t))); pot.material.uniforms.uGlow.value = 0.5 * smooth(0.8, 1.1, t) * (1 - smooth(1.6, 2.0, t)); pot.material.uniforms.uGlowC.value.setHex(C.amber);
      herbs.forEach((h, i) => { const a = i / herbs.length * 6.283 + t * 4, k = clamp01((t - 0.2 - i * 0.07) / 0.6), rr = 0.45 * (1 - k); h.position.set(c.x + Math.cos(a) * rr, c.y + 0.25 + 0.2 * (1 - k) - 0.2 * k, c.z + Math.sin(a) * rr); h.scale.setScalar(0.5 * (1 - smooth(0.85, 1, k))); });
      gl.quaternion.copy(this.camQ); gl.position.copy(c).setY(c.y + 0.12); gl.scale.setScalar(0.7); gl.material.uniforms.uA.value = H.intensity * 0.8 * smooth(0.8, 1.0, t) * (1 - smooth(1.5, 1.9, t));
      out.position.copy(c).setY(c.y + 0.3 + 0.6 * easeOut(clamp01((t - 1.3) / 0.5))); out.scale.setScalar(0.22 * smooth(1.3, 1.5, t) * (1 - smooth(2.1, 2.4, t))); out.rotation.y = t * 2; out.material.uniforms.uGlow.value = 0.35;
      if (t > 1.0 && !e.steamed) { e.steamed = true; for (let i = 0; i < Math.min(5, 2 + n); i++) this._hpuffs(c.clone().setY(c.y + 0.2 + i * 0.05), 1, 0.15, { c1: 0xfff0c0, c2: C.gold, a: 0.35, life: 1.0, rise: 0.8 }); }
    });
    const pot = this.hs(e, 'hb_pot', {}), herbs = []; for (let i = 0; i < Math.min(9, 3 + n * 2); i++) { const h = this.hs(e, i % 2 ? 'hb_herb' : 'hb_leaf', {}); if (h) herbs.push(h); }
    const gl = this.spr(e, 0, C.amber, C.amberB, 6), out = this.hs(e, 'hb_gourd', { glowC: C.gold, tint: 0xffd890 });
    if (this.parts) {   // fx2: 탕관 아래 작은 팔괘 진 + 완성 순간 '팡'·빛기둥 + 금빛 반짝이
      const c0 = () => { const b = base(); return b.clone().addScaledVector(fw, 0.9); };
      this.sigil(c0(), 0.55, 'heal', { pat: 1, grow: 0.4, life: 2.2, a: 0.85, spin: 1.5, follow: c0 }); this._snd('hb_simmer');
      this._later(1.3, () => { const c = c0(); this.pang(c.clone().setY(c.y + 1.2), 'heal', { r: 0.45, n: 12, ground: c.y, stars: lite() ? 1 : 2 }); this.beam(c, 0.4, 2.2, 'heal', { life: 0.6 }); this._snd('hb_drop'); }, e);
    }
    return this._h(e, {});
  }
}
