// 땅에 떨어진 아이템의 모습 (2026-11-15, 사용자: '아이템이 그래픽이랑 너무 달라 — 게임 그래픽처럼 세련된 3D로, 위에 이름'):
//  - 모델: 그림 모델이 있는 아이템(js/items3d.js — 무기·방어구·장신구·물약·재료)은 그것을, 없으면(퀘스트 줍기·퀘스트 드롭 qi_* 등)
//    tools/blender/items_drop.py가 만든 작은 카툰 소품(assets/items/drop_items.glb.json, 정점 색만)을 아이템 데이터 낱말로 고른
//    지도(assets/items/drop_map.json, 종류별 대체 포함)대로 씀. 예전 평평한 도트 아이콘 판(ui.iconMesh)은 더 쓰지 않음.
//    음영은 캐릭터·소품과 같은 paintMat(부드러운 띠·보라 그늘·림), 빛나는 부분(__glow)은 블룸 문턱 아래 발광.
//  - 찾기 표시: 예전 굵고 흰 원통 대신 가늘고 부드러운 빛기둥(카메라를 보는 판 하나, 셰이더: 가운데 심·위로 사라짐·떠오르는
//    작은 빛 알갱이) + 바닥 빛 고리(얇은 고리·안쪽 은은한 빛·도는 반짝임). 색 = 등급(TIER): 퀘스트 금빛, 드롭 전용 장비 보라,
//    장비 하늘색, 그 밖 흰색(기둥 없이 작은 고리만). 조명·후처리·블룸은 건드리지 않음(가산 혼합, 블룸 문턱 아래 밝기).
//  - 둥실 떠서 천천히 돎(줍기·판정·수는 actors.js Loot 그대로) + 옅은 접촉 그림자.
//  - 이름표는 ui.js updatePlates의 '.plate.item'(위치는 groundItem.top), 규칙은 LABEL.
import { THREE, T, paintMat, contactShadowTex } from './render.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { lootModel, hasItemModel } from './items3d.js';

/** 등급별 색 (이름표 CSS .plate.item.<tier>와 같은 색) */
export const TIER = {
  quest:  { col: 0xffc65a, ring: 1.15, beam: 2.3, beamW: 0.5, a: 1.0 },
  rare:   { col: 0xc89aff, ring: 0.95, beam: 1.5, beamW: 0.42, a: 0.85 },
  gear:   { col: 0x8cd2ff, ring: 0.85, beam: 1.1, beamW: 0.38, a: 0.7 },
  normal: { col: 0xfff4dc, ring: 0.7, beam: 0, beamW: 0, a: 0.45 },
};
/** 이름표: 거리(m)·동시에 보이는 수·겹침 (휴대폰은 좁게) */
export const LABEL = { range: 10, rangePhone: 8, fade: 2.5, max: 6, maxPhone: 4 };
const SIZE = { quest: 0.5, other: 0.42 };     // 땅 위 모델의 가장 긴 변(m)

export function itemTier(def, quest) {
  if (quest || (def && /^qi_/.test(def.id))) return 'quest';
  if (def && ['weapon', 'armor', 'accessory'].includes(def.type)) return def.dropFrom ? 'rare' : 'gear';
  return 'normal';
}

