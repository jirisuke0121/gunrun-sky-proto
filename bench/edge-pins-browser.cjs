// Direction pins (edge-pins.js): off-screen pursuers get a pin, a nearly empty gun gets an ammo-crate pin, a dry gun gets a note + click.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const base = 'http://127.0.0.1:8812/';
(async () => {
  const server = spawn('python3', ['-m', 'http.server', '8812', '--bind', '127.0.0.1'], { stdio: 'ignore' });
  let browser;
  try {
    for (let i = 0; i < 60; i++) { if (await fetch(base).then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    for (const map of ['index.html', 'canyon.html']) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      await context.addInitScript(() => { window.__hold = true; });
      await context.route('https://**/*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"top":[],"total":0,"me":null}' }));
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(120000);
      await page.goto(base + map, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.skyStartReadiness?.ready);
      await page.locator('#bStart').click();
      await page.waitForFunction(() => __game.mode === 'play');
      await page.evaluate(() => { const s = __skyInternals; s.z.spawnT = Infinity; for (let i = 0; i < 20; i++) { s.c.invuln = Infinity; __game.frameOnce(1 / 60); } });
      await page.waitForTimeout(300);
      const visible = sel => page.evaluate(sel => [...document.querySelectorAll(sel)].filter(e => !e.hidden && e.offsetParent !== null).length, sel);
      // Full ammo, nobody behind: the ammo pin and the note stay hidden.
      await page.evaluate(() => { const s = __skyInternals; s.U.reserveAmmo = 24; s.Et.ammo = s.Et.mag; s.Et.reserve = 24; for (const z of s.Jt) { z.pos.set(500, -500, 500); } });
      await page.waitForTimeout(300);
      assert.equal(await visible('.edge-pin.ammo'), 0, map + ': no ammo pin with a full gun');
      assert.equal(await visible('#ammoEmptyNote'), 0, map + ': no note with a full gun');
      // A pursuer directly behind the camera: one red pin.
      await page.evaluate(() => {
        const s = __skyInternals, f = s.Se.getWorldDirection(new s.Geom.Vector3()), z = s.Jt[0];
        z.dead = false; z.remove = false; z.spawnT = 0; z.pos.set(s.c.pos.x - f.x * 8, s.c.pos.y, s.c.pos.z - f.z * 8);
      });
      await page.waitForTimeout(300);
      assert.equal(await visible('.edge-pin.pursuer'), 1, map + ': one pin for the pursuer behind');
      // Dry gun with an enemy near: note + click.
      const clicks = await page.evaluate(async () => {
        const s = __skyInternals; let n = 0; const orig = s.Tt.empty; s.Tt.empty = (...a) => { n++; return orig?.apply(s.Tt, a); };
        s.U.reserveAmmo = 24; s.Et.ammo = 0; s.Et.reserve = 0; s.Et.reloadT = 0; s.Et.autoReload = 0;
        await new Promise(r => setTimeout(r, 400)); s.Tt.empty = orig; return n;
      });
      assert.equal(await visible('#ammoEmptyNote'), 1, map + ': out-of-ammo note');
      assert.ok(clicks >= 1, map + ': empty click sound plays');
      // Infinite reserve never shows it.
      await page.evaluate(() => { const s = __skyInternals; s.U.reserveAmmo = 99; });
      await page.waitForTimeout(300);
      assert.equal(await visible('#ammoEmptyNote'), 0, map + ': no note with unlimited ammo');
      assert.deepEqual(errors, []);
      console.log('PASS', map, 'edge pins: pursuer pin, ammo gating, out-of-ammo note + click');
      await context.close();
    }
  } finally { await browser?.close(); server.kill(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
