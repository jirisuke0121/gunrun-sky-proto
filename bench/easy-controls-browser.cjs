const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const port = Number(process.env.SKY_TEST_PORT || 18876);
const base = process.env.RUNNING_QA_URL || `http://127.0.0.1:${port}/`;
const out = process.env.EASY_QA_OUT || 'browser-evidence/easy-controls';
const onlyChooser = process.env.EASY_QA_ONLY === 'chooser';
const resultFile = `${out}/${onlyChooser ? 'chooser-results' : 'results'}.json`;
fs.mkdirSync(out, { recursive: true });
const difference = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

(async () => {
  let browser, server;
  const results = [];
  try {
    if (!process.env.RUNNING_QA_URL) {
      server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { stdio: 'ignore' });
      let ready = false;
      for (let i = 0; i < 60; i++) {
        if (await fetch(base).then(r => r.ok, () => false)) { ready = true; break; }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      assert.ok(ready, 'local test server starts');
    }
    browser = await chromium.launch({ headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

    const open = async (map, lang = 'en', picker = false) => {
      const context = await browser.newContext({ viewport: { width: 844, height: 390 },
        locale: lang === 'ja' ? 'ja-JP' : 'en-US', isMobile: true, hasTouch: true });
      await context.addInitScript(() => { window.__hold = true; });
      let externalPosts = 0;
      await context.route('https://**/*', route => {
        if (new URL(route.request().url()).origin === new URL(base).origin) return route.continue();
        if (route.request().method() === 'POST') externalPosts++;
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0}' });
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.setDefaultTimeout(90000);
      await page.goto(base + map + `?cameraTrial=follow-legacy&lang=${lang}&controlpick=${picker ? 1 : 0}&hookGuide=0`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.skyStartReadiness?.ready, null, { timeout: 120000 });
      return { context, page, errors, posts: () => externalPosts };
    };

    if (!onlyChooser) for (const map of ['index.html', 'canyon.html']) {
      const { context, page, errors, posts } = await open(map);
      assert.equal(await page.evaluate(() => skyFollowCamera.mode), 'after', 'new touch users retain automatic camera');
      await page.locator('#bStart').tap();
      await page.evaluate(() => {
        const g = __game, c = g.P;
        g.S.sendLog = g.S.autoFire = false; c.invuln = Infinity;
        for (const enemy of g.zombies) { enemy.dead = true; enemy.remove = true; }
        g.GAME.spawnT = Infinity;
        // Isolation fixture: real CDP touch events reach the native handlers,
        // player physics and camera. An airborne lane at y=200 removes
        // collisions, gravity and ledge-assist from horizontal intent checks.
        // Terrain movement and device play-feel need separate playtesting.
        window.easyReset = mode => {
          skyFollowCamera.setMode(mode, false); skySwing.reset();
          for (const key of Object.keys(g.keys)) g.keys[key] = false;
          c.pos.set(0, 200, 0); c.vel.set(0, 0, 0); c.yaw = c.pitch = 0;
          c.state = 'normal'; c.onGround = false; c.h = 1.75;
          c.jumpBuf = c.slideBuf = c.coyote = 0; c.edgeJump = false; c.edgeOff = null;
          c.lastGround.copy(c.pos); skyFollowCamera.reset();
        };
        window.easyTick = count => {
          for (let i = 0; i < count; i++) {
            c.onGround = false; c.pos.y = 200; c.vel.y = 0;
            g.playerStep(1 / 120); g.cam(1 / 120);
          }
          c.pos.y = 200; c.vel.y = 0;
        };
        easyReset('after');
      });
      const cdp = await context.newCDPSession(page);
      const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
      const origin = { id: 1, x: 110, y: 260 }, right = { id: 2, x: 600, y: 150 };
      const sideways = { ...origin, x: origin.x + 56 }, rightLook = { ...right, x: right.x + 60 };
      const snapshot = () => page.evaluate(() => ({ position: __game.P.pos.toArray(), yaw: __game.P.yaw,
        view: skyFollowCamera.view.yaw, speed: Math.hypot(__game.P.vel.x, __game.P.vel.z), input: { ...__skyInternals.inputState } }));
      const tick = n => page.evaluate(n => easyTick(n), n);

      await touch('touchStart', [origin]); await touch('touchMove', [sideways]);
      await page.waitForFunction(() => __skyInternals.inputState.x > .99);
      await tick(360);
      const held = await snapshot();
      assert.ok(held.position[0] > 10, `${map}: horizontal drag must translate ${JSON.stringify(held)}`);
      assert.ok(Math.abs(held.position[2]) < .001, `${map}: held lateral direction stays straight`);
      assert.ok(Math.abs(difference(held.yaw, -Math.PI / 2)) < .001);
      assert.ok(Math.abs(difference(held.view, -Math.PI / 2)) < .02, 'camera follows the movement direction');

      await touch('touchStart', [sideways, right]); await touch('touchMove', [sideways, rightLook]);
      await page.waitForFunction(() => __skyInternals.inputState.lx === 660);
      const looking = await snapshot();
      assert.ok(Math.abs(difference(looking.view, held.view)) > .1, 'right finger deliberately changes view');
      await touch('touchEnd', [rightLook]);
      await page.waitForFunction(() => __skyInternals.inputState.lookId === null);
      assert.equal((await snapshot()).input.on, true, 'right release keeps the left movement finger');
      // This real delay detects the old 1.1-second snapback timer.
      await page.waitForTimeout(2100); await tick(240);
      const afterLookRelease = await snapshot();
      assert.ok(Math.abs(difference(afterLookRelease.view, looking.view)) < .0001, 'manual view does not snap back');
      assert.ok(Math.abs(afterLookRelease.position[2]) < .001, 'manual look does not steer held movement');

      await touch('touchMove', [origin]);
      await page.waitForFunction(() => Math.hypot(__skyInternals.inputState.x, __skyInternals.inputState.y) < .01);
      await tick(1);
      const forward = { ...origin, y: origin.y - 56 };
      await touch('touchMove', [forward]);
      await page.waitForFunction(() => __skyInternals.inputState.y < -.99);
      await tick(1);
      const reselected = await snapshot();
      assert.ok(Math.abs(difference(reselected.yaw, looking.view)) < .001, 'neutral then up adopts the chosen view');
      await touch('touchEnd', []);
      await page.waitForFunction(() => !__skyInternals.inputState.on);
      await tick(120);
      const released = await snapshot();
      assert.equal(released.input.x, 0); assert.equal(released.input.y, 0);
      assert.ok(released.speed <= reselected.speed + .001, 'release adds no further movement acceleration');

      await page.evaluate(() => easyReset('after'));
      await touch('touchStart', [origin]); await touch('touchMove', [sideways]);
      await page.waitForFunction(() => __skyInternals.inputState.x > .99); await tick(24);
      await touch('touchCancel', []);
      await page.waitForFunction(() => !__skyInternals.inputState.on); await tick(120);
      const cancelled = await snapshot();
      assert.equal(cancelled.input.x, 0); assert.equal(cancelled.input.y, 0);

      await page.evaluate(() => easyReset('before'));
      await touch('touchStart', [origin]); await touch('touchMove', [sideways]);
      await page.waitForFunction(() => __skyInternals.inputState.x > .99); await tick(360);
      const fps = await snapshot();
      assert.ok(fps.position[0] > 10 && Math.abs(fps.position[2]) < .001);
      assert.ok(Math.abs(fps.yaw) < .001 && Math.abs(fps.view) < .001, 'FPS keeps manual camera and strafe');
      await touch('touchEnd', []);
      await page.waitForFunction(() => !__skyInternals.inputState.on);

      // Also check ordinary movement on a real map surface for 0.5 seconds.
      // Only the long-hold feedback case above uses an airborne isolation lane.
      const lane = await page.evaluate(() => {
        const g = __game, c = g.P;
        let lane;
        outer: for (const n of g.NAV.nodes) {
          const floors = g.solids.filter(s => s.solid && !s.off && s.type !== 'mono' && Math.abs(s.maxY - n.y) < .05);
          for (const [dx, dz] of [[1, 0], [0, -1], [-1, 0], [0, 1]]) {
            let clear = true;
            for (let d = 0; d <= 3.8; d += .2) for (const side of [-.4, 0, .4]) {
              const x = n.x + dx * d - dz * side, z = n.z + dz * d + dx * side;
              if (!g.freeAt(x, n.y + .03, z, .3, 1.75) || !floors.some(s =>
                x > s.minX + .05 && x < s.maxX - .05 && z > s.minZ + .05 && z < s.maxZ - .05)) clear = false;
            }
            if (clear) { lane = { position: [n.x, n.y + .01, n.z], yaw: Math.atan2(-dz, dx), direction: [dx, dz] }; break outer; }
          }
        }
        if (!lane) throw Error('No real 3.8m map lane for ground movement');
        easyReset('after'); c.pos.fromArray(lane.position); c.lastGround.copy(c.pos);
        c.onGround = true; c.yaw = lane.yaw; skyFollowCamera.reset();
        return lane;
      });
      await touch('touchStart', [origin]); await touch('touchMove', [sideways]);
      await page.waitForFunction(() => __skyInternals.inputState.x > .99);
      await page.evaluate(() => { for (let i = 0; i < 30; i++) __game.frameOnce(1 / 60); });
      const ground = await snapshot();
      ground.distance = Math.hypot(ground.position[0] - lane.position[0], ground.position[2] - lane.position[2]);
      assert.ok(ground.distance > 2, `${map}: real-ground lateral movement ${JSON.stringify({ lane, ground })}`);
      await page.screenshot({ path: `${out}/${map.split('.')[0]}-ground-lateral.png` });
      await touch('touchEnd', []);
      await page.waitForFunction(() => !__skyInternals.inputState.on);
      await page.evaluate(() => { for (let i = 0; i < 45; i++) __game.frameOnce(1 / 60); });
      const groundStopped = await snapshot();
      assert.ok(groundStopped.speed < .01, `${map}: real-ground release brakes to stop`);
      await page.evaluate(lane => {
        const c = __game.P; c.pos.fromArray(lane.position); c.lastGround.copy(c.pos);
        c.vel.set(0, 0, 0); c.onGround = true; c.yaw = lane.yaw; skyFollowCamera.reset();
      }, lane);
      await touch('touchStart', [origin]); await touch('touchMove', [sideways]);
      await page.waitForFunction(() => __skyInternals.inputState.x > .99);
      await page.evaluate(() => { for (let i = 0; i < 15; i++) __game.frameOnce(1 / 60); });
      await touch('touchCancel', []);
      await page.waitForFunction(() => !__skyInternals.inputState.on);
      await page.evaluate(() => { for (let i = 0; i < 45; i++) __game.frameOnce(1 / 60); });
      const groundCancelled = await snapshot();
      assert.ok(groundCancelled.speed < .01, `${map}: real-ground cancel brakes to stop`);
      assert.equal(posts(), 0, 'the isolated movement trial sends no records'); assert.deepEqual(errors, []);
      results.push({ map, isolation: 'CDP touch + native player/camera, airborne lane at y=200; release/cancel clears input while normal airborne momentum remains', held, looking,
        afterLookRelease, reselected, released, cancelled, fps, lane, ground, groundStopped, groundCancelled, errors });
      fs.writeFileSync(resultFile, JSON.stringify(results, null, 2));
      console.log('PASS', map, 'CDP lateral translation, 3s straight hold, two-finger look/release, 2.1s no snapback, neutral reselect, release/cancel input clear, FPS; real-ground distance', ground.distance.toFixed(3), 'm, released speed', groundStopped.speed.toFixed(3));
      await context.close();
    }

    for (const map of ['index.html', 'canyon.html']) for (const lang of ['ja', 'en']) {
      const { context, page, errors, posts } = await open(map, lang, true);
      // Retain coverage of the legacy popup; the published development entry
      // and live trial are covered by development-entry-browser.cjs.
      await page.evaluate(()=>document.getElementById('bIntro').click());
      await page.locator('#ctrlPick').waitFor({ state: 'visible' });
      const fits = [];
      for (const size of [{ width: 844, height: 390 }, { width: 640, height: 320 }]) {
        await page.setViewportSize(size);
        await page.waitForFunction(() => document.getElementById('app').clientHeight === innerHeight &&
          document.getElementById('app').dataset.fit === (innerHeight < 360 ? 'tight' : innerHeight <= 520 ? 'normal' : 'roomy'));
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const fit = await page.evaluate(() => {
          const rect = el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
          return { viewport: [innerWidth, innerHeight], dialog: rect(document.querySelector('#ctrlPick .cs-dialog')),
            cards: [...document.querySelectorAll('#ctrlPick .cs-card')].map(rect), go: rect(document.getElementById('csGo')),
            helpRect: rect(document.querySelector('#ctrlPick .cs-touch-help')), slot: rect(document.querySelector('#ctrlPick .cs-slot')),
            cardsHit: [...document.querySelectorAll('#ctrlPick .cs-card')].map(el => {
              const r = el.getBoundingClientRect(); return document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2)?.closest('.cs-card') === el;
            }),
            help: document.querySelector('#ctrlPick .cs-touch-help').textContent,
            automatic: document.querySelector('#ctrlPick .cs-card[data-mode="after"]').textContent };
        });
        const id = `${map.split('.')[0]}-${lang}-${size.width}x${size.height}`;
        await page.screenshot({ path: `${out}/${id}-chooser.png` });
        for (const [name, r] of [['dialog', fit.dialog], ['start button', fit.go], ...fit.cards.map((r, i) => ['card ' + i, r])]) {
          assert.ok(r.left >= -.5 && r.right <= size.width + .5 && r.top >= -.5 && r.bottom <= size.height + .5,
            `${map} ${lang} ${size.width}x${size.height}: ${name} fits ${JSON.stringify(fit)}`);
        }
        assert.ok(fit.helpRect.left >= -.5 && fit.helpRect.right <= size.width + .5 &&
          fit.helpRect.top >= fit.slot.top - .5 && fit.helpRect.bottom <= fit.slot.bottom + .5 &&
          fit.helpRect.top >= -.5 && fit.helpRect.bottom <= size.height + .5,
          `${map} ${lang} ${size.width}x${size.height}: shared left-thumb help is visible without clipping ${JSON.stringify(fit)}`);
        assert.ok(fit.cards.every(r => r.bottom <= fit.slot.bottom + .5 && r.bottom <= fit.go.top + .5) &&
          fit.helpRect.bottom <= fit.go.top + .5, 'cards and shared help do not overlap the footer');
        assert.ok(fit.cardsHit.every(Boolean), 'both card centers receive input rather than an overlapping footer');
        assert.match(fit.help, lang === 'en' ? /hold/i : /押したまま/);
        assert.match(fit.automatic, lang === 'en' ? /automatic|camera/i : /カメラ/);
        assert.doesNotMatch(fit.automatic, /Best for first timers|FPS未経験の方に/);
        fits.push({ id, ...fit });
      }
      await page.locator('#csGo').tap();
      await page.waitForFunction(() => __game.mode === 'play');
      assert.equal(await page.evaluate(() => skyFollowCamera.mode), 'after', 'chooser keeps selected easy mode');
      assert.deepEqual(errors, []); assert.equal(posts(), 0);
      results.push({ map, lang, fits, errors });
      fs.writeFileSync(resultFile, JSON.stringify(results, null, 2)); await context.close();
      console.log('PASS', map, lang, 'phone chooser at 844x390 and 640x320, gesture wording, start');
    }
    fs.writeFileSync(resultFile, JSON.stringify(results, null, 2));
  } finally { await browser?.close(); server?.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
