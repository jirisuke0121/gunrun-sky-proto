const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const base = 'http://127.0.0.1:18847/';
(async () => {
  let server, browser;
  const evidence = [];
  try {
    server = spawn('python3', ['-m', 'http.server', '18847', '--bind', '127.0.0.1'], { stdio: 'ignore' });
    for (let i = 0; i < 60; i++) { if (await fetch(base).then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const source = fs.readFileSync('bench/gantry-pursuit-scenarios.js', 'utf8');
    for (const difficulty of ['normal', 'hard']) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      await context.addInitScript(id => { window.__hold = true; localStorage.setItem('gunrun-challenge-difficulty-v1', id); }, difficulty);
      await context.route('https://**/*', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0,"ok":true}' }));
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.setDefaultTimeout(120000);
      await page.goto(base + 'index.html');
      await page.waitForFunction(() => window.skyStartReadiness?.ready && window.skyZombieClimb);
      await page.locator('#bStart').click();
      assert.equal(await page.evaluate(() => skyChallenge.id), difficulty);
      const rows = await page.evaluate(code => eval(code), source);
      evidence.push({ difficulty, rows });
      assert.equal(rows.length, 25);
      for (const r of rows) {
        assert.ok(r.fixtureFree, `${difficulty}/${r.id}: invalid fixture`);
        assert.notEqual(r.firstDamage, null, `${difficulty}/${r.id}: no attack within 60s`);
        assert.equal(r.penetrations, 0, `${difficulty}/${r.id}: body intersects terrain during traversal`);
        assert.ok(r.maxDisplacement < 1, `${difficulty}/${r.id}: unexpected displacement`);
      }
      assert.deepEqual(errors, []);
      console.log(`PASS gantry-b ${difficulty}: 25 real AI pursuit cases`);
      await context.close();
    }
  } finally {
    fs.mkdirSync('browser-evidence/gantry', { recursive: true });
    fs.writeFileSync('browser-evidence/gantry/results.json', JSON.stringify(evidence, null, 2));
    await browser?.close();
    server?.kill();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
