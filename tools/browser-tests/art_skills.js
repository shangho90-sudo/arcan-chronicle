// 예술가 1차 스킬(ar1_*)과 양손 붓 기본공격(ar_combo_1..5)을 실제 경로(skills2.cast / Player.basic → 동작 → 피해 → js/artfx.js)로
// 실행하고 화면 띠와 수치를 남김. G.step(1/FPS) 한 프레임씩, Math.random 고정(DET=1이면 상수 0.5 — 이펙트 난수와 무관하게 피해가 같아
// 예전 코드와 총 피해를 비교할 수 있음).
// Usage: SKILL=bullet|sweep|pool|mark|wave|stac|discord|march|inspire|improv|canvas|combo LV=1..5 SCENE=hit|whiff|kill|sheathed
//        GENDER=m|f SIZE=1100x760|390x844t FX=1|0 TAG=after DIR=90 DET=0|1 NOSHOT=1 DUR=초 MARKS=a,b,c
//        URL=http://localhost:8803/index.html OUT=/tmp/artist node tools/browser-tests/art_skills.js
//   -> OUT/<TAG>_<skill>_lv<LV>_<scene>_<gender>_<size>_fx<FX>.png (+ .json): 피해 틱, 총 피해, art 이펙트 호출 시각, 소리, 히트스톱(시전자·대상
//      freezeT, 전역 hitStopT), 카메라 흔들림, 남은 이펙트 수, 콘솔 오류
const { chromium } = require('playwright'); const fs = require('fs'); const { execSync } = require('child_process');
const SK = { bullet: 'ar1_a1', sweep: 'ar1_a2', pool: 'ar1_a3', mark: 'ar1_a4', wave: 'ar1_b1', stac: 'ar1_b2', discord: 'ar1_b3', march: 'ar1_b4', inspire: 'ar1_c1', improv: 'ar1_c2', canvas: 'ar1_c3', combo: null };
const SKILL = process.env.SKILL || 'bullet', ID = SK[SKILL], LV = +(process.env.LV || 1);
const SCENE = process.env.SCENE || 'hit', DIR = +(process.env.DIR || 90), FPS = +(process.env.FPS || 60), G_ = process.env.GENDER || 'm';
const SIZE = process.env.SIZE || '1100x760', TOUCH = SIZE.endsWith('t'), [VW, VH] = SIZE.replace('t', '').split('x').map(Number);
const FX = process.env.FX !== '0', TAG = process.env.TAG || 'after', OUT = process.env.OUT || '/tmp/artist', ZOOM = +(process.env.ZOOM || 1.3), DET = process.env.DET === '1';
const CFG = {   // dist = 몬스터까지 m, n = 몬스터 수(둘레 r m), dur = 초, marks = 띠 시각
  bullet: [5, 1, 0, 1.0, '0.10,0.17,0.22,0.27,0.32,0.38,0.45,0.55,0.70,0.90'],
  sweep: [1.7, 2, 0.8, 1.0, '0.12,0.19,0.22,0.25,0.27,0.30,0.35,0.42,0.55,0.75'],
  pool: [4, 2, 0.9, 3.6, '0.10,0.20,0.30,0.38,0.45,0.60,0.90,1.35,2.3,3.4'],
  mark: [4, 1, 0, 2.2, '0.20,0.30,0.38,0.46,0.60,0.90,1.20,1.30,1.40,1.55,1.80,2.10'],
  wave: [3, 3, 0.9, 1.0, '0.20,0.30,0.34,0.38,0.43,0.48,0.55,0.65,0.80,0.95'],
  stac: [5, 1, 0, 1.2, '0.12,0.17,0.24,0.27,0.37,0.45,0.52,0.60,0.75,1.0'],
  discord: [1.6, 3, 0.8, 1.0, '0.20,0.28,0.30,0.33,0.37,0.42,0.50,0.60,0.75,0.95'],
  march: [0.4, 0, 0, 3.0, '0.20,0.30,0.40,0.55,0.75,1.0,1.4,1.8,2.4,2.9'],
  inspire: [0.4, 0, 0, 3.0, '0.20,0.35,0.50,0.80,1.10,1.40,1.80,2.20,2.40,2.80'],
  improv: [0.4, 0, 0, 2.2, '0.20,0.30,0.40,0.55,0.70,0.90,1.10,1.40,1.80,2.10'],
  canvas: [5, 1, 0, 2.6, '0.20,0.30,0.34,0.40,0.50,0.65,0.85,1.10,1.50,2.0,2.5'],
  combo: [1.7, 1, 0, 2.6, '0.15,0.20,0.40,0.55,0.62,0.80,0.95,1.05,1.25,1.45,1.60,1.75'],
}[SKILL];
const [DIST, NMON, RING] = CFG, DUR = +(process.env.DUR || CFG[3]) + (SCENE === 'sheathed' ? 0.4 : 0);
const MARKS = (process.env.MARKS || CFG[4]).split(',').map(Number).map(m => m + (SCENE === 'sheathed' && !process.env.MARKS ? 0.25 : 0));
const CW = +(process.env.CW || Math.min(VW, ['bullet', 'stac', 'wave', 'pool', 'mark', 'canvas'].includes(SKILL) ? 640 : 480)), CH = +(process.env.CH || Math.min(VH, 460));
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: VW, height: VH }, hasTouch: TOUCH, isMobile: TOUCH })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error' || /artfx|fx art/.test(m.text())) errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a);
  if (process.env.VERBOSE) { pg.on('console', m => console.log('console', m.type(), m.text().slice(0, 200))); pg.on('crash', () => console.log('CRASH')); }
  await pg.goto(process.env.URL || 'http://localhost:8803/index.html');
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(fx => { localStorage.clear(); localStorage.setItem('arcan_settings', JSON.stringify({ graphicsFx: fx })); }, FX);
  await pg.reload(); await click('새 게임'); await click('모험 시작');
  await pg.waitForSelector('.prologue.on', { timeout: 60000 }).then(() => click('건너뛰기')).catch(() => {});
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.player.body && G.player.body.md, null, { timeout: 300000 });
  await ev(async ([z, g, id, lv]) => {
    G.frame = () => {}; const c = G.render.cam; c.zoom = z; c.updateProjectionMatrix();
    document.querySelectorAll('.hud,.controls,.toasts,.qhud,.qh-reopen,.plates').forEach(e => e.style.display = 'none');
    if (G.reward) { G.reward.jobChange = sw => sw && sw(); G.reward.levelUp = () => {}; }
    G.dev.level(20); G.sheet.p.gender = g; G.dev.job('artist');
    const w = Object.keys(G.data.items || {}).find(k => /brush/.test(k)) || 'w_brush_1'; try { G.sheet.bag.add(w, 1); G.sheet.p.weapon = w; } catch (e) { }
    const bk = G.sheet.book; bk.sk.points += 99; const ids = id ? [id] : []; if (id === 'ar1_a4') ids.push('ar1_a1');
    for (const x of ids) for (let i = 0; i < lv; i++) if (!bk.learnBlock(x)) bk.learn(x);
    G.sheet.recalc(); G.dev.full(); G.input.block = true;
    await G.player.attachBody(); G.player.body.place(G.player.pos); G.player.body.play('idle', 1, true);
    if (G.skillFx.art) G.skillFx.art.load();
    const p = G.player; let spot = null; const cx = p.pos.x, cz = p.pos.z;
    for (let r = 0; r <= 16 && !spot; r++) for (let k = 0; k < Math.max(1, r * 6) && !spot; k++) { const a = k / Math.max(1, r * 6) * 6.283, c = { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r }; let ok = true;
      for (let x = -8; x <= 8 && ok; x += 0.75) for (let z = -8; z <= 8 && ok; z += 0.75) if (x * x + z * z <= 64 && G.zone.geo.blocked(c.x + x, c.z + z, 0.35)) ok = false; if (ok) spot = c; }
    window.__spot = spot || { x: cx, z: cz }; window.__weapon = G.sheet.p.weapon;
  }, [ZOOM, G_, ID, LV]);
  await pg.waitForFunction(() => (!G.skillFx.art || G.skillFx.art.ready) && G.player.body && G.player.body.md, null, { timeout: 120000 });
  await pg.waitForTimeout(1500);
  const name = `${TAG}_${SKILL}_lv${LV}_${SCENE}_${G_}_${SIZE}_fx${FX ? 1 : 0}${DET ? '_det' : ''}`, dirOut = `${OUT}/${name}`; fs.rmSync(dirOut, { recursive: true, force: true }); fs.mkdirSync(dirOut, { recursive: true });
  await ev(([dir, dist, n, ring]) => {
    const p = G.player, a = dir * Math.PI / 180, f = { x: Math.sin(a), z: Math.cos(a) };
    for (const m of [...G.zone.actors]) if (m !== p && m.def && m.body) m.remove && m.remove();
    G.skillFx.clear(); p.teleport(window.__spot); p.body.place(p.pos); p.setFacing(f.x, f.z); p.target = null; p.lockOn = null; p.path = []; G.dev.full();
    const at = d => ({ x: p.pos.x + f.x * d, z: p.pos.z + f.z * d });
    window.__f = f; window.__at = at;
    const ds = []; if (n) { const c = at(dist); for (let i = 0; i < n; i++) { const an = i / n * 6.283 + 0.6, q = i === 0 && n > 1 ? c : { x: c.x + Math.cos(an) * ring, z: c.z + Math.sin(an) * ring }; const m = G.dev.dummies('mon_boar', 1, 0.01, q)[0]; m.teleport(q); ds.push(m); } }
    window.__ds = ds;
  }, [DIR, DIST, NMON, RING]);
  await pg.waitForFunction(() => window.__ds.every(m => m.body), null, { timeout: 120000 });
  const info = await ev(([scene, fps, id, dist, sd, det, skill]) => {
    let seed = +sd || 12345; Math.random = det ? () => 0.5 : () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const p = G.player, f = window.__f, ds = window.__ds;
    for (const m of ds) { m.thinkStep = () => {}; m.setFacing(-f.x, -f.z); m.body.place(m.pos); }
    if (scene !== 'sheathed' && p.body.setArmed) { p.body.setArmed(true); p.calmT = 0; }
    for (let i = 0; i < 12; i++) G.step(1 / fps, false);
    p.teleport(window.__spot); p.setFacing(f.x, f.z); ds.forEach((m, i) => { m.knock = { x: 0, z: 0 }; });
    G.render.setFocus({ x: p.pos.x + f.x * dist * 0.5, y: 0, z: p.pos.z + f.z * dist * 0.5 }, true);
    const L = window.__log = { fx: [], sfx: [], dmg: [], freezeP: [], freezeT: [], gstop: [], cam: [], lock: [], act: [] };
    window.__t = 0; window.__hp = ds.map(m => m.hp); window.__p0 = ds.map(m => ({ ...m.pos }));
    const S = G.skillFx.art;
    if (S) for (const k of ['stroke', 'splash', 'proj', 'projHit', 'sweep', 'pool', 'mark', 'wave', 'discord', 'march', 'inspire', 'improv', 'canvas', 'critter']) if (!S['__w' + k]) { S['__w' + k] = true; const o = S[k].bind(S); S[k] = (a, opt) => { L.fx.push({ k, t: +window.__t.toFixed(3) }); return o(a, opt); }; }
    const os = G.audio.sfx.bind(G.audio); G.audio.sfx = (n) => { L.sfx.push({ n, t: +window.__t.toFixed(3) }); return os(n); };
    if (ds[0]) p.target = ds[0]; window.__sp0 = p.sp;
    if (scene === 'kill') ds.forEach(m => m.hp = Math.max(2, Math.round(p.stat('matk') * 0.4)));
    window.__hp = ds.map(m => m.hp);
    if (skill === 'combo') { window.__combo = true; return { combo: true, atk: p.stat('atk'), matk: p.stat('matk') }; }
    const e = p.skills2.cast(id, skill === 'canvas' ? window.__at(2.4) : ds[0] ? { ...ds[0].pos } : window.__at(dist));   // 작은 걸작: the canvas between the painter and the enemy if (e) return 'cast error: ' + e;
    if (scene === 'whiff') for (const m of ds) { m.dead = true; m.remove(); }
    const d = G.data.skill ? G.data.skill(id) : null;
    return { lv: p.skills2.lvl(id), matk: p.stat('matk'), mp: d && d.mp, cd: d && d.cd };
  }, [SCENE, FPS, ID, DIST, +(process.env.SEED || 12345), DET, SKILL]);
  if (typeof info === 'string') { console.log(info); await b.close(); process.exit(1); }
  const frames = [], total = Math.round(DUR * FPS); let dc = 0;
  for (let i = 0; i < total; i++) {
    const shot = !process.env.NOSHOT && MARKS.some(m => i === Math.round(m * FPS));
    const c = await ev(([i, fps, dist, skill, scene]) => {
      window.__t = i / fps; const p = G.player, f = window.__f, ds = window.__ds, L = window.__log;
      if (window.__combo && window.__t < 1.9) p.basic(G.input);     // button held: the 5 strikes chain through atkBuf
      if (skill === 'mark' && i === Math.round(1.2 * fps)) p.skills2.cast('ar1_a1', ds[0] && !ds[0].dead ? { ...ds[0].pos } : window.__at(dist));   // the next paint attack pops the mark
      G.step(1 / fps, true);
      ds.forEach((m, k) => { if (!m.removed && m.hp < window.__hp[k]) { L.dmg.push({ t: +window.__t.toFixed(3), m: k, a: Math.round(window.__hp[k] - m.hp), dead: !!m.dead }); window.__hp[k] = m.hp; } if (m.freezeT > 0 && k === 0) L.freezeT.push(+window.__t.toFixed(3)); });
      if ((p.freezeT || 0) > 0) L.freezeP.push(+window.__t.toFixed(3)); if (G.hitStopT > 0) L.gstop.push(+window.__t.toFixed(3));
      if (i % 6 === 0) L.act.push([+window.__t.toFixed(2), p.body.action, +(p.body.t || 0).toFixed(2)]);
      L.lock.push(+(p.skills.lock || 0).toFixed(3));
      const cp = G.render.cam.position, fu = G.render.focusU, rel = { x: cp.x - fu.x, y: cp.y - fu.y, z: cp.z + fu.z }; if (!window.__c0) window.__c0 = rel;
      L.cam.push(+Math.hypot(rel.x - window.__c0.x, rel.y - window.__c0.y, rel.z - window.__c0.z).toFixed(4));
      const s = G.render.toScreen({ x: p.pos.x + f.x * dist * 0.5, y: p.pos.y + 1.0, z: p.pos.z + f.z * dist * 0.5 });
      return [s.x, s.y, G.render.r ? G.render.r.info.render.calls : -1];
    }, [i, FPS, DIST, SKILL, SCENE]);
    if (process.env.VERBOSE && i % 10 === 0) console.log('frame', i, JSON.stringify(await ev(() => [performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : -1, G.skillFx.art ? G.skillFx.art.live.length : -1, G.player.body.action])));
    const fn = `${dirOut}/${String(i).padStart(3, '0')}.png`;
    if (shot) await pg.screenshot({ path: fn, clip: { x: Math.max(0, Math.min(VW - CW, Math.round(c[0] - CW / 2))), y: Math.max(0, Math.min(VH - CH, Math.round(c[1] - CH / 2))), width: CW, height: CH }, timeout: 300000 });
    frames.push(shot ? fn : null); dc = Math.max(dc, c[2]);
  }
  const res = await ev(([id]) => { const L = window.__log, p = G.player; const rng = a => a.length ? [a[0], a[a.length - 1], a.length] : null;
    const camMax = Math.max(...L.cam);
    return { fx: L.fx, sfx: L.sfx, dmg: L.dmg, hits: L.dmg.length, total: L.dmg.reduce((s, d) => s + d.a, 0), freezePlayer: rng(L.freezeP), freezeTarget: rng(L.freezeT), globalHitStop: rng(L.gstop),
      act: L.act, camMax: +camMax.toFixed(4), spUsed: +(window.__sp0 - p.sp).toFixed(1), cdLen: id && p.skills2.cdLen && p.skills2.cdLen[id], weapon: window.__weapon,
      live: G.skillFx.art ? G.skillFx.art.live.length : -1, things: p.skills2.things.length, areas: p.skills2.areas.length, summons: p.skills2.summons.length }; }, [ID]);
  res.info = info; res.drawCallsMax = dc; res.errors = errs.slice(0, 8);
  if (!process.env.NOSHOT) {
    const pick = MARKS.map(m => frames[Math.round(m * FPS)] || null);
    fs.writeFileSync('/tmp/artist/_strip.py', `from PIL import Image, ImageDraw\nfr=${JSON.stringify(pick.map(f => f || ''))}\nlab=${JSON.stringify(MARKS)}\nims=[Image.open(f) if f else None for f in fr]\nw,h=next(i for i in ims if i).size\nims=[i or Image.new('RGB',(w,h),(0,0,0)) for i in ims]\nn=len(ims); cols=(n+1)//2 if n>6 else n; rows=(n+cols-1)//cols\nsh=Image.new('RGB',(w*cols,(h+22)*rows),(20,20,28))\nd=ImageDraw.Draw(sh)\nfor i,(im,l) in enumerate(zip(ims,lab)):\n  x=(i%cols)*w; y=(i//cols)*(h+22)\n  sh.paste(im,(x,y+22)); d.text((x+6,y+4),('t %.3fs'%l),fill=(255,255,255))\nsh.save('${OUT}/${name}.png')`);
    try { execSync('python3 /tmp/artist/_strip.py'); } catch (e) { console.log('strip failed', e.message); }
    console.log('strip', `${OUT}/${name}.png`);
  }
  console.log(name, JSON.stringify({ ...res, act: undefined, fx: res.fx.map(x => x.k + '@' + x.t).join(' '), sfx: res.sfx.map(x => x.n + '@' + x.t).join(' ') }));
  fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify(res, null, 1));
  await b.close();
})();
