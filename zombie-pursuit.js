// Persistent pursuit replaces the retired sight-loss/search/patrol lifecycle.
// Navigation and climbing still use the real terrain; flashbangs and decoys
// keep their own temporary effects and never create a permanent escape state.
export function createZombiePursuit(game, runtime) {
  const stats = { escapes: 0, searches: 0, recycled: 0, reacquired: 0, dispatched: 0, stalls: 0 };
  let tracked = new WeakSet();
  game.U.loseSight = game.Jn.loseSight = 0;
  for (const key of ['loseSight', 'loseDelay', 'senseT', 'sightR', 'hearR', 'gunHearR']) {
    document.getElementById('s_' + key)?.closest('.sl')?.setAttribute('hidden', '');
  }
  // A zombie that bounces between two path nodes in front of an obstacle never trips the per-edge "no progress" check
  // (the edge keeps changing), so it stood there for 30 s or more. If it has not moved STALL.radius in STALL.seconds
  // while it is simply walking toward the player, every edge it tried is closed for STALL.jam seconds and it re-routes.
  const STALL = Object.freeze({ seconds: 3, radius: 1.5, jam: 20, nearPlayer: 3 });
  const stalls = new WeakMap();
  function walking(enemy) {
    return !enemy.dead && !enemy.remove && enemy.spawnT <= 0 && enemy.onGround && !enemy.act && !enemy.rise && !enemy.fall &&
      !(enemy.stun > 0) && !enemy.guard && !enemy.bash && enemy.node >= 0 && !window.skyFlashbang?.blinded?.(enemy) &&
      !window.skyDecoy?.targetFor?.(enemy) && !window.skyZombieLadders?.state?.(enemy)?.queued &&
      (Math.hypot(enemy.pos.x - game.c.pos.x, enemy.pos.z - game.c.pos.z) > STALL.nearPlayer ||
        window.skyZombieRouting?.directChase?.(enemy, game.c.pos) === false);
  }
  function watchStall(enemy, dt) {
    let state = stalls.get(enemy);
    if (!walking(enemy) || !Number.isFinite(dt)) { if (state) stalls.delete(enemy); return; }
    if (!state) { state = { x: enemy.pos.x, z: enemy.pos.z, time: 0, edges: new Set() }; stalls.set(enemy, state); }
    if (Math.hypot(enemy.pos.x - state.x, enemy.pos.z - state.z) >= STALL.radius) {
      state.x = enemy.pos.x; state.z = enemy.pos.z; state.time = 0; state.edges.clear(); return;
    }
    state.time += Math.min(dt, .25); if (enemy.edge >= 0) state.edges.add(enemy.edge);
    if (state.time < STALL.seconds) return;
    const until = game.ceRef() + STALL.jam;
    for (const edge of state.edges) runtime.jamNavigationEdge?.(edge, until);
    enemy.edge = -1; enemy.navT = 0; state.time = 0; state.edges.clear(); stats.stalls++;
  }
  function observe(enemy, dt) {
    // Saved settings and reset-to-default must not restore the retired mode.
    game.U.loseSight = 0;
    enemy.lost = false; enemy.seen = true; enemy.hideT = 0; enemy.lostT = 0;
    if (!tracked.has(enemy)) { tracked.add(enemy); stats.dispatched++; }
    watchStall(enemy, dt);
  }
  function reset() {
    tracked = new WeakSet();
    for (const key of Object.keys(stats)) stats[key] = 0;
    game.U.loseSight = 0;
  }
  return {
    config: Object.freeze({ persistent: true, stall: STALL }), stats, observe, reset,
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
