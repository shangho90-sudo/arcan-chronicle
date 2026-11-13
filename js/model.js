// Real-time skinned 3D player characters (from the user's 3D models), drawn directly in the 3D world.
// Same interface as SpriteBody (play / setDir / flash / setTint / setVisible / place / update / dispose / sh),
// so actors.js keeps working; animation comes from the game's pose table, applied to the skeleton and
// interpolated every frame, and the body turns smoothly to any angle.
import { THREE, T, tex, paintMat, contactShadowTex, addOutline } from './render.js';
import { itemModel, isWeaponModel } from './items3d.js';

const DEG = Math.PI / 180;
export const PLAYER_MODELS = {
  m: { file: 'boy', height: 1.65, headPitch: -10 },
  f: { file: 'girl', height: 1.6, headPitch: -14 },
};
/** 1st-job outfits: the player turns into this model on 전직 (same 67-bone skeleton as boy / girl, so every pose, gait
 *  and swing works unchanged); 2nd jobs of the same line (jobs.json "sheet") keep it */
export const JOB_MODELS = {
  pharmacist: { m: { file: 'pharmacist_m', height: 1.65, headPitch: -10 }, f: { file: 'pharmacist_f', height: 1.6, headPitch: -14 } },
  blacksmith: { m: { file: 'blacksmith_m', height: 1.65, headPitch: -10 }, f: { file: 'blacksmith_f', height: 1.6, headPitch: -14 } },
  cook: { m: { file: 'cook_m', height: 1.65, headPitch: -10 }, f: { file: 'cook_f', height: 1.6, headPitch: -14 } },
  hairdresser: { m: { file: 'hairdresser_m', height: 1.65, headPitch: -10 }, f: { file: 'hairdresser_f', height: 1.6, headPitch: -14 } },
  artist: { m: { file: 'artist_m', height: 1.65, headPitch: -10 }, f: { file: 'artist_f', height: 1.6, headPitch: -14 } },
};
export function playerModelCfg(gender, jobSheet) { const j = JOB_MODELS[jobSheet]; return (j && j[gender]) || PLAYER_MODELS[gender] || PLAYER_MODELS.m; }
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
  // 이야기 NPC (tools/quests/story.py): 아스텔 = Tripo + Blender 정적 모델(tools/npcs/static_npc.py),
  // 나머지는 기존 NPC 메시에 옷 색만 바꾼 텍스처(tex, tools/npcs/recolor.py)
  astel:              { file: 'npc_astel', height: 1.66, headPitch: -6, npc: true },
  castilla:           { file: 'npc_artist', tex: 'npc_castilla', height: 1.56, headPitch: -6, npc: true },
  kylus:              { file: 'npc_guard', tex: 'npc_kylus', height: 1.74, headPitch: -6, npc: true },
  daisen:             { file: 'npc_blacksmith', tex: 'npc_daisen', height: 1.95, headPitch: -6, npc: true },
  boldran:            { file: 'npc_blacksmith', tex: 'npc_boldran', height: 1.62, headPitch: -6, npc: true },
  // 무기 상인·방어구 상인 (tools/gear/gear.py, tools/world/world.py GEAR_MERCHANTS): 기존 메시에 옷 색만 바꿈
  gear_weapon:        { file: 'npc_armorer', tex: 'npc_gear_weapon', height: 1.68, headPitch: -6, npc: true },
  gear_armor:         { file: 'npc_merchant', tex: 'npc_gear_armor', height: 1.52, headPitch: -6, npc: true },
  warp_keeper:        { file: 'npc_pharmacist', tex: 'npc_warp_keeper', height: 1.6, headPitch: -6, npc: true },   // 마을 간 워프 안내인 (world.py WARP_KEEPERS)
  // 마을 주민 (tools/world/residents.py): 기존 메시 + 옷 색만 바꾼 텍스처(tools/npcs/recolor.py), 키를 조금씩 다르게
  res_artist_a: { file: 'npc_artist', tex: 'npc_res_artist_a', height: 1.47, headPitch: -6, npc: true },
  res_artist_b: { file: 'npc_artist', tex: 'npc_res_artist_b', height: 1.56, headPitch: -6, npc: true },
  res_pharmacist_a: { file: 'npc_pharmacist', tex: 'npc_res_pharmacist_a', height: 1.49, headPitch: -6, npc: true },
  res_pharmacist_b: { file: 'npc_pharmacist', tex: 'npc_res_pharmacist_b', height: 1.58, headPitch: -6, npc: true },
  res_blacksmith_a: { file: 'npc_blacksmith', tex: 'npc_res_blacksmith_a', height: 1.69, headPitch: -6, npc: true },
  res_blacksmith_b: { file: 'npc_blacksmith', tex: 'npc_res_blacksmith_b', height: 1.78, headPitch: -6, npc: true },
  res_cook_a: { file: 'npc_cook', tex: 'npc_res_cook_a', height: 1.47, headPitch: -6, npc: true },
  res_cook_b: { file: 'npc_cook', tex: 'npc_res_cook_b', height: 1.56, headPitch: -6, npc: true },
  res_elder_a: { file: 'npc_elder', tex: 'npc_res_elder_a', height: 1.47, headPitch: -6, npc: true },
  res_hairdresser_a: { file: 'npc_hairdresser', tex: 'npc_res_hairdresser_a', height: 1.27, headPitch: -6, npc: true },
  res_hairdresser_b: { file: 'npc_hairdresser', tex: 'npc_res_hairdresser_b', height: 1.61, headPitch: -6, npc: true },
  royal_guard: { file: 'npc_guard', height: 1.72, headPitch: -6, npc: true },   // 왕궁 근위병: 원래 파랑·은빛·금 갑옷 그대로, 키만 큼
  res_guard_a: { file: 'npc_guard', tex: 'npc_res_guard_a', height: 1.59, headPitch: -6, npc: true },
  res_guard_b: { file: 'npc_guard', tex: 'npc_res_guard_b', height: 1.68, headPitch: -6, npc: true },
  res_merchant_a: { file: 'npc_merchant', tex: 'npc_res_merchant_a', height: 1.42, headPitch: -6, npc: true },
  res_merchant_b: { file: 'npc_merchant', tex: 'npc_res_merchant_b', height: 1.51, headPitch: -6, npc: true },
};
/** back holder (backMount): grip at x = this fraction of the right shoulder's x, up / out (m) above the shoulder joint and
 *  behind the back surface; dir = blade direction in bind space (+x = the character's left, +y up, +z forward) */
const BACK_MOUNT = { x: 0.62, up: 0.1, out: 0.05, dir: [0.72, -1, -0.03] };   // 확인: python3 tools/anim/back_clip.py
/** 비율 (2026-11-13 그래픽 개편, 씰M 같은 밝고 귀여운 3등신 방향): 플레이어 몸의 머리·손·발을 관절 기준으로 키움. 같은 메시·
 *  뼈대·동작 그대로, 스키닝 행렬에만 곱함 (worldOf). 자식 뼈도 함께 커짐(손 → 손가락·쥔 무기, 머리 → 눈). 남자 모델은 원래
 *  약 4등신이라 머리를 더, 여자 모델은 이미 약 3.3등신이라 조금만. 판정·이동·충돌은 그대로(그림만). NPC는 그대로. */
export const PROPORTION = { m: { Head: 1.15, Right_Hand: 1.16, Left_Hand: 1.16, Right_Foot: 1.1, Left_Foot: 1.1 },
  f: { Head: 1.05, Right_Hand: 1.14, Left_Hand: 1.14, Right_Foot: 1.08, Left_Foot: 1.08 } };
