// Screenshots of the ornate windows (가방·장비, 스킬 — 견습생 and a 2nd-job character with three skill columns).
// Usage: node tools/browser-tests/windowshots.js  -> OUT/win_*.png   (W/H for the viewport)
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/win'; fs.mkdirSync(OUT, { recursive: true });
const W = +process.env.W || 1672, H = +process.env.H || 941;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: W, height: H } })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a), wait = ms => pg.waitForTimeout(ms);
  await pg.goto(process.env.URL || 'http://localhost:8765/index.html');
  const clickLabel = async (t) => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[role=button],[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)), t, { timeout: 300000 });
    await ev(t => [...document.querySelectorAll('button,[role=button],[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)).click(), t); await wait(500); };
  await clickLabel('새 게임'); if (await pg.locator('button', { hasText: '확인' }).count()) await pg.locator('button', { hasText: '확인' }).first().click();
  await clickLabel('모험 시작');
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading, null, { timeout: 300000 });
  await wait(1500);
  await ev(() => { const S = G.sheet, bk = S.book; S.p.level = 5; bk.grantPoints(); S.recalc(); for (const id of ['nv_a1', 'nv_a1', 'nv_a1', 'nv_p1']) bk.learn(id); bk.equip && bk.equip('nv_a1', 0, false);
    const bag = S.bag; for (const [id, n] of [['m_jelly', 9], ['m_spore', 4], ['m_wolf_fang', 1], ['m_boar_tusk', 1]]) { try { bag.add(id, n); } catch (e) {} } S.p.gold = 220; G.ui.toasts.innerHTML = ''; });
  await ev(() => G.ui.showInventory()); await wait(800); await pg.screenshot({ path: `${OUT}/win_inventory.png`, timeout: 300000 });
  await ev(() => { G.ui.sel = { slot: 0 }; G.ui.showInventory(); }); await wait(500); await pg.screenshot({ path: `${OUT}/win_inventory_sel.png`, timeout: 300000 });
  await ev(() => { G.ui.close(); G.ui.skSel = 'nv_p1'; G.ui.showSkills(); }); await wait(800); await pg.screenshot({ path: `${OUT}/win_skills.png`, timeout: 300000 });
  // a 2nd-job character: three category columns
  await ev(() => { const S = G.sheet; S.p.level = 32; S.p.job = 'chef'; S.book.grantPoints(); S.recalc(); G.ui.close(); G.ui.skSel = null; G.ui.showSkills(); }); await wait(800); await pg.screenshot({ path: `${OUT}/win_skills_chef.png`, timeout: 300000 });
  console.log('errors', errs.slice(0, 6)); await b.close();
})();
