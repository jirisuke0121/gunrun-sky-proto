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
// Colours (2026-10-25m): everything this file builds is tinted so that places can be read at a glance.
// Steel blue = catwalks, decks, the ring; orange = stairs; rust = the warehouse hall;
// green / blue / red containers and yellow crates = the piles. The page's render loop asks
// window.skyTint(colour, baseMaterial) for the material of any collision box that has .tint.
const SKY = { steel: 0x8ea4bd, plank: 0x5d6b7a, stair: 0xe39a4a, hall: 0xb5604a, hallTop: 0x8f4a3a,
              green: 0x5f9c6c, blue: 0x5b88c2, red: 0xc2624e, crate: 0xe3b84a, beam: 0xf0c53c };
const skyMats = {};
window.skyTint = function (hex, base) {
  const k = hex + ':' + (base && base.uuid);
  if (!skyMats[k]) { const m = base.clone(); m.color.setHex(hex); skyMats[k] = m; }
  return skyMats[k];
};

window.buildSkyTowers = function ({ ne, Mh, ld, us, mo, jn }) {
  const box = (x0, y0, z0, x1, y1, z1, type = 'slab', tint) => {
    const b = ne(x0, y0, z0, x1, y1, z1, type);
    if (tint == null && type === 'beam') tint = SKY.steel;
    if (tint != null) b.tint = tint;
    return b;
  };
  const clearProps = (x0, z0, x1, z1) => {
    for (let i = jn.length - 1; i >= 0; i--) {
      const b = jn[i];
      if (b.type === 'prop' && !b.tint && b.maxX > x0 && b.minX < x1 && b.maxZ > z0 && b.minZ < z1) jn.splice(i, 1);
    }
  };

  // Keep both storeys walkable at standing height. These cross-lane beams
  // used to leave only 1-1.3m below them, which looked like solid dead ends
  // from a third-person camera and stopped slow walking before auto-slide.
  // Lift only their undersides; preserve the walls, floors and stair landings.
  for (const b of jn) {
    if (b.type !== 'beam') continue;
    const westEast = (b.minX === -13 && b.maxX === -11 || b.minX === 11 && b.maxX === 13) && b.minZ >= -11 && b.maxZ <= 11;
    const northSouth = (b.minZ === -13 && b.maxZ === -11 || b.minZ === 11 && b.maxZ === 13) && b.minX >= -11 && b.maxX <= 11;
    if (!(westEast || northSouth)) continue;
    if (b.minY >= 1 && b.minY <= 1.3 && b.maxY <= 3.6) b.minY = 2.5;
    else if (b.minY === 5.3 && b.maxY === 7.6) b.minY = 6.5;
  }

  // Central building: break the two long ground-floor lanes into escape loops.
  // Cut collision and rendered geometry together, before the spatial/nav indices
  // are built. The upper wall/floor and the existing door openings stay intact.
  const corridorExit = (id, x0, x1, z0, z1, outsideX) => {
    const index = jn.findIndex(b => b.type === 'mono' && b.minX === x0 && b.maxX === x1 && b.minY === 0 && b.minZ <= z0 && b.maxZ >= z1);
    if (index < 0) throw new Error('Missing corridor wall: ' + id);
    const wall = jn.splice(index, 1)[0];
    box(x0, 0, wall.minZ, x1, wall.maxY, z0, 'mono');
    box(x0, 0, z1, x1, wall.maxY, wall.maxZ, 'mono');
    const lintel = box(x0, 2.5, z0, x1, wall.maxY, z1, 'mono');
    lintel.indoorExit = id;
    // A flush landing joins the exterior street; neither hole ends over a void.
    box(Math.min(outsideX, x0), -.4, z0 - .6, Math.max(outsideX, x1), 0, z1 + .6, 'slab', SKY.steel);
    const face = outsideX < x0 ? x1 : x0;
    box(face - .055, 0, z0, face + .055, 2.5, z0 + .13, 'beam', SKY.green);
    box(face - .055, 0, z1 - .13, face + .055, 2.5, z1, 'beam', SKY.green);
    box(face - .055, 2.37, z0, face + .055, 2.5, z1, 'beam', SKY.green);
    return { id, width: z1 - z0 - .26, height: 2.37, from: [outsideX < x0 ? x1 + 1 : x0 - 1, 0, (z0 + z1) / 2], to: [outsideX + (outsideX < x0 ? .6 : -.6), 0, (z0 + z1) / 2] };
  };
  window.skyCorridorExits = [
    corridorExit('corridor-west', -14, -13, 7, 9.6, -17),
    corridorExit('corridor-east', 13, 14, -5, -2.4, 17),
  ];
  // The east landing sits beside a tall block. Continue south to the existing
  // east entrance, so turning out of the hole leads to a loop, not a dead end.
  box(14, -.4, -5.6, 17, 0, 1.5, 'slab', SKY.steel);
  box(16.85, 0, -5.6, 17, .85, -1.5, 'beam', SKY.plank);

  // The north-east ground lane ends against the 4m-high end of the stairs.
  // Above it the opposite lane ends at the stairwell. Give each storey a
  // continuous bypass outside the north facade; keep the stairs and both
  // north ladders in their original positions and leave their shafts clear.
  const northOpening = (id, x0, x1, floor) => {
    const walls = jn.filter(b => b.type === 'mono' && b.minZ === -14 && b.maxZ === -13 &&
      b.minX < x1 && b.maxX > x0 && b.minY < floor + 2.5 && b.maxY > floor);
    if (!walls.length) throw new Error('Missing north facade: ' + id);
    for (const b of walls) {
      jn.splice(jn.indexOf(b), 1);
      const left = Math.max(x0, b.minX), right = Math.min(x1, b.maxX);
      const part = (a, y0, c, y1) => {
        if (c - a > .001 && y1 - y0 > .001) box(a, y0, -14, c, y1, -13, 'mono');
      };
      part(b.minX, b.minY, left, b.maxY);
      part(right, b.minY, b.maxX, b.maxY);
      part(left, b.minY, right, floor);
      part(left, floor + 2.5, right, b.maxY);
    }
    for (const x of [x0, x1 - .13]) box(x, floor, -13.055, x + .13, floor + 2.5, -12.945, 'beam', SKY.green);
    box(x0, floor + 2.37, -13.055, x1, floor + 2.5, -12.945, 'beam', SKY.green);
    if (floor) box(x0, floor - .4, -14, x1, floor, -13, 'slab', SKY.steel);
  };
  northOpening('north-east-ground', 10.6, 13, 0);
  northOpening('north-west-upper', .5, 2, 4);
  northOpening('north-east-upper', 10.6, 13, 4);
  box(-1.5, -.4, -17, 14, 0, -14, 'slab', SKY.steel);
  // Starting the upper deck at x=.5 leaves the roof ladder at x=0 clear.
  // The inner ladder at (2,-12) is south of the two short doorway bridges.
  box(.5, 3.6, -17, 14, 4, -14, 'slab', SKY.steel);
  const rail = (x0, z0, x1, z1, floor) => box(x0, floor, z0, x1, floor + .95, z1, 'beam', SKY.plank);
  rail(-1.5, -17, -.9, -16.85, 0);
  rail(.9, -17, 14, -16.85, 0); // open at x=0 onto the existing north street
  rail(-1.5, -17, -1.35, -14, 0);
  rail(13.85, -17, 14, -14, 0);
  rail(.5, -17, 14, -16.85, 4);
  rail(.5, -17, .65, -14, 4);
  rail(13.85, -17, 14, -14, 4);
  window.skyNorthEscapeRoutes = [
    { id: 'north-east-ground', route: [[12, 0, -10], [12, 0, -15.5], [0, 0, -15.5], [0, 0, -19]] },
    { id: 'north-upper-bypass', route: [[1.3, 4, -12], [1.3, 4, -15.5], [12, 4, -15.5], [12, 4, -12]] },
  ];

  // Each tower stands on the back half of its roof, with a staircase beside it: six steps
  // (1.25 m rises, 1.08 m treads, 1.5 m wide, a 2.5 m landing at the top), so anything going up, people or zombies,
  // goes up in single file. The plank, the grapple and the sky chain are the fast ways.
  // The steps are 1 m treads so the zombie path grid (1 m) has a node on every step.
  const stairs = (x0, x1, base, wide) => {
    for (let i = 0; i < 6; i++) box(x0, base, -5.5 - 1.083 * (i + 1), i === 5 ? x1 : x0 + wide, base + 1.25 * (i + 1), -5.5 - 1.083 * i, 'slab', SKY.stair);
  };
  // Small crate stacks on the roofs: cover, and 1.2 m / 2.4 m hops.
  const crates = (list) => list.forEach(([x0, z0, x1, z1, h]) => box(x0, 0, z0, x1, h, z1, 'prop', SKY.crate));

  // West tower (14.2 m) on the 4.2 m building at x -61..-55, z -12..-5.5.
  box(-58.5, 4.2, -12, -55.5, 14.2, -7.5);
  stairs(-61, -58.5, 4.2, 1.5);                                                  // up to 11.7 m, then a 2.5 m mantle onto the tower

  // Plank across the alley to the bell tower (3.5 m gap, 0.6 m wide, ground visible below).
  box(-55.5, 13.82, -9.8, -52, 14.2, -9.2, 'beam', SKY.plank);

  // Bell tower (14.2 m) on the 4.4 m building at x -52..-47, z -12..-5.5.
  box(-52, 4.4, -12, -49.5, 14.2, -7.5);
  stairs(-49.5, -47, 4.4, 1.5);                                                  // up to 11.9 m

  // West ring (11.7 m): a loop of 1.5 m decks leaving the top landing of the west stairs,
  // around an open 6 x 7 m well, with an island pillar in the middle (2-2.5 m gaps from every
  // side, 0.9 m above the ring). A place to fight on a lane that zombies have to walk round.
  const ring = (x0, x1, z0, z1) => box(x0, 11.3, z0, x1, 11.7, z1, 'beam');
  ring(-70, -61, -12, -10.5);       // north side, from the stairs landing
  ring(-70, -68.5, -10.5, -2);      // west side
  ring(-70, -61, -3.5, -2);         // south side
  ring(-62.5, -61, -10.5, -3.5);    // east side
  box(-66.5, 0, -8, -64.5, 12.6, -6);   // island pillar

  crates([[-57.5, -7.5, -55.5, -5.5, 5.4], [-57, -7, -55.5, -5.5, 6.6],    // west roof
          [-52, -7.5, -50, -5.5, 5.6], [-51.5, -7, -50, -5.5, 6.8]]);      // bell roof

  // South tower (11.6 m) on the 4.4 m building at x -58..-53.5, z 12..18.
  box(-57.5, 4.4, 12, -54, 11.6, 14);
  box(-58, 4.4, 16, -56, 6.8, 18);
  box(-58, 4.4, 14, -56, 9.2, 16);
  us.push([-55.75, 14.0, 11.2]);                                             // grapple from the street or the roofs to the north

  // Two return hooks (2026-10-28), appended so the existing hook indices stay the same.
  // Chosen from the old-town route graph: each cuts a 65-75 m walk to about 17-19 m, and
  // neither can be used from the street, so nothing here is a way up from below.
  //  - North passage (x 18-26) -> the upper sky beam. The anchor is 2 m north of the beam
  //    so the pull ends over the beam, not over the roof of block 222 (zombies cannot reach that roof).
  //    Zipline 3 only goes down, so this closes the loop: ride down, hook back up.
  //  - Ring roof west edge / block 67 roof -> the south catwalk of the west sky corridor.
  //    Reachable only from roof height; from the ground the anchor is out of reach.
  us.push([29, 13.0, -10.0]);
  us.push([-31.5, 13.0, 1.2]);

  // Stepping stone between the 4.4 m and 5.5 m roofs: zombies leap gaps of up to 1 m in height, this one is 1.1 m.
  box(-60, 0, 16, -58, 4.95, 18);

  // Sky chain: tall pillars standing in the street (from the ground, so nobody can climb them
  // from below), reached by jumping from the bell tower top (15 m). Gaps are 3.4-4 m with a
  // small drop, a sprint jump for people and a leap for zombies.
  box(-46.3, 0, -8, -43.9, 14.4, -5.6);
  box(-39.9, 0, -8, -37.5, 13.9, -5.6);
  box(-33.5, 0, -8, -31.1, 13.3, -5.6);

  // Mid catwalk (11.9 m): leaves the top landing of the bell tower stairs and runs 16 m east,
  // 1.5 m wide, north of the chain. Zombies walk it single file in full view of the pillars.
  // Short stubs lead from it to the north face of each pillar (2.5 / 2.0 / 1.4 m mantles).
  box(-47, 11.5, -12, -29.6, 11.9, -10.5, 'beam');
  box(-46.3, 11.5, -10.5, -43.9, 11.9, -8, 'beam');   // stub to A
  box(-39.9, 11.5, -10.5, -37.5, 11.9, -8, 'beam');   // stub to B
  box(-33.5, 11.5, -10.5, -31.1, 11.9, -8, 'beam');   // stub to C

  // East connector and south catwalk (11.9 m): the north catwalk turns south at its east end
  // and runs back west along the south face of the pillars D, B2 and E, with a stub to each
  // (1.6 / 1.5 / 0.9 m mantles). It ends 1 m short of L1, which is a leap on to the southern pillars.
  box(-31.1, 11.5, -12, -29.6, 11.9, 2, 'beam');
  box(-47, 11.5, 0.5, -31.1, 11.9, 2, 'beam');
  box(-46.3, 11.5, -1.1, -43.9, 11.9, 0.5, 'beam');   // stub to D
  box(-39.9, 11.5, -1.1, -37.5, 11.9, 0.5, 'beam');   // stub to B2
  box(-33.5, 11.5, -1.1, -31.1, 11.9, 0.5, 'beam');   // stub to E

  // Mid ledges: 1.5 m decks hung on the side faces of the pillars, 2.4-2.5 m below their tops.
  // Between two pillars they leave a 1 m gap, so the 4 m jump across the top can be split in
  // two lower hops (a different route, not an easier one: you give up height and have to
  // mantle back up). Ledges are on both rows.
  const deck = (x0, x1, z0, z1, top) => box(x0, top - 0.4, z0, x1, top, z1, 'beam');
  deck(-43.9, -42.4, -7.8, -5.8, 12.0);  deck(-41.4, -39.9, -7.8, -5.8, 11.5);   // A | B
  deck(-37.5, -36.0, -7.8, -5.8, 11.4);  deck(-35.0, -33.5, -7.8, -5.8, 10.9);   // B | C
  deck(-43.9, -42.4, -3.3, -1.3, 11.2);  deck(-41.4, -39.9, -3.3, -1.3, 11.0);   // D | B2
  deck(-37.5, -36.0, -3.3, -1.3, 10.9);  deck(-35.0, -33.5, -3.3, -1.3, 10.4);   // B2 | E

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

  // ---- Warehouse hall (2026-10-25m): a real corridor with walls and a ceiling. ----
  // 14.5 m long, 2 m wide inside, 2.9 m to the ceiling. Staggered side exits break
  // up the lane so a blocked mouth still leaves a way to the surrounding streets.
  // The 4.6 m walls retain the roof route, reached over the pile at its north-west corner
  // or from the south roofs. Ledges on the roof give 1.4-1.6 m hops.
  clearProps(-66, 7, -49, 13.5);
  const sideExit = (id, z0, z1, left, right) => {
    box(-64.5, 0, z0, left, 4.6, z1, 'slab', SKY.hall);
    box(right, 0, z0, -50, 4.6, z1, 'slab', SKY.hall);
    const lintel = box(left, 2.5, z0, right, 4.6, z1, 'slab', SKY.stair);
    lintel.indoorExit = id;
  };
  sideExit('warehouse-north', 7.5, 9, -58.5, -56.1);          // 2.4 m wide, to the lane behind the low house
  sideExit('warehouse-south', 11, 13, -53.5, -51.5);         // 2 m wide, between the south buildings to the outer street
  // The original ground ends at z=18. Complete a walkable loop around the
  // neighbouring building instead of leading the side exit into empty space.
  box(-54.5, -0.4, 18, -45.8, 0, 20, 'slab', SKY.steel);
  box(-54.5, 0, 19.85, -45.8, 0.9, 20, 'beam', SKY.plank);
  box(-54.5, 0, 18, -54.35, 0.9, 20, 'beam', SKY.plank);
  window.skyIndoorExits = [
    { id: 'warehouse-north', width: 2.4, height: 2.5, from: [-57.3, 0, 10], to: [-57.3, 0, 6.7], route: [[-57.3, 0, 6.7], [-49.2, 0, 6.7]] },
    { id: 'warehouse-south', width: 2, height: 2.5, from: [-52.5, 0, 10], to: [-52.5, 0, 19], route: [[-52.5, 0, 19], [-46.5, 0, 19], [-46.5, 0, 11.5]] },
  ];
  box(-64.5, 2.9, 9, -50, 4.6, 11, 'slab', SKY.hallTop);      // ceiling
  box(-63.5, 4.6, 7.5, -60, 6.0, 9.5, 'slab', SKY.blue);      // roof ledges
  box(-57, 4.6, 7.5, -53, 6.2, 9, 'slab', SKY.red);
  box(-52.5, 4.6, 11, -50.5, 5.8, 13, 'slab', SKY.green);
  // Pile at the north-west corner of the hall: 1.3 / 2.7 / 4.0 m steps up to the roof (4.6 m).
  box(-64.2, 0, 5.0, -62.4, 1.3, 7.5, 'slab', SKY.crate);
  box(-62.4, 0, 6.0, -60.7, 2.7, 7.5, 'slab', SKY.green);
  box(-60.7, 0, 6.0, -59.0, 4.0, 7.5, 'slab', SKY.red);

  // ---- Container piles in the open ground (2026-10-25m): the 1-5 m band between street and roof. ----
  // Every step is at least 1.5 m wide so zombies stand on them too. Heights differ from step to
  // step (1.3 / 1.4 / 2.6 / 2.7 / 2.8 / 4.2 / 4.4), so there is no single rhythm.
  // Centre pile, next to the start: a 4.4 m top with three ways on (west crate, east crates, south crate).
  clearProps(-42, 5, -32, 12);
  box(-40, 0, 6.5, -36.6, 2.6, 9.6, 'slab', SKY.green);
  box(-39, 2.6, 7.4, -37, 4.4, 9, 'slab', SKY.blue);
  box(-41.4, 0, 8, -40, 1.3, 9.6, 'slab', SKY.crate);
  box(-36.6, 0, 6.5, -34.8, 1.3, 8.3, 'slab', SKY.crate);
  box(-38, 0, 9.6, -36.4, 1.3, 11.2, 'slab', SKY.crate);
  box(-34, 0, 9, -32.4, 1.3, 10.6, 'slab', SKY.crate);        // lone hop, 1.4 m from the east steps
  // East steps, along the south face of the 5.5 m east block: 1.4 / 2.8 / 4.2 m.
  // (The slope north of here is the original lean-to roof; piles stay clear of it.)
  box(-34, 0, 5, -32.4, 1.4, 6.6, 'slab', SKY.crate);
  box(-32.4, 0, 5, -30.8, 2.8, 6.6, 'slab', SKY.green);
  box(-30.8, 0, 5, -29.2, 4.2, 6.6, 'slab', SKY.red);
  // Bell tower south face: 1.4 / 2.8 / 4.0 m up to the 4.4 m roof.
  box(-52, 0, -5.5, -50.4, 1.4, -3.9, 'slab', SKY.crate);
  box(-50.4, 0, -5.5, -48.8, 2.8, -4, 'slab', SKY.green);
  box(-48.8, 0, -5.5, -47.2, 4.0, -4.2, 'slab', SKY.red);

  // ---- Beam road (2026-10-25o): the escape route made of narrow footholds. ----
  // 0.6 m beams at 4.4 m over the plaza, joined by two 1.6 m pads and the top of the centre pile.
  // People run them at full speed (a slip drops you 4.4 m into the plaza, no damage, but you lose
  // the lead). Zombies can walk them too (each beam is centred on a grid line, so the path graph
  // has a node every metre), but at 35% speed and without pushing each other, so a chaser falls
  // behind and a crowd queues up on the beam in single file. Beams: west from the centre pile to
  // pad J1, east to pad J2 (which touches the east steps), a branch north from the middle of the
  // west beam (a T-turn on 0.6 m, ending 1.4 m above the lean-to roof), and south from J1 to the
  // roof of the south building.
  const beams = [];
  window.skyBeams = beams;
  const beam = (x0, z0, x1, z1) => { const b = box(x0, 4.0, z0, x1, 4.4, z1, 'beam', SKY.beam); beams.push(b); return b; };
  box(-45.8, 0, 7.2, -44.2, 4.4, 8.8, 'slab', SKY.blue);       // pad J1
  box(-31.8, 0, 6.6, -30.2, 4.4, 8.4, 'slab', SKY.blue);       // pad J2 (touches the east steps)
  beam(-44.2, 7.7, -39, 8.3);       // west of the centre pile, along z = 8
  beam(-37, 7.7, -31.8, 8.3);       // east of the centre pile, along z = 8
  beam(-45.3, 8.8, -44.7, 13.5);    // south from J1, along x = -45, to the south building roof
  beam(-42.3, 4.6, -41.7, 7.7);     // branch north from the west beam, along x = -42

  // ---- Blast barrels (2026-10-25n): escape tools. ----
  // The canyon's one-use blast barrel, moved here (blast-barrels.js does the work). Shoot one
  // and everything within 5 m is thrown back; if you stand on the barrel (a 0.55 m step and a
  // wide cap make that easy) the blast throws you about 5 m up, onto the roof beside it, and the
  // zombies below lose you. Each stands 1.5-3 m from a wall of 4.4-6.5 m, on open ground.
  window.SKY_CANYON_BLAST_BARRELS = [
    { id: 'start', x: -48.0, z: 7.2 },     // beside the start, hut roof 6.2 m (north)
    { id: 'plaza', x: -43.5, z: 11.5 },    // south building roof 4.4 m (south)
    { id: 'street', x: -59.5, z: -3.0 },   // west tower base 4.2 m (north)
    { id: 'alley', x: -64.7, z: 15.5 },    // west building roof 6.5 m (west)
    { id: 'east', x: -26.5, z: 7.5 },      // east block roof 6.4 m (north)
  ].map(b => {
    const block = ne(b.x - 0.36, 0, b.z - 0.36, b.x + 0.36, 1.12, b.z + 0.36, 'prop');
    block.shape = 'barrel';
    block.blastBarrel = b.id;
    const cap = ne(b.x - 0.7, 1.02, b.z - 0.7, b.x + 0.7, 1.12, b.z + 0.7, 'prop');
    cap.blastBarrel = b.id;
    const step = ne(b.x - 0.65, 0, b.z - 1.48, b.x + 0.65, 0.55, b.z - 0.72, 'prop');
    return { ...b, y: 0, block, cap, step };
  });

  // Equal footing (2026-10-25). The player must not be able to climb from below
  // anywhere on the parkour route, so the west district has no ladders at all.
  // Zombies would be stuck on the ground, so inside this district they jump gaps and
  // drop down exactly as the player does (see skyLeapOK). They already mantle up to
  // 3.5 m, like the player.
  for (let i = mo.length - 1; i >= 0; i--) {
    const m = mo[i];
    if (m.x < -30 && m.x > -72 && m.z > -14 && m.z < 20) mo.splice(i, 1);
  }
  window.buildOldTownSwingCourse?.({ ne });
};

