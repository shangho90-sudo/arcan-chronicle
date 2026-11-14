// 마을 가까이 보기(그래픽 개편 확인용): 같은 카메라 초점·확대에서 집 정면(창·문·지붕·꽃무리)·분수(물결)·나무·깃발을 찍어 전/후 비교.
// 바람에 흔들리는 것(깃발·잎)은 FRAMES 간격으로 2장 찍어 움직임이 보이게 함.
// Usage: TAG=before|after URL=http://localhost:8817/index.html SIZE=1280x720 OUT=/tmp/gfx4 VIEWS="name:x,z,zoom;..."
//        BARGS='--single-process --no-zygote' NODE_PATH=$(npm root -g) node tools/browser-tests/townclose.js
const { chromium } = require('playwright'); const fs = require('fs');
const SIZE = process.env.SIZE || '1280x720', TOUCH = SIZE.endsWith('t'), [VW, VH] = SIZE.replace('t', '').split('x').map(Number);
const TAG = process.env.TAG || 'after', OUT = process.env.OUT || '/tmp/gfx4', FRAMES = +(process.env.FRAMES || 20);
const VIEWS = (process.env.VIEWS || 'house:37.7,-37.5,2.2;house2:-12.6,30.5,2.2;fountain:0,-2,1.8;tree:11.25,-21.5,2.2;lamp:-6.6,-3.3,2.6').split(';').map(v => { const [n, r] = v.split(':'); const [x, z, zoom] = r.split(',').map(Number); return { n, x, z, zoom }; });
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...(process.env.BARGS ? process.env.BARGS.split(' ') : [])] });
  const pg = await (await b.newContext({ viewport: { width: VW, height: VH }, hasTouch: TOUCH, isMobile: TOUCH })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(process.env.URL || 'http://localhost:8817/index.html');
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(() => localStorage.clear()); await pg.reload(); await click('새 게임'); await click('모험 시작');
  await pg.waitForSelector('.prologue.on', { timeout: 60000 }).then(() => click('건너뛰기')).catch(() => {});
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.player.body && G.player.body.md, null, { timeout: 300000 });
  await ev(() => { G.frame = () => {}; document.querySelectorAll('.hud,.toasts,.qhud,.qh-reopen,.plates,.layer,.controls').forEach(e => e.style.display = 'none'); });
  await pg.waitForTimeout(3000);
  for (const v of VIEWS) for (let k = 0; k < 2; k++) {
    await ev(([v, k, F]) => { const c = G.render.cam; c.zoom = v.zoom; c.updateProjectionMatrix(); const p = G.player; p.teleport(G.zone.geo.nearestFree(v.x - 3, v.z - 3, 0.4));
      for (let i = 0; i < (k ? F : 30); i++) G.step(1 / 60, false); G.render.setFocus({ x: v.x, y: 0, z: v.z }, true); G.render.render(1 / 60); }, [v, k, FRAMES]);
    await pg.screenshot({ path: `${OUT}/${TAG}_${v.n}_${k}.png`, timeout: 300000 });
  }
  console.log(TAG, VIEWS.map(v => v.n).join(','), errs.slice(0, 3)); await b.close();
})();
