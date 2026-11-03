// 鉄棒ルートを、実ゲームの物理と入力（ジャンプ・つかみ・振り・離す）で走らせて、リプレイ形式で記録する。
//   node tools/spot-bot.cjs --route=south-corner [--jump=3] [--out=docs/spot-replays] [--chase=1]
// 台本ではなく本物の動き。記録は escape-replay-video.cjs / escape-replay-topdown.py にそのまま渡せる。
const fs = require('node:fs'), path = require('node:path'), { spawn } = require('node:child_process');
const { revealHomeControl } = require('../bench/home-controls.cjs');
const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1] ?? d;
const root = path.resolve(__dirname, '..');
const routeIds = arg('route', 'south-corner').split(','), outDir = path.resolve(root, arg('out', 'docs/spot-replays'));
const debug = arg('debug', '0') === '1', jumpDist = Number(arg('jump', 3)), chase = arg('chase', '1') === '1';

async function main() {
  const { chromium } = require('playwright');
  const server = spawn('python3', ['-m', 'http.server', '8799', '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { if (await fetch('http://127.0.0.1:8799/').then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  fs.mkdirSync(outDir, { recursive: true });
  try {
    const context = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1280, height: 720 } });
    await context.addInitScript(() => { window.__hold = true; });
    await context.route('https://**/*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0,"ok":true}' }));
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(240000);
    await page.goto('http://127.0.0.1:8799/index.html?challengeDebug=1');
    await page.waitForFunction(() => window.__game && window.skySwing && window.__skyGhost);
    const level = page.locator('[data-difficulty=normal]'); await revealHomeControl(page, level); await level.click(); await page.locator('#bStart').click();
    for (const id of routeIds) {
      const r = await page.evaluate(async ({ id, jumpDist, chase, debug }) => {
        const g = __game, s = __skyInternals, c = g.P, dt = 1 / 120, course = window.skyOldTownSwingCourse;
        const route = course.routes.find(x => x.id === id) || course.spotRoutes?.find(x => x.id === id), bars = course.bars.filter(b => b.route === id);
        if (!route) return { error: 'no route ' + id };
        let seed = 20261103; Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
        const key = (code, type) => dispatchEvent(new KeyboardEvent(type, { code }));
        for (const k of Object.keys(g.keys)) g.keys[k] = false; key('Space', 'keyup');
        window.skySwing.reset(); window.skyLandingRoll?.reset?.(); window.skyDash?.reset?.(false);
        for (const z of s.Jt) { s.ue.remove(z.m.root); if (z.pool) s.ue.remove(z.pool); } s.Jt.length = 0;
        g.DOOR_FEEDBACK?.reset(g.DOORS || []); g.SCR.off = g.PACE.off = g.MARK.off = true;
        Object.assign(g.S, { sendLog: false, gunOn: false, autoFire: false, aimAuto: false, stalkerOn: false, stalker2: false, dropShare: 0 });
        g.GAME.over = false; g.GAME.t = 0; g.GAME.spawnT = g.GAME.surgeT = 1e9; g.GAME.safeT = 0; g.setMode('play');
        const a = route.approach, first = bars[0], dir = first.direction, yaw0 = Math.atan2(-dir[0], -dir[1]);
        g.placeAt({ x: a[0], y: a[1], z: a[2], yaw: yaw0 });
        Object.assign(c, { jumpBuf: 0, coyote: 0, slideBuf: 0, slideCD: 0, catchCD: 0, hookPressed: false, crouchPressed: false, life: skyChallenge.maxLives(3), invuln: -1, edgeJump: false, edgeOff: null });
        for (let i = 0; i < 24; i++) g.advance(dt);
        c.node = g.nodeAt(c.pos.x, c.pos.y + .1, c.pos.z); g.updateField();
        if (chase) { // 追手: 進行方向の後ろ6〜8mの、同じ高さの足場から本番のAIで追わせる
          const N = g.NAV; let from = null;
          for (const p of N.nodes) {
            const d = Math.hypot(p.x - c.pos.x, p.z - c.pos.z), back = (c.pos.x - p.x) * dir[0] + (c.pos.z - p.z) * dir[1];
            if (Math.abs(p.y - c.pos.y) < .1 && d > 2.2 && d < 9 && back > 1.6 && s.oe(p.x, p.y + .03, p.z, .3, 1.8)) { from = p; break; }
          }
          if (from) for (const q of [0, 1]) {
            const z = new s.ri(from.x - q * dir[1] * 1.2, from.y + .01, from.z + q * dir[0] * 1.2); Object.assign(z, { spawnT: 0, rise: null, hp: 1e6, flank: false, dropper: false, stalker: false, onGround: true });
            z.node = g.nodeAt(z.pos.x, z.pos.y + .1, z.pos.z); s.Jt.push(z);
          }
        }
        const STATES = ['run', 'air', 'slide', 'wallrun', 'vault', 'mantle', 'catch', 'hook', 'zip', 'ladder'];
        const stateName = () => c.state === 'normal' ? (c.onGround ? 'run' : 'air') : c.state === 'ledge' ? c.ledge?.kind || 'vault' : c.state === 'swing' ? 'air' : c.state;
        const samples = [], zlog = [], log = [], t0 = g.GAME.t; let lastS = -1, lastD = -1, jumped = false, startedAt = null;
        window.__skyGhost.start();
        const sample = () => {
          const now = g.GAME.t - t0; if (now - lastS < .05 - 1e-6) return; lastS = now;
          samples.push([Math.round(g.GAME.t * 1000) / 1000, +c.pos.x.toFixed(3), +c.pos.y.toFixed(3), +c.pos.z.toFixed(3), +c.yaw.toFixed(3), +c.pitch.toFixed(3), Math.max(0, STATES.indexOf(stateName())), Math.max(0, c.life), 0]);
          zlog.push([samples.at(-1)[0], s.Jt.map(z => [+z.pos.x.toFixed(2), +z.pos.y.toFixed(2), +z.pos.z.toFixed(2)])]);
          if (now - lastD >= .25 - 1e-6) { lastD = now; window.__skyGhost.snapshot(); }
        };
        const released = new Set(), used = new Set(); let landed = false, afterLand = 0, minY = Infinity, hit = false;
        g.keys.KeyW = true; sample();
        for (let tick = 0; tick < 120 * 14; tick++) {
          const sw = window.skySwing.active;
          if (sw) {
            used.add(sw.bar.id);
            if (!released.has(sw.bar.id) && sw.angle >= .7 && sw.omega > 1.1) { released.add(sw.bar.id); key('Space', 'keydown'); key('Space', 'keyup'); }
          } else if (!jumped && c.onGround) {
            const ahead = (first.at[0] - c.pos.x) * dir[0] + (first.at[2] - c.pos.z) * dir[1];
            if (ahead <= jumpDist) { jumped = true; startedAt = g.GAME.t - t0; key('Space', 'keydown'); key('Space', 'keyup'); }
          } else if (jumped && used.size && used.size < bars.length && !sw && c.onGround === false) {
            // 次の鉄棒は、空中で自動的につかむ
          }
          g.advance(dt); if (debug && tick % 60 === 0) log.push([+(g.GAME.t - t0).toFixed(1), ...c.pos.toArray().map(v => +v.toFixed(2)), c.state, c.onGround, !!window.skySwing.active]); sample(); minY = Math.min(minY, c.pos.y); if (c.life < skyChallenge.maxLives(3)) hit = true;
          if (jumped && c.onGround && !sw && used.size === bars.length && g.GAME.t - t0 > (startedAt || 0) + .5) { landed = true; if (++afterLand > 120 * 1.2) break; }
          if (c.onGround && c.pos.y < route.exit[1] - 2 && jumped) break;
          if (g.GAME.over) break;
        }
        key('Space', 'keyup'); g.keys.KeyW = false;
        const snap = window.__skyGhost.snapshot(), mod = await import('/replay-data.js');
        const ghost = { v: 1, map: 'old-town', mapVersion: mod.MAP_VERSIONS['old-town'], samples, ...(snap?.detail ? { detail: snap.detail } : {}) };
        const valid = mod.validateGhost(ghost, 'old-town', 30);
        const end = c.pos.toArray(), dEnd = Math.hypot(end[0] - route.exit[0], end[2] - route.exit[2]);
        return { id, jumpDist, bars: bars.map(b => b.id), usedBars: [...used], released: [...released], landed, hit, minY: +minY.toFixed(2), end: end.map(v => +v.toFixed(2)), exit: route.exit, distToExit: +dEnd.toFixed(2), onGround: c.onGround, duration: +(g.GAME.t - t0).toFixed(2), valid: !!valid, ...(debug ? { log: log.slice(0, 16), startPos: a, yaw0 } : {}), ghost: valid ? ghost : null, zlog };
      }, { id, jumpDist, chase, debug });
      const { ghost, zlog, ...metrics } = r;
      console.log(JSON.stringify(metrics));
      if (ghost) {
        const file = `${id}-${String(jumpDist).replace('.', '_')}`;
        fs.writeFileSync(path.join(outDir, `${file}.json`), JSON.stringify({ id: file, name: `実物理 ${id}`, tag: id, score: 0, playedAt: new Date().toISOString(), note: JSON.stringify(metrics), zombies: zlog, ghost }));
      }
    }
    if (errors.length) console.log('pageerrors', errors.slice(0, 3));
  } finally { await browser.close(); server.kill(); }
}
main().catch(e => { console.error(e); process.exit(1); });
