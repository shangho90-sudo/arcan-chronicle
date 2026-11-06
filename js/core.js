// Arcan Chronicle (web) - pure game logic. Port of Assets/Arcan/Scripts/Core (C#). No rendering here.
// World coordinates follow the Unity project: x = east, y = up, z = north.
import { SkillBook, ensureSk, advanceBlock, ADV1_LEVEL } from "./skillsys.js";

export const STATS = ["maxHp", "maxSp", "atk", "matk", "def", "crit", "critDmg", "moveSpeed", "atkSpeed", "spRegen", "healPower", "foodPower", "dmgReduce", "cdr", "shieldPower", "hit", "eva", "craftRate"];
/** 능력치 (attribute points): 3 per level gained, spent freely; every character also has ATTR_BASE in each.
 *  Effects are per point spent (the base 5 is already part of the job's base stats):
 *  힘 str -> atk, 지능 int -> matk, 민첩 dex -> hit (명중) + eva (회피), 생명력 vit -> maxHp + maxSp, 행운 luk -> crit + craftRate */
export const ATTRS = ["str", "int", "dex", "vit", "luk"];
export const ATTR_KR = { str: "힘", int: "지능", dex: "민첩", vit: "생명력", luk: "행운" };
export const ATTR_BASE = 5, ATTR_PER_LEVEL = 3;
export const ATTR_FX = { str: { atk: 1.5 }, int: { matk: 1.5 }, dex: { hit: 0.01, eva: 0.006 }, vit: { maxHp: 12, maxSp: 4 }, luk: { crit: 0.004, craftRate: 0.01 } };
export const EVA_CAP = 0.4, MISS_CAP = 0.5;
/** chance that an attack from src misses tgt: monsters dodge a little (more at higher level, less vs 명중), players dodge by 회피 */
export function missChance(src, tgt) {
  if (!src || !tgt || src.faction === tgt.faction) return 0;
  if (src.faction === "player") return clamp(0.03 + 0.0015 * (tgt.level || 1) - (src.stat ? src.stat("hit") : 0), 0, MISS_CAP);
  if (tgt.faction === "player") return clamp(tgt.stat ? tgt.stat("eva") : 0, 0, EVA_CAP);
  return 0;
}
export const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
export const clamp01 = v => clamp(v, 0, 1);
export const lerp = (a, b, t) => a + (b - a) * clamp01(t);
export const DEG = Math.PI / 180;

export function emptyStats() { const s = {}; for (const k of STATS) s[k] = 0; return s; }
export function addStats(a, b, scale = 1) { if (!b) return a; for (const k of STATS) a[k] += (b[k] || 0) * scale; return a; }

// ======================================================================================= data
export class GameData {
  constructor(files) {
    this.config = files.config; this.levels = files.levels;
    this.jobList = files.jobs.jobs; this.jobs = Object.fromEntries(this.jobList.map(j => [j.id, j]));
    this.skills = Object.fromEntries(files.skills.skills.map(s => [s.id, s]));
    this.statuses = Object.fromEntries(files.skills.statuses.map(s => [s.id, s]));
    this.itemList = files.items.items; this.items = Object.fromEntries(this.itemList.map(i => [i.id, i]));
    this.monsters = Object.fromEntries(files.monsters.monsters.map(m => [m.id, m]));
    this.questList = files.quests.quests; this.quests = Object.fromEntries(this.questList.map(q => [q.id, q]));
    this.npcs = Object.fromEntries(files.npcs.npcs.map(n => [n.id, n]));
    this.shops = Object.fromEntries(files.npcs.shops.map(s => [s.id, s]));
    this.zones = Object.fromEntries(files.zones.zones.map(z => [z.id, z]));
    this.world = files.zones.world || null;                 // 세계 지도: regions + links (tools/world/world.py)
    // job skill system v2 (skills2.json): 180 skills, statuses, craft items, recipes
    const s2 = files.skills2 || { skills: [], statuses: [], items: [], recipes: [] };
    this.skill2List = s2.skills; this.skills2 = Object.fromEntries(s2.skills.map(s => [s.id, s]));
    for (const st of s2.statuses || []) this.statuses[st.id] = Object.assign({}, st, this.statuses[st.id] || {});      // existing definitions win
    for (const it of s2.items || []) if (!this.items[it.id]) { this.itemList.push(it); this.items[it.id] = it; }
    this.recipes = s2.recipes || []; this.salvage = s2.salvage || null;
    for (const [shop, ids] of Object.entries(s2.shopAdd || {})) { const sh = this.shops[shop]; if (sh) for (const id of ids) if (!sh.items.includes(id) && this.items[id]) sh.items.push(id); }
  }
  skill2(id) { return this.skills2 ? this.skills2[id] || null : null; }
  skillsOf(job) { return (this.skill2List || []).filter(s => s.job === job); }
  job(id) { return this.jobs[id] || null; }
  skill(id) { return this.skills[id] || null; }
  item(id) { return id ? this.items[id] || null : null; }
  status(id) { return this.statuses[id] || null; }
  expToNext(level) {
    if (level >= this.levels.maxLevel) return 0;
    const t = this.levels.expToNext; if (level - 1 < t.length) return t[level - 1];
    return Math.round(t[t.length - 1] * Math.pow(level / t.length, 1.9) / 10) * 10;      // smooth extension up to the cap
  }
  weaponFor(job, tier) {
    if (!job || job === "novice") job = "pharmacist";
    const j = this.job(job); if (j && j.tier === 2 && j.parent) job = j.parent;
    const it = this.itemList.find(i => i.type === "weapon" && i.job === job && i.tier === tier);
    return it ? it.id : null;
  }
  validate() {
    const e = [];
    for (const j of this.jobList) if (j.tier === 1 && j.implemented) {
      const ks = j.skills.map(s => this.skill(s));
      if (ks.includes(null)) e.push("job " + j.id + " missing skill");
      if (j.tier >= 1 && this.skill2List && this.skillsOf(j.id).length !== 15) e.push("job " + j.id + " needs 15 skills (has " + this.skillsOf(j.id).length + ")");
    }
    for (const m of Object.values(this.monsters)) for (const d of m.drops) if (!d.item.startsWith("@") && !this.item(d.item)) e.push("drop " + d.item);
    for (const q of this.questList) if (!this.npcs[q.giver]) e.push("quest giver " + q.giver);
    return e;
  }
}

export const isEquipment = d => d && (d.type === "weapon" || d.type === "armor" || d.type === "accessory");
export const slotOf = d => !d ? null : (d.type === "weapon" ? "weapon" : d.type === "armor" ? "armor" : d.type === "accessory" ? "accessory" : null);
export const EQUIP_SLOTS = ["weapon", "armor", "accessory"];

