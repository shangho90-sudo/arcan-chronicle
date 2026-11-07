// Port of ArcanChronicle/Assets/Arcan/Editor/Tests/ArcanSelfTests.cs to JavaScript, run against js/core.js.
// Run: node tests/core.test.mjs   (exit code 1 if any check fails)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// ---- minimal in-memory localStorage shim (SaveStore uses window.localStorage) -------------------------
const mem = new Map();
globalThis.window = {
  localStorage: {
    getItem: k => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: k => { mem.delete(k); },
    clear: () => mem.clear(),
  },
};

const core = await import("../js/core.js");
const { GameData, CharacterSheet, QuestLog, QS, Shop, CombatMath, HitShape, StatusSet, ZoneGeometry, NavGrid, SaveStore, newProfile, migrate, SAVE_VERSION, DEG } = core;

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "assets", "data");
const FILES = ["config", "levels", "jobs", "skills", "skills2", "items", "monsters", "quests", "npcs", "zones"];

let pass = 0, fail = 0;
const skipped = [];
function Ok(cond, name) {
  if (cond) { pass++; console.log("PASS: " + name); }
  else { fail++; console.log("FAIL: " + name); }
}
function Eq(a, b, name) { Ok(a === b, name + " (expected " + b + ", got " + a + ")"); }
function Info(s) { console.log("     " + s); }
function Skip(name, reason) { skipped.push({ name, reason }); console.log("SKIP: " + name + " -- " + reason); }

function LoadData() {
  const files = {};
  for (const n of FILES) files[n] = JSON.parse(readFileSync(join(dataDir, n + ".json"), "utf8"));
  return new GameData(files);
}

// C# PlayerProfile field defaults (new PlayerProfile { ... })
function PlayerProfile(init) {
  return Object.assign({
    version: SAVE_VERSION, saveTime: null, playTime: 0, name: "모험가", gender: "m", job: "novice", level: 1, exp: 0, gold: 0, hp: -1, sp: -1,
    inventory: [], weapon: "", armor: "", accessory: "", learnedSkills: [], jobsUnlocked: [], quests: [], flags: [],
    zone: "town", hasPos: false, posX: 0, posY: 0, posZ: 0, facing: 0, returnZone: "town", returnSpawn: "start",
  }, init);
}
const hasFlag = (p, f) => (p.flags || []).includes(f);
const setFlag = (p, f) => { if (!hasFlag(p, f)) p.flags = [...(p.flags || []), f]; };

// ---------------------------------------------------------------------------------------------------
function TestData() {
  const d = LoadData();
  const errs = d.validate();
  for (const e of errs) console.log("   data: " + e);
  Eq(errs.length, 0, "data validates");
  let basic = 0;
  for (const j of d.jobList) if (j.tier === 1 && j.implemented) basic++;
  Eq(basic, 5, "5 implemented base jobs");
  let second = 0;
  for (const j of d.jobList) if (j.tier === 2) { second++; Ok(j.implemented && !!j.trialQuest, "2nd job " + j.id + " implemented with a trial"); }
  Eq(second, 7, "7 planned 2nd jobs");
  Ok(Object.keys(d.monsters).length >= 4, ">= 3 monsters + boss");
  Ok(d.questList.length >= 5, ">= 5 quests");
  Eq(d.levels.maxLevel, 50, "max level 50");
  for (const s of Object.values(d.skills)) {
    if (!s.implemented || s.kind === "passive") continue;
    Ok(s.cost >= 0 && s.cooldown >= 0, s.id + " cost/cooldown >= 0");
    for (const a of s.actions)
      if (a.type === "damage") Ok(a.coef > 0 && (a.radius > 0 || a.length > 0), s.id + " damage action has size");
  }
}

function NewChar(d, job = null) {
  const p = newProfile(d, "테스트", "m");
  const ch = new CharacterSheet(d, p);
  if (job != null) { ch.p.level = Math.max(ch.p.level, 10); ch.book.grantPoints(); ch.recalc(); Ok(ch.chooseJob(job) == null, "choose job " + job); }
  return ch;
}

function TestInventory() {
  const d = LoadData();
  const ch = NewChar(d);
  const bag = ch.bag;
  Eq(bag.slots.length, 30, "capacity 30");
  Eq(bag.count("c_potion_s"), 3, "start potions");
  Eq(bag.add("c_potion_s", 60), 60, "add 60 potions");
  Eq(bag.count("c_potion_s"), 63, "count 63 (stacks of 50)");
  Ok(!bag.remove("c_potion_s", 64), "cannot remove more than owned");
  Eq(bag.count("c_potion_s"), 63, "failed removal changed nothing");
  Ok(bag.remove("c_potion_s", 63), "remove all");
  Eq(bag.count("c_potion_s"), 0, "count 0");
  for (const s of bag.slots) Ok(s.count >= 0, "no negative counts");
  Eq(bag.add("nonexistent", 3), 0, "unknown item not added");
  Eq(bag.add("c_potion_s", 0), 0, "add 0");
  Eq(bag.add("c_potion_s", -5), 0, "add negative");
  let added = 0;
  for (let i = 0; i < 40; i++) added += bag.add("w_knife_1", 1);
  let free = 0; for (const s of bag.slots) if (!s.id || !(s.count > 0)) free++;
  Eq(free, 0, "bag full");
  Ok(added <= 30, "never more than capacity");
  Ok(!bag.tryAddAll("c_potion_s", 1), "TryAddAll fails when full");
  let slot = -1; for (let i = 0; i < bag.slots.length; i++) if (bag.slots[i].id === "w_knife_1") { slot = i; break; }
  Ok(bag.equipFromSlot(slot) != null, "novice cannot equip cook knife");
  ch.p.job = "cook"; ch.recalc();
  const prevWeapon = ch.p.weapon;
  Ok(bag.equipFromSlot(slot) == null, "cook equips knife from full bag (swap)");
  Eq(ch.p.weapon, "w_knife_1", "weapon equipped");
  Eq(bag.slots[slot].id, prevWeapon, "previous weapon swapped into the slot");
  Ok(bag.unequip("armor") != null, "unequip empty slot fails");
  Ok(bag.unequip("weapon") != null, "unequip with full bag fails");
  Eq(ch.p.weapon, "w_knife_1", "weapon still equipped after failed unequip");
  const p2 = PlayerProfile({ inventory: [{ id: "c_potion_s", count: 999 }, { id: "bogus", count: 3 }, { id: "m_jelly", count: -4 }], weapon: "c_potion_s" });
  const ch2 = new CharacterSheet(d, p2);
  Eq(ch2.bag.count("c_potion_s"), 50, "overfull stack clamped to max");
  Eq(ch2.bag.count("bogus"), 0, "unknown removed");
  Eq(ch2.bag.count("m_jelly"), 0, "negative removed");
  Eq(p2.weapon, "", "invalid equipped weapon removed");
}

