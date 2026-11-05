// HTML/CSS user interface (ivory / teal / gold, Galmuri pixel font). Port of the Unity uGUI views.
import { QS, Shop, isEquipment, slotOf, EQUIP_SLOTS, ATTRS, ATTR_KR, ATTR_BASE, ATTR_FX } from './core.js';
import { THREE, tex, CAM } from './render.js';
import { ModelBody, loadPlayerModel, loadActions } from './model.js';
import { renderItemIcons } from './items3d.js';
import { renderPortrait } from './portrait.js';
import { Minimap } from './minimap.js';
import { installQuestHud, bindQuestHud } from './questhud.js';

let G = null;
export function bindGame(g) { G = g; bindQuestHud(g); }
const $ = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
const esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
const STAT_KR = { maxHp: "최대 체력", maxSp: "최대 기력", atk: "공격력", matk: "마법력", def: "방어력", crit: "치명타", critDmg: "치명 피해", moveSpeed: "이동 속도", atkSpeed: "공격 속도", spRegen: "기력 회복", healPower: "회복 효율", foodPower: "음식 효과", dmgReduce: "피해 감소", cdr: "재사용 감소", shieldPower: "보호막 강화" };
const PCT = new Set(["crit", "critDmg", "healPower", "foodPower", "dmgReduce", "cdr", "shieldPower"]);
// ---- ornate window pieces (inventory / skills): inline SVG so they stay sharp at any scale
// every game window uses the ornate frame except the conversation box and the illustrated title / character screens
const PLAIN = new Set(["dialog", "title", "create"]), BANNER = new Set(["inventory", "shop", "quests", "craft", "jobs"]);
const G1 = '<linearGradient id="fgold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0b8"/><stop offset=".5" stop-color="#d9a640"/><stop offset="1" stop-color="#8a5a14"/></linearGradient>';
export const STAR4 = '<svg viewBox="0 0 24 24"><path d="M12 0l2.6 9.4L24 12l-9.4 2.6L12 24l-2.6-9.4L0 12l9.4-2.6z" fill="#c9973a"/><path d="M12 5l1.3 5.7L19 12l-5.7 1.3L12 19l-1.3-5.7L5 12l5.7-1.3z" fill="#f6dc8e"/></svg>';
const FLOURISH = `<svg viewBox="0 0 120 120"><defs>${G1}</defs><g fill="none" stroke="url(#fgold)" stroke-width="5" stroke-linecap="round"><path d="M6 114V30Q6 6 30 6h84"/><path d="M18 100V40q0-22 22-22h60" stroke-width="2.5"/><path d="M30 6q-6 22 10 30t26-8q4-14-10-14t-10 12" stroke-width="3.5"/><path d="M6 30q22 6 30-10t-8-26" stroke-width="3.5" opacity=".0"/></g><circle cx="30" cy="30" r="7" fill="url(#fgold)"/><path d="M30 18l3 9 9 3-9 3-3 9-3-9-9-3 9-3z" fill="#fff4c4"/></svg>`;
const PLAQUE_ORN = '<svg viewBox="0 0 90 30"><g fill="none" stroke="#e6c06a" stroke-width="2" stroke-linecap="round"><path d="M88 15H40"/><path d="M40 15q-10-12-22-4t2 12q10 2 8-8"/><path d="M40 15q-14 10-30 2"/></g><path d="M8 15l5-5 5 5-5 5z" fill="#f2d27a"/><path d="M64 15l4-4 4 4-4 4z" fill="#f2d27a"/></svg>';
const FLEUR = '<svg class="fleur" viewBox="0 0 32 32"><path fill="#e8c46a" d="M16 2c3 4 4 8 2 12 3-2 7-2 9 1-3 0-5 2-6 4h-3l1 4h3v2h-4v4h-4v-4H10v-2h3l1-4h-3c-1-2-3-4-6-4 2-3 6-3 9-1-2-4-1-8 2-12z"/></svg>';
const FLEUR_PENNANT = `<svg viewBox="0 0 70 110"><defs>${G1}</defs><path d="M4 2h62v80L35 104 4 82z" fill="#1d3a7a" stroke="url(#fgold)" stroke-width="4"/><path d="M10 8h50v70L35 96 10 78z" fill="none" stroke="#e6c06a" stroke-width="1.5" opacity=".7"/><g transform="translate(19 26) scale(1)">${'<path fill="#f0cf74" d="M16 2c3 4 4 8 2 12 3-2 7-2 9 1-3 0-5 2-6 4h-3l1 4h3v2h-4v4h-4v-4H10v-2h3l1-4h-3c-1-2-3-4-6-4 2-3 6-3 9-1-2-4-1-8 2-12z"/>'}</g><rect x="0" y="0" width="70" height="6" rx="3" fill="url(#fgold)"/></svg>`;
const STAT_HEAD = '<svg class="fleur" viewBox="0 0 32 32"><g fill="#e8c46a"><rect x="4" y="18" width="5" height="10" rx="1"/><rect x="11" y="12" width="5" height="16" rx="1"/><rect x="18" y="6" width="5" height="22" rx="1"/><rect x="25" y="14" width="4" height="14" rx="1"/></g></svg>';
const si = (body, col = "#b4842e") => `<svg class="sti" viewBox="0 0 24 24"><g fill="${col}" stroke="#5a3a10" stroke-width=".8" stroke-linejoin="round">${body}</g></svg>`;
const STAT_ICON = {
  maxHp: si('<path d="M12 21C5 15 2 12 2 8a5 5 0 0 1 10-1 5 5 0 0 1 10 1c0 4-3 7-10 13z"/>', "#d99a3a"),
  maxSp: si('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>', "#d9a640"),
  atk: si('<path d="M20 2l2 2-11 11-2-2zM8 14l2 2-3 3 1 1-2 2-1-1-1 1-2-2 1-1-1-1 2-2 1 1z"/>', "#7a8aa0"),
  matk: si('<circle cx="12" cy="12" r="9" fill="none" stroke="#5a3a10" stroke-width="2.5"/><circle cx="12" cy="12" r="5.5" fill="none" stroke="#b4842e" stroke-width="2"/><circle cx="12" cy="12" r="2.2"/>'),
  def: si('<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" fill="#6a7690"/><path d="M12 4v16c3.5-2 6-5 6-9V6z" fill="#c9973a"/>'),
  crit: si('<circle cx="12" cy="12" r="8" fill="none" stroke="#b4842e" stroke-width="2.4"/><path d="M12 1v6M12 17v6M1 12h6M17 12h6" stroke="#b4842e" stroke-width="2.4"/><circle cx="12" cy="12" r="2"/>'),
  moveSpeed: si('<path d="M6 3h6l1 9 6 3c2 1 2 4 0 5H5c-1 0-2-1-2-2l2-7z" fill="#8a5a2a"/>'),
  atkSpeed: si('<path d="M21 3c-6 1-11 6-14 12l2 2c6-3 11-8 12-14zM4 16l4 4-3 1-2-2z" fill="#c98a3a"/><path d="M2 8h7M1 12h5M4 4h6" stroke="#c98a3a" stroke-width="1.8"/>'),
  spRegen: si('<path d="M12 1l2.2 8.8L23 12l-8.8 2.2L12 23l-2.2-8.8L1 12l8.8-2.2z" fill="#d9a640"/>'),
  healPower: si('<path d="M9 2h6v7h7v6h-7v7H9v-7H2V9h7z" fill="#5aa860"/>'),
  dmgReduce: si('<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" fill="#8a9ab0"/>'),
  cdr: si('<circle cx="12" cy="13" r="9" fill="#e8dcc0"/><path d="M12 8v5l3 3" stroke="#5a3a10" stroke-width="2" fill="none"/><rect x="9" y="1" width="6" height="3" rx="1"/>'),
  def0: si('<circle cx="12" cy="12" r="6"/>'),
};
const EQ_EMPTY = {
  weapon: '<svg viewBox="0 0 48 48" class="eqsil"><path d="M40 4l4 4-20 20-4-4zM14 26l4 4-6 6 2 2-4 4-2-2-2 2-4-4 2-2-2-2 4-4 2 2z" fill="#b8b0a0"/></svg>',
  armor: '<svg viewBox="0 0 48 48" class="eqsil"><path d="M24 4l16 6v12c0 10-7 18-16 22C15 40 8 32 8 22V10z" fill="#b8b0a0"/><path d="M24 8v32c7-4 12-10 12-18V12z" fill="#cfc8b8"/></svg>',
  accessory: '<svg viewBox="0 0 48 48" class="eqsil"><circle cx="24" cy="28" r="13" fill="none" stroke="#b8b0a0" stroke-width="5"/><path d="M18 12l6-8 6 8-6 5z" fill="#b8b0a0"/></svg>',
};
const TYPE_KR = { weapon: "무기", armor: "방어구", accessory: "장신구", consumable: "소비", material: "재료" };
function modText(m) {
  const out = [];
  if (Math.abs(m.add) > 1e-4) out.push(STAT_KR[m.stat] + " +" + (PCT.has(m.stat) ? Math.round(m.add * 100) + "%" : (m.add % 1 === 0 ? m.add : m.add.toFixed(1))));
  if (Math.abs(m.mul) > 1e-4) out.push(STAT_KR[m.stat] + " +" + Math.round(m.mul * 100) + "%");
  return out.join(", ");
}

