// Art-direction comparison captures from the real game (not renders): town fountain, forest path, close to trees,
// combat, NPC dialog, phone. Usage: SIZES=1448x1086,1672x941,390x844t ONLY=forest,town node tools/browser-tests/styleshots.js
//   -> OUT/s_<size>_<shot>.png + per-shot frame time / draw calls / triangles (SwiftShader: relative numbers only)
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/style'; fs.mkdirSync(OUT, { recursive: true });
const ONLY = (process.env.ONLY || 'town,forest').split(',');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const sz of (process.env.SIZES || '1448x1086').split(',')) {
    const touch = sz.endsWith('t'), [W, H] = sz.replace('t', '').split('x').map(Number);
    const pg = await (await b.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch })).newPage(); const errs = [];
    pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await pg.addInitScript(() => { window.__fr = 0; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = f => raf(t => { window.__fr++; f(t); }); });
    const ev = (f, a) => pg.evaluate(f, a);
    const frames = async n => { const f0 = await ev(() => window.__fr); await pg.waitForFunction(([f0, n]) => window.__fr >= f0 + n, [f0, n], { timeout: 600000 }); };
    await pg.goto('http://localhost:8765/index.html?sim=2', { timeout: 300000 });
    const clickLabel = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)), t, { timeout: 300000 });
      await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)).click(), t); };
    await ev(() => localStorage.clear()); await clickLabel('새 게임'); await clickLabel('모험 시작');
    await pg.waitForFunction(() => window.G && G.inWorld && !G.loading, null, { timeout: 300000 });
    await ev(() => { G.profile.ui = Object.assign(G.profile.ui || {}, { qwin: 'min' }); G.ui.renderQuestHud(true); });
    // draw calls / triangles of one whole frame (all passes: shadow map, scene, post)
    const stats = async () => { await ev(() => { const i = G.render.r.info; i.autoReset = false; i.reset(); }); await frames(1);
      return ev(() => { const i = G.render.r.info; const o = { calls: i.render.calls, tris: i.render.triangles }; i.autoReset = true; return o; }); };
    const shot = async name => {
      await frames(6); const t0 = Date.now(); await frames(4); const ms = (Date.now() - t0) / 4;
      const s = await stats(); console.log(sz, name, JSON.stringify({ msPerFrame: Math.round(ms), ...s }));
      await pg.screenshot({ path: `${OUT}/s_${sz}_${name}.png`, timeout: 300000 });
    };
    const go = (x, z) => ev(([x, z]) => { const p = G.player; p.teleport({ x, z }); p.path = []; G.render.setFocus(p.pos, true); p.body && p.body.place && p.body.place(p.pos); G.ui.toasts.innerHTML = ''; }, [x, z]);
    if (ONLY.includes('town')) {
      await pg.waitForFunction(() => !document.querySelector('.areabanner'), null, { timeout: 60000 }).catch(() => {});
      await shot('town_start');
      const e = await ev(() => { const n = G.zone.npcs.find(n => n.def.id === 'elder'); return [n.pos.x, n.pos.z]; });
      await go(e[0] + 0.6, e[1] - 1.2); await shot('town_fountain');
      await ev(() => G.interact(G.zone.npcs.find(n => n.def.id === 'elder'))); await shot('town_dialog'); await ev(() => G.ui.close());
    }
    if (ONLY.includes('forest')) {
      await ev(() => G.loadZone('forest', 'from_town', false)); await pg.waitForFunction(() => !G.loading && G.zone.def.id === 'forest', null, { timeout: 600000 });
      await frames(4); await shot('forest_entry');
      for (const [n, x, z] of (process.env.SPOTS || 'path,-17,-19.5;trees,-30,6;open,10,-6').split(';').map(s => s.split(',')).map(([n, x, z]) => [n, +x, +z])) { await go(x, z); await shot('forest_' + n); }
      const m = await ev(() => { const p = G.player, m = G.zone.actors.find(a => a !== p && a.hp > 0 && a.def && !a.def.boss); return m ? [m.pos.x, m.pos.z] : null; });
      if (m) { await go(m[0] - 1.2, m[1] - 1.2); for (let i = 0; i < 4; i++) { await ev(() => G.input.press('attack')); await frames(5); } await shot('forest_combat'); }
    }
    if (ONLY.includes('fields')) for (const zid of ['mist_valley', 'frost_highland', 'dragon_ruins']) {
      await ev(z => G.loadZone(z, G.data.zones[z].spawns[0].id, false), zid); await pg.waitForFunction(z => !G.loading && G.zone.def.id === z, zid, { timeout: 600000 });
      await shot(zid + '_entry');
      const m = await ev(() => { const p = G.player, m = G.zone.actors.find(a => a !== p && a.hp > 0 && a.def && !a.def.boss); return m ? [m.pos.x, m.pos.z] : null; });
      if (m) { await go(m[0] - 2, m[1] - 2); await shot(zid + '_camp'); }
    }
    console.log(sz, 'errors', JSON.stringify(errs.slice(0, 5)));
    await pg.close();
  }
  await b.close();
})();
