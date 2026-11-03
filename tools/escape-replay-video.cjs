// docs/escape-replays/*.json を、ゲーム本編のリプレイ表示で1コマずつ再生して mp4 にする。
//   node tools/escape-replay-video.cjs [--fps=15] [--dir=docs/escape-replays]
const fs = require('node:fs'), path = require('node:path'), { spawn, spawnSync } = require('node:child_process');
const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const root = path.resolve(__dirname, '..'), dir = path.resolve(root, arg('dir', 'docs/escape-replays')), fps = Number(arg('fps', 15)), only = arg('only', ''), width = Number(arg('width', 960));
(async () => {
  const { chromium } = require('playwright');
  const server = spawn('python3', ['-m', 'http.server', '8795', '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { if (await fetch('http://127.0.0.1:8795/').then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    for (const file of fs.readdirSync(dir).filter(f => /^escape-\d+\.json$/.test(f) && (!only || f.startsWith(only)))) {
      const record = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')), id = file.replace('.json', '');
      const context = await browser.newContext({ locale: 'ja-JP', viewport: { width, height: Math.round(width * 9 / 16) } });
      await context.route('https://**/*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0,"ok":true}' }));
      const page = await context.newPage(); page.setDefaultTimeout(180000);
      await page.goto('http://127.0.0.1:8795/index.html?challengeDebug=1');
      await page.waitForFunction(() => window.__skyInternals && window.__skyGhost && window.__skyInternals.modeRef() === 'menu');
      await page.evaluate(r => window.__skyGhost.open(r.id, null, { record: r }), record);
      await page.waitForFunction(() => { const e = document.getElementById('replaySeek'); return e && !e.disabled; });
      await page.click('#replayToggle'); // 一時停止にして、時刻を自分で進める
      await page.addStyleTag({ content: '.replay-panel{display:none!important}' }); // 動画では操作パネルを隠して画面を広く使う
      const t0 = record.ghost.samples[0][0], t1 = record.ghost.samples.at(-1)[0], frames = path.join('/tmp', `frames-${id}`);
      fs.rmSync(frames, { recursive: true, force: true }); fs.mkdirSync(frames, { recursive: true });
      let n = 0;
      for (let t = t0; t <= t1 + 1e-6; t += 1 / fps, n++) {
        await page.evaluate(time => { const e = document.getElementById('replaySeek'); e.value = time; e.dispatchEvent(new Event('input', { bubbles: true })); }, t);
        await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
        await page.screenshot({ path: path.join(frames, `f${String(n).padStart(4, '0')}.png`) });
      }
      const out = path.join(dir, `${id}.mp4`);
      const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(frames, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '28', out], { encoding: 'utf8' });
      console.log(id, `${n} frames`, r.status === 0 ? out : r.stderr);
      await context.close();
    }
  } finally { await browser.close(); server.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
