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
import { T, CAM, TG_TIME, paintMat } from './render.js';

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
  // mushroom boss grove (tools/blender/assets.py MUSH, rock_magic*, tree_violet*)
  tree_violet: { h: 5.3, trunk: true, dither: true }, tree_violet_round: { h: 4.6, trunk: true, dither: true },
  rock_magic: { h: 1.0, dither: true }, rock_magic_low: { h: 0.62 },
  mush_small_purple: { h: 0.48 }, mush_small_blue: { h: 0.44 }, mush_glow_purple: { h: 0.62, glow: [0.78, 0.5, 1.0] }, mush_glow_blue: { h: 0.56, glow: [0.5, 0.75, 1.0] },
  mush_orange: { h: 0.95 }, mush_cluster: { h: 1.35, glow: [0.7, 0.5, 1.0] }, mush_tree: { h: 4.3, trunk: true, dither: true, glow: [0.72, 0.5, 1.0] },
  // older Tripo models still used for the few one-off props
  stump: { h: 0.75, old: true }, ruin: { h: 2.3, dither: true, old: true }, mushroom: { h: 1.0, old: true },
};
const TYPE_MODEL = { tree: ['tree_broad_a', 'tree_broad_b', 'tree_forest_round', 'tree_broad_a'], pine: ['tree_forest_tall'], shrub: ['shrub_a', 'shrub_b'], bush: ['shrub_a', 'shrub_b'],
  rock: ['rock_medium', 'rock_moss', 'rock_roadside', 'rock_medium'], stone: ['rock_small'], stump: ['stump'], ruin: ['ruin'], mushroom: ['mush_orange', 'mush_cluster'], mushdecor: ['mush_small_purple', 'mush_small_blue', 'mush_glow_purple'], mushtree: ['mush_tree'] };
