// 쉐프 2차 스킬 15종을 실제 스킬 경로(skills2.cast → 동작 → js/chef.js 규칙 → js/cheffx.js)로 시전하고 화면 띠와 수치를 남김.
// G.step(1/FPS) 한 프레임씩, 찍지 않는 프레임은 GPU 그리기를 건너뜀. DET=1 = 난수 0.5 고정. cook_skills.js를 본뜸.
// Usage: SKILLS=wok,flambe,cooker,skewer,show,sorbet,plating,mille,sugar,tower,broth,bon,royal,menu LV=1..5 GENDER=m|f SIZE=1100x760|390x844t FX=1|0 TAG=after
//        URL=http://localhost:8819/index.html OUT=/tmp/chef node tools/browser-tests/chef_skills.js
//   -> OUT/<TAG>_<skill>_lv<LV>_<gender>_<size>_fx<FX>.png (+ .json): 피해 틱(시각·대상·파생), 이펙트·소리 호출, 상태(화상·둔화·빙결), 설탕 벽 충돌,
//      시전자·대상 freezeT, 전역 hitStop(없어야 함), 카메라 흔들림, 남은 이펙트·설치물, 콘솔 오류
const { chromium } = require('playwright'); const fs = require('fs'); const { execSync } = require('child_process');
const SK = { wok: 'cf_a1', flambe: 'cf_a2', cooker: 'cf_a3', skewer: 'cf_a4', show: 'cf_a5', sorbet: 'cf_b1', plating: 'cf_b2', mille: 'cf_b3', sugar: 'cf_b4', tower: 'cf_b5', menu: 'cf_c1', broth: 'cf_c2', bon: 'cf_c3', royal: 'cf_c5' };
const LIST = (process.env.SKILLS || process.env.SKILL || 'wok').split(','), LV = +(process.env.LV || 1), FPS = +(process.env.FPS || 30), G_ = process.env.GENDER || 'm';
const SIZE = process.env.SIZE || '1100x760', TOUCH = SIZE.endsWith('t'), [VW, VH] = SIZE.replace('t', '').split('x').map(Number);
const FX = process.env.FX !== '0', TAG = process.env.TAG || 'after', OUT = process.env.OUT || '/tmp/chef', ZOOM = +(process.env.ZOOM || 1.25), DIR = +(process.env.DIR || 90);
const PLAN = {   // dist = 조준·대상 거리, dur = 기록 초, marks = 찍는 시각
  wok: { d: 1.8, dur: 1.2, m: [0.1, 0.2, 0.24, 0.36, 0.5, 0.56, 0.75] }, flambe: { d: 4, dur: 1.5, m: [0.15, 0.3, 0.55, 0.7, 0.78, 0.95, 1.2] },
  cooker: { d: 3.5, dur: 3.2, m: [0.3, 0.8, 1.5, 2.0, 2.4, 2.56, 2.75] }, skewer: { d: 2, dur: 1.3, m: [0.12, 0.24, 0.3, 0.4, 0.5, 0.65, 0.85] },
  show: { d: 2, dur: 2.4, m: [0.3, 0.45, 0.6, 1.05, 1.3, 1.72, 1.82, 2.1] }, sorbet: { d: 5, dur: 1.5, m: [0.15, 0.25, 0.4, 0.55, 0.7, 0.85, 1.05] },
  plating: { d: 3.5, dur: 1.5, m: [0.15, 0.35, 0.55, 0.62, 0.75, 1.0, 1.3] }, mille: { d: 2.5, dur: 2.2, m: [0.2, 0.4, 0.6, 0.9, 1.2, 1.5, 1.9] },
  sugar: { d: 3, dur: 3.0, m: [0.2, 0.4, 0.6, 1.0, 2.0, 2.1, 2.3, 2.7] }, tower: { d: 0, dur: 3.4, m: [0.5, 1.0, 1.6, 2.2, 2.45, 2.6, 2.8, 3.1] },
  broth: { d: 2, dur: 3.0, m: [0.3, 0.6, 1.2, 1.6, 2.2, 2.8] }, bon: { d: 1.5, dur: 1.3, m: [0.15, 0.35, 0.5, 0.7, 0.9, 1.1] },
  royal: { d: 1.5, dur: 2.4, m: [0.2, 0.55, 0.7, 1.2, 1.7, 2.1] }, menu: { d: 1.5, dur: 2.0, m: [0.2, 0.4, 0.6, 0.8, 1.05, 1.4] } };
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: VW, height: VH }, hasTouch: TOUCH, isMobile: TOUCH })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error' || /chef|fx /.test(m.text())) errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(process.env.URL || 'http://localhost:8819/index.html');
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(fx => { localStorage.clear(); localStorage.setItem('arcan_settings', JSON.stringify({ graphicsFx: fx })); }, FX);
  await pg.reload(); await click('새 게임'); await click('모험 시작');
  await pg.waitForSelector('.prologue.on', { timeout: 60000 }).then(() => click('건너뛰기')).catch(() => {});
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.player.body && G.player.body.md, null, { timeout: 300000 });
  await pg.waitForFunction(() => G.skillFx && G.skillFx.chef, null, { timeout: 120000 });
  await ev(async ([z, g, ids, lv]) => {
    G.frame = () => {}; const c = G.render.cam; c.zoom = z; c.updateProjectionMatrix();
    document.querySelectorAll('.hud,.controls,.toasts,.qhud,.qh-reopen').forEach(e => e.style.display = 'none');
    if (G.reward) { G.reward.jobChange = sw => sw && sw(); G.reward.levelUp = () => {}; }
    G.dev.level(50); G.sheet.p.gender = g; G.dev.job('cook'); G.dev.job('chef'); G.sheet.bag.add('w_knife_1', 1); G.sheet.p.weapon = 'w_knife_1';
    const bk = G.sheet.book; bk.sk.points += 99; for (const id of ids) for (let i = 0; i < lv; i++) if (!bk.learnBlock(id)) bk.learn(id);
    G.sheet.recalc(); G.dev.full(); G.input.block = true;
    await G.player.attachBody(); G.player.body.place(G.player.pos); G.player.body.play('idle', 1, true);
    { const R = G.render.r, o = R.render.bind(R); R.render = (sc, c) => { if (!window.__noDraw) o(sc, c); }; }
    const p = G.player; let spot = null; const cx = p.pos.x, cz = p.pos.z;
    for (let r = 0; r <= 20 && !spot; r++) for (let k = 0; k < Math.max(1, r * 6) && !spot; k++) { const a = k / Math.max(1, r * 6) * 6.283, c = { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r }; let ok = true;
      for (let x = -8; x <= 8 && ok; x += 0.75) for (let z = -8; z <= 8 && ok; z += 0.75) if (x * x + z * z <= 64 && G.zone.geo.blocked(c.x + x, c.z + z, 0.35)) ok = false; if (ok) spot = c; }
    window.__spot = spot || { x: cx, z: cz };
  }, [ZOOM, G_, Object.values(SK), LV]);
  await pg.waitForFunction(() => G.skillFx.chef.ready && G.player.body && G.player.body.md, null, { timeout: 120000 });
  await pg.waitForTimeout(1500);
  for (const SKILL of LIST) { const P = PLAN[SKILL], ID = SK[SKILL]; errs.length = 0;
    const name = `${TAG}_${SKILL}_lv${LV}_${G_}_${SIZE}_fx${FX ? 1 : 0}`, dirOut = `${OUT}/${name}`; fs.rmSync(dirOut, { recursive: true, force: true }); fs.mkdirSync(dirOut, { recursive: true });
    await ev(([dir, dist, skill]) => {
      const p = G.player, a = dir * Math.PI / 180, f = { x: Math.sin(a), z: Math.cos(a) };
      for (const m of [...G.zone.actors]) if (m !== p && m.remove && !m.isSummon) m.remove();
      G.player.skills2.clearTemp(); G.skillFx.clear(); p.teleport(window.__spot); p.body.place(p.pos); p.setFacing(f.x, f.z); p.target = null; p.lockOn = null; p.path = [];
      p.skills2.cd = {}; p.skills.lock = 0; G.dev.full(); for (const s of p.status.list.slice()) p.status.remove(s.def.id);
      const side = (d, s) => ({ x: p.pos.x + f.x * d - f.z * s, z: p.pos.z + f.z * d + f.x * s }); window.__f = f; window.__side = side;
      const spots = { wok: [side(1.8, 0), side(2.4, 1.6)], flambe: [side(dist, 0), side(dist + 0.8, 0.9), side(dist - 0.6, -1)], cooker: [side(dist + 0.5, 0.8), side(dist - 0.4, -1.2)], skewer: [side(1.6, 0), side(3.2, 0.2), side(5, -0.2)],
        show: [side(2, 0), side(3, 1.2), side(5.5, 0)], sorbet: [side(dist, 0), side(dist + 2, 1.5)], plating: [side(dist, 0), side(dist + 0.9, 0.9), side(dist - 0.6, -1)], mille: [side(2, 0), side(4.5, 0.2)],
        sugar: [side(5, 0)], tower: [side(2, 0), side(1, 2), side(-1.5, 1.5), side(4.5, -3)] }[skill] || [];
      window.__ds = spots.map(s => { const m = G.dev.dummies('mon_boar', 1, 0.01, s)[0]; m.teleport(s); m.__spot = s; return m; });
    }, [DIR, P.d, SKILL]);
    await pg.waitForFunction(() => window.__ds.every(m => m.body), null, { timeout: 120000 });
    const info = await ev(([fps, id, dist, skill, det]) => {
      let seed = 12345; Math.random = det ? () => 0.5 : () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      const p = G.player, f = window.__f, m = window.__ds[0];
      for (const q of window.__ds) { q.thinkStep = () => {}; q.teleport(q.__spot); q.setFacing(-f.x, -f.z); q.body.place(q.pos); q.hp = q.maxHp = 1e7; q.level = 1; }
      if (p.body.setArmed) { p.body.setArmed(true); p.calmT = 0; }
      for (let i = 0; i < 8; i++) G.step(1 / fps, false);
      p.teleport(window.__spot); p.setFacing(f.x, f.z); for (const q of window.__ds) { q.knock = { x: 0, z: 0 }; q.teleport(q.__spot); q.__hp = q.hp; }
      G.render.setFocus({ x: p.pos.x + f.x * dist * 0.55, y: 0, z: p.pos.z + f.z * dist * 0.55 }, true);
      const L = window.__log = { fx: [], sfx: [], dmg: [], freezeP: 0, freezeT: 0, gstop: 0, cam: [], status: [], wall: null };
      window.__t = 0;
      const S = G.skillFx.chef;
      for (const k of ['wok', 'flambe', 'cooker', 'skewers', 'show', 'sorbet', 'plating', 'mille', 'sugar', 'tower', 'broth', 'bon', 'touch', 'royal', 'menu']) if (S[k] && !S['__w' + k]) { S['__w' + k] = true; const o = S[k].bind(S); S[k] = (a, opt) => { const h = o(a, opt); window.__log.fx.push({ k, t: +window.__t.toFixed(3), ok: !!h }); if (h) for (const mm of Object.keys(h)) if (typeof h[mm] === 'function' && !['update', 'dispose'].includes(mm)) { const f0 = h[mm]; h[mm] = (...x) => { window.__log.fx.push({ k: k + '.' + mm, t: +window.__t.toFixed(3) }); return f0(...x); }; } return h; }; }
      if (!G.audio.__w) { G.audio.__w = true; const os = G.audio.sfx.bind(G.audio); G.audio.sfx = (n, o) => { window.__log.sfx.push({ n, t: +window.__t.toFixed(3) }); return os(n, o); }; }
      p.target = m || null; window.__sp0 = p.sp;
      if (skill === 'flambe') G.player.skills2.chef.h.applyStatus(window.__ds[0], { id: 'slow', dur: 6, val: 0.2, ch: 1 }, p);
      if (skill === 'plating') { G.player.skills2.chef.h.applyStatus(window.__ds[0], { id: 'burn', dur: 6, val: 0.05, ch: 1 }, p); G.player.skills2.chef.h.applyStatus(window.__ds[1], { id: 'slow', dur: 6, val: 0.2, ch: 1 }, p); }
      if (['broth', 'royal', 'bon'].includes(skill)) p.hp = Math.round(p.maxHp * 0.4);
      if (skill === 'bon') { G.sheet.bag.add('f_course_atk', 2); G.sheet.p.crafted['food:f_course_atk'] = 1; }
      if (skill === 'menu') { G.skillFx.chef.menu(p, { id: 'f_course_atk', n: 1 }); return { menu: true }; }
      const aim = skill === 'tower' || skill === 'royal' || skill === 'bon' ? null : window.__side(dist, 0);
      G.sheet.book.sk.slots = [id, '', '', '']; const e = p.skills2.cast(id, aim); if (e) return 'cast error: ' + e;
      return { atk: p.stat('atk'), lv: p.skills2.lvl(id) };
    }, [FPS, ID, P.d, SKILL, !!process.env.DET]);
    if (typeof info === 'string') { console.log(SKILL, info); continue; }
    const frames = [], total = Math.round(P.dur * FPS); let dc = 0;
    for (let i = 0; i < total; i++) {
      const shot = P.m.some(m => i === Math.round(m * FPS));
      const c = await ev(([i, fps, skill, dist, shot]) => {
        window.__t = i / fps; window.__noDraw = !shot; const p = G.player, f = window.__f, L = window.__log;
        if (skill === 'sugar' && i === Math.round(0.8 * fps)) { const s = p.skills2.summons.find(x => !x.dead); const w = window.__side(3, 0), w2 = window.__side(3, 1.6); L.wall = { blockedCentre: G.zone.geo.blocked(w.x, w.z, 0.3), blockedEnd: G.zone.geo.blocked(w2.x, w2.z, 0.1), summon: !!s };
          const q = window.__ds[0]; if (q) { const from = { ...q.pos }; q.thinkStep = () => {}; q.__walk = true; L.wall.monsterStart = from; } }
        if (skill === 'sugar' && window.__ds[0] && window.__ds[0].__walk) { const q = window.__ds[0], to = { x: q.pos.x - f.x * 3 / fps, z: q.pos.z - f.z * 3 / fps }; const mv = G.zone.geo.move(q.pos, to.x - q.pos.x, to.z - q.pos.z, q.radius); q.teleport({ x: mv.x, z: mv.z }); }
        if (skill === 'sugar' && i === Math.round(2.0 * fps)) { const q = window.__ds[0]; L.wall.monsterStopped = q ? +Math.hypot(q.pos.x - p.pos.x, q.pos.z - p.pos.z).toFixed(2) : null; q.__walk = false; const s = p.skills2.summons.find(x => !x.dead); if (s) s.takeDamage({ amount: s.maxHp + 5 }); L.wall.brokeAt = window.__t; }
        G.step(1 / fps, true);
        window.__ds.forEach((q, qi) => { if (!q.removed && q.hp < q.__hp) { L.dmg.push({ t: +window.__t.toFixed(3), a: Math.round(q.__hp - q.hp), i: qi }); q.__hp = q.hp; } });
        if ((p.freezeT || 0) > 0) L.freezeP++; if (window.__ds.some(q => q.freezeT > 0)) L.freezeT++; if (G.hitStopT > 0) L.gstop++;
        if (i % 6 === 0) L.status.push([+window.__t.toFixed(2), window.__ds.map(q => q.removed ? 'x' : q.status.list.map(s => s.def.id + (s.def.id === 'slow' ? ':' + s.value.toFixed(2) : '')).join('+')).join(' | ')]);
        const cp = G.render.cam.position, fu = G.render.focusU, rel = { x: cp.x - fu.x, y: cp.y - fu.y, z: cp.z + fu.z }; if (!window.__c0) window.__c0 = rel;
        L.cam.push(+Math.hypot(rel.x - window.__c0.x, rel.y - window.__c0.y, rel.z - window.__c0.z).toFixed(4));
        const s = G.render.toScreen({ x: p.pos.x + f.x * dist * 0.55, y: p.pos.y + 1.0, z: p.pos.z + f.z * dist * 0.55 });
        return [s.x, s.y, G.render.r ? G.render.r.info.render.calls : -1];
      }, [i, FPS, SKILL, P.d, shot]);
      const CW = Math.min(VW, 620), CH = Math.min(VH, 480), fn = `${dirOut}/${String(i).padStart(3, '0')}.png`;
      if (shot) await pg.screenshot({ path: fn, clip: { x: Math.max(0, Math.min(VW - CW, Math.round(c[0] - CW / 2))), y: Math.max(0, Math.min(VH - CH, Math.round(c[1] - CH / 2))), width: CW, height: CH }, timeout: 300000 });
      frames.push(shot ? fn : null); dc = Math.max(dc, c[2]);
    }
    const late = await ev(() => { window.__noDraw = true; for (let i = 0; i < 300; i++) G.step(1 / 30, true); window.__noDraw = false; const k = G.player.skills2.chef; return { chefLive: G.skillFx.chef.live.length, kitLive: k.live.length, timers: k.timers.length, summons: G.player.skills2.summons.filter(s => !s.dead).length, areas: G.player.skills2.areas.length, walls: G.zone.geo.boxes.filter(b => String(b.tag).startsWith('swall')).length }; });
    const res = await ev(() => { const L = window.__log, p = G.player; return { fx: L.fx, sfx: L.sfx.map(s => s.n + '@' + s.t), dmg: L.dmg, hits: L.dmg.length, total: L.dmg.reduce((s, d) => s + d.a, 0), status: L.status, wall: L.wall, freezeP: L.freezeP, freezeT: L.freezeT, globalHitStop: L.gstop, camMax: Math.max(...L.cam), hp: Math.round(p.hp), maxHp: p.maxHp, shield: p.shield, buffs: p.status.list.map(s => s.def.id + ':' + (+s.value).toFixed(3)).join(' '), food: G.sheet.bag.count('f_course_atk'), spUsed: +(window.__sp0 - p.sp).toFixed(1), log: G.player.skills2.chef.log }; });
    res.info = info; res.late = late; res.drawCallsMax = dc; res.errors = errs.slice(0, 8);
    const pick = P.m.map(m => frames[Math.round(m * FPS)] || '');
    fs.writeFileSync('/tmp/_chefstrip.py', `from PIL import Image, ImageDraw\nfr=${JSON.stringify(pick)}\nlab=${JSON.stringify(P.m)}\nims=[Image.open(f) if f else None for f in fr]\nw,h=next(i for i in ims if i).size\nims=[i or Image.new('RGB',(w,h),(0,0,0)) for i in ims]\nims=[i.resize((w*2//3,h*2//3)) for i in ims]\nw,h=ims[0].size\nn=len(ims); cols=4 if n>4 else n; rows=(n+cols-1)//cols\nsh=Image.new('RGB',(w*cols,(h+22)*rows),(20,20,28))\nd=ImageDraw.Draw(sh)\nfor i,(im,l) in enumerate(zip(ims,lab)):\n  x=(i%cols)*w; y=(i//cols)*(h+22)\n  sh.paste(im,(x,y+22)); d.text((x+6,y+4),('${SKILL} t %.2fs'%l),fill=(255,255,255))\nsh.save('${OUT}/${name}.png')`);
    try { execSync('python3 /tmp/_chefstrip.py'); } catch (e) { console.log('strip failed', e.message); }
    fs.rmSync(dirOut, { recursive: true, force: true });
    console.log(name, JSON.stringify({ hits: res.hits, total: res.total, late, errors: res.errors, gstop: res.globalHitStop, camMax: res.camMax, wall: res.wall, log: res.log }));
    fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify(res, null, 1));
  }
  await b.close();
})();
