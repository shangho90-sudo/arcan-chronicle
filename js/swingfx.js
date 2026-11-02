// Weapon-swing effects built from Tripo-generated meshes (assets/fx3d/*.json, see tools/vfx/process_vfx.py):
//  - slash: a glowing crescent that sweeps out along the swing at the moment of impact (follows the swing direction)
//  - burst: a spiky star that pops on the target when a hit lands, with a flat shock ring and a few crystal shards
// All pieces use one additive fresnel shader (bright core, coloured rim), so they read as light, not as solid objects,
// and stay crisp at any zoom (no pixel sprites).
import { THREE, CAM } from './render.js';

const DEG = Math.PI / 180;
const clamp01 = x => Math.max(0, Math.min(1, x));
const easeOut = t => 1 - (1 - t) ** 3;
const MESHES = {};
let loading = null;
function b64(s, T) { const r = atob(s), u = new Uint8Array(r.length); for (let i = 0; i < r.length; i++) u[i] = r.charCodeAt(i); return new T(u.buffer); }
export function loadSwingFx() {
  if (!loading) loading = Promise.all(['slash', 'burst', 'shard', 'ring'].map(n => fetch('assets/fx3d/' + n + '.json').then(r => r.json()).then(j => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(b64(j.pos, Float32Array), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(b64(j.nrm, Float32Array), 3));
    g.setIndex(new THREE.BufferAttribute(b64(j.idx, Uint32Array), 1));
    g.computeBoundingSphere(); MESHES[n] = g;
  }))).catch(e => { console.warn('swing fx', e); loading = null; });
  return loading;
}

