// 미니맵·지역 지도의 상점/전직 NPC 아이콘 확인 (js/mapicons.js).
// Usage: URL=http://localhost:8765 SIZES=1280x720,390x844t ZONES=town,kairion_capital,baltern node tools/browser-tests/mapicons.js
//  -> 데이터에서 마을 9곳 표(무기·방어구·물약·대장간·전직) 출력, 게임에서 같은 아이콘이 그려지는지 확인(실패 시 exit 1),
//     OUT/mapicons_<zone>_<mini|area|side>_<size>.png (2배 확대 캡처)
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const OUT = process.env.OUT || '/tmp/mapicons'; fs.mkdirSync(OUT, { recursive: true });
const URL = process.env.URL || 'http://localhost:8765', ROOT = path.join(__dirname, '..', '..');
const SHOP = { shop_weapons: 'weapon', shop_armor: 'armor', shop_general: 'potion', shop_pharmacy: 'potion', shop_forge: 'forge', shop_smithy: 'forge' };
const kindOf = d => d.role === 'jobmaster' && d.job ? 'job_' + d.job : SHOP[d.shop] || '';
const J = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const npcs = J('assets/data/npcs.json'), zones = J('assets/data/zones.json');
const N = Array.isArray(npcs) ? Object.fromEntries(npcs.map(n => [n.id, n])) : (npcs.npcs ? Object.fromEntries(npcs.npcs.map(n => [n.id, n])) : npcs);
const Z = zones.zones || zones, zl = Array.isArray(Z) ? Z : Object.values(Z);
const expect = {}; let fail = 0;
for (const st of zl) {
  if (!st || !st.id) continue;
  const d = st.file ? J(path.join('assets/data', st.file).replace(/^assets\/data\/assets\/data\//, 'assets/data/')) : st; if (d.kind !== 'town') continue;
  const row = {}; for (const n of d.npcs || []) { const def = N[n.npc || n.id]; if (!def) continue; const k = kindOf(def); if (k) (row[k] = row[k] || []).push(def.name); }
  expect[d.id] = row;
  const c = k => (row[k] || []).join('·') || '-';
  console.log(`${(d.name + '          ').slice(0, 10)} 무기 ${c('weapon')} | 방어구 ${c('armor')} | 물약 ${c('potion')} | 대장간 ${c('forge')} | 전직 ${Object.keys(row).filter(k => k.startsWith('job_')).map(k => k.slice(4) + ':' + row[k]).join(' ') || '-'}`);
  for (const k of ['weapon', 'armor', 'potion']) if (!row[k]) { console.log('  !! ' + d.id + ' 에 ' + k + ' 상인이 없음'); fail++; }
}
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const sz of (process.env.SIZES || '1280x720,390x844t').split(',')) {
    const touch = sz.endsWith('t'), [W, H] = sz.replace('t', '').split('x').map(Number);
    const pg = await (await b.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch, deviceScaleFactor: +(process.env.DSF || 1) })).newPage(); const errs = [];
    pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    const ev = (f, a) => pg.evaluate(f, a);
    await pg.goto(URL + '/index.html');
    const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
    await ev(() => localStorage.clear()); await click('새 게임'); await click('모험 시작'); await pg.waitForSelector('.prologue.on', { timeout: 60000 }); await click('건너뛰기');
    const ready = () => pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.zone && !document.querySelector('.prologue'), null, { timeout: 900000 });
    await ready(); await pg.waitForTimeout(1500);
    const clip = async (sel, file) => { const r = await ev(s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.max(0, b.x), y: Math.max(0, b.y), width: Math.min(innerWidth - Math.max(0, b.x), b.width), height: Math.min(innerHeight - Math.max(0, b.y), b.height) }; }, sel); if (r && r.width > 4 && r.height > 4) await pg.screenshot({ path: file, clip: r, timeout: 900000 }); };
    for (const zid of (process.env.ZONES || 'town,kairion_capital,baltern').split(',')) {
      if (zid !== 'town') { await ev(z => G.travel(z), zid); await pg.waitForTimeout(800); await ready(); await pg.waitForTimeout(2500); }
      // 아이콘 NPC가 가장 많이 모인 곳 옆에 서서 미니맵을 찍음
      const at = await ev(() => { const L = G.zone.npcs.filter(n => n.def.shop || n.def.role === 'jobmaster'); let best = L[0], bn = -1;
        for (const a of L) { const c = L.filter(o => Math.hypot(o.pos.x - a.pos.x, o.pos.z - a.pos.z) < 18).length; if (c > bn) { bn = c; best = a; } }
        if (best) { G.player.pos.x = best.pos.x + 1.5; G.player.pos.z = best.pos.z + 3; } return best && best.def.name; });
      await pg.waitForTimeout(1500);
      const mini = await ev(() => (G.ui.minimap.icons || []).map(i => [i.id, i.kind]));
      await clip('#hMap', `${OUT}/mapicons_${zid}_mini_${sz}.png`);
      await ev(() => G.ui.showAreaMap()); await pg.waitForTimeout(5000);
      const got = await ev(() => ({ icons: (G.ui.minimap.icons || []).map(i => [i.id, i.kind, Math.round(i.x), Math.round(i.y)]), legend: [...document.querySelectorAll('.amlegend span')].map(e => e.textContent.trim()), list: [...document.querySelectorAll('.amitem')].filter(e => e.querySelector('.amkind')).map(e => e.querySelector('.amname').firstChild.textContent + '=' + e.querySelector('.amkind').alt) }));
      await pg.screenshot({ path: `${OUT}/mapicons_${zid}_area_${sz}.png`, timeout: 300000 });
      await clip('.amcanvas', `${OUT}/mapicons_${zid}_areamap_${sz}.png`); await clip('.amside', `${OUT}/mapicons_${zid}_side_${sz}.png`);
      await ev(() => G.ui.close());
      const want = expect[zid] || {}, have = {}; for (const [, k] of got.icons) have[k] = (have[k] || 0) + 1;
      for (const k of Object.keys(want)) if ((have[k] || 0) !== want[k].length) { console.log(`  !! ${zid} ${k}: 데이터 ${want[k].length}, 화면 ${have[k] || 0}`); fail++; }
      if (zid === 'kairion_capital') for (const j of ['pharmacist', 'blacksmith', 'cook', 'hairdresser', 'artist']) if (!have['job_' + j]) { console.log('  !! 카이리온에 전직 아이콘 없음: ' + j); fail++; }
      console.log(sz, zid, 'near', at, '| 미니맵 아이콘', mini.length, '| 지역 지도', JSON.stringify(have), '| 범례', got.legend.join(','), '| 목록', got.list.join(','));
    }
    console.log(sz, 'errors', errs.slice(0, 4)); if (errs.length) fail++; await pg.context().close();
  }
  await b.close(); console.log(fail ? `실패 ${fail}` : '모두 통과'); process.exit(fail ? 1 : 0);
})();
