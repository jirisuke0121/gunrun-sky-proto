// High layer for the old town (2026-10-25). The town had roofs at 2-8 m and only a
// few points above 10 m, so rooftop running never felt high. This adds three
// towers on the west side (where the run starts), each with its own way up and a
// zipline back down to the central 8 m plaza:
//   West tower  (14 m): roof -> ladder -> 9 m ledge -> ladder -> top.
//   Plank       (14 m): 0.6 m wide beam from the west tower to the bell tower,
//                       over the alley, so the ground is visible below.
//   Bell tower  (14 m): zipline down to the plaza.
//   South tower (13 m): grapple anchor above its north edge (fast), ladder on the
//                       south side (slow, zombies use it too); zipline to the plaza.
// Coordinates are Three.js (x east, y up, z south). Collision boxes are the same
// kind the rest of the town uses, so the zombie path graph picks them up.
window.buildSkyTowers = function ({ ne, Mh, ld, us }) {
  const box = (x0, y0, z0, x1, y1, z1, type = 'slab') => ne(x0, y0, z0, x1, y1, z1, type);

  // West tower on the 4.2 m building at x -61..-55, z -12..-5.5.
  box(-60.5, 4.2, -11.5, -56.5, 14, -7.5);           // tower body
  box(-60.5, 4.2, -7.5, -56.5, 9, -5.5);             // 9 m ledge (annex)
  Mh(-56.5, -6.5, 1, 0, 4.2, 9);                     // roof -> ledge (east face of annex)
  Mh(-58.5, -7.5, 0, 1, 9, 14);                      // ledge -> top (south face of tower)

  // Plank across the alley to the bell tower.
  box(-56.5, 13.62, -9.8, -51.5, 14, -9.2, 'beam');

  // Bell tower on the 4.4 m building at x -52..-47, z -12..-5.5.
  box(-51.5, 4.4, -11.5, -47.5, 14, -7.5);
  ld([-49.5, 16.3, -9.5], [-13, 10.3, -9]);          // down to the plaza

  // South tower on the 4.4 m building at x -58..-53.5, z 12..18.
  box(-57.5, 4.4, 12.5, -54, 13, 15.5);
  us.push([-55.75, 15.4, 11.6]);                     // grapple from the street or roofs to the north
  Mh(-55.75, 15.5, 0, 1, 4.4, 13);                   // slow way up on the far side, so zombies can follow
  ld([-55.75, 15.3, 14], [-14, 10.3, 4]);            // down to the plaza
};
