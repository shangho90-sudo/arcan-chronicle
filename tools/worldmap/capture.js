const { chromium } = require('playwright');
const W = +process.env.W || 1920, H = +process.env.H || 1080, DPR = +process.env.DPR || 1, TAG = process.env.TAG || 'fhd';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/three@0\.160\.0\/examples\/jsm\/(.*)/, r => { const m = r.request().url().match(/examples\/jsm\/(.*)$/); r.fulfill({ path: '/tmp/three160/examples/jsm/' + m[1], contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } }); });
  await ctx.route('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js', r => r.fulfill({ path: '/opt/dl/three.module.js', contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } }));
  const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', e => { errs.push('PAGEERR ' + e.message); console.log('PAGEERR', e.message); }); pg.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text()); });
  const ev = (f, a) => pg.evaluate(f, a), wait = ms => pg.waitForTimeout(ms);
  await pg.goto('http://localhost:8765/index.html?sim=3');
  await pg.waitForFunction(() => !document.getElementById('loading'), null, { timeout: 300000 });
  await wait(1500); if (!process.env.CLIP) await pg.screenshot({ path: `/tmp/t_${TAG}_title.png`, timeout: 300000 });
  await pg.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('새 게임')), null, { timeout: 300000 }); await pg.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('새 게임')).click()); await wait(400);
  if (await pg.locator('button', { hasText: '확인' }).count()) await pg.locator('button', { hasText: '확인' }).click();
  await pg.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('모험 시작')), null, { timeout: 300000 }); await pg.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('모험 시작')).click());
  await pg.waitForFunction(() => G.inWorld && G.player && !G.loading, null, { timeout: 300000 }); await wait(1500);
  const info = await ev(() => ({ dpr: devicePixelRatio, pixelRatio: G.render.r.getPixelRatio(), buffer: [G.render.r.domElement.width, G.render.r.domElement.height], css: [innerWidth, innerHeight], ortho: G.render.ortho, maxTex: G.render.r.capabilities.maxTextureSize, aniso: G.render.r.capabilities.getMaxAnisotropy(),
    art: G.render.art.map(x => ({ id: x.a.id, tex: [x.tex.image.width, x.tex.image.height], mip: x.tex.generateMipmaps, min: x.tex.minFilter, mag: x.tex.magFilter, aniso: x.tex.anisotropy, ppm: x.a.ppm })) }));
  console.log(JSON.stringify(info));
  const fs = require('fs');
  for (const zn of ['town', 'forest', 'mist_valley', 'frost_highland', 'dragon_ruins']) {
    if (zn !== 'town') { await ev(z => G.loadZone(z, null, false), zn); await pg.waitForFunction(() => !G.loading, null, { timeout: 300000 }); }
    await wait(5000);
    const url = await ev((zn) => {
      const T3 = G.THREE, R = G.render, r = R.r, d = G.zone.def, [x0, z0, x1, z1] = d.bounds;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hw = (x1 - x0) / 2, hd = (z1 - z0) / 2, h = Math.max(hw, hd);
      if (G.player.body) G.player.body.root.visible = false;
      const cam = new T3.OrthographicCamera(-h, h, h, -h, 1, 300);
      cam.position.set(cx, 120, -cz); cam.up.set(0, 0, -1); cam.lookAt(cx, 0, -cz);
      const sc = R.sun.shadow.camera; sc.left = -h * 1.5; sc.right = h * 1.5; sc.top = h * 1.5; sc.bottom = -h * 1.5; sc.far = 220; sc.updateProjectionMatrix();
      R.sun.shadow.mapSize.set(4096, 4096); if (R.sun.shadow.map) { R.sun.shadow.map.dispose(); R.sun.shadow.map = null; }
      R.sun.target.position.set(cx, 0, -cz); const lf = R.lightFrom; R.sun.position.set(cx + lf.x * 80, lf.y * 80, -cz - lf.z * 80);
      R.sun.target.updateMatrixWorld(); R.sun.updateMatrixWorld();
      // un-fade every building group
      for (const g of R.groups || []) for (const m of g.meshes) { if (m.material && m.material.opacity !== undefined && m.userData._op === undefined) {} }
      for (const w of G.zone.warps || []) w.root.visible = false;
      R.scene.traverse(o => { if (o.customDepthMaterial) o.castShadow = false; });
      R.post.params.bloom = 0;
      const W = 1600; r.setSize(W, W, false);
      R.post.render(R.scene, cam);
      const out = r.domElement.toDataURL('image/png');
      R.resize();
      return out;
    }, zn);
    fs.writeFileSync('/home/claude/worldmap/' + zn + '.png', Buffer.from(url.split(',')[1], 'base64'));
    console.log('saved', zn);
  }
  await b.close(); return;
  await ev(() => G.ui.toasts.innerHTML = '');
  if (process.env.PP) await ev(pp => { Object.assign(G.render.post.params, JSON.parse(pp)); }, process.env.PP);
  if (process.env.JS) await ev(js => { (0, eval)(js); }, process.env.JS);
  const shots = JSON.parse(process.env.SHOTS || '[["plaza",[0,-10.5]]]');
  for (const [name, p, face] of shots) {
    await ev(([x, z, f]) => { G.player.teleport({ x, z }); G.player.path = []; if (f) G.player.setFacing(f[0], f[1]); G.render.setFocus(G.player.pos, true); G.ui.toasts.innerHTML = ''; }, [p[0], p[1], face]);
    await wait(1800);
    const st = await ev(() => ({ pos: [G.player.pos.x.toFixed(1), G.player.pos.z.toFixed(1)], fades: G.render.art.map(a => a.id ? 0 : a.a.id + ':' + a.fade.toFixed(2)).filter(s => !s.endsWith('1.00')) }));
    console.log(name, JSON.stringify(st));
    await pg.screenshot({ path: `/tmp/t_${TAG}_${name}.png`, timeout: 300000, ...(process.env.CLIP ? { clip: { x: W/4, y: H/4, width: W/2, height: H/2 } } : {}) });
  }
  console.log(errs.slice(0, 20).join('\n'));
  await b.close();
})();
