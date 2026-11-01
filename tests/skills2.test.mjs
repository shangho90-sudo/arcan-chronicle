// Job / skill-point / slot / crafting / save tests for the v2 skill system (pure logic, node).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url)), dataDir = join(here, "..", "assets", "data");
const mem = new Map(); globalThis.window = { localStorage: { getItem: k => mem.has(k) ? mem.get(k) : null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) } };
const core = await import("../js/core.js");
const sys = await import("../js/skillsys.js");
const { GameData, CharacterSheet, QuestLog, newProfile, migrate, SaveStore } = core;
let pass = 0, fail = 0;
const Ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL: " + m); } };
const Eq = (a, b, m) => Ok(a === b, `${m} (expected ${b}, got ${a})`);
const FILES = ["config", "levels", "jobs", "skills", "skills2", "items", "monsters", "quests", "npcs", "zones"];
const load = () => { const f = {}; for (const n of FILES) f[n] = JSON.parse(readFileSync(join(dataDir, n + ".json"), "utf8")); return new GameData(f); };
const d = load();
const make = (lv, job) => { const p = newProfile(d, "테스터", "m"); const ch = new CharacterSheet(d, p); new QuestLog(d, ch); ch.p.level = lv; ch.book.grantPoints(); ch.recalc(); if (job) ch.p.job = job, ch.book.grantPoints(), ch.recalc(); return ch; };

// ---- data
Eq(d.skill2List.length, 180, "180 skills");
const jobs = ["pharmacist", "western_pharmacist", "herbalist", "cook", "chef", "blacksmith", "engineer", "hairdresser", "designer", "artist", "painter", "musician"];
for (const j of jobs) {
  const s = d.skillsOf(j); Eq(s.length, 15, j + " has 15");
  for (let c = 0; c < 3; c++) Eq(s.filter(x => x.cat === c).length, 5, j + " cat " + c + " has 5");
  Ok(s.some(x => x.type === "attack" && x.ops.some(o => o.op === "hit" && o.shape === "single" || o.op === "proj" || o.op === "custom")) || s.some(x => x.type === "summon"), j + " has a single-target damage option");
  Ok(s.some(x => ["support", "passive"].includes(x.type) && x.ops.concat([]).some(o => ["shield", "heal", "buff", "cleanse", "melody", "area"].includes(o.op)) || x.mods?.some(m => ["maxHp", "def"].includes(m.stat))), j + " has a survival tool");
}
const ids = new Set(d.skill2List.map(s => s.id)); Eq(ids.size, 180, "unique ids");
for (const s of d.skill2List) {
  if (s.type === "ultimate") { Eq(s.maxLv, 3, s.id + " ult max 3"); Ok(s.unlock >= 45, s.id + " ult >= Lv45"); }
  else Eq(s.maxLv, 5, s.id + " max 5");
  const t = d.job(s.job).tier, exp = t === 1 ? [10, 12, 15, 18, 20] : [30, 33, 36, 40, 45];
  if (s.type !== "ultimate") Eq(s.unlock, exp[s.idx - 1], s.id + " unlock by position");
  if (s.type === "craft") Ok((s.recipes || []).length > 0, s.id + " has recipes");
  for (const r of s.recipes || []) if (r !== "salvage") { const rc = d.recipes.find(x => x.id === r); Ok(rc && d.item(rc.output.item) && rc.inputs.every(x => d.item(x.item)), r + " recipe items exist"); }
  for (const op of s.ops) for (const st of op.st || []) Ok(!!d.status(st.id), s.id + " status " + st.id + " defined");
}
const bad = sys.economyCheck(d, d.recipes); Eq(bad.length, 0, "no buy->craft->sell profit: " + bad.join("; "));

// ---- points
let ch = make(9); Eq(ch.book.sk.points, 0, "no points before Lv10");
ch = make(10); Eq(ch.book.sk.points, 5, "5 points at Lv10");
ch.book.grantPoints(); Eq(ch.book.sk.points, 5, "no double grant");
ch = make(15); Eq(ch.book.sk.points, 10, "5 + 1/level (Lv15 -> 10)");
ch.p.job = "pharmacist"; ch.recalc();
ch.p.job = "western_pharmacist"; ch.book.grantPoints(); Eq(ch.book.sk.points, 15, "2nd job +5 once");
ch.book.grantPoints(); Eq(ch.book.sk.points, 15, "2nd job bonus not repeated");

