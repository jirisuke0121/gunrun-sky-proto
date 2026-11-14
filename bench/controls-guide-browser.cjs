// The controls picture (controls-guide.js) appears right after the control choice: PC (mouse look / automatic camera) and phone.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const base = process.env.RUNNING_QA_URL || 'http://127.0.0.1:8882/', out = 'browser-evidence/controls-guide';
  fs.mkdirSync(out, { recursive: true });
  try {
    for (const [map, lang, touch, mode] of [['index.html', 'ja', false, 'before'], ['index.html', 'ja', false, 'after'], ['canyon.html', 'en', false, 'after'], ['index.html', 'ja', true, 'after'], ['canyon.html', 'en', true, 'before']]) {
      const [width, height] = touch ? [844, 390] : [1280, 720];
      const id = [map.split('.')[0], lang, touch ? 'touch' : 'pc', mode].join('-');
      const page = await browser.newPage({ viewport: { width, height }, hasTouch: touch, isMobile: touch, locale: lang === 'ja' ? 'ja-JP' : 'en-US' }), errors = [];
      await page.addInitScript(() => { window.__hold = true; });
      page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(120000);
      await page.route('https://**/*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0}' }));
      await page.goto(base + map + `?guidedEntry=1&lang=${lang}&controlsGuide=1`);
      await page.waitForFunction(() => window.skyGuidedIntro?.choice === 'choose' && __game.mode === 'play');
      assert.equal(await page.evaluate(() => window.skyControlsGuide.visible), false, id + ': hidden while choosing');
      await page.locator(`[data-learn-adopt="${mode}"]`).click();
      assert.equal(await page.evaluate(() => window.skyControlsGuide.visible), true, id + ': guide shown after the pick');
      assert.equal(await page.evaluate(() => skyGuidedIntro.trial), true, id + ': the course waits for "Got it"');
      const info = await page.evaluate(() => { const r = document.getElementById('controlsGuide'); return { kind: r.dataset.kind, mode: r.dataset.mode, blocks: r.querySelectorAll('.cg-block').length, keys: [...r.querySelectorAll('kbd')].map(k => k.textContent), text: r.innerText, mouse: r.querySelectorAll('.cg-mouse').length,
        box: [...r.querySelectorAll('.cg-block,.cg-ok')].every(e => { const b = e.getBoundingClientRect(); return b.left >= 0 && b.top >= 0 && b.right <= innerWidth + 1 && b.bottom <= innerHeight + 1; }) }; });
      assert.equal(info.kind, touch ? 'touch' : 'pc'); assert.equal(info.mode, mode); assert.ok(info.box, id + ': everything fits on screen');
      if (!touch) {
        assert.ok(['W', 'A', 'S', 'D', 'Q', 'E', 'Space', '1', '2', '3', '4'].every(k => info.keys.includes(k)), id + ': all the keys are pictured');
        assert.equal(info.blocks, 6); assert.equal(info.mouse, mode === 'before' ? 2 : 1, id + ': mouse look only when the camera is yours (right-click mouse is always there)');
      } else assert.equal(info.blocks, 4);
      if (lang === 'en') assert.ok(!/[ぁ-んァ-ン一-龥]/.test(info.text), id + ': English screen has no Japanese: ' + info.text.replace(/\n/g, ' | '));
      await page.screenshot({ path: `${out}/${id}.png` });
      await page.locator('.cg-ok').click();
      await page.waitForFunction(() => skyGuidedIntro.trial === false, null, { timeout: 30000 });
      assert.equal(await page.evaluate(() => window.skyControlsGuide.visible), false, id + ': closed');
      assert.deepEqual(errors, []);
      console.log('PASS controls guide', id);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
