// 3D castle town: the user's Tripo models (fountain, pharmacy cottage, smithy) + procedurally modelled shops in the
// same style (cream stone ground floor, timber-framed plaster, blue slate roofs, gold finials), castle walls,
// towers, gatehouse, keep, flagstone courtyard with cobbled roads. Layout / collision come from
// tools/town_castle.py (zone.town3d + zone.blockPolys); everything here is in game (Unity) metres, T() maps to three.
import { THREE, T } from './render.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const DEG = Math.PI / 180;
const BASE = 'assets/town3d/';
let ANISO = 8;

// ---------------------------------------------------------------- textures / materials
const texCache = new Map();
function ttex(name, srgb = true) {
  const key = name + (srgb ? '' : ':lin');
  if (texCache.has(key)) return texCache.get(key);
  const file = BASE + 'tex/' + name + (name.startsWith('awning') ? '.png' : '.jpg');
  const t = new THREE.TextureLoader().load(file);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = ANISO;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texCache.set(key, t); return t;
}
const HAS_N = new Set(['pave', 'cobble', 'wallstone', 'basestone', 'slate', 'plaster', 'grass', 'wood', 'planks', 'bluewood']);
// metres covered by one texture repeat
const TILE = { pave: 4.2, cobble: 3.2, wallstone: 4.0, basestone: 3.2, slate: 3.0, plaster: 2.4, grass: 7.0, wood: 1.6, planks: 1.8, bluewood: 1.4 };
const matCache = new Map();
// per-town colour scheme (spec.palette: material name -> '#rrggbb' multiplied into the texture / colour), set by buildTown3D
let PALETTE = {}, PAL_ID = '';
function M(key0) {
  const key = key0 + PAL_ID;
  if (matCache.has(key)) return matCache.get(key);
  key0 = null;
  const [name, tint] = key.slice(0, key.length - PAL_ID.length).split('#');
  let m;
  if (TILE[name]) {
    const grey = PALETTE[name] && (name === 'slate' || name === 'bluewood' || (name === 'grass' && PALETTE.snow));       // blue textures: tint a grey copy instead (tools/town/grey_tex.py)
    m = new THREE.MeshStandardMaterial({ map: ttex(grey ? name + '_grey' : name), roughness: name === 'slate' ? 0.7 : 0.92, metalness: 0 });
    if (HAS_N.has(name)) { m.normalMap = ttex(name + '_n', false); m.normalScale.set(0.9, 0.9); }
  } else if (name === 'window') {
    m = new THREE.MeshStandardMaterial({ map: ttex('window'), emissive: 0xffb45a, emissiveMap: ttex('window'), emissiveIntensity: 0.65, roughness: 0.4 });
  } else if (name.startsWith('awning')) {
    m = new THREE.MeshStandardMaterial({ map: ttex(name), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95 });
  } else {
    const col = { iron: 0x3a3c44, gold: 0xd8b04a, dark: 0x1c1a1c, glow: 0xffa040, straw: 0xd8b860, cream: 0xefe2c4, terracotta: 0xb4643c,
      water: 0x3a8ab8, earth: 0x5a4430, red: 0xb83a34, green: 0x4a8a4a, orange: 0xe08a2a, purple: 0x8a5ab0, pink: 0xe07ab0, white: 0xf2efe8,
      bread: 0xc88a40, crust: 0x9a5a24, steel: 0xc8ced8, blue: 0x3a4a9a, lavender: 0xb08ad8, yellow: 0xf0d050, sack: 0xd8c8a0, fabric1: 0xb04a6a, fabric2: 0x4a7ab0, fabric3: 0xd8b04a }[name] ?? 0xff00ff;
    m = new THREE.MeshStandardMaterial({ color: col, roughness: name === 'gold' || name === 'steel' ? 0.35 : 0.85, metalness: name === 'gold' || name === 'steel' || name === 'iron' ? 0.6 : 0 });
    if (name === 'glow') { m.color.set(0xffd27a); m.emissive = new THREE.Color(0xffa040); m.emissiveIntensity = 3.2; }
    if (name === 'water') { m.roughness = 0.2; }
  }
  if (tint) { m = m.clone(); m.color = new THREE.Color('#' + tint); }
  if (PALETTE[name]) { if (!tint) m = m.clone(); m.color.multiply(new THREE.Color(PALETTE[name])); }
  matCache.set(key, m); return m;
}
const canvasCache = new Map();
function canvasMat(key, w, h, draw, opts = {}) {
  if (canvasCache.has(key)) return canvasCache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = ANISO;
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, side: opts.side ?? THREE.FrontSide, alphaTest: opts.alpha ? 0.5 : 0, transparent: false });
  canvasCache.set(key, m); return m;
}

// ---------------------------------------------------------------- geometry helpers
/** planar UVs in metres (by dominant normal axis) so every surface shares the same texel density */
function puv(geo, tile) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else if (ax >= az) { u = p.getZ(i) * Math.sign(n.getX(i) || 1); v = p.getY(i); }
    else { u = -p.getX(i) * Math.sign(n.getZ(i) || 1); v = p.getY(i); }
    uv[i * 2] = u / tile; uv[i * 2 + 1] = v / tile;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
/** collects pieces, bakes transforms, merges per material: one draw call per material per building */
class Kit {
  constructor() { this.parts = new Map(); this.extra = []; }
  add(geo, key, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = null, uv = true } = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    const name = key.split('#')[0];
    if (uv && TILE[name]) puv(g, TILE[name]);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')),
      s ? new THREE.Vector3(...s) : new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a);
    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key).push(g); return this;
  }
  box(w, h, d, key, o = {}) { return this.add(new THREE.BoxGeometry(w, h, d), key, o); }
  /** box sitting on y (bottom at o.y) */
  block(w, h, d, key, o = {}) { return this.add(new THREE.BoxGeometry(w, h, d), key, { ...o, y: (o.y || 0) + h / 2 }); }
  cyl(r0, r1, h, key, o = {}, seg = 16, open = false) { return this.add(new THREE.CylinderGeometry(r0, r1, h, seg, 1, open), key, { ...o, y: (o.y || 0) + h / 2 }); }
  sphere(r, key, o = {}, seg = 10) { return this.add(new THREE.SphereGeometry(r, seg, Math.max(6, seg * 0.7 | 0)), key, o); }
  mesh(obj) { this.extra.push(obj); return this; }
  build() {
    const grp = new THREE.Group();
    for (const [key, list] of this.parts) {
      const g = mergeGeometries(list, false); g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, M(key)); mesh.castShadow = !key.startsWith('window') && !key.startsWith('glow'); mesh.receiveShadow = true;
      grp.add(mesh);
    }
    for (const e of this.extra) grp.add(e);
    return grp;
  }
}
/** the same Kit API in a rotated / offset frame, so facade helpers (which build towards +z) work on any wall */
class Face {
  constructor(k, ry, ox, oz) { this.k = k; this.ry = ry; this.ox = ox; this.oz = oz; this.c = Math.cos(ry); this.s = Math.sin(ry); }
  add(geo, key, o = {}) { const x = o.x || 0, z = o.z || 0; return this.k.add(geo, key, { ...o, x: this.ox + x * this.c + z * this.s, z: this.oz - x * this.s + z * this.c, ry: (o.ry || 0) + this.ry }), this; }
  box(w, h, d, key, o = {}) { return this.add(new THREE.BoxGeometry(w, h, d), key, o); }
  block(w, h, d, key, o = {}) { return this.add(new THREE.BoxGeometry(w, h, d), key, { ...o, y: (o.y || 0) + h / 2 }); }
  cyl(r0, r1, h, key, o = {}, seg = 16) { return this.add(new THREE.CylinderGeometry(r0, r1, h, seg), key, { ...o, y: (o.y || 0) + h / 2 }); }
  sphere(r, key, o = {}, seg = 10) { return this.add(new THREE.SphereGeometry(r, seg, Math.max(6, seg * 0.7 | 0)), key, o); }
  mesh(obj) { this.k.mesh(obj); return this; }
}
/** cylinder wall with UVs in metres around / up */
function towerWall(r, h, key, seg = 28) {
  const g = new THREE.CylinderGeometry(r, r, h, seg, 1, true), uv = g.attributes.uv, tile = TILE[key.split('#')[0]];
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2 * Math.PI * r / tile, uv.getY(i) * h / tile);
  return g;
}
function coneRoof(r, h, seg = 28) {
  const g = new THREE.ConeGeometry(r, h, seg, 4, true), uv = g.attributes.uv, sl = Math.hypot(r, h);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2 * Math.PI * r / TILE.slate, uv.getY(i) * sl / TILE.slate);
  return g;
}
const place = (obj, pos, h = 180, y = 0) => { obj.position.copy(T({ x: pos[0], y, z: pos[1] })); obj.rotation.y = Math.PI - h * DEG; return obj; };

