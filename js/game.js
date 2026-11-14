// Game orchestrator + zone runtime. Port of Boot/ArcanGame.cs and World/ZoneRuntime.cs.
import { GameData, SaveStore, SAVE_SLOTS, saveSlotKey, CharacterSheet, QuestLog, QS, ZoneGeometry, NavGrid, newProfile, DEG, clamp, HitShape, levelGapExp, monsterAtLevel, discoverTown, payWarp, warpPrice, zoneLock, questCategory } from './core.js';
import { Renderer, Fx, TelegraphView, TG_TIME, loadSheet, preloadTextures, THREE, T } from './render.js';
import { Player, Monster, Boss, Npc, Loot, bindGame as bindActors } from './actors.js';
import { Input, Audio } from './io.js';
import { UI, bindGame as bindUi, rewardText } from './ui.js';
import { loadPlayerModel, loadActions } from './model.js';
import { buildNature } from './nature.js';
import { buildTown3D } from './town3d.js';
import { Warp } from './warp.js';
import { bindSkillRt } from './skillrt.js';
import { bindSkillUi } from './skillui.js';
import { installDev } from './devtools.js';
import { QuestWorld } from './questworld.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const zoneJsonCache = new Map();
async function fetchJson(p) { const r = await fetch(p); if (!r.ok) throw new Error(p + " " + r.status); return r.json(); }

// ======================================================================================= telegraph
/** quest mark over an NPC: a fat outlined "!" / "?" drawn as SVG (fonts differ per device), gold or green gradient */
const QMARK = (ch, c0, c1, c2, ink, crown) => {
  const id = 'qm' + (ch === '!' ? 'a' : 'r') + (crown ? 'm' : '');
  const shape = ch === '!'
    ? '<path d="M9 6 Q9 2 13 2 L23 2 Q27 2 27 6 L24.5 44 Q24.2 48 21 48 L15 48 Q11.8 48 11.5 44 Z"/><circle cx="18" cy="60" r="7.5"/>'
    : '<path d="M5 22 Q5 3 19 3 Q33 3 33 18 Q33 27 25 31 Q22.5 33 22.5 37 L22.5 44 L13.5 44 L13.5 35 Q13.5 27 20 23.5 Q24 21 24 17.5 Q24 12 19 12 Q14 12 14 19 Z"/><circle cx="18" cy="58" r="7.5"/>';
  // 메인 퀘스트(crown): 글자 위에 금관 + 붉은 보석 (2026-11-15) — 서브 퀘스트 표시는 그대로
  const cr = crown ? `<g stroke="${ink}" stroke-width="2.4" stroke-linejoin="round"><path d="M2 -3 L4 -24 L11.5 -13 L18 -29 L24.5 -13 L32 -24 L34 -3 Z" fill="url(#qmcrown)"/>`
    + `<circle cx="18" cy="-10" r="3.4" fill="#e8283c"/><circle cx="4" cy="-24" r="2.4" fill="#fff3b0"/><circle cx="18" cy="-29" r="2.6" fill="#fff3b0"/><circle cx="32" cy="-24" r="2.4" fill="#fff3b0"/></g>` : '';
  return `<b class="qmark${crown ? ' qmain' : ''}"><svg viewBox="${crown ? '-4 -34 46 106' : '-4 -4 46 76'}" width="40" height="${crown ? 92 : 66}"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c0}"/><stop offset=".45" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>`
    + (crown ? `<linearGradient id="qmcrown" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffbe0"/><stop offset=".5" stop-color="#ffd23a"/><stop offset="1" stop-color="#c47a08"/></linearGradient>` : '') + `</defs>` + cr
    + `<g fill="${ink}" stroke="${ink}" stroke-width="6" stroke-linejoin="round" transform="translate(0 2.5)">${shape}</g>`
    + `<g fill="url(#${id})" stroke="${ink}" stroke-width="2.5" stroke-linejoin="round">${shape}</g>`
    + `<path d="M13.5 6 L17 6 L15.8 30" stroke="#fff" stroke-opacity=".55" stroke-width="2.4" fill="none" stroke-linecap="round" ${ch === '!' ? '' : 'display="none"'}/></svg></b>`;
};

class Telegraph {
  constructor(zone, shape, time, color, onFire) {
    this.zone = zone; this.shape = shape; this.time = Math.max(0.05, time); this.t = 0; this.onFire = onFire;
    this.view = new TelegraphView(G.render.scene, shape, zone.geo, color, false);
  }
  update(dt) {
    if (this.dead) return; this.t += dt;
    this.view.setProgress(Math.min(1, this.t / this.time));
    if (this.t >= this.time) { this.dead = true; this.view.dispose(); if (this.onFire) this.onFire(this); }
  }
  cancel() { if (this.dead) return; this.dead = true; this.view.dispose(); }
  dispose() { this.cancel(); }
}