function TestShop() {
  const d = LoadData();
  const ch = NewChar(d);
  const shop = d.shops["shop_general"];
  const gold = ch.p.gold;
  Ok(Shop.buy(ch, shop, "c_potion_s", 2) == null, "buy 2 potions");
  Eq(ch.p.gold, gold - 50, "gold spent");
  Eq(ch.bag.count("c_potion_s"), 5, "potions added");
  Ok(Shop.buy(ch, shop, "c_potion_s", 1000) != null, "cannot buy beyond gold");
  Ok(Shop.buy(ch, shop, "w_hammer_2", 1) != null, "item not sold in this shop");
  Ok(Shop.buy(ch, shop, "c_potion_s", -1) != null, "negative quantity rejected");
  Eq(ch.p.gold, gold - 50, "failed purchases changed nothing");
  let slot = -1; for (let i = 0; i < ch.bag.slots.length; i++) if (ch.bag.slots[i].id === "c_potion_s") { slot = i; break; }
  Ok(Shop.sell(ch, slot, 2) == null, "sell 2");
  Eq(ch.p.gold, gold - 50 + 16, "sell price added");
  Ok(Shop.sell(ch, slot, 10) != null, "cannot sell more than stack");
  Eq(ch.bag.count("c_potion_s"), 3, "remaining 3");
  ch.p.gold = 100000;
  for (let i = 0; i < 40; i++) ch.bag.add("w_brush_1", 1);
  const g2 = ch.p.gold;
  Ok(Shop.buy(ch, d.shops["shop_smithy"], "w_hammer_1", 1) != null, "full bag refuses purchase");
  Eq(ch.p.gold, g2, "no gold lost on refused purchase");
}

function TestStats() {
  const d = LoadData();
  const ch = NewChar(d, "blacksmith");
  const atk0 = ch.final.atk, def0 = ch.final.def;
  ch.bag.add("w_hammer_2", 1);
  ch.p.level = 5; ch.recalc();
  const atkL5 = ch.final.atk; const defL5 = ch.final.def;
  let slot = -1; for (let i = 0; i < ch.bag.slots.length; i++) if (ch.bag.slots[i].id === "w_hammer_2") slot = i;
  Ok(ch.bag.equipFromSlot(slot) == null, "equip steel hammer");
  Ok(Math.abs(ch.final.atk - (atkL5 + 16 - 3)) < 0.01, "atk reflects hammer (+16) replacing stick (+3): " + ch.final.atk);
  Ok(ch.final.def >= defL5, "def not reduced"); void def0;
  Ok(ch.bag.unequip("weapon") == null, "unequip");
  Ok(Math.abs(ch.final.atk - (atkL5 - 3)) < 0.01, "atk back without weapon");
  const ch2 = NewChar(d, "blacksmith"); ch2.p.level = 20; ch2.book.grantPoints(); ch2.recalc();
  const def20 = ch2.final.def, hp20 = ch2.final.maxHp;
  Ok(ch2.book.learn("bs1_b5") == null, "learn passive 강철 체력");
  Ok(Math.abs(ch2.final.def - (def20 + 3)) < 0.01, "passive +3 def at Lv1: " + ch2.final.def);
  Ok(Math.abs(ch2.final.maxHp - hp20 * 1.05) < 0.6, "passive +5% max hp");
  const hd = NewChar(d, "hairdresser"), bs = NewChar(d, "blacksmith"), ar = NewChar(d, "artist");
  Ok(hd.final.moveSpeed > bs.final.moveSpeed, "hairdresser faster than blacksmith");
  Ok(bs.final.maxHp > hd.final.maxHp, "blacksmith tankier");
  Ok(ar.final.matk > bs.final.matk * 2, "artist magic");
  void atk0;
}

function TestLeveling() {
  const d = LoadData();
  const ch = NewChar(d, "cook");
  let levels = 0; ch.events.levelUp.push(() => levels++);
  const gained = ch.addExp(10000000);
  Eq(ch.p.level, 50, "capped at 50");
  Eq(gained, 40, "40 level ups from Lv10");
  Eq(levels, 40, "40 events");
  Eq(ch.p.exp, 0, "exp 0 at max");
  Eq(ch.book.sk.points, 5 + 40, "points: 5 at Lv10 + 1 per level 11..50");
  Eq(ch.addExp(500), 0, "no more levels");
  Ok(ch.final.maxHp > CharacterSheet.baseStats(d.job("cook"), 1).maxHp * 2, "hp grows with level");
  Eq(ch.p.hp, ch.final.maxHp, "level up restores hp");
  let total = 0; for (let l = 1; l < 15; l++) total += d.expToNext(l);
  Info("total exp to Lv15: " + total);

}