// ---------------------------------------------------------------- shared facade parts (local frame: front = +z, width along x)
function windowAt(k, x, y, z, w = 0.95, h = 1.3, o = {}) {
  const ft = 0.12;
  k.add(new THREE.PlaneGeometry(w, h), 'window', { x, y, z: z + 0.02, uv: false });
  k.box(w + 0.24, ft, 0.16, 'wood', { x, y: y + h / 2 + ft / 2, z: z + 0.04 });
  k.box(w + 0.34, 0.12, 0.3, o.stoneSill ? 'basestone' : 'wood', { x, y: y - h / 2 - 0.06, z: z + 0.1 });
  k.box(ft, h, 0.16, 'wood', { x: x - w / 2 - ft / 2, y, z: z + 0.04 }); k.box(ft, h, 0.16, 'wood', { x: x + w / 2 + ft / 2, y, z: z + 0.04 });
  k.box(0.07, h, 0.08, 'wood', { x, y, z: z + 0.04 }); k.box(w, 0.07, 0.08, 'wood', { x, y: y + 0.1, z: z + 0.04 });
  if (o.shutters !== false) {
    const sk = o.shutterKey || 'bluewood';
    for (const sx of [-1, 1]) k.box(w * 0.5, h + 0.05, 0.06, sk, { x: x + sx * (w / 2 + 0.12 + w * 0.25), y, z: z + 0.06 });
  }
  if (o.flowers !== false) flowerBox(k, x, y - h / 2 - 0.2, z + 0.2, w + 0.3, o.flowerKeys);
}
function flowerBox(k, x, y, z, w, keys = ['pink', 'purple', 'white']) {
  k.box(w, 0.26, 0.3, 'planks', { x, y, z });
  const n = Math.max(3, Math.round(w / 0.16));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n - 0.5, j = Math.sin(i * 12.9898) * 43758.5453 % 1;
    k.sphere(0.1 + Math.abs(j) * 0.05, keys[i % keys.length], { x: x + t * (w - 0.1), y: y + 0.18 + Math.abs(j) * 0.08, z: z + (j - 0.5) * 0.12 }, 6);
    if (i % 2 === 0) k.sphere(0.09, 'green', { x: x + t * (w - 0.1) + 0.05, y: y + 0.13, z: z + 0.08 }, 5);
  }
}
function doorAt(k, x, z, w = 1.3, h = 2.35, key = 'planks') {
  k.box(w, h, 0.14, key, { x, y: h / 2 + 0.35, z: z + 0.02 });
  // stone surround with a pointed top
  k.box(0.32, h + 0.2, 0.3, 'basestone', { x: x - w / 2 - 0.16, y: (h + 0.2) / 2 + 0.35, z: z + 0.08 });
  k.box(0.32, h + 0.2, 0.3, 'basestone', { x: x + w / 2 + 0.16, y: (h + 0.2) / 2 + 0.35, z: z + 0.08 });
  k.box(w + 0.64, 0.4, 0.32, 'basestone', { x, y: h + 0.55, z: z + 0.08 });
  for (const yy of [0.9, 2.0]) k.box(w * 0.8, 0.07, 0.04, 'iron', { x, y: yy + 0.35, z: z + 0.1 });
  k.sphere(0.06, 'gold', { x: x + w * 0.32, y: 1.4, z: z + 0.14 }, 6);
  k.box(w + 0.8, 0.18, 0.7, 'basestone', { x, y: 0.26, z: z + 0.42 });                  // step
}
function awningAt(k, x, y, z, w, key, depth = 1.5, drop = 0.75) {
  const L = Math.hypot(depth, drop), g = new THREE.PlaneGeometry(w, L);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 2.2, uv.getY(i));
  // plane +y edge at the wall, scalloped -y edge hanging out and down
  k.add(g, key, { x, y: y - drop / 2, z: z + depth / 2, rx: -Math.atan2(depth, drop), uv: false });
  k.box(w + 0.2, 0.12, 0.12, 'wood', { x, y, z: z + 0.06 });
  for (const sx of [-1, 1]) k.box(0.06, 0.06, depth + 0.1, 'iron', { x: x + sx * w / 2, y: y - drop / 2, z: z + depth / 2, rx: Math.atan2(drop, depth) });
}
function signAt(k, x, y, z, icon, side = 1) {
  k.box(0.1, 0.1, 1.0, 'iron', { x, y: y + 0.55, z: z + 0.5 });
  const m = canvasMat('sign_' + icon, 256, 256, (g, w, h) => {
    g.fillStyle = '#7a4e2c'; g.fillRect(0, 0, w, h); g.strokeStyle = '#d8b04a'; g.lineWidth = 14; g.strokeRect(10, 10, w - 20, h - 20);
    g.save(); g.translate(w / 2, h / 2); drawIcon(g, icon); g.restore();
  });
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.8), [M('wood'), M('wood'), M('wood'), M('wood'), M('wood'), M('wood')]);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 0.74), m); face.rotation.y = side * Math.PI / 2; face.position.x = side * 0.045;
  const back = face.clone(); back.rotation.y = -side * Math.PI / 2; back.position.x = -side * 0.045;
  const s = new THREE.Group(); s.add(board, face, back); s.position.set(x, y, z + 0.85);
  k.box(0.03, 0.2, 0.03, 'iron', { x, y: y + 0.45, z: z + 0.6 }); k.box(0.03, 0.2, 0.03, 'iron', { x, y: y + 0.45, z: z + 1.1 });
  k.mesh(s);
}
function drawIcon(g, icon) {
  g.lineJoin = 'round';
  if (icon === 'bread') {
    g.fillStyle = '#e0a050'; g.beginPath(); g.ellipse(0, 10, 80, 46, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#8a4a1a'; g.lineWidth = 8;
    for (const xx of [-36, 0, 36]) { g.beginPath(); g.moveTo(xx - 14, -18); g.lineTo(xx + 14, 30); g.stroke(); }
  } else if (icon === 'sword') {
    g.rotate(-Math.PI / 4); g.fillStyle = '#e8eef6'; g.fillRect(-10, -96, 20, 130); g.fillStyle = '#d8b04a'; g.fillRect(-42, 30, 84, 16); g.fillStyle = '#6a3a1a'; g.fillRect(-8, 46, 16, 40);
    g.rotate(Math.PI / 2); g.fillStyle = '#3a4a9a'; g.beginPath(); g.moveTo(-40, -50); g.lineTo(40, -50); g.lineTo(40, 10); g.lineTo(0, 60); g.lineTo(-40, 10); g.closePath(); g.fill(); g.strokeStyle = '#d8b04a'; g.lineWidth = 8; g.stroke();
  } else if (icon === 'dress') {
    g.fillStyle = '#9a6ad0'; g.beginPath(); g.moveTo(-22, -70); g.lineTo(22, -70); g.lineTo(30, -20); g.lineTo(78, 80); g.lineTo(-78, 80); g.lineTo(-30, -20); g.closePath(); g.fill();
    g.fillStyle = '#f0e0ff'; g.fillRect(-30, -24, 60, 12); g.strokeStyle = '#d8b04a'; g.lineWidth = 6; g.beginPath(); g.moveTo(0, -96); g.lineTo(0, -70); g.stroke();
  } else if (icon === 'potion') {
    g.fillStyle = '#5ad282'; g.beginPath(); g.arc(0, 26, 58, 0, Math.PI * 2); g.fill(); g.fillStyle = '#dcf0e6'; g.fillRect(-18, -70, 36, 50); g.fillStyle = '#8a5a2a'; g.fillRect(-22, -86, 44, 18);
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.arc(-20, 8, 14, 0, Math.PI * 2); g.fill();
  }
}

// ---------------------------------------------------------------- procedural shop (the shops the user had no 3D model for)
const STYLE = {
  bakery:  { awning: 'awning_red', icon: 'bread', shutter: 'bluewood', flowers: ['pink', 'white', 'yellow'], upper: 'plaster', roofTint: null },
  general: { awning: 'awning_green', icon: 'potion', shutter: 'bluewood', flowers: ['pink', 'purple', 'white'], upper: 'plaster', tower: true },
  dress:   { awning: 'awning_purple', icon: 'dress', shutter: 'bluewood#c9a4ff', flowers: ['lavender', 'purple', 'white'], upper: 'plaster#f4e4f0' },
  arms:    { awning: 'awning_blue', icon: 'sword', shutter: 'bluewood', flowers: ['red', 'white'], upper: 'wallstone', banners: true },
};
function house(o) {
  const st = STYLE[o.style], k = new Kit(), w = o.w, d = o.d, fz = d / 2;
  const g0 = 3.3, g1 = 2.7, plinth = 0.35, jetty = st.upper === 'wallstone' ? 0 : 0.35, top = plinth + g0 + g1;
  const doorX = -(o.door || 0);
  // ground floor in stone, upper floor timber-framed plaster (or stone for the armoury)
  k.block(w + 0.3, plinth, d + 0.3, 'basestone');
  k.block(w, g0, d, 'basestone', { y: plinth });
  k.block(w + 0.1, 0.25, d + jetty + 0.1, 'wood', { y: plinth + g0, z: jetty / 2 });
  k.block(w, g1, d + jetty, st.upper, { y: plinth + g0 + 0.25, z: jetty / 2 });
  const uz = fz + jetty;                                                       // upper facade plane
  if (jetty) for (let i = 0; i <= 5; i++) k.box(0.2, 0.2, 0.7, 'wood', { x: -w / 2 + 0.3 + i * (w - 0.6) / 5, y: plinth + g0 - 0.12, z: fz + 0.15 });
  if (st.upper !== 'wallstone') {
    // timber frame: posts, rails, braces on the front and both sides
    const nP = Math.max(3, Math.round(w / 1.6));
    for (let i = 0; i <= nP; i++) k.box(0.2, g1, 0.12, 'wood', { x: -w / 2 + 0.1 + i * (w - 0.2) / nP, y: plinth + g0 + 0.25 + g1 / 2, z: uz + 0.04 });
    k.box(w + 0.1, 0.18, 0.14, 'wood', { y: top + 0.16, z: uz + 0.04 }); k.box(w + 0.1, 0.14, 0.14, 'wood', { y: plinth + g0 + 0.25 + g1 * 0.42, z: uz + 0.04 });
    for (let i = 0; i < nP; i += 2) {
      const x0 = -w / 2 + 0.1 + i * (w - 0.2) / nP, pw = (w - 0.2) / nP, L = Math.hypot(pw, g1 * 0.42);
      k.box(0.14, L, 0.1, 'wood', { x: x0 + pw / 2, y: plinth + g0 + 0.25 + g1 * 0.21, z: uz + 0.05, rz: Math.atan2(pw, g1 * 0.42) * (i % 4 ? 1 : -1) });
    }
    for (const sx of [-1, 1]) for (let i = 0; i <= 3; i++) k.box(0.12, g1, 0.2, 'wood', { x: sx * (w / 2 + 0.04), y: plinth + g0 + 0.25 + g1 / 2, z: -d / 2 + 0.1 + i * (d + jetty - 0.2) / 3 + jetty / 2 - jetty / 2 });
  } else {
    k.box(w + 0.2, 0.3, d + 0.2, 'basestone', { y: top + 0.1 });          // stone string course
  }
  // main gable roof, ridge along x
  const over = 0.55, rise = (d + jetty) * 0.62, half = (d + jetty) / 2 + over, slope = Math.hypot(half, rise + over * rise / ((d + jetty) / 2)), ang = Math.atan2(rise, (d + jetty) / 2);
  const cz = jetty / 2, ry0 = top + 0.3;
  for (const s of [-1, 1]) {
    const L = Math.hypot((d + jetty) / 2 + over, ((d + jetty) / 2 + over) * Math.tan(ang));
    k.box(w + 2 * over, 0.22, L, 'slate', { x: 0, y: ry0 + rise - Math.sin(ang) * L / 2, z: cz + s * Math.cos(ang) * L / 2, rx: s * ang });
    k.box(w + 2 * over + 0.05, 0.12, 0.2, 'terracotta', { y: ry0 + rise - Math.sin(ang) * L + 0.02, z: cz + s * Math.cos(ang) * L });
  }
  k.box(w + 2 * over + 0.1, 0.26, 0.34, 'terracotta', { y: ry0 + rise + 0.08, z: cz, rx: Math.PI / 4 });
  for (const sx of [-1, 1]) {
    // gable ends (plaster triangle) + finials
    const sh = new THREE.Shape(); sh.moveTo(-(d + jetty) / 2, 0); sh.lineTo((d + jetty) / 2, 0); sh.lineTo(0, rise); sh.closePath();
    k.add(new THREE.ShapeGeometry(sh), st.upper === 'wallstone' ? 'wallstone' : st.upper, { x: sx * w / 2, y: ry0 - 0.05, z: cz, ry: sx * Math.PI / 2 });
    k.cyl(0.04, 0.12, 0.5, 'gold', { x: sx * (w / 2 + over * 0.6), y: ry0 + rise + 0.15, z: cz }, 8);
    k.sphere(0.09, 'gold', { x: sx * (w / 2 + over * 0.6), y: ry0 + rise + 0.7, z: cz }, 8);
  }
  // front cross gable with a window (breaks the long roof like the Tripo cottage)
  const gw = Math.min(3.6, w * 0.4), gx = o.style === 'general' ? -w * 0.18 : w * 0.1, grise = gw * 0.62, gd = (d + jetty) / 2 + 0.2;
  k.block(gw, rise * 0.75, gd, st.upper, { x: gx, y: ry0 - 0.05, z: uz - gd / 2 + 0.01 });
  const gsh = new THREE.Shape(); gsh.moveTo(-gw / 2, 0); gsh.lineTo(gw / 2, 0); gsh.lineTo(0, grise); gsh.closePath();
  k.add(new THREE.ShapeGeometry(gsh), st.upper, { x: gx, y: ry0 - 0.05 + rise * 0.75, z: uz + 0.01 });
  const gang = Math.atan2(grise, gw / 2), gL = Math.hypot(gw / 2 + 0.4, (gw / 2 + 0.4) * Math.tan(gang));
  for (const s of [-1, 1]) k.box(0.2, gL, gd + 0.5, 'slate', { x: gx + s * Math.cos(gang) * gL / 2, y: ry0 - 0.05 + rise * 0.75 + grise - Math.sin(gang) * gL / 2 + 0.1, z: uz - gd / 2 + 0.25, rz: s * (Math.PI / 2 - gang) });
  k.box(0.22, 0.22, gd + 0.55, 'terracotta', { x: gx, y: ry0 - 0.05 + rise * 0.75 + grise + 0.16, z: uz - gd / 2 + 0.25, rz: Math.PI / 4 });
  k.cyl(0.04, 0.1, 0.45, 'gold', { x: gx, y: ry0 + rise * 0.75 + grise + 0.2, z: uz + 0.3 }, 8);
  windowAt(k, gx, ry0 + rise * 0.75 * 0.5 + 0.25, uz + 0.02, 0.8, 1.0, { shutters: false, flowers: false });
  if (st.upper !== 'wallstone') {
    const gy0 = ry0 - 0.05, gh = rise * 0.75;
    k.box(gw + 0.1, 0.16, 0.14, 'wood', { x: gx, y: gy0 + gh, z: uz + 0.05 });
    for (const sx of [-1, 1]) {
      k.box(0.16, gh, 0.12, 'wood', { x: gx + sx * (gw / 2 - 0.08), y: gy0 + gh / 2, z: uz + 0.05 });
      const L = Math.hypot(gw / 2 - 0.6, gh * 0.5);
      k.box(0.12, L, 0.1, 'wood', { x: gx + sx * (gw / 4 + 0.15), y: gy0 + gh * 0.25, z: uz + 0.05, rz: sx * Math.atan2(gw / 2 - 0.6, gh * 0.5) });
      const L2 = Math.hypot(gw / 2, grise); k.box(0.14, L2, 0.1, 'wood', { x: gx + sx * gw / 4, y: gy0 + gh + grise / 2, z: uz + 0.05, rz: sx * Math.atan2(gw / 2, grise) });
    }
  }
  // chimney
  const chx = o.style === 'bakery' ? -w / 2 + 1.0 : w / 2 - 1.3;
  k.block(0.95, rise + 2.4, 0.95, 'basestone', { x: chx, y: ry0 - 0.5, z: -d / 4 });
  k.block(1.15, 0.22, 1.15, 'basestone', { x: chx, y: ry0 + rise + 1.9, z: -d / 4 });
  k.cyl(0.18, 0.2, 0.5, 'terracotta', { x: chx, y: ry0 + rise + 2.1, z: -d / 4 }, 8);
  // upper windows
  const nW = Math.max(2, Math.round(w / 3.2));
  for (let i = 0; i < nW; i++) {
    const x = -w / 2 + (i + 0.5) * w / nW;
    windowAt(k, x, plinth + g0 + 0.25 + g1 * 0.58, uz + 0.06, 0.9, 1.2, { shutterKey: st.shutter, flowerKeys: st.flowers });
  }
  // side walls: windows on both floors, timbered gable ends with a small round window
  for (const sx of [-1, 1]) {
    const fc = new Face(k, sx * Math.PI / 2, sx * (w / 2 + 0.01), jetty / 2), D = d + jetty;
    for (const t of [-0.25, 0.25]) windowAt(fc, t * D, plinth + g0 + 0.25 + g1 * 0.58, 0.04, 0.8, 1.1, { shutterKey: st.shutter, flowerKeys: st.flowers, flowers: t < 0 });
    windowAt(fc, 0, plinth + 1.8, 0.0, 0.8, 1.1, { shutters: false, flowers: false, stoneSill: true });
    if (st.upper !== 'wallstone') {
      fc.box(0.18, rise - 0.3, 0.12, 'wood', { y: ry0 + (rise - 0.3) / 2, z: 0.06 });
      for (const b of [-1, 1]) { const L = Math.hypot(D / 4, rise * 0.5); fc.box(0.14, L, 0.1, 'wood', { x: b * D / 8, y: ry0 + rise * 0.25, z: 0.06, rz: -b * Math.atan2(D / 4, rise * 0.5) }); }
      fc.box(D, 0.18, 0.14, 'wood', { y: ry0, z: 0.06 });
    }
    fc.add(new THREE.CircleGeometry(0.32, 16), 'window', { x: 0, y: ry0 + rise * 0.5, z: 0.08, uv: false });
    fc.add(new THREE.TorusGeometry(0.34, 0.06, 6, 16), 'wood', { y: ry0 + rise * 0.5, z: 0.09 });
    // stone quoins at the front corners of the ground floor
    for (let i = 0; i < 5; i++) fc.box(0.5 + (i % 2) * 0.3, 0.5, 0.12, 'basestone', { x: -sx * (d / 2 - jetty / 2 - 0.3 - (i % 2) * 0.15), y: plinth + 0.35 + i * 0.62, z: 0.04 });
  }
  // ground floor: door, shop window under an awning, sign
  doorAt(k, doorX, fz);
  const shopX = doorX > 0 ? doorX - w * 0.38 : doorX + w * 0.38, shopW = Math.min(3.2, w * 0.36);
  k.add(new THREE.PlaneGeometry(shopW, 1.6), 'window', { x: shopX, y: plinth + 1.75, z: fz + 0.02, uv: false });
  k.box(shopW + 0.3, 0.2, 0.25, 'wood', { x: shopX, y: plinth + 2.65, z: fz + 0.08 }); k.box(shopW + 0.4, 0.22, 0.45, 'wood', { x: shopX, y: plinth + 0.85, z: fz + 0.18 });
  for (const t of [-0.5, 0, 0.5]) k.box(0.12, 1.65, 0.14, 'wood', { x: shopX + t * shopW, y: plinth + 1.75, z: fz + 0.06 });
  awningAt(k, shopX, plinth + 3.05, fz, shopW + 0.8, st.awning, 1.5, 0.8);
  signAt(k, doorX + (doorX > shopX ? 1.15 : -1.15), plinth + 2.6, fz, st.icon, doorX > shopX ? 1 : -1);
  // lanterns either side of the door
  for (const sx of [-1, 1]) lanternWall(k, doorX + sx * 1.05, plinth + 2.55, fz + 0.18);
  // style extras
  if (st.tower) {
    const tx = w / 2 - 0.4, tz = fz - 0.6, tr = 1.75, th = top + 1.4;
    k.add(towerWall(tr, plinth + g0, 'basestone'), 'basestone', { x: tx, y: (plinth + g0) / 2, z: tz, uv: false });
    k.add(towerWall(tr, th - plinth - g0, st.upper), st.upper, { x: tx, y: plinth + g0 + (th - plinth - g0) / 2, z: tz, uv: false });
    k.add(new THREE.CylinderGeometry(tr + 0.15, tr + 0.15, 0.25, 28), 'wood', { x: tx, y: th, z: tz });
    k.add(coneRoof(tr + 0.55, 3.6), 'slate', { x: tx, y: th + 1.8, z: tz, uv: false });
    k.cyl(0.05, 0.14, 0.6, 'gold', { x: tx, y: th + 3.55, z: tz }, 8); k.sphere(0.1, 'gold', { x: tx, y: th + 4.25, z: tz }, 8);
    for (const a of [-0.35, 0.45]) windowAt(k, tx + Math.sin(a) * (tr + 0.02), plinth + g0 + 1.5, tz + Math.cos(a) * (tr + 0.02), 0.6, 1.0, { shutters: false, flowers: false });
  }
  decorFront(k, o.style, w, fz, doorX, shopX);
  const grp = k.build();
  return { grp, height: ry0 + rise + 2.5 };
}
function lanternWall(k, x, y, z) {
  k.box(0.06, 0.06, 0.35, 'iron', { x, y: y + 0.25, z: z });
  k.box(0.26, 0.36, 0.26, 'glow', { x, y, z: z + 0.15 });
  k.box(0.32, 0.06, 0.32, 'iron', { x, y: y + 0.21, z: z + 0.15 }); k.box(0.3, 0.05, 0.3, 'iron', { x, y: y - 0.2, z: z + 0.15 });
}
function barrel(k, x, z, s = 1, y = 0) {
  k.cyl(0.36 * s, 0.36 * s, 0.95 * s, 'planks', { x, y, z }, 14);
  for (const yy of [0.15, 0.8]) k.cyl(0.375 * s, 0.375 * s, 0.07, 'iron', { x, y: y + yy * s, z }, 14);
  k.add(new THREE.CircleGeometry(0.34 * s, 14), 'planks', { x, y: y + 0.955 * s, z, rx: -Math.PI / 2 });
}
function crate(k, x, z, s = 0.8, y = 0, r = 0) { k.block(s, s, s, 'planks', { x, y, z, ry: r }); k.box(s + 0.04, 0.08, s + 0.04, 'wood', { x, y: y + s - 0.04, z, ry: r }); }
function table(k, x, z, w, d, h = 0.85) {
  k.block(w, 0.1, d, 'planks', { x, y: h - 0.1, z });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.block(0.1, h - 0.1, 0.1, 'wood', { x: x + sx * (w / 2 - 0.1), z: z + sz * (d / 2 - 0.1) });
}
function decorFront(k, style, w, fz, doorX, shopX) {
  const z0 = fz + 0.9;
  if (style === 'bakery') {
    // wood-fired dome oven on the side, bread on a table, flour sacks
    const ox = -w / 2 - 1.5, oz = fz - 2.2;
    k.add(new THREE.SphereGeometry(1.45, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), 'basestone#e0a080', { x: ox, y: 0.5, z: oz });
    k.block(3.2, 0.5, 3.2, 'basestone', { x: ox, z: oz });
    k.add(new THREE.CircleGeometry(0.55, 16, 0, Math.PI), 'glow', { x: ox, y: 0.5, z: oz + 1.43, uv: false });
    k.block(0.5, 2.2, 0.5, 'basestone#e0a080', { x: ox, y: 1.7, z: oz - 0.5 });
    table(k, shopX, z0 + 0.5, 2.6, 0.9);
    for (let i = 0; i < 7; i++) k.sphere(0.2, i % 2 ? 'bread' : 'crust', { x: shopX - 1.0 + i * 0.33, y: 0.88, z: z0 + 0.5 + (i % 2) * 0.15, s: [1.4, 0.7, 0.9] }, 8);
    for (let i = 0; i < 3; i++) k.sphere(0.38, 'sack', { x: doorX + 1.3 + i * 0.25, y: 0.35, z: z0 - 0.1 + (i % 2) * 0.5, s: [1, 1.15, 1] }, 9);
    barrel(k, -w / 2 + 0.5, z0 - 0.1);
  } else if (style === 'general') {
    table(k, shopX, z0 + 0.4, 2.6, 0.9);
    const cols = ['green', 'purple', 'red', 'blue', 'orange'];
    for (let i = 0; i < 9; i++) { k.sphere(0.12, cols[i % 5], { x: shopX - 1.1 + i * 0.27, y: 0.95, z: z0 + 0.3 + (i % 2) * 0.22 }, 8); k.cyl(0.035, 0.035, 0.12, 'cream', { x: shopX - 1.1 + i * 0.27, y: 1.03, z: z0 + 0.3 + (i % 2) * 0.22 }, 6); }
    barrel(k, doorX + 1.4, z0 - 0.2); barrel(k, doorX + 2.1, z0 - 0.1, 0.85); crate(k, -w / 2 + 0.7, z0 - 0.3, 0.75); crate(k, -w / 2 + 0.75, z0 - 0.3, 0.55, 0.75, 0.4);
  } else if (style === 'dress') {
    for (const [i, mx] of [[0, shopX - 0.9], [1, shopX + 0.9]]) {
      k.block(0.5, 0.1, 0.5, 'wood', { x: mx, z: z0 });
      k.cyl(0.03, 0.03, 0.4, 'wood', { x: mx, y: 0.1, z: z0 }, 6);
      k.cyl(0.13, 0.36, 0.85, i ? 'purple' : 'pink', { x: mx, y: 0.4, z: z0 }, 14);
      k.cyl(0.11, 0.13, 0.3, i ? 'lavender' : 'white', { x: mx, y: 1.25, z: z0 }, 12);
      k.cyl(0.2, 0.2, 0.06, 'gold', { x: mx, y: 1.22, z: z0 }, 12);
      k.sphere(0.08, 'wood', { x: mx, y: 1.66, z: z0 }, 8);
    }
    table(k, doorX + 1.7, z0 - 0.2, 1.2, 0.7, 0.7);
    for (let i = 0; i < 4; i++) k.add(new THREE.CylinderGeometry(0.1, 0.1, 0.9, 12), ['fabric1', 'fabric2', 'fabric3', 'lavender'][i], { x: doorX + 1.7, y: 0.8 + (i > 1 ? 0.19 : 0), z: z0 - 0.4 + (i % 2) * 0.22, rz: Math.PI / 2, ry: 0.2 });
  } else if (style === 'arms') {
    // weapon rack with swords and spears, shields on stands, armour on a stand, banners on the facade
    const rx = shopX, rz = z0 + 0.3;
    k.box(2.6, 0.1, 0.12, 'wood', { x: rx, y: 1.3, z: rz }); k.box(2.6, 0.1, 0.12, 'wood', { x: rx, y: 0.3, z: rz });
    for (const sx of [-1, 1]) k.block(0.12, 1.5, 0.3, 'wood', { x: rx + sx * 1.3, z: rz });
    for (let i = 0; i < 6; i++) {
      const x = rx - 1.05 + i * 0.42;
      if (i % 3 === 2) { k.cyl(0.025, 0.025, 2.2, 'wood', { x, y: 0.2, z: rz + 0.12 }, 6); k.add(new THREE.ConeGeometry(0.06, 0.3, 6), 'steel', { x, y: 2.55, z: rz + 0.12 }); }
      else { k.box(0.07, 1.1, 0.02, 'steel', { x, y: 0.95, z: rz + 0.1 }); k.box(0.3, 0.05, 0.05, 'gold', { x, y: 1.52, z: rz + 0.1 }); k.box(0.05, 0.25, 0.05, 'wood', { x, y: 1.67, z: rz + 0.1 }); }
    }
    const shieldM = canvasMat('shield', 128, 128, (g, w, h) => { g.fillStyle = '#3a4a9a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#d8b04a'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10); g.translate(w / 2, h / 2); g.fillStyle = '#d8b04a'; g.beginPath(); g.moveTo(0, -40); g.lineTo(14, -6); g.lineTo(0, 40); g.lineTo(-14, -6); g.closePath(); g.fill(); g.fillRect(-30, -6, 60, 10); });
    for (const [x, zz] of [[doorX + 1.5, z0 - 0.1], [doorX + 2.3, z0 + 0.1]]) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 20), [M('iron'), shieldM, M('iron')]); s.rotation.x = Math.PI / 2 - 0.25; s.position.set(x, 0.62, zz); s.castShadow = true; k.mesh(s);
    }
    const ax = -w / 2 + 0.9; k.block(0.5, 0.1, 0.5, 'wood', { x: ax, z: z0 }); k.cyl(0.04, 0.04, 1.0, 'wood', { x: ax, y: 0.1, z: z0 }, 6);
    k.cyl(0.3, 0.24, 0.7, 'steel', { x: ax, y: 1.0, z: z0 }, 12); k.sphere(0.2, 'steel', { x: ax, y: 1.9, z: z0 }, 10); k.box(0.9, 0.12, 0.3, 'steel', { x: ax, y: 1.62, z: z0 });
    const bannerM = canvasMat('banner', 128, 384, drawBanner, { side: THREE.DoubleSide });
    for (const bx of [-w / 2 + 0.9, w / 2 - 0.9]) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 2.4), bannerM); b.position.set(bx, 4.9, fz + 0.12); k.mesh(b);
      k.box(1.1, 0.07, 0.07, 'gold', { x: bx, y: 6.12, z: fz + 0.14 });
    }
  }
}
function drawBanner(g, w, h) {
  g.fillStyle = '#34449a'; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w, h); g.lineTo(w / 2, h - 40); g.lineTo(0, h); g.closePath(); g.fill();
  g.strokeStyle = '#d8b04a'; g.lineWidth = 8; g.stroke();
  g.translate(w / 2, h * 0.42); g.fillStyle = '#d8b04a';
  g.beginPath(); g.ellipse(0, -30, 14, 34, 0, 0, Math.PI * 2); g.fill();
  for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * 26, -6, 12, 26, s * 0.7, 0, Math.PI * 2); g.fill(); }
  g.fillRect(-34, 10, 68, 10); g.fillRect(-6, 20, 12, 30);
}