// ======================================================================================= zone runtime
class Zone {
  constructor(def, json) {
    this.def = def; this.json = json; this.geo = new ZoneGeometry(def); this.nav = new NavGrid(this.geo, G.data.config.playerRadius);
    this.actors = []; this.npcs = []; this.things = []; this.spawners = []; this.boss = null; this.bossRespawnT = 0;
    this.tint = def.spriteTint && def.spriteTint.length >= 3 ? def.spriteTint : [1, 1, 1];
    this.smokeT = 0; this.sprayT = 0; this.portalArmed = false; this.barrier = null;
  }
  async build() {
    G.render.buildZone(this.json); G.render.setZoneLight(this.def);
    if (G.render.post) Object.assign(G.render.post.params, G.render.post.defaults, this.def.post || {});
    await G.render.buildImageArt(this.def.imageArt || []);
    if (this.def.town3d) {
      // 3D castle town: user's models + modelled shops, walls, courtyard ground (replaces the builder's grass ground)
      const t3 = await buildTown3D(this.def.town3d, G.render.r);
      G.render.zoneRoot.add(t3.root);
      // the old builder's ground, bushes, flowers and crates are replaced by the 3D town
      for (const g of G.render.groups) if (['ground', 'patches', 'props', 'tree'].includes(g.name)) for (const m of g.meshes) m.visible = false;
      G.render.groups.push(...t3.fade);
      this.json.smoke = [...(this.json.smoke || []), ...t3.smoke]; this.json.fountain = [];   // no 2D splash sprites over the 3D fountain
      this.town3d = t3;
    }
    if (this.def.nature) {
      // storybook forest: painted ground, Tripo trees / shrubs / rocks, grass and flower cards (js/nature.js)
      // patches: roads / dirt / forest floor are painted by the nature ground; water, ice, stone floors stay
      const PAINTED = /\/(dirt|cobble|cobble_warm|forest_floor|grass[a-z_]*)$/;
      for (const g of G.render.groups) if (['ground', 'props', 'tree'].includes(g.name)) for (const m of g.meshes) m.visible = false;
      for (const g of G.render.groups) if (g.name === 'patches') for (const m of g.meshes) if (!m.userData.water && PAINTED.test(m.userData.tex || '')) m.visible = false;
      this.nature = await buildNature(this, G.render.r);
      for (const g of G.render.groups) if (g.name === 'terrain') for (const m of g.meshes) if (/boss_floor$/.test(m.userData.tex || '')) { m.material = this.nature.magicFloor; m.receiveShadow = true; }
      G.render.zoneRoot.add(this.nature.root);
      if (this.nature.water) for (const g of G.render.groups) for (const m of g.meshes) if (m.userData.water) m.visible = false;   // nature draws the ponds
    }
    // the old builder's flat flower clusters (untextured little cubes on the ground) look like stray debris: hide them
    for (const g of G.render.groups) if (g.name === 'props') for (const m of g.meshes) {
      if (m.material.map) continue; m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox;
      if (b.max.y - b.min.y < 0.15) m.visible = false;
    }
    // warp gates at every zone exit (replace the builder's portal mesh)
    for (const g of G.render.groups) if (g.name.startsWith('portal')) for (const m of g.meshes) m.visible = false;
    this.warps = (this.def.portals || []).map(pt => new Warp(G.render.zoneRoot, this.geo.ground(pt.pos[0], pt.pos[1]), pt.radius));
    const jobs = [];
    for (const n of this.def.npcs || []) {
      const nd = G.data.npcs[n.npc]; if (!nd) continue;
      const npc = new Npc(this, nd, this.geo.ground(n.pos[0], n.pos[1]), n.rot); this.npcs.push(npc); jobs.push(npc.attachBody());
    }
    for (const ms of this.evenSpawners(this.def.monsters || [])) { const sp = { def: ms, alive: [], timers: [] }; this.spawners.push(sp); for (let i = 0; i < ms.count; i++) jobs.push(this.spawnFor(sp)); }
    if (this.def.boss && this.def.boss.boss) jobs.push(this.spawnBoss());
    await Promise.all(jobs);
  }
  async spawnFor(sp) {
    const md0 = G.data.monsters[sp.def.monster]; if (!md0) return;
    const md = sp.def.level ? monsterAtLevel(md0, sp.def.level, G.data.levels) : md0;   // camp level (field's place in the story)
    // spread spawners (zones.json "spread": min gap in m) scatter one by one over a wide area, trees included, each
    // monster roaming round its own spot; old camp spawners keep the shared camp centre
    const P = G.player, away = sp.def.spread && P ? { x: P.pos.x, z: P.pos.z, d: 12 } : null;
    const pos = this.spacedSpot(sp.def.pos[0], sp.def.pos[1], sp.def.radius, md.radius, sp.def.spread || 0, away);
    if (!pos) { sp.timers.push(3); return; }
    const home = sp.def.spread ? this.geo.ground(pos.x, pos.z) : this.geo.ground(sp.def.pos[0], sp.def.pos[1]);
    const m = new Monster(this, md, pos, home, sp.def.spread ? Math.min(sp.def.radius, 5) : sp.def.radius);
    m.onRemoved = mm => { sp.alive.splice(sp.alive.indexOf(mm), 1); sp.timers.push(md.respawn); };
    sp.alive.push(m); this.actors.push(m); await m.attachBody(); m.body.place(m.pos);
  }
  /** spread a field's monsters evenly: the data lists a few camps (species, area, count); here the walkable field is cut
   *  into a grid of ~24 m cells and every usable cell gets a small camp of the species of the nearest data camp (so
   *  each area keeps its monsters and level), the total count is kept (at least one monster per ~520 m2). Cells near
   *  portals / player spawns / the boss arena or mostly blocked (trees, water) are skipped. Single elites stay where
   *  the data puts them. Towns and fields without "spread" camps are left alone. */
  evenSpawners(list) {
    const camps = list.filter(m => m.spread && m.count > 1), keep = list.filter(m => !(m.spread && m.count > 1));
    if (camps.length < 1 || this.def.kind === "town" || this.def.evenMonsters === false) return list;
    const [x0, z0, x1, z1] = this.def.bounds, W = x1 - x0, H = z1 - z0, cell = 24, avoid = [];
    for (const p of this.def.portals || []) avoid.push([p.pos[0], p.pos[1], 14]);
    for (const p of this.def.spawns || []) avoid.push([p.pos[0], p.pos[1], 14]);
    const cells = [];
    for (let cz = z0 + cell / 2; cz < z1 - 4; cz += cell) for (let cx = x0 + cell / 2; cx < x1 - 4; cx += cell) {
      if (avoid.some(([ax, az, r]) => Math.hypot(cx - ax, cz - az) < r) || this.inArena({ x: cx, z: cz }, 8)) continue;
      let free = 0; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const x = cx + i * 7, z = cz + j * 7; if (x > x0 + 2 && x < x1 - 2 && z > z0 + 2 && z < z1 - 2 && !this.geo.blocked(x, z, 0.5)) free++; }
      if (free >= 4) cells.push([cx, cz]);
    }
    // 필드 몬스터 수 배율(config.json fieldMonsterMul, 2026-11-09 1.3 = 30% 증가) — 혼자 있는 정예(count 1)는 그대로
    const mul = (G.data.config && G.data.config.fieldMonsterMul) || 1;
    if (!cells.length) return list.map(m => camps.includes(m) ? { ...m, count: Math.round(m.count * mul) } : m);
    const total = Math.round(Math.max(camps.reduce((a, m) => a + m.count, 0), Math.round(W * H / 520)) * mul);
    const base = Math.floor(total / cells.length);
    const out = cells.map(([cx, cz]) => {
      let near = camps[0], bd = 1e9; for (const m of camps) { const d = Math.hypot(m.pos[0] - cx, m.pos[1] - cz); if (d < bd) { bd = d; near = m; } }
      return { monster: near.monster, level: near.level, pos: [cx, cz], radius: cell * 0.48, count: base, spread: near.spread };
    });
    let sum = out.reduce((a, m) => a + m.count, 0);                              // hand out what rounding left over
    for (let i = 0; sum < total && i < out.length * 3; i++) { out[(i * 7) % out.length].count++; sum++; }
    return out.filter(m => m.count > 0).concat(keep);
  }
  /** a free spot in the camp circle that keeps its distance from monsters already there (best of several tries) */
  spacedSpot(cx, cz, R, rad, spread = 0, away = null) {
    const others = this.actors.filter(a => a.def && !a.dead && a.faction !== "player");
    const want = Math.max(spread, 2.2 + rad * 2); let best = null, bestD = -1;
    for (let i = 0; i < (spread ? 40 : 16); i++) {
      const grow = spread ? 1 : i < 8 ? 1 : 1.35, a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * R * grow;
      const q = this.geo.nearestFree(cx + Math.cos(a) * r, cz + Math.sin(a) * r, rad);
      if (spread && (this.geo.blocked(q.x, q.z, rad) || (this.nav && !this.nav.ok(...this.nav.cellOf(q.x, q.z))) || this.inArena(q, 3))) continue;
      if (away && Math.hypot(q.x - away.x, q.z - away.z) < away.d) continue;
      let d = 99; for (const o of others) d = Math.min(d, Math.hypot(o.pos.x - q.x, o.pos.z - q.z) - (o.radius || 0.4) - rad);
      if (d >= want) return q;
      if (d > bestD) { bestD = d; best = q; }
    }
    return best;
  }
  async spawnBoss() {
    const b = this.def.boss, md = G.data.monsters[b.boss], pos = this.geo.ground(b.bossPos[0], b.bossPos[1]);
    const boss = new Boss(this, md, pos, { cx: b.center[0], cz: b.center[1], r: b.radius });
    boss.onRemoved = () => { if (this.boss === boss) this.boss = null; this.bossRespawnT = b.respawn; };
    this.boss = boss; this.actors.push(boss); await boss.attachBody(); boss.body.place(boss.pos);
  }
  summon(id, around, n) {
    const md = G.data.monsters[id], list = [], a0 = Math.random() * Math.PI * 2; if (!md) return list;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i + Math.random() * 0.4) / n * Math.PI * 2, pos = this.geo.nearestFree(around.x + Math.cos(a) * 3.5, around.z + Math.sin(a) * 3.5, md.radius);
      const m = new Monster(this, md, pos, pos, 3); m.aggro = true; this.actors.push(m); list.push(m);
      m.attachBody().then(() => m.body.place(m.pos)); G.fx.play("smoke", { x: pos.x, y: pos.y + 0.3, z: pos.z }, 1.2);
    }
    return list;
  }
  removeActor(c) { const i = this.actors.indexOf(c); if (i >= 0) this.actors.splice(i, 1); }
  dropLoot(id, n, at) { this.things.push(new Loot(this, id, n, at)); }

  update(dt) {
    const p = G.player;
    for (const sp of this.spawners) for (let i = sp.timers.length - 1; i >= 0; i--) {
      sp.timers[i] -= dt; if (sp.timers[i] > 0) continue; sp.timers.splice(i, 1);
      if (!sp.def.spread && p && Math.hypot(p.pos.x - sp.def.pos[0], p.pos.z - sp.def.pos[1]) < sp.def.radius + 3) { sp.timers.push(3); continue; }
      this.spawnFor(sp);
    }
    if (!this.boss && this.def.boss && this.def.boss.boss) { this.bossRespawnT -= dt; if (this.bossRespawnT <= 0 && !this.playerInArena(this.def.boss.radius + 4)) this.spawnBoss(); }
    for (const a of this.actors.slice()) if (a !== p && a.update) a.update(dt);
    for (const n of this.npcs) n.update(dt);
    for (const t of this.things.slice()) { t.update(dt); }
    this.things = this.things.filter(t => !t.dead);
    this.separate(dt);
    // freezeT: local hit-stop (배쉬) - only this actor's animation nearly stops, the rest of the game keeps running
    for (const a of this.actors) if (a.body) { a.body.place(a.pos); let bd = dt; if (a.freezeT > 0) { a.freezeT -= dt; bd = dt * 0.05; } a.body.update(bd); }
    this.updatePortals(); this.updateArena();
    if (this.town3d) this.town3d.update(dt);
    if (this.nature) this.nature.update(dt);
    for (const w of this.warps || []) w.update(dt);
    this.smokeT -= dt; if (this.smokeT <= 0) { this.smokeT = 0.7; for (const s of this.json.smoke || []) G.fx.play("smoke", { x: s[0], y: s[1], z: s[2] }, 1.2, false, [0.9, 0.9, 0.9, 0.8]); }
    this.sprayT -= dt; if (this.sprayT <= 0) { this.sprayT = 0.35; for (const f of this.json.fountain || []) G.fx.play("potion_splash", { x: f[0] + rnd(-0.3, 0.3), y: f[1], z: f[2] + rnd(-0.3, 0.3) }, 0.9, false, [0.7, 0.9, 1]); }
  }
  /** keep monsters from stacking on each other (or standing inside the player) when several rush in: overlapping pairs are
   *  pushed apart along the line between them, softly and through the normal wall-aware movement. Body size counts, not
   *  only the logic radius, so big cute models do not visually overlap either. */
  separate(dt) {
    const list = this.actors.filter(a => a && !a.dead && a.pos && a.radius > 0);
    const R = a => Math.max(a.radius, a.body && a.body.size && a.faction !== "player" ? a.body.size * 0.36 : 0);
    const k = Math.min(1, dt * 14);
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (a.faction === "player" && b.faction === "player") continue;
      if (a.isBoss || b.isBoss) { if (a.faction !== "player" && b.faction !== "player") continue; }
      let dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz);
      const min = R(a) + R(b) + 0.05; if (d >= min) continue;
      if (d < 1e-4) { const ang = (i * 7 + j * 13) % 6.28; dx = Math.cos(ang); dz = Math.sin(ang); d = 1; } else { dx /= d; dz /= d; }
      const push = (min - d) * k;
      // the player is not shoved by monsters (that would steal control); monsters make room for the player and each other
      const wa = a.faction === "player" ? 0 : b.faction === "player" ? 1 : 0.5, wb = 1 - wa;
      if (wa > 0 && a.moveBy) a.moveBy(-dx * push * wa, -dz * push * wa);
      if (wb > 0 && b.moveBy) b.moveBy(dx * push * wb, dz * push * wb);
    }
  }
  updatePortals() {
    const p = G.player; if (!p || p.dead || p.zone !== this || G.loading) return;
    let inAny = false;
    for (const pt of this.def.portals || []) {
      if (Math.hypot(p.pos.x - pt.pos[0], p.pos.z - pt.pos[1]) > pt.radius) continue;
      inAny = true; if (!this.portalArmed) continue;
      // 2026-11-15: 레벨 문 대신 메인 퀘스트 진행 문 (core.js zoneLock) — 막히면 이동하지 않고 까닭만
      const L = G.lockOf(pt.targetZone); if (L) { G.ui.toast(L.text); G.audio.sfx("ui"); this.portalArmed = false; continue; }
      G.travel(pt.targetZone, pt.targetSpawn); return;
    }
    if (!inAny) this.portalArmed = true;
  }
  inArena(p, margin) { const b = this.def.boss; return !!(b && b.center && b.center.length >= 2 && Math.hypot(p.x - b.center[0], p.z - b.center[1]) < b.radius + margin); }
  playerInArena(r) { const p = G.player, b = this.def.boss; return !!(p && b && b.center && b.center.length >= 2 && Math.hypot(p.pos.x - b.center[0], p.pos.z - b.center[1]) < r); }
  updateArena() {
    const b = this.boss, p = G.player; if (!b || b.dead || !p) return;
    if (!b.fight && !p.dead && this.playerInArena(this.def.boss.radius - 3)) G.startBossFight(b);
    // the arena is the raised platform sealed by the gate barrier: only death or actually leaving the platform resets the fight
    if (b.fight && (p.dead || !this.onBossPlatform(p))) G.endBossFight(false);
  }
  onBossPlatform(p) { const b = this.boss; return !!b && Math.abs(p.pos.y - b.home.y) < 0.6 && this.playerInArena(this.def.boss.radius + 12); }
  setBarrier(closed) {
    const b = this.def.boss; if (!b || !b.gate || b.gate.length < 2) return;
    this.geo.removeTag("arena_gate");
    if (this.barrier) { G.render.scene.remove(this.barrier); this.barrier.geometry.dispose(); this.barrier.material.dispose(); this.barrier = null; }
    if (this.barrierRing) { this.barrierRing.dispose(); this.barrierRing = null; }
    if (!closed) return;
    this.geo.addCircle(b.gate[0], b.gate[1], b.gateRadius, "arena_gate");
    const gp = this.geo.ground(b.gate[0], b.gate[1]);
    // magic containment: a rune circle on the ground + an almost clear energy wall (bright at the foot, fading upward,
    // thin vertical streaks and rising motes) instead of a solid tinted cylinder
    this.barrierRing = new TelegraphView(G.render.scene, HitShape.circle(b.gate[0], b.gate[1], b.gateRadius), this.geo, [0.66, 0.42, 1.0], true, true);
    const wallMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uT: TG_TIME },
      vertexShader: `varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uT; varying vec2 vU;
float h(float x){ return fract(sin(x * 91.7) * 4375.85); }
void main(){
  float y = vU.y, x = vU.x * 48.;
  float foot = exp(-y * 5.) * .55, fade = (1. - smoothstep(.55, 1., y)) * .1;
  float streak = smoothstep(.06, .0, abs(fract(x) - .5) - .38) * .06 * (1. - y);
  float c = floor(x), ph = fract(uT * (.25 + h(c) * .3) + h(c + 3.)); float mote = smoothstep(.05, .0, abs(y - ph)) * smoothstep(.2, .0, abs(fract(x) - .5)) * step(.6, h(c + 9.)) * (1. - ph);
  float a = foot + fade + streak + mote * .8;
  gl_FragColor = vec4(mix(vec3(.72, .5, 1.), vec3(.95, .88, 1.), foot + mote), a);
  #include <colorspace_fragment>
}` });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(b.gateRadius, b.gateRadius, 2.4, 48, 1, true), wallMat);
    m.position.copy(T({ x: gp.x, y: gp.y + 1.2, z: gp.z })); m.renderOrder = 4; G.render.scene.add(m); this.barrier = m;
  }
  nearestEnemy(from, range) {
    let best = null, bd = range;
    for (const c of this.actors) { if (c.dead || c.faction === from.faction || Math.abs(c.pos.y - from.pos.y) > 1.4) continue; const d = Math.hypot(c.pos.x - from.pos.x, c.pos.z - from.pos.z) - c.radius; if (d < bd) { bd = d; best = c; } }
    return best;
  }
  nearestNpc(pos, range) { let best = null, bd = range; for (const n of this.npcs) { const d = Math.hypot(n.pos.x - pos.x, n.pos.z - pos.z); if (d < bd) { bd = d; best = n; } } return best; }
  pickR(wr) { return Math.max(28, wr * innerHeight / (2 * G.render.ortho) * 1.3); }
  pickActor(x, y) {
    let best = null, bd = 1e9;
    for (const c of this.actors) { if (c.dead || c.faction === "player") continue; const s = G.render.toScreen({ x: c.pos.x, y: c.pos.y + 0.5 + c.radius * 0.6, z: c.pos.z }); const d = Math.hypot(s.x - x, s.y - y); if (d < this.pickR(c.radius + 0.3) && d < bd) { bd = d; best = c; } }
    return best;
  }
  pickNpc(x, y) {
    let best = null, bd = 1e9;
    for (const n of this.npcs) { const s = G.render.toScreen({ x: n.pos.x, y: n.pos.y + 0.7, z: n.pos.z }); const d = Math.hypot(s.x - x, s.y - y); if (d < this.pickR(0.6) && d < bd) { bd = d; best = n; } }
    return best;
  }
  spawnPoint(id) {
    const s = (this.def.spawns || []).find(s => s.id === id) || this.def.spawns[0];
    return { pos: this.geo.nearestFree(s.pos[0], s.pos[1], 0.35), yaw: s.rot };
  }
  dispose() {
    for (const a of this.actors) if (a !== G.player && a.body) a.body.dispose();
    for (const n of this.npcs) if (n.body) n.body.dispose();
    for (const t of this.things) t.dispose && t.dispose();
    this.setBarrier(false); this.actors = []; this.things = [];
  }
}

