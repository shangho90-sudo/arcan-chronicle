// 3D item models (weapons, armour, accessories, potions, materials), stylized to match the town / characters.
// Used three ways: held weapon on the player (grip at the origin, item axis +z), loot dropped in the world
// (slowly spinning, bobbing) and UI icons (each model rendered once at start-up into a 128 px image).
import { THREE } from './render.js';

const matCache = new Map();
function M(hex, o = {}) {
  const k = hex + JSON.stringify(o);
  if (!matCache.has(k)) {
    const m = new THREE.MeshStandardMaterial({ color: hex, roughness: o.r ?? 0.6, metalness: o.m ?? 0, emissive: o.e ?? 0x000000, emissiveIntensity: o.ei ?? 1,
      transparent: !!o.t, opacity: o.t ?? 1, depthWrite: !o.t });
    matCache.set(k, m);
  }
  return matCache.get(k);
}
const METAL = { iron: [0x8a8f9a, 0.45, 0.7], steel: [0xd2d8e2, 0.28, 0.85], gold: [0xe4bb4e, 0.3, 0.9], bronze: [0xb87a40, 0.4, 0.8], silver: [0xe8ecf4, 0.22, 0.9] };
const metal = n => M(METAL[n][0], { r: METAL[n][1], m: METAL[n][2] });
const WOOD = M(0x7a4e2c, { r: 0.8 }), DWOOD = M(0x4e3020, { r: 0.8 }), LEATHER = M(0x6a3e22, { r: 0.85 });
const GEM = c => M(c, { r: 0.15, m: 0.1, e: c, ei: 0.35 });

function G() { return new THREE.Group(); }
function add(g, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); if (s) m.scale.set(...s); m.castShadow = true; g.add(m); return m;
}
const R = Math.PI / 2;
const cyl = (r0, r1, h, seg = 14) => new THREE.CylinderGeometry(r0, r1, h, seg);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const sph = (r, s = 16) => new THREE.SphereGeometry(r, s, Math.max(8, s * 0.7 | 0));
const cone = (r, h, s = 12) => new THREE.ConeGeometry(r, h, s);
/** extruded 2D outline (x across, y along the item), bevelled */
function shape(pts, depth, bevel = 0.006) {
  const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) s.lineTo(p[0], p[1]); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2 }); g.translate(0, 0, -depth / 2); return g;
}
/** item axis is +z: build along +y then tip forward */
function alongZ(g) { const w = G(); g.rotation.x = R; w.add(g); return w; }

const TIER = [null, { blade: 'iron', trim: 'bronze', gem: null }, { blade: 'steel', trim: 'silver', gem: 0x5ab4ff }, { blade: 'silver', trim: 'gold', gem: 0xff5a8c }];

