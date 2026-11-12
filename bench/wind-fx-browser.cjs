// 風（見た目の筋・突風・音の層）の確認。実ゲームのカメラと速度で、粒の位置・向き・密度、突風の包絡線、音の層、負荷を測る。
//   node bench/wind-fx-browser.cjs
const path = require('node:path'), { spawn } = require('node:child_process');
const { revealHomeControl } = require('./home-controls.cjs');
const root = path.resolve(__dirname, '..'), PORT = 8799;
(async () => {
  const { chromium } = require('playwright');
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { if (await fetch(`http://127.0.0.1:${PORT}/`).then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  let failed = 0;
  try {
    const context = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1280, height: 720 } });
    await context.addInitScript(() => { window.__hold = true; });
    await context.route('https://**/*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0,"ok":true}' }));
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(240000);
    await page.goto(`http://127.0.0.1:${PORT}/index.html?challengeDebug=1`);
    await page.waitForFunction(() => window.__game && window.skyWind && window.skyRopeSwing?.step);
    const level = page.locator('[data-difficulty=normal]'); await revealHomeControl(page, level); await level.click(); await page.locator('#bStart').click();
    await page.waitForFunction(() => __game.mode === 'play');
    const out = await page.evaluate(async () => {
      const g = __game, s = __skyInternals, c = g.P, W = window.skyWind, res = {}, dt = 1 / 60; W.randomGusts = false;
      for (const z of s.Jt) { s.ue.remove(z.m.root); if (z.pool) s.ue.remove(z.pool); } s.Jt.length = 0;
      Object.assign(g.S, { sendLog: false, gunOn: false, autoFire: false, stalkerOn: false, stalker2: false, dropShare: 0 });
      g.GAME.over = false; g.GAME.spawnT = g.GAME.surgeT = 1e9; g.GAME.safeT = 0; c.life = 3;
      const cam = s.Se, tan = Math.tan(cam.fov * Math.PI / 360);
      const settle = (vx, vy, vz, seconds) => { for (let i = 0; i < seconds * 60; i++) { c.vel.set(vx, vy, vz); W.frame(dt); } };
      // 1) 止まっていれば筋は出ない。
      settle(0, 0, 0, 1); res.still = { shown: W.state.shown, visible: W.mesh.visible, ok: !W.mesh.visible && W.state.shown === 0 };
      // 2) 走る（向いている方向へ 12 m/s）。筋が出て、画面の中央を避け、尾が速度の向きにある。
      const yaw = c.yaw; settle(-Math.sin(yaw) * 12, 0, -Math.cos(yaw) * 12, 2.5);
      const P = W.positions, n = Math.round(W.state.shown); let inCentre = 0, wrongWay = 0;
      for (let i = 0; i < n; i++) {
        const o = i * 9, hx = (P[o] + P[o + 3]) / 2, hy = (P[o + 1] + P[o + 4]) / 2, hz = (P[o + 2] + P[o + 5]) / 2, d = -hz, h = d * tan, w = h * cam.aspect;
        if (Math.hypot(hx / w, hy / h) < .4) inCentre++;
      }
      res.run = { shown: n, level: +W.state.level.toFixed(2), inCentre, visible: W.mesh.visible, ok: n >= 20 && W.mesh.visible && inCentre <= Math.ceil(n * .1) };
      // 3) 落下（真下へ 18 m/s）。筋が出て、尾が「下側」（動く向きの後ろ側。世界は上へ流れ、筋の先頭が上）にある。
      const pitch = cam.rotation.x; settle(0, -18, 0, 2.2);
      let up = 0, total = 0; const m = Math.round(W.state.shown);
      for (let i = 0; i < m; i++) { const o = i * 9, hy = (P[o + 1] + P[o + 4]) / 2, ty = P[o + 7]; total++; if (ty < hy) up++; }
      res.fall = { shown: m, tailBelow: up, ok: m >= 15 && up >= total * .9 };
      // 4) 突風: 発生→約0.3秒でピーク→減衰。
      settle(-Math.sin(yaw) * 12, 0, -Math.cos(yaw) * 12, .5); W.triggerGust(1);
      const series = []; for (let i = 0; i < 150; i++) { c.vel.set(-Math.sin(yaw) * 12, 0, -Math.cos(yaw) * 12); W.frame(dt); if (i % 15 === 14) series.push(+W.state.gust.toFixed(2)); }
      const peak = Math.max(...series);
      res.gust = { series, peak, gain: +W.gain.toFixed(3), ok: peak > .8 && series.at(-1) < .25 && W.gain > 1 && W.gain <= 1.13 };
      W.randomGusts = false;
      // 5) 速さが足りない所（歩き 3 m/s）では出ない。
      settle(-Math.sin(yaw) * 3, 0, -Math.cos(yaw) * 3, 2); res.walk = { visible: W.mesh.visible, ok: !W.mesh.visible };
      // 6) スイング: 掴む・最下点・離すで突風が起きる（状態を作って確認）。
      const R = window.SKY_ROPE_SWING; let rides = 0;
      for (const k of Object.keys(g.keys)) g.keys[k] = false;
      g.GAME.t = 0; g.setMode('play'); g.placeAt({ x: -28.4, y: 6.4, z: R.Z, yaw: -Math.PI / 2 });
      for (let i = 0; i < 12; i++) g.advance(1 / 120);
      dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
      let jumped = false, gustAtGrab = null, gustPeak = 0;
      for (let i = 0; i < 120 * 3; i++) {
        g.advance(1 / 120); W.frame(1 / 120);
        const along = c.pos.x + 28.4;
        if (!jumped && along >= 3.9 && c.onGround) { dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })); jumped = true; setTimeout(() => dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' })), 0); }
        if (window.skyRopeSwing.active()) { rides++; if (gustAtGrab === null) gustAtGrab = W.state.gust; gustPeak = Math.max(gustPeak, W.state.gust); }
      }
      dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
      res.rope = { rides: rides > 0, gustPeak: +gustPeak.toFixed(2), ok: rides > 0 && gustPeak > .5 };
      // 7) 音の層（うなり・笛）が風の母線 Ut.wind に載っていて、止まれば0に落ちる。
      W.forceGust = 1; settle(-Math.sin(yaw) * 14, 0, -Math.cos(yaw) * 14, .2);
      s.Ut.ctx && (await new Promise(r => setTimeout(r, 400)));
      const nodes = W.nodes; res.audio = { layers: !!nodes, ctx: s.Ut.ctx?.state, ok: !!nodes && !!nodes.rumbleGain && !!nodes.whistleGain };
      W.forceGust = null;
      // 8) 画面の縞（CSS）は弱めてある。
      res.css = { scale: W.cssScale, ok: W.cssScale < .5 && W.cssScale > 0 };
      // 9) 負荷: frame() 1回あたりの時間。
      settle(-Math.sin(yaw) * 12, 0, -Math.cos(yaw) * 12, 1);
      const t0 = performance.now(); for (let i = 0; i < 1200; i++) { c.vel.set(-Math.sin(yaw) * 12, 0, -Math.cos(yaw) * 12); W.frame(dt); } const per = (performance.now() - t0) / 1200;
      res.cost = { msPerFrame: +per.toFixed(3), ok: per < .3 };
      return res;
    });
    const check = (name, r) => { if (!r.ok) failed++; console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${name} ${JSON.stringify(r)}`); };
    check('止まっていれば筋は出ない', out.still);
    check('走ると筋が出て、中央を避ける', out.run);
    check('落下では尾が下側にある（速度の向きに沿う）', out.fall);
    check('突風: ピーク→減衰、音量の倍率は1.13倍まで', out.gust);
    check('歩きでは出ない', out.walk);
    check('スイングで突風が起きる', out.rope);
    check('音の層（うなり・笛）ができている', out.audio);
    check('画面の縞（CSS）は弱めてある', out.css);
    check('1フレームの負荷（JS）', out.cost);
    
    // 描画ループから毎フレーム呼ばれる（__hold なしの通常のページで数える）。
    {
      const live = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1280, height: 720 } });
      await live.route('https://**/*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0,"ok":true}' }));
      const lp = await live.newPage(); await lp.goto(`http://127.0.0.1:${PORT}/index.html?challengeDebug=1`);
      await lp.waitForFunction(() => window.__game && window.skyWind);
      const lv = lp.locator('[data-difficulty=normal]'); await revealHomeControl(lp, lv); await lv.click(); await lp.locator('#bStart').click();
      await lp.waitForFunction(() => __game.mode === 'play');
      const calls = await lp.evaluate(async () => { let n = 0; const W = window.skyWind, f = W.frame; W.frame = d => { n++; return f(d); }; await new Promise(r => setTimeout(r, 1500)); W.frame = f; return n; });
      check('描画ループから毎フレーム呼ばれる（ソフトウェア描画では遅いので1回以上）', { calls, ok: calls >= 1 });
      await live.close();
    }
    // ?windFx=0 で従来どおり。
    const off = await context.newPage(); await off.goto(`http://127.0.0.1:${PORT}/index.html?windFx=0`);
    await off.waitForFunction(() => window.skyWind);
    const disabled = await off.evaluate(() => ({ enabled: skyWind.state.enabled, gain: skyWind.gain, css: skyWind.cssScale }));
    check('?windFx=0 で従来どおり', { ...disabled, ok: !disabled.enabled && disabled.gain === 1 && disabled.css === 1 });
    check('ページのエラーなし', { ok: errors.length === 0, errors: errors.slice(0, 3) });
  } finally { await browser.close(); server.kill(); }
  if (failed) { console.error(`${failed} 件の確認に失敗`); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
