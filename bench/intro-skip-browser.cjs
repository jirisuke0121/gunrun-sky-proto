// The intro (practice) run shows a skip button that starts the real Easy run; ordinary runs do not show it.
// Run from the repo root with Playwright + Chromium: node bench/intro-skip-browser.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const port = Number(process.env.SKY_TEST_PORT || 18821), base = process.env.RUNNING_QA_URL || `http://127.0.0.1:${port}/`;
const out = 'browser-evidence/intro-skip'; fs.mkdirSync(out, { recursive: true });
(async () => {
  let server;
  if (!process.env.RUNNING_QA_URL) {
    server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { stdio: 'ignore' });
    for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  }
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  try {
    for (const map of ['index.html', 'canyon.html']) for (const touch of [false, true]) {
      const context = await browser.newContext(touch ? { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true } : { viewport: { width: 960, height: 540 } });
      const page = await context.newPage(); const errors = [];
      page.on('pageerror', e => errors.push(String(e)));
      await page.goto(`${base}${map}?onboarding=reset`, { waitUntil: 'load', timeout: 90000 });
      await page.waitForSelector('#onbStart:not([disabled])', { timeout: 120000 });
      await page.evaluate(() => document.getElementById('onbStart').click());
      await page.waitForFunction(() => window.skyChallenge?.isIntroRun && window.__skyInternals.modeRef() === 'play', null, { timeout: 120000 });
      await page.waitForSelector('#introSkip:not([hidden])', { timeout: 10000 });
      const box = await page.evaluate(() => { const r = document.getElementById('introSkip').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight }; });
      assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.w <= box.vw && box.y + box.h <= box.vh, `${map} touch=${touch}: skip button inside the viewport`);
      await page.screenshot({ path: `${out}/${map.replace('.html', '')}-${touch ? 'touch' : 'desktop'}-intro.png` });
      await page.evaluate(() => document.getElementById('introSkip').click());
      await page.waitForFunction(() => window.__skyInternals.modeRef() === 'play' && window.skyChallenge.id === 'easy' && !window.skyChallenge.isIntroRun, null, { timeout: 60000 });
      assert.equal(await page.evaluate(() => document.getElementById('introSkip').hidden), true, 'hidden in the real run');
      await page.waitForTimeout(900);
      assert.equal(await page.evaluate(() => document.getElementById('introSkip').hidden), true, 'stays hidden in the real run');
      assert.deepEqual(errors, []);
      console.log(`PASS ${map} ${touch ? 'touch' : 'desktop'}: skip button shown in the intro run, starts the real Easy run, hidden afterwards`);
      await context.close();
    }
  } finally { await browser.close(); server?.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