const BUILD = {
  stick(t) {               // practice dagger
    const g = G(); add(g, cyl(0.017, 0.019, 0.1), LEATHER, 0, 0.0);
    add(g, box(0.12, 0.022, 0.03), metal('bronze'), 0, 0.06); add(g, sph(0.02), metal('bronze'), 0, -0.055);
    add(g, shape([[-0.022, 0], [0.022, 0], [0.018, 0.2], [0, 0.25], [-0.018, 0.2]], 0.008), metal('iron'), 0, 0.07);
    return alongZ(g);
  },
  pestle(t) {
    const T = TIER[t], g = G(), body = t === 3 ? M(0xf4efe4, { r: 0.3 }) : t === 2 ? metal('silver') : M(0xd8c8a8, { r: 0.7 });
    add(g, cyl(0.018, 0.022, 0.22), t === 1 ? WOOD : body, 0, 0.1);
    add(g, sph(0.055), body, 0, 0.24, 0, 0, 0, 0, [1, 1.25, 1]);
    add(g, new THREE.TorusGeometry(0.024, 0.007, 8, 16), metal(T.trim), 0, 0.17, 0, R);
    if (T.gem) add(g, sph(0.02, 10), GEM(T.gem), 0, -0.015);
    return alongZ(g);
  },
  knife(t) {
    const T = TIER[t], g = G(); add(g, box(0.03, 0.11, 0.026), t === 3 ? DWOOD : WOOD, 0, 0.0);
    for (const y of [-0.03, 0.03]) add(g, cyl(0.006, 0.006, 0.03, 8), metal(T.trim), 0, y, 0, 0, 0, R);
    add(g, box(0.036, 0.016, 0.03), metal(T.trim), 0, 0.062);
    add(g, shape([[-0.002, 0], [0.075, 0], [0.075, 0.17], [0.04, 0.2], [-0.002, 0.2]], 0.006, 0.003), metal(T.blade), -0.015, 0.07);
    if (T.gem) add(g, sph(0.012, 8), GEM(T.gem), 0.042, 0.1, 0.007);
    return alongZ(g);
  },
  hammer(t) {
    const T = TIER[t], g = G(); add(g, cyl(0.018, 0.022, 0.38), t === 1 ? WOOD : DWOOD, 0, 0.13);
    add(g, cyl(0.024, 0.024, 0.07), LEATHER, 0, -0.02);
    const head = add(g, box(0.19, 0.09, 0.09), metal(T.blade), 0, 0.33);
    add(g, box(0.05, 0.1, 0.1), metal(T.trim), 0, 0.33);
    add(g, cyl(0.05, 0.05, 0.03, 12), metal(T.blade), 0.105, 0.33, 0, 0, 0, R); add(g, cyl(0.05, 0.05, 0.03, 12), metal(T.blade), -0.105, 0.33, 0, 0, 0, R);
    if (T.gem) add(g, sph(0.02, 10), GEM(T.gem), 0, 0.33, 0.05);
    return alongZ(g);
  },
  scissors(t) {
    const T = TIER[t], g = G(), rm = t === 1 ? M(0xe65a8c, { r: 0.4 }) : metal(T.trim);
    for (const s of [-1, 1]) {
      add(g, shape([[-0.006, 0], [0.006, 0], [0.004, 0.17], [0, 0.19], [-0.004, 0.17]], 0.006, 0.002), metal(T.blade), s * 0.01, 0.03, s * 0.004, 0, 0, -s * 0.12);
      add(g, new THREE.TorusGeometry(0.026, 0.008, 8, 16), rm, s * 0.03, -0.02, 0);
    }
    add(g, cyl(0.009, 0.009, 0.02, 8), metal('gold'), 0, 0.03, 0, R);
    return alongZ(g);
  },
  brush(t) {
    const T = TIER[t], g = G(), tip = [0x3cc8c8, 0xe0505a, 0xa060e0][t - 1];
    add(g, cyl(0.012, 0.016, 0.28), t === 3 ? M(0x2a2a40, { r: 0.4 }) : WOOD, 0, 0.1);
    add(g, cyl(0.017, 0.014, 0.05), metal(T.trim), 0, 0.26);
    add(g, cone(0.02, 0.08, 12), M(tip, { r: 0.6 }), 0, 0.32, 0, Math.PI);
    add(g, sph(0.021, 12), M(tip, { r: 0.6 }), 0, 0.29, 0, 0, 0, 0, [1, 1.2, 1]);
    if (T.gem) add(g, sph(0.014, 8), GEM(T.gem), 0, -0.045);
    return alongZ(g);
  },
  armor(t) {               // tunic / leather vest / mushroom cape on a small stand
    const g = G(), col = [0xe8dcc0, 0x8a5a32, 0x7a3a8a][t - 1];
    const body = add(g, cyl(0.12, 0.15, 0.3, 16), M(col, { r: 0.85 }), 0, 0.15);
    for (const s of [-1, 1]) add(g, cyl(0.045, 0.05, 0.14, 10), M(col, { r: 0.85 }), s * 0.14, 0.24, 0, 0, 0, s * 0.9);
    add(g, box(0.25, 0.035, 0.27), LEATHER, 0, 0.05);
    add(g, box(0.04, 0.035, 0.05), metal('gold'), 0, 0.05, 0.14);
    if (t === 2) for (const y of [0.13, 0.2, 0.27]) add(g, sph(0.012, 8), metal('bronze'), 0, y, 0.13);
    if (t === 3) { add(g, sph(0.2, 16), M(0x9a3aa8, { r: 0.6 }), 0, 0.33, -0.03, 0, 0, 0, [1, 0.45, 1]); for (let i = 0; i < 6; i++) { const a = i * 1.05; add(g, sph(0.03, 8), M(0xb8ff6a, { r: 0.4, e: 0x6aff4a, ei: 0.4 }), Math.cos(a) * 0.13, 0.38, Math.sin(a) * 0.13 - 0.03); } }
    add(g, cyl(0.06, 0.07, 0.05, 12), M(col, { r: 0.85 }), 0, 0.3);
    return g;
  },
  ring(t) {
    const g = G(), mt = metal(['bronze', 'silver', 'gold'][t - 1]);
    add(g, new THREE.TorusGeometry(0.07, 0.018, 10, 28), mt, 0, 0.09, 0);
    add(g, cyl(0.03, 0.022, 0.025, 8), mt, 0, 0.165);
    add(g, sph(0.028, 12), GEM(t === 3 ? 0x8aff8a : 0xe04848), 0, 0.19, 0, 0, 0, 0, [1, 0.8, 1]);
    return g;
  },
  amulet() {
    const g = G();
    add(g, new THREE.TorusGeometry(0.11, 0.006, 6, 32), LEATHER, 0, 0.18, -0.01, 0, 0, 0);
    add(g, cyl(0.06, 0.06, 0.02, 20), metal('bronze'), 0, 0.07, 0, R);
    add(g, sph(0.035, 12), GEM(0x4ac87a), 0, 0.07, 0.015, 0, 0, 0, [1, 1, 0.5]);
    for (let i = 0; i < 4; i++) add(g, sph(0.012, 6), M(0x5aa040), Math.cos(i * 1.57) * 0.05, 0.07 + Math.sin(i * 1.57) * 0.05, 0.012);
    return g;
  },
  potion(t) {              // [small red, red, blue, green antidote]
    const g = G(), liquid = [0xe8343c, 0xe8343c, 0x3a6aff, 0x4ad86a][t], big = t === 1 ? 1.25 : 1;
    const glass = M(0xdff4ff, { r: 0.05, t: 0.35 });
    if (t === 3) { add(g, box(0.11, 0.13, 0.11), glass, 0, 0.075); add(g, box(0.09, 0.09, 0.09), M(liquid, { r: 0.2, e: liquid, ei: 0.25 }), 0, 0.06); }
    else { add(g, sph(0.07 * big, 18), glass, 0, 0.07 * big); add(g, sph(0.06 * big, 18), M(liquid, { r: 0.2, e: liquid, ei: 0.25 }), 0, 0.064 * big, 0, 0, 0, 0, [1, 0.92, 1]); }
    const top = t === 3 ? 0.14 : 0.13 * big;
    add(g, cyl(0.022, 0.026, 0.05), glass, 0, top + 0.015);
    add(g, cyl(0.024, 0.02, 0.035), M(0xa87848, { r: 0.9 }), 0, top + 0.05);
    add(g, new THREE.TorusGeometry(0.027, 0.006, 6, 16), metal('gold'), 0, top + 0.002, 0, R);
    add(g, sph(0.013, 8), M(0xffffff, { r: 0.1, t: 0.7 }), -0.03 * big, 0.1 * big, 0.045 * big);
    return g;
  },
  fur(color) { const g = G(), m = M(color, { r: 0.95 }); for (let i = 0; i < 7; i++) { const a = i * 0.9; add(g, sph(0.05 + (i % 3) * 0.01, 10), m, Math.cos(a) * 0.05 * (i ? 1 : 0), 0.05 + (i % 2) * 0.03, Math.sin(a) * 0.04 * (i ? 1 : 0)); } add(g, new THREE.TorusGeometry(0.05, 0.008, 6, 16), M(0xc8a060), 0, 0.06, 0, R * 0.9); return g; },
  acorn() { const g = G(); add(g, sph(0.06, 16), M(0xb87a3a, { r: 0.5 }), 0, 0.07, 0, 0, 0, 0, [1, 1.25, 1]); add(g, sph(0.066, 16), M(0x7a5030, { r: 0.95 }), 0, 0.12, 0, 0, 0, 0, [1, 0.55, 1]); add(g, cyl(0.008, 0.01, 0.04, 6), DWOOD, 0, 0.165); return g; },
  herb() { const g = G(); for (let i = 0; i < 7; i++) { const a = i / 7 * 6.28; const l = add(g, sph(0.035, 8), M(i % 2 ? 0x5ab048 : 0x3e8a3a, { r: 0.7 }), Math.cos(a) * 0.03, 0.1 + (i % 3) * 0.02, Math.sin(a) * 0.03, 0, a, 0.5, [0.6, 1.6, 0.25]); } add(g, cyl(0.008, 0.01, 0.12, 6), M(0x4a7a2a), 0, 0.04); add(g, cyl(0.015, 0.015, 0.02, 8), M(0xc8a060), 0, 0.03); return g; },
  claw() { const g = G(); for (let i = -1; i <= 1; i++) { add(g, cone(0.022, 0.13, 10), M(0xefe6d4, { r: 0.4 }), i * 0.04, 0.08, 0, 0, 0, -i * 0.15 + 0.25); } add(g, box(0.15, 0.03, 0.05), LEATHER, 0, 0.02); return g; },
  fang() { const g = G(); add(g, cone(0.025, 0.14, 10), M(0xf4efe0, { r: 0.35 }), 0, 0.09, 0, 0, 0, 0.2); add(g, new THREE.TorusGeometry(0.03, 0.006, 6, 16), LEATHER, 0, 0.02, 0, R); return g; },
  tusk() { const g = G(); const c = new THREE.TorusGeometry(0.08, 0.02, 8, 18, Math.PI * 0.8); add(g, c, M(0xf0e8d0, { r: 0.4 }), 0, 0.03, 0, 0, 0, 0.3); add(g, cone(0.02, 0.05, 8), M(0xf0e8d0, { r: 0.4 }), -0.06, 0.1, 0, 0, 0, 0.6); return g; },
  cap() { const g = G(); add(g, sph(0.11, 18), M(0x9a3aa8, { r: 0.55 }), 0, 0.07, 0, 0, 0, 0, [1, 0.55, 1]); for (let i = 0; i < 7; i++) { const a = i * 0.9, r = i ? 0.07 : 0; add(g, sph(0.018, 8), M(0xb8ff6a, { e: 0x6aff4a, ei: 0.5 }), Math.cos(a) * r, 0.12 - r * 0.25, Math.sin(a) * r); } add(g, cyl(0.04, 0.05, 0.06, 12), M(0xefe6d4), 0, 0.02); return g; },
  // ---- Lv10-50 zone materials
  gland(c) { const g = G(); add(g, sph(0.08, 16), M(c, { r: 0.2, t: 0.75, e: c, ei: 0.3 }), 0, 0.08, 0, 0, 0, 0, [1, 0.9, 1]); add(g, sph(0.035, 10), M(c, { r: 0.3, e: c, ei: 0.6 }), 0.02, 0.08, 0.02); add(g, cyl(0.012, 0.02, 0.04, 8), LEATHER, 0, 0.165); add(g, new THREE.TorusGeometry(0.018, 0.005, 6, 12), M(0xc8a060), 0, 0.15, 0, R); return g; },
  tusk2(c) { const g = G(); add(g, new THREE.TorusGeometry(0.08, 0.022, 8, 18, Math.PI * 0.8), M(c, { r: 0.45 }), 0, 0.03, 0, 0, 0, 0.3); add(g, cone(0.022, 0.055, 8), M(c, { r: 0.45 }), -0.06, 0.1, 0, 0, 0, 0.6); add(g, cyl(0.03, 0.03, 0.02, 10), LEATHER, 0.07, 0.01, 0, 0, 0, R); return g; },
  fang2(c) { const g = G(); for (const [x, s] of [[-0.03, 0.8], [0.02, 1]]) add(g, cone(0.024 * s, 0.14 * s, 10), M(c, { r: 0.25, e: c, ei: 0.15 }), x, 0.08 * s, 0, 0, 0, 0.18 - x * 4); add(g, new THREE.TorusGeometry(0.035, 0.006, 6, 16), LEATHER, 0, 0.02, 0, R); return g; },
  horn(c) { const g = G(), m = M(c, { r: 0.25, e: c, ei: 0.2 }); for (let i = 0; i < 6; i++) { const a = i * 0.32, r = 0.07; add(g, cyl(0.03 - i * 0.004, 0.034 - i * 0.004, 0.05, 10), m, Math.cos(a) * r - r, 0.03 + Math.sin(a) * r, 0, 0, 0, a); } add(g, cone(0.012, 0.04, 8), m, -0.07 + Math.cos(1.9) * 0.07 - 0.005, 0.03 + Math.sin(1.9) * 0.07 + 0.02, 0, 0, 0, 1.9); return g; },
  pelt(c) { const g = G(), m = M(c, { r: 0.95 }); add(g, box(0.24, 0.035, 0.18), m, 0, 0.02); add(g, box(0.22, 0.035, 0.16), m, 0.01, 0.05, 0.005, 0, 0.2); for (let i = 0; i < 6; i++) add(g, sph(0.03, 8), m, -0.1 + i * 0.04, 0.075, 0.07 * (i % 2 ? 1 : -1)); add(g, new THREE.TorusGeometry(0.06, 0.007, 6, 18), LEATHER, 0, 0.05, 0, R, 0, 0, [1.6, 1, 1]); return g; },
  scales(c) { const g = G(), m = M(c, { r: 0.35, m: 0.2 }); for (let i = 0; i < 5; i++) add(g, cyl(0.05, 0.05, 0.012, 6), m, (i % 3 - 1) * 0.06, 0.02 + i * 0.012, (i > 2 ? 0.04 : -0.02), 0.25, i * 0.6, 0); add(g, sph(0.015, 8), M(0xffd060, { e: 0xffa020, ei: 0.5 }), 0, 0.09, 0); return g; },
  rune() { const g = G(); add(g, box(0.16, 0.2, 0.04), M(0x8a8478, { r: 0.9 }), 0, 0.1, 0, 0, 0, 0.15); for (const [x, y, w, h] of [[0, 0.15, 0.08, 0.012], [0, 0.1, 0.012, 0.09], [-0.03, 0.07, 0.05, 0.012], [0.03, 0.12, 0.012, 0.04]]) add(g, box(w, h, 0.01), M(0xff9a3a, { e: 0xff7a1a, ei: 1.2 }), x, y, 0.022, 0, 0, 0.15); return g; },
  crystal(c) { const g = G(), m = M(c, { r: 0.1, m: 0.1, e: c, ei: 0.55 }); add(g, cone(0.04, 0.2, 6), m, 0, 0.1); add(g, cone(0.03, 0.13, 6), m, 0.045, 0.06, 0.01, 0, 0, -0.45); add(g, cone(0.028, 0.12, 6), m, -0.04, 0.055, -0.01, 0, 0, 0.5); add(g, cyl(0.07, 0.08, 0.025, 7), M(0x4a3a36, { r: 0.9 }), 0, 0.01); return g; },
  heart() { const g = G(), m = M(0xc8203a, { r: 0.3, e: 0xff3a1a, ei: 0.7 }); add(g, sph(0.06, 16), m, -0.035, 0.12); add(g, sph(0.06, 16), m, 0.035, 0.12); add(g, cone(0.085, 0.12, 16), m, 0, 0.05, 0, Math.PI); for (let i = 0; i < 4; i++) add(g, cone(0.012, 0.05, 6), M(0x3a1830, { r: 0.6 }), -0.06 + i * 0.04, 0.18, 0, 0, 0, 0.3 - i * 0.2); return g; },
  coin() { const g = G(); for (let i = 0; i < 3; i++) add(g, cyl(0.045, 0.045, 0.015, 18), metal('gold'), i * 0.02, 0.01 + i * 0.017, 0); return g; },
};
const BY_ID = {
  w_stick_1: ['stick', 1],
  w_pestle_1: ['pestle', 1], w_pestle_2: ['pestle', 2], w_pestle_3: ['pestle', 3],
  w_knife_1: ['knife', 1], w_knife_2: ['knife', 2], w_knife_3: ['knife', 3],
  w_hammer_1: ['hammer', 1], w_hammer_2: ['hammer', 2], w_hammer_3: ['hammer', 3],
  w_scissors_1: ['scissors', 1], w_scissors_2: ['scissors', 2], w_scissors_3: ['scissors', 3],
  w_brush_1: ['brush', 1], w_brush_2: ['brush', 2], w_brush_3: ['brush', 3],
  a_armor_1: ['armor', 1], a_armor_2: ['armor', 2], a_armor_3: ['armor', 3],
  ac_ring_1: ['ring', 1], ac_amulet_2: ['amulet', 2], ac_ring_3: ['ring', 3],
  c_potion_s: ['potion', 0], c_potion_m: ['potion', 1], c_sp_potion: ['potion', 2], c_antidote: ['potion', 3],
  m_jelly: ['fur', 0xf4efe8], m_spore: ['acorn'], m_herb: ['herb'], m_moss_stone: ['claw'], m_boss_cap: ['cap'],
  m_fox_fur: ['fur', 0xe8742c], m_wolf_fang: ['fang'], m_boar_tusk: ['tusk'],
  m_mist_tail: ['fur', 0xc4cce6], m_toad_gland: ['gland', 0x8ad0c0], m_bog_tusk: ['tusk2', 0xcfc6a0], m_mist_fang: ['fang2', 0xd8d8ff], m_mist_bear_claw: ['claw'],
  m_frost_fang: ['fang2', 0xbfe8ff], m_ice_tail: ['fur', 0xe8f4ff], m_frost_horn: ['horn', 0x9ad8ff], m_snow_pelt: ['pelt', 0xf2f4f8], m_glacier_horn: ['horn', 0x4aa8ff],
  m_drake_scale: ['scales', 0xd83a2a], m_cinder_gland: ['gland', 0xff8a2a], m_lava_tusk: ['tusk2', 0x5a2a22], m_rune_shard: ['rune'], m_dragon_blood: ['crystal', 0xe02a4a], m_dragon_heart: ['heart'],
};
// craft-system items (skills2): built from simple stylized shapes by id
const EXTRA = {
  m_bottle: () => { const g = G(); add(g, sph(0.07, 16), M(0xdff4ff, { r: 0.05, t: 0.4 }), 0, 0.07); add(g, cyl(0.022, 0.026, 0.05), M(0xdff4ff, { r: 0.05, t: 0.4 }), 0, 0.15); return g; },
  m_iron: () => { const g = G(); add(g, box(0.22, 0.07, 0.1), metal('iron'), 0, 0.035); add(g, box(0.18, 0.04, 0.07), metal('steel'), 0, 0.09); return g; },
  m_cloth: () => { const g = G(); add(g, cyl(0.06, 0.06, 0.24, 16), M(0xe8d8b8), 0, 0.06, 0, 0, 0, R); add(g, cyl(0.062, 0.062, 0.03, 16), M(0xc05050), 0.04, 0.06, 0, 0, 0, R); return g; },
  m_flour: () => { const g = G(); add(g, sph(0.1, 14), M(0xf0e8d8, { r: 0.95 }), 0, 0.09, 0, 0, 0, 0, [1, 1.1, 0.9]); add(g, cyl(0.03, 0.05, 0.05), M(0xc8a060), 0, 0.2); return g; },
  m_meat: () => { const g = G(); add(g, sph(0.08, 14), M(0xc0503a, { r: 0.7 }), 0, 0.07, 0, 0, 0, 0, [1.3, 0.8, 1]); add(g, cyl(0.015, 0.015, 0.14, 8), M(0xf0e8d8), 0.1, 0.07, 0, 0, 0, R); return g; },
  m_veg: () => { const g = G(); add(g, cone(0.04, 0.2, 10), M(0xf08a2a), 0, 0.1, 0, Math.PI); for (let i = 0; i < 3; i++) add(g, sph(0.03, 6), M(0x4aa040), (i - 1) * 0.02, 0.22, 0, 0, 0, 0, [0.5, 1.6, 0.5]); return g; },
  m_pigment: () => { const g = G(); add(g, cyl(0.06, 0.06, 0.08, 14), M(0xf0f0f0, { r: 0.3 }), 0, 0.04); add(g, cyl(0.055, 0.055, 0.01, 14), M(0xd84a8a), 0, 0.085); add(g, cyl(0.065, 0.065, 0.02, 14), metal('gold'), 0, 0.09); return g; },
  m_gear: () => { const g = G(); add(g, cyl(0.08, 0.08, 0.03, 10), metal('bronze'), 0, 0.04, 0, R); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; add(g, box(0.03, 0.03, 0.03), metal('bronze'), Math.cos(a) * 0.09, 0.04 + Math.sin(a) * 0.09, 0); } return g; },
  m_silk: () => { const g = G(); add(g, cyl(0.05, 0.05, 0.12, 14), M(0xc8a0ff, { r: 0.3, e: 0x8a60d0, ei: 0.3 }), 0, 0.06); add(g, cyl(0.06, 0.06, 0.015, 14), WOOD, 0, 0.005); add(g, cyl(0.06, 0.06, 0.015, 14), WOOD, 0, 0.125); return g; },
  c_potion_l: () => BUILD.potion(1), c_regen_hp: () => BUILD.potion(0), c_regen_sp: () => BUILD.potion(2),
  f_lunch: () => { const g = G(); add(g, box(0.22, 0.07, 0.15), M(0x8a5a32), 0, 0.035); add(g, box(0.2, 0.02, 0.13), M(0xf4f0e8), 0, 0.075); add(g, sph(0.03, 8), M(0xe04040), -0.05, 0.09); add(g, sph(0.03, 8), M(0x4aa040), 0.04, 0.09); return g; },
  f_soup: () => { const g = G(); add(g, sph(0.1, 16), M(0xe8e0d0), 0, 0.08, 0, 0, 0, 0, [1, 0.6, 1]); add(g, cyl(0.085, 0.085, 0.01, 16), M(0xe0a040), 0, 0.12); return g; },
  f_course_atk: () => { const g = G(); add(g, cyl(0.13, 0.11, 0.02, 18), M(0xf4f0e8), 0, 0.01); add(g, sph(0.07, 12), M(0x8a3a20), 0, 0.05, 0, 0, 0, 0, [1.4, 0.5, 1]); add(g, cone(0.02, 0.06, 6), M(0xff6a20, { e: 0xff4a10, ei: 0.6 }), 0, 0.1); return g; },
  f_course_def: () => EXTRA.f_soup(), f_course_heal: () => { const g = G(); add(g, cyl(0.13, 0.11, 0.02, 18), M(0xf4f0e8), 0, 0.01); for (let i = 0; i < 6; i++) add(g, sph(0.035, 8), M(i % 2 ? 0x5ab048 : 0xe04040), Math.cos(i) * 0.05, 0.04, Math.sin(i) * 0.05); return g; },
  f_tonic: () => { const g = G(); add(g, cyl(0.08, 0.06, 0.1, 14), M(0x5a4030), 0, 0.05); add(g, cyl(0.07, 0.07, 0.01, 14), M(0x8a5a20), 0, 0.1); return g; },
  t_whetstone: () => { const g = G(); add(g, box(0.2, 0.05, 0.08), M(0x8a8f9a, { r: 0.9 }), 0, 0.025); return g; },
  t_dye_red: () => dyeBottle(0xd84050), t_dye_blue: () => dyeBottle(0x4a70e0), t_dye_green: () => dyeBottle(0x50b060), t_dye_reset: () => dyeBottle(0xf0f0f0),
  t_mod_speed: () => { const g = EXTRA.m_gear(); add(g, cone(0.03, 0.06, 6), M(0x5ad0ff, { e: 0x3aa0ff, ei: 0.6 }), 0, 0.12); return g; },
  t_mod_area: () => { const g = EXTRA.m_gear(); add(g, sph(0.03, 8), M(0xff7a3a, { e: 0xff4a1a, ei: 0.6 }), 0, 0.13); return g; },
  t_emb_atk: () => spool(0xe04848), t_emb_def: () => spool(0xe0c048), t_emb_mp: () => spool(0x4a8ae0),
  t_charm_atk: () => charm(0xe04848), t_charm_def: () => charm(0xe0c048), t_charm_mp: () => charm(0x4a8ae0),
  w_hammer_c: () => BUILD.hammer(2), w_axe_c: () => { const g = G(); add(g, cyl(0.018, 0.022, 0.4), DWOOD, 0, 0.15); add(g, shape([[0, 0], [0.13, -0.04], [0.15, 0.08], [0.13, 0.16], [0, 0.1]], 0.02), metal('steel'), 0.01, 0.26); return alongZ(g); },
  w_gun_pistol: () => gun(0.16), w_gun_shotgun: () => gun(0.3, true), w_gun_rifle: () => gun(0.42),
  a_metal_c: () => { const g = BUILD.armor(2); g.traverse(o => { if (o.isMesh && o.material.color && o.material.color.getHex() === 0x8a5a32) o.material = metal('steel'); }); return g; },
  a_outfit_c: () => { const g = BUILD.armor(1); g.traverse(o => { if (o.isMesh && o.material.color && o.material.color.getHex() === 0xe8dcc0) o.material = M(0x8a5ad0); }); return g; },
  ac_ribbon: () => { const g = G(); add(g, sph(0.05, 10), M(0xe060a0), 0, 0.08); for (const s of [-1, 1]) add(g, cone(0.05, 0.12, 8), M(0xe060a0), s * 0.08, 0.08, 0, 0, 0, s * R); return g; },
};
function dyeBottle(c) { const g = G(); add(g, cyl(0.045, 0.05, 0.12, 12), M(0xdff4ff, { r: 0.05, t: 0.35 }), 0, 0.06); add(g, cyl(0.04, 0.045, 0.09, 12), M(c, { r: 0.3 }), 0, 0.05); add(g, cyl(0.02, 0.02, 0.03, 8), M(0xa87848), 0, 0.135); return g; }
function spool(c) { const g = G(); add(g, cyl(0.04, 0.04, 0.1, 14), M(c, { r: 0.4 }), 0, 0.06); add(g, cyl(0.055, 0.055, 0.012, 14), WOOD, 0, 0.008); add(g, cyl(0.055, 0.055, 0.012, 14), WOOD, 0, 0.112); add(g, cyl(0.004, 0.004, 0.12, 4), metal('silver'), 0.06, 0.08, 0, 0.6); return g; }
function charm(c) { const g = G(); add(g, box(0.1, 0.18, 0.008), M(0xf0e2b0, { r: 0.9 }), 0, 0.09); add(g, box(0.06, 0.06, 0.01), M(c), 0, 0.1); add(g, cyl(0.004, 0.004, 0.06, 4), M(c), 0, 0.2); return g; }
function gun(len, wide) { const g = G(); add(g, box(0.04, 0.1, 0.04), DWOOD, 0, -0.02); add(g, cyl(wide ? 0.025 : 0.016, wide ? 0.025 : 0.016, len, 10), metal('iron'), 0, 0.03 + len / 2); add(g, box(0.05, 0.05, 0.06), metal('bronze'), 0, 0.04); return alongZ(g); }
export const hasItemModel = id => !!(BY_ID[id] || EXTRA[id]);
export function isWeaponModel(id) { if (/^w_(gun|hammer_c|axe_c)/.test(id)) return true; return BY_ID[id] && ['stick', 'pestle', 'knife', 'hammer', 'scissors', 'brush'].includes(BY_ID[id][0]); }
/** new Object3D for an item id (null when unknown) */
export function itemModel(id) { const b = BY_ID[id]; if (!b) return EXTRA[id] ? EXTRA[id]() : null; return BUILD[b[0]](b[1]); }

