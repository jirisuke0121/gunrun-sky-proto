const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const out = process.env.AUDIT_OUT || 'browser-evidence/pursuit-audit';
const isPublic = process.env.AUDIT_PUBLIC === '1';
const difficulty = process.env.AUDIT_DIFFICULTY || 'hard';
const base = isPublic ? 'https://jirisuke0121.github.io/gunrun-sky-proto/' : 'https://audit.test/';
const scenario = fs.readFileSync('bench/pursuit-audit-scenario.js', 'utf8');
fs.mkdirSync(out, { recursive: true });
(async () => {
  let browser;
  const failures = [];
  try {
    browser = await chromium.launch({ headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: process.platform === 'darwin' ? ['--no-sandbox'] :
        ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    for (const map of (process.env.AUDIT_MAPS || 'index,canyon').split(',')) {
      const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
      await context.addInitScript(id => {
        window.__hold = true;
        localStorage.setItem('gunrun-challenge-difficulty-v1', id === 'intro' ? 'normal' : id);
        localStorage.setItem('gunrun-pc-camera-v1', 'before');
        localStorage.setItem('gunrun-sky-proto-v1', JSON.stringify({ sendLog: false }));
      }, difficulty);
      const page = await context.newPage(), errors = [];
      page.setDefaultTimeout(120000);
      page.on('pageerror', e => errors.push(e.message));
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (isPublic && url.origin === 'https://jirisuke0121.github.io') return route.continue();
        if (url.origin === 'https://audit.test') {
          const file = decodeURIComponent(url.pathname).slice(1);
          if (!file.includes('..') && fs.existsSync(file) && fs.statSync(file).isFile()) {
            return route.fulfill({ status: 200, contentType: ({ html: 'text/html', js: 'application/javascript',
              css: 'text/css', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' })[path.extname(file).slice(1)] || 'application/octet-stream',
              body: fs.readFileSync(file) });
          }
          return route.abort();
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"top":[],"total":0}' });
      });
      await page.goto(base + map + '.html?verify=pursuit-20261106');
      await page.waitForFunction(() => window.skyStartReadiness?.ready && window.skyZombieDescent);
      await page.evaluate(id=>document.querySelector(id).click(),difficulty === 'intro' ? '#bIntro' : '#bStart');
      assert.equal(await page.evaluate(() => skyChallenge.id), difficulty);
      const inventory = await page.evaluate(fs.readFileSync('bench/pursuit-audit-inventory.js', 'utf8'));
      fs.writeFileSync(out + '/' + map + '-inventory.json', JSON.stringify(inventory, null, 2));
      let fixtures = inventory.fixtures;
      if (process.env.AUDIT_SET === 'recovery') fixtures = JSON.parse(fs.readFileSync('bench/pursuit-recovery-fixtures.json', 'utf8'))[map];
      if (process.env.AUDIT_FIXTURE_FILE) fixtures = JSON.parse(fs.readFileSync(process.env.AUDIT_FIXTURE_FILE, 'utf8'));
      const start = +process.env.AUDIT_START || 0, limit = +process.env.AUDIT_LIMIT || fixtures.length;
      fixtures = fixtures.slice(start, start + limit);
      console.log(`${map}: ${fixtures.length} representative chases, ${inventory.groups} regions/elevation bands`);
      const results = [];
      for (const f of fixtures) {
        const row = await page.evaluate(({ f, code, seconds }) => {
          window.auditFixture = f; window.auditSeconds = seconds; return eval(code);
        }, { f, code: scenario, seconds: +process.env.AUDIT_SECONDS || 45 });
        results.push(row);
        fs.writeFileSync(out + '/' + map + '-results.json', JSON.stringify({ map, errors, results }, null, 2));
        if (!row.valid || row.firstDamage === null || row.recoveryPenetrations || row.maxStep >= 1) {
          failures.push({ map, id: row.id, valid: row.valid, firstDamage: row.firstDamage,
            recoveryPenetrations: row.recoveryPenetrations, maxStep: row.maxStep, end: row.end });
          console.log('FAIL', JSON.stringify(failures.at(-1)));
        }
        if (process.env.AUDIT_DETAIL === '1') {
          await page.evaluate(() => {
            const g = __game, p = g.P.pos;
            g.frameOnce(1 / 60); g.debug.camera.position.set(p.x + 9, p.y + 8, p.z + 12);
            g.debug.camera.lookAt(p.x, p.y, p.z); g.debug.renderer.render(g.debug.scene, g.debug.camera);
          });
          await page.screenshot({ path: out + '/' + row.id + '.png' });
        }
      }
      assert.deepEqual(errors, [], `${map}: browser errors`);
      console.log(`${map}: ${results.filter(r => r.firstDamage !== null).length}/${results.length} reached and attacked`);
      await context.close();
    }
    assert.deepEqual(failures, [], 'Every representative chase must reach the player with swept recovery motion');
  } finally { await browser?.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
