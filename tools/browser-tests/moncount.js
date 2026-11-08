// 필드 몬스터 수 확인: 같은 필드를 배율 1(예전)과 config.json fieldMonsterMul(지금)로 각각 들어가서 계획 수·실제로 생긴 수를 비교.
// Usage: ZONES=forest,mushroom_grove node tools/browser-tests/moncount.js
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: 800, height: 600 } })).newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto('http://localhost:8765/index.html');
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(() => localStorage.clear()); await click('새 게임'); await click('모험 시작'); await pg.waitForSelector('.prologue.on', { timeout: 60000 }); await click('건너뛰기');
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && !document.querySelector('.prologue'), null, { timeout: 300000 });
  const mulNow = await ev(() => G.data.config.fieldMonsterMul);
  for (const z of (process.env.ZONES || 'forest').split(',')) {
    const row = { zone: z };
    for (const mul of [1, mulNow]) {
      await ev(([z, mul]) => { G.data.config.fieldMonsterMul = mul; G.loadZone(z); }, [z, mul]);
      await pg.waitForFunction(z => G.zone && G.zone.def.id === z && !G.loading, z, { timeout: 300000 }); await pg.waitForTimeout(1500);
      row['x' + mul] = await ev(() => { const Z = G.zone; return { planned: Z.spawners.reduce((a, s) => a + s.def.count, 0), alive: Z.spawners.reduce((a, s) => a + s.alive.length, 0) }; });
    }
    console.log(JSON.stringify(row));
  }
  console.log('errors', errs.slice(0, 3)); await b.close();
})();
