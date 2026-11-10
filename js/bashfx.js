// 배쉬(Bash) heavy strike: a sharp crescent of blade light follows the REAL sword arc -> at the damage frame a white
// cross / star flash + small energy sphere bursting into short rays on the target's front surface -> a vertical shock ring
// and a wide ground ring spread from the hit -> brown / grey dust and stone chips are thrown to the sides and fall,
// white / gold light shards and a few embers linger -> gone ~0.6 s after the hit (cast -> end about 0.85 s).
//
// Assets: tools/blender/fx_bash.py -> assets/fx/fx_bash.glb.json (unit meshes, game axes +Z forward / +Y up, "cells" table)
// + assets/fx/fx_bash.png (atlas of MASKS: R = hot core, G = body, B = halo, A = coverage; recoloured with BASH colours).
//
// cast (skill start, follows the caster)
//   0.00 - 0.16  faint blue gather glow at the real sword tip (wind-up)
//   0.16 - 0.31  crescent: Blender arc mesh stretched onto a circle fitted through the sword-tip path of this body's own
//                swing (cached per body after the first swing; BASH.arc = measured default for the very first one). The
//                head follows the real tip angle every frame (synced with the swing even under hit-stop), the texture
//                slides with the head, the tail fades -> then thins + fades in the world by ~0.2 s after the swing
// hit  (the damage event: js/skillrt.js opHit, same call that applies the damage + push)
//   0.00 - 0.13  white core glow + 8-point star flash (camera-facing, one long spike along the attack on screen)
//   0.00 - 0.14  energy sphere expands (white -> gold) and 6-10 short rays shoot out (biased away from the attacker)
//   0.00 - 0.24  vertical shock ring (plane facing the attacker) expands from the hit point
//   0.03 - 0.40  ground ring (0.06 m above the ground: no z-fighting) spreads under the target
//   0.02 - 0.60  dust puffs to both sides, stone chips (gravity, stop on the ground), light shards, embers
// Hit-stop is NOT global: skillrt freezes only the caster's and the target's animation / push for BASH.stop s.
// Low spec (phone or "그래픽 효과" off): flash, sphere, crescent, rings stay; fewer rays / dust / chips / shards.
// Tuning: BASH (colours, intensity, size, speed) - window.BASH_FX at runtime.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const BASH = {
  white: 0xffffff, blade: 0xbdeeff, shock: 0x8ddcff, gold: 0xffdfa0, dustA: 0xb39a78, dustB: 0xbdb7aa, rock: 0x857565,
  intensity: 1, size: 1, speed: 1, stop: 0.05,
  // sword-tip arc of the attack2 swing in BODY space (x right, y up, z forward, m), measured in the game
  // (tools/browser-tests/bash_skill.js ARC=1). Only used until this body has swung once (then its own fitted arc is cached).
  arc: { c: [0.221, 1.153, 0.075], e1: [-0.802, -0.491, -0.34], e2: [-0.135, -0.405, 0.904], r: 0.788, span: 3.794 },
};
const SWING = [0.16, 0.31];          // attack2 strike window (s of the action): tip samples for the fit, crescent reveal
const CAST_LIFE = 0.9, HIT_LIFE = 0.62;

/** impact point (GAME coords) of the bash on actor t along f = {x, z} (unit): the target's front surface, at the height
 *  of the real blade at the damage frame (tipY, clamped to the body), else chest height. */
export function bashImpact(t, f, tipY) {
  const r = t.radius || 0.5, gy = t.pos.y || 0, top = gy + Math.min(1.45, 0.65 + r * 0.8);
  const y = tipY == null ? gy + Math.min(1.2, 0.55 + r * 0.55) : Math.max(gy + 0.4, Math.min(top, tipY));
  return { x: t.pos.x - f.x * r * 0.9, y, z: t.pos.z - f.z * r * 0.9 };
}

