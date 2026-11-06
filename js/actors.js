// Actors: combatant base, player, monsters, boss, NPCs, projectiles, poison zones, loot, skill runner.
// Port of Assets/Arcan/Scripts/Runtime/{Actors,Combat} (C#).
import { CombatMath, HitShape, StatusSet, clamp, clamp01, DEG, missChance } from './core.js';
import { SpriteBody, dirFromWorld, hitTime, duration, lockTime, action, TelegraphView, T, THREE } from './render.js';
import { lootModel, hasItemModel } from './items3d.js';
import { SkillEngine, applyStatus, clearMarks } from './skillrt.js';
import { CreatureBody, loadCreature, CREATURES } from './creature.js';
import { ModelBody, loadPlayerModel, loadNpcModel, loadActions, PLAYER_MODELS, NPC_MODELS } from './model.js';

let G = null; // game context (set by game.js)
export function bindGame(g) { G = g; }
const rnd = (a, b) => a + Math.random() * (b - a);

// ======================================================================================= combatant
export class Combatant {
  constructor(zone, pos, radius, faction) {
    this.zone = zone; this.pos = { x: pos.x, y: pos.y, z: pos.z }; this.radius = radius; this.faction = faction;
    this.hp = 1; this.shield = 0; this.shieldT = 0; this.dead = false; this.invuln = 0; this.status = new StatusSet();
    this.facing = { x: 0, z: -1 }; this.knock = { x: 0, z: 0 }; this.level = 1; this.name = ""; this.hitReact = 0;
    this._ticking = false; this._clearAfter = false;
  }
  get maxHp() { return 1; }
  baseStat(s) { return 0; }
  stat(s) {
    const b = this.baseStat(s), bonus = this.status.bonus(s);
    const add = this.status.add ? this.status.add(s) : 0;
    if (s === "crit" || s === "dmgReduce" || s === "cdr" || s === "critDmg") return b + bonus + add;
    if (s === "moveSpeed") return Math.max(0, b * (1 + bonus) + add) * this.status.slow;
    return Math.max(0, b * (1 + bonus) + add);
  }
  get stunned() { return this.status.stunned; }
  setFacing(x, z) { const m = Math.hypot(x, z); if (m < 1e-4) return; this.facing = { x: x / m, z: z / m }; if (this.body) { if (this.body.setFacing) this.body.setFacing(x, z); else this.body.setDir(dirFromWorld(x, z)); } }
  takeDamage(d) {
    if (this.dead || (this.invuln > 0 && !d.dot)) return;
    // 명중 / 회피 (능력치 민첩): direct hits can miss; damage over time and scripted damage never do
    if (!d.dot && !d.noMiss && d.source && d.source !== this && Math.random() < missChance(d.source, this)) {
      if (!d.silent) G.ui.floatText(this.pos, this.faction === "player" ? "회피" : "MISS", this.faction === "player" ? "#bfe4ff" : "#e8e2d4", 1);
      d.missed = true; return;
    }
    let amount = d.amount;
    if (this.faction === "player" && this.skills2) {
      if (!d.dot) this._hits = (this._hits || 0) + 1;
      const fg = this.status.flag("frontguard"); if (fg && d.source && d.source.pos) { const dx = d.source.pos.x - this.pos.x, dz = d.source.pos.z - this.pos.z, m = Math.hypot(dx, dz) || 1; if ((dx * this.facing.x + dz * this.facing.z) / m > 0.3) amount *= 1 - fg; }
      if (this.skills2.casting && !d.dot && amount > this.maxHp * 0.15) this.skills2.interruptCast("강한 공격에 시전이 끊겼습니다");
      const sh = this.shield > 0 ? Math.min(this.shield, amount) : 0;
      if (this.hp - (amount - sh) <= 0 && this.skills2.cheatDeath()) return;
    }
    if (this.shield > 0) { const a = Math.min(this.shield, amount); this.shield -= a; amount -= a; }
    this.hp = Math.max(0, this.hp - amount);
    if (!d.silent) {
      if (amount < 1) G.ui.floatText(this.pos, "흡수", "#8ce6ff", 0.9);
      else G.ui.damageText(this.pos, Math.round(amount), d.dot ? "dot" : this.faction === "player" ? "taken" : d.crit ? "crit" : "hit");
      // critical hit on a monster: a beat of hit-stop, a camera kick and a star burst at the target
      if (d.crit && !d.dot && this.faction !== "player") {
        G.audio.sfx("crit");
        G.hitStop(0.05); G.render.addShake(0.06, 0.12);
        if (G.swingFx && G.swingFx.ready) G.swingFx.hit(this.pos, { crit: true });
        else if (G.skillFx) try { G.skillFx.burst('explosion_gold', { x: this.pos.x, y: this.pos.y + 0.6, z: this.pos.z }, { radius: 0.55 }); } catch (e) { }
      }
    }
    if (!d.dot && this.body) this.body.flash(0.1);
    if (d.knockback > 0 && d.kdir) { const m = Math.hypot(d.kdir.x, d.kdir.z) || 1; this.knock = { x: d.kdir.x / m * d.knockback * 6, z: d.kdir.z / m * d.knockback * 6 }; }
    this.onDamaged(d, amount);
    if (this.hp <= 0) this.die(d.source);
  }
  onDamaged() { }
  heal(n, show = true) {
    if (this.dead || n <= 0) return; const b = this.hp; this.hp = Math.min(this.maxHp, this.hp + n);
    if (show && this.hp - b >= 1) G.ui.floatText(this.pos, "+" + Math.round(this.hp - b), "#73ff8c", 1);
  }
  addShield(n, d) { this.shield = Math.max(this.shield, n); this.shieldT = d; }
  die(killer) {
    if (this.dead) return; this.dead = true;
    if (this._ticking) this._clearAfter = true; else this.status.clear();
    this.shield = 0; if (this.body) this.body.play("death", 1, true);
    this.onDeath(killer);
  }
  onDeath() { }
  baseUpdate(dt) {
    if (this.invuln > 0) this.invuln -= dt;
    if (this.hp > this.maxHp) this.hp = this.maxHp;
    if (this.hitReact > 0) this.hitReact -= dt;
    if (this.shieldT > 0) { this.shieldT -= dt; if (this.shieldT <= 0) this.shield = 0; }
    if (!this.dead) {
      this._ticking = true;
      this.status.tick(dt, s => { if (!this.dead) this.takeDamage({ amount: Math.max(1, s.value), dot: true, source: s.source }); }, s => { if (!this.dead) this.heal(s.value); });
      this._ticking = false;
      if (this._clearAfter) { this._clearAfter = false; this.status.clear(); }
    }
    if (Math.hypot(this.knock.x, this.knock.z) > 0.1) {
      this.pos = this.zone.geo.move(this.pos, this.knock.x * dt, this.knock.z * dt, this.radius);
      const k = 1 - Math.exp(-10 * dt); this.knock.x *= 1 - k; this.knock.z *= 1 - k;
    } else this.knock = { x: 0, z: 0 };
  }
  moveBy(dx, dz) { const b = this.pos; this.pos = this.zone.geo.move(b, dx, dz, this.radius); return { x: this.pos.x - b.x, z: this.pos.z - b.z }; }
  teleport(p) { this.pos = this.zone.geo.ground(p.x, p.z); this.knock = { x: 0, z: 0 }; }
  get xz() { return this.pos; }
  dist(o) { return Math.hypot(this.pos.x - o.pos.x, this.pos.z - o.pos.z); }
}

export const Resolver = {
  targets(caster, shape, tol = 1.4) {
    return caster.zone.actors.filter(c => c && !c.dead && c.faction !== caster.faction && Math.abs(c.pos.y - caster.pos.y) <= tol && shape.overlaps(c.pos.x, c.pos.z, c.radius));
  },
  damage(caster, target, coef, power, knockback) {
    const pw = caster.stat(!power || power === "food" ? "atk" : power);
    const r = CombatMath.compute(pw, coef, target.stat("def"), caster.stat("crit"), caster.stat("critDmg"), target.stat("dmgReduce"));
    return { source: caster, amount: r.amount, crit: r.crit, kdir: { x: target.pos.x - caster.pos.x, z: target.pos.z - caster.pos.z }, knockback };
  }
};