// ---------------------------------------------------------------- ground ornaments (rosettes, leaf shadows)
const ROSETTES = [[11.5, -9.5, 1.6, 0.3], [-12, -7, 1.4, 0.8], [13, 6, 1.5, 0.1], [-4, -14, 1.3, 0.5], [11, -2.5, 1.2, 0.2], [-17, 3, 1.3, 0.9]];
const CANOPIES = [[9, -15, 4.5, 2.2], [24, -5, 4.5, 0.6], [-9, -18, 4, 1.3], [-24, 8, 5, 2.9], [10, 20, 4.5, 0.5], [16, -12, 5.5, 0.4], [21, 2, 5, 1.1], [14, 14, 5, 2.0], [-19, -10, 5.5, 0.8], [-15, 13, 5, 2.6], [5, -19, 4.5, 1.7], [-5, 21, 4.5, 0.2], [24, -14, 4, 0.9]];
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function canvasTex(key, n, draw, srgb = true) {
  const k = 'tex:' + key; if (canvasCache.has(k)) return canvasCache.get(k);
  const c = document.createElement('canvas'); c.width = c.height = n; draw(c.getContext('2d'), n);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = ANISO; canvasCache.set(k, t); return t;
}
function drawRosette(g, n) {
  const c = n / 2; g.translate(c, c);
  const ring = (r0, r1, col) => { g.fillStyle = col; g.beginPath(); g.arc(0, 0, r1, 0, Math.PI * 2); g.arc(0, 0, r0, 0, Math.PI * 2, true); g.fill(); };
  ring(c * 0.88, c * 0.97, 'rgba(120,104,88,0.85)'); ring(c * 0.8, c * 0.88, 'rgba(178,166,150,0.95)'); ring(c * 0.76, c * 0.8, 'rgba(120,104,88,0.8)');
  g.fillStyle = 'rgba(160,150,138,0.92)'; g.beginPath(); g.arc(0, 0, c * 0.76, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < 8; i++) {                                  // eight petals, alternating tones
    g.save(); g.rotate(i * Math.PI / 4); g.fillStyle = i % 2 ? 'rgba(132,122,112,0.95)' : 'rgba(198,188,172,0.97)';
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(c * 0.26, -c * 0.34, 0, -c * 0.7); g.quadraticCurveTo(-c * 0.26, -c * 0.34, 0, 0); g.fill();
    g.strokeStyle = 'rgba(96,84,72,0.7)'; g.lineWidth = 3; g.stroke(); g.restore();
  }
  ring(0, c * 0.13, 'rgba(110,98,86,0.95)'); ring(c * 0.13, c * 0.16, 'rgba(210,198,180,0.95)');
}
function drawLeaves(g, n) {
  const r = mulberry(11); g.fillStyle = '#fff';
  for (let i = 0; i < 420; i++) {
    const a = r() * Math.PI * 2, d = Math.pow(r(), 0.7) * n * 0.46, x = n / 2 + Math.cos(a) * d, y = n / 2 + Math.sin(a) * d;
    const s = 6 + r() * 16 * (1 - d / n);
    g.save(); g.translate(x, y); g.rotate(r() * Math.PI); g.beginPath(); g.ellipse(0, 0, s, s * 0.55, 0, 0, Math.PI * 2); g.fill(); g.restore();
  }
}

