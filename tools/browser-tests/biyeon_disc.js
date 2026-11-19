// 비연참 nv_a3 원반 — 실제 스킬 경로(cast → nv_biyeon 던지기 → SkillProj → 피해)를 게임 카메라로 찍고 수치를 잼.
// 작은 몬스터(숲 토끼 mon_slime, 반지름 0.4)를 가까이(NEAR m)·최대 사거리(FAR m)에, 화면 위·아래·왼쪽·오른쪽으로.
// Usage: SIZE=390x844t|1280x720 DISTS=2.5,10 DIRS=up,down,left,right DET=1 FRAME=game|mid ZOOM=1 TAG=after URL=http://localhost:8871/index.html OUT=/tmp/biyeon2
//   FRAME=game  = 실제 게임처럼 카메라가 플레이어를 따라감(휴대폰 세로에서는 옆 10 m가 화면 밖일 수 있음)
//   FRAME=mid   = 카메라 초점을 플레이어와 대상 가운데로(비행 전체를 한 화면에)
//   DET=1       = Math.random 0.5 고정(전/후 피해 비교)
//   SHOTS=0     = 수치만
// -> OUT/<TAG>_<size>_<dir>_<dist>m_<frame>.png (가로 띠) + 콘솔/OUT/<TAG>_<size>.json: 누른 뒤 피해 시각·피해·소리·플레이어 이동 거리·원반 화면 크기
const { chromium } = require('playwright'); const fs = require('fs'); const { execSync } = require('child_process');
const SIZE = process.env.SIZE || '390x844t', TOUCH = SIZE.endsWith('t'), [VW, VH] = SIZE.replace('t', '').split('x').map(Number);
const DISTS = (process.env.DISTS || '2.5,10').split(',').map(Number), DIRS = (process.env.DIRS || 'up,down,left,right').split(',');
const TAG = process.env.TAG || 'after', OUT = process.env.OUT || '/tmp/biyeon2', FRAME = process.env.FRAME || 'game', FPS = 60, SHOTS = process.env.SHOTS !== '0';
const MON = process.env.MON || 'mon_slime', ZOOM = +(process.env.ZOOM || 1);
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: VW, height: VH }, hasTouch: TOUCH, isMobile: TOUCH })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error' || /biyeon/.test(m.text())) errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(process.env.URL || 'http://localhost:8871/index.html');
  const has = t => ev(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t);
  const click = async (...ts) => { await pg.waitForFunction(ts => [...document.querySelectorAll('button,[aria-label]')].some(b => ts.includes((b.getAttribute('aria-label') || b.textContent || '').trim())), ts, { timeout: 300000 });
    await ev(ts => [...document.querySelectorAll('button,[aria-label]')].find(b => ts.includes((b.getAttribute('aria-label') || b.textContent || '').trim())).click(), ts); await pg.waitForTimeout(400); };
  void has;
  await ev(() => { localStorage.clear(); }); await pg.reload(); await click('게임 시작 (새 게임)', '새 게임'); await click('모험 시작');
  await pg.waitForSelector('.prologue.on', { timeout: 60000 }).then(() => click('건너뛰기')).catch(() => {});
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.player.body && G.player.body.md, null, { timeout: 300000 });
  await pg.waitForFunction(() => G.skillFx && (!G.skillFx.biyeon || G.skillFx.biyeon.ready), null, { timeout: 120000 });
  await pg.waitForTimeout(1500);
  await ev(([z, frame]) => {
    G.frame = () => {}; const c = G.render.cam; if (z !== 1) { c.zoom = z; c.updateProjectionMatrix(); }
    document.querySelectorAll('.controls,.toasts,.layer,.qhud,.qh-reopen').forEach(e => e.style.display = 'none');
    window.__frame = frame; const p = G.player; G.dev.level(12); G.dev.full(); G.input.block = true;
    const sf = G.render.setFocus.bind(G.render); G.render.setFocus = (u, snap, dt, sh) => sf(frame === 'mid' && window.__focus ? window.__focus : u, frame === 'mid' && window.__focus ? true : snap, dt, sh);
    let spot = null; const sp0 = (G.zone.def.spawns || []).find(q => q.id === 'start') || { pos: [p.pos.x, p.pos.z] }, cx = sp0.pos[0], cz = sp0.pos[1];
    const cand = []; for (let r = 0; r <= 26; r += 1) for (let k = 0; k < Math.max(1, r * 6); k++) { const a = k / Math.max(1, r * 6) * Math.PI * 2; cand.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r }); }
    for (const R of [11, 10, 9]) { for (const c of cand) { let ok = true; for (let a = -R; a <= R && ok; a += 0.75) for (let o = -R; o <= R && ok; o += 0.75) if (a * a + o * o <= R * R && G.zone.geo.blocked(c.x + a, c.z + o, 0.35)) ok = false; if (ok) { spot = c; break; } } if (spot) break; }
    if (!spot) spot = { x: p.pos.x, z: p.pos.z };
    window.__spot = spot; G.sheet.book.sk.learned.nv_a3 = 1; G.sheet.recalc(); G.sheet.book.equip('nv_a3', 0, false);
    // screen direction -> game direction (camera yaw): probe two points
    p.teleport(spot); const s0 = G.render.toScreen({ x: spot.x, y: 0, z: spot.z }), sx = G.render.toScreen({ x: spot.x + 1, y: 0, z: spot.z }), sz = G.render.toScreen({ x: spot.x, y: 0, z: spot.z + 1 });
    window.__scr = { ex: [sx.x - s0.x, sx.y - s0.y], ez: [sz.x - s0.x, sz.y - s0.y] };
  }, [ZOOM, FRAME]);
  const want = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const all = [];
  for (const dist of DISTS) for (const dn of DIRS) {
    const name = `${TAG}_${SIZE}_${dn}_${dist}m_${FRAME}`, dirOut = `${OUT}/${name}`; fs.rmSync(dirOut, { recursive: true, force: true }); if (SHOTS) fs.mkdirSync(dirOut, { recursive: true });
    await ev(([w, dist, mon]) => {
      const S = window.__scr, det = S.ex[0] * S.ez[1] - S.ex[1] * S.ez[0];   // solve screen w = a*ex + b*ez
      const a = (w[0] * S.ez[1] - w[1] * S.ez[0]) / det, bb = (S.ex[0] * w[1] - S.ex[1] * w[0]) / det, m = Math.hypot(a, bb), f = { x: a / m, z: bb / m };
      const p = G.player;
      for (const mm of [...G.zone.actors]) if (mm !== p && mm.def && mm.body) mm.remove && mm.remove();
      G.skillFx.clear(); p.teleport(window.__spot); p.body.place(p.pos); p.setFacing(f.x, f.z); p.target = null; p.lockOn = null; p.path = [];
      p.skills2.cd = {}; G.dev.full();
      const at = d => ({ x: p.pos.x + f.x * d, z: p.pos.z + f.z * d });
      window.__f = f; window.__at = at; window.__ds = G.dev.dummies(mon, 1, 0.01, at(dist)); window.__ds[0].teleport(at(dist)); window.__ds[0].thinkStep = () => {};
    }, [want[dn], dist, MON]);
    await pg.waitForFunction(() => window.__ds.every(m => m.body), null, { timeout: 120000 });
    const info = await ev(([dist, det]) => {
      let seed = 12345; Math.random = det ? () => 0.5 : () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      const p = G.player, f = window.__f, ds = window.__ds, m = ds[0];
      m.teleport(m.pos); m.setFacing(-f.x, -f.z); m.body.place(m.pos);
      for (let i = 0; i < 12; i++) G.step(1 / 60, false);
      p.teleport(window.__spot); p.setFacing(f.x, f.z); m.knock = { x: 0, z: 0 }; m.__hp0 = m.hp; m.teleport(window.__at(dist));
      window.__focus = { x: (p.pos.x + m.pos.x) / 2, y: 0, z: (p.pos.z + m.pos.z) / 2 };
      G.render.setFocus(window.__frame === 'mid' ? window.__focus : p.pos, true);
      window.__log = { dmg: [], sfx: [], fx: [] }; window.__t = 0;
      if (!m.__wrapped) { m.__wrapped = true; const td = m.takeDamage.bind(m); m.takeDamage = d => { const h0 = m.hp; td(d); window.__log.dmg.push({ t: +window.__t.toFixed(4), amt: +(h0 - m.hp).toFixed(2), crit: !!d.crit, missed: !!d.missed }); }; }
      if (!G.audio.__wrapped) { G.audio.__wrapped = true; const s = G.audio.sfx.bind(G.audio); G.audio.sfx = (n, o) => { window.__log.sfx.push({ t: +window.__t.toFixed(4), n }); return s(n, o); }; }
      const B = G.skillFx.biyeon; if (B && !B.__wrapped) { B.__wrapped = true; for (const k of ['cast', 'proj', 'hit']) if (B[k]) { const o = B[k].bind(B); B[k] = (...a) => { window.__log.fx.push({ t: +window.__t.toFixed(4), k }); return o(...a); }; } }
      window.__p0 = { ...p.pos }; window.__hs0 = G.hitStopT || 0; window.__hsN = 0; const ohs = G.hitStop.bind(G); if (!G.__hsw) { G.__hsw = true; G.hitStop = (...a) => { window.__hsN++; return ohs(...a); }; }
      p.target = m; const e = p.skills2.cast('nv_a3', window.__at(3)); if (e) return 'cast error: ' + e;
      return { dist: +Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z).toFixed(2) };
    }, [dist, !!process.env.DET]);
    if (typeof info === 'string') { console.log(name, info); all.push({ name, error: info }); continue; }
    const frames = []; let hitF = -1; const total = Math.round(1.25 * FPS); let discPx = [];
    for (let i = 1; i <= total; i++) {
      const r = await ev(([i]) => { window.__t = i / 60; G.step(1 / 60, true);
        let px = null; const B = G.skillFx.biyeon; if (B && B.discPx) px = B.discPx();
        return { n: window.__log.dmg.length, px }; }, [i]);
      if (r.px) discPx.push([i, r.px]);
      if (r.n && hitF < 0) hitF = i;
      if (SHOTS) { const fn = `${dirOut}/${String(i).padStart(3, '0')}.png`; await pg.screenshot({ path: fn, timeout: 300000 }); frames[i] = fn; }
      if (hitF > 0 && i > hitF + 22) break;
    }
    const res = await ev(() => ({ dmg: window.__log.dmg, sfx: window.__log.sfx, fx: window.__log.fx, moved: +Math.hypot(G.player.pos.x - window.__p0.x, G.player.pos.z - window.__p0.z).toFixed(2), globalHitStop: window.__hsN }));
    const out = { name, ...info, hitT: hitF > 0 ? +(hitF / 60).toFixed(3) : null, ...res, discPx: discPx.filter((_, k) => k % 3 === 0).slice(0, 12) };
    all.push(out); console.log(JSON.stringify(out));
    if (SHOTS && hitF > 0) {
      // strip: press+0.05, release-ish, 3 flight frames, hit-1, hit, hit+3, hit+8, hit+16
      const rel = Math.max(2, (res.fx.find(x => x.k === 'proj') || { t: 0.2 }).t * 60 | 0);
      const pick = [3, Math.max(2, rel - 4), rel, Math.round(rel + (hitF - rel) * 0.33), Math.round(rel + (hitF - rel) * 0.66), hitF - 1, hitF, hitF + 3, hitF + 8, hitF + 16].map(k => Math.max(1, Math.min(frames.length - 1, k)));
      const lab = pick.map(k => (k === hitF ? 'HIT ' : '') + 't=' + (k / 60).toFixed(3));
      const cx = VW / 2, cy = VH / 2, cw = VW, ch = VH;
      fs.writeFileSync('/tmp/_bdstrip.py', `from PIL import Image, ImageDraw\nfr=${JSON.stringify(pick.map(k => frames[k]))}\nlab=${JSON.stringify(lab)}\nims=[Image.open(f).convert('RGB') for f in fr]\nW,H=ims[0].size\nbox=(max(0,${cx}-${cw}//2),max(0,${cy}-${ch}//2),min(W,${cx}+${cw}//2),min(H,${cy}+${ch}//2))\nims=[i.crop(box) for i in ims]\nsc=${VW > 800 ? 0.42 : 0.62}\nims=[i.resize((int(i.size[0]*sc),int(i.size[1]*sc))) for i in ims]\nw,h=ims[0].size\nn=5\nsh=Image.new('RGB',(w*n,(h+18)*2),(20,20,28))\nd=ImageDraw.Draw(sh)\nfor k,(im,l) in enumerate(zip(ims,lab)):\n  x,y=(k%n)*w,(k//n)*(h+18); sh.paste(im,(x,y+18)); d.text((x+6,y+3),l,fill=(255,230,120) if l.startswith('HIT') else (255,255,255))\nsh.save('${OUT}/${name}.png')`);
      try { execSync('python3 /tmp/_bdstrip.py'); } catch (e) { console.log('strip failed', e.message); }
      if (!process.env.KEEP) fs.rmSync(dirOut, { recursive: true, force: true });
    }
  }
  fs.writeFileSync(`${OUT}/${TAG}_${SIZE}_${FRAME}.json`, JSON.stringify(all, null, 1));
  console.log('errors', errs.slice(0, 8)); await b.close();
})();