// ======================================================================================= game
const DEFAULT_SETTINGS = { music: 0.6, sfx: 0.8, shake: 0.7, damageNumbers: true, mobileControls: 0, graphicsFx: true };
class Game {
  async boot() {
    const st = document.getElementById("loadmsg");
    // Stage-weighted preparation progress, not downloaded byte percentage.
    const progress = (value, message) => {
      const meter = document.getElementById("loadprogress");
      if (meter) meter.setAttribute("aria-valuenow", String(value));
      const fill = document.getElementById("loadfill");
      if (fill) fill.style.width = value + "%";
      const percent = document.getElementById("loadpercent");
      if (percent) percent.textContent = value + "%";
      if (st && message) st.textContent = message;
    };
    progress(0, "게임 데이터 불러오는 중...");
    const names = ["config", "levels", "jobs", "skills", "skills2", "items", "monsters", "quests", "npcs", "zones"];
    let dataDone = 0;
    const files = {}; await Promise.all(names.map(async n => {
      files[n] = await fetchJson("assets/data/" + n + ".json");
      progress(Math.round(++dataDone / names.length * 15));
    }));
    this.data = new GameData(files);
    const errs = this.data.validate(); for (const e of errs) console.error("[Arcan data]", e);
    this.store = new SaveStore();                          // slot 0 = 자동 저장 (same key as before)
    this.slots = [this.store]; for (let i = 1; i <= SAVE_SLOTS; i++) this.slots.push(new SaveStore(saveSlotKey(i)));
    this.settings = Object.assign({}, DEFAULT_SETTINGS); try { Object.assign(this.settings, JSON.parse(localStorage.getItem("arcan_settings") || "{}")); } catch (e) { }
    this.render = new Renderer(document.getElementById("view"));
    this.fx = new Fx(this.render.scene); this.audio = new Audio(); this.input = new Input(this.render.r.domElement);
    bindSkillRt(this);
    // 3D skill effects (loaded separately so a problem there never blocks the game)
    import('./rewardfx.js').then(m => { this.reward = new m.RewardFx(this); }).catch(e => console.warn('reward fx', e));
    import('./swingfx.js').then(m => { this.swingFx = new m.SwingFx(this.render.scene); }).catch(e => console.warn('swing fx', e));
    import('./hammerfx.js').then(m => { this.hammerFx = new m.HammerFx(this.render.scene, this.render.cam); }).catch(e => console.warn('hammer fx', e));
    import('./skillfx.js').then(m => { this.skillFx = new m.SkillFx(this.render.scene); this.skillFx.onShake = (a, d) => this.render.addShake(a, d); m.SkillFx.reduceFlash = !!this.reduceFlash; }).catch(e => console.warn('skillfx', e));
    this.ui = new UI(document.getElementById("ui"));
    this.loadSheet = loadSheet; this.timeScale = 1; this.simSteps = Math.max(1, Math.min(8, parseInt(new URLSearchParams(location.search).get("sim")) || 1)); this.timers = []; this.session = 0; this.autoSaveT = 0;
    progress(15, "캐릭터와 자원 불러오는 중...");
    const sheetNames = new Set();
    for (const m of Object.values(this.data.monsters)) sheetNames.add(m.sheet);
    for (const n of Object.values(this.data.npcs)) sheetNames.add(n.sheet);
    const resources = [this.audio.loadNpcVoices(), this.fx.load(), this.ui.load(), loadPlayerModel("m"), loadPlayerModel("f"), loadActions(), document.fonts && document.fonts.load("16px Galmuri11").catch(() => { }), ...[...sheetNames].map(n => loadSheet(n))];
    let resourceDone = 0;
    await Promise.all(resources.map(async task => {
      await task;
      progress(15 + Math.round(++resourceDone / resources.length * 60));
    }));
    progress(75, "텍스처 준비하는 중...");
    await preloadTextures([...sheetNames].map(n => "assets/sprites/" + n + ".png").concat(["assets/fx/effects.png", "assets/ui/icons.png", "assets/ui/shadow.png"]));
    const unlock = () => this.audio.unlock();
    // capture phase: the first click anywhere (even on a title button) starts the sound before the button acts
    for (const ev of ["pointerdown", "keydown", "touchstart", "mousedown"]) addEventListener(ev, unlock, { capture: true, passive: true });
    this.audio.unlock();                                   // plays right away where the browser already allows autoplay
    document.addEventListener("visibilitychange", () => { if (document.hidden) this.autoSave(); });
    addEventListener("pagehide", () => this.autoSave());
    this.applySettings();
    progress(85, "성 마을 준비하는 중...");
    await this.showTitle();
    progress(100, "준비 완료");
    document.getElementById("loading")?.remove();
    this.last = performance.now();
    requestAnimationFrame(t => this.frame(t));
  }
  applySettings() {
    this.reduceFlash = !!(this.settings && this.settings.reduceFlash); if (this.skillFx) this.skillFx.constructor.reduceFlash = this.reduceFlash;
    const s = this.settings;
    this.audio.music = s.music; this.audio.sfxVol = s.sfx; this.audio.apply();
    this.render.shakeScale = s.shake; if (this.render.post) this.render.post.enabled = s.graphicsFx !== false; this.ui.mobileSetting = s.mobileControls;
    try { localStorage.setItem("arcan_settings", JSON.stringify(s)); } catch (e) { }
  }

