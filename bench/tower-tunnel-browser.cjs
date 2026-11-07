// 塔のトンネル（実物理）: 長い斜面を滑る → 塔の穴 → U字 → 出口から西へ流れて打ち上がる → 西の広場の床に着地。
// 入口は、斜面の上から勢いをつけて滑った人だけ（歩く・助走なし・途中から滑る・穴へ落ちるでは発動しない）。
// あわせて、東の上段回廊が掘削の下で歩いて通れることを確かめる。
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

      // 斜面を滑る共通の手順。startX から滑り始め、発動したら着地まで追う。
      const slideFrom = (startX, y, keepKeys = false) => {
        const n = launches(), tickets = g.stats.towerTickets || 0;
        reset(); g.placeAt({ x: startX, y, z: -8, yaw: Math.PI / 2 }); settle();
        g.keys.KeyW = true; c.crouchPressed = true;
        let released = false, t0 = null, landed = null, apex = 0, over20 = 0, enterSpeed = 0, maxVx = 0;
        for (let i = 0; i < 120 * 14; i++) {
          g.advance(dt); const t = i * dt;
          if (!released && !keepKeys && c.pos.x < Math.min(30, startX - 3)) { g.keys.KeyW = false; released = true; }
          if (c.pos.x < T.XB + 1 && c.pos.x > T.XB - .2 && !enterSpeed) enterSpeed = Math.hypot(c.vel.x, c.vel.z);
          if (launches() > n && t0 === null) t0 = t;
          if (t0 !== null) { apex = Math.max(apex, c.pos.y); maxVx = Math.min(maxVx, c.vel.x); if (c.pos.y >= 20) over20 += dt; }
          if (t0 !== null && landed === null && c.onGround && t > t0 + .5) { landed = [c.pos.x, c.pos.y, c.pos.z, t - t0]; break; }
          if (t0 === null && t > 7) break;
        }
        return { launches: launches() - n, tickets: (g.stats.towerTickets || 0) - tickets, enterSpeed: +enterSpeed.toFixed(1), apex: +apex.toFixed(2), over20: +over20.toFixed(2), maxWestSpeed: +(-maxVx).toFixed(1), landed: landed && landed.map(v => +v.toFixed(2)), over: g.GAME.over, life: c.life };
      };
      // B. 長い斜面の上から滑る。途中でキーを離しても、打ち上がって広場の床に着地する。
      out.slide = slideFrom(37, 13.8);
      // B2. 斜面の上から4割あたり（x34、約2.3秒の滑走）から滑っても届く。
      out.slideMid = slideFrom(34, 13.0);

      // C. 入口の制限: 発動しないこと。
      reset(); const nRun = launches(); g.placeAt({ x: 16, y: 8.1, z: -8.75, yaw: Math.PI / 2 }); settle();
      g.keys.KeyW = true; g.keys.ShiftLeft = true;
      for (let i = 0; i < 120 * 6; i++) g.advance(dt);
      out.run = { launches: launches() - nRun, ticket: skyTowerTunnel.hasTicket() };        // 屋上から走って降りる
      out.low = slideFrom(28, 11.55);                                                          // 斜面の中ほど（x28、約1.8秒の滑走）から滑る（助走が足りない）
      out.edge = slideFrom(14.6, 8.2);                                                         // 屋上の縁から滑る
      reset(); const nIn = launches(); g.placeAt({ x: 10.5, y: 6.8, z: -8.75, yaw: Math.PI / 2 }); settle();   // 坑の途中に落ちてから滑る
      g.keys.KeyW = true; c.crouchPressed = true;
      for (let i = 0; i < 120 * 5; i++) g.advance(dt);
      out.dropIn = { launches: launches() - nIn };

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
    const S = result.slide;
    assert.equal(S.launches, 1, '滑り降りると1回だけ打ち上がる');
    assert.ok(S.enterSpeed >= 14, '底には最高速近くで着く: ' + S.enterSpeed);
    assert.ok(S.apex >= 22 && S.apex <= 24, '頂点は約23 m: ' + S.apex);
    assert.ok(S.over20 >= 1, '20 m以上に1秒以上いる: ' + S.over20);
    assert.ok(S.maxWestSpeed >= 5, '西へ流れる速さがある: ' + S.maxWestSpeed);
    assert.ok(S.landed && Math.abs(S.landed[1]) < .1 && S.landed[0] < -15.5 && S.landed[0] > -20.5 && S.landed[2] > -7.5 && S.landed[2] < 7.5, '西の広場の床に着地する: ' + JSON.stringify(S.landed));
    assert.equal(S.over, false); assert.equal(S.life, 5, '着地で命が減らない');
    assert.equal(result.slideMid.launches, 1, '斜面の上から4割あたりから滑っても届く'); assert.ok(result.slideMid.tickets >= 1);
    assert.equal(result.run.launches, 0, '走って降りても発動しない'); assert.equal(result.run.ticket, false);
    assert.equal(result.low.launches, 0, '助走が足りない滑りでは発動しない'); assert.equal(result.low.tickets, 0);
    assert.equal(result.edge.launches, 0, '屋上の縁から滑るだけでは発動しない'); assert.equal(result.edge.tickets, 0);
    assert.equal(result.dropIn.launches, 0, '坑の途中へ落ちてから滑っても発動しない');
    assert.equal(result.still.launches, 0, '止まっていれば打ち上がらない');
    assert.equal(result.rideActive, true, '乗っている途中の状態を作れた'); assert.equal(result.carryOver, false, '次の試合に持ち越さない');
    assert.deepEqual(errors, []);
    fs.mkdirSync('docs/escape-sites', { recursive: true }); fs.writeFileSync('docs/escape-sites/tower-tunnel-bench.json', JSON.stringify(result, null, 1));
  } finally { await browser.close(); server.kill(); }
})().catch(e => { console.error(e.message || e); process.exit(1); });