function TestJobs() {
  const d = LoadData();
  // v3 advancement: novice -> 1st job at Lv10 -> 2nd job at Lv30 after the trial; no free job change
  const n = new CharacterSheet(d, newProfile(d, "견습", "f"));
  Ok(n.chooseJob("artist") != null, "Lv1 cannot advance");
  n.p.level = 10; n.recalc();
  Ok(n.chooseJob("painter") != null, "novice cannot take a 2nd job");
  Ok(n.chooseJob("artist") == null, "Lv10 -> artist");
  Ok(n.chooseJob("artist") != null, "same job rejected");
  Ok(n.chooseJob("cook") != null, "no free job change");
  n.p.level = 30; n.recalc();
  const nq = new QuestLog(d, n);
  Ok(n.chooseJob("painter") != null, "2nd job needs the trial");
  Ok(n.chooseJob("chef") != null, "other line's 2nd job rejected");
  n.p.quests.push({ id: "qt_painter", state: "completed", counts: [1, 30] });
  Ok(n.chooseJob("painter") == null, "trial done -> painter");
  Ok(n.chooseJob("musician") != null, "other branch locked after choosing");
  void nq;
  const k = NewChar(d, "cook");
  k.bag.add("w_knife_1", 1);
  let s = -1; for (let i = 0; i < k.bag.slots.length; i++) if (k.bag.slots[i].id === "w_knife_1") s = i;
  Ok(k.bag.equipFromSlot(s) == null, "equip knife");
  Ok(k.chooseJob("artist") != null, "no change from cook to artist");
  Eq(k.p.weapon, "w_knife_1", "knife stays equipped");
}

function TestQuests() {
  const d = LoadData();
  const ch = NewChar(d);
  const q = new QuestLog(d, ch);
  const q1 = d.quests["q1_start"];
  Eq(q.stateOf(q1), QS.Available, "q1 available");
  Eq(q.stateOf(d.quests["q3_slime"]), QS.Locked, "q3 locked");
  Ok(q.accept("q1_start"), "accept q1");
  Ok(!q.accept("q1_start"), "cannot accept twice");
  Eq(q.stateOf(q1), QS.Active, "q1 active");
  Ok(q.complete("q1_start") != null, "cannot complete early");
  q.notify("talk", "master_blacksmith", 1);
  Eq(q.stateOf(q1), QS.Completable, "q1 completable after talking to the smith");
  const gold = ch.p.gold, pots = ch.bag.count("c_potion_s");
  Ok(q.complete("q1_start") == null, "complete q1");
  Eq(ch.p.gold, gold + 50, "gold reward");
  Eq(ch.bag.count("c_potion_s"), pots + 5, "item reward");
  Ok(q.complete("q1_start") != null, "cannot complete twice (no duplicate reward)");
  Eq(ch.p.gold, gold + 50, "still single reward");
  Ok(q.accept("q3_slime"), "accept q3");
  for (let i = 0; i < 10; i++) q.notify("kill", "mon_slime", 1);
  Eq(q.current(d.quests["q3_slime"], 0), 6, "kill count capped at 6");
  Ok(q.complete("q3_slime") == null, "complete q3");
  ch.addExp(200);
  Ok(q.accept("q4_spore"), "accept q4");
  ch.bag.add("m_spore", 3);
  Eq(q.stateOf(d.quests["q4_spore"]), QS.Active, "3/5");
  ch.bag.add("m_spore", 4);
  Eq(q.stateOf(d.quests["q4_spore"]), QS.Completable, "7/5");
  Ok(q.complete("q4_spore") == null, "complete q4");
  Eq(ch.bag.count("m_spore"), 2, "5 spores consumed, 2 left");
  ch.addExp(300); ch.p.level = Math.max(ch.p.level, 10); ch.recalc();
  Ok(q.accept("q_job1") && ch.chooseJob("pharmacist") == null && q.complete("q_job1") == null, "1st advancement");
  Ok(q.accept("q5_gear"), "accept q5");
  Eq(q.stateOf(d.quests["q5_gear"]), QS.Active, "no tier2 weapon yet");
  ch.bag.add("w_pestle_2", 1);
  let s = -1; for (let i = 0; i < ch.bag.slots.length; i++) if (ch.bag.slots[i].id === "w_pestle_2") s = i;
  Ok(ch.bag.equipFromSlot(s) == null, "equip pestle 2 (lv " + ch.p.level + ")");
  Eq(q.stateOf(d.quests["q5_gear"]), QS.Completable, "equip objective met");
  Ok(q.complete("q5_gear") == null, "complete q5");
  const ch2 = NewChar(d, "cook"); const ql2 = new QuestLog(d, ch2);
  ql2.accept("q1_start"); ql2.notify("talk", "master_blacksmith", 1);
  ch2.bag.remove("c_potion_s", ch2.bag.count("c_potion_s"));
  for (let i = 0; i < 40; i++) ch2.bag.add("w_knife_1", 1);
  Ok(ql2.complete("q1_start") != null, "reward refused when bag is full");
  Eq(ql2.stateOf(d.quests["q1_start"]), QS.Completable, "quest stays completable");
}

