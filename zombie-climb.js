// A local escape from a stalled chase. Columns never enter the shared path graph.
export function createZombieClimb(game, runtime, flashbang) {
  const { ri, c: player, z: run, Jt: zombies, jn: solids, oe: free, Geom: { Vector3 } } = game;
  const config = Object.freeze({ wait: 4, speed: 0.8, retry: 1.5, radius: 3.5, scanGap: 0.12 });
  const stats = { scans: 0, started: 0, finished: 0, interrupted: 0 };
  const tracks = new WeakMap(), rigs = new WeakMap();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = v => { v = clamp(v, 0, 1); return v * v * (3 - 2 * v); };
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const point = (x, y, z) => ({ x, y, z });
  const distanceToTop = (p, b) => Math.hypot(p.x - clamp(p.x, b.minX, b.maxX), p.z - clamp(p.z, b.minZ, b.maxZ));
  const faces = [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }];
  const overlap = (a, b) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
  const columns = new Map();
  // Index faces once, including long walls. Rock boundaries, doors, props and
  // thin beams remain excluded. Navigation-free wall tops are only usable when
  // they actually support the player; they never enter the shared path graph.
  for (const b of solids) {
    if (b.canyonTier === 'wall' || !['slab', 'mono'].includes(b.type) ||
        b.maxY - b.minY < 3.4 ||
        b.maxX - b.minX < 0.4 || b.maxZ - b.minZ < 0.4) continue;
    const caps = [...new Set(runtime.near(b.minX - 0.01, b.minZ - 0.01, b.maxX + 0.01, b.maxZ + 0.01))]
      .filter(cap => !cap.off && cap.type !== 'mono' && cap.type !== 'door' && cap.type !== 'prop' &&
        cap.maxY >= b.maxY - 0.05 && cap.maxY <= b.maxY + 0.65 && overlap(b, cap));
    if (b.type === 'mono') caps.push(b);
    if (caps.length) columns.set(b, caps);
  }
  let nextScan = 0;
  let targetTime = -Infinity, targetTop = null;

  function clearBody(enemy, p) { return free(p.x, p.y + 0.012, p.z, enemy.r, enemy.h); }
  function clearLine(enemy, a, b, grounded = false) {
    const steps = Math.max(1, Math.ceil(distance(a, b) / 0.18));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, p = point(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
      if (!clearBody(enemy, p) || grounded && !runtime.groundBelow(p.x, p.z, p.y, 0.35, 0.1)) return false;
    }
    return true;
  }
  function facePoint(b, n, enemy, inset = false) {
    const pad = enemy.r + 0.09, along = Math.min(pad, (n.x ? b.maxZ - b.minZ : b.maxX - b.minX) / 2);
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
    if (!onTop(player, cap)) return false;
    const goal = point(player.pos.x, cap.maxY + 0.003, player.pos.z);
    return clearLine(enemy, from, goal, true);
  }
  function wallTarget() {
    const now = game.ceRef();
    if (now === targetTime) return targetTop;
    targetTime = now; targetTop = null;
    if (player.onGround && landingNode(player.pos) < 0) {
      targetTop = runtime.near(player.pos.x, player.pos.z, player.pos.x, player.pos.z)
        .find(b => b.type === 'mono' && columns.has(b) && onTop(player, b)) || null;
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
    const start = facePoint(column, normal, enemy), outside = facePoint(cap, normal, enemy);
    const finish = facePoint(cap, normal, enemy, true); finish.y = cap.maxY + 0.003;
    // Keep a narrow support's tangent coordinate when traversing its overhang.
    if (normal.x) outside.z = finish.z = along;
    else outside.x = finish.x = along;
    const top = cap.maxY, rise = top - enemy.pos.y, node = landingNode(finish);
    if (rise < 1.8 || top > player.pos.y + 1.2 || distance(enemy.pos, start) > config.radius) return null;
    // A mono's top has no NAV node. Only accept a real, unobstructed landing
    // connected across this same top to the grounded player.
    const standing = { r: enemy.r, h: enemy.stalker ? 2.4 : 1.8 };
    const directTop = cap.type === 'mono' || node < 0;
    if (directTop && !topPath(standing, cap, finish)) return null;
    const approach = approachPoints(enemy, column, start);
    if (!approach) return null;
    const segments = approach.map(to => ({ kind: 'approach', to, normal, surface: column }));
    const overhang = Math.hypot(outside.x - start.x, outside.z - start.z);
    if (overhang > 0.06) {
      // A support ends under a deck: climb to its underside, traverse hand over
      // hand to the lip, then climb around it. Never pass through the deck.
      if (overhang > config.radius) return null;
      const underY = cap.minY - Math.max(standing.h, 2.05) - 0.05;
      if (underY < enemy.pos.y + 0.4) return null;
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
        other.act.column === column && other.act.normal === normal)) return null;
    return { kind: 'pillar', column, cap, normal, node, directTop, segments, index: 0,
      from: point(enemy.pos.x, enemy.pos.y, enemy.pos.z), t: 0, travel: 0, originY: enemy.pos.y,
      score: length + (directTop ? distance(finish, player.pos) : runtime.FIELD[node]) * 0.4, segmentTravel: 0 };
  }
  function findRoute(enemy) {
    stats.scans++;
    const r = config.radius, near = new Set(runtime.near(enemy.pos.x - r, enemy.pos.z - r, enemy.pos.x + r, enemy.pos.z + r));
    let best = null;
    for (const column of near) {
      const caps = columns.get(column);
      if (!caps || column.off || column.minY > enemy.pos.y + 1.6 || column.maxY <= enemy.pos.y + 1.2) continue;
      for (const cap of caps) for (const normal of faces) {
        const pad = enemy.r + 0.09, axis = normal.x ? 'Z' : 'X', start = facePoint(column, normal, enemy);
        const base = normal.x ? start.z : start.x;
        // At a crossing, the edge of one deck may still be under another deck.
        // Also try just beyond their side edges, bounded to this landing's face.
        const exits = [...new Set([base, ...caps.flatMap(other => [other['min' + axis] - pad, other['max' + axis] + pad])]
          .map(v => clamp(v, cap['min' + axis] + pad, cap['max' + axis] - pad)))]
          .sort((a, b) => Math.abs(a - base) - Math.abs(b - base)).slice(0, 4);
        for (const along of exits) {
          const route = makeRoute(enemy, column, cap, normal, along);
          if (route && (!best || route.score < best.score)) best = route;
        }
      }
    }
    return best;
  }
  function eligible(enemy) {
    return runtime.mode === 'play' && !run.over && !run.mission && !enemy.dead && !enemy.remove &&
      !enemy.act && !enemy.rise && !enemy.fall && !enemy.guard && !enemy.lost && enemy.spawnT <= 0 &&
      enemy.stun <= 0 && !flashbang.blinded(enemy) && enemy.onGround &&
      player.onGround && player.pos.y - enemy.pos.y > 1.8 && run.t - enemy.lastHitT > 1;
  }
  function watch(enemy, dt) {
    let track = tracks.get(enemy);
    if (!track) { track = { wait: 0, probe: 0, best: Infinity, field: Infinity, y: -Infinity, x: 0, z: 0 }; tracks.set(enemy, track); }
    if (!eligible(enemy)) { track.wait = 0; track.best = track.field = Infinity; return; }
    const d = Math.hypot(player.pos.x - enemy.pos.x, player.pos.z - enemy.pos.z, (player.pos.y - enemy.pos.y) * 1.3);
    // When the player has no NAV node, FIELD still points to their last
    // walkable location. Walking toward that old location is not progress.
    const field = !wallTarget() && enemy.node >= 0 ? runtime.FIELD[enemy.node] : Infinity;
    if (Math.hypot(player.pos.x - track.x, player.pos.z - track.z) > 2.5 ||
        enemy.pos.y > track.y + 0.35 || d < track.best - 0.6 || field < track.field - 0.8) {
      track.wait = 0; track.best = d; track.field = field; track.y = enemy.pos.y;
      track.x = player.pos.x; track.z = player.pos.z;
    }
    track.wait += dt;
    const now = game.ceRef();
    if (track.wait < config.wait || now < track.probe || now < nextScan) return;
    track.probe = now + config.retry + Math.random() * 0.2; nextScan = now + config.scanGap;
    const route = findRoute(enemy);
    if (!route) return;
    enemy.act = route; enemy.vel.set(0, 0, 0); enemy.atkT = 0; enemy.reach = enemy.bash = false;
    track.wait = 0; track.active = route; stats.started++;
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
        player.pos.y < enemy.pos.y - 2 || distanceToTop(player.pos, a.cap) > 35) {
      interrupt(enemy); return false;
    }
    // A low wall opening can leave a stalled pursuer crawling underneath it.
    // Approach at its current height, then stand only on the checked outer face.
    if (s.kind !== 'approach') enemy.h = enemy.stalker ? 2.4 : 1.8;
    const length = distance(a.from, s.to), speed = s.kind === 'approach' ? 1.6 : s.kind === 'mantle' ? 0.65 : config.speed;
    a.t = Math.min(1, a.t + dt * speed / Math.max(0.001, length));
    const t = a.t, next = point(a.from.x + (s.to.x - a.from.x) * t,
      a.from.y + (s.to.y - a.from.y) * t, a.from.z + (s.to.z - a.from.z) * t);
    if (!clearBody(enemy, next)) { interrupt(enemy); return false; }
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
    const track = tracks.get(this);
    if (track?.active && this.act !== track.active) { track.active = null; track.wait = 0; stats.interrupted++; }
    if (this.act?.kind === 'pillar' && climb(this, dt)) return;
    const target = wallTarget();
    if (target && eligible(this) && distanceToTop(this.pos, target) <= config.radius) {
      // At the wall's foot, use the usual direct chase/collision behavior
      // rather than follow a stale field back away from the wall.
      this.edge = -1; this.navT = Math.max(this.navT, dt + 0.25);
    }
    const landing = track?.landing;
    if (landing) {
      if (this.dead || this.remove || this.act || this.stun > 0 || flashbang.blinded(this) ||
          !onTop(this, landing.cap) || !onTop(player, landing.cap)) track.landing = null;
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
    state(enemy) { const t = tracks.get(enemy); return { wait: t?.wait || 0, climbing: enemy.act?.kind === 'pillar', stage: enemy.act?.segments?.[enemy.act.index]?.kind || null }; } };
}
