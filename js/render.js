// Rendering: three.js scene, zone meshes, upright pixel sprites, effects, telegraphs, camera, occlusion.
// Logic uses Unity coordinates (x east, y up, z north). three.js is right-handed -> z is mirrored here.
import { Post } from './post.js';
import * as THREE from 'three';
import { clamp01, DEG, artBasis, artWorldToImage, artImageToGround, artFootprint } from './core.js';

export const T = (p) => new THREE.Vector3(p.x, p.y, -p.z);
// quarter view with a weak perspective (long lens): `ortho` = half the visible height (m) at the focus distance, so sizes
// on screen match the old orthographic camera at the player; things nearer the camera get slightly bigger (2.5D depth).
// 2026-11-13: ortho 4.75 -> 4.4, phone minWidth 8.5 -> 7.6 m (the character was ~13% of the screen height; now ~8% / ~12% bigger,
// the 2 m attack reach and monsters within ~3.8 m to each side stay on a portrait phone)
export const CAM = { pitch: 44, artPitch: 48, yaw: 45, dist: 26, ortho: 4.4, minWidth: 7.6, sharp: 12, lookAhead: 0.6, depthOffset: 0.6 };

const loader = new THREE.TextureLoader();
const texCache = new Map();
export function tex(path, repeat = false) {
  const key = path + "|" + repeat;
  if (texCache.has(key)) return texCache.get(key);
  const t = loader.load(path);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  texCache.set(key, t);
  return t;
}
export function preloadTextures(paths) {
  return Promise.all(paths.map(p => new Promise(res => {
    const t = tex(p, p.includes("/env/"));
    if (t.image && t.image.complete) return res();
    const img = new Image(); img.onload = img.onerror = () => res(); img.src = p;
  })));
}
const resPath = (unityTex) => {
  // Unity resource path "Arcan/Env/grass" -> web asset path
  const m = unityTex.replace(/^Arcan\//, "");
  const [folder, name] = m.split("/");
  const map = { Env: "env", UI: "ui", Sprites: "sprites", Effects: "fx" };
  return "assets/" + (map[folder] || folder.toLowerCase()) + "/" + name + ".png";
};

// ======================================================================================= renderer
export class Renderer {
  constructor(canvasParent) {
    this.r = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.r.shadowMap.enabled = true;
    this.r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.r.outputColorSpace = THREE.SRGBColorSpace;
    canvasParent.appendChild(this.r.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x5c855c);
    this.cam = new THREE.PerspectiveCamera(20, 1, 1, 160);
    this.focus = new THREE.Vector3(); this.focusU = { x: 0, y: 0, z: 0 };
    this.sun = new THREE.DirectionalLight(0xffffff, 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -24; sc.right = 24; sc.top = 24; sc.bottom = -24; sc.near = 1; sc.far = 100;
    this.sun.shadow.bias = -0.0008; this.sun.shadow.normalBias = 0.03;
    this.hemi = new THREE.HemisphereLight(0xaab4c0, 0x707880, 2.2);
    this.scene.add(this.sun, this.sun.target, this.hemi);
    this.lightFrom = rotYUnity(CAM.yaw, { x: -0.55, y: 0.85, z: -0.45 });
    this.shake = 0; this.shakeT = 0; this.shakeScale = 0.7; this.kickT = 0; this.kickA = 0; this.kickD = 0.1; this.kickX = 0; this.kickZ = 0;
    this.zoneRoot = null;
    try { this.post = new Post(this.r); } catch (e) { console.warn('post', e); this.post = null; }
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.r.setSize(w, h);
    const aspect = w / h;
    this.ortho = Math.max(CAM.ortho, CAM.minWidth / 2 / aspect);
    this.cam.fov = 2 * Math.atan(this.ortho / CAM.dist) / DEG; this.cam.aspect = aspect;
    this.cam.updateProjectionMatrix();
    this.aspect = aspect;
  }
  /** Unity-space camera basis */
  basis() {
    const p = CAM.pitch * DEG, y = CAM.yaw * DEG;
    return {
      f: { x: Math.sin(y) * Math.cos(p), y: -Math.sin(p), z: Math.cos(y) * Math.cos(p) },
      r: { x: Math.cos(y), y: 0, z: -Math.sin(y) },
      u: { x: Math.sin(y) * Math.sin(p), y: Math.cos(p), z: Math.cos(y) * Math.sin(p) }
    };
  }
  setFocus(u, snap, dt = 0.016, sharp = CAM.sharp) {
    const k = snap ? 1 : 1 - Math.exp(-sharp * dt);
    const f = this.focusU;
    f.x += (u.x - f.x) * k; f.y += (u.y - f.y) * k; f.z += (u.z - f.z) * k;
    const dx = u.x - f.x, dz = u.z - f.z, m = Math.hypot(dx, dz);
    if (m > 4) { f.x = u.x - dx / m * 4; f.z = u.z - dz / m * 4; }
  }
  /** one short camera kick along a ground direction (game x / z): out fast, small counter-swing, at rest within `d` s. A kick
   *  while one is still playing does not add: the stronger of the two wins and the timer restarts (repeated / multi hits never
   *  pile up). The HUD is DOM, it does not move. Scaled by the "화면 흔들림" setting like addShake. */
  kick(x, z, a = 0.1, d = 0.1) {
    if (this.shakeScale <= 0) return; const m = Math.hypot(x, z) || 1, amp = Math.min(0.2, a) * this.shakeScale;
    if (this.kickT > 0 && this.kickA * (this.kickT / this.kickD) > amp) return;
    this.kickX = x / m; this.kickZ = z / m; this.kickA = amp; this.kickD = d; this.kickT = d;
  }
  addShake(a, d) { if (this.shakeScale <= 0) return; this.shake = Math.max(this.shake, a * this.shakeScale); this.shakeT = Math.max(this.shakeT, d); }
  render(dt) {
    const b = this.basis();
    let sx = 0, sy = 0;
    if (this.shakeT > 0) { this.shakeT -= dt; const a = this.shake * clamp01(this.shakeT / 0.25); sx = (Math.random() * 2 - 1) * a; sy = (Math.random() * 2 - 1) * a; if (this.shakeT <= 0) this.shake = 0; }
    let kx = 0, ky = 0, kz = 0;
    if (this.kickT > 0) { this.kickT -= dt; const u = 1 - Math.max(0, this.kickT) / this.kickD, k = this.kickA * (u < 0.55 ? Math.sin(u / 0.55 * Math.PI) : -0.35 * Math.sin((u - 0.55) / 0.45 * Math.PI));   // push out, small counter-swing, rest
      kx = this.kickX * k; kz = this.kickZ * k; ky = -Math.abs(k) * 0.35; if (this.kickT <= 0) this.kickA = 0; }
    const f0 = this.focusU, f = { x: f0.x + kx, y: f0.y + ky, z: f0.z + kz };
    const pos = { x: f.x - b.f.x * CAM.dist + b.r.x * sx + b.u.x * sy, y: f.y - b.f.y * CAM.dist + b.u.y * sy, z: f.z - b.f.z * CAM.dist + b.r.z * sx + b.u.z * sy };
    this.cam.position.copy(T(pos));
    this.cam.lookAt(T({ x: pos.x + b.f.x, y: pos.y + b.f.y, z: pos.z + b.f.z }));
    const lf = this.lightFrom;
    this.sun.target.position.copy(T(f));
    this.sun.position.copy(T({ x: f.x + lf.x * 40, y: f.y + lf.y * 40, z: f.z + lf.z * 40 }));
    for (const w of this.waterTex || []) { w.offset.x = performance.now() * 0.00003; w.offset.y = performance.now() * 0.00002; }
    TG_TIME.value = performance.now() / 1000;
    if (this.post) this.post.render(this.scene, this.cam); else this.r.render(this.scene, this.cam);
  }
  /** screen pixel -> Unity-space ray */
  screenRay(px, py) {
    const b = this.basis();
    const w = window.innerWidth, h = window.innerHeight;
    const nx = (px / w) * 2 - 1, ny = 1 - (py / h) * 2;
    const camPos = T(this.cam.position); // back to unity (T is its own inverse for positions)
    const k = this.ortho / CAM.dist, ox = nx * k * this.aspect, oy = ny * k;          // perspective: rays fan out from the eye
    return { o: { x: camPos.x, y: camPos.y, z: camPos.z }, d: { x: b.f.x + b.r.x * ox + b.u.x * oy, y: b.f.y + b.u.y * oy, z: b.f.z + b.r.z * ox + b.u.z * oy } };
  }
  /** Unity point -> screen pixel */
  toScreen(u) {
    const v = T(u).project(this.cam);
    return { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight };
  }
  setZoneLight(def) {
    const a = def.ambient, s = def.sun;
    this.hemi.color.setRGB(a[0] * 1.1, a[1] * 1.1, a[2] * 1.1); this.hemi.groundColor.setRGB(a[0] * 0.7, a[1] * 0.7, a[2] * 0.7);
    this.sun.color.setRGB(s[0], s[1], s[2]); this.sun.intensity = s[3] * 2.3;
    // optional painterly fill: cool violet-blue sky light (what shadows are lit by) and a warm bounce from below
    if (def.shade) { const k = def.shade; this.hemi.color.setRGB(...k.sky); this.hemi.groundColor.setRGB(...k.ground); }
  }

  // ------------------------------------------------------------------ zone meshes (exported from the C# builder)
  buildZone(zoneJson) {
    if (this.zoneRoot) { disposeTree(this.zoneRoot); this.scene.remove(this.zoneRoot); }
    const root = new THREE.Group(); this.zoneRoot = root; this.scene.add(root);
    this.groups = zoneJson.groups.map(g => ({ name: g.name, occ: g.occ, meshes: [], faded: false, clear: 0 }));
    this.waterTex = [];
    const matCache = new Map();
    for (const m of zoneJson.meshes) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(m.p, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(m.n, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(m.uv, 2));
      if (m.c) g.setAttribute("color", new THREE.Float32BufferAttribute(m.c, 4));
      g.setIndex(m.i);
      const key = m.kind + m.tex + m.color.join(",") + (m.c ? "vc" : "") + (m.water ? "w" : "");
      let mat = matCache.get(key);
      if (!mat) {
        const col = new THREE.Color(m.color[0], m.color[1], m.color[2]);
        let map = null;
        if (m.tex) { map = tex(resPath(m.tex), m.tex.includes("/Env/")); if (m.water) { map = loader.load(resPath(m.tex)); map.magFilter = map.minFilter = THREE.NearestFilter; map.generateMipmaps = false; map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping; this.waterTex.push(map); } }
        if (m.kind === "lit") mat = new THREE.MeshLambertMaterial({ color: col, map });
        else if (m.kind === "unlit") mat = new THREE.MeshBasicMaterial({ color: col, map });
        else mat = new THREE.MeshBasicMaterial({ color: col, opacity: m.color[3], transparent: true, vertexColors: !!m.c, depthWrite: false, side: THREE.DoubleSide, map });
        matCache.set(key, mat);
      }
      const mesh = new THREE.Mesh(g, mat); mesh.userData.tex = m.tex; mesh.userData.water = !!m.water;
      mesh.castShadow = m.shadow && m.kind !== "trans";
      mesh.receiveShadow = m.kind === "lit";
      root.add(mesh);
      if (this.groups[m.g]) this.groups[m.g].meshes.push(mesh);
    }
    return root;
  }
  // ------------------------------------------------------------------ painted quarter-view art (buildings, fountain)
  /**
   * Each painted image is drawn on invisible "depth walls" standing on the front edges of its ground footprint
   * (offset 0.4 m outward). The texture is projected along the fixed camera direction, so on screen the picture
   * is exactly the original image (no stretching, no re-drawing) while every pixel gets the depth of the
   * building's front face: actors in front of a building are drawn over it, actors behind it are hidden.
   * Textures: original-resolution lossless PNG, straight alpha with colour bleed, mipmapped trilinear +
   * anisotropic filtering (the art is painted, not pixel art), premultiplied blending in the shader.
   */
  async buildImageArt(list) {
    for (const a of this.art || []) { a.mesh.geometry.dispose(); a.mat.dispose(); a.tex.dispose(); }
    this.art = [];
    const B = artBasis(CAM.artPitch, CAM.yaw), maxAniso = this.r.capabilities.getMaxAnisotropy();
    const loader = new THREE.TextureLoader();
    await Promise.all(list.map(async a => {
      const t = await loader.loadAsync('assets/town/' + a.image + '.png');
      t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = maxAniso;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.premultiplyAlpha = false; t.needsUpdate = true;
      const W = t.image.width, H = t.image.height;
      if (W !== a.size[0] || H !== a.size[1]) console.warn('[art] size mismatch', a.id, W, H, a.size);
      const walls = artWalls(a, B);
      const pos = [], uv = [], idx = [];
      for (const w of walls) {
        const base = pos.length / 3;
        for (const [g, h] of [[w.p0, 0], [w.p1, 0], [w.p1, w.h], [w.p0, w.h]]) {
          const P = { x: g.x, y: h, z: g.z }, im = artWorldToImage(a, P, B), tp = T(P);
          pos.push(tp.x, tp.y, tp.z); uv.push(im.px / W, 1 - im.py / H);
        }
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
      const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, premultipliedAlpha: true, alphaTest: 0.01, depthWrite: true, side: THREE.DoubleSide, toneMapped: false });
      const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 1;
      (this.zoneRoot || this.scene).add(mesh);
      // coarse alpha mask (1/4 res) for the "player is behind this building" test
      const cv = document.createElement('canvas'); cv.width = Math.ceil(W / 4); cv.height = Math.ceil(H / 4);
      const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(t.image, 0, 0, cv.width, cv.height);
      const mask = cx.getImageData(0, 0, cv.width, cv.height).data;
      this.art.push({ a, tex: t, mat, mesh, walls, mask, mw: cv.width, mh: cv.height, W, H, B, fade: 1 });
    }));
    return this.art;
  }
  /** true when the art is drawn over point p (Unity coords): the ray from p to the camera hits an opaque art pixel */
  artCovers(art, p) {
    const f = this.basis().f, d = { x: -f.x, y: -f.y, z: -f.z };
    for (const w of art.walls) {
      // vertical plane through p0-p1
      const ex = w.p1.x - w.p0.x, ez = w.p1.z - w.p0.z, nx = -ez, nz = ex, den = nx * d.x + nz * d.z;
      if (Math.abs(den) < 1e-6) continue;
      const t = (nx * (w.p0.x - p.x) + nz * (w.p0.z - p.z)) / den; if (t <= 0) continue;
      const hx = p.x + d.x * t, hy = p.y + d.y * t, hz = p.z + d.z * t;
      const s = ((hx - w.p0.x) * ex + (hz - w.p0.z) * ez) / (ex * ex + ez * ez);
      if (s < 0 || s > 1 || hy < 0 || hy > w.h) continue;
      const im = artWorldToImage(art.a, { x: hx, y: hy, z: hz }, art.B);
      const mx = Math.floor(im.px / 4), my = Math.floor(im.py / 4);
      if (mx < 0 || my < 0 || mx >= art.mw || my >= art.mh) continue;
      if (art.mask[(my * art.mw + mx) * 4 + 3] > 128) return true;
    }
    return false;
  }
  /** Fade buildings / trees standing between the camera and the given points (Unity coords). */
  updateOcclusion(points, dt) {
    for (const art of this.art || []) {
      const target = points.some(p => this.artCovers(art, p)) ? 0.42 : 1;
      art.fade += (target - art.fade) * Math.min(1, dt * 8);
      art.mat.opacity = art.fade;
      // while see-through, stop writing depth so a character behind it is never depth-culled
      // (independent of transparent sort order); restore once fully opaque again
      const dw = art.fade > 0.98;
      if (art.mat.depthWrite !== dw) { art.mat.depthWrite = dw; art.mat.needsUpdate = true; }
    }
    if (!this.groups) return;
    const f = this.basis().f;
    for (const g of this.groups) {
      if (!g.occ) continue;
      const hit = points.some(p => rayHitsBox(p, { x: -f.x, y: -f.y, z: -f.z }, g.occ));
      if (hit) { g.clear = 0.25; if (!g.faded) setFade(g, true); }
      else if (g.faded) { g.clear -= dt; if (g.clear <= 0) setFade(g, false); }
    }
  }
}

/** depth walls for one art piece: ground segments {p0, p1} (Unity x/z) + height covering the image top */
export function artWalls(a, B, out = 0.4) {
  const ppm = a.ppm, uh = Math.hypot(B.u.x, B.u.z);
  if (a.kind === 'ellipse') {
    const left = a.anchor[0] / ppm, right = (a.size[0] - a.anchor[0]) / ppm;
    const A = Math.max(a.a + out, left + 0.15, right + 0.15), Bb = a.b + out, n = 48;
    const ex = { x: B.r.x, z: B.r.z }, ez = { x: B.u.x / uh, z: B.u.z / uh };
    const h = (a.anchor[1] + Bb * uh * ppm + 60) / (B.u.y * ppm);
    const pt = t => ({ x: a.pos[0] + ex.x * A * Math.cos(t) + ez.x * Bb * Math.sin(t), z: a.pos[1] + ex.z * A * Math.cos(t) + ez.z * Bb * Math.sin(t) });
    // only the camera-facing half (sin t < 0): every screen ray then meets the image exactly once,
    // so semi-transparent edge pixels are not blended twice and a faded fountain stays one layer thick
    const walls = []; for (let i = 0; i < n; i++) walls.push({ p0: pt(Math.PI + i / n * Math.PI), p1: pt(Math.PI + (i + 1) / n * Math.PI), h });
    return walls;
  }
  const g = (q) => artImageToGround(a, q[0], q[1], B);
  const F = g(a.F), L = g(a.L), R = g(a.R);
  const fp = artFootprint(a, B), cx = fp.reduce((s, p) => s + p.x, 0) / 4, cz = fp.reduce((s, p) => s + p.z, 0) / 4;
  const normal = (P, Q) => { let nx = -(Q.z - P.z), nz = Q.x - P.x; const m = Math.hypot(nx, nz); nx /= m; nz /= m; if ((P.x - cx) * nx + (P.z - cz) * nz < 0) { nx = -nx; nz = -nz; } return { x: nx, z: nz }; };
  const n1 = normal(F, L), n2 = normal(F, R), k = out / (1 + n1.x * n2.x + n1.z * n2.z);
  const Fo = { x: F.x + (n1.x + n2.x) * k, z: F.z + (n1.z + n2.z) * k };
  // extend each wall until it reaches the image's left / right edge on screen
  const tl = (a.F[0] + 8) / (a.F[0] - a.L[0]), tr = (a.size[0] - a.F[0] + 8) / (a.R[0] - a.F[0]);
  const h = (a.F[1] + 60) / (B.u.y * ppm);
  return [
    { p0: Fo, p1: { x: Fo.x + (L.x - F.x) * tl, z: Fo.z + (L.z - F.z) * tl }, h },
    { p0: Fo, p1: { x: Fo.x + (R.x - F.x) * tr, z: Fo.z + (R.z - F.z) * tr }, h },
  ];
}

function setFade(g, on) {
  g.faded = on;
  for (const m of g.meshes) {
    if (on) {
      if (!m.userData.orig) m.userData.orig = m.material;
      if (!m.userData.fade) { const mk = o => { const f = o.clone(); f.transparent = true; f.opacity = 0.32; f.depthWrite = false; return f; }; const o = m.userData.orig; m.userData.fade = Array.isArray(o) ? o.map(mk) : mk(o); }
      m.material = m.userData.fade; m.castShadow = false;
    } else if (m.userData.orig) { m.material = m.userData.orig; m.castShadow = true; }
  }
}

function rayHitsBox(o, d, occ) {
  const [cx, cy, cz, hw, hd, yaw, h] = occ;
  const a = -yaw * DEG, c = Math.cos(a), s = Math.sin(a);
  const ox = o.x - cx, oy = o.y - (cy + h / 2), oz = o.z - cz;
  const lo = [ox * c + oz * s, oy, -ox * s + oz * c], ld = [d.x * c + d.z * s, d.y, -d.x * s + d.z * c], hh = [hw, h / 2, hd];
  let tmin = 0.05, tmax = 80;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(ld[i]) < 1e-6) { if (Math.abs(lo[i]) > hh[i]) return false; continue; }
    let t1 = (-hh[i] - lo[i]) / ld[i], t2 = (hh[i] - lo[i]) / ld[i]; if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); if (tmin > tmax) return false;
  }
  return true;
}

