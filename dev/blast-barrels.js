// Two one-use escape tools for the canyon whitebox. The game calls pickShot
// from its existing hitscan path, so walls and enemies keep their normal order.
(() => {
  window.addEventListener('load', () => {
    const game = window.__skyInternals;
    const barrels = window.SKY_CANYON_BLAST_BARRELS;
    if (!game || !Array.isArray(barrels)) return;
    const stats = window.__game.stats;

    const { Standard, Basic, Sphere, Mesh, Vector3 } = game.Geom;
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

    const shotBlock = (origin, direction, maxDistance, raycast) => {
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

    function flash(barrel) {
      const material = new Basic({ color: 0xffad2f, transparent: true,
                                   opacity: 0.52, depthWrite: false });
      const shell = new Mesh(new Sphere(1, 16, 10), material);
      shell.position.set(barrel.x, barrel.y + 0.65, barrel.z);
      game.ue.add(shell);
      const start = performance.now();
      const tick = now => {
        const progress = Math.min(1, (now - start) / 350);
        shell.scale.setScalar(0.6 + progress * 5);
        material.opacity = 0.52 * (1 - progress);
        if (progress < 1) requestAnimationFrame(tick);
        else {
          game.ue.remove(shell);
          shell.geometry.dispose();
          material.dispose();
        }
      };
      requestAnimationFrame(tick);
    }

    function detonate(barrel) {
      if (!barrel?.active) return false;
      barrel.active = false;
      barrel.block.off = true;
      if (barrel.block.mesh) barrel.block.mesh.visible = false;
      game.c.shake = Math.max(game.c.shake || 0, 0.38);
      game.Mn(0.65, 300, 0.8, 0.3);
      game.ni(0.45, 110, 0.28);
      stats.blasts = (stats.blasts || 0) + 1;
      flash(barrel);

      // Local clearing only: enemies elsewhere continue the chase.
      for (const zombie of game.Jt) {
        if (zombie.dead || zombie.spawnT > 0) continue;
        const dx = zombie.pos.x - barrel.x;
        const dz = zombie.pos.z - barrel.z;
        const distance = Math.hypot(dx, zombie.pos.y - barrel.y, dz);
        if (distance > 5.2) continue;
        const horizontal = Math.hypot(dx, dz) || 1;
        zombie.hurt(distance < 2.6 ? 4 : 2, dx / horizontal, dz / horizontal,
                    1.25, 9 * (1 - distance / 7));
      }

      const player = game.c;
      const dx = player.pos.x - barrel.x;
      const dz = player.pos.z - barrel.z;
      const distance = Math.hypot(dx, player.pos.y + 0.8 - barrel.y - 0.56, dz);
      if (distance <= 4.6) {
        const horizontal = Math.hypot(dx, dz) || 1;
        if (player.state === 'ledge' || player.state === 'ladder' ||
            player.state === 'slide') player.state = 'normal';
        player.ledge = null;
        player.ladder = null;
        player.onGround = false;
        player.coyote = 0;
        player.airT = 0;
        player.vel.y = Math.max(player.vel.y, distance <= 3.4 ? 14.4 : 11.4);
        // A small shove preserves room to clear the deck underside first.
        player.vel.x += dx / horizontal * 0.35;
        player.vel.z += dz / horizontal * 0.35;
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
