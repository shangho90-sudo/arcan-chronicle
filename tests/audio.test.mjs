import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { skillSound, SFX_NAMES, SFX_REWARDS } from '../js/sfx.js';

for (const name of SFX_NAMES) {
  const b = readFileSync(new URL(`../assets/audio/sfx_${name}.mp3`, import.meta.url));
  assert.ok(b.length > 500, name + ' audio asset');
  assert.ok(b.toString('ascii', 0, 3) === 'ID3' || b[0] === 255, name + ' MP3 header');
}
assert.equal(skillSound({ job: 'novice' }), 'swing');
assert.equal(skillSound({ ops: [{ op: 'heal' }] }), 'heal');
assert.equal(skillSound({ ops: [{ op: 'shield' }] }), 'shield');
assert.equal(skillSound({}, { elem: 'fire' }), 'fire');
assert.equal(skillSound({}, { elem: 'ice' }), 'ice');
assert.equal(skillSound({}, { tag: 'flask' }), 'splash');
assert.equal(skillSound({ type: 'ultimate' }, {}), 'boss_slam');
const skills = JSON.parse(readFileSync(new URL('../assets/data/skills2.json', import.meta.url))).skills;
for (const skill of skills.filter(s => s.type !== 'passive')) assert.ok(SFX_NAMES.includes(skillSound(skill)), skill.id);

// Exercise the actual audio class without importing the renderer or requiring a device.
const source = readFileSync(new URL('../js/io.js', import.meta.url), 'utf8').split('export class Audio ')[1];
let now = 0, starts = 0, requests = 0;
const sandbox = { SFX_NAMES, SFX_REWARDS, performance: { now: () => now },
  fetch: async () => { requests++; return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) }; } };
vm.createContext(sandbox);
vm.runInContext('this.Audio = class Audio ' + source, sandbox);
const a = new sandbox.Audio();
const channel = new Float32Array([0, 1, -1]);
a.ctx = { state: 'running', decodeAudioData: async () => ({ numberOfChannels: 1, getChannelData: () => channel }),
  createBufferSource: () => ({ playbackRate: {}, connect() {}, disconnect() {}, start() { starts++; } }),
  createGain: () => ({ gain: {}, connect() {}, disconnect() {} }) };
a.gSfx = {};
await Promise.all([a.sfx('hit'), a.sfx('hit')]);
assert.equal(starts, 1, 'simultaneous impacts coalesced, including first frame');
assert.equal(requests, 1, 'buffer cached');
assert.ok(Math.abs(channel[1] - 0.65) < 0.001, 'sample peak normalized');
for (let i = 0; i < 15; i++) { now += 100; await a.sfx('hit'); }
assert.equal(a.voices.size, 12, 'combat voice cap');
await a.sfx('levelup');
assert.equal(a.voices.size, 13, 'reward voice reserved');
assert.equal([...a.voices].find(v => v.reward).s.playbackRate.value, 1, 'reward pitch stable');
for (const v of [...a.voices]) v.s.onended();
assert.equal(a.voices.size, 0, 'ended voices cleaned');
const before = starts;
a.sfxVol = 0; now += 100; await a.sfx('hit');
assert.equal(starts, before, 'muted sound not played');
a.sfxVol = 1; a.ctx.state = 'suspended'; await a.sfx('hit');
assert.equal(starts, before, 'suspended context not queued');
a.ctx.state = 'running'; now += 100;
a.buf = async () => { now += 301; return {}; };
await a.sfx('hit');
assert.equal(starts, before, 'stale downloads not played late');
console.log('audio: asset headers, skill mapping, caching, normalization, throttling, voice limits, mute and stale playback passed');

// Region switches may complete out of order, fail, or return to the playing zone.
const music = new sandbox.Audio(), pending = new Map(), played = [];
music.ctx = { createBufferSource: () => {
  const s = { connect() {}, disconnect() {}, stop() { s.stopped = true; }, start() { played.push(s); } };
  return s;
} };
music.gMusic = {};
music.buf = name => { const p = new Promise(resolve => pending.set(name, resolve)); music.buffers.set(name, p); return p; };
let task = music.playMusic('bgm_a'); pending.get('bgm_a')({}); await task;
assert.equal(music.curName, 'bgm_a'); assert.equal(music.cur.loop, true);
const initial = music.cur;
task = music.playMusic('bgm_b');
assert.ok(!initial.stopped, 'old track continues during download');
await music.playMusic('bgm_a');
pending.get('bgm_b')({}); await task;
assert.equal(music.cur, initial, 'returning to current region cancels obsolete request');
const slow = music.playMusic('bgm_slow');
const fast = music.playMusic('bgm_fast');
pending.get('bgm_fast')({}); await fast;
pending.get('bgm_slow')({}); await slow;
assert.equal(music.curName, 'bgm_fast', 'latest zone wins');
assert.ok(initial.stopped, 'previous source stopped');
assert.equal(music.buffers.size, 1, 'old decoded music evicted');
task = music.playMusic('bgm_retry'); pending.get('bgm_retry')(null); await task;
assert.equal(music.curName, 'bgm_fast', 'failed download keeps current music');
task = music.playMusic('bgm_retry'); pending.get('bgm_retry')({}); await task;
assert.equal(music.curName, 'bgm_retry', 'failed region can retry');
console.log('music: looping, out-of-order region loads, return travel, failure retry and cache eviction passed');
