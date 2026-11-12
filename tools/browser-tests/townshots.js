// 마을 리뉴얼 화면 확인: 마을로 가서 광장·성문(워프)·랜드마크·시장·공원·NPC 무리와 지역 지도를 캡처.
// Usage: ZONES=town,kairion_capital SIZE=1280x760 [SHOTS=plaza,gates,lm,close,market,park,npcs,map,perf] [TAG=before] [PORT=8765] node tools/browser-tests/townshots.js -> OUT/<zone>_<shot>_<size>.png
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/towns'; fs.mkdirSync(OUT, { recursive: true });
const PORT = process.env.PORT || 8765, SZ = process.env.SIZE || '1280x760', touch = SZ.endsWith('t'), [W, H] = SZ.replace('t', '').split('x').map(Number);
const ZONES = (process.env.ZONES || 'town').split(','), SHOTS = (process.env.SHOTS || 'plaza,gates,lm,market,park,map').split(',');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(`http://localhost:${PORT}/index.html`);
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(() => localStorage.clear()); await click('새 게임'); await click('모험 시작'); await pg.waitForSelector('.prologue.on', { timeout: 60000 }); await click('건너뛰기');
  const ready = () => pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.zone && !document.querySelector('.prologue'), null, { timeout: 400000 });
  await ready();
  for (const zid of ZONES) {
    if (await ev(() => G.zone.def.id) !== zid) { await ev(z => G.travel(z), zid); await pg.waitForTimeout(800); await ready(); }
    await pg.waitForTimeout(3500);
    const info = await ev(() => { const d = G.zone.def, t = d.town3d, i = G.render.r.info.render; return { gates: (t.gates || [t.gate]).map(g => [g.id, g.pos, g.heading]), lm: t.models.map(m => [m.id, m.pos, m.size]), market: t.districts && t.districts.market, park: t.districts && t.districts.park,
      npcs: d.npcs.length, houses: t.houses.length, calls: i.calls, tris: i.triangles, bounds: d.bounds }; });
    console.log(zid, JSON.stringify({ npcs: info.npcs, houses: info.houses, calls: info.calls, tris: info.tris, bounds: info.bounds, lm: info.lm.map(m => m[0]) }));
    const at = async (name, x, z) => {
      await ev(([x, z]) => { const p = G.player, g = G.zone.geo; let bx = x, bz = z; for (let r = 0; r < 12 && g.blocked(bx, bz, 0.5); r += 0.5) for (let a = 0; a < 6.28; a += 0.5) { const cx = x + r * Math.cos(a), cz = z + r * Math.sin(a); if (!g.blocked(cx, cz, 0.5)) { bx = cx; bz = cz; break; } }
        p.pos.x = bx; p.pos.z = bz; p.path = []; p.target = null; }, [x, z]);
      await pg.waitForTimeout(2600);
      const t0 = Date.now(); await ev(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      await pg.screenshot({ path: `${OUT}/${zid}_${name}_${SZ}.png`, timeout: 300000 });
    };
    if (SHOTS.includes('over')) {                                                    // 높은 카메라로 마을 전체
      const half = Math.max(info.bounds[2] - info.bounds[0], info.bounds[3] - info.bounds[1]) * (touch ? 0.62 : 0.4);
      await ev(async h => { const m = await import('/js/render.js'); window.__cam = { ...m.CAM }; m.CAM.ortho = h; m.CAM.dist = 220; m.CAM.minWidth = 2 * h; G.render.cam.far = 800; G.render.resize(); document.body.classList.add('shot-clean'); for (const e of document.querySelectorAll('.hud,.botbar,.abtns,#hud,.plate,.qhud')) e.style.visibility = 'hidden'; }, half);
      await at('over', 0, 0);
      await ev(async () => { const m = await import('/js/render.js'); Object.assign(m.CAM, window.__cam); G.render.cam.far = 160; G.render.resize(); for (const e of document.querySelectorAll('.hud,.botbar,.abtns,#hud,.plate,.qhud')) e.style.visibility = ''; });
    }
    if (SHOTS.includes('plaza')) await at('plaza', 0, -9);
    if (SHOTS.includes('gates')) for (const [id, pos, hd] of info.gates) { const a = (hd ?? 180) * Math.PI / 180; await at(id, pos[0] - Math.sin(a) * 6, pos[1] - Math.cos(a) * 6); await at(id + '_out', pos[0] + Math.sin(a) * 4.5, pos[1] + Math.cos(a) * 4.5); }
    if (SHOTS.includes('lm')) for (const [id, pos, size] of info.lm) await at(id, pos[0], pos[1] - size[1] / 2 - 5);
    // close: 랜드마크 바로 옆(앞면 오른쪽 모서리 3 m)에 서서 — 메시가 깨져 보이는지 가까이서 확인 (TAG로 전/후 구분)
    if (SHOTS.includes('close')) for (const [id, pos, size] of info.lm.filter((m, i) => !process.env.LM || process.env.LM.split(',').some(k => m[0].includes(k))).slice(0, +process.env.NLM || 99)) { const T = process.env.TAG ? '_' + process.env.TAG : ''; await at(id + '_close' + T, pos[0] + size[0] * 0.3, pos[1] - size[1] / 2 - 2.2);
      await at(id + '_front' + T, pos[0] - size[0] * 0.15, pos[1] - size[1] / 2 - 1.2); await at(id + '_side' + T, pos[0] - size[0] / 2 - 1.2, pos[1] - size[1] * 0.1); }   // front = 앞면 가운데 바로 앞(건물이 화면 위쪽), side = 서쪽 면 옆
    if (SHOTS.includes('market') && info.market) await at('market', info.market[0], info.market[1]);
    if (SHOTS.includes('park') && info.park) await at('park', info.park[0], info.park[1]);
    if (SHOTS.includes('map')) { await ev(() => G.ui.showAreaMap()); await pg.waitForTimeout(5000); await pg.screenshot({ path: `${OUT}/${zid}_map_${SZ}.png`, timeout: 300000 }); await ev(() => G.ui.close()); }
    const perf = async tag => console.log(zid, 'perf', tag, JSON.stringify(await ev(async () => { const t = []; let l = performance.now(); for (let i = 0; i < 20; i++) { await new Promise(r => requestAnimationFrame(r)); const n = performance.now(); t.push(n - l); l = n; } const R = G.render.r; R.info.autoReset = false; R.info.reset(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); const i = { calls: R.info.render.calls / 2 | 0, triangles: R.info.render.triangles / 2 | 0 }; R.info.autoReset = true; return { ms: +(t.reduce((a, b) => a + b) / t.length).toFixed(1), calls: i.calls, tris: i.triangles }; })));
    if (SHOTS.includes('perf')) { if (process.env.PERF_AT) for (const [k, q] of process.env.PERF_AT.split(';').entries()) { const [x, z] = q.split(',').map(Number); await at('perf' + k + (process.env.TAG ? '_' + process.env.TAG : ''), x, z); await perf(q); } else await perf(''); }   // PERF_AT="0,-9;0,30": 그 자리에 서서 측정(+캡처)
  }
  console.log('errors', errs.slice(0, 6)); await b.close();
})();
