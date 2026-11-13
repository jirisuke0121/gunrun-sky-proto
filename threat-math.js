// Pure helpers for the pursuit-pressure trace and the direction edges. No game state, no DOM.
(function (root) {
  const RANGE = 16;                        // m: pursuers farther than this show no edge
  const FRONT = Math.PI * 50 / 180;        // inside this angle the pursuer is ahead of the camera: visible, no edge
  const BACK = Math.PI * 130 / 180;        // beyond this angle it is behind
  const alive = e => e && !e.dead && !e.remove && !e.rise && !(e.spawnT > 0);
  // Angle of a point relative to the camera heading: 0 ahead, +pi/2 right, +-pi behind (same rule as the crate arrow).
  function relativeAngle(px, pz, x, z, yaw) {
    const dx = x - px, dz = z - pz;
    return Math.atan2(dx * Math.cos(yaw) - dz * Math.sin(yaw), -dx * Math.sin(yaw) - dz * Math.cos(yaw));
  }
  // Strength 0..1 of the left / right / behind edges from the pursuers near the player.
  function edges(player, yaw, zombies, range = RANGE, blocked = null) {
    const out = { l: 0, r: 0, b: 0 };
    if (blocked) out.t = 0;
    for (const e of zombies) {
      if (!alive(e)) continue;
      const d = Math.hypot(e.pos.x - player.x, e.pos.z - player.z);
      if (d >= range) continue;
      const w = Math.pow(1 - d / range, 1.2), a = relativeAngle(player.x, player.z, e.pos.x, e.pos.z, yaw), m = Math.abs(a);
      if (m < FRONT) { if (blocked && blocked(e)) out.t = Math.max(out.t, w); continue; }
      if (m >= BACK) out.b = Math.max(out.b, w);
      else if (a > 0) out.r = Math.max(out.r, w);
      else out.l = Math.max(out.l, w);
    }
    return out;
  }
  // Far pursuers (beyond `from`, up to `to` m): the same sides and angles as edges(), but only a faint marker, 0.12 (far) to 0.37
  // (near). The caller shows it only while nobody is within `from` m, so it reads as "still being followed, far away".
  const FAR = 35;
  function far(player, yaw, zombies, from = RANGE, to = FAR, blocked = null) {
    const out = { l: 0, r: 0, b: 0 };
    if (blocked) out.t = 0;
    for (const e of zombies) {
      if (!alive(e)) continue;
      const d = Math.hypot(e.pos.x - player.x, e.pos.z - player.z);
      if (d < from || d >= to) continue;
      const w = .12 + .25 * (1 - (d - from) / (to - from)), a = relativeAngle(player.x, player.z, e.pos.x, e.pos.z, yaw), m = Math.abs(a);
      if (m < FRONT) { if (blocked && blocked(e)) out.t = Math.max(out.t, w); continue; }
      if (m >= BACK) out.b = Math.max(out.b, w);
      else if (a > 0) out.r = Math.max(out.r, w);
      else out.l = Math.max(out.l, w);
    }
    return out;
  }
  // Is the straight line from `a` to `b` cut by a wall or a floor? boxes: the game's solids (minX..maxZ). Only slabs and
  // monoliths hide a pursuer (a beam, a prop or a door does not). The last 3% of the line is ignored so a pursuer standing
  // right against a wall is not "hidden" by the wall it stands on.
  const HIDES = { slab: 1, mono: 1 };
  function segmentBlocked(a, b, boxes) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    for (let i = 0; i < boxes.length; i++) {
      const k = boxes[i];
      if (!k.solid || k.off || !HIDES[k.type]) continue;
      let t0 = 0, t1 = .97;
      if (dx) { let u = (k.minX - a.x) / dx, v = (k.maxX - a.x) / dx; if (u > v) { const w = u; u = v; v = w; } if (u > t0) t0 = u; if (v < t1) t1 = v; } else if (a.x < k.minX || a.x > k.maxX) continue;
      if (t0 > t1) continue;
      if (dy) { let u = (k.minY - a.y) / dy, v = (k.maxY - a.y) / dy; if (u > v) { const w = u; u = v; v = w; } if (u > t0) t0 = u; if (v < t1) t1 = v; } else if (a.y < k.minY || a.y > k.maxY) continue;
      if (t0 > t1) continue;
      if (dz) { let u = (k.minZ - a.z) / dz, v = (k.maxZ - a.z) / dz; if (u > v) { const w = u; u = v; v = w; } if (u > t0) t0 = u; if (v < t1) t1 = v; } else if (a.z < k.minZ || a.z > k.maxZ) continue;
      if (t0 <= t1) return true;
    }
    return false;
  }
  // The edge strength back to a distance, and the three steps shown on screen: 10-16 m a thin dark edge, 6-10 m wider and
  // brighter, under 6 m widest and pulsing. Same red throughout (yellow and orange stay marker colours).
  const distanceOf = (strength, range = RANGE) => strength > 0 ? range * (1 - Math.pow(Math.min(1, strength), 1 / 1.2)) : Infinity;
  const tier = (strength, range = RANGE) => { if (!(strength > 0)) return 0; const d = distanceOf(strength, range); return d < 6 ? 3 : d < 10 ? 2 : 1; };
  // One sample of how close the pursuit is: nearest distance (m), pursuers within 10 m, and how many are in view.
  function sample(player, zombies, inView) {
    let nearest = Infinity, within10 = 0, visible = 0;
    for (const e of zombies) {
      if (!alive(e)) continue;
      const d = Math.hypot(e.pos.x - player.x, e.pos.z - player.z);
      if (d < nearest) nearest = d;
      if (d < 10) within10++;
      if (inView && inView(e)) visible++;
    }
    return { nearest, within10, visible };
  }
  // 10 s windows of game time, at most `cap` of them. Numbers are small and rounded: the record stays tiny.
  function createTrace(cap = 18) {
    let windows = [];
    const r1 = v => Math.round(v * 10) / 10;
    return {
      reset() { windows = []; },
      add(t, s) {
        const index = Math.floor(t / 10);
        if (index >= cap || !Number.isFinite(s.nearest)) return;
        let w = windows.find(x => x.i === index);
        if (!w) { w = { i: index, n: 0, near: 0, min: Infinity, in10: 0, vis: 0, none: 0, c6: 0 }; windows.push(w); }
        w.n++; w.near += s.nearest; w.min = Math.min(w.min, s.nearest); w.in10 += s.within10; w.vis += s.visible;
        if (s.visible === 0) w.none++;
        if (s.nearest < 6) w.c6++;
      },
      snapshot() {
        // near: mean nearest distance; min: closest ever; in10: mean pursuers within 10 m; vis: mean pursuers in view;
        // none: share of samples with nobody in view; c6: share of samples with a pursuer within 6 m.
        return { every: .25, win: 10, w: windows.map(w => ({ i: w.i, n: w.n, near: r1(w.near / w.n), min: r1(w.min),
          in10: r1(w.in10 / w.n), vis: r1(w.vis / w.n), none: r1(w.none / w.n), c6: r1(w.c6 / w.n) })) };
      },
    };
  }
  const api = { RANGE, FRONT, BACK, relativeAngle, edges, far, FAR, segmentBlocked, distanceOf, tier, sample, createTrace };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.skyThreatMath = api;
})(globalThis);