  // ------------------------------------------------------------------ title / create / continue
  async showTitle() {
    this.audio.stopNpcVoice();
    this.session++; this.inWorld = false; this.loading = false; this.timeScale = 1; this.paused = false; this.timers = [];
    this.ui.setFade(0); this.ui.showGameplay(false); this.input.block = true;
    if (this.player) { if (this.zone) this.zone.removeActor(this.player); this.player.body.dispose(); this.player = null; }
    await this.buildZone("town");
    this.render.setFocus({ x: 0, y: 0, z: -2 }, true);
    this.audio.playMusic("bgm_arcan_menu");
    this.showTitleMenu();
  }
  /** the title buttons only (no zone rebuild): 불러오기 (save slot list) / 새 게임; the line under 불러오기 shows the newest save */
  showTitleMenu() {
    const all = this.slotList().filter(s => s.p).sort((a, b) => (b.p.saveAt || 0) - (a.p.saveAt || 0));
    const info = all.length ? `${all[0].label} · ${this.saveSummary(all[0].p)}` : null;
    this.ui.showTitle(info, () => this.showLoadMenu(), () => this.newGameFlow());
  }
  saveSummary(p) { const j = this.data.job(p.job), z = this.data.zones[p.zone]; return `${p.name} · Lv${p.level} ${j ? j.name : p.job} · ${z ? z.name : p.zone} · 저장 ${p.saveTime}`; }
  /** [{ i, label, p (migrated profile or null) }] for 자동 저장 + 저장 1..SAVE_SLOTS */
  slotList() { return this.slots.map((st, i) => ({ i, label: i ? "저장 " + i : "자동 저장", p: st.exists() ? st.load() : null })); }
  showLoadMenu() { this.ui.showSaveSlots("load", i => this.loadSlot(i), () => this.showTitleMenu()); }
  loadSlot(i) { const st = this.slots[i], p = st && st.load(); if (!p) return this.ui.toast("저장 파일을 읽을 수 없습니다" + (st && st.lastError ? ": " + st.lastError : "")); this.enterWorld(p, false); }
  /** manual save into slot i (1..): also refreshes the auto slot so 자동 저장 is never older than the last manual save */
  saveToSlot(i) { const ok = this.save(this.slots[i]); if (i) this.save(); return ok; }
  newGameFlow() {
    if (this.store.exists()) this.ui.confirm("새 게임을 시작하면 <b>자동 저장</b> 칸이 새 모험으로 바뀝니다.<br>직접 저장한 칸(저장 1~" + SAVE_SLOTS + ")은 그대로 남습니다. 계속할까요?", () => this.openCreate(), () => this.showTitleMenu());
    else this.openCreate();
  }
  openCreate() { this.ui.showCreate((name, gender) => this.playPrologue(() => this.enterWorld(newProfile(this.data, name, gender), true)), () => this.showTitleMenu()); }
  /** 서장 (js/prologue.js): illustrated story before a new character appears in the town; also from the pause menu */
  playPrologue(done) {
    if (this.prologueActive) return;
    this.prologueActive = true;
    // Cover the town synchronously, before closing character selection or awaiting any files.
    const cover = document.createElement('div'); cover.className = 'pl-loading';
    cover.setAttribute('role', 'status'); cover.innerHTML = '<small>서장</small><p>별을 잇는 자</p>';
    document.body.appendChild(cover);
    this.ui.close(false);
    this.input.block = true; this.prologueCover = true;
    const finish = () => {
      if (!this.prologueActive) return;
      this.prologueActive = false; this.prologueCover = false; cover.remove(); done();
    };
    import('./prologue.js').then(m => new m.Prologue(this).play(finish)).then(() => cover.remove()).catch(e => { console.warn('prologue', e); finish(); });
  }
  continueGame() { const p = this.store.load(); if (!p) return this.ui.toast("저장 파일을 읽을 수 없습니다: " + this.store.lastError); this.enterWorld(p, false); }
  enterWorld(prof, fresh) {
    this.ui.close(false);
    this.profile = prof; this.sheet = new CharacterSheet(this.data, prof); this.quests = new QuestLog(this.data, this.sheet);
    this.wireEvents(); this.inWorld = true; this.ui.showGameplay(true);
    const zone = this.data.zones[prof.zone] ? prof.zone : this.data.levels.startZone;
    // a brand-new character gets a one-time welcome notice after the area name (profile.ui.welcomed is saved)
    prof.ui = prof.ui && typeof prof.ui === "object" ? prof.ui : {};
    this.pendingWelcome = fresh && !prof.ui.welcomed;
    if (fresh) this.pendingFirstSave = true;
    this.ui.qprev = null; this.ui.qflash = null;
    return this.loadZone(zone, prof.hasPos ? null : this.data.levels.startSpawn, prof.hasPos);
  }
  wireEvents() {
    const S = this.sheet, Q = this.quests, ui = this.ui;
    S.events.levelUp.push(l => {
      ui.toast("레벨 업! Lv." + l); ui.toast("능력치 포인트 +3 (능력치 창: P 키 / 능력치 버튼)"); this.audio.sfx("levelup");
      if (this.player) { const p = this.player; if (this.reward) this.reward.levelUp(); else this.fx.play("levelup", { x: p.pos.x, y: p.pos.y + 0.8, z: p.pos.z }, 1.6); p.hp = p.maxHp; p.sp = p.maxSp; }
      Q.refreshPassive(); this.autoSave();
    });
    S.events.skill.push(s => {
      if (typeof s === "string" && s.startsWith("@points:")) return ui.toast(`직업 스킬 포인트 +${s.slice(8)} (스킬창 K)`);
      if (typeof s === "string" && s.startsWith("@npoints:")) { const L = S.p.level, nv = this.data.skillsOf("novice").filter(d => d.unlock === L); return ui.toast(`기본 검술 포인트 +${s.slice(9)}` + (nv.length ? ` · 새 스킬: ${nv.map(d => d.name).join(", ")}` : "") + " (스킬창 K)"); }
      const d = this.data.skill(s); if (d) ui.toast("새 스킬 습득: " + d.name);
    });
    S.bag.onChange.push(() => { Q.refreshPassive(); ui.refresh(); });
    S.events.job.push(() => { Q.refreshPassive(); this.audio.sfx('jobchange'); });
    // quest progress is shown inside the quest window (check mark + highlight), not as centre notices
    this.qworld = new QuestWorld(this);
    Q.events.accepted.push(() => { this.audio.sfx("quest"); ui.updateTracker(); if (this.zone) Q.notify("visit", this.zone.def.id, 1); this.qworld.sync(); });
    Q.events.ready.push(q => {
      const pr = Q.find(q.id); if (pr) { if (pr._toasted) return; pr._toasted = true; pr._readyNotified = true; }
      this.audio.sfx("quest"); ui.updateTracker();
    });
    Q.events.updated.push(() => ui.updateTracker());
    Q.events.completed.push(() => { this.audio.sfx("quest"); ui.updateTracker(); this.autoSave(); this.qworld.sync(); });
  }

