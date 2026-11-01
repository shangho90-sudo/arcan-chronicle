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
  const probe = () => ev(() => { const T = G.THREE, out = {}; const sc = G.render.scene; sc.updateMatrixWorld(true);
    sc.traverse(o => { if (!(o.isMesh || o.isSprite || o.isPoints) || !o.visible) return; let vis = true; for (let q = o; q; q = q.parent) if (!q.visible) vis = false; if (!vis) return;
      const bb = new T.Box3().setFromObject(o), sz = bb.getSize(new T.Vector3()); const big = Math.max(sz.x, sz.y, sz.z);
      if (big > 0.6 && !o.isSprite && !o.isPoints) return;
      const chain = []; for (let q = o; q && q !== sc; q = q.parent) chain.push((q.name || q.type) + (q.userData && Object.keys(q.userData).length ? JSON.stringify(q.userData).slice(0, 40) : ''));
      const k = (o.isSprite ? 'SPRITE ' : o.isPoints ? 'POINTS ' : '') + o.geometry?.type + ' ' + chain.slice(0, 5).join(' < ') + ' col=' + (o.material?.color?.getHexString?.() || '');
      const c = bb.getCenter(new T.Vector3()); (out[k] = out[k] || []).push([+c.x.toFixed(1), +c.y.toFixed(2), +c.z.toFixed(1), +big.toFixed(2)].join(',')); });
    return out; });
  await ev(() => { G.player.teleport({ x: 0, z: -6 }); G.player.path = []; G.render.setFocus(G.player.pos, true); }); await wait(2000);
  const hits = await ev((pts) => { const T = G.THREE, rc = new T.Raycaster(), out = []; for (const [px, py] of pts) { rc.setFromCamera(new T.Vector2(px / 960 - 1, 1 - py / 540), G.render.cam);
    const h = rc.intersectObjects(G.render.scene.children, true).slice(0, 3).map(i => { const o = i.object; const ch = []; for (let q = o; q && q.parent; q = q.parent) ch.push(q.name || q.type); return ch.slice(0, 5).join('<') + ' ' + (o.material?.name || '') + ' col=' + (o.material?.color?.getHexString?.()) + ' tris=' + (o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3) + ' ud=' + JSON.stringify(o.userData).slice(0, 60) + ' p=' + i.point.toArray().map(v => v.toFixed(2)); }); out.push(h); } return out; }, [[1585,355],[1578,345],[850,985],[912,990],[840,955],[480,22]]);
  console.log(JSON.stringify(hits, null, 1)); await pg.screenshot({ path: '/tmp/probe_plaza.png' });
  if (process.env.FOREST) { await ev(() => G.loadZone('forest', null, false)); await wait(4000); console.log('FOREST', JSON.stringify(await probe(), null, 1)); }
  await ev(() => G.ui.toasts.innerHTML = '');
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
