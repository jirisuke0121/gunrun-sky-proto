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
    browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    for (const device of ['desktop', 'touch-landscape']) for (const map of ['index.html', 'canyon.html']) {
      const id = `${device}-${map.split('.')[0]}`;
      const context = await browser.newContext({ viewport: device === 'desktop' ? { width: 1280, height: 720 } : { width: 844, height: 390 }, hasTouch: device !== 'desktop', isMobile: device !== 'desktop', deviceScaleFactor: 1 });
      // Keep test records out of the ranking, including requests made on exit.
      await context.route('**/*', route => {
        const url = route.request().url();
        return url.startsWith(base) || /^(data|blob):/.test(url) ? route.continue() : route.abort();
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      try {
        await page.goto(new URL(map, base).href, { waitUntil: 'load' });
        await page.waitForFunction(() => window.__game && window.skyHumanView, { timeout: 60000 });
        await page.locator('#humanSel [data-human="unity"]').click();
        await page.waitForFunction(() => document.body.dataset.skyHumanLoaded === 'true', { timeout: 60000 });
        assert.equal(await page.evaluate(() => document.body.dataset.skyHumanRunStyle), 'parkour');
        await page.locator('#bStart').click();
        await page.waitForFunction(() => window.__game.mode === 'play');
        // Exercise the real start/input/physics loop before isolating poses.
        await page.keyboard.down('w');
        await page.waitForTimeout(700);
        await page.keyboard.up('w');
        assert.equal(await page.evaluate(() => window.__game.mode), 'play');
        await page.screenshot({ path: path.join(output, `${id}-play.png`) });

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
        });
        const run = (action, count) => page.evaluate(([a, n]) => window.__runningQA(a, n), [action, count]);
        let state = await run('run', 60);
        assert.ok(+state.dataset.skyHumanRunBlend > .99 && state.visible && state.calls >= 7 && state.triangles > 1000, JSON.stringify(state));
        assert.equal(state.error, 0, 'run WebGL error');
        await page.screenshot({ path: path.join(output, `${id}-run.png`) });
        const renderer = state.renderer;
        state = await run('turn', 30); assert.ok(Math.abs(state.bank) > .02); assert.equal(state.error, 0);
        await page.screenshot({ path: path.join(output, `${id}-turn.png`) });
        state = await run('shot', 6); assert.ok(+state.dataset.skyHumanRunBlend < .1); assert.equal(state.error, 0);
        state = await run('run', 40); assert.ok(+state.dataset.skyHumanRunBlend > .99);
        state = await run('reload', 6); assert.ok(+state.dataset.skyHumanRunBlend < .1); assert.equal(state.error, 0);
        state = await run('walk', 30); assert.equal(state.dataset.skyHumanClip, 'walkForward');
        state = await run('side', 30); assert.equal(state.dataset.skyHumanClip, 'runRight');
        state = await run('back', 30); assert.equal(state.dataset.skyHumanClip, 'runBack');
        state = await run('jump', 20); assert.equal(state.dataset.skyHumanClip, 'jump');
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
        await page.screenshot({ path: path.join(output, `${id}-return.png`) });
        assert.deepEqual(errors, [], 'browser console/page errors');
        results.push({ id, status: 'passed', renderer, checks: 16 });
        console.log(`PASS ${id}: real WebGL, start/input, run/turn, firing/reload, walking/side/back, existing actions, pause, stop, view switch; ${renderer}`);
      } catch (error) {
        await page.screenshot({ path: path.join(output, `${id}-failure.png`) }).catch(() => {});
        results.push({ id, status: 'failed', error: error.message, browserErrors: errors });
        throw error;
      } finally { await context.close(); }
    }
  } finally {
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
    await browser?.close(); server?.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
