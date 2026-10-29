import { bindSkillPress } from './player-skills.js?v=20261030-decoy-v1';

export const DECOY = Object.freeze({ duration: 6, cooldown: 18, radius: 16, releaseRadius: 22, speed: 2.4, travel: 4.8 });

export function canSeeDecoy(enemy, position, raycast, radius = DECOY.radius) {
  if (enemy.dead || enemy.remove || enemy.spawnT > 0 || enemy.rise || enemy.fall || Math.abs(enemy.pos.y - position.y) > 4) return false;
  const dx = position.x - enemy.pos.x, dy = position.y + 1.1 - (enemy.pos.y + Math.min(1.5, enemy.h * .8)), dz = position.z - enemy.pos.z;
  const distance = Math.hypot(dx, dy, dz);
  return distance <= radius && (distance < .1 || !raycast(enemy.pos.x, enemy.pos.y + Math.min(1.5, enemy.h * .8), enemy.pos.z,
    dx / distance, dy / distance, dz / distance, Math.max(.01, distance - .15)));
}

export function createDecoy(game, runtime) {
  const { c, z, Jt, Geom, ue, rn } = game;
  const { Group, Mesh, Torus, Basic, Box, Sphere, Vector3, BufferGeometry, Float32Attribute, Line } = Geom;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = new Group(); root.name = 'Decoy skill effects'; ue.add(root);
  const ringGeometry = new Torus(1, .018, 4, 48), lineGeometry = new BufferGeometry();
  const cyan = new Basic({ color: 0x58ffed, transparent: true, opacity: .8, depthWrite: false, fog: false, toneMapped: false, blending: 2 });
  const pink = cyan.clone(); pink.color.setHex(0xff5fdf);
  const rings = [cyan, pink, cyan].map((mat, i) => {
    const mesh = new Mesh(ringGeometry, mat); mesh.rotation.x = Math.PI / 2; root.add(mesh); return mesh;
  });
  const particleGeometry = new Box(.035, .18, .035);
  const particles = Array.from({ length: 18 }, (_, i) => {
    const mesh = new Mesh(particleGeometry, i % 2 ? cyan : pink); root.add(mesh); return mesh;
  });
  const trail = new Line(lineGeometry, cyan); root.add(trail); trail.frustumCulled = false;
  // Fixed-size geometry avoids per-frame GPU allocations.
  const trailPositions = new Float32Array(24 * 3), trailAttribute = new Float32Attribute(trailPositions, 3);
  lineGeometry.setAttribute('position', trailAttribute); lineGeometry.setDrawRange(0, 0);
  let active = null, cooldown = 0, scanTime = 0, fieldTime = 0, lastNode = -1, hudStamp = '';
  const lured = new Set(), field = new Float32Array(runtime.NAV.nodes.length);
  const stats = { used: 0, attracted: 0, fieldBuilds: 0 };
  const button = document.getElementById('tDecoy');
  const banner = document.createElement('div'); banner.id = 'decoyBanner'; banner.setAttribute('role', 'status');
  const pulse = document.createElement('div'); pulse.id = 'decoyPulse'; pulse.setAttribute('aria-hidden', 'true');
  document.getElementById('hud').append(banner); document.getElementById('app').append(pulse);
  root.visible = false;
  const playing = () => game.modeRef() === 'play' && !z.over && !game.demoActive();
  const available = () => playing() && !active && cooldown <= 0;

  function fallbackAvatar(color) {
    const avatar = new Group(), material = new Basic({ color, transparent: true, opacity: .7, depthWrite: false, fog: false, toneMapped: false, blending: 1 });
    const geometries = [], limbs = [];
    function part(w, h, d, x, y, zz) {
      const geometry = new Box(w, h, d); geometries.push(geometry);
      const mesh = new Mesh(geometry, material); mesh.position.set(x, y, zz); avatar.add(mesh); return mesh;
    }
    part(.4, .58, .23, 0, 1.1, 0);
    const geometry = new Sphere(.15, 10, 8); geometries.push(geometry);
    const head = new Mesh(geometry, material); head.position.y = 1.62; avatar.add(head);
    for (const side of [-1, 1]) { limbs.push(part(.12, .67, .14, side * .12, .43, 0)); limbs.push(part(.1, .59, .12, side * .29, 1.12, 0)); }
    return { root: avatar, material, animate(t, moving) { limbs.forEach((p, i) => p.rotation.x = moving ? Math.sin(t * 10 + i * Math.PI) * .65 : 0); },
      dispose() { avatar.removeFromParent(); material.dispose(); geometries.forEach(g => g.dispose()); } };
  }
  const avatar = color => window.skyHumanView?.createDecoyAvatar(color) || fallbackAvatar(color);

  function supported(p) {
    return game.oe(p.x, p.y + .025, p.z, .3, 1.8) && runtime.near(p.x - .3, p.z - .3, p.x + .3, p.z + .3).some(b =>
      b.solid && !b.off && b.type !== 'mono' && Math.abs(b.maxY - p.y) < .18 &&
      p.x - .25 >= b.minX && p.x + .25 <= b.maxX && p.z - .25 >= b.minZ && p.z + .25 <= b.maxZ);
  }
  function landing() {
    let p = c.pos.clone();
    if (!c.onGround || c.state !== 'normal') {
      const node = runtime.nodeAt(c.pos.x, c.pos.y + .1, c.pos.z), n = runtime.NAV.nodes[node];
      if (n && Math.hypot(n.x - c.pos.x, n.z - c.pos.z) < 2 && Math.abs(n.y - c.pos.y) < 4) p.set(n.x, n.y + .01, n.z);
      else if (c.lastGround && c.lastGround.distanceTo(c.pos) < 7) p.copy(c.lastGround);
      else return null;
    }
    return supported(p) ? p : null;
  }
  function release(enemy) {
    if (!lured.delete(enemy)) return;
    enemy.navT = 0; enemy.edge = -1; enemy.atkT = 0; enemy.lost = false; enemy.visT = 0;
  }
  function clear() {
    cancelPress();
    for (const enemy of [...lured]) release(enemy);
    if (active) for (const body of [active.body, ...active.echoes]) body.dispose();
    active = null; root.visible = false; pulse.style.opacity = '0'; banner.classList.remove('on');
    lineGeometry.setDrawRange(0, 0); lastNode = -1; hudStamp = ''; hud();
  }
  function reset() { clear(); cooldown = 0; scanTime = fieldTime = 0; runtime.stats.decoys = runtime.stats.decoyLures = 0; hud(); }
  function hud() {
    const value = active ? `${Math.ceil(DECOY.duration - active.age)}s` : cooldown > 0 ? `${Math.ceil(cooldown)}` : 'E';
    const state = `${value}:${!!active}:${cooldown > 0}:${available()}`;
    if (state !== hudStamp) {
      button.querySelector('.skill-value').textContent = value;
      button.classList.toggle('active', !!active); button.classList.toggle('cool', cooldown > 0 && !active);
      button.setAttribute('aria-disabled', String(!available()));
      button.setAttribute('aria-label', active ? `分身発動中 残り${value}` : cooldown > 0 ? `分身 再使用まで${value}秒` : '分身 E 6秒間ゾンビを撹乱');
      hudStamp = state;
    }
    button.style.setProperty('--skill-progress', String(active ? Math.max(0, 1 - active.age / DECOY.duration) : 1 - cooldown / DECOY.cooldown));
  }
  function buildField(force = false) {
    const node = runtime.nodeAt(active.pos.x, active.pos.y + .1, active.pos.z);
    if (node < 0) { field.fill(Infinity); lastNode = -1; return; }
    if (force || node !== lastNode) { game.decoyField(node, field); lastNode = node; stats.fieldBuilds++; }
  }
  function scan() {
    for (const enemy of Jt) {
      const node = runtime.nodeAt(enemy.pos.x, enemy.pos.y + .1, enemy.pos.z);
      if (lured.has(enemy)) {
        if (enemy.dead || enemy.remove || enemy.pos.distanceTo(active.pos) > DECOY.releaseRadius || node < 0 || !Number.isFinite(field[node])) release(enemy);
      } else if (node >= 0 && Number.isFinite(field[node]) && canSeeDecoy(enemy, active.pos, game.raycast)) {
        lured.add(enemy); enemy.navT = 0; enemy.edge = -1; enemy.guard = 0; enemy.atkT = 0;
        stats.attracted++; runtime.stats.decoyLures = (runtime.stats.decoyLures || 0) + 1;
      }
    }
  }
  function activate() {
    if (!available()) return false;
    const pos = landing();
    if (!pos) { rn('分身を出せる足場の近くで使おう'); return false; }
    const speed = Math.hypot(c.vel.x, c.vel.z), direction = new Vector3(speed > .5 ? c.vel.x / speed : -Math.sin(c.yaw), 0, speed > .5 ? c.vel.z / speed : -Math.cos(c.yaw));
    // Walk only a checked, supported lane. The hologram never crosses a wall,
    // floats across a gap, or drags its navigation field onto another floor.
    let travel = 0;
    for (let d = .2; d <= DECOY.travel; d += .2) { if (!supported(pos.clone().addScaledVector(direction, d))) break; travel = d; }
    const body = avatar(0xff65df), echoes = reduced ? [] : [avatar(0x5dfff0), avatar(0xff8ce9)];
    ue.add(body.root); echoes.forEach(e => ue.add(e.root));
    active = { pos, start: pos.clone(), direction, travel, age: 0, body, echoes, yaw: Math.atan2(direction.x, direction.z), history: [], historyTime: 0 };
    cooldown = DECOY.cooldown; scanTime = fieldTime = 0; root.visible = true;
    stats.used++; runtime.stats.decoys = (runtime.stats.decoys || 0) + 1;
    buildField(true); scan(); frame(); hud();
    rn('分身発動 — 追手を引きつけて逃げよう');
    // A rising electronic sweep and two soft overtones, separate from gunfire.
    const { ctx, master } = game.Ut;
    if (ctx && master) for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator(), gain = ctx.createGain(), t = ctx.currentTime + i * .045;
      osc.type = 'sine'; osc.frequency.setValueAtTime(180 + i * 140, t); osc.frequency.exponentialRampToValueAtTime(1100 + i * 300, t + .22);
      gain.gain.setValueAtTime(.0001, t); gain.gain.exponentialRampToValueAtTime(.065, t + .02); gain.gain.exponentialRampToValueAtTime(.0001, t + .45);
      osc.connect(gain); gain.connect(master); osc.start(t); osc.stop(t + .46); osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    }
    return true;
  }
  function tick(dt) {
    if (!playing()) return;
    cooldown = Math.max(0, cooldown - dt);
    if (active) {
      active.age += dt;
      if (active.age >= DECOY.duration) { clear(); hud(); return; }
      const distance = Math.min(active.travel, Math.max(0, active.age - .2) * DECOY.speed);
      const next = active.start.clone().addScaledVector(active.direction, distance);
      if (supported(next)) active.pos.copy(next); else active.travel = active.start.distanceTo(active.pos);
      fieldTime -= dt; scanTime -= dt;
      if (fieldTime <= 0) { buildField(); fieldTime = .4; }
      if (scanTime <= 0) { scan(); scanTime = .16; }
      active.historyTime -= dt;
      if (active.historyTime <= 0) { active.history.push(active.pos.clone()); if (active.history.length > 24) active.history.shift(); active.historyTime = .05; }
    }
    hud();
  }
  function frame() {
    if (!active) return;
    const a = active, t = a.age, fade = Math.min(1, t / .14, (DECOY.duration - t) / .5);
    const moving = t > .2 && (t - .2) * DECOY.speed < a.travel;
    a.body.root.position.copy(a.pos); a.body.root.rotation.set(0, a.yaw, 0);
    a.body.material.opacity = fade * .68; a.body.animate(t, moving);
    const split = Math.sin(Math.min(1, t / .65) * Math.PI) * .8;
    a.echoes.forEach((e, i) => {
      e.root.visible = t < .65; e.root.position.copy(a.pos).addScaledVector(a.direction, -.28 * (i + 1));
      e.root.position.x += a.direction.z * split * (i ? -1 : 1); e.root.position.z -= a.direction.x * split * (i ? -1 : 1);
      e.root.rotation.copy(a.body.root.rotation); e.material.opacity = fade * Math.max(0, 1 - t / .65) * .35; e.animate(t + .06 * i, moving);
    });
    rings.forEach((ring, i) => {
      ring.position.copy(a.pos); ring.position.y += i === 2 ? .95 + Math.sin(t * 4) * .65 : .05 + i * .04;
      const radius = i === 2 ? .55 : t < .65 ? .3 + t * (i ? 2.4 : 3.8) : .85 + i * .15 + Math.sin(t * 4 + i) * .06;
      ring.scale.setScalar(radius); ring.rotation.z = t * (i % 2 ? -1 : 1);
      ring.visible = i !== 2 || !reduced;
    });
    particles.forEach((p, i) => {
      const angle = i * 2.399 + t * (reduced ? 0 : .8), radius = .55 + (i % 3) * .22;
      p.position.set(a.pos.x + Math.cos(angle) * radius, a.pos.y + ((i / particles.length * 2 + t * .6) % 2.2), a.pos.z + Math.sin(angle) * radius);
      p.rotation.z = angle; p.visible = !reduced;
    });
    cyan.opacity = fade * .7; pink.opacity = fade * .65;
    a.history.forEach((p, i) => { trailAttribute.array.set([p.x, p.y + .12, p.z], i * 3); });
    trailAttribute.needsUpdate = true; lineGeometry.setDrawRange(0, a.history.length);
    pulse.style.opacity = String(reduced ? 0 : Math.max(0, 1 - t / .5) * .7);
    banner.textContent = `DECOY / 分身  ${Math.ceil(DECOY.duration - t)}s · 誘導 ${lured.size}体`;
    banner.classList.toggle('on', t < 1.4 || t > DECOY.duration - 1.5);
  }
  const cancelPress = bindSkillPress(button, available, activate);
  document.addEventListener('keydown', e => { if (e.code === 'KeyE' && !e.repeat && playing() && !/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName)) { e.preventDefault(); activate(); } });
  hud();
  return { activate, tick, frame, reset, clear, stats, config: DECOY,
    get active() { return active; }, get remaining() { return active ? Math.max(0, DECOY.duration - active.age) : 0; }, get cooldown() { return cooldown; },
    get lured() { return lured; },
    targetFor(enemy) { return active && playing() && lured.has(enemy) ? active.pos : null; },
    navigationFor(enemy) { return active && lured.has(enemy) ? field : null; },
    touching(enemy, distance) { return !!active && lured.has(enemy) && enemy.pos.distanceTo(active.pos) < distance; },
    modeChanged(mode) { cancelPress(); hudStamp = ''; if (mode === 'menu' || mode === 'over') clear(); else hud(); }
  };
}