  // ------------------------------------------------------------------ zones
  async buildZone(id) {
    if (this.zone) { this.zone.dispose(); this.zone = null; }
    this.fx.clear(); this.ui.clearPlates();
    const def = this.data.zones[id];
    // world zones (tools/world/world.py) keep only a stub in zones.json: the full def (with its zone mesh) is fetched on entry
    if (def.file && !def.loaded) { Object.assign(def, await fetchJson("assets/data/" + def.file)); def.loaded = true; }
    let json = def.mesh || zoneJsonCache.get(id); if (!json) { json = await fetchJson("assets/zone_" + id + ".json"); zoneJsonCache.set(id, json); }
    const z = new Zone(def, json); await z.build(); this.zone = z;
    const b = def.bounds; this.camBounds = [b[0] + 4, b[1] + 4, b[2] - 4, b[3] - 4];
    this.render.scene.background = new THREE.Color(def.kind === "town" ? 0x6d8f5e : 0x3f5a3c);
    return z;
  }
  travel(zone, spawn) { if (this.loading) return; this.save(); this.audio.sfx('warp'); this.loadZone(zone, spawn, false); }
  /** 마을 간 워프(워프 안내인): 가 본 마을로만, 삯을 내고, 짧은 시전 연출 뒤 그 마을 안내인 앞('warp' spawn)에 도착 */
  townWarp(to) {
    const P = this.profile, p = this.player, z = this.zone;
    if (this.loading || !p || p.dead || !z || this.warping) return false;
    if (z.barrier || z.def.kind !== "town") { this.ui.toast("지금은 워프할 수 없습니다"); return false; }
    const from = z.def.id, price = warpPrice(this.data, from, to), e = payWarp(this.data, P, from, to);
    if (e) { this.ui.toast(e); return false; }
    this.ui.close(); this.input.block = true; this.warping = true; this.audio.sfx("coin");
    if (this.fx && this.fx.play) this.fx.play("ring", { x: p.pos.x, y: p.pos.y + 0.1, z: p.pos.z }, 1.6, true);
    const fl = document.createElement("div"); fl.className = "warpflash"; this.ui.root.appendChild(fl); setTimeout(() => fl.remove(), 1400);
    const name = this.data.zones[to].name, session = this.session;
    setTimeout(() => {
      this.warping = false; if (session !== this.session) return;
      this.travel(to, "warp"); this.ui.toast(`${name}(으)로 이동했습니다 (-${price} G)`);
    }, 550);
    return true;
  }
  async fadeTo(a, dur) { const from = parseFloat(this.ui.fade.style.opacity || 0), t0 = performance.now(); while (true) { const k = Math.min(1, (performance.now() - t0) / 1000 / dur); this.ui.setFade(from + (a - from) * k); if (k >= 1) break; await new Promise(r => requestAnimationFrame(r)); } }
  async loadZone(zoneId, spawnId, usePos) {
    this.audio.stopNpcVoice();
    if (this.reward) this.reward.clear(); if (this.swingFx) this.swingFx.clear(); if (this.hammerFx) this.hammerFx.clear();
    this.loading = true; this.input.block = true; const session = this.session;
    await this.fadeTo(1, 0.25);
    if (this.player) this.player.skills2.clearTemp(); if (this.skillFx) this.skillFx.clear();
    if (this.player && this.zone) this.zone.removeActor(this.player);
    // 메인 퀘스트로 아직 열리지 않은 곳(예전 저장·귀환·부활)은 아르칸 마을 시작 지점으로 (2026-11-15)
    const lock = this.lockOf(zoneId), P0 = this.profile;
    if (lock) {
      zoneId = this.data.levels.startZone; spawnId = this.data.levels.startSpawn; usePos = false;
      if (P0 && this.lockOf(P0.returnZone)) { P0.returnZone = zoneId; P0.returnSpawn = spawnId; }
      setTimeout(() => { if (session === this.session) this.ui.toast("아직 들어갈 수 없는 곳이라 아르칸 마을로 옮겼습니다 — " + lock.text); }, 900);
    }
    await this.buildZone(zoneId);
    if (session !== this.session) return;
    const z = this.zone, def = z.def, P = this.profile, cfg = this.data.config;
    P.zone = zoneId; if (def.kind === "town") { P.returnZone = zoneId; P.returnSpawn = def.respawnSpawn; }
    if (discoverTown(this.data, P, zoneId)) setTimeout(() => { if (session === this.session) this.ui.toast(`새 마을 발견: ${def.name} — 이제 워프 안내인이 이곳으로 보내 줄 수 있어요`); }, 1200);
    let pos, yaw;
    if (usePos && P.hasPos && !z.geo.blocked(P.posX, P.posZ, cfg.playerRadius)) {
      pos = z.geo.ground(P.posX, P.posZ); yaw = P.facing;
      if (z.inArena(pos, 2)) ({ pos, yaw } = z.spawnPoint("plateau"));
    } else ({ pos, yaw } = z.spawnPoint(spawnId));
    if (!this.player) { this.player = new Player(z, pos, this.sheet, this.quests, cfg); await this.player.attachBody(); }
    const p = this.player; p.zone = z; p.teleport(pos); p.resetArms && p.resetArms(); p.setFacing(Math.sin(yaw * DEG), Math.cos(yaw * DEG)); p.path = []; p.target = null; p.npcTarget = null; p.lockOn = null;
    p.body.setTint(z.tint[0], z.tint[1], z.tint[2]); p.body.place(p.pos);
    if (!z.actors.includes(p)) z.actors.push(p);
    this.render.setFocus(p.pos, true);
    this.audio.playMusic(def.bgm);
    this.quests.notify("visit", zoneId, 1); this.quests.refreshPassive(); this.ui.updateTracker();
    if (this.qworld) await this.qworld.sync();
    await this.fadeTo(0, 0.3);
    const welcome = this.pendingWelcome; this.pendingWelcome = false;
    if (welcome) P.ui.welcomed = true;
    this.ui.areaBanner(def.name, welcome ? () => { if (this.inWorld) this.ui.notice("아르칸 마을에 오신 것을 환영합니다!"); } : null);
    this.input.block = !!this.ui.current; this.loading = false;
    if (this.pendingFirstSave) { this.pendingFirstSave = false; this.save(); }
  }

