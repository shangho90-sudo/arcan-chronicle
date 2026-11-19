// 하이브리드 그래픽 리마스터 파일럿 (2026-11-19, 사용자 사양 /home/claude/queue/remaster.md 1~5단계).
// 품질 설정(js/gfxq.js: settings.gfxQuality 'high' | 'medium' | 'low')에 따라:
//  - 아르칸 분수 광장 한 구역(반지름 PLAZA.R)만 배경 리마스터 — buildPlazaRemaster:
//      접촉 그늘(분수 계단 둘레 고리·가로등·벤치·화단·나무·덤불 밑 부드러운 어둠), 가로등 밑 따뜻한 빛 웅덩이,
//      돌 틈·화단·계단 가장자리에 바람에 흔들리는 풀 포기, 작은 조약돌·낙엽, (바닥 재질은 town3d.js groundVary 'rm' 코드,
//      분수 물 빛 무늬는 town3d.js fountainMats uRm)
//  - 캐릭터 재질 구분: render.js paintMat({remaster}) — 지금은 약사 남녀(model.js REMASTER_MODELS)
//  - 약병폭격 5단계: flaskfx.js rain*
// 'low' = 예전 모습 그대로(장식은 숨김, 셰이더 코드는 들어가지 않음). 모든 장식은 종류마다 InstancedMesh 하나(draw call 6개 이하),
// 그림자를 드리우지 않고(받기만) 충돌·길찾기·NPC 자리와 무관. 난수는 고정 씨앗 mulberry(배치가 늘 같음 — 게임 Math.random 안 씀).
import * as THREE from 'three';
import { T } from './render.js';
import { gfxQ, gfxOn, RM_K, rmK } from './gfxq.js';
import { RM_U, rmMaterials } from './town3d.js';

export const PLAZA = {
  R: 22,                         // 리마스터 구역 반지름 m (분수 중심 0,0)
  fountainR: 5.6,                // 분수 바깥 계단 가장자리 (충돌 원 5.3)
  ao: { a: 0.56, col: [0.15, 0.09, 0.19] },  // 접촉 그늘 진하기·색 (어두운 보라 갈색 — 검정 아님; 2026-11-19 6단계: 0.4 → 0.56, 게임 거리에서 보이게)
  pool: { a: 0.2, col: [1.0, 0.72, 0.42], r: 2.4 },   // 가로등 빛 웅덩이 (가산, 블룸 문턱 아래)
  grass: 7000, pebble: 900, leaf: 500,                 // 마을 전체 상한, 높음 기준 (보통 = 절반)
  haze: 0.05,                   // 높음일 때만 더하는 대기 원근(화면 위쪽 옅은 보라) — 과하지 않게
};
const mulberry = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const WIND = { value: 0 };

