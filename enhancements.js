// Air-corridor equipment kit. The base game exposes only the objects used here.
const game = window.__skyInternals;
if (!game) throw new Error('Air-corridor base game did not initialize');

// The base game's copy predates the weapon selector. Keep its controls and
// instructions aligned with the equipment that this module adds.
const gunToggleText = document.querySelector('#t_gunOn + span');
if (gunToggleText) gunToggleText.textContent = '銃を持つ（オフ＝ナイフだけで始める）';
const knifeRule = [...document.querySelectorAll('#ovStart .rules .keys li')]
  .find((item) => item.textContent.includes('最初はナイフだけ'));
if (knifeRule) {
  knifeRule.innerHTML = knifeRule.innerHTML.replace(
    '最初はナイフだけ（調整画面でハンドガンも持てる）',
    '銃は選んだ武器を持ち、調整画面でオフにもできる',
  );
  knifeRule.insertAdjacentHTML('afterend', '<li><kbd>E</kbd> 銃を撃つ　<kbd>R</kbd> 装填。HG・SG・SMG・MGから武器を選べる</li>');
}

const { WP, U, Jn, Et, ri, Tt, c, z, ue, tl, vd, uh, mr, us, mo, $a: zipLines, jn, Geom } = game;
const { Box, Cylinder, Torus, Sphere, Mesh, Group, Standard, Basic, Vector3 } = Geom;
const palette = {
  steel: new Standard({ color: 0x292d31, metalness: 0.72, roughness: 0.48 }),
  dark: new Standard({ color: 0x171b1f, metalness: 0.42, roughness: 0.65 }),
  grip: new Standard({ color: 0x765341, metalness: 0.06, roughness: 0.92 }),
  amber: new Standard({ color: 0xffb95e, emissive: 0x9a5415, emissiveIntensity: 0.35, roughness: 0.55 }),
  silver: new Standard({ color: 0x9ba5a9, metalness: 0.78, roughness: 0.33 }),
  cloth: new Standard({ color: 0x343b40, roughness: 0.98 }),
  smoke: new Basic({ color: 0xaeb8b7, transparent: true, opacity: 0.18, depthWrite: false }),
};

function box(parent, w, h, d, mat, x = 0, y = 0, z0 = 0) {
  const mesh = new Mesh(new Box(w, h, d), mat);
  mesh.position.set(x, y, z0);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}
function cylinder(parent, top, bottom, height, mat, x = 0, y = 0, z0 = 0, sides = 10) {
  const mesh = new Mesh(new Cylinder(top, bottom, height, sides), mat);
  mesh.position.set(x, y, z0);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}
function ring(parent, radius, tube, mat, x = 0, y = 0, z0 = 0) {
  const mesh = new Mesh(new Torus(radius, tube, 6, 14), mat);
  mesh.position.set(x, y, z0);
  parent.add(mesh);
  return mesh;
}

// Keep the animated fingers and thumb. The Meshy glove covers the palm and
// cuff; these simple shapes remain available if its GLB cannot be loaded.
const gloveFallbacks = [];
for (const hand of mr) {
  const wrist = hand?.wrist;
  if (!wrist) continue;
  const parts = wrist.children.filter((child) => child.isMesh && child.position.z < 0.08);
  parts.push(box(wrist, 0.075, 0.014, 0.08, palette.cloth, 0, 0.027, -0.025));
  for (const side of [-1, 1]) parts.push(box(wrist, 0.012, 0.012, 0.06, palette.dark, side * 0.037, 0.038, -0.025));
  gloveFallbacks.push(parts);
}

