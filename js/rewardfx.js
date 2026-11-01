// Reward effects: EXP orbs that fly from a defeated monster into the player, and the level-up angel wings.
// The wings are modelled procedurally: two wings of ~26 feathers each (primaries / secondaries / coverts) that unfold
// from the player's back, flap twice and dissolve into drifting feathers, with a halo, a light pillar and sparkles.
import { THREE, CAM } from './render.js';

const DEG = Math.PI / 180, TAU = Math.PI * 2;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutBack = (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const g3 = (p, y = 0) => new THREE.Vector3(p.x, (p.y || 0) + y, -p.z);   // game -> three

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// feather: u along the length (0 = quill), v across (0..1). White vane, warm gold rim, bright rachis.
let _featherTex, _glowTex, _orbTex, _pillarTex;
const featherTex = () => _featherTex || (_featherTex = canvasTex(128, 64, (g, w, h) => {
  const img = g.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x / (w - 1), v = Math.abs(y / (h - 1) - 0.5) * 2;           // v: 0 centre .. 1 edge
    const barb = 0.5 + 0.5 * Math.sin(u * 70 + v * 9);                     // fine barbs
    const rim = smooth(0.55, 0.98, v), rach = 1 - smooth(0.0, 0.08, v);
    const r = 255, gg = lerp(250, 214, rim), b = lerp(246, 140, rim);
    const o = (y * w + x) * 4; d[o] = r; d[o + 1] = Math.min(255, gg + rach * 10); d[o + 2] = Math.min(255, b + rach * 40);
    d[o + 3] = 255 * (1 - smooth(0.82, 1, v)) * (0.82 + 0.18 * barb) * smooth(0, 0.06, u);
  }
  g.putImageData(img, 0, 0);
}));
const glowTex = () => _glowTex || (_glowTex = canvasTex(64, 64, (g, w) => {
  const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,236,180,0.55)'); gr.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
}));
const orbTex = () => _orbTex || (_orbTex = canvasTex(64, 64, (g, w) => {
  const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.22, 'rgba(200,240,255,0.95)'); gr.addColorStop(0.5, 'rgba(110,200,255,0.35)'); gr.addColorStop(1, 'rgba(80,160,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2; g.beginPath(); g.moveTo(w / 2, 6); g.lineTo(w / 2, w - 6); g.moveTo(6, w / 2); g.lineTo(w - 6, w / 2); g.stroke();
}));
const pillarTex = () => _pillarTex || (_pillarTex = canvasTex(64, 128, (g, w, h) => {
  const gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.35, 'rgba(255,220,140,0.55)'); gr.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const sx = g.createLinearGradient(0, 0, w, 0); sx.addColorStop(0, 'rgba(0,0,0,1)'); sx.addColorStop(0.5, 'rgba(0,0,0,0)'); sx.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = sx; g.fillRect(0, 0, w, h);
}));

// unit feather strip along +x (length 1), width profile tapers to a rounded tip
let _featherGeo;
function featherGeo() {
  if (_featherGeo) return _featherGeo;
  const N = 10, pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, w = 0.5 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 0.92 + 0.04)), 0.6) * (u < 0.15 ? 0.35 + u * 4.3 : 1) * (1 - 0.25 * u);
    const bend = 0.06 * Math.sin(u * Math.PI);                                           // slight curve
    pos.push(u, bend + w * 0.2, 0, u, bend - w * 0.2, 0); uv.push(u, 1, u, 0);
    if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return (_featherGeo = g);
}