function TestSave() {
  // C# SaveSystem(dir) writes files; the web port's SaveStore writes window.localStorage (shimmed above).
  // Slot 0 -> key "arcan_save_0"; PathFor(0) -> that key.
  const d = LoadData();
  const ch = NewChar(d, "artist");
  const ql = new QuestLog(d, ch);
  ql.accept("q1_start"); ql.notify("talk", "master_blacksmith", 1); ql.complete("q1_start"); ql.accept("q3_slime"); ql.notify("kill", "mon_slime", 4);
  ch.addExp(150); ch.bag.add("m_jelly", 7); ch.p.zone = "forest"; ch.p.hasPos = true; ch.p.posX = 3.5; ch.p.posZ = -7.25;
  setFlag(ch.p, "boss_dead");
  mem.clear();
  const ss = new SaveStore("arcan_save_0");
  Ok(ss.save(ch.p), "save");
  Ok(ss.exists(), "exists");
  const p2 = ss.load();
  Ok(p2 != null, "load");
  Eq(p2.version, SAVE_VERSION, "version");
  Eq(p2.name, "테스트", "korean name roundtrip");
  Eq(p2.job, "artist", "job");
  Eq(p2.level, ch.p.level, "level");
  Eq(p2.exp, ch.p.exp, "exp");
  Eq(p2.gold, ch.p.gold, "gold");
  Eq(p2.zone, "forest", "zone");
  Ok(Math.abs(p2.posX - 3.5) < 1e-4 && Math.abs(p2.posZ + 7.25) < 1e-4, "position");
  Ok(hasFlag(p2, "boss_dead"), "flags");
  const ch2 = new CharacterSheet(d, p2);
  const ql2 = new QuestLog(d, ch2);
  Eq(ch2.bag.count("m_jelly"), 7, "inventory");
  Eq(ql2.current(d.quests["q3_slime"], 0), 4, "quest progress");
  Ok(ql2.isCompleted("q1_start"), "completed quest");
  Eq(p2.learnedSkills.length, ch.p.learnedSkills.length, "learned skills");
  Eq(ch2.final.matk, ch.final.matk, "stats identical after load");
  Ok(ss.save(ch.p), "second save (creates .bak)");
  window.localStorage.setItem(ss.key, "{ broken json");
  const p3 = ss.load();
  Ok(p3 != null && p3.job === "artist", "backup restored after corruption");
  // SaveSystem.Deserialize = JsonUtility.FromJsonOverwrite onto a default PlayerProfile + Migrate
  const v1 = "{\"version\":1,\"name\":\"옛날\",\"gender\":\"f\",\"job\":\"cook\",\"level\":3,\"exp\":10,\"gold\":-50,\"inventory\":[{\"id\":\"c_potion_s\",\"count\":2}]}";
  const p4 = migrate(JSON.parse(v1));
  Eq(p4.version, SAVE_VERSION, "migrated version");
  Eq(p4.gold, 0, "negative gold repaired");
  Eq(p4.returnZone, "town", "return zone default");
  const ch4 = new CharacterSheet(d, p4);
  Eq(ch4.bag.count("c_potion_s"), 2, "v1 inventory kept");
  // v3 -> v4: fields were enlarged, so a saved field position is dropped (town positions kept)
  const pf = migrate({ version: 3, zone: "forest", hasPos: true, posX: 10, posZ: 5 }), pt = migrate({ version: 3, zone: "town", hasPos: true, posX: 1, posZ: 2 });
  Ok(pf.hasPos === false && pt.hasPos === true, "v4 migration drops field positions only");
  ss.remove();
  Ok(!ss.exists(), "deleted");
}

// --- small 2D vector helpers for the shape tests --------------------------------------------------
const V = (x, y) => ({ x, y });
function TestShapes() {
  const c = HitShape.circle(0, 0, 2);
  Ok(c.overlaps(2.2, 0, 0.3), "circle edge with radius");
  Ok(!c.overlaps(2.4, 0, 0.3), "circle outside");
  const cone = HitShape.cone(0, 0, 0, 1, 3, 90);
  Ok(cone.overlaps(0, 2.9, 0), "cone front");
  Ok(!cone.overlaps(0, -1, 0.2), "cone behind");
  Ok(cone.overlaps(1.9, 1.9, 0), "cone 45deg edge");
  Ok(!cone.overlaps(2.2, 0.8, 0), "cone outside angle");
  const rect = HitShape.rect(0, 0, 1, 0, 2, 4);
  Ok(rect.overlaps(3.9, 0.9, 0), "rect inside");
  Ok(!rect.overlaps(4.5, 0, 0.3), "rect beyond length");
  Ok(!rect.overlaps(-0.5, 0, 0.3), "rect behind");
  const ring = HitShape.ring(0, 0, 2, 4);
  Ok(ring.overlaps(3, 0, 0) && !ring.overlaps(1, 0, 0), "ring");
  const shapes = [HitShape.circle(1, 2, 3.6), HitShape.cone(-2, 0, 1, 1, 3.4, 100), HitShape.rect(0, 0, 0, -1, 2.2, 5)];
  let mism = 0;
  for (const s of shapes) for (const p of TelegraphSamples(s)) if (!s.overlaps(p.x, p.y, 0)) mism++;
  Eq(mism, 0, "telegraph samples inside hit shape");
}

/** Points that the telegraph renderer fills (same parametrisation as the C# test helper / TelegraphMesh). */
function* TelegraphSamples(s) {
  const f = Math.fround;
  const right = V(s.fz, -s.fx);
  switch (s.kind) {
    case "circle":
      for (let a = 0; a < 48; a++) for (let r = 0; r <= f(0.999); r = f(r + f(0.1))) {
        const t = a / 48 * Math.PI * 2; yield V(s.cx + Math.cos(t) * (s.r * r), s.cz + Math.sin(t) * (s.r * r));
      }
      break;
    case "cone":
      for (let a = 0; a <= 24; a++) for (let r = 0; r <= f(0.999); r = f(r + f(0.1))) {
        const ang = (-s.half + (2 * s.half) * (a / 24)) * DEG;
        const dx = s.fx * Math.cos(ang) + right.x * Math.sin(ang), dz = s.fz * Math.cos(ang) + right.y * Math.sin(ang);
        yield V(s.cx + dx * (s.r * r), s.cz + dz * (s.r * r));
      }
      break;
    case "rect":
      for (let u = f(-0.999); u <= f(0.999); u = f(u + f(0.1))) for (let v = 0; v <= f(0.999); v = f(v + f(0.05)))
        yield V(s.cx + right.x * (s.hw * u) + s.fx * (s.len * v), s.cz + right.y * (s.hw * u) + s.fz * (s.len * v));
      break;
  }
}

