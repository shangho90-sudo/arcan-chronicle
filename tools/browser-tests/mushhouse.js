// 속삭이는 숲 버섯 집(독버섯 군락지 워프 뒤) 화면 확인: 워프와 캐릭터 쪽에서 본 모습. Usage: node tools/browser-tests/mushhouse.js -> OUT/mushhouse_<tag>.png
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/mh', TAG = process.env.TAG || 'after'; fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: +(process.env.W || 1280), height: +(process.env.H || 720) } })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error' || /landmark/.test(m.text())) errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(process.env.URL || 'http://localhost:8765/index.html');
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(() => localStorage.clear()); await click('새 게임'); await click('모험 시작'); await pg.waitForSelector('.prologue.on', { timeout: 60000 }); await click('건너뛰기');
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && !document.querySelector('.prologue'), null, { timeout: 300000 });
  if (process.env.ROT) await ev(r => { const z = G.data.zones.forest; for (const q of z.props) if (q.type === 'landmark') q.rot = r; }, +process.env.ROT);
  await ev(() => G.loadZone('forest', 'from_town')); await pg.waitForFunction(() => G.zone && G.zone.def.id === 'forest' && !G.loading, null, { timeout: 300000 });
  await ev(z => { window.__zoom = z; }, +(process.env.ZOOM || 1));
  for (const [n, x, z, fx, fz] of (process.env.ONLY === 'house' ? [['house', -13.2, -40.2, 0.87, 0.5]] : [['near', -17.2, -44.6, 0, 1], ['warp', -15.4, -39.4, -0.3, -1], ['house', -13.2, -40.2, 0.87, 0.5]])) {
    await ev(([x, z, fx, fz]) => { const p = G.player; for (const a of G.zone.actors) if (a.faction === 'monster') a.hp = 0; p.teleport({ x, z }); p.setFacing(fx, fz); p.body.place(p.pos); G.render.setFocus(p.pos, true); if ((window.__zoom || 1) !== 1) { G.render.cam.zoom = (window.__zoom || 1); G.render.cam.updateProjectionMatrix(); } }, [x, z, fx, fz]);
    await pg.waitForTimeout(6000);
    await pg.screenshot({ path: `${OUT}/mushhouse_${TAG}_${n}.png`, timeout: 300000 });
  }
  console.log('errors', errs.slice(0, 5)); await b.close();
})();
