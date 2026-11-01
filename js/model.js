// Real-time skinned 3D player characters (from the user's 3D models), drawn directly in the 3D world.
// Same interface as SpriteBody (play / setDir / flash / setTint / setVisible / place / update / dispose / sh),
// so actors.js keeps working; animation comes from the game's pose table, applied to the skeleton and
// interpolated every frame, and the body turns smoothly to any angle.
import { THREE, T, tex } from './render.js';
import { itemModel, isWeaponModel } from './items3d.js';

const DEG = Math.PI / 180;
export const PLAYER_MODELS = {
  m: { file: 'boy', height: 1.65, headPitch: -10 },
  f: { file: 'girl', height: 1.6, headPitch: -14 },
};
/** town NPCs made from the user's character sheet (Tripo image->3D + auto rig), keyed by npc id; hold their own items */
export const NPC_MODELS = {
  armorer:            { file: 'npc_armorer', height: 1.62, headPitch: -6, npc: true },
  merchant:           { file: 'npc_merchant', height: 1.45, headPitch: -6, npc: true },
  master_pharmacist:  { file: 'npc_pharmacist', height: 1.52, headPitch: -6, npc: true },
  master_cook:        { file: 'npc_cook', height: 1.5, headPitch: -6, npc: true },
  master_blacksmith:  { file: 'npc_blacksmith', height: 1.72, headPitch: -6, npc: true },
  master_hairdresser: { file: 'npc_hairdresser', height: 1.55, headPitch: -6, npc: true },
  master_artist:      { file: 'npc_artist', height: 1.5, headPitch: -6, npc: true },
  elder:              { file: 'npc_elder', height: 1.5, headPitch: -6, npc: true },
  guard:              { file: 'npc_guard', height: 1.62, headPitch: -6, npc: true },
};
const WEAPON = { novice: 'sword', pharmacist: 'pestle', cook: 'knife', blacksmith: 'hammer', hairdresser: 'scissors', artist: 'brush' };
const OFF = { cook: 'pan', hairdresser: 'dryer', artist: 'palette' };

let actionsPromise = null;
const modelCache = new Map();

/** pseudo sprite-sheet (actions with frames / fps / hitFrame) so hitTime / duration / action() keep working */
export async function loadActions() {
  if (!actionsPromise) actionsPromise = fetch('assets/models/actions.json').then(r => r.json()).then(list => {
    const actions = {}; for (const a of list) actions[a.name] = a;
    return { name: 'model', model: true, actions, meta: { actions: list } };
  });
  return actionsPromise;
}

