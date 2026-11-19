// 리마스터 캐릭터 재질 확인(2026-11-19): 같은 세션·같은 프레임에서 품질만 바꿔 찍음 — 예전(low) / 높음(high) / 재질 구분 색(debug:
// 빨강 = 피부, 초록 = 머리카락, 파랑 = 가죽, 노랑 = 금속, 회색 = 천). 약사(남·여)를 분수 광장에서 카메라 쪽으로 세움.
// SPOT=x,z (player spot), FULL=1 (whole view instead of a crop round the player)
// Usage: GENDER=m|f SIZE=1280x720 ZOOM=3.2 DIR=200 VARIANTS=low,high,debug URL=http://localhost:8943/index.html OUT=/tmp/remaster/probe node rmprobe.js
const { chromium } = require('playwright'); const fs = require('fs'); const { execSync } = require('child_process');
const SIZE = process.env.SIZE || '1280x720', TOUCH = SIZE.endsWith('t'), [VW, VH] = SIZE.replace('t', '').split('x').map(Number);
const G_ = process.env.GENDER || 'm', OUT = process.env.OUT || '/tmp/remaster/probe', ZOOM = +(process.env.ZOOM || 3.2), DIR = +(process.env.DIR || 200);
const VARS = (process.env.VARIANTS || 'low,high,debug').split(','), JOBS = (process.env.JOBS || process.env.JOB || 'pharmacist').split(','), GENDERS = (process.env.GENDERS || G_).split(',');
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: VW, height: VH }, hasTouch: TOUCH, isMobile: TOUCH })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(process.env.URL || 'http://localhost:8943/index.html');
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(() => { localStorage.clear(); localStorage.setItem('arcan_settings', JSON.stringify({ gfxQuality: 'low' })); }); await pg.reload(); await click('게임 시작 (새 게임)'); await click('모험 시작');
  await pg.waitForSelector('.prologue.on', { timeout: 60000 }).then(() => click('건너뛰기')).catch(() => {});
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.player.body && G.player.body.md, null, { timeout: 300000 });
  for (const JOB of JOBS) for (const G_ of GENDERS) {
  await ev(async ([g, job, z, dir, sp]) => {
    G.frame = () => {}; document.querySelectorAll('.hud,.controls,.toasts,.qhud,.qh-reopen,.plates,.layer:not(.controls)').forEach(e => e.style.display = 'none');
    if (G.reward) { G.reward.jobChange = sw => sw && sw(); G.reward.levelUp = () => {}; }
    G.dev.level(job === 'novice' ? 5 : 12); G.sheet.p.gender = g; G.sheet.p.job = 'novice'; if (job !== 'novice') G.dev.job(job); G.sheet.recalc(); G.sheet.bag.add('w_pestle_1', 1); G.sheet.p.weapon = 'w_pestle_1'; G.sheet.recalc();
    await G.player.attachBody(); const p = G.player, a = dir * Math.PI / 180;
    const spot = G.zone.geo.nearestFree(sp[0], sp[1], 0.4); p.teleport(spot); p.body.place(p.pos); p.setFacing(Math.sin(a), Math.cos(a)); p.body.play('idle', 1, true);
    for (const n of G.zone.npcs) if (n.body && n.pos && Math.hypot(n.pos.x - spot.x, n.pos.z - spot.z) < 3) n.body.setVisible && n.body.setVisible(false);
    for (let i = 0; i < 40; i++) G.step(1 / 60, false);
    const c = G.render.cam; c.zoom = z; c.updateProjectionMatrix(); G.render.setFocus({ x: p.pos.x, y: 0, z: p.pos.z }, true);
  }, [G_, JOB, ZOOM, DIR, (process.env.SPOT || '-6.2,-6.6').split(',').map(Number)]);
  await pg.waitForTimeout(3000);
  const files = [];
  for (const v of VARS) {
    await ev(async v => { const R = await import('/js/render.js'); R.RMC.debug = v === 'debug'; G.settings.gfxQuality = v === 'debug' ? 'high' : v; G.applySettings(); G.render.render(0); }, v);
    const s = await ev((fy) => { const p = G.player; return G.render.toScreen({ x: p.pos.x, y: (p.pos.y || 0) + fy, z: p.pos.z }); }, +(process.env.FOCUSY || 0.8));
    const W = process.env.FULL ? VW : Math.min(VW, 520), H = process.env.FULL ? VH : Math.min(VH, 640), fn = `${OUT}/probe_${JOB}_${G_}_${SIZE}_${v}.png`;
    await ev(() => G.render.render(0));
    await pg.screenshot({ path: fn, clip: { x: Math.max(0, Math.min(VW - W, Math.round(s.x - W / 2))), y: Math.max(0, Math.min(VH - H, Math.round(s.y - H / 2))), width: W, height: H }, timeout: 300000 });
    files.push(fn);
  }
  const out = `${OUT}/probe_${JOB}_${G_}_${SIZE}_sheet.png`;
  fs.writeFileSync('/tmp/_rmprobe.py', `from PIL import Image, ImageDraw\nfr=${JSON.stringify(files)}\nlab=${JSON.stringify(VARS)}\nims=[Image.open(f).convert('RGB') for f in fr]\nw,h=ims[0].size\nsh=Image.new('RGB',(w*len(ims),h+24),(20,20,28))\nd=ImageDraw.Draw(sh)\nfor i,im in enumerate(ims):\n  sh.paste(im,(i*w,24)); d.text((i*w+6,5),lab[i],fill=(255,255,255))\nsh.save('${out}')\n`);
  execSync('python3 /tmp/_rmprobe.py'); console.log('sheet', out, 'errors', errs.filter(e => !/favicon/.test(e)).slice(0, 8));
  }
  await b.close();
})();
