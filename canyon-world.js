window.SKY_CANYON_MAP = {"version":"v1-design-only","source":"36s screen recording + public game repository README as of 2026-10-24","coordinate_system":{"x":"east","y":"north","z":"elevation","unit":"meter","bounds":{"x":[0,68],"y":[0,52],"z":[0,13]},"IMPORTANT":"Design XYZ is NOT Three.js XYZ: y is north in plan, z is height.","engine_transform":{"engine_x":"design_x - 34","engine_y_height":"design_z","engine_z":"design_y - 26"}},"rock_walls":{"polygon_xy":[[1,2],[7,0],[61,1],[67,6],[68,45],[62,51],[10,52],[1,46]],"height_m":13,"walkable":false},"tiers":{"G":0,"M":4,"U":8},"deck_support_interval_m":10,"paths":[{"id":"floor_perimeter","type":"ground","width_m":5.5,"waypoints_xyz_m":[[10,10,0],[58,10,0],[58,42,0],[10,42,0],[10,10,0]],"gaps":[],"allowed":["human","zombie"],"notes":""},{"id":"middle_ring","type":"mid","width_m":3.2,"waypoints_xyz_m":[[14,13,4],[54,13,4],[54,39,4],[14,39,4],[14,13,4]],"gaps":[],"allowed":["human","zombie"],"notes":""},{"id":"middle_cross","type":"mid","width_m":3.2,"waypoints_xyz_m":[[14,26,4],[34,26,4],[54,26,4]],"gaps":[],"allowed":["human","zombie"],"notes":""},{"id":"upper_north","type":"upper","width_m":2.8,"waypoints_xyz_m":[[22,39,8],[34,39,8],[46,39,8]],"gaps":[],"allowed":["human","zombie"],"notes":""},{"id":"upper_spine","type":"upper","width_m":2.8,"waypoints_xyz_m":[[34,39,8],[34,26,8],[34,14,8]],"gaps":[],"allowed":["human","zombie"],"notes":""},{"id":"west_ramp","type":"ramp","width_m":3.6,"waypoints_xyz_m":[[9,20,0],[6,32,1.6],[9,42,3.3],[14,39,4]],"gaps":[],"allowed":["human","zombie"],"notes":""},{"id":"east_ramp","type":"ramp","width_m":3.6,"waypoints_xyz_m":[[59,34,0],[62,22,1.6],[59,10,3.3],[54,13,4]],"gaps":[],"allowed":["human","zombie"],"notes":""},{"id":"west_shortcut","type":"human_shortcut","width_m":1.6,"waypoints_xyz_m":[[14,34,4],[19,31.5,4],[21.3,30.5,4],[23,30,4],[23,26,4]],"gaps":[{"between_waypoints_zero_based":[1,2],"length_m":2.51}],"allowed":["human"],"notes":"Physical gap! Do not fill it in; validate jump physics before freezing dimensions"},{"id":"east_shortcut","type":"human_shortcut","width_m":1.6,"waypoints_xyz_m":[[54,34,4],[49,31.5,4],[46.7,30.5,4],[45,30,4],[45,26,4]],"gaps":[{"between_waypoints_zero_based":[1,2],"length_m":2.51}],"allowed":["human"],"notes":"Physical gap! Do not fill it in; validate jump physics before freezing dimensions"},{"id":"south_ladder","type":"ladder","width_m":1.4,"waypoints_xyz_m":[[34,13,4],[34,14,8]],"gaps":[],"allowed":["human","zombie"],"notes":""},{"id":"west_ladder","type":"ladder","width_m":1.4,"waypoints_xyz_m":[[22,39,4],[22,39,8]],"gaps":[],"allowed":["human","zombie"],"notes":""},{"id":"east_ladder","type":"ladder","width_m":1.4,"waypoints_xyz_m":[[46,39,4],[46,39,8]],"gaps":[],"allowed":["human","zombie"],"notes":""},{"id":"left_zipline","type":"zipline","width_m":0,"waypoints_xyz_m":[[34,14,8],[14,26,4]],"gaps":[],"allowed":["human"],"notes":"one-way descent"},{"id":"right_zipline","type":"zipline","width_m":0,"waypoints_xyz_m":[[34,14,8],[54,26,4]],"gaps":[],"allowed":["human"],"notes":"one-way descent"},{"id":"human_wall_W","type":"human_shortcut","width_m":1.6,"waypoints_xyz_m":[[14,26,0],[14,26,4]],"gaps":[],"allowed":["human"],"notes":""},{"id":"human_wall_E","type":"human_shortcut","width_m":1.6,"waypoints_xyz_m":[[54,26,0],[54,26,4]],"gaps":[],"allowed":["human"],"notes":""}],"features":[{"id":"SP","label":"開始","position_xyz_m":[34,8,0],"type":"spawn"},{"id":"CROSS","label":"立体交差","position_xyz_m":[34,26,8],"type":"crossing","clearance_m":4},{"id":"G_W","label":"西・地上","position_xyz_m":[9,20,0],"type":"ramp_entrance"},{"id":"G_E","label":"東・地上","position_xyz_m":[59,34,0],"type":"ramp_entrance"},{"id":"L_W","label":"西はしご","position_xyz_m":[22,39,4],"type":"ladder"},{"id":"L_E","label":"東はしご","position_xyz_m":[46,39,4],"type":"ladder"},{"id":"L_S","label":"南はしご","position_xyz_m":[34,14,4],"type":"ladder"},{"id":"P_W","label":"西ショートカット","position_xyz_m":[20.15,31,4],"type":"jump"},{"id":"P_E","label":"東ショートカット","position_xyz_m":[47.85,31,4],"type":"jump"},{"id":"Z","label":"分岐ジップライン","position_xyz_m":[34,14,8],"type":"zipline"}],"design_intent":{"main_chase":"ground loop, two switchback ramps, mid ring, mid bridge, 3 ladders, upper spine","player_exclusive":"2 thin jump shortcuts, 2 wall kicks, 2 descending ziplines","no_camp":"upper can be reached by zombies via 3 ladders; verify AI","no_restart_on_fall":"ground landing with routes back to mid"},"verification_needed":["zombie ladder capability on this geometry","ramp gradient and width with current movement physics","measured jump/gap height thresholds","fall damage/landing recovery","path graph and navigation mesh integration","mobile FPS","map ID isolation for ghost/telemetry"],"not_measured_from_video":true};
// Whitebox geometry for the independent rock canyon course. The blueprint
// coordinates are (east, north, height), not Three.js (x, y, z).
window.buildSkyCanyon = function ({ ne, Mh, ld, us, jn, Ja }) {
  const map = window.SKY_CANYON_MAP;
  if (!map || !Array.isArray(map.paths)) throw new Error('Canyon geometry is missing');
  const at = ([east, north, height]) => [east - 34, height, north - 26];
  const add = (x0, y0, z0, x1, y1, z1, type, tier) => {
    const block = ne(x0, y0, z0, x1, y1, z1, type);
    block.canyonTier = tier;
    return block;
  };
  const deck = (a, b, width, tier) => {
    const p = at(a), q = at(b);
    const dx = q[0] - p[0], dz = q[2] - p[2];
    const len = Math.hypot(dx, dz);
    if (len < 0.01) return;
    const nx = -dz / len * width / 2, nz = dx / len * width / 2;
    const xs = [p[0] + nx, p[0] - nx, q[0] + nx, q[0] - nx];
    const zs = [p[2] + nz, p[2] - nz, q[2] + nz, q[2] - nz];
    add(Math.min(...xs), p[1] - 0.38, Math.min(...zs),
        Math.max(...xs), p[1], Math.max(...zs), 'beam', tier);
  };

  // A continuous landing floor makes falling from either bridge recoverable.
  add(-34, -0.6, -26, 34, 0, 26, 'slab', 'G');
  // Short collision blocks follow the eight-point design boundary. They are
  // intentionally plain until traversal and mobile performance are measured.
  const outline = map.rock_walls.polygon_xy;
  for (let i = 0; i < outline.length; i++) {
    const a = at([...outline[i], 0]);
    const b = at([...outline[(i + 1) % outline.length], 0]);
    const distance = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const count = Math.ceil(distance / 1.1);
    for (let k = 0; k < count; k++) {
      const t = (k + 0.5) / count;
      const x = a[0] + (b[0] - a[0]) * t;
      const z = a[2] + (b[2] - a[2]) * t;
      add(x - 0.72, 0, z - 0.72, x + 0.72, 13, z + 0.72, 'mono', 'wall');
    }
  }

  for (const path of map.paths) {
    const points = path.waypoints_xyz_m;
    if (path.type === 'ground') continue;
    if (path.type === 'ladder') {
      const p = at(points[0]);
      // The lower approach is south of each ladder, the upper exit north.
      Mh(p[0], p[2], 0, -1, p[1], points[1][2], path.width_m);
      continue;
    }
    if (path.type === 'zipline') {
      const a = at(points[0]), b = at(points[1]);
      ld([a[0], a[1] + 2.3, a[2]], [b[0], b[1] + 2.3, b[2]]);
      continue;
    }
    if (path.id.startsWith('human_wall_')) {
      const p = at(points[0]);
      add(p[0] - 0.22, 0, p[2] - 1.15,
          p[0] + 0.22, 4, p[2] + 1.15, 'mono', 'wall');
      continue;
    }
    for (let i = 0; i < points.length - 1; i++) {
      if (path.gaps.some(g => g.between_waypoints_zero_based[0] === i)) continue;
      if (path.type === 'ramp') {
        const a = at(points[i]), b = at(points[i + 1]);
        const count = Math.max(1, Math.ceil(Math.abs(b[1] - a[1]) / 0.12));
        for (let k = 0; k < count; k++) {
          const t0 = k / count, t1 = (k + 1) / count;
          const p = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0,
                     a[2] + (b[2] - a[2]) * t0];
          const q = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1,
                     a[2] + (b[2] - a[2]) * t1];
          const radius = path.width_m / 2;
          add(Math.min(p[0], q[0]) - radius, q[1] - 0.36,
              Math.min(p[2], q[2]) - radius,
              Math.max(p[0], q[0]) + radius, q[1],
              Math.max(p[2], q[2]) + radius, 'beam', 'M');
        }
      } else {
        deck(points[i], points[i + 1], path.width_m,
             path.type === 'upper' ? 'U' : 'M');
      }
    }
  }

  // The two zips share an upper terminal south of the original upper spine.
  // A short deck makes the uphill arrival walkable from the rest of the map.
  deck([34, 14, 8], [34, 20, 8], 2.4, 'U');

  // Supports are narrow enough to retain the open ground chase loop.
  for (const [east, north, top] of [
    [24, 13, 4], [44, 13, 4], [24, 39, 4], [44, 39, 4],
    [34, 26, 4], [34, 20, 8], [34, 33, 8],
  ]) {
    const [x, , z] = at([east, north, 0]);
    add(x - 0.26, 0, z - 0.26, x + 0.26, top - 0.38,
        z + 0.26, 'mono', 'support');
  }
  for (const point of [[22, 39, 9.5], [46, 39, 9.5],
                       [34, 26, 9.5], [14, 26, 5.4], [54, 26, 5.4]]) {
    us.push(at(point));
  }
  // Ground-level escape tools beside the west and east middle decks.
  // Keep their solid blocks in the initial spatial index used by movement and shots.
  window.SKY_CANYON_BLAST_BARRELS = [
    { id: 'west', x: -15.2, y: 0, z: -7 },
    { id: 'east', x: 15.2, y: 0, z: -7 },
  ].map(barrel => {
    const block = ne(barrel.x - 0.36, 0, barrel.z - 0.36,
                     barrel.x + 0.36, 1.12, barrel.z + 0.36, 'prop');
    block.shape = 'barrel';
    block.blastBarrel = barrel.id;
    return { ...barrel, block };
  });
  window.SKY_CANYON_MAP.world = { solids: jn.length, visual: Ja.length };
};

window.finishSkyCanyon = function (game) {
  const mats = {
    G: new game.Geom.Standard({ color: 0x72a67b, roughness: 0.95 }),
    M: new game.Geom.Standard({ color: 0xe8bd68, roughness: 0.9 }),
    U: new game.Geom.Standard({ color: 0x76a9df, roughness: 0.88 }),
    wall: new game.Geom.Standard({ color: 0xa69485, roughness: 1 }),
    support: new game.Geom.Standard({ color: 0xaaa9a5, roughness: 0.95 }),
  };
  for (const block of game.jn) {
    const mat = mats[block.canyonTier];
    if (mat && block.mesh) block.mesh.traverse(o => { if (o.isMesh) o.material = mat; });
  }
  document.body.dataset.mapId = 'rock_canyon_v1';
  const missions = document.querySelector('#ovStart .missions');
  if (missions) missions.hidden = true;
};
