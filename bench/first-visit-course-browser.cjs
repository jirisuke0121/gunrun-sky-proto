// The first-visit card, 遊び方 and the home intro button all start the practice-map course (canyon.html?learn=1), on PC and phone alike.
// navigator.webdriver is hidden so the page behaves like a real player's browser (automated browsers keep the old in-map intro).
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const base = process.env.RUNNING_QA_URL || 'http://127.0.0.1:8882/';
  try {
    for (const [map, touch, how] of [['index.html', false, 'splash'], ['index.html', true, 'splash'], ['canyon.html', false, 'splash'], ['index.html', false, 'guide'], ['index.html', true, 'home']]) {
      const [width, height] = touch ? [844, 390] : [1280, 720], id = [map, touch ? 'touch' : 'pc', how].join(' ');
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
      await context.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });
      await context.route('https://**/*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"top":[],"total":0,"me":null}' }));
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(120000);
      if (how !== 'splash') await page.addInitScript(() => { try { localStorage.setItem('gunrun-onboarding-v1', JSON.stringify({ phase: 'complete' })); } catch {} });
      await page.goto(base + map + '?lang=ja', { waitUntil: 'domcontentloaded' });
      if (how === 'splash') {
        await page.waitForFunction(() => document.getElementById('onbStart') && !document.getElementById('onbStart').disabled);
        await page.locator('#onbStart').click();
      } else if (how === 'guide') {
        await page.waitForFunction(() => window.skyStartReadiness?.ready);
        await page.locator('#homeGuide').click();
        await page.waitForFunction(() => document.getElementById('onbIntro') && !document.getElementById('onbIntro').disabled);
        await page.locator('#onbIntro').click();
      } else {
        await page.waitForFunction(() => window.skyStartReadiness?.ready);
        await page.evaluate(() => document.getElementById('bIntro').click());
      }
      await page.waitForURL(/canyon\.html\?.*learn=1/, { timeout: 60000 });
      assert.ok(!(await page.evaluate(() => window.skyControlStyle?.dialogVisible)), id + ': no separate control popup before the course (the course asks once itself)');
      await page.waitForFunction(() => window.skyGuidedIntro?.choice === 'choose' && __game.mode === 'play', null, { timeout: 90000 });
      assert.deepEqual(errors, [], id);
      console.log('PASS first visit -> practice course', id);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
