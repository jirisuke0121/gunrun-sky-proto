// 復帰ロープは、ドカン・フックで飛ばされている間はつかまない（2026-11-21）。普通のジャンプではつかめる。
//   node bench/rope-assist-flight-browser.cjs
const assert = require('node:assert/strict'), { spawn } = require('node:child_process'), path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..'), PORT = 8786;
(async () => {
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  let browser;
  try {
    for (let i = 0; i < 60; i++) { if (await fetch(`http://127.0.0.1:${PORT}/`).then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }), errors = [];
    page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(120000);
    await page.route('https://**/*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0,"ok":true}' }));
    await page.goto(`http://127.0.0.1:${PORT}/index.html`);
    await page.waitForFunction(() => window.__game && window.skyRopeStations?.step && window.skyBlastBarrels);
    await page.evaluate(() => window.__game.startGame()); await page.waitForFunction(() => window.__game.mode === 'play');
    const out = await page.evaluate(() => {
      const g = window.__game, I = window.__skyInternals, c = g.P, R = window.skyRopeStations, dt = 1 / 60;
      for (const z of I.Jt) { I.ue.remove(z.m.root); if (z.pool) I.ue.remove(z.pool); } I.Jt.length = 0;
      g.GAME.spawnT = g.GAME.surgeT = 1e9; I.U.gunOn = false;
      const s = R.nodes[8].s; // 交差点のドカンのすぐ横のロープ（park -21, 0、足の高さ1.5 m）
      // ロープの手前2 mの空中に置き、ロープへ向かって少し上向きに動かす。
      const place = () => { window.skyRopeSwing.cancel?.(); for (const id in R.nodes) R.nodes[id].lock = 0;
        c.pos.set(s.px, s.parkY - .3, s.pz - 2); c.vel.set(0, 2, 3); c.onGround = false; c.state = 'normal'; c.ledge = c.ladder = null; };
      const fly = frames => { let grabbed = false; for (let i = 0; i < frames; i++) { g.advance(dt); if (R.active()) grabbed = true; } return grabbed; };
      const res = {};
      // 1) 普通のジャンプ中：つかめる
      g.advance(dt); place(); res.plain = fly(30);
      // 2) フックの引き寄せが終わった直後（hook → normal、空中）：つかまない
      window.skyRopeSwing.cancel?.(); c.pos.set(s.px, 6, s.pz - 6); c.onGround = false; c.state = 'hook'; c.vel.set(0, 0, 0);
      R.step(dt, null); place(); g.advance(dt); res.flagAfterHook = R.assistFlight(); res.afterHook = fly(30);
      // 3) 着地すれば解除され、次の普通のジャンプではまたつかめる
      c.pos.set(s.px, 0, s.pz - 2); c.vel.set(0, 0, 0); c.onGround = true; R.step(dt, null); res.flagAfterLanding = R.assistFlight();
      place(); res.plainAgain = fly(30);
      return res;
    });
    assert.equal(out.plain, true, 'a plain jump near the rope grabs it');
    assert.equal(out.afterHook, false, 'just after a hook pull the rope is not grabbed');
    assert.equal(out.flagAfterHook, true);
    assert.equal(out.flagAfterLanding, false, 'landing clears the assisted flight');
    assert.equal(out.plainAgain, true, 'after landing a plain jump grabs again');
    assert.deepEqual(errors, []);
    console.log('PASS rope assisted flight', JSON.stringify(out));
  } finally { await browser?.close(); server.kill(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
