// Old-town doors: proximity interaction, shared hand/leaf timing and original audio.
window.skyZombieCrawlSpeed = (speed, stalker = false) => Math.min(speed * .18, stalker ? 1.35 : 1.15);
const doorClamp = x => Math.max(0, Math.min(1, x));
const doorEase = x => { const t = doorClamp(x); return t * t * (3 - 2 * t); };
window.renderSkyDoorSound = function (kind, rate) {
  const duration = { open: .22, close: .18, hit: .26, strain: .68, break: 1.08 }[kind];
  if (!duration) throw new Error('Unknown door sound');
  const pcm = new Float32Array(Math.ceil(rate * duration));
  let seed = 3917, low = 0;
  for (let i = 0; i < pcm.length; i++) {
    const t = i / rate;
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    const noise = (seed >>> 0) / 2147483648 - 1;
    low += (noise - low) * .12;
    const body = Math.sin(2 * Math.PI * 74 * t) * .34 + Math.sin(2 * Math.PI * 183 * t) * .14;
    let sample = (body + low) * Math.exp(-t * (kind === 'hit' ? 24 : 16));
    if (kind === 'open') sample = (noise - low) * .28 * Math.exp(-t * 50) + (Math.sin(2 * Math.PI * (310 * t - 85 * t * t)) * .1 + low * .35) * Math.sin(Math.PI * t / duration) ** 2;
    if (kind === 'close' && t > .11) sample += Math.sin(2 * Math.PI * 1350 * t) * Math.exp(-(t - .11) * 70) * .18;
    if (kind === 'strain') sample += (Math.sin(2 * Math.PI * (155 * t + 70 * t * t)) * .23 + noise * .12) * Math.exp(-t * 3.5) * (.4 + .6 * Math.sin(t * 39) ** 2);
    if (kind === 'break') {
      sample += low * 2 * Math.exp(-t * 11) + (noise * .38 + Math.sin(2 * Math.PI * 570 * t) * .13) * Math.exp(-t * 4) * (.35 + .65 * Math.sin(t * 95) ** 2);
      for (const impact of [.19, .34, .56]) if (t > impact) sample += noise * .18 * Math.exp(-(t - impact) * 35);
    }
    pcm[i] = Math.tanh(sample * 1.8) * Math.min(1, t / .002) * Math.min(1, (duration - t) / .03) * .72;
  }
  return pcm;
};