function boneScales(md) {
  const out = new Float32Array(md.bones.length).fill(1); if (md.cfg.npc) return out;
  const P = PROPORTION[/(_f|girl)$/.test(md.cfg.file) ? 'f' : 'm'];
  md.bones.forEach((b, i) => { if (P[b.name]) out[i] = P[b.name]; });
  return out;
}
const XFER = 0.1;   // s the weapon glides between the back holder and the hand at the grab / release
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
export async function loadPlayerModel(gender, jobSheet) { return loadModelCfg(playerModelCfg(gender, jobSheet)); }
async function loadModelCfg(cfg) {
  const key = cfg.file + '|' + (cfg.tex || '') + '|' + cfg.height;
  if (modelCache.has(key)) return modelCache.get(key);
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
    const texture = new THREE.TextureLoader().load(cfg.tex ? 'assets/models/' + cfg.tex + '.jpg' : base + '.jpg');
    texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
    const bones = meta.bones.map(b => ({ name: b.name, parent: b.parent, bind: new THREE.Matrix4().fromArray(b.bind) }));
    for (const b of bones) { b.inv = b.bind.clone().invert(); b.t = new THREE.Vector3().setFromMatrixPosition(b.bind); }
    const byName = Object.fromEntries(bones.map((b, i) => [b.name, i]));
    const scale = cfg.height / (meta.max[1] - meta.min[1]);
    return { cfg, geometry: g, texture, bones, byName, scale, leg: byName.Left_UpperLeg !== undefined ? legGeometry(bones, byName, scale, meta.min[1]) : null };
  })();
  modelCache.set(key, p);
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
    Q[nm + '_LowerLeg'] = rx(Math.max(0, -a) * 1.1 + Math.max(0, a) * 0.5 + 4 + (p.tuck || 0));
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
const NUM = ['bob', 'lean', 'twist', 'legL', 'legR', 'wOff', 'offOff', 'fall', 'sink', 'tuck', 'adv', 'toBack'];   // toBack = 0..1 the sword hand goes to the grip on the back (draw / sheathe)
// weapon-swing keys (see SWING below): hand = [azimuth, elevation, reach] of the sword hand around the right shoulder,
// blade = [azimuth, elevation] of the blade, elbow = pole the elbow points at, step = [left, right] foot offsets (m)
const VEC = ['hand', 'blade', 'elbow', 'step', 'lift'];   // lift = [left, right] ankle lift (m), adv = root travel (m) of a combo strike
const ikW = p => (p.hand ? (p.ik ?? 1) : 0), plantW = p => (p.step ? (p.plant ?? 1) : 0);
function lerpPose(a, b, k) {
  const o = { armR: [a.armR[0] + (b.armR[0] - a.armR[0]) * k, a.armR[1] + (b.armR[1] - a.armR[1]) * k], armL: [a.armL[0] + (b.armL[0] - a.armL[0]) * k, a.armL[1] + (b.armL[1] - a.armL[1]) * k], squint: k < 0.5 ? a.squint : b.squint, held: a.held };
  for (const f of NUM) o[f] = (a[f] || 0) + ((b[f] || 0) - (a[f] || 0)) * k;
  for (const f of VEC) { const A = a[f], B = b[f]; o[f] = A && B ? A.map((v, i) => v + (B[i] - v) * k) : (A || B); }
  o.ik = ikW(a) + (ikW(b) - ikW(a)) * k; o.plant = plantW(a) + (plantW(b) - plantW(a)) * k;
  return o;
}
/** Catmull-Rom through four keys (smooth, continuous velocity through the middle keys) */
function crPose(p0, p1, p2, p3, k) {
  const c = (a, b, c_, d) => { const k2 = k * k, k3 = k2 * k; return 0.5 * (2 * b + (-a + c_) * k + (2 * a - 5 * b + 4 * c_ - d) * k2 + (-a + 3 * b - 3 * c_ + d) * k3); };
  const o = lerpPose(p1, p2, k);
  for (const f of NUM) o[f] = c(p0[f] || 0, p1[f] || 0, p2[f] || 0, p3[f] || 0);
  for (const arm of ['armR', 'armL']) o[arm] = [0, 1].map(i => c(p0[arm][i], p1[arm][i], p2[arm][i], p3[arm][i]));
  for (const f of ['hand', 'blade']) if (p1[f] && p2[f]) { const A = p0[f] || p1[f], D = p3[f] || p2[f]; o[f] = p1[f].map((v, i) => c(A[i], v, p2[f][i], D[i])); }
  return o;
}
const EASE = { i: t => t * t * t, o: t => 1 - (1 - t) ** 3, io: t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2), s: t => t * t * (3 - 2 * t) };

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

/** gait shape for a ground speed v (m/s). One CYCLE = left heel strike -> next left heel strike (two steps).
 *  1. cadence (steps / s) from the speed, Froude-scaled to the model's leg length (shorter legs -> quicker steps);
 *  2. reach limits from the real leg: the knee never locks straight (hip-ankle distance <= kr * L), the landing foot
 *     may be at most Rf in front of the hip, the push-off foot at most Rb behind it (Rb < Rf: no long trailing leg);
 *  3. stance length S = v * stance time. If S does not fit in Rf + Rb, the stance gets shorter (more flight - it turns
 *     into a run) down to a minimum duty; only if it still does not fit does the cadence go up. S is recomputed after
 *     every adjustment and checked against the limit, so no clamp is undone by a later step. */
function gaitParams(v, leg) {
  v = Math.min(v, 5.2);                                                     // dashes are key-framed; the gait only blends out
  const L = Math.min(leg.Left.L1 + leg.Left.L2, leg.Right.L1 + leg.Right.L2) * 0.995;
  const run = sstep(1.9, 3.1, v);
  let cad = lerp(1.75 + 0.42 * v, 3.0 + 0.3 * v, run) * Math.sqrt(0.72 / L);
  const crouch = lerp(0.955, 0.91, run) * L;                               // hip-to-ankle height at mid-stance (knee flexed to take the weight)
  const kr = lerp(0.975, 0.955, run), R = kr * L;                           // longest hip-ankle distance allowed (knee keeps some bend)
  // the leg may swing at most ~28/24 deg (walk) or ~22/19 deg (run) in front of / behind the vertical at that length
  const Rf = R * Math.sin(lerp(28, 22, run) * DEG);                       // landing, in front of the hip
  const Rb = R * Math.sin(lerp(24, 19, run) * DEG);                       // push-off, behind the hip (heel already up)
  const Smax = Rf + Rb, front = Rf / Smax;
  let Tc = 2 / cad, duty = lerp(0.6, 0.34, run);
  const dutyMin = lerp(0.52, 0.2, run);
  let S = v * duty * Tc;
  if (S > Smax) { duty = Math.max(dutyMin, Smax / (v * Tc)); S = v * duty * Tc; }
  if (S > Smax + 1e-6) { Tc = Smax / (v * duty); S = Smax; }               // last resort: quicker steps, never a longer stance
  cad = 2 / Tc;
  return { run, L, duty, S: Math.max(0.05, S), Smax, cycle: Math.max(0.2, v * Tc), Tc, crouch, cad, front, Rf, Rb, kr,
    track: lerp(0.085, 0.065, run), H: lerp(0.1, 0.22, run) * L };
}

/** one foot over the cycle in body space: z along the walk (from the hip), lift above its rest height, pitch (deg, + = toes up),
 *  e = swing progress 0..1.  Stance: lands in front of the hip, the body passes over it, the heel rises and the foot rolls
 *  onto the toes before it leaves. Swing: the foot lifts with the knee bent, comes forward UNDER the hip (low, knee leading)
 *  and reaches out only at the end, then sets down. */
function footAt(ph, G, toe) {
  const run = G.run, S = G.S, front = G.front, back = 1 - front;
  if (ph < G.duty) {                                                       // stance: planted, moves back at exactly body speed
    const s = ph / G.duty;
    const pf = lerp(22, 26, run) * sstep(lerp(0.5, 0.35, run), 1, s);     // heel rise / push-off starts once the hip is past the foot
    const strike = lerp(8, 3, run) * (1 - sstep(0, 0.16, s));              // heel strike then foot flat
    const roll = toe * (1 - Math.cos(pf * DEG));
    return { z: S * front - S * s + roll, roll, lift: toe * Math.sin(pf * DEG), pitch: strike - pf, stance: true, s, e: 0, land: S * front };
  }
  const s = (ph - G.duty) / (1 - G.duty), pf0 = lerp(22, 26, run);
  const e = sstep(0.08, 0.9, s);                                           // stays behind briefly (knee folds), passes under the hip mid-swing
  // running: after toe-off the heel kicks up behind (knee folds tight), then the knee drives forward and the foot
  // reaches down to land - instead of a low shuffle. Walking keeps the low, knee-leading swing.
  const kick = run * 0.34 * G.L * Math.sin(Math.PI * sstep(0, 0.62, s)) * (1 - sstep(0.55, 0.95, s));
  const lift = Math.max(G.H * Math.sin(Math.PI * Math.min(1, Math.pow(s, 0.72))), toe * Math.sin(pf0 * DEG) * (1 - s) ** 3) + kick;
  const back0 = run * 0.06 * G.L * Math.sin(Math.PI * Math.min(1, s / 0.45));
  const pitch = s < 0.4 ? lerp(-pf0 * (0.8 + 0.25 * run), 0, sstep(0, 0.4, s)) : lerp(0, lerp(8, 3, run), sstep(0.4, 1, s));
  return { z: -S * back + S * e - back0, lift, pitch, stance: false, s, e, land: S * front };
}