// Replace the common box weapon with silhouettes that remain readable during a sprint.
for (const child of tl.children) if (child.isMesh) child.visible = false;
const weaponViews = [];
function makeWeapon(name, build) {
  const group = new Group();
  group.name = `Sky ${name}`;
  group.scale.setScalar(name === 'MG' ? 0.43 : name === 'SG' ? 0.53 : 0.62);
  build(group);
  tl.add(group);
  weaponViews.push(group);
  return group;
}
makeWeapon('HG', (g) => {
  box(g, 0.115, 0.072, 0.25, palette.steel, 0, 0.055, -0.13);
  box(g, 0.118, 0.037, 0.24, palette.silver, 0, 0.104, -0.13);
  box(g, 0.07, 0.15, 0.074, palette.grip, 0, -0.065, -0.012).rotation.x = -0.22;
  box(g, 0.015, 0.018, 0.025, palette.amber, 0, 0.134, -0.235);
  cylinder(g, 0.018, 0.018, 0.02, palette.dark, 0, 0.066, -0.266).rotation.x = Math.PI / 2;
});
makeWeapon('SG', (g) => {
  box(g, 0.13, 0.11, 0.34, palette.steel, 0, 0.04, -0.14);
  cylinder(g, 0.035, 0.035, 0.46, palette.dark, 0, 0.065, -0.39).rotation.x = Math.PI / 2;
  box(g, 0.11, 0.10, 0.14, palette.grip, 0, 0.01, -0.31);
  box(g, 0.09, 0.12, 0.30, palette.grip, 0, -0.02, 0.17).rotation.x = -0.13;
  box(g, 0.018, 0.018, 0.04, palette.amber, 0, 0.13, -0.13);
});
const smgFallback = makeWeapon('SMG', (g) => {
  box(g, 0.115, 0.105, 0.29, palette.steel, 0, 0.06, -0.16);
  cylinder(g, 0.023, 0.023, 0.22, palette.dark, 0, 0.075, -0.36).rotation.x = Math.PI / 2;
  box(g, 0.06, 0.17, 0.065, palette.grip, 0, -0.08, -0.07);
  box(g, 0.07, 0.19, 0.065, palette.dark, 0, -0.105, -0.21).rotation.x = 0.12;
  box(g, 0.10, 0.045, 0.19, palette.grip, 0, 0.055, 0.10);
});
makeWeapon('MG', (g) => {
  box(g, 0.17, 0.14, 0.35, palette.steel, 0, 0.07, -0.17);
  cylinder(g, 0.028, 0.028, 0.58, palette.dark, 0, 0.085, -0.52).rotation.x = Math.PI / 2;
  cylinder(g, 0.045, 0.045, 0.13, palette.silver, 0, 0.085, -0.80).rotation.x = Math.PI / 2;
  box(g, 0.14, 0.20, 0.10, palette.grip, 0.105, -0.05, -0.10);
  box(g, 0.095, 0.16, 0.075, palette.dark, 0, -0.095, -0.035);
  box(g, 0.12, 0.09, 0.30, palette.grip, 0, 0.00, 0.18);
  for (const side of [-1, 1]) box(g, 0.018, 0.11, 0.018, palette.silver, side * 0.058, -0.04, -0.60).rotation.x = side * 0.23;
  box(g, 0.025, 0.024, 0.10, palette.amber, 0, 0.155, -0.21);
});

// A compact wrist-mounted hook launcher and the knife share the animated hands.
const hookLauncher = new Group();
hookLauncher.name = 'Sky hook launcher';
mr[0].wrist.add(hookLauncher);
box(hookLauncher, 0.12, 0.075, 0.22, palette.steel, 0, 0.065, -0.06);
cylinder(hookLauncher, 0.055, 0.055, 0.05, palette.amber, 0, 0.112, -0.08).rotation.z = Math.PI / 2;
cylinder(hookLauncher, 0.028, 0.028, 0.14, palette.silver, 0, 0.068, -0.22).rotation.x = Math.PI / 2;
box(hookLauncher, 0.09, 0.02, 0.12, palette.grip, 0, 0.02, 0.02);
for (const child of uh.children) if (child.isMesh) child.visible = false;
box(uh, 0.057, 0.042, 0.13, palette.grip, 0, 0, 0.01);
box(uh, 0.11, 0.018, 0.032, palette.steel, 0, 0, -0.07);
const blade = box(uh, 0.035, 0.012, 0.31, palette.silver, 0, 0.006, -0.23);
blade.rotation.x = -0.06;
box(uh, 0.014, 0.016, 0.06, palette.amber, 0, 0.009, -0.39);

