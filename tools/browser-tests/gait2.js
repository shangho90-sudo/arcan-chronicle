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
  await ev(() => { G.player.teleport({ x: 3, z: -15 }); G.player.path = []; G.render.setFocus(G.player.pos, true); });
  await wait(500);
  for (const V of [0, 1.5, 4.6]) {
    const r = await ev((V) => {
      const p = G.player, b = p.body; G.paused = true; const md = b.md;
      b.play(V ? 'walk' : 'idle'); b.gaitW = V ? 1 : 0; b.gaitV = V; b.yaw = 0; b.targetYaw = 0;
      const out = { w: [], ang: [] };
      for (let k = 0; k < 20; k++) {
        if (V) b.gaitPh = k / 20; b.apply(); b.root.updateMatrixWorld(true);
        const P = n => b.bones[md.byName[n]].getWorldPosition(new G.THREE.Vector3());
        const lf = P('Left_Foot'), rf = P('Right_Foot'), lt = P('Left_Toes'), rt = P('Right_Toes'), root = b.root.position;
        out.w.push(Math.abs(lf.x - rf.x));
        // toe angle from forward (three: forward of yaw 0 is -z), outward positive
        out.ang.push([Math.atan2(lt.x - lf.x, lt.z - lf.z) * 180 / Math.PI, -Math.atan2(rt.x - rf.x, rt.z - rf.z) * 180 / Math.PI]);
      }
      const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
      return { V, width: avg(out.w).toFixed(3), toeL: avg(out.ang.map(a => a[0])).toFixed(1), toeR: avg(out.ang.map(a => a[1])).toFixed(1) };
    }, V);
    console.log(JSON.stringify(r));
  }
  await b.close();
})();
