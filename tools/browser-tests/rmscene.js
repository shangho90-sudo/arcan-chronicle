// 리마스터 6단계 장면 확인(2026-11-19): 같은 세션·같은 카메라·같은 프레임에서 그래픽 품질만 바꿔 찍음 (low = 예전 모습).
// 마을·필드 여러 곳을 차례로(테스트에서만 G.lockOf를 꺼서 이동), 곳마다 VIEWS 자리에서 low/medium/high 사진 + 비교표,
// PERF=1이면 품질마다 그리기만 N번 반복해 ms·draw call·삼각형·프로그램·텍스처 (SwiftShader ms는 공유 기계라 상대 비교만).
// Usage: ZONES=town,kairion_capital,forest VIEWS="town:0,-9,1;town:-20,-20,1.6" VARIANTS=low,medium,high SIZE=1280x720|390x844t
//        JOB=blacksmith GENDER=m PERF=1 URL=http://localhost:8961/index.html OUT=/tmp/remaster2/scene TAG=after node rmscene.js
//  VIEWS entries zone:x,z,zoom — zones without a VIEWS entry use their arrival spot (zoom 1)
const { chromium } = require('playwright'); const fs = require('fs'); const { execSync } = require('child_process');
const SIZE = process.env.SIZE || '1280x720', TOUCH = SIZE.endsWith('t'), [VW, VH] = SIZE.replace('t', '').split('x').map(Number);
const OUT = process.env.OUT || '/tmp/remaster2/scene', TAG = process.env.TAG || 'rm', VARS = (process.env.VARIANTS || 'low,medium,high').split(',');
const ZONES = (process.env.ZONES || 'town').split(','), PERF = process.env.PERF === '1', JOB = process.env.JOB || 'blacksmith', GENDER = process.env.GENDER || 'm';
const VIEWS = {}; for (const v of (process.env.VIEWS || '').split(';').filter(Boolean)) { const [z, r] = v.split(':'); (VIEWS[z] = VIEWS[z] || []).push(r.split(',').map(Number)); }
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: VW, height: VH }, hasTouch: TOUCH, isMobile: TOUCH })).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  pg.setDefaultTimeout(600000);
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(process.env.URL || 'http://localhost:8961/index.html');
  const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
  await ev(() => { localStorage.clear(); localStorage.setItem('arcan_settings', JSON.stringify({ gfxQuality: 'low' })); }); await pg.reload(); await click('게임 시작 (새 게임)'); await click('모험 시작');
  await pg.waitForSelector('.prologue.on', { timeout: 60000 }).then(() => click('건너뛰기')).catch(() => {});
  const ready = () => pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && G.zone && G.player.body && G.player.body.md, null, { timeout: 600000 });
  await ready();
  await ev(async ([job, g]) => {
    G.frame = () => {}; if (G.reward) { G.reward.jobChange = sw => sw && sw(); G.reward.levelUp = () => {}; }
    G.dev.level(job === 'novice' ? 5 : 12); G.sheet.p.gender = g; G.sheet.p.job = 'novice'; if (job !== 'novice') G.dev.job(job); G.sheet.recalc(); await G.player.attachBody();
    G.lockOf = () => null;
  }, [JOB, GENDER]);
  const res = { size: SIZE, zones: {} };
  for (const zid of ZONES) {
    const cur = await ev(() => G.zone.def.id);
    if (cur !== zid) { await ev(z => { G.loading = false; G.travel(z); }, zid); await pg.waitForTimeout(1500); await ready(); await pg.waitForTimeout(2500); }
    const views = VIEWS[zid] || [[null, null, 1]];
    res.zones[zid] = { views: [] };
    for (let vi = 0; vi < views.length; vi++) {
      const [vx, vz, zoom] = views[vi];
      await ev(async ([x, z, zoom]) => {
        document.querySelectorAll('.hud,.controls,.toasts,.qhud,.qh-reopen,.layer:not(.controls),.zone-banner,.qbanner').forEach(e => e.style.display = 'none');
        const p = G.player; if (x != null) { const s = G.zone.geo.nearestFree(x, z, 0.4); p.teleport(s); p.body.place(p.pos); }
        p.setFacing(0.3, -1); p.body.play('idle', 1, true);
        for (const a of G.zone.actors) if (a !== p && a.faction === 'monster' && Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z) < 3) a.pos.x += 4;
        for (let i = 0; i < 30; i++) G.step(1 / 60, false);
        const c = G.render.cam; c.zoom = zoom; c.updateProjectionMatrix(); G.render.setFocus({ x: p.pos.x, y: 0, z: p.pos.z }, true);
      }, [vx, vz, zoom || 1]);
      await pg.waitForTimeout(2500);
      const files = [];
      for (const v of VARS) {
        await ev(async v => { const R = await import('/js/render.js'); R.RMC.debug = v === 'debug'; G.settings.gfxQuality = v === 'debug' ? 'high' : v; G.applySettings(); for (let i = 0; i < 4; i++) G.step(1 / 60, false); G.render.setFocus({ x: G.player.pos.x, y: 0, z: G.player.pos.z }, true); }, v);
        await pg.waitForTimeout(1500);
        await ev(() => G.render.render(0));
        const fn = `${OUT}/${TAG}_${zid}_v${vi}_${SIZE}_${v}.png`; await pg.screenshot({ path: fn, timeout: 600000 }); files.push(fn);
        if (PERF && vi === 0) {
          res.zones[zid][v] = await ev(async () => {
            const r = G.render.r, out = []; r.info.autoReset = false;
            for (let i = 0; i < 3; i++) G.render.render(1 / 60);
            for (let k = 0; k < 2; k++) { r.info.reset(); const t0 = performance.now(), N = 6; for (let i = 0; i < N; i++) { G.render.render(1 / 60); r.getContext().finish(); }
              out.push({ ms: +((performance.now() - t0) / N).toFixed(1), calls: Math.round(r.info.render.calls / N), tris: Math.round(r.info.render.triangles / N) }); }
            r.info.autoReset = true;
            return { runs: out, programs: r.info.programs ? r.info.programs.length : null, geometries: r.info.memory.geometries, textures: r.info.memory.textures, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null };
          });
          console.log(zid, v, JSON.stringify(res.zones[zid][v]));
        }
      }
      res.zones[zid].views.push(files);
      if (await ev(() => !!(G.zone.plazaRM && G.zone.plazaRM.stats))) res.zones[zid].stats = await ev(() => G.zone.plazaRM.stats);
      if (await ev(() => !!(G.zone.fieldRM && G.zone.fieldRM.stats))) res.zones[zid].fstats = await ev(() => G.zone.fieldRM.stats);
      const out = `${OUT}/${TAG}_${zid}_v${vi}_${SIZE}_sheet.png`;
      fs.writeFileSync('/tmp/_rmscene.py', `from PIL import Image, ImageDraw\nfr=${JSON.stringify(files)}\nlab=${JSON.stringify(VARS)}\nims=[Image.open(f).convert('RGB') for f in fr]\nw,h=ims[0].size\nsc=min(1.0, 2700/(w*len(ims)))\nims=[i.resize((int(w*sc),int(h*sc))) for i in ims]\nw,h=ims[0].size\nsh=Image.new('RGB',(w*len(ims),h+22),(20,20,28))\nd=ImageDraw.Draw(sh)\nfor i,im in enumerate(ims):\n  sh.paste(im,(i*w,22)); d.text((i*w+6,4),lab[i],fill=(255,255,255))\nsh.save('${out}')\n`);
      execSync('python3 /tmp/_rmscene.py'); console.log('sheet', out);
    }
  }
  res.errors = errs.filter(e => !/favicon/.test(e)).slice(0, 12);
  fs.writeFileSync(`${OUT}/${TAG}_${SIZE}.json`, JSON.stringify(res, null, 1)); console.log('errors', JSON.stringify(res.errors));
  await b.close();
})();