function TestCombat() {
  const r = CombatMath.compute(100, 1, 0, 0, 0, 0, 0.9, 0.5);
  Eq(r.amount, 100, "base damage");
  const r2 = CombatMath.compute(100, 1, 100, 0, 0, 0, 0.9, 0.5);
  Eq(r2.amount, 50, "def 100 halves");
  const r3 = CombatMath.compute(100, 1, 0, 1, 0.5, 0, 0, 0.5);
  Ok(r3.crit && r3.amount === 200, "crit x2 with +0.5");
  const r4 = CombatMath.compute(100, 1, 0, 0, 0, 0.4, 0.9, 0.5);
  Eq(r4.amount, 60, "40% reduction");
  Eq(CombatMath.compute(1, 0.01, 999, 0, 0, 0.8, 0.9, 0).amount, 1, "min 1 damage");
  if (typeof CombatMath.absorbShield === "function") {
    const ref = { v: 30 }; const rest = CombatMath.absorbShield(ref, 50);
    Ok(ref.v === 0 && rest === 20, "shield absorbs");
  } else Skip("Combat math / shield absorbs", "CombatMath.AbsorbShield(ref float, float) has no equivalent in core.js (shield absorption is inlined in actors.js Actor.damage)");
  Eq(CombatMath.heal(30, 0.2, 200, 0.3), 91, "heal with healPower");
}

function TestStatus() {
  const d = LoadData();
  const set = new StatusSet();
  set.apply(d.status("poison"), 3, 5);
  set.apply(d.status("poison"), 2, 3);
  Eq(set.list.length, 1, "poison does not stack");
  Eq(set.list[0].value, 5, "keeps stronger value");
  let ticks = 0;
  for (let i = 0; i < 400; i++) set.tick(0.01, s => ticks++, null);
  Eq(ticks, 6, "3s / 0.5s = 6 ticks");
  Eq(set.list.length, 0, "expired");
  set.apply(d.status("slow"), 1, 0.4);
  Ok(Math.abs(set.slow - 0.6) < 1e-4, "slow 40%");
  set.apply(d.status("well_fed"), 1, 0.2);
  Ok(Math.abs(set.bonus("atk") - 0.2) < 1e-4, "atk bonus");
  set.removeDebuffs();
  Ok(!set.has("slow") && set.has("well_fed"), "cleanse removes only debuffs");
}

// LayoutValidator.DoorPoint / LocalToWorld (C# World/LayoutValidator.cs) -- pure formula, not in core.js; ported verbatim here.
function DoorPoint(b, outward) {
  const a = b.rot * DEG, lx = b.doorX || 0, lz = b.d * 0.5 + outward;
  return V(b.pos[0] + lx * Math.cos(a) + lz * Math.sin(a), b.pos[1] - lx * Math.sin(a) + lz * Math.cos(a));
}
const fmt3 = p => "(" + p.x.toFixed(2) + ", " + p.y.toFixed(2) + ", " + p.z.toFixed(2) + ")";

function TestGeometry() {
  const d = LoadData();
  const town = new ZoneGeometry(d.zones["town"]);
  Eq(town.height(0, 0), 0, "plaza height 0");
  // town v0.3: 3D castle town (blockPolys footprints from tools/town_castle.py), no terrace
  const blocks = d.zones["town"].blockPolys || [];
  Ok(blocks.length > 20, "town has building / wall footprints: " + blocks.length);
  Eq((d.zones["town"].buildings || []).length, 0, "no legacy box buildings left");
  const c = town.move({ x: 0, y: 0, z: -10 }, 0, 6, 0.32);
  Ok(c.z < -5.0, "fountain basin blocks: z=" + c.z.toFixed(2));
  Ok(!town.blocked(0, -9.5, 0.32), "walkway south of fountain is free");
  Ok(town.blocked(0, 0, 0.32), "fountain centre blocked");
  for (const id of ["bakery", "smithy", "pharmacy", "general", "dress", "arms", "wall_n", "wall_s1", "gate_t0"]) {
    const bp = blocks.find(q => q.id === id); Ok(!!bp, id + " footprint present"); if (!bp) continue;
    const cx = bp.pts.reduce((s, p) => s + p[0], 0) / bp.pts.length, cz = bp.pts.reduce((s, p) => s + p[1], 0) / bp.pts.length;
    Ok(town.blocked(cx, cz, 0.32), id + " footprint centre blocked");
  }
  Ok(!town.blocked(3.0, -22.6, 0.32), "gate opening is passable");
  // Quaternion.Euler(38, 45, 0) * Vector3.forward  (Unity applies Z, then X, then Y)
  const pitch = 38 * DEG, yaw = 45 * DEG;
  const dir = { x: Math.sin(yaw) * Math.cos(pitch), y: -Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) };
  const sub = (p, k) => ({ x: p.x - dir.x * k, y: p.y - dir.y * k, z: p.z - dir.z * k });
  const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
  const target2 = { x: 4, y: 0, z: -8 };
  const hit = town.raycast(sub(target2, 30), dir);
  Ok(hit != null && dist(hit, target2) < 0.05, "raycast plaza " + (hit ? fmt3(hit) : "null"));
  const nav = new NavGrid(town, 0.32);
  const npcs = d.zones["town"].npcs || [];
  for (const n of npcs.filter(q => q.building)) {
    const path = nav.findPath({ x: -1, y: 0, z: -10.8 }, { x: n.pos[0], y: 0, z: n.pos[1] });
    Ok(path.length > 0, "path from spawn to " + n.building + " entrance");
    let pos = { x: -1, y: 0, z: -10.8 };
    for (const p of path) pos = town.move(pos, p.x - pos.x, p.z - pos.z, 0.32);
    Ok(Math.hypot(pos.x - n.pos[0], pos.z - n.pos[1]) < 0.6, "walking reaches " + n.npc + " " + fmt3(pos));
  }
  const forest = new ZoneGeometry(d.zones["forest"]);
  const fnav = new NavGrid(forest, 0.32);
  const fp = fnav.findPath({ x: -31.5, y: 0, z: -28.5 }, { x: 26, y: 1.6, z: 22 });
  Ok(fp.length > 0, "forest path to boss arena");
}

