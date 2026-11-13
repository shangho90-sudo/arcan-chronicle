// Input (keyboard / mouse / multi-touch) and audio.
import { screenToWorldDir } from './render.js';
import { SFX_NAMES, SFX_REWARDS, SFX_EVENTS } from './sfx.js';
// 대장장이 효과음 음량(합성 파일은 같은 정점으로 맞춰지므로 여기서 역할별로 나눔)
const BS_GAIN = { bs_swing: 0.26, bs_hit: 0.42, bs_hit_heavy: 0.5, bs_anvil: 0.55, bs_anvil_ring: 0.36, bs_tongs: 0.4, bs_quench: 0.34, bs_steam: 0.3, bs_steam3: 0.42, bs_wall: 0.4, bs_block: 0.32, bs_rivet: 0.3, bs_rivet_pop: 0.3, bs_rivet_shot: 0.34, bs_forge: 0.42, bs_break: 0.48 };

const KEYS = {
  attack: ["Space", "KeyJ"], skill1: ["Digit1", "Numpad1"], skill2: ["Digit2", "Numpad2"], skill3: ["Digit3", "Numpad3"], skill4: ["Digit4", "Numpad4", "KeyR"], skillWin: ["KeyK"], craftWin: ["KeyN"],
  dodge: ["ShiftLeft", "ShiftRight"], potion: ["KeyQ"], recall: ["KeyH"], interact: ["KeyF", "KeyE"], inventory: ["KeyI", "KeyB", "KeyC"], quests: ["KeyO"], questHud: ["KeyL"], stats: ["KeyP"], map: ["KeyM"], pause: ["Escape"]
};

/**
 * PC: WASD / arrows move in SCREEN directions, left click on the ground = move (hold to follow), click a monster = attack,
 * Space/J attack (hold = repeat), 1/2/3 skills, Shift dodge, Q potion, H 마을 귀환, F interact, I bag, O quests, Esc menu.
 * Mobile: floating left stick + right buttons, each finger tracked separately. Pointers that start on UI never reach the world.
 */
export class Input {
  constructor(canvas) {
    this.keys = new Set(); this.pressed = new Set(); this.uiPressed = new Set(); this.uiHeld = new Set();
    this.stick = { x: 0, y: 0 }; this.mobile = matchMedia("(pointer: coarse)").matches; this.block = false;
    this.pointer = null; this.mouseDown = false; this.pendingClick = null; this.lastClickPos = null;
    addEventListener("keydown", e => {
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    });
    addEventListener("keyup", e => this.keys.delete(e.code));
    // phones play upright: on the first touch ask the browser to keep portrait (works where the API exists, e.g. Android
    // Chrome / installed app; iOS ignores it and the CSS .rotate-hint covers a sideways phone instead)
    addEventListener("pointerdown", e => {
      if (e.pointerType !== "touch" || this._oriTried) return; this._oriTried = true;
      try { const o = screen.orientation; if (o && o.lock) o.lock("portrait").catch(() => {}); } catch (_) {}
    }, { capture: true, passive: true });
    addEventListener("blur", () => { this.keys.clear(); this.mouseDown = false; });
    canvas.addEventListener("pointerdown", e => {
      if (e.pointerType === "touch") { this.mobile = true; this.pendingClick = { x: e.clientX, y: e.clientY }; return; }
      if (e.button !== 0) return;
      this.mouseDown = true; this.pendingClick = { x: e.clientX, y: e.clientY }; this.lastClickPos = this.pendingClick;
    });
    canvas.addEventListener("pointermove", e => {
      if (e.pointerType !== "touch") this.pointer = { x: e.clientX, y: e.clientY };
      if (this.mouseDown && e.pointerType !== "touch") {
        const l = this.lastClickPos; if (!l || Math.hypot(e.clientX - l.x, e.clientY - l.y) > 8) { this.pendingClick = { x: e.clientX, y: e.clientY }; this.lastClickPos = this.pendingClick; }
      }
    });
    addEventListener("pointerup", e => { if (e.pointerType !== "touch") this.mouseDown = false; });
    canvas.addEventListener("contextmenu", e => e.preventDefault());
  }
  press(a) { this.uiPressed.add(a); }
  hold(a, on) { if (on) { this.uiHeld.add(a); this.uiPressed.add(a); } else this.uiHeld.delete(a); }
  /** called once per frame: builds this frame's state */
  frame() {
    const down = {}, held = {};
    for (const [a, codes] of Object.entries(KEYS)) {
      down[a] = codes.some(c => this.pressed.has(c)) || this.uiPressed.has(a);
      held[a] = codes.some(c => this.keys.has(c)) || this.uiHeld.has(a);
    }
    this.pressed.clear(); this.uiPressed.clear();
    let sx = 0, sy = 0;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) sy += 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) sy -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) sx += 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) sx -= 1;
    if (sx === 0 && sy === 0) { sx = this.stick.x; sy = this.stick.y; } else { const m = Math.hypot(sx, sy); sx /= m; sy /= m; }
    let move = null;
    if (!this.block && sx * sx + sy * sy > 0.02) { const w = screenToWorldDir(sx, sy), k = Math.min(1, Math.hypot(sx, sy) * 1.15); move = { x: w.x * k, z: w.z * k }; this.mouseDown = false; }
    const click = this.block ? null : this.pendingClick;
    this.pendingClick = null;
    return { down, held, move, click, pointer: this.pointer, mobile: this.mobile, block: this.block };
  }
}

