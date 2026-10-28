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
      const view = globalThis.skyFollowCamera?.active ? globalThis.skyFollowCamera.view : player;
      const dot = (-Math.sin(view.yaw) * Math.cos(view.pitch) * dx + Math.sin(view.pitch) * dy - Math.cos(view.yaw) * Math.cos(view.pitch) * dz) / (distance || 1);
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

// The dedicated registry owns all wall-jump permissions. Never restore stale
// locations here when it is unavailable, and never overwrite a loaded registry.
globalThis.__skyCanWallJumpAtSpot ??= () => false;
globalThis.__skyTryRegisteredWallJump ??= () => false;
