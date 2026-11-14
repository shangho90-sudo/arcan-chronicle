// 미용사 1차 스킬 이펙트 (2026-11-13): 스킬 이름이 그대로 보이게 — 큰 가위가 싹뚝, 앞머리 한 줄, 계단 모양 커트, 도는 빗,
// 드라이어 바람(돌풍·온풍·냉풍), 헤어롤이 감아 죔, 스타일링 반짝이·코팅 윤기·산뜻한 바람.
// Meshes: tools/blender/fx_hair.py -> assets/fx/fx_hair.glb.json (vertex colours): hair_half (one half of the shears, pivot at
//   the origin, blade +x length 1) / hair_strand / hair_spark / hair_curl / hair_comb / hair_dryer / hair_roller
// Tripo models (optional, textured): tools/blender/fx_hair_tripo.py -> assets/fx/fx_hair_tripo.glb.json: tripo_dryer (nozzle +x,
//   body length 1) / tripo_comb (flat, radius 1) / tripo_roller (bottom y 0, length 1). Missing file -> the procedural meshes.
// Light sprites (flash, ring, slice line, star, puff) = one small procedural shader on a unit quad, no atlas.
// Kinds (js/skillrt.js FX.hair(kind, a, o)); bright layers peak on the real damage tick, nothing is drawn wider than the real
// hit shape:
//   snip(at, {size, big, hit, roll})       두 줄이 가위처럼 오므라들며 '싹뚝' + (맞았으면) 별 섬광·머리카락. 기본공격·모든 가위 스킬의 명중 표시
//   shears(pc, {tgt, n, gap, first})       허공의 큰 가위가 대상을 물고 타마다 닫힘. handle.strike(t, h, last) / .miss()
//   trim(pc, {f, r, ang, hits})            앞머리 정리: 이마 높이의 곧은 가로 한 줄 + 아래로 떨어지는 머리카락
//   end(pc, {tgt, first})                  끝단 자르기 (2026-11-14): 누른 순간부터 대상 허리 높이에 가로 겨눔선(두 날 그림자가 벌어짐)
//                                          -> 피해 순간 수평 절단면(납작한 빛 원판·고리 + 가로 섬광) + 잘린 머리끝 다발이 옆으로 튐.
//                                          handle.strike(t, bonus) — bonus(체력 35% 이하라 추가 피해가 실제로 붙음)일 때만 금빛 마무리 섬광·
//                                          방사선·바깥 고리 / .miss()
//   step(pc, {f, r, ang})                  스텝 커트 (2026-11-14): 옆으로 뛰는 동안 캐릭터 잔상 2~3개(실제 몸 포즈를 그대로 찍은 반투명 사본)
//                                          + 머리·가슴·무릎 높이 세 층 가로 커트(0.12 s 간격 = 피해 틱)와 층마다 떨어지는 머리카락 다발.
//                                          handle.strike(h, hits) = h번째 피해 틱(그 층이 가장 밝음, 맞은 대상에 싹뚝)
//   proj(pos, {}) / combHit(pos, {hit})    빗 투척: 빙글빙글 도는 빗 + 반짝이 꼬리 / 빗살 자국
//   dryer(pc, {mode, r, ang, dur, f})      큰 드라이어가 손 앞에 떠서 부채꼴 안으로 바람을 뿜음. handle.pulse(hits) = 피해 틱, handle.stop()
//                                          드라이어 몸통은 모드 색으로 물들임(uDesat): gust 진주빛 민트 / hot 붉은 주황 + 빨갛게 달아오르는 노즐 / cold 얼음 하늘색.
//                                          gust 돌풍: 굵게 감기는 바람 리본(hair_swirl) + 앞으로 퍼지는 압력 고리 + 날려 가는 잎·머리카락, 맞은 적 뒤로 밀림 자국
//                                          hot 온풍: 아지랑이 물결(SPR 6) + 올라가는 주황 곱슬 + 깜박이는 불티, 틱마다 노즐 불빛·대상 열기 고리
//                                          cold 냉풍: 바닥에 깔리는 옅은 서리 안개 + 눈송이(hair_flake), 맞으면 대상 둘레에 얼음 결정(hair_crystal)·서리 고리
//   trap(t, {dur})                         헤어롤 덫 발동: 머리카락 리본이 대상을 감아 죄고 헤어롤이 머리 위에 얹힘(속박 시간 동안)
//   style(pc, {kind, dur})                 haste 스타일링 소용돌이·반짝이 / coat 코팅 윤기 띠 / fresh 민트 바람·방울
// Pooled meshes; cleared on zone change. Low spec (phone / 그래픽 효과 끔): fewer strands, sparkles and wind streaks — the
// shears, the lines and the flash stay. No global bloom / exposure / hit-stop is touched here.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const HAIR = {
  intensity: 1.0,
  snip: { len: 1.7, open: 0.62, close: 0.07, life: 0.26, line: 3.0, flash: 1.6, strands: 4, strandsLite: 2 },
  shears: { len: 1.3, open: 0.6, appear: 0.1, leave: 0.2, bite: 0.6 },
  trim: { y: 1.15, life: 0.38, line: 4.6, strands: 9, strandsLite: 4 },
  step: { gap: 0.12, first: 0.12, ys: [1.32, 0.88, 0.46], ws: [1.25, 1.75, 2.25], line: 3.0, ghosts: [0.0, 0.055, 0.11], ghostLife: 0.3, ghostA: 0.5, locks: 3, locksLite: 1 },
  end: { line: 4.2, plane: 0.7, flash: 1.5, tips: 7, tipsLite: 3, bonusFlash: 2.6, rays: 6 },
  comb: { size: 0.42, spin: 26, tilt: 0.5 },
  dryer: { size: 0.62, up: 1.12, fwd: 0.85, rate: 46, rateLite: 18, life: 0.24, appear: 0.09, fade: 0.18 },
  trap: { h: 1.25, turns: 5 },
  dryerTint: { gust: 0xc4ffe6, hot: 0xff7a1e, cold: 0x86d4ff },
  gust: { swirls: 3, swirlsLite: 2, rings: 2, leaves: 10, leavesLite: 4 },
  hot: { curl: 0.09, curlLite: 0.22, ember: 0.03, emberLite: 0.08, haze: 0.12, hazeLite: 0.32 },
  cold: { mist: 0.06, mistLite: 0.16, flake: 0.05, flakeLite: 0.14, crystals: 5, crystalsLite: 3 },
  col: { white: 0xffffff, steel: 0xdfe8ff, pink: 0xff7ab0, pinkB: 0xff3f8f, violet: 0xb48cff, gold: 0xffd27a, goldB: 0xffa028, hot: 0xffc060, hotB: 0xff5a1e, ember: 0xffe080, cold: 0xe8f8ff, coldB: 0x58b8ff, ice: 0xbfe8ff, mintW: 0xeafff6, mintG: 0x7fe0c0, mint: 0xd8fff0, mintB: 0x48dca8,
    strand: [0x6a4630, 0xffd9ec, 0xb48cff, 0x3a2a3a] },
};

const P3 = (p) => new THREE.Vector3(p.x, p.y || 0, -p.z);
const lite = () => { const G = window.G; return !!(G && ((G.input && G.input.mobile) || (G.settings && G.settings.graphicsFx === false))); };
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const rnd = (a, b) => a + Math.random() * (b - a);
const UP = new THREE.Vector3(0, 1, 0);
/** where a cut lands on a target: chest height, grows with the footprint (capped) */
export const hairMid = (t) => Math.min(1.2, 0.45 + (t.radius || 0.5) * 0.6);
const hairTop = (t) => Math.min(1.7, 0.75 + (t.radius || 0.5) * 0.9);

