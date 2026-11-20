// 한약사 2차 스킬 15종(2026-11-16 '본초 도사')을 실제 스킬 경로(skills2.cast → 동작 → js/herbal.js 규칙 → js/herbalfx.js)로 시전하고
// 화면 띠와 수치를 남김. G.step(1/FPS) 한 프레임씩, 찍지 않는 프레임은 GPU 그리기를 건너뜀(SwiftShader가 느림).
// CF=1: 띠를 잘라 내는 가운데를 조준점 쪽(거리 × 0.6)으로 — 먼 착탄 확인용(전/후 비교는 같은 CF로).
// Usage: SKILLS=a1,a2,a3,a4,a5,b1,b2,b3,b4,b5,c1,c2,c3,c4,c5,brew LV=1..5 GENDER=m|f SIZE=1100x760|390x844t FX=1|0 TAG=after ZOOM=1.2 DET=1(난수 0.5)
//        SHOTS=0(수치만) URL=http://localhost:8818/index.html OUT=/tmp/herbal/shots node tools/browser-tests/herbal_skills.js
//   -> OUT/<TAG>_<skill>_lv<LV>_<gender>_<size>_fx<FX>.png (띠) + .json(피해 틱·이펙트 호출·소리·소환물·남은 이펙트·콘솔 오류·전역 히트스톱)
const { chromium } = require('playwright'); const fs = require('fs'); const { execSync } = require('child_process');
const LIST = (process.env.SKILLS || 'c1').split(','), LV = +(process.env.LV || 3), FPS = +(process.env.FPS || 30), G_ = process.env.GENDER || 'm';
const SIZE = process.env.SIZE || '1100x760', TOUCH = SIZE.endsWith('t'), [VW, VH] = SIZE.replace('t', '').split('x').map(Number);
const FX = process.env.FX !== '0', TAG = process.env.TAG || 'after', OUT = process.env.OUT || '/tmp/herbal/shots', ZOOM = +(process.env.ZOOM || 1.15);
// skill key -> [id, duration s, frame marks, aim distance, monster spots [forward, side] (m), pre-cast keys]
const CFG = {
  // 2026-11-20 처방 5종(a1 탕약 나누기·a2 보중익기탕·a3 구풍해독탕·c3 오령산·c4 소경활혈탕) — 사용자 장면은 tools/browser-tests/herbal_rx.js
  a1: ['hb_a1', 1.6, [0.05, 0.2, 0.3, 0.4, 0.55, 0.7, 0.9, 1.2, 1.5], 0, [[4, 0]], ['b3']],
  a2: ['hb_a2', 3.6, [0.05, 0.2, 0.35, 0.6, 1.0, 1.35, 2.0, 2.4, 3.1, 3.5], 0, [[4, 0]], ['b3']],
  a3: ['hb_a3', 1.6, [0.05, 0.2, 0.3, 0.45, 0.6, 0.8, 1.1, 1.5], 0, [[1.4, 0.4]], []],
  a4: ['hb_a4', 2.6, [0.05, 0.3, 0.45, 0.6, 0.85, 1.0, 1.5, 2.2], 2.0, [], ['b3']],
  a5: ['hb_a5', 2.6, [0.1, 0.4, 0.6, 0.8, 1.0, 1.15, 1.3, 1.6, 2.0, 2.5], 0, [], []],
  b1: ['hb_b1', 3.0, [0.1, 0.3, 0.45, 0.6, 0.75, 0.9, 1.3, 2.0, 2.8], 3.0, [[3.6, 0.2], [3.0, -1.2]], []],
  b2: ['hb_b2', 3.0, [0.1, 0.35, 0.55, 0.7, 0.85, 0.95, 1.2, 1.9, 2.9], 4.0, [[4, 0], [4.8, 1.0], [3.4, -1.2]], []],
  b3: ['hb_b3', 4.2, [0.1, 0.35, 0.5, 0.7, 0.85, 1.1, 1.4, 1.8, 2.4, 3.2, 4.1], 0, [[3.5, 1.2]], []],
  b4: ['hb_b4', 5.6, [0.1, 0.4, 0.6, 0.75, 0.9, 1.2, 1.8, 2.6, 3.5, 4.4, 5.5], 2.0, [[3.4, 0], [3.8, 1.2], [3.0, -1.3]], []],
  b5: ['hb_b5', 3.2, [0.1, 0.4, 0.7, 0.85, 1.0, 1.2, 1.5, 1.9, 2.5, 3.1], 0, [[3, 1], [4.5, -1.5], [2.5, -2.5], [5.5, 2]], ['b3', 'b4']],
  c1: ['hb_c1', 1.5, [0.1, 0.25, 0.32, 0.4, 0.5, 0.6, 0.7, 0.8, 1.0, 1.3], 0, [[2.5, 0], [5, 0.3], [7.5, -0.2]], ['b1@2.5']],
  c2: ['hb_c2', 1.7, [0.05, 0.15, 0.24, 0.32, 0.45, 0.6, 0.75, 0.85, 1.0, 1.3, 1.6], 7.0, [[6.5, 0], [6.5, 2.2], [6.3, -2.0]], []],
  c3: ['hb_c3', 1.8, [0.1, 0.3, 0.45, 0.6, 0.75, 0.9, 0.95, 1.05, 1.3, 1.7], 4.0, [[4, 2.8], [6.6, 1.2], [3.0, -2.2], [4.6, -2.6]], []],
  c4: ['hb_c4', 1.4, [0.05, 0.2, 0.3, 0.36, 0.44, 0.5, 0.6, 0.8, 0.9, 1.2], 0, [[4, 0], [4.3, 1.4], [3.6, -1.3]], []],
  c5: ['hb_c5', 1.8, [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.7, 0.9, 1.2, 1.7], 0, [[3, 0.3], [5.5, -0.5]], ['a4@4']],
  brew: ['hb_a1', 2.5, [0.05, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.5, 1.8, 2.3], 0, [], []],
};
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: VW, height: VH }, hasTouch: TOUCH, isMobile: TOUCH })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error' || /herb/.test(m.text())) errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(process.env.URL || 'http://localhost:8818/index.html');
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(fx => { localStorage.clear(); localStorage.setItem('arcan_settings', JSON.stringify({ graphicsFx: fx })); }, FX);
  await pg.reload(); await click('새 게임'); await click('모험 시작');
  await pg.waitForSelector('.prologue.on', { timeout: 60000 }).then(() => click('건너뛰기')).catch(() => {});
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.player.body && G.player.body.md, null, { timeout: 300000 });
  await pg.waitForFunction(() => G.skillFx && G.skillFx.herbal, null, { timeout: 120000 });
  await ev(async ([z, g, lv]) => {
    G.frame = () => {}; const c = G.render.cam; c.zoom = z; c.updateProjectionMatrix();
    document.querySelectorAll('.hud,.controls,.toasts,.qhud,.qh-reopen,.plates').forEach(e => e.style.display = 'none');
    if (G.reward) { G.reward.jobChange = sw => sw && sw(); G.reward.levelUp = () => {}; }
    G.dev.level(48); G.sheet.p.gender = g; G.dev.job('herbalist');
    const bk = G.sheet.book; bk.sk.points += 200; for (const s of G.data.skillsOf('herbalist')) for (let i = 0; i < lv; i++) if (!bk.learnBlock(s.id)) bk.learn(s.id);
    bk.sk.slots = ['hb_c1', 'hb_c2', 'hb_c3', 'hb_c4'];
    G.sheet.recalc(); G.dev.full(); G.input.block = true;
    await G.player.attachBody(); G.player.body.place(G.player.pos); G.player.body.play('idle', 1, true);
    G.skillFx.herbal.load();
    { const R = G.render.r, o = R.render.bind(R); R.render = (sc, c) => { if (!window.__noDraw) o(sc, c); }; }
    const p = G.player; let spot = null; const cx = p.pos.x, cz = p.pos.z;
    for (let r = 0; r <= 20 && !spot; r++) for (let k = 0; k < Math.max(1, r * 6) && !spot; k++) { const a = k / Math.max(1, r * 6) * 6.283, c = { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r }; let ok = true;
      for (let x = -8; x <= 8 && ok; x += 0.75) for (let z = -8; z <= 8 && ok; z += 0.75) if (x * x + z * z <= 64 && G.zone.geo.blocked(c.x + x, c.z + z, 0.35)) ok = false; if (ok) spot = c; }
    window.__spot = spot || { x: cx, z: cz };
  }, [ZOOM, G_, LV]);
  await pg.waitForFunction(() => G.skillFx.herbal.ready && G.player.body && G.player.body.md, null, { timeout: 120000 });
  await pg.waitForTimeout(1200);
  for (const KEY of LIST) {
    const [ID, DUR, MARKS, DIST, MONS, PRE] = CFG[KEY]; errs.length = 0;
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
    const info = await ev(async ([fps, id, dist, key, pre, det, cfv]) => {
      let seed = 4242; Math.random = det ? () => 0.5 : () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      const p = G.player, f = window.__f, m = window.__ds[0], eng = p.skills2;
      for (const q of window.__ds) { q.thinkStep = () => {}; q.teleport(q.__spot); q.setFacing(-f.x, -f.z); q.body.place(q.pos); q.hp = q.maxHp; q.__hp = q.hp; }
      const castKey = (k, at) => { const sid = 'hb_' + k; G.sheet.book.sk.slots = [sid, '', '', '']; eng.cd[sid] = 0; p.skills.lock = 0; p.sp = p.maxSp; return eng.cast(sid, at); };
      window.__noDraw = true;
      for (const pk of pre) { const [k, d] = pk.split('@'); const e = castKey(k, window.__at(+(d || 2))); if (e) return 'pre ' + k + ': ' + e; for (let i = 0; i < Math.round(1.4 * fps); i++) G.step(1 / fps, true); }
      for (const q of window.__ds) { q.teleport(q.__spot); q.knock = { x: 0, z: 0 }; q.hp = q.maxHp; q.__hp = q.hp; }
      if (key === 'a4' || key === 'a2') { p.status.apply(G.data.status('poison'), 6, 3, null); p.status.apply(G.data.status('slow'), 6, 0.3, null); p.hp = Math.round(p.maxHp * 0.5); }
      if (key === 'a5') p.hp = Math.round(p.maxHp * 0.4);
      if (key === 'c1' && m) m.status.apply(G.data.status('root'), 3, 0, null);
      G.render.setFocus({ x: p.pos.x + f.x * Math.max(1.5, dist * 0.6), y: 0, z: p.pos.z + f.z * Math.max(1.5, dist * 0.6) }, true);
      const L = window.__log = { fx: [], sfx: [], dmg: [], heal: [], summons: [], gstop: 0, shake: 0 };
      window.__t = 0; window.__cf = cfv ? Math.max(1.6, dist * 0.6) : 1.6;   // CF=1: 잘라 내는 가운데를 조준 쪽으로(띠 비교는 같은 값끼리)
      const H = G.skillFx.herbal; if (!H.__w) { H.__w = true; const o = H.make.bind(H); H.make = (k, a, opt) => { window.__log.fx.push([k, +window.__t.toFixed(2)]); return o(k, a, opt); }; }
      if (!G.audio.__w) { G.audio.__w = true; const os = G.audio.sfx.bind(G.audio); G.audio.sfx = (n, o) => { window.__log.sfx.push([n, +window.__t.toFixed(2)]); return os(n, o); }; }
      if (!G.__hs) { G.__hs = true; const oh = G.hitStop.bind(G); G.hitStop = (...a) => { window.__log.gstop++; return oh(...a); }; const oa = G.render.addShake.bind(G.render); G.render.addShake = (...a) => { window.__log.shake++; return oa(...a); }; }
      p.target = m || null; window.__hp0 = p.hp;
      if (key === 'brew') { G.sheet.bag.add('m_herb', 8); G.sheet.bag.add('m_meat', 2); G.sheet.bag.add('m_boar_tusk', 2); const rc = G.data.recipes.find(r => r.id === 'r_tonic'); const { craft } = await import('./js/skillsys.js'); const r = craft(G.data, G.sheet, G.sheet.book, rc, 2); H.make('brew', p, { n: r.made }); return { made: r.made }; }
      const e = castKey(key, dist ? window.__at(dist) : null); if (e) return 'cast error: ' + e;
      return { mult: eng.mult(G.data.skill2(id)), atk: p.stat('atk'), hp: p.hp, maxHp: p.maxHp };
    }, [FPS, ID, DIST, KEY, PRE, !!process.env.DET, !!process.env.CF]);
    if (typeof info === 'string') { console.log(KEY, info); continue; }
    const frames = [], total = Math.round(DUR * FPS);
    for (let i = 0; i < total; i++) {
      const shot = process.env.SHOTS !== '0' && MARKS.some(m => i === Math.round(m * FPS));
      const c = await ev(([i, fps, shot]) => {
        window.__t = i / fps; window.__noDraw = !shot; const p = G.player, L = window.__log;
        const hp0 = p.hp; G.step(1 / fps, true); if (p.hp > hp0 + 0.5) L.heal.push([+window.__t.toFixed(2), Math.round(p.hp - hp0)]);
        window.__ds.forEach((q, qi) => { if (!q.removed && q.hp < q.__hp) { L.dmg.push([+window.__t.toFixed(2), qi, Math.round(q.__hp - q.hp)]); q.__hp = q.hp; } });
        if (i % 6 === 0) L.summons.push([+window.__t.toFixed(2), p.skills2.summons.filter(s => !s.dead).map(s => s.kind + (s.ready ? '' : '*') + (s.herbBuff ? '+' : '') + ':' + s.pos.x.toFixed(1) + ',' + s.pos.z.toFixed(1)).join(' ')]);
        const f = window.__f, cf = window.__cf || 1.6, s = G.render.toScreen({ x: p.pos.x + f.x * cf, y: p.pos.y + 1.0, z: p.pos.z + f.z * cf });
        return [s.x, s.y];
      }, [i, FPS, shot]);
      const fn = `${dirOut}/${String(i).padStart(3, '0')}.png`, CW = Math.min(VW, 760), CH = Math.min(VH, 600);
      if (shot) await pg.screenshot({ path: fn, clip: { x: Math.max(0, Math.min(VW - CW, Math.round(c[0] - CW / 2))), y: Math.max(0, Math.min(VH - CH, Math.round(c[1] - CH / 2))), width: CW, height: CH }, timeout: 300000 });
      frames.push(shot ? fn : null);
    }
    const res = await ev(() => { const L = window.__log, p = G.player, eng = p.skills2; window.__noDraw = true;
      const out = { fx: L.fx, sfx: L.sfx, dmg: L.dmg, heal: L.heal, total: L.dmg.reduce((a, d) => a + d[2], 0), perTarget: window.__ds.map((q, qi) => L.dmg.filter(d => d[1] === qi).length), gstop: L.gstop, shake: L.shake,
        summons: L.summons.filter((s, i) => i % 3 === 0), status: window.__ds.map(q => q.removed ? 'gone' : q.status.list.map(x => x.def.id).join('+')), me: p.status.list.map(x => x.def.id + ':' + (x.value || 0).toFixed(2)).join(' '), shield: Math.round(p.shield || 0),
        live: G.skillFx.herbal.live.length, fields: eng.herbal.fields.length, timers: eng.herbal.timers.length };
      for (let i = 0; i < 240; i++) G.step(1 / 15, true); eng.clearTemp(); for (let i = 0; i < 20; i++) G.step(1 / 15, true);
      out.liveAfterClear = G.skillFx.herbal.live.length; out.summonsAfterClear = eng.summons.length; window.__noDraw = false; return out; });
    res.info = info; res.errors = errs.slice(0, 8);
    const pick = MARKS.map(m => frames[Math.round(m * FPS)] || null);
    fs.writeFileSync('/tmp/herbal/_strip.py', `from PIL import Image, ImageDraw\nfr=${JSON.stringify(pick.map(f => f || ''))}\nlab=${JSON.stringify(MARKS)}\nims=[Image.open(f) if f else None for f in fr]\nw,h=next(i for i in ims if i).size\nims=[(i or Image.new('RGB',(w,h),(0,0,0))).resize((w*2//3,h*2//3)) for i in ims]\nw,h=ims[0].size\nn=len(ims); cols=(n+1)//2 if n>6 else n; rows=(n+cols-1)//cols\nsh=Image.new('RGB',(w*cols,(h+22)*rows),(20,20,28))\nd=ImageDraw.Draw(sh)\nfor i,(im,l) in enumerate(zip(ims,lab)):\n  x=(i%cols)*w; y=(i//cols)*(h+22)\n  sh.paste(im,(x,y+22)); d.text((x+6,y+4),('${KEY} t %.2fs'%l),fill=(255,255,255))\nsh.save('${OUT}/${name}.png')`);
    if (process.env.SHOTS !== '0') try { execSync('python3 /tmp/herbal/_strip.py'); fs.rmSync(dirOut, { recursive: true, force: true }); } catch (e) { console.log('strip failed', e.message); }
    console.log(name, JSON.stringify(res)); fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify(res, null, 1));
  }
  await b.close();
})();
