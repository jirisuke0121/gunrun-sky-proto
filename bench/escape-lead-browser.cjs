// 挟み撃ちの予測（challenge-difficulty.js の escapeLead）を軽くした版が、以前の実装と同じ値を返すことを実マップで確かめる。
// 以前の実装（毎回2回の全域探索・配列と待ち行列を作り直す）をここに残し、同じ入力で比べる。
const assert = require('node:assert/strict'), { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const port = process.env.ESCAPE_LEAD_PORT || '8878', base = `http://127.0.0.1:${port}/`;
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
      await page.waitForFunction(() => window.__game && window.skyChallenge && !document.getElementById('bStart').disabled, null, { timeout: 180000 });
      const out = await page.evaluate(() => {
        const g = __game, I = __skyInternals, C = window.skyChallenge;
        const selector = document.getElementById('challengeDifficulty'); selector.value = 'hard'; selector.dispatchEvent(new Event('change'));
        let seed = 11; const random = () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
        Math.random = random;
        window.__hold = true; g.startGame(); g.P.invuln = 1e9;
        // Capture the cost functions and hook table the game itself passes in.
        let options = null; const original = C.escapeLead;
        C.escapeLead = function (start, enemies, o) { options = o; return original.call(this, start, enemies, o); };
        for (let i = 0; i < 60 * 80 && !options; i++) {
          g.P.invuln = 1e9;
          // Stand somewhere new every second so a squeeze can find a front and a back position.
          if (g.GAME.t > 28 && i % 60 === 0) { const n = g.NAV.nodes[random() * g.NAV.nodes.length | 0]; g.P.pos.set(n.x, n.y + .02, n.z); g.P.vel.set(0, 0, 0); }
          if (g.GAME.t > 28) for (const z of g.zombies) if (!z.boss && g.zombies.filter(e => !e.dead).length > 4) { z.dead = true; z.deadT = 9; }
          g.advance(1 / 60);
        }
        C.escapeLead = original;
        if (!options) return { captured: false, t: g.GAME.t };
        // The previous implementation, kept verbatim as the reference.
        function reference(start, enemies, { nav, enemyCost, playerCost, hooks, margin, Queue }) {
          const count = nav.nodes.length, arrival = new Float64Array(count).fill(Infinity);
          let queue = new Queue();
          const threats = [...enemies, ...I.Jt.filter(e => !e.dead && e.node >= 0).map(e => [e.node, 0])];
          for (const [node, time] of threats) if (time < arrival[node]) { arrival[node] = time; queue.push(time, node); }
          while (queue.size) {
            const [time, node] = queue.pop();
            if (time > arrival[node]) continue;
            if (time > 20) break;
            for (const id of nav.out[node]) {
              const edge = nav.E[id], next = time + enemyCost(edge);
              if (next < arrival[edge.to]) { arrival[edge.to] = next; queue.push(next, edge.to); }
            }
          }
          const reached = new Float64Array(count * 2).fill(Infinity);
          queue = new Queue(); reached[start] = 0; queue.push(0, start);
          let lead = -1;
          const visit = (node, time, used) => {
            const state = node + (used ? count : 0);
            if (time < reached[state] && time < arrival[node] - margin) { reached[state] = time; queue.push(time, state); }
          };
          while (queue.size) {
            const [time, state] = queue.pop(), used = state >= count, node = state % count;
            if (time > reached[state]) continue;
            lead = Math.max(lead, Math.min(arrival[node], 30) - time);
            if (time > 8) continue;
            for (const id of nav.out[node]) { const edge = nav.E[id]; visit(edge.to, time + playerCost(edge), used); }
            if (!used && time >= I.c.hookCD) for (const hook of hooks[node] || []) visit(hook.to, time + hook.t + .8, true);
          }
          return lead;
        }
        const nodes = options.nav.nodes, pick = () => nodes[random() * nodes.length | 0].id;
        let mismatch = 0, worst = 0, positive = 0, oldMs = 0, newMs = 0;
        const cases = [];
        const round = (label, mutate) => {
          mutate?.();
          g.advance(1 / 60); // a new frame: cost tables are rebuilt
          for (let i = 0; i < 40; i++) {
            const start = pick(), enemies = i % 5 === 0 ? [[pick(), .5]] : [[pick(), .5], [pick(), .5]];
            // Six asks per frame share the start, as the game does; vary the start on the others.
            const a0 = performance.now(), before = reference(start, enemies, options); oldMs += performance.now() - a0;
            const b0 = performance.now(), after = C.escapeLead(start, enemies, options); newMs += performance.now() - b0;
            if (before !== after) { mismatch++; worst = Math.max(worst, Math.abs(before - after)); if (cases.length < 3) cases.push({ label, start, enemies, before, after }); }
            if (after > 0) positive++;
          }
        };
        round('as captured');
        round('no zombies', () => { for (const z of g.zombies) { z.dead = true; z.deadT = 9; } });
        round('hook on cooldown', () => { I.c.hookCD = 5; });
        round('hook ready', () => { I.c.hookCD = 0; });
        round('a room entered', () => { const room = window.skyIndoorAccess?.snapshot?.()[0]; if (room) window.skyIndoorAccess.observe({ x: (room.minX + room.maxX) / 2, y: room.minY + .1, z: (room.minZ + room.maxZ) / 2 }); });
        const alive = I.Jt.filter(e => !e.dead && e.node >= 0).length;
        return { captured: true, mismatch, worst, positive, total: 200, cases, oldMs: +oldMs.toFixed(1), newMs: +newMs.toFixed(1), alive };
      });
      assert.ok(out.captured, url + ': the game asked for a squeeze forecast ' + JSON.stringify(out));
      assert.equal(out.mismatch, 0, `${url}: forecasts differ ${JSON.stringify(out.cases)}`);
      assert.ok(out.positive > 10, url + ': the sample includes routes with a real lead (' + out.positive + ')');
      console.log(`PASS ${url}: ${out.total} forecasts identical to the previous implementation (${out.positive} with a positive lead); ` +
        `${out.oldMs} ms -> ${out.newMs} ms in this browser`);
      await page.close();
    }
    assert.deepEqual(errors, [], 'no page errors');
  } finally { await browser.close(); server.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