// ---------------------------------------------------------------- castle
function wallPiece(k, L, h, t, outward, crenel = true) {
  k.block(L, h, t, 'wallstone');
  k.block(L + 0.02, 0.5, t + 0.25, 'basestone', { y: 0 });
  k.block(L, 0.08, t - 0.2, 'pave', { y: h });
  if (!crenel) return;
  const n = Math.floor(L / 1.7);
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + (i + 0.5) * L / n;
    k.block(0.95, 0.95, 0.5, 'wallstone', { x, y: h, z: outward * (t / 2 - 0.25) });
    k.block(0.95, 0.55, 0.3, 'wallstone', { x, y: h, z: -outward * (t / 2 - 0.15) });
  }
  k.block(L, 0.18, 0.62, 'basestone', { y: h - 0.18, z: outward * (t / 2 - 0.2) });
}
function towerAt(k, x, z, r, h, o = {}) {
  k.add(towerWall(r, h, 'wallstone'), 'wallstone', { x, y: h / 2, z, uv: false });
  k.add(towerWall(r + 0.15, 0.6, 'basestone'), 'basestone', { x, y: 0.3, z, uv: false });
  k.add(new THREE.CircleGeometry(r, 24), 'pave', { x, y: h, z, rx: -Math.PI / 2 });
  k.add(towerWall(r + 0.2, 0.3, 'basestone'), 'basestone', { x, y: h - 0.1, z, uv: false });
  const n = Math.round(2 * Math.PI * r / 1.5);
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; k.block(0.85, 0.95, 0.5, 'wallstone', { x: x + Math.cos(a) * (r - 0.15), y: h, z: z + Math.sin(a) * (r - 0.15), ry: -a + Math.PI / 2 }); }
  if (o.roof !== false) {
    const rh = r * 1.5;
    k.add(towerWall(r - 0.3, 1.2, 'wallstone'), 'wallstone', { x, y: h + 0.6, z, uv: false });
    k.add(coneRoof(r + 0.3, rh), 'slate', { x, y: h + 1.2 + rh / 2, z, uv: false });
    k.cyl(0.07, 0.07, 1.4, 'iron', { x, y: h + 1.0 + rh, z }, 6); k.sphere(0.14, 'gold', { x, y: h + 1.2 + rh, z }, 8);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.8), canvasMat('flag', 128, 80, (g, w, hh) => { g.fillStyle = '#34449a'; g.fillRect(0, 0, w, hh); g.fillStyle = '#d8b04a'; g.fillRect(0, hh * 0.42, w, hh * 0.16); }, { side: THREE.DoubleSide }));
    f.position.set(x + 0.68, h + 1.95 + rh, z); f.userData.flag = true; k.mesh(f);
  }
  // arrow slits facing the courtyard
  for (const a of o.slits || []) for (const yy of [h * 0.35, h * 0.68]) k.box(0.18, 1.0, 0.1, 'dark', { x: x + Math.cos(a) * (r + 0.01), y: yy, z: z + Math.sin(a) * (r + 0.01), ry: -a + Math.PI / 2 });
}