function TestLayouts() {
  const d = LoadData();
  for (const z of Object.values(d.zones))
    Skip("Layouts / " + z.id + " layout valid", "LayoutValidator.Validate (C# World/LayoutValidator.cs) has no equivalent in core.js");
}

function TimeToKill(d, ch, m) {
  const job = ch.job;
  const basic = d.skill(job.basicAttack);
  const a = basic.actions[0];
  const power = a.power === "matk" ? ch.final.matk : ch.final.atk;
  const hit = CombatMath.compute(power, a.coef, m.def, 0, 0, 0, 1, 0.5).amount;
  const interval = basic.cooldown / ch.final.atkSpeed;
  let dps = hit / interval;
  const s1 = ch.hotbar()[0];
  if (s1) for (const act of s1.actions)
    if (act.type === "damage") {
      const p2 = act.power === "matk" ? ch.final.matk : ch.final.atk;
      dps += CombatMath.compute(p2, act.coef, m.def, 0, 0, 0, 1, 0.5).amount * Math.max(1, act.hits | 0) / Math.max(1, s1.cooldown);
    }
  const monHit = CombatMath.compute(m.atk, m.ai === "heavy" ? 1.6 : 1, ch.final.def, 0, 0, ch.final.dmgReduce, 1, 0.5).amount;
  return { tk: m.hp / dps, dt: monHit / m.attackCooldown };
}

function TestBalance() {
  const d = LoadData();
  const pad = (s, n) => (s + " ".repeat(n)).slice(0, Math.max(n, s.length));
  for (const j of ["pharmacist", "cook", "blacksmith", "hairdresser", "artist"]) {
    const ch = NewChar(d, j); ch.p.level = 2; ch.recalc();
    let r = TimeToKill(d, ch, d.monsters["mon_slime"]);
    Info(`${pad(j, 11)} Lv2  rabbit: ${r.tk.toFixed(1)}s to kill, takes ${r.dt.toFixed(1)} dps (hp ${ch.final.maxHp.toFixed(0)})`);
    Ok(r.tk > 0.5 && r.tk < 6, j + " rabbit TTK sane");
    ch.p.level = 7; ch.recalc();
    r = TimeToKill(d, ch, d.monsters["mon_golem"]);
    Info(`${pad(j, 11)} Lv7  golem: ${r.tk.toFixed(1)}s to kill, takes ${r.dt.toFixed(1)} dps (hp ${ch.final.maxHp.toFixed(0)})`);
    Ok(r.tk > 3 && r.tk < 25, j + " golem TTK sane");
    ch.p.level = 10; ch.recalc();
    r = TimeToKill(d, ch, d.monsters["boss_mushroom"]);
    Info(`${pad(j, 11)} Lv10 boss : ${r.tk.toFixed(1)}s to kill (no gear upgrade), boss hit/s ${r.dt.toFixed(1)} (hp ${ch.final.maxHp.toFixed(0)})`);
    Ok(r.tk > 20 && r.tk < 240, j + " boss TTK sane");
  }
}

// Seeded RNG standing in for UnityEngine.Random.InitState(7): Xorshift128 seeded like Unity's.
// The exact Unity sequence is not guaranteed to match; the flow's assertions do not depend on it.
function UnityRandom(seed) {
  let s0 = seed >>> 0;
  let s1 = (Math.imul(s0, 1812433253) + 1) >>> 0;
  let s2 = (Math.imul(s1, 1812433253) + 1) >>> 0;
  let s3 = (Math.imul(s2, 1812433253) + 1) >>> 0;
  const next = () => {
    let t = (s0 ^ (s0 << 11)) >>> 0;
    s0 = s1; s1 = s2; s2 = s3;
    s3 = (s3 ^ (s3 >>> 19) ^ t ^ (t >>> 8)) >>> 0;
    return s3;
  };
  return {
    get value() { return (next() & 0x7fffff) / 0x7fffff; },
    range(min, maxExcl) { return maxExcl <= min ? min : min + (next() % (maxExcl - min)); },
  };
}

