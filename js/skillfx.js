// Skill effects library (아르칸 연대기): projectiles, bursts, slashes, beams, ground areas, auras, summon models, telegraphs.
// Self-contained: all textures are drawn on canvases at first use, all geometries/materials/textures are shared through
// module-level caches, short-lived rigs are pooled per kind, particles live in two instanced buffers (additive + alpha).
// Public API positions/directions are game (Unity) coords: x east, y up, z north. three-space = (x, y, -z).
import { THREE, T } from './render.js';
import { ShatterFx } from './shatterfx.js';
import { SalFx } from './salfx.js';

const TAU = Math.PI * 2, DEG = Math.PI / 180;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp01 = (x) => x < 0 ? 0 : x > 1 ? 1 : x;
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion();
const _c1 = new THREE.Color(), _c2 = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0), ZA = new THREE.Vector3(0, 0, 1);
// fixed quarter-view camera forward in three space (pitch 38, yaw 45) - used to billboard strips around their axis
const CAMF = (() => { const p = 38 * DEG, y = 45 * DEG; return new THREE.Vector3(Math.sin(y) * Math.cos(p), -Math.sin(p), -Math.cos(y) * Math.cos(p)).normalize(); })();
const gp = (p, out) => out.set(p.x, p.y || 0, -p.z);                 // game pos -> three (no alloc)
const yawOf = (d) => Math.atan2(d.x || 0, -(d.z || 0));               // game dir {x,z} -> rotation.y so local +z faces it
const hexC = (h) => new THREE.Color(h);

