// Browser adaptation of the weapon modes in Easy Weapons/Weapon.cs.
// Unity prefabs provide the mode and timing; Air Corridor keeps its own damage scale.
import { createJumpGun } from './jump-gun.js?v=20261027-jump-power-v2';
export const UNITY_WEAPONS = Object.freeze({
  4: { kind: 'raycast', trigger: 'semi', rof: 12, pellets: 1, accuracy: 70, drop: 5, recovery: 3.5 },
  5: { kind: 'raycast', trigger: 'semi', rof: 2, pellets: 6, accuracy: 55, drop: 10, recovery: 1.5 },
  6: { kind: 'raycast', trigger: 'full', rof: 12, pellets: 1, accuracy: 80, drop: 8, recovery: 3 },
  7: { kind: 'projectile', trigger: 'full', rof: 3.5, speed: 90, accuracy: 90, drop: 8, recovery: 0.008 },
  8: { kind: 'beam', trigger: 'full', heatSeconds: 2, coolSeconds: 1, accuracy: 90 },
  9: { kind: 'projectile', trigger: 'full', rof: 2, speed: 26, gravity: 5, accuracy: 90 },
  10: { kind: 'projectile', trigger: 'full', rof: 2, speed: 42, gravity: 0, accuracy: 90 },
  11: { kind: 'projectile', trigger: 'warmup', rof: 3, speed: 24, gravity: 12, maxWarmup: 1.5, accuracy: 90 },
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smooth = (t) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };

// GunRunReloadMotion.Lowered, including its long middle hold.
export function reloadLowered(progress) {
  if (progress < 0.18) return smooth(progress / 0.18);
  if (progress < 0.72) return 1;
  return 1 - smooth((progress - 0.72) / 0.28);
}

export function createEasyWeaponPort(game) {
  const jumpGun=createJumpGun(game);
  window.skyJumpGun=jumpGun;
  const { U, Et, z, Jt, ue, Se, Geom } = game;
  const { Vector3, Mesh, Sphere, Basic, Line, BufferGeometry, Float32Attribute } = Geom;
  const missiles = [];
  const beamGeometry = new BufferGeometry();
  beamGeometry.setAttribute('position', new Float32Attribute(new Float32Array(6), 3));
  const beam = new Line(beamGeometry, new Basic({ color: 0x6beaff, transparent: true, opacity: 0.78, depthWrite: false }));
  beam.visible = false;
  beam.frustumCulled = false;
  ue.add(beam);
  let beamLife = 0, beamHeat = 0, beamCooling = 0;
  let chargeStarted = 0, chargeFraction = 1;
  let lastWeapon = -1;
  const accuracy = new Map();
  const accuracyFor = (weapon) => {
    if (!accuracy.has(weapon)) accuracy.set(weapon, UNITY_WEAPONS[weapon]?.accuracy || 100);
    return accuracy.get(weapon);
  };
  const spread = (weapon, direction) => {
    const config = UNITY_WEAPONS[weapon];
    if (!config || weapon === 5 || config.kind === 'beam') return;
    const variance = (100 - accuracyFor(weapon)) / 1000;
    direction.x += (Math.random() * 2 - 1) * variance;
    direction.y += (Math.random() * 2 - 1) * variance;
    direction.z += (Math.random() * 2 - 1) * variance;
    direction.normalize();
    accuracy.set(weapon, Math.max(0, accuracyFor(weapon) - (config.drop || 0)));
  };

  const active = (target) => target && !target.dead && target.spawnT <= 0;
  const hitEnemy = (hit, damage, direction, knock, stats, time, particles, hitFeedback) => {
    if (!hit || !active(hit.z)) return false;
    const enemy = hit.z;
    const horizontal = Math.hypot(direction.x, direction.z) || 1;
    enemy.gunT = time;
    enemy.hurt(damage, direction.x / horizontal, direction.z / horizontal, 0.5, knock);
    stats.hits++;
    const point = hit.point || new Vector3(enemy.pos.x, enemy.pos.y + 1.1, enemy.pos.z);
    particles(point.x, point.y, point.z, 7, 'blood', 2, 0.4);
    hitFeedback?.(!!hit.head);
    game.Tt.hit();
    return true;
  };
  const markBlast = (p, w, hits, direction) => {
    const point = [p.x, p.y, p.z].map((value) => +value.toFixed(2));
    document.body.dataset.skyBlast = JSON.stringify({ weapon: w.n, radius: w.explosive, hits, point });
    return window.__skyBlastFx?.(point, w.explosive, direction.toArray(), w.n) || false;
  };
  const impact = (shot, hit, barrel) => {
    const { w, position: point, direction, ctx } = shot;
    const { raycast, stats, particles, hitFeedback, knock } = ctx;
    if (barrel) window.skyBlastBarrels?.detonate(barrel.barrel);
    if (w.explosive) {
      let hits = 0;
      for (const enemy of Jt) {
        if (!active(enemy)) continue;
        const dx = enemy.pos.x - point.x, dy = enemy.pos.y + 1.1 - point.y, dz = enemy.pos.z - point.z;
        const distance = Math.hypot(dx, dy, dz);
        if (distance > w.explosive || distance < 0.001) continue;
        const clearOrigin = point.clone().addScaledVector(direction, -0.12);
        const clearVector = new Vector3(enemy.pos.x - clearOrigin.x, enemy.pos.y + 1.1 - clearOrigin.y, enemy.pos.z - clearOrigin.z);
        const clearDistance = clearVector.length();
        const blocked = raycast(clearOrigin.x, clearOrigin.y, clearOrigin.z, clearVector.x / clearDistance, clearVector.y / clearDistance, clearVector.z / clearDistance, Math.max(0.01, clearDistance - 0.35));
        if (blocked) continue;
        const falloff = 1 - 0.55 * distance / w.explosive;
        hits += +hitEnemy({ z: enemy, point: new Vector3(enemy.pos.x, enemy.pos.y + 1.1, enemy.pos.z) }, w.dmg * falloff, direction, knock * falloff, stats, z.t, particles, hitFeedback);
      }
      const explosionSoundPlayed = markBlast(point, w, hits, direction);
      // The Unity-style burst owns its dust layer; the older burst obscured it.
      if (!explosionSoundPlayed) game.Tt.bang(2);
    } else if (hit) hitEnemy(hit, w.dmg, direction, knock, stats, z.t, particles, hitFeedback);
    else particles(point.x, point.y, point.z, 6, 'dust', 2.2, 0.35);
    document.body.dataset.skyProjectile = JSON.stringify({ weapon: w.n, impact: point.toArray(), hits: stats.hits });
  };

  const fire = (ctx) => {
    const { weapon, w, origin, direction, raycast, zombieRay, barrel, stats, time, particles, hitFeedback, knock } = ctx;
    if(weapon===12)return jumpGun.fire(ctx);
    const config = UNITY_WEAPONS[weapon];
    if (!config) return null;
    if (config.kind === 'raycast' && weapon !== 5) return null;
    if (weapon === 5) {
      // Weapon.cs fires shotPerRound independent rays; one shell is consumed by the base game.
      let hits = 0;
      for (let pellet = 0; pellet < config.pellets; pellet++) {
        const dir = direction.clone();
        const variance = (100 - accuracyFor(weapon)) / 1000;
        dir.x += (Math.random() * 2 - 1) * variance;
        dir.y += (Math.random() * 2 - 1) * variance;
        dir.z += (Math.random() * 2 - 1) * variance;
        dir.normalize();
        accuracy.set(weapon, Math.max(0, accuracyFor(weapon) - config.drop));
        const wall = raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, w.range);
        const target = zombieRay(origin, dir, wall ? Math.min(w.range, wall.t) : w.range);
        if (target) hits += +hitEnemy(target, w.dmg * 0.6, dir, knock / config.pellets, stats, time, particles, hitFeedback);
      }
      if (barrel) window.skyBlastBarrels?.detonate(barrel.barrel);
      document.body.dataset.skyPellets = JSON.stringify({ count: config.pellets, hits });
      return { handled: true, suppressTracer: false };
    }
    if (config.kind === 'beam') {
      // Unity's beam spends heat while held and cools after the limit.
      Et.ammo = Math.min(Et.mag, Et.ammo + 1);
      Et.autoReload = 0;
      if (beamCooling > 0) return { handled: true, suppressTracer: true };
      const wall = raycast(origin.x, origin.y, origin.z, direction.x, direction.y, direction.z, w.range);
      const range = wall ? Math.min(w.range, wall.t) : w.range;
      const hit = zombieRay(origin, direction, range);
      const length = hit ? hit.t : range;
      const end = origin.clone().addScaledVector(direction, length);
      const visualOrigin = window.skyHumanView?.getMuzzleWorld?.() || window.skyFirstPersonView?.getMuzzleWorld() || origin;
      const positions = beamGeometry.getAttribute('position');
      positions.setXYZ(0, visualOrigin.x, visualOrigin.y, visualOrigin.z);
      positions.setXYZ(1, end.x, end.y, end.z);
      positions.needsUpdate = true;
      beam.visible = true; beamLife = 0.14;
      if (hit) hitEnemy(hit, w.dmg, direction, knock * 0.3, stats, time, particles, hitFeedback);
      beamHeat += w.cd;
      if (beamHeat >= config.heatSeconds) {
        beamCooling = config.coolSeconds;
        Et.fireCD = Math.max(Et.fireCD, config.coolSeconds);
      }
      document.body.dataset.skyBeam = JSON.stringify({ heat: +beamHeat.toFixed(2), cooling: +beamCooling.toFixed(2), visible: beam.visible });
      return { handled: true, suppressTracer: true };
    }
    if (config.kind !== 'projectile') return null;
    const power = weapon === 11 ? Math.max(0.35, chargeFraction) : 1;
    const radius = w.explosive ? 0.11 : 0.075;
    const color = weapon === 7 ? 0x8ceaff : weapon === 9 ? 0xffa44d : 0xffd271;
    const model = new Mesh(new Sphere(radius, 8, 6), new Basic({ color, transparent: true, opacity: 0.95 }));
    const position = origin.clone();
    const visualOrigin = window.skyHumanView?.getMuzzleWorld?.() || window.skyFirstPersonView?.getMuzzleWorld() || position.clone().addScaledVector(direction, .5);
    const visualOffset = visualOrigin.clone().sub(position);
    model.position.copy(visualOrigin);
    ue.add(model);
    const velocity = direction.clone().multiplyScalar(config.speed * power);
    missiles.push({ w, config, model, position, visualOffset, velocity, direction: direction.clone(), ctx, distance: 0, life: 4, barrel });
    document.body.dataset.skyProjectile = JSON.stringify({ weapon: w.n, spawned: position.toArray(), speed: +velocity.length().toFixed(1) });
    chargeFraction = 1;
    return { handled: true, suppressTracer: true };
  };

  const tick = (dt) => {
    jumpGun.tick(dt);
    const weapon = U.weapon | 0;
    if (weapon !== lastWeapon) {
      chargeStarted = 0;
      if (weapon !== 8) { beamHeat = 0; beamCooling = 0; beam.visible = false; }
      lastWeapon = weapon;
    }
    if (game.modeRef() === 'menu') accuracy.clear();
    if (game.modeRef() !== 'play' || z.over) {
      for (const shot of missiles) { ue.remove(shot.model); shot.model.geometry.dispose(); shot.model.material.dispose(); }
      missiles.length = 0; beam.visible = false; beamLife = 0; chargeStarted = 0;
      return;
    }
    if (beamCooling > 0) { beamCooling = Math.max(0, beamCooling - dt); if (!beamCooling) beamHeat = 0; }
    if (UNITY_WEAPONS[weapon]?.recovery) {
      const config = UNITY_WEAPONS[weapon];
      const current = accuracyFor(weapon);
      accuracy.set(weapon, current + (config.accuracy - current) * Math.min(1, config.recovery * dt));
      document.body.dataset.skyAccuracy = accuracy.get(weapon).toFixed(1);
    }
    beamLife = Math.max(0, beamLife - dt);
    if (!beamLife) beam.visible = false;
    if (weapon === 8) document.body.dataset.skyBeam = JSON.stringify({ heat: +beamHeat.toFixed(2), cooling: +beamCooling.toFixed(2), visible: beam.visible });
    if (weapon === 11) document.body.dataset.skyWarmup = (chargeStarted ? Math.min(1.5, (performance.now() - chargeStarted) / 1000) : 0).toFixed(2);
    for (let index = missiles.length - 1; index >= 0; index--) {
      const shot = missiles[index];
      const step = Math.min(dt, 0.05);
      const old = shot.position.clone();
      shot.velocity.y -= (shot.config.gravity || 0) * step;
      const movement = shot.velocity.clone().multiplyScalar(step);
      const distance = movement.length();
      if (distance < 0.001) continue;
      const dir = movement.normalize();
      const wall = shot.ctx.raycast(old.x, old.y, old.z, dir.x, dir.y, dir.z, distance);
      const target = shot.ctx.zombieRay(old, dir, wall ? Math.min(distance, wall.t) : distance);
      const barrel = window.skyBlastBarrels?.pickShot(old, dir, shot.w, (...args) => shot.ctx.raycast(...args));
      const barrelHit = barrel && barrel.t <= distance && (!wall || barrel.t < wall.t) && (!target || barrel.t < target.t);
      const reached = barrelHit || target || wall;
      const travel = barrelHit ? barrel.t : target ? target.t : wall ? wall.t : distance;
      shot.position.addScaledVector(dir, travel);
      shot.distance += travel; shot.life -= step;
      shot.model.position.copy(shot.position).addScaledVector(shot.visualOffset, Math.max(0, 1 - shot.distance / 2));
      if (reached || shot.distance >= shot.w.range || shot.life <= 0) {
        impact(shot, barrelHit ? null : target, barrelHit ? barrel : null);
        ue.remove(shot.model); shot.model.geometry.dispose(); shot.model.material.dispose();
        missiles.splice(index, 1);
      }
    }
  };
  const trigger = (held) => {
    if ((U.weapon | 0) !== 11 || game.modeRef() !== 'play' || z.over) return;
    if (held) {
      if (!chargeStarted && Et.reloadT <= 0 && Et.ammo > 0) chargeStarted = performance.now();
    } else if (chargeStarted) {
      chargeFraction = clamp((performance.now() - chargeStarted) / 1500, 0.35, 1);
      chargeStarted = 0;
      if (Et.fireCD <= 0 && Et.reloadT <= 0 && Et.ammo > 0) game.fireWeapon();
    }
    document.body.dataset.skyTrigger = JSON.stringify({ held, ammo: Et.ammo, fireCD: +Et.fireCD.toFixed(3), chargeFraction: +chargeFraction.toFixed(3) });
  };
  return { fire, tick, trigger, spread, allowBaseTrigger: (weapon) => weapon !== 11,
    get state() { return { missiles: missiles.length, beamHeat, beamCooling, charging: !!chargeStarted }; } };
}
