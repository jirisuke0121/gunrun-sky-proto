// Real-game check of the presence pass (voice-sfx.js): every recorded take decodes, and each hook in the running game
// (jump, landing, footstep, zombie kill, bullet hit on a zombie, bullet into the world, groan, last-life breathing)
// really reaches a recorded take. Also checks distance falloff, the gun-kill hit-stop and that nothing throws.
const assert = require('node:assert/strict'), fs = require('node:fs'), { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const base = process.env.RUNNING_QA_URL || 'http://127.0.0.1:8781/';
fs.mkdirSync('browser-evidence', { recursive: true });
(async () => {
  let server, browser; const results = [];
  try {
    if (!process.env.RUNNING_QA_URL) {
      server = spawn('python3', ['-m', 'http.server', '8781', '--bind', '127.0.0.1'], { stdio: 'ignore' });
      for (let i = 0; i < 100; i++) { if (await fetch(base).then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
    }
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
    for (const map of ['index.html', 'canyon.html']) {
      const context = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
      await context.addInitScript(() => { window.__hold = true; });
      await context.route('**/*', route => {
        const url = route.request().url();
        if (new URL(url).hostname === 'gunrun-runs.jirisuke0121.workers.dev') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0}' });
        if (new URL(url).pathname === '/favicon.ico') return route.fulfill({ status: 204, body: '' });
        return url.startsWith(base) || /^(blob|data):/.test(url) ? route.continue() : route.abort();
      });
      const page = await context.newPage(), errors = [];
      page.setDefaultTimeout(60000); page.on('pageerror', e => errors.push(e.message));
      try {
        await page.goto(new URL(map, base).href);
        await page.waitForFunction(() => window.__game && window.skyVoice && window.skyBite && document.body.dataset.skyHumanLoaded === 'true');
        await page.locator('#bStart').click();
        await page.waitForFunction(() => window.skyVoice.bankReady, null, { timeout: 30000 });
        const info = await page.evaluate(() => window.skyVoice.bankInfo);
        for (const [kind, list] of Object.entries(info)) assert.ok(list.length > 0 && list.every(d => d > .1 && d < 3.5), `${map}: ${kind} decoded (${list})`);

        const r = await page.evaluate(async () => {
          const g = window.__game, sky = window.__skyInternals, V = window.skyVoice, Tt = sky.Tt, c = g.P;
          for (let i = 0; i < 120; i++) g.advance(1 / 60);
          g.frameOnce(0);
          g.S.sendLog = false; g.S.gunOn = g.S.autoFire = g.S.aimAuto = false; g.SCR.off = g.PACE.off = g.MARK.off = true; g.GAME.spawnT = g.GAME.surgeT = 1e9;
          c.invuln = 1e9;
          const played = () => ({ ...V.stats.played });
          const diff = (a, b) => Object.fromEntries(Object.entries(b).filter(([k, v]) => v > (a[k] || 0)).map(([k, v]) => [k, v - (a[k] || 0)]));
          const out = {};
          const step = (name, fn) => { const a = played(); fn(); out[name] = diff(a, played()); };
          const realRandom = Math.random;
          Math.random = () => .1;                                  // force the "play this time" branch of the jump voice
          step('jump', () => Tt.jump());
          Math.random = realRandom;
          step('land', () => Tt.land(1));
          step('softLand', () => { V.stats.played = { ...V.stats.played }; Tt.land(.2); });
          step('step', () => Tt.step(.8));
          step('groan', () => Tt.groan(.8, .2, false));
          step('casing', () => Tt.hg());
          step('roar', () => Tt.roar(0, .8));
          step('thudSoft', () => Tt.thud(.5, 0));
          step('thudFall', () => Tt.thud(.9, 0));
          step('impact', () => { for (let i = 0; i < 8; i++) { V.impact({ x: c.pos.x + 4, y: c.pos.y + 1, z: c.pos.z + 4 }); } });
          // zombies: place one in front of the player in the open, shoot it, then kill it with a "gun" kill
          const live = sky.Jt.filter(e => !e.dead && !e.remove)[0];
          live.pos.set(c.pos.x + 3, c.pos.y, c.pos.z); live.rise = null; live.act = null; live.fall = null; live.stun = 0;
          const V3 = sky.Geom.Vector3;
          step('gunHit', () => window.__gunFx.hit(false, new V3(live.pos.x, live.pos.y + 1.1, live.pos.z), live, new V3(1, 0, 0)));
          window.__stopT = 0; const stopBefore = V.stats.hitStops;   // the auto-gun may already have left a stop from a headshot kill during setup
          live.gunT = sky.z.t;
          step('kill', () => live.hurt(1e9, 1, 0, .5, 3));
          out.dead = live.dead; out.hitStop = V.stats.hitStops - stopBefore; out.stopT = window.__stopT || 0;
          // distance falloff and occlusion: scan 16 directions around the player at 2 m and 40 m
          const ring = r => Array.from({ length: 16 }, (_, i) => V.spatial(c.pos.x + Math.cos(i * Math.PI / 8) * r, c.pos.y + 1, c.pos.z + Math.sin(i * Math.PI / 8) * r));
          const nearRing = ring(2), farRing = ring(40);
          out.nearBest = +Math.max(...nearRing.map(s => s.gain)).toFixed(2);
          out.farBest = +Math.max(...farRing.map(s => s.gain)).toFixed(2);
          out.nearLpBest = Math.round(Math.max(...nearRing.map(s => s.lp)));
          out.farLpBest = Math.round(Math.max(...farRing.map(s => s.lp)));
          const blockedAny = [...nearRing, ...farRing].filter(s => s.blocked);
          out.blocked = blockedAny.length;
          out.blockedMuffled = blockedAny.every(s => s.lp <= 700);
          out.blockedQuiet = blockedAny.every(s => s.gain <= 1.15 / (1 + s.d / 8) * .55 + 1e-9);
          // last life: breathing + heartbeat + red edge, and back off again
          window.skyChallenge.maxLives = () => 3;
          const a = played(); c.life = 1;
          await new Promise(res => setTimeout(res, 500));
          out.lowOn = V.lowHealth; out.edgeOn = document.getElementById('lowHpEdge').classList.contains('on'); out.breath = diff(a, played());
          c.life = 3;
          await new Promise(res => setTimeout(res, 400));
          out.lowOff = !V.lowHealth && !document.getElementById('lowHpEdge').classList.contains('on');
          return out;
        });
        assert.ok(r.jump.jump === 1, `${map}: jump voice ${JSON.stringify(r.jump)}`);
        assert.ok(r.land.land === 1 && !r.softLand.land, `${map}: hard landing has a voice, a soft one does not ${JSON.stringify([r.land, r.softLand])}`);
        assert.ok(r.step.step === 1, `${map}: footstep sample ${JSON.stringify(r.step)}`);
        assert.ok(r.groan.zgroan === 1, `${map}: groan sample ${JSON.stringify(r.groan)}`);
        assert.ok(r.casing.imp === 1, `${map}: a casing tick follows a shot ${JSON.stringify(r.casing)}`);
        assert.ok(r.roar.zroar === 1, `${map}: roar layer ${JSON.stringify(r.roar)}`);
        assert.ok(!r.thudSoft.flesh && r.thudFall.flesh === 1, `${map}: only a hard body fall gets the impact ${JSON.stringify([r.thudSoft, r.thudFall])}`);
        const imp = (r.impact.imp || 0) + (r.impact.impw || 0);
        assert.ok(imp >= 1 && imp <= 4, `${map}: world impacts play and are rate-limited (${imp} of 8 in one frame)`);
        assert.ok(r.gunHit.flesh === 1 && r.gunHit.zhit === 1, `${map}: bullet hit has flesh + pain ${JSON.stringify(r.gunHit)}`);
        assert.ok(r.dead && r.kill.zdie === 1, `${map}: kill has a death cry ${JSON.stringify(r.kill)}`);
        assert.ok(r.hitStop === 1 && Math.abs(r.stopT - .03) < 1e-9, `${map}: gun kill hit-stop ${r.hitStop} / ${r.stopT}`);
        assert.ok(r.nearBest >= .8 && r.farBest <= .2 && r.nearLpBest > 5000 && r.farLpBest < 3000, `${map}: sound fades with distance ${JSON.stringify([r.nearBest, r.farBest, r.nearLpBest, r.farLpBest])}`);
        assert.ok(r.blocked > 0 && r.blockedMuffled && r.blockedQuiet, `${map}: a wall in between muffles and quiets (${r.blocked} blocked of 32)`);
        assert.ok(r.lowOn && r.edgeOn && r.breath.breath >= 1, `${map}: last life shows the edge and breathes ${JSON.stringify([r.lowOn, r.edgeOn, r.breath])}`);
        assert.ok(r.lowOff, `${map}: effects stop when the life is back`);
        assert.deepEqual(errors, [], `${map}: no page errors`);
        results.push(`PASS ${map}: jump/land/step/casing/groan/roar/fall/impact/hit/kill voices, hit-stop ${r.stopT}, near ${r.nearBest} far ${r.farBest}, ${r.blocked}/32 rays blocked, last-life edge + breath`);
      } finally { await context.close(); }
    }
  } finally { await browser?.close(); server?.kill(); }
  console.log(results.join('\n'));
})().catch(e => { console.error(e); process.exit(1); });
