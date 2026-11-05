// Skill window (learn / upgrade / equip / reset), craft window, job advancement window, HUD slot buttons.
// Mixed into the existing UI class so the original look (ivory / teal / gold, Galmuri) and input handling stay.
import { UI } from './ui.js';
import { craft, NORMAL_SLOTS, ADV1_LEVEL, ADV2_LEVEL } from './skillsys.js';

let G = null; export function bindSkillUi(g) { G = g; }
const $ = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
const TYPE = { attack: ['공격', '#e86a5a'], support: ['보조', '#5ab0e8'], summon: ['소환', '#8ad06a'], passive: ['패시브', '#b0a080'], craft: ['제작', '#d8a040'], ultimate: ['궁극', '#c070e0'] };
const ELEM_ICON = { attack: 'skill_ui_attack', support: 'skill_ui_shield', summon: 'skill_ui_summon', passive: 'skill_ui_passive', craft: 'skill_ui_craft', ultimate: 'skill_ui_ult' };

/** small generated icon per skill: job colour disc + type glyph + category letter (temporary art) */
const iconCache = new Map();
// painted-style round icon: type-coloured glowing disc, gold bevel ring, white glyph, A/B/C badge
const ICON_BG = { attack: ['#ffb08a', '#d8402a', '#4a0c08'], support: ['#bfe6ff', '#3a8ed8', '#0c2448'], summon: ['#d8ffb0', '#58b040', '#123a10'], passive: ['#c8ffd8', '#2fa860', '#08301a'],
  craft: ['#ffe2a0', '#c88a2a', '#3a2408'], ultimate: ['#f0c8ff', '#9a48d8', '#2a0c44'] };
