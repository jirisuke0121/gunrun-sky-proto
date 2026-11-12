// 跳び移り・飛び降りの辺の「体が通れるか」の使い回し（zombie-routing.js）が、作り直しと同じ答えを返すことを確かめる。
// 扉の開閉・建物への入室・箱の消失のあとも一致すること、扉1枚の開閉で再計算する辺が全体のごく一部で済むことを見る。
const assert = require('node:assert/strict'), { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const port = process.env.LEAP_CACHE_PORT || '8877', base = `http://127.0.0.1:${port}/`;
(async () => {
  const server = spawn('python3', ['-m', 'http.server', port, '--bind', '127.0.0.1'], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { if (await fetch(base).then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  try {
    for (const url of ['index.html', 'canyon.html']) {
      const page = await (await browser.newContext({ viewport: { width: 480, height: 270 } })).newPage();
      page.on('pageerror', e => errors.push(url + ': ' + e.message));
      await page.route('https://**/*', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"top":[],"total":0}' }));
      await page.goto(base + url);
      await page.waitForFunction(() => window.__game && window.skyZombieRouting && !document.getElementById('bStart').disabled, null, { timeout: 180000 });
      const out = await page.evaluate(() => {
        const g = __game, I = __skyInternals, R = window.skyZombieRouting, N = g.NAV;
        window.__hold = true; g.startGame(); g.P.invuln = 1e9;
        const step = n => { for (let i = 0; i < n; i++) g.advance(1 / 60); };
        step(30);
        const owned = N.E.filter(e => R.owns(e));
        // Cached answer (through edgeCost) against a fresh sweep, for every owned edge the room rules let through.
        let mark = R.stats.checked;
        const compare = label => {
          let mismatch = 0, finite = 0, blocked = 0;
          const cached = owned.map(e => R.edgeCost(e));
          const resweeps = R.stats.checked - mark; // since the previous state, including the game's own searches
          owned.forEach((e, i) => {
            if (window.skyIndoorAccess?.edgeAllowed && !window.skyIndoorAccess.edgeAllowed(e, N)) { blocked++; return; }
            const fresh = R.validateFresh(e);
            if (fresh !== Number.isFinite(cached[i])) mismatch++;
            if (fresh) finite++;
          });
          mark = R.stats.checked;
          return { label, mismatch, finite, blocked, resweeps };
        };
        const rows = [compare('start')];
        rows.push(compare('unchanged'));
        const doors = g.DOORS || [];
        doors.forEach((d, i) => { d.b.off = !d.b.off; step(20); rows.push(compare('door ' + i + (d.b.off ? ' open' : ' closed'))); });
        doors.forEach((d, i) => { d.b.off = !d.b.off; step(20); rows.push(compare('door ' + i + ' back')); });
        // Enter every building once (the rooms' own entry test), one at a time.
        const rooms = window.skyIndoorAccess?.snapshot?.() || [];
        rooms.forEach((room, i) => {
          const inset = (room.entryInset || 0) + .2;
          window.skyIndoorAccess.observe({ x: (room.minX + room.maxX) / 2, y: room.minY + .1, z: (room.minZ + room.maxZ) / 2 });
          step(20); rows.push(compare('room ' + i + ' entered'));
        });
        // A box that is not a door disappears (a breakable or a falling wall behaves like this).
        const solid = I.jn.find(b => !b.off && b.type !== 'door' && owned.some(e => { const a = N.nodes[e.from], c = N.nodes[e.to];
          return Math.min(a.x, c.x) < b.maxX && Math.max(a.x, c.x) > b.minX && Math.min(a.z, c.z) < b.maxZ && Math.max(a.z, c.z) > b.minZ; }));
        if (solid) { solid.off = true; step(20); rows.push(compare('a box under a jump removed')); solid.off = false; step(20); rows.push(compare('box restored')); }
        return { owned: owned.length, doors: doors.length, rooms: rooms.length, rows };
      });
      for (const row of out.rows) assert.equal(row.mismatch, 0, `${url} ${row.label}: cached validity differs from a fresh sweep (${JSON.stringify(row)})`);
      const unchanged = out.rows.find(r => r.label === 'unchanged');
      assert.equal(unchanged.resweeps, 0, url + ': nothing changed, nothing is swept again');
      const doorRows = out.rows.filter(r => r.label.startsWith('door '));
      const worstDoor = Math.max(0, ...doorRows.map(r => r.resweeps));
      if (out.doors) assert.ok(worstDoor < out.owned * .25, `${url}: one door re-sweeps ${worstDoor} of ${out.owned} edges`);
      console.log(`PASS ${url}: ${out.owned} leap/drop edges, ${out.rows.length} states, 0 mismatches; a door re-sweeps at most ${worstDoor} edges (was all ${out.owned}); ` +
        out.rows.map(r => `${r.label}=${r.resweeps}`).join(', '));
      await page.close();
    }
    assert.deepEqual(errors, [], 'no page errors');
  } finally { await browser.close(); server.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
