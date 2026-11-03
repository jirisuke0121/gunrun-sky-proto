// 救済スキル（画面下の「救済 ×2」）: ボタン/Vキーで、ゾンビのいない向きの高台へ自動でフックして登る。1ランに2回まで。
const assert = require('node:assert/strict'), fs = require('node:fs'), { spawn } = require('node:child_process'), { chromium } = require('playwright');
const { revealHomeControl } = require('./home-controls.cjs');
(async () => {
  const sample = JSON.parse(fs.readFileSync('docs/escape-graph/free-hook-verify.json', 'utf8')).results.filter(r => r.result === 'ok').slice(0, 4);
  assert.ok(sample.length >= 2, '検証済みの出発点があること');
  const server = spawn('python3', ['-m', 'http.server', '8802', '--bind', '127.0.0.1'], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { if (await fetch('http://127.0.0.1:8802/').then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const context = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1280, height: 720 } });
    await context.addInitScript(() => { window.__hold = true; });
    await context.route('https://**/*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0,"ok":true}' }));
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(300000);
    await page.goto('http://127.0.0.1:8802/index.html?challengeDebug=1');
    await page.waitForFunction(() => window.__game && window.skySwing && window.skyRescue);
    const level = page.locator('[data-difficulty=normal]'); await revealHomeControl(page, level); await level.click(); await page.locator('#bStart').click();
    const result = await page.evaluate(async sample => {
      const g = __game, s = __skyInternals, c = g.P, dt = 1 / 120, F = skyRescue, rows = [], button = document.getElementById('tRescue');
      const place = item => {
        for (const k of Object.keys(g.keys)) g.keys[k] = false;
        window.skySwing.reset(); for (const z of s.Jt) { s.ue.remove(z.m.root); if (z.pool) s.ue.remove(z.pool); } s.Jt.length = 0;
        g.SCR.off = g.PACE.off = g.MARK.off = true; Object.assign(g.S, { sendLog: false, gunOn: false, autoFire: false, aimAuto: false, stalkerOn: false, stalker2: false, dropShare: 0 });
        g.GAME.over = false; g.GAME.spawnT = g.GAME.surgeT = 1e9; g.placeAt({ x: item.at[0], y: item.at[1], z: item.at[2], yaw: 0 });
        Object.assign(c, { jumpBuf: 0, coyote: 0, hookPressed: false, life: skyChallenge.maxLives(3), invuln: 1e9, edgeJump: false, hookCD: 0 });
        for (let i = 0; i < 24; i++) g.advance(dt);
        c.node = g.nodeAt(c.pos.x, c.pos.y + .1, c.pos.z); g.updateField();
        const near = g.NAV.nodes.filter(n => Math.abs(n.y - c.pos.y) < .1 && Math.hypot(n.x - c.pos.x, n.z - c.pos.z) > 4.5 && Math.hypot(n.x - c.pos.x, n.z - c.pos.z) < 6.5).slice(0, 3);
        for (const p of near) { const z = new s.ri(p.x, p.y + .01, p.z); Object.assign(z, { spawnT: 0, rise: null, hp: 1e6, flank: false, dropper: false, stalker: false, onGround: true }); z.node = g.nodeAt(p.x, p.y + .1, p.z); s.Jt.push(z); }
      };
      const fly = () => { let hooked = false, landed = false; for (let t = 0; t < 8; t += dt) { g.advance(dt); F.step(); if (c.state === 'hook') hooked = true; if (hooked && c.state === 'normal' && c.onGround) { landed = true; break; } } for (let i = 0; i < 30; i++) { g.advance(dt); F.step(); } return { hooked, landed }; };
      const wait = ms => new Promise(r => setTimeout(r, ms));
      g.GAME.t = 0; g.setMode('play'); F.reset(); F.step();
      const first = { valueAtStart: button.querySelector('.skill-value').textContent, inDock: !!document.querySelector('#skillDock #tRescue') };
      for (const item of sample) {
        F.reset(); place(item);
        const zs = s.Jt.map(z => z.pos.clone()), cx = zs.reduce((a, p) => a + p.x, 0) / zs.length, cz = zs.reduce((a, p) => a + p.z, 0) / zs.length;
        const before = { x: c.pos.x, z: c.pos.z }, ok = F.activate(); const target = F.last;
        const flight = fly();
        const seg = (z) => { const dx = target.x - before.x, dz = target.z - before.z, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((z.x - before.x) * dx + (z.z - before.z) * dz) / l2)); return Math.hypot(z.x - (before.x + dx * t), z.z - (before.z + dz * t)); };
        const dotAway = target ? Math.min(...zs.map(seg)) : null; // 出発時のゾンビから、飛ぶ線までの最短距離
        rows.push({ node: item.node, activated: ok, ...flight, chargesAfter: F.charges, valueAfter: button.querySelector('.skill-value').textContent, pathGap: dotAway && +dotAway.toFixed(1), dotAway: dotAway, endY: +c.pos.y.toFixed(2), targetY: target && target.y });
      }
      // 1ランに2回まで: 同じ出発点から続けて使い、3回目は使えない。
      const item = sample[0]; F.reset(); const uses = [];
      for (let k = 0; k < 3; k++) { place(item); await wait(1100); uses.push(F.activate()); fly(); }
      return { first, rows, uses, empty: button.classList.contains('empty'), chargesEnd: F.charges, hooks: g.stats.rescues };
    }, sample);
    console.log(JSON.stringify(result));
    assert.ok(result.first.inDock, 'スキル欄にボタンがあること'); assert.equal(result.first.valueAtStart, '2');
    for (const r of result.rows) { assert.ok(r.activated && r.hooked && r.landed, '押すとフックして高台に着地すること'); assert.equal(r.chargesAfter, 1); assert.equal(r.valueAfter, '1'); assert.ok(r.dotAway >= 2.9, 'ゾンビの近くを通る線で飛ばないこと'); }
    assert.deepEqual(result.uses, [true, true, false], '2回まで使えて3回目は使えないこと'); assert.ok(result.empty && result.chargesEnd === 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.kill(); }
})().catch(e => { console.error(e.message || e); process.exit(1); });
