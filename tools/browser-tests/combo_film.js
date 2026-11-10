// 기본공격 5단 콤보(combo_1..5, tools/anim/swings.py)를 실제 게임 경로로 확인: 공격 키를 누른 채로(또는 TAP=1이면 짧게 연타)
// 허수아비 앞에서 G.step(1/60)으로 한 프레임씩 진행. 타마다 동작 이름·피해 시각(= exec 시각)·타격 대상 수·루트 이동·
// 발 미끄러짐(땅에 닿은 발의 수평 이동)·칼끝 높이(바닥에 닿지 않는지)를 기록하고, 타격 순간 화면을 저장.
// Usage: DIRS=0,45,...,315 SIZE=1100x760|390x844t TAP=0|1 FILM=0|1 (FILM=1: 2프레임마다 저장 → mp4) TAG=after
//        URL=http://localhost:8777/index.html node tools/browser-tests/combo_film.js
//   -> OUT/<TAG>_<dir>_<size>_hits.png (타격 순간 5장 + 직후 5장), OUT/<TAG>_<dir>_<size>.json (기록), FILM: OUT/<TAG>_<dir>_film.mp4
const { chromium } = require('playwright'); const fs = require('fs'); const { execSync } = require('child_process');
const DIRS = (process.env.DIRS || '90').split(',').map(Number), FPS = 60;
const SIZE = process.env.SIZE || '1100x760', TOUCH = SIZE.endsWith('t'), [VW, VH] = SIZE.replace('t', '').split('x').map(Number);
const TAG = process.env.TAG || 'after', OUT = process.env.OUT || '/tmp/combo', ZOOM = +(process.env.ZOOM || 1.35), TAP = process.env.TAP === '1', FILM = process.env.FILM === '1';
const CW = +(process.env.CW || Math.min(VW, 460)), CH = +(process.env.CH || Math.min(VH, 400)), SECS = +(process.env.SECS || 3.2);
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: VW, height: VH }, hasTouch: TOUCH, isMobile: TOUCH })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(process.env.URL || 'http://localhost:8777/index.html');
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(() => localStorage.clear()); await click('새 게임'); await click('모험 시작');
  await pg.waitForSelector('.prologue.on', { timeout: 60000 }).then(() => click('건너뛰기')).catch(() => {});
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.player.body && G.player.body.md, null, { timeout: 300000 });
  await pg.waitForTimeout(1500);
  await ev(z => {
    G.frame = () => {}; const c = G.render.cam; c.zoom = z; c.updateProjectionMatrix();
    document.querySelectorAll('.hud,.toasts,.layer:not(.controls),.qhud,.qh-reopen,.plates').forEach(e => e.style.display = 'none');
    const p = G.player; G.dev.level(5); G.dev.full();
    let spot = null; const sp0 = (G.zone.def.spawns || []).find(q => q.id === 'start') || { pos: [p.pos.x, p.pos.z] }, cx = sp0.pos[0], cz = sp0.pos[1];
    const cand = []; for (let r = 0; r <= 16; r += 1) for (let k = 0; k < Math.max(1, r * 6); k++) { const a = k / Math.max(1, r * 6) * Math.PI * 2; cand.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r }); }
    for (const R of [6, 5, 4.5, 4]) { for (const c of cand) { let ok = true; for (let a = -R; a <= R && ok; a += 0.75) for (let o = -R; o <= R && ok; o += 0.75) if (a * a + o * o <= R * R && G.zone.geo.blocked(c.x + a, c.z + o, 0.35)) ok = false; if (ok) { spot = c; break; } } if (spot) break; }
    window.__spot = spot || { x: p.pos.x, z: p.pos.z };
    // 피해 시각·콤보 번호 기록 (SkillRunner.exec 감싸기)
    const R = p.skills, ox = R.exec.bind(R); R.exec = q => { if (q.a.type === 'damage') window.__ex.push({ t: +window.__t.toFixed(3), cn: q.cn || 0, act: p.body.action }); return ox(q); };
    for (const n of G.zone.npcs) n.body && n.body.setVisible && n.body.setVisible(false);
  }, ZOOM);
  if (!TOUCH) await ev(() => document.querySelectorAll('.controls').forEach(e => e.style.display = 'none'));
  const all = {};
  for (const dir of DIRS) {
    const name = `${TAG}_${dir}_${SIZE}${TAP ? '_tap' : ''}`, dirOut = `${OUT}/${name}`; fs.rmSync(dirOut, { recursive: true, force: true }); fs.mkdirSync(dirOut, { recursive: true });
    await ev(dir => {
      const p = G.player, a = dir * Math.PI / 180, f = { x: Math.sin(a), z: Math.cos(a) };
      for (const m of [...G.zone.actors]) if (m !== p && m.faction === 'monster') m.remove && m.remove();
      p.teleport(window.__spot); p.body.place(p.pos); p.setFacing(f.x, f.z); p.target = null; p.lockOn = null; p.path = []; p.skills.comboN = 0;
      window.__f = f; const at = { x: p.pos.x + f.x * 1.6, z: p.pos.z + f.z * 1.6 };
      const m = G.dev.dummies('mon_boar', 1, 0.01, at)[0]; m.teleport(at); m.thinkStep = () => {}; m.update = function (dt) { this.baseUpdate && this.baseUpdate(dt); }; window.__d = m;
    }, dir);
    await pg.waitForFunction(() => window.__d.body, null, { timeout: 120000 });
    await ev(() => {
      let seed = 777; Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      const p = G.player, f = window.__f, m = window.__d; m.setFacing(-f.x, -f.z); m.body.place(m.pos);
      for (let i = 0; i < 10; i++) G.step(1 / 60, false);
      p.teleport(window.__spot); p.setFacing(f.x, f.z); p.body.place(p.pos);
      G.render.setFocus({ x: p.pos.x + f.x * 0.9, y: 0, z: p.pos.z + f.z * 0.9 }, true);
      window.__ex = []; window.__t = 0; window.__rec = []; window.__hp = m.hp; window.__dmg = []; window.__p0 = { ...p.pos };
    });
    const total = Math.round(SECS * FPS), shots = {};
    for (let i = 0; i < total; i++) {
      const t = i / FPS;
      // input: hold the attack key the whole time, or tap (press for 2 frames every 0.30 s); on the phone, real taps on the button
      if (TOUCH && TAP) { if (i % 18 === 0) { const r = await ev(() => { const b = document.querySelector('.abtn.attack').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }); await pg.touchscreen.tap(r[0], r[1]); } }
      else await ev(([i, tap]) => { const on = tap ? i % 18 < 2 : true; G.input.hold('attack', on); }, [i, TAP]);
      const ex0 = await ev(() => window.__ex.length);
      const draw = FILM ? i % 2 === 0 : false;
      const c = await ev(([t, draw]) => {
        window.__t = t; G.step(1 / 60, draw);
        const p = G.player, B = p.body, m = window.__d; B.root.updateMatrixWorld(true);
        const w = n => { const v = new B.root.position.constructor().setFromMatrixPosition(B.bones[B.md.byName[n]].matrixWorld); return [+v.x.toFixed(4), +v.y.toFixed(4), +v.z.toFixed(4)]; };
        const bp = B.bladePoints();
        if (m && m.hp < window.__hp) { window.__dmg.push({ t: +t.toFixed(3), a: Math.round(window.__hp - m.hp) }); window.__hp = m.hp; }
        window.__rec.push({ t: +t.toFixed(3), act: B.action, bt: +B.t.toFixed(3), pos: [+p.pos.x.toFixed(4), +p.pos.z.toFixed(4)], fL: w('Left_Foot'), fR: w('Right_Foot'), tip: bp ? bp[1].toArray().map(v => +v.toFixed(3)) : null, gy: p.pos.y });
        const s = G.render.toScreen({ x: p.pos.x + window.__f.x * 0.8, y: p.pos.y + 0.8, z: p.pos.z + window.__f.z * 0.8 });
        return [s.x, s.y];
      }, [t, draw]);
      const ex1 = await ev(() => window.__ex.length);
      const hitNow = ex1 > ex0, after = Object.keys(shots).some(k => k.startsWith('h') && +k.slice(1) === i - 4);
      if (hitNow || after || draw) {
        if (!draw) await ev(() => G.render.render(0));
        const fn = `${dirOut}/${String(i).padStart(3, '0')}.png`;
        await pg.screenshot({ path: fn, clip: { x: Math.max(0, Math.min(VW - CW, Math.round(c[0] - CW / 2))), y: Math.max(0, Math.min(VH - CH, Math.round(c[1] - CH / 2))), width: CW, height: CH }, timeout: 300000 });
        if (hitNow) shots['h' + i] = fn; else if (after) shots['a' + i] = fn;
      }
    }
    await ev(() => G.input.hold('attack', false));
    const rec = await ev(() => ({ ex: window.__ex, dmg: window.__dmg, rec: window.__rec, p0: window.__p0 }));
    fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify(rec));
    // 타격 순간(위) + 4프레임 뒤(아래) 띠
    const hs = Object.entries(shots).filter(([k]) => k[0] === 'h').map(([, v]) => v).slice(0, 5), as = Object.entries(shots).filter(([k]) => k[0] === 'a').map(([, v]) => v).slice(0, 5);
    if (hs.length) {
      fs.writeFileSync('/tmp/_combostrip.py', `from PIL import Image, ImageDraw\nrows=[${JSON.stringify(hs)},${JSON.stringify(as)}]\nims=[[Image.open(f) for f in r] for r in rows]\nw,h=ims[0][0].size\nsh=Image.new('RGB',(w*5,h*2),(0,0,0))\nfor y,r in enumerate(ims):\n  for x,im in enumerate(r): sh.paste(im,(x*w,y*h)); ImageDraw.Draw(sh).text((x*w+6,y*h+4),('hit ' if y==0 else '+4f ')+str(x+1),fill=(255,255,255))\nsh.save('${OUT}/${name}_hits.png')\n`);
      try { execSync('python3 /tmp/_combostrip.py'); } catch (e) { console.log('strip failed', e.message); }
    }
    if (FILM) try { execSync(`ffmpeg -y -loglevel error -framerate 30 -pattern_type glob -i '${dirOut}/*.png' -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -c:v libx264 -preset veryfast -pix_fmt yuv420p ${OUT}/${name}_film.mp4`); } catch (e) { console.log('mp4 failed', e.message); }
    const seq = rec.ex.map(e => `${e.cn}@${e.t}`).join(' ');
    const moved = Math.hypot(rec.rec[rec.rec.length - 1].pos[0] - rec.p0.x, rec.rec[rec.rec.length - 1].pos[1] - rec.p0.z);
    const minTip = Math.min(...rec.rec.filter(r => r.tip).map(r => r.tip[1] - r.gy));
    console.log(name, 'strikes', seq, '| dmg', rec.dmg.map(d => d.a + '@' + d.t).join(' '), '| root moved', moved.toFixed(2), 'm | lowest blade tip', minTip.toFixed(2), 'm');
    all[name] = rec;
  }
  console.log('errors', errs.slice(0, 6)); await b.close();
})();