function featherMats() {
  const vane = new THREE.MeshBasicMaterial({ map: featherTex(), color: new THREE.Color(1.25, 1.2, 1.1), transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const glow = new THREE.MeshBasicMaterial({ map: featherTex(), color: new THREE.Color(2.6, 2.1, 1.3), transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0.55 });
  return { vane, glow };
}

/** one wing (right side; the left is mirrored). Feather = { pivot, fold:{x,y,a,l}, open:{x,y,a,l}, delay } */
function buildWing(mats) {
  const root = new THREE.Group(), feathers = [];
  const add = (open, fold, delay, layer) => {
    const piv = new THREE.Group(), m1 = new THREE.Mesh(featherGeo(), mats.vane), m2 = new THREE.Mesh(featherGeo(), mats.glow);
    m2.scale.set(1.06, 1.35, 1); m2.position.z = -0.004; m1.renderOrder = 20 + layer; m2.renderOrder = 19 + layer;
    piv.add(m2, m1); root.add(piv); feathers.push({ piv, open, fold, delay, layer });
  };
  // the wing "arm": shoulder -> elbow -> wrist -> tip, spread pose vs folded against the back
  const armO = (t) => ({ x: 0.08 + 1.25 * t, y: 0.05 + 0.55 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.5) - 0.25 * t * t });
  const armF = (t) => ({ x: 0.08 + 0.18 * t, y: 0.05 + 0.5 * t });
  // primaries: from the wrist, fanning outward / up
  for (let i = 0; i < 7; i++) { const k = i / 6, t = 0.72 + 0.28 * k;
    add({ ...armO(t), a: lerp(-28, 38, k), l: lerp(1.05, 1.35, Math.sin(k * Math.PI * 0.8)) }, { ...armF(t), a: -92 + i * 1.5, l: 0.9 }, 0.08 + k * 0.12, 0); }
  // secondaries: along the forearm, hanging down and back
  for (let i = 0; i < 9; i++) { const k = i / 8, t = 0.12 + 0.6 * k;
    add({ ...armO(t), a: lerp(-108, -40, k), l: lerp(0.62, 0.95, k) }, { ...armF(t), a: -96 + i, l: 0.6 }, 0.04 + k * 0.08, 1); }
  // coverts: short feathers over the arm bone
  for (let i = 0; i < 10; i++) { const k = i / 9, t = 0.04 + 0.86 * k;
    add({ x: armO(t).x - 0.03, y: armO(t).y + 0.02, a: lerp(-95, -10, k), l: lerp(0.32, 0.45, k) }, { ...armF(t), a: -88, l: 0.3 }, 0.02 + k * 0.08, 2); }
  return { root, feathers };
}

class LevelUpWings {
  constructor(scene, player) {
    this.scene = scene; this.p = player; this.t = 0; this.dur = 3.1; this.dead = false;
    this.root = new THREE.Group(); this.root.rotation.order = 'YXZ'; scene.add(this.root);
    this.mats = featherMats();
    this.wings = [buildWing(this.mats), buildWing(this.mats)];
    this.wings[0].root.scale.x = -1; this.wings[0].side = -1; this.wings[1].side = 1; for (const w of this.wings) { w.root.position.y = 1.18; this.root.add(w.root); }
    // halo
    this.haloMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.6, 1.3), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.halo = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.03, 8, 40), this.haloMat); this.halo.rotation.x = Math.PI / 2; this.halo.position.y = 2.15; this.root.add(this.halo);
    // light pillar (world-aligned, not tilted)
    this.pillarMat = new THREE.MeshBasicMaterial({ map: pillarTex(), color: new THREE.Color(2.2, 1.9, 1.3), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
    this.pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.05, 7, 28, 1, true), this.pillarMat); this.pillar.position.y = 3.5; scene.add(this.pillar);
    // soft glow behind the body
    this.backGlowMat = new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(2.2, 1.9, 1.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.backGlow = new THREE.Sprite(this.backGlowMat); this.backGlow.position.y = 1.3; this.root.add(this.backGlow);
    this.loose = [];   // drifting feathers after the wings dissolve
  }
  place() {
    const p = this.p.pos, yaw = CAM.yaw * DEG, fx = Math.sin(yaw), fz = -Math.cos(yaw);   // camera forward (three)
    this.root.position.set(p.x + fx * 0.22, (p.y || 0), -p.z + fz * 0.22);             // slightly behind the body as seen from the camera
    this.root.rotation.set(-0.42, -yaw, 0);                                           // wing plane faces the camera, tilted back like the view
    this.pillar.position.set(p.x, (p.y || 0) + 3.5, -p.z);
  }
  update(dt) {
    this.t += dt; const t = this.t; this.place();
    const open = (k) => easeOutBack(clamp01((t - 0.12 - k) / 0.6));
    const flap = Math.sin(clamp01((t - 0.75) / 1.5) * Math.PI * 2) * smooth(0.75, 1.0, t) * (1 - smooth(1.9, 2.3, t));
    const fade = 1 - smooth(2.15, 2.75, t);
    for (const w of this.wings) {
      w.root.rotation.y = w.side * flap * 0.35; w.root.rotation.z = w.side * (0.22 * smooth(0.1, 0.7, t) + flap * 0.1);
      for (const f of w.feathers) {
        const s = open(f.delay), x = lerp(f.fold.x, f.open.x, s), y = lerp(f.fold.y, f.open.y, s), a = lerp(f.fold.a, f.open.a, s), l = lerp(f.fold.l, f.open.l, Math.min(1, s));
        f.piv.position.set(x, y, 0.012 * f.layer); f.piv.rotation.z = a * DEG + flap * 0.12 * (f.layer === 0 ? 1 : 0.5) + Math.sin(t * 9 + f.delay * 40) * 0.02 * s;
        f.piv.scale.set(Math.max(0.05, l) * (0.6 + 0.4 * clamp01(s * 1.5)), 0.9 + 0.1 * s, 1);
      }
    }
    this.mats.vane.opacity = fade * clamp01((t - 0.05) / 0.12); this.mats.glow.opacity = 0.55 * this.mats.vane.opacity * (1 + 0.6 * Math.max(0, Math.sin(t * 6)));
    // dissolve: release a burst of loose feathers as the wings fade
    if (!this.released && t > 2.15) { this.released = true; this.spawnLoose(); }
    this.haloMat.opacity = clamp01((t - 0.3) / 0.3) * (1 - smooth(2.3, 2.9, t)); this.halo.rotation.z = t * 1.5; this.halo.position.y = 2.15 + 0.04 * Math.sin(t * 3);
    this.pillarMat.opacity = (t < 0.15 ? t / 0.15 : 1 - smooth(0.15, 1.3, t)) * 0.9; this.pillar.scale.set(1 - 0.5 * smooth(0, 1.3, t), 1, 1 - 0.5 * smooth(0, 1.3, t));
    this.backGlowMat.opacity = smooth(0.1, 0.5, t) * fade; this.backGlow.scale.setScalar(2.6 + 0.3 * Math.sin(t * 5));
    for (const q of this.loose) {
      q.t += dt; q.v.y = Math.max(-0.7, q.v.y - 1.2 * dt); q.m.position.addScaledVector(q.v, dt);
      q.m.position.x += Math.sin(q.t * 3 + q.ph) * 0.4 * dt; q.m.rotation.z += q.spin * dt; q.m.rotation.y += q.spin * 0.6 * dt;
      q.m.material.opacity = clamp01(1 - q.t / q.life);
    }
    if (t > this.dur && this.loose.every(q => q.t > q.life)) this.dispose();
  }
  spawnLoose() {
    const geo = featherGeo(), base = this.root.position;
    for (let i = 0; i < 18; i++) {
      const mat = this.mats.vane.clone(); mat.opacity = 1; const m = new THREE.Mesh(geo, mat); m.scale.set(0.45, 0.8, 1);
      const side = i % 2 ? 1 : -1, yaw = CAM.yaw * DEG, rx = Math.cos(yaw), rz = Math.sin(yaw), d = 0.3 + Math.random() * 1.4;
      m.position.set(base.x + rx * side * d, base.y + 1.2 + Math.random() * 1.1, base.z + rz * side * d); m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 6);
      this.scene.add(m); this.loose.push({ m, t: 0, life: 1.6 + Math.random() * 1.0, ph: Math.random() * 6, spin: (Math.random() - 0.5) * 6, v: new THREE.Vector3(rx * side * 0.6, 0.6 + Math.random() * 0.8, rz * side * 0.6) });
    }
  }
  dispose() {
    if (this.dead) return; this.dead = true;
    this.scene.remove(this.root); this.scene.remove(this.pillar); for (const q of this.loose) { this.scene.remove(q.m); q.m.material.dispose(); }
    this.halo.geometry.dispose(); this.pillar.geometry.dispose(); this.mats.vane.dispose(); this.mats.glow.dispose(); this.haloMat.dispose(); this.pillarMat.dispose(); this.backGlowMat.dispose();
  }
}

