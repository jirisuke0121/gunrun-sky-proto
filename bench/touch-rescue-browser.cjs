// ボタンの上で始まったタッチがキャンバスへ届いても、そのボタンの入力として扱う（touch-rescue.js）。
// 実機の記録では、ジャンプボタンの中心へのタップがキャンバスのタップ（フックの空振り）として届き、ジャンプが出ない例があった。
// ここでは、その届き方をキャンバスへ直接イベントを送って再現する。
const assert = require('node:assert/strict'), { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const port = process.env.TOUCH_RESCUE_PORT || '8879', base = `http://127.0.0.1:${port}/`;
(async () => {
  const server = spawn('python3', ['-m', 'http.server', port, '--bind', '127.0.0.1'], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { if (await fetch(base).then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  try {
    for (const url of ['index.html', 'canyon.html']) {
      const context = await browser.newContext({ locale: 'ja-JP', viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
      await context.addInitScript(() => { window.__hold = true; });
      await context.route('https://**/*', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"top":[],"total":0}' }));
      const page = await context.newPage();
      page.on('pageerror', e => errors.push(url + ': ' + e.message));
      await page.goto(base + url, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForFunction(() => window.__game && window.skyTouchRescue && !document.getElementById('bStart').disabled, null, { timeout: 180000 });
      const out = await page.evaluate(() => {
        const g = __game, c = g.P, canvas = document.getElementById('c'), probe = window.skyTelemetryProbe;
        g.S.sendLog = false; g.startGame(); c.invuln = Infinity;
        for (const enemy of g.zombies) { enemy.dead = true; enemy.remove = true; }
        g.GAME.spawnT = Infinity;
        for (let i = 0; i < 30; i++) g.advance(1 / 60);
        const jump = document.getElementById('tJump'), r = jump.getBoundingClientRect();
        const centre = [(r.left + r.right) / 2, (r.top + r.bottom) / 2];
        let id = 100;
        const send = (target, type, x, y, pointerId) => target.dispatchEvent(new PointerEvent(type, { pointerId, pointerType: 'touch', isPrimary: true,
          clientX: x, clientY: y, button: 0, buttons: type === 'pointerdown' ? 1 : 0, bubbles: true, cancelable: true }));
        const tap = (target, x, y) => { const p = id++; send(target, 'pointerdown', x, y, p); const down = jump.classList.contains('down'); send(target, 'pointerup', x, y, p); return down; };
        const counts = () => { const run = probe.inspect(); return { jumps: run.jumps.length, hooks: run.hooks.length, rescued: window.skyTouchRescue.stats.rescued }; };
        const result = { visible: jump.getClientRects().length > 0 && !document.getElementById('touch').hidden, rect: [r.left, r.top, r.width, r.height].map(Math.round) };
        const start = counts();
        // 1. The reported case: the touch starts on the jump button's centre but the canvas receives it.
        result.downShown = tap(canvas, centre[0], centre[1]);
        result.afterCanvasCentre = counts(); result.jumpBuffered = c.jumpBuf > 0;
        result.downCleared = !jump.classList.contains('down');
        // 2. Normal delivery to the button itself: exactly one jump, nothing forwarded twice.
        tap(jump, centre[0], centre[1]);
        result.afterButton = counts();
        // 3. The square corner outside the drawn circle is still the canvas (camera drag / hook tap).
        tap(canvas, r.left + 2, r.top + 2);
        result.afterCorner = counts();
        // 4. A tap far from any button is an ordinary canvas tap (recorded as a hook attempt).
        tap(canvas, 520, 120);
        result.afterFar = counts();
        // 5. A hidden button is never rescued (the slide button is hidden off a slope).
        const slide = document.getElementById('tSlide'); result.slideHidden = slide.hidden || !slide.getClientRects().length;
        const s = slide.getBoundingClientRect(); const before = counts();
        if (result.slideHidden) { slide.hidden = false; const shown = slide.getBoundingClientRect(); slide.hidden = true; tap(canvas, (shown.left + shown.right) / 2, (shown.top + shown.bottom) / 2); }
        result.afterHiddenSlide = counts(); result.beforeHiddenSlide = before;
        result.start = start; result.miss = g.recorder?.miss;
        return result;
      });
      assert.ok(out.visible, url + ': the touch controls are shown ' + JSON.stringify(out.rect));
      assert.equal(out.afterCanvasCentre.jumps - out.start.jumps, 1, url + ': a canvas-delivered press on the jump button jumps');
      assert.equal(out.afterCanvasCentre.hooks - out.start.hooks, 0, url + ': and is not a hook tap');
      assert.equal(out.afterCanvasCentre.rescued - out.start.rescued, 1, url + ': counted once');
      assert.ok(out.jumpBuffered && out.downShown && out.downCleared, url + ': the button shows the press and releases it ' + JSON.stringify(out));
      assert.equal(out.afterButton.jumps - out.afterCanvasCentre.jumps, 1, url + ': a normal press still jumps exactly once');
      assert.equal(out.afterButton.rescued, out.afterCanvasCentre.rescued, url + ': a normal press is not forwarded');
      assert.equal(out.afterCorner.jumps, out.afterButton.jumps, url + ': the corner outside the circle does not jump');
      assert.equal(out.afterFar.jumps, out.afterCorner.jumps, url + ': a far tap does not jump');
      assert.ok(out.afterFar.hooks > out.afterButton.hooks, url + ': ordinary canvas taps still reach the hook logic');
      assert.equal(out.afterHiddenSlide.rescued, out.beforeHiddenSlide.rescued, url + ': a hidden button is not rescued');
      console.log(`PASS ${url}: canvas-delivered jump press -> jump (+1), no hook tap; normal press +1; corner/far taps unchanged; hidden slide not rescued`);
      await context.close();
    }
    assert.deepEqual(errors, [], 'no page errors');
  } finally { await browser.close(); server.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
