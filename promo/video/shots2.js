// Escape-run video (2026-11-26): one run across the whole map, with the skills.
(() => {
  const g = window.__game, I = window.__skyInternals, c = g.P, K = g.keys, U = I.U, T = g.debug, R = T.renderer, S = T.scene, C = T.camera;
  const SH = window.SHOTS, H = window.SH;
  SH.mapdump = { frames: 2, pre: 4, canvas: true, setup() { U.gunOn = false; H.place(0, 0, 0); for (const z of I.Jt) z.pos.set(0, -150, 0); },
    tick() { H.safe(); },
    grab(i) { H.clean(); C.fov = 12; C.updateProjectionMatrix(); C.position.set(-5, 420, -5); C.up.set(0, 0, -1); C.lookAt(-5, 0, -5); C.updateMatrixWorld(); R.clear(); R.render(S, C); return R.domElement.toDataURL('image/jpeg', .92); },
    post(i) { if (i) return null; const hm = []; for (let z = -36; z <= 26; z += 2) { const row = []; for (let x = -66; x <= 56; x += 2) row.push(Math.round(H.top(x, z, 40) * 10) / 10); hm.push(row); }
      const B = window.skyBlastBarrels.barrels.map(b => ({ id: b.id, p: b.pos ? [b.pos.x, b.pos.y, b.pos.z] : Object.keys(b) }));
      const zips = (I.$a || []).map(l => JSON.stringify(l, (k, v) => (v && v.isObject3D) ? undefined : v).slice(0, 300));
      const hooks = (I.us || []).map(h => h.pos ? [+h.pos.x.toFixed(1), +h.pos.y.toFixed(1), +h.pos.z.toFixed(1)] : Object.keys(h).join());
      const pads = (window.skyJumpPads?.pads || []).map(p => JSON.stringify(p, (k, v) => (v && v.isObject3D) ? undefined : v).slice(0, 200));
      return { hm, B, zips, hooks, pads, lad: g.LADDERS?.map(l => [l.x, l.z, l.y0, l.y1]), t: I.z.t, zkeys: Object.keys(I.z).join(), diff: document.getElementById('challengeDifficulty').value, opts: [...document.getElementById('challengeDifficulty').options].map(o => o.value) }; } };

  // ---------- helpers ----------
  const ev = (i, t) => window.__events.push([i, t, +c.pos.x.toFixed(1), +c.pos.y.toFixed(1), +c.pos.z.toFixed(1)]);
  const quiet = () => { I.z.spawnT = I.z.surgeT = 1e9; };
  const zput = list => { const live = I.Jt.filter(z => !z.dead); let k = 0;
    for (const [x, zz, yaw, y] of list) { let z = live[k++]; const yy = y ?? H.top(x, zz, 30) + .02; if (!z) { z = new I.ri(x, yy, zz); I.Jt.push(z); }
      Object.assign(z, { act: null, spawnT: 0, rise: null, stun: 0, atkT: 0, fall: null, biteHold: false, navT: 0, onGround: true, hideT: 0 }); z.pos.set(x, yy, zz); z.vel.set(0, 0, 0); z.yaw = yaw ?? 0; if (z.m?.mx) z.m.mx.update(.13 * k); }
    for (; k < live.length; k++) live[k].pos.set(0, -150, 0); };
  const calm = t => { for (const z of I.Jt) z.atkCD = Math.max(z.atkCD || 0, t); };
  const zinfo = () => I.Jt.filter(z => !z.dead && z.pos.y > -50).map(z => [+z.pos.x.toFixed(1), +z.pos.y.toFixed(1), +z.pos.z.toFixed(1), +(z.stun || 0).toFixed(1)].join('/')).join(' ');
  const P = {}, st = {};
  const info = i => i % 12 ? null : { i, p: [+c.pos.x.toFixed(1), +c.pos.y.toFixed(1), +c.pos.z.toFixed(1)], s: c.state, g: c.onGround, life: c.life, t: +I.z.t.toFixed(1), z: zinfo() };
  window.E2 = { ev, quiet, zput, calm, P, st, info };
  // FLASH: surrounded on the central roof -> flashbang -> through the stunned pack -> barrel blast up to the east block.
  SH.x_flash = { frames: 330, pre: 0, diff: 'normal',
    setup() { U.gunOn = false; quiet(); H.place(-7, -6.5, H.yawTo(1, 0), 8); zput([[1.5, -5.2, 0], [2.2, -7.6, 0], [3.4, -6.3, 0], [4.6, -4.6, 0], [-13, -6, 0], [-12.4, -8, 0], [-13.6, -4.3, 0], [-11.8, -5, 0]]); P.f = 0; P.b = 0;
      ev(0, 'barrels ' + JSON.stringify(window.skyBlastBarrels.barrels.map(b => [b.id, b.x, b.y, b.z, b.land]))); },
    tick(i) { c.life = 9; c.invuln = i < 40 ? 0 : 0; calm(1.5); const B = window.skyBlastBarrels, b = B.barrels.find(q => q.id === 'plaza-east');
      if (i < 50) { H.keys({}); c.yaw = H.yawTo(1, 0); } if (i === 34) { H.key('Digit1'); ev(i, 'flash'); } if (i === 37) H.key('Digit1', 'keyup');
      if (i >= 50 && !P.b) { const tx = i < 110 ? 2.9 : 9, tz = i < 110 ? -5.0 : -6.5; H.turn(H.yawTo(tx - c.pos.x, tz - c.pos.z), .08); if (c.pos.x > 3.5) H.turn(H.yawTo(1, 0), .08); H.keys({ KeyW: true });
        if (c.pos.x > 7 && (B.assistTarget()?.barrel === b || c.pos.x > 9.5)) { H.keys({}); B.startAuto(b); P.b = 1; ev(i, 'auto'); } } },
    post: info };
  // DECOY: cornered by the zip mast on the central roof -> decoy runs north, the pack bends after it -> zip down to the west.
  SH.x_decoy = { frames: 380, pre: 0, diff: 'normal',
    setup() { U.gunOn = false; quiet(); H.place(-7.5, 9.5, H.yawTo(1, -.2), 8); zput([[5, 7, 0], [6.2, 9.4, 0], [7, 5.6, 0], [8.2, 8, 0], [9, 10.6, 0], [10, 6.5, 0]]); P.d = 0; P.j = 0; },
    tick(i) { c.life = 9; calm(1.5);
      if (i < 40) { H.keys({}); c.yaw = H.yawTo(1, -.2); }
      else if (i < 60) { H.keys({}); H.turn(H.yawTo(0, -1), .12); }
      if (i === 60) { c.yaw = H.yawTo(0, -1); H.key('Digit2'); ev(i, 'decoy'); } if (i === 63) H.key('Digit2', 'keyup');
      if (i >= 70 && i < 100) { H.keys({}); H.turn(H.yawTo(-1, .3), .1); }
      if (i >= 100) { if (c.state === 'normal') { const tx = -10.6, tz = 12; if (c.pos.x > -8.5 && Math.abs(c.pos.z - 12) > .3) H.turn(H.yawTo(-6 - c.pos.x, 12 - c.pos.z), .1); else H.turn(H.yawTo(-1, 0), .1); } H.keys({ KeyW: true }); if (!P.j && c.pos.x < -10.6 && c.onGround) { H.jump(); P.j = 1; ev(i, 'jump'); } } },
    post: info };
  // RESCUE: boxed in on the west street -> rescue hook up to high ground.
  SH.x_rescue = { frames: 300, pre: 0, diff: 'normal',
    setup() { U.gunOn = false; quiet(); H.place(-28, -4, H.yawTo(1, 0), 0); zput([[-20, -4, 0], [-19, -3.2, 0], [-18.4, -4.6, 0], [-36, -4, 0], [-37, -3.3, 0], [-37.6, -4.7, 0], [-17.5, -3.8, 0], [-38.5, -4, 0]]); P.r = 0; window.skyRescue.reset(); },
    tick(i) { c.life = 9; calm(1.5); H.keys({}); if (i < 30) c.yaw = H.yawTo(1, 0); else if (i < 70 && !P.r) H.turn(H.yawTo(-1, 0), .12);
      if (i === 70) { const t = window.skyRescue.chooseTarget?.(); ev(i, 'target ' + JSON.stringify(t && (t.anchor || t), (k, v) => v && v.isObject3D ? undefined : v).slice(0, 200)); H.key('Digit3'); P.r = 1; } if (i === 73) H.key('Digit3', 'keyup'); },
    post: info };
  // SWING CHAIN: station 7 (west) -> big rope -> central roof.
  SH.x_chain = { frames: 420, pre: 0, diff: 'normal',
    setup() { U.gunOn = false; quiet(); zput([]); H.place(-58, 0, H.yawTo(1, 0), 3.4); P.j = 0; P.g = -1; P.rel = 0; },
    tick(i) { H.safe(); const rope = !!(window.skyRopeSwing?.active() || window.skyRopeStations?.active()); if (!rope && c.onGround) c.yaw = H.yawTo(1, 0); H.keys({ KeyW: true });
      if (rope && !P.w) { P.w = 1; ev(i, 'grab'); } if (!rope && P.w) { P.w = 0; ev(i, 'off'); } },
    post: info };


  SH.x_flash2 = { frames: 300, pre: 0, diff: 'normal',
    setup() { U.gunOn = false; quiet(); H.place(-7, -6.5, H.yawTo(1, 0), 8); zput([[-1.2, -8.6, 0], [-2.2, -4.2, 0], [0.2, -4.0, 0], [.8, -9.0, 0], [-13.6, -6, 0], [-13.2, -8.2, 0], [-14.2, -4.3, 0], [-12.8, -5, 0]]); P.f = 0; P.b = 0; },
    tick(i) { c.life = 9; calm(1.5); const B = window.skyBlastBarrels, b = B.barrels.find(q => q.id === 'plaza-east');
      if (i < 46) { H.keys({}); c.yaw = H.yawTo(1, 0); } if (i === 14) { H.key('Digit1'); ev(i, 'flash'); } if (i === 17) H.key('Digit1', 'keyup');
      if (i >= 46 && !P.b) { H.turn(H.yawTo(9 - c.pos.x, -6.5 - c.pos.z), .08); H.keys({ KeyW: true });
        if (c.pos.x > 7 && (B.assistTarget()?.barrel === b || c.pos.x > 9.5)) { H.keys({}); B.startAuto(b); P.b = 1; ev(i, 'auto'); } }
      if (P.b && c.onGround && c.pos.y > 11.5 && !P.l) { P.l = 1; ev(i, 'landed'); } },
    post: info };
  // GUN: on the east block edge, the pack climbs up from the central roof; the pistol knocks them off.
  SH.x_gun = { frames: 360, pre: 0, diff: 'normal',
    setup() { U.gunOn = true; quiet(); H.place(20.5, -5, H.yawTo(-1, 0), 12); zput([[10, -6.4, 0], [8.6, -5.2, 0], [7.4, -6.8, 0], [6, -5.6, 0], [4.6, -6.2, 0], [3, -5.4, 0], [1.6, -6.6, 0], [0, -5.8, 0]]); },
    tick(i) { c.life = 9; c.invuln = 0; c.yaw = H.yawTo(-1, 0); c.pitch = -.12; H.keys({}); },
    post: i => i % 12 ? null : { i, p: [c.pos.x, c.pos.y, c.pos.z], s: c.state, g: c.onGround, life: c.life, t: 0, z: I.Jt.filter(z => !z.dead && z.pos.y > -50).map(z => [+z.pos.x.toFixed(1), +z.pos.y.toFixed(1), +z.pos.z.toFixed(1), z.act?.kind || '', z.hp].join('/')).join(' ') + ' dead:' + I.Jt.filter(z => z.dead).length } };
  SH.x_chain2 = { frames: 520, pre: 0, diff: 'normal',
    setup() { U.gunOn = false; quiet(); zput([]); H.place(-58, 0, H.yawTo(1, 0), 3.4); P.j = 0; P.w = 0; P.n = 0; P.j2 = 0; },
    tick(i) { H.safe(); const RS = window.skyRopeStations, cur = RS.current?.(), big = !!window.skyRopeSwing?.active() && !cur; if (c.onGround) c.yaw = H.yawTo(1, 0); H.keys({ KeyW: true });
      if (!P.j && c.onGround && c.pos.x > -53.4) { H.jump(); P.j = 1; ev(i, 'jump'); }
      if (cur && !P.w) { P.w = 1; P.g = i; ev(i, 'grab' + cur.id); } if (cur && i % 10 === 0) ev(i, 'th ' + cur.th.toFixed(2) + ' w ' + cur.w.toFixed(2));
      if (cur && !P.rel && cur.th > (window.__TH ?? .5) && cur.w > 0) { H.key('Space'); P.rel = i; ev(i, 'release'); } if (P.rel && i === P.rel + 4) H.key('Space', 'keyup');
      if (P.rel && !P.j2 && c.onGround && c.pos.x + 28.4 >= 3.9) { H.key('Space'); P.j2 = i; ev(i, 'jump2'); } if (P.j2 && i === P.j2 + 4) H.key('Space', 'keyup');
      if (big && !P.g2) { P.g2 = i; ev(i, 'big'); } if (big && !P.rel2 && i - P.g2 >= 70) { H.key('Space'); P.rel2 = i; ev(i, 'release2'); } if (P.rel2 && i === P.rel2 + 4) H.key('Space', 'keyup'); },
    post: info };
  SH.x_scan = { frames: 2, pre: 2, canvas: true, diff: 'normal', setup() { quiet(); }, tick() { H.safe(); }, grab() { return H.regrab(); },
    post(i) { if (i) return null; const out = [];
      for (let x = -62; x <= 50; x += 4) for (let z = -26; z <= 18; z += 4) { const y = H.top(x, z, 3); if (Math.abs(y) > .6) continue; H.place(x, z, 0, y + .02);
        for (const [dx, dz] of [[1, 0], [0, 1]]) { zput([[x + dx * 7, z + dz * 7, 0, y], [x - dx * 7, z - dz * 7, 0, y], [x + dx * 8, z + dz * 8, 0, y], [x - dx * 8, z - dz * 8, 0, y]]); const t = window.skyRescue.chooseTarget(); if (t) out.push([x, z, dx, +t.x.toFixed(1), +t.y.toFixed(1), +t.z.toFixed(1), +t.xz.toFixed(1)]); } }
      return { out }; } };
  SH.x_clear = { frames: 420, pre: 0, diff: 'normal', setup() { U.gunOn = false; quiet(); zput([]); H.place(-4, -6.5, H.yawTo(1, 0), 8); I.z.t = 116; }, tick(i) { H.safe(); H.keys({}); }, post: i => i % 30 ? null : { i, t: I.z.t, over: I.z.over, mode: g.mode, reason: I.z.reason } };

  // =================== the escape run: real takes, cine cameras ===================
  const lerp = (a, b, u) => a + (b - a) * u, ease = u => u * u * (3 - 2 * u), cl = u => Math.max(0, Math.min(1, u));
  const mix3 = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
  const X = n => window['__' + n], V = (n, d) => X(n) ?? d;
  const F = { x: 0, y: 0, z: 0, on: false, i: 0 };
  const follow = (k = .18) => { if (!F.on) { F.x = c.pos.x; F.y = c.pos.y; F.z = c.pos.z; F.on = true; } F.x += (c.pos.x - F.x) * k; F.y += (c.pos.y - F.y) * k; F.z += (c.pos.z - F.z) * k; };
  const rec = () => ({ p: [+c.pos.x.toFixed(2), +c.pos.y.toFixed(2), +c.pos.z.toFixed(2)], s: c.state, z: I.Jt.filter(z => !z.dead && z.pos.y > -30).map(z => [+z.pos.x.toFixed(1), +z.pos.z.toFixed(1)]) });
  const run = (name, o) => { SH[name] = { canvas: true, diff: 'normal', pre: 0, ...o, setup() { F.on = false; F.i = 0; for (const k in P) delete P[k]; quiet(); o.setup(); },
    tick(i) { F.i = i; o.tick(i); follow(o.lag ?? .18); }, grab(i) { const cams = o.cams, cam = cams[Math.min(cams.length - 1, V('CAM', 0))]; return H.cine(...cam(F.i)); }, post: rec }; };
  // OPEN: from high over the whole town down to the runner on the central roof, packs closing from both ends.
  run('r_open', { frames: 110,
    setup() { U.gunOn = false; H.place(-4.5, -6.5, H.yawTo(1, 0), 8); zput([[12.6, -8.6, 0], [13.4, -4.6, 0], [12, -5.6, 0], [13.6, -7.4, 0], [-13.9, -6.2, 0], [-13.7, -8.0, 0], [-13.9, -4.6, 0], [-13.5, -5.2, 0]]); I.Jt.forEach((z, k) => { z.yaw = H.yawTo(k < 4 ? -1 : 1, 0); z.stun = k < 4 ? V('s0', 1.2) : V('s1', 2.0); }); },
    tick(i) { c.life = 9; calm(2); H.keys({}); if (i < 120) c.yaw = H.yawTo(1, 0); else if (i < 170) H.turn(H.yawTo(-1, 0), .07); else H.turn(H.yawTo(1, 0), .09); },
    cams: [i => { const u = ease(cl(i / V('T', 200))); return [mix3([V('hx', -8), V('hy', 74), V('hz', 58)], [-4.5 + V('ex', .5), V('ey', 11.6), V('ez', 1.5)], u), mix3([-6, 4, -4], [-4.2, 8.8, -6.5], u), lerp(48, 58, u)]; }] });
  // FLASH -> run through the stunned pack -> BLAST up to the east block.  CAM 0 = side tracking, 1 = low beyond the barrel.
  run('r_flash', { frames: 150,
    setup() { U.gunOn = false; H.place(-7, -6.5, H.yawTo(1, 0), 8); zput([[2.2, -8.6, 0], [1.2, -4.2, 0], [3.6, -4.0, 0], [4.2, -9.0, 0], [-15.6, -6, 0], [-15.2, -8.2, 0], [-16.2, -4.3, 0], [-14.8, -5, 0]]); },
    tick(i) { c.life = 9; calm(1.5); const B = window.skyBlastBarrels, b = B.barrels.find(q => q.id === 'plaza-east'), t0 = V('FT', 62);
      if (i < t0 + 30) { H.keys({}); c.yaw = H.yawTo(1, 0); } if (i === t0) { H.key('Digit1'); ev(i, 'flash'); } if (i === t0 + 3) H.key('Digit1', 'keyup');
      if (i >= t0 + 30 && !P.b) { H.turn(H.yawTo(9 - c.pos.x, -6.5 - c.pos.z), .08); H.keys({ KeyW: true });
        if (c.pos.x > 7 && (B.assistTarget()?.barrel === b || c.pos.x > 9.5)) { H.keys({}); B.startAuto(b); P.b = 1; ev(i, 'auto'); } }
      if (P.b && c.onGround && c.pos.y > 11.5 && !P.l) { P.l = 1; ev(i, 'landed'); } },
    cams: [i => [[F.x - V('bk', 4.1), F.y + V('up', 2.8), F.z + V('sd', 1.4)], [F.x + 4.5, F.y + .7, F.z - .2], V('fov', 60)],
           i => { for (const b of window.skyBlastBarrels.barrels) if (b.badge) b.badge.visible = false; return [[15.9, 8.25, -9.5], [lerp(11.5, F.x, .75), lerp(8.7, F.y + .9, .8), lerp(-6.5, F.z, .75)], 58]; },
           i => { const u = ease(cl(i / 120)); return [[lerp(-6.5, -5.5, u), V('sy', 13.2), V('sz', 6.5)], [lerp(-6.5, -5.5, u), 8.2, -6.6], V('sfov', 64)]; }] });
  // GUN: from the east block, the pack comes up the ramp; the pistol knocks them off into the clouds.
  run('r_gun', { frames: 130,
    setup() { U.gunOn = true; H.place(20.5, -5, H.yawTo(-1, 0), 12); zput([[16.5, -8, 0], [15.2, -7.6, 0], [14, -8.3, 0], [12.6, -6.4, 0], [11.4, -5.4, 0], [10, -6.8, 0], [8.6, -5.6, 0], [7, -6.2, 0]]); for (const z of I.Jt) z.hp = Math.min(z.hp, V('hp', 4)); },
    tick(i) { c.life = 9; c.invuln = 0; calm(2); c.yaw = H.yawTo(-1, 0); c.pitch = -.12; H.keys({}); },
    cams: [i => [[V('cx', 14.5), V('cy', 15.2), V('cz', -13)], [V('tx', 19.3), V('ty', 10.9), V('tz', -7.2)], V('fov', 40)],
           i => [[V('cx', 25.5), V('cy', 13.3), V('cz', -8.8)], [V('tx', 19.5), V('ty', 11.6), V('tz', -6.6)], V('fov', 52)]] });
  // DECOY -> ZIP.  CAM 0 = high over the roof corner, 1 = travelling beside the zip.
  run('r_decoy', { frames: 125,
    setup() { U.gunOn = false; H.place(-7.5, 9.5, H.yawTo(1, -.2), 8); zput([[5, 7, 0], [6.2, 9.4, 0], [7, 5.6, 0], [8.2, 8, 0], [9, 10.6, 0], [10, 6.5, 0], [11, 8.8, 0]]); },
    tick(i) { c.life = 9; calm(1.5); const t0 = V('DT', 34);
      if (i < t0 - 14) { H.keys({}); c.yaw = H.yawTo(1, -.2); } else if (i < t0) { H.keys({}); H.turn(H.yawTo(0, -1), .14); }
      if (i === t0) { c.yaw = H.yawTo(0, -1); H.key('Digit2'); ev(i, 'decoy'); } if (i === t0 + 3) H.key('Digit2', 'keyup');
      if (i > t0 && i < t0 + 24) { H.keys({}); H.turn(H.yawTo(-1, .6), .1); }
      if (i >= t0 + 24) { if (c.state === 'normal') { if (c.pos.x > -8.5 && Math.abs(c.pos.z - 12) > .3) H.turn(H.yawTo(-6.5 - c.pos.x, 12 - c.pos.z), .12); else H.turn(H.yawTo(-1, 0), .12); } H.keys({ KeyW: true }); if (!P.j && c.pos.x < -10.6 && c.onGround) { H.jump(); P.j = 1; ev(i, 'jump'); } }
      if (c.state === 'zip' && !P.z) { P.z = 1; ev(i, 'zip'); } },
    cams: [i => { const u = ease(cl((i - 150) / 90)); return [[V('cx', -14.5), V('cy', 12.2), V('cz', 15)], [lerp(-4.5, F.x, .3 + .55 * u), 8.6, lerp(7, F.z, .3 + .55 * u)], V('fov', 46)]; },
           i => [[F.x - 3.4, F.y + .5, F.z + 2.7], [F.x + .3, F.y + 1.0, F.z], 60]], lag: .3 });
  // RESCUE: boxed in on the low west street; the rescue hook pulls him up to high ground.
  run('r_rescue', { frames: 110,
    setup() { U.gunOn = false; H.place(-22, 1, H.yawTo(0, 1), 0); zput([[-22, 8, 0], [-21, 8.6, 0], [-23.2, 8.4, 0], [-22.2, -6, 0, 0], [-21, -5.6, 0, 0], [-23.2, -5.8, 0, 0]]); for (const z of I.Jt) z.stun = .35; window.skyRescue.reset(); },
    tick(i) { c.life = 9; calm(1.5); H.keys({}); const t0 = V('RT', 50); if (i < 18) c.yaw = H.yawTo(0, 1); else if (i < t0 && !P.r) H.turn(H.yawTo(0, -1), .16);
      if (i === t0) { const t = window.skyRescue.chooseTarget(); ev(i, 'target ' + (t ? [t.x, t.y, t.z].join() : 'none')); H.key('Digit3'); P.r = 1; } if (i === t0 + 3) H.key('Digit3', 'keyup');
      if (P.r && c.onGround && c.pos.y > 2 && !P.l) { P.l = 1; ev(i, 'landed'); } },
    cams: [i => { const u = ease(cl((i - 40) / 50)); return [[V('cx', -27.5), V('cy', 7.2), V('cz', -8.5)], [lerp(-20.5, -17, u), lerp(2.2, 5.2, u), lerp(.5, 4, u)], V('fov', 60)]; },
           i => [[V('cx', -29), V('cy', 3.2), V('cz', 5.5)], [lerp(-19, F.x, .55), lerp(3.4, F.y + 1, .6), lerp(-.5, F.z, .5)], V('fov', 62)],
           i => [[F.x + V('ax', -4.2), F.y + V('ay', 2.6), F.z + V('az', -4.6)], [F.x + 1.2, F.y + 1.3, F.z + 1.6], V('fov', 58)]], lag: .2 });
  // CHAIN: rope station 7 -> big rope -> central roof.  CAM 0 = leading, looking back; 1 = behind and above.
  run('r_chain', { frames: 175,
    setup() { U.gunOn = false; zput([]); H.place(-58, 0, H.yawTo(1, 0), 3.4); },
    tick(i) { H.safe(); const RSt = window.skyRopeStations, cur = RSt.current?.(), big = !!window.skyRopeSwing?.active() && !cur; if (c.onGround) c.yaw = H.yawTo(1, 0); H.keys({ KeyW: !P.l });
      if (!P.j && c.onGround && c.pos.x > -53.4) { H.jump(); P.j = 1; ev(i, 'jump'); }
      if (cur && !P.w) { P.w = 1; ev(i, 'grab' + cur.id); }
      if (cur && !P.rel && cur.th > .5 && cur.w > 0) { H.key('Space'); P.rel = i; ev(i, 'release'); } if (P.rel && i === P.rel + 4) H.key('Space', 'keyup');
      if (P.rel && !P.j2 && c.onGround && c.pos.x + 28.4 >= 3.9) { H.key('Space'); P.j2 = i; ev(i, 'jump2'); } if (P.j2 && i === P.j2 + 4) H.key('Space', 'keyup');
      if (big && !P.g2) { P.g2 = i; ev(i, 'big'); } if (big && !P.rel2 && i - P.g2 >= 70) { H.key('Space'); P.rel2 = i; ev(i, 'release2'); } if (P.rel2 && i === P.rel2 + 4) H.key('Space', 'keyup');
      if (P.rel2 && c.onGround && !P.l) { P.l = 1; ev(i, 'landed'); } },
    cams: [i => [[F.x + V('ax', 6), F.y + V('ay', 1.9), V('az', .9)], [F.x, F.y + 1.15, 0], V('fov', 58)],
           i => [[F.x - 5.5, F.y + 3.2, 1.2], [F.x + 2, F.y + 1.0, 0], 62]], lag: .22 });
  // CARD: the real result card of a cleared run (gameplay screen, HUD on).
  SH.r_card = { frames: 150, pre: 0, diff: 'normal',
    setup() { U.gunOn = true; quiet(); H.place(20.5, -5, H.yawTo(-1, 0), 12); zput([[13, -6.4, 0], [11.6, -5.2, 0], [10.4, -6.8, 0], [9, -5.6, 0], [7.6, -6.2, 0]]); for (const z of I.Jt) z.hp = Math.min(z.hp, 2); },
    tick(i) { c.life = 9; calm(2); c.yaw = H.yawTo(-1, 0); c.pitch = -.12; H.keys({}); if (i === 150) I.z.t = 118.6; },
    post: i => i % 15 ? null : { t: I.z.t, over: I.z.over, kills: g.stats.kills } };
  SH.hm1 = { frames: 2, pre: 2, canvas: true, setup() { quiet(); }, tick() { H.safe(); }, grab() { return H.regrab(); },
    post(i) { if (i) return null; const hm = []; for (let z = -37; z <= 27; z += .5) { const row = []; for (let x = -69; x <= 59; x += .5) row.push(Math.round(H.top(x, z, 40) * 10) / 10); hm.push(row); } return { hm }; } };
  // GUN 2 (11/26): from the east block, the pack climbs up the south face from the ramp; the hit at the lip carries them off.
  run('r_gun2', { frames: 150,
    setup() { U.gunOn = true; H.place(V('px', 20.5), V('pz', -2.4), H.yawTo(-.2, -1), 12); zput([[18.2, -5.9, 0, 12], [20.6, -6.0, 0, 12], [22.6, -5.9, 0, 12], [17.4, -8.1, 0], [19.6, -8.0, 0], [21.4, -8.0, 0], [15.6, -8.1, 0], [13.8, -8, 0]]); I.Jt.forEach((z, k) => { z.yaw = H.yawTo(0, 1); if (k < 3) z.spawnT = .25 + .35 * k; }); },
    tick(i) { c.life = 9; c.invuln = 0; calm(2); H.keys({}); c.yaw = H.yawTo(-.2, -1); c.pitch = -.2; if (i % 30 === 0) ev(i, 'fall ' + JSON.stringify(window.skyZombieFall.stats)); },
    cams: [i => { const u = ease(cl(i / 240)); return [[V('cx', 22.6) - .4 * u, V('cy', 14.3), V('cz', .6) - .6 * u], [V('tx', 19.2), V('ty', 10.6), V('tz', -7.6)], V('fov', 54)]; }] });
})();
