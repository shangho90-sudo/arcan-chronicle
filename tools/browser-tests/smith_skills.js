// 대장장이 1차 개편 스킬을 실제 경로(skills2.cast / 기본 공격 tryCast → 동작 → 피해 → js/smith.js 규칙 → js/smithfx.js)로 차례대로 쓰고
// 화면 띠와 상태 기록을 남김. G.step(1/FPS) 한 프레임씩, Math.random 고정. 브라우저 하나만 씀.
// Usage: SCENE=anvil|tongs|tongs_boss|brand|heat|wall|rivets|mobile  (또는 PLAN="forge@0,flurry@0.9,quench@2.4" 직접)
//        LV=1..5 GENDER=m|f SIZE=1100x760|390x844t FX=1|0 TAG=after N=몬스터 수 DIST=m BOSS=1 MARKS=0.1,0.3,…
//        URL=http://localhost:8801/index.html OUT=/tmp/smith node tools/browser-tests/smith_skills.js
//   PLAN 항목: <스킬>@<초>[:<조준 거리 m>]   스킬 = anvil tongs brand flurry tempo quench wall forge rivets craft4 craft5 | basic | hurt(앞 몬스터가 나를 100 때림)
//   -> OUT/<TAG>_<SCENE>_lv<LV>_<gender>_<size>_fx<FX>.png (띠) + .json (상태 기록: 모루·철벽·리벳·충전·박자·가열·낙인·피해·소리·이펙트 호출·멈춤·카메라·오류)
const { chromium } = require('playwright'); const fs = require('fs'); const { execSync } = require('child_process');
const ID = { anvil: 'bs1_a1', tongs: 'bs1_a2', brand: 'bs1_a3', flurry: 'bs1_a4', tempo: 'bs1_a5', quench: 'bs1_b1', wall: 'bs1_b2', forge: 'bs1_b3', rivets: 'bs1_b4', recycle: 'bs1_b5' };
const SCENES = {
  anvil: { plan: 'anvil@0:2.2,basic@0.95,basic@1.7,basic@2.4', n: 2, dist: 2.2, dur: 3.0, marks: '0.05,0.20,0.34,0.40,0.50,0.70,1.05,1.25,1.80,2.50,2.9' },
  tongs: { plan: 'anvil@0:1.7,tongs@0.8', n: 1, dist: 5.5, dur: 2.0, marks: '0.05,0.40,0.85,0.95,1.02,1.08,1.15,1.25,1.4,1.9' },
  tongs_boss: { plan: 'tongs@0', n: 1, dist: 5.0, boss: 1, dur: 1.4, marks: '0.05,0.15,0.25,0.35,0.45,0.55,0.7,1.0,1.3' },
  brand: { plan: 'brand@0,basic@0.8,basic@1.5,basic@2.2', n: 1, dist: 1.6, dur: 2.9, marks: '0.05,0.25,0.30,0.6,0.95,1.10,1.65,1.80,2.35,2.50,2.8' },
  heat: { plan: 'forge@0,flurry@0.9,quench@2.3', n: 3, dist: 1.8, dur: 3.2, marks: '0.1,0.25,0.4,0.9,1.06,1.20,1.34,1.68,1.75,2.3,2.5,2.62,2.75,3.1' },
  wall: { plan: 'wall@0,hurt@0.5,hurt@0.9,wall@1.3', n: 2, dist: 2.6, dur: 2.4, marks: '0.05,0.12,0.2,0.5,0.55,1.0,1.35,1.45,1.55,1.7,2.0,2.3' },
  rivets: { plan: 'rivets@0,hurt@0.6,hurt@0.62,hurt@1.1,basic@1.5', n: 1, dist: 1.6, dur: 2.3, marks: '0.05,0.2,0.4,0.62,0.7,1.12,1.2,1.55,1.75,1.85,2.2' },
  mobile: { plan: 'anvil@0:2.2,forge@0.9,quench@1.9,wall@2.8', n: 3, dist: 2.2, dur: 3.6, marks: '0.4,1.1,2.1,3.0,3.5', size: '390x844t', hud: 1 },
};
const SC = process.env.SCENE || 'heat', base = SCENES[SC] || {}, LV = +(process.env.LV || 1), FPS = +(process.env.FPS || 60), G_ = process.env.GENDER || 'm';
const PLAN = (process.env.PLAN || base.plan).split(',').map(s => { const [k, r] = s.split('@'), [t, aim] = r.split(':'); return { k, t: +t, aim: aim != null ? +aim : null }; });
const SIZE = process.env.SIZE || base.size || '1100x760', TOUCH = SIZE.endsWith('t'), [VW, VH] = SIZE.replace('t', '').split('x').map(Number);
const FX = process.env.FX !== '0', TAG = process.env.TAG || 'after', OUT = process.env.OUT || '/tmp/smith', ZOOM = +(process.env.ZOOM || (base.hud ? 1.0 : 1.3));
const N = +(process.env.N || base.n || 1), DIST = +(process.env.DIST || base.dist || 2), BOSS = +(process.env.BOSS || base.boss || 0), DUR = +(process.env.DUR || base.dur || 2.5), HUD = !!base.hud;
const CW = +(process.env.CW || (HUD ? VW : Math.min(VW, 560))), CH = +(process.env.CH || (HUD ? VH : Math.min(VH, 460)));
const MARKS = (process.env.MARKS || base.marks || '0.1,0.5,1.0,1.5,2.0').split(',').map(Number);
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: VW, height: VH }, hasTouch: TOUCH, isMobile: TOUCH })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error' || /smith/.test(m.text())) errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(process.env.URL || 'http://localhost:8801/index.html');
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(fx => { localStorage.clear(); localStorage.setItem('arcan_settings', JSON.stringify({ graphicsFx: fx })); }, FX);
  await pg.reload(); await click('새 게임'); await click('모험 시작');
  await pg.waitForSelector('.prologue.on', { timeout: 60000 }).then(() => click('건너뛰기')).catch(() => {});
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.player.body && G.player.body.md, null, { timeout: 300000 });
  await pg.waitForFunction(() => G.skillFx && G.skillFx.smith, null, { timeout: 120000 });
  await ev(async ([z, g, lv, hud, ids, plan, ids2]) => {
    G.frame = () => {}; const c = G.render.cam; c.zoom = z; c.updateProjectionMatrix();
    if (!hud) document.querySelectorAll('.hud,.controls,.toasts,.qhud,.qh-reopen,.plates').forEach(e => e.style.display = 'none');
    else document.querySelectorAll('.toasts,.qhud,.qh-reopen').forEach(e => e.style.display = 'none');
    if (G.reward) { G.reward.jobChange = sw => sw && sw(); G.reward.levelUp = () => {}; }
    G.dev.level(25); G.sheet.p.gender = g; G.dev.job('blacksmith'); G.sheet.bag.add('w_hammer_1', 1); G.sheet.p.weapon = 'w_hammer_1';
    const bk = G.sheet.book; bk.sk.points += 99; for (const id of ids) for (let i = 0; i < lv; i++) if (!bk.learnBlock(id)) bk.learn(id);
    bk.sk.slots = [...new Set(plan.map(a => ids2[a]).filter(Boolean))].concat(['', '', '', '']).slice(0, 4);   // 계획에 나오는 스킬을 칸 1~4에
    G.sheet.recalc(); G.dev.full(); G.input.block = !hud;
    await G.player.attachBody(); G.player.body.place(G.player.pos); G.player.body.play('idle', 1, true);
    const p = G.player; let spot = null; const cx = p.pos.x, cz = p.pos.z;
    for (let r = 0; r <= 16 && !spot; r++) for (let k = 0; k < Math.max(1, r * 6) && !spot; k++) { const a = k / Math.max(1, r * 6) * 6.283, c = { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r }; let ok = true;
      for (let x = -8; x <= 8 && ok; x += 0.75) for (let z = -8; z <= 8 && ok; z += 0.75) if (x * x + z * z <= 64 && G.zone.geo.blocked(c.x + x, c.z + z, 0.35)) ok = false; if (ok) spot = c; }
    window.__spot = spot || { x: cx, z: cz };
  }, [ZOOM, G_, LV, HUD, Object.values(ID), PLAN.map(a => a.k), ID]);
  await pg.waitForFunction(() => G.skillFx.smith.ready && G.player.body && G.player.body.md, null, { timeout: 120000 });
  await pg.waitForTimeout(1500);
  const name = `${TAG}_${SC}_lv${LV}_${G_}_${SIZE}_fx${FX ? 1 : 0}`, dirOut = `${OUT}/${name}`; fs.rmSync(dirOut, { recursive: true, force: true }); fs.mkdirSync(dirOut, { recursive: true });
  await ev(([n, dist, boss]) => {
    const p = G.player, f = { x: 1, z: 0 };
    for (const m of [...G.zone.actors]) if (m !== p && m.def && m.body) m.remove && m.remove();
    G.skillFx.clear(); p.teleport(window.__spot); p.body.place(p.pos); p.setFacing(f.x, f.z); p.target = null; p.lockOn = null; p.path = []; G.dev.full();
    const at = (d, side = 0) => ({ x: p.pos.x + f.x * d - f.z * side, z: p.pos.z + f.z * d + f.x * side });
    window.__f = f; window.__at = at;
    const ms = G.dev.dummies('mon_boar', n, 0.01, at(dist)); const sides = [0, 1.0, -1.0, 2.0, -2.0];
    ms.forEach((m, i) => { m.teleport(at(dist + (i ? 0.3 : 0), sides[i])); if (boss && i === 0) { m.isBoss = true; } });
    window.__ds = ms;
  }, [N, DIST, BOSS]);
  await pg.waitForFunction(() => window.__ds.every(m => m.body), null, { timeout: 120000 });
  const info = await ev(([fps, dist]) => {
    let seed = 12345; Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const p = G.player, f = window.__f;
    for (const m of window.__ds) { m.thinkStep = () => {}; m.setFacing(-f.x, -f.z); m.body.place(m.pos); m.hp = m.maxHp = 1e5; }
    if (p.body.setArmed) { p.body.setArmed(true); p.calmT = 0; }
    for (let i = 0; i < 12; i++) G.step(1 / fps, false);
    p.teleport(window.__spot); p.setFacing(f.x, f.z);
    G.render.setFocus({ x: p.pos.x + f.x * dist * 0.6, y: 0, z: p.pos.z + f.z * dist * 0.6 }, true);
    const L = window.__log = { fx: [], sfx: [], dmg: [], casts: [], freezeP: [], freezeT: [], gstop: [], cam: [], state: [], slot: [] };
    window.__t = 0; window.__hp = window.__ds.map(m => m.hp); window.__p0 = window.__ds.map(m => ({ ...m.pos }));
    const S = G.skillFx.smith;
    for (const k of ['heat', 'brand', 'anvil', 'tongs', 'hit', 'quench', 'wall', 'rivets', 'tempo', 'emp', 'release', 'scrap']) { const o = S[k].bind(S); S[k] = (a, opt) => { L.fx.push({ k, t: +window.__t.toFixed(3), kind: opt && opt.kind }); const h = o(a, opt);
      if (h && typeof h === 'object') for (const m of ['land', 'pulse', 'bump', 'grab', 'block', 'kick', 'fold', 'pop', 'shoot', 'spend', 'setCracks', 'shatter', 'setStacks', 'expire']) if (typeof h[m] === 'function') { const f0 = h[m]; h[m] = (...x) => { L.fx.push({ k: k + '.' + m, t: +window.__t.toFixed(3) }); return f0(...x); }; }
      return h; }; }
    const os = G.audio.sfx.bind(G.audio); G.audio.sfx = (n) => { L.sfx.push({ n, t: +window.__t.toFixed(3) }); return os(n); };
    return { atk: p.stat('atk'), sp: p.sp, def: window.__ds[0].stat('def'), maxHp: p.maxHp };
  }, [FPS, DIST]);
  const frames = [], total = Math.round(DUR * FPS); let dc = 0; const done = new Set();
  for (let i = 0; i < total; i++) {
    const t = i / FPS, acts = PLAN.filter((a, j) => !done.has(j) && t >= a.t - 1e-6).map(a => { done.add(PLAN.indexOf(a)); return a; });
    const shot = MARKS.some(m => i === Math.round(m * FPS));
    const c = await ev(([i, fps, dist, acts, ids]) => {
      window.__t = i / fps; const p = G.player, f = window.__f, L = window.__log, ms = window.__ds, m0 = ms[0];
      for (const a of acts) {
        let r;
        if (a.k === 'basic') { const s = G.data.skill(G.sheet.job.basicAttack); p.target = null; p.setFacing(f.x, f.z); r = p.skills.tryCast(s, { x: p.pos.x + f.x * 2, z: p.pos.z + f.z * 2 }); r = r == null ? 'ok' : (r || 'busy'); }
        else if (a.k === 'hurt') { const src = ms.find(m => !m.dead) || m0; const hp = p.hp; p.takeDamage({ source: src, amount: 100, noMiss: true, kdir: { x: -f.x, z: -f.z } }); r = 'took ' + Math.round(hp - p.hp) + '/100'; p.hp = p.maxHp; }
        else { p.setFacing(f.x, f.z); p.target = ids[a.k] === 'bs1_a2' || ids[a.k] === 'bs1_a3' ? m0 : null; const aim = a.aim != null ? window.__at(a.aim) : window.__at(dist); r = p.skills2.cast(ids[a.k], aim); r = r === null ? 'ok' : r; }
        L.casts.push({ k: a.k, t: +window.__t.toFixed(3), r });
      }
      G.step(1 / fps, true);
      ms.forEach((m, j) => { if (!m.removed && m.hp < window.__hp[j]) { L.dmg.push({ m: j, t: +window.__t.toFixed(3), a: Math.round(window.__hp[j] - m.hp) }); window.__hp[j] = m.hp; } });
      if ((p.freezeT || 0) > 0) L.freezeP.push(+window.__t.toFixed(3)); if (m0.freezeT > 0) L.freezeT.push(+window.__t.toFixed(3)); if (G.hitStopT > 0) L.gstop.push(+window.__t.toFixed(3));
      const K = p.skills2.smith;
      if (i % 6 === 0) L.state.push({ t: +window.__t.toFixed(2), anvil: K.anvil ? { landed: K.anvil.landed, pulses: K.anvil.pulses, left: +K.anvil.t.toFixed(2) } : null, wall: K.wall ? +K.wall.t.toFixed(2) : null,
        rivets: K.rivets ? K.rivets.n : null, stored: +K.stored.toFixed(1), tempo: +K.tempoT.toFixed(2), heat: ms.map(m => K.heatOf(m)), brand: ms.map(m => m._brand ? m._brand.n : null),
        pos: ms.map(m => [+(m.pos.x - window.__p0[0].x).toFixed(2), +(m.pos.z - window.__p0[0].z).toFixed(2)]), pp: [+p.pos.x.toFixed(2), +p.pos.z.toFixed(2)], defdown: ms.map(m => m.status.has('defdown')) });
      const wi = G.sheet.book.sk.slots.indexOf('bs1_b2'), sb = document.querySelector('.abtn.skill' + (wi >= 0 ? wi + 1 : 2)); if (sb && i % 6 === 0) L.slot.push([+window.__t.toFixed(2), sb.classList.contains('recast'), sb.querySelector('.cdt').textContent, sb.querySelector('.sub').textContent]);
      const cp = G.render.cam.position, fu = G.render.focusU, rel = { x: cp.x - fu.x, y: cp.y - fu.y, z: cp.z + fu.z }; if (!window.__c0) window.__c0 = rel;
      L.cam.push(+Math.hypot(rel.x - window.__c0.x, rel.y - window.__c0.y, rel.z - window.__c0.z).toFixed(4));
      const s = G.render.toScreen({ x: p.pos.x + f.x * dist * 0.55, y: p.pos.y + 1.0, z: p.pos.z + f.z * dist * 0.55 });
      return [s.x, s.y, G.render.r ? G.render.r.info.render.calls : -1];
    }, [i, FPS, DIST, acts, ID]);
    const fn = `${dirOut}/${String(i).padStart(3, '0')}.png`;
    if (shot) { if (HUD) await ev(() => G.ui.updateControls && G.ui.updateControls()); await pg.screenshot({ path: fn, clip: HUD ? undefined : { x: Math.max(0, Math.min(VW - CW, Math.round(c[0] - CW / 2))), y: Math.max(0, Math.min(VH - CH, Math.round(c[1] - CH / 2))), width: CW, height: CH }, timeout: 300000 }); }
    frames.push(shot ? fn : null); dc = Math.max(dc, c[2]);
  }
  const res = await ev(() => { const L = window.__log, p = G.player, K = p.skills2.smith; const rng = a => a.length ? [a[0], a[a.length - 1], a.length] : null;
    const camMax = Math.max(...L.cam);
    return { casts: L.casts, fx: L.fx, sfx: L.sfx, dmg: L.dmg, state: L.state, slot: L.slot, freezePlayer: rng(L.freezeP), freezeTarget: rng(L.freezeT), globalHitStop: rng(L.gstop), camMax: +camMax.toFixed(4),
      liveFx: G.skillFx.smith.live.length, things: p.skills2.things.length, pending: p.skills2.pending.length, scrapLog: K.log.scrap, sp: p.sp }; });
  res.info = info; res.drawCallsMax = dc; res.errors = errs.slice(0, 8);
  const pick = MARKS.map(m => frames[Math.round(m * FPS)] || null);
  fs.writeFileSync('/tmp/_smithstrip.py', `from PIL import Image, ImageDraw\nfr=${JSON.stringify(pick.map(f => f || ''))}\nlab=${JSON.stringify(MARKS)}\nims=[Image.open(f) if f else None for f in fr]\nw,h=next(i for i in ims if i).size\nims=[i or Image.new('RGB',(w,h),(0,0,0)) for i in ims]\nn=len(ims); cols=${HUD ? 'n' : '(n+1)//2 if n>6 else n'}; rows=(n+cols-1)//cols\nsh=Image.new('RGB',(w*cols,(h+22)*rows),(20,20,28))\nd=ImageDraw.Draw(sh)\nfor i,(im,l) in enumerate(zip(ims,lab)):\n  x=(i%cols)*w; y=(i//cols)*(h+22)\n  sh.paste(im,(x,y+22)); d.text((x+6,y+4),('t %.3fs'%l),fill=(255,255,255))\nsh.save('${OUT}/${name}.png')`);
  try { execSync('python3 /tmp/_smithstrip.py'); } catch (e) { console.log('strip failed', e.message); }
  fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify(res, null, 1));
  console.log(name, JSON.stringify({ casts: res.casts, dmg: res.dmg.length, errors: res.errors, gstop: res.globalHitStop, camMax: res.camMax, live: res.liveFx, pending: res.pending }));
  console.log('strip', `${OUT}/${name}.png`);
  await b.close();
})();
