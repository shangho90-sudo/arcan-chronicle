// Fixed HUD quest window (right side, under the minimap) + area-name banner + one-time welcome notice.
// - The window is plain HUD (screen space): it never moves with the camera, never pauses the game and never dims the
//   screen. Only the window itself takes pointer input; the rest of the screen keeps moving / attacking as before.
// - States: open (full) / min (title + current objective) / closed (small scroll button). Stored per character in
//   profile.ui (additive field, no save-version change). A new character starts open; objective updates never re-open
//   a window the player closed.
// - Content comes from the quest data (QuestLog). Before the first quest is taken, the tutorial goal "talk to the elder"
//   is shown; it counts as done once the elder's first quest has been accepted (an existing, saved quest state), so it
//   never comes back after a reload or a zone change.
import { QS, questCategory } from './core.js';

let G = null; export function bindQuestHud(g) { G = g; }
/** mixes the quest window methods into the UI class (called once from ui.js) */
export function installQuestHud(UI) { Object.assign(UI.prototype, QUEST_HUD); }
const $ = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SCROLL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h10a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V6" fill="#e9dcbc" stroke="#6a4a1a" stroke-width="1.4"/><path d="M5 6a2 2 0 1 1 4 0v12" fill="none" stroke="#6a4a1a" stroke-width="1.4"/><path d="M10 9h6M10 12h6M10 15h4" stroke="#8a6a2a" stroke-width="1.3" stroke-linecap="round"/></svg>';
const CHECK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CAT = c => `<em class="qh-cat ${c === 'sub' ? 'sub' : 'main'}">${c === 'sub' ? '서브' : '메인'}</em>`;
const npcName = id => { const n = G.data.npcs[id]; return n ? `${n.title} ${n.name}` : id; };

/** the goals to show, most relevant first: [{ key, title, rows:[{text, done, prog}], hint, ready }] */
function questGoals() {
  const ql = G.quests, mobile = G.input && G.input.mobile, out = [];
  const talkHint = id => `${npcName(id)} 가까이에서 ${mobile ? '대화 버튼' : 'F 키 또는 대화 버튼'}`;
  // tutorial: before the elder's first quest is taken (not a quest in the data: it is how the first quest is obtained)
  const first = G.data.quests.q1_start;
  if (first && ql.stateOf(first) === QS.Available) {
    out.push({ key: 'tut_elder', cat: 'main', title: '시작 안내', rows: [{ text: '분수 옆 촌장과 대화하기', done: false, prog: '대화 완료 0/1' }], hint: talkHint(first.giver) });
  }
  for (const q of ql.active()) {
    const st = ql.stateOf(q), rows = q.objectives.map((o, i) => {
      const cur = ql.current(q, i), done = cur >= o.count;
      const prog = ['talk', 'job', 'equip', 'visit'].includes(o.type) ? (o.type === 'talk' ? `대화 완료 ${Math.min(cur, 1)}/1` : done ? '완료' : '진행 중') : `${Math.min(cur, o.count)}/${o.count}`;
      return { text: o.text, done, prog };
    });
    let hint = '';
    if (st === QS.Completable) hint = `보고하기: ${talkHint(q.turnIn || q.giver)}`;
    else { const o = q.objectives.find((o, i) => ql.current(q, i) < o.count);
      if (o) hint = o.type === 'talk' ? talkHint(o.target) : o.type === 'kill' ? (mobile ? '공격 버튼으로 공격' : '몬스터를 클릭하거나 Space 키로 공격') : o.type === 'collect' ? '몬스터를 처치하면 재료를 얻습니다' : o.type === 'level' ? '몬스터를 처치해 경험치를 모으세요' : o.type === 'job' ? '직업 마스터에게 말을 걸어 전직' : o.type === 'equip' ? `가방(${mobile ? '가방 버튼' : 'I 키'})에서 장비 장착` : ''; }
    out.push({ key: q.id, cat: questCategory(q), title: q.name, rows, hint, ready: st === QS.Completable });
  }
  // story (메인) goals first, then side (서브) goals; order inside each group is kept
  return out.filter(g => g.cat === 'main').concat(out.filter(g => g.cat !== 'main'));
}

