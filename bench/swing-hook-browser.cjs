// ターザン（ロープ振り・鉄棒）につかまっている間も、フック（Q／右クリック／マークのタップ）で移れることを、実エンジンで確かめる。
//   node bench/swing-hook-browser.cjs        （環境変数 PORT）
// フック先は、本物のアンカー配列（__skyInternals.us）に目の前の足場を1つ足して用意する（走行中に本物のマークが出る場所が少ないため）。
const path = require('node:path'), { spawn } = require('node:child_process');
const { revealHomeControl } = require('./home-controls.cjs');
const root = path.resolve(__dirname, '..'), PORT = Number(process.env.PORT || 8884);
(async () => {
  const { chromium } = require('playwright');
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { if (await fetch(`http://127.0.0.1:${PORT}/`).then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  let failed = 0; const check = (name, ok, detail) => { console.log((ok ? 'ok  ' : 'FAIL') + ' ' + name + (ok ? '' : ' ' + JSON.stringify(detail))); if (!ok) failed++; };
  try {
    for (const map of ['index.html', 'canyon.html']) {
      const context = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1280, height: 720 } });
      await context.addInitScript(() => { window.__hold = true; });
      await context.route('https://**/*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0,"ok":true}' }));
      const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(240000);
      await page.goto(`http://127.0.0.1:${PORT}/${map}?challengeDebug=1`);
      await page.waitForFunction(() => window.__game && window.skySwing && (location.pathname.endsWith('canyon.html') || window.skyRopeSwing?.step));
      const level = page.locator('[data-difficulty=normal]'); await revealHomeControl(page, level); await level.click(); await page.locator('#bStart').click();
      const res = await page.evaluate(async ({ map }) => {
        const g = __game, s = __skyInternals, c = g.P, dt = 1 / 120, out = {};
        const key = (code, type) => dispatchEvent(new KeyboardEvent(type, { code }));
        for (const z of s.Jt) { s.ue.remove(z.m.root); if (z.pool) s.ue.remove(z.pool); } s.Jt.length = 0;
        g.SCR.off = g.PACE.off = g.MARK.off = true;
        Object.assign(g.S, { sendLog: false, gunOn: false, autoFire: false, aimAuto: false, stalkerOn: false, stalker2: false, dropShare: 0 }); c.invuln = Infinity;
        const quiet = () => { for (const k of Object.keys(g.keys)) g.keys[k] = false; key('Space', 'keyup'); key('KeyW', 'keyup'); key('KeyQ', 'keyup'); };
        const reset = () => { quiet(); window.skySwing.reset(); window.skyDash?.reset?.(false); window.skyRopeSwing?.cancel?.(); g.GAME.over = false; g.GAME.t = 0; c.life = 3; g.GAME.spawnT = g.GAME.surgeT = 1e9; g.GAME.safeT = 0; g.setMode('play'); c.hookCD = 0; c.hookPressed = false; c.hookPick = null; };
        const fwd = () => [-Math.sin(c.yaw), -Math.cos(c.yaw)];
        let added = null;
        const addAnchor = (ahead = 6, up = 3) => { const [fx, fz] = fwd(); added = [c.pos.x + fx * ahead, c.pos.y + up, c.pos.z + fz * ahead]; s.us.push(added); return added; };
        const dropAnchor = () => { const i = s.us.indexOf(added); if (i >= 0) s.us.splice(i, 1); added = null; };
        const frame = n => { for (let i = 0; i < n; i++) { g.cam(dt); g.advance(dt); } };
        // --- 鉄棒 ---
        const course = window.skySwing.course;
        if (course?.bars?.length) {
          const grab = () => {
            reset(); const b = course.bars[0], d = b.direction;
            c.pos.set(b.at[0] - d[0], b.at[1] - 2, b.at[2] - d[1]); c.vel.set(d[0] * 5, 0, d[1] * 5);
            Object.assign(c, { yaw: Math.atan2(-d[0], -d[1]), pitch: 0, state: 'normal', onGround: false, h: 1.75, jumpBuf: 0, catchCD: 0, coyote: 0, crouchPressed: false, edgeOff: null, life: 3 });
            window.skyFollowCamera?.reset(); g.cam(dt); g.playerStep(1 / 120);
            return !!window.skySwing.active;
          };
          out.barGrab = grab();
          // フック先なしで押す → つかんだまま（入力は捨てられ、あとで勝手に発動しない）。
          frame(10); g.cam(dt); out.barRealTarget = !!s.hookAssist().target();
          if (out.barRealTarget) { added = null; key('KeyQ', 'keydown'); key('KeyQ', 'keyup'); frame(1); out.barNoTarget = { still: false, state: c.state, pressed: c.hookPressed, real: true }; out.barTarget = true; out.bar = { active: !!window.skySwing.active, state: c.state, pressed: c.hookPressed }; out.barAfter = { start: 0, dist: -9, state: c.state, minDist: -9 }; frame(60); }
          else {
          key('KeyQ', 'keydown'); key('KeyQ', 'keyup'); frame(6);
          out.barNoTarget = { still: !!window.skySwing.active, state: c.state, pressed: c.hookPressed };
          // フック先あり → つかみが外れてフックへ。
          addAnchor(); g.cam(dt); const t = s.hookAssist().target(); out.barTarget = t === added; const d0 = () => Math.hypot(c.pos.x - added[0], c.pos.y + 1.6 - added[1], c.pos.z - added[2]); const bd0 = d0();
          key('KeyQ', 'keydown'); frame(1); key('KeyQ', 'keyup');
          out.bar = { active: !!window.skySwing.active, state: c.state, hooks: g.stats.hooks, pressed: c.hookPressed };
          let m = bd0; for (let i = 0; i < 200; i++) { frame(1); m = Math.min(m, d0()); } out.barAfter = { start: +bd0.toFixed(1), dist: +d0().toFixed(1), minDist: +m.toFixed(1), state: c.state };
          dropAnchor(); }
          // マークをタップする経路（hookPick を持つ）でも同じ。
          out.barGrab2 = grab(); frame(8); addAnchor(); g.cam(dt);
          c.hookPick = added; c.skyHookSource = 'canvas'; c.hookPressed = true; frame(1);
          out.barTap = { active: !!window.skySwing.active, state: c.state }; frame(2); dropAnchor();
          // 手を離して普通に降りる経路（ジャンプ）が壊れていない。
          out.barJump = grab(); frame(8); key('Space', 'keydown'); frame(2); key('Space', 'keyup'); frame(2);
          out.barJumpState = { active: !!window.skySwing.active, state: c.state };
          // 救済（3キー）も、つかまったまま使える。
          out.barRescueGrab = grab(); frame(8); const r0 = window.skyRescue?.charges; const ct = window.skyRescue?.chooseTarget?.(); out.barChoose = !!ct; out.barAvail = window.skyRescue?.available?.(); document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit3', bubbles: true })); frame(1);
          out.barRescue = { has: r0 !== undefined, state: c.state, active: !!window.skySwing.active, charges: window.skyRescue?.charges };
        }
        // --- ロープ（旧市街のみ） ---
        const R = window.SKY_ROPE_SWING, rope = window.skyRopeSwing;
        if (R && map === 'index.html') {
          const ride = () => {
            reset(); const from = [-28.4, 6.4, R.Z], yaw = Math.atan2(-1, 0);
            g.placeAt({ x: from[0], y: from[1], z: from[2], yaw }); Object.assign(c, { jumpBuf: 0, coyote: 0, crouchPressed: false, edgeJump: false, edgeOff: null });
            frame(12); key('KeyW', 'keydown'); let jumped = false, hold = 0;
            for (let i = 0; i < 120 * 5 && !rope.active(); i++) {
              g.cam(dt); g.advance(dt); c.yaw = yaw;
              if (!jumped && c.pos.x - from[0] >= 3.9 && c.onGround) { key('Space', 'keydown'); hold = 4; jumped = true; } else if (hold > 0 && --hold === 0) key('Space', 'keyup');
            }
            key('KeyW', 'keyup'); key('Space', 'keyup'); frame(30);
            return rope.active();
          };
          out.ropeRide = ride();
          key('KeyQ', 'keydown'); key('KeyQ', 'keyup'); frame(5);
          out.ropeNoTarget = { still: rope.active(), pressed: c.hookPressed, state: c.state };
          addAnchor(6, 3); g.cam(dt); out.ropeTarget = s.hookAssist().target() === added; const rd0 = Math.hypot(c.pos.x - added[0], c.pos.y + 1.6 - added[1], c.pos.z - added[2]);
          const yawBefore = c.yaw;
          key('KeyQ', 'keydown'); frame(1); key('KeyQ', 'keyup');
          out.rope = { active: rope.active(), state: c.state, pressed: c.hookPressed, yawKept: Math.abs(c.yaw - yawBefore) < 1e-6 };
          frame(200); out.ropeAfter = { start: +rd0.toFixed(1), dist: +Math.hypot(c.pos.x - added[0], c.pos.y + 1.6 - added[1], c.pos.z - added[2]).toFixed(1), state: c.state };
          dropAnchor();
          // ジャンプで離す通常の経路。
          out.ropeRide2 = ride(); key('Space', 'keydown'); frame(2); key('Space', 'keyup'); frame(2);
          out.ropeJump = { active: rope.active(), state: c.state };
          out.ropeRescueRide = ride(); out.ropeChoose = !!window.skyRescue.chooseTarget(); out.ropeAvail = window.skyRescue.available(); document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit3', bubbles: true })); frame(1);
          out.ropeRescue = { state: c.state, active: rope.active(), charges: window.skyRescue?.charges };
        }
        quiet();
        return out;
      }, { map });
      console.log('==', map, JSON.stringify(res));
      if (res.barGrab !== undefined) {
        check(map + ' 鉄棒をつかめた', res.barGrab && res.barGrab2 && res.barJump, res);
        check(map + ' 鉄棒: フック先なしではつかんだまま・入力は残らない', (res.barNoTarget.real ? res.barNoTarget.state === 'hook' : res.barNoTarget.still && res.barNoTarget.state === 'swing') && res.barNoTarget.pressed === false, res.barNoTarget);
        check(map + ' 鉄棒: フック先ありで外れてフックへ', res.barTarget && !res.bar.active && res.bar.state === 'hook' && res.bar.pressed === false, res.bar);
        check(map + ' 鉄棒: フックでアンカーへ近づく', res.barAfter.dist === -9 || res.barAfter.minDist < res.barAfter.start - 2, res.barAfter);
        check(map + ' 鉄棒: マークのタップ経路でも外れてフックへ', !res.barTap.active && res.barTap.state === 'hook', res.barTap);
        if (res.barChoose) check(map + ' 鉄棒: 救済（3）でもつかみが外れてフックへ', res.barRescue.state === 'hook' && !res.barRescue.active, res.barRescue); else console.log('skip 鉄棒の救済: この棒の位置には救済先がない', map);
        check(map + ' 鉄棒: ジャンプで離す通常経路は変わらない', !res.barJumpState.active && res.barJumpState.state !== 'swing', res.barJumpState);
      }
      if (res.ropeRide !== undefined) {
        check(map + ' ロープをつかめた', res.ropeRide && res.ropeRide2, res);
        check(map + ' ロープ: フック先なしでは振り続け・入力は残らない', res.ropeNoTarget.still && res.ropeNoTarget.pressed === false, res.ropeNoTarget);
        check(map + ' ロープ: フック先ありで手を離してフックへ（向きは保つ）', res.ropeTarget && !res.rope.active && res.rope.state === 'hook' && res.rope.pressed === false && res.rope.yawKept, res.rope);
        check(map + ' ロープ: フックでアンカーへ近づく', res.ropeAfter.dist < res.ropeAfter.start - 2, res.ropeAfter);
        check(map + ' ロープ: 救済（3）でも手が離れてフックへ', res.ropeRescue.state === 'hook' && !res.ropeRescue.active, res.ropeRescue);
        check(map + ' ロープ: ジャンプで離す通常経路は変わらない', !res.ropeJump.active, res.ropeJump);
      }
      check(map + ' ページエラーなし', errors.length === 0, errors.slice(0, 3));
      await context.close();
    }
  } finally { await browser.close(); server.kill(); }
  console.log(failed ? `\n${failed} 件失敗` : '\n全部OK'); process.exit(failed ? 1 : 0);
})();