// Optimized Meshy assets use the procedural viewmodels as load-error fallbacks.
const loaded = { hg: false, sg: false, smg: false, mg: false, glove: false, knife: false, ladder: false, hook: false, anchor: false, trolley: false, smoke: false, error: '' };
function recordAssetLoaded(key) {
  loaded[key] = true;
  document.body.dataset.skyModels = JSON.stringify(loaded);
}
if (window.T2?.GLTFLoader) {
  new T2.GLTFLoader().load('./assets/ladder-meshy-low.glb', (gltf) => {
    for (const ladder of mo) {
      const model = gltf.scene.clone(true);
      model.name = 'Meshy ladder mobile LOD';
      model.scale.set(ladder.w / 0.73, (ladder.y1 - ladder.y0) / 1.9, 0.68);
      model.rotation.y = ladder.nx ? Math.PI / 2 : 0;
      model.position.set(
        ladder.x + ladder.nx * 0.24,
        (ladder.y0 + ladder.y1) / 2,
        ladder.z + ladder.nz * 0.24,
      );
      model.traverse((child) => { if (child.isMesh) child.castShadow = false; });
      ue.add(model);
      if (ladder.view) ladder.view.visible = false;
    }
    recordAssetLoaded('ladder');
  }, undefined, (error) => { loaded.error = String(error); });
  new T2.GLTFLoader().load('./assets/knife-meshy-low.glb', (gltf) => {
    const root = gltf.scene;
    root.name = 'Meshy knife mobile LOD';
    // The knife points straight away from the camera, so it read as a short
    // dark stub. Tilt it up and lift its brightness so the blade shows.
    const KP = window.__KNP || {};
    const pivot = new Group();
    pivot.name = 'Knife pivot';
    pivot.rotation.set(KP.px ?? 0.5, KP.py ?? 0, KP.pz ?? 0);
    pivot.position.set(0, 0.02, -0.1);
    root.rotation.y = -Math.PI / 2;
    root.scale.setScalar(KP.sc ?? 0.3);
    root.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = false;
      const m = child.material;
      if (m && m.map) {
        m.emissive.set(0xffffff);
        m.emissiveMap = m.map;
        m.emissiveIntensity = KP.em ?? 0.45;
        m.needsUpdate = true;
      }
    });
    pivot.add(root);
    uh.add(pivot);
    for (const child of uh.children) if (child !== pivot && child.isMesh) child.visible = false;
    recordAssetLoaded('knife');
  }, undefined, (error) => { loaded.error = String(error); });
  new T2.GLTFLoader().load('./assets/smg-meshy-low.glb', (gltf) => {
    const root = gltf.scene;
    root.name = 'Meshy SMG mobile LOD';
    root.rotation.y = Math.PI / 2;
    root.scale.setScalar(0.34);
    root.position.set(0, -0.02, -0.08);
    root.traverse((child) => { if (child.isMesh) child.castShadow = false; });
    smgFallback.add(root);
    for (const child of smgFallback.children) if (child !== root) child.visible = false;
    recordAssetLoaded('smg');
  }, undefined, (error) => { loaded.error = String(error); });
}

// Complete the existing traversable structures with low polygon route cues.
const anchors = [];
for (const [x, y, z0] of us) {
  const anchor = new Group();
  anchor.name = 'Sky grapple anchor';
  anchor.position.set(x, y, z0);
  const rim = ring(anchor, 0.38, 0.055, palette.amber);
  rim.rotation.x = Math.PI / 2;
  box(anchor, 0.22, 0.06, 0.22, palette.steel, 0, -0.09, 0);
  for (const dx of [-0.08, 0.08]) for (const dz of [-0.08, 0.08]) cylinder(anchor, 0.014, 0.014, 0.03, palette.silver, dx, -0.045, dz, 6);
  ue.add(anchor);
  anchors.push(anchor);
}
for (const ladder of mo) {
  const marker = new Group();
  marker.name = 'Sky ladder access';
  marker.position.set(ladder.x + ladder.nx * 0.17, ladder.y1 + 0.31, ladder.z + ladder.nz * 0.17);
  box(marker, ladder.nz ? ladder.w + 0.25 : 0.10, 0.10, ladder.nx ? ladder.w + 0.25 : 0.10, palette.amber);
  box(marker, 0.14, 0.18, 0.14, palette.steel, 0, -0.12, 0);
  ue.add(marker);
}
const trolleyViews = [];
for (const line of zipLines) {
  const trolley = new Group();
  trolley.name = 'Sky zipline trolley';
  const wheel = ring(trolley, 0.16, 0.045, palette.steel, 0, 0.12, 0);
  wheel.rotation.y = Math.PI / 2;
  box(trolley, 0.30, 0.08, 0.18, palette.steel, 0, 0.03, 0);
  box(trolley, 0.045, 0.36, 0.045, palette.silver, 0, -0.20, 0);
  box(trolley, 0.40, 0.05, 0.06, palette.grip, 0, -0.39, 0);
  box(trolley, 0.035, 0.035, 0.06, palette.amber, 0, 0.08, -0.105);
  trolley.position.set(line.a[0], line.a[1] - 0.22, line.a[2]);
  ue.add(trolley);
  trolleyViews.push({ line, trolley });
  for (const point of [line.a, line.b]) {
    const terminal = new Group();
    terminal.name = 'Sky zipline terminal';
    terminal.position.set(point[0], point[1] - 0.33, point[2]);
    box(terminal, 0.45, 0.16, 0.45, palette.steel);
    box(terminal, 0.22, 0.22, 0.06, palette.amber, 0, 0.15, 0);
    ue.add(terminal);
  }
}
for (const block of jn) {
  if (!block.shape || !block.mesh) continue;
  const g = block.mesh;
  const y = block.maxY - block.minY;
  if (block.shape.startsWith('crate')) {
    const w = block.maxX - block.minX, d = block.maxZ - block.minZ;
    for (const sx of [-1, 1]) box(g, 0.045, y + 0.03, d + 0.03, palette.dark, sx * w * 0.45, y * 0.5, 0);
    box(g, w + 0.02, 0.025, d + 0.02, palette.amber, 0, y + 0.01, 0);
  } else if (block.shape === 'barrel') {
    const r = Math.min(block.maxX - block.minX, block.maxZ - block.minZ) * 0.5;
    cylinder(g, r * 0.9, r * 0.9, 0.025, palette.amber, 0, y + 0.015, 0, 12);
  }
}

