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
let _featherTex, _glowTex, _pillarTex;
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

// ===================================================================================== job change (전직 변신)
// A see-through column of light closes round the player, a soft white cocoon swells (the body swaps to the new
// outfit model inside it, ~0.95 s), the angel wings (LevelUpWings) unfold behind, two golden heralds' trumpets with
// hanging banners rise either side and "blow" (shake, glow at the bell, notes streaming out) to a synthesized fanfare,
// sparkles and feathers rain down. ~3.4 s.
let _trumpetTex, _noteTex;
const trumpetTex = () => _trumpetTex || (_trumpetTex = canvasTex(512, 256, (g, w, h) => {
  const gold = (y0, y1) => { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#fff6c0'); gr.addColorStop(0.35, '#ffd24a'); gr.addColorStop(0.7, '#c98a14'); gr.addColorStop(1, '#7a4a08'); return gr; };
  // banner hanging under the tube (blue cloth, gold fringe, a white star)
  g.fillStyle = '#2a4aa8'; g.beginPath(); g.moveTo(150, 92); g.lineTo(330, 92); g.lineTo(330, 196); g.lineTo(240, 172); g.lineTo(150, 196); g.closePath(); g.fill();
  g.strokeStyle = '#ffd24a'; g.lineWidth = 6; g.stroke();
  g.fillStyle = '#fff4d0'; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 11 : 26; g.lineTo(240 + Math.cos(a) * r, 132 + Math.sin(a) * r); } g.closePath(); g.fill();
  g.fillStyle = '#ffd24a'; for (let x = 156; x < 326; x += 14) { g.beginPath(); g.arc(x, 92, 4, 0, TAU); g.fill(); }
  // tube: mouthpiece -> long straight pipe -> flaring bell (right)
  g.fillStyle = gold(70, 100); g.fillRect(40, 74, 330, 20);
  g.fillStyle = gold(60, 110); g.beginPath(); g.ellipse(36, 84, 12, 16, 0, 0, TAU); g.fill();
  g.fillStyle = gold(56, 114); g.fillRect(120, 66, 14, 36); g.fillRect(250, 66, 14, 36);       // valves / rings
  g.fillStyle = gold(10, 160); g.beginPath(); g.moveTo(360, 74); g.quadraticCurveTo(440, 70, 500, 14); g.lineTo(500, 154); g.quadraticCurveTo(440, 98, 360, 94); g.closePath(); g.fill();
  g.strokeStyle = '#6a3e06'; g.lineWidth = 3; g.stroke();
  g.fillStyle = '#fff8dc'; g.beginPath(); g.ellipse(500, 84, 10, 70, 0, 0, TAU); g.fill();     // bell rim
  g.strokeStyle = 'rgba(255,255,240,.85)'; g.lineWidth = 4; g.beginPath(); g.moveTo(48, 78); g.lineTo(360, 78); g.stroke();   // highlight
}));
const noteTex = () => _noteTex || (_noteTex = canvasTex(128, 128, (g) => {
  g.font = 'bold 96px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = 'rgba(255,220,120,1)'; g.shadowBlur = 14;
  g.fillStyle = '#fff6d0'; g.fillText('♪', 64, 70);
}));