export const MAT_TEX = {
  M_bark: { t: 'bark.jpg' }, M_foliage: { t: 'foliage.jpg' }, M_foliage_warm: { t: 'foliage_warm.jpg' }, M_foliage_cool: { t: 'foliage_cool.jpg' },
  M_leaf: { t: 'leafcard.png', a: true }, M_leaf_warm: { t: 'leafcard_warm.png', a: true }, M_leaf_cool: { t: 'leafcard_cool.png', a: true },
  M_stone: { t: 'stone.jpg' }, M_stone_warm: { t: 'stone_warm.jpg' }, M_moss: { t: 'foliage.jpg', s: 1.6 }, M_plants: { t: 'plants.png', a: true },
  M_wood: { t: 'wood.jpg' }, M_wood_dark: { t: 'wood_dark.jpg' }, M_iron: { t: 'iron.jpg' }, M_gold: { t: 'gold.jpg', metal: 0.35 }, M_navy: { t: 'navy.jpg' },
  M_cream: { t: 'cream.jpg' }, M_roof_blue: { t: 'roof_blue.jpg' }, M_terracotta: { t: 'terracotta.jpg' }, M_plaster: { t: 'plaster.jpg' },
  M_glow: { t: 'lampglow.jpg', e: true },
  M_foliage_violet: { t: 'foliage_violet.jpg' }, M_leaf_violet: { t: 'leafcard_violet.png', a: true }, M_stone_violet: { t: 'stone_violet.jpg' }, M_moss_violet: { t: 'foliage_cool.jpg', s: 1.6 },
  M_cap_purple: { t: 'cap_purple.jpg' }, M_cap_blue: { t: 'cap_blue.jpg' }, M_cap_orange: { t: 'cap_orange.jpg' }, M_stem: { t: 'stem.jpg' }, M_spot: { t: 'spot.jpg' },
  M_glow_purple: { t: 'glow_purple.jpg', e: true, ec: 0xc79bff, ei: 0.55 }, M_glow_blue: { t: 'glow_blue.jpg', e: true, ec: 0x9cd2ff, ei: 0.55 }, M_red: { t: 'red.jpg' }, M_soil: { t: 'soilpot.jpg' },
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
/** per-field foliage colour (zone nature.foliage = crimson / azure / ash / snow): same models, leaf textures swapped */
const folCache = new Map();
function folSwap(m, f, aniso) {
  const n = m.name || '', leaf = /^M_leaf(_warm|_cool)?$/.test(n), fol = /^M_foliage(_warm|_cool)?$/.test(n);
  if (!leaf && !fol) return m;
  const key = n + '@' + f; if (folCache.has(key)) return folCache.get(key);
  const c = cloneMat(m); c.map = sharedTex(leaf ? `leafcard_${f}.png` : `foliage_${f}.jpg`, aniso, 1); c.name = n;
  folCache.set(key, c); return c;
}
/** one shared material per material name (so every Blender asset using M_bark shares the program + texture) */
export function blMaterial(name, aniso = 4) {
  if (matCache.has(name)) return matCache.get(name);
  const d = MAT_TEX[name] || { t: 'cream.jpg' };
  const m = new THREE.MeshStandardMaterial({ map: sharedTex(d.t, aniso, d.s || 1), vertexColors: true, roughness: 1, metalness: d.metal || 0,
    side: d.a ? THREE.DoubleSide : THREE.FrontSide, alphaTest: d.a ? 0.5 : 0, alphaToCoverage: !!d.a });
  if (d.e) { m.emissive = new THREE.Color(d.ec ?? 0xffd890); m.emissiveIntensity = d.ei ?? 1.6; m.emissiveMap = m.map; }
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
{ vec3 nn = normalize(vec3(gN.xy * .3, 1.));
  vec3 wn = normalize(vec3(nn.x, nn.z, -nn.y));                    // tangent x = world x, bitangent = world -z (vW.y)
  normal = normalize((viewMatrix * vec4(wn, 0.)).xyz); }`);
  };
  m.customProgramCacheKey = () => 'forestground2';
  return m;
}

// hand-painted violet arena floor (boss platform): large painterly colour masses (violet soil / deep violet / warm
// brown / moss) with brush-like domain-warped edges, worn lighter centre, mossy rim, thin cracks, leaf litter and
// stones from the magic texture set (used as low-contrast micro detail), soft drifting leaf shadows and warm light pools.
function arenaMaterial(tex, boss) {
  const m = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
  const c = boss && boss.center || [0, 0], r = boss && boss.radius || 10;
  const U = { tSoil: { value: tex.grass }, tDeep: { value: tex.grass_shadow }, tBrown: { value: tex.grass_dry }, tMoss: { value: tex.moss },
    tPeb: { value: tex.pebble }, tEdge: { value: tex.path_edge }, tNG: { value: tex.grass_n }, uA: { value: new THREE.Vector3(c[0], -c[1], r) }, uTime: TG_TIME };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + GROUND_VS)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvec4 wpG = modelMatrix * vec4(transformed, 1.0); vW = vec2(wpG.x, -wpG.z);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec2 vW; uniform sampler2D tSoil, tDeep, tBrown, tMoss, tPeb, tEdge, tNG; uniform vec3 uA; uniform float uTime;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 h22(vec2 p){ return vec2(h21(p), h21(p + 17.3)); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ return vn(p)*.5 + vn(p*2.03+7.1)*.25 + vn(p*4.11+3.3)*.125 + vn(p*8.3+1.7)*.0625; }
vec4 tri(sampler2D t, vec2 w, float s){ vec2 a = w / s; vec2 b = mat2(.8,-.6,.6,.8) * w / (s*1.37) + vec2(.31,.77);
  return mix(texture2D(t, a), texture2D(t, b), smoothstep(.3, .7, vn(w * .06))); }
float lum(vec3 c){ return dot(c, vec3(.299, .587, .114)); }
// brush mask: domain-warped noise with a soft but definite edge (painted shapes, not gradients)
float brush(vec2 p, float th, float soft){ vec2 q = p + vec2(fbm(p * 1.7 + 3.), fbm(p * 1.7 + 9.)) * .9; return smoothstep(th - soft, th + soft, fbm(q)); }
// voronoi edge distance -> thin cracks
float crack(vec2 p){ vec2 i = floor(p), f = fract(p); float d1 = 8., d2 = 8.;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(x, y), o = h22(i + g); float d = length(g + o - f); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
  return d2 - d1; }
vec3 gN;
`).replace('#include <map_fragment>', `
vec2 w = vW; float rd = length(w - uA.xy) / uA.z;                      // 0 centre .. 1 arena edge
// micro detail: texture luminance around its mean (keeps grain, drops the speckled colour)
float g1 = lum(tri(tSoil, w, 13.).rgb) / .46, g2 = lum(tri(tDeep, w, 6.).rgb) / .24, g3 = lum(tri(tBrown, w, 8.).rgb) / .40, gm = lum(tri(tMoss, w, 3.).rgb) / .32;
// brush dabs: short strokes in two fixed directions, blended by a slow mask (no swirls)
float bd = smoothstep(.35, .65, vn(w * .12 + 9.));
float stroke = mix(vn(vec2(w.x * 1.3 + w.y * .4, w.y * 5.5 - w.x * 1.6)), vn(vec2(w.x * 5.5 + w.y * 1.4, w.y * 1.3 - w.x * .5) + 3.), bd);
vec3 cSoil = vec3(.47, .36, .61) * mix(1., g1, .22), cDeep = vec3(.35, .26, .49) * mix(1., g1, .15);
vec3 cBrown = vec3(.53, .40, .33) * mix(1., g3, .5), cMoss = mix(vec3(.27, .40, .27), vec3(.42, .54, .30), stroke) * mix(1., gm, .4);
vec3 col = cSoil;
col = mix(col, cDeep, brush(w * .16 + 2., .58, .035) * .5);                          // large deep-violet pools
col = mix(col, mix(col, vec3(.62, .52, .76), .45), brush(w * .22 + 7., .64, .03) * (1. - rd * .6));  // lilac light masses
col = mix(col, cBrown, brush(w * .3 + 13., .65, .03) * .7);                            // warm brown soil
float moss = brush(w * .45 + 21., .76 - smoothstep(.7, 1.15, rd) * .16, .025);           // moss tufts, denser toward the rim
col = mix(col, cMoss, moss * .85);
col *= mix(.94, 1.05, stroke) * mix(.92, 1.05, fbm(w * .5 + 4.));                       // brush dabs + mid value drift
// worn centre: lighter, slightly warm; rim darker (dense growth around)
col = mix(col, col * vec3(1.08, 1.04, 1.0) + .025, (1. - smoothstep(.0, .7, rd)) * .5);
col *= 1. - smoothstep(.85, 1.25, rd) * .2;
// thin dark cracks in bare soil
float ck = crack(w * .8 + vec2(fbm(w * .4) * 1.2)); float cl = (1. - smoothstep(.0, .025, ck)) * (1. - moss) * smoothstep(.58, .72, fbm(w * .2 + 33.));
col = mix(col, col * vec3(.5, .42, .6), cl * .7);
// stones / pebbles and leaf litter from the painted texture set
vec4 pb = tri(tPeb, w, 4.); float st = smoothstep(.66, .85, lum(pb.rgb)) * brush(w * .4 + 41., .5, .12);
col = mix(col, vec3(.76, .72, .80) * (.8 + .4 * lum(pb.rgb)), st * .75);
vec4 lf = tri(tEdge, w, 3.5); float leaf = smoothstep(.5, .8, lum(lf.rgb)) * smoothstep(.4, .75, fbm(w * .6 + 51.));
col = mix(col, vec3(.78, .48, .30), leaf * .45);
// painted fallen leaves (small oriented almonds, warm orange / brown / dusty violet) and round pebbles with a lit top
{ vec2 g = w / 1.1, c = floor(g), f = fract(g); float r = h21(c);
  if (r > .62) { vec2 o = h22(c + 3.) * .6 + .2; float a = r * 40.; vec2 d = f - o; d = mat2(cos(a), -sin(a), sin(a), cos(a)) * d;
    float e = length(d / vec2(.13, .055)); float lf2 = 1. - smoothstep(.85, 1., e);
    vec3 lc = r > .88 ? vec3(.80, .50, .30) : r > .75 ? vec3(.60, .38, .28) : vec3(.56, .42, .64);
    lc *= .9 + .25 * smoothstep(-.1, .1, d.y); col = mix(col, lc, lf2 * (1. - moss * .6) * .8); } }
{ vec2 g = w / 1.7, c = floor(g), f = fract(g); float r = h21(c + 11.);
  if (r > .7) { vec2 o = h22(c + 5.) * .6 + .2; float rad = .05 + .07 * h21(c + 2.); vec2 d = (f - o) * 1.7;
    float e = length(d * vec2(1., 1.25)) / rad;
    col *= 1. - (1. - smoothstep(1., 1.6, e)) * smoothstep(.9, 1., e) * .35;                    // contact shadow
    vec3 pc = vec3(.62, .58, .68) * (.82 + .35 * smoothstep(.2, -.6, (d.x - d.y) / rad));       // lit from the upper left
    col = mix(col, pc, 1. - smoothstep(.85, 1., e)); } }
// glowing spores: sparse tiny lilac dots that breathe
vec2 sc = floor(w * 2.2); float sp = step(.985, h21(sc)); vec2 sf = fract(w * 2.2) - h22(sc) * .6 - .2;
col += vec3(.75, .55, 1.) * sp * (1. - smoothstep(.0, .06, length(sf))) * (.35 + .25 * sin(uTime * 2. + h21(sc) * 30.));
// soft leaf shadows drifting slowly, and warm sun pools (never black: tinted violet-blue)
float ls = smoothstep(.48, .62, fbm(w * .32 + vec2(uTime * .05, uTime * .03)));
float sun = smoothstep(.55, .75, fbm(w * .09 + 61.)) * (1. - ls * .7);
col *= mix(vec3(1.), vec3(.80, .78, .95), ls * .55);
col *= 1. + sun * vec3(.16, .11, .02);
diffuseColor.rgb *= col;
gN = tri(tNG, w, 6.).rgb * 2. - 1.;
`).replace('#include <normal_fragment_maps>', `
{ vec3 nn = normalize(vec3(gN.xy * .25, 1.)); vec3 wn = normalize(vec3(nn.x, nn.z, -nn.y)); normal = normalize((viewMatrix * vec4(wn, 0.)).xyz); }`);
  };
  m.customProgramCacheKey = () => 'arenafloor1';
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
  const c = document.createElement('canvas'); c.width = c.height = S; const g0 = c.getContext('2d', { willReadFrequently: true });
  g0.fillStyle = '#000'; g0.fillRect(0, 0, S, S);
  const P = (x, z) => [(x - x0) / W * S, (z1 - z) / Hh * S], px = S / W;
  const rnd = mulberry(77);
  // R: paths with gently varying width, soft shoulders. Drawn sharp on a layer and blurred once when composited:
  // a blur filter on every path segment cost minutes on software GL (2026-11-06, 140 m world fields)
  const L = document.createElement('canvas'); L.width = L.height = S; const g = L.getContext('2d', { willReadFrequently: true });
  g.globalCompositeOperation = 'lighter';
  const PATHY = new Set(['dirt', 'cobble', 'cobble_warm']);
  for (const p of def.patches || []) {
    if (p.tex === 'forest_floor' && p.shape === 'disc') { const [cx, cy] = P(p.pos[0], p.pos[1]), r = p.radius * px; const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      gr.addColorStop(0, 'rgba(0,170,60,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(cx - r, cy - r, 2 * r, 2 * r); continue; }
    if (!PATHY.has(p.tex)) continue;
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
        gr.addColorStop(0, 'rgba(230,0,0,1)'); gr.addColorStop(1, 'rgba(230,0,0,0)'); g.fillStyle = gr; g.fillRect(cx - r * 1.2, cy - r * 1.2, r * 2.4, r * 2.4);
      }
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r * 0.8); gr.addColorStop(0, 'rgba(200,0,0,1)'); gr.addColorStop(1, 'rgba(200,0,0,0)'); g.fillStyle = gr; g.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    }
  }
  g0.globalCompositeOperation = 'lighter'; g0.filter = 'blur(' + Math.round(px * 0.35) + 'px)'; g0.drawImage(L, 0, 0); g0.filter = 'none';
  // G: shaded grass under canopies; B: moss + contact darkening at trunks and rocks
  {
  const g = g0;
  for (const q of props) {
    const [cx, cy] = P(q.pos[0], q.pos[1]), s = q.scale || 1;
    const blob = (r, col0) => { const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, col0); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill(); };
    if (q.type === 'tree' || q.type === 'pine') { blob(3.0 * s * px, 'rgba(0,150,0,1)'); blob(1.25 * s * px, 'rgba(0,0,210,1)'); }
    else if (q.type === 'rock') blob(1.1 * s * px, 'rgba(0,40,200,1)');
    else if (q.type === 'stone') blob(0.35 * s * px, 'rgba(0,10,120,1)');
    else if (q.type === 'stump' || q.type === 'ruin') blob(0.9 * s * px, 'rgba(0,30,170,1)');
    else if (q.type === 'shrub') blob(0.8 * s * px, 'rgba(0,60,90,1)');
  }
  }
  const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return { tex: t, data: g0.getImageData(0, 0, S, S).data, S, P };
}

