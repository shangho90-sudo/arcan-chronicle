// Use an existing Playwright installation; no project dependency is required.
// PLAYWRIGHT_PACKAGE may point to the bundled package; CHROMIUM_PATH is optional.
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '../..');
const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html');
    return res.end('<!doctype html><script type="importmap">{"imports":{"three":"/vendor/three-r160/build/three.module.js"}}</script>');
  }
  const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.json') ? 'application/json' : 'audio/mpeg');
  fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const report = await page.evaluate(async () => {
      const { Audio } = await import('/js/io.js');
      const a = new Audio(); a.unlock(); await a.ctx.resume();
      a.music = 0; a.apply();
      const zones = (await (await fetch('/assets/data/zones.json')).json()).zones;
      const results = [];
      for (const stub of zones) {
        const z = stub.file ? await (await fetch('/assets/data/' + stub.file)).json() : stub;
        await a.playMusic(z.bgm);
        if (a.curName !== z.bgm || !a.cur?.loop) throw new Error(z.id + ': playback failed');
        const b = a.cur.buffer, samples = b.getChannelData(0);
        let sum = 0, peak = 0, count = 0, first = -1, last = -1;
        for (let i = 0; i < samples.length; i += 128) {
          const v = Math.abs(samples[i]); sum += v * v; peak = Math.max(peak, v); count++;
          if (v > 0.005) { if (first < 0) first = i / b.sampleRate; last = i / b.sampleRate; }
        }
        const rms = Math.sqrt(sum / count);
        if (b.duration < 60 || rms < 0.001) throw new Error(z.id + ': short or silent');
        const cached = [...a.buffers.keys()].filter(k => k.startsWith('bgm_')).length;
        if (cached > 1) throw new Error('Music cache accumulated');
        results.push({ zone: z.id, duration: b.duration, channels: b.numberOfChannels, rms, peak, leadingQuiet: first, trailingQuiet: b.duration - last, musicBuffers: cached });
      }
      a.music = 0.28; a.apply();
      if (Math.abs(a.gMusic.gain.value - 0.14) > 0.001) throw new Error('Volume setting failed');
      a.cur.stop(); await a.ctx.close();
      return results;
    });
    fs.writeFileSync(path.join(root, 'tools/audio/music-validation.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(`Browser decoded and loop-started ${report.length} region tracks; volume and cache checks passed.`);
    console.log(`Duration range: ${Math.min(...report.map(x => x.duration)).toFixed(1)}–${Math.max(...report.map(x => x.duration)).toFixed(1)} sec`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server.close());
