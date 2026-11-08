// 휴대폰 록온: 가까이 온 몬스터 자동 록온 → 멀어지면 풀림 → 근처에 다른 몬스터가 오면 다시 록온, 더 가까운 몬스터로 바뀜.
// Usage: node tools/browser-tests/lockmobile.js  (390x844 터치, 속삭이는 숲)
const { chromium } = require('playwright');
const fails = []; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails.push(m); };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto('http://localhost:8765/index.html', { timeout: 300000 });
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(() => localStorage.clear()); await click('새 게임'); await click('모험 시작'); await pg.waitForSelector('.prologue.on', { timeout: 60000 }); await click('건너뛰기');
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && !document.querySelector('.prologue'), null, { timeout: 300000 });
  await ev(() => G.loadZone('forest', 'from_town')); await pg.waitForFunction(() => G.zone && G.zone.def.id === 'forest' && !G.loading, null, { timeout: 300000 });
  await pg.waitForTimeout(2000);
  const r = await ev(() => {
    G.frame = () => {}; G.input.mobile = true; const p = G.player, c = { x: 36, z: -30 };
    const mons = G.zone.actors.filter(a => a !== p && a.def && !a.dead);
    for (const m of mons) { m.teleport({ x: c.x + 60, z: c.z + 60 }); m.thinkStep = () => {}; }
    const [A, B] = mons; const step = n => { for (let i = 0; i < n; i++) G.step(1 / 30, false); };
    const at = (m, dx, dz) => { m.teleport({ x: p.pos.x + dx, z: p.pos.z + dz }); m.state = 'idle'; };
    p.teleport(c); step(5); const out = {};
    at(A, 3, 0); step(5); out.near = p.lockOn === A;
    p.teleport({ x: c.x - 14, z: c.z }); step(5); out.walkedAway = p.lockOn === null;
    at(B, -2.5, 1); step(5); out.relock = p.lockOn === B;
    at(A, 0, 5); at(B, 0, 6.2); p.lockOn = B; step(2); at(A, 1.2, 0.5); step(5); out.switchCloser = p.lockOn === A;
    at(B, 2, 0); at(A, 2.6, 0.6); p.lockOn = A; step(5); out.keepWhenClose = p.lockOn === A;
    return out;
  });
  console.log(JSON.stringify(r));
  ok(r.near, 'a monster that comes close gets locked'); ok(r.walkedAway, 'walking away lets go of the lock');
  ok(r.relock, 'another monster nearby is locked again'); ok(r.switchCloser, 'a clearly closer monster takes over from a farther lock');
  ok(r.keepWhenClose, 'a lock that is still close is kept (no flicker between two close monsters)');
  ok(!errs.length, 'no page errors ' + JSON.stringify(errs));
  await b.close(); if (fails.length) process.exit(1);
})();
