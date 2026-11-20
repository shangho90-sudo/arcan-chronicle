// 도트(픽셀) 그래픽 점검: 모든 창·HUD를 PC/휴대폰 크기로 찍고, 화면에 남은 픽셀 그림 요소를 DOM에서 찾아 표로 출력 (2026-11-20).
// Usage: TAG=before SIZES=1280x720,390x844t URL=http://localhost:8765/index.html node tools/browser-tests/pixelaudit.js
//   -> OUT/<TAG>_<size>_<name>.png + OUT/<TAG>_<size>.json  (OUT 기본 /tmp/pixel)
//   ONLY=inventory,skills  (일부 장면만)
// 찾는 것: Galmuri 글꼴로 그려진 글자, image-rendering:pixelated, 9칸 도트 테두리(panel/slot/btn/bar_bg/circle_*.png),
//          도트 아이콘 지도(icons.png)를 쓰는 .icon(2026-11-20부터는 그림이 없어 금빛 별로 대신한 .icon[data-missing]), 스프라이트 몸(SpriteBody), 도트 이펙트(effects.png)
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/pixel'; fs.mkdirSync(OUT, { recursive: true });
const TAG = process.env.TAG || 'before', URL = process.env.URL || 'http://localhost:8765/index.html';
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const SCENES = ['title', 'create', 'town', 'status', 'dialog', 'inventory', 'equip', 'shop', 'shopweapons', 'skills', 'skills_cook', 'skills_chef', 'craft', 'jobs', 'stats', 'quests',
  'pause', 'settings', 'saves', 'areamap', 'worldmap', 'townwarp', 'confirm', 'death', 'feed', 'fx', 'field', 'grove'];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const sz of (process.env.SIZES || '1280x720,390x844t').split(',')) {
    const touch = sz.endsWith('t'), [W, H] = sz.replace('t', '').split('x').map(Number);
    const pg = await (await b.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch })).newPage(); const errs = [];
    pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await pg.addInitScript(() => { window.__fr = 0; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = f => raf(t => { window.__fr++; f(t); }); });
    const ev = (f, a) => pg.evaluate(f, a);
    const frames = async n => { const f0 = await ev(() => window.__fr); await pg.waitForFunction(([f0, n]) => window.__fr >= f0 + n, [f0, n], { timeout: 300000 }); };
    const clickLabel = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)), t, { timeout: 300000 });
      await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').includes(t)).click(), t); };
    await pg.goto(URL + '?sim=2', { timeout: 300000 });
    await ev(() => localStorage.clear());
    const res = {};
    // DOM scan of everything visible
    const scan = () => ev(() => {
      const PIX = /assets\/ui\/(panel|panel_dark|slot|btn_[a-z]+|bar_bg|circle_[a-z]+|icons|ring|signs|portrait_[a-z]+|win_[a-z_]+)\.png/;
      const out = { galmuriText: 0, galmuriSample: [], pixelated: [], skins: {}, atlasIcons: 0, atlasSample: [] };
      for (const e of document.querySelectorAll('body *')) {
        const r = e.getBoundingClientRect(); if (!r.width || !r.height || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) continue;
        if (e.checkVisibility && !e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
        const cs = getComputedStyle(e);
        const own = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
        if (own && /Galmuri/.test(cs.fontFamily.split(',')[0])) { out.galmuriText++; if (out.galmuriSample.length < 12) out.galmuriSample.push((e.className || e.tagName) + ': ' + e.textContent.trim().slice(0, 24)); }
        if ((cs.imageRendering === 'pixelated' || cs.imageRendering === 'crisp-edges') && (/^(IMG|CANVAS|PICTURE)$/.test(e.tagName) || cs.backgroundImage !== 'none' || cs.borderImageSource !== 'none')) { const k = (e.className && e.className.baseVal === undefined ? e.className : e.tagName).toString().split(' ').slice(0, 2).join('.'); if (!out.pixelated.includes(k)) out.pixelated.push(k); }
        for (const v of [cs.borderImageSource, cs.backgroundImage]) { const m = v && v.match(PIX); if (m) { const k = m[1]; out.skins[k] = (out.skins[k] || 0) + 1; } }
        if (e.classList.contains('icon') && (/icons\.png/.test(cs.backgroundImage) || e.dataset.missing)) { out.atlasIcons++; if (out.atlasSample.length < 10) out.atlasSample.push(e.parentElement && e.parentElement.textContent.trim().slice(0, 20)); }
      }
      return out;
    });
    const shot = async name => { await frames(4); await pg.screenshot({ path: `${OUT}/${TAG}_${sz}_${name}.png`, timeout: 300000 }); res[name] = await scan(); console.log(sz, name, JSON.stringify(res[name])); };
    const want = n => !ONLY || ONLY.includes(n);
    await pg.waitForFunction(() => window.G && G.ui && G.ui.itemIcons, null, { timeout: 300000 }).catch(() => {});
    if (want('title')) { await pg.waitForFunction(() => document.querySelector('.titlewin'), null, { timeout: 300000 }); await shot('title'); }
    await clickLabel('새 게임');
    if (want('create')) { await pg.waitForFunction(() => document.querySelector('.create-art'), null, { timeout: 60000 }); await shot('create'); }
    await clickLabel('모험 시작');
    await pg.waitForSelector('.prologue.on', { timeout: 120000 }).then(() => clickLabel('건너뛰기')).catch(() => {});
    await pg.waitForFunction(() => window.G && G.inWorld && !G.loading, null, { timeout: 300000 });
    await pg.waitForFunction(() => !document.querySelector('.areabanner'), null, { timeout: 60000 }).catch(() => {});
    // data: 3D 모델 없이 스프라이트로 그려질 몬스터·NPC, 도트 아이콘으로 떨어지는 아이템·이름
    res.data = await ev(async () => {
      const U = G.ui, atlas = [], fallbackNames = new Set();
      const orig = U.icon.bind(U); U.icon = function (n, s) { const h = orig(n, s); if (/background-size|data-missing/.test(h)) fallbackNames.add(n); return h; };
      for (const it of G.data.itemList) { const h = orig(it.icon || it.id, 48); if (/background-size|data-missing/.test(h)) atlas.push(it.id); }
      window.__atlasNames = fallbackNames;
      // 3D 모델 없이 도트 스프라이트(SpriteBody)로 그려질 몬스터·NPC
      const { NPC_MODELS } = await import('/js/model.js'), { CREATURES } = await import('/js/creature.js');
      const spriteMon = Object.values(G.data.monsters).filter(m => !CREATURES[m.id] && !(m.look && CREATURES[m.look.base])).map(m => m.id);
      const spriteNpc = Object.values(G.data.npcs).filter(n => !NPC_MODELS[n.id] && !NPC_MODELS[n.model]).map(n => n.id);
      return { itemsOnAtlas: atlas.length, itemsOnAtlasSample: atlas.slice(0, 40), items: G.data.itemList.length, spriteMon, spriteNpc };
    });
    console.log(sz, 'data', JSON.stringify(res.data));
    await ev(() => { const S = G.sheet; S.p.level = 12; S.p.job = 'cook'; S.book.grantPoints(); S.recalc(); for (const [id, n] of [['m_jelly', 9], ['m_spore', 4], ['c_potion_s', 5], ['c_antidote', 2], ['m_herb', 3], ['f_lunch', 2], ['ac_ring_1', 1], ['w_knife_1', 1]]) { try { S.bag.add(id, n); } catch (e) {} } S.p.gold = 500; G.ui.toasts.innerHTML = ''; });
    if (want('town')) await shot('town');
    if (want('status')) { await ev(() => { const p = G.player; for (const id of ['haste', 'burn', 'slow', 'atkup']) { try { p.status.add(id, { dur: 30 }); } catch (e) { try { p.status.apply(G.data.status(id), 30); } catch (e2) {} } } }); await shot('status'); }
    if (want('dialog')) { await ev(() => { const n = G.zone.npcs.find(n => n.def.id === 'elder') || G.zone.npcs[0]; G.player.teleport({ x: n.pos.x, z: n.pos.z - 1.3 }); G.ui.showDialog(n.def, '안녕하신가, 젊은 모험가여. 아르칸 마을에 온 것을 환영하네.', [['상점', () => {}], ['대화 종료', () => G.ui.close()]]); }); await shot('dialog'); }
    const win = async (name, f) => { if (!want(name)) return; await ev(f); await shot(name); await ev(() => G.ui.close()); };
    await win('inventory', () => { G.ui.close(); G.ui.sel = { slot: 0 }; G.ui.showInventory(); });
    await win('equip', () => { G.ui.close(); G.ui.sel = { equip: 'weapon' }; G.ui.showInventory(); });
    await win('shop', () => { G.ui.close(); const s = G.data.shops.shop_general || Object.values(G.data.shops)[0]; G.ui.shopSel = s.items[0]; G.ui.showShop(s); });
    await win('shopweapons', () => { G.ui.close(); const s = G.data.shops.shop_weapons; G.ui.showShop(s); });
    await win('skills', () => { G.ui.close(); G.ui.showSkills(); });
    await win('skills_cook', () => { G.ui.close(); const S = G.sheet; for (const d of G.data.skill2List.filter(d => d.job === 'cook')) try { S.book.learn(d.id); } catch (e) {} G.ui.skSel = 'ck1_a1'; G.ui.showSkills(); });
    await win('skills_chef', () => { G.ui.close(); const S = G.sheet; S.p.level = 32; S.p.job = 'chef'; S.book.grantPoints(); S.recalc(); G.ui.skSel = null; G.ui.showSkills(); });
    await ev(() => { const S = G.sheet; S.p.level = 12; S.p.job = 'cook'; S.recalc(); });
    await win('craft', () => { G.ui.close(); const S = G.sheet; const c = G.data.skill2List.find(d => d.job === 'cook' && d.type === 'craft'); if (c) S.book.learn(c.id); G.ui.showCraft(); });
    await win('jobs', () => { G.ui.close(); G.ui.showJobs(); });
    await win('stats', () => { G.ui.close(); G.ui.showStats(); });
    await win('quests', () => { G.ui.close(); G.ui.showQuests(); });
    await win('pause', () => { G.ui.close(); G.ui.showPause(); });
    await win('settings', () => { G.ui.close(); G.ui.showSettings(() => G.ui.close()); });
    await win('saves', () => { G.ui.close(); G.ui.showSaveSlots('save', null, () => G.ui.close()); });
    await win('areamap', () => { G.ui.close(); G.ui.showAreaMap(); });
    await win('worldmap', () => { G.ui.close(); G.ui.handleKeys({ map: true }); });
    await win('townwarp', () => { G.ui.close(); const n = G.zone.npcs.find(n => n.def.role === 'warp'); if (n) G.ui.showTownWarp(n); });
    await win('confirm', () => { G.ui.close(); G.ui.confirm('「작은 회복 물약」을(를) 버릴까요?', () => {}, () => {}); });
    await win('death', () => { G.ui.close(); G.ui.showDeath(30, true, () => {}, () => {}); });
    if (want('feed')) { await ev(() => { G.ui.close(); G.ui.itemToast(G.data.item('m_jelly'), 3); G.ui.itemToast(G.data.item('c_potion_s'), 1); G.ui.toast('퀘스트를 받았습니다'); }); await shot('feed'); }
    if (want('fx')) {   // 게임 안 2D 이펙트 아틀라스(render.js Fx, assets/fx/effects.png): 모든 이름을 줄지어 반복 재생
      await ev(() => { G.ui.close(); G.ui.toasts.innerHTML = ''; G.ui.feed.innerHTML = ''; const p = G.player.pos, names = G.fx.meta.effects.map(e => e.name);
        names.forEach((n, i) => { const c = i % 6, r = Math.floor(i / 6); G.fx.play(n, { x: p.x - 3.75 + c * 1.5, y: p.y + 0.8, z: p.z + 2 - r * 1.6 }, 0.6, false, null, true); });
        const cam = G.render.cam; cam.zoom = 1.7; cam.updateProjectionMatrix(); G.render.setFocus({ x: p.x, y: 0, z: p.z }, true); });
      await frames(7); await shot('fx');
      await ev(() => { G.fx.clear(); const cam = G.render.cam; cam.zoom = 1; cam.updateProjectionMatrix(); });
    }
    if (want('field')) {
      await ev(() => G.loadZone('forest', 'from_town', false)); await pg.waitForFunction(() => !G.loading && G.zone.def.id === 'forest', null, { timeout: 300000 });
      await ev(() => { const p = G.player, m = G.zone.actors.find(a => a !== p && a.hp > 0 && a.def && !a.def.boss); p.teleport({ x: m.pos.x, z: m.pos.z - 1.6 }); G.render.setFocus(p.pos, true); });
      for (let i = 0; i < 4; i++) { await ev(() => G.input.press('attack')); await frames(8); }
      await ev(() => { const p = G.player; G.fx.play('smoke', { x: p.pos.x + 1, y: p.pos.y + 0.3, z: p.pos.z }, 1.2); G.fx.play('heal', { x: p.pos.x, y: p.pos.y + 0.8, z: p.pos.z }, 1); G.fx.play('ring', { x: p.pos.x - 1.5, y: p.pos.y + 0.05, z: p.pos.z + 1 }, 2, true, [1, 0.6, 0.9]); });
      await frames(3); await shot('field');
      res.bodies = await ev(() => G.zone.actors.concat(G.zone.npcs || []).filter(a => a.body && a.body.constructor && a.body.constructor.name === 'SpriteBody').map(a => a.def && a.def.id));
    }
    if (want('grove')) {   // 예전 빌더 지형(고지대 벽·경사로) 텍스처 assets/env/*.png
      await ev(() => { G.lockOf = () => null; G.zoneLock = () => null; G.loadZone('mushroom_grove', null, false); });
      await pg.waitForFunction(() => !G.loading && G.zone.def.id === 'mushroom_grove', null, { timeout: 300000 });
      res.groveTex = await ev(() => { const out = []; let box = null;
        for (const g of G.render.groups) if (g.name === 'terrain') for (const m of g.meshes) if (m.visible && /stone_wall/.test(m.userData.tex || '')) { m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld); box = box ? box.union(b) : b; out.push(m.userData.tex); }
        if (box) { const c = box.getCenter(new box.min.constructor()); const p = { x: c.x, z: -c.z }; G.player.teleport({ x: p.x, z: p.z - (box.max.z - box.min.z) / 2 - 3 }); G.render.setFocus(G.player.pos, true); }
        return out; });
      await frames(30); await shot('grove');
    }
    res.atlasNamesSeen = await ev(() => [...(window.__atlasNames || [])]);
    console.log(sz, 'atlas names seen', JSON.stringify(res.atlasNamesSeen), 'sprite bodies', JSON.stringify(res.bodies || []));
    res.errors = errs.slice(0, 10); console.log(sz, 'errors', errs.slice(0, 6));
    fs.writeFileSync(`${OUT}/${TAG}_${sz}.json`, JSON.stringify(res, null, 1)); await pg.close();
  }
  await b.close();
})();
