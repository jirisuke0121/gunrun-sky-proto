// 脱出経路を実ゲームの中で再生し、追手(実AI)付きの記録をリプレイ形式で保存する。
//   node tools/escape-replay.cjs [--count=5] [--difficulty=normal] [--out=docs/escape-replays]
// 動きは「自動パルクールアイテム」の試作として、経路の各区間を台本どおりに動かす(物理では動かさない)。
// ゾンビは本編と同じ追跡AI。結果は、被弾・最接近距離・体が壁に埋まった標本数で評価する。
const fs = require('node:fs'), path = require('node:path'), { spawn } = require('node:child_process');
const { exportGame, analyze, SETTINGS } = require('./escape-graph.cjs');
const { revealHomeControl } = require('../bench/home-controls.cjs');
const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const root = path.resolve(__dirname, '..');
const difficulty = arg('difficulty', 'normal'), count = Number(arg('count', 5));
const outDir = path.resolve(root, arg('out', 'docs/escape-replays'));
const REACTION = .4, TAIL = 1.2; // 追手に囲まれてから動き出すまで(秒)と、到着後に見せる時間(秒)

function pickScenarios(data, a) {
  const kinds = new Set(['走る', '登る', 'はしご', 'ジャンプ', '飛び降り', 'ジップ', '鉄棒', '這う']);
  const cand = [];
  a.results.forEach((r, i) => {
    if (!r.route || r.route.length < 8 || r.time < 3 || r.moves.filter(m => m !== '走る').length < 1) return;
    const variety = new Set(r.moves.filter(m => kinds.has(m))).size;
    cand.push({ i, r, variety, score: variety * 10 + Math.min(r.margin, 4) });
  });
  cand.sort((x, y) => y.score - x.score || x.i - y.i);
  const picked = [], want = { 'needs-extras': Math.ceil(count / 2), ok: Math.floor(count / 2) + 1 };
  for (const c of cand) {
    if (picked.length >= count) break;
    if (!want[c.r.status] || picked.some(p => Math.hypot(data.nodes[p.i][0] - data.nodes[c.i][0], data.nodes[p.i][2] - data.nodes[c.i][2]) < 18)) continue;
    want[c.r.status]--; picked.push(c);
  }
  return picked.map(c => ({
    id: `escape-${String(c.i).padStart(4, '0')}`, node: c.i, status: c.r.status, margin: c.r.margin, time: c.r.time,
    start: data.nodes[c.i], target: data.nodes[c.r.target], moves: c.r.moves,
    path: c.r.route.map(v => data.nodes[v]), kinds: c.r.moves, costs: c.r.costs, threats: c.r.threatNodes.map(v => data.nodes[v]),
  }));
}