export function rotYUnity(deg, v) {
  const a = deg * DEG, c = Math.cos(a), s = Math.sin(a);
  return { x: v.x * c + v.z * s, y: v.y, z: -v.x * s + v.z * c };
}

function disposeTree(o) {
  o.traverse(n => { if (n.geometry) n.geometry.dispose(); });
}

// ======================================================================================= sprites
const sheets = new Map();
export async function loadSheet(name) {
  if (sheets.has(name)) return sheets.get(name);
  const meta = await (await fetch("assets/sprites/" + name + ".json")).json();
  const s = { name, meta, tex: tex("assets/sprites/" + name + ".png"), actions: Object.fromEntries(meta.actions.map(a => [a.name, a])) };
  sheets.set(name, s);
  return s;
}
export const sheet = (name) => sheets.get(name);
export function action(sh, name) { return sh.actions[name] || sh.actions.idle; }
export function hitTime(sh, name) { const a = action(sh, name); if (a.hitT != null) return a.hitT; const hf = a.hitFrame >= 0 ? a.hitFrame : Math.floor(a.frames / 2); return hf / Math.max(1, a.fps); }
export function duration(sh, name) { const a = action(sh, name); return a.dur != null ? a.dur : a.frames / Math.max(1, a.fps); }
/** how long an action blocks movement / the next action (its recovery can blend into whatever comes next) */
export function lockTime(sh, name) { const a = action(sh, name); return a.lock != null ? a.lock : duration(sh, name); }
function resolveDir(sh, dir) {
  dir = ((dir % 8) + 8) % 8;
  if (sh.meta.dirMode === "8") return [dir, false];
  return dir <= 4 ? [dir, false] : [8 - dir, true];
}
function frameUV(sh, a, stored, frame) {
  const m = sh.meta, idx = a.start + stored * a.frames + Math.max(0, Math.min(frame, a.frames - 1));
  const col = idx % m.cols, row = Math.floor(idx / m.cols), e = 0.01;
  return [(col * m.frameW + e) / m.texW, ((col + 1) * m.frameW - e) / m.texW, 1 - ((row + 1) * m.frameH - e) / m.texH, 1 - (row * m.frameH + e) / m.texH];
}

