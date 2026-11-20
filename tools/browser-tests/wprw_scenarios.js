// 양약사 2차 6종 교체(2026-11-20) 실제 전투 시나리오 다섯 개를 실제 스킬 경로(skills2.cast -> 동작 -> js/wpharm.js -> js/wpharmfx.js)로 확인.
// Usage: SCENES=boss,frostfoam,chain,solo,rescue,oldsave SIZE=1280x720|390x844t QUALITY=high|medium|low DET=1 FPS=30 URL=http://localhost:8841/index.html OUT=/tmp/wprw
//        node tools/browser-tests/wprw_scenarios.js
//   boss      ① 보스(돌 골렘, isBoss)가 '도약' 경고(1.5 s 뒤 착지, 원 2.4 m)를 띄운 순간 이중정 -> 0.65 s에 긴급 방출: 내핵 피해가 착지 전인지(자연이면 약 2.4 s)
//   frostfoam ② 서리병 굴리기로 길 위 멧돼지 셋을 늦춘 뒤 그 길(4.5 m 앞)에 발포정 -> 둔화된 적 기포 피해 +25%, 길 밖(둔화 없음) 멧돼지와 비교, 마지막 큰 기포 표식
//   chain     ③ 이온 관통술 x2 + 이중정으로 네 적에 표식을 쌓은 뒤 연쇄 용출: 표식 수·이어진 수·피해
//   solo      ④a 소환물 없이 체력 35%: 구급함(나에게 패치 3장) -> 서방 패치(기본 나, 걸으며 3번) -> 붕대 릴(나를 감음)
//   rescue    ④b 생명 소환물(시험용 Summon living)이 보스 바닥 공격(1.6 s 원 1.8 m) 위에 있을 때 붕대 릴 -> 착지 전 밖으로 끌려옴 + 도착 회복, 이어 서방 패치·구급함이 소환물에게
//   oldsave   ⑤ 예전 저장(촉매·극저온·표적 전달·분무가 칸 1~4, 고순도/서방형 조제 Lv 2/1, 포인트 5)을 저장 -> 다시 불러옴 -> 레벨·포인트·칸·제작법(제작 창·실제 제작)·1번 칸 시전
//   -> OUT/<scene>_<size>_<quality>.png(띠) + .json, 콘솔 오류
const { chromium } = require('playwright'); const fs = require('fs'); const { execSync } = require('child_process');
const SIZE = process.env.SIZE || '1280x720', TOUCH = SIZE.endsWith('t'), [VW, VH] = SIZE.replace('t', '').split('x').map(Number);
const FPS = +(process.env.FPS || 30), OUT = process.env.OUT || '/tmp/wprw', URL = process.env.URL || 'http://localhost:8841/index.html', Q = process.env.QUALITY || '';
const SCENES = (process.env.SCENES || 'boss,frostfoam,chain,solo,rescue,oldsave').split(',');
const SHOT = { boss: [0.1, 0.35, 0.5, 0.7, 0.75, 0.9, 1.5, 1.6], frostfoam: [0.2, 0.6, 1.1, 1.45, 1.7, 2.1, 2.9, 3.6, 4.1, 4.3], chain: [0.3, 0.75, 1.2, 1.6, 1.75, 1.9, 2.1, 2.4],
  solo: [0.25, 0.5, 0.9, 1.5, 2.2, 2.9, 3.6, 4.3, 5.0, 5.6], rescue: [0.3, 0.5, 0.62, 0.75, 0.95, 1.6, 1.8, 2.3, 3.0, 3.6] };
