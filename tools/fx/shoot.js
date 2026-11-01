// usage: node shoot.js '<json jobs>'   job = {name, cat, kinds?, opt}
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const jobs = JSON.parse(process.argv[2]);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 800, height: 600 } });
  const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  pg.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text()); });
  await pg.goto('http://localhost:8770/fxtest/gallery.html' + (process.env.Q || ''));
  await pg.waitForFunction(() => window.ready, null, { timeout: 60000 }).catch(e => errs.push('not ready'));
  for (const j of jobs) {
    const url = await pg.evaluate(async ([cat, kinds, opt]) => window.sheet(cat, kinds || window.FX_KINDS[cat], opt || {}), [j.cat, j.kinds, j.opt]);
    fs.writeFileSync('/home/claude/fxtest/shots/' + j.name + '.png', Buffer.from(url.split(',')[1], 'base64'));
  }
  const info = await pg.evaluate(() => window.info).catch(() => ({}));
  console.log(JSON.stringify(info.tris));
  if (info.errors && info.errors.length) console.log('ERRORS', info.errors.join('\n'));
  console.log(errs.slice(0, 20).join('\n'));
  await b.close();
})();