const VS = `varying vec3 vN; varying vec3 vV; varying vec3 vL;
void main() { vL = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
// uSweep: reveal along the crescent (local z from -0.5 to 0.5) - a bright leading edge with a fading tail
const FS = `uniform vec3 uCore; uniform vec3 uRim; uniform float uO; uniform float uSweep; uniform float uTail; uniform float uUseSweep;
varying vec3 vN; varying vec3 vV; varying vec3 vL;
void main() {
  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float a = 0.28 + 0.72 * pow(f, 1.4);
  vec3 c = mix(uCore, uRim, smoothstep(0.15, 0.9, f));
  if (uUseSweep > 0.5) {
    float s = clamp(vL.y / 0.72 + 0.5, 0.0, 1.0);          // 0..1 from one tip of the crescent to the other
    float lead = smoothstep(uSweep + 0.02, uSweep - 0.06, s);
    float tail = smoothstep(uSweep - uTail - 0.25, uSweep - 0.05, s);
    a *= lead * (0.25 + 0.75 * tail); c = mix(c, uCore * 1.3, smoothstep(uSweep - 0.12, uSweep, s) * lead);
  }
  gl_FragColor = vec4(c * a * uO, 1.0);
}`;
function mat(core, rim, sweep = false) {
  return new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    uniforms: { uCore: { value: new THREE.Color(...core) }, uRim: { value: new THREE.Color(...rim) }, uO: { value: 1 }, uSweep: { value: 0 }, uTail: { value: 0.6 }, uUseSweep: { value: sweep ? 1 : 0 } } });
}
const g3 = (p, y = 0) => new THREE.Vector3(p.x, (p.y || 0) + y, -p.z);
const PAL = {
  hit: { core: [2.2, 2.6, 3.2], rim: [0.25, 0.6, 2.6] },
  crit: { core: [3.2, 2.6, 1.4], rim: [2.2, 0.9, 0.25] },
};

class Piece {
  constructor(scene, geo, m, life) { this.scene = scene; this.m = m; this.mesh = new THREE.Mesh(geo, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = 9; scene.add(this.mesh); this.t = 0; this.life = life; this.dead = false; }
  dispose() { this.dead = true; this.scene.remove(this.mesh); this.m.dispose(); }
}

export class SwingFx {
  constructor(scene) { this.scene = scene; this.items = []; loadSwingFx(); }
  get ready() { return !!MESHES.slash; }
  /** crescent sweeping around the swinger. dir = facing {x,z} (game space); side +1 = forehand (right->left), -1 = backhand */
  slash(pos, dir, side = 1, o = {}) {
    if (!this.ready) return;
    const pal = o.crit ? PAL.crit : PAL.hit, p = new Piece(this.scene, MESHES.slash, mat(pal.core, pal.rim, true), 0.26);
    // the Tripo crescent: tips along local y, convex spine towards local +z, thickness along local x.
    // Lay it around the swinger: spine forward, tips to the sides, thickness up, rolled for the diagonal cut.
    const m = Math.hypot(dir.x, dir.z) || 1, fwd = new THREE.Vector3(dir.x / m, 0, -dir.z / m), up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(fwd, up).normalize().multiplyScalar(side > 0 ? 1 : -1);
    const roll = (side > 0 ? 32 : -28) * DEG;
    up.applyAxisAngle(fwd, roll); right.applyAxisAngle(fwd, roll);
    const r = o.radius || 1.25, M = p.mesh;
    M.matrixAutoUpdate = false;
    M.matrix.makeBasis(up.clone().multiplyScalar(r * 0.9), right.clone().multiplyScalar(r * 2.1), fwd.clone().multiplyScalar(r * 1.15));
    M.matrix.setPosition(g3(pos, 0.95).addScaledVector(fwd, r * 0.25));
    p.kind = 'slash'; this.items.push(p);
  }
  /** star burst + shock ring + shards where a hit lands */
  hit(pos, o = {}) {
    if (!this.ready) return;
    const crit = !!o.crit, pal = crit ? PAL.crit : PAL.hit, c = g3(pos, 0.75), s = (o.scale || 1) * (crit ? 1.35 : 1);
    const b = new Piece(this.scene, MESHES.burst, mat(pal.core, pal.rim), crit ? 0.32 : 0.24); b.kind = 'burst'; b.c = c; b.s = 0.95 * s; b.spin = (Math.random() - 0.5) * 6; b.roll = Math.random() * Math.PI;
    this.items.push(b);
    const r = new Piece(this.scene, MESHES.ring, mat([pal.core[0] * 0.7, pal.core[1] * 0.7, pal.core[2] * 0.7], pal.rim), crit ? 0.4 : 0.3); r.kind = 'ring'; r.c = g3(pos, 0.12); r.s = (crit ? 1.5 : 1.0) * (o.scale || 1);
    this.items.push(r);
    const n = crit ? 7 : 4;
    for (let i = 0; i < n; i++) {
      const sh = new Piece(this.scene, MESHES.shard, mat(pal.core, pal.rim), 0.38 + Math.random() * 0.15); sh.kind = 'shard';
      const a = Math.random() * Math.PI * 2, up = 2 + Math.random() * 2.5, sp = 2.2 + Math.random() * 2.2;
      sh.c = c.clone(); sh.v = new THREE.Vector3(Math.cos(a) * sp, up, Math.sin(a) * sp); sh.s = (0.1 + Math.random() * 0.07) * (crit ? 1.3 : 1);
      sh.mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6); sh.w = new THREE.Vector3(Math.random() * 14 - 7, Math.random() * 14 - 7, Math.random() * 14 - 7);
      this.items.push(sh);
    }
  }
  update(dt, camera) {
    for (const p of this.items) {
      if (p.dead) continue;
      p.t += dt; const u = p.t / p.life;
      if (u >= 1) { p.dispose(); continue; }
      const U = p.m.uniforms;
      if (p.kind === 'slash') { U.uSweep.value = 0.05 + 1.15 * easeOut(clamp01(u / 0.55)); U.uO.value = 1 - clamp01((u - 0.45) / 0.55); }
      else if (p.kind === 'burst') {
        const pop = u < 0.22 ? easeOut(u / 0.22) * 1.15 : 1.15 - 0.25 * clamp01((u - 0.22) / 0.78);
        p.mesh.position.copy(p.c); if (camera) p.mesh.quaternion.copy(camera.quaternion);
        p.mesh.rotateY(Math.PI / 2); p.mesh.rotateX(p.roll + p.spin * p.t);   // star (y-z plane) faces the camera
        p.mesh.scale.setScalar(p.s * pop); U.uO.value = 1 - clamp01((u - 0.3) / 0.7) ** 1.5;
      } else if (p.kind === 'ring') {
        p.mesh.position.copy(p.c); p.mesh.scale.setScalar(p.s * (0.25 + 1.0 * easeOut(u))); p.mesh.rotation.y = p.t * 2; U.uO.value = (1 - u) ** 2 * 0.8;
      } else if (p.kind === 'shard') {
        p.v.y -= 9 * dt; p.c.addScaledVector(p.v, dt); p.mesh.position.copy(p.c); p.mesh.rotation.x += p.w.x * dt; p.mesh.rotation.y += p.w.y * dt; p.mesh.rotation.z += p.w.z * dt;
        p.mesh.scale.setScalar(p.s * (1 - 0.5 * u)); U.uO.value = 1 - u * u;
      }
    }
    if (this.items.some(p => p.dead)) this.items = this.items.filter(p => !p.dead);
  }
  clear() { for (const p of this.items) if (!p.dead) p.dispose(); this.items = []; }
}
