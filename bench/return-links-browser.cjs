// 戻り道（西→中央の窓、東端の張り出し）を、実ゲームの物理で確認する。
//   node bench/return-links-browser.cjs
const path = require('node:path'), { spawn } = require('node:child_process');
const { revealHomeControl } = require('./home-controls.cjs');
const root = path.resolve(__dirname, '..'), PORT = 8797;
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
    await page.waitForFunction(() => window.__game && window.skySwing && window.SKY_RETURN_LINKS);
    const level = page.locator('[data-difficulty=normal]'); await revealHomeControl(page, level); await level.click(); await page.locator('#bStart').click();
    const out = await page.evaluate(async () => {
      const g = __game, s = __skyInternals, c = g.P, dt = 1 / 120, res = {};
      const key = (code, type) => dispatchEvent(new KeyboardEvent(type, { code }));
      for (const z of s.Jt) { s.ue.remove(z.m.root); if (z.pool) s.ue.remove(z.pool); } s.Jt.length = 0;
      g.SCR.off = g.PACE.off = g.MARK.off = true;
      Object.assign(g.S, { sendLog: false, gunOn: false, autoFire: false, aimAuto: false, stalkerOn: false, stalker2: false, dropShare: 0 });
      // from から dir へ走り、jumps（進んだ距離 m の一覧）でジャンプを押す。seconds 秒後の位置と、通った最低の高さを返す。
      const run = (from, dir, jumps, seconds) => {
        for (const k of Object.keys(g.keys)) g.keys[k] = false; key('Space', 'keyup'); key('KeyW', 'keyup');
        window.skySwing.reset(); window.skyDash?.reset?.(false);
        g.GAME.over = false; g.GAME.t = 0; c.life = 3; g.GAME.spawnT = g.GAME.surgeT = 1e9; g.GAME.safeT = 0; g.setMode('play');
        const yaw = Math.atan2(-dir[0], -dir[1]); g.placeAt({ x: from[0], y: from[1], z: from[2], yaw });
        Object.assign(c, { jumpBuf: 0, coyote: 0, slideBuf: 0, slideCD: 0, catchCD: 0, hookPressed: false, crouchPressed: false, invuln: -1, edgeJump: false, edgeOff: null });
        for (let i = 0; i < 12; i++) g.advance(dt);
        const startY = c.pos.y; key('KeyW', 'keydown');
        let next = 0, hold = 0, minY = c.pos.y;
        for (let i = 0; i < 120 * seconds; i++) {
          g.advance(dt); c.yaw = yaw; minY = Math.min(minY, c.pos.y);
          const along = (c.pos.x - from[0]) * dir[0] + (c.pos.z - from[2]) * dir[1];
          if (next < jumps.length && along >= jumps[next] && c.onGround) { key('Space', 'keydown'); hold = 4; next++; }
          else if (hold > 0 && --hold === 0) key('Space', 'keyup');
        }
        key('KeyW', 'keyup'); key('Space', 'keyup');
        return { startY: +startY.toFixed(2), x: +c.pos.x.toFixed(2), y: +c.pos.y.toFixed(2), z: +c.pos.z.toFixed(2), minY: +minY.toFixed(2), jumps: next, state: c.state, ground: c.onGround };
      };
      // 西→中央: 広げたデッキを東へ走り、窓を抜けて屋内の通路（x -11 より東）へ。跳ばない。
      const west = run([-15.8, 4.2, 12], [1, 0], [], 1.6);
      res.west = { ...west, ok: west.x > -10 && Math.abs(west.y - 4) < .06 };
      // 既存のデッキ（-17.3, 14.5）から窓へまっすぐ斜めに走って入れる（落ちない。中では壁に沿って進む）。
      const slant = run([-17.3, 4.2, 14.5], [.8, -.6], [], 2.2);
      res.slant = { ...slant, ok: slant.x > -13 && Math.abs(slant.y - 4) < .06 && slant.minY > 3.95 };
      // 逆向き（中央→西）: 屋内から窓を出てデッキへ。
      const back = run([-8, 4, 12], [-1, 0], [], 1.4);
      res.back = { ...back, ok: back.x < -14.5 && Math.abs(back.y - 4.2) < .06 };
      // 西の街区からこのデッキまで、高所のまま来られる（既存の地形）: 4 mの台の端（x -34.5）で跳ぶと、4.6 mのデッキの縁（x -29.8）に届く。
      const feeder = run([-37.5, 4, 14.5], [1, 0], [2.9], 2.0);
      res.feeder = { ...feeder, ok: feeder.x > -29.8 && Math.abs(feeder.y - 4.6) < .06 && feeder.minY > 2.7 };
      // 東端: デッキ（x 56）から西へ。端（x 51.5）で跳び、張り出し（x 46〜48）に落ちずに着く。
      const east = run([56, 3.6, 1.95], [-1, 0], [4.2], 1.9);
      res.east = { ...east, ok: east.x < 48 && Math.abs(east.y - 3) < .06 && east.minY > 2.95 };
      // 逆向き: 張り出しの端（x 48）で跳び、デッキへ。
      const eastBack = run([42, 3, 1.95], [1, 0], [5.7], 2.0);
      res.eastBack = { ...eastBack, ok: eastBack.x > 51.5 && Math.abs(eastBack.y - 3.6) < .06 && eastBack.minY > 2.95 };
      // 3 mの台 → 南の4.4 mの屋根（隙間2 m・1.4 m上）。
      const south = run([43, 3, -2], [0, 1], [4.4], 2.4);
      res.south = { ...south, ok: south.z > 5 && Math.abs(south.y - 4.4) < .06 };
      // 張り出しは、下の通路（-1 m）から届かない高さ。
      const R = window.SKY_RETURN_LINKS;
      res.heights = { lipAboveWalkway: R.LIP.y + 1, deckAboveStreet: R.DECK.y, ok: R.LIP.y + 1 > 3.6 && R.DECK.y > 3.6 };
      return res;
    });
    const check = (name, r) => { if (!r.ok) failed++; console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${name} ${JSON.stringify(r)}`); };
    check('西→中央: デッキから窓を抜けて屋内へ', out.west);
    check('西→中央: 既存のデッキから斜めに走って窓に入れる', out.slant);
    check('中央→西: 窓から出てデッキへ', out.back);
    check('西の4 mの台→南西のデッキ（高所のまま）', out.feeder);
    check('東端: デッキ→張り出し', out.east);
    check('東端: 張り出し→デッキ', out.eastBack);
    check('3 mの台→南の屋根', out.south);
    check('下から届かない高さ', out.heights);
    check('ページのエラーなし', { ok: errors.length === 0, errors: errors.slice(0, 3) });
  } finally { await browser.close(); server.kill(); }
  if (failed) { console.error(`${failed} 件失敗`); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
