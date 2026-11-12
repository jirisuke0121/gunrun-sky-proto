// 超ベリーハード（試作）を実マップで30秒動かし、ハードと並べる。足場を走り回るボットで、人のプレイではない。
// ページエラーなし、ゾンビの種類が3つとも出る（重装は進化型の見た目）、を見る。経路探索の回数は参考に出すだけ（追跡のしかたはハードと同じ）。
const assert = require('node:assert/strict'), { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const port = process.env.TYPES_PORT || '8881', base = `http://127.0.0.1:${port}/`, SECONDS = +(process.env.SECONDS || 30);
(async () => {
  const server = spawn('python3', ['-m', 'http.server', port, '--bind', '127.0.0.1'], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { if (await fetch(base).then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  async function open(tier) {
    const page = await (await browser.newContext({ viewport: { width: 480, height: 270 } })).newPage();
    page.on('pageerror', e => errors.push(`${tier}: ${e.message}`));
    await page.route('https://**/*', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"top":[],"total":0}' }));
    await page.goto(base + 'index.html?perf=1');
    await page.waitForFunction(() => window.__game && window.skyZombieTypes && !document.getElementById('bStart').disabled, null, { timeout: 180000 });
    await page.evaluate(tier => { const s = document.getElementById('challengeDifficulty'); s.value = tier; s.dispatchEvent(new Event('change', { bubbles: true })); }, tier);
    if (tier === 'extreme') await page.waitForFunction(() => __skyInternals.zombieModels().some(m => m.kind === 'unity-evolved'), null, { timeout: 60000 });
    return page;
  }
  try {
    const runs = {};
    for (const tier of ['hard', 'extreme']) {
      let page;
      page = await open(tier);
      runs[tier] = await page.evaluate(async SECONDS => {
        const g = __game, c = g.P;
        let s = 7919; Math.random = () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
        let searches = 0; const add = window.skyPerfTrace.add; window.skyPerfTrace.add = function (n, ms) { if (n === 'so') searches++; return add.call(this, n, ms); };
        window.__hold = true; g.S.sendLog = false; g.startGame();
        const nodes = g.NAV.nodes; let target = null, stuck = 0, last = 1e9, frames = 0; const kinds = {}, seen = new WeakSet(); let evolved = 0;
        const pick = () => { for (let i = 0; i < 60; i++) { const n = nodes[Math.random() * nodes.length | 0]; if (Math.hypot(n.x - c.pos.x, n.z - c.pos.z) > 15 && n.y > -1) return n; } return nodes[0]; };
        while (g.GAME.t < SECONDS && g.mode === 'play' && !g.GAME.over) {
          c.invuln = 1e9; c.life = 9;
          if (!target || Math.hypot(target.x - c.pos.x, target.z - c.pos.z) < 1.2 || stuck > 2.5 || c.pos.y < -6) {
            if ((stuck > 2.5 || c.pos.y < -6) && target) { c.pos.set(target.x, target.y + .05, target.z); c.vel.set(0, 0, 0); }
            target = pick(); stuck = 0; last = 1e9;
          }
          const dx = target.x - c.pos.x, dz = target.z - c.pos.z, d = Math.hypot(dx, dz) || 1;
          c.yaw = Math.atan2(-dx, -dz); g.keys.KeyW = true;
          if (d > last - .02) stuck += 1 / 60; else stuck = Math.max(0, stuck - 1 / 60); last = d;
          if (Math.random() < .02) c.jumpBuf = .15;
          g.advance(1 / 60);
          for (const z of g.zombies) if (z.kind && !seen.has(z)) { seen.add(z); kinds[z.kind] = (kinds[z.kind] || 0) + 1; if (z.m?.src?.kind === 'unity-evolved') evolved++; }
          if (++frames % 240 === 0) await new Promise(r => setTimeout(r, 0));
        }
        return { t: g.GAME.t, searches, kinds, evolved, hp: [...new Set(g.zombies.filter(z => z.kind).map(z => z.kind + ':' + z.maxHp))] };
      }, SECONDS);
      await page.context().close();
    }
    // B. Runs
    const h = runs.hard, x = runs.extreme;
    assert.ok(h.t >= SECONDS - .1 && x.t >= SECONDS - .1, 'both runs lasted');
    assert.deepEqual(h.kinds, {}, 'Hard has no kinds');
    assert.ok(x.kinds.walker > 0 && x.kinds.runner > 0 && x.kinds.brute > 0 && x.evolved > 0, 'all three kinds appear ' + JSON.stringify(x.kinds));
    // Routing is Hard's own; the search count is printed for reference only (it varies run to run).
    assert.deepEqual(errors, [], 'no page errors');
    console.log(`PASS trial tier: ${SECONDS} s run without errors, kinds ${JSON.stringify(x.kinds)} (${x.hp.join(' ')}), searches ${(x.searches / x.t).toFixed(1)}/s vs Hard ${(h.searches / h.t).toFixed(1)}/s`);
  } finally { await browser.close(); server.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
