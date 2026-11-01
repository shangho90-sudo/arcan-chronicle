// Fixed-camera screenshots of the Whispering Forest for before/after comparison and feature checks.
// Usage: TAG=after OUT=/tmp/forest node tools/browser-tests/forestshots.js
//   W/H = viewport (default 1280x880), SHOTS = comma list to limit (stand,walk,near,behind,combat)
// Needs the game served on http://localhost:8765 (python3 -m http.server 8765 in the repo root).
const { chromium } = require('playwright');
const fs = require('fs');
const W = +process.env.W || 1280, H = +process.env.H || 880, TAG = process.env.TAG || 'shot', OUT = process.env.OUT || '/tmp/forest';
const ONLY = (process.env.SHOTS || '').split(',').filter(Boolean);
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: !!process.env.TOUCH, isMobile: !!process.env.TOUCH });
  const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text()); });
  const ev = (f, a) => pg.evaluate(f, a), wait = ms => pg.waitForTimeout(ms);
  await pg.goto('http://localhost:8765/index.html?sim=3');
  const clickLabel = async (t) => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[role=button],[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)), t, { timeout: 300000 });
    await ev(t => [...document.querySelectorAll('button,[role=button],[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)).click(), t); await wait(500); };
  await clickLabel('새 게임');
  if (await pg.locator('button', { hasText: '확인' }).count()) await pg.locator('button', { hasText: '확인' }).first().click();
  await clickLabel('모험 시작');
  await pg.waitForFunction(() => G.inWorld && G.player && !G.loading, null, { timeout: 300000 });
  await ev(() => G.loadZone('forest', 'from_town', false)); await pg.waitForFunction(() => !G.loading && G.zone && G.zone.def.id === 'forest', null, { timeout: 300000 });
  await wait(3000);
  const put = async (x, z, fx, fz) => { await ev(([x, z, fx, fz]) => { const p = G.player; p.teleport({ x, z }); p.path = []; p.target = null; if (fx !== undefined) p.setFacing(fx, fz); G.render.setFocus(p.pos, true); G.ui.toasts.innerHTML = ''; p.hp = p.maxHp; }, [x, z, fx, fz]); };
  // whole-frame totals (scene + shadow map + post passes): disable the per-render auto reset for one frame
  const stats = async () => ev(async () => { const i = G.render.r.info; i.autoReset = false; i.reset(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const o = { calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, tex: i.memory.textures }; i.autoReset = true; return o; });
  const shot = async (name) => { console.log(name, 'player', await ev(() => [G.player.pos.x.toFixed(1), G.player.pos.z.toFixed(1)])); await pg.screenshot({ path: `${OUT}/${TAG}_${name}.png`, timeout: 300000 }); const s = await stats(); console.log(name, JSON.stringify(s)); return s; };
  const res = {};
  const want = n => !ONLY.length || ONLY.includes(n);
  // 1) representative spot: path bend between the rabbit meadow and the fox den
  if (want('stand')) { await put(-17, -19.5, 0, 1); await wait(7000); res.stand = await shot('stand'); }
  // 2) walking along the path (mid-stride)
  if (want('walk')) {
    await put(-24, -22.5); await ev(() => { const p = G.player; p.path = G.zone.nav.findPath(p.pos, { x: -10, z: -12 }) || []; });
    await wait(1600); res.walk = await shot('walk');
    res.walkMoved = await ev(() => ({ x: +G.player.pos.x.toFixed(2), z: +G.player.pos.z.toFixed(2) }));
  }
  // 3) close to a big tree / rock
  if (want('near')) {
    const t = await ev(() => { const p = G.zone.def.props.filter(q => q.type === 'tree' || q.type === 'pine').map(q => q.pos).sort((a, b) => Math.hypot(a[0] + 17, a[1] + 19) - Math.hypot(b[0] + 17, b[1] + 19))[0]; return p; });
    await put(t[0] + 1.3, t[1] - 1.3, -1, 1); await wait(7000); res.near = await shot('near'); res.nearTree = t;
  }
  // 4) behind a tree (tree between camera and player)
  if (want('behind')) {
    const t = await ev(() => { const g = G.zone.geo; const c = G.zone.def.props.filter(q => q.type === 'tree' || q.type === 'pine'); for (const q of c) { const x = q.pos[0] + 1.6, z = q.pos[1] + 1.6; if (!g.blocked(x, z, 0.4)) return [x, z]; } return c[0].pos; });
    await put(t[0], t[1]); await wait(7000); res.behind = await shot('behind'); res.behindPos = t;
  }
  // 5) combat: next to the fox den, attack the nearest monster for a few seconds
  if (want('combat')) {
    await put(-13.5, -21.5); await wait(800);
    await ev(() => { const p = G.player, m = G.zone.actors.filter(a => a !== p && !a.dead && a.def && a.isMonster !== false && a.hp > 0).sort((a, b) => Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z) - Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z))[0]; if (m) { p.target = m; G.input.hold('attack', true); } });
    await wait(2500); res.combat = await shot('combat');
    res.combatInfo = await ev(() => { G.input.hold('attack', false); const t = G.player.target; return t ? { name: t.name, hp: t.hp, max: t.maxHp } : null; });
  }
  // rough frame timing (software renderer here: only comparable between runs on this machine)
  res.frame = await ev(async () => { const ts = []; let last = performance.now(); for (let i = 0; i < 40; i++) { await new Promise(r => requestAnimationFrame(r)); const n = performance.now(); ts.push(n - last); last = n; } ts.sort((a, b) => a - b); return { median: +ts[20].toFixed(1), p90: +ts[36].toFixed(1) }; });
  res.errors = errs.slice(0, 10);
  fs.writeFileSync(`${OUT}/${TAG}_result.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res));
  await b.close();
})();
