// Lock-on + passive-field check (속삭이는 숲): 1) monsters do not attack first in the passive field, 2) PC click on a
// monster locks on (ring under it, attack key / skills aim at it), 3) phone: an approaching monster gets locked
// automatically. Prints a JSON report, screenshots OUT/lock_*.png.  Usage: node tools/browser-tests/lockon.js
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/lock';
const SZ = process.env.SIZE || '1448x1086', touch = SZ.endsWith('t'), [W, H] = SZ.replace('t', '').split('x').map(Number);
const TIMES = (process.env.TIMES || '0.1,0.3,0.5,0.8,1.2,1.6').split(',').map(Number);
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(process.env.URL || 'http://localhost:8765/index.html', { timeout: 300000 });
  const clickLabel = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)), t, { timeout: 300000 });
    await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)).click(), t); };
  await ev(() => localStorage.clear()); await clickLabel('새 게임'); await clickLabel('모험 시작');
  await pg.waitForFunction(() => window.G && G.inWorld && !G.loading && G.skillFx, null, { timeout: 300000 });
  await ev(() => G.loadZone('forest', 'from_town'));
  await pg.waitForFunction(() => G.inWorld && !G.loading && G.zone && G.zone.def.id === 'forest', null, { timeout: 600000 });
  await pg.waitForTimeout(3000);
  const rep = {};
  rep.passive = await ev(() => {
    G.frame = () => {}; const c = { x: 36, z: -30 };
    const mons = G.zone.actors.filter(a => a !== G.player && a.def); for (const m of mons) m.teleport({ x: c.x + 40, z: c.z + 40 });
    const m = mons.find(m => m.def.id === 'mon_slime') || mons[0]; m.teleport({ x: c.x - 2.5, z: c.z }); m.home = { ...m.pos }; m.aggro = false; m.state = 'idle';
    G.player.teleport({ x: c.x, z: c.z }); G.render.setFocus({ ...G.player.pos }, true);
    const states = new Set(); for (let i = 0; i < 180; i++) { G.step(1 / 60, false); states.add(m.state); }
    G.__m = m; return { detectRange: m.def.detectRange, dist: +Math.hypot(m.pos.x - G.player.pos.x, m.pos.z - G.player.pos.z).toFixed(2), states: [...states], hp: G.player.hp, maxHp: G.player.stat('hp') };
  });
  // PC: click the monster on screen
  rep.pc = await ev(() => {
    const m = G.__m; G.render.render(0); const s = G.render.toScreen({ x: m.pos.x, y: m.pos.y + 0.5 + m.radius * 0.6, z: m.pos.z });
    G.input.mobile = false; G.input.pendingClick = { x: s.x, y: s.y };
    for (let i = 0; i < 3; i++) G.step(1 / 60, false);
    const locked = G.player.lockOn === m; for (let i = 0; i < 60; i++) G.step(1 / 60, false);
    return { locked, chasing: G.player.target === m, monsterState: m.state, aggroAfterHit: m.aggro, mhp: m.hp };
  });
  console.log(JSON.stringify(rep));
  await ev(() => G.render.render(0)); await pg.screenshot({ path: `${OUT}/lock_pc.png`, timeout: 600000 });
  rep.esc = await ev(() => { G.player.lockOn = G.__m; const before = !!G.player.lockOn; G.ui.handleKeys({ pause: true }); return { before, after: !!G.player.lockOn, pauseOpen: !!G.ui.current }; });
  // phone: an aggressive monster walks up -> auto lock
  rep.mobile = await ev(() => {
    G.ui.current && G.ui.close && G.ui.close(); G.player.lockOn = null; G.player.target = null; G.input.mobile = true;
    const mons = G.zone.actors.filter(a => a !== G.player && a.def && !a.dead && a !== G.__m), m2 = mons[0], p = G.player.pos;
    m2.teleport({ x: p.x + 7, z: p.z + 2 }); m2.home = { ...m2.pos }; m2.aggro = true; m2.state = 'chase';
    let at = -1; for (let i = 0; i < 240; i++) { G.step(1 / 60, false); if (G.player.lockOn && at < 0) at = i; }
    return { autoLocked: G.player.lockOn === m2, lockedOther: !!G.player.lockOn && G.player.lockOn !== m2, frame: at, dist: +Math.hypot(m2.pos.x - p.x, m2.pos.z - p.z).toFixed(2) };
  });
  await ev(() => G.render.render(0)); await pg.screenshot({ path: `${OUT}/lock_mobile.png`, timeout: 600000 });
  console.log(JSON.stringify(rep, null, 1)); console.log(JSON.stringify(errs.slice(0, 5)));
  await b.close();
})();
