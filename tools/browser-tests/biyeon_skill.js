// 비연참 nv_a3 을 실제 스킬 경로(cast → nv_biyeon 휘두르기 → 투사체 → 처음 닿은 적 하나만 피해)로 시전하고 프레임을 저장.
// 정상 배속으로 G.step(1/FPS) 한 프레임씩 진행. Math.random 고정 → 수정 전후(같은 카메라·방향·시각) 같은 장면.
// Usage: SCENE=single|line|whiff|far DIRS=0,45,...,315 ZOOM=1 SIZE=1100x760|390x844t FX=1|0 TAG=after URL=... MARKONLY=1 OUT=/tmp/biyeonfx
//   node tools/browser-tests/biyeon_skill.js
//   -> OUT/<TAG>_<scene>_<dir>_<size>_fx<FX>.png (가로 띠: 시전 후 MARKS 초) + 개별 프레임 폴더, 콘솔에 명중 시각·피해 받은 더미
//   line = 같은 줄에 더미 3마리(3.5 / 5 / 6.5 m): 단일 대상 규칙상 첫 번째만 피해를 받아야 함
const { chromium } = require('playwright'); const fs = require('fs'); const { execSync } = require('child_process');
const SCENE = process.env.SCENE || 'single', DIRS = (process.env.DIRS || '90').split(',').map(Number), FPS = +(process.env.FPS || 60);
const SIZE = process.env.SIZE || '1100x760', TOUCH = SIZE.endsWith('t'), [VW, VH] = SIZE.replace('t', '').split('x').map(Number);
const FX = process.env.FX !== '0', TAG = process.env.TAG || 'after', OUT = process.env.OUT || '/tmp/biyeonfx', ZOOM = +(process.env.ZOOM || 1);
const CW = +(process.env.CW || Math.min(VW, 720)), CH = +(process.env.CH || Math.min(VH, 520));
const MARKS = (process.env.MARKS || '0.06,0.14,0.22,0.28,0.36,0.46,0.56,0.68,0.85,1.05').split(',').map(Number);
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: VW, height: VH }, hasTouch: TOUCH, isMobile: TOUCH })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error' || /biyeon/.test(m.text())) errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(process.env.URL || 'http://localhost:8765/index.html');
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(fx => { localStorage.clear(); localStorage.setItem('arcan_settings', JSON.stringify({ graphicsFx: fx })); }, FX);
  await pg.reload(); await click('새 게임'); await click('모험 시작');
  await pg.waitForSelector('.prologue.on', { timeout: 60000 }).then(() => click('건너뛰기')).catch(() => {});
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.player.body && G.player.body.md, null, { timeout: 300000 });
  const ZONE = process.env.ZONE || '';
  if (ZONE) { await ev(z => G.loadZone(z), ZONE); await pg.waitForFunction(z => G.zone && G.zone.def.id === z && !G.loading, ZONE, { timeout: 400000 }); }
  await pg.waitForFunction(() => G.skillFx && (!G.skillFx.biyeon || G.skillFx.biyeon.ready), null, { timeout: 120000 });   // the "before" build has no biyeon module
  await pg.waitForTimeout(1500);
  await ev(z => {
    G.frame = () => {}; const c = G.render.cam; c.zoom = z; c.updateProjectionMatrix();
    document.querySelectorAll('.hud,.controls,.toasts,.layer,.qhud,.qh-reopen,.plates').forEach(e => e.style.display = 'none');
    const p = G.player; G.dev.level(12); G.dev.full(); G.input.block = true;
    // open floor: first spot whose 7.5 m radius is free (the blades fly ~7 m)
    let spot = null; const sp0 = (G.zone.def.spawns || []).find(q => q.id === 'start') || { pos: [p.pos.x, p.pos.z] }, cx = sp0.pos[0], cz = sp0.pos[1];
    const cand = []; for (let r = 0; r <= 20; r += 1) for (let k = 0; k < Math.max(1, r * 6); k++) { const a = k / Math.max(1, r * 6) * Math.PI * 2; cand.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r }); }
    for (const R of [7.5, 6.5, 5.5, 4.5]) { for (const c of cand) { let ok = true; for (let a = -R; a <= R && ok; a += 0.75) for (let o = -R; o <= R && ok; o += 0.75) if (a * a + o * o <= R * R && G.zone.geo.blocked(c.x + a, c.z + o, 0.35)) ok = false; if (ok) { spot = c; break; } } if (spot) break; }
    if (!spot) spot = { x: p.pos.x, z: p.pos.z };
    window.__spot = spot; G.sheet.book.sk.learned.nv_a3 = 1; G.sheet.recalc(); G.sheet.book.equip('nv_a3', 0, false);
  }, ZOOM);
  const strips = [];
  for (const dir of DIRS) {
    const name = `${TAG}_${SCENE}_${dir}_${SIZE}_fx${FX ? 1 : 0}${ZONE ? '_' + ZONE : ''}`, dirOut = `${OUT}/${name}`; fs.rmSync(dirOut, { recursive: true, force: true }); fs.mkdirSync(dirOut, { recursive: true });
    await ev(([dir, scene]) => {
      const p = G.player, a = dir * Math.PI / 180, f = { x: Math.sin(a), z: Math.cos(a) };
      for (const m of [...G.zone.actors]) if (m !== p && m.def && m.body) m.remove && m.remove();
      G.skillFx.clear(); p.teleport(window.__spot); p.body.place(p.pos); p.setFacing(f.x, f.z); p.target = null; p.lockOn = null; p.path = [];
      p.skills2.cd = {}; G.dev.full();
      const at = d => ({ x: p.pos.x + f.x * d, z: p.pos.z + f.z * d });
      window.__ds = []; window.__f = f; window.__at = at;
      for (const d of scene === 'line' ? [3.5, 5, 6.5] : scene === 'far' ? [7.5] : [4.5]) { const m = G.dev.dummies('mon_boar', 1, 0.01, at(d))[0]; m.teleport(at(d)); m.thinkStep = () => {}; window.__ds.push(m); }
    }, [dir, SCENE]);
    await pg.waitForFunction(() => window.__ds.every(m => m.body), null, { timeout: 120000 });
    const info = await ev(([scene, fps]) => {
      let seed = 12345; Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      const p = G.player, f = window.__f, at = window.__at, ds = window.__ds;
      for (const m of ds) { m.teleport(m.pos); m.setFacing(-f.x, -f.z); m.body.place(m.pos); }
      for (let i = 0; i < 12; i++) G.step(1 / fps, false);
      p.teleport(window.__spot); p.setFacing(f.x, f.z); for (const m of ds) { m.knock = { x: 0, z: 0 }; m.__hp0 = m.hp; }
      G.render.setFocus({ x: p.pos.x + f.x * 2.6, y: 0, z: p.pos.z + f.z * 2.6 }, true);
      window.__hits = []; const S = G.skillFx.biyeon;
      if (S && !S.__wrapped) { S.__wrapped = true; const oh = S.hit.bind(S); S.hit = (pos, d, o) => { window.__hits.push({ t: window.__t, pos: { ...pos } }); return oh(pos, d, o); }; }
      window.__t = 0; p.target = ds[0];
      const e = p.skills2.cast('nv_a3', at(3)); if (e) return 'cast error: ' + e;
      if (scene === 'whiff') for (const m of ds) { m.dead = true; m.remove(); }
      return { ds: ds.length };
    }, [SCENE, FPS]);
    if (typeof info === 'string') { console.log(info); continue; }
    const frames = []; const total = Math.round(1.12 * FPS), want = new Set(MARKS.map(m => Math.round(m * FPS)));
    for (let i = 1; i <= total; i++) {
      const c = await ev(([i, fps]) => { window.__t = i / fps; G.step(1 / fps, true); const p = G.player, f = window.__f; const s = G.render.toScreen({ x: window.__spot.x + f.x * 2.6, y: p.pos.y + 0.9, z: window.__spot.z + f.z * 2.6 }); return [s.x, s.y]; }, [i, FPS]);
      if (process.env.MARKONLY && !want.has(i)) { frames[i] = null; continue; }
      const fn = `${dirOut}/${String(i).padStart(3, '0')}.png`;
      await pg.screenshot({ path: fn, clip: { x: Math.max(0, Math.min(VW - CW, Math.round(c[0] - CW / 2))), y: Math.max(0, Math.min(VH - CH, Math.round(c[1] - CH / 2))), width: CW, height: CH }, timeout: 300000 });
      frames[i] = fn;
    }
    const res = await ev(() => ({ hits: window.__hits.map(h => +h.t.toFixed(3)), damaged: window.__ds.map(m => +(m.__hp0 - m.hp).toFixed(1)) }));
    const pick = MARKS.map(m => frames[Math.round(m * FPS)] || '');
    fs.writeFileSync('/tmp/_bistrip.py', `from PIL import Image, ImageDraw\nfr=${JSON.stringify(pick)}\nlab=${JSON.stringify(MARKS)}\nims=[Image.open(f) if f else None for f in fr]\nw,h=next(i for i in ims if i).size\nims=[i or Image.new('RGB',(w,h),(0,0,0)) for i in ims]\nsc=0.5\nims=[i.resize((int(w*sc),int(h*sc))) for i in ims]\nw,h=ims[0].size\nn=5\nsh=Image.new('RGB',(w*n,(h+20)*((len(ims)+n-1)//n)),(20,20,28))\nd=ImageDraw.Draw(sh)\nfor i,(im,l) in enumerate(zip(ims,lab)):\n  x,y=(i%n)*w,(i//n)*(h+20); sh.paste(im,(x,y+20)); d.text((x+6,y+4),'t=%.2fs'%l,fill=(255,255,255))\nsh.save('${OUT}/${name}.png')`);
    try { execSync('python3 /tmp/_bistrip.py'); strips.push(`${OUT}/${name}.png`); } catch (e) { console.log('strip failed', e.message); }
    console.log(name, JSON.stringify(res));
  }
  console.log('strips', strips, 'errors', errs.slice(0, 6)); await b.close();
})();