// ---- 3D two-bone leg IK in the model's own frame (metres, mesh-local: x = model left, y up, z forward)
const _v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
function frameOf(dir, pole) {                                              // orthonormal basis: x = dir, y = pole projected
  const x = dir.clone().normalize(), y = pole.clone().addScaledVector(x, -pole.dot(x));
  if (y.lengthSq() < 1e-8) y.set(0, 1, 0).addScaledVector(x, -x.y);
  y.normalize(); const z = _v().crossVectors(x, y);
  return _m().makeBasis(x, y, z);
}
const rotBetween = (dirB, poleB, dirN, poleN) => mul(frameOf(dirN, poleN), frameOf(dirB, poleB).transpose());
/** bind-pose leg chain in metres, cached on the model */
function legChain(md) {
  if (md._chain) return md._chain;
  const s = md.scale, P = n => md.bones[md.byName[n]].t.clone().multiplyScalar(s);
  const out = { pelvis: P('Hips') };
  for (const side of ['Left', 'Right']) {
    const H = P(side + '_UpperLeg'), K = P(side + '_LowerLeg'), A = P(side + '_Foot'), T = P(side + '_Toes');
    const fwd = _v(T.x - A.x, T.y - A.y, T.z - A.z);
    out[side] = { H, K, A, T, L1: H.distanceTo(K), L2: K.distanceTo(A), sg: Math.sign(H.x) || 1,
      tilt: Math.atan2(fwd.y, Math.hypot(fwd.x, fwd.z)), fwd };
  }
  return (md._chain = out);
}
/** rotations (relative to bind) that put the ankle at A (mesh-local metres), knee towards `pole`, foot yaw / pitch (rad) */
function solveLeg(c, Hn, A, pole, yaw, pitch) {
  let d = _v().subVectors(A, Hn); const len = d.length(), max = (c.L1 + c.L2) * 0.999, min = Math.abs(c.L1 - c.L2) + 0.01;
  const dl = Math.min(max, Math.max(min, len)); d.multiplyScalar(dl / (len || 1));
  const dir = d.clone().normalize(), pp = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  const a = (c.L1 * c.L1 - c.L2 * c.L2 + dl * dl) / (2 * dl), h = Math.sqrt(Math.max(0, c.L1 * c.L1 - a * a));
  const K = Hn.clone().addScaledVector(dir, a).addScaledVector(pp, h), An = Hn.clone().add(d);
  const bindPole = _v(0, 0, 1);
  const Rth = rotBetween(_v().subVectors(c.K, c.H), bindPole, _v().subVectors(K, Hn), pole);
  const Rsh = rotBetween(_v().subVectors(c.A, c.K), bindPole, _v().subVectors(An, K), pole);
  const el = c.tilt + pitch, f = _v(Math.sin(yaw) * Math.cos(el), Math.sin(el), Math.cos(yaw) * Math.cos(el));
  const Rft = rotBetween(c.fwd, _v(0, 1, 0), f, _v(0, 1, 0));
  const knee = 180 - _v().subVectors(c.K, c.H).angleTo(_v().subVectors(c.A, c.K)) / DEG * 0 - _v().subVectors(Hn, K).angleTo(_v().subVectors(An, K)) / DEG;
  return { Rth, Rsh, Rft, reached: len <= max + 1e-4, over: Math.max(0, len - max), len, knee };
}
const rotOnly = m => _m().extractRotation(m);

// ---- sword arm: two-bone IK so the weapon hand follows a designed arc and the blade stays fixed in the grip
/** bind-pose arm chain in model units (mesh-local: x = model left, y up, z forward) */
function armChain(md) {
  if (md._arm) return md._arm;
  const P = n => md.bones[md.byName[n]].t.clone();
  const S = P('Right_UpperArm'), E = P('Right_LowerArm'), W = P('Right_Hand');
  return (md._arm = { S, E, W, L1: S.distanceTo(E), L2: E.distanceTo(W), hand: _v().subVectors(P('Right_MiddleProximal'), W).normalize() });
}
/** unit vector from [azimuth, elevation] in body space (az 0 = forward, + = towards the character's left) */
const dirAE = (az, el) => _v(Math.sin(az * DEG) * Math.cos(el * DEG), Math.sin(el * DEG), Math.cos(az * DEG) * Math.cos(el * DEG));
/** rotations (model space, relative to bind) for upper arm / forearm / hand: hand at target T, elbow towards pole,
 *  blade (prop +z) as close to `blade` as a wrist can bend (within -20..60 deg off perpendicular) */
function solveArm(c, Sn, T, pole, blade) {
  let d = _v().subVectors(T, Sn); const len = d.length(), max = (c.L1 + c.L2) * 0.995, min = Math.abs(c.L1 - c.L2) + 1e-3;
  const dl = Math.min(max, Math.max(min, len)); d.multiplyScalar(dl / (len || 1));
  const dir = d.clone().normalize(), pp = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  const a = (c.L1 * c.L1 - c.L2 * c.L2 + dl * dl) / (2 * dl), h = Math.sqrt(Math.max(0, c.L1 * c.L1 - a * a));
  const E = Sn.clone().addScaledVector(dir, a).addScaledVector(pp, h), Wn = Sn.clone().add(d);
  const bindPole = _v(0, 0, -1);                                              // T-pose: the elbow "points" backwards
  const Rua = rotBetween(_v().subVectors(c.E, c.S), bindPole, _v().subVectors(E, Sn), pole);
  const Rla = rotBetween(_v().subVectors(c.W, c.E), bindPole, _v().subVectors(Wn, E), pole);
  // hand: length axis follows the forearm, bent at the wrist so the blade can point where the swing wants it
  const F = _v().subVectors(Wn, E).normalize(), Bd = blade.clone().normalize();
  let Bp = Bd.clone().addScaledVector(F, -Bd.dot(F)); if (Bp.lengthSq() < 1e-6) Bp = pole.clone().addScaledVector(F, -pole.dot(F)); Bp.normalize();
  const th = Math.acos(Math.max(-1, Math.min(1, Bd.dot(F)))), w = Math.max(-20 * DEG, Math.min(60 * DEG, Math.PI / 2 - th));
  const axis = F.clone().multiplyScalar(Math.cos(w)).addScaledVector(Bp, -Math.sin(w)), bl = Bp.clone().multiplyScalar(Math.cos(w)).addScaledVector(F, Math.sin(w));
  const Rh = rotBetween(c.hand, _v(0, 0, 1), axis, bl);
  return { Rua, Rla, Rh, W: Wn };
}

/** idle footprint in body space (same spot and toe-out the key-framed idle stance uses via alignLegs) */
function idleFoot(md, side) {
  const c = legChain(md)[side], g = md.leg[side];
  return { x: c.sg * (g.ankX - Math.min(STAND_IN, Math.max(0, g.ankX - 0.09))), z: c.A.z, yaw: c.sg * Math.min(g.toeOut, TOE_OUT) * DEG };
}
/** bone rotations + pelvis height / sway for the gait. body = ModelBody (world-locked feet), ph 0..1 (left heel strike at 0).
 *  settle 0..1: the run is ending - targets move to the idle footprint (finishing steps), body motion fades out. */
