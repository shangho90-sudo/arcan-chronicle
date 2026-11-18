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
import { gfxQ, gfxOn } from './gfxq.js';
import { RM_U, rmMaterials } from './town3d.js';

export const PLAZA = {
  R: 22,                         // 리마스터 구역 반지름 m (분수 중심 0,0)
  fountainR: 5.6,                // 분수 바깥 계단 가장자리 (충돌 원 5.3)
  ao: { a: 0.4, col: [0.16, 0.10, 0.20] },   // 접촉 그늘 진하기·색 (어두운 보라 갈색 — 검정 아님)
  pool: { a: 0.16, col: [1.0, 0.72, 0.42], r: 2.3 },   // 가로등 빛 웅덩이 (가산, 블룸 문턱 아래)
  grass: 900, pebble: 200, leaf: 120,                  // 높음 기준 개수 (보통 = 절반)
  haze: 0.045,                  // 높음일 때만 더하는 대기 원근(화면 위쪽 옅은 보라) — 과하지 않게
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

/** extras for the Arcan fountain plaza. spec = zone town3d spec. Returns { group, update(dt), setLevel(q) } */
export function buildPlazaRemaster(spec) {
  const grp = new THREE.Group(); grp.name = 'plaza_remaster';
  const R = PLAZA.R, rnd = mulberry(1919), inR = (x, z) => Math.hypot(x, z) < R;
  const bl = (spec.blprops || []).filter(b => inR(b.pos[0], b.pos[1]));
  const lamps = [...(spec.lanterns || []).filter(p => inR(p[0], p[1])).map(p => ({ x: p[0], z: p[1], r: 0.95 })), ...bl.filter(b => b.model === 'town_lamp').map(b => ({ x: b.pos[0], z: b.pos[1], r: 0.7 }))];
  // ---- contact shade (one instanced draw): blob under every grounded object of the plaza
  const blobs = [];
  for (const l of lamps) blobs.push({ x: l.x, z: l.z, sx: l.r * 1.6, sz: l.r * 1.6, a: 0 });
  for (const b of bl) {
    const s = b.scale || 1, a = -(b.rot || 0) * Math.PI / 180;
    if (b.model === 'town_bench') blobs.push({ x: b.pos[0], z: b.pos[1], sx: 1.35 * s, sz: 0.62 * s, a });
    else if (/^tree/.test(b.model)) blobs.push({ x: b.pos[0], z: b.pos[1], sx: 1.5 * s, sz: 1.5 * s, a: 0 });
    else if (/^shrub/.test(b.model)) blobs.push({ x: b.pos[0], z: b.pos[1], sx: 1.05 * s, sz: 1.05 * s, a: 0 });
    else if (b.model === 'town_banner') blobs.push({ x: b.pos[0], z: b.pos[1], sx: 0.45, sz: 0.45, a: 0 });
  }
  for (const d of spec.decor || []) if (inR(d.pos[0], d.pos[1]) && (d.type === 'planter' || d.type === 'crates')) blobs.push({ x: d.pos[0], z: d.pos[1], sx: (d.r || 1) + 0.55, sz: (d.r || 1) + 0.55, a: 0 });
  const plane = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const ao = new THREE.InstancedMesh(plane, decalMat(PLAZA.ao.col, PLAZA.ao.a), Math.max(1, blobs.length));
  blobs.forEach((b, i) => { q.setFromEuler(e.set(0, b.a, 0)); m4.compose(v.copy(T({ x: b.x, y: 0.02, z: b.z })), q, sc.set(b.sx, 1, b.sz)); ao.setMatrixAt(i, m4); });
  ao.count = blobs.length; ao.renderOrder = -1; ao.frustumCulled = false; grp.add(ao);
  // fountain base: a soft dark ring where the outer step meets the paving (inner = step edge)
  const fr = PLAZA.fountainR, ring = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), decalMat(PLAZA.ao.col, PLAZA.ao.a * 1.05, false, fr / (fr + 1.25)));
  ring.scale.set(fr + 1.25, 1, fr + 1.25); ring.position.y = 0.021; ring.renderOrder = -1; grp.add(ring);
  // ---- warm light pools under the lamps
  const pool = new THREE.InstancedMesh(plane, decalMat(PLAZA.pool.col, PLAZA.pool.a, true), Math.max(1, lamps.length));
  lamps.forEach((l, i) => { m4.compose(v.copy(T({ x: l.x, y: 0.025, z: l.z })), q.identity(), sc.set(PLAZA.pool.r, 1, PLAZA.pool.r)); pool.setMatrixAt(i, m4); });
  pool.count = lamps.length; pool.renderOrder = -1; pool.frustumCulled = false; grp.add(pool);
  // ---- swaying grass tufts: at the fountain step, around lamp / planter / tree / bench bases, a few in paving cracks
  const spots = [];   // tufts come in small clumps (3~6 within ~0.2 m) hugging the bases — single tufts on open paving read as noise
  const clump = (x, z, k) => { for (let i = 0; i < k; i++) { const a = rnd() * 6.283, rr = Math.sqrt(rnd()) * 0.2; spots.push([x + Math.cos(a) * rr, z + Math.sin(a) * rr]); } };
  const ringAt = (cx, cz, r0, r1, n) => { for (let i = 0; i < n; i++) { const a = rnd() * Math.PI * 2, rr = r0 + rnd() * (r1 - r0); clump(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr, 3 + Math.floor(rnd() * 4)); } };
  ringAt(0, 0, fr + 0.05, fr + 0.3, 46);
  for (const l of lamps) ringAt(l.x, l.z, l.r * 0.62, l.r * 0.85, 4);
  for (const b of blobs) if (b.sx > 0.6) ringAt(b.x, b.z, b.sx * 0.45, b.sx * 0.7, 3);
  for (let i = 0; i < 18; i++) { const a = rnd() * Math.PI * 2, rr = fr + 3 + rnd() * (R - fr - 4); clump(Math.cos(a) * rr, Math.sin(a) * rr, 2); }
  spots.length = Math.min(spots.length, PLAZA.grass);
  for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }   // shuffled: 'medium' draws the first half = an even thinning
  const card = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), card2 = card.clone().rotateY(Math.PI / 2);
  const tuftGeo = new THREE.BufferGeometry(); { const a = card.toNonIndexed(), b = card2.toNonIndexed(); for (const k of ['position', 'normal', 'uv']) { const A = a.attributes[k], B = b.attributes[k]; const arr = new Float32Array(A.array.length + B.array.length); arr.set(A.array); arr.set(B.array, A.array.length); tuftGeo.setAttribute(k, new THREE.BufferAttribute(arr, A.itemSize)); } }
  const n2 = tuftGeo.attributes.normal; for (let i = 0; i < n2.count; i++) n2.setXYZ(i, 0, 1, 0);   // lit like the ground (no dark backsides)
  const gm = new THREE.MeshLambertMaterial({ map: grassTex(), alphaTest: 0.45, side: THREE.DoubleSide });
  gm.onBeforeCompile = sh => { sh.uniforms.uWind = WIND; sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWind;').replace('#include <begin_vertex>', `#include <begin_vertex>
  { vec3 wp = (instanceMatrix * vec4(0., 0., 0., 1.)).xyz; float k = position.y * position.y;
    transformed.x += k * (sin(uWind * 1.9 + wp.x * .7 + wp.z * .5) * .09 + sin(uWind * 3.3 + wp.x * 1.7) * .035);
    transformed.z += k * sin(uWind * 1.4 + wp.z * .9) * .05; }`); };
  gm.customProgramCacheKey = () => 'rmGrass';
  const grass = new THREE.InstancedMesh(tuftGeo, gm, spots.length);
  spots.forEach(([x, z], i) => { const s = 0.2 + rnd() * 0.16; q.setFromEuler(e.set(0, rnd() * 6.283, 0)); m4.compose(v.copy(T({ x, y: 0, z })), q, sc.set(s * (0.9 + rnd() * 0.5), s, s)); grass.setMatrixAt(i, m4); });
  grass.receiveShadow = true; grass.frustumCulled = false; grp.add(grass);
  // ---- pebbles and fallen leaves along the step, kerbs and bases
  const pebGeo = new THREE.DodecahedronGeometry(0.5, 0).scale(1, 0.45, 0.8);
  const peb = new THREE.InstancedMesh(pebGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), PLAZA.pebble), pc = new THREE.Color();
  for (let i = 0; i < PLAZA.pebble; i++) { const a = rnd() * 6.283, near = rnd() < 0.55, rr = near ? fr + 0.05 + rnd() * 0.9 : fr + 1 + rnd() * (R - fr - 2), s = 0.035 + rnd() * 0.06;
    q.setFromEuler(e.set(rnd() * 0.4, rnd() * 6.283, rnd() * 0.4)); m4.compose(v.copy(T({ x: Math.cos(a) * rr, y: s * 0.12, z: Math.sin(a) * rr })), q, sc.set(s, s, s)); peb.setMatrixAt(i, m4);
    peb.setColorAt(i, pc.setHSL(0.08 + rnd() * 0.06, 0.12 + rnd() * 0.12, 0.42 + rnd() * 0.25)); }
  peb.receiveShadow = true; peb.frustumCulled = false; grp.add(peb);
  const leafM = new THREE.MeshLambertMaterial({ map: leafTex(), alphaTest: 0.5, side: THREE.DoubleSide });
  const leaf = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.16, 0.16).rotateX(-Math.PI / 2), leafM, PLAZA.leaf);
  const trees = bl.filter(b => /^tree|^shrub/.test(b.model));
  for (let i = 0; i < PLAZA.leaf; i++) { const t = trees.length ? trees[Math.floor(rnd() * trees.length)] : { pos: [0, 0] }, a = rnd() * 6.283, rr = 0.5 + Math.pow(rnd(), 1.8) * 2.2;
    q.setFromEuler(e.set(0, rnd() * 6.283, 0)); m4.compose(v.copy(T({ x: t.pos[0] + Math.cos(a) * rr, y: 0.03, z: t.pos[1] + Math.sin(a) * rr })), q, sc.setScalar(0.7 + rnd() * 0.6)); leaf.setMatrixAt(i, m4);
    leaf.setColorAt(i, pc.setHSL(0.06 + rnd() * 0.07, 0.55, 0.45 + rnd() * 0.2)); }
  leaf.receiveShadow = true; leaf.frustumCulled = false; grp.add(leaf);
  const full = { grass: grass.count, peb: peb.count, leaf: leaf.count };
  let t = 0;
  const api = {
    group: grp,
    update(dt) { t += dt; WIND.value = t; },
    setLevel(q) {
      grp.visible = q !== 'low';
      const k = q === 'high' ? 1 : 0.5;
      grass.count = Math.round(full.grass * k); peb.count = Math.round(full.peb * k); leaf.count = Math.round(full.leaf * k);
      RM_U.value = q === 'low' ? 0 : 1;
    },
  };
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
  if (z && z.plazaRM) z.plazaRM.setLevel(q); else RM_U.value = 0;
  if (G.render.post && G.render.post.params) {
    const p = G.render.post.params, base = z && z.def && z.def.post && z.def.post.haze != null ? z.def.post.haze : (G.render.post.defaults.haze || 0);
    p.haze = base + (z && z.plazaRM && q === 'high' ? PLAZA.haze : 0);
  }
  return q;
}
