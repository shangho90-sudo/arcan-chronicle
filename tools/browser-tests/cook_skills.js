// 요리사 1차 스킬(식칼 썰기·팬 강타·미트볼 던지기 + 2026-11-13 뒤집기 flip·도마 방어 board·뜨거운 국물 soup·후추 뿌리기 pepper·밀가루 구름 flour·꼬치 찌르기 skewer·든든한 한 끼 meal·간식 시간 snack)을 실제 스킬 경로(skills2.cast → 동작 → 피해 →
// js/cookfx.js)로 시전하고 화면 띠와 수치를 남김. G.step(1/FPS) 한 프레임씩, Math.random 고정.
// SCENE=moving (대상이 옆으로 2.4 m/s 걸어감)·repeat (0.7초에 다시 시전, 미트볼 두 묶음이 겹침)도 있음 — 미트볼 던지기 확인용
// Usage: SKILL=chop|pan|ball|flip|board|soup|pepper|flour|skewer|meal|snack|lunch|bowl(제작 완성 연출 + 1.2초에 먹기) LV=1..5 SCENE=hit|whiff|kill|stun|miss|boss(뒤집기: 띄울 수 없는 적) GENDER=m|f SIZE=1100x760|390x844t FX=1|0 TAG=after DIR=90
//        SEED=12345(Math.random 씨앗 — MISS가 나오면 바꿈) DUR=초
//        URL=http://localhost:8797/index.html OUT=/tmp/cook node tools/browser-tests/cook_skills.js
//   -> OUT/<TAG>_<skill>_lv<LV>_<scene>_<gender>_<size>_fx<FX>.png (+ .json)
//   로그: 피해 틱(시각·양), 타수와 기대 타수, 총 피해 / 기대 총 계수, 이펙트 호출(strike/land/splat/stun) 시각, 소리 호출, 히트스톱(시전자·대상 freezeT,
//   전역 hitStopT), 카메라 흔들림 폭, 기절 구간(m.stunned), 대상 이동, 행동 잠금이 풀린 프레임, 남은 이펙트 수, 콘솔 오류
const { chromium } = require('playwright'); const fs = require('fs'); const { execSync } = require('child_process');
const SK = { lunch: 'ck1_c1', bowl: 'ck1_c2', chop: 'ck1_a1', pan: 'ck1_a2', ball: 'ck1_b1', flip: 'ck1_a3', board: 'ck1_a4', soup: 'ck1_b2', pepper: 'ck1_b3', flour: 'ck1_b4', skewer: 'ck1_b5', meal: 'ck1_c3', snack: 'ck1_c4' };
const LIST = (process.env.SKILLS || process.env.SKILL || 'chop').split(','), LV = +(process.env.LV || 1);   // SKILLS=a,b,c: several skills in one browser session (the game loads once)
const SCENE = process.env.SCENE || 'hit', DIR = +(process.env.DIR || 90), FPS = +(process.env.FPS || 60), G_ = process.env.GENDER || 'm';
const SIZE = process.env.SIZE || '1100x760', TOUCH = SIZE.endsWith('t'), [VW, VH] = SIZE.replace('t', '').split('x').map(Number);
const FX = process.env.FX !== '0', TAG = process.env.TAG || 'after', OUT = process.env.OUT || '/tmp/cook', ZOOM = +(process.env.ZOOM || 1.4);
const M2 = { flip: '0.05,0.15,0.22,0.25,0.28,0.33,0.40,0.50,0.62,0.76,0.90,1.05,1.2,1.4', board: '0.05,0.25,0.32,0.38,0.50,0.80,0.82,0.86,0.95,1.40,1.42,1.5,2.0,2.05,2.5,2.6', soup: '0.03,0.10,0.15,0.17,0.20,0.24,0.30,0.38,0.48,0.60,0.75,0.95', pepper: '0.03,0.10,0.15,0.17,0.20,0.26,0.34,0.40,0.50,0.62,0.80,1.0',
  flour: '0.03,0.10,0.15,0.18,0.22,0.30,0.42,0.60,0.90,1.3,1.8,2.2', skewer: '0.05,0.12,0.18,0.22,0.25,0.27,0.30,0.34,0.40,0.48,0.58,0.70', meal: '0.10,0.25,0.31,0.36,0.45,0.56,0.66,0.76,0.86,0.96,1.1,1.3', snack: '0.10,0.25,0.31,0.36,0.45,0.56,0.66,0.76,0.86,0.96,1.1,1.3',
  lunch: '0.05,0.15,0.30,0.50,0.80,1.25,1.40,1.55,1.66,1.76,1.90,2.1', bowl: '0.05,0.15,0.30,0.50,0.80,1.25,1.40,1.55,1.66,1.76,1.90,2.1',
  pan: '0.05,0.15,0.22,0.27,0.30,0.32,0.36,0.45,0.60,0.80,1.2,2.0', chop: '0.05,0.15,0.20,0.22,0.25,0.30,0.34,0.40,0.46,0.52,0.58,0.64,0.70,0.80,0.95,1.2', ball: '0.12,0.16,0.19,0.22,0.26,0.30,0.35,0.40,0.45,0.50,0.56,0.617,0.68,0.734,0.79,0.851,0.93,1.018,1.1,1.25' };
