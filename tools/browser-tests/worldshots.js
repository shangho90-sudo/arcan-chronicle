// World check (2026-11-06): world map window, the town -> 왕도 가는 길 warp, then a sample of the new towns / fields.
// Usage: OUT=/tmp/world ZONES=kairion_capital,blue_forest SIZE=1280x860 node tools/browser-tests/worldshots.js   (SIZE=390x844t = phone)
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/world'; fs.mkdirSync(OUT, { recursive: true });
const ZONES = (process.env.ZONES || 'kairion_capital,blue_forest,crimson_forest,zirat_abyss_rim,frozen_lake,baltern_quarry,broken_bridge,lumiere').split(',').filter(Boolean);
const SZ = process.env.SIZE || '1280x860', touch = SZ.endsWith('t'), [W, H] = SZ.replace('t', '').split('x').map(Number);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.addInitScript(() => { window.__fr = 0; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = f => raf(t => { window.__fr++; f(t); }); });
  const ev = (f, a) => pg.evaluate(f, a);
  const frames = async n => { const f0 = await ev(() => window.__fr); await pg.waitForFunction(([f0, n]) => window.__fr >= f0 + n, [f0, n], { timeout: 900000 }); };
  await pg.goto('http://localhost:8765/index.html', { timeout: 300000 });
  const clickLabel = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)), t, { timeout: 300000 });
    await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)).click(), t); };
  await ev(() => localStorage.clear()); await clickLabel('새 게임'); await clickLabel('모험 시작');
  await pg.waitForFunction(() => window.G && G.inWorld && !G.loading, null, { timeout: 300000 });
  await ev(() => { G.profile.ui = Object.assign(G.profile.ui || {}, { qwin: 'min' }); G.ui.renderQuestHud(true); G.player.hp = G.player.maxHp = 1e6; G.ui.toasts.innerHTML = ''; });
  const tag = touch ? 'phone_' : '';
  // world map from the menu button
  await ev(() => [...document.querySelectorAll('.menubtns [data-a="map"]')][0].click()); await frames(4);
  console.log('map window', await ev(() => [G.ui.currentName, document.querySelectorAll('.wmnode').length, document.querySelectorAll('.wmroad').length]));
  await pg.screenshot({ path: `${OUT}/${tag}w_map.png`, timeout: 600000 });
  await ev(() => { const n = document.querySelector('.wmnode[data-z="blue_forest"]'); n.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await frames(2);
  console.log('map info', await ev(() => document.querySelector('.wminfo').textContent));
  await ev(() => G.ui.close()); await frames(2);
  if (touch) { await pg.screenshot({ path: `${OUT}/${tag}w_town_hud.png`, timeout: 600000 }); console.log('errors', JSON.stringify(errs.slice(0, 8))); await b.close(); return; }
  // town warp -> 왕도 가는 길
  await ev(() => { const pt = G.zone.def.portals.find(p => p.id === 'to_capital_road'); G.player.teleport({ x: pt.pos[0] - 2.4, z: pt.pos[1] + 2 }); G.player.path = []; G.render.setFocus(G.player.pos, true); });
  await frames(6); await pg.screenshot({ path: `${OUT}/w_town_warp.png`, timeout: 600000 });
  await ev(() => { const pt = G.zone.def.portals.find(p => p.id === 'to_capital_road'); G.player.teleport({ x: pt.pos[0], z: pt.pos[1] }); });
  const ok = await pg.waitForFunction(() => !G.loading && G.zone.def.id === 'capital_road', null, { timeout: 900000 }).then(() => true, () => false);
  console.log('warp town→capital_road', ok); await frames(6); await pg.screenshot({ path: `${OUT}/w_capital_road.png`, timeout: 600000 });
  for (const zid of ZONES) {
    const t0 = Date.now();
    await ev(z => G.loadZone(z, null, false), zid); await pg.waitForFunction(z => !G.loading && G.zone.def.id === z, zid, { timeout: 900000 });
    const s = (Date.now() - t0) / 1000; await frames(4);
    const info = await ev(() => { const Z = G.zone; return { kind: Z.def.kind, props: (Z.def.props || []).length, monsters: Z.actors.filter(a => a.def && a.faction !== 'player' && !a.dead).length,
      npcs: Z.actors.filter(a => a.constructor.name === 'Npc').length, portals: Z.def.portals.map(p => p.label) }; });
    console.log(zid, 'load', s + 's', JSON.stringify(info));
    if (info.kind !== 'town') await ev(() => { const Z = G.zone, p = G.player, ms = Z.actors.filter(a => a.def && a.faction !== 'player' && !a.dead);
      ms.sort((a, b) => Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z) - Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z));
      const m = ms[0]; if (m) { const q = Z.geo.nearestFree(m.pos.x - 3, m.pos.z - 3, 0.4); p.teleport(q); p.path = []; G.render.setFocus(p.pos, true); } });
    else await ev(() => { G.player.teleport({ x: 0, z: -11 }); G.render.setFocus(G.player.pos, true); });
    await ev(() => { G.ui.toasts.innerHTML = ''; }); await frames(8); await pg.screenshot({ path: `${OUT}/w_${zid}.png`, timeout: 600000 });
  }
  console.log('errors', JSON.stringify(errs.slice(0, 8)));
  await b.close();
})();