// ブラウザ内: 1つの脱出を実行して記録を返す。
async function runScenario(page, sc, settings) {
  return page.evaluate(async ({ sc, settings, reaction, tail }) => {
    const g = __game, s = __skyInternals, c = g.P, dt = 1 / 60;
    let seed = 20261103; Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (const k of Object.keys(g.keys)) g.keys[k] = false;
    window.skySwing?.reset?.(); window.skyLandingRoll?.reset?.(); window.skyDash?.reset?.(false);
    for (const z of s.Jt) { s.ue.remove(z.m.root); if (z.pool) s.ue.remove(z.pool); } s.Jt.length = 0;
    g.DOOR_FEEDBACK?.reset(g.DOORS || []);
    g.SCR.off = g.PACE.off = g.MARK.off = true;
    Object.assign(g.S, { sendLog: false, gunOn: false, autoFire: false, aimAuto: false, stalkerOn: false, stalker2: false, dropShare: 0 });
    g.GAME.over = false; g.GAME.t = 0; g.GAME.spawnT = g.GAME.surgeT = 1e9; g.GAME.safeT = 0; g.setMode('play');
    const first = sc.path[0], second = sc.path[1];
    const faceYaw = (dx, dz) => Math.atan2(-dx, -dz);
    g.placeAt({ x: first[0], y: first[1], z: first[2], yaw: faceYaw(second[0] - first[0], second[2] - first[2]) });
    Object.assign(c, { jumpBuf: 0, coyote: 0, slideBuf: 0, slideCD: 0, catchCD: 0, hookPressed: false, crouchPressed: false, life: skyChallenge.maxLives(3), invuln: -1, edgeJump: false, edgeOff: null });
    for (let i = 0; i < 12; i++) g.advance(dt);
    c.node = g.nodeAt(c.pos.x, c.pos.y + .1, c.pos.z); g.updateField();
    for (const p of sc.threats) {
      const z = new s.ri(...p);
      Object.assign(z, { spawnT: 0, rise: null, hp: 1e6, flank: false, dropper: false, stalker: false, onGround: true });
      z.node = g.nodeAt(p[0], p[1] + .1, p[2]); s.Jt.push(z);
    }
    // 台本: 区間ごとの開始時刻と動き方。
    const segs = []; let t0 = reaction;
    for (let i = 0; i < sc.kinds.length; i++) {
      const from = sc.path[i], to = sc.path[i + 1], dur = Math.max(.05, sc.costs[i]);
      segs.push({ from, to, kind: sc.kinds[i], t0, t1: t0 + dur }); t0 += dur;
    }
    const total = t0 + tail;
    const lerp = (a, b, u) => a + (b - a) * u, ease = u => u * u * (3 - 2 * u);
    let lastYaw = c.yaw;
    function pose(t) {
      if (t <= reaction) return { x: first[0], y: first[1], z: first[2], yaw: lastYaw, st: 'run', v: [0, 0, 0] };
      const sg = segs.find(q => t < q.t1) || segs.at(-1), u = Math.min(1, Math.max(0, (t - sg.t0) / (sg.t1 - sg.t0)));
      const [fx, fy, fz] = sg.from, [tx, ty, tz] = sg.to, dx = tx - fx, dz = tz - fz, dy = ty - fy, len = Math.hypot(dx, dz);
      let x = lerp(fx, tx, u), z = lerp(fz, tz, u), y = lerp(fy, ty, u), st = 'run';
      switch (sg.kind) {
        case '登る': { // 壁際で先に上がり、上の面へ踏み出す(壁へ食い込まない)
          const uy = Math.min(1, u / .65), ux = Math.max(0, (u - .65) / .35);
          y = fy + dy * ease(uy); x = lerp(fx, tx, ease(ux)); z = lerp(fz, tz, ease(ux)); st = 'mantle'; break; }
        case 'ジャンプ': y += .9 * Math.sin(Math.PI * u); st = 'air'; break;
        case '飛び降り': { // 縁まで歩いてから真下へ落ちる
          const ux = Math.min(1, u / .4), uf = Math.max(0, (u - .4) / .6);
          x = lerp(fx, tx, ux); z = lerp(fz, tz, ux); y = fy + dy * uf * uf; st = 'air'; break; }
        case '鉄棒': y += 1.6 * Math.sin(Math.PI * u); st = 'air'; break;
        case 'はしご': st = 'ladder'; break;
        case 'ジップ': st = 'zip'; y = lerp(fy, ty, u); break;
        default: break;
      }
      if (len > .3) lastYaw = faceYaw(dx, dz);
      const d = Math.max(.001, sg.t1 - sg.t0);
      return { x, y, z, yaw: lastYaw, st, k: sg.kind, v: [dx / d, dy / d, dz / d] };
    }
    const STATES = ['run', 'air', 'slide', 'wallrun', 'vault', 'mantle', 'catch', 'hook', 'zip', 'ladder'];
    const samples = [], startLife = c.life; let minDist = Infinity, blocked = 0, hit = false, lastSample = -1, lastDetail = -1; const blockedBy = {}, blockedAt = [], zlog = [];
    window.__skyGhost.start();
    const apply = p => { c.pos.set(p.x, p.y, p.z); c.vel.set(...p.v); c.yaw = p.yaw; c.pitch = 0; c.onGround = p.st === 'run'; c.state = 'normal'; c.invuln = -1; };
    const t00 = g.GAME.t;
    for (let tick = 0; tick * dt <= total; tick++) {
      const t = tick * dt, p = pose(t); apply(p);
      g.advance(dt);
      const q = pose(t + dt); apply(q); // 物理で動いた分は台本の位置へ戻す
      c.node = g.nodeAt(c.pos.x, c.pos.y + .1, c.pos.z);
      const now = g.GAME.t - t00;
      if (now - lastSample >= .05 - 1e-6) {
        lastSample = now;
        samples.push([Math.round(g.GAME.t * 1000) / 1000, +c.pos.x.toFixed(3), +c.pos.y.toFixed(3), +c.pos.z.toFixed(3), +c.yaw.toFixed(3), 0, Math.max(0, STATES.indexOf(q.st)), Math.max(0, c.life), 0]);
        zlog.push([samples.at(-1)[0], s.Jt.map(z => [+z.pos.x.toFixed(2), +z.pos.y.toFixed(2), +z.pos.z.toFixed(2)])]);
        if (!s.oe(c.pos.x, c.pos.y + .015, c.pos.z, c.r, 1.75)) { blocked++; blockedBy[q.k || '待機'] = (blockedBy[q.k || '待機'] || 0) + 1; if (blockedAt.length < 4) blockedAt.push([q.k, +now.toFixed(2), +c.pos.x.toFixed(2), +c.pos.y.toFixed(2), +c.pos.z.toFixed(2)]); }
      }
      if (now - lastDetail >= .25 - 1e-6) { lastDetail = now; window.__skyGhost.snapshot(); } // 敵の位置を0.25秒ごとに記録させる
      for (const z of s.Jt) minDist = Math.min(minDist, Math.hypot(z.pos.x - c.pos.x, z.pos.y - c.pos.y, z.pos.z - c.pos.z));
      if (c.life < startLife) hit = true;
      if (g.GAME.over) break;
    }
    const snap = window.__skyGhost.snapshot();
    const mod = await import('/replay-data.js');
    const ghost = { v: 1, map: 'old-town', mapVersion: mod.MAP_VERSIONS['old-town'], samples, ...(snap?.detail ? { detail: snap.detail } : {}) };
    const valid = mod.validateGhost(ghost, 'old-town', total + 5);
    const end = samples.at(-1);
    return { ghost: valid ? ghost : null, zlog, valid: !!valid, hasEnemies: !!snap?.detail?.frames?.length, enemyFrames: snap?.detail?.frames?.length || 0,
      startLife, endLife: c.life, hit, minDist: +minDist.toFixed(2), blockedSamples: blocked, blockedBy, blockedAt, samples: samples.length,
      duration: +(g.GAME.t - t00).toFixed(2), end: end.slice(1, 4), target: sc.target, over: !!g.GAME.over };
  }, { sc, settings, reaction: REACTION, tail: TAIL });
}