export function loadNpcModel(id) { return NPC_MODELS[id] ? loadModelCfg(NPC_MODELS[id]) : null; }
export async function loadPlayerModel(gender) { return loadModelCfg(PLAYER_MODELS[gender] || PLAYER_MODELS.m); }
async function loadModelCfg(cfg) {
  if (modelCache.has(cfg.file)) return modelCache.get(cfg.file);
  const p = (async () => {
    const base = 'assets/models/' + cfg.file;
    const r = await fetch(base + '.json'); if (!r.ok) throw new Error(base + ' ' + r.status);
    const meta = await r.json();
    const b64 = (s, Tp) => { const raw = atob(s), u8 = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i); return new Tp(u8.buffer); };
    const pos = b64(meta.pos, Float32Array), tri = b64(meta.tri, Uint32Array), uv = b64(meta.uv, Float32Array), si = b64(meta.si, Float32Array), sw = b64(meta.sw, Float32Array);
    // smooth normals per control point (bind pose)
    const nrm = new Float32Array(pos.length);
    for (let t = 0; t < tri.length; t += 3) {
      const a = tri[t] * 3, b = tri[t + 1] * 3, c = tri[t + 2] * 3;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const i of [a, b, c]) { nrm[i] += nx; nrm[i + 1] += ny; nrm[i + 2] += nz; }
    }
    // expand to a triangle soup (UV seams), per-corner skin data
    const n = tri.length, P = new Float32Array(n * 3), N = new Float32Array(n * 3), SI = new Uint16Array(n * 4), SW = new Float32Array(n * 4);
    for (let k = 0; k < n; k++) {
      const v = tri[k];
      P[k * 3] = pos[v * 3]; P[k * 3 + 1] = pos[v * 3 + 1]; P[k * 3 + 2] = pos[v * 3 + 2];
      const l = Math.hypot(nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]) || 1;
      N[k * 3] = nrm[v * 3] / l; N[k * 3 + 1] = nrm[v * 3 + 1] / l; N[k * 3 + 2] = nrm[v * 3 + 2] / l;
      for (let j = 0; j < 4; j++) { SI[k * 4 + j] = si[v * 4 + j]; SW[k * 4 + j] = sw[v * 4 + j]; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(SI, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4));
    g.computeBoundingSphere();
    const texture = new THREE.TextureLoader().load(base + '.jpg');
    texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
    const bones = meta.bones.map(b => ({ name: b.name, parent: b.parent, bind: new THREE.Matrix4().fromArray(b.bind) }));
    for (const b of bones) { b.inv = b.bind.clone().invert(); b.t = new THREE.Vector3().setFromMatrixPosition(b.bind); }
    const byName = Object.fromEntries(bones.map((b, i) => [b.name, i]));
    const scale = cfg.height / (meta.max[1] - meta.min[1]);
    return { cfg, geometry: g, texture, bones, byName, scale, leg: byName.Left_UpperLeg !== undefined ? legGeometry(bones, byName, scale, meta.min[1]) : null };
  })();
  modelCache.set(cfg.file, p);
  return p;
}

// ---------------------------------------------------------------- pose -> bone rotations (bind-world axes)
const _m = () => new THREE.Matrix4();
const rx = d => _m().makeRotationX(d * DEG), ry = d => _m().makeRotationY(d * DEG), rz = d => _m().makeRotationZ(d * DEG);
const mul = (...ms) => ms.reduce((a, b) => a.multiply(b), _m());
function poseToBones(p, headPitch) {
  const Q = {}, lean = p.lean || 0, twist = p.twist || 0, fall = p.fall || 0;
  Q.Hips = mul(ry(twist * 0.35), rx(-fall));
  Q.Spine = mul(ry(twist * 0.35), rx(lean * 0.5));
  Q.Chest = mul(ry(twist * 0.3), rx(lean * 0.5));
  Q.Head = rx(-(lean * 0.4) + headPitch + (p.squint ? 6 : 0));
  for (const [side, nm, arm] of [[-1, 'Right', p.armR], [1, 'Left', p.armL]]) {
    const f = arm[0], down = Math.max(0, 90 - arm[1]);
    Q[nm + '_UpperArm'] = mul(rx(-f), rz(side > 0 ? -down : down));
    const bend = f > 60 ? 8 : 20;
    Q[nm + '_LowerArm'] = ry(side > 0 ? -bend : bend);
    for (const fg of ['Index', 'Middle', 'Ring', 'Pinky']) { Q[nm + '_' + fg + 'Proximal'] = rz(side > 0 ? -60 : 60); Q[nm + '_' + fg + 'Intermediate'] = rz(side > 0 ? -70 : 70); }
  }
  for (const [nm, a0] of [['Left', p.legL || 0], ['Right', p.legR || 0]]) {
    const a = a0 * 0.62;
    Q[nm + '_UpperLeg'] = rx(-a + fall * 0.65);
    Q[nm + '_LowerLeg'] = rx(Math.max(0, -a) * 1.1 + Math.max(0, a) * 0.5 + 4);
    Q[nm + '_Foot'] = rx(-Math.max(0, -a) * 0.3);
  }
  return Q;
}
/** NPCs keep the pose they were modelled in (holding their tools); only breathing and a small sway / head turn */
function npcIdle(t, look) {
  const br = Math.sin(t * 2.1), sw = Math.sin(t * 0.7);
  return {
    Waist: ry(sw * 2), Spine01: rx(br * 0.8), Spine02: mul(rx(br * 1.4), ry(sw * 1.5)),
    Head: mul(ry(Math.max(-35, Math.min(35, look)) + sw * 3), rx(Math.sin(t * 0.9) * 2)),
  };
}
const NUM = ['bob', 'lean', 'twist', 'legL', 'legR', 'wOff', 'offOff', 'fall', 'sink'];
function lerpPose(a, b, k) {
  const o = { armR: [a.armR[0] + (b.armR[0] - a.armR[0]) * k, a.armR[1] + (b.armR[1] - a.armR[1]) * k], armL: [a.armL[0] + (b.armL[0] - a.armL[0]) * k, a.armL[1] + (b.armL[1] - a.armL[1]) * k], squint: k < 0.5 ? a.squint : b.squint, held: a.held };
  for (const f of NUM) o[f] = (a[f] || 0) + ((b[f] || 0) - (a[f] || 0)) * k;
  return o;
}

