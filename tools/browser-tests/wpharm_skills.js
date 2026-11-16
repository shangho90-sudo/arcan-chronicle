// 양약사 2차 스킬을 실제 스킬 경로(skills2.cast → 동작 → js/wpharm.js 규칙 → js/wpharmfx.js)로 시전하고, 화면 띠와 수치를 남김.
// G.step(1/FPS) 한 프레임씩. 찍지 않는 프레임은 GPU 그리기를 건너뜀(SwiftShader가 느린 부분).
// Usage: SCENES=a1,a1kill,a2,a3,a4,a5,b1,b2,b3,b5,boss,c3,c4,c5,craft,regen,marks LV=5 GENDER=f SIZE=1100x760|390x844t FX=1|0 DET=1 TAG=after
//        URL=http://localhost:8817/index.html OUT=/tmp/wpharm node tools/browser-tests/wpharm_skills.js
//   -> OUT/<TAG>_<scene>_<gender>_<size>_fx<FX>.png (띠) + .json (피해 틱 시각·양, fx 호출 시각, 소리, 카메라 kick, 전역 정지, 표식 수, 남은 이펙트, 오류)
const { chromium } = require('playwright'); const fs = require('fs'); const { execSync } = require('child_process');
const LIST = (process.env.SCENES || 'a1').split(','), LV = +(process.env.LV || 5), FPS = +(process.env.FPS || 60), G_ = process.env.GENDER || 'f';
const SIZE = process.env.SIZE || '1100x760', TOUCH = SIZE.endsWith('t'), [VW, VH] = SIZE.replace('t', '').split('x').map(Number);
const CW = Math.min(VW, TOUCH ? 390 : 760), CH = Math.min(VH, TOUCH ? 600 : 520);
const FX = process.env.FX !== '0', TAG = process.env.TAG || 'after', OUT = process.env.OUT || '/tmp/wpharm', ZOOM = +(process.env.ZOOM || 1.0);
// scene: skill, enemies [forward m, side m, marks, flags], duration, frame marks (s)
const SC = {
  a1: { id: 'wp_a1', foes: [[5, 0]], dur: 1.6, marks: [0.1, 0.22, 0.4, 0.55, 0.65, 0.78, 0.86, 0.95, 1.05, 1.15, 1.3, 1.5] },
  a1kill: { id: 'wp_a1', foes: [[5, 0, 0, 'weak'], [5.8, 1.6]], dur: 1.6, marks: [0.3, 0.6, 0.75, 0.85, 0.95, 1.05, 1.15, 1.4] },
  a2: { id: 'wp_a2', aim: 4.5, foes: [[4.5, 0, 0, 'slow'], [5.3, 1.1], [3.8, -1.3]], dur: 1.9, marks: [0.1, 0.3, 0.5, 0.65, 0.75, 0.9, 1.05, 1.15, 1.22, 1.3, 1.45, 1.7] },
  a3: { id: 'wp_a3', foes: [[2.5, 0], [5, 0.3], [7.5, -0.2], [4, 3]], dur: 1.0, marks: [0.05, 0.15, 0.25, 0.35, 0.45, 0.5, 0.53, 0.56, 0.62, 0.7, 0.8, 0.95] },
  a4: { id: 'wp_a4', foes: [[5, 0]], dur: 1.6, marks: [0.1, 0.25, 0.4, 0.55, 0.62, 0.68, 0.84, 0.9, 1.01, 1.08, 1.2, 1.4] },
  a5: { id: 'wp_a5', aim: 5, foes: [[5, 0], [6.5, 1.5], [4, -2], [5.5, -1]], dur: 2.0, marks: [0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 0.95, 1.05, 1.12, 1.17, 1.22, 1.3, 1.45, 1.7] },
  b1: { id: 'wp_b1', then: 'wp_a3', foes: [[4, 0]], dur: 1.6, marks: [0.1, 0.25, 0.4, 0.6, 0.75, 0.9, 1.0, 1.1, 1.3, 1.5] },
  b2: { id: 'wp_b2', foes: [[5, 0]], dur: 1.2, marks: [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.7, 0.9, 1.1] },
  b3: { id: 'wp_b3', foes: [[4, 0, 3], [6.5, 2, 2], [8, -1, 1], [5, -3.5, 0], [10, 1.5, 2]], dur: 2.0, marks: [0.05, 0.2, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 1.0, 1.2, 1.5, 1.9] },
  b5: { id: 'wp_b5', foes: [[3, 0, 3], [2, 2.5, 3], [-2, 3, 2], [1, -3, 3], [4.5, 2, 1]], dur: 2.0, marks: [0.1, 0.25, 0.35, 0.5, 0.7, 0.9, 1.05, 1.15, 1.2, 1.25, 1.35, 1.6] },
  boss: { id: 'wp_b3', pre: 'wp_a1', foes: [[4, 0, 0, 'boss']], dur: 2.8, marks: [0.3, 0.6, 0.9, 1.2, 1.5, 1.7, 1.9, 2.1, 2.4, 2.7] },
  c3: { id: 'wp_c3', foes: [], dur: 3.3, marks: [0.1, 0.25, 0.4, 0.6, 1.0, 1.25, 1.35, 2.0, 2.3, 3.2] },
  c4: { id: 'wp_c4', foes: [[1.8, 0]], dur: 2.0, marks: [0.1, 0.2, 0.3, 0.45, 0.6, 0.62, 0.9, 1.2, 1.22, 1.5, 1.8, 1.82] },
  c5: { id: null, foes: [[1.6, 0]], dur: 1.6, marks: [0.0, 0.06, 0.12, 0.2, 0.3, 0.45, 0.6, 0.8, 1.0, 1.3, 1.5] },
  craft: { id: null, foes: [], dur: 3.2, marks: [0.1, 0.3, 0.5, 0.7, 0.85, 1.2, 1.7, 1.9, 2.2, 2.4, 2.6, 3.0] },
  regen: { id: null, foes: [], dur: 4.2, marks: [0.1, 0.5, 1.05, 1.5, 2.05, 2.6, 3.05, 4.1] },
  marks: { id: null, foes: [[3, -2, 1], [3, 0, 2], [3, 2, 3]], dur: 0.6, marks: [0.3, 0.55] },
};
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: VW, height: VH }, hasTouch: TOUCH, isMobile: TOUCH })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error' || /wpharmfx|fx wp/.test(m.text())) errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(process.env.URL || 'http://localhost:8817/index.html');
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(fx => { localStorage.clear(); localStorage.setItem('arcan_settings', JSON.stringify({ graphicsFx: fx })); }, FX);
  await pg.reload(); await click('새 게임'); await click('모험 시작');
  await pg.waitForSelector('.prologue.on', { timeout: 60000 }).then(() => click('건너뛰기')).catch(() => {});
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.player.body && G.player.body.md, null, { timeout: 300000 });
  await pg.waitForFunction(() => G.skillFx && G.skillFx.wp, null, { timeout: 120000 });
  await ev(async ([z, g, lv, plates]) => {
    G.frame = () => {}; const c = G.render.cam; c.zoom = z; c.updateProjectionMatrix();
    document.querySelectorAll('.hud,.controls,.toasts,.qhud,.qh-reopen' + (plates ? '' : ',.plates')).forEach(e => e.style.display = 'none');
    if (G.reward) { G.reward.jobChange = sw => sw && sw(); G.reward.levelUp = () => {}; }
    G.dev.level(45); G.sheet.p.gender = g; G.dev.job('pharmacist'); G.dev.job('western_pharmacist');
    const bk = G.sheet.book; bk.sk.points += 999; for (const d of G.data.skillsOf('western_pharmacist')) for (let i = 0; i < lv; i++) if (!bk.learnBlock(d.id)) bk.learn(d.id);
    G.sheet.bag.add('w_pestle_g1', 1); G.sheet.p.weapon = 'w_pestle_g1'; G.sheet.recalc(); G.dev.full(); G.input.block = true;
    await G.player.attachBody(); G.player.body.place(G.player.pos); G.player.body.play('idle', 1, true);
    { const R = G.render.r, o = R.render.bind(R); R.render = (sc, c) => { if (!window.__noDraw) o(sc, c); }; }
    const p = G.player; let spot = null; const cx = p.pos.x, cz = p.pos.z;
    for (let r = 0; r <= 20 && !spot; r++) for (let k = 0; k < Math.max(1, r * 6) && !spot; k++) { const a = k / Math.max(1, r * 6) * 6.283, c = { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r }; let ok = true;
      for (let x = -10; x <= 10 && ok; x += 0.75) for (let z = -10; z <= 10 && ok; z += 0.75) if (x * x + z * z <= 100 && G.zone.geo.blocked(c.x + x, c.z + z, 0.35)) ok = false; if (ok) spot = c; }
    window.__spot = spot || { x: cx, z: cz };
    // logging wrappers (once)
    const W = G.skillFx.wp; window.__L = null; const T = () => +window.__t.toFixed(3);
    for (const k of ['capsule', 'cryo', 'ion', 'triad', 'collapse', 'catalyst', 'carrier', 'chain', 'zone', 'critical', 'spray', 'coat', 'lastrx', 'made', 'regen', 'mark']) { if (typeof W[k] !== 'function') { console.error('wpfx missing ' + k + ' ' + typeof W[k]); continue; } const o = W[k].bind(W); W[k] = (a, opt) => { const h = o(a, opt); if (window.__L) window.__L.fx.push({ k, t: T(), ok: !!h });
      if (h) for (const m of Object.keys(h)) if (typeof h[m] === 'function' && !['update', 'dispose'].includes(m)) { const f0 = h[m]; h[m] = (...x) => { if (window.__L && k !== 'mark' && k !== 'zone') window.__L.fx.push({ k: k + '.' + m, t: T() }); return f0(...x); }; }
      return h; }; }
    const os = G.audio.sfx.bind(G.audio); G.audio.sfx = (n, o) => { if (window.__L) window.__L.sfx.push({ n, t: T() }); return os(n, o); };
    const ok_ = G.render.kick ? G.render.kick.bind(G.render) : null; if (ok_) G.render.kick = (...a) => { if (window.__L) window.__L.kick.push(T()); return ok_(...a); };
    const osh = G.render.addShake ? G.render.addShake.bind(G.render) : null; if (osh) G.render.addShake = (...a) => { if (window.__L) window.__L.shake.push(T()); return osh(...a); };
  }, [ZOOM, G_, LV, !!process.env.PLATES]);
  await pg.waitForFunction(() => G.skillFx.wp.ready && G.player.body && G.player.body.md, null, { timeout: 120000 });
  await pg.waitForTimeout(1200);
  for (const name0 of LIST) { const S = SC[name0]; if (!S) { console.log('no scene', name0); continue; } errs.length = 0;
    const name = `${TAG}_${name0}_${G_}_${SIZE}_fx${FX ? 1 : 0}`, dirOut = `${OUT}/${name}`; fs.rmSync(dirOut, { recursive: true, force: true }); fs.mkdirSync(dirOut, { recursive: true });
    await ev(([foes]) => {
      const p = G.player, f = { x: 1, z: 0 };   // 화면 오른쪽 위로
      for (const m of [...G.zone.actors]) if (m !== p && m.def && m.body) m.remove && m.remove();
      G.skillFx.clear(); p.skills2.clearTemp(); p.teleport(window.__spot); p.body.place(p.pos); p.setFacing(f.x, f.z); p.target = null; p.lockOn = null; p.path = []; G.dev.full();
      for (const s of p.status.list.slice()) p.status.remove(s.def.id); p.shield = 0; p.skills2.cd = {}; p.skills.lock = 0;
      const side = (d, s) => ({ x: p.pos.x + f.x * d - f.z * s, z: p.pos.z + f.z * d + f.x * s }); window.__f = f; window.__side = side;
      window.__ds = foes.map(([d, s, , fl]) => { const at = side(d, s), m = G.dev.dummies(fl === 'boss' ? 'mon_golem' : 'mon_boar', 1, 0.01, at)[0]; m.teleport(at); m.__spot = at; return m; });
    }, [S.foes]);
    await pg.waitForFunction(() => window.__ds.every(m => m.body), null, { timeout: 120000 });
    const info = await ev(([S, fps, det]) => {
      if (det) Math.random = () => 0.5;
      const p = G.player, f = window.__f, k = p.skills2.wp;
      window.__ds.forEach((q, i) => { q.thinkStep = () => {}; q.teleport(q.__spot); q.setFacing(-f.x, -f.z); q.body.place(q.pos); const fl = S.foes[i][3];
        if (fl === 'boss') { q.isBoss = true; } if (fl === 'slow') q.status.apply(G.data.status('slow'), 4, 0.3); if (fl === 'weak') q.hp = 40; });
      if (p.body.setArmed) { p.body.setArmed(true); p.calmT = 0; }
      for (let i = 0; i < 10; i++) G.step(1 / fps, false);
      p.teleport(window.__spot); p.setFacing(f.x, f.z); window.__ds.forEach((q, i) => { q.knock = { x: 0, z: 0 }; q.teleport(q.__spot); q.__hp = q.hp; const n = S.foes[i][2] || 0; for (let j = 0; j < n; j++) k.mark(q, {}); });
      const fd = S.aim || 4; G.render.setFocus({ x: p.pos.x + f.x * fd * 0.55, y: 0, z: p.pos.z + f.z * fd * 0.55 }, true);
      window.__L = { fx: [], sfx: [], dmg: [], kick: [], shake: [], gstop: [], marks: [], lock: [] }; window.__t = 0; window.__S = S;
      p.target = window.__ds[0] || null;
      const aim = S.aim ? window.__side(S.aim, 0) : window.__ds[0] ? { ...window.__ds[0].pos } : null;
      { const bk = G.sheet.book; bk.sk.slots = ['', '', '', '']; [S.id, S.pre, S.then].filter(Boolean).forEach((id, i) => bk.equip(id, i, false)); }
      if (S.pre) { const e = p.skills2.cast(S.pre, aim); window.__L.pre = e || 'ok'; window.__castAt = Math.round(1.1 * fps); }
      else if (S.id) { const e = p.skills2.cast(S.id, aim); if (e) return 'cast error ' + e; }
      return { lv: S.id && p.skills2.lvl(S.id), atk: p.stat('atk'), mult: S.id && p.skills2.mult(G.data.skill2(S.id)), hp0: window.__ds.map(q => q.hp) };
    }, [S, FPS, !!process.env.DET]);
    if (typeof info === 'string') { console.log(name0, info); continue; }
    const frames = [], total = Math.round(S.dur * FPS);
    for (let i = 0; i < total; i++) {
      const shot = S.marks.some(m => i === Math.round(m * FPS));
      const sc = await ev(([i, fps, shot, nm]) => {
        window.__t = i / fps; window.__noDraw = !shot; const p = G.player, L = window.__L, S = window.__S;
        if (S.pre && i === window.__castAt) { p.skills2.cd = {}; p.skills.lock = 0; p.sp = p.maxSp; L.cast = p.skills2.cast(S.id, null) || 'ok'; }
        if (S.then && i === Math.round(0.6 * fps)) { p.skills2.cd = {}; p.skills.lock = 0; L.then = p.skills2.cast(S.then, null) || 'ok'; }
        if (nm === 'c4' && [36, 72, 108].includes(i)) { const h0 = p.hp, s0 = p.shield; p.takeDamage({ source: window.__ds[0], amount: Math.round(p.maxHp * 0.22), noMiss: true }); L.dmg.push({ t: window.__t, taken: Math.round(h0 - p.hp), shield: Math.round(s0) + '->' + Math.round(p.shield) }); }
        if (nm === 'c3' && i === 0) { p.hp = Math.round(p.maxHp * 0.3); window.__hp0 = p.hp; }
        if (nm === 'c5' && (i === 0 || i === 1)) { const h0 = p.hp; p.takeDamage({ source: window.__ds[0], amount: p.maxHp * 3, noMiss: true }); p.takeDamage({ source: window.__ds[0], amount: p.maxHp * 3, noMiss: true }); L.dmg.push({ t: window.__t, hpBefore: Math.round(h0), hp: Math.round(p.hp), shield: Math.round(p.shield), dead: !!p.dead, icd: +p.skills2.wp.icdLeft().toFixed(1), status: document.getElementById('hStatus') && document.getElementById('hStatus').textContent }); }
        if (nm === 'craft' && i === 1) { G.skillFx.wp.made(p, { kind: 'vial' }); }
        if (nm === 'craft' && i === Math.round(1.6 * fps)) { G.skillFx.wp.made(p, { kind: 'capsule' }); }
        if (nm === 'regen' && i === 1) { G.sheet.bag.add('c_regen_hp', 1); p.potionCd = 0; p.hp = Math.round(p.maxHp * 0.4); L.used = p.useItem('c_regen_hp'); }
        G.step(1 / fps, true);
        window.__ds.forEach((q, qi) => { if (!q.removed && q.hp < q.__hp) { L.dmg.push({ t: +window.__t.toFixed(3), a: Math.round(q.__hp - q.hp), i: qi, dead: !!q.dead }); q.__hp = q.hp; } });
        if (G.hitStopT > 0) L.gstop.push(+window.__t.toFixed(3));
        if (i % 6 === 0) L.marks.push([+window.__t.toFixed(2), ...window.__ds.map(q => q._marks ? q._marks.reaction : 0)]);
        if (nm === 'regen' && i % 30 === 0) L.marks.push(['hp', +window.__t.toFixed(2), Math.round(p.hp), (p.status.get('regen') || {}).remaining]);
        if (nm === 'c3' && i % 30 === 0) L.marks.push(['hp', +window.__t.toFixed(2), Math.round(p.hp)]);
        const fd = (S.aim || (S.foes[0] ? S.foes[0][0] : 0)) * 0.5, sc = G.render.toScreen({ x: p.pos.x + window.__f.x * fd, y: p.pos.y + (S.id === 'wp_a5' ? 2.4 : S.id === 'wp_b5' ? 1.6 : 1.0), z: p.pos.z + window.__f.z * fd }); return [sc.x, sc.y];
      }, [i, FPS, shot, name0]);
      if (shot) { const fn = `${dirOut}/${String(i).padStart(3, '0')}.png`; const nc = !!process.env.NOCROP; await pg.screenshot({ path: fn, timeout: 300000, ...(nc ? {} : { clip: { x: Math.max(0, Math.min(VW - CW, Math.round(sc[0] - CW / 2))), y: Math.max(0, Math.min(VH - CH, Math.round(sc[1] - CH / 2))), width: CW, height: CH } }) }); frames.push([fn, i / FPS]); }
    }
    const late = await ev(() => { window.__noDraw = true; for (let i = 0; i < 300; i++) G.step(1 / 30, true); window.__noDraw = false; const k = G.player.skills2.wp; return { liveAfter10s: G.skillFx.wp.live.length, zones: k.zones.length, carrier: !!k.carrier, cat: !!k.cat, things: G.player.skills2.things.length, pending: G.player.skills2.pending.length }; });
    const res = await ev(() => { const L = window.__L; return { cast: L.cast, then: L.then, pre: L.pre, used: L.used, fx: L.fx, sfx: L.sfx, dmg: L.dmg, kick: L.kick, shake: L.shake, gstop: L.gstop.length, marks: L.marks, total: L.dmg.reduce((s, d) => s + (d.a || 0), 0) }; });
    res.info = info; res.late = late; res.errors = errs.slice(0, 8);
    // strip: crop around the action (centre of the screen), 2 rows
    const cw = Math.min(VW, TOUCH ? 390 : 860), chh = Math.min(VH, TOUCH ? 640 : 600);
    fs.writeFileSync('/tmp/_wpstrip.py', `from PIL import Image, ImageDraw\nfr=${JSON.stringify(frames)}\nims=[Image.open(f).convert('RGB') for f,_ in fr]\nW,H=ims[0].size; cw,ch=${cw},${chh}\nx0=0;cw=W;ch=H; y0=0\nif ${process.env.NOCROP ? 1 : 0}: x0,y0,cw,ch=0,0,W,H\nims=[i.crop((x0,y0,x0+cw,y0+ch)) for i in ims]\nn=len(ims); cols=(n+1)//2 if n>6 else n; rows=(n+cols-1)//cols\ns=0.6 if cols>4 else 1.0\nims=[i.resize((int(cw*s),int(ch*s))) for i in ims]; w,h=ims[0].size\nsh=Image.new('RGB',(w*cols,(h+20)*rows),(20,20,28)); d=ImageDraw.Draw(sh)\nfor k,(im,(_,t)) in enumerate(zip(ims,fr)):\n  x=(k%cols)*w; y=(k//cols)*(h+20); sh.paste(im,(x,y+20)); d.text((x+6,y+4),'t %.2fs'%t,fill=(255,255,255))\nsh.save('${OUT}/${name}.png')`);
    try { execSync('python3 /tmp/_wpstrip.py'); fs.rmSync(dirOut, { recursive: true, force: true }); } catch (e) { console.log('strip failed', e.message); }
    fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify(res, null, 1));
    console.log(name, JSON.stringify({ total: res.total, hits: res.dmg.length, kick: res.kick, shake: res.shake, gstop: res.gstop, late, errors: res.errors, info }));
  }
  await b.close();
})();
