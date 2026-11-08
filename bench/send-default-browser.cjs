// 記録送信はオフにできない。保存済みの「オフ」は起動のたびにオンへ戻り、設定の切替・チェックボックス・停止の案内は無い。
// チュートリアル後の固定カメラ保存でも通信は止めない（hybrid の比較試作とローカルだけ止める）。両マップで確認する。
// ローカル（127.0.0.1 / localhost）の試走は従来どおり送信しない。
const assert = require('node:assert/strict'), { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const port = process.env.SEND_DEFAULT_PORT || '8875';

(async () => {
  const server = spawn('python3', ['-m', 'http.server', port, '--bind', '127.0.0.1'], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { if (await fetch(`http://127.0.0.1:${port}/`).then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--unsafely-treat-insecure-origin-as-secure=http://gunrun.test'] });
  const read = page => page.evaluate(() => ({ live: __game.S.sendLog, saved: JSON.parse(localStorage.getItem('gunrun-sky-proto-v1') || '{}').sendLog }));
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
      assert.deepEqual(state, { live: true, saved: true }, `${map}: a saved off is reset to on`);
      // 切替はなく、保存し直しても次の起動で必ずオンに戻る。
      await page.evaluate(() => { __game.S.sendLog = false; __skyInternals.Ua(); });
      await open();
      state = await read(page);
      assert.deepEqual(state, { live: true, saved: true }, `${map}: off cannot persist`);
      const ui = await page.evaluate(() => ({ toggle: !!document.getElementById('t_sendLog'), box: document.querySelectorAll('.record-delivery input').length, panels: document.querySelectorAll('.record-delivery').length,
        stop: /設定で停止|設定で変更/.test(document.body.innerText) }));
      assert.deepEqual(ui.toggle, false, `${map}: no send toggle in settings`); assert.equal(ui.box, 0, `${map}: no checkbox in record panels`);
      assert.ok(ui.panels >= 1, `${map}: record panel still shows status`); assert.equal(ui.stop, false, `${map}: no text about stopping the send`);
      // 設定を保存していない新しい端末は、既定でオン。
      const fresh = await browser.newContext({ viewport: { width: 480, height: 270 } });
      await fresh.addInitScript(() => { window.__hold = true; });
      await fresh.route('**/*', async route => { const u = new URL(route.request().url());
        if (u.hostname === 'gunrun.test') { const r = await fetch(`http://127.0.0.1:${port}${u.pathname}${u.search}`); return route.fulfill({ status: r.status, headers: { 'content-type': r.headers.get('content-type') || 'text/plain' }, body: Buffer.from(await r.arrayBuffer()) }); }
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0,"ok":true}' }); });
      const fp = await fresh.newPage(); fp.setDefaultTimeout(120000); await fp.goto(`http://gunrun.test/${map}`, { waitUntil: 'domcontentloaded' }); await fp.waitForFunction(() => window.__game); 
      assert.equal((await fp.evaluate(() => __game.S.sendLog)), true, `${map}: new device sends by default`);
      await fresh.close();
      // チュートリアル後の「固定カメラ」保存（URL に cameraTrial=fixed が復元される）でも、公開サイトではランキング・記録の通信を止めない。
      const saved = await browser.newContext({ viewport: { width: 480, height: 270 } }); const hits = [];
      await saved.addInitScript(() => { window.__hold = true; localStorage.setItem('gunrun-fixed-controls-v1', '1'); });
      await saved.route('**/*', async route => { const u = new URL(route.request().url());
        if (u.hostname === 'gunrun.test') { const r = await fetch(`http://127.0.0.1:${port}${u.pathname}${u.search}`); return route.fulfill({ status: r.status, headers: { 'content-type': r.headers.get('content-type') || 'text/plain' }, body: Buffer.from(await r.arrayBuffer()) }); }
        hits.push(u.hostname + u.pathname); return route.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0,"ok":true}' }); });
      const sp = await saved.newPage(); sp.setDefaultTimeout(120000); await sp.goto(`http://gunrun.test/${map}`, { waitUntil: 'domcontentloaded' }); await sp.waitForFunction(() => window.__game && window.skyPerfTrace);
      await sp.waitForTimeout(1500);
      const sv = await sp.evaluate(() => ({ trial: new URLSearchParams(location.search).get('cameraTrial'), notice: document.getElementById('homeSendNotice')?.textContent || '' }));
      assert.equal(sv.trial, 'fixed', `${map}: saved fixed controls restore cameraTrial=fixed`);
      assert.ok(!/試作|送信しません|not sent|trial/i.test(sv.notice) && /匿名|anonymous/.test(sv.notice), `${map}: notice says records are sent (${sv.notice})`);
      assert.ok(hits.some(h => h.includes('workers.dev')), `${map}: worker requests are not blocked for saved fixed controls (${hits.join(',')})`);
      await saved.close();
      // 比較用の hybrid 試作だけは従来どおり通信を止める。
      const hy = await browser.newContext({ viewport: { width: 480, height: 270 } }); const hyHits = [];
      await hy.addInitScript(() => { window.__hold = true; });
      await hy.route('**/*', async route => { const u = new URL(route.request().url());
        if (u.hostname === 'gunrun.test') { const r = await fetch(`http://127.0.0.1:${port}${u.pathname}${u.search}`); return route.fulfill({ status: r.status, headers: { 'content-type': r.headers.get('content-type') || 'text/plain' }, body: Buffer.from(await r.arrayBuffer()) }); }
        hyHits.push(u.hostname + u.pathname); return route.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0,"ok":true}' }); });
      const hp = await hy.newPage(); hp.setDefaultTimeout(120000); await hp.goto(`http://gunrun.test/${map}?cameraTrial=hybrid`, { waitUntil: 'domcontentloaded' }); await hp.waitForFunction(() => window.__game && window.skyPerfTrace);
      await hp.waitForTimeout(1500);
      assert.ok(!hyHits.some(h => h.includes('workers.dev')), `${map}: hybrid review trial sends nothing (${hyHits.join(',')})`);
      assert.match(await hp.evaluate(() => document.getElementById('homeSendNotice')?.textContent || ''), /試作|trial|comparison/i, `${map}: hybrid trial keeps its notice`);
      await hy.close();
      // ローカルの試走は従来どおり送信しない。
      const local = await browser.newContext({ viewport: { width: 480, height: 270 } });
      await local.addInitScript(() => { window.__hold = true; });
      await local.route('https://**/*', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0,"ok":true}' }));
      const lp = await local.newPage(); lp.setDefaultTimeout(120000); await lp.goto(`http://127.0.0.1:${port}/${map}`, { waitUntil: 'domcontentloaded' }); await lp.waitForFunction(() => window.__game && window.skyPerfTrace);
      const ls = await lp.evaluate(() => ({ live: __game.S.sendLog }));
      assert.deepEqual(ls, { live: false }, `${map}: local trial runs do not send`);
      await local.close();
      assert.deepEqual(errors, [], `${map}: no page errors`);
      await context.close();
      console.log('PASS ' + map);
    }
    console.log('send default: ok');
  } finally { await browser.close(); server.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
