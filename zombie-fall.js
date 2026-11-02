// Fall damage for zombies that were knocked off a ledge. A zombie that walks, jumps,
// drops or climbs down by itself takes nothing: only a fall that begins while it is
// being knocked back (stunned, or hit a moment ago) is punished, in proportion to the
// height. That keeps high ground worth holding even though zombies may now climb and
// drop almost anywhere.
export const FALL = Object.freeze({
  free: 1.5,         // m: no damage up to this drop
  lethal: 4.5,       // m: a full-health zombie dies from this drop or more
  grace: .8,         // s: a hit this recent still counts as "knocked" at take-off
  stun: .45,         // s: landing stun for any damaging fall
  stunPerMetre: .12, // s per metre of drop
  maxStun: 1.2,
});

// Damage in health points, as a share of the zombie's full health: 0 at `free`, all of it at `lethal`.
export function fallDamage(drop, maxHealth, cfg = FALL) {
  if (!(drop > cfg.free) || !(maxHealth > 0)) return 0;
  return maxHealth * Math.min(1, (drop - cfg.free) / (cfg.lethal - cfg.free));
}

export function createZombieFall(game, cfg = FALL) {
  const stats = { knocked: 0, damaged: 0, killed: 0, maxDrop: 0, lastDrop: 0 };
  const flights = new WeakMap();
  const maxHealth = zombie => zombie.maxHp ||
    (window.skyChallenge?.value?.('zombieHealth', game.U?.zombieHealth) ?? game.U?.zombieHealth) || zombie.hp;

  function step(zombie, beforeY) {
    // Scripted moves (jumps, drops, ladders, wall climbs, spawns) set the position
    // directly; they are never a knocked fall, and a hit during one ends that move.
    if (zombie.dead || zombie.remove || zombie.stalker || zombie.act || zombie.rise || zombie.fall) {
      flights.delete(zombie); return;
    }
    let flight = flights.get(zombie);
    if (!zombie.onGround) {
      if (!flight) {
        flights.set(zombie, {
          peak: Math.max(beforeY, zombie.pos.y),
          knocked: zombie.stun > 0 || game.z.t - zombie.lastHitT < cfg.grace,
        });
      } else flight.peak = Math.max(flight.peak, zombie.pos.y);
      return;
    }
    if (!flight) return;
    flights.delete(zombie);
    const drop = flight.peak - zombie.pos.y;
    stats.lastDrop = drop; stats.maxDrop = Math.max(stats.maxDrop, drop);
    if (!flight.knocked) return;
    stats.knocked++;
    const damage = fallDamage(drop, maxHealth(zombie), cfg);
    if (damage <= 0) return;
    stats.damaged++;
    const wasAlive = !zombie.dead;
    // hurt() scores the damage, starts the usual hit reaction and kills at 0 health.
    zombie.hurt(damage, 0, 0, Math.min(cfg.maxStun, cfg.stun + cfg.stunPerMetre * drop), 0);
    zombie.vel.y = Math.min(zombie.vel.y, 0);
    game.Tt?.thud?.(Math.min(1, .5 + damage / maxHealth(zombie)), 0);
    if (wasAlive && zombie.dead) stats.killed++;
  }

  const proto = game.ri.prototype, original = proto.update;
  proto.update = function updateWithFallDamage(dt) {
    const beforeY = this.pos.y;
    original.call(this, dt);
    step(this, beforeY);
  };
  return { config: cfg, stats, step };
}
