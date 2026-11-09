// 일격참 nv_a1 을 실제 스킬 경로(cast → 칼 동작·돌진 → 타격 → '살' 이펙트)로 시전하고, 타격 시각 기준 같은 시점의 프레임을 저장.
// 정상 배속으로 G.step(1/FPS) 한 프레임씩 진행(캐릭터·판정·이펙트가 같은 시간축). Math.random 고정 → 수정 전후 같은 장면.
// Usage: SCENE=single|line|whiff|close|kill|moving (2026-11-10: close = 1.4 m, kill = the hit kills the dummy, moving = target walks sideways 2.5 m/s) DIRS=90,225 ZOOM=1 SIZE=1100x760|390x844t FX=1|0 TAG=after URL=... node tools/browser-tests/sal_skill.js
//   -> OUT/<TAG>_<scene>_<dir>_<size>_fx<FX>.png (가로 띠: 타격 -0.10/-0.05/0/+0.03/+0.06/+0.10/+0.16/+0.22/+0.30 s) + 개별 프레임 폴더
const { chromium } = require('playwright'); const fs = require('fs'); const { execSync } = require('child_process');
const SCENE = process.env.SCENE || 'single', DIRS = (process.env.DIRS || '90').split(',').map(Number), FPS = +(process.env.FPS || 60);
const SIZE = process.env.SIZE || '1100x760', TOUCH = SIZE.endsWith('t'), [VW, VH] = SIZE.replace('t', '').split('x').map(Number);
const FX = process.env.FX !== '0', TAG = process.env.TAG || 'after', OUT = process.env.OUT || '/tmp/salfx2', ZOOM = +(process.env.ZOOM || 1);
const CW = +(process.env.CW || Math.min(VW, 560)), CH = +(process.env.CH || Math.min(VH, 420));
const MARKS = [-0.10, -0.05, 0, 0.03, 0.06, 0.10, 0.16, 0.22, 0.30];
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: VW, height: VH }, hasTouch: TOUCH, isMobile: TOUCH })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error' || /salfx|fx sal/.test(m.text())) errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(process.env.URL || 'http://localhost:8765/index.html');
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(fx => { localStorage.clear(); localStorage.setItem('arcan_settings', JSON.stringify({ graphicsFx: fx })); }, FX);
  await pg.reload(); await click('새 게임'); await click('모험 시작');
  await pg.waitForSelector('.prologue.on', { timeout: 60000 }).then(() => click('건너뛰기')).catch(() => {});
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.player.body && G.player.body.md, null, { timeout: 300000 });
  const ZONE = process.env.ZONE || '';
  if (ZONE) { await ev(z => G.loadZone(z), ZONE); await pg.waitForFunction(z => G.zone && G.zone.def.id === z && !G.loading, ZONE, { timeout: 400000 }); }
  await pg.waitForFunction(() => G.skillFx && G.skillFx.sal && G.skillFx.sal.ready, null, { timeout: 120000 });
  await pg.waitForTimeout(1500);
  await ev(z => {
    G.frame = () => {}; const c = G.render.cam; c.zoom = z; c.updateProjectionMatrix();
    document.querySelectorAll('.hud,.controls,.toasts,.layer,.qhud,.qh-reopen,.plates').forEach(e => e.style.display = 'none');
    const p = G.player; G.dev.level(12); G.dev.full(); G.input.block = true;
    // open floor: first spot whose 9 m x 6 m surroundings are free
    let spot = null; const sp0 = (G.zone.def.spawns || []).find(q => q.id === 'start') || { pos: [p.pos.x, p.pos.z] }, cx = sp0.pos[0], cz = sp0.pos[1];
    const cand = []; for (let r = 0; r <= 16; r += 1) for (let k = 0; k < Math.max(1, r * 6); k++) { const a = k / Math.max(1, r * 6) * Math.PI * 2; cand.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r }); }
    for (const R of [5, 4.5, 4, 3.5]) { for (const c of cand) { let ok = true; for (let a = -R; a <= R && ok; a += 0.75) for (let o = -R; o <= R && ok; o += 0.75) if (a * a + o * o <= R * R && G.zone.geo.blocked(c.x + a, c.z + o, 0.35)) ok = false; if (ok) { spot = c; break; } } if (spot) break; }
    if (!spot) spot = { x: p.pos.x, z: p.pos.z };
    window.__spot = spot; G.sheet.book.sk.learned.nv_a1 = 3; G.sheet.recalc(); G.sheet.book.equip('nv_a1', 0, false);
  }, ZOOM);
  const strips = [];
  for (const dir of DIRS) {
    const name = `${TAG}_${SCENE}_${dir}_${SIZE}_fx${FX ? 1 : 0}${process.env.ZONE ? '_' + process.env.ZONE : ''}`, dirOut = `${OUT}/${name}`; fs.rmSync(dirOut, { recursive: true, force: true }); fs.mkdirSync(dirOut, { recursive: true });
    await ev(([dir, scene, fps]) => {
      const p = G.player, a = dir * Math.PI / 180, f = { x: Math.sin(a), z: Math.cos(a) };
      for (const m of [...G.zone.actors]) if (m !== p && m.def && m.body) m.remove && m.remove();
      G.skillFx.clear(); p.teleport(window.__spot); p.body.place(p.pos); p.setFacing(f.x, f.z); p.target = null; p.lockOn = null; p.path = [];
      p.skills2.cd = {}; G.dev.full();
      const at = d => ({ x: p.pos.x + f.x * d, z: p.pos.z + f.z * d });
      window.__ds = []; window.__f = f; window.__at = at;
      for (const d of scene === 'line' ? [2.6, 3.6, 4.6] : scene === 'close' ? [1.4] : [2.8]) { const m = G.dev.dummies('mon_boar', 1, 0.01, at(d))[0]; m.teleport(at(d)); m.thinkStep = () => {}; window.__ds.push(m); }
    }, [dir, SCENE, FPS]);
    await pg.waitForFunction(() => window.__ds.every(m => m.body), null, { timeout: 120000 });
    const info = await ev(([scene, fps]) => {
      let seed = 12345; Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      const p = G.player, f = window.__f, at = window.__at, ds = window.__ds;
      for (const m of ds) { m.teleport(m.pos); m.setFacing(-f.x, -f.z); m.body.place(m.pos); }
      for (let i = 0; i < 12; i++) G.step(1 / fps, false);
      p.teleport(window.__spot); p.setFacing(f.x, f.z); for (const m of ds) m.knock = { x: 0, z: 0 };
      G.render.setFocus({ x: p.pos.x + f.x * 1.6, y: 0, z: p.pos.z + f.z * 1.6 }, true);
      window.__hits = []; const S = G.skillFx.sal, oh = S.hit.bind(S); if (!S.__wrapped) { S.__wrapped = true; S.hit = (pos, d, o) => { const r = oh(pos, d, o); const c = S.live.find(x => x.kind === 'cast'); window.__hits.push({ t: window.__t, pos: { ...pos }, o: { primary: o.primary, whiff: o.whiff, size: o.size }, gap: c ? +Math.hypot(c.end.x - pos.x, c.end.y - pos.y, c.end.z + pos.z).toFixed(3) : null }); return r; }; }
      window.__t = 0; p.target = ds[0];
      const e = p.skills2.cast('nv_a1', at(2)); if (e) return 'cast error: ' + e;
      // 허공: the only target vanishes right after the cast (the skill keeps its single-target rule -> nothing to hit)
      if (scene === 'whiff') for (const m of ds) { m.dead = true; m.remove(); }
      if (scene === 'kill') for (const m of ds) m.hp = 1;   // the hit kills it (maxHp is a fixed getter on dummies)
      window.__move = scene === 'moving' ? { x: f.z, z: -f.x, v: 2.5 } : null;
      return { ds: ds.length };
    }, [SCENE, FPS]);
    if (typeof info === 'string') { console.log(info); continue; }
    // step at normal speed, one frame at a time; keep every frame, find the hit frame, then pick the marked times
    const frames = []; const total = Math.round(0.95 * FPS);
    for (let i = 0; i < total; i++) {
      const c = await ev(([i, fps]) => { window.__t = i / fps; const mv = window.__move; if (mv) for (const m of window.__ds) if (!m.dead) m.teleport({ x: m.pos.x + mv.x * mv.v / fps, z: m.pos.z + mv.z * mv.v / fps }); G.step(1 / fps, true); const p = G.player, f = window.__f; const s = G.render.toScreen({ x: p.pos.x + f.x * 1.6, y: p.pos.y + 0.9, z: p.pos.z + f.z * 1.6 }); return [s.x, s.y, window.__hits.length]; }, [i, FPS]);
      const fn = `${dirOut}/${String(i).padStart(3, '0')}.png`;
      if (process.env.MARKONLY && !MARKS.some(m => Math.abs(i - (Math.round(0.30 * FPS) + 1 + Math.round(m * FPS))) < 0.5)) { frames.push(null); continue; }
      await pg.screenshot({ path: fn, clip: { x: Math.max(0, Math.min(VW - CW, Math.round(c[0] - CW / 2))), y: Math.max(0, Math.min(VH - CH, Math.round(c[1] - CH / 2))), width: CW, height: CH }, timeout: 300000 });
      frames.push(fn);
    }
    const hits = await ev(() => window.__hits.map(h => ({ t: +h.t.toFixed(3), size: h.o.size, primary: h.o.primary, whiff: h.o.whiff, gap: h.gap, dead: window.__ds.map(m => !!m.dead) })));
    const ht = hits.length ? hits[0].t : null, hitFrame = ht == null ? null : Math.round(ht * FPS) + 1;   // the frame drawn right after the hit step
    const pick = MARKS.map(m => hitFrame == null ? null : Math.max(0, Math.min(frames.length - 1, hitFrame + Math.round(m * FPS)))).map(i => i != null && frames[i] ? i : null);
    fs.writeFileSync('/tmp/_salstrip.py', `from PIL import Image, ImageDraw\nfr=${JSON.stringify(pick.map(i => i == null ? '' : frames[i]))}\nlab=${JSON.stringify(MARKS)}\nims=[Image.open(f) if f else None for f in fr]\nw,h=next(i for i in ims if i).size\nims=[i or Image.new('RGB',(w,h),(0,0,0)) for i in ims]\nw,h=ims[0].size\nsh=Image.new('RGB',(w*len(ims),h+22),(20,20,28))\nd=ImageDraw.Draw(sh)\nfor i,(im,l) in enumerate(zip(ims,lab)):\n  sh.paste(im,(i*w,22)); d.text((i*w+6,4),('hit %+.2fs'%l),fill=(255,255,255))\nsh.save('${OUT}/${name}.png')`);
    try { execSync('python3 /tmp/_salstrip.py'); strips.push(`${OUT}/${name}.png`); } catch (e) { console.log('strip failed', e.message); }
    console.log(name, JSON.stringify({ hits, hitFrame }));
  }
  console.log('strips', strips, 'errors', errs.slice(0, 6)); await b.close();
})();
