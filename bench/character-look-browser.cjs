// 人とゾンビの見た目（character-look.js）：既定で入る／`?chars=plain` で全部外れる／ゾンビの頭が人を追う／影のない端末では足元に影／輪郭線はPCだけ（タッチ端末では作らない、
// `?charOutline=1` で強制）／ゾンビごとに違う見た目になる／重なった2体は描画だけずれる（ゲーム上の位置は動かない）／
// ゲームの乱数（Math.random）を使わない。両マップ。ページのエラー0。
const assert = require('node:assert/strict'), { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const port = Number(process.env.SKY_TEST_PORT || 18817), base = `http://127.0.0.1:${port}/`;
(async () => {
  let browser, server;
  try {
    server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { stdio: 'ignore' });
    for (let i = 0; i < 60; i++) { if (await fetch(base).then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const run = async (map, query, touch) => {
      const ctx = await browser.newContext({ viewport: touch ? { width: 844, height: 390 } : { width: 960, height: 540 }, hasTouch: touch, isMobile: touch });
      await ctx.addInitScript(() => { try { localStorage.setItem('gunrun-onboarding-v1', JSON.stringify({ phase: 'complete', firstRunGuide: 'done' })); localStorage.setItem('gunrun-quality-check-v1', 'done'); } catch {} });
      await ctx.route('https://**/*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0,"ok":true}' }));
      const p = await ctx.newPage(), errors = []; p.setDefaultTimeout(180000); p.on('pageerror', e => errors.push(e.message));
      await p.goto(base + map + '?lang=ja' + query);
      await p.waitForFunction(() => window.skyStartReadiness?.ready && window.__game);
      const result = await p.evaluate(async () => {
        const g = window.__game, I = window.__skyInternals, c = g.P;
        const select = document.getElementById('challengeDifficulty'); select.value = 'hard'; select.dispatchEvent(new Event('change', { bubbles: true }));
        g.S.sendLog = false; g.startGame();
        const frame = () => new Promise(r => requestAnimationFrame(r));
        // Two bodies on the same spot next to the player, kept there: the picture should part them, the game should not.
        let pair = null, used = 0;
        for (let k = 0; k < 400; k++) {
          c.invuln = 99; c.life = 9; g.GAME.spawnT = g.GAME.surgeT = 1e9;
          const live = I.Jt.filter(z => !z.dead && z.m?.meshy && z.m.root);
          if (live.length >= 2) {
            pair = live.slice(0, 2); const [fx, fz] = [-Math.sin(c.yaw), -Math.cos(c.yaw)];
            for (const z of pair) { z.pos.set(c.pos.x + fx * 4, c.pos.y, c.pos.z + fz * 4); z.vel.set(0, 0, 0); z.spawnT = 0; z.rise = null; z.fall = null; z.atkCD = 9; z.stun = 9; }
            if (++used > 60) break;
          }
          await frame();
        }
        if (!pair) return { pair: false, look: window.skyCharacterLook || null };
        // On a bullet hit the game swaps in its own copy of each material (enhancements.js flashZombie); the copy must get the look back.
        let redress = true;
        if (window.skyCharacterLook?.enabled) {
          const body = pair[0].m; for (const mesh of body.skyMeshes) mesh.material = mesh.material.clone();
          const before = body.skyMeshes.every(mesh => !window.skyCharacterLook.styled(mesh.material)); await frame(); await frame();
          redress = before && body.skyMeshes.length > 0 && body.skyMeshes.every(mesh => window.skyCharacterLook.styled(mesh.material));
        }
        const [a, b] = pair, hulls = z => { let n = 0; z.m.root.traverse(o => { if (o.userData?.skyInkHull) n++; }); return n; };
        const materials = new Set(); for (const z of I.Jt) z.m?.root?.traverse(o => { if (o.isSkinnedMesh && !o.userData?.skyInkHull) materials.add(o.material.uuid); });
        return { pair: true, look: window.skyCharacterLook ? { enabled: window.skyCharacterLook.enabled, stats: window.skyCharacterLook.stats, outline: window.skyCharacterLook.outline?.() } : null,
          gameGap: Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z),
          // What is drawn: the matrix the renderer used this frame (not just the position, which the game resets every step).
          drawnGap: Math.hypot(a.m.root.matrixWorld.elements[12] - b.m.root.matrixWorld.elements[12], a.m.root.matrixWorld.elements[14] - b.m.root.matrixWorld.elements[14]),
          life: !!a.m.skyLife, headTurned: !!a.m.skyBones?.head?.userData.skyOut && !a.m.skyBones.head.userData.skyOut.equals(a.m.skyBones.head.userData.skyBase),
          foot: (() => { let v = null; I.ue.traverse(o => { if (o.name === 'Foot shadows') v = o.visible; }); return v; })(), shadowMap: g.debug.renderer.shadowMap.enabled,
          hulls: hulls(a) + hulls(b), materials: materials.size, redress, bodies: I.Jt.filter(z => z.m?.meshy).length, touch: document.documentElement.classList.contains('touch') };
      });
      // The game's own random numbers are not consumed by the look: drawing frames between two seeded draws leaves the sequence alone.
      const random = await p.evaluate(async () => {
        let s = 4242; const seeded = () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
        const hook = window.__skyInternals.ue.onBeforeRender, real = Math.random; let calls = 0; Math.random = () => { calls++; return seeded(); };
        const R = window.__game.debug.renderer; try { for (let k = 0; k < 5; k++) hook?.call(window.__skyInternals.ue, R, window.__skyInternals.ue, window.__skyInternals.Se, null); } finally { Math.random = real; }
        return calls;
      });
      await ctx.close();
      return { ...result, random, errors };
    };
    for (const map of ['index.html', 'canyon.html']) {
      const pc = await run(map, '', false);
      assert.deepEqual(pc.errors, [], map + ' pc: no page errors');
      assert.ok(pc.pair, map + ' pc: two zombies appeared');
      assert.equal(pc.look.enabled, true); assert.equal(pc.look.outline, true, 'outline is on for a mouse and keyboard');
      assert.ok(pc.hulls >= 2, map + ' pc: each body has its ink hull ' + pc.hulls);
      assert.ok(pc.look.stats.dressed >= 2 && pc.look.stats.styled >= 1, map + ' pc: bodies were dressed ' + JSON.stringify(pc.look.stats));
      assert.ok(pc.gameGap < .01, map + ' pc: the game keeps both on the same spot ' + pc.gameGap);
      assert.ok(pc.drawnGap > .2 && pc.drawnGap < .7, map + ' pc: the picture parts them ' + pc.drawnGap.toFixed(3));
      assert.equal(pc.random, 0, map + ' pc: the look takes no number from the game\'s Math.random');
      assert.ok(pc.life && pc.headTurned, map + ' pc: zombies carry their own pose on top of the clip (head turned to the runner)');
      assert.equal(pc.redress, true, map + ' pc: a material copied by the hit flash gets the look back');
      const phone = await run(map, '', true);
      assert.deepEqual(phone.errors, [], map + ' phone: no page errors');
      assert.ok(phone.pair && phone.touch, map + ' phone: touch run');
      assert.equal(phone.look.outline, false, 'outline stays off on touch devices'); assert.equal(phone.hulls, 0, map + ' phone: no ink hull is built');
      assert.ok(phone.look.stats.dressed >= 2, map + ' phone: bodies still get their look');
      if (!phone.shadowMap) assert.equal(phone.foot, true, map + ' phone: foot shadows are drawn where the device draws no shadows');
      if (pc.shadowMap) assert.ok(!pc.foot, map + ' pc: no foot shadows where real shadows are drawn');
      const forced = await run(map, '&charOutline=1', true);
      assert.ok(forced.hulls >= 2, map + ' phone with ?charOutline=1: hulls ' + forced.hulls);
      const plain = await run(map, '&chars=plain', false);
      assert.deepEqual(plain.errors, [], map + ' plain: no page errors');
      assert.equal(plain.look.enabled, false); assert.equal(plain.hulls, 0); assert.ok(plain.drawnGap < .01, map + ' plain: nothing is moved');
      assert.ok(!plain.life && !plain.foot, map + ' plain: no bone turns, no foot shadows');
      console.log(`PASS ${map}: pc hulls ${pc.hulls}, drawn gap ${pc.drawnGap.toFixed(2)} m (game ${pc.gameGap.toFixed(3)}), materials ${pc.materials}; phone hulls ${phone.hulls}; ?charOutline=1 ${forced.hulls}; ?chars=plain off`);
    }
  } finally { await browser?.close(); server?.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