export class Audio {
  constructor() {
    this.music = 0.6; this.sfxVol = 0.8; this.buffers = new Map(); this.last = new Map(); this.ctx = null; this.cur = null; this.curName = null;
    this.voices = new Set();
    this.npcVoices = {}; this.npcRequest = 0; this.npcSource = null;
  }
  /** browsers only allow sound after a user gesture; `tryEarly` creates the context right away (it starts suspended
   *  unless the browser already allows autoplay for this site) so the queued music starts the moment it is allowed */
  get audible() { return !!this.ctx && this.ctx.state === "running"; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume().then(() => this.onState && this.onState()).catch(() => { }); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.gMusic = this.ctx.createGain(); this.gMusic.connect(this.ctx.destination); this.gSfx = this.ctx.createGain(); this.gSfx.connect(this.ctx.destination); this.apply(); this.ctx.onstatechange = () => this.onState && this.onState(); if (this.ctx.state === "suspended") this.ctx.resume().catch(() => { }); if (this.wantMusic) this.playMusic(this.wantMusic, true); this.preloadSfx(); } catch (e) { this.ctx = null; }
  }
  apply() { if (this.ctx) { this.gMusic.gain.value = this.music * 0.5; this.gSfx.gain.value = this.sfxVol; if (this.sfxVol <= 0) this.stopNpcVoice(); if (this.music <= 0 && this.stopSkillBed) this.stopSkillBed(); } }
  async loadNpcVoices() {
    try { const r = await fetch('assets/data/npc-voices.json'); if (!r.ok) throw new Error(r.status); this.npcVoices = await r.json(); }
    catch (e) { console.warn('NPC 인사 음성을 불러오지 못했습니다.', e); }
  }
  stopNpcVoice() {
    this.npcRequest++;
    if (this.npcSource) { try { this.npcSource.stop(); } catch (e) { } this.npcSource = null; }
  }
  async npcGreeting(id) {
    this.stopNpcVoice();
    const def = this.npcVoices[id], request = this.npcRequest, now = performance.now();
    if (!def || !this.audible || this.sfxVol <= 0) return;
    const b = await this.buf(def.file);
    // Closing the dialogue, switching NPCs or travelling cancels even a pending download.
    if (!b || request !== this.npcRequest || !this.audible || this.sfxVol <= 0 || performance.now() - now > 5000) return;
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain();
    s.buffer = b; g.gain.value = 0.9; s.connect(g); g.connect(this.gSfx); this.npcSource = s;
    s.onended = () => { if (this.npcSource === s) this.npcSource = null; s.disconnect(); g.disconnect(); };
    s.start();
  }
  async buf(name) {
    if (!this.ctx) return null;
    if (this.buffers.has(name)) return this.buffers.get(name);
    const p = fetch("assets/audio/" + name + ".mp3").then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }).then(a => this.ctx.decodeAudioData(a)).then(b => {
      // Keep generated samples at a consistent peak without changing music.
      if (name.startsWith('sfx_') || name.startsWith('voice_')) {
        let peak = 0;
        for (let c = 0; c < b.numberOfChannels; c++) for (const v of b.getChannelData(c)) peak = Math.max(peak, Math.abs(v));
        if (peak > 0) for (let c = 0; c < b.numberOfChannels; c++) { const a = b.getChannelData(c), gain = Math.min(3, 0.65 / peak); for (let i = 0; i < a.length; i++) a[i] *= gain; }
      }
      return b;
    }).catch(() => { this.buffers.delete(name); return null; });
    this.buffers.set(name, p); return p;
  }
  async sfx(name) {
    if (!this.audible || !name || this.sfxVol <= 0) return;
    const reward = SFX_REWARDS.has(name), event = SFX_EVENTS.has(name), now = performance.now();
    const gap = name === 'jobchange' ? 1500 : reward ? (name === 'levelup' ? 1200 : 120) : name === 'dialog' ? 90 : name === 'warp' ? 600 : 65;
    if (now - (this.last.get(name) ?? -Infinity) < gap) return; this.last.set(name, now);
    const b = await this.buf("sfx_" + name);
    if (!b || !this.audible || this.sfxVol <= 0 || performance.now() - now > (event ? 2000 : 300)) return;
    // Reserve separate voices for rewards, so a large battle cannot hide a level-up.
    if ([...this.voices].filter(v => v.reward === reward).length >= (reward ? 4 : 12)) return;
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain();
    s.buffer = b; s.playbackRate.value = reward || event ? 1 : 0.96 + Math.random() * 0.08;
    g.gain.value = name.startsWith('bs_') ? (BS_GAIN[name] ?? 0.4) : name === 'ph_flask' ? 0.18 : name === 'ph_spin' ? 0.22 : name === 'ph_slam' ? 0.5 : name === 'ph_smash_hit' ? 0.5 : name === 'ph_push_hit' ? 0.46 : name === 'ph_smash_swing' ? 0.3 : name === 'dialog' ? 0.24 : name === 'warp' ? 0.58 : reward ? 0.65 : 0.38; s.connect(g); g.connect(this.gSfx);
    const voice = { s, reward }; this.voices.add(voice);
    s.onended = () => { this.voices.delete(voice); s.disconnect(); g.disconnect(); }; s.start();
  }
  // A short spell bed shares the music volume; its area owns cancellation, including pending loads.
  skillBed(name) {
    if (this.stopSkillBed) this.stopSkillBed();
    let cancelled = false, source = null;
    const stop = () => { cancelled = true; if (source) { try { source.stop(); } catch (e) {} source = null; } };
    this.stopSkillBed = stop;
    if (!this.audible || this.music <= 0) return stop;
    const started = performance.now();
    this.buf(name).then(b => {
      if (!b || cancelled || !this.audible || this.music <= 0 || performance.now() - started > 300) return;
      const s = this.ctx.createBufferSource(), g = this.ctx.createGain();
      source = s; s.buffer = b; g.gain.value = 0.26;
      s.connect(g); g.connect(this.gMusic);
      s.onended = () => { s.disconnect(); g.disconnect(); if (source === s) source = null; };
      s.start();
    });
    return stop;
  }
  async preloadSfx() {
    // Four concurrent fetch/decode workers; never block game startup on sound.
    const queue = [...SFX_NAMES];
    await this.buf('bgm_ph_heal_bed');
    await Promise.all(Array.from({ length: 4 }, async () => { while (queue.length) await this.buf('sfx_' + queue.shift()); }));
    const greetings = Object.values(this.npcVoices).map(v => v.file);
    await Promise.all(Array.from({ length: 3 }, async () => { while (greetings.length) await this.buf(greetings.shift()); }));
  }
  /** small synthesized sounds (no audio file): 'exp' = bright bell whose pitch climbs with each orb, 'levelup' = rising shimmer chord */
  chime(kind, n = 1) {
    const C = this.ctx; if (!C || C.state !== 'running') return; const t0 = C.currentTime;
    const bell = (f, at, dur, vol, type = 'sine') => {
      const o = C.createOscillator(), o2 = C.createOscillator(), g = C.createGain();
      o.type = type; o.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f * 2.01;
      g.gain.setValueAtTime(0.0001, t0 + at); g.gain.exponentialRampToValueAtTime(vol, t0 + at + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      const g2 = C.createGain(); g2.gain.value = 0.35; o.connect(g); o2.connect(g2); g2.connect(g); g.connect(this.gSfx);
      o.start(t0 + at); o2.start(t0 + at); o.stop(t0 + at + dur + 0.05); o2.stop(t0 + at + dur + 0.05);
    };
    if (kind === 'exp') {
      const now = performance.now(); if (now - (this._expT || 0) < 45) return; this._expT = now;
      const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21], f = 1046.5 * Math.pow(2, scale[Math.min(scale.length - 1, n - 1)] / 12);
      bell(f, 0, 0.35, 0.09);
    } else if (kind === 'fanfare') {
      // heralds' fanfare: two brassy voices (sawtooth through a low-pass), G-G-G-C . E-C . G-high C, then a held chord
      const brass = (f, at, dur, vol) => {
        const o = C.createOscillator(), o2 = C.createOscillator(), lp = C.createBiquadFilter(), g = C.createGain();
        o.type = 'sawtooth'; o2.type = 'sawtooth'; o.frequency.value = f; o2.frequency.value = f * 1.004; lp.type = 'lowpass'; lp.Q.value = 2;
        lp.frequency.setValueAtTime(f * 1.5, t0 + at); lp.frequency.linearRampToValueAtTime(f * 6, t0 + at + 0.06); lp.frequency.linearRampToValueAtTime(f * 3.5, t0 + at + dur);
        g.gain.setValueAtTime(0.0001, t0 + at); g.gain.exponentialRampToValueAtTime(vol, t0 + at + 0.04); g.gain.setValueAtTime(vol, t0 + at + dur * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur + 0.12);
        o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(this.gSfx); o.start(t0 + at); o2.start(t0 + at); o.stop(t0 + at + dur + 0.2); o2.stop(t0 + at + dur + 0.2);
      };
      const s0 = 1.05, G4 = 392, C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5;
      [[G4, 0, .12], [G4, .14, .12], [G4, .28, .12], [C5, .42, .42], [E5, .9, .16], [C5, 1.08, .16], [G5, 1.26, .2], [C6, 1.5, 1.1]].forEach(([f, a, d]) => { brass(f, s0 + a, d, 0.05); brass(f / 2, s0 + a, d, 0.025); });
      [C5, E5, G5].forEach(f => brass(f, s0 + 1.5, 1.1, 0.025));
      [1046.5, 1318.5, 1568, 2093].forEach((f, i) => bell(f, 0.05 + i * 0.05, 1.6, 0.03));      // shimmer as the light closes
    } else if (kind === 'levelup') {
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568];
      notes.forEach((f, i) => bell(f, i * 0.07, 1.4 - i * 0.1, 0.07, 'triangle'));
      [1046.5, 1318.5, 1568, 2093].forEach((f, i) => bell(f, 0.5 + i * 0.015, 1.8, 0.035));       // sustained sparkle chord
    }
  }
  async playMusic(name, force) {
    this.wantMusic = name;
    const request = this.musicRequest = (this.musicRequest || 0) + 1;
    if (!this.ctx || !name || (!force && name === this.curName && this.cur)) return;
    // Keep the current track playing while the next region downloads. Failed loads can retry.
    const b = await this.buf(name); if (!b || this.musicRequest !== request) return;
    if (this.cur) { try { this.cur.stop(); } catch (e) { } this.cur.disconnect(); }
    const s = this.ctx.createBufferSource(); s.buffer = b; s.loop = true; s.connect(this.gMusic); s.start(); this.cur = s; this.curName = name;
    // Forty-nine full-length region scores must not accumulate as decoded PCM in memory.
    for (const key of this.buffers.keys()) if (key.startsWith('bgm_') && key !== 'bgm_ph_heal_bed' && key !== name) this.buffers.delete(key);
  }
}