// ---------------------------------------------------------------- build
export async function buildNature(zone, renderer) {
  const def = zone.def, geo = zone.geo, aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const root = new THREE.Group(); root.name = 'nature';
  const loader = new THREE.TextureLoader();
  const tl = (n, srgb = true) => { const t = loader.load(BASE + 'tex/' + n); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const NV = def.nature || {}, pre = NV.ground ? 'g_' + NV.ground + '_' : 'g_';           // per-zone painted ground set
  const tex = { grass: tl(pre + 'grass.jpg'), grass_shadow: tl(pre + 'grass_shadow.jpg'), grass_dry: tl(pre + 'grass_dry.jpg'), moss: tl(pre + 'moss.jpg'), path: tl(pre + 'path.jpg'),
    path_edge: tl(pre + 'path_edge.jpg'), soil_dark: tl(pre + 'soil_dark.jpg'), pebble: tl(pre + 'pebble.jpg'), grass_n: tl('g_grass_n.jpg', false), path_n: tl('g_path_n.jpg', false) };
  const props = def.props || [];
  const mask = paintMask(def, props);
  // painted violet forest floor for raised arenas (builder 'boss_floor' terrain): same splat shader, magic texture set
  const mgp = 'g_magic_', magicTex = { grass: tl(mgp + 'grass.jpg'), grass_shadow: tl(mgp + 'grass_shadow.jpg'), grass_dry: tl(mgp + 'grass_dry.jpg'), moss: tl(mgp + 'moss.jpg'), path: tl(mgp + 'path.jpg'),
    path_edge: tl(mgp + 'path_edge.jpg'), soil_dark: tl(mgp + 'soil_dark.jpg'), pebble: tl(mgp + 'pebble.jpg'), grass_n: tl('g_grass_n.jpg', false), path_n: tl('g_path_n.jpg', false) };
  const magicFloor = arenaMaterial(magicTex, def.boss);

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
  const LOD = (G.input && G.input.mobile) || (G.settings && G.settings.graphicsFx === false) || (def.nature && def.nature.lod === 'l2') ? '_l2' : '';   // phones / effects off / dense fields: low LOD
  const lm = n => loadModel(n, aniso, MODELS[n] && !MODELS[n].old ? LOD : '');
  const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), sc = new THREE.Vector3(), col = new THREE.Color();
  let instances = 0;
  const names = [...new Set([...byKey.values()].map(v => v.name))];
  await Promise.all(names.map(n => lm(n)));
  const loGeo = new Map(); await Promise.all(names.map(async n => { const g = await loadShadowLod(n, await lm(n)); if (g) loGeo.set(n, g); }));
  const ditherMat = m => { const k = (m.name || m.uuid) + ':' + (m.map ? m.map.uuid : '') + ':d'; if (!mats.has(k)) { const mm = cloneMat(m); addDither(mm); mats.set(k, mm); } return mats.get(k); };
  for (const { name, items } of byKey.values()) {
    const md = await lm(name), spec = MODELS[name];
    const mats0 = NV.foliage ? md.mats.map(m => folSwap(m, NV.foliage, aniso)) : md.mats;
    const im = new THREE.InstancedMesh(md.geo, spec.dither ? mats0.map(ditherMat) : mats0, items.length);
    items.forEach(([q, i], k) => {
      const s = (q.scale || 1) * spec.h * (q.type === 'rock' && q.variant === 'boss' ? 1.25 : 1);
      const g0 = geo.ground(q.pos[0], q.pos[1]);
      qt.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -(q.rot || 0) * DEG);
      im.setMatrixAt(k, m4.compose(T({ x: g0.x, y: g0.y - 0.04 * s * (spec.trunk ? 0.3 : 1), z: g0.z }), qt, sc.set(s, s, s)));
      const v = hash(i * 13 + 5), w = hash(i * 31 + 9);          // gentle per-instance hue / value variation
      const tn = NV.tint && /^(tree|shrub)/.test(name) && !/violet/.test(name) && !NV.foliage ? NV.tint : NV.rockTint && name.startsWith('rock') && !/magic/.test(name) ? NV.rockTint : [1, 1, 1], kv = 0.94 + v * 0.1;   // per-model colour correction x gentle per-instance value / hue shift
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

  // faint ground glow under glowing mushrooms (additive soft disc, one instanced mesh)
  {
    const gl = []; props.forEach((q, i) => { const list = TYPE_MODEL[q.type]; if (!list) return; const n = q.model && MODELS[q.model] ? q.model : list[Math.floor(hash(i * 7 + 3) * list.length)]; if (MODELS[n].glow) gl.push([q, MODELS[n]]); });
    if (gl.length) {
      const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
      const gm = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
      const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), gm, gl.length);
      gl.forEach(([q, sp], k) => { const g0 = geo.ground(q.pos[0], q.pos[1]), r = (q.scale || 1) * sp.h * (sp.trunk ? 1.1 : 2.6);
        im.setMatrixAt(k, m4.compose(T({ x: g0.x, y: g0.y + 0.03, z: g0.z }), qt.identity(), sc.set(r, 1, r))); im.setColorAt(k, col.setRGB(...sp.glow).multiplyScalar(0.55)); });
      im.renderOrder = 1; im.computeBoundingSphere(); im.name = 'nature:glow'; root.add(im);
    }
  }

  // signposts (simple carved wood; the builder's version is hidden with the other props)
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a6038, roughness: 1 }), woodD = new THREE.MeshStandardMaterial({ color: 0x5e3e22, roughness: 1 });
  for (const q of props) if (q.type === 'signpost' && !q.text) {
    const g = new THREE.Group(), g0 = geo.ground(q.pos[0], q.pos[1]);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.7, 7), woodD); post.position.y = 0.85; g.add(post);
    for (const [y, r] of [[1.45, 0.2], [1.12, -0.25]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.24, 0.06), wood); b.position.set(0.32, y, 0); b.rotation.y = r; g.add(b); }
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.position.copy(T(g0)); g.rotation.y = -(q.rot || 0) * DEG; root.add(g);
  }

  // carved notice boards (signpost with "text"): two posts, a wide plank with the words burnt in (Jua), a little roof
  for (const q of props) if (q.type === 'signpost' && q.text) {
    try { await document.fonts.load('48px Jua'); } catch (e) { }
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 160; const cx = cv.getContext('2d');
    const gr = cx.createLinearGradient(0, 0, 0, 160); gr.addColorStop(0, '#c08a52'); gr.addColorStop(1, '#94643a'); cx.fillStyle = gr; cx.fillRect(0, 0, 512, 160);
    cx.strokeStyle = 'rgba(70,40,18,.35)'; cx.lineWidth = 2; for (let i = 0; i < 9; i++) { cx.beginPath(); const y = 12 + i * 17 + Math.sin(i * 3) * 3; cx.moveTo(0, y); cx.bezierCurveTo(170, y + 5, 340, y - 5, 512, y + 2); cx.stroke(); }
    cx.strokeStyle = '#5a3418'; cx.lineWidth = 10; cx.strokeRect(5, 5, 502, 150);
    const lines = String(q.text).split('\n'); cx.textAlign = 'center'; cx.textBaseline = 'middle';
    let fs = lines.length > 1 ? 50 : 64; cx.font = `${fs}px Jua, sans-serif`; while (Math.max(...lines.map(l => cx.measureText(l).width)) > 430 && fs > 24) { fs -= 2; cx.font = `${fs}px Jua, sans-serif`; }
    lines.forEach((l, i) => { const y = 80 + (i - (lines.length - 1) / 2) * fs * 1.1; cx.fillStyle = 'rgba(255,230,190,.35)'; cx.fillText(l, 256, y + 2); cx.fillStyle = '#3a1c08'; cx.fillText(l, 256, y); });
    const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = aniso;
    const g = new THREE.Group(), g0 = geo.ground(q.pos[0], q.pos[1]), W = 2.0, H = 0.62;
    for (const sx of [-1, 1]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.9, 7), woodD); post.position.set(sx * (W / 2 - 0.12), 0.95, 0); g.add(post); }
    const face = new THREE.MeshStandardMaterial({ map: tx, roughness: 1 });
    const board = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.08), [wood, wood, wood, wood, face, wood]); board.position.y = 1.45; g.add(board);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 0.3, 0.07, 0.34), woodD); roof.position.set(0, 1.83, 0); roof.rotation.x = 0.12; g.add(roof);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.position.copy(T(g0)); g.rotation.y = -(q.rot || 0) * DEG; g.name = 'nature:notice'; root.add(g);
  }

  // landmark models (type 'landmark', model = assets/props/<model>.glb.json, Tripo -> Blender, e.g. the mushroom house)
  for (const q of props) if (q.type === 'landmark' && q.model) {
    try {
      const gltf = await parseWrapped('assets/props/' + q.model + '.glb.json'), m = gltf.scene, g0 = geo.ground(q.pos[0], q.pos[1]);
      const bb = new THREE.Box3().setFromObject(m), k = (q.h > 0 ? q.h : 6) / Math.max(0.01, bb.max.y - bb.min.y);
      m.scale.setScalar(k);
      m.position.copy(T(g0)); m.position.y += (q.y || 0) - bb.min.y * k; m.rotation.y = -(q.rot || 0) * DEG; m.name = 'nature:landmark'; root.add(m);
      const baseY = T(g0).y, gc = new THREE.Color(...(q.groundCol || [0.30, 0.47, 0.16]));
      m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; const mm = o.material; if (mm && mm.isMeshStandardMaterial) landmarkMat(mm, baseY, gc); } });
    } catch (e) { console.warn('landmark', q.model, e); }
  }

  // ruined walls (type 'wall', footprint w x d): weathered stone blocks with a broken top, painted-light vertex colours
  for (const q of props) if (q.type === 'wall') {
    const w = q.w > 0 ? q.w : 2, d = q.d > 0 ? q.d : 0.6, h0 = 1.6 + hash(q.pos[0] * 13 | 0) * 1.2, g0 = geo.ground(q.pos[0], q.pos[1]);
    const parts = [], n = Math.max(2, Math.round(w / 0.9));
    for (let i = 0; i < n; i++) {
      const hh = h0 * (0.55 + 0.45 * hash(i * 7 + (q.pos[1] * 5 | 0))), bx = new THREE.BoxGeometry(w / n * 0.98, hh, d, 1, 2, 1).translate(-w / 2 + (i + 0.5) * w / n, hh / 2, 0);
      const c = new Float32Array(bx.attributes.position.count * 3);
      for (let k = 0; k < bx.attributes.position.count; k++) { const y = bx.attributes.position.getY(k) / h0; const l = 0.62 + 0.42 * y; c[k * 3] = l; c[k * 3 + 1] = l * 0.98; c[k * 3 + 2] = l * 0.94; }
      bx.setAttribute('color', new THREE.BufferAttribute(c, 3)); parts.push(bx);
    }
    const wm = new THREE.Mesh(mergeGeometries(parts), blMaterial('M_stone_warm', aniso));
    wm.position.copy(T(g0)); wm.rotation.y = -(q.rot || 0) * DEG; wm.castShadow = wm.receiveShadow = true; wm.name = 'nature:wall'; root.add(wm);
  }

  // grass + flower cards
  const fm = { userData: { U: { uTime: { value: 0 } } } };          // shared wind clock for the plant clumps
  const cards = [];      // [x, z, w, h, cell]
  const rnd = mulberry(def.nature && def.nature.seed || 1);
  const maskAt = (x, z) => { const [u, v] = mask.P(x, z); const i = (Math.min(mask.S - 1, Math.max(0, v | 0)) * mask.S + Math.min(mask.S - 1, Math.max(0, u | 0))) * 4; return [mask.data[i] / 255, mask.data[i + 1] / 255, mask.data[i + 2] / 255]; };
  const onPlat = (x, z) => (def.heights || []).some(h => x > h.rect[0] - 0.3 && x < h.rect[2] + 0.3 && z > h.rect[1] - 0.3 && z < h.rect[3] + 0.3);
  const camps = (def.monsters || []).map(m => [m.pos[0], m.pos[1], m.radius]);
  // ponds / lakes / river pools (zone patches tex 'water', shape 'disc'): drawn by buildWater below
  const ponds = (def.patches || []).filter(p => p.tex === 'water' && p.shape === 'disc').map(p => [p.pos[0], p.pos[1], p.radius]);
  let waterU = null;
  const inWater = (x, z, m = 0.15) => ponds.some(([px, pz, r]) => Math.hypot(x - px, z - pz) < r + m);
  // flower clusters from the layout (white / yellow first, mixed as accents)
  const FCELL = { white: [4, 7], yellow: [5], mixed: [6, 10] };
  for (const q of props) if (q.type === 'flowers') {
    const cells = FCELL[q.variant] || FCELL.white, n = 5 + Math.floor(rnd() * 6), r = 0.9 * (q.scale || 1);
    for (let k = 0; k < n; k++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r, x = q.pos[0] + Math.cos(a) * d, z = q.pos[1] + Math.sin(a) * d;
      if (maskAt(x, z)[0] > 0.55 || inWater(x, z)) continue;
      const s = 0.5 + rnd() * 0.3; cards.push([x, z, s * 1.1, s, k % 3 === 2 ? Math.floor(rnd() * 3) : cells[Math.floor(rnd() * cells.length)]]);
    }
  }
  // grass tufts: dense along forest edges and path shoulders, sparse on the open meadows and around monster camps
  const area = (x1 - x0) * (z1 - z0);
  for (let k = 0; k < area * 2.6 * (NV.grass ?? 1); k++) {
    const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0);
    if (onPlat(x, z) || inWater(x, z)) continue;
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
  // reeds and tall grass along the shores (gaps where a path meets the water), then the water itself
  if (ponds.length) {
    const wr = mulberry(517);
    for (const [px, pz, r] of ponds) {
      const n = Math.round(r * 14);
      for (let k = 0; k < n; k++) {
        const a = wr() * Math.PI * 2, d = r * (0.96 + wr() * 0.14) + wr() * 0.5, x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d;
        if (ponds.some(([qx, qz, qr]) => Math.hypot(x - qx, z - qz) < qr - 0.35) || maskAt(x, z)[0] > 0.3 || onPlat(x, z)) continue;
        if (Math.sin(a * 3 + px) > 0.55 && wr() < 0.75) continue;                  // open stretches of shore between the reed beds
        const s = 0.6 + wr() * 0.45; cards.push([x, z, s * 1.2, s, wr() < 0.75 ? 3 : Math.floor(wr() * 3)]);
      }
    }
    const W = buildWater(def, ponds, NV, geo); root.add(W.mesh); if (W.pads) root.add(W.pads); waterU = W.U;
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
    root, stats: { instances, cards: cards.length }, dither: DITHER, magicFloor, water: !!waterU,
    update(dt) {
      t += dt; fm.userData.U.uTime.value = t;
      const p = G.player, R = G.render; if (!p || !R) return;
      if (waterU) { waterU.uTime.value = t; waterU.uSun.value.copy(R.sun.position).sub(R.sun.target.position).normalize(); waterU.uSunCol.value.copy(R.sun.color).multiplyScalar(Math.min(1.6, R.sun.intensity / 2.3)); }
      // player position on screen (drawing-buffer pixels, origin bottom-left) and view depth, for see-through dithering
      v3.copy(T({ x: p.pos.x, y: p.pos.y + 0.9, z: p.pos.z })); v3.project(R.cam);
      const sz = R.r.getDrawingBufferSize(new THREE.Vector2());
      DITHER.uPlayerPx.value.set((v3.x * 0.5 + 0.5) * sz.x, (v3.y * 0.5 + 0.5) * sz.y);
      v3.copy(T({ x: p.pos.x, y: p.pos.y + 0.9, z: p.pos.z })).applyMatrix4(R.cam.matrixWorldInverse); DITHER.uPlayerZ.value = v3.z;
      const ppm = sz.y / (2 * R.ortho); DITHER.uRad.value.set(1.25 * ppm, 1.7 * ppm);
    },
  };
}

