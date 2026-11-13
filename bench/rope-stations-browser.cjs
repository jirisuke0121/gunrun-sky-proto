// 西の復帰ロープ（rope-stations.js）12か所を、実ゲームの物理で確認する。
//   node bench/rope-stations-browser.cjs
// 各ロープで、助走 → 跳ぶ → つかむ → 漕ぐ（移動入力を押し続ける）→ 緑になったら離す → 着地する台に降りる、までを実行する。
const path = require('node:path'), { spawn } = require('node:child_process');
const { revealHomeControl } = require('./home-controls.cjs');
const root = path.resolve(__dirname, '..'), PORT = Number(process.env.PORT || 8799);
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
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(600000);
    await page.goto(`http://127.0.0.1:${PORT}/index.html?challengeDebug=1`);
    await page.waitForFunction(() => window.__game && window.skyRopeStations?.step && window.skyRopeSwing?.step);
    const level = page.locator('[data-difficulty=normal]'); await revealHomeControl(page, level); await level.click(); await page.locator('#bStart').click();
    const only = process.env.STATION ? Number(process.env.STATION) : 0, lo = Number(process.env.FROM || 0), hi = Number(process.env.TO || 1e9);
    const out = await page.evaluate(async ([only, lo, hi]) => {
      const g = __game, s = __skyInternals, c = g.P, dt = 1 / 120, RS = window.SKY_ROPE_STATIONS, api = window.skyRopeStations, rope = window.skyRopeSwing, res = {};
      const key = (code, type) => dispatchEvent(new KeyboardEvent(type, { code }));
      for (const z of s.Jt) { s.ue.remove(z.m.root); if (z.pool) s.ue.remove(z.pool); } s.Jt.length = 0;
      g.SCR.off = g.PACE.off = g.MARK.off = true;
      Object.assign(g.S, { sendLog: false, gunOn: false, autoFire: false, aimAuto: false, stalkerOn: false, stalker2: false, dropShare: 0 });
      const debug = !!only; const run = (st, back, jumpAlong, mode, seconds, lat = 0) => {
        for (const k of Object.keys(g.keys)) g.keys[k] = false; key('Space', 'keyup'); key('KeyW', 'keyup');
        window.skySwing.reset(); window.skyDash?.reset?.(false); rope.cancel();
        g.GAME.over = false; g.GAME.t = 0; c.life = 3; g.GAME.spawnT = g.GAME.surgeT = 1e9; g.GAME.safeT = 0; g.setMode('play');
        const from = [st.px - st.dx * back + st.nx * lat, st.fs, st.pz - st.dz * back + st.nz * lat], yaw = Math.atan2(-st.dx, -st.dz);
        g.placeAt({ x: from[0], y: from[1], z: from[2], yaw });
        Object.assign(c, { jumpBuf: 0, coyote: 0, slideBuf: 0, slideCD: 0, catchCD: 0, hookPressed: false, crouchPressed: false, invuln: -1, edgeJump: false, edgeOff: null });
        for (let i = 0; i < 12; i++) g.advance(dt);
        key('KeyW', 'keydown');
        const trace = []; let grabV = null, rideId = null, jumped = false, hold = 0, rode = 0, blocked = 0, releasedAt = null, landed = null, t = 0, pressedAt = null, maxAngle = 0, minY = 99, cueSeen = false, wasRiding = false, firstCue = null, maxSpeed = 0, gripMin = 1;
        const rides0 = g.stats.ropeSwings || 0;
        for (let i = 0; i < 120 * seconds; i++) {
          g.advance(dt); t += dt; if (!api.active()) c.yaw = yaw;
          const along = (c.pos.x - from[0]) * st.dx + (c.pos.z - from[2]) * st.dz;
          if (!jumped && along >= jumpAlong && c.onGround) { key('Space', 'keydown'); hold = 4; jumped = true; }
          else if (hold > 0 && --hold === 0) key('Space', 'keyup');
          if (api.active()) {
            wasRiding = true; rode += dt; const cur = api.current(); if (rideId === null) { rideId = cur.id; grabV = +((c.pos.x - st.px) * st.nx + (c.pos.z - st.pz) * st.nz).toFixed(2); } maxAngle = Math.max(maxAngle, Math.abs(cur.th)); minY = Math.min(minY, c.pos.y); maxSpeed = Math.max(maxSpeed, Math.abs(cur.w) * RS.L); gripMin = Math.min(gripMin, api.grip());
            if (rode > .25 && !s.oe(c.pos.x, c.pos.y + .012, c.pos.z, c.r, c.h)) { blocked++; if (debug) trace.push(["blk", +(rode).toFixed(2), +c.pos.x.toFixed(2), +c.pos.y.toFixed(2), +c.pos.z.toFixed(2)]); }
            const cue = api.landing(st, cur.th, cur.w, s.U.gravity); if (debug && i % 15 === 0) trace.push([+rode.toFixed(2), +(cur.th * 57.3).toFixed(0), +(cur.w * RS.L).toFixed(1), +c.pos.y.toFixed(1), cue.why, cue.u === undefined ? null : +cue.u.toFixed(1), s.oe(c.pos.x, c.pos.y + .012, c.pos.z, c.r, c.h) ? 0 : 1]);
            if (cue.ok) { cueSeen = true; if (firstCue === null) firstCue = +rode.toFixed(2); }
            const press = mode === 'cue' ? cue.ok && rode > .3 : false;
            if (press && pressedAt === null) { pressedAt = +rode.toFixed(2); key('Space', 'keydown'); hold = 4; }
          } else if (wasRiding && releasedAt === null) { releasedAt = t; }
          if (debug && releasedAt !== null && landed === null && i % 6 === 0) { const rx = c.pos.x - st.px, rz = c.pos.z - st.pz; trace.push(['air', +(t - releasedAt).toFixed(2), 'u', +(rx * st.dx + rz * st.dz).toFixed(2), 'y', +c.pos.y.toFixed(2), 'vu', +(c.vel.x * st.dx + c.vel.z * st.dz).toFixed(2), 'vy', +c.vel.y.toFixed(2), 'blk', s.oe(c.pos.x, c.pos.y + .012, c.pos.z, c.r, c.h) ? 0 : 1]); }
          if (releasedAt !== null && landed === null && c.onGround) {
            const rx = c.pos.x - st.px, rz = c.pos.z - st.pz;
            landed = { t: +t.toFixed(2), x: +c.pos.x.toFixed(2), y: +c.pos.y.toFixed(2), z: +c.pos.z.toFixed(2), u: +(rx * st.dx + rz * st.dz).toFixed(2), v: +(rx * st.nx + rz * st.nz).toFixed(2) };
            break;
          }
        }
        key('KeyW', 'keyup'); key('Space', 'keyup');
        return { grabV, startV: +((from[0] - st.px) * st.nx + (from[2] - st.pz) * st.nz).toFixed(2), rideId, rides: (g.stats.ropeSwings || 0) - rides0, rode: +rode.toFixed(2), firstCue, pressedAt, maxAngle: +(maxAngle * 57.3).toFixed(0), maxSpeed: +maxSpeed.toFixed(1), minY: +minY.toFixed(2), blocked, cueSeen, gripMin: +gripMin.toFixed(2), landed, trace };
      };
      const onTarget = (st, r) => !!r.landed && Math.abs(r.landed.y - st.land.f) < .06 && r.landed.u > st.land.edge && r.landed.u < st.land.end + .6 && Math.abs(r.landed.v) < 2;
      for (const st of RS.STATIONS) {
        if (only && st.id !== only) continue; if (st.id < lo || st.id > hi) continue;
        const tries = [];
        for (const ja of [2.4, 2.8, 3.2, 3.6]) { const r = run(st, 3.8, ja, 'cue', 14); tries.push({ ja, ...r, ok: r.rides === 1 && r.blocked === 0 && onTarget(st, r) }); }
        const wide = [[3.0, 1.2], [3.0, -1.2], [1.8, 0], [4.2, 0]].map(([ja, lat]) => { const r = run(st, 3.8, ja, 'cue', 14, lat); return r.rides === 1 && r.blocked === 0 && onTarget(st, r) ? 1 : 0; }).join('');
        const walk = run(st, 3.8, 99, 'cue', 3).rides === 0;
        // 手の高さの空中に、横へずらして入る（前向きの速さ 5 m/s）。ずれ 2.6 m ではつかまず、1.2 m ではつかむ。
        const probe = lat => { run(st, 3.8, 99, 'never', .1); api.cancel(); rope.cancel(); const n0 = g.stats.ropeSwings || 0;
          g.placeAt({ x: st.px + st.nx * lat - st.dx * 1.5, y: st.parkY, z: st.pz + st.nz * lat - st.dz * 1.5, yaw: Math.atan2(-st.dx, -st.dz) });
          c.onGround = false; c.vel.set(st.dx * 5, 1, st.dz * 5); c.state = 'normal'; c.coyote = 0;
          for (let i = 0; i < 36; i++) { g.advance(dt); if (api.active()) break; } const ride = (g.stats.ropeSwings || 0) - n0; api.cancel(); rope.cancel(); return ride; };
        const side = probe(2.6) === 0 && probe(-2.6) === 0 && probe(1.2) === 1;
        res[st.id] = { wide, walk, side, fs: st.fs, f: st.land.f, okCount: tries.filter(t => t.ok).length, rode: tries.map(t => t.rode), firstCue: tries.map(t => t.firstCue), landed: tries.map(t => t.landed && [t.landed.u, t.landed.y]), rides: tries.map(t => t.rides), blocked: tries.map(t => t.blocked), tries: tries.map(t => t.ok ? 1 : 0).join(''), trace: only ? tries[1].trace : undefined, ci: only ? { r: c.r, h: c.h } : undefined };
      }
      return res;
    }, [only, lo, hi]);
    for (const [id, r] of Object.entries(out)) {
      if (r.trace) console.log(JSON.stringify(r.ci), '\n' + r.trace.map(x => x.join(' ')).join('\n'));
      const ok = r.okCount >= 2 && r.walk && r.side; if (!ok) failed++;
      console.log(`${ok ? 'ok  ' : 'FAIL'} #${id} 床${r.fs}→${r.f}m 成功(跳ぶ位置4通り) ${r.tries} 広げた判定(横±1.2m・早め・遅め) ${r.wide} 歩いて通るだけで不つかみ=${r.walk} 横2.6mは不つかみ・1.2mはつかむ=${r.side} つかんだ回数${JSON.stringify(r.rides)} 乗っていた秒${JSON.stringify(r.rode)} 緑までの秒${JSON.stringify(r.firstCue)} 着地(u,y)${JSON.stringify(r.landed)} 体が重なった${JSON.stringify(r.blocked)}`);
    }
    if (errors.length) { failed++; console.log('FAIL ページのエラー', errors.slice(0, 3)); }
  } finally { await browser.close(); server.kill(); }
  if (failed) { console.error(`${failed} 件の確認に失敗`); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
