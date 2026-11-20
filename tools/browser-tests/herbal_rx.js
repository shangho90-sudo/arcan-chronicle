// 한약사 처방 5종(2026-11-20) 사용자 장면을 실제 게임 경로로 확인: 키·터치로 퀵슬롯을 누르고(PC 키 1~4 / 휴대폰 키패드 칸), 내 영물은 화면에서
// 눌러 고르고(actors.js onClick -> Zone.pickAlly), G.step(1/FPS) 한 프레임씩 진행. HUD·키패드를 보이게 두고 찍음(퀵슬롯 '남은 한 잔' 아이콘 확인).
// 장면: cups(혼자 탕약 두 잔 — 두 번째 누름 / 보관 만료) · rescue(포위된 천년삼 동자 구출) · guard(도발 중인 녹각수호령 보호)
//       combo(소경활혈탕 3타 -> 주작천구 추가 피해) · gather(자운화 -> 오령산) · oldsave(예전 저장: 레벨·퀵슬롯·보원탕 제작법)
// Usage: SCENES=cups,rescue,guard,combo,gather,oldsave SIZE=1280x720|390x844t DET=1 FPS=30 URL=http://localhost:8871/index.html OUT=/tmp/hbrw node tools/browser-tests/herbal_rx.js
//   -> OUT/<scene>_<size>.png (띠) + OUT/<scene>_<size>.json (수치) + OUT/<scene>_<size>_slot*.png(퀵슬롯 칸)
const { chromium } = require('playwright'); const fs = require('fs'); const { execSync } = require('child_process');
const LIST = (process.env.SCENES || 'cups').split(','), FPS = +(process.env.FPS || 30), SIZE = process.env.SIZE || '1280x720', TOUCH = SIZE.endsWith('t');
const [VW, VH] = SIZE.replace('t', '').split('x').map(Number), OUT = process.env.OUT || '/tmp/hbrw', DET = !!process.env.DET, ZOOM = +(process.env.ZOOM || 1.15);
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: VW, height: VH }, hasTouch: TOUCH, isMobile: TOUCH })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error' || /herb/.test(m.text())) errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(process.env.URL || 'http://localhost:8871/index.html');
  const click = async (...ts) => { await pg.waitForFunction(ts => [...document.querySelectorAll('button,[aria-label]')].some(b => ts.includes((b.getAttribute('aria-label') || b.textContent || '').trim())), ts, { timeout: 300000 });
    await ev(ts => [...document.querySelectorAll('button,[aria-label]')].find(b => ts.includes((b.getAttribute('aria-label') || b.textContent || '').trim())).click(), ts); await pg.waitForTimeout(400); };
  await ev(() => { localStorage.clear(); localStorage.setItem('arcan_settings', JSON.stringify({ graphicsFx: true })); });
  await pg.reload(); await click('게임 시작 (새 게임)', '새 게임'); await click('모험 시작');
  await pg.waitForSelector('.prologue.on', { timeout: 60000 }).then(() => click('건너뛰기')).catch(() => {});
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.player.body && G.player.body.md, null, { timeout: 300000 });
  await pg.waitForFunction(() => G.skillFx && G.skillFx.herbal, null, { timeout: 120000 });
  await ev(async ([z]) => {
    G.frame = () => {}; const c = G.render.cam; c.zoom = z; c.updateProjectionMatrix();
    document.querySelectorAll('.toasts,.qhud,.qh-reopen').forEach(e => e.style.display = 'none');
    if (G.reward) { G.reward.jobChange = sw => sw && sw(); G.reward.levelUp = () => {}; }
    G.dev.level(46); G.dev.job('herbalist');
    const bk = G.sheet.book; bk.sk.points += 200; for (const s of G.data.skillsOf('herbalist')) for (let i = 0; i < 3; i++) if (!bk.learnBlock(s.id)) bk.learn(s.id);
    G.sheet.recalc(); G.dev.full(); G.input.block = false;
    await G.player.attachBody(); G.player.body.place(G.player.pos); G.player.body.play('idle', 1, true);
    { const R = G.render.r, o = R.render.bind(R); R.render = (sc, c) => { if (!window.__noDraw) o(sc, c); }; }
    const p = G.player; let spot = null; const cx = p.pos.x, cz = p.pos.z;
    for (let r = 0; r <= 24 && !spot; r++) for (let k = 0; k < Math.max(1, r * 6) && !spot; k++) { const a = k / Math.max(1, r * 6) * 6.283, c = { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r }; let ok = true;
      for (let x = -9; x <= 9 && ok; x += 0.75) for (let z = -9; z <= 9 && ok; z += 0.75) if (x * x + z * z <= 81 && G.zone.geo.blocked(c.x + x, c.z + z, 0.35)) ok = false; if (ok) spot = c; }
    window.__spot = spot || { x: cx, z: cz };
  }, [ZOOM]);
  await pg.waitForFunction(() => G.skillFx.herbal.ready && G.player.body && G.player.body.md, null, { timeout: 120000 });
  await pg.waitForTimeout(1000);
  const step = (n, draw = false) => ev(([n, fps, draw]) => { window.__noDraw = !draw; for (let i = 0; i < n; i++) { G.step(1 / fps, i === n - 1 && draw); window.__t += 1 / fps; } window.__noDraw = false; }, [n, FPS, draw]);
  const shots = []; let SC = '';
  const shot = async (label) => { await step(1, true); const f = `${OUT}/_f_${SC}_${shots.length}.png`; await pg.screenshot({ path: f }); shots.push([f, label]); };
  const slotShot = async (i, tag) => { const r = await ev(i => { const e = document.querySelector('.abtn.skill' + i); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; }, i);
    if (r) await pg.screenshot({ path: `${OUT}/${SC}_${SIZE}_slot${i}_${tag}.png`, clip: { x: Math.max(0, r.x - 6), y: Math.max(0, r.y - 6), width: Math.min(VW, r.w + 12), height: Math.min(VH, r.h + 12) } }); };
  const press = async (i) => { if (TOUCH) { const r = await ev(i => { const e = document.querySelector('.abtn.skill' + i); const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, i); await pg.touchscreen.tap(r.x, r.y); } else await pg.keyboard.press('Digit' + i); await step(1); };
  const tapActor = async (expr) => { const s = await ev(e => { const a = eval(e); const q = G.render.toScreen({ x: a.pos.x, y: (a.pos.y || 0) + 0.5, z: a.pos.z }); return { x: q.x, y: q.y }; }, expr);
    if (TOUCH) await pg.touchscreen.tap(s.x, s.y); else await pg.mouse.click(s.x, s.y); await step(2); return s; };
  const slotState = (i) => ev(i => { const e = document.querySelector('.abtn.skill' + i); if (!e) return null; const ic = e.querySelector('.ic span'); return { sub: e.querySelector('.sub').textContent, cdt: e.querySelector('.cdt').textContent, recast: e.classList.contains('recast'), icon: ic ? (ic.style.background.match(/skills\/([a-z0-9_]+)\.png/) || [])[1] : null }; }, i);
  for (const S of LIST) {
    SC = S; shots.length = 0; errs.length = 0; const R = { scene: S, size: SIZE };
    await ev(([det]) => {
      let seed = 4242; Math.random = det ? () => 0.5 : () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      const p = G.player; p.skills2.clearTemp(); G.skillFx.clear(); for (const m of [...G.zone.actors]) if (m !== p && m.def && m.body && m.remove) m.remove();
      p.teleport(window.__spot); p.body.place(p.pos); p.setFacing(0, 1); p.target = null; p.lockOn = null; p.path = []; p.allyTarget = null; G.dev.full(); p.skills2.cd = {}; p.skills.lock = 0;
      for (const s of p.status.list.slice()) p.status.remove(s.def.id); p.shield = 0; window.__t = 0;
      window.__at = (d, s = 0) => ({ x: p.pos.x + 0 * d - 1 * s, z: p.pos.z + 1 * d + 0 * s });
      window.__mon = (d, s, o = {}) => { const at = o.abs || window.__at(d, s), m = G.dev.dummies(o.id || 'mon_boar', 1, 0.01, at)[0]; m.teleport(at); m.__spot = at; if (o.boss) m.isBoss = true; m.thinkStep = () => {}; return m; };
      G.render.setFocus({ x: p.pos.x, y: 0, z: p.pos.z + 2 }, true);
      const L = window.__log = { sfx: [], dmg: [] }; if (!G.audio.__w) { G.audio.__w = true; const os = G.audio.sfx.bind(G.audio); G.audio.sfx = (n, o) => { window.__log.sfx.push([n, +window.__t.toFixed(2)]); return os(n, o); }; }
      if (!G.__hs) { G.__hs = true; window.__gstop = 0; const oh = G.hitStop.bind(G); G.hitStop = (...a) => { window.__gstop++; return oh(...a); }; }
      window.__gstop = 0; document.querySelectorAll('.float,.dmg').forEach(e => e.remove());   // 앞 장면의 머리 위 숫자(그리지 않는 프레임에서는 사라지지 않음) 지움
    }, [DET]);
    const slots = (ids) => ev(ids => { G.sheet.book.sk.slots = ids; G.player.skills2.cd = {}; }, ids);
    if (S === 'cups') {
      await slots(['hb_a1', 'hb_c4', 'hb_c3', 'hb_a3']); await ev(() => { G.player.hp = Math.round(G.player.maxHp * 0.4); }); await step(2);
      R.before = await ev(() => ({ hp: G.player.hp, sp: G.player.sp, maxHp: G.player.maxHp })); await step(1, true); R.slot0 = await slotState(1); await slotShot(1, '0_before');
      await press(1); await step(Math.round(0.35 * FPS)); await shot('첫 누름 0.36 s');
      R.afterFirst = await ev(() => ({ hp: G.player.hp, sp: G.player.sp, cup: G.player.skills2.herbal.cupLeft('hb_a1'), cd: G.player.skills2.cdLeft('hb_a1') })); await step(1, true); R.slot1 = await slotState(1); await slotShot(1, '1_cup');
      await step(Math.round(0.6 * FPS)); await shot('남은 한 잔 들고 있음 1.0 s');
      await press(1); await step(Math.round(0.25 * FPS)); await shot('두 번째 누름 — 남은 잔을 마심');
      R.afterSecond = await ev(() => ({ hp: G.player.hp, sp: G.player.sp, cup: G.player.skills2.herbal.cupLeft('hb_a1'), cd: G.player.skills2.cdLeft('hb_a1'), drink: G.player.skills2.herbal.log.drink })); await step(1, true); R.slot2 = await slotState(1); await slotShot(1, '2_back');
      await press(1); await step(2); R.thirdPress = await ev(() => ({ cup: G.player.skills2.herbal.cupLeft('hb_a1'), sp: G.player.sp }));
      // 보관 만료: 다시 처음부터 — 누르고 8.5초 기다림
      await ev(() => { G.player.skills2.cd = {}; G.player.hp = Math.round(G.player.maxHp * 0.4); }); await press(1); await step(Math.round(0.5 * FPS)); await step(1, true); R.expireStart = await slotState(1);
      await step(Math.round(8.2 * FPS)); await step(1, true); R.expireEnd = await slotState(1); R.expireCup = await ev(() => G.player.skills2.herbal.cupLeft('hb_a1')); await slotShot(1, '3_expired');
      R.ok = R.slot1.icon === 'hb_a1_cup' && R.slot1.sub === '남은 한 잔' && R.afterSecond.sp >= R.afterFirst.sp - 0.01 && R.afterSecond.hp > R.afterFirst.hp + 50 && R.expireStart.icon === 'hb_a1_cup' && R.afterSecond.cup === 0 && R.slot2.icon === 'hb_a1' && R.expireEnd.icon === 'hb_a1' && R.expireCup === 0;
    }
    if (S === 'rescue' || S === 'guard') {
      const g = S === 'rescue';
      await slots(['hb_a3', g ? 'hb_b3' : 'hb_b4', 'hb_c4', 'hb_a1']);
      await ev(([g]) => { const p = G.player; if (g) G.player.skills2.cast('hb_b3', null); else G.player.skills2.cast('hb_b4', window.__at(3.2, 0)); }, [g]); await step(Math.round(1.4 * FPS));
      await ev(([g]) => { const p = G.player, s = p.skills2.summons.find(x => x.kind === (g ? 'ginseng' : 'deer')); window.__s = s;
        const at = window.__at(3.2, 0); s.pos = G.zone.geo.ground(at.x, at.z); s.hp = Math.round(s.maxHp * 0.35); s.life = 99; s.cd = 99; s.cd2 = 99; s.update = ((u) => function (dt) { this.cd = 99; this.cd2 = 99; return u.call(this, dt); })(s.update);
        const ring = g ? [[1.2, 0], [-1.1, 0.4], [0.2, 1.1], [0.1, -1.2]] : [[1.5, 0.3], [-1.4, 0.6], [0.4, 1.6], [-0.3, -1.5]];
        window.__ms = ring.map(([dx, dz], i) => window.__mon(0, 0, { abs: { x: s.pos.x + dx, z: s.pos.z + dz } }));
        window.__boss = window.__mon(0, 0, { abs: { x: s.pos.x - 0.6, z: s.pos.z - 1.6 * (g ? -1 : 1) - (g ? 0 : 0.6) }, boss: true });
      }, [g]); await pg.waitForFunction(() => window.__ms.every(m => m.body) && window.__boss.body, null, { timeout: 120000 }); await step(2);
      R.taunted = await ev(() => window.__ms.map(m => m.player === window.__s));
      R.distBefore = await ev(() => [...window.__ms, window.__boss].map(m => +Math.hypot(m.pos.x - window.__s.pos.x, m.pos.z - window.__s.pos.z).toFixed(2)));
      await shot(g ? '포위된 천년삼 동자' : '도발 중인 녹각수호령');
      R.tap = await tapActor('window.__s'); R.picked = await ev(() => G.player.allyTarget === window.__s); await shot('영물을 눌러 고름(금빛 고리)');
      await press(1); await step(Math.round(0.45 * FPS)); await shot('약액 도착 — 잎이 바깥으로'); await step(Math.round(0.4 * FPS)); await shot('보호막');
      R.distAfter = await ev(() => [...window.__ms, window.__boss].map(m => +Math.hypot(m.pos.x - window.__s.pos.x, m.pos.z - window.__s.pos.z).toFixed(2)));
      R.log = await ev(() => { const l = G.player.skills2.herbal.log.a3; return l ? { to: l.to, pushed: l.pushed, kept: l.kept, shield: l.shield, reach: l.reach } : null; }); R.summonShield = await ev(() => Math.round(window.__s.shield || 0));
      R.tauntedAfter = await ev(() => window.__ms.map(m => m.player === window.__s));
      await step(Math.round(0.6 * FPS)); await shot('1.5 s');
      R.ok = R.picked && R.log && R.log.to === (g ? 'ginseng' : 'deer') && R.summonShield > 0 && (g ? R.log.pushed === 4 && R.distAfter.slice(0, 4).every((d, i) => d > R.distBefore[i] + 1) : R.log.pushed === 0 && R.log.kept === 4 && R.distAfter.slice(0, 4).every((d, i) => Math.abs(d - R.distBefore[i]) < 0.05)) && Math.abs(R.distAfter[4] - R.distBefore[4]) < 0.05;
    }
    if (S === 'combo') {
      await slots(['hb_c4', 'hb_c2', 'hb_c3', 'hb_a1']);
      await ev(() => { window.__a = window.__mon(4.2, 0); window.__b = window.__mon(4.3, 1.6); window.__a.hp = window.__a.maxHp; window.__b.hp = window.__b.maxHp; G.player.target = window.__a; G.player.lockOn = window.__a; });
      await pg.waitForFunction(() => window.__a.body && window.__b.body, null, { timeout: 120000 }); await step(2);
      await ev(() => { window.__hpA = window.__a.hp; window.__hpB = window.__b.hp; window.__dl = []; });
      const rec = async (n, label) => { for (let i = 0; i < n; i++) { await step(1, label && i === n - 1); await ev(() => { for (const [k, m] of [['A', window.__a], ['B', window.__b]]) { const h = window['__hp' + k]; if (m.hp < h) { window.__dl.push([k, +window.__t.toFixed(3), Math.round(h - m.hp)]); window['__hp' + k] = m.hp; } } }); } if (label) { const f = `${OUT}/_f_${SC}_${shots.length}.png`; await pg.screenshot({ path: f }); shots.push([f, label]); } };
      await press(1); await rec(5, '0.17 s 맥로'); await rec(2, '0.23 s 첫 마디'); await rec(4, '0.36 s 둘째 마디'); await rec(8, '0.63 s 셋째 마디(크게)'); await rec(10);
      R.c4 = await ev(() => ({ nodes: G.player.skills2.herbal.log.c4.nodes.map(n => ({ i: n.i, ok: n.ok })), defdown: window.__a.status.has('defdown') }));
      await ev(() => { G.player.skills2.cd = {}; G.player.skills.lock = 0; window.__aim = { x: window.__a.pos.x, z: window.__a.pos.z }; });
      if (TOUCH) await press(2); else { await ev(() => { G.player.skills2.cast('hb_c2', window.__aim); }); await step(1); }
      await rec(12, '주작천구 비행'); await rec(10, '주작천구 착탄');
      R.dmg = await ev(() => window.__dl); R.sfx = await ev(() => window.__log.sfx.filter(s => /hb_|fire|throw/.test(s[0])));
      const A = R.dmg.filter(d => d[0] === 'A'), B = R.dmg.filter(d => d[0] === 'B');
      R.c4hits = A.slice(0, 3); R.c2A = A[3] ? A[3][2] : null; R.c2B = B[0] ? B[0][2] : null; R.ratio = R.c2A && R.c2B ? +(R.c2A / R.c2B).toFixed(3) : null;
      R.ok = A.length >= 4 && R.c4.defdown && R.ratio > 1.2 && R.ratio < 1.3;
    }
    if (S === 'gather') { await ev(([v]) => { window.__GC = v; }, [TOUCH ? 3.4 : 4.5]);
      await slots(['hb_b2', 'hb_c3', 'hb_c4', 'hb_a1']);
      await ev(() => { const c = window.__at(+(window.__GC || 4.5), 0); window.__c = c; window.__ms = [[3.3, 0.8], [-3.1, 1.2], [0.4, 3.35], [-0.6, -3.3]].map(([dx, dz]) => window.__mon(0, 0, { abs: { x: c.x + dx, z: c.z + dz } })); window.__boss = window.__mon(0, 0, { abs: { x: c.x + 2.0, z: c.z - 2.4 }, boss: true }); G.render.setFocus({ x: c.x, y: 0, z: c.z }, true); });
      await pg.waitForFunction(() => window.__ms.every(m => m.body), null, { timeout: 120000 }); await step(2);
      const dist = () => ev(() => [...window.__ms, window.__boss].map(m => +Math.hypot(m.pos.x - window.__c.x, m.pos.z - window.__c.z).toFixed(2)));
      await ev(() => { G.player.skills2.cast('hb_b2', window.__c); }); await step(Math.round(1.2 * FPS)); R.before = await dist(); await shot('자운화 핌(몬스터는 꽃 밖)');
      R.poisonBefore = await ev(() => window.__ms.map(m => m.status.has('poison')));
      await ev(() => { G.player.skills2.cd = {}; G.player.skills.lock = 0; G.player.skills2.cast('hb_c3', window.__c); }); await step(Math.round(0.15 * FPS)); await shot('다섯 약인'); await step(Math.round(0.25 * FPS)); await shot('물길이 모임(안쪽)');
      await step(Math.round(0.25 * FPS)); await shot('만나는 순간 마지막 물결'); R.after = await dist();
      await step(Math.round(0.35 * FPS)); await shot('물결이 끝난 뒤'); R.c3 = await ev(() => { const l = G.player.skills2.herbal.log.c3; return { hits: l.hits, pulled: l.pulled.size, bossHit: [...l.dmg.keys()].includes(window.__boss) }; });
      await step(Math.round(1.4 * FPS)); await shot('꽃 안에서 중독'); R.poisonAfter = await ev(() => window.__ms.map(m => m.status.has('poison')));
      R.ok = R.after.slice(0, 4).every(d => d < 2.8) && Math.abs(R.after[4] - R.before[4]) < 0.05 && R.poisonAfter.every(Boolean) && R.c3.hits === 5;
    }
    if (S === 'oldsave') {
      R.res = await ev(async () => {
        const p = G.sheet.p, bk = G.sheet.book; p.level = 36;
        // 예전 저장 흉내: 예전 구증구포·보원탕(제작, hb_a1) Lv3 · 금행·백호유침 hb_c4 Lv5 · 토행·황정지맥 hb_c3 Lv2 · 금강 약갑 hb_a3 Lv1 + 칸 + 가방의 보원탕
        p.sk.learned = { hb_a1: 3, hb_c4: 5, hb_c3: 2, hb_a3: 1, hb_b3: 2 }; p.sk.slots = ['hb_c4', 'hb_c3', 'hb_a3', 'hb_b3']; p.sk.points = 4; G.sheet.bag.add('f_tonic', 3);
        G.autoSave(); const raw = localStorage.getItem('arcan_save_0'); const ok0 = !!raw;
        G.loadSlot(0); await new Promise(r => setTimeout(r, 4000));
        return { saved: ok0 };
      });
      await pg.waitForFunction(() => G.inWorld && G.player && G.player.body && !G.loading, null, { timeout: 300000 }); await pg.waitForTimeout(1500);
      await ev(() => { G.frame = () => {}; document.querySelectorAll('.toasts,.qhud,.qh-reopen').forEach(e => e.style.display = 'none'); }); await step(2, true);
      R.after = await ev(() => { const sk = G.sheet.book.sk; return { level: G.sheet.p.level, job: G.sheet.p.job, learned: { hb_a1: sk.learned.hb_a1, hb_c4: sk.learned.hb_c4, hb_c3: sk.learned.hb_c3, hb_a3: sk.learned.hb_a3 }, slots: sk.slots.slice(), points: sk.points, tonic: G.sheet.bag.count('f_tonic'), names: sk.slots.map(id => G.data.skill2(id) && G.data.skill2(id).name) }; });
      for (let i = 1; i <= 4; i++) await slotShot(i, 'loaded');
      await ev(() => { G.ui.showCraft(); }); await pg.waitForTimeout(500);
      R.craft = await ev(() => { const w = document.querySelector('.window'); const t = w ? w.textContent : ''; return { hasGroup: t.includes('한약사 탕제'), hasTonic: t.includes('보원탕'), text: t.slice(0, 200) }; });
      const f = `${OUT}/_f_${SC}_0.png`; await pg.screenshot({ path: f }); shots.push([f, '제작 메뉴: 한약사 탕제 · 보원탕']);
      R.made = await ev(async () => { G.sheet.bag.add('m_herb', 8); G.sheet.bag.add('m_meat', 2); G.sheet.bag.add('m_boar_tusk', 2); const { craft } = await import('./js/skillsys.js'); const rc = G.data.recipes.find(r => r.id === 'r_tonic'); const b0 = G.sheet.bag.count('f_tonic'); const r = craft(G.data, G.sheet, G.sheet.book, rc, 2); return { err: r.err || null, made: r.made, tonic: G.sheet.bag.count('f_tonic'), before: b0 }; });
      await ev(() => G.ui.close && G.ui.close());
      R.ok = R.after.learned.hb_a1 === 3 && R.after.learned.hb_c4 === 5 && R.after.learned.hb_c3 === 2 && R.after.slots.join() === 'hb_c4,hb_c3,hb_a3,hb_b3' && R.after.tonic === 3 && R.craft.hasGroup && R.craft.hasTonic && R.made.made === 2;
    }
    R.gstop = await ev(() => window.__gstop || 0); R.errors = errs.slice(0, 8);
    if (shots.length) { fs.writeFileSync(`${OUT}/_strip.py`, `from PIL import Image, ImageDraw, ImageFont\nfr=${JSON.stringify(shots)}\nims=[Image.open(f).convert('RGB') for f,_ in fr]\nw,h=ims[0].size; s=min(1.0, 900/w); ims=[i.resize((int(w*s),int(h*s))) for i in ims]; w,h=ims[0].size\nn=len(ims); cols=min(n, 3 if w>500 else 4); rows=(n+cols-1)//cols\nsh=Image.new('RGB',(w*cols,(h+26)*rows),(20,20,28)); d=ImageDraw.Draw(sh)\ntry: F=ImageFont.truetype('/home/claude/hbrw-wt/assets/fonts/Jua.woff2',18)\nexcept Exception: F=None\nfor i,(im,(f,l)) in enumerate(zip(ims,fr)):\n  x=(i%cols)*w; y=(i//cols)*(h+26); sh.paste(im,(x,y+26)); d.text((x+6,y+4),l,fill=(255,240,200),font=F)\nsh.save('${OUT}/${S}_${SIZE}.png')`);
      try { execSync(`python3 ${OUT}/_strip.py`); for (const [f] of shots) fs.rmSync(f, { force: true }); } catch (e) { console.log('strip', e.message); } }
    fs.writeFileSync(`${OUT}/${S}_${SIZE}.json`, JSON.stringify(R, null, 1)); console.log(S, SIZE, R.ok ? 'OK' : 'CHECK', JSON.stringify(R).slice(0, 900));
  }
  await b.close();
})();