const VS = `
attribute float aFade; attribute float aHue; uniform float uBias, uArcK, uArc;
varying vec2 vUv; varying float vF, vH, vA;
void main(){
  vUv = uv; vec4 p = vec4(position, 1.); vA = 0.;
  if (uArc > .5) {                                   // crescent: stretch the modelled span onto the real swing span
    float a = atan(p.y, p.x); if (a < -0.5) a += 6.2831853; float r = length(p.xy);
    vA = a * uArcK; p.xy = vec2(cos(vA), sin(vA)) * r; vA = clamp(a / 2.6179939, 0., 1.);
  }
#ifdef USE_INSTANCING
  p = instanceMatrix * p; vF = aFade; vH = aHue;
#else
  vF = 1.; vH = 0.;
#endif
  vec4 mv = modelViewMatrix * p;
  mv.xyz -= normalize(mv.xyz) * uBias;
  gl_Position = projectionMatrix * mv;
}`;
// additive light (masks recoloured): hue 0 = blade blue, .5 = shock cyan, 1 = gold
const FS = `
uniform sampler2D uMap; uniform vec3 uW, uB, uS, uG; uniform float uI, uA, uHue, uR, uArc, uHead, uLen, uThin; uniform vec4 uCell;
varying vec2 vUv; varying float vF, vH, vA;
void main(){
  vec2 uv = vUv; float m = 1.;
  if (uArc > .5) {                                   // crescent: only [head - len, head] is lit, the texture slides with the head
    float al = (vA - (uHead - uLen)) / max(.001, uLen); if (al < 0. || vA > uHead + .002) discard;
    m = smoothstep(0., .35, al);
    uv.x = mix(uCell.x, uCell.y, clamp(al, 0., 1.));
    // v across the arc as modelled (0 inner .. 1 outer edge; glTF flipped v, so it runs from uCell.w down to uCell.z):
    // thin around the edge line (v 0.8) as the trail dies
    float vb = (uCell.w - uv.y) / (uCell.w - uCell.z); float o = (vb - .8) / max(.05, uThin) + .8;
    if (o < 0. || o > 1.) discard; uv.y = uCell.w - o * (uCell.w - uCell.z);
  }
  vec4 t = texture2D(uMap, uv);
  float h = clamp(uHue + vH, 0., 1.), f = uA * vF * m;
  vec3 body = mix(uB, uS, smoothstep(0., .5, h)); body = mix(body, uG, smoothstep(.5, 1., h));
  vec3 c = (uW * t.r * uR + body * t.g * (1. - .4 * t.r * uR) + body * t.b * .5) * uI * f;
  gl_FragColor = vec4(c, clamp((t.g * .8 + t.b * .4 + t.r * .3) * f * .55, 0., 1.));
}`;
// dust (normal blending): lumpy puff, lit top, brown -> grey per instance
const FS_DUST = `
uniform sampler2D uMap; uniform vec3 uDA, uDB; uniform float uA;
varying vec2 vUv; varying float vF, vH, vA;
void main(){
  vec4 t = texture2D(uMap, vUv); vec3 c = mix(uDA, uDB, vH) * (.62 + .5 * t.r);
  float a = t.a * vF * uA; if (a < .01) discard; gl_FragColor = vec4(c, a * .6);
}`;
// stone chips: flat facets lit by a fixed light (no scene lights), fade out at the end of their life
const VS_ROCK = `
attribute float aFade; attribute float aHue; varying vec2 vUv; varying float vF, vH; varying vec3 vN;
void main(){ vUv = uv; vF = aFade; vH = aHue; vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.); }`;
const FS_ROCK = `
uniform sampler2D uMap; uniform vec3 uC; varying vec2 vUv; varying float vF, vH; varying vec3 vN;
void main(){ vec4 t = texture2D(uMap, vUv); float l = .5 + .6 * max(0., dot(normalize(vN), normalize(vec3(.35, 1., .25))));
  if (vF < .02) discard; gl_FragColor = vec4(uC * (.7 + .6 * t.r) * l * (.85 + .3 * vH), clamp(vF, 0., 1.)); }`;

const easeOut = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const expoOut = (x) => x >= 1 ? 1 : 1 - Math.pow(2, -10 * Math.max(0, x));
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const rnd = (a, b) => a + Math.random() * (b - a);
const lite = () => { const G = window.G; return !!(G && ((G.input && G.input.mobile) || (G.settings && G.settings.graphicsFx === false))); };
const flashK = () => { const G = window.G; return (G && G.reduceFlash ? 0.6 : 1) * (G && G.settings && G.settings.graphicsFx === false ? 0.6 : 1); };   // no tonemap -> keep the additive white from clipping into a blob
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), Z3 = new THREE.Vector3(0, 0, 1);

async function loadWrapped(url, owner) {
  const j = await (await fetch(url)).json(); if (owner) { owner.cells = j.cells || {}; owner.span = (j.span || 150) * Math.PI / 180; }
  const raw = atob(j.b64), u8 = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
  return new Promise((res, rej) => new GLTFLoader().parse(u8.buffer, '', res, rej));
}

