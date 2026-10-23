import { chromium } from 'playwright';
import fs from 'fs';
const [page = 'index.html', runs = '20', seed = '1000', tag = 'run', zMul = '1'] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 320, height: 180 } });
p.on('pageerror', e => console.log('ERR', e.message));
await p.goto('http://localhost:8765/' + page); await p.waitForTimeout(6000);
await p.addScriptTag({ content: fs.readFileSync(new URL('./extra.js', import.meta.url), 'utf8') });
await p.addScriptTag({ content: fs.readFileSync(new URL('./sim.js', import.meta.url), 'utf8') });
const t0 = Date.now();
const r = await p.evaluate(([runs, seed, zMul]) => window.__sim({ runs: +runs, seed: +seed, zMul: +zMul }), [runs, seed, zMul]);
fs.writeFileSync(`sim_${tag}.json`, JSON.stringify(r));
for (const k in r) { const o = r[k]; console.log(k.padEnd(8), 'mean', o.mean, 'median', o.median, 'escaped', o.escaped + '/' + runs, 'lostShare', o.lostShare, 'falls', o.falls, 'tricks', o.tricks); }
console.log('secs', ((Date.now() - t0) / 1000).toFixed(0));
await b.close();