// ======================================================================================= skills
export class SkillRunner {
  constructor(pc) { this.pc = pc; this.cdEnd = {}; this.cdLen = {}; this.pending = []; this.clock = 0; this.lock = 0; }
  cdLeft(id) { return Math.max(0, (this.cdEnd[id] || 0) - this.clock); }
  cdFrac(id) { const l = this.cdLen[id]; return l > 0 ? clamp01(this.cdLeft(id) / l) : 0; }
  get busy() { return this.lock > 0; }
  reset() { this.cdEnd = {}; this.pending = []; this.lock = 0; }
  cancel() { this.pending = []; this.lock = 0; }
  tryCast(s, aim) {
    const pc = this.pc;
    if (!s) return "스킬 없음"; if (!s.implemented) return "준비 중인 스킬입니다";
    if (pc.dead) return ""; if (pc.stunned) return "기절 상태"; if (this.busy) return "";
    if (this.cdLeft(s.id) > 0) return "재사용 대기 중"; if (pc.sp < s.cost) return "기력이 부족합니다";
    const basic = s.kind === "basic", atkSpd = Math.max(0.3, pc.stat("atkSpeed"));
    const animSpeed = Math.max(0.2, s.animSpeed) * (basic ? atkSpd : 1);
    const cd = basic ? s.cooldown / atkSpd : CombatMath.cooldown(s.cooldown, pc.stat("cdr"));
    pc.sp -= s.cost; this.cdEnd[s.id] = this.clock + cd; this.cdLen[s.id] = cd;
    const o = { ...pc.pos };
    let dx = aim.x - o.x, dz = aim.z - o.z;
    if (s.targeting === "ground") { const m = Math.hypot(dx, dz); if (m > s.range) { aim = { x: o.x + dx / m * s.range, z: o.z + dz / m * s.range }; } aim = pc.zone.geo.ground(aim.x, aim.z); }
    if (dx * dx + dz * dz > 0.01) pc.setFacing(dx, dz);
    const facing = { ...pc.facing };
    let anim = s.anim || "attack"; const sh = pc.body.sh;
    // basic attacks alternate forehand / backhand while the button is held (the 2nd swing starts where the 1st ended)
    if (basic && anim === "attack" && sh.actions.attack2) { this.combo = this.clock - (this.lastBasic ?? -9) < 0.9 ? ((this.combo || 0) + 1) % 2 : 0; this.lastBasic = this.clock; if (this.combo) anim = "attack2"; }
    const ht = hitTime(sh, anim) / animSpeed, du = duration(sh, anim) / animSpeed;
    pc.body.play(anim, animSpeed, true);
    this.lock = anim === "dash" ? 0 : lockTime(sh, anim) / animSpeed;   // the recovery of a swing can blend into moving / the next swing
    if (s.sfx) G.audio.sfx(s.sfx);
    let extra = 0;
    for (const a of s.actions) {
      if (a.type === "projectile") { this.pending.push({ time: this.clock + ht + a.delay, a, s, aim, facing, origin: o }); extra += Math.hypot(aim.x - o.x, aim.z - o.z) / Math.max(1, a.speed); continue; }
      for (let h = 0; h < Math.max(1, a.hits); h++) this.pending.push({ time: this.clock + ht + a.delay + extra + h * a.interval, a, s, aim, facing, origin: o });
    }
    pc.path = [];
    return null;
  }
  tick(dt) {
    this.clock += dt; if (this.lock > 0) this.lock -= dt;
    const due = this.pending.filter(p => p.time <= this.clock);
    if (!due.length) return;
    this.pending = this.pending.filter(p => p.time > this.clock);
    for (const p of due) if (!this.pc.dead) this.exec(p);
  }
  shape(a, p) {
    const c = a.atTarget ? p.aim : { x: this.pc.pos.x + p.facing.x * a.offset, z: this.pc.pos.z + p.facing.z * a.offset };
    if (a.shape === "cone") return HitShape.cone(c.x, c.z, p.facing.x, p.facing.z, a.radius, a.angle);
    if (a.shape === "rect") return HitShape.rect(c.x, c.z, p.facing.x, p.facing.z, a.width, a.length);
    return HitShape.circle(c.x, c.z, a.radius);
  }
  exec(p) {
    const a = p.a, pc = this.pc, st = pc.sheet.final;
    switch (a.type) {
      case "damage": {
        const sh = this.shape(a, p); const ts = Resolver.targets(pc, sh);
        const bmul = p.s.kind === "basic" && pc.sheet && pc.sheet.book ? 1 + pc.sheet.book.passive("basicDmg") : 1;
        // melee swings (slash / blunt) use the 3D effect library: a bright crescent that alternates direction each swing
        const fx3 = G.skillFx && !a.atTarget && a.shape === "cone" && (a.fx === "slash" || a.fx === "hit" || a.fx === "wind");
        const SF = G.swingFx && G.swingFx.ready ? G.swingFx : null;
        for (const t of ts) {
          const dd = Resolver.damage(pc, t, a.coef * bmul, a.power, a.knockback); t.takeDamage(dd);
          if (SF && !a.atTarget) { if (!dd.crit) SF.hit(t.pos, { scale: a.fx === "hit" ? 1.15 : 1 }); }
          else if (fx3) G.skillFx.burst(a.fx === "hit" ? "hit_blunt" : "hit_slash", { x: t.pos.x, y: t.pos.y, z: t.pos.z }, { radius: 0.5, grade: 1 });
          else G.fx.play(a.fx === "hit" ? "hit" : (["paint_burst", "potion_splash"].includes(a.fx) ? a.fx : "hit"), { x: t.pos.x, y: t.pos.y + 0.6, z: t.pos.z }, a.fx === "hit" ? 1.2 : 1);
        }
        const reach = Math.max(0.6, (a.radius > 0 ? a.radius : a.length) * 0.5);
        const fp = a.atTarget ? { x: p.aim.x, y: p.aim.y + 0.3, z: p.aim.z } : { x: pc.pos.x + p.facing.x * reach, y: pc.pos.y + 0.7, z: pc.pos.z + p.facing.z * reach };
        const trail = pc.body && pc.body.md && pc.body.sh.actions[pc.body.action] && pc.body.sh.actions[pc.body.action].trail;
        // melee swing: Tripo crescent sweeping the same way as the swing (forehand / backhand)
        if (SF && !a.atTarget && (a.shape === "cone" || a.shape === "rect")) SF.slash(pc.pos, p.facing, pc.body && pc.body.action === "attack2" ? -1 : 1, { radius: Math.max(1.0, (a.radius || a.length || 1.5) * 0.85) });
        if (fx3 && !trail) { this.swing = ((this.swing || 0) + 1) % 3;
          G.skillFx.slash("blade", pc.pos, p.facing, { radius: a.radius * 1.05, angle: Math.max(110, a.angle + 20), mirror: this.swing === 1, tilt: [0.18, -0.22, 0.42][this.swing], grade: 3 }); }
        else if (["slash", "wind", "paint_burst", "potion_splash", "ring"].includes(a.fx)) G.fx.play(a.fx, fp, a.fxScale, a.fx === "ring");
        if (ts.length) { G.audio.sfx(a.sfx || "hit"); pc.onHitLanded(a.coef >= 1.5); }
        else if (a.atTarget && a.sfx) G.audio.sfx(a.sfx);
        break;
      }
      case "status": { const def = G.data.status(a.status); for (const t of Resolver.targets(pc, this.shape(a, p))) t.status.apply(def, a.duration, a.value, pc); break; }
      case "heal": {
        let n = CombatMath.heal(a.amount, a.percent, pc.maxHp, st.healPower); if (a.power === "food") n *= 1 + st.foodPower;
        pc.heal(n); if (a.fx) G.fx.play(a.fx, { x: pc.pos.x, y: pc.pos.y + 0.8, z: pc.pos.z }, a.fxScale); if (a.sfx) G.audio.sfx(a.sfx); break;
      }
      case "shield": {
        const n = Math.round((a.amount + a.coef * pc.stat(a.power || "matk")) * (1 + st.shieldPower));
        pc.addShield(n, a.duration); G.ui.floatText(pc.pos, "보호막 " + n, "#8ce6ff", 0.9, 1.6);
        if (a.fx) G.fx.play(a.fx, { x: pc.pos.x, y: pc.pos.y + 0.7, z: pc.pos.z }, 1.6); if (a.sfx) G.audio.sfx(a.sfx); break;
      }
      case "buff": {
        const v = a.value * (a.power === "food" ? 1 + st.foodPower : 1), def = G.data.status(a.status);
        pc.status.apply(def, a.duration, v, pc); if (def) G.ui.floatText(pc.pos, def.name, def.color, 0.85, 1.8);
        if (a.fx) G.fx.play(a.fx, { x: pc.pos.x, y: pc.pos.y + 0.7, z: pc.pos.z }, 1.4); if (a.sfx) G.audio.sfx(a.sfx); break;
      }
      case "dash": {
        const d = Math.hypot(pc.lastMove.x, pc.lastMove.z) > 0.1 ? pc.lastMove : p.facing;
        pc.startDash(d, a.distance, a.speed, a.invuln); if (a.fx) G.fx.play(a.fx, { x: pc.pos.x, y: pc.pos.y + 0.3, z: pc.pos.z }, 1); if (a.sfx) G.audio.sfx(a.sfx); break;
      }
      case "projectile": Projectile.lob(pc.zone, { x: pc.pos.x + p.facing.x * 0.3, y: pc.pos.y + 1, z: pc.pos.z + p.facing.z * 0.3 }, { x: p.aim.x, y: p.aim.y + 0.2, z: p.aim.z }, a.speed, a.fx, null); break;
      case "fx": G.fx.play(a.fx, { x: pc.pos.x, y: pc.pos.y + 0.4, z: pc.pos.z }, a.fxScale); break;
      case "cleanse": pc.status.removeDebuffs(); break;
    }
  }
}

