// Frame-by-frame capture of the real game under a virtual clock. Usage: node engine.cjs <shot> [key=value...]
// env/args: W,H (viewport), FPS (output, 30|60), MAP, LANG, HUD(1|0), OUT dir, Q(query extra), EVERY (save every Nth for previews)
const { chromium } = require('/home/claude/pw/node_modules/playwright');
const fs = require('fs'), path = require('path');
const args = Object.fromEntries(process.argv.slice(3).map(a => a.split('=')));
const shot = process.argv[2];
const W = +(args.W || 960), H = +(args.H || 540), FPS = +(args.FPS || 30), SUB = 60 / FPS, EVERY = +(args.EVERY || 1);
const LANG = args.LANG || 'en', MAP = args.MAP || 'index.html', OUT = args.OUT || `/home/claude/video/out/${shot}`;
(async () => {
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ headless: true, executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars'] });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => {
    let s = 0x9e3779b9; window.__seed = v => { s = v >>> 0; };
    Math.random = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    // Sound: the game's one AudioContext becomes an OfflineAudioContext that renders in step with the virtual clock.
    { const Off = window.OfflineAudioContext; let one = null;
      const make = () => { if (one) return one; const o = new Off(2, 48000 * 75, 48000); const realResume = o.resume.bind(o), realSuspend = o.suspend.bind(o); let started = false, done = null;
        o.resume = () => Promise.resolve(); o.suspend = () => Promise.resolve(); o.close = () => Promise.resolve(); Object.defineProperty(o, 'state', { get: () => 'running' });
        Object.defineProperty(o, 'baseLatency', { get: () => 0 }); Object.defineProperty(o, 'outputLatency', { get: () => 0 });
        window.__audio = { ctx: o, advance: async t => { if (t <= o.currentTime + .004) return o.currentTime; const p = realSuspend(t); if (!started) { started = true; done = o.startRendering(); } else realResume(); await p; return o.currentTime; },
          finish: async (from, to) => { realResume(); const buf = await done; const a = Math.floor(from * 48000), n = Math.min(buf.length, Math.ceil(to * 48000)) - a, L = buf.getChannelData(0), R = buf.getChannelData(1), out = new Int16Array(n * 2);
            for (let i = 0; i < n; i++) { out[2 * i] = Math.max(-1, Math.min(1, L[a + i])) * 32767; out[2 * i + 1] = Math.max(-1, Math.min(1, R[a + i])) * 32767; }
            const u8 = new Uint8Array(out.buffer); let bin = ''; for (let i = 0; i < u8.length; i += 32768) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 32768)); return btoa(bin); } };
        return one = o; };
      const Shim = function () { return make(); }; window.AudioContext = Shim; window.webkitAudioContext = Shim; }
    try { localStorage.setItem('gunrun-onboarding-v1', JSON.stringify({ phase: 'complete', firstRunGuide: 'done' })); localStorage.setItem('gunrun-quality-check-v1', 'done'); localStorage.setItem('gunrun-name', 'RUNNER'); } catch {}
  });
  await ctx.route('https://**/*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0,"ok":true}' }));
  const p = await ctx.newPage(); p.setDefaultTimeout(600000);
  p.on('pageerror', e => console.log('pageerror', e.message.slice(0, 200)));
  await p.clock.install();
  await p.goto(`http://127.0.0.1:8899/${MAP}?lang=${LANG}&q=high${args.Q ? '&' + args.Q.replace(/,/g, '&') : ''}`);
  await p.waitForFunction(() => window.skyStartReadiness?.ready && window.__game);
  await p.addScriptTag({ path: path.join(__dirname, 'shots.js') });
  const MUL = FPS / 30, PORTRAIT = args.P === '1';
  const S = await p.evaluate(n => { const s = window.SHOTS[n]; if (!s) throw new Error('no shot ' + n); return { frames: s.frames, diff: s.diff || 'normal', canvas: !!s.canvas }; }, shot);
  S.frames = Math.round((+args.FRAMES || S.frames) * MUL); if (PORTRAIT) S.canvas = true;
  await p.evaluate(d => { const sel = document.getElementById('challengeDifficulty'); sel.value = d; sel.dispatchEvent(new Event('change', { bubbles: true })); window.__seed(12345); window.__game.startGame(); }, S.diff);
  await p.waitForFunction(() => window.__game.mode === 'play');
  const AUDIO = args.AUDIO !== '0';
  if (AUDIO) { await p.evaluate(() => { try { window.__skyInternals.initAudio(); } catch (e) { console.error(e); } }); await p.waitForTimeout(1500); }
  // Own the frame clock from here: timers/performance.now come from the paused virtual clock, rAF from our queue.
  await p.clock.pauseAt((await p.evaluate(() => Date.now())) + 3000);
  await p.evaluate(() => {
    const q = []; let id = 1; window.requestAnimationFrame = f => { q.push([id, f]); return id++; };
    window.cancelAnimationFrame = i => { const k = q.findIndex(e => e[0] === i); if (k >= 0) q.splice(k, 1); };
    window.__raf = () => { const run = q.splice(0), now = performance.now(); for (const [, f] of run) { try { f(now); } catch (e) { console.error(e); } } };
    const start = new WeakMap(); window.__anim = () => { const now = performance.now(); for (const a of document.getAnimations()) { if (!start.has(a)) { start.set(a, now - (a.currentTime || 0)); try { a.pause(); } catch {} } try { a.currentTime = now - start.get(a); } catch {} } };
    window.__sfx = []; window.__events = [];
  });
  await p.clock.runFor(40); await p.evaluate(() => window.__raf());
  await p.evaluate(([sub, x]) => { window.__SUB = sub; for (const [k, v] of Object.entries(x)) if (/^X_/.test(k)) window['__' + k.slice(2)] = +v; }, [SUB, args]);
  await p.evaluate(n => window.SHOTS[n].setup(), shot);
  const hud = args.HUD !== '0';
  if (!hud) await p.addStyleTag({ content: '#hud,#touch,#bSettings,#skillDock{visibility:hidden!important}' });
  await p.addStyleTag({ content: '#runResponsibility{display:none!important}' });
  if (PORTRAIT) await p.evaluate(([w, h]) => window.SH.portrait(w, h), [+(args.PW || 1080), +(args.PH || 1620)]);
  let ms = 0, k = 0; const t0 = Date.now(), log = [];
  const pre = Math.round(+(await p.evaluate(n => window.SHOTS[n].pre || 0, shot)) * MUL);
  const total = pre + S.frames;
  for (let f = 0; f < total; f++) {
    for (let s = 0; s < SUB; s++) {
      k++; const target = Math.round(k * 1000 / 60);
      await p.evaluate(([n, i]) => window.SHOTS[n].tick?.(i), [shot, (f - pre) * SUB + s]);
      await p.clock.runFor(target - ms); ms = target;
      await p.evaluate(() => window.__raf());
      if (AUDIO) await p.evaluate(t => window.__audio?.advance(t), k / 60);
    }
    if (f < pre) continue;
    const i = f - pre;
    const post = await p.evaluate(([n, i]) => { window.__anim(); return window.SHOTS[n].post?.(i) || null; }, [shot, i]);
    if (post) log.push([i, post]);
    if (i % EVERY) continue;
    const file = `${OUT}/f${String(i / EVERY | 0).padStart(5, '0')}.jpg`;
    if (S.canvas) { const url = await p.evaluate(([n, i]) => (window.SHOTS[n].grab || window.SH.regrab)(i), [shot, i]); fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64')); }
    else await p.screenshot({ path: file, type: 'jpeg', quality: 92 });
  }
  if (AUDIO) { const from = pre * SUB / 60, to = total * SUB / 60 + 0.8; const b64 = await p.evaluate(([a, b]) => window.__audio ? window.__audio.finish(a, b) : null, [from, to]);
    if (b64) { const pcm = Buffer.from(b64, 'base64'), h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(48000, 24); h.writeUInt32LE(192000, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40); fs.writeFileSync(`${OUT}/audio.wav`, Buffer.concat([h, pcm])); } }
  const tail = await p.evaluate(() => ({ sfx: window.__sfx, events: window.__events }));
  fs.writeFileSync(`${OUT}/log.json`, JSON.stringify({ shot, W, H, FPS, frames: S.frames, pre, log, ...tail }));
  console.log(shot, 'frames', S.frames, 'sec/frame', ((Date.now() - t0) / 1000 / total).toFixed(2));
  await b.close();
})().catch(e => { console.error(String(e).slice(0, 1500)); process.exit(1); });
