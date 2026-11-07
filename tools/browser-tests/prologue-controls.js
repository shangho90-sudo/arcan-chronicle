// 프롤로그 전환 중 연속 입력, 키보드, 늦은 이미지, 종료 중복 방지 회귀 검사.
// NODE_PATH=<existing Playwright runtime> BROWSER_PATH=<browser> node tools/browser-tests/prologue-controls.js
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
(async () => {
  const browser = await chromium.launch({ ...(process.env.BROWSER_PATH ? { executablePath:process.env.BROWSER_PATH } : {}) });
  try {
    const ctx = await browser.newContext({ viewport:{ width:390, height:844 }, reducedMotion:'reduce' });
    const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    let delayFirst = false;
    const styles = (await fs.readFile(path.join(root, 'index.html'), 'utf8')).match(/<style>[\s\S]*?<\/style>/g).join('\n');
    await ctx.route('http://prologue.test/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/') return route.fulfill({ contentType:'text/html', body:`<!doctype html><html lang="ko"><head><meta charset="utf-8">${styles}</head><body></body></html>` });
      const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(root + path.sep)) return route.fulfill({ status:403, body:'' });
      if ((delayFirst && url.pathname.endsWith('/p1.jpg')) || url.pathname.endsWith('/p2.jpg')) await new Promise(r => setTimeout(r, 1800));
      const mime = { '.js':'text/javascript', '.json':'application/json', '.jpg':'image/jpeg', '.woff':'font/woff', '.woff2':'font/woff2' };
      try { await route.fulfill({ contentType:mime[path.extname(file)] || 'application/octet-stream', body:await fs.readFile(file) }); }
      catch { await route.fulfill({ status:404, body:'' }); }
    });
    const start = async () => {
      await page.goto('http://prologue.test/');
      await page.evaluate(async () => {
        const { Prologue } = await import('/js/prologue.js');
        window.calls = 0; window.P = new Prologue({ input:{ block:false } });
        await P.play(() => window.calls++);
      });
    };
    await start();
    await page.waitForFunction(() => document.querySelector('.prologue')?.dataset.line === '0.0');
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => P.typing), false, 'Space completes the line');
    assert.equal(await page.evaluate(() => P.done), false, 'initial focus never skips the story');
    await page.keyboard.down('Enter'); await page.keyboard.down('Enter'); await page.keyboard.up('Enter');
    assert.equal(await page.evaluate(() => P.li), 1, 'held key advances only once');
    await page.locator('.pl-next').click();
    assert.equal(await page.evaluate(() => P.typing), false, 'button completes the line');
    await page.locator('.pl-next').click();
    await page.evaluate(() => { for (let n = 0; n < 12; n++) document.querySelector('.prologue').dispatchEvent(new PointerEvent('pointerup', { bubbles:true })); });
    await page.waitForFunction(() => document.querySelector('.prologue')?.dataset.line === '1.0');
    assert.equal(await page.evaluate(() => P.li), 0, 'rapid input cannot skip a pending panel');
    assert.equal(await page.locator('.pl-pan').last().evaluate(el => getComputedStyle(el).animationName), 'none', 'reduced motion respected');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'pl-skip', 'Tab stays in dialog');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'pl-next', 'Tab reaches next button');
    await page.keyboard.press('Escape');
    await page.mouse.click(190, 300); await page.mouse.click(190, 300);
    await page.waitForFunction(() => !document.querySelector('.prologue'));
    assert.equal(await page.evaluate(() => calls), 1, 'ending callback runs once');
    delayFirst = true; await start(); await page.keyboard.press('Escape');
    await page.waitForTimeout(2100);
    assert.equal(await page.evaluate(() => document.querySelectorAll('.pl-layer').length), 0, 'late image does not reopen a skipped scene');
    await page.mouse.click(190, 300); await page.waitForFunction(() => !document.querySelector('.prologue'));
    assert.equal(await page.evaluate(() => calls), 1);
    assert.deepEqual(errors, []);
    console.log('PASS: keyboard, rapid input, reduced motion, focus, slow image skip, exactly-once completion');
    if (process.env.OUT) {
      await fs.mkdir(process.env.OUT, { recursive:true });
      delayFirst = false; await start();
      await page.setViewportSize({ width:1280, height:720 });
      for (let i = 0; i < 6; i++) {
        if (i) await page.evaluate(n => P.showPanel(n), i);
        await page.waitForFunction(n => !P.pending && P.pi === n, i);
        await page.evaluate(() => { if (P.typing) P.advance(); });
        await page.waitForTimeout(1100);
        await page.screenshot({ path:path.join(process.env.OUT, `scene-${i + 1}.png`) });
      }
      await page.setViewportSize({ width:390, height:844 });
      await page.screenshot({ path:path.join(process.env.OUT, 'portrait.png') });
      await page.setViewportSize({ width:844, height:390 });
      await page.screenshot({ path:path.join(process.env.OUT, 'landscape.png') });
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
