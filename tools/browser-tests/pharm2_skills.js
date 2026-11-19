// 약사 1차 5종 교체(2026-11-19)를 실제 게임에서 확인: 스킬은 진짜 경로(skills2.cast 또는 키패드 터치), G.step(1/FPS) 한 프레임씩, Math.random 고정(DET).
// Usage: SCENES=rang,wick,frost,crystal,dream,touch,oldsave SIZE=1100x760|390x844t GENDER=m|f FPS=30 URL=http://localhost:8811/index.html OUT=/tmp/pharm2 QUALITY= node tools/browser-tests/pharm2_skills.js
//   rang    유봉 되던지기: 정면 4.5 m 멧돼지 A + 옆(3.4 m 앞, 2.2 m 옆) 멧돼지 B. 던진 뒤 B 쪽으로 옆걸음 → A 왕복 2타, B 돌아올 때 1타(휘는 귀환)
//   wick    불꽃심지병: 착탄점 멧돼지 S(그대로) + L(첫 불 틱 뒤 밖으로) + E(1.3 s에 안으로) → 틱 수가 실제 자리를 따름, 화상 없음
//   frost   서리병 굴리기: 앞 4 m쯤 벽이 있는 자리를 찾아 굴림 — 길 위 멧돼지 둔화, 벽 너머 멧돼지는 파편 0
//   crystal 결정침 개화: 5 m 앞 멧돼지가 옆으로 2 m/s 걸어가는 동안 3타
//   dream   꿈꽃가루: 앞 부채꼴 멧돼지 3(쫓아오는 중) + 밖 1 → 3 잠듦(멈춤)·1 계속 움직임 → 1.2 s에 하나를 유봉강타로 쳐서 깨움
//   touch   (휴대폰 390x844t) 2번 칸 키패드를 실제로 터치해 서리병 굴리기 시전
//   oldsave 예전 저장(밀어내기·화염·부식·냉각 약병이 1~4번 칸, 회복제 제작 Lv4)을 만들어 다시 불러온 뒤 같은 칸 = 새 스킬, 1번 칸 키로 시전
//   -> OUT/<scene>_<size>.png(띠) + .json(피해·소리·상태·위치 로그), 콘솔 오류
const { chromium } = require('playwright'); const fs = require('fs'); const { execSync } = require('child_process');
const SIZE = process.env.SIZE || '1100x760', TOUCH = SIZE.endsWith('t'), [VW, VH] = SIZE.replace('t', '').split('x').map(Number);
const FPS = +(process.env.FPS || 30), G_ = process.env.GENDER || 'm', OUT = process.env.OUT || '/tmp/pharm2', URL = process.env.URL || 'http://localhost:8811/index.html';
const SCENES = (process.env.SCENES || 'rang,wick,frost,crystal,dream').split(',');
const SHOT = {   // capture times (s from the press) per scene
  rang: [0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1.0, 1.15, 1.3, 1.5], wick: [0.2, 0.45, 0.6, 0.8, 1.0, 1.25, 1.6, 2.0, 2.5, 3.0], frost: [0.15, 0.35, 0.55, 0.75, 0.9, 1.0, 1.1, 1.3, 1.8, 3.0],
  crystal: [0.1, 0.25, 0.38, 0.44, 0.47, 0.53, 0.57, 0.76, 0.8, 0.95], dream: [0.15, 0.3, 0.4, 0.55, 0.8, 1.1, 1.25, 1.4, 1.8, 2.4], touch: [0.2, 0.5, 0.9, 1.3], oldsave: [0.1, 0.3, 0.6, 1.0] };
