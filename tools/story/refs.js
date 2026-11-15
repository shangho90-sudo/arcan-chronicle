// 주요 인물의 3D 반신 렌더(게임이 그림 대신 쓰는 것)를 PNG로 저장 — tools/story/portraits.py의 참고 그림(REFS).
// Usage: (cd repo && python3 -m http.server 8813 &)  URL=http://localhost:8813/index.html OUT=/tmp/story_refs NODE_PATH=$(npm root -g) node tools/story/refs.js
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/story_refs', URL = process.env.URL || 'http://localhost:8813/index.html'; fs.mkdirSync(OUT, { recursive: true });
const KEYS = (process.env.KEYS || 'astel,castilla,kylus,kerin,justina,roderick,elder,capital_merchant,yoisen,daisen,chirzen,chirkai,derkai,yanber,berion,boldran,erdin,ruin_monk').split(',');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: 800, height: 600 } })).newPage();
  await pg.goto(URL, { timeout: 300000 }); await pg.evaluate(() => localStorage.clear()); await pg.reload({ timeout: 300000 });
  const S = 'button,[role=button],[aria-label]';
  const click = async t => { await pg.waitForFunction(([S, t]) => [...document.querySelectorAll(S)].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), [S, t], { timeout: 300000 }); await pg.evaluate(([S, t]) => [...document.querySelectorAll(S)].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), [S, t]); await pg.waitForTimeout(500); };
  await click('새 게임'); await click('모험 시작'); await pg.waitForSelector('.prologue.on', { timeout: 60000 }); await click('건너뛰기');
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && !G.input.block, null, { timeout: 400000 });
  for (const k of KEYS) {
    const url = await pg.evaluate(async k => (await import('./js/storyscene.js')).castBust(G, k), k);
    if (!url) { console.log(k, '없음'); continue; }
    fs.writeFileSync(`${OUT}/${k}.png`, Buffer.from(url.split(',')[1], 'base64')); console.log(k, 'ok');
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(2); });