(async () => {
  const t0 = Date.now();
  const data = await exportGame(), a = analyze(data), scenarios = pickScenarios(data, a);
  console.log(`選んだ地点 ${scenarios.length} 個:`, scenarios.map(s => `${s.id}(${s.status}) ${s.moves.filter(m => m !== '走る').join('→')}`));
  const { chromium } = require('playwright');
  const server = spawn('python3', ['-m', 'http.server', '8794', '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { if (await fetch('http://127.0.0.1:8794/').then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of fs.readdirSync(outDir)) if (/^escape-\d+\.(json|mp4)$/.test(f)) fs.rmSync(path.join(outDir, f)); // 前回の記録を残さない
  fs.writeFileSync(path.join(outDir, 'map.json'), JSON.stringify(data.nodes.map(p => p.map(v => Math.round(v * 10) / 10)))); // 上から見た動画の背景用
  const report = [];
  try {
    const context = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1280, height: 720 } });
    await context.addInitScript(() => { window.__hold = true; });
    await context.route('https://**/*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0,"ok":true}' }));
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(180000);
    await page.goto('http://127.0.0.1:8794/index.html?challengeDebug=1');
    await page.waitForFunction(() => window.__game && window.skySwing && window.skyEscapeRoutes && window.__skyGhost && document.body);
    const level = page.locator(`[data-difficulty=${difficulty}]`); await revealHomeControl(page, level); await level.click();
    await page.locator('#bStart').click();
    for (const sc of scenarios) {
      const r = await runScenario(page, sc, SETTINGS);
      const ok = r.valid && !r.hit && r.blockedSamples === 0;
      const { ghost, zlog, ...metrics } = r;
      report.push({ id: sc.id, status: sc.status, start: sc.start, target: sc.target, moves: sc.moves.join('→'), plannedMargin: sc.margin, plannedTime: sc.time, ...metrics, pass: ok });
      if (ghost) {
        const record = { id: sc.id, name: `脱出テスト ${sc.id}`, tag: sc.id, score: 0, playedAt: new Date().toISOString(), note: sc.moves.join('→'), zombies: zlog, ghost }; // zombies: 全ゾンビの位置(上から見た動画用。本編のリプレイは使わない)
        fs.writeFileSync(path.join(outDir, `${sc.id}.json`), JSON.stringify(record));
      }
      console.log(sc.id, JSON.stringify(metrics));
    }
    if (errors.length) console.log('pageerrors', errors.slice(0, 3));
  } finally { await browser.close(); server.kill(); }
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify({ difficulty, reactionSeconds: REACTION, tailSeconds: TAIL, scenarios: report }, null, 1));
  console.log('seconds', ((Date.now() - t0) / 1000).toFixed(1));
})().catch(e => { console.error(e); process.exit(1); });