function TestFullFlow() {
  const d = LoadData();
  const R = UnityRandom(7);
  const p = newProfile(d, "아르칸", "f");
  const ch = new CharacterSheet(d, p);
  const ql = new QuestLog(d, ch);
  let totalKills = 0;
  const kill = id => {
    totalKills++;
    const m = d.monsters[id];
    ch.addExp(m.exp); ch.addGold(R.range(m.goldMin, m.goldMax + 1));
    for (const dr of m.drops) {
      if (R.value > dr.chance) continue;
      let item = dr.item;
      if (item.startsWith("@jobweapon:")) item = d.weaponFor(ch.p.job, parseInt(item.substring(11), 10));
      if (item != null) ch.bag.add(item, R.range(dr.min, dr.max + 1));
    }
    ql.notify("kill", id, 1);
    return 1;
  };
  Ok(ql.accept("q1_start"), "flow: accept q1 from elder");
  ql.notify("talk", "master_blacksmith", 1);
  Ok(ql.complete("q1_start") == null, "flow: q1 done");
  Ok(ql.accept("q2_merchant") && ql.accept("q3_slime"), "flow: accept q2,q3");
  ql.notify("talk", "merchant", 1);
  Ok(ql.complete("q2_merchant") == null, "flow: q2 done");
  let kills = 0;
  while (ql.stateOf(d.quests["q3_slime"]) !== QS.Completable && kills < 50) kills += kill("mon_slime");
  Ok(ql.complete("q3_slime") == null, "flow: q3 done after " + kills + " slimes");
  let s = FindSlot(ch, "a_armor_1"); Ok(s >= 0 && ch.bag.equipFromSlot(s) == null, "flow: equip reward armor");
  while (ch.p.level < 3) kill("mon_slime");
  Ok(ql.accept("q4_spore"), "flow: accept q4 (lv " + ch.p.level + ")");
  let guard = 0;
  while (ql.stateOf(d.quests["q4_spore"]) !== QS.Completable && guard++ < 100) kill("mon_shroom");
  Ok(ql.complete("q4_spore") == null, "flow: q4 done");
  while (ch.p.level < 10 && guard++ < 900) kill(ch.p.level < 6 ? "mon_shroom" : "mon_boar");
  Ok(ql.accept("q_job1"), "flow: accept 1st advancement (lv " + ch.p.level + ")");
  Ok(ch.chooseJob("hairdresser") == null, "flow: become a hairdresser at Lv10");
  Ok(ql.complete("q_job1") == null, "flow: advancement quest done");
  Eq(ch.book.sk.points >= 5, true, "flow: skill points granted");
  Ok(ch.book.learn("hd1_a1") == null, "flow: learn 가위 연격");
  Ok(ql.accept("q5_gear"), "flow: accept q5 (lv " + ch.p.level + ")");
  Info("gold before buying weapon: " + ch.p.gold);
  while (ch.p.gold < 420 && guard++ < 500) kill("mon_shroom");
  Ok(Shop.buy(ch, d.shops["shop_smithy"], "w_scissors_2", 1) == null, "flow: buy silver scissors");
  s = FindSlot(ch, "w_scissors_2"); Ok(ch.bag.equipFromSlot(s) == null, "flow: equip silver scissors");
  Ok(ql.complete("q5_gear") == null, "flow: q5 done");
  while (ch.p.level < 6 && guard++ < 1200) kill("mon_shroom");
  Ok(ql.accept("q6_golem"), "flow: accept q6");
  while (ql.stateOf(d.quests["q6_golem"]) !== QS.Completable && guard++ < 700) kill("mon_golem");
  Ok(ql.complete("q6_golem") == null, "flow: q6 done");
  s = FindSlot(ch, "ac_amulet_2"); Ok(s >= 0 && ch.bag.equipFromSlot(s) == null, "flow: equip amulet");
  while (ch.p.level < 8 && guard++ < 900) kill("mon_golem");
  Ok(ql.accept("q7_boss"), "flow: accept boss quest (lv " + ch.p.level + ")");
  const lvBefore = ch.p.level;
  kill("boss_mushroom");
  Ok(ch.bag.count("m_boss_cap") >= 1, "flow: boss material");
  Ok(ch.bag.count("w_scissors_3") === 1, "flow: boss drops the job weapon");
  Ok(ql.complete("q7_boss") == null, "flow: boss quest done");
  Ok(ch.p.level > lvBefore, "flow: leveled from boss");
  s = FindSlot(ch, "w_scissors_3"); Ok(ch.bag.equipFromSlot(s) == null, "flow: equip boss weapon (lv " + ch.p.level + ")");
  Info(`flow end: Lv${ch.p.level} exp ${ch.p.exp} gold ${ch.p.gold}, monster kills ${totalKills}`);
  // SaveSystem.Serialize/Deserialize -> JSON roundtrip + migrate (what SaveStore.save/load do)
  const json = JSON.stringify(ch.p);
  const p2 = migrate(JSON.parse(json));
  const ch2 = new CharacterSheet(d, p2);
  const ql2 = new QuestLog(d, ch2);
  Eq(ch2.p.weapon, "w_scissors_3", "flow: weapon persisted");
  Ok(ql2.isCompleted("q7_boss"), "flow: quest state persisted");
  Ok(Math.abs(ch2.final.atk - ch.final.atk) < 0.001, "flow: stats identical after reload");
  Ok(ch2.addExp(50) >= 0, "flow: play continues after reload");
}

function FindSlot(ch, id) {
  for (let i = 0; i < ch.bag.slots.length; i++) if (ch.bag.slots[i].id === id) return i;
  return -1;
}