// ---------------------------------------------------------------- ground
function soft(points, w, alphaEdge = 0.14) {
  // strip along a polyline with soft (vertex alpha) edges; returns BufferGeometry in three space (y up)
  const P = [], C = [], U = [], I = [];
  const cols = [[-w / 2, 0], [-w / 2 + alphaEdge, 1], [w / 2 - alphaEdge, 1], [w / 2, 0]];
  const pts = points.map(([x, z]) => new THREE.Vector2(x, -z));
  // extend the ends a little so strips overlap the ring / doors
  let base = 0;
  for (let s = 0; s < pts.length - 1; s++) {
    const a = pts[s], b = pts[s + 1], d = b.clone().sub(a).normalize(), n = new THREE.Vector2(-d.y, d.x);
    const a2 = a.clone().addScaledVector(d, -0.6), b2 = b.clone().addScaledVector(d, 0.6);
    for (const p of [a2, b2]) for (const [o, al] of cols) { const q = p.clone().addScaledVector(n, o); P.push(q.x, 0, q.y); C.push(1, 1, 1, al); U.push(q.x / TILE.cobble, q.y / TILE.cobble); }
    for (let i = 0; i < 3; i++) { const r0 = base + i, r1 = base + 4 + i; I.push(r0, r1, r0 + 1, r0 + 1, r1, r1 + 1); }
    base += 8;
  }
  return mkGeo(P, C, U, I);
}
function ringGeo(cx, cz, r0, r1, seg = 72, edge = 0.14) {
  const P = [], C = [], U = [], I = []; const radii = [[r0 - edge, 0], [r0, 1], [r1, 1], [r1 + edge, 0]];
  for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2; for (const [r, al] of radii) { const x = cx + Math.cos(a) * r, z = -cz + Math.sin(a) * r; P.push(x, 0, z); C.push(1, 1, 1, al); U.push(x / TILE.cobble, z / TILE.cobble); } }
  for (let i = 0; i < seg; i++) for (let j = 0; j < 3; j++) { const a = i * 4 + j, b = a + 4; I.push(a, a + 1, b, a + 1, b + 1, b); }
  return mkGeo(P, C, U, I);
}
/** stone kerbs: thin strips along polylines (game x/z), UV along the length; `cut(x, z)` true = no kerb there
 *  (inside a ring road / across a path mouth) so kerbs never run over another road surface */
function curbGeo(lines, wid = 0.26, cut = () => false) {
  const P = [], C = [], U = [], I = []; let base = 0;
  for (const line of lines) {
    let run = 0;
    for (let s = 0; s < line.length - 1; s++) {
      const [ax, az] = line[s], [bx, bz] = line[s + 1], L = Math.hypot(bx - ax, bz - az); if (L < 1e-3) continue;
      const n = Math.max(1, Math.ceil(L / 0.6)), dx = (bx - ax) / L, dz = (bz - az) / L, nx = -dz, nz = dx;
      for (let i = 0; i < n; i++) {
        const x0 = ax + dx * L * i / n, z0 = az + dz * L * i / n, x1 = ax + dx * L * (i + 1) / n, z1 = az + dz * L * (i + 1) / n;
        if (cut((x0 + x1) / 2, (z0 + z1) / 2)) { run += L / n; continue; }
        const v = [[x0 - nx * wid / 2, z0 - nz * wid / 2, 0, run], [x0 + nx * wid / 2, z0 + nz * wid / 2, 1, run], [x1 - nx * wid / 2, z1 - nz * wid / 2, 0, run + L / n], [x1 + nx * wid / 2, z1 + nz * wid / 2, 1, run + L / n]];
        for (const [x, z, u, r] of v) { P.push(x, 0, -z); C.push(0.78, 0.72, 0.64, 1); U.push(u * 0.2, r / 1.1); }
        I.push(base, base + 2, base + 1, base + 1, base + 2, base + 3); base += 4; run += L / n;
      }
    }
  }
  return mkGeo(P, C, U, I);
}
function patchGeo(poly, edge = 1.2, tile = TILE.grass) {
  const pts = poly.map(([x, z]) => new THREE.Vector2(x, -z)), n = pts.length, P = [], C = [], U = [], I = [];
  const c = pts.reduce((s, p) => s.add(p), new THREE.Vector2()).multiplyScalar(1 / n);
  P.push(c.x, 0, c.y); C.push(1, 1, 1, 1); U.push(c.x / tile, c.y / tile);
  for (const p of pts) { P.push(p.x, 0, p.y); C.push(1, 1, 1, 1); U.push(p.x / tile, p.y / tile); }
  for (const p of pts) { const q = p.clone().sub(c).normalize().multiplyScalar(edge).add(p); P.push(q.x, 0, q.y); C.push(1, 1, 1, 0); U.push(q.x / tile, q.y / tile); }
  for (let i = 0; i < n; i++) { const a = 1 + i, b = 1 + (i + 1) % n; I.push(0, b, a); I.push(a, b, a + n, b, b + n, a + n); }
  return mkGeo(P, C, U, I);
}
function mkGeo(P, C, U, I) {
  // make every triangle counter-clockwise seen from above (front face up), else lighting uses a flipped normal
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ny = (P[c + 2] - P[a + 2]) * (P[b] - P[a]) - (P[c] - P[a]) * (P[b + 2] - P[a + 2]);
    if (ny > 0) { const k = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = k; }   // ny here is -normal.y
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 4));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I); g.computeVertexNormals();
  // computed normals may point down for clockwise winding; force up
  const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}