window.createSkyDoorFeedback = function ({ THREE: T, scene, audio, player, zombies, notice }) {
  const fragments = [], buffers = new Map();
  let fragmentGeometry, fragmentMaterial;
  const center = b => [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2];
  const coordinate = (p, d) => p.pos[d.axis] - center(d.b)[d.axis === 'x' ? 0 : 2];
  const beside = (p, d, margin = 0) => {
    const b = d.b, along = d.axis === 'x' ? 'z' : 'x';
    return p.pos[along] > b[d.axis === 'x' ? 'minZ' : 'minX'] + .2 - margin && p.pos[along] < b[d.axis === 'x' ? 'maxZ' : 'maxX'] - .2 + margin && Math.abs(p.pos.y - b.minY) < .5;
  };
  const overlaps = (p, d) => {
    const b = d.b, r = p.r - .002;
    return p.pos.x + r > b.minX && p.pos.x - r < b.maxX && p.pos.z + r > b.minZ && p.pos.z - r < b.maxZ && p.pos.y < b.maxY && p.pos.y + p.h > b.minY;
  };
  // Distance to the sector swept by each leaf, instead of a full circle
  // around each hinge. A pursuer outside the doorway must not hold it open.
  const inSweep = (p, d, from = d.progress, to = 0) => {
    if (p.pos.y >= d.b.maxY || p.pos.y + p.h <= d.b.minY) return false;
    return d.fx.pivots.some((pivot, i) => {
      const x = p.pos.x - pivot.position.x, z = p.pos.z - pivot.position.z;
      const base = (d.axis === 'x' ? Math.PI / 2 : 0) + (i ? Math.PI : 0);
      const rotation = (i ? 1 : -1) * d.fx.swingSign * .88;
      const start = base + rotation * from, end = base + rotation * to;
      const relative = Math.atan2(Math.sin(Math.atan2(z, x) - start), Math.cos(Math.atan2(z, x) - start));
      const delta = end - start, radius = p.r + .12 - .002;
      if (relative >= Math.min(0, delta) && relative <= Math.max(0, delta)) return Math.hypot(x, z) < d.fx.span + radius;
      return [start, end].some(angle => {
        const dx = Math.cos(angle), dz = Math.sin(angle), along = Math.max(0, Math.min(d.fx.span, x * dx + z * dz));
        return Math.hypot(x - dx * along, z - dz * along) < radius;
      });
    });
  };
  const occupied = (d, from = d.progress, to = 0) => [player(), ...zombies().filter(z => !z.dead)].some(p => overlaps(p, d) || inSweep(p, d, from, to));

  function sound(kind, d) {
    const a = audio();
    if (!a.ctx || a.ctx.state !== 'running') return;
    const ctx = a.ctx, key = kind + ':' + ctx.sampleRate;
    let cached = buffers.get(key);
    if (!cached) {
      const pcm = window.renderSkyDoorSound(kind, ctx.sampleRate), buffer = ctx.createBuffer(1, pcm.length, ctx.sampleRate);
      buffer.copyToChannel(pcm, 0);
      cached = { buffer, rms: Math.sqrt(pcm.reduce((sum, x) => sum + x * x, 0) / pcm.length) };
      buffers.set(key, cached);
    }
    const [x, y, z] = center(d.b), p = player(), dx = x - p.pos.x, dz = z - p.pos.z;
    const distance = Math.hypot(dx, y - p.pos.y, dz);
    if (distance > 48) return;
    const source = ctx.createBufferSource(), gain = ctx.createGain();
    source.buffer = cached.buffer;
    gain.gain.value = (kind === 'break' ? 1 : .85) / (1 + distance / 9);
    source.connect(gain);
    if (ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.max(-1, Math.min(1, (dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw)) / (Math.hypot(dx, dz) || 1)));
      gain.connect(pan).connect(a.master);
      source.onended = () => { source.disconnect(); gain.disconnect(); pan.disconnect(); };
    } else { gain.connect(a.master); source.onended = () => { source.disconnect(); gain.disconnect(); }; }
    source.start();
    document.body.dataset.skyDoorSound = JSON.stringify({ kind, door: d.id, duration: cached.buffer.duration, rms: +cached.rms.toFixed(4) });
  }
  function initialize(d, index) {
    if (d.fx) return;
    const b = d.b, [x, , z] = center(b), height = b.maxY - b.minY;
    const span = (d.axis === 'x' ? b.maxZ - b.minZ : b.maxX - b.minX) / 2;
    const first = b.mesh, material = first.material.clone(), pivots = [], leaves = [], cracks = [];
    first.geometry.dispose(); scene.remove(first);
    const geometry = new T.BoxGeometry(d.axis === 'x' ? .24 : span, height, d.axis === 'z' ? .24 : span);
    // Keep the closed collision plane as thin as the visible metal leaves. The
    // existing spatial buckets already cover this smaller box and nav keeps its ref.
    if (d.axis === 'x') { b.minX = x - .12; b.maxX = x + .12; }
    else { b.minZ = z - .12; b.maxZ = z + .12; }
    const dark = material.clone(); dark.color.setHex(0x211a12);
    const metal = material.clone(); metal.color.setHex(0xc3ad84);
    for (const sign of [1, -1]) {
      const mesh = sign === 1 ? first : new T.Mesh(geometry, material), pivot = new T.Group();
      mesh.geometry = geometry; mesh.material = material; mesh.matrixAutoUpdate = true;
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.position.set(d.axis === 'x' ? 0 : sign * span / 2, height / 2, d.axis === 'x' ? sign * span / 2 : 0);
      mesh.rotation.set(0, 0, 0); mesh.scale.set(1, 1, 1);
      pivot.position.set(d.axis === 'x' ? x : sign === 1 ? b.minX : b.maxX, b.minY, d.axis === 'z' ? z : sign === 1 ? b.minZ : b.maxZ);
      pivot.name = 'Indoor door hinge ' + index + ':' + sign; pivot.add(mesh); scene.add(pivot);
      pivots.push(pivot); leaves.push(mesh);
      for (const face of [-1, 1]) {
        const handle = new T.Mesh(new T.BoxGeometry(d.axis === 'x' ? .1 : .22, .065, d.axis === 'z' ? .1 : .22), metal);
        handle.position.set(d.axis === 'x' ? face * .18 : sign * span * .32, 1.42 - height / 2, d.axis === 'z' ? face * .18 : sign * span * .32);
        mesh.add(handle);
        for (let i = 0; i < 3; i++) {
          const crack = new T.Mesh(new T.BoxGeometry(d.axis === 'x' ? .012 : .55, .035, d.axis === 'z' ? .012 : .55), dark);
          crack.position.set(d.axis === 'x' ? face * .126 : -.2 + i * .15, -.5 + i * .45, d.axis === 'z' ? face * .126 : -.2 + i * .15);
          crack.rotation[d.axis] = (i % 2 ? -.4 : .5); crack.visible = false; mesh.add(crack); cracks.push(crack);
        }
      }
    }
    d.id = 'indoor-door-' + index;
    d.fx = { pivot: pivots[0], pivots, leaves, cracks, span, shake: 0, elapsed: 0, swingSign: 1, angle: 0 };
  }
  function placeLeaf(d) {
    const f = d.fx;
    f.angle = f.swingSign * .88 * d.progress;
    f.pivots.forEach((pivot, i) => { pivot.rotation.y = (i ? -1 : 1) * (f.angle + Math.sin(f.elapsed * 91) * .035 * f.shake); pivot.visible = d.phase !== 'broken'; });
    f.leaves.forEach(leaf => { leaf.visible = d.phase !== 'broken'; });
    d.b.mesh.material.emissive?.setHex(f.shake > .05 ? d.hp <= 2 ? 0x743318 : 0x382213 : 0);
    f.cracks.forEach((crack, i) => { crack.visible = d.hp <= (i % 3 === 0 ? 4 : i % 3 === 1 ? 3 : 2); });
  }
  function contact(d, side, selectedLeaf) {
    const f = d.fx, p = player();
    let best = null, distance = Infinity;
    f.pivots.forEach((pivot, i) => {
      if (selectedLeaf !== undefined && i !== selectedLeaf) return;
      const a = i ? -f.angle : f.angle, sign = i ? -1 : 1;
      const tx = sign * (d.axis === 'x' ? Math.sin(a) : Math.cos(a)), tz = sign * (d.axis === 'x' ? Math.cos(a) : -Math.sin(a));
      const along = Math.max(.25, Math.min(f.span - .08, (p.pos.x - pivot.position.x) * tx + (p.pos.z - pivot.position.z) * tz));
      const nx = d.axis === 'x' ? Math.cos(a) : Math.sin(a), nz = d.axis === 'x' ? -Math.sin(a) : Math.cos(a);
      const point = { leaf: i, x: pivot.position.x + tx * along + nx * side * .14, y: d.b.minY + 1.42, z: pivot.position.z + tz * along + nz * side * .14 };
      const gap = Math.hypot(point.x - p.pos.x, point.z - p.pos.z);
      if (gap < distance) { distance = gap; best = point; }
    });
    return best;
  }
  function beginHuman(kind, d, side) {
    const p = player(), point = contact(d, side);
    p.doorAction = { kind, door: d, side, age: 0, duration: kind === 'open' ? .22 : .16, phase: 0, contact: point,
      leaf: point.leaf, yaw: Math.atan2(point.x - p.pos.x, point.z - p.pos.z), weight: 0 };
  }
  function open(d, side, human = true) {
    d.reopening = d.phase === 'closing';
    if (d.reopening) d.b.off = true;
    d.phase = 'opening'; d.elapsed = 0; d.startProgress = d.progress; d.enterSide = side; d.openAge = 0; d.crossed = false;
    d.fx.swingSign = d.axis === 'x' ? -side : side;
    if (human) beginHuman('open', d, side);
    sound('open', d);
  }
  function close(d, human = true) {
    if (occupied(d)) return false;
    d.phase = 'closing'; d.elapsed = 0; d.startProgress = d.progress; d.rearm = false;
    // The doorway is clear now. Reserve its collision plane immediately so
    // a pursuer cannot enter during the short closing animation.
    d.b.off = false;
    if (human) beginHuman('close', d, Math.sign(coordinate(player(), d)) || -d.enterSide);
    return true;
  }
  function emit(d) {
    if (!fragmentGeometry) {
      fragmentGeometry = new T.BoxGeometry(1, 1, 1); fragmentMaterial = d.b.mesh.material.clone(); fragmentMaterial.emissive?.setHex(0);
      for (let i = 0; i < 24; i++) {
        const mesh = new T.Mesh(fragmentGeometry, fragmentMaterial); mesh.name = 'sky-door-fragment'; mesh.visible = false; scene.add(mesh);
        fragments.push({ mesh, life: 0, vx: 0, vy: 0, vz: 0, spin: 0, floor: 0 });
      }
    }
    const b = d.b, [x, , z] = center(b), direction = -Math.sign(coordinate(player(), d)) || 1;
    for (let i = 0; i < 12; i++) {
      const f = fragments.find(f => f.life <= 0); if (!f) break;
      f.life = 1.2 + Math.random() * .5; f.floor = b.minY + .08; f.mesh.visible = true;
      f.mesh.position.set(x + (Math.random() - .5) * (b.maxX - b.minX), b.minY + .3 + Math.random() * (b.maxY - b.minY - .6), z + (Math.random() - .5) * (b.maxZ - b.minZ));
      f.mesh.scale.set(d.axis === 'x' ? .1 : .35 + Math.random() * .25, .3 + Math.random() * .5, d.axis === 'z' ? .1 : .35 + Math.random() * .25);
      f.mesh.rotation.set(Math.random(), Math.random(), Math.random());
      f.vx = d.axis === 'x' ? direction * (2 + Math.random() * 3) : (Math.random() - .5) * 3;
      f.vz = d.axis === 'z' ? direction * (2 + Math.random() * 3) : (Math.random() - .5) * 3;
      f.vy = 1 + Math.random() * 3; f.spin = (Math.random() - .5) * 10;
    }
  }
  function breakDoor(d) {
    d.phase = 'broken'; d.b.off = true;
    if (player().doorAction?.door === d) player().doorAction = null;
    emit(d); sound('break', d); placeLeaf(d);
    if (Math.abs(coordinate(player(), d)) < 18) notice('ドアが壊された！');
  }
  function reset(doors) {
    player().doorAction = null;
    doors.forEach((d, i) => {
      initialize(d, i); Object.assign(d, { phase: 'closed', progress: 0, elapsed: 0, hp: 5, maxHp: 5, hitCD: .35, openAge: 0, enterSide: 0, crossed: false, rearm: true });
      d.fx.shake = d.fx.elapsed = 0; d.b.off = false; placeLeaf(d);
    });
    for (const f of fragments) { f.life = 0; f.mesh.visible = false; }
    delete document.body.dataset.skyDoorSound;
  }
  function step(dt, doors) {
    const p = player(), enemies = zombies();
    if (p.doorAction) {
      const a = p.doorAction;
      a.age += dt; a.phase = doorClamp(a.age / a.duration);
      a.contact = contact(a.door, a.side, a.leaf);
      a.weight = doorEase(a.phase / .17) * (1 - doorEase((a.phase - .25) / .25));
      if (a.phase >= 1 || p.state !== 'normal' || p.vel.y > 1.5 || a.door.phase === 'broken') p.doorAction = null;
    }
    for (const d of doors) {
      d.elapsed += dt; d.fx.elapsed += dt; d.fx.shake = Math.max(0, d.fx.shake - dt * 5);
      const dist = coordinate(p, d), side = Math.sign(dist) || d.enterSide || 1;
      if (d.phase === 'closed') {
        if (Math.abs(dist) > 1.2 || !beside(p, d, .2) || p.vel[d.axis] * side < -.15) d.rearm = true;
        if (d.rearm && !p.doorAction && p.onGround && p.h > 1.2 && !window.skyLandingRoll?.active && p.state === 'normal' && beside(p, d) && Math.abs(dist) <= 1.1) open(d, side);
        else {
          const attackers = enemies.filter(z => !z.dead && z.spawnT <= 0 && z.stun <= 0 && Math.abs(z.pos.y - d.b.minY) < 1.2 && Math.hypot(Math.max(d.b.minX-z.pos.x,0,z.pos.x-d.b.maxX),Math.max(d.b.minZ-z.pos.z,0,z.pos.z-d.b.maxZ)) < 1.25);
          if (attackers.length) {
            d.hitCD -= dt * Math.min(2.5, attackers.reduce((sum, z) => sum + (z.stalker ? 2 : 1), 0));
            if (d.hitCD <= 0) {
              d.hitCD += .64; d.hp = Math.max(0, d.hp - 1); d.fx.shake = d.hp <= 2 ? 1.4 : 1;
              if (!d.hp) breakDoor(d); else sound(d.hp <= 2 ? 'strain' : 'hit', d);
            }
          }
        }
      } else if (d.phase === 'opening') {
        d.progress = d.startProgress + (1 - d.startProgress) * doorEase(d.elapsed / .18);
        d.b.off = d.reopening || d.progress > .82;
        if (d.elapsed >= .18) { d.phase = 'open'; d.progress = 1; d.b.off = true; d.openAge = 0; }
      } else if (d.phase === 'open') {
        d.openAge += dt;
        if (beside(p, d) && side !== d.enterSide && Math.abs(dist) > p.r + .12 + .08) d.crossed = true;
        if (!p.doorAction) {
          if (d.crossed) close(d, p.onGround && p.state === 'normal' && beside(p, d, .15) && Math.abs(dist) < 1.8);
          else if (d.openAge > .6 && (!beside(p, d, .4) || Math.abs(dist) > 2.2)) close(d, false);
        }
      } else if (d.phase === 'closing') {
        const next = d.startProgress * (1 - doorEase(d.elapsed / .16));
        if (occupied(d, d.progress, next)) {
          if (p.doorAction?.door === d) p.doorAction = null;
          // Reverse only for a body actually in the doorway or leaf sweep.
          open(d, d.enterSide, false);
        } else {
          d.progress = next;
          d.b.off = false;
          if (d.elapsed >= .16) { d.phase = 'closed'; d.progress = 0; d.b.off = false; d.hitCD = .3; sound('close', d); }
        }
      }
      placeLeaf(d);
    }
    for (const f of fragments) {
      if (f.life <= 0) continue;
      f.life -= dt; f.mesh.visible = f.life > 0; f.vy -= dt * 12;
      f.mesh.position.x += f.vx * dt; f.mesh.position.y += f.vy * dt; f.mesh.position.z += f.vz * dt;
      if (f.mesh.position.y < f.floor) { f.mesh.position.y = f.floor; f.vy = Math.abs(f.vy) * .22; f.vx *= .85; f.vz *= .85; }
      f.mesh.rotation.x += f.spin * dt; f.mesh.rotation.z += f.spin * dt * .6;
      if (f.life < .35) f.mesh.scale.multiplyScalar(Math.exp(-dt * 9));
    }
    document.body.dataset.skyDoors = JSON.stringify(doors.map(d => ({ id: d.id, phase: d.phase, progress: +d.progress.toFixed(3), hp: d.hp, blocked: !d.b.off, angle: +d.fx.angle.toFixed(3) })));
  }
  return { reset, step, close, open, break: breakDoor };
};
