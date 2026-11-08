// 起動直後に旧開始画面（組み替え前の #ovStart）を見せない。
// home-focus.js の読み込みを止めた状態で最初の描画を調べる。
const assert = require('node:assert/strict'), fs = require('node:fs'), { spawn } = require('node:child_process'), { chromium } = require('playwright');
const base = 'http://127.0.0.1:8798/', out = 'browser-evidence/home-first-paint';
fs.mkdirSync(out, { recursive: true });
const deferred = () => { let release; const promise = new Promise(r => release = r); return { promise, release }; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Loading is deliberately suspended here. Playwright's font-ready wait can
// depend on that same document completing; capture the currently painted
// viewport directly instead of waiting for a finished document.
async function capturePending(page, path) {
  const cdp = await page.context().newCDPSession(page);
  try {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path, Buffer.from(data, 'base64'));
  } finally { await cdp.detach(); }
}

(async () => {
  let browser, server; const results = [];
  try {
    server = spawn('python3', ['-m', 'http.server', '8798', '--bind', '127.0.0.1'], { stdio: 'ignore' });
    for (let i = 0; i < 60; i++) { if (await fetch(base).then(r => r.ok, () => false)) break; await sleep(100); }
    for (const file of ['index.html', 'canyon.html', 'home-focus.js']) assert.equal(await fetch(base + file).then(r => r.text()), fs.readFileSync(file, 'utf8'), 'local server source: ' + file);
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

    // home-focus.js の応答を止めた状態でページを開く。gate.release() で読み込みを再開する。
    async function open(map, query) {
      const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1280, height: 720 } });
      const gate = deferred(), errors = [];
      await ctx.route('**/*', async route => {
        const u = new URL(route.request().url());
        if (u.origin !== new URL(base).origin) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
        if (u.pathname.endsWith('/home-focus.js')) await gate.promise;
        return route.continue();
      });
      const page = await ctx.newPage(); page.setDefaultTimeout(60000); page.on('pageerror', e => errors.push(e.message));
      await page.goto(base + map + query, { waitUntil: 'commit' });
      await page.waitForSelector('#ovStart', { state: 'attached' });
      await sleep(900);
      return { ctx, page, gate, errors };
    }

    for (const map of ['index.html', 'canyon.html']) for (const query of ['', '?onboarding=auto']) {
      const label = `${map}${query}`;
      // 1) 組み替え前：旧開始画面も初回スプラッシュも見えない
      const a = await open(map, query);
      const before = await a.page.evaluate(() => ({
        hero: !!document.getElementById('homeHero'),
        start: document.getElementById('ovStart') && getComputedStyle(document.getElementById('ovStart')).visibility,
        oldTitle: document.querySelector('#ovStart .eyebrow')?.checkVisibility({ visibilityProperty: true }) === true,
        oldBtn: document.getElementById('bStart')?.checkVisibility({ visibilityProperty: true }) === true,
      }));
      await capturePending(a.page, `${out}/${map.replace('.html', '')}${query ? '-first' : ''}-before-lobby.png`);
      assert.equal(before.hero, false, label + ': home-focus を止めている間は新ホームは未構築');
      assert.equal(before.start, 'hidden', label + ': 組み替え前の #ovStart は非表示');
      assert.equal(before.oldTitle, false, label + ': 旧タイトル（GunRun 追跡の試作）が見えない');
      assert.equal(before.oldBtn, false, label + ': 旧レイアウトの開始ボタンが見えない');
      // 2) 組み替え後：新ホームが表示される（旧画面を挟まない）
      a.gate.release();
      await a.page.waitForFunction(() => document.body.dataset.skyHomeFocus === 'true');
      await a.page.waitForFunction(() => !document.documentElement.classList.contains('sky-home-pending'));
      await sleep(300);
      const after = await a.page.evaluate(() => ({
        start: getComputedStyle(document.getElementById('ovStart')).visibility,
        hero: document.getElementById('homeHero')?.checkVisibility({ visibilityProperty: true }) === true,
        splash: !!document.getElementById('onbSplash'),
      }));
      await a.page.screenshot({ path: `${out}/${map.replace('.html', '')}${query ? '-first' : ''}-after-lobby.png` });
      assert.equal(after.start, 'visible', label + ': 組み替え後は #ovStart が表示される');
      assert.equal(after.hero, true, label + ': 新ホームが表示される');
      if (query) assert.equal(after.splash, true, label + ': 初回はスプラッシュが出る');
      assert.deepEqual(a.errors, [], label + ': ページエラーなし');
      await a.ctx.close(); results.push(label);
    }

    // 3) 読み込みが終わらなくても、一定時間後には画面が出る（操作不能にならない）
    {
      const b = await open('index.html', '');
      assert.equal(await b.page.evaluate(() => getComputedStyle(document.getElementById('ovStart')).visibility), 'hidden', '待機中は非表示');
      await sleep(7000);
      assert.equal(await b.page.evaluate(() => getComputedStyle(document.getElementById('ovStart')).visibility), 'visible', '6秒を過ぎたら必ず表示される');
      b.gate.release(); await b.ctx.close(); results.push('fallback');
    }

    // 4) 練習場（?practice=1）でも開始画面が最終的に表示される
    {
      const c = await open('index.html', '?practice=1');
      c.gate.release();
      await c.page.waitForFunction(() => !document.documentElement.classList.contains('sky-home-pending'));
      assert.equal(await c.page.evaluate(() => getComputedStyle(document.getElementById('ovStart')).visibility), 'visible', '練習場の開始画面が表示される');
      await c.ctx.close(); results.push('practice');
    }
    console.log('home first paint OK:', results.join(', '));
  } finally { await browser?.close(); server?.kill(); }
})().catch(error => { console.error(error); process.exit(1); });