// ============================================================================================ canvas textures
const TEXC = new Map();
function ctex(key, S, draw, W) {
  let t = TEXC.get(key); if (t) return t;
  const c = document.createElement('canvas'); c.width = W || S; c.height = S; const g = c.getContext('2d');
  draw(g, W || S, S);
  t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  TEXC.set(key, t); return t;
}
function star(g, x, y, n, r0, r1, rot = -Math.PI / 2) { g.beginPath(); for (let i = 0; i < n * 2; i++) { const r = i % 2 ? r1 : r0, a = rot + i * Math.PI / n; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.closePath(); }
function blob(g, x, y, r, k, seed, j = 0.35) { g.beginPath(); for (let i = 0; i <= k; i++) { const a = i / k * TAU, rr = r * (1 - j / 2 + j * (0.5 + 0.5 * Math.sin(a * 3 + seed) * Math.cos(a * 5 + seed * 2.1))); g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); }
function noteGlyph(g, x, y, s, double) {
  g.save(); g.translate(x, y); g.scale(s, s);
  const head = (hx, hy) => { g.save(); g.translate(hx, hy); g.rotate(-0.45); g.beginPath(); g.ellipse(0, 0, 15, 11, 0, 0, TAU); g.fill(); g.restore(); };
  if (!double) { head(-8, 30); g.fillRect(4, -40, 7, 70); g.beginPath(); g.moveTo(11, -40); g.bezierCurveTo(30, -26, 36, -14, 24, 4); g.bezierCurveTo(30, -12, 22, -22, 11, -24); g.fill(); }
  else { head(-24, 34); head(22, 24); g.fillRect(-12, -36, 7, 70); g.fillRect(34, -46, 7, 70); g.beginPath(); g.moveTo(-12, -36); g.lineTo(41, -46); g.lineTo(41, -32); g.lineTo(-12, -22); g.fill(); }
  g.restore();
}
// --- particle atlas: 8x8 tiles of 128 px -----------------------------------------------------------
const TL = { glow: 0, spark: 1, smoke: 2, ring: 3, note: 4, note2: 5, plus: 6, leaf: 7, shard: 8, flower: 9, drop: 10, bubble: 11, snow: 12, star: 13, petal: 14, splat: 15,
  gear: 16, dust: 17, flame: 18, bolt: 19, square: 20, streak: 21, xmark: 22, swirl: 23, rune1: 24, rune2: 25, pellet: 26, hex: 27, impact: 28, skull: 29, drip: 30, paper: 31,
  arrow: 32, wisp: 33, coin: 34, crescent: 35, herb: 36, mushroom: 37, flowerP: 38, rock: 39, crystal: 40, ember: 41, sigil: 42, ripple: 43 };
function atlasTex() {
  return ctex('atlas', 1024, (g) => {
    const C = 128, tile = (i, fn) => { g.save(); g.translate((i % 8) * C + 64, Math.floor(i / 8) * C + 64); fn(); g.restore(); };
    const rad = (r, stops) => { const gr = g.createRadialGradient(0, 0, 0, 0, 0, r); for (const [o, c] of stops) gr.addColorStop(o, c); return gr; };
    const W = '#fff';
    tile(TL.glow, () => { g.fillStyle = rad(60, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.75)'], [0.6, 'rgba(255,255,255,0.22)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(-64, -64, 128, 128); });
    tile(TL.spark, () => { g.fillStyle = rad(40, [[0, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(-64, -64, 128, 128); g.fillStyle = W; star(g, 0, 0, 4, 58, 7); g.fill(); });
    tile(TL.smoke, () => { for (let i = 0; i < 7; i++) { const a = i * 0.9, r = i ? 22 : 0, x = Math.cos(a) * r, y = Math.sin(a) * r * 0.8; g.fillStyle = rad(1, [[0, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]); g.save(); g.translate(x, y); g.scale(38, 38); g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.fill(); g.restore(); } });
    tile(TL.ring, () => { g.shadowColor = W; g.shadowBlur = 10; g.strokeStyle = W; g.lineWidth = 9; g.beginPath(); g.arc(0, 0, 50, 0, TAU); g.stroke(); });
    tile(TL.note, () => { g.shadowColor = W; g.shadowBlur = 10; g.fillStyle = W; noteGlyph(g, 0, 0, 1.1, false); });
    tile(TL.note2, () => { g.shadowColor = W; g.shadowBlur = 10; g.fillStyle = W; noteGlyph(g, -4, 2, 1.05, true); });
    tile(TL.plus, () => { g.shadowColor = W; g.shadowBlur = 14; g.fillStyle = W; g.beginPath(); g.roundRect(-14, -46, 28, 92, 8); g.roundRect(-46, -14, 92, 28, 8); g.fill(); });
    tile(TL.leaf, () => { g.rotate(0.6); g.fillStyle = W; g.beginPath(); g.moveTo(0, -56); g.bezierCurveTo(40, -30, 34, 30, 0, 56); g.bezierCurveTo(-34, 30, -40, -30, 0, -56); g.fill(); g.strokeStyle = 'rgba(120,120,120,0.9)'; g.lineWidth = 4; g.beginPath(); g.moveTo(0, -46); g.lineTo(0, 54); g.stroke(); g.lineWidth = 2.5; for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(0, i * 16); g.lineTo(18, i * 16 - 14); g.moveTo(0, i * 16); g.lineTo(-18, i * 16 - 14); g.stroke(); } });
    tile(TL.shard, () => { g.fillStyle = W; g.beginPath(); g.moveTo(0, -58); g.lineTo(18, 10); g.lineTo(0, 58); g.lineTo(-14, 6); g.closePath(); g.fill(); g.fillStyle = 'rgba(170,170,170,1)'; g.beginPath(); g.moveTo(0, -58); g.lineTo(18, 10); g.lineTo(0, 58); g.closePath(); g.fill(); });
    tile(TL.flower, () => { for (let i = 0; i < 5; i++) { g.save(); g.rotate(i * TAU / 5); g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(0, -28, 17, 28, 0, 0, TAU); g.fill(); g.strokeStyle = 'rgba(160,160,160,0.6)'; g.lineWidth = 2; g.stroke(); g.restore(); } g.fillStyle = '#ffd040'; g.beginPath(); g.arc(0, 0, 16, 0, TAU); g.fill(); });
    tile(TL.drop, () => { g.fillStyle = W; g.beginPath(); g.moveTo(0, -54); g.bezierCurveTo(10, -30, 34, 0, 34, 20); g.arc(0, 20, 34, 0, Math.PI); g.bezierCurveTo(-34, 0, -10, -30, 0, -54); g.fill(); g.fillStyle = 'rgba(255,255,255,1)'; g.globalAlpha = 1; });
    tile(TL.bubble, () => { g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.arc(0, 0, 46, 0, TAU); g.fill(); g.strokeStyle = W; g.lineWidth = 7; g.stroke(); g.fillStyle = W; g.beginPath(); g.ellipse(-18, -18, 12, 8, -0.7, 0, TAU); g.fill(); });
    tile(TL.snow, () => { g.shadowColor = W; g.shadowBlur = 8; g.strokeStyle = W; g.lineWidth = 7; g.lineCap = 'round'; for (let i = 0; i < 6; i++) { g.save(); g.rotate(i * Math.PI / 3); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -52); g.moveTo(0, -30); g.lineTo(14, -44); g.moveTo(0, -30); g.lineTo(-14, -44); g.stroke(); g.restore(); } });
    tile(TL.star, () => { g.shadowColor = W; g.shadowBlur = 10; g.fillStyle = W; star(g, 0, 0, 5, 54, 22); g.fill(); });
    tile(TL.petal, () => { g.fillStyle = W; g.beginPath(); g.moveTo(0, -50); g.bezierCurveTo(36, -30, 30, 30, 0, 50); g.bezierCurveTo(-30, 30, -36, -30, 0, -50); g.fill(); g.fillStyle = 'rgba(200,200,200,1)'; g.beginPath(); g.ellipse(0, 20, 10, 24, 0, 0, TAU); g.fill(); });
    tile(TL.splat, () => { g.fillStyle = W; blob(g, 0, 0, 38, 40, 1.3, 0.55); g.fill(); for (let i = 0; i < 7; i++) { const a = i * 0.9 + 0.3, r = 46 + (i % 3) * 6; g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, 5 + (i % 3) * 3, 0, TAU); g.fill(); } });
    tile(TL.gear, () => { g.fillStyle = W; g.beginPath(); for (let i = 0; i < 40; i++) { const a = i / 40 * TAU, r = (i % 5 < 2) ? 56 : 42; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(0, 0, 16, 0, TAU); g.fill(); g.globalCompositeOperation = 'source-over'; g.strokeStyle = 'rgba(150,150,150,1)'; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 30, 0, TAU); g.stroke(); });
    tile(TL.dust, () => { for (let i = 0; i < 9; i++) { const a = i * 2.4, r = (i % 3) * 15, x = Math.cos(a) * r, y = Math.sin(a) * r; g.fillStyle = rad(1, [[0, 'rgba(255,255,255,0.7)'], [0.6, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]); g.save(); g.translate(x, y); g.scale(30, 30); g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.fill(); g.restore(); } });
    tile(TL.flame, () => { const gr = g.createLinearGradient(0, 56, 0, -60); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.shadowColor = W; g.shadowBlur = 12; g.beginPath(); g.moveTo(0, -60); g.bezierCurveTo(10, -30, 40, -6, 36, 22); g.arc(0, 22, 36, 0, Math.PI); g.bezierCurveTo(-40, -6, -6, -24, 0, -60); g.fill(); });
    tile(TL.bolt, () => { g.shadowColor = W; g.shadowBlur = 12; g.strokeStyle = W; g.lineWidth = 8; g.lineJoin = 'round'; g.beginPath(); g.moveTo(-10, -58); g.lineTo(14, -18); g.lineTo(-12, -4); g.lineTo(16, 24); g.lineTo(-4, 58); g.stroke(); });
    tile(TL.square, () => { g.fillStyle = W; g.fillRect(-34, -34, 68, 68); g.fillStyle = 'rgba(190,190,190,1)'; g.fillRect(-34, 10, 68, 24); });
    tile(TL.streak, () => { g.fillStyle = rad(1, [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']]); g.save(); g.scale(62, 20); g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.fill(); g.restore(); });
    tile(TL.xmark, () => { g.shadowColor = W; g.shadowBlur = 10; g.strokeStyle = W; g.lineWidth = 16; g.lineCap = 'round'; g.beginPath(); g.moveTo(-40, -40); g.lineTo(40, 40); g.moveTo(40, -40); g.lineTo(-40, 40); g.stroke(); });
    tile(TL.swirl, () => { g.strokeStyle = W; g.lineWidth = 8; g.lineCap = 'round'; g.shadowColor = W; g.shadowBlur = 8; g.beginPath(); for (let i = 0; i < 60; i++) { const a = i / 60 * TAU * 1.6, r = 6 + i * 0.85; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.stroke(); });
    const rune = (seed) => { g.shadowColor = W; g.shadowBlur = 10; g.strokeStyle = W; g.lineWidth = 9; g.lineCap = 'round'; g.beginPath(); if (seed) { g.moveTo(-30, -46); g.lineTo(-30, 46); g.moveTo(-30, -20); g.lineTo(28, -46); g.moveTo(-30, 6); g.lineTo(30, 40); g.moveTo(10, -10); g.lineTo(30, 10); } else { g.moveTo(0, -50); g.lineTo(0, 50); g.moveTo(-34, -24); g.lineTo(0, 0); g.lineTo(34, -24); g.moveTo(-30, 30); g.lineTo(30, 30); } g.stroke(); };
    tile(TL.rune1, () => rune(0)); tile(TL.rune2, () => rune(1));
    tile(TL.pellet, () => { g.fillStyle = rad(40, [[0, 'rgba(255,255,255,1)'], [0.45, 'rgba(255,255,255,1)'], [0.55, 'rgba(255,255,255,0.4)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(-64, -64, 128, 128); });
    tile(TL.hex, () => { g.fillStyle = 'rgba(255,255,255,0.45)'; g.strokeStyle = W; g.lineWidth = 7; g.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; g.lineTo(Math.cos(a) * 50, Math.sin(a) * 50); } g.closePath(); g.fill(); g.stroke(); });
    tile(TL.impact, () => { g.shadowColor = W; g.shadowBlur = 14; g.fillStyle = W; g.beginPath(); for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, r = i % 2 ? 18 : (i % 4 ? 46 : 60); g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); });
    tile(TL.skull, () => { g.fillStyle = W; g.beginPath(); g.arc(0, -8, 38, 0, TAU); g.fill(); g.fillRect(-22, 18, 44, 28); g.fillStyle = 'rgba(0,0,0,1)'; g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(-15, -8, 11, 0, TAU); g.arc(15, -8, 11, 0, TAU); g.fill(); g.fillRect(-12, 30, 6, 16); g.fillRect(6, 30, 6, 16); g.globalCompositeOperation = 'source-over'; });
    tile(TL.drip, () => { g.fillStyle = W; g.beginPath(); g.moveTo(0, 54); g.bezierCurveTo(10, 30, 30, 0, 30, -16); g.arc(0, -16, 30, 0, Math.PI, true); g.bezierCurveTo(-30, 0, -10, 30, 0, 54); g.fill(); });
    tile(TL.paper, () => { g.fillStyle = W; g.beginPath(); g.moveTo(-40, -30); g.lineTo(36, -40); g.lineTo(40, 34); g.lineTo(-34, 40); g.closePath(); g.fill(); g.strokeStyle = 'rgba(170,170,170,1)'; g.lineWidth = 3; g.beginPath(); g.moveTo(-40, -30); g.lineTo(40, 34); g.stroke(); });
    tile(TL.arrow, () => { g.shadowColor = W; g.shadowBlur = 10; g.fillStyle = W; g.beginPath(); g.moveTo(0, -54); g.lineTo(42, -6); g.lineTo(16, -6); g.lineTo(16, 50); g.lineTo(-16, 50); g.lineTo(-16, -6); g.lineTo(-42, -6); g.closePath(); g.fill(); });
    tile(TL.wisp, () => { g.strokeStyle = W; g.lineWidth = 10; g.lineCap = 'round'; g.shadowColor = W; g.shadowBlur = 14; g.beginPath(); g.moveTo(-40, 40); g.bezierCurveTo(-40, -10, 30, 20, 20, -20); g.bezierCurveTo(14, -44, -12, -40, -6, -24); g.stroke(); });
    tile(TL.coin, () => { g.fillStyle = W; g.beginPath(); g.arc(0, 0, 44, 0, TAU); g.fill(); g.strokeStyle = 'rgba(170,170,170,1)'; g.lineWidth = 6; g.beginPath(); g.arc(0, 0, 32, 0, TAU); g.stroke(); });
    tile(TL.crescent, () => { g.shadowColor = W; g.shadowBlur = 8; g.strokeStyle = W; g.lineWidth = 9; g.lineCap = 'round'; g.beginPath(); g.arc(0, 30, 54, -Math.PI * 0.85, -Math.PI * 0.15); g.stroke(); });
    tile(TL.herb, () => { g.fillStyle = W; g.strokeStyle = 'rgba(140,140,140,1)'; g.lineWidth = 3; for (let i = -2; i <= 2; i++) { g.save(); g.translate(0, 56); g.rotate(i * 0.38); g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(14, -40, 12, -80, 0, -104 + Math.abs(i) * 16); g.bezierCurveTo(-12, -80, -14, -40, 0, 0); g.fill(); g.stroke(); g.restore(); } });
    tile(TL.mushroom, () => { g.fillStyle = '#efe6d6'; g.fillRect(-10, -6, 20, 52); g.fillStyle = W; g.beginPath(); g.ellipse(0, -8, 46, 30, 0, Math.PI, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,1)'; g.globalCompositeOperation = 'source-over'; g.fillStyle = 'rgba(200,200,200,1)'; for (const [x, y] of [[-20, -20], [8, -28], [24, -14]]) { g.beginPath(); g.arc(x, y, 6, 0, TAU); g.fill(); } });
    tile(TL.flowerP, () => { g.strokeStyle = '#4c8a3c'; g.lineWidth = 6; g.beginPath(); g.moveTo(0, 60); g.lineTo(0, 0); g.stroke(); g.fillStyle = '#5aa048'; g.beginPath(); g.ellipse(14, 34, 14, 6, -0.5, 0, TAU); g.fill(); for (let i = 0; i < 6; i++) { g.save(); g.translate(0, -14); g.rotate(i * TAU / 6); g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(0, -18, 12, 20, 0, 0, TAU); g.fill(); g.restore(); } g.fillStyle = '#ffe070'; g.beginPath(); g.arc(0, -14, 10, 0, TAU); g.fill(); });
    tile(TL.rock, () => { g.fillStyle = W; g.beginPath(); g.moveTo(-40, 20); g.lineTo(-26, -30); g.lineTo(14, -40); g.lineTo(42, -6); g.lineTo(30, 34); g.lineTo(-20, 40); g.closePath(); g.fill(); g.fillStyle = 'rgba(170,170,170,1)'; g.beginPath(); g.moveTo(-40, 20); g.lineTo(42, -6); g.lineTo(30, 34); g.lineTo(-20, 40); g.closePath(); g.fill(); });
    tile(TL.crystal, () => { g.fillStyle = W; g.beginPath(); g.moveTo(0, -60); g.lineTo(22, -30); g.lineTo(18, 56); g.lineTo(-18, 56); g.lineTo(-22, -30); g.closePath(); g.fill(); g.fillStyle = 'rgba(190,190,190,1)'; g.beginPath(); g.moveTo(0, -60); g.lineTo(22, -30); g.lineTo(18, 56); g.lineTo(0, 56); g.closePath(); g.fill(); });
    tile(TL.ember, () => { g.fillStyle = rad(22, [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.8)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(-64, -64, 128, 128); });
    tile(TL.sigil, () => { g.shadowColor = W; g.shadowBlur = 8; g.strokeStyle = W; g.lineWidth = 6; g.beginPath(); g.arc(0, 0, 52, 0, TAU); g.stroke(); star(g, 0, 0, 5, 48, 19); g.stroke(); });
    tile(TL.ripple, () => { g.strokeStyle = W; g.lineWidth = 6; g.beginPath(); g.arc(0, 0, 54, 0, TAU); g.stroke(); g.globalAlpha = 0.5; g.lineWidth = 4; g.beginPath(); g.arc(0, 0, 38, 0, TAU); g.stroke(); g.globalAlpha = 1; });
  });
}

// ============================================================================================ shaders / materials
const FXVS = `uniform vec4 uX; uniform float uT; uniform float uR;
varying vec2 vUv; varying vec3 vN;
void main(){
  vUv = uv; vec3 p = position;
#ifdef WAVE
  p.y += sin(uv.x * 16.0 - uT * 12.0) * 0.32 * (0.3 + 0.7 * sin(uv.x * 3.14159));
#endif
#ifdef BB
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec2 sc = vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
  float c = cos(uR), s = sin(uR); vec2 q = p.xy * sc;
  mv.xy += vec2(c * q.x - s * q.y, s * q.x + c * q.y);
#else
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
#endif
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}`;
const FXFS = `uniform vec3 uC; uniform vec3 uC2; uniform float uO; uniform float uP; uniform float uT; uniform vec4 uX; uniform vec4 uTile; uniform sampler2D uMap;
varying vec2 vUv; varying vec3 vN;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x), f.y); }
void main(){
  vec4 col = vec4(0.0);
#if MODE == 0
  vec4 tx = texture2D(uMap, vUv * uTile.zw + uTile.xy);
  col = vec4(tx.rgb * uC, tx.a * uO);
#elif MODE == 1
  float r = length(vUv - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - r), 1.8);
  col = vec4(mix(uC, vec3(1.0), clamp(pow(a, 2.5) * uX.x, 0.0, 1.0)), a * uO);
#elif MODE == 2
  float h = uX.x, tl = uX.y;
  if (vUv.x > h || vUv.x < tl) discard;
  float al = (vUv.x - tl) / max(0.001, h - tl);
  float w = vUv.y, th = 1.0 - (0.2 + 0.8 * pow(al, 0.7)) * uX.z;
  if (w < th) discard;
  float ww = (w - th) / max(0.001, 1.0 - th);
  float edge = smoothstep(0.55, 0.92, ww);
  float n = noise(vec2(vUv.x * 22.0 - uT * 6.0, w * 4.0));
  float a = smoothstep(0.0, 0.35, ww) * (1.0 - smoothstep(0.97, 1.0, ww)) * (0.35 + 0.65 * al) * (0.7 + 0.45 * n);
  vec3 c = mix(uC2, uC, al); c = mix(c, vec3(1.0), edge * al * 0.85);
  col = vec4(c, clamp(a, 0.0, 1.0) * uO);
#elif MODE == 3
  float d = abs(vUv.y - 0.5) * 2.0;
  float core = 1.0 - smoothstep(0.0, uX.x, d);
  float glow = pow(1.0 - d, 2.2);
  float n = noise(vec2(vUv.x * uX.y - uT * uX.z, uT * 4.0 + vUv.y * 2.0));
  float endf = smoothstep(0.0, uX.w, vUv.x) * smoothstep(1.0, 1.0 - uX.w, vUv.x);
  float a = (glow * (0.45 + 0.55 * n) + core) * endf;
  col = vec4(mix(uC, vec3(1.0), clamp(core * 0.9, 0.0, 1.0)), clamp(a, 0.0, 1.0) * uO);
#elif MODE == 4
  float r = length(vUv - 0.5) * 2.0;
  float d = (r - uX.x) / uX.y;
  float a = exp(-d * d * 2.5) + (r < uX.x ? exp(d * 1.2) * uX.z : 0.0);
  a *= smoothstep(1.0, 0.96, r);
  col = vec4(mix(uC, vec3(1.0), exp(-d * d * 8.0) * 0.3), clamp(a, 0.0, 1.0) * uO);
#elif MODE == 5
  vec2 p = vUv - 0.5; float r = length(p) * 2.0;
  float ca = cos(uX.x), sa = sin(uX.x); vec2 q = vec2(ca * p.x - sa * p.y, sa * p.x + ca * p.y) + 0.5;
  vec4 tx = texture2D(uMap, q);
  float edge = 1.0 - smoothstep(0.9, 1.0, r);
  float rim = exp(-pow((r - 0.94) / 0.045, 2.0)) * uX.z;
  float sheen = uX.w * pow(max(0.0, sin((vUv.x + vUv.y) * 6.0 - uT * 1.8)), 12.0) * tx.a;
  vec3 c = tx.rgb * uC * (1.0 + uX.y) + sheen;
  c = mix(c, uC2 * (1.0 + uX.y), clamp(rim, 0.0, 1.0));
  col = vec4(c, clamp((tx.a * (1.0 + uX.y * 0.6) + rim * 0.9 + sheen) * edge, 0.0, 1.0) * uO);
#elif MODE == 6
  float a;
  if (uX.w < 0.5) {
    float r = length(vUv - 0.5) * 2.0; if (r > 1.0) discard;
    float rim = smoothstep(0.9, 0.96, r);
    float fill = r < uP ? 0.32 + 0.22 * smoothstep(uP - 0.25, uP, r) : 0.0;
    float front = exp(-pow((r - uP) / 0.03, 2.0)) * 0.7 * step(r, uP + 0.05);
    float stripes = 0.06 * step(0.5, fract((vUv.x + vUv.y) * 9.0 + uT * 0.6));
    a = 0.16 + stripes + fill + front + rim * 0.75;
  } else {
    float ex = min(vUv.x, 1.0 - vUv.x), ey = min(vUv.y, 1.0 - vUv.y);
    float rim = 1.0 - smoothstep(0.06, 0.12, min(ex * uX.x, ey * uX.y));
    float fill = vUv.y < uP ? 0.32 + 0.22 * smoothstep(uP - 0.2, uP, vUv.y) : 0.0;
    float stripes = 0.06 * step(0.5, fract((vUv.x * uX.x - vUv.y * uX.y) * 1.5 + uT * 0.6));
    float front = exp(-pow((vUv.y - uP) / 0.025, 2.0)) * 0.7 * step(vUv.y, uP + 0.04);
    a = 0.16 + stripes + fill + front + rim * 0.75;
  }
  col = vec4(mix(uC, vec3(1.0, 0.95, 0.85), clamp(a - 0.6, 0.0, 0.4)), clamp(a, 0.0, 1.0) * uO);
#elif MODE == 7
  float front = uP * (1.0 + uX.y) - uX.y;
  if (vUv.x > uP) discard;
  vec4 tx = texture2D(uMap, vec2(vUv.x * uTile.z + uTile.x, vUv.y));
  float tail = smoothstep(uX.x - 0.05, uX.x + 0.05, vUv.x) ;
  col = vec4(tx.rgb * uC, tx.a * uO * (uX.x > 0.0 ? tail : 1.0));
#elif MODE == 8
  float f = pow(1.0 - abs(vN.z), uX.x);
  float pat = texture2D(uMap, vUv * uTile.zw + vec2(0.0, uT * 0.05)).a * uX.y;
  col = vec4(mix(uC, uC2, clamp(f, 0.0, 1.0)), clamp(uX.z + f * uX.w + pat * (0.4 + f), 0.0, 1.0) * uO);
#elif MODE == 9
  float x = vUv.x, y = vUv.y;
  float n = noise(vec2(x * 7.0 - uT * 2.0, y * 4.0 + uT));
  float side = smoothstep(0.0, 0.18, x) * smoothstep(1.0, 0.82, x);
  float foam = smoothstep(0.72 + n * 0.12, 0.9, y);
  vec3 c = mix(uC2, uC, smoothstep(0.0, 0.8, y) + n * 0.15);
  c = mix(c, vec3(1.0), foam);
  float stripes = 0.15 * smoothstep(0.6, 1.0, sin((x * 9.0 + y * 3.0) - uT * 5.0));
  col = vec4(c + stripes, side * (0.55 + 0.45 * y + foam * 0.4) * smoothstep(0.0, 0.12, y) * uO);
#elif MODE == 10
  float f = pow(1.0 - abs(vN.z), 1.5);
  float a = mix(uX.x, uX.y, vUv.y) * mix(1.0, f, uX.z);
  float flick = 0.85 + 0.15 * noise(vec2(vUv.x * 10.0 + uT * 0.5, uT));
  col = vec4(uC, clamp(a * flick, 0.0, 1.0) * uO);
#elif MODE == 11
  float d = abs(vUv.y - 0.5) * 2.0;
  float a = pow(vUv.x, 1.4) * (1.0 - d * d);
  vec3 c = mix(uC2, uC, vUv.x); c = mix(c, vec3(1.0), (1.0 - smoothstep(0.0, 0.35, d)) * vUv.x * 0.8);
  col = vec4(c, clamp(a, 0.0, 1.0) * uO);
#elif MODE == 12
  vec2 p = vUv - 0.5; float r = length(p) * 2.0; if (r > 1.0) discard;
  float a = smoothstep(1.0, 0.6, r) * (0.55 + 0.45 * noise(p * 6.0 + uT * 0.3));
  col = vec4(uC, a * uO);
#elif MODE == 13
  float a = sin(vUv.y * 3.14159) * pow(sin(vUv.x * 3.14159), 0.6);
  col = vec4(mix(uC, vec3(1.0), smoothstep(0.75, 1.0, a) * 0.5), a * uO);
#endif
  if (col.a < 0.004) discard;
  gl_FragColor = col;
  #include <colorspace_fragment>
}`;
const MODE = { tex: 0, glow: 1, slash: 2, beam: 3, ring: 4, area: 5, tele: 6, reveal: 7, fresnel: 8, water: 9, grad: 10, trail: 11, puddle: 12, band: 13 };
const MATC = new Map();
/** shared ShaderMaterial; per-object values are pushed in onBeforeRender (mesh.fxu) */
function fxMat(mode, o = {}) {
  const blend = o.add === false ? 'n' : 'a', side = o.side ?? THREE.DoubleSide, map = o.map || null, bb = !!o.bb, wave = !!o.wave, dt = o.depthTest !== false;
  const key = `${mode}|${blend}|${side}|${map ? map.uuid : '-'}|${bb}|${wave}|${dt}`;
  let m = MATC.get(key); if (m) return m;
  const defines = { MODE: MODE[mode] }; if (bb) defines.BB = 1; if (wave) defines.WAVE = 1;
  m = new THREE.ShaderMaterial({
    uniforms: { uC: { value: new THREE.Color() }, uC2: { value: new THREE.Color() }, uO: { value: 1 }, uP: { value: 0 }, uT: { value: 0 }, uR: { value: 0 }, uX: { value: new THREE.Vector4() }, uTile: { value: new THREE.Vector4(0, 0, 1, 1) }, uMap: { value: map } },
    vertexShader: FXVS, fragmentShader: FXFS, defines, transparent: true, depthWrite: false, depthTest: dt, side,
    blending: blend === 'a' ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false,
  });
  MATC.set(key, m); return m;
}
function fxOBR(r, s, c, g, mat) {
  const u = mat.uniforms, f = this.fxu; if (!u || !f) return;
  u.uC.value.copy(f.c); u.uC2.value.copy(f.c2); u.uO.value = f.o; u.uP.value = f.p; u.uT.value = f.t; u.uR.value = f.r; u.uX.value.copy(f.x); u.uTile.value.copy(f.tile);
  mat.uniformsNeedUpdate = true;
}
function fxu() { return { c: new THREE.Color(1, 1, 1), c2: new THREE.Color(1, 1, 1), o: 1, p: 0, t: 0, r: 0, x: new THREE.Vector4(), tile: new THREE.Vector4(0, 0, 1, 1) }; }
/** mesh with per-object FX uniforms */
function fxMesh(geo, mat, order = 5) {
  const m = new THREE.Mesh(geo, mat); m.fxu = fxu(); m.onBeforeRender = fxOBR; m.frustumCulled = false; m.renderOrder = order; return m;
}
const setTile = (m, i) => { m.fxu.tile.set((i % 8) / 8, 1 - (Math.floor(i / 8) + 1) / 8, 1 / 8, 1 / 8); return m; };
/** billboard sprite using an atlas tile */
function tileSprite(tile, color, add = true, order = 5) { const m = fxMesh(G.plane(), fxMat('tex', { map: atlasTex(), bb: true, add }), order); setTile(m, tile); if (color !== undefined) m.fxu.c.set(color); return m; }
function glowSprite(color, order = 5) { const m = fxMesh(G.plane(), fxMat('glow', { bb: true }), order); m.fxu.c.set(color); m.fxu.x.x = 1; return m; }

// lit model materials (Lambert, flat-shaded chunky look), shared per colour
const LAMC = new Map();
function lam(color, o = {}) {
  const key = `${color}|${o.em ?? ''}|${o.ei ?? ''}|${o.op ?? 1}|${o.smooth ? 1 : 0}|${o.vc ? 1 : 0}|${o.ds ? 1 : 0}`;
  let m = LAMC.get(key); if (m) return m;
  m = new THREE.MeshLambertMaterial({ color, flatShading: !o.smooth, vertexColors: !!o.vc });
  if (o.em !== undefined) { m.emissive = new THREE.Color(o.em); m.emissiveIntensity = o.ei ?? 1; }
  if (o.ds) m.side = THREE.DoubleSide;
  if (o.op !== undefined && o.op < 1) { m.transparent = true; m.opacity = o.op; m.depthWrite = false; }
  LAMC.set(key, m); return m;
}

// ============================================================================================ geometry cache
const GEOC = new Map();
const gc = (key, fn) => { let g = GEOC.get(key); if (!g) { g = fn(); GEOC.set(key, g); } return g; };
const G = {
  plane: () => gc('plane', () => new THREE.PlaneGeometry(1, 1)),
  ground: () => gc('ground', () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)),               // xz, uv as seen from above
  strip: (n = 24) => gc('strip' + n, () => new THREE.PlaneGeometry(1, 1, n, 1).translate(0.5, 0, 0)),     // x 0..1 along, y width
  stripG: (n = 24) => gc('stripG' + n, () => new THREE.PlaneGeometry(1, 1, n, 1).translate(0.5, 0, 0).rotateX(-Math.PI / 2)),
  ico: (d = 1) => gc('ico' + d, () => new THREE.IcosahedronGeometry(1, d)),
  sphere: (w = 10, h = 7) => gc(`sph${w}_${h}`, () => new THREE.SphereGeometry(1, w, h)),
  cyl: (rt = 1, rb = 1, h = 1, s = 8, open = false) => gc(`cyl${rt}_${rb}_${h}_${s}_${open}`, () => new THREE.CylinderGeometry(rt, rb, h, s, 1, open)),
  cone: (s = 8) => gc('cone' + s, () => new THREE.ConeGeometry(1, 1, s)),
  box: () => gc('box', () => new THREE.BoxGeometry(1, 1, 1)),
  torus: (t = 0.15, rs = 6, ts = 16, arc = TAU) => gc(`tor${t}_${rs}_${ts}_${arc}`, () => new THREE.TorusGeometry(1, t, rs, ts, arc)),
  capsule: () => gc('capsule', () => new THREE.CapsuleGeometry(0.5, 1, 2, 6)),
  /** ring-sector in xz (three), centred on local +z, outer radius 1, inner `inner`; uv.x = sweep progress, uv.y = 0 inner..1 outer */
  arc: (angleDeg, inner = 0.45, flip = false) => gc(`arc${Math.round(angleDeg / 5) * 5}_${inner}_${flip}`, () => {
    const A = Math.min(360, Math.max(10, Math.round(angleDeg / 5) * 5)) * DEG, n = Math.max(8, Math.ceil(A / (8 * DEG))), P = [], U = [], I = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = -A / 2 + A * (flip ? 1 - t : t), s = Math.sin(a), c = Math.cos(a);
      P.push(s * inner, 0, c * inner, s, 0, c); U.push(t, 0, t, 1);
      if (i < n) { const k = i * 2; I.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(P.map((_, i) => i % 3 === 1 ? 1 : 0), 3)); g.setIndex(I); return g;
  }),
  /** vertical crescent wall: arc in xz convex toward +z, height 1 (uv.y), uv.x along */
  crescent: () => gc('crescent', () => {
    const n = 20, P = [], U = [], I = [], A = 140 * DEG;
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = -A / 2 + A * t, x = Math.sin(a), z = Math.cos(a) - 1, h = Math.sin(t * Math.PI);
      P.push(x, 0, z, x * 1.05, 0.2 + 0.8 * h, z + 0.25 * h); U.push(t, 0, t, 1);
      if (i < n) { const k = i * 2; I.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I); g.computeVertexNormals(); return g;
  }),
  /** curved tube (vine/tentacle) with taper */
  tube: (key, pts, r = 0.06, seg = 16, rs = 5) => gc('tube' + key, () => {
    const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)));
    const g = new THREE.TubeGeometry(curve, seg, r, rs, false), pos = g.attributes.position, n = rs + 1;
    for (let i = 0; i <= seg; i++) { const t = i / seg, k = 1 - 0.85 * t, c = curve.getPointAt(t); for (let j = 0; j < n; j++) { const vi = i * n + j; _v1.fromBufferAttribute(pos, vi).sub(c).multiplyScalar(k).add(c); pos.setXYZ(vi, _v1.x, _v1.y, _v1.z); } }
    g.computeVertexNormals(); return g;
  }),
  lathe: (key, prof, s = 10) => gc('lathe' + key, () => new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), s)),
  shape: (key, fn, depth = 0) => gc('shape' + key, () => { const sh = new THREE.Shape(); fn(sh); return depth ? new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false }) : new THREE.ShapeGeometry(sh, 6); }),
};
// blobby (noise displaced) icosphere for paint globs / clouds / foliage
function lumpy(key, d = 1, amt = 0.18, seed = 1) {
  return gc('lumpy' + key, () => {
    const g = new THREE.IcosahedronGeometry(1, d), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { _v1.fromBufferAttribute(p, i); const n = 1 + amt * Math.sin(_v1.x * 4.1 + seed) * Math.sin(_v1.y * 3.7 + seed * 2) * Math.sin(_v1.z * 4.3 + seed * 3) * 2.2; _v1.multiplyScalar(n); p.setXYZ(i, _v1.x, _v1.y, _v1.z); }
    g.computeVertexNormals(); return g;
  });
}

// ============================================================================================ particles (2 instanced buffers)
const PVS = `attribute vec4 iPos; attribute vec4 iCol; attribute vec4 iExt; attribute vec3 iDir;
varying vec2 vUv; varying vec4 vCol;
void main(){
  vCol = iCol;
  float tile = iExt.y; float tx = mod(tile, 8.0), ty = floor(tile / 8.0 + 0.001);
  vUv = vec2((tx + uv.x) / 8.0, 1.0 - (ty + 1.0 - uv.y) / 8.0);
  vec2 q = position.xy; float c = cos(iExt.x), s = sin(iExt.x);
  vec4 mv;
  if (iExt.z > 1.5) {
    vec3 vd = (viewMatrix * vec4(iDir, 0.0)).xyz; float L = length(vd.xy);
    vec2 ax = L > 1e-4 ? vd.xy / L : vec2(1.0, 0.0); vec2 ay = vec2(-ax.y, ax.x);
    mv = viewMatrix * vec4(iPos.xyz, 1.0);
    mv.xy += ax * q.x * (iPos.w + L * iExt.w) + ay * q.y * iPos.w;
  } else if (iExt.z > 0.5) {
    vec2 r = vec2(c * q.x - s * q.y, s * q.x + c * q.y) * iPos.w;
    mv = viewMatrix * vec4(iPos.x + r.x, iPos.y, iPos.z + r.y, 1.0);
  } else {
    vec2 r = vec2(c * q.x - s * q.y, s * q.x + c * q.y) * iPos.w;
    mv = viewMatrix * vec4(iPos.xyz, 1.0); mv.xy += r;
  }
  gl_Position = projectionMatrix * mv;
}`;
const PFS = `uniform sampler2D uMap; varying vec2 vUv; varying vec4 vCol;
void main(){ vec4 t = texture2D(uMap, vUv); gl_FragColor = vec4(t.rgb * vCol.rgb, t.a * vCol.a); if (gl_FragColor.a < 0.004) discard;
  #include <colorspace_fragment>
}`;
const PK = 24; // floats per particle in the sim buffer
class Particles {
  constructor(cap, additive) {
    this.cap = cap; this.n = 0; this.s = new Float32Array(cap * PK); this.fo = new Float32Array(cap);
    const base = new THREE.PlaneGeometry(1, 1), g = new THREE.InstancedBufferGeometry();
    g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
    const ia = (n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.aPos = ia(4); this.aCol = ia(4); this.aExt = ia(4); this.aDir = ia(3);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iCol', this.aCol); g.setAttribute('iExt', this.aExt); g.setAttribute('iDir', this.aDir);
    g.instanceCount = 0; this.geo = g;
    this.mat = new THREE.ShaderMaterial({ uniforms: { uMap: { value: atlasTex() } }, vertexShader: PVS, fragmentShader: PFS, transparent: true, depthWrite: false, toneMapped: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = additive ? 6 : 4;
  }
  // x,y,z three space; colours linear rgb
  emit(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, r2, g2, b2, a, tile, mode, grav, drag, rot, spin, str, fo) {
    if (this.n >= this.cap) return;
    const o = this.n++ * PK, s = this.s;
    s[o] = x; s[o + 1] = y; s[o + 2] = z; s[o + 3] = vx; s[o + 4] = vy; s[o + 5] = vz; s[o + 6] = 0; s[o + 7] = life; s[o + 8] = s0; s[o + 9] = s1;
    s[o + 10] = r; s[o + 11] = g; s[o + 12] = b; s[o + 13] = r2; s[o + 14] = g2; s[o + 15] = b2; s[o + 16] = a; s[o + 17] = tile; s[o + 18] = mode;
    s[o + 19] = grav; s[o + 20] = drag; s[o + 21] = rot; s[o + 22] = spin; s[o + 23] = str; this.fo[this.n - 1] = fo;
  }
  update(dt) {
    const s = this.s, P = this.aPos.array, C = this.aCol.array, E = this.aExt.array, D = this.aDir.array, fo = this.fo;
    let n = this.n;
    for (let i = 0; i < n; i++) {
      let o = i * PK;
      s[o + 6] += dt;
      if (s[o + 6] >= s[o + 7]) { // dead: swap with last
        n--; if (i !== n) { s.copyWithin(o, n * PK, n * PK + PK); fo[i] = fo[n]; } i--; continue;
      }
      const dr = Math.max(0, 1 - s[o + 20] * dt);
      s[o + 3] *= dr; s[o + 5] *= dr; s[o + 4] = s[o + 4] * dr - s[o + 19] * dt;
      s[o] += s[o + 3] * dt; s[o + 1] += s[o + 4] * dt; s[o + 2] += s[o + 5] * dt;
      s[o + 21] += s[o + 22] * dt;
      const u = s[o + 6] / s[o + 7], f = fo[i];
      const fin = Math.min(1, u * 12), fout = u < f ? 1 : 1 - (u - f) / (1 - f);
      const sz = s[o + 8] + (s[o + 9] - s[o + 8]) * (1 - (1 - u) * (1 - u));
      const j4 = i * 4, j3 = i * 3;
      P[j4] = s[o]; P[j4 + 1] = s[o + 1]; P[j4 + 2] = s[o + 2]; P[j4 + 3] = sz;
      C[j4] = s[o + 10] + (s[o + 13] - s[o + 10]) * u; C[j4 + 1] = s[o + 11] + (s[o + 14] - s[o + 11]) * u; C[j4 + 2] = s[o + 12] + (s[o + 15] - s[o + 12]) * u; C[j4 + 3] = s[o + 16] * fin * fout;
      E[j4] = s[o + 21]; E[j4 + 1] = s[o + 17]; E[j4 + 2] = s[o + 18]; E[j4 + 3] = s[o + 23];
      D[j3] = s[o + 3]; D[j3 + 1] = s[o + 4]; D[j3 + 2] = s[o + 5];
    }
    this.n = n; this.geo.instanceCount = n;
    for (const a of [this.aPos, this.aCol, this.aExt]) { a.clearUpdateRanges(); a.addUpdateRange(0, Math.max(1, n) * 4); a.needsUpdate = true; }
    this.aDir.clearUpdateRanges(); this.aDir.addUpdateRange(0, Math.max(1, n) * 3); this.aDir.needsUpdate = true;
  }
  clear() { this.n = 0; this.geo.instanceCount = 0; }
}

// --- emitter specs ------------------------------------------------------------------------------
// {n, tile, add(true)|false, col, col2, a, size:[a,b], grow, life:[a,b], spd:[a,b], up:[a,b], shape, rad, y:[a,b], grav, drag, mode(0 bb,1 flat,2 stretch), str, spin, fo, tint(true), spread}
function compileSpec(sp) {
  if (sp._c) return sp;
  const cols = Array.isArray(sp.col) ? sp.col : [sp.col ?? 0xffffff];
  sp._c = cols.map(hexC); sp._c2 = sp.col2 !== undefined ? hexC(sp.col2) : null;
  return sp;
}
const SPR = { r: 1 };
const R2 = (r, d) => r === undefined ? d : typeof r === 'number' ? r : r[0] + Math.random() * (r[1] - r[0]);
/** emit spec at three-space centre (cx,cy,cz). sc scales size/speed/radius. tint: Color override. dx,dz = three-space unit direction for cones */
function spray(fx, sp, cx, cy, cz, sc = 1, tint = null, dx = 0, dz = 1, nOv = -1) {
  compileSpec(sp);
  const sys = sp.add === false ? fx.pn : fx.pa;
  const fill = sys.n / sys.cap, nf = (nOv >= 0 ? nOv : (sp.n ?? 10)) * (fill > 0.6 ? Math.max(0, (1 - fill) / 0.4) : 1), N = Math.floor(nf) + (Math.random() < nf % 1 ? 1 : 0);
  const fl = sp.flash ? (SkillFx.reduceFlash ? 0.4 : 1) : 1;
  for (let i = 0; i < N; i++) {
    let c = sp._c[(Math.random() * sp._c.length) | 0], c2 = sp._c2 || c;
    if (tint && sp.tint !== false) { _c1.copy(tint); if (sp._c2) _c2.copy(tint).multiplyScalar(0.55); else _c2.copy(tint); c = _c1; c2 = _c2; }
    const spd = R2(sp.spd, 0) * sc, up = R2(sp.up, 0) * sc, rad = sp.rr !== undefined ? sp.rr * SPR.r : (sp.rad ?? 0) * sc;
    let x = cx, y = cy + R2(sp.y, 0) * sc, z = cz, vx = 0, vy = up, vz = 0;
    switch (sp.shape) {
      case 'sphere': { const u = Math.random() * 2 - 1, a = Math.random() * TAU, q = Math.sqrt(1 - u * u); const ny = Math.abs(u) * (sp.hemi ? 1 : Math.sign(u)); vx = Math.cos(a) * q * spd; vz = Math.sin(a) * q * spd; vy += ny * spd; x += vx / Math.max(spd, 1e-6) * rad; z += vz / Math.max(spd, 1e-6) * rad; y += ny * rad; break; }
      case 'ring': { const a = sp.even ? i / N * TAU + Math.random() * 0.3 : Math.random() * TAU; vx = Math.cos(a) * spd; vz = Math.sin(a) * spd; x += Math.cos(a) * rad; z += Math.sin(a) * rad; break; }
      case 'disc': { const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * rad; x += Math.cos(a) * r; z += Math.sin(a) * r; const b = Math.random() * TAU; vx = Math.cos(b) * spd; vz = Math.sin(b) * spd; break; }
      case 'cone': { const sprd = (sp.spread ?? 30) * DEG, a = (Math.random() * 2 - 1) * sprd, ca = Math.cos(a), sa = Math.sin(a); const ux = dx * ca - dz * sa, uz = dx * sa + dz * ca; vx = ux * spd; vz = uz * spd; const o = R2(sp.off, 0) * sc; x += ux * (rad * Math.random() + o); z += uz * (rad * Math.random() + o); break; }
      case 'line': { const t = Math.random(); x += dx * t; z += dz * t; y += (sp.ly ?? 0) * t; const b = Math.random() * TAU; vx = Math.cos(b) * spd; vz = Math.sin(b) * spd; break; }
      default: { const b = Math.random() * TAU; vx = Math.cos(b) * spd; vz = Math.sin(b) * spd; }
    }
    if (sp.fwd) { const f = R2(sp.fwd, 0) * sc; x += dx * f; z += dz * f; }
    const s0 = R2(sp.size, 0.3) * sc * (sp.flash ? fl : 1);
    const a = (sp.a ?? 1) * (sp.flash ? (SkillFx.reduceFlash ? 0.45 : 1) : 1);
    sys.emit(x, y, z, vx, vy, vz, R2(sp.life, 0.6), s0, s0 * (sp.grow ?? 1), c.r, c.g, c.b, c2.r, c2.g, c2.b, a, sp.tile ?? 0, sp.mode ?? 0,
      (sp.grav ?? 0) * sc, sp.drag ?? 0, sp.rot0 !== undefined ? sp.rot0 : Math.random() * TAU, (sp.spin ?? 0) * (Math.random() < 0.5 ? -1 : 1) * rnd(0.6, 1.2), sp.str ?? 0.08, sp.fo ?? 0.5);
  }
}

// ============================================================================================ dynamic strip (lightning, trails)
class DynStrip {
  constructor(n) {
    this.n = n; const P = new Float32Array(n * 2 * 3), U = [], I = [];
    for (let i = 0; i < n; i++) { U.push(i / (n - 1), 0, i / (n - 1), 1); if (i < n - 1) { const k = i * 2; I.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } }
    this.geo = new THREE.BufferGeometry(); this.pos = new THREE.BufferAttribute(P, 3); this.pos.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.pos); this.geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); this.geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(n * 6).fill(0).map((_, i) => i % 3 === 2 ? 1 : 0), 3)); this.geo.setIndex(I);
    this.pts = []; for (let i = 0; i < n; i++) this.pts.push(new THREE.Vector3());
  }
  /** build camera-facing ribbon from this.pts (count = n); width(i) */
  build(wfn, flat = false) {
    const P = this.pos.array, n = this.n, pts = this.pts;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      _v1.subVectors(b, a); if (_v1.lengthSq() < 1e-10) _v1.set(1, 0, 0);
      if (flat) _v2.set(-_v1.z, 0, _v1.x); else _v2.crossVectors(_v1, CAMF);
      if (_v2.lengthSq() < 1e-10) _v2.set(0, 1, 0);
      _v2.normalize().multiplyScalar(wfn(i / (n - 1)) * 0.5);
      const p = pts[i], k = i * 6;
      P[k] = p.x - _v2.x; P[k + 1] = p.y - _v2.y; P[k + 2] = p.z - _v2.z; P[k + 3] = p.x + _v2.x; P[k + 4] = p.y + _v2.y; P[k + 5] = p.z + _v2.z;
    }
    this.pos.needsUpdate = true;
  }
}
const STRIPPOOL = new Map();
function getStrip(n) { const p = STRIPPOOL.get(n); return (p && p.pop()) || new DynStrip(n); }
function putStrip(s) { let p = STRIPPOOL.get(s.n); if (!p) STRIPPOOL.set(s.n, p = []); p.push(s); }

/** orient a 'strip' mesh (x 0..1 along, y width) from a to b (three space). flat: lies on ground. */
function orientStrip(m, a, b, width, flat = false) {
  _v1.subVectors(b, a); const L = Math.max(1e-4, _v1.length()); _v1.divideScalar(L);
  if (flat) _v2.set(-_v1.z, 0, _v1.x); else _v2.crossVectors(_v1, CAMF);
  if (_v2.lengthSq() < 1e-8) _v2.set(0, 1, 0); _v2.normalize();
  _v3.crossVectors(_v1, _v2).normalize();
  if (flat && _v3.y < 0) { _v2.negate(); _v3.negate(); }
  _m4.makeBasis(_v1, _v2, _v3); m.quaternion.setFromRotationMatrix(_m4);
  m.position.copy(a); m.scale.set(L, width, 1);
  return L;
}
/** jagged lightning points between a and b into strip.pts */
function jag(strip, a, b, amp) {
  const n = strip.n; _v1.subVectors(b, a); const L = _v1.length();
  _v2.crossVectors(_v1, CAMF).normalize(); _v3.crossVectors(_v1, _v2).normalize();
  let o1 = 0, o2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), env = Math.sin(t * Math.PI);
    o1 = (o1 * 0.4 + (Math.random() * 2 - 1)) ; o2 = (o2 * 0.4 + (Math.random() * 2 - 1));
    strip.pts[i].copy(a).addScaledVector(_v1, t).addScaledVector(_v2, o1 * amp * L * 0.12 * env).addScaledVector(_v3, o2 * amp * L * 0.06 * env);
  }
}

// ============================================================================================ decal textures
const texScorch = () => ctex('scorch', 256, (g) => {
  for (let i = 0; i < 26; i++) { const a = i * 2.39, r = (i % 5) * 18, x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r, rr = 70 - (i % 5) * 9;
    const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, 'rgba(30,22,18,0.22)'); gr.addColorStop(1, 'rgba(30,22,18,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); }
  g.fillStyle = 'rgba(255,140,40,0.85)'; for (let i = 0; i < 30; i++) { const a = i * 1.7, r = 30 + (i * 37) % 70; g.beginPath(); g.arc(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 1.5 + (i % 3), 0, TAU); g.fill(); }
});
const texFrost = () => ctex('frost', 256, (g) => {
  const gr = g.createRadialGradient(128, 128, 10, 128, 128, 126); gr.addColorStop(0, 'rgba(200,240,255,0.55)'); gr.addColorStop(0.75, 'rgba(170,225,255,0.4)'); gr.addColorStop(1, 'rgba(170,225,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineCap = 'round';
  for (let i = 0; i < 14; i++) { const a = i / 14 * TAU + (i % 2) * 0.2; let x = 128, y = 128; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y);
    for (let k = 1; k <= 5; k++) { const r = k * 22, aa = a + Math.sin(k * 3 + i) * 0.15; x = 128 + Math.cos(aa) * r; y = 128 + Math.sin(aa) * r; g.lineTo(x, y);
      if (k > 1) { g.moveTo(x, y); g.lineTo(x + Math.cos(aa + 0.7) * 12, y + Math.sin(aa + 0.7) * 12); g.moveTo(x, y); g.lineTo(x + Math.cos(aa - 0.7) * 12, y + Math.sin(aa - 0.7) * 12); g.moveTo(x, y); } }
    g.stroke(); }
  g.fillStyle = 'rgba(255,255,255,0.9)'; for (let i = 0; i < 40; i++) { const a = i * 2.1, r = (i * 53) % 118; g.beginPath(); g.arc(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 1.5, 0, TAU); g.fill(); }
});
const texCrack = () => ctex('crack', 256, (g) => {
  g.strokeStyle = 'rgba(25,18,14,0.95)'; g.lineCap = 'round'; g.lineJoin = 'round';
  const br = (x, y, a, len, w, d) => { if (d > 2 || len < 8) return; g.lineWidth = w; g.beginPath(); g.moveTo(x, y); let cx = x, cy = y; const steps = 4;
    for (let k = 0; k < steps; k++) { a += (Math.random() - 0.5) * 0.6; cx += Math.cos(a) * len / steps; cy += Math.sin(a) * len / steps; g.lineTo(cx, cy); } g.stroke();
    br(cx, cy, a + 0.5, len * 0.6, w * 0.65, d + 1); if (Math.random() < 0.7) br(cx, cy, a - 0.5, len * 0.55, w * 0.6, d + 1); };
  for (let i = 0; i < 9; i++) br(128, 128, i / 9 * TAU + Math.random() * 0.3, 74, 10, 0);
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 40); gr.addColorStop(0, 'rgba(40,30,20,0.6)'); gr.addColorStop(1, 'rgba(40,30,20,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
});

// burning crack: the same seeded crack pattern drawn twice -> charred lines (normal blend) + glowing lava core (additive)
function fireCrackPaint(g, glow) {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  g.lineCap = 'round'; g.lineJoin = 'round';
  const segs = [];
  const br = (x, y, a, len, w, d) => { if (d > 2 || len < 8) return; const pts = [[x, y]]; let cx = x, cy = y;
    for (let k = 0; k < 4; k++) { a += (rnd() - 0.5) * 0.6; cx += Math.cos(a) * len / 4; cy += Math.sin(a) * len / 4; pts.push([cx, cy]); } segs.push([pts, w]);
    br(cx, cy, a + 0.5, len * 0.6, w * 0.65, d + 1); if (rnd() < 0.7) br(cx, cy, a - 0.5, len * 0.55, w * 0.6, d + 1); };
  for (let i = 0; i < 9; i++) br(128, 128, i / 9 * TAU + rnd() * 0.3, 78, 12, 0);
  const stroke = (col, k, blur) => { g.strokeStyle = col; g.shadowColor = blur ? col : 'transparent'; g.shadowBlur = blur || 0;
    for (const [pts, w] of segs) { g.lineWidth = w * k; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); } };
  if (!glow) { stroke('rgba(22,14,10,0.95)', 1.25, 0); const gr = g.createRadialGradient(128, 128, 0, 128, 128, 46); gr.addColorStop(0, 'rgba(30,18,10,0.7)'); gr.addColorStop(1, 'rgba(30,18,10,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); }
  else { stroke('rgba(255,110,20,0.9)', 0.9, 10); stroke('rgba(255,220,120,1)', 0.38, 4); const gr = g.createRadialGradient(128, 128, 0, 128, 128, 40); gr.addColorStop(0, 'rgba(255,150,40,0.8)'); gr.addColorStop(1, 'rgba(255,90,10,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); }
}
const texFireCrack = () => ctex('firecrack', 256, (g) => fireCrackPaint(g, false));
const texFireCrackGlow = () => ctex('firecrack_glow', 256, (g) => fireCrackPaint(g, true));

// ============================================================================================ layers (declarative rig parts)
const CUSTOM = {};
function mkLayer(L) {
  L._c = L._c || hexC(L.col ?? 0xffffff);
  switch (L.type) {
    case 'flash': return glowSprite(0xffffff, 6);
    case 'shock': return fxMesh(G.ground(), fxMat('ring', { add: !!L.add }), 3);
    case 'vring': return fxMesh(G.plane(), fxMat('ring', { bb: true, add: !!L.add }), 5);
    case 'decal': return fxMesh(G.ground(), fxMat('tex', { map: L.tex(), add: !!L.add }), 3);
    case 'gtile': return setTile(fxMesh(G.ground(), fxMat('tex', { map: atlasTex(), add: !!L.add }), 3), L.tile);
    case 'sprite': return tileSprite(L.tile, 0xffffff, L.add !== false, 6);
    default: return CUSTOM[L.type].build(L);
  }
}
function startLayer(m, L, e) {
  m.visible = false;
  if (L.type === 'decal' || L.type === 'gtile') m.rotation.y = L.rot ?? Math.random() * TAU;
  const C = CUSTOM[L.type]; if (C && C.start) C.start(m, L, e);
}
function animLayer(m, L, e) {
  const t = e.t - (L.at || 0), d = L.dur ?? e.dur;
  if (t < 0 || t > d) { m.visible = false; return; }
  m.visible = true; const u = t / d, f = m.fxu, s = e.sc;
  if (f) f.c.copy(L.tint !== false && e.tint ? e.tint : L._c);
  const fl = SkillFx.reduceFlash ? 0.4 : 1;
  switch (L.type) {
    case 'flash': { const k = (L.size ?? 2) * s * (0.5 + 0.5 * fl) * (1 + 0.1 * (e.tier || 0)); m.scale.setScalar(k * (0.55 + 0.6 * easeOut(Math.min(1, u * 2)))); m.position.set(0, (L.y ?? 0.6) * s, 0); f.o = (1 - u) * (1 - u) * (L.a ?? 0.85) * fl; f.x.x = 0.7; break; }
    case 'shock': case 'vring': {
      const R = (L.r ?? 1.5) * s * (0.12 + 0.88 * easeOut(u)) * 2;
      if (L.type === 'shock') { m.scale.set(R, 1, R); m.position.set(0, L.y ?? 0.05, 0); } else { m.scale.set(R, R, 1); m.position.set(0, (L.y ?? 0.7) * s, 0); }
      f.x.set(0.86, L.w ?? 0.09, L.trail ?? 0.2, 0); f.o = (1 - u) * (L.a ?? 1); break;
    }
    case 'decal': case 'gtile': { const R = (L.r ?? 1) * s * 2 * (L.grow ? 0.5 + 0.5 * easeOut(Math.min(1, u * 5)) : 1); m.scale.set(R, 1, R); m.position.set(0, L.y ?? 0.03, 0); f.o = (L.a ?? 1) * Math.min(1, u * 12) * (u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4); break; }
    case 'sprite': { const k = (L.size ?? 1) * s * (0.5 + 0.7 * easeOut(Math.min(1, u * 3))); m.scale.set(k * (L.sx ?? 1), k * (L.sy ?? 1), 1); f.o = Math.pow(1 - u, 1.5) * (L.a ?? 1); f.r = (L.rot ?? 0) + (L.spin ?? 0) * t; m.position.set(0, (L.y ?? 0.8) * s, 0); break; }
    default: CUSTOM[L.type].anim(m, L, e, u, t);
  }
}

// --- custom layers --------------------------------------------------------------------------------
CUSTOM.bolts = { // radiating lightning
  build(L) { const g = new THREE.Group(); g.strips = []; for (let i = 0; i < (L.n ?? 5); i++) { const st = getStrip(9), m = fxMesh(st.geo, fxMat('beam'), 6); m.strip = st; m.end = new THREE.Vector3(); g.add(m); g.strips.push(m); } return g; },
  start(g, L, e) { g.jt = 0; for (const m of g.strips) { const a = Math.random() * TAU, r = (L.r ?? 1.2) * rnd(0.6, 1); m.end.set(Math.cos(a) * r, rnd(-0.3, 0.9) * (L.h ?? 1), Math.sin(a) * r); } },
  anim(g, L, e, u, t) {
    const s = e.sc, col = L.tint !== false && e.tint ? e.tint : L._c;
    if (t >= g.jt) { g.jt = t + 0.045; _v3.set(0, (L.y ?? 0.6) * s, 0);
      for (const m of g.strips) { const st = m.strip; _v2.copy(m.end).multiplyScalar(s); _v2.y += _v3.y; jag(st, _v3, _v2, 1.6); st.build((k) => (L.w ?? 0.12) * s * (1 - k * 0.7)); } }
    for (const m of g.strips) { m.fxu.c.copy(col); m.fxu.x.set(0.35, 6, 20, 0.05); m.fxu.t = t; m.fxu.o = (1 - u) * (0.6 + 0.4 * Math.random()); }
  },
};
const CRYS_GEO = () => G.lathe('crys', [[0, -0.05], [0.13, 0.04], [0.16, 0.62], [0, 1]], 6);
CUSTOM.crystals = {
  build(L) { const g = new THREE.Group(); g.c = []; const mats = [lam(0x9fe6ff, { em: 0x3aa8e0, ei: 0.55, op: 0.85 }), lam(0xd8f6ff, { em: 0x6cc8f0, ei: 0.5, op: 0.85 })];
    for (let i = 0; i < (L.n ?? 7); i++) { const m = new THREE.Mesh(CRYS_GEO(), mats[i % 2]); m.renderOrder = 4; g.add(m); g.c.push(m); } return g; },
  start(g, L, e) { const s = e.sc; g.c.forEach((m, i) => { const center = i === 0, a = i / (g.c.length - 1) * TAU + Math.random() * 0.5, r = center ? 0 : (L.r ?? 0.8) * s * rnd(0.45, 1);
    m.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); m.rotation.set(center ? 0 : rnd(0.2, 0.55) * (Math.cos(a) > 0 ? 1 : -1) * 0, Math.random() * TAU, 0);
    _v1.set(Math.cos(a), 0, Math.sin(a)); m.quaternion.setFromAxisAngle(_v2.set(-_v1.z, 0, _v1.x), center ? 0 : rnd(0.25, 0.6));
    m.h = (center ? 1.6 : rnd(0.7, 1.2)) * s * (L.hs ?? 1); m.w = (center ? 1.5 : rnd(0.8, 1.2)) * s * (L.ws ?? 1); m.d = i * 0.025; }); },
  anim(g, L, e, u, t) { const d = L.dur ?? e.dur; for (const m of g.c) { const tt = t - m.d, grow = easeOut(clamp01(tt / 0.12)), shrink = 1 - smooth(d - 0.35, d, t); const k = grow * shrink; m.scale.set(m.w * Math.max(0.001, k), m.h * Math.max(0.001, k), m.w * Math.max(0.001, k)); } },
};
const VINE_PTS = [[[0, 0, 0], [0.15, 0.4, 0.05], [0.05, 0.8, 0.2], [0.3, 1.1, 0.3], [0.5, 1.15, 0.1]], [[0, 0, 0], [-0.1, 0.5, 0.1], [-0.3, 0.9, 0], [-0.35, 1.3, -0.2], [-0.15, 1.45, -0.3]], [[0, 0, 0], [0.05, 0.3, -0.15], [0.25, 0.6, -0.2], [0.2, 0.95, 0.05], [0.0, 1.0, 0.2]]];
const vineGeo = (i) => G.tube('vine' + i, VINE_PTS[i % 3], 0.08, 9, 4);
CUSTOM.vines = {
  build(L) { const g = new THREE.Group(); g.c = []; const mats = [lam(0x4f9a35), lam(0x6db246), lam(0x5a7a2a)], th = lam(0xd8d0a0);
    for (let i = 0; i < (L.n ?? 6); i++) { const m = new THREE.Mesh(vineGeo(i), mats[i % 3]); for (let k = 0; k < 1; k++) { const thorn = new THREE.Mesh(G.cone(4), th); const p = VINE_PTS[i % 3][k + 1]; thorn.position.set(p[0] + 0.06, p[1], p[2]); thorn.scale.set(0.04, 0.12, 0.04); thorn.rotation.z = -1.2; m.add(thorn); }
      const leaf = new THREE.Mesh(leafGeo(), lam(0x7cc850)); const p = VINE_PTS[i % 3][2]; leaf.position.set(p[0], p[1], p[2]); leaf.scale.setScalar(0.25); leaf.rotation.set(0.4, i, 0.8); m.add(leaf);
      g.add(m); g.c.push(m); } return g; },
  start(g, L, e) { const s = e.sc; g.c.forEach((m, i) => { const a = i / g.c.length * TAU + Math.random() * 0.4, r = (L.r ?? 0.6) * s * rnd(0.2, 1); m.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); m.rotation.set(0, -a + Math.PI / 2 + rnd(-0.4, 0.4), 0); m.k = s * rnd(0.8, 1.2) * (L.hs ?? 1); m.d = i * 0.04; }); },
  anim(g, L, e, u, t) { const d = L.dur ?? e.dur; for (const m of g.c) { const k = easeOut(clamp01((t - m.d) / 0.18)) * (1 - smooth(d - 0.4, d, t)); const kk = Math.max(0.001, k) * m.k; m.scale.set(kk, kk, kk); } },
};
CUSTOM.debris = {
  build(L) { const g = new THREE.Group(); g.c = []; const mats = [lam(0x8a7a66), lam(0x6a5c4c), lam(0xa89478)];
    for (let i = 0; i < (L.n ?? 10); i++) { const m = new THREE.Mesh(G.ico(0), mats[i % 3]); m.v = new THREE.Vector3(); g.add(m); g.c.push(m); } return g; },
  start(g, L, e) { const s = e.sc; for (const m of g.c) { const a = Math.random() * TAU, sp = rnd(2, 5) * s; m.v.set(Math.cos(a) * sp, rnd(4, 8) * Math.sqrt(s), Math.sin(a) * sp); m.position.set(0, 0.3 * s, 0); m.scale.setScalar(rnd(0.08, 0.2) * s); m.sp = rnd(-10, 10); } g.lt = 0; },
  anim(g, L, e, u, t) { const dt = Math.max(0, t - g.lt); g.lt = t; const d = L.dur ?? e.dur;
    for (const m of g.c) { m.v.y -= 18 * dt; m.position.addScaledVector(m.v, dt); if (m.position.y < 0.08) { m.position.y = 0.08; m.v.y *= -0.3; m.v.x *= 0.6; m.v.z *= 0.6; } m.rotation.x += m.sp * dt; m.rotation.z += m.sp * 0.7 * dt; if (t > d - 0.3) m.scale.multiplyScalar(0.85); } },
};
function leafGeo() { return G.shape('leaf', (s) => { s.moveTo(0, 0); s.bezierCurveTo(0.35, 0.2, 0.35, 0.75, 0, 1); s.bezierCurveTo(-0.35, 0.75, -0.35, 0.2, 0, 0); }); }

// ============================================================================================ shared particle specs
const P = {
  embers: { n: 18, tile: TL.ember, mode: 2, shape: 'sphere', hemi: true, spd: [3, 6], up: [1, 3], grav: 7, size: [0.05, 0.08], life: [0.4, 0.8], col: [0xffd070, 0xff9a30], str: 0.05, fo: 0.3, y: 0.4 },
  smokeDark: { n: 8, add: false, tile: TL.smoke, col: 0x3a322c, a: 0.5, shape: 'sphere', hemi: true, spd: [0.4, 1], up: [0.6, 1.2], size: [0.5, 0.7], grow: 2.4, life: [0.9, 1.3], drag: 2, y: 0.5, tint: false, spin: 0.5, fo: 0.3 },
  dustRing: { n: 10, add: false, tile: TL.dust, col: 0xa89270, a: 0.85, shape: 'ring', even: true, spd: [1.5, 2.4], up: [0.1, 0.4], drag: 4, size: [0.3, 0.45], grow: 2.2, life: [0.5, 0.8], y: 0.08, tint: false, fo: 0.3 },
  sparkle: { n: 10, tile: TL.spark, shape: 'sphere', spd: [1, 2.5], size: [0.15, 0.28], life: [0.4, 0.8], drag: 2, y: 0.7, spin: 3 },
  snow: { n: 10, tile: TL.snow, col: 0xe8fbff, shape: 'sphere', spd: [0.8, 2], up: [0.2, 0.8], size: [0.15, 0.25], life: [0.7, 1.2], drag: 1.5, grav: 0.5, y: 0.6, spin: 2, tint: false },
};
const ext = (a, b) => Object.assign({}, a, b);

// ============================================================================================ bursts
const BURST = {
  explosion_fire: { dur: 1.4, col: 0xff7a1a, shake: [0.22, 0.25], L: [
    { type: 'flash', col: 0xffc060, size: 2.6, dur: 0.28, y: 0.6 }, { type: 'shock', col: 0xff8a30, r: 1.7, dur: 0.45, w: 0.1 },
    { type: 'decal', tex: texScorch, col: 0xffffff, r: 1.2, dur: 1.4, add: false, a: 0.9, tint: false }],
    P: [{ n: 14, add: false, a: 0.92, tile: TL.smoke, shape: 'sphere', hemi: true, spd: [1, 2.8], up: [0.4, 1], drag: 4, size: [0.45, 0.75], grow: 1.9, life: [0.35, 0.6], col: [0xffe080, 0xffa030], col2: 0xff3010, y: [0.3, 0.6], spin: 1, fo: 0.35 },
      { n: 8, tile: TL.flame, shape: 'disc', rad: 0.5, up: [1.5, 3], size: [0.35, 0.55], grow: 1.3, life: [0.3, 0.5], col: 0xffb040, col2: 0xff4010, y: 0.2, rot0: 0, fo: 0.4 },
      P.embers, ext(P.smokeDark, { at: 0.12 })] },
  explosion_ice: { dur: 1.3, col: 0x7fe0ff, L: [
    { type: 'flash', col: 0xbff0ff, size: 2.2, dur: 0.25 }, { type: 'shock', col: 0x9fe8ff, r: 1.6, dur: 0.5, w: 0.08, trail: 0.35 },
    { type: 'decal', tex: texFrost, col: 0xffffff, r: 1.2, dur: 1.3, a: 0.9, tint: false, grow: true, add: false }, { type: 'crystals', n: 5, r: 0.7, hs: 0.55, ws: 0.6, dur: 1.2 }],
    P: [{ n: 16, add: false, tile: TL.shard, shape: 'sphere', hemi: true, spd: [3, 5.5], up: [0.5, 2], grav: 6, drag: 1, size: [0.22, 0.34], life: [0.5, 0.8], col: [0xa8ecff, 0x5ac0f0], spin: 9, y: 0.5 },
      P.snow, { n: 6, add: false, tile: TL.smoke, col: 0xe0f6ff, a: 0.45, shape: 'sphere', hemi: true, spd: [0.6, 1.4], size: [0.5, 0.7], grow: 2, life: [0.7, 1], drag: 2, y: 0.4, tint: false }] },
  explosion_shock: { dur: 0.7, col: 0xffe14a, L: [
    { type: 'flash', col: 0xfff6b0, size: 2, dur: 0.18 }, { type: 'bolts', n: 6, r: 1.4, w: 0.14, dur: 0.38, col: 0xfff080 }, { type: 'bolts', n: 3, r: 1.0, w: 0.1, dur: 0.3, at: 0.12, col: 0x9ad8ff, tint: false },
    { type: 'vring', col: 0x9ad8ff, r: 1.3, dur: 0.3, w: 0.06, tint: false }, { type: 'shock', col: 0xffe870, r: 1.2, dur: 0.35, w: 0.06 }],
    P: [{ n: 8, tile: TL.bolt, shape: 'sphere', spd: [1.5, 3], size: [0.25, 0.4], life: [0.15, 0.3], col: 0xfff3a0, y: 0.6 },
      ext(P.embers, { n: 14, col: [0xfff8c0, 0xa0e0ff], grav: 3, life: [0.2, 0.45], tint: false })] },
  explosion_acid: { dur: 1.5, col: 0x7cff3a, L: [
    { type: 'flash', col: 0xb0ff60, size: 1.4, dur: 0.2, a: 0.7 }, { type: 'gtile', tile: TL.splat, col: 0x6ad02a, r: 1.1, dur: 1.5, a: 0.75, grow: true }],
    P: [{ n: 14, add: false, tile: TL.drop, shape: 'sphere', hemi: true, spd: [2, 4], up: [1.5, 3], grav: 9, size: [0.14, 0.22], life: [0.5, 0.8], col: [0x9cff4a, 0x6ad82a], y: 0.3 },
      { rate: 28, until: 1.0, add: false, tile: TL.bubble, shape: 'disc', rad: 0.85, up: [0.3, 0.9], size: [0.12, 0.3], grow: 1.4, life: [0.4, 0.8], col: 0x8af040, y: 0.05, fo: 0.7 },
      { n: 6, add: false, tile: TL.smoke, col: 0x5c8a22, a: 0.4, shape: 'disc', rad: 0.6, up: [0.4, 0.8], size: [0.5, 0.7], grow: 2, life: [0.9, 1.3], y: 0.3 }] },
  explosion_steam: { dur: 1.5, col: 0xffffff, L: [{ type: 'shock', col: 0xffffff, r: 1.5, dur: 0.5, w: 0.08, a: 0.5 }],
    P: [{ n: 16, add: false, tile: TL.smoke, col: 0xffffff, a: 0.75, shape: 'sphere', hemi: true, spd: [1, 2.6], up: [0.8, 1.6], drag: 3, size: [0.45, 0.65], grow: 2.6, life: [0.9, 1.4], y: 0.3, spin: 0.6, fo: 0.35 },
      { n: 8, tile: TL.drop, col: 0xd8f0ff, shape: 'sphere', hemi: true, spd: [2, 3.5], grav: 8, size: [0.08, 0.12], life: [0.4, 0.6], y: 0.4, tint: false }] },
  explosion_ink: { dur: 1.6, col: 0x15121c, L: [{ type: 'gtile', tile: TL.splat, col: 0x15121c, r: 1.15, dur: 1.6, a: 0.92, grow: true }, { type: 'shock', col: 0x6a4aa0, r: 1.3, dur: 0.4, w: 0.06, a: 0.6, tint: false }],
    P: [{ n: 16, add: false, tile: TL.drop, shape: 'sphere', hemi: true, spd: [2, 4.5], up: [2, 4], grav: 11, size: [0.12, 0.22], life: [0.45, 0.75], col: 0x14111a, y: 0.3 },
      { n: 8, add: false, tile: TL.splat, shape: 'sphere', hemi: true, spd: [1.5, 3], up: [1, 2], grav: 6, size: [0.3, 0.5], life: [0.4, 0.7], col: 0x1d1826, y: 0.5, spin: 3 },
      { n: 6, tile: TL.spark, col: 0xb090ff, shape: 'sphere', spd: [1, 2], size: [0.12, 0.2], life: [0.3, 0.5], y: 0.5, tint: false }] },
  explosion_prism: { dur: 1.1, col: 0xffffff, L: [{ type: 'flash', col: 0xffffff, size: 2, dur: 0.22 }, { type: 'vring', col: 0xffd8ff, r: 1.5, dur: 0.4, w: 0.07 }],
    P: [{ n: 24, add: false, tile: TL.shard, shape: 'sphere', spd: [3, 6], up: [0.5, 1.5], drag: 2, grav: 2, size: [0.24, 0.36], life: [0.5, 0.9], col: [0xff5a5a, 0xffb23a, 0xfff04a, 0x5aff7a, 0x4ad8ff, 0x7a6aff, 0xff6ae0], spin: 10, y: 0.6, tint: false },
      ext(P.sparkle, { n: 12, col: [0xffffff, 0xffe0ff, 0xd0f0ff], tint: false })] },
  explosion_gold: { dur: 1.1, col: 0xffc83a, L: [{ type: 'flash', col: 0xffe090, size: 1.6, dur: 0.2 }, { type: 'shock', col: 0xffd060, r: 1.2, dur: 0.4, w: 0.07 }],
    P: [{ n: 14, add: false, tile: TL.star, shape: 'sphere', hemi: true, spd: [2, 4], up: [1, 2], grav: 4, drag: 1.5, size: [0.2, 0.32], life: [0.6, 0.9], col: [0xffd040, 0xf0a010], spin: 5, y: 0.5 },
      { n: 8, add: false, tile: TL.coin, shape: 'sphere', hemi: true, spd: [1.5, 3], up: [2.5, 4], grav: 10, size: [0.16, 0.22], life: [0.6, 0.9], col: 0xffd040, y: 0.5, spin: 8 }, ext(P.sparkle, { n: 14, col: 0xfff0b0 })] },
  explosion_note: { dur: 1.3, col: 0xff6ad5, L: [{ type: 'flash', col: 0xffa0e8, size: 1.4, dur: 0.2 }, { type: 'vring', col: 0xff8ae0, r: 1.5, dur: 0.5, w: 0.06 }, { type: 'shock', col: 0x8ad8ff, r: 1.8, dur: 0.6, w: 0.05, tint: false }, { type: 'vring', col: 0x8ad8ff, r: 1.1, dur: 0.45, w: 0.05, at: 0.12, tint: false }],
    P: [{ n: 8, add: false, tile: TL.note, shape: 'ring', even: true, spd: [1.8, 2.4], up: [0.6, 1.4], drag: 1.6, size: [0.38, 0.48], life: [0.9, 1.2], col: [0xf040b0, 0x30a8f0, 0xf0b020], y: 0.7, fo: 0.6, tint: false, rot0: 0 },
      { n: 4, add: false, tile: TL.note2, shape: 'ring', spd: [1, 1.6], up: [1, 1.6], drag: 1.6, size: [0.45, 0.55], life: [1, 1.2], col: [0xe050c0, 0x40b0f0], y: 0.9, fo: 0.6, rot0: 0 }] },
  explosion_big: { dur: 2.4, col: 0xff8a2a, shake: [0.6, 0.55], start: (e, fx) => fx.shatter.spawn(e.p, 2.2 * e.sc, { pal: 'fire', power: 0.8 }), L: [
    { type: 'flash', col: 0xffd080, size: 4.2, dur: 0.35, y: 1, a: 0.8 }, { type: 'shock', col: 0xffa040, r: 4.8, dur: 0.7, w: 0.08, trail: 0.3 }, { type: 'shock', col: 0xffffff, r: 3.2, dur: 0.5, w: 0.05, at: 0.1, tint: false },
    { type: 'vring', col: 0xffd080, r: 3.5, dur: 0.45, w: 0.05, y: 1 }, { type: 'decal', tex: texScorch, col: 0xffffff, r: 2.8, dur: 2.4, add: false, tint: false }, 
    { type: 'debris', n: 12, dur: 1.8 }],
    P: [{ n: 30, add: false, a: 0.92, tile: TL.smoke, shape: 'sphere', hemi: true, spd: [2, 5], up: [1, 2.5], drag: 3, size: [0.8, 1.3], grow: 2, life: [0.5, 0.9], col: [0xffe8a0, 0xffa030], col2: 0xff3010, y: [0.4, 1.2], spin: 1, fo: 0.35 },
      { n: 12, tile: TL.flame, shape: 'disc', rad: 1.4, up: [3, 5], size: [0.6, 0.9], grow: 1.3, life: [0.4, 0.7], col: 0xffb040, col2: 0xff4010, y: 0.2, rot0: 0 },
      ext(P.embers, { n: 40, spd: [5, 10], up: [3, 6] }), ext(P.smokeDark, { n: 22, at: 0.2, spd: [1, 2.5], up: [1, 2.5], size: [0.9, 1.3], life: [1.2, 1.8] }), ext(P.dustRing, { n: 18, spd: [4, 6], size: [0.6, 0.9] })] },
  hit_blunt: { dur: 0.5, col: 0xfff0b0, shake: [0.08, 0.12], L: [{ type: 'sprite', tile: TL.impact, col: 0xfff2b0, size: 1.1, dur: 0.22, y: 0.8, rot: 0.2 }, { type: 'flash', col: 0xfff8d0, size: 1.2, dur: 0.15, y: 0.8 }],
    P: [P.dustRing, ext(P.embers, { n: 6, spd: [2, 4], life: [0.15, 0.3], y: 0.8 })] },
  hit_slash: { dur: 0.4, col: 0xd8f0ff, L: [{ type: 'sprite', tile: TL.streak, col: 0xffffff, size: 1.7, sx: 1, sy: 0.22, dur: 0.18, y: 0.85, rot: 0.75 }, { type: 'sprite', tile: TL.streak, col: 0xd8f0ff, size: 1.3, sx: 1, sy: 0.12, dur: 0.22, y: 0.85, rot: 0.75, at: 0.04 }, { type: 'flash', col: 0xffffff, size: 0.8, dur: 0.12, y: 0.85 }],
    P: [{ n: 9, tile: TL.ember, mode: 2, shape: 'sphere', spd: [3, 6], size: [0.05, 0.07], life: [0.15, 0.3], col: 0xeaf6ff, str: 0.05, y: 0.85 }] },
  hit_pierce: { dur: 0.4, col: 0xfff2c0, L: [{ type: 'sprite', tile: TL.streak, col: 0xffffff, size: 1.6, sx: 1, sy: 0.1, dur: 0.16, y: 0.85, rot: -0.25 }, { type: 'vring', col: 0xfff2c0, r: 0.45, dur: 0.2, w: 0.12, y: 0.85 }, { type: 'flash', col: 0xffffff, size: 0.6, dur: 0.1, y: 0.85 }],
    P: [{ n: 7, tile: TL.ember, mode: 2, shape: 'sphere', spd: [2.5, 5], size: [0.04, 0.06], life: [0.15, 0.25], col: 0xfff8d0, str: 0.05, y: 0.85 }] },
  ice_crystal: { dur: 1.7, col: 0x9fe6ff, shake: [0.12, 0.15], L: [{ type: 'crystals', n: 8, r: 0.85, dur: 1.7 }, { type: 'decal', tex: texFrost, col: 0xffffff, r: 1.3, dur: 1.7, grow: true, tint: false, add: false }, { type: 'flash', col: 0xbff0ff, size: 1.5, dur: 0.2, y: 0.4 }],
    P: [ext(P.snow, { n: 14, y: 0.3 }), { n: 10, tile: TL.shard, col: 0xd8f8ff, shape: 'sphere', hemi: true, spd: [2, 4], grav: 7, size: [0.12, 0.2], life: [0.4, 0.6], y: 0.2, spin: 8, tint: false }] },
  root_burst: { dur: 1.7, col: 0x5aa83a, L: [{ type: 'vines', n: 4, r: 0.7, dur: 1.7 }, { type: 'decal', tex: texCrack, col: 0xffffff, r: 0.9, dur: 1.7, add: false, tint: false }],
    P: [ext(P.dustRing, { col: 0x8a6a48, n: 12 }), { n: 12, tile: TL.leaf, shape: 'sphere', hemi: true, spd: [1.5, 3], up: [1, 2.5], grav: 3, drag: 1.5, size: [0.16, 0.24], life: [0.8, 1.2], col: [0x8de05a, 0x5ab83a], y: 0.5, spin: 5, add: false }] },
  flour_cloud: { dur: 1.8, col: 0xffffff, L: [],
    P: [{ n: 18, add: false, tile: TL.dust, col: [0xffffff, 0xf6f0e4], a: 0.8, shape: 'sphere', hemi: true, spd: [1.5, 3.2], up: [0.3, 1], drag: 2.8, size: [0.5, 0.7], grow: 3, life: [1.2, 1.7], y: 0.4, spin: 0.4, fo: 0.4 },
      { n: 20, add: false, tile: TL.pellet, col: 0xffffff, shape: 'sphere', spd: [1, 3], grav: 0.6, drag: 1.5, size: [0.04, 0.07], life: [0.8, 1.4], y: 0.5 }] },
  pepper_puff: { dur: 1.4, col: 0xa8401c, L: [],
    P: [{ n: 14, add: false, tile: TL.dust, col: [0xa8401c, 0x8a3418, 0xc25a24], a: 0.75, shape: 'sphere', hemi: true, spd: [1.5, 2.8], up: [0.3, 0.9], drag: 3, size: [0.4, 0.6], grow: 2.6, life: [0.9, 1.3], y: 0.5, spin: 0.5 },
      { n: 22, add: false, tile: TL.pellet, col: [0x2a1810, 0x6a2a10], shape: 'sphere', spd: [1.5, 3.5], grav: 3, drag: 1.5, size: [0.05, 0.08], life: [0.6, 1.1], y: 0.5, tint: false },
      { n: 8, tile: TL.ember, col: 0xff7a30, mode: 2, shape: 'sphere', spd: [2, 4], size: [0.05, 0.07], life: [0.3, 0.5], y: 0.5, tint: false }] },
  sparks: { dur: 0.9, col: 0xffb030, L: [{ type: 'flash', col: 0xffc060, size: 0.9, dur: 0.12, y: 0.5 }],
    P: [ext(P.embers, { n: 30, spd: [3, 7], up: [1.5, 3.5], grav: 10, life: [0.4, 0.8], y: 0.5, str: 0.07 })] },
  heal: { dur: 1.5, col: 0x5aff7a, L: [{ type: 'shock', col: 0x7aff9a, r: 1.1, dur: 0.6, w: 0.08, a: 0.7 }, { type: 'flash', col: 0xb0ffc0, size: 1.4, dur: 0.3, y: 0.7, a: 0.6 }],
    P: [{ n: 9, add: false, tile: TL.plus, shape: 'disc', rad: 0.55, up: [1, 1.8], drag: 0.8, size: [0.22, 0.34], life: [0.9, 1.3], col: [0x3ad860, 0x7af090], y: [0.2, 0.9], rot0: 0, fo: 0.6 },
      { n: 6, tile: TL.leaf, shape: 'disc', rad: 0.6, up: [0.6, 1.2], size: [0.16, 0.22], life: [1, 1.4], col: 0x9cf06a, y: [0.2, 0.8], spin: 3, add: false, tint: false }, ext(P.sparkle, { col: 0xd0ffd8, up: [0.5, 1] })] },
  shield_break: { dur: 0.9, col: 0x6ff0ff, L: [{ type: 'flash', col: 0xb0f8ff, size: 2, dur: 0.18, y: 0.9 }, { type: 'vring', col: 0x8ff4ff, r: 1.4, dur: 0.35, w: 0.08, y: 0.9 }],
    P: [{ n: 14, add: false, tile: TL.hex, shape: 'sphere', rad: 0.6, spd: [2.5, 4.5], grav: 5, drag: 1, size: [0.22, 0.32], life: [0.5, 0.8], col: [0x5ae0ff, 0x20b0f0], spin: 8, y: 0.9 },
      { n: 12, tile: TL.shard, shape: 'sphere', rad: 0.6, spd: [3, 5], grav: 6, size: [0.15, 0.25], life: [0.4, 0.7], col: 0xd0fbff, spin: 10, y: 0.9 }] },
  steam_vent: { dur: 1.7, col: 0xffffff, L: [{ type: 'shock', col: 0xffffff, r: 0.8, dur: 0.4, w: 0.1, a: 0.5 }, { type: 'gtile', tile: TL.ring, col: 0xd8e8f0, r: 0.4, dur: 1.4, a: 0.5, add: false }],
    P: [{ rate: 40, until: 1.1, add: false, tile: TL.smoke, col: 0xffffff, a: 0.7, shape: 'disc', rad: 0.18, up: [3.5, 5], spd: [0.2, 0.5], drag: 1.6, size: [0.3, 0.4], grow: 3.4, life: [0.7, 1.1], y: 0.1, spin: 1, fo: 0.35 },
      { rate: 14, until: 1.0, tile: TL.drop, col: 0xd8f0ff, shape: 'disc', rad: 0.2, up: [3, 4.5], spd: [0.5, 1.2], grav: 8, size: [0.07, 0.1], life: [0.4, 0.7], y: 0.2, tint: false }] },
  chain_jump: { dur: 0.45, col: 0x9ae6ff, L: [{ type: 'flash', col: 0xd0f4ff, size: 1, dur: 0.25, y: 0.9 }, { type: 'bolts', n: 3, r: 0.6, w: 0.08, dur: 0.3, y: 0.9, h: 0.6 }],
    P: [{ n: 6, tile: TL.bolt, shape: 'sphere', spd: [1.5, 2.5], size: [0.2, 0.3], life: [0.15, 0.25], col: 0xd8f4ff, y: 0.9 }, { n: 8, tile: TL.ember, mode: 2, shape: 'sphere', spd: [2, 4], size: [0.04, 0.06], life: [0.15, 0.3], col: 0xfff8a0, y: 0.9, tint: false }] },
  mark_pop: { dur: 0.9, col: 0xd060ff, L: [{ type: 'sprite', tile: TL.sigil, col: 0xe0a0ff, size: 1.2, dur: 0.35, y: 1.1, spin: 4 }, { type: 'vring', col: 0xd060ff, r: 1.1, dur: 0.35, w: 0.08, y: 1.1 }, { type: 'flash', col: 0xf0c0ff, size: 1.3, dur: 0.2, y: 1.1 }],
    P: [{ n: 12, add: false, tile: TL.star, shape: 'sphere', spd: [2, 3.5], drag: 2, size: [0.16, 0.26], life: [0.4, 0.7], col: [0xc050f0, 0xe090ff], y: 1.1, spin: 6 }, { n: 4, add: false, tile: TL.rune1, shape: 'sphere', spd: [1.2, 2], drag: 2, size: [0.25, 0.32], life: [0.5, 0.7], y: 1.1 }] },
  // 일격참 finisher: the ground splits and fire bursts out of the cracks
  fire_crack: { dur: 2.4, col: 0xff8a30, shake: [0.3, 0.32], start: (e, fx) => fx.shatter.spawn(e.p, 2.0 * e.sc, { pal: 'fire' }), L: [
    { type: 'flash', col: 0xffd890, size: 2.4, dur: 0.22, y: 0.3 },
        ],
    P: [ext(P.dustRing, { n: 16, spd: [3, 5], size: [0.4, 0.65] }),
      // flame tongues licking up from the cracks, then lingering embers
      { n: 34, tile: TL.flame, shape: 'disc', rad: 1.7, up: [2.6, 5], spd: [0.1, 0.4], size: [0.6, 1.0], grow: 0.7, life: [0.4, 0.75], col: [0xffe070, 0xff5a10], y: 0.05, tint: false },
      { rate: 46, at: 0.15, until: 1.7, tile: TL.flame, shape: 'disc', rad: 1.6, up: [1.6, 3.4], spd: [0.1, 0.3], size: [0.45, 0.8], grow: 0.5, life: [0.3, 0.6], col: [0xffc050, 0xff4a10], y: 0.05, tint: false },
      { rate: 10, at: 0.3, until: 1.8, add: false, tile: TL.smoke, col: 0x8a6a52, a: 0.35, shape: 'disc', rad: 1.3, up: [1, 1.8], spd: [0.1, 0.3], size: [0.4, 0.6], grow: 2.2, life: [0.8, 1.2], y: 0.4, tint: false },
      ext(P.embers, { n: 24, spd: [1.5, 3.5], up: [2, 4.5], life: [0.6, 1.2], col: [0xffe0a0, 0xff7020], tint: false }),
      { n: 8, at: 0.1, add: false, tile: TL.dust, col: 0xa88466, a: 0.45, shape: 'disc', rad: 1.2, up: [0.6, 1.2], size: [0.6, 0.9], grow: 2, life: [0.8, 1.3], y: 0.3, tint: false }] },
  // monster claw swipe: three bright parallel scratches
  claw_marks: { dur: 0.45, col: 0xffffff, L: [
    { type: 'sprite', tile: TL.streak, col: 0xffffff, size: 1.5, sx: 1, sy: 0.12, dur: 0.22, y: 1.0, rot: 0.95 }, { type: 'sprite', tile: TL.streak, col: 0xffeedd, size: 1.5, sx: 1, sy: 0.12, dur: 0.22, y: 0.82, rot: 0.95, at: 0.03 },
    { type: 'sprite', tile: TL.streak, col: 0xffe0d0, size: 1.4, sx: 1, sy: 0.12, dur: 0.22, y: 0.64, rot: 0.95, at: 0.06 }, { type: 'flash', col: 0xffffff, size: 0.7, dur: 0.1, y: 0.8 }],
    P: [{ n: 8, tile: TL.ember, mode: 2, shape: 'sphere', spd: [2.5, 4.5], size: [0.05, 0.07], life: [0.15, 0.3], col: 0xffffff, str: 0.05, y: 0.8, tint: false }] },
  // 견습생 '일격참' finisher: the ground splits under the sword (crack decal, rocks thrown up, dust ring, white flash)
  ground_crack: { dur: 2.2, col: 0xffe6b0, shake: [0.25, 0.3], start: (e, fx) => fx.shatter.spawn(e.p, 2.0 * e.sc), L: [
    { type: 'flash', col: 0xfff2d0, size: 1.6, dur: 0.14, y: 0.5, a: 0.7 }],
    P: [ext(P.embers, { n: 6, spd: [2, 4], up: [1, 2], life: [0.2, 0.4], col: [0xfff2c0, 0xffd080], tint: false })] },
  dust: { dur: 1, col: 0xa89270, L: [], P: [ext(P.dustRing, { n: 12, tint: true }), { n: 5, add: false, tile: TL.dust, col: 0xa89270, a: 0.75, shape: 'disc', rad: 0.3, up: [0.4, 0.8], size: [0.4, 0.5], grow: 2, life: [0.6, 0.9], y: 0.1 }] },
};

// ============================================================================================ projectiles
/** add a mesh to parent: mk(parent, geo, mat, [px,py,pz], [sx,sy,sz], [rx,ry,rz]) */
function mk(par, geo, mat, p, s, r) {
  const m = new THREE.Mesh(geo, mat); if (p) m.position.set(p[0], p[1], p[2]);
  if (s !== undefined) { if (typeof s === 'number') m.scale.setScalar(s); else m.scale.set(s[0], s[1], s[2]); }
  if (r) m.rotation.set(r[0], r[1], r[2]); par.add(m); return m;
}
const ZROT = [Math.PI / 2, 0, 0]; // y-axis primitives -> along z
/** two crossed quads along +z (0..1), uv.x along, uv.y across: readable from any angle */
const xstrip = () => gc('xstrip', () => {
  const P = [0, -0.5, 0, 0, 0.5, 0, 1, -0.5, 0, 1, 0.5, 0, 0, 0, -0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0, 0.5].map((v, i) => v), Q = [];
  for (let i = 0; i < P.length; i += 3) Q.push(P[i + 2], P[i + 1], P[i]); // swap x<->z so length runs along z, widths along y / x
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(Q, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 1], 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(24).fill(0).map((_, i) => i % 3 === 1 ? 1 : 0), 3)); g.setIndex([0, 2, 1, 1, 2, 3, 4, 6, 5, 5, 6, 7]); return g;
});
const triGeo = (key, pts) => gc('tri' + key, () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3)); g.computeVertexNormals(); return g; });