  // ------------------------------------------------------------------ NPCs / quests
  /** "ready" (a quest to hand in) / "avail" (a quest to take) / "active" (in progress, turn in here) / "" — head marks + minimap */
  questState(npcId) {
    if (!this.quests) return "";
    let ready = false, avail = false, active = false;
    for (const q of this.quests.questsFor(npcId)) {
      const st = this.quests.stateOf(q), turnIn = q.turnIn || q.giver;
      if (st === QS.Completable && turnIn === npcId) ready = true; else if (st === QS.Available) avail = true; else if (st === QS.Active && turnIn === npcId) active = true;
    }
    return ready ? "ready" : avail ? "avail" : active ? "active" : "";
  }
  /** 메인 퀘스트만 본 상태: "ready"(완료하러) / "talk"(대화 목표) / "avail"(받을 것) / "active"(진행 중, 여기서 완료) / "" */
  mainState(npcId) {
    const Q = this.quests; if (!Q) return "";
    let r = "";
    for (const q of this.data.questList) {
      if (questCategory(q) !== "main") continue;
      const st = Q.stateOf(q), turnIn = q.turnIn || q.giver;
      if (st === QS.Completable && turnIn === npcId) return "ready";
      if (st === QS.Active) {
        const pr = Q.find(q.id);
        if (q.objectives.some((o, i) => o.type === "talk" && o.target === npcId && Q.current(q, i, pr) < o.count)) r = "talk";
        else if (turnIn === npcId && !r) r = "active";
      } else if (st === QS.Available && q.giver === npcId && r !== "talk") r = "avail";
    }
    return r;
  }
  /** 지금 진행할 메인 단계와 갈 곳: [{ quest, zone }] (세계 지도 목적지 — zones.json world.main.steps) */
  mainTargets() {
    const Q = this.quests, M = this.data.world && this.data.world.main; if (!Q || !M) return [];
    const out = [];
    for (const id of M.order) {
      const q = this.data.quests[id], S = M.steps[id]; if (!q || !S) continue;
      const st = Q.stateOf(q); if (st === QS.Completed || st === QS.Locked) continue;
      let zone = S.gz;
      if (st === QS.Completable) zone = S.tz;
      else if (st === QS.Active) { const pr = Q.find(id), i = q.objectives.findIndex((o, k) => Q.current(q, k, pr) < o.count); zone = (i >= 0 && S.oz[i]) || S.tz; }
      out.push({ quest: q, zone }); if (out.length >= 2) break;
    }
    return out;
  }
  /** 메인 퀘스트 입장 조건: 들어갈 수 없으면 { text, … } */
  lockOf(zoneId) { return this.profile ? zoneLock(this.data, this.profile, zoneId) : null; }
  questMark(npcId) {
    const ms = this.mainState(npcId);
    if (ms === "ready" || ms === "talk") return QMARK('?', '#fff6d8', '#ff9a3a', '#c8321a', '#3a0c06', true);
    if (ms === "avail") return QMARK('!', '#fff6d8', '#ff9a3a', '#c8321a', '#3a0c06', true);
    const st = this.questState(npcId);
    if (ms === "active" && st !== "ready" && st !== "avail") return '<b class="m-active qmain">…</b>';
    return st === "ready" ? QMARK('?', '#eafff0', '#7ee09a', '#23884a', '#0c3a1c') : st === "avail" ? QMARK('!', '#fff7c4', '#ffd23a', '#d9790c', '#3a2006') : st === "active" ? '<b class="m-active">…</b>' : "";
  }
  interact(npc) {
    if (!npc || this.ui.current || !this.player || this.player.dead) return;
    this.quests.notify("talk", npc.def.id, 1); this.audio.sfx("ui"); this.openNpcMenu(npc.def, true); this.audio.npcGreeting(npc.def.id);
  }
  openNpcMenu(npc, greeting = false) {
    const Q = this.quests, opts = [];
    for (const q of Q.questsFor(npc.id)) {
      const st = Q.stateOf(q), turnIn = q.turnIn || q.giver;
      if (st === QS.Available) opts.push(["[퀘스트] " + q.name, () => this.offerQuest(npc, q)]);
      else if (st === QS.Completable && turnIn === npc.id) opts.push(["[완료] " + q.name, () => this.completeQuest(npc, q)]);
      else opts.push(["[진행 중] " + q.name, () => this.ui.showDialog(npc, q.progressText, this.back(npc))]);
    }
    if (npc.role === "jobmaster" && npc.job) opts.push(["직업 상담", () => this.ui.showJobs(npc.job)]);
    if (npc.role === "warp") opts.push(["마을 이동", () => this.ui.showTownWarp(npc)]);
    if (npc.shop) opts.push(["상점", () => { this.ui.sel = {}; this.ui.showShop(this.data.shops[npc.shop]); }]);
    opts.push(["대화 종료", () => this.ui.close()]);
    while (opts.length > 4) opts.splice(opts.length - 2, 1);
    let line = npc.lines && npc.lines.length ? npc.lines[Math.floor(Math.random() * npc.lines.length)] : "...";
    if (greeting && this.audio.npcVoices[npc.id]) line = this.audio.npcVoices[npc.id].line;
    if (npc.role === "jobmaster" && this.profile.job === "novice") line += `<br><span class="tealtxt">'직업 상담'에서 ${this.data.job(npc.job).name}(이)가 될 수 있어요.</span>`;
    this.ui.showDialog(npc, line, opts);
  }
  back(npc) { return [["돌아가기", () => this.openNpcMenu(npc)], ["대화 종료", () => this.ui.close()]]; }
  offerQuest(npc, q) {
    this.ui.showDialog(npc, q.offerText + `<div class="reward">보상: ${rewardText(q)}</div>`, [["수락하기", () => { this.quests.accept(q.id); this.openNpcMenu(npc); }], ["나중에", () => this.openNpcMenu(npc)]]);
  }
  completeQuest(npc, q) {
    const e = this.quests.complete(q.id); if (e) return this.ui.toast(e);
    if (q.reward.gold > 0) this.ui.toast("+" + q.reward.gold + " G"); if (q.reward.exp > 0) this.ui.toast("경험치 +" + q.reward.exp);
    for (const it of q.reward.items || []) this.ui.itemToast(this.data.item(it.id), it.count);
    this.ui.showDialog(npc, q.completeText, this.back(npc));
  }

