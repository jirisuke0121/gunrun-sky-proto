// Reproduce the old shared follow preference, then use real keyboard/mouse
// events and the game loop to check movement and automatic combat independently.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const base = 'http://127.0.0.1:8808/';

(async () => {
  let server, browser;
  try {
    server = spawn('python3', ['-m', 'http.server', '8808', '--bind', '127.0.0.1'], { stdio: 'ignore' });
    for (let i = 0; i < 60; i++) {
      if (await fetch(base).then(r => r.ok, () => false)) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    browser = await chromium.launch({ headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    for (const map of ['index.html', 'canyon.html']) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      await context.addInitScript(() => {
        window.__hold = true;
        // Do not reseed after reload: also test a new explicit PC choice.
        if (!sessionStorage.getItem('pc-controls-seeded')) {
          localStorage.setItem('gunrun-follow-camera-v1', 'after');
          sessionStorage.setItem('pc-controls-seeded', '1');
        }
      });
      await context.route('https://**/*', r => r.fulfill({ status: 200,
        contentType: 'application/json', body: '{"ok":true,"top":[],"total":0,"me":null}' }));
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.setDefaultTimeout(90000);
      await page.goto(base + map, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.skyStartReadiness?.ready || window.skyStartReadiness?.state.phase === 'error');
      assert.equal(await page.evaluate(() => skyStartReadiness.ready), true,
        JSON.stringify(await page.evaluate(() => ({ readiness: skyStartReadiness.state, model: document.body.dataset.skyModels }))) + JSON.stringify(errors));
      console.log('READY', map);
      assert.equal(await page.evaluate(() => skyFollowCamera.mode), 'before', 'old shared follow preference must not change PC controls');
      await page.locator('#bStart').click();
      await page.waitForFunction(() => __game.mode === 'play');

      // A clear, elevated space avoids terrain and edge-assist interference.
      await page.evaluate(() => {
        const g = __game, c = g.P;
        g.S.sendLog = false; c.invuln = Infinity;
        g.GAME.spawnT = g.GAME.surgeT = Infinity;
        window.pcReset = () => {
          c.pos.set(0, 200, 0); c.vel.set(0, 0, 0); c.yaw = 0; c.pitch = .2;
          c.state = 'normal'; c.onGround = false; c.jumpBuf = c.slideBuf = 0;
          c.edgeJump = false; c.edgeOff = null; skyFollowCamera.reset();
        };
      });
      for (const [key, axis, sign] of [['w', 2, -1], ['s', 2, 1], ['a', 0, -1], ['d', 0, 1]]) {
        await page.evaluate(() => pcReset());
        await page.keyboard.down(key);
        const moved = await page.evaluate(() => {
          for (let i = 0; i < 12; i++) __game.playerStep(1 / 120);
          return { position: __game.P.pos.toArray(), yaw: __game.P.yaw, pitch: __game.P.pitch };
        });
        await page.keyboard.up(key);
        assert.ok(moved.position[axis] * sign > .01, `${map}: ${key} movement ${JSON.stringify(moved)}`);
        assert.equal(moved.yaw, 0, `${key} must not steer`);
        assert.equal(moved.pitch, .2);
      }
      await page.evaluate(() => pcReset());
      await page.locator('#c').click({ position: { x: 600, y: 350 } });
      const locked = await page.evaluate(() => document.pointerLockElement === document.getElementById('c'));
      if (!locked) await page.mouse.down({ button: 'right' });
      await page.mouse.move(680, 370);
      await page.waitForFunction(() => Math.abs(__game.P.yaw) > .01, null, { timeout: 5000 });
      if (!locked) await page.mouse.up({ button: 'right' });
      const look = await page.evaluate(() => ({ yaw: __game.P.yaw, pitch: __game.P.pitch }));
      assert.notEqual(look.pitch, .2, 'mouse changes pitch as well as movement heading');

      const combat = await page.evaluate(() => {
        pcReset();
        const g = __game, s = __skyInternals, c = g.P;
        const enemy = s.Jt.find(e => !e.dead);
        if (!enemy) throw Error('Expected a real spawned zombie');
        for (const other of s.Jt) if (other !== enemy) other.dead = true;
        g.S.weapon = 0;
        if (!g.S.autoFire || !g.S.aimAuto) throw Error('Automatic fire defaults must remain enabled');
        const shots = g.stats.shots;
        s.Et.ammo = 12; s.Et.reloadT = s.Et.fireCD = s.Et.trigger = 0;
        for (let i = 0; i < 90 && g.stats.shots === shots; i++) {
          c.pos.set(0, 200, 0); c.vel.set(0, 0, 0);
          enemy.pos.set(0, 200, 6); enemy.vel.set(0, 0, 0); enemy.spawnT = 0;
          g.frameOnce(1 / 60);
        }
        const fired = g.stats.shots - shots, yaw = c.yaw, pitch = c.pitch;
        s.Et.ammo = 0; s.Et.reloadT = s.Et.autoReload = 0;
        g.frameOnce(1 / 60);
        return { fired, yaw, pitch, reload: s.Et.reloadT, autoFire: g.S.autoFire };
      });
      assert.ok(combat.fired > 0, `rear automatic shot: ${JSON.stringify(combat)}`);
      assert.equal(combat.yaw, 0, 'enemy behind must not turn travel heading');
      assert.ok(Math.abs(combat.pitch - .2) < .02,
        'retain the small existing shot recoil without aiming the view at the enemy');
      assert.ok(combat.reload > 0, 'empty magazine reloads automatically');
      assert.deepEqual(errors, []);

      // An intentional choice still persists separately, and leaves touch alone.
      await page.evaluate(() => skyFollowCamera.setMode('after'));
      await page.goto(base + map, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.skyFollowCamera);
      assert.equal(await page.evaluate(() => skyFollowCamera.mode), 'after');
      assert.equal(await page.evaluate(() => localStorage.getItem('gunrun-follow-camera-v1')), 'after');
      await page.evaluate(() => skyFollowCamera.setMode('before'));
      await page.goto(base + map, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.skyFollowCamera);
      assert.equal(await page.evaluate(() => skyFollowCamera.mode), 'before');
      console.log('PASS', map, 'WASD, mouse (' + (locked ? 'locked' : 'right-drag fallback') + '), rear automatic fire/reload, separate preferences', JSON.stringify(combat));
      await context.close();
    }
    for (const saved of [null, 'before', 'after']) {
      const context = await browser.newContext({ isMobile: true, hasTouch: true, viewport: { width: 844, height: 390 } });
      await context.addInitScript(saved => {
        window.__hold = true;
        localStorage.setItem('gunrun-pc-camera-v1', 'before');
        if (saved) localStorage.setItem('gunrun-follow-camera-v1', saved);
      }, saved);
      await context.route('https://**/*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[]}' }));
      const page = await context.newPage();
      await page.goto(base + 'canyon.html', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.skyFollowCamera);
      assert.equal(await page.evaluate(() => skyFollowCamera.mode), saved || 'after', 'touch retains its default/saved selection independently');
      await context.close();
    }
    console.log('PASS touch default and both saved modes remain independent of PC');
  } finally { await browser?.close(); server?.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
