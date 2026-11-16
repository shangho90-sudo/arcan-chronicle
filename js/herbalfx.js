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
//   brew(pc,{n})              구증구포·보원탕 제작 완성: 탕관 둘레를 도는 약초 -> 빠짐 -> 호박빛 -> 금빛 김 -> 완성 탕약이 떠오름
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CookFx } from './cookfx.js';

export const HERBFX = {
  intensity: 1.0,
  col: { amber: 0xffb850, amberB: 0xd86a10, gold: 0xffe08a, goldB: 0xffa020, jade: 0x7af0c0, jadeB: 0x1a9a80, teal: 0x5af0e0, tealB: 0x0a8a90,
    purple: 0xd090ff, purpleB: 0x7a28c0, vermil: 0xffb060, vermilB: 0xff3010, ochre: 0xffd070, ochreB: 0xb07018, plat: 0xf4f8ff, platB: 0xa8b8d0,
    sapph: 0x9ad8ff, sapphB: 0x2a5ae0, white: 0xffffff, ash: 0xb8b0a8, ashB: 0x5a5048 },
  ginseng: { size: 1.15, hop: 0.34 },
  deer: { size: 1.25 },
  root: { size: 1.0, n: 5 },
  scroll: { h: 3.6, w: 3.0, paper: 1.1 },
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
    return this._h(e, { refresh: (d) => { dur = d; e.life = e.t + d + 0.5; e.ending = null; flashL = flashR = 0.6; },
      flash: (dir) => { const f = pc.facing, side = dir.x * f.z - dir.z * f.x; if (side >= 0) flashR = 1; if (side <= 0) flashL = 1; },
      end: () => this._end(e, 0.4) });
  }

  // ================================================================== A4 백초 훈증진
  k_steam(c, o) {
    const r = o.r || 3, grow = o.grow || 0.5, c3 = P3(c), N = lite() ? 8 : 14; let steamT = 0;
    const e = this._fx('steam', (o.dur || 8) + 0.5, (e, dt) => {
      const fk = this._fadeK(e), g = clamp01(e.t / grow), ext = Math.max(0, e.ext || 0); e.ext = ext - dt * 2;
      const u = disc.material.uniforms; u.uP.value = easeOut(g); u.uT.value = e.t; u.uA.value = 0.85 * fk * smooth(0, 0.15, e.t) * (1 + 0.6 * ext);
      pot.position.copy(c3); pot.scale.setScalar(1.25 * easeBack(g)); pot.material.uniforms.uA.value = fk; pot.material.uniforms.uGlow.value = 0.1 + 0.25 * ext;
      lid.position.copy(c3).setY(c3.y + 0.5 * 1.25 * easeBack(g) + 0.02 * Math.abs(Math.sin(e.t * 7))); lid.scale.setScalar(1.25 * easeBack(g)); lid.rotation.z = 0.06 * Math.sin(e.t * 7); lid.material.uniforms.uA.value = fk;
      herbs.forEach((h, i) => { const k = clamp01((e.t - i * 0.025) / grow); h.position.y = h.userData.y; h.scale.setScalar(h.userData.s * easeBack(k) * (fk > 0.01 ? 1 : 0)); h.rotation.z = 0.08 * Math.sin(e.t * 2 + i); h.material.uniforms.uA.value = fk; });
      steamT -= dt; if (steamT <= 0 && e.t > grow && fk > 0.5) { steamT = lite() ? 0.7 : 0.4; this._puffs(c3.clone().setY(c3.y + 0.65), 1, 0.15, { c1: 0xfff4dc, c2: C.gold, a: 0.28, life: 1.2, rise: 0.9 }); }
    });
    const disc = this.gd(e, 0, C.amber, C.jadeB, 1); disc.position.copy(c3).setY(c3.y + 0.04); disc.scale.setScalar(r);
    const pot = this.hs(e, 'hb_pot', { see: false }), lid = this.hs(e, 'hb_lid', {});
    const herbs = []; for (let i = 0; i < N; i++) { const a = i / N * 6.283 + rnd(-0.15, 0.15), rr = r * rnd(0.86, 0.98), h = this.hs(e, i % 3 === 2 ? 'hb_stem' : 'hb_herb', { tint: i % 2 ? 0xffffff : 0xd8ffb0 }); if (!h) continue;
      h.position.set(c3.x + Math.cos(a) * rr, groundY(c3.x + Math.cos(a) * rr, -(c3.z + Math.sin(a) * rr)), c3.z + Math.sin(a) * rr); h.userData.y = h.position.y; h.userData.s = rnd(1.5, 2.1); h.rotation.y = rnd(0, 6); herbs.push(h); }
    this.ring(c3, r, C.gold, C.amberB, 0.5, 1.1, 0.1);
    return this._h(e, {
      pulse: (healed, cleansed) => {   // 회복 틱: 호박빛 방울이 회복된 몸으로 떨어짐, 정화 성공: 흰 꽃잎 물결
        for (const p of healed) { const at = P3(p); this.motes(at.clone().setY(at.y + 1.6), lite() ? 3 : 5, { w: C.amber, b: C.amberB, to: at.clone().setY(at.y + 0.8), life: 0.55, r: 0.35, a: 1.0 }); }
        if (healed.length) this.ring(c3, r * 0.85, C.amber, C.amberB, 0.45, 0.6, 0.3);
        for (const p of cleansed) { const at = P3(p); this.leaves(at.clone().setY(at.y + 0.5), lite() ? 5 : 9, { geo: 'hb_petal', tint: 0xffffff, glow: 0.4, glowC: C.white, up: 0.6, g: -0.6, speed: 1.2, r: 0.3, life: 0.8, size: 1.2 }); this.ring(at, 1.0, C.white, C.jade, 0.4, 1.0, 0.2); }
      },
      extend: (k = 2) => { e.ext = 1; e.life += k; this.ring(c3, r, C.sapph, C.sapphB, 0.5, 1.2, 0.85); },
      end: () => this._end(e, 0.5) });
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
    return this._h(e, { absorb: () => { absorbed = e.t; const at = P3(pc.pos); this.motes(at.clone().setY(at.y + 0.3), lite() ? 10 : 20, { w: C.gold, b: C.amberB, to: at.clone().setY(at.y + 1.0), r: 2.2, life: 0.8, a: 1.1 }); } });
  }

  // ================================================================== 소환물 공통
  _summon(kind, s, o, build, tick) {
    const e = this._fx(kind, 1e9, (e, dt) => { if (e.wilting != null) { const k = (e.t - e.wilting) / 0.5; e.g.scale.setScalar(Math.max(0.001, 1 - easeOut(k))); if (k >= 1) this._free(e); return; } tick(e, dt); });
    e.s = s; e.grow = o.grow || 0.5; e.buffOn = 0; e.buffK = 0; e.hurtK = 0; e.pulseK = 0;
    build(e);
    return this._h(e, {
      sync: (s2) => { e.s = s2; },
      buff: (on) => { e.buffOn = on ? 1 : 0; if (on) this.motes(P3(s.pos).setY((s.pos.y || 0) + 0.5), 6, { w: C.gold, b: C.goldB, r: 0.5, life: 0.6 }); },
      hurt: () => { e.hurtK = 1; },
      refresh: () => { e.pulseK = 1; this.ring(P3(s.pos), 1.2, C.jade, C.jadeB, 0.45, 1.2, 0.2); this.leaves(P3(s.pos).setY((s.pos.y || 0) + 0.4), lite() ? 4 : 8, { up: 0.8, speed: 0.8, life: 0.7 }); },
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
      e.body = this.hs(e, 'hb_gs_body', { glowC: C.gold, spec: 0.5 }); e.crown = this.hs(e, 'hb_gs_leaf', { glowC: C.gold });
      e.limbs = [0, 1, 2, 3].map(() => this.hs(e, 'hb_gs_limb', { glowC: C.gold }));
      e.whipS = null; e.cheerS = -9; e.land = 0; e.lastHop = 0;
    }, (e, dt) => {
      const s = e.s, g = this._sstate(e, dt), base = P3(s.pos); this._sproutTick(e, e.S, base, g);
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
    h.whip = (t, ok) => { h.whipS = { t: h.t }; if (ok) { const p = P3(t.pos); this.flash(p.clone().setY(p.y + 0.6), C.jade, C.jadeB, 0.5, 0.14, 1.1); this.leaves(p.clone().setY(p.y + 0.4), lite() ? 2 : 4, { speed: 1.2, life: 0.5, size: 0.8 }); } };
    h.cheer = () => { h.cheerS = h.t; };
    return h;
  }
  k_drop(s, o) {   // 금빛 약방울: 동자 머리 위 -> 주인 가슴, 도착 시각 = 실제 회복 시각(o.t)
    const T = o.t || 0.45, to = o.to;
    const from = P3(s.pos).setY((s.pos.y || 0) + 1.0);
    const e = this._fx('drop', T + 0.4, (e) => {
      const k = clamp01(e.t / T), end = P3(to.pos).setY((to.pos.y || 0) + 1.0);
      d.position.copy(from).lerp(end, easeOut(k)); d.position.y += Math.sin(k * Math.PI) * 0.7; d.scale.setScalar(0.07 * (k < 1 ? 1 : 0)); d.material.uniforms.uGlow.value = 0.8;
      gl.quaternion.copy(this.camQ); gl.position.copy(d.position); gl.scale.setScalar(k < 1 ? 0.35 : 0.9 * (1 - smooth(T, T + 0.35, e.t))); gl.material.uniforms.uA.value = H.intensity * (k < 1 ? 0.9 : 1.2 * (1 - smooth(T, T + 0.35, e.t)));
      if (k >= 1 && !e.arrived) { e.arrived = true; this.motes(end.clone().setY(end.y - 0.6), lite() ? 3 : 6, { w: C.gold, b: C.amberB, r: 0.35, up: 0.8, life: 0.6 }); }
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
    }, (e, dt) => {
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
    h.ram = (t, ok) => { h.ramS = h.t; if (ok) { const p = P3(t.pos); this.flash(p.clone().setY(p.y + 0.6), C.ochre, C.jadeB, 0.55, 0.15, 1.1); this._puffs(p, 3, 0.6, { a: 0.3 }); } };
    h.stomp = (o2) => {   // 앞발을 들었다 구르면(0.3 s) 뿌리가 정면 부채꼴(= 실제 판정 r·ang)로 차례로 솟음
      h.stompS = h.t; h.stamped = false;
      h.doStomp = () => {
        const s2 = h.s, base = P3(s2.pos), f = o2.f, a0 = Math.atan2(-f.z, f.x), half = (o2.ang || 100) * Math.PI / 360, R = o2.r || 3.2;
        this.ring(base, 1.0, C.ochre, C.jadeB, 0.3, 1.0, 0.3);
        const rays = lite() ? 3 : 5, per = 3;
        for (let i = 0; i < rays; i++) for (let j = 0; j < per; j++) { const a = a0 + (rays > 1 ? (i / (rays - 1) - 0.5) * 2 * half * 0.9 : 0), d = R * (0.35 + 0.6 * j / (per - 1));
          this._rootPop(new THREE.Vector3(base.x + Math.cos(a) * d, 0, base.z + Math.sin(a) * d), 0.05 + j * 0.06, 0.8 + j * 0.15); }
        for (const p of o2.hits || []) { const q = P3(p); this.flash(q.clone().setY(q.y + 0.4), C.ochre, C.jadeB, 0.5, 0.14, 1.0); }
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
      if (!e.dusted && t > 0) { e.dusted = true; this._puffs(at, lite() ? 1 : 2, 0.35, { a: 0.28, life: 0.5 }); }
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
    return this._h(e, {
      spore: (hits) => {   // 피해 틱 = 포자 고리: 꽃마다 작은 보라 연기 + 범위 끝까지 퍼지는 고리 하나, 맞은 적에게 보라 점
        for (const F of fl) { F.pulse = 1; if (!lite() || fl.indexOf(F) % 2 === 0) this._puffs(F.p.clone().setY(F.p.y + 0.5), 1, 0.3, { c1: C.purple, c2: C.purpleB, a: 0.3, life: 0.7, rise: 0.4 }); }
        this.ring(c3, r, C.purple, C.purpleB, 0.55, 0.9, 0.15);
        for (const p of hits) { const q = P3(p); this.motes(q.clone().setY(q.y + 0.5), lite() ? 2 : 4, { w: C.purple, b: C.purpleB, r: 0.3, life: 0.5, up: 0.6 }); }
      },
      extend: (k = 2) => { e.life += k; this.ring(c3, r, C.sapph, C.sapphB, 0.5, 1.1, 0.85); },
      end: () => this._end(e, 0.6) });
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
    return this._h(e, {
      erupt: (hits) => {   // 시전 순간: 안의 적 발밑마다 뿌리가 솟고, 둘레에도 몇 개
        for (const p of hits) { const q = P3(p); for (let k = 0; k < 3; k++) this._rootPop(new THREE.Vector3(q.x + Math.cos(k * 2.1) * 0.35, 0, q.z + Math.sin(k * 2.1) * 0.35), k * 0.04, 1.0, { glow: 0.35 }); this.flash(q.clone().setY(q.y + 0.5), C.gold, C.jadeB, 0.6, 0.16, 1.1); }
        for (let k = 0; k < (lite() ? 6 : 12); k++) { const a = k / (lite() ? 6 : 12) * 6.283; this._rootPop(new THREE.Vector3(c3.x + Math.cos(a) * r * 0.6, 0, c3.z + Math.sin(a) * r * 0.6), 0.05 + (k % 3) * 0.03, 0.9); }
        this.ring(c3, r, C.gold, C.jadeB, 0.6, 1.1, 0.1);
      },
      end: () => this._end(e, 0.7) });
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
    return this._h(e, {
      root: (i, last, hits) => {   // 뿌리 i가 땅을 뚫고 솟음(아래에서 위로), 마지막 = 청룡 머리가 솟아 앞으로 꿰뚫음
        const p = o0.clone().addScaledVector(f, 0.9 + i * step);
        const lat = _a.crossVectors(f, UP).normalize();
        for (let k = 0; k < (lite() ? 1 : 2); k++) this._rootPop(p.clone().addScaledVector(lat, (k ? -1 : 1) * 0.25), k * 0.03, 1.45 + 0.25 * i / n, { tint: 0x70e8c8, glowC: C.teal, glow: 0.7 });
        this.ring(p.clone().setY(groundY(p.x, -p.z)), 0.6, C.teal, C.tealB, 0.3, 0.8, 0.3);
        if (last && head.m) { head.s = e.t; head.p = p.clone().setY(groundY(p.x, -p.z)); }
        for (const q of hits || []) { const h3 = P3(q); this.flash(h3.clone().setY(h3.y + 0.6), C.teal, C.tealB, last ? 0.9 : 0.6, 0.16, 1.2); this.leaves(h3.clone().setY(h3.y + 0.4), lite() ? 2 : 4, { tint: 0xa0ffe0, speed: 1.1, life: 0.5 }); }
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
    return this._h(e, {
      set: (p) => { pos = P3(p); },
      impact: (c, io) => {   // 착탄: 가운데 작은 섬광 + 좌우로 퍼지는 날개 모양 불꽃(= 실제 날개 판정 폭) + 쑥 재·불티
        e.hit = true; this._free(e);
        const c3 = P3(c), d = D3(io.dir), lat = _a.crossVectors(d, UP).normalize().clone(), W = io.wing || 5;
        this.flash(c3.clone().setY(c3.y + 0.6), C.vermil, C.vermilB, 1.0, 0.16, 1.3);
        this.ring(c3, io.core || 1.3, C.vermil, C.vermilB, 0.35, 1.2, 0.2);
        const fe = this._fx('wingfire', 0.75, (q) => { const k = q.t / 0.75;
          fw.forEach((w, i) => { const sd = i ? -1 : 1; w.position.copy(c3).setY(c3.y + 0.12); w.rotation.set(0, Math.atan2(d.x, d.z), 0);
            const sz = (W / 2) * easeOut(clamp01(k / 0.3)); w.scale.set(sz * sd, 1.2, sz * 0.7); w.material.uniforms.uA.value = 0.85 * (1 - smooth(0.35, 1, k)); w.material.uniforms.uGlow.value = 1.0 * (1 - k); });
        });
        const fw = [0, 1].map(() => this.hs(fe, 'hb_wing', { see: true, glowC: C.vermil, tint: 0xffd080 }));
        const n = lite() ? 4 : 7;
        for (const sd of [1, -1]) for (let k = 1; k <= n; k++) { const at = c3.clone().addScaledVector(lat, sd * W / 2 * k / n).addScaledVector(d, -0.25 * (k / n) * (k / n)); at.y = groundY(at.x, -at.z);
          this._puffs(at, 1, 0.25, { c1: C.vermil, c2: C.vermilB, a: 0.4, life: 0.45, rise: 0.5 }); }
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
    return this._h(e, {
      ring: () => { ringAt = e.t; this.ring(c3, r, C.ochre, C.ochreB, 0.4, 1.2, 0.15); },
      pillar: (p, ok) => {   // 실제 피해 자리: 낮은 육각 돌기둥 + 뿌리 둘이 솟음(가리지 않게 낮게), 금빛 먼지
        const q = P3(p); q.y = groundY(q.x, -q.z);
        const pe = this._fx('pillar', 0.9, (x) => { const t = x.t, up = easeBack(clamp01(t / 0.14)), down = smooth(0.5, 0.9, t); pl.position.copy(q).setY(q.y - 0.05); pl.scale.set(0.42, 0.55 * up * (1 - down) + 0.001, 0.42); pl.material.uniforms.uGlow.value = 0.5 * (1 - smooth(0, 0.3, t)); });
        const pl = this.hs(pe, 'hb_pillar', { glowC: C.ochre }); pl.rotation.y = rnd(0, 1);
        this._rootPop(q.clone().add(new THREE.Vector3(0.3, 0, 0.1)), 0.03, 0.7); this._rootPop(q.clone().add(new THREE.Vector3(-0.25, 0, -0.2)), 0.06, 0.6);
        if (ok) this.flash(q.clone().setY(q.y + 0.5), C.ochre, C.ochreB, 0.6, 0.15, 1.1);
        this._puffs(q, lite() ? 2 : 3, 0.5, { c1: 0xf0d090, c2: 0x8a6a30, a: 0.35, life: 0.5 });
      },
      end: () => this._end(e, 0.5) });
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
      return Object.assign(n, { land: (t, ok) => { n.landed = true; n.endT = ne.t; if (ok) { const p3 = P3(t.pos); self.flash(p3.clone().setY(p3.y + 0.6), C.plat, C.platB, 0.32, 0.1, 1.0); } }, fade: () => { n.faded = true; n.endT = ne.t; } });
    };
    const body = (t) => () => { const p = P3(t.pos); p.y += Math.min(1.2, 0.5 + (t.radius || 0.5) * 0.6); return p; };
    return this._h(e, {
      needle: (t, no) => flyer(body(t), no.at, no.curve),
      miss: (mo) => { const f = D3(mo.f), half = (mo.ang || 50) * Math.PI / 360; for (let i = 0; i < 9; i++) { const a = (i / 8 - 0.5) * 2 * half, d = f.clone().applyAxisAngle(UP, a); const to = P3(from).addScaledVector(d, mo.r || 6); to.y = fan.y - 0.4; flyer(to, (mo.r || 6) / 16, (i - 4) * 0.08, { fly: true }); } },
      mark: (t) => { const p = P3(t.pos); this.ring(p, (t.radius || 0.5) + 0.25, C.plat, C.platB, 0.5, 1.2, 0.5); },
      claw: (t, f) => {   // 호랑이 발톱: 금빛 선 셋이 대상에서 엇갈려 그어짐
        const p = P3(t.pos).setY((t.pos.y || 0) + 0.7), d = D3(f), lat = _a.crossVectors(d, UP).normalize().clone();
        const ce = this._fx('claw', 0.4, (q) => { const k = q.t / 0.4; ls.forEach((l, i) => { const dir = lat.clone().multiplyScalar(i === 3 ? -1 : 1).add(new THREE.Vector3(0, i === 3 ? 0.9 : -0.9, 0)).normalize(); this._alignLine(l, dir); l.position.copy(p).addScaledVector(lat, (i - 1) * 0.18 * (i === 3 ? 0 : 1)); l.scale.set(1.1 * easeOut(clamp01(k / 0.2)), 0.12, 1); l.material.uniforms.uA.value = H.intensity * 1.6 * (1 - smooth(0.3, 1, k)); }); });
        const ls = [0, 1, 2, 3].map(() => this.spr(ce, 2, C.gold, C.goldB, 8));
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
    return this._h(e, {
      front: (s) => { front = s; },
      splash: (p) => { const q = P3(p); this.motes(q.clone().setY(q.y + 0.3), lite() ? 3 : 6, { w: C.sapph, b: C.sapphB, r: 0.3, up: 1.2, spread: 0.8, life: 0.5 }); this.ring(q, 0.8, C.sapph, C.sapphB, 0.3, 0.9, 0.3); },
      feed: (c) => { this.ring(P3(c), 1.5, C.sapph, C.sapphB, 0.5, 1.0, 0.2); },
      end: () => { if (endAt < 0) { endAt = e.t; e.life = e.t + 0.4; } },
      dispose: () => this._free(e) });
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
      if (t > 1.0 && !e.steamed) { e.steamed = true; for (let i = 0; i < Math.min(5, 2 + n); i++) this._puffs(c.clone().setY(c.y + 0.2 + i * 0.05), 1, 0.15, { c1: 0xfff0c0, c2: C.gold, a: 0.35, life: 1.0, rise: 0.8 }); }
    });
    const pot = this.hs(e, 'hb_pot', {}), herbs = []; for (let i = 0; i < Math.min(9, 3 + n * 2); i++) { const h = this.hs(e, i % 2 ? 'hb_herb' : 'hb_leaf', {}); if (h) herbs.push(h); }
    const gl = this.spr(e, 0, C.amber, C.amberB, 6), out = this.hs(e, 'hb_gourd', { glowC: C.gold, tint: 0xffd890 });
    return this._h(e, {});
  }
}