// ======================================================================================= profile / save
export const SAVE_VERSION = 4;
export function newProfile(data, name, gender) {
  const p = {
    version: SAVE_VERSION, saveTime: "", playTime: 0, name: (name || "모험가").trim() || "모험가", gender: gender === "f" ? "f" : "m",
    job: "novice", level: 1, exp: 0, gold: data.levels.startGold, hp: -1, sp: -1, inventory: [], weapon: "w_stick_1", armor: "", accessory: "",
    learnedSkills: [], jobsUnlocked: [], quests: [], flags: [], sk: {}, crafted: {}, gearMods: {}, zone: data.levels.startZone, hasPos: false, posX: 0, posY: 0, posZ: 0, facing: 0,
    returnZone: data.levels.startZone, returnSpawn: data.levels.startSpawn
  };
  const ch = new CharacterSheet(data, p);
  for (const it of data.levels.startItems || []) ch.bag.add(it.id, it.count);
  return p;
}

export function migrate(p) {
  if (!p || typeof p !== "object") return null;
  if ((p.version || 0) < 2) { p.returnZone = p.returnZone || "town"; p.returnSpawn = p.returnSpawn || "start"; p.flags = p.flags || []; }
  for (const k of ["inventory", "learnedSkills", "jobsUnlocked", "quests", "flags"]) if (!Array.isArray(p[k])) p[k] = [];
  for (const k of ["weapon", "armor", "accessory"]) if (typeof p[k] !== "string") p[k] = "";
  if (p.gender !== "m" && p.gender !== "f") p.gender = "m";
  p.gold = Math.max(0, p.gold | 0); p.exp = Math.max(0, p.exp | 0); p.level = Math.max(1, p.level | 0);
  if ((p.version || 0) < 3) {
    // v3: job skill system. Characters that already chose a job keep it (even below Lv10); old job skills are retired
    // (basic attacks stay); skill points are granted from Lv10 on by SkillBook (recorded, never twice).
    p.legacyJob = p.job && p.job !== "novice" && p.level < ADV1_LEVEL ? true : !!p.legacyJob;
    if (!p.sk || typeof p.sk !== "object") p.sk = {};
    p.crafted = p.crafted && typeof p.crafted === "object" ? p.crafted : {};
    p.gearMods = p.gearMods && typeof p.gearMods === "object" ? p.gearMods : {};
  }
  // v4 (2026-11-06): fields became twice as large and the mushroom boss moved to its own zone -> a position saved in a
  // field no longer means the same place; restart at the zone's entrance instead
  if ((p.version || 0) < 4 && p.zone && p.zone !== "town") p.hasPos = false;
  p.version = SAVE_VERSION;
  return p;
}

export class SaveStore {
  constructor(key = "arcan_save_0") { this.key = key; this.lastError = null; }
  _ls() { try { return window.localStorage; } catch (e) { return null; } }
  exists() { const ls = this._ls(); try { return !!(ls && (ls.getItem(this.key) || ls.getItem(this.key + ".bak"))); } catch (e) { return false; } }
  save(p) {
    const ls = this._ls();
    p.version = SAVE_VERSION;
    p.saveTime = new Date().toLocaleString("ko-KR");
    const json = JSON.stringify(p);
    if (!ls) { this.lastError = "브라우저 저장소를 사용할 수 없습니다"; this.memory = json; return false; }
    try {
      const prev = ls.getItem(this.key);
      if (prev) ls.setItem(this.key + ".bak", prev);
      ls.setItem(this.key, json);
      this.lastError = null; return true;
    } catch (e) { this.lastError = String(e.message || e); this.memory = json; return false; }
  }
  load() {
    const ls = this._ls();
    const cands = [];
    try { if (ls) { cands.push(ls.getItem(this.key)); cands.push(ls.getItem(this.key + ".bak")); } } catch (e) { }
    if (this.memory) cands.push(this.memory);
    for (const c of cands) {
      if (!c) continue;
      try { const p = migrate(JSON.parse(c)); if (p && p.job) return p; } catch (e) { this.lastError = String(e.message || e); }
    }
    return null;
  }
  remove() { const ls = this._ls(); try { if (ls) { ls.removeItem(this.key); ls.removeItem(this.key + ".bak"); } } catch (e) { } this.memory = null; }
}

// ======================================================================================= inventory
export class Inventory {
  constructor(data, profile) { this.data = data; this.p = profile; this.onChange = []; this.normalize(); }
  get capacity() { return Math.max(1, this.data.levels.inventorySize); }
  get slots() { return this.p.inventory; }
  changed() { for (const f of this.onChange) f(); }
  normalize() {
    const src = this.p.inventory || [];
    const list = [];
    for (let i = 0; i < this.capacity; i++) {
      const s = src[i];
      const def = s && this.data.item(s.id);
      if (!s || !def || !(s.count > 0)) { list.push({ id: "", count: 0 }); continue; }
      list.push({ id: s.id, count: Math.min(s.count | 0, def.maxStack) });
    }
    for (let i = this.capacity; i < src.length; i++) if (src[i] && this.data.item(src[i].id) && src[i].count > 0) this._add(list, src[i].id, src[i].count);
    this.p.inventory = list;
    for (const slot of EQUIP_SLOTS) { const id = this.p[slot]; const d = this.data.item(id); if (id && (!d || slotOf(d) !== slot)) this.p[slot] = ""; }
  }
  count(id) { let n = 0; for (const s of this.p.inventory) if (s.count > 0 && s.id === id) n += s.count; return n; }
  spaceFor(id) {
    const d = this.data.item(id); if (!d) return 0;
    let n = 0; for (const s of this.p.inventory) { if (!(s.count > 0)) n += d.maxStack; else if (s.id === id) n += d.maxStack - s.count; }
    return n;
  }
  _add(list, id, count) {
    const d = this.data.item(id); let left = count;
    if (d.maxStack > 1) for (const s of list) { if (left <= 0) break; if (s.count > 0 && s.id === id && s.count < d.maxStack) { const k = Math.min(left, d.maxStack - s.count); s.count += k; left -= k; } }
    for (let i = 0; i < list.length && left > 0; i++) if (!(list[i].count > 0)) { const k = Math.min(left, d.maxStack); list[i] = { id, count: k }; left -= k; }
    return count - left;
  }
  add(id, count) {
    if (!(count > 0) || !this.data.item(id)) return 0;
    const n = this._add(this.p.inventory, id, count | 0);
    if (n > 0) this.changed();
    return n;
  }
  tryAddAll(id, count) { if (this.spaceFor(id) < count) return false; return this.add(id, count) === count; }
  remove(id, count) {
    if (!(count > 0)) return count === 0;
    if (this.count(id) < count) return false;
    let left = count;
    for (let i = this.p.inventory.length - 1; i >= 0 && left > 0; i--) {
      const s = this.p.inventory[i]; if (!(s.count > 0) || s.id !== id) continue;
      const k = Math.min(left, s.count); s.count -= k; left -= k;
      if (s.count <= 0) this.p.inventory[i] = { id: "", count: 0 };
    }
    this.changed(); return true;
  }
  removeAt(slot, count) {
    const s = this.p.inventory[slot];
    if (!s || !(count > 0) || !(s.count >= count)) return false;
    s.count -= count; if (s.count <= 0) this.p.inventory[slot] = { id: "", count: 0 };
    this.changed(); return true;
  }
  canEquip(def) {
    if (!isEquipment(def)) return "장착할 수 없는 아이템입니다.";
    if (this.p.level < def.levelReq) return "레벨 " + def.levelReq + " 이상 필요합니다.";
    if (def.type === "weapon" && def.job && def.job !== this.p.job) {
      const cur = this.data.job(this.p.job);
      if (!(cur && cur.parent === def.job)) return (this.data.job(def.job)?.name || def.job) + " 전용 무기입니다.";
    }
    return null;
  }
  equipFromSlot(slot) {
    const s = this.p.inventory[slot];
    if (!s || !(s.count > 0)) return "빈 슬롯";
    const def = this.data.item(s.id);
    const err = this.canEquip(def); if (err) return err;
    const eq = slotOf(def); const prev = this.p[eq];
    if (s.count > 1) {
      if (prev && this.spaceFor(prev) - (this.data.item(prev).maxStack) < 0 && !this.p.inventory.some((x, i) => i !== slot && !(x.count > 0))) return "가방에 빈 칸이 없습니다.";
      s.count -= 1; if (prev) this._add(this.p.inventory, prev, 1);
    } else this.p.inventory[slot] = prev ? { id: prev, count: 1 } : { id: "", count: 0 };
    this.p[eq] = def.id;
    this.changed(); return null;
  }
  unequip(slot) {
    const id = this.p[slot]; if (!id) return "장착된 아이템이 없습니다.";
    if (this.spaceFor(id) < 1) return "가방에 빈 칸이 없습니다.";
    this._add(this.p.inventory, id, 1); this.p[slot] = ""; this.changed(); return null;
  }
  weaponBlockedFor(jobId) {
    const w = this.data.item(this.p.weapon); if (!w || !w.job || w.job === jobId) return null;
    const j = this.data.job(jobId); if (j && j.parent === w.job) return null;
    return w.id;
  }
  validateEquipmentForJob() {
    const w = this.data.item(this.p.weapon);
    if (w && this.canEquip(w)) { if (this.spaceFor(w.id) < 1) return false; this._add(this.p.inventory, w.id, 1); this.p.weapon = ""; }
    this.changed(); return true;
  }
}

