// Lv10 전직 길 확인(2026-11-12 마을 리뉴얼): 아르칸 광장 → 동문 워프 → 왕도 가는 길 → 카이리온 서문 → 길드 회관의 마스터 5명.
// 각 구간을 실제 NavGrid 경로로 재고(길이 m), 카이리온에서 마스터에게 걸어가(경로 따라 이동) 말을 걸어 '직업 상담' → 전직까지 함. 아르칸 대체 NPC(하늘·다래·쇠돌)의 메뉴도 확인.
// Usage: [PORT=8765] [JOB=pharmacist] node tools/browser-tests/jobroute.js -> OUT/jobroute_*.png
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/towns'; fs.mkdirSync(OUT, { recursive: true }); const PORT = process.env.PORT || 8765, JOB = process.env.JOB || 'pharmacist';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: 1280, height: 760 } })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(`http://localhost:${PORT}/index.html`);
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(() => localStorage.clear()); await click('새 게임'); await click('모험 시작'); await pg.waitForSelector('.prologue.on', { timeout: 60000 }); await click('건너뛰기');
  const ready = () => pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.zone && !document.querySelector('.prologue'), null, { timeout: 400000 });
  await ready(); await pg.waitForTimeout(1500);
  const R = {};
  const plen = () => ev(() => 0);
  const route = (to) => ev(to => { const p = G.player.pos, z = G.zone, path = z.nav.findPath({ x: p.x, y: 0, z: p.z }, { x: to[0], y: 0, z: to[1] }); let L = 0, q = p; for (const s of path) { L += Math.hypot(s.x - q.x, s.z - q.z); q = s; } return { n: path.length, m: Math.round(L) }; }, to);
  const menu = id => ev(id => { const n = G.zone.npcs.find(n => n.def.id === id); if (!n) return null; G.player.pos.x = n.pos.x; G.player.pos.z = n.pos.z - 1.2; G.interact(n); const o = [...document.querySelectorAll('.dialog button, .window button, .dlg button')].map(b => b.textContent.trim()).filter(Boolean); G.ui.close(); return { name: n.def.name, title: n.def.title, opts: o }; }, id);
  // 1) 아르칸: 시작 지점 → 동문 워프, 대체 NPC
  await ev(() => { G.sheet.p.level = 10; G.sheet.recalc(); });
  R.arcan = { start: await ev(() => [G.player.pos.x, G.player.pos.z].map(v => +v.toFixed(1))), toEastWarp: await route(await ev(() => G.zone.def.portals.find(p => p.targetZone === 'capital_road').pos)), masters: await ev(() => G.zone.npcs.filter(n => n.def.role === 'jobmaster').length) };
  for (const id of ['arcan_guide', 'arcan_pharm_clerk', 'arcan_smith_boy']) R.arcan[id] = await menu(id);
  // 2) 왕도 가는 길: 아르칸 쪽 도착점 → 카이리온 워프
  await ev(() => G.travel('capital_road', 'from_town')); await pg.waitForTimeout(800); await ready();
  R.road = { level: await ev(() => G.zone.def.level), toCapitalWarp: await route(await ev(() => G.zone.def.portals.find(p => p.targetZone === 'kairion_capital').pos)), aggressive: await ev(() => G.zone.actors.filter(m => m.def && m.faction !== 'player' && !m.passive && !m.dead).length), monsters: await ev(() => G.zone.actors.filter(m => m.def && m.faction !== 'player').length) };
  // 3) 카이리온: 서문 도착점 → 마스터 (실제로 경로를 따라 걸음)
  await ev(() => G.travel('kairion_capital', 'from_capital_road')); await pg.waitForTimeout(800); await ready(); await pg.waitForTimeout(2500);
  R.kairion = {};
  for (const m of await ev(() => G.zone.npcs.filter(n => n.def.role === 'jobmaster').map(n => [n.def.id, n.def.name, n.def.job, [n.pos.x, n.pos.z]]))) R.kairion[m[1]] = Object.assign({ job: m[2] }, await route(m[3]));
  const target = await ev(job => { const n = G.zone.npcs.find(n => n.def.role === 'jobmaster' && n.def.job === job); return [n.pos.x, n.pos.z - 1.3]; }, JOB);
  R.walk = await ev(async to => { const p = G.player, z = G.zone, path = z.nav.findPath({ x: p.pos.x, y: 0, z: p.pos.z }, { x: to[0], y: 0, z: to[1] }); let pos = { x: p.pos.x, y: 0, z: p.pos.z };
    for (const s of path) { for (let i = 0; i < 400; i++) { const dx = s.x - pos.x, dz = s.z - pos.z, d = Math.hypot(dx, dz); if (d < 0.08) break; const st = Math.min(d, 0.3); pos = z.geo.move(pos, dx / d * st, dz / d * st, 0.32); } }
    p.pos.x = pos.x; p.pos.z = pos.z; return { steps: path.length, endDist: +Math.hypot(pos.x - to[0], pos.z - to[1]).toFixed(2) }; }, target);
  await pg.waitForTimeout(3000); await pg.screenshot({ path: `${OUT}/jobroute_guildhall.png`, timeout: 300000 });
  await ev(job => { const n = G.zone.npcs.find(n => n.def.role === 'jobmaster' && n.def.job === job); G.interact(n); }, JOB); await pg.waitForTimeout(800);
  R.menu = await ev(() => [...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => /직업 상담|상점|퀘스트/.test(t)));
  await click('직업 상담'); await pg.waitForTimeout(1500); await pg.screenshot({ path: `${OUT}/jobroute_jobs.png`, timeout: 300000 });
  R.jobWindow = await ev(() => (document.querySelector('.window') || document.body).innerText.replace(/\s+/g, ' ').slice(0, 160));
  R.change = await ev(job => { const e = G.sheet.chooseJob(job); return { err: e || null, job: G.sheet.p.job }; }, JOB);
  console.log(JSON.stringify(R, null, 1)); console.log('errors', errs.slice(0, 6)); await b.close();
})();