class JobChangeFx {
  constructor(scene, player, onSwap) {
    this.scene = scene; this.p = player; this.onSwap = onSwap; this.t = 0; this.dur = 3.6; this.dead = false; this.swapped = false; this.wings = null;
    this.root = new THREE.Group(); scene.add(this.root);
    const add = (m) => { this.root.add(m); return m; };
    // see-through light column (two nested cylinders, slowly turning streaks)
    this.colMat = new THREE.MeshBasicMaterial({ map: pillarTex(), color: new THREE.Color(1.6, 1.7, 1.9), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, opacity: 0 });
    this.col = add(new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.25, 9, 32, 1, true), this.colMat)); this.col.position.y = 4.5;
    this.col2 = add(new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, 9, 24, 1, true), this.colMat)); this.col2.position.y = 4.5;
    // white cocoon hiding the swap
    this.cocMat = new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(2.4, 2.4, 2.2), transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0 });
    this.coc = add(new THREE.Sprite(this.cocMat)); this.coc.position.y = 0.95; this.coc.renderOrder = 30;
    // two trumpets (sprites; the left one mirrored) + notes
    this.trMat = new THREE.SpriteMaterial({ map: trumpetTex(), transparent: true, depthWrite: false, toneMapped: false, opacity: 0 });
    this.trGlowMat = new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(2.2, 1.8, 0.9), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0 });
    // sprites ignore negative scale, so the left trumpet gets a mirrored copy of the texture (bell = texture right end, outward)
    this.trTexL = trumpetTex().clone(); this.trTexL.wrapS = THREE.RepeatWrapping; this.trTexL.repeat.x = -1; this.trTexL.offset.x = 1; this.trTexL.needsUpdate = true;
    this.tr = [-1, 1].map(side => { const m = this.trMat.clone(); if (side < 0) m.map = this.trTexL; const s = add(new THREE.Sprite(m)); s.renderOrder = 25; const gl = add(new THREE.Sprite(this.trGlowMat)); gl.renderOrder = 26; return { s, gl, side }; });
    this.notes = []; this.noteT = 0;
    this.place();
  }
  place() { const p = this.p.pos; this.root.position.set(p.x, p.y || 0, -p.z); }
  update(dt) {
    const t = (this.t += dt); this.place();
    // column: closes in, glows, then thins out and fades
    const ci = smooth(0, 0.35, t) * (1 - smooth(2.4, 3.4, t));
    this.colMat.opacity = 0.75 * ci; const sq = 1 - 0.35 * smooth(0, 0.9, t) + 0.15 * smooth(1.2, 2.6, t);
    this.col.scale.set(sq, 1, sq); this.col.rotation.y = t * 0.8; this.col2.rotation.y = -t * 1.3; this.col2.scale.set(sq, 1, sq);
    // cocoon peaks at the swap, then opens
    const ck = t < 0.95 ? smooth(0.15, 0.95, t) : 1 - smooth(1.0, 1.7, t);
    this.cocMat.opacity = ck; this.coc.scale.setScalar(1.2 + 1.6 * ck + 0.08 * Math.sin(t * 20));
    if (!this.swapped && t >= 0.95) { this.swapped = true; try { this.onSwap && this.onSwap(); } catch (e) { console.warn(e); } G.render.addShake && G.render.addShake(0.05, 0.2);
      if (G.skillFx) { const q = { x: this.p.pos.x, y: this.p.pos.y, z: this.p.pos.z }; G.skillFx.burst('explosion_gold', q, { radius: 1.3 }); G.skillFx.burst('heal', q, { radius: 1.4, color: 0xfff0c0 }); } }
    if (!this.wings && t >= 1.0) { this.wings = new LevelUpWings(this.scene, this.p); this.wings.dur = 2.6; }
    if (this.wings && !this.wings.dead) this.wings.update(dt);
    // trumpets: rise from the shoulders 1.05 s, tilt the bells up and outward, shake while they blow (1.3 - 2.9 s)
    const yaw = CAM.yaw * DEG, rx = Math.cos(yaw), rz = Math.sin(yaw);       // camera right (three space)
    const up = easeOutBack(clamp01((t - 1.05) / 0.5)), blow = t > 1.3 && t < 2.9, fade = clamp01((t - 1.05) / 0.25) * (1 - smooth(2.9, 3.4, t));
    this.trGlowMat.opacity = blow ? 0.7 + 0.3 * Math.sin(t * 30) : 0.25 * fade;
    for (const T of this.tr) {
      const d = 0.95 + 0.25 * up, h = 1.15 + 0.85 * up + (blow ? Math.sin(t * 26 + T.side) * 0.025 : 0);
      T.s.position.set(rx * T.side * d, h, rz * T.side * d); T.s.scale.set(1.9, 0.95, 1);
      T.rot = T.side * (0.42 + 0.1 * up + (blow ? 0.03 * Math.sin(t * 22) : 0));        // bells tilt up and outward
      const bx = rx * T.side * (d + 0.82), bz = rz * T.side * (d + 0.82), by = h + 0.42;
      T.gl.position.set(bx, by, bz); T.gl.scale.setScalar(blow ? 0.9 + 0.25 * Math.sin(t * 18) : 0.5); T.bell = new THREE.Vector3(bx, by, bz);
    }
    for (const T of this.tr) { T.s.material.opacity = fade; T.s.material.rotation = T.rot; }
    if (blow) { this.noteT -= dt; if (this.noteT <= 0) { this.noteT = 0.09; for (const T of this.tr) this.spawnNote(T); } }
    for (const n of this.notes) { n.t += dt; n.s.position.addScaledVector(n.v, dt); n.v.y += 0.6 * dt; n.s.material.opacity = clamp01(1 - n.t / n.life) * fade; n.s.material.rotation = Math.sin(n.t * 6 + n.ph) * 0.4; }
    this.notes = this.notes.filter(n => { if (n.t < n.life) return true; this.root.remove(n.s); n.s.material.dispose(); return false; });
    if (t > this.dur && (!this.wings || this.wings.dead)) this.dispose();
  }
  spawnNote(T) {
    if (!T.bell) return;
    const m = new THREE.SpriteMaterial({ map: noteTex(), color: new THREE.Color(1.6, 1.4, 0.9), transparent: true, depthWrite: false, toneMapped: false });
    const s = new THREE.Sprite(m); s.position.copy(T.bell); s.scale.setScalar(0.42 + Math.random() * 0.18); s.renderOrder = 27; this.root.add(s);
    const yaw = CAM.yaw * DEG, rx = Math.cos(yaw) * T.side, rz = Math.sin(yaw) * T.side;
    this.notes.push({ s, t: 0, life: 0.9 + Math.random() * 0.4, ph: Math.random() * 6, v: new THREE.Vector3(rx * (0.8 + Math.random() * 0.6), 0.9 + Math.random() * 0.7, rz * (0.8 + Math.random() * 0.6)) });
  }
  dispose() {
    if (this.dead) return; this.dead = true; this.scene.remove(this.root);
    this.col.geometry.dispose(); this.col2.geometry.dispose(); this.colMat.dispose(); this.cocMat.dispose(); this.trGlowMat.dispose(); this.trMat.dispose(); this.trTexL.dispose();
    for (const T of this.tr) T.s.material.dispose(); for (const n of this.notes) n.s.material.dispose();
    if (this.wings) this.wings.dispose();
  }
}

