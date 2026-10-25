// Browser rendering of the Easy Weapons Rocket -> Explosion Player prefab.
// The prefab has an immediate Flame Burst, delayed Dust, Smoking Debris,
// Smoking Ball, and a 0.1-second warm light. Geometry is pooled for WebGL.
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function particleTexture(THREE, innerAlpha) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 1, 32, 32, 31);
  gradient.addColorStop(0, `rgba(255,255,255,${innerAlpha})`);
  gradient.addColorStop(0.22, `rgba(255,255,255,${innerAlpha * 0.82})`);
  gradient.addColorStop(0.56, `rgba(255,255,255,${innerAlpha * 0.35})`);
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

export function createUnityExplosionFx(THREE, scene, player) {
  document.body.dataset.skyExplosionRevision = 'unity-blast-v9';
  const flameTexture = particleTexture(THREE, 1);
  const smokeTexture = particleTexture(THREE, 0.8);
  const debrisGeometry = new THREE.Box(0.12, 0.12, 0.24);
  const origin = new THREE.Vector3();
  const flashColors = [0xffaa30, 0xff6917, 0xe03810, 0x9c2512];
  const makeSprite = (texture, color, depthTest) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture, color, transparent: true, opacity: 0,
      depthWrite: false, depthTest,
      blending: 1,
    }));
    sprite.visible = false;
    sprite.renderOrder = depthTest ? 3 : 5;
    scene.add(sprite);
    return sprite;
  };
  const pool = Array.from({ length: 6 }, () => {
    const flames = Array.from({ length: 18 }, (_, index) => ({
      sprite: makeSprite(flameTexture, flashColors[index % flashColors.length], false),
      velocity: new THREE.Vector3(), offset: new THREE.Vector3(), size: 1, delay: 0,
    }));
    const dust = Array.from({ length: 10 }, () => ({
      sprite: makeSprite(smokeTexture, 0x757474, false),
      velocity: new THREE.Vector3(), offset: new THREE.Vector3(), size: 1, delay: 0,
    }));
    const smokingBall = Array.from({ length: 5 }, () => ({
      sprite: makeSprite(smokeTexture, 0x343536, true),
      velocity: new THREE.Vector3(), offset: new THREE.Vector3(), size: 1, delay: 0,
    }));
    const debris = Array.from({ length: 12 }, (_, index) => {
      const mesh = new THREE.Mesh(debrisGeometry, new THREE.Basic({
        color: index % 3 === 0 ? 0xffae4d : 0x534d45,
      }));
      mesh.visible = false;
      scene.add(mesh);
      return { mesh, velocity: new THREE.Vector3(), delay: 0 };
    });
    const light = new THREE.PointLight(0xffd661, 0, 10);
    scene.add(light);
    return { flames, dust, smokingBall, debris, light,
      origin: new THREE.Vector3(), t: 5, scale: 1 };
  });
  let next = 0;

  function burst(point, radius, direction, weapon) {
    const effect = pool[next++ % pool.length];
    effect.t = 0;
    effect.scale = clamp((radius || 4) / 4, 0.75, 1.25);
    const backward = new THREE.Vector3(...direction).normalize();
    effect.origin.set(...point).addScaledVector(backward, -0.8);
    effect.light.position.copy(effect.origin);
    effect.light.intensity = 0.4;
    const scatter = (item, speed, spread, delay = 0) => {
      const angle = Math.random() * Math.PI * 2;
      const v = speed * (0.55 + Math.random() * 0.9);
      item.velocity.set(Math.cos(angle) * v, v * (0.15 + Math.random() * 0.55), Math.sin(angle) * v);
      if (item.offset) item.offset.set(
        Math.cos(angle) * spread * (0.45 + Math.random()),
        (Math.random() - 0.35) * spread,
        Math.sin(angle) * spread * (0.45 + Math.random()),
      );
      item.delay = delay;
      item.size = 0.8 + Math.random() * 0.5;
      const object = item.sprite || item.mesh;
      object.position.copy(effect.origin);
      object.visible = false;
    };
    effect.flames.forEach((item, index) => scatter(item, 1.4, 0.55, index % 5 * 0.025));
    effect.dust.forEach((item, index) => scatter(item, 0.55, 0.8, 0.22 + index % 4 * 0.04));
    effect.smokingBall.forEach((item, index) => scatter(item, 0.7, 0.4, 0.08 + index * 0.07));
    effect.debris.forEach((item, index) => scatter(item, 6 + Math.random() * 6, 0,
      index < 6 ? 0 : index < 8 ? 0.1 : 0.18));
    origin.copy(effect.origin);
    const distance = origin.distanceTo(player.pos);
    if (distance < 13) player.shake = Math.max(player.shake || 0, 0.48 * (1 - distance / 16));
    document.body.dataset.skyBlastEffect = JSON.stringify({
      point, radius, weapon, style: 'Unity Explosion Player',
      layers: ['Flame Burst', 'Dust', 'Smoking Debris', 'Smoking Ball', 'Explosion Light'],
    });
  }

  function step(dt) {
    for (const effect of pool) {
      if (effect.t >= 4.6) continue;
      effect.t = Math.min(4.6, effect.t + dt);
      const t = effect.t, s = effect.scale;
      effect.light.intensity = 0.4 * Math.max(0, 1 - t / 0.1);
      for (const item of effect.flames) {
        const age = t - item.delay;
        item.sprite.visible = age >= 0 && age < 0.95;
        if (!item.sprite.visible) continue;
        const k = age / 0.95;
        item.sprite.position.copy(effect.origin).add(item.offset).addScaledVector(item.velocity, age);
        item.sprite.position.y += 0.35 * age;
        const size = (1.1 + 1.8 * k) * item.size * s;
        item.sprite.scale.set(size, size, 1);
        item.sprite.material.opacity = 0.35 * (1 - k) ** 1.2;
      }
      for (const item of effect.dust) {
        const age = t - item.delay;
        item.sprite.visible = age >= 0 && age < 4.25;
        if (!item.sprite.visible) continue;
        const k = age / 4.25;
        item.sprite.position.copy(effect.origin).add(item.offset).addScaledVector(item.velocity, age);
        item.sprite.position.y += 0.18 * age;
        const size = (1.9 + 3.1 * k) * item.size * s;
        item.sprite.scale.set(size, size, 1);
        item.sprite.material.opacity = 0.09 * Math.min(1, age / 0.35) * (1 - k) ** 1.1;
      }
      for (const item of effect.smokingBall) {
        const age = t - item.delay;
        item.sprite.visible = age >= 0 && age < 1.8;
        if (!item.sprite.visible) continue;
        const k = age / 1.8;
        item.sprite.position.copy(effect.origin).add(item.offset).addScaledVector(item.velocity, age);
        const size = (0.45 + 1.25 * k) * item.size * s;
        item.sprite.scale.set(size, size, 1);
        item.sprite.material.opacity = 0.34 * (1 - k);
      }
      for (const item of effect.debris) {
        const age = t - item.delay;
        item.mesh.visible = age >= 0 && age < 1.55;
        if (!item.mesh.visible) continue;
        item.mesh.position.copy(effect.origin).addScaledVector(item.velocity, age);
        item.mesh.position.y -= 5.5 * age * age;
        item.mesh.rotation.set(age * 8, age * 11, age * 6);
        item.mesh.scale.setScalar((1 - age / 1.8) * s);
      }
    }
  }
  return { burst, step };
}
