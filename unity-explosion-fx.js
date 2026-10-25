// Browser rendering of the Easy Weapons Rocket -> Explosion Player prefab.
// The prefab has an immediate Flame Burst, delayed Dust, Smoking Debris,
// Smoking Ball, and a 0.1-second warm light. Geometry is pooled for WebGL.
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// Small seeded value-noise cloud drawn once at load. No Unity texture bytes are shipped.
function particleTexture(THREE, seed, core) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(64, 64);
  const random = (x, y, salt) => {
    const n = Math.sin(x * 127.1 + y * 311.7 + seed * 17.9 + salt * 71.3) * 43758.5453;
    return n - Math.floor(n);
  };
  const noise = (x, y, cells, salt) => {
    const px = x * cells / 64, py = y * cells / 64;
    const ix = Math.floor(px), iy = Math.floor(py);
    const fx = px - ix, fy = py - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = random(ix, iy, salt) * (1 - ux) + random(ix + 1, iy, salt) * ux;
    const b = random(ix, iy + 1, salt) * (1 - ux) + random(ix + 1, iy + 1, salt) * ux;
    return a * (1 - uy) + b * uy;
  };
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const dx = (x - 31.5) / 31.5, dy = (y - 31.5) / 31.5;
    const broad = noise(x, y, 4, 0), fine = noise(x, y, 11, 1);
    const radius = Math.hypot(dx, dy) + (0.5 - broad) * 0.42 + (0.5 - fine) * 0.12;
    const edge = clamp((0.99 - radius) * 3.4, 0, 1);
    const body = clamp((broad * 0.65 + fine * 0.35 - 0.24) * 1.8, 0, 1);
    const alpha = Math.pow(edge * body, core ? 0.75 : 1.2) * (core ? 255 : 195);
    const i = (y * 64 + x) * 4;
    image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
    image.data[i + 3] = alpha;
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export function createUnityExplosionFx(THREE, scene, player) {
  document.body.dataset.skyExplosionRevision = 'unity-blast-v10';
  const flameTexture = particleTexture(THREE, 3, true);
  const smokeTexture = particleTexture(THREE, 11, false);
  const debrisGeometry = new THREE.Box(0.12, 0.12, 0.24);
  const origin = new THREE.Vector3();
  const flashColors = [0xffffff, 0xfff3be, 0xffdc58, 0xffa325];
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
    const flames = Array.from({ length: 24 }, (_, index) => ({
      sprite: makeSprite(flameTexture, flashColors[index % flashColors.length], true),
      velocity: new THREE.Vector3(), offset: new THREE.Vector3(), size: 1, delay: 0,
    }));
    const dust = Array.from({ length: 12 }, () => ({
      sprite: makeSprite(smokeTexture, 0x999183, true),
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
    // The opening corridor wall is close enough that an unscaled burst covers
    // the entire camera. Preserve the silhouette without hiding the route.
    effect.scale *= clamp(effect.origin.distanceTo(player.pos) / 6, 0.45, 1);
    effect.light.position.copy(effect.origin);
    effect.light.intensity = 0.8;
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
    effect.flames.forEach((item, index) => scatter(item, 2.1, 0.38, index % 5 * 0.018));
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
      effect.light.intensity = 0.8 * Math.max(0, 1 - t / 0.1);
      for (const item of effect.flames) {
        const age = t - item.delay;
        item.sprite.visible = age >= 0 && age < 0.95;
        if (!item.sprite.visible) continue;
        const k = age / 0.95;
        item.sprite.position.copy(effect.origin).add(item.offset).addScaledVector(item.velocity, age);
        item.sprite.position.y += 0.35 * age;
        const size = (1.5 + 3.1 * k) * item.size * s;
        item.sprite.scale.set(size, size, 1);
        item.sprite.material.color.setHex(k < 0.18 ? 0xffffff : k < 0.38 ? 0xffed8b : k < 0.65 ? 0xffa51f : 0xbb3410);
        item.sprite.material.opacity = 0.42 * (1 - k) ** 1.1;
      }
      for (const item of effect.dust) {
        const age = t - item.delay;
        item.sprite.visible = age >= 0 && age < 4.25;
        if (!item.sprite.visible) continue;
        const k = age / 4.25;
        item.sprite.position.copy(effect.origin).add(item.offset).addScaledVector(item.velocity, age);
        item.sprite.position.y += 0.18 * age;
        const size = (2.2 + 4.5 * k) * item.size * s;
        item.sprite.scale.set(size, size, 1);
        item.sprite.material.color.setHex(k < 0.35 ? 0x8b887f : k < 0.7 ? 0xb2a697 : 0xd3c7ae);
        item.sprite.material.opacity = 0.12 * Math.min(1, age / 0.35) * (1 - k) ** 1.1;
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
