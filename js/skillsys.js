// Job advancement + skill points + skill book + slots + crafting (pure logic, no rendering; unit-tested in node).
// Save data lives in profile.sk (see ensureSk). Combat execution is in skillrt.js.

export const ADV1_LEVEL = 10, ADV2_LEVEL = 30, ULT_MIN_LEVEL = 45;
export const NORMAL_SLOTS = 4;
export const UNLOCK1 = [10, 12, 15, 18, 20], UNLOCK2 = [30, 33, 36, 40, 45];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** profile.sk schema (v1). Everything validated on load so a broken save never breaks the game. */
export function ensureSk(p, data) {
  const sk = (p.sk && typeof p.sk === 'object') ? p.sk : {};
  sk.v = 1;
  sk.points = Math.max(0, sk.points | 0);
  sk.granted = Array.isArray(sk.granted) ? sk.granted.filter(n => Number.isInteger(n) && n >= ADV1_LEVEL && n <= 99) : [];
  sk.adv2Bonus = !!sk.adv2Bonus;
  // 견습생 기본 검술: its own pool, 1 point per character level from Lv1 (kept through every job change)
  sk.npoints = Math.max(0, sk.npoints | 0);
  sk.ngranted = Array.isArray(sk.ngranted) ? sk.ngranted.filter(n => Number.isInteger(n) && n >= 1 && n <= 99) : [];
  sk.learned = (sk.learned && typeof sk.learned === 'object') ? sk.learned : {};
  for (const id of Object.keys(sk.learned)) {
    const d = data.skill2(id); const lv = sk.learned[id] | 0;
    if (!d || lv <= 0) { if (d) { /* invalid level: refund nothing, drop */ } delete sk.learned[id]; continue; }
    if (lv > d.maxLv) { sk.points += lv - d.maxLv; sk.learned[id] = d.maxLv; }     // refund impossible levels
    else sk.learned[id] = lv;
  }
  sk.slots = Array.isArray(sk.slots) ? sk.slots.slice(0, NORMAL_SLOTS) : [];
  while (sk.slots.length < NORMAL_SLOTS) sk.slots.push('');
  sk.slots = sk.slots.map(id => (typeof id === 'string' && sk.learned[id] && data.skill2(id) && isSlottable(data.skill2(id))) ? id : '');
  // no duplicates
  sk.slots = sk.slots.map((id, i) => id && sk.slots.indexOf(id) === i ? id : '');
  sk.ult = (typeof sk.ult === 'string' && sk.learned[sk.ult] && data.skill2(sk.ult)?.type === 'ultimate') ? sk.ult : '';
  sk.cds = (sk.cds && typeof sk.cds === 'object') ? sk.cds : {};          // long cooldown end times (epoch ms)
  for (const k of Object.keys(sk.cds)) if (!data.skill2(k) || !(sk.cds[k] > 0)) delete sk.cds[k];
  sk.res = {};                                                                 // job resources are transient (reset on load)
  sk.dye = (sk.dye && typeof sk.dye === 'object') ? sk.dye : {};
  p.sk = sk; return sk;
}
export const isSlottable = d => d && ['attack', 'support', 'summon'].includes(d.type);