  // ------------------------------------------------------------------ combat events
  telegraph(zone, shape, time, color, onFire) { const t = new Telegraph(zone, shape, time, color, onFire); zone.things.push(t); return t; }
  onMonsterDamaged(m) { this.ui.setTarget(m); m.hitRecently = 4; }
  onMonsterKilled(m) {
    if (!this.player) return;
    const d = m.def, gold = d.goldMin + Math.floor(Math.random() * (d.goldMax - d.goldMin + 1)), exp = levelGapExp(d.exp, this.player.level, m.level);
    this.sheet.addGold(gold); this.sheet.addExp(exp);
    if (this.reward) this.reward.kill(m.pos, exp, gold);                     // light shafts, rune, stars, EXP / gold stack
    else { this.ui.floatText(m.pos, "+" + exp + " EXP", "#b8e0ff", 0.9, 1.6); if (gold > 0) this.ui.floatText(m.pos, "+" + gold + " G", "#ffd86b", 0.85, 1.1); }
    // coin sound after the gold number appears; several kills at once share one
    if (gold > 0) { const now = performance.now(); if (now - (this._coinT || 0) > 160) { this._coinT = now; this.timers.push({ t: 0.3, f: () => this.audio.sfx("coin") }); } }
    for (const dr of d.drops || []) {
      if (Math.random() > dr.chance) continue;
      let item = dr.item; if (item.startsWith("@jobweapon:")) item = this.data.weaponFor(this.profile.job, parseInt(item.slice(11)));
      if (!item) continue; m.zone.dropLoot(item, dr.min + Math.floor(Math.random() * (dr.max - dr.min + 1)), m.pos);
    }
    this.quests.notify("kill", d.id, 1); this.player.onKilledMonster && this.player.onKilledMonster(m);
    if (this.qworld) this.qworld.onKill(m);
    // 손질 숙련: extra ingredient drops
    const ing = this.sheet.book.passive("ingredientDrop"); if (ing && Math.random() < ing) m.zone.dropLoot(["m_meat", "m_veg", "m_flour"][Math.floor(Math.random() * 3)], 1, m.pos);
    if (m instanceof Boss) {
      if (!this.profile.flags.includes("boss_" + d.id + "_defeated")) this.profile.flags.push("boss_" + d.id + "_defeated");
      this.endBossFight(true); this.ui.toast(m.def.name + "을(를) 쓰러뜨렸습니다!"); this.audio.sfx("levelup"); this.render.addShake(0.3, 0.6); this.autoSave();
    }
  }
  /** a scripted story boss gave up (yieldAt) or the hold-out ended (surviveSec): counts as beating it */
  onMonsterYield(m) {
    if (!this.player) return;
    const d = m.def, exp = levelGapExp(d.exp, this.player.level, m.level); this.sheet.addExp(exp);
    if (this.reward) this.reward.kill(m.pos, exp, 0); else this.ui.floatText(m.pos, "+" + exp + " EXP", "#b8e0ff", 0.9, 1.6);
    this.quests.notify("kill", d.id, 1); this.audio.sfx("levelup"); this.autoSave();
  }
  startBossFight(boss) {
    if (!boss || boss.fight || boss.dead || !this.player || this.player.dead) return;
    boss.fight = true; this.zone.setBarrier(true); this.audio.playMusic("bgm_boss");
    this.ui.toast(boss.def.name + "이(가) 깨어났다! 바닥의 경고 표시를 피하세요."); this.audio.sfx("warn");
  }
  endBossFight(won) {
    if (!this.zone) return; this.zone.setBarrier(false); this.audio.playMusic(this.zone.def.bgm);
    if (!won && this.zone.boss && !this.zone.boss.dead) this.zone.boss.resetFight();
  }
  onPlayerDied() {
    if (this.zone && this.zone.boss && this.zone.boss.fight) this.endBossFight(false);
    const s = this.session;
    this.later(1.2, () => {
      if (s !== this.session || !this.inWorld || !this.player || !this.player.dead) return;
      const cost = Math.round(this.data.config.reviveInPlaceGoldPerLevel * this.profile.level);
      this.ui.showDeath(cost, this.profile.gold >= cost, () => { this.player.revive(1); this.loadZone(this.profile.returnZone, this.profile.returnSpawn, false); },
        () => { if (!this.sheet.spendGold(cost)) { this.ui.toast("골드가 부족합니다."); return this.onPlayerDied(); } this.player.revive(0.5); this.input.block = false; });
    });
  }
  later(t, f) { this.timers.push({ t, f }); }
  hitStop(s) { if (s <= 0 || this.hitStopT > 0) return; this.hitStopT = s; }

