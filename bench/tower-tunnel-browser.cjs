// 塔のトンネル（実物理）: 長い斜面を滑る → 塔の穴 → U字 → 出口から打ち上がる → 屋上に着地。
// あわせて、東の上段回廊が掘削の下で歩いて通れること、止まっていると打ち上がらないことを確かめる。
const assert = require('node:assert/strict'), fs = require('node:fs'), { spawn } = require('node:child_process'), { chromium } = require('playwright');
const { revealHomeControl } = require('./home-controls.cjs');
(async () => {
  const server = spawn('python3', ['-m', 'http.server', '8797', '--bind', '127.0.0.1'], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { if (await fetch('http://127.0.0.1:8797/').then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const context = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1280, height: 720 } });
    await context.addInitScript(() => { window.__hold = true; });
    await context.route('https://**/*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0,"ok":true}' }));
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(240000);
    await page.goto('http://127.0.0.1:8797/index.html?challengeDebug=1');
    await page.waitForFunction(() => window.__game && window.skySwing && window.skyTowerTunnel && window.skyTowerTunnel.step);
    const level = page.locator('[data-difficulty=normal]'); await revealHomeControl(page, level); await level.click(); await page.locator('#bStart').click();
    const result = await page.evaluate(() => {
      const g = __game, s = __skyInternals, c = g.P, dt = 1 / 120, out = {}, T = skyTowerTunnel.T;
      const reset = () => {
        for (const k of Object.keys(g.keys)) g.keys[k] = false;
        for (const z of s.Jt) { s.ue.remove(z.m.root); if (z.pool) s.ue.remove(z.pool); } s.Jt.length = 0;
        g.SCR.off = g.PACE.off = g.MARK.off = true; Object.assign(g.S, { sendLog: false, gunOn: false, autoFire: false, aimAuto: false, stalkerOn: false, stalker2: false, dropShare: 0 });
        g.GAME.over = false; g.GAME.t = 0; g.GAME.spawnT = g.GAME.surgeT = 1e9; g.GAME.safeT = 0; g.setMode('play');
        Object.assign(c, { life: skyChallenge.maxLives(3), invuln: -1, jumpBuf: 0, coyote: 0, edgeJump: false });
      };
      const settle = () => { for (let i = 0; i < 30; i++) g.advance(dt); };
      const launches = () => g.stats.towerTunnel || 0;

      // A. 東の上段回廊を、帯（z -10〜-7.5）をまたいで北から南へ歩く。しゃがまされず、床の高さのまま通れる。
      reset(); g.placeAt({ x: 12, y: 4, z: -12.2, yaw: Math.PI }); settle();
      g.keys.KeyW = true; let minH = 9, maxDy = 0;
      for (let i = 0; i < 120 * 3; i++) { g.advance(dt); minH = Math.min(minH, c.h); maxDy = Math.max(maxDy, Math.abs(c.pos.y - 4)); }
      out.corridor = { endZ: +c.pos.z.toFixed(2), minH, maxDy: +maxDy.toFixed(3), launches: launches() };

      // B. 長い斜面の上から滑る。途中でキーを離しても、打ち上がって屋上に着地する。
      reset(); g.placeAt({ x: 37, y: 13.8, z: -8, yaw: Math.PI / 2 }); settle();
      g.keys.KeyW = true; c.crouchPressed = true;
      let released = false, t0 = null, landed = null, apex = 0, over20 = 0, rideStart = null, enterSpeed = 0, maxSpeed = 0;
      for (let i = 0; i < 120 * 14; i++) {
        g.advance(dt); const t = i * dt;
        if (!released && c.pos.x < 30) { g.keys.KeyW = false; released = true; }
        if (rideStart === null && c.pos.x < T.XB + 1 && c.pos.x > T.XB - .2) { rideStart = t; enterSpeed = Math.hypot(c.vel.x, c.vel.z); }
        maxSpeed = Math.max(maxSpeed, Math.hypot(c.vel.x, c.vel.y, c.vel.z));
        if (launches() && t0 === null) t0 = t;
        if (t0 !== null) { apex = Math.max(apex, c.pos.y); if (c.pos.y >= 20) over20 += dt; }
        if (t0 !== null && landed === null && c.onGround && t > t0 + .5) { landed = [c.pos.x, c.pos.y, c.pos.z, t - t0]; break; }
      }
      out.slide = { launches: launches(), enterSpeed: +enterSpeed.toFixed(1), maxSpeed: +maxSpeed.toFixed(1), apex: +apex.toFixed(2), over20: +over20.toFixed(2), landed: landed && landed.map(v => +v.toFixed(2)), over: g.GAME.over, life: c.life };

      // C. 走って降りても（スライディングなしで）打ち上がる。
      const n0 = launches(); reset(); g.placeAt({ x: 16, y: 8.1, z: -8.75, yaw: Math.PI / 2 }); settle();
      g.keys.KeyW = true; g.keys.ShiftLeft = true; let apexRun = 0;
      for (let i = 0; i < 120 * 6; i++) { g.advance(dt); apexRun = Math.max(apexRun, c.pos.y); }
      out.run = { launches: launches() - n0, apex: +apexRun.toFixed(2) };

      // D. 底で止まっていれば打ち上がらない（立ち止まって眺められる）。
      const n1 = launches(); reset(); g.placeAt({ x: 3.4, y: 3.8, z: -8.75, yaw: Math.PI / 2 }); settle();
      for (let i = 0; i < 120 * 2; i++) g.advance(dt);
      out.still = { launches: launches() - n1, pos: [c.pos.x, c.pos.y, c.pos.z].map(v => +v.toFixed(2)) };

      // E. 乗っている途中で試合が終わっても、次の試合に持ち越さない。
      reset(); g.placeAt({ x: 37, y: 13.8, z: -8, yaw: Math.PI / 2 }); settle(); g.keys.KeyW = true; c.crouchPressed = true;
      for (let i = 0; i < 120 * 6 && !skyTowerTunnel.active(); i++) g.advance(dt);
      out.rideActive = skyTowerTunnel.active();
      reset(); g.placeAt({ x: 0, y: 8, z: 4, yaw: 0 }); settle();
      out.carryOver = skyTowerTunnel.active();
      return out;
    });
    console.log(JSON.stringify(result));
    assert.ok(result.corridor.endZ > -5 && result.corridor.minH >= 1.75 && result.corridor.maxDy < .05 && result.corridor.launches === 0, '東の上段回廊を、しゃがまず同じ高さで通り抜けられる');
    assert.equal(result.slide.launches, 1, '滑り降りると1回だけ打ち上がる');
    assert.ok(result.slide.enterSpeed >= 14, '底には最高速近くで着く: ' + result.slide.enterSpeed);
    assert.ok(result.slide.apex >= 22 && result.slide.apex <= 24, '頂点は約23 m: ' + result.slide.apex);
    assert.ok(result.slide.over20 >= 1, '20 m以上に1秒以上いる: ' + result.slide.over20);
    assert.ok(result.slide.landed && Math.abs(result.slide.landed[1] - 8) < .1 && result.slide.landed[0] > -13.5 && result.slide.landed[0] < -6.5, '塔の屋上に着地する');
    assert.ok(!(result.slide.landed[0] > -12.3 && result.slide.landed[0] < -8.7 && result.slide.landed[2] < -8.2), '西の小屋の上に降りない');
    assert.equal(result.slide.over, false); assert.equal(result.slide.life, 5, '着地で命が減らない');
    assert.equal(result.run.launches, 1, '走って降りても打ち上がる'); assert.ok(result.run.apex >= 22);
    assert.equal(result.still.launches, 0, '止まっていれば打ち上がらない');
    assert.equal(result.rideActive, true, '乗っている途中の状態を作れた'); assert.equal(result.carryOver, false, '次の試合に持ち越さない');
    assert.deepEqual(errors, []);
    fs.mkdirSync('docs/escape-sites', { recursive: true }); fs.writeFileSync('docs/escape-sites/tower-tunnel-bench.json', JSON.stringify(result, null, 1));
  } finally { await browser.close(); server.kill(); }
})().catch(e => { console.error(e.message || e); process.exit(1); });