// ---------------------------------------------------------------- held items (same shapes as the sprite baker)
function makeProp(kind) {
  const g = new THREE.Group(), M = c => new THREE.MeshLambertMaterial({ color: c });
  const box = (w, h, d, c, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(c)); m.position.set(x, y, z); g.add(m); return m; };
  const cyl = (r, l, c, x, y, z, rotx = 0) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 12), M(c)); m.position.set(x, y, z); m.rotation.x = rotx; g.add(m); return m; };
  const sph = (r, c, x, y, z, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), M(c)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); g.add(m); return m; };
  const R = Math.PI / 2;
  switch (kind) {
    case 'sword': cyl(0.016, 0.1, 0x6e462c, 0, 0, 0, R); box(0.11, 0.022, 0.022, 0xd6b060, 0, 0, 0.055); box(0.012, 0.045, 0.3, 0xdee4ee, 0, 0, 0.22); break;
    case 'pestle': cyl(0.02, 0.26, 0xaa7846, 0, 0, 0.08, R); sph(0.06, 0xece8dc, 0, 0, 0.26, 1, 1, 1.3); break;
    case 'knife': cyl(0.017, 0.1, 0x5a3c28, 0, 0, 0, R); box(0.012, 0.06, 0.18, 0xd6dee8, 0, 0.012, 0.15); break;
    case 'hammer': cyl(0.02, 0.36, 0x80583a, 0, 0, 0.12, R); box(0.09, 0.09, 0.17, 0x7c808c, 0, 0, 0.3).rotation.y = R; break;
    case 'scissors': box(0.012, 0.022, 0.2, 0xdce2ec, 0.016, 0, 0.13).rotation.y = 0.15; box(0.012, 0.022, 0.2, 0xc8cedc, -0.016, 0, 0.13).rotation.y = -0.15; sph(0.03, 0xe65a8c, 0.03, 0, 0); sph(0.03, 0xe65a8c, -0.03, 0, 0); break;
    case 'brush': cyl(0.015, 0.3, 0x825032, 0, 0, 0.1, R); sph(0.04, 0x3cc8c8, 0, 0, 0.29, 1, 1, 1.8); break;
    case 'pan': cyl(0.015, 0.12, 0x3c3232, 0, 0, 0.04, R); cyl(0.1, 0.02, 0x464650, 0, 0, 0.18); break;
    case 'dryer': box(0.04, 0.12, 0.04, 0xf096be, 0, -0.04, 0); cyl(0.04, 0.16, 0xf096be, 0, 0.03, 0.06, R); break;
    case 'palette': sph(0.1, 0xc8a06e, 0, 0, 0.06, 1, 0.18, 0.8); sph(0.018, 0xe65050, 0.03, 0.02, 0.04); sph(0.018, 0x50a0e6, -0.02, 0.02, 0.08); sph(0.018, 0xf0d246, 0.03, 0.02, 0.1); break;
    case 'bottle': sph(0.05, 0x5ad282, 0, 0, 0.03); cyl(0.018, 0.06, 0xdcf0e6, 0, 0, 0.08, R); break;
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ---------------------------------------------------------------- procedural locomotion (feet planted, real knee / ankle motion)
/** leg lengths and bind angles in metres, measured from the model's own skeleton */
function legGeometry(bones, byName, s, minY) {
  const P = n => bones[byName[n]].t, sub = (a, b) => ({ y: (a.y - b.y) * s, z: (a.z - b.z) * s });
  const out = {};
  for (const side of ['Left', 'Right']) {
    const hip = P(side + '_UpperLeg'), knee = P(side + '_LowerLeg'), ank = P(side + '_Foot'), toe = P(side + '_Toes');
    const th = sub(knee, hip), sh = sub(ank, knee), ft = sub(toe, ank);
    out[side] = {
      L1: Math.hypot(th.y, th.z), L2: Math.hypot(sh.y, sh.z),
      a1: Math.atan2(th.z, -th.y), a2: Math.atan2(sh.z, -sh.y),          // bind pitch of thigh / shin from vertical (+ = forward)
      ha: (ank.y - minY) * s, hip: (hip.y - minY) * s,                     // ankle / hip-joint height above the ground
      toe: Math.max(0.06, Math.hypot(ft.y, ft.z) * 0.85),                  // ankle -> ball of the foot (heel-raise pivot)
      side: side === 'Left' ? 1 : -1, ankX: Math.abs(ank.x) * s, hipX: Math.abs(hip.x) * s, Lv: (hip.y - ank.y) * s,
      toeOut: Math.atan2(Math.abs(toe.x - ank.x), toe.z - ank.z) / DEG,    // how far the modelled foot points outward (deg)
    };
  }
  return out;
}
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, k) => a + (b - a) * k;
const fract = x => x - Math.floor(x);

