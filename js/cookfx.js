// 요리사 1차 스킬 이펙트 (2026-11-13): 식칼 썰기 ck1_a1 · 팬 강타 ck1_a2 · 미트볼 던지기 ck1_b1.
// Meshes from tools/blender/fx_cook.py -> assets/fx/fx_cook.glb.json (vertex colours, no textures):
//   cook_knife (cleaver, edge y 0 down, length along x) / cook_pan (bottom y 0, rim radius 1, handle +x) / cook_meatball (radius 1)
//   cook_chip_a/b/c (carrot coin, green wedge, white cube) / cook_star (5-point, radius 1)
// Light sprites (flash, thin ring, slice line, puff) are drawn by one small procedural shader on a unit quad — no atlas.
// Kinds (js/skillrt.js FX.cook(kind, a, o)); every bright layer peaks on the real damage tick and nothing is drawn wider than
// the thing really hit (single target: the target's own footprint; meatball: its real blast radius):
//   knife(pc, {tgt, n, gap, first})   큰 식칼이 대상 머리 위에 나타나 `first` s 뒤부터 gap 간격으로 n번 내려 썬다(움직임만).
//                                      handle.strike(t, h, last) = 그 타의 실제 피해 순간(썬 자국 + 작은 섬광 + 튀는 조각), .miss() = 벨 대상이 없음 -> 칼이 물러남
//   pan(pc, {tgt, fall})               큰 프라이팬이 대상 위 공중에 나타나 fall s 뒤에 떨어짐. handle.land(t | null) = 실제 타격(고리·섬광·먼지·별) / 빗나감(옅은 먼지)
//   stun(t, {dur})                     기절 표시: 머리 위를 도는 별 3개, 기절이 풀리거나 대상이 죽으면 바로 사라짐
//   proj(pos, {})                      미트볼 하나(회전 + 짧은 김 꼬리); handle {set(pos, dir), dispose()}
//   splat(pos, {r, hit, top})          미트볼이 터짐: 작은 소스 섬광 + 얇은 고리(실제 반경 r) + 튀는 조각 + 낮은 김
// Pooled meshes (one material each); cleared on zone change. Low spec (phone / 그래픽 효과 끔): fewer chips, puffs and stars —
// the knife, the pan, the slice line, the ring and the flash stay. No global bloom / exposure / hit-stop is touched here.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const COOK = {
  intensity: 1.0,
  knife: { len: 1.25, hover: 0.85, dip: 0.22, yaw: 0.6, appear: 0.1, leave: 0.22, rock: 0.22, slide: 0.16, flash: 1.5, line: 2.2, lineLife: 0.16, chips: 3, chipsLite: 1 },
  pan: { height: 3.0, rest: 0.56, rMin: 0.85, rMax: 1.5, pad: 0.4, appear: 0.12, dropPart: 0.42, stay: 0.12, fade: 0.26, ring: 2.0, ringLife: 0.28, flash: 1.25, flashT: 0.07, stars: 5, starsLite: 3 },
  stun: { n: 3, r: 0.42, lift: 0.28, size: 0.24, spin: 5.0 },
  ball: { r: 0.2, spin: 11 },
  splat: { life: 0.42, ring: 0.85, flash: 1.3, bits: 5, bitsLite: 2 },
  col: { steel: 0xeaf4ff, steelB: 0xa8cfff, gold: 0xffd27a, goldB: 0xff9a2a, warm: 0xfff0d0, sauce: 0xff6a2a, sauceB: 0xb83210, dust1: 0xd8c8a8, dust2: 0x7a6a58, steam1: 0xfff4e6, steam2: 0xb89880 },
};

const P3 = (p) => new THREE.Vector3(p.x, p.y || 0, -p.z);
const lite = () => { const G = window.G; return !!(G && ((G.input && G.input.mobile) || (G.settings && G.settings.graphicsFx === false))); };
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const rnd = (a, b) => a + Math.random() * (b - a);
const UP = new THREE.Vector3(0, 1, 0);
/** top of a target above its feet (same idea as bashfx bashImpact: grows with the footprint, capped) */
export const cookTop = (t) => Math.min(1.7, 0.75 + (t.radius || 0.5) * 0.9);

