const { chromium } = require('playwright');
const fs = require('fs');
const SIM = process.env.SIM || 5; const STAGES = ['', 'a', 'b', 'c', 'd'];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript({ path: '/home/claude/webtest/bot.js' });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message + '\n' + e.stack));
  const log = (...a) => { const l = '[' + new Date().toTimeString().slice(0,8) + '] ' + a.join(' '); console.log(l); fs.appendFileSync('/tmp/play.log', l + '\n'); };
  const ckpt = async n => { const j = await ev(() => { G.save(); return localStorage.getItem('arcan_save_0'); }); fs.writeFileSync('/tmp/ckpt_' + n + '.json', j); log('checkpoint', n); };
  const START = process.env.START || '';
  const shot = async n => { await pg.screenshot({ path: `/tmp/p_${n}.png` }); log('shot', n); };
  const ev = (f, a) => Promise.race([pg.evaluate(f, a), new Promise((_, rej) => setTimeout(() => rej(new Error('evaluate HANG >20s')), 20000))]);
  const wait = ms => pg.waitForTimeout(ms);
  const has = async t => (await pg.locator('button:not([disabled])', { hasText: t }).count()) > 0;
  const click = async t => { await pg.locator('button:not([disabled])', { hasText: t }).first().click({ timeout: 5000 }); await wait(250); };
  const state = () => ev(() => { const p = G.player, P = G.profile; return p ? { zone: G.zone.def.id, lv: P.level, exp: P.exp, gold: P.gold, job: P.job, hp: Math.round(p.hp) + '/' + Math.round(p.maxHp), weapon: P.weapon, q: P.quests.map(q => q.id + ':' + ['L','A','act','ready','done'][G.quests.stateOf(G.data.quests[q.id])] + ':' + q.counts.join(',')).join(' '), spores: p.sheet.bag.count('m_spore'), win: G.ui.currentName, dead: p.dead } : null; });
  const S = async tag => log(tag, JSON.stringify(await state()));
  const goNear = async (x, z, tol = 1.2, ms = 150000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const d = await ev(([x, z]) => { const p = G.player; if (!p.path.length) p.setDest({ x, z }); return Math.hypot(p.pos.x - x, p.pos.z - z); }, [x, z]); if (d < tol) return true; await wait(200); } return false; };
  const talk = async id => {
    await ev(() => { if (G.ui.current && G.ui.closable) G.ui.close(); });
    const [x, z] = await ev(id => { const n = G.zone.npcs.find(n => n.def.id === id); return [n.pos.x, n.pos.z]; }, id);
    if (!await goNear(x, z - 1.3)) { log('walk to', id, 'timed out -> teleport'); await ev(([x, z]) => G.player.teleport({ x, z: z - 1.3 }), [x, z]); }
    for (let i = 0; i < 5; i++) { await pg.keyboard.down('KeyF'); await wait(700); await pg.keyboard.up('KeyF'); await wait(500); if (await ev(() => G.ui.currentName === 'dialog')) return true; }
    log('talk failed', id); return false;
  };
  const acceptAll = async () => { for (let k = 0; k < 4; k++) { if (!await has('[퀘스트]')) break; await click('[퀘스트]'); await click('수락하기'); } };
  const completeAll = async () => { for (let k = 0; k < 4; k++) { if (!await has('[완료]')) break; await click('[완료]'); await click('돌아가기'); } };
    await pg.route(/cdn\.jsdelivr\.net\/npm\/three@0\.160\.0\/examples\/jsm\/(.*)/, r => { const m = r.request().url().match(/examples\/jsm\/(.*)$/); r.fulfill({ path: '/tmp/three160/examples/jsm/' + m[1], contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } }); });
await pg.route('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js', r => r.fulfill({ path: '/opt/dl/three.module.js', contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } }));
  await pg.goto('http://localhost:8765/index.html?sim=' + SIM);
  await pg.waitForFunction(() => !document.getElementById('loading'), null, { timeout: 300000 });
  await wait(500); await pg.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('새 게임')), null, { timeout: 300000 }); await pg.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('새 게임')).click()); await wait(400);
  await pg.fill('#cName', '테스터'); await click('모험 시작');
  await pg.waitForFunction(() => G.inWorld && G.player && !G.loading, null, { timeout: 60000 }); await wait(800);
  const res = {};
  for (const id of (process.env.IDS||'').split(',').filter(Boolean).length ? process.env.IDS.split(',') : ['elder', 'master_blacksmith', 'master_pharmacist', 'merchant', 'master_hairdresser', 'armorer', 'master_cook', 'master_artist', 'guard']) {
    const t0 = Date.now();
    const ok = await talk(id);
    const btns = ok ? await pg.locator('#ui button:not([disabled])').allInnerTexts().catch(() => []) : [];
    let shop = null;
    if (ok && await has('상점')) { await click('상점'); await wait(400); shop = await pg.locator('.shoprow').count(); await pg.screenshot({ path: `/tmp/talk_${id}_shop.png` }); await click('X'); }
    else if (ok) await pg.screenshot({ path: `/tmp/talk_${id}.png` });
    res[id] = { ok, sec: Math.round((Date.now() - t0) / 1000), shopRows: shop, buttons: btns.slice(0, 6) };
    log(id, JSON.stringify(res[id]));
    await ev(() => { if (G.ui.current && G.ui.closable) G.ui.close(); });
  }
  log('ERRORS', JSON.stringify(errs));
  await b.close();
})();
