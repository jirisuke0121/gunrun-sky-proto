const assert = require('node:assert/strict'), fs = require('node:fs'), { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite'), { chromium } = require('playwright');
const base = 'http://127.0.0.1:8793/';
(async () => {
  const { default: worker } = await import('../server/worker.js');
  let browser, server; const evidence = [];
  try {
    server = spawn('python3', ['-m', 'http.server', '8793', '--bind', '127.0.0.1'], { stdio: 'ignore' });
    for (let i = 0; i < 50; i++) { if (await fetch(base).then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=user-gesture-required'] });
    for (const touch of [false, true]) for (const map of ['index.html', 'canyon.html']) {
      const db = new DatabaseSync(':memory:'); db.exec(fs.readFileSync('server/schema.sql', 'utf8'));
      const DB = { prepare(sql) { let args = []; return {
        bind(...values) { args = values; return this; },
        async first() { return db.prepare(sql).get(...args) || null; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
        async run() { return db.prepare(sql).run(...args); },
      }; } };
      const context = await browser.newContext({ viewport: { width: touch ? 844 : 1280, height: touch ? 390 : 720 }, hasTouch: touch, isMobile: touch });
      await context.addInitScript(() => { window.__hold = true; });
      const uploads = [], uploadStatuses = [];
      // Exercise the production Worker against a disposable DB. No QA scores or
      // diagnostics are sent to the live rankings.
      await context.route('https://gunrun-runs.jirisuke0121.workers.dev/**', async route => {
        const request = route.request(), options = { method: request.method(), headers: request.headers() };
        if (request.method() === 'POST') { options.body = request.postData(); uploads.push(JSON.parse(options.body)); }
        const response = await worker.fetch(new Request(request.url(), options), { DB }, {});
        if (request.method() === 'POST') uploadStatuses.push(response.status);
        await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
      });
      const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
      page.setDefaultTimeout(60000); await page.goto(base + map);
      await page.waitForFunction(() => window.__game && window.skyReplay && window.skyAudioRecovery && window.skyDecoy && window.skyRunRecording, null, { timeout: 120000 });
      const selectors = map === 'index.html'
        ? await page.locator('.parkour-spot-list button').evaluateAll(nodes => nodes.map(node => `[data-route="${node.dataset.route}"]`))
        : ['#bStart'];
      if (map === 'index.html') {
        const menu = await page.locator('.parkour-spot-list button').allTextContents();
        assert.deepEqual(menu.map(name => Number(name[0].normalize('NFKC'))), [2, 3, 4, 4, 5, 6, 7, 8]);
        const boxes = await page.locator('.parkour-spot-list button').evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, height: r.height }; }));
        assert.ok(boxes.every((b, i) => !i || b.y >= boxes[i - 1].y + boxes[i - 1].height));
      }
      for (const selector of selectors) {
        await page.locator(selector).click();
        await page.waitForFunction(() => __skyInternals.Ut.ctx?.state === 'running');
        const start = await page.evaluate(selector => {
          const sky = __skyInternals, route = window.skyOldTownSwingCourse?.routes.find(r => selector.includes(`"${r.id}"`));
          if (sky.modeRef() !== 'play' || skyChallenge.debug) throw Error('spot entered preview');
          if (route && (Math.hypot(sky.c.pos.x - route.approach[0], sky.c.pos.z - route.approach[2]) > .01 || Math.abs(sky.c.pos.y - route.approach[1] - .01) > .01)) throw Error('wrong start position');
          if (Math.hypot(sky.c.safe.x - sky.c.pos.x, sky.c.safe.y - sky.c.pos.y, sky.c.safe.z - sky.c.pos.z) > .01) throw Error('wrong respawn position');
          // Local host disables uploads by default. The route above is a
          // disposable test server, so enable the real recorder for this test.
          sky.U.sendLog = true; sky.c.invuln = 1e9;
          const position = [sky.c.pos.x, sky.c.pos.y, sky.c.pos.z];
          return { position, volume: sky.U.volume, state: sky.Ut.ctx.state };
        }, selector);
        // Measure an actual game effect through the native audio graph.
        const peak = await page.evaluate(async () => {
          const sky = __skyInternals, a = sky.Ut.ctx.createAnalyser(); sky.Ut.master.connect(a);
          sky.Tt.jump(); await new Promise(r => setTimeout(r, 30));
          const pcm = new Float32Array(a.fftSize); a.getFloatTimeDomainData(pcm); sky.Ut.master.disconnect(a);
          return Math.max(...pcm.map(Math.abs));
        });
        assert.ok(peak > .001, 'spot start produces game audio without using the ordinary Start button');
        await page.evaluate(full => {
          const g = __game;
          if(full){for(let i=0;i<7300&&!g.GAME.over;i++){g.advance(1/60);skyReplay.update(1/60);}}
          else{g.GAME.t=119.98;g.advance(.04);g.advance(.04);}
          g.advance(1.5);
        }, selector===selectors[0]);
        await page.waitForFunction(() => __skyInternals.modeRef() === 'over');
        await page.waitForFunction(() => window.skyRunRecording.history[0]?.receiptId);
        await page.locator('#unityMore').click();
        await page.waitForFunction(() => document.querySelector('#resultRanking li.me .rank-clear')?.textContent.includes('Normal クリア'));
        assert.equal(uploadStatuses.at(-1), 200); assert.equal(uploads.at(-1).reason, 'time');
        assert.equal(uploads.at(-1).challenge.version, 'corridor-parkour-v8');
        if(selector===selectors[0])assert.ok(uploads.at(-1).ghost.samples.length>1800,'full 120-second recorder path, not only a final-time shortcut');
        assert.deepEqual(uploads.at(-1).ghost.samples[0].slice(1, 4), start.position.map(n => Math.round(n * 1000) / 1000));
        evidence.push({ map, touch, selector, ...start, peak, uploadBytes: Buffer.byteLength(JSON.stringify(uploads.at(-1))), ranking: 'Normal clear' });
        await page.locator('#unityDetailsBack').click(); await page.locator('#unityMenu').click();
      }
      assert.deepEqual(errors, []); await context.close(); db.close();
    }
    fs.mkdirSync('browser-evidence', { recursive: true });
    fs.writeFileSync('browser-evidence/ranked-spots.json', JSON.stringify(evidence, null, 2)); console.log(JSON.stringify(evidence, null, 2));
  } finally { await browser?.close(); server?.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