const TR = { // trail particle specs
  ember: { tile: TL.ember, col: [0xffc040, 0xff7a20], size: [0.08, 0.14], grow: 0.3, life: [0.25, 0.45], spd: [0.2, 0.6], up: [0, 0.4] },
  flame: { tile: TL.flame, col: 0xffa030, col2: 0xff3010, size: [0.22, 0.32], grow: 0.4, life: [0.2, 0.35], up: [0.5, 1], rot0: 0 },
  smoke: { add: false, tile: TL.smoke, col: 0x8a8580, a: 0.55, size: [0.18, 0.26], grow: 2.6, life: [0.6, 0.9], up: [0.2, 0.5], spin: 0.6, tint: false, fo: 0.3 },
  steam: { add: false, tile: TL.smoke, col: 0xffffff, a: 0.35, size: [0.14, 0.2], grow: 2.2, life: [0.4, 0.6], up: [0.3, 0.6], tint: false },
  sparkle: { tile: TL.spark, size: [0.12, 0.2], life: [0.3, 0.5], spd: [0.1, 0.4], spin: 3 },
  glow: { tile: TL.glow, size: [0.18, 0.26], grow: 0.3, life: [0.2, 0.35] },
  drip: { add: false, tile: TL.drop, size: [0.08, 0.12], life: [0.4, 0.6], grav: 6, spd: [0.1, 0.4], rot0: Math.PI },
  snow: { add: false, tile: TL.snow, col: 0xd8f6ff, size: [0.1, 0.16], life: [0.4, 0.7], spd: [0.2, 0.5], grav: 0.5, spin: 3, tint: false },
  bubble: { add: false, tile: TL.bubble, size: [0.08, 0.14], life: [0.3, 0.6], up: [0.3, 0.6], spd: [0.1, 0.3] },
  bolt: { tile: TL.bolt, col: 0xfff080, size: [0.16, 0.24], life: [0.08, 0.16], spd: [0.5, 1] },
  leaf: { add: false, tile: TL.leaf, col: 0x6ac840, size: [0.1, 0.16], life: [0.4, 0.7], spd: [0.2, 0.6], grav: 1, spin: 6 },
  spore: { tile: TL.glow, col: [0xc8f070, 0xd090ff], size: [0.08, 0.14], life: [0.8, 1.4], spd: [0.1, 0.3], up: [0.05, 0.2], drag: 1 },
  note: { add: false, tile: TL.note, size: [0.16, 0.22], life: [0.5, 0.8], up: [0.3, 0.6], rot0: 0 },
  splat: { add: false, tile: TL.splat, size: [0.1, 0.18], life: [0.35, 0.55], grav: 5, spd: [0.2, 0.6], spin: 4 },
};
const tr = (spec, per, extra) => ({ sp: extra ? ext(spec, extra) : spec, per });
const PROJ = {
  capsule: { col: 0xff5a2a, spin: ['z', 10], glow: [0xff8a3a, 0.9], rib: { w: 0.18, n: 10, col: 0xffa040, col2: 0xff3010 }, tr: [tr(TR.ember, 0.12)],
    model(p, c) { mk(p, G.capsule(), lam(c ?? 0xe8402a, { em: c ?? 0xff4020, ei: 0.45, smooth: true }), [0, 0, 0.06], [0.2, 0.17, 0.2], ZROT); mk(p, G.capsule(), lam(0xffb040, { em: 0xffa020, ei: 0.5, smooth: true }), [0, 0, -0.06], [0.2, 0.17, 0.2], ZROT); } },
  ampoule: { col: 0x3a8aff, spin: ['x', 9], glow: [0x5aa0ff, 0.6], tr: [tr(TR.drip, 0.18, { col: 0x5a9aff }), tr(TR.sparkle, 0.25, { col: 0x9ad0ff })],
    model(p, c) { mk(p, G.cyl(0.07, 0.07, 0.3, 8), lam(0xd8f4ff, { op: 0.5 }), null, 1, ZROT); mk(p, G.cyl(0.055, 0.055, 0.2, 8), lam(c ?? 0x3a7aff, { em: c ?? 0x2050ff, ei: 0.5 }), [0, 0, -0.03], 1, ZROT); mk(p, G.cone(8), lam(0xd8f4ff, { op: 0.6 }), [0, 0, 0.2], [0.07, 0.12, 0.07], ZROT); } },
  flask_fire: { scale: 1.25, col: 0xff6a20, flask: 0xff5a20, glow: [0xff8a30, 0.7], spin: ['x', 9], tr: [tr(TR.flame, 0.14, { size: [0.14, 0.2] }), tr(TR.ember, 0.15)] },
  flask_ice: { scale: 1.25, col: 0x7ad8ff, flask: 0x6ad0ff, glow: [0x8ae0ff, 0.6], spin: ['x', 9], tr: [tr(TR.snow, 0.14), tr(TR.sparkle, 0.2, { col: 0xc0f0ff })] },
  flask_shock: { scale: 1.25, col: 0xffe040, flask: 0xffe040, glow: [0xfff080, 0.7], spin: ['x', 9], tr: [tr(TR.bolt, 0.16), tr(TR.sparkle, 0.2, { col: 0xfff0a0 })] },
  flask_acid: { scale: 1.25, col: 0x7cff3a, flask: 0x6ae030, glow: [0x9cff5a, 0.6], spin: ['x', 9], tr: [tr(TR.bubble, 0.12, { col: 0x8af040 }), tr(TR.drip, 0.2, { col: 0x6ad02a })] },
  leaf: { col: 0x5ab83a, spin: ['y', 16], tr: [tr(TR.leaf, 0.3), tr(TR.sparkle, 0.2, { col: 0xc0ff90 })],
    model(p, c) { const g = new THREE.Group(); g.rotation.x = -1.2; p.add(g); mk(g, leafGeo(), lam(c ?? 0x5ab83a, { ds: true, em: 0x2a6a10, ei: 0.3 }), [0, -0.25, 0], [0.55, 0.55, 0.55]); mk(g, G.cyl(0.01, 0.01, 0.12, 4), lam(0x3a6a20), [0, -0.3, 0]); } },
  firebird: { col: 0xff7a20, glow: [0xff9a40, 1.3], rib: { w: 0.3, n: 14, col: 0xffc040, col2: 0xff2a10 }, tr: [tr(TR.flame, 0.1), tr(TR.ember, 0.1)],
    model(p, c) { const body = lam(c ?? 0xff8a20, { em: c ?? 0xff6010, ei: 0.7 }), wing = lam(0xffc040, { em: 0xff8020, ei: 0.7, ds: true });
      mk(p, G.ico(0), body, [0, 0, 0], [0.13, 0.12, 0.26]); mk(p, G.ico(0), lam(0xffd060, { em: 0xffa020, ei: 0.7 }), [0, 0.08, 0.24], 0.1); mk(p, G.cone(4), lam(0xffe080, { em: 0xffc040, ei: 0.6 }), [0, 0.07, 0.36], [0.03, 0.08, 0.03], ZROT);
      mk(p, G.cone(4), lam(0xffd040, { em: 0xffb020, ei: 0.8 }), [0, 0.14, 0.24], [0.03, 0.09, 0.03], [-0.5, 0, 0]);
      for (const s of [-1, 1]) { const pv = new THREE.Group(); pv.position.set(s * 0.08, 0.04, 0.02); pv.name = s < 0 ? 'wL' : 'wR'; p.add(pv); mk(pv, triGeo('wing' + s, [[0, 0, 0.12], [s * 0.55, 0.05, -0.05], [0, 0, -0.14]]), wing); mk(pv, triGeo('wingt' + s, [[s * 0.25, 0.02, 0.04], [s * 0.6, 0.06, 0.0], [s * 0.45, 0.04, -0.12]]), lam(0xff4a10, { em: 0xff3010, ei: 0.7, ds: true })); }
      for (let i = -1; i <= 1; i++) mk(p, triGeo('tail' + i, [[0, 0.02, -0.2], [i * 0.12 + 0.05, 0.04, -0.55], [i * 0.12 - 0.05, 0.0, -0.5]]), wing); },
    anim(p, t) { const a = Math.sin(t * 20) * 0.75; const l = p.getObjectByName('wL'), r = p.getObjectByName('wR'); if (l) l.rotation.z = a; if (r) r.rotation.z = -a; } },
  needle_gold: { col: 0xffc830, spin: ['z', 20], glow: [0xffe080, 0.35], rib: { w: 0.07, n: 12, col: 0xffe070, col2: 0xffa020 }, tr: [tr(TR.sparkle, 0.3, { col: 0xfff0a0, size: [0.08, 0.14] })],
    model(p, c) { const m = lam(c ?? 0xffc830, { em: 0xc08010, ei: 0.6 }); mk(p, G.cyl(0.014, 0.014, 0.55, 5), m, [0, 0, -0.05], 1, ZROT); mk(p, G.cone(5), m, [0, 0, 0.28], [0.014, 0.1, 0.014], ZROT); mk(p, G.torus(0.25, 4, 8), m, [0, 0, -0.3], [0.03, 0.03, 0.03], [0, Math.PI / 2, 0]); } },
  wave_water: { col: 0x3a9aff, tr: [tr({ add: false, tile: TL.drop, col: [0xa8e4ff, 0x5ab0ff], size: [0.08, 0.14], life: [0.3, 0.5], spd: [0.8, 1.6], up: [0.8, 1.6], grav: 6, tint: false }, 0.07), tr({ add: false, tile: TL.dust, col: 0xffffff, a: 0.6, size: [0.2, 0.3], grow: 1.8, life: [0.3, 0.5], up: [0.1, 0.3], tint: false }, 0.12)],
    model(p, c) { const m = fxMesh(G.crescent(), fxMat('water', { add: false }), 4); m.scale.set(0.65, 0.55, 0.65); m.position.set(0, -0.35, 0.3); m.name = 'water'; m.fxu.c.set(0xb8f0ff); m.fxu.c2.set(c ?? 0x2a78e0); m.fxu.o = 0.92; p.add(m); },
    anim(p, t) { const m = p.getObjectByName('water'); if (m) m.fxu.t = t; } },
  // monster fire spit (cinder lizard etc.)
  fireball: { col: 0xff7a20, scale: 1.2, glow: [0xffa040, 1.3], rib: { w: 0.2, n: 12, col: 0xffc040, col2: 0xff3010 }, tr: [tr(TR.flame, 0.07), tr(TR.ember, 0.1)],
    model(p, c) { mk(p, G.ico(0), lam(0xffd070, { em: 0xff7a10, ei: 1 }), null, 0.15); mk(p, G.ico(0), lam(0xff6010, { em: 0xff3a00, ei: 0.9, op: 0.6 }), null, 0.22); } },
  // 견습생 '비연참': a crescent of sword wind (wide, bright, leaves a light streak)
  sword_wave: { col: 0xbfe8ff, scale: 1.6, glow: [0xd8f2ff, 1.0], tr: [tr(TR.sparkle, 0.06, { col: 0xeaf8ff, size: [0.1, 0.18] }), tr({ add: true, tile: TL.streak, col: 0xcfeeff, a: 0.7, size: [0.5, 0.7], life: [0.12, 0.2], tint: false }, 0.04)],
    model(p, c) { const m = fxMesh(G.crescent(), fxMat('water', { add: true }), 6); m.scale.set(0.95, 0.5, 0.75); m.position.set(0, -0.25, 0.25); m.name = 'wave'; m.fxu.c.set(0xffffff); m.fxu.c2.set(c ?? 0x7ac8ff); m.fxu.o = 0.95; p.add(m);
      const m2 = fxMesh(G.crescent(), fxMat('water', { add: true }), 6); m2.scale.set(0.7, 0.35, 0.55); m2.position.set(0, -0.2, 0.05); m2.name = 'wave2'; m2.fxu.c.set(0xe8f6ff); m2.fxu.c2.set(0x5aa8ff); m2.fxu.o = 0.7; p.add(m2); },
    anim(p, t) { for (const n of ['wave', 'wave2']) { const m = p.getObjectByName(n); if (m) m.fxu.t = t * 1.6; } } },
  meatball: { col: 0x8a4a2a, scale: 1.2, spin: ['x', 8], tr: [tr(TR.steam, 0.2), tr(TR.drip, 0.3, { col: 0xa06030 })],
    model(p, c) { mk(p, lumpy('meat', 1, 0.12, 2), lam(c ?? 0x8a4a2a), null, 0.17); for (let i = 0; i < 5; i++) mk(p, G.box(), lam(0x4a8a2a), [Math.cos(i * 2.4) * 0.15, Math.sin(i * 1.7) * 0.1, Math.sin(i * 2.4) * 0.13], [0.04, 0.02, 0.03], [i, i * 2, 0]); } },
  skewer: { col: 0xa0582a, spin: ['z', 6], tr: [tr(TR.steam, 0.2), tr(TR.ember, 0.25)],
    model(p) { mk(p, G.cyl(0.014, 0.014, 0.85, 5), lam(0xd8b878), null, 1, ZROT); const chunks = [[lam(0x9a4a22), G.box(), 0.13], [lam(0x5aa83a), G.ico(0), 0.075], [lam(0xf0e8d0), G.box(), 0.11], [lam(0xc84a2a), G.ico(0), 0.075], [lam(0x9a4a22), G.box(), 0.13]];
      chunks.forEach(([m, g, s], i) => mk(p, g, m, [0, 0, 0.26 - i * 0.12], s, [i * 0.5, i, 0])); mk(p, G.cone(4), lam(0xd8b878), [0, 0, 0.45], [0.014, 0.06, 0.014], ZROT); } },
  sorbet: { col: 0xbfefff, spin: ['x', 7], glow: [0x9ae8ff, 0.55], rib: { w: 0.2, n: 10, col: 0xd8f6ff, col2: 0x7ad0ff }, tr: [tr(TR.snow, 0.1), tr({ add: false, tile: TL.smoke, col: 0xe8fbff, a: 0.4, size: [0.15, 0.2], grow: 2, life: [0.4, 0.6], tint: false }, 0.15)],
    model(p, c) { mk(p, lumpy('sorb', 1, 0.1, 5), lam(c ?? 0xffc8e0, { em: 0x80405a, ei: 0.25 }), null, 0.16); mk(p, lumpy('sorb2', 1, 0.15, 7), lam(0xd8f6ff, { em: 0x5aa0c0, ei: 0.3 }), [0, 0.06, 0], [0.15, 0.1, 0.15]); mk(p, G.cone(6), lam(0xe8c890), [0, -0.1, 0], [0.12, -0.22, 0.12]); } },
  ice_plate: { col: 0x8ae0ff, spin: ['y', 18], glow: [0x9ae8ff, 0.5], tr: [tr(TR.sparkle, 0.12, { col: 0xc8f4ff }), tr(TR.snow, 0.25)],
    model(p, c) { mk(p, G.cyl(1, 1, 1, 12), lam(c ?? 0x9ae4ff, { em: 0x2a8ac0, ei: 0.4, op: 0.8 }), null, [0.3, 0.04, 0.3]); mk(p, G.torus(0.12, 4, 16), lam(0xf0fcff, { em: 0x8ad0f0, ei: 0.4 }), null, [0.3, 0.3, 0.3], [Math.PI / 2, 0, 0]); mk(p, G.cyl(1, 1, 1, 6), lam(0xffffff, { em: 0x9ad8f0, ei: 0.5 }), null, [0.08, 0.06, 0.08]); } },
  bullet: { col: 0xffd040, glow: [0xffe080, 0.3], rib: { w: 0.06, n: 8, col: 0xffe070, col2: 0xff9020 },
    model(p, c) { mk(p, G.cyl(0.03, 0.03, 0.1, 6), lam(c ?? 0xd8a040, { em: 0x805010, ei: 0.4 }), null, 1, ZROT); mk(p, G.cone(6), lam(0xe0b860, { em: 0x806020, ei: 0.4 }), [0, 0, 0.08], [0.03, 0.06, 0.03], ZROT); } },
  shell: { col: 0x5a5a62, spin: ['z', 5], glow: [0xffa040, 0.25], tr: [tr(TR.smoke, 0.14), tr(TR.ember, 0.3)],
    model(p) { mk(p, G.cyl(0.09, 0.09, 0.26, 8), lam(0x4a4e58), null, 1, ZROT); mk(p, G.cone(8), lam(0x5a5e68), [0, 0, 0.2], [0.09, 0.15, 0.09], ZROT); mk(p, G.cyl(0.097, 0.097, 0.05, 8), lam(0xc89a40), [0, 0, -0.08], 1, ZROT); } },
  missile: { col: 0xe04030, spin: ['z', 4], rib: { w: 0.12, n: 8, col: 0xffd060, col2: 0xff5020 }, tr: [tr(ext(TR.smoke, { a: 0.65, size: [0.22, 0.3], col: 0xb8b4ae }), 0.08), tr(TR.ember, 0.15)],
    model(p, c) { mk(p, G.cyl(0.07, 0.07, 0.42, 8), lam(0xf0ece4), null, 1, ZROT); mk(p, G.cone(8), lam(c ?? 0xe04030), [0, 0, 0.28], [0.07, 0.15, 0.07], ZROT);
      for (let i = 0; i < 4; i++) { const f = mk(p, G.box(), lam(c ?? 0xe04030), [0, 0, -0.17], [0.01, 0.16, 0.1]); f.rotation.z = i * Math.PI / 2; f.position.x = Math.sin(i * Math.PI / 2) * 0.08; f.position.y = Math.cos(i * Math.PI / 2) * 0.08; f.scale.set(0.01, 0.1, 0.12); }
      const gl = glowSprite(0xffa040, 5); gl.scale.setScalar(0.4); gl.position.z = -0.27; gl.fxu.o = 1; p.add(gl); } },
  railbolt: { col: 0x6ad8ff, glow: [0xb0f0ff, 0.7], tr: [tr(TR.bolt, 0.18, { col: 0xa0e8ff }), tr(TR.sparkle, 0.2, { col: 0xd0f8ff })],
    model(p, c) { const m = fxMesh(xstrip(), fxMat('beam'), 5); m.scale.set(0.2, 0.2, 1.7); m.position.z = -1.5; m.name = 'beam'; m.fxu.c.set(c ?? 0x5ac8ff); m.fxu.x.set(0.4, 8, 30, 0.15); p.add(m); },
    anim(p, t) { const m = p.getObjectByName('beam'); if (m) { m.fxu.t = t; m.fxu.o = 0.85 + 0.15 * Math.sin(t * 50); } } },
  comb: { col: 0xd87a9a, scale: 1.35, spin: ['y', 16], tr: [tr(TR.sparkle, 0.25, { col: 0xffd0e0 })],
    model(p, c) { const m = lam(c ?? 0xd87a9a, { em: 0x502030, ei: 0.25 }); mk(p, G.box(), m, [0, 0, 0.06], [0.4, 0.04, 0.08]); for (let i = 0; i < 9; i++) mk(p, G.box(), m, [-0.17 + i * 0.0425, 0, -0.04], [0.022, 0.03, 0.13]); } },
  ink_blob: { col: 0x18141f, spin: ['z', 3], tr: [tr(TR.drip, 0.1, { col: 0x15121c, size: [0.08, 0.13] }), tr(TR.splat, 0.3, { col: 0x221c2c })],
    model(p, c) { const m = lam(c ?? 0x1c1826, { smooth: true }); mk(p, G.sphere(10, 7), m, null, [0.14, 0.14, 0.17]); mk(p, G.cone(8), m, [0, 0, -0.22], [0.1, 0.25, 0.1], [-Math.PI / 2, 0, 0]); mk(p, G.sphere(6, 4), lam(0xffffff, { em: 0xffffff, ei: 0.6 }), [-0.05, 0.08, 0.06], 0.03); } },
  paint_red: { col: 0xe83a3a, spin: ['x', 6], tr: [tr(TR.splat, 0.12), tr(TR.drip, 0.18)], model: paintGlob },
  paint_blue: { col: 0x3a6ae8, spin: ['x', 6], tr: [tr(TR.splat, 0.12), tr(TR.drip, 0.18)], model: paintGlob },
  paint_gold: { col: 0xf0b828, spin: ['x', 6], glow: [0xffd060, 0.4], tr: [tr(TR.splat, 0.12), tr(TR.sparkle, 0.18, { col: 0xfff0a0 })], model: paintGlob },
  note: { col: 0xf040b0, glow: [0xff70d0, 0.7], billboard: true, tr: [tr(TR.sparkle, 0.15), tr(TR.note, 0.6)],
    model(p, c) { const s = tileSprite(TL.note, c ?? 0xf040b0, false, 6); s.scale.setScalar(0.5); s.name = 'nt'; p.add(s); },
    anim(p, t) { const s = p.getObjectByName('nt'); if (s) { s.position.y = Math.sin(t * 10) * 0.06; s.fxu.r = Math.sin(t * 8) * 0.25; } } },
  note_big: { col: 0x8a5aff, glow: [0xa080ff, 1.1], billboard: true, tr: [tr(TR.sparkle, 0.12, { col: 0xe0d0ff }), tr(TR.note, 0.3, { col: 0x8a5aff, size: [0.2, 0.28] }), tr({ tile: TL.ring, size: [0.25, 0.25], grow: 2.5, a: 0.4, life: [0.25, 0.35], col: 0xc0a0ff }, 0.6)],
    model(p, c) { const s = tileSprite(TL.note2, c ?? 0x7a4af0, false, 6); s.scale.setScalar(0.85); s.name = 'nt'; p.add(s); },
    anim(p, t) { const s = p.getObjectByName('nt'); if (s) { const k = 0.85 * (1 + 0.08 * Math.sin(t * 14)); s.scale.setScalar(k); s.fxu.r = Math.sin(t * 6) * 0.2; } } },
  paper_crane: { col: 0xf4f0e6, scale: 1.8, tr: [tr({ add: false, tile: TL.paper, col: 0xfff8ec, size: [0.08, 0.12], life: [0.4, 0.7], grav: 1, spin: 5, spd: [0.2, 0.4] }, 0.35)], model: craneModel, anim: craneFlap },
  thread: { col: 0xffd0f0, glow: [0xffc0f0, 0.25], rib: { w: 0.05, n: 14, col: 0xffe0f8, col2: 0xd080ff },
    model(p, c) { const m = fxMesh(xstrip(), fxMat('beam'), 5); m.scale.set(0.06, 0.06, 0.8); m.position.z = -0.6; m.fxu.c.set(c ?? 0xffb0f0); m.fxu.x.set(0.4, 4, 4, 0.2); m.fxu.o = 1; p.add(m); } },
  ribbon: { col: 0xff7ab8, rib: { w: 0.24, n: 18, col: 0xff8ac8, col2: 0xff5aa0, add: false, wave: 0.18 },
    model(p, c) { const m = lam(c ?? 0xff6aa8, { em: 0x802050, ei: 0.3 }); mk(p, G.torus(0.35, 4, 8), m, [0.07, 0, 0], 0.07, [0, Math.PI / 2, 0]); mk(p, G.torus(0.35, 4, 8), m, [-0.07, 0, 0], 0.07, [0, Math.PI / 2, 0]); mk(p, G.ico(0), m, null, 0.05); } },
  scissor_blade: { col: 0xd8e0e8, scale: 1.5, spin: ['y', 20], tr: [tr(TR.sparkle, 0.12, { col: 0xffffff })],
    model(p) { const g = G.shape('blade', (s) => { s.moveTo(0, 0); s.lineTo(0.06, 0.05); s.lineTo(0.02, 0.5); s.lineTo(-0.03, 0.06); s.closePath(); }, 0.015);
      mk(p, g, lam(0xe0e8f0, { em: 0x5a6a7a, ei: 0.4 }), [0, 0, 0], 1, [-Math.PI / 2, 0, 0]); mk(p, G.torus(0.2, 4, 10), lam(0xd04a4a), [0, 0, -0.08], 0.08, [Math.PI / 2, 0, 0]); } },
  acorn: { col: 0xc08850, scale: 1.3, spin: ['x', 7], tr: [tr({ add: false, tile: TL.leaf, col: 0xb07a3a, size: [0.08, 0.12], life: [0.4, 0.6], spin: 5, grav: 1 }, 0.4)],
    model(p) { mk(p, G.sphere(8, 6), lam(0xc8884a), [0, -0.03, 0], [0.11, 0.14, 0.11]); mk(p, G.sphere(8, 4), lam(0x6a4a2a), [0, 0.05, 0], [0.125, 0.07, 0.125]); mk(p, G.cyl(0.015, 0.015, 0.07, 4), lam(0x5a3a1a), [0, 0.13, 0]); } },
  spore: { col: 0xb8e070, glow: [0xc0f080, 0.6], tr: [tr(TR.spore, 0.08)],
    model(p, c) { mk(p, lumpy('spore', 1, 0.2, 3), lam(c ?? 0xb8e070, { em: 0x6a8a20, ei: 0.5 }), null, 0.1); const f = tileSprite(TL.dust, 0xd8ff90, true, 5); f.scale.setScalar(0.45); f.fxu.o = 0.6; p.add(f); } },
  _generic: { col: 0xfff0c0, glow: [0xfff0c0, 0.7], tr: [tr(TR.sparkle, 0.12)], model(p, c) { mk(p, G.ico(1), lam(c ?? 0xfff0c0, { em: c ?? 0xffe0a0, ei: 0.7 }), null, 0.12); } },
};
function paintGlob(p, c) { const col = c ?? this.col; mk(p, lumpy('paint', 1, 0.22, 1), lam(col, { em: col, ei: 0.2 }), null, [0.15, 0.15, 0.19]); mk(p, lumpy('paint2', 0, 0.2, 4), lam(col, { em: col, ei: 0.2 }), [0.08, 0.06, -0.14], 0.07); mk(p, lumpy('paint2', 0, 0.2, 4), lam(col, { em: col, ei: 0.2 }), [-0.06, -0.05, -0.2], 0.05); mk(p, G.sphere(6, 4), lam(0xffffff, { em: 0xffffff, ei: 0.5 }), [-0.05, 0.08, 0.06], 0.03); }
function craneModel(p, c) {
  const m = lam(c ?? 0xf4f0e6, { ds: true }), m2 = lam(0xe0d8c8, { ds: true });
  mk(p, triGeo('cbody', [[0, 0.1, 0], [0.06, 0, 0.12], [-0.06, 0, 0.12], [0, 0.1, 0], [-0.06, 0, -0.12], [0.06, 0, -0.12], [0, 0.1, 0], [0.06, 0, 0.12], [0.06, 0, -0.12], [0, 0.1, 0], [-0.06, 0, -0.12], [-0.06, 0, 0.12], [0, -0.05, 0], [-0.06, 0, 0.12], [0.06, 0, 0.12], [0, -0.05, 0], [0.06, 0, -0.12], [-0.06, 0, -0.12]]), m);
  mk(p, triGeo('cneck', [[0, 0, 0.08], [0, 0.03, 0.12], [0, 0.22, 0.28], [0, 0.22, 0.28], [0.02, 0.2, 0.33], [0, 0.18, 0.3]]), m2);
  mk(p, triGeo('ctail', [[0, 0, -0.08], [0, 0.03, -0.12], [0, 0.2, -0.32]]), m2);
  for (const s of [-1, 1]) { const pv = new THREE.Group(); pv.position.set(s * 0.04, 0.03, 0); pv.name = s < 0 ? 'wL' : 'wR'; p.add(pv); mk(pv, triGeo('cw' + s, [[0, 0, 0.1], [s * 0.42, 0.04, -0.06], [0, 0, -0.08], [s * 0.42, 0.04, -0.06], [s * 0.3, 0.02, -0.14], [0, 0, -0.08]]), s < 0 ? m : m2); }
}
function craneFlap(p, t) { const a = Math.sin(t * 9) * 0.6; const l = p.getObjectByName('wL'), r = p.getObjectByName('wR'); if (l) l.rotation.z = a; if (r) r.rotation.z = -a; }
for (const k of ['flask_fire', 'flask_ice', 'flask_shock', 'flask_acid']) PROJ[k].model = function (p, c) {
  const liq = c ?? this.flask;
  mk(p, G.sphere(8, 6), lam(0xe8f8ff, { op: 0.45, smooth: true }), null, 0.15); mk(p, G.sphere(8, 6), lam(liq, { em: liq, ei: 0.55, smooth: true }), [0, -0.015, 0], 0.122);
  mk(p, G.cyl(0.045, 0.05, 0.12, 8), lam(0xe8f8ff, { op: 0.5 }), [0, 0.17, 0]); mk(p, G.cyl(0.05, 0.045, 0.06, 8), lam(0x9a6a3a), [0, 0.25, 0]);
};