// painted-style SVG icons for the round action buttons
const HUD_ICON = (() => {
  const W = (d, extra = '') => `<svg viewBox="0 0 64 64" width="100%" height="100%" ${extra}><defs>
    <linearGradient id="gS" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#c8d4e4"/><stop offset="1" stop-color="#7a8aa0"/></linearGradient>
    <linearGradient id="gG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0b0"/><stop offset=".5" stop-color="#e0b048"/><stop offset="1" stop-color="#9a6416"/></linearGradient></defs>${d}</svg>`;
  return {
    skill_ui_attack: W('<path d="M46 10l8 0 0 8-26 26-8-8z" fill="url(#gS)" stroke="#2a3040" stroke-width="2"/><path d="M50 14L24 40" stroke="#fff" stroke-width="1.5" opacity=".7"/><path d="M16 36l12 12-4 4-12-12z" fill="url(#gG)" stroke="#4a2a08" stroke-width="2"/><path d="M14 46l4 4-6 6-4-4z" fill="#6a3a1a" stroke="#2a1608" stroke-width="2"/><circle cx="9" cy="55" r="3.5" fill="url(#gG)" stroke="#4a2a08" stroke-width="1.5"/>'),
    skill_ui_dodge: W('<circle cx="38" cy="13" r="5.5" fill="#f4f0e8"/><path d="M33 21l-9 9 6 6-6 14M33 21l7 10 9 3M29 26l-9-1-6 6M30 36l9 5 3 12" fill="none" stroke="#f4f0e8" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 30h10M4 38h10M8 46h8" stroke="#9ad0ff" stroke-width="3" stroke-linecap="round" opacity=".8"/>'),
    skill_ui_interact: W('<path d="M12 14h40a6 6 0 0 1 6 6v20a6 6 0 0 1-6 6H30l-12 10v-10h-6a6 6 0 0 1-6-6V20a6 6 0 0 1 6-6z" fill="#f4f0e8" stroke="#3a3040" stroke-width="2"/><circle cx="22" cy="30" r="3.5" fill="#5a4a6a"/><circle cx="32" cy="30" r="3.5" fill="#5a4a6a"/><circle cx="42" cy="30" r="3.5" fill="#5a4a6a"/>'),
    skill_ui_locked: W('<path d="M22 28v-7a10 10 0 0 1 20 0v7" fill="none" stroke="url(#gG)" stroke-width="5"/><rect x="16" y="28" width="32" height="24" rx="4" fill="url(#gG)" stroke="#4a2a08" stroke-width="2"/><circle cx="32" cy="38" r="3.5" fill="#4a2a08"/><path d="M32 40v6" stroke="#4a2a08" stroke-width="3"/>'),
  };
})();
// gold line icons for the HUD menu buttons
const MENU_ICON = (() => {
  const W = (d) => `<svg viewBox="0 0 32 32" fill="none" stroke="#f6dc94" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  return {
    inventory: W('<path d="M8 12h16l2 15H6z" fill="#7a5230"/><path d="M12 12v-3a4 4 0 0 1 8 0v3"/><path d="M11 18h10"/>'),
    skills: W('<path d="M16 3l9 13-9 13-9-13z" fill="#6a4aa0"/><path d="M16 9l5 7-5 7-5-7z" fill="#f6dc94" stroke="none"/>'),
    craft: W('<path d="M7 25L21 11" /><path d="M18 6l8 8-3 3-8-8z" fill="#8a8f9a"/><path d="M25 25L11 11"/><path d="M6 8l5-3 3 3-3 5z" fill="#8a8f9a"/>'),
    quests: W('<path d="M8 5h13l4 4v18H8z" fill="#a0742a"/><path d="M12 12h9M12 17h9M12 22h6"/>'),
    stats: W('<path d="M6 26V16M12 26V10M18 26V13M24 26V6" stroke-width="3.4"/><path d="M4 27h24"/>'),
    pause: W('<path d="M7 9h18M7 16h18M7 23h18"/>'),
  };
})();
export class UI {
  constructor(root) {
    this.root = root;
    this.world = $("div", "layer world", root);
    this.floatLayer = $("div", "layer floats", root);
    this.hud = $("div", "layer hud", root);
    this.controls = $("div", "layer controls", root);
    this.win = $("div", "layer windows", root);
    this.top = $("div", "layer top", root);
    this.fade = $("div", "fade", root);
    this.toasts = $("div", "toasts", this.top);
    this.feed = $("div", "feed", this.top);
    this.current = null; this.closable = true; this.plates = new Map(); this.floats = []; this.mobileSetting = 0;
    this.iconMeta = null; addEventListener("resize", () => this.fit()); this.buildHud(); this.buildControls(); this.showGameplay(false);
  }
  async load() {
    this.iconMeta = await (await fetch("assets/ui/icons.json")).json();
    // 3D item icons, rendered once from the item models (falls back to the pixel atlas for anything else)
    try { this.itemIcons = renderItemIcons(G.data.itemList.map(i => i.icon || i.id)); } catch (e) { console.warn("3d icons", e); this.itemIcons = {}; }
  }
  icon(name, size = 48) {
    if (HUD_ICON[name]) return `<span class="icon svgic" style="width:${size}px;height:${size}px;display:flex">${HUD_ICON[name]}</span>`;
    const img = this.itemIcons && this.itemIcons[name];
    if (img) return `<span class="icon i3d" style="width:${size}px;height:${size}px;background:url(${img}) center/contain no-repeat;image-rendering:auto"></span>`;
    const m = this.iconMeta; let i = m.names.indexOf(name); if (i < 0) i = m.names.indexOf("skill_ui_locked");
    const s = size / m.cell, col = i % m.cols, row = Math.floor(i / m.cols);
    return `<span class="icon" style="width:${size}px;height:${size}px;background-size:${m.texW * s}px ${m.texH * s}px;background-position:-${col * m.cell * s}px -${row * m.cell * s}px"></span>`;
  }
  iconMesh(name) {
    const m = this.iconMeta; let i = m.names.indexOf(name); if (i < 0) i = 0;
    const col = i % m.cols, row = Math.floor(i / m.cols);
    const g = new THREE.PlaneGeometry(0.6, 0.6); const uv = g.attributes.uv;
    const u0 = col * m.cell / m.texW, u1 = (col + 1) * m.cell / m.texW, v1 = 1 - row * m.cell / m.texH, v0 = 1 - (row + 1) * m.cell / m.texH;
    uv.array.set([u0, v1, u1, v1, u0, v0, u1, v0]); uv.needsUpdate = true;
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex("assets/ui/icons.png"), transparent: true, alphaTest: 0.5, depthWrite: true }));
    mesh.renderOrder = 6; return mesh;
  }
  showGameplay(on) { for (const l of [this.hud, this.controls, this.world, this.floatLayer]) l.style.display = on ? "" : "none"; }
  setFade(a) { this.fade.style.opacity = a; this.fade.style.pointerEvents = a > 0.01 ? "auto" : "none"; }

  // ------------------------------------------------------------------ toasts / floats
  toast(t) {
    if (!t) return;
    for (const e of this.toasts.children) if (e.textContent === t && e._t < 1.5) { e._t = 0; return; }
    const e = $("div", "toast panel-dark", this.toasts); e.textContent = t; e._t = 0;
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
  }
  itemToast(def, n) {
    if (!def) return;
    const e = $("div", "feeditem panel-dark", this.feed, this.icon(def.icon, 40) + `<span>${esc(def.name)}${n > 1 ? " x" + n : ""} 획득</span>`); e._t = 0;
    while (this.feed.children.length > 5) this.feed.firstChild.remove();
  }
  floatText(pos, text, color, scale = 1, h = 1.4) {
    if (!G.settings.damageNumbers && /^[0-9]/.test(text)) return;
    const e = $("div", "float", this.floatLayer); e.textContent = text; e.style.color = color;
    this.floats.push({ e, pos: { x: pos.x + (Math.random() - 0.5) * 0.5, y: pos.y + h, z: pos.z + (Math.random() - 0.5) * 0.3 }, t: 0, scale });
  }
  /** damage numbers with impact: kind = 'hit' (player hits a monster), 'crit', 'taken' (player is hit), 'dot' */
  damageText(pos, amount, kind) {
    if (!G.settings.damageNumbers) return;
    const e = $("div", "dmg dmg-" + kind, this.floatLayer);
    e.innerHTML = (kind === "crit" ? '<i class="dmg-burst"></i><b class="dmg-tag">CRITICAL</b>' : "") + '<span>' + amount + '</span>';
    const side = Math.random() < 0.5 ? -1 : 1;
    this.floats.push({ e, dmg: kind, pos: { x: pos.x + (Math.random() - 0.5) * 0.35, y: pos.y + (kind === "taken" ? 1.5 : 1.25), z: pos.z + (Math.random() - 0.5) * 0.2 }, t: 0,
      scale: kind === "crit" ? 1 : 1, vx: side * (kind === "crit" ? 18 : 30 + Math.random() * 20), life: kind === "crit" ? 1.15 : 0.85 });
  }
  tick(dt) {
    for (const e of [...this.toasts.children]) { e._t += dt; if (e._t > 2.6) e.remove(); }
    for (const e of [...this.feed.children]) { e._t += dt; if (e._t > 3.2) e.remove(); }
    for (const f of this.floats.slice()) {
      f.t += dt;
      if (f.dmg) {                                     // damage: big pop, little hop sideways, settle, fade
        const L = f.life, k = f.t / L;
        if (k >= 1) { f.e.remove(); this.floats.splice(this.floats.indexOf(f), 1); continue; }
        const s = G.render.toScreen(f.pos), t = f.t;
        const pop = f.dmg === "crit" ? (t < 0.09 ? 0.4 + t / 0.09 * 1.5 : t < 0.2 ? 1.9 - (t - 0.09) / 0.11 * 0.9 : 1) : (t < 0.07 ? 0.5 + t / 0.07 * 1.0 : t < 0.16 ? 1.5 - (t - 0.07) / 0.09 * 0.5 : 1);
        const hop = -(Math.sin(Math.min(1, t / 0.45) * Math.PI) * (f.dmg === "crit" ? 34 : 26)) - k * 22;
        const dx = f.vx * Math.min(1, t / 0.45);
        const shake = f.dmg === "crit" && t < 0.25 ? (Math.random() - 0.5) * 6 : 0;
        f.e.style.transform = `translate(${s.x + dx + shake}px,${s.y + hop}px) translate(-50%,-50%) scale(${pop})`;
        f.e.style.opacity = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
        continue;
      }
      const k = f.t / 0.9;
      if (k >= 1) { f.e.remove(); this.floats.splice(this.floats.indexOf(f), 1); continue; }
      const s = G.render.toScreen({ x: f.pos.x, y: f.pos.y + k * 0.9, z: f.pos.z });
      const pop = k < 0.15 ? 1 + (0.15 - k) * 3 : 1;
      f.e.style.transform = `translate(${s.x}px,${s.y}px) translate(-50%,-50%) scale(${f.scale * pop})`;
      f.e.style.opacity = k > 0.65 ? 1 - (k - 0.65) / 0.35 : 1;
    }
    if (G.inWorld && G.player && G.zone) { this.updateHud(); this.updateControls(); this.updatePlates(dt); }
  }

  // ------------------------------------------------------------------ HUD
  buildHud() {
    const h = this.hud;
    h.innerHTML = `
    <div class="charpanel panel-dark"><div class="badge"><span id="hBadge"></span></div><div class="lv" id="hLv"></div>
      <div class="cname" id="hName"></div>
      <div class="status" id="hStatus"></div></div>
    <div class="minimap panel-dark"><div class="mmhead"><span class="zone" id="hZone"></span><span class="gold" id="hGold"></span></div><canvas id="hMap"></canvas></div>
    <div class="target panel-dark" id="hTarget"><div id="hTName"></div><div class="bar hp"><i id="hTHp"></i><span id="hTHpT"></span></div></div>
    <div class="target boss panel-dark" id="hBoss"><div id="hBName"></div><div class="bar boss"><i id="hBHp"></i><span id="hBHpT"></span></div></div>
    <div class="prompt panel-dark" id="hPrompt"></div>
    <div class="botbar">
      <div class="bar hp"><i id="hHp"></i><b id="hShield"></b><span id="hHpT"></span></div>
      <div class="bar sp"><i id="hSp"></i><span id="hSpT"></span></div>
      <div class="expbar"><i id="hExp"></i><span id="hExpT"></span></div>
      <div class="menubtns">${[["inventory", "가방"], ["stats", "능력치"], ["skills", "스킬"], ["craft", "제작"], ["quests", "퀘스트"], ["pause", "메뉴"]].map(([a, t]) => `<button class="btn" data-a="${a}">${MENU_ICON[a]}<span>${t}</span></button>`).join("")}</div></div>`;
    for (const b of h.querySelectorAll("[data-a]")) b.onclick = () => { G.audio.sfx("ui"); G.input.press({ skills: "skillWin", craft: "craftWin" }[b.dataset.a] || b.dataset.a); };
    this.h = id => h.querySelector("#" + id);
    this.minimap = new Minimap(h.querySelector("#hMap"));
    this.buildQuestHud();
  }
  updateHud() {
    const p = G.player; if (!p) return; const P = p.sheet.p, job = p.sheet.job, h = this.h;
    h("hName").innerHTML = `${esc(P.name)} <small>${job.name}</small>`; h("hLv").textContent = "Lv." + P.level; h("hBadge").textContent = job.name[0];
    const badge = h("hBadge").parentElement; badge.style.borderColor = job.color;
    if (badge._g !== P.gender) { badge._g = P.gender; badge._3d = null; badge.style.backgroundImage = `url(assets/ui/portrait_${P.gender === "f" ? "girl" : "boy"}.png)`; badge.style.backgroundPosition = P.gender === "f" ? "-113px -98px" : "-113px -74px"; badge.style.backgroundSize = ""; }
    // sharper portrait rendered from the actual 3D model once it is loaded (falls back to the picture above)
    const pk = P.gender + "|" + (P.dye || "");
    if (badge._3d !== pk && p.body && p.body.bones && p.body.bones.length) { badge._3d = pk; const url = renderPortrait(p.body); if (url) { badge.style.backgroundImage = `url(${url})`; badge.style.backgroundPosition = "center"; badge.style.backgroundSize = "cover"; } }
    h("hHp").style.width = (100 * p.hp / p.maxHp) + "%"; h("hShield").style.width = Math.min(100, 100 * p.shield / p.maxHp) + "%";
    h("hHpT").textContent = Math.ceil(p.hp) + " / " + Math.round(p.maxHp) + (p.shield > 0 ? `  (+${Math.round(p.shield)})` : "");
    h("hSp").style.width = (100 * p.sp / p.maxSp) + "%"; h("hSpT").textContent = "기력 " + Math.floor(p.sp) + " / " + Math.round(p.maxSp);
    const need = p.sheet.expToNext; h("hExp").style.width = (need ? 100 * P.exp / need : 100) + "%";
    h("hExpT").textContent = need ? `EXP ${P.exp} / ${need}  (${(100 * P.exp / need).toFixed(1)}%)` : "최고 레벨";
    h("hStatus").innerHTML = p.status.list.map(s => `<span style="color:${s.def.color}">${s.def.name} ${Math.ceil(s.remaining)}s</span>`).join(" ");
    this.minimap.draw(G);
    h("hZone").textContent = G.zone ? G.zone.def.name : ""; h("hGold").textContent = P.gold.toLocaleString() + " G";
    this._qt = (this._qt || 0) - 1; if (this._qt <= 0) { this._qt = 15; this.updateTracker(); }
    const boss = G.zone && G.zone.boss, bossOn = boss && boss.fight && !boss.dead;
    h("hBoss").style.display = bossOn ? "" : "none";
    if (bossOn) { h("hBName").innerHTML = `Lv.${boss.level} ${boss.name} <small>${boss.phase}단계</small>`; h("hBHp").style.width = (100 * boss.hp / boss.maxHp) + "%"; h("hBHpT").textContent = Math.ceil(boss.hp) + " / " + boss.maxHp; }
    if (p.target && !p.target.dead) { this.target = p.target; this.targetT = 6; }
    this.targetT = (this.targetT || 0) - 1 / 60;
    const t = this.target, tOn = !bossOn && t && !t.dead && this.targetT > 0;
    h("hTarget").style.display = tOn ? "" : "none";
    if (tOn) { h("hTName").textContent = `Lv.${t.level} ${t.name}`; h("hTHp").style.width = (100 * t.hp / t.maxHp) + "%"; h("hTHpT").textContent = Math.ceil(t.hp) + " / " + t.maxHp; }
    const npc = G.zone.nearestNpc(p.pos, G.data.config.interactRange), pr = h("hPrompt");
    pr.style.display = npc && !this.current ? "" : "none";
    if (npc) pr.innerHTML = (G.input.mobile ? "" : "<b>[F]</b> ") + `${npc.def.title} ${npc.def.name}와(과) 대화`;
    this.interactAvail = !!npc;
  }
  setTarget(m) { this.target = m; this.targetT = 6; }
  /** EXP bar glow when experience orbs reach the player */
  flashExp() { const e = this.hud.querySelector(".expbar"); if (!e) return; e.classList.remove("flash"); void e.offsetWidth; e.classList.add("flash"); }
  /** big golden "LEVEL UP" title in the middle of the screen */
  levelBanner(lv) {
    const old = this.hud.querySelector(".lvbanner"); if (old) old.remove();
    const b = document.createElement("div"); b.className = "lvbanner"; b.innerHTML = `<div class="lvb-rays"></div><div class="lvb-t">LEVEL UP!</div><div class="lvb-l">Lv.${lv}</div>`;
    this.hud.appendChild(b); setTimeout(() => b.remove(), 2600);
  }
  updateTracker() { this.renderQuestHud(); }

  // ------------------------------------------------------------------ action buttons + stick
  buildControls() {
    const c = this.controls;
    c.innerHTML = `<div class="stickarea" id="cStick"><div class="stickbase"><div class="knob"></div></div></div><div class="actions" id="cActions"></div>`;
    const acts = this.controls.querySelector("#cActions");
    const defs = [["attack", "Space", "big"], ["skill1", "1", "sk"], ["skill2", "2", "sk"], ["skill3", "3", "sk"], ["dodge", "Shift", "sm"], ["potion", "Q", "sm"], ["interact", "F", "sm"]];
    this.btn = {};
    for (const [a, key, size] of defs) {
      const b = $("div", "abtn " + size + " " + a, acts, `<div class="ic"></div><div class="cd"></div><div class="cdt"></div><div class="key">${key}</div><div class="sub"></div>`);
      b.addEventListener("pointerdown", e => { e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add("on"); if (a === "attack") G.input.hold(a, true); else G.input.press(a); G.audio.unlock(); });
      const up = e => { b.classList.remove("on"); if (a === "attack") G.input.hold(a, false); };
      b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up);
      this.btn[a] = b;
    }
    const area = c.querySelector("#cStick"), base = area.querySelector(".stickbase"), knob = area.querySelector(".knob");
    let id = null, cx = 0, cy = 0; const R = 70;
    area.addEventListener("pointerdown", e => { if (id !== null) return; id = e.pointerId; area.setPointerCapture(id); const r = area.getBoundingClientRect(); cx = e.clientX; cy = e.clientY; base.style.left = (cx - r.left) + "px"; base.style.top = (cy - r.top) + "px"; base.classList.add("on"); G.audio.unlock(); });
    area.addEventListener("pointermove", e => { if (e.pointerId !== id) return; let dx = e.clientX - cx, dy = e.clientY - cy; const m = Math.hypot(dx, dy); if (m > R) { dx = dx / m * R; dy = dy / m * R; } knob.style.transform = `translate(${dx}px,${dy}px)`; const n = Math.hypot(dx, dy) / R; G.input.stick = n < 0.12 ? { x: 0, y: 0 } : { x: dx / R, y: -dy / R }; });
    const end = e => { if (e.pointerId !== id) return; id = null; knob.style.transform = ""; base.classList.remove("on"); base.style.left = ""; base.style.top = ""; G.input.stick = { x: 0, y: 0 }; };
    area.addEventListener("pointerup", end); area.addEventListener("pointercancel", end);
  }
  updateControls() {
    const p = G.player, mobile = this.mobileSetting === 1 || (this.mobileSetting === 0 && G.input.mobile);
    this.controls.classList.toggle("mobile", mobile);
    this.controls.querySelector("#cStick").style.display = mobile ? "" : "none";
    const hot = p.sheet.hotbar(), job = p.sheet.job, set = (b, icon, cdf, cdt, sub, dim) => {
      const k = icon + "|" + dim; if (b._k !== k) { b._k = k; b.querySelector(".ic").innerHTML = this.icon(icon, b.classList.contains("big") ? 72 : 56); b.querySelector(".ic").style.opacity = dim ? 0.4 : 1; }
      b.querySelector(".cd").style.background = cdf > 0 ? `conic-gradient(rgba(10,10,25,.72) ${cdf * 360}deg, transparent 0)` : "none";
      b.querySelector(".cdt").textContent = cdt; b.querySelector(".sub").textContent = sub;
    };
    for (let i = 0; i < 3; i++) {
      const s = hot[i], b = this.btn["skill" + (i + 1)];
      if (!s) { set(b, "skill_ui_locked", 0, "", job.tier === 0 ? "직업 없음" : "", true); continue; }
      const known = p.sheet.knows(s.id), left = p.skills.cdLeft(s.id);
      set(b, known ? s.icon : "skill_ui_locked", known ? p.skills.cdFrac(s.id) : 0, !known ? "Lv" + s.unlockLevel : left > 0.05 ? (left >= 1 ? Math.ceil(left) : left.toFixed(1)) : "", known ? Math.round(s.cost) : "", !known || p.sp < s.cost);
    }
    const basic = G.data.skill(job.basicAttack);
    set(this.btn.attack, "skill_ui_attack", basic ? p.skills.cdFrac(basic.id) * 0.6 : 0, "", "", false);
    set(this.btn.dodge, "skill_ui_dodge", p.dodgeCd > 0 ? p.dodgeCd / G.data.config.dodgeCooldown : 0, "", "", false);
    const pots = p.sheet.bag.count("c_potion_s") + p.sheet.bag.count("c_potion_m");
    set(this.btn.potion, "c_potion_s", p.potionCd > 0 ? p.potionCd / G.data.config.potionCooldown : 0, pots, "", pots === 0);
    set(this.btn.interact, "skill_ui_interact", 0, "", "", !this.interactAvail);
  }

  // ------------------------------------------------------------------ world labels
  plate(key, hp) {
    let p = this.plates.get(key);
    if (!p) { p = $("div", "plate", this.world, `<div class="mark"></div><div class="pname"></div>${hp ? '<div class="phb"><i></i></div>' : ""}`); this.plates.set(key, p); }
    p._seen = true; return p;
  }
  updatePlates(dt) {
    for (const p of this.plates.values()) p._seen = false;
    const z = G.zone, place = (p, pos) => { const s = G.render.toScreen(pos); p.style.transform = `translate(${s.x}px,${s.y}px) translate(-50%,-100%)`; };
    for (const n of z.npcs) { const p = this.plate(n, false); p.querySelector(".pname").innerHTML = `<span class="gold">${n.def.title}</span> ${n.def.name}`; p.querySelector(".mark").innerHTML = G.questMark(n.def.id); place(p, { x: n.pos.x, y: n.pos.y + 1.75, z: n.pos.z }); }
    for (const pt of z.def.portals) { const p = this.plate(pt, false); p.querySelector(".pname").textContent = "▶ " + pt.label; const g = z.geo.ground(pt.pos[0], pt.pos[1]); place(p, { x: g.x, y: g.y + 1.2, z: g.z }); }
    for (const a of z.actors) {
      if (a.faction !== "monster" || a.dead || a === z.boss || !(a.hitRecently > 0)) continue;
      a.hitRecently -= dt;
      const p = this.plate(a, true); p.querySelector(".pname").textContent = "Lv" + a.level + " " + a.name; p.querySelector(".phb i").style.width = (100 * a.hp / a.maxHp) + "%";
      place(p, { x: a.pos.x, y: a.pos.y + a.def.radius * 1.6 + 0.9, z: a.pos.z });
    }
    for (const [k, p] of this.plates) if (!p._seen) { p.remove(); this.plates.delete(k); }
  }
  clearPlates() { for (const p of this.plates.values()) p.remove(); this.plates.clear(); }

  // ------------------------------------------------------------------ windows
  open(name, title, w, h, closable = true, dim = true) {
    this.close(false);
    if (dim) { this.dim = $("div", "dim", this.win); }
    const fancy = !PLAIN.has(name);
    const wnd = $("div", "window " + (fancy ? "fancy " + (BANNER.has(name) ? "banner " : "") + (title ? "" : "notitle ") : "panel ") + name, this.win);
    wnd.style.width = w + "px"; if (h) wnd.style.height = h + "px";
    wnd.dataset.w = w; wnd.dataset.h = h || 0;
    if (fancy) {
      // ornate frame: gold corner flourishes, title plaque (inventory also gets the navy banner with pennant + castle)
      for (const c of ["tl", "tr", "bl", "br"]) $("i", "fcorner " + c, wnd, FLOURISH);
      if (BANNER.has(name)) $("div", "fbanner", wnd, `<span class="fpennant">${FLEUR_PENNANT}</span><span class="fcastle"></span>`);
      if (title) $("div", "wtitle fplaque", wnd, `<span class="fp-orn l">${PLAQUE_ORN}</span><span class="fp-t">${esc(title)}</span><span class="fp-orn r">${PLAQUE_ORN}</span>`);
      if (closable) { const x = $("button", "fclose", wnd, "✕"); x.setAttribute("aria-label", "닫기"); x.onclick = () => this.close(); }
    } else {
      if (title) $("div", "wtitle", wnd, esc(title));
      if (closable) { const x = $("button", "btn red wclose", wnd, "X"); x.onclick = () => this.close(); }
    }
    const body = $("div", "wbody", wnd);
    this.current = wnd; this.currentName = name; this.closable = closable; this.root.classList.toggle("winopen", name !== "dialog" && name !== "title");
    G.input.block = true; this.fit();
    if (name !== "dialog" && window.ResizeObserver) { const ro = new ResizeObserver(() => { if (this.current === wnd) this.fit(); else ro.disconnect(); }); ro.observe(wnd); }
    return body;
  }
  fit() {
    if (!this.current || ["dialog", "title", "create"].includes(this.currentName)) return; const w = this.current; w.style.transform = "";
    // phones: the windows are laid out for ~1600 px and only scaled down, which made text unreadably small. There the
    // window is laid out narrower (columns stack when it gets narrow: CSS .window.narrow), never scaled below PHONE_S,
    // and whatever does not fit in height scrolls inside the window.
    const phone = Math.min(innerWidth, innerHeight) <= 520;
    w.classList.toggle("phone", phone);
    if (phone) {
      const PHONE_S = 0.64, dw = Math.min(+w.dataset.w || w.offsetWidth, Math.floor((innerWidth - 12) / PHONE_S));
      if (w.style.width !== dw + "px") w.style.width = dw + "px";
      w.style.height = ""; w.classList.toggle("narrow", dw < 900);
      const s = Math.min(1, (innerWidth - 12) / w.offsetWidth), mh = Math.floor((innerHeight - 14) / s) + "px";
      if (w.style.maxHeight !== mh) w.style.maxHeight = mh;
      w.style.transform = `translate(-50%,-50%) scale(${s})`; return;
    }
    if (w.classList.contains("narrow") || w.style.maxHeight) { w.classList.remove("narrow"); w.style.maxHeight = ""; w.style.width = w.dataset.w + "px"; if (+w.dataset.h) w.style.height = w.dataset.h + "px"; }
    const s = Math.min(1, (innerWidth - 20) / w.offsetWidth, (innerHeight - 20) / w.offsetHeight); w.style.transform = `translate(-50%,-50%) scale(${s})`;
  }
  close(notify = true) {
    const was = !!this.current;
    if (this.current) this.current.remove(); if (this.dim) this.dim.remove();
    this.current = null; this.currentName = null; this.dim = null; this.root.classList.remove("winopen");
    G.input.block = !G.inWorld; if (G.paused) G.paused = false;
    if (was && notify) G.audio.sfx("ui_back");
  }
  handleKeys(down) {
    if (!G.inWorld) return;
    if (down.pause) { if (this.current) { if (this.closable) this.close(); } else this.showPause(); return; }
    if (down.inventory) { if (this.currentName === "inventory") this.close(); else if (!this.current || this.currentName === "quests") this.showInventory(); }
    if (down.quests) { if (this.currentName === "quests") this.close(); else if (!this.current || this.currentName === "inventory") this.showQuests(); }
    if (down.questHud && !this.current) this.toggleQuestHud();
    if (down.stats) { if (this.currentName === "stats") this.close(); else if (!this.current || ["inventory", "quests"].includes(this.currentName)) this.showStats(); }
  }
  refresh() { if (this.currentName === "inventory") this.showInventory(); else if (this.currentName === "shop") this.showShop(this.shop); }
  button(parent, label, cls, fn) { const b = $("button", "btn " + (cls || "teal"), parent, label); b.onclick = () => { G.audio.sfx("ui"); fn(); }; return b; }

  showDialog(npc, text, options) {
    const b = this.open("dialog", null, 1180, 0, true, false);
    $("div", "dname", b, npc ? `${npc.title} ${npc.name}` : "");
    $("div", "dtext", b, text);
    const opts = $("div", "dopts", b);
    options.forEach(([label, fn], i) => this.button(opts, label, i === options.length - 1 ? "ivory" : "teal", fn));
    this.current.style.transform = ""; // dialog is anchored to the bottom
  }

  showInventory(shopMode) {
    const p = G.player, P = p.sheet.p, bag = p.sheet.bag;
    const sel = this.sel || {};
    let body;
    if (shopMode) body = $("div", "sellpane", this.current.querySelector(".wbody"));
    else body = this.open("inventory", "가방 · 장비", 1640, 920);
    const left = $("div", "invleft", body);
    const grid = $("div", "grid", left);
    bag.slots.forEach((s, i) => {
      const d = s.count > 0 ? G.data.item(s.id) : null;
      const c = $("div", "slot" + (sel.slot === i ? " sel" : "") + (d ? " full" : ""), grid, d ? this.icon(d.icon, 64) + (s.count > 1 ? `<b>${s.count}</b>` : "") + (isEquipment(d) && bag.canEquip(d) ? "<em>✕</em>" : "") : "");
      if (d) c.title = d.name;
      c.onclick = () => { this.sel = { slot: i }; G.audio.sfx("ui"); shopMode ? this.showShop(shopMode) : this.showInventory(); };
    });
    $("div", "invinfo", left, `<span><b>${bag.slots.filter(s => s.count > 0).length}</b> / <span class="cap">${bag.slots.length}</span> 칸 사용</span><i class="fline">${STAR4}</i><span class="goldtxt"><i class="coin"></i>${P.gold.toLocaleString()} G</span>`);
    const det = $("div", "detail slotbg", left);
    let item = null, equipped = false;
    if (sel.equip) { item = G.data.item(P[sel.equip]); equipped = !!item; }
    else if (sel.slot !== undefined && bag.slots[sel.slot] && bag.slots[sel.slot].count > 0) item = G.data.item(bag.slots[sel.slot].id);
    if (!item) det.innerHTML = `<div class="hint"><i class="fstar">${STAR4}</i><span>${shopMode ? "판매할 아이템을 선택하세요." : "아이템을 선택하면 설명이 표시됩니다."}</span><i class="fstar">${STAR4}</i></div>`;
    else {
      const info = $("div", "dinfo", det, `${this.icon(item.icon, 72)}<div><b>${item.name}</b> <small>${TYPE_KR[item.type]}${isEquipment(item) ? ` · ${item.tier}단계 · Lv${item.levelReq}` : ""}${item.job ? " · " + G.data.job(item.job).name + " 전용" : ""}</small><div class="small">${item.desc}</div><div class="mods">${(item.stats || []).map(modText).join(" ")}</div>${item.price ? `<div class="small muted">판매가 ${item.sellPrice} G</div>` : ""}</div>`);
      const btns = $("div", "dbtns", det);
      if (shopMode) {
        if (!equipped) { const slot = sel.slot, cnt = bag.slots[slot].count; this.button(btns, "1개 판매", "teal", () => this.sell(shopMode, slot, 1)); if (cnt > 1) this.button(btns, "모두 판매", "teal", () => this.sell(shopMode, slot, cnt)); }
      } else if (equipped) this.button(btns, "장착 해제", "teal", () => { const e = bag.unequip(sel.equip); if (e) this.toast(e); else this.sel = {}; this.showInventory(); });
      else if (isEquipment(item)) this.button(btns, "장착", "gold", () => { const e = bag.equipFromSlot(sel.slot); if (e) this.toast(e); else { G.audio.sfx("shield"); this.toast(item.name + " 장착"); } this.showInventory(); });
      else if (item.type === "consumable") this.button(btns, "사용", "gold", () => { p.useItem(item.id); this.showInventory(); });
      if (!shopMode && !equipped) this.button(btns, "버리기", "red", () => this.confirm(`「${item.name}」을(를) 버릴까요?`, () => { bag.removeAt(sel.slot, bag.slots[sel.slot].count); this.sel = {}; this.showInventory(); }, () => this.showInventory()));
    }
    if (shopMode) return;
    const right = $("div", "invright", body);
    const eqbox = $("div", "fbox", right, `<div class="fsect">${FLEUR}<b>장착 장비</b></div>`);
    [["weapon", "무기"], ["armor", "방어구"], ["accessory", "장신구"]].forEach(([s, kr]) => {
      const it = G.data.item(P[s]);
      const r = $("div", "eqrow" + (sel.equip === s ? " sel" : "") + (it ? "" : " empty"), eqbox, `<span class="eqic">${it ? this.icon(it.icon, 60) : EQ_EMPTY[s]}</span><div><small>${kr}</small><span>${it ? it.name : "(비어 있음)"}</span></div><i class="fstar">${STAR4}</i>`);
      r.onclick = () => { this.sel = { equip: s }; G.audio.sfx("ui"); this.showInventory(); };
    });
    const st = p.sheet.final;
    const show = ["maxHp", "maxSp", "atk", "matk", "def", "crit", "moveSpeed", "atkSpeed", "spRegen", "healPower", "dmgReduce", "cdr"].filter(k => !(["healPower", "dmgReduce", "cdr"].includes(k) && st[k] <= 1e-4));
    $("div", "fbox stats", right, `<div class="fsect">${STAT_HEAD}<b>능력치</b> <small>${p.sheet.job.name} Lv${P.level}</small></div><div class="statgrid">` + show.map(k => `<span>${STAT_ICON[k] || STAT_ICON.def0}<em>${STAT_KR[k]}</em><b>${PCT.has(k) ? Math.round(st[k] * 100) + "%" : (["moveSpeed", "atkSpeed", "spRegen"].includes(k) ? st[k].toFixed(2) : Math.round(st[k]))}</b></span>`).join("") + "</div>");
  }

  showShop(shop) {
    this.shop = shop; const p = G.player;
    const b = this.open("shop", shop.name, 1560, 860);
    const list = $("div", "shoplist slotbg", b, "<div class='sect'><b>구매</b> <small>아이템을 눌러 선택</small></div>");
    const rows = $("div", "shoprows", list);
    for (const id of shop.items) {
      const d = G.data.item(id); const afford = p.sheet.p.gold >= d.price;
      const r = $("div", "shoprow" + (this.shopSel === id ? " sel" : ""), rows, this.icon(d.icon, 56) + `<div>${d.name}${isEquipment(d) && p.sheet.bag.canEquip(d) ? " <em>✕</em>" : ""}<br><span class="${afford ? "goldtxt" : "bad"}">${d.price} G</span></div>`);
      r.onclick = () => { this.shopSel = id; G.audio.sfx("ui"); this.showShop(shop); };
    }
    const sel = G.data.item(this.shopSel);
    if (sel && shop.items.includes(sel.id)) {
      const box = $("div", "buybox panel-dark", list, `<div><b>${sel.name}</b> <small>${TYPE_KR[sel.type]}${isEquipment(sel) ? " · Lv" + sel.levelReq : ""}${sel.job ? " · " + G.data.job(sel.job).name + " 전용" : ""}</small><div class="small">${sel.desc} <span class="mods">${(sel.stats || []).map(modText).join(" ")}</span></div></div>`);
      const bb = $("div", "dbtns", box);
      this.button(bb, "1개 구매", "gold", () => this.buy(shop, sel.id, 1));
      if (sel.maxStack > 1) this.button(bb, "5개 구매", "gold", () => this.buy(shop, sel.id, 5));
    }
    this.showInventory(shop);
  }
  buy(shop, id, n) { const e = Shop.buy(G.player.sheet, shop, id, n); if (e) this.toast(e); else { G.audio.sfx("coin"); this.toast(G.data.item(id).name + " x" + n + " 구매"); G.autoSave(); } this.showShop(shop); }
  sell(shop, slot, n) { const p = G.player, d = G.data.item(p.sheet.p.inventory[slot].id); const e = Shop.sell(p.sheet, slot, n); if (e) this.toast(e); else { G.audio.sfx("coin"); this.toast(`${d.name} x${n} 판매 (+${d.sellPrice * n} G)`); if (!(p.sheet.p.inventory[slot].count > 0)) this.sel = {}; } this.showShop(shop); }

  /** 능력치 창: 5 attributes (+1 / +5), unspent points, what each point gives, the resulting combat numbers */
  showStats() {
    const p = G.player, S = p.sheet, P = S.p, f = S.final, b = this.open("stats", "능력치", 1180, 0);
    const inTown = G.zone && G.zone.def.kind === "town";
    const pct = v => (v * 100).toFixed(v * 100 < 10 ? 1 : 0) + "%";
    const DESC = { str: "물리 공격력 +1.5", int: "마법 공격력 +1.5", dex: "명중률 +1% · 회피율 +0.6%", vit: "최대 체력 +12 · 최대 기력 +4", luk: "치명타 확률 +0.4% · 제작 성공 확률 +1%" };
    const ICON = { str: "⚔", int: "✦", dex: "➶", vit: "♥", luk: "♣" };
    const head = $("div", "athead", b, `<span>${esc(P.name)} <small>${S.job.name} Lv${P.level}</small></span><span class="atpts">남은 포인트 <b>${P.apoints}</b></span>`);
    const rb = this.button(head, "포인트 초기화", "red", () => { const e = S.resetAttr(inTown); if (e) return this.toast(e); this.toast("능력치 포인트를 모두 돌려받았습니다"); G.autoSave(); this.showStats(); });
    if (!inTown) rb.classList.add("locked");
    const list = $("div", "atlist", b);
    for (const k of ATTRS) {
      const n = P.attr[k] | 0, fx = ATTR_FX[k];
      const gain = Object.entries(fx).map(([st, v]) => st === "hit" || st === "eva" || st === "crit" || st === "craftRate" ? `${{ hit: "명중", eva: "회피", crit: "치명타", craftRate: "제작 성공" }[st]} +${pct(v * n)}` : `${{ atk: "공격력", matk: "마법력", maxHp: "체력", maxSp: "기력" }[st]} +${Number.isInteger(v * n) ? v * n : (v * n).toFixed(1)}`).join(" · ");
      const row = $("div", "atrow", list, `<i class="atic at-${k}">${ICON[k]}</i><div class="atname"><b>${ATTR_KR[k]}</b><small>${DESC[k]}</small></div><div class="atval"><b>${ATTR_BASE + n}</b>${n ? `<small>(+${n})</small>` : ""}</div><div class="atgain">${n ? gain : "—"}</div>`);
      const bt = $("div", "atbtns", row);
      for (const m of [1, 5]) { const x = this.button(bt, "+" + m, "blue", () => { const e = S.spendAttr(k, m); if (e) return this.toast(e); G.audio.sfx("ui"); G.autoSave(); this.showStats(); }); if (P.apoints < 1) x.classList.add("locked"); }
    }
    $("div", "atsum", b, `<div class="sect"><b>현재 능력</b> <small>장비·스킬·능력치 포함</small></div><div class="atgrid">` + [
      ["공격력", Math.round(f.atk)], ["마법력", Math.round(f.matk)], ["최대 체력", Math.round(f.maxHp)], ["최대 기력", Math.round(f.maxSp)],
      ["명중 보너스", "+" + pct(f.hit)], ["회피율", pct(f.eva)], ["치명타 확률", pct(f.crit)], ["제작 성공 보너스", "+" + pct(f.craftRate)],
    ].map(([a, v]) => `<span><em>${a}</em><b>${v}</b></span>`).join("") + `</div><p class="small muted">레벨이 오를 때마다 능력치 포인트 3을 얻습니다. 몬스터는 레벨이 높을수록 공격을 조금 더 잘 피하고, 명중 보너스가 그만큼을 줄여 줍니다. 회피율은 최대 40%입니다. 제작은 1단계 결과물은 항상 성공하고, 단계가 오를 때마다 성공 확률이 6%씩 낮아지며 행운이 그만큼을 채워 줍니다.</p>`);
  }

  showQuests() {
    const p = G.player, ql = p.quests, b = this.open("quests", "퀘스트", 1240, 800);
    let html = "";
    const act = ql.active();
    if (!act.length) html += "<p class='muted'>진행 중인 퀘스트가 없습니다. 머리 위에 <b>!</b> 가 있는 주민에게 말을 걸어 보세요.</p>";
    for (const q of act) {
      const st = ql.stateOf(q), n = G.data.npcs[q.turnIn || q.giver];
      html += `<div class="qitem"><b>${q.name}</b>${st === QS.Completable ? ` <span class="good">[완료 보고: ${n.title} ${n.name}]</span>` : ""}<div class="small muted">${q.summary}</div>` +
        q.objectives.map((o, i) => `<div class="small">· ${ql.objectiveText(q, i)}</div>`).join("") + `<div class="small goldtxt">보상: ${rewardText(q)}</div></div>`;
    }
    const avail = G.data.questList.filter(q => ql.stateOf(q) === QS.Available).map(q => { const n = G.data.npcs[q.giver]; return `${q.name} (${n.title} ${n.name})`; });
    if (avail.length) html += `<b>받을 수 있는 퀘스트</b><div class="small">${avail.join("<br>")}</div>`;
    html += `<p class="small muted">완료한 퀘스트 ${G.data.questList.filter(q => ql.isCompleted(q.id)).length} / ${G.data.questList.length}</p>`;
    $("div", "qbody", b, html);
  }

  showJobs(hl) {
    const p = G.player, b = this.open("jobs", "생활 직업 선택", 1760, 880);
    const cards = $("div", "jobcards", b);
    for (const j of G.data.jobList.filter(j => j.tier === 1)) {
      const cur = p.sheet.p.job === j.id;
      const c = $("div", "jobcard slotbg" + (j.id === hl ? " hl" : ""), cards, `<div class="jhead" style="background:${j.color}">${j.name}${cur ? " (현재)" : ""}</div><div class="jrole">${j.role}</div><div class="small">${j.desc}</div>` +
        j.skills.map(id => G.data.skill(id)).map(s => `<div class="jskill">${this.icon(s.icon, 32)}<div><b>${s.name}</b> <small class="muted">${s.kind === "passive" ? "패시브" : "Lv" + s.unlockLevel}</small><div class="small">${s.desc}</div></div></div>`).join(""));
      const btn = this.button(c, cur ? "선택됨" : "이 직업으로", cur ? "ivory" : "gold", () => {
        const e = p.sheet.chooseJob(j.id); if (e) return this.toast(e);
        G.audio.sfx("levelup"); G.fx.play("levelup", { x: p.pos.x, y: p.pos.y + 0.8, z: p.pos.z }, 1.4);
        this.toast(j.name + "(으)로 전직했습니다! 1번 키 / 스킬 버튼으로 스킬을 써 보세요."); G.autoSave(); this.close();
      });
      btn.disabled = cur;
    }
    $("div", "second small", b, "<b>2차 전직</b> <span class='muted'>(Lv30 · 준비 중 - 데이터만 정의됨)</span><br>" + G.data.jobList.filter(j => j.tier === 2).map(j => `${G.data.job(j.parent).name} → <b>${j.name}</b> <span class='muted'>[준비 중]</span>`).join(" &nbsp; "));
  }

  showPause() {
    G.paused = true;
    const s = G.settings, b = this.open("pause", "일시정지 · 설정", 900, 0);
    const row = (label, html) => { const r = $("div", "setrow", b, `<span>${label}</span>`); r.insertAdjacentHTML("beforeend", html); return r; };
    for (const [k, label] of [["music", "배경음"], ["sfx", "효과음"], ["shake", "화면 흔들림"]]) {
      const r = row(label, `<input type="range" min="0" max="100" value="${Math.round(s[k] * 100)}"><b>${Math.round(s[k] * 100)}%</b>`);
      const inp = r.querySelector("input"); inp.oninput = () => { s[k] = inp.value / 100; r.querySelector("b").textContent = inp.value + "%"; G.applySettings(); };
    }
    const tog = (label, get, fn) => { const r = row(label, ""); const bt = this.button(r, get(), "ivory", () => { fn(); bt.textContent = get(); G.applySettings(); }); };
    tog("피해 숫자 표시", () => s.damageNumbers ? "켜짐" : "꺼짐", () => s.damageNumbers = !s.damageNumbers);
    tog("섬광 효과 줄이기", () => s.reduceFlash ? "켜짐" : "꺼짐", () => { s.reduceFlash = !s.reduceFlash; G.reduceFlash = s.reduceFlash; if (G.skillFx) G.skillFx.constructor.reduceFlash = s.reduceFlash; });
    tog("그래픽 효과 (빛 번짐·색감)", () => s.graphicsFx !== false ? "켜짐" : "꺼짐", () => s.graphicsFx = s.graphicsFx === false);
    tog("모바일 조작 버튼", () => ["자동", "항상 표시", "숨김"][s.mobileControls], () => s.mobileControls = (s.mobileControls + 1) % 3);
    $("div", "help small muted", b, "PC: WASD/방향키 이동 · 클릭 이동/공격 · Space 공격 · 1~4 스킬 · R 궁극기 · K 스킬창 · N 제작 · Shift 회피 · Q 물약 · F 대화 · I 가방 · O 퀘스트 · Esc 메뉴");
    const bb = $("div", "pbtns", b);
    this.button(bb, "게임 재개", "gold", () => this.close());
    this.button(bb, "저장하기", "teal", () => this.toast(G.save() ? "저장했습니다." : "저장 실패: " + G.store.lastError));
    this.button(bb, "타이틀로", "teal", () => { G.save(); this.close(); G.showTitle(); });
  }
  confirm(text, yes, no) {
    const b = this.open("confirm", null, 760, 0, false);
    $("div", "ctext", b, text); const bb = $("div", "pbtns", b);
    this.button(bb, "확인", "teal", () => { this.close(false); yes && yes(); }); this.button(bb, "취소", "ivory", () => { this.close(false); no && no(); });
  }
  showDeath(cost, can, town, here) {
    const b = this.open("death", "쓰러졌습니다", 860, 0, false);
    $("div", "ctext", b, "마을 분수 앞에서 다시 일어나거나, 골드를 내고 이 자리에서 부활할 수 있습니다.");
    const bb = $("div", "pbtns", b);
    this.button(bb, "마을에서 부활", "teal", () => { this.close(false); town(); });
    const h = this.button(bb, `제자리 부활 (${cost} G)`, "gold", () => { this.close(false); here(); }); h.disabled = !can;
  }
  showTitle(info, cont, ng) {
    const b = this.open("title", null, 1000, 0, false, false);
    this.current.classList.add("titlewin");
    this.current.setAttribute("aria-label", "아르칸 연대기 시작 메뉴");
    const stage = $("div", "title-art", b);
    $("img", "title-illustration", stage).src = "assets/ui/title-screen.png";
    stage.firstChild.alt = "아르칸 연대기 — 꽃과 분수가 있는 마을";
    const c = this.button(stage, "", "title-action title-continue", cont);
    c.setAttribute("aria-label", info ? "이어하기" : "이어하기 (저장 없음)");
    c.disabled = !info;
    const save = $("div", "title-save", stage);
    save.textContent = info || "저장된 모험이 없습니다. 새 게임으로 시작하세요.";
    save.title = save.textContent;
    const n = this.button(stage, "", "title-action title-new", ng);
    n.setAttribute("aria-label", "새 게임");
    (info ? c : n).focus({ preventScroll: true });
    // the browser blocks sound until the first click / key: show a small speaker button while it is still muted
    const snd = this.button(stage, "", "title-sound", () => { G.audio.unlock(); });
    snd.setAttribute("aria-label", "배경음악 켜기"); snd.title = "배경음악 켜기"; snd.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#f6dc94" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z" fill="#f6dc94"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/></svg><span>소리 켜기</span>';
    const upd = () => { snd.style.display = G.audio.audible ? "none" : ""; }; upd();
    G.audio.onState = upd; this._sndT = setInterval(() => { if (!document.body.contains(snd)) clearInterval(this._sndT); else upd(); }, 500);
  }
  showCreate(start, back) {
    const b = this.open("create", null, 1240, 0, false, false);
    this.current.classList.add("create-art-window");
    this.current.setAttribute("aria-label", "캐릭터 선택");
    let gender = "m";
    const names = { m: "카이", f: "리아" }, cards = {};
    const stage = $("div", "create-art", b);
    const art = $("img", "create-illustration", stage);
    art.src = "assets/ui/character-select.png";
    art.alt = "캐릭터 선택 — 소년 모험가와 소녀 모험가";
    for (const c of CHARACTERS) {
      const card = this.button(stage, "", "create-choice choice-" + c.g, () => {
        if (gender !== c.g) { gender = c.g; upd(); }
      });
      card.setAttribute("aria-label", c.title);
      card.title = c.title + " 선택";
      cards[c.g] = card;
    }
    const form = $("div", "create-form", stage, `<input id="cName" aria-label="캐릭터 이름" maxlength="8" autocomplete="off" placeholder="이름 (최대 8자)">`);
    const input = form.querySelector("#cName");
    input.oninput = () => { names[gender] = input.value; };
    const upd = () => {
      for (const g of ["m", "f"]) { cards[g].classList.toggle("sel", g === gender); cards[g].setAttribute("aria-pressed", String(g === gender)); }
      input.value = names[gender];
    };
    upd();
    const random = this.button(stage, "", "create-random", () => {
      const pool = gender === "m" ? ["카이", "레온", "루카", "노아", "아렌"] : ["리아", "루나", "엘라", "유나", "세라"];
      const options = pool.filter(n => n !== input.value);
      names[gender] = options[Math.floor(Math.random() * options.length)]; upd();
    });
    random.setAttribute("aria-label", "이름 무작위 선택");
    this.button(stage, "", "create-back", back).setAttribute("aria-label", "뒤로");
    let starting = false;
    const begin = () => {
      if (starting) return;
      const n = input.value.trim();
      if (!n) { input.focus(); return this.toast("이름을 입력하세요."); }
      starting = true; start(n, gender);
    };
    this.button(stage, "", "create-start", begin).setAttribute("aria-label", "모험 시작");
    input.addEventListener("keydown", e => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); begin(); } });
    cards.m.focus({ preventScroll: true });
  }
  /** live 3D preview of a player character on its own small canvas (walks while turning around) */
  async modelPreview(cv, gender, phase = 0) {
    const [md, sh] = await Promise.all([loadPlayerModel(gender), loadActions()]);
    if (!cv.isConnected) return;
    const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
    r.setPixelRatio(1); r.setSize(cv.width, cv.height, false); r.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene(), h = md.cfg.height, aspect = cv.width / cv.height, half = h * 0.45;
    const cam = new THREE.OrthographicCamera(-half * aspect, half * aspect, half, -half, 0.1, 50);
    const p = CAM.pitch * Math.PI / 180; cam.position.set(0, h * 0.5 + Math.sin(p) * 10, Math.cos(p) * 10); cam.lookAt(0, h * 0.5, 0);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8890a0, 1.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(-5, 8, 4); scene.add(sun);
    const body = new ModelBody(scene, md, sh, 0.32); body.shadow.visible = false; body.place({ x: 0, y: 0, z: 0 }); body.play("walk"); body.treadmill = 1.5;
    let last = performance.now(); const t0 = last - phase * 1000;
    const loop = () => {
      if (!cv.isConnected) { body.dispose(); r.dispose(); return; }
      requestAnimationFrame(loop);
      const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
      const a = (now - t0) / 1000 * 0.9; body.setFacing(Math.sin(a), -Math.cos(a)); body.update(dt); r.render(scene, cam);
    };
    loop();
  }
  /** animated in-game sprite on a small canvas (walks while turning through the 8 directions) */
  spritePreview(cv, sheet, phase = 0) {
    const ctx = cv.getContext("2d"); ctx.imageSmoothingEnabled = false;
    let img = null, meta = null; const t0 = performance.now() - phase * 1000;
    G.loadSheet(sheet).then(sh => { meta = sh.meta; img = sh.tex.image; });
    const anim = () => {
      if (!cv.isConnected) return; requestAnimationFrame(anim);
      if (!img || !img.complete || !meta) return;
      const t = (performance.now() - t0) / 1000, dir = Math.floor(t / 1.6) % 8, a = meta.actions.find(x => x.name === "walk"), f = Math.floor(t * a.fps) % a.frames;
      const idx = a.start + dir * a.frames + f, col = idx % meta.cols, row = Math.floor(idx / meta.cols);
      ctx.clearRect(0, 0, cv.width, cv.height); const cw = Math.round(meta.frameW * 0.62), ch = Math.round(cw * cv.height / cv.width), cx = Math.round(meta.pivotX - cw / 2), cy = Math.max(0, meta.frameH - meta.pivotY + Math.round(meta.ppu * 0.25) - ch); ctx.drawImage(img, col * meta.frameW + cx, row * meta.frameH + cy, cw, ch, 0, 0, cv.width, cv.height);
    };
    anim();
  }
}

export const CHARACTERS = [
  { key: "boy", g: "m", title: "소년 모험가", desc: "붉은 갈색의 부스스한 머리에 청록 조끼와 크림색 셔츠. 큼직한 가죽 장갑과 부츠로 무장한 씩씩한 소년." },
  { key: "girl", g: "f", title: "소녀 모험가", desc: "높이 묶은 포니테일에 청록색 롱코트. 가죽 장갑과 부츠 차림으로 앞장서는 당찬 소녀." }
];

export function rewardText(q) {
  const r = q.reward, parts = [];
  if (r.exp) parts.push("경험치 " + r.exp); if (r.gold) parts.push(r.gold + " G");
  for (const it of r.items || []) parts.push(G.data.item(it.id).name + " x" + it.count);
  return parts.join("  ");
}

installQuestHud(UI);