// ===================================================================================== monster-kill reward
// One sequence per kill (all pooled, no per-kill geometry / material):
//   0.00 kill  · 0.05 small white-gold flash · 0.10 thin gold ground rune (0.7 -> 1.05 -> 1.0) · 0.15 golden light shafts
//   (8-14 tapered streaks, bright at the foot, transparent at the top) · 0.20 blue / gold starbursts + tiny sparkles,
//   staggered · 0.25 rising motes, 2 pale energy rings (flat + tilted) · 0.30 "+N G" · 0.40 "+N EXP" (one reward stack,
//   EXP above gold, kept apart from other stacks on screen) · 0.35 3-6 sparks curve into the player (chime + EXP bar)
//   · petals drifting · everything gone by ~1.8 s. The monster dissolves into light meanwhile (Monster.updateDead).
const PT_VS = `
attribute float aSize, aAlpha, aType, aRot; attribute vec3 aCol; uniform float uScale;
varying float vA, vType, vRot; varying vec3 vC;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.); vA = aAlpha; vC = aCol; vType = aType; vRot = aRot;
  gl_PointSize = aSize * uScale / max(.1, -mv.z); gl_Position = projectionMatrix * mv; }`;
const PT_FS = `
varying float vA, vType, vRot; varying vec3 vC;
void main(){
  vec2 q = gl_PointCoord * 2. - 1.; float c = cos(vRot), s = sin(vRot); q = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  float d = dot(q, q); if (d > 1.) discard; float a;
  if (vType < .5) a = exp(-d * 6.) + exp(-d * 40.) * .8;                                        // soft glowing dot
  else if (vType < 1.5) { vec2 b = abs(q); vec2 r = abs(vec2(q.x + q.y, q.x - q.y)) * .7071;      // 4-point star + faint diagonals
    a = exp(-b.x * 22.) * exp(-b.y * 2.2) + exp(-b.y * 22.) * exp(-b.x * 2.2) + (exp(-r.x * 30.) * exp(-r.y * 5.) + exp(-r.y * 30.) * exp(-r.x * 5.)) * .35
      + exp(-d * 9.) * .45 + exp(-d * 60.); }
  else { float e = q.x * q.x / .16 + q.y * q.y; a = smoothstep(1., .55, e) * (.75 + .25 * q.y); }   // petal
  gl_FragColor = vec4(vC * vA * a, vType > 1.5 ? vA * a : 1.);
}`;
class RPoints {
  constructor(n, additive) {
    this.n = n; this.live = []; const g = new THREE.BufferGeometry(); this.geo = g;
    this.A = { position: new Float32Array(n * 3), aSize: new Float32Array(n), aAlpha: new Float32Array(n), aType: new Float32Array(n), aRot: new Float32Array(n), aCol: new Float32Array(n * 3) };
    for (const k in this.A) g.setAttribute(k, new THREE.BufferAttribute(this.A[k], k === 'position' || k === 'aCol' ? 3 : 1));
    this.mat = new THREE.ShaderMaterial({ uniforms: { uScale: { value: 400 } }, vertexShader: PT_VS, fragmentShader: PT_FS, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false });
    if (!additive) this.mat.premultipliedAlpha = true;
    this.pts = new THREE.Points(g, this.mat); this.pts.frustumCulled = false; this.pts.renderOrder = additive ? 12 : 11;
  }
  add(p) { if (this.live.length < this.n) { p.t = -(p.delay || 0); this.live.push(p); } return p; }
  update(dt) {
    const L = this.live, A = this.A;
    for (let i = L.length - 1; i >= 0; i--) { const p = L[i]; p.t += dt; if (p.t >= p.life || p.gone) { L[i] = L[L.length - 1]; L.pop(); continue; } if (p.t < 0) continue;
      if (p.move) p.move(p, dt); else { p.vy -= (p.g || 0) * dt; const dr = Math.exp(-(p.drag || 0) * dt); p.vx *= dr; p.vz *= dr; if (!p.g) p.vy *= dr;
        p.x += (p.vx + Math.sin(p.t * 3 + p.seed) * (p.drift || 0)) * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rot += (p.spin || 0) * dt; } }
    for (let i = 0; i < L.length; i++) { const p = L[i], k = Math.max(0, p.t) / p.life, on = p.t >= 0;
      A.position[i * 3] = p.x; A.position[i * 3 + 1] = p.y; A.position[i * 3 + 2] = p.z;
      const pop = p.pop ? (k < 0.18 ? easeOutBack(k / 0.18) : 1 - 0.25 * smooth(0.5, 1, k)) : 1;
      A.aSize[i] = on ? p.size * pop * (1 + (p.grow || 0) * k) : 0;
      const tw = p.twinkle ? 0.65 + 0.35 * Math.sin(p.t * p.twinkle + p.seed) : 1;
      A.aAlpha[i] = on ? p.a * tw * smooth(0, p.fin || 0.05, p.t) * (1 - smooth(p.fout ?? 0.6, 1, k)) : 0;
      A.aType[i] = p.type; A.aRot[i] = p.rot || 0; A.aCol[i * 3] = p.c.r; A.aCol[i * 3 + 1] = p.c.g; A.aCol[i * 3 + 2] = p.c.b; }
    g3n(this.geo, L.length);
  }
}
const g3n = (geo, n) => { geo.setDrawRange(0, n); for (const k in geo.attributes) geo.attributes[k].needsUpdate = true; };

