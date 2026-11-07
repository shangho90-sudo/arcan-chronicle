// Quest window 메인/서브 tabs + quest HUD category badges. Usage: SIZES=1280x720,390x844t node tools/browser-tests/questcats.js -> OUT/qc_<size>_*.png
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/qc'; fs.mkdirSync(OUT, { recursive: true });
const fails = []; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails.push(m); };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const sz of (process.env.SIZES || '1280x720').split(',')) {
    const touch = sz.endsWith('t'), [W, H] = sz.replace('t', '').split('x').map(Number);
    const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
    const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    const ev = (f, a) => pg.evaluate(f, a), shot = n => pg.screenshot({ path: `${OUT}/qc_${sz}_${n}.png`, timeout: 300000 });
    await pg.goto('http://localhost:8765/index.html?sim=2', { timeout: 300000 });
    const S = 'button,[role=button],[aria-label]', has = (b, t) => (b.getAttribute('aria-label') || b.textContent || '').includes(t);
    const click = async t => { await pg.waitForFunction(([S, t]) => [...document.querySelectorAll(S)].some(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)), [S, t], { timeout: 300000 });
      await ev(([S, t]) => [...document.querySelectorAll(S)].find(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)).click(), [S, t]); await pg.waitForTimeout(400); };
    await ev(() => localStorage.clear()); await click('새 게임'); await click('모험 시작');
    await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading, null, { timeout: 300000 });
    // story: q1 done, q2 + job quest active; side: rabbit hunt active (6/10)
    await ev(() => { const ql = G.quests; ql.accept('q1_start'); ql.notify('talk', 'master_blacksmith', 1); const p = ql.find('q1_start'); p.state = 'completed';
      ql.accept('q2_merchant'); ql.accept('q_job1'); ql.accept('q3_slime'); for (let i = 0; i < 6; i++) ql.notify('kill', G.data.quests.q3_slime.objectives[0].target, 1); G.profile.ui.track = null; G.ui.renderQuestHud(true); });
    await pg.waitForTimeout(2500); await ev(() => G.ui.renderQuestHud(true)); await pg.waitForTimeout(300); await shot('1_hud');
    const hud = await ev(() => [...document.querySelectorAll('.qhud .qh-cat')].map(e => e.textContent + ':' + e.parentElement.textContent));
    console.log('  hud', JSON.stringify(hud));
    ok(hud.length >= 2 && hud[0].startsWith('메인') && hud[hud.length - 1].startsWith('서브'), 'HUD: 메인 first, 서브 last');
    await ev(() => G.ui.showQuests()); await pg.waitForTimeout(600); await shot('2_main');
    const m = await ev(() => ({ on: document.querySelector('.qtab.on').textContent, items: [...document.querySelectorAll('.qitem > b')].map(e => e.textContent) }));
    console.log('  main tab', JSON.stringify(m));
    await ev(() => document.querySelector('.qtab.sub').click()); await pg.waitForTimeout(600); await shot('3_sub');
    const s = await ev(() => ({ on: document.querySelector('.qtab.on').textContent, items: [...document.querySelectorAll('.qitem > b')].map(e => e.textContent) }));
    console.log('  sub tab', JSON.stringify(s));
    ok(m.items.includes('마을 상인 모아') && !m.items.includes('숲 토끼 소동'), 'main tab: story quests only');
    ok(s.items.length === 1 && s.items[0] === '숲 토끼 소동', 'sub tab: side quest only');
    ok(!errs.length, 'no page errors ' + JSON.stringify(errs));
    await ctx.close();
  }
  await b.close(); if (fails.length) { console.log('FAILED', fails); process.exit(1); }
})();
