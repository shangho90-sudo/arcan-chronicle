// Developer test tool (only with ?dev=1 or from automated tests via G.dev): level / job / skills / items / dummies.
export function installDev(G, Monster) {
  G.dev = {
    level(n) { const s = G.sheet; s.p.level = Math.max(1, Math.min(G.data.levels.maxLevel, n)); s.p.exp = 0; s.book.grantPoints(); s.recalc(); G.player.hp = G.player.maxHp; G.player.sp = G.player.maxSp; },
    job(id) { const s = G.sheet; const j = G.data.job(id); if (j.tier === 2) { if (s.p.job !== j.parent) { s.p.job = j.parent; } const q = j.trialQuest; if (q && !s.p.quests.find(x => x.id === q)) s.p.quests.push({ id: q, state: 'completed', counts: [1, 30] }); } return s.chooseJob(id); },
    learnAll(job) { const b = G.sheet.book; b.sk.points += 999; for (const d of G.data.skillsOf(job || G.sheet.p.job)) while (b.level(d.id) < d.maxLv && !b.learnBlock(d.id)) b.learn(d.id); G.sheet.recalc(); },
    equip(ids, ult) { const b = G.sheet.book; ids.forEach((id, i) => b.equip(id, i, false)); if (ult) b.equip(ult, 0, false); },
    items(list) { for (const [id, n] of list) G.sheet.bag.add(id, n); },
    full() { const p = G.player; p.hp = p.maxHp; p.sp = p.maxSp; p.skills2.res.power = 10; p.skills2.res.phrase = 8; p.skills2.cd = {}; p.potionCd = 0; },
    dummies(id, n, r = 3.5, at) { const z = G.zone, p = at || G.player.pos, md = G.data.monsters[id], out = [];
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, pos = z.geo.nearestFree(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, md.radius);
        const m = new Monster(z, md, pos, pos, 0.5); const big = md.hp * 50; Object.defineProperty(m, 'maxHp', { get: () => big }); m.hp = big; m.dummy = true; z.actors.push(m); m.attachBody().then(() => m.body.place(m.pos)); out.push(m); }
      return out; },
    clearMonsters() { for (const a of G.zone.actors.slice()) if (a.faction === 'monster') a.remove ? a.remove() : null; },
  };
}