/** Blender props placed at their real modelled size (town decoration etc.): list = [{ model, pos:[x,z], rot, scale }].
 *  One instanced mesh per model (+ low-poly shadow caster), shared materials. Used by js/town3d.js. */
export async function placeBlProps(list, aniso = 4, groundY = () => 0) {
  const root = new THREE.Group(); root.name = 'blprops';
  const by = new Map(); for (const p of list) { if (!by.has(p.model)) by.set(p.model, []); by.get(p.model).push(p); }
  const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), sc = new THREE.Vector3(), yA = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  await Promise.all([...by.entries()].map(async ([name, items]) => {
    const low = (G.input && G.input.mobile) && !/^(grass|flower|clover|fern)/.test(name);   // plants have a single LOD
    let md; try { md = await loadModel(name, aniso, low ? '_l2' : ''); } catch (e) { console.warn('blprop', name, e); return; }
    const im = new THREE.InstancedMesh(md.geo, md.mats, items.length);
    items.forEach((p, k) => {
      const s = (p.scale || 1) * md.xf.H; qt.setFromAxisAngle(yA, -(p.rot || 0) * DEG);
      im.setMatrixAt(k, m4.compose(T({ x: p.pos[0], y: p.y ?? groundY(p.pos[0], p.pos[1]), z: p.pos[1] }), qt, sc.set(s, s, s)));
      const v = 0.95 + hash(k * 17 + name.length) * 0.1; im.setColorAt(k, col.setRGB(v, v, v));
    });
    im.receiveShadow = true; im.castShadow = false; im.computeBoundingSphere(); im.name = 'bl:' + name; root.add(im);
    const lo = /^(grass|flower|clover|fern)/.test(name) ? null : await loadShadowLod(name, md);
    if (lo) { const sm = new THREE.InstancedMesh(lo, SHADOW_ONLY, items.length); sm.instanceMatrix = im.instanceMatrix; sm.castShadow = true; sm.boundingSphere = im.boundingSphere;
      const n = items.length; sm.onBeforeRender = () => { sm.count = 0; }; sm.onAfterRender = () => { sm.count = n; }; root.add(sm); }
    else im.castShadow = !/^(grass|flower|clover|fern)/.test(name);
  }));
  return root;
}

