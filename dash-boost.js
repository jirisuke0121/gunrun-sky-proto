// Lightweight sprint camera, collectible boost and pooled world effects.
export const DASH_SECONDS = 5;
export const DASH_MULTIPLIER = 1.3;
export const DASH_RESPAWN = 36;
export const SWING_BOOST_SECONDS = 4;
export const SWING_BOOST_MULTIPLIER = 1.08;
const clamp = x => Math.max(0, Math.min(1, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const ease = (from, to, dt, rate) => from + (to - from) * (1 - Math.exp(-dt * rate));

export function boostEnvelope(remaining, age = DASH_SECONDS - remaining) {
  return smooth(0, .55, remaining) * smooth(0, .16, age);
}
export function segmentDistance(point, from, to) {
  const d = to.map((v, k) => v - from[k]), length = d.reduce((s, v) => s + v * v, 0);
  const t = length ? clamp(d.reduce((s, v, k) => s + (point[k] - from[k]) * v, 0) / length) : 0;
  return Math.hypot(...point.map((v, k) => v - from[k] - d[k] * t));
}

// Select connected, uncrowded floor nodes. Never put an item over an arbitrary
// x/z coordinate where the actual map may contain a roof, a wall or a gap.
export function pickupNodes(graph, spawn, yaw, clear, targets = [6, 20, 36, 52]) {
  const nodes = graph.nodes;
  if (!nodes.length) return [];
  let start = 0, best = Infinity;
  nodes.forEach((n, i) => { const d = Math.hypot(n.x - spawn.x, n.y - spawn.y, n.z - spawn.z); if (d < best) { start = i; best = d; } });
  const steps = new Int32Array(nodes.length).fill(-1), queue = [start]; steps[start] = 0;
  for (let at = 0; at < queue.length; at++) {
    const id = queue[at];
    for (const e of graph.out[id] || []) {
      const edge = graph.E[e];
      if (edge.kind !== 0 || steps[edge.to] >= 0 || edge.door && !edge.door.off) continue;
      steps[edge.to] = steps[id] + 1; queue.push(edge.to);
    }
  }
  const forward = [-Math.sin(yaw), -Math.cos(yaw)], chosen = [];
  const candidates = nodes.filter(n => steps[n.id] >= 3 && (graph.out[n.id] || []).filter(e => graph.E[e].kind === 0).length >= 3);
  for (const target of targets) {
    let pick = null, score = Infinity;
    for (const n of candidates) {
      const dx = n.x - spawn.x, dz = n.z - spawn.z, d = Math.hypot(dx, dz);
      if (d < 4 || chosen.some(p => Math.hypot(p.x - n.x, p.y - n.y, p.z - n.z) < 9)) continue;
      if (target === 6 && Math.abs(n.y - spawn.y) > .2) continue;
      const next = Math.abs(d - target) + Math.abs(n.y - spawn.y) * .5 + (target === 6 ? (d - dx * forward[0] - dz * forward[1]) * .45 : 0);
      if (next >= score || !clear(n)) continue;
      pick = n; score = next;
    }
    if (pick) chosen.push(pick);
  }
  return chosen;
}

export function createDash(sky, game) {
  const { c, U, Et, z, Geom: T, ue: world } = sky;
  const { Vector3, Group, Mesh, Torus, Box, Basic, BufferGeometry, Float32Attribute } = T;
  const root = new Group(); root.name = 'DASH pickups and effects'; world.add(root);
  const cyan = new Basic({ color: 0x24dce9, transparent: true, opacity: .88, depthWrite: false });
  const white = new Basic({ color: 0xe0ffff, transparent: true, opacity: .95 });
  const ringGeometry = new Torus(.44, .035, 5, 24), coreGeometry = new Box(.19, .3, .19);
  let labelMaterial = null;
  if (T.Sprite && T.CanvasTexture && T.SpriteMaterial) {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 80;
    const context = canvas.getContext('2d'); context.font = '700 44px system-ui'; context.textAlign = 'center';
    context.lineWidth = 7; context.strokeStyle = '#143c42'; context.fillStyle = '#9dffff';
    context.strokeText('DASH', 128, 56); context.fillText('DASH', 128, 56);
    labelMaterial = new T.SpriteMaterial({ map: new T.CanvasTexture(canvas), transparent: true, depthWrite: false });
  }
  const items = Array.from({ length: 2 }, (_, id) => {
    const group = new Group(), ring = new Mesh(ringGeometry, cyan), core = new Mesh(coreGeometry, white);
    const halo = new Mesh(ringGeometry, cyan); halo.rotation.y = Math.PI / 2; halo.scale.setScalar(.72);
    core.rotation.z = Math.PI / 4; group.add(ring, halo, core); root.add(group); group.visible = false;
    if (labelMaterial) { const label = new T.Sprite(labelMaterial); label.scale.set(.95, .3, 1); label.position.y = .7; group.add(label); }
    return { id, group, ring, core, node: null, cooldown: 0 };
  });
  const streakGeometry = new BufferGeometry(), streakPositions = new Float32Array(16 * 12 * 3);
  streakGeometry.setAttribute('position', new Float32Attribute(streakPositions, 3)); streakGeometry.setDrawRange(0, 0);
  const streak = new Mesh(streakGeometry, new Basic({ color: 0x12c9e7, transparent: true, opacity: .42, depthWrite: false, side: 2 }));
  streak.frustumCulled = false; root.add(streak); streak.visible = false;
  const echoes = Array.from({ length: 3 }, () => {
    const m = new Mesh(ringGeometry, cyan.clone()); m.visible = false; root.add(m); return m;
  });
  const burst = new Mesh(ringGeometry, cyan.clone()); burst.visible = false; root.add(burst); burst.rotation.x = Math.PI / 2;
  const style = document.createElement('style');
  style.textContent = '#dashSpeedFx{position:fixed;inset:0;pointer-events:none;z-index:5;opacity:0;background:repeating-conic-gradient(from 3deg at 50% 48%,#b5fbff88 0deg .35deg,transparent .35deg 19deg);-webkit-mask:radial-gradient(ellipse at 50% 48%,transparent 37%,#000 93%);mask:radial-gradient(ellipse at 50% 48%,transparent 37%,#000 93%)}#dashPickupFlash{position:fixed;inset:0;pointer-events:none;z-index:6;background:radial-gradient(ellipse at center,transparent 25%,#a2f9ff);opacity:0}#dashStatus{position:static;margin-top:2px;padding:0;border:0;background:none;color:#a8ffca;font:700 11px/1.4 system-ui;white-space:nowrap;font-variant-numeric:tabular-nums;pointer-events:none}#dashStatus[hidden]{display:none}html.touch #hud:has(#dashStatus:not([hidden])) #weaponSupplyStatus{top:calc(var(--touch-top) + 78px)}';
  document.head.appendChild(style);
  const lines = document.createElement('div'); lines.id = 'dashSpeedFx'; document.body.appendChild(lines);
  const flash = document.createElement('div'); flash.id = 'dashPickupFlash'; document.body.appendChild(flash);
  const status = document.createElement('div'); status.id = 'dashStatus'; status.hidden = true;
  const label = document.createElement('span'); status.append(label);
  const life = document.querySelector('.hud-tl .life');
  if (life) life.after(status); else (document.getElementById('hud') || document.body).appendChild(status);
  const rule = document.querySelector('#ovStart .rules .keys');
  if (rule) { const li = document.createElement('li'); li.textContent = '青いDASHリングを取ると5秒間、速度が1.3倍。再出現は36秒後'; rule.appendChild(li); }
  let swingRemaining = 0;
  let remaining = 0, age = 0, time = 0, pulse = 0, run = 0, boost = 0, aimTime = 0, shots = game.stats.shots || 0;
  let previous = null, previousFactor = 1, swingView = 0;
  const trail = [], forward = new Vector3(), right = new Vector3(), centre = new Vector3();
  const camera = { distance: 3.6, shoulder: .62, height: .18 };
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
  function reset(round = false) {
    swingRemaining = remaining = age = pulse = boost = aimTime = 0; previousFactor = 1; previous = null; trail.length = 0;
    streak.visible = burst.visible = false; echoes.forEach(m => { m.visible = false; });
    lines.style.opacity = flash.style.opacity = '0'; status.hidden = true;
    if (round) { items.forEach(i => { i.cooldown = 0; }); game.stats.dashPickups = 0; }
  }
  function placePickups(position, yaw) {
    const selected = window.skyPracticeMode ? window.skyPracticeCourse.dashPositions.map(([x,y,z],id)=>({x,y,z,id})) : pickupNodes(game.NAV, position, yaw, n => [[0, 0], [.48, 0], [-.48, 0], [0, .48], [0, -.48]].every(([x, z]) => sky.oe(n.x + x, n.y + .05, n.z + z, .28, 1.8)));
    items.forEach((item, i) => { item.node = selected[i * 2] || selected[i] || null; if (item.node) item.group.position.set(item.node.x, item.node.y + 1.05, item.node.z); item.group.visible = false; });
  }
  function collect(item) {
    const refreshing = remaining > 0;
    item.cooldown = window.skyPracticeMode ? 3 : DASH_RESPAWN; item.group.visible = false; remaining = DASH_SECONDS; pulse = .42;
    if (!refreshing) age = 0;
    game.stats.dashPickups = (game.stats.dashPickups || 0) + 1; previousFactor = 1;
    burst.position.set(c.pos.x, c.pos.y + .2, c.pos.z); trail.length = 0;
    sky.Tt.mark?.(); document.body.dataset.skyDashCollected = String(game.stats.dashPickups);
  }
  // A successful release refreshes a small reward; it never stacks with itself.
  function rewardSwing() { swingRemaining = SWING_BOOST_SECONDS; }
  function factor(sprinting = true) {
    return (1 + (sprinting ? (DASH_MULTIPLIER - 1) * boostEnvelope(remaining, age) : 0)) *
      (1 + (SWING_BOOST_MULTIPLIER - 1) * smooth(0, .4, swingRemaining));
  }
  function step(dt) {
    if (sky.modeRef() !== 'play' || z.over) return;
    swingRemaining = Math.max(0, swingRemaining - dt);
    remaining = Math.max(0, remaining - dt); age = remaining > 0 ? age + dt : 0; pulse = Math.max(0, pulse - dt); aimTime = Math.max(0, aimTime - dt);
    if ((game.stats.shots || 0) !== shots) { shots = game.stats.shots || 0; aimTime = .28; }
    const from = previous || c.pos.toArray(), to = c.pos.toArray();
    const teleported = Math.hypot(...from.map((v, k) => v - to[k])) > 4;
    for (const item of items) {
      item.cooldown = Math.max(0, item.cooldown - dt);
      if (!item.node || item.cooldown > 0 || z.mission) continue;
      const p = [item.node.x, item.node.y + 1.05, item.node.z], a = (teleported ? to : from).map((v, k) => v + (k === 1 ? .9 : 0)), b = to.map((v, k) => v + (k === 1 ? .9 : 0));
      if (segmentDistance(p, a, b) < .72) collect(item);
    }
    previous = to;
    const speedFactor = factor(), speed = Math.hypot(c.vel.x, c.vel.z);
    // Smoothly remove only the speed granted by this item. Do not cap a hook,
    // slide, explosion or any other source of momentum.
    if (speedFactor < previousFactor && c.onGround && c.state === 'normal' && speed <= U.sprintSpeed * previousFactor + .15 && speed > U.sprintSpeed * speedFactor) {
      c.vel.x *= U.sprintSpeed * speedFactor / speed; c.vel.z *= U.sprintSpeed * speedFactor / speed;
    }
    previousFactor = speedFactor;
  }
  function frame(dt) {
    const playing = sky.modeRef() === 'play' && !z.over;
    root.visible = sky.modeRef() === 'play' && !z.mission && !z.over;
    if (!playing) {
      lines.style.opacity = flash.style.opacity = '0'; status.hidden = true;
      if (sky.modeRef() !== 'pause') { reset(); run = 0; }
      return;
    }
    time += dt;
    const speed = Math.hypot(c.vel.x, c.vel.z), aiming = aimTime > 0 || Et.reloadT > 0 || window.skyHumanView?.isFiring;
    const free = c.state !== 'ladder' && c.state !== 'ledge';
    const strength = free ? smooth(U.walkSpeed + .12, U.sprintSpeed - .05, Math.max(speed,window.skySwing?.cameraSpeed||0)) * (aiming ? .22 : 1) : 0;
    run = ease(run, strength, dt, 7); boost = ease(boost, remaining > 0 ? boostEnvelope(remaining, age) : 0, dt, 12);
    const swingTarget=window.skySwing?.active ? 1 : c.swingFlight ? Math.exp(-c.swingFlight.age*2.5) : 0;
    swingView = ease(swingView, swingTarget, dt, reduced ? 5 : 9);
    camera.distance = 3.6 + run * .25 + boost * run * .3 + .25 * swingView;
    camera.shoulder = .62 - run * .28 - boost * run * .1 + 1.4 * swingView;
    camera.height = .18 - run * .3 - boost * run * .07 + .28 * swingView;
    const moving = smooth(.7, U.sprintSpeed, speed), trailOn = boost * moving;
    lines.style.opacity = String((reduced ? .16 : .38) * run * (.35 + .65 * boost));
    flash.style.opacity = String(reduced ? 0 : .13 * pulse / .42);
    status.hidden = remaining <= 0 && swingRemaining <= 0;
    label.textContent = `速度 +${Math.round((factor() - 1) * 100)}% ↑`;
    for (const item of items) {
      item.group.visible = !!item.node && item.cooldown <= 0;
      if (!item.node) continue;
      item.group.position.y = item.node.y + 1.05 + Math.sin(time * 2.4 + item.id) * .08;
      item.ring.rotation.y = time * 1.8; item.core.rotation.y = -time * 2;
    }
    forward.set(c.vel.x, 0, c.vel.z); if (speed > .1) forward.multiplyScalar(1 / speed); else forward.set(-Math.sin(c.yaw), 0, -Math.cos(c.yaw));
    right.set(-forward.z, 0, forward.x); centre.copy(c.pos); centre.y += .85;
    if (trailOn > .08 && (!trail.length || centre.distanceTo(trail[0].p) > .12)) trail.unshift({ p: centre.clone(), t: time, side: right.clone() });
    while (trail.length > 17 || trail.length && time - trail.at(-1).t > .42) trail.pop();
    let at = 0;
    const put = p => { streakPositions[at++] = p.x; streakPositions[at++] = p.y; streakPositions[at++] = p.z; };
    if (trailOn > .04) for (let i = 1; i < trail.length; i++) for (const side of [-1, 1]) {
      const a = trail[i - 1], b = trail[i], width = .09 * (1 - i / 18), offset = .21;
      const a0 = a.p.clone().addScaledVector(a.side, side * offset), a1 = a0.clone(); a1.y += width;
      const b0 = b.p.clone().addScaledVector(b.side, side * offset), b1 = b0.clone(); b1.y += width;
      [a0, b0, a1, a1, b0, b1].forEach(put);
    }
    streakGeometry.attributes.position.needsUpdate = true; streakGeometry.setDrawRange(0, at / 3); streak.visible = at > 0; streak.material.opacity = .5 * trailOn;
    echoes.forEach((m, i) => {
      m.visible = trailOn > .1 && !reduced && free;
      const phase = (time * 2 + i / 3) % 1;
      m.position.copy(centre).addScaledVector(forward, -.2 - phase * 1.9);
      m.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), forward); m.scale.setScalar(.6 + phase * .65); m.material.opacity = (1 - phase) * .32 * trailOn;
    });
    burst.visible = pulse > 0 && !reduced;
    burst.scale.setScalar(1 + (1 - pulse / .42) * 5); burst.material.opacity = pulse / .42 * .65;
    document.body.dataset.skyDash = JSON.stringify({ remaining: +remaining.toFixed(3), factor: +factor().toFixed(3), swingRemaining: +swingRemaining.toFixed(3), run: +run.toFixed(3), boost: +boost.toFixed(3), distance: +camera.distance.toFixed(3), pickups: items.filter(i => i.node && i.cooldown <= 0).length });
  }
  return { step, frame, reset, placePickups, camera, rewardSwing,
    speed: (base, sprinting = true) => base * factor(sprinting),
    get swingRemaining() { return swingRemaining; },
    fov: original => {
      const normal=Math.min(122,Math.max(original,U.fov+U.fovKick*.8*run+7*boost*run));
      return normal+(Math.min(normal,94)-normal)*swingView;
    },
    get boost() { return boost; }, get remaining() { return remaining; },
    get pickups() { return items.filter(i => i.node).map(i => ({ id: i.id, nodeId: i.node.id, position: [i.node.x, i.node.y, i.node.z], cooldown: i.cooldown })); }
  };
}
