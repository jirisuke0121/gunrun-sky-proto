// 大スイング（東塔→南の屋根）を、実ゲームの物理で確認する。
//   node bench/rope-swing-browser.cjs
const path = require('node:path'), { spawn } = require('node:child_process');
const { revealHomeControl } = require('./home-controls.cjs');
const root = path.resolve(__dirname, '..'), PORT = 8798;
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
    await page.waitForFunction(() => window.__game && window.skySwing && window.skyRopeSwing?.step);
    const level = page.locator('[data-difficulty=normal]'); await revealHomeControl(page, level); await level.click(); await page.locator('#bStart').click();
    const out = await page.evaluate(async () => {
      const g = __game, s = __skyInternals, c = g.P, dt = 1 / 120, R = window.SKY_ROPE_SWING, rope = window.skyRopeSwing, res = {};
      const key = (code, type) => dispatchEvent(new KeyboardEvent(type, { code }));
      for (const z of s.Jt) { s.ue.remove(z.m.root); if (z.pool) s.ue.remove(z.pool); } s.Jt.length = 0;
      g.SCR.off = g.PACE.off = g.MARK.off = true;
      Object.assign(g.S, { sendLog: false, gunOn: false, autoFire: false, aimAuto: false, stalkerOn: false, stalker2: false, dropShare: 0 });
      // from から dir へ走る。jumpAt（進んだ距離 m）でジャンプを押す（null なら押さない）。fresh=false なら試合を続ける（ロープの戻りを見る）。
      const run = (from, dir, jumpAt, seconds, fresh = true) => {
        for (const k of Object.keys(g.keys)) g.keys[k] = false; key('Space', 'keyup'); key('KeyW', 'keyup');
        window.skySwing.reset(); window.skyDash?.reset?.(false);
        g.GAME.over = false; if (fresh) g.GAME.t = 0; c.life = 3; g.GAME.spawnT = g.GAME.surgeT = 1e9; g.GAME.safeT = 0; g.setMode('play');
        const yaw = Math.atan2(-dir[0], -dir[1]); g.placeAt({ x: from[0], y: from[1], z: from[2], yaw });
        Object.assign(c, { jumpBuf: 0, coyote: 0, slideBuf: 0, slideCD: 0, catchCD: 0, hookPressed: false, crouchPressed: false, invuln: -1, edgeJump: false, edgeOff: null });
        for (let i = 0; i < 12; i++) g.advance(dt);
        key('KeyW', 'keydown');
        let jumped = false, hold = 0, rode = 0, minClear = 9, maxSpeed = 0, lowest = 99, blocked = 0, landedAt = null, releasedAt = null, t = 0;
        const rides0 = g.stats.ropeSwings || 0;
        for (let i = 0; i < 120 * seconds; i++) {
          g.advance(dt); t += dt; if (!rope.active()) c.yaw = yaw;
          const along = (c.pos.x - from[0]) * dir[0] + (c.pos.z - from[2]) * dir[1];
          if (jumpAt !== null && !jumped && along >= jumpAt && c.onGround) { key('Space', 'keydown'); hold = 4; jumped = true; }
          else if (hold > 0 && --hold === 0) key('Space', 'keyup');
          if (rope.active()) {
            rode += dt; maxSpeed = Math.max(maxSpeed, c.vel.length());
            if (rode > .25 && !s.oe(c.pos.x, c.pos.y + .012, c.pos.z, c.r, c.h)) blocked++; // 体が地形に重なっていない
            lowest = Math.min(lowest, c.pos.y);
          } else if (rode > 0 && releasedAt === null) { releasedAt = t; key('KeyW', 'keyup'); }
          if (releasedAt !== null && landedAt === null && c.onGround) landedAt = { t: +t.toFixed(2), x: +c.pos.x.toFixed(2), y: +c.pos.y.toFixed(2), z: +c.pos.z.toFixed(2) };
        }
        key('KeyW', 'keyup'); key('Space', 'keyup');
        return { rides: (g.stats.ropeSwings || 0) - rides0, rode: +rode.toFixed(2), maxSpeed: +maxSpeed.toFixed(1), lowest: +lowest.toFixed(2), blocked, landedAt,
          end: [+c.pos.x.toFixed(2), +c.pos.y.toFixed(2), +c.pos.z.toFixed(2)], state: c.state, ground: c.onGround, ready: rope.ready() };
      };
      // 1) 印の帯を南へ走り、縁（z -6）の手前で跳ぶ → 乗る → 南の屋根（4.4 m）に降りて止まる。
      const main = run([R.X, 14.4, -11], [0, 1], 4.5, 6);
      res.main = { ...main, ok: main.rides === 1 && main.blocked === 0 && !!main.landedAt && Math.abs(main.landedAt.y - 4.4) < .06 && main.landedAt.z > 8.5 && main.landedAt.z < 13 &&
        Math.abs(main.end[1] - 4.4) < .06 && main.end[2] < 13.9 && main.lowest > 4.9 && main.maxSpeed <= R.V_MAX + .2 };
      // 2) 帯の端（x +0.6）からでも乗れる。
      const off = run([R.X + .6, 14.4, -11], [0, 1], 4.5, 6);
      res.off = { ...off, ok: off.rides === 1 && !!off.landedAt && Math.abs(off.landedAt.y - 4.4) < .06 };
      // 3) 跳ばずに縁へ走るだけでは乗らない（縁で止まるか、落ちるだけ）。
      const walk = run([R.X, 14.4, -11], [0, 1], null, 3);
      res.walk = { ...walk, ok: walk.rides === 0 };
      // 4) 帯の外（x 44.6）から跳んでも乗らない。
      const outside = run([44.6, 14.4, -11], [0, 1], 4.5, 3);
      res.outside = { ...outside, ok: outside.rides === 0 };
      // 5) 使った直後はロープが戻っていない: すぐもう一度跳んでも乗らない。戻ったあとは乗れる。
      run([R.X, 14.4, -11], [0, 1], 4.5, 2.6);                 // 乗って、離した直後（戻り途中）
      const again = run([R.X, 14.4, -8.2], [0, 1], 1.7, 1.2, false);
      const readyLater = (() => { for (let i = 0; i < 120 * 4; i++) g.advance(dt); return rope.ready(); })();
      res.again = { ...again, readyLater, ok: again.rides === 0 && readyLater };
      // 6) 試合をやり直すと、乗っている途中でも解除される。
      run([R.X, 14.4, -11], [0, 1], 4.5, 1.6); const mid = rope.active(); g.startGame(); for (let i = 0; i < 30; i++) g.advance(dt);
      res.restart = { mid, after: rope.active(), ok: mid && !rope.active() };
      const f = rope.flight(4.4, s.U.gravity);
      res.numbers = { arc: +R.arcLength.toFixed(1), drop: +(rope.feet(R.TH_START).y - 4.4).toFixed(1), landZ: +f.landZ.toFixed(1), ok: f.landZ > 9 && f.landZ < 12.5 };
      return res;
    });
    const check = (name, r) => { if (!r.ok) failed++; console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${name} ${JSON.stringify(r)}`); };
    check('帯を走って縁で跳ぶ → 乗る → 南の屋根に降りる', out.main);
    check('帯の端からでも乗れる', out.off);
    check('跳ばずに走るだけでは乗らない', out.walk);
    check('帯の外から跳んでも乗らない', out.outside);
    check('戻り途中は乗れず、戻ったら乗れる', out.again);
    check('やり直しで解除される', out.restart);
    check('弧と着地の数値', out.numbers);
    check('ページのエラーなし', { ok: errors.length === 0, errors: errors.slice(0, 3) });
  } finally { await browser.close(); server.kill(); }
  if (failed) { console.error(`${failed} 件の確認に失敗`); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