export class SkillBook {
  constructor(data, sheet) { this.data = data; this.sheet = sheet; this.p = sheet.p; this.sk = ensureSk(this.p, data); this.grantPoints(); }
  get job() { return this.data.job(this.p.job); }
  /** jobs whose skills this character may learn: current job and (for 2nd jobs) its parent */
  get lineage() { const j = this.job; if (!j || j.id === 'novice') return ['novice']; return j.parent ? ['novice', j.parent, j.id] : ['novice', j.id]; }
  isNovice(d) { return d && d.job === 'novice'; }
  /** spendable points for this skill's pool */
  poolOf(d) { return this.isNovice(d) ? 'npoints' : 'points'; }
  // ---------------------------------------------------------------- points (idempotent: every grant is recorded)
  grantPoints() {
    const sk = this.sk; let gained = 0;
    for (let L = ADV1_LEVEL; L <= this.p.level; L++) if (!sk.granted.includes(L)) { sk.granted.push(L); const n = L === ADV1_LEVEL ? 5 : 1; sk.points += n; gained += n; }
    if (this.job && this.job.tier === 2 && !sk.adv2Bonus) { sk.adv2Bonus = true; sk.points += 5; gained += 5; }
    for (let L = 1; L <= this.p.level; L++) if (!sk.ngranted.includes(L)) { sk.ngranted.push(L); sk.npoints += 1; this.ngained = (this.ngained || 0) + 1; }
    return gained;
  }
  get spent() { return Object.entries(this.sk.learned).reduce((a, [id, b]) => a + (this.isNovice(this.data.skill2(id)) ? 0 : b), 0); }
  get nspent() { return Object.entries(this.sk.learned).reduce((a, [id, b]) => a + (this.isNovice(this.data.skill2(id)) ? b : 0), 0); }
  level(id) { return this.sk.learned[id] | 0; }
  unlockLevel(d) { return d.type === 'ultimate' ? Math.max(ULT_MIN_LEVEL, d.unlock) : d.unlock; }
  /** why this skill cannot be learned / upgraded right now (null = ok) */
  learnBlock(id) {
    const d = this.data.skill2(id); if (!d) return '알 수 없는 스킬';
    const j = this.data.job(d.job);
    if (!this.lineage.includes(d.job)) {
      if (j && j.tier === 2 && this.job && j.parent === this.job.parent && this.job.tier === 2) return '다른 전직 분기의 스킬은 배울 수 없습니다';
      return (j ? j.name : d.job) + ' 직업 스킬입니다';
    }
    if (!d.implemented) return '아직 구현되지 않은 스킬입니다';
    const lv = this.level(id); if (lv >= d.maxLv) return '최대 레벨입니다';
    const need = this.unlockLevel(d); if (this.p.level < need) return `캐릭터 레벨 ${need} 필요`;
    for (const pr of d.prereq || []) { const pd = this.data.skill2(pr.id); if (this.level(pr.id) < pr.lv) return `선행: ${pd ? pd.name : pr.id} Lv${pr.lv}`; }
    if (this.sk[this.poolOf(d)] < 1) return this.isNovice(d) ? '기본 검술 포인트가 부족합니다' : '스킬 포인트가 부족합니다';
    return null;
  }
  learn(id) {
    const e = this.learnBlock(id); if (e) return e;
    const d = this.data.skill2(id);
    this.sk[this.poolOf(d)] -= 1; this.sk.learned[id] = this.level(id) + 1;
    // first copy auto-equips into a free slot for convenience
    if (this.level(id) === 1) { if (isSlottable(d)) { const i = this.sk.slots.indexOf(''); if (i >= 0) this.sk.slots[i] = id; } else if (d.type === 'ultimate' && !this.sk.ult) this.sk.ult = id; }
    this.sheet.recalc(); return null;
  }
  // ---------------------------------------------------------------- slots
  equip(id, slot, inCombat) {
    if (inCombat) return '전투 중에는 슬롯을 바꿀 수 없습니다';
    const d = this.data.skill2(id); if (!d || !this.level(id)) return '배우지 않은 스킬입니다';
    if (!this.lineage.includes(d.job)) return '현재 직업의 스킬이 아닙니다';
    if (d.type === 'ultimate') { this.sk.ult = id; return null; }
    if (!isSlottable(d)) return d.type === 'passive' ? '패시브는 자동 적용됩니다' : '제작 스킬은 제작 메뉴에서 사용합니다';
    slot = clamp(slot | 0, 0, NORMAL_SLOTS - 1);
    const cur = this.sk.slots.indexOf(id); if (cur >= 0) this.sk.slots[cur] = this.sk.slots[slot];
    this.sk.slots[slot] = id; return null;
  }
  unequip(slot, inCombat) {
    if (inCombat) return '전투 중에는 슬롯을 바꿀 수 없습니다';
    if (slot === 'ult') this.sk.ult = ''; else this.sk.slots[clamp(slot | 0, 0, NORMAL_SLOTS - 1)] = '';
    return null;
  }
  /** refund every point; keeps job, crafted items, granted history */
  reset(safeZone, inCombat) {
    if (inCombat) return '전투 중에는 초기화할 수 없습니다';
    if (!safeZone) return '마을에서만 초기화할 수 있습니다';
    this.sk.points += this.spent; this.sk.npoints += this.nspent; this.sk.learned = {}; this.sk.slots = Array(NORMAL_SLOTS).fill(''); this.sk.ult = '';
    this.sheet.recalc(); return null;
  }
  /** skills usable now (learned AND belonging to the current lineage) */
  usable(id) { const d = this.data.skill2(id); return !!(d && this.level(id) > 0 && this.lineage.includes(d.job)); }
  /** passive stat mods for CharacterSheet.recalc */
  passiveMods() {
    const out = [];
    for (const [id, lv] of Object.entries(this.sk.learned)) {
      const d = this.data.skill2(id); if (!d || d.type !== 'passive' || !this.lineage.includes(d.job)) continue;
      for (const m of d.mods || []) out.push({ stat: m.stat, add: (m.add || 0) + (m.addLv || 0) * (lv - 1), mul: (m.mul || 0) + (m.mulLv || 0) * (lv - 1) });
    }
    return out;
  }
  /** passive flag value (e.g. 'throwRange') summed over learned passives */
  passive(key) {
    let v = 0;
    for (const [id, lv] of Object.entries(this.sk.learned)) {
      const d = this.data.skill2(id); if (!d || d.type !== 'passive' || !this.lineage.includes(d.job) || !d.flags) continue;
      const f = d.flags[key]; if (f != null) v += f[0] + (f[1] || 0) * (lv - 1);
    }
    return v;
  }
}

