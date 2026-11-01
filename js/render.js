// Rendering: three.js scene, zone meshes, upright pixel sprites, effects, telegraphs, camera, occlusion.
// Logic uses Unity coordinates (x east, y up, z north). three.js is right-handed -> z is mirrored here.
import { Post } from './post.js';
import * as THREE from 'three';
import { clamp01, DEG, artBasis, artWorldToImage, artImageToGround, artFootprint } from './core.js';

export const T = (p) => new THREE.Vector3(p.x, p.y, -p.z);
export const CAM = { pitch: 38, yaw: 45, dist: 30, ortho: 5.2, minWidth: 12, sharp: 12, lookAhead: 0.6, depthOffset: 0.6 };

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
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.3, 120);
    this.focus = new THREE.Vector3(); this.focusU = { x: 0, y: 0, z: 0 };
    this.sun = new THREE.DirectionalLight(0xffffff, 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -24; sc.right = 24; sc.top = 24; sc.bottom = -24; sc.near = 1; sc.far = 100;
    this.sun.shadow.bias = -0.0008; this.sun.shadow.normalBias = 0.03;
    this.hemi = new THREE.HemisphereLight(0xaab4c0, 0x707880, 2.2);
    this.scene.add(this.sun, this.sun.target, this.hemi);
    this.lightFrom = rotYUnity(CAM.yaw, { x: -0.55, y: 0.85, z: -0.45 });
    this.shake = 0; this.shakeT = 0; this.shakeScale = 0.7;
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
    this.cam.left = -this.ortho * aspect; this.cam.right = this.ortho * aspect; this.cam.top = this.ortho; this.cam.bottom = -this.ortho;
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
  addShake(a, d) { if (this.shakeScale <= 0) return; this.shake = Math.max(this.shake, a * this.shakeScale); this.shakeT = Math.max(this.shakeT, d); }
  render(dt) {
    const b = this.basis();
    let sx = 0, sy = 0;
    if (this.shakeT > 0) { this.shakeT -= dt; const a = this.shake * clamp01(this.shakeT / 0.25); sx = (Math.random() * 2 - 1) * a; sy = (Math.random() * 2 - 1) * a; if (this.shakeT <= 0) this.shake = 0; }
    const f = this.focusU;
    const pos = { x: f.x - b.f.x * CAM.dist + b.r.x * sx + b.u.x * sy, y: f.y - b.f.y * CAM.dist + b.u.y * sy, z: f.z - b.f.z * CAM.dist + b.r.z * sx + b.u.z * sy };
    this.cam.position.copy(T(pos));
    this.cam.lookAt(T({ x: pos.x + b.f.x, y: pos.y + b.f.y, z: pos.z + b.f.z }));
    const lf = this.lightFrom;
    this.sun.target.position.copy(T(f));
    this.sun.position.copy(T({ x: f.x + lf.x * 40, y: f.y + lf.y * 40, z: f.z + lf.z * 40 }));
    for (const w of this.waterTex || []) { w.offset.x = performance.now() * 0.00003; w.offset.y = performance.now() * 0.00002; }
    if (this.post) this.post.render(this.scene, this.cam); else this.r.render(this.scene, this.cam);
  }
  /** screen pixel -> Unity-space ray */
  screenRay(px, py) {
    const b = this.basis();
    const w = window.innerWidth, h = window.innerHeight;
    const nx = (px / w) * 2 - 1, ny = 1 - (py / h) * 2;
    const camPos = T(this.cam.position); // back to unity (T is its own inverse for positions)
    const ox = nx * this.ortho * this.aspect, oy = ny * this.ortho;
    return { o: { x: camPos.x + b.r.x * ox + b.u.x * oy, y: camPos.y + b.u.y * oy, z: camPos.z + b.r.z * ox + b.u.z * oy }, d: b.f };
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
      const mesh = new THREE.Mesh(g, mat);
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
    const B = artBasis(CAM.pitch, CAM.yaw), maxAniso = this.r.capabilities.getMaxAnisotropy();
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
      if (!m.userData.fade) { const f = m.userData.orig.clone(); f.transparent = true; f.opacity = 0.32; f.depthWrite = false; m.userData.fade = f; }
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
export function hitTime(sh, name) { const a = action(sh, name); const hf = a.hitFrame >= 0 ? a.hitFrame : Math.floor(a.frames / 2); return hf / Math.max(1, a.fps); }
export function duration(sh, name) { const a = action(sh, name); return a.frames / Math.max(1, a.fps); }
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
    if (!shadowMat) shadowMat = new THREE.MeshBasicMaterial({ map: tex("assets/ui/shadow.png"), transparent: true, depthWrite: false });
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
  clear() { for (const f of this.active.slice()) this.release(f); }
  update(dt, camera) {
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

export class TelegraphView {
  constructor(scene, shape, geo, color, persistent = false) {
    this.scene = scene; this.shape = shape; this.geo = geo; this.persistent = persistent;
    const mk = (op, order) => { const m = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: new THREE.Color(...color), transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide })); m.renderOrder = order; m.frustumCulled = false; scene.add(m); return m; };
    this.area = mk(0.3, 2); this.fill = mk(persistent ? 0.4 : 0.45, 3);
    this.edge = mk(1, 4); this.edge.material.color.setRGB(Math.min(1, color[0] + 0.1), Math.min(1, color[1] + 0.45), Math.min(1, color[2] + 0.25));
    this.set(this.area, shapeGeometry(shape, geo, 1, 0.04));
    const e = edgeGeometry(shape, geo, 0.055); if (e) this.set(this.edge, e);
    this.setProgress(persistent ? 1 : 0);
  }
  set(mesh, g) { mesh.geometry.dispose(); const bg = new THREE.BufferGeometry(); bg.setAttribute("position", new THREE.Float32BufferAttribute(g.pos, 3)); bg.setIndex(g.idx); mesh.geometry = bg; }
  setProgress(p) { this.set(this.fill, shapeGeometry(this.shape, this.geo, p, 0.05)); this.fill.material.opacity = 0.35 + 0.25 * p; }
  dispose() { for (const m of [this.area, this.fill, this.edge]) { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); } }
}

export { THREE };
