import { chromium } from 'playwright';
import fs from 'fs';
const [page = 'index.html', tag = 'now'] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 320, height: 180 } });
p.on('pageerror', e => console.log('ERR', e.message));
await p.goto('http://localhost:8765/' + page); await p.waitForTimeout(6000);
await p.addScriptTag({ content: fs.readFileSync(new URL('./extra.js', import.meta.url), 'utf8') });
await p.addScriptTag({ content: fs.readFileSync(new URL('./exits.js', import.meta.url), 'utf8') });
const r = await p.evaluate(() => window.__exits());
fs.writeFileSync(`exits_${tag}.json`, JSON.stringify(r));
console.log(JSON.stringify(r.summary));
for (const d of r.deadEnds) console.log('dead-end', JSON.stringify(d));
const byArea = {}; for (const [x, y, z, d] of r.narrow) { const k = `${Math.round(x / 6) * 6},${y.toFixed(1)},${Math.round(z / 6) * 6}`; byArea[k] = Math.max(byArea[k] || 0, d) }
console.log('narrow far from exit (area: max m):', JSON.stringify(byArea));
await b.close();
