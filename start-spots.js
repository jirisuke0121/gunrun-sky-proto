// Start position: every run (Easy / Normal / Hard / Beginner) begins on a random high-ground spot of the old town,
// instead of one fixed street-level spot. The list is a fixed, measured set (docs/START_SPOTS_2026-11-05.md), not a live search.
//
// A spot is accepted when ALL of these held in the measurement (stationary invulnerable player, old town):
//   - high ground: standing height >= 4 m above the street, on a navigation node with 4+ exits, outdoors, stable after 1.5 s;
//   - the first chaser touches the player within 4.5-12 s on Normal and Hard (street start: 7.0-8.0 s Normal, 6.5-7.3 s Hard,
//     median over all runs >= 5 s), and within 5-16 s on Beginner (street start: 11-12 s);
//   - chasers do arrive (a spot nobody can reach is a safe island, not a start).
(function (root) {
  const CENTER = Object.freeze({ x: 0, z: -4 });
  const RULE = Object.freeze({ minY: 4, normalHard: [4.5, 12], intro: [5, 16], medianMin: 5 });
  // Engine XYZ, metres. Yaw faces the middle of the map so the first view shows the way down.
  const RAW = [
    { id: 'west-ledge', x: -37, y: 4.63, z: 0 },
    { id: 'west-mid', x: -28, y: 4.2, z: -11 },
    { id: 'far-west', x: -62, y: 5.5, z: 17 },
    { id: 'north-roof', x: -13, y: 8, z: -13 },
    { id: 'south-balcony', x: -4, y: 4, z: 17 },
    { id: 'north-mid', x: 5, y: 8, z: -13 },
    { id: 'east-high', x: 19, y: 9.3, z: -8 },
    { id: 'east-north', x: 34, y: 7.4, z: -14 },
    { id: 'east-mid', x: 35, y: 7, z: 0 },
    { id: 'far-east', x: 52, y: 9.48, z: -14 },
  ];
  const yawFacing = spot => {
    const dx = CENTER.x - spot.x, dz = CENTER.z - spot.z, length = Math.hypot(dx, dz) || 1;
    return Math.atan2(-dx / length, -dz / length);
  };
  const SPOTS = Object.freeze(RAW.map(spot => Object.freeze({ ...spot, yaw: +yawFacing(spot).toFixed(4) })));
  const byId = id => SPOTS.find(spot => spot.id === id) || null;

  // Never the same spot twice in a row, so a retry always shows something different.
  function choose(random = Math.random, previous = null) {
    const pool = SPOTS.filter(spot => spot.id !== previous);
    return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
  }

  // Off for: the canyon map, practice, owner replays, `?start=default`; and for automated browsers unless a test opts in
  // (`?random_start=1` or `?start_spot=<id>`), so the existing browser tests keep a fixed start.
  function enabled(env = root) {
    const params = new URLSearchParams(env.location?.search || '');
    if (env.SKY_CANYON_MAP || env.skyPracticeMode || env.skyOwnerReplay || params.has('practice')) return false;
    if (params.get('start') === 'default') return false;
    const automated = env.navigator?.webdriver === true;
    return !automated || params.get('random_start') === '1' || params.has('start_spot');
  }

  let last = null;
  // Called by the game when a run starts without an explicit start (null = use the ordinary start).
  function pick(env = root) {
    if (!enabled(env)) return null;
    const forced = byId(new URLSearchParams(env.location?.search || '').get('start_spot'));
    const spot = forced || choose(Math.random, last);
    last = spot.id;
    return { x: spot.x, y: spot.y, z: spot.z, yaw: spot.yaw };
  }

  const api = { SPOTS, RULE, CENTER, choose, enabled, pick, byId, yawFacing };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.skyStartSpots = api;
})(globalThis);
