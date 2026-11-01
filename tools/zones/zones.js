// Headless visit of the new zones: screenshots of spawn areas / spawners / boss arena + console error capture.
const { chromium } = require('playwright');
const OUT = '/home/claude/zones2/shots/';
const ONLY = process.env.ZONES ? process.env.ZONES.split(',') : null;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/three@0\.160\.0\/examples\/jsm\/(.*)/, r => { const m = r.request().url().match(/examples\/jsm\/(.*)$/); r.fulfill({ path: '/tmp/three160/examples/jsm/' + m[1], contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } }); });
  await ctx.route('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js', r => r.fulfill({ path: '/opt/dl/three.module.js', contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } }));
  const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text()); });
  const ev = (f, a) => pg.evaluate(f, a), wait = ms => pg.waitForTimeout(ms);
  await pg.goto('http://localhost:8765/index.html?sim=3');
  await pg.waitForFunction(() => !document.getElementById('loading'), null, { timeout: 300000 });
  await pg.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('새 게임')), null, { timeout: 300000 }); await pg.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('새 게임')).click()); await wait(400);
  if (await pg.locator('button', { hasText: '확인' }).count()) await pg.locator('button', { hasText: '확인' }).click();
  await pg.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('모험 시작')), null, { timeout: 300000 }); await pg.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('모험 시작')).click());
  await pg.waitForFunction(() => G.inWorld && G.player && !G.loading, null, { timeout: 300000 }); await wait(1000);
  const go = async (zone, spawn) => { await ev(([z, s]) => G.travel(z, s), [zone, spawn]); await pg.waitForFunction(z => G.zone && G.zone.def.id === z && !G.loading, zone, { timeout: 300000 }); await wait(2500); };
  const shot = async (name, p, ms = 2500) => {
    if (p) await ev(([x, z]) => { G.player.invuln = 9999; G.player.teleport({ x, z }); G.player.path = []; G.render.setFocus(G.player.pos, true); }, p);
    await wait(ms);
    const info = await ev(() => { const P = G.player.pos; return G.zone.actors.filter(a => a.faction === 'monster' && Math.hypot(a.pos.x - P.x, a.pos.z - P.z) < 12).map(a => `${a.def.id}:${a.body && a.body.constructor.name}:${a.body && a.body.action}:hp${Math.round(a.hp)}`).slice(0, 5); });
    console.log(name, JSON.stringify(info));
    await pg.screenshot({ path: OUT + name + '.png', timeout: 300000 });
  };
  const plan = {
    forest: [['from_valley', [['forest_exit', [33, -22]]]]],
    mist_valley: [['from_forest', [['A_entry', null], ['A_fox', [-17, -12]], ['A_toad', [12, -10]], ['A_pond', [-27, -6]], ['A_boar', [26, -1]], ['A_wolf', [27, 17]], ['A_elite', [-22, 23]], ['A_exit', [32, 31]]]]],
    frost_highland: [['from_valley', [['B_entry', null], ['B_wolf', [-22, -16]], ['B_fox', [-26, 9]], ['B_ramp', [-11, 16]], ['B_ram', [3, 20]], ['B_bear', [18, 18]], ['B_elite', [-26, 23]], ['B_exit', [31, -29]]]]],
    dragon_ruins: [['from_highland', [['C_entry', null], ['C_drake', [-18, -15]], ['C_lizard', [-27, -2]], ['C_boar', [-12, 9]], ['C_golem', [-22, 19]], ['C_elite', [28, -2]], ['C_ramp', [5, 17]]]]],
  };
  for (const [zone, list] of Object.entries(plan)) {
    if (ONLY && !ONLY.includes(zone)) continue;
    for (const [spawn, spots] of list) { await go(zone, spawn); for (const [n, p] of spots) await shot(n, p); }
  }
  if (!ONLY || ONLY.includes('boss')) {
    await go('dragon_ruins', 'from_highland');
    await shot('C_arena_gate', [13, 19], 2000);
    await shot('C_boss_fight', [22, 22], 4000);
    const st = await ev(() => ({ fight: G.zone.boss && G.zone.boss.fight, boss: G.zone.boss && G.zone.boss.def.name, hp: G.zone.boss && G.zone.boss.hp }));
    console.log('boss state', JSON.stringify(st));
    await wait(5000); await pg.screenshot({ path: OUT + 'C_boss_fight2.png', timeout: 300000 });
    // portal chain: walk into portals (level high enough)
    await ev(() => { G.profile.level = 50; G.sheet.recalc(); });
    await go('forest', 'from_valley');
    for (const [z, p, target] of [['forest', [36.2, -22], 'mist_valley'], ['mist_valley', [35.6, 34.6], 'frost_highland'], ['frost_highland', [35.6, -34.6], 'dragon_ruins']]) {
      await ev(([x, zz]) => { G.zone.portalArmed = true; G.player.teleport({ x, z: zz }); }, p);
      try { await pg.waitForFunction(t => G.zone && G.zone.def.id === t && !G.loading, target, { timeout: 120000 }); console.log('portal', z, '->', target, 'OK', await ev(() => [G.player.pos.x.toFixed(1), G.player.pos.z.toFixed(1)])); }
      catch (e) { console.log('portal', z, '->', target, 'FAILED'); }
      await wait(2000);
    }
    // level gate
    await ev(() => { G.profile.level = 12; G.sheet.recalc(); });
    await go('mist_valley', 'from_highland'); await wait(500);
    await ev(() => { G.zone.portalArmed = true; G.player.teleport({ x: 35.6, z: 34.6 }); }); await wait(3000);
    console.log('level gate (lv12 at minLevel 22 portal): still in', await ev(() => G.zone.def.id));
  }
  console.log('ERRORS:', errs.length); console.log(errs.join('\n'));
  await b.close();
})();
