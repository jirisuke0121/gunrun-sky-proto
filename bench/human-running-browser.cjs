// Browser rendering regression checks. Run from the repository root after
// installing Playwright + Chromium. CI uses software WebGL, not a phone GPU.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const base = process.env.RUNNING_QA_URL || 'http://127.0.0.1:8771/';
const output = 'browser-evidence';
fs.mkdirSync(output, { recursive: true });

(async () => {
  let server, browser;
  const results = [];
  try {
    if (!process.env.RUNNING_QA_URL) {
      server = spawn('python3', ['-m', 'http.server', '8771', '--bind', '127.0.0.1'], { stdio: 'ignore' });
      for (let i = 0; i < 100; i++) {
        if (await fetch(base).then(r => r.ok, () => false)) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    for (const device of ['desktop', 'touch-landscape']) for (const map of ['index.html', 'canyon.html']) {
      const id = `${device}-${map.split('.')[0]}`;
      const context = await browser.newContext({ viewport: device === 'desktop' ? { width: 1280, height: 720 } : { width: 844, height: 390 }, hasTouch: device !== 'desktop', isMobile: device !== 'desktop', deviceScaleFactor: 1 });
      // Advance the real simulation explicitly. Software GPU speed must not
      // decide whether the player reaches a vault before the shooting check.
      await context.addInitScript(() => { window.__hold = true; });
      // Keep test records out of the ranking, including requests made on exit.
      await context.route('**/*', route => {
        const url = route.request().url();
        if (new URL(url).hostname === 'gunrun-runs.jirisuke0121.workers.dev') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ top: [], total: 0, me: null, ok: true }) });
        if (new URL(url).pathname === '/favicon.ico') return route.fulfill({ status: 204, body: '' });
        return url.startsWith(base) || /^(data|blob):/.test(url) ? route.continue() : route.abort();
      });
      const page = await context.newPage(), errors = [];
      page.setDefaultTimeout(60000);
      const capture = name => page.screenshot({ path: path.join(output, `${id}-${name}.png`), timeout: 60000 });
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(`${message.text()} ${message.location().url}`); });
      try {
        await page.goto(new URL(map, base).href, { waitUntil: 'load' });
        await page.waitForFunction(() => window.__game && window.skyHumanView, null, { timeout: 60000 });
        if(await page.locator('#humanSel [data-human="unity"]').count()) await page.locator('#humanSel [data-human="unity"]').click();
        await page.waitForFunction(() => window.skyHumanView.choice === 'unity' && document.body.dataset.skyHumanLoaded === 'true', null, { timeout: 60000 });
        assert.equal(await page.evaluate(() => document.body.dataset.skyHumanRunStyle), 'parkour');
        await page.locator('#bStart').click();
        await page.waitForFunction(() => window.__game.mode === 'play');
        // Exercise the real start, keyboard handlers and physics before poses.
        await page.evaluate(() => { window.__game.S.gunOn = true; window.__game.S.sendLog = false; });
        const ammo = await page.evaluate(() => window.__skyInternals.Et.ammo);
        await page.keyboard.down('e');
        await page.evaluate(() => { for (let i = 0; i < 20; i++) window.__game.advance(1 / 60); });
        await page.keyboard.up('e');
        assert.ok(await page.evaluate(() => window.__skyInternals.Et.ammo) < ammo, 'real shooting input consumes ammunition');
        await page.keyboard.down('w');
        await page.evaluate(() => { for (let i = 0; i < 20; i++) window.__game.advance(1 / 60); window.__game.frameOnce(0); });
        await page.keyboard.up('w');
        assert.equal(await page.evaluate(() => window.__game.mode), 'play');
        await capture('play');

        await page.evaluate(() => {
          window.__hold = true;
          const g = window.__game, c = g.P;
          g.S.sendLog = false; g.S.gunOn = true; g.S.autoSprint = true;
          // Controlled animation poses above the map avoid camera occlusion.
          // The unmodified game renderer still draws every resulting frame.
          c.pos.set(0, 200, 0); c.camY = 201.62; c.vel.set(0, 0, -6);
          c.state = 'normal'; c.onGround = true; c.yaw = 0; c.pitch = -.1; c.eye = 1.62;
          window.__runningQA = (action, count = 30) => {
            const sky = window.__skyInternals;
            if (action === 'shot') sky.Et.ammo--;
            sky.Et.reloadT = action === 'reload' ? 1 : 0;
            for (let i = 0; i < count; i++) {
              c.state = 'normal'; c.onGround = true;
              const speed = action === 'stop' ? 0 : action === 'walk' ? 4.6 : 6;
              if (action === 'turn') c.yaw += .015;
              c.vel.set(-Math.sin(c.yaw) * speed, 0, -Math.cos(c.yaw) * speed);
              if (action === 'side') c.vel.set(6, 0, 0);
              if (action === 'back') c.vel.set(0, 0, 6);
              if (action === 'jump') { c.onGround = false; c.vel.y = 7.2; }
              if (action === 'apex') { c.onGround = false; c.vel.y = 0; }
              if (action === 'fall') { c.onGround = false; c.vel.y = -5; }
              if (action === 'slide') { c.state = 'slide'; c.slideT = .5; }
              if (action === 'ladder') { c.state = 'ladder'; c.vel.set(0, 1.5, 0); }
              c.pos.addScaledVector(c.vel, 1 / 60);
              g.cam(1 / 60); window.skyHumanView.update(1 / 60);
            }
            g.frameOnce(0);
            const r = g.debug.renderer, holder = sky.ue.children.find(o => o.name === 'Unity challenge human');
            const gl = r.getContext(), extension = gl.getExtension('WEBGL_debug_renderer_info');
            return { dataset: { ...document.body.dataset }, visible: holder.visible, bank: holder.rotation.z,
              calls: r.info.render.calls, triangles: r.info.render.triangles, error: gl.getError(),
              renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
          };
          window.__runningQALedge = (kind, phase) => {
            const sky = window.__skyInternals, T = sky.Geom;
            if (window.__qaLedgeBox) { const old = window.__qaLedgeBox; sky.ue.remove(old.mesh); old.mesh.geometry.dispose(); old.mesh.material.dispose(); sky.jn.splice(sky.jn.indexOf(old.solid), 1); }
            const height = kind === 'vault' ? .9 : 1.8;
            const solid = { minX: -1, maxX: 1, minY: 200, maxY: 200 + height, minZ: -2.2, maxZ: -.2, solid: true, type: 'box' };
            const mesh = new T.Mesh(new T.Box(2, height, 2), new T.Standard({ color: 0x507d89 }));
            mesh.position.set(0, 200 + height / 2, -1.2); sky.ue.add(mesh); sky.jn.push(solid); window.__qaLedgeBox = { mesh, solid };
            c.pos.set(0, 200, .6); c.vel.set(0, 0, 0); c.yaw = 0; c.pitch = -.12; c.camY = 201.62; c.onGround = false;
            c.state = 'ledge'; c.ledge = { kind, sx: 0, sy: 200, sz: .6, tx: 0, ty: 200 + height + .002, tz: -.7, dx: 0, dz: -1, speed: 6, low: false, t: 0, dur: kind === 'vault' ? .3 : .6 };
            // playerStep runs the game's actual ledge interpolation (B_), not a
            // copied animation clock. The blue block is a test-only fixture.
            g.playerStep(c.ledge.dur * phase); g.cam(1 / 60); window.skyHumanView.update(1 / 60); g.frameOnce(0);
            const weapon = sky.ue.children.find(o => o.name === 'Unity human held weapon');
            return { ...document.body.dataset, weaponVisible: weapon?.visible, error: g.debug.renderer.getContext().getError() };
          };
        });
        const run = (action, count) => page.evaluate(([a, n]) => window.__runningQA(a, n), [action, count]);
        let state = await run('run', 60);
        assert.ok(+state.dataset.skyHumanRunBlend > .99 && state.visible && state.calls >= 7 && state.triangles > 1000, JSON.stringify(state));
        assert.equal(state.error, 0, 'run WebGL error');
        await capture('run');
        const renderer = state.renderer;
        state = await run('turn', 30); assert.ok(Math.abs(state.bank) > .02); assert.equal(state.error, 0);
        await capture('turn');
        state = await run('shot', 6); assert.ok(+state.dataset.skyHumanRunBlend < .1); assert.equal(state.error, 0);
        state = await run('run', 40); assert.ok(+state.dataset.skyHumanRunBlend > .99);
        state = await run('reload', 6); assert.ok(+state.dataset.skyHumanRunBlend < .1); assert.equal(state.error, 0);
        state = await run('walk', 30); assert.equal(state.dataset.skyHumanClip, 'walkForward');
        state = await run('side', 30); assert.equal(state.dataset.skyHumanClip, 'runRight');
        state = await run('back', 30); assert.equal(state.dataset.skyHumanClip, 'runBack');
        state = await run('jump', 20); assert.equal(state.dataset.skyHumanClip, 'jump');
        assert.equal(state.dataset.skyHumanAction, 'parkourJump');
        await capture('jump-rise');
        state = await run('apex', 12); assert.ok(+state.dataset.skyHumanJumpPhase > .45); await capture('jump-apex');
        state = await run('fall', 12); assert.ok(+state.dataset.skyHumanJumpPhase > .6); await capture('jump-fall');
        for (const kind of ['vault', 'mantle', 'catch']) for (const phase of [.25, .5, .85]) {
          const action = await page.evaluate(([kind, phase]) => window.__runningQALedge(kind, phase), [kind, phase]);
          assert.equal(action.skyHumanClip, kind); assert.equal(action.error, 0); assert.equal(action.weaponVisible, false);
          if (phase < .7) assert.ok(+action.skyHumanHandError < .002, `${kind}: hand contact ${action.skyHumanHandError}`);
          await capture(`${kind}-${phase}`);
        }
        await page.evaluate(() => { const sky = window.__skyInternals, box = window.__qaLedgeBox; sky.ue.remove(box.mesh); sky.jn.splice(sky.jn.indexOf(box.solid), 1); box.mesh.geometry.dispose(); box.mesh.material.dispose(); window.__game.P.ledge = null; });
        state = await run('slide', 20); assert.equal(state.dataset.skyHumanClip, 'slide');
        state = await run('ladder', 20); assert.equal(state.dataset.skyHumanClip, 'ladder');
        state = await run('stop', 30); assert.equal(state.dataset.skyHumanClip, 'idle'); assert.ok(+state.dataset.skyHumanRunBlend < .01);
        await page.evaluate(() => window.__game.setMode('pause'));
        const phase = state.dataset.skyHumanGaitPhase;
        state = await run('run', 30); assert.equal(state.dataset.skyHumanGaitPhase, phase);
        await page.evaluate(() => window.__game.setMode('play'));
        await page.keyboard.press('v');
        state = await run('stop', 1); assert.equal(state.dataset.skyHumanView, 'first');
        await page.keyboard.press('v');
        state = await run('run', 60); assert.equal(state.dataset.skyHumanView, 'third'); assert.equal(state.error, 0);
        await capture('return');
        assert.deepEqual(errors, [], 'browser console/page errors');
        results.push({ id, status: 'passed', renderer, checks: 16 });
        console.log(`PASS ${id}: real WebGL, start/input, run/turn, firing/reload, rise/apex/fall, actual ledge interpolation, vault/mantle/catch hand contact, existing actions, pause, stop, view switch; ${renderer}`);
      } catch (error) {
        await capture('failure').catch(() => {});
        results.push({ id, status: 'failed', error: error.message, browserErrors: errors });
        throw error;
      } finally { await context.close(); }
    }
  } finally {
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
    await browser?.close(); server?.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
