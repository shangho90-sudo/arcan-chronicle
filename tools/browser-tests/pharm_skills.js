// 약사 1차 개편 스킬(2026-11-11)을 실제 스킬 경로(skills2.cast)로 시전하고 수치·화면을 확인.
//   a3 유봉 휘두르기  둘레 허수아비 4마리: 타격 수(5)·마지막 타 밀림 거리
//   a6 천근쇄약      가운데 1 + 3 m 1: 피해 비율(가운데/가장자리 ≈ 1.5), 450 % 기준 계산과 비교
//   b6 약병폭격      약병 10개 원소(화염·냉기·독) 기록, 허수아비에 걸린 상태이상
//   c6 아드레날린    이동 속도·공격 속도 배율
//   c7 약 보호막     보호막 = 최대 체력 25 %, 독을 걸어도 안 걸림
//   c8 광역 회복진   체력 40 %에서 8초 동안 회복량
// Usage: SCENES=a3,a6,b6,c6,c7,c8 SIZE=1100x760|390x844t FX=1 URL=http://localhost:8781/index.html node tools/browser-tests/pharm_skills.js
//   -> OUT/pharm_<scene>_<size>.png (시간 순서 가로 띠) + 콘솔 요약
const { chromium } = require('playwright'); const fs = require('fs'); const { execSync } = require('child_process');
const SCENES = (process.env.SCENES || 'a3,a6,b6,c6,c7,c8').split(','), SIZE = process.env.SIZE || '1100x760', TOUCH = SIZE.endsWith('t');
const [VW, VH] = SIZE.replace('t', '').split('x').map(Number), FX = process.env.FX !== '0', OUT = process.env.OUT || '/tmp/pharm', FPS = 30;
const MARKS = { a3: [0.1, 0.2, 0.33, 0.46, 0.6, 0.72, 0.85, 1.1], a6: [0.1, 0.25, 0.4, 0.52, 0.6, 0.66, 0.8, 1.1], b6: [0.2, 0.5, 0.8, 1.1, 1.4, 1.7, 2.0, 2.6],
  c6: [0.15, 0.35, 0.5, 0.7, 1.0, 2.0], c7: [0.2, 0.5, 1.0, 3.0, 6.0, 8.2], c8: [0.3, 1.0, 2.0, 4.0, 6.0, 8.0, 8.6] };
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: VW, height: VH }, hasTouch: TOUCH, isMobile: TOUCH })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error' || /pharm/.test(m.text())) errs.push(m.text()); });
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(process.env.URL || 'http://localhost:8781/index.html');
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(fx => { localStorage.clear(); localStorage.setItem('arcan_settings', JSON.stringify({ graphicsFx: fx })); }, FX);
  await pg.reload(); await click('새 게임'); await click('모험 시작');
  await pg.waitForSelector('.prologue.on', { timeout: 60000 }).then(() => click('건너뛰기')).catch(() => {});
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.player.body && G.player.body.md, null, { timeout: 300000 });
  await pg.waitForFunction(() => G.skillFx && G.skillFx.pharm && G.skillFx.pharm.ready, null, { timeout: 120000 });
  await ev(() => {
    G.frame = () => {}; const c = G.render.cam; c.zoom = 1.05; c.updateProjectionMatrix();
    document.querySelectorAll('.controls,.toasts,.qhud,.qh-reopen').forEach(e => e.style.display = 'none');
    G.dev.level(20); G.dev.job('pharmacist'); G.sheet.bag.add('w_pestle_1', 1); G.sheet.p.weapon = 'w_pestle_1'; G.dev.learnAll('pharmacist'); G.sheet.recalc(); G.dev.full(); G.input.block = true;
    const p = G.player; let spot = null; const cx = p.pos.x, cz = p.pos.z;
    for (let r = 0; r <= 16 && !spot; r++) for (let k = 0; k < Math.max(1, r * 6) && !spot; k++) { const a = k / Math.max(1, r * 6) * 6.283, c = { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r }; let ok = true;
      for (let x = -6; x <= 6 && ok; x += 0.75) for (let z = -6; z <= 6 && ok; z += 0.75) if (x * x + z * z <= 36 && G.zone.geo.blocked(c.x + x, c.z + z, 0.35)) ok = false; if (ok) spot = c; }
    window.__spot = spot || { x: cx, z: cz };
  });
  const out = {};
  for (const sc of SCENES) {
    await ev(sc => {
      const p = G.player, f = { x: 0, z: 1 };
      for (const m of [...G.zone.actors]) if (m !== p && m.def && m.body) m.remove && m.remove();
      G.skillFx.clear(); p.skills2.clearTemp(); p.status.clear(); p.shield = 0; p.teleport(window.__spot); p.body.place(p.pos); p.setFacing(f.x, f.z); p.target = null; p.path = []; G.dev.full();
      const at = (d, s = 0) => ({ x: p.pos.x + f.x * d + s, z: p.pos.z + f.z * d });
      let ds = [];
      if (sc === 'a3') ds = G.dev.dummies('mon_boar', 4, 1.7, p.pos);
      if (sc === 'a6') { ds = [...G.dev.dummies('mon_boar', 1, 0.01, at(4.5)), ...G.dev.dummies('mon_boar', 1, 0.01, at(4.5, 3.0))]; }
      if (sc === 'b6') ds = [...G.dev.dummies('mon_boar', 1, 0.01, at(5)), ...G.dev.dummies('mon_boar', 3, 2.0, at(5))];
      window.__ds = ds; window.__f = f; window.__at = at;
    }, sc);
    await pg.waitForFunction(() => window.__ds.every(m => m.body), null, { timeout: 120000 });
    const info = await ev(([sc, fps]) => {
      let seed = 4242; Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      const p = G.player, ds = window.__ds;
      for (const m of ds) { m.thinkStep = () => {}; m.think = () => {}; m.update0 = m.update; }
      for (let i = 0; i < 6; i++) G.step(1 / fps, false);
      p.teleport(window.__spot); p.setFacing(0, 1); p.sheet.final.crit = 0;
      window.__log = []; window.__t = 0;
      for (const [i, m] of ds.entries()) { m.__p0 = { ...m.pos }; const td = m.takeDamage.bind(m); m.takeDamage = d => { const h = m.hp; td({ ...d, noMiss: true }); window.__log.push({ i, t: +window.__t.toFixed(3), a: Math.round(h - m.hp) }); }; }
      const F = G.skillFx.pharm; window.__flasks = []; if (!F.__w) { F.__w = 1; const fl = F.flask.bind(F); F.flask = (pos, o) => { window.__flasks.push(o.elem); return fl(pos, o); }; }
      const r = {}; r.ms0 = p.stat('moveSpeed'); r.as0 = p.stat('atkSpeed');
      const id = { a3: 'ph1_a3', a6: 'ph1_a6', b6: 'ph1_b6', c6: 'ph1_c6', c7: 'ph1_c7', c8: 'ph1_c8' }[sc];
      if (sc === 'c8') { p.hp = Math.round(p.maxHp * 0.4); r.hp0 = p.hp; }
      const aim = sc === 'a6' ? window.__at(4.5) : sc === 'b6' ? window.__at(5) : null;
      G.render.setFocus({ x: p.pos.x, y: 0, z: p.pos.z + (aim ? 2.4 : 0) }, true);
      const e = p.skills2.cast(id, aim); r.err = e || null; return r;
    }, [sc, FPS]);
    // step + capture
    const frames = []; let t = 0;
    for (const mk of MARKS[sc]) {
      const n = Math.round((mk - t) * FPS); await ev(([n, fps]) => { for (let i = 0; i < n; i++) { G.step(1 / fps, false); window.__t += 1 / fps; } G.step(0, true); }, [n, FPS]); t += n / FPS;
      const f = `${OUT}/_${sc}_${frames.length}.png`; await pg.screenshot({ path: f, timeout: 300000 }); frames.push([f, mk]);
      if (sc === 'c7' && frames.length === 2) await ev(() => { const p = G.player; window.__poison = p.status.has('poison'); p.status.apply(G.data.status('poison'), 5, 9, null); window.__poisonAfter = p.status.has('poison'); window.__shieldNow = p.shield; });
    }
    const res = await ev(r => {
      const p = G.player, ds = window.__ds, L = window.__log;
      r.hits = ds.map((m, i) => L.filter(x => x.i === i).length); r.dmg = ds.map((m, i) => L.filter(x => x.i === i).reduce((a, x) => a + x.a, 0));
      r.moved = ds.map(m => +Math.hypot(m.pos.x - m.__p0.x, m.pos.z - m.__p0.z).toFixed(2));
      r.status = ds.map(m => m.status.list.map(s => s.def.id).join('+'));
      r.flasks = window.__flasks.slice(); r.ms = +(p.stat('moveSpeed') / r.ms0).toFixed(3); r.as = +(p.stat('atkSpeed') / r.as0).toFixed(3);
      r.buffs = p.status.list.map(s => s.def.id + ':' + s.remaining.toFixed(1)).join(' ');
      r.shield = Math.round(window.__shieldNow ?? p.shield); r.maxHp = p.maxHp; r.poisonBlocked = window.__poisonAfter === false;
      r.hp = p.hp; r.hpGain = r.hp0 != null ? p.hp - r.hp0 : undefined; r.fxLive = G.skillFx.pharm.live.length; r.power = p.stat('atk');
      return r;
    }, info);
    out[sc] = res; console.log(sc, JSON.stringify(res));
    // strip
    const py = `from PIL import Image, ImageDraw\nfs=${JSON.stringify(frames)}\nims=[Image.open(f).convert('RGB') for f,_ in fs]\nw,h=ims[0].size; cw=min(w,560); ch=min(h,440)\nS=Image.new('RGB',(cw*len(ims),ch),'black')\nfor i,(im,(f,mk)) in enumerate(zip(ims,fs)):\n  x0=(w-cw)//2; y0=(h-ch)//2; c=im.crop((x0,y0,x0+cw,y0+ch)); ImageDraw.Draw(c).text((6,6),'${sc} +%.2fs'%mk,fill=(255,255,255)); S.paste(c,(i*cw,0))\nS.save('${OUT}/pharm_${sc}_${SIZE}.png')\n`;
    fs.writeFileSync(`${OUT}/_strip.py`, py); execSync(`python3 ${OUT}/_strip.py`);
  }
  console.log('errors', JSON.stringify(errs.slice(0, 8)));
  await b.close();
})();
