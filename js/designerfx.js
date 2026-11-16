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
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CookFx } from './cookfx.js';

export const DSFX = {
  intensity: 1.0,
  col: { pink: 0xff8ac8, pinkB: 0xe0509a, rose: 0xff5aa0, lilac: 0xc8a8ff, lilacB: 0x8a64e0, ivory: 0xfff4e2, ivoryB: 0xd8c8b0, plat: 0xeef2ff, platB: 0x9aa4c8,
         gold: 0xffd27a, goldB: 0xd89a30, jewel: 0x7ae0ff, white: 0xffffff },
  mark: { r: 0.35, h: 0.32, size: 0.55 },
  scissors: { size: 1.7, open: 0.5 },
  ghost: { a: 0.78 },
};
const P3 = (p) => new THREE.Vector3(p.x, p.y || 0, -p.z);
const D3 = (f) => new THREE.Vector3(f.x, 0, -f.z).normalize();
const lite = () => { const G = window.G; return !!(G && ((G.input && G.input.mobile) || (G.settings && G.settings.graphicsFx === false))); };
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
let _seed = 20261117; const rnd = (a, b) => { _seed = (_seed * 1664525 + 1013904223) >>> 0; return a + (_seed / 4294967296) * (b - a); };   // 이펙트 전용 난수 — 게임 Math.random(명중·치명)을 건드리지 않음
const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _mx = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _m3 = new THREE.Matrix4();
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

