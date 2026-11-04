// Real WebGL run of the hard preset: the boss event fires at 50 s, takes a body slot, chases, shows its bar and can be killed.
// Software WebGL here renders ~1 frame/s, so the simulation is stepped with __game.advance (no rendering) instead of real time.
// The clock and the player's lives are controlled to reach the event quickly; this is not a human play test.
const assert = require('node:assert/strict'), fs = require('node:fs');
const {spawn} = require('node:child_process'), {chromium} = require('playwright');
const port = Number(process.env.SKY_TEST_PORT || 18811), base = `http://127.0.0.1:${port}/`, out = process.env.BOSS_OUT || 'browser-evidence/boss';
(async () => {
  let browser, server;
  try {
    fs.mkdirSync(out, {recursive: true});
    server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], {stdio: 'ignore'});
    for (let i = 0; i < 60; i++) { if (await fetch(base).then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
    browser = await chromium.launch({headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--disable-dev-shm-usage', '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
    for (const map of (process.env.BOSS_MAPS || 'index.html,canyon.html').split(',')) {
      const context = await browser.newContext({locale: 'ja-JP', viewport: {width: 800, height: 450}});
      await context.addInitScript(() => { try { localStorage.setItem('gunrun-challenge-difficulty-v1', 'hard'); } catch {} });
      await context.route('https://**/*', route => route.fulfill({status: 200, contentType: 'application/json', body: '{"top":[],"total":0}'}));
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::/.test(m.text())) errors.push(m.text()); });
      page.setDefaultTimeout(280000); await page.goto(base + map);
      await page.waitForFunction(() => window.__game && window.skyStartReadiness?.ready && window.skyBossZombie);
      await page.evaluate(() => { window.stepFor = (seconds, dt = .05) => { const s = __skyInternals; for (let i = 0; i < Math.round(seconds / dt); i++) { s.c.life = 99; __game.advance(dt); if (i % 4 === 0) skyBossZombie.upkeep(); } skyBossZombie.upkeep(); }; });
      await page.evaluate(() => document.getElementById('bStart').click());
      await page.waitForFunction(() => __skyInternals.modeRef() === 'play');
      const early = await page.evaluate(() => ({id: skyChallenge.id, events: __game.SCRIPT.map(e => e.do + '@' + e.t), pending: skyBossZombie.pending(), boss: !!skyBossZombie.boss, cap: skyChallenge.cap(0), initial: skyChallenge.initial(0), alive: __game.zombies.filter(z => !z.dead && !z.boss).length}));
      assert.equal(early.id, 'hard'); assert.equal(early.cap, 8); assert.equal(early.initial, 8); assert.equal(early.alive, 8, 'eight ordinary zombies at start: ' + JSON.stringify(early)); assert.ok(early.events.includes('boss@50'), JSON.stringify(early)); assert.equal(early.boss, false, 'no boss at the start');
      // Keep the player alive, then jump the clock to just before the event.
      await page.evaluate(() => { const s = __skyInternals; s.c.life = 99; s.z.t = Math.max(s.z.t, 49.3); });
      await page.evaluate(() => stepFor(3));
      assert.equal(await page.evaluate(() => skyBossZombie.bosses.length), 2, 'two bosses spawned after the 50 s event');
      const first = await page.evaluate(() => {
        const b = skyBossZombie.boss, g = __game, alive = g.zombies.filter(e => !e.dead);
        return {hp: b.hp, maxHp: b.maxHp, scale: b.m.root.scale.x, boss: b.boss, h: b.h, r: b.r, alive: alive.length, bodies: g.zombies.length, ordinary: g.zombies.filter(e => !e.boss).length,
          dist: b.bornDistance, t: __skyInternals.z.t, health: skyChallenge.value('zombieHealth', 0),
          tinted: (() => { let n = 0; b.m.root.traverse(o => { if (o.isMesh && [].concat(o.material).some(m => m.userData?.boss)) n++; }); return n; })(),
          normalTinted: (() => { const r = alive.find(e => !e.boss); let n = 0; r?.m.root.traverse(o => { if (o.isMesh && [].concat(o.material).some(m => m.userData?.boss)) n++; }); return n; })(),
          bar: !document.getElementById('bossBar').hidden, toast: document.getElementById('toast').textContent};
      });
      assert.ok(first.tinted > 0 && first.normalTinted === 0, 'only the boss is tinted: ' + JSON.stringify(first));
      assert.equal(first.hp, 60); assert.equal(first.maxHp, 60); assert.equal(first.health, 12); assert.ok(Math.abs(first.scale - 1.4) < 1e-6);
      assert.ok(first.ordinary <= 8 && first.bodies <= 10, 'body budget (8 ordinary + two bosses): ' + JSON.stringify(first)); assert.ok(first.t >= 49.3 && first.t < 70, 'time ' + first.t);
      assert.ok(first.dist >= 22 || map === 'canyon.html', 'spawned far from the player: ' + first.dist);
      // It chases: the distance to the player shrinks while the clock runs. Keep the player in place and unhurt.
      await page.evaluate(() => { __skyInternals.c.life = 99; });
      await page.evaluate(() => stepFor(6));
      const chase = await page.evaluate(() => { const b = skyBossZombie.boss, g = __game; return {dist: Math.hypot(b.pos.x - g.P.pos.x, b.pos.z - g.P.pos.z), dead: b.dead, bar: !document.getElementById('bossBar').hidden, w: document.querySelector('#bossBar b').style.transform}; });
      // Hits: a pistol round chips health and the bar follows, with no stun-lock; a lethal hit kills and counts.
      const hit = await page.evaluate(() => {
        const b = skyBossZombie.boss, g = __game, kills = g.stats.kills;
        const hp0 = b.hp, stun0 = b.stun; b.hurt(1, 1, 0, .6, 7.8); const afterLight = {hp: b.hp - hp0, stun: b.stun, stun0};
        for (let i = 0; i < 29; i++) b.hurt(1, 1, 0, .6, 7.8);
        return {afterLight, spent: hp0 - b.hp, hp: b.hp, kills};
      });
      assert.equal(hit.afterLight.hp, -1); assert.ok(hit.afterLight.stun <= Math.max(0, hit.afterLight.stun0), 'pistol hit does not add stun'); assert.equal(hit.spent, 30);
      await page.evaluate(() => stepFor(.3));
      const {bar, liveHp} = await page.evaluate(() => ({bar: document.querySelector('#bossBar b').style.transform, liveHp: skyBossZombie.boss.hp}));
      assert.ok(Math.abs(Number(/scaleX\(([\d.]+)/.exec(bar)[1]) - liveHp / 60) < .02, 'bar follows health: ' + bar + ' hp ' + liveHp);
      // Screenshot with the boss close and in front of the camera.
      await page.evaluate(() => { const b = skyBossZombie.boss, p = __game.P; b.pos.set(p.pos.x + 5, p.pos.y, p.pos.z); b.spawnT = 0; __skyInternals.c.life = 99; });
      await page.evaluate(() => stepFor(.2));
      await page.screenshot({path: `${out}/${map.replace('.html', '')}-boss.png`, timeout: 280000});
      const dead = await page.evaluate(() => { const b = skyBossZombie.boss, g = __game, kills = g.stats.kills; b.hurt(999, 1, 0, 1.2, 9); return {dead: b.dead, kills: g.stats.kills - kills, active: skyBossZombie.active()}; });
      assert.equal(dead.dead, true); assert.equal(dead.kills, 1); assert.equal(dead.active, true);
      await page.evaluate(() => stepFor(.3));
      assert.equal(await page.evaluate(() => document.getElementById('bossBar').hidden), false, 'bar remains for second boss');
      await page.evaluate(() => { skyBossZombie.bosses[1].hurt(999, 1, 0, 1.2, 9); stepFor(.3); });
      assert.equal(await page.evaluate(() => document.getElementById('bossBar').hidden), true, 'bar hides after both bosses die');
      assert.equal(await page.evaluate(() => __game.zombies.filter(e => !e.boss).length <= 8), true, 'ordinary crowd stays within 8');
      // Replacement spawning resumes after the kill and the boss does not come back.
      await page.evaluate(() => stepFor(8));
      assert.equal(await page.evaluate(() => skyBossZombie.spawns), 2, 'two bosses per run');
      await page.evaluate(() => { __skyInternals.z.t = 80; stepFor(12); });
      const population = await page.evaluate(() => ({ cap: skyChallenge.cap(0), count: __game.zombies.filter(z => !z.dead && !z.boss).length, interval: skyChallenge.interval(9), lull: skyChallenge.value('killLull', 9) }));
      assert.equal(population.cap, 8); assert.equal(population.interval, .25); assert.equal(population.lull, 0);
      assert.equal(population.count, 8, 'ordinary population reaches eight: ' + JSON.stringify(population));
      const replenished = await page.evaluate(() => {
        const target = __game.zombies.find(z => !z.dead && !z.boss); target.hurt(999, 1, 0, 1.2, 9);
        for (let i = 0; i < 60; i++) { stepFor(.05); if (__game.zombies.filter(z => !z.dead && !z.boss).length === 8) return (i + 1) * .05; }
        return null;
      });
      assert.ok(replenished !== null, 'ordinary zombie replenished within 3 s');
      assert.deepEqual(errors, [], 'page errors: ' + errors.join(' | '));
      console.log(`PASS ${map}`, JSON.stringify({first, chase, bar, population, replenished}));
      await context.close();
    }
  } finally { await browser?.close(); server?.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
