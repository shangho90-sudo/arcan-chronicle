// 엔지니어 2차 스킬을 실제 스킬 경로(skills2.cast → 동작 → js/engineer.js 규칙 → js/engfx.js)로 시전하고, 화면 띠와 수치를 남김.
// G.step(1/FPS) 한 프레임씩. 찍지 않는 프레임은 GPU 그리기를 건너뜀(SwiftShader가 느린 부분).
// Usage: SCENES=a1,a2,a3,a4,a5,b1,b2,b3,b4,b5,c3,c5,craft LV=5 GENDER=m SIZE=1100x760|390x844t FX=1|0 DET=1 TAG=after
//        URL=http://localhost:8841/index.html OUT=/tmp/engineer node tools/browser-tests/engineer_skills.js
//   -> OUT/<TAG>_<scene>_<gender>_<size>_fx<FX>.png (띠) + .json (피해 틱 시각·양, fx 호출 시각, 소리, 카메라 kick, 전역 정지, 남은 이펙트·병기, 오류)
const { chromium } = require('playwright'); const fs = require('fs'); const { execSync } = require('child_process');
const LIST = (process.env.SCENES || 'a1').split(','), LV = +(process.env.LV || 5), FPS = +(process.env.FPS || 60), G_ = process.env.GENDER || 'm';
const SIZE = process.env.SIZE || '1100x760', TOUCH = SIZE.endsWith('t'), [VW, VH] = SIZE.replace('t', '').split('x').map(Number);
const CW = Math.min(VW, TOUCH ? 390 : 760), CH = Math.min(VH, TOUCH ? 600 : 520);
const FX = process.env.FX !== '0', TAG = process.env.TAG || 'after', OUT = process.env.OUT || '/tmp/engineer', ZOOM = +(process.env.ZOOM || 1.0);
// scene: skill, enemies [forward m, side m, -, flags], duration, frame marks (s); pre = cast first (then the main skill at 1.1 s)
const SC = {
  a1: { id: 'en_a1', aim: 2.5, foes: [[6, 0], [7, 1.6]], dur: 3.0, marks: [0.12, 0.3, 0.45, 0.6, 0.75, 0.95, 1.2, 1.6, 2.2, 2.9] },
  a2: { id: 'en_a2', aim: 3.5, foes: [[5.6, 0.3]], dur: 1.8, marks: [0.12, 0.3, 0.5, 0.65, 0.8, 0.95, 1.1, 1.2, 1.3, 1.45, 1.6] },
  a3: { id: 'en_a3', foes: [[5, 0.5]], dur: 4.2, marks: [0.15, 0.3, 0.45, 0.6, 0.8, 1.2, 1.8, 2.6, 3.4, 3.6, 3.8, 4.1] },
  a4: { id: 'en_a4', pre: 'en_a1', aim: 5, foes: [[5, 0.3], [5.4, 1.4], [9, 3]], dur: 3.4, marks: [0.5, 1.2, 1.35, 1.5, 1.65, 1.8, 2.0, 2.3, 2.7, 3.3] },
  a5: { id: 'en_a5', foes: [[6, 0], [7, 1.6], [5.5, -1.6]], dur: 6.4, marks: [0.1, 0.3, 0.5, 0.8, 1.1, 1.4, 1.7, 2.0, 2.6, 3.2, 3.9, 4.5, 5.6, 5.75, 6.2] },
  b1: { id: 'en_b1', foes: [[1.9, 0], [3.5, 0.1]], dur: 0.9, marks: [0.05, 0.12, 0.18, 0.24, 0.28, 0.31, 0.36, 0.45, 0.6, 0.8] },
  b2: { id: 'en_b2', foes: [[1.6, 0], [4, 1], [4.4, -1.2]], dur: 0.9, marks: [0.05, 0.15, 0.25, 0.3, 0.33, 0.38, 0.45, 0.6, 0.8] },
  b3: { id: 'en_b3', foes: [[7, 0.5]], dur: 2.4, marks: [0.1, 0.25, 0.35, 0.45, 0.6, 0.8, 1.0, 1.2, 1.4, 1.7, 2.2] },
  b4: { id: 'en_b4', foes: [[3, 0], [7, 0.3], [11, -0.3]], dur: 1.5, marks: [0.1, 0.3, 0.5, 0.7, 0.85, 0.89, 0.93, 1.0, 1.15, 1.4] },
  b5: { id: 'en_b5', aim: 5, foes: [[5, 0], [6, 1.6], [4.5, -1.6]], dur: 3.2, marks: [0.2, 0.5, 0.8, 1.1, 1.4, 1.46, 1.7, 1.96, 2.3, 2.45, 2.5, 2.7, 3.0] },
  c3: { id: 'en_c3', pre: 'en_a1', aim: 2, foes: [], dur: 3.6, marks: [0.6, 1.2, 1.35, 1.5, 1.7, 2.3, 2.5, 3.3] },
  c5: { id: 'en_c5', pre: 'en_a1', aim: 2.5, foes: [[6, 0]], dur: 3.2, marks: [0.8, 1.2, 1.4, 1.7, 2.0, 2.5, 3.1] },
  craft: { id: null, foes: [], dur: 3.4, marks: [0.1, 0.3, 0.5, 0.75, 1.0, 1.4, 1.8, 2.0, 2.3, 2.6, 3.2] },
};
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: VW, height: VH }, hasTouch: TOUCH, isMobile: TOUCH })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error' || /engfx|fx en/.test(m.text())) errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(process.env.URL || 'http://localhost:8817/index.html');
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(fx => { localStorage.clear(); localStorage.setItem('arcan_settings', JSON.stringify({ graphicsFx: fx })); }, FX);
  await pg.reload(); await click('새 게임'); await click('모험 시작');
  await pg.waitForSelector('.prologue.on', { timeout: 60000 }).then(() => click('건너뛰기')).catch(() => {});
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.player.body && G.player.body.md, null, { timeout: 300000 });
  await pg.waitForFunction(() => G.skillFx && G.skillFx.en, null, { timeout: 120000 });
  await ev(async ([z, g, lv, plates]) => {
    G.frame = () => {}; const c = G.render.cam; c.zoom = z; c.updateProjectionMatrix();
    document.querySelectorAll('.hud,.controls,.toasts,.qhud,.qh-reopen' + (plates ? '' : ',.plates')).forEach(e => e.style.display = 'none');
    if (G.reward) { G.reward.jobChange = sw => sw && sw(); G.reward.levelUp = () => {}; }
    G.dev.level(45); G.sheet.p.gender = g; G.dev.job('blacksmith'); G.dev.job('engineer');
    const bk = G.sheet.book; bk.sk.points += 999; for (const d of G.data.skillsOf('engineer')) for (let i = 0; i < lv; i++) if (!bk.learnBlock(d.id)) bk.learn(d.id);
    G.sheet.bag.add('w_hammer_1', 1); G.sheet.p.weapon = 'w_hammer_1'; G.sheet.recalc(); G.dev.full(); G.input.block = true;
    await G.player.attachBody(); G.player.body.place(G.player.pos); G.player.body.play('idle', 1, true);
    { const R = G.render.r, o = R.render.bind(R); R.render = (sc, c) => { if (!window.__noDraw) o(sc, c); }; }
    const p = G.player; let spot = null; const cx = p.pos.x, cz = p.pos.z;
    for (let r = 0; r <= 20 && !spot; r++) for (let k = 0; k < Math.max(1, r * 6) && !spot; k++) { const a = k / Math.max(1, r * 6) * 6.283, c = { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r }; let ok = true;
      for (let x = -10; x <= 10 && ok; x += 0.75) for (let z = -10; z <= 10 && ok; z += 0.75) if (x * x + z * z <= 100 && G.zone.geo.blocked(c.x + x, c.z + z, 0.35)) ok = false; if (ok) spot = c; }
    window.__spot = spot || { x: cx, z: cz };
    // logging wrappers (once)
    const W = G.skillFx.en; window.__L = null; const T = () => +window.__t.toFixed(3);
    for (const k of ['sentry', 'spider', 'drone', 'anchor', 'walker', 'focus', 'pile', 'breach', 'rail', 'pod', 'signal', 'orbital', 'beacon', 'core', 'redline', 'made', 'shock', 'blast', 'missile', 'shell']) { if (typeof W[k] !== 'function') { console.error('enfx missing ' + k + ' ' + typeof W[k]); continue; } const o = W[k].bind(W); W[k] = (a, opt) => { const h = o(a, opt); if (window.__L) window.__L.fx.push({ k, t: T(), ok: !!h });
      if (h) for (const m of Object.keys(h)) if (typeof h[m] === 'function' && !['update', 'dispose'].includes(m)) { const f0 = h[m]; h[m] = (...x) => { if (window.__L && k !== 'focus') window.__L.fx.push({ k: k + '.' + m, t: T() }); return f0(...x); }; }
      return h; }; }
    const os = G.audio.sfx.bind(G.audio); G.audio.sfx = (n, o) => { if (window.__L) window.__L.sfx.push({ n, t: T() }); return os(n, o); };
    const ok_ = G.render.kick ? G.render.kick.bind(G.render) : null; if (ok_) G.render.kick = (...a) => { if (window.__L) window.__L.kick.push(T()); return ok_(...a); };
    const osh = G.render.addShake ? G.render.addShake.bind(G.render) : null; if (osh) G.render.addShake = (...a) => { if (window.__L) window.__L.shake.push(T()); return osh(...a); };
  }, [ZOOM, G_, LV, !!process.env.PLATES]);
  await pg.waitForFunction(() => G.skillFx.en.ready && G.player.body && G.player.body.md, null, { timeout: 120000 });
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
      const p = G.player, f = window.__f;
      window.__ds.forEach((q, i) => { q.thinkStep = () => {}; q.teleport(q.__spot); q.setFacing(-f.x, -f.z); q.body.place(q.pos); const fl = S.foes[i][3];
        if (fl === 'boss') { q.isBoss = true; } if (fl === 'slow') q.status.apply(G.data.status('slow'), 4, 0.3); if (fl === 'weak') q.hp = 40; });
      if (p.body.setArmed) { p.body.setArmed(true); p.calmT = 0; }
      for (let i = 0; i < 10; i++) G.step(1 / fps, false);
      p.teleport(window.__spot); p.setFacing(f.x, f.z); window.__ds.forEach((q, i) => { q.knock = { x: 0, z: 0 }; q.teleport(q.__spot); q.__hp = q.hp; });
      const fd = S.aim || 4; G.render.setFocus({ x: p.pos.x + f.x * fd * 0.55, y: 0, z: p.pos.z + f.z * fd * 0.55 }, true);
      window.__L = { fx: [], sfx: [], dmg: [], kick: [], shake: [], gstop: [], marks: [], lock: [] }; window.__t = 0; window.__S = S;
      p.target = window.__ds[0] || null;
      const aim = S.aim ? window.__side(S.aim, 0) : window.__ds[0] ? { ...window.__ds[0].pos } : null;
      { const bk = G.sheet.book; bk.sk.slots = ['', '', '', '']; [S.id, S.pre, S.then].filter(Boolean).forEach((id, i) => bk.equip(id, i, false)); }
      p.skills2.res.power = 10; if (S.pre) { const e = p.skills2.cast(S.pre, S.aim ? window.__side(Math.min(2.5, S.aim), 0) : aim); window.__L.pre = e || 'ok'; window.__castAt = Math.round(1.1 * fps); }
      else if (S.id) { const e = p.skills2.cast(S.id, aim); if (e) return 'cast error ' + e; }
      return { lv: S.id && p.skills2.lvl(S.id), atk: p.stat('atk'), mult: S.id && p.skills2.mult(G.data.skill2(S.id)), hp0: window.__ds.map(q => q.hp) };
    }, [S, FPS, !!process.env.DET]);
    if (typeof info === 'string') { console.log(name0, info); continue; }
    const frames = [], total = Math.round(S.dur * FPS);
    for (let i = 0; i < total; i++) {
      const shot = S.marks.some(m => i === Math.round(m * FPS));
      const sc = await ev(([i, fps, shot, nm]) => {
        window.__t = i / fps; window.__noDraw = !shot; const p = G.player, L = window.__L, S = window.__S;
        if (S.pre && i === window.__castAt) { p.skills2.cd = {}; p.skills.lock = 0; p.sp = p.maxSp; L.cast = p.skills2.cast(S.id, S.aim ? window.__side(S.aim, 0) : null) || 'ok'; if (nm === 'c3') { const s = p.skills2.summons.find(x => !x.dead); if (s) s.hp = s.maxHp * 0.25; } }
        if (S.then && i === Math.round(0.6 * fps)) { p.skills2.cd = {}; p.skills.lock = 0; L.then = p.skills2.cast(S.then, null) || 'ok'; }
        if (false) { const h0 = p.hp, s0 = p.shield; p.takeDamage({ source: window.__ds[0], amount: Math.round(p.maxHp * 0.22), noMiss: true }); L.dmg.push({ t: window.__t, taken: Math.round(h0 - p.hp), shield: Math.round(s0) + '->' + Math.round(p.shield) }); }
        if (nm === 'c3' && i === 0) { p.hp = Math.round(p.maxHp * 0.3); window.__hp0 = p.hp; }
        if (false) { const h0 = p.hp; p.takeDamage({ source: window.__ds[0], amount: p.maxHp * 3, noMiss: true }); p.takeDamage({ source: window.__ds[0], amount: p.maxHp * 3, noMiss: true }); L.dmg.push({ t: window.__t, hpBefore: Math.round(h0), hp: Math.round(p.hp), shield: Math.round(p.shield), dead: !!p.dead, icd: +p.skills2.wp.icdLeft().toFixed(1), status: document.getElementById('hStatus') && document.getElementById('hStatus').textContent }); }
        if (nm === 'craft' && i === 1) { G.skillFx.en.made(p, { kind: 'gun' }); }
        if (nm === 'craft' && i === Math.round(1.7 * fps)) { G.skillFx.en.made(p, { kind: 'module' }); }
        if (false) { G.sheet.bag.add('c_regen_hp', 1); p.potionCd = 0; p.hp = Math.round(p.maxHp * 0.4); L.used = p.useItem('c_regen_hp'); }
        G.step(1 / fps, true);
        window.__ds.forEach((q, qi) => { if (!q.removed && q.hp < q.__hp) { L.dmg.push({ t: +window.__t.toFixed(3), a: Math.round(q.__hp - q.hp), i: qi, dead: !!q.dead }); q.__hp = q.hp; } });
        if (G.hitStopT > 0) L.gstop.push(+window.__t.toFixed(3));
        if (i % 6 === 0) L.marks.push([+window.__t.toFixed(2), p.skills2.summons.filter(x => !x.dead).map(x => x.en ? x.en.kind + ':' + x.en.phase + ':' + Math.round(x.hp) : x.kind).join(',')]);
        if (nm === 'regen' && i % 30 === 0) L.marks.push(['hp', +window.__t.toFixed(2), Math.round(p.hp), (p.status.get('regen') || {}).remaining]);
        if (nm === 'c3' && i % 30 === 0) L.marks.push(['hp', +window.__t.toFixed(2), Math.round(p.hp)]);
        const fd = (S.aim || (S.foes[0] ? S.foes[0][0] : 0)) * 0.5, sc = G.render.toScreen({ x: p.pos.x + window.__f.x * fd, y: p.pos.y + (S.id === 'en_a5' ? 1.6 : S.id === 'en_b5' ? 1.4 : 1.0), z: p.pos.z + window.__f.z * fd }); return [sc.x, sc.y];
      }, [i, FPS, shot, name0]);
      if (shot) { const fn = `${dirOut}/${String(i).padStart(3, '0')}.png`; const nc = !!process.env.NOCROP; await pg.screenshot({ path: fn, timeout: 300000, ...(nc ? {} : { clip: { x: Math.max(0, Math.min(VW - CW, Math.round(sc[0] - CW / 2))), y: Math.max(0, Math.min(VH - CH, Math.round(sc[1] - CH / 2))), width: CW, height: CH } }) }); frames.push([fn, i / FPS]); }
    }
    const late = await ev(() => { window.__noDraw = true; for (let i = 0; i < 300; i++) G.step(1 / 30, true); window.__noDraw = false; const k = G.player.skills2.en; return { liveAfter10s: G.skillFx.en.live.length, machines: G.player.skills2.summons.filter(s => !s.dead).length, beacon: !!k.beacon, red: k.heat(), refunds: k.log.refunds, things: G.player.skills2.things.length, pending: G.player.skills2.pending.length }; });
    const res = await ev(() => { const L = window.__L; return { cast: L.cast, then: L.then, pre: L.pre, used: L.used, fx: L.fx, sfx: L.sfx, dmg: L.dmg, kick: L.kick, shake: L.shake, gstop: L.gstop.length, marks: L.marks, total: L.dmg.reduce((s, d) => s + (d.a || 0), 0) }; });
    res.info = info; res.late = late; res.errors = errs.slice(0, 8);
    // strip: crop around the action (centre of the screen), 2 rows
    const cw = Math.min(VW, TOUCH ? 390 : 860), chh = Math.min(VH, TOUCH ? 640 : 600);
    fs.writeFileSync('/tmp/_enstrip.py', `from PIL import Image, ImageDraw\nfr=${JSON.stringify(frames)}\nims=[Image.open(f).convert('RGB') for f,_ in fr]\nW,H=ims[0].size; cw,ch=${cw},${chh}\nx0=0;cw=W;ch=H; y0=0\nif ${process.env.NOCROP ? 1 : 0}: x0,y0,cw,ch=0,0,W,H\nims=[i.crop((x0,y0,x0+cw,y0+ch)) for i in ims]\nn=len(ims); cols=(n+1)//2 if n>6 else n; rows=(n+cols-1)//cols\ns=0.6 if cols>4 else 1.0\nims=[i.resize((int(cw*s),int(ch*s))) for i in ims]; w,h=ims[0].size\nsh=Image.new('RGB',(w*cols,(h+20)*rows),(20,20,28)); d=ImageDraw.Draw(sh)\nfor k,(im,(_,t)) in enumerate(zip(ims,fr)):\n  x=(k%cols)*w; y=(k//cols)*(h+20); sh.paste(im,(x,y+20)); d.text((x+6,y+4),'t %.2fs'%t,fill=(255,255,255))\nsh.save('${OUT}/${name}.png')`);
    try { execSync('python3 /tmp/_enstrip.py'); fs.rmSync(dirOut, { recursive: true, force: true }); } catch (e) { console.log('strip failed', e.message); }
    fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify(res, null, 1));
    console.log(name, JSON.stringify({ total: res.total, hits: res.dmg.length, kick: res.kick, shake: res.shake, gstop: res.gstop, late, errors: res.errors, info }));
  }
  await b.close();
})();