function canvas(n, draw) { const c = document.createElement('canvas'); c.width = c.height = n; draw(c.getContext('2d'), n); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
// grass tuft card: 9~13 tapered blades from the bottom centre, dark root -> light tips (alpha cut)
const grassTex = () => canvas(128, (g, n) => {
  const r = mulberry(11);
  for (let i = 0; i < 13; i++) {
    const x0 = n * (0.32 + r() * 0.36), lean = (r() - 0.5) * n * 0.55, h = n * (0.45 + r() * 0.5), w = n * (0.028 + r() * 0.03);
    const gr = g.createLinearGradient(0, n, 0, n - h); gr.addColorStop(0, '#4f7f34'); gr.addColorStop(0.5, '#86b84a'); gr.addColorStop(1, '#d4ec88');
    g.fillStyle = gr; g.beginPath(); g.moveTo(x0 - w, n); g.quadraticCurveTo(x0 - w * 0.4 + lean * 0.4, n - h * 0.55, x0 + lean, n - h); g.quadraticCurveTo(x0 + w * 0.4 + lean * 0.4, n - h * 0.55, x0 + w, n); g.fill();
  }
});
const leafTex = () => canvas(64, (g, n) => {
  g.translate(n / 2, n / 2); g.rotate(0.6);
  const gr = g.createLinearGradient(-n * 0.4, 0, n * 0.4, 0); gr.addColorStop(0, '#9a5a24'); gr.addColorStop(1, '#d8a04a');
  g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, n * 0.4, n * 0.17, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(90,50,20,.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(-n * 0.38, 0); g.lineTo(n * 0.38, 0); g.stroke();
});

// soft radial decal (normal blend dark = contact shade; additive warm = lamp pool). uRing: 0 disc, else inner radius (0..1) of a ring
const DECAL_VS = `varying vec2 vU; void main(){ vU = uv * 2. - 1.;
#ifdef USE_INSTANCING
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.);
#else
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
#endif
}`;
const DECAL_FS = `uniform vec3 uC; uniform float uA, uRing, uAdd; varying vec2 vU;
void main(){ float r = length(vU);
  float k = uRing > 0. ? smoothstep(uRing - .04, uRing + .02, r) * (1. - smoothstep(uRing + .02, 1., r)) * (1. - smoothstep(uRing + .02, 1., r)) : pow(1. - smoothstep(0., 1., r), 1.6);
  if (k < .004) discard;
  gl_FragColor = uAdd > .5 ? vec4(uC * k * uA, 1.) : vec4(uC, k * uA); }`;
function decalMat(col, a, add = false, ring = 0) {
  return new THREE.ShaderMaterial({ uniforms: { uC: { value: new THREE.Color(...col) }, uA: { value: a }, uRing: { value: ring }, uAdd: { value: add ? 1 : 0 } }, vertexShader: DECAL_VS, fragmentShader: DECAL_FS,
    transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
}

// box decal (rounded-rect contact shade under houses / walls / landmarks / stalls): per-instance aIn = the footprint's half size as
// a fraction of the decal's half size, so the soft falloff starts at the real wall line and runs ~1 m out whatever the size
const BOX_VS = `attribute vec2 aIn; varying vec2 vU, vIn; void main(){ vU = uv * 2. - 1.; vIn = aIn;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.); }`;
const BOX_FS = `uniform vec3 uC; uniform float uA; varying vec2 vU, vIn;
void main(){ vec2 q = clamp((abs(vU) - vIn) / max(1. - vIn, vec2(1e-3)), 0., 1.);
  float k = (1. - q.x) * (1. - q.y); k = k * k * (3. - 2. * k); if (k < .004) discard; gl_FragColor = vec4(uC, k * uA); }`;
function boxMat(col, a) {
  return new THREE.ShaderMaterial({ uniforms: { uC: { value: new THREE.Color(...col) }, uA: { value: a } }, vertexShader: BOX_VS, fragmentShader: BOX_FS,
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
}
// point in polygon (game x, z)
const inPoly = (x, z, pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, zi] = pts[i], [xj, zj] = pts[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };

/** 2026-11-19 리마스터 6단계: 마을 전체(9곳 모두) — buildPlazaRemaster의 광장 장식을 마을 사양 전체로 넓힘.
 *  spec = zone town3d spec. 종류마다 InstancedMesh 하나: 둥근 접촉 그늘(가로등·나무·덤불·벤치·깃발·노점·화단·통·상자·우물·수레·탑),
 *  네모 접촉 그늘(집·성벽 안팎·랜드마크·성문), 분수 계단 그늘 고리(아르칸), 가로등 빛 웅덩이, 흔들리는 풀 포기(성벽 안쪽 밑·집 옆과
 *  뒤 벽 밑·랜드마크 둘레·가로등·나무·화단·벤치 밑·공원 잔디 안), 조약돌, 낙엽. 그림자는 받기만, 충돌·길찾기·NPC 자리와 무관.
 *  난수는 고정 씨앗(배치가 늘 같음). 높음 = 전부, 보통 = 풀·조약돌·낙엽 절반 + 그늘 조금 옅게. Returns { group, update(dt), setLevel(q) } */
export function buildTownRemaster(spec, opts = {}) {
  const grp = new THREE.Group(); grp.name = 'town_remaster';
  const rnd = mulberry(opts.seed || 1919), DEG = Math.PI / 180;
  const [x0, z0, x1, z1] = spec.ground.inner, inside = (x, z, m = 0.4) => x > x0 + m && x < x1 - m && z > z0 + m && z < z1 - m;
  const C = { x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
  const bl = spec.blprops || [], decor = spec.decor || [], houses = spec.houses || [], models = spec.models || [], walls = spec.walls || [], towers = spec.towers || [];
  const gates = spec.gates || (spec.gate ? [spec.gate] : []);
  const roads = (spec.ground.roads || []).filter(r => r.kind !== 'ring');
  const onRoad = (x, z) => roads.some(p => p.pts.some((a, i) => { const b = p.pts[i + 1]; if (!b) return false;
    const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
    return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) < p.w / 2 + 0.25; }));
  const nearGate = (x, z, pad = 1.2) => gates.some(g => Math.hypot(x - g.pos[0], z - g.pos[1]) < (g.w || 5) / 2 + (g.tr || 2) + pad);
  const lamps = [...(spec.lanterns || []).map(p => ({ x: p[0], z: p[1], r: 0.95 })), ...bl.filter(b => b.model === 'town_lamp').map(b => ({ x: b.pos[0], z: b.pos[1], r: 0.7 }))];
  // ---- round contact shade
  const blobs = [];
  for (const l of lamps) blobs.push({ x: l.x, z: l.z, sx: l.r * 1.6, sz: l.r * 1.6, a: 0 });
  for (const b of bl) {
    const s = b.scale || 1, a = -(b.rot || 0) * DEG;
    if (b.model === 'town_bench') blobs.push({ x: b.pos[0], z: b.pos[1], sx: 1.35 * s, sz: 0.62 * s, a });
    else if (/^tree/.test(b.model)) blobs.push({ x: b.pos[0], z: b.pos[1], sx: 1.7 * s, sz: 1.7 * s, a: 0, tree: true });
    else if (/^shrub/.test(b.model)) blobs.push({ x: b.pos[0], z: b.pos[1], sx: 1.05 * s, sz: 1.05 * s, a: 0, tree: true });
    else if (b.model === 'town_banner') blobs.push({ x: b.pos[0], z: b.pos[1], sx: 0.45, sz: 0.45, a: 0 });
  }
  for (const d of decor) {
    if (d.type === 'stall') continue;   // box below
    const r = d.r || ({ well: 1.3, cart: 1.4, hay: 1.0, barrels: 0.8, crates: 0.8, planter: 1, scarecrow: 0.5 }[d.type] || 0.8);
    blobs.push({ x: d.pos[0], z: d.pos[1], sx: r + 0.55, sz: r + 0.55, a: 0, base: d.type === 'planter' || d.type === 'well' });
  }
  for (const t of towers) blobs.push({ x: t.pos[0], z: t.pos[1], sx: t.r + 1.1, sz: t.r + 1.1, a: 0 });
  const plane = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const aoM = decalMat(PLAZA.ao.col, PLAZA.ao.a);
  const ao = new THREE.InstancedMesh(plane, aoM, Math.max(1, blobs.length));
  blobs.forEach((b, i) => { q.setFromEuler(e.set(0, b.a, 0)); m4.compose(v.copy(T({ x: b.x, y: 0.02, z: b.z })), q, sc.set(b.sx, 1, b.sz)); ao.setMatrixAt(i, m4); });
  ao.count = blobs.length; ao.renderOrder = -1; ao.frustumCulled = false; grp.add(ao);
  // ---- rectangular contact shade: houses, landmark models (not the round fountain), stalls, walls (both faces), gates
  const rects = [];   // { x, z, hw, hd, rot (three yaw), m (margin m) }
  for (const h of houses) rects.push({ x: h.pos[0], z: h.pos[1], hw: h.w / 2, hd: h.d / 2, rot: Math.PI - (h.h || 0) * DEG, m: 1.15 });
  for (const md of models) if (!(md.file === 'town_arcan_fountain' || md.id === 'fountain')) rects.push({ x: md.pos[0], z: md.pos[1], hw: md.size[0] / 2 * 0.92, hd: md.size[1] / 2 * 0.92, rot: Math.PI - (md.h || 0) * DEG, m: 1.3 });
  for (const d of decor) if (d.type === 'stall') rects.push({ x: d.pos[0], z: d.pos[1], hw: (d.w || 3.4) / 2, hd: (d.d || 2) / 2, rot: Math.PI - (d.h || 0) * DEG, m: 0.7 });
  for (const w of walls) { const dx = w.b[0] - w.a[0], dz = w.b[1] - w.a[1], L = Math.hypot(dx, dz); rects.push({ x: (w.a[0] + w.b[0]) / 2, z: (w.a[1] + w.b[1]) / 2, hw: L / 2, hd: w.t / 2, rot: Math.atan2(-dz, dx) * -1, m: 1.4, wall: true }); }
  for (const g of gates) { const span = Math.hypot(g.towers[1][0] - g.towers[0][0], g.towers[1][1] - g.towers[0][1]); rects.push({ x: g.pos[0], z: g.pos[1], hw: span / 2 + g.tr, hd: g.tr, rot: Math.PI - (g.heading ?? 180) * DEG, m: 1.1 }); }
  const boxM = boxMat(PLAZA.ao.col, PLAZA.ao.a * 0.9);
  const boxG = new THREE.InstancedBufferGeometry().copy(plane); const aIn = new Float32Array(Math.max(1, rects.length) * 2);
  const box = new THREE.InstancedMesh(boxG, boxM, Math.max(1, rects.length));
  rects.forEach((r, i) => { const W = r.hw + r.m, D = r.hd + r.m; q.setFromEuler(e.set(0, r.rot, 0)); m4.compose(v.copy(T({ x: r.x, y: 0.019, z: r.z })), q, sc.set(W, 1, D)); box.setMatrixAt(i, m4); aIn[i * 2] = r.hw / W; aIn[i * 2 + 1] = r.hd / D; });
  boxG.setAttribute('aIn', new THREE.InstancedBufferAttribute(aIn, 2));
  box.count = rects.length; box.renderOrder = -1; box.frustumCulled = false; grp.add(box);
  // Arcan goddess fountain: soft dark ring where the outer step meets the paving
  const fnt = models.find(m => m.file === 'town_arcan_fountain'); let ring = null;
  const fr = PLAZA.fountainR;
  if (fnt) { ring = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), decalMat(PLAZA.ao.col, PLAZA.ao.a * 1.05, false, fr / (fr + 1.25)));
    ring.scale.set(fr + 1.25, 1, fr + 1.25); ring.position.copy(T({ x: fnt.pos[0], y: 0.021, z: fnt.pos[1] })); ring.renderOrder = -1; grp.add(ring); }
  // ---- warm light pools under the lamps
  const pool = new THREE.InstancedMesh(plane, decalMat(PLAZA.pool.col, PLAZA.pool.a, true), Math.max(1, lamps.length));
  lamps.forEach((l, i) => { m4.compose(v.copy(T({ x: l.x, y: 0.025, z: l.z })), q.identity(), sc.set(PLAZA.pool.r, 1, PLAZA.pool.r)); pool.setMatrixAt(i, m4); });
  pool.count = lamps.length; pool.renderOrder = -1; pool.frustumCulled = false; grp.add(pool);
  // ---- swaying grass tufts (clumps hugging bases; never on a road / gate mouth / outside the courtyard)
  const spots = [];
  const ok = (x, z) => inside(x, z) && !onRoad(x, z) && !nearGate(x, z);
  const clump = (x, z, k, r = 0.22) => { for (let i = 0; i < k; i++) { const a = rnd() * 6.283, rr = Math.sqrt(rnd()) * r, px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr; if (ok(px, pz)) spots.push([px, pz]); } };
  const ringAt = (cx, cz, r0, r1, n) => { for (let i = 0; i < n; i++) { const a = rnd() * Math.PI * 2, rr = r0 + rnd() * (r1 - r0); clump(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr, 3 + Math.floor(rnd() * 4)); } };
  const gaps = (x, z) => Math.sin(x * 0.37 + Math.sin(z * 0.23) * 2.1) + Math.sin(z * 0.41 - x * 0.13) > -0.35;   // grow in runs, with bare stretches
  if (fnt) ringAt(fnt.pos[0], fnt.pos[1], fr + 0.05, fr + 0.3, 46);
  for (const l of lamps) ringAt(l.x, l.z, l.r * 0.62, l.r * 0.85, 4);
  for (const b of blobs) if (b.sx > 0.6 && (b.tree || b.base || b.sx < 1.6)) ringAt(b.x, b.z, b.sx * 0.45, b.sx * 0.7, b.tree ? 4 : 3);
  // along the inner foot of the walls
  for (const w of walls) {
    const dx = w.b[0] - w.a[0], dz = w.b[1] - w.a[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
    let nx = -uz, nz = ux; const mx = (w.a[0] + w.b[0]) / 2, mz = (w.a[1] + w.b[1]) / 2; if ((C.x - mx) * nx + (C.z - mz) * nz < 0) { nx = -nx; nz = -nz; }
    for (let s = 0.6; s < L - 0.6; s += 0.8 + rnd() * 0.6) { const off = w.t / 2 + 0.12 + rnd() * 0.35, x = w.a[0] + ux * s + nx * off, z = w.a[1] + uz * s + nz * off; if (gaps(x, z)) clump(x, z, 3 + Math.floor(rnd() * 3), 0.25); }
  }
  // along the sides and backs of the houses and round the landmarks (front = door side stays clean)
  const footRun = (r, sides, step) => {
    const cs = Math.cos(r.rot), sn = Math.sin(r.rot);
    const toGame = (lx, lz) => { const tx = lx * cs + lz * sn, tz = -lx * sn + lz * cs; return [r.x + tx, r.z - tz]; };   // local (x, z three) -> game
    for (const [ax, az, bx, bz, nx, nz] of sides) { const L = Math.hypot(bx - ax, bz - az);
      for (let s = 0.3; s < L - 0.3; s += step + rnd() * step) { const t = s / L, off = 0.15 + rnd() * 0.3, [x, z] = toGame(ax + (bx - ax) * t + nx * off, az + (bz - az) * t + nz * off); if (gaps(x, z)) clump(x, z, 3 + Math.floor(rnd() * 3), 0.24); } }
  };
  for (const r of rects) if (!r.wall) { const W = r.hw, D = r.hd;
    footRun(r, [[-W, -D, W, -D, 0, -1], [-W, -D, -W, D, -1, 0], [W, -D, W, D, 1, 0]], 0.9); }   // back (-z) + both sides; front (+z) = door
  // grass verges / park lawns: a light scatter of taller tufts inside
  for (const g of spec.ground.grass || []) { const xs = g.pts.map(p => p[0]), zs = g.pts.map(p => p[1]), gx0 = Math.min(...xs), gx1 = Math.max(...xs), gz0 = Math.min(...zs), gz1 = Math.max(...zs);
    const n = Math.min(260, Math.round((gx1 - gx0) * (gz1 - gz0) * 0.35)); for (let i = 0; i < n; i++) { const x = gx0 + rnd() * (gx1 - gx0), z = gz0 + rnd() * (gz1 - gz0); if (inPoly(x, z, g.pts)) clump(x, z, 2 + Math.floor(rnd() * 3), 0.3); } }
  spots.length = Math.min(spots.length, PLAZA.grass);
  for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }   // shuffled: 'medium' draws the first half = an even thinning
  const card = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), card2 = card.clone().rotateY(Math.PI / 2);
  const tuftGeo = new THREE.BufferGeometry(); { const a = card.toNonIndexed(), b = card2.toNonIndexed(); for (const k of ['position', 'normal', 'uv']) { const A = a.attributes[k], B = b.attributes[k]; const arr = new Float32Array(A.array.length + B.array.length); arr.set(A.array); arr.set(B.array, A.array.length); tuftGeo.setAttribute(k, new THREE.BufferAttribute(arr, A.itemSize)); } }
  const n2 = tuftGeo.attributes.normal; for (let i = 0; i < n2.count; i++) n2.setXYZ(i, 0, 1, 0);   // lit like the ground (no dark backsides)
  const gm = new THREE.MeshLambertMaterial({ map: grassTex(), alphaTest: 0.45, side: THREE.DoubleSide });
  gm.onBeforeCompile = sh => { sh.uniforms.uWind = WIND; sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWind;').replace('#include <begin_vertex>', `#include <begin_vertex>
  { vec3 wp = (instanceMatrix * vec4(0., 0., 0., 1.)).xyz; float k = position.y * position.y;
    float gust = .6 + .4 * sin(uWind * .5 + wp.x * .05 + wp.z * .04);
    transformed.x += k * (sin(uWind * 1.9 + wp.x * .7 + wp.z * .5) * .12 + sin(uWind * 3.3 + wp.x * 1.7) * .04) * gust;
    transformed.z += k * sin(uWind * 1.4 + wp.z * .9) * .07 * gust; }`).replace('#include <color_fragment>', '#include <color_fragment>'); };
  gm.customProgramCacheKey = () => 'rmGrass2';
  const grass = new THREE.InstancedMesh(tuftGeo, gm, Math.max(1, spots.length)), pc = new THREE.Color();
  spots.forEach(([x, z], i) => { const s = 0.3 + rnd() * 0.24; q.setFromEuler(e.set(0, rnd() * 6.283, 0)); m4.compose(v.copy(T({ x, y: 0, z })), q, sc.set(s * (0.9 + rnd() * 0.5), s, s)); grass.setMatrixAt(i, m4);
    grass.setColorAt(i, pc.setRGB(0.9 + rnd() * 0.2, 0.95 + rnd() * 0.12, 0.85 + rnd() * 0.15)); });
  grass.count = spots.length; grass.receiveShadow = true; grass.frustumCulled = false; grp.add(grass);
  // ---- pebbles (fountain step, wall feet, road shoulders) and fallen leaves under the trees
  const pebGeo = new THREE.DodecahedronGeometry(0.5, 0).scale(1, 0.45, 0.8);
  const PEB = PLAZA.pebble, peb = new THREE.InstancedMesh(pebGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), PEB);
  let np = 0;
  for (let tries = 0; np < PEB && tries < PEB * 8; tries++) {
    let x, z; const k = rnd();
    if (fnt && k < 0.25) { const a = rnd() * 6.283, rr = fr + 0.05 + rnd() * 0.9; x = fnt.pos[0] + Math.cos(a) * rr; z = fnt.pos[1] + Math.sin(a) * rr; }
    else if (k < 0.6 && walls.length) { const w = walls[Math.floor(rnd() * walls.length)], t = rnd(), mx = (w.a[0] + w.b[0]) / 2, mz = (w.a[1] + w.b[1]) / 2; let nx = -(w.b[1] - w.a[1]), nz = w.b[0] - w.a[0]; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l; if ((C.x - mx) * nx + (C.z - mz) * nz < 0) { nx = -nx; nz = -nz; }
      x = w.a[0] + (w.b[0] - w.a[0]) * t + nx * (w.t / 2 + 0.1 + rnd() * 0.8); z = w.a[1] + (w.b[1] - w.a[1]) * t + nz * (w.t / 2 + 0.1 + rnd() * 0.8); }
    else { x = x0 + rnd() * (x1 - x0); z = z0 + rnd() * (z1 - z0); if (onRoad(x, z) || rnd() < 0.5) continue; }
    if (!inside(x, z) || nearGate(x, z, 0)) continue;
    const s = 0.04 + rnd() * 0.07; q.setFromEuler(e.set(rnd() * 0.4, rnd() * 6.283, rnd() * 0.4)); m4.compose(v.copy(T({ x, y: s * 0.12, z })), q, sc.set(s, s, s)); peb.setMatrixAt(np, m4);
    peb.setColorAt(np, pc.setHSL(0.08 + rnd() * 0.06, 0.12 + rnd() * 0.12, 0.42 + rnd() * 0.25)); np++;
  }
  peb.count = np; peb.receiveShadow = true; peb.frustumCulled = false; grp.add(peb);
  const leafM = new THREE.MeshLambertMaterial({ map: leafTex(), alphaTest: 0.5, side: THREE.DoubleSide });
  const LEAF = PLAZA.leaf, leaf = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.2, 0.2).rotateX(-Math.PI / 2), leafM, LEAF);
  const trees = bl.filter(b => /^tree/.test(b.model)); let nl = 0;
  if (trees.length) for (let i = 0; i < LEAF; i++) { const t = trees[Math.floor(rnd() * trees.length)], a = rnd() * 6.283, rr = 0.5 + Math.pow(rnd(), 1.8) * 2.6, x = t.pos[0] + Math.cos(a) * rr, z = t.pos[1] + Math.sin(a) * rr;
    q.setFromEuler(e.set(0, rnd() * 6.283, 0)); m4.compose(v.copy(T({ x, y: 0.03, z })), q, sc.setScalar(0.7 + rnd() * 0.6)); leaf.setMatrixAt(nl, m4);
    leaf.setColorAt(nl, pc.setHSL(0.06 + rnd() * 0.07, 0.55, 0.45 + rnd() * 0.2)); nl++; }
  leaf.count = nl; leaf.receiveShadow = true; leaf.frustumCulled = false; grp.add(leaf);
  const full = { grass: grass.count, peb: peb.count, leaf: leaf.count };
  let t = 0;
  const api = {
    group: grp, stats: { blobs: blobs.length, rects: rects.length, lamps: lamps.length, grass: full.grass, pebbles: full.peb, leaves: full.leaf },
    update(dt) { t += dt; WIND.value = t; },
    setLevel(qq) {
      grp.visible = qq !== 'low';
      const k = qq === 'high' ? 1 : 0.5, ka = qq === 'high' ? 1 : 0.78;
      grass.count = Math.round(full.grass * k); peb.count = Math.round(full.peb * k); leaf.count = Math.round(full.leaf * k);
      aoM.uniforms.uA.value = PLAZA.ao.a * ka; boxM.uniforms.uA.value = PLAZA.ao.a * 0.9 * ka; if (ring) ring.material.uniforms.uA.value = PLAZA.ao.a * 1.05 * ka;
      RM_U.value = qq === 'low' ? 0 : 1; RM_K.value = qq === 'high' ? 1 : qq === 'medium' ? 0.6 : 0;
    },
  };
  api.setLevel(gfxQ());
  return api;
}
/** pilot name (the Arcan plaza) — now the whole town */
export const buildPlazaRemaster = buildTownRemaster;

/** 2026-11-19 리마스터 6단계 — 필드(js/nature.js가 그리는 40곳): 나무·바위·덤불·그루터기·버섯 나무 밑 부드러운 접촉 그늘(InstancedMesh 하나,
 *  장식만 — 충돌·길찾기 무관). 바닥 잔결·광택·풀 밑동 그늘은 nature.js 셰이더(RM_K), 대기 원근은 applyGfxQuality(높음만). */
const FIELD_R = { tree: 1.55, pine: 1.25, rock: 1.0, shrub: 0.85, bush: 0.85, stump: 0.75, mushtree: 1.5, mushroom: 0.6, ruin: 1.2 };
export function buildFieldRemaster(def, geo) {
  const grp = new THREE.Group(); grp.name = 'field_remaster';
  const props = (def.props || []).filter(p => FIELD_R[p.type]);
  const plane = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const mat = decalMat([0.12, 0.10, 0.16], 0.5);
  const im = new THREE.InstancedMesh(plane, mat, Math.max(1, props.length));
  props.forEach((p, i) => { const r = FIELD_R[p.type] * Math.min(1.6, Math.max(0.6, p.scale || 1)), g = geo.ground(p.pos[0], p.pos[1]);
    m4.compose(v.copy(T({ x: p.pos[0], y: (g.y || 0) + 0.035, z: p.pos[1] })), q, sc.set(r, 1, r)); im.setMatrixAt(i, m4); });
  im.count = props.length; im.renderOrder = -1; im.frustumCulled = false; grp.add(im);
  const api = { group: grp, stats: { shade: props.length },
    setLevel(qq) { grp.visible = qq !== 'low'; mat.uniforms.uA.value = qq === 'high' ? 0.5 : 0.38; } };
  api.setLevel(gfxQ());
  return api;
}

/** settings changed (game.js applySettings): recompile the remaster materials, toggle the plaza extras, atmosphere */
export function applyGfxQuality(G, zone) {
  const q = gfxQ();
  if (!G || !G.render) return q;
  G.render.scene.traverse(o => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const m of ms) if (m.userData && m.userData.remaster) m.needsUpdate = true; });
  for (const m of rmMaterials) m.needsUpdate = true;
  const z = zone || G.zone;
  RM_K.value = rmK();
  if (z && z.plazaRM) z.plazaRM.setLevel(q); else RM_U.value = 0;
  if (z && z.fieldRM) z.fieldRM.setLevel(q);
  if (G.render.post && G.render.post.params) {
    const p = G.render.post.params, base = z && z.def && z.def.post && z.def.post.haze != null ? z.def.post.haze : (G.render.post.defaults.haze || 0);
    p.haze = base + (z && (z.plazaRM || z.fieldRM) && q === 'high' ? PLAZA.haze : 0);
  }
  return q;
}
