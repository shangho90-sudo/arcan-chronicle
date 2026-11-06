// Ground shatter: the ground really breaks under a heavy blow (일격참, heavy monster slams, smash skills, big explosions).
//
// Layers (all ground-aligned, never camera billboards; visual only - no collision, no gameplay effect):
//   1. crack floor   disc just above the ground, visible only in the gaps between slabs: dark brown with hot gold
//                    energy (yellow-white at the impact -> gold -> orange at the rim), revealed by the crack front
//   2. broken slabs  Blender mesh (tools/blender/fx_shatter.py, 4 variants, random turn): Voronoi slabs with chamfered
//                    edges and side walls. Each slab breaks when the front passes (pop up, push out, settle with a small
//                    random tilt / step), its walls glow near the bottom, the outer ring fades into the ground
//   3. impact        short radial flash on the ground + a bright point flash (0.15 s)
//   4. shockwave     thin warm-gold ring racing outwards (0.45 s)
//   5. debris        Blender low-poly rocks (6 kinds) + small chips + a few glowing chips: instanced, gravity, one bounce
//   6. dust / sparks warm brown dust puffs (normal blend) and gold sparks (additive) as Points
// Timeline: 0 flash, 0.04 cracks start, ~0.3 front at the rim, 0.2 debris peak, 0.45 shock gone, 1.2 dust gone,
// glow decays 0.3 -> 1.6 s, slabs settle and fade 1.7 -> 2.6 s.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const SPAN = 0.26;                       // seconds for the crack front to reach the rim
const LIFE = 2.6;
const PAL = {
  gold: { top: 0xe0b078, top2: 0xbc8c58, edge: 0xf2d8aa, wall: 0x3b2a20, hot: 0xfff2b0, mid: 0xffb640, out: 0xff8c22, dust: 0xe2c79c, spark: 0xffd070 },
  fire: { top: 0xb88a60, top2: 0x8a6444, edge: 0xe8bc8a, wall: 0x2e1c14, hot: 0xfff0a0, mid: 0xff9a30, out: 0xff4a10, dust: 0xd8bc98, spark: 0xffa040 },
  stone: { top: 0xcbb898, top2: 0xa8927a, edge: 0xeedcbc, wall: 0x3e3026, hot: 0xfff2b0, mid: 0xffb640, out: 0xff8c22, dust: 0xf2e6cc, spark: 0xffd070 },
};
const C = (h) => new THREE.Color(h);

async function loadWrapped(url) {
  const j = await (await fetch(url)).json(); const raw = atob(j.b64), u8 = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
  return new Promise((res, rej) => new GLTFLoader().parse(u8.buffer, '', res, rej));
}
const geomsOf = (gltf) => { const out = []; gltf.scene.traverse(o => { if (o.isMesh) out.push(o.geometry); }); return out; };

const NOISE = `
float h1(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h1(i), h1(i + vec2(1, 0)), f.x), mix(h1(i + vec2(0, 1)), h1(i + 1.), f.x), f.y); }
vec3 heatRamp(float k, vec3 o, vec3 m, vec3 h){ return mix(o, mix(m, h, smoothstep(.55, 1., k)), smoothstep(.05, .55, k)); }`;