function TestSaveSlots() {
  const d = LoadData(); mem.clear();
  Eq(core.saveSlotKey(0), "arcan_save_0", "slot 0 keeps the old auto-save key");
  const auto = new SaveStore(), s1 = new SaveStore(core.saveSlotKey(1)), s2 = new SaveStore(core.saveSlotKey(2));
  const a = newProfile(d, "가나", "m"), b = newProfile(d, "다라", "f"); b.level = 7;
  Ok(auto.save(a) && s1.save(b), "save into auto + slot 1");
  Ok(!s2.exists() && s1.exists() && auto.exists(), "slots are separate");
  Eq(s1.load().name, "다라", "slot 1 loads its own profile"); Eq(auto.load().name, "가나", "auto slot keeps its profile");
  Ok(typeof s1.load().saveAt === "number" && s1.load().saveAt > 0, "saveAt stored for sorting");
  s1.remove(); Ok(!s1.exists() && auto.exists(), "deleting a slot leaves the others");
  mem.clear();
}
function TestQuestCategories() {
  const d = LoadData();
  for (const q of d.questList) Ok(q.category === "main" || q.category === "sub", "quest category set: " + q.id);
  for (const id of ["q1_start", "q2_merchant", "q_job1", "q7_boss"]) Eq(core.questCategory(d.quests[id]), "main", "story quest is main: " + id);
  for (const id of ["q3_slime", "q4_spore", "q6_golem"]) Eq(core.questCategory(d.quests[id]), "sub", "hunt/gather quest is sub: " + id);
  Eq(core.questCategory({ objectives: [{ type: "kill" }, { type: "collect" }] }), "sub", "no category: kill/collect -> sub");
  Eq(core.questCategory({ objectives: [{ type: "talk" }] }), "main", "no category: talk -> main");
}
function TestAttributes() {
  const d = LoadData(); const ch = NewChar(d);
  Eq(ch.p.apoints, 0, "new character: no attribute points at Lv1");
  for (const k of core.ATTRS) Eq(ch.attr(k), core.ATTR_BASE, "base " + k);
  ch.addExp(ch.expToNext); Eq(ch.p.level, 2, "level up"); Eq(ch.p.apoints, 3, "3 attribute points per level");
  const atk0 = ch.final.atk, matk0 = ch.final.matk, hp0 = ch.final.maxHp, sp0 = ch.final.maxSp, crit0 = ch.final.crit;
  Ok(ch.spendAttr("str") == null && Math.abs(ch.final.atk - atk0 - 1.5) < 1e-6, "힘 -> 공격력 +1.5");
  Ok(ch.spendAttr("int") == null && Math.abs(ch.final.matk - matk0 - 1.5) < 1e-6, "지능 -> 마법력 +1.5");
  Ok(ch.spendAttr("vit") == null && Math.abs(ch.final.maxHp - hp0 - 12) < 1e-6 && Math.abs(ch.final.maxSp - sp0 - 4) < 1e-6, "생명력 -> 체력 +12, 기력 +4");
  Eq(ch.p.apoints, 0, "points spent"); Ok(ch.spendAttr("luk") != null, "cannot spend without points");
  ch.p.apoints = 10; ch.spendAttr("dex", 10); Ok(Math.abs(ch.final.hit - 0.1) < 1e-6 && Math.abs(ch.final.eva - 0.06) < 1e-6, "민첩 10 -> 명중 +10%, 회피 6%");
  ch.p.apoints = 5; ch.spendAttr("luk", 5); Ok(Math.abs(ch.final.crit - crit0 - 0.02) < 1e-6 && Math.abs(ch.final.craftRate - 0.05) < 1e-6, "행운 5 -> 치명타 +2%, 제작 +5%");
  ch.p.apoints = 500; ch.spendAttr("dex", 500); Ok(ch.final.eva <= core.EVA_CAP + 1e-9, "evasion capped at " + core.EVA_CAP);
  Ok(ch.resetAttr(false) != null, "attribute reset only in town"); const spent = ch.p.attr.str + ch.p.attr.int + ch.p.attr.vit + ch.p.attr.dex + ch.p.attr.luk;
  Ok(ch.resetAttr(true) == null && ch.p.apoints === spent && core.ATTRS.every(k => ch.p.attr[k] === 0), "reset returns every point");
  // older save without attributes: gets the points of the levels it already has
  const p2 = newProfile(d, "old", "f"); p2.level = 10; delete p2.attr; delete p2.apoints;
  const old = new CharacterSheet(d, migrate(JSON.parse(JSON.stringify(p2)))); Eq(old.p.apoints, 27, "old save Lv10 -> 27 points");
  // hit / evasion chances
  const mon = { faction: "monster", level: 20, stat: () => 0 }, pl = { faction: "player", stat: s => (s === "hit" ? 0.2 : s === "eva" ? 0.15 : 0) };
  Ok(Math.abs(core.missChance(pl, mon) - 0) < 1e-9, "명중 0.2 beats Lv20 monster evasion (6%)");
  Ok(Math.abs(core.missChance({ faction: "player", stat: () => 0 }, mon) - 0.06) < 1e-9, "Lv20 monster evades 6% without 명중");
  Ok(Math.abs(core.missChance(mon, pl) - 0.15) < 1e-9, "player evades by 회피");
}

// ---------------------------------------------------------------------------------------------------
const tests = [
  ["Data", TestData], ["Inventory", TestInventory], ["Shop", TestShop], ["Stats & equipment", TestStats],
  ["Leveling", TestLeveling], ["Jobs", TestJobs], ["Quests", TestQuests], ["Save/Load", TestSave],
  ["Hit shapes", TestShapes], ["Combat math", TestCombat], ["Status effects", TestStatus],
  ["Geometry & nav", TestGeometry], ["Layouts", TestLayouts], ["Balance", TestBalance], ["Full flow", TestFullFlow], ["Attributes", TestAttributes], ["Quest categories", TestQuestCategories], ["Save slots", TestSaveSlots],
];
for (const [name, fn] of tests) {
  const p0 = pass, f0 = fail;
  console.log("== " + name);
  try { fn(); } catch (e) { fail++; console.log("FAIL: exception " + (e && e.stack || e)); }
  console.log(`   -> ${pass - p0} ok, ${fail - f0} failed`);
}
if (skipped.length) { console.log("Skipped:"); for (const s of skipped) console.log("  - " + s.name + ": " + s.reason); }
console.log(`${pass} passed, ${fail} failed, ${skipped.length} skipped`);
process.exit(fail === 0 ? 0 : 1);
