// 휴대폰 키패드 배치 확인: 공격 버튼 둘레 부채꼴(1·2·3·R), 왼쪽 대시·포션, 맨 위 대화 버튼.
// 버튼끼리·이동 패드 영역과 겹치는지 검사하고, 대시 버튼을 눌러 구르기(roll) 동작이 나오는지 확인.
// Usage: SIZES=390x844t,360x740t,1280x720 node tools/browser-tests/keypad.js -> OUT/keypad_<size>.png
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/keypad'; fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const sz of (process.env.SIZES || '390x844t').split(',')) {
    const touch = sz.endsWith('t'), [W, H] = sz.replace('t', '').split('x').map(Number);
    const pg = await (await b.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch })).newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    const ev = (f, a) => pg.evaluate(f, a);
    await pg.goto('http://localhost:8765/index.html');
    const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
    await ev(() => localStorage.clear()); await click('새 게임'); await click('모험 시작'); await pg.waitForSelector('.prologue.on', { timeout: 60000 }); await click('건너뛰기');
    await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && !document.querySelector('.prologue'), null, { timeout: 300000 });
    await pg.waitForTimeout(2500);
    const info = await ev(() => {
      const r = s => { const e = document.querySelector(s); if (!e || getComputedStyle(e).display === 'none') return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
      const names = ['attack', 'skill1', 'skill2', 'skill3', 'ult', 'dodge', 'potion', 'interact', 'skill4'], R = {};
      for (const n of names) R[n] = r('.abtn.' + n);
      const ov = [], list = names.filter(n => R[n]);
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const a = R[list[i]], c = R[list[j]], ca = [a.x + a.w / 2, a.y + a.h / 2], cc = [c.x + c.w / 2, c.y + c.h / 2];
        const gap = Math.hypot(ca[0] - cc[0], ca[1] - cc[1]) - (a.w + c.w) / 2; if (gap < 2) ov.push(`${list[i]}-${list[j]} ${gap.toFixed(1)}`);
      }
      const off = list.filter(n => R[n].x < 0 || R[n].y < 0 || R[n].x + R[n].w > innerWidth || R[n].y + R[n].h > innerHeight);
      return { R, ov, off, stick: r('.stickarea'), slots: G.player.sheet.book.sk.slots.length };
    });
    await pg.screenshot({ path: `${OUT}/keypad_${sz}.png`, clip: { x: 0, y: Math.max(0, H - Math.min(H, 440)), width: W, height: Math.min(H, 440) }, timeout: 300000 });
    // 대시 버튼 → 구르기
    const d = info.R.dodge; let roll = null;
    if (d) {
      await ev(() => { G.player.dodgeCd = 0; const B = G.player.body, o = B.play.bind(B); window._pl = []; B.play = (n, sp, r) => { if (n !== B.action || r) _pl.push(n + ' ' + ((new Error().stack.split('\n')[2] || '').trim().slice(3, 70))); return o(n, sp, r); }; });
      if (touch) await pg.touchscreen.tap(d.x + d.w / 2, d.y + d.h / 2); else await pg.mouse.click(d.x + d.w / 2, d.y + d.h / 2);
      await pg.waitForFunction(() => G.player.body.action === "roll" || window._pl.length > 0, null, { timeout: 5000 }).catch(() => {});
      roll = await ev(() => ({ action: G.player.body.action, pitch: +(G.player.body.mesh.rotation.x * 57.3).toFixed(0), dashT: +G.player.dashT.toFixed(2), plays: _pl }));
    }
    console.log(sz, JSON.stringify({ slots: info.slots, overlaps: info.ov, offscreen: info.off, skill4: info.R.skill4, stick: info.stick, roll }), 'errors', errs);
    console.log('  rects', JSON.stringify(info.R));
  }
  await b.close();
})();
