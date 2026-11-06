// Run with Node; verifies all lazily loaded regions as well as the initial zones.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = new URL('../../', import.meta.url);
const read = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const plan = read('assets/audio/world-music-plan.json').tracks;
const credits = read('assets/audio/music-credits.json');
const zones = read('assets/data/zones.json').zones.map(z => z.file ? read('assets/data/' + z.file) : z);
const names = new Set(), hashes = new Set();
for (const z of zones) {
  assert.ok(z.bgm, `${z.id}: missing music`);
  assert.ok(!names.has(z.bgm), `${z.id}: shared region music`); names.add(z.bgm);
  const file = new URL('assets/audio/' + z.bgm + '.mp3', root);
  assert.ok(existsSync(file), `${z.id}: missing file`);
  const bytes = readFileSync(file), hash = createHash('sha256').update(bytes).digest('hex');
  assert.ok(!hashes.has(hash), `${z.id}: duplicate recording`); hashes.add(hash);
  assert.ok(bytes.length > 50000, `${z.id}: suspiciously small track`);
  const planned = plan.find(t => t.zone === z.id);
  if (planned) {
    assert.equal(planned.file, z.bgm + '.mp3');
    assert.ok(credits.some(c => c.zone === z.id && c.file === planned.file && c.provider === 'Runway'), `${z.id}: missing provenance`);
  }
}
assert.equal(plan.length, 44);
assert.equal(zones.length, 49);
console.log(`music: ${zones.length} regions have distinct tracks; ${plan.length} new Runway scores mapped and credited`);
