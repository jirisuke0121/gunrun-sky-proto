import { traversalPoint } from './zombie-routing.js?v=20261102-free-climb-v1';

// Recovery for lower targets when the authored graph cannot supply a descent.
// Every approach needs continuous floor; every flight uses a swept body and a
// supported landing with an onward route. Never insert speculative NAV links.
export function createZombieDescent(game, runtime, climb, flashbang, routing) {
  const config = Object.freeze({ wait: 4, retry: 1.5, radius: 40, scanGap: .12, scanMs: 2, perFrame: 12 });
  const stats = { scans: 0, checked: 0, started: 0, landed: 0, interrupted: 0, maxScanMs: 0 };
  const states = new WeakMap();
  let scan = null, nextScan = 0, pumpedAt = -Infinity;
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
  const missingTarget = player => player?.onGround && standingNode(player) < 0 && !climb.navigationTargets?.()?.length;
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
          if (!usable(floor) || from.y - floor.maxY < .5 || from.y - floor.maxY > routing.config.drop ||
              floor.maxX - floor.minX < enemy.r + .02 || floor.maxZ - floor.minZ < enemy.r + .02) continue;
          const insetX = Math.min(pad, (floor.maxX - floor.minX - .02) / 2);
          const insetZ = Math.min(pad, (floor.maxZ - floor.minZ - .02) / 2);
          // Reserve separate lanes/landings for a crowd. Without alternatives
          // every follower repeatedly selected the spot occupied by the leader.
          const lane = enemy.r * 2 + .12;
          for (const anchor of [from, player.pos,
            point(player.pos.x + nz * lane, player.pos.y, player.pos.z + nx * lane),
            point(player.pos.x - nz * lane, player.pos.y, player.pos.z - nx * lane)]) {
            const to = point(clamp(anchor.x + nx * pad * 2, floor.minX + insetX, floor.maxX - insetX), floor.maxY + .003,
              clamp(anchor.z + nz * pad * 2, floor.minZ + insetZ, floor.maxZ - insetZ));
            if (Math.hypot(to.x - from.x, to.z - from.z) > reach || (to.x - from.x) * nx + (to.z - from.z) * nz < pad) continue;
            if (!landingFree(enemy, to)) continue;
            const flight = { kind: 'jumpdown', sx: from.x, sy: from.y, sz: from.z, tx: to.x, ty: to.y, tz: to.z,
              t: 0, wait: .18, dur: .3 + Math.sqrt(2 * (from.y - to.y) / game.U.gravity), descentRecovery: true };
            const score = distance(p, from) / speed(enemy) + flight.wait + flight.dur + onward(enemy, to, player);
            if (!Number.isFinite(score) || best && score >= best.score || !routing.sweep(enemy, flight)) continue;
            best = { from, to, floor, flight, score, goal: copy(player.pos) };
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
    if (!eligible(scan.enemy) || scan.enemy.act || !scan.enemy.onGround || !target(scan.enemy)?.onGround) { scan = null; return; }
    const start = performance.now();
    for (let i = 0; i < config.perFrame; i++) {
      const next = scan.iterator.next(); stats.checked++;
      if (next.done) {
        const enemy = scan.enemy, state = states.get(enemy), route = next.value;
        if (route && distance(target(enemy).pos, route.goal) < .5 && climb.clearLine(enemy, enemy.pos, route.from, true) && routing.sweep(enemy, route.flight)) {
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
  function interrupt(enemy, state) {
    // hurt() may already have replaced the action and assigned knockback.
    // Preserve that velocity; only stop motion which this recovery still owns.
    if (enemy.act === state.action) { enemy.act = null; enemy.onGround = false; enemy.vel.set(0, 0, 0); }
    state.route = null; state.wait = 0; state.probe = game.ceRef() + config.retry;
    enemy.edge = -1; enemy.navT = 0; stats.interrupted++;
  }
  function animate(enemy, dt, airborne) {
    const action = enemy.act;
    enemy.act = airborne ? { kind: 'jumpdown' } : null;
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
      if (route.blocked > 3) { interrupt(enemy, state); return false; }
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
        if (!routing.sweep(enemy, route.flight)) { interrupt(enemy, state); return false; }
        route.phase = 'flight'; enemy.onGround = false;
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
    if (!state) { state = { wait: 0, probe: 0, origin: copy(enemy.pos) }; states.set(enemy, state); }
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
    if (!eligible(enemy) || enemy.act || !enemy.onGround || !player?.onGround || enemy.pos.y - player.pos.y < .5) {
      state.wait = 0; if (scan?.enemy === enemy) scan = null; return false;
    }
    pump();
    if (state.route) return move(enemy, state, dt);
    const node = runtime.nodeAt(enemy.pos.x, enemy.pos.y, enemy.pos.z), reachable = !staleTarget && Number.isFinite(field(enemy)?.[node]);
    if (reachable && distance(enemy.pos, state.origin) > 1.5) { state.origin = copy(enemy.pos); state.wait = 0; }
    state.wait += dt;
    const now = game.ceRef();
    if (state.wait >= (reachable ? config.wait : .5) && now >= state.probe && now >= nextScan && !scan) {
      state.probe = now + config.retry; nextScan = now + config.scanGap;
      scan = { enemy, iterator: candidates(enemy) }; stats.scans++;
    }
    return false;
  }
  return { config, stats, step };
}
