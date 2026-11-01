// Storybook forest renderer (zones with def.nature): replaces the C# builder's flat ground, cone trees and box props with
//  * a splat-blended ground (sunlit grass / shaded grass / dirt / moss) driven by a mask painted from the zone's own
//    path + patch data (smooth curves, varying width, grass breaking into the path edge) - the walkable path IS the drawn path
//  * Tripo-made, hand-painted trees / shrubs / rocks / stumps / ruins / mushrooms, instanced per model and per 16 m chunk
//  * camera-facing grass and flower cards (instanced, wind sway, alpha-to-coverage), placed by deterministic rules
//  * see-through dithering of anything standing between the camera and the player
// Collision is NOT decided here: trees / rocks / stumps keep their footprints in zones.json (core.js propFootprint),
// shrubs / flowers / grass are decoration. Layout comes from tools/forest/layout.py.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { T, CAM } from './render.js';

const BASE = 'assets/forest/';
const DEG = Math.PI / 180;
// real-world height (m) at scale 1, and how the footprint centre is found (trunk = centre of the lowest slice)
const MODELS = {
  tree_a: { h: 5.4, trunk: true, dither: true, tint: [0.74, 0.95, 0.7] }, tree_b: { h: 6.3, trunk: true, dither: true, tint: [0.95, 1.0, 0.95] },
  tree_c: { h: 5.3, trunk: true, dither: true, tint: [0.9, 1.0, 0.88] }, tree_d: { h: 5.0, trunk: true, dither: true, tint: [0.64, 0.92, 0.6] },
  bush_a: { h: 1.1, tint: [0.72, 0.95, 0.68] }, bush_b: { h: 0.95, tint: [0.88, 1.0, 0.85] }, rock_a: { h: 1.4, dither: true }, rock_b: { h: 0.8 },
  stump: { h: 0.75 }, ruin: { h: 2.3, dither: true }, mushroom: { h: 1.0 },
};
const TYPE_MODEL = { tree: ['tree_a', 'tree_c', 'tree_d'], pine: ['tree_b'], shrub: ['bush_a', 'bush_b'], bush: ['bush_a', 'bush_b'], rock: ['rock_a', 'rock_b'], stump: ['stump'], ruin: ['ruin'], mushroom: ['mushroom'] };
const CHUNK = 16;

function hash(n) { n = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); n ^= n >>> 13; n = Math.imul(n, 0xc2b2ae35); n ^= n >>> 16; return (n >>> 0) / 4294967296; }
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------- model loading (GLB wrapped as base64 JSON)
const modelCache = new Map();
function loadModel(name, aniso) {
  if (modelCache.has(name)) return modelCache.get(name);
  const p = (async () => {
    const j = await (await fetch(BASE + 'models/' + name + '.glb.json')).json();
    const raw = atob(j.b64), u8 = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
    const gltf = await new Promise((res, rej) => new GLTFLoader().parse(u8.buffer, '', res, rej));
    const geos = []; let mat = null;
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(o => {
      if (!o.isMesh) return;
      const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld);
      for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a);
      geos.push(g); mat = mat || o.material;
    });
    const geo = geos.length > 1 ? mergeGeometries(geos) : geos[0];
    // normalise: base on y=0, footprint centre at the origin, height 1
    geo.computeBoundingBox(); const bb = geo.boundingBox, H = bb.max.y - bb.min.y;
    let cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
    if (MODELS[name].trunk) {               // trunk: average of the vertices in the lowest 6 % (roots included, canopy excluded)
      const pa = geo.attributes.position; let sx = 0, sz = 0, n = 0;
      for (let i = 0; i < pa.count; i++) if (pa.getY(i) < bb.min.y + H * 0.06) { sx += pa.getX(i); sz += pa.getZ(i); n++; }
      if (n) { cx = sx / n; cz = sz / n; }
    }
    geo.translate(-cx, -bb.min.y, -cz); geo.scale(1 / H, 1 / H, 1 / H);
    const xf = { cx, cz, y0: bb.min.y, H };
    const m = new THREE.MeshStandardMaterial({ map: mat.map, roughness: 1, metalness: 0, side: THREE.FrontSide });
    if (m.map) { m.map.anisotropy = aniso; m.map.colorSpace = THREE.SRGBColorSpace; }
    return { geo, mat: m, xf };
  })();
  modelCache.set(name, p); return p;
}
// aggressively simplified copy for the shadow-map pass only (same normalisation as the visible mesh)
async function loadShadowLod(name, hi) {
  try {
    const r = await fetch(BASE + 'models/' + name + '_lo.glb.json'); if (!r.ok) return null;
    const j = await r.json(); const raw = atob(j.b64), u8 = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
    const gltf = await new Promise((res, rej) => new GLTFLoader().parse(u8.buffer, '', res, rej));
    const geos = []; gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(o => { if (o.isMesh) { const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); for (const a of Object.keys(g.attributes)) if (a !== 'position') g.deleteAttribute(a); geos.push(g); } });
    const geo = geos.length > 1 ? mergeGeometries(geos) : geos[0];
    geo.translate(-hi.xf.cx, -hi.xf.y0, -hi.xf.cz); geo.scale(1 / hi.xf.H, 1 / hi.xf.H, 1 / hi.xf.H);
    return geo;
  } catch (e) { return null; }
}
const SHADOW_ONLY = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false });

