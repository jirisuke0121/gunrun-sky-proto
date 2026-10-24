// High layer for the old town (2026-10-25). The town had roofs at 2-8 m and only a
// few points above 10 m, so rooftop running never felt high. This adds three
// towers on the west side (where the run starts), each with its own way up and a
// zipline back down to the central 8 m plaza:
//   West tower  (15 m): pillar steps (no ladders anywhere).
//   Plank       (15 m): 0.6 m wide beam from the west tower to the bell tower,
//                       over the alley, so the ground is visible below.
//   Bell tower  (15 m): zipline down to the plaza.
//   South tower (11.6 m): grapple anchor above its north edge (fast), two pillar steps
//                       (slow, zombies use them too); zipline to the plaza.
// Coordinates are Three.js (x east, y up, z south). Collision boxes are the same
// kind the rest of the town uses, so the zombie path graph picks them up.
window.buildSkyTowers = function ({ ne, Mh, ld, us, mo }) {
  const box = (x0, y0, z0, x1, y1, z1, type = 'slab') => ne(x0, y0, z0, x1, y1, z1, type);

  // Each tower stands on the back half of its roof. A column of 2 m wide pillars next
  // to it (2.4 m rises) is the slow way up: it costs a mantle per step, so the plank,
  // the grapple and the zipline are faster. Pillars are 2 m wide so that zombies
  // (1 m path grid, mantle up to 3.5 m) can use them as well.
  const col = (x0, x1, zs, base, rise) => zs.forEach(([z0, z1], i) => box(x0, base, z0, x1, base + rise * (i + 1), z1));

  // West tower (15 m) on the 4.2 m building at x -61..-55, z -12..-5.5.
  box(-58.5, 4.2, -11.5, -55.5, 15, -7.5);
  col(-61, -58.5, [[-7.5, -5.5], [-9.5, -7.5], [-12, -9.5]], 4.2, 2.5);   // pillars 6.7 / 9.2 / 11.7

  // Plank across the alley to the bell tower (3.5 m gap, 0.6 m wide, ground visible below).
  box(-55.5, 14.62, -9.8, -52, 15, -9.2, 'beam');

  // Bell tower (15 m) on the 4.4 m building at x -52..-47, z -12..-5.5.
  box(-52, 4.4, -11.5, -49.5, 15, -7.5);
  col(-49.5, -47, [[-7.5, -5.5], [-9.5, -7.5], [-12, -9.5]], 4.4, 2.5);     // 6.9 / 9.4 / 11.9
  ld([-50.75, 17.3, -9.5], [-13, 10.3, -9]);                                    // zipline down to the plaza

  // South tower (11.6 m) on the 4.4 m building at x -58..-53.5, z 12..18.
  box(-57.5, 4.4, 12, -54, 11.6, 14);
  box(-58, 4.4, 16, -56, 6.8, 18);
  box(-58, 4.4, 14, -56, 9.2, 16);
  us.push([-55.75, 14.0, 11.2]);                                             // grapple from the street or the roofs to the north
  ld([-55.75, 13.9, 13], [-14, 10.3, 4]);                                    // zipline down to the plaza

  // Stepping stone between the 4.4 m and 5.5 m roofs: zombies leap gaps of up to 1 m in height, this one is 1.1 m.
  box(-60, 0, 16, -58, 4.95, 18);

  // Sky chain: tall pillars standing in the street (from the ground, so nobody can climb them
  // from below), reached by jumping from the bell tower top (15 m). Gaps are 3.4-4 m with a
  // small drop, a sprint jump for people and a leap for zombies. The last pillar has a zipline
  // down to the plaza.
  box(-46.3, 0, -8, -43.9, 14.4, -5.6);
  box(-39.9, 0, -8, -37.5, 13.9, -5.6);
  box(-33.5, 0, -8, -31.1, 13.3, -5.6);
  ld([-32.3, 15.6, -6.8], [-14, 10.3, -5]);

  // One low step beside the east end of the south roofs: the only entrance from the street.
  box(-34.5, 0, 15.6, -33.1, 2, 17);

  // Equal footing (2026-10-25). The player must not be able to climb from below
  // anywhere on the parkour route, so the west district has no ladders at all.
  // Zombies would be stuck on the ground, so inside this district they jump gaps and
  // drop down exactly as the player does (see skyLeapOK). They already mantle up to
  // 3.5 m, like the player.
  for (let i = mo.length - 1; i >= 0; i--) {
    const m = mo[i];
    if (m.x < -30 && m.x > -72 && m.z > -14 && m.z < 20) mo.splice(i, 1);
  }
};

// Zombies may use jump and drop edges only inside the west district (x -72..-30).
window.skyLeapOK = function (edge) {
  const g = window.__game, N = g && g.NAV;
  if (!N) return false;
  const a = N.nodes[edge.from];
  return a.x < -30 && a.x > -72 && a.z > -14 && a.z < 20;
};
