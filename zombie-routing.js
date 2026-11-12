// Local shortcuts on the authored graph. Every new flight uses the same
// trajectory for planning and execution, with a swept body and real landing.
export function traversalPoint(a, t) {
  const blend = v => v * v * (3 - 2 * v), mix = (x, y, v) => x + (y - x) * v;
  if (a.kind === 'leap') return { x: mix(a.sx, a.tx, t), y: mix(a.sy, a.ty, t) + a.arc * Math.sin(Math.PI * t), z: mix(a.sz, a.tz, t) };
  const across = Math.min(1, t / .25), fall = Math.max(0, (t - .25) / .75);
  return { x: mix(a.sx, a.tx, blend(across)), y: a.sy + (a.lift ?? .5) * Math.sin(Math.PI * across * .5) * (1 - fall) + (a.ty - a.sy) * fall * fall,
    z: mix(a.sz, a.tz, blend(across)) };
}

// Leap load (2026-11-02): a zombie's gap jump costs it more than a human's. It takes off
// slowly and, now and then, falls short into the gap (no damage; it must find its way
// back). Hard has neither. `slow` multiplies the flight time; `fail` is the chance per leap.
export const LEAP_LOAD = Object.freeze({
  intro: Object.freeze({ slow: 1.4, fail: .25 }),
  easy: Object.freeze({ slow: 1.35, fail: .2 }),
  normal: Object.freeze({ slow: 1.25, fail: .12 }),
});
export const leapLoad = () => LEAP_LOAD[window.skyChallenge?.id] || null;

