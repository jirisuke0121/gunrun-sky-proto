// Spawn gate: a normal respawn must be able to reach the player in reasonable time.
// Measured on natural respawns (stationary player, both maps, fixed seeds): the walking cost from the
// spawn point to the player (the same field zombies follow) predicts the arrival time (r = 0.72).
// Spawns with a cost over ~60, or far more than the straight distance, took 20-45 s (mean 28 s) against
// 9 s for the rest; their costs sit in a gap above the usual 25-48. Such points are refused, and the
// existing retry loops (surge) or the next pace tick pick another spot.
(function (root) {
  const LIMIT = Object.freeze({ cost: 60, ratio: 1.6, slack: 8 });
  // Sunken pits below the ground level: every respawn there took 14-53 s to climb out (7-9 s elsewhere).
  const PIT_Y = -2;
  // Only ordinary spawns are gated; ambush/guard/squeeze/stalker anchors are placed by their own lead rules.
  const GATED = new Set(['', 'drop', 'surge']);
  // 'origin' is the take-off/emerge point of a spawn (often in the air), checked separately from the landing point.
  function reachable(cost, straight) {
    return Number.isFinite(cost) && cost <= LIMIT.cost && cost <= LIMIT.ratio * Math.max(0, straight) + LIMIT.slack;
  }
  function allows(point, kind, game = root.__game) {
    if (!GATED.has(kind || '') || !game?.FIELD || !game.nodeAt || !game.P) return true;
    // The opening wave is spawned while the start screen is still closing, so the mode is not checked;
    // the field only has to have been built for the player's current surroundings.
    if (!(game.FIELD[game.P.node] < Infinity)) return true;
    if (point.y < PIT_Y && game.P.pos.y > PIT_Y) return false;
    const node = game.nodeAt(point.x, point.y + 0.1, point.z);
    // A zombie placed off the walking graph has no route and would stand there for the whole run.
    if (!(node >= 0)) return false;
    return reachable(game.FIELD[node], Math.hypot(point.x - game.P.pos.x, point.z - game.P.pos.z));
  }
  const api = { LIMIT, PIT_Y, reachable, allows };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.skySpawnReach = api;
})(globalThis);
