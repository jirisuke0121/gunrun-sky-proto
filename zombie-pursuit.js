// Persistent pursuit replaces the retired sight-loss/search/patrol lifecycle.
// Navigation and climbing still use the real terrain; flashbangs and decoys
// keep their own temporary effects and never create a permanent escape state.
export function createZombiePursuit(game, runtime) {
  const stats = { escapes: 0, searches: 0, recycled: 0, reacquired: 0, dispatched: 0 };
  let tracked = new WeakSet();
  game.U.loseSight = game.Jn.loseSight = 0;
  for (const key of ['loseSight', 'loseDelay', 'senseT', 'sightR', 'hearR', 'gunHearR']) {
    document.getElementById('s_' + key)?.closest('.sl')?.setAttribute('hidden', '');
  }
  function observe(enemy) {
    // Saved settings and reset-to-default must not restore the retired mode.
    game.U.loseSight = 0;
    enemy.lost = false; enemy.seen = true; enemy.hideT = 0; enemy.lostT = 0;
    if (!tracked.has(enemy)) { tracked.add(enemy); stats.dispatched++; }
  }
  function reset() {
    tracked = new WeakSet();
    for (const key of Object.keys(stats)) stats[key] = 0;
    game.U.loseSight = 0;
  }
  return {
    config: Object.freeze({ persistent: true }), stats, observe, reset,
    pickEdge() { return false; },
    recoveryTarget() { return game.c; },
    recoveryField() { return runtime.FIELD; },
    suppressSpawns() { return false; },
    deferSpawn() { return false; },
    speed(enemy, speed) { return speed; },
    hearShot() {}, afterStep() {}, modeChanged() {},
    state(enemy) { return { phase: enemy.dead ? 'dead' : 'chase', remaining: 0,
      last: { x: game.c.pos.x, y: game.c.pos.y, z: game.c.pos.z }, target: game.c.node }; },
    get remaining() { return 0; },
  };
}
