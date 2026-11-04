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
const BL = 'assets/forest/bl/';
const DEG = Math.PI / 180;
// Blender-made, hand-painted models (tools/blender/assets.py -> wrap.py). Modelled in metres; `h` = height at layout scale 1
// (kept at the old models' heights so the layout scales in zones.json still mean the same size). The painted light (AO x
// gradient) is in the vertex colours, the textures are shared per material NAME (MAT_TEX, mirrors tools/blender/texmap.py).
const MODELS = {
  tree_broad_a: { h: 5.6, trunk: true, dither: true }, tree_broad_b: { h: 5.3, trunk: true, dither: true },
  tree_forest_round: { h: 4.9, trunk: true, dither: true }, tree_forest_tall: { h: 6.5, trunk: true, dither: true },
  shrub_a: { h: 1.0 }, shrub_b: { h: 0.85 },
  rock_small: { h: 0.3 }, rock_medium: { h: 0.8, dither: true }, rock_moss: { h: 1.1, dither: true }, rock_roadside: { h: 0.5 }, rock_large: { h: 1.1, dither: true },
  grass_short: { h: 1 }, grass_tall: { h: 1 }, flower_white: { h: 1 }, flower_yellow: { h: 1 }, flower_pink: { h: 1 }, flower_mixed: { h: 1 }, fern: { h: 1 }, clover: { h: 1 },
  // older Tripo models still used for the few one-off props
  stump: { h: 0.75, old: true }, ruin: { h: 2.3, dither: true, old: true }, mushroom: { h: 1.0, old: true },
};
const TYPE_MODEL = { tree: ['tree_broad_a', 'tree_broad_b', 'tree_forest_round', 'tree_broad_a'], pine: ['tree_forest_tall'], shrub: ['shrub_a', 'shrub_b'], bush: ['shrub_a', 'shrub_b'],
  rock: ['rock_medium', 'rock_moss', 'rock_roadside', 'rock_medium'], stone: ['rock_small'], stump: ['stump'], ruin: ['ruin'], mushroom: ['mushroom'] };
export const MAT_TEX = {
  M_bark: { t: 'bark.jpg' }, M_foliage: { t: 'foliage.jpg' }, M_foliage_warm: { t: 'foliage_warm.jpg' }, M_foliage_cool: { t: 'foliage_cool.jpg' },
  M_leaf: { t: 'leafcard.png', a: true }, M_leaf_warm: { t: 'leafcard_warm.png', a: true }, M_leaf_cool: { t: 'leafcard_cool.png', a: true },
  M_stone: { t: 'stone.jpg' }, M_stone_warm: { t: 'stone_warm.jpg' }, M_moss: { t: 'foliage.jpg', s: 1.6 }, M_plants: { t: 'plants.png', a: true },
  M_wood: { t: 'wood.jpg' }, M_wood_dark: { t: 'wood_dark.jpg' }, M_iron: { t: 'iron.jpg' }, M_gold: { t: 'gold.jpg', metal: 0.35 }, M_navy: { t: 'navy.jpg' },
  M_cream: { t: 'cream.jpg' }, M_roof_blue: { t: 'roof_blue.jpg' }, M_terracotta: { t: 'terracotta.jpg' }, M_plaster: { t: 'plaster.jpg' },
  M_glow: { t: 'lampglow.jpg', e: true }, M_red: { t: 'red.jpg' }, M_soil: { t: 'soilpot.jpg' },
};
const CHUNK = 24;            // instancing / culling cell (m): bigger cells = fewer draw calls, the camera sees ~30 x 25 m