// ======================================================================================= character
/** weapon modules / embroidery / 완벽한 피팅 -> stat mods (only for currently equipped items, so never applied twice) */
function gearModsProvider(sh) {
  const p = sh.p, out = [], gm = p.gearMods || {};
  const w = gm[p.weapon], a = gm[p.armor];
  if (w && w.mod === "speed") out.push({ stat: "atkSpeed", add: 0, mul: 0.12 }, { stat: "atk", add: 0, mul: -0.05 });
  if (w && w.mod === "power") out.push({ stat: "atk", add: 0, mul: 0.10 }, { stat: "atkSpeed", add: 0, mul: -0.06 });
  if (a && a.emb === "atk") out.push({ stat: "atk", add: 0, mul: 0.06 });
  if (a && a.emb === "def") out.push({ stat: "def", add: 0, mul: 0.10 });
  if (a && a.emb === "mp") out.push({ stat: "spRegen", add: 2, mul: 0 });
  const fit = sh.book ? sh.book.passive("fitting") : 0;
  if (fit && p.armor && ((p.crafted || {})[p.armor] || (a && a.emb))) out.push({ stat: "def", add: 0, mul: fit }, { stat: "moveSpeed", add: 0, mul: fit * 0.5 });
  return out;
}
export class CharacterSheet {
  static modProviders = [gearModsProvider];      // extra stat mods (crafted gear upgrades, embroidery ...)
  constructor(data, profile) {
    this.data = data; this.p = profile;
    this.events = { levelUp: [], stats: [], skill: [], job: [] };
    this.bag = new Inventory(data, profile);
    this.bag.onChange.push(() => this.recalc());
    if (!data.job(profile.job)) profile.job = "novice";
    profile.level = clamp(profile.level, 1, data.levels.maxLevel);
    this.book = new SkillBook(data, this);
    // 능력치: additive save fields (older saves get the points of every level they already gained, nothing spent)
    if (!profile.attr || typeof profile.attr !== "object") { profile.attr = {}; profile.apoints = (profile.level - 1) * ATTR_PER_LEVEL; }
    for (const k of ATTRS) profile.attr[k] = Math.max(0, profile.attr[k] | 0);
    profile.apoints = Math.max(0, profile.apoints | 0);
    this.refreshSkills(false); this.recalc();
  }
  attr(k) { return ATTR_BASE + (this.p.attr[k] | 0); }
  /** spend n attribute points on k; returns an error message or null */
  spendAttr(k, n = 1) {
    if (!ATTRS.includes(k)) return "알 수 없는 능력치";
    n = Math.min(n | 0, this.p.apoints); if (n <= 0) return "남은 능력치 포인트가 없습니다";
    this.p.attr[k] += n; this.p.apoints -= n; this.recalc(); return null;
  }
  /** give every spent point back (town only, like the skill reset) */
  resetAttr(inTown) {
    if (!inTown) return "능력치 초기화는 마을에서만 할 수 있습니다";
    let n = 0; for (const k of ATTRS) { n += this.p.attr[k]; this.p.attr[k] = 0; }
    if (!n) return "돌려받을 포인트가 없습니다";
    this.p.apoints += n; this.recalc(); return null;
  }
  emit(k, v) { for (const f of this.events[k]) f(v); }
  get job() { return this.data.job(this.p.job); }
  static baseStats(job, level) { const s = Object.assign(emptyStats(), job.baseStats); addStats(s, job.growth, level - 1); return s; }
  recalc() {
    const base = CharacterSheet.baseStats(this.job, this.p.level), flat = emptyStats(), pct = emptyStats();
    const apply = mods => { for (const m of mods || []) { flat[m.stat] += m.add; pct[m.stat] += m.mul; } };
    for (const s of EQUIP_SLOTS) { const it = this.data.item(this.p[s]); if (it) apply(it.stats); }
    for (const id of this.p.learnedSkills) { const sk = this.data.skill(id); if (sk && sk.kind === "passive" && sk.job === this.p.job) apply(sk.passiveMods); }
    if (this.book) apply(this.book.passiveMods());
    for (const f of CharacterSheet.modProviders) apply(f(this));
    if (this.p.attr) for (const a of ATTRS) { const n = this.p.attr[a] | 0; if (n) for (const [k, v] of Object.entries(ATTR_FX[a])) flat[k] += v * n; }
    const f = addStats(Object.assign({}, base), flat);
    for (const k of STATS) if (Math.abs(pct[k]) > 1e-6) f[k] *= 1 + pct[k];
    f.eva = clamp(f.eva, 0, EVA_CAP); f.hit = Math.max(0, f.hit); f.craftRate = Math.max(0, f.craftRate);
    f.crit = clamp01(f.crit); f.dmgReduce = clamp(f.dmgReduce, 0, 0.8); f.cdr = clamp(f.cdr, 0, 0.5); f.atkSpeed = Math.max(0.3, f.atkSpeed);
    this.final = f;
    if (this.p.hp < 0 || this.p.hp > f.maxHp) this.p.hp = f.maxHp;
    if (this.p.sp < 0 || this.p.sp > f.maxSp) this.p.sp = f.maxSp;
    this.emit("stats");
  }
  get expToNext() { return this.data.expToNext(this.p.level); }
  get isMax() { return this.p.level >= this.data.levels.maxLevel; }
  addExp(n) {
    if (!(n > 0) || this.isMax) return 0;
    this.p.exp += n; let g = 0;
    while (!this.isMax && this.p.exp >= this.expToNext) { this.p.exp -= this.expToNext; this.p.level++; g++; if (this.p.attr) this.p.apoints = (this.p.apoints | 0) + ATTR_PER_LEVEL; this.recalc(); this.emit("levelUp", this.p.level); }
    if (this.isMax) this.p.exp = 0;
    if (g > 0) { this.refreshSkills(true); if (this.book) this.book.ngained = 0; const pts = this.book ? this.book.grantPoints() : 0; if (pts) this.emit("skill", "@points:" + pts); if (this.book && this.book.ngained) this.emit("skill", "@npoints:" + this.book.ngained); this.recalc(); this.p.hp = this.final.maxHp; this.p.sp = this.final.maxSp; }
    return g;
  }
  spendGold(n) { if (n < 0 || this.p.gold < n) return false; this.p.gold -= n; return true; }
  addGold(n) { if (n > 0) this.p.gold = Math.min(this.p.gold + n, 99999999); }
  canChooseJob(id) {
    const j = this.data.job(id); if (!j) return "알 수 없는 직업";
    const adv = advanceBlock(this.data, this, this.questLog, id); if (adv) return adv;
    const b = this.bag.weaponBlockedFor(id); if (b && this.bag.spaceFor(b) < 1) return "가방이 가득 차서 무기를 해제할 수 없습니다.";
    return null;
  }
  chooseJob(id) {
    const e = this.canChooseJob(id); if (e) return e;
    this.p.job = id; if (!this.p.jobsUnlocked.includes(id)) this.p.jobsUnlocked.push(id);
    this.bag.validateEquipmentForJob(); this.refreshSkills(true); if (this.book) { const pts = this.book.grantPoints(); if (pts) this.emit("skill", "@points:" + pts); } this.recalc(); this.emit("job", id); return null;
  }
  refreshSkills(notify) {
    const l = this.p.learnedSkills.filter(s => this.data.skill(s));
    for (const id of this.job?.skills || []) {
      const s = this.data.skill(id); if (!s || !s.implemented) continue;
      if (this.p.level >= s.unlockLevel && !l.includes(id)) { l.push(id); if (notify) this.emit("skill", id); }
    }
    this.p.learnedSkills = l;
  }
  knows(id) { return this.p.learnedSkills.includes(id); }
  hotbar() {
    const r = [null, null, null]; let k = 0;
    for (const id of this.job?.skills || []) { const s = this.data.skill(id); if (s && s.kind === "active") { if (k < 3) r[k] = s; k++; } }
    return r;
  }
}

