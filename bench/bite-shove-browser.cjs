// Real-game check of bite + shove: three zombies pin the player, one lands a hit, and after the
// bite pose the crowd must be thrown outward and stunned while the player keeps control.
const assert = require('node:assert/strict'), fs = require('node:fs'), { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const base = process.env.RUNNING_QA_URL || 'http://127.0.0.1:8779/';
fs.mkdirSync('browser-evidence', { recursive: true });
(async () => {
  let server, browser; const results = [];
  try {
    if (!process.env.RUNNING_QA_URL) {
      server = spawn('python3', ['-m', 'http.server', '8779', '--bind', '127.0.0.1'], { stdio: 'ignore' });
      for (let i = 0; i < 100; i++) { if (await fetch(base).then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
    }
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    for (const map of ['index.html', 'canyon.html']) {
      const context = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
      await context.addInitScript(() => { window.__hold = true; });
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
        await page.waitForFunction(() => window.__game && window.skyBite && window.skyHumanView && document.body.dataset.skyHumanLoaded === 'true');
        await page.locator('#bStart').click();
        await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 120; i++) g.advance(1 / 60); g.frameOnce(0); });
        const setup = await page.evaluate(() => {
          const g = window.__game, sky = window.__skyInternals, c = g.P;
          g.S.sendLog = false; g.S.gunOn = g.S.autoFire = g.S.aimAuto = false;
          g.SCR.off = g.PACE.off = g.MARK.off = true; g.GAME.spawnT = g.GAME.surgeT = 1e9;
          const live = sky.Jt.filter(e => !e.dead && !e.remove).slice(0, 3);
          if (live.length < 3) return { error: 'fewer than 3 zombies', n: live.length };
          // Stand on the current spot, clear nearby state, and pin the player with three zombies at 0.7 m.
          c.vel.set(0, 0, 0); c.invuln = -1; c.life = 8;
          window.__pin = () => {
            c.invuln = -1; c.vel.set(0, 0, 0);
            live.forEach((e, i) => {
              const a = i * 2.094 + .4;
              e.pos.set(c.pos.x + Math.cos(a) * 1, c.pos.y, c.pos.z + Math.sin(a) * 1);
              e.vel.set(0, 0, 0); e.stun = 0; e.atkT = 0; e.atkCD = 0; e.rise = null; e.act = null; e.fall = null; e.spawnT = 0; e.onGround = true;
            });
          };
          window.__live = live; window.__pin();
          // Crowd watch: while the player is held, the other zombies must neither sit inside the body, nor pop around, nor run on the spot.
          window.__crowdLog = { frames: 0, minD: 9, maxStep: 0, maxVel: 0, frozen: 0 };
          let lockFrames = 0; const prev = new Map();
          window.__crowdWatch = () => {
            const P = window.__game.P, B = window.skyBite;
            if (!B.locked) { lockFrames = 0; prev.clear(); return; }
            lockFrames++;
            for (const e of live) {
              const last = prev.get(e); prev.set(e, [e.pos.x, e.pos.z]);
              if (e.biteHold || e.dead || e.remove || e.act || e.fall || e.rise || lockFrames < 14) continue;   // the first 0.23 s may still be settling (lunges, drops)
              const L = window.__crowdLog;
              L.frames++; L.minD = Math.min(L.minD, Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z));
              if (last) L.maxStep = Math.max(L.maxStep, Math.hypot(e.pos.x - last[0], e.pos.z - last[1]));
              L.maxVel = Math.max(L.maxVel, Math.hypot(e.vel.x, e.vel.z)); if (e.biteCrowd) L.frozen++;
            }
          };
          return { ok: true, life: c.life, state: c.state, onGround: c.onGround };
        });
        assert.ok(setup.ok, JSON.stringify(setup));
        // Wait for the first hit.
        const frames = await page.evaluate(() => { const g = window.__game; let n = 0;
          while (g.P.life >= 8 && n < 900) { g.advance(1 / 60); n++; } g.frameOnce(0); return n; });
        assert.ok(frames < 900, `${map}: no hit within 15 s of game time`);
        const hit = await page.evaluate(() => {
          const c = window.__game.P, sky = window.__skyInternals;
          return { life: c.life, speed: Math.hypot(c.vel.x, c.vel.z), biting: window.skyBite.biting, invuln: window.skyBite.invulnerable,
            cue: document.getElementById('invulnEdge') ? true : false, stats: JSON.stringify(window.__game.stats).slice(0, 0) };
        });
        // Render a few chosen moments (repeated software-GL renders crash this sandbox's Chromium).
        const poses = {};
        const frameAt = async (extra, name) => {
          const pose = await page.evaluate(n => {
            const g = window.__game, sky = window.__skyInternals;
            for (let i = 0; i < n; i++) { g.advance(1 / 60); window.__crowdWatch(); }
            for (let i = 0; i < 4; i++) g.frameOnce(1 / 60);   // renders: lets the morph weights settle
            let weights = null;
            sky.ue.traverse(o => { const d = o.morphTargetDictionary; if (!weights && d && d.parkourBite_000 !== undefined && o.name.startsWith('Body')) weights = ['parkourBite_000', 'parkourBite_001', 'parkourBite_002'].map(k => +o.morphTargetInfluences[d[k]].toFixed(2)); });
            return { blood: window.skyBite.bloodActive, splat: window.skyBite.splatCount, px: g.P.pos.x, pz: g.P.pos.z, locked: window.skyBite.locked, minD: +Math.min(...window.__live.map(e => Math.hypot(e.pos.x - g.P.pos.x, e.pos.z - g.P.pos.z))).toFixed(2), biting: window.skyBite.biting, inv: window.skyBite.invulnerable, holster: window.skyBite.holster, weights,
              edge: document.getElementById('invulnEdge')?.style.opacity };
          }, extra);
          poses[name] = pose;
        };
        await page.evaluate(() => { window.__game.keys.KeyW = true; });   // the player tries to walk away the whole time
        await frameAt(0, 'a-hit');
        await frameAt(8, 'b-bitten');     // about 0.2 s: held
        // The lean must not stack up when the display draws more often than the sim steps (120 Hz screens).
        const lean = await page.evaluate(() => {
          const biter = window.__live.find(e => e.biteHold); if (!biter) return { error: 'no biter' };
          const q = () => biter.m.root.quaternion.toArray().map(v => +v.toFixed(4));
          window.skyBite.body(null, false); const first = q();
          for (let i = 0; i < 5; i++) window.skyBite.body(null, false);
          const root = biter.m.root, plain = new root.quaternion.constructor().setFromEuler(new root.rotation.constructor(0, biter.yaw, 0));
          return { first, again: q(), tilt: 2 * Math.acos(Math.min(1, Math.abs(root.quaternion.dot(plain)))) };   // lean angle in radians
        });
        assert.ok(!lean.error, `${map}: ${lean.error}`);
        assert.deepEqual(lean.again, lean.first, `${map}: the biter's lean grows with every extra draw`);
        assert.ok(lean.tilt > .15 && lean.tilt < .5, `${map}: the biter should lean over the player a little (tilt ${lean.tilt})`);
        await frameAt(46, 'c-shoved');    // about 1.0 s: just after the shove (the hold lasts 0.9 s)
        // Sample during the next 1.4 s.
        const samples = [];
        for (let i = 0; i < 40; i++) {
          samples.push(await page.evaluate(() => {
            const g = window.__game; if (window.__sampled) { for (let k = 0; k < 3; k++) g.advance(1 / 60); } window.__sampled = true;
            const c = g.P;
            const z = window.__live.map(e => ({ d: Math.hypot(e.pos.x - c.pos.x, e.pos.z - c.pos.z), stun: +(e.stun || 0).toFixed(2), f: [e.dead && 'dead', e.fall && 'fall', e.rise && 'rise', e.act && 'act', e.onBeam && 'beam', e.boss && 'boss', e.stalker && 'st'].filter(Boolean).join() }));
            return { t: performance.now(), biting: window.skyBite.biting, inv: window.skyBite.invulnerable, life: c.life,
              speed: +Math.hypot(c.vel.x, c.vel.z).toFixed(2), minD: +Math.min(...z.map(q => q.d)).toFixed(2), per: z.map(q => `${q.d.toFixed(2)}/${q.stun}/${q.f}`), maxStun: Math.max(...z.map(q => q.stun)),
              blinkOff: window.skyBite.blinkOff, dists: z.map(q => q.d), stuns: z.map(q => q.stun), deads: window.__live.map(e => !!e.dead), shoves: window.__game.stats.shoves || 0, shoved: window.__game.stats.shoved || 0, bodyVisible: document.body.dataset.skyHumanView };
          }));
        }
        await page.evaluate(() => { window.__sampled = false; });
        const peak = samples.reduce((m, s) => Math.max(m, s.minD), 0);
        const thrownCount = [0, 1, 2].filter(i => samples.some(s => s.dists[i] > 1.8)).length;
        const blinked = samples.some(s => s.blinkOff);
        const stunned = samples.some(s => s.maxStun > .3);
        const last = samples.at(-1);
        results.push({ map, hit, thrownCount, blinked, peakMinDistance: peak, stunned, lifeAfter: last.life, shoves: last.shoves, shoved: last.shoved, samples: samples.map(s => [s.minD, s.maxStun, s.biting, s.inv, s.speed, s.per.join(' | ')]) });
        assert.ok(poses['b-bitten'].weights[0] + poses['b-bitten'].weights[2] > .4 && poses['b-bitten'].weights[1] < .3, `${map}: holding pose should be on the body while bitten (${poses['b-bitten'].weights})`);
        const moved = Math.hypot(poses['b-bitten'].px - poses['a-hit'].px, poses['b-bitten'].pz - poses['a-hit'].pz);
        assert.ok(poses['b-bitten'].blood > 4, `${map}: blood should be spurting while bitten (${poses['b-bitten'].blood} drops)`);
        assert.ok(poses['b-bitten'].splat > 0, `${map}: blood should splatter on the screen (${poses['b-bitten'].splat})`);
        assert.ok(poses['a-hit'].locked && poses['b-bitten'].locked, `${map}: movement is locked while held`);
        assert.ok(moved < .25, `${map}: the player must not walk while held even with the key down (moved ${moved.toFixed(2)} m)`);
        assert.ok(!poses['c-shoved'].locked, `${map}: control returns at the shove`);
        assert.ok(poses['b-bitten'].holster, `${map}: the weapon is holstered while grabbed`);
        assert.ok(poses['c-shoved'].weights[1] > .4, `${map}: shove pose after the shove (${poses['c-shoved'].weights})`);
        assert.ok(poses['b-bitten'].minD <= .75, `${map}: the biter should be clamped onto the player while biting (got ${poses['b-bitten'].minD} m)`);
        const crowd = await page.evaluate(() => window.__crowdLog);
        assert.ok(crowd.frames > 5, `${map}: crowd watch saw too few frames (${JSON.stringify(crowd)})`);
        assert.ok(crowd.minD >= .5, `${map}: a waiting zombie sank into the player's body (${crowd.minD.toFixed(2)} m)`);
        assert.ok(crowd.maxStep < .2, `${map}: a waiting zombie popped ${crowd.maxStep.toFixed(2)} m in one frame`);
        assert.ok(crowd.maxVel < 1, `${map}: a waiting zombie keeps running against the player (v ${crowd.maxVel.toFixed(1)})`);
        assert.ok(crowd.frozen > 0, `${map}: the crowd was never held back`);
        assert.ok(last.shoves >= 1, `${map}: no shove recorded`);
        assert.ok(last.shoved >= 2, `${map}: shove should throw the crowd (got ${last.shoved})`);
        // Every zombie still alive must have been thrown (>1.8 m) or stunned; a zombie mid-drop is only stunned.
        const alive = [0, 1, 2].filter(i => !samples[0].deads[i]);
        const uncovered = alive.filter(i => !samples.some(s => s.dists[i] > 1.8) && !samples.some(s => s.stuns[i] > .3));
        assert.deepEqual(uncovered, [], `${map}: zombies neither thrown nor stunned: ${uncovered}`);
        assert.ok(thrownCount >= 1, `${map}: at least one zombie should be thrown beyond 1.8 m (got ${thrownCount})`);
        assert.ok(blinked, `${map}: the body should blink off during the invulnerable window`);
        assert.ok(stunned, `${map}: thrown zombies should be stunned`);
        assert.ok(hit.speed < 3, `${map}: the hit must not push the player (speed ${hit.speed})`);
        const invEnd = samples.findIndex(s => !s.inv);
        const afterShove = samples.slice(1, invEnd < 0 ? samples.length : invEnd);
        const lastShove = await page.evaluate(() => window.skyBite.lastShove);
        const left = afterShove.filter(s => s.dists.some((d, i) => d < .9 && s.stuns[i] === 0 && !s.deads[i]));
        assert.equal(left.length, 0, `${map}: a live zombie stayed within 0.9 m unstunned after the shove: ${JSON.stringify(left[0]?.dists)} ${JSON.stringify(left[0]?.stuns)} shove=${JSON.stringify(lastShove)}`);
        assert.ok(samples.slice(0, invEnd < 0 ? samples.length : invEnd).every(s => s.life === 7), `${map}: no second life may be lost while invulnerable`);
        assert.deepEqual(errors, [], `${map}: page errors`);
        results.at(-1).poses = poses;
        if (process.env.BITE_SHOT) await page.screenshot({ path: `browser-evidence/bite-shove-${map.split('.')[0]}.png`, timeout: 20000 }).catch(() => {});
      } catch (e) { console.log(JSON.stringify(results.at(-1))); throw e; } finally { await context.close(); }
    }
    fs.writeFileSync('browser-evidence/bite-shove.json', JSON.stringify(results, null, 1));
    console.log(JSON.stringify(results.map(r => ({ map: r.map, peak: r.peakMinDistance, stunned: r.stunned, shoved: r.shoved, life: r.lifeAfter })), null, 1));
    console.log('bite-shove browser checks passed');
  } finally { if (browser) await browser.close(); if (server) server.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
