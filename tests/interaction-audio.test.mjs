// Audio lifecycle regression checks without WebGL or an audio device.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const src = readFileSync(new URL('../js/io.js', import.meta.url), 'utf8')
  .replace("import { screenToWorldDir } from './render.js';", 'const screenToWorldDir = () => ({});')
  .replace("'./sfx.js'", JSON.stringify(new URL('../js/sfx.js', import.meta.url).href));
const { Audio } = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
const manifest = JSON.parse(readFileSync(new URL('../assets/data/npc-voices.json', import.meta.url)));
const npcs = JSON.parse(readFileSync(new URL('../assets/data/npcs.json', import.meta.url))).npcs;
assert.equal(Object.keys(manifest).length, npcs.length);
for (const n of npcs) {
  const v = manifest[n.id]; assert.ok(v && ['m', 'f'].includes(v.gender) && v.line && v.voice, n.id);
  assert.ok(existsSync(new URL('../assets/audio/' + v.file + '.mp3', import.meta.url)), n.id);
}
const a = new Audio(), sources = [];
a.ctx = { state: 'running', createBufferSource() { const s = { playbackRate: {}, connect() {}, disconnect() {}, start() { this.started = true; }, stop() { this.stopped = true; this.onended?.(); } }; sources.push(s); return s; }, createGain() { return { gain: {}, connect() {}, disconnect() {} }; } };
a.gSfx = { gain: {} }; a.gMusic = { gain: {} }; a.npcVoices = manifest;
a.buf = async () => ({});
await a.npcGreeting('elder'); const first = a.npcSource; assert.ok(first.started);
await a.npcGreeting('merchant'); assert.ok(first.stopped); assert.notEqual(first, a.npcSource);
a.stopNpcVoice(); assert.equal(a.npcSource, null);
let resolve; a.buf = () => new Promise(r => resolve = r);
const pending = a.npcGreeting('guard'); a.stopNpcVoice(); resolve({}); await pending; assert.equal(a.npcSource, null);
// An old download must not interrupt the latest NPC.
let oldResolve; a.buf = name => name === manifest.elder.file ? new Promise(r => oldResolve = r) : Promise.resolve({});
const old = a.npcGreeting('elder'); await a.npcGreeting('merchant'); const newest = a.npcSource; oldResolve({}); await old; assert.equal(a.npcSource, newest);
a.sfxVol = 0; a.apply(); assert.equal(a.npcSource, null); const count = sources.length;
await a.npcGreeting('guard'); await a.sfx('levelup'); assert.equal(sources.length, count);
a.sfxVol = .8; a.buf = async () => ({});
// First-time event loading may take >300 ms; it must still play.
a.buf = async () => { await new Promise(r => setTimeout(r, 330)); return {}; };
await a.sfx('warp'); assert.equal(sources.length, count + 1); assert.equal(sources.at(-1).playbackRate.value, 1);
a.buf = async () => ({}); await a.sfx('levelup'); const afterLevel = sources.length;
await a.sfx('levelup'); assert.equal(sources.length, afterLevel);
await a.sfx('jobchange'); assert.equal(sources.length, afterLevel + 1);
await a.sfx('dialog'); const afterDialog = sources.length; await a.sfx('dialog'); assert.equal(sources.length, afterDialog);
a.ctx.state = 'suspended'; await a.npcGreeting('elder'); assert.equal(a.npcSource, null);
console.log('PASS: NPC coverage, voice switching, close/download races, mute, suspended context, cold event load and cooldowns');