const spriteVS = `varying vec2 vUv; uniform float off; void main(){ vUv=uv; vec4 mv = modelViewMatrix*vec4(position,1.0); mv.z += off; gl_Position = projectionMatrix*mv; }`;
const spriteFS = `varying vec2 vUv; uniform sampler2D map; uniform vec3 tint; uniform float flash; uniform float alpha;
void main(){ vec4 c = texture2D(map, vUv); if (c.a < 0.5 || alpha < 0.01) discard; vec3 col = mix(c.rgb*tint, vec3(1.0), flash); gl_FragColor = vec4(col, 1.0);
#include <colorspace_fragment>
}`;
const shadowGeo = new THREE.PlaneGeometry(1, 0.85);
let shadowMat = null;

/** Upright pixel sprite standing on its foot pivot (same maths as the Unity SpriteBody). */
export class SpriteBody {
  constructor(scene, sh, shadowRadius) {
    this.sh = sh; this.action = "idle"; this.dir = 0; this.t = 0; this.speed = 1; this.finished = false; this.flashT = 0; this.visible = true;
    const m = sh.meta, k = 1 / Math.cos(CAM.pitch * DEG);
    const x0 = -m.pivotX / m.ppu, x1 = (m.frameW - m.pivotX) / m.ppu, y0 = -m.pivotY / m.ppu * k, y1 = (m.frameH - m.pivotY) / m.ppu * k;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([x0, y0, 0, x0, y1, 0, x1, y1, 0, x1, y0, 0], 3));
    this.uv = new THREE.Float32BufferAttribute(new Float32Array(8), 2);
    g.setAttribute("uv", this.uv); g.setIndex([0, 2, 1, 0, 3, 2]);
    this.mat = new THREE.ShaderMaterial({ uniforms: { map: { value: sh.tex }, tint: { value: new THREE.Vector3(1, 1, 1) }, flash: { value: 0 }, alpha: { value: 1 }, off: { value: CAM.depthOffset } }, vertexShader: spriteVS, fragmentShader: spriteFS, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.rotation.y = -CAM.yaw * DEG;
    this.mesh.frustumCulled = false;
    if (!shadowMat) shadowMat = new THREE.MeshBasicMaterial({ map: contactShadowTex(), transparent: true, depthWrite: false });
    this.shadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadowSize = shadowRadius * 2.2;
    this.shadow.scale.set(this.shadowSize, this.shadowSize, 1);
    scene.add(this.mesh, this.shadow);
    this.scene = scene;
    this.lastKey = "";
    this.apply(true);
  }
  setSheet(sh) { this.sh = sh; this.mat.uniforms.map.value = sh.tex; this.lastKey = ""; }
  play(name, speed = 1, restart = false) {
    if (!this.sh.actions[name]) name = "idle";
    this.speed = speed;
    if (name === this.action && !restart) return;
    this.action = name; this.t = 0; this.finished = false; this.lastKey = "";
  }
  setDir(d) { this.dir = ((d % 8) + 8) % 8; }
  flash(d) { this.flashT = Math.max(this.flashT, d); }
  setTint(r, g, b) { this.mat.uniforms.tint.value.set(r, g, b); }
  setVisible(v) { this.visible = v; this.mesh.visible = v; this.shadow.visible = v; }
  get time01() { const a = action(this.sh, this.action); return clamp01(this.t * a.fps / a.frames); }
  place(p) { const tp = T(p); this.mesh.position.copy(tp); this.shadow.position.set(tp.x, tp.y + 0.03, tp.z); }
  update(dt) {
    this.t += dt * Math.max(0, this.speed);
    if (this.flashT > 0) this.flashT -= dt;
    this.mat.uniforms.flash.value = this.flashT > 0 ? 0.85 : 0;
    this.apply(false);
  }
  apply(force) {
    const a = action(this.sh, this.action);
    let f = Math.floor(this.t * a.fps);
    if (a.loop) f %= Math.max(1, a.frames); else if (f >= a.frames) { f = a.frames - 1; this.finished = true; }
    const [stored, mirror] = resolveDir(this.sh, this.dir);
    const key = a.name + f + "_" + stored + mirror;
    if (!force && key === this.lastKey) return;
    this.lastKey = key;
    const [u0, u1, v0, v1] = frameUV(this.sh, a, stored, f);
    const L = mirror ? u1 : u0, R = mirror ? u0 : u1;
    this.uv.array.set([L, v0, L, v1, R, v1, R, v0]); this.uv.needsUpdate = true;
  }
  dispose() { this.scene.remove(this.mesh, this.shadow); this.mesh.geometry.dispose(); this.mat.dispose(); }
}

/** Screen direction index (0=S..7=SW) for a Unity-space ground vector. */
export function dirFromWorld(x, z) {
  const y = CAM.yaw * DEG;
  const sx = x * Math.cos(y) - z * Math.sin(y), sy = x * Math.sin(y) + z * Math.cos(y);
  if (sx * sx + sy * sy < 1e-6) return 0;
  const ang = Math.atan2(sx, -sy) / DEG;
  return ((Math.round(ang / 45) % 8) + 8) % 8;
}
export function screenToWorldDir(sx, sy) {
  const y = CAM.yaw * DEG;
  const x = Math.cos(y) * sx + Math.sin(y) * sy, z = -Math.sin(y) * sx + Math.cos(y) * sy;
  const m = Math.hypot(x, z); return m > 1e-6 ? { x: x / m, z: z / m } : { x: 0, z: 0 };
}

// ======================================================================================= lock-on marker shader
const LOCK_FRAG = `
uniform float uT; varying vec2 vUv;
float band(float r, float c, float w) { return exp(-pow((r - c) / w, 2.)); }
void main() {
  float r = length(vUv); if (r > 1.) discard;
  float a = atan(vUv.y, vUv.x), t = uT;
  float pop = 1. + .35 * exp(-t * 9.);                                     // snaps in from a bit larger
  float R = .78 * pop;
  float seg = fract((a + t * .9) / 1.5708);                                  // four turning brackets
  float br = band(r, R, .045) * smoothstep(.04, .1, seg) * smoothstep(.66, .6, seg);
  float ring = band(r, R - .1, .012) * (.45 + .25 * sin(t * 5.));
  float chev = 0.;
  for (int i = 0; i < 4; i++) { float an = float(i) * 1.5708 + .7854 - t * .4; vec2 d = vec2(cos(an), sin(an));
    vec2 q = vec2(dot(vUv, d), dot(vUv, vec2(-d.y, d.x))); float k = q.x - (R + .1) + abs(q.y) * 1.1;
    chev += smoothstep(.03, .0, abs(k)) * step(abs(q.y), .1); }
  float v = br * 1.8 + ring * 1.3 + chev * 1.2 + band(r, R, .12) * .35;
  vec3 col = mix(vec3(.95, .18, .06), vec3(1., .78, .35), clamp(br * .8 + chev * .5, 0., 1.));
  gl_FragColor = vec4(col * 1.25, clamp(v, 0., 1.));
}`;

// ======================================================================================= click marker shader
const CLICK_SIZE = 1.9, CLICK_LIFE = 1.15;
const CLICK_FRAG = `
uniform float uT; varying vec2 vUv;
float band(float r, float c, float w) { return exp(-pow((r - c) / w, 2.)); }
float star(vec2 p, float s) { p = abs(p) / s; return smoothstep(1.05, .75, sqrt(p.x) + sqrt(p.y)); }
float hash(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  float r = length(vUv); if (r > 1.) discard;
  float a = atan(vUv.y, vUv.x), t = uT;
  float fade = smoothstep(${CLICK_LIFE.toFixed(2)}, .55, t) * smoothstep(0., .06, t);
  // outer ring: crisp core + soft glow
  float ring = band(r, .74, .018) * 1.3 + band(r, .74, .07) * .35;
  // thin inner ring and a turning broken arc between them
  float inner = band(r, .5, .012) * .7;
  float arc = band(r, .6, .01) * step(.35, fract(a / 6.2832 * 3. - t * .35)) * .55;
  // four diamond star points on the outer ring (+ small ones between)
  float st = 0.;
  for (int i = 0; i < 4; i++) { float an = float(i) * 1.5708; vec2 c = vec2(cos(an), sin(an)) * .74; st += star(vUv - c, .26); }
  for (int i = 0; i < 4; i++) { float an = float(i) * 1.5708 + .7854; vec2 c = vec2(cos(an), sin(an)) * .74; st += star(vUv - c, .085) * .7; }
  // centre: small dot + a ripple running outward at the start
  float dot = band(r, 0., .07) * .8;
  float rp = clamp(t / .5, 0., 1.); float ripple = band(r, .2 + .8 * rp, .05) * (1. - rp) * .9;
  // twinkles sitting on the ring
  float tw = 0.;
  for (int i = 0; i < 6; i++) { float fi = float(i); float an = hash(fi * 7.1) * 6.2832; float rr = .62 + .3 * hash(fi * 3.3);
    vec2 c = vec2(cos(an), sin(an)) * rr; float ph = sin(t * (5. + 3. * hash(fi)) + fi * 2.1) * .5 + .5;
    tw += star(vUv - c, .07) * ph; }
  float core = clamp(ring * .9 + st, 0., 1.);
  float v = ring + inner + arc + st * 1.2 + dot + ripple + tw * .8;
  // normal blending so the cyan survives on bright paving: deep teal glow, cyan lines, near-white cores
  float glow = band(r, .74, .16) * .35 + ripple * .4;
  vec3 col = mix(vec3(.05, .55, .7), vec3(.3, .95, 1.), clamp(v * 1.4, 0., 1.));
  col = mix(col, vec3(.85, 1., 1.), core * .55) * 1.6;
  gl_FragColor = vec4(col, clamp(v + glow, 0., 1.) * fade);
}`;

// ======================================================================================= effects
export class Fx {
  constructor(scene) {
    this.scene = scene; this.pool = []; this.active = []; this.loaded = false;
  }
  async load() {
    this.meta = await (await fetch("assets/fx/effects.json")).json();
    this.byName = Object.fromEntries(this.meta.effects.map(e => [e.name, e]));
    this.tex = tex("assets/fx/effects.png");
    this.loaded = true;
  }
  get(name) { return this.byName && this.byName[name]; }
  _inst() {
    let f = this.pool.pop();
    if (!f) {
      const g = new THREE.PlaneGeometry(1, 1);
      const m = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
      f = { mesh: new THREE.Mesh(g, m), gen: 0 };
      f.mesh.frustumCulled = false;
      f.mesh.renderOrder = 5;
    }
    f.gen++;
    this.scene.add(f.mesh);
    return f;
  }
  play(name, p, scale = 1, ground = false, color = null, loop = false, life = -1) {
    const e = this.get(name); if (!e) return null;
    const f = this._inst();
    Object.assign(f, { e, t: 0, loop, life, ground, lastFrame: -1, pos: { x: p.x, y: p.y, z: p.z } });
    const s = e.worldSize * scale; f.mesh.scale.set(s, s, 1);
    f.mesh.material.color.setRGB(color ? color[0] : 1, color ? color[1] : 1, color ? color[2] : 1);
    f.mesh.material.opacity = color && color.length > 3 ? color[3] : 1;
    f.mesh.position.copy(T(p));
    this.active.push(f); this._frame(f);
    return f;
  }
  move(f, gen, p) { if (f && f.gen === gen) { f.pos = p; f.mesh.position.copy(T(p)); } }
  release(f, gen) {
    if (!f || (gen !== undefined && f.gen !== gen)) return;
    const i = this.active.indexOf(f); if (i < 0) return;
    this.active.splice(i, 1); this.scene.remove(f.mesh); this.pool.push(f);
  }
  _frame(f) {
    let fr = Math.floor(f.t * f.e.fps); if (f.loop) fr %= f.e.frames;
    if (fr === f.lastFrame) return; f.lastFrame = fr;
    const m = this.meta, idx = f.e.start + Math.min(fr, f.e.frames - 1), col = idx % m.cols, row = Math.floor(idx / m.cols);
    const map = f.mesh.material.map;
    // per-instance UV through geometry
    const uv = f.mesh.geometry.attributes.uv;
    const u0 = (col * m.cell + 0.01) / m.texW, u1 = ((col + 1) * m.cell - 0.01) / m.texW, v1 = 1 - (row * m.cell + 0.01) / m.texH, v0 = 1 - ((row + 1) * m.cell - 0.01) / m.texH;
    uv.array.set([u0, v1, u1, v1, u0, v0, u1, v0]); uv.needsUpdate = true;
  }
  clear() { if (this.lm) this.lm.mesh.visible = false; for (const f of this.active.slice()) this.release(f); if (this.cm) this.cm.mesh.visible = false; }
  /** move-to click marker: a small cyan magic circle (outer ring with four star points, turning inner arcs, a ripple
   *  and twinkles) drawn by one ground-aligned shader quad; only one exists, a new click restarts it */
  /** lock-on ring under the locked monster (called every player update; null hides it): four turning bracket arcs,
   *  a thin pulsing ring and small inward chevrons, warm red-orange so it reads against grass, dirt and paving */
  lockMark(a) {
    if (!a) { if (this.lm) this.lm.mesh.visible = false; return; }
    if (!this.lm) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uT: { value: 0 } }, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv * 2. - 1.; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
        fragmentShader: LOCK_FRAG,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); mesh.rotation.x = -Math.PI / 2; mesh.renderOrder = 6; mesh.frustumCulled = false;
      this.lm = { mesh, a: null, t0: 0 }; this.scene.add(mesh);
    }
    const L = this.lm; if (L.a !== a) { L.a = a; L.t0 = performance.now(); }
    const s = Math.max(1.3, a.radius * 2.6 + 0.5);
    L.mesh.visible = true; L.mesh.position.set(a.pos.x, a.pos.y + 0.05, -a.pos.z); L.mesh.scale.set(s, s, 1);
    L.mesh.material.uniforms.uT.value = (performance.now() - L.t0) / 1000;
  }
  clickMark(p) {
    if (!this.cm) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uT: { value: 0 } }, transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv * 2. - 1.; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
        fragmentShader: CLICK_FRAG,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      mesh.rotation.x = -Math.PI / 2; mesh.renderOrder = 6; mesh.frustumCulled = false;
      this.cm = { mesh, t: 9 };
    }
    const c = this.cm; c.t = 0; c.mesh.position.set(p.x, p.y + 0.04, -p.z); c.mesh.visible = true;
    if (!c.mesh.parent) this.scene.add(c.mesh);
  }
  update(dt, camera) {
    if (this.cm && this.cm.mesh.visible) {
      const c = this.cm; c.t += dt; c.mesh.material.uniforms.uT.value = c.t;
      const k = Math.min(1, c.t / 0.22), s = CLICK_SIZE * (0.62 + 0.38 * (1 - Math.pow(1 - k, 3)));
      c.mesh.scale.set(s, s, 1); c.mesh.rotation.z = c.t * 0.9;
      if (c.t > CLICK_LIFE) c.mesh.visible = false;
    }
    for (const f of this.active.slice()) {
      f.t += dt;
      if (f.ground) { f.mesh.rotation.set(-Math.PI / 2, 0, -CAM.yaw * DEG); }
      else f.mesh.quaternion.copy(camera.quaternion);
      const done = f.loop ? (f.life >= 0 && f.t >= f.life) : f.t * f.e.fps >= f.e.frames;
      if (done) { this.release(f); continue; }
      this._frame(f);
    }
  }
}

