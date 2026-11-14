// 등에 멘 무기를 뒤에서 보기: 캐릭터가 카메라를 등지고(대기·달리기) 무기를 멘 채, 게임 거리(확대 1)와 가까이(3)에서 찍음.
// Usage: TAG= URL= JOB=hairdresser GENDERS=m,f OUT=/tmp/gfx5 NODE_PATH=$(npm root -g) node tools/browser-tests/backprop.js
//   -> OUT/<TAG>_back_<job>.png (행 = 성별, 열 = 대기 z1, 대기 z3, 달리기 z3, 꺼내는 중 z3)
const { chromium } = require('playwright'); const fs = require('fs'); const { execSync } = require('child_process');
const OUT = process.env.OUT || '/tmp/gfx5', TAG = process.env.TAG || 'after', JOB = process.env.JOB || 'hairdresser', GENDERS = (process.env.GENDERS || 'm,f').split(',');
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--single-process', '--no-zygote'] });
  const pg = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage(); const errs = [];
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
    await ev(async ([g, job]) => { const s = G.sheet; s.p.gender = g; s.p.job = 'novice'; if (job !== 'novice') G.dev.job(job); s.recalc(); await G.player.attachBody(); }, [g, JOB]);
    await pg.waitForTimeout(2500);
    const shots = [];
    const shot = async (z, setup) => {
      const c = await ev(([z, setup]) => { const p = G.player, B = p.body, cam = G.render.cam; cam.zoom = z; cam.updateProjectionMatrix(); G.input.stick = { x: 0, y: 0 };
        const spot = G.zone.geo.nearestFree(-6.2, -6.6, 0.4), f = { x: Math.SQRT1_2, z: Math.SQRT1_2 };   // facing away from the camera (camera looks along +x +z)
        p.teleport(spot); p.body.place(p.pos); p.setFacing(f.x, f.z); p.calmT = 99; B.setArmed(false);
        if (setup === 'run') { G.input.stick = { x: 0.7, y: 0.7 }; for (let i = 0; i < 40; i++) { G.step(1 / 60, false); B.setArmed(false); } G.input.stick = { x: 0, y: 0 }; }
        else if (setup === 'draw') { for (let i = 0; i < 20; i++) G.step(1 / 60, false); B.draw(1); for (let i = 0; i < 9; i++) G.step(1 / 60, false); }
        else for (let i = 0; i < 40; i++) { G.step(1 / 60, false); B.setArmed(false); }
        G.render.setFocus({ x: p.pos.x, y: 0, z: p.pos.z }, true); G.render.render(0);
        return G.render.toScreen({ x: p.pos.x, y: 1.0, z: p.pos.z }); }, [z, setup]);
      const W = Math.round(Math.min(1280, 140 * z + 80)), H = Math.round(Math.min(720, 170 * z + 80));
      const fn = `${OUT}/_bp_${TAG}_${g}_${shots.length}.png`; await pg.screenshot({ path: fn, clip: { x: Math.max(0, Math.round(c.x - W / 2)), y: Math.max(0, Math.round(c.y - H / 2)), width: W, height: H }, timeout: 300000 }); shots.push(fn);
    };
    await shot(1, 'idle'); await shot(3, 'idle'); await shot(3, 'run'); await shot(3, 'draw');
    rows.push(shots);
  }
  fs.writeFileSync('/tmp/_bp.py', `from PIL import Image\nrows=${JSON.stringify(rows)}\nims=[[Image.open(f).convert('RGB') for f in r] for r in rows]\nH=max(i.height for r in ims for i in r)\nW=sum(i.width for i in ims[0])\ns=Image.new('RGB',(W,H*len(ims)),(20,20,28))\nfor y,r in enumerate(ims):\n  x=0\n  for im in r: s.paste(im,(x,y*H)); x+=im.width\ns.save('${OUT}/${TAG}_back_${JOB}.png')\n`);
  execSync('python3 /tmp/_bp.py'); console.log(`${OUT}/${TAG}_back_${JOB}.png`, errs.slice(0, 3)); await b.close();
})();
