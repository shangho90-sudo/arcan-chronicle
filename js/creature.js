// 3D monsters made from the user's creature sheet (Tripo image->3D, quadruped rig + baked walk cycle) and the boss
// (Tripo text->3D, unrigged). Same interface as SpriteBody so actors.js / skills keep working; action timing
// (frames / fps / hitFrame) still comes from the monster's original sprite sheet meta, so combat balance is unchanged.
import { THREE, T, tex } from './render.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const DEG = Math.PI / 180;
/** per monster: model file, size (m, longest horizontal extent or height for 'h'), extra yaw (deg) */
export const CREATURES = {
  mon_slime:  { file: 'rabbit', size: 0.75 },
  mon_fox:    { file: 'fox', size: 1.15 },
  mon_shroom: { file: 'squirrel', size: 0.85 },
  mon_wolf:   { file: 'wolf', size: 1.45 },
  mon_boar:   { file: 'boar', size: 1.45 },
  mon_golem:  { file: 'bear', size: 2.1 },
  boss_mushroom: { file: 'boss_mushroom', size: 4.2, height: true, rigless: true },
  // Lv10-50 zones (tint / recolor: see the constructor)
  mon_mist_fox:      { file: 'fox', size: 1.25, tint: [0.72, 0.78, 0.95], recolor: 0.75 },
  mon_fog_toad:      { file: 'toad', size: 1.05 },
  mon_bog_boar:      { file: 'boar', size: 1.6, tint: [0.45, 0.6, 0.38], recolor: 0.7 },
  mon_mist_wolf:     { file: 'wolf', size: 1.6, tint: [0.62, 0.56, 0.85], recolor: 0.7 },
  mon_mist_bear:     { file: 'bear', size: 3.0, tint: [0.45, 0.46, 0.72], recolor: 0.75 },
  mon_frost_wolf:    { file: 'wolf', size: 1.65, tint: [0.9, 0.96, 1.0], recolor: 0.85 },
  mon_ice_fox:       { file: 'fox', size: 1.2, tint: [0.74, 0.9, 1.0], recolor: 0.85 },
  mon_frost_ram:     { file: 'ram', size: 1.55 },
  mon_snow_bear:     { file: 'bear', size: 2.35, tint: [0.95, 0.97, 1.0], recolor: 0.9 },
  mon_ram_king:      { file: 'ram', size: 2.7, tint: [0.6, 0.8, 1.0], recolor: 0.5 },
  mon_ember_drake:   { file: 'drake', size: 1.55, height: true, rigless: true, yaw: -90 },
  mon_cinder_lizard: { file: 'drake', size: 1.15, height: true, rigless: true, yaw: -90, tint: [1.0, 0.55, 0.12], recolor: 0.4 },
  mon_lava_boar:     { file: 'boar', size: 1.65, tint: [0.75, 0.2, 0.14], recolor: 0.75 },
  mon_ruin_golem:    { file: 'golem', size: 2.3, height: true, rigless: true, yaw: -90 },
  mon_drake_lord:    { file: 'drake', size: 2.7, height: true, rigless: true, yaw: -90, tint: [0.42, 0.22, 0.58], recolor: 0.45 },
  boss_ancient_dragon: { file: 'dragon', size: 5.0, height: true, rigless: true, yaw: -90 },
};
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const p = (async () => {
    const j = await (await fetch('assets/creatures/' + file + '.glb.json')).json();
    const raw = atob(j.b64), u8 = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
    const g = await new Promise((res, rej) => new GLTFLoader().parse(u8.buffer, '', res, rej));
    g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; const m = o.material; m.envMapIntensity = 0; for (const t of [m.map, m.normalMap]) if (t) t.anisotropy = 4; } });
    // measure in bind pose: bounds from skinned vertices, forward from the head / tail bones
    g.scene.updateMatrixWorld(true);
    const box = new THREE.Box3(); const v = new THREE.Vector3();
    g.scene.traverse(o => { if (o.isSkinnedMesh) { const pa = o.geometry.attributes.position; for (let i = 0; i < pa.count; i += 7) { v.fromBufferAttribute(pa, i); o.applyBoneTransform(i, v); v.applyMatrix4(o.matrixWorld); box.expandByPoint(v); } } else if (o.isMesh) box.expandByObject(o); });
    let fwd = null; const head = g.scene.getObjectByName('tripo::Head_2') || g.scene.getObjectByName('tripo::Head_0'), tail = g.scene.getObjectByName('tripo::Tail_0') || g.scene.getObjectByName('tripo::Spine_0');
    if (head && tail) { const a = head.getWorldPosition(new THREE.Vector3()), b = tail.getWorldPosition(new THREE.Vector3()); fwd = Math.atan2(a.x - b.x, a.z - b.z); }
    return { scene: g.scene, clips: g.animations, box, fwd };
  })();
  cache.set(file, p); return p;
}
export async function loadCreature(id) { const c = CREATURES[id]; return c ? { cfg: c, data: await load(c.file) } : null; }