const cfg = (SKILL) => { const WIDE = ['ball', 'soup', 'pepper', 'flour', 'skewer'].includes(SKILL);
  return { SKILL, ID: SK[SKILL], DIST: SKILL === 'ball' ? 5 : SKILL === 'pepper' || SKILL === 'flour' ? 4 : SKILL === 'soup' || SKILL === 'skewer' ? 2.2 : 1.5, CW: +(process.env.CW || Math.min(VW, WIDE ? 640 : 460)), CH: +(process.env.CH || Math.min(VH, 440)),
    DUR: +(process.env.DUR || (SCENE === 'stun' ? 4.2 : SKILL === 'ball' ? 1.9 : SKILL === 'flour' ? 2.3 : SKILL === 'board' ? 2.7 : SKILL === 'lunch' || SKILL === 'bowl' ? 2.3 : SKILL === 'pan' ? 2.1 : 1.6)), MARKS: (process.env.MARKS || M2[SKILL]).split(',').map(Number).filter((m, i) => !process.env.FEW || i % 2 === 1) }; };   // FEW=1: every other frame mark (faster)
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: VW, height: VH }, hasTouch: TOUCH, isMobile: TOUCH })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error' || /cook|fx /.test(m.text())) errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(process.env.URL || 'http://localhost:8797/index.html');
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(fx => { localStorage.clear(); localStorage.setItem('arcan_settings', JSON.stringify({ graphicsFx: fx })); }, FX);
  await pg.reload(); await click('새 게임'); await click('모험 시작');
  await pg.waitForSelector('.prologue.on', { timeout: 60000 }).then(() => click('건너뛰기')).catch(() => {});
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.player.body && G.player.body.md, null, { timeout: 300000 });
  await pg.waitForFunction(() => G.skillFx && G.skillFx.cook, null, { timeout: 120000 });
  await ev(async ([z, g, ids, lv]) => {
    G.frame = () => {}; const c = G.render.cam; c.zoom = z; c.updateProjectionMatrix();
    document.querySelectorAll('.hud,.controls,.toasts,.qhud,.qh-reopen,.plates').forEach(e => e.style.display = 'none');
    if (G.reward) { G.reward.jobChange = sw => sw && sw(); G.reward.levelUp = () => {}; }
    G.dev.level(20); G.sheet.p.gender = g; G.dev.job('cook'); G.sheet.bag.add('w_knife_1', 1); G.sheet.p.weapon = 'w_knife_1';
    const bk = G.sheet.book; bk.sk.points += 99; for (const id of ids) for (let i = 0; i < lv; i++) if (!bk.learnBlock(id)) bk.learn(id);
    G.sheet.bag.add('f_lunch', 5); G.sheet.recalc(); G.dev.full(); G.input.block = true;
    await G.player.attachBody(); G.player.body.place(G.player.pos); G.player.body.play('idle', 1, true);
    G.skillFx.cook.load();
    { const R = G.render.r, o = R.render.bind(R); R.render = (sc, c) => { if (!window.__noDraw) o(sc, c); }; }   // frames that are not photographed run the whole game step but skip the GPU draw (SwiftShader is the slow part)
    const p = G.player; let spot = null; const cx = p.pos.x, cz = p.pos.z;
    for (let r = 0; r <= 16 && !spot; r++) for (let k = 0; k < Math.max(1, r * 6) && !spot; k++) { const a = k / Math.max(1, r * 6) * 6.283, c = { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r }; let ok = true;
      for (let x = -7; x <= 7 && ok; x += 0.75) for (let z = -7; z <= 7 && ok; z += 0.75) if (x * x + z * z <= 49 && G.zone.geo.blocked(c.x + x, c.z + z, 0.35)) ok = false; if (ok) spot = c; }
    window.__spot = spot || { x: cx, z: cz };
  }, [ZOOM, G_, LIST.map(k => SK[k]), LV]);
  await pg.waitForFunction(() => G.skillFx.cook.ready && G.player.body && G.player.body.md, null, { timeout: 120000 });
  await pg.waitForTimeout(1500);
  for (const SKILL of LIST) { const { ID, DIST, CW, CH, DUR, MARKS } = cfg(SKILL); errs.length = 0;
  await ev(() => { window.__c0 = null; window.__log = null; G.player.skills2.cd = {}; G.player.skills.lock = 0; G.player.sp = G.player.maxSp; G.dev.full(); for (const s of G.player.status.list.slice()) G.player.status.remove(s.def.id); });
  const name = `${TAG}_${SKILL}_lv${LV}_${SCENE}_${G_}_${SIZE}_fx${FX ? 1 : 0}`, dirOut = `${OUT}/${name}`; fs.rmSync(dirOut, { recursive: true, force: true }); fs.mkdirSync(dirOut, { recursive: true });
  await ev(([dir, dist, skill, scene]) => {
    const p = G.player, a = dir * Math.PI / 180, f = { x: Math.sin(a), z: Math.cos(a) };
    for (const m of [...G.zone.actors]) if (m !== p && m.def && m.body) m.remove && m.remove();
    G.skillFx.clear(); p.teleport(window.__spot); p.body.place(p.pos); p.setFacing(f.x, f.z); p.target = null; p.lockOn = null; p.path = []; G.dev.full();
    const at = d => ({ x: p.pos.x + f.x * d, z: p.pos.z + f.z * d });
    window.__f = f; window.__at = at;
    const side = (d, s) => ({ x: p.pos.x + f.x * d - f.z * s, z: p.pos.z + f.z * d + f.x * s });
    const spots = { soup: [side(1.7, 0), side(2.4, 0.8), side(2.5, -0.85)], skewer: [side(1.3, 0), side(2.3, 0.15), side(3.1, -0.15)], pepper: [side(dist, 0), side(dist + 0.9, 0.9), side(dist - 0.8, -1.0)], flour: [side(dist, 0), side(dist + 1.2, 1.0), side(dist - 1.0, -1.2)] }[skill] || [at(dist)];
    window.__ds = spots.map(s => { const m = G.dev.dummies(scene === 'boss' ? 'mon_golem' : 'mon_boar', 1, 0.01, s)[0]; m.teleport(s); m.__spot = s; return m; });
  }, [DIR, DIST, SKILL, SCENE]);
  await pg.waitForFunction(() => window.__ds.every(m => m.body), null, { timeout: 120000 });
  const info = await ev(([scene, fps, id, dist, sd, skill]) => {
    let seed = +sd || 12345; Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const p = G.player, f = window.__f, m = window.__ds[0];
    for (const q of window.__ds) { if (scene !== 'stun') q.thinkStep = () => {}; q.teleport(q.__spot); q.setFacing(-f.x, -f.z); q.body.place(q.pos); }
    if (p.body.setArmed) { p.body.setArmed(true); p.calmT = 0; }
    for (let i = 0; i < 12; i++) G.step(1 / fps, false);
    p.teleport(window.__spot); p.setFacing(f.x, f.z); for (const q of window.__ds) { q.knock = { x: 0, z: 0 }; q.teleport(q.__spot); q.__hp = q.hp; }
    G.render.setFocus({ x: p.pos.x + f.x * dist * 0.6, y: 0, z: p.pos.z + f.z * dist * 0.6 }, true);
    const d = G.data.skill ? G.data.skill(id) : G.data.skills2.find(s => s.id === id);
    const L = window.__log = { fx: [], sfx: [], dmg: [], num: [], freezeP: [], freezeT: [], gstop: [], cam: [], lock: [], stun: [], act: [] };
    window.__t = 0; window.__p0 = { ...m.pos }; window.__hp = m.hp; window.__scene = scene; window.__id = id;
    const S = G.skillFx.cook;
    for (const k of ['volley', 'knife', 'pan', 'stun', 'proj', 'splat', 'flip', 'board', 'soup', 'pepper', 'sack', 'flour', 'skewer', 'eat', 'made']) if (S[k] && !S['__w' + k]) { S['__w' + k] = true; const o = S[k].bind(S); S[k] = (a, opt) => { window.__log.fx.push({ k, t: +window.__t.toFixed(3), hit: opt && opt.hit }); const h = o(a, opt);
      if (h && h.strike) { const s0 = h.strike, m0 = h.miss; h.strike = (...x) => { window.__log.fx.push({ k: 'strike', t: +window.__t.toFixed(3) }); return s0(...x); }; h.miss = (...x) => { window.__log.fx.push({ k: 'miss', t: +window.__t.toFixed(3) }); return m0(...x); }; }
      if (h && h.hit) { const h0 = h.hit; h.hit = (ok, ...x) => { window.__log.fx.push({ k: k + '.hit', t: +window.__t.toFixed(3), n: ok ? ok.length : 0 }); return h0(ok, ...x); }; }
      if (h && h.fizzle) { const z0 = h.fizzle, l0 = h.launch; h.fizzle = (i, ...x) => { window.__log.fx.push({ k: 'fizzle', i, t: +window.__t.toFixed(3) }); return z0(i, ...x); }; h.launch = (i) => { window.__log.fx.push({ k: 'launch', i, t: +window.__t.toFixed(3) }); return l0(i); };
        const v0 = h.hit; h.hit = (i, pos, dir, last, ok) => { window.__log.fx.push({ k: 'ball.hit', i, t: +window.__t.toFixed(3), ok, last, dir: [dir.x, dir.y, dir.z].map(v => +v.toFixed(2)) }); return v0(i, pos, dir, last, ok); }; }
      if (h && h.block) { const b0 = h.block; h.block = (...x) => { window.__log.fx.push({ k: 'block', t: +window.__t.toFixed(3) }); return b0(...x); }; }
      if (h && h.land) { const l0 = h.land; h.land = (t) => { window.__log.fx.push({ k: 'land', t: +window.__t.toFixed(3), hit: !!t }); return l0(t); }; }
      return h; }; }
    if (!G.audio.__w) { G.audio.__w = true; const os = G.audio.sfx.bind(G.audio); G.audio.sfx = (n, o) => { window.__log.sfx.push({ n, t: +window.__t.toFixed(3), r: o && o.rate }); return os(n, o); };
      const od = G.ui.damageText.bind(G.ui); G.ui.damageText = (...a) => { window.__log.num.push({ t: +window.__t.toFixed(3), v: a[1] }); return od(...a); }; }
    p.target = m; window.__sp0 = p.sp;
    if (scene === 'kill') for (const q of window.__ds) q.hp = q.__hp = Math.max(2, Math.round(p.stat('atk') * 0.5));   // dies on the first or second tick; the rest must not crash or linger
    window.__hp = m.hp;
    if (['meal', 'snack', 'lunch', 'bowl'].includes(skill)) p.hp = Math.round(p.maxHp * 0.5);
    if (skill === 'lunch' || skill === 'bowl') {   // 간단한 도시락·따뜻한 수프 (craft): the finished dish pops up (skillui -> cook.made), then at 1.2 s the item is eaten (actors useItem -> cook.eat)
      const it = skill === 'lunch' ? 'f_lunch' : 'f_soup'; G.sheet.bag.add(it, 2); p.potionCd = 0; G.skillFx.cook.made(p, { kind: skill === 'lunch' ? 'lunch' : 'soup' }); window.__eatAt = Math.round(1.2 * fps); window.__eatId = it;
    } else { const e = p.skills2.cast(id, window.__at(dist)); if (e) return 'cast error: ' + e; }
    if (scene === 'whiff') for (const q of window.__ds) { q.dead = true; q.remove(); }
    if (scene === 'miss') Math.random = () => 0.0001;   // every accuracy roll fails -> MISS (명중 판정)   // these skills need a target to start: a whiff = the target is gone before the hit
    return { hp: window.__hp, atk: p.stat('atk'), def: m.stat('def'), lv: p.skills2.lvl(id), mult: p.skills2.mult(d || { id, type: 'attack' }), desc: d && d.desc, cd: d && d.cd, mp: d && d.mp };
  }, [SCENE, FPS, ID, DIST, +(process.env.SEED || 12345), SKILL]);
  if (typeof info === 'string') { console.log(SKILL, info); continue; }
  const frames = [], total = Math.round(DUR * FPS); let dc = 0;
  for (let i = 0; i < total; i++) {
    const shot = process.env.SHOTS !== '0' && MARKS.some(m => i === Math.round(m * FPS));   // SHOTS=0: numbers only (fast)
    const c = await ev(([i, fps, dist, skill, shot]) => {
      window.__t = i / fps; window.__noDraw = !shot; const p = G.player, f = window.__f, m = window.__ds[0], L = window.__log;
      if (window.__eatAt === i) { p.potionCd = 0; L.ate = p.useItem(window.__eatId); }
      if (window.__scene === 'moving' && m && !m.dead && i > 20) { m.teleport({ x: m.pos.x - f.z * 2.4 / fps, z: m.pos.z + f.x * 2.4 / fps }); }   // walks sideways across the volley at 2.4 m/s
      if (window.__scene === 'repeat' && i === Math.round(0.7 * fps)) { p.skills2.cd = {}; p.skills.lock = 0; p.sp = p.maxSp; L.recast = p.skills2.cast(window.__id, window.__at(dist)) || 'ok'; }
      G.step(1 / fps, true);
      window.__ds.forEach((q, qi) => { if (q.__hp == null) q.__hp = window.__hp; if (!q.removed && q.hp < q.__hp) { L.dmg.push({ t: +window.__t.toFixed(3), a: Math.round(q.__hp - q.hp), dead: !!q.dead, i: qi }); q.__hp = q.hp; } });
      if (skill === 'board' && [48, 84, 120].includes(i)) { const h0 = p.hp; p.takeDamage({ source: m, amount: 40, noMiss: true }); L.dmg.push({ t: +window.__t.toFixed(3), taken: Math.round(h0 - p.hp), of: 40 }); }
      if (skill === 'board' && i === 150) try { const h0 = p.hp; p.takeDamage({ source: { pos: { x: p.pos.x - f.x * 2, z: p.pos.z - f.z * 2 }, faction: 'monster', stat: () => 0, level: 1 }, amount: 40, noMiss: true }); L.dmg.push({ t: +window.__t.toFixed(3), takenFromBehind: Math.round(h0 - p.hp), of: 40 }); } catch (err) { L.dmg.push({ behindErr: String(err) }); }
      if (m && m.body && m.body.tossT > 0) L.toss = (L.toss || 0) + 1;
      if ((p.freezeT || 0) > 0) L.freezeP.push(+window.__t.toFixed(3)); if (m && m.freezeT > 0) L.freezeT.push(+window.__t.toFixed(3)); if (G.hitStopT > 0) L.gstop.push(+window.__t.toFixed(3));
      if (m && !m.removed && m.stunned) L.stun.push(+window.__t.toFixed(3));
      if (m && !m.removed && m.body && (i % 12 === 0)) L.act.push([+window.__t.toFixed(2), m.body.action, m.state || '']);
      L.lock.push(+(p.skills.lock || 0).toFixed(3));
      const cp = G.render.cam.position, fu = G.render.focusU, rel = { x: cp.x - fu.x, y: cp.y - fu.y, z: cp.z + fu.z }; if (!window.__c0) window.__c0 = rel;
      L.cam.push(+Math.hypot(rel.x - window.__c0.x, rel.y - window.__c0.y, rel.z - window.__c0.z).toFixed(4));
      const fc = skill === 'pepper' || skill === 'flour' ? 0.8 : 0.62, s = G.render.toScreen({ x: p.pos.x + f.x * dist * fc, y: p.pos.y + 1.1, z: p.pos.z + f.z * dist * fc });
      return [s.x, s.y, G.render.r ? G.render.r.info.render.calls : -1];
    }, [i, FPS, DIST, SKILL, shot]);
    const fn = `${dirOut}/${String(i).padStart(3, '0')}.png`;
    if (shot) await pg.screenshot({ path: fn, clip: { x: Math.max(0, Math.min(VW - CW, Math.round(c[0] - CW / 2))), y: Math.max(0, Math.min(VH - CH, Math.round(c[1] - CH / 2))), width: CW, height: CH }, timeout: 300000 });
    frames.push(shot ? fn : null); dc = Math.max(dc, c[2]);
  }
  // the rest of the effect's life without drawing (flour 6 s, board 5 s): nothing may be left over
  await ev(() => { window.__noDraw = false; });
  const late = await ev(() => { const a = { slowAt2s: window.__ds.filter(q => !q.removed && q.status && q.status.has('slow')).length, guard: G.player.status.has('frontguard') }; window.__noDraw = true; for (let i = 0; i < 270; i++) G.step(1 / 30, true); window.__noDraw = false; a.liveAfter9s = G.skillFx.cook.live.length; a.areas = G.player.skills2.areas ? G.player.skills2.areas.length : -1; a.guardAfter = G.player.status.has('frontguard'); return a; });
  const res = await ev(([id]) => { const L = window.__log, m = window.__ds[0], p = G.player; const rng = a => a.length ? [a[0], a[a.length - 1], a.length] : null;
    const camMax = Math.max(...L.cam), last = L.cam.length - 1 - [...L.cam].reverse().findIndex(v => v > 0.002);
    return { recast: L.recast, ate: L.ate, fx: L.fx, sfx: L.sfx, dmg: L.dmg, tossFrames: L.toss || 0, slowed: window.__ds.filter(q => !q.removed && q.status && q.status.has('slow')).length, statuses: window.__ds.map(q => q.removed ? 'gone' : q.status.list.map(x => x.def.id).join('+')), buffs: p.status.list.map(x => x.def.id).join('+'), food: G.sheet.bag.count('f_lunch'), hits: L.dmg.length, total: L.dmg.reduce((s, d) => s + (d.a || 0), 0), nums: L.num.length, freezePlayer: rng(L.freezeP), freezeTarget: rng(L.freezeT), globalHitStop: rng(L.gstop),
      stun: rng(L.stun), act: L.act, lockEndFrame: L.lock.findIndex((v, i) => i > 3 && v <= 0), camMax: +camMax.toFixed(4), camLastFrame: camMax > 0.002 ? last : -1,
      targetMoved: m && !m.removed ? +Math.hypot(m.pos.x - window.__p0.x, m.pos.z - window.__p0.z).toFixed(3) : null, spUsed: +(window.__sp0 - p.sp).toFixed(1), cdLen: p.skills2.cdLen && p.skills2.cdLen[id],
      live: G.skillFx.cook.live.length, things: p.skills2.things.length, pending: p.skills2.pending.length }; }, [ID]);
  res.info = info; res.late = late; res.drawCallsMax = dc; res.errors = errs.slice(0, 8);
  const pick = MARKS.map(m => frames[Math.round(m * FPS)] || null);
  fs.writeFileSync('/tmp/_cookstrip.py', `from PIL import Image, ImageDraw\nfr=${JSON.stringify(pick.map(f => f || ''))}\nlab=${JSON.stringify(MARKS)}\nims=[Image.open(f) if f else None for f in fr]\nw,h=next(i for i in ims if i).size\nims=[i or Image.new('RGB',(w,h),(0,0,0)) for i in ims]\nn=len(ims); cols=(n+1)//2 if n>7 else n; rows=(n+cols-1)//cols\nsh=Image.new('RGB',(w*cols,(h+22)*rows),(20,20,28))\nd=ImageDraw.Draw(sh)\nfor i,(im,l) in enumerate(zip(ims,lab)):\n  x=(i%cols)*w; y=(i//cols)*(h+22)\n  sh.paste(im,(x,y+22)); d.text((x+6,y+4),('t %.3fs'%l),fill=(255,255,255))\nsh.save('${OUT}/${name}.png')`);
  try { execSync('python3 /tmp/_cookstrip.py'); } catch (e) { console.log('strip failed', e.message); }
  console.log(name, JSON.stringify(res)); console.log('strip', `${OUT}/${name}.png`);
  fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify(res, null, 1));
  }
  await b.close();
})();