// ------------------------------------------------------------------------------------------------ models
let lib = null, libP = null;
export function preloadDrops() {
  if (libP) return libP;
  libP = (async () => {
    try {
      const [j, map] = await Promise.all([fetch('assets/items/drop_items.glb.json').then(r => r.json()), fetch('assets/items/drop_map.json').then(r => r.json())]);
      const raw = atob(j.b64), u8 = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
      const g = await new Promise((res, rej) => new GLTFLoader().parse(u8.buffer, '', res, rej));
      const meshes = {}; g.scene.traverse(o => { if (o.isMesh) meshes[o.name] = o; });
      lib = { meshes, map };
    } catch (e) { console.warn('drop models', e); lib = { meshes: {}, map: { items: {}, fallback: {} } }; }
    return lib;
  })();
  return libP;
}
const bodyMats = new Map(), glowMats = new Map();
function bodyMat(tint) {
  const k = tint || '-';
  if (!bodyMats.has(k)) bodyMats.set(k, paintMat(new THREE.MeshStandardMaterial({ vertexColors: true, color: tint ? new THREE.Color(tint) : 0xffffff, roughness: 0.85 }), { soft: true, rimK: 0.18 }));
  return bodyMats.get(k);
}
function glowMat(tint) {
  const k = tint || '-';
  if (!glowMats.has(k)) { const c = new THREE.Color(tint || 0xffffff).lerp(new THREE.Color(0xffffff), 0.45).multiplyScalar(1.6); glowMats.set(k, new THREE.MeshBasicMaterial({ vertexColors: true, color: c, toneMapped: true })); }
  return glowMats.get(k);
}
function dropModelName(id, def) {
  const m = lib.map.items[id]; if (m && lib.meshes['drop_' + m.m]) return m;
  const kind = /^qi_/.test(id) ? 'quest' : (def && def.type) || 'material';
  return { m: lib.map.fallback[kind] || 'pouch' };
}
/** stylized drop model (fills `holder` now or when the library arrives), centred, sitting on y 0, longest side `size` */
function fillDrop(holder, id, def, size) {
  const make = () => {
    const pick = dropModelName(id, def), src = lib.meshes['drop_' + pick.m]; if (!src) return;
    const g = new THREE.Group(), m = new THREE.Mesh(src.geometry, bodyMat(pick.tint)); m.castShadow = true; g.add(m);
    const gl = lib.meshes['drop_' + pick.m + '__glow']; if (gl) g.add(new THREE.Mesh(gl.geometry, glowMat(pick.tint)));
    fit(g, size); holder.add(g); holder.userData.h = g.userData.h;
  };
  if (lib) make(); else preloadDrops().then(make);
}
// items3d models keep their own materials for held weapons / icons; on the ground they get painted copies
const painted = new WeakMap();
function paintCopy(m) {
  if (m.transparent) return m;
  if (!painted.has(m)) painted.set(m, paintMat(m.clone(), { soft: true, rimK: 0.18 }));
  return painted.get(m);
}
function fit(g, size) {
  const bb = new THREE.Box3().setFromObject(g), sz = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
  const k = size / Math.max(sz.x, sz.y, sz.z, 1e-3);
  for (const ch of g.children) { ch.position.x -= c.x; ch.position.z -= c.z; ch.position.y -= bb.min.y; }
  g.scale.setScalar(k); g.userData.h = sz.y * k;
}

// ------------------------------------------------------------------------------------------------ find-me glow
const U = { uTime: { value: 0 } };
const RING_FS = `uniform vec3 uCol; uniform float uA, uTime; varying vec2 vUv;
void main(){ vec2 p = (vUv - .5) * 2.; float r = length(p), a = atan(p.y, p.x);
  float ring = exp(-pow((r - .78) / .045, 2.)) * .9 + exp(-pow((r - .55) / .02, 2.)) * .25 * (.6 + .4 * sin(a * 6. - uTime * 1.6));
  float inner = pow(max(0., 1. - r), 2.2) * .35;
  float sp = 0.; for (int i = 0; i < 5; i++) { float fi = float(i); float b = uTime * .55 + fi * 1.2566; vec2 q = vec2(cos(b), sin(b)) * .78;
    sp += smoothstep(.09, 0., length(p - q)) * (.55 + .45 * sin(uTime * 3. + fi * 2.1)); }
  float puls = .82 + .18 * sin(uTime * 2.2);
  float A = (ring * puls + inner + sp * .8) * uA * smoothstep(1., .9, r);
  gl_FragColor = vec4(uCol * A, A); }`;
