// 마을 간 워프(워프 안내인): 새 캐릭터는 아르칸만 열림 → 카이리온 왕도에 가면 둘 다 열림 → 삯을 내고 아르칸으로 돌아옴.
// Usage: URL=http://localhost:8765/index.html SIZES=1280x720,390x844t node tools/browser-tests/townwarp.js -> OUT/tw_<size>_*.png
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/tw', URL = process.env.URL || 'http://localhost:8765/index.html'; fs.mkdirSync(OUT, { recursive: true });
const fails = []; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails.push(m); };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const sz of (process.env.SIZES || '1280x720,390x844t').split(',')) {
    console.log('== ' + sz);
    const touch = sz.endsWith('t'), [W, H] = sz.replace('t', '').split('x').map(Number);
    const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
    const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    const ev = (f, a) => pg.evaluate(f, a), shot = n => pg.screenshot({ path: `${OUT}/tw_${sz}_${n}.png`, timeout: 300000 });
    const S = 'button,[role=button],[aria-label]';
    const find = t => pg.waitForFunction(([S, t]) => [...document.querySelectorAll(S)].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), [S, t], { timeout: 300000 });
    const click = async t => { await find(t); await ev(([S, t]) => [...document.querySelectorAll(S)].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), [S, t]); await pg.waitForTimeout(500); };
    const inZone = id => pg.waitForFunction(id => window.G && G.inWorld && G.zone && G.zone.def.id === id && G.player && !G.loading && !G.input.block, id, { timeout: 400000 });
    const keeper = () => ev(() => { const n = G.zone.npcs.find(n => n.def.role === 'warp'); if (!n) return null; const p = G.player, L = Math.hypot(n.pos.x, n.pos.z) || 1; p.teleport({ x: n.pos.x - n.pos.x / L * 1.6, z: n.pos.z - n.pos.z / L * 1.6 }); p.setFacing(n.pos.x / L, n.pos.z / L); p.body.place(p.pos); G.render.setFocus(p.pos, true); return { id: n.def.id, name: n.def.name, title: n.def.title }; });
    const talk = async () => { if (touch) await ev(() => G.interact(G.zone.nearestNpc(G.player.pos, 3))); else await pg.keyboard.press('f'); await pg.waitForTimeout(700); };
    const rows = () => ev(() => [...document.querySelectorAll('.window.townwarp .twrow')].map(r => ({ id: r.dataset.town, cur: r.classList.contains('cur'), locked: r.classList.contains('locked'), btn: !!r.querySelector('button'), dis: !!(r.querySelector('button') && r.querySelector('button').disabled), text: r.innerText.replace(/\s+/g, ' ') })));
    await pg.goto(URL, { timeout: 300000 }); await ev(() => localStorage.clear()); await pg.reload({ timeout: 300000 });
    await click('새 게임'); await click('모험 시작'); await pg.waitForSelector('.prologue.on', { timeout: 60000 }); await click('건너뛰기');
    await pg.waitForFunction(() => !document.querySelector('.prologue'), null, { timeout: 300000 }); await inZone('town');
    ok(JSON.stringify(await ev(() => G.profile.towns)) === '["town"]', '새 캐릭터: 가 본 마을 = 아르칸');
    const k = await keeper(); ok(k && k.title === '워프 안내인', '아르칸 워프 안내인 ' + JSON.stringify(k)); await pg.waitForTimeout(5000); await shot('1_keeper');
    await talk(); ok(await ev(() => G.ui.currentName === 'dialog' && [...document.querySelectorAll('.window button')].some(b => b.textContent.trim() === '마을 이동')), (touch ? '대화' : 'F 키') + ' → 대화창에 "마을 이동"');
    await click('마을 이동'); await pg.waitForTimeout(500); let r = await rows(); await shot('2_locked');
    ok(r.length === 9 && r.filter(x => x.cur).length === 1 && r[0].id === 'town' && r.filter(x => x.locked).length === 8 && !r.some(x => x.btn), '아르칸만 열림, 8곳 잠김, 이동 단추 없음');
    ok(r.filter(x => x.locked).every(x => x.text.includes('아직 가 보지 않은 곳')), '잠긴 곳 문구');
    ok(await ev(() => G.townWarp('kairion_capital') === false && G.zone.def.id === 'town'), '안 가 본 마을은 직접 불러도 막힘');
    await ev(() => G.ui.close());
    // 걸어서(여기서는 존 이동으로) 카이리온 왕도에 들어감 → 발견
    await ev(() => { G.profile.gold = 500; G.loadZone('kairion_capital', 'from_capital_road'); }); await inZone('kairion_capital'); await pg.waitForTimeout(1600);
    ok(JSON.stringify(await ev(() => G.profile.towns)) === '["town","kairion_capital"]', '카이리온에 들어가면 둘 다 열림');
    ok(await ev(() => [...document.querySelectorAll('.toast, .toasts *')].some(t => /새 마을 발견/.test(t.textContent))), '"새 마을 발견" 알림');
    const k2 = await keeper(); ok(k2 && k2.id === 'warp_kairion_capital', '왕도 워프 안내인 ' + JSON.stringify(k2)); await pg.waitForTimeout(5000); await shot('3_keeper_kairion');
    await ev(() => { G.profile.gold = 10; }); await talk(); await click('마을 이동'); r = await rows();
    const row = r.find(x => x.id === 'town'); ok(row && row.btn && row.dis && /골드 부족/.test(row.text), '골드가 모자라면 이동 단추 꺼짐 ' + (row && row.text)); await shot('4_poor');
    await ev(() => { G.ui.close(); G.profile.gold = 500; }); await talk(); await click('마을 이동'); r = await rows(); await shot('5_open');
    ok(r.filter(x => !x.locked).length === 2 && r.find(x => x.id === 'town').btn && !r.find(x => x.id === 'town').dis && r[0].id === 'kairion_capital' && r[0].cur, '왕도(지금 있는 곳)·아르칸(이동 가능), 7곳 잠김');
    const price = await ev(() => +document.querySelector('.twrow[data-town=town] .twprice').textContent.replace(/[^0-9]/g, ''));
    await ev(() => document.querySelector('.twrow[data-town=town] button').click()); await pg.waitForTimeout(300); await shot('6_flash');
    await inZone('town'); await pg.waitForTimeout(1500);
    const st = await ev(() => { const s = G.zone.def.spawns.find(s => s.id === 'warp'), p = G.player.pos; return { gold: G.profile.gold, d: Math.hypot(p.x - s.pos[0], p.z - s.pos[1]), ret: G.profile.returnZone }; });
    ok(price > 0 && st.gold === 500 - price, `삯 ${price} G 냄 (500 → ${st.gold})`); ok(st.d < 1.5 && st.ret === 'town', '아르칸 워프 안내인 앞에 도착 ' + st.d.toFixed(2));
    await pg.waitForTimeout(4000); await shot('7_arrived');
    // 지역 지도 NPC 목록에 안내인
    await ev(() => G.ui.showAreaMap()); await pg.waitForTimeout(2500); ok(await ev(() => /워프 안내인/.test(document.querySelector('.amitems') ? document.querySelector('.amitems').innerText : '')), '지역 지도 NPC 목록에 워프 안내인'); await shot('8_areamap');
    ok(errs.length === 0, 'page errors ' + JSON.stringify(errs.slice(0, 3))); await ctx.close();
  }
  console.log(fails.length ? 'FAILED ' + fails.length : 'all ok'); await b.close(); process.exit(fails.length ? 1 : 0);
})();
