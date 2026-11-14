// Q / right click = blast or pad mark, else the hook; E = slide (context-click.js).
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const base = 'http://127.0.0.1:8813/';
(async () => {
  const server = spawn('python3', ['-m', 'http.server', '8813', '--bind', '127.0.0.1'], { stdio: 'ignore' });
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
      // Record the keys the Q router sends. The game loop rewrites the marks every frame, so the marks are set and Q pressed in one synchronous step.
      await page.evaluate(() => {
        window.__keys = [];
        for (const t of ['keydown', 'keyup']) document.addEventListener(t, e => { if (e.isTrusted === false && e.code !== 'KeyQ') window.__keys.push(t + ':' + e.code); }, true);
        const s = __skyInternals;
        for (const z of s.Jt) z.pos.set(500, -500, 500);
        const mk = (id, on) => { let el = document.getElementById(id); if (!el) { el = document.createElement('div'); el.id = id; document.body.appendChild(el); } el.style.opacity = on ? '1' : '0'; };
        window.__setup = o => { mk('blastMark', o.blast); mk('padMark', o.pad); window.__keys.length = 0; };
      });
      // The test page holds the game loop (__hold): nothing moves by itself, so the player's speed is faked and only requestAnimationFrame (the router) runs.
      const go = async (o, how, run) => {
        return page.evaluate(async ({ o, how, run }) => {
          const s = __skyInternals, c = s.c, sleep = ms => new Promise(r => setTimeout(r, ms));
          for (const k of ['x', 'z']) Object.defineProperty(c.vel, k, { configurable: true, get: () => (run && k === 'x' ? 5 : 0), set() {} });
          c.state = 'normal'; c.onGround = true; c.hookPressed = false;
          await sleep(o.wait || 0);
          __setup(o);
          const press = type => how === 'right' ? (type === 'keydown' ? window.skyContextAction() : window.skyContextAction.release()) : document.dispatchEvent(new KeyboardEvent(type, { code: 'KeyQ', bubbles: true, cancelable: true }));
          press('keydown');
          await sleep(300);
          const mid = window.__keys.slice();
          press('keyup'); await sleep(100);
          return { mid, keys: window.__keys.slice() };
        }, { o, how, run });
      };
      let r;
      const has = (r, k) => r.keys.includes(k);
      // Right click and the Q key must behave identically: blast / pad mark -> B tap, otherwise nothing from the router (the hook has its own handler). Never a slide.
      for (const how of ['right', 'key']) {
        const tag = map + ' [' + how + ']';
        r = await go({ blast: true }, how, true); assert.ok(has(r, 'keydown:KeyB') && has(r, 'keyup:KeyB'), tag + ': blast mark -> B tap'); assert.ok(!has(r, 'keydown:KeyC'), tag + ': no slide on a blast');
        r = await go({ pad: true }, how, true); assert.ok(has(r, 'keydown:KeyB'), tag + ': jump-pad mark -> B');
        r = await go({ wait: 400 }, how, true); assert.ok(!has(r, 'keydown:KeyC') && !has(r, 'keydown:KeyB'), tag + ': running, nothing to hook -> no slide (slide is the E key now)');
      }
      // E = slide, held while E is held; key repeat sends nothing more; the C key is still sent as the one the game knows.
      r = await page.evaluate(async () => {
        const sleep = ms => new Promise(r => setTimeout(r, ms)), key = (type, repeat = false) => window.dispatchEvent(new KeyboardEvent(type, { code: 'KeyE', repeat, bubbles: true, cancelable: true }));
        window.__keys.length = 0; key('keydown'); key('keydown', true); key('keydown', true); await sleep(120);
        const mid = window.__keys.slice(); key('keyup'); await sleep(60);
        const gunBefore = __skyInternals.Et.held; return { mid, keys: window.__keys.slice(), gunBefore };
      });
      assert.deepEqual(r.mid, ['keydown:KeyC'], map + ': E -> one C key down, held (repeat adds nothing)'); assert.deepEqual(r.keys, ['keydown:KeyC', 'keyup:KeyC'], map + ': releasing E releases the slide'); assert.ok(!r.gunBefore, map + ': E no longer fires the gun');
      // The real mouse path: right button reaches the same function; left button never does.
      await page.evaluate(() => { window.__calls = 0; const o = window.skyContextAction; const w = (...a) => { window.__calls++; return o(...a); }; w.release = o.release; window.skyContextAction = w; });
      await page.mouse.move(640, 360); await page.mouse.down({ button: 'left' }); await page.mouse.up({ button: 'left' });
      assert.equal(await page.evaluate(() => window.__calls), 0, map + ': left click does not trigger the context action');
      await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' });
      assert.equal(await page.evaluate(() => window.__calls), 1, map + ': right click triggers the context action');
      assert.deepEqual(errors, []);
      console.log('PASS', map, 'Q and right click: blast/pad, else the hook (own handler), no slide (E slides); same behavior; left click untouched');
      await context.close();
    }
  } finally { await browser?.close(); server.kill(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
