// A ranked start needs a nickname from the second recorded run on; the first real run stays name-free.
const assert = require('node:assert/strict'), { spawn } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const port = Number(process.env.SKY_TEST_PORT || 18933), base = `http://127.0.0.1:${port}/`;
(async () => {
  const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { if (await fetch(base).then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const open = async (seed, query = '?namegate=1') => {
    const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(([seed]) => { window.__hold = true; for (const [k, v] of Object.entries(seed)) if (!localStorage.getItem(k)) localStorage.setItem(k, v); }, [seed]);
    await ctx.route('https://**/*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0}' }));
    const page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(90000);
    await page.goto(base + 'index.html' + query); await page.waitForFunction(() => window.__game && window.skyStartReadiness?.ready);
    await page.locator('#homeDifficulty [data-difficulty="normal"]').first().click();
    return { ctx, page, errors };
  };
  const played = JSON.stringify([{ clientRunId: 'r1', at: '2026-11-27T00:00:00Z', map: 'old-town', difficulty: 'normal', reason: 'caught', t: 30, score: 300, state: 'saved' }]);
  const dialog = page => page.locator('#onboarding');

  { // 1. First real run: no name, no earlier recorded run -> starts straight away.
    const { ctx, page, errors } = await open({ 'gunrun-onboarding-v1': JSON.stringify({ phase: 'complete' }) });
    await page.locator('#bStart').click(); await page.waitForFunction(() => __game.mode === 'play');
    assert.equal(await dialog(page).isHidden(), true, 'first real run is not asked for a name'); assert.equal(errors.length, 0, errors.join('\n')); await ctx.close(); console.log('PASS first real run starts without a name');
  }
  { // 2. Played before, still no name -> the start is held back by a required dialog (no way to skip), and goes on after saving.
    const { ctx, page, errors } = await open({ 'gunrun-onboarding-v1': JSON.stringify({ phase: 'complete', namePrompted: true }), 'gunrun-run-history-v1': played });
    await page.locator('#bStart').click();
    await dialog(page).waitFor({ state: 'visible' });
    assert.notEqual(await page.evaluate(() => __game.mode), 'play', 'the run did not start');
    assert.equal(await page.locator('#onbMain').isHidden(), true, 'no "later" button'); assert.equal(await page.locator('#onbIntro').isHidden(), true);
    assert.match(await page.locator('#onboarding .onb-lead[data-for=need]').innerText(), /ニックネームを決めてください/);
    await page.keyboard.press('Escape'); assert.equal(await dialog(page).isVisible(), true, 'Escape does not skip');
    await page.locator('#onbSave').click(); assert.match(await page.locator('#onbError').innerText(), /名前を入力/);
    await page.locator('#onbName').fill('x'); await page.locator('#onbSave').click(); assert.ok((await page.locator('#onbError').innerText()).length, 'one letter is refused');
    await page.locator('#onbName').fill('Runner_9'); await page.locator('#onbSave').click();
    await page.waitForFunction(() => __game.mode === 'play'); assert.equal(await page.evaluate(() => localStorage.getItem('gunrun-name')), 'RUNNER_9');
    assert.equal(await dialog(page).isHidden(), true); assert.equal(errors.length, 0, errors.join('\n')); await ctx.close(); console.log('PASS second run needs a name, then starts');
  }
  { // 3. Named players, and the name chip / コツ dialogs, behave as before.
    const { ctx, page } = await open({ 'gunrun-name': 'HELLO', 'gunrun-run-history-v1': played });
    await page.locator('#bStart').click(); await page.waitForFunction(() => __game.mode === 'play'); assert.equal(await dialog(page).isHidden(), true); await ctx.close();
    const again = await open({ 'gunrun-run-history-v1': played, 'gunrun-onboarding-v1': JSON.stringify({ phase: 'complete', namePrompted: true }) });
    await again.page.evaluate(() => skyOnboarding.open('name'));
    assert.equal(await again.page.locator('#onbMain').isVisible(), true, 'the name chip keeps its "later" button'); await again.ctx.close(); console.log('PASS named players and the name chip are unchanged');
  }
  { // 4. Automated browsers (the other bench scripts) are not gated unless asked.
    const { ctx, page } = await open({ 'gunrun-run-history-v1': played }, '');
    await page.locator('#bStart').click(); await page.waitForFunction(() => __game.mode === 'play'); await ctx.close(); console.log('PASS automated browsers are not gated by default');
  }
  await browser.close(); server.kill();
})().catch(e => { console.error(e); process.exit(1); });
