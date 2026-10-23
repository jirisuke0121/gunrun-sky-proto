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
  knifeRule.insertAdjacentHTML('afterend', '<li><kbd>E</kbd> 銃を撃つ　<kbd>R</kbd> 装填。HG・SG・SMG・MGから武器を選べる</li>' +
    '<li>技（スライド・壁走り・縁つかみ・はしご・ジップライン・フック）を3回決めると煙幕+1（最大2個）</li>' +
    '<li>少し高い壁に走って跳ぶと、壁を蹴って駆け上がる。日よけ布に落ちると大きく跳ねる</li>' +
    '<li><kbd>H</kbd> 自己ベストのときの走りを青い人影（ゴースト）で表示・非表示</li>');
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
    root.rotation.y = -Math.PI / 2;
    root.scale.setScalar(0.34);
    root.position.set(0, -0.02, -0.13);
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
    vd.position.z = [-0.25, -0.62, -0.34, -0.82][weapon] ?? -0.25;
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

// Ghost of the best run on this course. The path is sampled every 0.1 s of
// play and kept in this browser only. H shows or hides it.
{
  const KEY = 'gunrun-sky-ghost-v1', STEP = 0.1;
  let best = null;
  try { best = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { best = null; }
  if (!best || !Array.isArray(best.p) || best.p.length < 8 || !(best.total > 0)) best = null;
  let rec = [], lastZt = 0, saved = false, show = true;
  const mat = new Basic({ color: 0x7fd8ff, transparent: true, opacity: 0.45, depthWrite: false, fog: false });
  const ghost = new Group();
  ghost.name = 'Best-run ghost';
  const body = new Mesh(new Cylinder(0.2, 0.2, 1.0, 10), mat);
  body.position.y = 0.95;
  const head = new Mesh(new Sphere(0.14, 10, 8), mat);
  head.position.y = 1.62;
  const legs = new Mesh(new Cylinder(0.17, 0.12, 0.5, 10), mat);
  legs.position.y = 0.25;
  ghost.add(body, head, legs);
  ghost.visible = false;
  ue.add(ghost);
  const chip = document.createElement('div');
  chip.style.cssText = 'position:fixed;left:12px;bottom:56px;padding:2px 9px;border-radius:12px;background:rgba(40,110,150,.55);' +
    'color:#fff;font:600 12px system-ui,sans-serif;pointer-events:none;display:none;z-index:6';
  document.body.appendChild(chip);
  document.addEventListener('keydown', (event) => {
    if (event.code === 'KeyH' && !event.repeat && game.modeRef() === 'play') show = !show;
  });
  const round = (v) => Math.round(v * 100) / 100;
  function ghostTick() {
    requestAnimationFrame(ghostTick);
    const playing = game.modeRef() === 'play' && !z.mission;
    if (!playing) { ghost.visible = false; chip.style.display = 'none'; return; }
    if (z.t < lastZt - 0.5 || (z.t < 0.2 && lastZt >= 0.2)) { rec = []; saved = false; }
    lastZt = z.t;
    if (!z.over) {
      while (rec.length / 4 * STEP <= z.t) rec.push(round(c.pos.x), round(c.pos.y), round(c.pos.z), round(c.yaw));
    } else if (!saved && z.final && z.final.total > 0) {
      saved = true;
      if (z.final.total > (best ? best.total : 0) && rec.length >= 8) {
        best = { total: z.final.total, p: rec.slice() };
        try { localStorage.setItem(KEY, JSON.stringify(best)); } catch {}
      }
    }
    if (!best || !show || z.over) { ghost.visible = false; chip.style.display = best && !z.over ? 'block' : 'none'; chip.textContent = `ゴースト 非表示（H）`; return; }
    const n = best.p.length / 4, f = z.t / STEP, i0 = Math.floor(f);
    if (i0 >= n - 1) { ghost.visible = false; chip.style.display = 'none'; return; }
    const k = f - i0, a = i0 * 4, b = a + 4, p = best.p;
    ghost.position.set(p[a] + (p[b] - p[a]) * k, p[a + 1] + (p[b + 1] - p[a + 1]) * k, p[a + 2] + (p[b + 2] - p[a + 2]) * k);
    const near = Math.hypot(ghost.position.x - c.pos.x, ghost.position.z - c.pos.z) < 1.2 && Math.abs(ghost.position.y - c.pos.y) < 2;
    ghost.visible = !near;
    chip.style.display = 'block';
    chip.textContent = `ゴースト ベスト ${best.total}点（H で切替）`;
  }
  requestAnimationFrame(ghostTick);
  window.__skyGhost = { get best() { return best; }, get rec() { return rec; }, ghost };
}

// ---------------------------------------------------------------------------
// Old town: houses dressed as a town (plaster, tiled roofs, windows, doors),
// cloth awnings you can bounce on, a wall kick-up, a distant skyline and
// speed effects (dust and speed lines). Everything here is visual or adjusts
// the player's velocity; the collision boxes stay in the base game.
// ---------------------------------------------------------------------------
{
  const { Se: cam, BufferGeometry, Float32Attribute } = { Se: game.Se, ...Geom };
  // Borrow an existing stone texture so plaster and roofs keep the grain.
  let stoneTex = null;
  ue.traverse((o) => { if (!stoneTex && o.isMesh && o.material && o.material.map && o.material.map.image) stoneTex = o.material.map; });
  const canvasTex = (draw, size = 256) => {
    if (!stoneTex) return null;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    draw(cv.getContext('2d'), size);
    const t = stoneTex.clone();
    // A clone shares its image source; give the copy its own so the stone stays stone.
    t.source = new stoneTex.source.constructor(cv);
    t.needsUpdate = true;
    return t;
  };
  const tileTex = canvasTex((g, n) => {
    g.fillStyle = '#9c4a2c'; g.fillRect(0, 0, n, n);
    const rows = 8, cols = 6, rh = n / rows, cw = n / cols;
    for (let r = 0; r < rows; r++) for (let k = -1; k <= cols; k++) {
      const x = k * cw + (r % 2 ? cw / 2 : 0), y = r * rh;
      const grd = g.createLinearGradient(x, 0, x + cw, 0);
      const base = 150 + ((r * 7 + k * 13) % 5) * 9;
      grd.addColorStop(0, `rgb(${base - 40},${base * 0.42 | 0},${base * 0.25 | 0})`);
      grd.addColorStop(0.5, `rgb(${base + 20},${base * 0.55 | 0},${base * 0.33 | 0})`);
      grd.addColorStop(1, `rgb(${base - 50},${base * 0.38 | 0},${base * 0.22 | 0})`);
      g.fillStyle = grd;
      g.beginPath(); g.ellipse(x + cw / 2, y + rh, cw / 2 - 1, rh, 0, Math.PI, 0); g.fill();
      g.fillRect(x + 1, y + rh * 0.95, cw - 2, rh * 0.15);
    }
  });
  const mat = {
    plaster: [0xe8d9bb, 0xd9b98a, 0xe2c6a8, 0xcfae84].map((color) => new Standard({ color, map: stoneTex, roughness: 0.97 })),
    tile: new Standard({ color: 0xffffff, map: tileTex, roughness: 0.85 }),
    window: new Standard({ color: 0x1f1a16, roughness: 0.6 }),
    wood: new Standard({ color: 0x5a4130, roughness: 0.9 }),
    shutter: [0x2f5d6b, 0x6b3a2a, 0x4e5f34].map((color) => new Standard({ color, roughness: 0.85 })),
    red: new Standard({ color: 0x9a3328, roughness: 0.95, side: 2 }),
    ochre: new Standard({ color: 0xc28f45, roughness: 0.95, side: 2 }),
  };

  // Merge many boxes into one mesh per material to keep draw calls low.
  const batches = new Map();
  const addBox = (m, cx, cy, cz, w, h, d, uvScale = 0.5) => {
    if (!batches.has(m)) batches.set(m, { p: [], n: [], u: [] });
    const B = batches.get(m), hx = w / 2, hy = h / 2, hz = d / 2;
    const faces = [
      [[1, 0, 0], [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]], [d, h]],
      [[-1, 0, 0], [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]], [d, h]],
      [[0, 1, 0], [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]], [w, d]],
      [[0, -1, 0], [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]], [w, d]],
      [[0, 0, 1], [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]], [w, h]],
      [[0, 0, -1], [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]], [w, h]],
    ];
    for (const [nrm, v, [su, sv]] of faces) {
      const uv = [[0, 0], [su, 0], [su, sv], [0, sv]];
      for (const i of [0, 1, 2, 0, 2, 3]) {
        B.p.push(cx + v[i][0], cy + v[i][1], cz + v[i][2]);
        B.n.push(...nrm);
        B.u.push(uv[i][0] * uvScale, uv[i][1] * uvScale);
      }
    }
  };
  const addTris = (m, tris) => { // tris: array of [x,y,z] * 3 per triangle, flat normals
    if (!batches.has(m)) batches.set(m, { p: [], n: [], u: [] });
    const B = batches.get(m);
    for (let i = 0; i < tris.length; i += 3) {
      const [a, b, c2] = [tris[i], tris[i + 1], tris[i + 2]];
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c2[0] - a[0], vy = c2[1] - a[1], vz = c2[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      for (const q of [a, b, c2]) {
        B.p.push(...q); B.n.push(nx, ny, nz);
        B.u.push(Math.abs(nx) > 0.5 ? q[2] / 2 : q[0] / 2, Math.abs(ny) > 0.5 ? q[2] / 2 : q[1] / 2);
      }
    }
  };

  // [x0, z0, x1, z1, top] — mirrors the old-town boxes in index.html.
  const houses = [
    [-42, -12, -36.5, -5, 2.6], [-31.5, -12, -22, -6.5, 4.2], [-34, -1, -29, 5, 5.5], [-29, -1, -24, 5, 6.4],
    [-32, 12, -25, 18, 2.8], [-20, 3, -16, 8, 7], [-70, -12, -64, -3, 3], [-61, -12, -55, -5.5, 4.2],
    [-52, -12, -47, -5.5, 4.4], [-38, 12, -34.5, 18, 4], [-45, 13.5, -41, 18, 4.4], [-51, 11, -48, 18, 5],
    [-58, 12, -53.5, 18, 4.4], [-63, 11, -60, 18, 5.5], [-70, 8, -66, 18, 6.5], [-70, 0, -65, 5, 4.4],
    [-60, -1, -52, 6, 3.4, 0, 'hollow'], [-49, 0.5, -45, 5.5, 6.2, 0, 'open'], [40.5, -4, 46, 3, 3], [40.5, 5, 46, 14, 4.4], [34, 7, 38.5, 11.5, 2.6, 0, 'hollow'], [43, 9, 46, 12, 6.6, 4.4, 'shed'], [36, -8.7, 40, -8.3, 3.8, 0, 'shed'], [36.3, -8.3, 36.7, -5, 3.8, 0, 'shed'],
    // roof sheds: [x0, z0, x1, z1, top, base, 'shed']
    [-70, -12, -67, -8, 5.2, 3, 'shed'], [-61, -12, -58.5, -9.5, 6.4, 4.2, 'shed'],
    [-25, -12, -22, -9.5, 6.4, 4.2, 'shed'], [-56, 1.5, -54.2, 3.5, 5.4, 3.4, 'shed'],
  ];
  const inside = (x, z, skip) => houses.some((h) => h !== skip && !h[6] && x > h[0] - 0.05 && x < h[2] + 0.05 && z > h[1] - 0.05 && z < h[3] + 0.05);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  houses.forEach((h, idx) => {
    const [x0, z0, x1, z1, top, base = 0, kind = ''] = h, w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const plaster = mat.plaster[idx % mat.plaster.length], shutter = mat.shutter[idx % mat.shutter.length];
    // Plaster skin and a tiled roof cap with a thin eave. A hollow house keeps
    // its doorways open, so it gets plaster only above the door height.
    if (kind === 'open') { /* real walls with openings; no skin */ }
    else if (kind === 'hollow') addBox(plaster, cx, (top + 2.3) / 2, cz, w + 0.04, top - 2.3, d + 0.04);
    else addBox(plaster, cx, (top + base) / 2, cz, w + 0.04, top - base - 0.02, d + 0.04);
    addBox(mat.tile, cx, top + 0.025, cz, w + 0.02, 0.05, d + 0.02, 0.35);
    addBox(mat.wood, cx, top - 0.12, cz, w + 0.3, 0.12, d + 0.3);
    // Windows, shutters and a door on each outward face.
    const faces = [
      [x0, z0, x1, z0, 0, -1], [x0, z1, x1, z1, 0, 1], [x0, z0, x0, z1, -1, 0], [x1, z0, x1, z1, 1, 0],
    ];
    let doorDone = false;
    if (kind) return;
    for (const [ax, az, bx, bz, nx, nz] of faces) {
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 2.5) continue;
      const tx = (bx - ax) / len, tz = (bz - az) / len;
      const floors = top > 4.6 ? [1.5, top - 1.7] : top > 2.4 ? [Math.min(1.5, top - 1.1)] : [];
      const n = Math.max(1, Math.floor((len - 1) / 2.4));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) * len / n, px = ax + tx * t + nx * 0.05, pz = az + tz * t + nz * 0.05;
        if (inside(px + nx * 0.4, pz + nz * 0.4, h)) continue;
        for (const fy of floors) {
          if (!doorDone && fy === floors[0] && rnd() < 0.35) {
            doorDone = true;
            addBox(mat.wood, px, 0.95, pz, Math.abs(tx) * 1.05 + Math.abs(nx) * 0.08, 1.9, Math.abs(tz) * 1.05 + Math.abs(nz) * 0.08);
            continue;
          }
          if (rnd() < 0.18) continue;
          addBox(mat.window, px, fy, pz, Math.abs(tx) * 0.7 + Math.abs(nx) * 0.06, 0.95, Math.abs(tz) * 0.7 + Math.abs(nz) * 0.06);
          for (const side of [-1, 1]) {
            const sx = px + tx * side * 0.52, sz = pz + tz * side * 0.52;
            addBox(shutter, sx + nx * 0.02, fy, sz + nz * 0.02, Math.abs(tx) * 0.3 + Math.abs(nx) * 0.05, 1.0, Math.abs(tz) * 0.3 + Math.abs(nz) * 0.05);
          }
          addBox(mat.wood, px + nx * 0.06, fy - 0.55, pz + nz * 0.06, Math.abs(tx) * 0.9 + Math.abs(nx) * 0.18, 0.08, Math.abs(tz) * 0.9 + Math.abs(nz) * 0.18);
        }
      }
    }
  });

  // Sloped roofs: a solid gable under each slope (the base game hides its own
  // fill), with tiles laid along the slope.
  const slopes = [
    { x0: -44, x1: -34, z0: -0.5, z1: 4.5, y0: 2.4, y1: 5.5, m: mat.plaster[1] },
    { x0: 35, x1: 39.5, z0: 1.5, z1: 4.5, y0: 1.3, y1: 3, m: mat.plaster[2] },
  ];
  for (const sl of slopes) {
    const { x0, x1, z0, z1, y0, y1, m } = sl, A = (x, z, y) => [x, y, z];
    const b0 = A(x0, z0, 0), b1 = A(x1, z0, 0), b2 = A(x1, z1, 0), b3 = A(x0, z1, 0);
    const t0 = A(x0, z0, y0 - 0.3), t1 = A(x1, z0, y1 - 0.3), t2 = A(x1, z1, y1 - 0.3), t3 = A(x0, z1, y0 - 0.3);
    addTris(m, [b0, b1, t1, b0, t1, t0, b2, b3, t3, b2, t3, t2, b3, b0, t0, b3, t0, t3, b1, b2, t2, b1, t2, t1]);
    const lift = 0.04, T = (x, z, y) => [x, y + lift, z];
    addTris(mat.tile, [T(x0, z1, y0), T(x1, z1, y1), T(x1, z0, y1), T(x0, z1, y0), T(x1, z0, y1), T(x0, z0, y0)]);
  }

  // Awnings — also trampolines. [x0, x1, wallZ, outZ, yTop, yLow, colour]
  const awnings = [
    [-33.4, -29.6, -1, -3.4, 4.6, 3.6, 'red'], [-28.4, -25.6, 12, 10.4, 2.6, 2.2, 'ochre'],
    [-41.6, -38.4, -5, -3.4, 2.4, 2.0, 'ochre'], [-51.5, -48, -5.5, -3.7, 2.8, 2.4, 'red'],
    [-50.6, -48.4, 11, 9.4, 2.8, 2.4, 'ochre'], [-59.5, -55.5, -1, -2.6, 2.2, 1.9, 'red'],
    [35.4, 38.4, 7, 5.9, 2.4, 2.0, 'red'], [42, 45, 5, 4.2, 2.6, 2.3, 'ochre'],
  ];
  const decor = new Group();
  for (const [ax0, ax1, wz, oz, yt, yl, col] of awnings) {
    const dz = oz - wz, dy = yl - yt, len = Math.hypot(dz, dy);
    const m = box(decor, ax1 - ax0, 0.05, len, mat[col], (ax0 + ax1) / 2, (yt + yl) / 2, (wz + oz) / 2);
    m.rotation.x = Math.atan2(-dy, Math.abs(dz)) * Math.sign(dz);
    for (const x of [ax0 + 0.1, ax1 - 0.1]) addBox(mat.wood, x, yl / 2, oz, 0.08, yl, 0.08);
  }
  // Banners and wooden posts under the planks that cross alleys.
  addBox(mat.red, -31.55, 2.6, -10.8, 0.04, 2.2, 1.6);
  addBox(mat.ochre, -20.05, 4.6, 5.5, 0.04, 2.4, 1.4);
  addBox(mat.red, 40.95, 3.2, 9.5, 0.04, 2.6, 1.6);
  addBox(mat.red, -64.05, 1.9, -8, 0.04, 2.2, 1.4);
  addBox(mat.ochre, -47.05, 3.2, 15, 0.04, 2.6, 1.4);
  for (const [x, z, y] of [[-27, -6.3, 4.2], [-27, -1.2, 6.4], [-57, -5.3, 3.4], [-57, -1.2, 3.4], [-55.5, 6.2, 3.4], [-55.5, 11.8, 4.4]]) {
    addBox(mat.wood, x, (y - 0.3) / 2, z, 0.16, y - 0.3, 0.16);
  }
  // Wooden handrails along the stairs.
  for (const [x, za, zb, top] of [[-43.45, -4.6, -11.4, 2.6], [-62.75, 1.5, -2.9, 3]]) {
    const L = Math.abs(zb - za), ang = Math.atan2(top, L);
    const r = new Mesh(new Box(0.07, 0.07, Math.hypot(L, top)), mat.wood);
    r.position.set(x, top / 2 + 0.95, (za + zb) / 2);
    r.rotation.x = Math.sign(za - zb) * ang;
    decor.add(r);
    for (let k = 0; k <= 4; k++) addBox(mat.wood, x, (top * k / 4) / 2 + 0.5, za + (zb - za) * k / 4, 0.06, top * k / 4 + 1, 0.06);
  }

  for (const [m, B] of batches) {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32Attribute(new Float32Array(B.p), 3));
    g.setAttribute('normal', new Float32Attribute(new Float32Array(B.n), 3));
    g.setAttribute('uv', new Float32Attribute(new Float32Array(B.u), 2));
    g.computeBoundingSphere();
    const mesh = new Mesh(g, m);
    mesh.castShadow = m !== mat.tile;
    mesh.receiveShadow = true;
    decor.add(mesh);
  }

  // Distant skyline: domes and minarets far beyond the play area, softened by fog.
  const sky = { wall: new Standard({ color: 0xd9bf94, roughness: 1 }), dome: new Standard({ color: 0xc9a46a, roughness: 0.8 }) };
  const city = [[150, 0.3], [170, 0.9], [140, 1.7], [165, 2.4], [150, 3.1], [175, 3.8], [145, 4.5], [160, 5.4]];
  for (const [r, a] of city) {
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r, s = 0.8 + ((r * 7) % 5) / 10;
    box(decor, 26 * s, 14 * s, 18 * s, sky.wall, cx, 7 * s - 6, cz);
    const dome = new Mesh(new Geom.Sphere(8 * s, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), sky.dome);
    dome.position.set(cx, 14 * s - 6, cz); decor.add(dome);
    for (const k of [-1, 1]) {
      cylinder(decor, 0.9 * s, 1.3 * s, 34 * s, sky.wall, cx + k * 15 * s, 17 * s - 6, cz + 6 * s, 8);
      const cap = new Mesh(new Geom.Sphere(1.6 * s, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), sky.dome);
      cap.position.set(cx + k * 15 * s, 34 * s - 6, cz + 6 * s); decor.add(cap);
    }
  }
  ue.add(decor);

  // --- Movement additions -------------------------------------------------
  const solidTopAhead = (px, pz, feet) => {
    let top = -1e9;
    for (const b of jn) {
      if (b.off || b.type === 'prop' || b.type === 'rail') continue;
      if (px > b.minX && px < b.maxX && pz > b.minZ && pz < b.maxZ && b.minY < feet + 1.2 && b.maxY > feet + 0.4) top = Math.max(top, b.maxY);
    }
    return top;
  };
  let kickUsed = false, prevY = c.pos.y, wasGround = true, airMinVy = 0;
  const awningY = (a, z) => a[4] + (a[5] - a[4]) * (z - a[2]) / (a[3] - a[2]);
  const stats = { kicks: 0, bounces: 0 };

  // Dust pool and speed lines.
  const dustMat = new Basic({ color: 0xd8c7a4, transparent: true, opacity: 0.5, depthWrite: false });
  const dust = [];
  for (let i = 0; i < 28; i++) {
    const m = new Mesh(new Geom.Sphere(0.18, 6, 4), dustMat.clone());
    m.visible = false; ue.add(m); dust.push({ m, t: 0, vx: 0, vy: 0, vz: 0 });
  }
  let dustI = 0;
  const puff = (n, spread, up) => {
    for (let i = 0; i < n; i++) {
      const p = dust[dustI++ % dust.length], a = Math.random() * Math.PI * 2;
      p.t = 0.55; p.m.visible = true;
      p.m.position.set(c.pos.x + Math.cos(a) * 0.3, c.pos.y + 0.1, c.pos.z + Math.sin(a) * 0.3);
      p.vx = Math.cos(a) * spread * (0.5 + Math.random()); p.vz = Math.sin(a) * spread * (0.5 + Math.random()); p.vy = up * Math.random();
    }
  };
  const lines = document.createElement('div');
  lines.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5;opacity:0;transition:opacity .12s;' +
    'background:repeating-conic-gradient(from 0deg at 50% 50%,rgba(255,250,235,.55) 0deg .6deg,transparent .6deg 7deg);' +
    '-webkit-mask:radial-gradient(circle at 50% 50%,transparent 38%,#000 78%);mask:radial-gradient(circle at 50% 50%,transparent 38%,#000 78%)';
  document.body.appendChild(lines);
  let sprintDustT = 0, last = performance.now();

  function oldTownTick() {
    requestAnimationFrame(oldTownTick);
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
    const playing = game.modeRef() === 'play' && !z.over;
    const sp = Math.hypot(c.vel.x, c.vel.z);
    lines.style.opacity = playing ? String(Math.max(0, Math.min(0.55, (sp - U.sprintSpeed - 0.4) / 5))) : '0';
    for (const p of dust) {
      if (p.t <= 0) continue;
      p.t -= dt;
      p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
      p.m.scale.setScalar(1 + (0.55 - p.t) * 4);
      p.m.material.opacity = Math.max(0, p.t) * 0.8;
      if (p.t <= 0) p.m.visible = false;
    }
    if (!playing) { prevY = c.pos.y; return; }
    const y = c.pos.y;
    if (c.onGround) {
      if (!wasGround && airMinVy < -7) { puff(8, 2.4, 0.8); c.landDip = Math.min(0.5, (c.landDip || 0) + 0.12); }
      kickUsed = false; airMinVy = 0;
      sprintDustT -= dt;
      if (sp > U.sprintSpeed - 0.5 && sprintDustT <= 0) { sprintDustT = 0.12; puff(1, 0.6, 0.4); }
    } else airMinVy = Math.min(airMinVy, c.vel.y);
    wasGround = c.onGround;

    if (c.state === 'normal' && !c.onGround) {
      // Awning bounce: falling through the cloth throws you back up.
      if (c.vel.y < -1.5) {
        for (const a of awnings) {
          const zMin = Math.min(a[2], a[3]), zMax = Math.max(a[2], a[3]);
          if (c.pos.x < a[0] || c.pos.x > a[1] || c.pos.z < zMin || c.pos.z > zMax) continue;
          const ay = awningY(a, c.pos.z);
          if (prevY >= ay - 0.05 && y <= ay + 0.1) {
            c.pos.y = ay + 0.05; c.vel.y = 10.5; kickUsed = false;
            Tt.jump(); puff(5, 1.5, 0.3); stats.bounces++;
            break;
          }
        }
      }
      // Wall kick-up: running into a wall a little too tall to grab.
      if (!kickUsed && sp > 3.5 && c.vel.y > -2.5) {
        const dx = c.vel.x / sp, dz = c.vel.z / sp;
        const top = solidTopAhead(c.pos.x + dx * 0.6, c.pos.z + dz * 0.6, y);
        const h = top - y;
        if (h > U.mantleReach + 0.05 && h <= U.mantleReach + 1.6) {
          kickUsed = true;
          const need = h - U.mantleReach + 0.45;
          c.vel.y = Math.max(c.vel.y, Math.sqrt(2 * U.gravity * need));
          c.vel.x = dx * Math.min(sp, 3); c.vel.z = dz * Math.min(sp, 3);
          Tt.wall(); stats.kicks++;
        }
      }
    }
    prevY = c.pos.y;
  }
  requestAnimationFrame(oldTownTick);
  window.__skyOldTown = { stats, awnings, houses };
}

