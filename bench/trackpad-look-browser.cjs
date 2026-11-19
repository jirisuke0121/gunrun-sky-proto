// Trackpad / single-button look: the control trial (no pointer lock) must turn the camera with a
// left drag, and two-finger scrolling (wheel events, no mousemove) must turn it in the trial and in play.
// A right drag keeps working. The automatic camera ("after") must stay put.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const port = Number(process.env.SKY_TEST_PORT || 18877);
const base = process.env.RUNNING_QA_URL || `http://127.0.0.1:${port}/`;

(async () => {
  let browser, server;
  try {
    if (!process.env.RUNNING_QA_URL) {
      server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { stdio: 'ignore' });
      let ready = false;
      for (let i = 0; i < 60 && !ready; i++) {
        ready = await fetch(base).then(r => r.ok, () => false);
        if (!ready) await new Promise(resolve => setTimeout(resolve, 100));
      }
      assert.ok(ready, 'local test server starts');
    }
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

    for (const map of ['index.html', 'canyon.html']) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, locale: 'ja-JP' }), errors = [];
      page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(120000);
      await page.route('https://**/*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0}' }));
      await page.goto(`${base}${map}?guidedEntry=1&lang=ja`);
      await page.waitForFunction(() => window.skyGuidedIntro?.choice === 'choose' && __game.mode === 'play');
      const view = () => page.evaluate(() => { const v = window.skyFollowCamera.mode === 'after' ? skyFollowCamera.view : __skyInternals.c; return { yaw: v.yaw, pitch: v.pitch }; });
      const turned = (a, b) => Math.abs(Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)));
      const centre = { x: 640, y: 360 };
      const drag = async (button, dx) => {
        await page.mouse.move(centre.x, centre.y); await page.mouse.down({ button: button === 2 ? 'right' : 'left' });
        for (let i = 1; i <= 8; i++) await page.mouse.move(centre.x + dx * i / 8, centre.y);
        await page.mouse.up({ button: button === 2 ? 'right' : 'left' }); await page.mouse.move(centre.x, centre.y);
      };
      const wheel = async (dx, dy, extra = {}) => { await page.mouse.move(centre.x, centre.y); await page.evaluate(([x, y, e]) => document.getElementById('c').dispatchEvent(new WheelEvent('wheel', { deltaX: x, deltaY: y, bubbles: true, cancelable: true, ...e })), [dx, dy, extra]); };
      const id = map.split('.')[0];

      // ---- trial, you steer the view
      await page.locator('[data-learn-mode="before"]').first().click();
      assert.equal(await page.evaluate(() => skyGuidedIntro.trial), true);
      let a = await view();
      await page.mouse.move(centre.x, centre.y); await page.mouse.move(centre.x + 120, centre.y + 20);
      assert.equal(turned(a, await view()), 0, id + ': a plain mouse move does not turn the view');
      await drag(0, 120);
      let b = await view();
      assert.ok(turned(a, b) > 0.15, id + ': left drag turns the view in the trial (' + turned(a, b).toFixed(3) + ')');
      await page.mouse.move(centre.x + 100, centre.y);
      assert.equal(turned(b, await view()), 0, id + ': released button stops turning');
      a = await view(); await drag(2, -120); b = await view();
      assert.ok(turned(a, b) > 0.15, id + ': right drag still turns the view');
      assert.ok(Math.sign(Math.sin(b.yaw - a.yaw)) !== 0);

      // two-finger swipe: the camera follows the fingers like a mouse, either way round
      a = await view(); await wheel(-80, 0);
      b = await view(); const right = Math.sin(b.yaw - a.yaw);
      assert.ok(turned(a, b) > 0.05, id + ': two-finger sideways swipe turns the view (' + turned(a, b).toFixed(3) + ')');
      await wheel(80, 0); assert.ok(turned(a, await view()) < 1e-6, id + ': the opposite swipe turns it back');
      a = await view(); await wheel(80, 0); b = await view();
      assert.ok(Math.sin(b.yaw - a.yaw) * right < 0, id + ': opposite swipes turn opposite ways');
      a = await view(); await wheel(0, 50); b = await view();
      assert.notEqual(a.pitch, b.pitch, id + ': a vertical swipe tilts the view');
      a = await view(); await wheel(-80, 0, { ctrlKey: true });
      assert.equal(turned(a, await view()), 0, id + ': a pinch (ctrl+wheel) is left to the browser');
      a = await view(); await wheel(-5000, 0, { deltaMode: 0 });
      assert.ok(turned(a, await view()) < 0.4, id + ': one huge event cannot spin the camera');

      // ---- trial, automatic camera: nothing to steer
      await page.evaluate(() => skyFollowCamera.setMode('after', false));
      a = await view(); await drag(0, 120); await wheel(-80, 40);
      assert.equal(turned(a, await view()), 0, id + ': the automatic camera ignores drag and swipe');

      // ---- after the trial (real play) two-finger swipe still turns the view
      await page.evaluate(() => skyFollowCamera.setMode('before', false));
      await page.locator('#learnGo').click();
      if (await page.locator('.cg-ok').first().waitFor({ state: 'visible', timeout: 1500 }).then(() => true, () => false)) await page.locator('.cg-ok').first().click();
      await page.waitForFunction(() => skyGuidedIntro.trial === false, null, { timeout: 30000 });
      await page.waitForTimeout(300);
      a = await view(); await wheel(-80, 0); b = await view();
      assert.ok(turned(a, b) > 0.05, id + ': two-finger swipe turns the view in play (' + turned(a, b).toFixed(3) + ')');
      assert.deepEqual(errors, []);
      console.log('PASS trackpad look', id);
      await page.close();
    }
  } finally {
    if (browser) await browser.close();
    if (server) server.kill();
  }
})().catch(error => { console.error(error); process.exit(1); });
