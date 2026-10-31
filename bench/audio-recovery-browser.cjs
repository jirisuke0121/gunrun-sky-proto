const fs = require('node:fs'), assert = require('node:assert/strict'), { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const base = 'http://127.0.0.1:8792/';
(async () => {
  let browser, server; const results = [];
  try {
    server = spawn('python3', ['-m', 'http.server', '8792', '--bind', '127.0.0.1'], { stdio: 'ignore' });
    for (let i = 0; i < 50; i++) { if (await fetch(base).then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=user-gesture-required'] });
    for (const map of ['index.html', 'canyon.html']) for (const touch of [false, true]) {
      const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: touch, isMobile: touch });
      await context.addInitScript(() => { window.__hold = true; });
      await context.route('https://**/*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0,"ok":true}' }));
      const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(base + map);
      await page.waitForFunction(() => window.skyAudioRecovery && window.skyDecoy, null, { timeout: 120000 });
      assert.equal(await page.evaluate(() => __skyInternals.Ut.ctx), null);
      await page.locator('#bStart').click();
      await page.waitForFunction(() => __skyInternals.Ut.ctx?.state === 'running');
      await page.evaluate(() => {
        const a = __skyInternals.Ut;
        window.originalAudio = { ctx: a.ctx, master: a.master, noise: a.noise, wind: a.wind };
        window.realResume = a.ctx.resume.bind(a.ctx);
        __skyInternals.U.volume = a.master.gain.value = .35;
      });
      for (const event of ['visibilitychange', 'pageshow', 'focus']) {
        await page.evaluate(async event => {
          await __skyInternals.Ut.ctx.suspend();
          (event === 'visibilitychange' ? document : window).dispatchEvent(new Event(event));
        }, event);
        await page.waitForFunction(() => __skyInternals.Ut.ctx.state === 'running');
      }
      // Reproduce a never-settling foreground request, then use real browser input.
      await page.evaluate(async () => {
        const ctx = __skyInternals.Ut.ctx; await ctx.suspend();
        ctx.resume = () => new Promise(() => {});
        window.dispatchEvent(new Event('focus'));
        ctx.resume = realResume;
      });
      if (touch) await page.touchscreen.tap(420, 180); else await page.keyboard.press('KeyA');
      await page.waitForFunction(() => __skyInternals.Ut.ctx.state === 'running');
      // Chromium has no iOS interrupted state; expose it over a truly suspended
      // native context, then verify that recovery invokes its real resume().
      await page.evaluate(async () => {
        const ctx = __skyInternals.Ut.ctx; await ctx.suspend();
        let interrupted = true;
        Object.defineProperty(ctx, 'state', { configurable: true, get() { return interrupted ? 'interrupted' : 'running'; } });
        ctx.resume = () => realResume().then(() => { interrupted = false; delete ctx.state; ctx.resume = realResume; });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await page.waitForFunction(() => __skyInternals.Ut.ctx.state === 'running');
      const evidence = await page.evaluate(async () => {
        const a = __skyInternals.Ut, ctx = a.ctx;
        if (!Object.entries(originalAudio).every(([key, node]) => a[key] === node)) throw Error('audio graph was replaced');
        if (__skyInternals.U.volume !== .35 || a.master.gain.value !== .35) throw Error('volume was changed');
        const analyser = ctx.createAnalyser(); a.master.connect(analyser);
        const oscillator = ctx.createOscillator(), amp = ctx.createGain(); amp.gain.value = .1;
        oscillator.connect(amp); amp.connect(a.master); oscillator.start();
        await new Promise(r => setTimeout(r, 120));
        const data = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(data);
        oscillator.stop(); amp.disconnect(); a.master.disconnect(analyser);
        const peak = Math.max(...data.map(Math.abs));
        __skyInternals.U.volume = a.master.gain.value = 0;
        await ctx.suspend(); skyAudioRecovery.resume('muted-check');
        await new Promise(r => setTimeout(r, 100));
        return { peak, state: ctx.state, volume: __skyInternals.U.volume, gain: a.master.gain.value, recovery: { ...skyAudioRecovery.stats } };
      });
      assert.ok(evidence.peak > .005, 'real rendered audio is nonzero after recovery');
      assert.equal(evidence.state, 'running'); assert.equal(evidence.volume, 0); assert.equal(evidence.gain, 0);
      assert.deepEqual(errors, []); results.push({ map, touch, ...evidence, errors }); await context.close();
    }
    fs.mkdirSync('browser-evidence', { recursive: true });
    fs.writeFileSync('browser-evidence/audio-recovery.json', JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
  } finally { await browser?.close(); server?.kill(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
