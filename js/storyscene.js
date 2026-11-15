// 메인 스토리 대화 장면 (2026-11-15, 사용자 요청 '창세기전처럼 대화창 애니메이션') — 메인 퀘스트(questCategory 'main')의
// 받기·진행·완료 대사만. 상점·주민·서브 퀘스트는 예전 대화창(ui.showDialog) 그대로.
//  - 게임 화면은 뒤에 보이게(어둡게·살짝 흐리게), 큰 반신 초상 왼쪽/오른쪽 두 자리: 말하는 사람은 밝고 앞으로, 듣는 사람은
//    어둡고 작게. 화자가 바뀌면 작게 튀어 오름, 평소에는 숨쉬기.
//  - 아래 넓은 반투명 남색 상자 + 얇은 금빛 테 + 이름 패(주아체), 타자기 글자. 누르기/Space/Enter/F = 줄 끝내기 → 다음.
//    '건너뛰기' = 마지막 쪽(수락·완료 단추)으로. 끝 쪽에 원래 단추(수락하기/나중에, 돌아가기/대화 종료)를 같은 상자 안에.
//  - 대사·화자는 quests.json 텍스트에서 읽음(js/storyparse.js) — 퀘스트마다 코드 없음.
//  - 초상: assets/ui/story/portraits.json(화자 키 → 그림, 표정 expr) → 없으면 3D 모델 반신 렌더(portrait.js renderBust,
//    모델 키마다 한 번, 캐시). 플레이어도 지금 몸(직업·성별) 렌더. 그림·모델이 모두 없으면 초상 없이 이름 패만.
//  - 한 사람만 말하는 장면이면 플레이어가 반대편(왼쪽)에 듣는 사람으로 섬.
import * as THREE from 'three';
import { NPC_MODELS, loadNpcModel, loadActions, ModelBody } from './model.js';
import { renderBust, bodyTexturesReady } from './portrait.js';
import { parseStory, makeResolver } from './storyparse.js';

const CPS = 42;                          // 타자기 글자/초
const MANIFEST = 'assets/ui/story/portraits.json';
const busts = new Map();                 // render key → Promise<dataURL|null>
let manifestP = null;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wait = ms => new Promise(r => setTimeout(r, ms));

function loadManifest() {
  if (!manifestP) manifestP = fetch(MANIFEST).then(r => r.ok ? r.json() : {}).catch(() => ({}));
  return manifestP;
}

/** 3D model key for an npc def (NPC_MODELS id or borrowed model), or null */
export function npcModelKey(def) {
  if (!def) return null;
  if (NPC_MODELS[def.id]) return def.id;
  return def.model && NPC_MODELS[def.model] ? def.model : null;
}

/** bust of an NPC model, rendered off-screen once per model key */
function npcBust(key) {
  if (busts.has('npc:' + key)) return busts.get('npc:' + key);
  const p = (async () => {
    const [md, sh] = await Promise.all([loadNpcModel(key), loadActions()]);
    const sc = new THREE.Scene(), b = new ModelBody(sc, md, sh, 0.34);
    try {
      b.shadow.visible = false; b.play('idle'); b.update(0.016); b.update(0.3);
      for (let i = 0; i < 60 && !bodyTexturesReady(b); i++) await wait(100);
      return renderBust(b);
    } finally { try { b.dispose(); } catch (e) { } }
  })().catch(e => { console.warn('story bust', key, e); busts.delete('npc:' + key); return null; });
  busts.set('npc:' + key, p); return p;
}

function playerBust(G) {
  const body = G.player && G.player.body; if (!body || !body.root || !body.md) return Promise.resolve(null);
  const k = 'player:' + body.md.cfg.file + '|' + (body.md.cfg.tex || '') + '|' + (G.profile && G.profile.job);
  if (busts.has(k)) return busts.get(k);
  const p = (async () => {
    for (let i = 0; i < 40 && !bodyTexturesReady(body); i++) await wait(100);
    return renderBust(body);
  })().catch(() => null).then(u => { if (!u) busts.delete(k); return u; });
  busts.set(k, p); return p;
}