// ======================================================================================= quests
export const QS = { Locked: 0, Available: 1, Active: 2, Completable: 3, Completed: 4 };
export class QuestLog {
  constructor(data, ch) {
    this.data = data; this.ch = ch; this.events = { accepted: [], updated: [], completed: [], ready: [] };
    ch.questLog = this;
    const P = ch.p;
    P.quests = (P.quests || []).filter(q => data.quests[q.id]).map(q => {
      const d = data.quests[q.id];
      return { id: q.id, state: q.state === "completed" ? "completed" : "active", counts: d.objectives.map((o, i) => clamp((q.counts || [])[i] | 0, 0, o.count)) };
    });
    ch.events.job.push(j => this.notify("job", j, 1));
  }
  emit(k, v) { for (const f of this.events[k]) f(v); }
  find(id) { return this.ch.p.quests.find(q => q.id === id); }
  stateOf(q) {
    const pr = this.find(q.id);
    if (pr) return pr.state === "completed" ? QS.Completed : (this.isDone(q, pr) ? QS.Completable : QS.Active);
    if (this.ch.p.level < q.minLevel) return QS.Locked;
    if (q.jobReq) { const jr = this.data.job(q.jobReq); if (!jr || this.ch.p.job !== jr.parent) return QS.Locked; }
    for (const pre of q.prereq || []) { const pp = this.find(pre); if (!pp || pp.state !== "completed") return QS.Locked; }
    return QS.Available;
  }
  isDone(q, pr) { return q.objectives.every((o, i) => this.current(q, i, pr) >= o.count); }
  current(q, i, pr = this.find(q.id)) {
    const o = q.objectives[i], P = this.ch.p;
    switch (o.type) {
      case "collect": return Math.min(o.count, this.ch.bag.count(o.target));
      case "level": return P.level >= o.count ? o.count : P.level;
      case "equip": { const [slot, t] = o.target.split(":"); const it = this.data.item(P[slot]); return it && it.tier >= (+t || 1) ? 1 : 0; }
      case "job": return o.target === "any" ? (P.job !== "novice" ? 1 : 0) : (P.job === o.target ? 1 : 0);
    }
    return pr ? pr.counts[i] | 0 : 0;
  }
  active() { return this.ch.p.quests.filter(q => q.state !== "completed").map(q => this.data.quests[q.id]); }
  isCompleted(id) { const p = this.find(id); return !!p && p.state === "completed"; }
  questsFor(npc) {
    return this.data.questList.filter(q => {
      const st = this.stateOf(q), turnIn = q.turnIn || q.giver;
      return (st === QS.Available && q.giver === npc) || ((st === QS.Active || st === QS.Completable) && (turnIn === npc || q.giver === npc));
    });
  }
  accept(id) {
    const q = this.data.quests[id]; if (!q || this.stateOf(q) !== QS.Available) return false;
    this.ch.p.quests.push({ id, state: "active", counts: q.objectives.map(() => 0) });
    this.emit("accepted", q); if (this.isDone(q, this.find(id))) this.emit("ready", q); return true;
  }
  notify(type, target, amount) {
    for (const pr of this.ch.p.quests) {
      if (pr.state === "completed") continue;
      const q = this.data.quests[pr.id]; const was = this.isDone(q, pr); let changed = false;
      q.objectives.forEach((o, i) => {
        if (o.type !== type || o.target !== target) return;
        if (["collect", "equip", "level", "job"].includes(type)) { changed = true; return; }
        const b = pr.counts[i]; pr.counts[i] = Math.min(o.count, pr.counts[i] + amount); if (pr.counts[i] !== b) changed = true;
      });
      if (changed) { this.emit("updated", q); if (!was && this.isDone(q, pr)) this.emit("ready", q); }
    }
  }
  /** Checks passive objectives (collect / equip / level) after any change. */
  refreshPassive() {
    for (const pr of this.ch.p.quests) {
      if (pr.state === "completed") continue;
      const q = this.data.quests[pr.id];
      const done = this.isDone(q, pr);
      if (done && !pr._readyNotified) { pr._readyNotified = true; this.emit("ready", q); }
      if (!done) pr._readyNotified = false;
    }
  }
  complete(id) {
    const q = this.data.quests[id]; if (!q) return "알 수 없는 퀘스트";
    if (this.stateOf(q) !== QS.Completable) return "아직 목표를 달성하지 못했습니다.";
    const rewards = q.reward?.items || [];
    const consume = q.consumeCollected ? q.objectives.filter(o => o.type === "collect").map(o => ({ id: o.target, count: o.count })) : [];
    // simulate space
    const sim = this.ch.p.inventory.map(s => ({ id: s.id, count: s.count }));
    for (const c of consume) { let left = c.count; for (let i = sim.length - 1; i >= 0 && left > 0; i--) { if (sim[i].count > 0 && sim[i].id === c.id) { const k = Math.min(left, sim[i].count); sim[i].count -= k; left -= k; if (!sim[i].count) sim[i] = { id: "", count: 0 }; } } }
    for (const r of rewards) {
      const d = this.data.item(r.id); let left = r.count;
      for (const s of sim) { if (left <= 0) break; if (s.count > 0 && s.id === r.id && s.count < d.maxStack) { const k = Math.min(left, d.maxStack - s.count); s.count += k; left -= k; } }
      for (let i = 0; i < sim.length && left > 0; i++) if (!(sim[i].count > 0)) { const k = Math.min(left, d.maxStack); sim[i] = { id: r.id, count: k }; left -= k; }
      if (left > 0) return "가방에 빈 칸이 부족합니다.";
    }
    for (const c of consume) if (!this.ch.bag.remove(c.id, c.count)) return "필요한 아이템이 부족합니다.";
    this.find(id).state = "completed";
    for (const r of rewards) this.ch.bag.add(r.id, r.count);
    this.ch.addGold(q.reward?.gold || 0); this.ch.addExp(q.reward?.exp || 0);
    this.emit("completed", q); return null;
  }
  objectiveText(q, i) {
    const o = q.objectives[i], cur = this.current(q, i);
    if (["talk", "job", "equip", "visit"].includes(o.type)) return o.text + (cur >= o.count ? " (완료)" : "");
    return o.text + " (" + cur + "/" + o.count + ")";
  }
}

