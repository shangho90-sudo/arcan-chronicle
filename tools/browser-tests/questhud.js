// Quest window / area banner / welcome notice check (new character -> elder -> reload), for several screen sizes.
// Usage: SIZES=1280x720,1920x1080,390x844t,844x390t node tools/browser-tests/questhud.js  -> OUT/qh_<size>_<step>.png + JSON log
// ('t' = touch device). Exits non-zero when a check fails.
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/qh'; fs.mkdirSync(OUT, { recursive: true });
const fails = []; const ok = (c, msg) => { console.log((c ? '  ok   ' : '  FAIL ') + msg); if (!c) fails.push(msg); };
const HUD = ['.charpanel', '.feed .feeditem', '.minimap', '.botbar', '.actions .abtn', '.stickbase', '.qhud:not(.closed)', '.qh-reopen.show', '.areabanner', '.target', '.prompt'];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const sz of (process.env.SIZES || '1280x720').split(',')) {
    console.log('== ' + sz);
    const touch = sz.endsWith('t'), [W, H] = sz.replace('t', '').split('x').map(Number);
    const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
    const pg = await ctx.newPage(); const errs = [];
    pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    const ev = (f, a) => pg.evaluate(f, a), wait = ms => pg.waitForTimeout(ms);
    // SwiftShader runs a few frames per second: wait for real game frames instead of wall-clock time
    await pg.addInitScript(() => { window.__fr = 0; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = f => raf(t => { window.__fr++; f(t); }); window.__banners = [];
      new MutationObserver(ms => { for (const m of ms) { for (const n of m.addedNodes) if (n.classList && n.classList.contains('areabanner')) window.__banners.push(['+', n.className, n.innerText, performance.now() | 0]);
        for (const n of m.removedNodes) if (n.classList && n.classList.contains('areabanner')) window.__banners.push(['-', n.className, n.innerText, performance.now() | 0]); } }).observe(document, { childList: true, subtree: true }); });
    const frames = async n => { const f0 = await ev(() => window.__fr); await pg.waitForFunction(([f0, n]) => window.__fr >= f0 + n, [f0, n], { timeout: 300000 }); };
    const keyFor = async (code, n) => { await pg.keyboard.down(code); await frames(n); await pg.keyboard.up(code); await frames(2); };
    const shot = n => pg.screenshot({ path: `${OUT}/qh_${sz}_${n}.png`, timeout: 300000 });
    const URL = (process.env.URL || 'http://localhost:8765/index.html') + '?sim=2';
    await pg.goto(URL, { timeout: 300000 });
    const clickLabel = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[role=button],[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)), t, { timeout: 300000 });
      await ev(t => [...document.querySelectorAll('button,[role=button],[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)).click(), t); await wait(400); };
    await ev(() => localStorage.clear());
    await clickLabel('새 게임'); await clickLabel('모험 시작');
    await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading, null, { timeout: 300000 });
    // overlap check of visible HUD boxes (interactive children of .actions are checked one by one)
    const overlaps = () => ev(sel => {
      const boxes = []; for (const s of sel) for (const e of document.querySelectorAll(s)) { const st = getComputedStyle(e); if (st.display === 'none' || st.visibility === 'hidden' || +st.opacity === 0) continue; const r = e.getBoundingClientRect(); if (r.width && r.height) boxes.push([s, r]); }
      const out = [], off = [];
      for (const [s, r] of boxes) if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) off.push(s);
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const [a, A] = boxes[i], [c, C] = boxes[j]; if (a === c) continue;
        const ix = Math.min(A.right, C.right) - Math.max(A.left, C.left), iy = Math.min(A.bottom, C.bottom) - Math.max(A.top, C.top); if (ix > 1 && iy > 1) out.push(a + ' x ' + c); }
      // only pairs that involve the new pieces count (older HUD pieces have their own layout checks)
      return { out: out.filter(t => /qhud|qh-reopen|areabanner/.test(t)), off, other: out.filter(t => !/qhud|qh-reopen|areabanner/.test(t)) };
    }, HUD);
    const qtext = () => ev(() => { const q = document.querySelector('.qhud'); return q.classList.contains('closed') ? '(closed)' : q.innerText.replace(/\s+/g, ' '); });
    // 1) right after the fade: area banner + quest window, no centre toasts
    await wait(300);
    const s1 = await ev(() => ({ banner: [...document.querySelectorAll('.areabanner')].map(e => e.innerText), toasts: [...document.querySelectorAll('.toast')].map(e => e.innerText), qwin: G.profile.ui.qwin || 'open' }));
    await shot('1_banner');
    ok(s1.banner.length === 1 && s1.banner[0].includes('아르칸'), 'area banner shows the zone name: ' + JSON.stringify(s1.banner));
    ok(!s1.toasts.some(t => /촌장|환영|아르칸/.test(t)), 'no centre toasts for start / zone: ' + JSON.stringify(s1.toasts));
    const t1 = await qtext(); console.log('   quest window:', t1);
    ok(t1.includes('분수 옆 촌장과 대화하기') && t1.includes('대화 완료 0/1') && t1.includes(touch ? '대화 버튼' : 'F 키 또는 대화 버튼'), 'first objective / progress / control hint in the quest window');
    let o = await overlaps(); ok(!o.out.length && !o.off.length, 'no HUD overlap at start ' + JSON.stringify(o));
    // 2) after the banner: welcome notice, banner gone
    await pg.waitForFunction(() => [...document.querySelectorAll('.areabanner.notice')].length, null, { timeout: 20000, polling: 50 }).catch(() => {});
    o = await overlaps(); ok(!o.out.length && !o.off.length, 'no HUD overlap during welcome ' + JSON.stringify(o));
    await shot('2_welcome');
    await pg.waitForFunction(() => !document.querySelector('.areabanner'), null, { timeout: 20000 }).catch(() => {});
    const log = await ev(() => window.__banners); console.log('   banner log:', JSON.stringify(log));
    const nAdd = log.find(l => l[0] === '+' && l[1].includes('notice')), bDel = log.find(l => l[0] === '-' && !l[1].includes('notice'));
    ok(nAdd && bDel && nAdd[2].includes('환영합니다') && nAdd[3] >= bDel[3] && log.filter(l => l[0] === '+').length === 2, 'welcome notice only after the area banner is gone');
    // 3) window buttons: no movement / attack from the click or tap
    const pstate = () => ev(() => { const p = G.player; return { x: +p.pos.x.toFixed(3), z: +p.pos.z.toFixed(3), path: p.path.length, tgt: !!p.target, anim: p.body && p.body.cur && p.body.cur.name, busy: !!(p.skills2 && p.skills2.busy) }; });
    const press = async sel => { const r = await ev(s => { const e = document.querySelector(s); const b = e.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; }, sel);
      if (touch) await pg.touchscreen.tap(r[0], r[1]); else await pg.mouse.click(r[0], r[1]); await frames(3); };
    const before = await pstate();
    await press('.qh-min'); ok(await ev(() => document.querySelector('.qhud').classList.contains('min')), 'collapse -> min');
    const tmin = await qtext(); ok(tmin.includes('분수 옆 촌장과 대화하기') && !tmin.includes('조작 안내'), 'collapsed shows the title + current objective only: ' + tmin);
    await shot('3_min');
    await press('.qh-min'); ok(await ev(() => !document.querySelector('.qhud').classList.contains('min')), 'expand again');
    await press('.qh-x'); ok(await ev(() => document.querySelector('.qhud').classList.contains('closed') && document.querySelector('.qh-reopen').classList.contains('show')), 'close -> small quest button');
    await shot('4_closed');
    await press('.qh-reopen'); ok(await ev(() => !document.querySelector('.qhud').classList.contains('closed')), 'reopen from the quest button');
    const after = await pstate();
    ok(after.x === before.x && after.z === before.z && !after.path && !after.tgt, 'window clicks did not move / target: ' + JSON.stringify([before, after]));
    if (!touch) {
      await keyFor('KeyL', 2); ok(await ev(() => G.profile.ui.qwin === 'closed'), 'L closes');
      await keyFor('KeyL', 2); ok(await ev(() => G.profile.ui.qwin === 'open'), 'L opens');
      // focus is not left on a window button: Space must attack, not press the button
      await press('.qh-min'); await press('.qh-min');
      const st0 = await ev(() => G.profile.ui.qwin);
      await keyFor('Space', 3); await frames(40);
      ok(await ev(() => G.profile.ui.qwin) === st0, 'Space after a window click does not toggle the window');
      // move with the window open
      const p0 = await pstate(); await keyFor('KeyD', 30);
      const p1 = await pstate(); ok(Math.hypot(p1.x - p0.x, p1.z - p0.z) > 0.5, 'moves with the window open ' + JSON.stringify([p0, p1]));
      // clicking the ground next to the window still moves
      const g0 = await pstate(); await pg.mouse.click(W * 0.3, H * 0.62); await frames(20); const g1 = await pstate();
      ok(Math.hypot(g1.x - g0.x, g1.z - g0.z) > 0.3 || g1.path > 0, 'ground click outside the window still moves');
    }
    // 4) talk to the elder: F alone (opening the dialog) does not complete the step; accepting the elder's quest does
    await ev(() => { const n = G.zone.npcs.find(n => n.def.id === 'elder'); G.player.teleport({ x: n.pos.x, z: n.pos.z - 1.3 }); G.player.path = []; });
    await frames(8);
    o = await overlaps(); ok(!o.out.length && !o.off.length && await ev(() => getComputedStyle(document.querySelector('.prompt')).display !== 'none'), 'talk prompt visible and clear of the quest window ' + JSON.stringify(o));
    await shot('4b_prompt');
    await ev(() => G.interact(G.zone.npcs.find(n => n.def.id === 'elder')));
    await wait(400);
    ok(await ev(() => G.ui.currentName) === 'dialog', 'elder dialog open');
    ok((await qtext()).includes('대화 완료 0/1'), 'opening the dialog alone does not complete the step');
    await shot('5_dialog');
    await clickLabel('[퀘스트]'); await clickLabel('수락하기');
    await ev(() => G.ui.close()); await wait(400);
    const t5 = await qtext(); console.log('   after accept:', t5);
    ok(t5.includes('완료') && t5.includes('분수 옆 촌장과 대화하기'), 'completed step shown with a check for a moment');
    ok(t5.includes('새로운 시작') && t5.includes('대장장이 철산과 대화하기'), 'next objective (elder quest) shown');
    ok(!(await ev(() => [...document.querySelectorAll('.toast')].map(e => e.innerText).join('|'))).includes('퀘스트 수락'), 'no centre "퀘스트 수락" toast');
    await shot('6_done');
    await wait(2600); await ev(() => G.ui.renderQuestHud());
    const t6 = await qtext(); console.log('   later:', t6);
    ok(!t6.includes('분수 옆 촌장과 대화하기') && t6.includes('대장장이 철산과 대화하기'), 'tutorial step gone after the highlight');
    await shot('7_next');
    // 5) collapse state persists; reload does not bring back the finished step or the welcome
    await press('.qh-min');
    await ev(() => G.save());
    await pg.goto(URL, { timeout: 300000 });
    await clickLabel('불러오기'); await clickLabel('불러오기');   // title 불러오기 → first row (자동 저장)
    await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading, null, { timeout: 300000 });
    await wait(300);
    const s7 = await ev(() => ({ qwin: G.profile.ui.qwin, cls: document.querySelector('.qhud').className, banner: [...document.querySelectorAll('.areabanner')].map(e => e.innerText) }));
    ok(s7.qwin === 'min' && s7.cls.includes('min'), 'collapsed state restored after reload');
    const t7 = await qtext(); ok(!t7.includes('분수 옆 촌장') && t7.includes('대장장이 철산과 대화하기'), 'after reload: no finished step, current objective shown: ' + t7);
    await wait(3600);
    ok(!(await ev(() => [...document.querySelectorAll('.areabanner.notice')].length)), 'no welcome notice on continue');
    // 6) zone change: still not shown, window stays collapsed; a fight with the window open
    await ev(() => G.loadZone('forest', 'from_town', false)); await pg.waitForFunction(() => !G.loading && G.zone.def.id === 'forest', null, { timeout: 300000 });
    await press('.qh-min');
    const t8 = await qtext(); ok(!t8.includes('분수 옆 촌장'), 'zone change: finished step not shown');
    const fight = await ev(() => { const p = G.player, m = G.zone.actors.find(a => a !== p && a.hp > 0 && a.def && !a.def.boss); if (!m) return null; p.teleport({ x: m.pos.x, z: m.pos.z - 1.6 }); G.render.setFocus(p.pos, true); return m.hp; });
    if (fight != null && !touch) { await frames(3); for (let i = 0; i < 6; i++) await keyFor('Space', 12); }
    else if (fight != null) { for (let i = 0; i < 6; i++) { await ev(() => G.input.press('attack')); await frames(12); } }
    const hit = await ev(() => G.zone.actors.some(a => a !== G.player && a.def && a.hp < a.maxHp));
    ok(fight == null || hit, 'combat works with the window open (a monster took damage)');
    await wait(1200); await shot('8_forest');
    o = await overlaps(); ok(!o.out.length && !o.off.length, 'no HUD overlap in the forest ' + JSON.stringify(o));
    ok(!errs.length, 'no page errors ' + JSON.stringify(errs.slice(0, 4)));
    await ctx.close();
  }
  await b.close();
  console.log(fails.length ? `FAILED ${fails.length}` : 'ALL OK'); process.exit(fails.length ? 1 : 0);
})();
