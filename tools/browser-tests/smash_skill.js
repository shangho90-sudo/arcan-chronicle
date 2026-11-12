// 약사 유봉강타 ph1_a1를 실제 스킬 경로(skills2.cast → ph_smash 동작 → 타격 → js/pharmfx.js swing/smash)로
// 시전하고, 피해가 들어간 프레임 기준 같은 시점의 화면을 가로 띠로 저장. G.step(1/FPS) 한 프레임씩, Math.random 고정.
// Usage: SCENE=hit|whiff|repeat|kill|sheathed GENDER=m|f SIZE=1100x760|390x844t FX=1|0 TAG=after DIR=90
//        URL=http://localhost:8795/index.html OUT=/tmp/smash node tools/browser-tests/smash_skill.js
//   -> OUT/<TAG>_<scene>_<gender>_<size>_fx<FX>.png   칸: 타격 -0.20 … +0.60 s
//   로그(JSON): 피해 프레임 시각 = 이펙트(smash) 호출 = 피해 숫자 = 타격음 호출이 같은지, 히트스톱 구간(시전자·대상 freezeT, 전역 hitStopT),
//   카메라 흔들림 최대 폭(m)·가라앉는 시간, 대상 위치 변화(밀림 없음), 빗나감일 때 타격음·히트스톱·흔들림 없음, 남은 이펙트 수, draw call
const { chromium } = require('playwright'); const fs = require('fs'); const { execSync } = require('child_process');
const SCENE = process.env.SCENE || 'hit', DIR = +(process.env.DIR || 90), FPS = +(process.env.FPS || 60), G_ = process.env.GENDER || 'm';
const SIZE = process.env.SIZE || '1100x760', TOUCH = SIZE.endsWith('t'), [VW, VH] = SIZE.replace('t', '').split('x').map(Number);
const FX = process.env.FX !== '0', TAG = process.env.TAG || 'after', OUT = process.env.OUT || '/tmp/smash', ZOOM = +(process.env.ZOOM || 1.5);
const CW = +(process.env.CW || Math.min(VW, 460)), CH = +(process.env.CH || Math.min(VH, 420));
const MARKS = (process.env.MARKS || '-0.20,-0.13,-0.08,-0.05,-0.017,0,0.017,0.05,0.083,0.13,0.20,0.30,0.45,0.60').split(',').map(Number);
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: VW, height: VH }, hasTouch: TOUCH, isMobile: TOUCH })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error' || /pharm/.test(m.text())) errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(process.env.URL || 'http://localhost:8795/index.html');
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(fx => { localStorage.clear(); localStorage.setItem('arcan_settings', JSON.stringify({ graphicsFx: fx })); }, FX);
  await pg.reload(); await click('새 게임'); await click('모험 시작');
  await pg.waitForSelector('.prologue.on', { timeout: 60000 }).then(() => click('건너뛰기')).catch(() => {});
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.player.body && G.player.body.md, null, { timeout: 300000 });
  await pg.waitForFunction(() => G.skillFx && G.skillFx.pharm, null, { timeout: 120000 });
  await ev(async ([z, g]) => {
    G.frame = () => {}; const c = G.render.cam; c.zoom = z; c.updateProjectionMatrix();
    document.querySelectorAll('.hud,.controls,.toasts,.qhud,.qh-reopen,.plates').forEach(e => e.style.display = 'none');
    if (G.reward) { G.reward.jobChange = sw => sw && sw(); G.reward.levelUp = () => {}; }   // no job-change / level-up light show over the test
    G.dev.level(20); G.sheet.p.gender = g; G.dev.job('pharmacist'); G.sheet.bag.add('w_pestle_1', 1); G.sheet.p.weapon = 'w_pestle_1'; G.dev.learnAll('pharmacist'); G.sheet.recalc(); G.dev.full(); G.input.block = true;
    await G.player.attachBody(); G.player.body.place(G.player.pos); G.player.body.play('idle', 1, true);
    G.skillFx.pharm.load();
    const p = G.player; let spot = null; const cx = p.pos.x, cz = p.pos.z;
    for (let r = 0; r <= 16 && !spot; r++) for (let k = 0; k < Math.max(1, r * 6) && !spot; k++) { const a = k / Math.max(1, r * 6) * 6.283, c = { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r }; let ok = true;
      for (let x = -5; x <= 5 && ok; x += 0.75) for (let z = -5; z <= 5 && ok; z += 0.75) if (x * x + z * z <= 25 && G.zone.geo.blocked(c.x + x, c.z + z, 0.35)) ok = false; if (ok) spot = c; }
    window.__spot = spot || { x: cx, z: cz };
  }, [ZOOM, G_]);
  await pg.waitForFunction(() => G.skillFx.pharm.ready && G.player.body && G.player.body.md, null, { timeout: 120000 });
  await pg.waitForTimeout(1500);
  const name = `${TAG}_${SCENE}_${G_}_${SIZE}_fx${FX ? 1 : 0}`, dirOut = `${OUT}/${name}`; fs.rmSync(dirOut, { recursive: true, force: true }); fs.mkdirSync(dirOut, { recursive: true });
  await ev(([dir]) => {
    const p = G.player, a = dir * Math.PI / 180, f = { x: Math.sin(a), z: Math.cos(a) };
    for (const m of [...G.zone.actors]) if (m !== p && m.def && m.body) m.remove && m.remove();
    G.skillFx.clear(); p.teleport(window.__spot); p.body.place(p.pos); p.setFacing(f.x, f.z); p.target = null; p.lockOn = null; p.path = []; G.dev.full();
    const at = d => ({ x: p.pos.x + f.x * d, z: p.pos.z + f.z * d });
    window.__f = f; window.__at = at;
    const m = G.dev.dummies('mon_boar', 1, 0.01, at(1.6))[0]; m.teleport(at(1.6)); m.thinkStep = () => {}; window.__ds = [m];
  }, [DIR]);
  await pg.waitForFunction(() => window.__ds.every(m => m.body), null, { timeout: 120000 });
  const info = await ev(([scene, fps]) => {
    let seed = 12345; Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const p = G.player, f = window.__f, m = window.__ds[0];
    m.teleport(m.pos); m.setFacing(-f.x, -f.z); m.body.place(m.pos);
    if (scene !== 'sheathed' && p.body.setArmed) { p.body.setArmed(true); p.calmT = 0; }
    if (scene === 'sheathed') p.resetArms && p.resetArms();
    for (let i = 0; i < 12; i++) G.step(1 / fps, false);
    p.teleport(window.__spot); p.setFacing(f.x, f.z); m.knock = { x: 0, z: 0 };
    G.render.setFocus({ x: p.pos.x + f.x * 1.0, y: 0, z: p.pos.z + f.z * 1.0 }, true);
    if (scene === 'kill') { m.hp = 5; }
    const L = window.__log = { fx: [], sfx: [], dmg: [], num: [], freezeP: [], freezeT: [], gstop: [], cam: [], lock: [], casts: [] };
    window.__t = 0; window.__p0 = { ...m.pos }; window.__hp = m.hp;
    const S = G.skillFx.pharm;
    for (const k of ['smash', 'swing']) if (S[k] && !S['__w' + k]) { S['__w' + k] = true; const o = S[k].bind(S); S[k] = (pc, opt) => { L.fx.push({ k, t: +window.__t.toFixed(3), whiff: !!(opt && opt.whiff) }); return o(pc, opt); }; }
    const os = G.audio.sfx.bind(G.audio); G.audio.sfx = (n) => { L.sfx.push({ n, t: +window.__t.toFixed(3) }); return os(n); };
    const od = G.ui.damageText.bind(G.ui); G.ui.damageText = (...a) => { L.num.push({ t: +window.__t.toFixed(3), v: a[1], kind: a[2] }); return od(...a); };
    p.target = m; window.__sp0 = p.sp;
    if (scene === 'sheathed') { p.combat(1.6); p.pendSkill = { id: 'ph1_a1', t: 0.8 }; G.input.block = false; L.casts.push({ t: 0, e: 'pendSkill' }); }
    else { const e = p.skills2.cast('ph1_a1', window.__at(1.6)); if (e) return 'cast error: ' + e; L.casts.push({ t: 0, e: null }); }
    if (scene === 'whiff') { m.dead = true; m.remove(); }
    window.__chain = scene === 'repeat' ? 1 : 0; window.__dbg = true;
    const c = G.render.cam.position; window.__c0 = null;
    return { hp: window.__hp, sp: window.__sp0 };
  }, [SCENE, FPS]);
  if (typeof info === 'string') { console.log(info); await b.close(); return; }
  const frames = [], total = Math.round((SCENE === 'repeat' ? 1.8 : SCENE === 'sheathed' ? 1.5 : 1.05) * FPS); let dc = null;
  for (let i = 0; i < total; i++) {
    const H0 = Math.round(0.25 * FPS), shot = !process.env.MARKONLY || MARKS.some(m => i === H0 + Math.round(m * FPS));
    const c = await ev(([i, fps]) => {
      window.__t = i / fps; const p = G.player, f = window.__f, m = window.__ds[0], L = window.__log;
      if (window.__chain === 1 && (p.skills.lock || 0) <= 0 && window.__t > 0.4) { window.__chain = 2; p.skills2.cd = {}; G.dev.full(); p.target = m; const e = p.skills2.cast('ph1_a1', { x: m.pos.x, z: m.pos.z }); L.casts.push({ t: +window.__t.toFixed(3), e }); }
      G.step(1 / fps, true);
      if (window.__dbg && i === 14) { const e = G.skillFx.pharm.live.find(e => e.kind === 'swing'); L.dbg = e ? e.items.filter(m => /trail|ghost/.test(m.userData.kind)).map(m => ({ k: m.userData.kind, v: !!m.visible, s: m.scale.toArray().map(x => +x.toFixed(2)), p: m.position.toArray().map(x => +x.toFixed(2)), u: Object.fromEntries(Object.entries(m.material.uniforms).filter(([k, v]) => typeof v.value === 'number').map(([k, v]) => [k, +v.value.toFixed(3)])) })) : 'no swing'; }
      if (m && !m.removed && m.hp < window.__hp) { L.dmg.push({ t: +window.__t.toFixed(3), a: Math.round(window.__hp - m.hp), dead: !!m.dead }); window.__hp = m.hp; }
      if ((p.freezeT || 0) > 0) L.freezeP.push(+window.__t.toFixed(3)); if (m && m.freezeT > 0) L.freezeT.push(+window.__t.toFixed(3)); if (G.hitStopT > 0) L.gstop.push(+window.__t.toFixed(3));
      L.lock.push(+(p.skills.lock || 0).toFixed(3));
      const cp = G.render.cam.position, fu = G.render.focusU, rel = { x: cp.x - fu.x, y: cp.y - fu.y, z: cp.z + fu.z }; if (!window.__c0) window.__c0 = rel;   // camera relative to its (smoothed) focus: constant unless shaken
      L.cam.push(+Math.hypot(rel.x - window.__c0.x, rel.y - window.__c0.y, rel.z - window.__c0.z).toFixed(4));
      const s = G.render.toScreen({ x: p.pos.x + f.x * 1.0, y: p.pos.y + 1.0, z: p.pos.z + f.z * 1.0 });
      return [s.x, s.y, G.render.r ? G.render.r.info.render.calls : -1];
    }, [i, FPS]);
    const fn = `${dirOut}/${String(i).padStart(3, '0')}.png`;
    if (shot) await pg.screenshot({ path: fn, clip: { x: Math.max(0, Math.min(VW - CW, Math.round(c[0] - CW / 2))), y: Math.max(0, Math.min(VH - CH, Math.round(c[1] - CH / 2))), width: CW, height: CH }, timeout: 300000 });
    frames.push(shot ? fn : null); dc = Math.max(dc || 0, c[2]);
  }
  const res = await ev(() => { const L = window.__log, m = window.__ds[0], p = G.player; const rng = a => a.length ? [a[0], a[a.length - 1], a.length] : null;
    const lockEnd = L.lock.findIndex((v, i) => i > 3 && v <= 0);
    const camMax = Math.max(...L.cam), first = L.cam.findIndex(v => v > 0.002), last = L.cam.length - 1 - [...L.cam].reverse().findIndex(v => v > 0.002);
    return { fx: L.fx, sfx: L.sfx, dmg: L.dmg, num: L.num, freezePlayer: rng(L.freezeP), freezeTarget: rng(L.freezeT), globalHitStop: rng(L.gstop), casts: L.casts,
      lockEndFrame: lockEnd, camMax: +camMax.toFixed(4), camFirstFrame: first, camLastFrame: camMax > 0.002 ? last : -1,
      targetMoved: m && !m.removed ? +Math.hypot(m.pos.x - window.__p0.x, m.pos.z - window.__p0.z).toFixed(3) : null, spUsed: +(window.__sp0 - p.sp).toFixed(1), cdLen: p.skills2.cdLen && p.skills2.cdLen.ph1_a1, dbg: L.dbg, camSeries: L.cam.slice(13, 26),
      live: G.skillFx.pharm.live.length, armed: p.body.armed }; });
  res.drawCallsMax = dc; res.fps = FPS;
  const hitFrame = res.dmg.length ? Math.round(res.dmg[0].t * FPS) : (res.fx.find(x => x.k === 'smash') ? Math.round(res.fx.find(x => x.k === 'smash').t * FPS) : Math.round(0.25 * FPS));
  const pick = MARKS.map(m => { const i = hitFrame + Math.round(m * FPS); return i >= 0 && i < frames.length ? frames[i] : null; });
  fs.writeFileSync('/tmp/_smashstrip.py', `from PIL import Image, ImageDraw\nfr=${JSON.stringify(pick.map(f => f || ''))}\nlab=${JSON.stringify(MARKS)}\nims=[Image.open(f) if f else None for f in fr]\nw,h=next(i for i in ims if i).size\nims=[i or Image.new('RGB',(w,h),(0,0,0)) for i in ims]\nn=len(ims); cols=(n+1)//2 if n>8 else n; rows=(n+cols-1)//cols\nsh=Image.new('RGB',(w*cols,(h+22)*rows),(20,20,28))\nd=ImageDraw.Draw(sh)\nfor i,(im,l) in enumerate(zip(ims,lab)):\n  x=(i%cols)*w; y=(i//cols)*(h+22)\n  sh.paste(im,(x,y+22)); d.text((x+6,y+4),('hit %+.3fs'%l),fill=(255,255,255))\nsh.save('${OUT}/${name}.png')`);
  try { execSync('python3 /tmp/_smashstrip.py'); } catch (e) { console.log('strip failed', e.message); }
  console.log(name, JSON.stringify(res)); console.log('strip', `${OUT}/${name}.png`, 'errors', errs.slice(0, 6));
  fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify(res, null, 1));
  await b.close();
})();
