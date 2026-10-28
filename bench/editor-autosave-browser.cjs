const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

(async () => {
  const base = process.env.RUNNING_QA_URL || 'http://127.0.0.1:8779/';
  let server, browser;
  try {
    if (!process.env.RUNNING_QA_URL) {
      server = spawn('python3', ['-m', 'http.server', '8779', '--bind', '127.0.0.1'], { stdio: 'ignore' });
      for (let i = 0; i < 100; i++) {
        if (await fetch(base).then(r => r.ok, () => false)) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    browser = await chromium.launch({ headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    fs.mkdirSync('browser-evidence', { recursive: true });
    for (const touch of [false, true]) {
      const context = await browser.newContext({ viewport: touch ? { width: 844, height: 390 } : { width: 1280, height: 800 },
        hasTouch: touch, isMobile: touch });
      try {
        const editor = await context.newPage(), game = await context.newPage(), errors = [];
        for (const page of [editor, game]) page.on('pageerror', error => errors.push(error.message));
        await editor.goto(new URL('hook-editor.html', base).href, { waitUntil: 'load' });
        await editor.waitForFunction(() => document.querySelector('#loadState').textContent.startsWith('自動保存 /'), null, { timeout: 90000 });
        await game.goto(base, { waitUntil: 'load' });
        await game.waitForFunction(() => window.skyHookEditor && window.skyWallRunGuides, null, { timeout: 90000 });

        await editor.locator('#points button').first().click();
        const oldX = await editor.locator('#x').inputValue(), nextX = Number(oldX) + .25;
        await editor.locator('#x').fill(String(nextX)); await editor.locator('#x').blur();
        await game.waitForFunction(x => window.skyHookEditor.current()[0][0] === x, nextX);
        await game.reload({ waitUntil: 'load' });
        await game.waitForFunction(x => window.skyHookEditor?.current()[0][0] === x, nextX);

        await editor.locator('#wallJumpMode').click();
        assert.equal(await editor.locator('#points button').count(), 5, 'editor starts with actual standard points');
        await editor.locator('#points button').first().click();
        await editor.locator('#x').fill('32'); await editor.locator('#x').blur();
        await game.waitForFunction(() => window.skyWallJumpEditor.current()[0][0] === 32 && window.skyWallRunGuides.routes[0].at[0] === 32);
        const accepts = await game.evaluate(() => {
          const wall = window.__game.solids.find(b => b.type === 'mono' && Math.abs(b.maxZ + 1.5) < .05 && b.minX < 26 && b.maxX > 32);
          const player = x => ({ r: .34, pos: { x, y: 1.9, z: -.78 } });
          return [32, 26].map(x => window.__skyCanWallJumpAtSpot(player(x), () => wall, { x: 0, z: 1 }));
        });
        assert.deepEqual(accepts, [true, false], 'new location accepts jumps; old location no longer does');
        await editor.locator('#remove').click();
        await game.waitForFunction(() => window.skyWallJumpEditor.current().length === 4 && window.skyWallRunGuides.routes.length === 4);
        await editor.locator('#reset').click();
        await game.waitForFunction(() => window.skyWallJumpEditor.current().length === 5 && window.skyWallRunGuides.routes.length === 5);
        await game.reload({ waitUntil: 'load' });
        await game.waitForFunction(() => window.skyWallJumpEditor?.current().length === 5 && window.skyWallRunGuides?.routes.length === 5);
        await editor.screenshot({ path: `browser-evidence/editor-autosave-${touch ? 'touch' : 'desktop'}.png`, fullPage: true });
        assert.deepEqual(errors, []);
        console.log(`PASS ${touch ? 'touch' : 'desktop'} editor: input auto-save, cross-tab hooks, reload, moved jump permissions and paint, delete and standard reset`);
      } finally { await context.close(); }
    }
  } finally { await browser?.close(); server?.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
