// 견습생 '연' nv_a2 를 실제 스킬 경로(cast → 연타 동작·돌진 → 타격마다 피해 → '연' 초승달·명중광)로 시전하고 프레임을 저장.
// 정상 배속으로 G.step(1/FPS) 한 프레임씩 진행(캐릭터·판정·이펙트가 같은 시간축). Math.random 고정 → 수정 전후 같은 장면.
// Usage: SCENE=single|line|whiff LV=4 (스킬 Lv, 타수 = Lv+1) DIRS=0,45,...,315 ZOOM=1 SIZE=1100x760|390x844t FX=1|0 TAG=after
//        EVERY=2 (몇 프레임마다 저장) URL=http://localhost:8771/index.html OUT=/tmp/yeonfx node tools/browser-tests/yeon_skill.js
//   -> OUT/<name>/NNN.png (전체 프레임), OUT/<name>_sheet.png (시간 표시 격자), OUT/<name>.gif, OUT/<name>_hits.png (타격 순간 +1프레임 띠)
// 출력 JSON: 타격(피해) 시각·대상 HP 변화, 이펙트 호출 시각 → 피해 시각과 명중광이 같은 프레임인지 확인.
const { chromium } = require('playwright'); const fs = require('fs'); const { execSync } = require('child_process');
const SCENE = process.env.SCENE || 'single', DIRS = (process.env.DIRS || '90').split(',').map(Number), FPS = +(process.env.FPS || 60), LV = +(process.env.LV || 4);
const SIZE = process.env.SIZE || '1100x760', TOUCH = SIZE.endsWith('t'), [VW, VH] = SIZE.replace('t', '').split('x').map(Number);
const FX = process.env.FX !== '0', TAG = process.env.TAG || 'after', OUT = process.env.OUT || '/tmp/yeonfx', ZOOM = +(process.env.ZOOM || 1), EVERY = +(process.env.EVERY || 2);
const CW = +(process.env.CW || Math.min(VW, 620)), CH = +(process.env.CH || Math.min(VH, 460)), DUR = +(process.env.DUR || 1.45);
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: VW, height: VH }, hasTouch: TOUCH, isMobile: TOUCH })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error' || /yeonfx|fx yeon/.test(m.text())) errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(process.env.URL || 'http://localhost:8771/index.html');
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(fx => { localStorage.clear(); localStorage.setItem('arcan_settings', JSON.stringify({ graphicsFx: fx })); }, FX);
  await pg.reload(); await click('새 게임'); await click('모험 시작');
  await pg.waitForSelector('.prologue.on', { timeout: 60000 }).then(() => click('건너뛰기')).catch(() => {});
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.player.body && G.player.body.md, null, { timeout: 300000 });
  await pg.waitForFunction(() => G.skillFx && (!G.skillFx.yeon || G.skillFx.yeon.ready), null, { timeout: 120000 });
  await pg.waitForTimeout(1500);
  await ev(([z, lv]) => {
    G.frame = () => {}; const c = G.render.cam; c.zoom = z; c.updateProjectionMatrix();
    document.querySelectorAll('.hud,.controls,.toasts,.layer,.qhud,.qh-reopen,.plates').forEach(e => e.style.display = 'none');
    const p = G.player; G.dev.level(12); G.dev.full(); G.input.block = true;
    let spot = null; const sp0 = (G.zone.def.spawns || []).find(q => q.id === 'start') || { pos: [p.pos.x, p.pos.z] }, cx = sp0.pos[0], cz = sp0.pos[1];
    const cand = []; for (let r = 0; r <= 16; r += 1) for (let k = 0; k < Math.max(1, r * 6); k++) { const a = k / Math.max(1, r * 6) * Math.PI * 2; cand.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r }); }
    for (const R of [5.5, 5, 4.5, 4]) { for (const c of cand) { let ok = true; for (let a = -R; a <= R && ok; a += 0.75) for (let o = -R; o <= R && ok; o += 0.75) if (a * a + o * o <= R * R && G.zone.geo.blocked(c.x + a, c.z + o, 0.35)) ok = false; if (ok) { spot = c; break; } } if (spot) break; }
    if (!spot) spot = { x: p.pos.x, z: p.pos.z };
    window.__spot = spot; G.sheet.book.sk.learned.nv_a2 = lv; G.sheet.recalc(); G.sheet.book.equip('nv_a2', 0, false);
  }, [ZOOM, LV]);
  const results = [];
  for (const dir of DIRS) {
    const name = `${TAG}_${SCENE}_lv${LV}_${dir}_${SIZE}_fx${FX ? 1 : 0}`, dirOut = `${OUT}/${name}`; fs.rmSync(dirOut, { recursive: true, force: true }); fs.mkdirSync(dirOut, { recursive: true });
    await ev(([dir, scene]) => {
      const p = G.player, a = dir * Math.PI / 180, f = { x: Math.sin(a), z: Math.cos(a) };
      for (const m of [...G.zone.actors]) if (m !== p && m.def && m.body) m.remove && m.remove();
      G.skillFx.clear(); p.teleport(window.__spot); p.body.place(p.pos); p.setFacing(f.x, f.z); p.target = null; p.lockOn = null; p.path = [];
      p.skills2.cd = {}; G.dev.full();
      const at = d => ({ x: p.pos.x + f.x * d, z: p.pos.z + f.z * d });
      window.__ds = []; window.__f = f; window.__at = at;
      // line: 3 enemies one behind the other + 1 beside the target (the skill keeps hitting only its single target)
      const pts = scene === 'line' ? [at(2.4), at(3.4), at(4.4), { x: at(2.6).x + f.z * 1.3, z: at(2.6).z - f.x * 1.3 }] : [at(2.4)];
      for (const q of pts) { const m = G.dev.dummies('mon_boar', 1, 0.01, q)[0]; m.teleport(q); m.thinkStep = () => {}; window.__ds.push(m); }
    }, [dir, SCENE]);
    await pg.waitForFunction(() => window.__ds.every(m => m.body), null, { timeout: 120000 });
    const info = await ev(([scene, fps]) => {
      let seed = 12345; Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      const p = G.player, f = window.__f, at = window.__at, ds = window.__ds;
      for (const m of ds) { m.teleport(m.pos); m.setFacing(-f.x, -f.z); m.body.place(m.pos); m.hp = 1e7; }
      for (let i = 0; i < 12; i++) G.step(1 / fps, false);
      p.teleport(window.__spot); p.setFacing(f.x, f.z); for (const m of ds) m.knock = { x: 0, z: 0 };
      G.render.setFocus({ x: p.pos.x + f.x * 1.6, y: 0, z: p.pos.z + f.z * 1.6 }, true);
      window.__log = []; window.__hp = ds.map(m => m.hp);
      const Y = G.skillFx.yeon;
      if (Y && !Y.__wrapped) { Y.__wrapped = true; const os = Y.strike.bind(Y), oh = Y.hit.bind(Y);
        Y.strike = o => { window.__log.push({ k: 'strike', t: window.__t, p: o.y && o.y.p, fin: !!(o.y && o.y.fin), lead: o.lead }); return os(o); };
        Y.hit = (pos, o) => { window.__log.push({ k: o.whiff ? 'whiff' : 'hit', t: window.__t, fin: !!(o.y && o.y.fin) }); return oh(pos, o); }; }
      window.__t = 0; p.target = ds[0];
      const e = p.skills2.cast('nv_a2', at(2)); if (e) return 'cast error: ' + e;
      if (scene === 'whiff') for (const m of ds) { m.dead = true; m.remove(); }
      return { ds: ds.length, act: p.skills2.pending.length };
    }, [SCENE, FPS]);
    if (typeof info === 'string') { console.log(info); continue; }
    const frames = []; const total = Math.round(DUR * FPS), dmg = [];
    for (let i = 0; i < total; i++) {
      const c = await ev(([i, fps]) => {
        window.__t = (i + 1) / fps; G.step(1 / fps, true);
        const ds = window.__ds, hp = ds.map(m => m.hp), d = hp.map((h, j) => +(window.__hp[j] - h).toFixed(1)); window.__hp = hp;
        const p = G.player, f = window.__f; const s = G.render.toScreen({ x: p.pos.x + f.x * 1.6, y: p.pos.y + 0.9, z: p.pos.z + f.z * 1.6 });
        return [s.x, s.y, d];
      }, [i, FPS]);
      if (c[2].some(x => x > 0)) dmg.push({ t: +((i + 1) / FPS).toFixed(3), dmg: c[2] });
      if (i % EVERY) { frames.push(null); continue; }
      const fn = `${dirOut}/${String(i).padStart(3, '0')}.png`;
      await pg.screenshot({ path: fn, clip: { x: Math.max(0, Math.min(VW - CW, Math.round(c[0] - CW / 2))), y: Math.max(0, Math.min(VH - CH, Math.round(c[1] - CH / 2))), width: CW, height: CH }, timeout: 300000 });
      frames.push(fn);
    }
    const log = await ev(() => window.__log.map(l => ({ ...l, t: +l.t.toFixed(3) })));
    // sheet (every saved frame, time labels) + GIF + strip of the frames right after each damage event
    const saved = frames.map((f, i) => f ? [i, f] : null).filter(Boolean);
    const hitIdx = dmg.map(d => { const i = Math.round(d.t * FPS) - 1; let best = null; for (const [j, f] of saved) if (j >= i && (best == null || j < best[0])) best = [j, f]; return best; }).filter(Boolean);
    fs.writeFileSync('/tmp/_yeonsheet.py', `from PIL import Image, ImageDraw
fps=${FPS}
sv=${JSON.stringify(saved)}
ims=[(i,Image.open(f).convert('RGB')) for i,f in sv]
w,h=ims[0][1].size; s=0.5; tw,th=int(w*s),int(h*s); cols=8; rows=(len(ims)+cols-1)//cols
sh=Image.new('RGB',(tw*cols,(th+16)*rows),(20,20,28)); d=ImageDraw.Draw(sh)
for k,(i,im) in enumerate(ims):
  x,y=(k%cols)*tw,(k//cols)*(th+16); sh.paste(im.resize((tw,th)),(x,y+16)); d.text((x+4,y+2),'%.3fs'%((i+1)/fps),fill=(255,255,255))
sh.save('${OUT}/${name}_sheet.png')
g=[im.resize((int(w*0.8),int(h*0.8))).quantize(colors=200,method=Image.Quantize.MEDIANCUT) for i,im in ims]
g[0].save('${OUT}/${name}.gif',save_all=True,append_images=g[1:],duration=int(1000*${EVERY}/fps),loop=0)
hs=${JSON.stringify(hitIdx)}
if hs:
  hi=[Image.open(f).convert('RGB') for i,f in hs]; st=Image.new('RGB',(w*len(hi),h+22),(20,20,28)); d=ImageDraw.Draw(st)
  for k,(im,(i,f)) in enumerate(zip(hi,hs)): st.paste(im,(k*w,22)); d.text((k*w+6,4),'hit %d  %.3fs'%(k+1,(i+1)/fps),fill=(255,255,255))
  st.save('${OUT}/${name}_hits.png')
`);
    try { execSync('python3 /tmp/_yeonsheet.py'); } catch (e) { console.log('sheet failed', e.message); }
    const r = { name, dmg, log, alive: await ev(() => window.__ds.map(m => !m.dead)) };
    results.push(r); console.log(JSON.stringify(r));
  }
  fs.writeFileSync(`${OUT}/${TAG}_${SCENE}_lv${LV}_${SIZE}_fx${FX ? 1 : 0}.json`, JSON.stringify(results, null, 1));
  console.log('errors', errs.slice(0, 8)); await b.close();
})();
