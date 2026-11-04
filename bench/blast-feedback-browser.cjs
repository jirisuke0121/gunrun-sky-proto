// Exercise both maps with real zombies, world raycasts and the Web Audio graph.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

(async () => {
  const url = 'http://127.0.0.1:8786';
  const server = spawn('python3', ['-m', 'http.server', '8786', '--bind', '127.0.0.1'], { stdio: 'ignore' });
  let browser;
  try {
    for (let i = 0; i < 50 && !await fetch(url).then(r => r.ok, () => false); i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    for (const map of ['index.html', 'canyon.html']) {
      browser = await chromium.launch({
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
        args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
          '--autoplay-policy=no-user-gesture-required'],
      });
      const touch = map === 'canyon.html';
      const page = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: touch, isMobile: touch });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => { window.__hold = true; });
      await page.route('https://**/*', route => route.fulfill({ json: { top: [] } }));
      await page.goto(`${url}/${map}`);
      await page.waitForFunction(() => window.skyBlastBarrels && window.__game?.Zombie, null, { timeout: 90000 });
      await page.evaluate(() => window.__game.startGame());
      await page.waitForFunction(() => window.__game.mode === 'play');

      const result = await page.evaluate(() => {
        const game = window.__game;
        const sky = window.__skyInternals;
        const blast = window.skyBlastBarrels;
        const player = game.P;
        const barrel = blast.barrels[0];
        const { x, y, z } = barrel;

        // Find an open line using the map's actual collision, then place a wall in it.
        const ray = (dx, dz, distance) => sky.raycast(x + dx, y + 0.75, z + dz, dx, 0, dz, distance - 1);
        const axis = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dz]) =>
          !ray(dx, dz, 5.4) && !ray(-dx, -dz, 2.2));
        if (!axis) throw new Error(`No clear blast fixture near ${barrel.id}`);
        const [dx, dz] = axis;
        const position = distance => [x + dx * distance, y, z + dz * distance];

        sky.initAudio();
        const ctx = sky.Ut.ctx;
        const output = [];
        const makeSource = ctx.createBufferSource.bind(ctx);
        ctx.createBufferSource = () => {
          const source = makeSource();
          const start = source.start.bind(source);
          const connect = source.connect.bind(source);
          let filter;
          source.connect = target => {
            filter = target;
            return connect(target);
          };
          source.start = (...args) => {
            if (source.buffer?.duration === 1.05) {
              const samples = source.buffer.getChannelData(0);
              output.push({ frequency: filter.frequency.value, gain: filter.blastTestGain.gain.value,
                peak: samples.reduce((max, sample) => Math.max(max, Math.abs(sample)), 0),
                ends: [samples[0], samples.at(-1)] });
            }
            return start(...args);
          };
          return source;
        };
        const makeFilter = ctx.createBiquadFilter.bind(ctx);
        ctx.createBiquadFilter = () => {
          const filter = makeFilter();
          const connect = filter.connect.bind(filter);
          filter.connect = target => {
            filter.blastTestGain = target;
            return connect(target);
          };
          return filter;
        };

        const enemy = (distance, hp) => {
          const zombie = new game.Zombie(...position(distance));
          zombie.spawnT = 0;
          zombie.hp = hp;
          sky.Jt.push(zombie);
          return zombie;
        };
        const core = enemy(-1.6, 12);
        const edge = enemy(4, 12);
        const outside = enemy(5.4, 12);
        const boss = window.skyBossZombie.dress(enemy(-2.2, 12), 12);
        boss.spawnT = 0;
        const clearRun = (distance, wall = null, shoot = false) => {
          if (wall) game.solids.push(wall);
          player.pos.set(...position(distance));
          player.vel.set(0, 0, 0);
          player.shake = 0;
          player.state = 'normal';
          player.onGround = true;
          const children = new Set(sky.ue.children);
          if (shoot) {
            game.S.weapon = 0;
            game.S.aimAuto = false;
            sky.Se.position.set(player.pos.x, y + 1.25, player.pos.z);
            sky.Se.lookAt(x, y + 0.58, z);
            sky.Se.updateMatrixWorld();
            sky.fireWeapon();
          } else blast.detonate(barrel);
          const fired = !barrel.active;
          const fx = sky.ue.children.find(child => !children.has(child) &&
            child.children.some(part => part.geometry?.type === 'TorusGeometry'));
          const run = { fired, shake: player.shake, up: player.vel.y, life: player.life,
            ring: fx?.children.find(part => part.geometry?.type === 'TorusGeometry')?.scale.x,
            repeated: blast.detonate(barrel), toast: document.getElementById('toast').textContent };
          if (wall) game.solids.pop();
          blast.reset();
          return run;
        };
        const clear = clearRun(2.2, null, true);
        const outcomes = [core, edge, outside, boss].map(enemy =>
          ({ hp: enemy.hp, dead: enemy.dead, stun: enemy.stun, speed: Math.hypot(enemy.vel.x, enemy.vel.z) }));

        const blocked = enemy(1.9, 12);
        const [wx, , wz] = position(1.25);
        const hx = dx ? 0.15 : 0.75;
        const hz = dz ? 0.15 : 0.75;
        const wall = { minX: wx - hx, maxX: wx + hx, minY: y, maxY: y + 2, minZ: wz - hz, maxZ: wz + hz };
        const occluded = clearRun(2.2, wall);
        const blockedHp = blocked.hp;
        const beyondLaunch = clearRun(5.35);
        const far = clearRun(16);
        return { clear, occluded, beyondLaunch, far, outcomes, output, blockedHp };
      });

      assert.deepEqual(errors, []);
      const { clear, occluded, beyondLaunch, far, outcomes, output, blockedHp } = result;
      const [core, edge, outside, boss] = outcomes;
      assert.ok(core.dead && core.hp === 0 && core.speed > edge.speed, JSON.stringify(outcomes));
      assert.ok(!edge.dead && edge.hp === 10 && edge.stun >= 1 && edge.speed > 0, JSON.stringify(edge));
      assert.equal(outside.hp, 12);
      assert.ok(!boss.dead && boss.hp === 56 && boss.stun > 0 && boss.stun < edge.stun, JSON.stringify(boss));
      assert.equal(blockedHp, 12);
      assert.ok(clear.fired && !clear.repeated && clear.ring > 0 && clear.up > 0, JSON.stringify(clear));
      assert.ok(occluded.fired && occluded.shake < clear.shake / 4 && occluded.up === 0, JSON.stringify(occluded));
      assert.equal(beyondLaunch.up, 0);
      assert.equal(far.shake, 0);
      assert.equal(far.up, 0);
      assert.equal(clear.life, occluded.life);
      assert.equal(clear.life, far.life);
      assert.equal(output.length, 4, JSON.stringify(output));
      assert.equal(output[1].frequency, 700);
      assert.ok(output[0].gain > output[1].gain && output[0].gain > output[2].gain &&
        output[2].gain > output[3].gain, JSON.stringify(output));
      assert.ok(output[0].frequency > output[2].frequency && output[2].frequency > 700);
      assert.ok(output[0].peak > 0.4 && output[0].peak < 1);
      assert.ok(output[0].ends.every(sample => sample === 0));
      console.log(`PASS ${map} (${touch ? 'touch emulation' : 'desktop'}): ${JSON.stringify(result)}`);
      await browser.close();
      browser = null;
    }
  } finally {
    await browser?.close();
    server.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
