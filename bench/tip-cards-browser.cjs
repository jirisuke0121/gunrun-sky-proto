// Tips (controlled browser checks, not a human test): the コツ screen and the one-time cards on the 2nd game-over screen.
const assert = require('node:assert/strict'), { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const port = Number(process.env.SKY_TEST_PORT || 18811), base = `http://127.0.0.1:${port}/`;
(async () => { let browser, server; try {
  server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { if (await fetch(base).then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const KEY = 'gunrun-tip-usage-v1';
  const mk = async (seed, size = { width: 844, height: 390 }) => {
    const ctx = await browser.newContext({ locale: 'ja-JP', viewport: size, hasTouch: true, isMobile: true });
    await ctx.addInitScript(s => { window.__hold = true; localStorage.setItem('gunrun-onboarding-v1', '{"phase":"complete","namePrompted":true}'); if (s) localStorage.setItem('gunrun-tip-usage-v1', s); }, seed);
    await ctx.route('https://**/*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0}' }));
    return ctx;
  };
  const open = async (ctx, url) => { const page = await ctx.newPage(); page.setDefaultTimeout(90000); page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
    await page.goto(base + url); await page.waitForFunction(() => window.__game && window.skyStartReadiness?.ready); return page; };
  const finish = async page => { await page.evaluate(() => { __game.GAME.t = 40; __game.endGame('caught'); __game.advance(1.5); });
    await page.waitForFunction(() => document.getElementById('unityResultCard').dataset.complete === 'true'); await page.waitForTimeout(300); };
  const start = async page => { await page.click('#bStart'); await page.waitForFunction(() => __game.mode === 'play'); };
  const retry = async page => { await page.click('#unityRetry'); await page.waitForFunction(() => __game.mode === 'play'); };
  const usage = page => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), KEY);
  const strip = page => page.evaluate(() => ({ visible: !document.getElementById('unityTips').hidden, cards: [...document.querySelectorAll('#unityTips .ut-card b')].map(b => b.textContent), canvases: document.querySelectorAll('.ut-canvas').length,
    retryY: Math.round(document.getElementById('unityRetry').getBoundingClientRect().y), cardH: Math.round(document.getElementById('unityResultCard').getBoundingClientRect().height),
    content: (c => [c.scrollHeight, c.clientHeight])(document.getElementById('unityResultContent')) }));

  // 1st run: nothing; 2nd run: the two top unused moves, same button position; 3rd run: never again.
  let ctx = await mk(null), page = await open(ctx, 'index.html'); await start(page); await finish(page);
  const first = await strip(page); assert.equal(first.visible, false, 'no tips after the 1st run'); assert.equal((await usage(page)).runs, 1);
  await retry(page); await finish(page);
  const second = await strip(page);
  assert.equal(second.visible, true, 'tips after the 2nd run'); assert.deepEqual(second.cards, ['壁走り', 'アイテム'], 'two cards, priority order, no reason text');
  assert.equal(second.canvases, 2); assert.equal(second.retryY, first.retryY, '"もう一度逃げる" does not move'); assert.equal(second.cardH, first.cardH);
  assert.ok(second.content[0] <= second.content[1] + 1, 'the score lines are not cut off: ' + second.content);
  assert.equal((await usage(page)).shown, true);
  assert.equal(await page.locator('.ut-card').first().boundingBox().then(b => b.width > 250), true, 'cards are wide enough to read');
  await retry(page); assert.equal((await strip(page)).canvases, 0, 'demos are removed when the next run starts');
  await finish(page); const third = await strip(page); assert.equal(third.visible, false, 'shown once only'); assert.equal((await usage(page)).runs, 3);
  assert.deepEqual(page.errors, []); await ctx.close();

  // Moves already used are skipped; with only one unused move there is one card. Nothing unused: no strip.
  ctx = await mk(JSON.stringify({ runs: 1, moves: { wallrun: 4, items: 1, rope: 1, zip: 1, blast: 1, jumpgun: 1, bar: 0 } })); page = await open(ctx, 'index.html'); await start(page); await finish(page);
  assert.deepEqual((await strip(page)).cards, ['鉄棒つかみ直し']); await ctx.close();
  ctx = await mk(JSON.stringify({ runs: 1, moves: { wallrun: 1, items: 1, rope: 1, zip: 1, blast: 1, jumpgun: 1, bar: 1 } })); page = await open(ctx, 'index.html'); await start(page); await finish(page);
  assert.equal((await strip(page)).visible, false, 'a player who used everything sees no tips'); await ctx.close();

  // The white-box 渓谷 is not an official map: neither counted nor shown.
  ctx = await mk(JSON.stringify({ runs: 1, moves: {} })); page = await open(ctx, 'canyon.html'); await start(page); await finish(page);
  assert.equal((await strip(page)).visible, false); assert.equal((await usage(page)).runs, 1, 'canyon runs are not counted'); await ctx.close();

  // Very short screens skip the strip and keep it for later.
  ctx = await mk(JSON.stringify({ runs: 1, moves: {} }), { width: 568, height: 320 }); page = await open(ctx, 'index.html'); await start(page); await finish(page);
  assert.equal((await strip(page)).visible, false); assert.equal((await usage(page)).shown, false, 'not marked as shown when it could not be shown'); await ctx.close();

  // コツ screen: unused moves carry an orange dot and the first unused move is selected; one demo at a time.
  ctx = await mk(JSON.stringify({ runs: 5, moves: { wallrun: 3, rope: 1 } })); page = await open(ctx, 'index.html');
  await page.click('#homeGuide'); await page.waitForSelector('#onbTipList button');
  const dots = await page.evaluate(() => [...document.querySelectorAll('#onbTipList button')].map(b => [b.dataset.id, b.querySelector('.onb-dot').classList.contains('on')]));
  assert.deepEqual(dots, [['wallrun', false], ['items', true], ['rope', false], ['zip', true], ['blast', true], ['jumpgun', true], ['bar', true]]);
  assert.equal(await page.getAttribute('#onbTipList button[data-id=items]', 'aria-current'), 'true'); assert.equal(await page.locator('#onbTipStage canvas').count(), 1);
  await page.click('#onbTipList button[data-id=bar]'); await page.waitForTimeout(500);
  assert.equal(await page.locator('#onbTipStage canvas').count(), 1); assert.equal((await page.textContent('#onbTipCap')).length > 0, true);
  assert.equal(await page.textContent('#onbTitle'), 'コツ'); await page.click('#onbMain'); assert.equal(await page.locator('#onbTipStage canvas').count(), 0, 'the demo stops when the screen closes');
  assert.deepEqual(page.errors, []); await ctx.close();
  console.log('tip cards ok');
} finally { await browser?.close(); server?.kill(); } })().catch(e => { console.error(e); process.exit(1); });
