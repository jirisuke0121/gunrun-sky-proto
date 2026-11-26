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

// Knock-off near a ledge. One pistol hit slides a zombie about 1.9 m (measured 11/26, tools/high-ground-knockoff.cjs),
// so a zombie that has just climbed up stays on the roof unless it was hit within ~1.5 m of the lip: in the measurement
// only 6% of hits from high ground ended in a hurting fall. When the push points at a drop of more than 1.5 m within
// `reach` and nothing solid is in the way, the push is raised just enough to carry it over the lip (at most `maxMul`
// times the hit's own push). Away from ledges nothing changes.
export const EDGE = Object.freeze({
  reach: 2.6,          // m: lips farther than this along the push are left alone
  minDrop: 1.5,        // m: only a drop that would hurt (FALL.free) counts as a lip
  clear: .5,           // m: carry this far past the lip
  slidePerKnock: .24,  // m of slide per 1 m/s of push (1.88 m at 7.8, linear in the measurement)
  maxMul: 2,
});

// Distance along (dx, dz) to the first point with no floor within `minDrop` below, or null (wall first, or no lip in reach).
export function lipAhead(x, y, z, dx, dz, raycast, free, cfg = EDGE) {
  for (let d = .2; d <= cfg.reach + 1e-6; d += .2) {
    const px = x + dx * d, pz = z + dz * d;
    if (free && !free(px, y + .3, pz, .25, 1.4)) return null;
    if (!raycast(px, y + .4, pz, 0, -1, 0, cfg.minDrop + .4)) return d;
  }
  return null;
}

// Damage in health points, as a share of the zombie's full health: 0 at `free`, all of it at `lethal`.
export function fallDamage(drop, maxHealth, cfg = FALL) {
  if (!(drop > cfg.free) || !(maxHealth > 0)) return 0;
  return maxHealth * Math.min(1, (drop - cfg.free) / (cfg.lethal - cfg.free));
}

export function createZombieFall(game, cfg = FALL, edge = EDGE) {
  const stats = { knocked: 0, damaged: 0, killed: 0, maxDrop: 0, lastDrop: 0, carried: 0 };
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
  // Carry a knocked zombie over a near lip (see EDGE). Only for the gun/kick push (r > 0) on a living, ordinary zombie.
  const raycast = game.raycast, free = game.oe, hurt = proto.hurt;
  if (raycast && hurt) proto.hurt = function hurtWithLedge(t, e, i, s, r) {
    const alive = !this.dead;
    hurt.call(this, t, e, i, s, r);
    if (!alive || !(r > 0) || this.stalker || this.remove || !Number.isFinite(e) || !Number.isFinite(i)) return;
    const h = Math.hypot(e, i); if (h < .5) return;
    const dx = e / h, dz = i / h, lip = lipAhead(this.pos.x, this.pos.y, this.pos.z, dx, dz, raycast, free, edge);
    if (lip == null) return;
    const need = (lip + edge.clear) / edge.slidePerKnock, extra = Math.min(r * edge.maxMul, need) - r;
    if (extra <= 0) return;
    this.vel.x += dx * extra; this.vel.z += dz * extra; stats.carried++;
  };
  proto.update = function updateWithFallDamage(dt) {
    const beforeY = this.pos.y;
    original.call(this, dt);
    step(this, beforeY);
  };
  return { config: cfg, stats, step };
}
