// 実マップ・実コストで、経路探索 `so`（配列だけで動く待ち行列＋辺コストのメモ）が、
// 素朴な全探索（O(n²)）と同じ距離配列を返すことを確かめる。メモあり・なし、ドア切替、複数起点、初期コスト付きを含む。
const assert = require('node:assert/strict'), fs = require('node:fs'), { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const { revealHomeControl } = require('./home-controls.cjs');
const port = process.env.PATH_MEMO_PORT || '8872';

(async () => {
  const server = spawn('python3', ['-m', 'http.server', port, '--bind', '127.0.0.1'], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { if (await fetch(`http://127.0.0.1:${port}/`).then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    for (const map of ['index.html', 'canyon.html']) {
      const context = await browser.newContext({ viewport: { width: 844, height: 390 } });
      await context.addInitScript(() => { window.__hold = true; });
      await context.route('**/*', route => {
        const url = route.request().url();
        if (!url.startsWith(`http://127.0.0.1:${port}/`)) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0,"ok":true}' });
        if (url.split('?')[0].endsWith('/' + map)) {
          const hook = 'window.__skyInternals={benchSo:()=>({oo,Pd,so,lt,Vi,doors:typeof pathDoorRefs!=="undefined"?pathDoorRefs:flankDoorRefs}),';
          const html = fs.readFileSync(map, 'utf8');
          assert.ok(html.includes('window.__skyInternals={'), `${map}: internals hook point exists`);
          return route.fulfill({ status: 200, contentType: 'text/html', body: html.replace('window.__skyInternals={', hook) });
        }
        return route.continue();
      });
      const page = await context.newPage(); page.setDefaultTimeout(240000);
      await page.goto(`http://127.0.0.1:${port}/${map}`);
      await page.waitForFunction(() => window.__game && window.__skyInternals?.benchSo);
      const level = page.locator('[data-difficulty=normal]'); await revealHomeControl(page, level); await level.click(); await page.locator('#bStart').click();
      await page.waitForTimeout(400);
      const result = await page.evaluate(() => {
        const { oo, Pd, so, lt, Vi, doors } = __skyInternals.benchSo();
        function reference(seeds, cost, limit, weights) {
          const field = new Float32Array(Vi).fill(Infinity), done = new Uint8Array(Vi);
          for (const seed of seeds) if (seed >= 0) field[seed] = Math.fround(weights?.[seed] || 0);
          for (;;) {
            let node = -1, distance = Infinity;
            for (let i = 0; i < Vi; i++) if (!done[i] && field[i] < distance) { node = i; distance = field[i]; }
            if (node < 0 || distance > limit) break;
            done[node] = 1;
            for (const id of lt.inn[node]) { const edge = lt.E[id], next = Math.fround(distance + cost(edge)); if (next < field[edge.from]) field[edge.from] = next; }
          }
          return field;
        }
        let seed = 20261108; const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
        const memoOo = new Float64Array(lt.E.length).fill(NaN), memoPd = new Float64Array(lt.E.length).fill(NaN);
        const plain = new Float32Array(Vi), memoed = new Float32Array(Vi);
        let compared = 0, diffs = 0, searches = 0, finite = 0;
        const check = (expected, actual) => { for (let i = 0; i < Vi; i++) { compared++; if (!Object.is(expected[i], actual[i])) diffs++; if (expected[i] < Infinity) finite++; } };
        for (const [name, change] of [['initial', () => {}], ['doors toggled', () => { for (const door of doors) door.off = !door.off; memoOo.fill(NaN); memoPd.fill(NaN); }]]) {
          change();
          for (let k = 0; k < 8; k++) {
            const targets = [Math.floor(rnd() * Vi)]; if (k % 3 === 2) targets.push(Math.floor(rnd() * Vi));
            const weights = k % 4 === 3 ? { [targets[0]]: 3.5 } : null;
            for (const [cost, memo] of [[oo, memoOo], [Pd, memoPd]]) {
              const expected = reference(targets, cost, 400, weights);
              so(targets, cost, 400, plain, weights); check(expected, plain);          // メモなし
              so(targets, cost, 400, memoed, weights, memo); check(expected, memoed);  // メモあり（2回目以降は表を再利用）
              so(targets, cost, 400, memoed, weights, memo); check(expected, memoed);  // 同じ表で再実行しても同じ
              searches += 3;
            }
          }
        }
        let cached = 0; for (let i = 0; i < memoOo.length; i++) if (memoOo[i] === memoOo[i]) cached++;
        return { nodes: Vi, edges: lt.E.length, searches, compared, diffs, finiteShare: +(finite / compared).toFixed(2), cachedEdges: cached };
      });
      assert.equal(result.diffs, 0, `${map}: 新しい探索は素朴な全探索と同じ距離配列（差 ${result.diffs}／${result.compared}）`);
      assert.ok(result.finiteShare > .5 && result.cachedEdges > 0, `${map}: 到達できる範囲が広く、メモが使われている`);
      console.log(`${map}: ${result.searches} searches, ${result.compared} distances identical (nodes ${result.nodes}, edges ${result.edges}, cached ${result.cachedEdges})`);
      await context.close();
    }
  } finally { await browser.close(); server.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