function hash(n) { n = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); n ^= n >>> 13; n = Math.imul(n, 0xc2b2ae35); n ^= n >>> 16; return (n >>> 0) / 4294967296; }
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------- model loading (GLB wrapped as base64 JSON)
const texCache = new Map();
function sharedTex(file, aniso, scale = 1) {
  const k = file + '|' + scale; if (texCache.has(k)) return texCache.get(k);
  const t = new THREE.TextureLoader().load(BL + 'tex/' + file); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; t.flipY = false;   // glTF UV convention
  t.wrapS = t.wrapT = THREE.RepeatWrapping; if (scale !== 1) t.repeat.set(scale, scale);
  texCache.set(k, t); return t;
}
const matCache = new Map();
/** one shared material per material name (so every Blender asset using M_bark shares the program + texture) */
export function blMaterial(name, aniso = 4) {
  if (matCache.has(name)) return matCache.get(name);
  const d = MAT_TEX[name] || { t: 'cream.jpg' };
  const m = new THREE.MeshStandardMaterial({ map: sharedTex(d.t, aniso, d.s || 1), vertexColors: true, roughness: 1, metalness: d.metal || 0,
    side: d.a ? THREE.DoubleSide : THREE.FrontSide, alphaTest: d.a ? 0.5 : 0, alphaToCoverage: !!d.a });
  if (d.e) { m.emissive = new THREE.Color(0xffd890); m.emissiveIntensity = 1.6; m.emissiveMap = m.map; }
  if (d.a) {
    const leaf = name.startsWith('M_leaf');
    m.onBeforeCompile = sh => {
      // cut-out cards: keep the painted (outward / up) normal on both faces instead of flipping it on the back face
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal *= faceDirection;');
      // leaf cards are stored as 4 vertices at their centre: expand them towards the camera (size, rotation in aCard)
      if (leaf) sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aCard;')
        .replace('#include <project_vertex>', `#include <project_vertex>
{ float isc = 1.0;
  #ifdef USE_INSTANCING
  isc = length(instanceMatrix[0].xyz);
  #endif
  isc *= length(modelMatrix[0].xyz);
  vec2 cr = uv - 0.5; float ca = cos(aCard.y), sa = sin(aCard.y);
  mvPosition.xy += vec2(cr.x * ca - cr.y * sa, cr.x * sa + cr.y * ca) * aCard.x * isc;
  gl_Position = projectionMatrix * mvPosition; }`);
    };
    m.customProgramCacheKey = () => leaf ? 'blleaf1' : 'blcut1';
  }
  m.name = name; matCache.set(name, m); return m;
}
/** Material.clone() drops shader hooks: keep them */
export function cloneMat(m) { const c = m.clone(); if (m.hasOwnProperty('onBeforeCompile')) c.onBeforeCompile = m.onBeforeCompile;
  if (m.hasOwnProperty('customProgramCacheKey')) c.customProgramCacheKey = m.customProgramCacheKey; return c; }
