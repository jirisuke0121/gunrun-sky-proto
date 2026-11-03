// 記録(JSON配列、または /runs の応答)を埋め込んだ単独のHTMLを作る。
// 実行: node tools/admin/build-standalone.cjs 記録.json 出力.html
const fs = require('node:fs'), path = require('node:path');
const [input, output] = process.argv.slice(2);
if (!input || !output) { console.error('使い方: node build-standalone.cjs 記録.json 出力.html'); process.exit(1); }
const esc = s => s.replace(/</g, '\\u003c');
let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const maps = fs.readFileSync(path.join(__dirname, 'maps.json'), 'utf8');
const data = fs.readFileSync(input, 'utf8');
JSON.parse(data);
html = html.replace('<script type="application/json" id="embedded-maps"></script>', () => `<script type="application/json" id="embedded-maps">${esc(maps)}</script>`)
  .replace('<script type="application/json" id="embedded-data"></script>', () => `<script type="application/json" id="embedded-data">${esc(data)}</script>`);
fs.writeFileSync(output, html);
console.log('wrote', output, (html.length / 1024).toFixed(0) + 'KB');
