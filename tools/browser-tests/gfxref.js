// 그래픽 기준 장면(대장장이 + 몬스터 1마리 + 아르칸 분수 광장 + 기본공격)을 같은 카메라·위치·해상도로 찍어 전/후 비교.
// 실제 게임 경로: 새 게임 → 대장장이 전직(G.dev.job) → 분수 남서쪽에 세우고, 앞에 멧돼지 허수아비. G.step(1/60)으로 한 프레임씩.
// Usage: TAG=before|after SIZE=1280x720|390x844t GENDER=m|f JOB=blacksmith ZOOMS=1,2.2 PERF=1
//        URL=http://localhost:8805/index.html OUT=/tmp/gfx NODE_PATH=$(npm root -g) node tools/browser-tests/gfxref.js
//   -> OUT/<TAG>_<size>_<gender>_z<zoom>_{idle,run1,run2,atk1..5}.png, OUT/<TAG>_<size>_<gender>_strip_z<zoom>.png,
//      OUT/<TAG>_<size>_<gender>.json (프레임 시간 ms·draw call·삼각형·텍스처/지오메트리 수, 공격 타격 시각)
const { chromium } = require('playwright'); const fs = require('fs'); const { execSync } = require('child_process');
const SIZE = process.env.SIZE || '1280x720', TOUCH = SIZE.endsWith('t'), [VW, VH] = SIZE.replace('t', '').split('x').map(Number);
const TAG = process.env.TAG || 'after', OUT = process.env.OUT || '/tmp/gfx', G_ = process.env.GENDER || 'm', JOB = process.env.JOB || 'blacksmith';
const ZOOMS = (process.env.ZOOMS || '1,2.2').split(',').map(Number), PERF = process.env.PERF !== '0', HUD = process.env.HUD === '1';
const SPOT = (process.env.SPOT || '-6.2,-6.6').split(',').map(Number), DIR = +(process.env.DIR || 70), MON = process.env.MON || 'mon_boar';
const ZONE = process.env.ZONE || '';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: VW, height: VH }, hasTouch: TOUCH, isMobile: TOUCH })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(process.env.URL || 'http://localhost:8805/index.html');
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(() => localStorage.clear()); await pg.reload(); await click('새 게임'); await click('모험 시작');
  await pg.waitForSelector('.prologue.on', { timeout: 60000 }).then(() => click('건너뛰기')).catch(() => {});
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.player.body && G.player.body.md, null, { timeout: 300000 });
  if (ZONE) { await ev(z => G.loadZone(z, 'start'), ZONE); await pg.waitForFunction(() => !G.loading && G.player.body && G.player.body.md, null, { timeout: 300000 }); }
  await ev(async ([g, job, hud]) => {
    G.frame = () => {};
    if (!hud) document.querySelectorAll('.hud,.toasts,.qhud,.qh-reopen,.plates,.layer:not(.controls)').forEach(e => e.style.display = 'none');
    if (G.reward) { G.reward.jobChange = sw => sw && sw(); G.reward.levelUp = () => {}; }
    G.dev.level(12); G.sheet.p.gender = g; if (job !== 'novice') G.dev.job(job);
    const w = { blacksmith: 'w_hammer_1', pharmacist: 'w_pestle_1', cook: 'w_knife_1', hairdresser: 'w_scissors_1', artist: 'w_brush_1' }[job];
    if (w) { G.sheet.bag.add(w, 1); G.sheet.p.weapon = w; }
    G.sheet.recalc(); G.dev.full(); G.input.block = false;
    await G.player.attachBody(); G.player.body.place(G.player.pos); G.player.body.play('idle', 1, true);
    for (const n of G.zone.npcs) if (n.body && n.pos && Math.hypot(n.pos.x - (-6.2), n.pos.z - (-6.6)) < 3) n.body.setVisible && n.body.setVisible(false);
  }, [G_, JOB, HUD]);
  if (!TOUCH && !HUD) await ev(() => document.querySelectorAll('.controls').forEach(e => e.style.display = 'none'));
  await pg.waitForTimeout(2500);
  await ev(([sx, sz, dir, mon]) => {
    const p = G.player, a = dir * Math.PI / 180, f = { x: Math.sin(a), z: Math.cos(a) };
    for (const m of [...G.zone.actors]) if (m !== p && m.faction === 'monster') m.remove && m.remove();
    const spot = G.zone.geo.nearestFree(sx, sz, 0.4); window.__spot = spot;
    p.teleport(spot); p.body.place(p.pos); p.setFacing(f.x, f.z); p.target = null; p.lockOn = null; p.path = [];
    window.__f = f; const at = { x: spot.x + f.x * 1.7, z: spot.z + f.z * 1.7 };
    const m = G.dev.dummies(mon, 1, 0.01, at)[0]; m.teleport(at); m.thinkStep = () => {}; window.__d = m;
  }, [SPOT[0], SPOT[1], DIR, MON]);
  await pg.waitForFunction(() => window.__d.body && window.__d.body.ready !== false, null, { timeout: 120000 });
  await pg.waitForTimeout(1500);
  const base = `${TAG}_${SIZE}_${G_}${JOB !== 'blacksmith' ? '_' + JOB : ''}${ZONE ? '_' + ZONE : ''}`, res = { errs };
  const reset = async () => ev(() => {
    let seed = 777; Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const p = G.player, f = window.__f, m = window.__d; G.input.stick = { x: 0, y: 0 }; G.input.hold('attack', false);
    p.teleport(window.__spot); p.setFacing(f.x, f.z); p.body.place(p.pos); p.skills.comboN = 0; p.skills.lock = 0; p.skills.pending = [];
    m.teleport({ x: window.__spot.x + f.x * 1.7, z: window.__spot.z + f.z * 1.7 }); m.setFacing(-f.x, -f.z); m.body.place(m.pos);
    p.body.setArmed && p.body.setArmed(true); p.calmT = 0;
    for (let i = 0; i < 30; i++) G.step(1 / 60, false);
    G.render.setFocus({ x: p.pos.x + f.x * 0.6, y: 0, z: p.pos.z + f.z * 0.6 }, true);
  });
  const shot = async fn => { await ev(() => G.render.render(0)); await pg.screenshot({ path: fn, timeout: 300000 }); return fn; };
  const strips = {};
  for (const Z of ZOOMS) {
    await ev(z => { const c = G.render.cam; c.zoom = z; c.updateProjectionMatrix(); }, Z);
    const pre = `${OUT}/${base}_z${Z}`, list = [];
    await reset();
    for (let i = 0; i < 70; i++) await ev(() => G.step(1 / 60, false));   // idle breathing a bit
    list.push(await shot(`${pre}_idle.png`));
    // run: stick toward the screen-right (east-ish), shots at two gait phases, then back to the spot
    await ev(() => { G.input.stick = { x: 0.0, y: -1 }; });
    for (let i = 0; i < 50; i++) await ev(() => { G.step(1 / 60, false); const p = G.player; G.render.setFocus({ x: p.pos.x, y: 0, z: p.pos.z }, true); });
    list.push(await shot(`${pre}_run1.png`));
    for (let i = 0; i < 7; i++) await ev(() => { G.step(1 / 60, false); const p = G.player; G.render.setFocus({ x: p.pos.x, y: 0, z: p.pos.z }, true); });
    list.push(await shot(`${pre}_run2.png`));
    await reset();
    await ev(() => { window.__t = 0; window.__hp = window.__d.hp; window.__dmg = []; G.player.target = window.__d; });
    let n = 0, last = -99;
    for (let i = 0; i < 200 && n < 5; i++) {
      const hit = await ev(([i]) => { G.input.hold('attack', true); window.__t = i / 60; G.step(1 / 60, false); const m = window.__d; if (m.hp < window.__hp) { window.__dmg.push(+window.__t.toFixed(3)); window.__hp = m.hp; return true; } return false; }, [i]);
      if (hit) last = i;
      if (last >= 0 && i === last + 2) { n++; list.push(await shot(`${pre}_atk${n}.png`)); }
    }
    res['dmg_z' + Z] = await ev(() => window.__dmg);
    await ev(() => G.input.hold('attack', false));
    strips[Z] = list;
    const out = `${OUT}/${base}_strip_z${Z}.png`;
    fs.writeFileSync('/tmp/_gfxstrip.py', `from PIL import Image, ImageDraw\nfr=${JSON.stringify(list)}\nims=[Image.open(f).convert('RGB') for f in fr]\nw,h=ims[0].size\nsc=min(1.0, 2400/(w*4))\nims=[i.resize((int(w*sc),int(h*sc))) for i in ims]\nw,h=ims[0].size\ncols=4; rows=(len(ims)+cols-1)//cols\nsh=Image.new('RGB',(w*cols,h*rows),(0,0,0))\nfor k,im in enumerate(ims):\n  sh.paste(im,((k%cols)*w,(k//cols)*h)); ImageDraw.Draw(sh).text(((k%cols)*w+6,(k//cols)*h+4),fr[k].split('_')[-1],fill=(255,255,255))\nsh.save('${out}')\n`);
    try { execSync('python3 /tmp/_gfxstrip.py'); } catch (e) { console.log('strip failed', e.message); }
    console.log('strip', out);
  }
  if (PERF) {
    await ev(() => { const c = G.render.cam; c.zoom = 1; c.updateProjectionMatrix(); });
    await reset();
    res.perf = await ev(async () => {
      const r = G.render.r, out = []; r.info.autoReset = false;
      for (let i = 0; i < 6; i++) G.step(1 / 60, true);
      for (let k = 0; k < 3; k++) {
        r.info.reset(); const t0 = performance.now(); const N = 12;
        for (let i = 0; i < N; i++) { G.step(1 / 60, true); r.getContext().finish(); }
        out.push({ ms: +((performance.now() - t0) / N).toFixed(1), calls: Math.round(r.info.render.calls / N), tris: Math.round(r.info.render.triangles / N) });
      }
      r.info.autoReset = true;
      return { runs: out, geometries: r.info.memory.geometries, textures: r.info.memory.textures, programs: r.info.programs ? r.info.programs.length : null, dpr: r.getPixelRatio() };
    });
  }
  fs.writeFileSync(`${OUT}/${base}.json`, JSON.stringify(res, null, 1));
  console.log(base, JSON.stringify(res));
  await b.close();
})();
