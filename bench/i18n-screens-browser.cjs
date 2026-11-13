// Pause menu (every tab) and the result screen: no Japanese on screen in any language (the "＋" sign is a symbol).
const assert = require('node:assert/strict'), { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const port = Number(process.env.SKY_TEST_PORT || 18822), base = `http://127.0.0.1:${port}/`;
const LOCALES = { en: 'en-US', th: 'th-TH', vi: 'vi-VN', pt: 'pt-BR', tr: 'tr-TR', es: 'es-ES' };
(async () => {
  let browser, server;
  try {
    server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { stdio: 'ignore' });
    for (let i = 0; i < 60; i++) { if (await fetch(base).then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const visible = page => page.evaluate(() => {
      const JP = /[぀-ヿ一-鿿＀-￯]/, out = [], w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n; (n = w.nextNode());) { const e = n.parentNode; if (JP.test(n.nodeValue) && !['SCRIPT', 'STYLE', 'TEXTAREA', 'OPTION'].includes(e.nodeName) && !e.closest('#langToggle') && e.checkVisibility({ checkVisibilityCSS: true })) out.push(n.nodeValue.trim()); }
      for (const e of document.querySelectorAll('[aria-label],[title]')) for (const a of ['aria-label', 'title']) { const v = e.getAttribute(a); if (v && JP.test(v) && e.checkVisibility() && e.id !== 'langToggle') out.push('@' + a + ':' + v); }
      return out.filter(t => t !== '＋');
    });
    for (const map of ['index.html', 'canyon.html']) for (const lang of Object.keys(LOCALES)) {
      console.log(map, lang);
      const ctx = await browser.newContext({ locale: LOCALES[lang], viewport: { width: 1280, height: 720 } });
      await ctx.addInitScript(() => { window.__hold = true; });
      await ctx.route('https://**/*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0}' }));
      const page = await ctx.newPage(); page.setDefaultTimeout(60000);
      await page.goto(`${base}${map}?lang=${lang}`); await page.waitForFunction(() => window.__game && window.skyStartReadiness?.ready);
      await page.click('#bStart'); await page.waitForFunction(() => __game.mode === 'play'); await page.waitForTimeout(600);
      await page.evaluate(() => __game.setMode('pause')); await page.waitForTimeout(400);
      assert.deepEqual(await visible(page), [], `${map} ${lang}: pause menu`);
      const tabs = await page.$$('.ps-tab'); assert.ok(tabs.length >= 3, 'pause tabs exist');
      for (let i = 0; i < tabs.length; i++) { await page.evaluate(n => document.querySelectorAll('.ps-tab')[n].click(), i); await page.waitForTimeout(150); assert.deepEqual(await visible(page), [], `${map} ${lang}: pause tab ${i}`); }
      await page.evaluate(() => __game.setMode('play'));
      await page.evaluate(() => { __game.endGame('caught'); __game.advance(1.5); }); await page.waitForTimeout(1200);
      assert.deepEqual(await visible(page), [], `${map} ${lang}: result screen`);
      await ctx.close();
    }
    console.log('i18n screens checks passed');
  } finally { await browser?.close(); server?.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