const BADGE = ['#c0302a', '#2a5ab8', '#3a8a3a'];
function glyph(g, d) {
  g.save(); g.translate(48, 48); g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round'; g.shadowColor = 'rgba(255,240,200,.9)'; g.shadowBlur = 8;
  const slash = (n, w) => { for (let k = 0; k < n; k++) { const o = (k - (n - 1) / 2) * 11; g.lineWidth = w - k; g.beginPath(); g.moveTo(-24 + o, 22 + o * 0.2); g.quadraticCurveTo(-4 + o, 6, 22 + o * 0.6, -26 + o * 0.3); g.stroke(); } };
  const id = d.id;
  if (id === 'nv_a1') { slash(1, 9); g.lineWidth = 3; g.beginPath(); g.moveTo(-18, 26); g.lineTo(-6, 18); g.moveTo(-2, 28); g.lineTo(6, 20); g.stroke(); }
  else if (id === 'nv_a2') slash(3, 7);
  else if (id === 'nv_a3') { g.lineWidth = 7; g.beginPath(); g.arc(-10, 0, 22, -1.1, 1.1); g.stroke(); g.beginPath(); g.moveTo(-6, 0); g.lineTo(26, 0); g.stroke(); g.beginPath(); g.moveTo(16, -9); g.lineTo(28, 0); g.lineTo(16, 9); g.fill(); }
  else if (id === 'nv_p1') { g.beginPath(); g.arc(0, -14, 8, 0, 7); g.fill(); g.beginPath(); g.moveTo(-14, 26); g.quadraticCurveTo(-14, -2, 0, -3); g.quadraticCurveTo(14, -2, 14, 26); g.fill();
    g.lineWidth = 4; for (const [x, y, r] of [[-20, -16, 6], [20, -20, 7], [22, 4, 5]]) { g.beginPath(); g.moveTo(x - r, y); g.lineTo(x + r, y); g.moveTo(x, y - r); g.lineTo(x, y + r); g.stroke(); } }
  else if (id === 'nv_p2') { g.rotate(-0.8); g.fillRect(-4, -30, 8, 40); g.beginPath(); g.moveTo(-4, -30); g.lineTo(0, -38); g.lineTo(4, -30); g.fill(); g.fillRect(-13, 10, 26, 5); g.fillRect(-3, 15, 6, 12); g.rotate(0.8);
    g.lineWidth = 3; g.beginPath(); g.moveTo(14, -24); g.lineTo(26, -30); g.moveTo(18, -12); g.lineTo(30, -14); g.stroke(); }
  else if (d.type === 'attack') slash(1 + (d.idx || 0) % 3, 8);
  else if (d.type === 'support') { g.beginPath(); g.moveTo(0, -26); g.lineTo(20, -18); g.lineTo(18, 6); g.quadraticCurveTo(12, 20, 0, 28); g.quadraticCurveTo(-12, 20, -18, 6); g.lineTo(-20, -18); g.closePath(); g.lineWidth = 5; g.stroke(); }
  else if (d.type === 'summon') { g.beginPath(); g.arc(0, -6, 14, Math.PI, 0); g.lineTo(14, 22); g.lineTo(7, 16); g.lineTo(0, 22); g.lineTo(-7, 16); g.lineTo(-14, 22); g.closePath(); g.fill(); g.fillStyle = '#333'; g.beginPath(); g.arc(-5, -6, 3, 0, 7); g.arc(5, -6, 3, 0, 7); g.fill(); }
  else if (d.type === 'craft') { g.rotate(-0.6); g.fillRect(-3, -8, 6, 34); g.fillRect(-16, -22, 32, 14); g.rotate(0.6); }
  else if (d.type === 'ultimate') { g.beginPath(); for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, r = k % 2 ? 11 : 28; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); }
  else { g.lineWidth = 6; g.beginPath(); g.moveTo(0, 24); g.lineTo(0, -20); g.moveTo(-14, -6); g.lineTo(0, -22); g.lineTo(14, -6); g.stroke(); }
  g.restore();
}
export function skillIcon(d, size = 48) {
  const k = d.id + size; if (iconCache.has(k)) return iconCache.get(k);
  const c = document.createElement('canvas'); c.width = c.height = 96; const g = c.getContext('2d');
  const [c0, c1, c2] = ICON_BG[d.type] || ICON_BG.attack;
  const gr = g.createRadialGradient(40, 34, 4, 48, 50, 44); gr.addColorStop(0, c0); gr.addColorStop(0.45, c1); gr.addColorStop(1, c2);
  g.fillStyle = gr; g.beginPath(); g.arc(48, 48, 41, 0, Math.PI * 2); g.fill();
  const sh = g.createRadialGradient(36, 28, 2, 36, 28, 30); sh.addColorStop(0, 'rgba(255,255,255,.35)'); sh.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = sh; g.fill();
  glyph(g, d);
  const ring = g.createLinearGradient(0, 4, 0, 92); ring.addColorStop(0, '#fff2b8'); ring.addColorStop(0.45, '#d4a040'); ring.addColorStop(1, '#7a4a10');
  g.lineWidth = 6; g.strokeStyle = ring; g.beginPath(); g.arc(48, 48, 43, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 1.5; g.strokeStyle = 'rgba(60,30,0,.8)'; g.beginPath(); g.arc(48, 48, 39.5, 0, Math.PI * 2); g.stroke();
  const bx = 78, by = 80; g.fillStyle = '#f4e2b0'; g.beginPath(); g.arc(bx, by, 13, 0, Math.PI * 2); g.fill(); g.fillStyle = BADGE[d.cat] || BADGE[0]; g.beginPath(); g.arc(bx, by, 10.5, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff'; g.font = 'bold 15px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('ABC'[d.cat] || 'A', bx, by + 1);
  const url = c.toDataURL(); const html = `<span class="icon i3d skic" style="width:${size}px;height:${size}px;background:url(${url}) center/contain no-repeat;image-rendering:auto"></span>`;
  iconCache.set(k, html); return html;
}

function fmt(n) { return Math.abs(n - Math.round(n)) < 1e-6 ? String(Math.round(n)) : n.toFixed(1); }
/** one-line summary of what a level changes */
const STAT_KO = { atk: '공격력', atkSpeed: '공격 속도', crit: '치명타', def: '방어력', foodPower: '요리 효과', maxHp: '최대 HP' };
const FLAG_KO = { restRegen: '휴식 중 3초마다 체력 회복', basicDmg: '기본 공격 피해', beatHaste: '박자 가속', centerBonus: '중심부 추가 피해', cheatDeath: '치명상 버티기', craftDiscount: '제작 재료 절약', 'craftExtra:potion': '포션 추가 제작', 'craftReturn:food': '요리 재료 반환', fitting: '완벽한 피팅', flow: '흐름 지속', ingredientDrop: '재료 획득률', killHaste: '처치 시 가속', landscapeSize: '풍경화 범위', landscapeTime: '풍경화 지속', paintRange: '붓 사거리', phraseGain: '악절 획득', powerRefund: '동력 환급', projSpeed: '투사체 속도', residue: '잔여 효과', staggerBonus: '경직 추가 피해', switchBonus: '전환 추가 피해', throwRange: '투척 사거리', vsDefdown: '방어 약화 대상 추가 피해' };
function levelText(d, L) {
  const m = 1 + (d.type === 'ultimate' ? 0.25 : 0.12) * (L - 1), out = [];
  for (const op of d.ops) {
    if (op.op === 'hit' && op.coef > 0) {
      const phys = !op.elem && d.type !== 'ultimate' && op.shape !== 'circle' || !!d.weapon, b = (op.hits || 1) + (op.hitsPerLv ? Math.floor(op.hitsPerLv * (L - 1)) : 0), h = b + (phys && !op.noExtra && !op.hitsPerLv ? Math.floor((L - 1) / 2) : 0);
      const per = op.coef * m * b / h * (1 + 0.06 * (h - b));
      out.push(`피해 ${Math.round(per * 100)}%${h > 1 ? ` × ${h}회 (총 ${Math.round(per * h * 100)}%)` : ''}`);
    }
    if (op.op === 'proj' && op.coef > 0) { const n = op.count || 1; out.push(`투사체 ${Math.round(op.coef * m * 100)}%${n > 1 ? ` × ${n}발 (총 ${Math.round(op.coef * m * n * 100)}%)` : ''}`); }
    if (op.op === 'custom' && op.coef) { const n = op.n || op.hits || 1; out.push(`피해 ${Math.round(op.coef * m * 100)}%${n > 1 ? ` × ${n}회` : ''}${op.perStack ? ` (+표식당 ${Math.round(op.perStack * 100)}%)` : ''}${op.perColor ? ` (+색당 ${Math.round(op.perColor * 100)}%)` : ''}`); }
    if (op.op === 'channel') for (const o2 of op.ops) { if (o2.op === 'hit') out.push(`집중 ${fmt(op.dur)}초 · ${Math.round(o2.coef * m * 100)}%/${op.tick}초`); if (o2.op === 'mp') out.push(`집중 ${fmt(op.dur)}초 · MP ${fmt(o2.pct * m * 100)}%/${op.tick}초`); }
    if (op.op === 'delay') out.push(`폭발 ${Math.round(op.coef * m * 100)}%`);
    if (op.op === 'area' && op.coef) out.push(`장판 ${Math.round(op.coef * m * 100)}%/${op.tick}초`);
    if (op.op === 'area' && op.heal) out.push(`회복 ${fmt(op.heal * m * 100)}%/${op.tick}초`);
    if (op.op === 'shield') out.push(`보호막 ${Math.round(op.base * m)}+${fmt(op.coef * m * 100)}%`);
    if (op.op === 'heal') out.push(`회복 ${fmt(op.pct * m * 100)}%`);
    if (op.op === 'summon') out.push(`소환 ${op.n || 1}체 · ${fmt((op.life || 10) * (1 + 0.05 * (L - 1)))}초`);
    if (op.op === 'buff') out.push(`${G.data.status(op.id)?.name || op.id} ${fmt(op.dur * (1 + 0.05 * (L - 1)))}초`);
  }
  if (d.type === 'passive') { for (const m2 of d.mods || []) out.push(`${STAT_KO[m2.stat] || m2.stat} ${m2.add ? '+' + fmt(m2.add + (m2.addLv || 0) * (L - 1)) : ''}${m2.mul ? '+' + fmt((m2.mul + (m2.mulLv || 0) * (L - 1)) * 100) + '%' : ''}`); for (const [k, v] of Object.entries(d.flags || {})) out.push(`${FLAG_KO[k] || k} ${fmt((v[0] + (v[1] || 0) * (L - 1)) * (v[0] < 1 ? 100 : 1))}${v[0] < 1 ? '%' : ''}`); }
  if (d.cd) out.push(`쿨타임 ${fmt(d.cd * (1 - 0.03 * (L - 1)))}초`);
  if (!['passive', 'craft'].includes(d.type)) { const tier = G.data.job(d.job).tier, g = Math.max(1, Math.min(10, Math.max(0, tier - 1) * 3 + L + (d.type === 'ultimate' ? 2 + L : 0))); out.push(`연출 등급 ${g}`); }
  return out.join(' · ');
}

Object.assign(UI.prototype, {
  // ---------------------------------------------------------------- skill window
  showSkills(tabJob) {
    const p = G.player, book = p.sheet.book, job = p.sheet.job, sk = book.sk;
    const lineage = book.lineage;
    const b = this.open('skills', '스킬', 1700, 0);
    const head = $('div', 'skhead', b);
    head.innerHTML = `<i class="fstar4"></i><b class="skjob">${job.name} <span>Lv<em>${p.sheet.p.level}</em></span></b> · 기본 검술 포인트 <em class="skpt">${sk.npoints}</em>` + (job.id !== 'novice' ? ` · 직업 스킬 포인트 <em class="skpt">${sk.points}</em> <span class="small muted">(사용 ${book.spent})</span>` : ` · <span class="sknote">레벨마다 1포인트 · 직업 스킬은 Lv${ADV1_LEVEL} 1차 전직 후</span>`) + '<i class="fline"></i>';
    if (!lineage.length) { $('div', 'skempty', b, `<p>견습생은 레벨 ${ADV1_LEVEL}에 1차 전직을 하면 스킬을 배울 수 있습니다.</p>`); this.slotBar(b); return; }
    const tabs = $('div', 'sktabs', head);
    const show = tabJob && lineage.includes(tabJob) ? tabJob : lineage[lineage.length - 1];
    for (const jid of lineage) { const j = G.data.job(jid); const t = this.button(tabs, j.tier === 0 ? '기본 검술' : (j.tier === 1 ? '1차 ' : '2차 ') + j.name, jid === show ? 'gold sel' : 'ivory', () => this.showSkills(jid)); t.classList.add('small'); }
    const inTown = p.zone.def.kind === 'town';
    const rb = this.button(head, '포인트 초기화', 'red', () => { const e = book.reset(inTown, p.skills2.inCombat); if (e) return this.toast(e); this.toast('스킬 포인트를 모두 돌려받았습니다'); this.showSkills(show); });
    rb.title = inTown ? '' : '마을에서만 가능'; if (!inTown) rb.classList.add('locked');
    const cols = $('div', 'skcols', b);
    const list = G.data.skillsOf(show);
    for (let cat = 0; cat < 3; cat++) {
      const items = list.filter(s => s.cat === cat).sort((a, c) => a.idx - c.idx); if (!items.length) continue;
      const col = $('div', 'skcol', cols, `<div class="skcat"><i class="fstar4"></i>${'ABC'[cat]}. ${items[0].catName}<i class="fstar4 r"></i></div>`);
      for (const d of items) {
        const L = book.level(d.id), blk = book.learnBlock(d.id), max = L >= d.maxLv;
        const [tn, tc] = TYPE[d.type];
        const equipped = sk.slots.includes(d.id) || sk.ult === d.id;
        const row = $('div', 'skrow' + (L ? ' learned' : '') + (this.skSel === d.id ? ' sel' : ''), col,
          `${skillIcon(d, 76)}<div class="skinfo"><div><b>${d.name}</b> <span class="sktype t-${d.type}" style="background:${tc}">${tn}</span>${equipped ? ' <span class="sktag eq">장착</span>' : ''}</div>` +
          `<div class="small">Lv <b>${L}</b>/${d.maxLv} · 해금 Lv${book.unlockLevel(d)}${d.mp ? ` · 기력 ${d.mp}` : ''}${d.cd ? ` · ${d.cd}초` : ''}${d.range && d.type !== 'passive' && d.type !== 'craft' ? ` · 사거리 ${d.range}m` : ''}</div></div>`);
        row.onclick = () => { this.skSel = d.id; G.audio.sfx('ui'); this.showSkills(show); };
        if (!max) { const lb = this.button(row, L ? '강화' : '습득', blk ? 'ivory lockb' : L ? 'gold' : 'blue', () => { const e = book.learn(d.id); if (e) return this.toast(e); G.audio.sfx('levelup'); this.showSkills(show); }); lb.classList.add('small'); if (blk) { lb.classList.add('locked'); lb.title = blk; } }
      }
    }
    // detail pane
    const sel = G.data.skill2(this.skSel) && lineage.includes(G.data.skill2(this.skSel).job) ? G.data.skill2(this.skSel) : null;
    const det = $('div', 'skdetail', b);
    if (sel) {
      const L = book.level(sel.id), blk = book.learnBlock(sel.id);
      det.innerHTML = `${skillIcon(sel, 112)}<div class="skdtext"><div class="skdname"><b>${sel.name}</b> <span class="sktype t-${sel.type}" style="background:${TYPE[sel.type][1]}">${TYPE[sel.type][0]}</span>${L < sel.maxLv ? ' <span class="skneed">필요 포인트 <em>1</em></span>' : ''} <span class="small muted">${sel.weapon ? '요구 무기: ' + (G.data.job(sel.job).parent ? G.data.job(G.data.job(sel.job).parent).name : G.data.job(sel.job).name) + ' 무기' : ''}</span></div>` +
        `<i class="fline"></i><div class="skdesc">${sel.desc}</div>` +
        `<div class="skcur">현재: ${L ? levelText(sel, L) : '<span class="muted">미습득</span>'}</div>` +
        (L < sel.maxLv ? `<div class="sknext">다음 레벨: ${levelText(sel, L + 1)}</div>` : '<div class="good">최대 레벨</div>') +
        (blk && L < sel.maxLv ? `<div class="small bad">잠금 사유: ${blk}</div>` : '') +
        ((sel.prereq || []).length ? `<div class="small">선행 조건: ${sel.prereq.map(x => (G.data.skill2(x.id)?.name || x.id) + ' Lv' + x.lv).join(', ')}</div>` : '') + `</div>`;
      if (L && ['attack', 'support', 'summon'].includes(sel.type)) {
        const eqb = $('div', 'skeq', det);
        for (let i = 0; i < NORMAL_SLOTS; i++) this.button(eqb, `${i + 1}번 슬롯`, sk.slots[i] === sel.id ? 'gold' : 'teal', () => { const e = book.equip(sel.id, i, p.skills2.inCombat); if (e) return this.toast(e); this.showSkills(show); });
      }
      if (L && sel.type === 'ultimate') { const eqb = $('div', 'skeq', det); this.button(eqb, sk.ult === sel.id ? '궁극기 장착됨' : '궁극기 슬롯에 장착', 'gold', () => { const e = book.equip(sel.id, 0, p.skills2.inCombat); if (e) return this.toast(e); this.showSkills(show); }); }
      if (L && sel.type === 'craft') { const eqb = $('div', 'skeq', det); this.button(eqb, '제작 메뉴 열기', 'teal', () => this.showCraft(sel.id)); }
    } else det.innerHTML = '<div class="small muted">스킬을 선택하면 자세한 설명과 다음 레벨 변화를 볼 수 있습니다. 패시브는 배우면 자동 적용되고, 제작 스킬은 제작 메뉴(N)에서 사용합니다.</div>';
    this.slotBar(b);
  },
  slotBar(b) {
    const p = G.player, book = p.sheet.book, sk = book.sk;
    const bar = $('div', 'skslots', b, '<span class="sklabel"><i class="fstar4"></i>장착 슬롯</span>');
    for (let i = 0; i <= NORMAL_SLOTS; i++) {
      const id = i < NORMAL_SLOTS ? sk.slots[i] : sk.ult, d = G.data.skill2(id);
      const s = $('div', 'skslot' + (i === NORMAL_SLOTS ? ' ult' : ''), bar, (d ? skillIcon(d, 58) : '<span class="skempty-slot">+</span>') + `<small>${i < NORMAL_SLOTS ? i + 1 : 'R 궁극'}</small>`);
      if (d) { s.title = d.name + ' (클릭하여 해제)'; s.onclick = () => { const e = book.unequip(i < NORMAL_SLOTS ? i : 'ult', p.skills2.inCombat); if (e) return this.toast(e); this.showSkills(); }; }
    }
    $('div', 'sknote', bar, p.skills2.inCombat ? '<span class="bad">전투 중에는 슬롯을 바꿀 수 없습니다</span>' : '쿨타임은 슬롯을 바꿔도 유지됩니다');
  },

  // ---------------------------------------------------------------- craft window
  showCraft(skillId) {
    const p = G.player, book = p.sheet.book, bag = p.sheet.bag;
    const crafts = G.data.skill2List.filter(s => s.type === 'craft' && book.usable(s.id));
    const b = this.open('craft', '제작', 1700, 920);
    if (!crafts.length) { $('div', 'skempty', b, '<p>배운 제작 스킬이 없습니다. 스킬창(K)에서 제작 스킬을 배우세요.</p>'); return; }
    const inSafe = p.zone.def.kind === 'town';
    if (!inSafe) $('div', 'small bad', b, '제작은 마을(안전 지역)에서만 할 수 있습니다.');
    const left = $('div', 'crleft panel-dark', b), right = $('div', 'crright panel-dark', b);
    const sel = this.crSel && G.data.recipes.find(r => r.id === this.crSel) ? this.crSel : null;
    for (const s of crafts) {
      $('div', 'skcat', left, s.name + ` <span class="small muted">Lv${book.level(s.id)}</span>`);
      for (const rid of s.recipes || []) {
        if (rid === 'salvage') { const r = $('div', 'crrow' + (this.crSel === 'salvage' ? ' sel' : ''), left, '<b>장비 분해</b> <span class="small muted">장비 → 재료 일부</span>'); r.onclick = () => { this.crSel = 'salvage'; this.showCraft(); }; continue; }
        const rc = G.data.recipes.find(x => x.id === rid); if (!rc) continue; const out = G.data.item(rc.output.item);
        const ok = rc.inputs.every(x => bag.count(x.item) >= x.count) && book.level(s.id) >= (rc.minLv || 1);
        const r = $('div', 'crrow' + (sel === rid ? ' sel' : '') + (ok ? '' : ' locked'), left, `${this.icon(out.icon, 40)} <b>${out.name}</b>${rc.output.count > 1 ? ' x' + rc.output.count : ''}${rc.minLv > 1 ? ` <span class="small muted">(스킬 Lv${rc.minLv})</span>` : ''}`);
        r.onclick = () => { this.crSel = rid; this.crN = 1; this.showCraft(); };
      }
    }
    if (this.crSel === 'salvage') return this.salvagePane(right, inSafe);
    const rc = sel && G.data.recipes.find(r => r.id === sel);
    if (!rc) { right.innerHTML = '<p class="small muted">레시피를 선택하세요.</p>'; return; }
    const out = G.data.item(rc.output.item), n = this.crN || 1;
    right.innerHTML = `<div class="crout">${this.icon(out.icon, 80)}<div><b>${out.name}</b> x${rc.output.count * n}<div class="small">${out.desc}</div></div></div>` +
      `<div class="small"><b>재료</b></div>` + rc.inputs.map(x => { const have = bag.count(x.item), need = x.count * n; return `<div class="crmat ${have >= need ? '' : 'bad'}">${this.icon(G.data.item(x.item).icon, 32)} ${G.data.item(x.item).name} ${have}/${need}</div>`; }).join('') +
      (rc.gold ? `<div class="small goldtxt">비용 ${Math.round(rc.gold * n * (1 - Math.min(0.3, book.passive('craftDiscount'))))} G</div>` : '') +
      `<div class="small muted">가방 빈칸 ${bag.slots.filter(s => !(s.count > 0)).length}</div>`;
    const qty = $('div', 'crqty', right);
    for (const [lab, dv] of [['-10', -10], ['-1', -1], ['+1', 1], ['+10', 10]]) this.button(qty, lab, 'ivory', () => { this.crN = Math.max(1, Math.min(99, n + dv)); this.showCraft(); });
    $('span', 'crn', qty, ` ${n}개 분량 `);
    this.button(right, '제작하기', 'gold', () => {
      if (!inSafe) return this.toast('마을에서만 제작할 수 있습니다');
      const r = craft(G.data, p.sheet, book, rc, n);
      if (r.err) return this.toast(r.err);
      if (r.made > 0) G.audio.sfx('levelup'); else G.audio.sfx('ui_back');
      this.toast(r.made > 0 ? `${out.name} x${r.made} 제작${r.failed ? ` (${r.failed}번 실패)` : ''}${r.bonus ? ` (추가 생산 +${r.bonus})` : ''}${r.returned ? ` · 재료 ${r.returned}개 반환` : ''}` : `제작 실패 — 재료가 사라졌습니다 (성공 확률 ${Math.round(r.rate * 100)}%)`); G.autoSave(); this.showCraft();
    });
  },
  salvagePane(right, inSafe) {
    const p = G.player, bag = p.sheet.bag, sv = G.data.salvage;
    right.innerHTML = '<p class="small">분해할 장비를 고르세요. 분해 결과는 구매 가격보다 항상 적습니다. (장착 중인 장비는 분해할 수 없음)</p>';
    bag.slots.forEach((s, i) => {
      if (!(s.count > 0) || !sv.table[s.id]) return; const d = G.data.item(s.id);
      const out = sv.table[s.id].map(([it, n]) => `${G.data.item(it).name} ${Math.max(1, Math.floor(n * (0.6 + 0.4 * p.sheet.book.level(sv.skill) / 5)))}`).join(', ');
      const r = $('div', 'crrow', right, `${this.icon(d.icon, 36)} ${d.name} → <span class="small">${out}</span>`);
      r.onclick = () => {
        if (!inSafe) return this.toast('마을에서만 분해할 수 있습니다');
        const gain = sv.table[s.id].map(([it, n]) => [it, Math.max(1, Math.floor(n * (0.6 + 0.4 * p.sheet.book.level(sv.skill) / 5)))]);
        const snap = JSON.stringify(p.sheet.p.inventory);
        if (!bag.removeAt(i, 1)) return;
        for (const [it, n] of gain) if (bag.add(it, n) < n) { p.sheet.p.inventory.splice(0, p.sheet.p.inventory.length, ...JSON.parse(snap)); bag.changed(); return this.toast('가방 공간이 부족합니다'); }
        G.audio.sfx('coin'); this.toast(d.name + ' 분해 완료'); this.showCraft();
      };
    });
  },

  // ---------------------------------------------------------------- job advancement (replaces the old job window)
  showJobs(hl) {
    const p = G.player, cur = p.sheet.job;
    const choices = cur.id === 'novice' ? G.data.jobList.filter(j => j.tier === 1) : G.data.jobList.filter(j => j.tier === 2 && j.parent === cur.id);
    const b = this.open('jobs', cur.id === 'novice' ? '1차 전직' : '2차 전직', 1760, 900);
    if (!choices.length) { $('div', 'skempty', b, '<p>이미 최종 직업입니다.</p>'); return; }
    $('div', 'small muted', b, cur.id === 'novice' ? `레벨 ${ADV1_LEVEL}부터 전직할 수 있습니다. 전직 후에는 자유롭게 직업을 바꿀 수 없습니다.` : `레벨 ${ADV2_LEVEL} 이상 + 해당 직업의 전직 시험을 완료해야 합니다. 분기 중 하나만 선택할 수 있습니다.`);
    const cards = $('div', 'jobcards', b);
    for (const j of choices) {
      const sk = G.data.skillsOf(j.id), cats = [0, 1, 2].map(c => sk.find(s => s.cat === c)?.catName);
      const err = p.sheet.canChooseJob(j.id);
      const c = $('div', 'jobcard slotbg' + (j.id === hl ? ' hl' : ''), cards, `<div class="jhead" style="background:${j.color}">${j.name}</div><div class="jrole">${j.role}</div><div class="small">${j.desc}</div>` +
        cats.map((n, i) => `<div class="jskill"><b>${'ABC'[i]}.</b> ${n}<div class="small muted">${sk.filter(s => s.cat === i).map(s => s.name).join(' · ')}</div></div>`).join(''));
      const btn = this.button(c, err ? '조건 미충족' : '이 직업으로 전직', err ? 'ivory' : 'gold', () => {
        const e = p.sheet.chooseJob(j.id); if (e) return this.toast(e);
        G.audio.sfx('levelup'); G.fx.play('levelup', { x: p.pos.x, y: p.pos.y + 0.8, z: p.pos.z }, 1.4);
        this.toast(j.name + '(으)로 전직했습니다! 스킬창(K)에서 스킬을 배우세요.'); G.autoSave(); this.close();
      });
      if (err) { btn.title = err; $('div', 'small bad', c, err); }
    }
  },
});

// key handling + HUD extension (wrap existing methods)
const origKeys = UI.prototype.handleKeys;
UI.prototype.handleKeys = function (down) {
  origKeys.call(this, down);
  if (!G.inWorld) return;
  if (down.skillWin) { if (this.currentName === 'skills') this.close(); else if (!this.current || ['inventory', 'quests', 'craft'].includes(this.currentName)) this.showSkills(); }
  if (down.craftWin) { if (this.currentName === 'craft') this.close(); else if (!this.current || ['inventory', 'quests', 'skills'].includes(this.currentName)) this.showCraft(); }
};
const origBuild = UI.prototype.buildControls;
UI.prototype.buildControls = function () {
  origBuild.call(this);
  const acts = this.controls.querySelector('#cActions');
  for (const [a, key] of [['skill4', '4'], ['ult', 'R']]) {
    const b = $('div', 'abtn sk ' + a, acts, `<div class="ic"></div><div class="cd"></div><div class="cdt"></div><div class="key">${key}</div><div class="sub"></div>`);
    b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); b.setPointerCapture(e.pointerId); b.classList.add('on'); G.input.press(a); G.audio.unlock(); });
    const up = () => b.classList.remove('on'); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    this.btn[a] = b;
  }
  this.resBar = $('div', 'resbar', this.hud);
};
const origUpd = UI.prototype.updateControls;
UI.prototype.updateControls = function () {
  origUpd.call(this);
  const p = G.player; if (!p || !p.skills2) return;
  const eng = p.skills2, sk = p.sheet.book.sk;
  const set = (b, d, i) => {
    const ic = b.querySelector('.ic'), key = d ? d.id : 'empty' + i;
    if (b._k2 !== key) { b._k2 = key; ic.innerHTML = d ? skillIcon(d, b.classList.contains('big') ? 72 : 56) : this.icon('skill_ui_locked', 56); }
    const left = d ? eng.cdLeft(d.id) : 0, frac = d ? eng.cdFrac(d.id) : 0;
    b.querySelector('.cd').style.background = frac > 0 ? `conic-gradient(rgba(10,10,25,.72) ${frac * 360}deg, transparent 0)` : 'none';
    b.querySelector('.cdt').textContent = left > 0.05 ? (left >= 1 ? Math.ceil(left) : left.toFixed(1)) : '';
    const noRes = d && (p.sp < eng.mpCost(d) || (d.res && d.res.cost && (eng.res[d.res.type] || 0) < d.res.cost));
    b.querySelector('.sub').textContent = d ? eng.mpCost(d) || '' : '';
    b.querySelector('.sub').style.color = noRes ? '#ff7a7a' : '';
    ic.style.opacity = !d ? 0.35 : noRes ? 0.45 : 1;
    b.classList.toggle('nores', !!noRes);
  };
  for (let i = 0; i < 4; i++) set(this.btn['skill' + (i + 1)], G.data.skill2(sk.slots[i]), i);
  set(this.btn.ult, G.data.skill2(sk.ult), 4);
  // job resources only for the jobs that use them
  const job = p.sheet.p.job; let html = '';
  if (job === 'engineer') html = `전력 <b>${Math.floor(eng.res.power)}</b>/10 · 기계 ${eng.summons.filter(s => s.machine && !s.dead).length}`;
  else if (job === 'musician') html = `악절 <b>${Math.floor(eng.res.phrase)}</b>/8${eng.melody ? ' · ♪ ' + eng.melody.ctx.d.name : ''}`;
  else if (eng.summons.some(s => !s.dead)) html = `소환물 ${eng.summons.filter(s => !s.dead).length}`;
  if (eng.casting) html += ` · 시전 중: ${eng.casting.ctx.d.name}`;
  this.resBar.innerHTML = html; this.resBar.style.display = html ? '' : 'none';
};
