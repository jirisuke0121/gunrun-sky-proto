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
  function edges(player, yaw, zombies, range = RANGE) {
    const out = { l: 0, r: 0, b: 0 };
    for (const e of zombies) {
      if (!alive(e)) continue;
      const d = Math.hypot(e.pos.x - player.x, e.pos.z - player.z);
      if (d >= range) continue;
      const w = Math.pow(1 - d / range, 1.2), a = relativeAngle(player.x, player.z, e.pos.x, e.pos.z, yaw), m = Math.abs(a);
      if (m < FRONT) continue;
      if (m >= BACK) out.b = Math.max(out.b, w);
      else if (a > 0) out.r = Math.max(out.r, w);
      else out.l = Math.max(out.l, w);
    }
    return out;
  }
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
  const api = { RANGE, FRONT, BACK, relativeAngle, edges, sample, createTrace };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.skyThreatMath = api;
})(globalThis);