// ======================================================================================= player
export class Player extends Combatant {
  constructor(zone, pos, sheet, quests, cfg) {
    super(zone, pos, cfg.playerRadius, "player");
    this.sheet = sheet; this.quests = quests; this.cfg = cfg; this.name = sheet.p.name;
    this.skills = new SkillRunner(this);
    this.skills2 = new SkillEngine(this);
    this.hp = clamp(sheet.p.hp < 0 ? sheet.final.maxHp : sheet.p.hp, 1, sheet.final.maxHp);
    this.sp = clamp(sheet.p.sp < 0 ? sheet.final.maxSp : sheet.p.sp, 0, sheet.final.maxSp);
    this.lastMove = { x: 0, z: 0 }; this.vel = { x: 0, z: 0 }; this.path = []; this.stuck = 0;
    this.dodgeCd = 0; this.potionCd = 0; this.dashT = 0; this.target = null; this.npcTarget = null;
    sheet.events.job.push(() => { this.refreshLook(); this.skills.reset(); this.skills2.clearTemp(); });
    sheet.events.stats.push(() => { this.hp = Math.min(this.hp, this.maxHp); this.sp = Math.min(this.sp, this.maxSp); });
  }
  get maxHp() { return this.stat("maxHp"); }
  get maxSp() { return this.stat("maxSp"); }
  baseStat(s) { return this.sheet.final[s] || 0; }
  get level() { return this.sheet.p.level; } set level(v) { }
  sheetKey() { const j = this.sheet.job; return "player_" + this.sheet.p.gender + "_" + (j && j.sheet ? j.sheet : "novice"); }
  jobKey() { const j = this.sheet.job; return j && j.sheet ? j.sheet : "novice"; }
  async attachBody() {
    if (this.body) this.body.dispose();
    const g = this.sheet.p.gender;
    if (PLAYER_MODELS[g]) {
      // real-time 3D character (sharp at any resolution, smooth turning)
      const [md, sh] = await Promise.all([loadPlayerModel(g), loadActions()]);
      this.body = new ModelBody(G.render.scene, md, sh, this.radius, this.jobKey());
      this.body.weaponId = () => this.sheet.p.weapon;
      if (this.sheet.p.sk && this.sheet.p.sk.dye && this.sheet.p.sk.dye.outfit) this.body.setDye(this.sheet.p.sk.dye.outfit);
      this.body.setFacing(this.facing.x, this.facing.z); this.body.yaw = this.body.targetYaw;
      return;
    }
    const sh = await G.loadSheet(this.sheetKey());
    this.body = new SpriteBody(G.render.scene, sh, this.radius);
    this.body.setDir(dirFromWorld(this.facing.x, this.facing.z));
  }
  refreshLook() {
    if (this.body && this.body.setJob) { this.body.setJob(this.jobKey()); this.body.play("idle", 1, true); return; }
    G.loadSheet(this.sheetKey()).then(sh => { if (this.body) { this.body.setSheet(sh); this.body.play("idle", 1, true); } });
  }

