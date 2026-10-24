// Two one-use escape tools for the canyon whitebox. The game calls pickShot
// from its existing hitscan path, so walls and enemies keep their normal order.
(() => {
  window.addEventListener('load', () => {
    const game = window.__skyInternals;
    const barrels = window.SKY_CANYON_BLAST_BARRELS;
    if (!game || !Array.isArray(barrels)) return;
    const stats = window.__game.stats;

    const { Standard, Basic, Box, Torus, Sphere, Mesh, Group, Vector3 } = game.Geom;
    const red = new Standard({ color: 0xb52d1d, emissive: 0x541000,
                               emissiveIntensity: 0.4, roughness: 0.55, metalness: 0.28 });
    const yellow = new Standard({ color: 0xffc943, emissive: 0x6b3900,
                                  emissiveIntensity: 0.25, roughness: 0.5 });
    for (const barrel of barrels) {
      barrel.active = true;
      barrel.block.mesh?.children.forEach((part, index) => {
        if (part.isMesh) part.material = index === 0 ? red : yellow;
      });
    }

    let worldRaycast = null;
    const shotBlock = (origin, direction, maxDistance, raycast) => {
      worldRaycast = raycast;
      const hit = raycast(origin.x, origin.y, origin.z,
                          direction.x, direction.y, direction.z, maxDistance);
      if (!hit) return null;
      const barrel = barrels.find(item => item.active && item.block === hit.b);
      return barrel ? { barrel, t: hit.t } : null;
    };

    function pickShot(origin, direction, weapon, raycast) {
      if (!weapon.cone) return shotBlock(origin, direction, weapon.range, raycast);
      let nearest = null;
      for (const barrel of barrels) {
        if (!barrel.active) continue;
        const toward = new Vector3(barrel.x - origin.x, barrel.y + 0.56 - origin.y,
                                   barrel.z - origin.z);
        const distance = toward.length();
        if (distance > weapon.range + 0.3 || distance < 0.1) continue;
        toward.multiplyScalar(1 / distance);
        if (toward.dot(direction) < Math.cos(weapon.cone)) continue;
        const hit = shotBlock(origin, toward, distance + 0.5, raycast);
        if (hit?.barrel === barrel && (!nearest || hit.t < nearest.t)) nearest = hit;
      }
      return nearest;
    }

    function aimedAt(camera, raycast) {
      const direction = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      return !!shotBlock(camera.position, direction, 90, raycast);
    }

    function blastVisible(barrel, x, y, z) {
      if (!worldRaycast) return true;
      const dx = x - barrel.x, dy = y - barrel.y - 0.65, dz = z - barrel.z;
      const distance = Math.hypot(dx, dy, dz);
      if (distance < 0.25) return true;
      return !worldRaycast(barrel.x, barrel.y + 0.65, barrel.z,
                           dx / distance, dy / distance, dz / distance,
                           distance - 0.2);
    }

    function flash(barrel) {
      // Unity's prototype combines a hot core, flame burst, dust, debris and a
      // short light pulse. Keep this version procedural and short-lived.
      const root = new Group();
      root.position.set(barrel.x, barrel.y + 0.65, barrel.z);
      game.ue.add(root);
      const materials = [
        new Basic({ color: 0xfff3bd, transparent: true, opacity: 1, depthWrite: false }),
        new Basic({ color: 0xff711b, transparent: true, opacity: 0.62, depthWrite: false }),
        new Basic({ color: 0xffca67, transparent: true, opacity: 0.8, depthWrite: false }),
        new Basic({ color: 0x6e6258, transparent: true, opacity: 0.38, depthWrite: false }),
        new Basic({ color: 0xff9b38, transparent: true, opacity: 1, depthWrite: false }),
      ];
      const coreGeo = new Sphere(1, 12, 8);
      const flameGeo = new Sphere(1, 6, 5);
      const smokeGeo = new Sphere(1, 7, 5);
      const ringGeo = new Torus(1, 0.055, 6, 32);
      const sparkGeo = new Box(0.1, 0.1, 0.28);
      const core = new Mesh(coreGeo, materials[0]);
      const fire = new Mesh(coreGeo, materials[1]);
      const ring = new Mesh(ringGeo, materials[2]);
      ring.rotation.x = Math.PI / 2;
      root.add(fire, core, ring);
      const flames = [], smoke = [], sparks = [];
      for (let i = 0; i < 7; i++) {
        const a = i * 2.39996;
        const tongue = new Mesh(flameGeo, materials[1]);
        root.add(tongue);
        flames.push({ mesh: tongue, x: Math.cos(a), z: Math.sin(a), lift: i % 3 });
      }
      for (let i = 0; i < 9; i++) {
        const a = i * 2.39996;
        const puff = new Mesh(smokeGeo, materials[3]);
        root.add(puff);
        smoke.push({ mesh: puff, x: Math.cos(a), z: Math.sin(a), size: 0.38 + i % 3 * 0.12 });
      }
      for (let i = 0; i < 14; i++) {
        const a = i * 2.39996;
        const shard = new Mesh(sparkGeo, materials[4]);
        shard.rotation.set(i * 0.8, a, i * 1.7);
        root.add(shard);
        sparks.push({ mesh: shard, x: Math.cos(a), z: Math.sin(a), lift: 0.7 + i % 4 * 0.2 });
      }
      const light = window.T2?.PointLight ? new window.T2.PointLight(0xffaa40, 0, 7) : null;
      if (light) root.add(light);
      const playerDistance = Math.hypot(game.c.pos.x - barrel.x, game.c.pos.z - barrel.z);
      const screen = playerDistance < 11 ? document.createElement('div') : null;
      if (screen) {
        Object.assign(screen.style, { position: 'fixed', inset: '0', zIndex: '19',
          pointerEvents: 'none', background: '#fff0be', opacity: '0' });
        document.body.appendChild(screen);
      }
      const start = performance.now();
      const tick = now => {
        const seconds = Math.max(0, (now - start) / 1000);
        const hit = Math.min(1, seconds / 0.12);
        core.scale.setScalar(0.2 + 1.35 * hit);
        materials[0].opacity = Math.max(0, 1 - seconds / 0.18);
        fire.scale.setScalar(0.25 + Math.min(1, seconds / 0.22) * 0.95);
        materials[1].opacity = Math.max(0, 0.62 * (1 - seconds / 0.38));
        ring.scale.setScalar(0.4 + Math.min(1, seconds / 0.42) * 5.6);
        materials[2].opacity = Math.max(0, 0.8 * (1 - seconds / 0.42));
        materials[3].opacity = Math.max(0, 0.38 * (1 - seconds / 1.2));
        materials[4].opacity = Math.max(0, 1 - seconds / 0.72);
        for (const tongue of flames) {
          tongue.mesh.position.set(tongue.x * (0.3 + seconds * 6),
                                   tongue.lift * 0.15 + seconds * 3,
                                   tongue.z * (0.3 + seconds * 6));
          tongue.mesh.scale.set(0.28 + seconds * 1.1, 0.55 + seconds * 2,
                                0.28 + seconds * 1.1);
        }
        for (const puff of smoke) {
          puff.mesh.position.set(puff.x * seconds * 2.5, seconds * (1.15 + puff.size),
                                 puff.z * seconds * 2.5);
          puff.mesh.scale.setScalar(puff.size + seconds * 1.35);
        }
        for (const spark of sparks) {
          spark.mesh.position.set(spark.x * seconds * 4.5,
                                  spark.lift * seconds * 3 - 5 * seconds * seconds,
                                  spark.z * seconds * 4.5);
          spark.mesh.rotation.x += 0.08;
          spark.mesh.rotation.z += 0.05;
        }
        if (light) light.intensity = Math.max(0, 4 * (1 - seconds / 0.25));
        if (screen) screen.style.opacity = String(Math.max(0, 0.2 * (1 - playerDistance / 11) * (1 - seconds / 0.16)));
        if (seconds < 1.2) requestAnimationFrame(tick);
        else {
          game.ue.remove(root);
          screen?.remove();
          for (const geometry of [coreGeo, flameGeo, smokeGeo, ringGeo, sparkGeo]) geometry.dispose();
          for (const material of materials) material.dispose();
          light?.dispose?.();
        }
      };
      requestAnimationFrame(tick);
    }

    const blastRate = 44100;
    let blastSamples = null, blastSound = null;
    function prepareBlastSound() {
      if (blastSamples) return;
      const rate = blastRate;
      const length = Math.ceil(rate * 1.9);
      const data = new Float32Array(length);
      let seed = 73129, low = 0, previous = 0, phase = 0;
      let crackEnv = 1, rumbleEnv = 1, bassEnv = 1, debrisEnv = 1, pitchEnv = 1;
      const crackStep = Math.exp(-75 / rate);
      const rumbleStep = Math.exp(-2.4 / rate);
      const bassStep = Math.exp(-3.2 / rate);
      const debrisStep = Math.exp(-2.7 / rate);
      const pitchStep = Math.exp(-5 / rate);
      const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 0x80000000) - 1;
      for (let i = 0; i < length; i++) {
        const noise = random();
        low += (noise - low) * 0.035;
        const crack = (noise - previous) * crackEnv * 0.5;
        const rumble = low * rumbleEnv * 2.3;
        phase += 2 * Math.PI * (42 + 95 * pitchEnv) / rate;
        const bass = Math.sin(phase) * bassEnv * 0.42;
        const seconds = i / rate;
        const debris = noise * debrisEnv * (seconds > 0.18 ? 0.11 : 0.04);
        data[i] = Math.tanh((crack + rumble + bass + debris) * 1.45) * 0.82;
        previous = noise;
        crackEnv *= crackStep;
        rumbleEnv *= rumbleStep;
        bassEnv *= bassStep;
        debrisEnv *= debrisStep;
        pitchEnv *= pitchStep;
      }
      blastSamples = data;
    }
    if (window.requestIdleCallback) window.requestIdleCallback(prepareBlastSound, { timeout: 1000 });
    else setTimeout(prepareBlastSound, 0);

    function playBlastSound(barrel) {
      const distance = Math.hypot(game.c.pos.x - barrel.x, game.c.pos.z - barrel.z);
      const volume = Math.max(0.18, 1 - distance / 28);
      const { ctx, master } = game.Ut;
      if (!ctx || !master) return;
      if (ctx.state === 'suspended') ctx.resume();
      if (!blastSamples) prepareBlastSound();
      if (!blastSound) {
        blastSound = ctx.createBuffer(1, blastSamples.length, blastRate);
        blastSound.copyToChannel(blastSamples, 0);
      }
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = blastSound;
      gain.gain.value = volume * 0.8;
      source.connect(gain);
      gain.connect(master);
      source.onended = () => { source.disconnect(); gain.disconnect(); };
      source.start();
    }

    function detonate(barrel) {
      if (!barrel?.active) return false;
      barrel.active = false;
      barrel.block.off = true;
      if (barrel.block.mesh) barrel.block.mesh.visible = false;
      game.c.shake = Math.max(game.c.shake || 0, 0.38);
      playBlastSound(barrel);
      stats.blasts = (stats.blasts || 0) + 1;
      flash(barrel);

      // Local clearing only: enemies elsewhere continue the chase.
      for (const zombie of game.Jt) {
        if (zombie.dead || zombie.spawnT > 0) continue;
        const dx = zombie.pos.x - barrel.x;
        const dz = zombie.pos.z - barrel.z;
        const distance = Math.hypot(dx, zombie.pos.y - barrel.y, dz);
        if (distance > 5.2 || !blastVisible(barrel, zombie.pos.x,
                                            zombie.pos.y + 0.9, zombie.pos.z)) continue;
        const horizontal = Math.hypot(dx, dz) || 1;
        zombie.hurt(distance < 2.6 ? 4 : 2, dx / horizontal, dz / horizontal,
                    1.25, 9 * (1 - distance / 7));
        zombie.blastT = 0.72;
        zombie.blastSide = Math.cos(zombie.yaw) * dx - Math.sin(zombie.yaw) * dz < 0 ? -1 : 1;
        zombie.vel.y = Math.max(zombie.vel.y, 2.7 + 1.8 * (1 - distance / 5.2));
      }

      const player = game.c;
      const dx = player.pos.x - barrel.x;
      const dz = player.pos.z - barrel.z;
      const distance = Math.hypot(dx, player.pos.y + 0.8 - barrel.y - 0.56, dz);
      if (distance <= 4.6 && blastVisible(barrel, player.pos.x,
                                          player.pos.y + 1.0, player.pos.z)) {
        const horizontal = Math.hypot(dx, dz) || 1;
        if (player.state === 'ledge' || player.state === 'ladder' ||
            player.state === 'slide') player.state = 'normal';
        player.ledge = null;
        player.ladder = null;
        player.onGround = false;
        player.coyote = 0;
        player.airT = 0;
        player.vel.y = Math.max(player.vel.y, distance <= 3.4 ? 14.4 : 11.4);
        // A directional impulse makes the blast's source readable in movement.
        const shove = 2.2 * Math.max(0.45, 1 - distance / 5.5);
        player.vel.x += dx / horizontal * shove;
        player.vel.z += dz / horizontal * shove;
        stats.blastLaunches = (stats.blastLaunches || 0) + 1;
        game.rn('爆風で上昇！ 空中で進路を調整');
      } else game.rn('ドラム缶爆発！ 近くの敵を吹き飛ばした');
      return true;
    }

    function reset() {
      for (const barrel of barrels) {
        barrel.active = true;
        barrel.block.off = false;
        if (barrel.block.mesh) barrel.block.mesh.visible = true;
      }
      stats.blasts = 0;
      stats.blastLaunches = 0;
    }

    window.skyBlastBarrels = { barrels, pickShot, aimedAt, detonate, reset };
  });
})();
