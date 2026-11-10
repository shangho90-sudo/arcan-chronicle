// 배쉬 nv_a4 를 실제 스킬 경로(cast → attack2 칼 동작·돌진 → 타격·밀치기 → js/bashfx.js 이펙트)로 시전하고, 피해가 들어간
// 프레임 기준 같은 시점의 화면을 저장. 정상 배속으로 G.step(1/FPS) 한 프레임씩 진행, Math.random 고정 → 수정 전후 같은 장면.
// Usage: SCENE=single|close|whiff|chain DIRS=0,45,...  SIZE=1100x760|390x844t FX=1|0 TAG=after URL=http://localhost:8775/index.html
//        ARC=1 (칼끝 궤적 원 맞춤 값 출력) MARKONLY=1 (표시 시점만 캡처) node tools/browser-tests/bash_skill.js
//   -> OUT/<TAG>_<scene>_<dir>_<size>_fx<FX>.png  가로 띠: 타격 -0.20/-0.08/-0.03/0/+0.03/+0.06/+0.10/+0.16/+0.25/+0.40/+0.55 s
//   로그: 피해 프레임, 섬광 호출 시각(= 피해 프레임이어야 함), 섬광 위치와 대상 앞면의 거리, 밀려난 거리, 히트스톱, draw call, 남은 이펙트 수
const { chromium } = require('playwright'); const fs = require('fs'); const { execSync } = require('child_process');
const SCENE = process.env.SCENE || 'single', DIRS = (process.env.DIRS || '90').split(',').map(Number), FPS = +(process.env.FPS || 60);
const SIZE = process.env.SIZE || '1100x760', TOUCH = SIZE.endsWith('t'), [VW, VH] = SIZE.replace('t', '').split('x').map(Number);
const FX = process.env.FX !== '0', TAG = process.env.TAG || 'after', OUT = process.env.OUT || '/tmp/bash', ZOOM = +(process.env.ZOOM || 1.25);
const CW = +(process.env.CW || Math.min(VW, 520)), CH = +(process.env.CH || Math.min(VH, 420));
const MARKS = (process.env.MARKS || '-0.20,-0.08,-0.03,0,0.03,0.06,0.10,0.16,0.25,0.40,0.55').split(',').map(Number);
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: VW, height: VH }, hasTouch: TOUCH, isMobile: TOUCH })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error' || /bashfx|fx bash/.test(m.text())) errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(process.env.URL || 'http://localhost:8775/index.html');
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(fx => { localStorage.clear(); localStorage.setItem('arcan_settings', JSON.stringify({ graphicsFx: fx })); }, FX);
  await pg.reload(); await click('새 게임'); await click('모험 시작');
  await pg.waitForSelector('.prologue.on', { timeout: 60000 }).then(() => click('건너뛰기')).catch(() => {});
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.player.body && G.player.body.md, null, { timeout: 300000 });
  await pg.waitForFunction(() => G.skillFx && (!G.skillFx.bash || G.skillFx.bash.ready), null, { timeout: 120000 });
  await pg.waitForTimeout(1500);
  await ev(z => {
    G.frame = () => {}; const c = G.render.cam; c.zoom = z; c.updateProjectionMatrix();
    document.querySelectorAll('.hud,.controls,.toasts,.layer,.qhud,.qh-reopen,.plates').forEach(e => e.style.display = 'none');
    const p = G.player; G.dev.level(12); G.dev.full(); G.input.block = true;
    let spot = null; const sp0 = (G.zone.def.spawns || []).find(q => q.id === 'start') || { pos: [p.pos.x, p.pos.z] }, cx = sp0.pos[0], cz = sp0.pos[1];
    const cand = []; for (let r = 0; r <= 16; r += 1) for (let k = 0; k < Math.max(1, r * 6); k++) { const a = k / Math.max(1, r * 6) * Math.PI * 2; cand.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r }); }
    for (const R of [6, 5, 4.5, 4]) { for (const c of cand) { let ok = true; for (let a = -R; a <= R && ok; a += 0.75) for (let o = -R; o <= R && ok; o += 0.75) if (a * a + o * o <= R * R && G.zone.geo.blocked(c.x + a, c.z + o, 0.35)) ok = false; if (ok) { spot = c; break; } } if (spot) break; }
    if (!spot) spot = { x: p.pos.x, z: p.pos.z };
    window.__spot = spot; G.sheet.book.sk.learned.nv_a4 = 3; G.sheet.recalc(); G.sheet.book.equip('nv_a4', 0, false);
  }, ZOOM);
  const strips = [], summary = [];
  for (const dir of DIRS) {
    const name = `${TAG}_${SCENE}_${dir}_${SIZE}_fx${FX ? 1 : 0}`, dirOut = `${OUT}/${name}`; fs.rmSync(dirOut, { recursive: true, force: true }); fs.mkdirSync(dirOut, { recursive: true });
    await ev(([dir, scene]) => {
      const p = G.player, a = dir * Math.PI / 180, f = { x: Math.sin(a), z: Math.cos(a) };
      for (const m of [...G.zone.actors]) if (m !== p && m.def && m.body) m.remove && m.remove();
      G.skillFx.clear(); p.teleport(window.__spot); p.body.place(p.pos); p.setFacing(f.x, f.z); p.target = null; p.lockOn = null; p.path = [];
      p.skills2.cd = {}; G.dev.full();
      const at = d => ({ x: p.pos.x + f.x * d, z: p.pos.z + f.z * d });
      window.__ds = []; window.__f = f; window.__at = at;
      const m = G.dev.dummies('mon_boar', 1, 0.01, at(scene === 'close' ? 1.2 : 2.0))[0]; m.teleport(at(scene === 'close' ? 1.2 : 2.0)); m.thinkStep = () => {}; window.__ds.push(m);
    }, [dir, SCENE]);
    await pg.waitForFunction(() => window.__ds.every(m => m.body), null, { timeout: 120000 });
    const info = await ev(([scene, fps]) => {
      let seed = 12345; Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      const p = G.player, f = window.__f, ds = window.__ds;
      for (const m of ds) { m.teleport(m.pos); m.setFacing(-f.x, -f.z); m.body.place(m.pos); }
      for (let i = 0; i < 12; i++) G.step(1 / fps, false);
      p.teleport(window.__spot); p.setFacing(f.x, f.z); for (const m of ds) m.knock = { x: 0, z: 0 };
      G.render.setFocus({ x: p.pos.x + f.x * 1.6, y: 0, z: p.pos.z + f.z * 1.6 }, true);
      window.__hits = []; window.__dmg = []; window.__t = 0; window.__p0 = { ...ds[0].pos }; window.__hp = ds[0].hp; window.__freeze = [];
      const S = G.skillFx.bash;
      if (S && !S.__wrapped) { S.__wrapped = true; const oh = S.hit.bind(S); S.hit = (pos, d, o) => { const t = window.__ds[0]; window.__hits.push({ t: window.__t, pos: { ...pos }, whiff: !!o.whiff, tpos: t ? { ...t.pos } : null, r: t ? t.radius : null }); return oh(pos, d, o); }; }
      p.target = ds[0];
      const e = p.skills2.cast('nv_a4', window.__at(2)); if (e) return 'cast error: ' + e;
      if (scene === 'whiff') for (const m of ds) { m.dead = true; m.remove(); }
      window.__chain = scene === 'chain' ? 1 : 0;
      return { ds: ds.length };
    }, [SCENE, FPS]);
    if (typeof info === 'string') { console.log(info); continue; }
    const frames = []; const total = Math.round((SCENE === 'chain' ? 1.9 : 1.1) * FPS); let dc = null;
    for (let i = 0; i < total; i++) {
      const H0 = Math.round(0.233 * FPS), isMark = MARKS.some(m => i === H0 + Math.round(m * FPS)), draw = !process.env.MARKONLY || isMark || i === H0 + 2;
      const c = await ev(([i, fps, draw]) => {
        window.__t = i / fps; const p = G.player, f = window.__f, m = window.__ds[0];
        // chain: cast again as soon as the first cast's lock ends (cooldown reset: 연속 사용)
        if (window.__chain === 1 && p.skills2.lock <= 0 && window.__t > 0.4) { window.__chain = 2; p.skills2.cd = {}; G.dev.full(); p.target = m; const e = p.skills2.cast('nv_a4', { x: m.pos.x, z: m.pos.z }); window.__recast = { t: window.__t, e }; }
        if (draw) G.step(1 / fps, true); else { G.step(1 / fps, false); if (G.skillFx) G.skillFx.update(1 / fps); }   // MARKONLY: render only the captured frames (effects still advance)
        if (m && !m.dead && m.hp < window.__hp) { window.__dmg.push({ t: window.__t, amount: window.__hp - m.hp }); window.__hp = m.hp; }
        if ((p.freezeT || 0) > 0 || (m && m.freezeT > 0)) window.__freeze.push(+window.__t.toFixed(3));
        const s = G.render.toScreen({ x: p.pos.x + f.x * 1.3, y: p.pos.y + 0.9, z: p.pos.z + f.z * 1.3 });
        return [s.x, s.y, G.render.r ? G.render.r.info.render.calls : -1];
      }, [i, FPS, draw]);
      const fn = `${dirOut}/${String(i).padStart(3, '0')}.png`;
      if (!process.env.MARKONLY || isMark) {
        await pg.screenshot({ path: fn, clip: { x: Math.max(0, Math.min(VW - CW, Math.round(c[0] - CW / 2))), y: Math.max(0, Math.min(VH - CH, Math.round(c[1] - CH / 2))), width: CW, height: CH }, timeout: 300000 });
        frames.push(fn);
      } else frames.push(null);
      if (i === H0 + 2) dc = c[2];
    }
    summary.push({ dir });
    const res = await ev(() => ({ hits: window.__hits.map(h => ({ t: +h.t.toFixed(3), whiff: h.whiff, d: h.tpos ? +(Math.hypot(h.pos.x - h.tpos.x, h.pos.z - h.tpos.z)).toFixed(3) : null, y: +h.pos.y.toFixed(2), r: h.r })),
      dmg: window.__dmg.map(d => ({ t: +d.t.toFixed(3), a: d.amount })), push: window.__ds[0] && !window.__ds[0].removed ? +Math.hypot(window.__ds[0].pos.x - window.__p0.x, window.__ds[0].pos.z - window.__p0.z).toFixed(2) : null,
      freeze: window.__freeze.length ? [window.__freeze[0], window.__freeze[window.__freeze.length - 1]] : null, recast: window.__recast || null,
      live: G.skillFx.bash ? G.skillFx.bash.live.length : null, arc: G.player.body.__bashArc || null }));
    res.drawCalls = dc;
    const hitFrame = res.dmg.length ? Math.round(res.dmg[0].t * FPS) : Math.round(0.233 * FPS);
    const pick = MARKS.map(m => { const i = hitFrame + Math.round(m * FPS); return i >= 0 && i < frames.length ? frames[i] : null; });
    fs.writeFileSync('/tmp/_bashstrip.py', `from PIL import Image, ImageDraw\nfr=${JSON.stringify(pick.map(f => f || ''))}\nlab=${JSON.stringify(MARKS)}\nims=[Image.open(f) if f else None for f in fr]\nw,h=next(i for i in ims if i).size\nims=[i or Image.new('RGB',(w,h),(0,0,0)) for i in ims]\nsh=Image.new('RGB',(w*len(ims),h+22),(20,20,28))\nd=ImageDraw.Draw(sh)\nfor i,(im,l) in enumerate(zip(ims,lab)):\n  sh.paste(im,(i*w,22)); d.text((i*w+6,4),('hit %+.2fs'%l),fill=(255,255,255))\nsh.save('${OUT}/${name}.png')`);
    try { execSync('python3 /tmp/_bashstrip.py'); strips.push(`${OUT}/${name}.png`); } catch (e) { console.log('strip failed', e.message); }
    console.log(name, JSON.stringify(res));
    summary[summary.length - 1].res = res;
  }
  console.log('strips', strips, 'errors', errs.slice(0, 6)); await b.close();
})();