  update(dt, input) {
    this.baseUpdate(dt);
    if (this.dodgeCd > 0) this.dodgeCd -= dt; if (this.potionCd > 0) this.potionCd -= dt; if (this.repathT > 0) this.repathT -= dt;
    this.skills.tick(dt); this.skills2.tick(dt);
    if (this.dead) { this.vel = { x: 0, z: 0 }; return; }
    this.sp = Math.min(this.maxSp, this.sp + this.stat("spRegen") * dt);
    this.sheet.p.playTime += dt;
    // 견습생 '회복력 증가': standing still (no move, no skill) for 3 s -> heal a % of max HP every 3 s
    { const rr = this.sheet.book.passive("restRegen"), still = Math.hypot(this.vel.x, this.vel.z) < 0.05 && !this.skills.busy && this.dashT <= 0;
      if (rr > 0 && still && this.hp < this.maxHp) { this.restT = (this.restT || 0) + dt; if (this.restT >= 3) { this.restT -= 3; this.heal(this.maxHp * rr); G.fx.play("ring", { x: this.pos.x, y: this.pos.y + 0.05, z: this.pos.z }, 0.6, true, [0.6, 1, 0.7]); } }
      else this.restT = 0; }
    if (this.lungeT > 0) {   // skill root motion: glide along the facing without touching the animation (eased out)
      const L = this.lunge, u0 = 1 - this.lungeT / L.dur; this.lungeT = Math.max(0, this.lungeT - dt); const u1 = 1 - this.lungeT / L.dur;
      const e = t => 1 - (1 - t) * (1 - t), k = (e(u1) - e(u0)) * L.dist; this.moveBy(L.dir.x * k, L.dir.z * k);
      if (this.stunned || this.dead) this.lungeT = 0;
    }
    if (this.dashT > 0) return this.updateDash(dt);
    if (this.stunned) { this.vel = { x: 0, z: 0 }; if (!this.skills.busy) this.body.play("hit", 0.5); return; }
    if (input.block) { this.vel = { x: 0, z: 0 }; this.idle(); return; }
    this.actions(input);
    if (this.skills.busy) { this.vel = { x: 0, z: 0 }; return; }
    this.movement(input, dt);
  }
  actions(input) {
    if (input.down.dodge) this.tryDodge(input);
    if (input.down.potion) this.usePotion();
    if (input.down.interact) { const n = this.zone.nearestNpc(this.pos, this.cfg.interactRange); if (n) G.interact(n); }
    const sk = this.sheet.book.sk;
    for (let i = 0; i < 5; i++) {
      const key = i < 4 ? "skill" + (i + 1) : "ult"; if (!input.down[key]) continue;
      const id = i < 4 ? sk.slots[i] : sk.ult;
      if (!id) { G.ui.toast(i < 4 ? "빈 슬롯입니다 (스킬창 K)" : "궁극기가 장착되지 않았습니다"); continue; }
      const d = G.data.skill2(id);
      const e = this.skills2.cast(id, this.aimFor({ targeting: d.target === "ground" ? "ground" : d.target === "self" ? "self" : "dir", range: d.range }, input));
      if (e) G.ui.toast(e);
    }
    if (input.down.attack || input.held.attack) { this.target = null; this.basic(input); }
    if (this.target) {
      if (this.target.dead || this.target.zone !== this.zone) this.target = null;
      else {
        const b = G.data.skill(this.sheet.job.basicAttack), reach = (b ? b.range : 1.5) + this.target.radius * 0.6;
        if (this.dist(this.target) <= reach) { this.path = []; this.basic(input); }
        else if ((!this.path.length || this.stuck > 0.4) && !(this.repathT > 0)) { this.setDest(this.target.pos); this.repathT = 0.25; }
      }
    }
    if (this.npcTarget && Math.hypot(this.pos.x - this.npcTarget.pos.x, this.pos.z - this.npcTarget.pos.z) <= this.cfg.interactRange - 0.2) {
      const n = this.npcTarget; this.npcTarget = null; this.path = []; G.interact(n);
    }
  }
  basic(input) { if (this.skills.busy) return; const s = G.data.skill(this.sheet.job.basicAttack); if (s) this.skills.tryCast(s, this.aimFor(s, input)); }
  aimFor(s, input) {
    if (s.targeting === "ground" && input && !input.mobile && input.pointer) {
      const ray = G.render.screenRay(input.pointer.x, input.pointer.y); const h = this.zone.geo.raycast(ray.o, ray.d); if (h) return h;
    }
    if (s.targeting === "self") return { x: this.pos.x + this.facing.x, z: this.pos.z + this.facing.z };
    const t = this.target && !this.target.dead ? this.target : this.zone.nearestEnemy(this, Math.max(2.2, s.range + 1.2));
    if (t) { if (s.targeting === "ground") return t.pos; const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z, m = Math.hypot(dx, dz) || 1; return { x: this.pos.x + dx / m, z: this.pos.z + dz / m }; }
    const moving = Math.hypot(this.vel.x, this.vel.z) > 0.1, f = moving ? this.lastMove : this.facing;
    const d = s.targeting === "ground" ? Math.min(4, s.range) : 1;
    return { x: this.pos.x + f.x * d, z: this.pos.z + f.z * d };
  }
  movement(input, dt) {
    let mx = 0, mz = 0;
    if (input.move) { this.path = []; this.target = null; this.npcTarget = null; mx = input.move.x; mz = input.move.z; }
    else {
      if (input.click) this.onClick(input.click);
      if (this.path.length) {
        const t = this.path[0], dx = t.x - this.pos.x, dz = t.z - this.pos.z, m = Math.hypot(dx, dz);
        if (m < 0.12) this.path.shift();
        else { const k = Math.min(1, m / Math.max(0.01, this.stat("moveSpeed") * dt)); mx = dx / m * k; mz = dz / m * k; }
      }
    }
    const speed = this.stat("moveSpeed");
    if (mx * mx + mz * mz > 1e-4) {
      const mv = this.moveBy(mx * speed * dt, mz * speed * dt);
      this.vel = { x: mv.x / dt, z: mv.z / dt };
      const m = Math.hypot(mx, mz); this.lastMove = { x: mx / m, z: mz / m }; this.setFacing(mx, mz);
      if (Math.hypot(mv.x, mv.z) < speed * dt * 0.2) this.stuck += dt; else this.stuck = 0;
      if (this.stuck > 0.6 && this.path.length) { this.setDest(this.path[this.path.length - 1]); this.stuck = 0.41; }
      const walk = action(this.body.sh, "walk");
      const rate = clamp(Math.hypot(this.vel.x, this.vel.z) / Math.max(0.5, this.cfg.footStride) * 6 / walk.fps, 0.4, 2.2);
      // pressing into a wall: stand facing it instead of running on the spot with sliding feet
      if (Math.hypot(mv.x, mv.z) > speed * dt * 0.15 || !this.body.md) { this.body.play("walk", rate); this.body.speed = rate; } else this.idle();
    } else { this.vel = { x: 0, z: 0 }; this.idle(); }
  }
  idle() { if (!this.body || this.skills.busy) return; if (this.body.action === "hit" && !this.body.finished) return; this.body.play("idle", 1); }
  onClick(c) {
    const m = this.zone.pickActor(c.x, c.y); if (m) { this.target = m; this.npcTarget = null; this.setDest(m.pos); return; }
    const n = this.zone.pickNpc(c.x, c.y); if (n) { this.npcTarget = n; this.target = null; this.setDest(n.pos); return; }
    const ray = G.render.screenRay(c.x, c.y), h = this.zone.geo.raycast(ray.o, ray.d);
    if (h) { this.target = null; this.npcTarget = null; this.setDest(h); G.fx.clickMark(h); }
  }
  setDest(p) { this.path = this.zone.nav.findPath(this.pos, p); this.stuck = 0; }
  tryDodge(input) {
    if (this.dodgeCd > 0 || (this.skills.busy && this.skills.lock > 0.15)) return;
    const d = input.move ? input.move : (Math.hypot(this.vel.x, this.vel.z) > 0.1 ? this.lastMove : this.facing);
    this.skills.cancel(); this.dodgeCd = this.cfg.dodgeCooldown;
    this.startDash(d, this.cfg.dodgeDistance, this.cfg.dodgeDistance / this.cfg.dodgeDuration, true);
    G.audio.sfx("dodge"); G.fx.play("smoke", { x: this.pos.x, y: this.pos.y + 0.3, z: this.pos.z }, 0.8);
  }
  startLunge(d, dist, dur) { const m = Math.hypot(d.x, d.z) || 1; this.lunge = { dir: { x: d.x / m, z: d.z / m }, dist, dur: Math.max(0.05, dur) }; this.lungeT = this.lunge.dur; }
  startDash(d, dist, speed, inv) {
    const m = Math.hypot(d.x, d.z) || 1; this.dashDir = { x: d.x / m, z: d.z / m }; this.dashSpeed = Math.max(1, speed); this.dashT = dist / this.dashSpeed;
    if (inv) this.invuln = Math.max(this.invuln, this.dashT + 0.1);
    this.setFacing(this.dashDir.x, this.dashDir.z); this.path = []; this.body.play("dash", 1, true);
  }
  updateDash(dt) {
    const s = Math.min(this.dashT, dt); const mv = this.moveBy(this.dashDir.x * this.dashSpeed * s, this.dashDir.z * this.dashSpeed * s);
    this.vel = { x: mv.x / dt, z: mv.z / dt }; this.dashT -= dt; if (this.dashT <= 0) { this.dashT = 0; this.body.play("idle", 1); }
  }
  usePotion() {
    if (this.potionCd > 0 || this.dead) return;
    let order = this.hp < this.maxHp * 0.6 ? ["c_potion_m", "c_potion_s"] : ["c_potion_s", "c_potion_m"];
    if (this.status.has("poison") && this.sheet.bag.count("c_antidote") > 0 && this.hp > this.maxHp * 0.35) order = ["c_antidote"];
    for (const id of order) if (this.sheet.bag.count(id) > 0 && this.useItem(id)) return;
    G.ui.toast("사용할 물약이 없습니다");
  }
  useItem(id) {
    const d = G.data.item(id); if (!d || d.type !== "consumable" || this.dead) return false;
    if (this.potionCd > 0) { G.ui.toast("잠시 후 사용할 수 있습니다"); return false; }
    const u = d.use;
    if (u.dye != null || u.mod || u.emb) return this.useCraftItem(d);
    const useful = ((u.heal > 0 || u.healPercent > 0) && this.hp < this.maxHp) || (u.sp > 0 && this.sp < this.maxSp) || (u.cure && this.status.has(u.cure)) || !!u.status;
    if (!useful) { G.ui.toast("지금은 효과가 없습니다"); return false; }
    if (!this.sheet.bag.remove(id, 1)) return false;
    if (u.heal > 0 || u.healPercent > 0) this.heal(CombatMath.heal(u.heal, u.healPercent, this.maxHp, this.sheet.final.healPower));
    if (u.sp > 0) { this.sp = Math.min(this.maxSp, this.sp + u.sp); G.ui.floatText(this.pos, "+" + u.sp + " 기력", "#80ccff", 0.9, 1.6); }
    if (u.cure) this.status.remove(u.cure);
    if (u.status) { const k = d.id.startsWith('f_') ? 1 + this.sheet.final.foodPower : 1; applyStatus(this, { id: u.status, dur: u.duration * k, val: u.value * (u.status === 'regen' ? this.maxHp : 1), ch: 1 }, this); }
    this.potionCd = Math.max(this.cfg.potionCooldown, u.cooldown);
    G.fx.play("heal", { x: this.pos.x, y: this.pos.y + 0.8, z: this.pos.z }, 1); G.audio.sfx("heal");
    return true;
  }
  /** dye / weapon module / embroidery consumables: applied to the equipped gear, recorded in the save */
  useCraftItem(d) {
    const u = d.use, p = this.sheet.p; p.gearMods = p.gearMods || {};
    if (u.dye != null) { p.sk.dye = p.sk.dye || {}; p.sk.dye.outfit = u.dye; if (this.body && this.body.setDye) this.body.setDye(u.dye); }
    else if (u.mod) { if (!p.weapon) { G.ui.toast("장착한 무기가 없습니다"); return false; } p.gearMods[p.weapon] = Object.assign({}, p.gearMods[p.weapon], { mod: u.mod }); }
    else if (u.emb) { if (!p.armor) { G.ui.toast("장착한 방어구가 없습니다"); return false; } p.gearMods[p.armor] = Object.assign({}, p.gearMods[p.armor], { emb: u.emb }); }
    if (!this.sheet.bag.remove(d.id, 1)) return false;
    this.sheet.recalc(); G.ui.toast(d.name + " 적용"); G.audio.sfx("heal"); return true;
  }
  onKilledMonster(m) { this.skills2.onKill(m); }
  onHitLanded(heavy) { G.render.addShake(heavy ? 0.1 : 0.03, heavy ? 0.16 : 0.07); if (heavy) G.hitStop(this.cfg.hitStop); }
  onDamaged(d, loss) {
    if (d.dot) return;
    if (!this.skills.busy && this.dashT <= 0) this.body.play("hit", 1, true);
    if (loss > this.maxHp * 0.08) G.render.addShake(0.1, 0.15);
    G.audio.sfx("hurt");
  }
  onDeath() { this.skills.cancel(); this.skills2.clearTemp(); this.path = []; G.audio.sfx("die"); G.onPlayerDied(); }
  revive(f) {
    this.dead = false; this.status.clear(); this.hp = Math.max(1, this.maxHp * f); this.sp = this.maxSp * f; this.invuln = 2;
    this.body.play("idle", 1, true); G.fx.play("levelup", { x: this.pos.x, y: this.pos.y + 0.8, z: this.pos.z }, 1.2);
  }
  sync() { const p = this.sheet.p; p.hp = this.hp; p.sp = this.sp; p.facing = Math.atan2(this.facing.x, this.facing.z) / DEG; }
}