export class StoryScene {
  constructor(game) { this.G = game; this.el = null; this.cps = CPS; }

  /** is this quest dialogue shown as a story scene? (main quests only) */
  static wants(q, cat) { return !!q && cat === 'main'; }

  /**
   * npc: the NPC being talked to (def), html: quest text, opts: [[label, fn]] (last = ivory, like showDialog),
   * reward: html shown with the buttons on the last page, title: quest name (small kicker)
   */
  async play({ npc, html, opts, reward = '', title = '' }) {
    const G = this.G, ui = G.ui;
    const resolve = makeResolver(G.data, G.profile && G.profile.name);
    const defWho = npc ? { key: npc.id, name: npc.name } : null;
    const pages = parseStory(html, defWho, resolve);
    if (!pages.length) pages.push({ who: defWho, html: '…', narr: false });
    this.pages = pages; this.opts = opts || []; this.reward = reward; this.i = -1; this.typing = false;
    // slots: first NPC speaker → right; the next different speaker → left; a lone speaker gets the player on the left
    const keys = [...new Set(pages.filter(p => p.who && p.who.key).map(p => p.who.key))];
    this.cast = new Map();                                   // key → {name, title, src?}
    for (const p of pages) if (p.who && p.who.key && !this.cast.has(p.who.key)) this.cast.set(p.who.key, { name: p.who.name });
    this.withPlayer = keys.filter(k => k !== 'player').length <= 1 && G.player;
    if (this.withPlayer && !this.cast.has('player')) this.cast.set('player', { name: G.profile ? G.profile.name : '나' });
    this.slots = { left: null, right: null };

    // ---- DOM (registered as the UI's current window: input blocked, other windows replace it)
    const el = this.el = document.createElement('div');
    el.className = 'vnscene'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', '이야기 대화');
    el.innerHTML = `<div class="vn-shade"></div>
      <div class="vn-stage"><div class="vn-por left"><div class="vn-fig"><img alt=""></div></div><div class="vn-por right"><div class="vn-fig"><img alt=""></div></div></div>
      <div class="vn-box"><div class="vn-name"><span class="vn-nm"></span><small class="vn-ti"></small></div>
        <div class="vn-text"></div><div class="vn-end"><div class="vn-reward"></div><div class="vn-opts"></div></div><i class="vn-next" aria-hidden="true"></i></div>
      ${title ? `<div class="vn-kicker">✦ ${esc(title)}</div>` : ''}
      <button type="button" class="vn-skip" aria-label="건너뛰기">건너뛰기 <span>»</span></button>`;
    this.box = el.querySelector('.vn-box'); this.nameEl = el.querySelector('.vn-nm'); this.tiEl = el.querySelector('.vn-ti');
    this.text = el.querySelector('.vn-text'); this.endEl = el.querySelector('.vn-end');
    this.por = { left: el.querySelector('.vn-por.left'), right: el.querySelector('.vn-por.right') };
    ui.openLayer('story', el, () => this.cleanup());
    el.addEventListener('pointerup', e => { if (e.target.closest('button')) return; e.preventDefault(); this.advance(); });
    el.querySelector('.vn-skip').onclick = e => { e.stopPropagation(); G.audio && G.audio.sfx('ui'); this.skip(); };
    this.onKey = e => {
      if (!this.el) return;
      if (['Space', 'Enter', 'NumpadEnter', 'KeyF', 'KeyE', 'Escape'].includes(e.code)) {
        e.stopPropagation(); e.preventDefault(); if (e.repeat) return;
        if (e.code === 'Escape') { if (this.i < this.pages.length - 1 || this.typing) this.skip(); return; }
        // last page: keys never pick an answer by themselves (a fast Space would accept the quest) — Enter only on a focused button (Tab)
        if (this.atEnd() && !this.typing) { const f = document.activeElement; if ((e.code === 'Enter' || e.code === 'NumpadEnter') && f && f.closest && f.closest('.vn-opts')) f.click(); return; }
        this.advance();
      }
    };
    window.addEventListener('keydown', this.onKey, true);
    this.shownAt = performance.now();
    requestAnimationFrame(() => el.classList.add('on'));

    // portraits: illustration (manifest) or 3D bust; all start at once, each slot shows when ready
    const man = await loadManifest().catch(() => ({}));
    if (this.el !== el) return;
    const ill = (man && man.portraits) || {};
    for (const [key, c] of this.cast) {
      const def = key === 'player' ? null : G.data.npcs[key];
      if (def) c.title = def.title || '';
      const art = ill[key] || (c.name && Object.values(ill).find(x => x && x.names && x.names.includes(c.name)));
      if (art && art.file) { c.art = art; c.src = Promise.resolve('assets/ui/story/' + art.file); c.facing = art.facing || 'right'; continue; }
      c.facing = 'right';                                     // renderBust turns the model toward the viewer's right
      if (key === 'player') c.src = playerBust(G);
      else { const mk = npcModelKey(def); c.src = mk ? npcBust(mk) : Promise.resolve(null); }
    }
    this.next();
  }

