// 약사 스킬(유봉강타 ph1_a1 · 밀어내기 ph1_a4 · 던지는 약병 ph1_b1/b2/b4/b6)을 실제 스킬 경로로 시전하고, 기준 시각(첫 피해, 없으면 첫 타격 이펙트;
// 던지는 스킬은 약병이 손을 떠난 프레임) 앞뒤 화면을 띠로 저장 (smash_skill.js를 일반화, 2026-11-13). G.step(1/FPS) 한 프레임씩, Math.random 고정.
// Usage: SKILL=ph1_a1|ph1_a4|ph1_b1.. SCENE=hit|whiff|repeat|kill|sheathed|fan|wall GENDER=m|f SIZE=1100x760|390x844t FX=1|0 TAG=after DIR=90
//        URL=http://localhost:8798/index.html OUT=/tmp/pharm3 ZOOM=1.5 CW= CH= FOCUS=(앞쪽 m) MARKS=-0.2,.. SEC=(찍는 길이)
//        REF=0.333 (기준 시각을 알면 띠에 들어갈 프레임만 찍음) NOSHOT=1 (수치만)  node tools/browser-tests/pharm3_skills.js
//   -> OUT/<TAG>_<skill>_<scene>_<gender>_<size>_fx<FX>.png + .json
//   장면: hit = 앞 1.6 m 멧돼지 하나 / whiff = 대상 없음 / kill = 체력 5 / repeat = 연속 2회 / sheathed = 무기를 멘 채(키 입력 경로)
//         fan(ph1_a4) = 부채꼴 안 3마리 + 옆(부채꼴 밖) 1마리 + 뒤 1마리 / wall(ph1_a4) = 벽을 등진 몬스터
//         던지는 스킬은 hit·sheathed·kill·whiff 모두 5 m 앞 땅을 겨냥(멧돼지는 그 자리에)
//   로그: 이펙트(pharm.*) 호출 시각, 소리, 몬스터별 피해 시각·양·밀린 거리, 히트스톱(시전자·대상 freezeT, 전역 hitStopT), 카메라 흔들림,
//   행동 잠금이 풀린 프레임, 던진 약병이 생긴 시각·자리와 그때 오른손까지 거리(throw), 남은 이펙트 수, 콘솔 오류
const { chromium } = require('playwright'); const fs = require('fs'); const { execSync } = require('child_process');
const SKILL = process.env.SKILL || 'ph1_a1', SCENE = process.env.SCENE || 'hit', DIR = +(process.env.DIR || 90), FPS = +(process.env.FPS || 60), G_ = process.env.GENDER || 'm';
const SIZE = process.env.SIZE || '1100x760', TOUCH = SIZE.endsWith('t'), [VW, VH] = SIZE.replace('t', '').split('x').map(Number);
const FX = process.env.FX !== '0', TAG = process.env.TAG || 'after', OUT = process.env.OUT || '/tmp/pharm3', THROW = /^ph1_b/.test(SKILL), PUSH = SKILL === 'ph1_a4';
const ZOOM = +(process.env.ZOOM || (THROW ? 1.0 : PUSH ? 1.15 : 1.5)), FOCUS = +(process.env.FOCUS || (THROW ? 2.6 : PUSH ? 1.7 : 1.0));
const CW = +(process.env.CW || Math.min(VW, THROW ? 620 : PUSH ? 560 : 460)), CH = +(process.env.CH || Math.min(VH, THROW ? 440 : PUSH ? 460 : 420));
const MARKS = (process.env.MARKS || (THROW ? '-0.25,-0.17,-0.12,-0.083,-0.05,-0.033,-0.017,0,0.017,0.033,0.067,0.12,0.2,0.27,0.35,0.5' : '-0.30,-0.20,-0.13,-0.08,-0.05,-0.017,0,0.017,0.05,0.083,0.13,0.20,0.30,0.45,0.60,0.9')).split(',').map(Number);
const SEC = +(process.env.SEC || (SCENE === 'repeat' ? 2.2 : SCENE === 'sheathed' ? 1.9 : THROW ? 1.8 : 1.5));
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: VW, height: VH }, hasTouch: TOUCH, isMobile: TOUCH })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error' || /pharm|skill op/.test(m.text())) errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(process.env.URL || 'http://localhost:8798/index.html');
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(fx => { localStorage.clear(); localStorage.setItem('arcan_settings', JSON.stringify({ graphicsFx: fx })); }, FX);
  await pg.reload(); await click('새 게임'); await click('모험 시작');
  await pg.waitForSelector('.prologue.on', { timeout: 60000 }).then(() => click('건너뛰기')).catch(() => {});
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.player.body && G.player.body.md, null, { timeout: 300000 });
  await pg.waitForFunction(() => G.skillFx && G.skillFx.pharm, null, { timeout: 120000 });
  await ev(async ([z, g, wall]) => {
    G.frame = () => {}; const c = G.render.cam; c.zoom = z; c.updateProjectionMatrix();
    document.querySelectorAll('.hud,.controls,.toasts,.qhud,.qh-reopen,.plates').forEach(e => e.style.display = 'none');
    if (G.reward) { G.reward.jobChange = sw => sw && sw(); G.reward.levelUp = () => {}; }
    G.dev.level(20); G.sheet.p.gender = g; G.dev.job('pharmacist'); G.sheet.bag.add('w_pestle_1', 1); G.sheet.p.weapon = 'w_pestle_1'; G.dev.learnAll('pharmacist'); G.sheet.recalc(); G.dev.full(); G.input.block = true;
    await G.player.attachBody(); G.player.body.place(G.player.pos); G.player.body.play('idle', 1, true);
    G.skillFx.pharm.load();
    const p = G.player; let spot = null, wdir = null; const cx = p.pos.x, cz = p.pos.z, free = (c, R) => { for (let x = -R; x <= R; x += 0.75) for (let z = -R; z <= R; z += 0.75) if (x * x + z * z <= R * R && G.zone.geo.blocked(c.x + x, c.z + z, 0.35)) return false; return true; };
    if (wall) {   // a spot with 2 m of free ground whose way forward is blocked ~2.4 m ahead (a house wall / the town wall)
      for (let r = 2; r <= 40 && !spot; r += 1) for (let k = 0; k < r * 6 && !spot; k++) { const a = k / (r * 6) * 6.283, c = { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r }; if (!free(c, 1.6)) continue;
        for (let d = 0; d < 8 && !spot; d++) { const b = d / 8 * 6.283, f = { x: Math.sin(b), z: Math.cos(b) }; let ok = !G.zone.geo.blocked(c.x + f.x * 1.6, c.z + f.z * 1.6, 0.6);
          for (const q of [2.6, 3.0, 3.4]) for (const s of [-0.8, 0, 0.8]) if (!G.zone.geo.blocked(c.x + f.x * q - f.z * s, c.z + f.z * q + f.x * s, 0.3)) ok = false;
          if (ok) { spot = c; wdir = b * 180 / Math.PI; } } }
    }
    for (let r = 0; r <= 16 && !spot; r++) for (let k = 0; k < Math.max(1, r * 6) && !spot; k++) { const a = k / Math.max(1, r * 6) * 6.283, c = { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r }; if (free(c, 7)) spot = c; }
    window.__spot = spot || { x: cx, z: cz }; window.__wdir = wdir;
  }, [ZOOM, G_, SCENE === 'wall']);
  await pg.waitForFunction(() => G.skillFx.pharm.ready && G.player.body && G.player.body.md, null, { timeout: 120000 });
  await pg.waitForTimeout(1500);
  const name = `${TAG}_${SKILL}_${SCENE}_${G_}_${SIZE}_fx${FX ? 1 : 0}`, dirOut = `${OUT}/${name}`; fs.rmSync(dirOut, { recursive: true, force: true }); fs.mkdirSync(dirOut, { recursive: true });
  await ev(([dir, scene, thr, push]) => {
    const p = G.player, a = (window.__wdir ?? dir) * Math.PI / 180, f = { x: Math.sin(a), z: Math.cos(a) };
    for (const m of [...G.zone.actors]) if (m !== p && m.def && m.body) m.remove && m.remove();
    G.skillFx.clear(); p.teleport(window.__spot); p.body.place(p.pos); p.setFacing(f.x, f.z); p.target = null; p.lockOn = null; p.path = []; G.dev.full();
    const at = (d, s = 0) => ({ x: p.pos.x + f.x * d - f.z * s, z: p.pos.z + f.z * d + f.x * s });
    window.__f = f; window.__at = at;
    let spots = [[thr ? 5 : 1.6, 0]];
    if (push && scene === 'fan') spots = [[1.5, 0], [2.0, 1.2], [2.1, -1.3], [0.3, 2.4], [-1.6, 0]];   // 3 inside the fan, 1 beside (outside the angle), 1 behind
    if (push && scene === 'wall') spots = [[1.6, 0]];
    window.__ds = spots.map(([d, s]) => { const m = G.dev.dummies('mon_boar', 1, 0.01, at(d, s))[0]; m.teleport(at(d, s)); m.thinkStep = () => {}; return m; });
  }, [DIR, SCENE, THROW, PUSH]);
  await pg.waitForFunction(() => window.__ds.every(m => m.body), null, { timeout: 120000 });
  const info = await ev(([scene, fps, skill, thr, focus]) => {
    let seed = 12345; Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const p = G.player, f = window.__f, ds = window.__ds, m = ds[0];
    for (const d of ds) { d.teleport(d.pos); d.setFacing(-f.x, -f.z); d.body.place(d.pos); }
    if (scene !== 'sheathed' && p.body.setArmed) { p.body.setArmed(true); p.calmT = 0; }
    if (scene === 'sheathed') p.resetArms && p.resetArms();
    for (let i = 0; i < 12; i++) G.step(1 / fps, false);
    p.teleport(window.__spot); p.setFacing(f.x, f.z); for (const d of ds) d.knock = { x: 0, z: 0 };
    G.render.setFocus({ x: p.pos.x + f.x * focus, y: 0, z: p.pos.z + f.z * focus }, true);
    if (scene === 'kill') { m.hp = 5; }
    const L = window.__log = { fx: [], sfx: [], dmg: [], num: [], freezeP: [], freezeT: [], gstop: [], cam: [], lock: [], casts: [], proj: null, arm: [] };
    window.__t = 0; window.__p0 = ds.map(d => ({ ...d.pos })); window.__hp = ds.map(d => d.hp);
    const S = G.skillFx.pharm;
    for (const k of ['smash', 'swing', 'push', 'sweep', 'proj', 'burst', 'flask', 'cast']) if (S[k] && !S['__w' + k]) { S['__w' + k] = true; const o = S[k].bind(S); S[k] = (pc, opt) => { L.fx.push({ k, t: +window.__t.toFixed(3), whiff: !!(opt && opt.whiff), n: opt && opt.hits ? opt.hits.length : undefined }); return o(pc, opt); }; }
    const os = G.audio.sfx.bind(G.audio); G.audio.sfx = (n) => { L.sfx.push({ n, t: +window.__t.toFixed(3) }); return os(n); };
    const od = G.ui.damageText.bind(G.ui); G.ui.damageText = (...a) => { L.num.push({ t: +window.__t.toFixed(3), v: a[1], kind: a[2] }); return od(...a); };
    G.sheet.book.sk.slots[0] = skill; p.target = thr ? null : m; window.__sp0 = p.sp;
    const aim = thr ? window.__at(5) : window.__at(1.6);
    if (scene === 'whiff' && thr) { for (const d of ds) { d.dead = true; d.remove(); } }
    if (scene === 'sheathed') {   // the real key path: slot 1 holds the skill, the press goes through Player.actions (draw / stow rules included)
      G.input.block = false; window.__press = 1; window.__aim = aim; L.casts.push({ t: 0, e: 'key' });
    } else { const e = p.skills2.cast(skill, aim); if (e) return 'cast error: ' + e; L.casts.push({ t: 0, e: null }); }
    if (scene === 'whiff' && !thr) { for (const d of ds) { d.dead = true; d.remove(); } }   // the target is gone right after the press: the swing lands on nothing
    window.__chain = scene === 'repeat' ? 1 : 0;
    window.__c0 = null;
    return { hp: window.__hp, sp: window.__sp0, spot: window.__spot, wdir: window.__wdir };
  }, [SCENE, FPS, SKILL, THROW, FOCUS]);
  if (typeof info === 'string') { console.log(info); await b.close(); return; }
  const frames = [], total = Math.round(SEC * FPS); let dc = null;
  for (let i = 0; i < total; i++) {
    const c = await ev(([i, fps, skill, thr, focus]) => {
      window.__t = i / fps; const p = G.player, f = window.__f, ds = window.__ds, m = ds[0], L = window.__log;
      if (window.__press) { window.__press = 0; const e = p.skills2 && (p.weaponStow && p.weaponStow(skill) || p.weaponReady()) ? (p.castSkill(skill, { aim: window.__aim, down: {}, held: {} }), 'cast') : (p.combat(1.6), p.pendSkill = { id: skill, t: 0.8 }, 'draw first'); L.casts.push({ t: 0, e }); }
      if (window.__chain === 1 && (p.skills.lock || 0) <= 0 && window.__t > 0.4) { window.__chain = 2; p.skills2.cd = {}; G.dev.full(); if (!thr) p.target = m; const e = p.skills2.cast(skill, thr ? window.__at(5) : { x: m.pos.x, z: m.pos.z }); L.casts.push({ t: +window.__t.toFixed(3), e }); }
      G.step(1 / fps, true);
      ds.forEach((d, k) => { if (d && !d.removed && d.hp < window.__hp[k]) { L.dmg.push({ t: +window.__t.toFixed(3), k, a: Math.round(window.__hp[k] - d.hp), dead: !!d.dead }); window.__hp[k] = d.hp; } });
      if (!L.proj) { const pr = p.skills2.things.find(t => t.from && t.flight); if (pr) { let hd = null; try { const h = p.body.handPoint && p.body.handPoint(); if (h) hd = +Math.hypot(h.x - pr.pos.x, h.y - pr.pos.y, -h.z - pr.pos.z).toFixed(3); } catch (e) { hd = 'err'; }
        L.proj = { t: +window.__t.toFixed(3), from: { x: +(pr.from.x - p.pos.x).toFixed(2), y: +(pr.from.y - (p.pos.y || 0)).toFixed(2), z: +(pr.from.z - p.pos.z).toFixed(2) }, handDist: hd, flight: +pr.flight.toFixed(3) }; } }
      if ((p.freezeT || 0) > 0) L.freezeP.push(+window.__t.toFixed(3)); if (ds.some(d => d && d.freezeT > 0)) L.freezeT.push(+window.__t.toFixed(3)); if (G.hitStopT > 0) L.gstop.push(+window.__t.toFixed(3));
      L.lock.push(+(p.skills.lock || 0).toFixed(3)); L.arm.push(p.body.armed ? 1 : 0);
      const cp = G.render.cam.position, fu = G.render.focusU, rel = { x: cp.x - fu.x, y: cp.y - fu.y, z: cp.z + fu.z }; if (!window.__c0) window.__c0 = rel;
      L.cam.push(+Math.hypot(rel.x - window.__c0.x, rel.y - window.__c0.y, rel.z - window.__c0.z).toFixed(4));
      const s = G.render.toScreen({ x: p.pos.x + f.x * focus, y: p.pos.y + 1.0, z: p.pos.z + f.z * focus });
      return [s.x, s.y, G.render.r ? G.render.r.info.render.calls : -1];
    }, [i, FPS, SKILL, THROW, FOCUS]);
    const fn = `${dirOut}/${String(i).padStart(3, '0')}.png`, want = !process.env.REF || MARKS.some(m => i === Math.round(+process.env.REF * FPS) + Math.round(m * FPS));   // REF = known reference time: only the strip frames are captured (much faster)
    if (!process.env.NOSHOT && want) await pg.screenshot({ path: fn, clip: { x: Math.max(0, Math.min(VW - CW, Math.round(c[0] - CW / 2))), y: Math.max(0, Math.min(VH - CH, Math.round(c[1] - CH / 2))), width: CW, height: CH }, timeout: 300000 });
    frames.push(process.env.NOSHOT || !want ? null : fn); dc = Math.max(dc || 0, c[2]);
  }
  const res = await ev(() => { const L = window.__log, ds = window.__ds, p = G.player; const rng = a => a.length ? [a[0], a[a.length - 1], a.length] : null;
    const lockEnd = L.lock.findIndex((v, i) => i > 3 && v <= 0);
    const camMax = Math.max(...L.cam), first = L.cam.findIndex(v => v > 0.002), last = L.cam.length - 1 - [...L.cam].reverse().findIndex(v => v > 0.002);
    return { fx: L.fx, sfx: L.sfx, dmg: L.dmg, num: L.num, freezePlayer: rng(L.freezeP), freezeTarget: rng(L.freezeT), globalHitStop: rng(L.gstop), casts: L.casts, proj: L.proj,
      lockEndFrame: lockEnd, camMax: +camMax.toFixed(4), camFirstFrame: first, camLastFrame: camMax > 0.002 ? last : -1,
      moved: ds.map((d, k) => d && !d.removed ? +Math.hypot(d.pos.x - window.__p0[k].x, d.pos.z - window.__p0[k].z).toFixed(2) : null),
      blockedAfter: ds.map(d => d && !d.removed ? !!G.zone.geo.blocked(d.pos.x, d.pos.z, 0.2) : null),
      spUsed: +(window.__sp0 - p.sp).toFixed(1), cdLen: p.skills2.cdLen, armedSeries: L.arm.join('').replace(/(.)\1+/g, (s, c) => c + 'x' + s.length + ' '),
      live: G.skillFx.pharm.live.length, armed: p.body.armed }; });
  res.drawCallsMax = dc; res.fps = FPS; res.info = info;
  const fxHit = res.fx.find(x => ['smash', 'push', 'sweep', 'burst'].includes(x.k));
  const ref = process.env.REF ? +process.env.REF : THROW && res.proj ? res.proj.t : res.dmg.length ? res.dmg[0].t : fxHit ? fxHit.t : 0.3; res.refT = ref;
  const hitFrame = Math.round(ref * FPS);
  const pick = MARKS.map(m => { const i = hitFrame + Math.round(m * FPS); return i >= 0 && i < frames.length ? frames[i] : null; });
  if (!process.env.NOSHOT) {
    fs.writeFileSync('/tmp/_p3strip.py', `from PIL import Image, ImageDraw\nfr=${JSON.stringify(pick.map(f => f || ''))}\nlab=${JSON.stringify(MARKS)}\nims=[Image.open(f) if f else None for f in fr]\nw,h=next(i for i in ims if i).size\nims=[i or Image.new('RGB',(w,h),(0,0,0)) for i in ims]\nn=len(ims); cols=(n+1)//2 if n>8 else n; rows=(n+cols-1)//cols\nsh=Image.new('RGB',(w*cols,(h+22)*rows),(20,20,28))\nd=ImageDraw.Draw(sh)\nfor i,(im,l) in enumerate(zip(ims,lab)):\n  x=(i%cols)*w; y=(i//cols)*(h+22)\n  sh.paste(im,(x,y+22)); d.text((x+6,y+4),('%+.3fs'%l),fill=(255,255,255))\nsh.save('${OUT}/${name}.png')`);
    try { execSync('python3 /tmp/_p3strip.py'); } catch (e) { console.log('strip failed', e.message); }
  }
  console.log(name, JSON.stringify(res)); console.log('strip', `${OUT}/${name}.png`, 'errors', errs.slice(0, 6)); res.errors = errs;
  fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify(res, null, 1));
  await b.close();
})();