// ======================================================================================= shop
export const Shop = {
  buy(ch, shop, id, n) {
    if (!(n > 0)) return "수량이 올바르지 않습니다.";
    if (!shop || !shop.items.includes(id)) return "이 상점에서 팔지 않는 물건입니다.";
    const d = ch.data.item(id); const cost = d.price * n;
    if (cost > ch.p.gold) return "골드가 부족합니다.";
    if (ch.bag.spaceFor(id) < n) return "가방에 빈 칸이 부족합니다.";
    ch.spendGold(cost); ch.bag.add(id, n); return null;
  },
  sell(ch, slot, n) {
    const s = ch.p.inventory[slot]; if (!s || !(s.count > 0)) return "빈 칸입니다.";
    const d = ch.data.item(s.id); if (!(d.sellPrice > 0)) return "판매할 수 없는 아이템입니다.";
    if (!(n > 0) || s.count < n) return "수량이 부족합니다.";
    ch.bag.removeAt(slot, n); ch.addGold(d.sellPrice * n); return null;
  }
};

// ======================================================================================= combat
export const CombatMath = {
  compute(power, coef, def, critChance, critDmg, reduction, rC = Math.random(), rV = Math.random()) {
    if (!(coef > 0) || !(power > 0)) return { amount: 0, crit: false };
    let d = power * coef * 100 / (100 + Math.max(0, def));
    const crit = rC < clamp01(critChance);
    if (crit) d *= 1.5 + Math.max(0, critDmg);
    d *= 0.92 + 0.16 * clamp01(rV);
    d *= 1 - clamp(reduction, 0, 0.8);
    return { amount: Math.max(1, Math.round(d)), crit };
  },
  heal(base, pct, maxHp, hp) { return Math.round((base + pct * maxHp) * (1 + Math.max(0, hp))); },
  cooldown(cd, cdr) { return cd * (1 - clamp(cdr, 0, 0.5)); }
};

/** Hit shape on the ground (x,z). The same object draws telegraphs and resolves hits. */
export class HitShape {
  static circle(cx, cz, r) { return Object.assign(new HitShape(), { kind: "circle", cx, cz, r, fx: 0, fz: 1 }); }
  static ring(cx, cz, inner, outer) { return Object.assign(new HitShape(), { kind: "ring", cx, cz, r: outer, inner, fx: 0, fz: 1 }); }
  static cone(cx, cz, fx, fz, r, fullAngle) { const m = Math.hypot(fx, fz) || 1; return Object.assign(new HitShape(), { kind: "cone", cx, cz, fx: fx / m, fz: fz / m, r, half: fullAngle / 2 }); }
  static rect(cx, cz, fx, fz, width, length) { const m = Math.hypot(fx, fz) || 1; return Object.assign(new HitShape(), { kind: "rect", cx, cz, fx: fx / m, fz: fz / m, hw: width / 2, len: length }); }
  overlaps(px, pz, tr) {
    const dx = px - this.cx, dz = pz - this.cz, m = Math.hypot(dx, dz);
    switch (this.kind) {
      case "circle": return m <= this.r + tr;
      case "ring": return m <= this.r + tr && m >= this.inner - tr;
      case "cone": {
        if (m > this.r + tr) return false; if (m <= tr + 0.05) return true;
        const ang = Math.acos(clamp((dx * this.fx + dz * this.fz) / m, -1, 1)) / DEG;
        if (ang <= this.half + 0.01) return true;
        const e = ang - this.half; return e < 90 && Math.sin(e * DEG) * m <= tr;
      }
      case "rect": {
        const rx = this.fz, rz = -this.fx; const along = dx * this.fx + dz * this.fz, side = dx * rx + dz * rz;
        return along >= -tr && along <= this.len + tr && Math.abs(side) <= this.hw + tr;
      }
    }
    return false;
  }
}

