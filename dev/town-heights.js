// High layer for the old town (2026-10-25). The town had roofs at 2-8 m and only a
// few points above 10 m, so rooftop running never felt high. This adds three
// towers on the west side (where the run starts), each with its own way up.
// No new ziplines (the three original ones are the only ones):
//   West tower  (14.2 m): a 6-step staircase beside it (no ladders anywhere).
//   Plank       (14.2 m): 0.6 m wide beam from the west tower to the bell tower,
//                       over the alley, so the ground is visible below.
//   Bell tower  (14.2 m): the start of the sky chain.
//   South tower (11.6 m): grapple anchor above its north edge (fast), two pillar steps
//                       (slow, zombies use them too).
// Coordinates are Three.js (x east, y up, z south). Collision boxes are the same
// kind the rest of the town uses, so the zombie path graph picks them up.
window.buildSkyTowers = function ({ ne, Mh, ld, us, mo }) {
  const box = (x0, y0, z0, x1, y1, z1, type = 'slab') => ne(x0, y0, z0, x1, y1, z1, type);

  // Each tower stands on the back half of its roof, with a staircase beside it: six steps
  // (1.25 m rises, 1.08 m treads, 1.5 m wide, a 2.5 m landing at the top), so anything going up, people or zombies,
  // goes up in single file. The plank, the grapple and the sky chain are the fast ways.
  // The steps are 1 m treads so the zombie path grid (1 m) has a node on every step.
  const stairs = (x0, x1, base, wide) => {
    for (let i = 0; i < 6; i++) box(x0, base, -5.5 - 1.083 * (i + 1), i === 5 ? x1 : x0 + wide, base + 1.25 * (i + 1), -5.5 - 1.083 * i);
  };
  // Small crate stacks on the roofs: cover, and 1.2 m / 2.4 m hops.
  const crates = (list) => list.forEach(([x0, z0, x1, z1, h]) => box(x0, 0, z0, x1, h, z1, 'prop'));

  // West tower (14.2 m) on the 4.2 m building at x -61..-55, z -12..-5.5.
  box(-58.5, 4.2, -12, -55.5, 14.2, -7.5);
  stairs(-61, -58.5, 4.2, 1.5);                                                  // up to 11.7 m, then a 2.5 m mantle onto the tower

  // Plank across the alley to the bell tower (3.5 m gap, 0.6 m wide, ground visible below).
  box(-55.5, 13.82, -9.8, -52, 14.2, -9.2, 'beam');

  // Bell tower (14.2 m) on the 4.4 m building at x -52..-47, z -12..-5.5.
  box(-52, 4.4, -12, -49.5, 14.2, -7.5);
  stairs(-49.5, -47, 4.4, 1.5);                                                  // up to 11.9 m

  crates([[-57.5, -7.5, -55.5, -5.5, 5.4], [-57, -7, -55.5, -5.5, 6.6],    // west roof
          [-52, -7.5, -50, -5.5, 5.6], [-51.5, -7, -50, -5.5, 6.8]]);      // bell roof

  // South tower (11.6 m) on the 4.4 m building at x -58..-53.5, z 12..18.
  box(-57.5, 4.4, 12, -54, 11.6, 14);
  box(-58, 4.4, 16, -56, 6.8, 18);
  box(-58, 4.4, 14, -56, 9.2, 16);
  us.push([-55.75, 14.0, 11.2]);                                             // grapple from the street or the roofs to the north

  // Stepping stone between the 4.4 m and 5.5 m roofs: zombies leap gaps of up to 1 m in height, this one is 1.1 m.
  box(-60, 0, 16, -58, 4.95, 18);

  // Sky chain: tall pillars standing in the street (from the ground, so nobody can climb them
  // from below), reached by jumping from the bell tower top (15 m). Gaps are 3.4-4 m with a
  // small drop, a sprint jump for people and a leap for zombies.
  box(-46.3, 0, -8, -43.9, 14.4, -5.6);
  box(-39.9, 0, -8, -37.5, 13.9, -5.6);
  box(-33.5, 0, -8, -31.1, 13.3, -5.6);

  // Sky network: the chain grows into a web so that the high ground is a place to play,
  // not a corridor. Every link keeps the height difference within 1 m (zombies leap the
  // same gaps people jump), gaps run from 2 to 4.1 m, and there are loops, so a fight on
  // the pillars always has somewhere to go. Zombies arrive over the pillar steps and have
  // to cross single file, which is where they can be shot off.
  box(-46.3, 0, -3.5, -43.9, 13.5, -1.1);            // D  (south of A)
  box(-39.9, 0, -3.5, -37.5, 13.4, -1.1);            // B2 (south of B)
  box(-33.5, 0, -3.5, -31.1, 12.8, -1.1);            // E  (south of C)
  box(-37.5, 12.8, -2.6, -33.5, 13.1, -2.0, 'beam'); // 0.6 m beam B2 - E (people only; zombies leap)
  box(-47, 0, 3, -44.6, 13, 5.4);                 // L1, south link
  box(-48.5, 0, 8.4, -46.1, 12.5, 10.8);             // L2
  box(-51.5, 0, 12.8, -47.6, 12.0, 15.2);            // G  (next to the south tower)

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
