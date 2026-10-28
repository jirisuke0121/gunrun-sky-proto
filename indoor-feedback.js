// Original synthesized metal-door cues and a bounded pool of cosmetic fragments.
window.skyZombieCrawlSpeed = (speed, stalker = false) => Math.min(speed * .18, stalker ? 1.35 : 1.15);
window.createSkyDoorFeedback = function ({ THREE: T, scene, audio, player, notice }) {
  const fragments = [], buffers = new Map();
  let geometry, material;
  const center = b => [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2];
  function sound(kind, b) {
    const a = audio();
    if (!a.ctx || a.ctx.state !== 'running') return;
    const ctx = a.ctx, key = kind + ':' + ctx.sampleRate;
    let buffer = buffers.get(key);
    if (!buffer) {
      const duration = kind === 'break' ? .85 : kind === 'close' ? .42 : .22;
      buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
      const pcm = buffer.getChannelData(0);
      let seed = 3917, low = 0;
      for (let i = 0; i < pcm.length; i++) {
        const t = i / ctx.sampleRate;
        seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
        const noise = (seed >>> 0) / 2147483648 - 1;
        low += (noise - low) * .12;
        const body = Math.sin(2 * Math.PI * 74 * t) * .32 + Math.sin(2 * Math.PI * 183 * t) * .15;
        let sample = (body + low * .9) * Math.exp(-t * (kind === 'hit' ? 24 : 16));
        if (kind === 'close' && t > .11) sample += Math.sin(2 * Math.PI * 1350 * t) * Math.exp(-(t - .11) * 70) * .18;
        if (kind === 'break') sample += (noise * .3 + Math.sin(2 * Math.PI * 570 * t) * .12) * Math.exp(-t * 5) * (.5 + .5 * Math.sin(t * 95) ** 2);
        pcm[i] = Math.tanh(sample * 1.8) * Math.min(1, t / .002) * Math.min(1, (duration - t) / .03) * .72;
      }
      buffers.set(key, buffer);
    }
    const [x, y, z] = center(b), p = player(), dx = x - p.pos.x, dz = z - p.pos.z;
    const distance = Math.hypot(dx, y - p.pos.y, dz);
    if (distance > 48) return;
    const source = ctx.createBufferSource(), gain = ctx.createGain();
    source.buffer = buffer;
    gain.gain.value = (kind === 'break' ? .95 : .8) / (1 + distance / 9);
    source.connect(gain);
    if (ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.max(-1, Math.min(1, (dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw)) / (Math.hypot(dx, dz) || 1)));
      gain.connect(pan).connect(a.master);
      source.onended = () => { source.disconnect(); gain.disconnect(); pan.disconnect(); };
    } else { gain.connect(a.master); source.onended = () => { source.disconnect(); gain.disconnect(); }; }
    source.start();
  }
  function restore(d) {
    if (!d.fx) return;
    d.b.mesh.position.copy(d.fx.position);
    d.b.mesh.scale.set(1, 1, 1);
    d.b.mesh.material.emissive?.setHex(0);
    d.fx.close = d.fx.shake = 0;
  }
  function state(d) {
    if (!d.fx) {
      d.b.mesh.material = d.b.mesh.material.clone();
      d.fx = { position: d.b.mesh.position.clone(), close: 0, shake: 0, elapsed: 0, hits: 0, nextHit: 0 };
    }
    return d.fx;
  }
  function emit(d) {
    if (!geometry) {
      geometry = new T.BoxGeometry(1, 1, 1);
      material = d.b.mesh.material.clone(); material.emissive?.setHex(0);
      for (let i = 0; i < 24; i++) {
        const mesh = new T.Mesh(geometry, material); mesh.name = "sky-door-fragment"; mesh.visible = false; scene.add(mesh);
        fragments.push({ mesh, life: 0, vx: 0, vy: 0, vz: 0, spin: 0, floor: 0 });
      }
    }
    const b = d.b, [x, y, z] = center(b), p = player();
    // Throw fragments away from the player who just passed through the door.
    const direction = d.axis === 'x' ? Math.sign(x - p.pos.x) || 1 : Math.sign(z - p.pos.z) || 1;
    for (let i = 0; i < 12; i++) {
      const f = fragments.find(f => f.life <= 0);
      if (!f) break;
      f.life = 1.1 + Math.random() * .5; f.floor = b.minY + .08;
      f.mesh.visible = true;
      f.mesh.position.set(x + (Math.random() - .5) * (b.maxX - b.minX), b.minY + .3 + Math.random() * (b.maxY - b.minY - .6), z + (Math.random() - .5) * (b.maxZ - b.minZ));
      f.mesh.scale.set(d.axis === 'x' ? .1 : .35 + Math.random() * .25, .3 + Math.random() * .5, d.axis === 'z' ? .1 : .35 + Math.random() * .25);
      f.mesh.rotation.set(Math.random(), Math.random(), Math.random());
      f.vx = d.axis === 'x' ? direction * (2 + Math.random() * 3) : (Math.random() - .5) * 3;
      f.vz = d.axis === 'z' ? direction * (2 + Math.random() * 3) : (Math.random() - .5) * 3;
      f.vy = 1 + Math.random() * 3; f.spin = (Math.random() - .5) * 10;
    }
  }
  return {
    close(d) { const f = state(d); restore(d); f.close = .2; f.hits = 0; f.nextHit = .22; sound('close', d.b); },
    hit(d) { const f = state(d); f.shake = .19; f.hits++; sound('hit', d.b); },
    break(d) {
      state(d); restore(d); emit(d); sound('break', d.b);
      const [x, , z] = center(d.b);
      if (Math.hypot(x - player().pos.x, z - player().pos.z) < 18) notice('ドアが壊された！');
    },
    open(d) { restore(d); },
    reset(doors) { for (const d of doors) { restore(d); if (d.fx) d.fx.hits = d.fx.nextHit = 0; } for (const f of fragments) { f.life = 0; f.mesh.visible = false; } },
    frame(dt, doors) {
      for (const d of doors) {
        const f = d.fx; if (!f || d.b.off) continue;
        f.elapsed += dt; f.close = Math.max(0, f.close - dt); f.shake = Math.max(0, f.shake - dt);
        const mesh = d.b.mesh, axis = d.axis;
        mesh.position.copy(f.position);
        mesh.position[axis] += Math.sin(f.elapsed * 95) * .09 * f.shake / .19;
        mesh.scale[axis] = 1 + Math.sin(f.close / .2 * Math.PI) * .3;
        mesh.material.emissive?.setHex(f.shake > 0 ? 0x60321a : 0);
      }
      for (const f of fragments) {
        if (f.life <= 0) continue;
        f.life -= dt; f.mesh.visible = f.life > 0;
        f.vy -= dt * 12;
        f.mesh.position.x += f.vx * dt; f.mesh.position.y += f.vy * dt; f.mesh.position.z += f.vz * dt;
        if (f.mesh.position.y < f.floor) { f.mesh.position.y = f.floor; f.vy = Math.abs(f.vy) * .22; f.vx *= .85; f.vz *= .85; }
        f.mesh.rotation.x += f.spin * dt; f.mesh.rotation.z += f.spin * dt * .6;
        if (f.life < .35) f.mesh.scale.multiplyScalar(Math.exp(-dt * 9));
      }
    }
  };
};
