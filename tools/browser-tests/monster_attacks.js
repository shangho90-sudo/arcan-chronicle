// Monster attack styles: spawn each monster next to the player (kept alive), screenshot right after its strike.
// Usage: IDS=mon_ember_drake,mon_shroom,mon_fox node tools/browser-tests/monster_attacks.js -> /tmp/dbg/atk_<id>.png
const { chromium } = require('playwright'); require('fs').mkdirSync('/tmp/dbg', { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: 900, height: 600 } })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a), wait = ms => pg.waitForTimeout(ms);
  await pg.goto((process.env.URL || 'http://localhost:8765/index.html') + '?sim=6');
  const clickLabel = async (t) => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[role=button],[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[role=button],[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)).click(), t); await wait(500); };
  await clickLabel('새 게임'); if (await pg.locator('button', { hasText: '확인' }).count()) await pg.locator('button', { hasText: '확인' }).first().click();
  await clickLabel('모험 시작');
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading, null, { timeout: 300000 });
  await ev(() => G.loadZone('forest', 'from_town', false)); await pg.waitForFunction(() => !G.loading && G.zone && G.zone.def.id === 'forest', null, { timeout: 300000 });
  await wait(2000);
  await ev(() => { const p = G.player; G.zone.actors = G.zone.actors.filter(a => a === p || !a.def); for (const s of G.zone.spawners || []) { s.alive.length = 0; s.timers = [9999]; } p.teleport({ x: -17, z: -19.5 }); G.render.setFocus(p.pos, true);
    const S = p.sheet; while (S.p.level < 30) { S.p.level++; } S.recalc(); p.hp = p.maxHp; setInterval(() => { if (G.player.hp < G.player.maxHp * 0.5) G.player.hp = G.player.maxHp; }, 50); });
  const out = {};
  for (const id of (process.env.IDS || 'mon_ember_drake').split(',')) {
    await ev(id => { for (const a of G.zone.actors.filter(a => a.def)) { a.body && a.body.dispose && a.body.dispose(); } G.zone.actors = G.zone.actors.filter(a => a === G.player || !a.def); window._m = G.zone.summon(id, G.player.pos, 1)[0]; window._m.atkCd = 0; window._hp0 = G.player.hp; }, id);
    let st = '';
    for (let i = 0; i < 120; i++) { st = await ev(() => window._m.state); if (st === 'recover') break; await wait(250); }
    const ranged = await ev(() => window._m.def.ai === 'ranged');
    if (ranged) await wait(700);
    await pg.screenshot({ path: `/tmp/dbg/atk_${id}.png`, timeout: 300000 });
    out[id] = await ev(() => [window._m.state, window._m.body.cfg.atk, Math.round(window._hp0 - G.player.hp)]);
  }
  console.log(JSON.stringify(out), '\n', errs.slice(0, 8).join('\n')); await b.close();
})();
