// Native course geometry and native Q/touch events. No tutorial-only movement.
const assert = require('node:assert/strict'), fs = require('node:fs');
const { spawn } = require('node:child_process'), { chromium } = require('playwright');
const base = 'http://127.0.0.1:18819/';
(async () => {
  let browser, server;
  try {
    server = spawn('python3', ['-m', 'http.server', '18819', '--bind', '127.0.0.1'], { stdio: 'ignore' });
    for (let i = 0; i < 60; i++) { if (await fetch(base).then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    fs.mkdirSync('browser-evidence/hook-tutorial', { recursive: true });
    for (const [map, touch, lang] of [['index.html', false, 'ja'], ['canyon.html', false, 'ja'], ['index.html', true, 'ja'], ['index.html', false, 'en']]) {
      const context = await browser.newContext({ locale: lang === 'ja' ? 'ja-JP' : 'en-US',
        viewport: touch ? { width: 844, height: 390 } : { width: 1280, height: 720 }, hasTouch: touch, isMobile: touch });
      await context.addInitScript(() => { window.__hold = true; });
      await context.route('https://**/*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"top":[],"total":0}' }));
      const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(90000);
      const tag = `${map.replace('.html', '')}-${touch ? 'touch' : 'pc'}-${lang}`;
      try {
        await page.goto(`${base}${map}?hookGuide=1&controlpick=0&lang=${lang}`);
        await page.waitForFunction(() => window.__game && window.skyHookTutorial && window.skyStartReadiness?.ready);
        await page.locator('#bIntro').click();
        await page.waitForFunction(() => __game.mode === 'play' && skyChallenge.isIntroRun);
        const route = await page.evaluate(() => {
          const g = __game, s = __skyInternals, c = g.P;
          g.S.sendLog = g.S.autoFire = g.S.aimAuto = false;
          g.GAME.spawnT = g.GAME.surgeT = 1e9; c.invuln = Infinity;
          // Search only existing standing navigation nodes and existing anchors,
          // then verify arrival with the unchanged hook physics/collisions.
          const place = (n, a) => {
            g.placeAt({ x: n.x, y: n.y, z: n.z, yaw: Math.atan2(n.x - a[0], n.z - a[2]) });
            Object.assign(c, { state: 'normal', onGround: true, hookCD: 0, catchCD: 0, setCD: 0, jumpBuf: 0, hookPressed: false, hookPick: null, edgeJump: false, edgeOff: null, invuln: Infinity });
            c.pitch = Math.atan2(a[1] - c.pos.y - 1.62, Math.hypot(a[0] - c.pos.x, a[2] - c.pos.z));
            c.vel.set(0, 0, 0); skyFollowCamera.reset();
            g.cam(.1); g.debug.camera.updateMatrixWorld();
          };
          let checked = 0;
          for (const a of s.us) {
            const nodes = g.NAV.nodes.filter(n => a[1] - n.y > 1 && a[1] - n.y < 12 && Math.hypot(n.x - a[0], n.z - a[2]) > 4 && Math.hypot(n.x - a[0], n.z - a[2]) < 14);
            for (const n of nodes.filter((_, i) => i % Math.max(1, Math.floor(nodes.length / 60)) === 0)) {
              place(n, a); if (s.hookAssist().inspect(a).reason) continue;
              checked++; if (!g.hookTap(0, 0, a)) continue;
              let hooked = false, landed = false;
              for (let k = 0; k < 600; k++) {
                g.playerStep(1 / 120); hooked ||= c.state === 'hook';
                if (hooked && c.state === 'normal' && c.onGround) { landed = true; break; }
                if (c.pos.y < -21) break;
              }
              if (!landed || Math.hypot(c.pos.x - a[0], c.pos.z - a[2]) >= 5 || c.pos.y < a[1] - 3) continue;
              const result = { at: [n.x, n.y, n.z], anchor: s.us.indexOf(a), checked };
              place(n, a); g.GAME.challenge = { ...g.GAME.challenge }; // fresh run identity for the controlled fixture
              for (let k = 0; k < 6 && skyHookTutorial.phase === 'idle'; k++) g.frameOnce(1 / 120);
              // The first call may clear an earlier case's pending instruction.
              if (skyHookTutorial.phase !== 'explain') { skyHookTutorial.beforeFrame(); }
              return result;
            }
          }
          throw Error('No native map hook route landed; checked=' + checked);
        });
        assert.equal(await page.evaluate(() => skyHookTutorial.phase), 'explain');
        const snapshot = () => page.evaluate(() => ({ t: __game.GAME.t, enemies: __skyInternals.Jt.map(e => e.pos.toArray()), hooks: __game.stats.hooks || 0 }));
        const stopped = await snapshot();
        await page.evaluate(() => { for (let i = 0; i < 120; i++) __game.frameOnce(1 / 120); });
        assert.deepEqual(await snapshot(), stopped, 'reading the guide freezes time, enemies and native hook count');
        assert.equal(await page.locator('#ovPause').isVisible(), false, 'pointer unlock does not open settings');
        assert.equal(await page.locator('#hookGuideSpot').isVisible(), true);
        const target = await page.locator('#hookGuideSpot').boundingBox(), card = await page.locator('.hook-guide-card').boundingBox();
        assert.ok(target && card && (target.y + target.height <= card.y || card.y + card.height <= target.y || target.x + target.width <= card.x || card.x + card.width <= target.x), 'guide does not cover the highlighted target');
        if (lang === 'en') assert.doesNotMatch(await page.locator('#hookGuide').innerText(), /[ぁ-んァ-ヶ一-龠]/);
        await page.screenshot({ path: `browser-evidence/hook-tutorial/${tag}-explain.png` });
        await page.locator('#hookGuideTry').click();
        await page.evaluate(() => __game.frameOnce(1 / 120));
        if (touch) {
          const xy = await page.evaluate(() => { const g = __skyInternals, a = skyHookTutorial.target.anchor, p = g.hookAssist().inspect(a), r = document.getElementById('c').getBoundingClientRect(); return { x: p.x + r.x, y: p.y + r.y }; });
          await page.touchscreen.tap(xy.x, xy.y);
        } else await page.keyboard.press('q');
        await page.evaluate(() => __game.frameOnce(1 / 120));
        assert.equal(await page.evaluate(() => skyHookTutorial.phase), 'flight', 'the existing input attaches the native hook');
        assert.equal((await snapshot()).hooks, stopped.hooks + 1);
        const flight = await page.evaluate(() => {
          const startT = __game.GAME.t, zs = __skyInternals.Jt.map(z => z.pos.toArray());
          for (let k = 0; k < 1000 && skyHookTutorial.phase === 'flight'; k++) __game.advance(1 / 120);
          return { phase: skyHookTutorial.phase, time: __game.GAME.t, startT, before: zs, after: __skyInternals.Jt.map(z => z.pos.toArray()), onGround: __game.P.onGround };
        });
        assert.equal(flight.phase, 'success', JSON.stringify({ route, flight })); assert.equal(flight.onGround, true);
        assert.equal(flight.time, flight.startT); assert.deepEqual(flight.after, flight.before);
        await page.evaluate(() => __game.advance(.1)); assert.ok((await snapshot()).t > stopped.t, 'world resumes on landing');
        assert.equal(await page.locator('#tPull, #hookGuidePull').count(), 0, 'no extra pull action exists');
        assert.deepEqual(errors, []);
        console.log('PASS', tag, JSON.stringify(route));
      } catch (e) { await page.screenshot({ path: `browser-evidence/hook-tutorial/${tag}-failure.png` }).catch(() => {}); throw e; }
      finally { await context.close(); }
    }
  } finally { await browser?.close(); server?.kill(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