async function parseWrapped(url) {
  const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status);
  const j = await r.json(); const raw = atob(j.b64), u8 = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
  return new Promise((res, rej) => new GLTFLoader().parse(u8.buffer, '', res, rej));
}
const modelCache = new Map();
/** geometry with one group per material + the shared materials; normalised to base y=0, footprint centre at 0, height 1 */
export function loadModel(name, aniso, lod = '') {
  const key = name + lod; if (modelCache.has(key)) return modelCache.get(key);
  const spec = MODELS[name] || {};
  const p = (async () => {
    const gltf = await parseWrapped((spec.old ? BASE + 'models/' : BL) + name + (spec.old ? '' : lod) + '.glb.json');
    const geos = [], mats = [];
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(o => {
      if (!o.isMesh) return;
      const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld);
      const keep = spec.old ? ['position', 'normal', 'uv'] : ['position', 'normal', 'uv', 'color', 'uv1'];
      for (const a of Object.keys(g.attributes)) if (!keep.includes(a)) g.deleteAttribute(a);
      if (g.attributes.color && g.attributes.color.itemSize === 4) {     // RGBA -> RGB (alpha is always 1)
        const c = g.attributes.color, out = new Float32Array(c.count * 3);
        for (let i = 0; i < c.count; i++) { out[i * 3] = c.getX(i); out[i * 3 + 1] = c.getY(i); out[i * 3 + 2] = c.getZ(i); }
        g.setAttribute('color', new THREE.BufferAttribute(out, 3));
      }
      if (!spec.old && !g.attributes.color) { const n = g.attributes.position.count; g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3)); }
      if (!spec.old) {                                                 // leaf-card size / rotation (second UV layer 'Card')
        const n = g.attributes.position.count; g.setAttribute('aCard', g.attributes.uv1 ? g.attributes.uv1.clone() : new THREE.BufferAttribute(new Float32Array(n * 2), 2));
        g.deleteAttribute('uv1');
      }
      geos.push(g);
      if (spec.old) { const m = new THREE.MeshStandardMaterial({ map: o.material.map, roughness: 1, metalness: 0 }); if (m.map) { m.map.anisotropy = aniso; m.map.colorSpace = THREE.SRGBColorSpace; } mats.push(m); }
      else mats.push(blMaterial(o.material.name, aniso));
    });
    const geo = geos.length > 1 ? mergeGeometries(geos, true) : geos[0];
    if (geos.length === 1) { geo.clearGroups(); geo.addGroup(0, geo.index ? geo.index.count : geo.attributes.position.count, 0); }
    geo.computeBoundingBox(); const bb = geo.boundingBox, H = bb.max.y - bb.min.y;
    let cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
    if (spec.trunk) {               // trunk: average of the vertices in the lowest 6 % (roots included, canopy excluded)
      const pa = geo.attributes.position; let sx = 0, sz = 0, n = 0;
      for (let i = 0; i < pa.count; i++) if (pa.getY(i) < bb.min.y + H * 0.06) { sx += pa.getX(i); sz += pa.getZ(i); n++; }
      if (n) { cx = sx / n; cz = sz / n; }
    }
    geo.translate(-cx, -bb.min.y, -cz); geo.scale(1 / H, 1 / H, 1 / H);
    const ac = geo.attributes.aCard; if (ac) for (let i = 0; i < ac.count; i++) ac.setX(i, ac.getX(i) / H);
    return { geo, mats, xf: { cx, cz, y0: bb.min.y, H } };
  })();
  modelCache.set(key, p); return p;
}
// simplified copy for the shadow-map pass only (same normalisation as the visible mesh)
async function loadShadowLod(name, hi) {
  try {
    const spec = MODELS[name] || {};
    const gltf = await parseWrapped((spec.old ? BASE + 'models/' : BL) + name + '_lo.glb.json');
    const geos = []; gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(o => { if (o.isMesh) { const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); for (const a of Object.keys(g.attributes)) if (a !== 'position') g.deleteAttribute(a); g.setIndex(g.index); geos.push(g); } });
    const geo = geos.length > 1 ? mergeGeometries(geos) : geos[0];
    geo.translate(-hi.xf.cx, -hi.xf.y0, -hi.xf.cz); geo.scale(1 / hi.xf.H, 1 / hi.xf.H, 1 / hi.xf.H);
    return geo;
  } catch (e) { return null; }
}
const SHADOW_ONLY = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false });

// ---------------------------------------------------------------- see-through dithering (shared uniforms)
const DITHER = { uPlayerPx: { value: new THREE.Vector2(-1e4, -1e4) }, uPlayerZ: { value: 0 }, uRad: { value: new THREE.Vector2(80, 120) } };
function addDither(mat) {
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
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
  mat.customProgramCacheKey = () => 'dither1:' + prevKey();
}

// ---------------------------------------------------------------- ground
// painted ground set (tools/blender/paint.py ground_set): sunlit / shaded / dry grass, moss, light path dirt with pebbles,
// darker trodden edge soil, dark soil patches; subtle normals for grass and path. Splat weights come from the zone mask
// (R path, G canopy shade, B trunk / rock contact) broken up by noise, so edges never look cut.
const GROUND_VS = `varying vec2 vW;`;
function groundMaterial(tex, maskTex, bounds) {
  const m = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
  const U = {
    tSun: { value: tex.grass }, tShade: { value: tex.grass_shadow }, tDry: { value: tex.grass_dry }, tMoss: { value: tex.moss },
    tPath: { value: tex.path }, tEdge: { value: tex.path_edge }, tSoil: { value: tex.soil_dark }, tPeb: { value: tex.pebble },
    tNG: { value: tex.grass_n }, tNP: { value: tex.path_n }, tMask: { value: maskTex },
    uB: { value: new THREE.Vector4(bounds[0], bounds[1], bounds[2] - bounds[0], bounds[3] - bounds[1]) },
  };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + GROUND_VS)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvec4 wpG = modelMatrix * vec4(transformed, 1.0); vW = vec2(wpG.x, -wpG.z);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec2 vW; uniform sampler2D tSun, tShade, tDry, tMoss, tPath, tEdge, tSoil, tPeb, tNG, tNP, tMask; uniform vec4 uB;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ return vn(p)*.5 + vn(p*2.03+7.1)*.25 + vn(p*4.11+3.3)*.125 + vn(p*8.3+1.7)*.0625; }