// ---------------------------------------------------------------- see-through dithering (shared uniforms)
const DITHER = { uPlayerPx: { value: new THREE.Vector2(-1e4, -1e4) }, uPlayerZ: { value: 0 }, uRad: { value: new THREE.Vector2(80, 120) } };
function addDither(mat) {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, DITHER);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vViewZ;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvViewZ = mvPosition.z;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying float vViewZ; uniform vec2 uPlayerPx; uniform float uPlayerZ; uniform vec2 uRad;
float bayer4(vec2 p){ int x = int(mod(p.x,4.)), y = int(mod(p.y,4.)); int i = x + y*4;
  int b[16] = int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5); return (float(b[i]) + .5) / 16.; }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
{ vec2 d = (gl_FragCoord.xy - uPlayerPx) / uRad; float r = length(d);
  float inFront = smoothstep(0.2, 0.9, vViewZ - uPlayerZ);
  float fade = (1. - smoothstep(0.65, 1.0, r)) * inFront;
  if (fade > 0.01 && bayer4(gl_FragCoord.xy) < fade * 0.82) discard; }`);
  };
  mat.customProgramCacheKey = () => 'dither1';
}

// ---------------------------------------------------------------- ground
const GROUND_VS = `varying vec2 vW;`;
function groundMaterial(tex, maskTex, bounds) {
  const m = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
  const U = {
    tSun: { value: tex.grass_sun }, tShade: { value: tex.grass_shade }, tDirt: { value: tex.dirt }, tMoss: { value: tex.moss }, tMask: { value: maskTex },
    uB: { value: new THREE.Vector4(bounds[0], bounds[1], bounds[2] - bounds[0], bounds[3] - bounds[1]) },
  };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + GROUND_VS)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvec4 wpG = modelMatrix * vec4(transformed, 1.0); vW = vec2(wpG.x, -wpG.z);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec2 vW; uniform sampler2D tSun, tShade, tDirt, tMoss, tMask; uniform vec4 uB;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ return vn(p)*.5 + vn(p*2.03+7.1)*.25 + vn(p*4.11+3.3)*.125 + vn(p*8.3+1.7)*.0625; }
// anti-tiling: two lookups at different scale / rotation, blended by low-frequency noise
vec3 tri(sampler2D t, vec2 w, float s){ vec2 a = w / s; vec2 b = mat2(.8,-.6,.6,.8) * w / (s*1.37) + vec2(.31,.77);
  float k = smoothstep(.3, .7, vn(w * .06)); return mix(texture2D(t, a).rgb, texture2D(t, b).rgb, k); }
`).replace('#include <map_fragment>', `
vec2 mUv = (vW - uB.xy) / uB.zw;   // canvas texture is flipY: row 0 (north edge) -> v = 1
vec4 M = texture2D(tMask, mUv);
float n1 = fbm(vW * .35), n2 = fbm(vW * 1.7 + 11.), n3 = vn(vW * 4.3);
// path: soft mask + breakup; grass tongues reach into the edge, the centre stays clean
float dirt = smoothstep(.42, .62, M.r + (n1 - .5) * .32 + (n2 - .5) * .22 - (n3 - .5) * .1 * (1. - M.r));
float shade = clamp(M.g * .85 + smoothstep(.42, .78, fbm(vW * .08 + 5.)) * .7, 0., 1.);
vec3 gS = tri(tSun, vW, 12.), gD = tri(tShade, vW, 10.);
vec3 grass = mix(gS, gD, shade);
grass *= mix(.86, 1.12, n1);                                 // large painterly value variation
vec3 moss = tri(tMoss, vW, 5.);
grass = mix(grass, moss, smoothstep(.15, .7, M.b) * .85);
vec3 dirtC = tri(tDirt, vW, 6.5) * mix(.9, 1.06, n2);
float rim = smoothstep(.0, .35, dirt) * (1. - smoothstep(.45, .9, dirt));
dirtC *= 1. - rim * .18;                                      // darker trodden rim at the grass line
vec3 col = mix(grass, dirtC, dirt);
col *= 1. - smoothstep(.35, 1., M.b) * .28;                   // contact darkening at trunks / rocks
diffuseColor.rgb *= col;
`);
  };
  m.customProgramCacheKey = () => 'forestground1';
  return m;
}

