// Shared time/combat arithmetic. Pursuit detection only triggers presentation.
(function (root) {
  const config = Object.freeze({ radius: 18, routeLimit: 26, heightLimit: 3,
    perSecond: 100 / 30, interval: 30, perDamage: 2, perKill: 30,
    sample: .15, escapeCharge: 3, escapeQuiet: 2 });
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  function evaluate(seconds, kills, difficulty, earned = {}) {
    const elapsed = clamp(Number(seconds) || 0, 0, 120);
    const factor = 1 + clamp(difficulty | 0, 0, 2) * .1;
    const damageUnits = Math.max(0, Number(earned.damageUnits) || 0);
    const survival = Math.floor(elapsed * config.perSecond * factor + 1e-7);
    const damage = Math.floor(damageUnits * config.perDamage * factor + 1e-7);
    const kill = Math.floor(Math.max(0, kills | 0) * config.perKill * factor + 1e-7);
    // Survival points are paid out every `interval` seconds (interval x perSecond x factor
    // each) as a presentation milestone. The authoritative `survival` stays the continuous
    // value above so totals, records and the server check are unchanged; the part of the
    // current interval not yet paid out is `remainder` and is settled when the run ends.
    const ticks = Math.floor(elapsed / config.interval + 1e-9);
    const tickPoints = Math.floor(config.interval * config.perSecond * factor + 1e-7);
    const ticked = Math.min(survival, ticks * tickPoints);
    return { elapsed, kills: Math.max(0, kills | 0), difficulty: factor, damageUnits,
      survival, damage, kill, total: survival + damage + kill,
      interval: config.interval, ticks, tickPoints, ticked, remainder: survival - ticked,
      live: ticked + damage + kill,
      scoring: 'time-survival-v3', bonus: 0, fellExtra: 0, shake: 0 };
  }
  function createTracker(game, runtime, onEscape = () => {}) {
    let damageUnits = 0, count = 0, last = 0, accumulator = 0;
    let charge = 0, quiet = 0, cooldown = 0, cohort = new Set();
    const alive = e => !e.dead && !e.remove;
    function nearby(e) {
      if (!alive(e)) return 0;
      const p = game.c.pos, dx = p.x - e.pos.x, dy = p.y - e.pos.y, dz = p.z - e.pos.z;
      const distance = Math.hypot(dx, dy, dz);
      if (distance > config.radius || Math.abs(dy) > config.heightLimit) return 0;
      const route = e.node >= 0 ? runtime.FIELD[e.node] : Infinity;
      // Reuse the native field and sight only to detect actual separation.
      if (!Number.isFinite(route) || route > config.routeLimit || route > distance * 2 + 4) return 0;
      if (distance > .1 && game.raycast(e.pos.x, e.pos.y + 1.1, e.pos.z,
          dx / distance, dy / distance, dz / distance, Math.max(0, distance - .15))) return 0;
      return 1;
    }
    function nearbyChasers() {
      count = 0;
      for (const e of game.Jt) {
        if (!alive(e) || e.rise || e.fall || e.spawnT > 0 || e.stun > .15 ||
            game.searchNav?.decoyTarget?.(e) || root.skyFlashbang?.blinded?.(e)) continue;
        if (!nearby(e)) continue;
        count++; cohort.add(e);
      }
      return count;
    }
    function step(dt) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      accumulator += Math.min(dt, .25);
      if (accumulator + 1e-8 < config.sample) return;
      const span = accumulator; accumulator = 0;
      const nearbyCount = nearbyChasers(); cooldown = Math.max(0, cooldown - span);
      const vulnerable = !['swing', 'ledge'].includes(game.c.state) &&
        !(game.c.invuln > game.ceRef());
      if (nearbyCount > 0) {
        if (vulnerable) charge += span;
        quiet = 0;
      } else {
        // A temporarily stunned/distracted pursuer still beside the player is
        // not an escape. It must actually leave the nearby reachable area.
        quiet = [...cohort].some(e => nearby(e) > 0) ? 0 : quiet + span;
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
      snapshot() { return { damageUnits, count, last }; },
    };
  }
  const api = { config, evaluate, createTracker };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.skySurvivalScore = api;
})(globalThis);