// ======================================================================================= monsters
export class Monster extends Combatant {
  constructor(zone, def, pos, home, homeRadius) {
    super(zone, pos, def.radius, "monster");
    this.def = def; this.home = home; this.homeR = homeRadius; this.name = def.name; this.level = def.level; this.hp = def.hp;
    this.state = "idle"; this.timer = 0; this.atkCd = rnd(0.3, 1); this.think = rnd(0.5, 2.5); this.wander = { ...home }; this.aggro = false; this.deadT = 0;
    this.onRemoved = null;
  }
  async attachBody() {
    const sh = await G.loadSheet(this.def.sheet);
    if (CREATURES[this.def.id]) {
      try { this.body = new CreatureBody(G.render.scene, await loadCreature(this.def.id), sh, this.radius); }
      catch (e) { console.warn('creature', this.def.id, e.message); }
    }
    if (!this.body) this.body = new SpriteBody(G.render.scene, sh, this.radius);
    const t = this.zone.tint; this.body.setTint(t[0], t[1], t[2]);
    this.setFacing(rnd(-1, 1), rnd(-1, 1));
  }
  get maxHp() { return this.def.hp; }
  baseStat(s) { return s === "atk" || s === "matk" ? this.def.atk : s === "def" ? this.def.def : s === "moveSpeed" ? this.def.moveSpeed : s === "crit" ? 0.03 : s === "atkSpeed" ? 1 : 0; }
  get player() {
    const p = G.player; if (!p || p.dead || p.zone !== this.zone) return null;
    // taunting summons (고목 수호령, 채색 기사, 마네킹) draw nearby monsters first
    if (p.skills2) for (const s of p.skills2.summons) if (s.taunt && !s.dead && this.dist(s) < 7) return s;
    return p;
  }
  update(dt) {
    this.baseUpdate(dt);
    if (this.atkCd > 0) this.atkCd -= dt;
    if (this.state === "dead") return this.updateDead(dt);
    if (!this.body) return;
    if (this.stunned) { this.cancelAttack(); this.body.play("hit", 0.6); return; }
    if (this.hitReact > 0 && this.state !== "windup") return;
    this.thinkStep(dt);
  }
  thinkStep(dt) {
    const p = this.player, d = p ? this.dist(p) : 999, fromHome = Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z), D = this.def;
    switch (this.state) {
      case "idle":
        if (p && (d < D.detectRange || this.aggro) && Math.abs(p.pos.y - this.pos.y) < 1.2) { this.state = "chase"; this.aggro = true; break; }
        this.doWander(dt); break;
      case "chase":
        if (!p || fromHome > D.leashRange || d > D.detectRange * 2.2) { this.state = "return"; this.aggro = false; break; }
        if (D.ai === "ranged") {
          if (d < 3.2) { this.moveTo({ x: this.pos.x + (this.pos.x - p.pos.x), z: this.pos.z + (this.pos.z - p.pos.z) }, dt, 0.8); this.faceTo(p.pos); }
          else if (d > D.attackRange - 0.5) this.moveTo(p.pos, dt, 1); else { this.body.play("idle"); this.faceTo(p.pos); }
          if (d <= D.attackRange && this.atkCd <= 0) this.beginAttack(p);
        } else {
          if (d > D.attackRange + p.radius * 0.5) this.moveTo(p.pos, dt, 1);
          else if (this.atkCd <= 0) this.beginAttack(p); else { this.body.play("idle"); this.faceTo(p.pos); }
        }
        break;
      case "windup": this.timer -= dt; if (this.timer <= 0) { this.resolve(); this.state = "recover"; this.timer = 0.35; } break;
      case "recover": this.timer -= dt; if (this.timer <= 0) this.state = "chase"; break;
      case "return":
        this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.25 * dt);
        if (fromHome < 1) { this.state = "idle"; this.body.play("idle"); break; }
        this.moveTo(this.home, dt, 1.2);
        if (p && d < D.detectRange * 0.6 && fromHome < D.leashRange * 0.7) this.state = "chase";
        break;
    }
  }
  doWander(dt) {
    this.think -= dt;
    if (this.think <= 0) { this.think = rnd(2, 4.5); const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * this.homeR; this.wander = { x: this.home.x + Math.cos(a) * r, z: this.home.z + Math.sin(a) * r }; }
    if (Math.hypot(this.wander.x - this.pos.x, this.wander.z - this.pos.z) > 0.3) this.moveTo(this.wander, dt, 0.45); else this.body.play("idle");
  }
  moveTo(t, dt, mul) {
    let dx = t.x - this.pos.x, dz = t.z - this.pos.z; const m = Math.hypot(dx, dz); if (m < 0.05) return;
    let vx = dx / m, vz = dz / m;
    for (const o of this.zone.actors) {
      if (o === this || o.dead || o.faction !== this.faction) continue;
      const ox = this.pos.x - o.pos.x, oz = this.pos.z - o.pos.z, om = Math.hypot(ox, oz), min = this.radius + o.radius + 0.1;
      if (om < min && om > 1e-3) { vx += ox / om * (min - om) * 2; vz += oz / om * (min - om) * 2; }
    }
    const vm = Math.hypot(vx, vz) || 1; vx /= vm; vz /= vm;
    const sp = this.stat("moveSpeed") * mul, mv = this.moveBy(vx * sp * dt, vz * sp * dt);
    if (Math.hypot(mv.x, mv.z) < sp * dt * 0.2) { const s = Math.random() < 0.5 ? 1 : -1; this.moveBy(vz * s * sp * dt, -vx * s * sp * dt); }
    this.setFacing(dx, dz); this.body.play("walk", clamp(sp / 2, 0.5, 1.6));
  }
  faceTo(p) { this.setFacing(p.x - this.pos.x, p.z - this.pos.z); }
  beginAttack(p) {
    this.state = "windup"; this.faceTo(p.pos); this.locked = { ...this.facing };
    const w = Math.max(0.2, this.def.windup); this.timer = w; this.atkCd = this.def.attackCooldown;
    const anim = this.body.sh.actions.attack ? "attack" : "idle", ht = hitTime(this.body.sh, anim);
    this.body.play(anim, ht > 0 ? ht / w : 1, true);
    if (this.def.ai === "heavy") { this.tele = G.telegraph(this.zone, this.heavyShape(), w, [1, 0.35, 0.2], null); G.audio.sfx("warn"); }
  }
  heavyShape() { const r = this.def.attackRadius; return HitShape.circle(this.pos.x + this.locked.x * r * 0.55, this.pos.z + this.locked.z * r * 0.55, r); }
  resolve() {
    const p = this.player; this.tele = null;
    if (this.def.ai === "ranged") {
      if (!p) return;
      const st = this.body.cfg && this.body.cfg.atk, kind = { throw: 'acorn', spit: 'spore', ice: 'ice_plate', fire: 'fireball' }[st];
      const pr = Projectile.straight(this.zone, this, { x: this.pos.x, y: this.pos.y + 0.6, z: this.pos.z }, { x: p.pos.x - this.pos.x, z: p.pos.z - this.pos.z }, this.def.projectileSpeed, this.def.attackRange + 2, 1, kind && G.skillFx ? null : this.def.projectileFx);
      if (kind && G.skillFx) { pr.vis = G.skillFx.projectile(kind, { scale: st === 'throw' ? 1.2 : 1 }); pr.hitBurst = { throw: 'hit_blunt', spit: 'explosion_acid', ice: 'explosion_ice', fire: 'explosion_fire' }[st]; }
      G.audio.sfx("throw");
    } else if (this.def.ai === "heavy") {
      const sh = this.heavyShape();
      for (const t of Resolver.targets(this, sh)) t.takeDamage(Resolver.damage(this, t, 1.6, "atk", 1.2));
      const c = this.zone.geo.ground(sh.cx, sh.cz), st = this.body.cfg && this.body.cfg.atk;
      if (G.skillFx && st === 'breath') G.skillFx.slash('fire_cone', this.pos, this.locked, { radius: this.def.attackRadius * 1.5, angle: 70, length: this.def.attackRadius * 1.8 });
      else if (G.skillFx) G.skillFx.burst('ground_crack', c, { radius: this.def.attackRadius * 0.55 });
      else { G.fx.play("ring", { x: c.x, y: c.y + 0.05, z: c.z }, this.def.attackRadius, true, [1, 0.8, 0.6]); G.fx.play("smoke", { x: c.x, y: c.y + 0.3, z: c.z }, 1.6); }
      G.audio.sfx("boss_slam"); if (p && this.dist(p) < 10) G.render.addShake(0.15, 0.25);
    } else {
      const st = this.body.cfg && this.body.cfg.atk, L = this.locked;
      G.audio.sfx(st === 'breath' ? 'fire' : 'monster_attack');
      // charge / headbutt: the body actually lunges forward a little; breath reaches further in a narrower cone
      if (st === 'charge' || st === 'headbutt') this.moveBy(L.x * 0.6, L.z * 0.6);
      const reach = this.def.attackRange + (st === 'breath' ? 1.4 : 0.35), ang = st === 'breath' ? 70 : 110;
      const sh = HitShape.cone(this.pos.x, this.pos.z, L.x, L.z, reach, ang), F = G.skillFx;
      if (F) {
        if (st === 'breath') F.slash('fire_cone', this.pos, L, { radius: reach, angle: ang, length: reach });
        else if (st === 'claw') F.slash('arc', this.pos, L, { radius: reach, angle: 90, color: 0xffe8e0 });
        else if (st === 'charge' || st === 'headbutt' || st === 'tackle' || st === 'bounce' || st === 'bellybump') F.burst('dust', this.pos, { radius: 0.6 });
      }
      for (const t of Resolver.targets(this, sh)) {
        t.takeDamage(Resolver.damage(this, t, 1, "atk", st === 'charge' || st === 'headbutt' || st === 'bellybump' ? 0.9 : 0.4));
        const hp = { x: t.pos.x, y: t.pos.y, z: t.pos.z };
        if (F) F.burst(st === 'claw' ? 'claw_marks' : st === 'bite' ? 'hit_pierce' : st === 'breath' ? 'explosion_fire' : 'hit_blunt', hp, { radius: st === 'breath' ? 0.6 : 0.8 });
        else G.fx.play("hit", { x: t.pos.x, y: t.pos.y + 0.6, z: t.pos.z }, 0.7, false, [1, 0.7, 0.6]);
      }
    }
  }
  cancelAttack() { if (this.state === "windup") this.state = "chase"; if (this.tele) { this.tele.cancel(); this.tele = null; } }
  onDamaged(d) {
    this.aggro = true; if (this.state === "idle" || this.state === "return") this.state = "chase";
    if (!d.dot && this.state !== "windup" && this.def.ai !== "boss" && this.def.ai !== "heavy") { this.hitReact = 0.18; this.body.play("hit", 1, true); }
    G.onMonsterDamaged(this);
  }
  onDeath() { this.cancelAttack(); this.state = "dead"; this.deadT = 0; G.audio.sfx("monster_die"); G.onMonsterKilled(this); }
  updateDead(dt) {
    this.deadT += dt; const total = duration(this.body.sh, "death");
    // dissolve into light (overlaps the reward sequence) instead of blinking: whitens, shrinks a little, gone
    const u = (this.deadT - total * 0.7) / 0.45;
    if (u > 0) { this.body.flash(0.12); const k = 1 - u * u * (3 - 2 * u); if (this.body.root) this.body.root.scale.setScalar(Math.max(0.001, 0.35 + 0.65 * k)); if (u >= 1) this.body.setVisible(false); }
    if (u > 1.1) { this.remove(); }
  }
  remove() { if (this.removed) return; this.removed = true; if (this.onRemoved) this.onRemoved(this); this.zone.removeActor(this); this.body.dispose(); }
}