// ---------------------------------------------------------------- job advancement
export function advanceBlock(data, sheet, quests, jobId) {
  const j = data.job(jobId), cur = sheet.job, p = sheet.p;
  if (!j) return '알 수 없는 직업';
  if (!j.implemented) return '아직 준비 중인 직업입니다';
  if (j.id === p.job) return '이미 ' + j.name + '입니다';
  if (j.tier === 1) {
    if (cur && cur.id !== 'novice') return '자유로운 직업 변경은 지원하지 않습니다';
    if (p.level < ADV1_LEVEL) return `레벨 ${ADV1_LEVEL} 이상 필요합니다`;
    return null;
  }
  if (j.tier === 2) {
    if (!cur || cur.id !== j.parent) return (data.job(j.parent)?.name || j.parent) + '만 전직할 수 있습니다';
    if (p.level < ADV2_LEVEL) return `레벨 ${ADV2_LEVEL} 이상 필요합니다`;
    const q = j.trialQuest; if (q && !(quests && quests.find(q) && quests.find(q).state === 'completed')) return '전직 시험을 먼저 완료해야 합니다';
    return null;
  }
  return '전직할 수 없습니다';
}

// ---------------------------------------------------------------- crafting (atomic)
/** recipe: {id, skill, minLv, inputs:[{item,count}], output:{item,count}, gold?} ; returns {ok, err, made, bonus, returned} */
export function craft(data, sheet, book, recipe, times = 1, rng = Math.random) {
  times = clamp(times | 0, 1, 99);
  const bag = sheet.bag, inv = sheet.p.inventory;
  const lv = recipe.skill ? book.level(recipe.skill) : 1;
  if (recipe.skill && !book.usable(recipe.skill)) return { err: '제작 스킬을 배워야 합니다' };
  if (lv < (recipe.minLv || 1)) return { err: `제작 스킬 Lv${recipe.minLv} 필요` };
  const costMul = 1 - Math.min(0.3, book.passive('craftDiscount'));
  const need = recipe.inputs.map(x => ({ item: x.item, count: x.count * times }));
  for (const n of need) if (bag.count(n.item) < n.count) return { err: `${data.item(n.item)?.name || n.item} 부족 (${bag.count(n.item)}/${n.count})` };
  const gold = Math.round((recipe.gold || 0) * times * costMul);
  if (sheet.p.gold < gold) return { err: `골드 부족 (${gold} G 필요)` };
  // bonus output / material return rolls (never trigger each other)
  let bonus = 0, ret = [];
  const extraP = book.passive('craftExtra:' + (recipe.group || '')), retP = book.passive('craftReturn:' + (recipe.group || ''));
  for (let i = 0; i < times; i++) {
    if (extraP > 0 && rng() < extraP) bonus += recipe.output.count;
    if (retP > 0) for (const x of recipe.inputs) if (data.item(x.item)?.tier <= 1 && rng() < retP) ret.push(x.item);
  }
  const outN = recipe.output.count * times + bonus;
  // simulate on a copy: remove inputs, add outputs -> must all fit
  const snap = JSON.stringify(inv), snapGold = sheet.p.gold;
  const restore = () => { sheet.p.inventory.splice(0, sheet.p.inventory.length, ...JSON.parse(snap)); sheet.p.gold = snapGold; bag.changed(); };
  for (const n of need) if (!bag.remove(n.item, n.count)) { restore(); return { err: '재료 처리 실패' }; }
  const got = bag.add(recipe.output.item, outN);
  let okRet = true; for (const r of ret) okRet = bag.add(r, 1) === 1 && okRet;
  if (got < outN || !okRet) { restore(); return { err: '가방 공간이 부족합니다' }; }
  sheet.p.gold -= gold;
  // maker record for equipment (stored in profile, keyed by item id)
  const od = data.item(recipe.output.item);
  if (od && ['weapon', 'armor', 'accessory'].includes(od.type)) { sheet.p.crafted = sheet.p.crafted || {}; sheet.p.crafted[od.id] = { by: sheet.p.name, recipe: recipe.id }; }
  bag.changed();
  return { ok: true, made: outN, bonus, returned: ret.length };
}

/** buy -> craft -> sell loop must never profit: returns list of offending recipe ids */
export function economyCheck(data, recipes) {
  const bad = [], buyable = new Set(Object.values(data.shops || {}).flatMap(s => s.items));
  for (const r of recipes) {
    const out = data.item(r.output.item); if (!out) continue;
    if (!r.inputs.every(x => buyable.has(x.item))) continue;        // drop-only materials cannot be bought in a loop
    const costBuy = r.inputs.reduce((s, x) => { const d = data.item(x.item); return s + (d && d.price > 0 ? d.price : (d ? d.sellPrice : 0)) * x.count; }, 0) + (r.gold || 0) * 0.7;
    const sell = (out.sellPrice || 0) * r.output.count * 1.3;               // worst case with 30% bonus output
    if (sell > costBuy) bad.push(r.id + ` (원가 ${costBuy} < 판매 ${sell.toFixed(0)})`);
  }
  return bad;
}