const QUEST_HUD = {
  buildQuestHud() {
    const w = this.qhud = $('section', 'qhud', this.hud); w.setAttribute('aria-label', '퀘스트');
    w.innerHTML = `<header class="qh-head"><span class="qh-title">퀘스트</span><button class="qh-btn qh-min" type="button" aria-label="접기"></button><button class="qh-btn qh-x" type="button" aria-label="닫기">✕</button></header><div class="qh-body"></div>`;
    const reopen = this.qreopen = $('button', 'qh-reopen', this.hud, SCROLL); reopen.type = 'button'; reopen.setAttribute('aria-label', '퀘스트 창 열기'); reopen.title = '퀘스트 (L)';
    // the window and its button swallow pointer / touch input so nothing reaches the world behind them
    for (const el of [w, reopen]) for (const ev of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'touchstart', 'touchend', 'wheel', 'contextmenu']) el.addEventListener(ev, e => e.stopPropagation(), { passive: ev !== 'contextmenu' });
    // buttons drop focus after a click so Space / Enter keep going to the game (Space = attack), not to the button
    const act = (el, f) => el.addEventListener('click', e => { f(); el.blur(); e.preventDefault(); });
    act(w.querySelector('.qh-min'), () => { G.audio.sfx('ui'); this.setQuestHud(this.qstate() === 'min' ? 'open' : 'min'); });
    act(w.querySelector('.qh-x'), () => { G.audio.sfx('ui_back'); this.setQuestHud('closed'); });
    act(reopen, () => { G.audio.sfx('ui'); this.setQuestHud('open'); });
    for (const el of [w, reopen]) el.addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); }); // no focus ring / no focus steal
    w.querySelector('.qh-body').addEventListener('click', e => { const r = e.target.closest('[data-q]'); if (r && G.profile) { G.profile.ui.track = r.dataset.q; G.audio.sfx('ui'); this.renderQuestHud(true); } });
    this.qflash = null; this.qprev = null;
  },
  qstate() { const P = G.profile; return P && P.ui && P.ui.qwin || 'open'; },
  setQuestHud(s) { if (!G.profile) return; G.profile.ui = G.profile.ui || {}; G.profile.ui.qwin = s; this.renderQuestHud(true); },
  toggleQuestHud() { this.setQuestHud(this.qstate() === 'closed' ? 'open' : 'closed'); },
  renderQuestHud(force) {
    if (!this.qhud || !G.profile || !G.quests) return;
    const P = G.profile; P.ui = P.ui || {};
    const st = this.qstate(), goals = questGoals();
    // feedback inside the window: an objective that just completed gets a check + short highlight; a finished quest /
    // tutorial step stays visible as "완료" for a moment before the next goal replaces it
    const sig = JSON.stringify(goals.map(g => [g.key, g.rows.map(r => [r.done, r.prog]), g.ready, g.hint]));   // 진행 숫자(0/6 → 1/6)도 바뀌면 바로 다시 그림
    const prev = this.qprev; this.qprev = goals;
    const justDone = new Set();
    if (prev) {
      for (const g of goals) { const pg = prev.find(p => p.key === g.key); if (pg) g.rows.forEach((r, i) => { if (r.done && pg.rows[i] && !pg.rows[i].done) justDone.add(g.key + ':' + i); }); }
      for (const pg of prev) if (!goals.find(g => g.key === pg.key)) this.qflash = { goal: { ...pg, rows: pg.rows.map(r => ({ ...r, done: true, prog: r.prog.replace(/0\/1$/, '1/1') })) }, until: performance.now() + 1800 };
    }
    if (this.qflash && performance.now() > this.qflash.until) { this.qflash = null; force = true; }
    if (!force && sig === this.qsig && !justDone.size && !this.qflash) return;
    this.qsig = sig;
    this.qhud.classList.toggle('closed', st === 'closed'); this.qhud.classList.toggle('min', st === 'min');
    this.qreopen.classList.toggle('show', st === 'closed');
    const mb = this.qhud.querySelector('.qh-min'); mb.textContent = st === 'min' ? '▸' : '▾'; mb.setAttribute('aria-label', st === 'min' ? '펼치기' : '접기');
    const body = this.qhud.querySelector('.qh-body');
    let list = goals.slice();
    const track = P.ui.track && list.find(g => g.key === P.ui.track);
    if (track) list = [track, ...list.filter(g => g !== track)];
    if (this.qflash) list = [{ ...this.qflash.goal, flash: true }, ...list];
    if (!list.length) {
      const avail = G.data.questList.filter(q => G.quests.stateOf(q) === QS.Available);
      body.innerHTML = avail.length ? `<p class="qh-empty">진행 중인 퀘스트가 없습니다.<br><span>머리 위에 <b>!</b> 표시가 있는 주민에게 말을 걸어 보세요.</span></p>` : `<p class="qh-empty">모든 퀘스트를 완료했습니다.</p>`;
      return;
    }
    const main = list[0], next = main.rows.find(r => !r.done) || main.rows[main.rows.length - 1];
    if (st === 'min') { body.innerHTML = `<div class="qh-line${main.flash ? ' flash' : ''}">${main.flash || next.done ? `<i class="qh-ck">${CHECK}</i>` : '<i class="qh-dot"></i>'}<span>${esc(main.ready ? '보고하기 · ' + main.title : next.text)}</span></div>`; return; }
    const row = (g, r, i) => `<li class="${r.done ? 'done' : ''}${justDone.has(g.key + ':' + i) ? ' flash' : ''}">${r.done ? `<i class="qh-ck">${CHECK}</i>` : '<i class="qh-dot"></i>'}<span class="qh-obj">${esc(r.text)}</span><span class="qh-prog">${esc(r.prog)}</span></li>`;
    let html = `<article class="qh-main${main.flash ? ' flash' : ''}"><h3>${CAT(main.cat)}${esc(main.title)}${main.flash ? ' <em class="qh-tag">완료</em>' : main.ready ? ' <em class="qh-tag">보고 가능</em>' : ''}</h3><ul>${main.rows.map((r, i) => row(main, r, i)).join('')}</ul>${main.hint && !main.flash ? `<p class="qh-hint">${esc(main.hint)}</p>` : ''}</article>`;
    const rest = list.slice(1);
    if (rest.length) html += `<div class="qh-others">${rest.map(g => { const n = g.rows.find(r => !r.done); return `<button type="button" class="qh-other" data-q="${esc(g.key)}"><b>${CAT(g.cat)}${esc(g.title)}</b><span>${esc(g.ready ? '보고 가능' : n ? n.text + ' · ' + n.prog : '')}</span></button>`; }).join('')}</div>`;
    body.innerHTML = html;
  },

  /** area name at the top centre: text between two thin ornamental lines, fades out after ~2.6 s; queued notices follow */
  areaBanner(name, then) {
    const old = this.hud.querySelector('.areabanner'); if (old) old.remove();
    clearTimeout(this._abT);
    const b = $('div', 'areabanner', this.hud, `<i class="ab-line"></i><span>${esc(name)}</span><i class="ab-line r"></i>`);
    this.placeBanner(b);
    this._abT = setTimeout(() => { b.classList.add('out'); setTimeout(() => { b.remove(); if (then) then(); }, 450); }, 2600);
  },
  /** keeps the banner clear of the other HUD pieces (small / portrait screens): moves it down below whatever it hits */
  placeBanner(b) {
    const sel = ['.qhud:not(.closed)', '.qh-reopen.show', '.charpanel', '.minimap', '.botbar', '.target'];
    for (let pass = 0; pass < 4; pass++) {
      const r = b.getBoundingClientRect(); let push = 0;
      for (const q of sel) for (const el of this.hud.querySelectorAll(q)) {
        const o = el.getBoundingClientRect(); if (!o.width || !o.height) continue;
        if (r.left < o.right && r.right > o.left && r.top < o.bottom && r.bottom > o.top) push = Math.max(push, o.bottom + 8);
      }
      if (!push || push + r.height > innerHeight * 0.6) break;
      b.style.top = push + 'px';
    }
  },
  /** short notice in the same slot (only after the area name is gone) */
  notice(text) {
    const b = $('div', 'areabanner notice', this.hud, `<span>${esc(text)}</span>`);
    this.placeBanner(b);
    setTimeout(() => { b.classList.add('out'); setTimeout(() => b.remove(), 450); }, 2400);
  },
};
