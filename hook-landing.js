// Automatic hook arrivals keep their arc, but shed only momentum that would
// carry the player past the destination. Manual jump releases stay free.
(() => {
  const game = window.__skyInternals;
  const { c, U } = game;
  let active = null;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const usable = b => b.solid !== false && !b.off;
  function bounds(b) {
    const mx = Math.min(c.r + .12, (b.maxX - b.minX) / 2 - .01);
    const mz = Math.min(c.r + .12, (b.maxZ - b.minZ) / 2 - .01);
    return { minX: b.minX + mx, maxX: b.maxX - mx,
      minZ: b.minZ + mz, maxZ: b.maxZ - mz };
  }
  function flightTime(y, vy) {
    const g = U.gravity;
    return (vy + Math.sqrt(Math.max(0, vy * vy + 2 * g * Math.max(0, c.pos.y - y)))) / g;
  }
  function begin(anchor) {
    active = null;
    const floors = game.near(anchor[0] - 3, anchor[2] - 3, anchor[0] + 3, anchor[2] + 3);
    let best = null;
    for (const floor of floors) {
      if (!usable(floor) || floor.maxY > c.pos.y + .05 ||
          floor.maxY > anchor[1] + .1 || floor.maxY < anchor[1] - 4) continue;
      const box = bounds(floor);
      if (box.minX > box.maxX || box.minZ > box.maxZ) continue;
      const ax = clamp(anchor[0], box.minX, box.maxX), az = clamp(anchor[2], box.minZ, box.maxZ);
      if (Math.hypot(ax - anchor[0], az - anchor[2]) > 2.5) continue;
      const time = flightTime(floor.maxY, c.vel.y);
      if (time < .08 || time > 1.25) continue;
      const x = clamp(c.pos.x + c.vel.x * time, box.minX, box.maxX);
      const z = clamp(c.pos.z + c.vel.z * time, box.minZ, box.maxZ);
      const vx = (x - c.pos.x) / time, vz = (z - c.pos.z) / time;
      if (Math.hypot(vx, vz) > U.hookSpeed) continue;
      // Check the entire proposed capsule arc, including standing clearance.
      let clear = true;
      for (let t = .04; t < time + .04; t += .04) {
        const f = Math.min(t, time), y = c.pos.y + c.vel.y * f - U.gravity * f * f / 2;
        if (!game.oe(c.pos.x + vx * f, Math.max(y, floor.maxY) + .02,
            c.pos.z + vz * f, c.r, c.h)) { clear = false; break; }
      }
      if (!clear) continue;
      const correction = Math.hypot(vx - c.vel.x, vz - c.vel.z);
      const score = correction + Math.hypot(ax - anchor[0], az - anchor[2]) * 2 +
        Math.max(0, anchor[1] - floor.maxY) * .3;
      if (!best || score < best.score) best = { floor, box, vx, vz, score };
    }
    if (!best) return false;
    c.vel.x = best.vx; c.vel.z = best.vz;
    c.edgeJump = false;
    active = { floor: best.floor, box: best.box, elapsed: 0 };
    return true;
  }
  function step(dt) {
    if (!active) return;
    if (c.onGround || c.state !== 'normal' || c.jumpBuf > 0 ||
        !usable(active.floor) || game.modeRef() !== 'play' || game.z.over ||
        (active.elapsed += dt) > 1.4 || c.pos.y < active.floor.maxY - .1) {
      active = null; return;
    }
    const time = flightTime(active.floor.maxY, c.vel.y);
    if (time < .001) return;
    const box = active.box;
    const x = c.pos.x + c.vel.x * time, z = c.pos.z + c.vel.z * time;
    // Only the excess facing a drop is removed. Along-platform input and
    // momentum remain intact, and the usual edge assist takes over on land.
    c.vel.x = (clamp(x, box.minX, box.maxX) - c.pos.x) / time;
    c.vel.z = (clamp(z, box.minZ, box.maxZ) - c.pos.z) / time;
  }
  window.skyHookLanding = { begin, step, cancel() { active = null; },
    get active() { return active; } };
})();
