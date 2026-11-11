// Flow feel: makes linking parkour moves readable and fast-feeling without changing speed.
//  1. FLOW chain – each move made within 3.2 s of the last one adds a link: a rising note,
//     a short whoosh, an edge streak and a small tag. Presentation only: no speed, no score.
//  2. Air view – while airborne the view widens and lifts a little so the landing is visible,
//     then tightens on touchdown.
//  3. Landing ring + dust, and a light trail from the 3rd link on. Visual only.
//  4. Gap auto-jump (trial, ?autoJump=1) – sprinting straight at a gap with a landing inside
//     normal jump range jumps by itself at the edge. Off by default.
// Speed, jump height, gravity, enemies and ranking rules are untouched.
(() => {
  const sky = window.__skyInternals, game = window.__game;
  if (!sky || !game || window.skyFlow) return;
  const { c, z, U } = sky, stats = game.stats;
  const params = new URLSearchParams(location.search);
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
  const feelOn = params.get('flowFeel') !== '0';
  let autoJump = params.get('autoJump') === '1';
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const ease = (from, to, dt, rate) => from + (to - from) * (1 - Math.exp(-dt * rate));

  // Moves that count as a link: things the player does on purpose. Left out on purpose (measured in
  // docs/FLOW_FEEL_2026-11-10.md): crawling under something low and the edge-catch both happen just by
  // running or jumping at a wall. A jump only counts when it crosses 3 m or more of open air (below).
  const MOVES = ['vaults', 'mantles', 'slides', 'wallruns', 'walljumps', 'hooks', 'zips', 'zipjumps',
    'stomps', 'slips', 'padJumps', 'blastLaunches', 'jumpGunLaunches', 'towerTunnel', 'ropeSwings', 'windowDives'];
  const GAP_MIN = 3, GAP_MAX_DROP = 3.5;
  // A vault or mantle counts only when the player was moving (a climb from a standstill is not flow);
  // measured: standing mantles start at speed 0, running ones at 4.3 or more.
  const MOVING = new Set(['vaults', 'mantles']), MOVING_MIN = 3.5, HIGH_VAULT = 1;
  const WINDOW = 3.2, SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19];
  const seen = {};
  let chain = 0, timer = 0, best = 0, pulse = 0, level = 0, airTime = 0, airView = 0, idle = 0;
  let takeoff = null, prevJumps = 0, prevSpeed = 0, swinging = false, life = null, falls = 0, armed = false, cooldown = 0, autoJumps = 0, patched = false;

  const style = document.createElement('style');
  style.textContent = '#flowTag{position:absolute;left:50%;top:21%;transform:translateX(-50%) scale(var(--pop,1));pointer-events:none;z-index:6;opacity:0;transition:opacity .18s;font:800 15px/1 system-ui,sans-serif;letter-spacing:.14em;color:#eaffff;text-shadow:0 1px 3px #0009,0 0 10px #39d8ffaa;text-align:center;white-space:nowrap}' +
    '#flowTag b{font-size:22px;letter-spacing:0;margin-left:.3em;color:#fff}#flowTag i{display:block;height:3px;margin:5px auto 0;width:74px;border-radius:2px;background:#ffffff38;overflow:hidden}#flowTag i::after{content:"";display:block;height:100%;width:calc(var(--left,0)*100%);background:#7fe9ff}' +
    '#flowEdge{position:absolute;inset:0;pointer-events:none;z-index:5;opacity:0;background:radial-gradient(ellipse at 50% 46%,transparent 52%,#bff6ff66 100%)}' +
    '[data-fit=tight] #flowTag{top:17%;font-size:12px}[data-fit=tight] #flowTag b{font-size:17px}';
  document.head.appendChild(style);
  const host = document.getElementById('app') || document.body;
  const tag = document.createElement('div'); tag.id = 'flowTag'; tag.setAttribute('aria-hidden', 'true');
  tag.innerHTML = 'FLOW<b></b><i></i>';
  const edge = document.createElement('div'); edge.id = 'flowEdge';
  host.append(edge, tag);
  const count = tag.querySelector('b');

  function note() {
    const audio = sky.Ut;
    if (!audio?.ctx || !(U.volume > 0)) return;
    const t = audio.ctx.currentTime, step = SCALE[Math.min(chain - 1, SCALE.length - 1)];
    for (const [octave, gain] of chain >= 4 ? [[1, .05], [2, .022]] : [[1, .05]]) {
      const o = audio.ctx.createOscillator(), g = audio.ctx.createGain();
      o.type = 'triangle'; o.frequency.value = 392 * octave * Math.pow(2, step / 12);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + .012); g.gain.exponentialRampToValueAtTime(.0001, t + .2);
      o.connect(g); g.connect(audio.master); o.start(t); o.stop(t + .22);
    }
    sky.Mn?.(.07 + .012 * Math.min(chain, 6), 1500 + 160 * Math.min(chain, 6), .8, .2, 'bandpass');   // whoosh
  }
  function link(kind) {
    chain++; timer = WINDOW; pulse = 1; idle = 0; best = Math.max(best, chain);
    if (feelOn && chain >= 2) note();
    document.body.dataset.skyFlow = JSON.stringify({ chain, best, last: kind });
  }
  function drop(reason) {
    if (!chain) return;
    chain = 0; timer = 0;
    document.body.dataset.skyFlow = JSON.stringify({ chain, best, ended: reason });
  }
  function sync() { for (const key of MOVES) seen[key] = stats[key] || 0; life = c.life; falls = stats.falls || 0; prevJumps = stats.jumps || 0; }
  function reset() { chain = timer = pulse = airTime = idle = cooldown = 0; armed = false; swinging = false; takeoff = null; best = 0; sync(); }

  // ---- Landing ring + dust, and the trail from the 3rd link (visual only) ----
  const { Torus, Sphere, Box, Mesh, Basic } = sky.Geom, scene = sky.ue;
  const pool = (n, make) => Array.from({ length: n }, () => { const m = make(); m.visible = false; scene.add(m); return { m, t: 0, life: 1, vx: 0, vy: 0, vz: 0, s0: 1, s1: 1, a: 0 }; });
  const mat = (color, opacity) => new Basic({ color, transparent: true, opacity, depthWrite: false });
  const rings = pool(4, () => { const m = new Mesh(new Torus(1, .05, 4, 24), mat(0xe9dcc0, .5)); m.rotation.x = Math.PI / 2; return m; });
  const puffs = pool(16, () => new Mesh(new Sphere(.16, 6, 4), mat(0xd8c7a4, .5)));
  const streaks = pool(14, () => new Mesh(new Box(.055, .055, 1), mat(0xd6fbff, .5)));
  let ringI = 0, puffI = 0, streakI = 0, trailT = 0, wasGround = true, airT = 0, minVy = 0;
  const take = (list, idx) => list[idx % list.length];
  function landFx(power) {
    const r = take(rings, ringI++);
    r.t = r.life = .38; r.s0 = .25; r.s1 = .85 + .9 * power; r.a = .22 + .3 * power; r.m.visible = true;
    r.m.position.set(c.pos.x, c.pos.y + .06, c.pos.z);
    // The base game already throws a big puff on a hard landing (fall speed 7 or more); this fills in the rest.
    if (minVy > -7) for (let i = 0, n = 2 + Math.round(3 * power); i < n; i++) {
      const p = take(puffs, puffI++), a = Math.random() * Math.PI * 2;
      p.t = p.life = .5; p.s0 = .8; p.s1 = 2.2; p.a = .4; p.m.visible = true;
      p.m.position.set(c.pos.x + Math.cos(a) * .3, c.pos.y + .1, c.pos.z + Math.sin(a) * .3);
      p.vx = Math.cos(a) * (1 + 1.4 * power) * (.6 + Math.random() * .6); p.vz = Math.sin(a) * (1 + 1.4 * power) * (.6 + Math.random() * .6); p.vy = .3 + .5 * Math.random();
    }
  }
  // Vaults over something chest-high or more get a heavier thud and a little dust; low ones stay light.
  function heavyVault() {
    const l = c.ledge;
    if (!feelOn || !l || l.ty - l.sy < HIGH_VAULT) return;
    sky.Mn?.(.14, 240, .8, .13, 'lowpass');
    for (let i = 0; i < 3; i++) {
      const p = take(puffs, puffI++), a = Math.atan2(l.dx, l.dz) + (Math.random() - .5) * 1.6;
      p.t = p.life = .45; p.s0 = .7; p.s1 = 1.8; p.a = .35; p.m.visible = true;
      p.m.position.set(c.pos.x + Math.sin(a) * .35, c.pos.y + .15, c.pos.z + Math.cos(a) * .35);
      p.vx = Math.sin(a) * 1.2; p.vz = Math.cos(a) * 1.2; p.vy = .4;
    }
  }
  function landing(dt) {
    if (!feelOn) { wasGround = c.onGround; return; }
    if (!c.onGround) { airT += dt; minVy = Math.min(minVy, c.vel.y); }
    else {
      if (!wasGround && c.state === 'normal' && (airT >= .3 || minVy < -4)) landFx(clamp((-minVy - 3) / 7, .15, 1));
      airT = 0; minVy = 0;
    }
    wasGround = c.onGround;
  }
  function streak(speed) {
    const p = take(streaks, streakI++), side = Math.random() < .5 ? -1 : 1, yaw = Math.atan2(c.vel.x, c.vel.z), len = clamp(speed * .13, .9, 2.6), off = .5 + Math.random() * .55;
    p.t = p.life = .38; p.s0 = len; p.s1 = len * .4; p.a = .45 + .06 * Math.min(chain, 6); p.m.visible = true;
    p.m.position.set(c.pos.x + Math.cos(yaw) * off * side - Math.sin(yaw) * .6, c.pos.y + .3 + Math.random() * 1.1, c.pos.z - Math.sin(yaw) * off * side - Math.cos(yaw) * .6);
    p.m.rotation.set(0, yaw, 0); p.m.scale.set(1, 1, len);
  }
  function fx(dt, playing) {
    for (const p of rings) if (p.t > 0) {
      p.t -= dt; const k = 1 - Math.max(0, p.t) / p.life, r = p.s0 + (p.s1 - p.s0) * (1 - (1 - k) * (1 - k));
      p.m.scale.set(r, r, 1); p.m.material.opacity = p.a * (1 - k); if (p.t <= 0) p.m.visible = false;
    }
    for (const p of puffs) if (p.t > 0) {
      p.t -= dt; const k = 1 - Math.max(0, p.t) / p.life;
      p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt; p.vx *= 1 - 2 * dt; p.vz *= 1 - 2 * dt;
      p.m.scale.setScalar(p.s0 + (p.s1 - p.s0) * k); p.m.material.opacity = p.a * (1 - k); if (p.t <= 0) p.m.visible = false;
    }
    for (const p of streaks) if (p.t > 0) {
      p.t -= dt; const k = 1 - Math.max(0, p.t) / p.life;
      p.m.scale.z = p.s0 + (p.s1 - p.s0) * k; p.m.material.opacity = p.a * (1 - k); if (p.t <= 0) p.m.visible = false;
    }
    const speed = Math.hypot(c.vel.x, c.vel.z);
    trailT -= dt;
    if (playing && feelOn && !reduced && chain >= 3 && (speed > 4 || !c.onGround) && trailT <= 0) { trailT = .045; streak(Math.max(speed, 4)); streak(Math.max(speed, 4)); }
  }

  // ---- Gap auto-jump (trial) ----
  function floorAt(x, z, y, up = .42, down = .45) {
    let top = -Infinity;
    for (const s of sky.near(x - .05, z - .05, x + .05, z + .05)) {
      if (s.off || s.solid === false || s.type === 'mono') continue;
      if (x > s.minX && x < s.maxX && z > s.minZ && z < s.maxZ && s.maxY <= y + up && s.maxY >= y - down && s.maxY > top) top = s.maxY;
    }
    return top;
  }
  function gapAhead(speed) {
    const dx = c.vel.x / speed, dz = c.vel.z / speed, y = c.pos.y;
    let lip = 0;
    for (let d = .1; d <= 1.25; d += .1) if (!Number.isFinite(floorAt(c.pos.x + dx * d, c.pos.z + dz * d, y))) { lip = d; break; }
    if (!lip) return null;
    // A real gap, not a crack or a step down: nothing to stand on for the next metre.
    for (let d = lip + .2; d <= lip + 1; d += .2) if (Number.isFinite(floorAt(c.pos.x + dx * d, c.pos.z + dz * d, y, .42, 1.1))) return null;
    const ex = c.pos.x + dx * lip, ez = c.pos.z + dz * lip, v = Math.max(speed, U.sprintSpeed);
    let previous = y;
    for (let t = .08; t <= 1.7; t += .04) {
      const px = ex + dx * v * t, pz = ez + dz * v * t, py = y + U.jumpVel * t - .5 * U.gravity * t * t;
      if (!sky.oe(px, py + .15, pz, c.r * .9, 1.3)) return null;               // a wall or an overhang is in the way
      if (py < previous) {
        const top = floorAt(px, pz, previous, .02, previous - py + .02);
        // Land on something no more than 3 m below, with room to keep running.
        if (Number.isFinite(top)) return top >= y - 3 && Number.isFinite(floorAt(px + dx * .45, pz + dz * .45, top, .3, .3)) ? { lip, top, distance: v * t } : null;
      }
      if (py < y - 3) return null;
      previous = py;
    }
    return null;
  }
  function gapStep(dt) {
    armed = false; cooldown = Math.max(0, cooldown - dt);
    if (!autoJump || cooldown > 0 || !c.onGround || c.state !== 'normal' || c.h < 1.5 || c.jumpBuf > 0) return;
    const speed = Math.hypot(c.vel.x, c.vel.z);
    // Only for a committed run: near sprint pace and travelling the way the runner faces.
    if (speed < U.sprintSpeed * .8 || (-Math.sin(c.yaw) * c.vel.x - Math.cos(c.yaw) * c.vel.z) / speed < .9) return;
    const gap = gapAhead(speed);
    if (!gap) return;
    armed = true;                                   // edge-assist.js does not brake while a jump is lined up
    if (gap.lip <= Math.max(.2, speed * dt * 2.5)) {
      c.jumpBuf = U.jumpBuffer; cooldown = .6; autoJumps++;
      document.body.dataset.skyAutoJump = JSON.stringify({ count: autoJumps, distance: +gap.distance.toFixed(2), drop: +(c.pos.y - gap.top).toFixed(2) });
    }
  }

  function step(dt) {
    if (sky.modeRef() !== 'play' || z.over) { if (sky.modeRef() !== 'pause') reset(); return; }
    if (life === null) sync();
    gapStep(dt);
    for (const key of MOVES) {
      const now = stats[key] || 0;
      if (now > seen[key] && (!MOVING.has(key) || prevSpeed >= MOVING_MIN)) { link(key); if (key === 'vaults') heavyVault(); }
      seen[key] = now;
    }
    const swing = c.state === 'swing' || !!window.skySwing?.active;
    if (swinging && !swing) link('swing');
    swinging = swing;
    // Crossing open air on purpose: a jump was made, the landing is 3 m or more away, nothing underfoot
    // halfway, and it is not a long drop. Running or falling off an edge does not count.
    const flying = !c.onGround && c.state === 'normal';
    if (flying && !takeoff) takeoff = { x: c.pos.x, y: c.pos.y, z: c.pos.z, jumps: prevJumps };
    else if (!flying && takeoff) {
      if (c.onGround && (stats.jumps || 0) > takeoff.jumps && takeoff.y - c.pos.y <= GAP_MAX_DROP &&
        Math.hypot(c.pos.x - takeoff.x, c.pos.z - takeoff.z) >= GAP_MIN &&
        !Number.isFinite(floorAt((c.pos.x + takeoff.x) / 2, (c.pos.z + takeoff.z) / 2, Math.max(takeoff.y, c.pos.y), .3, 1.2))) link('gap');
      takeoff = null;
    }
    prevJumps = stats.jumps || 0; prevSpeed = Math.hypot(c.vel.x, c.vel.z);
    landing(dt);
    if (!chain) { life = c.life; falls = stats.falls || 0; return; }
    const speed = Math.hypot(c.vel.x, c.vel.z), busy = !c.onGround || c.state !== 'normal';
    if (!busy) timer -= dt;                         // the clock only runs while simply running
    idle = !busy && speed < 1.5 ? idle + dt : 0;
    if (c.life < life) drop('hit'); else if ((stats.falls || 0) > falls) drop('fall');
    else if (timer <= 0) drop('time'); else if (idle > .7) drop('stopped');
    life = c.life; falls = stats.falls || 0;
  }

  function frame(dt) {
    const playing = sky.modeRef() === 'play' && !z.over;
    fx(dt, playing);
    const dash = window.skyDash;
    if (dash && !patched) { patched = true; const original = dash.fov; dash.fov = base => original(base) + (feelOn ? (reduced ? .4 : 1) * (3.5 * level + 4.5 * airView) : 0); }
    if (!playing || !feelOn) { tag.style.opacity = edge.style.opacity = '0'; level = airView = 0; return; }
    const speed = Math.hypot(c.vel.x, c.vel.z), flying = !c.onGround && (c.state === 'normal' || c.state === 'slide');
    airTime = flying ? airTime + dt : 0;
    airView = ease(airView, flying ? smooth(.16, .55, airTime) * smooth(2, 5, speed) : 0, dt, flying ? 5 : 10);
    level = ease(level, chain >= 2 ? Math.min(chain, 6) / 6 : 0, dt, 4);
    pulse = Math.max(0, pulse - dt * 4);
    if (dash?.camera) {                             // dash.frame() has just written this frame's chase values
      dash.camera.distance += .4 * airView + .15 * level;
      dash.camera.height += .2 * airView;
    }
    const shown = chain >= 2;
    tag.style.opacity = shown ? '1' : '0';
    if (shown) {
      count.textContent = '×' + chain;
      tag.style.setProperty('--pop', (1 + .28 * pulse).toFixed(3));
      tag.style.setProperty('--left', clamp(timer / WINDOW).toFixed(3));
    }
    edge.style.opacity = reduced ? '0' : (pulse * (.25 + .45 * Math.min(chain, 6) / 6) * (chain >= 2 ? 1 : 0)).toFixed(3);
  }

  window.skyFlow = { step, frame, reset,
    get armed() { return armed; },
    get state() { return { chain, best, timer, level, airView, autoJump, autoJumps }; },
    set autoJump(value) { autoJump = !!value; }, get autoJump() { return autoJump; } };
  document.body.dataset.skyFlowReady = 'true';
})();