const SOLID_VS = `
attribute vec3 color; varying vec3 vC, vN, vV; varying vec2 vUv;
void main(){ vC = color; vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const SOLID_FS = `
uniform vec3 uTint, uRim; uniform float uA, uGlow, uSpec, uTex, uDesat; uniform sampler2D uMap;
varying vec3 vC, vN, vV; varying vec2 vUv;
void main(){
  vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
  vec3 L = normalize(vec3(-.4, .8, .5));
  float d = max(0., dot(n, L)), rim = pow(1. - max(0., dot(n, vV)), 2.5);
  vec3 raw = uTex > .5 ? texture2D(uMap, vUv).rgb : vC; raw = mix(raw, vec3(dot(raw, vec3(.3, .59, .11))) * 1.15, uDesat);
  vec3 base = raw * uTint;
  vec3 c = base * (.5 + .72 * d) + uRim * rim * .5;
  vec3 h = reflect(-L, n); c += vec3(1., .97, .92) * pow(max(0., dot(h, vV)), 24.) * uSpec;
  c += vec3(1., .96, .98) * uGlow;
  gl_FragColor = vec4(c, uA);
}`;
const FLAT_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
// uK: 0 soft disc, 1 thin ring (uP = inner fade), 2 slice line (thin, tapered ends), 3 four-point star flash, 4 puff (alpha blended), 5 wind streak (soft, long),
//     6 heat-haze ripple (wavy horizontal bands in a soft oval, uP = phase)
const SPR_FS = `
uniform vec3 uW, uB; uniform float uA, uK, uP; varying vec2 vUv;
void main(){
  vec2 p = vUv * 2. - 1.; float r = length(p), a = 0., core = 0.;
  if (uK < .5) { a = pow(clamp(1. - r, 0., 1.), 2.2); core = pow(clamp(1. - r * 1.6, 0., 1.), 2.); }
  else if (uK < 1.5) { float w = .05; a = smoothstep(1., 1. - w, r) * smoothstep(1. - w * 4.5, 1. - w, r); core = smoothstep(1. - w * 2.6, 1. - w, r) * smoothstep(1., 1. - w, r); a += uP * .16 * smoothstep(.2, .95, r) * step(r, .96); }
  else if (uK < 2.5) { float e = 1. - pow(abs(p.x), 2.4); a = clamp(e, 0., 1.) * exp(-abs(p.y) * 9.); core = clamp(e, 0., 1.) * exp(-abs(p.y) * 30.); }
  else if (uK < 3.5) { float s = exp(-abs(p.x) * 16.) * clamp(1. - abs(p.y), 0., 1.) + exp(-abs(p.y) * 16.) * clamp(1. - abs(p.x), 0., 1.); a = s + pow(clamp(1. - r, 0., 1.), 3.) * .9; core = pow(clamp(1. - r * 2.2, 0., 1.), 1.5) + s * .5; }
  else if (uK < 4.5) { a = pow(clamp(1. - r, 0., 1.), 1.4); core = clamp(.5 + p.y * .5, 0., 1.); gl_FragColor = vec4(mix(uB, uW, core), a * uA); return; }
  else if (uK < 5.5) { float e = smoothstep(-1., -.2, p.x) * (1. - smoothstep(.1, 1., p.x)); a = e * exp(-abs(p.y) * 5.); core = e * exp(-abs(p.y) * 16.); }
  else { float m = pow(clamp(1. - length(p * vec2(1., 1.4)), 0., 1.), 1.2); float w = sin(p.y * 15. + sin(p.x * 5. + uP * 1.7) * 1.6 - uP * 6.); a = m * smoothstep(.55, 1., w) * .9; core = m * smoothstep(.9, 1., w) * .6; }
  gl_FragColor = vec4(mix(uB, uW, clamp(core, 0., 1.)) * (a * uA), 1.);
}`;
const ADD = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide };
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _mx = new THREE.Matrix4();

export class HairFx {
  constructor(root) {
    this.root = root; this.live = []; this.ready = false; this.geo = {}; this.tri = {}; this.pool = {}; this.loading = null;
    this.camQ = new THREE.Quaternion(); this.toCam = new THREE.Vector3(0, 0.7, 0.7); this.camR = new THREE.Vector3(1, 0, 0); this.camU = new THREE.Vector3(0, 1, 0);
    this.quad = new THREE.PlaneGeometry(1, 1);
  }
  load() {
    if (this.loading) return this.loading;
    const wrapped = async (url) => { const j = await (await fetch(url)).json(), raw = atob(j.b64), u8 = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i); return new Promise((res, rej) => new GLTFLoader().parse(u8.buffer, '', res, rej)); };
    this.loading = (async () => {
      const g = await wrapped('assets/fx/fx_hair.glb.json');
      g.scene.traverse(o => { if (o.isMesh) this.geo[o.name] = o.geometry; });
      this.ready = true;
      try { const t = await wrapped('assets/fx/fx_hair_tripo.glb.json'); t.scene.traverse(o => { if (o.isMesh && o.material && o.material.map) this.tri[o.name] = { geo: o.geometry, map: o.material.map }; }); } catch (e) { /* no Tripo file: procedural meshes */ }
    })().catch(e => console.warn('hairfx load', e));
    return this.loading;
  }
  _ok() { if (!this.ready) { this.load(); return false; } return true; }
  _mat(kind) {
    const U = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v }])), C = () => new THREE.Color(1, 1, 1);
    if (kind === 'solid') return new THREE.ShaderMaterial({ uniforms: U({ uTint: C(), uRim: new THREE.Color(0xffe0f0), uA: 1, uGlow: 0, uSpec: 0.6, uTex: 0, uDesat: 0, uMap: null }), vertexShader: SOLID_VS, fragmentShader: SOLID_FS, transparent: true, depthWrite: true, side: THREE.DoubleSide });
    if (kind === 'puff') return new THREE.ShaderMaterial({ uniforms: U({ uW: C(), uB: C(), uA: 0, uK: 4, uP: 0 }), vertexShader: FLAT_VS, fragmentShader: SPR_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    return new THREE.ShaderMaterial({ uniforms: U({ uW: C(), uB: C(), uA: 0, uK: 0, uP: 0 }), vertexShader: FLAT_VS, fragmentShader: SPR_FS, ...ADD });
  }
  _m(e, kind, geo, order = 4) {
    const p = this.pool[kind] || (this.pool[kind] = []); let m = p.pop();
    if (!m) { m = new THREE.Mesh(geo, this._mat(kind)); m.frustumCulled = false; m.userData.kind = kind; }
    m.geometry = geo; m.position.set(0, 0, 0); m.quaternion.identity(); m.scale.set(1, 1, 1); m.visible = true; m.renderOrder = order;
    e.items.push(m); e.g.add(m); return m;
  }
  solid(e, geo, o = {}) { const m = this._m(e, 'solid', geo, 1), u = m.material.uniforms; u.uTint.value.setHex(o.tint ?? 0xffffff); u.uRim.value.setHex(o.rim ?? 0xffe0f0); u.uA.value = o.a ?? 1; u.uGlow.value = o.glow ?? 0; u.uSpec.value = o.spec ?? 0.6; u.uDesat.value = o.desat ?? 0; u.uTex.value = o.map ? 1 : 0; u.uMap.value = o.map || null; if (!geo.attributes.color) u.uTex.value = o.map ? 1 : 0; return m; }
  /** Tripo model `name` if loaded, else the procedural mesh `fallback` */
  model(e, name, fallback, o = {}) { const t = this.tri[name]; if (t) return this.solid(e, t.geo, { ...o, map: t.map }); return this.geo[fallback] ? this.solid(e, this.geo[fallback], o) : null; }
  /** additive sprite: k 0 disc / 1 ring / 2 slice line / 3 star flash / 5 wind streak */
  spr(e, k, w, b, order = 5) { const m = this._m(e, 'spr', this.quad, order), u = m.material.uniforms; u.uK.value = k; u.uP.value = 0; u.uW.value.setHex(w); u.uB.value.setHex(b); u.uA.value = 0; return m; }
  puff(e, w, b, order = 4) { const m = this._m(e, 'puff', this.quad, order), u = m.material.uniforms; u.uW.value.setHex(w); u.uB.value.setHex(b); u.uA.value = 0; return m; }
  _fx(kind, life, update) { const e = { kind, g: new THREE.Group(), items: [], t: 0, life, update }; this.root.add(e.g); this.live.push(e); return e; }
  _flat(m, r, y = 0.07) { m.rotation.set(-Math.PI / 2, 0, 0); m.scale.set(r * 2, r * 2, 1); m.position.y = y; return m; }
  /** quad whose local x runs along dir and whose face turns to the camera as far as it can */
  _alignLine(m, dir) { const x = _a.copy(dir).normalize(), z = _b.copy(this.toCam).addScaledVector(x, -this.toCam.dot(x)); if (z.lengthSq() < 1e-6) z.set(0, 1, 0); z.normalize(); const y = _c.crossVectors(z, x); _mx.makeBasis(x, y, z); m.quaternion.setFromRotationMatrix(_mx); }
  /** direction in the camera plane: angle a from the screen's right, turning up */
  _scr(a, out = new THREE.Vector3()) { return out.copy(this.camR).multiplyScalar(Math.cos(a)).addScaledVector(this.camU, Math.sin(a)); }

  // ------------------------------------------------------------------ shared bits
  /** cut hair drifting down: light, swaying, fading (three coords) */
  strands(at, n, o = {}) {
    if (n <= 0 || !this.geo.hair_strand) return;
    const ps = [], cols = o.cols || HAIR.col.strand, gy = o.ground ?? (at.y - 1.2);
    const e = this._fx('strands', o.life || 0.75, (e, dt) => {
      const k = e.t / e.life;
      for (const p of ps) { p.v.y = Math.max(-1.5, p.v.y - 4.5 * dt); p.v.x *= 1 - 2.5 * dt; p.v.z *= 1 - 2.5 * dt; p.m.position.addScaledVector(p.v, dt); p.m.position.x += Math.sin(e.t * p.f + p.ph) * 0.35 * dt;
        if (p.m.position.y < gy + 0.02) { p.m.position.y = gy + 0.02; p.v.set(0, 0, 0); }
        p.m.rotation.z += p.w * dt; p.m.rotation.x += p.w * 0.5 * dt; p.m.material.uniforms.uA.value = smooth(0, 0.05, k) * (1 - smooth(0.6, 1, k)); }
    });
    for (let i = 0; i < n; i++) {
      const m = this.solid(e, this.geo.hair_strand, { tint: cols[(Math.random() * cols.length) | 0], spec: 0.25, rim: 0xffffff }), a = rnd(0, Math.PI * 2), sp = rnd(o.speed ? o.speed[0] : 0.5, o.speed ? o.speed[1] : 1.5);
      m.scale.setScalar(rnd(0.2, 0.34) * (o.size || 1)); m.position.copy(at); if (o.spread) m.position.addScaledVector(o.spreadDir || this.camR, rnd(-o.spread, o.spread)); m.rotation.set(rnd(0, 6), rnd(0, 6), rnd(0, 6));
      ps.push({ m, v: new THREE.Vector3(Math.cos(a) * sp, rnd(o.up ? o.up[0] : 0.6, o.up ? o.up[1] : 1.6), Math.sin(a) * sp), w: rnd(-5, 5), f: rnd(5, 9), ph: rnd(0, 6) });
    }
  }
  /** twinkling four-point sparkles around a point (three coords); follow = game actor to ride along */
  sparkles(at, n, r, o = {}) {
    if (n <= 0 || !this.geo.hair_spark) return;
    const ps = [], base = at.clone();
    const e = this._fx('sparkles', o.life || 0.7, (e) => {
      const k = e.t / e.life; if (o.follow && !o.follow.dead) base.copy(P3(o.follow.pos));
      for (const p of ps) { const tw = 0.5 + 0.5 * Math.sin(e.t * p.f + p.ph); p.m.position.copy(base).add(p.off).setY(base.y + p.off.y + k * (o.rise ?? 0.35)); p.m.quaternion.copy(this.camQ); p.m.rotateZ(e.t * p.w);
        p.m.scale.setScalar(p.s * (0.4 + 0.6 * tw) * smooth(0, 0.15, k + p.d)); const u = p.m.material.uniforms; u.uA.value = smooth(p.d, p.d + 0.1, k) * (1 - smooth(0.6, 1, k)); u.uGlow.value = 0.25 + 0.5 * tw; }
    });
    for (let i = 0; i < n; i++) { const m = this.solid(e, this.geo.hair_spark, { tint: (o.cols || [HAIR.col.white, HAIR.col.pink, HAIR.col.gold])[i % (o.cols ? o.cols.length : 3)], spec: 0.2, rim: 0xffffff }); m.renderOrder = 7; m.material.depthWrite = false;
      const a = rnd(0, Math.PI * 2), rr = r * Math.sqrt(Math.random());
      ps.push({ m, off: new THREE.Vector3(Math.cos(a) * rr, rnd(o.y0 ?? 0.2, o.y1 ?? 1.5), Math.sin(a) * rr), s: rnd(0.07, 0.13) * (o.size || 1), f: rnd(10, 18), ph: rnd(0, 6), w: rnd(-2, 2), d: rnd(0, 0.3) }); }
  }
  _puffs(at, n, r, o = {}) {
    if (n <= 0) return; const ps = [];
    const e = this._fx('puffs', o.life || 0.45, (e) => { const k = e.t / e.life;
      for (const p of ps) { p.m.quaternion.copy(this.camQ); p.m.position.copy(p.p0).addScaledVector(p.d, easeOut(k) * p.run).setY(p.p0.y + k * (o.rise ?? 0.25)); p.m.scale.setScalar(p.s * (0.6 + 0.9 * easeOut(k))); p.m.material.uniforms.uA.value = (o.a ?? 0.45) * smooth(0, 0.12, k) * (1 - smooth(0.35, 1, k)); } });
    for (let i = 0; i < n; i++) { const a = (i + rnd(-0.3, 0.3)) / n * Math.PI * 2, m = this.puff(e, o.c1 ?? 0xffffff, o.c2 ?? 0xd8c8d8);
      ps.push({ m, d: new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), p0: at.clone().add(new THREE.Vector3(Math.cos(a) * r * 0.3, 0.1, Math.sin(a) * r * 0.3)), run: r * rnd(0.3, 0.6), s: rnd(0.3, 0.5) * Math.max(0.6, r) }); }
  }

  // ------------------------------------------------------------------ 싹뚝 (X로 오므라드는 두 줄)
  snip(at, o = {}) {
    if (!this._ok()) return null;
    const K = HAIR.snip, I = HAIR.intensity, s = o.size || 1, hit = o.hit !== false, big = !!o.big, roll = o.roll ?? rnd(-0.5, 0.5), c = P3(at), low = lite();
    const edge = big ? HAIR.col.goldB : HAIR.col.pinkB, mid = big ? HAIR.col.gold : HAIR.col.pink, life = K.life + (big ? 0.08 : 0);
    const e = this._fx('snip', life, (e) => {
      const shut = clamp01(e.t / K.close), ang = K.open * (1 - shut * shut), k = e.t / e.life, a = I * K.line * (hit ? 1 : 0.5) * smooth(0, 0.02, e.t) * (1 - smooth(0.35, 1, k));
      for (const [m, sg] of [[l1, 1], [l2, -1]]) { this._alignLine(m, this._scr(roll + sg * ang, _a)); m.scale.set(K.len * s * (0.85 + 0.25 * shut), 0.42 * s * (1 + 0.6 * (1 - shut)), 1); m.material.uniforms.uA.value = a; }
      fl.quaternion.copy(this.camQ); const ft = e.t - K.close; fl.scale.setScalar((big ? 1.25 : 0.8) * s * (0.5 + 0.7 * easeOut(ft / 0.08))); fl.material.uniforms.uA.value = hit && ft > 0 ? I * K.flash * (1 - smooth(0.02, 0.16, ft)) : 0;
      if (ft > 0 && !e.cut) { e.cut = true; if (hit) { this.strands(c, (low ? K.strandsLite : K.strands) + (big && !low ? 3 : 0), { ground: o.ground ?? (c.y - 0.9) }); if (big && !low) this.sparkles(c, 4, 0.5, { y0: -0.2, y1: 0.4, life: 0.5, cols: [HAIR.col.gold, HAIR.col.white] }); } }
    });
    e.g.position.copy(c);
    const l1 = this.spr(e, 2, 0xffffff, edge, 7), l2 = this.spr(e, 2, 0xffffff, mid, 7), fl = this.spr(e, 3, 0xffffff, mid, 8);
    return e;
  }

  // ------------------------------------------------------------------ 허공의 큰 가위 (가위 연격 · 끝단 자르기)
  shears(pc, o = {}) {
    if (!this._ok() || !this.geo.hair_half) return null;
    const K = HAIR.shears, n = Math.max(1, o.n || 3), gap = o.gap || 0.1, first = Math.max(0.03, o.first ?? 0.25), gold = !!o.gold;
    let tgt = o.tgt || null, ended = -1, shift = 0, glow = 0.5;
    const f = o.facing || { x: 0, z: 1 }, anchor = tgt ? P3(tgt.pos) : P3({ x: pc.pos.x + f.x * 1.3, y: pc.pos.y || 0, z: pc.pos.z + f.z * 1.3 });
    let mid = tgt ? hairMid(tgt) : 0.8, rad = tgt ? (tgt.radius || 0.5) : 0.5;
    const total = first + (n - 1) * gap, side = Math.random() < 0.5 ? 1 : -1, roll0 = gold ? -Math.PI / 2 : -Math.PI / 2 + side * 0.75;
    const e = this._fx('shears', total + K.leave + 0.05, (e) => {
      if (tgt && !tgt.dead && !tgt.removed) { anchor.copy(P3(tgt.pos)); mid = hairMid(tgt); rad = tgt.radius || 0.5; }
      const p = (e.t - first - shift) / gap, done = ended >= 0 ? ended : total + shift, out = e.t > done ? clamp01((e.t - done) / K.leave) : 0;
      // open between the ticks, shut ON every tick (p integer); before the first one it opens wide while it arrives
      const fr = p < 0 ? clamp01(1 + p * gap / first) * 0.5 : p - Math.floor(p), open = e.t > done ? 0.25 * easeOut(out) : Math.pow(Math.sin(Math.PI * Math.min(fr, 0.999)), 0.7);
      const idx = Math.max(0, Math.min(n - 1, Math.round(p))), roll = roll0 + (gold ? 0 : (idx % 2 ? -1 : 1) * 0.16 * side);
      const L = K.len * Math.min(1.35, 0.85 + rad * 0.45) * (gold ? 1.25 : 1) * (0.5 + 0.5 * easeOut(e.t / K.appear));
      const d = this._scr(roll, _a).clone(), up = _b.crossVectors(this.toCam, d).normalize().clone(), z = this.toCam;
      // the pivot sits back along the blades so the middle of the blades bites the target; it pulls back a little when it leaves
      const cx = anchor.x, cy = anchor.y + mid * (gold ? 0.55 : 1), cz = anchor.z, back = L * (K.bite + 0.35 * out);
      for (const [m, sg] of [[h1, 1], [h2, -1]]) {
        const a = sg * K.open * open, dx = _c.copy(d).multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a)).clone(), dy = new THREE.Vector3().crossVectors(z, dx);
        _mx.makeBasis(dx, dy, z); m.quaternion.setFromRotationMatrix(_mx); m.scale.set(L, L * sg, L);   // the second half is the first one mirrored (y flipped)
        m.position.set(cx - d.x * back, cy - d.y * back, cz - d.z * back).addScaledVector(z, 0.4 + sg * 0.01);
        const u = m.material.uniforms; u.uA.value = smooth(0, K.appear, e.t) * (1 - out); u.uGlow.value = Math.max(0, glow) * 0.45;
      }
      glow -= 5 * (e.dt || 0.016);
    });
    const tint = gold ? 0xffc040 : 0xffffff, h1 = this.solid(e, this.geo.hair_half, { tint, rim: gold ? HAIR.col.goldB : HAIR.col.pink, spec: 1.2 }), h2 = this.solid(e, this.geo.hair_half, { tint, rim: gold ? HAIR.col.goldB : HAIR.col.violet, spec: 1.2 });
    h1.renderOrder = h2.renderOrder = 6;
    e.strike = (t, h, last, bonus) => {
      if (e.dead) return;
      const sh = e.t - first - h * gap; if (Math.abs(sh - shift) > 0.02) { shift = sh; e.life = Math.max(e.life, total + shift + K.leave + 0.05); }
      if (t && t !== tgt) { tgt = t; anchor.copy(P3(t.pos)); mid = hairMid(t); rad = t.radius || 0.5; }
      glow = last ? 1.5 : 1.0;
      this.snip({ x: anchor.x, y: anchor.y + mid * (gold ? 0.55 : 1), z: -anchor.z }, { size: (gold ? 1.3 : 0.95) * Math.min(1.3, 0.8 + rad * 0.4), big: gold || !!bonus, roll: roll0 + Math.PI / 2 + rnd(-0.25, 0.25), ground: anchor.y });
    };
    e.miss = () => { if (ended < 0) ended = e.t; e.life = Math.min(e.life, e.t + K.leave); };
    return e;
  }

  // ------------------------------------------------------------------ 앞머리 정리: 곧은 가로 한 줄
  trim(pc, o = {}) {
    if (!this._ok()) return null;
    const K = HAIR.trim, I = HAIR.intensity, f = o.f || { x: 0, z: 1 }, r = o.r || 2.2, ang = (o.ang || 90) * Math.PI / 180, low = lite();
    const d = 0.72 * r, w = 2 * d * Math.tan(ang / 2) * 0.86, c = P3({ x: pc.pos.x + f.x * d, y: (pc.pos.y || 0) + K.y, z: pc.pos.z + f.z * d }), sideDir = new THREE.Vector3(f.z, 0, f.x);   // three: (fx, 0, -fz) forward -> right = (fz, 0, fx)
    const e = this._fx('trim', K.life, (e) => {
      const k = e.t / e.life, grow = easeOut(e.t / 0.06);
      ln.scale.set(w * grow, 1.25, 1); ln.material.uniforms.uA.value = I * K.line * (1 - smooth(0.2, 1, k));
      l2.scale.set(w * grow * 1.04, 2.6, 1); l2.material.uniforms.uA.value = I * 1.35 * (1 - smooth(0.05, 0.6, k));
    });
    e.g.position.copy(c);
    const ln = this.spr(e, 2, 0xffffff, HAIR.col.pinkB, 7), l2 = this.spr(e, 2, HAIR.col.pink, HAIR.col.violet, 6); this._alignLine(ln, sideDir); this._alignLine(l2, sideDir);
    this.strands(c, low ? K.strandsLite : K.strands, { spread: w * 0.5, spreadDir: sideDir, up: [-0.2, 0.3], speed: [0, 0.25], ground: c.y - K.y, life: 0.85 });
    for (const t of o.hits || []) this.snip({ x: t.x, y: (t.y || 0) + (t.mid || 0.8), z: t.z }, { size: 0.8, roll: rnd(-0.2, 0.2), ground: t.y || 0 });
    return e;
  }

  // ------------------------------------------------------------------ 잔상: 실제 몸의 지금 포즈를 그대로 찍은 반투명 사본 (스텝 커트)
  /** a frozen copy of the body's skinned mesh in its current pose (own bones with the captured world matrices), additive tint */
  ghost(e, body, col) {
    const live = body && body.mesh; if (!live || !live.isSkinnedMesh || !body.bones) return null;
    body.root.updateMatrixWorld(true);
    const p = this.pool.ghost || (this.pool.ghost = []); let i = p.findIndex(g => g.geometry === live.geometry && g.skeleton.bones.length === body.bones.length), g = i >= 0 ? p.splice(i, 1)[0] : null;
    if (!g) {
      const bones = body.bones.map(() => { const b = new THREE.Bone(); b.matrixAutoUpdate = false; b.matrixWorldAutoUpdate = false; return b; });
      g = new THREE.SkinnedMesh(live.geometry, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      g.bind(new THREE.Skeleton(bones, live.skeleton.boneInverses), live.bindMatrix); g.frustumCulled = false; g.matrixAutoUpdate = false; g.userData.kind = 'ghost';
    }
    g.skeleton.bones.forEach((b, k) => b.matrixWorld.copy(body.bones[k].matrixWorld));
    this.root.updateMatrixWorld(true); g.matrix.copy(this.root.matrixWorld).invert().multiply(live.matrixWorld); g.matrixWorldNeedsUpdate = true;
    g.material.color.setHex(col); g.material.opacity = 0; g.visible = true; g.renderOrder = 3;
    e.items.push(g); e.g.add(g); return g;
  }

  // ------------------------------------------------------------------ 끝단 자르기: 가로 겨눔선 -> 수평 절단면 + 머리끝 다발 (+ 마무리 섬광)
  end(pc, o = {}) {
    if (!this._ok()) return null;
    const K = HAIR.end, I = HAIR.intensity, C = HAIR.col, low = lite(), first = Math.max(0.05, o.first ?? 0.25);
    let tgt = o.tgt || null, hitAt = -1, missAt = -1, bonus = false, ok = false;
    const f = o.facing || { x: 0, z: 1 }, anchor = tgt ? P3(tgt.pos) : P3({ x: pc.pos.x + f.x * 1.3, y: pc.pos.y || 0, z: pc.pos.z + f.z * 1.3 });
    let mid = tgt ? hairMid(tgt) : 0.8, rad = tgt ? (tgt.radius || 0.5) : 0.5;
    const e = this._fx('end', first + 0.75, (e) => {
      if (tgt && !tgt.dead && !tgt.removed && hitAt < 0) { anchor.copy(P3(tgt.pos)); mid = hairMid(tgt); rad = tgt.radius || 0.5; }
      const c = _a.set(anchor.x, anchor.y + mid, anchor.z), W = Math.min(2.6, 1.6 + rad * 1.2), t = e.t;
      // two blade shadows open while the real shears open (motion hd_end) and snap together exactly on the damage tick
      const pre = hitAt < 0 && missAt < 0, sinceHit = hitAt >= 0 ? t - hitAt : -1, sinceMiss = missAt >= 0 ? t - missAt : -1;
      const openK = pre ? smooth(0, 0.12, t) * (1 - smooth(first - 0.05, first, t) * 0.0) : 0, ang = 0.26 * openK;
      const aPre = pre ? I * 1.1 * smooth(0.02, 0.14, t) : 0, aHit = sinceHit >= 0 ? I * K.line * (1 - smooth(0.04, 0.26, sinceHit)) : 0, aMiss = sinceMiss >= 0 ? 0.4 * (1 - smooth(0, 0.18, sinceMiss)) : 0;
      for (const [m, sg] of [[b1, 1], [b2, -1]]) { m.position.copy(c); this._alignLine(m, this._scr(sg * ang, _b)); m.scale.set(W * (pre ? 0.85 + 0.15 * openK : 1.2), pre ? 0.22 : 0.3 + 0.25 * (1 - smooth(0, 0.08, sinceHit)), 1); m.material.uniforms.uA.value = pre ? aPre : (aHit || aMiss); }
      // the horizontal cut plane: a flat bright disc + ring at the cut height (inside the target's footprint + 0.45 m)
      pl.position.copy(c); this._flat(pl, (rad + 0.45) * (0.7 + 0.3 * easeOut(sinceHit / 0.06)), c.y); pl.material.uniforms.uA.value = ok && sinceHit >= 0 ? I * K.plane * (1 - smooth(0.0, 0.09, sinceHit)) : 0;
      rg.position.copy(c); this._flat(rg, (rad + 0.2) + 0.35 * easeOut(sinceHit / 0.22), c.y); rg.material.uniforms.uP.value = 0.15; rg.material.uniforms.uA.value = ok && sinceHit >= 0 ? I * 3.2 * (1 - smooth(0.05, 0.34, sinceHit)) : pre ? I * 0.9 * smooth(0.04, first, t) : 0;
      fl.quaternion.copy(this.camQ); fl.position.copy(c); fl.scale.setScalar((bonus ? 1.5 : 0.85) * (0.6 + 0.6 * easeOut(sinceHit / 0.07)) * Math.min(1.3, 0.8 + rad * 0.4)); fl.material.uniforms.uA.value = ok && sinceHit >= 0 ? I * (bonus ? K.bonusFlash : K.flash) * (1 - smooth(0.02, 0.18, sinceHit)) : 0;
      // 마무리 (bonus only): a second, gold outer ring and short rays fanning out in the cut plane
      if (bonus && sinceHit >= 0) { const k = sinceHit; g2.position.copy(c); this._flat(g2, rad + 0.3 + 0.55 * easeOut(k / 0.26), c.y); g2.material.uniforms.uA.value = I * 2.4 * (1 - smooth(0.05, 0.4, k));
        rays.forEach((m, i) => { const a = i / rays.length * Math.PI * 2 + 0.3, d = _b.set(Math.cos(a), 0, Math.sin(a)); m.position.copy(c).addScaledVector(d, rad + 0.25 + 0.35 * easeOut(k / 0.2)); this._alignLine(m, d); m.scale.set(0.7, 0.3, 1); m.material.uniforms.uA.value = I * 2.0 * (1 - smooth(0.03, 0.24, k)); }); }
    });
    const b1 = this.spr(e, 2, 0xffffff, C.steel, 7), b2 = this.spr(e, 2, 0xffffff, C.pinkB, 7), pl = this.spr(e, 0, 0xffffff, C.pink, 5), rg = this.spr(e, 1, 0xffffff, C.pinkB, 6), fl = this.spr(e, 3, 0xffffff, C.pink, 8);
    let g2 = null, rays = [];
    e.strike = (t, bn) => {
      if (e.dead) return;
      if (hitAt >= 0) {   // Lv3+ extra ticks: a quick horizontal re-snip on the target; the first tick that really gets the bonus replays the plane in gold
        if (t) { anchor.copy(P3(t.pos)); mid = hairMid(t); rad = t.radius || 0.5; }
        if (!(bn && !bonus)) { this.snip({ x: anchor.x, y: anchor.y + mid, z: -anchor.z }, { size: Math.min(1.3, 0.8 + rad * 0.4), roll: rnd(-0.1, 0.1), big: bonus, ground: anchor.y }); e.life = Math.max(e.life, e.t + 0.3); return; }
      }
      if (t) { tgt = t; anchor.copy(P3(t.pos)); mid = hairMid(t); rad = t.radius || 0.5; }
      hitAt = e.t; ok = true; bonus = !!bn; e.life = e.t + 0.5;
      const c = new THREE.Vector3(anchor.x, anchor.y + mid, anchor.z), n = low ? K.tipsLite : K.tips + (bonus ? 3 : 0);
      if (bonus) { const u = (m, w, b) => { m.material.uniforms.uW.value.setHex(w); m.material.uniforms.uB.value.setHex(b); };
        u(fl, 0xffffff, C.goldB); u(rg, 0xffffff, C.goldB); u(pl, 0xfff4d0, C.gold);
        g2 = this.spr(e, 1, C.gold, C.goldB, 6); rays = Array.from({ length: low ? 4 : K.rays }, () => this.spr(e, 2, 0xffffff, C.goldB, 7));
        this.sparkles(c, low ? 3 : 6, rad + 0.3, { y0: -0.3, y1: 0.5, life: 0.6, cols: [C.gold, C.white, C.goldB] }); }
      this.tips(c, n, rad, { gy: anchor.y, gold: bonus });
    };
    e.miss = () => { if (e.dead || hitAt >= 0 || missAt >= 0) return; missAt = e.t; e.life = e.t + 0.22; };
    return e;
  }
  /** cut hair tips: locks of hair burst sideways out of the cut plane, then drop and settle (three coords: c = cut centre) */
  tips(c, n, rad, o = {}) {
    if (n <= 0 || !this.geo.hair_lock) return;
    const ps = [], gy = o.gy ?? c.y - 1, cols = o.gold ? [0xffd27a, 0xffe9b0, 0xffb040] : [0xffd9ec, 0xb48cff, 0xff9ac8, 0xfff0d0];
    const e = this._fx('tips', 0.9, (e, dt) => { const k = e.t / e.life;
      for (const p of ps) { p.v.y -= 6 * dt; p.v.x *= 1 - 3 * dt; p.v.z *= 1 - 3 * dt; p.m.position.addScaledVector(p.v, dt); if (p.m.position.y < gy + 0.03) { p.m.position.y = gy + 0.03; p.v.set(0, 0, 0); p.w *= 0.9; }
        p.m.rotation.z += p.w * dt; p.m.rotation.y += p.w * 0.6 * dt; p.m.material.uniforms.uA.value = 1 - smooth(0.65, 1, k); } });
    for (let i = 0; i < n; i++) { const a = (i + rnd(-0.3, 0.3)) / n * Math.PI * 2, d = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), m = this.solid(e, this.geo.hair_lock, { tint: cols[i % cols.length], spec: 0.3, rim: 0xffffff });
      m.position.copy(c).addScaledVector(d, rad * 0.8); m.scale.setScalar(rnd(0.26, 0.38)); m.rotation.set(rnd(-0.4, 0.4), -a, -Math.PI / 2 + rnd(-0.5, 0.5));
      ps.push({ m, v: d.multiplyScalar(rnd(1.6, 2.6)).setY(rnd(0.6, 1.4)), w: rnd(-6, 6) }); }
  }

  // ------------------------------------------------------------------ 스텝 커트: 잔상 + 층층 가로 커트(머리·가슴·무릎) + 떨어지는 머리 다발
  step(pc, o = {}) {
    if (!this._ok()) return null;
    if (o.from) return this._stepLegacy(pc, o);
    const K = HAIR.step, I = HAIR.intensity, C = HAIR.col, low = lite(), f = o.f || { x: 0, z: 1 }, fw = new THREE.Vector3(f.x, 0, -f.z), side = new THREE.Vector3(fw.z, 0, -fw.x);
    const r = Math.min(2.8, o.r || 2.8), body = pc.body, ghosts = [], lines = [];
    let ctr = null, anyHit = false;
    const gts = low ? [K.ghosts[1]] : K.ghosts.slice();
    const e = this._fx('step', K.first + K.gap * 2 + 0.6, (e) => {
      const t = e.t;
      while (gts.length && t >= gts[0]) { gts.shift(); const g = this.ghost(e, body, ghosts.length % 2 ? C.violet : C.pink); if (g) ghosts.push({ g, t0: t }); }
      for (const G_ of ghosts) { const k = (t - G_.t0) / K.ghostLife; G_.g.material.opacity = k >= 1 ? 0 : K.ghostA * I * (1 - smooth(0, 1, k)) * smooth(0, 0.04, t - G_.t0 + 0.02); }
      // layers: line i fires at its damage tick (strike) or, if that tick does not exist at this level, at its slot in the motion
      const base = ctr || P3(pc.pos).addScaledVector(fw, 1.2);
      for (const L of lines) {
        if (L.at < 0 && t >= K.first + K.gap * L.i + 0.002) L.at = t;
        const u = L.at >= 0 ? t - L.at : -1; if (u < 0) { L.m.material.uniforms.uA.value = 0; L.g.material.uniforms.uA.value = 0; continue; }
        if (!L.fired) { L.fired = true; const pc0 = base.clone().addScaledVector(fw, -0.25 + 0.2 * L.i).setY(base.y + K.ys[L.i]); L.p.copy(pc0);
          if (this.geo.hair_lock) this.layer(L.p, side, L.w, L.hit ? (low ? K.locksLite : K.locks) : 1, base.y); }
        const a = (L.hit ? 1 : anyHit ? 0.55 : 0.45) * I;
        L.m.position.copy(L.p); this._alignLine(L.m, side); L.m.scale.set(L.w * (0.55 + 0.45 * easeOut(u / 0.05)), 0.34, 1); L.m.material.uniforms.uA.value = a * K.line * (1 - smooth(0.05, 0.3, u));
        L.g.position.copy(L.p); this._alignLine(L.g, side); L.g.scale.set(L.w * 1.06, 1.3, 1); L.g.material.uniforms.uA.value = a * 0.9 * (1 - smooth(0.0, 0.22, u));
      }
    });
    for (let i = 0; i < 3; i++) { const w = Math.min(r * 0.85, K.ws[i]); lines.push({ i, w, at: -1, hit: false, fired: false, p: new THREE.Vector3(), m: this.spr(e, 2, 0xffffff, i === 2 ? C.violet : C.pinkB, 7), g: this.spr(e, 2, C.pink, C.violet, 6) }); }
    e.strike = (h, hits) => {
      if (e.dead) return; const L = lines[Math.min(2, h | 0)], hs = hits || [];
      if (hs.length) { anyHit = true; if (!ctr) ctr = P3({ x: hs.reduce((a, q) => a + q.x, 0) / hs.length, y: hs[0].y || 0, z: hs.reduce((a, q) => a + q.z, 0) / hs.length }).addScaledVector(fw, -0.3); }
      if (L && !L.fired) { L.at = e.t; L.hit = hs.length > 0; }
      for (const q of hs) this.snip({ x: q.x, y: (q.y || 0) + [1.25, 0.85, 0.5][Math.min(2, h | 0)] * Math.min(1, (q.mid || 0.8) / 0.75), z: q.z }, { size: 0.75, roll: rnd(-0.15, 0.15), ground: q.y || 0 });
      e.life = Math.max(e.life, e.t + 0.6);
    };
    return e;
  }
  /** one cut layer: a few hair locks drop from the cut line, fluttering side to side like layered hair falling (three coords) */
  layer(p, side, w, n, gy) {
    const ps = [];
    const e = this._fx('layer', 1.0, (e, dt) => { const k = e.t / e.life;
      for (const q of ps) { q.m.position.y = Math.max(gy + 0.03, q.y0 - 0.55 * e.t - 0.9 * e.t * e.t); q.m.position.addScaledVector(side, Math.cos(e.t * q.f + q.ph) * 0.5 * dt);
        q.m.rotation.z = q.r0 + Math.sin(e.t * q.f + q.ph) * 0.6; q.m.material.uniforms.uA.value = smooth(0, 0.04, e.t) * (1 - smooth(0.7, 1, k)); } });
    for (let i = 0; i < n; i++) { const m = this.solid(e, this.geo.hair_lock, { tint: HAIR.col.strand[(i + 1) % 4], spec: 0.3, rim: 0xffffff }), x = (n === 1 ? 0 : i / (n - 1) - 0.5) * w * 0.8 + rnd(-0.1, 0.1);
      m.position.copy(p).addScaledVector(side, x); m.scale.setScalar(rnd(0.22, 0.3)); const r0 = Math.PI + rnd(-0.4, 0.4); m.rotation.set(0, rnd(0, 6), r0);
      ps.push({ m, y0: p.y, f: rnd(7, 10), ph: rnd(0, 6), r0 }); }
  }

  // ------------------------------------------------------------------ 스텝 커트: 계단처럼 층진 세 줄
  /** 예전 스텝 커트(세 줄) — runtime fallback only when no handle exists */
  _stepLegacy(pc, o = {}) {
    const K = HAIR.step, I = HAIR.intensity, f = o.f || { x: 0, z: 1 }, a0 = P3(o.from || pc.pos), a1 = P3(pc.pos), path = _a.copy(a1).sub(a0).clone(), len = path.length() || 1, fw = new THREE.Vector3(f.x, 0, -f.z);
    const lines = [];
    const e = this._fx('step', K.life, (e) => {
      const k = e.t / e.life;
      for (const L of lines) { const t = e.t - L.d; L.m.material.uniforms.uA.value = t > 0 ? I * K.line * (1 - smooth(0.1, 0.24, t)) : 0; L.m.scale.set(L.w * (0.6 + 0.4 * easeOut(t / 0.05)), 0.36, 1); }
      rb.material.uniforms.uA.value = I * 0.9 * (1 - smooth(0.1, 0.9, k)); rb.scale.set(len * 1.1, 0.9, 1);
    });
    // pink ribbon on the ground along the side step, then three cut lines stepping up and forward (layers of a step cut)
    const rb = this.spr(e, 5, HAIR.col.pink, HAIR.col.violet, 4); rb.position.copy(a0).add(a1).multiplyScalar(0.5).setY(a1.y + 0.5); this._alignLine(rb, path);
    // the steps sit on the enemies really hit (centre of them), else just in front; they climb up and away like layered hair
    const hs = o.hits || [], ctr = hs.length ? P3({ x: hs.reduce((a, t) => a + t.x, 0) / hs.length, y: a1.y, z: hs.reduce((a, t) => a + t.z, 0) / hs.length }).addScaledVector(fw, -0.35) : a1.clone().addScaledVector(fw, 0.9);
    for (let i = 0; i < 3; i++) { const m = this.spr(e, 2, 0xffffff, i === 2 ? HAIR.col.goldB : HAIR.col.pinkB, 7), w = Math.min(2.4, (o.r || 2.8) * (0.42 + 0.12 * i));
      m.position.copy(ctr).addScaledVector(fw, 0.3 * i).setY(a1.y + 0.4 + 0.36 * i); this._alignLine(m, path.lengthSq() > 1e-4 ? path : this.camR); lines.push({ m, d: 0.035 * i, w }); }
    for (const t of o.hits || []) this.snip({ x: t.x, y: (t.y || 0) + (t.mid || 0.8), z: t.z }, { size: 0.85, ground: t.y || 0 });
    return e;
  }

  // ------------------------------------------------------------------ 빗 투척
  proj(pos, o = {}) {
    if (!this._ok()) return null;
    const K = HAIR.comb, last = P3(pos), vel = new THREE.Vector3(0, 0, 1); let acc = 0;
    const e = this._fx('proj', 6, (e, dt) => {
      cb.rotation.set(K.tilt, e.t * K.spin, 0, 'XYZ'); cb.material.uniforms.uA.value = smooth(0, 0.04, e.t);
      gl.quaternion.copy(this.camQ); gl.scale.setScalar(K.size * 2.6); gl.material.uniforms.uA.value = 0.5 * HAIR.intensity;
      acc += dt; if (acc > (lite() ? 0.09 : 0.045)) { acc = 0; this.sparkles(e.g.position.clone(), 1, 0.12, { y0: -0.1, y1: 0.1, life: 0.3, rise: 0.05, size: 0.8 }); }
    });
    e.g.position.copy(last);
    const cb = this.model(e, 'tripo_comb', 'hair_comb', { rim: 0xffffff, spec: 0.7 }), gl = this.spr(e, 0, HAIR.col.pink, HAIR.col.violet, 3);
    if (cb) cb.scale.setScalar(K.size);
    return { set: (p) => { const n = P3(p); n.y += 0.15; _c.copy(n).sub(last); if (_c.lengthSq() > 1e-7) vel.copy(_c).normalize(); last.copy(n); e.g.position.copy(n); }, dispose: () => this._free(e), dir: vel };
  }
  combHit(pos, o = {}) {
    if (!this._ok()) return null;
    const I = HAIR.intensity, c = P3(pos), hit = !!o.hit, d = o.dir ? new THREE.Vector3(o.dir.x, 0, -o.dir.z) : this.camR.clone(), sd = new THREE.Vector3(-d.z, 0, d.x), ls = [];
    const e = this._fx('combhit', 0.22, (e) => { const k = e.t / e.life;
      for (const [i, m] of ls.entries()) { m.material.uniforms.uA.value = I * (hit ? 2.0 : 0.8) * (1 - smooth(0.2, 1, k)); m.scale.set(0.9 * (0.5 + 0.7 * easeOut(k * 2)), 0.16, 1); void i; }
      fl.quaternion.copy(this.camQ); fl.scale.setScalar(0.7 * (0.6 + 0.6 * easeOut(k * 2))); fl.material.uniforms.uA.value = hit ? I * 1.4 * (1 - smooth(0.05, 0.6, k)) : 0; });
    e.g.position.copy(c);
    for (let i = -2; i <= 2; i++) { const m = this.spr(e, 2, 0xffffff, i % 2 ? HAIR.col.violet : HAIR.col.pinkB, 7); m.position.copy(sd).multiplyScalar(i * 0.11); this._alignLine(m, d); ls.push(m); }   // comb-teeth marks: five thin parallel lines
    const fl = this.spr(e, 3, 0xffffff, HAIR.col.pink, 8);
    if (hit) this.strands(c, lite() ? 1 : 3, { ground: c.y - 0.8 });
    return e;
  }

  // ------------------------------------------------------------------ 드라이어 (돌풍 · 온풍 · 냉풍) — 모드마다 다른 바람
  dryer(pc, o = {}) {
    if (!this._ok()) return null;
    const K = HAIR.dryer, I = HAIR.intensity, mode = o.mode || 'gust', r = o.r || 3.4, half = (o.ang || 60) * Math.PI / 360, dur = o.dur || 0.42, f = o.f || { x: 0, z: 1 }, low = lite();
    const C = HAIR.col, cw = mode === 'hot' ? C.hot : mode === 'cold' ? C.cold : C.mintW, cb = mode === 'hot' ? C.hotB : mode === 'cold' ? C.coldB : C.mintG;
    const fw = new THREE.Vector3(f.x, 0, -f.z), rt = new THREE.Vector3(-fw.z, 0, fw.x), streaks = [], lead = o.lead || 0; let acc = 0, kick = 0, stopAt = -1, tick = 0;
    const T = { a: 0, b: 0, c: 0 };   // per-mode spawn clocks
    // a point inside the real cone: angle th (|th| < half), distance d from the nozzle's ground spot
    const inCone = (noz, th, d, y) => noz.clone().addScaledVector(fw, Math.cos(th) * d).addScaledVector(rt, Math.sin(th) * d).setY(y);
    const swirls = [], rings = [];
    const e = this._fx('dryer', dur + K.fade + 0.05, (e, dt) => {
      const end = stopAt >= 0 ? stopAt : dur, base = P3(pc.pos), on = e.t < end && e.t >= lead && !pc.dead, a = smooth(0, K.appear, e.t) * (1 - smooth(end, end + K.fade, e.t));
      const noz = _a.copy(base).addScaledVector(fw, K.fwd).setY(base.y + K.up).clone(), gy = base.y;
      if (dr) { const s = K.size * (0.6 + 0.4 * easeOut(e.t / K.appear)), back = (mode === 'gust' ? 0.09 : 0.05) * Math.max(0, kick) + (mode === 'cold' ? 0.004 : 0.012) * Math.sin(e.t * 70);
        dr.position.copy(noz).addScaledVector(fw, -0.5 * K.size - back); _mx.makeBasis(fw, UP, _c.crossVectors(fw, UP)); dr.quaternion.setFromRotationMatrix(_mx); dr.scale.setScalar(s); dr.material.uniforms.uA.value = a;
        dr.material.uniforms.uGlow.value = mode === 'hot' ? 0.1 + 0.18 * Math.max(0, kick) : 0.12 * Math.max(0, kick); }
      kick -= (mode === 'hot' ? 4 : 5) * dt;
      // nozzle: 온풍 = red-hot glow that flares on every tick, 냉풍 = small cold ring, 돌풍 = a short bright puff
      const fl = mode === 'hot' ? 0.75 + 0.25 * Math.sin(e.t * 31) * Math.sin(e.t * 17) : 1;
      gl.quaternion.copy(this.camQ); gl.position.copy(noz); gl.scale.setScalar((mode === 'hot' ? 1.05 : 0.9) + (mode === 'hot' ? 0.45 : 0.3) * Math.max(0, kick)); gl.material.uniforms.uA.value = I * (mode === 'hot' ? 1.25 * fl : 0.7) * a;
      if (nz) { nz.position.copy(noz); _mx.makeBasis(rt, UP, fw); nz.quaternion.setFromRotationMatrix(_mx); nz.scale.setScalar(mode === 'cold' ? 0.42 + 0.04 * Math.sin(e.t * 9) : 0.3); nz.material.uniforms.uA.value = I * (mode === 'cold' ? 1.4 : 1.8 * fl) * a; }
      // streaks: born at the nozzle, fly out inside the real cone and die before its edge (r) — 돌풍 굵고 빠름, 온풍 넓고 느림, 냉풍 가늘고 곧음
      const rate = (low ? K.rateLite : K.rate) * (mode === 'hot' ? 0.45 : mode === 'cold' ? 0.8 : 1);
      acc += dt * rate;
      while (on && acc >= 1) { acc -= 1; const th = rnd(-half, half) * 0.92, m = this.spr(e, mode === 'cold' ? 2 : 5, cw, cb, 5), dir = fw.clone().multiplyScalar(Math.cos(th)).addScaledVector(rt, Math.sin(th));
        streaks.push({ m, dir, t: 0, life: K.life * rnd(0.8, 1.15) * (mode === 'hot' ? 1.6 : 1), y: rnd(-0.45, 0.25), len: rnd(0.7, 1.3) * (mode === 'cold' ? 0.8 : 1), w: mode === 'gust' ? 1.5 : mode === 'hot' ? 1.9 : 0.55, wob: rnd(0, 6) }); this._alignLine(m, dir); }
      for (const s of streaks) { s.t += dt; const k = s.t / s.life; if (k >= 1) { s.m.material.uniforms.uA.value = 0; continue; }
        const dist = 0.3 + (r - 0.3 - s.len * 0.5) * k; s.m.position.copy(noz).addScaledVector(s.dir, dist).setY(noz.y + s.y * k + (mode === 'hot' ? 0.12 * Math.sin(s.t * 14 + s.wob) + 0.25 * k : 0)); s.m.scale.set(s.len, (0.22 + 0.5 * k) * s.w, 1);
        s.m.material.uniforms.uA.value = I * (mode === 'hot' ? 1.1 : mode === 'cold' ? 1.6 : 1.15) * a * smooth(0, 0.15, k) * (1 - smooth(0.55, 1, k)); }
      if (mode === 'gust') {
        // thick wind ribbons twisting along the cone + pressure rings travelling out (both end inside r)
        for (const w of swirls) { const k = clamp01((e.t - w.d) / 0.42); w.m.position.copy(noz).setY(noz.y - 0.15); const dir = fw.clone().multiplyScalar(Math.cos(w.th)).addScaledVector(rt, Math.sin(w.th));
          const ax = dir, upv = UP, z = _c.crossVectors(ax, upv).normalize(); _mx.makeBasis(ax, upv, z); w.m.quaternion.setFromRotationMatrix(_mx); w.m.rotateX(e.t * 16 * w.sg + w.ph);
          const len = (r - 0.4) * (0.35 + 0.65 * easeOut(k * 1.6)), wide = Math.min(1.25 * (r * Math.sin(half)) / 0.42 * 0.8, 3.2) * (0.5 + 0.5 * k);
          w.m.scale.set(len, Math.min(1.5, wide * 0.55), wide); w.m.material.uniforms.uA.value = on || e.t < end + 0.1 ? I * 1.25 * a * smooth(0, 0.08, k) * (1 - smooth(0.7, 1, k)) : 0; }
        for (const R of rings) { const k = clamp01((e.t - R.d) / 0.32), d = 0.4 + (r * 0.88 - 0.4) * easeOut(k), rr = Math.max(0.2, d * Math.sin(half) * 0.95);
          R.m.position.copy(noz).addScaledVector(fw, d).setY(noz.y - 0.25 * k); _mx.makeBasis(rt, UP, fw); R.m.quaternion.setFromRotationMatrix(_mx); R.m.scale.set(rr * 2, Math.min(rr * 2, 1.2), 1);
          R.m.material.uniforms.uA.value = e.t >= R.d && k < 1 ? I * 1.35 * (1 - smooth(0.4, 1, k)) * smooth(0, 0.08, k) : 0; }
        T.a += dt; if (on && T.a > (low ? 0.07 : 0.035) && blown < (low ? HAIR.gust.leavesLite : HAIR.gust.leaves)) { T.a = 0; blown++; this._blown(noz, fw, rt, half, r, gy); }
      } else if (mode === 'hot') {
        const H = HAIR.hot; T.a += dt; T.b += dt; T.c += dt;
        if (on && T.a > (low ? H.curlLite : H.curl)) { T.a = 0; this._rise(inCone(noz, rnd(-half, half) * 0.8, rnd(0.4, 0.85) * r, gy + rnd(0.2, 0.9)), 'curl', gy); }
        if (on && T.b > (low ? H.emberLite : H.ember)) { T.b = 0; this._rise(inCone(noz, rnd(-half, half) * 0.85, rnd(0.25, 0.9) * r, noz.y + rnd(-0.6, 0.1)), 'ember', gy); }
        if (on && T.c > (low ? H.hazeLite : H.haze)) { T.c = 0; this._rise(inCone(noz, rnd(-half, half) * 0.6, rnd(0.35, 0.7) * r, gy + rnd(0.4, 1.0)), 'haze', gy, r * Math.sin(half)); }
      } else {
        const Q = HAIR.cold; T.a += dt; T.b += dt;
        if (on && T.a > (low ? Q.mistLite : Q.mist)) { T.a = 0; this._mist(inCone(noz, rnd(-half, half) * 0.75, rnd(0.3, 0.75) * r, gy + 0.12), fw, r); }
        if (on && T.b > (low ? Q.flakeLite : Q.flake)) { T.b = 0; this._flake(noz.clone(), fw.clone().multiplyScalar(Math.cos(rnd(-half, half) * 0.85)).addScaledVector(rt, Math.sin(rnd(-half, half) * 0.85)).normalize(), r, gy); }
      }
    });
    let blown = 0;
    const tint = HAIR.dryerTint[mode] || 0xffffff;
    const dr = this.model(e, 'tripo_dryer', 'hair_dryer', { rim: cb, spec: 0.8, tint, desat: 0.85 }), gl = this.spr(e, 0, cw, cb, 4); if (dr) dr.renderOrder = 6;
    const nz = mode === 'gust' ? null : this.spr(e, mode === 'cold' ? 1 : 0, mode === 'cold' ? 0xffffff : C.ember, cb, 7);
    if (mode === 'gust') { for (let i = 0; i < (low ? HAIR.gust.swirlsLite : HAIR.gust.swirls) && this.geo.hair_swirl; i++) { const m = this._m(e, 'spr', this.geo.hair_swirl, 5), u = m.material.uniforms; u.uK.value = 5; u.uW.value.setHex(C.white); u.uB.value.setHex(i % 2 ? C.mintG : 0xc8d8ff); u.uA.value = 0;
        swirls.push({ m, d: lead + i * 0.07, th: (i - ((low ? HAIR.gust.swirlsLite : HAIR.gust.swirls) - 1) / 2) * half * 0.55, sg: i % 2 ? -1 : 1, ph: i * 2.1 }); }
      for (let i = 0; i < HAIR.gust.rings; i++) rings.push({ m: this.spr(e, 1, 0xffffff, C.mintG, 6), d: lead + 0.04 + i * 0.13 }); }
    e.stop = () => { if (e.t < dur) { const cut = e.t; e.life = Math.min(e.life, cut + K.fade + 0.05); stopAt = cut; } };
    e.pulse = (hits) => { kick = 1; tick++;
      for (const t of hits || []) { const p = P3(t), c = p.clone(); c.y += t.mid || 0.7; const rad = t.r || 0.5;
        if (mode === 'gust') this._shove(p, c, fw, rt, P3(pc.pos));
        else if (mode === 'hot') this._heat(p, c, rad, tick);
        else this._frost(p, c, rad, t.ref || null); }
    };
    return e;
  }
  // 돌풍: a leaf or a lock of hair caught in the stream, tumbling out and dropping before the cone's edge
  _blown(noz, fw, rt, half, r, gy) {
    const th = rnd(-half, half) * 0.8, dir = fw.clone().multiplyScalar(Math.cos(th)).addScaledVector(rt, Math.sin(th)), leaf = Math.random() < 0.6 && this.geo.hair_leaf, sp = rnd(6, 9), stop = rnd(0.6, 0.9) * r;
    const e = this._fx('blown', stop / sp + 0.35, (e, dt) => { const k = e.t / e.life, d = Math.min(stop, 0.3 + sp * e.t);
      m.position.copy(noz).addScaledVector(dir, d).setY(Math.max(gy + 0.05, noz.y + y0 + Math.sin(e.t * 9 + ph) * 0.15 - (d >= stop ? 2.5 * (e.t - stop / sp) ** 2 * 4 : 0)));
      m.rotation.x += 14 * dt; m.rotation.y += 9 * dt; m.material.uniforms.uA.value = 1 - smooth(0.7, 1, k); });
    const y0 = rnd(-0.6, 0.15), ph = rnd(0, 6), m = this.solid(e, leaf ? this.geo.hair_leaf : (this.geo.hair_lock || this.geo.hair_strand), { tint: leaf ? 0xffffff : HAIR.col.strand[(Math.random() * 4) | 0], spec: 0.3, rim: 0xffffff });
    m.scale.setScalar(leaf ? rnd(0.16, 0.24) : rnd(0.18, 0.26));
  }
  // 돌풍 명중: the target is shoved — wind lines streak past it in the push direction, a crescent of pressure on the caster side, dust at the feet
  _shove(p, c, fw, rt, from) {
    const I = HAIR.intensity, dir = _a.copy(p).sub(from).setY(0); if (dir.lengthSq() < 1e-4) dir.copy(fw); dir.normalize(); const d = dir.clone(), ls = [];
    const e = this._fx('shove', 0.36, (e) => { const k = e.t / e.life;
      ls.forEach((L, i) => { L.m.position.copy(c).addScaledVector(d, -0.25 - 0.6 * easeOut(k) + 0.1 * i).addScaledVector(L.sd, L.off).setY(c.y + L.y); this._alignLine(L.m, d); L.m.scale.set(0.9 + 0.5 * k, 0.32, 1); L.m.material.uniforms.uA.value = I * 1.6 * (1 - smooth(0.25, 1, k)); });
      cr.position.copy(c).addScaledVector(d, -0.45); _mx.makeBasis(new THREE.Vector3(-d.z, 0, d.x), UP, d); cr.quaternion.setFromRotationMatrix(_mx); cr.scale.set(1.3 * (0.7 + 0.5 * easeOut(k * 2)), 1.1, 1); cr.material.uniforms.uA.value = I * 2.0 * (1 - smooth(0.05, 0.6, k)); });
    const sd = new THREE.Vector3(-d.z, 0, d.x); for (let i = 0; i < (lite() ? 2 : 4); i++) ls.push({ m: this.spr(e, 5, 0xffffff, HAIR.col.mintG, 7), sd, off: rnd(-0.35, 0.35), y: rnd(-0.35, 0.35) });
    const cr = this.spr(e, 1, 0xffffff, HAIR.col.mintG, 6); cr.material.uniforms.uP.value = 0.2;
    if (!lite()) this._puffs(p, 3, 0.7, { a: 0.32, life: 0.4, rise: 0.15 });
  }
  // 온풍 / 냉풍 small spawns (three coords)
  _rise(p, kind, gy, w) {
    const C = HAIR.col;
    if (kind === 'curl' && this.geo.hair_curl) { const e = this._fx('curl', 0.7, (e, dt) => { const k = e.t / e.life; m.position.y += 0.9 * dt; m.rotation.y += 7 * dt; m.scale.set(s * (1 - 0.3 * k), s * 1.6, s * (1 - 0.3 * k)); m.material.uniforms.uA.value = 0.85 * smooth(0, 0.15, k) * (1 - smooth(0.55, 1, k)); m.material.uniforms.uGlow.value = 0.5; });
      const s = rnd(0.15, 0.22), m = this.solid(e, this.geo.hair_curl, { tint: Math.random() < 0.5 ? C.hot : C.hotB, rim: C.ember, spec: 0.3 }); m.material.depthWrite = false; m.renderOrder = 6; m.position.copy(p); return; }
    if (kind === 'ember') { const e = this._fx('ember', rnd(0.45, 0.7), (e, dt) => { const k = e.t / e.life; m.position.y += 1.1 * dt; m.position.x += Math.sin(e.t * 13 + ph) * 0.4 * dt; m.quaternion.copy(this.camQ);
        m.scale.setScalar(0.17 * (1 - 0.5 * k)); m.material.uniforms.uA.value = HAIR.intensity * 2.8 * (0.6 + 0.4 * Math.sin(e.t * 40 + ph)) * (1 - smooth(0.5, 1, k)); });
      const ph = rnd(0, 6), m = this.spr(e, 0, 0xffffff, Math.random() < 0.5 ? C.hotB : C.ember, 7); m.position.copy(p); return; }
    if (kind === 'haze') { const e = this._fx('haze', 0.9, (e, dt) => { const k = e.t / e.life; m.position.y += 0.45 * dt; m.quaternion.copy(this.camQ); m.scale.set(ww * (0.8 + 0.3 * k), 0.75, 1);
        m.material.uniforms.uP.value = e.t * 3 + ph; m.material.uniforms.uA.value = HAIR.intensity * 1.0 * smooth(0, 0.2, k) * (1 - smooth(0.5, 1, k)); });
      const ph = rnd(0, 6), ww = Math.min(1.6, (w || 1.2) * 0.9), m = this.spr(e, 6, C.ember, C.hotB, 3); m.position.copy(p); }
  }
  _mist(p, fw, r) {
    const e = this._fx('mist', 0.9, (e, dt) => { const k = e.t / e.life; m.position.addScaledVector(fw, 0.6 * dt); m.quaternion.copy(this.camQ); m.scale.set(s * (1 + 0.6 * k), s * 0.42 * (1 + 0.4 * k), 1);
      m.material.uniforms.uA.value = 0.45 * smooth(0, 0.2, k) * (1 - smooth(0.45, 1, k)); });
    const s = rnd(0.7, 1.1) * Math.min(1.2, r / 3.2), m = this.puff(e, 0xf4fbff, 0xb8dcf4, 3); m.position.copy(p);
  }
  _flake(noz, dir, r, gy) {
    if (!this.geo.hair_flake) return; const sp = rnd(4, 6), stop = rnd(0.5, 0.92) * r, y0 = rnd(-0.55, 0.15), ph = rnd(0, 6);
    const e = this._fx('flake', stop / sp + 0.25, (e, dt) => { const k = e.t / e.life, d = Math.min(stop, 0.35 + sp * e.t); m.position.copy(noz).addScaledVector(dir, d).setY(Math.max(gy + 0.1, noz.y + y0 - 0.3 * e.t + Math.sin(e.t * 8 + ph) * 0.08));
      m.quaternion.copy(this.camQ); m.rotateZ(e.t * 5 + ph); m.scale.setScalar(s); m.material.uniforms.uA.value = smooth(0, 0.08, e.t) * (1 - smooth(0.7, 1, k)); m.material.uniforms.uGlow.value = 0.35; });
    const s = rnd(0.07, 0.12), m = this.solid(e, this.geo.hair_flake, { tint: 0xeaf8ff, rim: 0xffffff, spec: 0.5 }); m.material.depthWrite = false; m.renderOrder = 7;
  }
  // 온풍 틱: a warm ring at the cut height + a soft orange glow on the target (one per damage tick)
  _heat(p, c, rad, n) {
    const I = HAIR.intensity, C = HAIR.col;
    const e = this._fx('heat', 0.3, (e) => { const k = e.t / e.life; rg.position.copy(c); this._flat(rg, rad + 0.1 + 0.25 * easeOut(k), c.y - 0.2); rg.material.uniforms.uA.value = I * 1.6 * (1 - smooth(0.1, 1, k));
      gw.quaternion.copy(this.camQ); gw.position.copy(c); gw.scale.setScalar((rad + 0.4) * 1.6); gw.material.uniforms.uA.value = I * 0.55 * (1 - smooth(0.1, 1, k)); });
    const rg = this.spr(e, 1, C.ember, C.hotB, 6), gw = this.spr(e, 0, C.hot, C.hotB, 4);
    if (!lite() || n % 2) for (let i = 0; i < 2; i++) this._rise(c.clone().add(new THREE.Vector3(rnd(-rad, rad), rnd(-0.2, 0.3), rnd(-rad, rad))), 'ember', p.y);
  }
  // 냉풍 명중: ice crystals grow round the target's feet + a frost ring and a cold star flash (the slow's frost crust, ~0.8 s)
  _frost(p, c, rad, follow) {
    const I = HAIR.intensity, C = HAIR.col, low = lite(), n = low ? HAIR.cold.crystalsLite : HAIR.cold.crystals, cs = [];
    const e = this._fx('frost', 0.85, (e) => { const k = e.t / e.life, g = easeOut(e.t / 0.1), out = smooth(0.6, 1, k);
      for (const q of cs) { q.m.position.copy(p).add(q.off); q.m.scale.setScalar(q.s * g * (1 - 0.6 * out)); q.m.material.uniforms.uA.value = 0.92 * (1 - out); q.m.material.uniforms.uGlow.value = 0.35 * (1 - smooth(0, 0.25, e.t)); }
      rg.position.copy(p); this._flat(rg, rad + 0.15 + 0.2 * g, p.y + 0.06); rg.material.uniforms.uA.value = I * 1.8 * (1 - smooth(0.1, 0.9, k));
      fl.quaternion.copy(this.camQ); fl.position.copy(c); fl.scale.setScalar(0.8 * (0.6 + 0.6 * easeOut(e.t / 0.08))); fl.material.uniforms.uA.value = I * 1.6 * (1 - smooth(0.02, 0.2, e.t)); });
    for (let i = 0; i < n && this.geo.hair_crystal; i++) { const a = (i + rnd(-0.25, 0.25)) / n * Math.PI * 2, rr = rad * rnd(0.75, 1.0), m = this.solid(e, this.geo.hair_crystal, { tint: 0xffffff, rim: 0xe8f8ff, spec: 1.2 });
      m.rotation.set(rnd(-0.25, 0.25), rnd(0, 6), rnd(-0.25, 0.25)); cs.push({ m, off: new THREE.Vector3(Math.cos(a) * rr, 0, Math.sin(a) * rr), s: rnd(0.3, 0.5) * Math.min(1.4, 0.7 + rad * 0.6) }); }
    const rg = this.spr(e, 1, 0xffffff, C.coldB, 6), fl = this.spr(e, 3, 0xffffff, C.coldB, 8);
    if (!low) this.sparkles(c, 3, rad + 0.2, { y0: -0.4, y1: 0.4, life: 0.5, rise: -0.2, cols: [C.cold, 0xffffff, C.ice] });
  }

  // ------------------------------------------------------------------ 헤어롤 덫: 감아 죔
  trap(t, o = {}) {
    if (!this._ok() || !t) return null;
    const K = HAIR.trap, I = HAIR.intensity, dur = o.dur || 1.5, R = (t.radius || 0.5) + 0.22, H = Math.min(1.6, hairTop(t));
    const e = this._fx('trap', dur + 0.3, (e) => {
      const gone = t.dead || t.removed; if (gone && e.t < e.life - 0.2) e.life = e.t + 0.2;
      const p = P3(t.pos), a = smooth(0, 0.1, e.t) * (1 - smooth(e.life - 0.25, e.life, e.t)), tight = 1.45 - 0.45 * easeOut(e.t / 0.18);
      for (const [i, m] of [c1, c2].entries()) { if (!m) continue; m.position.copy(p); m.rotation.y = (i ? -1 : 1) * (e.t * K.turns * easeOut(e.t / 0.3) * 0.6 + e.t * 1.2) + i * Math.PI; m.scale.set(R * tight, H, R * tight); m.material.uniforms.uA.value = a * 0.72; m.material.uniforms.uGlow.value = 0.35 * (1 - smooth(0, 0.3, e.t)); }
      if (rl) { const drop = easeOut(e.t / 0.16), sq = 1 + 0.18 * Math.max(0, 1 - Math.abs(e.t - 0.16) / 0.08); rl.position.copy(p).setY(p.y + H + 0.02 + 1.2 * (1 - drop)); rl.rotation.y = 0.6; rl.scale.set(0.7 * sq, 0.7 / sq, 0.7 * sq); rl.material.uniforms.uA.value = a; }
      rg.position.copy(p); this._flat(rg, R * (0.6 + 0.9 * easeOut(e.t / 0.2))); rg.material.uniforms.uA.value = I * 1.8 * (1 - smooth(0.02, 0.28, e.t));
    });
    const mk = (tint) => { if (!this.geo.hair_curl) return null; const m = this.solid(e, this.geo.hair_curl, { tint, rim: 0xffffff, spec: 0.4 }); m.material.depthWrite = false; m.renderOrder = 6; return m; };
    const c1 = mk(HAIR.col.pink), c2 = mk(HAIR.col.violet), rl = this.model(e, 'tripo_roller', 'hair_roller', { rim: 0xffffff, spec: 0.5 }), rg = this.spr(e, 1, 0xffffff, HAIR.col.pinkB, 3);
    if (rl) rl.renderOrder = 6;
    if (!lite()) this.sparkles(P3(t.pos), 5, R, { y0: 0.3, y1: H, life: 0.6 });
    return e;
  }

  // ------------------------------------------------------------------ 스타일링 · 코팅 · 기분 전환
  style(pc, o = {}) {
    if (!this._ok()) return null;
    const I = HAIR.intensity, kind = o.kind || 'haste', C = HAIR.col, low = lite(), life = kind === 'coat' ? 0.9 : 0.85;
    const cA = kind === 'fresh' ? C.mintB : kind === 'coat' ? C.violet : C.pink, cB = kind === 'fresh' ? C.mint : kind === 'coat' ? C.white : C.gold;
    const e = this._fx('style', life, (e) => {
      const p = P3(pc.pos), k = e.t / e.life, a = smooth(0, 0.08, k) * (1 - smooth(0.7, 1, k));
      if (cu) { cu.position.copy(p).setY(p.y + (kind === 'coat' ? 0 : 0.1 + 0.5 * k)); cu.rotation.y = (kind === 'fresh' ? -1 : 1) * e.t * 9; const s = kind === 'fresh' ? 0.75 + 0.5 * k : 0.62 + 0.2 * Math.sin(k * Math.PI); cu.scale.set(s, kind === 'coat' ? 1.7 * easeOut(k * 1.6) : 1.5, s); cu.material.uniforms.uA.value = a * 0.9; cu.material.uniforms.uGlow.value = 0.3; }
      // 코팅: a glossy band sweeps up the body twice; 스타일링: a quick comb-through arc over the head; 기분 전환: an opening mint ring at the feet
      if (kind === 'coat') { const u = (k * 2) % 1; rg.position.copy(p); this._flat(rg, 0.62, 0.1 + 1.6 * u); rg.material.uniforms.uA.value = I * 1.6 * a * Math.sin(u * Math.PI);
        gl.quaternion.copy(this.camQ); gl.position.copy(p).setY(p.y + 0.95); gl.scale.set(1.5, 2.3, 1); gl.material.uniforms.uA.value = I * 0.42 * a; }
      else if (kind === 'haste') { rg.position.copy(p).setY(p.y + 1.75); this._alignLine(rg, this._scr(-0.5 + 1.0 * easeOut(k * 2.5), _a)); rg.scale.set(0.9, 0.34, 1); rg.material.uniforms.uA.value = I * 2.0 * (1 - smooth(0.15, 0.5, k));
        gl.quaternion.copy(this.camQ); gl.position.copy(p).setY(p.y + 1.6); gl.scale.setScalar(1.1); gl.material.uniforms.uA.value = I * 0.5 * a; }
      else { rg.position.copy(p); this._flat(rg, 0.4 + 1.1 * easeOut(k * 1.4), 0.08); rg.material.uniforms.uA.value = I * 1.5 * (1 - smooth(0.1, 0.8, k));
        gl.quaternion.copy(this.camQ); gl.position.copy(p).setY(p.y + 1.0); gl.scale.setScalar(1.8); gl.material.uniforms.uA.value = I * 0.4 * a; }
    });
    const cu = this.geo.hair_curl ? this.solid(e, this.geo.hair_curl, { tint: cA, rim: 0xffffff, spec: 0.5 }) : null; if (cu) { cu.material.depthWrite = false; cu.renderOrder = 6; }
    const rg = this.spr(e, kind === 'haste' ? 2 : 1, 0xffffff, cA, 6), gl = this.spr(e, 0, cB, cA, 3);
    this.sparkles(P3(pc.pos), low ? 4 : 9, 0.6, { follow: pc, y0: kind === 'haste' ? 1.2 : 0.3, y1: 1.9, life: 0.9, cols: [cB, cA, C.white] });
    if (kind === 'fresh' && !low) this._puffs(P3(pc.pos), 4, 0.9, { c1: C.mint, c2: C.mintB, a: 0.3, rise: 0.6, life: 0.6 });
    return e;
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    const G = window.G, cam = G && G.render && G.render.cam;
    if (cam) { this.camQ.copy(cam.quaternion); cam.getWorldDirection(_a); this.toCam.copy(_a).multiplyScalar(-1); this.camR.set(1, 0, 0).applyQuaternion(cam.quaternion).normalize(); this.camU.set(0, 1, 0).applyQuaternion(cam.quaternion).normalize(); }
    for (const e of this.live) { if (e.dead) continue; e.t += dt; e.dt = dt; try { e.update(e, dt); } catch (err) { console.warn('hairfx', e.kind, err); e.t = e.life; } if (e.t >= e.life) this._free(e); }
    this.live = this.live.filter(e => !e.dead);
  }
  _free(e) { if (e.dead) return; e.dead = true; this.root.remove(e.g);
    for (const m of e.items) { if (m.parent) m.parent.remove(m); m.material.depthWrite = m.userData.kind === 'solid'; (this.pool[m.userData.kind] || (this.pool[m.userData.kind] = [])).push(m); } e.items.length = 0; }
  clear() { for (const e of this.live) this._free(e); this.live = []; }
}