function decalMat(name) {
  const m = new THREE.MeshStandardMaterial({ map: ttex(name), roughness: 0.95, transparent: true, vertexColors: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  return m;
}

// ---------------------------------------------------------------- GLB loading (Tripo models, optimised by tools in /town3d)
const glbCache = new Map();
function loadGLB(file) {
  if (glbCache.has(file)) return glbCache.get(file);
  const p = (async () => {
    // GLB stored as base64 JSON (the artifact host does not serve binary .glb)
    const j = await (await fetch(BASE + file + '.glb.json')).json();
    const raw = atob(j.b64), u8 = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
    const buf = u8.buffer;
    const gltf = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res, rej));
    gltf.scene.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      const m = o.material;
      for (const t of [m.map, m.normalMap, m.roughnessMap, m.metalnessMap]) if (t) { t.anisotropy = ANISO; t.needsUpdate = true; }
      m.envMapIntensity = 0;
      // 랜드마크(town_*)는 앞면이 남쪽(카메라 쪽)이라 해를 등져 늘 그늘 — 기본색을 조금 스스로 밝혀 그늘에서도 색이 읽히게 (전역 블룸·노출은 그대로)
      if (file.startsWith('town_') && m.map && !m.emissiveMap) { m.emissive = new THREE.Color(0xffffff); m.emissiveMap = m.map; m.emissiveIntensity = 0.2; }
    });
    return gltf.scene;
  })();
  glbCache.set(file, p); return p;
}