const SLAB_VS = `
uniform float uT, uFade, uLiftK;
varying vec3 vN; varying vec2 vP; varying float vY, vDist, vRnd, vRv, vOpen;
void main(){
  float dist = uv.x, rnd = uv.y; vec2 c = (uv1 - .5) * 2.;
  float ts = uT - .04 - dist * ${SPAN.toFixed(3)};              // time since this slab broke
  float open = smoothstep(0., .035, ts);
  float pop = ts > 0. ? sin(min(1., ts / .22) * 3.14159) : 0.;
  float on = smoothstep(0., .16, ts), settle = 1. - uFade;
  vec2 rad = normalize(c + vec2(1e-4, 0.));
  float res = (rnd - .42) * .055 * (1. - dist * .45);            // slabs end a little raised or sunk
  float tilt = (fract(rnd * 7.31) - .35) * .16 * (1. - dist * .5); // and tipped along the crack direction
  vec3 p = position;
  float dy = pop * .09 * (1.2 - dist) + (res + dot(p.xz - c, rad) * tilt) * on;
  p.y += dy * settle * uLiftK - uFade * .05;
  p.xz += rad * pop * .025 * (1. - dist);
  vN = normalize(mat3(modelMatrix) * normal); vP = position.xz; vY = position.y; vDist = dist; vRnd = rnd;
  vRv = length(position.xz) / 1.12; vOpen = open;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
}`;
const SLAB_FS = `
uniform vec3 uTop, uTop2, uEdge, uWall, uHot, uMid, uOut; uniform float uGlow, uFade, uT;
varying vec3 vN; varying vec2 vP; varying float vY, vDist, vRnd, vRv, vOpen;
${NOISE}
void main(){
  vec3 n = normalize(vN); float up = n.y;
  float lam = .62 + .5 * max(0., dot(n, normalize(vec3(-.35, .85, .4))));
  float nz = n2(vP * 11. + vRnd * 9.) * .55 + n2(vP * 31.) * .3 + n2(vP * 70.) * .15;
  vec3 top = mix(uTop2, uTop, nz) * (.9 + .2 * vRnd);
  // hairline cracks on the slab tops (outer ring mostly)
  float hl = smoothstep(.035, .0, abs(n2(vP * 7. + 3.) - .5)) * smoothstep(.35, .8, vDist) * .45;
  float heat = uGlow * (1. - smoothstep(.0, .95, vDist));
  vec3 hc = heatRamp(heat, uOut, uMid, uHot);
  vec3 col;
  if (up > .9) col = mix(top, uWall, hl) * lam;
  else if (up > .3) col = mix(top, uEdge, .55) * lam + hc * heat * .3;          // worn chamfer catches the light + glow
  else {                                                                         // wall: dark, glowing towards the bottom
    float g = 1. - smoothstep(-.015, .035, vY);
    col = uWall * (.55 + .45 * lam) + hc * heat * g * 1.5;
  }
  float a = vOpen * (1. - smoothstep(.7, 1., vRv)) * (1. - uFade);
  if (a < .01) discard;
  gl_FragColor = vec4(col, a);
}`;
const FLOOR_VS = `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const FLOOR_FS = `
uniform vec3 uWall, uHot, uMid, uOut; uniform float uT, uGlow, uFade;
varying vec2 vP;
${NOISE}
void main(){
  float r = length(vP) / 1.12;
  float front = (uT - .04) / ${SPAN.toFixed(3)};
  float mask = smoothstep(r - .02, r + .04, front);
  float heat = uGlow * (1. - smoothstep(.0, .9, r)) * (.75 + .25 * n2(vP * 14. + uT * 3.));
  vec3 col = mix(uWall * 1.35 + vec3(.05, .03, .01), heatRamp(heat, uOut, uMid, uHot) * (1. + 1.4 * heat), smoothstep(.02, .35, heat));
  float a = mask * (1. - smoothstep(.55, .82, r)) * (1. - uFade) * mix(.7, 1., clamp(uGlow, 0., 1.));
  gl_FragColor = vec4(col, a);
}`;
const SHOCK_FS = `
uniform float uT; uniform vec3 uCol; varying vec2 vP;
void main(){
  float r = length(vP), k = clamp((uT - .03) / .42, 0., 1.);
  float rr = mix(.06, 1., 1. - pow(1. - k, 3.)), w = .018 + .03 * (1. - k);
  float ring = exp(-pow((r - rr) / w, 2.)), fill = smoothstep(rr, rr * .4, r) * .12;
  float a = (ring + fill) * pow(1. - k, 1.3) * step(.001, uT - .03);
  gl_FragColor = vec4(uCol * a * 1.3, 1.);
}`;
const FLASH_FS = `
uniform float uT; uniform vec3 uHot, uMid; varying vec2 vP;
void main(){
  float r = length(vP), k = clamp(uT / .22, 0., 1.);
  float a = exp(-r * r * 9.) * (1. - k) * (1. - k) * 1.6 + exp(-r * r * 40.) * (1. - k);
  gl_FragColor = vec4(mix(uMid, uHot, exp(-r * r * 20.)) * a, 1.);
}`;
const PTS_VS = `
attribute float aSize, aAlpha; attribute vec3 aCol; uniform float uScale; varying float vA; varying vec3 vC;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.); vA = aAlpha; vC = aCol;
  gl_PointSize = aSize * uScale / max(.1, -mv.z); gl_Position = projectionMatrix * mv; }`;
const DUST_FS = `varying float vA; varying vec3 vC;
void main(){ vec2 q = gl_PointCoord * 2. - 1.; float d = dot(q, q); if (d > 1.) discard;
  gl_FragColor = vec4(vC, vA * smoothstep(1., .15, d) * .8); }`;
const SPARK_FS = `varying float vA; varying vec3 vC;
void main(){ vec2 q = gl_PointCoord * 2. - 1.; float d = dot(q, q); if (d > 1.) discard;
  gl_FragColor = vec4(vC * vA * (exp(-d * 4.) * 1.6 + .2), 1.); }`;

class PointPool {
  constructor(n, fs, additive) {
    this.n = n; this.live = []; const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3); this.size = new Float32Array(n); this.alpha = new Float32Array(n); this.col = new Float32Array(n * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1)); g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 3));
    this.mat = new THREE.ShaderMaterial({ uniforms: { uScale: { value: 400 } }, vertexShader: PTS_VS, fragmentShader: fs, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.pts = new THREE.Points(g, this.mat); this.pts.frustumCulled = false; this.pts.renderOrder = additive ? 9 : 8; this.geo = g;
  }
  add(p) { if (this.live.length < this.n) this.live.push(p); }
  update(dt, G) {
    const L = this.live;
    for (let i = L.length - 1; i >= 0; i--) { const p = L[i]; p.t += dt; if (p.t >= p.life) { L[i] = L[L.length - 1]; L.pop(); continue; }
      p.vy -= G * p.g * dt; const dr = Math.exp(-p.drag * dt); p.vx *= dr; p.vz *= dr; p.vy *= p.g ? 1 : dr;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.y < p.floor) { p.y = p.floor; p.vy = 0; } }
    for (let i = 0; i < L.length; i++) { const p = L[i], k = p.t / p.life;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      const on = p.t > 0; this.size[i] = on ? Math.max(0, p.s0 * (1 + p.grow * k)) : 0; this.alpha[i] = on ? p.a * Math.min(1, p.t / 0.06) * Math.max(0, 1 - k) ** p.fo : 0;
      this.col[i * 3] = p.c.r; this.col[i * 3 + 1] = p.c.g; this.col[i * 3 + 2] = p.c.b; }
    this.geo.setDrawRange(0, L.length);
    for (const k of ['position', 'aSize', 'aAlpha', 'aCol']) this.geo.attributes[k].needsUpdate = true;
  }
}

export class ShatterFx {
  constructor(root) {
    this.root = new THREE.Group(); this.root.name = 'Shatter'; root.add(this.root);
    this.live = []; this.free = []; this.ready = false; this.loading = null;
    this.dust = new PointPool(320, DUST_FS, false); this.spark = new PointPool(256, SPARK_FS, true);
    this.root.add(this.dust.pts, this.spark.pts);
  }
  load() {
    if (this.loading) return this.loading;
    this.loading = Promise.all([...'abcd'].map(k => loadWrapped(`assets/fx/fx_crack_${k}.glb.json`)).concat([loadWrapped('assets/fx/fx_debris.glb.json')]))
      .then(gs => {
        this.cracks = gs.slice(0, 4).map(g => geomsOf(g)[0]);
        const rocks = geomsOf(gs[4]); this.rocks = rocks.map(g => { g = g.clone(); g.computeBoundingSphere(); return g; });
        const lam = new THREE.MeshLambertMaterial({ flatShading: true });
        this.inst = this.rocks.map(g => { const m = new THREE.InstancedMesh(g, lam, 40); m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.root.add(m); return m; });
        this.inst.forEach(m => m.setColorAt(0, C(0xffffff)));
        this.hot = new THREE.InstancedMesh(this.rocks[0], new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 1.25, 0.45), toneMapped: false }), 64);
        this.hot.count = 0; this.hot.frustumCulled = false; this.root.add(this.hot);
        this.bits = []; this.ready = true;
      }).catch(e => { console.warn('shatter fx', e); });
    return this.loading;
  }
  _slot() {
    let s = this.free.pop(); if (s) return s;
    const U = () => ({ uT: { value: 0 }, uFade: { value: 0 }, uGlow: { value: 1 }, uLiftK: { value: 1 }, uTop: { value: C(0) }, uTop2: { value: C(0) }, uEdge: { value: C(0) },
      uWall: { value: C(0) }, uHot: { value: C(0) }, uMid: { value: C(0) }, uOut: { value: C(0) }, uCol: { value: C(0) } });
    const u = U();
    s = { g: new THREE.Group(), u };
    s.slab = new THREE.Mesh(this.cracks[0], new THREE.ShaderMaterial({ uniforms: u, vertexShader: SLAB_VS, fragmentShader: SLAB_FS, transparent: true, depthWrite: true }));
    s.slab.renderOrder = 3;
    const disc = new THREE.CircleGeometry(1.12, 48);
    s.floor = new THREE.Mesh(disc, new THREE.ShaderMaterial({ uniforms: u, vertexShader: FLOOR_VS, fragmentShader: FLOOR_FS, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
    s.floor.rotation.x = -Math.PI / 2; s.floor.position.y = 0.006; s.floor.renderOrder = 2;
    const quad = new THREE.PlaneGeometry(2, 2);
    s.shock = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: u, vertexShader: FLOOR_VS, fragmentShader: SHOCK_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }));
    s.shock.rotation.x = -Math.PI / 2; s.shock.position.y = 0.08; s.shock.renderOrder = 6;
    s.flash = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: u, vertexShader: FLOOR_VS, fragmentShader: FLASH_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.flash.rotation.x = -Math.PI / 2; s.flash.position.y = 0.1; s.flash.renderOrder = 7;
    s.g.add(s.floor, s.slab, s.shock, s.flash);
    return s;
  }
  /** p: three-space ground point (Vector3), R: radius of the broken area (m), o.pal: 'gold' | 'fire' | 'stone' */
  spawn(p, R, o = {}) {
    if (!this.ready) { this.load(); return; }
    const G = window.G, town = G && G.zone && G.zone.def && G.zone.def.town3d;
    const pal = PAL[o.pal || (town ? 'stone' : 'gold')] || PAL.gold;
    const s = this._slot(), u = s.u;
    u.uTop.value.set(pal.top); u.uTop2.value.set(pal.top2); u.uEdge.value.set(pal.edge); u.uWall.value.set(pal.wall);
    u.uHot.value.set(pal.hot); u.uMid.value.set(pal.mid); u.uOut.value.set(pal.out); u.uCol.value.set(pal.mid).lerp(C(0xfff0c0), 0.4);
    u.uT.value = 0; u.uFade.value = 0; u.uGlow.value = 1.2;
    s.slab.geometry = this.cracks[(Math.random() * 4) | 0];
    s.slab.rotation.y = Math.random() * Math.PI * 2;
    s.slab.scale.set(R, Math.min(1.3, Math.max(0.7, R * 0.45)), R); u.uLiftK.value = 1;
    s.floor.scale.set(R, R, 1); s.shock.scale.set(R * 1.3, R * 1.3, 1); s.flash.scale.set(R * 0.75, R * 0.75, 1);
    // follow the ground slope (visual only): plane through 4 height samples
    s.g.position.copy(p); s.g.quaternion.identity();
    const geo = G && G.zone && G.zone.geo;
    if (geo && geo.height) { const gx = p.x, gz = -p.z, d = R * 0.7;
      const hx = (geo.height(gx + d, gz) - geo.height(gx - d, gz)) / (2 * d), hz = -(geo.height(gx, gz + d) - geo.height(gx, gz - d)) / (2 * d);
      if (Math.abs(hx) < 0.6 && Math.abs(hz) < 0.6) s.g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-hx, 1, -hz).normalize()); }
    this.root.add(s.g); s.t = 0; s.R = R; this.live.push(s);
    this._debris(p, R, pal, o.power ?? 1);
  }
  _debris(p, R, pal, power) {
    const rnd = (a, b) => a + Math.random() * (b - a), base = C(pal.top2).lerp(C(0x8a7e72), 0.4), dark = C(pal.wall).lerp(C(pal.top2), 0.5);
    const big = Math.round(Math.min(9, 4 + R * 1.6) * power), small = Math.round(Math.min(22, 8 + R * 5) * power), hot = Math.round(Math.min(10, 3 + R * 2) * power);
    const add = (n, sz, spd, up, hotc) => { for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r0 = rnd(0.05, 0.45) * R, sp = rnd(spd[0], spd[1]);
      this.bits.push({ k: hotc ? -1 : (Math.random() * this.rocks.length) | 0, x: p.x + Math.cos(a) * r0, y: p.y + 0.05, z: p.z + Math.sin(a) * r0,
        vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: rnd(up[0], up[1]), floor: p.y + 0.02, s: rnd(sz[0], sz[1]), t: 0, life: rnd(0.7, 1.2), bounced: 0,
        rx: Math.random() * 6, ry: Math.random() * 6, wx: rnd(-14, 14), wy: rnd(-14, 14), c: base.clone().lerp(dark, Math.random()).multiplyScalar(rnd(0.85, 1.1)), delay: rnd(0, 0.08) }); } };
    add(big, [0.13, 0.26].map(v => v * Math.min(1.6, R / 2 + 0.4)), [1.2, 3.2], [3.5, 6.5], false);
    add(small, [0.05, 0.09], [1.8, 4.5], [2.5, 6], false);
    add(hot, [0.03, 0.055], [2, 5], [3, 7], true);
    // warm dust: puffs from the cracks near the centre + a low ring pushed outwards
    const dc = C(pal.dust);
    for (let i = 0; i < Math.round(14 + R * 6); i++) { const a = Math.random() * Math.PI * 2, r0 = rnd(0.05, 0.75) * R, out = rnd(0.6, 2.2) * (0.5 + r0 / R);
      this.dust.add({ x: p.x + Math.cos(a) * r0, y: p.y + rnd(0.05, 0.25), z: p.z + Math.sin(a) * r0, vx: Math.cos(a) * out, vz: Math.sin(a) * out, vy: rnd(0.3, 1.3),
        g: 0, drag: 2.2, floor: p.y, s0: rnd(0.5, 0.9) * Math.min(1.5, R / 2 + 0.5), grow: rnd(1, 2.2), t: -rnd(0.02, 0.18), life: rnd(0.7, 1.3), a: rnd(0.3, 0.5), fo: 1.4, c: dc.clone().multiplyScalar(rnd(0.9, 1.12)) }); }
    const sc = C(pal.spark), hc = C(pal.hot);
    for (let i = 0; i < Math.round(12 + R * 5); i++) { const a = Math.random() * Math.PI * 2, sp = rnd(2, 6);
      this.spark.add({ x: p.x, y: p.y + 0.15, z: p.z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: rnd(1.5, 5), g: 1, drag: 1.2, floor: p.y + 0.02,
        s0: rnd(0.05, 0.1), grow: -0.5, t: 0, life: rnd(0.3, 0.65), a: 1.3, fo: 1, c: Math.random() < 0.4 ? hc : sc }); }
  }
  update(dt) {
    if (!dt) return;
    const G = window.G, R = G && G.render;
    if (R && R.cam) { const h = R.r ? R.r.domElement.height : 800; const sc = h / (2 * Math.tan(R.cam.fov * Math.PI / 360)); this.dust.mat.uniforms.uScale.value = sc; this.spark.mat.uniforms.uScale.value = sc; }
    for (let i = this.live.length - 1; i >= 0; i--) {
      const s = this.live[i], u = s.u; s.t += dt; u.uT.value = s.t;
      const t = s.t;
      u.uGlow.value = 1.5 * (t < 0.3 ? 1 : Math.max(0, 1 - (t - 0.3) / 1.3) ** 1.6) + 0.15 * Math.max(0, 1 - t / 0.3);
      u.uFade.value = Math.min(1, Math.max(0, (t - 1.7) / 0.9));
      s.shock.visible = t < 0.5; s.flash.visible = t < 0.25;
      if (t >= LIFE) { this.root.remove(s.g); this.live.splice(i, 1); this.free.push(s); }
    }
    this.dust.update(dt, 0); this.spark.update(dt, 9.8);
    if (!this.ready) return;
    // debris: gravity, one damped bounce, spin, shrink away at the end
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    const counts = this.inst.map(() => 0); let hn = 0;
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i];
      if (b.delay > 0) { b.delay -= dt; continue; }
      b.t += dt; if (b.t >= b.life) { this.bits[i] = this.bits[this.bits.length - 1]; this.bits.pop(); continue; }
      b.vy -= 14 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.rx += b.wx * dt; b.ry += b.wy * dt;
      if (b.y < b.floor + b.s * 0.3) { b.y = b.floor + b.s * 0.3; if (b.bounced < 1 && b.vy < -1) { b.vy *= -0.32; b.vx *= 0.5; b.vz *= 0.5; b.wx *= 0.5; b.wy *= 0.5; b.bounced++; } else { b.vy = 0; b.vx *= 0.8; b.vz *= 0.8; b.wx *= 0.7; b.wy *= 0.7; } }
    }
    for (const b of this.bits) {
      if (b.delay > 0) continue;
      const k = b.t / b.life, s = b.s * (k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1);
      m4.compose(v.set(b.x, b.y, b.z), q.setFromEuler(e.set(b.rx, b.ry, 0)), sc.set(s, s, s));
      if (b.k < 0) { if (hn < 64) this.hot.setMatrixAt(hn++, m4); }
      else { const m = this.inst[b.k], n = counts[b.k]; if (n < 40) { m.setMatrixAt(n, m4); m.setColorAt(n, b.c); counts[b.k] = n + 1; } }
    }
    this.inst.forEach((m, i) => { m.count = counts[i]; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });
    this.hot.count = hn; this.hot.instanceMatrix.needsUpdate = true;
  }
  clear() { for (const s of this.live) { this.root.remove(s.g); this.free.push(s); } this.live.length = 0; this.dust.live.length = 0; this.spark.live.length = 0; if (this.bits) this.bits.length = 0; }
}