const SEC = { rang: 1.8, wick: 3.3, frost: 3.2, crystal: 1.2, dream: 2.6, touch: 1.5, oldsave: 1.2 };
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: VW, height: VH }, hasTouch: TOUCH, isMobile: TOUCH }), pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error' || /pharm1|pharm|skill op/.test(m.text())) errs.push(m.text().slice(0, 300)); });
  pg.setDefaultTimeout(600000);
  const ev = (f, a) => pg.evaluate(f, a);
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); };
  await pg.goto(URL);
  await ev(q => { localStorage.clear(); localStorage.setItem('arcan_settings', JSON.stringify(Object.assign({ graphicsFx: true }, q ? { gfxQuality: q } : {}))); }, process.env.QUALITY || '');
  await pg.reload(); await click('게임 시작 (새 게임)'); await click('모험 시작');
  await pg.waitForSelector('.prologue.on', { timeout: 60000 }).then(() => click('건너뛰기')).catch(() => {});
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.player.body && G.player.body.md, null, { timeout: 300000 });
  await pg.waitForFunction(() => G.skillFx && G.skillFx.pharm, null, { timeout: 120000 });
  await ev(([z, t]) => { window.__zoom = z; window.__touch = t; }, [+(process.env.ZOOM || (TOUCH ? 1.0 : 1.5)), TOUCH]);
  const setup = async () => ev(async ([g]) => {
    G.frame = () => {};
    document.querySelectorAll('.toasts,.qhud,.qh-reopen,.hud').forEach(e => e.style.display = 'none'); if (!window.__touch) document.querySelectorAll('.controls').forEach(e => e.style.display = 'none');
    const c = G.render.cam; c.zoom = window.__zoom; c.updateProjectionMatrix();
    if (G.reward) { G.reward.jobChange = sw => sw && sw(); G.reward.levelUp = () => {}; }
    G.dev.level(20); G.sheet.p.gender = g; if (G.sheet.p.job !== 'pharmacist') G.dev.job('pharmacist'); G.sheet.bag.add('w_pestle_1', 1); G.sheet.p.weapon = 'w_pestle_1'; G.dev.learnAll('pharmacist');
    for (const id of ['ph1_a4', 'ph1_b1', 'ph1_b2', 'ph1_b4', 'ph1_c1', 'ph1_b5']) G.sheet.book.sk.learned[id] = 1;   // 1레벨 초안 수치로 확인(정확한 투척도 1)
    G.sheet.recalc(); G.dev.full(); G.input.block = true;
    await G.player.attachBody(); G.player.body.place(G.player.pos); G.player.body.play('idle', 1, true); G.skillFx.pharm.load();
  }, [G_]);
  await setup();
  await pg.waitForFunction(() => G.skillFx.pharm.ready && G.skillFx.pharm.kit.ready && G.player.body && G.player.body.md, null, { timeout: 120000 });
  await pg.waitForTimeout(1500);
  const summary = {};
  for (const scene of SCENES) {
    if (scene === 'oldsave') { summary.oldsave = await oldsave(); continue; }
    const dir = `${OUT}/${scene}_${SIZE}`; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const info = await ev(async ([scene]) => {
      const p = G.player, z = G.zone, geo = z.geo;
      for (const m of [...z.actors]) if (m !== p && m.def && m.body) m.remove && m.remove();
      G.skillFx.clear(); p.skills2.clearTemp(); p.target = null; p.lockOn = null; p.path = []; G.dev.full();
      const cx = p.pos.x, cz = p.pos.z, free = (c, R) => { for (let x = -R; x <= R; x += 0.6) for (let zz = -R; zz <= R; zz += 0.6) if (x * x + zz * zz <= R * R && geo.blocked(c.x + x, c.z + zz, 0.35)) return false; return true; };
      let spot = null, deg = 90;
      for (let r = 0; r <= 30 && !spot; r++) for (let k = 0; k < Math.max(1, r * 6) && !spot; k++) { const a = k / Math.max(1, r * 6) * 6.283, c = { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r }; if (free(c, 7)) spot = c; }
      spot = spot || { x: cx, z: cz };
      const a = deg * Math.PI / 180, f = { x: Math.sin(a), z: Math.cos(a) }; window.__f = f;
      p.teleport(spot); p.body.place(p.pos); p.setFacing(f.x, f.z); if (p.body.setArmed) { p.body.setArmed(true); p.calmT = 0; }
      const at = (d, s = 0) => ({ x: spot.x + f.x * d - f.z * s, z: spot.z + f.z * d + f.x * s }); window.__at = at;
      if (window.__tw) { geo.removeTag('pharm2_testwall'); window.__tw.parent && window.__tw.parent.remove(window.__tw); window.__tw = null; window.__wall = null; }
      if (scene === 'frost') {   // a test wall (a real collider in geo.boxes, like the chef's sugar wall) 4 m ahead across the roll + a stone-coloured box to see it
        const c = at(4.3, 0), ang = Math.atan2(f.x, f.z) * 180 / Math.PI; geo.boxes.push({ x: c.x, z: c.z, hw: 2.4, hd: 0.3, yaw: ang, tag: 'pharm2_testwall' });
        const THREE = await import('three'), m = new THREE.Mesh(new THREE.BoxGeometry(4.8, 1.4, 0.6), new THREE.MeshLambertMaterial({ color: 0x9a8f86 }));
        m.position.set(c.x, geo.ground(c.x, c.z).y + 0.7, -c.z); m.rotation.y = -ang * Math.PI / 180 + Math.PI; G.render.scene.add(m); window.__tw = m;
        window.__wall = { hit: 4.0, thick: 0.6 }; }
      const W = window.__wall;
      const spots = { rang: [[4.5, 0], [3.4, 2.2]], wick: [[5, 0], [5.3, -0.6], [5, 3.2]], frost: [[2.3, 0.5], W ? [5.9, 0.2] : [9, 0], [3.6, 1.4]], crystal: [[5, 0]], dream: [[2.0, 0], [1.7, 0.9], [2.3, -0.8], [2.2, 4.5]], touch: [[3, 0.4]] }[scene] || [];
      window.__ds = spots.map(([d, s]) => { const q = at(d, s), m = G.dev.dummies('mon_boar', 1, 0.01, q)[0]; m.teleport(q); if (scene !== 'dream') m.thinkStep = () => {}; m.hp = m.maxHp = 1e6; return m; });
      return { spot, deg, wall: W || null, n: window.__ds.length };
    }, [scene]);
    await pg.waitForFunction(() => window.__ds.every(m => m.body), null, { timeout: 120000 });
    const r0 = await ev(([scene, fps]) => {
      Math.random = () => 0.5;
      const p = G.player, f = window.__f, ds = window.__ds, L = window.__log = { sfx: [], dmg: [], fx: [], st: [], path: [], hand: [], pos: [] };
      for (const d of ds) { d.teleport(d.pos); d.setFacing(-f.x, -f.z); d.body.place(d.pos); d.knock = { x: 0, z: 0 }; if (scene === 'dream') { d.aggro = true; d.state = 'chase'; d.level = 30; } }
      for (let i = 0; i < 6; i++) G.step(1 / fps, false);
      { const c = G.render.cam; c.zoom = ['wick', 'crystal', 'frost'].includes(scene) && !window.__touch ? window.__zoom * 0.78 : window.__zoom; c.updateProjectionMatrix(); }
      const fd = scene === 'crystal' || scene === 'wick' ? 3.6 : scene === 'frost' ? 3.0 : 2.0; const fx0 = p.pos.x + f.x * fd, fz0 = p.pos.z + f.z * fd; G.render.setFocus({ x: fx0, y: 0, z: fz0 }, true);
      if (window.__cb0 === undefined) window.__cb0 = G.camBounds; G.camBounds = ['crystal', 'wick', 'frost'].includes(scene) ? [fx0, fz0, fx0, fz0] : window.__cb0;   // 먼 장면은 카메라를 그 자리에 고정
      try { for (const fl of G.ui.floats || []) fl.e && fl.e.remove && fl.e.remove(); if (G.ui.floats) G.ui.floats.length = 0; } catch (e) { }
      const S = G.skillFx.pharm; for (const k of ['rang', 'wick', 'frost', 'crystal', 'dream', 'moon']) if (!S['__w' + k]) { S['__w' + k] = true; const o = S[k].bind(S); S[k] = (a, opt) => { window.__log.fx.push({ k, t: +window.__t.toFixed(3) }); return o(a, opt); }; }
      const os = G.audio.sfx.bind(G.audio); if (!G.audio.__w) { G.audio.__w = true; G.audio.sfx = (n, o) => { window.__log.sfx.push({ n, t: +window.__t.toFixed(3) }); return os(n, o); }; }
      window.__t = 0; window.__hp = ds.map(d => d.hp); window.__p0 = ds.map(d => ({ ...d.pos })); window.__sp0 = p.sp;
      const id = { rang: 'ph1_a4', wick: 'ph1_b1', frost: 'ph1_b2', crystal: 'ph1_b4', dream: 'ph1_c1', touch: 'ph1_b2' }[scene];
      G.sheet.book.sk.slots = scene === 'touch' ? ['ph1_a4', 'ph1_b2', 'ph1_b4', 'ph1_c1'] : [id, 'ph1_a1', '', ''];
      if (scene === 'crystal') p.target = ds[0];
      if (scene === 'touch') { G.input.block = false; return { id, touch: true }; }
      const aim = scene === 'wick' ? window.__at(5) : { x: p.pos.x + f.x, z: p.pos.z + f.z };
      const e = p.skills2.cast(id, aim); return { id, err: e, lock: p.skills.lock };
    }, [scene, FPS]);
    if (r0.touch) {   // the real phone path: a touch on the skill-2 button of the keypad
      const bx = await ev(() => { const e = document.querySelector('.abtn.skill2'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, vis: getComputedStyle(e).display !== 'none' }; });
      r0.button = bx; if (bx) { await pg.touchscreen.tap(bx.x, bx.y); }
    }
    const total = Math.round(SEC[scene] * FPS), shots = SHOT[scene].map(t => Math.round(t * FPS)), frames = {};
    for (let i = 0; i < total; i++) {
      const want = shots.includes(i);
      const c = await ev(([i, fps, scene, draw]) => {
        window.__t = i / fps; const p = G.player, f = window.__f, ds = window.__ds, L = window.__log, eng = p.skills2;
        if (scene === 'touch' && i === 2) G.input.block = true;
        // scripted movement (the player's own input is blocked): rang = strafe to the right side after the throw, wick = one walks out / one walks in, crystal = target walks sideways
        if (scene === 'rang' && window.__t > 0.3 && window.__t < 1.3) { const sx = -f.z, sz = f.x, k = 4.6 / fps; p.pos = G.zone.geo.move(p.pos, sx * k, sz * k, p.radius); p.body.play('walk', 1); }
        if (scene === 'wick') { if (window.__t > 1.05 && window.__t < 1.6) { const d = ds[1]; d.pos = G.zone.geo.move(d.pos, -f.z * -3 / fps, f.x * -3 / fps, d.radius); d.body.play('walk', 1); } if (window.__t > 1.2 && window.__t < 1.75) { const d = ds[2]; d.pos = G.zone.geo.move(d.pos, -f.z * -5 / fps, f.x * -5 / fps, d.radius); d.body.play('walk', 1); } }
        if (scene === 'crystal') { const d = ds[0]; d.pos = G.zone.geo.move(d.pos, -f.z * 2 / fps, f.x * 2 / fps, d.radius); d.body.play('walk', 1); }
        if (scene === 'dream' && Math.abs(window.__t - 1.2) < 0.5 / fps) { p.target = ds[0]; eng.cd = {}; G.dev.full(); L.wakeCast = p.skills2.cast('ph1_a1', { x: ds[0].pos.x, z: ds[0].pos.z }); L.wakeAt = window.__t; }
        if (draw) G.step(1 / fps, true); else { G.step(1 / fps, false); try { G.skillFx.update(1 / fps); } catch (e) { } }
        ds.forEach((d, k) => { if (d.hp < window.__hp[k]) { L.dmg.push({ t: +window.__t.toFixed(3), k, a: Math.round(window.__hp[k] - d.hp) }); window.__hp[k] = d.hp; } });
        L.st.push(ds.map(d => (d.status.has('sleep') ? 'Z' : '') + (d.status.has('slow') ? 's' : '') + (d.status.has('burn') ? 'B' : '')).join('|'));
        L.pos.push(ds.map(d => [+d.pos.x.toFixed(2), +d.pos.z.toFixed(2)]));
        if (eng.ph && eng.ph.rang) L.path.push({ t: +window.__t.toFixed(3), x: +eng.ph.rang.pos.x.toFixed(2), z: +eng.ph.rang.pos.z.toFixed(2), back: eng.ph.rang.back, px: +p.pos.x.toFixed(2), pz: +p.pos.z.toFixed(2), thrown: !!p.body.thrownR });
        const tg = ds[0], mid = scene === 'crystal' ? { x: (p.pos.x + tg.pos.x * 2) / 3, z: (p.pos.z + tg.pos.z * 2) / 3 } : scene === 'wick' ? { x: (p.pos.x + tg.pos.x) / 2, z: (p.pos.z + tg.pos.z) / 2 } : scene === 'frost' ? { x: p.pos.x + f.x * 3.2, z: p.pos.z + f.z * 3.2 } : { x: p.pos.x + f.x * 2.2, z: p.pos.z + f.z * 2.2 };
        const s = G.render.toScreen({ x: mid.x, y: p.pos.y + 0.8, z: mid.z }); return [s.x, s.y];
      }, [i, FPS, scene, want]);
      if (want) { const CW = Math.min(VW, TOUCH ? 390 : 720), CH = Math.min(VH, TOUCH ? 600 : 500), fn = `${dir}/${String(i).padStart(3, '0')}.png`;
        await pg.screenshot({ path: fn, clip: { x: Math.max(0, Math.min(VW - CW, Math.round(c[0] - CW / 2))), y: Math.max(0, Math.min(VH - CH, Math.round(c[1] - CH / 2))), width: CW, height: CH }, timeout: 600000 }); frames[i] = fn; }
    }
    const res = await ev(() => { const L = window.__log, ds = window.__ds, p = G.player, eng = p.skills2;
      const dot = []; return { sfx: L.sfx, dmg: L.dmg, fx: L.fx, status: L.st.filter((s, i) => i === 0 || s !== L.st[i - 1]).slice(0, 40), statusAt: L.st.map((s, i) => [i, s]).filter((x, i, a) => i === 0 || x[1] !== a[i - 1][1]).map(([i, s]) => [+(i / 30).toFixed(2), s]),
        path: L.path.filter((x, i) => i % 2 === 0), moved: ds.map((d, k) => +Math.hypot(d.pos.x - window.__p0[k].x, d.pos.z - window.__p0[k].z).toFixed(2)), posEnd: L.pos[L.pos.length - 1],
        spUsed: +(window.__sp0 - p.sp).toFixed(1), cd: Object.fromEntries(Object.entries(eng.cdLen).map(([k, v]) => [k, +v.toFixed(2)])), ph: eng.ph ? eng.ph.log : null, lastShatter: eng.ph && eng.ph.lastShatter,
        thrown: !!p.body.thrownR, live: G.skillFx.pharm.live.length, wakeCast: L.wakeCast, wakeAt: L.wakeAt, slots: G.sheet.book.sk.slots, dot }; });
    res.info = info; res.start = r0; summary[scene] = res;
    const pick = SHOT[scene].map(t => frames[Math.round(t * FPS)] || '');
    fs.writeFileSync('/tmp/_ph2strip.py', `from PIL import Image, ImageDraw\nfr=${JSON.stringify(pick)}\nlab=${JSON.stringify(SHOT[scene])}\nims=[Image.open(f) if f else None for f in fr]\nw,h=next(i for i in ims if i).size\nims=[i or Image.new('RGB',(w,h)) for i in ims]\nn=len(ims); cols=5 if n>5 else n; rows=(n+cols-1)//cols\nsh=Image.new('RGB',(w*cols,(h+24)*rows),(20,20,24)); d=ImageDraw.Draw(sh)\nfor k,im in enumerate(ims):\n  x=(k%cols)*w; y=(k//cols)*(h+24); sh.paste(im,(x,y+24)); d.text((x+6,y+5),'${scene} t=%.2fs'%lab[k],fill=(255,230,150))\nsh.save('${OUT}/${scene}_${SIZE}.png')\n`);
    try { execSync('python3 /tmp/_ph2strip.py'); } catch (e) { console.log('strip failed', e.message); }
    fs.writeFileSync(`${OUT}/${scene}_${SIZE}.json`, JSON.stringify(res, null, 1));
    console.log(scene, JSON.stringify({ dmg: res.dmg, ph: res.ph, moved: res.moved, spUsed: res.spUsed, cd: res.cd, statusAt: res.statusAt.slice(0, 12), shatter: res.lastShatter, start: r0, wake: [res.wakeCast, res.wakeAt] }));
  }
  async function oldsave() {
    // an old (pre-change) save: 밀어내기·화염 약병·부식 약병·냉각 약병 on slots 1-4, 회복제 제작 Lv4 (no slot), points 3
    await ev(() => { const P = G.profile; P.sk.learned = Object.assign({}, P.sk.learned, { ph1_a4: 3, ph1_b1: 2, ph1_b4: 1, ph1_b2: 5, ph1_c1: 4 }); P.sk.slots = ['ph1_a4', 'ph1_b1', 'ph1_b4', 'ph1_b2']; P.sk.points = 3; G.saveToSlot(0); });
    const before = await ev(() => JSON.parse(localStorage.getItem('arcan_save_0') || 'null'));
    await pg.reload(); await pg.waitForFunction(() => window.G && G.slots && document.querySelector('.title-continue'), null, { timeout: 300000 });
    await ev(() => G.loadSlot(0));   // the title 불러오기 -> 자동 저장 path (store.load + migrate + enterWorld)
    await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.player.body && G.player.body.md, null, { timeout: 300000 });
    await pg.waitForTimeout(2000);
    const r = await ev(async () => { const sk = G.sheet.book.sk, p = G.player; G.frame = () => {}; G.dev.full(); if (p.body.setArmed) p.body.setArmed(true);
      const before = { slots: [...sk.slots], learned: { a4: sk.learned.ph1_a4, b1: sk.learned.ph1_b1, b2: sk.learned.ph1_b2, b4: sk.learned.ph1_b4, c1: sk.learned.ph1_c1 }, points: sk.points, names: sk.slots.map(id => G.data.skill2(id) && G.data.skill2(id).name) };
      const sp0 = p.sp; G.input.block = false; p.actions({ down: { skill1: true }, held: {}, move: null }); G.input.block = true;
      for (let i = 0; i < 40; i++) G.step(1 / 30, false);
      return Object.assign(before, { spAfterSlot1: +(sp0 - p.sp).toFixed(1), cdSlot1: p.skills2.cdLeft('ph1_a4') > 0, thrownSeen: !!(p.skills2.ph && p.skills2.ph.log.catch + (p.skills2.ph.rang ? 1 : 0)) }); });
    await pg.screenshot({ path: `${OUT}/oldsave_${SIZE}.png` });
    r.savedSlots = before && before.sk ? before.sk.slots : (before && before.profile && before.profile.sk ? before.profile.sk.slots : null);
    fs.writeFileSync(`${OUT}/oldsave_${SIZE}.json`, JSON.stringify(r, null, 1)); console.log('oldsave', JSON.stringify(r));
    return r;
  }
  console.log('errors', JSON.stringify(errs.slice(0, 12)));
  fs.writeFileSync(`${OUT}/summary_${SIZE}.json`, JSON.stringify({ summary, errors: errs }, null, 1));
  await b.close();
})();
