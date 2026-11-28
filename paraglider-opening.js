// Paraglider opening (old town): a plane flies in, drops the player over the middle of the town, and the player steers
// a paraglider down to any spot they like. Jump lets go of the glider and drops fast; no fall damage either way.
//
// Until the player lands, the run has not started: the run clock (z.t, so survival points, weapon-drop timers, respawns)
// and every zombie's thinking are held. Zombies are already standing on the ground while the player is in the air.
// Landing (touching the ground, or any parkour state: ledge, ladder, wall run, hook...) starts the clock and the chase.
//
// Retry skips the plane and starts straight in the glide. The first view of each run from the home screen has the plane.
//
// Core hooks (index.html): br() asks anchor() for the ground spot used to spawn the first zombies (a measured start spot)
// and then calls begin();
// Da() calls beforePlayerStep()/afterPlayerStep() around each physics substep; wv() returns early while holdWorld() is true;
// xp() calls frame() before rendering.
(function (root) {
  // Metres, seconds. Measured against the old town: the playable nav graph spans about x -70..62, z -34..26 and the
  // rooftops are 4-10 m high, so from 46 m at 5.5 m/s the glide lasts about 6-7 s and covers 55-65 m at 9.5 m/s,
  // which reaches every edge from the middle.
  const CONFIG = Object.freeze({
    center: Object.freeze({ x: 0, z: -4 }), dropJitter: 6, dropY: 46,
    planeSeconds: 2.6, planeSpeed: 30, planeLeave: 4,
    glideSpeed: 9.5, glideAccel: 3.2, glideSink: 5.5, glideStartSpeed: 6,
    releaseSink: 2, boundsMargin: 3, fallRescueY: -22,
    landInvuln: 1.5, zombieReaction: .4,
  });
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // ---- Pure parts (unit-tested in bench/paraglider-opening.test.cjs) ----

  // Same conditions as the random high-ground start (start-spots.js): off on the canyon, practice, owner replays,
  // `?start=default` and `?start_spot=<id>`; off in automated browsers unless a test opts in with `?paraglider=1`.
  function enabled(env = root) {
    const params = new URLSearchParams(env.location?.search || '');
    if (env.SKY_CANYON_MAP || env.skyPracticeMode || env.skyOwnerReplay || params.has('practice')) return false;
    if (params.get('paraglider') === '0' || params.get('start') === 'default' || params.has('start_spot')) return false;
    const automated = env.navigator?.webdriver === true;
    return !automated || params.get('paraglider') === '1';
  }
  // Rectangle of the walkable town (nav nodes), shrunk by the margin. The glide never leaves it.
  function bounds(nodes, margin = CONFIG.boundsMargin) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const n of nodes) { minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x); minZ = Math.min(minZ, n.z); maxZ = Math.max(maxZ, n.z); }
    if (!Number.isFinite(minX)) return null;
    return { minX: minX + margin, maxX: maxX - margin, minZ: minZ + margin, maxZ: maxZ - margin };
  }
  // Camera-relative steering. yaw 0 looks toward -z (forward = (-sin yaw, -cos yaw), right = (cos yaw, -sin yaw)).
  function steer(vel, input, yaw, dt, config = CONFIG) {
    let f = input.fwdIn || 0, s = input.strIn || 0;
    const m = Math.hypot(f, s); if (m > 1) { f /= m; s /= m; }
    const tx = (-Math.sin(yaw) * f + Math.cos(yaw) * s) * config.glideSpeed;
    const tz = (-Math.cos(yaw) * f - Math.sin(yaw) * s) * config.glideSpeed;
    const k = 1 - Math.exp(-config.glideAccel * dt);
    return { x: vel.x + (tx - vel.x) * k, y: -config.glideSink, z: vel.z + (tz - vel.z) * k };
  }
  // Keeps a point inside the rectangle; the velocity component that points out of it is removed.
  function contain(pos, vel, box) {
    if (!box) return false;
    let hit = false;
    if (pos.x < box.minX) { pos.x = box.minX; if (vel.x < 0) vel.x = 0; hit = true; }
    if (pos.x > box.maxX) { pos.x = box.maxX; if (vel.x > 0) vel.x = 0; hit = true; }
    if (pos.z < box.minZ) { pos.z = box.minZ; if (vel.z < 0) vel.z = 0; hit = true; }
    if (pos.z > box.maxZ) { pos.z = box.maxZ; if (vel.z > 0) vel.z = 0; hit = true; }
    return hit;
  }
  // The plane comes in from `angle` and passes over the drop point after `planeSeconds`.
  function planeAt(drop, angle, t, config = CONFIG) {
    const dx = Math.cos(angle), dz = Math.sin(angle), along = (t - config.planeSeconds) * config.planeSpeed;
    return { x: drop.x + dx * along, y: drop.y, z: drop.z + dz * along, dx, dz };
  }
  const yawFor = (dx, dz) => Math.atan2(-dx, -dz);
  // Opening crates: where the waiting zombies stand thickest. danger(n) adds up every zombie within `radius`
  // (height counts 1.5x), the best spot gets the strongest weapon. Never on top of a zombie, and spread apart.
  const OPENING = Object.freeze({ radius: 16, minZombie: 4, apart: 14, types: [2, 1, 0] });
  function rankDanger(candidates, zombies, opening = OPENING) {
    const scored = [];
    for (const n of candidates) {
      let danger = 0, closest = Infinity;
      for (const e of zombies) {
        const d = Math.hypot(e.x - n.x, e.z - n.z) + Math.abs(e.y - n.y) * 1.5;
        closest = Math.min(closest, d);
        if (d < opening.radius) danger += 1 - d / opening.radius;
      }
      if (closest < opening.minZombie) continue;
      scored.push({ node: n, danger });
    }
    scored.sort((a, b) => b.danger - a.danger || a.node.id - b.node.id);
    const picks = [];
    for (const s of scored) {
      if (picks.length >= opening.types.length) break;
      if (picks.some(p => Math.hypot(p.node.x - s.node.x, p.node.z - s.node.z) < opening.apart)) continue;
      picks.push({ node: s.node, danger: +s.danger.toFixed(3), type: opening.types[picks.length] });
    }
    return picks;
  }

  const api = { CONFIG, OPENING, enabled, bounds, steer, contain, planeAt, yawFor, rankDanger };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }

  // ---- Runtime (browser) ----
  let phase = 'off', planeT = 0, angle = 0, drop = null, box = null, anchor = null, built = null, leaveT = 0, canopyFold = 0;
  let notice = '', stats = null, armed = false, over = null, overVoid = false, probeT = 0, inside = false;
  const sky = () => root.__skyInternals, game = () => root.__game;

  function graph() { return game()?.NAV || null; }
  function anchorPoint() {
    if (!enabled()) return null;
    const nav = graph(); if (!nav?.nodes?.length) return null;
    box = box || bounds(nav.nodes);
    // The run is set up from one of the measured high-ground start spots (start-spots.js), as before: the first zombies are
    // placed from it and the crate candidates are found from it. Then the player is lifted into the plane. So the waiting
    // zombies (and the dangerous spots) change from run to run, and every spot is one whose zombie arrival was measured.
    const spots = root.skyStartSpots; if (!spots?.choose) return null;
    const spot = spots.choose(Math.random, anchor?.id || null);
    anchor = { id: spot.id, x: spot.x, y: spot.y, z: spot.z, yaw: spot.yaw }; armed = true;
    return { x: spot.x, y: spot.y, z: spot.z, yaw: spot.yaw };
  }
  // The follow camera is pulled back while riding the plane, so the plane shows three-quarters on instead of the underside
  // of its tail. dash-boost.js sets the chase distance every frame (skyDash.frame, just before the camera is placed), so
  // the override is applied right after it, and eases back to the normal chase over about 0.4 s after the jump.
  const RIDE_CAMERA = Object.freeze({ distance: 9.5, height: 1.3, shoulder: .2 });
  let rideView = 0, dashPatched = false;
  function patchDashCamera() {
    const dash = root.skyDash; if (dashPatched || !dash?.frame || !dash.camera) return;
    dashPatched = true;
    const original = dash.frame.bind(dash);
    dash.frame = (...args) => {
      const out = original(...args);
      if (rideView > 0) for (const key of ['distance', 'height', 'shoulder']) dash.camera[key] += (RIDE_CAMERA[key] - dash.camera[key]) * rideView;
      return out;
    };
  }
  function build() {
    patchDashCamera();
    if (built) return built;
    const s = sky(); if (!s?.Geom || !s.ue) return null;
    const T = s.Geom;
    // Plane: a high-wing twin-turboprop transport with an open rear ramp (the player stands at its end, local z +8.6,
    // y -2.8). Local -z is the nose. Built from a few primitives (no model file); slate/stone greys and the canopy's slate
    // blue for the stripe, red/green wing-tip lights (no yellow/orange: those are marker colours).
    const plane = new T.Group(); plane.name = 'Opening plane';
    const skin = new T.Standard({ color: 0xb4bdc5, roughness: .5, metalness: .1 });
    const belly = new T.Standard({ color: 0x8c96a0, roughness: .6, metalness: .08 });
    const trim = new T.Standard({ color: 0x5f7f9c, roughness: .5, metalness: .2 });
    const glass = new T.Standard({ color: 0x1b2833, roughness: .15, metalness: .6 });
    const metal = new T.Standard({ color: 0x3a434c, roughness: .4, metalness: .7 });
    const inner = new T.Standard({ color: 0x2a3036, roughness: .9 });
    const add = (geometry, material, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, parent = plane) => {
      const mesh = new T.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz);
      mesh.scale.set(sx, sy, sz); parent.add(mesh); return mesh;
    };
    const R = 1.35, half = Math.PI / 2;
    // Fuselage: round tube, rounded nose, tapering tail cone swept up, darker belly and a slate-blue cheat line.
    add(new T.Cylinder(R, R, 10.5, 18), skin, 0, 0, 0, half);
    add(new T.Box(2.1, .5, 10.4), belly, 0, -1.08, 0);
    add(new T.Sphere(R, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), skin, 0, 0, -5.25, -half, 0, 0, 1, 1.55, 1);
    add(new T.Cylinder(.42, R, 5.4, 18), skin, 0, .55, 7.85, half + .2); // narrows toward the tail
    for (const side of [-1, 1]) add(new T.Box(.04, .16, 10), trim, side * (R - .01), .18, -.2);
    // Cockpit glass (wrap-around strip) and a row of cabin windows each side.
    add(new T.Box(2.05, .42, .9), glass, 0, .72, -6.05, -.55);
    for (const side of [-1, 1]) {
      add(new T.Box(.06, .38, .75), glass, side * 1.05, .64, -5.55, 0, side * .5);
      for (let i = 0; i < 6; i++) add(new T.Box(.05, .32, .34), glass, side * (R - .005), .5, -3.4 + i * 1.25);
    }
    // Open rear ramp, hinged under the tail, its dark inside showing.
    add(new T.Box(2.2, .14, 3.9), belly, 0, -1.92, 7.05, .38);
    add(new T.Box(2.3, 2.1, .1), inner, 0, -.25, 5.18);
    // High wing with tips, two engines (nacelle, spinner, spinning three-blade props), red/green lights.
    const wing = new T.Box(24, .3, 3.1);
    add(wing, skin, 0, 1.38, -1.1); add(new T.Box(24.1, .12, .5), belly, 0, 1.22, .3);
    add(new T.Box(3.4, 1.05, 2.6), skin, 0, 1.0, -1.1);
    const props = [];
    for (const side of [-1, 1]) {
      add(new T.Cylinder(.55, .45, 4.2, 14), belly, side * 4.6, .95, -1.9, half);
      add(new T.Sphere(.32, 12, 8), metal, side * 4.6, .95, -4.15, 0, 0, 0, 1, 1, 1.5);
      const hub = new T.Group(); hub.position.set(side * 4.6, .95, -4.1); plane.add(hub);
      for (let k = 0; k < 3; k++) add(new T.Box(.16, 1.75, .05), metal, 0, 0, 0, 0, 0, k * Math.PI * 2 / 3, 1, 1, 1, hub)
        .geometry.translate(0, .87, 0);
      props.push(hub);
      const light = add(new T.Sphere(.16, 8, 6), new T.Basic({ color: side < 0 ? 0xff3b3b : 0x3bff7a }), side * 12.05, 1.38, -1.1);
      light.userData.navLight = true;
    }
    // T-tail: swept fin with a slate-blue cap, stabiliser on top.
    add(new T.Box(.24, 3.4, 2.6), skin, 0, 2.6, 9.0, -.32);
    add(new T.Box(.26, .5, 2.4), trim, 0, 4.05, 9.55, -.32);
    add(new T.Box(7.4, .2, 1.7), skin, 0, 4.3, 9.95);
    plane.userData.props = props;
    plane.scale.setScalar(1);
    plane.visible = false; s.ue.add(plane);
    // Canopy: an arc of cloth cells above the player, with four lines down to the harness.
    const glider = new T.Group(); glider.name = 'Paraglider';
    const cloth = new T.Standard({ color: 0x5f7f9c, roughness: .85 }), stripe = new T.Standard({ color: 0xdfe6ec, roughness: .85 });
    // High and a little ahead, so the follow camera (about 3 m behind, 1-2 m above the head) stays under the cloth:
    // the lines lead up from the shoulders and the canopy shows when the player looks up.
    const cells = 7, span = 1.1 * Math.PI / 2, radius = 5, top = 6.6, ahead = -1.2;
    for (let i = 0; i < cells; i++) {
      const a = -span / 2 + span * (i + .5) / cells, mesh = new T.Mesh(new T.Box(1.5, .18, 1.8), i === 3 ? stripe : cloth);
      mesh.position.set(Math.sin(a) * radius, Math.cos(a) * radius - radius + top, ahead); mesh.rotation.z = -a; glider.add(mesh);
    }
    const line = new T.Basic({ color: 0x2b3238 });
    const edge = span / 2 * .82, edgeX = Math.sin(edge) * radius, edgeY = Math.cos(edge) * radius - radius + top - .1;
    for (const side of [-1, 1]) for (const z of [ahead - .6, ahead + .6]) {
      const top = { x: side * edgeX, y: edgeY, z }, bottom = { x: side * .25, y: 1.4, z: 0 };
      const len = Math.hypot(top.x - bottom.x, top.y - bottom.y, top.z - bottom.z);
      const mesh = new T.Mesh(new T.Cylinder(.012, .012, len, 3), line);
      mesh.position.set((top.x + bottom.x) / 2, (top.y + bottom.y) / 2, (top.z + bottom.z) / 2);
      mesh.rotation.z = Math.atan2(-(top.x - bottom.x), top.y - bottom.y); glider.add(mesh);
    }
    glider.visible = false; s.ue.add(glider);
    // Landing mark: a pale ring straight below the player.
    const mark = new T.Mesh(new T.Torus(1.1, .07, 4, 28), new T.Basic({ color: 0xe8f1f7, transparent: true, opacity: .75, depthWrite: false }));
    mark.rotation.x = -Math.PI / 2; mark.visible = false; s.ue.add(mark);
    built = { plane, glider, mark };
    return built;
  }
  function say(text) { notice = text; sky()?.rn?.(text); }
  // The jump button / Space does one thing during the opening: jump off (the plane, then the glider).
  function controlsText(where) {
    const touch = root.matchMedia?.('(pointer: coarse)')?.matches;
    if (where === 'plane') return touch ? '「飛び降りる」でいつでも降下 · 待てば中央で降下' : 'スペースで飛び降りる · 待てば中央で降下';
    return touch ? 'スティックで移動 · 「飛び降りる」で急降下' : 'WASDで移動 · スペースで飛び降りる';
  }
  // Touch jump button label: 「飛び降りる」 while on the plane or under the glider, back to its own label after landing.
  // The original label is read once (already translated if the page is not Japanese); i18n.js translates the new text.
  const JUMP_OFF = '飛び降りる';
  let jumpLabel = null;
  function jumpButtonLabel(off) {
    const button = root.document?.getElementById?.('tJump'); if (!button) return;
    if (jumpLabel === null && !button.dataset.paraglider) jumpLabel = button.textContent;
    if (off) { button.dataset.paraglider = '1'; if (button.dataset.paragliderText !== 'off') { button.textContent = JUMP_OFF; button.dataset.paragliderText = 'off'; } }
    else if (button.dataset.paraglider) { delete button.dataset.paraglider; delete button.dataset.paragliderText; if (jumpLabel !== null) button.textContent = jumpLabel; }
  }
  function placeOnPlane() {
    const s = sky(), c = s.c, p = planeAt(drop, angle, planeT);
    // Standing at the open rear ramp: behind and below the tail, so the follow camera shows the plane ahead and the town below.
    c.pos.set(p.x - p.dx * 8.6, p.y - 1.4, p.z - p.dz * 8.6);
    c.vel.set(p.dx * CONFIG.planeSpeed, 0, p.dz * CONFIG.planeSpeed);
    c.onGround = false; c.state = 'normal'; c.airT = 0; c.jumpBuf = 0;
  }
  function startGlide() {
    const c = sky().c;
    phase = 'glide';
    const dx = Math.cos(angle), dz = Math.sin(angle);
    c.vel.set(dx * CONFIG.glideStartSpeed, -CONFIG.glideSink, dz * CONFIG.glideStartSpeed);
    c.onGround = false; c.state = 'normal'; c.airT = 0; c.jumpBuf = 0;
    canopyFold = 0; leaveT = 0; over = null; overVoid = false; probeT = 0; inside = false;
    // Look down at the town (the plane's view looked ahead).
    c.pitch = Math.min(c.pitch, -.72);
    say(controlsText('glide'));
  }
  // retry: true when the run is a retry (not started from the home screen), which skips the plane.
  function begin(retry = false) {
    phase = 'off'; leaveT = 0; notice = ''; jumpButtonLabel(false);
    // Only a run that br() set up from anchor() (not an explicit start such as a mission or a test position).
    const ready = armed; armed = false;
    if (!ready || !enabled() || !anchor || !build()) { stats = null; publish(); return false; }
    const s = sky(), c = s.c;
    angle = Math.random() * Math.PI * 2;
    const j = () => (Math.random() * 2 - 1) * CONFIG.dropJitter;
    drop = { x: CONFIG.center.x + j(), y: CONFIG.dropY, z: CONFIG.center.z + j() };
    stats = { retry: !!retry, anchor: anchor.id, angle: +angle.toFixed(3), drop: [+drop.x.toFixed(2), drop.y, +drop.z.toFixed(2)], released: null, landed: null, rescued: false };
    // Opening crates are placed from the waiting zombies, before the player leaves the ground anchor.
    stats.crates = root.skyWeaponDrops?.seedOpening?.(s.Jt.filter(e => !e.dead).map(e => ({ x: e.pos.x, y: e.pos.y, z: e.pos.z }))) || [];
    // On the plane the first view is from behind and to one side (about 35 degrees), so the plane shows three-quarters on.
    c.yaw = yawFor(Math.cos(angle), Math.sin(angle)) + (retry ? 0 : .6); c.pitch = retry ? -.42 : -.12;
    // No damage can happen before landing, so no invulnerability blink in the air; landing gives the usual 1.5 s.
    c.invuln = s.ceRef() - 1;
    rideView = retry ? 0 : 1;
    if (retry) { planeT = CONFIG.planeSeconds; c.pos.set(drop.x, drop.y, drop.z); startGlide(); }
    else { phase = 'plane'; planeT = 0; placeOnPlane(); say(controlsText('plane')); }
    jumpButtonLabel(true);
    publish();
    return true;
  }
  const flying = () => phase === 'plane' || phase === 'glide' || phase === 'fall';
  // Before one physics substep. true = skip the player step (riding the plane).
  function beforePlayerStep(dt) {
    if (!flying()) return false;
    const s = sky(), c = s.c;
    if (phase === 'plane') {
      // Jump off the ramp at any moment (from wherever the plane is), or be dropped over the middle when it gets there.
      if (c.jumpBuf > 0) { stats.jumpedOff = +planeT.toFixed(2); startGlide(); s.Tt?.jump?.(); return false; }
      planeT += dt;
      if (planeT >= CONFIG.planeSeconds) { c.pos.set(drop.x, drop.y, drop.z); startGlide(); return false; }
      placeOnPlane(); return true;
    }
    if (phase === 'glide' && c.jumpBuf > 0) {
      // Let go: keep the horizontal speed, gravity takes over in the player step.
      c.jumpBuf = 0; phase = 'fall'; c.vel.y = Math.min(c.vel.y, -CONFIG.releaseSink);
      stats.released = [+c.pos.x.toFixed(2), +c.pos.y.toFixed(2), +c.pos.z.toFixed(2)];
      s.Tt?.jump?.();
    }
    return false;
  }
  function input() {
    const s = sky(), k = s.keys || {}, t = s.inputState || {};
    let f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0), st = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
    const m = t.on ? Math.hypot(t.x, t.y) : 0;
    if (m > .18) { f = clamp(f - t.y / m * Math.min(1, m), -1, 1); st = clamp(st + t.x / m * Math.min(1, m), -1, 1); }
    return root.skyFollowCamera?.input?.({ fwdIn: f, strIn: st, tmag: m }) ?? { fwdIn: f, strIn: st, tmag: m };
  }
  function afterPlayerStep(dt) {
    if (phase !== 'glide' && phase !== 'fall') return;
    const c = sky().c;
    if (c.onGround || c.state !== 'normal') { land(false); return; }
    if (phase === 'glide') { const v = steer(c.vel, input(), c.yaw, dt); c.vel.set(v.x, v.y, v.z); }
    // The town is not a rectangle: it has gaps down to the cloud sea. Probe straight down (30 times a second); over a gap,
    // head back to the last point that had ground under it, so the edge of the town acts like a soft wall.
    probeT -= dt;
    if (probeT <= 0) {
      probeT = 1 / 30;
      const hit = sky().raycast(c.pos.x, c.pos.y - .1, c.pos.z, 0, -1, 0, 160);
      overVoid = !hit; if (hit) over = { x: c.pos.x, z: c.pos.z };
    }
    // Jumped off the plane before reaching the town (nothing under the player yet): head for the drop point instead.
    if (overVoid) {
      const to = over || drop, dx = to.x - c.pos.x, dz = to.z - c.pos.z, d = Math.hypot(dx, dz) || 1;
      const back = over ? Math.max(phase === 'glide' ? CONFIG.glideSpeed * .6 : 6, Math.hypot(c.vel.x, c.vel.z))
        : Math.max(phase === 'glide' ? CONFIG.glideSpeed : 12, Math.hypot(c.vel.x, c.vel.z));
      c.vel.x = dx / d * back; c.vel.z = dz / d * back;
    }
    // The rectangle only holds once the player is inside it (a jump from the plane starts outside the town).
    if (!inside && box) inside = c.pos.x >= box.minX && c.pos.x <= box.maxX && c.pos.z >= box.minZ && c.pos.z <= box.maxZ;
    if (inside) contain(c.pos, c.vel, box);
  }
  function land(rescued) {
    const s = sky(), c = s.c;
    phase = 'off'; canopyFold = 1e-3; jumpButtonLabel(false);
    if (rescued) {
      // Fell through a gap into the cloud sea while the run had not started: put down on the nearest walkable node.
      const nav = graph(); let best = anchor, d = Infinity;
      for (const n of nav?.nodes || []) { const k = Math.hypot(n.x - c.pos.x, n.z - c.pos.z); if (k < d && (nav.out[n.id]?.length || 0) >= 3) { d = k; best = n; } }
      c.pos.set(best.x, best.y + .05, best.z); c.vel.set(0, 0, 0); c.state = 'normal';
    }
    c.invuln = s.ceRef() + CONFIG.landInvuln;
    for (const e of s.Jt) if (!e.dead) e.spawnT = Math.min(e.spawnT, CONFIG.zombieReaction);
    if (stats) { stats.landed = [+c.pos.x.toFixed(2), +c.pos.y.toFixed(2), +c.pos.z.toFixed(2)]; stats.rescued = !!rescued; }
    // The run starts here: the replay is recorded from the landing, not from the sky.
    root.skyReplay?.start?.();
    if (notice) { s.rn?.('着地 · 逃げ切れ'); notice = ''; }
    publish();
  }
  // Called by wv() before the run clock moves. true = the world waits (no clock, no zombie thinking, no respawns).
  function holdWorld(dt) {
    if (!flying()) return false;
    const s = sky(), c = s.c;
    for (const e of s.Jt) e.anim?.(dt);
    if (c.pos.y < CONFIG.fallRescueY) land(true);
    return flying();
  }
  function frame(dt) {
    const s = sky(); if (!built || !s) return;
    const { plane, glider, mark } = built, c = s.c, playing = s.modeRef() === 'play';
    rideView = phase === 'plane' ? 1 : Math.max(0, rideView - dt * 2.5);
    // Home / result screens: hide everything (begin() resets the phase for the next run).
    if (!playing && s.modeRef() !== 'pause') { plane.visible = glider.visible = mark.visible = false; jumpButtonLabel(false); return; }
    // Plane: visible while it carries the player and for a few seconds after the drop, flying on out of the town.
    // After a jump the plane flies on (from wherever it was) until it has left the town.
    const showPlane = phase === 'plane' || (drop && stats && !stats.retry && leaveT < CONFIG.planeLeave + CONFIG.planeSeconds - planeT);
    if (phase !== 'plane' && showPlane && playing) leaveT += dt;
    plane.visible = !!showPlane;
    if (plane.visible) {
      const p = planeAt(drop, angle, phase === 'plane' ? planeT : planeT + leaveT);
      plane.position.set(p.x, p.y + 1.2, p.z); plane.rotation.set(0, yawFor(p.dx, p.dz), Math.sin(leaveT * .8) * .04);
      for (const hub of plane.userData.props) hub.rotation.z += dt * 38;
    }
    // Canopy: open over the player while gliding; folds away quickly after release or landing.
    if (phase === 'glide') canopyFold = 0; else if (canopyFold > 0) canopyFold += dt * 4;
    glider.visible = phase === 'glide' || (canopyFold > 0 && canopyFold < 1);
    if (glider.visible) {
      const k = phase === 'glide' ? 1 : 1 - canopyFold;
      glider.position.set(c.pos.x, c.pos.y + (1 - k) * 1.5, c.pos.z);
      const v = Math.hypot(c.vel.x, c.vel.z), heading = v > .5 ? Math.atan2(-c.vel.x, -c.vel.z) : c.yaw;
      glider.rotation.set(0, heading, 0); glider.scale.setScalar(Math.max(.05, k));
    }
    // Landing mark straight below while in the air.
    mark.visible = false;
    if (phase === 'glide' || phase === 'fall') {
      const hit = s.raycast(c.pos.x, c.pos.y - .1, c.pos.z, 0, -1, 0, 120);
      if (hit) { mark.visible = true; mark.position.set(c.pos.x, c.pos.y - .1 - hit.t + .06, c.pos.z); }
    }
  }
  function publish() {
    if (!root.document?.body) return;
    root.document.body.dataset.skyParaglider = JSON.stringify({ phase, ...(stats || {}) });
  }
  setInterval?.(() => { if (flying()) publish(); }, 250);

  // defineProperties, not Object.assign: assign would copy the getters' current values instead of the getters.
  Object.defineProperties(api, Object.getOwnPropertyDescriptors({ anchor: anchorPoint, begin, beforePlayerStep, afterPlayerStep,
    holdWorld, frame, holding: flying, get phase() { return phase; }, get stats() { return stats; } }));
  root.skyParaglider = api;
})(globalThis);
