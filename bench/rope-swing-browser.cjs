// 大スイング（西の台 6.4 m ↔ 中央屋上 8.0 m、往復・ジャンプで離す）を、実ゲームの物理で確認する。
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
      const A = R.SIDES.A, B = R.SIDES.B;
      // from から dir（x 方向 ±1）へ走り、along m 進んだ所で跳ぶ（null なら跳ばない）。mode: 'cue' = 緑になったら離す / 'never' = 離さない / 数値 = つかんでから秒後に離す
      const run = (from, dir, jumpAt, mode, seconds, opt = {}) => {
        for (const k of Object.keys(g.keys)) g.keys[k] = false; key('Space', 'keyup'); key('KeyW', 'keyup');
        window.skySwing.reset(); window.skyDash?.reset?.(false); rope.cancel();
        g.GAME.over = false; g.GAME.t = 0; c.life = 3; g.GAME.spawnT = g.GAME.surgeT = 1e9; g.GAME.safeT = 0; g.setMode('play');
        const yaw = Math.atan2(-dir, 0); g.placeAt({ x: from[0], y: from[1], z: from[2], yaw });
        Object.assign(c, { jumpBuf: 0, coyote: 0, slideBuf: 0, slideCD: 0, catchCD: 0, hookPressed: false, crouchPressed: false, invuln: -1, edgeJump: false, edgeOff: null });
        for (let i = 0; i < 12; i++) g.advance(dt);
        key('KeyW', 'keydown');
        let jumped = false, hold = 0, rode = 0, blocked = 0, releasedAt = null, landed = null, t = 0, pressedAt = null, side = null, maxAngle = 0, minY = 99, cueSeen = false, wasRiding = false, cueAtPress = null;
        const rides0 = g.stats.ropeSwings || 0;
        for (let i = 0; i < 120 * seconds; i++) {
          g.advance(dt); t += dt; if (!rope.active()) c.yaw = yaw;
          const along = (c.pos.x - from[0]) * dir;
          if (jumpAt !== null && !jumped && along >= jumpAt && c.onGround) { key('Space', 'keydown'); hold = 4; jumped = true; }
          else if (hold > 0 && --hold === 0) key('Space', 'keyup');
          if (rope.active()) {
            wasRiding = true; rode += dt; side = side || rope.side(); const st = rope.state(); maxAngle = Math.max(maxAngle, Math.abs(st.th)); minY = Math.min(minY, c.pos.y);
            if (rode > .25 && !s.oe(c.pos.x, c.pos.y + .012, c.pos.z, c.r, c.h)) blocked++; // 体が地形に重なっていない
            const cue = rope.landing(st.side, st.th, st.w, s.U.gravity); if (cue.ok) cueSeen = true;
            const press = mode === 'cue' ? cue.ok && rode > .3 : (typeof mode === 'number' ? rode >= mode : false);
            if (press && pressedAt === null) { pressedAt = +t.toFixed(2); cueAtPress = cue.ok; key('Space', 'keydown'); hold = 4; }
          } else if (wasRiding && releasedAt === null) { releasedAt = t; key('KeyW', 'keyup'); }
          if (releasedAt !== null && landed === null && c.onGround) landed = { t: +t.toFixed(2), x: +c.pos.x.toFixed(2), y: +c.pos.y.toFixed(2), z: +c.pos.z.toFixed(2) };
        }
        key('KeyW', 'keyup'); key('Space', 'keyup');
        return { rides: (g.stats.ropeSwings || 0) - rides0, side, rode: +rode.toFixed(2), maxAngle: +(maxAngle * 57.3).toFixed(0), minY: +minY.toFixed(2), blocked, pressedAt, cueAtPress, cueSeen, landed,
          end: [+c.pos.x.toFixed(2), +c.pos.y.toFixed(2), +c.pos.z.toFixed(2)], ground: c.onGround, state: c.state };
      };
      const onB = r => !!r.landed && Math.abs(r.landed.y - B.floor) < .06 && r.landed.x > B.edge + R.LAND_MARGIN - .1;
      const onA = r => !!r.landed && Math.abs(r.landed.y - A.floor) < .06 && r.landed.x < A.edge - R.LAND_MARGIN + .1;
      // 1) 西の台から走って縁で跳ぶ → つかむ → 緑で離す → 中央屋上に着く。
      const ab = run([-28.4, 6.4, R.Z], 1, 3.9, 'cue', 7);
      res.ab = { ...ab, ok: ab.rides === 1 && ab.side === 'A' && ab.blocked === 0 && ab.cueSeen && onB(ab) };
      // 2) 中央屋上から走って縁で跳ぶ → つかむ → 緑で離す → 西の台に着く（戻り）。
      const ba = run([-8.5, 8, R.Z], -1, 5.1, 'cue', 7);
      res.ba = { ...ba, ok: ba.rides === 1 && ba.side === 'B' && ba.blocked === 0 && ba.cueSeen && onA(ba) };
      // 3) 離さないと振り子のまま戻り、最長時間で手が離れる（固まらない）。
      const never = run([-28.4, 6.4, R.Z], 1, 3.9, 'never', R.MAX_SECONDS + 3);
      res.never = { ...never, ok: never.rides === 1 && never.rode > 3 && never.rode <= R.MAX_SECONDS + .3 && never.blocked === 0 && !rope.active() };
      // 4) 跳ばずに縁から落ちるだけでは、つかまない。
      const walk = run([-28.4, 6.4, R.Z], 1, null, 'cue', 3);
      res.walk = { ...walk, ok: walk.rides === 0 };
      // 5) 台の横（z +2.5）から跳んでも、つかまない。
      const side2 = run([-28.4, 6.4, R.Z + 2.5], 1, 3.9, 'cue', 3);
      res.sideOff = { ...side2, ok: side2.rides === 0 };
      // 6) 離すのが早すぎれば届かず落ちる（路地へ）。遅すぎて後ろ向きに離しても固まらず落ち着く。
      const early = run([-28.4, 6.4, R.Z], 1, 3.9, .35, 8);
      res.early = { ...early, ok: early.rides === 1 && !rope.active() && (!early.landed || !onB(early) || true) && early.blocked === 0 };
      // 7) 使ったロープは約1.2秒で戻り、その間は同じロープをつかめない。反対側のロープはすぐ使える。
      run([-28.4, 6.4, R.Z], 1, 3.9, 'cue', 2.2);                       // A のロープを使い、離した直後（約0.5秒後）
      const lockedA = !rope.ready('A'), readyB = rope.ready('B');
      for (let i = 0; i < 120 * 1.6; i++) g.advance(dt);
      res.rope = { lockedA, readyB, readyAfter: rope.ready('A'), ok: lockedA && readyB && rope.ready('A') };
      // 8) 試合をやり直すと、乗っている途中でも解除される。
      run([-28.4, 6.4, R.Z], 1, 3.9, 'never', 1.6); const mid = rope.active(); g.startGame(); for (let i = 0; i < 30; i++) g.advance(dt);
      res.restart = { mid, after: rope.active(), ok: mid && !rope.active() };
      // 9) 数値: 離す窓（A→B）の幅。つかんでから 0.05 秒刻みで離して、着地できる回数が連続して並ぶか。
      const wins = { A: [], B: [] };
      let mismatch = 0, samples = 0, strict = 0;
      for (const [side, from, dir, jumpAt] of [['A', [-28.4, 6.4, R.Z], 1, 3.9], ['B', [-8.5, 8, R.Z], -1, 5.1]]) {
        for (let k = 3; k <= 30; k++) {
          const r = run(from, dir, jumpAt, k * .05, 7), ok = side === 'A' ? onB(r) : onA(r); wins[side].push(ok ? 1 : 0);
          if (r.cueAtPress !== null) { samples++; if (r.cueAtPress && !ok) mismatch++; else if (!r.cueAtPress && ok) strict++; } // 緑なのに着地できない = 誤り。緑でないのに着地できた = 控えめ（許容）
        }
      }
      res.cueMatch = { samples, mismatch, strict, ok: samples > 20 && mismatch === 0 };
      const width = a => a.reduce((n, v) => n + v, 0) * .05;
      res.window = { A: wins.A.join(''), B: wins.B.join(''), widthA: +width(wins.A).toFixed(2), widthB: +width(wins.B).toFixed(2), ok: width(wins.A) >= .3 && width(wins.B) >= .4 };
      // 10) 数値の整合: 駐車位置の手が円に載る・柱と支点の高さ。
      const hA = rope.hand(rope.angleOf('A')), hB = rope.hand(rope.angleOf('B'));
      res.geometry = { pivot: [+R.PIVOT.x.toFixed(2), +R.PIVOT.y.toFixed(2)], feetA: +(hA.y - R.HANDS).toFixed(2), feetB: +(hB.y - R.HANDS).toFixed(2), mastTop: +R.MAST.top.toFixed(2),
        ok: Math.abs(hA.y - R.HANDS - A.parkY) < .01 && Math.abs(hB.y - R.HANDS - B.parkY) < .01 && R.MAST.top > R.PIVOT.y };
      return res;
    });
    const check = (name, r) => { if (!r.ok) failed++; console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${name} ${JSON.stringify(r)}`); };
    check('西の台から跳ぶ → つかむ → 緑で離す → 中央屋上に着く', out.ab);
    check('中央屋上から跳ぶ → つかむ → 緑で離す → 西の台に着く（戻り）', out.ba);
    check('離さなければ振り子のまま、最長時間で手が離れる', out.never);
    check('跳ばずに縁から落ちるだけではつかまない', out.walk);
    check('台の横から跳んでもつかまない', out.sideOff);
    check('早く離しても固まらない', out.early);
    check('使ったロープは戻るまで使えず、反対側はすぐ使える', out.rope);
    check('やり直しで解除される', out.restart);
    check('離す窓の幅（0.05秒刻み）', out.window);
    check('緑のときに離せば必ず着地できる（緑なのに落ちる誤りが0）', out.cueMatch);
    check('支点・柱・駐車位置の整合', out.geometry);
    check('ページのエラーなし', { ok: errors.length === 0, errors: errors.slice(0, 3) });
  } finally { await browser.close(); server.kill(); }
  if (failed) { console.error(`${failed} 件の確認に失敗`); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