const BEAM_FS = `uniform vec3 uCol; uniform float uA, uTime, uSeed; varying vec2 vUv;
void main(){ float x = (vUv.x - .5) * 2., y = vUv.y;
  float core = exp(-x * x * 26.) * .9 + exp(-x * x * 4.) * .28;
  float v = smoothstep(0., .1, y) * pow(1. - y, 1.6);
  float flick = .85 + .15 * sin(uTime * 2.4 + uSeed + y * 6.);
  float sp = 0.; for (int i = 0; i < 4; i++) { float fi = float(i); float yy = fract(uTime * .28 + fi * .25 + uSeed);
    float xx = sin(fi * 7.3 + uSeed + uTime * .9) * .38; sp += smoothstep(.07, 0., length(vec2((x - xx) * .55, (y - yy) * 1.6))) * (1. - yy) * smoothstep(0., .1, yy); }
  float A = (core * v * flick + sp * .9) * uA;
  gl_FragColor = vec4(uCol * A, A); }`;
const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const fxMats = new Map();
function fxMat(kind, tier) {
  const k = kind + tier; if (fxMats.has(k)) return fxMats.get(k);
  const t = TIER[tier], col = new THREE.Color(t.col);
  const m = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: kind === 'ring' ? RING_FS : BEAM_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide, uniforms: { uCol: { value: col }, uA: { value: kind === 'ring' ? t.a : t.a * 0.75 }, uTime: U.uTime, uSeed: { value: 0 } } });
  fxMats.set(k, m); return m;
}
const planeGeo = new THREE.PlaneGeometry(1, 1), beamGeo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
let shadowMat = null;

/** the visual of one item lying on the ground: { root, update(t, pos), top, dispose() } */
export function groundItem(id, def, opts = {}) {
  const tier = itemTier(def, opts.quest), t = TIER[tier];
  const root = new THREE.Group(), spin = new THREE.Group(); root.add(spin);
  const size = tier === 'quest' ? SIZE.quest : SIZE.other;
  if (hasItemModel(id)) {
    const m = lootModel(id); m.traverse(o => { if (o.isMesh) { o.material = paintCopy(o.material); o.castShadow = true; } });
    const g = new THREE.Group(); g.add(m); fit(g, size); spin.add(g); spin.userData.h = g.userData.h;
  } else fillDrop(spin, id, def, size);
  const ring = new THREE.Mesh(planeGeo, fxMat('ring', tier)); ring.rotation.x = -Math.PI / 2; ring.scale.setScalar(t.ring); ring.position.y = 0.03; ring.renderOrder = 3; root.add(ring);
  let beam = null;
  if (t.beam > 0) {
    const bm = fxMat('beam', tier).clone(); bm.uniforms.uTime = U.uTime; bm.uniforms.uSeed.value = Math.random() * 6.28;
    beam = new THREE.Mesh(beamGeo, bm); beam.scale.set(t.beamW, t.beam, 1); beam.renderOrder = 3; root.add(beam);
  }
  if (!shadowMat) shadowMat = new THREE.MeshBasicMaterial({ map: contactShadowTex(), transparent: true, depthWrite: false });
  const sh = new THREE.Mesh(planeGeo, shadowMat); sh.rotation.x = -Math.PI / 2; sh.scale.setScalar(size * 1.25); sh.position.y = 0.02; sh.renderOrder = 2; root.add(sh);
  const phase = Math.random() * 6.28, tmp = new THREE.Vector3();
  const v = {
    root, tier, size,
    get top() { return (spin.userData.h || size * 0.6) + 0.42; },
    /** pos = game coords on the ground; t = seconds alive */
    update(time, pos, cam) {
      U.uTime.value = performance.now() / 1000;
      root.position.copy(T(pos));
      const lift = 0.16 + Math.sin(time * 2.2 + phase) * 0.05;
      spin.position.y = lift; spin.rotation.y = time * 0.9 + phase;
      sh.material.opacity = 1; sh.scale.setScalar(size * (1.3 - lift));
      if (beam && cam) { tmp.copy(cam.position).sub(root.position); beam.rotation.y = Math.atan2(tmp.x, tmp.z); }
      const pop = Math.min(1, time * 4); root.scale.setScalar(0.4 + 0.6 * (1 - (1 - pop) * (1 - pop)));
    },
    dispose() { if (beam) beam.material.dispose(); },
  };
  return v;
}
