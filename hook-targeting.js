// One set of visibility rules for the mark, screen taps and launch validation.
// Coordinates and radii are CSS pixels, including the portrait rotation adapter.
globalThis.SkyHookAssist = {
  create({ player, settings, anchors, project, occluded, screen, touch }) {
    let marked = null;
    const tapRadius = () => touch() ? Math.min(128, Math.max(104, Math.min(screen().width, screen().height) * 0.26)) : 70;
    function inspect(anchor) {
      const dx = anchor[0] - player.pos.x, dy = anchor[1] - player.pos.y - player.eye, dz = anchor[2] - player.pos.z;
      const distance = Math.hypot(dx, dy, dz), point = project(anchor);
      let reason = null;
      if (distance > settings.hookRange) reason = 'out_of_range';
      else if (distance < 2.5) reason = 'too_close';
      else if (point.z < -1 || point.z > 1 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1) reason = 'offscreen';
      else if (occluded(dx / distance, dy / distance, dz / distance, distance - 0.6)) reason = 'occluded';
      const dot = (-Math.sin(player.yaw) * Math.cos(player.pitch) * dx + Math.sin(player.pitch) * dy - Math.cos(player.yaw) * Math.cos(player.pitch) * dz) / (distance || 1);
      const { width, height } = screen();
      return { anchor, reason, distance, angle: Math.acos(Math.max(-1, Math.min(1, dot))), x: (point.x + 1) * width / 2, y: (1 - point.y) * height / 2 };
    }
    const valid = anchor => anchors.includes(anchor) && !inspect(anchor).reason;
    function target() {
      if (player.state === 'hook' || player.state === 'ledge') { marked = null; return null; }
      const limit = touch() ? 55 * Math.PI / 180 : 0.61;
      let best = null, previous = null;
      for (const anchor of anchors) {
        const candidate = inspect(anchor);
        if (candidate.reason) continue;
        if (anchor === marked) previous = candidate;
        if (candidate.angle <= limit && (!best || candidate.angle < best.angle)) best = candidate;
      }
      // Keep the same visible mark across small hand/camera movements. A wall,
      // range limit or leaving the viewport invalidates it immediately.
      const slack = touch() ? 8 * Math.PI / 180 : 0;
      if (previous && previous.angle <= limit + slack && (!best || previous.angle <= best.angle + slack)) best = previous;
      marked = best?.anchor || null;
      return marked;
    }
    function pick(x, y) {
      const radius = tapRadius();
      let best = null, nearest = radius;
      for (const anchor of anchors) {
        const candidate = inspect(anchor);
        if (candidate.reason) continue;
        const offset = Math.hypot(candidate.x - x, candidate.y - y);
        if (offset <= nearest) { nearest = offset; best = anchor; }
      }
      return best;
    }
    function diagnostic(x, y) {
      let best = null;
      for (const anchor of anchors) {
        const candidate = inspect(anchor), offset = Math.hypot(candidate.x - x, candidate.y - y);
        if (offset > tapRadius() + 40 || (best && offset >= best.pixel)) continue;
        best = { reason: candidate.reason || (offset > tapRadius() ? 'aim_offset' : 'unknown'), anchor: anchors.indexOf(anchor), distance: Math.round(candidate.distance * 10) / 10, pixel: Math.round(offset) };
      }
      return best || { reason: 'no_anchor_near_tap', anchor: null, distance: null, pixel: null };
    }
    return { target, pick, valid, diagnostic, tapRadius };
  },
};

// Registered old-town wall-jump spots. Kept in the shared targeting script so
// the game remains playable even when the Pages build omits a standalone JS asset.
(() => {
  const points = [
    { at: [14, 2.84, 9.82], normal: [1, 0] },
    { at: [14, 2.28, -10.42], normal: [1, 0] },
    { at: [-14, 3.22, -8.1], normal: [-1, 0] },
    { at: [-14, 2.69, 11.51], normal: [-1, 0] },
  ];

  function matchingPoint(player, getWall, wallNormal) {
    const radius = player.r + 0.55;
    return (globalThis.skySwingCourse ? [globalThis.skySwingCourse.wall] : points).find(({ at, normal }) => {
      const [x, y, z] = at;
      const [nx, nz] = normal;
      if (wallNormal && wallNormal.x * nx + wallNormal.z * nz < 0.8) return false;
      if (!getWall(player.pos.x - nx * radius, player.pos.y + 1, player.pos.z - nz * radius)) return false;
      const planeDistance = nx
        ? Math.abs(player.pos.x - (x + nx * (player.r + 0.04)))
        : Math.abs(player.pos.z - (z + nz * (player.r + 0.04)));
      const alongWallDistance = nx ? Math.abs(player.pos.z - z) : Math.abs(player.pos.x - x);
      return planeDistance <= 0.7 && alongWallDistance <= 1.6 && Math.abs(player.pos.y - y) <= 1.5;
    });
  }

  globalThis.__skyCanWallJumpAtSpot = (player, getWall, wallNormal) =>
    !!matchingPoint(player, getWall, wallNormal);

  globalThis.__skyTryRegisteredWallJump = (player, settings, getWall, time, stats, audio) => {
    const spot = matchingPoint(player, getWall);
    if (!spot) return false;
    const [nx, nz] = spot.normal;
    const intoWall = player.vel.x * nx + player.vel.z * nz;
    const tangentX = player.vel.x - nx * intoWall;
    const tangentZ = player.vel.z - nz * intoWall;
    player.vel.x = tangentX + nx * settings.wallJumpPush;
    player.vel.z = tangentZ + nz * settings.wallJumpPush;
    player.vel.y = settings.jumpVel * 0.95;
    player.onGround = false;
    player.state = "normal";
    player.jumpBuf = 0;
    player.airT = 0;
    player.wallT = 0;
    globalThis.skyTelemetryProbe?.jumpAccepted(time, "walljump");
    stats.walljumps = (stats.walljumps || 0) + 1;
    audio.jump();
    return true;
  };
})();
