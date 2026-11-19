// 리마스터 조절값 비교(2026-11-19): 같은 장면에서 window 모듈 값(MOD.EXPORT 객체)을 바꿔 가며 찍음.
// Usage: ZONE=town SPOT=3,-8 ZOOM=2.2 MOD=/js/town3d.js EXPORT=RMG VARIANTS='{"bump":0};{"bump":0.05}' QUALITY=high OUT= TAG= node rmtune.js
const { chromium } = require('playwright'); const fs = require('fs'); const { execSync } = require('child_process');
const SIZE = process.env.SIZE || '1280x720', TOUCH = SIZE.endsWith('t'), [VW, VH] = SIZE.replace('t', '').split('x').map(Number);
const OUT = process.env.OUT || '/tmp/remaster2/tune', TAG = process.env.TAG || 'tune', VARS = (process.env.VARIANTS || '{}').split(';');
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: VW, height: VH }, hasTouch: TOUCH, isMobile: TOUCH })).newPage(); pg.setDefaultTimeout(600000);
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(process.env.URL || 'http://localhost:8961/index.html');
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(q => { localStorage.clear(); localStorage.setItem('arcan_settings', JSON.stringify({ gfxQuality: q })); }, process.env.QUALITY || 'high'); await pg.reload(); await click('게임 시작 (새 게임)'); await click('모험 시작');
  await pg.waitForSelector('.prologue.on', { timeout: 60000 }).then(() => click('건너뛰기')).catch(() => {});
  const ready = () => pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.zone && G.player.body && G.player.body.md, null, { timeout: 600000 });
  await ready();
  const Z = process.env.ZONE || 'town';
  if (Z !== 'town') { await ev(z => { G.lockOf = () => null; G.travel(z); }, Z); await pg.waitForTimeout(1500); await ready(); await pg.waitForTimeout(2500); }
  await ev(([sp, zoom]) => { G.frame = () => {}; document.querySelectorAll('.hud,.controls,.toasts,.qhud,.qh-reopen,.layer:not(.controls)').forEach(e => e.style.display = 'none');
    const p = G.player; if (sp) { const s = G.zone.geo.nearestFree(sp[0], sp[1], 0.4); p.teleport(s); p.body.place(p.pos); } for (let i = 0; i < 20; i++) G.step(1 / 60, false);
    const c = G.render.cam; c.zoom = zoom; c.updateProjectionMatrix(); G.render.setFocus({ x: p.pos.x, y: 0, z: p.pos.z }, true); }, [process.env.SPOT ? process.env.SPOT.split(',').map(Number) : null, +(process.env.ZOOM || 2.2)]);
  const files = [];
  for (let i = 0; i < VARS.length; i++) {
    await ev(async ([mod, ex, v]) => { const M = await import(mod); Object.assign(M[ex], JSON.parse(v)); G.applySettings(); G.render.scene.traverse(o => { const ms = o.material ? [].concat(o.material) : []; for (const m of ms) m.needsUpdate = true; }); G.render.render(0); }, [process.env.MOD || '/js/town3d.js', process.env.EXPORT || 'RMG', VARS[i]]);
    await pg.waitForTimeout(1200); await ev(() => G.render.render(0));
    const fn = `${OUT}/${TAG}_${i}.png`; await pg.screenshot({ path: fn, clip: { x: VW / 2 - 400, y: VH / 2 - 260, width: 800, height: 520 } }); files.push(fn);
  }
  fs.writeFileSync('/tmp/_rmtune.py', `from PIL import Image, ImageDraw\nfr=${JSON.stringify(files)}\nlab=${JSON.stringify(VARS)}\nims=[Image.open(f).convert('RGB') for f in fr]\nw,h=ims[0].size\ncols=min(3,len(ims)); rows=(len(ims)+cols-1)//cols\nsh=Image.new('RGB',(w*cols,(h+20)*rows),(20,20,28))\nd=ImageDraw.Draw(sh)\nfor i,im in enumerate(ims):\n  x=(i%cols)*w; y=(i//cols)*(h+20); sh.paste(im,(x,y+20)); d.text((x+6,y+4),lab[i],fill=(255,255,255))\nsh.save('${OUT}/${TAG}_sheet.png')\n`);
  execSync('python3 /tmp/_rmtune.py'); console.log('sheet', `${OUT}/${TAG}_sheet.png`, errs.slice(0, 5));
  await b.close();
})();
