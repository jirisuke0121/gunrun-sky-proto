// 実機計測：既定で全員、実際の描画ループの内訳が diagnostics.perf に載る。channel は production のまま（順位に影響しない）。
// ?perf=0 でその端末だけ止まり、?perf=1 で戻る。両マップで確認する。
const assert = require('node:assert/strict'), { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const port = process.env.PERF_TRACE_PORT || '8874', base = `http://127.0.0.1:${port}/`;

(async () => {
  const server = spawn('python3', ['-m', 'http.server', port, '--bind', '127.0.0.1'], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { if (await fetch(base).then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  // Real requestAnimationFrame loop (no __hold). Returns the run record that would be sent after `seconds`.
  async function play(context, url, seconds, { fake = false } = {}) {
    const page = await context.newPage(), posts = [];
    page.on('pageerror', e => errors.push(url + ': ' + e.message));
    await page.route('https://**/*', route => { if (route.request().method() === 'POST') posts.push(route.request().postData());
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"top":[],"total":0,"recordProtocol":2}' }); });
    await page.goto(base + url);
    await page.waitForFunction(() => window.__game && window.skyPerfTrace && !document.getElementById('bStart').disabled, null, { timeout: 180000 });
    const badge = await page.evaluate(() => [...document.querySelectorAll('div')].some(d => d.textContent === '計測中 (dev)'));
    const on = await page.evaluate(() => window.skyPerfTrace.on);
    await page.evaluate(() => { const g = __game; Object.assign(g.S, g.DEF, { sendLog: true, autoFire: false, aimAuto: false }); g.startGame(); g.P.invuln = 1e9; });
    await page.waitForTimeout(seconds * 500);
    await page.evaluate(() => { const g = __game, c = g.P, n = g.NAV.nodes.filter(m => Math.abs(m.y - c.pos.y) < .5 && Math.hypot(m.x - c.pos.x, m.z - c.pos.z) > 6 && Math.hypot(m.x - c.pos.x, m.z - c.pos.z) < 14).slice(0, 3);
      for (const m of n) { const z = new g.Zombie(m.x, m.y + .01, m.z); z.spawnT = 0; g.zombies.push(z); } });
    await page.waitForTimeout(seconds * 500);
    if (fake) await page.evaluate(() => window.skyPerfTrace.frame(990, __game.GAME.t, true, 950));
    await page.evaluate(async () => { __game.endGame('quit'); await new Promise(r => setTimeout(r, 1500)); });
    // The previous run's unconfirmed record can be re-sent on load; the one just ended is the last.
    const body = posts.map(p => { try { return JSON.parse(p); } catch { return null; } }).filter(b => b && 'diagnostics' in b).pop();
    await page.close();
    return { body, badge, on };
  }

  try {
    const context = await browser.newContext({ viewport: { width: 480, height: 270 } });
    // 既定（引数なし）：計測が付き、channel は production のまま。
    const on = await play(context, 'index.html', 8, { fake: true });
    assert.equal(on.on, true, 'on by default'); assert.equal(on.badge, false, 'no badge');
    assert.equal(on.body.channel, 'production', 'the ranking is not affected');
    const perf = on.body.diagnostics?.perf;
    assert.ok(perf && perf.schema === 1 && perf.buckets.length >= 1, 'perf block with at least one window: ' + JSON.stringify(perf)?.slice(0, 200));
    for (const b of perf.buckets) {
      assert.ok(b.n > 0 && b.iv > 0 && b.cpu >= 0, 'bucket counts: ' + JSON.stringify(b).slice(0, 160));
      for (const k of ['adv', 'cam', 'hv', 'render', 'ai', 'so']) assert.ok(Array.isArray(b.s[k]) && b.s[k].every(Number.isFinite), 'section ' + k);
      assert.ok(b.s.adv[0] + b.s.cam[0] + b.s.hv[0] + b.s.render[0] <= b.cpu + 1, 'exclusive sections fit inside the frame: ' + JSON.stringify(b.s) + ' cpu ' + b.cpu);
      assert.ok(b.s.ai[0] <= b.s.adv[0] + 1, 'zombie updates run inside the game step');
    }
    assert.ok(perf.buckets.some(b => b.s.adv[0] > 0) && perf.buckets.some(b => b.s.render[0] > 0), 'game step and draw were measured');
    assert.ok(perf.buckets.some(b => b.zMax > 0), 'zombie updates were measured (prototype wrapped after modules loaded)');
    const fakeFrame = perf.worst.find(w => w.cpu === 950 && w.iv === 990);
    assert.ok(fakeFrame, 'slow frames are kept');
    assert.ok(fakeFrame.ctx && fakeFrame.ctx.p.length === 3 && fakeFrame.ctx.p.every(Number.isFinite) && fakeFrame.ctx.m === 'play', 'slow frames carry the place: ' + JSON.stringify(fakeFrame.ctx));
    assert.ok(Number.isFinite(perf.timerMs) || perf.timerMs === null, 'timer resolution recorded');
    assert.ok(on.body.diagnostics.jumps && on.body.diagnostics.frames, 'the existing diagnostics are still there');
    assert.ok(JSON.stringify(perf).length < 40000, 'perf block is small');
    console.log('PASS default on: channel=' + on.body.channel + ', ' + perf.buckets.length + ' windows, cpu ' + perf.buckets.map(b => b.cpu).join('/') + ' ms, worst ' + perf.worst.length + ', record ' + JSON.stringify(perf).length + ' B');

    // ?perf=0：この端末だけ止まる（保存され、引数なしでも止まったまま）。?perf=1 で戻る。
    const stopped = await play(context, 'index.html?perf=0', 4);
    assert.equal(stopped.on, false); assert.equal(stopped.body.channel, 'production'); assert.ok(!stopped.body.diagnostics || !('perf' in stopped.body.diagnostics), 'no perf block when stopped');
    const still = await play(context, 'index.html', 4);
    assert.equal(still.on, false, 'the stop is remembered on this device'); assert.ok(!still.body.diagnostics || !('perf' in still.body.diagnostics));
    const back = await play(context, 'index.html?perf=1', 6);
    assert.equal(back.on, true); assert.equal(back.body.channel, 'production'); assert.ok(back.body.diagnostics?.perf?.buckets.length >= 1);
    console.log('PASS ?perf=0 stops this device, ?perf=1 resumes');

    // 渓谷でも同じ。
    const canyon = await play(context, 'canyon.html', 8);
    assert.equal(canyon.body.channel, 'production'); assert.ok(canyon.body.diagnostics?.perf?.buckets.length >= 1, 'canyon: perf block');
    console.log('PASS canyon: ' + canyon.body.diagnostics.perf.buckets.length + ' windows');
    assert.deepEqual(errors, [], 'no page errors');
    await context.close();
    console.log('perf trace browser: ok');
  } finally { await browser.close(); server.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