// Zombies may use jump and drop edges only inside the west district (x -72..-30).
window.skyLeapOK = function (edge) {
  const g = window.__game, N = g && g.NAV;
  if (!N) return false;
  const a = N.nodes[edge.from];
  return a.x < -30 && a.x > -72 && a.z > -14 && a.z < 20;
};

// Pounce (2026-10-25m). In the west district about three zombies in ten crouch for 0.35 s
// when you are 3.2-6.5 m away on the same level with a clear, flat run-up, then lunge to where
// you were standing (not where you are going). Sidestep, jump, or shoot them in the air: a hit
// cancels the lunge like any other hit. Each zombie does it once every 7-11 s.
window.skyPounce = function (z, u, d, p, x, H) {
  if (z.stalker || z.dead || z.stun > 0 || z.spawnT > 0 || !z.onGround) return false;
  if (z.pz === undefined) { z.pz = Math.random() < 0.3; z.pzNext = H.ce; }
  if (!z.pz || H.ce < z.pzNext) return false;
  const px = z.pos.x, pz = z.pos.z;
  if (!(px < -30 && px > -72 && pz > -14 && pz < 20)) return false;
  if (x < 3.2 || x > 6.5 || Math.abs(p) > 0.6) return false;
  const dx = u / x, dz = d / x, L = x - 1.1, y = z.pos.y;
  for (let k = 1; k <= 6; k++) {
    const sx = px + dx * L * k / 6, sz = pz + dz * L * k / 6;
    // oe() is true when the capsule is free, so: head-height must be free, and just below the feet must not be
    if (!H.oe(sx, y + 0.05, sz, 0.3, 1.8) || H.oe(sx, y - 0.4, sz, 0.3, 0.3)) { z.pzNext = H.ce + 1; return false; }
  }
  z.pzNext = H.ce + 7 + Math.random() * 4;
  z.act = { kind: 'leap', sx: px, sy: y, sz: pz, tx: px + dx * L, ty: y + 0.002, tz: pz + dz * L,
            t: 0, dur: 0.28, arc: 0.7, wait: 0.35 };
  z.vel.set(0, 0, 0); z.atkT = 0; z.edge = -1;
  z.yaw = Math.atan2(-dx, -dz);
  H.ur(px, y + 0.05, pz, 8, 'dust', 1.4, 0.45);
  H.Tt.thud(0.8, H.wn(px, pz));
  return true;
};

// Zombies on a beam: slower (35%, applied in the page) and no pushing each other off it.
window.skyOnBeam = function (z) {
  const bs = window.skyBeams;
  if (!bs) return false;
  const x = z.pos.x, p = z.pos.z, y = z.pos.y;
  for (let i = 0; i < bs.length; i++) {
    const b = bs[i];
    if (x > b.minX - 0.1 && x < b.maxX + 0.1 && p > b.minZ - 0.1 && p < b.maxZ + 0.1 && Math.abs(y - b.maxY) < 0.3) return true;
  }
  return false;
};