export class DesignerFx extends CookFx {
  load() {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const g = await glbParse('assets/fx/fx_designer.glb.json');
      g.scene.traverse(o => { if (o.isMesh) this.geo[o.name] = o.geometry; });
      this.piece = new THREE.PlaneGeometry(1, 0.6); { const n = this.piece.attributes.position.count, c = new Float32Array(n * 3); for (let i = 0; i < n; i++) c.set(i % 2 ? [1, 0.62, 0.84] : [0.86, 0.72, 1], i * 3); this.piece.setAttribute('color', new THREE.BufferAttribute(c, 3)); }   // 실크 조각(분홍·보라)
      this.ready = true;
    })().catch(e => console.warn('designerfx load', e));
    return this.loading;
  }
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
      if (gone >= 0 && out >= 1) e.life = 0;
    });
    const g0 = P3(t.pos), ns = [0, 1, 2].map(() => { const m = this.solid(e, this.geo.ds_needle, { rim: 0xfff0b0, spec: 1.0 }); m.renderOrder = 6; return m; });
    const ds = [0, 1, 2].map(() => this.dash(e));
    return this._h(e, { setStacks: (k) => { n = Math.max(0, Math.min(3, k)); pop = 1; }, consume: () => { if (gone < 0) { gone = e.t; mode = 'consume'; } }, expire: () => { if (gone < 0) { gone = e.t; mode = 'expire'; } } });
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
      });
      this._flat(ring, r, 0.05); ring.material.uniforms.uA.value = I * 0.5 * smooth(0, 0.1, e.t) * (pinAt < 0 ? 1 : 1 - clamp01((e.t - pinAt) / 0.25));
    });
    const NV = lite() ? 9 : 14, rs = [this.grid(e, 2, NV, C.pink, C.lilac, C.gold, 5), this.grid(e, 2, NV, C.lilac, C.pink, C.gold, 5)];
    const ring = this.spr(e, 1, C.pink, C.pinkB, 3); ring.material.uniforms.uP.value = 0.3; ring.position.copy(c).sub(e.g.position);
    return this._h(e, { pin: (hs) => {
      pinAt = e.t; hits = hs || [];
      if (!hits.length) { this.clothFall(c, r * 0.5); return; }
      for (const h of hits) this.wrap(h, h.root > 0 ? h.root : 1.0);
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
      this.scissorsPose(sc, open, smooth(0, 0.1, e.t) * (1 - out), closedAt >= 0 ? Math.max(0, 0.7 - (e.t - closedAt) * 4) : 0);
    });
    const ln = this.dash(e, C.gold, C.goldB, 7), sc = this.scissors(e, DSFX.scissors.size * 0.9);
    return this._h(e, {
      close: (p) => { closedAt = e.t; ok = p.ok; n = p.n || 0; e.life = e.t + 0.4; if (!ok) return;
        const c = P3(p).setY((p.y || 0) + mid());
        this.flash(c, 0.55 + 0.1 * n, C.white, C.pinkB, 0.12, 0.9);
        for (let k = 0; k <= n; k++) { const off = (k - n / 2) * 0.12, d2 = dir.clone(); const lf = this._fx('cutline', 0.3, (x) => { const q = x.t / 0.3; l.scale.set(len * (0.8 + 0.3 * easeOut(q)), 0.07, 1); l.material.uniforms.uA.value = I * (k ? 0.9 : 1.2) * (1 - smooth(0.2, 1, q)); }); lf.g.position.copy(c).setY(c.y + off); const l = this.spr(lf, 2, k ? C.gold : C.white, C.goldB, 7); this._alignLine(l, d2); }
        this.scraps(c, 3 + n * 3, P3(p).y, { size: [0.08, 0.14] }); if (n) this.threadBurst(c, 4 + n * 2);
        if (p.bound) this.ring(P3(p), (p.r || 0.5) + 0.4, C.gold, C.goldB, 0.3, 0.9);
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
      } else if (pulled >= 0 || i >= n) nd.material.uniforms.uA.value = Math.max(0, nd.material.uniforms.uA.value - 0.08);
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
    return this._h(e, {
      stitch: (i, hits) => { const p = pts[Math.min(i, n - 1)]; this.flash(p.clone().setY(p.y + 0.08), 0.32, C.gold, C.goldB, 0.1, 0.8); for (const h of hits || []) this.flash(P3(h).setY((h.y || 0) + 0.7), 0.34, C.white, C.gold, 0.1, 0.7); },
      pull: (hits) => { pulled = e.t; this.ring(c, r * 0.6, C.gold, C.goldB, 0.3, 1.0, 1.0); this.sparkles(c.clone().setY(c.y + 0.4), 6, r * 0.4); for (const h of hits || []) this.flash(P3(h).setY((h.y || 0) + 0.7), 0.45, C.white, C.goldB, 0.12, 0.9); },
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
    return this._h(e, { cut: (k, hits, centre) => {
      cutAt[k] = e.t;
      for (const h of hits || []) this.flash(P3(h).setY((h.y || 0) + 0.85), 0.36, k ? C.white : C.pink, k ? C.platB : C.pinkB, 0.1, 0.8);
      if (k === 1 && centre && centre.length) { const at = c.clone().setY(gy + 0.9); this.flash(at, 0.8, C.white, C.gold, 0.12, 1.0); this.threadBurst(at, 8, 0.45); this.scraps(at, 6, gy); }
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
      const close = cutAt >= 0 ? clamp01((e.t - cutAt) / 0.08) : 0;
      sc.position.copy(oo).addScaledVector(f, -0.3).setY(oo.y + 3.2 - 0.7 * prep - 0.4 * close); this.faceAlong(sc, f);
      this.scissorsPose(sc, cutAt >= 0 ? 1 - close : 0.3 + 0.7 * prep, smooth(0, 0.2, e.t) * (1 - out), close ? 0.7 * (1 - out) : 0);
    });
    const sh = this.sheet(e, 6), sc = this.scissors(e, 2.5);
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
      lines.forEach((d, k) => { if (lite() && k % 2) return; this.scraps(d.position.clone(), 3, oo.y, { up: [2.2, 3.6], speed: [0.4, 1.0], size: [0.1, 0.18], life: 0.8 }); });
      this.ring(oo.clone().addScaledVector(f, r * 0.5), r * 0.5, C.gold, C.goldB, 0.35, 0.7, 0.8);
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
      if (e.t <= dashT + 0.05) { hist.unshift(P3(pc.pos).setY((pc.pos.y || 0) + 0.85)); if (hist.length > TR) hist.length = TR; }
      if (hist.length > 1) {
        const un = clamp01((e.t - dashT) / 0.6), pts = hist.map((p, k) => { const q = p.clone(); if (un > 0) { const a = k * 0.9 + un * 6; q.addScaledVector(side, Math.cos(a) * 0.35 * un).setY(q.y + Math.sin(a) * 0.35 * un + un * 0.6 * k / TR); } return q; });
        this.ribbonSet(rb, pts, 0.32, (j) => _d.copy(UP).applyAxisAngle(f, j * 0.25 + e.t * 2));
        rb.material.uniforms.uA.value = 0.8 * (1 - un);
      }
    });
    const rd = this.grid(e, 2, NV, C.lilac, C.ivory, C.gold, 2), rb = this.grid(e, 2, TR, C.pink, C.lilac, C.gold, 5);
    return this._h(e, { hit: (p) => { const at = P3(p).setY((p.y || 0) + 0.8); this.flash(at, 0.38, C.white, C.pinkB, 0.1, 0.8); this.threadBurst(at, 3, 0.3); } });
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
    return this._h(e, {
      lash: (i, hits) => { pulse = 1; for (const h of hits || []) this.flash(P3(h).setY((h.y || 0) + 0.8), 0.3, C.pink, C.pinkB, 0.1, 0.6); },
      knot: (hits) => { knotAt = e.t; const c = P3(pc.pos); this.ring(c, r, C.pink, C.pinkB, 0.3, 0.9, 1.0); this.sparkles(c.clone().setY(c.y + 1.1), 5, 0.4, C.pink); for (const h of hits || []) this.flash(P3(h).setY((h.y || 0) + 0.8), 0.42, C.white, C.pinkB, 0.12, 0.9); },
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
      for (const [m, k] of [[st, a1], [to, a2], [hd, a3]]) { m.position.copy(at); m.rotation.set(0, yaw, 0); m.scale.set(1, Math.max(0.01, k), 1); m.material.uniforms.uA.value = Math.min(1, k * 1.5) * (1 - out); m.material.uniforms.uGlow.value = 0.25 * (1 - smooth(0.3, 0.7, e.t)) + hitPulse * 0.3; }
      const cl = cloakAt >= 0 ? clamp01((e.t - cloakAt) / 0.35) : 0;
      cp.position.copy(at).setY(at.y + 1.48 + (1 - cape) * 0.8 + cl * 0.6); cp.rotation.set(0.06 * Math.sin(e.t * 2.2), yaw + cl * 3, 0.05 * Math.sin(e.t * 1.7)); cp.scale.set(1 + cl * 2.2, 1.0 - cl * 0.4, 1 + cl * 2.2);
      cp.material.uniforms.uA.value = cape * (1 - cl) * (1 - out); bw.position.copy(at).setY(cp.position.y + 0.02).addScaledVector(f, 0.12); bw.quaternion.copy(this.camQ); bw.scale.setScalar(0.16 * cape * (1 - cl)); bw.material.uniforms.uA.value = cape * (1 - cl) * (1 - out);
      // 조립 실(나선) — 다 감기면 사라짐; 보호 체력이 줄면 금실 몇 가닥이 풀려 늘어짐
      ths.forEach((m, k) => { const pts = []; for (let j = 0; j < 14; j++) { const v = j / 13, a = v * 9 + k * 2.1 + e.t * 3; pts.push(new THREE.Vector3(at.x + Math.cos(a) * 0.32 * (1 - v * 0.5), at.y + v * 1.7 * clamp01(e.t / 0.4), at.z + Math.sin(a) * 0.32 * (1 - v * 0.5))); }
        this._ribbonSet(m, pts, 0.02); m.material.uniforms.uA.value = I * 0.9 * (1 - smooth(0.35, 0.6, e.t)); });
      if (endAt >= 0 && out >= 1) e.life = 0;
    });
    const st = this.solid(e, this.geo.ds_mq_stand, { spec: 0.4 }), to = this.solid(e, this.geo.ds_mq_torso, { spec: 0.3, rim: 0xffe8f4 }), hd = this.solid(e, this.geo.ds_mq_head, { spec: 0.3 });
    const cp = this.solid(e, this.geo.ds_cape, { spec: 0.4, rim: 0xffd0ec }), bw = this.solid(e, this.geo.ds_bow, { spec: 0.5 });
    for (const m of [st, to, hd, cp, bw]) m.renderOrder = 4;
    const ths = []; for (let k = 0; k < NT; k++) { const m = this._ribbon(e, 14); m.material.uniforms.uW.value.setHex(C.gold); m.material.uniforms.uB.value.setHex(C.goldB); ths.push(m); }
    this.flash(at.clone().setY(at.y + 1.0), 0.5, C.pink, C.pinkB, 0.15, 0.6);
    return this._h(e, {
      hp: (k) => { if (k < hp - 0.01) hitPulse = 1; hp = k; },
      cloak: (hits) => { cloakAt = e.t; this.ring(at, 2.6, C.pink, C.pinkB, 0.35, 0.9, 0.3); this.scraps(at.clone().setY(at.y + 1.3), 8, at.y, { speed: [1.2, 2.6] }); for (const h of hits || []) this.flash(P3(h).setY((h.y || 0) + 0.7), 0.36, C.lilac, C.lilacB, 0.12, 0.7); },
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
      cones.forEach((m, k) => { m.position.copy(at).setY(at.y + 1.9); m.rotation.set(0, k * Math.PI / 2 + e.t * 0.3, 0); m.scale.set(R * 1.5 * inn, 4.2, 1); m.material.uniforms.uA.value = I * 0.32 * inn * (1 - out); });
      this._flat(st, R, 0.05); st.position.copy(at); st.material.uniforms.uA.value = I * 0.8 * inn * (1 - out);
      this._flat(st2, R * 0.65, 0.055); st2.position.copy(at); st2.rotation.z = e.t * 0.8; st2.material.uniforms.uA.value = I * 0.5 * inn * (1 - out);
      pins.forEach((p, k) => { const sg = k ? 1 : -1; p.position.copy(at).add(_a.copy(this.camR).multiplyScalar(sg * (R + 0.15))).setY(at.y); p.rotation.set(0, e.t, 0); p.scale.setScalar(1.0 * inn); p.material.uniforms.uA.value = inn * (1 - out); p.material.uniforms.uGlow.value = 0.15 + 0.1 * Math.sin(e.t * 4 + k); });
      if (endAt >= 0 && out >= 1) e.life = 0;
      if (t.dead || t.removed) { if (endAt < 0) endAt = e.t; }
    });
    const cones = [0, 1].map(() => this.puff(e, 0xfffaf0, 0xffe6a0, 3));   // 알파 혼합 원판을 세로로 늘인 얇은 빛기둥(밝은 바닥에서도 보이게, 풀 재질 그대로)
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
          if (cl.g) {   // 뼈 월드 행렬을 옮겨 돌림(붙은 SkinnedMesh는 메시 행렬이 아니라 뼈 위치로 그려짐): X = T(p) · R(yawD) · T(-base)
            _m2.makeTranslation(p.x, 0, p.z).multiply(_m3.makeRotationY(yawD)).multiply(_mx.makeTranslation(-cl.base.x, 0, -cl.base.z));
            cl.g.skeleton.bones.forEach((bn, k) => bn.matrixWorld.multiplyMatrices(_m2, cl.b0[k])); cl.g.material.opacity = DSFX.ghost.a * vis; }
          cl.dress.forEach((m, k) => { m.position.copy(p).setY(oo.y + cl.yAt[k]); m.rotation.set(0, Math.atan2(_d.x, _d.z) + cl.rot[k], 0); const sw = 0.12 * Math.sin(tt * 18 + k); m.rotation.x = cl.kind === 'cape' && k === 0 ? 0.35 * u + sw * 0.3 : sw * 0.15; m.material.uniforms.uA.value = vis; });
          cl.hist.unshift(p.clone().setY(oo.y + 1.0)); if (cl.hist.length > 12) cl.hist.length = 12;
          if (cl.hist.length > 1) { this.ribbonSet(cl.tr, cl.hist, 0.5, () => UP); cl.tr.material.uniforms.uA.value = 0.55 * vis; }
        });
      }
      if (finAt >= 0) {
        const k = clamp01((e.t - finAt) / 0.5), c = P3(pc.pos);
        fs.position.copy(c).setY(c.y + 2.0).addScaledVector(f, 0.4); this.faceAlong(fs, f);
        this.scissorsPose(fs, 1 - smooth(0.3, 0.45, k), smooth(0, 0.08, k) * (1 - smooth(0.6, 1, k)), 0.3);
        fr.forEach((m, j) => { const pts = []; const base = j * Math.PI * 2 / fr.length; for (let q = 0; q < 10; q++) { const v = q / 9, a = base + v * 1.6 + k * 2; pts.push(new THREE.Vector3(c.x + Math.cos(a) * (0.3 + v * 2.4 * easeOut(k)), c.y + 1.0 + v * 0.6 * Math.sin(k * Math.PI), c.z + Math.sin(a) * (0.3 + v * 2.4 * easeOut(k)))); }
          this.ribbonSet(m, pts, 0.36, () => UP); m.material.uniforms.uA.value = 0.8 * (1 - smooth(0.55, 1, k)); });
      }
      if (finAt >= 0 && e.t - finAt > 0.85) e.life = 0;
    });
    const rw = this.grid(e, 2, 10, C.ivory, C.pink, C.gold, 2), edges = [this.dash(e, C.gold, C.goldB, 3), this.dash(e, C.gold, C.goldB, 3)];
    const fs = this.scissors(e, 2.0), fr = [0, 1, 2, 3].slice(0, lite() ? 2 : 4).map((k) => this.grid(e, 2, 10, k % 2 ? C.lilac : C.pink, C.gold, C.gold, 6));
    this.scissorsPose(fs, 1, 0);
    return this._h(e, {
      go: (pl) => {
        goAt = e.t; plan = pl;
        // 분신 셋: 실제 몸의 지금 포즈 사본(반투명, 색 다름) + 서로 다른 의상 부착물(망토 / 치마 + 매듭 / 모자 + 긴 리본)
        const looks = [{ kind: 'cape', col: C.pink, dress: [['ds_cape', 1.25, 0, 0.8, 0xffffff], ['ds_crown', 1.62, 0, 1.0, 0xffffff]] },
                       { kind: 'skirt', col: C.lilac, dress: [['ds_skirt', 0.78, 0, 0.72, 0xffffff], ['ds_bow', 1.15, Math.PI, 0.2, 0xd8c0ff]] },
                       { kind: 'hat', col: C.gold, dress: [['ds_hat', 1.62, 0, 1.1, 0xffffff], ['ds_cape', 1.2, Math.PI, 0.55, 0xfff0c8]] }];
        for (let i = 0; i < Math.min(3, pl.paths.length); i++) {
          const L = looks[i], body = pc.body, cl = { kind: L.kind, hist: [], dress: [], yAt: [], rot: [] };
          cl.g = body ? this.ghostOf(e, body, L.col) : null; cl.base = P3(pc.pos); cl.phi0 = Math.atan2(-f.z, f.x);
          if (cl.g) cl.b0 = cl.g.skeleton.bones.map(bn => bn.matrixWorld.clone());
          for (const [geo, y, r0, s, tint] of L.dress) { const m = this.solid(e, this.geo[geo] || this.quad, { tint, spec: 0.6, rim: 0xffe8f4 }); m.scale.setScalar(s); m.renderOrder = 5; cl.dress.push(m); cl.yAt.push(y); cl.rot.push(r0); }
          cl.tr = this.grid(e, 2, 12, L.col, C.ivory, C.gold, 3);
          clones.push(cl);
        }
      },
      hit: (i, p) => { const at = P3(p).setY((p.y || 0) + 0.85); this.flash(at, 0.42, C.white, [C.pinkB, C.lilacB, C.goldB][i % 3], 0.1, 0.85); this.threadBurst(at, 3, 0.3); },
      finale: (hits) => { finAt = e.t; const c = P3(plan ? { x: plan.mid.x, y: oo.y, z: plan.mid.z } : pc.pos); this.ring(c, plan ? plan.r : 3, C.gold, C.goldB, 0.4, 1.0, 0.5); this.sparkles(c.clone().setY(c.y + 0.8), 8, 1.2); for (const h of hits || []) this.flash(P3(h).setY((h.y || 0) + 0.85), 0.5, C.white, C.gold, 0.12, 0.9); },
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
    return e;
  }

  // ================================================================== C5 테일러드 퍼펙션 (켜지는 순간 한 번)
  fit(pc) {
    if (!this._ok()) return null;
    const C = DSFX.col, I = DSFX.intensity, NR = 3;
    const e = this._fx('fit', 0.9, (e) => {
      const at = P3(pc.pos), k = e.t / 0.9;
      rings.forEach((m, i) => { const u = clamp01((e.t - i * 0.08) / 0.55), y = at.y + 0.1 + u * 1.5; m.position.copy(at).setY(y); this._flat(m, 0.5 - 0.12 * Math.sin(u * Math.PI) * (i % 2 ? 1 : 0.6), y); m.material.uniforms.uA.value = I * 0.9 * Math.sin(Math.PI * u); });
      br.position.copy(at).setY(at.y + 1.15).addScaledVector(this.toCam, 0.45); br.quaternion.copy(this.camQ); br.scale.setScalar(0.09 * (0.6 + 0.4 * easeOut(k * 3))); br.material.uniforms.uA.value = 1 - smooth(0.75, 1, k); br.material.uniforms.uGlow.value = 0.8 * Math.sin(Math.PI * clamp01((e.t - 0.4) / 0.4));
    });
    const rings = []; for (let i = 0; i < NR; i++) { const m = this.spr(e, 1, C.gold, C.goldB, 6); m.material.uniforms.uP.value = 0; rings.push(m); }
    const br = this.solid(e, this.geo.ds_jewel, { tint: 0xffd27a, spec: 1.4 }); br.renderOrder = 7;
    this.after(e, 0.55, () => this.flash(P3(pc.pos).setY((pc.pos.y || 0) + 1.15).addScaledVector(this.toCam, 0.45), 0.4, C.white, C.gold, 0.14, 0.9));
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
        [st, to].forEach(m => { m.scale.setScalar(0.32 * easeOut(k / 0.2)); m.position.set(0, -0.55, 0); m.material.uniforms.uA.value = 1 - out; });
        const drop = easeOut((k - 0.2) / 0.25); cp.position.set(0, -0.55 + 0.32 * 1.4 + (1 - drop) * 0.4, 0); cp.scale.setScalar(0.34 * Math.max(0.01, drop)); cp.material.uniforms.uA.value = drop * (1 - out); cp.rotation.y = Math.PI;
        ln.material.uniforms.uA.value = (k > 0.45 && k < 0.75 ? 1 : 0) * (1 - out); ln.position.set(0, -0.1, 0.18); ln.scale.set(0.5, 0.05, 1); ln.material.uniforms.uP.value = clamp01((k - 0.45) / 0.15);
        const sa = clamp01((k - 0.75) / 0.35) * Math.PI * 2; nd.position.set(Math.cos(sa) * 0.24, -0.15, Math.sin(sa) * 0.24); nd.rotation.set(0, -sa, 0); nd.scale.setScalar(0.22); nd.material.uniforms.uA.value = (k > 0.75 && k < 1.15 ? 1 : 0);
        jw.position.set(0, -0.02, 0.13); jw.scale.setScalar(0.05 * easeOut((k - 1.1) / 0.15)); jw.material.uniforms.uA.value = (k > 1.1 ? 1 : 0) * (1 - out); jw.material.uniforms.uGlow.value = 0.5;
      } else if (kind === 'emb') {
        hoop.quaternion.copy(this.camQ); hoop.scale.setScalar(0.85 * easeOut(k / 0.2)); hoop.material.uniforms.uA.value = 0.8 * (1 - out); hoop.material.uniforms.uP.value = 0.7;
        const u = clamp01((k - 0.25) / 0.9), n = Math.max(2, Math.floor(u * (path.length - 1)) + 1), sub = path.slice(0, n).map(p => p.clone().applyQuaternion(this.camQ));
        if (sub.length > 1) { this._ribbonSet(th, sub.reverse(), 0.025); th.material.uniforms.uA.value = I * (1.1 + (k > 1.15 && k < 1.5 ? 0.9 : 0)) * (1 - out); }
        const tip = path[Math.min(path.length - 1, n - 1)].clone().applyQuaternion(this.camQ); nd.position.copy(tip).add(_a.copy(this.toCam).multiplyScalar(0.05)); nd.quaternion.copy(this.camQ); nd.rotateZ(0.8); nd.scale.setScalar(0.24); nd.material.uniforms.uA.value = u < 1 ? 1 : 1 - clamp01((k - 1.2) / 0.2);
      } else {
        // 리본 띠가 접혀 매듭이 되고(0.1~0.6초) 가운데 보석, 주름을 따라 빛
        const fold = easeOut((k - 0.1) / 0.5); bw.quaternion.copy(this.camQ); bw.scale.set(0.42 * (1.6 - 0.6 * fold), 0.42 * Math.max(0.1, fold), 0.42); bw.material.uniforms.uA.value = 1 - out; bw.material.uniforms.uGlow.value = 0.6 * Math.max(0, Math.sin(Math.PI * clamp01((k - 0.75) / 0.4)));
        jw.position.copy(this.toCam).multiplyScalar(0.12); jw.scale.setScalar(0.07 * easeOut((k - 0.6) / 0.15)); jw.material.uniforms.uA.value = (k > 0.6 ? 1 : 0) * (1 - out); jw.material.uniforms.uGlow.value = 0.6;
      }
    });
    let st, to, cp, ln, nd, jw, hoop, th, bw, path;
    if (kind === 'outfit') { st = this.solid(e, this.geo.ds_mq_stand); to = this.solid(e, this.geo.ds_mq_torso); cp = this.solid(e, this.geo.ds_skirt, { tint: 0xffb0d8 }); ln = this.dash(e, C.gold, C.goldB, 7); nd = this.solid(e, this.geo.ds_needle); jw = this.solid(e, this.geo.ds_jewel, { tint: 0x9ae8ff }); }
    else if (kind === 'emb') {
      hoop = this.spr(e, 1, C.ivory, C.goldB, 5); nd = this.solid(e, this.geo.ds_needle); th = this._ribbon(e, 40); const pc_ = { star: C.rose, grid: C.lilacB, curve: C.jewel }[o.pattern] || C.gold; th.material.uniforms.uW.value.setHex(pc_); th.material.uniforms.uB.value.setHex(C.goldB);
      path = [];
      if (o.pattern === 'grid') { for (let r = 0; r < 4; r++) { const y = -0.24 + r * 0.16; path.push(new THREE.Vector3(r % 2 ? 0.25 : -0.25, y, 0), new THREE.Vector3(r % 2 ? -0.25 : 0.25, y, 0)); } for (let c = 0; c < 4; c++) { const x = 0.24 - c * 0.16; path.push(new THREE.Vector3(x, c % 2 ? -0.25 : 0.25, 0), new THREE.Vector3(x, c % 2 ? 0.25 : -0.25, 0)); } }
      else if (o.pattern === 'curve') for (let i = 0; i < 24; i++) { const u = i / 23; path.push(new THREE.Vector3(-0.3 + u * 0.6, Math.sin(u * Math.PI * 2.5) * 0.18, 0)); }
      else for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + i * Math.PI * 4 / 5 / 2 * 2, r = i % 2 ? 0.12 : 0.3, aa = -Math.PI / 2 + i * Math.PI / 5; path.push(new THREE.Vector3(Math.cos(aa) * r, -Math.sin(aa) * r, 0)); void a; }
      // 균일한 간격으로 다시 나눔(바늘이 일정한 속도로 꿰맴)
      const dense = []; for (let i = 0; i < path.length - 1; i++) for (let s = 0; s < 4; s++) dense.push(path[i].clone().lerp(path[i + 1], s / 4)); dense.push(path[path.length - 1]); path = dense;
    } else { bw = this.solid(e, this.geo.ds_bow, { spec: 0.6, rim: 0xffd8ee }); jw = this.solid(e, this.geo.ds_jewel, { tint: 0x9ae8ff, spec: 1.4 }); }
    this.after(e, kind === 'emb' ? 1.2 : 1.15, () => this.sparkles(P3(pc.pos).setY((pc.pos.y || 0) + 2.6), 8, 0.6));
    try { if ((o.n || 1) > 1 && window.G && window.G.ui) window.G.ui.floatText({ x: pc.pos.x, y: (pc.pos.y || 0) + 0.6, z: pc.pos.z }, '×' + o.n, '#ffd27a', 0.9, 2.6); } catch (err) { /* no ui */ }
    return e;
  }
}