function buildProj(rig, def, tint) {
  const spin = new THREE.Group(); rig.root.add(spin); rig.spin = spin; const sg = new THREE.Group(); sg.scale.setScalar(def.scale ?? 1); rig.root.add(sg); sg.add(spin);
  const c = tint ? tint.getHex() : undefined;
  if (def.model) def.model.call(def, spin, c);
  if (def.glow) { const gl = glowSprite(tint ? tint.getHex() : def.glow[0], 5); gl.scale.setScalar(def.glow[1]); gl.fxu.o = 0.8; gl.fxu.x.x = 0.5; rig.root.add(gl); rig.glow = gl; }
  rig.root.traverse(o => { if (o.isMesh && !o.fxu) o.renderOrder = 4; });
  if (def.rib) { const st = getStrip(def.rib.n); const m = fxMesh(st.geo, fxMat('trail', { add: def.rib.add !== false }), 4); m.strip = st; m.fxu.c.set(tint ? tint.getHex() : def.rib.col); m.fxu.c2.set(tint ? tint.getHex() : def.rib.col2); rig.rib = m; rig.extra = [m]; }
}
function projStart(e, fx) { const r = e.rig; e.hist = 0; if (r.rib) { fx.root.add(r.rib); r.rib.visible = false; } }
function projTick(e, dt, fx) {
  const r = e.rig, def = e.def; if (!e.has) return true;
  if (def.spin) r.spin.rotation[def.spin[0]] += def.spin[1] * dt;
  if (def.billboard) r.spin.rotation.set(0, 0, 0);
  if (def.anim) def.anim(r.spin, e.t);
  if (r.glow) { r.glow.fxu.o = 0.7 + 0.15 * Math.sin(e.t * 25); }
  // particle trail by distance travelled
  const dx = e.p.x - e.last.x, dy = e.p.y - e.last.y, dz = e.p.z - e.last.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (def.tr && d > 0) for (const t of def.tr) { const n = d / t.per * (t.sp.n ?? 1) * e.nMul; if (n > 0) spray(fx, t.sp.shape ? t.sp : (t.sp.shape = 'line', t.sp), e.p.x, e.p.y, e.p.z, e.sc, e.col, -dx, -dz, n); }
  // ribbon trail (history of positions)
  if (r.rib) {
    const st = r.rib.strip, pts = st.pts, n = st.n, rb = def.rib;
    if (e.hist === 0) { for (let i = 0; i < n; i++) pts[i].copy(e.p); e.hist = 1; }
    if (pts[n - 2].distanceToSquared(e.p) > 0.0144) { for (let i = 0; i < n - 1; i++) pts[i].copy(pts[i + 1]); }
    pts[n - 1].copy(e.p);
    if (rb.wave) { for (let i = 0; i < n - 1; i++) { pts[i].y += Math.sin(e.t * 9 + i * 0.9) * rb.wave * dt * 3; } }
    st.build((k) => rb.w * e.sc * (0.25 + 0.75 * k)); r.rib.visible = true; r.rib.fxu.o = 1;
  }
  e.last.copy(e.p);
  return true;
}

// ============================================================================================ stroke textures
const texBrush = () => ctex('brush', 128, (g, W, H) => {
  // tapered stroke body with ragged edges, dry-brush streaks at the tail end, droplets at the head
  g.fillStyle = 'rgba(255,255,255,0.92)'; g.beginPath();
  const top = [], bot = [];
  for (let i = 0; i <= 40; i++) { const t = i / 40, x = 6 + t * (W - 40), w = 48 * Math.pow(Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.5), 0.6) * (1 - 0.55 * Math.pow(t, 3));
    top.push([x, 64 - w + Math.sin(i * 2.7) * 4]); bot.push([x, 64 + w + Math.sin(i * 1.9 + 1) * 4]); }
  g.moveTo(top[0][0], top[0][1]); for (const p of top) g.lineTo(p[0], p[1]); for (const p of bot.reverse()) g.lineTo(p[0], p[1]); g.closePath(); g.fill();
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 9; i++) { const y = 20 + Math.random() * 88; g.strokeStyle = `rgba(0,0,0,${0.2 + Math.random() * 0.3})`; g.lineWidth = 1 + Math.random() * 3; g.beginPath(); g.moveTo(W * (0.05 + Math.random() * 0.4), y); g.lineTo(W * (0.5 + Math.random() * 0.5), y + (Math.random() - 0.5) * 6); g.stroke(); }
  g.globalCompositeOperation = 'source-over'; g.fillStyle = 'rgba(255,255,255,0.95)';
  for (let i = 0; i < 10; i++) { g.beginPath(); g.arc(W - 30 - Math.random() * 40, 20 + Math.random() * 90, 2 + Math.random() * 5, 0, TAU); g.fill(); }
}, 512);
const texVine = () => { const t = ctex('vine', 128, (g, W, H) => {
  g.lineCap = 'round';
  g.strokeStyle = '#3e7a28'; g.lineWidth = 14; g.beginPath(); for (let x = 0; x <= W; x += 8) g.lineTo(x, 64 + Math.sin(x / W * TAU * 2) * 22); g.stroke();
  g.strokeStyle = '#5aa83a'; g.lineWidth = 6; g.beginPath(); for (let x = 0; x <= W; x += 8) g.lineTo(x, 62 + Math.sin(x / W * TAU * 2) * 22); g.stroke();
  g.strokeStyle = '#4a8a2c'; g.lineWidth = 5; g.beginPath(); for (let x = 0; x <= W; x += 8) g.lineTo(x, 64 + Math.sin(x / W * TAU * 2 + 2) * 30); g.stroke();
  for (let i = 0; i < 8; i++) { const x = i * 64 + 20, y = 64 + Math.sin(x / W * TAU * 2) * 22, up = i % 2 ? 1 : -1; g.save(); g.translate(x, y); g.rotate(up * 0.9 + 0.3); g.fillStyle = i % 3 ? '#7cc850' : '#5ab83a';
    g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(10, -10, 12, -30, 0, -40); g.bezierCurveTo(-12, -30, -10, -10, 0, 0); g.fill(); g.restore();
    g.fillStyle = '#e8e0b0'; g.beginPath(); g.moveTo(x + 30, y - 4); g.lineTo(x + 34, y - 14 * up); g.lineTo(x + 38, y - 4); g.fill(); }
}, 512); t.wrapS = THREE.RepeatWrapping; return t; };

// ============================================================================================ slashes
const SLH = 0.75; // swing height
function arcMesh(e, add = false, inner = 0.45) { return fxMesh(G.arc(e.A, inner), fxMat('slash', { add }), 5); }
function sweep(m, e, u, tilt = -0.1, y = SLH) {
  const f = m.fxu, head = easeOut(clamp01(u / 0.4)), tail = Math.pow(clamp01((u - 0.15) / 0.85), 1.3);
  f.x.set(head, tail, 1, 0); f.t = e.t; f.c.copy(e.col); f.c2.copy(e.col).multiplyScalar(0.6); f.o = 0.95 * (1 - smooth(0.75, 1, u));
  m.position.y = y; return head;
}
const SLASH = {
  // basic weapon swing: bright crescent with an additive glow edge, gold sparks and a short streak along the edge
  blade: { dur: 0.3, col: 0xfff0c0, keyFn: (e) => Math.round(e.A / 5),
    start(e, fx) { const r = e.rig, tl = (e.o && e.o.tilt) || 0;
      if (!r.a1) { r.a1 = arcMesh(e, true, 0.3); r.a2 = arcMesh(e, true, 0.3); r.a3 = arcMesh(e, true, 0.3); r.root.add(r.a1, r.a2, r.a3); }
      r.a1.scale.setScalar(e.R); r.a2.scale.setScalar(e.R * 1.07); r.a3.scale.setScalar(e.R * 0.92);
      for (const m of [r.a1, r.a2, r.a3]) m.rotation.set(-0.12, 0, tl);
      spray(fx, { n: 14, tile: TL.ember, mode: 2, shape: 'cone', spread: e.A / 2, off: e.R * 0.95, spd: [3, 6], up: [0.5, 2], grav: 5, size: [0.05, 0.08], life: [0.2, 0.4], col: [0xfff6d0, 0xffc860], y: SLH, str: 0.06, tint: false }, e.p.x, e.p.y, e.p.z, 1, e.col, e.dx, e.dz);
      spray(fx, { n: 4, tile: TL.spark, shape: 'cone', spread: e.A / 2, off: e.R * 0.9, spd: [0.5, 1.2], size: [0.18, 0.3], life: [0.18, 0.3], col: 0xffffff, y: SLH, spin: 4, tint: false }, e.p.x, e.p.y, e.p.z, 1, e.col, e.dx, e.dz); },
    tick(e) { const r = e.rig, u = e.lt / 0.3, tl = (e.o && e.o.tilt) || 0;
      sweep(r.a1, e, u, -0.12); sweep(r.a2, e, Math.min(1, u * 1.08), -0.12); sweep(r.a3, e, u * 0.95, -0.12);
      for (const m of [r.a1, r.a2, r.a3]) m.rotation.z = tl;
      r.a1.fxu.c.setRGB(1, 1, 1); r.a1.fxu.c2.setRGB(0.35, 0.65, 1); r.a1.fxu.x.z = 0.5;
      r.a2.fxu.c.setRGB(1, 0.85, 0.35); r.a2.fxu.c2.setRGB(1, 0.45, 0.08); r.a2.fxu.x.z = 0.32;
      r.a3.fxu.c.setRGB(0.6, 0.85, 1); r.a3.fxu.c2.setRGB(0.2, 0.4, 1); r.a3.fxu.x.z = 0.22; r.a3.fxu.o *= 0.8; } },
  arc: { dur: 0.32, col: 0x5ab8ff, keyFn: (e) => Math.round(e.A / 5),
    build(rig, def) { },
    start(e, fx) { const r = e.rig; if (!r.arc) { r.arc = arcMesh(e); r.root.add(r.arc); } r.arc.scale.setScalar(e.R); r.arc.rotation.set(-0.1, 0, 0);
      spray(fx, { n: 8, tile: TL.ember, mode: 2, shape: 'cone', spread: e.A / 2, off: e.R * 0.9, spd: [2, 4], size: [0.04, 0.06], life: [0.15, 0.3], col: 0xffffff, y: SLH, str: 0.06 }, e.p.x, e.p.y, e.p.z, 1, e.col, e.dx, e.dz); },
    tick(e) { sweep(e.rig.arc, e, e.lt / SLASH.arc.dur); } },
  cross: { dur: 0.4, col: 0xff5a7a, keyFn: (e) => Math.round(e.A / 5),
    start(e) { const r = e.rig; if (!r.a1) { for (const k of ['a1', 'a2']) { const g = new THREE.Group(); const m = arcMesh(e); g.add(m); r.root.add(g); r[k] = m; } }
      [r.a1, r.a2].forEach((m, i) => { m.scale.set(i ? -e.R : e.R, e.R, e.R); m.parent.rotation.set(0, 0, (i ? -1 : 1) * 0.6); m.parent.position.set(0, SLH + 0.15, -e.R * 0.25); m.rotation.y = 0; }); },
    tick(e) { const u = e.lt / 0.4; sweep(e.rig.a1, e, clamp01(u / 0.8), 0, 0); sweep(e.rig.a2, e, clamp01((u - 0.2) / 0.8), 0, 0); if (u < 0.2) e.rig.a2.fxu.o = 0; } },
  spin: { dur: 0.4, col: 0x8ad0ff,
    start(e, fx) { const r = e.rig; if (!r.arc) { r.arc = fxMesh(G.arc(360, 0.5), fxMat('slash', { add: false }), 5); r.root.add(r.arc); } r.arc.scale.setScalar(e.R); r.arc.rotation.set(0, 0, 0);
      spray(fx, ext(P.dustRing, { n: 10, spd: [2, 3] }), e.p.x, e.p.y, e.p.z, 1); },
    tick(e) { const r = e.rig; sweep(r.arc, e, e.lt / 0.4, 0, 0.55); r.arc.rotation.y = -e.lt * 4; } },
  thrust: { dur: 0.28, col: 0xffe8a0, length: 2.2,
    build(rig) { rig.st = fxMesh(G.stripG(8), fxMat('trail', { add: false }), 5); rig.st2 = fxMesh(G.stripG(8), fxMat('trail', {}), 6); rig.tip = glowSprite(0xffffff, 6); rig.root.add(rig.st, rig.st2, rig.tip); },
    start(e, fx) { spray(fx, { n: 8, tile: TL.streak, mode: 2, shape: 'cone', spread: 8, spd: [6, 10], size: [0.05, 0.07], life: [0.12, 0.22], col: 0xffffff, y: SLH, str: 0.05, fwd: [0.2, e.len * 0.6] }, e.p.x, e.p.y, e.p.z, 1, e.col, e.dx, e.dz); },
    tick(e) { const r = e.rig, u = e.lt / 0.28, ext_ = easeOut(clamp01(u / 0.3)), L = e.len * ext_, o = 1 - smooth(0.5, 1, u);
      for (const [m, w] of [[r.st, Math.max(0.3, e.wid)], [r.st2, Math.max(0.3, e.wid) * 0.4]]) { m.rotation.y = -Math.PI / 2; m.position.set(0, SLH, 0.2); m.scale.set(Math.max(0.01, L), 1, w); m.fxu.c.copy(e.col); m.fxu.c2.copy(e.col).multiplyScalar(0.5); m.fxu.o = o; }
      r.tip.position.set(0, SLH, 0.2 + L); r.tip.scale.setScalar(0.7 * (SkillFx.reduceFlash ? 0.6 : 1)); r.tip.fxu.c.copy(e.col); r.tip.fxu.o = o * 0.9; r.tip.fxu.x.x = 1; } },
  smash: { dur: 1.1, col: 0xc89a5a, shake: [0.3, 0.3], start: (e, fx) => fx.shatter.spawn(new THREE.Vector3(e.p.x + e.dx * e.R * 0.6, e.p.y, e.p.z + e.dz * e.R * 0.6), 1.4, { power: 0.7 }), L: [{ type: 'flash', col: 0xffe0a0, size: 1.2, dur: 0.12, y: 0.4, a: 0.7 }],
    P: [ext(P.dustRing, { n: 14, spd: [2.5, 3.5] }), ext(P.embers, { n: 8, y: 0.2 })],
    start(e) { e.sc = e.R / 1.6; e.p.x += e.dx * e.R * 0.5; e.p.z += e.dz * e.R * 0.5; e.rig.root.position.copy(e.p); } },
  fan_needles: { dur: 0.45, col: 0xffc830, angle: 60, length: 5,
    start(e, fx) { const N = 7, A = e.A * DEG, c = e.col, sp = e.len / 0.35;
      for (let i = 0; i < N; i++) { const a = -A / 2 + A * i / (N - 1), ca = Math.cos(a), sa = Math.sin(a), ux = e.dx * ca - e.dz * sa, uz = e.dx * sa + e.dz * ca;
        fx.pa.emit(e.p.x + ux * 0.4, e.p.y + SLH, e.p.z + uz * 0.4, ux * sp, 0, uz * sp, 0.35, 0.06, 0.06, c.r, c.g, c.b, c.r, c.g, c.b, 1, TL.streak, 2, 0, 0, 0, 0, 0.06, 0.8);
        fx.pn.emit(e.p.x + ux * 0.4, e.p.y + SLH, e.p.z + uz * 0.4, ux * sp, 0, uz * sp, 0.35, 0.05, 0.05, c.r * 0.8, c.g * 0.6, c.b * 0.2, c.r, c.g, c.b, 1, TL.streak, 2, 0, 0, 0, 0, 0.05, 0.8); }
      spray(fx, ext(P.sparkle, { n: 6, y: SLH, fwd: 0.4, spd: [0.5, 1.5] }), e.p.x, e.p.y, e.p.z, 1, e.col, e.dx, e.dz); } },
  scissor_snip: { dur: 0.5, col: 0xd8e4f0,
    build(rig) { const bg = G.shape('sblade', (s) => { s.moveTo(-0.08, 0); s.lineTo(0.1, 0.06); s.lineTo(0.02, 0.8); s.lineTo(-0.07, 0.1); s.closePath(); }, 0.03), mat = lam(0xe8eef4, { em: 0x6a7a8a, ei: 0.45 });
      rig.bl = []; for (let i = 0; i < 2; i++) { const pv = new THREE.Group(); const m = new THREE.Mesh(bg, mat); m.rotation.x = Math.PI / 2; m.position.z = -0.15; pv.add(m); const h = new THREE.Mesh(G.torus(0.22, 4, 10), lam(0xd04a4a)); h.scale.setScalar(0.12); h.rotation.x = Math.PI / 2; h.position.set(i ? 0.08 : -0.08, 0, -0.32); pv.add(h); rig.root.add(pv); rig.bl.push(pv); }
      rig.gl = tileSprite(TL.spark, 0xffffff, true, 6); rig.root.add(rig.gl); },
    start(e) { for (const b of e.rig.bl) b.position.set(0, SLH, 0.5); },
    tick(e, dt, fx) { const r = e.rig, u = e.lt / 0.5, close = easeOut(clamp01(u / 0.3)), a = 0.55 * (1 - close), k = 1.4 * (1 - smooth(0.75, 1, u)) + 0.001;
      r.bl[0].rotation.y = a; r.bl[1].rotation.y = -a; r.bl[0].scale.setScalar(k); r.bl[1].scale.setScalar(k);
      const g = r.gl, gu = clamp01((u - 0.28) / 0.3); g.visible = gu > 0 && gu < 1; g.position.set(0, SLH + 0.05, 0.5 + 0.55 * k); g.scale.setScalar(0.9 * Math.sin(gu * Math.PI) * (SkillFx.reduceFlash ? 0.6 : 1)); g.fxu.o = 1; g.fxu.r = gu * 2;
      if (!e.snip && u > 0.3) { e.snip = 1; spray(fx, { n: 10, tile: TL.ember, mode: 2, shape: 'sphere', spd: [2, 4], size: [0.04, 0.06], life: [0.15, 0.3], col: 0xffffff, y: SLH, fwd: 1.2, str: 0.05 }, e.p.x, e.p.y, e.p.z, 1, null, e.dx, e.dz); } } },
  brush_stroke: { dur: 0.6, col: 0xe0503a, keyFn: (e) => Math.round(e.A / 5),
    start(e, fx) { const r = e.rig; if (!r.arc) { r.arc = fxMesh(G.arc(e.A, 0.5), fxMat('reveal', { map: texBrush(), add: false }), 5); r.root.add(r.arc); } r.arc.scale.setScalar(e.R); r.arc.position.y = 0.6; r.arc.rotation.set(-0.15, 0, 0); },
    tick(e, dt, fx) { const m = e.rig.arc, u = e.lt / 0.6, f = m.fxu, head = easeOut(clamp01(u / 0.35)); f.p = head; f.x.set(clamp01((u - 0.55) / 0.45) * 1.05, 0, 0, 0); f.tile.set(0, 0, 1, 1); f.c.copy(e.col); f.o = 0.95;
      if (u < 0.35) { const a = (-e.A / 2 + e.A * head) * DEG, ca = Math.cos(a), sa = Math.sin(a), ux = e.dx * ca - e.dz * sa, uz = e.dx * sa + e.dz * ca;
        spray(fx, { n: 1, add: false, tile: TL.drop, shape: 'sphere', spd: [1, 2], up: [0.5, 1.5], grav: 7, size: [0.08, 0.14], life: [0.4, 0.6], y: 0.6 }, e.p.x + ux * e.R * 0.8, e.p.y, e.p.z + uz * e.R * 0.8, 1, e.col, 0, 1, 40 * dt); } } },
  sound_cone: { dur: 0.7, col: 0x3ab8f0, angle: 70, length: 4,
    build(rig) { rig.w = []; for (let i = 0; i < 4; i++) { const m = fxMesh(G.arc(70, 0.84), fxMat('band', { add: false }), 5); rig.root.add(m); rig.w.push(m); } },
    keyFn: (e) => Math.round(e.A / 5),
    start(e, fx) { const r = e.rig; r.w.forEach(m => { m.geometry = G.arc(e.A, 0.84); });
      spray(fx, { n: 5, add: false, tile: TL.note, shape: 'cone', spread: e.A / 2, spd: [3, 5], drag: 2, size: [0.24, 0.3], life: [0.5, 0.7], y: 0.9, rot0: 0, col: [0x3ab8f0, 0xe040b0] }, e.p.x, e.p.y, e.p.z, 1, null, e.dx, e.dz); },
    tick(e) { const u = e.lt / 0.7; e.rig.w.forEach((m, i) => { const v = clamp01((u - i * 0.12) / 0.55); m.visible = v > 0 && v < 1; m.scale.set(0.3 + e.len * v, 1, 0.3 + e.len * v); m.position.y = 0.8 + 0.1 * Math.sin(v * 3); m.fxu.c.copy(e.col); m.fxu.o = Math.sin(v * Math.PI) * 0.95; }); } },
  wind_cone: { dur: 0.6, col: 0xc8f8e0, angle: 60, length: 4,
    build(rig) { rig.w = []; for (let i = 0; i < 3; i++) { const m = fxMesh(G.arc(60, 0.9), fxMat('band', { add: false }), 5); rig.root.add(m); rig.w.push(m); } }, keyFn: (e) => Math.round(e.A / 5),
    start(e, fx) { e.rig.w.forEach(m => { m.geometry = G.arc(e.A * 0.8, 0.9); });
      spray(fx, { n: 18, add: false, tile: TL.streak, mode: 2, shape: 'cone', spread: e.A / 2, spd: [e.len * 1.6, e.len * 2.4], drag: 2.5, size: [0.06, 0.1], life: [0.3, 0.5], a: 0.85, y: [0.2, 1.2], str: 0.12 }, e.p.x, e.p.y, e.p.z, 1, e.col, e.dx, e.dz);
      spray(fx, { n: 5, add: false, tile: TL.swirl, shape: 'cone', spread: e.A / 2, spd: [3, 5], drag: 2, size: [0.4, 0.55], life: [0.4, 0.55], a: 0.7, y: 0.6, spin: 8 }, e.p.x, e.p.y, e.p.z, 1, e.col, e.dx, e.dz);
      spray(fx, { n: 4, add: false, tile: TL.leaf, col: 0x7cc850, shape: 'cone', spread: e.A / 2, spd: [3, 6], drag: 2, size: [0.12, 0.18], life: [0.4, 0.6], y: 0.6, spin: 10, tint: false }, e.p.x, e.p.y, e.p.z, 1, null, e.dx, e.dz); },
    tick(e) { const u = e.lt / 0.6; e.rig.w.forEach((m, i) => { const v = clamp01((u - i * 0.1) / 0.6); m.visible = v > 0 && v < 1; m.scale.set(0.3 + e.len * v, 1, 0.3 + e.len * v); m.position.y = 0.35 + i * 0.3; m.rotation.y = (i - 1) * 0.15; m.fxu.c.copy(e.col); m.fxu.o = Math.sin(v * Math.PI) * 0.8; }); } },
  fire_cone: { dur: 0.6, col: 0xff7a1a, angle: 40, length: 3.5,
    start(e) { const sp = e.len / 0.4; e.s1 = { add: false, a: 0.9, tile: TL.smoke, shape: 'cone', spread: e.A / 2.4, off: 0.4, spd: [sp * 0.8, sp * 1.1], drag: 1.2, size: [0.25, 0.35], grow: 4, life: [0.4, 0.5], col: [0xffd060, 0xffa030], col2: 0xe02a10, y: [0.6, 0.8], spin: 2, fo: 0.4 };
      e.s2 = { tile: TL.flame, shape: 'cone', spread: e.A / 2.8, off: 0.3, spd: [sp * 0.7, sp], drag: 1.2, size: [0.2, 0.3], grow: 3, life: [0.3, 0.42], col: 0xffe080, col2: 0xff5010, y: 0.7, spin: 3 };
      e.s3 = ext(P.smokeDark, { shape: 'cone', spread: e.A / 2, off: 0.6, spd: [sp * 0.6, sp * 0.8], drag: 1.5, size: [0.3, 0.4], grow: 3, life: [0.6, 0.8], y: 0.9, a: 0.35 }); },
    tick(e, dt, fx) { if (e.lt < 0.45) { spray(fx, e.s1, e.p.x, e.p.y, e.p.z, 1, e.tint, e.dx, e.dz, 70 * dt); spray(fx, e.s2, e.p.x, e.p.y, e.p.z, 1, e.tint, e.dx, e.dz, 40 * dt); spray(fx, e.s3, e.p.x, e.p.y, e.p.z, 1, null, e.dx, e.dz, 12 * dt); spray(fx, P.embers, e.p.x + e.dx * e.len * 0.6, e.p.y, e.p.z + e.dz * e.len * 0.6, 0.6, null, 0, 1, 20 * dt); } } },
  shotgun_cone: { dur: 0.5, col: 0xffc040, angle: 40, length: 4,
    build(rig) { rig.gl = glowSprite(0xffc060, 6); rig.root.add(rig.gl); },
    start(e, fx) { const sp = e.len / 0.25;
      spray(fx, { n: 14, add: false, tile: TL.streak, mode: 2, shape: 'cone', spread: e.A / 2, off: 0.5, spd: [sp * 0.8, sp * 1.1], size: [0.06, 0.08], life: [0.22, 0.28], y: [0.75, 0.9], str: 0.04, fo: 0.8 }, e.p.x, e.p.y, e.p.z, 1, e.col, e.dx, e.dz);
      spray(fx, { n: 14, tile: TL.ember, mode: 2, shape: 'cone', spread: e.A / 2, off: 0.5, spd: [sp * 0.8, sp * 1.1], size: [0.05, 0.06], life: [0.22, 0.28], y: [0.75, 0.9], str: 0.03, col: 0xfff0a0, fo: 0.8, tint: false }, e.p.x, e.p.y, e.p.z, 1, null, e.dx, e.dz);
      spray(fx, ext(P.smokeDark, { n: 5, col: 0x9a948c, a: 0.5, shape: 'cone', spread: 25, spd: [1, 2], size: [0.25, 0.35], fwd: 0.6, y: 0.8, life: [0.5, 0.8] }), e.p.x, e.p.y, e.p.z, 1, null, e.dx, e.dz);
      spray(fx, { n: 6, tile: TL.flame, shape: 'cone', spread: 25, spd: [2, 4], size: [0.25, 0.35], life: [0.08, 0.14], col: 0xffd060, fwd: 0.6, y: 0.8, tint: false }, e.p.x, e.p.y, e.p.z, 1, null, e.dx, e.dz); },
    tick(e) { const g = e.rig.gl, u = clamp01(e.lt / 0.12); g.visible = u < 1; g.position.set(0, 0.82, 0.6); g.scale.setScalar(1.2 * (1 - u * 0.5) * (SkillFx.reduceFlash ? 0.5 : 1)); g.fxu.o = (1 - u) * (SkillFx.reduceFlash ? 0.5 : 1); g.fxu.x.x = 1; } },
};

