// フックの引き寄せの弧（hook-arc.js）を、実マップ・実エンジンで直線と比べる。
//   node bench/hook-arc-browser.cjs        （環境変数 MAP=index|canyon、PORT）
// 各フックの手前の足場（6方向まで）から引いて、弧あり／弧なしで「到着」「着地」「重なり」「横の膨らみ」を比べる。
const path = require('node:path'), { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..'), PORT = Number(process.env.PORT || 8812), MAPS = (process.env.MAP || 'index,canyon').split(',');
(async () => {
  const { chromium } = require('playwright');
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { if (await fetch(`http://127.0.0.1:${PORT}/`).then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  let failed = 0;
  try {
    for (const map of MAPS) {
      const context = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1280, height: 720 } });
      await context.addInitScript(() => { window.__hold = true; });
      await context.route('https://**/*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0,"ok":true}' }));
      const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(600000);
      await page.goto(`http://127.0.0.1:${PORT}/${map}.html`);
      await page.waitForFunction(() => window.skyStartReadiness?.ready && window.skyHookLanding && window.skyHookArc);
      await page.locator('#bStart').click();
      const res = await page.evaluate(() => {
        const g = __game, s = __skyInternals, c = g.P, dt = 1 / 120, arc = window.skyHookArc, fixtures = [], rows = [];
        g.S.sendLog = false; g.GAME.spawnT = g.GAME.surgeT = 1e9; g.SCR.off = g.PACE.off = g.MARK.off = true;
        for (const z of [...g.zombies]) { s.ue.remove(z.m.root); if (z.pool) s.ue.remove(z.pool); } g.zombies.length = 0;
        const off = () => { for (const k of Object.keys(g.keys)) g.keys[k] = false; Object.assign(s.inputState, { on: false, x: 0, y: 0 }); };
        for (const [id, a] of s.us.entries()) {
          const cand = g.NAV.nodes.filter(n => { const dx = a[0] - n.x, dy = a[1] - (n.y + 1.62), dz = a[2] - n.z, d = Math.hypot(dx, dy, dz); return d > 5 && d < g.S.hookRange && n.y < a[1] + .2 && !s.raycast(n.x, n.y + 1.62, n.z, dx / d, dy / d, dz / d, d - .6) && g.freeAt(n.x, n.y + .02, n.z, .32, 1.75); });
          cand.sort((n, m) => Math.abs(Math.hypot(a[0] - n.x, a[2] - n.z) - 12) - Math.abs(Math.hypot(a[0] - m.x, a[2] - m.z) - 12));
          const chosen = [];
          for (const n of cand) { const ang = Math.atan2(n.z - a[2], n.x - a[0]); if (chosen.every(x => Math.abs(Math.atan2(Math.sin(x - ang), Math.cos(x - ang))) > .65)) { chosen.push(ang); fixtures.push({ id, a, from: [n.x, n.y, n.z] }); if (chosen.length >= 6) break; } }
        }
        function setup(f) {
          off(); skyHookLanding.cancel(); skySwing.reset(); g.GAME.over = false; g.GAME.t = 0; g.setMode('play');
          g.placeAt({ x: f.from[0], y: f.from[1] + .0001, z: f.from[2], yaw: Math.atan2(f.from[0] - f.a[0], f.from[2] - f.a[2]) }); skyFollowCamera.reset();
          Object.assign(c, { state: 'hook', hook: s.us[f.id], hookT: 0, onGround: false, jumpBuf: 0, hookPressed: false, crouchPressed: false, coyote: 0, edgeJump: false, hookCD: 0, life: 3, invuln: 1e9, setCD: 0 }); c.vel.set(0, 0, 0);
        }
        for (const f of fixtures) for (const on of [false, true]) {
          arc.enabled = on; setup(f);
          const p0 = [c.pos.x, c.pos.y, c.pos.z], tgt = [f.a[0], f.a[1] + .6, f.a[2]];
          const L = [tgt[0] - p0[0], tgt[1] - p0[1], tgt[2] - p0[2]], Ln = Math.hypot(...L);
          let release = null, land = null, maxDev = 0, maxDevH = 0, minY = 1e9, penetration = false, hookTicks = 0, speedMax = 0, target = null, handoff = null;
          for (let tick = 0; tick < 600; tick++) {
            g.advance(dt);
            if (c.state === 'hook') {
              hookTicks++; speedMax = Math.max(speedMax, c.vel.length());
              const d = [c.pos.x - p0[0], c.pos.y - p0[1], c.pos.z - p0[2]], t = (d[0] * L[0] + d[1] * L[1] + d[2] * L[2]) / (Ln * Ln);
              const q = [d[0] - L[0] * t, d[1] - L[1] * t, d[2] - L[2] * t]; maxDev = Math.max(maxDev, Math.hypot(...q));
              const lh = Math.hypot(L[0], L[2]) || 1, lat = Math.abs(-L[2] / lh * d[0] + L[0] / lh * d[2]); maxDevH = Math.max(maxDevH, lat);
              minY = Math.min(minY, c.pos.y);
            }
            if (!release && c.state !== 'hook') release = { tick, p: c.pos.toArray(), r: Math.hypot(tgt[0] - c.pos.x, tgt[1] - c.pos.y, tgt[2] - c.pos.z) };
            if (skyHookLanding.active) target = skyHookLanding.active.floor.maxY;
            if (target !== null && !g.freeAt(c.pos.x, c.pos.y + .02, c.pos.z, c.r, c.h - .03)) penetration = true;
            if (target !== null && ['swing', 'zip', 'ladder', 'ledge'].includes(c.state)) { handoff = c.state; break; }
            if (release && c.onGround) { land = c.pos.toArray(); break; }
            if (c.pos.y < -21 || g.GAME.over) break;
          }
          rows.push({ id: f.id, from: f.from, on, planned: on ? !!(arc.last() && !arc.last().none) : false, side: on && arc.last() ? arc.last().side : 0, hookTicks, arrived: !!release && release.r < 1.8, releaseR: release ? +release.r.toFixed(2) : null, target, land, handoff, maxDev: +maxDev.toFixed(2), maxDevH: +maxDevH.toFixed(2), minDy: +(minY - p0[1]).toFixed(2), penetration, life: c.life, speedMax: +speedMax.toFixed(2), Ln: +Ln.toFixed(1) });
        }
        arc.enabled = true; off();
        return rows;
      });
      const by = {}; for (const r of res) { const k = r.id + ':' + r.from.map(v => v.toFixed(1)).join(','); (by[k] = by[k] || {})[r.on ? 'on' : 'off'] = r; }
      const pairs = Object.values(by).filter(p => p.on && p.off);
      const stat = {
        fixtures: pairs.length, planned: pairs.filter(p => p.on.planned).length,
        arriveOff: pairs.filter(p => p.off.arrived).length, arriveOn: pairs.filter(p => p.on.arrived).length,
        landOff: pairs.filter(p => p.off.land || p.off.handoff).length, landOn: pairs.filter(p => p.on.land || p.on.handoff).length,
        regress: pairs.filter(p => (p.off.arrived && !p.on.arrived) || ((p.off.land || p.off.handoff) && !(p.on.land || p.on.handoff))),
        penetrationOn: pairs.filter(p => p.on.penetration).length, penetrationOff: pairs.filter(p => p.off.penetration).length,
        lifeLost: pairs.filter(p => p.on.life < 3).length,
        speedDrop: pairs.filter(p => p.on.planned && p.on.speedMax < p.off.speedMax - .5).length,
        devOn: +(pairs.filter(p => p.on.planned).reduce((n, p) => n + p.on.maxDev, 0) / Math.max(1, pairs.filter(p => p.on.planned).length)).toFixed(2),
        devOff: +(pairs.reduce((n, p) => n + p.off.maxDev, 0) / Math.max(1, pairs.length)).toFixed(2),
        devMax: Math.max(...pairs.map(p => p.on.maxDev)),
        timeOn: +(pairs.reduce((n, p) => n + p.on.hookTicks, 0) / pairs.length / 120).toFixed(3), timeOff: +(pairs.reduce((n, p) => n + p.off.hookTicks, 0) / pairs.length / 120).toFixed(3),
      };
      const ok = stat.regress.length === 0 && stat.penetrationOn <= stat.penetrationOff && stat.lifeLost === 0 && stat.speedDrop === 0 && stat.planned > 0 && errors.length === 0;
      if (!ok) failed++;
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${map}`, JSON.stringify({ ...stat, regress: stat.regress.map(p => ({ id: p.on.id, from: p.on.from, off: p.off, on: p.on })).slice(0, 2), errors: errors.slice(0, 2) }));
      await context.close();
    }
  } finally { await browser.close(); server.kill(); }
  if (failed) { console.error(`${failed} 件の確認に失敗`); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
