// 음악가 2차 스킬 15종(2026-11-16 '마에스트로')을 실제 스킬 경로(skills2.cast → 동작 mu_* → js/musician.js 규칙 → js/musicfx.js)로 시전하고
// 화면 띠와 수치를 남김. G.step(1/FPS) 한 프레임씩, 찍지 않는 프레임은 GPU 그리기를 건너뜀(SwiftShader가 느림).
// Usage: SKILLS=a1,a2,a3,a4,a5,b1,b2,b3,b4,b5,c1,c2,c3,c5 LV=1..5 GENDER=m|f SIZE=1100x760|390x844t FX=1|0 TAG=after ZOOM=1.2 DET=1(난수 0.5)
//        SHOTS=0(수치만) URL=http://localhost:8847/index.html OUT=/tmp/musician/shots node tools/browser-tests/music_skills.js
//   -> OUT/<TAG>_<skill>_lv<LV>_<gender>_<size>_fx<FX>.png (띠) + .json(피해 틱·이펙트 호출·소리·악절·선율·소환물·남은 이펙트·콘솔 오류·전역 히트스톱)
//   장면의 '계획' = [칸@초, …] (시작 뒤 그 시각에 또 시전: 메아리 → 스트링 피어스, 하프 → 디스코드 브레이크 등)
const { chromium } = require('playwright'); const fs = require('fs'); const { execSync } = require('child_process');
const LIST = (process.env.SKILLS || 'c1').split(','), LV = +(process.env.LV || 3), FPS = +(process.env.FPS || 30), G_ = process.env.GENDER || 'm';
const SIZE = process.env.SIZE || '1100x760', TOUCH = SIZE.endsWith('t'), [VW, VH] = SIZE.replace('t', '').split('x').map(Number);
const FX = process.env.FX !== '0', TAG = process.env.TAG || 'after', OUT = process.env.OUT || '/tmp/musician/shots', ZOOM = +(process.env.ZOOM || 1.5);
// skill key -> [id, duration s, frame marks, aim distance, monster spots [forward, side] (m), pre-cast keys]
const CFG = {
  a1: ['mu_a1', 1.3, [0.05, 0.15, 0.22, 0.28, 0.36, 0.45, 0.6, 0.8, 1.2], 0, [[3, 0], [5.5, 0.25], [8, -0.25]], [], []],
  a2: ['mu_a2', 1.2, [0.05, 0.16, 0.24, 0.3, 0.34, 0.4, 0.5, 0.7, 1.1], 0, [[1.6, 0.6], [2.0, -1.2], [1.0, 1.6]], [], []],
  a3: ['mu_a3', 1.8, [0.05, 0.2, 0.3, 0.38, 0.5, 0.56, 0.7, 0.74, 0.95, 1.3], 0, [[5, 0]], [], []],
  a4: ['mu_a4', 1.3, [0.05, 0.2, 0.3, 0.42, 0.55, 0.64, 0.7, 0.85, 1.2], 0, [[5, 0], [5.7, 1.1], [4.5, -1.2]], [], []],
  a5: ['mu_a5', 2.6, [0.1, 0.35, 0.6, 0.78, 0.82, 1.14, 1.46, 1.8, 1.94, 2.3], 0, [[3, 0], [4.5, 1.6], [5, -1.2]], [], []],
  b1: ['mu_b1', 2.4, [0.05, 0.15, 0.26, 0.4, 0.6, 1.0, 1.3, 2.0, 2.3], 0, [], [], []],
  b2: ['mu_b2', 2.0, [0.05, 0.15, 0.3, 0.45, 0.7, 1.0, 1.5, 1.9], 0, [], [], []],
  b3: ['mu_b3', 2.0, [0.05, 0.15, 0.3, 0.45, 0.8, 1.05, 1.2, 1.6, 1.9], 0, [[2.0, 1.0]], [], [['__hit', 1.0]]],
  b4: ['mu_b4', 2.4, [0.05, 0.15, 0.3, 0.45, 0.7, 1.0, 1.4, 2.0, 2.3], 0, [], [], []],
  b5: ['mu_b5', 2.0, [0.05, 0.2, 0.35, 0.5, 0.55, 0.7, 0.9, 1.3, 1.9], 0, [], ['b2'], []],
  c1: ['mu_c1', 2.2, [0.05, 0.26, 0.5, 0.8, 1.02, 1.1, 1.3, 1.45, 1.6, 2.1], 0, [[3.5, 0], [6, 0.2]], [], [['a1', 0.8]]],
  c2: ['mu_c2', 2.4, [0.05, 0.2, 0.3, 0.5, 0.8, 1.1, 1.3, 1.4, 1.6, 2.2], 2.0, [[1.4, 2.4], [3.4, 2.0]], [], [['a2', 1.0]]],
  c3: ['mu_c3', 4.0, [0.1, 0.3, 0.55, 0.8, 1.2, 1.6, 2.2, 2.8, 3.5, 3.9], 1.5, [[5.5, 0]], [], []],
  c5: ['mu_c5', 3.4, [0.1, 0.4, 0.62, 0.75, 0.95, 1.4, 1.85, 2.35, 2.5, 3.0], 0, [[3, 0], [4, 1.6], [5, -1.5]], [], []],
};
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: VW, height: VH }, hasTouch: TOUCH, isMobile: TOUCH })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error' || /musicfx|mu:|mu timer/.test(m.text())) errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(process.env.URL || 'http://localhost:8818/index.html');
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(fx => { localStorage.clear(); localStorage.setItem('arcan_settings', JSON.stringify({ graphicsFx: fx })); }, FX);
  await pg.reload(); await click('새 게임'); await click('모험 시작');
  await pg.waitForSelector('.prologue.on', { timeout: 60000 }).then(() => click('건너뛰기')).catch(() => {});
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.player.body && G.player.body.md, null, { timeout: 300000 });
  await pg.waitForFunction(() => G.skillFx && G.skillFx.music, null, { timeout: 120000 });
  await ev(async ([z, g, lv]) => {
    G.frame = () => {}; const c = G.render.cam; c.zoom = z; c.updateProjectionMatrix();
    document.querySelectorAll('.hud,.controls,.toasts,.qhud,.qh-reopen,.plates').forEach(e => e.style.display = 'none');
    if (G.reward) { G.reward.jobChange = sw => sw && sw(); G.reward.levelUp = () => {}; }
    G.dev.level(48); G.sheet.p.gender = g; G.dev.job('musician');
    const bk = G.sheet.book; bk.sk.points += 200; for (const s of G.data.skillsOf('musician')) for (let i = 0; i < lv; i++) if (!bk.learnBlock(s.id)) bk.learn(s.id);
    bk.sk.slots = ['mu_a1', 'mu_a2', 'mu_a3', 'mu_a4'];
    G.sheet.recalc(); G.dev.full(); G.input.block = true;
    await G.player.attachBody(); G.player.body.place(G.player.pos); G.player.body.play('idle', 1, true);
    G.skillFx.music.load();
    { const R = G.render.r, o = R.render.bind(R); R.render = (sc, c) => { if (!window.__noDraw) o(sc, c); }; }
    const p = G.player; let spot = null; const cx = p.pos.x, cz = p.pos.z;
    for (let r = 0; r <= 20 && !spot; r++) for (let k = 0; k < Math.max(1, r * 6) && !spot; k++) { const a = k / Math.max(1, r * 6) * 6.283, c = { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r }; let ok = true;
      for (let x = -8; x <= 8 && ok; x += 0.75) for (let z = -8; z <= 8 && ok; z += 0.75) if (x * x + z * z <= 64 && G.zone.geo.blocked(c.x + x, c.z + z, 0.35)) ok = false; if (ok) spot = c; }
    window.__spot = spot || { x: cx, z: cz };
  }, [ZOOM, G_, LV]);
  await pg.waitForFunction(() => G.skillFx.music.ready && G.player.body && G.player.body.md, null, { timeout: 120000 });
  await pg.waitForTimeout(1200);
  for (const KEY of LIST) {
    const [ID, DUR, MARKS, DIST, MONS, PRE, PLAN] = CFG[KEY]; errs.length = 0;
    const name = `${TAG}_${KEY}_lv${LV}_${G_}_${SIZE}_fx${FX ? 1 : 0}`, dirOut = `${OUT}/${name}`; fs.rmSync(dirOut, { recursive: true, force: true }); fs.mkdirSync(dirOut, { recursive: true });
    await ev(([mons]) => {
      const p = G.player, f = { x: 0, z: 1 };
      p.skills2.clearTemp(); for (const m of [...G.zone.actors]) if (m !== p && m.def && m.body) m.remove && m.remove();
      G.skillFx.clear(); p.teleport(window.__spot); p.body.place(p.pos); p.setFacing(f.x, f.z); p.target = null; p.lockOn = null; p.path = []; G.dev.full();
      p.skills2.cd = {}; p.skills.lock = 0; for (const s of p.status.list.slice()) p.status.remove(s.def.id);
      window.__f = f; window.__at = (d, s = 0) => ({ x: p.pos.x + f.x * d - f.z * s, z: p.pos.z + f.z * d + f.x * s });
      window.__ds = mons.map(([d, s]) => { const at = window.__at(d, s), m = G.dev.dummies('mon_boar', 1, 0.01, at)[0]; m.teleport(at); m.__spot = at; return m; });
    }, [MONS]);
    await pg.waitForFunction(() => window.__ds.every(m => m.body), null, { timeout: 120000 });
    const info = await ev(async ([fps, id, dist, key, pre, det]) => {
      let seed = 4242; Math.random = det ? () => 0.5 : () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      const p = G.player, f = window.__f, m = window.__ds[0], eng = p.skills2;
      for (const q of window.__ds) { q.thinkStep = () => {}; q.teleport(q.__spot); q.setFacing(-f.x, -f.z); q.body.place(q.pos); q.hp = q.maxHp; q.__hp = q.hp; }
      const castKey = (k, at) => { const sid = 'mu_' + k; G.sheet.book.sk.slots = [sid, '', '', '']; eng.cd[sid] = 0; p.skills.lock = 0; p.sp = p.maxSp; return eng.cast(sid, at); };
      window.__noDraw = true;
      for (const pk of pre) { const [k, d] = pk.split('@'); const e = castKey(k, window.__at(+(d || 2))); if (e) return 'pre ' + k + ': ' + e; for (let i = 0; i < Math.round(1.4 * fps); i++) G.step(1 / fps, true); }
      for (const q of window.__ds) { q.teleport(q.__spot); q.knock = { x: 0, z: 0 }; q.hp = q.maxHp; q.__hp = q.hp; }
      if (key === 'a4') for (const q of window.__ds.slice(0, 2)) q.status.apply(G.data.status('atkdown'), 6, 0.2, p);   // 디스코드로 약화된 적 둘 = 추가 파동
      eng.res.phrase = key === 'a5' ? 6 : 0;
      if (key === 'b1' || key === 'b5') p.hp = Math.round(p.maxHp * 0.5);
      if (key === 'b4') p.sp = Math.round(p.maxSp * 0.3);
      window.__castKey = castKey;
      G.render.setFocus({ x: p.pos.x + f.x * Math.max(1.5, dist * 0.6), y: 0, z: p.pos.z + f.z * Math.max(1.5, dist * 0.6) }, true);
      const L = window.__log = { fx: [], sfx: [], dmg: [], heal: [], summons: [], gstop: 0, shake: 0 };
      window.__t = 0;
      const H = G.skillFx.music; if (!H.__w) { H.__w = true; const o = H.make.bind(H); H.make = (k, a, opt) => { window.__log.fx.push([k, +window.__t.toFixed(2)]); return o(k, a, opt); }; }
      if (!G.audio.__w) { G.audio.__w = true; const os = G.audio.sfx.bind(G.audio); G.audio.sfx = (n, o) => { window.__log.sfx.push([n, +window.__t.toFixed(2)]); return os(n, o); }; }
      if (!G.__hs) { G.__hs = true; const oh = G.hitStop.bind(G); G.hitStop = (...a) => { window.__log.gstop++; return oh(...a); }; const oa = G.render.addShake.bind(G.render); G.render.addShake = (...a) => { window.__log.shake++; return oa(...a); }; }
      p.target = m || null; window.__hp0 = p.hp;
      const e = castKey(key, dist ? window.__at(dist) : null); if (e) return 'cast error: ' + e;
      return { mult: eng.mult(G.data.skill2(id)), matk: p.stat('matk'), hp: p.hp, maxHp: p.maxHp, phrase: eng.res.phrase };
    }, [FPS, ID, DIST, KEY, PRE, !!process.env.DET]);
    if (typeof info === 'string') { console.log(KEY, info); continue; }
    const frames = [], total = Math.round(DUR * FPS);
    for (let i = 0; i < total; i++) {
      const shot = process.env.SHOTS !== '0' && MARKS.some(m => i === Math.round(m * FPS));
      const c = await ev(([i, fps, shot, plan, dist]) => {
        window.__t = i / fps; for (const [k, at] of plan) if (i === Math.round(at * fps)) { if (k === '__hit') { const q = window.__ds[0]; G.player.takeDamage({ source: q, amount: 20 }); continue; } const e = window.__castKey(k, dist ? window.__at(dist + 1) : null); if (e) window.__log.planErr = k + ': ' + e; } window.__noDraw = !shot; const p = G.player, L = window.__log;
        const hp0 = p.hp; G.step(1 / fps, true); if (p.hp > hp0 + 0.5) L.heal.push([+window.__t.toFixed(2), Math.round(p.hp - hp0)]);
        window.__ds.forEach((q, qi) => { if (!q.removed && q.hp < q.__hp) { L.dmg.push([+window.__t.toFixed(2), qi, Math.round(q.__hp - q.hp)]); q.__hp = q.hp; } });
        if (i % 6 === 0) L.summons.push([+window.__t.toFixed(2), p.skills2.summons.filter(s => !s.dead).map(s => s.kind + ':' + (s.log ? s.log.notes + '/' + s.log.chords : '')).join(' '), +p.skills2.res.phrase.toFixed(2), p.skills2.melody ? p.skills2.melody.id + (p.skills2.melody.boost ? '+' + p.skills2.melody.boost : '') : '']);
        const f = window.__f, s = G.render.toScreen({ x: p.pos.x + f.x * 1.6, y: p.pos.y + 1.0, z: p.pos.z + f.z * 1.6 });
        return [s.x, s.y];
      }, [i, FPS, shot, PLAN, DIST]);
      const fn = `${dirOut}/${String(i).padStart(3, '0')}.png`, CW = Math.min(VW, 760), CH = Math.min(VH, 600);
      if (shot) await pg.screenshot({ path: fn, clip: { x: Math.max(0, Math.min(VW - CW, Math.round(c[0] - CW / 2))), y: Math.max(0, Math.min(VH - CH, Math.round(c[1] - CH / 2))), width: CW, height: CH }, timeout: 300000 });
      frames.push(shot ? fn : null);
    }
    const res = await ev(() => { const L = window.__log, p = G.player, eng = p.skills2; window.__noDraw = true;
      const out = { fx: L.fx, sfx: L.sfx, dmg: L.dmg, heal: L.heal, total: L.dmg.reduce((a, d) => a + d[2], 0), perTarget: window.__ds.map((q, qi) => L.dmg.filter(d => d[1] === qi).length), gstop: L.gstop, shake: L.shake,
        summons: L.summons.filter((s, i) => i % 3 === 0), status: window.__ds.map(q => q.removed ? 'gone' : q.status.list.map(x => x.def.id).join('+')), me: p.status.list.map(x => x.def.id + ':' + (x.value || 0).toFixed(2)).join(' '), shield: Math.round(p.shield || 0),
        live: G.skillFx.music.live.length, timers: eng.music.timers.length, phrase: +eng.res.phrase.toFixed(2), kit: { echo: eng.music.log.echo, react: eng.music.log.react, coda: eng.music.log.coda, sym: eng.music.log.sym && { fin: eng.music.log.sym.fin, n: eng.music.log.sym.hits.length }, heals: eng.music.log.heals, mp: Math.round(eng.music.log.mp), a4: eng.music.log.a4 }, planErr: L.planErr };
      for (let i = 0; i < 240; i++) G.step(1 / 15, true); eng.clearTemp(); for (let i = 0; i < 20; i++) G.step(1 / 15, true);
      out.liveAfterClear = G.skillFx.music.live.length; out.summonsAfterClear = eng.summons.length; window.__noDraw = false; return out; });
    res.info = info; res.errors = errs.slice(0, 8);
    const pick = MARKS.map(m => frames[Math.round(m * FPS)] || null);
    fs.writeFileSync('/tmp/musician/_strip.py', `from PIL import Image, ImageDraw\nfr=${JSON.stringify(pick.map(f => f || ''))}\nlab=${JSON.stringify(MARKS)}\nims=[Image.open(f) if f else None for f in fr]\nw,h=next(i for i in ims if i).size\nims=[(i or Image.new('RGB',(w,h),(0,0,0))).resize((w*2//3,h*2//3)) for i in ims]\nw,h=ims[0].size\nn=len(ims); cols=(n+1)//2 if n>6 else n; rows=(n+cols-1)//cols\nsh=Image.new('RGB',(w*cols,(h+22)*rows),(20,20,28))\nd=ImageDraw.Draw(sh)\nfor i,(im,l) in enumerate(zip(ims,lab)):\n  x=(i%cols)*w; y=(i//cols)*(h+22)\n  sh.paste(im,(x,y+22)); d.text((x+6,y+4),('${KEY} t %.2fs'%l),fill=(255,255,255))\nsh.save('${OUT}/${name}.png')`);
    if (process.env.SHOTS !== '0') try { execSync('python3 /tmp/musician/_strip.py'); fs.rmSync(dirOut, { recursive: true, force: true }); } catch (e) { console.log('strip failed', e.message); }
    console.log(name, JSON.stringify(res)); fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify(res, null, 1));
  }
  await b.close();
})();
