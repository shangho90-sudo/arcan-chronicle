// 견습생 스킬 그림 아이콘(assets/ui/skills) + 일반 스킬 4칸(예전 R 궁극기 칸 → 4번) 확인: 스킬창과 휴대폰·PC 키패드를 캡처.
// Usage: SIZES=1280x720,390x844t node tools/browser-tests/skillicons.js -> OUT/skillicons_<win|pad>_<size>.png
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/skillicons'; fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const sz of (process.env.SIZES || '1280x720,390x844t').split(',')) {
    const touch = sz.endsWith('t'), [W, H] = sz.replace('t', '').split('x').map(Number);
    const pg = await (await b.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch })).newPage(); const errs = [];
    pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    const ev = (f, a) => pg.evaluate(f, a);
    await pg.goto('http://localhost:8765/index.html');
    const click = async t => { await pg.waitForFunction(t => [...document.querySelectorAll('button,[aria-label]')].some(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t), t, { timeout: 300000 }); await ev(t => [...document.querySelectorAll('button,[aria-label]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === t).click(), t); await pg.waitForTimeout(400); };
    await ev(() => localStorage.clear()); await click('새 게임'); await click('모험 시작'); await pg.waitForSelector('.prologue.on', { timeout: 60000 }); await click('건너뛰기');
    await pg.waitForFunction(() => window.G && G.inWorld && G.player && !G.loading && !document.querySelector('.prologue'), null, { timeout: 300000 });
    const R = await ev(() => { const s = G.player.sheet; s.addExp(5000); const bk = s.book; for (const id of ['nv_a2', 'nv_a4', 'nv_a3', 'nv_p1']) bk.learn(id); s.recalc();
      return { level: s.p.level, slots: bk.sk.slots.slice(), n: bk.sk.slots.length }; });
    await pg.waitForTimeout(800);
    R.pad = await ev(() => ['skill1', 'skill2', 'skill3', 'skill4', 'ult'].map(n => { const e = document.querySelector('.abtn.' + n); if (!e) return n + ':없음'; return n + ':' + e.querySelector('.key').textContent + (e.querySelector('.skart,.skround') ? ':그림' : ''); }));
    await pg.screenshot({ path: `${OUT}/skillicons_pad_${sz}.png`, clip: { x: Math.max(0, W - 400), y: Math.max(0, H - 380), width: Math.min(W, 400), height: Math.min(H, 380) }, timeout: 300000 });
    await ev(() => G.ui.showSkills()); await pg.waitForTimeout(1200);
    R.win = await ev(() => ({ arts: document.querySelectorAll('.window .skart, .window .skround').length, slots: [...document.querySelectorAll('.skslot small')].map(x => x.textContent) }));
    await pg.screenshot({ path: `${OUT}/skillicons_win_${sz}.png`, timeout: 300000 });
    // 약사 1차 탭 (전직 조건은 건너뛰고 직업만 바꿈)
    await ev(() => { G.ui.close && G.ui.close(); const s = G.player.sheet; s.p.job = 'pharmacist'; s.refreshSkills && s.refreshSkills(true); s.book.grantPoints(); s.recalc(); for (const id of ['ph1_a1', 'ph1_b1']) s.book.learn(id); s.recalc(); G.ui.showSkills('pharmacist'); });
    await pg.waitForTimeout(1200);
    R.ph = await ev(() => document.querySelectorAll('.window .skround').length);
    await pg.screenshot({ path: `${OUT}/skillicons_ph_${sz}.png`, timeout: 300000 });
    console.log(sz, JSON.stringify(R), 'errors', errs.slice(0, 4)); await pg.context().close();
  }
  await b.close();
})();
