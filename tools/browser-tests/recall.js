// 마을 귀환 버튼(포션 위, H 키) 확인: 숲으로 옮긴 뒤 버튼을 눌러 3초 후 마을로 돌아가는지, 움직이면/맞으면 취소되는지, 마을에서는 안 되는지.
// Usage: SIZES=390x844t,1280x720 node tools/browser-tests/recall.js -> OUT/recall_<size>.png
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/recall'; fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const sz of (process.env.SIZES || '390x844t').split(',')) {
    const touch = sz.endsWith('t'), [W, H] = sz.replace('t', '').split('x').map(Number);
    const pg = await (await b.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch })).newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    const ev = (f, a) => pg.evaluate(f, a);
    await pg.goto('http://localhost:8765/index.html');
    const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
    await ev(() => localStorage.clear()); await click('새 게임'); await click('모험 시작'); await pg.waitForSelector('.prologue.on', { timeout: 60000 }); await click('건너뛰기');
    const ready = () => pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.zone && !document.querySelector('.prologue'), null, { timeout: 300000 });
    await ready(); await pg.waitForTimeout(1500);
    const R = {}; const tap = async () => { const r = await ev(() => { const b = document.querySelector('.abtn.recall').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }); if (touch) await pg.touchscreen.tap(r[0], r[1]); else await pg.keyboard.press('KeyH'); };
    await tap(); await pg.waitForTimeout(300); R.inTown = await ev(() => ({ zone: G.zone.def.id, recallT: G.player.recallT, dim: document.querySelector('.abtn.recall').classList.contains('dim') }));
    await ev(() => G.travel('forest')); await pg.waitForTimeout(800); await ready(); await pg.waitForTimeout(1500);
    // 1) 움직이면 취소
    await tap(); await pg.waitForTimeout(400); await ev(() => { G.input.stick = { x: 1, y: 0 }; }); await pg.waitForTimeout(600); await ev(() => { G.input.stick = { x: 0, y: 0 }; });
    R.moveCancel = await ev(() => ({ zone: G.zone.def.id, recallT: +G.player.recallT.toFixed(2) }));
    // 2) 맞으면 취소
    await pg.waitForTimeout(500); await tap(); await pg.waitForTimeout(400);
    await ev(() => { const p = G.player, src = G.zone.actors.find(a => a !== p && !a.dead) || null; p.takeDamage({ amount: 1, noMiss: true, source: src }); });
    R.hitCancel = await ev(() => ({ zone: G.zone.def.id, recallT: +G.player.recallT.toFixed(2) }));
    // 3) 끝까지 → 마을
    await pg.waitForTimeout(500); await tap(); await pg.waitForTimeout(1200);
    R.mid = await ev(() => ({ recallT: +G.player.recallT.toFixed(2), going: document.querySelector('.abtn.recall').classList.contains('going'), num: document.querySelector('.abtn.recall .cdt').textContent }));
    await pg.screenshot({ path: `${OUT}/recall_${sz}.png`, clip: { x: 0, y: Math.max(0, H - Math.min(H, 460)), width: W, height: Math.min(H, 460) }, timeout: 300000 });
    await pg.waitForFunction(() => G.zone && G.zone.def.kind === 'town' && !G.loading, null, { timeout: 300000 }).catch(() => {});
    R.done = await ev(() => ({ zone: G.zone.def.id, kind: G.zone.def.kind, return: G.profile.returnZone }));
    R.rect = await ev(() => { const r = s => { const b = document.querySelector(s).getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width)]; }; return { potion: r('.abtn.potion'), recall: r('.abtn.recall'), interact: r('.abtn.interact'), skill3: r('.abtn.skill3') }; });
    console.log(sz, JSON.stringify(R), 'errors', errs.slice(0, 4));
    await pg.context().close();
  }
  await b.close();
})();
