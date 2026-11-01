// Input (keyboard / mouse / multi-touch) and audio.
import { screenToWorldDir } from './render.js';

const KEYS = {
  attack: ["Space", "KeyJ"], skill1: ["Digit1", "Numpad1"], skill2: ["Digit2", "Numpad2"], skill3: ["Digit3", "Numpad3"], skill4: ["Digit4", "Numpad4"], ult: ["KeyR", "Digit5"], skillWin: ["KeyK"], craftWin: ["KeyN"],
  dodge: ["ShiftLeft", "ShiftRight"], potion: ["KeyQ"], interact: ["KeyF", "KeyE"], inventory: ["KeyI", "KeyB", "KeyC"], quests: ["KeyO"], pause: ["Escape"]
};

/**
 * PC: WASD / arrows move in SCREEN directions, left click on the ground = move (hold to follow), click a monster = attack,
 * Space/J attack (hold = repeat), 1/2/3 skills, Shift dodge, Q potion, F interact, I bag, O quests, Esc menu.
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
  }
  /** browsers only allow sound after a user gesture; `tryEarly` creates the context right away (it starts suspended
   *  unless the browser already allows autoplay for this site) so the queued music starts the moment it is allowed */
  get audible() { return !!this.ctx && this.ctx.state === "running"; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume().then(() => this.onState && this.onState()).catch(() => { }); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.gMusic = this.ctx.createGain(); this.gMusic.connect(this.ctx.destination); this.gSfx = this.ctx.createGain(); this.gSfx.connect(this.ctx.destination); this.apply(); this.ctx.onstatechange = () => this.onState && this.onState(); if (this.ctx.state === "suspended") this.ctx.resume().catch(() => { }); if (this.wantMusic) this.playMusic(this.wantMusic, true); } catch (e) { this.ctx = null; }
  }
  apply() { if (this.ctx) { this.gMusic.gain.value = this.music * 0.5; this.gSfx.gain.value = this.sfxVol; } }
  async buf(name) {
    if (!this.ctx) return null;
    if (this.buffers.has(name)) return this.buffers.get(name);
    const p = fetch("assets/audio/" + name + ".mp3").then(r => r.arrayBuffer()).then(a => this.ctx.decodeAudioData(a)).catch(() => null);
    this.buffers.set(name, p); return p;
  }
  async sfx(name) {
    if (!this.ctx || !name) return;
    const now = performance.now(); if (now - (this.last.get(name) || 0) < 40) return; this.last.set(name, now);
    const b = await this.buf("sfx_" + name); if (!b) return;
    const s = this.ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = 0.94 + Math.random() * 0.12; s.connect(this.gSfx); s.start();
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
    } else if (kind === 'levelup') {
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568];
      notes.forEach((f, i) => bell(f, i * 0.07, 1.4 - i * 0.1, 0.07, 'triangle'));
      [1046.5, 1318.5, 1568, 2093].forEach((f, i) => bell(f, 0.5 + i * 0.015, 1.8, 0.035));       // sustained sparkle chord
    }
  }
  async playMusic(name, force) {
    this.wantMusic = name;
    if (!this.ctx || (!force && name === this.curName)) return;
    this.curName = name;
    if (this.cur) { try { this.cur.stop(); } catch (e) { } this.cur = null; }
    const b = await this.buf(name); if (!b || this.curName !== name) return;
    const s = this.ctx.createBufferSource(); s.buffer = b; s.loop = true; s.connect(this.gMusic); s.start(); this.cur = s;
  }
}