  atEnd() { return this.i >= this.pages.length - 1; }

  /** assign the speaker of page i to a slot and update the stage */
  stage(p) {
    const who = p.who && p.who.key ? p.who.key : null;
    const S = this.slots;
    if (who) {
      if (S.left !== who && S.right !== who) {
        let side;
        if (who === 'player') side = 'left';                          // the player always stands on the left
        else if (!S.right) side = 'right';
        else if (!S.left) side = 'left';
        else if (S.left === 'player') side = 'right';
        else side = this.lastSide === 'right' ? 'left' : 'right';   // replace the one who did not just speak
        this.put(side, who);
      }
    }
    if (this.withPlayer && !S.left) this.put('left', 'player');
    const speak = who ? (S.left === who ? 'left' : S.right === who ? 'right' : null) : null;
    for (const side of ['left', 'right']) {
      const el = this.por[side], on = speak === side;
      el.classList.toggle('speak', on); el.classList.toggle('listen', !on && !!S[side]);
      if (on && this.lastSpeaker !== who) { el.classList.remove('bounce'); void el.offsetWidth; el.classList.add('bounce'); }
    }
    if (speak) this.lastSide = speak;
    // expression variant (illustrations only): <b class='gold' data-expr='angry'>
    const c = who && this.cast.get(who);
    if (c && c.art) {
      c.expr = p.who.expr || null;
      const img = speak && this.por[speak].querySelector('img'), f = this.artFile(c);
      if (img && img.getAttribute('src') && img.getAttribute('src') !== f) img.src = f;
    }
    this.lastSpeaker = who;
    this.box.classList.toggle('narr', !!p.narr); this.box.classList.toggle('left', speak === 'left');
  }

  put(side, key) {
    const S = this.slots, el = this.por[side], img = el.querySelector('img'), c = this.cast.get(key) || {};
    S[side] = key; el.classList.remove('shown'); el.dataset.who = key;
    const tok = (this.tok = (this.tok || 0) + 1); el.dataset.tok = tok;
    const flip = (c.facing || 'right') === 'right' ? side === 'right' : side === 'left';    // face the middle of the screen
    el.classList.toggle('flip', flip);
    Promise.resolve(c.art ? this.artFile(c) : c.src).then(src => {
      if (!this.el || el.dataset.tok !== String(tok)) return;
      if (!src) { el.classList.add('none'); return; }
      el.classList.remove('none');
      img.onload = () => { if (el.dataset.tok === String(tok)) requestAnimationFrame(() => el.classList.add('shown')); };
      img.src = src;
    });
  }

  artFile(c) { const a = c.art, e = c.expr && a.expr && a.expr[c.expr]; return 'assets/ui/story/' + (e || a.file); }

