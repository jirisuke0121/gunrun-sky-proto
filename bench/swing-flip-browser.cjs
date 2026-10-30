const assert = require('node:assert/strict'), fs = require('node:fs'), { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const base = process.env.RUNNING_QA_URL || 'http://127.0.0.1:8783/';
const out = 'browser-evidence/swing-flip'; fs.mkdirSync(out, { recursive: true });
(async () => {
  let server;
  if (!process.env.RUNNING_QA_URL) {
    server = spawn('python3', ['-m', 'http.server', '8783', '--bind', '127.0.0.1'], { stdio: 'ignore' });
    for (let i = 0; i < 50; i++) { if (await fetch(base).then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
  }
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    args: process.platform === 'darwin' ? ['--no-sandbox'] : ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const results = [];
  try {
    for (const touch of [false, true]) for (const map of ['canyon.html', 'index.html']) {
      const id = `${map.split('.')[0]}-${touch ? 'touch' : 'desktop'}`, errors = [];
      const ctx = await browser.newContext({ viewport: touch ? { width: 844, height: 390 } : { width: 1280, height: 720 }, hasTouch: touch, isMobile: touch });
      await ctx.addInitScript(() => window.__hold = true);
      await ctx.route('https://**/*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0,"ok":true}' }));
      const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
      await p.goto(base + map, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await p.waitForFunction(() => window.skySwing && document.body.dataset.skyHumanLoaded === 'true', null, { timeout: 120000 });
      await p.locator('#bStart').click(); console.log('loaded', id);
      await p.evaluate(({ fps }) => {
        const g = __game, c = g.P, s = __skyInternals;
        g.S.sendLog = false; g.S.autoFire = g.S.aimAuto = false; c.invuln = Infinity;
        window.flipTick = () => {
          const stepFps = window.flipFps || fps;
          for (let i = 0; i < 120 / stepFps; i++) g.playerStep(1 / 120);
          g.cam(1 / stepFps); const cameraBeforeBody = s.Se.quaternion.clone(); skyHumanView.update(1 / stepFps);
          return { pos: c.pos.toArray(), velocity: c.vel.toArray(), ground: c.onGround, state: c.state,
            bar: skySwing.active?.bar.id, angle: skySwing.active?.angle, omega: skySwing.active?.omega,
            flight: c.swingFlight && { ...c.swingFlight }, phase: document.body.dataset.skyHumanFlipPhase,
            pitch: +document.body.dataset.skyHumanReleaseAccent, camera: s.Se.quaternion.toArray(),
            cameraRoll: s.Se.rotation.z,
            cameraBodyTurn: cameraBeforeBody.angleTo(s.Se.quaternion),
            cameraForward: new s.Geom.Vector3(0, 0, -1).applyQuaternion(s.Se.quaternion)
              .dot(new s.Geom.Vector3(-Math.sin(c.yaw), 0, -Math.cos(c.yaw))),
            reward: { remaining: skyDash.swingRemaining, factor: skyDash.speed(1), status: document.getElementById('dashStatus').textContent, hidden: document.getElementById('dashStatus').hidden },
            heading: c.yaw, clip: document.body.dataset.skyHumanClip,
            cue: { ready: document.getElementById('swingHint').dataset.ready === 'true',
              visible: !document.getElementById('swingHint').hidden,
              progress: +document.getElementById('swingHint').style.getPropertyValue('--swing-progress'),
              hintColor: getComputedStyle(document.getElementById('swingHint')).backgroundColor,
              buttonColor: getComputedStyle(document.getElementById('tJump')).backgroundColor,
              grips: s.ue.getObjectsByProperty('type', 'Mesh').filter(m => m.userData.swingBar && m.userData.swingBar === skySwing.active?.bar.id)
                .map(m => m.material.color.getHex()) } };
        };
        window.flipSetup = () => {
          skySwing.reset(); skyLandingRoll.reset(); skyDash.reset(false); Object.keys(g.keys).forEach(k => g.keys[k] = false);
          const course = skySwing.course, at = course.oldTown ? course.routes[0].approach : [-16.9, 5.2001, -6];
          g.placeAt({ x: at[0], y: at[1], z: at[2], yaw: course.oldTown ? Math.PI : -Math.PI / 2 });
          c.onGround = true; c.state = 'normal'; c.h = 1.75; c.vel.set(0, 0, 0); c.jumpBuf = 0; c.coyote = .15;
          c.pitch = 0; c.camY = c.pos.y + 1.62; c.catchCD = 0; c.crouchPressed = false; c.invuln = Infinity;
          c.roll = c.shake = c.landDip = 0; c.eye = 1.62;
          window.skyFollowCamera?.reset();
          g.S.gunOn = false; g.keys.KeyW = true;
          window.flipTrace = []; window.flipCueAge = null; return flipTick();
        };
        window.flipRender = () => { g.debug.renderer.clear(); g.debug.renderer.render(s.ue, s.Se); };
      }, { fps: touch ? 20 : 60 });
      const jump = async () => touch ? p.locator('#tJump').tap() : p.keyboard.press('Space');
      const cases = [];
      for (const perfect of [false, true]) {
        await p.evaluate(({perfect, touch}) => { window.flipFps = perfect && touch ? 20 : 60; flipSetup(); for (let i = 0; i < 8; i++) flipTick(); }, {perfect, touch});
        await jump();
        const releases = [], bars = new Set(); let last, captured = false;
        for (let chunk = 0; chunk < 20; chunk++) {
          const part = await p.evaluate(({ perfect }) => {
            const trace = []; let ready = false;
            for (let i = 0; i < 100; i++) {
              const a = skySwing.active;
              const green = a && document.getElementById('swingHint').dataset.ready === 'true';
              if (!green) window.flipCueAge = null;
              else if (window.flipCueAge === null) window.flipCueAge = a.age;
              // React to the rendered cue after 100 ms; touch runs at 20 fps.
              if (a && (perfect ? green && a.age - window.flipCueAge >= .1 - 1e-8 : a.angle >= .4 && a.omega > 1.1)) { ready = true; break; }
              const frame = flipTick(); trace.push(frame); flipTrace.push(frame);
              if (!skySwing.active && __game.P.onGround && flipTrace.some(f => f.bar)) break;
            }
            return { ready, trace, last: trace.at(-1), bar: skySwing.active?.bar.id };
          }, { perfect });
          part.trace.forEach(f => { if (f.bar) bars.add(f.bar); }); last = part.last || last;
          if (part.ready) {
            bars.add(part.bar);
            if (perfect && releases.length === 0) { await p.evaluate(() => flipRender()); await p.screenshot({ path: `${out}/${id}-cue.png` }); }
            await jump();
            const release = await p.evaluate(() => { window.flipCueAge = null; const frame = flipTick(); flipTrace.push(frame); return frame; });
            assert.ok(release.flight, JSON.stringify(release));
            assert.equal(release.flight.perfect, perfect);
            assert.ok(perfect ? release.reward.remaining > 3.9 && Math.abs(release.reward.factor - 1.08) < 1e-8 && !release.reward.hidden && release.reward.status.includes('速度 +8% ↑') : release.reward.remaining === 0 && release.reward.hidden, 'only successful timing grants and displays the movement reward');
            assert.ok(!release.cue.visible && release.cue.buttonColor !== 'rgb(126, 240, 170)', 'cue clears on release');
            releases.push(release);
            console.log(id, perfect ? 'perfect' : 'ordinary', part.bar, 'duration', release.flight.flipDuration);
            if (perfect && (map === 'index.html' || releases.length === 2)) {
              await p.evaluate(() => { while (__game.P.swingFlight && __game.P.swingFlight.age < __game.P.swingFlight.flipDuration * .5) { const f = flipTick(); flipTrace.push(f); } flipRender(); });
              await p.screenshot({ path: `${out}/${id}-flip.png` }); captured = true;
            }
          } else if (last?.ground) break;
        }
        const trace = await p.evaluate(() => flipTrace);
        fs.writeFileSync(`${out}/${id}-${perfect ? 'perfect' : 'ordinary'}-trace.json`, JSON.stringify(trace));
        assert.equal(bars.size, map === 'canyon.html' ? 2 : 1, JSON.stringify({ id, perfect, last, bars: [...bars] }));
        assert.ok(last?.ground && last.pos[1] >= (map === 'canyon.html' ? 7.99 : 14.99), JSON.stringify({ id, perfect, last }));
        if (perfect) {
          const green = trace.filter(f => f.bar && f.cue.ready && f.cue.visible);
          assert.ok(green.length >= 2, 'green cue remains visible during response delay');
          assert.ok(green.every(f => f.cue.hintColor === 'rgb(126, 240, 170)' && f.cue.buttonColor === 'rgb(126, 240, 170)' && f.cue.grips.length === 2 && f.cue.grips.every(c => c === 0x7ef0aa)), 'hint, touch button and held grip are bright green together');
          assert.ok(trace.some(f => f.bar && !f.cue.ready && f.cue.progress > 0 && f.cue.progress < 1), 'preparation meter progresses before green');
          assert.ok(captured && trace.some(f => +f.phase > .3 && +f.phase < .8), 'full turn passes through the tucked midpoint');
          // At each subsequent catch or touchdown, the preceding flight has
          // already returned to an upright, untucked pose.
          for (let i = 1; i < trace.length; i++) if (!trace[i].flight && trace[i - 1].flight?.perfect)
            assert.equal(+trace[i - 1].phase, 1, JSON.stringify({ id, previous: trace[i - 1], next: trace[i] }));
          const airborne = trace.filter(f => f.flight?.perfect);
          assert.ok(airborne.every(f => Math.abs(f.heading - airborne[0].heading) < 1e-8), 'body turn never steers travel heading');
          assert.ok(airborne.every(f => f.cameraBodyTurn < 1e-6 && f.cameraForward > .95),
            JSON.stringify({ id, message: 'camera keeps looking ahead without following the body turn',
              frames: airborne.filter(f => f.cameraBodyTurn >= 1e-6 || f.cameraForward <= .95).map(f => ({age:f.flight.age,bodyTurn:f.cameraBodyTurn,forward:f.cameraForward,heading:f.heading})) }));
        } else assert.ok(trace.every(f => !f.flight?.perfect), 'ordinary release never adds a somersault');
        const landing = await p.evaluate(() => { flipRender(); return { speed: Math.hypot(__game.P.vel.x, __game.P.vel.z), clip: document.body.dataset.skyHumanClip }; });
        assert.ok(landing.speed > 5, JSON.stringify(landing));
        await p.screenshot({ path: `${out}/${id}-${perfect ? 'perfect' : 'ordinary'}-landing.png` });
        await jump(); const repeat = await p.evaluate(() => flipTick());
        assert.ok(!repeat.ground && repeat.velocity[1] > 0, JSON.stringify(repeat));
        const stride = await p.evaluate(() => { for (let i = 0; i < 10; i++) flipTick(); return { state: __game.P.state }; });
        cases.push({ perfect, bars: [...bars], releases, landing: last, immediateJump: repeat, stride, trace });
      }
      const statusLayout = async name => {
        const layout = await p.evaluate(() => {
          __game.cam(0); flipRender();
          const r = document.getElementById('dashStatus').getBoundingClientRect();
          const overlaps = ['tFlash','tDecoy','tJump','tAutoFire'].filter(id => {
            const e = document.getElementById(id), q = e.getBoundingClientRect();
            return getComputedStyle(e).display !== 'none' && r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top;
          });
          return { x:r.x, y:r.y, width:r.width, height:r.height, vw:innerWidth, vh:innerHeight, overlaps,
            underLife: document.getElementById('dashStatus').previousElementSibling?.classList.contains('life'),
            text: document.getElementById('dashStatus').textContent, hidden: document.getElementById('dashStatus').hidden };
        });
        assert.ok(!layout.hidden && layout.x >= 0 && layout.y >= 0 && layout.x + layout.width <= layout.vw && layout.y + layout.height <= layout.vh, JSON.stringify(layout));
        assert.deepEqual(layout.overlaps, []); assert.ok(layout.underLife); assert.match(layout.text, /^速度 \+\d+% ↑$/); await p.screenshot({ path: `${out}/${id}-${name}.png` }); return layout;
      };
      const layouts = [await statusLayout('speed-status')];
      if (touch) { await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(150); layouts.push(await statusLayout('speed-status-portrait')); }
      const gl = await p.evaluate(() => __game.debug.renderer.getContext().getError());
      assert.equal(gl, 0); assert.deepEqual(errors, []); results.push({ id, cases, layouts, gl, errors });
      fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
      console.log('PASS', id, 'ordinary/perfect routes, full turn before regrip/touchdown, level camera, momentum, immediate next jump');
      await ctx.close();
    }
  } finally { await browser.close(); server?.kill(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
