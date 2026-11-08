// 柱・足場への回り込み目標（navigationTargets）の作り直しで、体の掃引判定（clearLine）の結果を使い回しても、
// 使い回さない場合と同じノード一覧・コストになることを、実マップの足場の上、扉の開閉、屋内への入室後で確かめる。
const assert = require('node:assert/strict'), { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const { revealHomeControl } = require('./home-controls.cjs');
const port = process.env.CLIMB_MEMO_PORT || '8873';

(async () => {
  const server = spawn('python3', ['-m', 'http.server', port, '--bind', '127.0.0.1'], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { if (await fetch(`http://127.0.0.1:${port}/`).then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    for (const map of ['index.html', 'canyon.html']) {
      const context = await browser.newContext({ viewport: { width: 844, height: 390 } });
      await context.addInitScript(() => { window.__hold = true; });
      await context.route('https://**/*', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0,"ok":true}' }));
      const page = await context.newPage(); page.setDefaultTimeout(280000);
      await page.goto(`http://127.0.0.1:${port}/${map}`);
      await page.waitForFunction(() => window.__game && window.skyZombieClimb);
      const lv = page.locator('[data-difficulty=hard]'); await revealHomeControl(page, lv); await lv.click(); await page.locator('#bStart').click(); await page.waitForTimeout(800);
      const res = await page.evaluate(() => {
        const g = __game, c = g.P, climb = window.skyZombieClimb; g.GAME.over = false; g.setMode('play'); c.invuln = 1e9;
        for (const z of g.zombies) z.dead = true;
        const tops = g.solids.filter(b => ['slab', 'mono', 'beam'].includes(b.type) && b.maxY > b.minY && b.maxX - b.minX > .5 && b.maxZ - b.minZ > .5 && !b.off);
        const raw = location.pathname.endsWith('index.html') ? [[-49.2, 3.6, 4.6], [-49.1, 3.6, 5.7], [-48.9, 3.6, 5.5]] : [];
        for (const b of tops) raw.push([(b.minX + b.maxX) / 2, b.maxY, (b.minZ + b.maxZ) / 2], [b.minX + .25, b.maxY, b.minZ + .25], [b.maxX - .25, b.maxY, b.maxZ - .25], [(b.minX + b.maxX) / 2, b.maxY, b.minZ + .25]);
        const put = p => { g.placeAt({ x: p[0], y: p[1] + .003, z: p[2], yaw: 0 }); c.vel.set(0, 0, 0); c.onGround = true; c.pos.set(p[0], p[1], p[2]); };
        const nav = () => { const r = climb.navigationTargets(); return JSON.stringify(r ? { ids: [...r], costs: r.costs || null } : null); };
        const once = (memo, a, d) => { climb.setLineMemo(memo); put(d); nav(); put(a); return nav(); };
        climb.setLineMemo(false); const good = [], other = [];
        for (const p of raw) { if (good.length >= 30 && other.length >= 15) break; put([p[0] + 40, 80, p[2] + 40]); const b0 = climb.stats.targetBuilds; put(p); const r = nav(); if (climb.stats.targetBuilds > b0) (r !== 'null' ? good : other).push(p); }
        const spots = [...good.slice(0, 30), ...other.slice(0, 15)];
        const out = { candidates: raw.length, spots: spots.length, good: good.length, compared: 0, nonEmpty: 0, mismatches: [], builds: 0, hits: 0, misses: 0, doorCases: 0, roomCases: 0 };
        const compare = (a, d, label) => {
          const raw = once(false, a, d), b0 = climb.stats.targetBuilds, memo = once(true, a, d);
          out.builds += climb.stats.targetBuilds - b0; out.compared++; if (raw !== 'null') out.nonEmpty++;
          if (raw !== memo) out.mismatches.push({ label, spot: a, raw: raw.slice(0, 120), memo: memo.slice(0, 120) });
        };
        for (let i = 0; i < spots.length; i++) compare(spots[i], spots[(i + 11) % spots.length], 'spot');
        // 扉を開閉した場合：メモを作った後に箱の off を切り替えても、使い回さない結果と一致する。
        for (let i = 0; i < spots.length; i += 6) {
          const a = spots[i], d = spots[(i + 5) % spots.length];
          climb.setLineMemo(true); once(true, a, d);
          const near = g.near(a[0] - 5, a[2] - 5, a[0] + 5, a[2] + 5).filter(b => !b.off && b.type !== 'mono').slice(0, 3);
          if (!near.length) continue;
          for (const b of near) b.off = true;
          try { compare(a, d, 'door-off'); out.doorCases++; } finally { for (const b of near) b.off = false; }
          compare(a, d, 'door-restored');
        }
        // 屋内への入室：入室で allowsMove が変わっても一致する。
        const ia = g.INDOOR_ACCESS, rooms = ia ? ia.snapshot() : [];
        for (let r = 0; r < Math.min(2, rooms.length); r++) {
          const room = rooms[r], a = spots[(r * 17) % spots.length], d = spots[(r * 17 + 9) % spots.length];
          once(true, a, d); ia.observe({ x: (room.minX + room.maxX) / 2, y: room.minY + .1, z: (room.minZ + room.maxZ) / 2 });
          compare(a, d, 'room-entered'); out.roomCases++; ia.reset();
        }
        out.hits = climb.stats.lineHits; out.misses = climb.stats.lineMisses; climb.setLineMemo(true);
        return out;
      });
      console.log(map, JSON.stringify(res));
      assert.deepEqual(res.mismatches, [], `${map}: memoized results must equal plain results`);
      assert.ok(res.builds >= res.compared * .8, `${map}: most comparisons actually rebuild the targets (${res.builds}/${res.compared})`);
      assert.ok(res.spots >= 10, `${map}: enough rebuilding spots found (${res.spots})`);
      assert.ok(res.good >= 3 && res.nonEmpty >= 5, `${map}: enough cases produce real targets (${res.nonEmpty})`);
      assert.ok(res.hits > 0 && res.misses > 0, `${map}: memo is exercised (hits ${res.hits}, misses ${res.misses})`);
      assert.ok(res.doorCases >= 3 && (res.roomCases >= 1 || map === 'canyon.html'), `${map}: state-change cases ran`);
      await context.close();
    }
    console.log('climb line memo: ok');
  } finally { await browser.close(); server.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
