// 窓破りダイブ（北西の踏み切り台→窓→屋内の北の通路）を、実ゲームの物理で確認する。
//   node bench/window-dive-browser.cjs
const path = require('node:path'), { spawn } = require('node:child_process');
const { revealHomeControl } = require('./home-controls.cjs');
const root = path.resolve(__dirname, '..'), PORT = 8796;
(async () => {
  const { chromium } = require('playwright');
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { if (await fetch(`http://127.0.0.1:${PORT}/`).then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  let failed = 0;
  try {
    const context = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1280, height: 720 } });
    await context.addInitScript(() => { window.__hold = true; });
    await context.route('https://**/*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0,"ok":true}' }));
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(240000);
    await page.goto(`http://127.0.0.1:${PORT}/index.html?challengeDebug=1`);
    await page.waitForFunction(() => window.__game && window.skySwing && window.skyWindowDive?.step);
    const level = page.locator('[data-difficulty=normal]'); await revealHomeControl(page, level); await level.click(); await page.locator('#bStart').click();
    const out = await page.evaluate(async () => {
      const g = __game, s = __skyInternals, c = g.P, dt = 1 / 120, D = window.SKY_WINDOW_DIVE, dive = window.skyWindowDive, res = {};
      const key = (code, type) => dispatchEvent(new KeyboardEvent(type, { code }));
      for (const z of s.Jt) { s.ue.remove(z.m.root); if (z.pool) s.ue.remove(z.pool); } s.Jt.length = 0;
      g.SCR.off = g.PACE.off = g.MARK.off = true;
      Object.assign(g.S, { sendLog: false, gunOn: false, autoFire: false, aimAuto: false, stalkerOn: false, stalker2: false, dropShare: 0 });
      const run = (from, dir, jumps, seconds, fresh = true) => {
        for (const k of Object.keys(g.keys)) g.keys[k] = false; key('Space', 'keyup'); key('KeyW', 'keyup');
        window.skySwing.reset(); window.skyDash?.reset?.(false);
        if (fresh) { g.GAME.t = 0; dive.restore(); }
        g.GAME.over = false; c.life = 3; g.GAME.spawnT = g.GAME.surgeT = 1e9; g.GAME.safeT = 0; g.setMode('play');
        const yaw = Math.atan2(-dir[0], -dir[1]); g.placeAt({ x: from[0], y: from[1], z: from[2], yaw });
        Object.assign(c, { jumpBuf: 0, coyote: 0, slideBuf: 0, slideCD: 0, catchCD: 0, hookPressed: false, crouchPressed: false, invuln: -1, edgeJump: false, edgeOff: null });
        for (let i = 0; i < 12; i++) g.advance(dt);
        const d0 = g.stats.windowDives || 0, b0 = g.stats.windowBreaks || 0; key('KeyW', 'keydown');
        let next = 0, hold = 0, minY = c.pos.y, maxY = c.pos.y, atWall = null;
        for (let i = 0; i < 120 * seconds; i++) {
          const px = c.pos.x; g.advance(dt); c.yaw = yaw; minY = Math.min(minY, c.pos.y); maxY = Math.max(maxY, c.pos.y);
          if (atWall === null && px < -14 && c.pos.x >= -14) atWall = { feet: +c.pos.y.toFixed(2), z: +c.pos.z.toFixed(2), speed: +Math.hypot(c.vel.x, c.vel.z).toFixed(1), air: !c.onGround };
          const along = (c.pos.x - from[0]) * dir[0] + (c.pos.z - from[2]) * dir[1];
          if (next < jumps.length && along >= jumps[next] && c.onGround) { key('Space', 'keydown'); hold = 4; next++; }
          else if (hold > 0 && --hold === 0) key('Space', 'keyup');
        }
        key('KeyW', 'keyup'); key('Space', 'keyup');
        return { x: +c.pos.x.toFixed(2), y: +c.pos.y.toFixed(2), z: +c.pos.z.toFixed(2), minY: +minY.toFixed(2), maxY: +maxY.toFixed(2), atWall, jumps: next,
          dives: (g.stats.windowDives || 0) - d0, breaks: (g.stats.windowBreaks || 0) - b0, broken: dive.broken(), state: c.state, ground: c.onGround };
      };
      const P = D.PAD, zc = (P.minZ + P.maxZ) / 2, edge = P.maxX;
      // 1) 台を東へ走り、端で跳ぶ → ガラスを割って屋内の北の通路（4 m）へ。路地には落ちない。踏み切りは端の 0.25 m 手前〜0.8 m 手前、左右は ±0.4 m。
      res.dive = [[zc, .25], [zc, .8], [zc - .4, .4], [zc + .4, .4]].map(([z, early]) => { const r = run([P.minX + .3, P.y, z], [1, 0], [edge - early - (P.minX + .3)], 2.4);
        return { z, early, ...r, ok: r.dives === 1 && r.broken && r.x > -9 && Math.abs(r.y - 4) < .06 && r.minY > 3.95 && !!r.atWall && r.atWall.air && r.atWall.feet + 1.75 < D.WINDOW.maxY }; });
      // 2) 跳ばずに走るだけでは、端で止まる（落ちない）。
      const walk = run([P.minX + .3, P.y, zc], [1, 0], [], 1.6);
      res.walk = { ...walk, ok: walk.dives === 0 && walk.breaks === 0 && Math.abs(walk.y - P.y) < .06 };
      // 3) 北西の階段の上（4.2 m）から台へ歩いて入れる。
      const reach = run([-21.3, 4.2, -12.8], [1, 0], [], .7);
      res.reach = { ...reach, ok: reach.x > P.minX + 1 && Math.abs(reach.y - P.y) < .06 };
      // 4) 逆向き: 屋内から窓を出ると、ガラスは割れるがダイブには数えない。
      const out = run([-8, 4, -12], [-1, 0], [5.2], 1.6);
      res.out = { ...out, ok: out.breaks === 1 && out.dives === 0 };
      // 5) 割れたあとは同じ試合では割れたまま。やり直すと元に戻る。
      const second = run([P.minX + .3, P.y, zc], [1, 0], [edge - .4 - (P.minX + .3)], 2.2, false);
      g.startGame(); for (let i = 0; i < 30; i++) g.advance(dt);
      res.reset = { secondBreaks: second.breaks, secondInside: second.x > -9, afterRestart: dive.broken(), ok: second.breaks === 0 && second.x > -9 && !dive.broken() };
      // 6) 数値: 6 m/s で端から跳んだとき／0.6 m 手前で跳んだときの、窓の面での足と頭。台は路地から登れない高さ。
      const e = dive.entry(6, s.U.jumpVel, s.U.gravity), e2 = dive.entry(6, s.U.jumpVel, s.U.gravity, .6);
      res.numbers = { gap: +(D.WINDOW.minX - P.maxX).toFixed(1), feet: +e.feet.toFixed(2), head: +e.head.toFixed(2), earlyFeet: +e2.feet.toFixed(2), sill: e.sill, lintel: e.lintel, padAboveStreet: P.y,
        ok: e.feet > e.sill + .5 && e.head < e.lintel - .4 && e2.feet > e.sill + .2 && P.y > 3.6 };
      return res;
    });
    const check = (name, r) => { if (!r.ok) failed++; console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${name} ${JSON.stringify(r)}`); };
    for (const r of out.dive) check('台の端で跳ぶ → 窓を割って屋内へ', r);
    check('走るだけでは端で止まる', out.walk);
    check('階段の上から台へ入れる', out.reach);
    check('屋内から出るときはダイブに数えない', out.out);
    check('割れたまま／やり直しで戻る', out.reset);
    check('窓の面での高さ', out.numbers);
    check('ページのエラーなし', { ok: errors.length === 0, errors: errors.slice(0, 3) });
  } finally { await browser.close(); server.kill(); }
  if (failed) { console.error(`${failed} 件の確認に失敗`); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