// ======================================================================================= boss
const P1 = ["slam", "burst3", "slam", "volley3"], P2 = ["slam", "burst5", "ring", "volley4", "slam"], P3 = ["burst5", "slam", "rain", "ring", "volley4"];
export class Boss extends Monster {
  constructor(zone, def, pos, arena) {
    super(zone, def, pos, pos, 1); this.isBoss = true;
    this.fight = false; this.arena = arena; this.phase = 1; this.step = 0; this.patternT = 1.5; this.live = []; this.minions = []; this.timers = [];
  }
  get windMul() { return this.phase === 1 ? 1 : this.phase === 2 ? 0.85 : 0.7; }
  takeDamage(d) { d.knockback = 0; if (!this.fight && !d.dot) G.startBossFight(this); super.takeDamage(d); }
  thinkStep(dt) {
    for (const t of this.timers.slice()) { t.t -= dt; if (t.t <= 0) { this.timers.splice(this.timers.indexOf(t), 1); t.f(); } }
    const p = this.player;
    if (!this.fight || !p) { this.body.play("idle"); return; }
    const f = this.hp / this.maxHp, np = f <= 0.25 ? 3 : f <= 0.6 ? 2 : 1;
    if (np !== this.phase) {
      this.phase = np; this.step = 0;
      G.ui.toast(np === 2 ? this.def.name + "이(가) 힘을 끌어올리기 시작합니다!" : this.def.name + "이(가) 격노했습니다!");
      if (np === 3) this.body.setTint(1, 0.7, 0.7);
      if (np >= 2 && !this.summoned) { this.summoned = true; this.minions.push(...this.zone.summon(this.def.minion || "mon_shroom", this.pos, 2)); }
      G.audio.sfx("warn");
    }
    this.faceTo(p.pos);
    this.patternT -= dt;
    const d = this.dist(p);
    if (this.patternT > 0.6 && d > 5) {
      const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, m = Math.hypot(dx, dz) || 1;
      if (Math.hypot(this.pos.x + dx / m - this.arena.cx, this.pos.z + dz / m - this.arena.cz) < this.arena.r - 2.5) this.moveTo(p.pos, dt, 1); else this.body.play("idle");
    } else if (this.body.action === "walk") this.body.play("idle");
    if (this.patternT > 0) return;
    const seq = this.phase === 1 ? P1 : this.phase === 2 ? P2 : P3;
    const pat = seq[this.step++ % seq.length];
    this.patternT = this.run(pat, p) + 0.7 * this.windMul;
  }
  later(t, f) { this.timers.push({ t, f }); }
  clampArena(x, z, m) { const dx = x - this.arena.cx, dz = z - this.arena.cz, d = Math.hypot(dx, dz), max = this.arena.r - m; return d > max ? { x: this.arena.cx + dx / d * max, z: this.arena.cz + dz / d * max } : { x, z }; }
  playAnim(a, w) { const ht = hitTime(this.body.sh, a); this.body.play(a, ht > 0 ? ht / Math.max(0.2, w) : 1, true); }
  warn(shape, time, onFire) { const t = G.telegraph(this.zone, shape, time, [1, 0.3, 0.25], tt => { this.live.splice(this.live.indexOf(tt), 1); if (!this.dead && this.fight) onFire(tt); }); this.live.push(t); }
  hit(shape, coef, knock, sfx, shake) {
    const hits = Resolver.targets(this, shape, 3);
    for (const t of hits) t.takeDamage(Resolver.damage(this, t, coef, "atk", knock));
    const c = this.zone.geo.ground(shape.cx, shape.cz);
    if (shape.kind === "circle") { G.fx.play("ring", { x: c.x, y: c.y + 0.06, z: c.z }, shape.r, true, [1, 0.6, 0.9]); G.fx.play("smoke", { x: c.x, y: c.y + 0.3, z: c.z }, 1.2); }
    if (shape.kind === "cone") G.fx.play("smoke", { x: this.pos.x + shape.fx * 2.5, y: this.pos.y + 0.4, z: this.pos.z + shape.fz * 2.5 }, 2.2);
    G.audio.sfx(sfx); if (shake) G.render.addShake(0.22, 0.3);
    return hits;
  }
  run(pat, p) {
    const W = this.windMul;
    switch (pat) {
      case "slam": { const w = 1.0 * W; const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z; this.playAnim("attack", w); this.warn(HitShape.cone(this.pos.x, this.pos.z, dx, dz, 4.6, 110), w, t => this.hit(t.shape, 1.4, 2, "boss_slam", true)); return w; }
      case "burst3": case "burst5": {
        const n = pat === "burst3" ? 3 : 5, w = 1.2 * W; this.playAnim("cast", w);
        for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 3.5; const c = i === 0 ? { x: p.pos.x, z: p.pos.z } : this.clampArena(p.pos.x + Math.cos(a) * r, p.pos.z + Math.sin(a) * r, 1.5); this.warn(HitShape.circle(c.x, c.z, 2), w + i * 0.12, t => this.hit(t.shape, 1.2, 0.6, "boss_slam", false)); }
        return w + n * 0.12;
      }
      case "volley3": case "volley4": {
        const n = pat === "volley3" ? 3 : 4; this.playAnim("cast", 0.6);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 4;
          const c = i === 0 ? { x: p.pos.x, z: p.pos.z } : this.clampArena(p.pos.x + Math.cos(a) * r, p.pos.z + Math.sin(a) * r, 1.5);
          const tgt = this.zone.geo.ground(c.x, c.z), flight = Math.hypot(tgt.x - this.pos.x, tgt.z - this.pos.z) / Math.max(1, this.def.projectileSpeed), delay = 0.5 + i * 0.15;
          this.warn(HitShape.circle(c.x, c.z, 1.8), delay + flight, t => { this.hit(t.shape, 0.8, 0, "splash", false); GroundZone.spawn(this.zone, this, t.shape.cx, t.shape.cz, 1.8, 6); });
          this.later(delay, () => { if (!this.dead && this.fight) { Projectile.lob(this.zone, { x: this.pos.x, y: this.pos.y + 2.4, z: this.pos.z }, tgt, this.def.projectileSpeed, this.def.projectileFx, null); G.audio.sfx("throw"); } });
        }
        return 0.5 + n * 0.15 + 0.8;
      }
      case "ring": {
        const w = 1.4 * W; this.playAnim("cast", w);
        this.warn(HitShape.ring(this.pos.x, this.pos.z, 2.6, 7.5), w, t => {
          for (const c of this.hit(t.shape, 1.3, 1.5, "boss_slam", true)) if (!c.dead) c.status.apply(G.data.status("poison"), 4, Math.max(3, this.stat("atk") * 0.15), this);
          G.fx.play("ring", { x: this.pos.x, y: this.pos.y + 0.1, z: this.pos.z }, 7.5, true, [0.8, 0.5, 1]);
        });
        return w;
      }
      case "rain": {
        const w = 1.3 * W; this.playAnim("cast", w);
        for (let i = 0; i < 6; i++) {
          const a = Math.random() * Math.PI * 2;
          const c = i < 2 ? this.clampArena(p.pos.x + Math.cos(a) * 1.5 * Math.random(), p.pos.z + Math.sin(a) * 1.5 * Math.random(), 1.5) : this.clampArena(this.arena.cx + Math.cos(a) * Math.sqrt(Math.random()) * (this.arena.r - 2), this.arena.cz + Math.sin(a) * Math.sqrt(Math.random()) * (this.arena.r - 2), 1.5);
          this.warn(HitShape.circle(c.x, c.z, 1.8), w + i * 0.1, t => { this.hit(t.shape, 1.0, 0, "splash", false); GroundZone.spawn(this.zone, this, t.shape.cx, t.shape.cz, 1.8, 5); });
        }
        return w + 0.6;
      }
    }
    return 1;
  }
  resetFight() {
    this.fight = false;
    for (const t of this.live) t.cancel(); this.live = []; this.timers = [];
    for (const m of this.minions) if (!m.removed) m.remove(); this.minions = [];
    this.hp = this.maxHp; this.phase = 1; this.step = 0; this.summoned = false; this.patternT = 1.5; this.status.clear();
    const t = this.zone.tint; this.body.setTint(t[0], t[1], t[2]); this.teleport(this.home); this.state = "idle";
  }
  onDeath(k) { for (const t of this.live) t.cancel(); this.live = []; this.timers = []; this.fight = false; super.onDeath(k); }
}