function gaitPose(body, ph, v, base, settle = 0) {
  const md = body.md, leg = md.leg, G = gaitParams(v, leg), run = G.run * (1 - settle), Q = {}, ch = legChain(md), live = 1 - settle;
  const dbg = body.gdbg = { v: +v.toFixed(2), cad: +G.cad.toFixed(2), S: +G.S.toFixed(3), Smax: +G.Smax.toFixed(3), duty: +G.duty.toFixed(3), run: +G.run.toFixed(2), ph: +ph.toFixed(3), settle: +settle.toFixed(2), miss: {}, knee: {}, reach: {}, stance: {} };
  const toeOut = lerp(6, 4, run) * DEG;
  const nominal = {};
  for (const [side, off] of [['Left', 0], ['Right', 0.5]]) {
    const c = ch[side];
    if (settle > 0) { const f0 = idleFoot(md, side); nominal[side] = { f: { stance: true, s: 0.5, lift: 0, pitch: 0, roll: 0, e: 0, z: 0, land: 0 }, x: f0.x, z: f0.z, yaw: f0.yaw, idle: true }; continue; }
    const f = footAt(fract(ph + off), G, leg[side].toe);
    // nominal ankle target in body space: narrow track, foot under the hip in z, toes slightly out
    nominal[side] = { f, x: c.sg * G.track, z: c.H.z + f.z, yaw: c.sg * toeOut };
  }
  // world-locked feet: a planted foot keeps its spot and heading on the ground while the body turns, speeds up or stops;
  // when it can no longer stay (too far / too twisted) it takes a short re-step instead of being dragged
  const tgt = body.lockFeet(nominal, G);
  // pelvis height: as high as the planted feet allow with the knee still a little bent (never a locked, stretched leg)
  const Rk = G.kr * G.L;
  const reach = (side, t) => { const c = ch[side], dx = t.x - c.H.x, dz = t.z - c.H.z; return Math.sqrt(Math.max(0, Rk * Rk - dx * dx - dz * dz)) + t.lift; };
  const want = s => lerp(lerp(G.L * 0.975, G.crouch - 0.025 * Math.sin(Math.PI * s), G.run), (md.leg.Left.Lv + md.leg.Right.Lv) / 2 * 0.995, settle);
  let D = Infinity;
  for (const side of ['Left', 'Right']) if (tgt[side].stance) D = Math.min(D, want(nominal[side].f.s), Math.max(want(nominal[side].f.s) * 0.92, reach(side, tgt[side])));
  if (D === Infinity) {                                                    // flight (running): small ballistic rise between steps
    const end = Math.min(want(1), Math.sqrt(Math.max(0, Rk * Rk - (G.S * (1 - G.front)) ** 2)) + leg.Left.toe * Math.sin(lerp(22, 26, run) * DEG));
    const u = fract(ph * 2 - G.duty * 2) / Math.max(1e-3, 1 - G.duty * 2);
    D = end + 0.03 * run * Math.sin(Math.PI * Math.min(1, Math.max(0, u)));
  }
  const hipH = D + (leg.Left.ha + leg.Right.ha) / 2;
  const bodyY = hipH - (leg.Left.hip + leg.Right.hip) / 2;
  // ---- pelvis: turns with the swinging leg, drops on the swing side, shifts over the supporting foot (once per cycle each)
  const sw = Math.cos(2 * Math.PI * ph), sl = Math.sin(2 * Math.PI * ph);    // sw +1: left leg forward; sl +: left foot supporting
  const yawA = lerp(7, 9, run) * live, rollA = lerp(4, 2.5, run) * live, swayA = lerp(0.024, 0.009, run) * live;
  const sway = swayA * sl;                                                  // metres towards the model's left (+x) = over the left foot
  const lean = lerp(4, 16, run) + 2 * live;
  Q.Hips = mul(ry(-yawA * sw), rz(rollA * sl), rx(lean * 0.3));
  const RH = rotOnly(Q.Hips), RHi = RH.clone().invert();
  for (const side of ['Left', 'Right']) {
    const c = ch[side], t = tgt[side];
    // hip joint carried by the pelvis twist / tilt / sway (the IK accounts for it, so the planted foot does not slide)
    const Hn = c.H.clone().sub(ch.pelvis).applyMatrix4(RH).add(ch.pelvis);
    const A = _v(t.x - sway, -bodyY + leg[side].ha + t.lift, t.z);
    const pole = _v(Math.sin(t.yaw) * 0.9 + c.sg * 0.12, 0, Math.cos(t.yaw)).normalize();   // knee over the toes, a touch outward
    const r = solveLeg(c, Hn, A, pole, t.yaw, t.pitch * DEG);
    dbg.miss[side] = r.reached ? 0 : +(r.over || 0).toFixed(3); dbg.knee[side] = +r.knee.toFixed(1); dbg.reach[side] = +(r.len / (c.L1 + c.L2)).toFixed(3); dbg.stance[side] = t.stance ? 1 : 0;
    Q[side + '_UpperLeg'] = mul(RHi, r.Rth);
    Q[side + '_LowerLeg'] = mul(r.Rth.clone().invert(), r.Rsh);
    Q[side + '_Foot'] = mul(r.Rsh.clone().invert(), r.Rft);
  }
  // ---- trunk: shoulders counter-rotate the pelvis (net ~ -0.6 x pelvis yaw), spine levels the pelvic drop, lean into the run
  Q.Spine = mul(ry(yawA * 0.8 * sw), rz(-rollA * sl * 0.55), rx(lean * 0.4));
  Q.Chest = mul(ry(yawA * 0.8 * sw), rz(-rollA * sl * 0.3), rx(lean * 0.35));
  // head steadier than the trunk: undo most of the shoulder turn and the lean, keep a little life
  Q.Head = mul(ry(-yawA * 0.45 * sw), rz(-rollA * sl * 0.15), rx(-lean * 0.8 + md.cfg.headPitch));
  // ---- arms opposite the legs; elbows bend into a pump when running; the hand holding a weapon / tool swings less
  const armA = lerp(17, 40, run) * live, armF = lerp(5, 14, run);
  for (const [side, nm, sgn] of [[-1, 'Right', 1], [1, 'Left', -1]]) {
    const held = (side < 0 ? !!body.weapon : !!body.off) && (body.armW ?? 1) > 0.5, k = held ? 0.55 : 1;
    const f = armF + sgn * armA * k * sw, down = Math.max(0, 90 - (base[side > 0 ? 'armL' : 'armR'][1] || 12)) - 4 * run;
    const bend = lerp(18, 88, run) + (held ? 10 : 0) + Math.max(0, f) * lerp(0.35, 0.2, run);
    Q[nm + '_UpperArm'] = mul(rx(-f), rz(side > 0 ? -down : down));
    Q[nm + '_LowerArm'] = ry(side > 0 ? -bend : bend);
    Q[nm + '_Shoulder'] = ry(sgn * side * -3.5 * sw * live);              // the shoulder girdle follows its arm a little
  }
  dbg.sway = +sway.toFixed(3); dbg.bodyY = +bodyY.toFixed(3);
  return { Q, hipH, G, sway };
}
/** standing / key-framed poses (idle, attacks, hit, dash): the models stand with feet ~0.37 m apart and toes turned out
 *  (up to 18 deg); bring the ankles a little closer and turn the toes in a bit. Walking and running do not use this:
 *  their feet are placed exactly by the 3D IK in gaitPose (track width and toe-out are part of the foot target). */
