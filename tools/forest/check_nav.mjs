// Walkability check for the forest layout: every portal, spawn, monster camp and the boss gate must be reachable
// from the town entrance with the player's collision radius. Usage: node tools/forest/check_nav.mjs [zoneId]
import fs from 'fs';
import { ZoneGeometry, NavGrid } from '../../js/core.js';
const zid = process.argv[2] || 'forest';
const Z = JSON.parse(fs.readFileSync(new URL('../../assets/data/zones.json', import.meta.url))).zones.find(z => z.id === zid);
const geo = new ZoneGeometry(Z), nav = new NavGrid(geo, 0.4);
const start = Z.spawns.find(s => s.id === 'from_town') || Z.spawns[0];
const goals = [...Z.portals.map(p => [p.id, p.pos]), ...(Z.npcs || []).map(n => ['npc:' + n.npc, n.pos]), ...Z.spawns.map(s => ['spawn:' + s.id, s.pos]), ...Z.monsters.map(m => ['camp:' + m.monster, m.pos])];
if (Z.boss && Z.boss.gate) goals.push(['boss_gate', Z.boss.gate]);
let bad = 0;
for (const [name, p] of goals) {
  const path = nav.findPath({ x: start.pos[0], z: start.pos[1] }, { x: p[0], z: p[1] });
  const same = Math.hypot(p[0] - start.pos[0], p[1] - start.pos[1]) < 1;
  const ok = same || (path && path.length > 0); if (!ok) bad++;
  console.log((ok ? 'OK  ' : 'FAIL') + ' ' + name + (ok ? ` (${path.length} steps)` : ''));
}
const walk = nav.walk.reduce((a, b) => a + b, 0);
console.log(`walkable cells ${walk}/${nav.walk.length} (${(100 * walk / nav.walk.length).toFixed(1)}%)`);
process.exit(bad ? 1 : 0);