/** a Tripo-made landmark painted to sit in the field: the game's toon shading (paintMat: banded light, violet shade,
 *  warm occlusion, rim), slightly calmer colours, and a soft grass-coloured blend over the lowest ~0.7 m so the walls
 *  grow out of the painted ground instead of standing on it */
function landmarkMat(m, baseY, grass) {
  m.roughness = 1; m.metalness = 0; m.envMapIntensity = 0.4;
  if (m.map) { m.map.anisotropy = 8; m.map.needsUpdate = true; }
  m.onBeforeCompile = sh => {
    sh.uniforms.uBaseY = { value: baseY }; sh.uniforms.uGrass = { value: grass };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vWY;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWY = (modelMatrix * vec4(transformed, 1.)).y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWY; uniform float uBaseY; uniform vec3 uGrass;')
      .replace('#include <opaque_fragment>', `{ float gb = 1. - smoothstep(0.0, 0.7, vWY - uBaseY);
  float l = dot(outgoingLight, vec3(.299, .587, .114));
  outgoingLight = mix(outgoingLight, uGrass * (0.55 + 0.9 * l), gb * 0.55); }
#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'landmark';
  paintMat(m, { sat: 0.9, rimK: 0.16 });
}

// ------------------------------------------------------------------------------------------------ water (ponds / lakes)
// One quad per group of touching ponds over a painted mask (R = shoreline, G = depth): opaque water with a muddy-sand
// shallow band fading into a deep blue-green middle, animated ripple normals (three scrolling noise layers), sky
// reflection by Fresnel, sun glints, a foam / lapping line at the shore and a dark wet ring on the ground around it.
// Lily pads float in the shallows. Replaces the builder's flat textured water discs (hidden in game.js).
const WATER_FS = `
varying vec3 vP; varying vec2 vG;
uniform sampler2D tMask; uniform vec4 uB; uniform float uTime; uniform vec3 uSun, uSunCol, uShal, uDeep, uSky, uMud;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
float wav(vec2 q){ float t = uTime;
  return vn(q * .55 + vec2(t * .22, t * .15)) * .55 + vn(mat2(.8,-.6,.6,.8) * q * 1.35 - vec2(t * .31, -t * .18)) * .3 + vn(q * 3.4 + vec2(-t * .5, t * .42)) * .15; }
void main(){
  vec4 M = texture2D(tMask, vec2((vG.x - uB.x) / uB.z, (vG.y - uB.y) / uB.w));   // canvas texture is flipped: v = (z - z0) / depth
  float e = M.r, dep = smoothstep(.5, .95, M.g);
  if (e < .08) discard;
  // ripple normal from the height field (finite differences)
  vec2 q = vG; float h0 = wav(q), hx = wav(q + vec2(.12, 0.)), hz = wav(q + vec2(0., .12));
  vec3 N = normalize(vec3(-(hx - h0) * 3.6, 1., (hz - h0) * 3.6));
  vec3 V = normalize(cameraPosition - vP);
  // colour: muddy sand shallows (bed shows through, mottled) -> clear teal -> deep blue-green
  float mott = vn(vG * 1.7) * .6 + vn(vG * 5.3) * .4;
  vec3 shallow = mix(uMud * (.85 + .3 * mott), uShal, smoothstep(.5, .72, e));
  vec3 base = mix(shallow, uDeep, dep);
  float fres = .02 + .98 * pow(1. - max(dot(N, V), 0.), 5.);
  // reflected sky: zenith blue -> pale horizon, soft drifting clouds seen in the reflection direction
  vec3 Rf = reflect(-V, N);
  vec3 sky = mix(uSky * 1.15, uSky * .55, clamp(Rf.y, 0., 1.));
  float cl = smoothstep(.45, .85, vn(Rf.xz / max(Rf.y, .2) * 2.2 + uTime * .03) * .7 + vn(Rf.xz * 6. + 3.) * .3);
  sky = mix(sky, vec3(.92, .94, .96), cl * .5);
  vec3 col = mix(base, sky, clamp(fres * 1.25, 0., .42) * smoothstep(.5, .65, e));
  // sun: broad sheen + sharp glints, a little sparkle on wave crests
  vec3 H = normalize(uSun + V);
  float sp = pow(max(dot(N, H), 0.), 120.) * 2.2 + pow(max(dot(N, H), 0.), 18.) * .12;
  float glit = step(.985, vn(vG * 9. + uTime * 1.3)) * step(.6, h0);
  col += uSunCol * (sp + glit * .8) * smoothstep(.5, .6, e);
  // foam / lapping line at the shore, breaking up and moving
  float line = 1. - abs(e - .525) / .028; line = clamp(line, 0., 1.);
  float foam = line * smoothstep(.35, .75, vn(vG * 2.6 + vec2(uTime * .4, -uTime * .3)) + .25 * sin(uTime * 1.6 + e * 40.));
  col = mix(col, vec3(.9, .94, .92), foam * .45);
  // outside the water: a wet, darker ring on the ground (transparent)
  float water = smoothstep(.47, .53, e);
  float wet = smoothstep(.08, .45, e) * (1. - water);
  vec4 o = mix(vec4(uMud * .55, .45 * wet), vec4(col, 1.), water);
  gl_FragColor = o;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
function buildWater(def, ponds, NV, geo) {
  const [x0, z0, x1, z1] = def.bounds, Wd = x1 - x0, Hd = z1 - z0, S = 1024, px = S / Wd;
  const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const P = (x, z) => [(x - x0) / Wd * S, (z1 - z) / Hd * S];
  const disc = (ctx, k) => { for (const [x, z, r] of ponds) { const [cx, cy] = P(x, z); ctx.beginPath(); ctx.arc(cx, cy, r * px * k, 0, Math.PI * 2); ctx.fill(); } };
  // R: shoreline (edge = 0.5 at the disc radius, soft over ~1.2 m); G: depth (much wider blur, shrunk discs)
  const L = document.createElement('canvas'); L.width = L.height = S; const l = L.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S); g.globalCompositeOperation = 'lighter';
  l.fillStyle = '#f00'; disc(l, 1); g.filter = `blur(${(1.2 * px).toFixed(1)}px)`; g.drawImage(L, 0, 0);
  l.clearRect(0, 0, S, S); l.fillStyle = '#0f0'; disc(l, 0.8); g.filter = `blur(${(3.2 * px).toFixed(1)}px)`; g.drawImage(L, 0, 0); g.filter = 'none';
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.NoColorSpace; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  const frost = NV.ground === 'frost', marsh = NV.ground === 'mist';
  const U = { tMask: { value: tex }, uB: { value: new THREE.Vector4(x0, z0, Wd, Hd) }, uTime: { value: 0 },
    uSun: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() }, uSunCol: { value: new THREE.Color(1, 0.95, 0.85) },
    uShal: { value: new THREE.Color(...(frost ? [0.3, 0.52, 0.6] : marsh ? [0.16, 0.32, 0.26] : [0.14, 0.38, 0.36])) },
    uDeep: { value: new THREE.Color(...(frost ? [0.05, 0.14, 0.22] : marsh ? [0.03, 0.09, 0.08] : [0.02, 0.1, 0.14])) },
    uSky: { value: new THREE.Color(...(frost ? [0.6, 0.72, 0.84] : [0.42, 0.58, 0.74])) }, uMud: { value: new THREE.Color(...(frost ? [0.42, 0.44, 0.45] : [0.36, 0.3, 0.2])) } };
  const mat = new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: true,
    vertexShader: 'varying vec3 vP; varying vec2 vG; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vP = w.xyz; vG = vec2(w.x, -w.z); gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: WATER_FS });
  // one quad per group of touching ponds
  const grp = ponds.map((_, i) => i), find = i => grp[i] === i ? i : (grp[i] = find(grp[i]));
  ponds.forEach((a, i) => ponds.forEach((b, j) => { if (j > i && Math.hypot(a[0] - b[0], a[1] - b[1]) < a[2] + b[2] + 3) grp[find(i)] = find(j); }));
  const rects = new Map();
  ponds.forEach(([x, z, r], i) => { const k = find(i), m = r + 2.2, R = rects.get(k) || [1e9, 1e9, -1e9, -1e9];
    rects.set(k, [Math.min(R[0], x - m), Math.min(R[1], z - m), Math.max(R[2], x + m), Math.max(R[3], z + m)]); });
  const parts = [];
  for (const [a, b, cc, d] of rects.values()) {
    const q = new THREE.PlaneGeometry(cc - a, d - b).rotateX(-Math.PI / 2);
    const y = geo.ground((a + cc) / 2, (b + d) / 2).y + 0.02; q.translate((a + cc) / 2, y, -(b + d) / 2); parts.push(q);
  }
  const mesh = new THREE.Mesh(mergeGeometries(parts), mat); mesh.name = 'nature:water'; mesh.renderOrder = 1; mesh.receiveShadow = false;
  // lily pads in the shallows (a notched disc, two greens, a few pink / white flowers)
  const pr = mulberry(733), pads = [];
  for (const [x, z, r] of ponds) {
    const n = Math.round(r * 1.6);
    for (let k = 0; k < n; k++) {
      const a = pr() * Math.PI * 2, d = r * (0.55 + pr() * 0.3), px2 = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      for (let j = 0; j < 1 + Math.floor(pr() * 3); j++) pads.push([px2 + (pr() - 0.5) * 0.9, pz + (pr() - 0.5) * 0.9, 0.22 + pr() * 0.2, pr() * 6.28, pr()]);
    }
  }
  let padMesh = null;
  if (pads.length) {
    const pg = new THREE.CircleGeometry(1, 18, 0.35, Math.PI * 2 - 0.5).rotateX(-Math.PI / 2);
    const pm = new THREE.MeshLambertMaterial({ color: 0xffffff });
    padMesh = new THREE.InstancedMesh(pg, pm, pads.length); const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), col = new THREE.Color();
    pads.forEach(([x, z, s, a, v], k) => { qt.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
      m4.compose(T({ x, y: geo.ground(x, z).y + 0.035, z }), qt, new THREE.Vector3(s, 1, s)); padMesh.setMatrixAt(k, m4);
      padMesh.setColorAt(k, col.setRGB(0.2 + v * 0.12, 0.42 + v * 0.12, 0.14 + v * 0.06)); });
    padMesh.name = 'nature:lilypads'; padMesh.receiveShadow = true; padMesh.renderOrder = 2; padMesh.computeBoundingSphere();
    const flowers = pads.filter(p => p[4] > 0.82);
    if (flowers.length) {
      const fg = new THREE.ConeGeometry(0.09, 0.08, 6).translate(0, 0.04, 0);
      const fm = new THREE.InstancedMesh(fg, new THREE.MeshLambertMaterial({ color: 0xffffff }), flowers.length);
      flowers.forEach(([x, z, s, a, v], k) => { m4.compose(T({ x, y: geo.ground(x, z).y + 0.05, z }), qt.identity(), new THREE.Vector3(1, 1, 1)); fm.setMatrixAt(k, m4);
        fm.setColorAt(k, col.setRGB(1, v > 0.92 ? 0.95 : 0.62, v > 0.92 ? 0.95 : 0.78)); });
      fm.name = 'nature:lilyflowers'; padMesh.add(fm); fm.matrixAutoUpdate = false;
    }
  }
  return { mesh, pads: padMesh, U };
}
