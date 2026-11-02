// Opening wave: the first zombies come down from the central high ground (a look the player sees from the start),
// as droppers that jump down instead of walking the long way round (high-ground respawns otherwise took 17-47 s,
// median 35.6 s, against 10 s elsewhere). The rest of the opening wave and all later respawns use the normal choosers.
(function (root) {
  // maxCost: only high-ground spots with a short walk down (the south/west edge); the far side of the roof is a 90-100 walk
  // because its edges have no usable drop, which is what made the first measurement take 17-47 s.
  const AREA = Object.freeze({ minY: 7, maxY: 9.5, radius: 20, minDistance: 20, maxDistance: 45, apart: 6, maxCost: 60 });
  // How many of the opening zombies come from the high ground: 2 when there are 4+, otherwise 1 (never all of them).
  const highCount = total => (total >= 4 ? 2 : total >= 2 ? 1 : 0);
  const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  // Pure choice among candidate nodes; `ok` adds the game's own checks (reachable, outdoors).
  function pick(nodes, player, taken, random, ok = () => true) {
    const list = nodes.filter(n => n.y >= AREA.minY && n.y <= AREA.maxY && Math.hypot(n.x, n.z) <= AREA.radius &&
      distance(n, player) >= AREA.minDistance && distance(n, player) <= AREA.maxDistance &&
      taken.every(t => distance(t, n) >= AREA.apart) && ok(n));
    return list.length ? list[Math.floor(random() * list.length)] : null;
  }
  const taken = [];
  function begin() { taken.length = 0; }
  // Returns true when this opening zombie was placed on the high ground (the caller spawns it normally otherwise).
  function spawn(index, total, game = root.__game, challenge = root.skyChallenge) {
    if (!game?.NAV || !game.P || !game.Zombie || !challenge?.profile?.() || index >= highCount(total)) return false;
    const { nodes, out } = game.NAV;
    const node = pick(nodes, game.P.pos, taken, Math.random, n => out[n.id].length >= 3 && game.FIELD[n.id] <= AREA.maxCost &&
      root.skyIndoorAccess?.allows?.(n) !== false);
    if (!node) return false;
    const point = { x: node.x, y: node.y + 0.01, z: node.z };
    if (!challenge.spawnAllowed(point, 'opening') || !challenge.reserve()) return false;
    const zombie = new game.Zombie(point.x, point.y, point.z);
    zombie.dropper = true; zombie.flank = false; zombie.born = 'opening';
    game.zombies.push(zombie); taken.push(node);
    return true;
  }
  const api = { AREA, highCount, pick, begin, spawn };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.skyOpeningWave = api;
})(globalThis);
