// HTML/CSS user interface (ivory / teal / gold, Galmuri pixel font). Port of the Unity uGUI views.
import { QS, Shop, isEquipment, slotOf, EQUIP_SLOTS } from './core.js';
import { THREE, tex, CAM } from './render.js';
import { ModelBody, loadPlayerModel, loadActions } from './model.js';
import { renderItemIcons } from './items3d.js';

let G = null;
export function bindGame(g) { G = g; }
const $ = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
const esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
const STAT_KR = { maxHp: "최대 체력", maxSp: "최대 기력", atk: "공격력", matk: "마법력", def: "방어력", crit: "치명타", critDmg: "치명 피해", moveSpeed: "이동 속도", atkSpeed: "공격 속도", spRegen: "기력 회복", healPower: "회복 효율", foodPower: "음식 효과", dmgReduce: "피해 감소", cdr: "재사용 감소", shieldPower: "보호막 강화" };
const PCT = new Set(["crit", "critDmg", "healPower", "foodPower", "dmgReduce", "cdr", "shieldPower"]);
const TYPE_KR = { weapon: "무기", armor: "방어구", accessory: "장신구", consumable: "소비", material: "재료" };
function modText(m) {
  const out = [];
  if (Math.abs(m.add) > 1e-4) out.push(STAT_KR[m.stat] + " +" + (PCT.has(m.stat) ? Math.round(m.add * 100) + "%" : (m.add % 1 === 0 ? m.add : m.add.toFixed(1))));
  if (Math.abs(m.mul) > 1e-4) out.push(STAT_KR[m.stat] + " +" + Math.round(m.mul * 100) + "%");
  return out.join(", ");
}

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
  tick(dt) {
    for (const e of [...this.toasts.children]) { e._t += dt; if (e._t > 2.6) e.remove(); }
    for (const e of [...this.feed.children]) { e._t += dt; if (e._t > 3.2) e.remove(); }
    for (const f of this.floats.slice()) {
      f.t += dt; const k = f.t / 0.9;
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
      <div class="bar hp"><i id="hHp"></i><b id="hShield"></b><span id="hHpT"></span></div>
      <div class="bar sp"><i id="hSp"></i><span id="hSpT"></span></div>
      <div class="status" id="hStatus"></div></div>
    <div class="topright panel-dark"><div class="zone" id="hZone"></div><div class="gold" id="hGold"></div>
      <div class="menubtns"><button class="btn ivory" data-a="inventory">가방</button><button class="btn ivory" data-a="skills">스킬</button><button class="btn ivory" data-a="craft">제작</button><button class="btn ivory" data-a="quests">퀘스트</button><button class="btn ivory" data-a="pause">메뉴</button></div></div>
    <div class="tracker panel-dark" id="hQuests"></div>
    <div class="target panel-dark" id="hTarget"><div id="hTName"></div><div class="bar hp"><i id="hTHp"></i><span id="hTHpT"></span></div></div>
    <div class="target boss panel-dark" id="hBoss"><div id="hBName"></div><div class="bar boss"><i id="hBHp"></i><span id="hBHpT"></span></div></div>
    <div class="prompt panel-dark" id="hPrompt"></div>
    <div class="expbar"><i id="hExp"></i><span id="hExpT"></span></div>`;
    for (const b of h.querySelectorAll("[data-a]")) b.onclick = () => { G.audio.sfx("ui"); G.input.press({ skills: "skillWin", craft: "craftWin" }[b.dataset.a] || b.dataset.a); };
    this.h = id => h.querySelector("#" + id);
  }
  updateHud() {
    const p = G.player; if (!p) return; const P = p.sheet.p, job = p.sheet.job, h = this.h;
    h("hName").innerHTML = `${esc(P.name)} <small>${job.name}</small>`; h("hLv").textContent = "Lv." + P.level; h("hBadge").textContent = job.name[0];
    const badge = h("hBadge").parentElement; badge.style.borderColor = job.color;
    if (badge._g !== P.gender) { badge._g = P.gender; badge.style.backgroundImage = `url(assets/ui/portrait_${P.gender === "f" ? "girl" : "boy"}.png)`; badge.style.backgroundPosition = P.gender === "f" ? "-61px -53px" : "-61px -40px"; }
    h("hHp").style.width = (100 * p.hp / p.maxHp) + "%"; h("hShield").style.width = Math.min(100, 100 * p.shield / p.maxHp) + "%";
    h("hHpT").textContent = Math.ceil(p.hp) + " / " + Math.round(p.maxHp) + (p.shield > 0 ? `  (+${Math.round(p.shield)})` : "");
    h("hSp").style.width = (100 * p.sp / p.maxSp) + "%"; h("hSpT").textContent = "기력 " + Math.floor(p.sp) + " / " + Math.round(p.maxSp);
    const need = p.sheet.expToNext; h("hExp").style.width = (need ? 100 * P.exp / need : 100) + "%";
    h("hExpT").textContent = need ? `EXP ${P.exp} / ${need}  (${(100 * P.exp / need).toFixed(1)}%)` : "최고 레벨";
    h("hStatus").innerHTML = p.status.list.map(s => `<span style="color:${s.def.color}">${s.def.name} ${Math.ceil(s.remaining)}s</span>`).join(" ");
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
  updateTracker() {
    const p = G.player, ql = p.quests; let html = "<b class='gold'>진행 중인 퀘스트</b>"; let n = 0;
    for (const q of ql.active()) {
      if (n >= 3) { html += "<div class='small'>... (O) 퀘스트 창</div>"; break; }
      const st = ql.stateOf(q);
      html += st === QS.Completable ? `<div class='done'>★ ${q.name} - 보고 가능</div>` : `<div>· ${q.name}</div>` + q.objectives.map((o, i) => `<div class='small'>&nbsp;&nbsp;${ql.objectiveText(q, i)}</div>`).join("");
      n++;
    }
    if (!n) html += G.data.questList.some(q => ql.stateOf(q) === QS.Available) ? "<div class='small'>마을 사람들에게 말을 걸어 보세요. (머리 위 <b class='gold'>!</b>)</div>" : "<div class='small'>모든 퀘스트를 완료했습니다!</div>";
    this.h("hQuests").innerHTML = html;
  }

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
    const wnd = $("div", "window panel " + name, this.win);
    wnd.style.width = w + "px"; if (h) wnd.style.height = h + "px";
    if (title) $("div", "wtitle", wnd, esc(title));
    if (closable) { const x = $("button", "btn red wclose", wnd, "X"); x.onclick = () => this.close(); }
    const body = $("div", "wbody", wnd);
    this.current = wnd; this.currentName = name; this.closable = closable; this.root.classList.toggle("winopen", name !== "dialog" && name !== "title");
    G.input.block = true; this.fit();
    if (name !== "dialog" && window.ResizeObserver) { const ro = new ResizeObserver(() => { if (this.current === wnd) this.fit(); else ro.disconnect(); }); ro.observe(wnd); }
    return body;
  }
  fit() { if (!this.current || this.currentName === "dialog") return; const w = this.current; w.style.transform = ""; const s = Math.min(1, (innerWidth - 20) / w.offsetWidth, (innerHeight - 20) / w.offsetHeight); w.style.transform = `translate(-50%,-50%) scale(${s})`; }
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
    else body = this.open("inventory", "가방 · 장비", 1460, 820);
    const left = $("div", "invleft", body);
    const grid = $("div", "grid", left);
    bag.slots.forEach((s, i) => {
      const d = s.count > 0 ? G.data.item(s.id) : null;
      const c = $("div", "slot" + (sel.slot === i ? " sel" : ""), grid, d ? this.icon(d.icon, 64) + (s.count > 1 ? `<b>${s.count}</b>` : "") + (isEquipment(d) && bag.canEquip(d) ? "<em>✕</em>" : "") : "");
      c.onclick = () => { this.sel = { slot: i }; G.audio.sfx("ui"); shopMode ? this.showShop(shopMode) : this.showInventory(); };
    });
    $("div", "invinfo", left, `${bag.slots.filter(s => s.count > 0).length} / ${bag.slots.length} 칸 사용 <span class="goldtxt">${P.gold.toLocaleString()} G</span>`);
    const det = $("div", "detail slotbg", left);
    let item = null, equipped = false;
    if (sel.equip) { item = G.data.item(P[sel.equip]); equipped = !!item; }
    else if (sel.slot !== undefined && bag.slots[sel.slot] && bag.slots[sel.slot].count > 0) item = G.data.item(bag.slots[sel.slot].id);
    if (!item) det.innerHTML = `<div class="hint">${shopMode ? "판매할 아이템을 선택하세요." : "아이템을 선택하면 설명이 표시됩니다."}</div>`;
    else {
      const info = $("div", "dinfo", det, `<b>${item.name}</b> <small>${TYPE_KR[item.type]}${isEquipment(item) ? ` · ${item.tier}단계 · Lv${item.levelReq}` : ""}${item.job ? " · " + G.data.job(item.job).name + " 전용" : ""}</small><div class="small">${item.desc}</div><div class="mods">${(item.stats || []).map(modText).join(" ")}</div>${shopMode ? `<div class="small">판매가 <span class="goldtxt">${item.sellPrice} G</span></div>` : ""}`);
      const btns = $("div", "dbtns", det);
      if (shopMode) {
        if (!equipped) { const slot = sel.slot, cnt = bag.slots[slot].count; this.button(btns, "1개 판매", "teal", () => this.sell(shopMode, slot, 1)); if (cnt > 1) this.button(btns, "모두 판매", "teal", () => this.sell(shopMode, slot, cnt)); }
      } else if (equipped) this.button(btns, "장착 해제", "teal", () => { const e = bag.unequip(sel.equip); if (e) this.toast(e); else this.sel = {}; this.showInventory(); });
      else if (isEquipment(item)) this.button(btns, "장착", "teal", () => { const e = bag.equipFromSlot(sel.slot); if (e) this.toast(e); else { G.audio.sfx("shield"); this.toast(item.name + " 장착"); } this.showInventory(); });
      else if (item.type === "consumable") this.button(btns, "사용", "teal", () => { p.useItem(item.id); this.showInventory(); });
      if (!shopMode && !equipped) this.button(btns, "버리기", "red", () => this.confirm(`「${item.name}」을(를) 버릴까요?`, () => { bag.removeAt(sel.slot, bag.slots[sel.slot].count); this.sel = {}; this.showInventory(); }, () => this.showInventory()));
    }
    if (shopMode) return;
    const right = $("div", "invright slotbg", body);
    $("div", "sect", right, "<b>장착 장비</b>");
    [["weapon", "무기"], ["armor", "방어구"], ["accessory", "장신구"]].forEach(([s, kr]) => {
      const it = G.data.item(P[s]);
      const r = $("div", "eqrow" + (sel.equip === s ? " sel" : ""), right, (it ? this.icon(it.icon, 60) : '<span class="icon empty"></span>') + `<div><small>${kr}</small><br>${it ? it.name : "<span class='muted'>(비어 있음)</span>"}</div>`);
      r.onclick = () => { this.sel = { equip: s }; G.audio.sfx("ui"); this.showInventory(); };
    });
    const st = p.sheet.final;
    const show = ["maxHp", "maxSp", "atk", "matk", "def", "crit", "moveSpeed", "atkSpeed", "spRegen", "healPower", "dmgReduce", "cdr"].filter(k => !(["healPower", "dmgReduce", "cdr"].includes(k) && st[k] <= 1e-4));
    $("div", "stats", right, `<b>능력치</b> <small>${p.sheet.job.name} Lv${P.level}</small><div class="statgrid">` + show.map(k => `<span>${STAT_KR[k]} <b>${PCT.has(k) ? Math.round(st[k] * 100) + "%" : (["moveSpeed", "atkSpeed", "spRegen"].includes(k) ? st[k].toFixed(2) : Math.round(st[k]))}</b></span>`).join("") + "</div>");
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
    $("div", "logo panel-dark", b, `<img class="tp l" src="assets/ui/portrait_boy.png" alt=""><img class="tp r" src="assets/ui/portrait_girl.png" alt=""><div class="logotxt">아르칸 연대기</div><div class="sub">생활 직업으로 살아가는 마을의 작은 모험 · 웹 플레이 버전</div>`);
    const c = this.button(b, info ? "이어하기" : "이어하기 (저장 없음)", "gold big", cont); c.disabled = !info;
    if (info) $("div", "saveinfo", b, esc(info));
    this.button(b, "새 게임", "teal big", ng);
    $("div", "ver", b, "주인공 원화 제공 · 배경/몬스터 도트와 3D는 임시 자산 · 폰트: 갈무리(OFL) · 소리는 첫 클릭 후 재생");
  }
  showCreate(start, back) {
    const b = this.open("create", "캐릭터 선택", 1240, 0, false);
    let gender = "m";
    const names = { m: "카이", f: "리아" }, typed = { m: false, f: false };
    const row = $("div", "charcards", b), cards = {}, anims = [];
    for (const c of CHARACTERS) {
      const card = $("div", "charcard slotbg", row, `<div class="portrait"><img src="assets/ui/portrait_${c.key}.png" alt=""></div>
        <div class="cinfo"><div class="ctitle">${c.title}</div><div class="small">${c.desc}</div>
        <div class="ingame"><canvas width="312" height="336"></canvas><div class="small muted">게임 속 모습</div></div></div>`);
      card.onclick = () => { if (gender !== c.g) { gender = c.g; G.audio.sfx("ui"); upd(); } };
      cards[c.g] = card;
      this.modelPreview(card.querySelector("canvas"), c.g, c.g === "m" ? 0 : 1.1);
    }
    const form = $("div", "cform", b, `<label>이름</label><input id="cName" maxlength="8" placeholder="이름을 입력하세요 (최대 8자)"><div class="small muted">직업은 마을의 직업 마스터에게서 정합니다. 직업을 정해도 캐릭터의 얼굴·머리·복장은 그대로이고, 직업 장비와 무기가 더해집니다.</div>`);
    const input = form.querySelector("#cName");
    input.oninput = () => { typed[gender] = true; names[gender] = input.value; };
    const upd = () => { for (const g of ["m", "f"]) cards[g].classList.toggle("sel", g === gender); input.value = names[gender]; };
    upd();
    const bb = $("div", "pbtns", b);
    this.button(bb, "뒤로", "ivory", back);
    this.button(bb, "모험 시작", "gold", () => { const n = input.value.trim(); if (!n) return this.toast("이름을 입력하세요."); start(n, gender); });
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
