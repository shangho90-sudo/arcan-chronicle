// 직업별 화면 확인표: 모든 1차 직업(+견습생) × 남/여를 같은 자리(아르칸 분수 광장)·같은 카메라에서 대기 1장 + 기본공격(직업 콤보)
// 1·3·5타 명중 1프레임 뒤 3장을 찍어 한 장의 표로 붙임. 피격 번쩍임·외곽선·비율·무기 크기·이펙트를 한눈에 비교.
// Usage: TAG=before|after SIZE=1280x720 ZOOM=2.4 JOBS=novice,blacksmith,pharmacist,cook,hairdresser,artist GENDERS=m,f
//        URL=http://localhost:8817/index.html OUT=/tmp/gfx2 BARGS='--single-process --no-zygote' NODE_PATH=$(npm root -g) node tools/browser-tests/jobsheet.js
//   -> OUT/<TAG>_jobsheet_<size>.png (행 = 직업·성별, 열 = idle, run, hit1, hit3, hit5), OUT/<TAG>_jobsheet_<size>.json (타별 피해 시각)
const { chromium } = require('playwright'); const fs = require('fs'); const { execSync } = require('child_process');
const SIZE = process.env.SIZE || '1280x720', TOUCH = SIZE.endsWith('t'), [VW, VH] = SIZE.replace('t', '').split('x').map(Number);
const TAG = process.env.TAG || 'after', OUT = process.env.OUT || '/tmp/gfx2', ZOOM = +(process.env.ZOOM || 2.4);
const JOBS = (process.env.JOBS || 'novice,blacksmith,pharmacist,cook,hairdresser,artist').split(','), GENDERS = (process.env.GENDERS || 'm,f').split(',');
const CW = +(process.env.CW || 300), CH = +(process.env.CH || 330), RUN = process.env.RUN !== '0';   // RUN=0: no run column
const WEAPON = { blacksmith: 'w_hammer_1', pharmacist: 'w_pestle_1', cook: 'w_knife_1', hairdresser: 'w_scissors_1', artist: 'w_brush_1' };
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...(process.env.BARGS ? process.env.BARGS.split(' ') : [])] });
  const pg = await (await b.newContext({ viewport: { width: VW, height: VH }, hasTouch: TOUCH, isMobile: TOUCH })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(process.env.URL || 'http://localhost:8817/index.html');
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(() => localStorage.clear()); await pg.reload(); await click('새 게임'); await click('모험 시작');
  await pg.waitForSelector('.prologue.on', { timeout: 60000 }).then(() => click('건너뛰기')).catch(() => {});
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.player.body && G.player.body.md, null, { timeout: 300000 });
  await ev(z => {
    G.frame = () => {}; const c = G.render.cam; c.zoom = z; c.updateProjectionMatrix();
    document.querySelectorAll('.hud,.toasts,.qhud,.qh-reopen,.plates,.layer,.controls').forEach(e => e.style.display = 'none');
    if (G.reward) { G.reward.jobChange = sw => sw && sw(); G.reward.levelUp = () => {}; }
    G.dev.level(12);
    for (const n of G.zone.npcs) if (n.body && n.body.setVisible) n.body.setVisible(false);
  }, ZOOM);
  const rows = [], log = {};
  for (const job of JOBS) for (const g of GENDERS) {
    await ev(async ([job, g, w]) => {
      const s = G.sheet; s.p.gender = g; s.p.job = 'novice'; if (job !== 'novice') G.dev.job(job);
      if (w) { s.bag.add(w, 1); s.p.weapon = w; } s.recalc(); G.dev.full();
      await G.player.attachBody();
      for (const m of [...G.zone.actors]) if (m !== G.player && m.faction === 'monster') m.remove && m.remove();
      const spot = G.zone.geo.nearestFree(-6.2, -6.6, 0.4), a = 70 * Math.PI / 180, f = { x: Math.sin(a), z: Math.cos(a) };
      window.__spot = spot; window.__f = f; const p = G.player; p.teleport(spot); p.body.place(p.pos); p.setFacing(f.x, f.z);
      const at = { x: spot.x + f.x * 1.7, z: spot.z + f.z * 1.7 }, m = G.dev.dummies('mon_boar', 1, 0.01, at)[0]; m.teleport(at); m.thinkStep = () => {}; window.__d = m;
    }, [job, g, WEAPON[job]]);
    await pg.waitForFunction(() => window.__d.body && G.player.body && G.player.body.md, null, { timeout: 120000 });
    await pg.waitForTimeout(1500);
    const shots = [], dmg = [];
    await ev(() => { let seed = 777; Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      const p = G.player, f = window.__f, m = window.__d; p.teleport(window.__spot); p.setFacing(f.x, f.z); p.body.place(p.pos); p.skills.comboN = 0;
      m.setFacing(-f.x, -f.z); m.body.place(m.pos); p.body.setArmed && p.body.setArmed(true); p.calmT = 0; p.target = null;   // no target yet: with a target the player starts swinging and the 'idle' shot was a combo frame (2026-11-15)
      for (let i = 0; i < 60; i++) G.step(1 / 60, false);
      G.render.setFocus({ x: p.pos.x + f.x * 0.7, y: 0, z: p.pos.z + f.z * 0.7 }, true); window.__hp = m.hp; });
    const shot = async () => { const c = await ev(() => { G.render.render(0); const p = G.player, f = window.__f; return G.render.toScreen({ x: p.pos.x + f.x * 0.7, y: 0.85, z: p.pos.z + f.z * 0.7 }); });
      const fn = `${OUT}/_js_${TAG}_${job}_${g}_${shots.length}.png`;
      await pg.screenshot({ path: fn, clip: { x: Math.max(0, Math.min(VW - CW, Math.round(c.x - CW / 2))), y: Math.max(0, Math.min(VH - CH, Math.round(c.y - CH / 2))), width: CW, height: CH }, timeout: 300000 }); shots.push(fn); };
    await shot();
    if (RUN) {                                    // run column (2026-11-14): 40 frames toward screen-right, shot mid-stride, back to the spot
      await ev(() => { G.input.stick = { x: 0.0, y: -1 }; for (let i = 0; i < 40; i++) { G.step(1 / 60, false); } const p = G.player; G.render.setFocus({ x: p.pos.x, y: 0, z: p.pos.z }, true); window.__runAt = { x: p.pos.x, z: p.pos.z }; });
      const c = await ev(() => { G.render.render(0); const q = window.__runAt; return G.render.toScreen({ x: q.x, y: 0.85, z: q.z }); });
      const fn = `${OUT}/_js_${TAG}_${job}_${g}_${shots.length}.png`;
      await pg.screenshot({ path: fn, clip: { x: Math.max(0, Math.min(VW - CW, Math.round(c.x - CW / 2))), y: Math.max(0, Math.min(VH - CH, Math.round(c.y - CH / 2))), width: CW, height: CH }, timeout: 300000 }); shots.push(fn);
      await ev(() => { G.input.stick = { x: 0, y: 0 }; const p = G.player, f = window.__f, m = window.__d; p.teleport(window.__spot); p.setFacing(f.x, f.z); p.body.place(p.pos); p.skills.comboN = 0; p.target = m;
        for (let i = 0; i < 40; i++) G.step(1 / 60, false); G.render.setFocus({ x: p.pos.x + f.x * 0.7, y: 0, z: p.pos.z + f.z * 0.7 }, true); window.__hp = m.hp; });
    }
    await ev(() => { G.player.target = window.__d; });
    let n = 0, last = -99;
    for (let i = 0; i < 200 && n < 5; i++) {
      const hit = await ev(i => { G.input.hold('attack', true); G.step(1 / 60, false); const m = window.__d; if (m.hp < window.__hp) { window.__hp = m.hp; return +(i / 60).toFixed(3); } return null; }, i);
      if (hit !== null) { dmg.push(hit); last = i; n++; }
      if (last === i - 1 && [1, 3, 5].includes(n)) await shot();
    }
    await ev(() => G.input.hold('attack', false));
    log[job + '_' + g] = { dmg, action: await ev(() => G.player.body.action) };
    rows.push(shots); console.log(job, g, dmg.join(' '));
  }
  fs.writeFileSync('/tmp/_jobsheet.py', `from PIL import Image, ImageDraw\nrows=${JSON.stringify(rows)}\nlab=${JSON.stringify(JOBS.flatMap(j => GENDERS.map(g => j + ' ' + g)))}\nW,H=${CW},${CH}\nNC=max(len(r) for r in rows)\nsh=Image.new('RGB',(W*NC+110,H*len(rows)),(20,20,28))\nd=ImageDraw.Draw(sh)\nfor r,row in enumerate(rows):\n  d.text((6,r*H+H//2),lab[r],fill=(255,255,255))\n  for c,f in enumerate(row): sh.paste(Image.open(f).convert('RGB'),(110+c*W,r*H))\nsh.save('${OUT}/${TAG}_jobsheet_${SIZE}.png')\n`);
  execSync('python3 /tmp/_jobsheet.py');
  fs.writeFileSync(`${OUT}/${TAG}_jobsheet_${SIZE}.json`, JSON.stringify({ log, errs }, null, 1));
  console.log('sheet', `${OUT}/${TAG}_jobsheet_${SIZE}.png`, errs.slice(0, 5)); await b.close();
})();
