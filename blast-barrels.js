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
    const capRed = new Standard({ color: 0xa42b1d, emissive: 0x43120c,
                                  emissiveIntensity: 0.18, roughness: 0.56, metalness: 0.28 });
    const stepSteel = new Standard({ color: 0x53616a, roughness: 0.68, metalness: 0.3 });
    const hazardBlack = new Standard({ color: 0x15110d, roughness: 0.6, metalness: 0.2 });
    const { Cylinder, Sprite, SpriteMaterial, CanvasTexture } = game.Geom;
    // A cylinder in this map is always a blast barrel (the decorative barrels are
    // crates now). Hazard stripes and a floating red badge make it readable from afar.
    const badgeTexture = (() => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 128;
      const g = canvas.getContext('2d');
      g.fillStyle = '#e63b2e'; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill();
      g.lineWidth = 8; g.strokeStyle = '#fff4d6'; g.stroke();
      g.fillStyle = '#fff4d6'; g.font = 'bold 74px sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('爆', 64, 70);
      return new CanvasTexture(canvas);
    })();
    const badgeMaterial = new SpriteMaterial({ map: badgeTexture, transparent: true });
    const stripeGeometry = new Cylinder(0.375, 0.375, 0.045, 14);
    for (const barrel of barrels) {
      barrel.active = true;
      barrel.block.mesh?.children.forEach((part, index) => {
        if (part.isMesh) part.material = index === 0 ? red : yellow;
      });
      if (barrel.cap.mesh) barrel.cap.mesh.material = capRed;
      if (barrel.block.mesh) {
        const height = barrel.block.maxY - barrel.block.minY;
        for (const at of [0.25, 0.75]) for (const side of [-1, 1]) {
          const stripe = new Mesh(stripeGeometry, hazardBlack);
          stripe.position.y = height * at + side * 0.085;
          barrel.block.mesh.add(stripe);
        }
      }
      barrel.badge = new Sprite(badgeMaterial);
      barrel.badge.scale.set(0.95, 0.95, 1);
      barrel.badge.position.set(barrel.x, (barrel.y || 0) + 2.05, barrel.z);
      game.ue.add(barrel.badge);
      if (barrel.step?.mesh) barrel.step.mesh.material = stepSteel;
    }

    const targetMaterial = new Basic({ color: 0xff3b2e, transparent: true,
                                       opacity: 0.7, depthWrite: false });
    const targetGeometry = new Torus(0.78, 0.07, 6, 32);
    for (const barrel of barrels) {
      const target = new Mesh(targetGeometry, targetMaterial);
      target.rotation.x = Math.PI / 2;
      target.position.set(barrel.x, (barrel.y || 0) + 1.145, barrel.z);
      game.ue.add(target);
      barrel.target = target;
    }
    // Auto blast jump: like the hook, a barrel inside reach gets an on-screen
    // mark. One tap (or B) makes the player leap into the barrel, the barrel goes
    // off, and the blast throws the player toward the barrel's landing roof.
    const AUTO_RANGE = 9;
    const isTouch = () => document.documentElement.classList.contains('touch');
    const markHost = document.getElementById('hookMark');
    const mark = document.createElement('div');
    mark.id = 'blastMark';
    Object.assign(mark.style, { position: 'absolute', width: '48px', height: '48px',
      margin: '-24px', boxSizing: 'border-box', border: '3px solid #fff4d6',
      borderRadius: '50%', background: 'rgba(230,59,46,.94)',
      boxShadow: '0 0 14px #e63b2ecc', color: '#fff4d6', font: 'bold 11px sans-serif',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      opacity: '0', pointerEvents: 'none', transition: 'opacity .12s', zIndex: '21' });
    mark.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' +
      '<path fill="#fff4d6" d="M12 2c.5 3.2-1.3 4.6-3 6.6C7.3 10.5 6 12.3 6 14.8 6 18.2 8.7 21 12 21s6-2.800 6-6.200c0-2.200-1-3.800-2.200-5.200-.4 1.400-1.200 2.200-2.200 2.600C14.500 8.800 13.800 5 12 2z"/></svg>' +
      '<span style="margin-top:-2px;line-height:1"></span>';
    const markLabel = mark.querySelector('span');
    (markHost?.parentElement || document.body).appendChild(mark);
    const hint = document.createElement('div');
    Object.assign(hint.style, { position: 'fixed', left: '50%', top: '118px',
      transform: 'translateX(-50%)', zIndex: '21', pointerEvents: 'none',
      padding: '4px 10px', borderRadius: '8px', background: 'rgba(24,20,14,.6)',
      color: '#ffe4a1', font: 'bold 12px sans-serif', textAlign: 'center',
      whiteSpace: 'nowrap', display: 'none' });
    document.body.appendChild(hint);
    const projected = new Vector3();
    let autoBlast = null;

    function assistTarget() {
      const player = game.c;
      if (autoBlast || game.modeRef() !== 'play' || game.z.over || player.state === 'hook') return null;
      game.Se.updateMatrixWorld();
      const ex = player.pos.x, ey = player.pos.y + (player.eye || 1.6), ez = player.pos.z;
      let best = null;
      for (const barrel of barrels) {
        if (!barrel.active) continue;
        const ax = barrel.x, ay = barrel.y + 1.2, az = barrel.z;
        const dx = ax - ex, dy = ay - ey, dz = az - ez;
        const distance = Math.hypot(dx, dy, dz);
        if (distance > AUTO_RANGE) continue;
        projected.set(ax, ay, az).project(game.Se);
        if (projected.z < -1 || projected.z > 1 ||
            Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1) continue;
        // A wall between the player and the barrel hides the mark; the barrel's
        // own cap (0.7 m) is excluded from the ray.
        if (distance > 1.2 && game.raycast(ex, ey, ez, dx / distance, dy / distance,
                                           dz / distance, distance - 0.9)) continue;
        if (!best || distance < best.distance) {
          best = { barrel, distance,
                   sx: (projected.x + 1) / 2 * window.__VW(),
                   sy: (1 - projected.y) / 2 * window.__VH() };
        }
      }
      if (!best) return null;
      // The hook mark and this one never compete: the nearer of the two wins.
      if (markHost?.classList.contains('on') && !markHost.classList.contains('cd')) {
        const anchor = game.us?.[Number(markHost.dataset.anchor)];
        if (anchor && Math.hypot(anchor[0] - ex, anchor[1] - ey, anchor[2] - ez) < best.distance) return null;
      }
      return best;
    }

    const updateGuide = () => {
      for (const barrel of barrels) {
        barrel.target.visible = barrel.active;
        if (barrel.badge) barrel.badge.visible = barrel.active;
      }
      targetMaterial.opacity = 0.62 + 0.18 * Math.sin(performance.now() / 260);
      const assist = assistTarget();
      if (assist) {
        mark.style.left = assist.sx + 'px';
        mark.style.top = assist.sy + 'px';
        markLabel.textContent = isTouch() ? '爆破' : 'B';
        mark.style.opacity = '1';
        hint.textContent = isTouch() ? 'ドラム缶をタップで爆破ジャンプ！' :
          'ドラム缶をクリック／Bキーで爆破ジャンプ！';
        hint.style.display = 'block';
      } else {
        mark.style.opacity = '0';
        hint.style.display = 'none';
      }
      requestAnimationFrame(updateGuide);
    };
    requestAnimationFrame(updateGuide);

    let worldRaycast = game.raycast;
    const shotBlock = (origin, direction, maxDistance, raycast) => {
      worldRaycast = raycast;
      const hit = raycast(origin.x, origin.y, origin.z,
                          direction.x, direction.y, direction.z, maxDistance);
      if (!hit) return null;
      const barrel = barrels.find(item => item.active &&
        (item.block === hit.b || item.cap === hit.b));
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

    function flash(barrel, topShot) {
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
        new Basic({ color: 0xa42b1d, transparent: true, opacity: 1, depthWrite: false }),
        new Basic({ color: 0xffc943, transparent: true, opacity: 1, depthWrite: false }),
      ];
      const coreGeo = new Sphere(1, 12, 8);
      const flameGeo = new Sphere(1, 6, 5);
      const smokeGeo = new Sphere(1, 7, 5);
      const ringGeo = new Torus(1, 0.055, 6, 32);
      const sparkGeo = new Box(0.1, 0.1, 0.28);
      const debrisGeo = new Box(0.28, 0.1, 0.35);
      const core = new Mesh(coreGeo, materials[0]);
      const fire = new Mesh(coreGeo, materials[1]);
      const ring = new Mesh(ringGeo, materials[2]);
      ring.rotation.x = Math.PI / 2;
      root.add(fire, core, ring);
      const flames = [], smoke = [], sparks = [], debris = [];
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
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI * 0.75;
        const fragment = new Mesh(debrisGeo, materials[i % 3 ? 5 : 6]);
        root.add(fragment);
        debris.push({ mesh: fragment, x: Math.cos(a), z: Math.sin(a),
                      lift: 1.4 + i % 3 * 0.5 });
      }
      const light = window.T2?.PointLight ? new window.T2.PointLight(0xffaa40, 0, 7) : null;
      if (light) { light.layers.disableAll(); root.add(light); } // Preserve the flash geometry without a local light.
      const playerDistance = Math.hypot(game.c.pos.x - barrel.x, game.c.pos.z - barrel.z);
      const screen = playerDistance < 11 ? document.createElement('div') : null;
      if (screen) {
        Object.assign(screen.style, { position: 'fixed', inset: '0', zIndex: '19',
          pointerEvents: 'none',
          background: 'radial-gradient(circle, #fff9e5 0%, #ffc36d 45%, transparent 90%)',
          opacity: '0' });
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
        materials[5].opacity = materials[6].opacity = Math.max(0, 1 - seconds / 0.95);
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
        for (const part of debris) {
          part.mesh.position.set(part.x * seconds * 3.5,
                                 part.lift * seconds * 2.5 - 4.5 * seconds * seconds,
                                 part.z * seconds * 3.5);
          part.mesh.rotation.x += 0.13;
          part.mesh.rotation.y += 0.09;
        }
        if (light) light.intensity = Math.max(0, 4 * (1 - seconds / 0.25));
        if (screen) screen.style.opacity = String(Math.max(0,
          (topShot ? 0.52 : 0.27) * (1 - playerDistance / 11) * (1 - seconds / 0.22)));
        if (seconds < 1.2) requestAnimationFrame(tick);
        else {
          game.ue.remove(root);
          screen?.remove();
          for (const geometry of [coreGeo, flameGeo, smokeGeo, ringGeo, sparkGeo,
                                 debrisGeo]) geometry.dispose();
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

    function detonate(barrel, options = {}) {
      if (!barrel?.active) return false;
      const player = game.c;
      const topShot = options.auto || (player.onGround && Math.abs(player.pos.y - barrel.y - 1.12) < 0.16 &&
        Math.abs(player.pos.x - barrel.x) < 0.82 &&
        Math.abs(player.pos.z - barrel.z) < 0.82);
      barrel.active = false;
      barrel.block.off = true;
      if (barrel.block.mesh) barrel.block.mesh.visible = false;
      barrel.cap.off = true;
      if (barrel.cap.mesh) barrel.cap.mesh.visible = false;
      barrel.target.visible = false;
      game.c.shake = Math.max(game.c.shake || 0, topShot ? 0.58 : 0.38);
      playBlastSound(barrel);
      stats.blasts = (stats.blasts || 0) + 1;
      flash(barrel, topShot);

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

      const dx = player.pos.x - barrel.x;
      const dz = player.pos.z - barrel.z;
      const distance = Math.hypot(dx, player.pos.y + 0.8 - barrel.y - 0.56, dz);
      if (options.auto && barrel.land) {
        // The blast throws the player along an arc that ends on this barrel's
        // landing roof. The arc is solved from where the player actually is.
        if (player.state === 'ledge' || player.state === 'ladder' ||
            player.state === 'slide') player.state = 'normal';
        player.ledge = null;
        player.ladder = null;
        player.onGround = false;
        player.coyote = 0;
        player.airT = 0;
        const launch = blastArc(player.pos, barrel.land);
        player.vel.set(launch.x, launch.y, launch.z);
        stats.blastLaunches = (stats.blastLaunches || 0) + 1;
        game.rn('爆破ジャンプ！ 空中で進路を調整');
      } else if (distance <= 4.6 && blastVisible(barrel, player.pos.x,
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
        game.rn(topShot ? '爆破ジャンプ！ 空中で進路を調整' :
          '爆風で上昇！ 空中で進路を調整');
      } else game.rn('ドラム缶爆発！ 近くの敵を吹き飛ばした');
      return true;
    }

    // Launch velocity that lands on `land` = [x, roofTopY, z], peaking about 1 m
    // above the roof so the player arrives on the way down, never into a wall.
    function blastArc(from, land) {
      const gravity = Math.abs(game.U?.gravity ?? 20);
      const rise = land[1] - from.y;
      const up = Math.min(17.5, Math.max(11, Math.sqrt(2 * gravity * Math.max(0.5, rise + 1.1))));
      const time = (up + Math.sqrt(Math.max(up * up - 2 * gravity * rise, 0))) / gravity;
      const dx = land[0] - from.x, dz = land[2] - from.z;
      return { x: dx / time, y: up, z: dz / time };
    }

    // ---- Blast-jump sequence (about 1.3 s, controls locked, third-person) ----
    // run to the barrel -> hop onto it -> look down and aim at it -> shoot ->
    // blast -> big jump to the landing roof. Everything uses the normal player
    // physics and the existing run / jump / shoot animations; only the input,
    // the heading and the view pitch are driven here.
    const SEQ = { run: 11, hopFrom: 2.1, aim: 0.14, afterShot: 0.1, timeout: 3 };
    const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
    let fovKick = 0, postPitch = null;
    const cameraView = () => window.skyFollowCamera?.view ?? game.c;
    function setPitch(value) { game.c.pitch = value; cameraView().pitch = value; }
    function getPitch() { return cameraView().pitch; }

    function startAuto(barrel) {
      const player = game.c;
      if (autoBlast || !barrel?.active || game.z.over || player.state === 'hook') return false;
      if (player.state === 'ledge' || player.state === 'ladder' ||
          player.state === 'slide') player.state = 'normal';
      player.ledge = null;
      player.ladder = null;
      const topY = barrel.y + 1.12;
      const flat = Math.hypot(barrel.x - player.pos.x, barrel.z - player.pos.z);
      const level = player.onGround && Math.abs(player.pos.y - barrel.y) < 0.6;
      const onTop = player.onGround && Math.abs(player.pos.y - topY) < 0.25 && flat < 0.9;
      autoBlast = { barrel, topY, t: 0, phaseT: 0, fired: false, pitch0: getPitch(),
                    gunWas: game.U.gunOn, phase: onTop ? 'aim' : level ? 'run' : 'fly' };
      game.U.gunOn = true; // The gun must be drawn for the shot.
      postPitch = null;
      stats.blastAssists = (stats.blastAssists || 0) + 1;
      return true;
    }

    function endAuto(restoreGun = true) {
      if (!autoBlast) return;
      if (restoreGun) game.U.gunOn = autoBlast.gunWas;
      postPitch = autoBlast.fired ? { t: 0, pitch: autoBlast.pitch0 } : null;
      autoBlast = null;
    }

    function enter(phase) { autoBlast.phase = phase; autoBlast.phaseT = 0; }

    // Called from the player update every frame.
    function step(dt) {
      const player = game.c;
      if (fovKick > 0.01) fovKick *= Math.exp(-dt * 4.5); else fovKick = 0;
      if (postPitch) {
        postPitch.t += dt;
        setPitch(getPitch() + (postPitch.pitch - getPitch()) * (1 - Math.exp(-dt * 9)));
        if (postPitch.t > 0.5) postPitch = null;
      }
      if (!autoBlast) return;
      const a = autoBlast, { barrel, topY } = a;
      a.t += dt; a.phaseT += dt;
      if (!barrel.active || game.modeRef() !== 'play' || game.z.over ||
          player.state === 'hook' || a.t > SEQ.timeout) { endAuto(); return; }
      player.jumpBuf = 0; player.hookPressed = false; // Controls are locked.
      const dx = barrel.x - player.pos.x, dz = barrel.z - player.pos.z;
      const flat = Math.hypot(dx, dz);
      // Heading: face the barrel (the follow camera tracks this heading).
      if (flat > 0.35 && a.phase !== 'aim') {
        const want = Math.atan2(-dx, -dz);
        player.yaw += angleDiff(want, player.yaw) * (1 - Math.exp(-dt * 20));
      }
      const gravity = Math.abs(game.U?.gravity ?? 20);
      if (a.phase === 'run') {
        player.state = 'normal';
        if (flat <= SEQ.hopFrom) {
          // Hop: peak 0.35 m over the barrel top, land on it.
          const rise = topY - player.pos.y, up = Math.sqrt(2 * gravity * (rise + 0.35));
          player.vel.y = up; player.onGround = false; player.coyote = 0; player.airT = 0;
          game.Tt?.jump?.();
          enter('hop');
        } else {
          player.vel.x = dx / flat * SEQ.run;
          player.vel.z = dz / flat * SEQ.run;
          // Blocked by a prop or wall: leap straight to the barrel instead of grinding on it.
          a.stuckT = (a.lastFlat !== undefined && a.lastFlat - flat < SEQ.run * dt * 0.25) ? (a.stuckT || 0) + dt : 0;
          a.lastFlat = flat;
          if (a.stuckT > 0.2) enter('fly');
        }
      } else if (a.phase === 'hop') {
        const vy = player.vel.y, rise = topY - player.pos.y;
        const disc = vy * vy - 2 * gravity * rise;
        const remain = disc > 0 ? (vy + Math.sqrt(disc)) / gravity : 0;
        if (remain > 0.03) {
          const speed = Math.min(9, flat / remain);
          player.vel.x = dx / (flat || 1) * speed; player.vel.z = dz / (flat || 1) * speed;
        } else { player.vel.x = player.vel.z = 0; }
        if ((player.onGround && Math.abs(player.pos.y - topY) < 0.3 && flat < 1.0) ||
            a.phaseT > 0.9) enter('aim');
      } else if (a.phase === 'fly') {
        // Airborne or on another level: carried straight to the barrel top.
        player.state = 'normal'; player.onGround = false; player.coyote = 0;
        const dy = topY + 0.25 - player.pos.y;
        const distance = Math.hypot(dx, dy, dz) || 1;
        const speed = Math.min(15, Math.max(7, distance / 0.25));
        player.vel.set(dx / distance * speed, dy / distance * speed, dz / distance * speed);
        if (flat < 0.9 && player.pos.y > topY - 0.3) enter('aim');
        else if (a.phaseT > 1.1) endAuto(); // Could not get there: give control back.
      }
      if (a.phase === 'aim') {
        // Stand on the barrel, look straight down at it and aim the gun there.
        player.state = 'normal';
        player.vel.x = player.vel.z = 0;
        player.vel.y = player.pos.y > topY + 0.05 ? -3 : 0;
        player.pos.x += dx * Math.min(1, dt * 18); player.pos.z += dz * Math.min(1, dt * 18);
        const cam = game.Se.position, look = Math.atan2(topY - cam.y,
          Math.hypot(barrel.x - cam.x, barrel.z - cam.z));
        const wanted = Math.max(-1.3, Math.min(-0.35, look));
        setPitch(getPitch() + (wanted - getPitch()) * (1 - Math.exp(-dt * 16)));
        if (!a.fired && a.phaseT >= SEQ.aim) {
          a.fired = true; a.firedAt = a.phaseT;
          window.skyHumanView?.noteShot?.();
          game.Tt?.hg?.();
        }
        if (a.fired && a.phaseT >= a.firedAt + SEQ.afterShot) {
          fovKick = 14;
          endAuto();           // restores the gun setting and eases the view back
          detonate(barrel, { auto: true });
        }
      }
    }

    function reset() {
      if (autoBlast) game.U.gunOn = autoBlast.gunWas;
      autoBlast = null;
      fovKick = 0;
      postPitch = null;
      for (const barrel of barrels) {
        barrel.active = true;
        barrel.block.off = false;
        if (barrel.block.mesh) barrel.block.mesh.visible = true;
        barrel.cap.off = false;
        if (barrel.cap.mesh) barrel.cap.mesh.visible = true;
        barrel.target.visible = true;
      }
      stats.blasts = 0;
      stats.blastLaunches = 0;
      stats.blastAssists = 0;
    }

    // The first world collider under the touched pixel must be an active
    // barrel. This keeps walls and the low step from becoming remote triggers.
    function tapAt(clientX, clientY, touch = false) {
      if (game.modeRef() !== 'play' || game.z.over || window.skyBite?.locked) return false;
      const canvas = document.getElementById('c');
      const bounds = canvas.getBoundingClientRect();
      if (clientX < bounds.left || clientX > bounds.right ||
          clientY < bounds.top || clientY > bounds.bottom) return false;
      const assist = assistTarget();
      if (assist) {
        const radius = touch ? Math.min(128, Math.max(104,
          Math.min(window.__VW(), window.__VH()) * 0.26)) : 70;
        if (Math.hypot(assist.sx - clientX, assist.sy - clientY) <= radius) {
          return startAuto(assist.barrel);
        }
      }
      game.Se.updateMatrixWorld();
      const samples = touch ? [[0, 0], [14, 0], [-14, 0], [0, 14], [0, -14]] : [[0, 0]];
      for (const [offsetX, offsetY] of samples) {
        const x = clientX + offsetX, y = clientY + offsetY;
        if (x < bounds.left || x > bounds.right ||
            y < bounds.top || y > bounds.bottom) continue;
        const point = new Vector3(
          (x - bounds.left) / bounds.width * 2 - 1,
          1 - (y - bounds.top) / bounds.height * 2,
          0.5
        ).unproject(game.Se);
        const direction = point.sub(game.Se.position).normalize();
        const hit = (game.raycast || worldRaycast)(game.Se.position.x, game.Se.position.y,
          game.Se.position.z, direction.x, direction.y, direction.z, 200);
        const barrel = barrels.find(item => item.active &&
          (item.block === hit?.b || item.cap === hit?.b));
        if (barrel) return detonate(barrel);
      }
      return false;
    }

    document.getElementById('c').addEventListener('mousedown', event => {
      if (event.button !== 0 || !tapAt(event.clientX, event.clientY)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);

    document.addEventListener('keydown', event => {
      if (event.code !== 'KeyB' || event.repeat || event.ctrlKey || event.metaKey || window.skyBite?.locked ||
          /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName || '')) return;
      const assist = assistTarget();
      if (assist) startAuto(assist.barrel);
    });

    window.skyBlastBarrels = { barrels, pickShot, aimedAt, detonate, reset, tapAt,
                               step, assistTarget, startAuto, blastArc, fov: value => value + fovKick,
                               get sequence() { return autoBlast; } };
  });
})();
