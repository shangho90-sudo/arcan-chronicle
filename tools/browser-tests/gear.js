// 장비 40종·무기/방어구 상인 확인 (tools/gear/gear.py, js/items3d.js gearModel, js/ui.js gearLines):
//   1 merchants  아르칸 마을 + 생성 마을 2곳(MTOWNS)에서 무기 상인·방어구 상인이 서 있는 모습, 다른 NPC·소품과의 거리
//   2 shop       두 상점 창: 장비 줄 수(유봉 5 / 갑옷 5 + 장신구 5), 아이콘 그림이 실제로 받아졌는지, 화면
//   3 pestle     약사로 유봉을 사서 장착: 손에 든 모델(Tripo 모델로 바뀌었는지), 등에 멘 모습, 공격으로 꺼내기
//   4 jobbuff    약사의 은 저울: 약사(적용) ↔ 요리사(미적용) 능력치와 설명 줄
//   5 drop       드롭 전용 장비: 실제 처치 처리(G.onMonsterKilled)를 2000번 돌려 드롭 비율 + 바닥에 떨어진 모습
//   6 sheets     아이콘 40개 모음, 유봉 모델 10개 모음
// Usage: SIZE=1280x800|390x844t GENDER=m|f ONLY=merchants,shop,... URL=http://localhost:8787/index.html node tools/browser-tests/gear.js
//   -> OUT(/tmp/gear)/<SIZE>_<g>_*.png + <SIZE>_<g>.json
const { chromium } = require('playwright'); const fs = require('fs');
const SIZE = process.env.SIZE || '1280x800', TOUCH = SIZE.endsWith('t'), [VW, VH] = SIZE.replace('t', '').split('x').map(Number);
const OUT = process.env.OUT || '/tmp/gear', G_ = process.env.GENDER || 'm', ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const MTOWNS = (process.env.MTOWNS || 'town,kairion_capital,marseon').split(',');
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: VW, height: VH }, hasTouch: TOUCH, isMobile: TOUCH })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a), run = s => !ONLY.length || ONLY.includes(s), base = `${OUT}/${SIZE}_${G_}`;
  await pg.goto(process.env.URL || 'http://localhost:8787/index.html');
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); };
  await ev(() => localStorage.clear()); await click('새 게임'); await click('모험 시작');
  await pg.waitForSelector('.prologue.on', { timeout: 60000 }).then(() => click('건너뛰기')).catch(() => {});
  const ready = () => pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.player.body && G.player.body.md, null, { timeout: 400000 });
  await ready(); await pg.waitForTimeout(1200);
  await ev(async g => { G.sheet.p.gender = g; await G.player.attachBody(); G.player.body.place(G.player.pos); G.frame = () => {}; document.querySelectorAll('.qhud,.qh-reopen,.toasts').forEach(e => e.style.display = 'none'); }, G_);
  const step = (n, draw = true) => ev(([n, draw]) => { for (let i = 0; i < n; i++) G.step(1 / 60, draw && i === n - 1); }, [n, draw]);
  const shot = (fn, clip) => pg.screenshot({ path: fn, clip, timeout: 400000 });
  const R = { size: SIZE, gender: G_ };

  // 1 merchants
  if (run('merchants')) {
    R.merchants = {};
    for (const zid of MTOWNS) {
      if (await ev(z => G.zone.def.id !== z, zid)) { await ev(z => G.travel(z), zid); await pg.waitForFunction(z => !G.loading && G.zone.def.id === z, zid, { timeout: 400000 }); await ready(); }
      await step(30);
      const list = await ev(() => G.zone.npcs.filter(n => ['shop_weapons', 'shop_armor'].includes(n.def.shop)).map(n => {
        let near = 99; for (const o of G.zone.npcs) if (o !== n) near = Math.min(near, Math.hypot(o.pos.x - n.pos.x, o.pos.z - n.pos.z));
        return { id: n.def.id, name: n.def.name, title: n.def.title, shop: n.def.shop, pos: [+n.pos.x.toFixed(1), +n.pos.z.toFixed(1)], model: !!(n.body && n.body.md), file: n.body && n.body.md ? n.body.md.cfg.file + '/' + (n.body.md.cfg.tex || '') : null,
          nearestNpc: +near.toFixed(1), blocked: G.zone.geo.blocked(n.pos.x, n.pos.z, 0.3) };
      }));
      R.merchants[zid] = list;
      for (const m of list) {
        await ev(m => { const p = G.player; p.pos.x = m.pos[0]; p.pos.z = m.pos[1] + 2.2; p.body.place(p.pos); p.setFacing(0, -1); p.body.setFacing(0, -1); G.render.setFocus({ x: m.pos[0], y: 0, z: m.pos[1] + 0.6 }, true); }, m);
        await step(20); await ev(() => { G.ui.updatePlates && G.ui.updatePlates(); G.render.render(0); });
        await shot(`${base}_1merchant_${zid}_${m.id}.png`);
      }
      if (zid === 'town') {       // minimap / area map list
        R.areaList = await ev(() => { G.ui.showAreaMap && G.ui.showAreaMap(); return [...document.querySelectorAll('.window *')].map(e => e.childElementCount ? '' : e.textContent.trim()).filter(t => /단오|보라/.test(t)); });
        await pg.waitForTimeout(600); await shot(`${base}_1areamap_town.png`); await ev(() => G.ui.close && G.ui.close());
      }
    }
    if (await ev(() => G.zone.def.id !== 'town')) { await ev(() => G.travel('town')); await pg.waitForFunction(() => !G.loading && G.zone.def.id === 'town', null, { timeout: 400000 }); await ready(); await step(20); }
  }

  // 2 shop windows
  if (run('shop')) {
    R.shop = {};
    await ev(() => { G.dev.level(12); G.dev.job('pharmacist'); G.sheet.addGold(20000); });
    for (const sid of ['shop_weapons', 'shop_armor']) {
      const info = await ev(async sid => {
        const sh = G.data.shops[sid]; G.ui.sel = {}; G.ui.shopSel = sh.items.find(i => G.data.item(i).gear); G.ui.showShop(sh);
        const gear = sh.items.filter(i => G.data.item(i).gear), other = sh.items.filter(i => !G.data.item(i).gear);
        const icons = await Promise.all(gear.map(i => new Promise(r => { const im = new Image(); im.onload = () => r(im.naturalWidth); im.onerror = () => r(0); im.src = G.ui.itemIcons[G.data.item(i).icon]; })));
        return { name: sh.name, rows: document.querySelectorAll('.shoprow').length, gear: gear.map(i => G.data.item(i).name + ' Lv' + G.data.item(i).levelReq + ' ' + G.data.item(i).price + 'G'), other: other.map(i => G.data.item(i).name), iconPx: icons,
          buybox: (document.querySelector('.buybox') || {}).textContent };
      }, sid);
      R.shop[sid] = info; await pg.waitForTimeout(800); await shot(`${base}_2${sid}.png`);
    }
    R.shop.masterBlacksmith = await ev(() => { const n = G.data.npcs.master_blacksmith, sh = G.data.shops[n.shop]; return { shop: n.shop, items: sh.items.map(i => G.data.item(i).name) }; });
    await ev(() => G.ui.close && G.ui.close());
  }

  // 3 buy + equip a pestle
  if (run('pestle')) {
    await ev(() => { if (G.sheet.p.job !== 'pharmacist') { G.dev.level(12); G.dev.job('pharmacist'); } G.sheet.addGold(20000); });
    R.pestle = await ev(async () => {
      const sh = G.data.shops.shop_weapons, gold0 = G.sheet.p.gold; G.ui.showShop(sh); G.ui.buy(sh, 'w_pestle_g1', 1);
      const slot = G.sheet.p.inventory.findIndex(s => s.id === 'w_pestle_g1' && s.count > 0), err = G.sheet.bag.equipFromSlot(slot); G.ui.close && G.ui.close();
      await G.player.attachBody(); G.player.body.place(G.player.pos); G.player.resetArms && G.player.resetArms();
      return { paid: gold0 - G.sheet.p.gold, equipErr: err, weapon: G.sheet.p.weapon, atk: Math.round(G.player.sheet.final.atk), bodyWeapon: G.player.body.weapon };
    });
    const waitModel = async () => { await step(3); const t0 = Date.now(); await pg.waitForFunction(() => { const h = G.player.body.props && G.player.body.props.R; let ok = false; h && h.traverse(o => { if (o.userData.gearReady) ok = true; }); return ok; }, null, { timeout: 120000 }).catch(() => {}); return Date.now() - t0; };
    R.pestle.modelWaitMs = [await waitModel()]; await step(40);
    const CW = Math.min(VW, 320), CH = Math.min(VH, 360);
    const near = async (fn, zoom = 2.4) => {
      await ev(z => { const p = G.player, c = G.render.cam; c.zoom = z; c.updateProjectionMatrix(); document.querySelectorAll('.hud,.layer:not(.controls),.plates,.controls').forEach(e => e.style.visibility = 'hidden'); G.render.setFocus({ x: p.pos.x, y: 0, z: p.pos.z }, true); G.render.render(0); }, zoom);
      const c = await ev(() => { const p = G.player, s = G.render.toScreen({ x: p.pos.x, y: p.pos.y + 0.9, z: p.pos.z }); return [s.x, s.y]; });
      await shot(fn, { x: Math.max(0, Math.min(VW - CW, Math.round(c[0] - CW / 2))), y: Math.max(0, Math.min(VH - CH, Math.round(c[1] - CH / 2))), width: CW, height: CH });
    };
    const face = deg => ev(d => { const a = d * Math.PI / 180, p = G.player; p.setFacing(Math.sin(a), Math.cos(a)); p.body.setFacing(Math.sin(a), Math.cos(a)); p.body.yaw = p.body.targetYaw; }, deg);
    const st = () => ev(() => { const B = G.player.body, h = B.props && B.props.R, bp = B.bladePoints(); let ready = false; h && h.traverse(o => { if (o.userData && o.userData.gearReady) ready = true; });
      return { armed: B.armed, gearModel: ready, blade: bp ? +Math.hypot(bp[1].x - bp[0].x, bp[1].y - bp[0].y, bp[1].z - bp[0].z).toFixed(2) : null }; });
    for (const d of [0, 180]) { await face(d); await step(20); await near(`${base}_3pestle_back_${d}.png`); }
    R.pestle.sheathed = await st();
    await face(90); await ev(() => G.input.hold('attack', true));
    await step(14); R.pestle.drawing = await st(); await near(`${base}_3pestle_draw.png`);
    await step(16); R.pestle.attack = await st(); await near(`${base}_3pestle_hand_90.png`);
    await ev(() => G.input.hold('attack', false)); await step(40); await face(0); await step(4); await near(`${base}_3pestle_hand_0.png`);
    for (const id of ['w_pestle_g5', 'w_pestle_g10']) {         // the best shop pestle and the best drop pestle in the hand
      await ev(async id => { G.dev.level(50); G.sheet.bag.add(id, 1); const s = G.sheet.p.inventory.findIndex(s => s.id === id && s.count > 0); G.sheet.bag.equipFromSlot(s); await G.player.attachBody(); G.player.body.place(G.player.pos); G.player.body.setArmed ? G.player.body.setArmed(true, true) : 0; }, id);
      R.pestle.modelWaitMs.push(await waitModel()); await face(90); await ev(() => G.input.hold('attack', true)); await step(34); await near(`${base}_3pestle_${id}.png`); await ev(() => G.input.hold('attack', false)); await step(60);
    }
    R.pestle.last = await st();
    await ev(() => { const c = G.render.cam; c.zoom = 1; c.updateProjectionMatrix(); document.querySelectorAll('.hud,.layer:not(.controls),.plates,.controls').forEach(e => e.style.visibility = ''); });
  }

  // 4 job accessory on / off
  if (run('jobbuff')) {
    R.jobbuff = await ev(() => {
      const s = G.sheet; G.dev.level(20); if (s.p.job !== 'pharmacist') G.dev.job('pharmacist');
      const f = () => ({ job: s.p.job, healPower: +s.final.healPower.toFixed(3), matk: Math.round(s.final.matk), maxSp: Math.round(s.final.maxSp) });
      const un = s.p.accessory ? s.bag.unequip('accessory') : null; s.recalc(); const before = f();
      s.bag.add('ac_j_pharm', 1); const err = s.bag.equipFromSlot(s.p.inventory.findIndex(x => x.id === 'ac_j_pharm' && x.count > 0)); s.recalc(); const on = f();
      G.ui.sel = { equip: 'accessory' }; G.ui.showInventory(); const lineOn = (document.querySelector('.gearbuff') || {}).textContent, drop = (document.querySelector('.geardrop') || {}).textContent;
      return { err, before, on, lineOn, drop };
    });
    await pg.waitForTimeout(700); await shot(`${base}_4jobbuff_on.png`);
    Object.assign(R.jobbuff, await ev(() => {
      const s = G.sheet, j0 = s.p.job; s.p.job = 'cook'; s.recalc();
      const off = { job: s.p.job, healPower: +s.final.healPower.toFixed(3), matk: Math.round(s.final.matk), maxSp: Math.round(s.final.maxSp) };
      G.ui.sel = { equip: 'accessory' }; G.ui.showInventory(); const lineOff = (document.querySelector('.gearbuff') || {}).textContent; window.__j0 = j0; return { off, lineOff };
    }));
    await pg.waitForTimeout(700); await shot(`${base}_4jobbuff_off.png`);
    await ev(() => { G.sheet.p.job = window.__j0; G.sheet.recalc(); G.ui.close && G.ui.close(); });
  }

  // 5 drop-only item from a monster (the real kill handler)
  if (run('drop')) {
    await ev(() => G.travel('forest')); await pg.waitForFunction(() => !G.loading && G.zone.def.id === 'forest', null, { timeout: 400000 }); await ready(); await step(20);
    R.drop = await ev(() => {
      const it = G.data.item('w_pestle_g6'), mid = it.dropFrom[0].monster, def = G.data.monsters[mid], want = it.dropFrom[0].chance;
      const m = G.dev.dummies(mid, 1, 2.5)[0], z = G.zone, N = 2000; let n = 0;
      const real = z.dropLoot; z.dropLoot = id => { if (id === it.id) n++; };
      const rw = G.reward; G.reward = null; const ft = G.ui.floatText; G.ui.floatText = () => {}; const sfx = G.audio.sfx; G.audio.sfx = () => {};
      for (let i = 0; i < N; i++) G.onMonsterKilled(m);
      z.dropLoot = real; G.reward = rw; G.ui.floatText = ft; G.audio.sfx = sfx; G.timers.length = 0;
      const p = G.player.pos; z.dropLoot(it.id, 1, { x: p.x + 2.6, y: p.y, z: p.z + 1 }); z.dropLoot('a_armor_g6', 1, { x: p.x - 2.6, y: p.y, z: p.z + 1 }); z.dropLoot('ac_g9', 1, { x: p.x, y: p.y, z: p.z + 3 });
      return { item: it.name, monster: def.name, tableChance: want, kills: N, drops: n, rate: +(n / N).toFixed(4), inDrops: def.drops.filter(d => d.gear).map(d => G.data.item(d.item).name + ' ' + d.chance) };
    });
    await pg.waitForTimeout(4000); await step(3);
    await ev(() => { const p = G.player, c = G.render.cam; c.zoom = 1.6; c.updateProjectionMatrix(); G.render.setFocus({ x: p.pos.x, y: 0, z: p.pos.z + 0.6 }, true); G.render.render(0); });
    await shot(`${base}_5drop_loot.png`); await ev(() => { const c = G.render.cam; c.zoom = 1; c.updateProjectionMatrix(); });
  }

  // 6 contact sheets: 40 icons, 10 pestle models (the game's own item models)
  if (run('sheets')) {
    R.sheets = await ev(async () => {
      const list = G.data.itemList.filter(i => i.gear), cv = document.createElement('canvas'), C = 10, S = 132; cv.width = C * S; cv.height = Math.ceil(list.length / C) * (S + 22);
      const x = cv.getContext('2d'); x.fillStyle = '#2a2436'; x.fillRect(0, 0, cv.width, cv.height); x.font = '13px sans-serif'; x.textAlign = 'center'; let ok = 0;
      await Promise.all(list.map((it, i) => new Promise(r => { const im = new Image(); im.onload = () => { x.drawImage(im, (i % C) * S + 6, Math.floor(i / C) * (S + 22) + 4, S - 12, S - 12); ok++; r(); }; im.onerror = r; im.src = G.ui.itemIcons[it.icon]; })));
      list.forEach((it, i) => { x.fillStyle = it.dropFrom ? '#ffd76a' : '#e8e2f0'; x.fillText(it.name.length > 9 ? it.name.slice(0, 9) + '…' : it.name, (i % C) * S + S / 2, Math.floor(i / C) * (S + 22) + S + 10); });
      const { THREE } = await import('./js/render.js'), I = await import('./js/items3d.js');
      const ids = list.filter(i => i.type === 'weapon').map(i => i.id), W = 1500, H = 420;
      const r = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true }); r.setSize(W, H); r.setPixelRatio(1); r.outputColorSpace = THREE.SRGBColorSpace; r.setClearColor(0x2a2436, 1);
      const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0x705848, 2.2)); const k = new THREE.DirectionalLight(0xfff2dc, 2.6); k.position.set(-2, 3, 3); sc.add(k);
      const cam = new THREE.OrthographicCamera(-1.5, 1.5, 0.42, -0.42, 0.1, 20); cam.position.set(0, 0.6, 4); cam.lookAt(0, 0.12, 0);
      const ms = ids.map((id, i) => { const m = I.itemModel(id); m.rotation.x = -Math.PI / 2; m.position.set(-1.35 + i * 0.3, -0.08, 0); m.rotation.z = 0; sc.add(m); return m; });
      for (let t = 0; t < 100 && !ms.every(m => m.userData.gearReady); t++) await new Promise(r => setTimeout(r, 200));
      r.render(sc, cam); const models = r.domElement.toDataURL('image/png'); r.dispose();
      return { icons: cv.toDataURL('image/png'), models, iconsOk: ok, total: list.length, modelsReady: ms.filter(m => m.userData.gearReady).length };
    });
    for (const k of ['icons', 'models']) { fs.writeFileSync(`${base}_6sheet_${k}.png`, Buffer.from(R.sheets[k].split(',')[1], 'base64')); delete R.sheets[k]; }
  }
  R.errors = errs.slice(0, 20);
  fs.writeFileSync(`${base}.json`, JSON.stringify(R, null, 1)); console.log(JSON.stringify(R, null, 1));
  await b.close();
})();