// catmull-rom smoothing of a polyline (keeps the original points)
function smoothPath(pts, sub = 8) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < sub; k++) {
      const t = k / sub, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map(c => 0.5 * ((2 * p1[c]) + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  out.push(pts[pts.length - 1]); return out;
}

function paintMask(def, props, S = 1024) {
  const [x0, z0, x1, z1] = def.bounds, W = x1 - x0, Hh = z1 - z0;
  const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  const P = (x, z) => [(x - x0) / W * S, (z1 - z) / Hh * S], px = S / W;
  const rnd = mulberry(77);
  g.globalCompositeOperation = 'lighter';
  // R: paths with gently varying width, soft shoulders
  g.filter = 'blur(' + Math.round(px * 0.35) + 'px)';
  for (const p of def.patches || []) {
    if (p.tex !== 'dirt') continue;
    if (p.shape === 'path') {
      const pts = []; for (let i = 0; i < p.pos.length; i += 2) pts.push([p.pos[i], p.pos[i + 1]]);
      const sm = smoothPath(pts, 10); let s = 0;
      for (let i = 0; i < sm.length - 1; i++) {
        const a = P(...sm[i]), b = P(...sm[i + 1]); s += Math.hypot(sm[i + 1][0] - sm[i][0], sm[i + 1][1] - sm[i][1]);
        const w = p.width * (1 + 0.14 * Math.sin(s * 0.45) + 0.08 * Math.sin(s * 1.3 + 2));
        g.strokeStyle = 'rgb(200,0,0)'; g.lineCap = 'round'; g.lineWidth = w * px; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke();
      }
    } else if (p.shape === 'disc') {
      const [cx, cy] = P(p.pos[0], p.pos[1]), r = p.radius * px;
      for (let k = 0; k < 9; k++) {                       // lumpy, not a perfect circle
        const a = k / 9 * Math.PI * 2, rr = r * (0.45 + rnd() * 0.25);
        const gr = g.createRadialGradient(cx + Math.cos(a) * r * 0.4, cy + Math.sin(a) * r * 0.4, 0, cx + Math.cos(a) * r * 0.4, cy + Math.sin(a) * r * 0.4, rr);
        gr.addColorStop(0, 'rgba(230,0,0,1)'); gr.addColorStop(1, 'rgba(230,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, S, S);
      }
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r * 0.8); gr.addColorStop(0, 'rgba(200,0,0,1)'); gr.addColorStop(1, 'rgba(200,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, S, S);
    }
  }
  // G: shaded grass under canopies; B: moss + contact darkening at trunks and rocks
  g.filter = 'none';
  for (const q of props) {
    const [cx, cy] = P(q.pos[0], q.pos[1]), s = q.scale || 1;
    const blob = (r, col0) => { const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, col0); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill(); };
    if (q.type === 'tree' || q.type === 'pine') { blob(3.0 * s * px, 'rgba(0,150,0,1)'); blob(1.25 * s * px, 'rgba(0,0,210,1)'); }
    else if (q.type === 'rock') blob(1.1 * s * px, 'rgba(0,40,200,1)');
    else if (q.type === 'stump' || q.type === 'ruin') blob(0.9 * s * px, 'rgba(0,30,170,1)');
    else if (q.type === 'shrub') blob(0.8 * s * px, 'rgba(0,60,90,1)');
  }
  const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return { tex: t, data: g.getImageData(0, 0, S, S).data, S, P };
}

// ---------------------------------------------------------------- foliage cards (grass / flowers)
function foliageMaterial(atlas) {
  const U = { uTime: { value: 0 }, uRight: { value: new THREE.Vector3(1, 0, 0) } };
  const m = new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 1, metalness: 0 });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aCell; uniform float uTime; uniform vec3 uRight;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
vMapUv = vec2((mod(aCell, 4.) + uv.x) * .25, 1. - (floor(aCell / 4.) + 1. - uv.y) * .5);`)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normalize(vec3(0., 1., 0.) + cross(uRight, vec3(0., 1., 0.)) * -.6);')
      .replace('#include <begin_vertex>', `
vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
float sw = sin(uTime * 1.7 + ip.x * .7 + ip.z * .5) * .06 + sin(uTime * 3.1 + ip.x * 1.9) * .025;
vec3 transformed = uRight * position.x + vec3(0., position.y, 0.) + uRight * sw * position.y * position.y;`);
  };
  m.customProgramCacheKey = () => 'foliage1';
  m.userData.U = U;
  return m;
}

// ---------------------------------------------------------------- build
export async function buildNature(zone, renderer) {
  const def = zone.def, geo = zone.geo, aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const root = new THREE.Group(); root.name = 'nature';
  const loader = new THREE.TextureLoader();
  const tl = (n, srgb = true) => { const t = loader.load(BASE + 'tex/' + n); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const tex = { grass_sun: tl('grass_sun.jpg'), grass_shade: tl('grass_shade.jpg'), dirt: tl('dirt.jpg'), moss: tl('moss.jpg') };
  const props = def.props || [];
  const mask = paintMask(def, props);

  // ground plane (bounds + margin); the boss platform / ramp from the builder's 'terrain' group stay on top
  const [x0, z0, x1, z1] = def.bounds, mg = 30;
  const gp = new THREE.PlaneGeometry(x1 - x0 + mg * 2, z1 - z0 + mg * 2).rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(gp, groundMaterial(tex, mask.tex, def.bounds));
  ground.position.copy(T({ x: (x0 + x1) / 2, y: -0.005, z: (z0 + z1) / 2 })); ground.receiveShadow = true; root.add(ground);

  // models, instanced per model and per chunk
  const byKey = new Map();
  props.forEach((q, i) => {
    const list = TYPE_MODEL[q.type]; if (!list) return;
    const name = q.model && MODELS[q.model] ? q.model : list[Math.floor(hash(i * 7 + 3) * list.length)];
    const ck = name + ':' + Math.floor(q.pos[0] / CHUNK) + ':' + Math.floor(q.pos[1] / CHUNK);
    if (!byKey.has(ck)) byKey.set(ck, { name, items: [] }); byKey.get(ck).items.push([q, i]);
  });
  const mats = new Map();
  const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), sc = new THREE.Vector3(), col = new THREE.Color();
  let instances = 0;
  const names = [...new Set([...byKey.values()].map(v => v.name))];
  await Promise.all(names.map(n => loadModel(n, aniso)));
  const loGeo = new Map(); await Promise.all(names.filter(n => !n.startsWith('bush')).map(async n => { const g = await loadShadowLod(n, await loadModel(n, aniso)); if (g) loGeo.set(n, g); }));
  for (const { name, items } of byKey.values()) {
    const md = await loadModel(name, aniso), spec = MODELS[name];
    if (!mats.has(name)) { const mm = md.mat.clone(); if (spec.dither) addDither(mm); mats.set(name, mm); }
    const im = new THREE.InstancedMesh(md.geo, mats.get(name), items.length);
    items.forEach(([q, i], k) => {
      const s = (q.scale || 1) * spec.h * (q.type === 'rock' && q.variant === 'boss' ? 1.25 : 1);
      const g0 = geo.ground(q.pos[0], q.pos[1]);
      qt.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -(q.rot || 0) * DEG);
      im.setMatrixAt(k, m4.compose(T({ x: g0.x, y: g0.y - 0.04 * s * (spec.trunk ? 0.3 : 1), z: g0.z }), qt, sc.set(s, s, s)));
      const v = hash(i * 13 + 5), w = hash(i * 31 + 9);          // gentle per-instance hue / value variation
      const tn = spec.tint || [1, 1, 1], kv = 0.93 + v * 0.12;   // per-model colour correction x gentle per-instance value / hue shift
      col.setRGB(tn[0] * kv * (0.97 + w * 0.06), tn[1] * kv, tn[2] * kv * (1.03 - w * 0.06)); im.setColorAt(k, col);
    });
    im.receiveShadow = true; im.castShadow = false;
    im.computeBoundingSphere(); im.frustumCulled = true; im.name = 'nature:' + name;
    root.add(im); instances += items.length;
    // shadows: cast from the low-poly copy; it draws zero instances in the colour pass
    if (!name.startsWith('bush')) {
      const lo = loGeo.get(name);
      if (lo) {
        const sm = new THREE.InstancedMesh(lo, SHADOW_ONLY, items.length); sm.instanceMatrix = im.instanceMatrix;
        sm.castShadow = true; sm.receiveShadow = false; sm.boundingSphere = im.boundingSphere; sm.name = 'nature:shadow:' + name;
        const n = items.length; sm.onBeforeRender = () => { sm.count = 0; }; sm.onAfterRender = () => { sm.count = n; };
        root.add(sm);
      } else im.castShadow = true;
    }
  }

  // signposts (simple carved wood; the builder's version is hidden with the other props)
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a6038, roughness: 1 }), woodD = new THREE.MeshStandardMaterial({ color: 0x5e3e22, roughness: 1 });
  for (const q of props) if (q.type === 'signpost') {
    const g = new THREE.Group(), g0 = geo.ground(q.pos[0], q.pos[1]);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.7, 7), woodD); post.position.y = 0.85; g.add(post);
    for (const [y, r] of [[1.45, 0.2], [1.12, -0.25]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.24, 0.06), wood); b.position.set(0.32, y, 0); b.rotation.y = r; g.add(b); }
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.position.copy(T(g0)); g.rotation.y = -(q.rot || 0) * DEG; root.add(g);
  }

  // grass + flower cards
  const atlas = tl('foliage_atlas.png'); atlas.wrapS = atlas.wrapT = THREE.ClampToEdgeWrapping; atlas.anisotropy = 4;
  const fm = foliageMaterial(atlas);
  const camYaw = CAM.yaw * DEG; fm.userData.U.uRight.value.copy(T({ x: Math.cos(camYaw), y: 0, z: -Math.sin(camYaw) })).normalize();
  const cards = [];      // [x, z, w, h, cell]
  const rnd = mulberry(def.nature && def.nature.seed || 1);
  const maskAt = (x, z) => { const [u, v] = mask.P(x, z); const i = (Math.min(mask.S - 1, Math.max(0, v | 0)) * mask.S + Math.min(mask.S - 1, Math.max(0, u | 0))) * 4; return [mask.data[i] / 255, mask.data[i + 1] / 255, mask.data[i + 2] / 255]; };
  const onPlat = (x, z) => (def.heights || []).some(h => x > h.rect[0] - 0.3 && x < h.rect[2] + 0.3 && z > h.rect[1] - 0.3 && z < h.rect[3] + 0.3);
  const camps = (def.monsters || []).map(m => [m.pos[0], m.pos[1], m.radius]);
  // flower clusters from the layout (white / yellow first, mixed as accents)
  const FCELL = { white: [4, 7], yellow: [5], mixed: [6] };
  for (const q of props) if (q.type === 'flowers') {
    const cells = FCELL[q.variant] || FCELL.white, n = 5 + Math.floor(rnd() * 6), r = 0.9 * (q.scale || 1);
    for (let k = 0; k < n; k++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r, x = q.pos[0] + Math.cos(a) * d, z = q.pos[1] + Math.sin(a) * d;
      if (maskAt(x, z)[0] > 0.55) continue;
      const s = 0.5 + rnd() * 0.3; cards.push([x, z, s * 1.1, s, k % 3 === 2 ? Math.floor(rnd() * 3) : cells[Math.floor(rnd() * cells.length)]]);
    }
  }
  // grass tufts: dense along forest edges and path shoulders, sparse on the open meadows and around monster camps
  const area = (x1 - x0) * (z1 - z0);
  for (let k = 0; k < area * 1.7; k++) {
    const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0);
    if (onPlat(x, z)) continue;
    const [r, g, b] = maskAt(x, z);
    if (r > 0.42) continue;                                       // never on the walkable dirt
    let dens = 0.16 + g * 0.55 + b * 0.25;                        // under / near trees
    if (r > 0.08) dens += 0.6;                                    // path shoulder
    for (const c of camps) if (Math.hypot(x - c[0], z - c[1]) < c[2] + 1) dens *= 0.45;
    if (rnd() > dens) continue;
    const s = 0.38 + rnd() * 0.32 + g * 0.15;
    cards.push([x, z, s * 1.25, s, rnd() < 0.82 ? Math.floor(rnd() * 3) : 3]);
    if (rnd() < 0.09 && g < 0.4) cards.push([x + 0.2, z + 0.1, 0.42, 0.36, rnd() < 0.65 ? 4 : rnd() < 0.8 ? 5 : 7]);   // stray daisies / buttercups
  }
  {
    const pg = new THREE.IcosahedronGeometry(1, 0); pg.scale(1, 0.55, 0.8); pg.translate(0, 0.25, 0);
    const pm = new THREE.MeshStandardMaterial({ color: 0xb8ab98, roughness: 1, flatShading: true });
    const peb = []; const pr = mulberry(91);
    for (let k = 0; k < area * 0.5; k++) {
      const x = x0 + pr() * (x1 - x0), z = z0 + pr() * (z1 - z0); if (onPlat(x, z)) continue;
      const r = maskAt(x, z)[0]; if (r < 0.12 || r > 0.75 || pr() > 0.55) continue;     // the path edge band only
      peb.push([x, z, 0.05 + pr() * pr() * 0.14, pr() * 6.28]);
    }
    const pim = new THREE.InstancedMesh(pg, pm, peb.length);
    peb.forEach(([x, z, s, a], k) => { const g0 = geo.ground(x, z); qt.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a); pim.setMatrixAt(k, m4.compose(T({ x, y: g0.y - s * 0.15, z }), qt, sc.set(s, s, s)));
      const v = 0.85 + pr() * 0.25; pim.setColorAt(k, col.setRGB(v, v * 0.97, v * 0.9)); });
    pim.receiveShadow = true; pim.castShadow = false; pim.computeBoundingSphere(); pim.name = 'nature:pebbles'; root.add(pim);
  }
  const cg = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const chunks = new Map();
  for (const c of cards) { const k = Math.floor(c[0] / CHUNK) + ':' + Math.floor(c[1] / CHUNK); if (!chunks.has(k)) chunks.set(k, []); chunks.get(k).push(c); }
  for (const list of chunks.values()) {
    const g = cg.clone(); const cell = new Float32Array(list.length);
    const im = new THREE.InstancedMesh(g, fm, list.length);
    list.forEach(([x, z, w, h, c], k) => { const g0 = geo.ground(x, z); im.setMatrixAt(k, m4.compose(T({ x, y: g0.y - 0.03, z }), qt.identity(), sc.set(w, h, 1))); cell[k] = c; });
    g.setAttribute('aCell', new THREE.InstancedBufferAttribute(cell, 1));
    im.receiveShadow = true; im.castShadow = false; im.computeBoundingSphere(); im.name = 'nature:foliage';
    root.add(im);
  }

  const v3 = new THREE.Vector3(); let t = 0;
  return {
    root, stats: { instances, cards: cards.length }, dither: DITHER,
    update(dt) {
      t += dt; fm.userData.U.uTime.value = t;
      const p = G.player, R = G.render; if (!p || !R) return;
      // player position on screen (drawing-buffer pixels, origin bottom-left) and view depth, for see-through dithering
      v3.copy(T({ x: p.pos.x, y: p.pos.y + 0.9, z: p.pos.z })); v3.project(R.cam);
      const sz = R.r.getDrawingBufferSize(new THREE.Vector2());
      DITHER.uPlayerPx.value.set((v3.x * 0.5 + 0.5) * sz.x, (v3.y * 0.5 + 0.5) * sz.y);
      v3.copy(T({ x: p.pos.x, y: p.pos.y + 0.9, z: p.pos.z })).applyMatrix4(R.cam.matrixWorldInverse); DITHER.uPlayerZ.value = v3.z;
      const ppm = sz.y / (2 * R.ortho); DITHER.uRad.value.set(1.25 * ppm, 1.7 * ppm);
    },
  };
}