// ---- iPhone (Safari) zoom guard ----------------------------------------
// iOS Safari ignores user-scalable=no. A two-finger move (stick thumb + camera thumb drifting
// together/apart) or a quick double tap zooms the whole page, and the zoom stays.
// Block the pinch / double-tap gestures, and undo any zoom that still gets through.
{
  const meta = document.querySelector('meta[name="viewport"]');
  const baseContent = meta ? meta.getAttribute('content') : '';
  const style = document.createElement('style');
  style.textContent = '*{touch-action:pan-y}html,body,#app,canvas#c,#hud,#touch,.tb{touch-action:none}input,textarea,select{font-size:16px}';
  document.head.appendChild(style);
  const opts = { passive: false, capture: true };
  for (const t of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(t, (e) => e.preventDefault(), opts);
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 || (e.scale && e.scale !== 1)) e.preventDefault(); }, opts);
  document.addEventListener('dblclick', (e) => e.preventDefault(), opts);
  let lastEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = performance.now();
    // a second tap on the bare canvas within 350 ms is a double-tap zoom; buttons keep their clicks
    if (now - lastEnd < 350 && e.target && e.target.id === 'c') e.preventDefault();
    lastEnd = now;
  }, opts);
  const vv = window.visualViewport;
  let resetting = false;
  const unzoom = () => {
    if (!vv || !meta || resetting || vv.scale <= 1.03) return;
    resetting = true;
    meta.setAttribute('content', baseContent.replace('initial-scale=1', 'initial-scale=1.0001'));
    setTimeout(() => {
      meta.setAttribute('content', baseContent);
      window.scrollTo(0, 0);
      resetting = false;
    }, 60);
  };
  if (vv) vv.addEventListener('resize', unzoom);
  window.addEventListener('orientationchange', () => setTimeout(unzoom, 300));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(unzoom, 200); });
  window.__zoomGuard = { unzoom, scale: () => (vv ? vv.scale : 1) };
}