// ============================================================================================ beams
function stripMesh(mode, o) { return fxMesh(G.strip(16), fxMat(mode, o), 5); }
const BEAM = {
  laser: { dur: 0.4, col: 0xff3a5a,
    build(rig) { rig.halo = stripMesh('beam', { add: false }); rig.core = stripMesh('beam'); rig.f1 = glowSprite(0xffffff, 6); rig.f2 = glowSprite(0xffffff, 6); rig.root.add(rig.halo, rig.core, rig.f1, rig.f2); },
    tick(e, dt, fx) { const r = e.rig, u = e.lt / 0.4, wk = (u < 0.12 ? easeOut(u / 0.12) : 1) * (1 - smooth(0.6, 1, u)) * (1 + 0.08 * Math.sin(e.t * 60));
      orientStrip(r.halo, e.a, e.b, e.w * 2.2 * wk + 0.001); orientStrip(r.core, e.a, e.b, e.w * 0.9 * wk + 0.001);
      r.halo.fxu.c.copy(e.col); r.halo.fxu.x.set(0.05, e.L * 2, 8, 0.03); r.halo.fxu.t = e.t; r.halo.fxu.o = 0.75;
      r.core.fxu.c.copy(e.col).lerp(_c1.set(0xffffff), 0.5); r.core.fxu.x.set(0.35, e.L * 3, 14, 0.03); r.core.fxu.t = e.t; r.core.fxu.o = 1;
      const fl = SkillFx.reduceFlash ? 0.5 : 1; r.f1.position.copy(e.a); r.f2.position.copy(e.b); r.f1.scale.setScalar(e.w * 3 * wk * fl + 0.001); r.f2.scale.setScalar(e.w * 4 * wk * fl + 0.001);
      for (const f of [r.f1, r.f2]) { f.fxu.c.copy(e.col); f.fxu.o = wk; f.fxu.x.x = 1; }
      if (u < 0.7) spray(fx, ext(P.embers, { n: 1, y: 0, spd: [2, 4], up: [0.5, 2] }), e.b.x, e.b.y, e.b.z, 0.7, e.col, 0, 1, 40 * dt); } },
  lightning: { dur: 0.45, col: 0x8ab8ff,
    build(rig) { rig.s1 = getStrip(14); rig.s2 = getStrip(14); rig.m1 = fxMesh(rig.s1.geo, fxMat('beam', { add: false }), 5); rig.m1.strip = rig.s1; rig.m2 = fxMesh(rig.s2.geo, fxMat('beam'), 6); rig.m2.strip = rig.s2;
      rig.br = getStrip(7); rig.m3 = fxMesh(rig.br.geo, fxMat('beam'), 6); rig.m3.strip = rig.br; rig.f = glowSprite(0xffffff, 6); rig.root.add(rig.m1, rig.m2, rig.m3, rig.f); },
    start(e) { e.jt = 0; },
    tick(e, dt, fx) { const r = e.rig, u = e.lt / 0.45;
      if (e.t >= e.jt) { e.jt = e.t + 0.05; jag(r.s1, e.a, e.b, 1.1); for (let i = 0; i < r.s1.n; i++) r.s2.pts[i].copy(r.s1.pts[i]);
        const k = 3 + ((Math.random() * 6) | 0); _v3.copy(r.s1.pts[k]); _v1.set(rnd(-1, 1), rnd(-0.5, 0.2), rnd(-1, 1)).multiplyScalar(Math.min(1.5, e.L * 0.3)).add(_v3); jag(r.br, _v3, _v1, 1.3);
        r.s1.build(() => e.w * 1.8); r.s2.build((k) => e.w * 0.55); r.br.build((k) => e.w * 0.4 * (1 - k));
        spray(fx, { n: 2, tile: TL.ember, mode: 2, shape: 'sphere', spd: [2, 4], size: [0.04, 0.06], life: [0.1, 0.25], col: 0xffffff, str: 0.04 }, e.b.x, e.b.y, e.b.z, 1); }
      const fl = 0.55 + 0.45 * Math.random(), o = 1 - smooth(0.6, 1, u);
      r.m1.fxu.c.copy(e.col); r.m1.fxu.x.set(0.1, 5, 10, 0.02); r.m1.fxu.o = 0.7 * o * fl; r.m1.fxu.t = e.t;
      r.m2.fxu.c.set(0xf0f6ff); r.m2.fxu.x.set(0.5, 5, 10, 0.02); r.m2.fxu.o = o * fl; r.m2.fxu.t = e.t;
      r.m3.fxu.c.copy(e.col); r.m3.fxu.x.set(0.5, 4, 8, 0.05); r.m3.fxu.o = o * fl;
      r.f.position.copy(e.b); r.f.scale.setScalar(0.9 * (SkillFx.reduceFlash ? 0.5 : 1)); r.f.fxu.c.copy(e.col); r.f.fxu.o = o * fl * (SkillFx.reduceFlash ? 0.5 : 1); r.f.fxu.x.x = 1; } },
  vine_line: { dur: 1.4, col: 0xffffff,
    build(rig) { rig.m = fxMesh(G.stripG(16), fxMat('reveal', { map: texVine(), add: false }), 3); rig.root.add(rig.m); },
    start(e) { _v1.copy(e.a); _v2.copy(e.b); _v1.y += 0.06; _v2.y += 0.06; orientFlat(e.rig.m, _v1, _v2, Math.max(0.9, e.w * 3)); },
    tick(e, dt, fx) { const m = e.rig.m, u = e.lt / 1.4, f = m.fxu, head = easeOut(clamp01(u / 0.35)); f.p = head; f.tile.set(0, 0, e.L / 1.2, 1); f.c.copy(e.col); f.o = 1 - smooth(0.75, 1, u); f.x.set(0, 0, 0, 0);
      if (u < 0.35) { _v1.lerpVectors(e.a, e.b, head); spray(fx, { n: 1, add: false, tile: TL.leaf, col: [0x7cc850, 0x5ab83a], shape: 'sphere', hemi: true, spd: [0.5, 1.5], up: [0.5, 1.5], grav: 3, size: [0.14, 0.2], life: [0.5, 0.8], y: 0.15, spin: 5, tint: false }, _v1.x, _v1.y, _v1.z, 1, null, 0, 1, 30 * dt); } } },
  ribbon_line: { dur: 0.7, col: 0xff6aa8,
    build(rig) { rig.m = fxMesh(G.strip(32), fxMat('beam', { add: false, wave: true }), 5); rig.root.add(rig.m); },
    tick(e, dt, fx) { const m = e.rig.m, u = e.lt / 0.7, head = easeOut(clamp01(u / 0.3)); _v1.lerpVectors(e.a, e.b, head);
      orientStrip(m, e.a, _v1, e.w * 1.2); m.fxu.c.copy(e.col); m.fxu.x.set(0.6, 3, 4, 0.05); m.fxu.t = e.t; m.fxu.o = 1 - smooth(0.7, 1, u);
      if (u < 0.5) spray(fx, { n: 1, tile: TL.spark, size: [0.12, 0.18], life: [0.3, 0.5], col: 0xffd0e8, spd: [0.2, 0.5] }, _v1.x, _v1.y, _v1.z, 1, null, 0, 1, 25 * dt); } },
  thread_link: { dur: 0.6, col: 0xe8b0ff,
    build(rig) { rig.m = stripMesh('beam', { add: false }); rig.c = stripMesh('beam'); rig.root.add(rig.m, rig.c); },
    tick(e) { const r = e.rig, u = e.lt / 0.6, o = (u < 0.1 ? u / 0.1 : 1) * (1 - smooth(0.7, 1, u));
      orientStrip(r.m, e.a, e.b, Math.max(0.06, e.w * 0.35)); orientStrip(r.c, e.a, e.b, Math.max(0.03, e.w * 0.12));
      r.m.fxu.c.copy(e.col); r.m.fxu.x.set(0.25, e.L * 3, 6, 0.02); r.m.fxu.t = e.t; r.m.fxu.o = o; r.c.fxu.c.set(0xffffff); r.c.fxu.x.set(0.6, e.L * 4, -8, 0.02); r.c.fxu.t = e.t; r.c.fxu.o = o; } },
  soundwave_line: { dur: 0.8, col: 0x3ab8f0,
    build(rig) { rig.l = stripMesh('beam', { add: false }); rig.root.add(rig.l); rig.rs = []; for (let i = 0; i < 5; i++) { const m = setTile(fxMesh(G.plane(), fxMat('tex', { map: atlasTex(), add: false }), 5), TL.ring); rig.root.add(m); rig.rs.push(m); } },
    tick(e) { const r = e.rig, u = e.lt / 0.8; orientStrip(r.l, e.a, e.b, e.w * 0.4); r.l.fxu.c.copy(e.col); r.l.fxu.x.set(0.2, e.L * 2, 6, 0.04); r.l.fxu.o = 0.5 * (1 - smooth(0.6, 1, u)); r.l.fxu.t = e.t;
      _v2.subVectors(e.b, e.a).normalize(); _q.setFromUnitVectors(ZA, _v2);
      r.rs.forEach((m, i) => { const v = clamp01((u - i * 0.1) / 0.5); m.visible = v > 0 && v < 1; m.position.lerpVectors(e.a, e.b, v); m.quaternion.copy(_q); const s = (0.4 + e.w * 2.5) * (0.6 + 0.6 * v); m.scale.set(s, s, 1); m.fxu.c.copy(e.col); m.fxu.o = Math.sin(v * Math.PI); }); } },
  ink_stroke: { dur: 1.6, col: 0x15121c,
    build(rig) { rig.m = fxMesh(G.stripG(16), fxMat('reveal', { map: texBrush(), add: false }), 3); rig.root.add(rig.m); },
    start(e) { _v1.copy(e.a); _v2.copy(e.b); _v1.y += 0.05; _v2.y += 0.05; orientFlat(e.rig.m, _v1, _v2, Math.max(0.8, e.w * 2.8)); },
    tick(e, dt, fx) { const m = e.rig.m, u = e.lt / 1.6, f = m.fxu, head = easeOut(clamp01(u / 0.2)); f.p = head; f.tile.set(0, 0, 1, 1); f.c.copy(e.col); f.o = 0.95 * (1 - smooth(0.7, 1, u)); f.x.set(0, 0, 0, 0);
      if (u < 0.2) { _v1.lerpVectors(e.a, e.b, head); spray(fx, { n: 1, add: false, tile: TL.drop, shape: 'sphere', hemi: true, spd: [1, 2.5], up: [1, 2], grav: 9, size: [0.1, 0.16], life: [0.3, 0.5], y: 0.1 }, _v1.x, _v1.y, _v1.z, 1, e.col, 0, 1, 50 * dt); } } },
  water_wave: { dur: 1.0, col: 0x2a78e0,
    build(rig) { rig.m = fxMesh(G.crescent(), fxMat('water', { add: false }), 5); rig.root.add(rig.m); },
    start(e) { e.rig.m.rotation.set(0, Math.atan2(e.dx, e.dz), 0); },
    tick(e, dt, fx) { const m = e.rig.m, u = e.lt / 1.0, v = clamp01(u / 0.85), s = Math.max(0.8, e.w * 4) * (0.6 + 0.4 * Math.sin(Math.min(1, v * 1.5) * Math.PI / 2));
      m.position.lerpVectors(e.a, e.b, v); m.scale.set(s, s * 0.8 * (1 - smooth(0.8, 1, u)) + 0.01, s); m.fxu.c.set(0xb8f0ff); m.fxu.c2.copy(e.col); m.fxu.t = e.t; m.fxu.o = 0.92 * (1 - smooth(0.85, 1, u));
      if (u < 0.85) { spray(fx, { n: 1, add: false, tile: TL.drop, col: [0xa8e4ff, 0x5ab0ff], shape: 'ring', spd: [1, 2], up: [1.5, 3], grav: 8, size: [0.1, 0.16], life: [0.4, 0.6], y: 0.4, tint: false }, m.position.x, m.position.y, m.position.z, s * 0.7, null, 0, 1, 60 * dt);
        spray(fx, { n: 1, add: false, tile: TL.dust, col: 0xffffff, a: 0.6, shape: 'disc', rad: 0.5, size: [0.3, 0.4], grow: 2, life: [0.5, 0.8], y: 0.05, tint: false }, m.position.x, m.position.y, m.position.z, s * 0.7, null, 0, 1, 25 * dt); } } },
  rail: { dur: 0.7, col: 0x4ad0ff, shake: [0.15, 0.15],
    build(rig) { rig.halo = stripMesh('beam', { add: false }); rig.core = stripMesh('beam'); rig.f = glowSprite(0xffffff, 6); rig.root.add(rig.halo, rig.core, rig.f); },
    start(e, fx) { for (let i = 0; i < 14; i++) { _v1.lerpVectors(e.a, e.b, Math.random()); spray(fx, { n: 1, tile: TL.bolt, size: [0.2, 0.3], life: [0.15, 0.3], col: 0xb0f0ff, spd: [0.5, 1.5] }, _v1.x, _v1.y, _v1.z, 1, null); }
      spray(fx, ext(P.embers, { n: 12, y: 0, col: [0xd0f8ff, 0x6ad8ff], tint: false }), e.b.x, e.b.y, e.b.z, 0.8); },
    tick(e, dt, fx) { const r = e.rig, u = e.lt / 0.7, flash = 1 - clamp01(u / 0.15), glow = 1 - smooth(0.2, 1, u);
      orientStrip(r.halo, e.a, e.b, e.w * (0.8 + 1.4 * glow)); orientStrip(r.core, e.a, e.b, e.w * (0.15 + 0.9 * flash) + 0.001);
      r.halo.fxu.c.copy(e.col); r.halo.fxu.x.set(0.1, e.L * 2, 5, 0.01); r.halo.fxu.o = 0.75 * glow; r.halo.fxu.t = e.t;
      r.core.fxu.c.set(0xffffff); r.core.fxu.x.set(0.5, e.L * 3, 20, 0.01); r.core.fxu.o = 0.4 + 0.6 * flash; r.core.fxu.t = e.t;
      r.f.position.copy(e.a); r.f.scale.setScalar(1.4 * flash * (SkillFx.reduceFlash ? 0.5 : 1) + 0.001); r.f.fxu.c.copy(e.col); r.f.fxu.o = flash; r.f.fxu.x.x = 1; } },
  skewer_row: { dur: 1.4, col: 0xff7a1a,
    build(rig) { rig.sk = []; for (let i = 0; i < 5; i++) { const g = new THREE.Group(); const inner = new THREE.Group(); inner.rotation.x = -Math.PI / 2; inner.position.y = 0.42; skewerLite(inner); g.add(inner); g.scale.setScalar(1.6); rig.root.add(g); rig.sk.push(g); } },
    start(e) { e.n = Math.min(5, Math.max(2, Math.round(e.L / 0.75))); e.rig.sk.forEach((g, i) => { g.visible = i < e.n; const t = e.n > 1 ? i / (e.n - 1) : 0; g.position.lerpVectors(e.a, e.b, t); g.rotation.set(rnd(-0.25, 0.25), Math.random() * TAU, rnd(-0.25, 0.25)); g.fired = 0; }); },
    tick(e, dt, fx) { const u = e.lt;
      e.rig.sk.forEach((g, i) => { if (i >= e.n) return; const t0 = i * 0.06, k = clamp01((u - t0) / 0.12), sink = smooth(1.0, 1.35, u), h = easeOut(k) * (1 - sink);
        g.children[0].position.y = 0.42 - (1 - h) * 0.9; g.visible = h > 0.01;
        if (k > 0 && !g.fired) { g.fired = 1; spray(fx, ext(P.dustRing, { n: 5, spd: [1, 1.5] }), g.position.x, g.position.y, g.position.z, 0.5); spray(fx, ext(P.embers, { n: 6, y: 0.1 }), g.position.x, g.position.y, g.position.z, 0.6); }
        if (h > 0.5 && u < 1.0) { spray(fx, { n: 1, tile: TL.flame, shape: 'disc', rad: 0.15, up: [1, 1.8], size: [0.2, 0.3], grow: 0.5, life: [0.25, 0.4], col: 0xffb040, col2: 0xff3010, y: [0.3, 1.1], rot0: 0 }, g.position.x, g.position.y, g.position.z, 1, e.tint, 0, 1, 14 * dt); } }); } },
};
function orientFlat(m, a, b, w) { const dx = b.x - a.x, dz = b.z - a.z, L = Math.max(1e-3, Math.hypot(dx, dz)); m.position.copy(a); m.rotation.set(0, Math.atan2(-dz, dx), 0); m.scale.set(L, 1, w); }
function skewerLite(p) { mk(p, G.cyl(0.016, 0.016, 0.85, 4), lam(0xd8b878), null, 1, ZROT); mk(p, G.box(), lam(0x9a4a22), [0, 0, 0.22], 0.13, [0.3, 0.5, 0]); mk(p, G.ico(0), lam(0x5aa83a), [0, 0, 0.08], 0.08); mk(p, G.box(), lam(0xc84a2a), [0, 0, -0.06], 0.12, [0.6, 0.2, 0]); }

// ============================================================================================ area decals
const D = 256, DC = 128;
function discGrad(g, stops, R = 124) { const gr = g.createRadialGradient(DC, DC, 0, DC, DC, R); for (const [o, c] of stops) gr.addColorStop(o, c); g.fillStyle = gr; g.beginPath(); g.arc(DC, DC, R, 0, TAU); g.fill(); }
function scatter(n, seed, fn) { for (let i = 0; i < n; i++) { const a = i * 2.39996 + seed, r = Math.sqrt((i + 0.5) / n) * 112; fn(DC + Math.cos(a) * r, DC + Math.sin(a) * r, i); } }
function runeRing(g, R, w, col, n, glyphs) {
  g.save(); g.shadowColor = col; g.shadowBlur = 10; g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.arc(DC, DC, R, 0, TAU); g.stroke(); g.beginPath(); g.arc(DC, DC, R - w * 5, 0, TAU); g.stroke();
  g.lineWidth = w * 0.9; g.lineCap = 'round';
  for (let i = 0; i < n; i++) { const a = i / n * TAU; g.save(); g.translate(DC + Math.cos(a) * (R - w * 2.5), DC + Math.sin(a) * (R - w * 2.5)); g.rotate(a + Math.PI / 2); const s = w * 1.6; g.beginPath();
    switch ((i * 7 + glyphs) % 5) { case 0: g.moveTo(0, -s); g.lineTo(0, s); g.moveTo(-s, -s * 0.3); g.lineTo(s, s * 0.3); break; case 1: g.moveTo(-s, s); g.lineTo(0, -s); g.lineTo(s, s); break; case 2: g.arc(0, 0, s * 0.8, 0, TAU); break; case 3: g.moveTo(-s, -s); g.lineTo(s, s); g.moveTo(-s, s); g.lineTo(0, 0); break; default: g.moveTo(-s, 0); g.lineTo(s, 0); g.moveTo(0, -s); g.lineTo(0, s * 0.4); }
    g.stroke(); g.restore(); }
  g.restore();
}
const AT = {
  herb_field: () => ctex('a_herb', D, (g) => { discGrad(g, [[0, 'rgba(110,190,70,0.75)'], [0.8, 'rgba(90,170,60,0.6)'], [1, 'rgba(90,170,60,0)']]);
    g.lineCap = 'round'; scatter(160, 0.3, (x, y, i) => { g.strokeStyle = i % 3 ? 'rgba(60,130,40,0.9)' : 'rgba(150,220,90,0.9)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.sin(i) * 4, y - 8); g.stroke(); });
    scatter(14, 1.1, (x, y, i) => { g.fillStyle = '#9ce060'; g.save(); g.translate(x, y); g.rotate(i); g.beginPath(); g.ellipse(0, 0, 7, 3.5, 0, 0, TAU); g.fill(); g.restore(); }); }),
  poison_garden: () => ctex('a_pois', D, (g) => { discGrad(g, [[0, 'rgba(110,50,140,0.8)'], [0.75, 'rgba(80,40,110,0.65)'], [1, 'rgba(80,40,110,0)']]);
    scatter(40, 0.7, (x, y, i) => { g.fillStyle = i % 2 ? 'rgba(170,90,220,0.7)' : 'rgba(120,200,60,0.55)'; g.beginPath(); g.arc(x, y, 3 + (i % 4) * 2, 0, TAU); g.fill(); });
    g.strokeStyle = 'rgba(60,120,40,0.8)'; g.lineWidth = 3; scatter(12, 2, (x, y, i) => { g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + 10, y - 6, x + 14, y + 8, x + 22, y + 2); g.stroke(); }); }),
  healing_mist: () => ctex('a_mist', D, (g) => { discGrad(g, [[0, 'rgba(200,255,210,0.55)'], [0.6, 'rgba(150,240,170,0.35)'], [1, 'rgba(150,240,170,0)']]);
    scatter(10, 0.4, (x, y) => { const gr = g.createRadialGradient(x, y, 0, x, y, 30); gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x - 30, y - 30, 60, 60); }); }),
  ink_pool: () => ctex('a_ink', D, (g) => { g.fillStyle = 'rgba(20,16,28,0.95)'; blob(g, DC, DC, 104, 60, 2.2, 0.28); g.fill(); scatter(9, 0.2, (x, y, i) => { if (Math.hypot(x - DC, y - DC) > 90) { g.beginPath(); g.arc(x + (x - DC) * 0.12, y + (y - DC) * 0.12, 4 + i % 3 * 3, 0, TAU); g.fill(); } });
    g.strokeStyle = 'rgba(160,140,220,0.55)'; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.arc(DC - 10, DC - 10, 70, 3.6, 4.4); g.stroke(); g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 3; g.beginPath(); g.arc(DC - 10, DC - 10, 56, 3.7, 4.1); g.stroke(); }),
  flour: () => ctex('a_flour', D, (g) => { scatter(26, 0.9, (x, y, i) => { const r = 26 + (i % 5) * 6, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); });
    g.fillStyle = 'rgba(255,255,255,0.9)'; scatter(90, 3, (x, y) => { g.beginPath(); g.arc(x, y, 1.5, 0, TAU); g.fill(); }); }),
  fire: () => ctex('a_fire', D, (g) => { discGrad(g, [[0, 'rgba(90,30,10,0.75)'], [0.7, 'rgba(60,24,12,0.6)'], [1, 'rgba(60,24,12,0)']]);
    g.lineCap = 'round'; g.shadowColor = '#ff8a20'; g.shadowBlur = 10;
    for (let i = 0; i < 12; i++) { let x = DC, y = DC, a = i / 12 * TAU; g.strokeStyle = i % 2 ? '#ffb040' : '#ff6a20'; g.lineWidth = 4; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { a += (Math.sin(i * 3 + k) * 0.5); x += Math.cos(a) * 18; y += Math.sin(a) * 18; g.lineTo(x, y); } g.stroke(); }
    g.shadowBlur = 0; scatter(30, 1, (x, y, i) => { g.fillStyle = i % 2 ? 'rgba(255,200,80,0.9)' : 'rgba(255,120,40,0.8)'; g.beginPath(); g.arc(x, y, 2 + i % 3, 0, TAU); g.fill(); }); }),
  storm: () => ctex('a_storm', D, (g) => { discGrad(g, [[0, 'rgba(40,50,80,0.55)'], [0.8, 'rgba(40,50,80,0.45)'], [1, 'rgba(40,50,80,0)']]);
    g.strokeStyle = 'rgba(160,200,255,0.5)'; g.lineWidth = 2; scatter(18, 0.6, (x, y, i) => { g.beginPath(); g.ellipse(x, y, 6 + i % 3 * 3, 3 + i % 3 * 1.5, 0, 0, TAU); g.stroke(); }); }),
  meadow: () => ctex('a_meadow', D, (g) => { discGrad(g, [[0, 'rgba(120,200,80,0.8)'], [0.8, 'rgba(100,185,70,0.65)'], [1, 'rgba(100,185,70,0)']]);
    g.lineCap = 'round'; scatter(180, 0.1, (x, y, i) => { g.strokeStyle = i % 3 ? 'rgba(70,150,50,0.9)' : 'rgba(170,230,110,0.9)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.sin(i * 1.3) * 4, y - 9); g.stroke(); });
    const cols = ['#ffffff', '#ffd84a', '#ff9ac8', '#b8a0ff']; scatter(26, 2.2, (x, y, i) => { g.fillStyle = cols[i % 4]; for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(x + Math.cos(k * 1.256) * 3.5, y + Math.sin(k * 1.256) * 3.5, 2.8, 0, TAU); g.fill(); } g.fillStyle = '#ffb020'; g.beginPath(); g.arc(x, y, 2, 0, TAU); g.fill(); }); }),
  emfield: () => ctex('a_em', D, (g) => { discGrad(g, [[0, 'rgba(60,140,255,0.35)'], [0.85, 'rgba(60,140,255,0.5)'], [1, 'rgba(60,140,255,0)']]);
    g.strokeStyle = 'rgba(150,220,255,0.85)'; g.lineWidth = 2; const s = 18;
    for (let row = -8; row <= 8; row++) for (let col = -8; col <= 8; col++) { const x = DC + col * s * 1.5, y = DC + row * s * 1.732 + (col % 2 ? s * 0.866 : 0); if (Math.hypot(x - DC, y - DC) > 112) continue; g.beginPath(); for (let k = 0; k <= 6; k++) { const a = k * Math.PI / 3; g.lineTo(x + Math.cos(a) * s * 0.9, y + Math.sin(a) * s * 0.9); } g.stroke(); } }),
  wind: () => ctex('a_wind', D, (g) => { g.strokeStyle = 'rgba(235,255,245,0.85)'; g.lineCap = 'round';
    for (let k = 0; k < 4; k++) { g.lineWidth = 5 - k * 0.8; g.beginPath(); for (let i = 0; i < 60; i++) { const a = k * Math.PI / 2 + i / 60 * 3.6, r = 10 + i * 1.8; g.lineTo(DC + Math.cos(a) * r, DC + Math.sin(a) * r); } g.stroke(); }
    discGrad(g, [[0, 'rgba(220,255,240,0.25)'], [1, 'rgba(220,255,240,0)']]); }),
  stage_spot: () => ctex('a_spot', D, (g) => { discGrad(g, [[0, 'rgba(255,250,220,0.8)'], [0.75, 'rgba(255,240,190,0.55)'], [0.92, 'rgba(255,230,160,0.7)'], [1, 'rgba(255,230,160,0)']]); }),
  music_aura: () => ctex('a_music', D, (g) => { g.strokeStyle = 'rgba(255,255,255,0.85)'; for (let i = 0; i < 5; i++) { g.lineWidth = 2; g.beginPath(); g.arc(DC, DC, 86 + i * 7, 0, TAU); g.stroke(); }
    g.fillStyle = '#fff'; for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; noteGlyph(g, DC + Math.cos(a) * 100, DC + Math.sin(a) * 100, 0.26, i % 2); }
    discGrad(g, [[0, 'rgba(255,255,255,0.25)'], [0.8, 'rgba(255,255,255,0.1)'], [1, 'rgba(255,255,255,0)']]); }),
  toxic_residue: () => ctex('a_toxic', D, (g) => { g.fillStyle = 'rgba(110,200,40,0.8)'; blob(g, DC, DC, 100, 50, 4.1, 0.3); g.fill(); g.fillStyle = 'rgba(160,240,80,0.85)'; blob(g, DC - 10, DC - 8, 60, 40, 1.2, 0.4); g.fill();
    g.strokeStyle = 'rgba(220,255,160,0.9)'; g.lineWidth = 2.5; scatter(16, 0.5, (x, y, i) => { if (Math.hypot(x - DC, y - DC) < 90) { g.beginPath(); g.arc(x, y, 3 + i % 4 * 2, 0, TAU); g.stroke(); } }); }),
  earth_seal: () => ctex('a_earth', 512, (g) => { g.scale(2, 2);
    discGrad(g, [[0, 'rgba(120,90,50,0.55)'], [0.85, 'rgba(110,80,45,0.45)'], [1, 'rgba(110,80,45,0)']]);
    g.strokeStyle = 'rgba(50,34,20,0.9)'; g.lineCap = 'round'; for (let i = 0; i < 10; i++) { let x = DC, y = DC, a = i / 10 * TAU; g.lineWidth = 3.5; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { a += Math.sin(i * 5 + k) * 0.45; x += Math.cos(a) * 17; y += Math.sin(a) * 17; g.lineTo(x, y); } g.stroke(); }
    runeRing(g, 116, 3.5, '#ffd040', 14, 1); runeRing(g, 62, 3, '#ffc030', 8, 3);
    g.save(); g.shadowColor = '#ffd040'; g.shadowBlur = 8; g.strokeStyle = '#ffd040'; g.lineWidth = 3; star(g, DC, DC, 4, 46, 14, 0); g.stroke(); g.restore(); }),
  forest_sanctum: () => ctex('a_forest', 512, (g) => { g.scale(2, 2);
    discGrad(g, [[0, 'rgba(70,160,60,0.35)'], [0.85, 'rgba(60,150,50,0.3)'], [1, 'rgba(60,150,50,0)']]);
    runeRing(g, 118, 3.5, '#9dff70', 18, 0); runeRing(g, 72, 3, '#7aff6a', 10, 2);
    g.save(); g.shadowColor = '#9dff70'; g.shadowBlur = 10; g.strokeStyle = '#c8ffa0'; g.lineWidth = 3; star(g, DC, DC, 6, 58, 30, 0); g.stroke();
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + Math.PI / 6; g.save(); g.translate(DC + Math.cos(a) * 92, DC + Math.sin(a) * 92); g.rotate(a + Math.PI / 2); g.fillStyle = '#8af060'; g.beginPath(); g.moveTo(0, -12); g.bezierCurveTo(9, -6, 9, 6, 0, 12); g.bezierCurveTo(-9, 6, -9, -6, 0, -12); g.fill(); g.restore(); }
    g.restore(); }),
  poison_cloud: () => ctex('a_pcloud', D, (g) => { discGrad(g, [[0, 'rgba(130,70,160,0.5)'], [0.8, 'rgba(110,150,60,0.35)'], [1, 'rgba(110,150,60,0)']]); }),
  sugar_glass: () => ctex('a_sugar', D, (g) => {
    const pts = []; scatter(22, 0.8, (x, y) => pts.push([x, y]));
    const img = g.createImageData(D, D);
    for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) { const r = Math.hypot(x - DC, y - DC); if (r > 122) continue; let b = 1e9, b2 = 1e9, bi = 0; pts.forEach(([px, py], i) => { const d = (px - x) ** 2 + (py - y) ** 2; if (d < b) { b2 = b; b = d; bi = i; } else if (d < b2) b2 = d; });
      const edge = Math.sqrt(b2) - Math.sqrt(b) < 2.2, k = (y * D + x) * 4, t = (bi * 37 % 10) / 10;
      img.data[k] = edge ? 255 : 240 + 15 * t; img.data[k + 1] = edge ? 250 : 150 + 60 * t; img.data[k + 2] = edge ? 240 : 120 + 50 * (1 - t); img.data[k + 3] = edge ? 240 : 150; }
    g.putImageData(img, 0, 0); }),
  danger: () => ctex('a_danger', D, (g) => { discGrad(g, [[0, 'rgba(255,60,40,0.3)'], [0.8, 'rgba(255,50,30,0.45)'], [1, 'rgba(255,50,30,0)']]);
    g.save(); g.beginPath(); g.arc(DC, DC, 122, 0, TAU); g.arc(DC, DC, 104, 0, TAU, true); g.clip(); g.fillStyle = 'rgba(255,70,40,0.95)'; g.fillRect(0, 0, D, D); g.fillStyle = 'rgba(40,20,20,0.9)';
    for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; g.save(); g.translate(DC, DC); g.rotate(a); g.beginPath(); g.moveTo(100, -6); g.lineTo(126, -14); g.lineTo(126, -2); g.lineTo(100, 6); g.fill(); g.restore(); } g.restore();
    g.fillStyle = 'rgba(255,240,230,0.85)'; g.fillRect(DC - 7, DC - 38, 14, 50); g.beginPath(); g.arc(DC, DC + 28, 8, 0, TAU); g.fill(); }),
  _generic: () => ctex('a_gen', D, (g) => discGrad(g, [[0, 'rgba(255,255,255,0.4)'], [0.85, 'rgba(255,255,255,0.3)'], [1, 'rgba(255,255,255,0)']])),
};
AT.frost = texFrost;

// ============================================================================================ areas
// def: {col, tint (decal tinted by colour), add, a, rot, rim, sheen, props:{n,tile,size,cols,add,sway,y}, P:[rate specs (rr = radius-relative)], build, tick}
const AREA = {
  herb_field: { col: 0x5ab83a, a: 0.9, rot: 0, rim: 0.5, rimCol: 0xb0ff70, props: { n: 14, tile: [TL.herb, TL.herb, TL.flowerP], size: [0.35, 0.55], cols: [0x5ab83a, 0x7ad050, 0xffffff], sway: 1 },
    P: [{ rate: 6, tile: TL.leaf, add: false, col: 0x8de05a, shape: 'disc', rr: 0.9, up: [0.3, 0.6], size: [0.1, 0.16], life: [1, 1.5], spin: 2, y: 0.1, tint: false }, { rate: 6, tile: TL.spark, col: 0xd8ffb0, shape: 'disc', rr: 0.9, up: [0.3, 0.7], size: [0.1, 0.16], life: [0.8, 1.2], y: 0.2, tint: false }] },
  poison_garden: { col: 0xa050e0, a: 0.9, rot: 0, rim: 0.6, rimCol: 0xc070ff, props: { n: 12, tile: [TL.flowerP, TL.flowerP, TL.mushroom], size: [0.4, 0.6], cols: [0xc060f0, 0x9a40d8, 0xb070e0], sway: 1 },
    P: [{ rate: 14, tile: TL.glow, col: [0xd090ff, 0xb0f060], shape: 'disc', rr: 0.85, up: [0.2, 0.5], spd: [0.05, 0.2], size: [0.1, 0.18], life: [1.5, 2.2], y: [0.3, 0.6], tint: false }, { rate: 5, add: false, tile: TL.pellet, col: 0x8a3ac0, shape: 'disc', rr: 0.8, up: [0.2, 0.4], size: [0.06, 0.09], life: [1.2, 1.8], y: [0.3, 0.6], tint: false }] },
  healing_mist: { col: 0x8af0a0, a: 0.8, rot: 0.1, rim: 0.3, rimCol: 0xc0ffd0,
    P: [{ rate: 10, add: false, tile: TL.smoke, col: [0xe8fff0, 0xc8f8d8], a: 0.38, shape: 'disc', rr: 0.85, spd: [0.05, 0.2], up: [0.02, 0.1], size: [0.7, 1.0], grow: 1.6, life: [2.2, 3], y: [0.15, 0.5], spin: 0.3, tint: false, fo: 0.4 },
      { rate: 4, add: false, tile: TL.plus, col: 0x3ad860, shape: 'disc', rr: 0.8, up: [0.4, 0.7], size: [0.16, 0.22], life: [1, 1.4], y: 0.2, rot0: 0 }] },
  ink_pool: { col: 0xffffff, a: 0.95, add: false, rot: 0, rim: 0, sheen: 0.2,
    P: [{ rate: 3, add: false, tile: TL.ripple, mode: 1, col: 0x4a3a6a, a: 0.6, shape: 'disc', rr: 0.7, size: [0.2, 0.3], grow: 3, life: [0.8, 1.1], y: 0.07, tint: false }, { rate: 4, add: false, tile: TL.bubble, col: 0x2a2236, shape: 'disc', rr: 0.7, up: [0.1, 0.3], size: [0.1, 0.18], life: [0.5, 0.8], y: 0.05, tint: false }] },
  flour: { col: 0xffffff, a: 0.95, add: false, rot: 0.05,
    P: [{ rate: 10, add: false, tile: TL.dust, col: [0xffffff, 0xf4eee2], a: 0.6, shape: 'disc', rr: 0.85, spd: [0.1, 0.3], up: [0.05, 0.2], size: [0.5, 0.8], grow: 1.6, life: [1.5, 2.2], y: [0.1, 0.5], spin: 0.3, tint: false, fo: 0.4 }, { rate: 8, add: false, tile: TL.pellet, col: 0xffffff, shape: 'disc', rr: 0.9, up: [0.2, 0.5], size: [0.04, 0.06], life: [0.8, 1.4], y: 0.1, tint: false }] },
  frost: { col: 0xffffff, a: 0.95, add: false, rim: 0.4, rimCol: 0xbfefff, crystals: 6,
    P: [{ rate: 8, tile: TL.spark, col: 0xe0f8ff, shape: 'disc', rr: 0.9, size: [0.12, 0.2], life: [0.4, 0.7], y: [0.05, 0.4], spin: 2, tint: false }, { rate: 4, add: false, tile: TL.snow, col: 0xe8fbff, shape: 'disc', rr: 0.8, up: [0.1, 0.3], size: [0.12, 0.18], life: [1, 1.5], y: [0.2, 0.8], spin: 1, tint: false }] },
  fire: { col: 0xffffff, a: 0.95, add: false, rim: 0.5, rimCol: 0xff8a30,
    P: [{ rate: 22, add: false, a: 0.9, tile: TL.smoke, col: [0xffc040, 0xff8a20], col2: 0xe02a10, shape: 'disc', rr: 0.85, up: [0.8, 1.5], size: [0.3, 0.45], grow: 0.3, life: [0.5, 0.8], y: 0.1, spin: 1, fo: 0.4 },
      { rate: 16, tile: TL.flame, col: 0xffd060, col2: 0xff4010, shape: 'disc', rr: 0.85, up: [1, 1.8], size: [0.3, 0.45], grow: 0.5, life: [0.4, 0.6], y: 0.1, rot0: 0 }, { rate: 10, tile: TL.ember, mode: 2, col: 0xffc040, shape: 'disc', rr: 0.85, up: [1.5, 3], spd: [0.2, 0.6], size: [0.04, 0.06], life: [0.6, 1], y: 0.3, str: 0.04, tint: false }] },
  storm: { col: 0xffffff, a: 0.9, add: false, rim: 0.3, rimCol: 0x8ab0ff, bolt: true,
    P: [{ rate: 60, add: false, tile: TL.streak, mode: 2, col: 0x8aa8e0, a: 0.9, shape: 'disc', rr: 0.95, up: [-14, -12], spd: [0.5, 0.8], size: [0.05, 0.06], life: [0.28, 0.33], y: 4.2, str: 0.03, fo: 0.9, tint: false },
      { rate: 14, add: false, tile: TL.ripple, mode: 1, col: 0xc8dcff, a: 0.7, shape: 'disc', rr: 0.9, size: [0.1, 0.12], grow: 3, life: [0.3, 0.4], y: 0.06, tint: false }] },
  meadow: { col: 0xffffff, a: 0.95, add: false, rim: 0.4, rimCol: 0xc0ff90, props: { n: 16, tile: [TL.flowerP, TL.herb, TL.flowerP, TL.flowerP], size: [0.32, 0.5], cols: [0xffffff, 0x6ac048, 0xffd060, 0xff9ac8], sway: 1 },
    P: [{ rate: 5, add: false, tile: TL.petal, col: [0xffb0d0, 0xffffff, 0xffe080], shape: 'disc', rr: 0.85, spd: [0.2, 0.5], up: [0.2, 0.4], size: [0.1, 0.14], life: [1.5, 2], y: [0.3, 1], spin: 3, grav: 0.1, tint: false }, { rate: 2, add: false, tile: TL.plus, col: 0x3ad860, shape: 'disc', rr: 0.8, up: [0.4, 0.7], size: [0.14, 0.2], life: [1, 1.3], y: 0.3, rot0: 0, tint: false }] },
  emfield: { col: 0x4aa8ff, a: 0.9, tint: true, rot: 0, rim: 0.9, rimCol: 0x8ad8ff, arcs: 3,
    P: [{ rate: 14, tile: TL.spark, col: 0xb0e8ff, shape: 'disc', rr: 0.9, size: [0.12, 0.22], life: [0.15, 0.3], y: [0.05, 0.5], tint: false }, { rate: 5, tile: TL.bolt, col: 0x9ad8ff, shape: 'disc', rr: 0.85, size: [0.2, 0.3], life: [0.08, 0.15], y: 0.3 }] },
  wind: { col: 0xc0f0e0, a: 0.95, tint: true, add: false, rot: -2.5, rim: 0.35, rimCol: 0xe8fff8, swirl: true },
  stage_spot: { col: 0xfff0c0, a: 0.4, tint: true, add: true, rim: 0.5, rimCol: 0xfff8e0, spot: true,
    P: [{ rate: 8, tile: TL.spark, col: 0xfff8d8, shape: 'disc', rr: 0.8, up: [0.1, 0.3], size: [0.08, 0.14], life: [1, 1.6], y: [0.3, 3], spin: 1, tint: false }] },
  music_aura: { col: 0xe050c0, a: 0.85, tint: true, add: false, rot: 0.4, rim: 0.4, rimCol: 0xffa0e8, orbit: { n: 6, tiles: [TL.note, TL.note2], cols: [0xe040b0, 0x3ab0f0, 0xf0b020] },
    P: [{ rate: 6, tile: TL.spark, col: 0xffd0f0, shape: 'disc', rr: 0.9, up: [0.3, 0.6], size: [0.1, 0.16], life: [0.6, 1], y: 0.3 }] },
  toxic_residue: { col: 0xffffff, a: 0.92, add: false, sheen: 0.2,
    P: [{ rate: 10, add: false, tile: TL.bubble, col: [0x9cf050, 0x7ad830], shape: 'disc', rr: 0.75, up: [0.1, 0.35], size: [0.12, 0.26], grow: 1.3, life: [0.5, 0.9], y: 0.05, fo: 0.8 },
      { rate: 3, add: false, tile: TL.smoke, col: 0x7aa830, a: 0.3, shape: 'disc', rr: 0.7, up: [0.2, 0.4], size: [0.4, 0.6], grow: 1.8, life: [1.2, 1.8], y: 0.2, tint: false }] },
  earth_seal: { col: 0xffffff, a: 0.95, add: false, rot: 0.15, rim: 0.4, rimCol: 0xffd040, glow: [0xffc030, 0.5], props: { n: 6, tile: [TL.rock], size: [0.18, 0.3], cols: [0x9a8060, 0x7a6448], add: false, sway: 0 },
    P: [{ rate: 6, tile: TL.ember, col: 0xffd060, shape: 'disc', rr: 0.85, up: [0.4, 0.8], size: [0.08, 0.12], life: [0.8, 1.2], y: 0.1, tint: false }, { rate: 3, add: false, tile: TL.dust, col: 0xa08a68, a: 0.5, shape: 'disc', rr: 0.85, up: [0.1, 0.3], size: [0.3, 0.4], grow: 1.5, life: [1, 1.4], y: 0.1, tint: false }] },
  forest_sanctum: { col: 0xffffff, a: 0.95, add: false, rot: -0.12, rim: 0.4, rimCol: 0x9dff70, glow: [0x6aff50, 0.55],
    P: [{ rate: 7, add: false, tile: TL.leaf, col: [0x7cc850, 0x5ab83a, 0xb0d850], shape: 'disc', rr: 0.9, spd: [0.2, 0.5], up: [-0.6, -0.3], size: [0.14, 0.2], life: [2, 2.6], y: [1.5, 2.2], spin: 3, tint: false }, { rate: 10, tile: TL.glow, col: [0xb8ff90, 0xffffc0], shape: 'disc', rr: 0.85, up: [0.3, 0.7], size: [0.1, 0.16], life: [1.2, 1.8], y: [0.1, 0.4], tint: false }] },
  poison_cloud: { col: 0xffffff, a: 0.75, add: false, rim: 0.3, rimCol: 0xb070e0,
    P: [{ rate: 14, add: false, tile: TL.smoke, col: [0x9a5ac0, 0x7a9a40, 0x8a4ab0], a: 0.38, shape: 'disc', rr: 0.8, spd: [0.05, 0.25], up: [0.05, 0.15], size: [0.8, 1.2], grow: 1.5, life: [2, 2.8], y: [0.2, 0.8], spin: 0.3, fo: 0.4 }, { rate: 4, add: false, tile: TL.skull, col: 0x6a3a8a, shape: 'disc', rr: 0.6, up: [0.3, 0.5], size: [0.2, 0.26], life: [1, 1.3], y: 0.6, rot0: 0, tint: false }] },
  sugar_glass: { col: 0xffffff, a: 0.85, add: false, rim: 0.5, rimCol: 0xfff0d0, sheen: 0.5,
    P: [{ rate: 9, tile: TL.star, col: [0xffffff, 0xfff0c0], shape: 'disc', rr: 0.85, size: [0.12, 0.22], life: [0.4, 0.7], y: [0.05, 0.2], spin: 2, tint: false }] },
  danger: { col: 0xffffff, a: 0.9, add: false, rot: 0.3, blink: true },
  _generic: { col: 0xffe0a0, a: 0.8, tint: true, rim: 0.6, rimCol: 0xffffff, P: [{ rate: 5, tile: TL.spark, shape: 'disc', rr: 0.9, up: [0.2, 0.5], size: [0.1, 0.16], life: [0.6, 1], y: 0.2 }] },
};
for (const k in AREA) AREA[k].tex = AT[k] || AT._generic;

