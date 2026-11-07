// 서장 '별을 잇는 자' — illustrated prologue shown once for a new character, before they appear in the town.
// Data: assets/data/prologue.json (panels: image, slow pan, animated light overlays, narration lines).
// Pictures: tools/prologue/paint.py -> assets/ui/prologue/p<N>.jpg.
// Controls: click / tap / Space / Enter = finish the line or go on, Esc or "건너뛰기" = skip to the end.
// The last card ("그리고 지금. 카이리온 왕국의 어느 가을날") fades over the live town with falling leaves.

const CPS = 30;                        // typewriter speed (characters / s)
const FADE = 900;                      // panel cross-fade (ms)

export class Prologue {
  constructor(game) { this.G = game; this.el = null; }

  /** onDone() runs once, after the overlay has faded (skip included) */
  async play(onDone) {
    let data;
    try { data = await (await fetch('assets/data/prologue.json')).json(); } catch (e) { console.warn('prologue', e); return onDone(); }
    this.data = data; this.onDone = onDone; this.done = false;
    const root = this.el = document.createElement('div'); root.className = 'prologue';
    root.innerHTML = `<div class="pl-stage"></div><div class="pl-shade"></div>
      <div class="pl-box"><div class="pl-who"></div><div class="pl-text"></div><i class="pl-next">▼</i></div>
      <button type="button" class="pl-skip" aria-label="건너뛰기">건너뛰기 <b>▶▶</b></button>
      <div class="pl-end"><div class="pl-leaves"></div><p class="pl-e1"></p><p class="pl-e2"></p></div>`;
    document.body.appendChild(root);
    this.stage = root.querySelector('.pl-stage'); this.box = root.querySelector('.pl-box');
    this.who = root.querySelector('.pl-who'); this.text = root.querySelector('.pl-text');
    // preload every picture first (the first one is awaited, the rest load in the background)
    this.imgs = data.panels.map(p => { const i = new Image(); i.decoding = 'async'; i.src = p.img; return i; });
    await this.imgs[0].decode().catch(() => {});
    this.G.input && (this.G.input.block = true);
    this.onKey = e => {                // capture phase: the game's own keys (Space attack, Esc menu) never see these
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); this.finish(); }
      else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); this.advance(); }
    };
    window.addEventListener('keydown', this.onKey, true);
    root.addEventListener('pointerup', e => { if (!e.target.closest('.pl-skip')) this.advance(); });
    root.querySelector('.pl-skip').onclick = e => { e.stopPropagation(); this.G.audio && this.G.audio.sfx('ui'); this.finish(); };
    requestAnimationFrame(() => root.classList.add('on'));
    setTimeout(() => { if (!this.done) this.G.prologueCover = true; }, 900);   // once fully opaque
    this.pi = -1; this.li = 0; this.showPanel(0);
  }

  showPanel(i) {
    const P = this.data.panels[i]; this.pi = i; this.li = 0;
    const [z0, z1, x0, y0, x1, y1] = P.pan || [1.06, 1, 50, 50, 50, 50];
    const dur = Math.max(9, P.lines.reduce((s, l) => s + 1.6 + l.text.replace(/<[^>]+>/g, '').length / CPS, 2));
    const layer = document.createElement('div'); layer.className = 'pl-layer';
    layer.innerHTML = `<div class="pl-blur" style="background-image:url(${P.img})"></div><div class="pl-pan" style="background-image:url(${P.img});--z0:${z0};--z1:${z1};--x0:${x0}%;--y0:${y0}%;--x1:${x1}%;--y1:${y1}%;animation-duration:${dur}s">${(P.fx || []).map(fxHtml).join('')}</div>`;
    this.stage.appendChild(layer);
    requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add('in')));
    const old = [...this.stage.children].slice(0, -1);
    setTimeout(() => old.forEach(o => o.remove()), FADE + 100);
    this.box.classList.remove('show'); setTimeout(() => { if (this.pi === i && !this.done) this.showLine(); }, i === 0 ? 700 : 450);
  }

  showLine() {
    const L = this.data.panels[this.pi].lines[this.li];
    this.box.classList.add('show'); this.box.classList.toggle('speak', !!L.who);
    this.who.textContent = L.who || '';
    // typewriter over the visible characters only (tags are kept whole)
    const parts = L.text.split(/(<[^>]+>)/); let shown = 0; const total = L.text.replace(/<[^>]+>/g, '').length;
    this.full = (L.who ? '“' : '') + L.text + (L.who ? '”' : '');
    this.typing = true; clearInterval(this.tick); this.el.dataset.line = this.pi + '.' + this.li; this.el.dataset.typing = '1';
    const t0 = performance.now();
    this.tick = setInterval(() => {
      shown = Math.min(total, Math.floor((performance.now() - t0) / 1000 * CPS));
      let n = shown, out = '';
      for (const p of parts) { if (p.startsWith('<')) { out += p; continue; } if (n <= 0) break; out += p.slice(0, n); n -= p.length; }
      this.text.innerHTML = (L.who ? '“' : '') + out + (shown >= total && L.who ? '”' : '');
      if (shown >= total) { clearInterval(this.tick); this.typing = false; this.el.dataset.typing = ''; }
    }, 33);
  }

  advance() {
    if (this.done || this.pi < 0) return;
    if (this.typing) { clearInterval(this.tick); this.typing = false; this.el.dataset.typing = ''; this.text.innerHTML = this.full; return; }
    const P = this.data.panels[this.pi];
    this.G.audio && this.G.audio.sfx('ui');
    if (++this.li < P.lines.length) return this.showLine();
    if (this.pi + 1 < this.data.panels.length) return this.showPanel(this.pi + 1);
    this.finish();
  }

  /** last card over the live town, then fade out and hand over */
  finish() {
    if (this.done) return; this.done = true; clearInterval(this.tick);
    const r = this.el, E = this.data.ending || {};
    r.querySelector('.pl-e1').textContent = E.text || ''; r.querySelector('.pl-e2').textContent = E.sub || '';
    const lv = r.querySelector('.pl-leaves');
    for (let i = 0; i < 26; i++) { const l = document.createElement('i'); l.style.cssText = `left:${Math.random() * 100}%;animation-delay:${(Math.random() * 6).toFixed(2)}s;animation-duration:${(6 + Math.random() * 5).toFixed(2)}s;--dx:${(Math.random() * 160 - 80).toFixed(0)}px;--s:${(0.6 + Math.random() * 0.8).toFixed(2)};--h:${Math.floor(10 + Math.random() * 30)}`; lv.appendChild(l); }
    r.classList.add('ending'); this.box.classList.remove('show'); this.G.prologueCover = false;   // the live scene shows through again
    const out = () => {
      r.classList.add('out');
      setTimeout(() => { window.removeEventListener('keydown', this.onKey, true); r.remove(); this.el = null; const f = this.onDone; this.onDone = null; f && f(); }, 1400);
    };
    this.endTimer = setTimeout(out, 4200);
    r.addEventListener('pointerup', () => { clearTimeout(this.endTimer); out(); }, { once: true });
  }
}

function fxHtml(f) {
  const st = `left:${f.x}%;top:${f.y}%;--r:${f.r || 10}vmax;--c:${f.color || '255,240,200'};animation-delay:${f.delay || 0}s`;
  if (f.kind === 'twinkle') return Array.from({ length: 40 }, () => `<i class="pl-tw" style="left:${(Math.random() * 100).toFixed(1)}%;top:${(Math.random() * 78).toFixed(1)}%;animation-delay:${(Math.random() * 4).toFixed(2)}s"></i>`).join('');
  return `<i class="pl-fx ${f.kind}${f.slow ? ' slow' : ''}" style="${st}"></i>`;
}