// ======================================================================================= NPC
export class Npc {
  constructor(zone, def, pos, yaw) { this.zone = zone; this.def = def; this.pos = pos; this.baseYaw = yaw; this.swap = 0; }
  async attachBody() {
    const mk = NPC_MODELS[this.def.id] ? this.def.id : this.def.model;     // world NPCs borrow a town NPC's 3D model ("model")
    if (NPC_MODELS[mk]) {
      // 3D model (falls back to the sprite sheet if the model file is missing)
      try {
        const [md, sh] = await Promise.all([loadNpcModel(mk), loadActions()]);
        this.body = new ModelBody(G.render.scene, md, sh, 0.34);
        this.faceYaw(this.baseYaw); this.body.yaw = this.body.targetYaw; this.body.place(this.pos); return;
      } catch (e) { console.warn('npc model', this.def.id, e.message); }
    }
    this.body = new SpriteBody(G.render.scene, await G.loadSheet(this.def.sheet), 0.32);
    const t = this.zone.tint; this.body.setTint(t[0], t[1], t[2]); this.faceYaw(this.baseYaw); this.body.place(this.pos);
  }
  faceTo(x, z) { if (this.body.setFacing) this.body.setFacing(x, z); else this.body.setDir(dirFromWorld(x, z)); }
  faceYaw(y) { this.faceTo(Math.sin(y * DEG), Math.cos(y * DEG)); }
  update(dt) {
    if (!this.body) return;
    const p = G.player;
    if (p && p.zone === this.zone && Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < 3.5) this.faceTo(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    else { this.swap -= dt; if (this.swap <= 0) { this.swap = rnd(3, 6); this.faceYaw(this.baseYaw); } }
    this.body.play("idle"); this.body.update(dt);
  }
}

// ======================================================================================= projectiles / zones / loot
export class Projectile {
  static make(zone, fx, from) { const p = new Projectile(); p.zone = zone; p.pos = { ...from }; p.f = fx ? G.fx.play(fx, from, 1, false, null, true) : null; p.gen = p.f ? p.f.gen : 0; zone.things.push(p); return p; }
  static lob(zone, from, to, speed, fx, onLand) { const p = Projectile.make(zone, fx, from); Object.assign(p, { lob: true, from, to, onLand, t: 0, flight: Math.hypot(to.x - from.x, to.z - from.z) / Math.max(1, speed) }); return p; }
  static straight(zone, owner, from, dir, speed, range, coef, fx) { const p = Projectile.make(zone, fx, from); const m = Math.hypot(dir.x, dir.z) || 1; Object.assign(p, { owner, dir: { x: dir.x / m, z: dir.z / m }, speed, range, coef, travelled: 0 }); return p; }
  update(dt) {
    if (this.lob) {
      this.t += dt; const k = this.flight > 0 ? clamp01(this.t / this.flight) : 1;
      this.pos = { x: this.from.x + (this.to.x - this.from.x) * k, y: this.from.y + (this.to.y - this.from.y) * k + Math.sin(k * Math.PI) * Math.min(2.5, this.flight * 3), z: this.from.z + (this.to.z - this.from.z) * k };
      if (this.f) G.fx.move(this.f, this.gen, this.pos);
      if (k >= 1) { if (this.onLand) this.onLand(this.to); this.done(); }
      return;
    }
    const sx = this.dir.x * this.speed * dt, sz = this.dir.z * this.speed * dt;
    this.pos = { x: this.pos.x + sx, y: this.pos.y, z: this.pos.z + sz }; this.travelled += Math.hypot(sx, sz);
    if (this.f) G.fx.move(this.f, this.gen, this.pos); if (this.vis) this.vis.set(this.pos, { x: this.dir.x, y: 0, z: this.dir.z });
    if (this.zone.geo.blocked(this.pos.x, this.pos.z, 0.05) || this.travelled >= this.range) { G.fx.play("smoke", this.pos, 0.5); return this.done(); }
    for (const c of this.zone.actors) {
      if (c.dead || c.faction === this.owner.faction) continue;
      if (Math.hypot(this.pos.x - c.pos.x, this.pos.z - c.pos.z) <= c.radius + 0.2 && Math.abs(this.pos.y - (c.pos.y + 0.7)) < 1.6) {
        c.takeDamage(Resolver.damage(this.owner, c, this.coef, "atk", 0.3));
        if (this.hitBurst && G.skillFx) G.skillFx.burst(this.hitBurst, { x: c.pos.x, y: c.pos.y, z: c.pos.z }, { radius: 0.7 }); else G.fx.play("hit", this.pos, 0.7, false, [0.85, 0.6, 1]);
        G.audio.sfx("hit"); return this.done();
      }
    }
  }
  done() { this.dead = true; if (this.f) G.fx.release(this.f, this.gen); if (this.vis) { this.vis.dispose(); this.vis = null; } }
  dispose() { if (this.f) G.fx.release(this.f, this.gen); if (this.vis) { this.vis.dispose(); this.vis = null; } }
}

export class GroundZone {
  static spawn(zone, owner, x, z, r, life) {
    const g = new GroundZone(); g.zone = zone; g.owner = owner; g.shape = HitShape.circle(x, z, r); g.life = life; g.tick = 0;
    g.view = new TelegraphView(G.render.scene, g.shape, zone.geo, [0.62, 0.25, 0.85], true);
    zone.things.push(g); return g;                          // bubbles / rim are drawn by the zone's painted decal shader
  }
  update(dt) {
    this.life -= dt; this.tick -= dt;
    if (this.life <= 0) { this.dead = true; this.view.dispose(); return; }
    if (this.tick > 0) return; this.tick = 0.5;
    const p = G.player;
    if (p && !p.dead && this.owner && this.shape.overlaps(p.pos.x, p.pos.z, p.radius)) {
      p.takeDamage(Object.assign(Resolver.damage(this.owner, p, 0.25, "atk", 0), { noMiss: true }));
      if (!p.dead) p.status.apply(G.data.status("poison"), 3, Math.max(2, this.owner.stat("atk") * 0.12), this.owner);
    }
  }
  dispose() { this.view.dispose(); }
}

export class Loot {
  constructor(zone, id, count, at) {
    this.zone = zone; this.id = id; this.count = count; this.t = 0; this.life = 120; this.warn = 0;
    const a = Math.random() * Math.PI * 2, r = Math.random() * 0.6; this.pos = zone.geo.ground(at.x + Math.cos(a) * r, at.z + Math.sin(a) * r);
    const def = G.data.item(id);
    this.is3d = hasItemModel(id);
    this.mesh = this.is3d ? lootModel(id) : G.ui.iconMesh(def ? def.icon : null); G.render.scene.add(this.mesh);
    if (G.skillFx) G.skillFx.burst("sparks", { x: this.pos.x, y: this.pos.y + 0.3, z: this.pos.z }, { radius: 0.35, color: 0xffe08a });
  }
  update(dt) {
    this.t += dt; this.life -= dt; if (this.warn > 0) this.warn -= dt;
    const p = G.player;
    if (p && !p.dead && p.zone === this.zone) {
      const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
      if (d < 1.8 && p.sheet.bag.spaceFor(this.id) > 0) {
        const k = Math.min(1, dt * 7 / Math.max(d, 0.01)); this.pos = { x: this.pos.x + (p.pos.x - this.pos.x) * k, y: p.pos.y, z: this.pos.z + (p.pos.z - this.pos.z) * k };
        if (d < 0.45) { const n = p.sheet.bag.add(this.id, this.count); if (n > 0) { this.count -= n; G.ui.itemToast(G.data.item(this.id), n); G.audio.sfx("pickup"); } if (this.count <= 0) return this.done(); }
      } else if (d < 1 && this.warn <= 0) { G.ui.toast("가방이 가득 찼습니다"); this.warn = 4; }
    }
    this.mesh.position.copy(T({ x: this.pos.x, y: this.pos.y + 0.2 + Math.abs(Math.sin(this.t * 3)) * 0.15, z: this.pos.z }));
    if (this.is3d) this.mesh.rotation.y = this.t * 1.6; else this.mesh.quaternion.copy(G.render.cam.quaternion);
    if (this.life <= 0) this.done();
  }
  done() { this.dead = true; this.dispose(); }
  dispose() { G.render.scene.remove(this.mesh); }
}
