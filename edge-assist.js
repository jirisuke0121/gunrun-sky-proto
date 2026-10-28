// Ground movement follows ledges; intentional airborne travel is free.
(() => {
  const game = window.__skyInternals;
  const { c } = game;
  let last = null;
  const eligible = () => c.vel.y <= 0 && (c.state === 'normal' || c.state === 'slide');

  function field(dx, dz) {
    const radius = Math.max(0, c.r - .06);
    const floors = game.near(Math.min(c.pos.x, c.pos.x + dx) - radius - .2,
      Math.min(c.pos.z, c.pos.z + dz) - radius - .2,
      Math.max(c.pos.x, c.pos.x + dx) + radius + .2,
      Math.max(c.pos.z, c.pos.z + dz) + radius + .2)
      .filter(floor => !floor.off && floor.solid !== false && floor.maxY >= game.fallY);
    const contains = (floor, x, z) => x - radius < floor.maxX && x + radius > floor.minX &&
      z - radius < floor.maxZ && z + radius > floor.minZ;
    // Follow contiguous stair/ramp steps at the collision solver's reach.
    // A floor several metres below cannot support the next footstep.
    function surface(x, z, height) {
      let top = -Infinity;
      for (const floor of floors) {
        if (floor.maxY >= height - .45 && floor.maxY <= height + .42 &&
          floor.maxY > top && contains(floor, x, z)) top = floor.maxY;
      }
      return top;
    }
    let boundaryHeight = c.pos.y;
    function sweep(x, z) {
      if (floors.some(floor => floor.maxY >= c.pos.y - .45 && floor.maxY <= c.pos.y + .42 &&
        contains(floor, c.pos.x, c.pos.z) && contains(floor, c.pos.x + x, c.pos.z + z))) return 1;
      const samples = Math.max(1, Math.ceil(Math.hypot(x, z) / .08));
      let safe = 0, height = c.pos.y;
      for (let i = 1; i <= samples; i++) {
        const next = i / samples;
        const top = surface(c.pos.x + x * next, c.pos.z + z * next, height);
        if (Number.isFinite(top)) { safe = next; height = top; continue; }
        let end = next;
        for (let j = 0; j < 8; j++) {
          const middle = (safe + end) / 2;
          const level = surface(c.pos.x + x * middle, c.pos.z + z * middle, height);
          if (Number.isFinite(level)) { safe = middle; height = level; }
          else end = middle;
        }
        boundaryHeight = height;
        return safe;
      }
      return 1;
    }
    function normal(x, z) {
      const px = c.pos.x + x, pz = c.pos.z + z, probe = .14;
      const supported = (x, z) => Number.isFinite(surface(x, z, boundaryHeight));
      const nx = Number(supported(px + probe, pz)) - Number(supported(px - probe, pz));
      const nz = Number(supported(px, pz + probe)) - Number(supported(px, pz - probe));
      const length = Math.hypot(nx, nz);
      return length ? { x: nx / length, z: nz / length } : null;
    }
    const clear = (x, z) => {
      const top = surface(c.pos.x + x, c.pos.z + z, c.pos.y);
      return game.oe(c.pos.x + x, Math.max(c.pos.y, top) + .03, c.pos.z + z, c.r, c.h - .04);
    };
    return { sweep, normal, clear };
  }

  function steer(dt, inputX, inputZ, magnitude, speedLimit, incomingSpeed) {
    last = null;
    if (!c.onGround || !eligible() || !(dt > 0)) return;
    const speed = Math.hypot(c.vel.x, c.vel.z);
    if (speed < .1) return;
    const look = Math.max(.65, Math.min(3.2, speed * .30 + c.r));
    const dx = c.vel.x / speed * look, dz = c.vel.z / speed * look;
    const floor = field(dx, dz), safe = floor.sweep(dx, dz);
    if (safe === 1) return;
    const normal = floor.normal(dx * safe, dz * safe);
    if (!normal) return;
    const outward = -(c.vel.x * normal.x + c.vel.z * normal.z);
    if (outward <= 0) return;
    const clearance = look * safe * outward / speed;
    // Cap only the component pointing into the void, before reaching the edge.
    // With a tangent, turn that speed along the ledge instead of losing it.
    const cap = Math.sqrt(2 * 18 * Math.max(0, clearance - .10 - outward * dt));
    if (outward <= cap) return;
    const tx = c.vel.x + normal.x * outward, tz = c.vel.z + normal.z * outward;
    const tangent = Math.hypot(tx, tz);
    let vx = tx - normal.x * cap, vz = tz - normal.z * cap;
    if (tangent >= Math.max(.35, speed * .12)) {
      // Ground acceleration would otherwise brake along-edge motion while the
      // held input still points diagonally outward. Retain the prior speed up
      // to the requested pace, while allowing release, reversal and slowing.
      const keepingPace = magnitude > 0 && speedLimit > 0 &&
        (c.vel.x * inputX + c.vel.z * inputZ) / speed > .1 && !window.skyLandingRoll?.active;
      const pace = keepingPace ? Math.max(speed, Math.min(incomingSpeed, speedLimit)) : speed;
      const along = Math.sqrt(Math.max(0, pace * pace - cap * cap));
      const x = tx / tangent * along - normal.x * cap;
      const z = tz / tangent * along - normal.z * cap;
      if (floor.clear(x * dt, z * dt)) { vx = x; vz = z; }
    }
    c.vel.x = vx; c.vel.z = vz;
    last = { kind: 'steer', before: speed, after: Math.hypot(vx, vz), clearance, normal };
  }

  function guardMove(dx, dz) {
    // The collision path also covers the first landing frame and long frames.
    if (!eligible() || (!dx && !dz)) return null;
    const floor = field(dx, dz), safe = floor.sweep(dx, dz);
    if (safe === 1) return null;
    const length = Math.hypot(dx, dz), normal = floor.normal(dx * safe, dz * safe);
    const speed = Math.hypot(c.vel.x, c.vel.z), dt = speed > .001 ? length / speed : 0;
    if (normal && dt > 0) {
      const out = dx * normal.x + dz * normal.z;
      const tx = dx - normal.x * out, tz = dz - normal.z * out;
      const tangent = Math.hypot(tx, tz);
      if (tangent > length * .12) {
        const x = tx / tangent * length, z = tz / tangent * length;
        if (floor.sweep(x, z) === 1 && floor.clear(x, z)) {
          c.vel.x = x / dt; c.vel.z = z / dt;
          last = { kind: 'slide', before: speed, after: speed };
          return { x, z };
        }
      }
    }
    c.vel.x *= safe; c.vel.z *= safe;
    last = { kind: 'limit', before: speed, after: Math.hypot(c.vel.x, c.vel.z) };
    return { x: dx * safe, z: dz * safe };
  }

  window.skyEdgeAssist = { steer, guardMove, get last() { return last; } };
})();
