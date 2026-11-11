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
    // A gap jump is lined up (flow-feel.js, trial): keep the run-up speed to the edge.
    if (window.skyFlow?.armed) return;
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

  // ---- Landing assist: a jump does not sail over the roof it was meant for ----
  // A running jump covers 4.3 m or more, and most roof-to-roof gaps here are 1-2 m wide with a
  // landing 1-2 m deep. Pressed close to the lip (the natural timing) such a jump clears the gap,
  // flies over the landing and drops to the next level down. While the jump is in the air, if its
  // arc passes over a roof near take-off height and would come down clearly below it, the forward
  // speed is cut just enough to come down on that roof. Jumps that already land at roof level,
  // steered jumps and launches (pads, blasts, dash) are left alone. `?landAssist=0` turns it off.
  const landingAssist = !!(game.U && game.oe) && !/[?&]landAssist=0(&|$)/.test(typeof location === 'object' && location ? String(location.search || '') : '');
  const LEVEL_DOWN = 1.5, LEVEL_UP = .5, LOWER = 1.2, INSET = .3, HORIZON = 1.6, STEP = 1 / 45;
  let air = null, trims = 0;
  function arc(ux, uz, speed) {
    const U = game.U, reach = speed * HORIZON + 1, x0 = c.pos.x, y0 = c.pos.y, z0 = c.pos.z, vy = c.vel.y;
    const floors = game.near(Math.min(x0, x0 + ux * reach) - 1, Math.min(z0, z0 + uz * reach) - 1,
      Math.max(x0, x0 + ux * reach) + 1, Math.max(z0, z0 + uz * reach) + 1)
      .filter(floor => !floor.off && floor.solid !== false && floor.type !== 'mono');
    const under = (x, z) => floor => x > floor.minX && x < floor.maxX && z > floor.minZ && z < floor.maxZ;
    const low = air.y - LEVEL_DOWN, high = air.y + LEVEL_UP;
    let before = y0, gap = air.gap, roof = null, landing = null;
    for (let t = 0; t <= HORIZON; t += STEP) {
      const x = x0 + ux * speed * t, z = z0 + uz * speed * t, y = y0 + vy * t - .5 * U.gravity * t * t, here = floors.filter(under(x, z));
      const hit = t > 0 && here.filter(floor => floor.maxY <= before + .05 && floor.maxY >= y - .05).sort((a, b) => b.maxY - a.maxY)[0];
      if (hit) { landing = hit; break; }
      if (t > 0 && !game.oe(x, y + .05, z, c.r, c.h - .1)) return null;      // a wall or an overhang: not a plain jump
      const level = here.filter(floor => floor.maxY >= low && floor.maxY <= high && floor.maxY <= y + .05).sort((a, b) => b.maxY - a.maxY)[0];
      if (t === 0) { if (!level) air.gap = gap = true; }                       // the take-off roof is behind us from here on
      if (!roof) { if (!level) gap = true; else if (gap) roof = { top: level.maxY, enter: speed * t, leave: speed * t }; }
      else if (!roof.closed) { if (level && Math.abs(level.maxY - roof.top) < .45) roof.leave = speed * t; else roof.closed = true; }
      before = y;
    }
    if (!roof || (landing && landing.maxY > roof.top - LOWER)) return null;   // nothing passed over, or it comes down at roof level anyway
    const depth = roof.leave - roof.enter, target = depth > INSET * 2 ? roof.leave - INSET : (roof.enter + roof.leave) / 2;
    return { top: roof.top, x: x0 + ux * target, z: z0 + uz * target };
  }
  function airborne(inputX, inputZ, magnitude) {
    if (!landingAssist) return;
    if (c.onGround || c.state !== 'normal' || !c.edgeJump) { air = null; return; }
    if (!air) air = { y: c.lastGround.y, gap: false, plan: null, trimmed: false };
    const speed = Math.hypot(c.vel.x, c.vel.z), U = game.U;
    if (speed < .3) return;
    const ux = c.vel.x / speed, uz = c.vel.z / speed;
    if (magnitude > 0 && inputX * ux + inputZ * uz < .5) { air.plan = null; return; }   // steering away: the player is aiming elsewhere
    if (!air.plan) {
      if (speed < 1.5 || speed > U.sprintSpeed + 1.6 || c.vel.y > U.jumpVel + .2) return; // launches (pads, blasts, dash) are left alone
      air.plan = arc(ux, uz, speed);
      if (!air.plan) return;
    }
    // Hold the speed that brings the feet down on the chosen spot of that roof.
    const plan = air.plan, ahead = (plan.x - c.pos.x) * ux + (plan.z - c.pos.z) * uz, root = c.vel.y * c.vel.y + 2 * U.gravity * (c.pos.y - plan.top);
    if (ahead <= .02 || root < 0) { air.plan = null; return; }
    const time = (c.vel.y + Math.sqrt(root)) / U.gravity, wanted = time > .02 ? ahead / time : 0;
    if (!(wanted < speed - .02)) return;
    const next = Math.max(.4, wanted);
    c.vel.x = ux * next; c.vel.z = uz * next;
    if (!air.trimmed) { air.trimmed = true; trims++; }
    last = { kind: 'landing', before: speed, after: next, top: plan.top };
  }
  const groundSteer = steer;
  function steerAll(dt, inputX, inputZ, magnitude, speedLimit, incomingSpeed) {
    groundSteer(dt, inputX, inputZ, magnitude, speedLimit, incomingSpeed);
    if (dt > 0) airborne(inputX, inputZ, magnitude);
  }

  window.skyEdgeAssist = { steer: steerAll, guardMove, get last() { return last; }, get landingTrims() { return trims; }, landingAssist };
})();
