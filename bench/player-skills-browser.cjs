const assert = require('node:assert/strict'), fs = require('node:fs'), { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const base = process.env.RUNNING_QA_URL || 'http://127.0.0.1:8773/';
fs.mkdirSync('browser-evidence', { recursive: true });
(async () => {
  let server, browser; const results = [];
  try {
    if (!process.env.RUNNING_QA_URL) {
      server = spawn('python3', ['-m', 'http.server', '8773', '--bind', '127.0.0.1'], { stdio: 'ignore' });
      for (let i = 0; i < 100; i++) { if (await fetch(base).then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
    }
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const layouts = [
      { name: 'desktop', width: 1280, height: 720, touch: false },
      { name: 'touch', width: 844, height: 390, touch: true },
      { name: 'portrait-right', width: 390, height: 844, touch: true, rotation: '1' },
      { name: 'portrait-left', width: 390, height: 844, touch: true, rotation: '-1' },
    ];
    for (const layout of layouts) for (const map of ['index.html', 'canyon.html']) {
      const id = `skills-${map.split('.')[0]}-${layout.name}`;
      const context = await browser.newContext({ viewport: { width: layout.width, height: layout.height }, hasTouch: layout.touch, isMobile: layout.touch, deviceScaleFactor: 1 });
      await context.addInitScript(rotation => { window.__hold = true; if (rotation) localStorage.setItem('gunrun-rotdir', rotation); }, layout.rotation);
      await context.route('**/*', route => {
        const url = route.request().url();
        if (new URL(url).hostname === 'gunrun-runs.jirisuke0121.workers.dev') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0,"me":null,"ok":true}' });
        if (new URL(url).pathname === '/favicon.ico') return route.fulfill({ status: 204, body: '' });
        return url.startsWith(base) || /^(blob|data):/.test(url) ? route.continue() : route.abort();
      });
      const page = await context.newPage(), errors = [];
      page.setDefaultTimeout(60000); page.on('pageerror', e => errors.push(e.message));
      try {
        await page.goto(new URL(map, base).href);
        await page.waitForFunction(() => window.__game && window.skyDecoy && window.skyHumanView && document.body.dataset.skyHumanLoaded === 'true');
        await page.locator('#bStart').click();
        const lane = await page.evaluate(() => {
          const g = window.__game, sky = window.__skyInternals, c = g.P;
          g.S.sendLog = false; g.S.gunOn = g.S.autoFire = g.S.aimAuto = false;
          g.SCR.off = g.PACE.off = g.MARK.off = true; g.GAME.spawnT = g.GAME.surgeT = 1e9;
          for (const e of sky.Jt) { e.dead = true; e.m.root.visible = false; }
          const supported = (x, y, zz) => sky.oe(x, y + .025, zz, .3, 1.8) && g.solids.some(b => b.solid && !b.off && b.type !== 'mono' && Math.abs(b.maxY - y) < .08 && x - .26 >= b.minX && x + .26 <= b.maxX && zz - .26 >= b.minZ && zz + .26 <= b.maxZ);
          let lane = null;
          for (const openness of [1.2, 0]) {
          if (lane) break;
          for (const n of g.NAV.nodes) {
            if (lane) break;
            for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
              let valid = true;
              for (let d = 0; d <= 13; d += .25) if (![-openness, 0, openness].every(side => supported(n.x + dx * d - dz * side, n.y, n.z + dz * d + dx * side)) || (openness && !sky.oe(n.x + dx * d, n.y + .025, n.z + dz * d, .3, 4))) { valid = false; break; }
              if (valid) { lane = { x: n.x, y: n.y, z: n.z, dx, dz }; break; }
            }
          }
          }
          if (!lane) throw Error('No supported flat lane for a real chase');
          window.__skillsPlace = distance => {
            c.pos.set(lane.x + lane.dx * distance, lane.y + .005, lane.z + lane.dz * distance); c.vel.set(0, 0, 0);
            c.state = 'normal'; c.onGround = true; c.h = 1.75; c.ledge = c.ladder = c.zip = c.hook = null;
            c.yaw = Math.atan2(lane.dx, lane.dz); c.pitch = -.15; c.camY = undefined; c.invuln = -1;
            c.lastGround.copy(c.pos); c.safe.copy(c.pos); window.skyFollowCamera?.reset();
          };
          window.__skillsFrames = count => { for (let i = 0; i < count; i++) g.advance(1 / 60); g.frameOnce(0); };
          window.__skillsLane = lane; window.__skillsPlace(6); g.frameOnce(0);
          const enemy = new sky.ri(lane.x + lane.dx * 10, lane.y + .005, lane.z + lane.dz * 10);
          enemy.spawnT = 0; enemy.flank = false; enemy.onGround = true; enemy.speedMul = 1; sky.Jt.push(enemy); window.__skillsEnemy = enemy;
          return lane;
        });
        const boxes = await page.evaluate(() => {
          const ids = ['tFlash', 'tDecoy', 'tJump', 'tSlide', 'tAutoFire'];
          return Object.fromEntries(ids.map(id => { const e = document.getElementById(id), r = e.getBoundingClientRect(); return [id, { x: r.x, y: r.y, width: r.width, height: r.height, visible: e.checkVisibility() }]; }));
        });
        const intersects = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
        for (const name of ['tFlash', 'tDecoy']) {
          const r = boxes[name]; assert.equal(r.visible, true);
          assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.width <= layout.width + 1 && r.y + r.height <= layout.height + 1, JSON.stringify(boxes));
          assert.ok(Math.min(r.width, r.height) >= 44, 'touch target at least 44px');
          for (const action of ['tJump', 'tSlide', 'tAutoFire']) if (boxes[action].visible) assert.equal(intersects(r, boxes[action]), false, `${name} overlaps ${action}`);
        }
        assert.equal(intersects(boxes.tFlash, boxes.tDecoy), false);
        // Use an actual click/tap. Releasing within the button fires once.
        if (layout.touch) await page.tap('#tDecoy'); else await page.keyboard.press('e');
        await page.evaluate(() => { window.__skillsFrames(21); });
        if (map === 'index.html' && layout.name === 'desktop') console.log('SKILL_IMAGE_split:' + (await page.screenshot({type:'jpeg',quality:60})).toString('base64'));
        const cast = await page.evaluate(() => {
          const a = window.skyDecoy.active; if (!a) throw Error('Skill input did not cast');
          window.__skillsPlace(12); window.__game.updateField();
          return { sameModel: a.body.root.name, lured: window.skyDecoy.lured.size, used: window.skyDecoy.stats.used, life: window.__game.P.life, distance: window.__skillsEnemy.pos.distanceTo(a.pos) };
        });
        assert.equal(cast.sameModel, 'Player hologram twin'); assert.ok(cast.lured >= 1); assert.equal(cast.used, 1);
        const chase = await page.evaluate(() => {
          window.__skillsFrames(60); const a = window.skyDecoy.active, e = window.__skillsEnemy;
          return { targeted: window.skyDecoy.targetFor(e) === a.pos, distance: e.pos.distanceTo(a.pos), life: window.__game.P.life, touching: e.touching(100), moved: a.pos.distanceTo(a.start), towardPlayer: e.vel.dot(window.__game.P.pos.clone().sub(e.pos)), towardClone: e.vel.dot(a.pos.clone().sub(e.pos)), gl: window.__game.debug.renderer.getContext().getError() };
        });
        assert.equal(chase.targeted, true); assert.equal(chase.touching, false, 'lured enemy cannot damage the real player');
        assert.ok(chase.towardClone > 0 && chase.towardPlayer < 0, JSON.stringify(chase));
        assert.ok(chase.distance < cast.distance + 1, JSON.stringify({ cast, chase })); assert.equal(chase.life, cast.life); assert.ok(chase.moved > 1); assert.equal(chase.gl, 0);
        await page.screenshot({ path: `browser-evidence/${id}-active.png` });
        if (map === 'index.html' && ['desktop', 'touch'].includes(layout.name)) console.log('SKILL_IMAGE_' + layout.name + ':' + (await page.screenshot({type:'jpeg',quality:60})).toString('base64'));
        const paused = await page.evaluate(() => {
          window.__game.setMode('pause'); const before = [window.skyDecoy.remaining, window.skyDecoy.cooldown]; window.__skillsFrames(60);
          return { before, after: [window.skyDecoy.remaining, window.skyDecoy.cooldown], hidden: getComputedStyle(document.getElementById('tDecoy')).visibility === 'hidden' };
        });
        assert.deepEqual(paused.after, paused.before); assert.equal(paused.hidden, true);
        const ended = await page.evaluate(() => {
          const g = window.__game, e = window.__skillsEnemy;
          g.setMode('play'); window.__skillsFrames(310);
          const expired = !window.skyDecoy.active && !window.skyDecoy.targetFor(e) && window.skyDecoy.lured.size === 0;
          const blocked = !window.skyDecoy.activate();
          g.P.invuln = 1e9; window.__skillsFrames(780);
          const ready = window.skyDecoy.cooldown === 0, beforeRecast = g.P.pos.toArray();
          // A live pursuer can physically push the idle player beyond the lane
          // during this 13s wait. Recast from the same supported test footing.
          window.__skillsPlace(6);
          return { expired, blocked, ready, beforeRecast, second: window.skyDecoy.activate(), used: window.skyDecoy.stats.used };
        });
        for (const key of ['expired','blocked','ready','second']) assert.equal(ended[key], true, key + ': ' + JSON.stringify(ended)); assert.equal(ended.used, 2);
        const flash = await page.evaluate(() => { window.skyDecoy.clear(); window.__skillsPlace(6); window.__game.frameOnce(0); return window.skyFlashbang.charges; });
        if (layout.touch) await page.tap('#tFlash'); else await page.keyboard.press('g');
        assert.equal(await page.evaluate(() => window.skyFlashbang.charges), flash - 1, 'flash still works from bottom dock');
        await page.evaluate(() => { window.__game.startGame(); window.__game.frameOnce(0); });
        assert.equal(await page.evaluate(() => window.skyDecoy.cooldown), 0, 'restart resets cooldown');
        assert.deepEqual(errors, []);
        results.push({ map, layout: layout.name, lane, boxes, cast, chase, paused, ended, errors });
        console.log('PASS', id, JSON.stringify({ lured: cast.lured, cloneMoved: chase.moved, chaseDistance: chase.distance, gl: chase.gl, expired: ended.expired, touchTargets: [boxes.tFlash, boxes.tDecoy] }));
      } catch (error) {
        await page.screenshot({ path: `browser-evidence/${id}-FAILED.png` }).catch(() => {});
        console.error('PAGE ERRORS', JSON.stringify(errors));
        console.log('SKILL_IMAGE_failed:' + (await page.screenshot({type:'jpeg',quality:60})).toString('base64')); throw error;
      } finally { await context.close(); }
    }
  } finally {
    fs.writeFileSync('browser-evidence/skills-results.json', JSON.stringify(results, null, 2));
    await browser?.close(); server?.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
