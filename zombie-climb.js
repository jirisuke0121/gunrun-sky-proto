// Recovery after a stalled chase, at any elevation. Surfaces never enter the shared path graph.
export function createZombieClimb(game, runtime, flashbang) {
  const { ri, c: player, z: run, Jt: zombies, jn: solids, Geom: { Vector3 } } = game;
  const config = Object.freeze({ wait: 4, speed: 0.8, retry: 1.5, scanGap: 0.12, scanMs: 2, candidatesPerFrame: 12 });
  const stats = { scans: 0, started: 0, finished: 0, interrupted: 0, candidates: 0, maxScanMs: 0 };
  const tracks = new WeakMap(), rigs = new WeakMap();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = v => { v = clamp(v, 0, 1); return v * v * (3 - 2 * v); };
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const point = (x, y, z) => ({ x, y, z });
  const distanceToTop = (p, b) => Math.hypot(p.x - clamp(p.x, b.minX, b.maxX), p.z - clamp(p.z, b.minZ, b.maxZ));
  const faces = [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }];
  const overlap = (a, b) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
  const columns = new Map();
  // Index solid faces once, including low ledges and long walls. A real landing
  // and a supported approach decide usability, rather than a height threshold.
  // Boundary rocks, moving doors and props are not chase-recovery surfaces.
  for (const b of solids) {
    if (b.canyonTier === 'wall' || !['slab', 'mono', 'beam'].includes(b.type) || b.maxY <= b.minY) continue;
    const caps = [...new Set(runtime.near(b.minX - 0.01, b.minZ - 0.01, b.maxX + 0.01, b.maxZ + 0.01))]
      .filter(cap => !cap.off && cap.type !== 'mono' && cap.type !== 'door' && cap.type !== 'prop' &&
        cap.maxY >= b.maxY - 0.05 && cap.minY <= b.maxY + 0.05 && overlap(b, cap));
    if (!caps.includes(b)) caps.push(b);
    if (caps.length) columns.set(b, caps);
  }
  let nextScan = 0, scan = null, pumpedAt = -Infinity;
  let targetTime = -Infinity, targetTop = null;

  function lineInterval(bounds, strict = true) {
    let enter = 0, leave = 1;
    for (const [origin, end, lo, hi] of bounds) {
      const delta = end - origin;
      if (Math.abs(delta) < 1e-9) {
        if (strict ? origin <= lo || origin >= hi : origin < lo || origin > hi) return null;
      } else {
        const t0 = (lo - origin) / delta, t1 = (hi - origin) / delta;
        enter = Math.max(enter, Math.min(t0, t1));
        leave = Math.min(leave, Math.max(t0, t1));
        if (strict ? enter >= leave : enter > leave) return null;
      }
    }
    return [enter, leave];
  }
  function clearLine(enemy, a, b, grounded = false) {
    // Exact body sweeps and floor-coverage intervals, instead of samples every
    // 18cm. Cost depends on nearby geometry, not on the height of the wall.
    const r = enemy.r, h = enemy.h, supports = [];
    for (const box of runtime.near(Math.min(a.x, b.x) - r, Math.min(a.z, b.z) - r,
        Math.max(a.x, b.x) + r, Math.max(a.z, b.z) + r)) {
      if (box.off) continue;
      if (lineInterval([
        [a.x, b.x, box.minX - r, box.maxX + r],
        [a.y + 0.012, b.y + 0.012, box.minY - h, box.maxY],
        [a.z, b.z, box.minZ - r, box.maxZ + r],
      ])) return false;
      if (grounded) {
        const interval = lineInterval([
          [a.x, b.x, box.minX, box.maxX], [a.z, b.z, box.minZ, box.maxZ],
          [a.y, b.y, box.maxY - 0.1, box.maxY + 0.35],
        ], false);
        if (interval) supports.push(interval);
      }
    }
    if (grounded) {
      supports.sort((a, b) => a[0] - b[0]);
      let covered = 0;
      for (const [start, end] of supports) {
        if (start > covered + 1e-7) return false;
        covered = Math.max(covered, end);
        if (covered >= 1) return true;
      }
      return false;
    }
    return true;
  }
  function facePoint(b, n, enemy, inset = false, pad = enemy.r + 0.09) {
    const along = Math.min(pad, (n.x ? b.maxZ - b.minZ : b.maxX - b.minX) / 2);
    return point(n.x ? (n.x > 0 ? b.maxX : b.minX) + n.x * pad * (inset ? -1 : 1) :
      clamp(enemy.pos.x, b.minX + along, b.maxX - along), enemy.pos.y,
      n.z ? (n.z > 0 ? b.maxZ : b.minZ) + n.z * pad * (inset ? -1 : 1) :
      clamp(enemy.pos.z, b.minZ + along, b.maxZ - along));
  }
  function landingNode(p) {
    const node = runtime.nodeAt(p.x, p.y + 0.1, p.z);
    return node >= 0 && Math.abs(runtime.NAV.nodes[node].y - p.y) < 0.35 && Number.isFinite(runtime.FIELD[node]) ? node : -1;
  }
  function onTop(body, cap) {
    return !cap.off && body.onGround && Math.abs(body.pos.y - cap.maxY) < 0.12 &&
      body.pos.x >= cap.minX && body.pos.x <= cap.maxX && body.pos.z >= cap.minZ && body.pos.z <= cap.maxZ;
  }
  function topPath(enemy, cap, from) {
    if (!player.onGround || Math.abs(player.pos.y - cap.maxY) > 0.12) return false;
    const goal = point(player.pos.x, cap.maxY + 0.003, player.pos.z);
    return clearLine(enemy, from, goal, true);
  }
  function wallTarget() {
    const now = game.ceRef();
    if (now === targetTime) return targetTop;
    targetTime = now; targetTop = null;
    if (player.onGround && landingNode(player.pos) < 0) {
      targetTop = runtime.near(player.pos.x, player.pos.z, player.pos.x, player.pos.z)
        .find(b => columns.has(b) && onTop(player, b)) || null;
    }
    return targetTop;
  }
  function approachPoints(enemy, column, start) {
    if (clearLine(enemy, enemy.pos, start, true)) return [start];
    const pad = enemy.r + 0.09; let best = null, bestLength = Infinity;
    // A straight approach to another face can cut through the pillar. Try its
    // four outside corners locally; no path-field rebuild or global search.
    for (const x of [column.minX - pad, column.maxX + pad]) for (const z of [column.minZ - pad, column.maxZ + pad]) {
      const corner = point(x, enemy.pos.y, z), length = distance(enemy.pos, corner) + distance(corner, start);
      if (length < bestLength && clearLine(enemy, enemy.pos, corner, true) && clearLine(enemy, corner, start, true)) {
        best = [corner, start]; bestLength = length;
      }
    }
    return best;
  }
  function makeRoute(enemy, column, cap, normal, along) {
    // An enemy already pressed against the face can climb from there. Making
    // it first step backwards into the crowd can deadlock the entire queue.
    const side = normal.x || normal.z, axis = normal.x ? 'X' : 'Z';
    const gap = ((normal.x ? enemy.pos.x : enemy.pos.z) - column[(side > 0 ? 'max' : 'min') + axis]) * side;
    const pad = clamp(gap, enemy.r + 0.00005, enemy.r + 0.09);
    const start = facePoint(column, normal, enemy, false, pad), outside = facePoint(cap, normal, enemy, false, pad);
    const finish = facePoint(cap, normal, enemy, true, pad); finish.y = cap.maxY + 0.003;
    // Keep a narrow support's tangent coordinate when traversing its overhang.
    if (normal.x) outside.z = finish.z = along;
    else outside.x = finish.x = along;
    const top = cap.maxY, node = landingNode(finish);
    // A positive rise describes an ascent; there is no minimum useful climb or
    // maximum height, nor any requirement for the player to be above us.
    if (top <= enemy.pos.y + 0.02) return null;
    const standing = { r: enemy.r, h: enemy.stalker ? 2.4 : 1.8 };
    const directTop = topPath(standing, cap, finish);
    const source = runtime.nodeAt(enemy.pos.x, enemy.pos.y + 0.1, enemy.pos.z);
    const sourceCost = source >= 0 ? runtime.FIELD[source] : Infinity;
    // An isolated/decorative top must not become a new dead end. FIELD is usable
    // only when it really targets the player's current floor, not an old node.
    if (!directTop && (wallTarget() || node < 0 || runtime.FIELD[node] >= sourceCost - 0.5)) return null;
    const approach = approachPoints(enemy, column, start);
    if (!approach) return null;
    const segments = approach.map(to => ({ kind: 'approach', to, normal, surface: column }));
    const overhang = Math.hypot(outside.x - start.x, outside.z - start.z);
    if (overhang > 0.06) {
      // A support ends under a deck: climb to its underside, traverse hand over
      // hand to the lip, then climb around it. Never pass through the deck.
      const underY = cap.minY - Math.max(standing.h, 2.05) - 0.05;
      if (underY < enemy.pos.y) return null;
      segments.push({ kind: 'column', to: point(start.x, underY, start.z), normal, surface: column });
      segments.push({ kind: 'hang', to: point(outside.x, underY, outside.z), normal, surface: cap });
    }
    segments.push({ kind: 'column', to: point(outside.x, top + 0.003, outside.z), normal, surface: cap });
    segments.push({ kind: 'mantle', to: finish, normal, surface: cap });
    let from = enemy.pos, length = 0;
    for (const segment of segments) {
      if (!clearLine(segment.kind === 'approach' ? enemy : standing, from, segment.to)) return null;
      length += distance(from, segment.to); from = segment.to;
    }
    // Do not allow two bodies to occupy the same narrow climb lane.
    if (zombies.some(other => other !== enemy && other.act?.kind === 'pillar' &&
        (other.act.column === column && other.act.normal === normal ||
         other.act.cap === cap && distance(other.act.segments.at(-1).to, finish) < enemy.r + other.r + 0.15))) return null;
    return { kind: 'pillar', column, cap, normal, node, directTop, segments, index: 0,
      from: point(enemy.pos.x, enemy.pos.y, enemy.pos.z), t: 0, travel: 0, originY: enemy.pos.y,
      goal: point(player.pos.x, player.pos.y, player.pos.z),
      score: length + (directTop ? distance(finish, player.pos) : runtime.FIELD[node]) * 0.4, segmentTravel: 0 };
  }
  function* findRoute(enemy) {
    stats.scans++;
    // A stalled pursuer may walk to a farther face. Approach paths still need
    // continuous floor and clearance: this never bridges an empty gap in air.
    const candidates = [...columns.keys()].filter(column => !column.off &&
      column.minY <= enemy.pos.y + (enemy.stalker ? 2.4 : 1.8) && column.maxY > enemy.pos.y + 0.02)
      .sort((a, b) => distanceToTop(enemy.pos, a) - distanceToTop(enemy.pos, b));
    for (const column of candidates) {
      const caps = columns.get(column);
      for (const cap of caps) for (const normal of faces) {
        if (cap.off) continue;
        const pad = enemy.r + 0.09, axis = normal.x ? 'Z' : 'X', start = facePoint(column, normal, enemy);
        if (cap['max' + axis] - cap['min' + axis] < pad * 2) continue;
        const base = normal.x ? start.z : start.x;
        const exits = [...new Set([base, normal.x ? player.pos.z : player.pos.x,
          (cap['min' + axis] + cap['max' + axis]) / 2, ...caps.flatMap(other => [other['min' + axis] - pad, other['max' + axis] + pad])]
          .map(v => clamp(v, cap['min' + axis] + pad, cap['max' + axis] - pad)))]
          .sort((a, b) => Math.abs(a - base) - Math.abs(b - base));
        for (const along of exits) {
          stats.candidates++;
          const route = makeRoute(enemy, column, cap, normal, along);
          if (route) return route;
          yield;
        }
      }
    }
    return null;
  }
  function pursuing(enemy) {
    return runtime.mode === 'play' && !run.over && !run.mission && !enemy.dead && !enemy.remove &&
      !enemy.rise && !enemy.fall && !enemy.guard && !enemy.lost && enemy.spawnT <= 0 &&
      enemy.stun <= 0 && !flashbang.blinded(enemy) && run.t - enemy.lastHitT > 1;
  }
  function eligible(enemy) { return pursuing(enemy) && !enemy.act && enemy.onGround && player.onGround; }
  function startRoute(enemy, route) {
    // The body can have moved while the incremental search was running.
    if (!eligible(enemy) || !clearLine(enemy, enemy.pos, route.segments[0].to, true)) return;
    route.from = point(enemy.pos.x, enemy.pos.y, enemy.pos.z);
    enemy.act = route; enemy.vel.set(0, 0, 0); enemy.atkT = 0; enemy.reach = enemy.bash = false;
    const track = tracks.get(enemy); track.wait = 0; track.active = route; track.landing = null;
    stats.started++;
  }
  function pumpScan() {
    const now = game.ceRef();
    if (!scan || pumpedAt === now) return;
    pumpedAt = now;
    const { enemy, goal } = scan;
    if (!pursuing(enemy) || Math.hypot(player.pos.x - goal.x, player.pos.z - goal.z) > 2.5 ||
        (player.onGround && Math.abs(player.pos.y - goal.y) > 0.4)) { scan = null; return; }
    // One search shared by all pursuers; bounded work per simulation frame.
    const begin = performance.now();
    for (let i = 0; i < config.candidatesPerFrame; i++) {
      const result = scan.iterator.next();
      if (result.done) {
        const track = tracks.get(enemy); if (track) track.probe = now + config.retry;
        scan = null;
        if (result.value) startRoute(enemy, result.value);
        break;
      }
      if (performance.now() - begin >= config.scanMs) break;
    }
    stats.maxScanMs = Math.max(stats.maxScanMs, performance.now() - begin);
  }
  function watch(enemy, dt) {
    let track = tracks.get(enemy);
    if (!track) { track = { wait: 0, probe: 0, best: Infinity, field: Infinity, x: 0, z: 0 }; tracks.set(enemy, track); }
    if (!pursuing(enemy)) { track.wait = 0; track.best = track.field = Infinity; return; }
    // A brief jump or ordinary climb does not erase the stall history.
    if (!player.onGround || enemy.act || !enemy.onGround) return;
    const d = Math.hypot(player.pos.x - enemy.pos.x, player.pos.z - enemy.pos.z, (player.pos.y - enemy.pos.y) * 1.3);
    const field = !wallTarget() && enemy.node >= 0 ? runtime.FIELD[enemy.node] : Infinity;
    if (Math.hypot(player.pos.x - track.x, player.pos.z - track.z) > 2.5 ||
        d < track.best - 0.6 || field < track.field - 0.8) {
      track.wait = 0; track.best = d; track.field = field;
      track.x = player.pos.x; track.z = player.pos.z;
    }
    track.wait += dt;
    const now = game.ceRef();
    if (track.wait < config.wait || now < track.probe || now < nextScan || scan) return;
    track.probe = now + config.retry + Math.random() * 0.2;
    nextScan = now + config.scanGap;
    // Do not climb unrelated walls because another zombie is blocking a clear
    // walking route, or because an enemy is already in melee range.
    if ((Math.abs(player.pos.y - enemy.pos.y) < 1.25 && d < 1.5) || clearLine(enemy, enemy.pos, player.pos, true)) return;
    scan = { enemy, goal: point(player.pos.x, player.pos.y, player.pos.z), iterator: findRoute(enemy) };
  }
  function interrupt(enemy) {
    if (enemy.act?.kind !== 'pillar') return;
    enemy.act = null; enemy.onGround = false; enemy.navT = 0; enemy.vel.set(0, 0, 0);
    const track = tracks.get(enemy); if (track) { track.active = null; track.wait = 0; track.best = track.field = Infinity; }
    stats.interrupted++;
  }
  function climb(enemy, dt) {
    const a = enemy.act, s = a.segments[a.index];
    if (enemy.dead || enemy.stun > 0 || flashbang.blinded(enemy) || a.column.off || a.cap.off ||
        (player.onGround && Math.abs(player.pos.y - a.goal.y) > 0.4) ||
        Math.hypot(player.pos.x - a.goal.x, player.pos.z - a.goal.z) > 8) {
      interrupt(enemy); return false;
    }
    // A low wall opening can leave a stalled pursuer crawling underneath it.
    // Approach at its current height, then stand only on the checked outer face.
    if (s.kind !== 'approach') enemy.h = enemy.stalker ? 2.4 : 1.8;
    const length = distance(a.from, s.to), speed = s.kind === 'approach' ? 1.6 : s.kind === 'mantle' ? 0.65 : config.speed;
    const t = Math.min(1, a.t + dt * speed / Math.max(0.001, length)), next = point(a.from.x + (s.to.x - a.from.x) * t,
      a.from.y + (s.to.y - a.from.y) * t, a.from.z + (s.to.z - a.from.z) * t);
    if (!clearLine(enemy, enemy.pos, next, s.kind === 'approach')) { interrupt(enemy); return false; }
    // Special motion must respect other bodies too. Queue on the face instead
    // of merging into another climber or an enemy standing at the landing.
    const penetration = (p, other) => Math.max(0, enemy.r + other.r + 0.03 - Math.hypot(p.x - other.pos.x, p.z - other.pos.z)) *
      Math.max(0, Math.min(p.y + enemy.h, other.pos.y + other.h) - Math.max(p.y, other.pos.y));
    if (zombies.some(other => other !== enemy && !other.dead && !other.remove &&
        penetration(next, other) > penetration(enemy.pos, other) + 1e-6)) {
      a.blockedFor = (a.blockedFor || 0) + dt;
      if (a.blockedFor > 3) { interrupt(enemy); return false; }
      enemy.vel.set(0, 0, 0); enemy.anim(dt); return true;
    }
    a.blockedFor = 0; a.t = t;
    const moved = distance(enemy.pos, next);
    a.travel += moved; a.segmentTravel += moved;
    enemy.pos.set(next.x, next.y, next.z);
    enemy.vel.set(s.kind === 'approach' ? (s.to.x - a.from.x) / Math.max(0.001, length) * speed : 0, 0,
      s.kind === 'approach' ? (s.to.z - a.from.z) / Math.max(0.001, length) * speed : 0);
    enemy.onGround = false; enemy.atkT = 0; enemy.reach = enemy.bash = false;
    enemy.yaw = s.kind === 'approach' ? Math.atan2(a.from.x - s.to.x, a.from.z - s.to.z) : Math.atan2(s.normal.x, s.normal.z);
    enemy.anim(dt);
    if (a.t >= 1) {
      if (++a.index >= a.segments.length) {
        enemy.act = null; enemy.onGround = true; enemy.node = a.node; enemy.edge = -1;
        enemy.navT = 0; enemy.stuckT = enemy.guardT = enemy.sideT = 0;
        const track = tracks.get(enemy);
        if (track) {
          track.active = null;
          track.best = track.field = Infinity; track.wait = 0;
          track.landing = a.directTop ? { cap: a.cap, probe: 0, clear: false, x: Infinity, z: Infinity } : null;
        }
        stats.finished++;
      } else { a.from = next; a.t = 0; a.segmentTravel = 0; }
    }
    return true;
  }

  // Pose the existing rigs directly, including the Unity standard/evolved rig.
  // Save/restore every override so mixer throttling and interrupted climbs cannot
  // accumulate rotations or leave the next walking/death/flash pose distorted.
  function rigFor(enemy) {
    let rig = rigs.get(enemy.m); if (rig) return rig;
    const m = enemy.m, bones = {}, rest = new Map();
    (m.src?.scene || m.root).traverse(b => { if (b.isBone) rest.set(b.name, { q: b.quaternion.clone(), p: b.position.clone() }); });
    const boneKey = name => name.replace(/^mixamorig:?/, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
    m.root.traverse(b => { if (b.isBone) bones[boneKey(b.name)] = b; });
    const pick = (...names) => names.map(n => bones[boneKey(n)]).find(Boolean);
    const limbs = [
      [pick('Base HumanLArmUpperarm', 'LeftArm', 'upperarm_l'), pick('Base HumanLArmForearm', 'LeftForeArm', 'lowerarm_l'), pick('Base HumanLArmPalm', 'LeftHand', 'hand_l'), -1, true],
      [pick('Base HumanRArmUpperarm', 'RightArm', 'upperarm_r'), pick('Base HumanRArmForearm', 'RightForeArm', 'lowerarm_r'), pick('Base HumanRArmPalm', 'RightHand', 'hand_r'), 1, true],
      [pick('Base HumanLLegThigh', 'LeftUpLeg', 'thigh_l'), pick('Base HumanLLegCalf', 'LeftLeg', 'calf_l'), pick('Base HumanLLegFoot', 'LeftFoot', 'foot_l'), -1, false],
      [pick('Base HumanRThigh', 'RightUpLeg', 'thigh_r'), pick('Base HumanRCalf', 'RightLeg', 'calf_r'), pick('Base HumanRFoot', 'RightFoot', 'foot_r'), 1, false],
    ];
    const entries = Object.values(bones).map(b => ({ b, rest: rest.get(b.name) || { q: b.quaternion.clone(), p: b.position.clone() }, q: b.quaternion.clone(), p: b.position.clone() }));
    rig = { entries, limbs: limbs.filter(l => l[0] && l[1] && l[2]), active: false,
      a: new Vector3(), b: new Vector3(), end: new Vector3(), dir: new Vector3(), bend: new Vector3(), elbow: new Vector3(), target: new Vector3(),
      current: new Vector3(), desired: new Vector3(), q: m.root.quaternion.clone(), worldQ: m.root.quaternion.clone(), parentQ: m.root.quaternion.clone() };
    rigs.set(m, rig); return rig;
  }
  function restore(enemy) {
    const rig = rigs.get(enemy.m); if (!rig?.active) return;
    for (const e of rig.entries) { e.b.quaternion.copy(e.q); e.b.position.copy(e.p); }
    rig.active = false;
  }
  function aim(rig, bone, child, target) {
    bone.getWorldPosition(rig.a); child.getWorldPosition(rig.b);
    rig.current.copy(rig.b).sub(rig.a).normalize(); rig.desired.copy(target).sub(rig.a).normalize();
    rig.q.setFromUnitVectors(rig.current, rig.desired);
    bone.getWorldQuaternion(rig.worldQ); bone.parent.getWorldQuaternion(rig.parentQ);
    bone.quaternion.copy(rig.parentQ.invert().multiply(rig.worldQ.premultiply(rig.q)));
    bone.updateWorldMatrix(false, true);
  }
  function limbIK(rig, upper, lower, end, target, normal, side) {
    upper.getWorldPosition(rig.a); lower.getWorldPosition(rig.b); end.getWorldPosition(rig.end);
    const l1 = rig.a.distanceTo(rig.b), l2 = rig.b.distanceTo(rig.end);
    rig.dir.copy(target).sub(rig.a);
    const d = clamp(rig.dir.length(), Math.abs(l1 - l2) + 0.001, l1 + l2 - 0.001);
    rig.dir.normalize();
    const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d), off = Math.sqrt(Math.max(0, l1 * l1 - along * along));
    rig.bend.set(normal.x + normal.z * side * 0.3, 0.05, normal.z - normal.x * side * 0.3);
    rig.bend.addScaledVector(rig.dir, -rig.bend.dot(rig.dir)).normalize();
    rig.elbow.copy(rig.a).addScaledVector(rig.dir, along).addScaledVector(rig.bend, off);
    aim(rig, upper, lower, rig.elbow); aim(rig, lower, end, target);
  }
  function pose(enemy) {
    const a = enemy.act, s = a?.kind === 'pillar' && a.segments[a.index];
    if (!s || s.kind === 'approach') return;
    const m = enemy.m;
    if (!m.sk) {
      let fallback = rigs.get(m);
      if (!fallback) {
        fallback = { active: false, entries: [m.armL.arm, m.armR.arm, m.armL.fore, m.armR.fore, m.legL.leg, m.legR.leg, m.legL.shin, m.legR.shin]
          .map(b => ({ b, q: b.quaternion.clone(), p: b.position.clone() })) }; rigs.set(m, fallback);
      }
      for (const e of fallback.entries) { e.q.copy(e.b.quaternion); e.p.copy(e.b.position); }
      fallback.active = true;
      const wave = Math.sin(a.travel / 0.38 * Math.PI * 2);
      m.armL.arm.rotation.x = 2.5 + wave * 0.3; m.armR.arm.rotation.x = 2.5 - wave * 0.3;
      m.armL.fore.rotation.x = m.armR.fore.rotation.x = -0.7;
      m.legL.leg.rotation.x = 0.65 - wave * 0.3; m.legR.leg.rotation.x = 0.65 + wave * 0.3;
      m.legL.shin.rotation.x = m.legR.shin.rotation.x = -1.1;
      return;
    }
    const rig = rigFor(enemy), n = s.normal;
    if (rig.limbs.length < 4) return;
    for (const e of rig.entries) {
      e.q.copy(e.b.quaternion); e.p.copy(e.b.position);
      e.b.quaternion.copy(e.rest.q); e.b.position.copy(e.rest.p);
    }
    rig.active = true; m.root.updateMatrixWorld(true);
    for (const [upper, lower, end, side, hand] of rig.limbs) {
      const phase = (side > 0 ? 0.5 : 0) + (hand ? 0 : 0.5);
      const stride = 0.46, motion = s.kind === 'hang' ? a.segmentTravel : enemy.pos.y - a.originY;
      const cycle = motion / stride + phase;
      const fraction = cycle - Math.floor(cycle), reach = smooth((fraction - 0.65) / 0.35);
      const surface = enemy.r + 0.07 - Math.sin(reach * Math.PI) * 0.08;
      rig.target.set(enemy.pos.x - n.x * surface + n.z * side * (hand ? 0.2 : 0.13),
        a.originY + (hand ? 1.85 : 0.4) + stride * (Math.floor(cycle) - phase + reach),
        enemy.pos.z - n.z * surface - n.x * side * (hand ? 0.2 : 0.13));
      if (s.kind === 'hang') {
        if (hand) {
          const len = distance(a.from, s.to), grip = stride * (Math.floor(cycle) - phase + reach) - motion;
          rig.target.x += (s.to.x - a.from.x) / Math.max(0.001, len) * grip;
          rig.target.z += (s.to.z - a.from.z) / Math.max(0.001, len) * grip;
        }
        rig.target.y = hand ? s.surface.minY - 0.015 : enemy.pos.y + 0.25 + reach * 0.2;
        if (!hand) { rig.target.x += n.x * 0.22; rig.target.z += n.z * 0.22; }
      } else {
        rig.target.y = Math.min(rig.target.y, a.cap.maxY + (hand ? 0.02 : -0.04));
      }
      limbIK(rig, upper, lower, end, rig.target, n, side);
    }
    if (s.kind === 'mantle') for (const e of rig.entries) e.b.quaternion.slerp(e.q, smooth(a.t));
    m.root.updateMatrixWorld(true);
  }

  const originalUpdate = ri.prototype.update, originalAnim = ri.prototype.anim;
  ri.prototype.update = function updateWithPillarClimb(dt) {
    // A visible decoy owns this chase; recovery scans must not pull it back
    // toward the real player's elevation or an old wall-top landing.
    if (window.skyDecoy?.targetFor(this)) {
      if (this.act?.kind === 'pillar') interrupt(this);
      const tracked = tracks.get(this); if (tracked) { tracked.wait = 0; tracked.landing = null; }
      if (scan?.enemy === this) scan = null;
      return originalUpdate.call(this, dt);
    }
    pumpScan();
    const track = tracks.get(this);
    if (track?.active && this.act !== track.active) { track.active = null; track.wait = 0; stats.interrupted++; }
    if (this.act?.kind === 'pillar' && climb(this, dt)) return;
    const target = wallTarget();
    if (target && eligible(this) && distanceToTop(this.pos, target) <= this.r + 0.3) {
      // At the wall's foot, use the usual direct chase/collision behavior
      // rather than follow a stale field back away from the wall.
      this.edge = -1; this.navT = Math.max(this.navT, dt + 0.25);
    }
    const landing = track?.landing;
    if (landing) {
      if (this.dead || this.remove || this.act || this.stun > 0 || flashbang.blinded(this) ||
          landing.cap.off || !this.onGround || !player.onGround ||
          Math.abs(this.pos.y - landing.cap.maxY) > 0.12 || Math.abs(player.pos.y - landing.cap.maxY) > 0.12) track.landing = null;
      else {
        // Keep the original walking, collision and attack behavior on a wall
        // top. Do not snap its navigation to a nearby, lower catwalk. Recheck
        // the short local path at most four times a second while stationary.
        const now = game.ceRef();
        if (now >= landing.probe || Math.hypot(player.pos.x - landing.x, player.pos.z - landing.z) > 0.5) {
          landing.probe = now + 0.25; landing.x = player.pos.x; landing.z = player.pos.z;
          landing.clear = topPath(this, landing.cap, this.pos);
        }
        if (landing.clear) { this.edge = -1; this.navT = Math.max(this.navT, dt + 0.25); }
      }
    }
    originalUpdate.call(this, dt); watch(this, dt);
  };
  ri.prototype.anim = function animatePillarClimb(dt) {
    restore(this);
    const action = this.act, approaching = action?.kind === 'pillar' && action.segments[action.index]?.kind === 'approach';
    if (approaching) this.act = null;
    originalAnim.call(this, dt);
    if (approaching) this.act = action;
    if (!this.dead && this.stun <= 0 && !flashbang.blinded(this)) pose(this);
  };
  return { config, stats, get columns() { return columns.size; },
    state(enemy) { const t = tracks.get(enemy); return { wait: t?.wait || 0, climbing: enemy.act?.kind === 'pillar', stage: enemy.act?.segments?.[enemy.act.index]?.kind || null, searching: scan?.enemy === enemy }; } };
}