function buildArea(rig, def) {
  rig.decal = fxMesh(G.ground(), fxMat('area', { map: def.tex(), add: !!def.add }), 3); rig.root.add(rig.decal);
  if (def.glow) { rig.glowD = fxMesh(G.ground(), fxMat('area', { map: def.tex() }), 3); rig.root.add(rig.glowD); }
  rig.pr = fxMesh(G.ground(), fxMat('ring', {}), 4); rig.root.add(rig.pr);
  rig.props = [];
  const pp = def.props; if (pp) for (let i = 0; i < pp.n; i++) { const t = pp.tile[i % pp.tile.length], m = tileSprite(t, pp.cols[i % pp.cols.length], !!pp.add, 4); rig.root.add(m); rig.props.push(m); }
  const ob = def.orbit; if (ob) for (let i = 0; i < ob.n; i++) { const m = tileSprite(ob.tiles[i % ob.tiles.length], ob.cols[i % ob.cols.length], false, 5); rig.root.add(m); rig.props.push(m); }
  rig.cry = []; if (def.crystals) { const mats = [lam(0xbfefff, { em: 0x3a90c0, ei: 0.45, op: 0.85 }), lam(0xe0f8ff, { em: 0x5ab0e0, ei: 0.4, op: 0.85 })]; for (let i = 0; i < def.crystals; i++) { const m = new THREE.Mesh(CRYS_GEO(), mats[i % 2]); m.renderOrder = 4; rig.root.add(m); rig.cry.push(m); } }
  rig.arcs = []; const na = (def.arcs || 0) + (def.bolt ? 1 : 0);
  for (let i = 0; i < na; i++) { const st = getStrip(10), m = fxMesh(st.geo, fxMat('beam', { add: !def.bolt }), 6); m.strip = st; m.a = new THREE.Vector3(); m.b = new THREE.Vector3(); rig.root.add(m); rig.arcs.push(m); }
  if (def.bolt) { rig.fl = glowSprite(0xd0e0ff, 6); rig.root.add(rig.fl); }
  if (def.spot) { rig.cone = fxMesh(G.cyl(0.18, 1, 1, 24, true), fxMat('grad'), 5); rig.root.add(rig.cone); }
}
function areaStart(e, fx) {
  const r = e.rig; e.seed = Math.random() * 100; e.arcT = 0; e.boltT = 0.4;
  r.props.forEach((m, i) => { const ob = e.def.orbit && i >= (e.def.props ? e.def.props.n : 0); m.frac = ob ? 0.78 : Math.sqrt((i + 0.5) / r.props.length) * 0.82; m.ang = i * 2.39996 + e.seed; m.sz = ob ? 0.42 : R2(e.def.props.size, 0.4); m.ob = ob; m.fxu.o = 0; });
  r.cry.forEach((m, i) => { m.frac = 0.35 + 0.5 * ((i * 0.618) % 1); m.ang = i / r.cry.length * TAU + e.seed; m.h = rnd(0.35, 0.65); m.rotation.set(rnd(-0.3, 0.3), Math.random() * TAU, rnd(-0.3, 0.3)); });
  for (const m of r.arcs) m.visible = false; if (r.fl) r.fl.visible = false;
  areaLayout(e);
}
function areaLayout(e) {
  const r = e.rig; if (!r) return; const R = e.r;
  r.decal.scale.set(R * 2, 1, R * 2); r.decal.position.y = 0.03; if (r.glowD) { r.glowD.scale.set(R * 2, 1, R * 2); r.glowD.position.y = 0.035; }
  r.pr.position.y = 0.05;
  r.props.forEach((m, i) => { const vis = m.ob || i < Math.max(3, Math.round(r.props.length * Math.min(1, (R / 2) ** 2))); m.visible = vis; m.position.set(Math.cos(m.ang) * m.frac * R, m.sz * 0.45, Math.sin(m.ang) * m.frac * R); });
  r.cry.forEach((m) => { m.position.set(Math.cos(m.ang) * m.frac * R, 0, Math.sin(m.ang) * m.frac * R); });
  if (r.cone) { r.cone.scale.set(R, 6, R); r.cone.position.y = 3; }
}
function areaTick(e, dt, fx) {
  const r = e.rig, def = e.def, R = e.r;
  if (e.life > 0 && e.t >= e.life && e.fade < 0) e.fade = 0;
  let k = easeOut(clamp01(e.t / 0.35)); if (e.fade >= 0) { e.fade += dt; k *= 1 - e.fade / 0.4; if (k <= 0) return false; }
  e.pulseT += dt; const pk = Math.max(0, 1 - e.pulseT / 0.45);
  const blink = def.blink ? 0.75 + 0.25 * Math.sin(e.t * 8) : 1;
  const f = r.decal.fxu; f.c.copy(def.tint ? e.col : _c1.set(0xffffff)); if (e.tint && !def.tint) f.c.lerp(e.tint, 0.5);
  f.c2.set(def.rimCol ?? 0xffffff); if (e.tint) f.c2.copy(e.tint); f.x.set(e.t * (def.rot || 0) + e.seed, pk * 0.8, (def.rim || 0) * (1 + pk), def.sheen || 0); f.t = e.t; f.o = (def.a ?? 0.9) * k * blink;
  if (r.glowD) { const g = r.glowD.fxu; g.c.set(def.glow[0]); g.x.copy(f.x); g.x.z = 0; g.x.w = 0; g.o = def.glow[1] * k * (0.7 + 0.3 * Math.sin(e.t * 2.2)) + pk * 0.4; }
  r.pr.visible = pk > 0; if (pk > 0) { const pu = 1 - pk, s = R * 2 * (0.3 + 0.75 * easeOut(pu)); r.pr.scale.set(s, 1, s); r.pr.fxu.c.copy(e.tint || r.decal.fxu.c2); r.pr.fxu.x.set(0.86, 0.08, 0.3, 0); r.pr.fxu.o = pk; }
  // props: grow in, sway, orbit
  r.props.forEach((m, i) => { const g = easeOut(clamp01((e.t - i * 0.03) / 0.4)), s = m.sz * g; m.scale.set(s, s, 1); m.fxu.o = k * (m.ob ? 0.95 : 1);
    if (m.ob) { const a = m.ang + e.t * 0.8; m.position.set(Math.cos(a) * R * m.frac, 0.5 + 0.12 * Math.sin(e.t * 3 + i), Math.sin(a) * R * m.frac); m.fxu.r = Math.sin(e.t * 4 + i) * 0.3; }
    else { m.fxu.r = def.props.sway ? Math.sin(e.t * 1.7 + i) * 0.12 : 0; m.position.y = s * 0.45; } });
  r.cry.forEach((m) => { const g = easeOut(clamp01(e.t / 0.3)) * (e.fade >= 0 ? k : 1) + 0.001; m.scale.set(0.5 * g, m.h * g, 0.5 * g); });
  // particles (rate scaled by area)
  e.gk = k; SPR.r = R; const am = Math.max(0.3, (R * R) / 4) * (e.fade >= 0 ? 0 : 1) * e.rateMul;
  if (def.P) for (const sp of def.P) spray(fx, sp, e.p.x, e.p.y, e.p.z, 1, e.tint, 0, 1, sp.rate * dt * am / e.rateMul * gradeMul(sp, e));
  SPR.r = 1;
  // crawling arcs (emfield)
  if (def.arcs) { e.arcT -= dt; if (e.arcT <= 0) { e.arcT = 0.07; for (const m of r.arcs) { if (Math.random() < 0.35 || !m.visible) { const a = Math.random() * TAU, rr = Math.sqrt(Math.random()) * R * 0.85; m.a.set(Math.cos(a) * rr, 0.08, Math.sin(a) * rr); const b = a + rnd(-1.2, 1.2), r2 = Math.sqrt(Math.random()) * R * 0.85; m.b.set(Math.cos(b) * r2, 0.15, Math.sin(b) * r2); m.visible = true; }
    jag(m.strip, m.a, m.b, 1.6); m.strip.build(() => 0.07); m.fxu.c.set(0xb8ecff); m.fxu.x.set(0.4, 5, 10, 0.05); m.fxu.o = k * rnd(0.6, 1); } } }
  // storm bolt
  if (def.bolt) { e.boltT -= dt; const m = r.arcs[0];
    if (e.boltT <= 0) { e.boltT = rnd(0.9, 1.6); const a = Math.random() * TAU, rr = Math.sqrt(Math.random()) * R * 0.7; m.b.set(Math.cos(a) * rr, 0.05, Math.sin(a) * rr); m.a.set(m.b.x + rnd(-0.5, 0.5), 6, m.b.z + rnd(-0.5, 0.5)); m.life = 0.22; m.jt = 0;
      spray(fx, ext(P.embers, { n: 8, col: [0xffffff, 0xb0d0ff], y: 0, tint: false }), e.p.x + m.b.x, e.p.y, e.p.z + m.b.z, 0.7); spray(fx, { n: 1, add: false, tile: TL.ripple, mode: 1, col: 0xffffff, size: 0.4, grow: 4, life: 0.4, y: 0.06 }, e.p.x + m.b.x, e.p.y, e.p.z + m.b.z, 1); }
    if (m.life > 0) { m.life -= dt; m.jt -= dt; if (m.jt <= 0) { m.jt = 0.05; jag(m.strip, m.a, m.b, 0.8); m.strip.build((t) => 0.22 * (0.4 + 0.6 * t)); } m.visible = true; m.fxu.c.set(0xe8f0ff); m.fxu.x.set(0.45, 5, 10, 0.02); m.fxu.o = k * (m.life > 0.1 ? 1 : m.life / 0.1) * rnd(0.7, 1);
      const fl = r.fl; fl.visible = true; fl.position.copy(m.b).y += 0.3; fl.scale.setScalar(2.2 * (SkillFx.reduceFlash ? 0.5 : 1)); fl.fxu.c.set(0xc8d8ff); fl.fxu.o = (m.life / 0.22) * (SkillFx.reduceFlash ? 0.4 : 0.9); fl.fxu.x.x = 1; }
    else { m.visible = false; r.fl.visible = false; } }
  // wind: orbiting gust particles
  if (def.swirl) { const n = 30 * dt * Math.max(0.5, R / 2); for (let i = 0; i < n + (Math.random() < n % 1 ? 1 : 0) - (n % 1); i++) { const a = Math.random() * TAU, rr = R * rnd(0.3, 0.9), sp = rnd(3, 5), y = rnd(0.2, 1.4); const c = e.col;
      fx.pn.emit(e.p.x + Math.cos(a) * rr, e.p.y + y, e.p.z + Math.sin(a) * rr, -Math.sin(a) * sp, rnd(0, 0.3), Math.cos(a) * sp, rnd(0.3, 0.5), 0.07, 0.07, c.r, c.g, c.b, c.r, c.g, c.b, 0.85, TL.streak, 2, 0, 0, 0, 0, 0.1, 0.5);
      if (Math.random() < 0.25) fx.pn.emit(e.p.x + Math.cos(a) * rr, e.p.y + y, e.p.z + Math.sin(a) * rr, -Math.sin(a) * sp, rnd(0.2, 0.6), Math.cos(a) * sp, rnd(0.6, 0.9), 0.15, 0.15, 0.48, 0.78, 0.31, 0.48, 0.78, 0.31, 1, TL.leaf, 0, 0, 0.5, Math.random() * TAU, 8, 0, 0.6); } }
  // spotlight cone
  if (r.cone) { const c = r.cone.fxu; c.c.copy(e.col); c.x.set(0.2, 0.0, 0.0, 0); c.t = e.t; c.o = k * (0.8 + 0.2 * pk); }
  if (def.tick) def.tick(e, dt, fx, k);
  return true;
}

// ============================================================================================ aura icons (cached per stack value)
const texHexGrid = () => { const t = ctex('hexgrid', 128, (g) => { g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 3; const s = 16;
  for (let r = -1; r < 6; r++) for (let c = -1; c < 6; c++) { const x = c * s * 1.5, y = r * s * 1.732 + (c % 2 ? s * 0.866 : 0); g.beginPath(); for (let k = 0; k <= 6; k++) { const a = k * Math.PI / 3; g.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s); } g.stroke(); } }); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
const outline = (g, w = 6) => { g.lineJoin = 'round'; g.lineWidth = w; g.strokeStyle = 'rgba(30,24,30,0.85)'; };
const ICON = {
  mark_pattern: (n) => ctex('i_pat' + n, 128, (g) => { g.translate(64, 64);
    g.fillStyle = 'rgba(255,240,250,0.85)'; g.beginPath(); g.arc(0, 0, 50, 0, TAU); g.fill(); outline(g, 5); g.stroke();
    g.lineCap = 'round'; for (let i = 0; i < 5; i++) { const a0 = -Math.PI / 2 + i * TAU / 5 + 0.08, a1 = a0 + TAU / 5 - 0.16; g.strokeStyle = i < n ? '#e0308a' : 'rgba(200,160,190,0.6)'; g.lineWidth = i < n ? 9 : 5; g.setLineDash(i < n ? [] : [6, 6]); g.beginPath(); g.arc(0, 0, 42, a0, a1); g.stroke(); }
    g.setLineDash([5, 5]); g.strokeStyle = n > 0 ? '#c02070' : '#b090a8'; g.lineWidth = 5; g.beginPath(); g.moveTo(-22, -22); g.lineTo(22, 22); g.moveTo(22, -22); g.lineTo(-22, 22); g.stroke(); g.setLineDash([]);
    g.strokeStyle = n > 0 ? '#c02070' : '#b090a8'; g.lineWidth = 4; g.beginPath(); g.rect(-14, -14, 28, 28); g.stroke(); }),
  phrase: (n) => ctex('i_phr' + n, 128, (g, W) => { g.fillStyle = 'rgba(255,250,240,0.85)'; g.beginPath(); g.roundRect(6, 10, W - 12, 108, 16); g.fill(); outline(g, 4); g.stroke();
    g.strokeStyle = '#4a3a5a'; g.lineWidth = 3; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(20, 34 + i * 15); g.lineTo(W - 20, 34 + i * 15); g.stroke(); }
    g.fillStyle = '#4a3a5a'; g.font = 'bold 70px serif'; g.fillText('𝄞', 18, 104);
    const cols = ['#e040b0', '#3ab0f0', '#f0a020', '#40c060', '#a050f0'];
    for (let i = 0; i < 5; i++) { g.fillStyle = i < n ? cols[i] : 'rgba(120,100,130,0.25)'; noteGlyph(g, 92 + i * 34, 72 - (i % 3) * 10, 0.42, false); } }, 256),
  power: (n) => ctex('i_pow' + n, 128, (g, W) => { outline(g, 6); g.fillStyle = 'rgba(230,245,255,0.85)'; g.beginPath(); g.roundRect(10, 22, W - 34, 84, 12); g.fill(); g.stroke(); g.fillStyle = 'rgba(30,24,30,0.85)'; g.fillRect(W - 24, 46, 14, 36);
    for (let i = 0; i < 5; i++) { g.fillStyle = i < n ? (n >= 5 ? '#40e8ff' : '#2a8af0') : 'rgba(120,150,180,0.35)'; g.beginPath(); g.roundRect(22 + i * 40, 34, 32, 60, 5); g.fill(); } }, 256),
  temperature: (v) => ctex('i_tmp' + v, 256, (g) => { const hot = v > 0, f = (v + 5) / 10, col = v === 0 ? '#c0c0c0' : hot ? '#ff4a2a' : '#3a9aff';
    outline(g, 7); g.fillStyle = 'rgba(255,255,255,0.88)'; g.beginPath(); g.roundRect(44, 14, 40, 180, 20); g.fill(); g.stroke(); g.beginPath(); g.arc(64, 208, 34, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = col; g.beginPath(); g.arc(64, 208, 25, 0, TAU); g.fill(); const top = 186 - f * 160; g.fillRect(54, top, 20, 200 - top);
    g.strokeStyle = 'rgba(60,50,60,0.7)'; g.lineWidth = 3; for (let i = 0; i <= 10; i++) { const y = 186 - i * 16; g.beginPath(); g.moveTo(88, y); g.lineTo(i % 5 ? 98 : 106, y); g.stroke(); } }, 128),
  defdown: () => ctex('i_defd', 128, (g) => { g.translate(54, 60); outline(g, 6); g.fillStyle = '#8aa8c8'; g.beginPath(); g.moveTo(0, -46); g.lineTo(38, -32); g.bezierCurveTo(38, 10, 20, 34, 0, 48); g.bezierCurveTo(-20, 34, -38, 10, -38, -32); g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = '#2a2430'; g.lineWidth = 5; g.beginPath(); g.moveTo(4, -46); g.lineTo(-8, -14); g.lineTo(8, 4); g.lineTo(-4, 30); g.stroke(); g.translate(46, 22); g.fillStyle = '#ff4a3a'; outline(g, 4); g.beginPath(); g.moveTo(-14, -20); g.lineTo(14, -20); g.lineTo(14, 2); g.lineTo(24, 2); g.lineTo(0, 30); g.lineTo(-24, 2); g.lineTo(-14, 2); g.closePath(); g.fill(); g.stroke(); }),
  atkdown: () => ctex('i_atkd', 128, (g) => { g.translate(54, 62); g.rotate(-0.7); outline(g, 6); g.fillStyle = '#d8dce4';
    g.beginPath(); g.moveTo(-6, -50); g.lineTo(0, -60); g.lineTo(6, -50); g.lineTo(6, -12); g.lineTo(-6, -8); g.closePath(); g.fill(); g.stroke(); g.beginPath(); g.moveTo(-6, -2); g.lineTo(6, -6); g.lineTo(6, 18); g.lineTo(-6, 18); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#c8962a'; g.fillRect(-20, 18, 40, 9); g.strokeRect(-20, 18, 40, 9); g.fillStyle = '#7a4a2a'; g.fillRect(-5, 27, 10, 22); g.strokeRect(-5, 27, 10, 22); g.rotate(0.7);
    g.translate(44, 18); g.fillStyle = '#ff4a3a'; outline(g, 4); g.beginPath(); g.moveTo(-14, -20); g.lineTo(14, -20); g.lineTo(14, 2); g.lineTo(24, 2); g.lineTo(0, 30); g.lineTo(-24, 2); g.lineTo(-14, 2); g.closePath(); g.fill(); g.stroke(); }),
  target: () => ctex('i_tgt', 256, (g) => { g.translate(128, 128); g.strokeStyle = '#ff3a2a'; g.shadowColor = '#ff3a2a'; g.shadowBlur = 8; g.lineWidth = 10; g.beginPath(); g.arc(0, 0, 90, 0, TAU); g.stroke(); g.lineWidth = 7; g.beginPath(); g.arc(0, 0, 50, 0, TAU); g.stroke();
    g.lineWidth = 9; g.lineCap = 'round'; for (let i = 0; i < 4; i++) { g.save(); g.rotate(i * Math.PI / 2); g.beginPath(); g.moveTo(0, -120); g.lineTo(0, -68); g.stroke(); g.restore(); } g.fillStyle = '#ff3a2a'; g.beginPath(); g.arc(0, 0, 10, 0, TAU); g.fill(); }),
};
function iconMesh(tex, w, h, order = 6) { const m = fxMesh(G.plane(), fxMat('tex', { map: tex, bb: true, add: false }), order); m.scale.set(w, h, 1); return m; }
function setIcon(m, tex) { m.material = fxMat('tex', { map: tex, bb: true, add: false }); }

// ============================================================================================ auras
const AURA = {
  shield: { col: 0x5ad8ff,
    build(r) { r.b = fxMesh(G.ico(2), fxMat('fresnel', { map: texHexGrid(), side: THREE.FrontSide }), 5); r.root.add(r.b); },
    tick(e, dt, fx, k) { const r = e.rig, h = e.h, f = r.b.fxu; r.b.scale.set(h * 0.5, h * 0.62, h * 0.5); r.b.position.y = h * 0.55; f.c.copy(e.col); f.c2.set(0xffffff); f.x.set(2.2, 0.35, 0.06, 0.8); f.tile.set(0, 0, 4, 3); f.t = e.t; f.o = k * (0.85 + 0.15 * Math.sin(e.t * 5)); } },
  buff_atk: { col: 0xff4a2a,
    build(r) { r.g = setTile(fxMesh(G.ground(), fxMat('tex', { map: atlasTex(), add: false }), 3), TL.ring); r.root.add(r.g); },
    P: [{ rate: 24, tile: TL.ember, mode: 2, shape: 'disc', rad: 0.5, up: [1.5, 2.5], size: [0.06, 0.09], life: [0.5, 0.8], y: [0.1, 1], col: [0xff6a3a, 0xffb040], str: 0.06 }, { rate: 3, add: false, tile: TL.arrow, shape: 'disc', rad: 0.5, up: [0.8, 1.2], size: [0.18, 0.24], life: [0.7, 0.9], y: [0.2, 0.8], rot0: 0 }],
    tick(e, dt, fx, k) { const g = e.rig.g; g.scale.set(1.2, 1, 1.2); g.position.y = 0.04; g.fxu.c.copy(e.col); g.fxu.o = k * (0.5 + 0.2 * Math.sin(e.t * 6)); } },
  buff_def: { col: 0xffc030,
    build(r) { r.pl = []; const m = lam(0xffc840, { em: 0xa06a10, ei: 0.5 }), sg = G.shape('plate', (s) => { s.moveTo(0, 0.17); s.lineTo(0.13, 0.12); s.lineTo(0.11, -0.06); s.lineTo(0, -0.17); s.lineTo(-0.11, -0.06); s.lineTo(-0.13, 0.12); s.closePath(); }, 0.03);
      for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(sg, m); r.root.add(p); r.pl.push(p); } r.g = setTile(fxMesh(G.ground(), fxMat('tex', { map: atlasTex(), add: false }), 3), TL.ring); r.root.add(r.g); },
    tick(e, dt, fx, k) { const r = e.rig; r.pl.forEach((p, i) => { const a = e.t * 1.6 + i * TAU / 3; p.position.set(Math.cos(a) * 0.62, e.h * 0.5 + Math.sin(e.t * 2 + i) * 0.08, Math.sin(a) * 0.62); p.rotation.set(0, -a + Math.PI / 2, 0); p.scale.setScalar(1.3 * k + 0.001); });
      r.g.scale.set(1.3, 1, 1.3); r.g.position.y = 0.04; r.g.fxu.c.copy(e.col); r.g.fxu.o = 0.45 * k; },
    P: [{ rate: 4, tile: TL.spark, col: 0xfff0a0, shape: 'disc', rad: 0.6, up: [0.2, 0.5], size: [0.1, 0.16], life: [0.4, 0.7], y: [0.3, 1.2] }] },
  buff_speed: { col: 0x8ae8ff,
    build(r) { r.s = setTile(fxMesh(G.ground(), fxMat('tex', { map: atlasTex(), add: false }), 3), TL.swirl); r.root.add(r.s); },
    tick(e, dt, fx, k) { const s = e.rig.s; s.scale.set(1.3, 1, 1.3); s.position.y = 0.05; s.rotation.y = -e.t * 6; s.fxu.c.copy(e.col); s.fxu.o = 0.75 * k;
      const n = 22 * dt; if (Math.random() < n) { const a = Math.random() * TAU, rr = rnd(0.35, 0.55), sp = 4, c = e.col; fx.pn.emit(e.p.x + Math.cos(a) * rr, e.p.y + rnd(0.05, 0.45), e.p.z + Math.sin(a) * rr, -Math.sin(a) * sp, 0, Math.cos(a) * sp, 0.25, 0.06, 0.06, c.r, c.g, c.b, c.r, c.g, c.b, 0.9 * k, TL.streak, 2, 0, 0, 0, 0, 0.1, 0.4); } } },
  heal: { col: 0x3ad860,
    build(r) { r.g = glowSprite(0x8affa0, 4); r.root.add(r.g); },
    P: [{ rate: 5, add: false, tile: TL.plus, shape: 'disc', rad: 0.45, up: [0.7, 1.1], size: [0.16, 0.24], life: [0.9, 1.2], y: [0.1, 0.9], rot0: 0, fo: 0.6 }, { rate: 8, tile: TL.glow, col: 0xb0ffc0, shape: 'disc', rad: 0.4, up: [0.6, 1], size: [0.1, 0.16], life: [0.8, 1.1], y: [0.1, 0.8], tint: false }],
    tick(e, dt, fx, k) { const g = e.rig.g; g.position.y = e.h * 0.45; g.scale.setScalar(e.h * 1.1); g.fxu.c.copy(e.col); g.fxu.o = 0.25 * k; g.fxu.x.x = 0; } },
  cleanse: { col: 0xd8f0ff,
    build(r) { r.g = setTile(fxMesh(G.ground(), fxMat('tex', { map: atlasTex(), add: false }), 3), TL.ring); r.root.add(r.g); },
    P: [{ rate: 9, add: false, tile: TL.star, col: [0xa8d8ff, 0xffffff, 0xd0e8ff], shape: 'disc', rad: 0.45, up: [0.6, 1.2], size: [0.12, 0.2], life: [0.7, 1], y: [0.1, 1.1], spin: 3 }, { rate: 10, tile: TL.spark, col: 0xffffff, shape: 'disc', rad: 0.5, up: [0.5, 1], size: [0.14, 0.22], life: [0.5, 0.8], y: [0.2, 1.3], spin: 3, tint: false }],
    tick(e, dt, fx, k) { const g = e.rig.g, s = 1.1 + 0.15 * Math.sin(e.t * 4); g.scale.set(s, 1, s); g.position.y = 0.04; g.fxu.c.set(0x9ac8f0); g.fxu.o = 0.6 * k; } },
  mark_reaction: { col: 0xff8a20, stacks0: 1,
    build(r) { r.g = glowSprite(0xffa040, 6); r.o = new THREE.Mesh(G.ico(1), lam(0xffb050, { em: 0xff7010, ei: 0.8 })); r.pips = []; r.root.add(r.g, r.o); for (let i = 0; i < 5; i++) { const p = tileSprite(TL.pellet, 0xffffff, false, 6); r.root.add(p); r.pips.push(p); } },
    tick(e, dt, fx, k) { const r = e.rig, n = Math.max(0, Math.min(5, e.stacks | 0)), y = e.h + 0.5 + Math.sin(e.t * 3) * 0.05, sz = 0.12 + 0.025 * n;
      r.o.position.y = y; r.o.scale.setScalar(sz * k + 0.001); r.o.rotation.y = e.t * 2; r.g.position.y = y; r.g.scale.setScalar((0.6 + n * 0.1) * k); r.g.fxu.c.copy(e.col); r.g.fxu.o = 0.6 + 0.1 * n; r.g.fxu.x.x = 0.3;
      r.pips.forEach((p, i) => { p.visible = i < n; const a = e.t * 2.5 + i * TAU / Math.max(1, n); p.position.set(Math.cos(a) * 0.4, y + Math.sin(a * 2) * 0.03, Math.sin(a) * 0.4); p.scale.setScalar(0.17 * k); p.fxu.c.copy(e.col).multiplyScalar(0.75); p.fxu.o = k; }); } },
  mark_pattern: { col: 0xe0308a, stacks0: 1,
    build(r) { r.i = iconMesh(ICON.mark_pattern(1), 0.55, 0.55); r.root.add(r.i); }, stacks(e, n) { setIcon(e.rig.i, ICON.mark_pattern(Math.max(0, Math.min(5, n | 0)))); },
    tick(e, dt, fx, k) { const i = e.rig.i; i.position.y = e.h + 0.45 + Math.sin(e.t * 3) * 0.04; i.fxu.o = k; i.fxu.r = Math.sin(e.t * 1.5) * 0.1; } },
  mark_color: { col: 0xe83a3a, stacks0: 1, tintKey: true,
    build(r) { r.i = tileSprite(TL.splat, 0xffffff, false, 6); r.hl = tileSprite(TL.glow, 0xffffff, true, 6); r.root.add(r.i, r.hl); },
    tick(e, dt, fx, k) { const r = e.rig, n = Math.max(1, Math.min(5, e.stacks | 0)), s = (0.38 + 0.07 * n) * (1 + 0.04 * Math.sin(e.t * 5)) * k, y = e.h + 0.45; r.i.position.y = y; r.i.scale.setScalar(s); r.i.fxu.c.copy(e.col); r.i.fxu.o = k; r.i.fxu.r = 0.3;
      r.hl.position.set(0, y + 0.06, 0); r.hl.scale.setScalar(s * 0.35); r.hl.fxu.o = 0.5 * k; } },
  mark_target: { col: 0xff3a2a,
    build(r) { r.i = iconMesh(ICON.target(), 1, 1, 6); r.g = fxMesh(G.ground(), fxMat('tex', { map: ICON.target(), add: false }), 3); r.root.add(r.i, r.g); },
    tick(e, dt, fx, k) { const r = e.rig, p = 1 + 0.08 * Math.sin(e.t * 7); r.i.position.y = e.h * 0.55; r.i.scale.set(1.05 * p * k, 1.05 * p * k, 1); r.i.fxu.r = e.t * 0.8; r.i.fxu.c.copy(e.col); r.i.fxu.o = 0.85 * k;
      r.g.scale.set(1.3, 1, 1.3); r.g.position.y = 0.04; r.g.rotation.y = -e.t * 0.8; r.g.fxu.c.copy(e.col); r.g.fxu.o = 0.45 * k; } },
  chill: { col: 0x8ad8ff,
    build(r) { r.g = fxMesh(G.ground(), fxMat('tex', { map: texFrost(), add: false }), 3); r.root.add(r.g); },
    P: [{ rate: 6, add: false, tile: TL.wisp, col: [0xb8e8ff, 0xe0f6ff], shape: 'disc', rad: 0.45, up: [0.2, 0.5], spd: [0.1, 0.3], size: [0.22, 0.3], life: [0.8, 1.2], y: [0.2, 1.2], spin: 1.5, a: 0.85 }, { rate: 6, add: false, tile: TL.snow, col: 0xe8fbff, shape: 'disc', rad: 0.5, up: [-0.3, -0.1], size: [0.08, 0.13], life: [0.8, 1.2], y: [0.6, 1.6], spin: 2, tint: false }],
    tick(e, dt, fx, k) { const g = e.rig.g; g.scale.set(1.2, 1, 1.2); g.position.y = 0.04; g.fxu.o = 0.6 * k; } },
  overclock: { col: 0xff8a20,
    build(r) { r.g1 = tileSprite(TL.gear, 0xff9a30, false, 6); r.g2 = tileSprite(TL.gear, 0xffc040, false, 6); r.root.add(r.g1, r.g2); },
    P: [{ rate: 10, tile: TL.glow, col: [0xff8a30, 0xffb040], shape: 'disc', rad: 0.35, up: [0.8, 1.4], size: [0.16, 0.26], grow: 1.8, life: [0.5, 0.8], y: [0.4, 1.2], a: 0.6 }, { rate: 6, tile: TL.ember, mode: 2, col: 0xffd070, shape: 'disc', rad: 0.3, spd: [1, 2], up: [1, 2], grav: 4, size: [0.04, 0.06], life: [0.3, 0.5], y: 1.1, str: 0.05, tint: false }],
    tick(e, dt, fx, k) { const r = e.rig; r.g1.position.set(0.32, e.h + 0.25, 0.1); r.g1.scale.setScalar(0.42 * k); r.g1.fxu.r = e.t * 3; r.g1.fxu.c.copy(e.col); r.g1.fxu.o = k; r.g2.position.set(0.02, e.h + 0.42, -0.25); r.g2.scale.setScalar(0.3 * k); r.g2.fxu.r = -e.t * 4.2 + 0.3; r.g2.fxu.o = k; } },
  melody: { col: 0xe040b0,
    build(r) { r.n = []; for (let i = 0; i < 3; i++) { const m = tileSprite(i % 2 ? TL.note2 : TL.note, 0xffffff, false, 6); r.root.add(m); r.n.push(m); } },
    P: [{ rate: 4, tile: TL.spark, col: 0xffd0f0, shape: 'disc', rad: 0.5, size: [0.1, 0.16], life: [0.4, 0.7], y: [0.6, 1.4], tint: false }],
    tick(e, dt, fx, k) { const cols = [0xe040b0, 0x3ab0f0, 0xf0a020]; e.rig.n.forEach((m, i) => { const a = e.t * 1.8 + i * TAU / 3; m.position.set(Math.cos(a) * 0.6, e.h * 0.6 + Math.sin(e.t * 4 + i * 2) * 0.12, Math.sin(a) * 0.6); m.scale.setScalar(0.32 * k); m.fxu.c.set(cols[i]); if (e.tint) m.fxu.c.copy(e.tint); m.fxu.r = Math.sin(e.t * 5 + i) * 0.3; m.fxu.o = k; }); } },
  burn: { col: 0xff7a1a,
    P: [{ rate: 26, tile: TL.flame, col: 0xffc040, col2: 0xff3010, shape: 'disc', rad: 0.42, up: [0.8, 1.3], size: [0.22, 0.32], grow: 0.4, life: [0.3, 0.5], y: [0.1, 1.1], rot0: 0 }, { rate: 18, add: false, a: 0.9, tile: TL.smoke, col: [0xffb040, 0xff7a20], col2: 0xd02010, shape: 'disc', rad: 0.4, up: [0.8, 1.2], size: [0.14, 0.2], grow: 0.4, life: [0.3, 0.45], y: [0.2, 1.0] },
      { rate: 6, tile: TL.ember, mode: 2, col: 0xffc040, shape: 'disc', rad: 0.3, up: [1.5, 2.5], spd: [0.3, 0.6], size: [0.04, 0.05], life: [0.5, 0.8], y: [0.5, 1.2], str: 0.05, tint: false }, { rate: 3, add: false, tile: TL.smoke, col: 0x4a403a, a: 0.35, shape: 'disc', rad: 0.2, up: [0.8, 1.2], size: [0.2, 0.3], grow: 2, life: [0.8, 1.1], y: 1.3, tint: false }] },
  poison: { col: 0x8ae030,
    P: [{ rate: 16, add: false, tile: TL.bubble, col: [0x8ae030, 0xa050d0], shape: 'disc', rad: 0.45, up: [0.4, 0.8], size: [0.1, 0.18], life: [0.6, 1], y: [0.3, 1.2], fo: 0.8 }, { rate: 1.2, add: false, tile: TL.skull, col: 0x7ad030, shape: 'disc', rad: 0.2, up: [0.4, 0.6], size: [0.2, 0.26], life: [0.8, 1], y: 1.5, rot0: 0 }] },
  bleed: { col: 0xd01a1a,
    P: [{ rate: 12, add: false, tile: TL.drip, col: [0xd01a1a, 0xa01010], shape: 'disc', rad: 0.42, up: [-0.4, 0], grav: 5, size: [0.12, 0.17], life: [0.5, 0.7], y: [0.5, 1.2], rot0: 0 }, { rate: 1.5, add: false, tile: TL.splat, mode: 1, col: 0x901010, a: 0.7, shape: 'disc', rad: 0.4, size: [0.18, 0.26], life: [1, 1.5], y: 0.04 }] },
  freeze: { col: 0x9ae4ff,
    build(r) { r.blk = new THREE.Mesh(lumpy('iceblk', 1, 0.08, 3), lam(0xb8ecff, { em: 0x3a90c0, ei: 0.35, op: 0.55 })); r.blk.renderOrder = 5; r.f = fxMesh(lumpy('iceblk', 1, 0.08, 3), fxMat('fresnel', { side: THREE.FrontSide }), 6); r.root.add(r.blk, r.f);
      r.c = []; const m = lam(0xd8f6ff, { em: 0x4aa0d0, ei: 0.45, op: 0.85 }); for (let i = 0; i < 5; i++) { const c = new THREE.Mesh(CRYS_GEO(), m); c.renderOrder = 4; const a = i / 5 * TAU; c.position.set(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5); c.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); r.root.add(c); r.c.push(c); } },
    P: [{ rate: 5, tile: TL.spark, col: 0xe8fbff, shape: 'disc', rad: 0.5, size: [0.12, 0.2], life: [0.3, 0.6], y: [0.2, 1.6], tint: false }],
    tick(e, dt, fx, k) { const r = e.rig, h = e.h, g = easeOut(clamp01(e.t / 0.25)) * k + 0.001; r.blk.scale.set(0.55 * g, h * 0.6 * g, 0.55 * g); r.blk.position.y = h * 0.55 * g; r.f.scale.copy(r.blk.scale); r.f.position.copy(r.blk.position);
      r.f.fxu.c.copy(e.col); r.f.fxu.c2.set(0xffffff); r.f.fxu.x.set(1.6, 0, 0.0, 0.8); r.f.fxu.o = k; r.c.forEach((c, i) => c.scale.set(0.5 * g, (0.45 + 0.1 * i % 3) * g, 0.5 * g)); } },
  root: { col: 0x5a9a35,
    build(r) { r.v = []; const mats = [lam(0x4f9a35), lam(0x6a8a2a)]; for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(vineGeo(i), mats[i % 2]); const a = i / 4 * TAU; m.position.set(Math.cos(a) * 0.38, 0, Math.sin(a) * 0.38); m.rotation.y = -a + Math.PI; r.root.add(m); r.v.push(m);
      const lf = new THREE.Mesh(leafGeo(), lam(0x7cc850, { ds: true })); lf.position.set(0.05, 0.5, 0.1); lf.scale.setScalar(0.35); lf.rotation.set(0.5, i, 0.9); m.add(lf); } r.d = fxMesh(G.ground(), fxMat('tex', { map: texCrack(), add: false }), 3); r.root.add(r.d); },
    tick(e, dt, fx, k) { const r = e.rig; r.v.forEach((m, i) => { const g = easeOut(clamp01((e.t - i * 0.05) / 0.3)) * k + 0.001; m.scale.set(0.6 * g, 0.75 * g, 0.6 * g); m.rotation.z = Math.sin(e.t * 2 + i) * 0.05; }); r.d.scale.set(1.3, 1, 1.3); r.d.position.y = 0.035; r.d.fxu.o = 0.7 * k; } },
  stun: { col: 0xffd030,
    build(r) { r.s = []; for (let i = 0; i < 4; i++) { const m = tileSprite(TL.star, 0xffd030, false, 6); r.root.add(m); r.s.push(m); } },
    tick(e, dt, fx, k) { e.rig.s.forEach((m, i) => { const a = e.t * 4 + i * TAU / 4; m.position.set(Math.cos(a) * 0.38, e.h + 0.22 + Math.sin(a) * 0.08, Math.sin(a) * 0.38); m.scale.setScalar((0.2 + 0.05 * Math.sin(e.t * 8 + i)) * k); m.fxu.c.copy(e.col); m.fxu.r = e.t * 3; m.fxu.o = k; }); } },
  slow: { col: 0x3a7aff,
    build(r) { r.s = setTile(fxMesh(G.ground(), fxMat('tex', { map: atlasTex(), add: false }), 3), TL.swirl); r.s2 = setTile(fxMesh(G.ground(), fxMat('tex', { map: atlasTex(), add: false }), 3), TL.swirl); r.root.add(r.s, r.s2); },
    P: [{ rate: 4, add: false, tile: TL.drop, shape: 'disc', rad: 0.45, up: [-0.4, -0.2], size: [0.08, 0.12], life: [0.6, 0.9], y: [0.3, 0.8] }],
    tick(e, dt, fx, k) { const r = e.rig; r.s.scale.set(1.3, 1, 1.3); r.s.position.y = 0.045; r.s.rotation.y = e.t * 1.2; r.s.fxu.c.copy(e.col); r.s.fxu.o = 0.75 * k; r.s2.scale.set(0.8, 1, 0.8); r.s2.position.y = 0.05; r.s2.rotation.y = -e.t * 0.9 + 1; r.s2.fxu.c.copy(e.col).lerp(_c1.set(0xffffff), 0.4); r.s2.fxu.o = 0.6 * k; } },
  defdown: { col: 0xffffff, build(r) { r.i = iconMesh(ICON.defdown(), 0.55, 0.55); r.root.add(r.i); }, tick: iconBob },
  atkdown: { col: 0xffffff, build(r) { r.i = iconMesh(ICON.atkdown(), 0.55, 0.55); r.root.add(r.i); }, tick: iconBob },
  phrase: { col: 0xffffff, stacks0: 0, build(r) { r.i = iconMesh(ICON.phrase(0), 0.9, 0.45); r.root.add(r.i); }, stacks(e, n) { setIcon(e.rig.i, ICON.phrase(Math.max(0, Math.min(5, n | 0)))); }, tick: iconBob },
  power: { col: 0x2a8af0, stacks0: 0, build(r) { r.i = iconMesh(ICON.power(0), 0.7, 0.35); r.root.add(r.i); }, stacks(e, n) { setIcon(e.rig.i, ICON.power(Math.max(0, Math.min(5, n | 0)))); },
    tick(e, dt, fx, k) { iconBob(e, dt, fx, k); if (e.stacks >= 5) spray(fx, { n: 1, tile: TL.bolt, col: 0x6ad8ff, size: [0.15, 0.22], life: [0.1, 0.2], spd: [0.5, 1], y: e.h + 0.45 }, e.p.x, e.p.y, e.p.z, 1, null, 0, 1, 8 * dt); } },
  temperature: { col: 0xffffff, stacks0: 0, build(r) { r.i = iconMesh(ICON.temperature(0), 0.3, 0.6); r.root.add(r.i); }, stacks(e, n) { setIcon(e.rig.i, ICON.temperature(Math.max(-5, Math.min(5, Math.round(n))))); },
    tick(e, dt, fx, k) { iconBob(e, dt, fx, k); const v = Math.max(-5, Math.min(5, Math.round(e.stacks))); if (v > 0) spray(fx, ext(AURA.overclock.P[0], { col: [0xff7a30, 0xff4a20], tint: false }), e.p.x, e.p.y, e.p.z, 1, null, 0, 1, v * 2 * dt); else if (v < 0) spray(fx, AURA.chill.P[1], e.p.x, e.p.y, e.p.z, 1, null, 0, 1, -v * 2 * dt); } },
  _generic: { col: 0xfff0c0, P: [{ rate: 8, tile: TL.spark, shape: 'disc', rad: 0.45, up: [0.5, 1], size: [0.12, 0.2], life: [0.6, 0.9], y: [0.1, 1.1] }] },
};
function iconBob(e, dt, fx, k) { const i = e.rig.i; i.position.y = e.h + 0.45 + Math.sin(e.t * 3) * 0.04; i.fxu.o = k; i.fxu.c.set(0xffffff); }
// burn smoke y uses a function in spec above; normalise to a number
AURA.burn.P[3].y = 1.3;

