// 캐릭터 '스티커처럼 보임' 원인 찾기: 같은 자리·카메라에서 외곽선/재질/조명을 하나씩 끄고 찍어 비교.
// Usage: VARIANTS=on,nooutline,lambert,unlit JOB=novice GENDERS=m,f ZOOMS=3,1 TAG= URL= OUT=/tmp/gfx3 node tools/browser-tests/lookprobe.js
//   on = 지금 게임 그대로, nooutline = 외곽선 껍데기만 숨김, lambert = + paintMat 없는 Lambert, unlit = 텍스처만(빛 없음)
//   -> OUT/<TAG>_look_<job>_<g>_z<zoom>.png (가로로 변형별), 화면 높이 기준 캐릭터 둘레 크롭
const { chromium } = require('playwright'); const fs = require('fs'); const { execSync } = require('child_process');
const SIZE = process.env.SIZE || '1280x720', TOUCH = SIZE.endsWith('t'), [VW, VH] = SIZE.replace('t', '').split('x').map(Number);
const OUT = process.env.OUT || '/tmp/gfx3', TAG = process.env.TAG || 'look', JOB = process.env.JOB || 'novice';
const VARIANTS = (process.env.VARIANTS || 'on,nooutline,lambert,unlit').split(','), GENDERS = (process.env.GENDERS || 'm,f').split(','), ZOOMS = (process.env.ZOOMS || '3,1').split(',').map(Number);
const WEAPON = { blacksmith: 'w_hammer_1', pharmacist: 'w_pestle_1', cook: 'w_knife_1', hairdresser: 'w_scissors_1', artist: 'w_brush_1' };
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--single-process', '--no-zygote'] });
  const pg = await (await b.newContext({ viewport: { width: VW, height: VH }, hasTouch: TOUCH, isMobile: TOUCH })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(process.env.URL || 'http://localhost:8817/index.html');
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(() => localStorage.clear()); await pg.reload(); await click('새 게임'); await click('모험 시작');
  await pg.waitForSelector('.prologue.on', { timeout: 60000 }).then(() => click('건너뛰기')).catch(() => {});
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.player.body && G.player.body.md, null, { timeout: 300000 });
  await ev(() => { G.frame = () => {}; document.querySelectorAll('.hud,.toasts,.qhud,.qh-reopen,.plates,.layer,.controls').forEach(e => e.style.display = 'none'); if (G.reward) { G.reward.jobChange = sw => sw && sw(); G.reward.levelUp = () => {}; } G.dev.level(12); for (const n of G.zone.npcs) if (n.body && n.body.setVisible) n.body.setVisible(false); });
  const rows = [];
  for (const g of GENDERS) {
    await ev(async ([g, job, w]) => { const s = G.sheet; s.p.gender = g; s.p.job = 'novice'; if (job !== 'novice') G.dev.job(job); if (w) { s.bag.add(w, 1); s.p.weapon = w; } s.recalc();
      await G.player.attachBody(); const p = G.player, spot = G.zone.geo.nearestFree(-6.2, -6.6, 0.4); p.teleport(spot); p.body.place(p.pos); p.setFacing(Math.sin(1.22), Math.cos(1.22)); p.body.setArmed && p.body.setArmed(true);
      for (let i = 0; i < 40; i++) G.step(1 / 60, false); }, [g, JOB, WEAPON[JOB]]);
    await pg.waitForTimeout(2500);
    for (const Z of ZOOMS) {
      const shots = [];
      for (const v of VARIANTS) {
        const c = await ev(([v, z]) => {
          const B = G.player.body, cam = G.render.cam; cam.zoom = z; cam.updateProjectionMatrix();
          if (!B.__orig) { B.__orig = B.mat; B.__lam = new B.mat.constructor({ map: B.mat.map }); B.__unlit = new (B.mat.map.constructor === Object ? Object : window.THREE_MeshBasic || B.mat.constructor)({ map: B.mat.map }); }
          const hulls = []; B.root.traverse(o => { if (o.userData && o.userData.outline) hulls.push(o); });
          hulls.forEach(o => o.visible = v === 'on');
          B.mesh.material = v === 'lambert' ? B.__lam : v === 'unlit' ? (B.__ul || (B.__ul = (() => { const m = B.__orig.clone(); m.onBeforeCompile = () => {}; m.customProgramCacheKey = () => 'ul'; m.emissive.setRGB(1, 1, 1); m.emissiveMap = m.map; m.emissiveIntensity = 1; m.color.setRGB(0, 0, 0); return m; })())) : B.__orig;
          const p = G.player; G.render.setFocus({ x: p.pos.x, y: 0, z: p.pos.z }, true); G.render.render(0);
          return G.render.toScreen({ x: p.pos.x, y: 0.85, z: p.pos.z });
        }, [v, Z]);
        const W = Math.round(Math.min(VW, 150 * Z + 60)), H = Math.round(Math.min(VH, 190 * Z + 60));
        const fn = `${OUT}/_lp_${TAG}_${g}_${Z}_${v}.png`; await pg.screenshot({ path: fn, clip: { x: Math.max(0, Math.round(c.x - W / 2)), y: Math.max(0, Math.round(c.y - H / 2)), width: W, height: H }, timeout: 300000 }); shots.push(fn);
      }
      const out = `${OUT}/${TAG}_look_${JOB}_${g}_z${Z}.png`; rows.push(out);
      fs.writeFileSync('/tmp/_lp.py', `from PIL import Image, ImageDraw\nfr=${JSON.stringify(shots)}\nlab=${JSON.stringify(VARIANTS)}\nims=[Image.open(f).convert('RGB') for f in fr]\nw,h=ims[0].size\ns=Image.new('RGB',(w*len(ims),h+18),(20,20,28))\nd=ImageDraw.Draw(s)\nfor i,im in enumerate(ims): s.paste(im,(i*w,18)); d.text((i*w+4,3),lab[i],fill=(255,255,255))\ns.save('${out}')\n`);
      execSync('python3 /tmp/_lp.py');
    }
  }
  console.log(rows.join('\n'), errs.slice(0, 4)); await b.close();
})();