  // ------------------------------------------------------------------ save
  save(store = this.store) {
    if (!this.profile || !this.inWorld) return false;
    const P = this.profile, p = this.player;
    if (p) {
      p.sync(); if (p.skills2) p.skills2.saveCooldowns(); P.hasPos = !p.dead; P.posX = p.pos.x; P.posY = p.pos.y; P.posZ = p.pos.z;
      if (p.dead) { P.zone = P.returnZone; P.hp = -1; }
    }
    if (this.zone && (!p || !p.dead)) P.zone = this.zone.def.id;
    return store.save(P);
  }
  autoSave() { if (this.inWorld && !this.loading) this.save(); }

  // ------------------------------------------------------------------ main loop
  frame(now) {
    requestAnimationFrame(t => this.frame(t));
    const rdt = Math.min(0.05, Math.max(0, (now - this.last) / 1000)); this.last = now;
    if (this.prologueCover) return;      // an opaque prologue panel hides the scene: don't render / tick behind it
    // ?sim=N (automated tests only): run N logic steps per rendered frame so slow software-GL runs reach real game speed
    try { for (let i = 1; i < this.simSteps; i++) this.step(rdt, false); this.step(rdt, true); } catch (e) { console.error(e); if (!this._errShown) { this._errShown = true; this.ui.toast("오류: " + e.message); } }
  }
  step(rdt, draw = true) {
    let scale = this.timeScale;
    if (this.hitStopT > 0) { this.hitStopT -= rdt; scale = 0.08; }
    if (this.paused) scale = 0;
    const dt = rdt * scale;
    const input = this.input.frame();
    this.ui.handleKeys(input.down);
    for (const t of this.timers.slice()) { t.t -= rdt; if (t.t <= 0) { this.timers.splice(this.timers.indexOf(t), 1); t.f(); } }
    const z = this.zone;
    if (z) {
      if (this.inWorld && this.player && !this.loading) {
        if (dt > 0) { this.player.update(dt, input); z.update(dt); }
        const p = this.player, la = this.data.config.lookAhead;
        const tgt = { x: p.pos.x + p.vel.x * la * 0.25, y: p.pos.y, z: p.pos.z + p.vel.z * la * 0.25 };
        if (z.boss && z.boss.fight && !p.dead) { const bx = z.boss.pos.x - p.pos.x, bz = z.boss.pos.z - p.pos.z, k = Math.min(0.4, 6 / Math.max(6, Math.hypot(bx, bz))) ; tgt.x += bx * k; tgt.z += bz * k; }
        const b = this.camBounds; tgt.x = clamp(tgt.x, b[0], b[2]); tgt.z = clamp(tgt.z, b[1], b[3]);
        this.render.setFocus(tgt, false, rdt);
        const pts = [{ x: p.pos.x, y: p.pos.y + 0.8, z: p.pos.z }];
        if (z.boss && z.boss.fight) pts.push({ x: z.boss.pos.x, y: z.boss.pos.y + 1, z: z.boss.pos.z });
        this.render.updateOcclusion(pts, rdt);
        this.autoSaveT += rdt; if (this.autoSaveT > 60) { this.autoSaveT = 0; this.autoSave(); }
      } else if (!this.inWorld) {
        const t = performance.now() / 1000;
        for (const n of z.npcs) n.update(rdt);
        for (const w of z.warps || []) w.update(rdt); if (z.town3d) z.town3d.update(rdt); if (z.nature) z.nature.update(rdt);
        this.render.setFocus({ x: Math.sin(t * 0.12) * 6, y: 0, z: Math.cos(t * 0.12) * 5 - 2 }, false, rdt, 2);
        z.smokeT -= rdt; if (z.smokeT <= 0) { z.smokeT = 0.7; for (const s of z.json.smoke || []) this.fx.play("smoke", { x: s[0], y: s[1], z: s[2] }, 1.2, false, [0.9, 0.9, 0.9, 0.8]); }
        z.sprayT -= rdt; if (z.sprayT <= 0) { z.sprayT = 0.35; for (const f of z.json.fountain || []) this.fx.play("potion_splash", { x: f[0] + rnd(-0.3, 0.3), y: f[1], z: f[2] + rnd(-0.3, 0.3) }, 0.9, false, [0.7, 0.9, 1]); }
      }
    }
    this.fx.update(dt > 0 ? dt : (this.inWorld ? 0 : rdt), this.render.cam);
    if (this.hammerFx) try { this.hammerFx.low = !!((this.input && this.input.mobile) || (this.settings && this.settings.graphicsFx === false)); this.hammerFx.update(rdt); } catch (e) { console.warn('hammer fx', e); this.hammerFx.clear(); }   // ages with the simulation (also in draw-less test steps)
    if (!draw) return;
    this.ui.tick(rdt);
    if (this.skillFx) try { this.skillFx.update(rdt); } catch (e) { console.warn('skillfx update', e); this.skillFx = null; }
    if (this.reward) try { this.reward.update(rdt); } catch (e) { console.warn('reward fx', e); this.reward.clear(); }
    if (this.swingFx) try { this.swingFx.update(rdt * (this.hitStopT > 0 ? 0.25 : 1), this.render.cam); } catch (e) { console.warn('swing fx', e); this.swingFx.clear(); }
    this.render.render(rdt);
  }
}

const G = new Game();
window.G = G; G.THREE = THREE;
bindActors(G); bindUi(G); bindSkillUi(G); installDev(G, Monster);
G.boot().catch(e => { console.error(e); if (window.showStartupFailure) window.showStartupFailure(e); else { const m = document.getElementById("loadmsg"); if (m) m.textContent = "불러오기 실패: " + e.message; } });
