// Local shortcuts on the authored graph. Every new flight uses the same
// trajectory for planning and execution, with a swept body and real landing.
export function traversalPoint(a, t) {
  const blend = v => v * v * (3 - 2 * v), mix = (x, y, v) => x + (y - x) * v;
  if (a.kind === 'leap') return { x: mix(a.sx, a.tx, t), y: mix(a.sy, a.ty, t) + a.arc * Math.sin(Math.PI * t), z: mix(a.sz, a.tz, t) };
  const across = Math.min(1, t / .25), fall = Math.max(0, (t - .25) / .75);
  return { x: mix(a.sx, a.tx, blend(across)), y: a.sy + .5 * Math.sin(Math.PI * across * .5) * (1 - fall) + (a.ty - a.sy) * fall * fall,
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
  let validated = new WeakMap(), doorKey = '', nextDoors = -Infinity, doorAt = -Infinity;
  const active = () => !game.z.mission;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const standing = { r: .3, h: 1.8 };
  function owns(edge) {
    if (!active() || !edge || ![6, 7].includes(edge.kind)) return false;
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
  function sweep(body, a) {
    const target = { x: a.tx, y: a.ty, z: a.tz };
    if (!landing(target, body.r) || !climb.clearLine(body, target, target)) return false;
    let previous = { x: a.sx, y: a.sy, z: a.sz };
    for (let i = 1; i <= 32; i++) {
      const next = traversalPoint(a, i / 32);
      if (!climb.clearLine(body, previous, next)) return false;
      previous = next;
    }
    return true;
  }
  function usable(edge) {
    const now = game.ceRef();
    if (now < doorAt || now >= nextDoors) {
      nextDoors = now + .25;
      const key = (runtime.DOORS || []).map(d => d.b.off ? 'o' : 'c').join('');
      if (key !== doorKey) { doorKey = key; validated = new WeakMap(); }
    }
    doorAt = now;
    if (validated.has(edge)) return validated.get(edge);
    const begin = performance.now(), from = nodes[edge.from], to = nodes[edge.to];
    let valid = !!from && !!to && (edge.kind === 6 ? edge.len <= config.jump && Math.abs(to.y - from.y) <= config.rise
      : edge.len <= config.dropAcross && from.y - to.y > .1 && from.y - to.y <= config.drop);
    if (valid) valid = landing(from) && sweep(standing, action({ ...from, y: from.y + .003 }, to, edge.kind));
    stats.checked++; stats.maxValidationMs = Math.max(stats.maxValidationMs, performance.now() - begin);
    validated.set(edge, valid); return valid;
  }
  function edgeCost(edge) {
    if (!owns(edge)) return null;
    if (runtime.INDOOR_ACCESS?.edgeAllowed && !runtime.INDOOR_ACCESS.edgeAllowed(edge, runtime.NAV)) return Infinity;
    if (!usable(edge)) return Infinity;
    const a = action(nodes[edge.from], nodes[edge.to], edge.kind);
    // Match movement time in the metre-scaled walking field, including the
    // take-off cue and the existing recovery after a higher drop.
    const load = edge.kind === 6 ? leapLoad() : null;
    // A failed leap costs about ten seconds of climbing back (60 in walking-field units).
    return (a.wait + a.dur * (load?.slow || 1) + (edge.kind === 7 ? .55 : 0)) * 6 + (load ? load.fail * 60 : 0) +
      (edge.jamT > game.ceRef() ? 80 : 0);
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
    if (!a?.pursuitTraversal) return;
    const next = traversalPoint(a, Math.min(1, a.t + dt / a.dur));
    if (enemy.dead || enemy.stun > 0 || flashbang.blinded(enemy) || !landing({ x: a.tx, y: a.ty, z: a.tz }, enemy.r) || !climb.clearLine(enemy, enemy.pos, next)) {
      enemy.act = null; enemy.onGround = false; enemy.navT = 0; enemy.vel.set(0, 0, 0); stats.interrupted++;
    }
  }
  return { config, stats, owns, edgeCost, afterPick, waypoint, directChase, startTraversal, beforeStep, sweep };
}
