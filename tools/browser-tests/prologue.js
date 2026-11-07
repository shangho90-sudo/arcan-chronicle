// 새 게임 → 캐릭터 만들기 → 프롤로그(그림 + 대화창) → 마을. Screenshots of every panel and the ending card.
// Usage: SIZES=1280x720,390x844t node tools/browser-tests/prologue.js -> OUT/pro_<size>_*.png
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/pro'; fs.mkdirSync(OUT, { recursive: true });
const fails = []; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails.push(m); };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const sz of (process.env.SIZES || '1280x720').split(',')) {
    console.log('== ' + sz);
    const touch = sz.endsWith('t'), [W, H] = sz.replace('t', '').split('x').map(Number);
    const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
    const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    const ev = (f, a) => pg.evaluate(f, a), shot = n => pg.screenshot({ path: `${OUT}/pro_${sz}_${n}.png`, timeout: 300000 });
    const S = 'button,[role=button],[aria-label]';
    const click = async t => { await pg.waitForFunction(([S, t]) => [...document.querySelectorAll(S)].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), [S, t], { timeout: 300000 });
      await ev(([S, t]) => [...document.querySelectorAll(S)].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), [S, t]); await pg.waitForTimeout(400); };
    await pg.goto('http://localhost:8765/index.html', { timeout: 300000 });
    await ev(() => localStorage.clear()); await pg.reload({ timeout: 300000 });
    await click('새 게임'); await click('모험 시작');
    await pg.waitForSelector('.prologue.on', { timeout: 60000 }); await pg.waitForTimeout(2500);
    ok(await ev(() => !G.inWorld), 'prologue plays before the character enters the world');
    const tap = () => pg.mouse.click(W / 2, H / 3);
    let n = 0, guard = 0, last = '';
    while (guard++ < 200) {
      const st = await ev(() => { const P = document.querySelector('.prologue'); if (!P || P.classList.contains('ending')) return null; return { line: P.dataset.line || '', typing: P.dataset.typing === '1', who: P.querySelector('.pl-who').textContent }; });
      if (!st) break;
      if (st.line && st.line !== last) {
        if (st.typing) { await pg.waitForTimeout(n === 0 ? 1200 : 300); await tap(); }    // finish the typewriter (line 0: let it type a bit first)
        await pg.waitForTimeout(250); await shot(String(n).padStart(2, '0'));
        const full = await ev(() => document.querySelector('.pl-text').textContent);
        console.log('  line', n, st.line, st.who ? '[' + st.who + ']' : '', full.slice(0, 44)); n++; last = st.line;
        await tap();
      }
      await pg.waitForTimeout(300);
    }
    ok(n === 16, 'all 16 narration lines shown (' + n + ')');
    const e1 = await ev(() => { const e = document.querySelector('.pl-e1'); return e && e.textContent; });
    await pg.waitForTimeout(1500); await shot('zz_ending');
    ok(e1 === '그리고 지금.', 'ending card');
    await pg.waitForFunction(() => !document.querySelector('.prologue') && window.G && G.inWorld && G.player && !G.loading, null, { timeout: 300000 });
    await pg.waitForTimeout(2000); await shot('zz_town');
    ok(true, 'entered the town after the prologue');
    // skip button + replay from the pause menu
    await ev(() => G.ui.showPause()); await click('프롤로그 보기');
    await pg.waitForSelector('.prologue.on', { timeout: 60000 }); await pg.waitForTimeout(1500);
    await click('건너뛰기'); await pg.waitForFunction(() => !document.querySelector('.prologue'), null, { timeout: 60000 });
    ok(await ev(() => G.inWorld && !G.paused), 'replay from the pause menu + skip returns to the game');
    ok(!errs.length, 'no page errors ' + JSON.stringify(errs));
    await ctx.close();
  }
  await b.close(); if (fails.length) { console.log('FAILED', fails); process.exit(1); }
})();
