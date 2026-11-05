import { traversalPoint } from './zombie-routing.js?v=20261106-pursuit-v2';

// Recovery when the authored graph cannot reach a nearby standing target.
// Every approach needs continuous floor; every flight uses a swept body and a
// supported landing with an onward route. Never insert speculative NAV links.
export function createZombieDescent(game, runtime, climb, flashbang, routing) {
  const config = Object.freeze({ wait: 4, retry: 1.5, radius: 40, scanGap: .12, scanMs: 2, perFrame: 12 });
  const stats = { scans: 0, checked: 0, started: 0, landed: 0, interrupted: 0, maxScanMs: 0 };
  const states = new WeakMap();
  let scan = null, nextScan = 0, pumpedAt = -Infinity;
  let navGoal = null;
  const point = (x, y, z) => ({ x, y, z }), copy = p => point(p.x, p.y, p.z);
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const target = enemy => window.skyZombieSearch?.recoveryTarget(enemy) || game.c;
  const field = enemy => window.skyZombieSearch?.recoveryField(enemy) || runtime.FIELD;
  const speed = enemy => window.skyChallenge?.speed?.(enemy.speedMul || 1, game.U.zombieSpeed) || game.U.zombieSpeed;
  const usable = b => !b.off && b.canyonTier !== 'wall' && ['slab', 'mono', 'beam'].includes(b.type);
  const standingNode = body => {
    const id = runtime.nodeAt(body.pos.x, body.pos.y + .1, body.pos.z);
    return id >= 0 && Math.abs(runtime.NAV.nodes[id].y - body.pos.y) < .35 ? id : -1;
  };
  const missingTarget = player => player?.onGround && standingNode(player) < 0 && !climb.navigationTargets?.()?.length &&
    !(navGoal && distance(player.pos, navGoal.goal) < .5 && navGoal.ids.length);
  function flightBetween(from, to) {
    const fall = from.y - to.y, across = Math.hypot(from.x - to.x, from.z - to.z), leap = fall <= routing.config.rise;
    return { kind: leap ? 'leap' : 'jumpdown', sx: from.x, sy: from.y, sz: from.z, tx: to.x, ty: to.y, tz: to.z,
      t: 0, wait: .18, dur: leap ? .3 + across / 12 : .3 + Math.sqrt(2 * fall / game.U.gravity),
      arc: 1.3 + Math.max(0, -fall) * .5, descentRecovery: true, localTraversal: true, pursuitTraversal: true };
  }
  function checkedFlight(body, from, to) {
    if (Math.hypot(from.x - to.x, from.z - to.z) > routing.config.jump ||
        to.y - from.y > routing.config.rise || from.y - to.y > routing.config.drop) return null;
    const flight = flightBetween(from, to);
    const originalArc = flight.arc;
    for (const clearance of flight.kind === 'leap' ? [flight.arc, 1, .75, .5, .25] : [.5, .25, 0]) {
      if (flight.kind === 'leap' && clearance < originalArc) {
        // A ceiling-limited hop must still fit the player's available air
        // time and horizontal speed; lowering the arc cannot bridge a long gap.
        const height = clearance + Math.max(0, to.y - from.y), v = game.U.jumpVel || 6, gravity = game.U.gravity;
        const air = (v - Math.sqrt(Math.max(0, v * v - 2 * gravity * height))) / gravity + Math.sqrt(2 * height / gravity);
        if (Math.hypot(from.x - to.x, from.z - to.z) > (game.U.sprintSpeed || 6) * air + body.r * 2) continue;
      }
      if (flight.kind === 'leap') flight.arc = clearance; else flight.lift = clearance;
      if (routing.sweep(body, flight, true)) return flight;
    }
    return null;
  }
  function navigationTargets() {
    const player = game.c, existing = climb.navigationTargets?.();
    if (game.z.mission || !player.onGround || standingNode(player) >= 0) return existing;
    const now = game.ceRef(), key = runtime.INDOOR_ACCESS?.revision || 0;
    if (navGoal && distance(player.pos, navGoal.goal) < .3 && now < navGoal.until && key === navGoal.key) return navGoal.ids.length ? navGoal.ids : existing;
    const ids = existing ? [...existing] : [], costs = { ...existing?.costs }, body = { r: .3, h: 1.8 };
    // A low overhang can block a vertical flight onto the exact player point.
    // A nearby, supported landing followed by a clear walk reaches the same
    // target without dropping through the overhang or aiming at an old roof.
    const finishes = [copy(player.pos)];
    for (const offset of [.3, .75]) for (const [x, z] of [[offset, 0], [-offset, 0], [0, offset], [0, -offset]]) {
      const p = point(player.pos.x + x, player.pos.y, player.pos.z + z);
      if (climb.clearLine(body, p, player.pos, true)) finishes.push(p);
    }
    for (const node of runtime.NAV.nodes) {
      const from = { ...node, y: node.y + .003 }, rise = player.pos.y - from.y;
      if (Math.hypot(from.x - player.pos.x, from.z - player.pos.z) > routing.config.jump + .75 || rise > routing.config.rise || -rise > routing.config.drop) continue;
      if (Math.abs(rise) < .35 && climb.clearLine(body, from, player.pos, true)) {
        if (costs[node.id] === undefined) ids.push(node.id);
        costs[node.id] = Math.min(costs[node.id] ?? Infinity, distance(from, player.pos));
        continue;
      }
      if (!climb.clearLine(body, from, from, true)) continue;
      let cost = Infinity;
      for (const to of finishes) {
        const flight = checkedFlight(body, from, to);
        if (flight) cost = Math.min(cost, (flight.wait + flight.dur) * 6 + distance(to, player.pos));
      }
      if (!Number.isFinite(cost)) continue;
      if (costs[node.id] === undefined) ids.push(node.id);
      costs[node.id] = Math.min(costs[node.id] ?? Infinity, cost);
    }
    Object.defineProperty(ids, 'costs', { value: costs });
    navGoal = { goal: copy(player.pos), until: now + .5, key, ids };
    return ids.length ? ids : existing;
  }
  function walkable(from, to) {
    if (!runtime.wp || distance(from, to) > 12) return false;
    const path = runtime.wp(from, to.x, to.z, to.y);
    return !!path && path.climb <= .45 && path.drop <= .45;
  }
  function landingFree(enemy, p) {
    return !game.Jt.some(other => {
      if (other === enemy || other.dead || other.remove) return false;
      const reserved = other.act?.descentRecovery ? { x: other.act.tx, y: other.act.ty, z: other.act.tz } : other.pos;
      return Math.abs(reserved.y - p.y) < 1.8 && Math.hypot(reserved.x - p.x, reserved.z - p.z) < enemy.r + other.r + .1;
    });
  }
  const eligible = enemy => runtime.mode === 'play' && !game.z.over && !game.z.mission &&
    !enemy.dead && !enemy.remove && game.Jt.includes(enemy) && !enemy.stalker && !enemy.rise && !enemy.fall && !enemy.guard &&
    enemy.spawnT <= 0 && !(enemy.stun > 0) && game.z.t - enemy.lastHitT > 1 &&
    !flashbang.blinded(enemy) && !window.skyDecoy?.targetFor(enemy);
  function onward(enemy, p, player) {
    if (Math.abs(player.pos.y - p.y) < .35 && climb.clearLine(enemy, p, player.pos, true)) return distance(p, player.pos) / speed(enemy);
    if (walkable(p, player.pos)) return distance(p, player.pos) / speed(enemy);
    // A field aimed at the player's former roof cannot validate a landing.
    if (missingTarget(player)) return Infinity;
    const id = runtime.nodeAt(p.x, p.y + .1, p.z), node = runtime.NAV.nodes[id];
    return node && Math.abs(node.y - p.y) < .35 ? (field(enemy)?.[id] ?? Infinity) / speed(enemy) : Infinity;
  }
  function* candidates(enemy) {
    const player = target(enemy), pad = enemy.r + .09, p = copy(enemy.pos);
    const tops = [...new Set(runtime.near(p.x - config.radius, p.z - config.radius, p.x + config.radius, p.z + config.radius))]
      .filter(b => usable(b) && Math.abs(b.maxY - p.y) < .12);
    let best = null;
    const direct = checkedFlight(enemy, p, player.pos);
    if (player.pos.y - p.y <= routing.config.rise && p.y - player.pos.y <= routing.config.drop &&
        Math.hypot(player.pos.x - p.x, player.pos.z - p.z) <= routing.config.jump &&
        !climb.clearLine(enemy, p, player.pos, true) && landingFree(enemy, player.pos) && direct) {
      const floor = runtime.near(player.pos.x, player.pos.z, player.pos.x, player.pos.z).find(b => !b.off &&
        Math.abs(b.maxY - player.pos.y) < .05 && player.pos.x >= b.minX && player.pos.x <= b.maxX && player.pos.z >= b.minZ && player.pos.z <= b.maxZ);
      if (floor) best = { from: p, to: copy(player.pos), floor, flight: direct, score: direct.wait + direct.dur,
        descends: player.pos.y < p.y - .5, goal: copy(player.pos) };
    }
    for (const top of tops) for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const lo = nx ? top.minZ : top.minX, hi = nx ? top.maxZ : top.maxX;
      if (hi - lo < pad * 2) continue;
      const alongs = [...new Set([nx ? p.z : p.x, nx ? player.pos.z : player.pos.x, (lo + hi) / 2].map(v => clamp(v, lo + pad, hi - pad)))];
      for (const along of alongs) {
        yield;
        const from = point(nx ? (nx > 0 ? top.maxX - pad : top.minX + pad) : along, top.maxY + .003,
          nz ? (nz > 0 ? top.maxZ - pad : top.minZ + pad) : along);
        if (distance(p, from) > config.radius || !climb.clearLine(enemy, p, from, true)) continue;
        // A lower landing can be reached over the same horizontal distance as
        // an existing short jump; NAV's 3.2m drop-link sampling is not a body limit.
        const reach = routing.config.jump;
        for (const floor of new Set(runtime.near(from.x - reach, from.z - reach, from.x + reach, from.z + reach))) {
          yield;
          if (!usable(floor) || floor.maxY - from.y > routing.config.rise || from.y - floor.maxY > routing.config.drop ||
              floor.maxX - floor.minX < enemy.r + .02 || floor.maxZ - floor.minZ < enemy.r + .02) continue;
          // Reserve separate lanes/landings for a crowd. Without alternatives
          // every follower repeatedly selected the spot occupied by the leader.
          const lane = enemy.r * 2 + .12;
          const lanes = [0, 1, -1, 2, -2, 3, -3, 4, -4].map(offset =>
            point(player.pos.x + nz * lane * offset, player.pos.y, player.pos.z + nx * lane * offset));
          for (const anchor of [from, ...lanes]) for (const landingPad of [pad, .01]) {
            const insetX = Math.min(landingPad, (floor.maxX - floor.minX - .02) / 2);
            const insetZ = Math.min(landingPad, (floor.maxZ - floor.minZ - .02) / 2);
            const to = point(clamp(anchor.x + nx * pad * 2, floor.minX + insetX, floor.maxX - insetX), floor.maxY + .003,
              clamp(anchor.z + nz * pad * 2, floor.minZ + insetZ, floor.maxZ - insetZ));
            if (Math.hypot(to.x - from.x, to.z - from.z) > reach || (to.x - from.x) * nx + (to.z - from.z) * nz < pad) continue;
            if (!landingFree(enemy, to)) continue;
            const flight = checkedFlight(enemy, from, to);
            if (!flight) continue;
            const score = distance(p, from) / speed(enemy) + flight.wait + flight.dur + onward(enemy, to, player);
            // A short hop on the same roof can look cheap in an optimistic
            // path field yet recreate the exact stall. Prefer a checked way
            // down when the target is below; retain lateral recovery if no
            // supported descent exists from this surface.
            const descends = player.pos.y < p.y - .5 && to.y < p.y - .5;
            if (!Number.isFinite(score) || best && (best.descends && !descends ||
                best.descends === descends && score >= best.score) || !routing.sweep(enemy, flight, true)) continue;
            best = { from, to, floor, flight, score, descends, goal: copy(player.pos) };
          }
        }
      }
    }
    return best;
  }
  function pump() {
    const now = game.ceRef();
    if (!scan || pumpedAt === now) return;
    pumpedAt = now;
    if (!eligible(scan.enemy) || scan.enemy.act) { scan = null; return; }
    if (!scan.enemy.onGround || !target(scan.enemy)?.onGround) return;
    const start = performance.now();
    for (let i = 0; i < config.perFrame; i++) {
      const next = scan.iterator.next(); stats.checked++;
      if (next.done) {
        const enemy = scan.enemy, state = states.get(enemy), route = next.value;
        const checks = route && { fresh: distance(target(enemy).pos, route.goal) < .5, approach: climb.clearLine(enemy, enemy.pos, route.from, true), flight: routing.sweep(enemy, route.flight, true) };
        if (checks && checks.fresh && checks.approach && checks.flight) {
          state.route = route; route.phase = 'approach'; route.blocked = 0;
          enemy.act = { ...route.flight, kind: 'descent' }; state.action = enemy.act;
          enemy.vel.set(0, 0, 0); enemy.edge = -1; enemy.navT = 0; enemy.atkT = 0; stats.started++;
        }
        scan = null; break;
      }
      if (performance.now() - start >= config.scanMs) break;
    }
    stats.maxScanMs = Math.max(stats.maxScanMs, performance.now() - start);
  }
  function interrupt(enemy, state, queued = false) {
    // hurt() may already have replaced the action and assigned knockback.
    // Preserve that velocity; only stop motion which this recovery still owns.
    if (enemy.act === state.action) { enemy.act = null; enemy.onGround = false; enemy.vel.set(0, 0, 0); }
    state.route = null; state.wait = queued ? config.wait : 0; state.probe = game.ceRef() + (queued ? config.scanGap : config.retry);
    enemy.edge = -1; enemy.navT = 0; stats.interrupted++;
  }
  function animate(enemy, dt, airborne) {
    const action = enemy.act;
    enemy.act = airborne ? { kind: action.kind === 'leap' ? 'leap' : 'jumpdown' } : null;
    enemy.anim(dt); enemy.act = action;
  }
  function move(enemy, state, dt) {
    const route = state.route, player = target(enemy), airborne = route.phase === 'flight';
    if (enemy.act !== state.action || !eligible(enemy) || !player ||
        !airborne && (Math.abs(player.pos.y - route.goal.y) > .5 || distance(player.pos, route.goal) > 8)) {
      interrupt(enemy, state); return false;
    }
    let next;
    if (!airborne) {
      const length = distance(enemy.pos, route.from), t = Math.min(1, dt * speed(enemy) / Math.max(.001, length));
      next = point(enemy.pos.x + (route.from.x - enemy.pos.x) * t, enemy.pos.y + (route.from.y - enemy.pos.y) * t,
        enemy.pos.z + (route.from.z - enemy.pos.z) * t);
    } else next = traversalPoint(route.flight, Math.min(1, route.flight.t + dt / route.flight.dur));
    if (route.floor.off || !climb.clearLine(enemy, enemy.pos, next, !airborne)) { interrupt(enemy, state); return false; }
    const penetration = (p, other) => Math.max(0, enemy.r + other.r + .03 - Math.hypot(p.x - other.pos.x, p.z - other.pos.z)) *
      Math.max(0, Math.min(p.y + enemy.h, other.pos.y + other.h) - Math.max(p.y, other.pos.y));
    if (game.Jt.some(other => other !== enemy && !other.dead && !other.remove && penetration(next, other) > penetration(enemy.pos, other) + 1e-6)) {
      route.blocked += dt;
      if (route.blocked > 3) { interrupt(enemy, state, true); return false; }
      enemy.vel.set(0, 0, 0); animate(enemy, dt, airborne); return true;
    }
    route.blocked = 0;
    if (distance(enemy.pos, next) > .001) enemy.yaw = Math.atan2(enemy.pos.x - next.x, enemy.pos.z - next.z);
    enemy.vel.set((next.x - enemy.pos.x) / dt, 0, (next.z - enemy.pos.z) / dt);
    enemy.pos.set(next.x, next.y, next.z); enemy.onGround = !airborne; enemy.reach = enemy.bash = false;
    animate(enemy, dt, airborne);
    if (!airborne && distance(enemy.pos, route.from) < .001) {
      route.flight.wait -= dt;
      if (route.flight.wait <= 0) {
        if (!routing.sweep(enemy, route.flight, true)) { interrupt(enemy, state); return false; }
        route.phase = 'flight'; enemy.onGround = false; enemy.act = route.flight; state.action = enemy.act;
      }
    } else if (airborne) {
      route.flight.t = Math.min(1, route.flight.t + dt / route.flight.dur);
      if (route.flight.t >= 1) {
        enemy.act = null; enemy.onGround = true; enemy.vel.set(0, 0, 0); enemy.edge = -1; enemy.navT = 0;
        enemy.node = runtime.nodeAt(enemy.pos.x, enemy.pos.y, enemy.pos.z);
        enemy.stuckT = enemy.guardT = enemy.sideT = 0; state.route = null; state.wait = 0; stats.landed++;
      }
    }
    return true;
  }
  function step(enemy, dt) {
    let state = states.get(enemy);
    if (!state) { state = { wait: 0, probe: 0 }; states.set(enemy, state); }
    if (state.route) return move(enemy, state, dt);
    const player = target(enemy);
    const staleTarget = missingTarget(player);
    if (eligible(enemy) && !enemy.act && enemy.onGround && staleTarget &&
        (enemy.pos.y - player.pos.y >= .5 || walkable(enemy.pos, player.pos) ||
          Math.abs(enemy.pos.y - player.pos.y) < .35 && climb.clearLine(enemy, enemy.pos, player.pos, true))) {
      // Do not follow the stale roof field after the player lands on a tread
      // or small slab. Keep the ordinary collision/step/attack solver aiming
      // at the real target, including the short stair walk after a descent.
      enemy.edge = -1; enemy.navT = Math.max(enemy.navT || 0, dt + .25);
    }
    // The motor may briefly lose ground contact on the edge of a tread. Pause
    // there, as the climb recovery does, rather than erase all stall history.
    if (eligible(enemy) && (enemy.act || !enemy.onGround || !player?.onGround)) {
      return false;
    }
    if (!eligible(enemy) || player.pos.y - enemy.pos.y > routing.config.rise ||
        Math.abs(enemy.pos.y - player.pos.y) < .35 && climb.clearLine(enemy, enemy.pos, player.pos, true)) {
      state.wait = 0; if (scan?.enemy === enemy) scan = null; return false;
    }
    pump();
    if (state.route) return move(enemy, state, dt);
    const node = runtime.nodeAt(enemy.pos.x, enemy.pos.y, enemy.pos.z), reachable = !staleTarget && Number.isFinite(field(enemy)?.[node]);
    const remaining = reachable ? field(enemy)[node] : Infinity, separation = distance(enemy.pos, player.pos);
    if (!state.goal || distance(player.pos, state.goal) > 2.5) {
      state.goal = copy(player.pos); state.best = separation; state.field = remaining; state.wait = 0;
    } else if (separation < state.best - .6 || remaining < state.field - .8) {
      state.best = Math.min(state.best, separation); state.field = Math.min(state.field, remaining); state.wait = 0;
    }
    state.wait += dt;
    const now = game.ceRef();
    if (state.wait >= (reachable ? config.wait : .5) && now >= state.probe && now >= nextScan && !scan) {
      state.probe = now + config.retry; nextScan = now + config.scanGap;
      scan = { enemy, iterator: candidates(enemy) }; stats.scans++;
    }
    return false;
  }
  const hasNavigationTarget = player => !!navGoal?.ids.length && distance(player.pos, navGoal.goal) < .5;
  return { config, stats, step, navigationTargets, hasNavigationTarget, isPlanning: enemy => scan?.enemy === enemy };
}