/** body frame of an actor (three.js vectors): origin at the feet, F = facing, U = up, Rt = right */
function frame(a) {
  const f = a.facing || { x: 0, z: 1 }, m = Math.hypot(f.x, f.z) || 1;
  const F = new THREE.Vector3(f.x / m, 0, -f.z / m), U = new THREE.Vector3(0, 1, 0), Rt = new THREE.Vector3(-F.z, 0, F.x);
  return { o: new THREE.Vector3(a.pos.x, a.pos.y || 0, -a.pos.z), F, U, Rt };
}
const toWorld = (fr, p, out = new THREE.Vector3()) => out.copy(fr.o).addScaledVector(fr.Rt, p[0]).addScaledVector(fr.U, p[1]).addScaledVector(fr.F, p[2]);
const toWorldDir = (fr, p, out = new THREE.Vector3()) => out.set(0, 0, 0).addScaledVector(fr.Rt, p[0]).addScaledVector(fr.U, p[1]).addScaledVector(fr.F, p[2]);
const toLocal = (fr, w) => { const d = w.clone().sub(fr.o); return [d.dot(fr.Rt), d.dot(fr.U), d.dot(fr.F)]; };
/** circle through 3 points (arrays, body space) -> { c, e1 (centre -> start), e2 (in-plane, towards the swing), r, span } */
export function fitArc(p1, p2, p3) {
  const A = new THREE.Vector3(...p1), B = new THREE.Vector3(...p2), C = new THREE.Vector3(...p3);
  const a = A.clone().sub(C), b = B.clone().sub(C), axb = a.clone().cross(b), d = 2 * axb.lengthSq(); if (d < 1e-8) return null;
  const cen = b.clone().multiplyScalar(a.lengthSq()).sub(a.clone().multiplyScalar(b.lengthSq())).cross(axb).divideScalar(d).add(C);
  const r = A.distanceTo(cen), e1 = A.clone().sub(cen).normalize(), n = B.clone().sub(A).cross(C.clone().sub(B)).normalize(), e2 = n.clone().cross(e1).normalize();
  const pc = C.clone().sub(cen); let span = Math.atan2(pc.dot(e2), pc.dot(e1)); if (span < 0) span += Math.PI * 2;
  if (!(r > 0.3 && r < 3) || span < 0.5) return null;
  const R = v => [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)];
  return { c: R(cen), e1: R(e1), e2: R(e2), r: +r.toFixed(3), span: +span.toFixed(3) };
}