// ---- learning rules
ch = make(10); ch.p.job = "pharmacist"; ch.recalc();
Ok(ch.book.learn("ph1_a1") == null, "learn Lv10 skill");
Ok(ch.book.learn("ph1_a5") != null && /레벨 20/.test(ch.book.learnBlock("ph1_a5")), "Lv20 skill locked with reason");
Ok(/요리사/.test(ch.book.learnBlock("ck1_a1")), "other job skill blocked");
for (let i = 0; i < 4; i++) ch.book.learn("ph1_a1");
Eq(ch.book.level("ph1_a1"), 5, "max level 5");
Ok(/최대/.test(ch.book.learnBlock("ph1_a1")), "cannot exceed max");
Eq(ch.book.sk.points, 0, "points spent");
Ok(/포인트/.test(ch.book.learnBlock("ph1_b1")), "no points -> blocked");
Ok(ch.book.sk.points >= 0, "points never negative");
// branch exclusivity
ch = make(30); ch.p.job = "western_pharmacist"; ch.book.grantPoints(); ch.recalc();
Ok(/분기/.test(ch.book.learnBlock("hb_b1")), "other branch blocked");
Ok(ch.book.learnBlock("ph1_a1") == null, "1st-job skills kept after 2nd job");
Ok(/45/.test(ch.book.learnBlock("wp_a5") || ""), "ultimate needs Lv45");
ch.p.level = 45; ch.book.grantPoints(); ch.recalc();
Ok(ch.book.learn("wp_a5") == null && ch.book.learn("wp_b5") == null, "two ultimates learned");
ch.book.equip("wp_a5", 0, false); ch.book.equip("wp_b5", 0, false);
Eq(ch.book.sk.ult, "wp_b5", "only one ultimate equipped");
// slots
ch.book.learn("wp_a1"); ch.book.learn("wp_a2"); ch.book.learn("wp_a3"); ch.book.learn("wp_a4"); ch.book.learn("wp_b3");
Ok(ch.book.sk.slots.filter(Boolean).length <= 4, "4 normal slots");
Ok(ch.book.equip("wp_b3", 0, true) != null, "no slot change in combat");
Ok(ch.book.equip("wp_b4", 0, false) != null, "passive cannot be slotted");
Ok(ch.book.equip("wp_b3", 2, false) == null && ch.book.sk.slots[2] === "wp_b3", "equip into slot 3");
Ok(new Set(ch.book.sk.slots.filter(Boolean)).size === ch.book.sk.slots.filter(Boolean).length, "no duplicate slots");
// passives apply once, reset refunds
ch = make(20); ch.p.job = "blacksmith"; ch.recalc();
const hp0 = ch.final.maxHp; ch.book.learn("bs1_b5"); const hp1 = ch.final.maxHp; ch.recalc(); ch.recalc();
Eq(ch.final.maxHp, hp1, "passive not stacked by repeated recalc"); Ok(hp1 > hp0, "passive applied");
const spent = ch.book.spent, before = ch.book.sk.points;
Ok(ch.book.reset(false, false) != null, "reset only in town");
Ok(ch.book.reset(true, true) != null, "no reset in combat");
Ok(ch.book.reset(true, false) == null, "reset in town");
Eq(ch.book.sk.points, before + spent, "all points refunded"); Eq(ch.final.maxHp, hp0, "passive removed on reset"); Eq(ch.p.job, "blacksmith", "job kept on reset");

// ---- advancement
let n = make(29); n.p.job = "artist"; n.recalc();
Ok(/30/.test(n.chooseJob("painter")), "2nd job needs Lv30");
n.p.level = 30; Ok(/시험/.test(n.chooseJob("painter")), "needs trial");
n.p.quests.push({ id: "qt_painter", state: "completed", counts: [1, 30] });
Ok(n.chooseJob("painter") == null, "advance to painter"); Ok(n.chooseJob("musician") != null, "single branch");