// large flagstone courtyard (2026-11-13): breaks the 4.2 m texture repeat with soft world-space colour patches (a few cool
// grey-violet stones, a few warmer ones, slightly worn / darker toward the walls of the patch) and pulls the plaza a touch
// down in value so the characters (outlined, saturated) stand out. Colour only - no extra texture, one material.
function groundVary(m) {
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vGW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec2 vGW;
float gvH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gvN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gvH(i), gvH(i + vec2(1, 0)), f.x), mix(gvH(i + vec2(0, 1)), gvH(i + vec2(1, 1)), f.x), f.y); }`).replace('#include <map_fragment>', `#include <map_fragment>
  { float a = gvN(vGW * 0.07), b = gvN(vGW * 0.23 + 7.3), c = gvN(vGW * 0.6 + 3.1);
    vec3 cool = vec3(0.88, 0.89, 0.97), warm = vec3(1.04, 1.0, 0.93);
    diffuseColor.rgb *= mix(cool, warm, smoothstep(0.25, 0.75, a * 0.65 + b * 0.35)) * (0.93 + 0.07 * c); }`);
  };
  m.customProgramCacheKey = () => 'groundVary'; return m;
}

// ---------------------------------------------------------------- build the whole town
/** returns { root, fadeGroups:[{name, occ, meshes}], smoke:[[x,y,z]], update(dt) } */
export async function buildTown3D(spec, renderer) {
  ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  PALETTE = spec.palette || {}; PAL_ID = Object.keys(PALETTE).length ? '|' + JSON.stringify(PALETTE) : '';
  const gates = spec.gates || [spec.gate];
  const root = new THREE.Group(); root.name = 'town3d';
  const fade = []; const smoke = []; const flags = [];
  const addFade = (name, obj, occ) => { const meshes = []; obj.traverse(o => { if (o.isMesh) meshes.push(o); }); fade.push({ name, occ, meshes, faded: false, clear: 0 }); };

  // ground: meadow outside, flagstone courtyard inside the walls, cobbled roads, grass verges
  const [x0, z0, x1, z1] = spec.ground.inner;
  const outer = spec.ground.outer || [-120, -120, 120, 120], MW = outer[2] - outer[0], MD = outer[3] - outer[1], MCX = (outer[0] + outer[2]) / 2, MCZ = (outer[1] + outer[3]) / 2;
  const meadow = new THREE.Mesh(puv(new THREE.PlaneGeometry(MW, MD).rotateX(-Math.PI / 2).translate(MCX, 0, -MCZ), TILE.grass), M('grass')); meadow.position.y = -0.04; meadow.receiveShadow = true; root.add(meadow);
  const court = new THREE.Mesh(puv(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, 0, -(z0 + z1) / 2), TILE.pave), groundVary(M('pave').clone()));
  court.receiveShadow = true; root.add(court);
  const roadM = decalMat('cobble'), grassM = decalMat('grass');
  if (!spec.gates) { const gateRoad = new THREE.Mesh(soft([[spec.gate.pos[0], spec.gate.pos[1] - 12], [spec.gate.pos[0], spec.gate.pos[1] - 1]], 5.2, 1.2), roadM); gateRoad.position.y = -0.02; root.add(gateRoad); }
  // cobble paths that run entirely over the flagstone courtyard are skipped: two stone patterns blended on top of each
  // other read as tiles overlapping by mistake. Paths outside the courtyard (over grass) and the fountain ring stay.
  const inCourt = (q) => q[0] > x0 + 0.5 && q[0] < x1 - 0.5 && q[1] > z0 + 0.5 && q[1] < z1 - 0.5;
  spec = { ...spec, ground: { ...spec.ground, roads: spec.ground.roads.filter(r => r.kind === 'ring' || r.kind === 'street' || !r.pts.every(inCourt)) } };   // 'street' = 큰길(2026-11-12): 마당 위에도 그림(턱돌로 경계)
  for (const r of spec.ground.roads) {
    const g = r.kind === 'ring' ? ringGeo(r.pos[0], r.pos[1], r.r0, r.r1) : soft(r.pts, r.w, r.kind === 'street' ? 0.14 : 0.5);   // remaining paths run over grass: softer edge
    const m = new THREE.Mesh(g, roadM); m.position.y = 0.012; m.receiveShadow = true; m.renderOrder = -1; root.add(m);
  }
  // kerbs: crisp stone borders where cobbles meet the flagstones (instead of a wide soft blend of two tile patterns)
  {
    const rings = spec.ground.roads.filter(r => r.kind === 'ring'), paths = spec.ground.roads.filter(r => r.kind !== 'ring'), lines = [];
    const inRing = (x, z, pad = 0.05) => rings.some(r => { const d = Math.hypot(x - r.pos[0], z - r.pos[1]); return d > r.r0 - pad && d < r.r1 + pad; });
    const onPath = (x, z, skip) => paths.some(p => p !== skip && p.pts.some((a, i) => { const b = p.pts[i + 1]; if (!b) return false;
      const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1, t = Math.max(-0.15, Math.min(1.15, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
      return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) < p.w / 2 + 0.05; }));
    const cuts = [];
    for (const p of paths) {
      const L = [], R = [];
      for (let i = 0; i < p.pts.length; i++) {
        const a = p.pts[Math.max(0, i - 1)], b = p.pts[Math.min(p.pts.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], m = Math.hypot(dx, dz) || 1;
        const nx = -dz / m, nz = dx / m, h = p.w / 2 + 0.13; L.push([p.pts[i][0] + nx * h, p.pts[i][1] + nz * h]); R.push([p.pts[i][0] - nx * h, p.pts[i][1] - nz * h]);
      }
      cuts.push({ lines: [L, R], p });
    }
    for (const c of cuts) for (const l of c.lines) lines.push({ l, cut: (x, z) => inRing(x, z) || onPath(x, z, c.p) });
    for (const r of rings) for (const rad of [r.r0 - 0.13, r.r1 + 0.13]) {
      const l = []; for (let i = 0; i <= 96; i++) { const a = i / 96 * Math.PI * 2; l.push([r.pos[0] + Math.cos(a) * rad, r.pos[1] + Math.sin(a) * rad]); }
      lines.push({ l, cut: (x, z) => onPath(x, z) });
    }
    const kerbM = decalMat('basestone');
    for (const { l, cut } of lines) { const m = new THREE.Mesh(curbGeo([l], 0.26, cut), kerbM); m.position.y = 0.016; m.receiveShadow = true; m.renderOrder = -1; root.add(m); }
  }
  for (const p of spec.ground.grass) { const m = new THREE.Mesh(patchGeo(p.pts), grassM); m.position.y = 0.02; m.receiveShadow = true; m.renderOrder = -1; root.add(m); }

  // castle walls / towers / gate / keep (one merged object per piece so each can fade on its own)
  const centre = { x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
  for (const w of spec.walls) {
    const k = new Kit(), dx = w.b[0] - w.a[0], dz = w.b[1] - w.a[1], L = Math.hypot(dx, dz);
    const mx = (w.a[0] + w.b[0]) / 2, mz = (w.a[1] + w.b[1]) / 2;
    // local +z must point out of the courtyard
    const yaw = Math.atan2(dx, dz) * 180 / Math.PI;   // direction a->b as a heading
    let h = yaw - 90; const f = [Math.sin(h * DEG), Math.cos(h * DEG)];
    if ((mx - centre.x) * f[0] + (mz - centre.z) * f[1] < 0) h += 180;
    wallPiece(k, L, w.h, w.t, 1);
    const obj = place(k.build(), [mx, mz], h); root.add(obj);
    addFade(w.id, obj, [mx, 0, mz, L / 2, w.t / 2 + 0.6, h, w.h + 1]);
  }
  for (const t of spec.towers) {
    const k = new Kit(); const toC = Math.atan2(-(centre.z - t.pos[1]), centre.x - t.pos[0]);
    towerAt(k, 0, 0, t.r, t.h, { slits: [toC - 0.4, toC + 0.4] });
    const obj = k.build(); obj.position.copy(T({ x: t.pos[0], y: 0, z: t.pos[1] })); root.add(obj);
    obj.traverse(o => { if (o.userData.flag) flags.push(o); });
    addFade(t.id, obj, [t.pos[0], 0, t.pos[1], t.r, t.r, 0, t.h + t.r * 1.5 + 1.2]);
  }
  for (const gt of gates) {
    const k = new Kit();
    const span = Math.hypot(gt.towers[1][0] - gt.towers[0][0], gt.towers[1][1] - gt.towers[0][1]);
    for (const sx of [-1, 1]) towerAt(k, sx * span / 2, 0, gt.tr, gt.th, { slits: [Math.PI / 2] });
    k.block(span, gt.th - 1.2 - gt.h, gt.t + 0.6, 'wallstone', { y: gt.h });
    k.block(span, 0.4, gt.t + 0.9, 'basestone', { y: gt.h - 0.4 });
    // arch ring + raised portcullis + open doors
    const arch = new THREE.TorusGeometry(gt.w / 2, 0.35, 8, 20, Math.PI);
    k.add(arch, 'basestone', { y: gt.h - 1.6, z: gt.t / 2 + 0.3 }); k.add(arch.clone(), 'basestone', { y: gt.h - 1.6, z: -gt.t / 2 - 0.3 });
    for (let i = 0; i <= 8; i++) k.box(0.08, 1.4, 0.08, 'iron', { x: -gt.w / 2 + 0.3 + i * (gt.w - 0.6) / 8, y: gt.h - 0.5, z: 0.4 });
    for (const yy of [-0.9, -0.3]) k.box(gt.w - 0.4, 0.08, 0.08, 'iron', { x: 0, y: gt.h + yy, z: 0.4 });
    for (const sx of [-1, 1]) k.box(0.18, gt.h - 0.4, gt.w / 2, 'planks', { x: sx * (gt.w / 2 - 0.15), y: (gt.h - 0.4) / 2, z: -gt.t / 2 - gt.w / 4 });
    const n = Math.floor(span / 1.7); for (let i = 0; i < n; i++) k.block(0.95, 0.95, 0.5, 'wallstone', { x: -span / 2 + (i + 0.5) * span / n, y: gt.th - 1.2, z: gt.t / 2 + 0.05 });
    const shield = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.6), canvasMat('banner', 128, 384, drawBanner, { side: THREE.DoubleSide }));
    shield.position.set(0, gt.h + 1.9, gt.t / 2 + 0.36); k.mesh(shield);
    const shield2 = shield.clone(); shield2.position.z = -gt.t / 2 - 0.36; shield2.rotation.y = Math.PI; k.mesh(shield2);
    const hd = gt.heading ?? 180, obj = place(k.build(), gt.pos, hd); root.add(obj);
    obj.traverse(o => { if (o.userData.flag) flags.push(o); });
    addFade(gt.id || 'gate', obj, [gt.pos[0], 0, gt.pos[1], span / 2 + gt.tr, gt.tr, hd, gt.th + gt.tr * 1.5]);
  }
  if (spec.keep) {
    const kp = spec.keep, k = new Kit();
    k.block(kp.w, kp.h, kp.d, 'wallstone'); k.block(kp.w + 0.3, 0.8, kp.d + 0.3, 'basestone');
    const n = Math.floor(kp.w / 1.6); for (let i = 0; i < n; i++) for (const s of [-1, 1]) k.block(0.95, 1.0, 0.5, 'wallstone', { x: -kp.w / 2 + (i + 0.5) * kp.w / n, y: kp.h, z: s * (kp.d / 2 - 0.25) });
    const m = Math.floor(kp.d / 1.6); for (let i = 0; i < m; i++) for (const s of [-1, 1]) k.block(0.5, 1.0, 0.95, 'wallstone', { x: s * (kp.w / 2 - 0.25), y: kp.h, z: -kp.d / 2 + (i + 0.5) * kp.d / m });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) towerAt(k, sx * kp.w / 2, sz * kp.d / 2, 2.6, kp.h + 4);
    // central hall roof
    const roof = new THREE.ConeGeometry(Math.hypot(kp.w * 0.32, kp.d * 0.32), 7, 4, 1, true); roof.rotateY(Math.PI / 4);
    k.add(roof, 'slate', { y: kp.h + 3.5 }); k.block(kp.w * 0.45, 0.4, kp.d * 0.45, 'basestone', { y: kp.h });
    for (let i = 0; i < 5; i++) for (const yy of [kp.h * 0.45, kp.h * 0.75]) windowAt(k, -kp.w / 2 + 2.5 + i * (kp.w - 5) / 4, yy, kp.d / 2, 0.9, 1.6, { shutters: false, flowers: false, stoneSill: true });
    const bm = canvasMat('banner', 128, 384, drawBanner, { side: THREE.DoubleSide });
    for (const bx of [-3.2, 3.2]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 5.6), bm); b.position.set(bx, kp.h - 3.4, kp.d / 2 + 0.05); k.mesh(b); }
    const obj = place(k.build(), kp.pos, 180); root.add(obj);
    obj.traverse(o => { if (o.userData.flag) flags.push(o); });
  }

  // shops modelled here
  for (const hs of spec.houses) {
    const { grp, height } = house(hs); place(grp, hs.pos, hs.h); root.add(grp);
    addFade(hs.id, grp, [hs.pos[0], 0, hs.pos[1], hs.w / 2 + 0.6, hs.d / 2 + 0.6, hs.h, height]);
    if (hs.style === 'bakery') {
      const f = [Math.sin(hs.h * DEG), Math.cos(hs.h * DEG)], r = [f[1], -f[0]];
      smoke.push([hs.pos[0] - r[0] * (-hs.w / 2 + 1.0) - f[0] * hs.d / 4, 11.5, hs.pos[1] - r[1] * (-hs.w / 2 + 1.0) - f[1] * hs.d / 4]);
    }
  }
  // user's 3D models
  await Promise.all(spec.models.map(async md => {
    const src = await loadGLB(md.file); const obj = src.clone(true);
    obj.scale.setScalar(md.scale); place(obj, md.pos, md.h); root.add(obj);
    if (md.id !== 'fountain') addFade(md.id, obj, [md.pos[0], 0, md.pos[1], md.size[0] / 2, md.size[1] / 2, md.h, md.size[2]]);
    else addFade(md.id, obj, [md.pos[0], 0, md.pos[1], 3.0, 3.0, 0, 6.5]);       // only the statue column hides things
  }));
  const smithy = spec.models.find(m => m.id === 'smithy');
  if (smithy) smoke.push([smithy.pos[0] - smithy.size[0] * 0.4, smithy.size[2] + 0.3, smithy.pos[1] + smithy.size[1] * 0.3]);

  // decor
  const dk = new Kit();
  for (const d of spec.decor) {
    const k = new Kit(); const at = d.pos;
    if (d.type === 'well') {
      k.add(towerWall(1.3, 0.95, 'basestone'), 'basestone', { y: 0.475, uv: false }); k.add(towerWall(1.0, 0.95, 'basestone'), 'basestone', { y: 0.475, uv: false });
      k.add(new THREE.RingGeometry(1.0, 1.3, 20), 'basestone', { y: 0.95, rx: -Math.PI / 2 }); k.add(new THREE.CircleGeometry(1.0, 20), 'water', { y: 0.55, rx: -Math.PI / 2 });
      for (const sx of [-1, 1]) k.block(0.16, 2.4, 0.16, 'wood', { x: sx * 1.05 });
      k.box(2.4, 0.12, 0.12, 'wood', { y: 2.2 });
      for (const s of [-1, 1]) k.box(2.8, 0.12, 1.2, 'slate', { y: 2.7, z: s * 0.5, rx: s * 0.6 });
      k.cyl(0.18, 0.15, 0.3, 'planks', { y: 1.4 }, 10); k.box(0.02, 0.8, 0.02, 'iron', { y: 1.85 });
    } else if (d.type === 'stall') {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.block(0.12, sz > 0 ? 2.2 : 2.6, 0.12, 'wood', { x: sx * (d.w / 2 - 0.1), z: sz * (d.d / 2 - 0.1) });
      k.block(d.w, 0.9, d.d * 0.6, 'planks', { z: d.d * 0.15 });
      awningAt(k, 0, 2.65, -d.d / 2, d.w + 0.4, d.awning, d.d + 0.4, 0.5);
      const goods = d.goods === 'veg' ? ['green', 'orange', 'red', 'yellow'] : ['fabric1', 'fabric2', 'fabric3', 'lavender'];
      for (let i = 0; i < 8; i++) k.sphere(d.goods === 'veg' ? 0.14 : 0.18, goods[i % 4], { x: -d.w / 2 + 0.35 + i * (d.w - 0.7) / 7, y: 0.98, z: d.d * 0.15 + (i % 2 ? 0.15 : -0.15), s: d.goods === 'veg' ? null : [1.6, 0.6, 1] }, 8);
      crate(k, d.w / 2 + 0.5, -0.2, 0.6);
    } else if (d.type === 'dummy') {
      k.block(0.14, 1.9, 0.14, 'wood'); k.box(1.2, 0.1, 0.1, 'wood', { y: 1.45 });
      k.cyl(0.26, 0.3, 0.8, 'straw', { y: 0.85 }, 10); k.sphere(0.2, 'sack', { y: 1.95 }, 8); k.block(0.7, 0.12, 0.7, 'wood');
    } else if (d.type === 'hay') {
      k.add(new THREE.CylinderGeometry(d.r * 0.8, d.r * 0.8, d.r * 1.4, 14), 'straw', { y: d.r * 0.8, rz: Math.PI / 2 });
    } else if (d.type === 'cart') {
      k.block(d.w, 0.5, d.d, 'planks', { y: 0.6 }); for (const s of [-1, 1]) k.block(d.w, 0.4, 0.08, 'planks', { y: 1.1, z: s * d.d / 2 });
      for (const s of [-1, 1]) k.add(new THREE.CylinderGeometry(0.6, 0.6, 0.12, 14), 'wood', { y: 0.6, z: s * (d.d / 2 + 0.1), rx: Math.PI / 2 });
      k.box(1.6, 0.08, 0.08, 'wood', { x: d.w / 2 + 0.8, y: 0.7, z: 0.5 }); k.box(1.6, 0.08, 0.08, 'wood', { x: d.w / 2 + 0.8, y: 0.7, z: -0.5 });
      k.add(new THREE.CylinderGeometry(0.45, 0.45, 0.9, 12), 'straw', { y: 1.35, rz: Math.PI / 2 });
    } else if (d.type === 'barrels') { barrel(k, -0.4, 0); barrel(k, 0.45, 0.2, 0.9); barrel(k, 0.0, -0.6, 0.85); }
    else if (d.type === 'crates') { crate(k, 0, 0, 0.8); crate(k, 0.85, 0.1, 0.7, 0, 0.3); crate(k, 0.2, 0.05, 0.6, 0.8, 0.6); }
    else if (d.type === 'banner') {
      k.cyl(0.07, 0.08, 4.4, 'wood', {}, 8); k.sphere(0.13, 'gold', { y: 4.5 }, 8); k.box(1.2, 0.07, 0.07, 'wood', { y: 4.1, z: 0.0 });
      const b = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.6), canvasMat('banner', 128, 384, drawBanner, { side: THREE.DoubleSide })); b.position.set(0, 2.75, 0.06); b.rotation.y = 0; k.mesh(b);
    } else if (d.type === 'planter' && spec.blprops) { continue;          // drawn as a Blender planter (blprops)
    } else if (d.type === 'planter') {
      k.add(towerWall(d.r, 0.6, 'basestone'), 'basestone', { y: 0.3, uv: false }); k.add(new THREE.CircleGeometry(d.r, 18), 'earth', { y: 0.55, rx: -Math.PI / 2 });
      k.add(new THREE.RingGeometry(d.r - 0.1, d.r + 0.1, 18), 'basestone', { y: 0.6, rx: -Math.PI / 2 });
      // clipped shrub with blossoms (matches the fountain's flower beds)
      for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2, rr = i ? d.r * 0.55 : 0; k.sphere(d.r * (i ? 0.42 : 0.6), 'green', { x: Math.cos(a) * rr, y: 0.75 + (i ? 0.15 : 0.55), z: Math.sin(a) * rr, s: [1, 0.8, 1] }, 9); }
      for (let i = 0; i < 16; i++) { const a = i * 2.4, rr = d.r * (0.25 + (i % 4) * 0.17); k.sphere(0.09, ['pink', 'white', 'purple', 'yellow'][i % 4], { x: Math.cos(a) * rr, y: 1.0 + (i % 3) * 0.18, z: Math.sin(a) * rr }, 6); }
    }
    const obj = k.build(); place(obj, at, d.h ?? 180); root.add(obj);
  }
  // Blender-made decoration (planters, flower boxes, barrels, crates, benches, banners, signs, trees, shrubs, flowers):
  // layout from tools/town/props_layout.py, models from tools/blender/assets.py
  if (spec.blprops) { const { placeBlProps } = await import('./nature.js'); root.add(await placeBlProps(spec.blprops, ANISO)); }
  // ornate lamp posts: flower planter base, black iron pole with gold rings, glowing lantern, hanging blue banner
  const bannerM = canvasMat('banner', 128, 384, drawBanner, { side: THREE.DoubleSide });
  for (const p of spec.lanterns) {
    const k = new Kit();
    k.block(0.9, 0.5, 0.9, 'basestone'); k.block(1.0, 0.1, 1.0, 'basestone', { y: 0.5 });
    k.add(new THREE.PlaneGeometry(0.86, 0.86), 'earth', { y: 0.61, rx: -Math.PI / 2, uv: false });
    for (let i = 0; i < 22; i++) {                                  // flowers spilling over the planter
      const a = i * 2.39996, rr = 0.18 + (i % 5) * 0.07, x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      if (i % 3 === 0) k.sphere(0.16, 'green', { x, y: 0.72, z, s: [1, 0.7, 1] }, 7);
      else k.sphere(0.075 + (i % 2) * 0.02, ['pink', 'white', 'pink', 'yellow', 'lavender'][i % 5], { x: x * 1.15, y: 0.78 + (i % 4) * 0.05, z: z * 1.15 }, 6);
    }
    for (const [sx, sz] of [[0.42, 0.1], [-0.1, 0.42], [-0.42, -0.2], [0.2, -0.42]]) k.sphere(0.13, 'green', { x: sx, y: 0.52, z: sz, s: [1, 1.3, 1] }, 6);   // trailing ivy
    k.cyl(0.07, 0.085, 3.6, 'dark', { y: 0.6 }, 10);
    for (const yy of [0.62, 1.5, 3.1]) k.cyl(0.11, 0.11, 0.08, 'gold', { y: yy }, 10);
    k.sphere(0.1, 'gold', { y: 2.3 }, 8);
    // lantern: dark frame, glowing panes, gold cap and finial
    const ly = 4.25;
    k.cyl(0.16, 0.12, 0.12, 'dark', { y: ly - 0.42 }, 8);
    k.add(new THREE.CylinderGeometry(0.2, 0.15, 0.5, 6), 'glow', { y: ly - 0.05 });
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; k.box(0.03, 0.54, 0.03, 'dark', { x: Math.cos(a) * 0.19, y: ly - 0.05, z: Math.sin(a) * 0.19 }); }
    k.add(new THREE.ConeGeometry(0.3, 0.28, 6), 'dark', { y: ly + 0.33 }); k.cyl(0.25, 0.25, 0.05, 'gold', { y: ly + 0.17 }, 12);
    k.sphere(0.07, 'gold', { y: ly + 0.53 }, 8);
    // banner bracket + banner
    k.box(0.75, 0.05, 0.05, 'dark', { x: 0.38, y: 3.35 }); k.box(0.05, 0.05, 0.05, 'gold', { x: 0.76, y: 3.35 });
    k.add(new THREE.TorusGeometry(0.16, 0.025, 6, 12, Math.PI), 'dark', { x: 0.24, y: 3.18, rz: Math.PI });
    const b = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 1.55), bannerM); b.position.set(0.42, 2.55, 0); b.rotation.y = Math.PI / 2; b.castShadow = true; b.userData.flag = true; k.mesh(b);
    const obj = k.build(); obj.position.copy(T({ x: p[0], y: 0, z: p[1] })); obj.rotation.y = Math.atan2(p[0], p[1]) + Math.PI / 4; root.add(obj);
    obj.traverse(o => { if (o.userData.flag) flags.push(o); });
  }
  // decorative stone rosettes set into the paving (open spots of the courtyard)
  {
    const rm = new THREE.MeshStandardMaterial({ map: canvasTex('rosette', 512, drawRosette), transparent: true, depthWrite: false, roughness: 0.9,
      polygonOffset: true, polygonOffsetFactor: -2 });
    for (const [x, z, r, a] of spec.rosettes || ROSETTES) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2).rotateX(-Math.PI / 2).rotateY(a || 0), rm);
      m.position.copy(T({ x, y: 0.03, z })); m.receiveShadow = true; m.renderOrder = -1; root.add(m);
    }
  }
  // fallen petals around flower beds and lamp planters (one instanced draw)
  {
    const pts = [];
    const rnd = mulberry(5);
    const scatter = (cx, cz, r0, r1, n) => { for (let i = 0; i < n; i++) { const a = rnd() * Math.PI * 2, rr = r0 + Math.pow(rnd(), 1.6) * (r1 - r0); pts.push([cx + Math.cos(a) * rr, cz + Math.sin(a) * rr, rnd() * Math.PI, 0.7 + rnd() * 0.6, rnd()]); } };
    scatter(0, 0, 9.5, 14, 260);
    for (const p of spec.lanterns) scatter(p[0], p[1], 0.55, 2.4, 40);
    for (const d of spec.decor) if (d.type === 'planter') scatter(d.pos[0], d.pos[1], d.r + 0.1, d.r + 2.2, 40);
    const geo = new THREE.PlaneGeometry(0.085, 0.055).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide });
    const im = new THREE.InstancedMesh(geo, mat, pts.length); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    pts.forEach(([x, z, a, s, k], i) => {
      q.setFromEuler(new THREE.Euler(0, a, 0)); m4.compose(T({ x, y: 0.035, z }), q, new THREE.Vector3(s, 1, s)); im.setMatrixAt(i, m4);
      im.setColorAt(i, c.set(k < 0.7 ? 0xf28fb8 : k < 0.88 ? 0xfac0d6 : 0xffffff));
    });
    im.receiveShadow = true; root.add(im);
  }
  // dappled light: unseen tree canopies above the courtyard edges that only cast leaf-shaped shadows
  {
    const leafTex = canvasTex('leaves', 512, drawLeaves, false);
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leafTex, alphaTest: 0.5 });
    // three copies map/alphaTest from the object's own material into the shadow depth material, so the leaf mask lives here
    const hide = new THREE.MeshBasicMaterial({ map: leafTex, alphaTest: 0.5, colorWrite: false, depthWrite: false, side: THREE.DoubleSide });
    for (const [x, z, r, a] of spec.canopies || CANOPIES) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2).rotateX(-Math.PI / 2).rotateY(a), hide);
      m.position.copy(T({ x, y: 9, z })); m.castShadow = true; m.customDepthMaterial = depth; m.renderOrder = -5; root.add(m);
    }
  }
  let t = 0;
  return {
    root, fade, smoke, spray: spec.models.some(m => m.id === 'fountain') ? [[0, 3.2, 0]] : [],
    update(dt) { t += dt; for (const f of flags) f.rotation.y = Math.sin(t * 1.7 + f.position.x) * 0.25; },
  };
}
