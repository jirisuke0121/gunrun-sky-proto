import { FLASHBANG, flashCanReach } from './flashbang.js?v=20261113-viewport-v1';

// Teach Flash only after a real pursuer has moved toward the player, close
// enough for the native forward throw to stop it even when it is behind us.
export function createPursuit(targets) {
  return new Map(targets.map(enemy => [enemy, [enemy.pos.x, enemy.pos.z]]));
}
export function approachingPursuer(sky, targets, origins) {
  const c = sky.c;
  const origin = { x: c.pos.x, y: c.pos.y + Math.min(c.h * .7, 1.1), z: c.pos.z };
  return targets.find(enemy => {
    const start = origins?.get(enemy);
    if (!start || enemy.dead || enemy.remove || enemy.stun > 0 || Math.abs(enemy.pos.y - c.pos.y) > 1) return false;
    const dx = c.pos.x - enemy.pos.x, dz = c.pos.z - enemy.pos.z;
    const distance = Math.hypot(dx, dz);
    return distance <= FLASHBANG.radius / 2 &&
      Math.hypot(enemy.pos.x - start[0], enemy.pos.z - start[1]) >= (enemy.r || .3) &&
      enemy.vel.x * dx + enemy.vel.z * dz > 0 &&
      flashCanReach(origin, enemy, sky.raycast);
  });
}
