const { chromium } = require('playwright');
const W = +process.env.W || 1280, H = +process.env.H || 720, DPR = +process.env.DPR || 1, TAG = process.env.TAG || 'fhd';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/three@0\.160\.0\/examples\/jsm\/(.*)/, r => { const m = r.request().url().match(/examples\/jsm\/(.*)$/); r.fulfill({ path: '/tmp/three160/examples/jsm/' + m[1], contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } }); });
  await ctx.route('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js', r => r.fulfill({ path: '/opt/dl/three.module.js', contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } }));
  const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text()); });
  const ev = (f, a) => pg.evaluate(f, a), wait = ms => pg.waitForTimeout(ms);
  await pg.goto('http://localhost:8765/index.html?sim=3');
  await pg.waitForFunction(() => !document.getElementById('loading'), null, { timeout: 300000 });
  await wait(1500); if (!process.env.CLIP) await pg.screenshot({ path: `/tmp/t_${TAG}_title.png` });
  await pg.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('새 게임')), null, { timeout: 300000 }); await pg.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('새 게임')).click()); await wait(400);
  if (await pg.locator('button', { hasText: '확인' }).count()) await pg.locator('button', { hasText: '확인' }).click();
  await pg.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('모험 시작')), null, { timeout: 300000 }); await pg.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('모험 시작')).click());
  await pg.waitForFunction(() => G.inWorld && G.player && !G.loading, null, { timeout: 300000 }); await wait(1500);
  await ev(() => G.travel('forest', 'from_town'));
  await pg.waitForFunction(() => G.zone && G.zone.def.id === 'forest' && !G.loading, null, { timeout: 300000 }); await wait(3000);
  const spots = JSON.parse(process.env.SPOTS || '[["warp",[-33.5,-30]],["rabbit",[-19,-14]],["fox",[-10,-21]],["squirrel",[-17,5]],["wolf",[-2,3]],["boar",[8,-11]],["bear",[17,-13]],["boss",[22,22]]]');
  for (const [n, p] of spots) {
    await ev(([x, z]) => { G.player.invuln = 999; G.player.teleport({ x, z }); G.player.path = []; G.render.setFocus(G.player.pos, true); }, p);
    await wait(2500);
    const info = await ev(() => G.zone.actors.filter(a => a.faction === 'monster').map(a => a.def.id + ':' + (a.body && a.body.constructor.name) + ':' + a.body.action).slice(0, 4));
    console.log(n, JSON.stringify(info));
    await pg.screenshot({ path: `/tmp/f_${n}.png`, timeout: 300000, clip: { x: 320, y: 180, width: 1280, height: 720 } });
  }
  console.log(errs.join('\n'));
  await b.close();
})();