let shadowMat = null; const shadowGeo = new THREE.PlaneGeometry(1, 0.85);
export class CreatureBody {
  constructor(scene, cr, sh, radius) {
    this.scene = scene; this.sh = sh; this.cfg = cr.cfg; this.action = 'idle'; this.t = 0; this.speed = 1; this.finished = false;
    this.flashT = 0; this.visible = true; this.yaw = 0; this.targetYaw = 0;
    const d = cr.data, src = d.scene;
    this.model = this.cfg.rigless ? src.clone(true) : SkeletonUtils.clone(src);
    const sz = d.box.getSize(new THREE.Vector3()), c = d.box.getCenter(new THREE.Vector3());
    const k = this.cfg.height ? this.cfg.size / sz.y : this.cfg.size / Math.max(sz.x, sz.z);
    this.inner = new THREE.Group(); this.inner.add(this.model);
    this.model.position.set(-c.x, -d.box.min.y, -c.z);
    this.inner.scale.setScalar(k);
    this.inner.rotation.y = d.fwd != null ? -d.fwd : 0;              // model forward -> local +z
    this.pivot = new THREE.Group(); this.pivot.add(this.inner);         // attack lunge / hit recoil / death tilt
    this.root = new THREE.Group(); this.root.add(this.pivot);
    this.mats = []; this.model.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.emissive = new THREE.Color(0xffffff); o.material.emissiveIntensity = 0; this.mats.push(o.material); } });
    if (this.cfg.yaw) this.inner.rotation.y += this.cfg.yaw * DEG;     // extra yaw for unrigged models whose front is not +z
    // optional recolour for variants sharing a model: desaturate the texture towards cfg.tint (amount cfg.recolor, default 0.7)
    if (this.cfg.tint) {
      const k = this.cfg.tint.map(v => v.toFixed(3)).join(', '), a = (this.cfg.recolor ?? 0.7).toFixed(3), key = 'tint' + k + a;
      for (const m of this.mats) {
        m.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
          { float l = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)); diffuseColor.rgb = mix(diffuseColor.rgb, min(vec3(1.0), (0.35 + 1.25 * l) * vec3(${k})), ${a}); }`); };
        m.customProgramCacheKey = () => key; m.needsUpdate = true;
      }
    }
    this.mixer = null;
    if (d.clips.length) { this.mixer = new THREE.AnimationMixer(this.model); this.walk = this.mixer.clipAction(d.clips[0]); this.walk.play(); this.walkDur = d.clips[0].duration; }
    if (!shadowMat) shadowMat = new THREE.MeshBasicMaterial({ map: tex('assets/ui/shadow.png'), transparent: true, depthWrite: false });
    this.shadow = new THREE.Mesh(shadowGeo, shadowMat); this.shadow.rotation.x = -Math.PI / 2; const ss = radius * 2.8; this.shadow.scale.set(ss, ss, 1);
    scene.add(this.root, this.shadow);
    this.size = this.cfg.size; this.phase = Math.random() * 10;
  }
  play(name, speed = 1, restart = false) {
    if (!this.sh.actions[name]) name = 'idle';
    this.speed = speed;
    if (name === this.action && !restart) return;
    this.action = name; this.t = 0; this.finished = false;
  }
  setDir(d) { this.targetYaw = (((d % 8) + 8) % 8) * 45 * DEG; }
  setFacing(x, z) { if (x * x + z * z < 1e-6) return; this.targetYaw = Math.atan2(x, -z); }
  flash(d) { this.flashT = Math.max(this.flashT, d); }
  setTint(r, g, b) { for (const m of this.mats) m.color.setRGB(Math.min(1, r * 1.0), Math.min(1, g), Math.min(1, b)); }
  setVisible(v) { this.visible = v; this.root.visible = v; this.shadow.visible = v; }
  get time01() { const a = this.sh.actions[this.action]; return Math.min(1, this.t * a.fps / a.frames); }
  place(p) { const tp = T(p); this.root.position.copy(tp); this.shadow.position.set(tp.x, tp.y + 0.03, tp.z); }
  update(dt) {
    this.t += dt * Math.max(0, this.speed); this.phase += dt;
    const a = this.sh.actions[this.action], n = a.frames, f = this.t * a.fps;
    if (!a.loop && f >= n) this.finished = true;
    const u = a.loop ? (f % n) / n : Math.min(1, f / n);
    if (this.flashT > 0) this.flashT -= dt;
    for (const m of this.mats) m.emissiveIntensity = this.flashT > 0 ? 0.55 : 0;
    let dy = this.targetYaw - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); this.yaw += dy * Math.min(1, dt * 12);
    this.root.rotation.y = this.yaw;
    // skeletal walk cycle; idle = slow breathing on the paused pose
    if (this.mixer) {
      const moving = this.action === 'walk';
      this.walk.timeScale = moving ? 1.6 * this.speed : 0;
      if (!moving && this.walk.time > 0.02) this.walk.time += (0 - this.walk.time) * Math.min(1, dt * 6);
      this.mixer.update(dt);
    }
    const s = this.size, P = this.pivot, I = this.inner;
    P.position.set(0, 0, 0); P.rotation.set(0, 0, 0); I.position.y = 0; const sc = I.scale.x; let sy = 1, sxz = 1;
    switch (this.action) {
      case 'idle': sy = 1 + Math.sin(this.phase * 2.4) * 0.025; sxz = 1 - Math.sin(this.phase * 2.4) * 0.012; break;
      case 'walk': if (this.cfg.rigless) { P.position.y = Math.abs(Math.sin(this.t * 7)) * 0.12 * s * 0.1; P.rotation.z = Math.sin(this.t * 7) * 0.06; } break;
      case 'attack': case 'skill': case 'cast': case 'throw': {
        const wind = 0.45, k = u < wind ? -Math.sin(u / wind * Math.PI / 2) * 0.35 : Math.sin((u - wind) / (1 - wind) * Math.PI) * 1.0;
        P.position.z = k * s * 0.18;                                        // lunge forward (model faces local +z)
        P.rotation.x = k * 0.18; sy = 1 - Math.max(0, -k) * 0.12; break;
      }
      case 'dash': P.position.z = Math.sin(u * Math.PI) * s * 0.25; P.rotation.x = 0.15; break;
      case 'hit': P.position.z = -Math.sin(u * Math.PI) * s * 0.08; P.rotation.x = -Math.sin(u * Math.PI) * 0.15; break;
      case 'death': P.rotation.z = Math.min(1, u * 1.6) * Math.PI / 2 * 0.95; P.position.y = -Math.max(0, u - 0.6) * s * 0.4; break;
    }
    // squash & stretch around the scaled model (keeps the feet on the ground)
    this.innerScale = this.innerScale || sc; I.scale.set(this.innerScale * sxz, this.innerScale * sy, this.innerScale * sxz);
  }
  dispose() {
    this.scene.remove(this.root, this.shadow);
    for (const m of this.mats) m.dispose();
    if (this.mixer) this.mixer.stopAllAction();
  }
}
