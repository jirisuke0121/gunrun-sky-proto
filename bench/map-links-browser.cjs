// 中央屋上の北東の石段（map-links.js）を、実ゲームの物理で確認する。
//   node bench/map-links-browser.cjs
// 北の箱 → 石段1 → 石段2 → 石段3 → 東の塔の上 を両方向に跳び移れる／床から石段1・2には登れて石段3には登れない／
// 石段の間を走り抜けられる／追手が石段の上の人に届く（安全地帯にならない）／?links=0 で石段がない、を見る。
const path = require('node:path'), { spawn } = require('node:child_process');
const { revealHomeControl } = require('./home-controls.cjs');
const root = path.resolve(__dirname, '..'), PORT = 8811;
(async () => {
  const { chromium } = require('playwright');
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { if (await fetch(`http://127.0.0.1:${PORT}/`).then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  let failed = 0;
  const check = (name, ok, detail) => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${JSON.stringify(detail)}`); };
  const open = async (query) => {
    const context = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1280, height: 720 } });
    await context.addInitScript(() => { window.__hold = true; });
    await context.route('https://**/*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0,"ok":true}' }));
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(240000);
    await page.goto(`http://127.0.0.1:${PORT}/index.html?challengeDebug=1${query}`);
    await page.waitForFunction(() => window.__game && window.skySwing && window.skyZombieClimb && window.skyStartReadiness?.ready && window.SKY_MAP_LINKS);
    const level = page.locator('[data-difficulty=normal]').first(); await revealHomeControl(page, level); await level.click(); await page.locator('#bStart').click();
    await page.waitForFunction(() => __game.mode === 'play');
    return { context, page, errors };
  };
  try {
    const { context, page, errors } = await open('');
    const out = await page.evaluate(async () => {
      const g = __game, s = __skyInternals, c = g.P, dt = 1 / 120, L = window.SKY_MAP_LINKS, res = {};
      const key = (code, type) => dispatchEvent(new KeyboardEvent(type, { code }));
      const clear = () => { for (const z of g.zombies) { s.ue.remove(z.m.root); if (z.pool) s.ue.remove(z.pool); } g.zombies.length = 0; };
      clear(); g.SCR.off = g.PACE.off = g.MARK.off = true;
      Object.assign(g.S, { sendLog: false, gunOn: false, autoFire: false, aimAuto: false, stalkerOn: false, stalker2: false, dropShare: 0 });
      const [S1, S2, S3] = L.STEPS, B = L.BOX, T = L.TOWER;
      const boxes = s.jn.filter(b => b.mapLink);
      res.build = { built: L.built, boxes: boxes.length, tops: boxes.map(b => b.maxY), base: boxes.map(b => b.minY), marks: !!s.ue.getObjectByName('Map link marks') };
      const reset = (x, y, z, dx, dz) => {
        for (const k of Object.keys(g.keys)) g.keys[k] = false; key('Space', 'keyup'); key('KeyW', 'keyup');
        window.skySwing.reset(); window.skyDash?.reset?.(false);
        g.GAME.over = false; g.GAME.t = 0; c.life = 3; g.GAME.spawnT = g.GAME.surgeT = 1e9; g.GAME.safeT = 0; g.setMode('play');
        const yaw = Math.atan2(-dx, -dz); g.placeAt({ x, y, z, yaw });
        Object.assign(c, { jumpBuf: 0, coyote: 0, slideBuf: 0, slideCD: 0, catchCD: 0, hookPressed: false, crouchPressed: false, invuln: -1, edgeJump: false, edgeOff: null });
        for (let i = 0; i < 12; i++) g.advance(dt); return yaw;
      };
      // 走って、縁の手前 jumpBefore m で跳ぶ（null なら跳ばない）。seconds 秒後の位置を返す。
      const run = (from, dir, edge, jumpBefore, seconds) => {
        const yaw = reset(from[0], from[1], from[2], dir[0], dir[1]); key('KeyW', 'keydown');
        let jumped = false, minY = c.pos.y, ledge = 0;
        for (let i = 0; i < 120 * seconds; i++) {
          g.advance(dt); if (c.state !== 'ledge') c.yaw = yaw; else ledge++;
          const along = (c.pos.x - from[0]) * dir[0] + (c.pos.z - from[2]) * dir[1]; minY = Math.min(minY, c.pos.y);
          if (jumpBefore != null && !jumped && along >= edge - jumpBefore) { key('Space', 'keydown'); jumped = true; }
          else if (jumped && i % 3 === 0) key('Space', 'keyup');
        }
        key('KeyW', 'keyup'); key('Space', 'keyup');
        return { x: +c.pos.x.toFixed(2), y: +c.pos.y.toFixed(2), z: +c.pos.z.toFixed(2), minY: +minY.toFixed(2), ledge, ground: c.onGround };
      };
      const on = (p, y) => Math.abs(p.y - y) < .05 && p.ground;
      const links = [], east = (name, a, b, z, before) => links.push([`${name} z=${z} 手前${before}`, run([a.minX + .3, a.top, z], [1, 0], a.maxX - a.minX - .3, before, 1.6), p => on(p, b.top) && p.x > b.minX]);
      const west = (name, a, b, z, before) => links.push([`${name} z=${z} 手前${before}`, run([a.maxX - .3, a.top, z], [-1, 0], a.maxX - .3 - a.minX, before, 1.6), p => on(p, b.top) && p.x < b.maxX]);
      for (const before of [.05, .3, .8]) {
        for (const x of [S1.minX + .4, (S1.minX + S1.maxX) / 2, S1.maxX - .4]) {
          links.push([`北の箱→石段1 x=${x} 手前${before}`, run([x, B.top, B.maxZ - 4.5], [0, 1], 4.5, before, 2), p => on(p, S1.top) && p.z > S1.minZ]);
          links.push([`石段1→北の箱 x=${x} 手前${before}`, run([x, S1.top, S1.maxZ - .3], [0, -1], S1.maxZ - .3 - S1.minZ, before, 1.8), p => on(p, B.top) && p.z < B.maxZ]);
        }
        for (const z of [S1.minZ + .4, (S1.minZ + S1.maxZ) / 2, S1.maxZ - .4]) {
          east('石段1→石段2', S1, S2, z, before); east('石段2→石段3', S2, S3, z, before); west('石段3→石段2', S3, S2, z, before); west('石段2→石段1', S2, S1, z, before);
          links.push([`石段3→塔の上 z=${z} 手前${before}`, run([S3.minX + .3, S3.top, z], [1, 0], S3.maxX - S3.minX - .3, before, 2), p => on(p, T.top) && p.x > T.minX]);
          links.push([`塔の上→石段3 z=${z} 手前${before}`, run([T.minX + 4, T.top, z], [-1, 0], 4, before, 1.7), p => on(p, S3.top) && p.x < S3.maxX + .2]);
        }
      }
      res.links = links.map(([name, p, ok]) => ({ name, ...p, ok: ok(p) }));
      // 床から（南から北へ走って跳ぶ）: 石段1（2.0 m）と石段2（3.0 m）は縁をつかんで登れる。石段3（3.4 m）は登れない。
      const floor = (st, before) => run([(st.minX + st.maxX) / 2, L.ROOF, st.maxZ + 2.9], [0, -1], 2.9, before, 1.5);
      res.floor = [[S1, 1.6, true], [S2, 1.6, true], [S2, .3, false], ...[.3, 1, 1.6, 2.2, 2.8].map(b => [S3, b, false])]
        .map(([st, before, up]) => ({ step: st.id, before, up, ...floor(st, before) })).map(p => ({ ...p, ok: p.up ? on(p, L.STEPS.find(t => t.id === p.step).top) : p.y < L.ROOF + 1.4 }));
      // 石段の間（2 m）を南北に走り抜けられる。
      res.gaps = [[S1, S2], [S2, S3]].map(([a, b]) => ({ x: (a.maxX + b.minX) / 2, ...run([(a.maxX + b.minX) / 2, L.ROOF, a.maxZ + 2.5], [0, -1], 99, null, 1.05) }))
        .map(p => ({ ...p, ok: p.z < S1.minZ && p.minY > L.ROOF - .05 }));
      // 追手: 石段の上で止まっている人に、屋上・塔の上・溝の底から届く。
      // 乱数は固定（追手の跳び移りは、難易度によって時々届かずに落ちる。落ちた回は回り込みで長くかかる）
      const chase = (pp, ep) => {
        let seed = 20261122; Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
        g.startGame(); clear(); g.GAME.spawnT = g.GAME.surgeT = 1e9; g.SCR.off = g.PACE.off = g.MARK.off = true; g.STALK.spawned = true;
        Object.assign(g.S, { sendLog: false, autoFire: false, aimAuto: false, stalkerOn: false });
        c.pos.set(pp[0], pp[1] + .003, pp[2]); c.vel.set(0, 0, 0);
        Object.assign(c, { onGround: true, state: 'normal', h: 1.75, invuln: 0, ledge: null, ladder: null, hook: null, zip: null }); c.lastGround.copy(c.pos); c.safe.copy(c.pos);
        c.node = g.nodeAt(c.pos.x, c.pos.y + .1, c.pos.z); g.updateField();
        const e = new g.Zombie(ep[0], ep[1] + .003, ep[2]); Object.assign(e, { spawnT: 0, onGround: true, flank: false, dropper: false, stalker: false, pz: false, speedMul: 1 }); g.zombies.push(e);
        const life = c.life; let hit = null;
        for (let i = 0; i < 20 * 60 && !g.GAME.over; i++) { g.advance(1 / 60); if (c.life < life) { hit = +g.GAME.t.toFixed(1); break; } }
        return { player: pp, zombie: ep, hit };
      };
      res.chase = [];
      for (const st of L.STEPS) for (const from of [[5, 8, -13], [8, 8, 8], [-10, 8, -4], [25, 12, -4], [0, 6.2, 2.5]])
        res.chase.push({ step: st.id, ...chase([(st.minX + st.maxX) / 2, st.top, (st.minZ + st.maxZ) / 2], from) });
      // 経路の網: 石段の上に点があり、入ってくる線がある
      const N = g.NAV.nodes;
      res.nav = L.STEPS.map(st => { const ids = new Set(); N.forEach((n, i) => { if (Math.abs(n.y - st.top) < .05 && n.x > st.minX && n.x < st.maxX && n.z > st.minZ && n.z < st.maxZ) ids.add(i); });
        let into = 0; for (const e of g.NAV.E) if (e && ids.has(e.to) && !ids.has(e.from)) into++; return { step: st.id, nodes: ids.size, into, ok: ids.size > 0 && into > 0 }; });
      return res;
    });
    check('石段3つと目印がある', out.build.built && out.build.boxes === 3 && out.build.tops.join() === '10,11,11.4' && out.build.base.every(y => y === 8) && out.build.marks, out.build);
    for (const j of out.links) check(j.name, j.ok, j);
    for (const p of out.floor) check(`床から ${p.step}: 縁の${p.before} m手前で跳ぶと${p.up ? '登れる' : '登れない'}`, p.ok, p);
    for (const p of out.gaps) check(`石段の間を走り抜けられる x=${p.x}`, p.ok, p);
    for (const r of out.chase) check(`追手が ${r.step} の上の人に届く（20秒以内）`, r.hit !== null, r);
    for (const n of out.nav) check(`経路の網に ${n.step} の点と入口がある`, n.ok, n);
    check('ページのエラーなし', errors.length === 0, errors.slice(0, 3));
    await context.close();
    const off = await open('&links=0');
    const none = await off.page.evaluate(() => ({ off: window.SKY_MAP_LINKS.off, boxes: __skyInternals.jn.filter(b => b.mapLink).length, marks: !!__skyInternals.ue.getObjectByName('Map link marks') }));
    check('?links=0 で石段がない', none.off && none.boxes === 0 && !none.marks, none);
    await off.context.close();
  } finally { await browser.close(); server.kill(); }
  if (failed) { console.error(`${failed} 件失敗`); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