function buildAura(rig, def, e) { if (def.build) def.build(rig, e); }
function auraStart(e, fx) { if (e.def.stacks) e.def.stacks(e, e.stacks); }
function auraTick(e, dt, fx) {
  const def = e.def; if (e.get) { const p = e.get(); if (p) gp(p, e.p); else if (e.fade < 0) e.fade = 0; }
  e.rig.root.position.copy(e.p);
  if (e.life > 0 && e.t >= e.life && e.fade < 0) e.fade = 0;
  let k = easeOut(clamp01(e.t / 0.25)); if (e.fade >= 0) { e.fade += dt; k *= 1 - e.fade / 0.3; if (k <= 0) return false; }
  const hs = e.h / 1.6;
  e.gk = k; if (def.P && e.fade < 0) for (const sp of def.P) spray(fx, sp, e.p.x, e.p.y, e.p.z, hs, e.tint, 0, 1, sp.rate * dt * gradeMul(sp, e));
  if (def.tick) def.tick(e, dt, fx, k);
  return true;
}

// ============================================================================================ summon models
// Templates are built once per kind (shared geometry/materials) and cloned; obj.userData.anim(obj, t) animates the clone.
const nm = (o, n) => { o.name = n; return o; };
const grp = (par, n, p) => { const g = new THREE.Group(); if (n) g.name = n; if (p) g.position.set(p[0], p[1], p[2]); par.add(g); return g; };
const helixGeo = () => gc('helix', () => { const pts = []; for (let i = 0; i <= 40; i++) { const a = i / 40 * TAU * 5; pts.push(new THREE.Vector3(Math.cos(a) * 0.16, i / 40 * 0.35, Math.sin(a) * 0.16)); } return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.02, 3, false); });
function fxPart(par, name, geo, mode, o, setup) { const m = fxMesh(geo, fxMat(mode, o), o.order ?? 5); if (name) m.name = name; if (setup) setup(m); par.add(m); return m; }
function puffs(par, n, y, spread) { for (let i = 0; i < n; i++) { const m = tileSprite(TL.smoke, 0xffffff, false, 5); m.name = 'puff'; m.userData.i = i; m.userData.y0 = y; m.userData.sp = spread; m.fxu.o = 0; par.add(m); } }
function animPuffs(P, t, rate = 1) { const ps = P.puff || []; ps.forEach((m) => { const u = ((t * 0.6 * rate + m.userData.i / ps.length) % 1); m.position.set(Math.sin(m.userData.i * 2.3 + t) * 0.12 * m.userData.sp, m.userData.y0 + u * 1.1, Math.cos(m.userData.i * 1.7) * 0.1 * m.userData.sp); m.scale.setScalar(0.25 + u * 0.5); m.fxu.o = Math.sin(u * Math.PI) * 0.7; }); }
function colorize(key, geo, fn) { return gc('vc' + key, () => { const g = geo.clone(), p = g.attributes.position, c = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) { _v1.fromBufferAttribute(p, i); fn(_v1, _c1); c[i * 3] = _c1.r; c[i * 3 + 1] = _c1.g; c[i * 3 + 2] = _c1.b; } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g; }); }

const SUMMON = {
  vine: { build(r) { const mats = [lam(0x4f9a35), lam(0x3f7a2a), lam(0x6db246)], th = lam(0xe0d8a8);
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU, g = grp(r, 'sway', [Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25]); g.rotation.y = -a + Math.PI / 2; g.userData.i = i; const m = new THREE.Mesh(vineGeo(i), mats[i % 3]); m.scale.setScalar(i % 2 ? 1.25 : 1.0); g.add(m);
        const pts = VINE_PTS[i % 3]; for (let k = 1; k < 4; k++) { const t = new THREE.Mesh(G.cone(4), th); t.position.set(pts[k][0] + 0.07, pts[k][1], pts[k][2]); t.scale.set(0.035, 0.13, 0.035); t.rotation.z = -1.3; m.add(t); }
        const lf = new THREE.Mesh(leafGeo(), lam(0x7cc850, { ds: true })); lf.position.set(pts[2][0], pts[2][1], pts[2][2]); lf.scale.setScalar(0.32); lf.rotation.set(0.5, i, 0.9); m.add(lf); }
      mk(r, lumpy('mound', 1, 0.2, 2), lam(0x6a4a2e), [0, -0.05, 0], [0.5, 0.18, 0.5]); },
    anim(P, t) { for (const g of P.sway) g.rotation.z = Math.sin(t * 1.6 + g.userData.i) * 0.08; } },
  poison_flower: { build(r) { const stem = lam(0x4a8a32), pet = lam(0x9a40d0, { ds: true }), pet2 = lam(0xc070f0, { ds: true });
      mk(r, G.tube('pfstem', [[0, 0, 0], [0.1, 0.4, 0], [-0.05, 0.8, 0.05], [0, 1.15, 0.1]], 0.07, 10, 5), stem);
      for (let i = 0; i < 3; i++) { const lf = mk(r, leafGeo(), lam(0x5aa040, { ds: true }), [0, 0.05, 0], 0.65, [-1.0, i * 2.1, 0]); }
      const head = grp(r, 'head', [0, 1.15, 0.1]); head.rotation.x = 0.35;
      for (let i = 0; i < 6; i++) { const pv = grp(head, 'petal'); pv.rotation.y = i * TAU / 6; const p = mk(pv, G.sphere(8, 5), i % 2 ? pet : pet2, [0, 0, 0.3], [0.2, 0.05, 0.32]); for (let k = 0; k < 2; k++) mk(p, G.sphere(4, 3), lam(0xe8d0ff), [k ? 0.4 : -0.3, 0.6, 0.3 - k * 0.5], 0.18); }
      mk(head, G.sphere(10, 7), lam(0xc8e050, { em: 0x506010, ei: 0.4 }), [0, 0.06, 0], [0.16, 0.12, 0.16]); for (let i = 0; i < 5; i++) mk(head, G.sphere(4, 3), lam(0x5a2a6a), [Math.cos(i * 1.3) * 0.09, 0.15, Math.sin(i * 1.3) * 0.09], 0.025);
      const gl = glowSprite(0xc070ff, 5); gl.scale.setScalar(1.2); gl.fxu.o = 0.35; gl.fxu.x.x = 0; gl.position.y = 1.2; r.add(gl); },
    anim(P, t) { const h = P.head[0]; h.rotation.x = 0.35 + Math.sin(t * 1.2) * 0.08; h.rotation.z = Math.sin(t * 0.9) * 0.06; for (const p of P.petal) p.rotation.x = -0.25 + Math.sin(t * 2) * 0.12; } },
  herb_spirit: { build(r) { const b = grp(r, 'body', [0, 0.55, 0]), skin = lam(0x8ad860, { smooth: true });
      mk(b, G.sphere(12, 9), skin, null, [0.26, 0.3, 0.24]); mk(b, G.sphere(8, 6), lam(0x2a2a2a, { smooth: true }), [-0.08, 0.04, 0.21], 0.04); mk(b, G.sphere(8, 6), lam(0x2a2a2a, { smooth: true }), [0.08, 0.04, 0.21], 0.04);
      mk(b, G.sphere(6, 4), lam(0xffffff, { em: 0xffffff, ei: 1 }), [-0.07, 0.06, 0.245], 0.012); mk(b, G.sphere(6, 4), lam(0xffffff, { em: 0xffffff, ei: 1 }), [0.09, 0.06, 0.245], 0.012);
      mk(b, G.sphere(6, 4), lam(0xff9aa8), [-0.14, -0.04, 0.18], [0.04, 0.025, 0.02]); mk(b, G.sphere(6, 4), lam(0xff9aa8), [0.14, -0.04, 0.18], [0.04, 0.025, 0.02]);
      const top = grp(b, 'sprout', [0, 0.27, 0]); mk(top, leafGeo(), lam(0x5ab83a, { ds: true }), [0, 0, 0], 0.32, [0, 0, -0.5]); mk(top, leafGeo(), lam(0x7cc850, { ds: true }), [0, 0, 0], 0.26, [0, Math.PI / 2, 0.6]);
      for (const s of [-1, 1]) { const a = grp(b, 'arm', [s * 0.24, -0.02, 0]); a.userData.s = s; mk(a, leafGeo(), lam(0x6ac848, { ds: true }), [0, 0, 0], 0.2, [0, 0, -s * 1.9]); }
      const sh = glowSprite(0xa0ff80, 4); sh.scale.setScalar(0.7); sh.fxu.o = 0.4; sh.fxu.x.x = 0; sh.position.y = 0.12; r.add(sh); },
    anim(P, t) { const b = P.body[0]; b.position.y = 0.55 + Math.sin(t * 2.4) * 0.07; b.rotation.y = Math.sin(t * 0.8) * 0.2; P.sprout[0].rotation.z = Math.sin(t * 3) * 0.15; for (const a of P.arm) a.rotation.z = Math.sin(t * 5) * 0.4 * a.userData.s; } },
  tree_guardian: { build(r) { const bark = lam(0x7a5a3a), bark2 = lam(0x5e4430), leaf = lam(0x4a9a3a), leaf2 = lam(0x62b048);
      for (const s of [-1, 1]) { mk(r, G.cyl(0.16, 0.22, 0.5, 6), bark2, [s * 0.22, 0.25, 0]); mk(r, G.cyl(0.24, 0.26, 0.12, 6), bark2, [s * 0.22, 0.04, 0.05]); }
      const body = grp(r, 'body', [0, 0.45, 0]); mk(body, G.cyl(0.4, 0.48, 1.15, 8), bark, [0, 0.55, 0]);
      for (let i = 0; i < 5; i++) mk(body, G.box(), bark2, [Math.cos(i * 1.3) * 0.42, 0.3 + i * 0.18, Math.sin(i * 1.3) * 0.42], [0.06, 0.3, 0.04], [0, -i * 1.3, 0]);
      mk(body, G.sphere(8, 6), lam(0xd8ff70, { em: 0xb8f040, ei: 1 }), [-0.14, 0.85, 0.4], 0.07); mk(body, G.sphere(8, 6), lam(0xd8ff70, { em: 0xb8f040, ei: 1 }), [0.14, 0.85, 0.4], 0.07);
      mk(body, G.box(), lam(0x2a1a10), [0, 0.6, 0.42], [0.2, 0.05, 0.05]); mk(body, lumpy('moss', 1, 0.2, 5), lam(0x7ab048), [0.3, 1.1, 0.25], [0.18, 0.1, 0.15]);
      const can = grp(body, 'canopy', [0, 1.3, 0]); mk(can, lumpy('can1', 1, 0.15, 1), leaf, [0, 0.25, 0], 0.62); mk(can, lumpy('can2', 1, 0.18, 4), leaf2, [0.4, 0.05, 0.1], 0.42); mk(can, lumpy('can3', 1, 0.18, 7), leaf2, [-0.38, 0.1, -0.1], 0.45); mk(can, lumpy('can2', 1, 0.18, 4), leaf, [0, 0.2, -0.4], 0.4);
      for (const s of [-1, 1]) { const a = grp(body, 'arm', [s * 0.42, 0.95, 0]); a.userData.s = s; mk(a, G.tube('tgarm' + s, [[0, 0, 0], [s * 0.25, -0.1, 0.05], [s * 0.38, -0.45, 0.12], [s * 0.4, -0.75, 0.15]], 0.1, 8, 5), bark); mk(a, lumpy('hand', 1, 0.2, 2), leaf2, [s * 0.4, -0.8, 0.15], 0.17); } },
    anim(P, t) { const b = P.body[0]; b.scale.set(1, 1 + Math.sin(t * 1.5) * 0.02, 1); b.rotation.z = Math.sin(t * 0.7) * 0.03; P.canopy[0].rotation.z = Math.sin(t * 1.1) * 0.05; for (const a of P.arm) a.rotation.x = Math.sin(t * 1.3 + a.userData.s) * 0.12; } },
  turret: { build(r) { const steel = lam(0x5a6878), dark = lam(0x2e343c);
      mk(r, G.cyl(0.38, 0.46, 0.28, 8), steel, [0, 0.14, 0]); for (let i = 0; i < 3; i++) mk(r, G.box(), dark, [Math.cos(i * 2.09) * 0.42, 0.06, Math.sin(i * 2.09) * 0.42], [0.12, 0.12, 0.3], [0, -i * 2.09, 0]);
      mk(r, G.cyl(0.18, 0.2, 0.18, 8), dark, [0, 0.36, 0]);
      const h = grp(r, 'head', [0, 0.56, 0]); mk(h, G.box(), lam(0x4a6a8a), [0, 0, -0.03], [0.46, 0.28, 0.46]); mk(h, G.box(), lam(0xd8a030), [0, 0.15, -0.03], [0.3, 0.04, 0.3]);
      mk(h, G.cyl(0.065, 0.065, 0.6, 8), dark, [0.08, 0, 0.42], 1, ZROT); mk(h, G.cyl(0.065, 0.065, 0.6, 8), dark, [-0.08, 0, 0.42], 1, ZROT); mk(h, G.cyl(0.085, 0.085, 0.08, 8), lam(0xc89a40), [0.08, 0, 0.7], 1, ZROT); mk(h, G.cyl(0.085, 0.085, 0.08, 8), lam(0xc89a40), [-0.08, 0, 0.7], 1, ZROT);
      mk(h, G.cyl(0.14, 0.14, 0.16, 8), lam(0x8a6a3a), [0.3, -0.02, -0.05], 1, [0, 0, Math.PI / 2]);
      mk(h, G.sphere(6, 4), lam(0xff3020, { em: 0xff2010, ei: 1 }), [0, 0.06, 0.205], 0.04); const gl = glowSprite(0xff4030, 6); gl.name = 'light'; gl.position.set(0, 0.06, 0.24); gl.scale.setScalar(0.3); gl.fxu.x.x = 1; h.add(gl); },
    anim(P, t) { P.head[0].rotation.y = Math.sin(t * 0.9) * 0.7; P.light[0].fxu.o = (Math.sin(t * 8) > 0 ? 1 : 0.25); } },
  mine: { build(r) { mk(r, G.cyl(0.3, 0.33, 0.08, 10), lam(0x3a3e46), [0, 0.04, 0]); mk(r, G.torus(0.12, 4, 14), lam(0xe0b020), [0, 0.08, 0], [0.3, 0.3, 0.3], [Math.PI / 2, 0, 0]);
      for (let i = 0; i < 6; i++) mk(r, G.cyl(0.02, 0.025, 0.08, 4), lam(0x8a8e96), [Math.cos(i * 1.047) * 0.2, 0.12, Math.sin(i * 1.047) * 0.2]);
      mk(r, G.sphere(8, 4), lam(0x5a1a1a), [0, 0.09, 0], [0.1, 0.07, 0.1]); const gl = glowSprite(0xff3020, 6); gl.name = 'light'; gl.position.y = 0.16; gl.scale.setScalar(0.4); gl.fxu.x.x = 1; r.add(gl); },
    anim(P, t) { const k = (t * 1.5) % 1; P.light[0].fxu.o = k < 0.2 ? 1 : 0.15; P.light[0].scale.setScalar(k < 0.2 ? 0.5 : 0.3); } },
  drone: { build(r) { const b = grp(r, 'body', [0, 1.4, 0]), white = lam(0xe8ecf0), dark = lam(0x3a4048);
      mk(b, G.sphere(10, 6), white, null, [0.26, 0.12, 0.26]); mk(b, G.sphere(8, 5), dark, [0, -0.08, 0.12], 0.08); mk(b, G.sphere(6, 4), lam(0x40c8ff, { em: 0x30b0ff, ei: 1 }), [0, -0.08, 0.18], 0.035);
      for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2, x = Math.cos(a) * 0.36, z = Math.sin(a) * 0.36; mk(b, G.box(), dark, [x / 2, 0, z / 2], [0.36, 0.04, 0.05], [0, -a, 0]); mk(b, G.cyl(0.04, 0.04, 0.08, 6), dark, [x, 0.04, z]);
        const rot = grp(b, 'rotor', [x, 0.09, z]); mk(rot, G.cyl(0.17, 0.17, 0.01, 12), lam(0xd0d8e0, { op: 0.45 }), null); mk(rot, G.box(), dark, null, [0.32, 0.01, 0.03]); }
      for (const s of [-1, 1]) mk(b, G.box(), dark, [s * 0.12, -0.16, 0], [0.02, 0.14, 0.2]);
      const sh = fxMesh(G.ground(), fxMat('glow', { add: false }), 3); sh.fxu.c.set(0x000000); sh.fxu.o = 0.25; sh.scale.set(0.8, 1, 0.8); sh.position.y = 0.03; r.add(sh); },
    anim(P, t) { const b = P.body[0]; b.position.y = 1.4 + Math.sin(t * 2.2) * 0.08; b.rotation.z = Math.sin(t * 1.3) * 0.06; b.rotation.x = Math.sin(t * 1.7) * 0.05; P.rotor.forEach((r, i) => r.rotation.y = t * 40 * (i % 2 ? 1 : -1)); } },
  em_device: { build(r) { const dark = lam(0x3a4048), cop = lam(0xc87a3a, { em: 0x502010, ei: 0.3 });
      mk(r, G.cyl(0.32, 0.42, 0.25, 8), dark, [0, 0.125, 0]); mk(r, G.cyl(0.08, 0.12, 1.15, 8), lam(0x6a7480), [0, 0.8, 0]);
      for (let i = 0; i < 3; i++) { const c = mk(r, G.torus(0.25, 4, 14), cop, [0, 0.55 + i * 0.28, 0], 0.18 - i * 0.025, [Math.PI / 2, 0, 0]); c.name = 'coil'; c.userData.i = i; }
      mk(r, G.ico(1), lam(0x6ad8ff, { em: 0x2a9aff, ei: 1 }), [0, 1.5, 0], 0.14).name = 'orb'; const gl = glowSprite(0x5ac8ff, 6); gl.name = 'glow'; gl.position.y = 1.5; gl.fxu.x.x = 1; r.add(gl);
      fxPart(r, 'ring', G.ground(), 'ring', { add: true, order: 3 }, (m) => { m.position.y = 0.04; m.fxu.c.set(0x4ab0ff); }); },
    anim(P, t) { const p = 0.5 + 0.5 * Math.sin(t * 4); P.orb[0].scale.setScalar(0.13 + 0.03 * p); P.glow[0].scale.setScalar(0.7 + 0.4 * p); P.glow[0].fxu.o = 0.6 + 0.4 * p; P.coil.forEach(c => c.position.y = 0.55 + c.userData.i * 0.28 + Math.sin(t * 3 + c.userData.i) * 0.03);
      const u = (t * 0.7) % 1, rg = P.ring[0]; rg.scale.set(0.6 + u * 3, 1, 0.6 + u * 3); rg.fxu.x.set(0.86, 0.06, 0.2, 0); rg.fxu.o = 1 - u; } },
  fortress: { build(r) { const st = lam(0x6a7a8a), bl = lam(0x4a6a90), dark = lam(0x2e343c), acc = lam(0xe0a030);
      const legs = []; for (const s of [-1, 1]) { const l = grp(r, 'leg', [s * 0.45, 1.25, 0]); l.userData.s = s; mk(l, G.box(), st, [0, -0.35, 0], [0.3, 0.7, 0.35]); const kn = grp(l, null, [0, -0.7, 0]); mk(kn, G.box(), dark, [0, -0.3, 0.05], [0.24, 0.6, 0.3]); mk(kn, G.box(), st, [0, -0.52, 0.12], [0.4, 0.12, 0.6]); mk(kn, G.sphere(6, 4), acc, [0, 0, 0.12], 0.12); }
      const b = grp(r, 'body', [0, 1.95, 0]); mk(b, G.box(), bl, [0, 0, 0], [1.25, 0.8, 1.0]); mk(b, G.box(), st, [0, -0.45, 0], [0.9, 0.2, 0.8]); mk(b, G.box(), lam(0x6ae8ff, { em: 0x2ab8f0, ei: 0.9 }), [0, 0.12, 0.505], [0.7, 0.16, 0.02]);
      mk(b, G.box(), acc, [0, 0.42, 0], [0.5, 0.06, 0.5]); mk(b, G.cyl(0.015, 0.015, 0.5, 4), dark, [0.4, 0.65, -0.3]); mk(b, G.sphere(4, 3), lam(0xff3020, { em: 0xff2010, ei: 1 }), [0.4, 0.92, -0.3], 0.04);
      for (const s of [-1, 1]) { const c = grp(b, 'cannon', [s * 0.8, 0.2, 0]); mk(c, G.box(), st, [0, 0, 0], [0.32, 0.36, 0.5]); mk(c, G.cyl(0.09, 0.1, 0.95, 8), dark, [0, 0.05, 0.6], 1, ZROT); mk(c, G.cyl(0.12, 0.12, 0.1, 8), acc, [0, 0.05, 1.05], 1, ZROT); mk(c, G.cyl(0.06, 0.06, 0.7, 6), dark, [0, -0.13, 0.45], 1, ZROT); } },
    anim(P, t) { const b = P.body[0]; b.position.y = 1.95 + Math.abs(Math.sin(t * 1.4)) * 0.05; b.rotation.y = Math.sin(t * 0.6) * 0.08; P.cannon.forEach((c, i) => c.rotation.x = Math.sin(t * 0.9 + i) * 0.1 - 0.05); P.leg.forEach(l => l.rotation.x = Math.sin(t * 1.4 + l.userData.s) * 0.04); } },
  pressure_cooker: { build(r) { const steel = lam(0xb8c0c8), dark = lam(0x2a2a2e);
      mk(r, G.lathe('pot', [[0, 0], [0.42, 0], [0.46, 0.05], [0.46, 0.5], [0.44, 0.52], [0, 0.52]], 14), steel); for (const s of [-1, 1]) mk(r, G.box(), dark, [s * 0.58, 0.45, 0], [0.26, 0.06, 0.1]);
      const lid = grp(r, 'lid', [0, 0.52, 0]); mk(lid, G.lathe('lid', [[0, 0.16], [0.18, 0.13], [0.4, 0.05], [0.48, 0.0], [0, 0]], 14), lam(0xd0d6dc)); mk(lid, G.cyl(0.06, 0.08, 0.1, 8), dark, [0, 0.2, 0]); mk(lid, G.cyl(0.03, 0.04, 0.12, 6), lam(0xe03a2a), [0.2, 0.15, 0.1]); mk(lid, G.box(), dark, [-0.5, 0.06, 0], [0.3, 0.06, 0.1]);
      puffs(r, 3, 0.75, 1); },
    anim(P, t) { const l = P.lid[0], j = Math.sin(t * 30) * Math.max(0, Math.sin(t * 2)); l.rotation.z = j * 0.05; l.rotation.x = Math.cos(t * 27) * Math.max(0, Math.sin(t * 2)) * 0.04; l.position.y = 0.52 + Math.abs(j) * 0.03; animPuffs(P, t, 1.5); } },
  sugar_wall: { build(r) { const pk = lam(0xff9ac8, { em: 0x803a5a, ei: 0.35, op: 0.78 }), am = lam(0xffc060, { em: 0x80501a, ei: 0.35, op: 0.78 });
      mk(r, G.box(), lam(0xf0b070, { op: 0.85 }), [0, 0.12, 0], [3, 0.24, 0.55]);
      for (let i = 0; i < 9; i++) { const x = -1.35 + i * 0.34, h = 1.0 + ((i * 7) % 5) * 0.16; const c = mk(r, CRYS_GEO(), i % 2 ? am : pk, [x, 0.1, (i % 3 - 1) * 0.1], [1.4, h, 1.4], [0, i, (i % 2 ? 1 : -1) * 0.06]); c.renderOrder = 4; }
      for (let i = 0; i < 4; i++) { const s = tileSprite(TL.star, 0xffffff, true, 6); s.name = 'tw'; s.userData.i = i; s.position.set(-1.1 + i * 0.75, 0.7 + (i % 2) * 0.5, 0.3); r.add(s); } },
    anim(P, t) { P.tw.forEach(s => { const k = Math.max(0, Math.sin(t * 2.5 + s.userData.i * 1.7)); s.scale.setScalar(0.35 * k + 0.001); s.fxu.o = k; s.fxu.r = t; }); } },
  hair_roller: { build(r) { mk(r, G.cyl(0.36, 0.38, 0.05, 12), lam(0xf0a0c0), [0, 0.025, 0]); const sp = grp(r, 'spring', [0, 0.05, 0]); mk(sp, helixGeo(), lam(0xc8d0d8, { em: 0x404850, ei: 0.3 }));
      const rl = grp(r, 'roller', [0, 0.52, 0]); mk(rl, G.cyl(0.2, 0.2, 0.6, 10), lam(0xff8ab8), null, 1, [0, 0, Math.PI / 2]); for (let i = 0; i < 4; i++) mk(rl, G.torus(0.15, 4, 12), lam(0xffffff), [-0.22 + i * 0.147, 0, 0], 0.21, [0, Math.PI / 2, 0]);
      mk(rl, G.cyl(0.21, 0.21, 0.04, 10), lam(0xd04a8a), [0.31, 0, 0], 1, [0, 0, Math.PI / 2]); mk(rl, G.cyl(0.21, 0.21, 0.04, 10), lam(0xd04a8a), [-0.31, 0, 0], 1, [0, 0, Math.PI / 2]); mk(r, G.box(), lam(0xe0e4e8), [0, 0.22, 0], [0.05, 0.45, 0.05]); },
    anim(P, t) { const k = Math.abs(Math.sin(t * 2.6)), s = 0.75 + 0.35 * k; P.spring[0].scale.y = s; P.roller[0].position.y = 0.17 + 0.35 * s; P.roller[0].rotation.x = t * 1.5; } },
  mannequin: { build(r) { const wood = lam(0x8a6040), linen = lam(0xece0c4, { smooth: true });
      for (let i = 0; i < 3; i++) { const a = i * 2.094; mk(r, G.cyl(0.02, 0.025, 0.5, 5), wood, [Math.cos(a) * 0.15, 0.2, Math.sin(a) * 0.15], 1, [Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6]); }
      mk(r, G.cyl(0.025, 0.025, 0.5, 6), wood, [0, 0.55, 0]); const b = grp(r, 'form', [0, 0.78, 0]);
      mk(b, G.lathe('dressform', [[0, 0], [0.24, 0.02], [0.27, 0.12], [0.2, 0.32], [0.17, 0.4], [0.24, 0.55], [0.25, 0.65], [0.2, 0.74], [0.08, 0.8], [0.06, 0.86], [0, 0.88]], 12), linen, null, [1, 1, 0.78]);
      mk(b, G.sphere(8, 5), wood, [0, 0.92, 0], 0.07); mk(b, G.torus(0.08, 3, 16), lam(0xf0d040), [0, 0.38, 0], [0.19, 0.19, 0.15], [Math.PI / 2, 0, 0]);
      for (let i = 0; i < 4; i++) mk(b, G.sphere(4, 3), lam(i % 2 ? 0xe03a3a : 0x3a6ae8), [-0.12 + i * 0.07, 0.6, 0.19], 0.018); mk(b, G.box(), lam(0xd8c8a8), [0, 0.5, 0.0], [0.005, 0.5, 0.42]); },
    anim(P, t) { P.form[0].rotation.z = Math.sin(t * 1.4) * 0.03; P.form[0].rotation.y = Math.sin(t * 0.7) * 0.1; } },
  ink_wolf: { build(r) { const ink = lam(0x1c1826, { em: 0x1a0e2a, ei: 0.6 }), eye = lam(0xffffff, { em: 0xd0c0ff, ei: 1 });
      const b = grp(r, 'body', [0, 0.55, 0]); mk(b, lumpy('wolfb', 1, 0.08, 3), ink, null, [0.26, 0.28, 0.5]); mk(b, lumpy('wolfc', 1, 0.1, 6), ink, [0, 0.06, 0.32], [0.26, 0.3, 0.24]);
      const h = grp(b, 'head', [0, 0.25, 0.48]); mk(h, G.sphere(8, 6), ink, null, [0.17, 0.16, 0.18]); mk(h, G.cone(6), ink, [0, -0.04, 0.2], [0.09, 0.22, 0.08], ZROT); mk(h, G.cone(4), ink, [0.09, 0.17, -0.02], [0.05, 0.14, 0.05]); mk(h, G.cone(4), ink, [-0.09, 0.17, -0.02], [0.05, 0.14, 0.05]);
      mk(h, G.sphere(6, 4), eye, [0.07, 0.04, 0.14], 0.03); mk(h, G.sphere(6, 4), eye, [-0.07, 0.04, 0.14], 0.03);
      for (const [x, z] of [[0.13, 0.3], [-0.13, 0.3], [0.13, -0.3], [-0.13, -0.3]]) { const l = grp(r, 'leg', [x, 0.42, z]); mk(l, G.cyl(0.07, 0.05, 0.45, 6), ink, [0, -0.2, 0]); mk(l, G.sphere(6, 4), ink, [0, -0.42, 0.03], [0.07, 0.04, 0.09]); }
      const tl = grp(b, 'tail', [0, 0.08, -0.48]); mk(tl, G.cone(6), ink, [0, 0.15, -0.12], [0.08, 0.4, 0.08], [-0.8, 0, 0]);
      for (let i = 0; i < 3; i++) { const d = tileSprite(TL.drop, 0x1c1826, false, 5); d.name = 'drip'; d.userData.i = i; d.fxu.r = Math.PI; r.add(d); } },
    anim(P, t) { const b = P.body[0]; b.scale.y = 1 + Math.sin(t * 3) * 0.03; P.head[0].rotation.x = Math.sin(t * 1.5) * 0.08; P.tail[0].rotation.y = Math.sin(t * 6) * 0.35;
      P.drip.forEach(d => { const u = (t * 0.8 + d.userData.i / 3) % 1; d.position.set((d.userData.i - 1) * 0.15, 0.4 * (1 - u * u), (d.userData.i - 1) * 0.2); d.scale.setScalar(0.12 * (1 - u * 0.5)); d.fxu.o = 1 - u; }); } },
  paper_crane: { build(r) { const g = grp(r, 'body', [0, 1.2, 0]); g.scale.setScalar(2.2); craneModel(g); },
    anim(P, t) { const b = P.body[0]; b.position.y = 1.2 + Math.sin(t * 2) * 0.1; b.rotation.z = Math.sin(t * 1.3) * 0.08; craneFlap(b, t); } },
  painted_knight: { build(r) { const blue = lam(0x3a6ae8), gold = lam(0xf0b828), steel = lam(0xd8e0ec), red = lam(0xe83a3a), dark = lam(0x2a2a3a);
      for (const s of [-1, 1]) { mk(r, G.box(), blue, [s * 0.14, 0.38, 0], [0.18, 0.76, 0.22]); mk(r, G.box(), dark, [s * 0.14, 0.05, 0.04], [0.2, 0.1, 0.3]); }
      const b = grp(r, 'body', [0, 0.78, 0]); mk(b, G.box(), blue, [0, 0.35, 0], [0.56, 0.6, 0.34]); mk(b, G.box(), gold, [0, 0.07, 0], [0.6, 0.08, 0.36]); mk(b, G.box(), gold, [0, 0.4, 0.175], [0.08, 0.45, 0.02]);
      for (const s of [-1, 1]) mk(b, G.sphere(8, 5), gold, [s * 0.36, 0.6, 0], [0.16, 0.13, 0.18]);
      const hd = grp(b, 'head', [0, 0.82, 0]); mk(hd, G.cyl(0.16, 0.18, 0.3, 8), steel); mk(hd, G.sphere(8, 5), steel, [0, 0.15, 0], [0.16, 0.1, 0.16]); mk(hd, G.box(), dark, [0, 0.02, 0.165], [0.2, 0.04, 0.02]); mk(hd, G.box(), red, [0, 0.3, -0.05], [0.06, 0.22, 0.32], [0.3, 0, 0]);
      const ar = grp(b, 'swordArm', [0.38, 0.5, 0]); mk(ar, G.box(), blue, [0, -0.2, 0.05], [0.13, 0.42, 0.13], [0.5, 0, 0]); const sw = grp(ar, null, [0, -0.38, 0.22]); sw.rotation.x = -1.1; mk(sw, G.box(), steel, [0, 0.55, 0], [0.07, 0.95, 0.02]); mk(sw, G.box(), gold, [0, 0.05, 0], [0.3, 0.05, 0.06]); mk(sw, G.box(), dark, [0, -0.08, 0], [0.05, 0.2, 0.05]);
      const al = grp(b, 'shieldArm', [-0.38, 0.5, 0]); mk(al, G.box(), blue, [0, -0.2, 0], [0.13, 0.42, 0.13]); mk(al, G.shape('kshield', (s) => { s.moveTo(-0.22, 0.25); s.lineTo(0.22, 0.25); s.lineTo(0.2, -0.05); s.quadraticCurveTo(0.1, -0.25, 0, -0.32); s.quadraticCurveTo(-0.1, -0.25, -0.2, -0.05); s.closePath(); }, 0.04), red, [-0.06, -0.25, 0.1], 1, [0, -1.2, 0]);
      for (let i = 0; i < 4; i++) { const st = tileSprite(TL.streak, [0x3a6ae8, 0xf0b828, 0xe83a3a, 0xffffff][i], false, 5); st.position.set((i - 1.5) * 0.25, 0.4 + i * 0.35, 0.25); st.scale.set(0.5, 0.12, 1); st.fxu.r = 0.4 * (i % 2 ? 1 : -1); st.fxu.o = 0.75; r.add(st); } },
    anim(P, t) { P.body[0].rotation.y = Math.sin(t * 0.8) * 0.06; P.body[0].position.y = 0.78 + Math.sin(t * 2) * 0.012; P.swordArm[0].rotation.x = Math.sin(t * 1.2) * 0.1; } },
  shadow_clone: { build(r) { const add = (geo, p, s, rot, name) => fxPart(r, name || 'sh', geo, 'fresnel', { add: false, side: THREE.FrontSide, order: 5 }, (m) => { m.position.set(...p); m.scale.set(...s); if (rot) m.rotation.set(...rot); m.fxu.c.set(0x1a1028); m.fxu.c2.set(0x9a6aff); m.fxu.x.set(1.4, 0, 0.55, 0.6); });
      const cap = G.capsule(); for (const s of [-1, 1]) { add(cap, [s * 0.13, 0.42, 0], [0.18, 0.42, 0.18]); add(cap, [s * 0.33, 1.05, 0], [0.13, 0.36, 0.13], [0, 0, s * 0.15]); }
      add(cap, [0, 1.1, 0], [0.42, 0.42, 0.28]); add(G.sphere(10, 8), [0, 1.55, 0], [0.19, 0.21, 0.19]);
      for (const s of [-1, 1]) { const e = mk(r, G.sphere(6, 4), lam(0xd0b0ff, { em: 0xb080ff, ei: 1 }), [s * 0.07, 1.57, 0.17], [0.035, 0.02, 0.02]); e.name = 'eye'; } },
    anim(P, t) { const f = 0.8 + 0.2 * Math.sin(t * 9) * Math.sin(t * 2.3); for (const m of P.sh) m.fxu.o = f; } },
  painted_wall: { build(r) { const cols = [0xe8dcc0, 0xc8d4e0, 0xd8c8e0, 0xf0e4c8, 0xb8c8d8];
      for (let row = 0; row < 4; row++) for (let i = 0; i < 5; i++) { const w = 0.6, x = -1.2 + i * w + (row % 2 ? 0.3 : 0); if (x > 1.25) continue; mk(r, G.box(), lam(cols[(row * 3 + i) % 5]), [x, 0.2 + row * 0.4, ((row + i) % 3 - 1) * 0.02], [w - 0.04, 0.37, 0.5], [0, 0, ((row * 5 + i) % 3 - 1) * 0.02]); }
      mk(r, G.box(), lam(0x8a9aaa), [0, 1.66, 0], [3.0, 0.12, 0.56]);
      for (let i = 0; i < 5; i++) { const d = tileSprite(TL.drip, [0x3a6ae8, 0xe83a3a, 0xf0b828, 0x5ab83a, 0x9a5ae0][i], false, 5); d.position.set(-1.2 + i * 0.6, 1.4, 0.27); d.scale.set(0.16, 0.3, 1); d.fxu.o = 0.9; r.add(d); const s = tileSprite(TL.streak, [0x3a6ae8, 0xe83a3a, 0xf0b828, 0x5ab83a, 0x9a5ae0][i], false, 5); s.position.set(-1.1 + i * 0.55, 0.5 + (i % 3) * 0.35, 0.27); s.scale.set(0.6, 0.12, 1); s.fxu.r = 0.2 * (i % 2 ? 1 : -1); s.fxu.o = 0.8; r.add(s); } } },
  amplifier: { build(r) { const wood = lam(0x6a4a32), grill = lam(0x3a3a40), cone = lam(0x8a8a92, { smooth: true, ds: true });
      mk(r, G.box(), wood, [0, 0.6, 0], [0.85, 1.2, 0.5]); mk(r, G.box(), grill, [0, 0.55, 0.251], [0.72, 0.95, 0.01]); mk(r, G.torus(0.08, 4, 16), lam(0x2a2a2e), [0, 0.45, 0.265], 0.31);
      const c = grp(r, 'cone', [0, 0.45, 0.26]); mk(c, G.lathe('ampcone', [[0.3, 0], [0.22, 0.04], [0.08, 0.1], [0, 0.11]], 14), cone, null, 1, [-Math.PI / 2, 0, 0]); mk(c, G.sphere(8, 4), lam(0xb0b0b8), [0, 0, -0.04], [0.07, 0.07, 0.04]);
      mk(r, G.cyl(0.09, 0.09, 0.03, 10), cone, [0, 0.92, 0.265], 1, ZROT); for (let i = 0; i < 3; i++) mk(r, G.cyl(0.03, 0.03, 0.04, 6), lam(0xe0b030), [-0.25 + i * 0.1, 1.12, 0.26], 1, ZROT);
      fxPart(r, 'wave', G.plane(), 'ring', { add: false, order: 6 }, (m) => { m.position.set(0, 0.45, 0.45); m.fxu.c.set(0x3ab8f0); }); },
    anim(P, t) { const k = Math.max(0, Math.sin(t * 8)); P.cone[0].position.z = 0.26 + k * 0.03; const u = (t * 1.6) % 1, w = P.wave[0]; w.scale.set(0.6 + u * 1.6, 0.6 + u * 1.6, 1); w.fxu.x.set(0.86, 0.07, 0, 0); w.fxu.o = (1 - u) * 0.9; } },
  phantom_musician: { build(r) { const b = grp(r, 'ghost', [0, 0.3, 0]); const ghost = (geo, p, s, rot) => fxPart(b, 'gh', geo, 'fresnel', { add: true, side: THREE.FrontSide }, (m) => { m.position.set(...p); m.scale.set(...s); if (rot) m.rotation.set(...rot); m.fxu.c.set(0x2a8aa0); m.fxu.c2.set(0xc8fff8); m.fxu.x.set(1.5, 0, 0.3, 0.9); });
      ghost(G.cone(10), [0, 0.45, 0], [0.32, -0.95, 0.28]); ghost(G.capsule(), [0, 1.0, 0], [0.38, 0.32, 0.26]); ghost(G.sphere(10, 8), [0, 1.42, 0], [0.17, 0.19, 0.17]);
      ghost(G.capsule(), [0.22, 1.05, 0.15], [0.1, 0.3, 0.1], [1.0, 0, 0.5]); ghost(G.capsule(), [-0.2, 1.1, 0.12], [0.1, 0.3, 0.1], [0.6, 0, -0.9]);
      const v = grp(b, 'violin', [-0.05, 1.18, 0.22]); v.rotation.set(0.3, 0.4, 0.9); mk(v, G.sphere(8, 5), lam(0xc8783a, { em: 0x6a3010, ei: 0.5, op: 0.8 }), [0, 0, 0], [0.12, 0.2, 0.05]); mk(v, G.box(), lam(0x5a3018, { op: 0.85 }), [0, 0.24, 0], [0.03, 0.2, 0.03]);
      const bow = grp(b, 'bow', [0.25, 1.2, 0.3]); mk(bow, G.cyl(0.008, 0.008, 0.6, 4), lam(0xf0e8d0, { em: 0x808070, ei: 0.5 }), null, 1, [0, 0, 1.2]);
      for (let i = 0; i < 2; i++) { const n = tileSprite(i ? TL.note2 : TL.note, 0x8affe8, true, 6); n.name = 'note'; n.userData.i = i; r.add(n); } },
    anim(P, t) { const g = P.ghost[0]; g.position.y = 0.3 + Math.sin(t * 1.8) * 0.08; for (const m of P.gh) m.fxu.o = 0.85 + 0.15 * Math.sin(t * 5); P.bow[0].position.x = 0.25 + Math.sin(t * 4) * 0.12;
      P.note.forEach(n => { const u = (t * 0.5 + n.userData.i * 0.5) % 1; n.position.set(0.3 + n.userData.i * -0.5, 1.4 + u * 0.8, 0.1); n.scale.setScalar(0.3); n.fxu.o = Math.sin(u * Math.PI); n.fxu.r = Math.sin(t * 3) * 0.3; }); } },
  masterpiece: { build(r) { const pal = [0xe83a3a, 0xf0b828, 0x3a6ae8, 0x5ab83a, 0xff8ac8].map(hexC);
      const geo = colorize('mp', lumpy('mpb', 2, 0.1, 9), (v, c) => { const k = Math.floor((Math.sin(v.x * 3.1) + Math.cos(v.y * 2.7 + v.z * 2.2) + 2) * 1.249) % 5; c.copy(pal[k]); });
      const b = grp(r, 'body', [0, 0.38, 0]); mk(b, geo, lam(0xffffff, { vc: true }), null, [0.36, 0.34, 0.33]);
      for (const s of [-1, 1]) { mk(b, G.sphere(8, 6), lam(0xffffff, { smooth: true }), [s * 0.12, 0.08, 0.28], 0.085); mk(b, G.sphere(6, 4), lam(0x1a1a1a, { smooth: true }), [s * 0.12, 0.08, 0.355], 0.04); mk(b, G.cone(5), lam(0xf0b828), [s * 0.16, 0.38, 0], [0.05, 0.16, 0.05], [0, 0, -s * 0.4]); mk(r, G.sphere(6, 4), lam(0x3a6ae8), [s * 0.14, 0.05, 0.05], [0.09, 0.05, 0.12]); }
      mk(b, G.box(), lam(0x1a1a1a), [0, -0.06, 0.32], [0.08, 0.02, 0.02]); const br = grp(b, 'brush', [0.36, 0, 0]); mk(br, G.cyl(0.015, 0.015, 0.35, 4), lam(0x8a6040), [0, 0.1, 0], 1, [0, 0, -0.5]); mk(br, G.cone(5), lam(0xe83a3a), [0.1, 0.28, 0], [0.04, 0.1, 0.04], [0, 0, -0.5 + Math.PI]); },
    anim(P, t) { const b = P.body[0], k = Math.abs(Math.sin(t * 3.2)); b.position.y = 0.38 + k * 0.15; b.scale.set(1 + (1 - k) * 0.08, 1 - (1 - k) * 0.1, 1 + (1 - k) * 0.08); P.brush[0].rotation.z = Math.sin(t * 4) * 0.4; } },
  ink_dragon: { build(r) { const ink = lam(0x1c1828, { em: 0x2a1640, ei: 0.55, smooth: true }), spike = lam(0x6a4aa0, { em: 0x3a1a6a, ei: 0.6 }), eye = lam(0xffffff, { em: 0xe0a0ff, ei: 1 });
      const N = 18; for (let i = 0; i < N; i++) { const s = grp(r, 'seg'); s.userData.i = i; const rr = 0.32 * (1 - i / N * 0.75); mk(s, G.ico(1), ink, null, [rr, rr * 0.9, rr * 1.3]); if (i % 2 === 0) mk(s, G.cone(4), spike, [0, rr * 0.95, 0], [rr * 0.35, rr * 0.9, rr * 0.5]);
        if (i === 3 || i === 10) for (const sx of [-1, 1]) mk(s, G.cone(4), ink, [sx * rr * 1.1, -rr * 0.6, 0], [0.06, 0.35, 0.06], [0.4, 0, sx * 2.4]); }
      const h = grp(r, 'head'); mk(h, G.sphere(10, 7), ink, [0, 0, 0.1], [0.36, 0.3, 0.45]); mk(h, G.box(), ink, [0, -0.04, 0.5], [0.34, 0.16, 0.42]); const jaw = mk(h, G.box(), ink, [0, -0.18, 0.4], [0.3, 0.08, 0.4]); jaw.name = 'jaw';
      for (const s of [-1, 1]) { mk(h, G.cone(5), spike, [s * 0.18, 0.25, -0.1], [0.06, 0.45, 0.06], [-0.9, 0, s * 0.3]); mk(h, G.sphere(6, 4), eye, [s * 0.18, 0.1, 0.36], 0.055); mk(h, G.tube('whisk' + s, [[0, 0, 0], [s * 0.25, -0.05, 0.1], [s * 0.45, -0.2, 0.0], [s * 0.6, -0.15, -0.2]], 0.02, 6, 3), spike, [s * 0.12, -0.05, 0.62]); }
      mk(h, G.cone(5), spike, [0, 0.15, 0.55], [0.05, 0.15, 0.05], [0.6, 0, 0]); },
    anim(P, t) { const segs = P.seg, N = segs.length, L = 6, sp = L / (N + 2);
      const pos = (i, out) => out.set(Math.sin(t * 2.2 - i * 0.45) * 0.55 * (0.3 + i / N), 1.3 + Math.sin(t * 1.6 - i * 0.35) * 0.35, L / 2 - 0.5 - i * sp);
      const h = P.head[0]; pos(-1.2, h.position); pos(0, _v2); h.lookAt(_v3.copy(h.position).multiplyScalar(2).sub(_v2).applyMatrix4(h.parent.matrixWorld)); P.jaw[0].rotation.x = 0.15 + Math.sin(t * 3) * 0.12;
      for (let i = 0; i < N; i++) { const s = segs[i]; pos(i, s.position); pos(i - 1, _v2); _v3.copy(_v2).applyMatrix4(s.parent.matrixWorld); s.lookAt(_v3); } } },
  cooking_pot: { build(r) { const iron = lam(0x3a3a40);
      mk(r, G.lathe('cauldron', [[0, 0.12], [0.35, 0.14], [0.55, 0.3], [0.62, 0.55], [0.58, 0.8], [0.55, 0.86], [0.6, 0.9]], 14), iron); mk(r, G.torus(0.06, 4, 16), lam(0x4a4a52), [0, 0.9, 0], [0.6, 0.6, 0.6], [Math.PI / 2, 0, 0]);
      for (let i = 0; i < 3; i++) { const a = i * 2.094; mk(r, G.cyl(0.05, 0.04, 0.25, 5), iron, [Math.cos(a) * 0.35, 0.1, Math.sin(a) * 0.35]); }
      for (const s of [-1, 1]) mk(r, G.torus(0.2, 4, 10), iron, [s * 0.66, 0.78, 0], 0.11, [0, Math.PI / 2, 0]);
      mk(r, G.cyl(0.56, 0.56, 0.04, 14), lam(0xc8682a, { em: 0x502008, ei: 0.3 }), [0, 0.8, 0]);
      const ch = [[0xe0c040, 0.15, 0.1], [0x5ab83a, -0.2, 0.2], [0xd84a2a, 0.05, -0.25], [0xf0e0c0, -0.25, -0.1], [0x9a4a22, 0.28, -0.12]]; ch.forEach(([c, x, z], i) => mk(r, G.box(), lam(c), [x, 0.83, z], 0.09, [i, i * 2, 0]));
      puffs(r, 4, 1.0, 2.5); for (let i = 0; i < 3; i++) { const b = tileSprite(TL.bubble, 0xf0a060, false, 5); b.name = 'bub'; b.userData.i = i; r.add(b); } },
    anim(P, t) { animPuffs(P, t, 0.8); P.bub.forEach(b => { const u = (t * 1.3 + b.userData.i * 0.33) % 1, a = b.userData.i * 2.1 + Math.floor(t * 1.3 + b.userData.i * 0.33); b.position.set(Math.cos(a) * 0.3, 0.86, Math.sin(a) * 0.3); b.scale.setScalar(0.08 + u * 0.12); b.fxu.o = 1 - u; }); } },
  orbital_marker: { build(r) { fxPart(r, 'ret', G.ground(), 'tex', { map: ICON.target(), add: false, order: 3 }, (m) => { m.scale.set(1.8, 1, 1.8); m.position.y = 0.04; m.fxu.c.set(0xff3a2a); });
      mk(r, G.cyl(0.05, 0.08, 0.8, 6), lam(0x5a6070), [0, 0.4, 0]); mk(r, G.cyl(0.12, 0.14, 0.08, 8), lam(0x3a3e46), [0, 0.04, 0]);
      const gl = glowSprite(0xff4030, 6); gl.name = 'light'; gl.position.y = 0.85; gl.fxu.x.x = 1; r.add(gl); mk(r, G.sphere(6, 4), lam(0xff4030, { em: 0xff2010, ei: 1 }), [0, 0.84, 0], 0.06);
      fxPart(r, 'beam', xstrip(), 'beam', { add: true, order: 5 }, (m) => { m.rotation.x = -Math.PI / 2; m.scale.set(0.3, 0.3, 7); m.fxu.c.set(0xff5040); m.fxu.x.set(0.3, 6, 3, 0.4); }); },
    anim(P, t) { P.ret[0].rotation.y = t * 0.8; P.ret[0].fxu.o = 0.75 + 0.25 * Math.sin(t * 6); const l = P.light[0]; l.fxu.o = Math.sin(t * 7) > 0 ? 1 : 0.3; l.scale.setScalar(0.45); const b = P.beam[0]; b.fxu.t = t; b.fxu.o = 0.55 + 0.25 * Math.sin(t * 4); } },
  _generic: { build(r) { mk(r, CRYS_GEO(), lam(0xd8c8ff, { em: 0x6a5ab0, ei: 0.4 }), [0, 0, 0], [3, 1.2, 3]); const gl = glowSprite(0xc0b0ff, 5); gl.name = 'light'; gl.position.y = 0.8; gl.fxu.x.x = 0.5; r.add(gl); },
    anim(P, t) { P.light[0].scale.setScalar(1 + 0.2 * Math.sin(t * 3)); P.light[0].fxu.o = 0.6; } },
};
const SUMTPL = new Map();
function makeSummon(kind, o) {
  const def = SUMMON[kind];
  let tpl = SUMTPL.get(kind);
  if (!tpl) { tpl = new THREE.Group(); tpl.name = 'summon:' + kind; def.build(tpl); tpl.traverse(c => { if (c.isMesh && !c.fxu) { c.castShadow = true; } }); SUMTPL.set(kind, tpl); }
  const obj = tpl.clone(true);
  // re-attach per-object FX uniforms (clone() does not copy them)
  const src = [], dst = []; tpl.traverse(c => src.push(c)); obj.traverse(c => dst.push(c));
  for (let i = 0; i < src.length; i++) { const s = src[i], d = dst[i]; d.userData = {}; for (const k in s.userData) d.userData[k] = s.userData[k];
    if (s.fxu) { d.fxu = fxu(); d.fxu.c.copy(s.fxu.c); d.fxu.c2.copy(s.fxu.c2); d.fxu.o = s.fxu.o; d.fxu.p = s.fxu.p; d.fxu.r = s.fxu.r; d.fxu.x.copy(s.fxu.x); d.fxu.tile.copy(s.fxu.tile); d.onBeforeRender = fxOBR; d.frustumCulled = false; } }
  const parts = {}; obj.traverse(c => { if (c.name) (parts[c.name] || (parts[c.name] = [])).push(c); });
  obj.userData.kind = kind; obj.userData.parts = parts;
  obj.userData.anim = def.anim ? (ob, t) => { ob.updateMatrixWorld(); def.anim(parts, t || 0, ob); } : () => {};
  if (o && o.scale) obj.scale.setScalar(o.scale);
  obj.userData.anim(obj, 0);
  return obj;
}