// MG uses the existing shooting, aiming, reload, score and hit systems.
WP.push({ n: 'MG', mag: 60, res: 60, cd: 0.105, rl: 3.0, dmg: 0.65,
  head: 3, knock: 3.1, stun: 0.38, range: 70, cone: 0, auto: 1 });
Jn.weapon = Math.max(0, Math.min(3, Jn.weapon));
U.weapon = Math.max(0, Math.min(3, U.weapon | 0));
const weaponSlider = document.getElementById('s_weapon');
if (weaponSlider) {
  weaponSlider.max = '3';
  weaponSlider.parentElement.querySelector('label').textContent = '武器（0=HG 1=SG 2=SMG 3=MG）';
}
window.__wpSync?.();
const originalGunSound = Tt.hg;
Tt.hg = () => {
  originalGunSound();
  if (U.weapon === 3) Tt.thud(0.11, 0);
};

// Smoke: one charge at the start of a run. Every 3 skill moves refills one
// (max 2). Smoke blocks enemy sight along the segment from enemy to player;
// collision and gravity continue to use the original AI.
const smokeClouds = [];
let smokeGrenadeTemplate = null;
let smokeCharges = 1;
const SKILL_STATES = ['wallrun', 'slide', 'ledge', 'ladder', 'zip', 'hook'];
let skillCount = 0, skillPrev = 'none';
function trackSkills() {
  const st = game.modeRef() === 'play' && !z.over ? c.state : 'none';
  if (st !== skillPrev) {
    if (SKILL_STATES.includes(st)) {
      skillCount = Math.min(3, skillCount + 1);
      if (skillCount >= 3 && smokeCharges < 2) {
        skillCount = 0;
        smokeCharges++;
        game.rn('技で煙幕+1');
      }
    }
    skillPrev = st;
  }
}
function smokeBlocks(enemy) {
  for (const cloud of smokeClouds) {
    if (cloud.ttl <= 0 || Math.abs(enemy.pos.y - cloud.y) > 3.5 || Math.abs(c.pos.y - cloud.y) > 3.5) continue;
    const dx = c.pos.x - enemy.pos.x, dz = c.pos.z - enemy.pos.z;
    const len2 = dx * dx + dz * dz || 1;
    const u = Math.max(0, Math.min(1, ((cloud.x - enemy.pos.x) * dx + (cloud.z - enemy.pos.z) * dz) / len2));
    const px = enemy.pos.x + dx * u, pz = enemy.pos.z + dz * u;
    if (Math.hypot(px - cloud.x, pz - cloud.z) < cloud.radius) return true;
  }
  return false;
}
const oldEnemyUpdate = ri.prototype.update;
ri.prototype.update = function updateWithSmoke(dt) {
  if (!this.dead && smokeBlocks(this)) {
    this.stun = Math.max(this.stun, dt + 0.08);
    this.atkT = 0;
  }
  return oldEnemyUpdate.call(this, dt);
};
const oldTouching = ri.prototype.touching;
ri.prototype.touching = function touchingWithSmoke(distance) {
  return !smokeBlocks(this) && oldTouching.call(this, distance);
};
function groundAt(x, z0, maxY) {
  let best = -Infinity;
  for (const block of jn) {
    if (block.off || x < block.minX || x > block.maxX || z0 < block.minZ || z0 > block.maxZ) continue;
    if (block.maxY <= maxY && block.maxY > best) best = block.maxY;
  }
  return Number.isFinite(best) ? best : c.pos.y;
}
function throwSmoke() {
  if (game.modeRef() !== 'play' || z.over || smokeCharges <= 0) return false;
  const speed = Math.hypot(c.vel.x, c.vel.z);
  const backX = speed > 1 ? -c.vel.x / speed : Math.sin(c.yaw);
  const backZ = speed > 1 ? -c.vel.z / speed : Math.cos(c.yaw);
  const x = c.pos.x + backX * 1.5;
  const z0 = c.pos.z + backZ * 1.5;
  const y = groundAt(x, z0, c.pos.y + 2);
  const model = new Group();
  model.name = 'Sky smoke grenade and cloud';
  model.position.set(x, y, z0);
  if (smokeGrenadeTemplate) {
    const grenade = smokeGrenadeTemplate.clone(true);
    grenade.scale.setScalar(0.12);
    grenade.position.y = 0.13;
    model.add(grenade);
  } else {
    cylinder(model, 0.09, 0.09, 0.23, palette.dark, 0, 0.13, 0);
    cylinder(model, 0.06, 0.06, 0.035, palette.amber, 0, 0.25, 0);
  }
  for (let i = 0; i < 9; i++) {
    const puff = new Mesh(new Sphere(1, 7, 5), palette.smoke.clone());
    const angle = i * Math.PI * 2 / 9;
    puff.position.set(Math.cos(angle) * (0.45 + i % 3 * 0.22), 0.65 + i % 3 * 0.38, Math.sin(angle) * (0.45 + i % 3 * 0.22));
    puff.scale.set(0.9, 0.65, 0.9);
    model.add(puff);
  }
  ue.add(model);
  smokeClouds.push({ x, y, z: z0, radius: 3.2, ttl: 7, model });
  smokeCharges--;
  Tt.swish();
  game.rn('煙幕展開');
  return true;
}
document.addEventListener('keydown', (event) => {
  if (event.code === 'KeyG' && !event.repeat && game.modeRef() === 'play') {
    event.preventDefault();
    throwSmoke();
  }
});
const smokeButton = document.getElementById('tSmoke');
smokeButton?.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  event.stopPropagation();
  throwSmoke();
});

