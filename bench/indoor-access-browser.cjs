const assert = require('node:assert/strict'), fs = require('node:fs');
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const base = process.env.INDOOR_QA_URL || 'http://127.0.0.1:8794/';
const out = 'outputs/indoor-entry'; fs.mkdirSync(out, { recursive: true });
(async () => {
  let server;
  if (!process.env.INDOOR_QA_URL) {
    server = spawn('python3', ['-m', 'http.server', '8794', '--bind', '127.0.0.1'], { stdio: 'ignore' });
    for (let i = 0; i < 50; i++) { if (await fetch(base).then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
  }
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    args: process.platform === 'darwin' ? ['--no-sandbox'] : ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const results = [];
  try {
    for (const touch of [false, true]) for (const map of ['index.html', 'canyon.html']) {
      const context = await browser.newContext({ locale: 'ja-JP', viewport: touch ? { width: 844, height: 390 } : { width: 1280, height: 720 }, hasTouch: touch, isMobile: touch });
      await context.addInitScript(() => window.__hold = true);
      await context.route('**/*', r => new URL(r.request().url()).origin === new URL(base).origin ? r.continue() :
        r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"top":[],"total":0}' }));
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(base + map, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.skyStartReadiness?.ready && document.body.dataset.skyGameExtensionsReady === 'true', null, { timeout: 90000 });
      if (touch) await page.locator('#bStart').tap(); else await page.locator('#bStart').click();
      await page.waitForTimeout(350);
      const start = await page.evaluate(() => {
        __game.frameOnce(0);
        return { mode: __game.mode, card: !!document.getElementById('startGuide'), hint: document.getElementById('hint').classList.contains('on'), toast: document.getElementById('toast').classList.contains('on') };
      });
      assert.equal(start.mode, 'play'); assert.equal(start.card, false); assert.equal(start.hint, false); assert.equal(start.toast, false);
      await page.screenshot({ path: `${out}/${map}-${touch ? 'touch' : 'desktop'}-start.png` });
      let indoor;
      if (map === 'index.html') {
        indoor = await page.evaluate(() => {
          const g = __game, access = g.INDOOR_ACCESS, doors = g.DOORS, feedback = g.DOOR_FEEDBACK, s = __skyInternals;
          g.S.sendLog = g.S.autoFire = g.S.aimAuto = false; g.P.invuln = Infinity;
          g.GAME.spawnT = 1e6; g.SCR.off = g.PACE.off = g.MARK.off = true; g.STALK.spawned = true;
          const clear = () => { for (const e of g.zombies) s.ue.remove(e.m.root); g.zombies.length = 0; };
          const place = (x, y, z, yaw = -Math.PI / 2) => {
            const p = g.P; p.pos.set(x, y + .01, z); p.vel.set(0, 0, 0); p.yaw = yaw; p.pitch = 0; p.state = 'normal';
            p.onGround = true; p.h = 1.75; p.ledge = p.ladder = p.zip = p.hook = p.doorAction = null;
            p.jumpBuf = p.slideBuf = 0; p.invuln = Infinity; p.lastGround.copy(p.pos); p.safe.copy(p.pos);
          };
          const enemy = (x, y, z) => { const e = new g.Zombie(x, y + .01, z); e.spawnT = e.stun = 0; e.onGround = true; g.zombies.push(e); return e; };
          const tick = seconds => { for (let i = 0; i < seconds * 60; i++) g.advance(1 / 60); };
          clear();
          const rooms = access.snapshot();
          // Every door, upstairs included, has real enemies in hitting range.
          for (const d of doors) {
            const b = d.b, x = (b.minX + b.maxX) / 2, z = (b.minZ + b.maxZ) / 2;
            enemy(x - (d.axis === 'x' ? .8 : 0), b.minY, z - (d.axis === 'z' ? .8 : 0));
          }
          for (let i = 0; i < 60 * 60; i++) feedback.step(1 / 60, doors);
          const untouched = doors.map(d => ({ hp: d.hp, phase: d.phase }));
          clear();
          // Roaming/spawn checks exercise the full loop with protected interiors.
          for (let i = 0; i < 40; i++) g.spawnZombie(12);
          let intrusions = 0;
          // Keep the human outside: invulnerability still permits contact pushes,
          // which would legitimately unlock rooms if a crowd moved the human in.
          for (let i = 0; i < 20 * 60; i++) { place(-42, 0, 8); g.advance(1 / 60); intrusions += g.zombies.filter(e => !e.dead && !access.allows(e.pos)).length; }
          const roam = { intrusions, alive: g.zombies.filter(e => !e.dead).length, entered: access.snapshot().filter(r => r.entered).length };
          clear();
          for (const d of doors) {
            const b = d.b;
            place((b.minX + b.maxX) / 2 - (d.axis === 'x' ? .4401 : 0), b.minY,
              (b.minZ + b.maxZ) / 2 - (d.axis === 'z' ? .4401 : 0));
            g.advance(1 / 60);
          }
          const doorstepProtected = access.snapshot().every(room => !room.entered);
          feedback.reset(doors);
          // A roof traversal must not authorize the rooms underneath.
          place(0, 8, 0); g.advance(1 / 60);
          const roofProtected = !access.allows({ x: 12, y: 4, z: 0 });
          // Actual body movement through an open warehouse mouth is guarded.
          place(-49, 0, 10); const e = enemy(-65, 0, 10);
          e.startAct(-62, .01, 10, .25); tick(.7);
          const entryBlocked = access.allows(e.pos) && e.pos.x <= -64.5;
          clear(); place(-15.5, 0, 0);
          window.indoorQA = { g, access, doors, feedback, clear, place, enemy, tick };
          return { rooms, untouched, roam, doorstepProtected, roofProtected, entryBlocked };
        });
        assert.equal(indoor.rooms.length, 5);
        assert.ok(indoor.untouched.every(d => d.hp === 5 && d.phase === 'closed'), JSON.stringify(indoor.untouched));
        assert.equal(indoor.roam.intrusions, 0); assert.equal(indoor.roam.entered, 0); assert.ok(indoor.roam.alive > 0);
        assert.equal(indoor.doorstepProtected, true); assert.equal(indoor.roofProtected, true); assert.equal(indoor.entryBlocked, true);
        // Use normal movement input to open and cross the west door.
        let cdp;
        if (touch) {
          cdp = await context.newCDPSession(page);
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: 150, y: 260 }] });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: 150, y: 204 }] });
          await page.waitForFunction(() => __skyInternals.inputState.y < -.99);
        } else await page.keyboard.down('w');
        const crossed = await page.evaluate(() => { indoorQA.tick(1.4); return { position: indoorQA.g.P.pos.toArray(), rooms: indoorQA.access.snapshot(), phase: indoorQA.doors[0].phase }; });
        if (touch) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          // A CDP drag must be released in the page before switching to normal taps.
          await page.waitForFunction(() => !__skyInternals.inputState.on && __skyInternals.inputState.id === null);
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        } else await page.keyboard.up('w');
        indoor.crossed = crossed;
        assert.ok(crossed.rooms[2].entered, JSON.stringify(crossed));
        const after = await page.evaluate(() => {
          const q = indoorQA; q.clear(); q.place(-42, 0, 8); q.tick(.8);
          for (const d of q.doors) { const b = d.b; q.enemy((b.minX + b.maxX) / 2 - (d.axis === 'x' ? .8 : 0), b.minY, (b.minZ + b.maxZ) / 2 - (d.axis === 'z' ? .8 : 0)); }
          for (let i = 0; i < 6 * 60; i++) q.feedback.step(1 / 60, q.doors);
          const broken = q.doors.map(d => d.phase);
          const independent = !q.access.allows({ x: -60, y: 0, z: 10 });
          q.clear(); q.place(-60, 0, 10); q.g.advance(1 / 60);
          const warehouseUnlocked = q.access.allows({ x: -60, y: 0, z: 10 });
          const e = q.enemy(-65, 0, 10); e.startAct(-62, .01, 10, .25); q.tick(.4);
          const pursuitEntered = e.pos.x > -64.5;
          return { broken, independent, warehouseUnlocked, pursuitEntered };
        });
        assert.ok(after.broken.every(phase => phase === 'broken'), JSON.stringify(after));
        assert.equal(after.independent, true); assert.equal(after.warehouseUnlocked, true); assert.equal(after.pursuitEntered, true);
        indoor.after = after;
        if (touch) await page.locator('#bSettings').tap(); else await page.keyboard.press('p');
        await page.waitForFunction(() => __game.mode === 'pause').catch(async error => {
          await page.screenshot({ path: `${out}/pause-timeout-${touch ? 'touch' : 'desktop'}.png` });
          const state = await page.evaluate(() => ({ mode: __game.mode, time: __game.GAME.t, life: __game.P.life,
            input: __skyInternals.inputState, settings: document.body.dataset.skySettings }));
          console.error('Pause timeout state:', JSON.stringify(state)); throw error;
        });
        if (touch) await page.locator('#bRestart').tap(); else await page.locator('#bRestart').click();
        const retry = await page.evaluate(() => ({ mode: __game.mode, rooms: __game.INDOOR_ACCESS.snapshot().map(r => r.entered), doors: __game.DOORS.map(d => d.hp), hint: document.getElementById('hint').classList.contains('on') }));
        assert.equal(retry.mode, 'play'); assert.ok(retry.rooms.every(entered => !entered)); assert.ok(retry.doors.every(hp => hp === 5)); assert.equal(retry.hint, false);
        indoor.retry = retry;
      }
      if (touch) await page.locator('#bSettings').tap(); else await page.keyboard.press('p');
      await page.waitForFunction(() => __game.mode === 'pause');
      if (touch) await page.locator('#bMenu').tap(); else await page.locator('#bMenu').click();
      await page.waitForFunction(() => __game.mode === 'menu');
      await page.evaluate(()=>document.getElementById('bIntro').click());
      await page.waitForTimeout(350);
      const intro = await page.evaluate(() => { __game.frameOnce(.01); return { mode: __game.mode, id: skyChallenge.id, hint: document.getElementById('hint').classList.contains('on'), toast: document.getElementById('toast').classList.contains('on') }; });
      assert.equal(intro.mode, 'play'); assert.equal(intro.id, 'intro'); assert.equal(intro.hint, false); assert.equal(intro.toast, false);
      assert.deepEqual(errors, []);
      results.push({ map, touch, start, indoor, intro, errors });
      console.log('PASS', map, touch ? 'touch' : 'desktop', indoor ? 'doors, open entries, spawning, rooftops, human crossing and pursuit' : 'clear start');
      await context.close();
    }
    fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
  } finally { await browser.close(); server?.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
