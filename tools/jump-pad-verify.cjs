// ジャンプ台の候補を、実ゲームの物理で飛ばして着地を確かめる。
//   node tools/jump-pad-verify.cjs [--in=docs/escape-sites/sites.json] [--out=docs/escape-sites/verified.json]
// 台の位置に立って、本番と同じ軌道式の初速を与え、入力なしで着地まで進める。
// 合格: 着地先から水平1.5m以内・高さ0.4m以内で、地面に立って止まる。
const fs = require('node:fs'), path = require('node:path'), { spawn } = require('node:child_process');
const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const root = path.resolve(__dirname, '..');
const input = path.resolve(root, arg('in', 'docs/escape-sites/sites.json')), output = path.resolve(root, arg('out', 'docs/escape-sites/verified.json'));
(async () => {
  const src = JSON.parse(fs.readFileSync(input, 'utf8'));
  const list = (src.allCandidates || src.jumpPads).map(c => ({ at: c.pad || c.at, land: c.land, zombieExtraSeconds: c.zombieExtraSeconds }));
  const { chromium } = require('playwright');
  const server = spawn('python3', ['-m', 'http.server', '8797', '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { if (await fetch('http://127.0.0.1:8797/').then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const context = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1280, height: 720 } });
    await context.addInitScript(() => { window.__hold = true; });
    await context.route('https://**/*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0,"ok":true}' }));
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(240000);
    await page.goto('http://127.0.0.1:8797/index.html?challengeDebug=1');
    await page.waitForFunction(() => window.__game && window.skySwing && window.skyJumpPads);
    await page.locator('[data-difficulty=normal]').click({ trial: false }).catch(() => {});
    const { revealHomeControl } = require('../bench/home-controls.cjs');
    const level = page.locator('[data-difficulty=normal]'); await revealHomeControl(page, level); await level.click(); await page.locator('#bStart').click();
    const results = await page.evaluate(list => {
      const g = __game, s = __skyInternals, c = g.P, dt = 1 / 120, out = [];
      for (const item of list) {
        for (const k of Object.keys(g.keys)) g.keys[k] = false;
        for (const z of s.Jt) { s.ue.remove(z.m.root); if (z.pool) s.ue.remove(z.pool); } s.Jt.length = 0;
        g.SCR.off = g.PACE.off = g.MARK.off = true;
        g.GAME.over = false; g.GAME.t = 0; g.GAME.spawnT = g.GAME.surgeT = 1e9; g.GAME.safeT = 0; g.setMode('play');
        g.placeAt({ x: item.at[0], y: item.at[1], z: item.at[2], yaw: 0 });
        Object.assign(c, { jumpBuf: 0, coyote: 0, life: skyChallenge.maxLives(3), invuln: -1, edgeJump: false });
        for (let i = 0; i < 24; i++) g.advance(dt);
        const start = c.pos.toArray(), assist = !!window.skyJumpPads.assistTarget();
        window.skyJumpPads.launch({ at: item.at, land: item.land });
        let t = 0, airborne = false, hitSomething = false;
        for (; t < 4; t += dt) { g.advance(dt); if (!c.onGround) airborne = true; if (airborne && c.onGround && t > .3) break; }
        const end = c.pos.toArray(), dxz = Math.hypot(end[0] - item.land[0], end[2] - item.land[2]), dy = end[1] - item.land[1];
        out.push({ at: item.at, land: item.land, zombieExtraSeconds: item.zombieExtraSeconds, start, assistAtStart: assist, end: end.map(v => +v.toFixed(2)), dxz: +dxz.toFixed(2), dy: +dy.toFixed(2),
          flight: +t.toFixed(2), onGround: c.onGround, lifeKept: c.life === skyChallenge.maxLives(3), pass: c.onGround && dxz <= 1.5 && Math.abs(dy) <= .4 });
      }
      return out;
    }, list);
    fs.writeFileSync(output, JSON.stringify({ tested: results.length, passed: results.filter(r => r.pass).length, results }, null, 1));
    console.log('tested', results.length, 'passed', results.filter(r => r.pass).length, errors.slice(0, 2));
    for (const r of results.filter(r => r.pass).slice(0, 12)) console.log(JSON.stringify({ at: r.at, land: r.land, end: r.end, zombie: r.zombieExtraSeconds, assist: r.assistAtStart }));
    if (!results.some(r => r.pass)) for (const r of results.slice(0, 5)) console.log('FAIL', JSON.stringify({ at: r.at, land: r.land, end: r.end, dxz: r.dxz, dy: r.dy, flight: r.flight, onGround: r.onGround }));
  } finally { await browser.close(); server.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
