// Stage the leap at explicit gaps (from gap-scan) and render several cameras per gap in one browser session.
// env SPECS = JSON [{id,x,z,h,a,apex?}], CAMS = optional JSON, W/H size, OUT dir.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('fs');
const SPECS = JSON.parse(process.env.SPECS);
const CAMS = JSON.parse(process.env.CAMS || 'null');
const SLOTS = JSON.parse(process.env.SLOTS || 'null');
const out = process.env.OUT || '/home/claude/hero/v3/s'; fs.mkdirSync(out, { recursive: true });
(async () => {
  const b = await chromium.launch({ headless: true, executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('gunrun-onboarding-v1', JSON.stringify({ phase: 'complete' })); localStorage.setItem('gunrun-quality-check-v1', 'done'); } catch {} });
  await ctx.route('https://**/*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0,"ok":true}' }));
  const p = await ctx.newPage(); p.setDefaultTimeout(300000);
  p.on('pageerror', e => console.log('pageerror', e.message));
  await p.goto(`http://127.0.0.1:8899/index.html?lang=en&start_spot=north-mid&q=high${process.env.MOOD ? '&mood=' + process.env.MOOD : ''}`);
  await p.waitForFunction(() => window.skyStartReadiness?.ready && window.__game);
  await p.evaluate(() => window.__game.startGame());
  await p.waitForFunction(() => window.__game.mode === 'play');
  await p.evaluate((process_warm) => { window.__hold = true; const g = window.__game; for (let i = 0; i < (+process_warm || 60); i++) { window.__skyInternals.U.gunOn = false; g.P.invuln = 99; g.frameOnce(1 / 30); } }, process.env.WARM || 60);
  for (const spec of SPECS) {
    const r = await p.evaluate(({ spec, CAMS, SLOTS, W, H, process_hide }) => {
      const g = window.__game, c = g.P, I = window.__skyInternals, U = I.U, T = g.debug, R = T.renderer, S = T.scene, C = T.camera, dt = 1 / 30;
      const step = () => { U.gunOn = false; c.invuln = 99; c.life = 9; g.frameOnce(dt); };
      const top = (x, z, y = 40) => { const h = I.raycast(x, y, z, 0, -1, 0, 80); return h ? y - h.t : -99; };
      const { x: ex, z: ez, h: y0, a } = spec, dx = Math.sin(a), dz = Math.cos(a), rx = -dz, rz = dx, yawFor = Math.atan2(-dx, -dz);
      for (const z of I.Jt) { z.__slot = 0; }
      c.pos.set(ex - dx * 3.6, y0 + .02, ez - dz * 3.6); c.vel.set(0, 0, 0); c.onGround = true; c.state = 'normal'; c.yaw = yawFor;
      for (let i = 0; i < 2; i++) step();
      const keys = g.keys; let jumped = -1, jx = ex, jz = ez;
      const live = I.Jt.filter(z => !z.dead);
      const place = () => {
        const slots = SLOTS || [[.3, .45], [1.5, -.95], [2.7, .7], [3.8, -.3]];
        let s = 0;
        for (const z of live) {
          while (s < slots.length) {
            const [d, l, yo = 0, sc = 1] = slots[s++], x = jx - dx * d + rx * l, zz = jz - dz * d + rz * l;
            if (Math.abs(top(x, zz, y0 + 1.5) - y0) > .25) continue;
            Object.assign(z, { act: null, spawnT: 0, rise: null, stun: 0, atkT: 0, fall: null, biteHold: false, reach: true, navT: 0, onGround: true });
            z.pos.set(x - dx * 1.5, y0, zz - dz * 1.5); z.vel.set(0, 0, 0); z.yaw = yawFor + yo; z.__yo = yo; z.__sc = sc; z.__desync = .1 + .29 * s; z.__slot = s; z.__pin = [x, zz]; break;
          }
          if (s >= slots.length) break;
        }
        for (const z of live) if (!z.__slot) { z.pos.set(ex, y0 - 80, ez); z.vel.set(0, 0, 0); }
      };
      for (let i = 0; i < 80; i++) {
        c.yaw = yawFor; keys.KeyW = true; keys.ShiftLeft = true;
        if (jumped < 0 && c.onGround && top(c.pos.x + dx * .7, c.pos.z + dz * .7, y0 + 1.5) < y0 - .3) { c.jumpBuf = U.jumpBuffer || .15; jumped = i; jx = c.pos.x; jz = c.pos.z; place(); }
        step();
        if (jumped >= 0 && i - jumped >= (spec.apex || 8)) break;
      }
      keys.KeyW = false; keys.ShiftLeft = false;
      // Pin the chasers where the slots put them (their AI kept running during the leap frames), then sync the meshes.
      for (const z of I.Jt) if (z.__slot && z.__pin) { z.pos.set(z.__pin[0], y0, z.__pin[1]); z.vel.set(dx * 5, 0, dz * 5); z.yaw = yawFor; z.onGround = true; }
      // Optional: put the runner exactly where the picture wants it (spec.runner = [metres past the edge, metres up, metres sideways]).
      if (spec.runner) c.pos.set(jx + dx * spec.runner[0] + rx * (spec.runner[2] || 0), y0 + spec.runner[1], jz + dz * spec.runner[0] + rz * (spec.runner[2] || 0));
      { const pp = c.pos.clone(), pv = c.vel.clone(); g.frameOnce(1e-4); c.pos.copy(pp); c.vel.copy(pv); }
      for (const z of I.Jt) if (z.__slot && z.__pin) { z.pos.set(z.__pin[0], y0, z.__pin[1]); if (z.m?.root) { z.m.root.position.x = z.__pin[0]; z.m.root.position.z = z.__pin[1]; if (z.__yo) z.m.root.rotation.y += z.__yo; if (z.__sc && z.__sc !== 1) z.m.root.scale.multiplyScalar(z.__sc); } }
      // Screen-space effects parented to the camera (speed streaks, dust planes) and the leap's afterimage trail are not part of the scene.
      window.__camKids = C.children.map(o => [o.type, o.name, o.geometry?.type, o.material?.type, o.scale?.x?.toFixed?.(2)]);
      for (const o of C.children) if (o.geometry?.type === 'BoxGeometry') o.visible = false;
      S.traverse(o => { const gt = o.geometry?.type || '', gp = o.geometry?.parameters || {}; if (/Circle|Octahedron|Icosahedron|Dodecahedron|Tetrahedron/.test(gt) || (gt === 'CylinderGeometry' && gp.radialSegments <= 8 && gp.height < .4)) o.visible = false; }); // pickups and floating markers // a thin white bar parented to the camera
      S.traverse(o => { if (/trail|streak|speed|afterimage|whoosh|flow/i.test((o.name || '') + ' ' + (o.material?.name || ''))) o.visible = false; });
      for (const z of I.Jt) if (z.__slot && z.m?.mx) z.m.mx.update(z.__desync);
      const grid = []; for (let d = 0; d <= 3.01; d += .5) { let row = ''; for (let l = -2.5; l <= 2.51; l += .5) { const x = jx - dx * d + rx * l, zz = jz - dz * d + rz * l, f = top(x, zz, y0 + 1.5) - y0; row += Math.abs(f) <= .25 ? '.' : f > 0 ? '#' : '_'; } grid.push(d.toFixed(1) + ' ' + row); }
      const info = { camKids: window.__camKids, grid, id: spec.id, live: live.length, all: I.Jt.length, jumped, past: +(((c.pos.x - jx) * dx + (c.pos.z - jz) * dz)).toFixed(2), up: +(c.pos.y - y0).toFixed(2), state: c.state, n: I.Jt.filter(z => z.__slot).length };
      if (!window.__cleaned) {
        window.__cleaned = true;
        S.traverse(o => { if (/Rope stations|Rope swing|grapple anchor/i.test(o.name || '')) o.visible = false;
          if (o.isLine || o.isLineSegments || o.isPoints) o.visible = false;
          if (o.isMesh && o.geometry) { const gg = o.geometry; gg.boundingBox || gg.computeBoundingBox(); const bb = gg.boundingBox, sc = o.getWorldScale(o.position.clone());
            const dims = [(bb.max.x - bb.min.x) * sc.x, (bb.max.y - bb.min.y) * sc.y, (bb.max.z - bb.min.z) * sc.z].sort((a, b) => a - b);
            if (dims[0] < .09 && dims[1] < .09 && dims[2] > 3) o.visible = false; }
          const gp = o.geometry?.parameters; if (o.isMesh && o.geometry?.type === 'BoxGeometry' && gp && gp.height <= .05 && (o.material?.type === 'MeshBasicMaterial')) o.visible = false; });
        S.traverse(o => { const gp = o.geometry?.parameters || {}, gt = o.geometry?.type || '', n = (o.name || '') + ' ' + (o.material?.name || '');
          if (o.isSprite || /Torus|Ring/.test(gt) || (gt === 'BoxGeometry' && gp.width === .06) || /guide|pin|mark|label|cue|hint|arrow|beacon|pillar|ghost/i.test(n)) o.visible = false; });
        const barrels = (window.skyBlastBarrels?.barrels || []).map(b => ({ x: b.x, y: b.y || 0, z: b.z }));
        const tmp = new T.THREE.Group().position.clone();
        S.traverse(o => { if (!o.isMesh || !o.visible) return; const gg = o.geometry; if (gg) { gg.boundingBox || gg.computeBoundingBox(); gg.boundingBox.getCenter(tmp); o.localToWorld(tmp); } else o.getWorldPosition(tmp);
          if (barrels.some(b => Math.hypot(tmp.x - b.x, tmp.z - b.z) < 1 && tmp.y > b.y - .2 && tmp.y < b.y + 1.6)) o.visible = false;
          if (gg && o.material?.transparent) { const h = (gg.boundingBox.max.y - gg.boundingBox.min.y) * o.scale.y; if (h > 6) o.visible = false; } });
      }
      for (const z of I.Jt) if (z.m?.root) z.m.root.visible = !!z.__slot && !z.dead;
      { const tv = new T.THREE.Group().position.clone(), seen = []; S.traverse(o => { if (!o.isSkinnedMesh) return; let v = true; for (let q = o; q; q = q.parent) if (!q.visible) { v = false; break; } if (!v) return; o.getWorldPosition(tv); seen.push([+(((tv.x - jx) * dx + (tv.z - jz) * dz)).toFixed(1), +(((tv.x - jx) * rx + (tv.z - jz) * rz)).toFixed(1), +(tv.y - y0).toFixed(1), (o.name || '').slice(0, 14)]); }); info.skinned = seen;
        info.lead = I.Jt.filter(z => z.__slot === 1).map(z => { let hidden = []; z.m?.root?.traverse(o => { if (!o.visible) hidden.push((o.name || o.type).slice(0, 12)); }); return { dead: z.dead, act: z.act?.kind || null, rootVis: z.m?.root?.visible, inRoot: !!z.m?.root?.parent, hidden: hidden.slice(0, 6), crawl: z.crawl, hideT: z.hideT, srcKind: z.m?.src?.kind, near: z.m?.src?.nearAttached }; });
        info.slots = I.Jt.filter(z => z.__slot).map(z => [z.__slot, +(((z.pos.x - jx) * dx + (z.pos.z - jz) * dz)).toFixed(1), +(((z.pos.x - jx) * rx + (z.pos.z - jz) * rz)).toFixed(1)]); }
      R.setPixelRatio(1); R.setSize(W, H, false);
      const sg = spec.side || 1;
      const cams = CAMS || [
        { n: 'S1', f: 1.0, s: 5.5, u: .3, tf: .9, tu: 1.0, fov: 55 },
        { n: 'S2', f: 1.2, s: 8, u: -1.5, tf: .9, tu: .6, fov: 50 },
        { n: 'S3', f: -2.6, s: 2.2, u: 1.3, tf: 1.8, tu: .6, fov: 60 },
        { n: 'S4', f: 5, s: 3, u: .8, tf: 0, tu: 1.2, fov: 55 },
        { n: 'S5', f: 4.2, s: 1.5, u: -.6, tf: .8, tu: 1.3, fov: 58 },
      ];
      const shots = [];
      for (const k of cams) {
        C.fov = k.fov; C.aspect = W / H; C.updateProjectionMatrix();
        C.position.set(jx + dx * k.f + rx * k.s * sg, y0 + k.u, jz + dz * k.f + rz * k.s * sg);
        C.up.set(0, 1, 0); C.lookAt(jx + dx * k.tf + rx * (k.ts || 0) * sg, y0 + k.tu, jz + dz * k.tf + rz * (k.ts || 0) * sg);
        C.updateMatrixWorld();
        if (process_hide) { const tmpv = new T.THREE.Group().position.clone(); S.traverse(o => { if (!o.isMesh || !o.visible || !o.geometry) return; const gg = o.geometry; gg.boundingBox || gg.computeBoundingBox(); const bb = gg.boundingBox, sc = o.getWorldScale(o.position.clone());
          const wx = (bb.max.x - bb.min.x) * sc.x, wy = (bb.max.y - bb.min.y) * sc.y, wz = (bb.max.z - bb.min.z) * sc.z; if (wy < 2.2 || Math.max(wx, wz) > .5) return;
          bb.getCenter(tmpv); o.localToWorld(tmpv); if (Math.hypot(tmpv.x - C.position.x, tmpv.z - C.position.z) < 14) o.visible = false; }); }
        R.clear(); R.render(S, C);
        shots.push({ n: k.n, url: R.domElement.toDataURL('image/png') });
      }
      return { info, shots };
    }, { spec, CAMS, SLOTS, W: +(process.env.W || 960), H: +(process.env.H || 540), process_hide: !!process.env.HIDEPOLES });
    console.log(JSON.stringify(r.info));
    for (const s of r.shots) fs.writeFileSync(`${out}/${spec.id}-${s.n}.png`, Buffer.from(s.url.split(',')[1], 'base64'));
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
