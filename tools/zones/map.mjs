import { readFileSync } from 'fs';
const core = await import('/home/claude/ArcanWeb/js/core.js');
const file = process.argv[2], id = process.argv[3];
const zones = JSON.parse(readFileSync(file, 'utf8')).zones; const def = zones.find(z => z.id === id);
const geo = new core.ZoneGeometry(def), nav = new core.NavGrid(geo, 0.32);
const step = 1; let out = '';
const marks = [];
for (const s of def.spawns) marks.push([s.pos, 'S']);
for (const p of def.portals) marks.push([p.pos, 'P']);
for (const m of def.monsters || []) marks.push([m.pos, 'M']);
if (def.boss && def.boss.boss) { marks.push([def.boss.bossPos, 'B']); marks.push([def.boss.gate, 'G']); }
for (let z = geo.maxZ - 0.5; z > geo.minZ; z -= step) {
  let row = (Math.round(z) + '').padStart(4) + ' ';
  for (let x = geo.minX + 0.5; x < geo.maxX; x += step) {
    const mk = marks.find(m => Math.abs(m[0][0] - x) <= 0.5 && Math.abs(m[0][1] - z) <= 0.5);
    if (mk) { row += mk[1]; continue; }
    const [i, j] = nav.cellOf(x, z); const h = geo.height(x, z);
    row += nav.ok(i, j) ? (h > 0.05 ? (h > 1.0 ? '^' : '/') : '.') : '#';
  }
  out += row + '\n';
}
console.log(out);