/** gait shape for a ground speed v (m/s): walk below ~1.6 m/s, run with a flight phase above ~3.2 m/s */
function gaitParams(v, leg) {
  const run = sstep(1.6, 3.2, v), L = Math.min(leg.Left.L1 + leg.Left.L2, leg.Right.L1 + leg.Right.L2) * 0.995;
  const duty = lerp(0.62, 0.34, run);                                      // fraction of the cycle a foot is on the ground
  // stance foot travel (relative to the hip): longer steps when faster, limited by what the leg can reach with a bent knee
  const crouch = lerp(0.985, 0.86, run) * L;
  const S = Math.min(0.22 + 0.24 * v, 2 * Math.sqrt(Math.max(0, L * L - crouch * crouch)) + 0.08 * (1 - run));
  return { run, L, duty, S: Math.max(0.12, S), cycle: Math.max(0.12, S) / duty, crouch };
}

/** two-bone IK in the sagittal plane: ankle target (x forward, D below the hip) -> absolute thigh / shin pitch */
function legIK(g, x, D) {
  const d = Math.min(Math.hypot(x, D), (g.L1 + g.L2) * 0.9995), gam = Math.atan2(x, D);
  const c1 = Math.min(1, Math.max(-1, (g.L1 * g.L1 + d * d - g.L2 * g.L2) / (2 * g.L1 * d)));
  const c2 = Math.min(1, Math.max(-1, (g.L2 * g.L2 + d * d - g.L1 * g.L1) / (2 * g.L2 * d)));
  return { th: gam + Math.acos(c1), sh: gam - Math.acos(c2) };            // knee always bends forward
}