  next() {
    if (!this.el) return;
    if (this.atEnd()) return;
    this.i++;
    const p = this.pages[this.i], G = this.G;
    this.stage(p);
    const c = p.who && p.who.key ? this.cast.get(p.who.key) : null;
    this.nameEl.textContent = p.narr ? '' : (p.who ? p.who.name : '');
    this.tiEl.textContent = !p.narr && c && c.title ? c.title : '';
    this.box.classList.toggle('noname', !this.nameEl.textContent);
    this.text.classList.toggle('narr', !!p.narr);
    this.endEl.classList.remove('show'); this.box.classList.remove('done');
    this.type(p.html);
    if (this.i > 0) G.audio && G.audio.sfx('dialog');
  }

  /** typewriter over the text nodes (inline markup kept) */
  type(html) {
    clearInterval(this.tick);
    const t = this.text; t.innerHTML = html;
    const nodes = []; const w = document.createTreeWalker(t, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) { nodes.push([n, n.nodeValue]); n.nodeValue = ''; }
    const total = nodes.reduce((s, [, v]) => s + v.length, 0);
    let shown = 0; const t0 = performance.now(); this.typing = true;
    this.finishType = () => { clearInterval(this.tick); for (const [nd, v] of nodes) nd.nodeValue = v; this.typing = false; this.lineDone(); };
    this.tick = setInterval(() => {
      const k = Math.min(total, Math.floor((performance.now() - t0) / 1000 * this.cps));
      if (k === shown) return; shown = k;
      let left = k; for (const [nd, v] of nodes) { const m = Math.min(v.length, Math.max(0, left)); nd.nodeValue = v.slice(0, m); left -= m; }
      if (k >= total) this.finishType();
    }, 16);
    if (!total) this.finishType();
  }

  lineDone() {
    this.box.classList.add('done');
    if (this.atEnd()) this.showEnd();
  }

  showEnd() {
    if (this.endEl.classList.contains('show')) return;
    const r = this.endEl.querySelector('.vn-reward'), o = this.endEl.querySelector('.vn-opts');
    r.innerHTML = this.reward || ''; r.style.display = this.reward ? '' : 'none'; o.innerHTML = '';
    this.opts.forEach(([label, fn], i) => {
      const b = document.createElement('button'); b.type = 'button';
      b.className = 'vn-btn' + (i === this.opts.length - 1 && this.opts.length > 1 ? ' alt' : ''); b.textContent = label;
      b.onclick = e => { e.stopPropagation(); if (performance.now() - this.endAt < 300) return; this.G.audio && this.G.audio.sfx('dialog'); fn(); };   // no tap-through from the tap that finished the line
      o.appendChild(b);
    });
    this.endEl.classList.add('show'); this.box.classList.add('end'); this.endAt = performance.now();
  }

  advance() {
    const now = performance.now();
    if (!this.el || now - this.shownAt < 250 || now - (this.advAt || 0) < 140) return;   // the tap that opened the scene / one press = one step
    this.advAt = now;
    if (this.typing) { this.finishType(); return; }
    if (this.atEnd()) { this.showEnd(); return; }
    this.next();
  }

  skip() {
    if (!this.el) return;
    if (this.typing) this.finishType();
    while (!this.atEnd()) { this.i++; }
    const p = this.pages[this.i]; this.stage(p);
    const c = p.who && p.who.key ? this.cast.get(p.who.key) : null;
    this.nameEl.textContent = p.narr ? '' : (p.who ? p.who.name : ''); this.tiEl.textContent = !p.narr && c && c.title ? c.title : '';
    this.box.classList.toggle('noname', !this.nameEl.textContent); this.text.classList.toggle('narr', !!p.narr);
    this.type(p.html); this.finishType();
  }

  cleanup() {
    clearInterval(this.tick); window.removeEventListener('keydown', this.onKey, true); this.el = null;
  }
}

/** bust data URL for a speaker key (npc id / 'player'), the same picture the scene shows when there is no illustration (tools/story/refs.js) */
export function castBust(game, key) {
  if (key === 'player') return playerBust(game);
  const mk = npcModelKey(game.data.npcs[key]); return mk ? npcBust(mk) : Promise.resolve(null);
}