// ======================================================================================= telegraphs (ground meshes from HitShapes)
export function shapeGeometry(shape, geo, progress, lift) {
  const pos = [], idx = [];
  const fwd = { x: shape.fx, z: shape.fz }, right = { x: shape.fz, z: -shape.fx };
  const G = (x, z) => { pos.push(x, geo.height(x, z) + lift, -z); return pos.length / 3 - 1; };
  const fan = (r0, r1, a0, a1, seg) => {
    for (let i = 0; i < seg; i++) {
      const t0 = (a0 + (a1 - a0) * i / seg) * DEG, t1 = (a0 + (a1 - a0) * (i + 1) / seg) * DEG;
      const d0 = { x: fwd.x * Math.cos(t0) + right.x * Math.sin(t0), z: fwd.z * Math.cos(t0) + right.z * Math.sin(t0) };
      const d1 = { x: fwd.x * Math.cos(t1) + right.x * Math.sin(t1), z: fwd.z * Math.cos(t1) + right.z * Math.sin(t1) };
      const a = G(shape.cx + d0.x * r0, shape.cz + d0.z * r0), b = G(shape.cx + d0.x * r1, shape.cz + d0.z * r1), c = G(shape.cx + d1.x * r1, shape.cz + d1.z * r1), d = G(shape.cx + d1.x * r0, shape.cz + d1.z * r0);
      idx.push(a, b, c, a, c, d);
    }
  };
  switch (shape.kind) {
    case "circle": fan(0, shape.r * progress, -180, 180, 40); break;
    case "ring": fan(shape.inner, shape.inner + (shape.r - shape.inner) * progress, -180, 180, 48); break;
    case "cone": fan(0, shape.r * progress, -shape.half, shape.half, 24); break;
    case "rect": {
      const L = shape.len * progress, hw = shape.hw;
      const ax = shape.cx - right.x * hw, az = shape.cz - right.z * hw, bx = shape.cx + right.x * hw, bz = shape.cz + right.z * hw;
      const a = G(ax, az), b = G(ax + fwd.x * L, az + fwd.z * L), c = G(bx + fwd.x * L, bz + fwd.z * L), d = G(bx, bz);
      idx.push(a, b, c, a, c, d); break;
    }
  }
  return { pos, idx };
}
export function edgeGeometry(shape, geo, lift) {
  if (shape.kind === "rect") return null;
  const s2 = Object.assign(Object.create(Object.getPrototypeOf(shape)), shape);
  if (shape.kind === "ring") return null;
  const outer = { ...shape };
  const fwd = { x: shape.fx, z: shape.fz }, right = { x: shape.fz, z: -shape.fx };
  const pos = [], idx = [];
  const G = (x, z) => { pos.push(x, geo.height(x, z) + lift, -z); return pos.length / 3 - 1; };
  const a0 = shape.kind === "cone" ? -shape.half : -180, a1 = shape.kind === "cone" ? shape.half : 180, seg = 40;
  for (let i = 0; i < seg; i++) {
    const t0 = (a0 + (a1 - a0) * i / seg) * DEG, t1 = (a0 + (a1 - a0) * (i + 1) / seg) * DEG;
    const d0 = { x: fwd.x * Math.cos(t0) + right.x * Math.sin(t0), z: fwd.z * Math.cos(t0) + right.z * Math.sin(t0) };
    const d1 = { x: fwd.x * Math.cos(t1) + right.x * Math.sin(t1), z: fwd.z * Math.cos(t1) + right.z * Math.sin(t1) };
    const r0 = shape.r - 0.12, r1 = shape.r;
    const a = G(shape.cx + d0.x * r0, shape.cz + d0.z * r0), b = G(shape.cx + d0.x * r1, shape.cz + d0.z * r1), c = G(shape.cx + d1.x * r1, shape.cz + d1.z * r1), d = G(shape.cx + d1.x * r0, shape.cz + d1.z * r0);
    idx.push(a, b, c, a, c, d);
  }
  return { pos, idx };
}

