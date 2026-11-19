// 스킬 이펙트 리마스터(테일즈위버풍) 점검용: 여러 직업 스킬을 한 브라우저에서 차례로 실제 시전하고, 게임 줌에서 시각별 장면을 띠로 저장.
// Usage: SKILLS="novice:nv_a1,novice:nv_a2,cook:ck1_a1" SIZE=1280x720|390x844t ZOOM=1 TIMES=0.1,0.2,.. QUALITY=high DET=1 TAG=audit
//        URL=http://localhost:8893/index.html OUT=/tmp/fxr  node tools/browser-tests/fxr_audit.js
//   -> OUT/<TAG>_<size>_<skill>.png (띠) + OUT/<TAG>_<size>.json (스킬마다 피해 시각·양 — DET=1이면 코드 버전 사이 비교용)
//   찍지 않는 프레임은 GPU 그리기를 건너뜀(이펙트는 같이 나이 먹음). 대상: 멧돼지 1(앞 1.8 m) + 2(옆), 땅 겨냥 스킬은 3.5 m 앞.
const { chromium } = require('playwright'); const fs = require('fs'); const { execSync } = require('child_process');
const SIZE = process.env.SIZE || '1280x720', TOUCH = SIZE.endsWith('t'), [VW, VH] = SIZE.replace('t', '').split('x').map(Number);
const OUT = process.env.OUT || '/tmp/fxr', TAG = process.env.TAG || 'audit', FPS = 60, ZOOM = +(process.env.ZOOM || 1);
const TIMES = (process.env.TIMES || '0.10,0.20,0.30,0.40,0.55,0.75,1.0,1.4').split(',').map(Number);
const LIST = (process.env.SKILLS || 'novice:nv_a1').split(',').map(s => s.split(':'));
const CW = +(process.env.CW || Math.min(VW, TOUCH ? 390 : 640)), CH = +(process.env.CH || Math.min(VH, TOUCH ? 520 : 440));
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: VW, height: VH }, hasTouch: TOUCH, isMobile: TOUCH })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error' || /fx|skill op/i.test(m.text())) errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(process.env.URL || 'http://localhost:8893/index.html');
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(q => { localStorage.clear(); localStorage.setItem('arcan_settings', JSON.stringify(Object.assign({ graphicsFx: true }, q ? { gfxQuality: q } : {}))); }, process.env.QUALITY || '');
  await pg.reload(); await click('게임 시작 (새 게임)'); await click('모험 시작');
  await pg.waitForSelector('.prologue.on', { timeout: 60000 }).then(() => click('건너뛰기')).catch(() => {});
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.player.body && G.player.body.md, null, { timeout: 300000 });
  await pg.waitForFunction(() => G.skillFx, null, { timeout: 120000 });
  await ev(z => {
    G.frame = () => {}; const c = G.render.cam; c.zoom = z; c.updateProjectionMatrix();
    document.querySelectorAll('.hud,.controls,.toasts,.qhud,.qh-reopen').forEach(e => e.style.display = 'none');
    if (G.reward) { G.reward.jobChange = sw => sw && sw(); G.reward.levelUp = () => {}; }
    G.input.block = true;
    const p = G.player, cx = p.pos.x, cz = p.pos.z, free = (c, R) => { for (let x = -R; x <= R; x += 0.75) for (let z = -R; z <= R; z += 0.75) if (x * x + z * z <= R * R && G.zone.geo.blocked(c.x + x, c.z + z, 0.35)) return false; return true; };
    let spot = null; for (let r = 0; r <= 16 && !spot; r++) for (let k = 0; k < Math.max(1, r * 6) && !spot; k++) { const a = k / Math.max(1, r * 6) * 6.283, c = { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r }; if (free(c, 7)) spot = c; }
    window.__spot = spot || { x: cx, z: cz };
  }, ZOOM);
  if (process.env.FOCUS) await ev(f => { window.__focus = f; }, process.env.FOCUS);
  if (process.env.FACE) await ev(f => { window.__face = f; }, process.env.FACE);
  const all = {}; let curJob = null;
  for (const [job, id] of LIST) {
    if (job !== curJob) {
      await ev(async job => {
        const j = G.data.job(job); G.dev.level(j.tier === 2 ? 50 : 20);
        if (G.sheet.p.job !== job) { G.sheet.p.job = 'novice'; G.sheet.recalc(); if (job !== 'novice') { if (j.tier === 2) { G.dev.job(j.parent); } G.dev.job(job); } }
        G.dev.learnAll('novice'); if (job !== 'novice') { G.dev.learnAll(job); if (j.parent) G.dev.learnAll(j.parent); }
        const w = G.data.itemList.find(i => i.type === 'weapon' && i.job === (j.parent || job) && !i.legacy) || (job === 'novice' ? G.data.itemList.find(i => i.type === 'weapon' && i.kind === 'sword') : null);
        if (w) { G.sheet.bag.add(w.id, 1); G.sheet.p.weapon = w.id; }
        G.sheet.recalc(); G.dev.full(); try { G.dev.items([['f_lunch', 5], ['f_soup', 5], ['c_potion_m', 5]]); } catch (e) {} await G.player.attachBody(); G.player.body.place(G.player.pos); G.player.body.play('idle', 1, true);
        for (const k of Object.keys(G.skillFx)) { const m = G.skillFx[k]; if (m && typeof m.load === 'function') try { m.load(); } catch (e) {} }
      }, job);
      await pg.waitForFunction(() => G.player.body && G.player.body.md, null, { timeout: 120000 }); await pg.waitForTimeout(2500); curJob = job;
    }
    const info = await ev(([id, det, process_env_nofloat, dist]) => {
      const p = G.player, d = G.data.skill2(id), fa = (window.__face || '0,1').split(',').map(Number), fm = Math.hypot(fa[0], fa[1]) || 1, f = { x: fa[0] / fm, z: fa[1] / fm };
      for (const m of [...G.zone.actors]) if (m !== p && m.def && m.body) m.remove && m.remove();
      G.skillFx.clear && G.skillFx.clear(); for (const f of G.ui.floats) f.e.remove(); G.ui.floats.length = 0; if (process_env_nofloat) G.ui.floatLayer.style.display = 'none'; p.skills2.clearTemp && p.skills2.clearTemp(); p.teleport(window.__spot); p.body.place(p.pos); p.setFacing(f.x, f.z); p.target = null; p.lockOn = null; p.path = []; G.dev.full(); p.skills.lock = 0; p.skills2.cd = {};
      const at = (dd, s = 0) => ({ x: p.pos.x + f.x * dd - f.z * s, z: p.pos.z + f.z * dd + f.x * s });
      const ground = d.target === 'ground';
      const D = +dist || 1.8, spots = ground ? [[3.5, 0], [3.9, 1.0], [3.2, -1.1]] : [[D, 0], [D + 0.5, 1.2], [D + 0.6, -1.3]];
      window.__ds = spots.map(([dd, s]) => { const m = G.dev.dummies('mon_boar', 1, 0.01, at(dd, s))[0]; m.teleport(at(dd, s)); m.thinkStep = () => {}; m.hp = m.maxHp = 99999; return m; });
      window.__aim = ground ? at(3.5) : at(D); window.__f = f; window.__ground = ground;
      return { ground, type: d.type };
    }, [id, !!process.env.DET, !!process.env.NOFLOAT, process.env.DIST || '']);
    await pg.waitForFunction(() => window.__ds.every(m => m.body), null, { timeout: 120000 }); await pg.waitForTimeout(600);
    const err = await ev(([id, det]) => {
      let seed = 12345; Math.random = det ? () => 0.5 : () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      const p = G.player, f = window.__f, ds = window.__ds;
      for (const d of ds) { d.setFacing(-f.x, -f.z); d.body.place(d.pos); }
      if (p.body.setArmed) { p.body.setArmed(true); p.calmT = 0; }
      for (let i = 0; i < 12; i++) G.step(1 / 60, false);
      p.teleport(window.__spot); p.setFacing(f.x, f.z); for (const d of ds) d.knock = { x: 0, z: 0 };
      const fc = window.__ground ? 2.2 : +(window.__focus || 1.2), fx_ = p.pos.x + f.x * fc, fz_ = p.pos.z + f.z * fc; G.render.setFocus({ x: fx_, y: 0, z: fz_ }, true);
      if (window.__focus) { if (!window.__cb0) window.__cb0 = G.camBounds; G.camBounds = [fx_, fz_, fx_, fz_]; }   // FOCUS: the camera stays on that point
      window.__hp = ds.map(d => d.hp); window.__dmg = []; window.__t = 0;
      G.sheet.book.sk.slots[0] = id; p.target = window.__ground ? null : ds[0];
      return p.skills2.cast(id, window.__aim) || null;
    }, [id, !!process.env.DET]);
    if (err) { console.log(id, 'cast error', err); all[id] = { err }; continue; }
    const want = new Set(TIMES.map(t => Math.round(t * FPS))), total = Math.round(Math.max(...TIMES) * FPS) + 1, frames = [];
    for (let i = 1; i <= total; i++) {
      const draw = want.has(i);
      const c = await ev(([i, draw]) => {
        window.__t = i / 60; const p = G.player, ds = window.__ds;
        if (draw) G.step(1 / 60, true); else { G.step(1 / 60, false); try { G.skillFx && G.skillFx.update(1 / 60); G.swingFx && G.swingFx.update(1 / 60, G.render.cam); } catch (e) {} }
        ds.forEach((d, k) => { if (d && d.hp < window.__hp[k]) { window.__dmg.push({ t: +window.__t.toFixed(3), k, a: Math.round(window.__hp[k] - d.hp) }); window.__hp[k] = d.hp; } });
        const fc = window.__ground ? 2.2 : +(window.__focus || 1.2), f = window.__f; const s = G.render.toScreen({ x: p.pos.x + f.x * fc, y: (p.pos.y || 0) + 0.8, z: p.pos.z + f.z * fc });
        return [s.x, s.y];
      }, [i, draw]);
      if (process.env.PERFAT && i === Math.round(+process.env.PERFAT * FPS)) all['perf_' + id] = await ev(() => { const r = G.render.r; r.info.autoReset = false; const out = [];
        for (let k = 0; k < 3; k++) { r.info.reset(); const t0 = performance.now(); for (let j = 0; j < 4; j++) { G.render.render(0); r.getContext().finish(); } out.push({ ms: +((performance.now() - t0) / 4).toFixed(1), calls: Math.round(r.info.render.calls / 4), tris: Math.round(r.info.render.triangles / 4) }); }
        r.info.autoReset = true; return { runs: out, geometries: r.info.memory.geometries, textures: r.info.memory.textures, programs: (r.info.programs || []).length, rm: G.skillFx.rm && G.skillFx.rm.stats() }; });   // PERFAT=s: draw-only timing at that moment
      if (draw) { const fn = `${OUT}/_a_${String(i).padStart(3, '0')}.png`; await pg.screenshot({ path: fn, clip: { x: Math.max(0, Math.min(VW - CW, Math.round(c[0] - CW / 2))), y: Math.max(0, Math.min(VH - CH, Math.round(c[1] - CH / 2))), width: CW, height: CH }, timeout: 300000 }); frames.push(fn); }
    }
    if (process.env.SETTLE) { await ev(() => { for (let i = 0; i < 180; i++) { G.step(1 / 60, false); G.skillFx.update(1 / 60); } }); all['left_' + id] = await ev(() => G.skillFx.rm ? G.skillFx.rm.stats() : null); }   // SETTLE=1: 3 s later nothing of the remaster may stay
    const dmg = await ev(() => window.__dmg); all[id] = { dmg, total: dmg.reduce((s, x) => s + x.a, 0) };
    const name = `${OUT}/${TAG}_${SIZE}_${id}.png`;
    fs.writeFileSync('/tmp/_fxrstrip.py', `from PIL import Image, ImageDraw\nfr=${JSON.stringify(frames)}\nlab=${JSON.stringify(TIMES)}\nims=[Image.open(f) for f in fr]\nw,h=ims[0].size\nn=len(ims); cols=4 if n>4 else n; rows=(n+cols-1)//cols\nsh=Image.new('RGB',(w*cols,(h+22)*rows),(20,20,28))\nd=ImageDraw.Draw(sh)\nfor i,(im,l) in enumerate(zip(ims,lab)):\n  x=(i%cols)*w; y=(i//cols)*(h+22)\n  sh.paste(im,(x,y+22)); d.text((x+6,y+4),'${id} %.2fs'%l,fill=(255,255,255))\nsh.save('${name}')`);
    try { execSync('python3 /tmp/_fxrstrip.py'); } catch (e) { console.log('strip failed', e.message); }
    for (const f of frames) fs.rmSync(f, { force: true });
    console.log(id, JSON.stringify(all[id]), name);
  }
  all.errors = errs.slice(0, 20);
  fs.writeFileSync(`${OUT}/${TAG}_${SIZE}.json`, JSON.stringify(all, null, 1)); console.log('errors', errs.slice(0, 8));
  await b.close();
})();