export class BashFx {
  constructor(root) { this.root = root; this.live = []; this.free = { cast: [], hit: [] }; this.ready = false; this.loading = null; this.geo = {}; }
  load() {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const [g, tex] = await Promise.all([loadWrapped('assets/fx/fx_bash.glb.json', this), new THREE.TextureLoader().loadAsync('assets/fx/fx_bash.png')]);
      g.scene.traverse(o => { if (o.isMesh) this.geo[o.name] = o.geometry; });
      tex.flipY = false; tex.colorSpace = THREE.NoColorSpace; tex.generateMipmaps = true; tex.anisotropy = 2; tex.needsUpdate = true;
      this.tex = tex; const c = this.cells.crescent || [0, 0.5, 0.5, 0.75]; this.crCell = new THREE.Vector4(c[0], c[1], c[2], c[3]);
      this.glowGeo = this._quadOn('glow');
      this.ready = true;
    })().catch(e => { console.warn('bashfx load', e); });
    return this.loading;
  }
  /** bash_quad re-mapped onto another atlas cell (the Blender quad carries the dust cell) */
  _quadOn(name) {
    const g = this.geo.bash_quad.clone(), uv = g.attributes.uv, d = this.cells.dust, c = this.cells[name];
    for (let i = 0; i < uv.count; i++) { const u = (uv.getX(i) - d[0]) / (d[1] - d[0]), v = (uv.getY(i) - d[2]) / (d[3] - d[2]); uv.setXY(i, c[0] + u * (c[1] - c[0]), c[2] + v * (c[3] - c[2])); }
    uv.needsUpdate = true; return g;
  }
  _mat(add = true, bias = 0) {
    return new THREE.ShaderMaterial({
      uniforms: { uMap: { value: this.tex }, uW: { value: new THREE.Color(BASH.white) }, uB: { value: new THREE.Color(BASH.blade) }, uS: { value: new THREE.Color(BASH.shock) }, uG: { value: new THREE.Color(BASH.gold) },
        uI: { value: 1 }, uA: { value: 0 }, uHue: { value: 0 }, uR: { value: 1 }, uBias: { value: bias }, uArc: { value: 0 }, uArcK: { value: 1 }, uHead: { value: 1 }, uLen: { value: 1 }, uThin: { value: 1 }, uCell: { value: this.crCell } },
      vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: add ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation,
    });
  }
  _mesh(geo, order, bias = 0, add = false) { const m = new THREE.Mesh(geo, this._mat(add, bias)); m.frustumCulled = false; m.renderOrder = order; return m; }
  _inst(geo, n, order, mat) {
    const g = geo.clone(); g.setAttribute('aFade', new THREE.InstancedBufferAttribute(new Float32Array(n), 1)); g.setAttribute('aHue', new THREE.InstancedBufferAttribute(new Float32Array(n), 1));
    const m = new THREE.InstancedMesh(g, mat || this._mat(true, 0.4), n); m.frustumCulled = false; m.renderOrder = order; m.count = 0; if (m.material.uniforms.uA) m.material.uniforms.uA.value = 1; return m;
  }
  _castSlot() {
    let s = this.free.cast.pop(); if (s) return s;
    s = { kind: 'cast', g: new THREE.Group() };
    s.glow = this._mesh(this.glowGeo, 9, 0.3, true);
    s.cres = this._mesh(this.geo.bash_crescent, 8, 0.25); s.cres.material.uniforms.uArc.value = 1;
    s.cres2 = this._mesh(this.geo.bash_crescent, 7, 0.2, true); s.cres2.material.uniforms.uArc.value = 1;   // wider soft halo copy
    s.g.add(s.cres2, s.cres, s.glow); return s;
  }
  _hitSlot() {
    let s = this.free.hit.pop(); if (s) return s;
    s = { kind: 'hit', g: new THREE.Group() };
    s.core = this._mesh(this.glowGeo, 14, 1.0, true); s.star = this._mesh(this.geo.bash_star, 13, 1.0, true); s.sphere = this._mesh(this.geo.bash_sphere, 12, 0.9, true);
    s.vring = this._mesh(this.geo.bash_ring, 10, 0.5, true); s.gring = this._mesh(this.geo.bash_ring, 6, 0.0, true);
    s.rays = this._inst(this.geo.bash_ray, 10, 11); s.shards = this._inst(this.geo.bash_shard, 8, 11); s.embers = this._inst(this.glowGeo, 6, 11);
    const dm = new THREE.ShaderMaterial({ uniforms: { uMap: { value: this.tex }, uDA: { value: new THREE.Color(BASH.dustA) }, uDB: { value: new THREE.Color(BASH.dustB) }, uA: { value: 1 }, uBias: { value: 0.3 }, uArc: { value: 0 }, uArcK: { value: 1 } },
      vertexShader: VS, fragmentShader: FS_DUST, transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide });
    s.dust = this._inst(this.geo.bash_quad, 10, 5, dm);
    const rm = new THREE.ShaderMaterial({ uniforms: { uMap: { value: this.tex }, uC: { value: new THREE.Color(BASH.rock) } }, vertexShader: VS_ROCK, fragmentShader: FS_ROCK, transparent: true, depthWrite: true });
    s.rocks = this._inst(this.geo.bash_rock, 8, 4, rm);
    s.g.add(s.gring, s.dust, s.rocks, s.vring, s.rays, s.shards, s.embers, s.sphere, s.star, s.core); return s;
  }
  /** cast: tip gather + crescent. pos / dir GAME coords; o.follow = the caster (its sword tip + facing drive everything) */
  cast(pos, dir, o = {}) {
    if (!this.ready) { this.load(); return null; }
    const a = o.follow; if (!a || !a.body) return null;
    const s = this._castSlot(); s.t = 0; s.a = a; s.k = flashK(); s.samples = []; s.head = 0; s.done = -1; s.lite = lite();
    s.arc = a.body.__bashArc || BASH.arc; s.act = a.body.action;
    this.root.add(s.g); this.live.push(s); this._castTick(s, 0); return s;
  }
  /** hit at the impact point (GAME coords, y = flash height), dir = attack direction {x, z}. o.ground = target feet {x, y, z};
   *  o.whiff = nothing hit: only a small dust puff at the end of the swing; o.cast = the cast slot (records the impact) */
  hit(pos, dir, o = {}) {
    if (!this.ready) { this.load(); return null; }
    const s = this._hitSlot(), lo = lite(), m = Math.hypot(dir.x, dir.z) || 1, dx = dir.x / m, dz = -dir.z / m;
    s.t = 0; s.k = flashK(); s.whiff = !!o.whiff; s.sz = (o.size ?? 1) * BASH.size; s.lo = lo;
    s.p = new THREE.Vector3(pos.x, pos.y || 0, -pos.z); s.dir3 = new THREE.Vector3(dx, 0, dz); s.roll = rnd(-0.15, 0.15);
    const gr = o.ground || { x: pos.x, y: (pos.y || 0) - 1, z: pos.z }; s.gy = gr.y || 0; s.gp = new THREE.Vector3(gr.x, s.gy + 0.06, -gr.z);
    s.g.position.set(0, 0, 0);
    // vertical ring: its plane faces the attacker (normal = attack direction)
    s.vring.position.copy(s.p); s.vring.quaternion.setFromUnitVectors(Z3, s.dir3);
    s.gring.position.copy(s.gp); s.gring.rotation.set(-Math.PI / 2, 0, 0);
    for (const k of ['core', 'star', 'sphere', 'vring', 'rays', 'shards', 'embers']) s[k].visible = !s.whiff;
    const side = new THREE.Vector3(-dz, 0, dx);
    // particles: rays (from the hit point, away from the attacker + up), shards / embers, dust + chips from the ground
    s.ry = []; const nr = s.whiff ? 0 : lo ? 6 : 10;
    for (let i = 0; i < nr; i++) {
      const a = (i / nr) * Math.PI * 2 + rnd(-0.25, 0.25), d = new THREE.Vector3().addScaledVector(side, Math.cos(a)).addScaledVector(new THREE.Vector3(0, 1, 0), Math.sin(a) * 0.9).addScaledVector(s.dir3, rnd(0.25, 0.9)).normalize();
      s.ry.push({ d, L: rnd(0.35, 0.8) * (i < 2 ? 1.25 : 1), w: rnd(0.7, 1.15), hue: Math.random() < 0.45 ? 1 : rnd(0, 0.3), dl: rnd(0, 0.015) });
    }
    s.sh = []; const ns = s.whiff ? 0 : lo ? 4 : 8;
    for (let i = 0; i < ns; i++) { const a = rnd(-1.4, 1.4), sp = rnd(2.5, 5.5);
      const v = new THREE.Vector3().addScaledVector(s.dir3, Math.cos(a) * sp * 0.7).addScaledVector(side, Math.sin(a) * sp).setY(rnd(1.5, 4));
      s.sh.push({ p: s.p.clone(), v, life: rnd(0.3, 0.5), len: rnd(0.12, 0.22), hue: Math.random() < 0.5 ? 1 : 0.1 }); }
    s.em = []; const ne = s.whiff ? 0 : lo ? 3 : 6;
    for (let i = 0; i < ne; i++) s.em.push({ p: s.p.clone().add(new THREE.Vector3(rnd(-0.3, 0.3), rnd(-0.2, 0.3), rnd(-0.3, 0.3))), v: new THREE.Vector3(rnd(-0.6, 0.6), rnd(0.4, 1.2), rnd(-0.6, 0.6)).addScaledVector(s.dir3, 0.6), t0: rnd(0.06, 0.16), life: rnd(0.3, 0.45), sz: rnd(0.07, 0.13) });
    s.du = []; const nd = s.whiff ? (lo ? 2 : 3) : lo ? 5 : 10;
    for (let i = 0; i < nd; i++) { const sg = i % 2 ? 1 : -1, sp = rnd(1.4, 3.4) * (s.whiff ? 0.5 : 1);
      const v = new THREE.Vector3().addScaledVector(side, sg * sp).addScaledVector(s.dir3, rnd(-0.2, 1.2)).setY(rnd(0.2, 0.8));
      s.du.push({ p: s.gp.clone().addScaledVector(side, sg * rnd(0.1, 0.4)).setY(s.gy + rnd(0.15, 0.35)), v, t0: rnd(0.0, 0.05), life: rnd(0.38, 0.56), sz: rnd(0.5, 0.9) * (s.whiff ? 0.7 : 1), rot: rnd(0, 6.28), hue: Math.random() }); }
    s.rk = []; const nk = s.whiff ? 0 : lo ? 3 : 8;
    for (let i = 0; i < nk; i++) { const sg = i % 2 ? 1 : -1;
      const v = new THREE.Vector3().addScaledVector(side, sg * rnd(1.2, 3.2)).addScaledVector(s.dir3, rnd(0, 1.6)).setY(rnd(2.4, 4.6));
      s.rk.push({ p: s.gp.clone().setY(s.gy + 0.2), v, life: rnd(0.45, 0.6), sz: rnd(0.045, 0.09), rx: rnd(-9, 9), ry: rnd(-9, 9), e: new THREE.Euler(rnd(0, 6), rnd(0, 6), 0), hue: Math.random() }); }
    if (o.cast && this.live.includes(o.cast)) o.cast.hit = s.p.clone();
    this.root.add(s.g); this.live.push(s); this._hitTick(s, 0); return s;
  }
  /** the real sword tip of the follow actor, in its body space, or null */
  _tip(a, fr) { try { const b = a.body && a.body.bladePoints && a.body.bladePoints(); return b ? { w: b[1].clone(), l: toLocal(fr, b[1]) } : null; } catch (e) { return null; } }
  _castTick(s, dt) {
    const a = s.a, U = m => m.material.uniforms, k = s.k * BASH.intensity, cam = window.G && window.G.render && window.G.render.cam;
    const alive = a && !a.dead && a.body, act = alive && a.body.action === s.act, at = act ? a.body.t : 1;
    const fr = alive ? frame(a) : s.fr, tip = alive ? this._tip(a, fr) : null;
    // A. wind-up gather at the tip (0 -> 0.16), gone as the strike starts
    const gA = smooth(0.0, 0.1, s.t) * (1 - smooth(0.13, 0.19, s.t));
    s.glow.visible = gA > 0.01 && !!tip; if (tip) s.glow.position.copy(tip.w); if (cam) s.glow.quaternion.copy(cam.quaternion);
    s.glow.scale.setScalar(0.35 + 0.15 * smooth(0, 0.16, s.t)); U(s.glow).uA.value = gA * 0.55; U(s.glow).uI.value = 1.1 * k; U(s.glow).uHue.value = 0.1;
    // B. crescent: record the tip path (for this body's own arc), follow the body while swinging, then stay in the world
    if (act && tip && at >= SWING[0] - 0.01 && at <= SWING[1] + 0.02) s.samples.push(tip.l);
    if (s.done < 0 && alive) s.fr = fr;
    const arc = s.arc, F = s.fr;
    if (F) {
      const c = toWorld(F, arc.c), e1 = toWorldDir(F, arc.e1).normalize(), e2 = toWorldDir(F, arc.e2).normalize(), n = new THREE.Vector3().crossVectors(e1, e2).normalize();
      _m.makeBasis(e1, e2, n); s.cres.quaternion.setFromRotationMatrix(_m); s.cres.position.copy(c); s.cres.scale.setScalar(arc.r);
      s.cres2.quaternion.copy(s.cres.quaternion); s.cres2.position.copy(c); s.cres2.scale.setScalar(arc.r * 1.04);
      // head = the real tip's angle on the fitted circle (0 .. 1 of the span)
      if (s.done < 0 && act && tip && at >= SWING[0]) {
        const d = tip.w.clone().sub(c); let ang = Math.atan2(d.dot(e2), d.dot(e1)); if (ang < -1) ang += Math.PI * 2;
        s.head = Math.max(s.head, Math.min(1, Math.max(0, ang / arc.span)));
        if (at >= SWING[1] || s.head >= 0.995) { s.done = s.t; s.head = 1; }
      } else if (s.done < 0 && (!act || at > SWING[1] + 0.05)) { s.done = s.t; s.head = Math.max(s.head, 1); }
    }
    const shown = s.head > 0.02, post = s.done < 0 ? 0 : s.t - s.done;
    const fade = (s.head > 0 ? smooth(0.0, 0.12, s.head) : 0) * (1 - smooth(0.04, 0.2, post)), thin = 1 - 0.65 * smooth(0.0, 0.18, post);
    const len = Math.min(0.85, 0.25 + s.head * 0.7);
    for (const [m, I, A, th, hue] of [[s.cres, 3.2, 1, thin, 0.0], [s.cres2, 1.3, 0.7, Math.min(1, thin * 1.4), 0.3]]) {
      const u = U(m); m.visible = shown && fade > 0.003 && !!F;
      u.uArcK.value = arc.span / (this.span || 2.618); u.uHead.value = s.head; u.uLen.value = len; u.uThin.value = th; u.uA.value = fade * A; u.uI.value = I * k; u.uHue.value = hue + 0.25 * smooth(0, 0.2, post); u.uR.value = 1;
    }
    if (s.done >= 0 && post > 0.21 && s.samples.length) this._learn(s);
    return s.t < CAST_LIFE && !(s.done >= 0 && post > 0.22);
  }
  /** fit this body's own swing arc from the recorded tip path and cache it for its next bashes */
  _learn(s) {
    const P = s.samples; s.samples = []; if (P.length < 5 || !s.a || !s.a.body) return;
    const arc = fitArc(P[0], P[Math.floor(P.length / 2)], P[P.length - 1]); if (arc) s.a.body.__bashArc = arc;
  }
  _hitTick(s, dt) {
    const t = s.t, k = s.k * BASH.intensity, sz = s.sz, U = m => m.material.uniforms, cam = window.G && window.G.render && window.G.render.cam;
    if (!s.whiff && cam) {
      // B. core glow + star flash at the hit point, peak at once, gone by 0.13
      const qi = cam.quaternion.clone().invert(), v = s.dir3.clone().applyQuaternion(qi), ang = Math.atan2(v.y, v.x) + s.roll;
      _q.setFromAxisAngle(Z3, ang - Math.PI / 2);                                  // the long spike (+Y in the mesh) along the attack on screen
      s.core.position.copy(s.p); s.core.quaternion.copy(cam.quaternion);
      const cIn = expoOut(t / 0.02), cOut = 1 - smooth(0.05, 0.13, t);
      s.core.scale.setScalar(0.62 * sz * cIn * (0.55 + 0.45 * cOut) + 0.001); U(s.core).uA.value = cOut; U(s.core).uI.value = 1.7 * k; U(s.core).uHue.value = 0.15;
      s.star.position.copy(s.p); s.star.quaternion.copy(cam.quaternion).multiply(_q);
      const sIn = expoOut(t / 0.025), sOut = 1 - smooth(0.06, 0.13, t);
      s.star.scale.set(0.8 * sz * (0.35 + 0.65 * sIn) * (0.75 + 0.25 * sOut), 1.05 * sz * (0.35 + 0.65 * sIn) * (1 + 0.2 * smooth(0.03, 0.13, t)), 1);
      U(s.star).uA.value = sOut; U(s.star).uI.value = 2.3 * k; U(s.star).uR.value = 1; U(s.star).uHue.value = 0.25 * smooth(0.04, 0.12, t);
      s.star.visible = s.core.visible = sOut > 0.002 || cOut > 0.002;
      // E. energy sphere: expands like a pop, white -> gold, gone by 0.14
      const pIn = expoOut(t / 0.07), pOut = 1 - smooth(0.03, 0.14, t);
      s.sphere.position.copy(s.p); s.sphere.quaternion.copy(cam.quaternion); s.sphere.scale.setScalar((0.08 + 0.3 * pIn) * sz);
      U(s.sphere).uA.value = pOut * 0.8; U(s.sphere).uI.value = 1.4 * k; U(s.sphere).uHue.value = 0.55 + 0.45 * smooth(0, 0.1, t); U(s.sphere).uR.value = 0.8; s.sphere.visible = pOut > 0.002;
      // C. vertical shock ring (faces the attacker): 0.25 -> 1.35 m, gone by 0.24
      const vr = expoOut(t / 0.16), vA = (1 - smooth(0.05, 0.2, t)) * smooth(0, 0.015, t);
      s.vring.scale.setScalar((0.2 + 0.72 * vr) * sz); U(s.vring).uA.value = vA * 0.85; U(s.vring).uI.value = 1.3 * k; U(s.vring).uHue.value = 0.5; U(s.vring).uR.value = 0.6; s.vring.visible = vA > 0.002;
    }
    // C. ground ring under the target: 0.03 -> 0.40, 0.4 -> 2.4 m, fades out towards the rim
    const gt = t - (s.whiff ? 0 : 0.03), gr = expoOut(gt / 0.3), gA = smooth(0, 0.03, gt) * (1 - smooth(0.1, 0.32, gt)) * (s.whiff ? 0.35 : 1);
    s.gring.scale.setScalar((0.3 + 1.25 * gr) * sz * (s.whiff ? 0.6 : 1)); U(s.gring).uA.value = gA; U(s.gring).uI.value = 1.2 * k; U(s.gring).uHue.value = 0.5; U(s.gring).uR.value = 0.5; s.gring.visible = gA > 0.002;
    // E. short rays
    {
      const fa = s.rays.geometry.attributes.aFade, hu = s.rays.geometry.attributes.aHue; let n = 0;
      for (const r of s.ry) {
        const u = t - r.dl; if (u < 0 || u > 0.16) continue;
        const L = r.L * sz * expoOut(u / 0.045) * (1 - 0.35 * smooth(0.06, 0.16, u)), W = 0.6 * r.w * sz * (1 - 0.6 * smooth(0.05, 0.16, u));
        _q.setFromUnitVectors(Z3, r.d); _v.copy(s.p).addScaledVector(r.d, 0.08 + 0.25 * smooth(0.05, 0.16, u) * r.L);
        _m.compose(_v, _q, _s.set(W, W, L)); s.rays.setMatrixAt(n, _m); fa.setX(n, 1 - smooth(0.07, 0.16, u)); hu.setX(n, r.hue); n++;
      }
      s.rays.count = n; s.rays.instanceMatrix.needsUpdate = true; fa.needsUpdate = true; hu.needsUpdate = true; U(s.rays).uI.value = 2.0 * k; U(s.rays).uR.value = 1;
    }
    // D. light shards (white / gold) with gravity
    {
      const fa = s.shards.geometry.attributes.aFade, hu = s.shards.geometry.attributes.aHue; let n = 0;
      for (const p of s.sh) {
        if (t > p.life) continue; p.v.y -= 9 * dt; p.v.multiplyScalar(Math.max(0, 1 - 1.5 * dt)); p.p.addScaledVector(p.v, dt);
        if (p.p.y < s.gy + 0.03) { p.p.y = s.gy + 0.03; p.v.set(p.v.x * 0.3, 0, p.v.z * 0.3); }
        const u = t / p.life; _v.copy(p.v); if (_v.lengthSq() < 1e-4) _v.set(0, -1, 0); _q.setFromUnitVectors(Z3, _v.normalize());
        _m.compose(p.p, _q, _s.set(p.len * 0.5 * sz, p.len * 0.5 * sz, p.len * sz * (1.3 - u * 0.6))); s.shards.setMatrixAt(n, _m); fa.setX(n, Math.pow(1 - u, 0.8) * 1.2); hu.setX(n, p.hue); n++;
      }
      s.shards.count = n; s.shards.instanceMatrix.needsUpdate = true; fa.needsUpdate = true; hu.needsUpdate = true; U(s.shards).uI.value = 1.5 * k; U(s.shards).uR.value = 1;
    }
    // embers: a few soft gold points drifting up after the flash
    if (cam) {
      const fa = s.embers.geometry.attributes.aFade, hu = s.embers.geometry.attributes.aHue; let n = 0;
      for (const p of s.em) {
        const u = (t - p.t0) / p.life; if (u < 0 || u > 1) continue; p.p.addScaledVector(p.v, dt); p.v.multiplyScalar(Math.max(0, 1 - 2 * dt));
        _m.compose(p.p, cam.quaternion, _s.setScalar(p.sz * sz)); s.embers.setMatrixAt(n, _m); fa.setX(n, Math.sin(u * Math.PI) * 0.9); hu.setX(n, 0.95); n++;
      }
      s.embers.count = n; s.embers.instanceMatrix.needsUpdate = true; fa.needsUpdate = true; hu.needsUpdate = true; U(s.embers).uI.value = 1.2 * k; U(s.embers).uR.value = 0.6;
    }
    // D. dust puffs (normal blend): thrown to both sides, slow down, rise a little, grow and thin out
    if (cam) {
      const fa = s.dust.geometry.attributes.aFade, hu = s.dust.geometry.attributes.aHue; let n = 0;
      for (const p of s.du) {
        const u = (t - p.t0) / p.life; if (u < 0 || u > 1) continue;
        p.v.multiplyScalar(Math.max(0, 1 - 4.5 * dt)); p.v.y += 0.4 * dt; p.p.addScaledVector(p.v, dt);
        _q.setFromAxisAngle(Z3, p.rot + u * 0.6); _m.compose(p.p, cam.quaternion.clone().multiply(_q), _s.setScalar(p.sz * sz * (0.45 + 0.75 * easeOut(u * 1.4))));
        s.dust.setMatrixAt(n, _m); fa.setX(n, smooth(0, 0.08, u) * (1 - smooth(0.35, 1, u)) * 0.85); hu.setX(n, p.hue); n++;
      }
      s.dust.count = n; s.dust.instanceMatrix.needsUpdate = true; fa.needsUpdate = true; hu.needsUpdate = true;
    }
    // D. stone chips: ballistic, bounce once, lie on the ground, fade at the end
    {
      const fa = s.rocks.geometry.attributes.aFade, hu = s.rocks.geometry.attributes.aHue; let n = 0;
      for (const p of s.rk) {
        if (t > p.life) continue; p.v.y -= 14 * dt; p.p.addScaledVector(p.v, dt);
        if (p.p.y < s.gy + p.sz * 0.5) { p.p.y = s.gy + p.sz * 0.5; p.v.set(p.v.x * 0.35, Math.abs(p.v.y) * 0.25, p.v.z * 0.35); p.rx *= 0.4; p.ry *= 0.4; }
        else { p.e.x += p.rx * dt; p.e.y += p.ry * dt; }
        _q.setFromEuler(p.e); _m.compose(p.p, _q, _s.setScalar(p.sz * sz)); s.rocks.setMatrixAt(n, _m); fa.setX(n, 1 - smooth(0.7, 1, t / p.life)); hu.setX(n, p.hue); n++;
      }
      s.rocks.count = n; s.rocks.instanceMatrix.needsUpdate = true; fa.needsUpdate = true; hu.needsUpdate = true;
    }
    return t < HIT_LIFE;
  }
  update(dt) {
    if (!dt) return; dt *= BASH.speed;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const s = this.live[i]; s.t += dt;
      const alive = s.kind === 'cast' ? this._castTick(s, dt) : this._hitTick(s, dt);
      if (!alive) this._release(s, i);
    }
  }
  _release(s, i) { this.root.remove(s.g); s.a = null; this.live.splice(i, 1); const f = this.free[s.kind]; if (f.length < 6) f.push(s); }
  clear() { for (let i = this.live.length - 1; i >= 0; i--) this._release(this.live[i], i); }
}
if (typeof window !== 'undefined') window.BASH_FX = BASH;