class ExpOrb {
  constructor(scene, from, target, i, n, onArrive) {
    this.scene = scene; this.target = target; this.onArrive = onArrive; this.i = i; this.t = 0; this.dead = false;
    this.mat = new THREE.SpriteMaterial({ map: orbTex(), color: new THREE.Color(i % 3 === 0 ? 2.6 : 1.6, i % 3 === 0 ? 2.3 : 2.3, i % 3 === 0 ? 1.2 : 2.8), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.s = new THREE.Sprite(this.mat); this.s.scale.setScalar(0.42); this.pos = g3(from, 0.6); this.s.position.copy(this.pos); scene.add(this.s);
    const a = (i / n) * TAU + Math.random() * 0.6, sp = 2 + Math.random() * 1.5;
    this.v = new THREE.Vector3(Math.cos(a) * sp, 3 + Math.random() * 2, Math.sin(a) * sp);
    this.delay = 0.32 + i * 0.05; this.trail = [];
  }
  update(dt) {
    this.t += dt; const tg = g3(this.target.pos, 1.0);
    if (this.t < this.delay) { this.v.y -= 9 * dt; this.v.multiplyScalar(1 - 2.2 * dt); }
    else { const to = tg.clone().sub(this.pos), d = to.length(), k = this.t - this.delay, sp = 6 + 22 * k;
      this.v.lerp(to.normalize().multiplyScalar(sp), Math.min(1, dt * (4 + 12 * k)));
      if (d < 0.35 || k > 1.6) { this.dead = true; this.dispose(); this.onArrive(this.i); return; } }
    this.pos.addScaledVector(this.v, dt); this.s.position.copy(this.pos);
    this.s.scale.setScalar(0.4 + 0.08 * Math.sin(this.t * 25)); this.mat.rotation += dt * 4;
  }
  dispose() { this.scene.remove(this.s); this.mat.dispose(); }
}

export class RewardFx {
  constructor(G) { this.G = G; this.items = []; }
  get scene() { return this.G.render.scene; }
  /** orbs from a defeated monster into the player; chime + EXP bar flash as they arrive */
  expOrbs(fromPos, exp) {
    const G = this.G, p = G.player; if (!p) return;
    const n = Math.max(3, Math.min(10, 2 + Math.round(exp / 12)));
    let got = 0;
    for (let i = 0; i < n; i++) this.items.push(new ExpOrb(this.scene, fromPos, p, i, n, () => {
      got++; G.audio.chime && G.audio.chime('exp', got);
      if (got === 1) G.ui.flashExp && G.ui.flashExp();
      if (got === n && G.skillFx) G.skillFx.burst('sparks', { x: p.pos.x, y: p.pos.y + 0.4, z: p.pos.z }, { radius: 0.6, color: 0x9fdcff });
    }));
  }
  levelUp() {
    const G = this.G, p = G.player; if (!p) return;
    this.items.push(new LevelUpWings(this.scene, p));
    if (G.skillFx) { G.skillFx.burst('explosion_gold', { x: p.pos.x, y: p.pos.y, z: p.pos.z }, { radius: 1.1 }); G.skillFx.burst('heal', { x: p.pos.x, y: p.pos.y, z: p.pos.z }, { radius: 1.2, color: 0xffe08a }); }
    G.audio.chime && G.audio.chime('levelup');
    G.ui.levelBanner && G.ui.levelBanner(G.sheet ? G.sheet.p.level : 0);
  }
  update(dt) {
    for (const it of this.items) if (!it.dead) it.update(dt);
    if (this.items.some(it => it.dead)) this.items = this.items.filter(it => !it.dead);
  }
  clear() { for (const it of this.items) if (!it.dead) it.dispose(); this.items = []; }
}
