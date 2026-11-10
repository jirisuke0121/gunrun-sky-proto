// A single forward route. Only the tutorial installs this geometry.
(() => {
  if (!new URLSearchParams(location.search).has('learn')) return;
  window.skyGuidedMode = window.skyPracticeMode = true;
  window.skyGuidedScene = true;
  const east = -Math.PI / 2;
  const section = (id, at, floor = at[1]) => ({ id, at, floor, yaw: east, name: id, hint: '' });
  const sections = [
    section('controls', [0, 2, 0]), section('move', [5, 2, 0]),
    section('vault', [9, 2, 0]), section('jump', [16, 2, 0]),
    section('crouch', [21, 2, 0]), section('mantle', [28, 2, 0]),
    section('wallrun', [36.8, 4.4, -1.3]), section('hook', [53, 4.4, 0]),
    section('downhill', [70.3, 5.07, 0], 0), section('ladder', [87.5, 0, 0]),
    section('zip', [93, 4, 0], 2.8), section('walljump', [115, 2.8, 0]),
    section('swing', [119, 4, 0]), section('dash', [142, 6.8, 0], 0),
    section('pausefire', [163, 0, 0]), section('stomp', [165.5, 0, 0]),
    section('flash', [169, 0, 0]), section('decoy', [171, 0, 0]),
    section('blast', [183, 0, 0]), section('jumpgun', [199, 2, 0]),
    section('shoot', [222, 8, 0]), section('exit', [220, 8, 0]), section('rescue', [243, 8, 0]),
  ];
  const course = window.skyPracticeCourse = {
    version: 'rooftop-learning-v2', sections, start: sections[0],
    bounds: { minX: -7, maxX: 270, minZ: -8, maxZ: 8 },
    trialBounds: { minX: -2.8, maxX: 6.4, minZ: -2.4, maxZ: 2.4 },
    trialGoal: [5.7, 2, 0], shootPositions: [[234,8,-1.2],[238,8,1.2]], targetPositions: [[169, 0, 0], [172, 0, .35]],
    dashPositions: [[145, 6.8, 0]], jumpPositions: [[201, 2, 0]],
    wallSpots: [], paint: [], gates: [],
  };
  window.buildSkyCanyon = ({ ne, Mh, ld, us, jn }) => {
    const add = (id, a, b, type = 'beam', lesson = '') => {
      const solid = ne(...a, ...b, type);
      solid.practice = id; solid.lesson = lesson;
      solid.canyonTier = a[1] < 0 ? 'G' : 'M';
      return solid;
    };
    const roof = (id, x1, x2, y, z1 = -3.5, z2 = 3.5, lesson = '') =>
      add(id, [x1, y - .55, z1], [x2, y, z2], 'beam', lesson);
    add('catch-street', [-8, -4.6, -9], [271, -4, 9], 'slab');
    roof('start-roof', -4, 18, 2);
    // The starting terrace is compact; the exit opens as soon as controls are confirmed.
    for (const z of [-3.5, 3.25]) add('start-parapet', [-4, 2, z], [7.5, 2.55, z + .25], 'prop');
    add('start-parapet', [-4.2, 2, -3.5], [-3.85, 2.65, 3.5], 'prop');
    add('roof-vent', [-1.5, 2, 2.65], [-.2, 2.8, 3.25], 'prop');
    course.gates.push(add('trial-gate', [7.1, 2, -3.25], [7.28, 3.1, 3.25], 'prop'));
    add('vault-wall', [12, 2, -3.3], [12.6, 2.8, 3.3], 'prop', 'vault');
    roof('gap-landing', 20.4, 30, 2, -3.5, 3.5, 'jump');
    add('low-gate', [22.5, 3.15, -3.3], [25, 5.4, 3.3], 'beam', 'crouch');
    for (const z of [-3.3, 3.1]) add('gate-post', [22.5, 2, z], [25, 3.15, z + .2], 'prop');
    add('mantle-roof', [30, 2, -3.5], [36, 4.4, 3.5], 'beam', 'mantle');
    roof('run-launch', 36, 38.5, 4.4);
    const wall = add('run-wall', [36, 2, -2.55], [48, 8, -1.85], 'mono', 'wallrun');
    wall.wr = true;
    course.wallSpots = [{ at: [42, 4.4, -1.85], normal: [0, 1] }];
    window.__skyWallRunRoutes = [{ at: [42, 4.4, -1.85], normal: [0, 1], direction: [1, 0], name: '屋上の壁走り' }];
    roof('run-exit', 46, 56, 4.4, -3.5, 3.5, 'wallrun');
    roof('hook-roof', 61, 70, 5.2, -3.5, 3.5, 'hook');
    us.push([64, 6.6, 0]);
    // Shallow collision steps retain the native downhill-slide support descriptor.
    for (let i = 0; i < 48; i++) {
      const x = 70 + i * .25, y = 5.2 * (1 - (i + 1) / 48);
      const step = add('downhill-slope', [x, y - .4, -2.4], [x + .25, y, 2.4], 'beam', 'downhill');
      step.hidden = true; // Collisions follow shallow steps; art draws one continuous slope.
      step.slideSlope = { dx: 1, dz: 0, grade: 5.2 / 12 };
    }
    roof('ladder-approach', 82, 90, 0);
    add('ladder-roof', [90, -.55, -3.5], [97, 4, 3.5], 'beam', 'ladder');
    Mh(90, 0, -1, 0, 0, 4, 1.8);
    ld([94, 6.3, 0], [110, 5.1, -3.2]);
    roof('zip-landing', 107, 116, 2.8, -4.1, 3.5, 'zip');
    // Preserve the verified wall-kick / two-bar dimensions, translated into this route.
    const offset = [135.39, -1.2, 6], point = p => p.map((v, i) => v + offset[i]);
    window.buildSwingCourse({ ne: (...args) => {
      const a = point(args.slice(0, 3)), b = point(args.slice(3, 6));
      return add('swing-structure', a, b, args[6] || 'beam', 'swing');
    }});
    const swing = window.skySwingCourse;
    swing.id = 'learn-rooftop-bars';
    swing.wall.at = point(swing.wall.at); swing.approach = point(swing.approach); swing.pad = point(swing.pad);
    swing.bars.forEach(bar => { bar.at = point(bar.at); }); swing.exit = point(swing.exit);
    swing.entryMarkers = [];
    swing.exitBounds = [132.99, 142.59, -2.2, 2.2];
    roof('dash-roof', 140, 153, 6.8);
    roof('escape-roof', 153, 194, 0, -4.1, 4.1);
    const barrel = { id: 'learn-blast', x: 188, y: 0, z: 0, land: [198, 2, 0] };
    barrel.block = add('blast-body', [187.64, 0, -.36], [188.36, 1.12, .36], 'prop', 'blast'); barrel.block.shape = 'barrel';
    barrel.cap = add('blast-cap', [187.3, 1.02, -.7], [188.7, 1.12, .7], 'prop', 'blast');
    barrel.step = add('blast-step', [186.52, 0, -.65], [187.28, .55, .65], 'prop', 'blast');
    window.SKY_CANYON_BLAST_BARRELS = [barrel];
    roof('blast-landing', 194, 207, 2, -3.5, 3.5, 'blast');
    roof('jumpgun-landing', 214, 245, 8, -3.5, 3.5, 'jumpgun');
    roof('rescue-roof', 253, 268, 11, -3.5, 3.5, 'rescue');
    // Short surface marks indicate the single route, rather than a field of floating labels.
    for (const [x1, x2, y, z] of [[-1, 11, 2, 0], [13.5, 17, 2, 0], [20.7, 29, 2, 0], [31, 36, 4.4, 0], [47, 55, 4.4, 0], [62, 69, 5.2, 0], [83, 89, 0, 0], [91, 95, 4, 0], [108, 115, 2.8, -3.2], [134, 152, 6.8, 0], [155, 187, 0, 0], [195, 205, 2, 0], [215, 243, 8, 0]]) course.paint.push({ x1, x2, y, z });
  };
  const finish = window.finishSkyCanyon;
  window.finishSkyCanyon = game => { course.surfaceMaterial=game.jn.find(b=>b.practice==='start-roof').mesh.material; finish(game); document.body.dataset.mapId = course.version; };
})();
