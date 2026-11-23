// フック・ジップライン・ロープスイングで、人がロープ／滑車を掴む。窓破りは頭から飛び込む姿勢（human-view.js、2026-11-24）。
//  フック：専用の姿勢になる・ロープは手から出る（カメラからではない）・手はロープの線上・`?gripPose=0` で前の跳びの姿勢に戻る。
//  ジップライン：専用の姿勢になる・両手が滑車の下に届く（誤差 6cm 以内）。
//  立ち止まると呼吸と重心の揺れが出る（`?bodyFeel=0` で出ない）。ゲーム上の位置は変えない。ページのエラー0。
const assert = require('node:assert/strict'), { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const port = Number(process.env.SKY_TEST_PORT || 18818), base = `http://127.0.0.1:${port}/`;
(async () => {
  let browser, server;
  try {
    server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { stdio: 'ignore' });
    for (let i = 0; i < 60; i++) { if (await fetch(base).then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const run = async query => {
      const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
      await ctx.addInitScript(() => { window.__hold = true; try { localStorage.setItem('gunrun-onboarding-v1', JSON.stringify({ phase: 'complete', firstRunGuide: 'done' })); localStorage.setItem('gunrun-quality-check-v1', 'done'); } catch {} });
      await ctx.route('https://**/*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0,"ok":true}' }));
      const p = await ctx.newPage(), errors = []; p.setDefaultTimeout(180000); p.on('pageerror', e => errors.push(e.message));
      await p.goto(base + 'index.html?lang=ja' + query);
      await p.waitForFunction(() => window.skyStartReadiness?.ready && window.__game && window.skyHumanView);
      const result = await p.evaluate(async () => {
        const g = window.__game, I = window.__skyInternals, c = g.P, K = g.keys, data = document.body.dataset;
        g.S.sendLog = false; g.startGame();
        const quiet = () => { g.GAME.spawnT = g.GAME.surgeT = 1e9; for (const z of I.Jt) z.pos.set(0, -150, 0); c.invuln = 99; c.life = 9; };
        const step = () => { quiet(); g.frameOnce(1 / 60); };
        const place = (x, y, z, yaw) => { g.placeAt({ x, y, z, yaw }); c.pos.set(x, y, z); c.vel.set(0, 0, 0); c.yaw = yaw; c.pitch = .12; c.onGround = true; c.state = 'normal'; for (const k in K) K[k] = false; };
        const out = {};
        for (let i = 0; i < 20; i++) step();
        // standing still
        place(33.6, 12.02, -3.7, Math.atan2(-1, 0)); const sways = [];
        for (let i = 0; i < 150; i++) { step(); if (i > 60) sways.push(JSON.parse(data.skyHumanBodyFeel || '{}')); }
        out.idle = { clip: data.skyHumanClip, sway: Math.max(...sways.map(s => Math.abs(s.sway || 0))), breath: Math.max(...sways.map(s => s.tall || 1)) - Math.min(...sways.map(s => s.tall || 1)) };
        // hook: east block roof to the east tower
        place(29, 12.02, -4, Math.atan2(-1, 0)); let hooked = 0, start = null;
        for (let i = 0; i < 140 && hooked < 8; i++) {
          K.KeyW = c.state === 'normal'; if (c.state === 'normal') c.yaw = Math.atan2(-1, 0);
          if (i > 14 && c.state === 'normal' && !start) { const t = I.hookAssist().target(); if (t) { c.hookPick = t; c.hookPressed = true; start = i; } }
          step(); if (c.state === 'hook') hooked++;
        }
        if (hooked) {
          const rope = data.skyHookRope ? JSON.parse(data.skyHookRope) : null, cam = I.Se.position;
          const hand = rope?.from, toAnchor = hand && [c.hook[0] - hand[0], c.hook[1] - hand[1], c.hook[2] - hand[2]];
          let ropeMesh = null; I.ue.traverse(o => { if (o.name === 'Hook rope') ropeMesh = o.visible; });
          out.hook = { clip: data.skyHumanClip, rope, ropeMesh, gripError: +data.skyHumanGripError, handFromBody: hand && Math.hypot(hand[0] - c.pos.x, hand[1] - (c.pos.y + 1.2), hand[2] - c.pos.z),
            handFromCamera: hand && Math.hypot(hand[0] - cam.x, hand[1] - cam.y, hand[2] - cam.z), ropeLength: toAnchor && Math.hypot(...toAnchor), playerToAnchor: Math.hypot(c.hook[0] - c.pos.x, c.hook[1] - c.pos.y - 1.2, c.hook[2] - c.pos.z) };
        } else out.hook = { clip: data.skyHumanClip, state: c.state, missed: true };
        // zipline: central roof down to the west
        place(-6, 8.02, 12, Math.atan2(1, 0)); let zipped = 0, jumped = false;
        for (let i = 0; i < 200 && zipped < 30; i++) {
          K.KeyW = true; if (c.state === 'normal') c.yaw = Math.atan2(1, 0);
          if (!jumped && c.pos.x < -10.6 && c.onGround) { c.jumpBuf = .15; jumped = true; }
          step(); if (c.state === 'zip') zipped++;
        }
        let holder = null; I.ue.traverse(o => { if (o.name === 'Unity challenge human') holder = o; });
        out.zip = zipped ? { clip: data.skyHumanClip, gripError: +data.skyHumanGripError, drop: +(c.pos.y - holder.position.y).toFixed(3) } : { clip: data.skyHumanClip, state: c.state, missed: true };
        // the big swing rope: west pad -> central roof
        const press = type => { for (const t of [window, document]) t.dispatchEvent(new KeyboardEvent(type, { code: 'Space', key: ' ', bubbles: true })); };
        place(-28.4, 6.42, .1, Math.atan2(-1, 0)); let riding = 0, pressedAt = -1; out.rope = { missed: true };
        for (let i = 0; i < 200 && riding < 14; i++) {
          K.KeyW = true; if (!window.skyRopeSwing?.active?.()) c.yaw = Math.atan2(-1, 0);
          if (pressedAt < 0 && c.pos.x + 28.4 >= 3.9 && c.onGround) { press('keydown'); pressedAt = i; } if (pressedAt >= 0 && i === pressedAt + 4) press('keyup');
          step(); if (window.skyRopeSwing?.active?.()) { riding++; if (riding === 12) out.rope = { clip: data.skyHumanClip, gripError: +data.skyHumanGripError }; }
        }
        window.skyRopeSwing?.cancel?.();
        // the window dive
        window.skyWindowDive?.restore?.(); place(-20.3, 4.22, -12, Math.atan2(-1, 0)); let jumpedDive = false; out.dive = { seen: 0, broke: false };
        for (let i = 0; i < 120; i++) {
          K.KeyW = true; c.yaw = Math.atan2(-1, 0);
          if (!jumpedDive && c.pos.x + 20.3 >= 2.3 && c.onGround) { c.jumpBuf = .15; jumpedDive = true; }
          step(); if (data.skyHumanClip === 'dive') out.dive.seen++; if (window.skyWindowDive?.broken?.()) out.dive.broke = true;
        }
        return out;
      });
      await ctx.close(); return { ...result, errors };
    };
    const on = await run('');
    assert.deepEqual(on.errors, [], 'no page errors');
    assert.equal(on.idle.clip, 'idle'); assert.ok(on.idle.sway > .008 && on.idle.breath > .004, 'standing still: weight shift and breathing ' + JSON.stringify(on.idle));
    assert.ok(!on.hook.missed, 'the hook fired ' + JSON.stringify(on.hook));
    assert.equal(on.hook.clip, 'hook'); assert.equal(on.hook.ropeMesh, true, 'the rope mesh is drawn');
    assert.ok(on.hook.handFromBody < 1.3, 'the rope starts at the hand, within arm\'s reach of the chest: ' + on.hook.handFromBody.toFixed(2) + ' m');
    assert.ok(on.hook.handFromCamera > 1.5, 'the rope does not start at the camera: ' + on.hook.handFromCamera.toFixed(2) + ' m');
    assert.ok(on.hook.ropeLength < on.hook.playerToAnchor, 'the hand is on the way to the anchor');
    assert.ok(on.hook.gripError < .06, 'hook: hands reach their place on the rope ' + on.hook.gripError);
    assert.ok(!on.zip.missed, 'the zipline was taken ' + JSON.stringify(on.zip));
    assert.equal(on.zip.clip, 'zip'); assert.ok(on.zip.gripError < .06, 'zip: hands reach the trolley ' + on.zip.gripError); assert.ok(on.zip.drop > .2 && on.zip.drop < .45, 'zip: the body hangs lower ' + on.zip.drop);
    assert.ok(!on.rope.missed, 'the swing rope was caught ' + JSON.stringify(on.rope));
    assert.equal(on.rope.clip, 'rope'); assert.ok(on.rope.gripError < .08, 'rope: hands reach the rope ' + on.rope.gripError);
    assert.ok(on.dive.broke && on.dive.seen >= 6, 'window dive: the dive pose is held through the glass ' + JSON.stringify(on.dive));
    const off = await run('&gripPose=0&bodyFeel=0');
    assert.deepEqual(off.errors, [], 'off: no page errors');
    assert.equal(off.hook.clip, 'jump'); assert.equal(off.hook.ropeMesh ?? false, false); assert.equal(off.zip.clip, 'jump');
    assert.equal(off.dive.seen, 0, 'gripPose=0: no dive pose'); assert.notEqual(off.rope.clip, 'rope');
    assert.ok(off.idle.sway < .0005 && off.idle.breath < .0005, 'bodyFeel=0: no sway');
    console.log(`PASS grips: rope grip error ${on.rope.gripError}, dive pose ${on.dive.seen} frames; hook hand ${on.hook.handFromBody.toFixed(2)} m from the chest (camera ${on.hook.handFromCamera.toFixed(2)} m), grip error ${on.hook.gripError}; zip grip error ${on.zip.gripError}, hang ${on.zip.drop} m; idle sway ${on.idle.sway.toFixed(3)} rad, breath ${(on.idle.breath * 100).toFixed(1)}%; off switches restore the old poses`);
  } finally { await browser?.close(); server?.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