const SEC = { boss: 2.0, frostfoam: 4.6, chain: 2.8, solo: 6.2, rescue: 4.6 };
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: VW, height: VH }, hasTouch: TOUCH, isMobile: TOUCH })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error' || /wpharmfx|fx wp|skill op/.test(m.text())) errs.push(m.text().slice(0, 300)); });
  pg.setDefaultTimeout(600000);
  const ev = (f, a) => pg.evaluate(f, a);
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); };
  await pg.goto(URL);
  await ev(q => { localStorage.clear(); localStorage.setItem('arcan_settings', JSON.stringify(Object.assign({ graphicsFx: true }, q ? { gfxQuality: q } : {}))); }, Q);
  await pg.reload(); await click('게임 시작 (새 게임)'); await click('모험 시작');
  await pg.waitForSelector('.prologue.on', { timeout: 60000 }).then(() => click('건너뛰기')).catch(() => {});
  await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.player.body && G.player.body.md, null, { timeout: 300000 });
  await pg.waitForFunction(() => G.skillFx && G.skillFx.wp, null, { timeout: 120000 });
  const setup = () => ev(async ([touch]) => {
    G.frame = () => {}; const c = G.render.cam; c.zoom = touch ? 1.0 : 1.35; c.updateProjectionMatrix();
    document.querySelectorAll('.toasts,.qhud,.qh-reopen' + (touch ? '' : ',.hud,.controls')).forEach(e => e.style.display = 'none');
    if (G.reward) { G.reward.jobChange = sw => sw && sw(); G.reward.levelUp = () => {}; }
    G.dev.level(45); if (G.sheet.p.job !== 'western_pharmacist') { G.dev.job('pharmacist'); G.dev.job('western_pharmacist'); }
    const bk = G.sheet.book; bk.sk.points += 999; for (const id of ['ph1_b2']) while (bk.level(id) < 1) bk.learn(id);
    for (const d of G.data.skillsOf('western_pharmacist')) for (let i = 0; i < 5; i++) if (!bk.learnBlock(d.id)) bk.learn(d.id);
    G.sheet.bag.add('w_pestle_g1', 1); G.sheet.p.weapon = 'w_pestle_g1'; G.sheet.recalc(); G.dev.full(); G.input.block = true;
    await G.player.attachBody(); G.player.body.place(G.player.pos);
    { const R = G.render.r; if (!R.__wrapped) { const o = R.render.bind(R); R.render = (sc, c) => { if (!window.__noDraw) o(sc, c); }; R.__wrapped = true; } }
    const p = G.player; let spot = null; const cx = p.pos.x, cz = p.pos.z;
    for (let r = 0; r <= 24 && !spot; r++) for (let k = 0; k < Math.max(1, r * 6) && !spot; k++) { const a = k / Math.max(1, r * 6) * 6.283, c = { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r }; let ok = true;
      for (let x = -9; x <= 9 && ok; x += 0.75) for (let z = -9; z <= 9 && ok; z += 0.75) if (x * x + z * z <= 81 && G.zone.geo.blocked(c.x + x, c.z + z, 0.35)) ok = false; if (ok) spot = c; }
    window.__spot = spot || { x: cx, z: cz };
    const os = G.audio.sfx.bind(G.audio); if (!G.audio.__w) { G.audio.sfx = (n, o) => { if (window.__L) window.__L.sfx.push({ n, t: +window.__t.toFixed(3) }); return os(n, o); }; G.audio.__w = true; }
    const W = G.skillFx.wp; if (!W.__w) { W.__w = true; for (const k of ['tablet', 'foam', 'release', 'kit', 'patch', 'reel', 'wrap', 'chain']) { const o = W[k].bind(W); W[k] = (a, opt) => { const h = o(a, opt); if (window.__L) window.__L.fx.push({ k, t: +window.__t.toFixed(3), ok: !!h }); return h; }; } }
  }, [TOUCH]);
  await setup();
  await pg.waitForFunction(() => G.skillFx.wp.ready, null, { timeout: 120000 }); await pg.waitForTimeout(800);
  const summary = {};
  for (const scene of SCENES) {
    errs.length = 0;
    if (scene === 'oldsave') { summary.oldsave = await oldsave(); continue; }
    const tag = `${scene}_${SIZE}_${Q || 'default'}`, dir = `${OUT}/${tag}`; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    await ev(async ([scene, det]) => {
      if (det) Math.random = () => 0.5;
      const p = G.player, f = { x: 1, z: 0 }, k = p.skills2;
      for (const m of [...G.zone.actors]) if (m !== p && (m.def || m.isSummon)) { if (m.isSummon) m.vanish && m.vanish(true); else m.remove && m.remove(); }
      G.skillFx.clear(); k.clearTemp(); p.teleport(window.__spot); p.body.place(p.pos); p.setFacing(f.x, f.z); p.target = null; p.lockOn = null; p.allyTarget = null; p.path = []; G.dev.full();
      for (const s of p.status.list.slice()) p.status.remove(s.def.id); p.shield = 0; k.cd = {}; p.skills.lock = 0;
      const side = (d, s) => ({ x: p.pos.x + f.x * d - f.z * s, z: p.pos.z + f.z * d + f.x * s }); window.__side = side; window.__f = f;
      const FOES = { boss: [[4.5, 0, 'boss']], frostfoam: [[3.6, 0], [4.5, 0.25], [5.3, -0.2], [4.6, 1.75]], chain: [[3, 0], [4.6, 0.2], [6.2, -0.2], [5.2, 2.2]], solo: [[6, 2.5]], rescue: [[7.5, -2.5, 'boss']] }[scene];
      window.__ds = FOES.map(([d, s, fl]) => { const at = side(d, s), m = G.dev.dummies(fl === 'boss' ? 'mon_golem' : 'mon_boar', 1, 0.01, at)[0]; m.teleport(at); m.__spot = at; m.__fl = fl; return m; });
    }, [scene, !!process.env.DET]);
    await pg.waitForFunction(() => window.__ds.every(m => m.body), null, { timeout: 120000 });
    await ev(([scene, fps]) => {
      const p = G.player, f = window.__f;
      window.__ds.forEach(q => { q.thinkStep = () => {}; q.teleport(q.__spot); q.setFacing(-f.x, -f.z); q.body.place(q.pos); if (q.__fl === 'boss') q.isBoss = true; q.hp = q.maxHp = Math.max(q.maxHp, 20000); });
      if (p.body.setArmed) p.body.setArmed(true);
      for (let i = 0; i < 8; i++) G.step(1 / fps, false);
      p.teleport(window.__spot); p.setFacing(f.x, f.z); window.__ds.forEach(q => { q.knock = { x: 0, z: 0 }; q.teleport(q.__spot); q.__hp = q.hp; });
      G.render.setFocus({ x: p.pos.x + f.x * 2.8, y: 0, z: p.pos.z + f.z * 2.8 }, true);
      window.__L = { fx: [], sfx: [], dmg: [], casts: [], notes: [] }; window.__t = 0;
    }, [scene, FPS]);
    const frames = [], total = Math.round(SEC[scene] * FPS);
    for (let i = 0; i < total; i++) {
      const shot = SHOT[scene].some(m => i === Math.round(m * FPS));
      const sc = await ev(async ([scene, i, fps, shot]) => {
        window.__t = i / fps; window.__noDraw = !shot; const p = G.player, k = p.skills2, L = window.__L, t = window.__t, ds = window.__ds, at = (n) => i === Math.round(n * fps);
        const { HitShape } = await import('/js/core.js');
        const cast = (id, aim) => { G.sheet.book.sk.slots = [id, '', '', '']; p.skills.lock = 0; const e = k.cast(id, aim); L.casts.push({ id, t: +t.toFixed(3), err: e || null, sp: Math.round(p.sp) }); return e; };
        if (scene === 'boss') {
          if (at(0)) { const b = ds[0]; window.__tele = G.telegraph(G.zone, HitShape.circle(p.pos.x, p.pos.z, 2.4), 1.5, [1, 0.3, 0.25], () => { L.notes.push({ leapLanded: +window.__t.toFixed(3) }); }); p.target = b; cast('wp_b1'); }
          if (at(0.65)) { p.target = ds[0]; cast('wp_b2', { ...ds[0].pos }); }
        }
        if (scene === 'frostfoam') {
          if (at(0)) cast('ph1_b2', window.__side(7, 0));
          if (at(1.1)) { L.notes.push({ slowedAtFoam: ds.map(q => +(q.status.slow).toFixed(2)) }); cast('wp_a2', window.__side(4.5, 0)); }
        }
        if (scene === 'chain') {
          if (at(0)) cast('wp_a3', window.__side(5, 0)); if (at(0.45)) { k.cd = {}; cast('wp_a3', window.__side(5, 0)); }
          if (at(0.9)) { p.target = ds[3]; cast('wp_b1'); }
          if (at(1.5)) { L.notes.push({ marksBefore: ds.map(q => q._marks ? q._marks.reaction : 0) }); p.target = ds[0]; cast('wp_b3'); }
          if (at(2.7)) L.notes.push({ marksAfter: ds.map(q => q._marks ? q._marks.reaction : 0), chain: k.wp.log.chains.at(-1) });
        }
        if (scene === 'solo') {
          if (at(0)) { p.hp = Math.round(p.maxHp * 0.35); L.notes.push({ hp0: p.hp, maxHp: p.maxHp, summons: k.summons.length }); cast('wp_c1'); }
          if (at(1.6)) cast('wp_c2'); if (at(3.4)) { p.hp = Math.round(p.maxHp * 0.5); L.notes.push({ hpBeforeWrap: p.hp }); cast('wp_c3'); }
          if (i > Math.round(1.6 * fps) && i < Math.round(3.3 * fps)) p.teleport({ x: p.pos.x + 3.2 / fps, z: p.pos.z });   // 걸으며(서방 패치가 따라감)
          if (i % Math.round(fps / 2) === 0) L.notes.push({ t: +t.toFixed(2), hp: Math.round(p.hp) });
        }
        if (scene === 'rescue') {
          if (at(0)) { const { Summon } = await import('/js/skillrt.js'); const c = { d: G.data.skill2('wp_c3'), id: 'test', L: 1, mult: 1, facing: { ...p.facing } };
            const s = new Summon(k, { kind: 'wolf', ai: 'idle', living: true, hp: 0.5, life: 60 }, c, { ...window.__side(5.5, 0.4), y: 0 }); k.summons.push(s); G.zone.actors.push(s); s.hp = s.maxHp * 0.4; window.__sum = s;
            window.__tele = G.telegraph(G.zone, HitShape.circle(s.pos.x, s.pos.z, 1.8), 1.6, [1, 0.3, 0.25], (tt) => { L.notes.push({ bossAttackLanded: +window.__t.toFixed(3), summonInside: tt.shape.overlaps(s.pos.x, s.pos.z, s.radius), summonPos: [+(s.pos.x - p.pos.x).toFixed(2), +(s.pos.z - p.pos.z).toFixed(2)] }); });
            L.notes.push({ summon0: { hp: Math.round(s.hp), max: Math.round(s.maxHp), d: +Math.hypot(s.pos.x - p.pos.x, s.pos.z - p.pos.z).toFixed(2) } }); }
          if (at(0.4)) cast('wp_c3');
          if (at(1.8)) { p.allyTarget = window.__sum; cast('wp_c2'); }
          if (at(2.2)) { cast('wp_c1'); }
          if (i % Math.round(fps / 2) === 0 && window.__sum) L.notes.push({ t: +t.toFixed(2), summonHp: Math.round(window.__sum.hp), d: +Math.hypot(window.__sum.pos.x - p.pos.x, window.__sum.pos.z - p.pos.z).toFixed(2) });
        }
        G.step(1 / fps, true);
        ds.forEach((q, qi) => { if (!q.removed && q.hp < q.__hp) { L.dmg.push({ t: +window.__t.toFixed(3), a: Math.round(q.__hp - q.hp), i: qi }); q.__hp = q.hp; } });
        const fd = scene === 'solo' ? 0.5 : 2.6, sc = G.render.toScreen({ x: p.pos.x + window.__f.x * fd, y: (p.pos.y || 0) + 0.9, z: p.pos.z + window.__f.z * fd }); return [sc.x, sc.y];
      }, [scene, i, FPS, shot]);
      if (shot) { const fn = `${dir}/${String(i).padStart(3, '0')}.png`, CW = TOUCH ? VW : 800, CH = TOUCH ? Math.round(VH * 0.62) : 520;
        await pg.screenshot({ path: fn, clip: { x: Math.max(0, Math.min(VW - CW, Math.round(sc[0] - CW / 2))), y: Math.max(0, Math.min(VH - CH, Math.round(sc[1] - CH / 2))), width: CW, height: CH } }); frames.push([fn, i / FPS]); }
    }
    const res = await ev(() => { const L = window.__L, k = G.player.skills2.wp; return { casts: L.casts, dmg: L.dmg, fx: L.fx, sfx: L.sfx.filter(s => /^wp_|^ph_/.test(s.n)), notes: L.notes, log: { cores: k.log.cores, finals: k.log.finals, released: k.log.released, heals: k.log.heals, reels: k.log.reels, kitClosed: k.log.kitClosed },
      live: { tablets: k.tablets.length, foams: k.foams.length, kit: !!k.kitS, patches: k.patches.length, reels: k.reels.length } }; });
    res.errors = errs.slice(0, 8);
    fs.writeFileSync('/tmp/_wprw_strip.py', `from PIL import Image, ImageDraw\nfr=${JSON.stringify(frames)}\nims=[Image.open(f).convert('RGB') for f,_ in fr]\nW,H=ims[0].size\ncw,ch=W,H; x0=0; y0=0\nims=[i.crop((x0,y0,x0+cw,y0+ch)) for i in ims]\nn=len(ims); cols=min(5,n); rows=(n+cols-1)//cols; s=0.6 if ${TOUCH ? 1 : 0} else 0.55\nims=[i.resize((int(cw*s),int(ch*s))) for i in ims]; w,h=ims[0].size\nsh=Image.new('RGB',(w*cols,(h+18)*rows),(20,20,28)); d=ImageDraw.Draw(sh)\nfor k,(im,(_,t)) in enumerate(zip(ims,fr)):\n  x=(k%cols)*w; y=(k//cols)*(h+18); sh.paste(im,(x,y+18)); d.text((x+6,y+3),'t %.2fs'%t,fill=(255,255,255))\nsh.save('${OUT}/${tag}.png')`);
    try { execSync('python3 /tmp/_wprw_strip.py'); fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { console.log('strip failed', e.message); }
    fs.writeFileSync(`${OUT}/${tag}.json`, JSON.stringify(res, null, 1));
    summary[scene] = res; console.log(scene, JSON.stringify({ casts: res.casts, dmg: res.dmg.slice(0, 14), notes: res.notes.filter(n => !('t' in n)), log: { cores: res.log.cores, finals: res.log.finals, released: res.log.released, reels: res.log.reels, kitClosed: res.log.kitClosed, heals: res.log.heals.length }, errors: res.errors }));
  }
  async function oldsave() {
    await ev(() => { const P = G.profile; P.sk.learned = Object.assign({}, P.sk.learned, { wp_b1: 3, wp_a2: 2, wp_b2: 4, wp_c3: 5, wp_c1: 2, wp_c2: 1 }); P.sk.slots = ['wp_b1', 'wp_a2', 'wp_b2', 'wp_c3']; P.sk.points = 5; G.saveToSlot(0); });
    const before = await ev(() => { const s = JSON.parse(localStorage.getItem('arcan_save_0') || 'null'), sk = s && (s.sk || (s.profile && s.profile.sk)); return sk ? { learned: sk.learned, slots: sk.slots, points: sk.points } : null; });
    await pg.reload(); await pg.waitForFunction(() => window.G && G.slots && document.querySelector('.title-continue'), null, { timeout: 300000 });
    await ev(() => G.loadSlot(0));
    await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.player.body && G.player.body.md, null, { timeout: 300000 });
    await pg.waitForTimeout(1500);
    const r = await ev(async () => { const sk = G.sheet.book.sk, p = G.player; G.frame = () => {}; G.dev.full();
      const out = { learned: Object.fromEntries(Object.entries(sk.learned).filter(([k]) => k.startsWith('wp_'))), slots: [...sk.slots], points: sk.points, names: sk.slots.map(id => G.data.skill2(id) && G.data.skill2(id).name) };
      G.ui.showCraft(); const txt = (document.querySelector('.window') || document.body).innerText; out.craftWindow = { hasHigh: /고순도 제제 조제/.test(txt), hasRegen: /서방형 캡슐 조제/.test(txt), potion: /농축 회복제/.test(txt), regenHp: /지속 회복 제제/.test(txt), regenSp: /지속 활력 제제/.test(txt) }; G.ui.close();
      const sys = await import('/js/skillsys.js'), rc = G.data.recipes.find(r => r.id === 'r_potion_l'); G.sheet.bag.add('m_herb', 4); G.sheet.bag.add('m_bottle', 1); G.sheet.bag.add('m_wolf_fang', 1); const n0 = G.sheet.bag.count('c_potion_l');
      const cr = sys.craft(G.data, G.sheet, G.sheet.book, rc, 1, () => 0); out.crafted = { ok: !!cr.ok, err: cr.err || null, got: G.sheet.bag.count('c_potion_l') - n0 };
      const m = G.dev.dummies('mon_boar', 1, 0.01, { x: p.pos.x + 3, z: p.pos.z })[0]; await new Promise(r => setTimeout(r, 1500)); m.thinkStep = () => {}; p.target = m; const sp0 = p.sp;
      G.input.block = false; p.actions({ down: { skill1: true }, held: {}, move: null }); G.input.block = true; for (let i = 0; i < 30; i++) G.step(1 / 30, false);
      out.slot1 = { spUsed: +(sp0 - p.sp).toFixed(1), cd: p.skills2.cdLeft('wp_b1') > 0, tablets: p.skills2.wp.tablets.length, marks: m._marks ? m._marks.reaction : 0 };
      return out; });
    r.saved = before; r.errors = errs.slice(0, 8);
    await pg.screenshot({ path: `${OUT}/oldsave_${SIZE}.png` });
    fs.writeFileSync(`${OUT}/oldsave_${SIZE}.json`, JSON.stringify(r, null, 1)); console.log('oldsave', JSON.stringify(r));
    return r;
  }
  await b.close();
})();
