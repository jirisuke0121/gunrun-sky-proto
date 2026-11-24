// Page-side shot scripts. Each: { frames, pre (warm-up frames not saved), diff, canvas (cinematic: grab(i) returns a data URL),
// setup(), tick(i) (60 Hz step index; negative during pre), post(i) (after each saved frame) }
(() => {
  const g = window.__game, I = window.__skyInternals, c = g.P, K = g.keys, U = I.U, T = g.debug, R = T.renderer, S = T.scene, C = T.camera;
  const SH = window.SHOTS = {};
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const H = window.SH = {
    top(x, z, y = 40) { const h = I.raycast(x, y, z, 0, -1, 0, 90); return h ? y - h.t : -99; },
    yawTo: (dx, dz) => Math.atan2(-dx, -dz), fwd: yaw => [-Math.sin(yaw), -Math.cos(yaw)],
    place(x, z, yaw, y) { const yy = y ?? H.top(x, z) + .02; try { g.placeAt({ x, y: yy, z, yaw }); } catch {} c.pos.set(x, yy, z); c.vel.set(0, 0, 0); c.yaw = yaw; c.pitch = 0; c.onGround = true; c.state = 'normal'; c.lastGround?.copy(c.pos); c.safe?.copy(c.pos); },
    keys(o = {}) { for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'Space', 'KeyC', 'KeyE', 'KeyQ']) K[k] = !!o[k]; },
    turn(target, rate = .06) { const d = wrap(target - c.yaw); c.yaw += Math.max(-rate, Math.min(rate, d)); },
    safe(inv = true) { if (inv) c.invuln = 99; c.life = Math.max(c.life || 0, 5); },
    jump() { c.jumpBuf = U.jumpBuffer || .15; },
    // Put n chasers behind the player: [metres behind, metres sideways] slots, on the roof the player stands on.
    pack(slots, y) { const [fx, fz] = H.fwd(c.yaw), rx = -fz, rz = fx, yy = y ?? c.pos.y; let k = 0; const live = I.Jt.filter(z => !z.dead);
      for (const [d, l] of slots) { const x = c.pos.x - fx * d + rx * l, zz = c.pos.z - fz * d + rz * l; if (Math.abs(H.top(x, zz, yy + 1.5) - yy) > .3) continue; let z = live[k++];
        if (!z) { z = new g.Zombie(x, yy, zz); g.zombies.push(z); }
        Object.assign(z, { act: null, spawnT: 0, rise: null, stun: 0, atkT: 0, fall: null, biteHold: false, navT: 0, onGround: true, hideT: 0 }); z.pos.set(x, yy, zz); z.vel.set(fx * 5, 0, fz * 5); z.yaw = c.yaw; if (z.m?.mx) z.m.mx.update(.13 * k); if (z.m?.root && !z.m.root.userData.__v) { z.m.root.userData.__v = 1; z.m.root.scale.multiplyScalar([1, 1.07, .95, 1.03, .92, 1.05, .98, 1.08][k % 8]); } }
      for (; k < live.length; k++) { live[k].pos.set(0, -150, 0); } },
    // Follow waypoints: [{x,z,jump}] — steer, sprint, jump where the ground drops ahead (or at a waypoint flagged jump).
    drive(st, opts = {}) { const wp = st.path[st.k]; if (!wp) { H.keys({}); return true; }
      const dx = wp.x - c.pos.x, dz = wp.z - c.pos.z, dist = Math.hypot(dx, dz);
      H.turn(H.yawTo(dx, dz), opts.rate || .07); H.keys({ KeyW: true });
      const [fx, fz] = H.fwd(c.yaw);
      if (c.onGround && c.state === 'normal' && opts.gap !== false && H.top(c.pos.x + fx * .75, c.pos.z + fz * .75, c.pos.y + 1.2) < c.pos.y - .7) H.jump();
      if (dist < (wp.r || 1.1)) { if (wp.jump) H.jump(); wp.do?.(); st.k++; } return false; },
    clean() { for (const o of C.children) if (o.geometry?.type !== 'SphereGeometry') o.visible = false; },
    pose(pos, look, fov = 50) { if (H.aspect) { C.aspect = H.aspect; fov = H.wide(fov, 1.5); } C.fov = fov; C.updateProjectionMatrix(); C.position.set(...pos); C.up.set(0, 1, 0); C.rotation.set(0, 0, 0); C.lookAt(...look); C.updateMatrixWorld(); C.matrixWorldInverse.copy(C.matrixWorld).invert(); },
    key(code, type = 'keydown') { window.dispatchEvent(new KeyboardEvent(type, { code, key: code === 'Space' ? ' ' : code, bubbles: true })); document.dispatchEvent(new KeyboardEvent(type, { code, key: code === 'Space' ? ' ' : code, bubbles: true })); },
    portrait(w, h) { H.aspect = w / h; R.setPixelRatio(1); R.setSize(w, h, false); C.aspect = H.aspect; C.updateProjectionMatrix(); },
    wide(fov, k) { return H.aspect ? 2 * Math.atan(Math.tan(fov * Math.PI / 360) * k) * 180 / Math.PI : fov; },
    regrab() { if (H.aspect) { C.aspect = H.aspect; const f0 = C.fov; C.fov = H.wide(f0, 1.25); C.updateProjectionMatrix(); R.clear(); R.render(S, C); C.fov = f0; C.updateProjectionMatrix(); } else { R.clear(); R.render(S, C); } return R.domElement.toDataURL('image/jpeg', .92); },
    cine(pos, look, fov = 50) { H.clean(); if (H.aspect) { C.aspect = H.aspect; fov = H.wide(fov, 1.5); } for (const o of S.children) if (/^(DASH pickups|JUMP item drops|Parkour weapon supplies)/.test(o.name || '')) o.visible = false; if (!H._t) { H._t = []; S.traverse(o => { if ((o.isMesh && /Torus/.test(o.geometry?.type || '')) || /grapple anchor/i.test(o.name || '')) H._t.push(o); }); } { const v = new C.position.constructor(); for (const o of H._t) { o.getWorldPosition(v); const near = Math.hypot(v.x - pos[0], v.y - pos[1], v.z - pos[2]) < 7; if (near) o.visible = false; else if (o.userData.__cineHidden) o.visible = true; o.userData.__cineHidden = near; } } C.fov = fov; C.updateProjectionMatrix(); C.position.set(...pos); C.up.set(0, 1, 0); C.rotation.set(0, 0, 0); C.lookAt(...look); C.updateMatrixWorld(); R.clear(); R.render(S, C); return R.domElement.toDataURL('image/jpeg', .92); },
    info() { return { p: [+c.pos.x.toFixed(1), +c.pos.y.toFixed(1), +c.pos.z.toFixed(1)], s: c.state, g: c.onGround, v: +Math.hypot(c.vel.x, c.vel.z).toFixed(1), z: I.Jt.filter(z => !z.dead && z.pos.y > -50).map(z => [+(z.pos.x - c.pos.x).toFixed(1), +(z.pos.y - c.pos.y).toFixed(1), +(z.pos.z - c.pos.z).toFixed(1), z.m?.root?.visible ? 1 : 0, z.act?.kind || z.state || '', +(z.spawnT || 0).toFixed(1)].join('/')) }; },
  };
  // --- test: reverse chase along the east roof (y 12) ---
  const st = {};
  SH.chase_rev = { frames: 75, pre: 20, canvas: true,
    setup() { U.gunOn = false; H.place(18, -3.7, H.yawTo(1, 0)); H.pack([[4, 0], [5.2, 1.1], [6, -1.2], [7.5, .4], [8.5, -.6], [9.5, 1.4]]); st.path = [{ x: 34.5, z: -3.7 }, { x: 60, z: -3.7 }]; st.k = 0; },
    tick(i) { H.safe(); H.drive(st); },
    grab(i) { const [fx, fz] = H.fwd(c.yaw); return H.cine([c.pos.x + fx * 4.6 - fz * 1.6, c.pos.y + 1.1, c.pos.z + fz * 4.6 + fx * 1.6], [c.pos.x - fx * 1.5, c.pos.y + 1.25, c.pos.z - fz * 1.5], 58); },
    post(i) { return i % 15 ? null : H.info(); } };
  SH.chase_game = { frames: 75, pre: 20,
    setup() { U.gunOn = false; H.place(18, -3.7, H.yawTo(1, 0)); H.pack([[4, 0], [5.2, 1.1], [6, -1.2], [7.5, .4]]); st.path = [{ x: 34.5, z: -3.7 }, { x: 60, z: -3.7 }]; st.k = 0; },
    tick(i) { H.safe(); H.drive(st); }, post(i) { return i % 15 ? null : H.info(); } };
  const VIEWS = [[[30, 45, 40], [30, 8, -8]], [[70, 40, 10], [35, 8, -8]], [[0, 45, 35], [0, 6, -5]], [[-30, 45, 40], [-30, 5, 2]], [[-80, 40, 20], [-45, 6, 2]], [[20, 40, -55], [20, 6, -10]], [[-30, 40, -50], [-30, 5, -5]], [[52, 22, -30], [44, 12, -8]]];
  SH.overview = { frames: VIEWS.length, pre: 5, canvas: true, setup() { U.gunOn = false; H.place(0, 0, 0); for (const z of I.Jt) z.pos.set(0, -150, 0); }, tick() { H.safe(); }, grab(i) { return H.cine(VIEWS[i][0], VIEWS[i][1], 50); } };
  // ---------- trials (gameplay camera) ----------
  const ev = (i, t) => window.__events.push([i, t, +c.pos.x.toFixed(1), +c.pos.y.toFixed(1), +c.pos.z.toFixed(1)]);
  let last = '', lastRope = false;
  const watch = i => { const rope = !!(window.skyRopeSwing?.active() || window.skyRopeStations?.active()); const s = c.state + (rope ? '+rope' : '') + (c.onGround ? '' : '~'); if (s !== last) { ev(i, s); last = s; } };
  const noSpawn = () => { g.GAME.spawnT = g.GAME.surgeT = 1e9; for (const z of I.Jt) z.pos.set(0, -150, 0); };
  const trial = (name, frames, setup, tick, extra = {}) => { SH[name] = { frames, pre: extra.pre ?? 6, setup() { U.gunOn = false; noSpawn(); last = ''; setup(); }, tick(i) { H.safe(); tick(i); watch(i); }, ...extra }; };
  const TS = {};
  trial('t_tunnel', 200, () => { H.place(37, -8, Math.PI / 2, 13.8); TS.r = 0; }, i => { c.yaw = Math.PI / 2; if (i === 0) c.crouchPressed = true; K.KeyW = !(TS.r = TS.r || c.pos.x < 34); });
  trial('t_swingA', 150, () => { H.place(-28.4, .1, H.yawTo(1, 0), 6.4); TS.j = 0; TS.g = -1; }, i => { const rope = window.skyRopeSwing.active(); if (!rope) c.yaw = H.yawTo(1, 0); K.KeyW = true; K.Space = false;
    if (!TS.j && c.pos.x + 28.4 >= 3.9 && c.onGround) { K.Space = true; H.jump(); TS.j = 1; } if (rope && TS.g < 0) TS.g = i; if (rope && TS.g >= 0 && i - TS.g === 62) { H.jump(); K.Space = true; ev(i, 'release'); } });
  trial('t_swingB', 150, () => { H.place(-8.5, .1, H.yawTo(-1, 0), 8); TS.j = 0; TS.g = -1; }, i => { const rope = window.skyRopeSwing.active(); if (!rope) c.yaw = H.yawTo(-1, 0); K.KeyW = true; K.Space = false;
    if (!TS.j && -8.5 - c.pos.x >= 5.1 && c.onGround) { K.Space = true; H.jump(); TS.j = 1; } if (rope && TS.g < 0) TS.g = i; if (rope && TS.g >= 0 && i - TS.g === 62) { H.jump(); K.Space = true; ev(i, 'release'); } });
  trial('t_dive', 110, () => { window.skyWindowDive.restore(); H.place(-20.3, -12, H.yawTo(1, 0), 4.2); TS.j = 0; }, i => { c.yaw = H.yawTo(1, 0); K.KeyW = true; if (!TS.j && c.pos.x + 20.3 >= 2.3 && c.onGround) { H.jump(); TS.j = 1; } });
  trial('t_blast', 150, () => { H.place(8.2, -6.5, H.yawTo(1, 0), 8); TS.b = 0; }, i => { const B = window.skyBlastBarrels, b = B.barrels.find(q => q.id === 'plaza-east'); if (!TS.b) { c.yaw = H.yawTo(1, 0); K.KeyW = i < 20; if (B.assistTarget()?.barrel === b || i > 40) { K.KeyW = false; B.startAuto(b); TS.b = 1; ev(i, 'auto'); } } });
  trial('t_zip1', 170, () => { H.place(26, -2.2, H.yawTo(0, -1), 12); TS.j = 0; }, i => { if (c.state === 'normal') c.yaw = H.yawTo(0, -1); K.KeyW = true; if (!TS.j && c.pos.z < -5.6 && c.onGround) { H.jump(); TS.j = 1; } });
  trial('t_zip0', 220, () => { H.place(-6, 12, H.yawTo(-1, 0), 8); TS.j = 0; }, i => { if (c.state === 'normal') c.yaw = H.yawTo(-1, 0); K.KeyW = true; if (!TS.j && c.pos.x < -10.6 && c.onGround) { H.jump(); TS.j = 1; } });
  trial('t_hook3', 130, () => { H.place(30, -4, H.yawTo(1, 0), 12); TS.h = 0; }, i => { K.KeyW = c.state === 'normal' && i < 60; if (c.state === 'normal') c.yaw = H.yawTo(1, 0); c.pitch = .25; const t = I.hookAssist().target(); if (!TS.h && i > 8 && t) { c.hookPick = t; c.hookPressed = true; TS.h = 1; ev(i, 'hook' + I.us.indexOf(t)); } });
  trial('t_pad', 130, () => { H.place(-44, 9, H.yawTo(-1, -.6), 0); TS.h = 0; }, i => { const J = window.skyJumpPads; K.KeyW = !TS.h; if (!TS.h) c.yaw = H.yawTo(-3, -2); if (!TS.h && J.assistTarget()) { TS.h = 1; ev(i, 'pad'); J.launch(J.assistTarget()); } });
  // ---------- S2 chase on the north sky-bridge (y 0, z -24), heading east, gap at x 15..17 ----------
  const chaseCam = () => { const [fx, fz] = H.fwd(c.yaw); return [[c.pos.x + fx * 5.2 - fz * 1.9, c.pos.y + 1.0, c.pos.z + fz * 5.2 + fx * 1.9], [c.pos.x - fx * 2.2, c.pos.y + 1.2, c.pos.z - fz * 2.2], 56]; };
  SH.chase = { frames: 110, pre: 24, canvas: true, diff: 'hard',
    setup() { U.gunOn = false; g.GAME.spawnT = g.GAME.surgeT = 1e9; H.place(0, -24, H.yawTo(1, 0), 0); H.pack([[2.4, .2], [3.2, -.9], [3.9, .9], [4.7, -.2], [5.5, .8], [6.2, -.8]], 0); st.path = [{ x: 26.5, z: -24 }, { x: 60, z: -24 }]; st.k = 0; },
    tick(i) { H.safe(false); c.invuln = 0; H.drive(st); H.pose(...chaseCam()); },
    grab(i) { return H.cine(...chaseCam()); },
    post(i) { return i % 20 ? null : H.info(); } };
  // =================== real shots ===================
  const quiet = () => { g.GAME.spawnT = g.GAME.surgeT = 1e9; };
  const hideZ = () => { for (const z of I.Jt) z.pos.set(0, -150, 0); };
  const lerp = (a, b, u) => a + (b - a) * u, ease = u => u * u * (3 - 2 * u), cl = u => Math.max(0, Math.min(1, u));
  const mix3 = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
  // gamecam: the take's logic reads the game camera (hook aim), so the cine camera is used for the picture only and put back.
  const cineShot = (name, o) => { SH[name] = { canvas: true, ...o, tick(i) { o.tick(i); watch(i); if (o.cam && !o.gamecam) H.pose(...o.cam(i)); },
    grab(i) { const keep = o.gamecam && [C.position.clone(), C.quaternion.clone(), C.fov]; const url = H.cine(...o.cam(i * (window.__SUB || 2))); if (keep) { C.position.copy(keep[0]); C.quaternion.copy(keep[1]); C.fov = keep[2]; C.updateProjectionMatrix(); C.updateMatrixWorld(); } return url; } }; };
  const gameShot = (name, o) => { SH[name] = { ...o, tick(i) { o.tick(i); watch(i); } }; };
  const P = {};
  // CHASE: north sky-bridge, heading east. Reverse camera (cine) and the player's own camera (HUD).
  const chaseSetup = () => { U.gunOn = false; quiet(); H.place(0, -24, H.yawTo(1, 0), 0); H.pack([[2.4, .2], [3.2, -.9], [3.9, .9], [4.7, -.2], [5.5, .8], [6.2, -.8]], 0); st.path = [{ x: 26.5, z: -24 }, { x: 60, z: -24 }]; st.k = 0; };
  const chaseTick = i => { c.invuln = 0; c.life = 9; H.drive(st); };
  cineShot('chase', { frames: 70, pre: 20, diff: 'hard', setup: chaseSetup, tick: chaseTick,
    cam(i) { const [fx, fz] = H.fwd(c.yaw); return [[c.pos.x + fx * 4.3 - fz * 1.5, .95, c.pos.z + fz * 4.3 + fx * 1.5], [c.pos.x - fx * 2.5, 1.15, c.pos.z - fz * 2.5], 50]; } });
  // Player's own camera on the same take (used from the gap jump on, when the runner is clear of the pack: right behind him the pack sits between camera and runner).
  gameShot('chase_g', { frames: 96, pre: 20, diff: 'hard', setup: chaseSetup, tick: chaseTick });
  // DIVE through the window (west face of the central block).
  gameShot('dive', { frames: 50, pre: 4, setup() { U.gunOn = true;  quiet(); hideZ(); window.skyWindowDive.restore(); H.place(-20.3, -12, H.yawTo(1, 0), 4.2); P.j = 0; },
    tick(i) { H.safe(); c.yaw = H.yawTo(1, 0); H.keys({ KeyW: true }); if (!P.j && c.pos.x + 20.3 >= 2.3 && c.onGround) { H.jump(); P.j = 1; } } });
  // ZIP: long line from the central roof down over the west town.
  gameShot('zip', { frames: 95, pre: 8, setup() { U.gunOn = true;  quiet(); hideZ(); H.place(-6, 12, H.yawTo(-1, 0), 8); P.j = 0; },
    tick(i) { H.safe(); if (c.state === 'normal') c.yaw = H.yawTo(-1, 0); H.keys({ KeyW: true }); if (!P.j && c.pos.x < -10.6 && c.onGround) { H.jump(); P.j = 1; } } });
  // HOOK up to the east tower.
  gameShot('hook', { frames: 60, pre: 0, setup() { U.gunOn = true;  quiet(); hideZ(); H.place(29, -4, H.yawTo(1, 0), 12); P.h = 0; },
    tick(i) { H.safe(); H.keys({ KeyW: c.state === 'normal' }); if (c.state === 'normal') c.yaw = H.yawTo(1, 0); c.pitch = lerp(c.pitch, c.state === 'hook' ? .28 : .12, .08); const t = I.hookAssist().target(); if (!P.h && i > 14 && t) { c.hookPick = t; c.hookPressed = true; P.h = 1; ev(i, 'hook' + I.us.indexOf(t)); } } });
  // BLAST: barrel jump from the central roof up to the east block.
  gameShot('blast', { frames: 75, pre: 0, setup() { U.gunOn = true; quiet(); hideZ(); H.place(7.6, -6.5, H.yawTo(1, 0), 8); P.b = 0; },
    tick(i) { H.safe(); const B = window.skyBlastBarrels, b = B.barrels.find(q => q.id === 'plaza-east'); if (!P.b) { c.yaw = H.yawTo(1, 0); H.keys({ KeyW: true }); if (i >= 12 && (B.assistTarget()?.barrel === b || i > 50)) { H.keys({}); B.startAuto(b); P.b = 1; ev(i, 'auto'); } } } });
  // TUNNEL: slope slide into the U-tunnel and out over the town.
  gameShot('tunnel', { frames: 115, pre: 62, setup() { U.gunOn = false;  quiet(); hideZ(); H.place(37, -8, Math.PI / 2, 13.8); P.r = 0; },
    tick(i) { H.safe(); const j = i + 124; if (c.state !== 'normal' || c.onGround) c.yaw = Math.PI / 2; if (j === 0) c.crouchPressed = true; K.KeyW = !(P.r = P.r || c.pos.x < 34); } });
  // VISTA: the runner on the east tower; the camera pulls away to show the town above the clouds.
  cineShot('vista', { frames: 150, pre: 6, setup() { U.gunOn = false; quiet(); hideZ(); H.place(44.6, -9.6, H.yawTo(.5, -.85), 14.4); },
    tick(i) { H.safe(); H.keys({}); c.yaw = H.yawTo(.5, -.85); },
    cam(i) { const u = ease(cl(i / 300)), V = window.__VISTA || 0; return V ? [mix3([46.5, 15.9, -13.5], [58, 24, -30], u), mix3([44.6, 15.5, -9.6], [36, 9, -4], u), 50] : [mix3([43, 15.9, -6.5], [36, 20, 4], u), mix3([44.6, 15.6, -9.6], [47, 14.5, -14], u), 50]; } });
  // OPEN: the cover picture in motion. East tower top (y 14.4, x 40..46.5, z -12.5..-5.5); run east and leap off the edge.
  const calm = () => { for (const z of I.Jt) z.atkCD = Math.max(z.atkCD || 0, 3); };
  const openSetup = () => { U.gunOn = false; quiet(); H.place(42.5, -9.2, H.yawTo(1, 0), 14.4); H.pack([[1.5, .4], [2.0, -.8], [2.1, 1.4], [1.3, -2.0], [1.6, 2.6], [2.3, .2]], 14.4); P.j = 0; };
  const openTick = i => { c.invuln = 0; c.life = 9; calm(); c.yaw = H.yawTo(1, 0); H.keys({ KeyW: true }); if (!P.j && c.pos.x >= 45.2 && c.onGround) { H.jump(); P.j = 1; ev(i, 'leap'); } };
  cineShot('open', { frames: 60, pre: 0, diff: 'hard', setup: openSetup, tick: openTick,
    cam(i) { const u = ease(cl(i / 110)); if (H.aspect) return [[lerp(44.5, 44.8, u), 16.4, lerp(-2.2, -2.8, u)], [lerp(45.3, 45.7, u), 15.0, -12.5], 50]; return [[lerp(45.0, 45.4, u), 16.0, lerp(-4.3, -4.8, u)], [lerp(47.2, 47.6, u), 15.3, -12.5], 58]; } });
  // LEAP: the same leap seen from out over the drop, looking back at the tower edge and the pack.
  cineShot('leap', { frames: 60, pre: 0, diff: 'hard', setup: openSetup, tick: openTick,
    cam(i) { const u = ease(cl(i / 90)); if (H.aspect) return [[51.2, 14.6, -13.4], [Math.min(47.6, (46.0 + c.pos.x) / 2), Math.max(14.7, (15.2 + c.pos.y + 1.1) / 2), -9.2], 46]; return [[lerp(49.6, 50.4, u), lerp(14.9, 14.5, u), lerp(-12.2, -12.6, u)], [lerp(45.6, 47.0, u), lerp(15.5, 15.9, u), -9.2], 44]; } });
  // RAMP: the pack charges up the stone ramp (z -8) to the tower; the runner waits at the top.
  cineShot('ramp', { frames: 70, pre: 10, diff: 'hard', setup() { U.gunOn = false; quiet(); H.place(43.6, -8.6, H.yawTo(-1, 0), 14.4); const live = I.Jt.filter(z => !z.dead); let k = 0;
      for (const [x, dz] of [[36.5, 0], [35.3, .5], [34.2, -.4], [33, .3], [31.6, -.3], [30.4, .4], [29, 0], [27.6, .2]]) { let z = live[k++]; const zz = -8 + dz * .8, yy = H.top(x, zz, 20); if (!z) { z = new g.Zombie(x, yy, zz); g.zombies.push(z); }
        Object.assign(z, { act: null, spawnT: 0, rise: null, stun: 0, atkT: 0, fall: null, navT: 0, onGround: true, hideT: 0 }); z.pos.set(x, yy, zz); z.vel.set(5, 0, 0); z.yaw = H.yawTo(1, 0); if (z.m?.mx) z.m.mx.update(.13 * k); } },
    tick(i) { c.invuln = 0; c.life = 9; calm(); c.yaw = H.yawTo(-1, 0); H.keys({}); },
    cam(i) { const u = ease(cl(i / 140)); return [[lerp(45.6, 45.9, u), lerp(15.9, 16.1, u), -7.2], [36, 13.6, -8.2], 46]; } });
  // SWING: the big rope, west pad -> central roof. Camera on the landing side, the runner swings toward it.
  cineShot('swing', { frames: 95, pre: 14, setup() { U.gunOn = false; quiet(); hideZ(); H.place(-28.4, .1, H.yawTo(1, 0), 6.4); P.j = 0; P.g = -1; P.rel = 0; P.sx = 0; },
    tick(i) { H.safe(); const j = i + 28, rope = window.skyRopeSwing.active(); if (!rope) c.yaw = H.yawTo(1, 0); H.keys({ KeyW: true });
      if (!P.j && c.pos.x + 28.4 >= 3.9 && c.onGround) { H.key('Space'); P.j = j; } if (P.j && j === P.j + 4) H.key('Space', 'keyup');
      if (rope && P.g < 0) P.g = j; if (rope && !P.rel && j - P.g >= 70) { H.key('Space'); P.rel = j; ev(i, 'release'); } if (P.rel && j === P.rel + 4) H.key('Space', 'keyup'); },
    // v3: travels with the swing from the south side, close enough to read the hands on the rope.
    cam(i) { if (!P.sx) { P.sx = c.pos.x; P.sy = c.pos.y; } P.sx += (c.pos.x - P.sx) * .12; P.sy += (c.pos.y - P.sy) * .1;
      return [[P.sx + V('ax', 1.6), P.sy + V('ay', 1.1), V('az', 3.5)], [P.sx + .4, P.sy + 1.5, .1], V('fov', 56)]; } });
  // GUN: zombies charge along the east block roof; the pistol aims and fires by itself.
  gameShot('gun', { frames: 90, pre: 6, diff: 'normal', setup() { U.gunOn = true; quiet(); H.place(33.6, -3.7, H.yawTo(1, 0), 12); H.pack([[6.5, 0], [7.6, 1.2], [8.6, -1.1], [9.8, .4], [11, -.8], [12.2, .9]], 12); c.yaw = H.yawTo(-1, 0); for (const z of I.Jt) { z.hp = Math.min(z.hp, 2); z.yaw = H.yawTo(1, 0); } },
    tick(i) { c.invuln = 0; c.life = 9; c.yaw = H.yawTo(-1, 0); c.pitch = .02; H.keys({}); } });
  // WALLRUN: the same take as the chase, later on: the north wall, seen from out over the drop.
  cineShot('wallrun', { frames: 50, pre: 86, diff: 'hard', setup: chaseSetup, tick: chaseTick,
    cam(i) { return [[c.pos.x + V('ax', 2.7), V('ay', 1.2), V('az', -23.25)], [c.pos.x - .6, c.pos.y + 1.15, -24.9], V('fov', 60)]; } });   // v3: low, close and wide
  // GUN (cine): over the shoulder with a long lens, so the charging pack reads at trailer size.
  cineShot('gun_c', { frames: 90, pre: 6, diff: 'normal', setup() { U.gunOn = true; quiet(); H.place(33.6, -3.7, H.yawTo(1, 0), 12); H.pack([[6.5, 0], [7.6, 1.2], [8.6, -1.1], [9.8, .4], [11, -.8], [12.2, .9]], 12); c.yaw = H.yawTo(-1, 0); for (const z of I.Jt) { z.hp = Math.min(z.hp, 3); z.yaw = H.yawTo(1, 0); } },
    tick(i) { c.invuln = 0; c.life = 9; c.yaw = H.yawTo(-1, 0); c.pitch = .02; H.keys({}); },
    cam(i) { const u = ease(cl(i / 180)); if (H.aspect) return [[lerp(36.3, 35.9, u), 14.5, -4.0], [28.5, 12.6, -3.6], 36]; return [[lerp(35.9, 35.5, u), 13.55, lerp(-5.0, -4.9, u)], [27.5, 13.0, -3.5], 36]; } });

  // =================== v2: close cine cameras on the same takes ===================
  // Smoothed runner position (the camera's aim lags a little behind, like an operator following).
  const F = { x: 0, y: 0, z: 0, on: false };
  const follow = (k = .18) => { if (!F.on) { F.x = c.pos.x; F.y = c.pos.y; F.z = c.pos.z; F.on = true; } F.x += (c.pos.x - F.x) * k; F.y += (c.pos.y - F.y) * k; F.z += (c.pos.z - F.z) * k; };
  const X = n => window['__' + n];   // X_<name>= overrides from the command line, for finding a camera
  const V = (n, d) => X(n) ?? d;
  const base = name => SH[name];
  const recam = (name, from, o) => { const b = base(from); cineShot(name, { frames: b.frames, pre: b.pre || 0, diff: b.diff, ...o, setup() { F.on = false; b.setup(); o.setup?.(); }, tick(i) { (o.take || b.tick)(i); follow(o.lag ?? .18); } }); };
  // DIVE: inside the corridor behind the window; the runner crashes through the glass at the lens.
  recam('dive_c', 'dive', { setup() { U.gunOn = false; },
    cam(i) { return [[V('cx', -11.3), V('cy', 4.62), V('cz', -11.72)], [lerp(-17, F.x, .5), lerp(5.2, F.y + 1.0, .6), -12.05], V('fov', 58)]; } });
  // ZIP: travelling beside and a little ahead of the runner, low, the town streaming underneath.
  recam('zip_c', 'zip', { setup() { U.gunOn = false; }, lag: .3,
    cam(i) { return [[F.x + V('dx', -3.4), F.y + V('dy', .5), F.z + V('dz', 2.7)], [F.x + .3, F.y + 1.0, F.z], V('fov', 60)]; } });
  // HOOK: from out over the gap, low; the runner is pulled across and up to the tower.
  recam('hook_c', 'hook', { gamecam: true, setup() { U.gunOn = false; },
    cam(i) { return [[V('cx', 38.9), V('cy', 12.4), V('cz', .2)], [lerp(37, F.x, .85), F.y + 1.05, lerp(-4, F.z, .85)], V('fov', 50)]; } });
  // BLAST: low in the gap beyond the barrel; the blast throws the runner up and across the frame.
  recam('blast_c', 'blast', { setup() { U.gunOn = false; },
    cam(i) { for (const b of window.skyBlastBarrels.barrels) if (b.badge) b.badge.visible = false; return [[V('cx', 15.9), V('cy', 8.25), V('cz', -9.5)], [lerp(11.5, F.x, .75), lerp(8.7, F.y + .9, .8), lerp(-6.5, F.z, .75)], V('fov', 58)]; } });
  // TUNNEL a: low at the lip of the U; the runner slides down the slope at the lens and is thrown up.
  recam('tunnel_a', 'tunnel', { cam(i) { return [[V('cx', -3.4), V('cy', 5.0), V('cz', -5.4)], [F.x, F.y + .8, F.z], V('fov', 58)]; } });
  // TUNNEL b: high over the town; the runner rises to the lens at the top of the arc.
  recam('tunnel_b', 'tunnel', { cam(i) { return [[V('cx', -13.6), V('cy', 24.2), V('cz', -3.6)], [F.x, F.y + .9, F.z], V('fov', 56)]; } });

  // =================== look-dev: close on the body, to judge the animation itself ===================
  const near = (ahead = 2.6, side = 1.9, up = 1.1, fov = 42) => () => { const [fx, fz] = H.fwd(c.yaw); return [[F.x + fx * ahead - fz * side, F.y + up, F.z + fz * ahead + fx * side], [F.x, F.y + 1.0, F.z], fov]; };
  for (const [name, from] of [['n_zip', 'zip'], ['n_hook', 'hook'], ['n_swing', 'swing'], ['n_dive', 'dive'], ['n_tunnel', 'tunnel'], ['n_blast', 'blast']])
    recam(name, from, { gamecam: true, lag: .5, setup() { U.gunOn = false; }, cam: near() });
  cineShot('n_idle', { frames: 90, pre: 10, gamecam: true, setup() { U.gunOn = false; quiet(); hideZ(); F.on = false; H.place(33.6, -3.7, H.yawTo(1, 0), 12); },
    tick(i) { H.safe(); H.keys({}); follow(.5); }, cam: near(2.4, 1.2, 1.2, 40) });
  cineShot('n_run', { frames: 110, pre: 6, gamecam: true, setup() { U.gunOn = false; quiet(); hideZ(); F.on = false; H.place(0, -24, H.yawTo(1, 0), 0); st.path = [{ x: 26.5, z: -24 }, { x: 60, z: -24 }]; st.k = 0; },
    tick(i) { H.safe(); H.drive(st); follow(.5); }, cam: near(3.0, 2.2, 1.0, 44) });
  // Zombies up close: a pack running at the lens, and one reaching the (standing) player.
  cineShot('n_zrun', { frames: 80, pre: 16, diff: 'hard', setup() { U.gunOn = false; quiet(); F.on = false; H.place(33.6, -3.7, H.yawTo(1, 0), 12); H.pack([[7.5, 0], [8.4, 1.1], [9.3, -1.0], [10.4, .4]], 12); c.yaw = H.yawTo(-1, 0); for (const z of I.Jt) z.yaw = H.yawTo(1, 0); },
    tick(i) { c.invuln = 0; c.life = 9; calm(); c.yaw = H.yawTo(-1, 0); H.keys({}); follow(.5); },
    cam() { return [[V('cx', 33.2), 13.2, V('cz', -1.9)], [27.5, 13.0, -3.7], V('fov', 34)]; } });

  cineShot('n_ladder', { frames: 80, pre: 4, gamecam: true, setup() { U.gunOn = false; quiet(); hideZ(); F.on = false; const L = g.LADDERS[+(X('L') ?? 0)]; P.L = L; H.place(L.x + L.nx * .9, L.z + L.nz * .9, H.yawTo(-L.nx, -L.nz), L.y0 + .05); },
    tick(i) { H.safe(); const L = P.L; if (c.state !== 'ladder') c.yaw = H.yawTo(-L.nx, -L.nz); H.keys({ KeyW: true }); follow(.5); },
    cam() { const L = P.L; return [[F.x + L.nx * 2.6 - L.nz * 1.6, F.y + 1.3, F.z + L.nz * 2.6 + L.nx * 1.6], [F.x, F.y + 1.0, F.z], 44]; } });
})();