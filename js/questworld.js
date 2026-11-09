// Quest-driven things in the world (메인·서브 퀘스트, tools/quests/story.py writes the data):
//  - story NPCs (quests.json "storyNpcs"): 아스텔 일행 등이 이야기 진행에 따라 다른 존에 나타나고 사라짐
//      {npc, zone, pos:[x,z], rot, from?: quest id that must be done, until?: quest id (done → gone)}
//  - quest bosses: a "kill" objective with "spawn": {zone, at?:[x,z]} puts that monster in the zone while the
//      objective is open (story bosses, 정예). Bosses with yieldAt / surviveSec (monsters.json) give up instead of dying.
//  - gathering: a "collect" objective with "gather": {zone, n?} lays glowing pickups in that zone (줍기·조사·표식)
//  - quest drops: a "collect" objective with "drop": {from:[monster ids], chance} drops its item from those monsters
import { Npc, Monster, Loot } from './actors.js';
import { THREE, T } from './render.js';

let G = null;
const has = (a, x) => Array.isArray(a) && a.includes(x);

/** a pickup that stays until taken, with a soft light pillar so it can be found */
class QuestPickup extends Loot {
  constructor(zone, id, count, at, key) {
    super(zone, id, count, at); this.life = 1e9; this.key = key;
    const g = new THREE.CylinderGeometry(0.16, 0.42, 3.2, 12, 1, true); g.translate(0, 1.6, 0);
    const m = new THREE.MeshBasicMaterial({ color: 0xffe3a0, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.beam = new THREE.Mesh(g, m); this.beam.renderOrder = 3; G.render.scene.add(this.beam);
    this.beam.position.copy(T(this.pos));
  }
  update(dt) { super.update(dt); if (this.beam) { this.beam.position.copy(T(this.pos)); this.beam.material.opacity = 0.22 + 0.12 * Math.sin(this.t * 3); } }
  dispose() { super.dispose(); if (this.beam) { G.render.scene.remove(this.beam); this.beam.geometry.dispose(); this.beam.material.dispose(); this.beam = null; } }
}

export class QuestWorld {
  constructor(game) { G = game; this.busy = false; this.again = false; }
  get Q() { return G.quests; }
  /** open (accepted, not handed in) quests */
  openQuests() { return G.profile ? G.profile.quests.filter(q => q.state !== 'completed').map(q => G.data.quests[q.id]).filter(Boolean) : []; }
  storyVisible(s) {
    const Q = this.Q; if (!Q) return false;
    if (s.from && !Q.isCompleted(s.from)) return false;
    if (s.until && Q.isCompleted(s.until)) return false;
    return true;
  }
  /** bring the current zone in line with the quest log (call after zone entry and every quest change) */
  async sync() {
    if (this.busy) { this.again = true; return; }
    const z = G.zone; if (!z || !G.player || !this.Q) return;
    this.busy = true;
    try {
      const zid = z.def.id, jobs = [];
      // story NPCs
      const all = (G.data.storyNpcs || []).filter(s => s.zone === zid && G.data.npcs[s.npc] && this.storyVisible(s));
      const want = all.filter(s => !s.hide);
      // "hide": a zone's own NPC leaves the story (죽음·배신) — removed while the condition holds
      for (const s of all.filter(s => s.hide)) for (const n of [...z.npcs]) if (n.def.id === s.npc && !n.story) { n.body && n.body.dispose(); z.npcs.splice(z.npcs.indexOf(n), 1); }
      z.storyNpcs = z.storyNpcs || [];
      for (const n of [...z.storyNpcs]) if (!want.includes(n.story)) { n.body && n.body.dispose(); z.npcs.splice(z.npcs.indexOf(n), 1); z.storyNpcs.splice(z.storyNpcs.indexOf(n), 1); }
      for (const s of want) if (!z.storyNpcs.some(n => n.story === s) && !z.npcs.some(n => n.def.id === s.npc)) {
        const npc = new Npc(z, G.data.npcs[s.npc], z.geo.ground(s.pos[0], s.pos[1]), s.rot || 0); npc.story = s;
        z.npcs.push(npc); z.storyNpcs.push(npc); jobs.push(npc.attachBody());
      }
      // quest bosses and pickups for open objectives in this zone
      for (const q of this.openQuests()) q.objectives.forEach((o, i) => {
        const cur = this.Q.current(q, i);
        if (o.type === 'kill' && o.spawn && o.spawn.zone === zid && cur < o.count) {
          if (z.actors.some(a => a.def && a.def.id === o.target && !a.dead)) return;
          const md = G.data.monsters[o.target]; if (!md) return;
          const at = o.spawn.at || [0, 0], pos = z.spacedSpot(at[0], at[1], o.spawn.r || 8, md.radius, 0, null) || z.geo.ground(at[0], at[1]);
          const m = new Monster(z, md, pos, z.geo.ground(pos.x, pos.z), 6); m.questSpawn = true; z.actors.push(m);
          jobs.push(m.attachBody().then(() => m.body.place(m.pos)));
        }
        if (o.type === 'collect' && o.gather && o.gather.zone === zid) {
          const need = o.count - cur, key = q.id + ':' + i;
          const lying = z.things.filter(t => t.key === key && !t.dead).length;
          const [x0, z0, x1, z1] = z.def.bounds, spots = o.gather.at;
          for (let k = lying; k < Math.min(need + 1, o.gather.n || need + 1); k++) {
            let p = null;
            if (spots && spots[k % spots.length]) { const s = spots[k % spots.length]; p = z.spacedSpot(s[0], s[1], 4, 0.4, 0, null); }
            for (let tries = 0; !p && tries < 40; tries++) {
              const x = x0 + 8 + Math.random() * (x1 - x0 - 16), zz = z0 + 8 + Math.random() * (z1 - z0 - 16);
              if (!z.geo.blocked(x, zz, 0.6) && !(z.inArena && z.inArena({ x, z: zz }, 2))) p = z.geo.ground(x, zz);
            }
            if (p) z.things.push(new QuestPickup(z, o.target, 1, p, key));
          }
        }
      });
      await Promise.all(jobs);
    } catch (e) { console.warn('questworld', e); }
    this.busy = false;
    if (this.again) { this.again = false; this.sync(); }
  }
  /** quest-only drops ("drop": {from, chance}) */
  onKill(m) {
    for (const q of this.openQuests()) q.objectives.forEach((o, i) => {
      if (o.type !== 'collect' || !o.drop || !has(o.drop.from, m.def.id)) return;
      if (this.Q.current(q, i) >= o.count) return;
      if (Math.random() < (o.drop.chance ?? 0.5)) m.zone.dropLoot(o.target, 1, m.pos);
    });
  }
}
export function bindQuestWorld(game) { G = game; }
