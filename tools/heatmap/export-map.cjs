// ゲーム本体を画面なしのブラウザで開き、当たり判定の箱(game.jn)を heatmap-maps.json に書き出す。
// 実行: リポジトリ直下で `node tools/heatmap/export-map.cjs`（playwright が必要）
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const out = {};
  try {
    for (const [key, page_] of [['old-town', 'index.html'], ['rock-canyon', 'canyon.html']]) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.goto(`http://127.0.0.1:${port}/${page_}`);
      await page.waitForFunction(() => window.__skyInternals && Array.isArray(window.__skyInternals.jn) && window.__skyInternals.jn.length > 10, null, { timeout: 120000 });
      out[key] = await page.evaluate(() => window.__skyInternals.jn
        .filter(b => b.type !== 'door' && ['minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ'].every(k => Number.isFinite(b[k])) &&
          b.maxX > b.minX && b.maxZ > b.minZ && b.maxY > -30 && b.maxY < 100 && b.maxX - b.minX < 400 && b.maxZ - b.minZ < 400)
        .map(b => [b.minX, b.maxX, b.minY, b.maxY, b.minZ, b.maxZ].map(v => Math.round(v * 100) / 100)));
      await page.close();
    }
  } finally { await browser.close(); server.close(); }
  fs.writeFileSync(path.join(__dirname, 'heatmap-maps.json'), JSON.stringify(out));
  for (const k in out) console.log(k, out[k].length, 'boxes');
})().catch(e => { console.error(e); process.exitCode = 1; });
