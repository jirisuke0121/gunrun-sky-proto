// Languages: Auto detection, the selector, pack loading, and "no Japanese left on screen" for every language on both maps.
// "Left over" is judged against English: a language may not show more Japanese than English does.
const assert = require('node:assert/strict'), { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const port = Number(process.env.SKY_TEST_PORT || 18821), base = `http://127.0.0.1:${port}/`;
const LANGS = ['ja', 'en', 'th', 'vi', 'pt', 'tr', 'es'];
const HTML_LANG = { pt: 'pt-BR' };
const LOCALES = { ja: 'ja-JP', en: 'en-US', th: 'th-TH', vi: 'vi-VN', pt: 'pt-BR', tr: 'tr-TR', es: 'es-ES' };

(async () => {
  let browser, server;
  try {
    server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { stdio: 'ignore' });
    for (let i = 0; i < 60; i++) { if (await fetch(base).then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const open = async (ctx, url) => {
      const page = await ctx.newPage(); page.setDefaultTimeout(60000); page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
      await page.goto(base + url); await page.waitForFunction(() => window.__game && window.skyStartReadiness?.ready); return page;
    };
    const mk = (locale, init) => browser.newContext({ locale, viewport: { width: 1280, height: 720 } }).then(async ctx => {
      await ctx.addInitScript(() => { window.__hold = true; });
      if (init) await ctx.addInitScript(init);
      await ctx.route('https://**/*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0}' }));
      return ctx;
    });
    // Visible Japanese: text nodes (hidden panels included) and the attributes the translator covers, minus the language selector.
    const japanese = page => page.evaluate(() => {
      const JP = /[぀-ヿ一-鿿＀-￯]/, out = new Set();
      const walk = n => {
        if (n.nodeType === 3) { if (JP.test(n.nodeValue) && !['SCRIPT', 'STYLE', 'TEXTAREA', 'OPTION'].includes(n.parentNode.nodeName)) out.add(n.nodeValue.replace(/\s+/g, ' ').trim()); return; }
        if (n.nodeType !== 1 || ['SCRIPT', 'STYLE', 'TEXTAREA', 'OPTION'].includes(n.nodeName) || n.id === 'langToggle') return;
        for (const a of ['aria-label', 'title', 'placeholder']) { const v = n.getAttribute(a); if (v && JP.test(v)) out.add('@' + a + ':' + v); }
        for (const c of n.childNodes) walk(c);
      };
      walk(document.body);
      return [...out];
    });

    // Text nodes showing the English dictionary value while the language pack has its own translation (English fallback that stuck).
    const englishLeft = page => page.evaluate(() => {
      const en = window.skyI18nEn, pack = window.skyI18nPacks?.[window.skyI18n.lang], out = new Set(); if (!pack) return [];
      const own = new Set(Object.values(pack.exact)), vals = new Set(); for (const [jp, e] of Object.entries(en.exact)) if (pack.exact[jp] !== undefined && pack.exact[jp] !== e && !own.has(e)) vals.add(e);
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n; (n = w.nextNode());) { const t = n.nodeValue.replace(/\s+/g, ' ').trim(); if (t && vals.has(t) && !['SCRIPT', 'STYLE', 'OPTION'].includes(n.parentNode.nodeName)) out.add(t); }
      return [...out];
    });

    // 1. Auto follows the browser language, an explicit choice sticks, unknown languages fall back to English.
    for (const [locale, want] of [['ja-JP', 'ja'], ['th-TH', 'th'], ['vi-VN', 'vi'], ['pt-BR', 'pt'], ['pt-PT', 'pt'], ['tr-TR', 'tr'], ['es-MX', 'es'], ['en-GB', 'en'], ['fr-FR', 'en'], ['de-DE', 'en']]) {
      const ctx = await mk(locale), page = await open(ctx, 'index.html');
      const got = await page.evaluate(() => ({ lang: window.skyI18n.lang, pref: window.skyI18n.pref, html: document.documentElement.lang, select: document.getElementById('langToggle')?.value, packs: Object.keys(window.skyI18nPacks || {}) }));
      assert.equal(got.lang, want, `${locale} -> ${want}`);
      assert.equal(got.pref, 'auto'); assert.equal(got.select, 'auto'); assert.equal(got.html, HTML_LANG[want] || want);
      assert.deepEqual(got.packs, ['ja', 'en'].includes(want) ? [] : [want], `only the chosen language pack is loaded (${locale})`);
      assert.deepEqual(page.errors, [], `${locale}: no page errors`);
      await ctx.close();
    }

    // 2. Selector: eight options, choosing one reloads in that language and remembers it; a stored choice beats the browser.
    {
      const ctx = await mk('en-US'), page = await open(ctx, 'index.html');
      assert.deepEqual(await page.$$eval('#langToggle option', o => o.map(x => x.value + ':' + x.textContent)),
        ['auto:Auto', 'ja:日本語', 'en:English', 'th:ไทย', 'vi:Tiếng Việt', 'pt:Português (Brasil)', 'tr:Türkçe', 'es:Español']);
      assert.equal(await page.locator('#langToggle').isVisible(), true, 'the selector is visible on the home screen');
      await Promise.all([page.waitForNavigation(), page.selectOption('#langToggle', 'th')]);
      await page.waitForFunction(() => window.__game && window.skyStartReadiness?.ready);
      assert.equal(await page.evaluate(() => window.skyI18n.lang + '/' + window.skyI18n.pref + '/' + localStorage.getItem('sky.lang')), 'th/th/th');
      assert.equal(await page.locator('#langToggle').inputValue(), 'th');
      const page2 = await ctx.newPage(); await page2.goto(base + 'canyon.html'); await page2.waitForFunction(() => window.__game && window.skyStartReadiness?.ready);
      assert.equal(await page2.evaluate(() => window.skyI18n.lang), 'th', 'the choice carries over to the other map');
      await Promise.all([page2.waitForNavigation(), page2.selectOption('#langToggle', 'auto')]);
      await page2.waitForFunction(() => window.__game && window.skyStartReadiness?.ready);
      assert.equal(await page2.evaluate(() => window.skyI18n.lang + '/' + window.skyI18n.pref), 'en/auto', 'Auto goes back to the browser language');
      await ctx.close();
      // Old saved values ("en"/"ja") keep working; junk is ignored.
      const old = await mk('th-TH', () => { try { localStorage.setItem('sky.lang', 'en'); } catch {} });
      const p = await open(old, 'index.html'); assert.equal(await p.evaluate(() => window.skyI18n.lang), 'en'); await old.close();
      const junk = await mk('th-TH', () => { try { localStorage.setItem('sky.lang', 'klingon'); } catch {} });
      const q = await open(junk, 'index.html'); assert.equal(await q.evaluate(() => window.skyI18n.lang), 'th'); await junk.close();
    }

    // 3. No Japanese left over (home screen, then in play), per language and map, compared with English.
    const baseline = {};
    for (const map of ['index.html', 'canyon.html']) {
      for (const lang of ['en', ...LANGS.filter(l => l !== 'en')]) {
        const ctx = await mk(LOCALES[lang]), page = await open(ctx, `${map}?lang=${lang}`);
        assert.equal(await page.evaluate(() => document.documentElement.lang), HTML_LANG[lang] || lang);
        const home = await japanese(page);
        await page.click('#bStart'); await page.waitForFunction(() => __game.mode === 'play'); await page.waitForTimeout(500);
        await page.evaluate(() => { __game.GAME.t = 40; }); await page.waitForTimeout(400);
        const play = await japanese(page);
        if (lang !== 'ja' && lang !== 'en') assert.deepEqual([...await englishLeft(page)], [], `${map} ${lang}: English left on screen where the pack has a translation`);
        if (lang === 'ja') { assert.ok(home.length > 20, 'Japanese is left alone'); }
        else if (lang === 'en') baseline[map] = new Set([...home, ...play]);
        else {
          const extra = [...home, ...play].filter(s => !baseline[map].has(s));
          assert.deepEqual(extra, [], `${map} ${lang}: Japanese left on screen that English translates`);
          const title = await page.title(); assert.equal(title.includes('Zombie Parkour Escape'), true, `${lang}: title`);
          assert.equal(await page.evaluate(() => document.querySelector('.home-heading h1')?.textContent.replace(/\s+/g, '')), 'ZombieParkourEscape', `${map} ${lang}: the game name stays "Zombie Parkour Escape"`);
        }
        assert.deepEqual(page.errors, [], `${map} ${lang}: no page errors`);
        await ctx.close();
      }
      console.log(`${map}: English baseline leaves ${baseline[map].size} Japanese strings (shared by every language)`);
    }

    // 4. The guided course speaks the chosen language. Judged against English on the same page (some dev/tuning panels stay Japanese everywhere).
    let learnBase = null;
    for (const lang of ['en', 'th', 'vi', 'pt', 'tr', 'es']) {
      const ctx = await mk(LOCALES[lang]), page = await open(ctx, `canyon.html?learn=1&lang=${lang}&controlpick=0&guides=0&hookGuide=0`);
      await page.waitForTimeout(1500);
      const left = await japanese(page);
      if (lang === 'en') learnBase = new Set([...left, ...baseline['canyon.html']]);
      else assert.deepEqual(left.filter(s => !learnBase.has(s)), [], `learn course ${lang}: Japanese left that English translates`);
      const chapter = await page.evaluate(() => document.getElementById('learnChapter')?.textContent || '');
      assert.ok(chapter.length > 0 && !/[぀-ヿ一-鿿]/.test(chapter), `learn course ${lang}: chapter title is translated (${chapter})`);
      if (lang !== 'en') assert.notEqual(chapter, 'First steps', `${lang}: not the English fallback`);
      if (lang !== 'en') assert.deepEqual(await englishLeft(page), [], `learn ${lang}: English left on screen where the pack has a translation`);
      assert.deepEqual(page.errors, [], `learn ${lang}: no page errors`);
      await ctx.close();
    }
    console.log(`learn course: English leaves ${learnBase.size} Japanese strings (shared)`);
    // 6. Phones (touch): the course and the home screen have their own copy (stick, tap, buttons); every language, compared with English.
    {
      const touchBase = {};
      for (const lang of ['en', 'th', 'vi', 'pt', 'tr', 'es']) for (const url of ['canyon.html?learn=1&controlpick=0&guides=0&hookGuide=0', 'index.html']) {
        const ctx = await browser.newContext({ locale: LOCALES[lang], viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
        await ctx.addInitScript(() => { window.__hold = true; });
        await ctx.route('https://**/*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0}' }));
        const page = await open(ctx, `${url}${url.includes('?') ? '&' : '?'}lang=${lang}`); await page.waitForTimeout(1500);
        if (url.startsWith('canyon')) { await page.evaluate(() => document.getElementById('bStart')?.click()); await page.waitForTimeout(1500); }
        const left = new Set(await japanese(page));
        if (lang === 'en') touchBase[url] = left;
        else {
          assert.deepEqual([...left].filter(x => !touchBase[url].has(x)), [], `touch ${url} ${lang}: Japanese left that English translates`);
          assert.deepEqual(await englishLeft(page), [], `touch ${url} ${lang}: English left where the pack has a translation`);
        }
        await ctx.close();
      }
    }
    // 5. While the language pack is still loading (slow network) or fails, the screen shows Japanese or the chosen language, never a stuck English fallback.
    for (const lang of ['th', 'es']) {
      const ctx = await mk(LOCALES[lang]); let delay = true;
      await ctx.route(`**/i18n-${lang}.js*`, async r => { if (delay) await new Promise(x => setTimeout(x, 1500)); r.continue(); });
      const page = await ctx.newPage(); page.setDefaultTimeout(60000);
      await page.goto(base + `index.html?lang=${lang}`, { waitUntil: 'commit' });
      const seen = new Set();
      for (let i = 0; i < 30; i++) {
        await page.waitForTimeout(100);
        const t = await page.evaluate(() => [document.getElementById('bStart')?.textContent, document.getElementById('bIntro')?.textContent, document.getElementById('introReadyStatus')?.textContent].join('|')).catch(() => null);
        if (t) seen.add(t);
      }
      await page.waitForFunction(() => window.__game && window.skyStartReadiness?.ready);
      assert.deepEqual([...seen].filter(t => /Getting the|Loading character|Loading gun|Start practice/.test(t)), [], `${lang}: no stuck English while the pack loads`);
      assert.deepEqual(await japanese(page), [...(await japanese(page))].filter(s => baseline['index.html'].has(s)), `${lang}: after a slow pack load nothing translatable is left in Japanese`);
      assert.deepEqual(await englishLeft(page), [], `${lang}: no English left after a slow pack load`);
      await ctx.close();
    }
    // A pack that never arrives falls back to English instead of staying Japanese.
    {
      const ctx = await mk('th-TH'); await ctx.route('**/i18n-th.js*', r => r.abort());
      const page = await open(ctx, 'index.html?lang=th');
      const left = (await japanese(page)).filter(s => !baseline['index.html'].has(s));
      assert.deepEqual(left, [], 'a missing pack falls back to English');
      assert.equal(await page.evaluate(() => document.getElementById('bStart').textContent.trim()), 'Start (2 min)');
      await ctx.close();
    }
    console.log('i18n browser checks passed');
  } finally {
    await browser?.close(); server?.kill();
  }
})().catch(e => { console.error(e); process.exit(1); });
