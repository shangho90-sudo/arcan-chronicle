// Warp gate between zones (from the user's reference: glowing blue rune ring on the ground, swirling vortex inside,
// soft light columns, two spiral ribbons rising, sparkles). Built from shaders + additive meshes, animated per frame.
import { THREE, T } from './render.js';

const ADD = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false };

function ringTexture() {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), m = S / 2;
  g.translate(m, m);
  const glow = (r, w, col, blur) => { g.save(); g.shadowColor = col; g.shadowBlur = blur; g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); g.restore(); };
  glow(232, 16, 'rgba(70,170,255,1)', 30); glow(232, 6, '#e8fbff', 10);
  glow(196, 10, 'rgba(60,150,255,0.95)', 20); glow(196, 3, '#ffffff', 6);
  // dotted band between the rings
  g.fillStyle = '#eaffff';
  for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2; g.beginPath(); g.arc(Math.cos(a) * 214, Math.sin(a) * 214, i % 3 ? 3 : 5, 0, Math.PI * 2); g.fill(); }
  // four diamond studs + points
  for (let i = 0; i < 4; i++) {
    g.save(); g.rotate(i * Math.PI / 2); g.translate(0, -214);
    g.shadowColor = '#60c8ff'; g.shadowBlur = 20; g.fillStyle = '#3aa8ff';
    g.beginPath(); g.moveTo(0, -30); g.lineTo(22, 0); g.lineTo(0, 30); g.lineTo(-22, 0); g.closePath(); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(0, -14); g.lineTo(10, 0); g.lineTo(0, 14); g.lineTo(-10, 0); g.closePath(); g.fill();
    g.restore();
  }
  for (let i = 0; i < 4; i++) {
    g.save(); g.rotate(Math.PI / 4 + i * Math.PI / 2); g.translate(0, -238);
    g.shadowColor = '#80d8ff'; g.shadowBlur = 14; g.fillStyle = '#d8f6ff'; g.beginPath(); g.moveTo(0, -18); g.lineTo(6, 4); g.lineTo(-6, 4); g.closePath(); g.fill(); g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function sparkTexture() {
  const S = 64, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), m = S / 2;
  const rg = g.createRadialGradient(m, m, 0, m, m, m); rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.25, 'rgba(150,220,255,0.8)'); rg.addColorStop(1, 'rgba(60,140,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, S, S);
  g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(m, 2); g.lineTo(m + 5, m); g.lineTo(m, S - 2); g.lineTo(m - 5, m); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(2, m); g.lineTo(m, m - 4); g.lineTo(S - 2, m); g.lineTo(m, m + 4); g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
let RING = null, SPARK = null;

const vortexFS = `uniform float time; varying vec2 vUv;
void main(){
  vec2 p = vUv * 2.0 - 1.0; float r = length(p); if (r > 1.0) discard;
  float a = atan(p.y, p.x);
  float sw = sin(a * 2.0 - r * 9.0 + time * 2.4) * 0.5 + 0.5;          // two-armed spiral
  float sw2 = sin(a * 3.0 - r * 14.0 + time * 3.1) * 0.5 + 0.5;
  float core = smoothstep(0.35, 0.0, r) * 0.6;
  float edge = smoothstep(1.0, 0.85, r);
  float v = (pow(max(sw, 0.0), 3.0) * 0.8 + pow(max(sw2, 0.0), 6.0) * 0.4) * (0.35 + 0.65 * r) + core * 0.9;
  vec3 col = mix(vec3(0.20, 0.50, 1.0), vec3(0.85, 0.97, 1.0), clamp(v, 0.0, 1.0));
  gl_FragColor = vec4(col * (0.35 + v) * 0.75, (0.25 + v * 0.75) * edge);
}`;
const beamFS = `uniform float time; uniform float seed; varying vec2 vUv;
void main(){
  float x = abs(vUv.x - 0.5) * 2.0;
  float fall = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 1.6) * smoothstep(0.0, 0.06, vUv.y);
  float flick = 0.75 + 0.25 * sin(time * 3.0 + seed * 7.0 + vUv.y * 6.0);
  float a = max(0.0, 1.0 - x * x) * fall * flick;
  gl_FragColor = vec4(vec3(0.55, 0.78, 1.0) * a, a * 0.55);
}`;
const ribbonFS = `uniform float time; uniform float seed; varying vec2 vUv;
void main(){
  float x = abs(vUv.x - 0.5) * 2.0;
  float flow = fract(vUv.y * 1.5 - time * 0.6 + seed);
  float a = max(0.0, 1.0 - x) * smoothstep(0.0, 0.1, vUv.y) * smoothstep(1.0, 0.55, vUv.y) * (0.55 + 0.45 * smoothstep(0.0, 0.5, flow) * smoothstep(1.0, 0.5, flow));
  vec3 col = mix(vec3(0.45, 0.75, 1.0), vec3(1.0), pow(clamp(1.0 - x, 0.0, 1.0), 3.0));
  gl_FragColor = vec4(col * a * 1.4, a);
}`;
const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

/** spiral ribbon strip rising around the axis */
function ribbon(R, H, turns, phase) {
  const n = 80, P = [], U = [], I = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = phase + t * turns * Math.PI * 2, r = R * (1 - 0.35 * t), w = 0.12 * (1 - t * 0.7), y = 0.15 + t * H;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r, tx = -Math.sin(a), tz = Math.cos(a);
    P.push(cx - tx * w * 0.2, y - w, cz - tz * w * 0.2, cx + tx * w * 0.2, y + w, cz + tz * w * 0.2); U.push(0, t, 1, t);
    if (i < n) { const k = i * 2; I.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I);
  return g;
}

export class Warp {
  /** pos in game (Unity) coords, radius in metres */
  constructor(scene, pos, radius = 1.8) {
    if (!RING) { RING = ringTexture(); SPARK = sparkTexture(); }
    this.root = new THREE.Group(); this.root.position.copy(T({ x: pos.x, y: (pos.y || 0) + 0.04, z: pos.z })); scene.add(this.root);
    this.u = { time: { value: Math.random() * 10 } };
    const R = radius;
    // ground rune ring (slowly turning) + inner vortex
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(R * 2.3, R * 2.3), new THREE.MeshBasicMaterial({ map: RING, ...ADD, blending: THREE.NormalBlending }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.03; this.root.add(this.ring);
    this.vortex = new THREE.Mesh(new THREE.CircleGeometry(R * 0.92, 48), new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: VS, fragmentShader: vortexFS, ...ADD }));
    this.vortex.rotation.x = -Math.PI / 2; this.vortex.position.y = 0.02; this.root.add(this.vortex);
    // soft light columns (crossed planes, always readable from the fixed camera)
    this.beams = [];
    for (let i = 0; i < 4; i++) {
      const w = R * (i < 2 ? 1.7 : 0.8), h = 3.6 + i * 0.5;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.ShaderMaterial({ uniforms: { time: this.u.time, seed: { value: i } }, vertexShader: VS, fragmentShader: beamFS, ...ADD }));
      m.position.y = h / 2; m.rotation.y = i * Math.PI / 4 + Math.PI / 8; this.root.add(m); this.beams.push(m);
    }
    // two spiral ribbons
    this.ribbons = new THREE.Group(); this.root.add(this.ribbons);
    for (let i = 0; i < 2; i++) this.ribbons.add(new THREE.Mesh(ribbon(R * 0.8, 3.4, 1.15, i * Math.PI), new THREE.ShaderMaterial({ uniforms: { time: this.u.time, seed: { value: i * 0.5 } }, vertexShader: VS, fragmentShader: ribbonFS, ...ADD })));
    // sparkles drifting up
    const N = 40, P = new Float32Array(N * 3); this.sp = [];
    for (let i = 0; i < N; i++) this.sp.push({ a: Math.random() * 6.28, r: R * (0.3 + Math.random() * 0.9), y: Math.random() * 4, v: 0.4 + Math.random() * 0.7 });
    this.pg = new THREE.BufferGeometry(); this.pg.setAttribute('position', new THREE.BufferAttribute(P, 3));
    this.points = new THREE.Points(this.pg, new THREE.PointsMaterial({ map: SPARK, size: 0.32, sizeAttenuation: true, ...ADD }));
    this.points.frustumCulled = false; this.root.add(this.points);
    this.light = new THREE.PointLight(0x66b8ff, 2.5, R * 3.5, 1.8); this.light.position.y = 0.8; this.root.add(this.light);
    this.root.traverse(o => { if (o.isMesh || o.isPoints) o.renderOrder = 4; });
    this.ring.renderOrder = 3; this.vortex.renderOrder = 3;
    this.R = R;
  }
  update(dt) {
    const t = (this.u.time.value += dt);
    this.ring.rotation.z = t * 0.15;
    this.ribbons.rotation.y = -t * 0.8;
    const p = this.pg.attributes.position;
    for (let i = 0; i < this.sp.length; i++) {
      const s = this.sp[i]; s.y += s.v * dt; s.a += dt * 0.5; if (s.y > 4.2) { s.y = 0.1; s.r = this.R * (0.3 + Math.random() * 0.9); }
      p.setXYZ(i, Math.cos(s.a) * s.r, s.y, Math.sin(s.a) * s.r);
    }
    p.needsUpdate = true;
    this.light.intensity = 2.2 + Math.sin(t * 2.3) * 0.5;
  }
  dispose() {
    this.root.parent && this.root.parent.remove(this.root);
    this.root.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }
}