const SHAFT_VS = `
attribute vec2 corner; attribute vec3 aOff, aDim; uniform float uT;
varying float vU, vV, vT, vSeed;
void main(){
  float t = uT - aOff.z, grow = smoothstep(0., .3, t);
  vec3 wp = (modelMatrix * vec4(aOff.x, 0., aOff.y, 1.)).xyz;
  vec3 toCam = normalize(vec3(cameraPosition.x - wp.x, 0., cameraPosition.z - wp.z)), right = normalize(cross(vec3(0., 1., 0.), toCam));
  float w = aDim.y * mix(1., .18, corner.y), H = aDim.x * (.3 + .7 * grow);
  wp += right * corner.x * w + vec3(0., corner.y * H + max(0., t) * .45 + sin(corner.y * 3. + aDim.z * 9. + uT * 2.) * .02 * corner.y, 0.);
  vU = corner.x; vV = corner.y; vT = t; vSeed = aDim.z;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.);
}`;
const SHAFT_FS = `
uniform float uT, uOpacity; uniform vec3 uColA, uColB; varying float vU, vV, vT, vSeed;
void main(){
  float core = exp(-vU * vU * 9.), soft = exp(-vU * vU * 2.2) * .35;
  float vert = pow(1. - vV, 1.6) * smoothstep(0., .06, vV);
  float life = smoothstep(0., .07, vT) * (1. - smoothstep(.45, .95, vT));
  float fl = .85 + .15 * sin(uT * 18. + vSeed * 40.);
  float a = min(1., (core * 1.1 + soft * 1.4) * vert * life * fl * uOpacity);
  if (a < .003) discard;
  gl_FragColor = vec4(mix(uColA, uColB, core) * (1. + core * .7), a);
}`;
const FLAT_VS = `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const RUNE_FS = `
uniform float uT, uOpacity; uniform vec3 uColA, uColB; varying vec2 vP;
float band(float r, float c, float w){ return exp(-pow((r - c) / w, 2.)); }
void main(){
  float r = length(vP), a = atan(vP.y, vP.x); if (r > 1.) discard;
  float v = band(r, .93, .012) * 1.1 + band(r, .78, .008) * .8 + band(r, .5, .006) * .45;
  v += band(r, .855, .006) * step(.45, fract(a / 6.2832 * 40. + uT * .3)) * .7;                      // turning rune dashes
  float ang = mod(a + .3927, .7854) - .3927; v += exp(-pow(ang * r / .006, 2.)) * step(.78, r) * step(r, .93) * .5;   // 8 ticks
  for (int i = 0; i < 4; i++) { float an = float(i) * 1.5708; vec2 c = vec2(cos(an), sin(an)) * .93; vec2 d = abs(vP - c);
    v += smoothstep(.075, .05, d.x * 1.6 + d.y) * 1.3; }                                                // 4 diamonds
  v += exp(-r * r * 8.) * .25;
  gl_FragColor = vec4(mix(uColA, uColB, clamp(v - .6, 0., 1.)) * v, clamp(v, 0., 1.) * uOpacity);
}`;
const RING_FS = `
uniform float uT, uOpacity; uniform vec3 uColA; varying vec2 vP;
void main(){
  float r = length(vP), a = atan(vP.y, vP.x); if (r > 1.) discard;
  float arc = .35 + .65 * smoothstep(-.3, 1., sin(a * 2. + uT * 2.6)) ;
  float v = (exp(-pow((r - .95) / .016, 2.)) + exp(-pow((r - .95) / .06, 2.)) * .25) * arc;
  gl_FragColor = vec4(uColA * v, v * uOpacity);
}`;

const COL = { gold: new THREE.Color(1.15, 0.72, 0.2), white: new THREE.Color(1.15, 1.08, 0.92), pale: new THREE.Color(1.1, 0.95, 0.6),
  blue: new THREE.Color(0.45, 0.75, 1.6), sky: new THREE.Color(0.8, 0.95, 1.2), petal: new THREE.Color(1, 0.88, 0.92), petal2: new THREE.Color(1, 0.97, 0.97) };
const rnd = (a, b) => a + Math.random() * (b - a);
const NSHAFT = 14;

class KillReward {
  constructor(owner) {
    this.o = owner; const g = new THREE.Group(); this.root = g;
    const mk = (fs, extra = {}) => new THREE.ShaderMaterial(Object.assign({ uniforms: { uT: { value: 0 }, uOpacity: { value: 0 }, uColA: { value: new THREE.Color() }, uColB: { value: new THREE.Color() } },
      vertexShader: FLAT_VS, fragmentShader: fs, transparent: true, depthWrite: false, toneMapped: false }, extra));
    const quad = owner.quad;
    this.rune = new THREE.Mesh(quad, mk(RUNE_FS, { blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
    this.rune.rotation.x = -Math.PI / 2; this.rune.position.y = 0.03; this.rune.renderOrder = 4;
    this.rune.material.uniforms.uColA.value.copy(COL.gold); this.rune.material.uniforms.uColB.value.copy(COL.white);
    this.ringA = new THREE.Mesh(quad, mk(RING_FS, { blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); this.ringA.renderOrder = 10;
    this.ringB = new THREE.Mesh(quad, mk(RING_FS, { blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); this.ringB.renderOrder = 10;
    this.ringA.material.uniforms.uColA.value.set(0.85, 0.95, 1.15); this.ringB.material.uniforms.uColA.value.set(1.15, 1.02, 0.78);
    // light shafts: NSHAFT camera-facing (around Y) tapered quads in one geometry, attributes rewritten per kill
    const corner = [], off = new Float32Array(NSHAFT * 4 * 3), dim = new Float32Array(NSHAFT * 4 * 3), idx = [];
    for (let i = 0; i < NSHAFT; i++) { corner.push(-1, 0, 1, 0, -1, 1, 1, 1); const b = i * 4; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(NSHAFT * 12), 3));
    sg.setAttribute('corner', new THREE.Float32BufferAttribute(corner, 2)); sg.setAttribute('aOff', new THREE.BufferAttribute(off, 3)); sg.setAttribute('aDim', new THREE.BufferAttribute(dim, 3)); sg.setIndex(idx);
    this.shaft = new THREE.Mesh(sg, new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uOpacity: { value: 1.25 }, uColA: { value: new THREE.Color(1.0, 0.62, 0.16) }, uColB: { value: new THREE.Color(1.25, 1.05, 0.62) } },
      vertexShader: SHAFT_VS, fragmentShader: SHAFT_FS, transparent: true, depthWrite: false, toneMapped: false }));
    this.shaft.frustumCulled = false; this.shaft.renderOrder = 9;
    g.add(this.rune, this.ringA, this.ringB, this.shaft);
  }
  start(pos) {
    this.t = 0; this.dead = false; this.root.position.set(pos.x, pos.y || 0, -pos.z); this.o.scene.add(this.root);
    const off = this.shaft.geometry.attributes.aOff, dim = this.shaft.geometry.attributes.aDim, n = 8 + ((Math.random() * 7) | 0);
    for (let i = 0; i < NSHAFT; i++) {
      const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * 0.62, use = i < n;
      const x = Math.cos(a) * r, z = Math.sin(a) * r, d = 0.15 + Math.random() * 0.22, H = use ? rnd(1.1, 2.6) * (1 - r * 0.45) : 0, w = rnd(0.05, 0.11), sd = Math.random();
      for (let k = 0; k < 4; k++) { off.setXYZ(i * 4 + k, x, z, d); dim.setXYZ(i * 4 + k, H, w, sd); }
    }
    off.needsUpdate = true; dim.needsUpdate = true;
    this.ringB.rotation.set(-Math.PI / 2 + rnd(0.35, 0.5), 0, Math.random() * TAU); this.ringA.rotation.set(-Math.PI / 2, 0, 0);
  }
  update(dt) {
    const t = (this.t += dt), U = (m) => m.material.uniforms;
    // rune: appears 0.1, scale 0.7 -> 1.05 -> 1.0, fades 0.6 -> 1.0
    const rk = clamp01((t - 0.1) / 0.3), rs = rk < 0.6 ? lerp(0.7, 1.05, smooth(0, 0.6, rk)) : lerp(1.05, 1.0, smooth(0.6, 1, rk));
    this.rune.scale.setScalar(0.85 * rs); U(this.rune).uT.value = t; U(this.rune).uOpacity.value = 0.9 * smooth(0.1, 0.18, t) * (1 - smooth(0.6, 1.05, t));
    this.rune.rotation.z = t * 0.25;
    U(this.shaft).uT.value = t;
    // energy rings: flat (low) + tilted (mid height), slowly widening and turning
    const ek = clamp01((t - 0.22) / 0.9);
    this.ringA.position.y = 0.28; this.ringA.scale.setScalar(lerp(0.55, 0.95, smooth(0, 1, ek))); this.ringA.rotation.z = -t * 0.9;
    this.ringB.position.y = 0.62 + 0.25 * ek; this.ringB.scale.setScalar(lerp(0.45, 0.75, smooth(0, 1, ek))); this.ringB.rotation.z += dt * 1.4;
    for (const r of [this.ringA, this.ringB]) { U(r).uT.value = t; U(r).uOpacity.value = 0.7 * smooth(0.22, 0.35, t) * (1 - smooth(0.7, 1.25, t)); }
    if (t > 1.6) { this.dead = true; this.o.scene.remove(this.root); }
  }
}

class RewardStack {
  constructor(layer, exp, gold) {
    this.e = document.createElement('div'); this.e.className = 'rwstack';
    this.e.innerHTML = (exp > 0 ? `<div class="rw-exp"><i class="rw-orn"></i><b>+${exp} EXP</b><i class="rw-orn b"></i></div>` : '')
      + (gold > 0 ? `<div class="rw-gold"><b>+${gold}<small> G</small></b><i class="rw-orn g"></i></div>` : '');
    layer.appendChild(this.e); this.t = 0; this.dx = 0; this.dy = 0; this.dead = false;
  }
}

export class RewardFx {
  constructor(G) { this.G = G; this.items = []; }
  get scene() { return this.G.render.scene; }
  _init() {
    if (this.add) return;
    this.quad = new THREE.PlaneGeometry(2, 2);
    this.add = new RPoints(900, true); this.norm = new RPoints(120, false);
    this.scene.add(this.add.pts, this.norm.pts); this.kills = []; this.freeK = []; this.stacks = [];
  }
  /** monster defeated: the full reward sequence at `pos` (game coords) for the real exp / gold numbers */
  kill(pos, exp, gold) {
    const G = this.G, pl = G.player; if (!pl) return; this._init();
    if (this.add.pts.parent !== this.scene) this.scene.add(this.add.pts, this.norm.pts);
    const k = this.freeK.pop() || new KillReward(this); k.start(pos); this.kills.push(k);
    const X = pos.x, Y = pos.y || 0, Z = -pos.z, A = this.add;
    A.add({ type: 0, x: X, y: Y + 0.5, z: Z, vx: 0, vy: 0, vz: 0, size: 1.6, a: 1.1, c: COL.white, life: 0.2, delay: 0.03, fin: 0.03, fout: 0.2, seed: 0 });   // impact flash
    const star = (type, n, d0, d1, sz, c, life, rr, h0, h1) => { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, r = rnd(rr * 0.35, rr);
      A.add({ type, x: X + Math.cos(a) * r, y: Y + rnd(h0, h1), z: Z + Math.sin(a) * r, vx: 0, vy: rnd(0.05, 0.25), vz: 0, size: rnd(sz[0], sz[1]), a: 1, c, life, delay: rnd(d0, d1),
        pop: true, rot: Math.random() < 0.5 ? 0 : 0.785 * Math.random() * 0.3, spin: rnd(-0.6, 0.6), seed: Math.random() * 9, twinkle: type === 1 ? 14 : 0, fout: 0.5 }); } };
    star(1, 2 + ((Math.random() * 3) | 0), 0.18, 0.4, [0.95, 1.35], COL.blue, 0.65, 0.85, 0.7, 1.5);         // large blue starbursts
    star(1, 3 + ((Math.random() * 4) | 0), 0.2, 0.5, [0.6, 0.85], COL.gold, 0.6, 0.8, 0.4, 1.7);            // medium gold
    star(1, 10 + ((Math.random() * 11) | 0), 0.15, 0.8, [0.15, 0.28], COL.white, 0.5, 0.9, 0.15, 2.0);       // tiny white sparkles
    for (let i = 0; i < 26; i++) { const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * 0.6;          // rising light dust
      A.add({ type: 0, x: X + Math.cos(a) * r, y: Y + rnd(0.05, 0.4), z: Z + Math.sin(a) * r, vx: 0, vy: rnd(0.6, 1.5), vz: 0, drag: 0.6, drift: rnd(0.15, 0.4), size: rnd(0.06, 0.12),
        a: rnd(0.7, 1), c: Math.random() < 0.65 ? COL.pale : COL.sky, life: rnd(0.8, 1.3), delay: rnd(0.2, 0.55), seed: Math.random() * 9, fout: 0.3 }); }
    for (let i = 0, n = 3 + ((Math.random() * 5) | 0); i < n; i++) { const a = Math.random() * TAU, r = rnd(0.2, 0.7);  // petals / light flakes
      this.norm.add({ type: 2, x: X + Math.cos(a) * r, y: Y + rnd(1.2, 2.0), z: Z + Math.sin(a) * r, vx: rnd(-0.4, 0.4), vy: rnd(-0.55, -0.3), vz: rnd(-0.3, 0.3), drift: 0.35, size: rnd(0.11, 0.16),
        a: 0.95, c: Math.random() < 0.5 ? COL.petal : COL.petal2, life: rnd(1.1, 1.6), delay: rnd(0.25, 0.6), rot: Math.random() * TAU, spin: rnd(-3, 3), seed: Math.random() * 9, fout: 0.65 }); }
    // sparks curving into the player: chime + EXP bar flash on arrival, a tiny sparkle on the body (no burst)
    const n = Math.max(3, Math.min(6, 2 + Math.round(exp / 15))); let got = 0;
    for (let i = 0; i < n; i++) {
      const p0 = new THREE.Vector3(X + rnd(-0.3, 0.3), Y + rnd(0.6, 1.1), Z + rnd(-0.3, 0.3)), side = rnd(-1.2, 1.2), up = rnd(1.2, 2), dur = rnd(0.5, 0.75);
      A.add({ type: 1, x: p0.x, y: p0.y, z: p0.z, size: 0.32, a: 1.2, c: i % 2 ? COL.sky : COL.pale, life: dur, delay: 0.35 + i * 0.07, fin: 0.04, fout: 0.92, seed: i, rot: 0, spin: 6,
        move: (p, dt) => { const u = clamp01(p.t / dur), e = u * u * (3 - 2 * u), tg = g3(pl.pos, 0.9);
          const mx = (p0.x + tg.x) / 2 + side * 0.5, my = Math.max(p0.y, tg.y) + up, mz = (p0.z + tg.z) / 2 - side * 0.5;
          p.x = (1 - e) * (1 - e) * p0.x + 2 * (1 - e) * e * mx + e * e * tg.x; p.y = (1 - e) * (1 - e) * p0.y + 2 * (1 - e) * e * my + e * e * tg.y; p.z = (1 - e) * (1 - e) * p0.z + 2 * (1 - e) * e * mz + e * e * tg.z;
          p.rot += 6 * dt;
          if (u >= 1 && !p.arrived) { p.arrived = true; p.gone = true; got++; G.audio.chime && G.audio.chime('exp', got); if (got === 1) G.ui.flashExp && G.ui.flashExp();
            for (let j = 0; j < 3; j++) A.add({ type: 1, x: tg.x + rnd(-0.25, 0.25), y: tg.y + rnd(-0.2, 0.4), z: tg.z + rnd(-0.25, 0.25), vx: 0, vy: 0.3, vz: 0, size: rnd(0.14, 0.22), a: 1, c: COL.white, life: 0.3, pop: true, seed: j, fout: 0.4 }); } } });
    }
    // reward stack (screen space, never hidden by trees): EXP above, gold below; nudged apart from other live stacks
    const st = new RewardStack(G.ui.floatLayer, exp, gold); st.pos = { x: pos.x, y: (pos.y || 0) + 1.8, z: pos.z };
    const s0 = G.render.toScreen(st.pos);
    for (let tries = 0; tries < 4; tries++) { const hit = this.stacks.find(o => o.t < 1.3 && Math.abs(o.sx - (s0.x + st.dx)) < 150 && Math.abs(o.sy - (s0.y + st.dy)) < 104); if (!hit) break; st.dy = hit.sy - s0.y - 106; st.dx += (Math.random() - 0.5) * 60; }
    st.sx = s0.x + st.dx; st.sy = s0.y + st.dy; this.stacks.push(st);
  }
  /** 전직 변신: light, swap (onSwap at ~0.95 s, inside the white cocoon), angel wings, trumpets + fanfare */
  jobChange(onSwap) {
    const G = this.G, p = G.player; if (!p) { onSwap && onSwap(); return; }
    this.items.push(new JobChangeFx(this.scene, p, onSwap));
    // Recorded trumpet fanfare is played once by the CharacterSheet job event.
  }
  levelUp() {
    const G = this.G, p = G.player; if (!p) return;
    this.items.push(new LevelUpWings(this.scene, p));
    if (G.skillFx) { G.skillFx.burst('explosion_gold', { x: p.pos.x, y: p.pos.y, z: p.pos.z }, { radius: 1.1 }); G.skillFx.burst('heal', { x: p.pos.x, y: p.pos.y, z: p.pos.z }, { radius: 1.2, color: 0xffe08a }); }
    // The levelUp game event plays the recorded fanfare once.
    G.ui.levelBanner && G.ui.levelBanner(G.sheet ? G.sheet.p.level : 0);
  }
  update(dt) {
    for (const it of this.items) if (!it.dead) it.update(dt);
    if (this.items.some(it => it.dead)) this.items = this.items.filter(it => !it.dead);
    if (!this.add) return;
    const R = this.G.render; if (R && R.cam) { const h = R.r ? R.r.domElement.height : 800, sc = h / (2 * Math.tan(R.cam.fov * DEG / 2)); this.add.mat.uniforms.uScale.value = sc; this.norm.mat.uniforms.uScale.value = sc; }
    for (let i = this.kills.length - 1; i >= 0; i--) { const k = this.kills[i]; k.update(dt); if (k.dead) { this.kills.splice(i, 1); this.freeK.push(k); } }
    this.add.update(dt); this.norm.update(dt);
    for (let i = this.stacks.length - 1; i >= 0; i--) {
      const s = this.stacks[i]; s.t += dt;
      if (s.t > 0.3 && !s.g) { s.g = 1; s.e.classList.add('show-g'); } if (s.t > 0.4 && !s.x) { s.x = 1; s.e.classList.add('show-x'); }   // pops on game time
      if (s.t > 1.75) { s.e.remove(); this.stacks.splice(i, 1); continue; }
      const p = R.toScreen(s.pos), rise = -28 * smooth(0.45, 1.75, s.t); s.sx = p.x + s.dx; s.sy = p.y + s.dy;
      s.e.style.transform = `translate(${s.sx}px,${s.sy + rise}px) translate(-50%,-100%)`; s.e.style.opacity = String(1 - smooth(1.2, 1.75, s.t));
    }
  }
  clear() { for (const it of this.items) if (!it.dead) it.dispose(); this.items = [];
    if (this.add) { for (const k of this.kills) { this.scene.remove(k.root); this.freeK.push(k); } this.kills = []; this.add.live.length = 0; this.norm.live.length = 0; for (const s of this.stacks) s.e.remove(); this.stacks = []; } }
}
