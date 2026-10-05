/* Browser smoke test: THREE_PATH=/path/to/three.min.js NODE_PATH=$(npm root -g) node tests/browser.test.js [shots-dir]
   jsDelivr URLs (three.js and our own gh/tsubasamasa/zio files) are served from local files so the test also runs offline. */
'use strict';
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || path.join(ROOT, 'tests', 'shots');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errors = [];
  async function open(opts) {
    const page = await browser.newPage(opts);
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/fontsource|ERR_|net::|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
    await page.route('https://cdn.jsdelivr.net/**', r => {
      const u = r.request().url();
      if (u.includes('/three@') && process.env.THREE_PATH) return r.fulfill({ path: process.env.THREE_PATH, contentType: 'application/javascript' });
      const own = u.split('/gh/tsubasamasa/zio@main/')[1];
      if (own) return r.fulfill({ path: path.join(ROOT, own.split('?')[0]), contentType: own.endsWith('.css') ? 'text/css' : 'application/javascript' });
      return r.abort();
    });
    await page.goto('file://' + path.join(ROOT, 'index.html'));
    await page.waitForTimeout(2500);
    return page;
  }

  const page = await open({ viewport: { width: 1280, height: 720 } });
  await page.screenshot({ path: path.join(OUT, '01-menu.png') });
  await page.evaluate(() => { const g = KZ.game; g.profile.coins = 900; g.save(); g.renderGarage(); });
  for (const t of ['character', 'hat', 'paint']) {
    await page.click('#gtabs button[data-t="' + t + '"]');
    await page.click('#items .item:nth-child(' + (t === 'character' ? 2 : t === 'hat' ? 3 : 4) + ')');
  }
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '01b-garage.png') });
  await page.click('[data-modal="howto"]');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, '02-howto.png') });
  await page.click('.modal-card .close');

  await page.fill('#nick', 'Tester');
  await page.click('.mode[data-m="ffa"]');
  await page.click('#play');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, '03-countdown.png') });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2500);
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(700);
  await page.keyboard.up('KeyA');
  await page.evaluate(() => { KZ.game.world.player.weapon = { type: 'punch', ammo: 2 }; });
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '04-driving.png') });
  // force an explosion in view
  await page.evaluate(() => { const w = KZ.game.world, p = w.player; w.explode(p.x + p.fx * 10, p.y + 1, p.z + p.fz * 10, 5, 0, null, 'rocket'); });
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(OUT, '05-explosion.png') });
  await page.keyboard.up('KeyW');

  for (const [mode, map] of [['team', 'candy'], ['koth', 'lava'], ['coins', 'snow'], ['survival', 'desert']]) {
    await page.evaluate(([m, a]) => { const g = KZ.game; g.toMenu(); g.profile.mode = m; g.profile.map = a; g.profile.bots = 8; g.play(); g.world.countdown = 0; }, [mode, map]);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(2500);
    await page.keyboard.up('KeyW');
    await page.screenshot({ path: path.join(OUT, '06-' + mode + '-' + map + '.png') });
  }
  // results
  await page.evaluate(() => { KZ.game.world.timeLeft = 0.05; });
  await page.waitForTimeout(2200);
  await page.screenshot({ path: path.join(OUT, '07-results.png') });
  const fps = await page.evaluate(() => KZ.game.fps);
  console.log('FPS (software WebGL):', fps.toFixed(1));

  const mobile = await open({ viewport: { width: 400, height: 860 }, hasTouch: true, isMobile: true });
  await mobile.screenshot({ path: path.join(OUT, '08-mobile-menu.png') });
  await mobile.tap('#play');
  await mobile.waitForTimeout(4000);
  await mobile.screenshot({ path: path.join(OUT, '09-mobile-play.png') });
  const land = await open({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  await land.tap('#play');
  await land.waitForTimeout(4000);
  await land.screenshot({ path: path.join(OUT, '10-mobile-landscape.png') });

  await browser.close();
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('Browser test passed (' + OUT + ')');
})().catch(e => { console.error(e); process.exit(1); });