function resetSmoke() {
  smokeCharges = 1;
  skillCount = 0;
  skillPrev = 'none';
  for (const cloud of smokeClouds) ue.remove(cloud.model);
  smokeClouds.length = 0;
}
for (const id of ['bStart', 'bRestart', 'bRetry']) {
  document.getElementById(id)?.addEventListener('click', resetSmoke, true);
}
document.addEventListener('keydown', (event) => {
  if (event.code === 'KeyR' && !event.repeat && game.modeRef() === 'over') resetSmoke();
}, true);

// Knife readability: a white slash streak across the view during the swing,
// and a small prompt when a zombie is in knife range.
const knifeStreak = new Mesh(new Box(1, 0.04, 0.002),
  new Basic({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false }));
knifeStreak.renderOrder = 999;
knifeStreak.frustumCulled = false;
knifeStreak.visible = false;
game.Se.add(knifeStreak);
const knifeHint = document.createElement('div');
knifeHint.id = 'knifeHint';
knifeHint.style.cssText = 'position:fixed;left:50%;top:60%;transform:translateX(-50%);padding:3px 12px;border-radius:14px;' +
  'background:rgba(150,25,25,.62);color:#fff;font:600 14px system-ui,sans-serif;pointer-events:none;display:none;z-index:6;white-space:nowrap';
knifeHint.textContent = 'ナイフ範囲：F / 右クリック';
document.body.appendChild(knifeHint);
const coarsePointer = matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
function updateKnifeCue() {
  const nn = game.nn, playing = game.modeRef() === 'play' && !z.over;
  const e = playing && nn.t > 0 ? 1 - nn.t / 0.28 : -1;
  if (e >= 0) {
    const s = Math.sin(Math.min(1, e) * Math.PI);
    knifeStreak.visible = true;
    knifeStreak.material.opacity = 0.8 * s;
    knifeStreak.position.set(-0.4 + 0.8 * e, -0.2 + 0.28 * s, -0.9);
    knifeStreak.rotation.z = 0.55 - 0.3 * e;
    knifeStreak.scale.set(0.35 + 0.9 * s, 1, 1);
  } else knifeStreak.visible = false;
  let near = false;
  if (playing && !coarsePointer && nn.cd <= 0 && c.state !== 'ladder') {
    const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
    for (const zb of game.Jt) {
      if (zb.dead) continue;
      const dx = zb.pos.x - c.pos.x, dz = zb.pos.z - c.pos.z, d = Math.hypot(dx, dz);
      if (d < 2.0 + zb.r && d > 0.3 && (dx * fx + dz * fz) / d > 0.64 && Math.abs(zb.pos.y - c.pos.y) < 1.4) { near = true; break; }
    }
  }
  knifeHint.style.display = near ? 'block' : 'none';
}

