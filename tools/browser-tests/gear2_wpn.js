// 직업 계보별 무기 2단계(2026-11-17, tools/blender/gear2_wpn.py) 손에 든 모습 확인:
//   무기마다 그 직업으로 바꿔 장착 → 모델(glb v2)이 받아졌는지·칼날 길이(bladePoints = 휘두르기 잔상 길이)·쥐는 곳,
//   장면 4개: 등에 멤(전투 아님) / 꺼내는 중 / 기본공격 휘두름(잔상) / 공격 뒤 손에 듦 + 마지막에 땅에 떨어진 모습 모음.
//   가위 계열은 손에서 makeShears(계열 색 shearLook) — 그 모습도 같은 장면으로.
// Usage: IDS=wg_nov_4,wg_pharm_5,... SIZE=1280x800 GENDER=m URL=http://localhost:8883/index.html OUT=/tmp/gear2/browser node tools/browser-tests/gear2_wpn.js
//   -> OUT/<SIZE>_<g>_<id>.png(4칸 띠) + drops.png + result.json
const { chromium } = require('playwright'); const fs = require('fs');
const SIZE = process.env.SIZE || '1280x800', TOUCH = SIZE.endsWith('t'), [VW, VH] = SIZE.replace('t', '').split('x').map(Number);
const OUT = process.env.OUT || '/tmp/gear2/browser', G_ = process.env.GENDER || 'm';
const IDS = (process.env.IDS || 'wg_nov_4,wg_pharm_5,wg_smith_7,wg_cook_5,wg_hair_6,wg_art_5,wg_artm_7,wg_wpharm_7,wg_herb_5,wg_eng_7,wg_chef_6,wg_design_7,wg_paint_7,wg_music_5').split(',');
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: VW, height: VH }, hasTouch: TOUCH, isMobile: TOUCH })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error' || /gear model/.test(m.text())) errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(process.env.URL || 'http://localhost:8883/index.html');
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); };
  await ev(() => localStorage.clear()); await click('새 게임'); await click('모험 시작');
  await pg.waitForSelector('.prologue.on', { timeout: 60000 }).then(() => click('건너뛰기')).catch(() => {});
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.player.body && G.player.body.md, null, { timeout: 400000 });
  await pg.waitForTimeout(1000);
  await ev(async g => { G.sheet.p.gender = g; await G.player.attachBody(); G.player.body.place(G.player.pos); G.frame = () => {}; document.querySelectorAll('.qhud,.qh-reopen,.toasts').forEach(e => e.style.display = 'none'); }, G_);
  const step = (n, draw = true) => ev(([n, draw]) => { for (let i = 0; i < n; i++) G.step(1 / 60, draw && i === n - 1); }, [n, draw]);
  const CW = 380, CH = 420;
  const grab = async (zoom = 2.6) => {
    await ev(z => { const p = G.player, c = G.render.cam; c.zoom = z; c.updateProjectionMatrix(); document.querySelectorAll('.hud,.layer:not(.controls),.plates,.controls').forEach(e => e.style.visibility = 'hidden'); G.render.setFocus({ x: p.pos.x, y: 0, z: p.pos.z }, true); G.render.render(0); }, zoom);
    const c = await ev(() => { const p = G.player, s = G.render.toScreen({ x: p.pos.x, y: p.pos.y + 0.9, z: p.pos.z }); return [s.x, s.y]; });
    return pg.screenshot({ clip: { x: Math.max(0, Math.min(VW - CW, Math.round(c[0] - CW / 2))), y: Math.max(0, Math.min(VH - CH, Math.round(c[1] - CH / 2))), width: CW, height: CH } });
  };
  const face = deg => ev(d => { const a = d * Math.PI / 180, p = G.player; p.setFacing(Math.sin(a), Math.cos(a)); p.body.setFacing(Math.sin(a), Math.cos(a)); p.body.yaw = p.body.targetYaw; }, deg);
  const st = () => ev(() => { const B = G.player.body, h = B.props && B.props.R, bp = B.bladePoints(); let ready = false, v2 = false, tri = 0;
    h && h.traverse(o => { if (o.userData && o.userData.gearReady) ready = true; if (o.userData && o.userData.v === 2) v2 = true; if (o.isMesh && o.geometry.index) tri += o.geometry.index.count / 3; });
    return { kind: B.propKind && B.propKind.R, armW: +(B.armW || 0).toFixed(2), gearModel: ready, v2, tri: Math.round(tri), blade: bp ? +Math.hypot(bp[1].x - bp[0].x, bp[1].y - bp[0].y, bp[1].z - bp[0].z).toFixed(3) : null,
      tipY: bp ? +(bp[1].y - G.player.pos.y).toFixed(2) : null }; });
  const R = { size: SIZE, gender: G_, items: {} };
  const { PNG } = (() => { try { return require('pngjs'); } catch (e) { return {}; } })();
  for (const id of IDS) {
    const job = await ev(id => { const d = G.data.item(id); return d.job || 'novice'; }, id);
    await ev(async ([id, job]) => { G.dev.level(50); if (G.sheet.p.job !== job) { G.dev.job(job); G.sheet.p.job = job; } G.sheet.recalc(); G.sheet.bag.add(id, 1);
      const s = G.sheet.p.inventory.findIndex(s => s.id === id && s.count > 0); G.__eqErr = G.sheet.bag.equipFromSlot(s); await G.player.attachBody(); G.player.body.place(G.player.pos); G.player.resetArms && G.player.resetArms(); }, [id, job]);
    await step(3);
    if (!/^wg_(hair|design)_/.test(id)) await pg.waitForFunction(() => { const h = G.player.body.props && G.player.body.props.R; let ok = false; h && h.traverse(o => { if (o.userData.gearReady) ok = true; }); return ok; }, null, { timeout: 120000 }).catch(() => errs.push(id + ' model not ready'));
    const r = { job, equipErr: await ev(() => G.__eqErr) };
    await face(160); await step(30); const s1 = await grab(); r.back = await st();
    await face(250); await ev(() => G.input.hold('attack', true)); await step(10); const s2 = await grab(); r.draw = await st();
    await step(14); const s3 = await grab(); r.swing = await st();
    await ev(() => G.input.hold('attack', false)); await step(70); await face(300); await step(4); const s4 = await grab(); r.hand = await st();
    R.items[id] = r; console.log(id, JSON.stringify(r));
    for (const [k, buf] of [['1back', s1], ['2draw', s2], ['3swing', s3], ['4hand', s4]]) fs.writeFileSync(`${OUT}/${SIZE}_${G_}_${id}_${k}.png`, buf);
    await ev(() => { G.player.resetArms && G.player.resetArms(); });
  }
  // 땅에 떨어진 모습: 플레이어 앞에 무기 몇 개를 떨어뜨림(이름표 포함)
  await ev(ids => { const p = G.player.pos; ids.forEach((id, i) => G.zone.dropLoot(id, 1, { x: p.x + (i % 4 - 1.5) * 1.1, y: p.y, z: p.z + 1.6 + Math.floor(i / 4) * 1.1 })); document.querySelectorAll('.hud,.layer:not(.controls),.plates,.controls').forEach(e => e.style.visibility = ''); }, IDS.slice(0, 8));
  await step(90); await ev(() => { const c = G.render.cam; c.zoom = 1.6; c.updateProjectionMatrix(); G.render.render(0); });
  R.loot = await ev(() => G.zone.things.filter(t => t.constructor.name === 'Loot').length);
  await pg.screenshot({ path: `${OUT}/${SIZE}_${G_}_drops.png` });
  R.errors = errs; fs.writeFileSync(`${OUT}/${SIZE}_${G_}_result.json`, JSON.stringify(R, null, 1)); console.log('errors', errs.length, errs.slice(0, 8));
  await b.close();
})();
