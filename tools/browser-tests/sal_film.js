// 일격참 '살' effect on its own (js/salfx.js): cast at the player + a hit flash 2.4 m ahead, frame by frame at the game camera.
// Usage: DIRS=90,225 ZONE=forest ZOOM=1.6 FPS=30 URL=http://localhost:8765/index.html node tools/browser-tests/sal_film.js
//   -> OUT/sal_<zone>_<dir>/NNN.png and OUT/sal_<zone>.png (contact sheet: one row per direction)
const { chromium } = require('playwright'); const fs = require('fs'); const { execSync } = require('child_process');
const DIRS = (process.env.DIRS || '90,225').split(',').map(Number), FPS = +(process.env.FPS || 30), ZONE = process.env.ZONE || '';
const OUT = process.env.OUT || '/tmp/salfx'; const CW = +(process.env.CW || 520), CH = +(process.env.CH || 380), N = Math.round(0.5 * FPS);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: 1100, height: 760 } })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(process.env.URL || 'http://localhost:8765/index.html');
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(() => localStorage.clear()); await click('새 게임'); await click('모험 시작');
  await pg.waitForSelector('.prologue.on', { timeout: 60000 }).then(() => click('건너뛰기')).catch(() => {});
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.player.body && G.player.body.md, null, { timeout: 300000 });
  if (ZONE) { await ev(z => G.loadZone(z), ZONE); await pg.waitForFunction(z => G.zone && G.zone.def.id === z && !G.loading, ZONE, { timeout: 300000 }); }
  await pg.waitForFunction(() => G.skillFx && G.skillFx.sal && G.skillFx.sal.ready, null, { timeout: 120000 });
  await pg.waitForTimeout(1500);
  const zid = await ev(z => { G.frame = () => {}; const c = G.render.cam; c.zoom = z; c.updateProjectionMatrix();
    document.querySelectorAll('.hud,.controls,.toasts,.layer,.qhud,.qh-reopen,.plates').forEach(e => e.style.display = 'none');
    for (const m of G.zone.monsters || []) m.body && m.body.setVisible && m.body.setVisible(false);
    return G.zone.def.id; }, +(process.env.ZOOM || 1.6));
  const rows = [];
  for (const dir of DIRS) {
    const dirOut = `${OUT}/sal_${zid}_${dir}`; fs.rmSync(dirOut, { recursive: true, force: true }); fs.mkdirSync(dirOut, { recursive: true });
    await ev(([dir, fps]) => { const p = G.player, a = dir * Math.PI / 180, f = { x: Math.sin(a), z: Math.cos(a) };
      p.setFacing(f.x, f.z); for (let i = 0; i < 20; i++) G.step(1 / fps, false); window.__f = f; G.render.setFocus({ x: p.pos.x + f.x * 1.3, y: 0, z: p.pos.z + f.z * 1.3 }, true);
      G.skillFx.sal.cast(p.pos, f, { follow: p, length: 2.85 }); }, [dir, FPS]);
    for (let i = 0; i < N; i++) {
      const c = await ev(([i, fps]) => { const p = G.player, f = window.__f;
        if (Math.abs(i / fps - 0.10) < 0.5 / fps) G.skillFx.sal.hit({ x: p.pos.x + f.x * 2.6, y: (p.pos.y || 0) + 0.95, z: p.pos.z + f.z * 2.6 }, f, {});
        G.step(1 / fps, true); const s = G.render.toScreen({ x: p.pos.x + f.x * 1.3, y: p.pos.y + 0.9, z: p.pos.z + f.z * 1.3 }); return [s.x, s.y]; }, [i, FPS]);
      await pg.screenshot({ path: `${dirOut}/${String(i).padStart(3, '0')}.png`, clip: { x: Math.max(0, Math.round(c[0] - CW / 2)), y: Math.max(0, Math.round(c[1] - CH / 2)), width: CW, height: CH }, timeout: 120000 });
    }
    rows.push(dirOut);
  }
  // contact sheet (frames 0..N-1 step 1, half size) via python PIL
  const py = `from PIL import Image\nimport glob\nrows=${JSON.stringify(rows)}\nfr=[sorted(glob.glob(r+'/*.png')) for r in rows]\nim0=Image.open(fr[0][0]);w,h=im0.size[0]//2,im0.size[1]//2\nn=min(len(f) for f in fr)\nsh=Image.new('RGB',(w*min(n,8),h*len(rows)*((n+7)//8)))\nfor ri,f in enumerate(fr):\n  for i,p in enumerate(f[:n]):\n    sh.paste(Image.open(p).resize((w,h)),((i%8)*w,(ri*((n+7)//8)+i//8)*h))\nsh.save('${OUT}/sal_${zid}.png')`;
  fs.writeFileSync('/tmp/_salsheet.py', py); try { execSync('python3 /tmp/_salsheet.py'); } catch (e) { console.log('sheet failed', e.message); }
  console.log('zone', zid, 'frames', N, 'errors', errs.slice(0, 5)); await b.close();
})();