let lastFrame = performance.now(), lastWeapon = -1;
function updateEquipment(now) {
  requestAnimationFrame(updateEquipment);
  const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  updateKnifeCue();
  const mode = game.modeRef();
  const weapon = U.weapon | 0;
  if (weapon !== lastWeapon) {
    weaponViews.forEach((view, index) => { view.visible = U.gunOn && index === weapon; });
    vd.position.z = [-0.25, -0.62, -0.43, -0.82][weapon] ?? -0.25;
    if (mode === 'play' && lastWeapon >= 0) {
      const profile = WP[weapon];
      Et.mag = profile.mag;
      Et.reloadLen = profile.rl;
      Et.ammo = Math.min(Et.ammo, profile.mag);
      Et.reserve = U.reserveAmmo >= 99 ? 99 : profile.res;
    }
    lastWeapon = weapon;
  }
  weaponViews.forEach((view, index) => { view.visible = U.gunOn && index === weapon; });
  document.getElementById('hSmoke').textContent = String(smokeCharges);
  smokeButton?.classList.toggle('empty', smokeCharges === 0);
  smokeButton && (smokeButton.textContent = `煙幕 ${smokeCharges}（技${skillCount}/3）`);
  for (let i = smokeClouds.length - 1; i >= 0; i--) {
    const cloud = smokeClouds[i];
    if (mode === 'play' && !z.over) cloud.ttl -= dt;
    cloud.model.children.forEach((child, index) => {
      if (!child.isMesh || index < 2) return;
      child.position.y += dt * (0.06 + index % 3 * 0.02);
      child.material.opacity = 0.18 * Math.min(1, cloud.ttl / 1.2);
    });
    if (cloud.ttl <= 0) { ue.remove(cloud.model); smokeClouds.splice(i, 1); }
  }
  for (const { line, trolley } of trolleyViews) {
    const active = mode === 'play' && c.state === 'zip' && c.zip === line;
    trolley.position.set(active ? c.pos.x : line.a[0], active ? c.pos.y + 1.8 : line.a[1] - 0.22, active ? c.pos.z : line.a[2]);
  }
}
// Meshy details are optional at runtime: the low polygon shapes above stay as
// fallbacks if a model is unavailable or cannot be decoded on a device.
if (window.T2?.GLTFLoader) {
  const loadDetail = (key, filename, apply) => {
    new T2.GLTFLoader().load(`./assets/${filename}`, (gltf) => {
      gltf.scene.traverse((child) => { if (child.isMesh) child.castShadow = false; });
      apply(gltf.scene);
      recordAssetLoaded(key);
    }, undefined, (error) => {
      loaded.error = `${key}: ${String(error)}`;
      document.body.dataset.skyModels = JSON.stringify(loaded);
    });
  };
  loadDetail('glove', 'glove-meshy-fitted.glb', (source) => {
    // The Meshy candidate is a single straight hand. Its rigid fingers were
    // removed in the fitted asset, leaving the game's animated digits free.
    for (const [index, hand] of mr.entries()) {
      const mirror = new Group();
      mirror.name = 'Meshy glove fitted to animated hand';
      mirror.scale.x = hand.side === 1 ? -1 : 1;
      const model = source.clone(true);
      model.scale.set(0.16, 0.12, 0.12);
      const direction = new Vector3(-1.3, 0.6, -0.3).normalize();
      const orientation = model.quaternion.constructor;
      const facing = new orientation().setFromUnitVectors(direction, new Vector3(0, 0, -1));
      const dorsal = new Vector3(0, 1, 0).applyQuaternion(facing);
      const roll = new orientation().setFromAxisAngle(new Vector3(0, 0, 1), Math.atan2(dorsal.x, dorsal.y));
      model.quaternion.copy(facing.premultiply(roll));
      const sourceAnchor = new Vector3(0.72, -0.28, 0.1).multiply(model.scale).applyQuaternion(model.quaternion);
      model.position.set(0, 0.015, -0.015).sub(sourceAnchor);
      mirror.add(model);
      hand.wrist.add(mirror);
      gloveFallbacks[index].forEach((part) => { part.visible = false; });
    }
  });
  for (const [key, index, scale, forward] of [['hg', 0, 0.25, -0.16], ['sg', 1, 0.47, -0.13], ['mg', 3, 0.70, -0.10]]) {
    loadDetail(key, `${key}-meshy-low.glb`, (root) => {
      const view = weaponViews[index];
      root.name = `Meshy ${key.toUpperCase()} mobile LOD`;
      root.rotation.y = -Math.PI / 2;
      root.scale.setScalar(scale);
      root.position.set(0, -0.02, forward);
      view.add(root);
      for (const child of view.children) if (child !== root) child.visible = false;
    });
  }
  loadDetail('hook', 'hook-launcher-meshy-low.glb', (root) => {
    root.name = 'Meshy hook launcher mobile LOD';
    root.rotation.y = -Math.PI / 2;
    root.scale.setScalar(0.13);
    root.position.set(0, 0.04, -0.06);
    hookLauncher.add(root);
    for (const child of hookLauncher.children) if (child !== root) child.visible = false;
  });
  loadDetail('anchor', 'grapple-anchor-meshy-low.glb', (root) => {
    for (const anchor of anchors) {
      const model = root.clone(true);
      model.name = 'Meshy grapple anchor mobile LOD';
      model.scale.setScalar(0.42);
      anchor.add(model);
      for (const child of anchor.children) if (child !== model) child.visible = false;
    }
  });
  loadDetail('trolley', 'zipline-trolley-meshy-low.glb', (root) => {
    for (const { line, trolley } of trolleyViews) {
      const model = root.clone(true);
      model.name = 'Meshy zipline trolley mobile LOD';
      model.scale.setScalar(0.30);
      trolley.rotation.y = Math.atan2(line.a[2] - line.b[2], line.b[0] - line.a[0]);
      trolley.add(model);
      for (const child of trolley.children) if (child !== model) child.visible = false;
    }
  });
  loadDetail('smoke', 'smoke-grenade-meshy-low.glb', (root) => {
    root.name = 'Meshy smoke grenade mobile LOD';
    smokeGrenadeTemplate = root;
  });
}
// Sleeve colour: the base game's olive forearm clashed with the detailed Meshy gear.
{
  const sleeve = new Standard({ color: 0x2c3238, roughness: 0.95 });
  for (const hand of mr) {
    let rig = hand?.wrist;
    while (rig?.parent && rig.parent !== ue) rig = rig.parent;
    rig?.traverse((child) => {
      if (child.isMesh && child.material?.color?.getHex?.() === 0x4d5040) child.material = sleeve;
    });
  }
}
// Sound coverage, full-auto support and control hints (2026-10-21).
{
  const { Ut, Mn, ni, wpc, modeRef } = game;
  const audioStats = { zip: 0, hook: 0, ladder: 0, smoke: 0, wallStep: 0, bgm: 0, shots: {} };
  window.__skyAudio = audioStats;
  const tone = (type, freq, gain, dur, endFreq) => {
    const ctx = Ut.ctx;
    if (!ctx || gain <= 0) return;
    const t = ctx.currentTime, osc = ctx.createOscillator(), amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    osc.connect(amp); amp.connect(Ut.master);
    osc.start(t); osc.stop(t + dur + 0.02);
  };
  const hiss = (gain, dur, freq) => {
    const ctx = Ut.ctx;
    if (!ctx || !Ut.noise) return;
    const t = ctx.currentTime, src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), amp = ctx.createGain();
    src.buffer = Ut.noise; src.loop = true;
    filter.type = 'highpass'; filter.frequency.value = freq;
    amp.gain.setValueAtTime(1e-4, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + 0.08);
    amp.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    src.connect(filter); filter.connect(amp); amp.connect(Ut.master);
    src.start(t); src.stop(t + dur + 0.05);
  };
  // Each weapon gets its own report instead of sharing the handgun sound.
  const shotSounds = {
    HG: () => { Mn(0.7, 3200, 0.6, 0.16, 'bandpass'); ni(0.55, 210, 0.13); },
    SG: () => { Mn(0.95, 900, 0.5, 0.38); ni(0.8, 95, 0.3); Mn(0.35, 3000, 0.8, 0.08, 'bandpass'); },
    SMG: () => { Mn(0.42, 4200, 0.9, 0.06, 'bandpass'); ni(0.28, 280, 0.05); },
    MG: () => { Mn(0.7, 2300, 0.6, 0.15, 'bandpass'); ni(0.65, 130, 0.17); },
  };
  Tt.hg = () => {
    const name = wpc().n;
    audioStats.shots[name] = (audioStats.shots[name] || 0) + 1;
    (shotSounds[name] || shotSounds.HG)();
  };
  // Continuous layers: trolley hum on the zipline and the hook's cable reel.
  const makeLoop = (freq, q) => {
    const ctx = Ut.ctx, src = ctx.createBufferSource(), filter = ctx.createBiquadFilter();
    const osc = ctx.createOscillator(), oscAmp = ctx.createGain(), amp = ctx.createGain();
    src.buffer = Ut.noise; src.loop = true;
    filter.type = 'bandpass'; filter.frequency.value = freq; filter.Q.value = q;
    osc.type = 'sawtooth'; osc.frequency.value = 60; oscAmp.gain.value = 0.18;
    amp.gain.value = 0;
    src.connect(filter); filter.connect(amp); osc.connect(oscAmp); oscAmp.connect(amp); amp.connect(Ut.master);
    src.start(); osc.start();
    return { filter, osc, amp };
  };
  let loops = null, prevState = 'none', rung = 0, wallStepT = 0, lastNow = performance.now();
  let cloudCount = smokeClouds.length;
  let bgmNodes = null, bgmPulseT = 0;
  const makeBgm = () => {
    const ctx = Ut.ctx, out = ctx.createGain();
    out.gain.value = 0;
    out.connect(Ut.master || ctx.destination);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 240; lp.Q.value = 3;
    lp.connect(out);
    const pad = ctx.createGain();
    pad.gain.value = 0.5;
    pad.connect(lp);
    for (const [freq, detune] of [[55, 0], [55.4, 0], [82.5, -6]]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = freq > 60 ? 0.35 : 0.5;
      osc.connect(g); g.connect(pad);
      osc.start();
    }
    // Slow LFO on the filter so the drone breathes instead of droning flat.
    const lfo = ctx.createOscillator(), depth = ctx.createGain();
    lfo.frequency.value = 0.07; depth.gain.value = 70;
    lfo.connect(depth); depth.connect(lp.frequency);
    lfo.start();
    return { out, lp };
  };
  const hudKeys = document.querySelector('.hud-tr');
  const setHints = () => {
    if (!hudKeys) return;
    hudKeys.innerHTML = U.gunOn
      ? '<kbd>クリック</kbd>/<kbd>E</kbd> 射撃　<kbd>右クリック</kbd>/<kbd>F</kbd> ナイフ　<kbd>R</kbd> 装填　<kbd>Q</kbd> フック　<kbd>Esc</kbd> 一時停止・調整'
      : '<kbd>クリック</kbd>/<kbd>F</kbd> ナイフ　<kbd>Q</kbd> フック　<kbd>Esc</kbd> 一時停止・調整';
  };
  for (const item of document.querySelectorAll('#ovStart .rules .keys li')) {
    item.innerHTML = item.innerHTML.replace('<kbd>クリック</kbd>/<kbd>F</kbd>/<kbd>右クリック</kbd> ナイフ', '<kbd>F</kbd>/<kbd>右クリック</kbd> ナイフ（銃オフのときはクリックも）');
  }
  let prevMode = '';
  const audioTick = () => {
    requestAnimationFrame(audioTick);
    const now = performance.now(), dt = Math.min(0.1, (now - lastNow) / 1000);
    lastNow = now;
    const mode = modeRef();
    if (mode !== prevMode) { if (mode === 'play') setHints(); prevMode = mode; }
    trackSkills();
    if (!Ut.ctx || !Ut.noise) return;
    if (!loops) loops = { zip: makeLoop(1500, 3), reel: makeLoop(900, 5) };
    const t = Ut.ctx.currentTime;
    const playing = mode === 'play' && !z.over;
    const state = playing ? c.state : 'none';
    const speed = Math.hypot(c.vel.x, c.vel.y, c.vel.z);
    loops.zip.amp.gain.setTargetAtTime(state === 'zip' ? 0.1 + Math.min(0.16, speed * 0.01) : 0, t, 0.06);
    loops.zip.filter.frequency.setTargetAtTime(1100 + speed * 80, t, 0.1);
    loops.zip.osc.frequency.setTargetAtTime(55 + speed * 5, t, 0.1);
    const reel = c.hookT || 0;
    loops.reel.amp.gain.setTargetAtTime(state === 'hook' ? 0.12 : 0, t, 0.04);
    loops.reel.filter.frequency.setTargetAtTime(700 + reel * 900, t, 0.08);
    loops.reel.osc.frequency.setTargetAtTime(100 + reel * 160, t, 0.08);
    // Background music: a low detuned drone with a slow heartbeat pulse. It is
    // synthesized here (no audio files), so it adds no download weight.
    const bgmLive = mode === 'play' && !z.over;
    if (bgmLive && !bgmNodes) bgmNodes = makeBgm();
    if (bgmNodes) {
      bgmNodes.out.gain.setTargetAtTime(bgmLive ? 0.07 : 0, t, bgmLive ? 0.8 : 0.25);
      if (bgmLive) {
        bgmPulseT -= dt;
        if (bgmPulseT <= 0) {
          bgmPulseT = 0.95;
          tone('sine', 62, 0.2, 0.18, 40);
          setTimeout(() => tone('sine', 56, 0.12, 0.12, 36), 230);
          audioStats.bgm++;
        }
      }
    }
    if (state !== prevState) {
      if (state === 'zip') { tone('square', 900, 0.1, 0.05); tone('triangle', 420, 0.16, 0.12, 260); audioStats.zip++; }
      if (prevState === 'zip') tone('triangle', 520, 0.12, 0.1, 300);
      if (state === 'hook') { Mn(0.45, 1500, 1.4, 0.2, 'bandpass'); tone('triangle', 1400, 0.14, 0.07, 900); audioStats.hook++; }
      if (prevState === 'hook') tone('square', 1600, 0.07, 0.04);
      if (state === 'ladder') rung = Math.floor((c.bob || 0) / 0.75);
      prevState = state;
    }
    if (state === 'ladder') {
      const step = Math.floor((c.bob || 0) / 0.75);
      if (step !== rung) {
        rung = step;
        tone('triangle', 560 + Math.random() * 120, 0.15, 0.07, 420);
        Mn(0.12, 3200, 3, 0.04, 'bandpass');
        audioStats.ladder++;
      }
    }
    if (state === 'wallrun') {
      wallStepT -= dt;
      if (wallStepT <= 0) { wallStepT = 0.19; Tt.step(0.7); audioStats.wallStep++; }
    } else wallStepT = 0;
    if (smokeClouds.length > cloudCount) {
      Mn(0.45, 600, 0.7, 0.12); tone('triangle', 300, 0.15, 0.08, 180);
      hiss(0.16, 3.2, 2500);
      audioStats.smoke++;
    }
    cloudCount = smokeClouds.length;
  };
  requestAnimationFrame(audioTick);
}
requestAnimationFrame(updateEquipment);
window.__skyUpgrade = { knifeStreak, smokeClouds, loaded, throwSmoke, get smokeCharges() { return smokeCharges; }, weaponViews, trolleyViews };