export class StatusSet {
  constructor() { this.list = []; }
  /** stack rules (data): refresh = keep the longer duration and the stronger value; max = same, capped (def.cap);
   *  group: only one status of a group at a time (food buffs never stack with each other) */
  apply(def, dur, value, source) {
    if (!def || !(dur > 0)) return;
    if (def.group) this.list = this.list.filter(x => !(x.def.group === def.group && x.def.id !== def.id));
    const s = this.list.find(x => x.def.id === def.id);
    if (def.cap != null && def.kind !== "dot") value = Math.sign(value) * Math.min(Math.abs(value), def.cap);
    if (s) { s.remaining = Math.max(s.remaining, dur); s.duration = Math.max(s.duration, dur); if (Math.abs(value) > Math.abs(s.value)) s.value = value; if (source) s.source = source; return; }
    this.list.push({ def, remaining: dur, duration: dur, value, tick: def.tick, source });
  }
  has(id) { return this.list.some(s => s.def.id === id); }
  get(id) { return this.list.find(s => s.def.id === id) || null; }
  remove(id) { this.list = this.list.filter(s => s.def.id !== id); }
  removeDebuffs() { this.list = this.list.filter(s => !s.def.debuff || s.def.cleanse === false); }
  clear() { this.list = []; }
  tick(dt, onDot, onHot) {
    for (const s of this.list.slice()) {
      s.remaining -= dt;
      if (s.def.kind === "dot" || s.def.kind === "hot") {
        s.tick -= dt;
        while (s.tick <= 0) { s.tick += Math.max(0.1, s.def.tick); (s.def.kind === "dot" ? onDot : onHot)(s); }
      }
    }
    this.list = this.list.filter(s => s.remaining > 0);
  }
  bonus(stat) { let b = 0; for (const s of this.list) if (s.def.kind === "statMul" && s.def.stat === stat) b += s.value * (s.def.sign || 1); return b; }
  add(stat) { let b = 0; for (const s of this.list) if (s.def.kind === "statAdd" && s.def.stat === stat) b += s.value; return b; }
  flag(id) { const s = this.get(id); return s ? (s.value || 1) : 0; }
  get stunned() { return this.list.some(s => s.def.kind === "stun"); }
  get rooted() { return this.list.some(s => s.def.kind === "root"); }
  get slow() { if (this.rooted) return 0; let f = 1; for (const s of this.list) if (s.def.kind === "slow") f = Math.min(f, 1 - clamp(s.value, 0, 0.9)); return f; }
}

export function propFootprint(p) {
  const s = p.scale > 0 ? p.scale : 1;
  const c = r => ({ r }), b = (hw, hd) => ({ hw, hd });
  switch (p.type) {
    case "tree": return c(0.45 * s); case "pine": return c(0.4 * s); case "bush": return c(0.55 * s); case "lamp": return c(0.18);
    case "barrel": return c(0.38 * s); case "crate": return b(0.4 * s, 0.4 * s); case "rock": return c(0.6 * s); case "mushroom": return c(0.45 * s); case "mushtree": return c(0.6 * s);
    case "stump": return c(0.4 * s); case "well": return c(1.0 * s); case "fountain": return c(2.5 * s); case "anvil": return b(0.45, 0.3);
    case "bench": return b(0.9 * s, 0.3 * s); case "flowerbed": return b((p.w > 0 ? p.w : 2) / 2, (p.d > 0 ? p.d : 0.8) / 2);
    case "fence": return b((p.w > 0 ? p.w : 2) / 2, 0.1); case "wall": return b((p.w > 0 ? p.w : 2) / 2, (p.d > 0 ? p.d : 0.6) / 2);
    case "ruin": return b(0.5 * s, 0.5 * s); case "stall": return b((p.w > 0 ? p.w : 3) / 2, (p.d > 0 ? p.d : 1.2) / 2);
    case "signpost": return c(0.15); case "forge": return b(0.8, 0.7); case "easel": return c(0.35); case "cauldron": return c(0.5);
  }
  return null;
}

function boxContains(b, px, pz, pad) {
  const a = -b.yaw * DEG, dx = px - b.x, dz = pz - b.z;
  const lx = dx * Math.cos(a) + dz * Math.sin(a), lz = -dx * Math.sin(a) + dz * Math.cos(a);
  const qx = Math.max(Math.abs(lx) - b.hw, 0), qz = Math.max(Math.abs(lz) - b.hd, 0);
  return qx * qx + qz * qz <= pad * pad && Math.abs(lx) <= b.hw + pad && Math.abs(lz) <= b.hd + pad;
}

// ======================================================================================= painted quarter-view art
// Painted buildings / fountain are fixed-view images. An image is placed by a ground anchor pixel (the front
// corner of the base, or the centre of the fountain's ground ellipse) and its scale in image pixels per
// screen-metre. With the game camera's orthographic projection every world point maps to one image pixel,
// so collision footprints, NPC anchors and the depth proxies are derived from the picture itself.
export function artBasis(pitchDeg = 38, yawDeg = 45) {
  const p = pitchDeg * DEG, y = yawDeg * DEG;
  return { r: { x: Math.cos(y), y: 0, z: -Math.sin(y) }, u: { x: Math.sin(y) * Math.sin(p), y: Math.cos(p), z: Math.cos(y) * Math.sin(p) }, pitch: p, yaw: y };
}
/** world point (x, y, z) -> image pixel of art a */
export function artWorldToImage(a, P, B) {
  const dx = P.x - a.pos[0], dy = (P.y || 0), dz = P.z - a.pos[1];
  const sx = dx * B.r.x + dz * B.r.z, sy = dx * B.u.x + dy * B.u.y + dz * B.u.z;
  return { px: a.anchor[0] + sx * a.ppm, py: a.anchor[1] - sy * a.ppm };
}
/** image pixel assumed on the ground plane -> world (x, z) */
export function artImageToGround(a, px, py, B) {
  const sx = (px - a.anchor[0]) / a.ppm, sy = -(py - a.anchor[1]) / a.ppm;
  const det = B.r.x * B.u.z - B.r.z * B.u.x;
  return { x: a.pos[0] + (sx * B.u.z - B.r.z * sy) / det, z: a.pos[1] + (B.r.x * sy - sx * B.u.x) / det };
}
/** ground footprint polygon (world x/z, counter-clockwise) shrunk by `inset` metres */
export function artFootprint(a, B, inset = 0) {
  let pts;
  if (a.kind === "ellipse") {
    const um = Math.hypot(B.u.x, B.u.z), ex = { x: B.r.x, z: B.r.z }, ez = { x: B.u.x / um, z: B.u.z / um }, A = a.a - inset, Bb = a.b - inset;
    pts = []; for (let i = 0; i < 40; i++) { const t = i / 40 * Math.PI * 2; pts.push({ x: a.pos[0] + ex.x * A * Math.cos(t) + ez.x * Bb * Math.sin(t), z: a.pos[1] + ex.z * A * Math.cos(t) + ez.z * Bb * Math.sin(t) }); }
    return pts;
  }
  const F = artImageToGround(a, a.F[0], a.F[1], B), L = artImageToGround(a, a.L[0], a.L[1], B), R = artImageToGround(a, a.R[0], a.R[1], B);
  pts = [F, R, { x: L.x + R.x - F.x, z: L.z + R.z - F.z }, L];
  if (inset) { const cx = pts.reduce((s, p) => s + p.x, 0) / 4, cz = pts.reduce((s, p) => s + p.z, 0) / 4; pts = pts.map(p => { const d = Math.hypot(cx - p.x, cz - p.z) || 1; return { x: p.x + (cx - p.x) / d * inset, z: p.z + (cz - p.z) / d * inset }; }); }
  return pts;
}
function polyContains(poly, x, z, pad) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  if (inside) return true;
  if (pad <= 0) return false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j], vx = b.x - a.x, vz = b.z - a.z, t = clamp01(((x - a.x) * vx + (z - a.z) * vz) / (vx * vx + vz * vz || 1));
    if (Math.hypot(x - a.x - vx * t, z - a.z - vz * t) < pad) return true;
  }
  return false;
}

