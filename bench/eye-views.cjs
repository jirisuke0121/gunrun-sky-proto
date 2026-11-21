// Eye-level review sheet for the old town: 8 fixed views taken a few metres behind the runner at the real start spots
// (start-spots.js) and two street spots, same camera for every run, so a look change can be compared before / after.
//   node bench/eye-views.cjs [query] [outPrefix]     e.g.  node bench/eye-views.cjs "&scenery=0" /tmp/before
// Writes <outPrefix>_0..7.png and a contact sheet <outPrefix>_sheet.png (needs python3 + Pillow for the sheet), and prints
// the draw calls / triangles of each view ("PER [[calls, triangles], ...]"). Software GL: look and counts only, not speed.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), {execFileSync} = require('node:child_process');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..'), query = process.argv[2] || '', out = process.argv[3] || 'eye';
const SPOTS = {'west-ledge': [-37, 4.63, 0], 'north-roof': [-13, 8, -13], 'south-balcony': [-4, 4, 17], 'east-high': [19, 9.3, -8], 'east-mid': [35, 7, 0], 'far-east': [52, 9.48, -14], 'street-west': [-42, 0, 8], 'center-street': [-4, 0, -6]};
const VIEWS = Object.values(SPOTS).map(([x, y, z]) => { // [camera xyz, look-at xyz, fov]: behind the runner, looking at the middle of the map
  const dx0 = 0 - x, dz0 = -4 - z, l = Math.hypot(dx0, dz0) || 1, dx = dx0 / l, dz = dz0 / l, r = v => Math.round(v * 10) / 10;
  return [r(x - dx * 4), r(y + 2.8), r(z - dz * 4), r(x + dx * 8), r(y + .8), r(z + dz * 8), 70];
});
const server = http.createServer(async (req, res) => { try { const name = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname); if (!name.startsWith(root + path.sep)) throw Error('path'); const type = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp'}[path.extname(name)] || 'application/octet-stream'; res.writeHead(200, {'content-type': type}); res.end(await fs.promises.readFile(name)); } catch { res.writeHead(404); res.end(); } });
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  try {
    const ctx = await browser.newContext({viewport: {width: 844, height: 390}, isMobile: true, hasTouch: true, locale: 'ja-JP'});
    await ctx.addInitScript(() => { try { localStorage.setItem('gunrun-render-quality-v1', 'high'); } catch {} }); // shadows on: the darkest case
    await ctx.route('https://**/*', r => r.fulfill({status: 200, contentType: 'application/json', body: '{"top":[],"total":0,"ok":true}'}));
    const p = await ctx.newPage(); p.setDefaultTimeout(180000); p.on('pageerror', e => console.log('PAGEERR', e.message));
    await p.goto(base + `index.html?camera=after&lang=ja&controlpick=0&hookGuide=0&dev=1${query}`);
    await p.waitForFunction(() => window.skyStartReadiness?.ready && document.body.dataset.skyHumanLoaded === 'true' && (window.skyLookInfo || window.skyLook === 'classic'));
    await p.locator('#bStart').tap(); await p.waitForTimeout(2500);
    await p.evaluate(() => { const g = window.__skyInternals, r = window.__game.debug.renderer, orig = r.render.bind(r); r.render = (s, c) => { const w = window.__v; if (w && c === g.Se) { c.position.set(w[0], w[1], w[2]); c.lookAt(w[3], w[4], w[5]); c.fov = w[6]; c.updateProjectionMatrix(); } orig(s, c); }; });
    await p.addStyleTag({content: 'body>*:not(canvas){visibility:hidden!important}canvas{visibility:visible!important}'});
    const per = [];
    for (let i = 0; i < VIEWS.length; i++) {
      await p.evaluate(v => { window.__v = v; }, VIEWS[i]); await p.waitForTimeout(900);
      await p.screenshot({path: `${out}_${i}.png`});
      per.push(await p.evaluate(() => { const R = window.__game.debug.renderer, S = window.__skyInternals; let c = 0, t = 0; for (let k = 0; k < 4; k++) { R.info.reset(); R.render(S.ue, S.Se); c += R.info.render.calls; t += R.info.render.triangles; } return [c / 4, Math.round(t / 4)]; }));
    }
    console.log('PER', JSON.stringify(per));
    try { execFileSync('python3', ['-c', `from PIL import Image\nims=[Image.open('${out}_%d.png'%i) for i in range(${VIEWS.length})]\nw,h=ims[0].size\ns=Image.new('RGB',(w*2,h*((len(ims)+1)//2)))\n[s.paste(im,((i%2)*w,(i//2)*h)) for i,im in enumerate(ims)]\ns.save('${out}_sheet.png')`]); } catch { console.log('(no contact sheet: Pillow missing)'); }
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exit(1); });