// anti-tiling: two lookups at different scale / rotation, blended by low-frequency noise
vec4 tri(sampler2D t, vec2 w, float s){ vec2 a = w / s; vec2 b = mat2(.8,-.6,.6,.8) * w / (s*1.37) + vec2(.31,.77);
  float k = smoothstep(.3, .7, vn(w * .06)); return mix(texture2D(t, a), texture2D(t, b), k); }
vec3 gN; float gDirt;
`).replace('#include <map_fragment>', `
vec2 mUv = (vW - uB.xy) / uB.zw;   // canvas texture is flipY: row 0 (north edge) -> v = 1
vec4 M = texture2D(tMask, mUv);
float n1 = fbm(vW * .3), n2 = fbm(vW * 1.6 + 11.), n3 = vn(vW * 4.3), n4 = fbm(vW * .11 + 3.);
// path: soft mask + breakup; grass tongues reach into the edge, the centre stays clean and gets lighter (trodden)
float dirt = smoothstep(.40, .62, M.r + (n1 - .5) * .3 + (n2 - .5) * .22 - (n3 - .5) * .12 * (1. - M.r));
float centre = smoothstep(.62, .95, M.r + (n2 - .5) * .15);
float shade = clamp(M.g * .85 + smoothstep(.45, .8, fbm(vW * .08 + 5.)) * .55, 0., 1.);
vec3 gS = tri(tSun, vW, 9.).rgb, gD = tri(tShade, vW, 8.).rgb, gY = tri(tDry, vW, 10.).rgb;
vec3 grass = mix(gS, gY, smoothstep(.55, .85, n4) * (1. - shade) * .7);           // sun-dried patches in the open
grass = mix(grass, gD, shade);
grass *= mix(.8, 1.08, n1) * mix(.9, 1.04, fbm(vW * .9 + 4.)) * vec3(.9, .95, .84);   // large + mid painterly value drift, deeper green
grass = mix(grass, tri(tMoss, vW, 4.).rgb, smoothstep(.15, .7, M.b) * .8);
float soilP = smoothstep(.78, .9, fbm(vW * .45 + 21.)) * (1. - shade * .5) * (1. - M.r);   // bare soil showing through
grass = mix(grass, tri(tSoil, vW, 5.).rgb * 1.05, soilP * .85);
vec3 pathC = mix(tri(tEdge, vW, 5.).rgb, tri(tPath, vW, 6.).rgb, smoothstep(.0, .55, centre + (n2 - .5) * .3));
pathC = mix(pathC, tri(tPeb, vW, 4.).rgb, smoothstep(.55, .8, fbm(vW * .7 + 9.)) * .6);
float rim = smoothstep(.0, .3, dirt) * (1. - smoothstep(.35, .8, dirt));
pathC *= 1. - rim * .16;                                                          // darker trodden rim at the grass line
vec3 col = mix(grass, pathC, dirt);
col *= 1. - smoothstep(.35, 1., M.b) * .3;                                        // contact darkening at trunks / rocks
diffuseColor.rgb *= col;
gDirt = dirt;
gN = mix(tri(tNG, vW, 9.).rgb, tri(tNP, vW, 6.).rgb, dirt) * 2. - 1.;
`).replace('#include <normal_fragment_maps>', `
{ vec3 nn = normalize(vec3(gN.xy * .9, 1.));
  vec3 wn = normalize(vec3(nn.x, nn.z, -nn.y));                    // tangent x = world x, bitangent = world -z (vW.y)
  normal = normalize((viewMatrix * vec4(wn, 0.)).xyz); }`);
  };
  m.customProgramCacheKey = () => 'forestground2';
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
    else if (q.type === 'stone') blob(0.35 * s * px, 'rgba(0,10,120,1)');
    else if (q.type === 'stump' || q.type === 'ruin') blob(0.9 * s * px, 'rgba(0,30,170,1)');
    else if (q.type === 'shrub') blob(0.8 * s * px, 'rgba(0,60,90,1)');
  }
  const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return { tex: t, data: g.getImageData(0, 0, S, S).data, S, P };
}

// ---------------------------------------------------------------- build
export async function buildNature(zone, renderer) {
  const def = zone.def, geo = zone.geo, aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const root = new THREE.Group(); root.name = 'nature';
  const loader = new THREE.TextureLoader();
  const tl = (n, srgb = true) => { const t = loader.load(BASE + 'tex/' + n); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const tex = { grass: tl('g_grass.jpg'), grass_shadow: tl('g_grass_shadow.jpg'), grass_dry: tl('g_grass_dry.jpg'), moss: tl('g_moss.jpg'), path: tl('g_path.jpg'),
    path_edge: tl('g_path_edge.jpg'), soil_dark: tl('g_soil_dark.jpg'), pebble: tl('g_pebble.jpg'), grass_n: tl('g_grass_n.jpg', false), path_n: tl('g_path_n.jpg', false) };
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
  const LOD = (G.input && G.input.mobile) || (G.settings && G.settings.graphicsFx === false) ? '_l2' : '';   // phones / effects off: low LOD
  const lm = n => loadModel(n, aniso, MODELS[n] && !MODELS[n].old ? LOD : '');
  const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), sc = new THREE.Vector3(), col = new THREE.Color();
  let instances = 0;
  const names = [...new Set([...byKey.values()].map(v => v.name))];
  await Promise.all(names.map(n => lm(n)));
  const loGeo = new Map(); await Promise.all(names.map(async n => { const g = await loadShadowLod(n, await lm(n)); if (g) loGeo.set(n, g); }));
  const ditherMat = m => { const k = (m.name || m.uuid) + ':d'; if (!mats.has(k)) { const mm = cloneMat(m); addDither(mm); mats.set(k, mm); } return mats.get(k); };
  for (const { name, items } of byKey.values()) {
    const md = await lm(name), spec = MODELS[name];
    const im = new THREE.InstancedMesh(md.geo, spec.dither ? md.mats.map(ditherMat) : md.mats, items.length);
    items.forEach(([q, i], k) => {
      const s = (q.scale || 1) * spec.h * (q.type === 'rock' && q.variant === 'boss' ? 1.25 : 1);
      const g0 = geo.ground(q.pos[0], q.pos[1]);
      qt.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -(q.rot || 0) * DEG);
      im.setMatrixAt(k, m4.compose(T({ x: g0.x, y: g0.y - 0.04 * s * (spec.trunk ? 0.3 : 1), z: g0.z }), qt, sc.set(s, s, s)));
      const v = hash(i * 13 + 5), w = hash(i * 31 + 9);          // gentle per-instance hue / value variation
      const tn = spec.tint || [1, 1, 1], kv = 0.94 + v * 0.1;   // per-model colour correction x gentle per-instance value / hue shift
      col.setRGB(tn[0] * kv * (0.97 + w * 0.06), tn[1] * kv, tn[2] * kv * (1.03 - w * 0.06)); im.setColorAt(k, col);
    });
    im.receiveShadow = true; im.castShadow = false;
    im.computeBoundingSphere(); im.frustumCulled = true; im.name = 'nature:' + name;
    root.add(im); instances += items.length;
    // shadows: cast from the low-poly copy; it draws zero instances in the colour pass
    {
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
  const fm = { userData: { U: { uTime: { value: 0 } } } };          // shared wind clock for the plant clumps
  const cards = [];      // [x, z, w, h, cell]
  const rnd = mulberry(def.nature && def.nature.seed || 1);
  const maskAt = (x, z) => { const [u, v] = mask.P(x, z); const i = (Math.min(mask.S - 1, Math.max(0, v | 0)) * mask.S + Math.min(mask.S - 1, Math.max(0, u | 0))) * 4; return [mask.data[i] / 255, mask.data[i + 1] / 255, mask.data[i + 2] / 255]; };
  const onPlat = (x, z) => (def.heights || []).some(h => x > h.rect[0] - 0.3 && x < h.rect[2] + 0.3 && z > h.rect[1] - 0.3 && z < h.rect[3] + 0.3);
  const camps = (def.monsters || []).map(m => [m.pos[0], m.pos[1], m.radius]);
  // flower clusters from the layout (white / yellow first, mixed as accents)
  const FCELL = { white: [4, 7], yellow: [5], mixed: [6, 10] };
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
  for (let k = 0; k < area * 2.6; k++) {
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
  // grass / flower clumps: Blender multi-card models (crossed cards, never a flat paper face), instanced per kind and chunk
  const PLANT = ['grass_short', 'grass_short', 'grass_short', 'grass_tall', 'flower_white', 'flower_yellow', 'flower_mixed', 'flower_white', 'fern', 'clover', 'flower_pink'];
  for (const c of cards) if (c[4] <= 2) {                              // shade-loving ferns / clover mixed into the grass
    const g = maskAt(c[0], c[1])[1]; const h = hash((c[0] * 73 + c[1] * 151) | 0);
    if (g > 0.5 && h < 0.12) { c[4] = 8; c[3] *= 1.2; } else if (h > 0.93) c[4] = 9;
  }
  const plantMat = (() => {
    const m = cloneMat(blMaterial('M_plants', aniso)); m.name = 'M_plants_wind'; const base = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => { base(sh, r);
      Object.assign(sh.uniforms, fm.userData.U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <common>', '#include <common>\nattribute vec3 aRoot;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
float sw = sin(uTime * 1.7 + aRoot.x * .7 + aRoot.y * .5) * .07 + sin(uTime * 3.1 + aRoot.x * 1.9) * .03;
transformed.xz += vec2(sw, sw * .4) * aRoot.z * aRoot.z;`);
    };
    m.customProgramCacheKey = () => 'plantwind2'; return m;
  })();
  const plantGeo = {}; await Promise.all([...new Set(PLANT)].map(async n => { MODELS[n] = MODELS[n] || { h: 1 }; plantGeo[n] = (await loadModel(n, aniso)).geo; }));   // height 1, base at 0
  // all clumps of a chunk are merged into ONE static mesh (a handful of draw calls for thousands of clumps); the wind
  // reads the clump root from the 'aRoot' attribute (x, z of the clump + its height)
  const chunks = new Map();
  for (const c of cards) { const k = Math.floor(c[0] / CHUNK) + ':' + Math.floor(c[1] / CHUNK); if (!chunks.has(k)) chunks.set(k, []); chunks.get(k).push(c); }
  const yA = new THREE.Vector3(0, 1, 0), prr = mulberry(313), tmpC = new THREE.Color();
  for (const list of chunks.values()) {
    const parts = [];
    for (const [x, z, w, h, cell] of list) {
      const kind = PLANT[cell], src = plantGeo[kind]; const g0 = geo.ground(x, z);
      const hh = h * (kind.startsWith('flower') ? 1.0 : kind === 'grass_tall' ? 1.5 : kind === 'fern' ? 1.3 : 1.25);
      qt.setFromAxisAngle(yA, prr() * 6.283);
      m4.compose(T({ x, y: g0.y - 0.02, z }), qt, sc.set(hh * (0.9 + prr() * 0.3), hh, hh * (0.9 + prr() * 0.3)));
      const g = src.clone(); g.applyMatrix4(m4);
      const n = g.attributes.position.count, root = new Float32Array(n * 3), py = src.attributes.position;
      for (let i = 0; i < n; i++) { root[i * 3] = x; root[i * 3 + 1] = -z; root[i * 3 + 2] = py.getY(i) * hh; }
      g.setAttribute('aRoot', new THREE.BufferAttribute(root, 3));
      const v = 0.9 + prr() * 0.2, c = g.attributes.color; tmpC.setRGB(v * (0.98 + prr() * 0.06), v, v * (0.94 + prr() * 0.06));
      for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) * tmpC.r, c.getY(i) * tmpC.g, c.getZ(i) * tmpC.b);
      g.deleteAttribute('aCard'); g.clearGroups(); parts.push(g);
    }
    const mg = mergeGeometries(parts); mg.computeBoundingSphere();
    const mesh = new THREE.Mesh(mg, plantMat); mesh.receiveShadow = true; mesh.castShadow = false; mesh.name = 'nature:plants'; root.add(mesh);
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