// ---------------------------------------------------------------- attack warning / ground zone (painted magic decal)
// One mesh per telegraph: the shape is built once with local coordinates (aL = radius 0..1 + angle / lateral -1..1),
// the shader draws a soft inner gradient, a thin bright rim with an outer glow, a slowly turning rune ring, twinkling
// motes, a fill that sweeps out with the wind-up and pulses faster near the hit; persistent zones (poison) get rising
// bubbles instead of the sweep. Progress / time are uniforms: no geometry rebuild per frame.
export const TG_TIME = { value: 0 };
const TG_VS = `attribute vec2 aL; varying vec2 vL; varying vec2 vW;
void main(){ vL = aL; vec4 w = modelMatrix * vec4(position, 1.0); vW = vec2(w.x, -w.z); gl_Position = projectionMatrix * viewMatrix * w; }`;
const TG_FS = `uniform float uP, uKind, uHalf, uR, uR0, uLen, uHW, uPersist, uAlpha; uniform float uT; uniform vec3 uCol, uRim;
varying vec2 vL; varying vec2 vW;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
void main(){
  float r = vL.x, a = vL.y, e;
  if (uKind < 0.5) e = (1. - r) * uR;                                                             // circle
  else if (uKind < 1.5) e = min((1. - r) * uR, (1. - abs(a)) * uHalf * max(r, .02) * uR);          // cone
  else if (uKind < 2.5) e = min(min((1. - r) * uLen, r * uLen), (1. - abs(a)) * uHW);              // rect (r = along)
  else e = min(r, 1. - r) * (uR - uR0);                                                          // ring
  float t = uT, rr = clamp(r, 0., 1.);
  if (e < 0.) {                                                                                  // soft outer glow skirt
    float og = exp(e * 7.) * (.42 + .1 * sin(t * 3.)); gl_FragColor = vec4(mix(uCol, uRim, .55), og * uAlpha);
    #include <colorspace_fragment>
    return; }
  float rim = smoothstep(.07, .015, e), glow = exp(-e * 4.);
  // rune ring: dashes just inside the rim, slowly turning
  float runeBand = smoothstep(.0, .04, e - .2) * smoothstep(.1, .04, e - .2);
  float dash = step(.5, fract((uKind < 1.5 ? a * (uKind < .5 ? 16. : 7.) : r * uLen * .9) - t * .1));
  float rune = runeBand * dash;
  vec3 col; float al;
  if (uPersist < .5) {
    // attack: saturated coral fill that thickens toward the edge, a bright leading wave sweeping out with the wind-up
    float fill = mix(.34, .60, pow(rr, 1.4));
    float front = smoothstep(uP - .10, uP, rr) * smoothstep(uP + .015, uP, rr);
    float done = smoothstep(uP, uP - .02, rr) * .22;
    float pulse = uP * uP * (.5 + .5 * sin(t * (6. + 16. * uP))) * .18;
    vec2 g = vW * 1.6, c = floor(g), f = fract(g) - .5; float rnd = h21(c);
    float mote = smoothstep(.07, .0, length(f - vec2(h21(c + 7.) - .5, fract(h21(c + 3.) - t * .4) - .5) * .7)) * step(.75, rnd) * (.5 + .5 * sin(t * 5. + rnd * 30.));
    al = fill + done + pulse + front * .45 + glow * .35 + rim * .95 + rune * .4 + mote * .5;
    col = mix(uCol * (.8 + .25 * rr), uRim, clamp(rim + front * .8 + glow * .2 + mote + rune * .55, 0., 1.));
  } else if (uPersist > 1.5) {
    // sealing magic circle: double outer ring, turning rune band, inner hexagram, faint centre glow
    float R = uR, d = r * R, th = a * 3.14159265;
    float ring1 = smoothstep(.05, .0, abs(d - R + .06)), ring2 = smoothstep(.035, .0, abs(d - R + .42)), ring3 = smoothstep(.03, .0, abs(d - R * .52));
    float band = step(R - .38, d) * step(d, R - .1);
    float ru = band * step(.62, fract((th + t * .25) / 6.2831853 * 28.)) * smoothstep(.0, .05, abs(fract((d - R + .38) / .28 * 2.) - .5) - .08);
    float hex = 0.; for (int k = 0; k < 6; k++) { float ang = float(k) * 1.0471976 + t * -.12; vec2 n = vec2(cos(ang), sin(ang));
      vec2 pp = vec2(cos(th), sin(th)) * d; hex = max(hex, smoothstep(.035, .0, abs(dot(pp, n) - R * .26)) * step(d, R * .52 + .02)); }
    float centre = exp(-d * 1.4) * .25, beat = .8 + .2 * sin(t * 2.2);
    float m = max(max(ring1, ring2 * .85), max(ring3 * .8, max(ru * .9, hex * .75)));
    al = (m + centre + glow * .25) * beat;
    col = mix(uCol, uRim, clamp(m + centre, 0., 1.));
  } else {
    // persistent pool: deeper violet liquid, slow swirl pattern, lavender rim, rising bubbles, slow pulse
    float sw = vn(vW * 1.3 + vec2(sin(t * .3), cos(t * .25)) * 1.5 + vn(vW * .7 - t * .1) * 2.);
    float fill = mix(.42, .58, pow(rr, 2.)) * (.85 + .15 * sin(t * 1.6));
    vec3 deep = uCol * vec3(.62, .5, .78);
    vec2 g = vW * 1.8, c = floor(g), f = fract(g) - .5; float rnd = h21(c);
    vec2 o = vec2(h21(c + 7.) - .5, h21(c + 3.) - .5) * .55;
    float ph = fract(t * (.35 + rnd * .3) + rnd), br = .06 + ph * .14, d = length(f - o), on = step(.5, rnd) * smoothstep(.12, .3, e);
    float bub = smoothstep(.028, .0, abs(d - br)) * (1. - ph) * on, core = smoothstep(br * .6, .0, d) * (1. - ph) * on;
    al = fill + glow * .3 + rim * .9 + rune * .3 + bub * .6 + core * .25;
    col = mix(deep, uCol * 1.15, smoothstep(.45, .75, sw) * .6);
    col = mix(col, uRim, clamp(rim + glow * .3 + bub * .9 + core * .5 + rune * .4, 0., 1.));
  }
  gl_FragColor = vec4(col, clamp(al, 0., 1.) * uAlpha);
  #include <colorspace_fragment>
}`;
const SKIRT = 0.45;   // m of soft glow outside the hit edge (visual only)
function tgGeometry(shape, geo, lift = 0.05) {
  const pos = [], L = [], idx = [];
  const fwd = { x: shape.fx, z: shape.fz }, right = { x: shape.fz, z: -shape.fx };
  const V = (x, z, l0, l1) => { pos.push(x, geo.height(x, z) + lift, -z); L.push(l0, l1); return pos.length / 3 - 1; };
  const grid = (nu, nv, at) => {          // at(u, v) -> [x, z, l0, l1]
    const base = pos.length / 3;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) V(...at(i / nu, j / nv));
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = base + j * (nu + 1) + i, b = a + 1, c = a + nu + 2, d = a + nu + 1; idx.push(a, b, c, a, c, d); }
  };
  const polar = (r0, r1, a0, a1, half) => grid(48, 8, (u, v) => {
    const t = (a0 + (a1 - a0) * u) * DEG, rr = r0 + (r1 - r0) * v, dx = fwd.x * Math.cos(t) + right.x * Math.sin(t), dz = fwd.z * Math.cos(t) + right.z * Math.sin(t);
    return [shape.cx + dx * rr, shape.cz + dz * rr, shape.kind === 'ring' ? v : rr / shape.r, half ? (a0 + (a1 - a0) * u) / half : (u * 2 - 1)];
  });
  switch (shape.kind) {
    case 'circle': polar(0, shape.r + SKIRT, -180, 180, 0); break;
    case 'ring': polar(shape.inner, shape.r, -180, 180, 0); break;
    case 'cone': polar(0, shape.r + SKIRT, -shape.half, shape.half, shape.half); break;
    case 'rect': grid(4, 12, (u, v) => { const lat = (u * 2 - 1) * shape.hw, al = v * shape.len;
      return [shape.cx + right.x * lat + fwd.x * al, shape.cz + right.z * lat + fwd.z * al, v, u * 2 - 1]; }); break;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aL', new THREE.Float32BufferAttribute(L, 2)); g.setIndex(idx);
  return g;
}
export class TelegraphView {
  constructor(scene, shape, geo, color, persistent = false, seal = false) {
    this.scene = scene; this.shape = shape; this.geo = geo; this.persistent = persistent;
    // attacks: warm coral / red; zones keep their own hue (poison violet)
    const base = persistent ? new THREE.Color(...color) : new THREE.Color(1.0, 0.24, 0.16);
    const rim = persistent ? new THREE.Color(0.88, 0.76, 1.0) : new THREE.Color(1.0, 0.86, 0.6);
    const kind = { circle: 0, cone: 1, rect: 2, ring: 3 }[shape.kind] ?? 0;
    this.u = { uP: { value: persistent ? 1 : 0 }, uT: TG_TIME, uKind: { value: kind }, uHalf: { value: (shape.half || 0) * DEG }, uR: { value: shape.r || 1 }, uR0: { value: shape.inner || 0 },
      uLen: { value: shape.len || 1 }, uHW: { value: shape.hw || 1 }, uPersist: { value: seal ? 2 : persistent ? 1 : 0 }, uAlpha: { value: 1 }, uCol: { value: base }, uRim: { value: rim } };
    this.mesh = new THREE.Mesh(tgGeometry(shape, geo), new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: TG_VS, fragmentShader: TG_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.mesh.renderOrder = persistent ? 2 : 3; this.mesh.frustumCulled = false; scene.add(this.mesh);
  }
  setProgress(p) { this.u.uP.value = p; }
  dispose() { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

// ---------------------------------------------------------------- painterly character / creature shading
// Chained onto a lit material (Standard or Lambert): soft 3-tone banding from the sun direction, shadows tinted
// violet-blue instead of grey, warm reddish occlusion on down-facing surfaces, light saturation lift and a fresnel
// rim. o = { rim: [r,g,b], rimK, sat } — the player gets a warm, slightly stronger rim so it reads over the floor.
export function paintMat(m, o = {}) {
  const rim = o.rim || [0.75, 0.62, 1.0], rk = (o.rimK ?? 0.22).toFixed(3), sat = (o.sat ?? 1.08).toFixed(3);
  // o.soft (characters, 2026-11-14): wide band transitions (soft cartoon volume instead of hard toon edges), the darkest
  // shade lifted a little, lighter occlusion underneath - only the player / NPC bodies use it (monsters, landmarks keep theirs)
  const soft = !!o.soft, B = soft ? ['-.32, .32', '.2, .8', '.6', '.4'] : ['-.08, .08', '.42, .55', '.55', '.45'];
  const shade = soft ? 'vec3(.88, .86, 1.0), vec3(1.03, 1.0, .96)' : 'vec3(.80, .78, 1.0), vec3(1.05, 1.0, .94)', occ = soft ? 'vec3(.94, .88, .9)' : 'vec3(.9, .82, .84)';
  if (m.isMeshStandardMaterial) { m.roughness = Math.max(m.roughness ?? 1, 0.85); m.metalness = 0; }
  const prev = m.onBeforeCompile, key = m.customProgramCacheKey ? m.customProgramCacheKey() : '';
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `{
  vec3 vN = normalize(normal), vV = normalize(vViewPosition);
  vec3 wN = normalize((vec4(vN, 0.) * viewMatrix).xyz);
  float band = .5;
  #if NUM_DIR_LIGHTS > 0
    float nl = dot(vN, directionalLights[0].direction); band = smoothstep(${B[0]}, nl) * ${B[2]} + smoothstep(${B[1]}, nl) * ${B[3]};
  #endif
  float L = dot(outgoingLight, vec3(.299, .587, .114));
  outgoingLight *= mix(${shade}, band);                 // cool violet shade, warm light
  outgoingLight *= mix(${occ}, vec3(1.), smoothstep(-.75, .1, wN.y));         // warm occlusion underneath (softer 2026-11-13: no dark blotch under chins)
  outgoingLight = mix(vec3(dot(outgoingLight, vec3(.299, .587, .114))), outgoingLight, ${sat});
  float fr = pow(1. - clamp(dot(vN, vV), 0., 1.), 3.);
  outgoingLight += vec3(${rim.map(v => v.toFixed(3)).join(', ')}) * fr * ${rk} * (.4 + .6 * smoothstep(-.2, .6, wN.y));
}
#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => key + '|paint' + rk + sat + rim.join(',') + (soft ? 's' : '');
  m.needsUpdate = true; return m;
}

// ---------------------------------------------------------------- thin toon outline (inverted hull, 2026-11-13; 2026-11-14 softened)
// A back-face copy of the mesh pushed out along its normals in screen space. 2026-11-14 (사용자: '스티커처럼 보임'): the
// first version (1.5 px, one near-black violet for everything) drew a dark line round every hair strand, glove and fold
// and clumped into a dark blob at play size. Now:
//  - colour = the mesh's OWN texture / colour darkened (OUTLINE.k), so the edge reads as a darker shade of the local
//    material (dark brown hair edge, dark teal jacket edge), never a black ink line;
//  - width OUTLINE.px (0.6 px at 720 px screen height, 60% thinner) scaled by how big the object is on screen: below
//    OUTLINE.small (NDC per metre) it shrinks to OUTLINE.minK of that - at the real game camera a character's edge is
//    sub-pixel, so nothing clumps; only close-ups (portrait-like zoom) get a visible soft edge.
// Shares the geometry (and skeleton for skinned meshes): +1 draw call per outlined mesh, no new textures. px 0 = off.
export const OUTLINE = { px: 0.6, k: 0.5, small: [0.25, 0.65], minK: 0.2 };
const _outlineMats = new Map();
export function outlineMat(skinned, src, px = OUTLINE.px) {
  const map = src && src.map || null, col = src && src.color ? src.color.clone() : new THREE.Color(0.55, 0.42, 0.34);
  const key = (skinned ? 's' : 'm') + px + '|' + (map ? map.uuid : col.getHexString());
  if (_outlineMats.has(key)) return _outlineMats.get(key);
  const k = OUTLINE.k, m = new THREE.MeshBasicMaterial({ map, color: map ? new THREE.Color(k, k * 0.9, k * 0.86) : col.multiplyScalar(k), side: THREE.BackSide, fog: false });
  const w = (px / 360).toFixed(5), s0 = OUTLINE.small[0].toFixed(3), s1 = OUTLINE.small[1].toFixed(3), mk = OUTLINE.minK.toFixed(3);   // NDC units: 2 / 720 per px
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  {
  #ifdef USE_SKINNING
    vec3 oN = objectNormal;
  #else
    vec3 oN = normal;
  #endif
    vec4 cN = projectionMatrix * modelViewMatrix * vec4(oN, 0.0);
    vec2 d = cN.xy; float l = length(d);
    float npm = projectionMatrix[1][1] / max(gl_Position.w, 1e-3);          // NDC height of one metre at this depth
    float sz = mix(${mk}, 1.0, smoothstep(${s0}, ${s1}, npm));
    if (l > 1e-5) gl_Position.xy += d / l * ${w} * sz * gl_Position.w;
  }`);
  };
  m.customProgramCacheKey = () => 'outline2' + key;
  _outlineMats.set(key, m); return m;
}
/** add an outline hull to a mesh (Mesh or SkinnedMesh); returns the hull (child of the mesh, identity transform) */
export function addOutline(mesh, px = OUTLINE.px) {
  if (!px || !mesh || !mesh.geometry || !mesh.geometry.attributes.normal) return null;
  const src = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  let o;
  if (mesh.isSkinnedMesh) { o = new THREE.SkinnedMesh(mesh.geometry, outlineMat(true, src, px)); o.bind(mesh.skeleton, mesh.bindMatrix); o.bindMode = mesh.bindMode; }
  else o = new THREE.Mesh(mesh.geometry, outlineMat(false, src, px));
  // child of the mesh with an identity transform: follows it everywhere (a skinned hull in 'attached' mode lands on the
  // same bones whatever its own transform is)
  o.castShadow = false; o.receiveShadow = false; o.frustumCulled = mesh.frustumCulled; o.userData.outline = true; o.renderOrder = mesh.renderOrder;
  mesh.add(o);
  mesh.userData.outlineHull = o;
  return o;
}

// soft contact shadow under characters (grounding): smooth radial falloff, deep violet instead of black
let _contactTex = null;
export function contactShadowTex() {
  if (_contactTex) return _contactTex;
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(40,26,60,0.42)'); g.addColorStop(0.45, 'rgba(44,30,66,0.26)'); g.addColorStop(0.8, 'rgba(48,34,74,0.07)');   // lighter (2026-11-13): the sun shadow also falls here - no double-dark blob g.addColorStop(1, 'rgba(44,30,70,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  _contactTex = new THREE.CanvasTexture(c); _contactTex.colorSpace = THREE.SRGBColorSpace; return _contactTex;
}

export { THREE };