export const MAX_STEP = 0.3;
const GRID_CELL = 4, GRID_PAD = 2;
export class ZoneGeometry {
  constructor(def) {
    this.def = def; [this.minX, this.minZ, this.maxX, this.maxZ] = def.bounds;
    this.circles = []; this.boxes = []; this.polys = []; this.heights = def.heights || [];
    const AB = artBasis();
    for (const a of def.imageArt || []) this.polys.push({ pts: artFootprint(a, AB, a.kind === "ellipse" ? 0.25 : 0.15), tag: "art:" + a.id });
    // 3D town: ground footprints of buildings / castle walls / towers / decor, precomputed by tools/town_castle.py
    for (const b of def.blockPolys || []) this.polys.push({ pts: b.pts.map(([x, z]) => ({ x, z })), tag: "block:" + b.id });
    for (const b of def.buildings || []) this.boxes.push({ x: b.pos[0], z: b.pos[1], hw: b.w / 2, hd: b.d / 2, yaw: b.rot, tag: "building:" + b.id });
    for (const p of def.props || []) {
      const f = propFootprint(p); if (!f) continue;
      if (f.r) this.circles.push({ x: p.pos[0], z: p.pos[1], r: f.r, tag: p.type });
      else this.boxes.push({ x: p.pos[0], z: p.pos[1], hw: f.hw, hd: f.hd, yaw: p.rot, tag: p.type });
    }
    // ponds / lakes / river pools: the shore stays walkable, the water does not
    for (const p of def.patches || []) if (p.tex === "water" && p.shape === "disc" && p.radius > 1.5) this.circles.push({ x: p.pos[0], z: p.pos[1], r: p.radius - 0.9, tag: "water" });
  }
  addCircle(x, z, r, tag) { this.circles.push({ x, z, r, tag }); this._grid = null; }
  removeTag(tag) { this.circles = this.circles.filter(c => c.tag !== tag); this.boxes = this.boxes.filter(b => b.tag !== tag); this.polys = this.polys.filter(p => p.tag !== tag); this._grid = null; }
  /** uniform bucket grid over every collider (padded by GRID_PAD so one bucket answers queries with r <= GRID_PAD);
   *  fields have thousands of trees / rocks, and blocked() runs for every nav cell and every movement sub-step */
  _index() {
    const S = GRID_CELL, P = GRID_PAD, cells = new Map(), put = (minX, minZ, maxX, maxZ, kind, o) => {
      for (let i = Math.floor((minX - P) / S); i <= Math.floor((maxX + P) / S); i++) for (let j = Math.floor((minZ - P) / S); j <= Math.floor((maxZ + P) / S); j++) {
        const k = i * 65536 + j; let b = cells.get(k); if (!b) cells.set(k, b = { c: [], b: [], p: [] }); b[kind].push(o);
      }
    };
    for (const c of this.circles) put(c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r, 'c', c);
    for (const b of this.boxes) { const e = Math.hypot(b.hw, b.hd); put(b.x - e, b.z - e, b.x + e, b.z + e, 'b', b); }
    for (const p of this.polys) { let a = 1e9, c = 1e9, d = -1e9, e = -1e9; for (const q of p.pts) { a = Math.min(a, q.x); c = Math.min(c, q.z); d = Math.max(d, q.x); e = Math.max(e, q.z); } put(a, c, d, e, 'p', p); }
    this._grid = cells; this._sig = this.circles.length + ':' + this.boxes.length + ':' + this.polys.length;
    return cells;
  }
  height(x, z) {
    let h = 0;
    for (const r of this.heights) {
      const q = r.rect; if (x < q[0] || x > q[2] || z < q[1] || z > q[3]) continue;
      let v;
      if (r.kind === "ramp") {
        let t;
        switch (r.axis) { case "+x": t = (x - q[0]) / (q[2] - q[0]); break; case "-x": t = (q[2] - x) / (q[2] - q[0]); break; case "+z": t = (z - q[1]) / (q[3] - q[1]); break; default: t = (q[3] - z) / (q[3] - q[1]); }
        v = lerp(r.heightFrom, r.height, t);
      } else v = r.height;
      if (v > h) h = v;
    }
    return h;
  }
  ground(x, z) { return { x, y: this.height(x, z), z }; }
  blocked(x, z, r) {
    if (x < this.minX + r || x > this.maxX - r || z < this.minZ + r || z > this.maxZ - r) return true;
    let C = this.circles, Bx = this.boxes, Pp = this.polys;
    if (r <= GRID_PAD) {
      if (!this._grid || this._sig !== C.length + ':' + Bx.length + ':' + Pp.length) this._index();
      const b = this._grid.get(Math.floor(x / GRID_CELL) * 65536 + Math.floor(z / GRID_CELL)); if (!b) return false;
      C = b.c; Bx = b.b; Pp = b.p;
    }
    for (const c of C) { const dx = x - c.x, dz = z - c.z, rr = c.r + r; if (dx * dx + dz * dz < rr * rr) return true; }
    for (const b of Bx) if (boxContains(b, x, z, r)) return true;
    for (const p of Pp) if (polyContains(p.pts, x, z, r)) return true;
    return false;
  }
  nearCliff(x, z, r) { const h0 = this.height(x, z); for (let a = 0; a < 8; a++) { const t = a * Math.PI / 4; if (Math.abs(this.height(x + Math.cos(t) * r, z + Math.sin(t) * r) - h0) > MAX_STEP) return true; } return false; }
  stepOk(x0, z0, x1, z1, r) {
    const h1 = this.height(x1, z1); if (Math.abs(h1 - this.height(x0, z0)) > MAX_STEP) return false;
    const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz); if (l < 1e-6 || r <= 0) return true;
    return Math.abs(this.height(x1 + dx / l * r, z1 + dz / l * r) - h1) <= MAX_STEP;
  }
  move(p, dx, dz, r) {
    let x = p.x, z = p.z;
    const len = Math.hypot(dx, dz), steps = Math.max(1, Math.ceil(len / 0.08)), sx = dx / steps, sz = dz / steps;
    let escaping = this.blocked(x, z, r);
    for (let i = 0; i < steps; i++) {
      if (escaping) { if (Math.abs(this.height(x + sx, z + sz) - this.height(x, z)) > MAX_STEP) break; x += sx; z += sz; escaping = this.blocked(x, z, r); continue; }
      const nx = x + sx, nz = z + sz;
      if (!this.blocked(nx, nz, r) && this.stepOk(x, z, nx, nz, r)) { x = nx; z = nz; continue; }
      let moved = false;
      if (Math.abs(sx) > 1e-5 && !this.blocked(x + sx, z, r) && this.stepOk(x, z, x + sx, z, r)) { x += sx; moved = true; }
      if (Math.abs(sz) > 1e-5 && !this.blocked(x, z + sz, r) && this.stepOk(x, z, x, z + sz, r)) { z += sz; moved = true; }
      if (!moved) break;
    }
    return { x, y: this.height(x, z), z };
  }
  nearestFree(x, z, r) {
    if (!this.blocked(x, z, r)) return this.ground(x, z);
    for (let rad = 0.25; rad < 8; rad += 0.25) for (let a = 0; a < 16; a++) { const t = a * Math.PI / 8, px = x + Math.cos(t) * rad, pz = z + Math.sin(t) * rad; if (!this.blocked(px, pz, r)) return this.ground(px, pz); }
    return this.ground(x, z);
  }
  /** ray (Unity coords) vs height field */
  raycast(o, d) {
    const m = Math.hypot(d.x, d.y, d.z); d = { x: d.x / m, y: d.y / m, z: d.z / m };
    if (d.y > -1e-4) return null;
    const t0 = Math.max(0, (o.y - 6) / -d.y); let prev = t0;
    for (let t = t0 + 0.05; t < t0 + 400; t += 0.05) {
      const px = o.x + d.x * t, py = o.y + d.y * t, pz = o.z + d.z * t;
      if (py - this.height(px, pz) <= 0) {
        let lo = prev, hi = t;
        for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (o.y + d.y * mid - this.height(o.x + d.x * mid, o.z + d.z * mid) > 0) lo = mid; else hi = mid; }
        const x = o.x + d.x * hi, z = o.z + d.z * hi; return { x, y: this.height(x, z), z };
      }
      prev = t;
    }
    return null;
  }
  lineFree(a, b, r) {
    const len = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(len / 0.2)); let px = a.x, pz = a.z;
    for (let i = 1; i <= n; i++) { const t = i / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t; if (this.blocked(x, z, r) || !this.stepOk(px, pz, x, z, r)) return false; px = x; pz = z; }
    return true;
  }
}