/** one foot over the cycle: ankle offset (x along the walk, lift above its rest height) and foot pitch (deg, + = toes up) */
function footAt(ph, G, toe) {
  const run = G.run, S = G.S;
  if (ph < G.duty) {                                                       // stance: planted, moves back at exactly body speed
    const s = ph / G.duty;
    const pf = lerp(24, 34, run) * sstep(lerp(0.55, 0.35, run), 1, s);    // heel raise / push-off
    const strike = lerp(9, 3, run) * (1 - sstep(0, 0.16, s));              // heel strike then foot flat
    return { x: S / 2 - S * s, lift: toe * Math.sin(pf * DEG), pitch: strike - pf, stance: true, s };
  }
  const s = (ph - G.duty) / (1 - G.duty), pf0 = lerp(24, 34, run);
  const e = sstep(0, 1, Math.min(1, Math.max(0, (s - 0.08 * run) / (1 - 0.08 * run))));
  const H = lerp(0.075, 0.24, run);                                        // swing clearance; a run kicks the heel up behind
  const lift = Math.max(H * Math.sin(Math.PI * Math.pow(s, lerp(0.85, 0.65, run))), toe * Math.sin(pf0 * DEG) * (1 - s) * (1 - s));
  const pitch = s < 0.55 ? lerp(-pf0, 2, sstep(0, 0.55, s)) : lerp(2, lerp(9, 3, run), sstep(0.55, 1, s));
  return { x: -S / 2 + S * e, lift, pitch, stance: false, s };
}

/** bone rotations + pelvis height for the gait at phase ph (0..1, left heel strike at 0) */
function gaitPose(md, ph, v, base) {
  const leg = md.leg, G = gaitParams(v, leg), run = G.run, Q = {};
  const feet = { Left: footAt(fract(ph), G, leg.Left.toe), Right: footAt(fract(ph + 0.5), G, leg.Right.toe) };
  // pelvis height: as high as the planted feet allow (compass gait when walking, bent-knee compression when running)
  const reach = (f, g) => Math.sqrt(Math.max(0, G.L * G.L - f.x * f.x)) + f.lift;
  const want = s => lerp(G.L * 0.99, G.crouch - 0.045 * Math.sin(Math.PI * s), run);
  let D = Infinity;
  for (const side of ['Left', 'Right']) { const f = feet[side]; if (f.stance) D = Math.min(D, want(f.s), reach(f)); }
  if (D === Infinity) {                                                    // flight phase (running): small ballistic rise
    const end = Math.min(want(1), reach({ x: -G.S / 2, lift: leg.Left.toe * Math.sin(lerp(24, 34, run) * DEG) }));
    const u = fract(ph * 2 - G.duty * 2) / Math.max(1e-3, 1 - G.duty * 2);
    D = end + 0.03 * run * Math.sin(Math.PI * Math.min(1, Math.max(0, u)));
  }
  const hipH = D + (leg.Left.ha + leg.Right.ha) / 2;
  const sw = Math.cos(2 * Math.PI * ph);                                   // +1 when the left leg is forward
  const yawA = lerp(5, 8, run), rollA = lerp(3, 2, run);
  Q.Hips = mul(ry(-yawA * sw), rz(rollA * Math.sin(4 * Math.PI * ph)));
  const hipsInv = Q.Hips.clone().invert();
  for (const side of ['Left', 'Right']) {
    const g = leg[side], f = feet[side];
    const ik = legIK(g, f.x, hipH - g.ha - f.lift);
    const dTh = ik.th - g.a1, dSh = ik.sh - g.a2;                        // change from the bind pose (rad)
    Q[side + '_UpperLeg'] = mul(hipsInv, rx(-dTh / DEG));                  // legs keep their own heading: the pelvis twist must not drag planted feet
    Q[side + '_LowerLeg'] = rx(-(dSh - dTh) / DEG);
    Q[side + '_Foot'] = rx(-(f.pitch * DEG - dSh) / DEG);
  }
  // upper body: lean into a run, shoulders counter-rotate the pelvis, arms swing opposite the legs
  const lean = lerp(3, 11, run);
  Q.Spine = mul(ry(yawA * 0.9 * sw), rx(lean * 0.55));
  Q.Chest = mul(ry(yawA * 0.6 * sw), rx(lean * 0.45));
  Q.Head = rx(-lean * 0.8 + md.cfg.headPitch);
  const armA = lerp(20, 38, run), armF = lerp(4, 14, run);
  for (const [side, nm, sgn] of [[-1, 'Right', 1], [1, 'Left', -1]]) {
    const f = armF + sgn * armA * sw, down = Math.max(0, 90 - (base[side > 0 ? 'armL' : 'armR'][1] || 12)) - 4 * run;
    // elbow: bends more as the arm swings forward, much more when running
    const bend = lerp(18, 80, run) + Math.max(0, f) * lerp(0.35, 0.25, run);
    Q[nm + '_UpperArm'] = mul(rx(-f), rz(side > 0 ? -down : down));
    Q[nm + '_LowerArm'] = ry(side > 0 ? -bend : bend);
  }
  return { Q, hipH, G };
}
/** natural gait alignment: the models stand with feet ~0.37 m apart and toes turned out (up to 18 deg), which reads as
 *  a waddling, splay-footed walk. Bring each ankle in towards a ~9 cm track (hip adduction) and turn the foot so the toes
 *  point only ~5 deg out (thigh internal rotation + a little at the ankle). w = gait weight: standing keeps a relaxed stance. */