// ============================================================================================ grade (o.grade 1..10)
// tiers: 0 = 1-3, 1 = 4-6, 2 = 7-8, 3 = 9-10. Scale grows smoothly to 1.6x, particle counts by tier, and an overlay rig adds
// shock rings (tier>=1), a vertical ring + second shock + orbiting sparks (tier>=2), a light pillar + flare + star column (tier 3).
function gradeOf(o) { const g = Math.max(1, Math.min(10, +(o && o.grade) || 1)); return { g, tier: g <= 3 ? 0 : g <= 6 ? 1 : g <= 8 ? 2 : 3, gs: 1 + 0.6 * (g - 1) / 9 }; }
const TIER_N = [1, 1.6, 2.3, 3.2];
const GSPARK = { n: 10, tile: TL.spark, shape: 'sphere', spd: [2, 4], drag: 2.5, size: [0.16, 0.28], life: [0.4, 0.8], spin: 3 };
const GSTAR = { n: 8, add: false, tile: TL.star, shape: 'disc', rad: 0.6, up: [2, 4], drag: 1.5, size: [0.16, 0.26], life: [0.6, 1], spin: 4 };
function gradeRig(fx) {
  let p = fx.pools.get('grade'); let r = p && p.pop();
  if (!r) { r = { root: new THREE.Group() };
    r.s1 = fxMesh(G.ground(), fxMat('ring', {}), 4); r.s2 = fxMesh(G.ground(), fxMat('ring', { add: true }), 4); r.v1 = fxMesh(G.plane(), fxMat('ring', { bb: true, add: true }), 6);
    r.fl = glowSprite(0xffffff, 6); r.pil = fxMesh(xstrip(), fxMat('beam', { add: true }), 5); r.pil.rotation.x = -Math.PI / 2;
    r.orb = []; for (let i = 0; i < 8; i++) { const s = tileSprite(TL.spark, 0xffffff, true, 6); r.orb.push(s); r.root.add(s); }
    r.root.add(r.s1, r.s2, r.v1, r.fl, r.pil); }
  for (const c of r.root.children) c.visible = false;
  fx.root.add(r.root); return r;
}
function gradeFree(fx, e) { const r = e.gov; if (!r) return; fx.root.remove(r.root); let p = fx.pools.get('grade'); if (!p) fx.pools.set('grade', p = []); if (p.length < 32) p.push(r); e.gov = null; }
/** attach overlay: mode 'once' (burst/slash/beam), 'follow' (projectile/aura), 'area', 'tele' */
function gradeStart(fx, e, mode, R) {
  if (e.tier <= 0) return; e.gov = gradeRig(fx); e.gmode = mode; e.gR = R; e.gov.root.position.copy(e.gp || e.p);
  if (mode === 'once') { const c = e.col, x = e.gov.root.position; spray(fx, ext(GSPARK, { n: 6 * e.tier, y: 0.6 }), x.x, x.y, x.z, Math.min(1.6, R), _c2.copy(c).lerp(_c1.set(0xffffff), 0.4));
    if (e.tier >= 3) spray(fx, GSTAR, x.x, x.y, x.z, Math.min(1.5, R), c); }
}
function gradeTick(fx, e, dt) {
  const r = e.gov; if (!r) return; const T = e.tier, t = e.t, c = e.col, fl = SkillFx.reduceFlash ? 0.45 : 1, R = e.gR;
  if (e.gmode !== 'once') r.root.position.copy(e.gp || e.p);
  const ring = (m, u, rad, w, a, add) => { m.visible = u >= 0 && u < 1; if (!m.visible) return; const s = rad * 2 * (0.15 + 0.85 * easeOut(u)); m.scale.set(s, 1, s); m.position.y = 0.06; m.fxu.c.copy(c); m.fxu.x.set(0.86, w, 0.25, 0); m.fxu.o = (1 - u) * a; };
  if (e.gmode === 'once') {
    ring(r.s1, t / 0.55, R * 1.5, 0.07, 1); if (T >= 2) { ring(r.s2, (t - 0.12) / 0.5, R * 1.9, 0.05, 0.9 * fl);
      const u = t / 0.4; r.v1.visible = u < 1; if (r.v1.visible) { const s = Math.min(4.5, R * 2) * easeOut(u); r.v1.scale.set(s, s, 1); r.v1.position.y = 0.8; r.v1.fxu.c.copy(c); r.v1.fxu.x.set(0.86, 0.06, 0.1, 0); r.v1.fxu.o = (1 - u) * fl; } }
    if (T >= 3) { const u = t / 0.7; r.pil.visible = u < 1; r.fl.visible = u < 0.4;
      if (r.pil.visible) { r.pil.scale.set(Math.min(0.7, 0.32 * R) * (1 - u * 0.6), Math.min(0.7, 0.32 * R), 4 * easeOut(Math.min(1, u * 3))); r.pil.fxu.c.copy(c).lerp(_c1.set(0xffffff), 0.3); r.pil.fxu.x.set(0.35, 4, 6, 0.3); r.pil.fxu.t = t; r.pil.fxu.o = (1 - u) * fl; }
      if (r.fl.visible) { const v = u / 0.4; r.fl.position.y = 0.8; r.fl.scale.setScalar(Math.min(4, R * 2) * (0.6 + 0.6 * v) * (0.5 + 0.5 * fl)); r.fl.fxu.c.copy(c); r.fl.fxu.x.x = 1; r.fl.fxu.o = (1 - v) * fl; } }
    return;
  }
  const k = e.gk ?? 1;
  // persistent: orbiting sparks (tier>=2: 4, tier 3: 8), looping ground ring (tier>=1), faint pillar (tier 3)
  const no = T >= 3 ? 8 : T >= 2 ? 5 : 3, oy = e.gmode === 'follow' ? (e.cat === 'aura' ? e.h * 0.5 : 0) : 0.5;
  r.orb.forEach((s, i) => { s.visible = i < no; if (!s.visible) return; const a = t * (e.cat === 'proj' ? 9 : 2.2) + i / no * TAU, rr = e.cat === 'proj' ? 0.32 * e.sc : R * (e.gmode === 'area' || e.gmode === 'tele' ? 1 : 0.7);
    s.position.set(Math.cos(a) * rr, oy + Math.sin(t * 3 + i) * 0.08, Math.sin(a) * rr); s.scale.setScalar((e.cat === 'proj' ? 0.22 : 0.3) * (0.8 + 0.2 * Math.sin(t * 9 + i))); s.fxu.c.copy(c).lerp(_c1.set(0xffffff), 0.35); s.fxu.o = k; s.fxu.r = t * 3; });
  if (e.cat !== 'proj') { const rr = R * (e.gmode === 'follow' ? 1.5 : 1.05); ring(r.s1, (t % 0.9) / 0.9, rr, 0.07, 1.2 * k); if (T >= 2) ring(r.s2, ((t + 0.45) % 0.9) / 0.9, rr, 0.06, 0.9 * k * fl); }
  if (T >= 3 && e.cat !== 'proj') { r.pil.visible = true; const h = e.gmode === 'follow' ? e.h + 1.2 : 3.5; r.pil.scale.set(Math.min(0.6, R * 0.3), Math.min(0.6, R * 0.3), h); r.pil.position.y = 0; r.pil.fxu.c.copy(c); r.pil.fxu.x.set(0.25, 3, 2, 0.35); r.pil.fxu.t = t; r.pil.fxu.o = (0.35 + 0.1 * Math.sin(t * 4)) * k * fl;
    if (Math.random() < dt * 10) { const p = r.root.position; spray(fx, ext(GSTAR, { n: 1, rad: R * 0.6, up: [0.8, 1.6] }), p.x, p.y, p.z, 1, c); } }
}
const _ks = (o) => Object.keys(o).filter(k => k[0] !== '_');
export const FX_KINDS = { projectile: _ks(PROJ), burst: _ks(BURST), slash: _ks(SLASH), beam: _ks(BEAM), area: _ks(AREA), aura: _ks(AURA), summon: _ks(SUMMON) };

// ============================================================================================ public class
const GENERIC = {
  burst: { dur: 0.8, col: 0xfff0c0, L: [{ type: 'flash', col: 0xffffff, size: 1.4, dur: 0.2 }, { type: 'shock', col: 0xfff0c0, r: 1.1, dur: 0.4, w: 0.08 }], P: [ext(P.sparkle, { n: 12 }), ext(P.dustRing, { n: 6 })] },
};
let _uid = 0;
const ZP = { x: 0, y: 0, z: 0 };
export class SkillFx {
  constructor(scene) {
    this.scene = scene; this.root = new THREE.Group(); this.root.name = 'SkillFx'; scene.add(this.root);
    this.pa = new Particles(4000, true); this.pn = new Particles(2500, false);
    this.root.add(this.pn.mesh, this.pa.mesh);
    this.live = []; this.pools = new Map(); this.time = 0;
    this.shatter = new ShatterFx(this.root); this.shatter.load();             // broken-ground meshes load in the background
    this.sal = new SalFx(this.root); this.sal.load();                         // 일격참 '살' thrust meshes (js/salfx.js)
    /** optional camera-shake hook: (amplitude, duration) => void. Suppressed when SkillFx.reduceFlash. */
    this.onShake = null;
  }
  shake(a, d) { if (!SkillFx.reduceFlash && this.onShake) this.onShake(a, d); }
  // ------------------------------------------------------------------------------------ internals
  _rig(cat, kind, def, build) {
    const key = cat + ':' + kind; let p = this.pools.get(key);
    let rig = p && p.pop();
    if (!rig) {
      rig = { key, root: new THREE.Group(), L: def.L || [], ms: [] };
      for (const L of rig.L) { const m = mkLayer(L); rig.ms.push(m); rig.root.add(m); }
      if (build) build(rig, def);
    }
    rig.root.position.set(0, 0, 0); rig.root.rotation.set(0, 0, 0); rig.root.scale.set(1, 1, 1); rig.root.visible = true;
    this.root.add(rig.root); return rig;
  }
  _new(cat, kind, def, o) {
    const e = { id: ++_uid, cat, kind, def, o, t: 0, lt: 0, tk: 1, dur: 0, sc: 1, p: new THREE.Vector3(), dx: 0, dz: 1, tint: o.color !== undefined && o.color !== null ? hexC(o.color) : null, col: null, done: 0, acc: 0, dead: false, fade: -1, rig: null };
    e.col = e.tint || hexC(def.col ?? 0xffffff);
    const gr = gradeOf(o); e.g = gr.g; e.tier = gr.tier; e.gs = gr.gs; e.nMul = TIER_N[gr.tier]; e.rateMul = TIER_N[gr.tier]; e.gov = null;
    return e;
  }
  _emitDue(e, dt) {
    const Ps = e.def.P; if (!Ps) return;
    for (let i = 0; i < Ps.length; i++) {
      const sp = Ps[i], at = sp.at || 0;
      if (sp.rate) { if (e.lt >= at && e.lt <= (sp.until ?? 1e9)) spray(this, sp, e.p.x, e.p.y, e.p.z, e.sc, e.tint, e.dx, e.dz, sp.rate * dt * gradeMul(sp, e)); continue; }
      if (!(e.done & (1 << i)) && e.lt >= at) { e.done |= 1 << i; spray(this, sp, e.p.x, e.p.y, e.p.z, e.sc, e.tint, e.dx, e.dz, (sp.n ?? 10) * gradeMul(sp, e)); }
    }
  }
  _layers(e) { const r = e.rig; if (!r) return; for (let i = 0; i < r.L.length; i++) animLayer(r.ms[i], r.L[i], e); }
  _add(e) { this.live.push(e); return e; }
  _release(e) {
    if (e.def.stop) e.def.stop(e, this);
    const r = e.rig; if (r) { this.root.remove(r.root); if (r.extra) for (const m of r.extra) m.removeFromParent(); let p = this.pools.get(r.key); if (!p) this.pools.set(r.key, p = []); if (p.length < 24) p.push(r); else disposeRig(r); }
    gradeFree(this, e); e.rig = null; e.dead = true;
  }
  // ------------------------------------------------------------------------------------ frame
  update(dt) {
    dt = Math.min(Math.max(dt, 0), 0.1); this.time += dt;
    this.shatter.update(dt); this.sal.update(dt);
    const L = this.live;
    for (let i = 0; i < L.length; i++) {
      const e = L[i]; e.t += dt; e.lt = e.t * e.tk;
      let alive = !e.dead && TICK[e.cat](this, e, dt) !== false;
      if (alive && e.gov) gradeTick(this, e, dt);
      if (alive && e.dur > 0 && e.t >= e.dur) alive = false;
      if (!alive) { if (!e.dead) this._release(e); L[i] = L[L.length - 1]; L.pop(); i--; }
    }
    this.pa.update(dt); this.pn.update(dt);
  }
  clear() { this.shatter.clear(); this.sal.clear(); for (const e of this.live) if (!e.dead) this._release(e); this.live.length = 0; this.pa.clear(); this.pn.clear(); }
  /** remove from scene and free pooled rigs (shared caches stay) */
  dispose() { this.clear(); for (const p of this.pools.values()) for (const r of p) disposeRig(r); this.pools.clear(); this.root.removeFromParent(); this.pa.geo.dispose(); this.pn.geo.dispose(); this.pa.mat.dispose(); this.pn.mat.dispose(); }

  // ------------------------------------------------------------------------------------ one-shots
  burst(kind, pos, o = {}) { o = o || {};
    const def = BURST[kind] || GENERIC.burst, e = this._new('burst', kind in BURST ? kind : '_generic', def, o);
    e.dur = o.duration > 0 ? o.duration : def.dur; e.tk = def.dur / e.dur; e.sc = (o.radius ?? 1) * e.gs; gp(pos || ZP, e.p);
    e.rig = this._rig('burst', e.kind, def, def.build); e.rig.root.position.copy(e.p);
    e.rig.ms.forEach((m, i) => startLayer(m, e.rig.L[i], e)); if (def.start) def.start(e, this);
    this._emitDue(e, 0); this._layers(e); gradeStart(this, e, 'once', e.sc);
    if (def.shake) this.shake(def.shake[0] * Math.min(2, e.sc), def.shake[1]);
    return this._add(e);
  }
  slash(kind, pos, dir, o = {}) { o = o || {};
    const def = SLASH[kind] || SLASH.arc, e = this._new('slash', kind in SLASH ? kind : 'arc', def, o);
    e.dur = o.duration > 0 ? o.duration : def.dur; e.tk = def.dur / e.dur; e.sc = 1; gp(pos || ZP, e.p);
    const d = dir || { x: 0, z: 1 }, m = Math.hypot(d.x || 0, d.z || 0) || 1; e.dx = (d.x || 0) / m; e.dz = -(d.z ?? 1) / m;
    e.R = o.radius ?? def.radius ?? 1.6; e.A = o.angle ?? def.angle ?? 100; e.len = o.length ?? def.length ?? e.R; e.wid = o.width ?? def.width ?? 0.5; e.R *= e.gs; e.len *= e.gs; e.wid *= e.gs;
    e.rig = this._rig('slash', e.kind + (def.keyFn ? def.keyFn(e) : ''), def, def.build);
    e.rig.root.position.copy(e.p); e.rig.root.rotation.y = Math.atan2(e.dx, e.dz); e.rig.root.scale.x = o.mirror ? -1 : 1;   // mirror = swing the other way
    e.rig.ms.forEach((m, i) => startLayer(m, e.rig.L[i], e)); if (def.start) def.start(e, this);
    this._emitDue(e, 0); TICK.slash(this, e, 0); e.gp = new THREE.Vector3(e.p.x + e.dx * e.R * 0.5, e.p.y, e.p.z + e.dz * e.R * 0.5); gradeStart(this, e, 'once', e.R * 0.6);
    if (def.shake) this.shake(def.shake[0], def.shake[1]);
    return this._add(e);
  }
  beam(kind, from, to, o = {}) { o = o || {};
    const def = BEAM[kind] || BEAM.laser, e = this._new('beam', kind in BEAM ? kind : 'laser', def, o);
    e.dur = o.duration > 0 ? o.duration : def.dur; e.tk = def.dur / e.dur; e.w = (o.width ?? 0.3) * e.gs;
    e.a = gp(from || ZP, new THREE.Vector3()); e.b = gp(to || from || ZP, new THREE.Vector3()); e.p.copy(e.a);
    _v1.subVectors(e.b, e.a); e.L = Math.max(0.01, _v1.length()); _v1.y = 0; const hl = _v1.length() || 1; e.dx = _v1.x / hl; e.dz = _v1.z / hl;
    e.rig = this._rig('beam', e.kind, def, def.build);
    e.rig.ms.forEach((m, i) => startLayer(m, e.rig.L[i], e)); if (def.start) def.start(e, this);
    TICK.beam(this, e, 0); e.gp = e.b; gradeStart(this, e, 'once', 0.8);
    if (def.shake) this.shake(def.shake[0], def.shake[1]);
    return this._add(e);
  }
  // ------------------------------------------------------------------------------------ tracked
  projectile(kind, o = {}) { o = o || {};
    const def = PROJ[kind] || PROJ._generic, k = kind in PROJ ? kind : '_generic', e = this._new('proj', k, def, o);
    e.dur = o.duration > 0 ? o.duration : 0; e.sc = (o.scale ?? 1) * e.gs; e.has = false; e.last = new THREE.Vector3(); e.dir = new THREE.Vector3(0, 0, 1); e.dist = 0;
    e.rig = this._rig('proj', k + (e.tint ? '#' + e.tint.getHexString() : ''), def, (rig) => buildProj(rig, def, e.tint));
    e.rig.root.visible = false; e.rig.root.scale.setScalar(e.sc); projStart(e, this); gradeStart(this, e, 'follow', 0.4);
    this._add(e);
    const fx = this;
    return {
      obj: e.rig.root,
      set(pos, dir) { if (e.dead || !pos) return; gp(pos, e.p); if (dir) { e.dir.set(dir.x || 0, dir.y || 0, -(dir.z || 0)); if (e.dir.lengthSq() < 1e-8) e.dir.set(0, 0, 1); e.dir.normalize(); }
        if (!e.has) { e.last.copy(e.p); e.has = true; } const r = e.rig.root; r.visible = true; r.position.copy(e.p); r.quaternion.setFromUnitVectors(ZA, e.dir); },
      dispose() { if (!e.dead) { fx._release(e); } },
      get alive() { return !e.dead; },
    };
  }
  area(kind, pos, radius, o = {}) { o = o || {};
    const def = AREA[kind] || AREA._generic, k = kind in AREA ? kind : '_generic', e = this._new('area', k, def, o);
    e.dur = 0; e.life = o.duration > 0 ? o.duration : 0; e.r = radius || 2; e.pulseT = 9; gp(pos || ZP, e.p);
    e.rig = this._rig('area', k, def, (rig) => buildArea(rig, def)); e.rig.root.position.copy(e.p); areaStart(e, this); gradeStart(this, e, 'area', e.r);
    this._add(e);
    return {
      setRadius(r) { e.r = Math.max(0.1, +r || 0.1); e.gR = e.r; areaLayout(e); }, setPos(p) { if (!p) return; gp(p, e.p); if (e.rig) e.rig.root.position.copy(e.p); },
      pulse() { e.pulseT = 0; }, dispose() { if (e.fade < 0 && !e.dead) e.fade = 0; }, get alive() { return !e.dead; },
    };
  }
  aura(kind, getPos, o = {}) { o = o || {};
    const def = AURA[kind] || AURA._generic, k = kind in AURA ? kind : '_generic', e = this._new('aura', k, def, o);
    e.dur = 0; e.life = o.duration > 0 ? o.duration : 0; e.get = typeof getPos === 'function' ? getPos : null; e.h = o.height ?? 1.6; e.stacks = def.stacks0 ?? 1;
    const p0 = e.get && e.get(); if (p0) gp(p0, e.p); else if (getPos && typeof getPos === 'object') gp(getPos, e.p);
    e.rig = this._rig('aura', k + (e.tint && def.tintKey ? '#' + e.tint.getHexString() : ''), def, (rig) => buildAura(rig, def, e)); e.rig.root.position.copy(e.p); e.rig.root.scale.setScalar(1 + (e.gs - 1) * 0.5); auraStart(e, this); gradeStart(this, e, 'follow', 0.6);
    this._add(e);
    return { setStacks(n) { e.stacks = n; if (def.stacks && e.rig) def.stacks(e, n); }, dispose() { if (e.fade < 0 && !e.dead) e.fade = 0; }, get alive() { return !e.dead; } };
  }
  summonModel(kind, o = {}) { o = o || {}; return makeSummon(kind in SUMMON ? kind : '_generic', o); }
  telegraph(pos, radius, duration, o = {}) { o = o || {};
    const def = TELE, e = this._new('tele', 'tele', def, o); e.dur = Math.max(0.05, duration || 1); e.r = radius || 2; gp(pos || ZP, e.p);
    e.shape = o.shape === 'line' ? 1 : 0;
    if (e.shape) { const d = o.dir || { x: 0, z: 1 }, m = Math.hypot(d.x || 0, d.z || 0) || 1; e.dx = (d.x || 0) / m; e.dz = -(d.z ?? 1) / m; e.len = o.length ?? radius ?? 6; e.wid = o.width ?? 1.5; }
    e.col = e.tint || hexC(0xff4a3a);
    e.rig = this._rig('tele', e.shape ? 'line' : 'circle', def, (rig) => { rig.m = fxMesh(G.ground(), fxMat('tele', { add: false }), 3); rig.edge = fxMesh(G.ground(), fxMat('ring', {}), 4); rig.root.add(rig.m, rig.edge); });
    const r = e.rig; r.root.position.copy(e.p).y += 0.045;
    if (e.shape) { r.root.rotation.y = Math.atan2(e.dx, e.dz); r.m.scale.set(e.wid, 1, e.len); r.m.position.set(0, 0, e.len / 2); r.m.rotation.y = Math.PI; r.edge.visible = false; }
    else { r.m.scale.set(e.r * 2, 1, e.r * 2); r.m.position.set(0, 0, 0); r.m.rotation.y = 0; r.edge.visible = true; r.edge.scale.set(e.r * 2, 1, e.r * 2); }
    e.gp = e.shape ? new THREE.Vector3(e.p.x + e.dx * e.len / 2, e.p.y, e.p.z + e.dz * e.len / 2) : e.p; gradeStart(this, e, 'tele', e.shape ? e.wid * 0.6 : e.r);
    TICK.tele(this, e, 0); this._add(e);
    const fx = this; return { dispose() { if (!e.dead) fx._release(e); }, get alive() { return !e.dead; } };
  }
}
SkillFx.reduceFlash = false;
const TELE = { L: [] };
function disposeRig(r) { r.root.traverse(o => { if (o.strip) { putStrip(o.strip); } }); }

// ------------------------------------------------------------------------------------------ per-category ticks
const TICK = {
  burst(fx, e, dt) { fx._emitDue(e, dt); fx._layers(e); if (e.def.tick) e.def.tick(e, dt, fx); },
  slash(fx, e, dt) { fx._emitDue(e, dt); fx._layers(e); if (e.def.tick) e.def.tick(e, dt, fx); },
  beam(fx, e, dt) { fx._emitDue(e, dt); fx._layers(e); if (e.def.tick) e.def.tick(e, dt, fx); },
  proj(fx, e, dt) { return projTick(e, dt, fx); },
  area(fx, e, dt) { return areaTick(e, dt, fx); },
  aura(fx, e, dt) { return auraTick(e, dt, fx); },
  tele(fx, e, dt) {
    const r = e.rig, u = clamp01(e.t / e.dur), f = r.m.fxu;
    f.c.copy(e.col); f.p = e.shape ? u : u; f.t = e.t; f.o = 0.9 * (u > 0.97 ? 1 - (u - 0.97) / 0.03 * 0.5 : 1);
    f.x.set(e.shape ? e.wid : 1, e.shape ? e.len : 1, 0, e.shape);
    if (!e.shape) { const ef = r.edge.fxu; ef.c.copy(e.col); ef.x.set(0.96, 0.03, 0, 0); ef.o = 0.6 + 0.4 * Math.sin(e.t * 12) * (u > 0.7 ? 1 : 0.3); }
  },
};

/** grade multiplier for particle counts: full for small sparks, damped for large (fill-rate heavy) puffs */
function gradeMul(sp, e) { const m = e.nMul || 1; if (m === 1) return 1; const s = (Array.isArray(sp.size) ? sp.size[1] : sp.size ?? 0.3) * (sp.grow ?? 1) * e.sc; return s > 0.9 ? 1 + (m - 1) * 0.25 : m; }