export function createZombieRouting(game, runtime, climb, flashbang) {
  const config = Object.freeze({ jump: 4.3, rise: 1.2, drop: 64, dropAcross: 3.2, lookAhead: 8, flankDetour: 2.5 });
  const stats = { checked: 0, shortcuts: 0, boundedFlanks: 0, jumps: 0, drops: 0, blocked: 0, interrupted: 0, maxValidationMs: 0, slowedLeaps: 0, fellShort: 0 };
  const { nodes, E: edges, out } = runtime.NAV;
  const plans = new WeakMap(), direct = new WeakMap();
  // Swept-body validity per edge (2026-11-12). Until now one door opening or closing threw away every
  // result, and the next path search re-swept all ~3,400 leap/drop edges in a single frame (110-210 ms on an
  // iPhone, see docs/HITCHES_2026-11-12.md). A sweep only depends on the boxes under its own footprint and on
  // the rooms that footprint touches, so each edge remembers those and is re-swept only when one of them changes.
  const cache = new WeakMap(), body = { r: .3, h: 1.8 };
  let worldStamp = 0, worldKey = null, nextWorld = -Infinity, worldAt = -Infinity, solidCount = -1, cacheEpoch = 0;
  let roomBoxes = null, roomEntered = [];
  const active = () => !game.z.mission;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const standing = { r: .3, h: 1.8 };
  function owns(edge) {
    if (!active() || !edge || (edge.kind !== 6 && edge.kind !== 7)) return false;
    // Preserve the west district's authored long leaps and descents.
    return !window.skyLeapOK?.(edge);
  }
  function landing(p, r = .3) {
    return [[0, 0], [r * .5, 0], [-r * .5, 0], [0, r * .5], [0, -r * .5]].every(([x, z]) =>
      runtime.near(p.x + x, p.z + z, p.x + x, p.z + z).some(b => !b.off &&
        Math.abs(b.maxY - p.y) < .08 && p.x + x >= b.minX && p.x + x <= b.maxX && p.z + z >= b.minZ && p.z + z <= b.maxZ));
  }
  function action(from, to, kind) {
    const length = Math.hypot(to.x - from.x, to.z - from.z), fall = from.y - to.y;
    return { kind: kind === 6 ? 'leap' : 'jumpdown', sx: from.x, sy: from.y, sz: from.z,
      tx: to.x, ty: to.y + .002, tz: to.z, t: 0, wait: .18,
      dur: kind === 6 ? .3 + length / 12 : .3 + Math.sqrt(2 * Math.max(0, fall) / game.U.gravity),
      arc: 1.3 + Math.max(0, -fall) * .5, pursuitTraversal: true };
  }
  function sweep(body, a, centreSupport = false) {
    const target = { x: a.tx, y: a.ty, z: a.tz };
    if (!(centreSupport ? climb.clearLine(body, target, target, true) : landing(target, body.r)) || !climb.clearLine(body, target, target)) return false;
    let previous = { x: a.sx, y: a.sy, z: a.sz };
    for (let i = 1; i <= 32; i++) {
      const next = traversalPoint(a, i / 32);
      if (!climb.clearLine(body, previous, next)) return false;
      previous = next;
    }
    return true;
  }
  // At most every 0.25 s (and after the clock steps back): has any box been switched or any room entered?
  function worldSync(now) {
    if (now >= worldAt && now < nextWorld) { worldAt = now; return; }
    worldAt = now; nextWorld = now + .25;
    const solids = game.jn || [], access = runtime.INDOOR_ACCESS;
    let key = (access?.revision | 0) + ':' + solids.length + ':';
    for (let i = 0; i < solids.length; i++) if (solids[i].off) key += i + ',';
    // A box was added or removed: the remembered footprints may miss it, so start over (rare).
    if (solids.length !== solidCount) { solidCount = solids.length; cacheEpoch++; }
    if (key === worldKey) return;
    worldKey = key; worldStamp++;
    if (access?.snapshot) {
      const rooms = access.snapshot();
      if (!roomBoxes) roomBoxes = rooms;
      roomEntered = rooms.map(room => !!room.entered);
    }
  }
  // The boxes and rooms an edge's flight can touch: its footprint, padded by the body and a small margin.
  function footprint(edge) {
    const from = nodes[edge.from], to = nodes[edge.to], pad = body.r + .5;
    const minX = Math.min(from.x, to.x) - pad, maxX = Math.max(from.x, to.x) + pad;
    const minZ = Math.min(from.z, to.z) - pad, maxZ = Math.max(from.z, to.z) + pad;
    // Room rules test the flight's centre line only (no body radius), so use its exact extent: a jump along a
    // roof edge does not depend on the room below it.
    const rise = edge.kind === 6 ? 1.3 + Math.max(0, to.y - from.y) * .5 : .5, slack = .05;
    const lowY = Math.min(from.y, to.y) - slack, highY = Math.max(from.y, to.y) + rise + slack;
    const x0 = Math.min(from.x, to.x) - slack, x1 = Math.max(from.x, to.x) + slack;
    const z0 = Math.min(from.z, to.z) - slack, z1 = Math.max(from.z, to.z) + slack;
    const rooms = [];
    if (roomBoxes) for (let i = 0; i < roomBoxes.length; i++) {
      const b = roomBoxes[i];
      if (x1 > b.minX && x0 < b.maxX && z1 > b.minZ && z0 < b.maxZ && highY >= b.minY && lowY < b.maxY) rooms.push(i);
    }
    return { epoch: cacheEpoch, stamp: -1, sig: null, valid: false, boxes: [...runtime.near(minX, minZ, maxX, maxZ)], rooms,
      cost: 0, costLoad: undefined, costGravity: NaN };
  }
  function signature(entry) {
    let sig = '';
    const boxes = entry.boxes;
    for (let i = 0; i < boxes.length; i++) if (boxes[i].off) sig += i + ',';
    for (const id of entry.rooms) sig += roomEntered[id] ? 'e' : 'c';
    return sig;
  }
  function validate(edge) {
    const begin = performance.now(), from = nodes[edge.from], to = nodes[edge.to];
    let valid = !!from && !!to && (edge.kind === 6 ? edge.len <= config.jump && Math.abs(to.y - from.y) <= config.rise
      : edge.len <= config.dropAcross && from.y - to.y > .1 && from.y - to.y <= config.drop);
    if (valid) valid = landing(from) && sweep(standing, action({ ...from, y: from.y + .003 }, to, edge.kind));
    stats.checked++; stats.maxValidationMs = Math.max(stats.maxValidationMs, performance.now() - begin);
    return valid;
  }
  function entryFor(edge) {
    worldSync(game.ceRef());
    let entry = cache.get(edge);
    if (entry && entry.epoch === cacheEpoch && entry.stamp === worldStamp) return entry;
    if (!entry || entry.epoch !== cacheEpoch) { entry = footprint(edge); cache.set(edge, entry); }
    const sig = signature(entry);
    if (sig !== entry.sig) { entry.sig = sig; entry.valid = validate(edge); }
    entry.stamp = worldStamp;
    return entry;
  }
  const usable = edge => entryFor(edge).valid;
  function edgeCost(edge) {
    if (edge?.kind === 5) return window.skyZombieLadders?.edgeCost(edge) ?? null;
    if (!owns(edge)) return null;
    if (runtime.INDOOR_ACCESS?.edgeAllowed && !runtime.INDOOR_ACCESS.edgeAllowed(edge, runtime.NAV)) return Infinity;
    const entry = entryFor(edge);
    if (!entry.valid) return Infinity;
    // Match movement time in the metre-scaled walking field, including the
    // take-off cue and the existing recovery after a higher drop.
    const load = edge.kind === 6 ? leapLoad() : null, gravity = game.U.gravity;
    if (entry.costLoad !== load || entry.costGravity !== gravity) {
      const a = action(nodes[edge.from], nodes[edge.to], edge.kind);
      // A failed leap costs about ten seconds of climbing back (60 in walking-field units).
      entry.cost = (a.wait + a.dur * (load?.slow || 1) + (edge.kind === 7 ? .55 : 0)) * 6 + (load ? load.fail * 60 : 0);
      entry.costLoad = load; entry.costGravity = gravity;
    }
    return entry.cost + (edge.jamT > game.ceRef() ? 80 : 0);
  }
  function bestEdge(source, field, cost) {
    let best = field[source] + .05, result = -1;
    for (const id of out[source] || []) {
      const edge = edges[id], value = cost(edge) + field[edge.to];
      if (edge.jamT <= game.ceRef() || !edge.jamT) if (value < best) { best = value; result = id; }
    }
    return result;
  }
  function afterPick(enemy, field, cost) {
    if (!active() || enemy.edge < 0) { plans.delete(enemy); return; }
    const base = runtime.FIELD, edge = edges[enemy.edge];
    if (!enemy.stalker && !enemy.dropper && !window.skyDecoy?.targetFor(enemy) && field !== base && Number.isFinite(base[enemy.node]) &&
        cost(edge) + base[edge.to] > base[enemy.node] + config.flankDetour) {
      const best = bestEdge(enemy.node, base, cost);
      if (best >= 0) { enemy.edge = best; field = base; stats.boundedFlanks++; }
    }
    plans.set(enemy, { field, cost, point: null });
  }
  function waypoint(enemy, edge) {
    if (edge.kind === 5 && window.skyZombieLadders?.enabled()) return window.skyZombieLadders.waypoint(enemy, edge);
    const plan = plans.get(enemy);
    if (!active() || edge.kind !== 0 || !plan) return null;
    if (plan.point) return plan.point;
    let node = nodes[edge.to], best = null;
    for (let i = 0; i < config.lookAhead; i++) {
      if (Math.abs(node.y - enemy.pos.y) > .12 || !climb.clearLine(enemy, enemy.pos, { x: node.x, y: node.y + .003, z: node.z }, true)) break;
      best = node;
      const id = bestEdge(node.id, plan.field, plan.cost), next = edges[id];
      if (!next || next.kind !== 0) break;
      node = nodes[next.to];
    }
    if (best && best.id !== edge.to) { plan.point = best; stats.shortcuts++; return best; }
    return null;
  }
  function directChase(enemy, target) {
    if (!active()) return true;
    const old = direct.get(enemy), now = game.ceRef();
    if (old && now < old.until && distance(old.from, enemy.pos) < .3 && distance(old.target, target) < .3) return old.clear;
    const clear = Math.abs(enemy.pos.y - target.y) < .35 && climb.clearLine(enemy, enemy.pos, target, true);
    direct.set(enemy, { from: { ...enemy.pos }, target: { ...target }, until: now + .12, clear });
    return clear;
  }
  function startTraversal(enemy, edge) {
    const from = nodes[edge.from], to = nodes[edge.to];
    if (!enemy.onGround || enemy.h < 1 || Math.hypot(enemy.pos.x - from.x, enemy.pos.z - from.z) > 1.1 || Math.abs(enemy.pos.y - from.y) > .35) return false;
    const across = Math.hypot(to.x - enemy.pos.x, to.z - enemy.pos.z);
    if (!landing(enemy.pos, enemy.r) || (edge.kind === 6 ? across > config.jump + .4 || Math.abs(to.y - enemy.pos.y) > config.rise + .1
      : across > config.dropAcross + .4 || enemy.pos.y - to.y > config.drop + .35)) return false;
    const a = action(enemy.pos, to, edge.kind);
    if (!sweep(enemy, a)) {
      runtime.jamNavigationEdge?.(enemy.edge, game.ceRef() + 20); enemy.edge = -1; enemy.navT = 0; stats.blocked++; return false;
    }
    if (game.Jt.some(other => other !== enemy && !other.dead && !other.remove &&
        Math.abs(other.pos.y - to.y) < 1.5 && Math.hypot(other.pos.x - to.x, other.pos.z - to.z) < enemy.r + other.r + .1)) return false;
    enemy.act = a; enemy.vel.set(0, 0, 0); enemy.onGround = false; enemy.atkT = 0;
    stats[edge.kind === 6 ? 'jumps' : 'drops']++; return true;
  }
  // Highest surface under a point, if it is a real drop (at least 1.5 m below the lower end).
  function floorBelow(p, limit) {
    let best = null;
    for (const b of runtime.near(p.x, p.z, p.x, p.z)) {
      if (b.off || p.x < b.minX || p.x > b.maxX || p.z < b.minZ || p.z > b.maxZ) continue;
      if (b.maxY <= limit && (best === null || b.maxY > best)) best = b.maxY;
    }
    return best;
  }
  function failLeap(enemy, a) {
    const dx = a.tx - a.sx, dz = a.tz - a.sz, length = Math.hypot(dx, dz) || 1;
    enemy.act = null; enemy.onGround = false; enemy.navT = 0; enemy.edge = -1;
    enemy.vel.set(dx / length * 1.2, -1.5, dz / length * 1.2);
    stats.fellShort++;
  }
  // Applies to every gap jump, including the western district's authored ones. Pounce
  // lunges are attacks, not crossings, and stalkers are special; both are left alone.
  function loadLeap(enemy, a) {
    if (a.loaded) { if (a.failAt && a.t >= a.failAt) failLeap(enemy, a); return; }
    a.loaded = true;
    const load = leapLoad();
    if (!load || !active() || a.pounce || enemy.stalker) return;
    a.dur *= load.slow; a.wait = Math.max(a.wait || 0, .3); stats.slowedLeaps++;
    if (Math.random() >= load.fail) return;
    const at = .5 + Math.random() * .12, point = traversalPoint(a, at);
    // Only a real gap can swallow the jump: there must be ground well below both ends.
    const floor = floorBelow(point, Math.min(a.sy, a.ty) - 1.5);
    if (floor !== null && point.y - floor <= 16) a.failAt = at;
  }
  function beforeStep(enemy, dt) {
    if (enemy.act?.kind === 'leap') loadLeap(enemy, enemy.act);
    const a = enemy.act;
    if (a?.localTraversal) return;
    if (!a?.pursuitTraversal) return;
    const next = traversalPoint(a, Math.min(1, a.t + dt / a.dur));
    if (enemy.dead || enemy.stun > 0 || flashbang.blinded(enemy) || !landing({ x: a.tx, y: a.ty, z: a.tz }, enemy.r) || !climb.clearLine(enemy, enemy.pos, next)) {
      enemy.act = null; enemy.onGround = false; enemy.navT = 0; enemy.vel.set(0, 0, 0); stats.interrupted++;
    }
  }
  function queueDelay(enemy) {
    const plan=plans.get(enemy);let edge=edges[enemy.edge];
    for(let i=0;edge&&i<config.lookAhead;i++){
      if(edge.kind===5)return window.skyZombieLadders?.queueDelay(enemy,edge)||0;
      if(edge.kind!==0||!plan)break;
      edge=edges[bestEdge(edge.to,plan.field,plan.cost)];
    }
    return 0;
  }
  // Spread the first sweep of every leap/drop edge over idle time (the home screen, the first seconds of a run),
  // so the first path search of a run does not do all of them in one frame.
  let warmAt = 0, warmEpoch = -1;
  function warm(budgetMs = 3) {
    if (!active()) return true;
    if (warmEpoch !== cacheEpoch) { warmEpoch = cacheEpoch; warmAt = 0; }
    const begin = performance.now();
    while (warmAt < edges.length) {
      const edge = edges[warmAt++];
      if (edge.kind !== 6 && edge.kind !== 7) continue;
      if (owns(edge)) entryFor(edge);
      if ((warmAt & 15) === 0 && performance.now() - begin >= budgetMs) return false;
    }
    return true;
  }
  return { config, stats, owns, edgeCost, validateFresh: validate, warm, afterPick, waypoint, directChase, startTraversal, beforeStep, sweep, queueDelay };
}