const TRACK = 0.09, TOE_OUT = 8;
function alignLegs(md, Q, w) {
  for (const side of ['Left', 'Right']) {
    const g = md.leg[side], sg = g.side;
    const add = Math.atan2(Math.max(0, g.ankX - lerp(Math.max(TRACK, g.ankX - 0.05), TRACK, w)), g.Lv) / DEG;   // stand: 5 cm narrower
    const turn = Math.max(0, g.toeOut - TOE_OUT);
    const up = Q[side + '_UpperLeg'] || _m(), foot = Q[side + '_Foot'] || _m();
    // pitch / IK first, then adduct about the forward axis, then internal rotation about vertical
    Q[side + '_UpperLeg'] = mul(ry(-sg * turn * 0.6), rz(-sg * add), up);
    Q[side + '_Foot'] = mul(ry(-sg * turn * 0.4), foot);
  }
  return Q;
}
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
function blendBones(A, B, w) {
  if (w >= 0.999) return Object.assign({}, A, B);
  const out = Object.assign({}, A);
  for (const k in B) {
    _qa.setFromRotationMatrix(A[k] || _m()); _qb.setFromRotationMatrix(B[k]);
    out[k] = _m().makeRotationFromQuaternion(_qa.slerp(_qb, w));
  }
  return out;
}

let shadowMat = null;
const shadowGeo = new THREE.PlaneGeometry(1, 0.85);

