// 대장장이 1차 스킬 이펙트 (2026-11-13). 규칙은 js/smith.js, 메시는 tools/blender/fx_smith.py -> assets/fx/fx_smith.glb.json
// (smith_anvil / _anvil_cracks / _jaw / _bar / _plate / _rivet / _drop / _scrap / _shard, 정점 색만).
// 시각 정체성: 주황빛 열기 · 검은 철 · 황금색 불티 · 하얀 수증기. 빛은 텍스처 없이 작은 셰이더(CookFx의 것 + 부채꼴·낙인·중첩 점).
// 가장 밝은 순간 = 실제 피해 순간, 링·부채꼴은 실제 판정 크기를 넘지 않음, 긴 연기 없음. 전역 블룸·노출·정지는 건드리지 않음.
// 종류 (js/skillrt.js FX.smith(kind, a, o) / js/smith.js this.fx):
//   heat(t)                       머리 위 주황 점 1~3개(가열 중첩). handle {setStacks(n), dispose()}
//   brand(t, {dur})               붉은 단조 낙인이 대상 몸에 붙음. handle {setCracks(n) 균열이 커짐, shatter() 금속 외피 파편, dispose()}
//   anvil(pos, {fall, r})         낙하 그림자 -> 모루 착지 -> 불티 + 얇은 지면 충격파; 남아 있는 동안 균열이 은은히 빛남.
//                                 handle {land(hit), pulse(r, last) 충격파, bump() 모루 충돌, expire(), dispose()}
//   tongs(pc, {tgt, reach, pull, heavy})   집게가 벌어진 채 뻗어 나가 grab(t|null)에 닫힘 -> 끌려오는 대상을 따라 줄어듦
//   hit(pc, {kind: tap|finish|brand|forge, f, hits, r, ang})   망치 접촉 불티 / 마무리 지면 고리 / 낙인 도장 / 용광로 쇳물 부채꼴
//   quench(pc, {f, r, ang, hits:[{x,y,z,n,r}]})   냉각수 부채꼴 + 가열을 식힌 대상마다 압축된 흰 수증기(3중첩 = 선명한 고리)
//   wall(pc, {dur})               접이식 철판이 펼쳐짐. handle {block(), kick(f) -> {set(p), hit(c), end()}, fold(), dispose()}
//   rivets(pc, {n, dur})          몸 둘레의 리벳. handle {pop(left) 방어 소모(흰 섬광), shoot(f) 공격 소모(주황 줄기), dispose() 시간 만료(조용히)}
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
  rivet: { size: 0.11, r: 0.55, y: 1.0, spin: 2.2 },   // 2026-11-13 화면 확인: 0.075는 너무 작아 보임
  forge: { drops: 9, dropsLite: 4, life: 0.5, puddle: 1.1 },
  quench: { life: 0.42, drops: 8, dropsLite: 4 },
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

  // ------------------------------------------------------------------ 단조 낙인
  brand(t, o = {}) {
    if (!this._ok() || !t) return null; const C = SMITHFX.col, I = SMITHFX.intensity; let n = 0, pop = 0.25;
    const e = this._fx('brand', (o.dur || 10) + 0.5, (e, dt) => {
      if (t.dead || t.removed) { e.t = e.life; return; }
      pop = Math.max(0, pop - dt);
      const p = P3(t.pos), top = cookTop(t); m.position.set(p.x, p.y + top * 0.62, p.z).addScaledVector(this.toCam, (t.radius || 0.5) * 0.9 + 0.1); m.quaternion.copy(this.camQ);
      m.scale.setScalar((0.5 + (t.radius || 0.5) * 0.35) * (1 + 0.6 * pop / 0.25)); m.material.uniforms.uP.value = n;
      m.material.uniforms.uA.value = I * (1.0 + 0.25 * n) * smooth(0, 0.08, e.t) * (1 - smooth(e.life - 0.5, e.life, e.t));
    });
    const m = this.sx(e, 1, C.white, C.brand, 8);
    const at = () => { const p = P3(t.pos); p.y += cookTop(t) * 0.62; return p; };
    return this._h(e, {
      setCracks: (v) => { n = v; pop = 0.25; this.sparks(at(), lite() ? 1 : 2, { tint: 0xffb060, life: 0.3 }); },
      shatter: () => { const p = at(), low = lite(); this.flash(p, { size: 1.0, ring: (t.radius || 0.5) + 0.45, gy: P3(t.pos).y, b: C.brand, rb: C.brand });
        this._bits(p, low ? 3 : 7, { size: [0.1, 0.19], speed: [1.8, 3.4], up: [1.6, 3.2], ground: P3(t.pos).y, life: 0.55 }); this.sparks(p, low ? 2 : 5, {}); this._free(e); },
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

  // ------------------------------------------------------------------ 급랭 담금질
  quench(pc, o = {}) {
    if (!this._ok()) return null;
    const K = SMITHFX.quench, C = SMITHFX.col, I = SMITHFX.intensity, f = o.f, r = o.r || 3.2, ang = o.ang || 80, low = lite();
    const e = this._fx('quench', K.life, (e) => { const k = e.t / e.life, u = sec.material.uniforms; u.uP.value = 0.12 + 0.88 * easeOut(k * 1.6); u.uT.value = e.t; u.uA.value = I * 1.25 * (1 - smooth(0.4, 1, k)); });
    const sec = this._sector(e, pc, f, r, ang, C.water, C.waterB);
    for (const h of o.hits || []) {
      if (h.miss) continue;
      const g = P3(h), p = g.clone(); p.y += Math.min(1.0, 0.35 + (h.r || 0.5) * 0.7);
      if (!h.n) { this.flash(p, { size: 0.5, life: 0.1, w: C.water, b: C.waterB }); continue; }
      // heat put out: a compressed white steam pop (short, tight) — at 3 stacks a crisp white ring of the splash size on the ground
      this.flash(p, { size: 0.6 + 0.25 * h.n, life: 0.14, w: C.steam, b: C.steamB, ring: h.n >= 3 ? 1.6 : 0.5 + 0.25 * h.n, gy: g.y, rw: C.steam, rb: h.n >= 3 ? C.steam : C.steamB, a: 1.0 + 0.25 * h.n });
      this._puffs(p, (low ? 1 : 2) + h.n, 0.5 + 0.2 * h.n, { c1: C.steam, c2: C.steamB, a: 0.5 + 0.1 * h.n, life: 0.34 + 0.05 * h.n, rise: 0.5 });
    }
    return e;
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

  // ------------------------------------------------------------------ 즉석 리벳
  rivets(pc, o = {}) {
    if (!this._ok() || !this.geo.smith_rivet) return null;
    const K = SMITHFX.rivet, C = SMITHFX.col, I = SMITHFX.intensity, n = o.n || 3, rs = []; let left = n;
    const e = this._fx('rivets', (o.dur || 10) + 1, (e, dt) => {
      const c = P3(pc.pos); c.y += K.y;
      for (const r of rs) {
        if (r.fly) { r.fly.t += dt; r.m.position.addScaledVector(r.fly.v, dt); r.m.material.uniforms.uA.value = 1 - smooth(0.12, r.fly.life, r.fly.t); r.g.visible = false; if (r.fly.t >= r.fly.life) { r.m.visible = false; } continue; }
        const ang = e.t * K.spin + r.i * Math.PI * 2 / n, s = K.size * (1 + 1.2 * Math.max(0, 1 - e.t / 0.18));
        r.m.position.set(c.x + Math.cos(ang) * K.r, c.y + Math.sin(e.t * 3 + r.i) * 0.05, c.z + Math.sin(ang) * K.r); r.m.scale.setScalar(s);
        _a.set(Math.cos(ang), 0, Math.sin(ang)); r.m.quaternion.setFromUnitVectors(UP, _a);
        r.m.material.uniforms.uA.value = smooth(0, 0.08, e.t) * (1 - smooth(e.life - 0.6, e.life - 0.3, e.t)); r.m.material.uniforms.uGlow.value = 0.25 + 0.15 * Math.sin(e.t * 6 + r.i);
        r.g.position.copy(r.m.position); r.g.quaternion.copy(this.camQ); r.g.scale.setScalar(0.3); r.g.material.uniforms.uA.value = I * 0.55 * r.m.material.uniforms.uA.value;
      }
    });
    for (let i = 0; i < n; i++) { const m = this.solid(e, this.geo.smith_rivet, { rim: C.gold, spec: 1.2, tint: 0xffe2b0 }), g = this.spr(e, 0, C.gold, C.hot, 3); m.renderOrder = 6; rs.push({ i, m, g, fly: null }); }
    { const c = P3(pc.pos); c.y += K.y; this.sparks(c, lite() ? 2 : 5, { ground: P3(pc.pos).y, life: 0.3 }); }
    const live = () => rs.filter(r => !r.fly);
    return this._h(e, {
      pop: (nLeft) => { const r = live()[0]; if (!r) return; left = nLeft; const p = r.m.position.clone(); _a.copy(p).sub(P3(pc.pos)).setY(0).normalize();   // 방어 소모: 흰 섬광, 리벳이 바깥으로 튕겨 떨어짐
        r.fly = { v: new THREE.Vector3(_a.x * 3, 2.4, _a.z * 3), t: 0, life: 0.4 }; this.flash(p, { size: 0.6, life: 0.1, w: 0xffffff, b: C.iron }); if (!live().length) e.life = Math.min(e.life, e.t + 0.45); },
      shoot: (f) => { const d = new THREE.Vector3(f.x, 0, -f.z);                                                                                         // 공격 소모: 남은 리벳이 주황 줄기로 앞으로 날아감
        for (const r of live()) { r.fly = { v: d.clone().multiplyScalar(rnd(12, 15)).setY(rnd(-0.4, 0.6)), t: 0, life: 0.2 }; r.m.material.uniforms.uGlow.value = 1; this.flash(r.m.position.clone(), { size: 0.5, life: 0.12, b: C.hotB }); }
        e.life = Math.min(e.life, e.t + 0.3); },
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
