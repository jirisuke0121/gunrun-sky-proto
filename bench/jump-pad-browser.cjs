// ジャンプ台: 台に立つと目印が出る → Bキーで跳ぶ → 高台に着地 → 追手(実AI)が追いつくまでの秒数を測る。
const assert = require('node:assert/strict'), fs = require('node:fs'), { spawn } = require('node:child_process'), { chromium } = require('playwright');
const { revealHomeControl } = require('./home-controls.cjs');
(async () => {
  const server = spawn('python3', ['-m', 'http.server', '8798', '--bind', '127.0.0.1'], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { if (await fetch('http://127.0.0.1:8798/').then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const context = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1280, height: 720 } });
    await context.addInitScript(() => { window.__hold = true; });
    await context.route('https://**/*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0,"ok":true}' }));
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(240000);
    await page.goto('http://127.0.0.1:8798/index.html?challengeDebug=1');
    await page.waitForFunction(() => window.__game && window.skySwing && window.skyJumpPads);
    const level = page.locator('[data-difficulty=normal]'); await revealHomeControl(page, level); await level.click(); await page.locator('#bStart').click();
    const result = await page.evaluate(() => {
      const g = __game, s = __skyInternals, c = g.P, dt = 1 / 120, pad = skyJumpPads.pads[0], out = {};
      const reset = () => {
        for (const k of Object.keys(g.keys)) g.keys[k] = false;
        for (const z of s.Jt) { s.ue.remove(z.m.root); if (z.pool) s.ue.remove(z.pool); } s.Jt.length = 0;
        g.SCR.off = g.PACE.off = g.MARK.off = true; Object.assign(g.S, { sendLog: false, gunOn: false, autoFire: false, aimAuto: false, stalkerOn: false, stalker2: false, dropShare: 0 });
        g.GAME.over = false; g.GAME.t = 0; g.GAME.spawnT = g.GAME.surgeT = 1e9; g.GAME.safeT = 0; g.setMode('play');
        g.placeAt({ x: pad.at[0], y: pad.at[1], z: pad.at[2], yaw: 0 });
        Object.assign(c, { jumpBuf: 0, coyote: 0, life: skyChallenge.maxLives(3), invuln: -1, edgeJump: false });
        for (let i = 0; i < 24; i++) g.advance(dt);
      };
      reset();
      out.assistOnPad = !!skyJumpPads.assistTarget();
      g.placeAt({ x: pad.at[0] + 6, y: 0, z: pad.at[2] + 6, yaw: 0 }); for (let i = 0; i < 24; i++) g.advance(dt);
      out.assistFarAway = !!skyJumpPads.assistTarget();
      reset();
      // 追手: 台の手前の地面から2体(本番の追跡AI)。
      for (const p of [[pad.at[0] + 3, 0, pad.at[2] + 5], [pad.at[0] + 4, 0, pad.at[2] + 2]]) {
        const z = new s.ri(...p); Object.assign(z, { spawnT: 0, rise: null, hp: 1e6, flank: false, dropper: false, stalker: false, onGround: true }); z.node = g.nodeAt(p[0], p[1] + .1, p[2]); s.Jt.push(z);
      }
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB' }));
      let t = 0, landedAt = null, caughtAt = null, minDist = Infinity;
      for (; t < 45; t += dt) {
        g.advance(dt);
        if (landedAt === null && c.onGround && t > .3) landedAt = t;
        const d = Math.min(...s.Jt.map(z => Math.hypot(z.pos.x - c.pos.x, z.pos.y - c.pos.y, z.pos.z - c.pos.z)));
        if (landedAt !== null) { minDist = Math.min(minDist, d); if (caughtAt === null && d < 1.8) { caughtAt = t; break; } }
        if (g.GAME.over) break;
      }
      out.jumps = g.stats.padJumps; out.landedAt = landedAt && +landedAt.toFixed(2); out.end = c.pos.toArray().map(v => +v.toFixed(2)); out.land = pad.land;
      out.zombieReachedAt = caughtAt && +caughtAt.toFixed(2); out.zombieExtraSeconds = caughtAt && landedAt ? +(caughtAt - landedAt).toFixed(2) : null; out.minDist = +minDist.toFixed(2); out.life = c.life; out.over = g.GAME.over;
      return out;
    });
    console.log(JSON.stringify(result));
    assert.ok(result.assistOnPad, '台の上で目印が出ること'); assert.equal(result.assistFarAway, false, '離れると目印が消えること');
    assert.equal(result.jumps, 1, 'Bキーで1回跳ぶこと');
    assert.ok(Math.hypot(result.end[0] - result.land[0], result.end[2] - result.land[2]) <= 1.6 && Math.abs(result.end[1] - result.land[1]) <= .4, '着地先に立つこと');
    assert.deepEqual(errors, []);
    fs.mkdirSync('docs/escape-sites', { recursive: true }); fs.writeFileSync('docs/escape-sites/jump-pad-bench.json', JSON.stringify(result, null, 1));
  } finally { await browser.close(); server.kill(); }
})().catch(e => { console.error(e.message || e); process.exit(1); });
