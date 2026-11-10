// 中央屋上の溝と柵を、実ゲームの物理で確認する。
//   node bench/roof-trenches-browser.cjs
// 跳び越す（両方向）／縁で止まる／底からよじ登る／柵を乗り越える／溝の底が経路グラフに入っている、を見る。
const fs = require('node:fs'), path = require('node:path'), { spawn } = require('node:child_process');
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
    await page.waitForFunction(() => window.__game && window.skySwing && window.SKY_ROOF_TRENCHES);
    const level = page.locator('[data-difficulty=normal]'); await revealHomeControl(page, level); await level.click(); await page.locator('#bStart').click();
    const out = await page.evaluate(async () => {
      const g = __game, s = __skyInternals, c = g.P, dt = 1 / 120, T = window.SKY_ROOF_TRENCHES, res = {};
      const key = (code, type) => dispatchEvent(new KeyboardEvent(type, { code }));
      for (const z of s.Jt) { s.ue.remove(z.m.root); if (z.pool) s.ue.remove(z.pool); } s.Jt.length = 0;
      g.SCR.off = g.PACE.off = g.MARK.off = true;
      Object.assign(g.S, { sendLog: false, gunOn: false, autoFire: false, aimAuto: false, stalkerOn: false, stalker2: false, dropShare: 0 });
      const reset = (x, y, z, dx, dz) => {
        for (const k of Object.keys(g.keys)) g.keys[k] = false; key('Space', 'keyup'); key('KeyW', 'keyup');
        window.skySwing.reset(); window.skyDash?.reset?.(false);
        g.GAME.over = false; g.GAME.t = 0; c.life = 3; g.GAME.spawnT = g.GAME.surgeT = 1e9; g.GAME.safeT = 0; g.setMode('play');
        const yaw = Math.atan2(-dx, -dz); g.placeAt({ x, y, z, yaw });
        Object.assign(c, { jumpBuf: 0, coyote: 0, slideBuf: 0, slideCD: 0, catchCD: 0, hookPressed: false, crouchPressed: false, invuln: -1, edgeJump: false, edgeOff: null });
        for (let i = 0; i < 12; i++) g.advance(dt); return yaw;
      };
      // 走って、縁の手前 jumpAt m で跳ぶ（jumpAt が null なら跳ばない）。seconds 秒後の位置を返す。
      const run = (from, dir, edge, jumpBefore, seconds, mash = false) => {
        const yaw = reset(from[0], from[1], from[2], dir[0], dir[1]); key('KeyW', 'keydown');
        let jumped = false, minY = c.pos.y, maxSpeed = 0;
        for (let i = 0; i < 120 * seconds; i++) {
          g.advance(dt); c.yaw = yaw;
          const along = (c.pos.x - from[0]) * dir[0] + (c.pos.z - from[2]) * dir[1];
          maxSpeed = Math.max(maxSpeed, Math.hypot(c.vel.x, c.vel.z)); minY = Math.min(minY, c.pos.y);
          if (jumpBefore != null && !jumped && along >= edge - jumpBefore) { key('Space', 'keydown'); jumped = true; }
          else if (jumped && i % 3 === 0) { key('Space', 'keyup'); if (mash && c.onGround && i % 24 === 0) key('Space', 'keydown'); }
          else if (mash && jumpBefore == null && c.onGround && i % 30 === 0) { key('Space', 'keydown'); jumped = true; }
        }
        key('KeyW', 'keyup'); key('Space', 'keyup');
        return { x: +c.pos.x.toFixed(2), y: +c.pos.y.toFixed(2), z: +c.pos.z.toFixed(2), minY: +minY.toFixed(2), maxSpeed: +maxSpeed.toFixed(2), state: c.state, ground: c.onGround };
      };
      // 東西の溝（z 1〜4）を x=-7 と x=7 で、南北の溝（x -2〜2）を z=7 と z=-3 で跳ぶ。
      const crossed = (p, test) => test(p) && Math.abs(p.y - 8) < .05 && p.minY > 7.9;
      res.jumps = [
        ['東西の溝を南へ x=10', run([10, 8, -4], [0, 1], 5, .35, 1.7), p => crossed(p, p => p.z > 4)],
        ['東西の溝を北へ x=10', run([10, 8, 9], [0, -1], 5, .35, 1.7), p => crossed(p, p => p.z < 1)],
        ['南北の溝を東へ z=-1', run([-8, 8, -1], [1, 0], 6, .35, 1.8), p => crossed(p, p => p.x > 2)],
        ['南北の溝を西へ z=-4.5', run([7, 8, -4.5], [-1, 0], 5, .35, 1.8), p => crossed(p, p => p.x < -2)],
      ].map(([name, p, ok]) => ({ name, ...p, ok: ok(p) }));
      // 走るだけでは縁で止まり、落ちない（既存の縁の補助）。
      const edge = run([10, 8, -4], [0, 1], 5, null, 1.6);
      res.edge = { ...edge, ok: Math.abs(edge.y - 8) < .05 && edge.z < 1.4 };
      // 跳び損ねて底（6.2 m）にいる状態から、前へ進んでジャンプ → 屋上に戻る。
      const climb = run([10, T.FLOOR, 1.6], [0, 1], 0, null, 1.6, true);
      res.climb = { ...climb, ok: Math.abs(climb.y - 8) < .05 && climb.z > 4 && Math.abs(climb.minY - T.FLOOR) < .05 };
      // 柵（西の縁 z=-2.5）を走って乗り越える。
      const rail = run([-12.5, 8, -9], [0, 1], 6.25, .9, 2.2);
      res.rail = { ...rail, ok: rail.z > -2.25 && Math.abs(rail.y - 8) < .05 };
      // 経路グラフ: 溝の底に足場があり、追手は降りて登り直せる。
      const N = g.NAV, floorNodes = N.nodes.filter(n => Math.abs(n.y - T.FLOOR) < .01).length;
      const link = (kind, y0, y1) => N.E.filter(e => e.kind === kind && e.to != null && Math.abs(N.nodes[e.from].y - y0) < .01 && Math.abs(N.nodes[e.to].y - y1) < .01).length;
      res.nav = { floorNodes, dropIn: [0, 2, 7].reduce((n, k) => n + link(k, 8, T.FLOOR), 0), climbOut: link(1, T.FLOOR, 8) };
      res.nav.ok = floorNodes >= 80 && res.nav.dropIn >= 40 && res.nav.climbOut >= 40;
      // 屋上の小物が宙に浮いていない（下に床がある）。
      res.props = g.solids.filter(b => b.type === 'prop' && b.minX > -14 && b.maxX < 14 && b.minZ > -14 && b.maxZ < 14 && b.minY >= 6 && b.minY < 10)
        .map(b => ({ at: [(b.minX + b.maxX) / 2, b.minY, (b.minZ + b.maxZ) / 2].map(v => +v.toFixed(2)),
          supported: g.solids.some(o => o !== b && o.solid !== false && Math.abs(o.maxY - b.minY) < .03 && o.minX <= b.minX + .05 && o.maxX >= b.maxX - .05 && o.minZ <= b.minZ + .05 && o.maxZ >= b.maxZ - .05) }));
      // 追手: 屋上から溝に落ちて止まらない／溝の底から登って襲える／溝に立っても「建物に入った」扱いにならない。
      const chase = (pp, ep) => {
        g.startGame(); for (const e of g.zombies) s.ue.remove(e.m.root); g.zombies.length = 0;
        g.GAME.spawnT = g.GAME.surgeT = 1e9; g.SCR.off = g.PACE.off = g.MARK.off = true; g.STALK.spawned = true;
        Object.assign(g.S, { sendLog: false, autoFire: false, aimAuto: false, stalkerOn: false });
        c.pos.set(pp[0], pp[1] + .003, pp[2]); c.vel.set(0, 0, 0);
        Object.assign(c, { onGround: true, state: 'normal', h: 1.75, invuln: 0, ledge: null, ladder: null, hook: null, zip: null }); c.lastGround.copy(c.pos); c.safe.copy(c.pos);
        c.node = g.nodeAt(c.pos.x, c.pos.y + .1, c.pos.z); g.updateField();
        const e = new g.Zombie(ep[0], ep[1] + .003, ep[2]); Object.assign(e, { spawnT: 0, onGround: true, flank: false, dropper: false, stalker: false, pz: false, speedMul: 1 }); g.zombies.push(e);
        const life = c.life; let hit = null;
        for (let i = 0; i < 20 * 60 && !g.GAME.over; i++) { g.advance(1 / 60); if (c.life < life) { hit = +g.GAME.t.toFixed(1); break; } }
        return { player: pp, zombie: ep, hit, end: e.pos.toArray().map(v => +v.toFixed(2)), entered: g.INDOOR_ACCESS.snapshot().filter(r => r.entered).length };
      };
      res.chase = [chase([0, 8, 11.6], [0, 8, 8]), chase([0, 8, 13], [0, T.FLOOR, 10]), chase([6, 8, 7], [6, T.FLOOR, 2.5])];
      const pit = chase([0, T.FLOOR, 6], [6, 8, 6]); res.pit = { ...pit, ok: pit.hit !== null && pit.entered === 0 };
      return res;
    });
    const check = (name, ok, detail) => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${JSON.stringify(detail)}`); };
    for (const j of out.jumps) check(j.name, j.ok, j);
    check('走るだけでは縁で止まる', out.edge.ok, out.edge);
    check('底からよじ登って出られる', out.climb.ok, out.climb);
    check('柵を乗り越えられる', out.rail.ok, out.rail);
    check('経路グラフ', out.nav.ok, out.nav);
    for (const r of out.chase) check('追手が溝を越えて襲える（20秒以内）', r.hit !== null, r);
    check('溝の中は建物の中として扱わない', out.pit.ok, out.pit);
    const floating = out.props.filter(p => !p.supported && p.at[1] < 9); // 箱の上に載った小物は対象外
    check('小物が浮いていない', floating.length === 0, floating);
    check('ページのエラーなし', errors.length === 0, errors.slice(0, 3));


  } finally { await browser.close(); server.kill(); }
  if (failed) { console.error(`${failed} 件失敗`); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
