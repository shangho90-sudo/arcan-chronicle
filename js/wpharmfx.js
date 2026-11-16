// 양약사 2차 스킬 이펙트 (2026-11-16). 규칙은 js/wpharm.js, 메시는 tools/blender/fx_wpharm.py -> assets/fx/fx_wpharm.glb.json
// (wp_cap_half / _granule / _ampoule / _crystal / _tablet / _vial / _shard / _sphere — 정점 색은 흰색·금띠만, 색은 tint 유니폼).
// 시각 정체성: 동화풍 정밀 제약 — 유리(가장자리 빛 + 안쪽 색, 무거운 굴절 없음)·반투명 약액·매끈한 캡슐·빛나는 과립.
// 색 역할: 청백·청록 = 정밀·보호·회복 / 빨강·금 = 화상·촉매 / 옅은 하늘색 = 냉기·결정. 빛만 가산, 바닥 막은 일반 블렌딩(z-fighting 없게 살짝 띄움).
// 가장 밝은 순간 = 실제 피해 순간(js/wpharm.js 가 그 순간 handle 메서드를 부름). 고리·막은 실제 판정 반경을 넘지 않음. 전역 블룸·노출·정지는 안 건드림.
// 종류 (FX.wp(kind, a, o) — 모두 null 이 될 수 있음, 규칙은 그대로):
//   mark(t)                          반응 표식: 발밑 얇은 청록 고리 + 카메라 쪽 구슬 1~3. handle {setStacks(n), dispose()} — 0이 되면 소비 섬광 뒤 사라짐
//   capsule(pc, {from, tgt(), at(), fly, split, n})   handle {launch(i, dur, ok), hit(i, pos, ok, last), fizzle(i), ring(pos, r)}
//   cryo(pc, {from, at, r, fly, film, rise, burst})   handle {burst(hits)}
//   ion(pc, {from, f, len, w, align, strike, n})      handle {strike(hits)}
//   triad(pc, {from, tgt(), at(), times})               handle {hit(i, pos, ok), fizzle(i), compound(pos, r), end()}
//   collapse(pc, {at, r, contact})                    handle {impact(n)}
//   catalyst(pc, {dur, n})  carrier(pc, {from, tgt, fly})  chain(pc, {from, tgt, first})  zone(pos, {r, life})  critical(pos, {r, burst, snap})
//   spray(pos, {r, dur, follow})  coat(pc, {dur, initial})  lastrx(pc, {dur})  made(pc, {kind: vial|capsule})  regen(pc, {status})
// 저사양(휴대폰 / 그래픽 효과 끔): 장식 입자(과립 꼬리·파편·연무·반짝이)만 줄임 — 캡슐이 열리는 것, 결정이 자라는 것, 표식 소비는 그대로.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CookFx, cookTop } from './cookfx.js';

export const WPFX = {
  intensity: 1.0,
  col: { teal: 0x5ae6d2, tealB: 0x1a9a92, ice: 0xbfeaff, iceB: 0x4aa8f0, white: 0xf4fbff, red: 0xff4a3a, redB: 0xb8180e, gold: 0xffd27a, goldB: 0xff9a2a, capW: 0xf6f2ea, capR: 0xff5a48, silver: 0xd6e2ee, glass: 0xdff6ff },
  mark: { pad: 0.3, w: 0.035, bead: 0.11 },
  capsule: { size: 0.13, granule: 0.06, trail: 7, trailLite: 4, arc: 1.1 },
  cryo: { rim: 8, rimLite: 6, mid: 4, crystal: 0.42, centre: 0.95, shards: 12, shardsLite: 5 },
  ion: { y: 1.05, segs: 12, branches: 3, branchesLite: 1 },
  collapse: { h: 4.4, size: 0.72, granules: 12, granulesLite: 7, shards: 14, shardsLite: 6, spikes: 8, spikesLite: 5 },
  zone: { granules: 10, granulesLite: 6 },
};
const P3 = (p) => new THREE.Vector3(p.x, p.y || 0, -p.z);
const lite = () => { const G = window.G; return !!(G && ((G.input && G.input.mobile) || (G.settings && G.settings.graphicsFx === false))); };
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const easeIn = (x) => Math.pow(clamp01(x), 2.2);
const rnd = (a, b) => a + Math.random() * (b - a);
const UP = new THREE.Vector3(0, 1, 0), YA = new THREE.Vector3(0, 1, 0), XA = new THREE.Vector3(1, 0, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _m4 = new THREE.Matrix4();
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
const ADD = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide };

export class WpFx extends CookFx {
  load() {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const j = await (await fetch('assets/fx/fx_wpharm.glb.json')).json(), raw = atob(j.b64), u8 = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
      const g = await new Promise((res, rej) => new GLTFLoader().parse(u8.buffer, '', res, rej));
      g.scene.traverse(o => { if (o.isMesh) this.geo[o.name] = o.geometry; });
      this.chips = [this.geo.wp_shard].filter(Boolean);
      this.ready = true;
    })().catch(e => console.warn('wpharmfx load', e));
    return this.loading;
  }
  _mat(kind) {
    const U = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v }])), C = () => new THREE.Color(1, 1, 1);
    if (kind === 'glass') return new THREE.ShaderMaterial({ uniforms: U({ uTint: C(), uRim: C(), uA: 1, uOp: 0.35, uGlow: 0 }), vertexShader: GLASS_VS, fragmentShader: GLASS_FS, transparent: true, depthWrite: false, side: THREE.FrontSide });
    if (kind === 'disc') return new THREE.ShaderMaterial({ uniforms: U({ uW: C(), uB: C(), uA: 0, uK: 0, uP: 0, uT: 0, uAdd: 0 }), vertexShader: FLAT_VS, fragmentShader: DISC_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    if (kind === 'discA') return new THREE.ShaderMaterial({ uniforms: U({ uW: C(), uB: C(), uA: 0, uK: 2, uP: 0, uT: 0, uAdd: 1 }), vertexShader: FLAT_VS, fragmentShader: DISC_FS, ...ADD });
    return super._mat(kind);
  }
  glassM(e, geo, o = {}) { const m = this._m(e, 'glass', geo, o.order ?? 3), u = m.material.uniforms; u.uTint.value.setHex(o.tint ?? WPFX.col.glass); u.uRim.value.setHex(o.rim ?? 0xffffff); u.uA.value = o.a ?? 1; u.uOp.value = o.op ?? 0.35; u.uGlow.value = o.glow ?? 0; return m; }
  disc(e, k, w, b, add = false, order = 2) { const m = this._m(e, add ? 'discA' : 'disc', this.quad, order), u = m.material.uniforms; u.uK.value = k; u.uP.value = 0; u.uT.value = 0; u.uW.value.setHex(w); u.uB.value.setHex(b); u.uA.value = 0; m.rotation.set(-Math.PI / 2, 0, 0); return m; }
  _h(e, o = {}) { e.dispose = () => this._free(e); return Object.assign(e, o); }
  /** quad (spr) stretched from A to B (three coords), facing the camera, width w */
  seg(m, A, B, w) {
    _a.subVectors(B, A); const L = _a.length() || 1e-4; _a.multiplyScalar(1 / L);
    _b.crossVectors(_a, this.toCam); if (_b.lengthSq() < 1e-8) _b.set(0, 0, 1); _b.normalize(); _c.crossVectors(_a, _b);
    _m4.makeBasis(_a, _b, _c); m.quaternion.setFromRotationMatrix(_m4); m.position.addVectors(A, B).multiplyScalar(0.5); m.scale.set(L, w, 1);
  }
  /** short flash (star) + optional thin ring billboard */
  flash(at, w, b, size, life = 0.14, a = 1.2) {
    const e = this._fx('flash', life, (e) => { const k = e.t / life; f.quaternion.copy(this.camQ); f.scale.setScalar(size * (0.6 + 0.6 * easeOut(k))); f.material.uniforms.uA.value = WPFX.intensity * a * (1 - smooth(0.15, 1, k)); });
    e.g.position.copy(at); const f = this.spr(e, 3, w, b, 7); return e;
  }
  /** thin ground ring that grows to r (additive), life s */
  groundRing(at, r, w, b, life = 0.3, a = 1.4) {
    const e = this._fx('gring', life, (e) => { const k = e.t / life; m.material.uniforms.uP.value = 0.25 + 0.75 * easeOut(k); m.material.uniforms.uA.value = WPFX.intensity * a * (1 - smooth(0.3, 1, k)); });
    e.g.position.copy(at); e.g.position.y += 0.06; const m = this.disc(e, 2, w, b, true, 3); m.scale.set(r * 2, r * 2, 1); return e;
  }
  sparkle(at, n, col, o = {}) { if (n > 0 && this.geo.wp_granule) this._bits(at, n, { geo: this.geo.wp_granule, tint: col, size: o.size || [0.025, 0.045], speed: o.speed || [0.8, 2.2], up: o.up || [1.0, 2.4], ground: o.ground ?? at.y - 1.2, life: o.life || 0.5 }); }
  shards(at, n, col, o = {}) { if (n > 0 && this.geo.wp_shard) this._bits(at, n, { geo: this.geo.wp_shard, tint: col, size: o.size || [0.08, 0.16], speed: o.speed || [1.6, 3.6], up: o.up || [1.6, 3.4], ground: o.ground ?? at.y - 0.02, life: o.life || 0.6 }); }

  // ------------------------------------------------------------------ 반응 표식 (메시 없이 셰이더만 — 로딩 전에도 보임)
  mark(t) {
    if (!t) return null; const C = WPFX.col, M = WPFX.mark; let n = 1, shown = 0, pop = 0.25, endT = -1;
    const R = (t.radius || 0.5) + M.pad;
    const e = this._fx('mark', 1e9, (e, dt) => {
      if ((t.dead || t.removed) && endT < 0) endT = 0;
      if (endT >= 0) { endT += dt; const k = endT / 0.28; ring.scale.setScalar(R * 2 * (1 + 0.5 * easeOut(k))); ring.material.uniforms.uA.value = 1.6 * (1 - k); for (const b of beads) b.material.uniforms.uA.value *= 0.8; if (k >= 1) e.t = e.life; return; }
      pop = Math.max(0, pop - dt); shown += (n - shown) * Math.min(1, dt * 12);
      const p = P3(t.pos); e.g.position.set(p.x, p.y + 0.05, p.z);
      ring.scale.setScalar(R * 2 * (1 + 0.25 * pop / 0.25)); ring.material.uniforms.uA.value = WPFX.intensity * (0.9 + 0.25 * n + 0.15 * Math.sin(e.t * 5));
      _a.copy(this.toCam).setY(0).normalize(); const base = Math.atan2(_a.z, _a.x);
      beads.forEach((b, i) => { const a = base + (i - 1) * 0.42, on = i < Math.round(shown); b.position.set(Math.cos(a) * R, 0.05, Math.sin(a) * R); b.quaternion.copy(this.camQ);
        b.scale.setScalar(M.bead * (on ? 1.25 + 0.4 * pop / 0.25 : 0.7)); b.material.uniforms.uA.value = on ? 1.6 : 0.25; });
    });
    const ring = this.spr(e, 1, C.white, C.teal, 3); ring.rotation.set(-Math.PI / 2, 0, 0); ring.material.uniforms.uP.value = 0.2;
    const beads = [0, 1, 2].map(() => this.spr(e, 0, C.white, C.teal, 6));
    return this._h(e, { setStacks: (v) => { if (v > n) pop = 0.25; n = Math.max(0, Math.min(3, v)); if (n === 0 && endT < 0) endT = 0; }, end: () => { if (endT < 0) endT = 0; }, dispose: () => { if (endT < 0) endT = 0; } });   // 소비·사망·만료: 0.28초 고리가 퍼지며 사라짐
  }

  // ------------------------------------------------------------------ A1 작열·분열 캡슐
  capsule(pc, o) {
    if (!this._ok()) return null; const C = WPFX.col, K = WPFX.capsule, low = lite(), n = o.n || 5, from = P3(o.from), s = K.size, NT = low ? K.trailLite : K.trail;
    const top = () => { const t = o.tgt(), p = o.at(); return P3({ x: p.x, y: (p.y || 0) + (t ? cookTop(t) : 1.2) + 0.85, z: p.z }); };
    const midP = () => { const t = o.tgt(), p = o.at(); return P3({ x: p.x, y: (p.y || 0) + (t ? mid(t) : 0.8), z: p.z }); };
    let splitAt = null; const gr = [];
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
        glowS.position.copy(_d); glowS.quaternion.copy(this.camQ); glowS.scale.setScalar(0.5 + 0.6 * smooth(o.fly, o.fly + o.split, t)); glowS.material.uniforms.uA.value = 0.9 * smooth(0, 0.1, t) * fa;
      } else { hA.visible = hB.visible = glowS.visible = false; }
      for (const q of gr) {
        if (!q.on) continue; q.t += dt; const k = clamp01(q.t / q.dur), end = q.dead ? q.endFix : midP();
        bez(_d, q.p0, q.cp, end, easeIn(k * 0.6 + 0.4 * k * k)); q.m.position.copy(_d); q.m.material.uniforms.uA.value = q.dead ? Math.max(0, 1 - (q.t - q.dt0) / 0.15) : 1;
        q.hist.unshift(q.m.position.clone()); if (q.hist.length > NT) q.hist.length = NT;
        if (q.rib) { this._ribbonSet(q.rib, q.hist, 0.035); q.rib.material.uniforms.uA.value = q.m.material.uniforms.uA.value * 0.9; }
        if (q.dead && q.t - q.dt0 > 0.15) { q.on = false; q.m.visible = false; if (q.rib) q.rib.visible = false; }
      }
    });
    const g = new THREE.Group(); e.g.add(g);
    const hA = this.glassM(e, this.geo.wp_cap_half, { tint: C.capR, op: 0.9, glow: 0.25 }), hB = this.glassM(e, this.geo.wp_cap_half, { tint: C.capW, op: 0.85, glow: 0.15 });
    for (const [h, sg] of [[hA, 1], [hB, -1]]) { e.g.remove(h); g.add(h); h.scale.set(s, s * sg, s); }
    const glowS = this.spr(e, 0, C.gold, C.red, 5);
    for (let i = 0; i < n; i++) { const m = this.solid(e, this.geo.wp_granule, { tint: C.gold, spec: 0.8 }); m.material.uniforms.uGlow.value = 0.35; m.scale.setScalar(K.granule * (i === n - 1 ? 1.35 : 1)); m.visible = false;
      const rib = this._ribbon(e, NT); rib.material.uniforms.uW.value.setHex(C.gold); rib.material.uniforms.uB.value.setHex(C.goldB); rib.visible = false; gr.push({ m, rib, on: false, hist: [], t: 0, dur: 0.2 }); }
    return this._h(e, {
      launch: (i, dur, ok) => { const q = gr[i]; if (!q) return; q.on = true; q.t = 0; q.dur = Math.max(0.06, dur); q.m.visible = true; q.rib.visible = true; q.p0 = (splitAt || top()).clone(); q.hist.length = 0;
        const a = (i / n) * Math.PI * 2 + 0.6, side = this.camR; q.cp = q.p0.clone().addScaledVector(side, Math.cos(a) * K.arc).add(_a.set(0, 0.5 + Math.sin(a) * 0.6, 0)); if (!ok) q.dead = true, q.dt0 = 0, q.endFix = q.p0.clone(); },
      hit: (i, pos, ok, last) => { const q = gr[i]; if (q) { q.on = false; q.m.visible = false; q.rib.visible = false; }
        const p = P3({ x: pos.x, y: (pos.y || 0) + Math.min(1.2, 0.45 + (pos.r || 0.5) * 0.7), z: pos.z });
        if (ok) { this.flash(p, C.white, last ? C.red : C.gold, last ? 1.1 : 0.55, last ? 0.16 : 0.1); if (!low) this.sparkle(p, last ? 5 : 2, C.gold); } },
      fizzle: (i) => { const q = gr[i]; if (q && q.on) { q.dead = true; q.dt0 = q.t; q.endFix = q.m.position.clone(); } else if (q) { q.m.visible = false; q.rib.visible = false; } },
      ring: (pos, r) => { const p = P3(pos); this.groundRing(p, r, C.white, C.red, 0.32, 1.6); this.flash(_a.copy(p).setY(p.y + 0.6), C.white, C.redB, 1.4, 0.16, 1.0); if (!low) this._puffs(p, 3, r * 0.6, { c1: 0xffb08a, c2: 0x8a2a1a, a: 0.35, life: 0.4 }); },
    });
  }

  // ------------------------------------------------------------------ A2 극저온 결정화
  cryo(pc, o) {
    if (!this._ok()) return null; const C = WPFX.col, K = WPFX.cryo, low = lite(), at = P3(o.at), from = P3(o.from), r = o.r;
    const t0 = o.fly, t1 = o.fly + o.film, t2 = t1 + o.rise, TB = o.burst; let burst = -1;
    const cr = [], NR = low ? K.rimLite : K.rim;
    const e = this._fx('cryo', TB + 0.6, (e) => {
      const t = e.t; _c.copy(from).lerp(at, 0.5); _c.y += 1.3;
      if (t <= t0) { bez(_d, from, _c, at, easeIn(t / t0)); amp.position.copy(_d); amp.rotation.set(Math.PI * smooth(0, t0, t), 0, 0); }
      else { amp.position.copy(at).setY(at.y + 0.18 * (1 - smooth(t0, t1, t))); amp.rotation.set(Math.PI, 0, 0); }
      amp.material.uniforms.uA.value = 1 - smooth(t1, t1 + 0.2, t);
      const fk = smooth(t0, t1, t); film.material.uniforms.uP.value = 0.05 + 0.93 * easeOut(fk); film.material.uniforms.uA.value = (burst < 0 ? 1 : 1 - smooth(TB, TB + 0.45, t)) * 0.95 * smooth(t0, t0 + 0.05, t);
      for (const c of cr) {
        const k = burst >= 0 ? 1 : smooth(c.d0, c.d0 + 0.16, t), fade = burst >= 0 ? 1 - smooth(TB + c.fo, TB + c.fo + 0.25, t) : 1;
        c.m.scale.set(c.s * 0.8, c.s * k * (c.centre ? 0.6 + 0.4 * smooth(t2 - 0.1, TB, t) : 1), c.s * 0.8); c.m.material.uniforms.uA.value = fade * (c.centre ? 1 : 0.9);
        if (c.centre) c.m.material.uniforms.uGlow.value = 0.2 + 1.2 * smooth(t2, TB, t);
      }
    });
    const amp = this.glassM(e, this.geo.wp_ampoule, { tint: C.ice, op: 0.55, glow: 0.3 }); amp.scale.setScalar(0.32);
    const film = this.disc(e, 0, C.white, C.iceB); film.position.copy(at).setY(at.y + 0.04); film.scale.set(r * 2, r * 2, 1);
    for (let i = 0; i < NR; i++) { const a = i / NR * Math.PI * 2 + 0.2, rr = r * 0.82; cr.push({ x: Math.cos(a) * rr, z: Math.sin(a) * rr, d0: t1 + 0.02 * i / NR, s: K.crystal * rnd(0.8, 1.1), fo: 0.05 }); }
    for (let i = 0; i < K.mid; i++) { const a = i / K.mid * Math.PI * 2 + 0.8, rr = r * 0.45; cr.push({ x: Math.cos(a) * rr, z: Math.sin(a) * rr, d0: t1 + (t2 - t1) * 0.45, s: K.crystal * 1.2, fo: 0.1 }); }
    cr.push({ x: 0, z: 0, d0: t1 + (t2 - t1) * 0.8, s: K.centre, centre: true, fo: 0 });
    for (const c of cr) { c.m = this.glassM(e, this.geo.wp_crystal, { tint: C.ice, op: 0.6, glow: 0.2, order: 4 }); c.m.position.set(at.x + c.x, at.y, at.z + c.z); c.m.rotation.set(rnd(-0.18, 0.18), rnd(0, 6), rnd(-0.18, 0.18)); c.m.scale.setScalar(0.001); }
    return this._h(e, { burst: (hits) => {
      burst = e.t; const top = at.clone(); top.y += K.centre * 0.8;
      this.flash(top, C.white, C.iceB, 1.6, 0.16, 1.1); this.groundRing(at, r, C.white, C.iceB, 0.34, 1.5);
      this.shards(top, low ? K.shardsLite : K.shards, C.ice, { ground: at.y + 0.03 });
      for (const h of hits || []) { const p = P3({ x: h.x, y: (h.y || 0) + 0.6, z: h.z }); this.flash(p, C.white, C.ice, 0.5, 0.1, 0.8); if (h.frozen && !low) this._puffs(P3(h), 3, 0.8, { c1: 0xe8f8ff, c2: 0x8ac8f0, a: 0.4, life: 0.6, rise: 0.4 }); }
    } });
  }

  // ------------------------------------------------------------------ A3 이온 관통술
  ion(pc, o) {
    if (!this._ok()) return null; const C = WPFX.col, K = WPFX.ion, low = lite(), n = o.n || 3, from = P3(o.from), f = new THREE.Vector3(o.f.x, 0, -o.f.z).normalize();
    const base = P3(pc.pos); base.y += K.y; let fired = -1;
    const orbs = [], arcs = [], bolt = [], br = [];
    const NB = low ? K.branchesLite : K.branches;
    const e = this._fx('ion', o.strike + 0.32, (e) => {
      const t = e.t, k = smooth(0, o.align, t);
      orbs.forEach((q, i) => { _d.copy(base).addScaledVector(f, 0.7 + i * 0.55); q.m.position.copy(q.p0).lerp(_d, easeOut(k)); q.m.position.y += Math.sin(t * 20 + i) * 0.02 * (1 - k);
        q.m.material.uniforms.uA.value = fired < 0 ? smooth(0, 0.06, t) : 1 - smooth(fired, fired + 0.12, t); q.m.material.uniforms.uGlow.value = 0.3 + 0.9 * smooth(o.align, o.strike, t); });
      arcs.forEach((m, i) => { if (i + 1 >= orbs.length) return; m.visible = fired < 0 && t > o.align * 0.6; this.seg(m, orbs[i].m.position, orbs[i + 1].m.position, 0.05 + 0.03 * Math.random()); m.material.uniforms.uA.value = 0.6 + 0.6 * Math.random(); });
      if (fired >= 0) { const q = 1 - smooth(fired + 0.04, fired + 0.22, t); for (const m of bolt) m.material.uniforms.uA.value = 2.0 * q; for (const m of br) m.material.uniforms.uA.value = 1.2 * q; }
    });
    for (let i = 0; i < n; i++) { const m = this.glassM(e, this.geo.wp_granule, { tint: C.silver, op: 0.8, glow: 0.3, order: 4 }); m.scale.setScalar(0.085); orbs.push({ m, p0: from.clone().add(_a.set(rnd(-0.25, 0.25), rnd(-0.1, 0.3), rnd(-0.25, 0.25))) }); }
    for (let i = 0; i < n - 1; i++) arcs.push(this.spr(e, 2, C.white, C.iceB, 5));
    for (let i = 0; i < K.segs; i++) { const m = this.spr(e, 2, C.white, C.iceB, 6); m.visible = false; bolt.push(m); }
    for (let i = 0; i < NB * 2; i++) { const m = this.spr(e, 2, C.white, C.ice, 6); m.visible = false; br.push(m); }
    return this._h(e, { strike: (hits) => {
      fired = e.t; const pts = [], side = _b.crossVectors(f, UP).normalize().clone();
      for (let i = 0; i <= K.segs; i++) { const k = i / K.segs, j = i === 0 || i === K.segs ? 0 : rnd(-0.22, 0.22); pts.push(base.clone().addScaledVector(f, 0.3 + k * (o.len - 0.3)).addScaledVector(side, j * o.w * 0.5).add(_a.set(0, rnd(-0.12, 0.12) * (j ? 1 : 0), 0))); }
      bolt.forEach((m, i) => { m.visible = true; this.seg(m, pts[i], pts[i + 1], 0.22); });
      for (let b = 0; b < NB; b++) { const i0 = 2 + Math.floor(rnd(0, K.segs - 4)), p0 = pts[i0], p1 = p0.clone().addScaledVector(side, rnd(-0.7, 0.7)).addScaledVector(f, rnd(0.2, 0.6)).add(_a.set(0, rnd(-0.2, 0.4), 0)), p2 = p1.clone().addScaledVector(side, rnd(-0.4, 0.4)).addScaledVector(f, 0.3);
        br[b * 2].visible = br[b * 2 + 1].visible = true; this.seg(br[b * 2], p0, p1, 0.08); this.seg(br[b * 2 + 1], p1, p2, 0.06); }
      for (const h of hits || []) this.flash(P3({ x: h.x, y: (h.y || 0) + K.y, z: h.z }), C.white, C.iceB, 0.75, 0.12, 1.2);
      this.flash(pts[0], C.white, C.ice, 0.6, 0.1, 1.0);
    } });
  }

  // ------------------------------------------------------------------ A4 삼상 복합제
  triad(pc, o) {   // (이름이 tri면 CookFx의 this.tri — Tripo 소품 표 — 와 겹침)
    if (!this._ok()) return null; const C = WPFX.col, from = P3(o.from), times = o.times, low = lite();
    const centre = () => { const t = o.tgt(), p = o.at(); return P3({ x: p.x, y: (p.y || 0) + (t ? mid(t) : 0.8), z: p.z }); };
    const items = [];
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
        q.trail.position.copy(q.m.position); q.trail.quaternion.copy(this.camQ); q.trail.scale.setScalar(0.32); q.trail.material.uniforms.uA.value = 0.7 * smooth(0, 0.1, t);
      });
      if (t < times[2]) { for (let i = 0; i < 3; i++) { const a = items[i].m.position, b = items[(i + 1) % 3].m.position; lines[i].visible = t > 0.32; this.seg(lines[i], a, b, 0.04); lines[i].material.uniforms.uA.value = 0.5 * smooth(0.32, 0.42, t) * (1 - smooth(times[0] - 0.1, times[0], t)); } }
      else for (const l of lines) l.visible = false;
    });
    const mk = (geo, tint, sc, glow) => { const m = this.glassM(e, geo, { tint, op: 0.9, glow, order: 4 }); m.scale.setScalar(sc); return m; };
    const cap = new THREE.Group(), hA = mk(this.geo.wp_cap_half, C.capR, 0.09, 0.3), hB = mk(this.geo.wp_cap_half, C.capW, 0.09, 0.2); e.g.remove(hA); e.g.remove(hB); cap.add(hA, hB); hB.scale.y = -0.09; e.g.add(cap);
    items.push({ m: cap, mats: [hA.material, hB.material], off: [-1.05, 0.55], col: [C.white, C.red], spin: (m, t, dive) => m.rotation.set(0.6, 0, t * (dive ? 30 : 4)), trail: this.spr(e, 0, C.gold, C.red, 5) });
    const amp = mk(this.geo.wp_ampoule, C.ice, 0.2, 0.3); items.push({ m: amp, mats: [amp.material], off: [1.05, 0.55], col: [C.white, C.iceB], spin: (m, t, dive) => m.rotation.set(dive ? Math.PI : 0.3 * Math.sin(t * 3), 0, dive ? 0 : 0.2), trail: this.spr(e, 0, C.ice, C.iceB, 5) });
    const tab = this.solid(e, this.geo.wp_tablet, { tint: C.gold, spec: 0.9 }); tab.scale.setScalar(0.14); tab.material.uniforms.uGlow.value = 0.25; items.push({ m: tab, mats: [tab.material], off: [0, 1.5], col: [C.white, C.goldB], spin: (m, t, dive) => m.rotation.set(dive ? 0 : 0.5, t * 2, 0), trail: this.spr(e, 0, C.gold, C.goldB, 5) });
    const lines = [0, 1, 2].map(() => this.spr(e, 2, C.white, C.gold, 4));
    const done = (i) => { const q = items[i]; q.done = true; q.m.visible = false; q.trail.visible = false; };
    return this._h(e, {
      hit: (i, pos, ok) => { done(i); const p = P3({ x: pos.x, y: (pos.y || 0) + Math.min(1.2, 0.45 + (pos.r || 0.5) * 0.7), z: pos.z }), q = items[i]; if (ok) { this.flash(p, q.col[0], q.col[1], 0.85, 0.12, 1.2); if (!low) this.sparkle(p, 3, q.col[1]); } },
      fizzle: (i) => { const q = items[i]; if (q && !q.done) { this.flash(q.m.position.clone(), C.white, C.silver, 0.3, 0.1, 0.6); done(i); } },
      compound: (pos, r) => { const p = P3(pos); this.groundRing(p, r, C.white, C.gold, 0.36, 1.6); this.groundRing(p, r * 0.7, C.white, C.red, 0.3, 0.9); this.groundRing(p, r * 0.45, C.white, C.iceB, 0.26, 0.9); this.flash(_a.copy(p).setY(p.y + 0.8), C.white, C.gold, 1.6, 0.16, 1.0); if (!low) this.shards(_a.copy(p).setY(p.y + 0.6), 6, C.gold); },
      end: () => {},
    });
  }

  // ------------------------------------------------------------------ A5 대형 캡슐 붕괴 (궁극기)
  collapse(pc, o) {
    if (!this._ok()) return null; const C = WPFX.col, K = WPFX.collapse, low = lite(), at = P3(o.at), T = o.contact, S = K.size, H = K.h, NG = low ? K.granulesLite : K.granules;
    const gr = []; let hit = -1;
    const e = this._fx('collapse', T + 0.9, (e) => {
      const t = e.t, appear = smooth(0, 0.28, t), open = smooth(0.5, 0.74, t), fade = hit < 0 ? 1 : 1 - smooth(hit, hit + 0.4, t);
      g.position.copy(at).setY(at.y + H); g.rotation.set(0, t * 0.6, Math.PI / 2); g.scale.setScalar(0.6 + 0.4 * appear);
      hA.position.set(0, 0.06 + open * 1.1, 0); hB.position.set(0, -0.06 - open * 1.1, 0); hA.rotation.z = open * 0.5; hB.rotation.z = -open * 0.5;
      for (const h of [hA, hB]) h.material.uniforms.uA.value = appear * fade * 0.85;
      // granules spiral into the core (0.1 .. 0.5)
      const ck = smooth(0.1, 0.52, t);
      gr.forEach((q, i) => { const k = smooth(q.d, q.d + 0.32, t), a = q.a + t * 6 * (1 - k), rr = (1 - k) * 1.3; q.m.position.set(at.x + Math.cos(a) * rr, at.y + H + Math.sin(a * 1.3) * 0.25 * (1 - k), at.z + Math.sin(a) * rr); q.m.material.uniforms.uA.value = (1 - smooth(q.d + 0.28, q.d + 0.34, t)) * smooth(0.05, 0.12, t); });
      // core: forms, then falls after the halves open (accelerating), stops on the ground at T
      const fall = easeIn(smooth(0.74, T, t)), cy = at.y + H - (H - 0.35) * fall;
      core.position.set(at.x, cy, at.z); core.scale.setScalar(0.1 + 0.22 * ck); core.visible = hit < 0; core.material.uniforms.uGlow.value = 0.2 + 0.4 * ck;   // 핵의 모양이 보이게(하얗게 날리지 않게)
      halo.position.copy(core.position); halo.quaternion.copy(this.camQ); halo.scale.setScalar(0.7 + 0.6 * ck); halo.material.uniforms.uA.value = hit < 0 ? 0.5 * ck : 0;
      if (hit < 0 && t > 0.74) { this.seg(streak, core.position, _a.copy(core.position).setY(Math.min(at.y + H, core.position.y + 1.2 * fall + 0.2)), 0.22); streak.visible = true; streak.material.uniforms.uA.value = 0.9; } else streak.visible = false;
      for (const s of spikes) { const k = hit < 0 ? 0 : smooth(hit, hit + 0.1, t) * (1 - smooth(hit + 0.45, hit + 0.75, t)); s.m.scale.set(s.s * 0.8, s.s * k, s.s * 0.8); s.m.material.uniforms.uA.value = k; }
    });
    const g = new THREE.Group(); e.g.add(g);
    const hA = this.glassM(e, this.geo.wp_cap_half, { tint: C.glass, op: 0.18, rim: C.ice, glow: 0.05 }), hB = this.glassM(e, this.geo.wp_cap_half, { tint: C.glass, op: 0.18, rim: C.ice, glow: 0.05 });
    for (const [h, sg] of [[hA, 1], [hB, -1]]) { e.g.remove(h); g.add(h); h.scale.set(S, S * sg, S); }
    for (let i = 0; i < NG; i++) { const m = this.solid(e, this.geo.wp_granule, { tint: i % 3 ? C.ice : C.gold, spec: 0.8 }); m.material.uniforms.uGlow.value = 0.5; m.scale.setScalar(0.07); gr.push({ m, a: i / NG * Math.PI * 2, d: 0.08 + 0.3 * (i / NG) }); }
    const core = this.solid(e, this.geo.wp_granule, { tint: 0x7ec8ff, spec: 1 }), halo = this.spr(e, 0, C.white, C.iceB, 5), streak = this.spr(e, 2, C.white, C.ice, 5);
    const spikes = []; const NS = low ? K.spikesLite : K.spikes;
    for (let i = 0; i < NS; i++) { const a = i / NS * Math.PI * 2 + 0.3, rr = o.r * 0.62; const m = this.glassM(e, this.geo.wp_crystal, { tint: C.ice, op: 0.6, glow: 0.3, order: 4 }); m.position.set(at.x + Math.cos(a) * rr, at.y, at.z + Math.sin(a) * rr); m.rotation.set(Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35); m.scale.setScalar(0.001); spikes.push({ m, s: rnd(0.6, 0.95) }); }
    return this._h(e, { impact: () => {
      hit = e.t; const p = at.clone();
      const w = this._fx('shock', 0.45, (w) => { const k = w.t / 0.45; m.material.uniforms.uP.value = 0.1 + 0.9 * easeOut(k); m.material.uniforms.uA.value = 1.8 * (1 - smooth(0.4, 1, k)); m2.material.uniforms.uP.value = 0.05 + 0.75 * easeOut(k); m2.material.uniforms.uA.value = 1.0 * (1 - k); });
      w.g.position.copy(p).setY(p.y + 0.07); const m = this.disc(w, 2, C.white, C.iceB, true, 3); m.scale.set(o.r * 2, o.r * 2, 1); const m2 = this.disc(w, 2, C.white, C.teal, true, 3); m2.scale.set(o.r * 2, o.r * 2, 1);
      this.flash(_a.copy(p).setY(p.y + 0.5), C.white, C.iceB, 2.0, 0.14, 0.9);
      this.shards(_a.copy(p).setY(p.y + 0.4), low ? K.shardsLite : K.shards, C.ice, { speed: [2.5, 5], up: [2, 4], ground: p.y + 0.02, size: [0.1, 0.2] });
      if (!low) this._puffs(p, 5, o.r * 0.7, { c1: 0xeaf6ff, c2: 0x8ab0d0, a: 0.32, life: 0.6 });
    } });
  }

  // ------------------------------------------------------------------ B1 촉매 활성화
  catalyst(pc, o) {
    if (!this._ok()) return null; const C = WPFX.col, n = o.n || 3, amps = []; let endT = -1;
    const e = this._fx('catalyst', (o.dur || 12) + 0.4, (e, dt) => {
      if (pc.dead) e.t = e.life;
      if (endT >= 0) endT += dt;
      const p = P3(pc.pos), f = _a.set(pc.facing.x, 0, -pc.facing.z).normalize(), side = _b.crossVectors(f, UP).normalize();
      amps.forEach((q, i) => {
        if (q.gone) return; const a = (i - (n - 1) / 2) * 0.55;
        q.m.position.copy(p).addScaledVector(f, -0.32).addScaledVector(side, Math.sin(a) * 0.55 + Math.sin(e.t * 2 + i) * 0.03); q.m.position.y += 1.62 + Math.cos(a) * 0.15 + Math.sin(e.t * 2.4 + i) * 0.04;
        q.m.rotation.set(0.2, e.t * 1.5 + i, a * 0.6); const fade = endT >= 0 ? 1 - smooth(0, 0.3, endT) : smooth(0, 0.2, e.t);
        q.m.material.uniforms.uA.value = fade; q.m.material.uniforms.uGlow.value = 0.25 + (q.lit ? 1.6 * (1 - smooth(0, 0.35, e.t - q.lit)) : 0);
        if (q.lit && e.t - q.lit > 0.35) { q.gone = true; q.m.visible = false; }
      });
      if (endT > 0.35) e.t = e.life;
    });
    for (let i = 0; i < n; i++) { const m = this.glassM(e, this.geo.wp_ampoule, { tint: C.gold, op: 0.75, glow: 0.25, order: 4 }); m.scale.setScalar(0.13); amps.push({ m, lit: 0, gone: false }); }
    return this._h(e, {
      fire: (left) => { const q = amps[n - 1 - left]; if (!q) return; q.lit = e.t; const p = q.m.position.clone(), f = _a.set(pc.facing.x, 0, -pc.facing.z).normalize();
        this.flash(p, C.white, C.gold, 0.5, 0.14, 1.2); if (this.geo.wp_granule) this._bits(p, lite() ? 3 : 7, { geo: this.geo.wp_granule, tint: C.gold, size: [0.02, 0.04], speed: [1.5, 3], up: [0.2, 1.2], ground: p.y - 2, life: 0.45 }); void f; },
      spent: () => { endT = 0; },
    });
  }

  // ------------------------------------------------------------------ B2 정밀 표적 전달
  carrier(pc, o) {
    if (!this._ok() || !o.tgt) return null; const C = WPFX.col, t = o.tgt, from = P3(o.from); let pulse = 0, endT = -1;
    const e = this._fx('carrier', 1e9, (e, dt) => {
      if (endT >= 0) { endT += dt; if (endT > 0.25) e.t = e.life; }
      if (t.dead || t.removed) { if (endT < 0) endT = 0; }
      pulse = Math.max(0, pulse - dt);
      const tp = P3(t.pos), R = (t.radius || 0.5) + 0.62, k = clamp01(e.t / o.fly), a = e.t * 1.2;
      _d.copy(tp).add(_a.set(Math.cos(a) * ((t.radius || 0.5) + 0.12), mid(t) + 0.15, Math.sin(a) * ((t.radius || 0.5) + 0.12)));
      if (k < 1) { _c.copy(from).lerp(_d, 0.5); _c.y += 0.9; bez(sph.position, from, _c, _d, easeOut(k)); } else sph.position.copy(_d);
      const fade = endT >= 0 ? 1 - endT / 0.25 : 1;
      sph.material.uniforms.uA.value = fade; sph.material.uniforms.uGlow.value = 0.2 + 0.8 * pulse / 0.3;
      core.position.copy(sph.position); core.quaternion.copy(this.camQ); core.scale.setScalar(0.22 + 0.15 * Math.sin(e.t * 4)); core.material.uniforms.uA.value = 0.9 * fade;
      ring.position.copy(tp).setY(tp.y + 0.07); ring.scale.setScalar(R * 2 * (1 + 0.15 * pulse / 0.3)); ring.material.uniforms.uA.value = (k >= 1 ? 0.9 : 0) * fade; ring.rotation.set(-Math.PI / 2, 0, e.t * 0.5);
    });
    const sph = this.glassM(e, this.geo.wp_granule, { tint: C.teal, op: 0.4, rim: C.white, glow: 0.2, order: 4 }); sph.scale.setScalar(0.13);
    const core = this.spr(e, 0, C.white, C.teal, 5);
    const ring = this.spr(e, 1, C.white, C.white, 3); ring.material.uniforms.uP.value = 0;
    return this._h(e, { refresh: () => { pulse = 0.3; }, dispose: () => { if (endT < 0) endT = 0; } });
  }

  // ------------------------------------------------------------------ B3 연쇄 용출
  chain(pc, o) {
    if (!this._ok()) return null; const C = WPFX.col, low = lite();
    const e = this._fx('chain', 6, () => {}); const self = this;
    const stream = (A, getB, dur, n, arc) => {
      const parts = []; const s = this._fx('stream', dur + 0.05, (s) => { const k = clamp01(s.t / dur);
        const B = getB(); parts.forEach((q, i) => { const kk = clamp01(k * 1.15 - i * 0.05); _c.copy(A).lerp(B, 0.5).add(q.off); bez(q.m.position, A, _c, B, easeIn(kk * 0.5 + 0.5 * kk * kk)); q.m.material.uniforms.uA.value = 1 - smooth(0.92, 1, kk); }); });
      for (let i = 0; i < n; i++) { const m = self.solid(s, self.geo.wp_granule, { tint: C.teal, spec: 0.6 }); m.material.uniforms.uGlow.value = 0.8; m.scale.setScalar(0.045); parts.push({ m, off: new THREE.Vector3(rnd(-arc, arc), arc * rnd(0.8, 1.5), rnd(-arc, arc)) }); }
    };
    if (o.tgt) { const t = o.tgt; stream(P3(o.from), () => P3({ x: t.pos.x, y: (t.pos.y || 0) + mid(t), z: t.pos.z }), o.first, low ? 2 : 4, 0.5); }
    return this._h(e, {
      burst: (depth, pos, n, r) => { const p = P3({ x: pos.x, y: (pos.y || 0) + Math.min(1.2, 0.45 + (pos.r || 0.5) * 0.7), z: pos.z }), g = P3(pos);
        this.flash(p, C.white, n > 0 ? C.teal : C.silver, 0.7 + 0.25 * n, 0.14, 1.0 + 0.2 * n); this.groundRing(g, r, C.white, C.teal, 0.3, 0.6 + 0.35 * n);
        if (!low) this.sparkle(p, 2 + 2 * n, C.teal); },
      link: (depth, from, to, hop) => { stream(P3({ x: from.x, y: (from.y || 0) + 0.9, z: from.z }), () => P3({ x: to.pos.x, y: (to.pos.y || 0) + mid(to), z: to.pos.z }), hop, low ? 2 : 3, 0.9); },
      fizzle: () => {},
    });
  }

  // ------------------------------------------------------------------ B4 서방형 미립자 지대
  zone(pos, o) {
    if (!this._ok()) return null; const C = WPFX.col, low = lite(), N = low ? WPFX.zone.granulesLite : WPFX.zone.granules, at = P3(pos), r = o.r; let left = 1, pulse = 0, endT = -1;
    const gr = [];
    const e = this._fx('zone', 1e9, (e, dt) => {
      if (endT >= 0) { endT += dt; if (endT > 0.3) e.t = e.life; }
      pulse = Math.max(0, pulse - dt); const fade = (endT >= 0 ? 1 - endT / 0.3 : 1) * smooth(0, 0.15, e.t);
      floor.material.uniforms.uA.value = fade * (0.55 + 0.45 * left); floor.material.uniforms.uT.value = e.t;
      const vis = Math.ceil(N * left - 1e-6);
      gr.forEach((q, i) => { q.m.visible = i < vis; q.m.position.set(at.x + q.x, at.y + 0.08 + 0.06 * Math.abs(Math.sin(e.t * 2.2 + q.ph)) + 0.25 * pulse / 0.3 * q.j, at.z + q.z); q.m.material.uniforms.uA.value = fade; q.m.material.uniforms.uGlow.value = 0.5 + 1.5 * pulse / 0.3; });
    });
    const floor = this.disc(e, 1, C.white, C.tealB); floor.position.copy(at).setY(at.y + 0.03); floor.scale.set(r * 2, r * 2, 1);
    for (let i = 0; i < N; i++) { const a = rnd(0, Math.PI * 2), rr = Math.sqrt(Math.random()) * r * 0.85, m = this.solid(e, this.geo.wp_granule, { tint: i % 3 ? C.teal : C.gold, spec: 0.6 }); m.scale.setScalar(0.04 + 0.02 * Math.random()); gr.push({ m, x: Math.cos(a) * rr, z: Math.sin(a) * rr, ph: rnd(0, 6), j: rnd(0.5, 1) }); }
    return this._h(e, { setLeft: (k) => { left = clamp01(k); }, pulse: () => { pulse = 0.3; }, refresh: () => { left = 1; pulse = 0.3; }, end: () => { if (endT < 0) endT = 0; }, dispose: () => { if (endT < 0) endT = 0; } });
  }

  // ------------------------------------------------------------------ B5 임계 농도 (궁극기)
  critical(pos, o) {
    if (!this._ok()) return null; const C = WPFX.col, low = lite(), at = P3(pos), H = 2.0; let size = 0.35, used = 0, cap = 9, burst = -1; const beams = [];
    const e = this._fx('critical', o.burst + 0.8, (e, dt) => {
      const t = e.t, appear = smooth(0, 0.25, t), fade = burst < 0 ? 1 : 1 - smooth(burst, burst + 0.2, t);
      sph.position.copy(at).setY(at.y + H); sph.scale.setScalar((0.55 + 0.25 * size) * (0.7 + 0.3 * appear) * (burst < 0 ? 1 : 1 + 0.6 * smooth(burst, burst + 0.2, t))); sph.material.uniforms.uA.value = appear * fade;
      const grow = smooth(o.snap + 0.05, o.burst - 0.18, t), sz = 0.2 + size * grow;
      cr.position.copy(at).setY(at.y + H - sz * 0.45); cr.scale.set(sz * 0.9, sz, sz * 0.9); cr.rotation.y = t * 1.5; cr.material.uniforms.uA.value = fade * smooth(o.snap, o.snap + 0.1, t); cr.material.uniforms.uGlow.value = 0.3 + 1.4 * grow;
      for (const b of beams) { const k = clamp01((t - b.t0) / 0.3); _d.copy(b.p).lerp(sph.position, easeOut(k)); this.seg(b.m, b.p, _d, 0.06); b.m.material.uniforms.uA.value = 1.4 * (1 - smooth(0.6, 1, (t - b.t0) / 0.5)) * (burst < 0 ? 1 : 0); }
    });
    const sph = this.glassM(e, this.geo.wp_sphere, { tint: C.glass, op: 0.06, rim: C.ice, order: 4 });
    const cr = this.glassM(e, this.geo.wp_crystal, { tint: C.ice, op: 0.75, glow: 0.3, order: 5 });
    return this._h(e, {
      charge: (src, u, c) => { used = u; cap = c || 9; size = 0.35 + 0.95 * used / cap; const B = low ? 6 : 12;
        src.slice(0, B).forEach((s) => { const m = this.spr(e, 2, C.white, C.teal, 5); beams.push({ m, p: P3({ x: s.x, y: (s.y || 0) + s.h, z: s.z }), t0: e.t }); });
        for (const s of src) this.flash(P3({ x: s.x, y: (s.y || 0) + s.h, z: s.z }), C.white, C.teal, 0.4 + 0.12 * s.n, 0.12, 1.0); },
      burst: (u) => { burst = e.t; const top = at.clone().setY(at.y + H), R = o.r;
        const w = this._fx('shock', 0.5, (w) => { const k = w.t / 0.5; m.material.uniforms.uP.value = 0.08 + 0.92 * easeOut(k); m.material.uniforms.uA.value = (1.4 + 0.08 * u) * (1 - smooth(0.4, 1, k)); });
        w.g.position.copy(at).setY(at.y + 0.08); const m = this.disc(w, 2, C.white, C.iceB, true, 3); m.scale.set(R * 2, R * 2, 1);
        this.flash(top, C.white, C.iceB, 1.2 + 0.12 * u, 0.16, 0.9); this.shards(top, (low ? 4 : 8) + Math.min(8, u), C.ice, { ground: at.y + 0.02, speed: [2, 4.5] }); },
    });
  }

  // ------------------------------------------------------------------ C3 생체 회복 분무
  spray(pos, o) {
    if (!this._ok()) return null; const C = WPFX.col, low = lite(), N = low ? 4 : 6, pc = o.follow, dur = o.dur || 6, amps = [], mists = []; let endT = -1;
    const e = this._fx('spray', dur + 0.5, (e, dt) => {
      if (endT >= 0) { endT += dt; if (endT > 0.4) e.t = e.life; }
      const fade = (endT >= 0 ? 1 - endT / 0.4 : 1) * (1 - smooth(dur - 0.4, dur, e.t)), open = easeOut(smooth(0, 0.35, e.t)), c = P3(pc && !pc.dead ? pc.pos : pos);
      amps.forEach((q, i) => { const a = q.a + e.t * 0.5, rr = 0.25 + 0.75 * open; q.m.position.set(c.x + Math.cos(a) * rr, c.y + 1.25 + Math.sin(e.t * 2 + i) * 0.05, c.z + Math.sin(a) * rr);
        q.m.rotation.set(0, -a, Math.PI / 2 + 0.5); q.m.material.uniforms.uA.value = fade; });
      for (const s of mists) { s.k += dt / s.life; if (s.k >= 1) { s.k = 0; s.a = rnd(0, Math.PI * 2); } const rr = (1 - s.k) * (o.r * 0.85), y = 0.2 + 1.0 * (1 - s.k);
        s.m.position.set(c.x + Math.cos(s.a) * rr, c.y + y, c.z + Math.sin(s.a) * rr); s.m.quaternion.copy(this.camQ); s.m.scale.setScalar(0.5 + 0.4 * (1 - s.k)); s.m.material.uniforms.uA.value = 0.16 * fade * smooth(0, 0.2, s.k) * (1 - smooth(0.7, 1, s.k)); }
      ring.position.copy(c).setY(c.y + 0.05); ring.material.uniforms.uA.value = 0.5 * fade;
    });
    for (let i = 0; i < N; i++) { const m = this.glassM(e, this.geo.wp_ampoule, { tint: C.teal, op: 0.7, glow: 0.3, order: 4 }); m.scale.setScalar(0.17); amps.push({ m, a: i / N * Math.PI * 2 }); }
    for (let i = 0; i < (low ? 4 : 9); i++) mists.push({ m: this.puff(e, 0xc8fff0, C.tealB, 4), k: i / 9, a: rnd(0, 6.28), life: rnd(1.0, 1.4) });
    const ring = this.disc(e, 1, C.white, C.tealB); ring.scale.set(o.r * 2, o.r * 2, 1);
    return this._h(e, {
      pulse: (t) => { if (!t || !t.pos) return; const p = P3(t.pos); this.groundRing(p, Math.min(1.2, (t.radius || 0.5) + 0.6), C.white, C.teal, 0.3, 1.0);
        if (this.geo.wp_granule) { const pp = p.clone().setY(p.y + 0.3); this._bits(pp, low ? 2 : 4, { geo: this.geo.wp_granule, tint: C.teal, size: [0.025, 0.04], speed: [0.1, 0.4], up: [1.6, 2.6], ground: p.y - 5, life: 0.55 }); } },
      end: () => { if (endT < 0) endT = 0; },
    });
  }

  // ------------------------------------------------------------------ C4 다층 코팅막: 실제 보호막 비율 -> 겹 수
  coat(pc, o) {
    if (!this._ok()) return null; const C = WPFX.col, init = Math.max(1, o.initial || pc.shield || 1), sh = []; let last = pc.shield, rip = [];
    const e = this._fx('coat', (o.dur || 8) + 0.5, (e, dt) => {
      if (pc.dead) e.t = e.life;
      const frac = clamp01(pc.shield / init), want = pc.shield > 0.5 && (pc.shieldT == null || pc.shieldT > 0) ? Math.ceil(3 * frac - 1e-6) : 0, p = P3(pc.pos);
      sh.forEach((s, i) => {
        const formed = smooth(i * 0.1, i * 0.1 + 0.18, e.t), alive = i < want;
        if (!alive && s.peel < 0) s.peel = 0; if (s.peel >= 0) s.peel += dt;
        const pk = s.peel >= 0 ? smooth(0, 0.28, s.peel) : 0;
        s.m.position.copy(p).setY(p.y + 0.92); const k = s.k * (1 + 0.25 * pk) * (0.85 + 0.15 * formed);
        s.m.scale.set(0.62 * k, 1.0 * k, 0.62 * k); s.m.rotation.y = e.t * (0.3 + i * 0.2);
        s.m.material.uniforms.uA.value = formed * (1 - pk) * 0.85;
      });
      if (pc.shield < last - 0.5 && want > 0) {   // absorbed a hit: ripple on the outer layer toward the nearest enemy
        const G = window.G, z = G && G.zone; let best = null, bd = 6; if (z) for (const m of z.actors) { if (m.dead || m.faction === 'player' || m.isSummon) continue; const d = Math.hypot(m.pos.x - pc.pos.x, m.pos.z - pc.pos.z); if (d < bd) { bd = d; best = m; } }
        const dx = best ? best.pos.x - pc.pos.x : pc.facing.x, dz = best ? best.pos.z - pc.pos.z : pc.facing.z, mm = Math.hypot(dx, dz) || 1, R = 0.62 * sh[Math.max(0, want - 1)].k;
        const rp = p.clone().add(_a.set(dx / mm * R, 0.95, -dz / mm * R)); this.flash(rp, C.white, C.ice, 0.55, 0.16, 1.0);
      }
      last = pc.shield;
      if (e.t > 0.4 && want === 0 && sh.every(s => s.peel > 0.3)) e.t = e.life;
    });
    for (let i = 0; i < 3; i++) { const m = this.glassM(e, this.geo.wp_sphere, { tint: [C.ice, C.teal, C.white][i], op: 0.03, rim: [C.ice, C.teal, C.iceB][i], order: 3 + i }); sh.push({ m, k: 1 + i * 0.13, peel: -1 }); }
    void rip; return this._h(e);
  }

  // ------------------------------------------------------------------ C5 최종 처방·생명 유지
  lastrx(pc, o) {
    if (!this._ok()) return null; const C = WPFX.col, dur = o.dur || 5, NT = 14;
    const e = this._fx('lastrx', dur, (e) => {
      const p = P3(pc.pos), t = e.t, br = smooth(0.1, 0.22, t);
      g.position.copy(p).setY(p.y + 1.05); g.rotation.set(0, t * 3, Math.PI / 2);
      hA.position.set(0, 0.02 + br * 0.5, 0); hB.position.set(0, -0.02 - br * 0.5, 0); for (const h of [hA, hB]) h.material.uniforms.uA.value = smooth(0, 0.06, t) * (1 - smooth(0.25, 0.45, t));
      const wk = smooth(0.15, 0.8, t), pts = [];   // gold liquid spiral wrapping the body
      for (let i = 0; i < NT; i++) { const k = i / (NT - 1), a = k * 9 + t * 6, y = 0.1 + 1.5 * clamp01(wk * 1.2 - k * 0.6); pts.push(new THREE.Vector3(p.x + Math.cos(a) * 0.48, p.y + y, p.z + Math.sin(a) * 0.48)); }
      this._ribbonSet(rib, pts, 0.06); rib.material.uniforms.uA.value = 1.2 * smooth(0.15, 0.25, t) * (1 - smooth(0.9, 1.3, t));
      layer.position.copy(p).setY(p.y + 0.92); const lk = smooth(0.6, 0.9, t); layer.scale.set(0.66 * (0.9 + 0.1 * lk), 1.05, 0.66 * (0.9 + 0.1 * lk)); layer.material.uniforms.uA.value = lk * (1 - smooth(dur - 0.5, dur, t)) * 0.9;
    });
    const g = new THREE.Group(); e.g.add(g);
    const hA = this.glassM(e, this.geo.wp_cap_half, { tint: C.gold, op: 0.9, glow: 0.4 }), hB = this.glassM(e, this.geo.wp_cap_half, { tint: C.capW, op: 0.9, glow: 0.3 });
    for (const [h, sg] of [[hA, 1], [hB, -1]]) { e.g.remove(h); g.add(h); h.scale.set(0.1, 0.1 * sg, 0.1); }
    const rib = this._ribbon(e, NT); rib.material.uniforms.uW.value.setHex(C.white); rib.material.uniforms.uB.value.setHex(C.gold);
    const layer = this.glassM(e, this.geo.wp_sphere, { tint: C.white, op: 0.04, rim: C.ice, order: 4 });
    this.flash(P3(pc.pos).setY((pc.pos.y || 0) + 1.05), C.white, C.gold, 1.0, 0.16, 1.2);
    return this._h(e);
  }

  // ------------------------------------------------------------------ C1·C2 제작 완성 / 서방형 캡슐 사용
  made(pc, o) {
    if (!this._ok()) return null; const C = WPFX.col, low = lite();
    if (this._made && !this._made.dead) this._free(this._made);   // 연속 제작: 하나만(새로 시작)
    const vial = o.kind === 'vial', imp = [], gr = [];
    const e = this._made = this._fx('made', 1.5, (e) => {
      const t = e.t, p = P3(pc.pos), y = p.y + 2.35 + 0.35 * smooth(0.9, 1.5, t), fade = smooth(0, 0.1, t) * (1 - smooth(1.2, 1.5, t));
      if (vial) {
        body.position.set(p.x, y, p.z); body.scale.setScalar(0.42); body.rotation.y = t * 1.2; body.material.uniforms.uA.value = fade;
        liq.position.set(p.x, y, p.z); const fk = smooth(0.05, 0.55, t); liq.scale.set(0.36, 0.42 * 0.68 * fk + 0.001, 0.36); liq.rotation.y = t * 1.2; liq.material.uniforms.uA.value = fade; liq.material.uniforms.uGlow.value = 0.3 + 0.8 * smooth(0.5, 0.75, t);
        imp.forEach((q, i) => { const k = smooth(0.25 + i * 0.06, 0.75 + i * 0.06, t); q.m.position.set(p.x + q.x, y + 0.1 - k * 0.9, p.z + q.z); q.m.material.uniforms.uA.value = (1 - k) * fade; });
      } else {
        g.position.set(p.x, y, p.z); g.rotation.set(0, t * 1.2, 0.25); const seal = smooth(0.5, 0.7, t);
        hA.position.set(0, 0.3 * (1 - seal), 0); for (const h of [hA, hB]) h.material.uniforms.uA.value = fade;
        gr.forEach((q, i) => { const k = smooth(0.05 + i * 0.05, 0.3 + i * 0.05, t); q.m.position.set(p.x + q.x, y + 0.5 * (1 - k) - 0.06 + q.y, p.z + q.z); q.m.material.uniforms.uA.value = fade; });
      }
      if (t > 0.75 && !e.spark) { e.spark = true; this.flash(_a.set(p.x, y, p.z), C.white, vial ? C.teal : C.gold, 0.8, 0.18, 1.2); if (!low) this.sparkle(_a.set(p.x, y, p.z), 5, vial ? C.teal : C.gold, { up: [0.4, 1.2], speed: [0.4, 1.0] }); }
    });
    let body, liq, g, hA, hB;
    if (vial) { body = this.glassM(e, this.geo.wp_vial, { tint: C.glass, op: 0.25, rim: C.white, order: 5 }); liq = this.solid(e, this.geo.wp_vial, { tint: C.teal, spec: 0.5 });
      for (let i = 0; i < (low ? 3 : 5); i++) { const m = this.solid(e, this.geo.wp_granule, { tint: 0x5a4a3a, spec: 0 }); m.scale.setScalar(0.025); imp.push({ m, x: rnd(-0.08, 0.08), z: rnd(-0.08, 0.08) }); } }
    else { g = new THREE.Group(); e.g.add(g); hA = this.glassM(e, this.geo.wp_cap_half, { tint: C.teal, op: 0.4, glow: 0.2 }); hB = this.glassM(e, this.geo.wp_cap_half, { tint: C.capW, op: 0.4, glow: 0.1 });
      for (const [h, sg] of [[hA, 1], [hB, -1]]) { e.g.remove(h); g.add(h); h.scale.set(0.12, 0.12 * sg, 0.12); }
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
      if (want < shown) { for (let i = want; i < shown; i++) { const q = gr[i]; this.flash(q.m.position.clone(), C.white, o.status === 'regen' ? C.teal : C.iceB, 0.3, 0.14, 1.2); } shown = want; }
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