export class ModelBody {
  /** md = loaded model (loadPlayerModel), sh = action table (loadActions) */
  constructor(scene, md, sh, shadowRadius, job = 'novice') {
    this.scene = scene; this.md = md; this.sh = sh; this.action = 'idle'; this.t = 0; this.speed = 1; this.finished = false;
    this.flashT = 0; this.visible = true; this.dir = 0; this.yaw = 0; this.targetYaw = 0;
    // locomotion: phase advances with the distance actually travelled, so planted feet never slide
    this.gaitPh = 0; this.gaitW = 0; this.gaitV = 0; this.moved = 0; this.lastXZ = null; this.treadmill = 0;
    this.root = new THREE.Group();
    this.mat = new THREE.MeshLambertMaterial({ map: md.texture, emissive: 0xffffff, emissiveIntensity: 0 });
    this.mesh = new THREE.SkinnedMesh(md.geometry, this.mat);
    this.mesh.castShadow = true; this.mesh.frustumCulled = false;
    this.mesh.scale.setScalar(md.scale);
    this.root.add(this.mesh);
    // skeleton built from the bind matrices (model space); bones parented under the mesh
    this.bones = md.bones.map(b => { const bone = new THREE.Bone(); bone.name = b.name; bone.matrixAutoUpdate = false; return bone; });
    md.bones.forEach((b, i) => (b.parent >= 0 ? this.bones[b.parent] : this.mesh).add(this.bones[i]));
    this.skeleton = new THREE.Skeleton(this.bones, md.bones.map(b => b.inv.clone()));
    this.mesh.bind(this.skeleton, new THREE.Matrix4());
    if (!shadowMat) shadowMat = new THREE.MeshBasicMaterial({ map: tex('assets/ui/shadow.png'), transparent: true, depthWrite: false });
    this.shadow = new THREE.Mesh(shadowGeo, shadowMat); this.shadow.rotation.x = -Math.PI / 2;
    const ss = shadowRadius * 2.6; this.shadow.scale.set(ss, ss, 1);
    scene.add(this.root, this.shadow);
    this.props = { R: null, L: null }; this.propKind = { R: null, L: null };
    this.setJob(job); this.apply();
  }
  setJob(job) { this.job = job; if (this.md.cfg.npc) { this.weapon = null; this.off = null; return; } this.weapon = WEAPON[job] || 'sword'; this.off = OFF[job] || null; }
  setSheet() { }   // sprite API compatibility (job change goes through setJob)
  play(name, speed = 1, restart = false) {
    if (!this.sh.actions[name]) name = 'idle';
    this.speed = speed;
    if (name === this.action && !restart) return;
    this.action = name; this.t = 0; this.finished = false;
  }
  setDir(d) { this.dir = ((d % 8) + 8) % 8; this.targetYaw = this.dir * 45 * DEG; }
  /** continuous facing from a Unity-space ground vector */
  setFacing(x, z) { if (x * x + z * z < 1e-6) return; this.targetYaw = Math.atan2(x, -z); }
  flash(d) { this.flashT = Math.max(this.flashT, d); }
  setTint(r, g, b) { this.tint = [r, g, b]; this.applyColor(); }
  /** 염색: outfit colour (texture multiplied towards the dye, skin keeps most of its tone) */
  setDye(hex) { this.dye = hex || ''; this.applyColor(); }
  applyColor() {
    const t = this.tint || [1, 1, 1], c = new THREE.Color(t[0], t[1], t[2]);
    if (this.dye) { const d = new THREE.Color(this.dye); c.multiply(new THREE.Color(1, 1, 1).lerp(d, 0.45)); }
    this.mat.color.copy(c);
  }
  setVisible(v) { this.visible = v; this.root.visible = v; this.shadow.visible = v; }
  get time01() { const a = this.sh.actions[this.action]; return Math.min(1, this.t * a.fps / a.frames); }
  place(p) {
    if (this.lastXZ) { const d = Math.hypot(p.x - this.lastXZ.x, p.z - this.lastXZ.z); if (d < 1) this.moved += d; }
    this.lastXZ = { x: p.x, z: p.z };
    const tp = T(p); this.root.position.copy(tp); this.shadow.position.set(tp.x, tp.y + 0.03, tp.z);
  }
  update(dt) {
    this.t += dt * Math.max(0, this.speed);
    if (this.flashT > 0) this.flashT -= dt;
    this.mat.emissiveIntensity = this.flashT > 0 ? 0.7 : 0;
    let dy = this.targetYaw - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * Math.min(1, dt * 18);
    // ground speed from real displacement (or a fixed demo speed for previews standing still)
    const dist = this.treadmill > 0 ? this.treadmill * dt : this.moved; this.moved = 0;
    if (dt > 0) this.gaitV += (dist / dt - this.gaitV) * Math.min(1, dt * 12);
    const loco = this.action === 'walk' && this.gaitV > 0.15;
    this.gaitW += ((loco ? 1 : 0) - this.gaitW) * Math.min(1, dt * (loco ? 10 : 14));
    if (this.gaitW > 0.01) this.gaitPh = fract(this.gaitPh + dist / gaitParams(Math.max(0.3, this.gaitV), this.md.leg).cycle);
    else this.gaitPh = 0.15;                                               // next start: mid-stance, not mid-stride
    this.apply();
  }
  currentPose() {
    const a = this.sh.actions[this.action], n = a.frames;
    let f = this.t * a.fps;
    if (a.loop) { f %= n; const i = Math.floor(f), j = (i + 1) % n; return lerpPose(a.poses[i], a.poses[j], f - i); }
    if (f >= n - 1) { if (f >= n) this.finished = true; return a.poses[n - 1]; }
    const i = Math.floor(f); return lerpPose(a.poses[i], a.poses[i + 1], f - i);
  }
  apply() {
    const md = this.md, p = this.currentPose(); let Q = md.cfg.npc ? npcIdle(this.t, this.lookYaw || 0) : poseToBones(p, md.cfg.headPitch);
    let bodyY = md.cfg.npc ? 0 : (p.bob || 0) - (p.sink || 0);
    if (!md.cfg.npc && this.gaitW > 0.01 && md.leg) {
      const gp = gaitPose(md, this.gaitPh, Math.max(0.3, this.gaitV), p), w = Math.min(1, this.gaitW);
      Q = blendBones(Q, gp.Q, w);
      const hipBind = (md.leg.Left.hip + md.leg.Right.hip) / 2;
      bodyY = lerp(bodyY, gp.hipH - hipBind, w);
    }
    if (!md.cfg.npc && md.leg) Q = alignLegs(md, Q, Math.min(1, this.gaitW));
    // world (model-space) matrix of every bone: parent's change applied to the bind matrix rotated about the joint
    const W = new Array(md.bones.length);
    for (let i = 0; i < md.bones.length; i++) {
      const b = md.bones[i], q = Q[b.name];
      let local = b.bind;
      if (q) local = mul(_m().makeTranslation(b.t.x, b.t.y, b.t.z), q, _m().makeTranslation(-b.t.x, -b.t.y, -b.t.z), b.bind);
      W[i] = b.parent < 0 ? local.clone() : mul(W[b.parent], md.bones[b.parent].inv, local);
    }
    for (let i = 0; i < md.bones.length; i++) {
      const b = md.bones[i], bone = this.bones[i];
      bone.matrix.copy(b.parent < 0 ? W[i] : mul(_m().copy(W[b.parent]).invert(), W[i]));
      bone.matrixWorldNeedsUpdate = true;
    }
    // body bob / sink (metres) and facing
    this.mesh.position.y = bodyY;
    this.root.rotation.y = this.yaw;
    const wid = !p.held && this.weaponId ? this.weaponId() : null;
    this.updateProp('R', p.held || (wid && isWeaponModel(wid) ? 'item:' + wid : this.weapon), p.wOff - 90);
    this.updateProp('L', p.held ? null : this.off, p.offOff - 90);
  }
  updateProp(side, kind, tilt) {
    if (this.propKind[side] !== kind) {
      if (this.props[side]) { this.props[side].parent.remove(this.props[side]); this.props[side] = null; }
      this.propKind[side] = kind;
      if (kind) {
        const hi = this.md.byName[(side === 'R' ? 'Right' : 'Left') + '_Hand'];
        const holder = new THREE.Group(); holder.matrixAutoUpdate = false; holder.add(kind.startsWith('item:') ? itemModel(kind.slice(5)) : makeProp(kind));
        this.bones[hi].add(holder); this.props[side] = holder; holder.userData.hi = hi;
      }
    }
    const h = this.props[side]; if (!h) return;
    const md = this.md, b = md.bones[h.userData.hi], along = side === 'R' ? -1 : 1, s = md.scale;
    // grip at the palm in bind space, item axis forward (+z) tilted by the pose, authored in metres
    const bindM = mul(_m().makeTranslation(b.t.x + along * 0.027 / s, b.t.y - 0.01, b.t.z + 0.01), rx(-(tilt || 0)), _m().makeScale(1.3 / s, 1.3 / s, 1.3 / s));
    h.matrix.copy(mul(b.inv, bindM)); h.matrixWorldNeedsUpdate = true;
  }
  dispose() {
    this.scene.remove(this.root, this.shadow);
    this.mat.dispose();
    this.root.traverse(o => { if (o.isMesh && o !== this.mesh) { o.geometry.dispose(); o.material.dispose(); } });
  }
}