const SOLID_VS = `
attribute vec3 color; varying vec3 vC, vN, vV;
void main(){ vC = color; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const SOLID_FS = `
uniform vec3 uTint, uRim; uniform float uA, uGlow, uSpec;
varying vec3 vC, vN, vV;
void main(){
  vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
  vec3 L = normalize(vec3(-.4, .8, .5));
  float d = max(0., dot(n, L)), rim = pow(1. - max(0., dot(n, vV)), 2.5);
  vec3 base = vC * uTint;
  vec3 c = base * (.46 + .74 * d) + uRim * rim * .55;
  vec3 h = reflect(-L, n); c += vec3(1., .96, .86) * pow(max(0., dot(h, vV)), 24.) * uSpec;
  c += vec3(1., .97, .9) * uGlow;
  gl_FragColor = vec4(c, uA);
}`;
const FLAT_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
// uK: 0 soft disc, 1 thin ring (uP = inner fade), 2 slice line (thin, tapered ends), 3 four-point star flash, 4 puff (alpha blended)
const SPR_FS = `
uniform vec3 uW, uB; uniform float uA, uK, uP; varying vec2 vUv;
void main(){
  vec2 p = vUv * 2. - 1.; float r = length(p), a = 0., core = 0.;
  if (uK < .5) { a = pow(clamp(1. - r, 0., 1.), 2.2); core = pow(clamp(1. - r * 1.6, 0., 1.), 2.); }
  else if (uK < 1.5) { float w = .045; a = smoothstep(1., 1. - w, r) * smoothstep(1. - w * 4.5, 1. - w, r); core = smoothstep(1. - w * 2.6, 1. - w, r) * smoothstep(1., 1. - w, r); a += uP * .16 * smoothstep(.2, .95, r) * step(r, .96); }
  else if (uK < 2.5) { float e = 1. - pow(abs(p.x), 2.4); a = clamp(e, 0., 1.) * exp(-abs(p.y) * 9.); core = clamp(e, 0., 1.) * exp(-abs(p.y) * 30.); }
  else if (uK < 3.5) { float s = exp(-abs(p.x) * 16.) * clamp(1. - abs(p.y), 0., 1.) + exp(-abs(p.y) * 16.) * clamp(1. - abs(p.x), 0., 1.); a = s + pow(clamp(1. - r, 0., 1.), 3.) * .9; core = pow(clamp(1. - r * 2.2, 0., 1.), 1.5) + s * .5; }
  else { a = pow(clamp(1. - r, 0., 1.), 1.4); core = clamp(.5 + p.y * .5, 0., 1.); gl_FragColor = vec4(mix(uB, uW, core), a * uA); return; }
  gl_FragColor = vec4(mix(uB, uW, clamp(core, 0., 1.)) * (a * uA), 1.);
}`;
const ADD = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide };

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _mx = new THREE.Matrix4();

export class CookFx {
  constructor(root) {
    this.root = root; this.live = []; this.ready = false; this.geo = {}; this.pool = {}; this.loading = null;
    this.camQ = new THREE.Quaternion(); this.toCam = new THREE.Vector3(0, 0.7, 0.7); this.camR = new THREE.Vector3(1, 0, 0);
    this.quad = new THREE.PlaneGeometry(1, 1);
  }
  load() {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const j = await (await fetch('assets/fx/fx_cook.glb.json')).json(), raw = atob(j.b64), u8 = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
      const g = await new Promise((res, rej) => new GLTFLoader().parse(u8.buffer, '', res, rej));
      g.scene.traverse(o => { if (o.isMesh) this.geo[o.name] = o.geometry; });
      this.chips = ['cook_chip_a', 'cook_chip_b', 'cook_chip_c'].map(n => this.geo[n]).filter(Boolean);
      this.ready = true;
    })().catch(e => console.warn('cookfx load', e));
    return this.loading;
  }
  _ok() { if (!this.ready) { this.load(); return false; } return true; }
  _mat(kind) {
    const U = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v }])), C = () => new THREE.Color(1, 1, 1);
    if (kind === 'solid') return new THREE.ShaderMaterial({ uniforms: U({ uTint: C(), uRim: new THREE.Color(0xfff0d0), uA: 1, uGlow: 0, uSpec: 0.6 }), vertexShader: SOLID_VS, fragmentShader: SOLID_FS, transparent: true, depthWrite: true, side: THREE.DoubleSide });
    if (kind === 'puff') return new THREE.ShaderMaterial({ uniforms: U({ uW: C(), uB: C(), uA: 0, uK: 4, uP: 0 }), vertexShader: FLAT_VS, fragmentShader: SPR_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    return new THREE.ShaderMaterial({ uniforms: U({ uW: C(), uB: C(), uA: 0, uK: 0, uP: 0 }), vertexShader: FLAT_VS, fragmentShader: SPR_FS, ...ADD });
  }
  _m(e, kind, geo, order = 4) {
    const p = this.pool[kind] || (this.pool[kind] = []); let m = p.pop();
    if (!m) { m = new THREE.Mesh(geo, this._mat(kind)); m.frustumCulled = false; m.userData.kind = kind; }
    m.geometry = geo; m.position.set(0, 0, 0); m.quaternion.identity(); m.scale.set(1, 1, 1); m.visible = true; m.renderOrder = order;
    e.items.push(m); e.g.add(m); return m;
  }
  solid(e, geo, o = {}) { const m = this._m(e, 'solid', geo, 1), u = m.material.uniforms; u.uTint.value.setHex(o.tint ?? 0xffffff); u.uRim.value.setHex(o.rim ?? 0xfff0d0); u.uA.value = o.a ?? 1; u.uGlow.value = 0; u.uSpec.value = o.spec ?? 0.6; return m; }
  /** additive sprite: k 0 disc / 1 ring / 2 slice line / 3 star flash */
  spr(e, k, w, b, order = 5) { const m = this._m(e, 'spr', this.quad, order), u = m.material.uniforms; u.uK.value = k; u.uP.value = 0; u.uW.value.setHex(w); u.uB.value.setHex(b); u.uA.value = 0; return m; }
  puff(e, w, b, order = 4) { const m = this._m(e, 'puff', this.quad, order), u = m.material.uniforms; u.uW.value.setHex(w); u.uB.value.setHex(b); u.uA.value = 0; return m; }
  _fx(kind, life, update) { const e = { kind, g: new THREE.Group(), items: [], t: 0, life, update }; this.root.add(e.g); this.live.push(e); return e; }
  /** flat on the ground (ring): quad in the xz plane */
  _flat(m, r, y = 0.07) { m.rotation.set(-Math.PI / 2, 0, 0); m.scale.set(r * 2, r * 2, 1); m.position.y = y; return m; }

  // ------------------------------------------------------------------ small shared bursts
  /** chips / bits thrown out of a point (three coords, world), with gravity; drawn as solid little meshes */
  _bits(at, n, o = {}) {
    if (n <= 0) return;
    const parts = [], gy = o.ground ?? (at.y - 1);
    const e = this._fx('bits', o.life || 0.5, (e, dt) => {
      const k = e.t / e.life;
      for (const p of parts) { p.v.y -= 11 * dt; p.m.position.addScaledVector(p.v, dt); if (p.m.position.y < gy + 0.03) { p.m.position.y = gy + 0.03; p.v.set(p.v.x * 0.3, 0, p.v.z * 0.3); }
        p.m.rotation.x += p.w * dt; p.m.rotation.z += p.w * 0.7 * dt; p.m.material.uniforms.uA.value = 1 - smooth(0.6, 1, k); }
    });
    for (let i = 0; i < n; i++) {
      const geo = o.geo || this.chips[(Math.random() * this.chips.length) | 0], m = this.solid(e, geo, { tint: o.tint ?? 0xffffff, spec: 0.3 }), s = rnd(o.size ? o.size[0] : 0.09, o.size ? o.size[1] : 0.15), a = rnd(0, Math.PI * 2), sp = rnd(o.speed ? o.speed[0] : 1.2, o.speed ? o.speed[1] : 2.4);
      m.scale.setScalar(s); m.position.copy(at); m.rotation.set(rnd(0, 6), rnd(0, 6), rnd(0, 6));
      parts.push({ m, v: new THREE.Vector3(Math.cos(a) * sp, rnd(o.up ? o.up[0] : 1.6, o.up ? o.up[1] : 3.0), Math.sin(a) * sp), w: rnd(-14, 14) });
    }
  }
  _puffs(at, n, r, o = {}) {
    if (n <= 0) return;
    const ps = [];
    const e = this._fx('puffs', o.life || 0.45, (e) => {
      const k = e.t / e.life;
      for (const p of ps) { p.m.quaternion.copy(this.camQ); p.m.position.copy(p.p0).addScaledVector(p.d, easeOut(k) * p.run).setY(p.p0.y + k * (o.rise ?? 0.25)); p.m.scale.setScalar(p.s * (0.6 + 0.9 * easeOut(k))); p.m.material.uniforms.uA.value = (o.a ?? 0.5) * smooth(0, 0.12, k) * (1 - smooth(0.35, 1, k)); }
    });
    for (let i = 0; i < n; i++) { const a = (i + rnd(-0.3, 0.3)) / n * Math.PI * 2, m = this.puff(e, o.c1 ?? COOK.col.dust1, o.c2 ?? COOK.col.dust2);
      ps.push({ m, d: new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), p0: at.clone().add(new THREE.Vector3(Math.cos(a) * r * 0.35, 0.12, Math.sin(a) * r * 0.35)), run: r * rnd(0.35, 0.6), s: rnd(0.35, 0.6) * Math.max(0.6, r) }); }
  }

  // ------------------------------------------------------------------ 식칼 썰기
  knife(pc, o = {}) {
    if (!this._ok() || !this.geo.cook_knife) return null;
    const K = COOK.knife, n = Math.max(1, o.n || 2), gap = o.gap || 0.12, first = Math.max(0.02, o.first ?? 0.22), I = COOK.intensity;
    let tgt = o.tgt || null, ended = -1, strikes = 0;
    const f = o.facing || { x: 0, z: 1 }, anchor = tgt ? P3(tgt.pos) : P3({ x: pc.pos.x + f.x * 1.3, y: pc.pos.y || 0, z: pc.pos.z + f.z * 1.3 });
    let top = tgt ? cookTop(tgt) : 0.9, rad = tgt ? (tgt.radius || 0.5) : 0.5;
    const total = first + (n - 1) * gap;
    const e = this._fx('knife', total + K.leave + 0.05, (e) => {
      if (tgt && !tgt.dead && !tgt.removed) { anchor.copy(P3(tgt.pos)); top = cookTop(tgt); rad = tgt.radius || 0.5; }
      const p = (e.t - first - shift) / gap, done = ended >= 0 ? ended : total + shift, out = e.t > done ? clamp01((e.t - done) / K.leave) : 0;
      // chop curve: up between the ticks, down ON every tick (p integer); after the last one it lifts away
      const fr = p < -1 ? 0.5 : p - Math.floor(p), up = e.t > done ? 0.25 + 0.75 * easeOut(out) : Math.pow(Math.sin(Math.PI * fr), 0.75);
      const idx = Math.max(0, Math.min(n - 1, Math.round(p))), step = Math.min(K.slide, rad * 1.5 / n), slide = (Math.max(-0.5, Math.min(n - 0.5, p)) - (n - 1) / 2) * step;
      // blade length: turned K.yaw from the camera's right so both the flat and the edge read; the cut advances along the blade normal
      _a.copy(this.camR).applyAxisAngle(UP, K.yaw); _b.crossVectors(UP, _a).normalize();           // _a = length dir (x of the mesh), _b = normal
      kn.position.copy(anchor).addScaledVector(_b, slide); kn.position.y = anchor.y + top - K.dip + (K.hover + K.dip) * up;
      _mx.makeBasis(_a, UP, _c.crossVectors(_a, UP)); kn.quaternion.setFromRotationMatrix(_mx);
      kn.rotateZ(K.rock * (up - 0.35));                                                               // tip dips into the cut, heel lifts between cuts
      const sc = K.len * Math.min(1.25, 0.8 + rad * 0.5) * (0.5 + 0.5 * easeOut(e.t / K.appear));
      kn.scale.setScalar(sc);
      const u = kn.material.uniforms; u.uA.value = smooth(0, K.appear, e.t) * (1 - out); u.uGlow.value = Math.max(0, glow) * 0.5; glow -= 6 * (e.dt || 0.016);
      gl.quaternion.copy(this.camQ); gl.position.copy(kn.position).setY(kn.position.y + 0.12 * sc); gl.scale.setScalar(sc * 1.1); gl.material.uniforms.uA.value = I * 0.22 * smooth(0, K.appear, e.t) * (1 - out);
      void idx;
    });
    let glow = 0.6, shift = 0;   // shift: the game clock stood still for a moment (critical-hit stop) -> the chops re-lock on the real damage ticks
    const kn = this.solid(e, this.geo.cook_knife, { rim: COOK.col.steelB, spec: 1.3 }), gl = this.spr(e, 0, COOK.col.steel, COOK.col.steelB, 3);
    kn.renderOrder = 6;
    const self = this;
    e.strike = (t, h, last) => {
      if (e.dead) return; strikes++;
      const sh = e.t - first - h * gap; if (Math.abs(sh - shift) > 0.02) { shift = sh; e.life = Math.max(e.life, total + shift + K.leave + 0.05); }
      if (t && t !== tgt) { tgt = t; anchor.copy(P3(t.pos)); top = cookTop(t); rad = t.radius || 0.5; }
      glow = last ? 1.4 : 0.9;
      const at = kn.position.clone(); at.y = anchor.y + top - K.dip * 0.5;
      // slice line along the blade + a small flash on the cut, both gone in ~0.16 s; chips fly out of the cut
      const dirL = _a.copy(self.camR).applyAxisAngle(UP, K.yaw).clone(), len = K.len * (last ? 1.15 : 0.9), lf = self._fx('slice', K.lineLife + (last ? 0.06 : 0), (x) => {
        const k = x.t / x.life; ln.material.uniforms.uA.value = I * K.line * (1 - smooth(0.15, 1, k)); ln.scale.set(len * (0.7 + 0.5 * easeOut(k)), 0.34, 1);
        fl.quaternion.copy(self.camQ); fl.scale.setScalar((last ? 0.8 : 0.55) * (0.6 + 0.6 * easeOut(k))); fl.material.uniforms.uA.value = I * K.flash * (1 - smooth(0.05, 0.7, k));
      });
      const ln = self.spr(lf, 2, 0xffffff, COOK.col.steelB, 7), fl = self.spr(lf, 3, 0xffffff, COOK.col.steel, 7);
      lf.g.position.copy(at); self._alignLine(ln, dirL);
      self._bits(at, (lite() ? K.chipsLite : K.chips) + (last && !lite() ? 2 : 0), { ground: anchor.y, life: 0.5 });
    };
    e.miss = () => { if (ended < 0) ended = e.t; e.life = Math.min(e.life, e.t + K.leave); };
    return e;
  }
  /** quad whose local x runs along dir and whose face turns to the camera as far as it can */
  _alignLine(m, dir) { const x = _a.copy(dir).normalize(), z = _b.copy(this.toCam).addScaledVector(x, -this.toCam.dot(x)); if (z.lengthSq() < 1e-6) z.set(0, 1, 0); z.normalize(); const y = _c.crossVectors(z, x); _mx.makeBasis(x, y, z); m.quaternion.setFromRotationMatrix(_mx); }

  // ------------------------------------------------------------------ 팬 강타
  pan(pc, o = {}) {
    if (!this._ok() || !this.geo.cook_pan) return null;
    const K = COOK.pan, I = COOK.intensity, fall = Math.max(0.12, o.fall || 0.3), f = o.facing || { x: 0, z: 1 };
    let tgt = o.tgt || null, landed = -1, hitT = null;
    const anchor = tgt ? P3(tgt.pos) : P3({ x: pc.pos.x + f.x * 1.4, y: pc.pos.y || 0, z: pc.pos.z + f.z * 1.4 });
    let top = tgt ? cookTop(tgt) : 0.25; const R = Math.max(K.rMin, Math.min(K.rMax, (tgt ? tgt.radius || 0.5 : 0.5) + K.pad));
    // handle points back to the caster (it is the cook's pan)
    const hd = _a.set(pc.pos.x, 0, -pc.pos.z).sub(_b.set(anchor.x, 0, anchor.z)); if (hd.lengthSq() < 1e-4) hd.set(-f.x, 0, f.z); hd.normalize(); const yaw = Math.atan2(-hd.z, hd.x);
    const dropAt = fall * (1 - K.dropPart);
    const e = this._fx('pan', fall + K.stay + K.fade + 0.2, (e) => {
      if (landed < 0 && tgt && !tgt.dead && !tgt.removed) { anchor.copy(P3(tgt.pos)); top = cookTop(tgt); }
      let y, a = 1, tilt = 0, sq = 1;
      if (landed < 0) {   // appear (scale in with a wobble), hang, then the fast drop: lowest exactly at `fall`
        const d = clamp01((e.t - dropAt) / (fall - dropAt)); y = top * K.rest + (K.height - top * K.rest) * (1 - d * d * d); a = smooth(0, K.appear, e.t); tilt = 0.32 * (1 - smooth(0, 0.8, d)) + 0.06 * Math.sin(e.t * 30) * (1 - d);
        if (e.t > fall + 0.12) { landed = e.t; hitT = null; }   // the hit never came (cast interrupted): just fade
      } else { const k = e.t - landed; y = (hitT ? top * K.rest : 0.06) + 0.22 * Math.sin(Math.min(1, k / 0.16) * Math.PI) * (hitT ? 1 : 0.4); sq = 1 + 0.12 * Math.max(0, 1 - k / 0.1); a = 1 - smooth(K.stay, K.stay + K.fade, k); if (k > K.stay + K.fade) e.t = e.life; }
      pn.position.copy(anchor).setY(anchor.y + y); pn.rotation.set(0, yaw, tilt, 'YXZ'); pn.scale.set(R * sq, R / sq * (landed < 0 ? 0.5 + 0.5 * easeOut(e.t / K.appear) : 1), R * sq);
      const u = pn.material.uniforms; u.uA.value = a; u.uGlow.value = landed < 0 ? 0.35 * (1 - smooth(0, K.appear * 1.5, e.t)) : 0.16 * Math.max(0, 1 - (e.t - landed) / 0.1);
      // soft warm glow where it appears + a growing shadow-ish target ring on the ground (thin, the pan's own size)
      gl.quaternion.copy(this.camQ); gl.position.copy(pn.position); gl.scale.setScalar(R * 2.6); gl.material.uniforms.uA.value = I * 0.5 * (landed < 0 ? 1 - smooth(0, K.appear * 2.2, e.t) : 0);
      this._flat(mk, R * (landed < 0 ? 0.6 + 0.4 * smooth(0, fall, e.t) : 1)); mk.position.copy(anchor).setY(anchor.y + 0.06); mk.material.uniforms.uA.value = landed < 0 ? I * 0.55 * smooth(0, fall * 0.6, e.t) : 0;
    });
    const pn = this.solid(e, this.geo.cook_pan, { rim: COOK.col.goldB, spec: 0.9 }), gl = this.spr(e, 0, COOK.col.warm, COOK.col.goldB, 3), mk = this.spr(e, 1, COOK.col.gold, COOK.col.goldB, 3);
    pn.renderOrder = 6;
    e.land = (t) => {
      if (e.dead || landed >= 0) return; landed = e.t; hitT = t || null;
      if (t) { anchor.copy(P3(t.pos)); top = cookTop(t); }
      const g0 = anchor.clone(), hp = anchor.clone().setY(anchor.y + top * K.rest), low = lite();
      if (!t) { this._puffs(g0, low ? 2 : 4, R, { a: 0.32, life: 0.4 }); return; }
      const fx = this._fx('panhit', K.ringLife + 0.1, (x) => {
        const k = x.t / K.ringLife; this._flat(rg, R * (0.55 + 0.45 * easeOut(k))); rg.material.uniforms.uA.value = I * K.ring * (1 - smooth(0.25, 1, k));
        fl.quaternion.copy(this.camQ); fl.scale.setScalar(R * 1.05 * (0.7 + 0.5 * easeOut(x.t / K.flashT))); fl.material.uniforms.uA.value = I * K.flash * (1 - smooth(0, K.flashT * 2.2, x.t));
      });
      const rg = this.spr(fx, 1, 0xfff6dc, COOK.col.gold, 3), fl = this.spr(fx, 3, 0xffffff, COOK.col.warm, 7); rg.material.uniforms.uP.value = 1;
      fx.g.position.copy(g0); fl.position.set(0, top * K.rest + 0.05, 0);
      this._puffs(g0, low ? 3 : 6, R, { a: 0.42, life: 0.42 });
      if (this.geo.cook_star) this._bits(hp, low ? K.starsLite : K.stars, { geo: this.geo.cook_star, size: [0.07, 0.11], speed: [1.6, 2.6], up: [2.2, 3.4], ground: anchor.y, life: 0.55 });
    };
    return e;
  }

  // ------------------------------------------------------------------ 기절 별
  stun(t, o = {}) {
    if (!this._ok() || !this.geo.cook_star || !t) return null;
    const K = COOK.stun, dur = o.dur || 3, n = K.n, stars = [];
    if (t._cookStun && !t._cookStun.dead) this._free(t._cookStun);   // refreshed: never two rings of stars on one head
    const e = this._fx('stun', dur + 0.25, (e) => {
      const gone = t.dead || t.removed || (e.t > 0.25 && !(t.status && t.status.has && t.status.has('stun')));
      if (gone && e.t < e.life - 0.2) e.life = e.t + 0.2;
      const p = P3(t.pos), top = cookTop(t), rr = K.r + (t.radius || 0.5) * 0.35, a = smooth(0, 0.15, e.t) * (1 - smooth(e.life - 0.2, e.life, e.t));
      for (let i = 0; i < n; i++) { const m = stars[i], ang = e.t * K.spin + i * Math.PI * 2 / n;
        m.position.set(p.x + Math.cos(ang) * rr, p.y + top + K.lift + Math.sin(e.t * 6 + i * 2) * 0.03, p.z + Math.sin(ang) * rr * 0.55);
        m.quaternion.copy(this.camQ); m.rotateZ(e.t * 3 + i); m.scale.setScalar(K.size * (0.85 + 0.15 * Math.sin(e.t * 8 + i))); m.material.uniforms.uA.value = a; }
    });
    for (let i = 0; i < n; i++) { const m = this.solid(e, this.geo.cook_star, { spec: 0.2, rim: 0xffffff }); m.renderOrder = 7; m.material.uniforms.uGlow.value = 0.12; stars.push(m); }
    t._cookStun = e; return e;
  }

  // ------------------------------------------------------------------ 미트볼
  proj(pos, o = {}) {
    if (!this._ok() || !this.geo.cook_meatball) return null;
    const K = COOK.ball, last = P3(pos), vel = new THREE.Vector3(0, 0, 1), ax = new THREE.Vector3(rnd(-1, 1), rnd(-0.3, 0.3), rnd(-1, 1)).normalize(), sp = K.spin * rnd(0.8, 1.2);
    const e = this._fx('proj', 6, (e) => {
      mb.quaternion.setFromAxisAngle(ax, e.t * sp); mb.material.uniforms.uA.value = smooth(0, 0.05, e.t);
      tr.quaternion.copy(this.camQ); tr.position.copy(vel).multiplyScalar(-0.24); tr.scale.setScalar(0.5); tr.material.uniforms.uA.value = 0.3 * smooth(0, 0.08, e.t);
    });
    e.g.position.copy(last);
    const mb = this.solid(e, this.geo.cook_meatball, { rim: 0xffc890, spec: 0.5 }), tr = this.puff(e, COOK.col.steam1, COOK.col.steam2, 3);
    mb.scale.setScalar(K.r);
    return { set: (p) => { const n = P3(p); _c.copy(n).sub(last); if (_c.lengthSq() > 1e-7) vel.copy(_c).normalize(); last.copy(n); e.g.position.copy(n); }, dispose: () => this._free(e) };
  }
  splat(pos, o = {}) {
    if (!this._ok()) return null;
    const K = COOK.splat, I = COOK.intensity, r = o.r || 1.2, hit = !!o.hit, low = lite(), g0 = P3(pos), y = hit ? Math.min(1.1, 0.4 + (o.top || 0.5) * 0.5) : 0.1;
    const e = this._fx('splat', K.life, (e) => {
      const k = e.t / e.life;
      this._flat(rg, r * (0.35 + 0.65 * easeOut(k * 1.6))); rg.material.uniforms.uA.value = I * K.ring * (hit ? 1 : 0.45) * (1 - smooth(0.2, 0.85, k));
      fl.quaternion.copy(this.camQ); fl.scale.setScalar((hit ? 0.9 : 0.5) * (0.6 + 0.7 * easeOut(k * 2))); fl.material.uniforms.uA.value = I * K.flash * (hit ? 1 : 0.4) * (1 - smooth(0.05, 0.5, k));
    });
    e.g.position.copy(g0);
    const rg = this.spr(e, 1, COOK.col.warm, COOK.col.sauce, 3), fl = this.spr(e, 0, COOK.col.warm, COOK.col.sauce, 6); fl.position.y = y;
    const at = g0.clone().setY(g0.y + y);
    this._bits(at, low ? K.bitsLite : K.bits, { geo: this.geo.cook_meatball, size: [0.04, 0.075], speed: [1.0, 2.2], up: [1.4, 2.6], ground: g0.y, life: 0.45 });
    this._puffs(g0.clone().setY(g0.y + y * 0.6), low ? 1 : 3, r * 0.5, { c1: COOK.col.steam1, c2: COOK.col.steam2, a: 0.3, life: 0.45, rise: 0.5 });
    return e;
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    const G = window.G, cam = G && G.render && G.render.cam;
    if (cam) { this.camQ.copy(cam.quaternion); cam.getWorldDirection(_a); this.toCam.copy(_a).multiplyScalar(-1); this.camR.set(1, 0, 0).applyQuaternion(cam.quaternion).setY(0).normalize(); }
    for (const e of this.live) { if (e.dead) continue; e.t += dt; e.dt = dt; try { e.update(e, dt); } catch (err) { console.warn('cookfx', e.kind, err); e.t = e.life; } if (e.t >= e.life) this._free(e); }
    this.live = this.live.filter(e => !e.dead);
  }
  _free(e) { if (e.dead) return; e.dead = true; this.root.remove(e.g);
    for (const m of e.items) { if (m.parent) m.parent.remove(m); (this.pool[m.userData.kind] || (this.pool[m.userData.kind] = [])).push(m); } e.items.length = 0; }
  clear() { for (const e of this.live) this._free(e); this.live = []; }
}
