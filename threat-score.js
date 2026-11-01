// Shared arithmetic and simulation-only tracker. Rendering never awards points.
(function (root) {
  const config = Object.freeze({ radius: 18, routeLimit: 26, heightLimit: 3,
    perSecond: 120, maxPressure: 3, perDamage: 2, perKill: 100,
    sample: .15, campGrace: 8, campLimit: 20, escapeCharge: 3, escapeQuiet: 2 });
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  function evaluate(seconds, kills, difficulty, earned = {}) {
    const elapsed = clamp(Number(seconds) || 0, 0, 120);
    const factor = 1 + clamp(difficulty | 0, 0, 2) * .1;
    const pressureSeconds = clamp(Number(earned.pressureSeconds) || 0, 0, elapsed * config.maxPressure);
    const damageUnits = Math.max(0, Number(earned.damageUnits) || 0);
    const survival = Math.floor(pressureSeconds * config.perSecond * factor + 1e-7);
    const damage = Math.floor(damageUnits * config.perDamage * factor + 1e-7);
    const kill = Math.floor(Math.max(0, kills | 0) * config.perKill * factor + 1e-7);
    return { elapsed, kills: Math.max(0, kills | 0), difficulty: factor, pressureSeconds,
      chasedSeconds: clamp(earned.chasedSeconds || 0, 0, elapsed), damageUnits,
      survival, damage, kill, total: survival + damage + kill,
      scoring: 'threat-survival-v1', bonus: 0, fellExtra: 0, shake: 0 };
  }
  function createTracker(game, runtime, onEscape = () => {}) {
    let pressureSeconds = 0, chasedSeconds = 0, damageUnits = 0, count = 0, pressure = 0;
    let rate = 0, motion = 0, repetition = 1, previous, last = 0, accumulator = 0;
    let charge = 0, quiet = 0, cooldown = 0, cohort = new Set();
    const visits = new Map();
    const alive = e => !e.dead && !e.remove;
    function nearbyWeight(e) {
      if (!alive(e)) return 0;
      const p = game.c.pos, dx = p.x - e.pos.x, dy = p.y - e.pos.y, dz = p.z - e.pos.z;
      const distance = Math.hypot(dx, dy, dz);
      if (distance > config.radius || Math.abs(dy) > config.heightLimit) return 0;
      const route = e.node >= 0 ? runtime.FIELD[e.node] : Infinity;
      // Reuse the native field and sight for both scoring and actual separation.
      if (!Number.isFinite(route) || route > config.routeLimit || route > distance * 2 + 4) return 0;
      if (distance > .1 && game.raycast(e.pos.x, e.pos.y + 1.1, e.pos.z,
          dx / distance, dy / distance, dz / distance, Math.max(0, distance - .15))) return 0;
      return .4 + .6 * (1 - distance / config.radius);
    }
    function threats() {
      let sum = 0; count = 0;
      for (const e of game.Jt) {
        if (!alive(e) || e.rise || e.fall || e.spawnT > 0 || e.stun > .15 ||
            game.searchNav?.decoyTarget?.(e) || root.skyFlashbang?.blinded?.(e)) continue;
        const weight = nearbyWeight(e); if (!weight) continue;
        count++; sum += weight; cohort.add(e);
      }
      return Math.min(config.maxPressure, sum);
    }
    function step(dt) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      accumulator += Math.min(dt, .25);
      if (accumulator + 1e-8 < config.sample) return;
      const span = accumulator; accumulator = 0;
      const p = game.c.pos;
      const moved = previous ? Math.hypot(p.x - previous.x, p.y - previous.y, p.z - previous.z) : 0;
      previous = { x: p.x, y: p.y, z: p.z };
      const speed = moved / span;
      // Stopping or respawning must stop scoring immediately. Smoothing only
      // applies while actually moving, never as residual credit while idle.
      if (speed <= .5 || speed >= 30) motion = 0;
      else motion += (clamp((speed - .5) / 2, 0, 1) - motion) * (1 - Math.exp(-span * 6));
      const x = Math.floor(p.x / 8), y = Math.floor(p.y / 4), z = Math.floor(p.z / 8);
      const key = `${x},${y},${z}`, spent = visits.get(key) || 0;
      repetition = clamp((config.campLimit - spent) / (config.campLimit - config.campGrace), 0, 1);
      pressure = threats(); cooldown = Math.max(0, cooldown - span);
      const vulnerable = !['swing', 'ledge'].includes(game.c.state) &&
        !(game.c.invuln > game.ceRef()) && speed < 30;
      // Charge neighbouring cells too: crossing a grid boundary, escaping and
      // reacquiring, or killing a pursuer never resets the small-loop budget.
      // Only spend it while movement can actually earn evasion points. Quiet
      // waiting, hanging and invulnerability must not penalize a later chase.
      if (pressure > 0 && vulnerable && motion > 0) {
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let h = -1; h <= 1; h++) {
          const k = `${x+a},${y+h},${z+b}`; visits.set(k, (visits.get(k) || 0) + span);
        }
      }
      const weight = vulnerable ? motion * repetition : 0;
      rate = pressure * config.perSecond * weight;
      pressureSeconds += pressure * weight * span;
      if (pressure > 0) {
        if (vulnerable) { chasedSeconds += span; charge += span; }
        quiet = 0;
      } else {
        // A temporarily stunned/distracted pursuer still beside the player is
        // not an escape. It must actually leave the nearby reachable area.
        quiet = [...cohort].some(e => nearbyWeight(e) > 0) ? 0 : quiet + span;
        if (quiet >= config.escapeQuiet) {
          // Killing every close pursuer is a kill, not a second escape award.
          if (charge >= config.escapeCharge && cooldown <= 0 && [...cohort].some(alive)) {
            onEscape(); cooldown = 8;
          }
          charge = 0; cohort.clear();
        }
      }
      last = game.z.t;
    }
    return { step,
      damaged(amount) { if (Number.isFinite(amount) && amount > 0) damageUnits += amount; },
      snapshot() { return { pressureSeconds, chasedSeconds, damageUnits, count, pressure, rate, repetition, last }; },
    };
  }
  const api = { config, evaluate, createTracker };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.skyThreatScore = api;
})(globalThis);