/** world-space display group: centred, upright, sized ~0.45 m, weapons laid at an angle */
export function lootModel(id) {
  const m = itemModel(id) || BUILD.coin();
  const holder = new THREE.Group(); holder.add(m);
  if (isWeaponModel(id)) { m.rotation.x = -R * 0.55; m.rotation.z = 0.5; }
  const bb = new THREE.Box3().setFromObject(holder), sz = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
  const k = 0.45 / Math.max(sz.x, sz.y, sz.z); m.position.sub(c); const outer = new THREE.Group(); outer.add(holder); holder.scale.setScalar(k);
  return outer;
}

/** render every item into a 128 px PNG data URL (transparent background), keyed by icon name */
export function renderItemIcons(ids, size = 128) {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(size, size); r.setPixelRatio(1); r.outputColorSpace = THREE.SRGBColorSpace; r.setClearColor(0, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x705848, 2.0));
  const key = new THREE.DirectionalLight(0xfff2dc, 2.6); key.position.set(-2, 3, 3); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9ad0ff, 1.4); rim.position.set(2, 1, -2); scene.add(rim);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50); cam.position.set(2.2, 2.0, 4.4); cam.lookAt(0, 0, 0);
  const out = {};
  for (const id of ids) {
    const m = itemModel(id); if (!m) continue;
    const g = new THREE.Group(); g.add(m);
    if (isWeaponModel(id)) { m.rotation.set(-R, 0, 0); g.rotation.z = -Math.PI / 4; }      // upright, blade to the top-right
    else g.rotation.y = 0.35;
    scene.add(g);
    const bb = new THREE.Box3().setFromObject(g), c = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3());
    g.position.sub(c); const h = Math.max(sz.x, sz.y, sz.z) * 0.6;
    cam.left = -h; cam.right = h; cam.top = h; cam.bottom = -h; cam.updateProjectionMatrix();
    r.render(scene, cam); out[id] = r.domElement.toDataURL('image/png');
    scene.remove(g);
  }
  r.dispose(); r.forceContextLoss && r.forceContextLoss();
  return out;
}
