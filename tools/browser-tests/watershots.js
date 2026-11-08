// 호수·연못 화면 확인(js/nature.js buildWater). Usage: ZONES=capital_road,broken_bridge SIZE=442x960t TAG=after node tools/browser-tests/watershots.js -> OUT/water_<zone>_<tag>.png
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/water', TAG = process.env.TAG || 'after'; fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const sz = process.env.SIZE || '442x960t', touch = sz.endsWith('t'), [W, H] = sz.replace('t', '').split('x').map(Number);
  const pg = await (await b.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto('http://localhost:8765/index.html'); await ev(() => localStorage.clear()); await pg.reload();
  await pg.waitForSelector('.title-new', { timeout: 300000 }); await ev(() => document.querySelector('.title-new').click());
  await pg.waitForSelector('.create-start', { timeout: 60000 }); await ev(() => document.querySelector('.create-start').click());
  await pg.waitForSelector('.pl-skip', { timeout: 120000 }); await ev(() => document.querySelector('.pl-skip').click());
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && !document.querySelector('.prologue'), null, { timeout: 300000 });
  for (const zid of (process.env.ZONES || 'capital_road').split(',')) {
    await ev(z => G.loadZone(z, null, false), zid); await pg.waitForFunction(z => G.zone && G.zone.def.id === z && !G.loading, zid, { timeout: 300000 });
    const info = await ev(() => { const ps = (G.zone.def.patches || []).filter(p => p.tex === 'water'); const p = ps.sort((a, b) => b.radius - a.radius)[0]; if (!p) return null;
      const pl = G.player; pl.teleport({ x: p.pos[0] + p.radius * 0.2, z: p.pos[1] - p.radius - 0.6 }); pl.body.place(pl.pos); G.render.setFocus(pl.pos, true); const q = document.querySelector('.qhud'); if (q) q.style.display = 'none';
      for (const a of G.zone.actors) if (a !== pl && a.def) a.teleport({ x: a.pos.x + 300, z: a.pos.z }); return { pos: p.pos, r: p.radius, water: !!(G.zone.nature && G.zone.nature.water) }; });
    console.log(zid, JSON.stringify(info));
    await pg.waitForTimeout(5000); await pg.screenshot({ path: `${OUT}/water_${zid}_${TAG}.png`, timeout: 300000 });
    await pg.waitForTimeout(700); await pg.screenshot({ path: `${OUT}/water_${zid}_${TAG}_b.png`, timeout: 300000 });
  }
  console.log('errors', errs.slice(0, 6)); await b.close();
})();
