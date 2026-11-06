// Enlarged fields check (2026-11-06): loads every field + the mushroom grove in the real game, reports load time,
// monster count / spacing / how many stand near trees, draw calls, then takes a shot near a monster and walks into the
// forest -> grove warp.  Usage: OUT=/tmp/fields ZONES=forest,mushroom_grove node tools/browser-tests/fieldshots.js
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/fields'; fs.mkdirSync(OUT, { recursive: true });
const ZONES = (process.env.ZONES || 'forest,mushroom_grove,mist_valley,frost_highland,dragon_ruins').split(',');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: 1280, height: 860 } })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.addInitScript(() => { window.__fr = 0; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = f => raf(t => { window.__fr++; f(t); }); });
  const ev = (f, a) => pg.evaluate(f, a);
  const frames = async n => { const f0 = await ev(() => window.__fr); await pg.waitForFunction(([f0, n]) => window.__fr >= f0 + n, [f0, n], { timeout: 900000 }); };
  await pg.goto('http://localhost:8765/index.html', { timeout: 300000 });
  const clickLabel = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)), t, { timeout: 300000 });
    await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)).click(), t); };
  await ev(() => localStorage.clear()); await clickLabel('새 게임'); await clickLabel('모험 시작');
  await pg.waitForFunction(() => window.G && G.inWorld && !G.loading, null, { timeout: 300000 });
  await ev(() => { G.profile.ui = Object.assign(G.profile.ui || {}, { qwin: 'min' }); G.ui.renderQuestHud(true); G.player.hp = G.player.maxHp = 1e6; });
  for (const zid of ZONES) {
    const t0 = Date.now();
    await ev(z => G.loadZone(z, null, false), zid); await pg.waitForFunction(z => !G.loading && G.zone.def.id === z, zid, { timeout: 900000 });
    const loadS = (Date.now() - t0) / 1000; await frames(3);
    const info = await ev(() => {
      const Z = G.zone, ms = Z.actors.filter(a => a.def && a.faction !== 'player' && !a.dead && a !== Z.boss), g = Z.geo;
      let minGap = 1e9, sumNN = 0, nearTree = 0;
      for (const a of ms) { let nn = 1e9; for (const o of ms) if (o !== a) nn = Math.min(nn, Math.hypot(a.pos.x - o.pos.x, a.pos.z - o.pos.z)); minGap = Math.min(minGap, nn); sumNN += nn;
        if (g.circles.some(c => /tree|pine|mushtree/.test(c.tag) && Math.hypot(c.x - a.pos.x, c.z - a.pos.z) < 4)) nearTree++; }
      const i = G.render.r.info; return { bounds: Z.def.bounds, monsters: ms.length, minGap: +minGap.toFixed(1), avgNN: +(sumNN / Math.max(1, ms.length)).toFixed(1), nearTree,
        boss: Z.boss ? Z.boss.def.id : null, portals: Z.def.portals.map(p => p.id + '→' + p.targetZone), calls: i.render.calls, tris: i.render.triangles };
    });
    console.log(zid, 'load', loadS + 's', JSON.stringify(info));
    // stand a few metres from the monster nearest the entrance
    await ev(() => { const Z = G.zone, p = G.player, ms = Z.actors.filter(a => a.def && a.faction !== 'player' && !a.dead && a !== Z.boss);
      ms.sort((a, b) => Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z) - Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z));
      const m = ms[0]; if (m) { const q = Z.geo.nearestFree(m.pos.x - 3, m.pos.z - 3, 0.4); p.teleport(q); p.path = []; G.render.setFocus(p.pos, true); } G.ui.toasts.innerHTML = ''; });
    await frames(8); await pg.screenshot({ path: `${OUT}/f_${zid}.png`, timeout: 600000 });
  }
  // warp: forest -> grove through the new portal
  if (ZONES.includes('forest')) {
    await ev(() => G.loadZone('forest', 'from_town', false)); await pg.waitForFunction(() => !G.loading && G.zone.def.id === 'forest', null, { timeout: 900000 });
    await ev(() => { const pt = G.zone.def.portals.find(p => p.id === 'to_grove'); G.player.teleport({ x: pt.pos[0] - 2.5, z: pt.pos[1] }); G.player.path = []; G.render.setFocus(G.player.pos, true); });
    await frames(6); await pg.screenshot({ path: `${OUT}/f_forest_warp.png`, timeout: 600000 });
    await ev(() => { const pt = G.zone.def.portals.find(p => p.id === 'to_grove'); G.player.teleport({ x: pt.pos[0], z: pt.pos[1] }); });
    const ok = await pg.waitForFunction(() => !G.loading && G.zone.def.id === 'mushroom_grove', null, { timeout: 900000 }).then(() => true, () => false);
    console.log('warp forest→grove', ok, await ev(() => [G.zone.def.id, +G.player.pos.x.toFixed(1), +G.player.pos.z.toFixed(1)]));
    await frames(6); await pg.screenshot({ path: `${OUT}/f_grove_arrive.png`, timeout: 600000 });
  }
  console.log('errors', JSON.stringify(errs.slice(0, 8)));
  await b.close();
})();