const STAND_IN = 0.05, TOE_OUT = 8;
function alignLegs(md, Q) {
  for (const side of ['Left', 'Right']) {
    const g = md.leg[side], sg = g.side;
    const add = Math.atan2(Math.min(STAND_IN, Math.max(0, g.ankX - 0.09)), g.Lv) / DEG;
    const turn = Math.max(0, g.toeOut - TOE_OUT);
    const up = Q[side + '_UpperLeg'] || _m(), foot = Q[side + '_Foot'] || _m();
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

// ---------------------------------------------------------------- swing trail: a short, soft crescent behind the real blade
/** Samples the actual blade (base + tip) every frame while the action's `trail` window is open and draws a fading
 *  ribbon through them (Catmull-Rom smoothed), so the afterimage always matches the sword - in every facing. */
const TRAIL_LIFE = 0.11, TRAIL_SUB = 4, TRAIL_MAX = 40;
/** blade afterimage on/off switch (window.SWING_TRAIL.on = false hides every swing trail; the trail is its own mesh) */
export const SWING_TRAIL = { on: true };
if (typeof window !== 'undefined') window.SWING_TRAIL = SWING_TRAIL;
class SwingTrail {
  constructor(scene) {
    this.scene = scene; this.s = []; this.mesh = null;
  }
  build() {
    const n = TRAIL_MAX * TRAIL_SUB * 2, g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage));
    const idx = []; for (let i = 0; i < n / 2 - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } g.setIndex(idx);
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
    this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = 8; this.scene.add(this.mesh);
  }
  /** life / base: per action (skills leave a longer, wider afterimage: action.trailLife, action.trailBase) */
  update(dt, pts, color, life = TRAIL_LIFE, base = 0.35) {
    for (const q of this.s) q.age += dt;
    while (this.s.length && this.s[0].age > life) this.s.shift();
    if (pts) { this.s.push({ a: pts[0], b: pts[1], age: 0 }); if (this.s.length > TRAIL_MAX) this.s.shift(); }
    if (!this.s.length) { if (this.mesh) this.mesh.visible = false; return; }
    if (!this.mesh) this.build();
    const S = this.s, P = this.mesh.geometry.attributes.position, C = this.mesh.geometry.attributes.color, cr = (p0, p1, p2, p3, t) => {
      const t2 = t * t, t3 = t2 * t; return _v().addScaledVector(p0, -0.5 * t3 + t2 - 0.5 * t).addScaledVector(p1, 1.5 * t3 - 2.5 * t2 + 1).addScaledVector(p2, -1.5 * t3 + 2 * t2 + 0.5 * t).addScaledVector(p3, 0.5 * t3 - 0.5 * t2); };
    let v = 0; const c = color || [1, 1, 1];
    for (let i = 0; i < S.length; i++) {
      const s0 = S[Math.max(0, i - 1)], s1 = S[i], s2 = S[Math.min(S.length - 1, i + 1)], s3 = S[Math.min(S.length - 1, i + 2)];
      const sub = i < S.length - 1 ? TRAIL_SUB : 1;
      for (let j = 0; j < sub; j++) {
        const t = j / sub, A = cr(s0.a, s1.a, s2.a, s3.a, t), B = cr(s0.b, s1.b, s2.b, s3.b, t), age = s1.age + (s2.age - s1.age) * t;
        const k = Math.max(0, 1 - age / life), al = k * k * 0.85;
        // base end of the strip faint, tip end bright: reads as a thin crescent along the edge, not a filled fan
        const Am = A.clone().lerp(B, base);
        P.setXYZ(v, Am.x, Am.y, Am.z); C.setXYZ(v, c[0], c[1], c[2]); C.setW(v, 0); v++;
        P.setXYZ(v, B.x, B.y, B.z); C.setXYZ(v, c[0], c[1], c[2]); C.setW(v, al); v++;
      }
    }
    this.mesh.geometry.setDrawRange(0, Math.max(0, (v / 2 - 1) * 6)); P.needsUpdate = true; C.needsUpdate = true; this.mesh.visible = v >= 4;
  }
  dispose() { if (this.mesh) { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); } }
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
    // 2026-11-13: rim cooler and weaker (the warm rim on a warm plaza did not separate); the outline hull does that now
    paintMat(this.mat, md.cfg.npc ? { rim: [1.0, 0.86, 0.62], rimK: 0.3, sat: 1.1 } : { rim: [0.9, 0.92, 1.0], rimK: 0.22, sat: 1.1, skin: true });
    this.mesh = new THREE.SkinnedMesh(md.geometry, this.mat);
    this.mesh.castShadow = true; this.mesh.frustumCulled = false;
    this.mesh.scale.setScalar(md.scale);
    this.root.add(this.mesh);
    // skeleton built from the bind matrices (model space); bones parented under the mesh
    this.bones = md.bones.map(b => { const bone = new THREE.Bone(); bone.name = b.name; bone.matrixAutoUpdate = false; return bone; });
    md.bones.forEach((b, i) => (b.parent >= 0 ? this.bones[b.parent] : this.mesh).add(this.bones[i]));
    this.skeleton = new THREE.Skeleton(this.bones, md.bones.map(b => b.inv.clone()));
    this.mesh.bind(this.skeleton, new THREE.Matrix4());
    addOutline(this.mesh);                                                   // 얇은 외곽선 (render.js OUTLINE): 플레이어·NPC
    if (!shadowMat) shadowMat = new THREE.MeshBasicMaterial({ map: contactShadowTex(), transparent: true, depthWrite: false });
    this.shadow = new THREE.Mesh(shadowGeo, shadowMat); this.shadow.rotation.x = -Math.PI / 2;
    const ss = shadowRadius * 2.6; this.shadow.scale.set(ss, ss, 1);
    scene.add(this.root, this.shadow);
    this.props = { R: null, L: null, H: null }; this.propKind = { R: null, L: null, H: null };
    // weapon in the hand (armed, armW 1) or on the back (armW 0); draw / sheathe = upper-body overlay (this.over)
    this.armed = true; this.armW = 1; this.over = null;
    this.setJob(job); this.apply();
  }
  setJob(job) { this.job = job; if (this.md.cfg.npc) { this.weapon = null; this.off = null; return; } this.weapon = WEAPON[job] || 'sword'; this.off = OFF[job] || null; }
  setSheet() { }   // sprite API compatibility (job change goes through setJob)
  // ---- 무기 꺼내기 / 집어넣기 (draw / sheathe, actions from tools/anim/swings.py). The right-hand weapon lives on the back
  // (diagonal, grip over the right shoulder, backMount) while sheathed; the motion plays as an upper-body overlay on top of
  // idle / walking (hand, blade, elbow, ik, toBack of the overlay pose). The weapon changes holder at the action's grabT /
  // releaseT (the hand is on the back grip then: toBack = 1) and glides between the two holders for XFER s.
  /** snap without a motion (zone change, death, job model swap) */
  setArmed(v) { this.over = null; this.armed = !!v; this.armW = v ? 1 : 0; }
  /** start the draw (speed scales the motion: a fast draw before the first attack); no-op when the weapon is in the hand */
  draw(speed = 1) {
    if (this.md.cfg.npc || !this.sh.actions.draw) { this.setArmed(true); return; }
    if (this.stowing) return;                                                // a free-hand throw is playing: the weapon stays on the back until it ends
    if (this.over && this.over.name === 'draw') { this.over.speed = Math.max(this.over.speed, speed); return; }
    if (this.over && this.over.name === 'sheathe' && this.armed) { this.over = null; return; }   // still holding it: just stop putting it away
    if (this.armed && !this.over) return;
    this.over = { name: 'draw', t: 0, speed, switched: false };
  }
  sheathe() {
    if (this.md.cfg.npc || !this.sh.actions.sheathe) { this.setArmed(false); return; }
    if (!this.armed || this.over) return;
    this.over = { name: 'sheathe', t: 0, speed: 1, switched: false };
  }
  /** the weapon is in the hand and the draw has come far enough for a swing / skill to take over */
  get drawReady() { const o = this.over; return this.armed && (!o || o.name !== 'draw' || o.t >= (this.sh.actions.draw.readyT || 0)); }
  get drawing() { return !!(this.over && this.over.name === 'draw'); }
  /** a stow action (action.stow, e.g. ph_pitch) is playing: the right hand throws, the weapon rides on the back */
  get stowing() { const a = this.sh.actions[this.action]; return !!(a && a.stow) && !this.finished && !this.md.cfg.npc; }
  /** right palm in world (three) space, or null — where a thrown item leaves the hand */
  handPoint() {
    const md = this.md, hi = md.byName.Right_Hand; if (hi === undefined || !this.W || !this.visible) return null;
    this.root.updateMatrixWorld(true); const b = md.bones[hi];
    return _v(b.t.x - 0.027 / md.scale, b.t.y - 0.01, b.t.z + 0.01).applyMatrix4(mul(_m().copy(this.W[hi]), b.inv)).applyMatrix4(this.mesh.matrixWorld);
  }
  updateOverlay(dt) {
    const o = this.over;
    if (o) {
      const A = this.sh.actions[o.name]; o.t += dt * o.speed;
      const sw = o.name === 'draw' ? A.grabT : A.releaseT;
      if (!o.switched && o.t >= sw) { o.switched = true; this.armed = o.name === 'draw'; }
      if (o.t >= A.dur) this.over = null;
    }
    const goal = this.armed ? 1 : 0; if (this.armW !== goal) this.armW = goal > this.armW ? Math.min(1, this.armW + dt / XFER) : Math.max(0, this.armW - dt / XFER);
  }
  play(name, speed = 1, restart = false) {
    if (!this.sh.actions[name]) name = 'idle';
    this.speed = speed;
    if (name === this.action && !restart) return;
    // cross-fade from the pose on screen right now (no pop when an attack starts, chains or ends)
    const a = this.sh.actions[name], prev = this.sh.actions[this.action];
    if (this.lastPose) { this.fromPose = this.lastPose; this.fadeT = 0; this.fadeDur = a.fadeIn ?? (prev && prev.fadeOut) ?? 0.1; }
    this.action = name; this.t = 0; this.finished = false;
    if (a.stow && !this.md.cfg.npc) { this.over = null; this.armed = false; }   // free-hand throw: the weapon goes to (stays on) the back, glides there in XFER s
  }
  setDir(d) { this.dir = ((d % 8) + 8) % 8; this.targetYaw = this.dir * 45 * DEG; }
  /** continuous facing from a Unity-space ground vector */
  setFacing(x, z) { if (x * x + z * z < 1e-6) return; this.targetYaw = Math.atan2(x, -z); }
  flash(d) { this.flashT = Math.max(this.flashT, d); }
  /** world-locked feet for the gait: nominal = body-space foot targets from the gait cycle (or the idle footprint while
   *  settling). A foot that lands keeps its ground position and heading in world space until it lifts; a lifted foot
   *  swings from where it really left the ground to its next nominal landing spot. If a planted foot can no longer stay
   *  (the body got too far from it, or it would twist more than ~50 deg in a sharp turn, or the run ended and it is not
   *  on the idle footprint) it takes a short re-step (lift, move, set down in ~0.12-0.16 s) - never dragged, never teleported. */
  lockFeet(nom, G) {
    if (!this.feet) this.feet = { Left: {}, Right: {} };
    const yaw = this.yaw, R = this.root.position, c = Math.cos(yaw), s = Math.sin(yaw), dt = this.ldt || 1 / 60;
    const toW = (x, z) => ({ x: R.x + x * c + z * s, z: R.z - x * s + z * c });
    const toB = w => { const dx = w.x - R.x, dz = w.z - R.z; return { x: dx * c - dz * s, z: dx * s + dz * c }; };
    const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
    const out = {}, F = this.feet, lim = G.S * 0.35 + 0.1;
    if (this.startFeet) {
      this.startFeet = false; const c0 = Math.cos(this.yaw0 ?? yaw), s0 = Math.sin(this.yaw0 ?? yaw);
      for (const side of ['Left', 'Right']) { const f0 = idleFoot(this.md, side), w = { x: R.x + f0.x * c0 + f0.z * s0, z: R.z - f0.x * s0 + f0.z * c0 };
        Object.assign(F[side], { stance: true, lock: w, lockYaw: (this.yaw0 ?? yaw) + f0.yaw, lastW: w, lastYaw: (this.yaw0 ?? yaw) + f0.yaw }); }
    }
    const stepping = side => !!F[side].rs;
    const startStep = (side, from, fromYaw, dur) => { F[side].rs = { from, fromYaw, t: 0, dur }; F[side].lock = null; this.restepN = (this.restepN || 0) + 1; };
    for (const side of ['Left', 'Right']) {
      const st = F[side], n = nom[side], f = n.f, other = side === 'Left' ? 'Right' : 'Left';
      if (st.rs) {                                                          // short re-step in progress
        const r = st.rs; r.t += dt; const e = sstep(0, 1, r.t / r.dur), a = toB(r.from);
        const fy0 = wrap(r.fromYaw - yaw), o = { x: a.x + (n.x - a.x) * e, z: a.z + (n.z - a.z) * e, yaw: fy0 + wrap(n.yaw - fy0) * e, lift: 0.045 * Math.sin(Math.PI * e), pitch: 0, stance: false };
        st.lastW = toW(o.x, o.z); st.lastYaw = yaw + o.yaw; out[side] = o;
        if (r.t >= r.dur) { st.rs = null; st.stance = true; st.lock = toW(n.x, n.z); st.lockYaw = yaw + n.yaw; }
        continue;
      }
      if (f.stance) {
        // plant where the swing actually put the foot down (no pop on contact)
        if (!st.stance || !st.lock) {
          if (n.idle && st.stance === false && st.lastW && !stepping(other)) { startStep(side, st.lastW, st.lastYaw, 0.14); out[side] = { x: toB(st.lastW).x, z: toB(st.lastW).z, yaw: wrap(st.lastYaw - yaw), lift: 0, pitch: 0, stance: false }; continue; }
          st.lock = st.lastW && st.stance === false ? st.lastW : toW(n.x, n.z); st.lockYaw = st.lastW && st.stance === false ? st.lastYaw : yaw + n.yaw;
        }
        const b = toB(st.lock), d = Math.hypot(b.x - n.x, b.z - n.z), fy = wrap(st.lockYaw - yaw), tw = Math.abs(wrap(fy - n.yaw));
        const far = n.idle ? d > 0.06 || tw > 0.35 : d > lim || tw > 0.9;
        if (far && !stepping(other)) { startStep(side, st.lock, st.lockYaw, n.idle ? 0.16 : 0.12); out[side] = { x: b.x, z: b.z, yaw: fy, lift: 0, pitch: f.pitch, stance: false }; st.stance = false; continue; }
        const rx_ = b.x + Math.sin(fy) * (f.roll || 0), rz_ = b.z + Math.cos(fy) * (f.roll || 0);   // heel raise: ankle moves towards the toes, toes stay
        out[side] = { x: rx_, z: rz_, yaw: fy, lift: f.lift, pitch: f.pitch, stance: true };
        st.stance = true; st.dbg = toW(b.x, b.z); st.lastW = toW(rx_, rz_); st.lastYaw = yaw + fy;
      } else {
        // lift off from where the foot really was (heel-raise roll included)
        // (the lift-off point is kept in BODY space: once in the air the foot travels with the body - a world-fixed start
        //  point would recede behind a fast runner and stretch the leg straight at the start of every swing)
        if (st.stance !== false) { const w = st.lastW || st.lock || toW(n.x, n.z); st.liftB = toB(w); st.liftYawB = wrap((st.lastYaw !== undefined ? st.lastYaw : yaw + n.yaw) - yaw); st.lock = null; }
        st.stance = false;
        const a = st.liftB, e = f.e, landZ = n.z - f.z + f.land;
        const fy0 = st.liftYawB;
        const o = { x: a.x + (n.x - a.x) * e, z: a.z + (landZ - a.z) * e, yaw: fy0 + wrap(n.yaw - fy0) * e, lift: f.lift, pitch: f.pitch, stance: false };
        out[side] = o; st.lastW = toW(o.x, o.z); st.lastYaw = yaw + o.yaw;
      }
    }
    this.settled = !!nom.Left.idle && ['Left', 'Right'].every(sd => F[sd].stance && !F[sd].rs && F[sd].lock && Math.hypot(toB(F[sd].lock).x - nom[sd].x, toB(F[sd].lock).z - nom[sd].z) <= 0.06);
    return out;
  }
  setTint(r, g, b) { this.tint = [r, g, b]; this.applyColor(); }
  /** 염색: outfit colour (texture multiplied towards the dye, skin keeps most of its tone) */
  setDye(hex) { this.dye = hex || ''; this.applyColor(); }
  applyColor() {
    const t = this.tint || [1, 1, 1], c = new THREE.Color(t[0], t[1], t[2]);
    if (this.dye) { const d = new THREE.Color(this.dye); c.multiply(new THREE.Color(1, 1, 1).lerp(d, 0.45)); }
    this.mat.color.copy(c);
  }
  setVisible(v) { this.visible = v; this.root.visible = v; this.shadow.visible = v; }
  get time01() { const a = this.sh.actions[this.action]; return Math.min(1, a.dur ? this.t / a.dur : this.t * a.fps / a.frames); }
  place(p) {
    if (this.lastXZ) { const d = Math.hypot(p.x - this.lastXZ.x, p.z - this.lastXZ.z); if (d < 1) this.moved += d; }
    this.lastXZ = { x: p.x, z: p.z };
    const tp = T(p); this.root.position.copy(tp); this.shadow.position.set(tp.x, tp.y + 0.03, tp.z);
  }
  update(dt) {
    this.t += dt * Math.max(0, this.speed); this.life = (this.life || Math.random() * 10) + dt;
    if (this.fadeDur > 0) this.fadeT += dt;
    if (this.flashT > 0) this.flashT -= dt;
    this.mat.emissiveIntensity = this.flashT > 0 ? 0.45 * Math.min(1, this.flashT / 0.1) : 0;
    this.yaw0 = this.yaw;                                                   // facing before this frame's turn (start of a run)
    let dy = this.targetYaw - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const swing = this.sh.actions[this.action] && this.sh.actions[this.action].keys;
    this.yaw += dy * Math.min(1, dt * (swing ? 30 : 18));                  // a swing turns to its target during the wind-up
    // ground speed from real displacement (or a fixed demo speed for previews standing still)
    const dist = this.treadmill > 0 ? this.treadmill * dt : this.moved; this.moved = 0;
    if (dt > 0) this.gaitV += (dist / dt - this.gaitV) * Math.min(1, dt * 12);
    const loco = this.action === 'walk' && this.gaitV > 0.15;
    this.ldt = dt;
    // stopping: keep the gait IK running a moment with the idle footprint as the target, so the feet finish with a short
    // step onto the idle stance (no blend that slides the feet), then hand over to the key-framed idle pose
    if (loco) this.settleT = -1;
    else if (this.action === 'idle' && this.gaitW > 0.5 && !(this.settleT >= 0)) this.settleT = 0;
    const settling = this.settleT >= 0 && this.action === 'idle';
    if (settling) { this.settleT += dt; if (this.settleT < 0.5 && !(this.settled && this.settleT > 0.12)) this.gaitW = 1; else this.gaitW += (0 - this.gaitW) * Math.min(1, dt * 14); if (this.gaitW < 0.01) this.settleT = -1; }
    else {
      if (!loco) this.settleT = -1;
      // starting from a standing pose: take over at once with both feet locked where the idle stance put them (IK = pose on
      // screen, no pop); the first step then leaves from there, and a foot that would twist in a turning start re-steps
      if (loco && this.gaitW < 0.05 && this.md.leg && !this.md.cfg.npc) { this.gaitW = 1; this.feet = null; this.startFeet = true; }
      else this.gaitW += ((loco ? 1 : 0) - this.gaitW) * Math.min(1, dt * (loco ? 22 : 14));
    }
    if (this.gaitW > 0.01 && !settling) this.gaitPh = fract(this.gaitPh + dist / gaitParams(Math.max(0.3, this.gaitV), this.md.leg).cycle);
    else if (this.gaitW <= 0.01) this.gaitPh = 0.15;                       // next start: mid-stance, not mid-stride
    if (!this.md.cfg.npc) this.updateOverlay(dt);
    this.apply();
    // swing afterimage from the real blade while the action's trail window [start, end] (seconds) is open
    // (trail = one [start, end] window, or a list of them: skill flurries only trail the cutting part of each strike)
    const a = this.sh.actions[this.action], tw = a && a.trail, wins = tw ? (typeof tw[0] === 'number' ? [tw] : tw) : [];
    const on = this.swingW > 0.5 && SWING_TRAIL.on && wins.some(w => this.t >= w[0] && this.t <= w[1]);
    if (on || (this.trail && this.trail.s.length)) { if (!this.trail) this.trail = new SwingTrail(this.scene); this.trail.update(dt, on ? this.bladePoints() : null, a && a.trailColor, a && a.trailLife, a && a.trailBase); }
  }
  poseOf(name) {
    const a = this.sh.actions[name]; if (!a) return this.currentPose();
    const n = a.frames, f = (this.t * a.fps) % n, i = Math.floor(f); return lerpPose(a.poses[i], a.poses[(i + 1) % n], f - i);
  }
  /** pose of any keyed action A at time t (the draw / sheathe overlay; does not touch the body's own action) */
  poseAtOf(A, t) {
    const K = A.keys, P = A.poses, n = A.frames; if (t >= K[n - 1]) return P[n - 1];
    let i = 0; while (i < n - 2 && t >= K[i + 1]) i++;
    const u = (t - K[i]) / Math.max(1e-4, K[i + 1] - K[i]), e = EASE[P[i + 1].e] || (x => x);
    return crPose(P[Math.max(0, i - 1)], P[i], P[i + 1], P[Math.min(n - 1, i + 2)], e(Math.min(1, Math.max(0, u))));
  }
  /** the action's own pose at time t (no cross-fade, does not touch the body's clock) */
  poseAt(t) { const t0 = this.t, f = this.finished; this.t = t; const p = this.currentPose(); this.t = t0; this.finished = f; return p; }
  currentPose() {
    const a = this.sh.actions[this.action], n = a.frames;
    if (a.keys) {                                                          // timed keys (seconds) with per-segment easing
      const K = a.keys, P = a.poses, t = this.t;
      if (t >= K[n - 1]) { this.finished = true; return P[n - 1]; }
      let i = 0; while (i < n - 2 && t >= K[i + 1]) i++;
      const u = (t - K[i]) / Math.max(1e-4, K[i + 1] - K[i]), e = EASE[P[i + 1].e] || (x => x);
      return crPose(P[Math.max(0, i - 1)], P[i], P[i + 1], P[Math.min(n - 1, i + 2)], e(Math.min(1, Math.max(0, u))));
    }
    let f = this.t * a.fps;
    if (a.loop) { f %= n; const i = Math.floor(f), j = (i + 1) % n; return lerpPose(a.poses[i], a.poses[j], f - i); }
    if (f >= n - 1) { if (f >= n) this.finished = true; return a.poses[n - 1]; }
    const i = Math.floor(f); return lerpPose(a.poses[i], a.poses[i + 1], f - i);
  }
  apply() {
    const md = this.md;
    // walking / running: legs and upper body come from the procedural gait; underneath it is the idle stance, never the
    // key-framed walk cycle (that one slid its feet while the gait blended in or when the character pushed into a wall)
    let p = this.action === 'walk' && md.leg && !md.cfg.npc ? this.poseOf('idle') : this.currentPose();
    if (this.fadeDur > 0 && this.fromPose) { const k = this.fadeT / this.fadeDur; if (k < 1) p = lerpPose(this.fromPose, p, EASE.s(k)); else this.fadeDur = 0; }
    this.lastPose = p;
    // draw / sheathe overlay: its sword arm (hand / blade / elbow / ik / toBack) on top of idle or walking. A swing or skill
    // (a pose with its own hand) takes over at once: a draw that got that far counts as done
    if (this.over && !md.cfg.npc) {
      if (p.hand) { if (this.over.name === 'draw') this.armed = true; this.over = null; }
      else {
        const A = this.sh.actions[this.over.name], po = this.poseAtOf(A, this.over.t), still = this.gaitW < 0.3;
        p = Object.assign({}, p, { hand: po.hand, blade: po.blade, elbow: po.elbow, ik: po.ik, toBack: po.toBack || 0,
          twist: (p.twist || 0) + (still ? po.twist || 0 : 0), lean: (p.lean || 0) + (still ? po.lean || 0 : 0) });
      }
    }
    let Q = md.cfg.npc ? npcIdle(this.t, this.lookYaw || 0) : poseToBones(p, md.cfg.headPitch);
    let bodyY = md.cfg.npc ? 0 : (p.bob || 0) - (p.sink || 0), swayX = 0;
    if (!md.cfg.npc && md.leg) Q = alignLegs(md, Q);
    // idle breathing (2026-11-13): chest rises, shoulders lift a little, the free hands drift, the head nods on the breath;
    // fades out with the gait (gaitW) so walking / swings are untouched
    if (!md.cfg.npc && this.action === 'idle' && !this.over) {
      const t = this.life || 0, br = Math.sin(t * 2.3), dr = Math.sin(t * 0.9 + 1.3), w = 1 - Math.min(1, this.gaitW || 0);
      if (w > 0.01) {
        const R = (b, m) => { Q[b] = Q[b] ? mul(Q[b], m) : m; };
        R('Chest', rx(-1.6 * br * w)); R('Spine', rx(-0.6 * br * w)); R('Head', rx((1.0 * br - 0.6 * dr) * w));
        R('Left_Shoulder', rz(-1.8 * br * w)); R('Right_Shoulder', rz(1.8 * br * w));
        R('Left_UpperArm', mul(rx(2.2 * dr * w), rz(-1.5 * br * w))); R('Right_UpperArm', rz(1.5 * br * w));
        R('Left_LowerArm', ry(-3 * dr * w));
      }
    }
    if (!md.cfg.npc && this.armW < 0.999) {                                 // empty right hand: fingers open up from the grip fist
      const k = 1 - this.armW;
      for (const fg of ['Index', 'Middle', 'Ring', 'Pinky']) { Q['Right_' + fg + 'Proximal'] = rz(60 - 38 * k); Q['Right_' + fg + 'Intermediate'] = rz(70 - 44 * k); }
    }
    // swings: feet stay planted in a fighting stance while the pelvis twists and sinks (knees solved by IK)
    if (!md.cfg.npc && md.leg && p.plant > 0.01 && p.step) Q = blendBones(Q, this.plantLegs(p, Q, bodyY), Math.min(1, p.plant));
    if (!md.cfg.npc && this.gaitW > 0.01 && md.leg) {
      const settle = this.settleT >= 0 && this.action === 'idle' ? Math.min(1, this.settleT / 0.15) : 0;
      const gp = gaitPose(this, this.gaitPh, Math.max(0.3, this.gaitV), p, settle), w = Math.min(1, this.gaitW);
      Q = blendBones(Q, gp.Q, w);
      const hipBind = (md.leg.Left.hip + md.leg.Right.hip) / 2;
      bodyY = lerp(bodyY, gp.hipH - hipBind, w); swayX = gp.sway * w;
    } else this.feet = null;
    // world (model-space) matrix of every bone: parent's change applied to the bind matrix rotated about the joint
    let W = this.worldOf(Q);
    // sword arm by IK on top of the finished torso: the hand follows the authored arc around the (twisted) shoulder
    this.swingW = !md.cfg.npc && p.hand && md.byName.Right_UpperArm !== undefined ? Math.min(1, p.ik) : 0;
    if (this.swingW > 0.01) {
      const c = armChain(md), sh = md.byName.Right_Shoulder, dSh = mul(_m().copy(W[sh]), md.bones[sh].inv);
      const Rp = rotOnly(dSh), Sn = c.S.clone().applyMatrix4(dSh), L = c.L1 + c.L2;
      const T = Sn.clone().addScaledVector(dirAE(p.hand[0], p.hand[1]), L * p.hand[2]);
      const pole = p.elbow ? _v(...p.elbow).normalize() : _v(-0.6, -1, -0.35).normalize();
      let bd = p.blade ? dirAE(p.blade[0], p.blade[1]) : _v(0, 0.3, 1);
      if (p.toBack > 0.001) {                                                // draw / sheathe: the hand goes to the grip on the back
        const bm = this.backMount(), uc = bm.bone, dUC = mul(_m().copy(W[uc]), md.bones[uc].inv), k = Math.min(1, p.toBack);
        T.lerp(bm.grip.clone().applyMatrix4(dUC), k); bd = bd.clone().lerp(bm.dir.clone().transformDirection(dUC), k).normalize();
      }
      const r = solveArm(c, Sn, T, pole, bd);
      const Rpi = Rp.clone().invert(), ik = { Right_UpperArm: mul(Rpi, r.Rua), Right_LowerArm: mul(r.Rua.clone().invert(), r.Rla), Right_Hand: mul(r.Rla.clone().invert(), r.Rh) };
      Q = blendBones(Q, ik, this.swingW); W = this.worldOf(Q);
    }
    for (let i = 0; i < md.bones.length; i++) {
      const b = md.bones[i], bone = this.bones[i];
      bone.matrix.copy(b.parent < 0 ? W[i] : mul(_m().copy(W[b.parent]).invert(), W[i]));
      bone.matrixWorldNeedsUpdate = true;
    }
    // body bob / sink (metres) and facing
    this.mesh.position.y = bodyY; this.mesh.position.x = swayX;   // visual weight shift only: collision / camera follow the root
    // whole-body somersault (action.flips = [start, end, deg, pivotHeight]): the mesh pitches about a point pivotHeight m
    // above the feet (a forward roll on the ground); computed from the action time like spins, a full 360 ends upright
    const fa = this.sh.actions[this.action]; let flip = 0, fh = 0.5;
    if (fa && fa.flips) for (const [s0, s1, deg, h] of fa.flips) if (this.t > s0) { flip += deg * (this.t < s1 ? EASE.io((this.t - s0) / (s1 - s0)) : 1); if (h) fh = h; }
    flip = flip % 360;
    if (flip) { const a = flip * DEG, y = bodyY - fh; this.mesh.rotation.x = a; this.mesh.position.y = fh + y * Math.cos(a); this.mesh.position.z = y * Math.sin(a); }
    else if (this.mesh.rotation.x || this.mesh.position.z) { this.mesh.rotation.x = 0; this.mesh.position.z = 0; }
    // whole-body turns of a skill (action.spins = [start, end, deg]): eased root yaw on top of the facing; it is computed
    // from the action time (not interpolated between keys), so a full circle never unwinds when the action ends
    let spin = 0; const ca = this.sh.actions[this.action];
    if (ca && ca.spins) for (const [s0, s1, deg] of ca.spins) if (this.t > s0 && this.t < s1) spin += deg * EASE.io((this.t - s0) / (s1 - s0));
    this.root.rotation.y = this.yaw + spin * DEG;
    const wid = !p.held && this.weaponId ? this.weaponId() : null;
    this.W = W;
    // stow actions (약사 약병 투구 ph_pitch): the weapon stays on the back for the whole motion and the thrown item sits in the
    // empty right hand (prop slot H) until the release key; other actions with `held` swap the weapon for the item as before
    const stow = !!(ca && ca.stow) && !md.cfg.npc, wkind = wid && isWeaponModel(wid) ? 'item:' + wid : this.weapon;
    if (stow) { const w0 = this.weaponId ? this.weaponId() : null; this.updateProp('R', w0 && isWeaponModel(w0) ? 'item:' + w0 : this.weapon, 0); this.updateProp('H', p.held || null, (p.wOff - 90) * (1 - (this.swingW || 0))); }
    else { this.updateProp('R', p.held || wkind, (p.wOff - 90) * (1 - (this.swingW || 0))); if (this.props.H) this.updateProp('H', null, 0); }
    this.updateProp('L', p.held && !stow ? null : this.armW > 0.5 ? this.off : null, p.offOff - 90);
  }
  worldOf(Q) {
    const md = this.md, W = new Array(md.bones.length), S = this.bscale || (this.bscale = boneScales(md));
    for (let i = 0; i < md.bones.length; i++) {
      const b = md.bones[i], q = Q[b.name], k = S[i];
      let local = b.bind;
      if (q || k !== 1) local = mul(_m().makeTranslation(b.t.x, b.t.y, b.t.z), q || _m(), k !== 1 ? _m().makeScale(k, k, k) : _m(), _m().makeTranslation(-b.t.x, -b.t.y, -b.t.z), b.bind);
      W[i] = b.parent < 0 ? local.clone() : mul(W[b.parent], md.bones[b.parent].inv, local);
    }
    return W;
  }
  /** fighting stance: both ankles fixed on the ground (left a step forward, right back, toes turned like a fencer);
   *  the pelvis twist / sink of the pose is absorbed by the knees, so the feet never slide during a swing */
  // (step = extra forward offset per foot; 0 keeps the idle footprint)
  plantLegs(p, Q, bodyY) {
    const md = this.md, leg = md.leg, ch = legChain(md), out = {};
    const RH = rotOnly(Q.Hips || _m()), RHi = RH.clone().invert();
    for (const [side, i] of [['Left', 0], ['Right', 1]]) {
      // same spot and toe-out as the idle stance (alignLegs), so blending in / out of a swing does not move the feet
      const c = ch[side], g = leg[side], yaw = c.sg * Math.min(g.toeOut, TOE_OUT) * DEG;
      const Hn = c.H.clone().sub(ch.pelvis).applyMatrix4(RH).add(ch.pelvis);
      // step is in the action-start space: minus the root travel (adv) so far = where the planted foot is under the body now
      const A = _v(c.sg * (g.ankX - Math.min(STAND_IN, Math.max(0, g.ankX - 0.09))), -bodyY + g.ha + (p.lift ? p.lift[i] : 0), c.A.z + p.step[i] - (p.adv || 0));
      const pole = _v(Math.sin(yaw) * 0.9 + c.sg * 0.15, 0, Math.cos(yaw)).normalize();
      const r = solveLeg(c, Hn, A, pole, yaw, 0);
      out[side + '_UpperLeg'] = mul(RHi, r.Rth); out[side + '_LowerLeg'] = mul(r.Rth.clone().invert(), r.Rsh); out[side + '_Foot'] = mul(r.Rsh.clone().invert(), r.Rft);
    }
    return out;
  }
  /** blade base / tip of the right-hand weapon in world space (for the swing trail), or null */
  bladePoints() {
    const h = this.props.R; if (!h || !this.visible || this.armW < 0.5) return null;
    this.root.updateMatrixWorld(true);
    if (h.userData.len === undefined) { const bb = new THREE.Box3().setFromObject(h.children[0]).applyMatrix4(_m().copy(h.matrixWorld).invert()); h.userData.len = Math.max(0.1, bb.max.z); }
    const L = h.userData.len, mw = h.matrixWorld;
    return [_v(0, 0, L * 0.38).applyMatrix4(mw), _v(0, 0, L).applyMatrix4(mw)];
  }
  /** back holder of the right-hand weapon (bind space, model units): grip just above and behind the right shoulder,
   *  blade running diagonally down to the left hip, flat against the back. The back surface is measured from the mesh
   *  (min z of the torso vertices at chest height), so male / female / job outfits each get their own depth. */
  backMount() {
    const md = this.md; if (md._back) return md._back;
    const s = md.scale, P = n => md.bones[md.byName[n]].t, ua = P('Right_UpperArm'), uc = md.byName.UpperChest ?? md.byName.Chest;
    const pos = md.geometry.attributes.position.array, y0 = P('Chest').y, y1 = P('Neck').y, xw = Math.abs(ua.x) * 0.9;
    let zMin = Infinity; for (let i = 0; i < pos.length; i += 3) if (pos[i + 1] > y0 && pos[i + 1] < y1 && Math.abs(pos[i]) < xw) zMin = Math.min(zMin, pos[i + 2]);
    if (!isFinite(zMin)) zMin = P('UpperChest').z - 0.12 / s;
    const B = BACK_MOUNT, grip = _v(ua.x * B.x, ua.y + B.up / s, zMin - B.out / s);
    const dir = _v(B.dir[0], B.dir[1], B.dir[2]).normalize(), X = _v(0, 0, 1).addScaledVector(dir, -dir.z).normalize(), Y = _v().crossVectors(dir, X);
    const M = _m().makeBasis(X, Y, dir).setPosition(grip).multiply(_m().makeScale(1.3 / s, 1.3 / s, 1.3 / s));
    return (md._back = { bone: uc, grip, dir, M });
  }
  updateProp(side, kind, tilt) {
    if (this.propKind[side] !== kind) {
      if (this.props[side]) { this.props[side].parent.remove(this.props[side]); this.props[side] = null; }
      this.propKind[side] = kind;
      if (kind) {
        const hi = this.md.byName[(side === 'L' ? 'Left' : 'Right') + '_Hand'];
        // held in mesh space: the matrix is the hand grip (or, for the right weapon, the back holder / a glide between them)
        const holder = new THREE.Group(); holder.matrixAutoUpdate = false; holder.add(kind.startsWith('item:') ? itemModel(kind.slice(5)) : makeProp(kind));
        // the player's weapon gets the same thin outline as the body (only its big parts: handle, head - small trims / gems skip it)
        if (side === 'R' && !this.md.cfg.npc) { const ms = []; holder.traverse(o => { if (o.isMesh && o.geometry) { o.geometry.computeBoundingSphere(); if (o.geometry.boundingSphere.radius > 0.06) ms.push(o); } }); for (const o of ms) addOutline(o); }
        this.mesh.add(holder); this.props[side] = holder; holder.userData.hi = hi;
      }
    }
    const h = this.props[side]; if (!h) return;
    const md = this.md, hi = h.userData.hi, b = md.bones[hi], along = side === 'L' ? 1 : -1, s = md.scale, W = this.W;
    // grip at the palm in bind space, item axis forward (+z) tilted by the pose, authored in metres
    const bindM = mul(_m().makeTranslation(b.t.x + along * 0.027 / s, b.t.y - 0.01, b.t.z + 0.01), rx(-(tilt || 0)), _m().makeScale(1.3 / s, 1.3 / s, 1.3 / s));
    const inHand = mul(_m().copy(W[hi]), b.inv, bindM);
    const a = side === 'R' && !md.cfg.npc ? this.armW : 1;
    if (a >= 0.999) h.matrix.copy(inHand);
    else {
      const bm = this.backMount(), onBack = mul(_m().copy(W[bm.bone]), md.bones[bm.bone].inv, bm.M);
      if (a <= 0.001) h.matrix.copy(onBack);
      else {                                                                 // glide hand <-> back (position lerp, rotation slerp)
        const p0 = _v(), p1 = _v(), q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion(), s0 = _v(), s1 = _v();
        onBack.decompose(p0, q0, s0); inHand.decompose(p1, q1, s1); const e = EASE.s(a);
        h.matrix.compose(p0.lerp(p1, e), q0.slerp(q1, e), s0.lerp(s1, e));
      }
    }
    h.matrixWorldNeedsUpdate = true;
  }
  dispose() {
    if (this.trail) this.trail.dispose();
    this.scene.remove(this.root, this.shadow);
    this.mat.dispose();
    this.root.traverse(o => { if (o.isMesh && o !== this.mesh && !o.userData.outline) { o.geometry.dispose(); o.material.dispose(); } });   // outline hulls share the cached geometry / material
  }
}
