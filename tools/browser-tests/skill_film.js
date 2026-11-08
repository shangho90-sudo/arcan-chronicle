// Frame-by-frame film of one skill in the real game (animation + root motion + skill effects + hits on dummies).
// The game loop is stopped and stepped at a fixed 1/FPS s, one screenshot per step (crop around the player).
// Usage: SKILL=nv_a2 LV=5 FPS=30 DIR=90 GENDER=m node tools/browser-tests/skill_film.js -> OUT/film_<skill>_<lv>/NNN.png
//   then: python3 tools/anim/sheet.py OUT/film_<skill>_<lv>  (contact sheet)
const { chromium } = require('playwright'); const fs = require('fs');
const SKILL = process.env.SKILL || 'nv_a2', LV = +(process.env.LV || 5), FPS = +(process.env.FPS || 30), DIR = +(process.env.DIR || 90);
const OUT = (process.env.OUT || '/tmp/film') + `/film_${SKILL}_${LV}`; fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const CW = +(process.env.CW || 460), CH = +(process.env.CH || 380);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: 1100, height: 760 } })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(process.env.URL || 'http://localhost:8765/index.html');
  const clickLabel = async (t) => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[role=button],[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 });
    await ev(t => [...document.querySelectorAll('button,[role=button],[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(500); };
  await ev(() => localStorage.clear());
  await clickLabel('새 게임');
  if (process.env.GENDER === 'f') await ev(() => { const c = document.querySelector('.choice-f'); if (c) c.click(); });
  await clickLabel('모험 시작');
  await pg.waitForSelector('.prologue.on', { timeout: 60000 }).then(() => clickLabel('건너뛰기')).catch(() => {});   // 새 캐릭터 서장 건너뛰기
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.player.body && G.player.body.md, null, { timeout: 300000 });
  await pg.waitForTimeout(1500);
  await ev(([nd, z]) => { window.__nd = nd; window.__zoom = z; }, [+(process.env.DUMMIES ?? 3), +(process.env.ZOOM || 1)]);
  const n = await ev(([id, lv, dir, fps]) => {
    G.frame = () => {}; if (window.__zoom !== 1) { G.render.cam.zoom = window.__zoom; G.render.cam.updateProjectionMatrix(); } document.querySelectorAll('.hud,.controls,.toasts,.layer,.qhud,.qh-reopen,.plates').forEach(e => e.style.visibility = 'hidden');
    const p = G.player; G.dev.level(20); p.teleport({ x: -14, z: -9 }); p.body.place(p.pos); G.render.setFocus(p.pos, true);
    for (const nn of G.zone.npcs) nn.body && nn.body.setVisible && nn.body.setVisible(false);
    G.sheet.book.sk.learned[id] = lv; G.sheet.recalc(); G.sheet.book.equip(id, 0, false); G.dev.full();
    const a = dir * Math.PI / 180, f = { x: Math.sin(a), z: Math.cos(a) };
    const ds = +(window.__nd ?? 3) === 0 ? [] : G.dev.dummies('mon_boar', +(window.__nd ?? 3), 0.9, { x: p.pos.x + f.x * 2.6, z: p.pos.z + f.z * 2.6 }); for (const m of ds) m.thinkStep = () => {};
    p.setFacing(f.x, f.z); for (let i = 0; i < 30; i++) G.step(1 / fps, false);
    const e = p.skills2.cast(id, { x: p.pos.x + f.x, z: p.pos.z + f.z }); if (e) return 'cast error: ' + e;
    const act = G.player.body.sh.actions[G.player.body.action]; return Math.ceil(((act && (act.dur || act.frames / act.fps)) || 1.5) * fps) + 10;
  }, [SKILL, LV, DIR, FPS]);
  if (typeof n === 'string') { console.log(n); process.exit(1); }
  console.log('action', await ev(() => G.player.body.action), 'frames', n);
  for (let i = 0; i < n; i++) {
    const c = await ev(fps => { G.step(1 / fps, true); const p = G.player, s = G.render.toScreen({ x: p.pos.x, y: p.pos.y + 0.8, z: p.pos.z }); return [s.x, s.y, +p.body.t.toFixed(3), p.body.action]; }, FPS);
    await pg.screenshot({ path: `${OUT}/${String(i).padStart(3, '0')}.png`, clip: { x: Math.max(0, Math.round(c[0] - CW / 2)), y: Math.max(0, Math.round(c[1] - CH * 0.55)), width: CW, height: CH }, timeout: 120000 });
  }
  console.log('errors', errs.slice(0, 5)); await b.close();
})();
