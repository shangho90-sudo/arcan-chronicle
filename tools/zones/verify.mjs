// Walkability / reachability check for zones: every spawn, portal, spawner centre (+ boss pos) must be on a walkable
// NavGrid cell and connected to the zone's first spawn; also runs findPath to each target.
import { readFileSync } from 'fs';
const core = await import('/home/claude/ArcanWeb/js/core.js');
const file = process.argv[2], ids = process.argv.slice(3);
const zones = JSON.parse(readFileSync(file, 'utf8')).zones;
let bad = 0;
for (const id of ids) {
  const def = zones.find(z => z.id === id); const geo = new core.ZoneGeometry(def), nav = new core.NavGrid(geo, 0.32);
  const entry = def.spawns[0].pos; const s = nav.cellOf(entry[0], entry[1]);
  const seen = new Uint8Array(nav.W * nav.H); const q = [s]; seen[s[0] + s[1] * nav.W] = 1; let n = 0;
  while (q.length) { const [i, j] = q.pop(); n++; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nav.W || b >= nav.H) continue; const k = a + b * nav.W; if (seen[k] || !nav.conn(i, j, a, b)) continue; seen[k] = 1; q.push([a, b]); } }
  let walk = 0; for (const w of nav.walk) walk += w;
  const tg = [];
  for (const sp of def.spawns) tg.push(['spawn ' + sp.id, sp.pos, 0.32]);
  for (const p of def.portals) tg.push(['portal ' + p.id, p.pos, 0.32]);
  for (const m of def.monsters || []) tg.push(['spawner ' + m.monster, m.pos, 0.5]);
  if (def.boss && def.boss.boss) { tg.push(['bossPos', def.boss.bossPos, 0.32]); tg.push(['gate', def.boss.gate, 0.32]); }
  console.log(`== ${id}: walkable ${walk}, reachable from ${def.spawns[0].id}: ${n} (${(n / walk * 100).toFixed(1)}%)`);
  for (const [name, p, r] of tg) {
    const [i, j] = nav.cellOf(p[0], p[1]); const ok = nav.ok(i, j) && seen[i + j * nav.W] && !geo.blocked(p[0], p[1], r);
    const path = nav.findPath(geo.ground(entry[0], entry[1]), geo.ground(p[0], p[1]));
    const last = path[path.length - 1]; const pathOk = Math.hypot(entry[0] - p[0], entry[1] - p[1]) < 1 || (path.length > 0 && Math.hypot(last.x - p[0], last.z - p[1]) < 1);
    if (!ok || !pathOk) bad++;
    console.log(`  ${ok && pathOk ? 'OK ' : 'BAD'} ${name.padEnd(28)} [${p}] cell=${nav.ok(i, j) ? 1 : 0} reach=${seen[i + j * nav.W]} path=${path.length}`);
  }
  // portals of other zones targeting this zone's spawns must exist
  for (const z of zones) for (const p of z.portals || []) if (p.targetZone === id && !def.spawns.find(s => s.id === p.targetSpawn)) { bad++; console.log('  BAD missing target spawn', z.id, p.id, p.targetSpawn); }
  for (const p of def.portals) { const tz = zones.find(z => z.id === p.targetZone); if (!tz || !tz.spawns.find(s => s.id === p.targetSpawn)) { bad++; console.log('  BAD portal target', p.id); } }
}
console.log(bad ? `FAILED ${bad}` : 'ALL OK'); process.exit(bad ? 1 : 0);
