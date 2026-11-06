// New world monster species line-up in the real game (2026-11-06): each species spawned in a row in front of the player
// on an open meadow, AI frozen, then one screenshot per group, plus each species' own field.
// Usage: OUT=/tmp/mons IDS=mon_mole,mon_hawk node tools/browser-tests/monstershots.js
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/mons'; fs.mkdirSync(OUT, { recursive: true });
const IDS = (process.env.IDS || 'mon_mole,mon_sapling,mon_beetle,mon_hawk,mon_moth,mon_owl,mon_spider,mon_spider_elite,mon_wisp,mon_wraith,mon_scorpion,mon_soldier,mon_crab,mon_salamander,mon_crystal,mon_yeti,mon_armor,mon_bat').split(',');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: 1400, height: 900 } })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.addInitScript(() => { window.__fr = 0; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = f => raf(t => { window.__fr++; f(t); }); });
  const ev = (f, a) => pg.evaluate(f, a);
  const frames = async n => { const f0 = await ev(() => window.__fr); await pg.waitForFunction(([f0, n]) => window.__fr >= f0 + n, [f0, n], { timeout: 900000 }); };
  await pg.goto('http://localhost:8765/index.html', { timeout: 300000 });
  const clickLabel = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)), t, { timeout: 300000 });
    await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)).click(), t); };
  await ev(() => localStorage.clear()); await clickLabel('새 게임'); await clickLabel('모험 시작');
  await pg.waitForFunction(() => window.G && G.inWorld && !G.loading, null, { timeout: 300000 });
  await ev(() => { G.profile.ui = Object.assign(G.profile.ui || {}, { qwin: 'min' }); G.ui.renderQuestHud(true); G.player.hp = G.player.maxHp = 1e9; });
  await ev(() => G.loadZone('capital_road', null, false)); await pg.waitForFunction(() => !G.loading && G.zone.def.id === 'capital_road', null, { timeout: 900000 });
  for (let k = 0; k < IDS.length; k += 3) {
    const ids = IDS.slice(k, k + 3);
    const r = await ev(async ids => {
      const A = await import('./js/actors.js'); const Z = G.zone, p = G.player;
      for (const a of Z.actors.filter(a => a.def && a.faction !== 'player' && !a.dead && a.lineup)) { a.lineup = false; a.hp = 0; a.pos.x += 400; if (a.body && a.body.root) a.body.root.visible = false; if (a.body && a.body.shadow) a.body.shadow.visible = false; }
      const c = { x: p.pos.x, z: p.pos.z + 3.2 };
      const out = [];
      for (let i = 0; i < ids.length; i++) {
        const md = G.data.monsters[ids[i]]; const q = Z.geo.nearestFree(c.x + (i - (ids.length - 1) / 2) * 3.0, c.z, 0.6); const pos = Z.geo.ground(q.x, q.z);
        const m = new A.Monster(Z, md, pos, pos, 0.5); m.lineup = true;
        Z.actors.push(m); await m.attachBody(); m.body.place(m.pos);
        out.push(md.name + ' Lv' + md.level);
      }
      G.ui.toasts.innerHTML = ''; return out;
    }, ids);
    await ev(() => new Promise(r => setTimeout(r, 5000))); await frames(3);
    console.log('group', k / 3, JSON.stringify(r));
    console.log(JSON.stringify(await ev(() => G.zone.actors.filter(a => a.def && a.faction !== 'player' && !a.dead).map(a => { const b = a.body; let mv = []; b.model && b.model.traverse(o => { if (o.isMesh) mv.push([o.visible, o.material.opacity, o.material.transparent, o.material.visible]); });
      return { id: a.def.id, cls: b.constructor.name, root: b.root && [b.root.visible, ...b.root.position.toArray().map(v => +v.toFixed(2)), ...b.root.scale.toArray().map(v => +v.toFixed(2))], inner: b.inner && b.inner.scale.toArray().map(v => +v.toFixed(3)), piv: b.pivot && [...b.pivot.position.toArray(), ...b.pivot.scale.toArray()].map(v => +v.toFixed(2)), mv, pos: [a.pos.x, a.pos.z].map(v => +v.toFixed(1)) }; }))));
    await pg.screenshot({ path: `${OUT}/m_${String(k / 3).padStart(2, '0')}.png`, timeout: 600000 });
  }
  console.log('errors', JSON.stringify(errs.slice(0, 8)));
  await b.close();
})();