export class NavGrid {
  constructor(geo, radius, cell = 0.5) {
    this.geo = geo; this.cell = cell; this.r = radius;
    this.W = Math.ceil((geo.maxX - geo.minX) / cell); this.H = Math.ceil((geo.maxZ - geo.minZ) / cell);
    this.walk = new Uint8Array(this.W * this.H); this.h = new Float32Array(this.W * this.H);
    for (let j = 0; j < this.H; j++) for (let i = 0; i < this.W; i++) {
      const c = this.center(i, j), k = i + j * this.W;
      this.walk[k] = !geo.blocked(c.x, c.z, radius) && !geo.nearCliff(c.x, c.z, radius) ? 1 : 0;
      this.h[k] = geo.height(c.x, c.z);
    }
  }
  center(i, j) { return { x: this.geo.minX + (i + 0.5) * this.cell, z: this.geo.minZ + (j + 0.5) * this.cell }; }
  cellOf(x, z) { return [Math.floor((x - this.geo.minX) / this.cell), Math.floor((z - this.geo.minZ) / this.cell)]; }
  ok(i, j) { return i >= 0 && j >= 0 && i < this.W && j < this.H && this.walk[i + j * this.W] === 1; }
  conn(i0, j0, i1, j1) {
    if (!this.ok(i1, j1)) return false;
    if (Math.abs(this.h[i0 + j0 * this.W] - this.h[i1 + j1 * this.W]) > MAX_STEP) return false;
    if (i0 !== i1 && j0 !== j1 && (!this.ok(i1, j0) || !this.ok(i0, j1))) return false;
    return true;
  }
  nearestOk(x, z) {
    let [ci, cj] = this.cellOf(x, z); if (this.ok(ci, cj)) return [ci, cj];
    for (let r = 1; r < 12; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { if (Math.abs(di) !== r && Math.abs(dj) !== r) continue; if (this.ok(ci + di, cj + dj)) return [ci + di, cj + dj]; }
    return null;
  }
  findPath(from, to) {
    const s = this.nearestOk(from.x, from.z), t = this.nearestOk(to.x, to.z); if (!s || !t) return [];
    const W = this.W, start = s[0] + s[1] * W, goal = t[0] + t[1] * W;
    const g = new Map([[start, 0]]), came = new Map(), closed = new Uint8Array(W * this.H);
    const heap = []; const push = (k, f) => { heap.push([f, k]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top[1]; };
    const hh = (i, j) => { const dx = Math.abs(i - t[0]), dy = Math.abs(j - t[1]); return dx + dy + (1.4142 - 2) * Math.min(dx, dy); };
    push(start, hh(s[0], s[1])); let found = false, n = 0;
    while (heap.length && n < 30000) {
      const c = pop(); if (c === goal) { found = true; break; } if (closed[c]) continue; closed[c] = 1; n++;
      const i = c % W, j = (c / W) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue; const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= this.H) continue;
        const k = ni + nj * W; if (closed[k] || !this.conn(i, j, ni, nj)) continue;
        const cost = g.get(c) + (di && dj ? 1.4142 : 1); const old = g.get(k);
        if (old !== undefined && old <= cost) continue; g.set(k, cost); came.set(k, c); push(k, cost + hh(ni, nj));
      }
    }
    if (!found) return [];
    const cells = []; for (let c = goal; c !== start; c = came.get(c)) cells.push(c); cells.reverse();
    const pts = cells.map(c => { const p = this.center(c % W, (c / W) | 0); return this.geo.ground(p.x, p.z); });
    if (pts.length && !this.geo.blocked(to.x, to.z, this.r)) pts[pts.length - 1] = this.geo.ground(to.x, to.z);
    // smoothing
    const res = []; let anchor = from, k = 0;
    while (k < pts.length) { let far = k; for (let m = pts.length - 1; m > k; m--) if (this.geo.lineFree(anchor, pts[m], this.r * 0.95)) { far = m; break; } res.push(pts[far]); anchor = pts[far]; k = far + 1; }
    return res;
  }
}
