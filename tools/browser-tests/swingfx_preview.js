// Stills of the Tripo swing effects (slash crescent forehand / backhand, hit burst, crit burst) next to the player.
// Usage: node tools/browser-tests/swingfx_preview.js -> OUT/swingfx_*.png
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/sfx'; fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: 900, height: 640 } })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a), wait = ms => pg.waitForTimeout(ms);
  await pg.goto(process.env.URL || 'http://localhost:8765/index.html');
  const clickLabel = async (t) => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[role=button],[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)), t, { timeout: 300000 });
    await ev(t => [...document.querySelectorAll('button,[role=button],[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)).click(), t); await wait(500); };
  await clickLabel('새 게임'); if (await pg.locator('button', { hasText: '확인' }).count()) await pg.locator('button', { hasText: '확인' }).first().click();
  await clickLabel('모험 시작');
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.swingFx && G.swingFx.ready, null, { timeout: 300000 });
  await ev(() => { G.frame = () => {}; document.querySelectorAll('.hud,.controls,.toasts').forEach(e => e.style.visibility = 'hidden'); const p = G.player; p.teleport({ x: 0, z: -14 }); p.body.place(p.pos); p.body.setFacing(1, 0); p.body.yaw = p.body.targetYaw; p.body.update(0.016); G.render.setFocus(p.pos, true); });
  const cases = [['slash_fore', 'slash', 1, 0.13], ['slash_back', 'slash', -1, 0.13], ['hit', 'hit', 0, 0.07], ['crit', 'crit', 0, 0.08], ['hit_late', 'hit', 0, 0.18]];
  for (const [name, kind, side, t] of cases) {
    await ev(([kind, side, t]) => { const F = G.swingFx, p = G.player; F.clear();
      if (kind === 'slash') F.slash(p.pos, { x: 1, z: 0 }, side); else F.hit({ x: p.pos.x + 1.2, y: p.pos.y, z: p.pos.z }, { crit: kind === 'crit' });
      for (let i = 0; i < Math.round(t * 60); i++) F.update(1 / 60, G.render.cam);
      G.render.setFocus(p.pos, true); G.render.render(0); }, [kind, side, t]);
    const c = await ev(() => { const s = G.render.toScreen({ x: G.player.pos.x + 0.6, y: 0.9, z: G.player.pos.z }); return [s.x, s.y]; });
    await pg.screenshot({ path: `${OUT}/swingfx_${name}.png`, clip: { x: Math.round(c[0] - 180), y: Math.round(c[1] - 150), width: 360, height: 300 }, timeout: 300000 });
  }
  console.log('errors', errs.slice(0, 5)); await b.close();
})();
