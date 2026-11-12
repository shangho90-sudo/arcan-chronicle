// 요리사 1차 개편 스킬(식칼 썰기 ck1_a1 · 팬 강타 ck1_a2 · 미트볼 던지기 ck1_b1)을 실제 스킬 경로(skills2.cast → 동작 → 피해 →
// js/cookfx.js)로 시전하고 화면 띠와 수치를 남김. G.step(1/FPS) 한 프레임씩, Math.random 고정.
// Usage: SKILL=chop|pan|ball LV=1..5 SCENE=hit|whiff|kill|stun GENDER=m|f SIZE=1100x760|390x844t FX=1|0 TAG=after DIR=90
//        URL=http://localhost:8797/index.html OUT=/tmp/cook node tools/browser-tests/cook_skills.js
//   -> OUT/<TAG>_<skill>_lv<LV>_<scene>_<gender>_<size>_fx<FX>.png (+ .json)
//   로그: 피해 틱(시각·양), 타수와 기대 타수, 총 피해 / 기대 총 계수, 이펙트 호출(strike/land/splat/stun) 시각, 소리 호출, 히트스톱(시전자·대상 freezeT,
//   전역 hitStopT), 카메라 흔들림 폭, 기절 구간(m.stunned), 대상 이동, 행동 잠금이 풀린 프레임, 남은 이펙트 수, 콘솔 오류
const { chromium } = require('playwright'); const fs = require('fs'); const { execSync } = require('child_process');
const SK = { chop: 'ck1_a1', pan: 'ck1_a2', ball: 'ck1_b1' }, SKILL = process.env.SKILL || 'chop', ID = SK[SKILL], LV = +(process.env.LV || 1);
const SCENE = process.env.SCENE || 'hit', DIR = +(process.env.DIR || 90), FPS = +(process.env.FPS || 60), G_ = process.env.GENDER || 'm';
const SIZE = process.env.SIZE || '1100x760', TOUCH = SIZE.endsWith('t'), [VW, VH] = SIZE.replace('t', '').split('x').map(Number);
const FX = process.env.FX !== '0', TAG = process.env.TAG || 'after', OUT = process.env.OUT || '/tmp/cook', ZOOM = +(process.env.ZOOM || 1.4);
const DIST = SKILL === 'ball' ? 5 : 1.5, CW = +(process.env.CW || Math.min(VW, SKILL === 'ball' ? 640 : 460)), CH = +(process.env.CH || Math.min(VH, 440));
const DUR = +(process.env.DUR || (SCENE === 'stun' ? 4.2 : SKILL === 'ball' ? 1.9 : 1.6));
const MARKS = (process.env.MARKS || (SKILL === 'pan' ? '0.05,0.15,0.22,0.27,0.30,0.32,0.36,0.45,0.60,0.80,1.2,2.0' : SKILL === 'chop' ? '0.05,0.15,0.20,0.22,0.25,0.30,0.34,0.40,0.46,0.52,0.58,0.64,0.70,0.80,0.95,1.2' : '0.10,0.18,0.25,0.32,0.40,0.48,0.56,0.64,0.72,0.80,0.90,1.0,1.15,1.3')).split(',').map(Number);
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: VW, height: VH }, hasTouch: TOUCH, isMobile: TOUCH })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error' || /cook|fx /.test(m.text())) errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(process.env.URL || 'http://localhost:8797/index.html');
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(fx => { localStorage.clear(); localStorage.setItem('arcan_settings', JSON.stringify({ graphicsFx: fx })); }, FX);
  await pg.reload(); await click('새 게임'); await click('모험 시작');
  await pg.waitForSelector('.prologue.on', { timeout: 60000 }).then(() => click('건너뛰기')).catch(() => {});
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.player.body && G.player.body.md, null, { timeout: 300000 });
  await pg.waitForFunction(() => G.skillFx && G.skillFx.cook, null, { timeout: 120000 });
  await ev(async ([z, g, id, lv]) => {
    G.frame = () => {}; const c = G.render.cam; c.zoom = z; c.updateProjectionMatrix();
    document.querySelectorAll('.hud,.controls,.toasts,.qhud,.qh-reopen,.plates').forEach(e => e.style.display = 'none');
    if (G.reward) { G.reward.jobChange = sw => sw && sw(); G.reward.levelUp = () => {}; }
    G.dev.level(20); G.sheet.p.gender = g; G.dev.job('cook'); G.sheet.bag.add('w_knife_1', 1); G.sheet.p.weapon = 'w_knife_1';
    const bk = G.sheet.book; bk.sk.points += 99; for (let i = 0; i < lv; i++) if (!bk.learnBlock(id)) bk.learn(id);
    G.sheet.recalc(); G.dev.full(); G.input.block = true;
    await G.player.attachBody(); G.player.body.place(G.player.pos); G.player.body.play('idle', 1, true);
    G.skillFx.cook.load();
    const p = G.player; let spot = null; const cx = p.pos.x, cz = p.pos.z;
    for (let r = 0; r <= 16 && !spot; r++) for (let k = 0; k < Math.max(1, r * 6) && !spot; k++) { const a = k / Math.max(1, r * 6) * 6.283, c = { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r }; let ok = true;
      for (let x = -7; x <= 7 && ok; x += 0.75) for (let z = -7; z <= 7 && ok; z += 0.75) if (x * x + z * z <= 49 && G.zone.geo.blocked(c.x + x, c.z + z, 0.35)) ok = false; if (ok) spot = c; }
    window.__spot = spot || { x: cx, z: cz };
  }, [ZOOM, G_, ID, LV]);
  await pg.waitForFunction(() => G.skillFx.cook.ready && G.player.body && G.player.body.md, null, { timeout: 120000 });
  await pg.waitForTimeout(1500);
  const name = `${TAG}_${SKILL}_lv${LV}_${SCENE}_${G_}_${SIZE}_fx${FX ? 1 : 0}`, dirOut = `${OUT}/${name}`; fs.rmSync(dirOut, { recursive: true, force: true }); fs.mkdirSync(dirOut, { recursive: true });
  await ev(([dir, dist]) => {
    const p = G.player, a = dir * Math.PI / 180, f = { x: Math.sin(a), z: Math.cos(a) };
    for (const m of [...G.zone.actors]) if (m !== p && m.def && m.body) m.remove && m.remove();
    G.skillFx.clear(); p.teleport(window.__spot); p.body.place(p.pos); p.setFacing(f.x, f.z); p.target = null; p.lockOn = null; p.path = []; G.dev.full();
    const at = d => ({ x: p.pos.x + f.x * d, z: p.pos.z + f.z * d });
    window.__f = f; window.__at = at;
    const m = G.dev.dummies('mon_boar', 1, 0.01, at(dist))[0]; m.teleport(at(dist)); window.__ds = [m];
  }, [DIR, DIST]);
  await pg.waitForFunction(() => window.__ds.every(m => m.body), null, { timeout: 120000 });
  const info = await ev(([scene, fps, id, dist]) => {
    let seed = 12345; Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const p = G.player, f = window.__f, m = window.__ds[0];
    if (scene !== 'stun') m.thinkStep = () => {};
    m.teleport(m.pos); m.setFacing(-f.x, -f.z); m.body.place(m.pos);
    if (p.body.setArmed) { p.body.setArmed(true); p.calmT = 0; }
    for (let i = 0; i < 12; i++) G.step(1 / fps, false);
    p.teleport(window.__spot); p.setFacing(f.x, f.z); m.knock = { x: 0, z: 0 }; m.teleport(window.__at(dist));
    G.render.setFocus({ x: p.pos.x + f.x * dist * 0.6, y: 0, z: p.pos.z + f.z * dist * 0.6 }, true);
    const d = G.data.skill ? G.data.skill(id) : G.data.skills2.find(s => s.id === id);
    const L = window.__log = { fx: [], sfx: [], dmg: [], num: [], freezeP: [], freezeT: [], gstop: [], cam: [], lock: [], stun: [], act: [] };
    window.__t = 0; window.__p0 = { ...m.pos }; window.__hp = m.hp;
    const S = G.skillFx.cook;
    for (const k of ['knife', 'pan', 'stun', 'proj', 'splat']) if (!S['__w' + k]) { S['__w' + k] = true; const o = S[k].bind(S); S[k] = (a, opt) => { L.fx.push({ k, t: +window.__t.toFixed(3), hit: opt && opt.hit }); const h = o(a, opt);
      if (h && h.strike) { const s0 = h.strike, m0 = h.miss; h.strike = (...x) => { L.fx.push({ k: 'strike', t: +window.__t.toFixed(3) }); return s0(...x); }; h.miss = (...x) => { L.fx.push({ k: 'miss', t: +window.__t.toFixed(3) }); return m0(...x); }; }
      if (h && h.land) { const l0 = h.land; h.land = (t) => { L.fx.push({ k: 'land', t: +window.__t.toFixed(3), hit: !!t }); return l0(t); }; }
      return h; }; }
    const os = G.audio.sfx.bind(G.audio); G.audio.sfx = (n) => { L.sfx.push({ n, t: +window.__t.toFixed(3) }); return os(n); };
    const od = G.ui.damageText.bind(G.ui); G.ui.damageText = (...a) => { L.num.push({ t: +window.__t.toFixed(3), v: a[1] }); return od(...a); };
    p.target = m; window.__sp0 = p.sp;
    if (scene === 'kill') m.hp = Math.max(2, Math.round(p.stat('atk') * 0.5));   // dies on the first or second tick; the rest must not crash or linger
    window.__hp = m.hp;
    if (scene === 'whiff') { p.target = null; m.dead = true; m.remove(); }
    const e = p.skills2.cast(id, window.__at(dist)); if (e) return 'cast error: ' + e;
    return { hp: window.__hp, atk: p.stat('atk'), def: m.stat('def'), lv: p.skills2.lvl(id), mult: p.skills2.mult(d || { id, type: 'attack' }), desc: d && d.desc, cd: d && d.cd, mp: d && d.mp };
  }, [SCENE, FPS, ID, DIST]);
  if (typeof info === 'string') { console.log(info); await b.close(); return; }
  const frames = [], total = Math.round(DUR * FPS); let dc = 0;
  for (let i = 0; i < total; i++) {
    const shot = MARKS.some(m => i === Math.round(m * FPS));
    const c = await ev(([i, fps, dist]) => {
      window.__t = i / fps; const p = G.player, f = window.__f, m = window.__ds[0], L = window.__log;
      G.step(1 / fps, true);
      if (m && !m.removed && m.hp < window.__hp) { L.dmg.push({ t: +window.__t.toFixed(3), a: Math.round(window.__hp - m.hp), dead: !!m.dead }); window.__hp = m.hp; }
      if ((p.freezeT || 0) > 0) L.freezeP.push(+window.__t.toFixed(3)); if (m && m.freezeT > 0) L.freezeT.push(+window.__t.toFixed(3)); if (G.hitStopT > 0) L.gstop.push(+window.__t.toFixed(3));
      if (m && !m.removed && m.stunned) L.stun.push(+window.__t.toFixed(3));
      if (m && !m.removed && m.body && (i % 12 === 0)) L.act.push([+window.__t.toFixed(2), m.body.action, m.state || '']);
      L.lock.push(+(p.skills.lock || 0).toFixed(3));
      const cp = G.render.cam.position, fu = G.render.focusU, rel = { x: cp.x - fu.x, y: cp.y - fu.y, z: cp.z + fu.z }; if (!window.__c0) window.__c0 = rel;
      L.cam.push(+Math.hypot(rel.x - window.__c0.x, rel.y - window.__c0.y, rel.z - window.__c0.z).toFixed(4));
      const s = G.render.toScreen({ x: p.pos.x + f.x * dist * 0.62, y: p.pos.y + 1.1, z: p.pos.z + f.z * dist * 0.62 });
      return [s.x, s.y, G.render.r ? G.render.r.info.render.calls : -1];
    }, [i, FPS, DIST]);
    const fn = `${dirOut}/${String(i).padStart(3, '0')}.png`;
    if (shot) await pg.screenshot({ path: fn, clip: { x: Math.max(0, Math.min(VW - CW, Math.round(c[0] - CW / 2))), y: Math.max(0, Math.min(VH - CH, Math.round(c[1] - CH / 2))), width: CW, height: CH }, timeout: 300000 });
    frames.push(shot ? fn : null); dc = Math.max(dc, c[2]);
  }
  const res = await ev(([id]) => { const L = window.__log, m = window.__ds[0], p = G.player; const rng = a => a.length ? [a[0], a[a.length - 1], a.length] : null;
    const camMax = Math.max(...L.cam), last = L.cam.length - 1 - [...L.cam].reverse().findIndex(v => v > 0.002);
    return { fx: L.fx, sfx: L.sfx, dmg: L.dmg, hits: L.dmg.length, total: L.dmg.reduce((s, d) => s + d.a, 0), nums: L.num.length, freezePlayer: rng(L.freezeP), freezeTarget: rng(L.freezeT), globalHitStop: rng(L.gstop),
      stun: rng(L.stun), act: L.act, lockEndFrame: L.lock.findIndex((v, i) => i > 3 && v <= 0), camMax: +camMax.toFixed(4), camLastFrame: camMax > 0.002 ? last : -1,
      targetMoved: m && !m.removed ? +Math.hypot(m.pos.x - window.__p0.x, m.pos.z - window.__p0.z).toFixed(3) : null, spUsed: +(window.__sp0 - p.sp).toFixed(1), cdLen: p.skills2.cdLen && p.skills2.cdLen[id],
      live: G.skillFx.cook.live.length, things: p.skills2.things.length, pending: p.skills2.pending.length }; }, [ID]);
  res.info = info; res.drawCallsMax = dc; res.errors = errs.slice(0, 8);
  const pick = MARKS.map(m => frames[Math.round(m * FPS)] || null);
  fs.writeFileSync('/tmp/_cookstrip.py', `from PIL import Image, ImageDraw\nfr=${JSON.stringify(pick.map(f => f || ''))}\nlab=${JSON.stringify(MARKS)}\nims=[Image.open(f) if f else None for f in fr]\nw,h=next(i for i in ims if i).size\nims=[i or Image.new('RGB',(w,h),(0,0,0)) for i in ims]\nn=len(ims); cols=(n+1)//2 if n>7 else n; rows=(n+cols-1)//cols\nsh=Image.new('RGB',(w*cols,(h+22)*rows),(20,20,28))\nd=ImageDraw.Draw(sh)\nfor i,(im,l) in enumerate(zip(ims,lab)):\n  x=(i%cols)*w; y=(i//cols)*(h+22)\n  sh.paste(im,(x,y+22)); d.text((x+6,y+4),('t %.3fs'%l),fill=(255,255,255))\nsh.save('${OUT}/${name}.png')`);
  try { execSync('python3 /tmp/_cookstrip.py'); } catch (e) { console.log('strip failed', e.message); }
  console.log(name, JSON.stringify(res)); console.log('strip', `${OUT}/${name}.png`);
  fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify(res, null, 1));
  await b.close();
})();
