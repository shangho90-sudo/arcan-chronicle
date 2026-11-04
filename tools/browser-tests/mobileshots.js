// Phone layout screenshots: HUD (town / forest fight) and every game window, portrait and landscape, with box report.
// Usage: SIZES=390x844,844x390 node tools/browser-tests/mobileshots.js  -> OUT/m_<size>_<name>.png (touch device)
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/mob'; fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const sz of (process.env.SIZES || '390x844,844x390').split(',')) {
    const [W, H] = sz.split('x').map(Number);
    const pg = await (await b.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true })).newPage(); const errs = [];
    pg.on('pageerror', e => errs.push('PAGEERR ' + e.message));
    await pg.addInitScript(() => { window.__fr = 0; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = f => raf(t => { window.__fr++; f(t); }); });
    const ev = (f, a) => pg.evaluate(f, a);
    const frames = async n => { const f0 = await ev(() => window.__fr); await pg.waitForFunction(([f0, n]) => window.__fr >= f0 + n, [f0, n], { timeout: 300000 }); };
    await pg.goto('http://localhost:8765/index.html?sim=2', { timeout: 300000 });
    const clickLabel = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)), t, { timeout: 300000 });
      await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)).click(), t); };
    await ev(() => localStorage.clear()); await clickLabel('새 게임'); await clickLabel('모험 시작');
    await pg.waitForFunction(() => window.G && G.inWorld && !G.loading, null, { timeout: 300000 });
    const report = name => ev(() => {
      const out = {}; for (const s of ['.charpanel', '.minimap', '.botbar', '.qhud', '.qh-reopen', '.target', '.prompt', '.feed', '.actions', '.stickbase', '.window', '.toasts']) {
        const e = document.querySelector(s); if (!e) continue; const cs = getComputedStyle(e); if (cs.display === 'none') continue; const r = e.getBoundingClientRect(); if (!r.width) continue;
        out[s] = [r.left, r.top, r.right, r.bottom].map(Math.round); }
      return out; }).then(o => console.log(sz, name, JSON.stringify(o)));
    const shot = async name => { await frames(3); await report(name); await pg.screenshot({ path: `${OUT}/m_${sz}_${name}.png`, timeout: 300000 }); };
    await pg.waitForFunction(() => !document.querySelector('.areabanner'), null, { timeout: 60000 }).catch(() => {});
    await shot('town');
    await ev(() => { const n = G.zone.npcs.find(n => n.def.id === 'elder'); G.player.teleport({ x: n.pos.x, z: n.pos.z - 1.3 }); });
    await shot('prompt');
    await ev(() => G.interact(G.zone.npcs.find(n => n.def.id === 'elder'))); await shot('dialog');
    await ev(() => { G.ui.close(); const S = G.sheet; S.p.level = 12; S.p.job = 'cook'; S.book.grantPoints(); S.recalc(); for (const [id, n] of [['m_jelly', 9], ['m_spore', 4]]) S.bag.add(id, n); });
    for (const k of ['inventory', 'skills', 'quests', 'shop', 'craft', 'pause']) {
      await ev(k => { const U = G.ui; U.close();
        if (k === 'inventory') U.showInventory(); if (k === 'skills') U.showSkills(); if (k === 'quests') U.showQuests(); if (k === 'pause') U.showPause();
        if (k === 'shop') { const id = Object.keys(G.data.shops)[0]; U.showShop(G.data.shops[id]); }
        if (k === 'craft') U.showCraft(); }, k);
      await shot('win_' + k);
    }
    await ev(() => G.ui.close());
    await ev(() => G.loadZone('forest', 'from_town', false)); await pg.waitForFunction(() => !G.loading && G.zone.def.id === 'forest', null, { timeout: 300000 });
    await ev(() => { const p = G.player, m = G.zone.actors.find(a => a !== p && a.hp > 0 && a.def && !a.def.boss); p.teleport({ x: m.pos.x, z: m.pos.z - 1.6 }); G.render.setFocus(p.pos, true); });
    for (let i = 0; i < 5; i++) { await ev(() => G.input.press('attack')); await frames(10); }
    await shot('forest');
    console.log(sz, 'errors', errs.slice(0, 4)); await pg.close();
  }
  await b.close();
})();
