// 디자이너 2차 스킬을 실제 스킬 경로(skills2.cast → 동작 → js/designer.js 규칙 → js/designerfx.js)로 시전하고 화면 띠와 수치를 남김(chef_skills.js를 본뜸).
// G.step(1/FPS) 한 프레임씩, 찍지 않는 프레임은 GPU 그리기를 건너뜀. DET=1 = 난수 0.5 고정.
// Usage: SKILLS=drape,break,stitch,cross,finale,road,pirouette,mirror,muse,collection,restitch,fit,outfit,emb,ribbon LV=1..5 GENDER=m|f SIZE=1100x760|390x844t FX=1|0 TAG=after
//        URL=http://localhost:8843/index.html OUT=/tmp/designer node tools/browser-tests/designer_skills.js
//   -> OUT/<TAG>_<skill>_lv<LV>_<gender>_<size>_fx<FX>.png (+ .json): 피해 틱(시각·대상), 이펙트·소리 호출, 상태, 시침 수, 시전자 위치, 전역 hitStop(없어야 함), 카메라, 남은 이펙트
const { chromium } = require('playwright'); const fs = require('fs'); const { execSync } = require('child_process');
const SK = { drape: 'ds_a1', break: 'ds_a2', stitch: 'ds_a3', cross: 'ds_a4', finale: 'ds_a5', road: 'ds_b1', pirouette: 'ds_b2', mirror: 'ds_b3', muse: 'ds_b4', collection: 'ds_b5', restitch: 'ds_c4', fit: 'ds_c5', outfit: 'ds_c1', emb: 'ds_c2', ribbon: 'ds_c3' };
const LIST = (process.env.SKILLS || process.env.SKILL || 'drape').split(','), LV = +(process.env.LV || 1), FPS = +(process.env.FPS || 30), G_ = process.env.GENDER || 'f';
const SIZE = process.env.SIZE || '1100x760', TOUCH = SIZE.endsWith('t'), [VW, VH] = SIZE.replace('t', '').split('x').map(Number);
const FX = process.env.FX !== '0', TAG = process.env.TAG || 'after', OUT = process.env.OUT || '/tmp/designer', ZOOM = +(process.env.ZOOM || 1.25), DIR = +(process.env.DIR || 90);
const PLAN = {   // d = 조준·대상 거리, dur = 기록 초, m = 찍는 시각
  drape: { d: 3.5, dur: 1.6, m: [0.15, 0.3, 0.45, 0.6, 0.8, 1.4] }, break: { d: 1.6, dur: 0.9, m: [0.1, 0.2, 0.27, 0.32, 0.4, 0.55] },
  stitch: { d: 3.5, dur: 1.6, m: [0.15, 0.3, 0.5, 0.7, 1.0, 1.25] }, cross: { d: 1.7, dur: 0.9, m: [0.1, 0.2, 0.24, 0.34, 0.4, 0.55] },
  finale: { d: 3, dur: 1.6, m: [0.2, 0.45, 0.7, 0.8, 0.88, 1.1] }, road: { d: 2.5, dur: 1.1, m: [0.05, 0.15, 0.25, 0.4, 0.6, 0.9] },
  pirouette: { d: 1.8, dur: 1.8, m: [0.15, 0.4, 0.7, 1.0, 1.4, 1.6] }, mirror: { d: 2, dur: 2.0, m: [0.1, 0.25, 0.45, 0.7, 1.2, 1.8] },
  muse: { d: 4, dur: 1.2, m: [0.15, 0.3, 0.45, 0.7, 1.0] }, collection: { d: 3.5, dur: 2.4, m: [0.2, 0.55, 0.75, 0.95, 1.2, 1.55, 1.75, 2.0] },
  restitch: { d: 2, dur: 1.4, m: [0.05, 0.15, 0.3, 0.45, 0.7, 1.2] }, fit: { d: 2, dur: 1.0, m: [0.1, 0.3, 0.5, 0.7] },
  outfit: { d: 1.5, dur: 2.1, m: [0.2, 0.45, 0.65, 0.95, 1.25, 1.6] }, emb: { d: 1.5, dur: 1.8, m: [0.2, 0.45, 0.75, 1.0, 1.3] }, ribbon: { d: 1.5, dur: 1.6, m: [0.15, 0.35, 0.55, 0.8, 1.1] } };
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: VW, height: VH }, hasTouch: TOUCH, isMobile: TOUCH })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error' || /designer|fx ds/.test(m.text())) errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(process.env.URL || 'http://localhost:8843/index.html');
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(fx => { localStorage.clear(); localStorage.setItem('arcan_settings', JSON.stringify({ graphicsFx: fx })); }, FX);
  await pg.reload(); await click('새 게임'); await click('모험 시작');
  await pg.waitForSelector('.prologue.on', { timeout: 60000 }).then(() => click('건너뛰기')).catch(() => {});
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.player.body && G.player.body.md, null, { timeout: 300000 });
  await pg.waitForFunction(() => G.skillFx && G.skillFx.ds, null, { timeout: 120000 });
  await ev(async ([z, g, ids, lv]) => {
    G.frame = () => {}; const c = G.render.cam; c.zoom = z; c.updateProjectionMatrix();
    document.querySelectorAll('.hud,.controls,.toasts,.qhud,.qh-reopen').forEach(e => e.style.display = 'none');
    if (G.reward) { G.reward.jobChange = sw => sw && sw(); G.reward.levelUp = () => {}; }
    G.dev.level(50); G.sheet.p.gender = g; G.dev.job('hairdresser'); G.dev.job('designer'); G.sheet.bag.add('w_scissors_1', 1); G.sheet.p.weapon = 'w_scissors_1';
    const bk = G.sheet.book; bk.sk.points += 99; for (const id of ids) for (let i = 0; i < lv; i++) if (!bk.learnBlock(id)) bk.learn(id);
    G.sheet.recalc(); G.dev.full(); G.input.block = true;
    await G.player.attachBody(); G.player.body.place(G.player.pos); G.player.body.play('idle', 1, true);
    { const R = G.render.r, o = R.render.bind(R); R.render = (sc, c) => { if (!window.__noDraw) o(sc, c); }; }
    const p = G.player; let spot = null; const cx = p.pos.x, cz = p.pos.z;
    for (let r = 0; r <= 20 && !spot; r++) for (let k = 0; k < Math.max(1, r * 6) && !spot; k++) { const a = k / Math.max(1, r * 6) * 6.283, c = { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r }; let ok = true;
      for (let x = -8; x <= 8 && ok; x += 0.75) for (let z = -8; z <= 8 && ok; z += 0.75) if (x * x + z * z <= 64 && G.zone.geo.blocked(c.x + x, c.z + z, 0.35)) ok = false; if (ok) spot = c; }
    window.__spot = spot || { x: cx, z: cz };
  }, [ZOOM, G_, Object.values(SK), LV]);
  await pg.waitForFunction(() => G.skillFx.ds.ready && G.player.body && G.player.body.md, null, { timeout: 120000 });
  await pg.waitForTimeout(1500);
  for (const SKILL of LIST) { const P = PLAN[SKILL], ID = SK[SKILL]; errs.length = 0;
    const name = `${TAG}_${SKILL}_lv${LV}_${G_}_${SIZE}_fx${FX ? 1 : 0}`, dirOut = `${OUT}/${name}`; fs.rmSync(dirOut, { recursive: true, force: true }); fs.mkdirSync(dirOut, { recursive: true });
    await ev(([dir, dist, skill]) => {
      const p = G.player, a = dir * Math.PI / 180, f = { x: Math.sin(a), z: Math.cos(a) };
      for (const m of [...G.zone.actors]) if (m !== p && m.remove && !m.isSummon) m.remove();
      G.player.skills2.clearTemp(); G.skillFx.clear(); p.teleport(window.__spot); p.body.place(p.pos); p.setFacing(f.x, f.z); p.target = null; p.lockOn = null; p.path = [];
      p.skills2.cd = {}; p.skills.lock = 0; G.dev.full(); for (const s of p.status.list.slice()) p.status.remove(s.def.id); p.shield = 0;
      const side = (d, s) => ({ x: p.pos.x + f.x * d - f.z * s, z: p.pos.z + f.z * d + f.x * s }); window.__f = f; window.__side = side;
      const spots = { drape: [side(dist, 0), side(dist + 0.9, 1.2), side(dist - 0.5, -1.3)], break: [side(dist, 0)], stitch: [side(dist, 0), side(dist + 1, 1)], cross: [side(1.7, 0), side(2.9, 1.2)],
        finale: [side(2.5, 0), side(4, 2), side(4.5, -1.8), side(5.5, 0.4)], road: [side(1.8, 0.2), side(3.6, -0.3)], pirouette: [side(2.0, 0), side(-1.2, 1.8)], mirror: [side(3.5, 0.5)],
        muse: [side(dist, 0)], collection: [side(2.5, 0), side(4.5, 0.6), side(6, -0.4)] }[skill] || [];
      window.__ds = spots.map(s => { const m = G.dev.dummies('mon_boar', 1, 0.01, s)[0]; m.teleport(s); m.__spot = s; return m; });
    }, [DIR, P.d, SKILL]);
    await pg.waitForFunction(() => window.__ds.every(m => m.body), null, { timeout: 120000 });
    const info = await ev(([fps, id, dist, skill, det]) => {
      let seed = 12345; Math.random = det ? () => 0.5 : () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      const p = G.player, f = window.__f, m = window.__ds[0], kit = p.skills2.ds;
      for (const q of window.__ds) { q.thinkStep = () => {}; q.teleport(q.__spot); q.setFacing(-f.x, -f.z); q.body.place(q.pos); q.hp = q.maxHp = 1e7; q.level = 1; }
      if (p.body.setArmed) { p.body.setArmed(true); p.calmT = 0; }
      for (let i = 0; i < 8; i++) G.step(1 / fps, false);
      p.teleport(window.__spot); p.setFacing(f.x, f.z); for (const q of window.__ds) { q.knock = { x: 0, z: 0 }; q.teleport(q.__spot); q.__hp = q.hp; }
      G.render.setFocus({ x: p.pos.x + f.x * dist * 0.5, y: 0, z: p.pos.z + f.z * dist * 0.5 }, true);
      const L = window.__log = { fx: [], sfx: [], dmg: [], freezeP: 0, freezeT: 0, gstop: 0, cam: [], status: [], marks: [], pos: [] };
      window.__t = 0;
      const S = G.skillFx.ds;
      for (const k of ['mark', 'drape', 'wrap', 'break', 'stitch', 'cross', 'finalePre', 'road', 'pirouette', 'mannequin', 'muse', 'runwayPre', 'restitch', 'fit', 'unfit', 'made']) if (S[k] && !S['__w' + k]) { S['__w' + k] = true; const o = S[k].bind(S); S[k] = (a, opt) => { const h = o(a, opt); window.__log.fx.push({ k, t: +window.__t.toFixed(3), ok: !!h }); if (h) for (const mm of Object.keys(h)) if (typeof h[mm] === 'function' && !['update', 'dispose'].includes(mm)) { const f0 = h[mm]; h[mm] = (...x) => { window.__log.fx.push({ k: k + '.' + mm, t: +window.__t.toFixed(3) }); return f0(...x); }; } return h; }; }
      if (!G.audio.__w) { G.audio.__w = true; const os = G.audio.sfx.bind(G.audio); G.audio.sfx = (n, o) => { window.__log.sfx.push({ n, t: +window.__t.toFixed(3) }); return os(n, o); }; }
      p.target = m || null; window.__sp0 = p.sp;
      if (skill === 'break' && m) { kit.addMark(m, {}); kit.addMark(m, {}); kit.h.applyStatus(m, { id: 'root', dur: 4, val: 1, ch: 1 }, p); }
      if (skill === 'finale') { for (const q of window.__ds.slice(0, 2)) { kit.addMark(q, {}); kit.addMark(q, {}); } }
      if (skill === 'restitch') { kit.h.applyStatus(p, { id: 'bleed', dur: 5, val: 0.05, ch: 1 }, p); }
      if (skill === 'fit') { G.sheet.bag.add('a_outfit_c', 1); G.sheet.p.crafted.a_outfit_c = { by: G.sheet.p.name, recipe: 'r_outfit' }; kit.fitOn = false; G.sheet.bag.equip ? G.sheet.bag.equip('a_outfit_c') : (G.sheet.p.armor = 'a_outfit_c'); G.sheet.recalc(); return { fit: kit.fitActive(), def: p.stat('def') }; }
      if (['outfit', 'emb', 'ribbon'].includes(skill)) { const rc = { outfit: { skill: 'ds_c1' }, emb: { skill: 'ds_c2' }, ribbon: { skill: 'ds_c3' } }[skill], out = { id: { outfit: 'a_outfit_c', emb: 't_emb_atk', ribbon: 'ac_ribbon' }[skill] }; kit.made(rc, out, 2); return { made: skill }; }
      const aim = ['pirouette', 'mirror', 'finale', 'collection', 'restitch', 'road', 'cross'].includes(skill) ? window.__side(dist, 0) : window.__side(dist, 0);
      G.sheet.book.sk.slots = [id, '', '', '']; const e = p.skills2.cast(id, aim); if (e) return 'cast error: ' + e;
      return { atk: p.stat('atk'), lv: p.skills2.lvl(id) };
    }, [FPS, ID, P.d, SKILL, !!process.env.DET]);
    if (typeof info === 'string') { console.log(SKILL, info); continue; }
    const frames = [], total = Math.round(P.dur * FPS); let dc = 0;
    for (let i = 0; i < total; i++) {
      const shot = P.m.some(m => i === Math.round(m * FPS));
      const c = await ev(([i, fps, skill, dist, shot]) => {
        window.__t = i / fps; window.__noDraw = !shot; const p = G.player, f = window.__f, L = window.__log, kit = p.skills2.ds;
        if (skill === 'mirror' && i === Math.round(0.6 * fps)) { const q = window.__ds[0]; L.mirror = { target: q && q.player ? (q.player.isSummon ? 'mannequin' : 'player') : null }; }
        if (skill === 'mirror' && i === Math.round(1.3 * fps)) { const s = p.skills2.summons.find(x => !x.dead); if (s) s.takeDamage({ amount: s.maxHp + 5 }); }
        G.step(1 / fps, true);
        window.__ds.forEach((q, qi) => { if (!q.removed && q.hp < q.__hp) { L.dmg.push({ t: +window.__t.toFixed(3), a: Math.round(q.__hp - q.hp), i: qi }); q.__hp = q.hp; } });
        if ((p.freezeT || 0) > 0) L.freezeP++; if (window.__ds.some(q => q.freezeT > 0)) L.freezeT++; if (G.hitStopT > 0) L.gstop++;
        if (i % 6 === 0) { L.status.push([+window.__t.toFixed(2), window.__ds.map(q => q.removed ? 'x' : q.status.list.map(s => s.def.id).join('+') + '#' + kit.marks(q)).join(' | ')]); L.pos.push([+window.__t.toFixed(2), +p.pos.x.toFixed(2), +p.pos.z.toFixed(2), p.shield | 0]); }
        const cp = G.render.cam.position, fu = G.render.focusU, rel = { x: cp.x - fu.x, y: cp.y - fu.y, z: cp.z + fu.z }; if (!window.__c0) window.__c0 = rel;
        L.cam.push(+Math.hypot(rel.x - window.__c0.x, rel.y - window.__c0.y, rel.z - window.__c0.z).toFixed(4));
        const s = G.render.toScreen({ x: p.pos.x + f.x * dist * 0.5, y: p.pos.y + 1.0, z: p.pos.z + f.z * dist * 0.5 });
        return [s.x, s.y, G.render.r ? G.render.r.info.render.calls : -1];
      }, [i, FPS, SKILL, P.d, shot]);
      const CW = Math.min(VW, 640), CH = Math.min(VH, 500), fn = `${dirOut}/${String(i).padStart(3, '0')}.png`;
      if (shot) await pg.screenshot({ path: fn, clip: { x: Math.max(0, Math.min(VW - CW, Math.round(c[0] - CW / 2))), y: Math.max(0, Math.min(VH - CH, Math.round(c[1] - CH / 2))), width: CW, height: CH }, timeout: 300000 });
      frames.push(shot ? fn : null); dc = Math.max(dc, c[2]);
    }
    const late = await ev(() => { window.__noDraw = true; for (let i = 0; i < 300; i++) G.step(1 / 30, true); window.__noDraw = false; const k = G.player.skills2.ds; return { fxLive: G.skillFx.ds.live.length, kitLive: k.live.length, timers: k.timers.length, marked: k.marked.size, summons: G.player.skills2.summons.filter(s => !s.dead).length }; });
    const res = await ev(() => { const L = window.__log, p = G.player; return { fx: L.fx, sfx: L.sfx.map(s => s.n + '@' + s.t), dmg: L.dmg, hits: L.dmg.length, total: L.dmg.reduce((s, d) => s + d.a, 0), status: L.status, pos: L.pos, mirror: L.mirror, freezeP: L.freezeP, freezeT: L.freezeT, globalHitStop: L.gstop, camMax: Math.max(...L.cam), shield: p.shield, buffs: p.status.list.map(s => s.def.id).join(' '), spUsed: +(window.__sp0 - p.sp).toFixed(1), log: G.player.skills2.ds.log }; });
    res.info = info; res.late = late; res.drawCallsMax = dc; res.errors = errs.slice(0, 8);
    const pick = P.m.map(m => frames[Math.round(m * FPS)] || '');
    fs.writeFileSync('/tmp/_dsstrip.py', `from PIL import Image, ImageDraw\nfr=${JSON.stringify(pick)}\nlab=${JSON.stringify(P.m)}\nims=[Image.open(f) if f else None for f in fr]\nw,h=next(i for i in ims if i).size\nims=[i or Image.new('RGB',(w,h),(0,0,0)) for i in ims]\nims=[i.resize((w*2//3,h*2//3)) for i in ims]\nw,h=ims[0].size\nn=len(ims); cols=4 if n>4 else n; rows=(n+cols-1)//cols\nsh=Image.new('RGB',(w*cols,(h+22)*rows),(20,20,28))\nd=ImageDraw.Draw(sh)\nfor i,(im,l) in enumerate(zip(ims,lab)):\n  x=(i%cols)*w; y=(i//cols)*(h+22)\n  sh.paste(im,(x,y+22)); d.text((x+6,y+4),('${SKILL} t %.2fs'%l),fill=(255,255,255))\nsh.save('${OUT}/${name}.png')`);
    try { execSync('python3 /tmp/_dsstrip.py'); } catch (e) { console.log('strip failed', e.message); }
    fs.rmSync(dirOut, { recursive: true, force: true });
    console.log(name, JSON.stringify({ hits: res.hits, total: res.total, late, errors: res.errors, gstop: res.globalHitStop, camMax: res.camMax, info, log: res.log, mirror: res.mirror }));
    fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify(res, null, 1));
  }
  await b.close();
})();
