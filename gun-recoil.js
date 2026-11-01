// Angular recoil belongs to the shot, after aim assistance and before muzzle
// alignment. The automatic trigger waits for this same state to recover.
const PROFILES = Object.freeze({
  0: { gain: .34, recovery: 2.5, delay: .14, cone: .055, lift: .020, burst: 2, tap: .50 }, // HG
  2: { gain: .23, recovery: 2.3, delay: .13, cone: .065, lift: .024, burst: 3, tap: .46 }, // SMG
  3: { gain: .25, recovery: 2.0, delay: .15, cone: .070, lift: .026, burst: 3, tap: .50 }, // MG
  4: { gain: .32, recovery: 2.5, delay: .14, cone: .055, lift: .020, burst: 2, tap: .50 }, // pistol
  6: { gain: .24, recovery: 2.3, delay: .14, cone: .060, lift: .022, burst: 3, tap: .48 }, // rifle
});

export function createGunRecoil(game) {
  const { U, c, z, Se, Geom } = game;
  const states = new Map();
  const right = new Geom.Vector3(), up = new Geom.Vector3();
  const cross = document.querySelector('#hud .cross');
  const lock = document.getElementById('lockMk');
  let hudKey = '', autoMode = 'none';
  const stateFor = weapon => {
    if (!states.has(weapon)) states.set(weapon, { heat: 0, lastShot: -Infinity, count: 0, shots: 0 });
    return states.get(weapon);
  };

  function syncHud() {
    const weapon = U.weapon | 0, profile = PROFILES[weapon];
    const heat = profile && U.gunOn && game.modeRef() === 'play' && !z.over ? stateFor(weapon).heat : 0;
    const height = window.__VH?.() || innerHeight;
    const level = Math.round(heat * 40), key = `${weapon}:${level}:${Math.round(Se.fov * 10)}:${height}`;
    if (key === hudKey) return;
    hudKey = key;
    // Project the cone into screen pixels; zoom/viewport changes keep it honest.
    const fov = Se.getEffectiveFOV();
    const pixels = Math.tan((profile?.cone || 0) * (level / 40)) * height / (2 * Math.tan(fov * Math.PI / 360));
    cross?.style.setProperty('--gun-bloom', `${pixels.toFixed(1)}px`);
    cross?.style.setProperty('--gun-heat', (level / 40).toFixed(3));
    lock?.style.setProperty('--gun-bloom', `${pixels.toFixed(1)}px`);
  }

  function reset() {
    states.clear();
    autoMode = 'none'; hudKey = '';
    syncHud();
  }
  function modeChanged(mode) {
    if (mode === 'menu' || mode === 'over') reset();
    syncHud();
  }
  function tick(dt) {
    for (const [weapon, state] of states) {
      const profile = PROFILES[weapon];
      const age = Math.max(0, z.t - state.lastShot);
      const recoveryTime = Math.min(dt, Math.max(0, age - profile.delay));
      state.heat = Math.max(0, state.heat - recoveryTime * profile.recovery);
      if (state.heat === 0 && age > .5) state.count = 0;
    }
    syncHud();
  }

  function apply(weapon, direction) {
    const profile = PROFILES[weapon];
    if (!profile) return;
    const state = stateFor(weapon), heat = state.heat;
    // Sample a disk in the plane perpendicular to the actual aim direction.
    // World-axis noise would make recoil depend on which way the player faces.
    right.set(-direction.z, 0, direction.x);
    if (right.lengthSq() < .000001) right.set(1, 0, 0);
    else right.normalize();
    up.crossVectors(right, direction).normalize();
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(Math.random()) * profile.cone * heat;
    direction.addScaledVector(right, Math.cos(angle) * radius)
      .addScaledVector(up, Math.sin(angle) * radius + profile.lift * heat).normalize();
    state.heat = Math.min(1, heat + profile.gain);
    state.lastShot = z.t;
    state.count++;
    state.shots++;
    syncHud();
  }

  function canAutoFire(target) {
    const weapon = U.weapon | 0, profile = PROFILES[weapon];
    if (!profile) { autoMode = 'continuous'; return true; }
    const state = stateFor(weapon);
    const distance = Math.hypot(target.pos.x - c.pos.x, target.pos.y + 1.1 - (c.pos.y + 1.3), target.pos.z - c.pos.z);
    const age = z.t - state.lastShot;
    if (distance <= 7) { autoMode = 'continuous'; return true; }
    if (distance > 15) {
      autoMode = 'tap';
      return age >= profile.tap && state.heat <= .08;
    }
    autoMode = 'burst';
    // A new target does not erase recoil or restart a spent burst budget.
    if (state.count >= profile.burst || state.heat > .72) {
      if (age < .30 || state.heat > .12) return false;
      state.count = 0;
    }
    return true;
  }

  return { apply, tick, reset, modeChanged, canAutoFire,
    get state() {
      const weapon = U.weapon | 0, profile = PROFILES[weapon];
      const state = profile ? stateFor(weapon) : null;
      return { weapon, heat: state?.heat || 0, cone: (state?.heat || 0) * (profile?.cone || 0),
        shots: state?.shots || 0, burstCount: state?.count || 0, autoMode };
    },
  };
}