// Gun feel (2026-10-24): layered gunshots with pitch jitter and a short tail,
// separate body / head / kill feedback, moving tracers, ejected brass, muzzle
// smoke and a small screen kick for SG and MG. The base game calls
// window.__gunFx.shot / .hit from its fire routine. All sound is synthesized
// and all meshes are pooled, so this adds no download weight.
{
  const { Ut, Tt, ni, Mn, wpc, c, Se, ue, Geom } = game;
  const { Box, Sphere, Mesh, Basic, Vector3: V3 } = Geom;
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ---- Sound ------------------------------------------------------------
  // The game's shared noise buffer (Ut.noise) is low-passed (about 115 Hz
  // corner), so it cannot make a crack. Gunshots use their own white noise.
  const whiteCache = new WeakMap();
  const getWhite = (ctx) => {
    let b = whiteCache.get(ctx);
    if (!b) {
      b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1.2), ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      whiteCache.set(ctx, b);
    }
    return b;
  };
  const busCache = new WeakMap();
  const getBus = (ctx, out) => {
    let bus = busCache.get(ctx);
    if (bus) return bus;
    const input = ctx.createGain();
    input.gain.value = 0.6;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) { const x = (i / 511.5) - 1; curve[i] = Math.tanh(2.4 * x) / Math.tanh(2.4); }
    shaper.curve = curve;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -22; comp.knee.value = 8; comp.ratio.value = 6;
    comp.attack.value = 0.002; comp.release.value = 0.09;
    const makeup = ctx.createGain(); makeup.gain.value = 1.45;
    input.connect(shaper); shaper.connect(comp); comp.connect(makeup); makeup.connect(out);
    // Room tail: a darkened, decaying noise impulse.
    const len = Math.floor(ctx.sampleRate * 0.7);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    const conv = ctx.createConvolver(); conv.buffer = ir;
    const dark = ctx.createBiquadFilter(); dark.type = 'lowpass'; dark.frequency.value = 3800;
    conv.connect(dark); dark.connect(out);
    // Slapback echo off a distant wall.
    const slap = ctx.createDelay(0.5); slap.delayTime.value = 0.09;
    const slapLp = ctx.createBiquadFilter(); slapLp.type = 'lowpass'; slapLp.frequency.value = 2600;
    slap.connect(slapLp); slapLp.connect(out);
    bus = { input, comp: makeup, conv, slap };
    busCache.set(ctx, bus);
    return bus;
  };
  // [gain, startHz, endHz, seconds, Q, filterType] for noise layers,
  // [gain, startHz, endHz, seconds] for the low thump.
  const REPORT = {
    HG: { rev: 0.28, slap: 0.2, click: 0.9,
      noise: [[0.8, 3800, 1400, 0.09, 1.2, 'bandpass'], [0.6, 4500, 600, 0.16, 0.8, 'lowpass']],
      thump: [[0.6, 170, 60, 0.12]] },
    SG: { rev: 0.45, slap: 0.3, click: 0.8,
      noise: [[0.8, 2400, 700, 0.14, 0.9, 'bandpass'], [1.0, 3000, 250, 0.38, 0.7, 'lowpass']],
      thump: [[1.0, 110, 35, 0.35]] },
    SMG: { rev: 0.08, slap: 0, click: 1.0,
      noise: [[0.7, 5200, 2200, 0.05, 1.4, 'bandpass'], [0.45, 5500, 900, 0.08, 0.8, 'lowpass']],
      thump: [[0.35, 240, 110, 0.06]] },
    MG: { rev: 0.14, slap: 0.1, click: 0.9,
      noise: [[0.8, 3200, 1100, 0.1, 1.0, 'bandpass'], [0.8, 4000, 400, 0.22, 0.8, 'lowpass']],
      thump: [[0.85, 140, 45, 0.2]] },
  };
  // Plays one report on `ctx` into `out`. Pitch and level change every shot.
  const gunVoice = (ctx, out, name, when = ctx.currentTime) => {
    const spec = REPORT[name] || REPORT.HG;
    const bus = getBus(ctx, out), white = getWhite(ctx);
    const t = when, j = rnd(0.92, 1.08), gv = rnd(0.9, 1.1);
    const noise = (g, f0, f1, d, q, type) => {
      const src = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), amp = ctx.createGain();
      src.buffer = white;
      flt.type = type; flt.Q.value = q;
      flt.frequency.setValueAtTime(f0 * j, t);
      flt.frequency.exponentialRampToValueAtTime(Math.max(40, f1 * j), t + d);
      amp.gain.setValueAtTime(g * gv, t);
      amp.gain.exponentialRampToValueAtTime(1e-4, t + d);
      src.connect(flt); flt.connect(amp); amp.connect(bus.input);
      src.start(t, Math.random() * 0.8); src.stop(t + d + 0.02);
    };
    noise(spec.click, 2500, 2500, 0.006, 0.7, 'highpass');
    for (const n of spec.noise) noise(...n);
    for (const [g, f0, f1, d] of spec.thump) {
      const osc = ctx.createOscillator(), amp = ctx.createGain();
      osc.frequency.setValueAtTime(f0 * j, t);
      osc.frequency.exponentialRampToValueAtTime(f1 * j, t + d);
      amp.gain.setValueAtTime(g * gv, t);
      amp.gain.exponentialRampToValueAtTime(1e-4, t + d);
      osc.connect(amp); amp.connect(bus.input);
      osc.start(t); osc.stop(t + d + 0.02);
    }
    if (spec.rev > 0) { const s = ctx.createGain(); s.gain.value = spec.rev; bus.comp.connect(s); s.connect(bus.conv); }
    if (spec.slap > 0) { const s = ctx.createGain(); s.gain.value = spec.slap; bus.comp.connect(s); s.connect(bus.slap); }
  };
  Tt.hg = () => {
    const name = wpc().n;
    const st = window.__skyAudio;
    if (st) st.shots[name] = (st.shots[name] || 0) + 1;
    if (Ut.ctx && Ut.master) gunVoice(Ut.ctx, Ut.master, name);
  };
  // Body hit: a dull thud. Head hit adds a bright "ping" on top of it.
  let lastHitSound = 0;
  Tt.hit = () => {
    const now = performance.now();
    if (now - lastHitSound < 35) return; // shotgun pellets hit several zombies at once
    lastHitSound = now;
    ni(0.34, rnd(135, 165), 0.09);
    Mn(0.3, 700, 0.8, 0.06);
  };
  const ping = () => {
    const ctx = Ut.ctx;
    if (!ctx || !Ut.master) return;
    const t = ctx.currentTime;
    for (const [f, g, d] of [[2300, 0.34, 0.16], [3450, 0.12, 0.1]]) {
      const osc = ctx.createOscillator(), amp = ctx.createGain();
      osc.frequency.value = f * rnd(0.98, 1.02);
      amp.gain.setValueAtTime(g, t);
      amp.gain.exponentialRampToValueAtTime(1e-4, t + d);
      osc.connect(amp); amp.connect(Ut.master);
      osc.start(t); osc.stop(t + d + 0.02);
    }
  };

  // ---- Pools ------------------------------------------------------------
  const mkPool = (n, geo, mat) => {
    const a = [];
    for (let i = 0; i < n; i++) {
      const m = new Mesh(geo, mat);
      m.visible = false; m.frustumCulled = false;
      ue.add(m);
      a.push({ m, t: 0, life: 0 });
    }
    return a;
  };
  const take = (pool) => pool.find((p) => p.life <= 0) || pool.reduce((a, b) => (a.t > b.t ? a : b));

  const boltGeo = new Box(1, 1, 1);
  const boltMat = new Basic({ color: 0xffe9a0, transparent: true, opacity: 0.9, depthWrite: false, blending: 2 });
  const bolts = mkPool(14, boltGeo, boltMat).map((p) => Object.assign(p, { s: new V3(), e: new V3(), d: 0, T: 0, lf: 0, w: 0.05 }));

  const shellGeo = new Box(1, 1, 1);
  const brassMat = new Basic({ color: 0xd9a640 });
  const redMat = new Basic({ color: 0xc03030 });
  const shells = mkPool(16, shellGeo, brassMat).map((p) => Object.assign(p, { v: new V3(), spin: new V3() }));

  const smokeGeo = new Sphere(1, 8, 6);
  const smokeMat = new Basic({ color: 0xa8a8a8, transparent: true, opacity: 0.2, depthWrite: false });
  const puffs = mkPool(10, smokeGeo, smokeMat).map((p) => Object.assign(p, { v: new V3() }));

  const goreGeo = new Box(1, 1, 1);
  const bloodMat = new Basic({ color: 0x6a1212 });
  const bloodHotMat = new Basic({ color: 0xd21c1c });
  const gore = mkPool(120, goreGeo, bloodMat).map((p) => Object.assign(p, { v: new V3() }));

  // ---- Emitters ---------------------------------------------------------
  const fwd = new V3(), right = new V3(), up = new V3(), back = new V3(), tmp = new V3();
  const basis = () => {
    right.set(1, 0, 0).applyQuaternion(Se.quaternion);
    up.set(0, 1, 0).applyQuaternion(Se.quaternion);
    back.set(0, 0, 1).applyQuaternion(Se.quaternion);
  };
  const bolt = (from, to, w) => {
    const p = take(bolts);
    p.s.copy(from); p.e.copy(to);
    p.d = p.s.distanceTo(p.e);
    if (p.d < 0.3) return;
    p.T = Math.max(0.06, p.d / 220);
    p.lf = Math.min(1, 3.2 / p.d);
    p.w = w;
    p.t = 0; p.life = 1;
  };
  const eject = (name) => {
    const p = take(shells);
    const big = name === 'SG';
    p.m.material = big ? redMat : brassMat;
    p.m.scale.set(big ? 0.03 : 0.018, big ? 0.03 : 0.018, big ? 0.07 : 0.05);
    p.m.position.copy(fwd).addScaledVector(back, 0.22).addScaledVector(right, 0.03).addScaledVector(up, 0.02);
    p.v.set(0, 0, 0)
      .addScaledVector(right, rnd(1.4, 2.2))
      .addScaledVector(up, rnd(1.3, 2.3))
      .addScaledVector(back, rnd(0.2, 0.8));
    p.spin.set(rnd(-18, 18), rnd(-18, 18), rnd(-18, 18));
    p.m.visible = true; p.t = 0; p.life = 0.75;
  };
  let puffCount = 0;
  const puff = (name) => {
    if ((name === 'SMG' || name === 'MG') && (puffCount++ % 4)) return;
    const p = take(puffs);
    p.m.position.copy(fwd).addScaledVector(back, -0.12);
    p.v.set(0, 0, 0).addScaledVector(back, -0.5).addScaledVector(up, 0.7)
      .addScaledVector(right, rnd(-0.15, 0.15));
    p.m.scale.setScalar(0.03);
    p.m.visible = true; p.t = 0; p.life = 0.55;
  };
  const spray = (pt, dir, n, mat, speed, size) => {
    for (let i = 0; i < n; i++) {
      const p = take(gore);
      p.m.material = mat;
      p.m.position.copy(pt);
      const k = size * rnd(0.6, 1.5);
      p.m.scale.set(k, k, k * rnd(1, 2.2));
      p.v.set(rnd(-1.5, 1.5), rnd(0.8, 2.8), rnd(-1.5, 1.5)).addScaledVector(dir, rnd(0.4, 1) * speed);
      p.m.visible = true; p.t = 0; p.life = rnd(0.45, 0.8);
    }
  };

  window.__gunFx = {
    shot(muzzle, end, w, dir) {
      basis();
      fwd.copy(muzzle);
      const name = w.n;
      if (w.cone) {
        for (let i = 0; i < 4; i++) {
          tmp.copy(dir).add(new V3(rnd(-0.22, 0.22), rnd(-0.22, 0.22), rnd(-0.22, 0.22))).normalize();
          const e2 = new V3().copy(muzzle).addScaledVector(tmp, rnd(5.5, 8.5));
          bolt(muzzle, e2, 0.035);
        }
        c.shake = Math.max(c.shake || 0, 0.55);
      } else {
        bolt(muzzle, end, name === 'SMG' ? 0.035 : 0.05);
        if (name === 'MG') c.shake = Math.max(c.shake || 0, 0.3);
      }
      eject(name);
      puff(name);
    },
    hit(head, pt, zom, dir) {
      const killed = !!zom.dead;
      const n = killed ? (head ? 26 : 18) : (head ? 14 : 5);
      spray(pt, dir, n, head ? bloodHotMat : bloodMat, killed ? 4.5 : 3, killed ? 0.085 : 0.065);
      if (head) {
        ping();
        if (killed) window.__stopT = 0.05; // brief hit-stop on a manual headshot kill
      }
    },
  };

  // ---- Per-frame update -------------------------------------------------
  let last = performance.now();
  const fxTick = () => {
    requestAnimationFrame(fxTick);
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (const p of bolts) {
      if (p.life <= 0) { p.m.visible = false; continue; }
      p.t += dt;
      const pr = p.t / p.T;
      if (pr >= 1 + p.lf) { p.life = 0; p.m.visible = false; continue; }
      const head = p.d * Math.min(1, pr), tail = p.d * Math.max(0, pr - p.lf);
      tmp.copy(p.e).sub(p.s).normalize();
      p.m.position.copy(p.s).addScaledVector(tmp, (head + tail) * 0.5);
      p.m.scale.set(p.w, p.w, Math.max(0.05, head - tail));
      p.m.lookAt(p.e);
      p.m.visible = true;
    }
    for (const p of shells) {
      if (p.life <= 0) continue;
      p.t += dt;
      if (p.t >= p.life) { p.life = 0; p.m.visible = false; continue; }
      p.v.y -= 9.8 * dt;
      p.m.position.addScaledVector(p.v, dt);
      p.m.rotation.x += p.spin.x * dt; p.m.rotation.y += p.spin.y * dt; p.m.rotation.z += p.spin.z * dt;
    }
    for (const p of puffs) {
      if (p.life <= 0) continue;
      p.t += dt;
      const k = p.t / p.life;
      if (k >= 1) { p.life = 0; p.m.visible = false; continue; }
      p.m.position.addScaledVector(p.v, dt);
      p.v.multiplyScalar(Math.exp(-dt * 2.5));
      p.m.scale.setScalar(0.03 + 0.09 * k);
    }
    for (const p of gore) {
      if (p.life <= 0) continue;
      p.t += dt;
      if (p.t >= p.life) { p.life = 0; p.m.visible = false; continue; }
      p.v.y -= 12 * dt;
      p.m.position.addScaledVector(p.v, dt);
    }
  };
  requestAnimationFrame(fxTick);
}
