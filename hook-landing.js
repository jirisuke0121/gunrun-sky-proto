// Automatic hook arrivals keep their arc, but shed only momentum that would
// miss every safe landing. Manual jump releases stay free.
(() => {
  const game = window.__skyInternals;
  const { c, U } = game;
  const horizon = 2;
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
  function choose(floors, remaining, naturalOnly = false) {
    const candidates = [];
    for (const floor of floors) {
      if (!usable(floor) || floor.maxY > c.pos.y + .05 ||
          floor.maxY <= game.fallY) continue;
      const box = bounds(floor);
      if (box.minX > box.maxX || box.minZ > box.maxZ) continue;
      const time = flightTime(floor.maxY, c.vel.y);
      if (time < .001 || time > remaining) continue;
      const x = clamp(c.pos.x + c.vel.x * time, box.minX, box.maxX);
      const z = clamp(c.pos.z + c.vel.z * time, box.minZ, box.maxZ);
      const vx = (x - c.pos.x) / time, vz = (z - c.pos.z) / time;
      if (Math.hypot(vx, vz) > U.hookSpeed) continue;
      const correction = Math.hypot(vx - c.vel.x, vz - c.vel.z);
      if (naturalOnly && correction > .001) continue;
      candidates.push({ floor, box, vx, vz, time, correction });
    }
    // Keep a natural landing on any floor, including lower ground. Only if
    // none exists do we trim momentum. Prefer the first landing on a tie.
    candidates.sort((a, b) => a.correction - b.correction || a.time - b.time);
    for (const candidate of candidates) {
      const { floor, time, vx, vz } = candidate;
      // Check the entire proposed capsule arc, including standing clearance.
      let clear = true;
      for (let t = .04; t < time + .04; t += .04) {
        const f = Math.min(t, time), y = c.pos.y + c.vel.y * f - U.gravity * f * f / 2;
        if (!game.oe(c.pos.x + vx * f, Math.max(y, floor.maxY) + .02,
            c.pos.z + vz * f, c.r, c.h)) { clear = false; break; }
      }
      if (!clear) continue;
      return candidate;
    }
    return null;
  }
  function begin() {
    active = null;
    const reach = Math.max(Math.hypot(c.vel.x, c.vel.z), U.walkSpeed) * horizon + 2.5;
    const floors = game.near(c.pos.x - reach, c.pos.z - reach, c.pos.x + reach, c.pos.z + reach);
    const best = choose(floors, horizon);
    if (!best) return false;
    c.vel.x = best.vx; c.vel.z = best.vz;
    c.edgeJump = false;
    active = { floor: best.floor, box: best.box, floors, elapsed: 0 };
    return true;
  }
  function step(dt) {
    if (!active) return;
    if (c.onGround || c.state !== 'normal' || c.jumpBuf > 0 ||
        !usable(active.floor) || game.modeRef() !== 'play' || game.z.over ||
        (active.elapsed += dt) > horizon + .15 || c.pos.y < active.floor.maxY - .1) {
      active = null; return;
    }
    const time = flightTime(active.floor.maxY, c.vel.y);
    if (time < .001) return;
    const box = active.box;
    const x = c.pos.x + c.vel.x * time, z = c.pos.z + c.vel.z * time;
    if (x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ) return;
    // Do not pull held input back toward the previous floor if it now leads
    // naturally to a different supported landing.
    const next = choose(active.floors, horizon + .15 - active.elapsed, true);
    if (next) { active.floor = next.floor; active.box = next.box; return; }
    // Only the excess facing a drop is removed. Along-platform input and
    // momentum remain intact, and the usual edge assist takes over on land.
    c.vel.x = (clamp(x, box.minX, box.maxX) - c.pos.x) / time;
    c.vel.z = (clamp(z, box.minZ, box.maxZ) - c.pos.z) / time;
  }
  window.skyHookLanding = { begin, step, cancel() { active = null; },
    get active() { return active; } };
})();
