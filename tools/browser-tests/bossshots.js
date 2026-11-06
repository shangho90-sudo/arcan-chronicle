// Boss-arena comparison capture from the real game: forest mushroom boss platform, same player/boss position every run,
// fight started (barrier up), a cone slam + burst circles + overlapping poison pools on the floor, then time frozen.
// Usage: OUT=/tmp/boss TAG=after SIZES=1448x1086 node tools/browser-tests/bossshots.js
//   -> OUT/b_<tag>_<size>_{gate,grove,arena,fight,barrier,rim}.png + frame time / draw calls / triangles (SwiftShader: relative numbers only)
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/boss', TAG = process.env.TAG || 'shot'; fs.mkdirSync(OUT, { recursive: true });
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
    await ev(() => G.loadZone('mushroom_grove', 'from_forest', false)); await pg.waitForFunction(() => !G.loading && G.zone.def.id === 'mushroom_grove', null, { timeout: 600000 });
    const stats = async () => { await ev(() => { const i = G.render.r.info; i.autoReset = false; i.reset(); }); await frames(1);
      return ev(() => { const i = G.render.r.info; const o = { calls: i.render.calls, tris: i.render.triangles }; i.autoReset = true; return o; }); };
    const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
    const shot = async name => { if (ONLY && !ONLY.includes(name)) return;
      await frames(6); const t0 = Date.now(); await frames(4); const ms = (Date.now() - t0) / 4;
      const s = await stats(); console.log(TAG, sz, name, JSON.stringify({ msPerFrame: Math.round(ms), ...s }));
      await pg.screenshot({ path: `${OUT}/b_${TAG}_${sz}_${name}.png`, timeout: 300000 });
    };
    const go = (x, z) => ev(([x, z]) => { const p = G.player; p.teleport({ x, z }); p.path = []; G.render.setFocus(p.pos, true); p.body && p.body.place && p.body.place(p.pos); G.ui.toasts.innerHTML = ''; }, [x, z]);
    // same spot every run: player south-west of the boss on the platform, boss at its home position
    const place = () => ev(() => { const bs = G.zone.boss, d = G.zone.def.boss; bs.pos.x = d.bossPos[0]; bs.pos.z = d.bossPos[1]; bs.body && bs.body.place && bs.body.place(bs.pos); });
    await go(17.6, 20.2); await place(); await shot('gate');
    await go(31.5, 31.0); await shot('grove');
    await go(21.5, 21.5); await place(); await shot('arena');
    // fight: barrier, telegraphs and pools, then freeze simulation time (shaders keep animating on wall-clock time)
    await ev(async () => {
      const A = await import('./js/actors.js'); const p = G.player, bs = G.zone.boss; p.hp = p.maxHp = 1e9;
      G.startBossFight(bs); G.ui.toasts.innerHTML = '';
      A.GroundZone.spawn(G.zone, bs, 23.6, 19.6, 1.8, 60); A.GroundZone.spawn(G.zone, bs, 25.4, 20.4, 1.8, 60); A.GroundZone.spawn(G.zone, bs, 18.6, 25.2, 1.8, 60);
      const S = (await import('./js/core.js')).HitShape;
      bs.warn(S.cone(bs.pos.x, bs.pos.z, p.pos.x - bs.pos.x, p.pos.z - bs.pos.z, 4.6, 110), 30, () => {});
      bs.warn(S.circle(19.2, 22.8, 2), 30, () => {}); bs.warn(S.circle(28.5, 22.0, 2), 30, () => {});
    }).catch(e => errs.push('setup ' + e.message));
    await frames(20); await ev(() => { G.timeScale = 0; for (const t of G.zone.things) if (t.time === 30 && t.view) t.t = 18; }); await place(); await go(21.5, 21.5); await ev(() => { G.ui.toasts.innerHTML = ''; });
    await shot('fight');
    await go(15.6, 16.4); await shot('barrier');
    await go(14.6, 31.5); await shot('rim');
    console.log(TAG, sz, 'errors', JSON.stringify(errs.slice(0, 6)));
    await pg.close();
  }
  await b.close();
})();
