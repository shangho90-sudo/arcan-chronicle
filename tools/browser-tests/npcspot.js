// 이야기 NPC 자리 화면 확인: 퀘스트를 완료 처리해 NPC가 보이게 한 뒤 그 마을로 가서 NPC 쪽 화면을 캡처.
// Usage: ZONE=kairion_capital NPC=capital_cook DONE=mq02a node tools/browser-tests/npcspot.js -> OUT/npcspot_<npc>.png
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/npcspot'; fs.mkdirSync(OUT, { recursive: true });
const ZONE = process.env.ZONE || 'kairion_capital', NPC = process.env.NPC || 'capital_cook', DONE = (process.env.DONE || 'mq02a').split(',');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: 1100, height: 760 } })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto('http://localhost:8765/index.html');
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(() => localStorage.clear()); await click('새 게임'); await click('모험 시작'); await pg.waitForSelector('.prologue.on', { timeout: 60000 }); await click('건너뛰기');
  const ready = () => pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.zone && !document.querySelector('.prologue'), null, { timeout: 300000 });
  await ready();
  await ev(ids => { const P = G.profile; for (const id of ids) { const q = G.data.quests[id]; const e = P.quests.find(x => x.id === id); if (e) e.state = 'completed'; else P.quests.push({ id, state: 'completed', counts: q.objectives.map(o => o.count) }); } }, DONE);
  if (ZONE !== 'town') { await ev(z => G.travel(z), ZONE); await pg.waitForTimeout(800); await ready(); } await pg.waitForTimeout(3000);
  const r = await ev(id => { const n = G.zone.npcs.find(n => n.def.id === id); if (!n) return null; const p = G.player; p.pos.x = n.pos.x - 1.5; p.pos.z = n.pos.z - 4.5; return { pos: [n.pos.x, n.pos.z], name: n.def.name }; }, NPC);
  await pg.waitForTimeout(3000);
  await pg.screenshot({ path: `${OUT}/npcspot_${NPC}.png`, timeout: 300000 });
  console.log(JSON.stringify(r), 'errors', errs.slice(0, 4)); await b.close();
})();
