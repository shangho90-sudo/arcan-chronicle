// 무기 꺼내기 / 집어넣기 확인 (js/model.js backMount·draw·sheathe, js/actors.js Player.updateArms):
//   1 마을 대기: 칼이 등에 (4방향 근접 캡처 — 칼날이 몸을 뚫지 않는지)
//   2 숲에서 걷기: 등에 멘 채로 걷기
//   3 몬스터를 쫓게 만들어 걷는 중 꺼내기 (상체 겹침 동작)
//   4 칼을 멘 채로 공격 키: 빠른 꺼내기 → 5단 콤보 1타 (누른 뒤 1타 시작까지 시간)
//   5 공격을 멈추고 3초 → 집어넣기
//   6 칼을 멘 채로 스킬(일격참 nv_a1): 꺼낸 뒤 시전, 칼끝(bladePoints)이 있는지
// G.step(1/60)으로 한 프레임씩 진행, 장면마다 프레임 띠를 저장.
// Usage: GENDER=m|f SIZE=1100x760|390x844t TAG=after URL=http://localhost:8779/index.html node tools/browser-tests/sheathe.js
//        JOB=blacksmith 등: 그 직업으로 바꾼 뒤 확인(직업 모델·무기), ONLY=town,walk,aggro,attack,skill 로 일부만
//   -> OUT/<TAG>_<g>_<size>_<scene>.png (+ OUT/<TAG>_<g>_<size>.json 기록)
const { chromium } = require('playwright'); const fs = require('fs'); const { execSync } = require('child_process');
const SIZE = process.env.SIZE || '1100x760', TOUCH = SIZE.endsWith('t'), [VW, VH] = SIZE.replace('t', '').split('x').map(Number);
const TAG = process.env.TAG || 'after', OUT = process.env.OUT || '/tmp/sheathe', G_ = process.env.GENDER || 'm', ZOOM = +(process.env.ZOOM || 2.2);
const CW = Math.min(VW, 300), CH = Math.min(VH, 340), ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: VW, height: VH }, hasTouch: TOUCH, isMobile: TOUCH })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(process.env.URL || 'http://localhost:8779/index.html');
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(() => localStorage.clear()); await click('새 게임');
  await click('모험 시작');
  await pg.waitForSelector('.prologue.on', { timeout: 60000 }).then(() => click('건너뛰기')).catch(() => {});
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.player.body && G.player.body.md, null, { timeout: 300000 });
  await pg.waitForTimeout(1200);
  const R = { gender: await ev(() => G.sheet.p.gender), size: SIZE };
  // gender / job: switch the sheet and rebuild the body directly (the job-change light show is not part of this test)
  await ev(async ([g, j]) => { const s = G.sheet; s.p.gender = g; if (j) { G.dev.level(12); s.p.job = j; s.recalc && s.recalc(); }
    await G.player.attachBody(); G.player.body.place(G.player.pos); G.player.body.play('idle', 1, true); }, [G_, process.env.JOB || '']);
  R.model = await ev(() => G.player.body.md.cfg.file + ' / ' + G.player.body.weapon); R.gender = G_;
  await ev(z => {
    G.frame = () => {}; const c = G.render.cam; c.zoom = z; c.updateProjectionMatrix();
    document.querySelectorAll('.hud,.toasts,.layer:not(.controls),.qhud,.qh-reopen,.plates').forEach(e => e.style.display = 'none');
    if (!G.sheet.p.job || G.sheet.p.job === 'novice') G.dev.level(5); G.dev.full(); G.player.resetArms();
  }, ZOOM);
  if (!TOUCH) await ev(() => document.querySelectorAll('.controls').forEach(e => e.style.display = 'none'));
  const step = (n, draw = false) => ev(([n, draw]) => { for (let i = 0; i < n; i++) G.step(1 / 60, draw && i === n - 1); }, [n, draw]);
  const state = () => ev(() => { const B = G.player.body; return { act: B.action, armed: B.armed, armW: +B.armW.toFixed(2), over: B.over ? B.over.name + '@' + B.over.t.toFixed(2) : null, blade: !!B.bladePoints() }; });
  const shot = async (fn, up = 0.9) => {
    await ev(() => { const p = G.player; G.render.setFocus({ x: p.pos.x, y: 0, z: p.pos.z }, true); G.render.render(0); });
    const c = await ev(up => { const p = G.player, s = G.render.toScreen({ x: p.pos.x, y: p.pos.y + up, z: p.pos.z }); return [s.x, s.y]; }, up);
    await pg.screenshot({ path: fn, clip: { x: Math.max(0, Math.min(VW - CW, Math.round(c[0] - CW / 2))), y: Math.max(0, Math.min(VH - CH, Math.round(c[1] - CH / 2))), width: CW, height: CH }, timeout: 300000 });
  };
  const strip = (files, name, labels) => {
    const dir = `${OUT}/_tmp_${name}`; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
    files.forEach((f, i) => execSync(`ffmpeg -loglevel error -y -i ${f} -vf "drawtext=text='${labels[i]}':x=6:y=6:fontsize=16:fontcolor=white:box=1:boxcolor=black@0.55" ${dir}/${String(i).padStart(2, '0')}.png`));
    execSync(`ffmpeg -loglevel error -y -i ${dir}/%02d.png -vf tile=${Math.min(files.length, 8)}x${Math.ceil(files.length / 8)} -frames:v 1 ${OUT}/${name}.png`);
    files.forEach(f => fs.rmSync(f, { force: true })); fs.rmSync(dir, { recursive: true, force: true });
  };
  const base = `${TAG}_${G_}_${SIZE}${process.env.JOB ? '_' + process.env.JOB : ''}`, tmp = n => `${OUT}/_f_${base}_${n}.png`, run = s => !ONLY.length || ONLY.includes(s);
  const face = deg => ev(d => { const a = d * Math.PI / 180, p = G.player; p.setFacing(Math.sin(a), Math.cos(a)); p.body.setFacing(Math.sin(a), Math.cos(a)); p.body.yaw = p.body.targetYaw; }, deg);

  // 1 town idle, 4 facings (back clipping)
  await step(30); R.town = await state();
  if (run('town')) { const fs1 = []; for (const d of [0, 90, 180, 270]) { await face(d); await step(20); fs1.push(tmp('town' + d)); await shot(fs1[fs1.length - 1]); } strip(fs1, `${base}_1town`, ['0', '90', '180', '270']); }

  // to the forest
  await ev(() => G.travel('forest')); await pg.waitForFunction(() => !G.loading && G.zone.def.id === 'forest', null, { timeout: 300000 }); await step(20);
  await ev(() => { for (const m of [...G.zone.actors]) if (m !== G.player && m.faction === 'monster') m.remove && m.remove(); for (const n of G.zone.npcs) n.body && n.body.setVisible && n.body.setVisible(false);
    let seed = 777; Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; });
  // 2 walking sheathed
  R.forest0 = await state();
  if (run('walk')) {
    const f2 = []; await ev(() => G.input.hold && 0);
    for (let i = 0; i < 6; i++) { await ev(() => { G.input.stick = { x: 0.3, y: -1 }; }); await step(8); f2.push(tmp('walk' + i)); await shot(f2[i]); }
    await ev(() => { G.input.stick = { x: 0, y: 0 }; }); await step(30);
    R.walk = await state(); strip(f2, `${base}_2walk`, f2.map((_, i) => 'walk ' + (i * 8)));
  }
  // 3 a monster starts chasing while walking -> draw on the move
  if (run('aggro')) {
    await ev(() => { const p = G.player; const at = { x: p.pos.x + 6, z: p.pos.z + 3 }; const m = G.dev.dummies('mon_boar', 1, 0.01, at)[0]; m.teleport(at); m.update = function (dt) { this.state = 'chase'; this.baseUpdate && this.baseUpdate(dt); }; window.__m = m; });
    await pg.waitForFunction(() => window.__m.body, null, { timeout: 120000 });
    const f3 = [], L = [], log = [];
    for (let i = 0; i < 14; i++) { await ev(() => { G.input.stick = { x: -0.4, y: -1 }; }); await step(3); const s = await state(); log.push(s); if (i % 2 === 0) { f3.push(tmp('aggro' + i)); L.push(`${i * 3}f ${s.over || (s.armed ? 'hand' : 'back')}`); await shot(f3[f3.length - 1]); } }
    await ev(() => { G.input.stick = { x: 0, y: 0 }; window.__m.remove(); }); R.aggro = log; strip(f3, `${base}_3aggro`, L);
    // wait for it to go back
    await step(60 * 4); R.afterAggro = await state();
  }
  // 4 attack while sheathed: fast draw -> combo strike 1
  const dummy = async () => { await ev(() => { const p = G.player, f = { x: 0, z: 1 }; p.setFacing(0, 1); const at = { x: p.pos.x, z: p.pos.z + 1.6 }; const m = G.dev.dummies('mon_boar', 1, 0.01, at)[0]; m.teleport(at); m.thinkStep = () => {}; m.update = function (dt) { this.baseUpdate && this.baseUpdate(dt); }; window.__d = m; }); await pg.waitForFunction(() => window.__d.body, null, { timeout: 120000 }); };
  if (run('attack')) {
    await ev(() => { G.player.resetArms(); }); await dummy(); await step(5);
    const f4 = [], L = [], log = []; let first = null;
    for (let i = 0; i < 40; i++) {
      await ev(() => G.input.hold('attack', true)); await step(1); const s = await state(); log.push(s);
      if (first === null && s.act.startsWith('combo_')) first = i + 1;
      if (i % 3 === 0 && i <= 36) { f4.push(tmp('atk' + i)); L.push(`${i + 1}f ${s.act === 'idle' ? (s.over || '') : s.act}`); await shot(f4[f4.length - 1]); }
    }
    await ev(() => G.input.hold('attack', false));
    R.attack = { firstStrikeFrame: first, firstStrikeMs: first && Math.round(first / 60 * 1000), log: log.map(s => `${s.act}|${s.over || ''}|${s.armW}`) };
    strip(f4, `${base}_4attack`, L);
    // 5 stop: 3 s later -> sheathe
    let t0 = null; const f5 = [], L5 = [];
    await ev(() => window.__d.remove());
    for (let i = 0; i < 60 * 6; i++) {
      await step(1); const s = await state();
      if (t0 === null && s.over && s.over.startsWith('sheathe')) t0 = i;
      if (t0 !== null && (i - t0) % 4 === 0 && i - t0 <= 44) { f5.push(tmp('sh' + i)); L5.push(`+${i - t0}f ${s.over || (s.armed ? 'hand' : 'back')}`); await shot(f5[f5.length - 1]); }
      if (t0 !== null && i - t0 > 48) break;
    }
    R.sheathe = { startAfterS: t0 && +(t0 / 60).toFixed(2), end: await state() };
    strip(f5, `${base}_5sheathe`, L5);
  }
  // 6 skill while sheathed (일격참)
  if (run('skill')) {
    await ev(() => { const p = G.player, bk = p.sheet.book; bk.learn && bk.learn('nv_a1'); bk.sk.slots[0] = 'nv_a1'; p.skills2.cdEnd && (p.skills2.cdEnd = {}); p.resetArms(); });
    await dummy(); await step(5);
    const f6 = [], L = [], log = []; let cast = null;
    for (let i = 0; i < 44; i++) {
      if (i === 0) await ev(() => G.input.press('skill1')); await step(1); const s = await state(); log.push(s);
      if (cast === null && s.act !== 'idle' && s.act !== 'walk') cast = { frame: i + 1, act: s.act, bladeAtCast: s.blade };
      if (i % 4 === 0) { f6.push(tmp('sk' + i)); L.push(`${i + 1}f ${s.act === 'idle' ? (s.over || '') : s.act}`); await shot(f6[f6.length - 1]); }
    }
    R.skill = { cast, log: log.map(s => `${s.act}|${s.over || ''}|${s.armW}|${s.blade ? 'tip' : '-'}`) };
    strip(f6, `${base}_6skill`, L);
    await ev(() => window.__d.remove());
  }
  R.errors = errs.slice(0, 8);
  fs.writeFileSync(`${OUT}/${base}.json`, JSON.stringify(R, null, 1));
  console.log(JSON.stringify({ model: R.model, town: R.town, forest0: R.forest0, walk: R.walk, attack: R.attack && { first: R.attack.firstStrikeFrame, ms: R.attack.firstStrikeMs }, sheathe: R.sheathe, skill: R.skill && R.skill.cast, afterAggro: R.afterAggro, aggro: R.aggro && R.aggro.map(s => s.over || (s.armed ? 'H' : 'B')).join(','), errors: R.errors }));
  await b.close();
})();
