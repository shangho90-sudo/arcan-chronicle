// 서브 퀘스트 늦춤(needZones, 2026-11-15): 서리 고원이 닫힌 동안 리라(qs29 '고원의 겨울 준비 ①')에게 "!"가 없고, 22장을 받을 수 있게 되면 생김.
// Usage: URL=http://localhost:8811/index.html SIZES=1280x720 NODE_PATH=$(npm root -g) node tools/browser-tests/subgate.js -> /tmp/gate/sg_*.png
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/gate', URL = process.env.URL || 'http://localhost:8811/index.html'; fs.mkdirSync(OUT, { recursive: true });
const fails = []; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails.push(m); };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const sz of (process.env.SIZES || '1280x720').split(',')) {
    const touch = sz.endsWith('t'), [W, H] = sz.replace('t', '').split('x').map(Number);
    const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
    const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    const ev = (f, a) => pg.evaluate(f, a), shot = n => pg.screenshot({ path: `${OUT}/sg_${sz}_${n}.png`, timeout: 300000 });
    const S = 'button,[role=button],[aria-label]';
    const click = async t => { await pg.waitForFunction(([S, t]) => [...document.querySelectorAll(S)].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), [S, t], { timeout: 300000 }); await ev(([S, t]) => [...document.querySelectorAll(S)].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), [S, t]); await pg.waitForTimeout(500); };
    const inZone = id => pg.waitForFunction(id => window.G && G.inWorld && G.zone && G.zone.def.id === id && G.player && !G.loading && !G.input.block, id, { timeout: 400000 });
    const progress = upto => ev(upto => { const M = G.data.world.main, done = new Set(), add = id => { if (done.has(id)) return; for (const p of G.data.quests[id].prereq || []) add(p); done.add(id); };
      for (const id of M.order) { if (id === upto) break; add(id); } G.profile.quests = [...done].map(id => ({ id, state: 'completed', counts: [] })); G.sheet.p.level = 30; G.ui.updateTracker && G.ui.updateTracker(); }, upto);
    const mark = () => ev(() => { const n = G.zone.npcs.find(n => n.def.id === 'master_hairdresser'), p = G.player; p.teleport({ x: n.pos.x, z: n.pos.z - 2.4 }); p.body.place(p.pos); G.render.setFocus(p.pos, true);
      return { st: G.quests.stateOf(G.data.quests.qs29), qs: G.questState('master_hairdresser'), menu: G.quests.questsFor('master_hairdresser').map(q => q.id) }; });
    await pg.goto(URL, { timeout: 300000 }); await ev(() => localStorage.clear()); await pg.reload({ timeout: 300000 });
    await click('새 게임'); await click('모험 시작'); await pg.waitForSelector('.prologue.on', { timeout: 60000 }); await click('건너뛰기');
    await pg.waitForFunction(() => !document.querySelector('.prologue'), null, { timeout: 300000 }); await inZone('town');
    await progress('mq19a'); await ev(() => G.loadZone('kairion_capital', 'from_capital_road')); await inZone('kairion_capital');
    let m = await mark(); await pg.waitForTimeout(3500);
    const plate = () => ev(() => { const p = [...document.querySelectorAll('.plate.npc')].find(p => /리라/.test(p.textContent)); return p ? p.querySelector('.mark').innerHTML : null; });
    ok(m.st === 0 && m.qs !== 'avail' && !m.menu.includes('qs29'), '18장 뒤(서리 고원 닫힘): qs29 못 받음 ' + JSON.stringify(m));
    ok(!/qmark/.test(await plate() || ''), '리라 머리 위 "!" 없음'); await shot('1_before');
    await progress('mq22a'); m = await mark(); await pg.waitForTimeout(3500);
    ok(m.st === 1 && m.qs === 'avail' && m.menu.includes('qs29'), '22장을 받을 수 있게 되면(서리 고원 열림) qs29 받기 ' + JSON.stringify(m));
    ok(/qmark/.test(await plate() || ''), '리라 머리 위 "!" 생김'); await shot('2_after');
    ok(errs.length === 0, 'page errors ' + JSON.stringify(errs.slice(0, 3))); await ctx.close();
  }
  console.log(fails.length ? 'FAILED ' + fails.length : 'all ok'); await b.close(); process.exit(fails.length ? 1 : 0);
})();
