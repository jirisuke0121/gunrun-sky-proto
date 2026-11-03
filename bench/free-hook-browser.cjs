// 自由フック: ゾンビが近くにいる時だけ目印が出る → Vキーで足場へフック → 乗る → 残り回数が減り、仮のフックポイントは消える。
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
    await page.waitForFunction(() => window.__game && window.skySwing && window.skyFreeHook);
    const level = page.locator('[data-difficulty=normal]'); await revealHomeControl(page, level); await level.click(); await page.locator('#bStart').click();
    const result = await page.evaluate(sample => {
      const g = __game, s = __skyInternals, c = g.P, dt = 1 / 120, F = skyFreeHook, cam = s.Se, rows = [];
      const setView = yaw => { cam.fov = 75; cam.updateProjectionMatrix(); cam.position.set(c.pos.x, c.pos.y + 1.6, c.pos.z); cam.rotation.set(-.15, yaw, 0, 'YXZ'); cam.updateMatrixWorld(true); c.yaw = yaw; };
      for (const item of sample) {
        for (const k of Object.keys(g.keys)) g.keys[k] = false;
        window.skySwing.reset(); for (const z of s.Jt) { s.ue.remove(z.m.root); if (z.pool) s.ue.remove(z.pool); } s.Jt.length = 0;
        g.SCR.off = g.PACE.off = g.MARK.off = true; Object.assign(g.S, { sendLog: false, gunOn: false, autoFire: false, aimAuto: false, stalkerOn: false, stalker2: false, dropShare: 0 });
        g.GAME.over = false; g.GAME.t = 0; g.GAME.spawnT = g.GAME.surgeT = 1e9; g.setMode('play'); F.reset(); F.step(1 / 60);
        g.placeAt({ x: item.at[0], y: item.at[1], z: item.at[2], yaw: 0 });
        Object.assign(c, { jumpBuf: 0, coyote: 0, hookPressed: false, life: skyChallenge.maxLives(3), invuln: 1e9, edgeJump: false, hookCD: 0 });
        for (let i = 0; i < 24; i++) g.advance(dt);
        c.node = g.nodeAt(c.pos.x, c.pos.y + .1, c.pos.z); g.updateField();
        const row = { node: item.node, hooksBefore: g.HOOKS.length };
        // ゾンビがいない間は目印が出ない。
        let any = false; for (let k = 0; k < 8; k++) { setView(k * Math.PI / 4); F.step(1 / 60); any = any || !!F.best; } row.markWithoutZombies = any;
        // 近くに3体。
        const near = g.NAV.nodes.filter(n => Math.abs(n.y - c.pos.y) < .1 && Math.hypot(n.x - c.pos.x, n.z - c.pos.z) > 4 && Math.hypot(n.x - c.pos.x, n.z - c.pos.z) < 6).slice(0, 3);
        for (const p of near) { const z = new s.ri(p.x, p.y + .01, p.z); Object.assign(z, { spawnT: 0, rise: null, hp: 1e6, flank: false, dropper: false, stalker: false, onGround: true }); z.node = g.nodeAt(p.x, p.y + .1, p.z); s.Jt.push(z); }
        let yaw = null; for (let k = 0; k < 8 && yaw === null; k++) { setView(k * Math.PI / 4); F.step(1 / 60); if (F.best) yaw = k * Math.PI / 4; }
        row.markWithZombies = yaw !== null; if (yaw === null) { rows.push(row); continue; }
        setView(yaw); document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV' }));
        let hooked = false, landed = false;
        for (let t = 0; t < 8; t += dt) { g.advance(dt); F.step(dt); if (c.state === 'hook') hooked = true; if (hooked && c.state === 'normal' && c.onGround) { landed = true; break; } }
        for (let i = 0; i < 30; i++) { g.advance(dt); F.step(dt); }
        row.hooked = hooked; row.landed = landed; row.chargesAfter = F.charges; row.hooksAfter = g.HOOKS.length; row.freeHooks = g.stats.freeHooks; row.endY = +c.pos.y.toFixed(2);
        rows.push(row);
      }
      return rows;
    }, sample);
    console.log(JSON.stringify(result));
    const used = result.filter(r => r.markWithZombies);
    assert.ok(used.length >= 1, 'ゾンビが近くにいると目印が出ること');
    for (const r of result) assert.equal(r.markWithoutZombies, false, 'ゾンビがいないときは目印が出ないこと');
    for (const r of used) { assert.ok(r.hooked && r.landed, 'フックして足場に着地すること'); assert.equal(r.chargesAfter, 1, '残り回数が1に減ること'); assert.equal(r.hooksAfter, r.hooksBefore, '仮のフックポイントが消えること'); }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.kill(); }
})().catch(e => { console.error(e.message || e); process.exit(1); });
