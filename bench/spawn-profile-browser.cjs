// 実マップで、難易度ごとの出現場所の選び方を確かめる。
//  - 順位対象（hard）：従来どおり。「余裕が最も短い地点を選ぶ処理」は一度も呼ばれない。
//  - 超ベリーハード：挟み撃ちで選ばれた地点は、候補の中で余裕が最も短く、かつその難易度の下限(3.2秒)以上。
// 両マップ（旧市街・渓谷）で、プレイヤーを毎秒ちがう場所に立たせて挟み撃ちを起こす。
const assert = require('node:assert/strict'), { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const port = process.env.SPAWN_PROFILE_PORT || '8879', base = `http://127.0.0.1:${port}/`;
(async () => {
  const server = spawn('python3', ['-m', 'http.server', port, '--bind', '127.0.0.1'], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { if (await fetch(base).then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  try {
    for (const url of ['index.html', 'canyon.html']) for (const tier of ['hard', 'extreme']) {
      const page = await (await browser.newContext({ viewport: { width: 480, height: 270 } })).newPage();
      page.on('pageerror', e => errors.push(`${url} ${tier}: ${e.message}`));
      await page.route('https://**/*', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"top":[],"total":0}' }));
      await page.goto(base + url);
      await page.waitForFunction(() => window.__game && window.skyChallenge && window.skySpawnProfile && !document.getElementById('bStart').disabled, null, { timeout: 180000 });
      await page.evaluate(tier => { const s = document.getElementById('challengeDifficulty'); s.value = tier; s.dispatchEvent(new Event('change', { bubbles: true })); }, tier);
      if (tier === 'extreme') await page.waitForFunction(() => __skyInternals.zombieModels().some(m => m.kind === 'unity-evolved'), null, { timeout: 60000 });
      const out = await page.evaluate(tier => {
        const g = __game, SP = window.skySpawnProfile, C = window.skyChallenge;
        const selector = document.getElementById('challengeDifficulty'); selector.value = tier; selector.dispatchEvent(new Event('change', { bubbles: true }));
        let seed = 23; const random = () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
        Math.random = random;
        const picks = [], compared = []; const tightest = SP.tightest, better = SP.better;
        SP.tightest = pool => { const r = tightest(pool); picks.push({ chosen: r?.lead, min: Math.min(...pool.map(p => p.lead)), n: pool.length }); return r; };
        SP.better = (a, b, m) => { const r = better(a, b, m); compared.push({ a, b, m, r }); return r; };
        window.__hold = true; g.startGame(); g.P.invuln = 1e9;
        const minimum = C.profile().lead;
        for (let i = 0; i < 60 * 150 && picks.filter(p => p.n).length < 3; i++) {
          g.P.invuln = 1e9;
          if (g.GAME.t > 28 && i % 60 === 0) { const n = g.NAV.nodes[random() * g.NAV.nodes.length | 0]; g.P.pos.set(n.x, n.y + .02, n.z); g.P.vel.set(0, 0, 0); }
          if (g.GAME.t > 28) for (const z of g.zombies) if (!z.boss && g.zombies.filter(e => !e.dead).length > 4) { z.dead = true; z.deadT = 9; }
          g.advance(1 / 60);
        }
        return { t: g.GAME.t, minimum, picks, compared, forProfile: C.profile() && !!SP.forProfile(C.profile()) };
      }, tier);
      if (tier === 'hard') {
        assert.equal(out.forProfile, false, `${url} hard は従来の選び方`);
        assert.equal(out.picks.length, 0, `${url} hard で「余裕が最も短い地点」の選択が呼ばれた`);
        assert.equal(out.compared.length, 0, `${url} hard で地点の比較が呼ばれた`);
      } else {
        assert.equal(out.forProfile, true, `${url} extreme は新しい選び方`);
        assert.equal(out.minimum, 3.2);
        const found = out.picks.filter(p => p.n);
        assert.ok(found.length >= 1, `${url} 挟み撃ちの候補が一度も見つからなかった (t=${out.t.toFixed(0)}, 試行 ${out.picks.length})`);
        for (const p of found) {
          assert.ok(p.chosen >= out.minimum, `${url} 下限未満の余裕 ${p.chosen}`);
          assert.equal(p.chosen, p.min, `${url} 最も短い余裕を選んでいない`);
        }
        for (const c of out.compared) if (c.r) assert.ok(c.b >= c.m && (!(c.a >= c.m) || c.b < c.a), `${url} 比較の規則違反`);
      }
      console.log(`${url} ${tier}: squeezes ${out.picks.length}, picks ${JSON.stringify(out.picks.map(p => [p.chosen, p.min, p.n]))}, ambush compares ${out.compared.length}`);
      await page.context().close();
    }
    assert.deepEqual(errors, []);
    console.log('spawn-profile-browser: ok');
  } finally { await browser.close(); server.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
