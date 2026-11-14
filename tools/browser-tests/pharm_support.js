// 약사 보조 스킬(아드레날린 주사 ph1_c6 · 약 보호막 ph1_c7 · 광역 회복진 ph1_c8)을 실제 스킬 경로로 시전하고 화면 띠 + 수치를 남김 (2026-11-14).
// Usage: SKILL=ph1_c7 GENDER=m SIZE=1100x760|390x844t FX=1 TAG=after URL=http://localhost:8827/index.html OUT=/tmp/flask ZOOM=2.2
//        MARKS=0,0.2,... (s from the press)  SEC=9  NOSHOT=1   NODE_PATH=$(npm root -g) node tools/browser-tests/pharm_support.js
//   ph1_c7 확인: 보호막 그림(pharm.live의 'shield')이 2초쯤에 사라지는지, 보호막 양·면역 상태는 원래 시간(8초)까지 남는지,
//   2초 뒤(3 s)에 맞은 피해를 보호막이 실제로 막는지(체력 그대로·보호막 감소). ph1_c8: 실제 회복 순간과 pulse(물결·방울) 시각.
const { chromium } = require('playwright'); const fs = require('fs'); const { execSync } = require('child_process');
const SKILL = process.env.SKILL || 'ph1_c7', G_ = process.env.GENDER || 'm', SIZE = process.env.SIZE || '1100x760', TOUCH = SIZE.endsWith('t'), [VW, VH] = SIZE.replace('t', '').split('x').map(Number);
const FX = process.env.FX !== '0', TAG = process.env.TAG || 'after', OUT = process.env.OUT || '/tmp/flask', ZOOM = +(process.env.ZOOM || 2.2), FPS = 60;
const SEC = +(process.env.SEC || (SKILL === 'ph1_c7' ? 9 : SKILL === 'ph1_c8' ? 3.2 : 2.5));
const MARKS = (process.env.MARKS || (SKILL === 'ph1_c7' ? '0.05,0.12,0.2,0.3,0.5,1.0,1.5,1.9,2.1,3.0' : SKILL === 'ph1_c8' ? '0.1,0.3,0.6,0.95,1.05,1.15,1.3,1.6,2.05,2.3' : '0.1,0.3,0.45,0.55,0.6,0.7,0.85,1.1,1.6,2.0')).split(',').map(Number);
const CW = +(process.env.CW || Math.min(VW, 420)), CH = +(process.env.CH || Math.min(VH, 420));
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: VW, height: VH }, hasTouch: TOUCH, isMobile: TOUCH })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error' || /pharm|flask|skill op/.test(m.text())) errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(process.env.URL || 'http://localhost:8827/index.html');
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(fx => { localStorage.clear(); localStorage.setItem('arcan_settings', JSON.stringify({ graphicsFx: fx })); }, FX);
  await pg.reload(); await click('새 게임'); await click('모험 시작');
  await pg.waitForSelector('.prologue.on', { timeout: 60000 }).then(() => click('건너뛰기')).catch(() => {});
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.player.body && G.player.body.md, null, { timeout: 300000 });
  await ev(async ([z, g]) => {
    G.frame = () => {}; const c = G.render.cam; c.zoom = z; c.updateProjectionMatrix();
    document.querySelectorAll('.controls,.toasts,.qhud,.qh-reopen,.plates').forEach(e => e.style.display = 'none');
    if (G.reward) { G.reward.jobChange = sw => sw && sw(); G.reward.levelUp = () => {}; }
    G.dev.level(20); G.sheet.p.gender = g; G.dev.job('pharmacist'); G.dev.learnAll('pharmacist'); G.sheet.recalc(); G.dev.full(); G.input.block = true;
    await G.player.attachBody(); G.player.body.place(G.player.pos); G.player.body.play('idle', 1, true); G.skillFx.pharm.load();
  }, [ZOOM, G_]);
  await pg.waitForFunction(() => G.skillFx.pharm.ready && G.skillFx.pharm.kit.ready, null, { timeout: 120000 });
  await pg.waitForTimeout(1000);
  const name = `${TAG}_${SKILL}_${G_}_${SIZE}_fx${FX ? 1 : 0}`, dirOut = `${OUT}/${name}`; fs.rmSync(dirOut, { recursive: true, force: true }); fs.mkdirSync(dirOut, { recursive: true });
  await ev(([skill]) => { let seed = 777; Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const p = G.player; for (const m of [...G.zone.actors]) if (m !== p && m.def && m.body) m.remove && m.remove(); G.skillFx.clear(); p.setFacing(0.6, 0.8);
    for (let i = 0; i < 10; i++) G.step(1 / 60, false); G.render.setFocus({ x: p.pos.x, y: 0, z: p.pos.z }, true);
    if (skill === 'ph1_c8') p.hp = Math.round(p.maxHp * 0.4);
    window.__L = { pulses: [], heals: [], shieldFx: [], st: [], hp0: p.hp, live: [] };
    const P = G.skillFx.pharm, oc = P.circle.bind(P); P.circle = (pos, o) => { const e = oc(pos, o); if (e) { const op = e.pulse; e.pulse = (t) => { window.__L.pulses.push(+window.__t.toFixed(3)); return op(t); }; } return e; };
    const oh = p.heal.bind(p); p.heal = (a) => { window.__L.heals.push({ t: +window.__t.toFixed(3), a: Math.round(a) }); return oh(a); };
    window.__t = 0; G.sheet.book.sk.slots[0] = skill; const e = p.skills2.cast(skill, { x: p.pos.x, z: p.pos.z }); window.__err = e; }, [SKILL]);
  const total = Math.round(SEC * FPS); const shots = [];
  for (let i = 0; i < total; i++) {
    const want = MARKS.some(m => i === Math.round(m * FPS)) && !process.env.NOSHOT;
    const c = await ev(([i, draw, skill]) => { window.__t = i / 60; const p = G.player, L = window.__L, P = G.skillFx.pharm;
      if (skill === 'ph1_c7' && i === 180) {   // 3.0 s (after the 2 s visual): a real hit lands — the shield must still absorb it
        const hp = p.hp, sh = p.shield; p.takeDamage({ source: null, amount: 40, crit: false, kdir: { x: 0, z: 1 } }); L.hit3 = { hpBefore: hp, hpAfter: p.hp, shieldBefore: Math.round(sh), shieldAfter: Math.round(p.shield) }; }
      if (draw) G.step(1 / 60, true); else { G.step(1 / 60, false); G.skillFx.update(1 / 60); }
      if (i % 6 === 0) { L.shieldFx.push(P.live.some(e => e.kind === 'shield') ? 1 : 0); L.st.push([+window.__t.toFixed(2), Math.round(p.shield || 0), p.status.list.some(s => s.def.id === 'immune') ? 1 : 0, p.status.list.some(s => s.def.id === 'haste') ? 1 : 0]); }
      const s = G.render.toScreen({ x: p.pos.x, y: (p.pos.y || 0) + 1.0, z: p.pos.z }); return [s.x, s.y]; }, [i, want, SKILL]);
    if (want) { const fn = `${dirOut}/${String(i).padStart(3, '0')}.png`; await pg.screenshot({ path: fn, clip: { x: Math.max(0, Math.min(VW - CW, Math.round(c[0] - CW / 2))), y: Math.max(0, Math.min(VH - CH, Math.round(c[1] - CH / 2))), width: CW, height: CH } }); shots.push(fn); }
  }
  const res = await ev(() => { const L = window.__L, st = L.st; const lastFx = L.shieldFx.lastIndexOf(1);
    return { err: window.__err, pulses: L.pulses, heals: L.heals, hit3: L.hit3, shieldFxGoneAt: lastFx >= 0 ? +((lastFx + 1) * 0.1).toFixed(2) : null,
      shieldEndsAt: (st.find(x => x[1] <= 0 && x[0] > 0.5) || [null])[0], immuneEndsAt: (st.find(x => !x[2] && x[0] > 0.5) || [null])[0], hasteEndsAt: (st.find(x => !x[3] && x[0] > 0.5) || [null])[0],
      st: st.filter((x, i) => i % 5 === 0), live: G.skillFx.pharm.live.length, kit: G.skillFx.pharm.kit.stats() }; });
  if (shots.length) { fs.writeFileSync('/tmp/_pss.py', `from PIL import Image, ImageDraw\nfr=${JSON.stringify(shots)}\nlab=${JSON.stringify(MARKS)}\nims=[Image.open(f) for f in fr]\nw,h=ims[0].size\ncols=min(5,len(ims)); rows=(len(ims)+cols-1)//cols\nsh=Image.new('RGB',(w*cols,(h+22)*rows),(20,20,28)); d=ImageDraw.Draw(sh)\nfor i,(im,l) in enumerate(zip(ims,lab)):\n  x=(i%cols)*w; y=(i//cols)*(h+22); sh.paste(im,(x,y+22)); d.text((x+6,y+4),'%.2fs'%l,fill=(255,255,255))\nsh.save('${OUT}/${name}.png')`); execSync('python3 /tmp/_pss.py'); }
  res.errors = errs.slice(0, 8); console.log(name, JSON.stringify(res)); fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify(res, null, 1));
  await b.close();
})();
