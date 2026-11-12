// 3D monsters made from the user's creature sheet (Tripo image->3D, quadruped rig + baked walk cycle) and the boss
// (Tripo text->3D, unrigged). Same interface as SpriteBody so actors.js / skills keep working; action timing
// (frames / fps / hitFrame) still comes from the monster's original sprite sheet meta, so combat balance is unchanged.
import { THREE, T, tex, paintMat, contactShadowTex } from './render.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const DEG = Math.PI / 180;
/** per monster: model file, size (m, longest horizontal extent or height for 'h'), extra yaw (deg) */
export const CREATURES = {
  mon_slime:  { file: 'cute_rabbit', size: 0.8, height: true, rigless: true, yaw: -90, atk: 'tackle' },
  mon_jelly:  { file: 'cute_slime', size: 0.75, height: true, rigless: true, yaw: -90, jelly: true, atk: 'bounce' },
  mon_fox:    { file: 'cute_fox', size: 0.95, height: true, rigless: true, yaw: -90, atk: 'claw' },
  mon_shroom: { file: 'cute_squirrel', size: 0.85, height: true, rigless: true, yaw: -90, atk: 'throw' },
  mon_wolf:   { file: 'cute_wolf', size: 1.05, height: true, rigless: true, yaw: -90, atk: 'bite' },
  mon_boar:   { file: 'cute_boar', size: 1.0, height: true, rigless: true, yaw: -90, atk: 'charge' },
  mon_golem:  { file: 'cute_bear', size: 1.45, height: true, rigless: true, yaw: -90, atk: 'slam' },
  boss_mushroom: { file: 'cute_boss_mushroom', size: 3.6, height: true, rigless: true, yaw: -90, atk: 'spit' },
  // Lv10-50 zones (tint / recolor: see the constructor)
  mon_mist_fox:      { file: 'cute_fox', size: 1.05, height: true, rigless: true, yaw: -90, tint: [0.78, 0.82, 0.98], recolor: 0.45, atk: 'claw' },
  mon_panda:         { file: 'cute_panda', size: 1.5, height: true, rigless: true, yaw: -90, atk: 'bellybump' },
  mon_fog_toad:      { file: 'cute_toad', size: 0.95, height: true, rigless: true, yaw: -90, atk: 'spit' },
  mon_bog_boar:      { file: 'cute_boar', size: 1.1, height: true, rigless: true, yaw: -90, tint: [0.62, 0.78, 0.5], recolor: 0.45, atk: 'charge' },
  mon_mist_wolf:     { file: 'cute_wolf', size: 1.15, height: true, rigless: true, yaw: -90, tint: [0.7, 0.66, 0.95], recolor: 0.35, atk: 'bite' },
  mon_mist_bear:     { file: 'cute_bear', size: 2.1, height: true, rigless: true, yaw: -90, tint: [0.66, 0.66, 0.92], recolor: 0.5, atk: 'slam' },
  mon_frost_wolf:    { file: 'cute_wolf', size: 1.15, height: true, rigless: true, yaw: -90, tint: [0.88, 0.95, 1.0], recolor: 0.6, atk: 'bite' },
  mon_ice_fox:       { file: 'cute_fox', size: 1.05, height: true, rigless: true, yaw: -90, tint: [0.8, 0.92, 1.0], recolor: 0.6, atk: 'ice' },
  mon_frost_ram:     { file: 'cute_ram', size: 1.1, height: true, rigless: true, yaw: -90, atk: 'headbutt' },
  mon_snow_bear:     { file: 'cute_bear', size: 1.7, height: true, rigless: true, yaw: -90, tint: [0.95, 0.97, 1.0], recolor: 0.7, atk: 'slam' },
  mon_ram_king:      { file: 'cute_ram', size: 1.9, height: true, rigless: true, yaw: -90, tint: [0.7, 0.85, 1.0], recolor: 0.35, atk: 'slam' },
  mon_ember_drake:   { file: 'drake', size: 1.55, height: true, rigless: true, yaw: -90, atk: 'breath' },
  mon_cinder_lizard: { file: 'drake', size: 1.15, height: true, rigless: true, yaw: -90, tint: [1.0, 0.55, 0.12], recolor: 0.4, atk: 'fire' },
  mon_lava_boar:     { file: 'cute_boar', size: 1.15, height: true, rigless: true, yaw: -90, tint: [0.95, 0.45, 0.3], recolor: 0.5, atk: 'charge' },
  mon_ruin_golem:    { file: 'cute_golem', size: 1.9, height: true, rigless: true, yaw: -90, atk: 'slam' },
  mon_drake_lord:    { file: 'drake', size: 2.7, height: true, rigless: true, yaw: -90, tint: [0.42, 0.22, 0.58], recolor: 0.45, atk: 'breath' },
  boss_ancient_dragon: { file: 'cute_dragon', size: 4.0, height: true, rigless: true, yaw: -90, atk: 'breath' },
  // WORLD variants (tools/world/world.py)
  mon_rock_ram: { file: 'cute_ram', size: 1.10, height: true, rigless: true, yaw: -90, tint: [0.78, 0.74, 0.70], recolor: 0.4, atk: 'headbutt' },
  mon_cliff_wolf: { file: 'cute_wolf', size: 1.05, height: true, rigless: true, yaw: -90, tint: [0.72, 0.70, 0.64], recolor: 0.35, atk: 'bite' },
  mon_blue_jelly: { file: 'cute_slime', size: 0.75, height: true, rigless: true, yaw: -90, jelly: true, tint: [0.50, 0.76, 1.00], recolor: 0.5, atk: 'bounce' },
  mon_shadow_wolf: { file: 'cute_wolf', size: 1.05, height: true, rigless: true, yaw: -90, tint: [0.40, 0.32, 0.52], recolor: 0.6, atk: 'bite' },
  mon_phantom_fox: { file: 'cute_fox', size: 0.95, height: true, rigless: true, yaw: -90, tint: [0.62, 0.86, 1.00], recolor: 0.55, atk: 'claw' },
  mon_phantom_bear: { file: 'cute_bear', size: 2.10, height: true, rigless: true, yaw: -90, tint: [0.56, 0.82, 1.00], recolor: 0.6, atk: 'slam' },
  mon_dust_boar: { file: 'cute_boar', size: 1.00, height: true, rigless: true, yaw: -90, tint: [0.86, 0.72, 0.56], recolor: 0.4, atk: 'charge' },
  mon_ash_toad: { file: 'cute_toad', size: 0.95, height: true, rigless: true, yaw: -90, tint: [0.62, 0.60, 0.58], recolor: 0.55, atk: 'spit' },
  mon_canyon_ram: { file: 'cute_ram', size: 1.10, height: true, rigless: true, yaw: -90, tint: [0.92, 0.76, 0.56], recolor: 0.4, atk: 'headbutt' },
  mon_berg_bear: { file: 'cute_bear', size: 1.45, height: true, rigless: true, yaw: -90, tint: [0.78, 0.62, 0.46], recolor: 0.45, atk: 'slam' },
  mon_blackeye_wolf: { file: 'cute_wolf', size: 1.05, height: true, rigless: true, yaw: -90, tint: [0.28, 0.22, 0.32], recolor: 0.7, atk: 'bite' },
  mon_crimson_boar: { file: 'cute_boar', size: 1.00, height: true, rigless: true, yaw: -90, tint: [0.92, 0.32, 0.26], recolor: 0.55, atk: 'charge' },
  mon_mine_golem: { file: 'cute_golem', size: 1.90, height: true, rigless: true, yaw: -90, tint: [0.72, 0.66, 0.60], recolor: 0.4, atk: 'slam' },
  mon_crimson_fox: { file: 'cute_fox', size: 0.95, height: true, rigless: true, yaw: -90, tint: [0.96, 0.36, 0.30], recolor: 0.55, atk: 'claw' },
  mon_crimson_bear: { file: 'cute_bear', size: 2.10, height: true, rigless: true, yaw: -90, tint: [1.00, 0.30, 0.36], recolor: 0.6, atk: 'slam' },
  mon_kreutz_wolf: { file: 'cute_wolf', size: 1.15, height: true, rigless: true, yaw: -90, tint: [0.80, 0.86, 0.96], recolor: 0.5, atk: 'bite' },
  mon_tomb_golem: { file: 'cute_golem', size: 1.90, height: true, rigless: true, yaw: -90, tint: [1.00, 0.86, 0.52], recolor: 0.45, atk: 'slam' },
  mon_void_toad: { file: 'cute_toad', size: 0.95, height: true, rigless: true, yaw: -90, tint: [0.56, 0.36, 0.76], recolor: 0.6, atk: 'spit' },
  mon_ash_drake: { file: 'drake', size: 1.55, height: true, rigless: true, yaw: -90, tint: [0.52, 0.50, 0.52], recolor: 0.55, atk: 'breath' },
  mon_lake_bear: { file: 'cute_bear', size: 2.46, height: true, rigless: true, yaw: -90, tint: [0.70, 0.86, 1.00], recolor: 0.55, atk: 'slam' },
  mon_abyss_drake: { file: 'drake', size: 1.55, height: true, rigless: true, yaw: -90, tint: [0.32, 0.16, 0.42], recolor: 0.65, atk: 'breath' },
  mon_mole: { file: 'w_mole', size: 0.85, height: true, rigless: true, yaw: -90, atk: 'tackle' },
  mon_sapling: { file: 'w_sapling', size: 1.00, height: true, rigless: true, yaw: -90, atk: 'slam' },
  mon_beetle: { file: 'w_beetle', size: 0.95, height: true, rigless: true, yaw: -90, atk: 'charge' },
  mon_hawk: { file: 'w_hawk', size: 0.95, height: true, rigless: true, yaw: -90, atk: 'claw' },
  mon_moth: { file: 'w_moth', size: 1.05, height: true, rigless: true, yaw: -90, atk: 'spit' },
  mon_owl: { file: 'w_owl', size: 0.95, height: true, rigless: true, yaw: -90, atk: 'claw' },
  mon_spider: { file: 'w_spider', size: 1.10, height: true, rigless: true, yaw: -90, atk: 'bite' },
  mon_spider_elite: { file: 'w_spider', size: 2.30, height: true, rigless: true, yaw: -90, tint: [0.70, 0.85, 1.00], recolor: 0.45, atk: 'bite' },
  mon_wisp: { file: 'w_wisp', size: 0.95, height: true, rigless: true, yaw: -90, atk: 'fire' },
  mon_wraith: { file: 'w_wraith', size: 1.05, height: true, rigless: true, yaw: -90, atk: 'claw' },
  mon_scorpion: { file: 'w_scorpion', size: 1.05, height: true, rigless: true, yaw: -90, atk: 'claw' },
  mon_soldier: { file: 'w_soldier', size: 1.15, height: true, rigless: true, yaw: -90, atk: 'slam' },
  mon_crab: { file: 'w_crab', size: 1.05, height: true, rigless: true, yaw: -90, atk: 'claw' },
  mon_salamander: { file: 'w_salamander', size: 1.05, height: true, rigless: true, yaw: -90, atk: 'fire' },
  mon_crystal: { file: 'w_crystal', size: 1.25, height: true, rigless: true, yaw: -90, atk: 'slam' },
  mon_yeti: { file: 'w_yeti', size: 1.25, height: true, rigless: true, yaw: -90, atk: 'slam' },
  mon_armor: { file: 'w_armor', size: 1.35, height: true, rigless: true, yaw: -90, atk: 'slam' },
  mon_bat: { file: 'w_bat', size: 1.05, height: true, rigless: true, yaw: -90, atk: 'bite' },
  mon_hedgehog: { file: 'w_hedgehog', size: 0.80, height: true, rigless: true, yaw: -90, atk: 'tackle' },
  mon_snail: { file: 'w_snail', size: 0.95, height: true, rigless: true, yaw: -90, atk: 'tackle' },
  mon_hornet: { file: 'w_hornet', size: 0.85, height: true, rigless: true, yaw: -90, atk: 'spit' },
  mon_mandrake: { file: 'w_mandrake', size: 0.80, height: true, rigless: true, yaw: -90, atk: 'tackle' },
  mon_turtle: { file: 'w_turtle', size: 0.95, height: true, rigless: true, yaw: -90, atk: 'tackle' },
  mon_stumpling: { file: 'w_stumpling', size: 1.05, height: true, rigless: true, yaw: -90, atk: 'slam' },
  mon_armadillo: { file: 'w_armadillo', size: 0.95, height: true, rigless: true, yaw: -90, atk: 'charge' },
  mon_goblin_miner: { file: 'w_goblin_miner', size: 0.95, height: true, rigless: true, yaw: -90, atk: 'claw' },
  mon_gargoyle: { file: 'w_gargoyle', size: 1.00, height: true, rigless: true, yaw: -90, atk: 'claw' },
  mon_pixie: { file: 'w_pixie', size: 0.85, height: true, rigless: true, yaw: -90, atk: 'spit' },
  mon_spirit_deer: { file: 'w_spirit_deer', size: 1.35, height: true, rigless: true, yaw: -90, atk: 'charge' },
  mon_lantern_ghost: { file: 'w_lantern_ghost', size: 1.00, height: true, rigless: true, yaw: -90, atk: 'fire' },
  // /WORLD
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
/** a monster that borrows another species' model (monsters.json "look": {base, size, tint, recolor} — quest bosses) */
export async function loadCreatureLook(look) { const b = CREATURES[look.base]; if (!b) return null; const c = { ...b, ...look }; delete c.base; return { cfg: c, data: await load(c.file) }; }

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
    for (const m of this.mats) paintMat(m, this.cfg.boss || /boss/.test(this.cfg.file) ? { rimK: 0.26, sat: 1.1 } : {});
    this.mixer = null;
    if (d.clips.length) { this.mixer = new THREE.AnimationMixer(this.model); this.walk = this.mixer.clipAction(d.clips[0]); this.walk.play(); this.walkDur = d.clips[0].duration; }
    if (!shadowMat) shadowMat = new THREE.MeshBasicMaterial({ map: contactShadowTex(), transparent: true, depthWrite: false });
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
  /** heavy blow reaction (약사 유봉강타): squashed + tipped away from the blow at once, springs back over `d` s. Visual only —
   *  the actor's position is untouched. (x, z) = blow direction in game space. A new punch restarts it, never adds. */
  punch(x, z, d = 0.2) { const m = Math.hypot(x, z) || 1; this.punchT = d; this.punchD = d; this.punchX = x / m; this.punchZ = -z / m; }
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
      case 'walk': if (this.cfg.rigless) {                                // bouncy waddle: hop, squash on landing, side-to-side rock
        const ph = this.t * 7.5 * Math.max(0.6, this.speed), hop = Math.abs(Math.sin(ph));
        P.position.y = hop * Math.min(0.18, 0.07 * s); P.rotation.z = Math.sin(ph) * 0.09; P.rotation.x = 0.06;
        sy = 1 + (hop - 0.35) * (this.cfg.jelly ? 0.28 : 0.08); sxz = 1 - (hop - 0.35) * (this.cfg.jelly ? 0.14 : 0.04);
      } break;
      case 'attack': case 'skill': case 'cast': case 'throw': {
        // per-monster attack motion (cfg.atk): wind-up (w 0..1) then strike (k 0..1..0)
        const wind = 0.45, w = u < wind ? Math.sin(u / wind * Math.PI / 2) : Math.max(0, 1 - (u - wind) / 0.12), k = u < wind ? 0 : Math.sin((u - wind) / (1 - wind) * Math.PI);
        const sz = Math.min(1.6, s);                                        // motion amplitudes in body sizes, capped for huge bosses
        switch (this.cfg.atk || 'tackle') {
          case 'tackle': P.position.z = (k * 0.32 - w * 0.08) * sz; P.position.y = k * 0.2 * sz; P.rotation.x = k * 0.3 - w * 0.15; sy = 1 - w * 0.18 + k * 0.08; sxz = 1 + w * 0.08; break;
          case 'bounce': P.position.y = k * 0.35 * sz; P.position.z = k * 0.25 * sz; sy = 1 - w * 0.35 + k * 0.25; sxz = 1 + w * 0.2 - k * 0.12; break;
          case 'claw': P.rotation.x = -w * 0.45 + k * 0.35; P.rotation.y = (u < wind ? -w * 0.35 : -0.35 + (u - wind) / (1 - wind) * 0.9); P.rotation.z = k * 0.2; P.position.z = k * 0.18 * sz; P.position.y = w * 0.06 * sz; break;
          case 'bite': P.position.z = (k * 0.3 - w * 0.06) * sz; P.rotation.x = -w * 0.2 + k * 0.35; sy = 1 - w * 0.08; break;
          case 'charge': case 'headbutt': P.rotation.x = w * 0.28 + k * (this.cfg.atk === 'headbutt' ? 0.4 : 0.15); P.position.z = (k * 0.55 - w * 0.12) * sz; sy = 1 - w * 0.1; break;
          case 'bellybump': P.position.z = k * 0.3 * sz; P.rotation.x = -w * 0.3 - k * 0.2; sxz = 1 + k * 0.12; sy = 1 - k * 0.06; break;
          case 'throw': P.rotation.x = -w * 0.5 + k * 0.4; P.position.y = k * 0.1 * sz; P.position.z = k * 0.06 * sz; break;
          case 'spit': case 'ice': case 'fire': sy = 1 + w * 0.14 - k * 0.08; sxz = 1 + w * 0.1; P.rotation.x = -w * 0.15 + k * 0.25; P.position.z = -k * 0.05 * sz; break;
          case 'breath': P.rotation.x = -w * 0.4 + (u < wind ? 0 : 0.25 * Math.min(1, (u - wind) / 0.15)); P.position.z = k * 0.08 * sz; sy = 1 + w * 0.06; break;
          case 'slam': P.position.y = (w * 0.45 + (u < wind ? 0 : Math.max(0, 0.45 - (u - wind) / 0.1 * 0.45))) * sz * (u < wind ? 1 : 1) * (u < wind ? 1 : 0.6); P.rotation.x = -w * 0.25 + k * 0.3; sy = 1 + w * 0.1 - k * 0.25; sxz = 1 + k * 0.15; break;
        }
        break;
      }
      case 'dash': P.position.z = Math.sin(u * Math.PI) * s * 0.25; P.rotation.x = 0.15; break;
      case 'hit': P.position.z = -Math.sin(u * Math.PI) * s * 0.08; P.rotation.x = -Math.sin(u * Math.PI) * 0.15; break;
      case 'death': P.rotation.z = Math.min(1, u * 1.6) * Math.PI / 2 * 0.95; P.position.y = -Math.max(0, u - 0.6) * s * 0.4; break;
    }
    if (this.punchT > 0) {   // squash down + lean / slide a little along the blow, overshoot once on the way back
      this.punchT -= dt; const u = 1 - Math.max(0, this.punchT) / this.punchD, k = u < 0.3 ? 1 - 0.25 * (u / 0.3) : 0.75 * Math.cos((u - 0.3) / 0.7 * Math.PI * 1.5) * (1 - (u - 0.3) / 0.7);
      const c = Math.cos(this.yaw), sn = Math.sin(this.yaw), lx = this.punchX * c - this.punchZ * sn, lz = this.punchX * sn + this.punchZ * c;   // blow direction in the root's local frame
      sy *= 1 - 0.16 * k; sxz *= 1 + 0.09 * k; P.position.x += lx * 0.07 * s * k; P.position.z += lz * 0.07 * s * k; P.rotation.x += lz * 0.16 * k; P.rotation.z += -lx * 0.16 * k;
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