// ---- crafting (atomic)
ch = make(10); ch.p.job = "pharmacist"; ch.recalc(); ch.book.learn("ph1_c1");
const rc = d.recipes.find(r => r.id === "r_potion_s");
Ok(sys.craft(d, ch, ch.book, rc, 1).err, "craft fails without materials");
ch.bag.add("m_herb", 4); ch.bag.add("m_bottle", 2);
const pot0 = ch.bag.count("c_potion_s");
const r1 = sys.craft(d, ch, ch.book, rc, 2, () => 0.99);
Ok(r1.ok && ch.bag.count("c_potion_s") === pot0 + 4 && ch.bag.count("m_herb") === 0 && ch.bag.count("m_bottle") === 0, "craft x2 consumes and produces");
// bag full -> nothing lost
ch.bag.add("m_herb", 3); ch.bag.add("m_bottle", 2);
const inv = ch.p.inventory; for (let i = 0; i < inv.length; i++) if (!(inv[i].count > 0)) inv[i] = { id: "w_knife_1", count: 1 };
ch.bag.remove("c_potion_s", ch.bag.count("c_potion_s")); for (let i = 0; i < inv.length; i++) if (!(inv[i].count > 0)) inv[i] = { id: "w_knife_1", count: 1 };
const herbs = ch.bag.count("m_herb"), bottles = ch.bag.count("m_bottle");
const r2 = sys.craft(d, ch, ch.book, rc, 1);
Ok(r2.err && ch.bag.count("m_herb") === herbs && ch.bag.count("m_bottle") === bottles, "bag full -> materials kept: " + r2.err);
// bonus output never re-triggers: rng 0 -> exactly one bonus batch
ch = make(20); ch.p.job = "pharmacist"; ch.recalc(); ch.book.learn("ph1_c1"); ch.book.learn("ph1_c5");
ch.bag.add("m_herb", 2); ch.bag.add("m_bottle", 1);
const r3 = sys.craft(d, ch, ch.book, rc, 1, () => 0); Eq(r3.made, 4, "bonus output = one extra batch only");

// ---- save / migrate
ch = make(12); ch.p.job = "cook"; ch.recalc(); ch.book.learn("ck1_a1"); ch.book.learn("ck1_a1"); ch.book.equip("ck1_a1", 1, false);
ch.p.sk.cds = { ck1_a1: Date.now() + 50000 };
const ss = new SaveStore("t"); ss.save(ch.p); const p2 = ss.load();
const ch2 = new CharacterSheet(d, p2);
Eq(ch2.book.level("ck1_a1"), 2, "skill level saved"); Eq(ch2.book.sk.slots[1], "ck1_a1", "slot saved"); Eq(ch2.book.sk.points, ch.book.sk.points, "points saved");
Ok(p2.sk.cds.ck1_a1 > Date.now(), "long cooldown saved");
// corrupt sk data
const p3 = migrate(JSON.parse(JSON.stringify(p2))); p3.sk.learned = { ck1_a1: 99, nope: 3, ck1_a2: -1 }; p3.sk.slots = ["nope", "ck1_a1", "ck1_a1", 7, "x"]; p3.sk.ult = "ck1_a1"; p3.sk.points = -5;
const ch3 = new CharacterSheet(d, p3);
Eq(ch3.book.level("ck1_a1"), 5, "over-max level clamped"); Ok(!("nope" in ch3.book.sk.learned), "unknown id dropped");
Eq(ch3.book.sk.slots.length, 4, "slot array repaired"); Eq(ch3.book.sk.slots.filter(x => x === "ck1_a1").length, 1, "duplicate slot removed"); Eq(ch3.book.sk.ult, "", "invalid ult cleared");
Ok(ch3.book.sk.points >= 0, "negative points repaired");
// v2 save -> v3: job kept (legacy), no points below 10
const v2 = { version: 2, name: "옛날", gender: "f", job: "cook", level: 6, exp: 0, gold: 10, inventory: [], learnedSkills: ["ck_chop"], quests: [], flags: [] };
const p4 = migrate(v2); const ch4 = new CharacterSheet(d, p4);
Eq(p4.version, 3, "migrated to v3"); Eq(ch4.p.job, "cook", "legacy job kept"); Eq(ch4.book.sk.points, 0, "no points below Lv10"); Ok(p4.legacyJob, "legacy flag");

console.log(`skills2: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
