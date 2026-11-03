// 自由フックを、囲まれた場所から実ゲームの物理で撃って、着地できるか・追手が追いつくまで何秒かを確かめる。
//   node tools/free-hook-verify.cjs [--n=120] [--out=docs/escape-graph/free-hook-verify.json]
const fs = require('node:fs'), path = require('node:path'), { spawn } = require('node:child_process');
const { exportGame, analyze } = require('./escape-graph.cjs');
const { revealHomeControl } = require('../bench/home-controls.cjs');
const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const root = path.resolve(__dirname, '..'), N = Number(arg('n', 120)), output = path.resolve(root, arg('out', 'docs/escape-graph/free-hook-verify.json'));
(async () => {
  const data = await exportGame(), a = analyze(data);
  const trapped = []; a.results.forEach((r, i) => { if (r.status === 'trapped' && r.threatNodes) trapped.push(i); });
  const stride = Math.max(1, Math.floor(trapped.length / N)), picks = trapped.filter((_, i) => i % stride === 0).slice(0, N);
  const cases = picks.map(i => ({ node: i, at: data.nodes[i], threats: a.results[i].threatNodes.map(v => data.nodes[v]) }));
  const { chromium } = require('playwright');
  const server = spawn('python3', ['-m', 'http.server', '8801', '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { if (await fetch('http://127.0.0.1:8801/').then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const context = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1280, height: 720 } });
    await context.addInitScript(() => { window.__hold = true; });
    await context.route('https://**/*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0,"ok":true}' }));
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(600000);
    await page.goto('http://127.0.0.1:8801/index.html?challengeDebug=1');
    await page.waitForFunction(() => window.__game && window.skySwing && window.skyFreeHook);
    const level = page.locator('[data-difficulty=normal]'); await revealHomeControl(page, level); await level.click(); await page.locator('#bStart').click();
    const results = await page.evaluate(cases => {
      const g = __game, s = __skyInternals, c = g.P, dt = 1 / 120, out = [], cam = s.Se, F = skyFreeHook;
      const setView = yaw => { cam.fov = 75; cam.updateProjectionMatrix(); cam.position.set(c.pos.x, c.pos.y + 1.6, c.pos.z); cam.rotation.set(-.15, yaw, 0, 'YXZ'); cam.updateMatrixWorld(true); c.yaw = yaw; };
      for (const item of cases) {
        for (const k of Object.keys(g.keys)) g.keys[k] = false;
        window.skySwing.reset(); window.skyLandingRoll?.reset?.(); window.skyDash?.reset?.(false);
        for (const z of s.Jt) { s.ue.remove(z.m.root); if (z.pool) s.ue.remove(z.pool); } s.Jt.length = 0;
        g.SCR.off = g.PACE.off = g.MARK.off = true; Object.assign(g.S, { sendLog: false, gunOn: false, autoFire: false, aimAuto: false, stalkerOn: false, stalker2: false, dropShare: 0 });
        g.GAME.over = false; g.GAME.t = 0; g.GAME.spawnT = g.GAME.surgeT = 1e9; g.GAME.safeT = 0; g.setMode('play'); F.reset(); F.step(1 / 60);
        g.placeAt({ x: item.at[0], y: item.at[1], z: item.at[2], yaw: 0 });
        Object.assign(c, { jumpBuf: 0, coyote: 0, catchCD: 0, hookPressed: false, life: skyChallenge.maxLives(3), invuln: 1e9, edgeJump: false, hookCD: 0 });
        for (let i = 0; i < 24; i++) g.advance(dt);
        c.node = g.nodeAt(c.pos.x, c.pos.y + .1, c.pos.z); g.updateField();
        for (const p of item.threats) { const z = new s.ri(...p); Object.assign(z, { spawnT: 0, rise: null, hp: 1e6, flank: false, dropper: false, stalker: false, onGround: true }); z.node = g.nodeAt(p[0], p[1] + .1, p[2]); s.Jt.push(z); }
        const row = { node: item.node, at: item.at };
        let target = null, yawUsed = null;
        for (let k = 0; k < 8 && !target; k++) { const yaw = k * Math.PI / 4; setView(yaw); F.step(1 / 60); if (F.best) { target = F.best; yawUsed = yaw; } }
        row.pressed = F.pressed();
        if (!target) {
          const cands = F.candidates(), eye = [c.pos.x, c.pos.y + 1.6, c.pos.z];
          row.candidates = cands.length; row.candidatesVisible = cands.filter(q => { const dx = q.x - eye[0], dy = q.y + .8 - eye[1], dz = q.z - eye[2], d = Math.hypot(dx, dy, dz); return !s.raycast(eye[0], eye[1], eye[2], dx / d, dy / d, dz / d, d - .6); }).length;
          row.result = !F.pressed() ? 'not-pressed' : !row.candidates ? 'no-candidate-in-range' : !row.candidatesVisible ? 'candidates-all-blocked' : 'not-in-view'; out.push(row); continue;
        }
        setView(yawUsed); row.target = [target.x, target.y, target.z]; row.dist = +target.d.toFixed(1);
        const fired = F.fire(target); if (!fired) { row.result = 'fire-failed'; out.push(row); continue; }
        let t = 0, hooked = false, landedAt = null, caughtAt = null; const startLife = c.life, tgt = row.target;
        for (; t < 14; t += dt) {
          g.advance(dt); F.step(dt);
          if (c.state === 'hook') hooked = true;
          if (hooked && landedAt === null && c.state === 'normal' && c.onGround) landedAt = t;
          if (landedAt !== null && caughtAt === null) { const d = Math.min(...s.Jt.map(z => Math.hypot(z.pos.x - c.pos.x, z.pos.y - c.pos.y, z.pos.z - c.pos.z))); if (d < 1.8) { caughtAt = t; break; } }
          if (g.GAME.over) break;
        }
        const end = c.pos.toArray(), dxz = Math.hypot(end[0] - tgt[0], end[2] - tgt[2]);
        row.hooked = hooked; row.end = end.map(v => +v.toFixed(2)); row.dxz = +dxz.toFixed(2); row.dy = +(end[1] - tgt[1]).toFixed(2); row.landedAt = landedAt && +landedAt.toFixed(2);
        row.caughtAt = caughtAt && +caughtAt.toFixed(2); row.extraSeconds = caughtAt && landedAt ? +(caughtAt - landedAt).toFixed(2) : null; row.chargesLeft = F.charges;
        row.result = hooked && landedAt !== null && dxz <= 5 && row.dy >= -.8 ? 'ok' : hooked ? 'missed' : 'not-hooked';
        out.push(row);
      }
      return out;
    }, cases);
    const count = {}; results.forEach(r => { count[r.result] = (count[r.result] || 0) + 1; });
    const ok = results.filter(r => r.result === 'ok'), extras = ok.map(r => r.extraSeconds).filter(v => v !== null).sort((x, y) => x - y);
    const summary = { sampled: results.length, count, okExtraSeconds: { n: extras.length, min: extras[0], median: extras[extras.length >> 1], max: extras.at(-1), notCaughtWithin14s: ok.length - extras.length } };
    fs.writeFileSync(output, JSON.stringify({ summary, results }, null, 1));
    console.log(JSON.stringify(summary), errors.slice(0, 2));
    for (const r of results.filter(r => r.result === 'missed' || r.result === 'not-hooked').slice(0, 5)) console.log(JSON.stringify(r));
  } finally { await browser.close(); server.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
