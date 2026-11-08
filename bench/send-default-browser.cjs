// 記録送信は既定でオン。以前に保存された「オフ」は端末ごとに一度だけオンへ戻し、その後に自分でオフにした設定は保たれる。
// ローカル（127.0.0.1 / localhost）の試走は従来どおり送信しない。両マップで確認する。
const assert = require('node:assert/strict'), { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const port = process.env.SEND_DEFAULT_PORT || '8875';

(async () => {
  const server = spawn('python3', ['-m', 'http.server', port, '--bind', '127.0.0.1'], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { if (await fetch(`http://127.0.0.1:${port}/`).then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--unsafely-treat-insecure-origin-as-secure=http://gunrun.test'] });
  const read = page => page.evaluate(() => ({ live: __game.S.sendLog, saved: JSON.parse(localStorage.getItem('gunrun-sky-proto-v1') || '{}').sendLog, done: localStorage.getItem('gunrun-send-default-20261108') }));
  try {
    for (const map of ['index.html', 'canyon.html']) {
      // 公開と同じ扱いのホスト名（localhost 以外）。
      const context = await browser.newContext({ viewport: { width: 480, height: 270 } });
      await context.addInitScript(() => { window.__hold = true; if (!localStorage.getItem('seeded')) { localStorage.setItem('seeded', '1'); localStorage.setItem('gunrun-sky-proto-v1', JSON.stringify({ sendLog: false })); } });
      await context.route('**/*', async route => { const u = new URL(route.request().url());
        if (u.hostname === 'gunrun.test') { const r = await fetch(`http://127.0.0.1:${port}${u.pathname}${u.search}`); return route.fulfill({ status: r.status, headers: { 'content-type': r.headers.get('content-type') || 'text/plain' }, body: Buffer.from(await r.arrayBuffer()) }); }
        if (u.hostname === '127.0.0.1') return route.continue();
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0,"ok":true}' }); });
      const page = await context.newPage(); page.setDefaultTimeout(120000); const errors = []; page.on('pageerror', e => errors.push(e.message));
      const open = async () => { await page.goto(`http://gunrun.test/${map}`, { waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.__game && window.skyPerfTrace); await page.waitForTimeout(500); };
      await open();
      let state = await read(page);
      assert.deepEqual(state, { live: true, saved: true, done: '1' }, `${map}: a saved off is reset to on once`);
      // 自分でオフにした設定は、次の起動でも保たれる。
      await page.evaluate(() => { __game.S.sendLog = false; __skyInternals.Ua(); });
      await open();
      state = await read(page);
      assert.equal(state.live, false, `${map}: off chosen after the reset stays off`); assert.equal(state.saved, false);
      // 設定を保存していない新しい端末は、既定でオン。
      const fresh = await browser.newContext({ viewport: { width: 480, height: 270 } });
      await fresh.addInitScript(() => { window.__hold = true; });
      await fresh.route('**/*', async route => { const u = new URL(route.request().url());
        if (u.hostname === 'gunrun.test') { const r = await fetch(`http://127.0.0.1:${port}${u.pathname}${u.search}`); return route.fulfill({ status: r.status, headers: { 'content-type': r.headers.get('content-type') || 'text/plain' }, body: Buffer.from(await r.arrayBuffer()) }); }
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0,"ok":true}' }); });
      const fp = await fresh.newPage(); await fp.goto(`http://gunrun.test/${map}`, { waitUntil: 'domcontentloaded' }); await fp.waitForFunction(() => window.__game); 
      assert.equal((await fp.evaluate(() => __game.S.sendLog)), true, `${map}: new device sends by default`);
      await fresh.close();
      // ローカルの試走は従来どおり送信しない（移行もしない）。
      const local = await browser.newContext({ viewport: { width: 480, height: 270 } });
      await local.addInitScript(() => { window.__hold = true; });
      await local.route('https://**/*', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0,"ok":true}' }));
      const lp = await local.newPage(); await lp.goto(`http://127.0.0.1:${port}/${map}`, { waitUntil: 'domcontentloaded' }); await lp.waitForFunction(() => window.__game && window.skyPerfTrace);
      const ls = await lp.evaluate(() => ({ live: __game.S.sendLog, done: localStorage.getItem('gunrun-send-default-20261108') }));
      assert.deepEqual(ls, { live: false, done: null }, `${map}: local trial runs do not send`);
      await local.close();
      assert.deepEqual(errors, [], `${map}: no page errors`);
      await context.close();
      console.log('PASS ' + map);
    }
    console.log('send default: ok');
  } finally { await browser.close(); server.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
