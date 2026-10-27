import { formatReplayTime } from './replay-time.js?v=20261026-gear-polish-v1';
import { createFlashbang } from './flashbang.js?v=20261026-gear-polish-v1';
import { createGhostReplay } from './ghost-replay.js?v=20261027-corridor-v2';
import { createEasyWeaponPort, reloadLowered, UNITY_WEAPONS } from './easy-weapon-port.js?v=20261027-aim-v1';
import { createUnityExplosionFx } from './unity-explosion-fx.js?v=20261025-unity-blast-v10';
import { createFirstPersonWeapons } from './first-person-weapons.js?v=20261025-jump-tune-portrait-v1';
import { createDash } from './dash-boost.js?v=20261027-dash-v1';

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
  knifeRule.insertAdjacentHTML('afterend', '<li><kbd>E</kbd> 銃を撃つ　<kbd>R</kbd> 装填。HG・SG・SMG・MGとEasy Weaponsの8種から選べる</li>' +
    '<li>技（スライド・壁走り・縁つかみ・はしご・ジップライン・フック）を3回決めると閃光弾+1（最大2個）</li>' +
    '<li>少し高い壁に走って跳ぶと、壁を蹴って駆け上がる。日よけ布に落ちると大きく跳ねる</li>' +
    '<li><kbd>H</kbd> 自己ベストのときの走りを青い人影（ゴースト）で表示・非表示</li>');
}

const { WP, U, Jn, Et, ri, Tt, c, z, ue, fo, tl, vd, uh, mr, us, mo, $a: zipLines, jn, Geom } = game;
// Local trial runs should not be mixed into the published run records.
if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') {
  U.sendLog = false;
  const recNote = document.getElementById('recNote');
  if (recNote) recNote.hidden = true;
}
// Apply the new run-speed default once for players who already saved the former default.
try {
  const speedMigration = 'gunrun-run-speed-20261025';
  if (!localStorage.getItem(speedMigration)) {
    if (U.sprintSpeed === 8) { U.sprintSpeed = 6; game.Ua(); }
    localStorage.setItem(speedMigration, '1');
  }
} catch {}
const { Box, Cylinder, Torus, Sphere, Mesh, Group, Standard, Basic, Vector3 } = Geom;
window.skyDash = createDash(game, window.__game);
const easyPort = createEasyWeaponPort(game);
window.__easyWeaponPort = easyPort;
const palette = {
  steel: new Standard({ color: 0x292d31, metalness: 0.72, roughness: 0.48 }),
  dark: new Standard({ color: 0x171b1f, metalness: 0.42, roughness: 0.65 }),
  grip: new Standard({ color: 0x765341, metalness: 0.06, roughness: 0.92 }),
  amber: new Standard({ color: 0xffb95e, emissive: 0x9a5415, emissiveIntensity: 0.35, roughness: 0.55 }),
  silver: new Standard({ color: 0x9ba5a9, metalness: 0.78, roughness: 0.33 }),
  cloth: new Standard({ color: 0x343b40, roughness: 0.98 }),
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
const unityHgView = makeWeapon('Unity HG', (g) => {
  box(g, 0.115, 0.072, 0.25, palette.steel, 0, 0.055, -0.13);
  box(g, 0.118, 0.037, 0.24, palette.silver, 0, 0.104, -0.13);
  box(g, 0.07, 0.15, 0.074, palette.grip, 0, -0.065, -0.012).rotation.x = -0.22;
});
const easyWeaponViews = [
  makeWeapon('Easy Shotgun', (g) => { box(g, .13, .11, .34, palette.steel, 0, .04, -.14); cylinder(g, .032, .032, .44, palette.dark, 0, .06, -.37).rotation.x = Math.PI / 2; box(g, .10, .13, .26, palette.grip, 0, -.02, .16); }),
  makeWeapon('Easy M4', (g) => { box(g, .14, .12, .34, palette.steel, 0, .06, -.16); cylinder(g, .022, .022, .46, palette.dark, 0, .07, -.43).rotation.x = Math.PI / 2; box(g, .07, .21, .07, palette.dark, 0, -.08, -.12); box(g, .10, .10, .30, palette.grip, 0, -.02, .17); }),
  makeWeapon('Easy Rail Gun', (g) => { box(g, .17, .16, .36, palette.dark, 0, .06, -.16); box(g, .12, .07, .38, palette.silver, 0, .12, -.47); cylinder(g, .055, .055, .12, palette.amber, 0, .12, -.69).rotation.x = Math.PI / 2; box(g, .09, .17, .08, palette.grip, 0, -.06, .02); }),
  makeWeapon('Easy Beam Gun', (g) => { box(g, .15, .12, .32, palette.dark, 0, .06, -.14); cylinder(g, .045, .045, .40, palette.amber, 0, .07, -.40).rotation.x = Math.PI / 2; box(g, .10, .17, .08, palette.grip, 0, -.05, .01); }),
  makeWeapon('Easy Cluster Launcher', (g) => { box(g, .18, .15, .34, palette.steel, 0, .06, -.14); cylinder(g, .06, .06, .46, palette.dark, 0, .07, -.44).rotation.x = Math.PI / 2; box(g, .12, .17, .09, palette.grip, 0, -.06, .04); }),
  makeWeapon('Easy Rocket Launcher', (g) => { cylinder(g, .085, .085, .72, palette.dark, 0, .07, -.28).rotation.x = Math.PI / 2; cylinder(g, .10, .10, .10, palette.amber, 0, .07, -.67).rotation.x = Math.PI / 2; box(g, .12, .18, .12, palette.grip, 0, -.04, .12); }),
  makeWeapon('Easy M79', (g) => { box(g, .17, .15, .29, palette.steel, 0, .06, -.12); cylinder(g, .06, .06, .36, palette.dark, 0, .07, -.39).rotation.x = Math.PI / 2; box(g, .11, .2, .1, palette.grip, 0, -.07, .1); }),
];
const jumpGunView=makeWeapon('Jump Gun',g=>{
  const cyan=new Standard({color:0x57ddeb,roughness:.45,metalness:.5});
  box(g,.16,.13,.28,palette.steel,0,.05,-.12);
  cylinder(g,.065,.065,.38,palette.dark,0,.065,-.40,12).rotation.x=Math.PI/2;
  for(const depth of [-.27,-.43,-.57])cylinder(g,.077,.077,.035,cyan,0,.065,depth,12).rotation.x=Math.PI/2;
  box(g,.085,.17,.08,palette.grip,0,-.08,-.06);
  box(g,.075,.11,.10,palette.grip,0,-.05,-.35);
  box(g,.025,.025,.06,cyan,0,.14,-.16);
});
for (const view of [unityHgView, ...easyWeaponViews, jumpGunView]) {
  tl.remove(view);
  fo.add(view);
  view.scale.setScalar(0.75);
  view.position.set(0.38, -0.45, -0.62);
  view.rotation.set(-0.12, -0.72, 0);
}
// The exported weapon GLBs have no animation clips. The M4 and shotgun keep
// separate magazine meshes, which the reload clock can drive in the browser.
const easyFlashDepth = [-0.42, -0.70, -0.76, -0.82, -0.76, -0.87, -1.02, -0.73, -0.62];
const easyFlashes = [];
const easyMagazines = new Map();
let pistolSlide = null, pistolSlideRestZ = 0, pistolSlideTime = 0, pistolSlideLocked = false;
const PISTOL_SLIDE_TIME = 0.15, PISTOL_SLIDE_TRAVEL = 0.65;
const hgReloadMagazine = box(unityHgView, 0.064, 0.29, 0.09, palette.dark, 0, -0.2, -0.03);
hgReloadMagazine.name = 'HG reload magazine (GunRunReloadMotion)';
hgReloadMagazine.visible = false;
function bindEasyMagazine(index, root) {
  const name = index === 5 ? 'shotgun_magazine' : 'M4_Magazine';
  const magazine = root.getObjectByName(name);
  if (!magazine) return;
  root.updateMatrixWorld(true);
  const scale = Math.max(0.001, magazine.parent.getWorldScale(new Vector3()).y);
  easyMagazines.set(index, { magazine, y: magazine.position.y, rotation: magazine.rotation.x, scale });
}
function animateEasyMagazine(index, progress) {
  if (index === 4) {
    hgReloadMagazine.visible = progress >= 0.12 && progress < 0.48;
    if (hgReloadMagazine.visible) {
      const reach = progress < 0.26 ? (progress - 0.12) / 0.14 : progress < 0.4 ? 1 : 1 - (progress - 0.4) / 0.08;
      hgReloadMagazine.position.set(0, -0.2 - Math.max(0, reach) * 0.13, -0.03 + Math.max(0, reach) * 0.08);
    }
  } else hgReloadMagazine.visible = false;
  for (const [weapon, part] of easyMagazines) {
    const p = weapon === index ? progress : 0;
    const pull = p < 0.15 ? 0 : p < 0.31 ? (p - 0.15) / 0.16 : p < 0.43 ? 1 : p < 0.59 ? 1 - (p - 0.43) / 0.16 : 0;
    part.magazine.position.y = part.y - Math.max(0, pull) * 0.17 / part.scale;
    part.magazine.rotation.x = part.rotation + Math.max(0, pull) * 0.18;
  }
  const selected = easyMagazines.get(index);
  document.body.dataset.skyMagazine = JSON.stringify({ weapon: index, name: selected?.magazine.name || (index === 4 ? hgReloadMagazine.name : null), offset: selected ? +((selected.y - selected.magazine.position.y) * selected.scale).toFixed(3) : 0, visible: index === 4 ? hgReloadMagazine.visible : !!selected });
}
for (let index = 4; index < weaponViews.length; index++) {
  const flash = new Group();
  flash.name = 'Sky weapon muzzle flash';
  flash.userData.skyFlash = true;
  flash.position.set(0, 0.1, easyFlashDepth[index - 4]);
  const core = new Mesh(new Sphere(0.085, 8, 6), new Basic({ color: 0xffd578, transparent: true, opacity: 0.9, depthWrite: false }));
  const flare = new Mesh(new Box(0.025, 0.025, 0.3), new Basic({ color: 0xffa83b, transparent: true, opacity: 0.8, depthWrite: false }));
  flare.position.z = -0.12;
  flash.add(core, flare);
  flash.visible = false;
  weaponViews[index].add(flash);
  easyFlashes[index] = flash;
}

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
const loaded = { hg: false, sg: false, smg: false, mg: false, unityHg: false, easyShotgun: false, easyM4: false, easyRail: false, easyBeam: false, easyCluster: false, easyRocket: false, easyM79: false, glove: false, knife: false, ladder: false, hook: false, anchor: false, trolley: false, flashbang: false, error: '' };
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
function makeAnchor(x, y, z0) {
  // Clone a loaded model when the editor adds a point after GLB loading.
  const anchor = anchors.length && anchors[0].children.some((child) => child.name === 'Meshy grapple anchor mobile LOD')
    ? anchors[0].clone(true) : new Group();
  anchor.name = 'Sky grapple anchor';
  anchor.position.set(x, y, z0);
  if (!anchor.children.length) {
    const rim = ring(anchor, 0.38, 0.055, palette.amber);
    rim.rotation.x = Math.PI / 2;
    box(anchor, 0.22, 0.06, 0.22, palette.steel, 0, -0.09, 0);
    for (const dx of [-0.08, 0.08]) for (const dz of [-0.08, 0.08]) cylinder(anchor, 0.014, 0.014, 0.03, palette.silver, dx, -0.045, dz, 6);
  }
  ue.add(anchor);
  anchors.push(anchor);
}
for (const [x, y, z0] of us) makeAnchor(x, y, z0);

const HOOK_LAYOUT_KEY = 'gunrun-old-town-hook-layout-v1';
const builtInHooks = us.map(([x, y, z0]) => [x, y, z0]);
// The original game also creates two small meshes per built-in anchor. Hide
// those static copies so a moved or deleted anchor leaves no marker behind.
for (const [x, y, z0] of builtInHooks) {
  for (const object of ue.children) {
    if (!object.isMesh || Math.abs(object.position.x - x) > 0.001 || Math.abs(object.position.z - z0) > 0.001) continue;
    const ringShape = object.geometry?.type === 'TorusGeometry' && Math.abs(object.position.y - y) < 0.001;
    const boxShape = object.geometry?.type === 'BoxGeometry' && Math.abs(object.position.y - y - 0.35) < 0.001 &&
      Math.abs((object.geometry.parameters?.width || 0) - 0.08) < 0.001;
    if (ringShape || boxShape) object.visible = false;
  }
}
function validHookLayout(value) {
  if (!Array.isArray(value) || value.length > 64) return false;
  return value.every((point) => Array.isArray(point) && point.length === 3 &&
    point.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
    Math.abs(point[0]) <= 150 && point[1] >= -20 && point[1] <= 100 && Math.abs(point[2]) <= 150);
}
function applyHookLayout(points, persist = false) {
  if (!validHookLayout(points)) return false;
  const next = points.map(([x, y, z0]) => [x, y, z0]);
  while (anchors.length > next.length) ue.remove(anchors.pop());
  next.forEach(([x, y, z0], i) => {
    if (i < anchors.length) anchors[i].position.set(x, y, z0);
    else makeAnchor(x, y, z0);
  });
  us.splice(0, us.length, ...next);
  if (persist) {
    try { localStorage.setItem(HOOK_LAYOUT_KEY, JSON.stringify(next)); }
    catch { return false; }
  }
  return true;
}
window.skyHookEditor = {
  key: HOOK_LAYOUT_KEY,
  defaults: () => builtInHooks.map((point) => [...point]),
  current: () => us.map((point) => [...point]),
  apply: applyHookLayout,
  reset: () => {
    try { localStorage.removeItem(HOOK_LAYOUT_KEY); } catch { /* private browsing */ }
    return applyHookLayout(builtInHooks);
  },
};
try {
  const stored = localStorage.getItem(HOOK_LAYOUT_KEY);
  if (stored) applyHookLayout(JSON.parse(stored));
} catch { /* Corrupt or unavailable storage: keep the built-in points. */ }
window.addEventListener('storage', (event) => {
  if (event.key !== HOOK_LAYOUT_KEY) return;
  try { applyHookLayout(event.newValue ? JSON.parse(event.newValue) : builtInHooks); }
  catch { /* Keep the current layout. */ }
});
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
// Easy Weapons Pistol prefab: semi-auto raycast, 12 rounds/sec, 16-round magazine, 1.6-second reload.
// Keep damage and hit feedback on Air Corridor's existing combat path.
WP.push({ n: 'EW Pistol', mag: 16, res: 36, cd: 1 / 12, rl: 1.6, dmg: 1,
  head: 1, knock: 6.5, stun: 0.6, range: 90, cone: 0.05 });
// Easy Weapons prefab settings adapted to the existing hitscan combat loop.
WP.push(
  { n: 'Easy Shotgun', mag: 12, res: 24, cd: 0.5, rl: 2.1, dmg: 1.2, head: 1, knock: 9, stun: 0.9, range: 12, cone: 0.3 },
  { n: 'Easy M4', mag: 70, res: 140, cd: 1 / 12, rl: 2, dmg: 0.72, head: 1.5, knock: 4.5, stun: 0.45, range: 85, cone: 0, auto: 1 },
  { n: 'Easy Rail Gun', mag: 16, res: 32, cd: 1 / 3.5, rl: 1.6, dmg: 2.1, head: 1, knock: 9, stun: 0.9, range: 110, cone: 0, auto: 1 },
  { n: 'Easy Beam Gun', mag: 50, res: 100, cd: 0.1, rl: 2, dmg: 0.7, head: 1, knock: 3.2, stun: 0.35, range: 90, cone: 0, auto: 1 },
  { n: 'Easy Cluster', mag: 6, res: 18, cd: 0.5, rl: 2.4, dmg: 5.2, head: 1, knock: 8, stun: 0.8, range: 80, cone: 0, explosive: 4.8, auto: 1 },
  { n: 'Easy Rocket', mag: 6, res: 18, cd: 0.5, rl: 2.4, dmg: 6, head: 1, knock: 9, stun: 0.9, range: 90, cone: 0, explosive: 4, auto: 1 },
  { n: 'Easy M79', mag: 6, res: 18, cd: 1 / 3, rl: 2, dmg: 4.5, head: 1, knock: 8, stun: 0.8, range: 80, cone: 0, explosive: 3.2 },
  { n: 'Jump Gun', mag:1, res:99, cd:.55, rl:.8, dmg:0, head:0, knock:0, stun:0, range:4.5, cone:0, auto:0, jumpGun:true },
);
// Match the prefab's Semi/Full setting. The M79 is fired on charge release.
for (const [index, source] of Object.entries(UNITY_WEAPONS)) WP[+index].auto = source.trigger === 'full' ? 1 : 0;
Jn.weapon = Math.max(0, Math.min(12, Jn.weapon));
U.weapon = Math.max(0, Math.min(12, U.weapon | 0));
const weaponSlider = document.getElementById('s_weapon');
if (weaponSlider) {
  weaponSlider.max = '12';
  weaponSlider.parentElement.querySelector('label').textContent = '武器（0=HG 1=SG 2=SMG 3=MG 4=Pistol 5=Shotgun 6=M4 7=Rail 8=Beam 9=Cluster 10=Rocket 11=M79 12=Jump Gun）';
}
window.__wpSync?.();
const originalGunSound = Tt.hg;
Tt.hg = () => {
  originalGunSound();
  if (U.weapon === 3) Tt.thud(0.11, 0);
};

// Flashbang effects and zombie reactions run on the base simulation clock.
const flashbang = window.skyFlashbang = createFlashbang(game);

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

let lastFrame = performance.now(), lastWeapon = -1, lastMotionShots = window.__game?.stats?.shots || 0;
const weaponAmmo = new Map();
let lastRunClock = 0;
let easyKick = 0, easyFlashTime = 0;
function updateEquipment(now) {
  requestAnimationFrame(updateEquipment);
  const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  easyPort.tick(dt);
  updateKnifeCue();
  const mode = game.modeRef();
  const weapon = U.weapon | 0;
  if (mode === 'menu' || (mode === 'play' && z.t + 0.5 < lastRunClock)) weaponAmmo.clear();
  if (mode === 'play') lastRunClock = z.t;
  if (weapon !== lastWeapon) {
    weaponViews.forEach((view, index) => { view.visible = U.gunOn && c.state !== 'ladder' && index === weapon; });
    document.body.dataset.skyWeaponView = JSON.stringify({ weapon, name: WP[weapon]?.n, visible: weaponViews.filter((view) => view.visible).map((view) => view.name), parent: weaponViews[weapon]?.parent?.type, position: weaponViews[weapon]?.position.toArray(), scale: weaponViews[weapon]?.scale.toArray() });
    vd.position.z = [-0.25, -0.62, -0.34, -0.82, -0.25, -0.62, -0.72, -0.82, -0.72, -0.82, -0.9, -0.72][weapon] ?? -0.25;
    if ((mode === 'play' || mode === 'pause') && lastWeapon >= 0) {
      weaponAmmo.set(lastWeapon, { ammo: Et.ammo, reserve: Et.reserve, reloadT: Et.reloadT });
      const profile = WP[weapon];
      const saved = weaponAmmo.get(weapon);
      Et.mag = profile.mag;
      Et.reloadLen = profile.rl;
      Et.ammo = Math.min(saved?.ammo ?? profile.mag, profile.mag);
      Et.reserve = U.reserveAmmo >= 99 ? 99 : saved?.reserve ?? profile.res;
      Et.reloadT = saved?.reloadT ?? 0;
      Et.autoReload = 0;
    }
    lastWeapon = weapon;
  }
  weaponViews.forEach((view, index) => { view.visible = U.gunOn && c.state !== 'ladder' && index === weapon; });
  const shots = window.__game?.stats?.shots || 0;
  if (shots < lastMotionShots) lastMotionShots = shots;
  if (shots > lastMotionShots && weapon >= 4) {
    easyKick = Math.min(1, easyKick + (weapon >= 9 ? 1 : weapon === 5 ? 0.85 : 0.65));
    easyFlashTime = 0.095;
    if (weapon === 4) {
      pistolSlideTime = PISTOL_SLIDE_TIME;
      if (Et.ammo === 0) pistolSlideLocked = true;
    }
  }
  lastMotionShots = shots;
  easyKick *= Math.exp(-dt * 13);
  pistolSlideTime = Math.max(0, pistolSlideTime - dt);
  easyFlashTime = Math.max(0, easyFlashTime - dt);
  if (weapon >= 4) {
    const progress = Et.reloadT > 0 && Et.reloadLen > 0
      ? Math.max(0, Math.min(1, 1 - Et.reloadT / Et.reloadLen)) : 0;
    const reload = progress > 0 ? reloadLowered(progress) : 0;
    animateEasyMagazine(weapon, progress);
    if (pistolSlide) {
      if (weapon === 4 && Et.reloadT <= 0 && Et.ammo > 0) pistolSlideLocked = false;
      const phase = 1 - pistolSlideTime / PISTOL_SLIDE_TIME;
      const shotTravel = weapon === 4 && pistolSlideTime > 0 ? Math.sin(Math.PI * phase) : 0;
      const lockTravel = weapon === 4 && pistolSlideLocked
        ? progress < 0.78 ? 1 : Math.max(0, 1 - (progress - 0.78) / 0.17) : 0;
      const rackTravel = weapon === 4 && progress > 0.78 && progress < 0.95
        ? Math.sin(Math.PI * (progress - 0.78) / 0.17) * 0.5 : 0;
      const travel = Math.max(shotTravel, lockTravel, rackTravel) * PISTOL_SLIDE_TRAVEL;
      pistolSlide.position.z = pistolSlideRestZ - travel;
      if (weapon === 4) document.body.dataset.skySlide = JSON.stringify({
        name: pistolSlide.name, travel: +travel.toFixed(3), reload: +progress.toFixed(3),
        locked: pistolSlideLocked, localZ: +pistolSlide.position.z.toFixed(3),
      });
    }
    const speed = Math.hypot(c.vel.x, c.vel.z);
    const bob = mode === 'play' && c.onGround ? Math.sin(c.bob) * Math.min(0.016, speed * 0.002) : 0;
    const view = weaponViews[weapon];
    // Bring the receiver into frame while the magazine is out.
    view.position.set(0.38 - 0.08 * reload + bob, -0.45 + 0.12 * reload - 0.035 * easyKick, -0.62 + 0.15 * easyKick);
    view.rotation.set(-0.12 + 0.2 * easyKick + 0.08 * reload, -0.72 + 0.12 * reload, -0.1 * reload);
    easyFlashes[weapon].visible = easyFlashTime > 0 && U.gunOn && mode === 'play' && c.state !== 'ladder';
    document.body.dataset.skyWeaponMotion = JSON.stringify({ weapon, kick: +easyKick.toFixed(3), reload: +reload.toFixed(3), flash: easyFlashes[weapon].visible });
  }
  if (weapon === 8 && mode === 'play') {
    const heat = easyPort.state;
    document.getElementById('hAmmo').textContent = heat.beamCooling > 0 ? '冷却' : `${Math.max(0, Math.round((1 - heat.beamHeat / 2) * 100))}%`;
    document.getElementById('hRes').textContent = heat.beamCooling > 0 ? ` ${heat.beamCooling.toFixed(1)}秒 Easy Beam Gun` : ' 熱ゲージ Easy Beam Gun';
  }
  for (let index = 4; index < easyFlashes.length; index++) if (index !== weapon) easyFlashes[index].visible = false;
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
  loadDetail('unityHg', 'easy-weapons-pistol-slide.glb', (root) => {
    root.name = 'Easy Weapons Pistol';
    // The GLB's parent node already converts Unity units to metres.
    root.scale.setScalar(1.4);
    root.rotation.y = 0;
    root.position.set(0, -0.02, -0.13);
    pistolSlide = root.getObjectByName('Pistol_Slide');
    if (!pistolSlide) throw new Error('Pistol slide mesh missing');
    pistolSlideRestZ = pistolSlide.position.z;
    unityHgView.add(root);
    for (const child of unityHgView.children) if (child !== root && child !== hgReloadMagazine && !child.userData.skyFlash) child.visible = false;
  });
  const easyAssets = [
    ['easyShotgun', 5, 'easy-weapons-shotgun.glb', 2],
    ['easyM4', 6, 'easy-weapons-m4.glb', 2.2],
    ['easyRail', 7, 'easy-weapons-rail-gun.glb', 2],
    ['easyBeam', 8, 'easy-weapons-beam-gun.glb', 2],
    ['easyCluster', 9, 'easy-weapons-cluster-launcher.glb', 2],
    ['easyRocket', 10, 'easy-weapons-rocket-launcher.glb', 2.2],
    ['easyM79', 11, 'easy-weapons-m79-launcher.glb', 2],
  ];
  for (const [key, index, filename, scale] of easyAssets) {
    loadDetail(key, filename, (root) => {
      root.name = `Easy Weapons ${WP[index].n} model`;
      root.scale.setScalar(scale);
      root.rotation.y = 0;
      root.position.set(0, -0.02, index >= 9 ? -0.17 : -0.13);
      easyWeaponViews[index - 5].add(root);
      if (index === 5 || index === 6) bindEasyMagazine(index, root);
      for (const child of easyWeaponViews[index - 5].children) if (child !== root && !child.userData.skyFlash) child.visible = false;
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
  loadDetail('flashbang', 'smoke-grenade-meshy-low.glb', (root) => {
    root.name = 'Flashbang grenade mobile LOD';
    flashbang.setGrenadeTemplate(root);
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
  const audioStats = { zip: 0, hook: 0, ladder: 0, flashbang: 0, wallStep: 0, bgm: 0, shots: {} };
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

  };
  requestAnimationFrame(audioTick);
}
requestAnimationFrame(updateEquipment);
window.__skyUpgrade = { knifeStreak, flashbang, loaded, weaponViews, trolleyViews };
window.skyFirstPersonView = createFirstPersonWeapons(game, weaponViews, loaded, [tl, uh, hookLauncher]);

// Recording is shared by the local best ghost and the ranking viewer.
window.skyReplay = createGhostReplay(game);
window.__skyGhost = window.skyReplay;

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
  if (!window.SKY_CANYON_MAP) ue.add(decor);

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
    lines.style.opacity = window.skyDash ? '0' : playing ? String(Math.max(0, Math.min(0.55, (sp - U.sprintSpeed - 0.4) / 5))) : '0';
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
  const { Box, Sphere, Torus, Mesh, Basic, Vector3: V3 } = Geom;
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
    let byOut = busCache.get(ctx);
    if (!byOut) { byOut = new Map(); busCache.set(ctx, byOut); }
    let bus = byOut.get(out);
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
    const len = Math.floor(ctx.sampleRate * 0.5);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    const conv = ctx.createConvolver(); conv.buffer = ir;
    const dark = ctx.createBiquadFilter(); dark.type = 'lowpass'; dark.frequency.value = 2600;
    conv.connect(dark); dark.connect(out);
    // Slapback echo off a distant wall.
    const slap = ctx.createDelay(0.5); slap.delayTime.value = 0.09;
    const slapLp = ctx.createBiquadFilter(); slapLp.type = 'lowpass'; slapLp.frequency.value = 2600;
    slap.connect(slapLp); slapLp.connect(out);
    bus = { input, comp: makeup, conv, slap };
    byOut.set(out, bus);
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
  const gunVoice = (ctx, out, name, when = ctx.currentTime, lvl = 1, lowOnly = false) => {
    const spec = REPORT[name] || REPORT.HG;
    const bus = getBus(ctx, out), white = getWhite(ctx);
    const t = when, j = rnd(0.92, 1.08), gv = rnd(0.9, 1.1) * lvl;
    const noise = (g, f0, f1, d, q, type) => {
      const src = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), amp = ctx.createGain();
      src.buffer = white;
      flt.type = type; flt.Q.value = q;
      const lj = j * rnd(0.9, 1.1);
      flt.frequency.setValueAtTime(f0 * lj, t);
      flt.frequency.exponentialRampToValueAtTime(Math.max(40, f1 * lj), t + d * rnd(0.9, 1.15));
      amp.gain.setValueAtTime(g * gv, t);
      amp.gain.exponentialRampToValueAtTime(1e-4, t + d);
      src.connect(flt); flt.connect(amp); amp.connect(bus.input);
      src.start(t, Math.random() * 0.8); src.stop(t + d + 0.02);
    };
    if (!lowOnly) noise(spec.click, 2500, 2500, 0.006, 0.7, 'highpass');
    for (const n of (lowOnly ? spec.noise.slice(1) : spec.noise)) noise(...n);
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
  // Recorded shots go through a small "body" chain: low shelf for weight,
  // soft saturation for harmonics, then a fast compressor so the tail and
  // low end come up (a raw recording peaks hard and sounds thin by comparison).
  const procCache = new WeakMap();
  const getProc = (ctx, out) => {
    let p = procCache.get(ctx);
    if (p) return p;
    if (!out) throw new Error('getProc needs the output node on first use');
    const input = ctx.createGain();
    const shelf = ctx.createBiquadFilter(); shelf.type = 'lowshelf'; shelf.frequency.value = 180; shelf.gain.value = 2.5;
    const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 450; mid.Q.value = 0.8; mid.gain.value = 0;
    const sat = ctx.createWaveShaper();
    const cv = new Float32Array(1024);
    for (let i = 0; i < cv.length; i++) { const x = (i / 511.5) - 1; cv[i] = Math.tanh(1.25 * x) / Math.tanh(1.25); }
    sat.curve = cv;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 10; comp.ratio.value = 3; comp.attack.value = 0.001; comp.release.value = 0.16;
    const makeup = ctx.createGain(); makeup.gain.value = 1.3;
    // Everything (sample, body layers, synth boom) meets in `mix`, then a limiter keeps the sum from clipping.
    const mix = ctx.createGain();
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -7; limit.knee.value = 2; limit.ratio.value = 20; limit.attack.value = 0.001; limit.release.value = 0.12;
    input.connect(shelf); shelf.connect(mid); mid.connect(sat); sat.connect(comp); comp.connect(makeup); makeup.connect(mix);
    const trim = ctx.createGain(); trim.gain.value = 0.9;
    mix.connect(limit); limit.connect(trim); trim.connect(out);
    p = { input, mix };
    procCache.set(ctx, p);
    return p;
  };
  const playProcessed = (ctx, out, buf, gain, rate, when, rev = 0) => {
    const p = getProc(ctx, out);
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buf; src.playbackRate.value = rate; g.gain.value = gain;
    src.connect(g); g.connect(p.input);
    if (rev > 0) { const send = ctx.createGain(); send.gain.value = rev; g.connect(send); send.connect(getBus(ctx, p.mix).conv); }
    src.start(when);
  };

  // Low "body" layer: the library's recordings are high-passed (almost nothing
  // under 300 Hz), so the weight of the shot comes from this pitched thump.
  // It starts at 100-300 Hz (phone speakers can't play much lower) and is
  // saturated so its harmonics carry the weight on small speakers too.
  const BODY = {
    HG: [[0.85, 230, 85, 0.16]],
    SG: [[1.0, 140, 50, 0.38], [0.5, 280, 110, 0.2]],
    SMG: [[0.7, 260, 105, 0.13]],
    MG: [[0.9, 190, 75, 0.2]],
  };
  let bodySat = new WeakMap();
  const bodyLayer = (ctx, name, when, k) => {
    const p = getProc(ctx, Ut.master);
    let sat = bodySat.get(ctx);
    if (!sat) {
      sat = ctx.createWaveShaper();
      const cv = new Float32Array(1024);
      for (let i = 0; i < cv.length; i++) { const x = (i / 511.5) - 1; cv[i] = Math.tanh(2.6 * x) / Math.tanh(2.6); }
      sat.curve = cv; sat.connect(p.mix); bodySat.set(ctx, sat);
    }
    const j = rnd(0.94, 1.06);
    for (const [g, f0, f1, d] of (BODY[name] || BODY.HG)) {
      const osc = ctx.createOscillator(), amp = ctx.createGain();
      osc.frequency.setValueAtTime(f0 * j, when);
      osc.frequency.exponentialRampToValueAtTime(f1 * j, when + d);
      amp.gain.setValueAtTime(g * k, when);
      amp.gain.exponentialRampToValueAtTime(1e-4, when + d);
      osc.connect(amp); amp.connect(sat);
      osc.start(when); osc.stop(when + d + 0.02);
    }
  };

  // Recorded shots: four weapons, two takes each, cut from "The Free Firearm
  // Sound Library" (CC0, no credit required; Walther PPQ, Winchester Model 12,
  // Carl Gustav M45, AK-47), about 0.1 MB in total. The recordings are cut
  // dry, just before the range echo that follows every shot (0.07-0.16 s), so
  // no stray reflections or handling noise are heard. Each shot = the dry
  // recording through the body chain + a pitched low thump + a clean synthetic
  // room tail. Until the files finish decoding (or if they fail to load) the
  // fully synthesized report is used.
  // Faithful takes: the recordings as they are (1.2 s with the natural room tail), plus short one-shot "heads"
  // (smgh*, mgh*, about 93 ms) that are used for the next shots of a burst so tails do not pile up.
  const SAMPLES = {
    HG: ['hg1', 'hg2'], SG: ['sg1', 'sg2', 'sg3', 'sg4'],
    SMG: ['smgh1', 'smgh2', 'smgh3', 'smgh4', 'smgh5', 'smgh6', 'smgh7', 'smgh8', 'smgh9', 'smgl1', 'smgl2'],
    MG: ['mg1', 'mg2', 'mg3', 'mg4', 'mgh1', 'mgh2', 'mgh3', 'mgh4', 'mgh5', 'mgh6'],
  };
  // ?snd=full brings back the previous processing (synthetic sine thump, heavier saturation) for A/B listening.
  // Default: the stereo recording as it is (1.5 ms fade-in, cosine fade-out, a safety limiter, nothing else), with its
  // natural room tail; this keeps the texture of the original files (the user preferred it to every processed version). ?snd=body = adds a low shelf and an octave-down layer, ?snd=full = the old heavy chain.
  const SND_MODE = (typeof location !== 'undefined' && (location.search || '').match(/[?&]snd=(\w+)/) || [])[1] || 'raw';
  const SND_FULL = SND_MODE === 'full';
  const SND_DEBUG = typeof location !== 'undefined' && /[?&]snd_debug=1\b/.test(location.search || '');
  const RAW_GAIN = { HG: 0.6, SG: 0.8, SMG: 0.8, MG: 0.85 };
  // Weight for the raw mode (the library's recordings are high-passed, so they feel shallow): a gentle low shelf
  // plus the same recording an octave down and low-passed, fading out. Linear, no compression or saturation.
  // Only used with ?snd=body.
  const RAW_BODY = { HG: { sub: 0.6, shelf: 2 }, SG: { sub: 0.6, shelf: 2 }, SMG: { sub: 1.5, shelf: 3 }, MG: { sub: 0.7, shelf: 2 } };
  const rawLimiter = new WeakMap();
  // Low end of the natural mode: the recording itself, an octave down and low-passed.
  const SUB_GAIN = { HG: 0.4, SG: 0.8, SMG: 0.7, MG: 0.4 };
  const SAMPLE_GAIN = { HG: 0.72, SG: 1.25, SMG: 0.55, MG: 1.0 };
  const BODY_GAIN = { HG: 0.32, SG: 0.09, SMG: 0.3, MG: 0.25 };
  const ROOM = { HG: 0.3, SG: 0.42, SMG: 0.18, MG: 0.24 };
  const sampleBuf = {}, lastPick = {};
  window.__gunSamples = sampleBuf;
  let sampleCtx = null;
  // The files are fetched as soon as this module loads (no audio context needed), so decoding is all that is
  // left once the context exists; otherwise the first shots after starting could fall back to the synthetic sound.
  const SFX_VER = '20261024-12';
  const sfxBytes = {};
  const EASY_FIRE = {
    4: ['pistol_fire_1.wav', 0.50],
    5: ['shotgun_fire_1.wav', 0.56],
    6: ['rifle_fire_1.wav', 0.48],
    7: ['laser_fire_1.wav', 0.50],
    8: ['deep_beam.mp3', 0.56],
    9: ['rocket_launch_2.wav', 0.52],
    10: ['rocket_launch_1.wav', 0.52],
    11: ['rocket_launch_2.wav', 0.52],
  };
  const easySoundFiles = [...new Set([...Object.values(EASY_FIRE).map(([file]) => file), 'reload_1.wav'])];
  const easySoundBytes = Object.fromEntries(easySoundFiles.map((file) => [file,
    fetch(`./assets/sfx/easy-weapons/${file}?v=ew-20261025-1`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .catch(() => null),
  ]));
  const easySoundBuffers = {};
  let easySoundCtx = null;
  const loadEasySounds = () => {
    const ctx = Ut.ctx;
    if (!ctx || easySoundCtx === ctx) return;
    easySoundCtx = ctx;
    for (const file of easySoundFiles) {
      easySoundBytes[file]
        .then((ab) => (ab ? new Promise((ok, no) => ctx.decodeAudioData(ab.slice(0), ok, no)) : null))
        .then((buffer) => { if (buffer) easySoundBuffers[file] = buffer; })
        .catch(() => {});
    }
  };
  const warmEasySounds = () => {
    if (Ut.ctx) loadEasySounds();
    else requestAnimationFrame(warmEasySounds);
  };
  requestAnimationFrame(warmEasySounds);
  const playEasySound = (file, gain, duration = 0) => {
    if (!Ut.ctx || !Ut.master || !easySoundBuffers[file]) return false;
    const ctx = Ut.ctx, src = ctx.createBufferSource(), amp = ctx.createGain();
    src.buffer = easySoundBuffers[file];
    if (duration > 0) src.playbackRate.value = Math.max(0.5, Math.min(2, src.buffer.duration / duration));
    amp.gain.value = gain;
    src.connect(amp); amp.connect(Ut.master); src.start();
    document.body.dataset.skyGunSound = file;
    return true;
  };
  // The explosion recording is downloaded only when an explosive weapon is
  // selected. The shared synthesized bang remains the fallback while it loads.
  let explosionBytes = null, explosionBuffer = null, explosionCtx = null;
  const warmExplosionSound = () => {
    if (!explosionBytes) explosionBytes = fetch('./assets/sfx/easy-weapons/explosion_4.wav?v=20261025-unity-blast-v1')
      .then((r) => r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status))))
      .catch(() => null);
    if (!Ut.ctx || explosionCtx === Ut.ctx) return;
    const ctx = Ut.ctx;
    explosionCtx = ctx;
    explosionBuffer = null;
    explosionBytes.then((bytes) => bytes ? new Promise((ok, no) => ctx.decodeAudioData(bytes.slice(0), ok, no)) : null)
      .then((buffer) => { if (explosionCtx === ctx) explosionBuffer = buffer; })
      .catch(() => {});
  };
  const playExplosionSound = () => {
    warmExplosionSound();
    if (!Ut.ctx || !Ut.master || !explosionBuffer) return false;
    const source = Ut.ctx.createBufferSource(), gain = Ut.ctx.createGain();
    source.buffer = explosionBuffer;
    gain.gain.value = 0.62;
    source.connect(gain); gain.connect(Ut.master); source.start();
    document.body.dataset.skyExplosionSound = 'explosion_4.wav';
    return true;
  };
  let beamSource = null, beamGain = null;
  const playBeamSound = () => {
    if (beamSource) return true;
    if (!Ut.ctx || !Ut.master || !easySoundBuffers['deep_beam.mp3']) return false;
    beamSource = Ut.ctx.createBufferSource();
    beamGain = Ut.ctx.createGain();
    beamSource.buffer = easySoundBuffers['deep_beam.mp3'];
    beamSource.loop = true;
    beamGain.gain.value = 0.48;
    beamSource.connect(beamGain); beamGain.connect(Ut.master);
    beamSource.start();
    document.body.dataset.skyGunSound = 'deep_beam.mp3 (loop)';
    return true;
  };
  const syncBeamSound = () => {
    if (beamSource && ((U.weapon | 0) !== 8 || !Et.held || game.modeRef() !== 'play' || easyPort.state.beamCooling > 0)) {
      beamGain.gain.setTargetAtTime(0, Ut.ctx.currentTime, 0.025);
      beamSource.stop(Ut.ctx.currentTime + 0.12);
      beamSource = null;
      beamGain = null;
    }
    requestAnimationFrame(syncBeamSound);
  };
  requestAnimationFrame(syncBeamSound);
  for (const ids of Object.values(SAMPLES)) {
    for (const id of ids) {
      sfxBytes[id] = fetch(`./assets/sfx/${id}.wav?v=${SFX_VER}`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .catch(() => null);
    }
  }
  const loadSamples = () => {
    const ctx = Ut.ctx;
    if (!ctx || sampleCtx === ctx) return;
    sampleCtx = ctx;
    loadEasySounds();
    for (const [name, ids] of Object.entries(SAMPLES)) {
      for (const id of ids) {
        sfxBytes[id]
          .then((ab) => (ab ? new Promise((ok, no) => ctx.decodeAudioData(ab.slice(0), ok, no)) : null))
          .then((buf) => { if (buf) { buf.__id = id; buf.__head = /^(smg|mg)h\d/.test(id); (sampleBuf[name] = sampleBuf[name] || []).push(buf); } })
          .catch(() => { /* keep the synthesized sound */ });
      }
    }
  };
  // Take picker: never the same take twice in a row, and not the one before that either.
  const recent = {};
  const pickTake = (name, n) => {
    const r = recent[name] || (recent[name] = []);
    let i, guard = 0;
    do { i = Math.floor(Math.random() * n); } while (n > 2 && r.includes(i) && ++guard < 12);
    r.push(i); if (r.length > Math.min(2, n - 1)) r.shift();
    return i;
  };
  const lastShotAt = {};
  const playSample = (ctx, name, when = ctx.currentTime) => {
    const all = sampleBuf[name];
    if (!all || !all.length) return false;
    // Burst shots (less than 0.2 s after the previous one) use the short heads when the weapon has them.
    const heads = all.filter((b) => b.__head), longs = all.filter((b) => !b.__head);
    const gap = when - (lastShotAt[name] === undefined ? -9 : lastShotAt[name]);
    lastShotAt[name] = when;
    const list = heads.length && longs.length ? (gap < 0.2 ? heads : longs) : all;
    const buf = list[pickTake(name + (list === heads ? '/h' : ''), list.length)];
    if (SND_DEBUG) {
      let el = document.getElementById('sndDebug');
      if (!el) { el = document.createElement('div'); el.id = 'sndDebug'; el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99;font:700 14px monospace;color:#fff;background:#000a;padding:4px 8px;pointer-events:none'; document.body.appendChild(el); }
      el.textContent = `${name} ${buf.__id}`;
    }
    if (SND_MODE === 'raw' || SND_MODE === 'pure' || SND_MODE === 'body') {
      let lim = rawLimiter.get(ctx);
      if (!lim) {
        lim = ctx.createDynamicsCompressor();
        lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
        lim.connect(Ut.master); rawLimiter.set(ctx, lim);
      }
      const src = ctx.createBufferSource(), g = ctx.createGain();
      const r = name === 'HG' ? rnd(0.95, 1.05) : rnd(0.985, 1.015), gn = RAW_GAIN[name] * rnd(0.92, 1.05);
      src.buffer = buf; src.playbackRate.value = r; g.gain.value = gn;
      const body = SND_MODE === 'body' ? RAW_BODY[name] : null;
      if (body) {
        const sh = ctx.createBiquadFilter(); sh.type = 'lowshelf'; sh.frequency.value = 180; sh.gain.value = body.shelf;
        src.connect(g); g.connect(sh); sh.connect(lim);
        const s2 = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g2 = ctx.createGain();
        s2.buffer = buf; s2.playbackRate.value = r * 0.5;
        lp.type = 'lowpass'; lp.frequency.value = 450; lp.Q.value = 0.6;
        g2.gain.setValueAtTime(gn * body.sub, when);
        g2.gain.exponentialRampToValueAtTime(1e-3, when + Math.min(buf.duration * 2, 0.5));
        s2.connect(lp); lp.connect(g2); g2.connect(lim);
        s2.start(when); s2.stop(when + Math.min(buf.duration * 2, 0.5) + 0.05);
      } else { src.connect(g); g.connect(lim); }
      src.start(when);
      return true;
    }
    const rate = rnd(0.97, 1.03), gain = SAMPLE_GAIN[name] * 0.9 * rnd(0.88, 1.08);
    playProcessed(ctx, Ut.master, buf, gain, rate, when, ROOM[name]);
    if (SND_FULL) bodyLayer(ctx, name, when, BODY_GAIN[name]);
    else {
      const p = getProc(ctx, Ut.master);
      const src = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = buf; src.playbackRate.value = rate * 0.5;
      lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 0.6;
      g.gain.setValueAtTime(gain * SUB_GAIN[name], when);
      g.gain.exponentialRampToValueAtTime(1e-3, when + buf.duration * 2.0);
      src.connect(lp); lp.connect(g); g.connect(p.mix);
      src.start(when);
    }
    return true;
  };
  Tt.hg = () => {
    const name = wpc().n;
    const weaponIndex = U.weapon | 0;
    document.body.dataset.skyGunSound = '';
    const st = window.__skyAudio;
    if (st) st.shots[name] = (st.shots[name] || 0) + 1;
    if (!Ut.ctx || !Ut.master) return;
    if (weaponIndex === 12) { window.skyJumpGun.playSound(); return; }
    loadSamples();
    if (weaponIndex >= 4) {
      const [file, gain] = EASY_FIRE[weaponIndex] || EASY_FIRE[4];
      if (!(weaponIndex === 8 ? playBeamSound() : playEasySound(file, gain))) gunVoice(Ut.ctx, Ut.master,
        ({ 4: 'HG', 5: 'SG', 6: 'MG', 7: 'HG', 8: 'SMG', 9: 'SG', 10: 'SG', 11: 'SG' })[weaponIndex]);
    } else if (!playSample(Ut.ctx, name)) gunVoice(Ut.ctx, Ut.master, name);
  };
  const previousReloadSound = Tt.reload;
  Tt.reload = () => {
    if ((U.weapon | 0) >= 4) {
      loadEasySounds();
      if (!playEasySound('reload_1.wav', 0.46, Et.reloadLen)) Mn(0.18, 1700, 0.8, 0.06, 'bandpass');
    } else if (typeof previousReloadSound === 'function') previousReloadSound();
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
  // Start the small download when play begins; a very early first hit waits for it.
  let headshotBuffer = null, headshotLoading = null;
  const loadHeadshot = () => {
    if (!Ut.ctx) return Promise.resolve(null);
    if (headshotBuffer) return Promise.resolve(headshotBuffer);
    if (!headshotLoading) {
      const ctx = Ut.ctx;
      headshotLoading = fetch('./assets/sfx/gunrun-headshot.mp3')
        .then((r) => r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status))))
        .then((ab) => new Promise((ok, no) => ctx.decodeAudioData(ab, ok, no)))
        .then((buffer) => { headshotBuffer = buffer; return buffer; })
        .catch(() => { headshotLoading = null; return null; });
    }
    return headshotLoading;
  };
  document.getElementById('bStart')?.addEventListener('click', loadHeadshot);
  const playHeadshot = () => {
    if (!Ut.ctx || !Ut.master || !headshotBuffer) return;
    const src = Ut.ctx.createBufferSource(), gain = Ut.ctx.createGain();
    src.buffer = headshotBuffer;
    gain.gain.value = 0.42;
    src.connect(gain); gain.connect(Ut.master); src.start();
  };
  const ping = () => {
    if (!Ut.ctx || !Ut.master) return;
    if (headshotBuffer) { playHeadshot(); return; }
    loadHeadshot().then((buffer) => {
      if (buffer) playHeadshot();
      else ni(0.42, rnd(88, 100), 0.12);
    });
  };

  // ---- Pools ------------------------------------------------------------
  // Sizes below are scaled by distance: a 7 cm cube 15 m away is about 2 px on
  // a phone, so near-constant screen size is what makes the effects readable.
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
  // Normal blending: the old additive pale streak vanished against the bright sand.
  const boltMat = new Basic({ color: 0xff7a10 });
  const bolts = mkPool(14, boltGeo, boltMat).map((p) => Object.assign(p, { s: new V3(), e: new V3(), d: 0, T: 0, lf: 0, w: 0.05 }));

  const shellGeo = new Box(1, 1, 1);
  const brassMat = new Basic({ color: 0xe0a830 });
  const redMat = new Basic({ color: 0xd03030 });
  const shells = mkPool(16, shellGeo, brassMat).map((p) => Object.assign(p, { v: new V3(), spin: new V3() }));

  const smokeGeo = new Sphere(1, 8, 6);
  const smokeMat = new Basic({ color: 0xb8b8b8, transparent: true, opacity: 0.3, depthWrite: false });
  const puffs = mkPool(10, smokeGeo, smokeMat).map((p) => Object.assign(p, { v: new V3() }));

  const goreGeo = new Box(1, 1, 1);
  const bloodMat = new Basic({ color: 0x9a1010 });
  const bloodHotMat = new Basic({ color: 0xe01818 });
  const gore = mkPool(140, goreGeo, bloodMat).map((p) => Object.assign(p, { v: new V3(), size: 0.1 }));

  const popGeo = new Sphere(1, 8, 6);
  const popMat = new Basic({ color: 0xfff0b0 });
  const popHeadMat = new Basic({ color: 0xff5030 });
  const pops = mkPool(8, popGeo, popMat).map((p) => Object.assign(p, { size: 0.2 }));
  const unityExplosionFx = createUnityExplosionFx(Geom, ue, c);
  window.__skyBlastFx = (point, radius, direction = [0, 0, -1], weapon = '') => {
    unityExplosionFx.burst(point, radius, direction, weapon);
    return playExplosionSound();
  };

  // The muzzle flash material is additive too; make it a solid warm yellow.
  try {
    const grp = game.vd.children.find((o) => o.children && o.children.length === 3 &&
      o.children[0].material && o.children[0].material.blending === 2);
    if (grp) {
      const m = grp.children[0].material;
      m.blending = 1; m.color.setHex(0xffe070); m.opacity = 0.9; m.needsUpdate = true;
    }
  } catch (e) { /* cosmetic only */ }
  const style = document.createElement('style');
  style.textContent = '.hitm.big{width:40px;height:40px;margin:-20px}';
  document.head.appendChild(style);
  const hitmEl = document.getElementById('hitm');

  // Hit flash: the struck zombie glows red for 0.1 s. Materials are cloned per
  // zombie on first hit so other zombies sharing the skin don't flash too.
  const flashing = [];
  const flashZombie = (zom) => {
    try {
      const root = zom.m && zom.m.root;
      if (!root) return;
      if (!zom._fxMats) {
        zom._fxMats = [];
        root.traverse((o) => {
          if (!o.isMesh || !o.material) return;
          const list = [].concat(o.material);
          if (!list.every((m) => m.emissive && m.clone)) return;
          const cloned = list.map((m) => m.clone());
          o.material = Array.isArray(o.material) ? cloned : cloned[0];
          for (const m of cloned) { m.userData._e = m.emissive.getHex(); zom._fxMats.push(m); }
        });
      }
      for (const m of zom._fxMats) { m.emissive.setHex(0xff3a1a); m.emissiveIntensity = 1.4; }
      zom._fxFlash = 0.1;
      if (!flashing.includes(zom)) flashing.push(zom);
    } catch (e) { /* cosmetic only */ }
  };

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
    p.T = Math.max(0.07, p.d / 200);
    p.lf = Math.min(1, 5 / p.d);
    p.w = w;
    p.t = 0; p.life = 1;
  };
  const eject = (name) => {
    const p = take(shells);
    const big = name === 'SG' || name === 'Easy Shotgun';
    p.m.material = big ? redMat : brassMat;
    p.m.scale.set(big ? 0.04 : 0.024, big ? 0.04 : 0.024, big ? 0.09 : 0.06);
    p.m.position.copy(fwd).addScaledVector(back, 0.1).addScaledVector(right, 0.02).addScaledVector(up, 0.03);
    // Carry the player's own velocity so a running player doesn't leave the brass behind at once.
    p.v.set(c.vel.x * 0.85, c.vel.y * 0.5, c.vel.z * 0.85)
      .addScaledVector(right, rnd(0.9, 1.5))
      .addScaledVector(up, rnd(1.2, 1.9))
      .addScaledVector(back, rnd(0.1, 0.4));
    p.spin.set(rnd(-18, 18), rnd(-18, 18), rnd(-18, 18));
    p.m.visible = true; p.t = 0; p.life = 0.8;
  };
  let puffCount = 0;
  const puff = (name) => {
    if ((name === 'SMG' || name === 'MG') && (puffCount++ % 4)) return;
    const p = take(puffs);
    p.m.position.copy(fwd).addScaledVector(back, -0.12);
    p.v.set(c.vel.x * 0.6, c.vel.y * 0.3, c.vel.z * 0.6).addScaledVector(back, -0.5).addScaledVector(up, 0.7)
      .addScaledVector(right, rnd(-0.15, 0.15));
    p.m.scale.setScalar(0.04);
    p.m.visible = true; p.t = 0; p.life = 0.6;
  };
  const spray = (pt, dir, n, mat, speed, size) => {
    for (let i = 0; i < n; i++) {
      const p = take(gore);
      p.m.material = mat;
      p.m.position.copy(pt);
      p.size = size * rnd(0.6, 1.4);
      p.m.scale.set(p.size, p.size, p.size * rnd(1, 2.2));
      p.v.set(rnd(-1.5, 1.5), rnd(0.8, 2.8), rnd(-1.5, 1.5)).addScaledVector(dir, rnd(0.4, 1) * speed);
      p.m.visible = true; p.t = 0; p.life = rnd(0.5, 0.85);
    }
  };
  const pop = (pt, dist, head, killed) => {
    const p = take(pops);
    p.m.material = head ? popHeadMat : popMat;
    p.m.position.copy(pt);
    p.size = Math.max(killed ? 0.3 : 0.18, dist * (killed ? 0.03 : 0.02));
    p.m.scale.setScalar(p.size * 0.4);
    p.m.visible = true; p.t = 0; p.life = 0.1;
  };

  // Effects that stay hidden until the first shot (muzzle flash, tracers, brass,
  // smoke, blood) make the browser build new shaders on the first shot, which
  // stalls that frame. Fire one invisible-for-a-frame warm-up of each effect
  // (visuals only, no sound) while the menu is up so the shaders exist already.
  window.__gunFxWarm = () => {
    try {
      const w = game.WP && game.WP[0] || { n: 'HG', cone: 0 };
      const p = new V3(0, -500, 0), q = new V3(0, -500, -3), d = new V3(0, 0, -1);
      window.__gunFx.shot(p, q, w, d);
      window.__gunFx.shot(p, q, { n: 'SG', cone: 0.4 }, d);
      window.__gunFx.hit(true, p, { dead: true, m: null }, d);
      const R = window.__game.debug.renderer;
      // The world and the first-person gun/hands are separate passes (ue/Se and
      // fo/za), and the muzzle flash lives in the second one.
      for (const [scene, cam] of [[ue, Se], [game.fo, game.za]]) {
        if (!scene || !cam) continue;
        const hidden = [];
        scene.traverse((o) => { if (!o.visible && o.material && !o.isSkinnedMesh) hidden.push(o); });
        hidden.forEach((o) => { o.visible = true; });
        R.compile(scene, cam);
        hidden.forEach((o) => { o.visible = false; });
      }
    } catch (e) { /* optional warm-up */ }
  };
  setTimeout(window.__gunFxWarm, 3000);

  window.__gunFx = {
    shot(muzzle, end, w, dir) {
      basis();
      fwd.copy(muzzle);
      const name = w.n;
      if (w.cone) {
        for (let i = 0; i < (name === 'Easy Shotgun' ? 6 : 4); i++) {
          tmp.copy(dir).add(new V3(rnd(-0.22, 0.22), rnd(-0.22, 0.22), rnd(-0.22, 0.22))).normalize();
          const e2 = new V3().copy(muzzle).addScaledVector(tmp, rnd(5.5, 8.5));
          bolt(muzzle, e2, 0.05);
        }
        c.shake = Math.max(c.shake || 0, 0.55);
      } else {
        bolt(muzzle, end, name === 'SMG' ? 0.045 : 0.06);
        if (name === 'MG') c.shake = Math.max(c.shake || 0, 0.3);
      }
      if (!w.explosive && !/Rail Gun|Beam Gun/.test(name)) eject(name);
      puff(name);
    },
    hit(head, pt, zom, dir) {
      const killed = !!zom.dead;
      const dist = pt.distanceTo(Se.position);
      const n = killed ? (head ? 32 : 22) : (head ? 16 : 8);
      spray(pt, dir, n, head ? bloodHotMat : bloodMat, killed ? 5 : 3.4,
        Math.max(killed ? 0.09 : 0.07, dist * (killed ? 0.013 : 0.009)));
      pop(pt, dist, head, killed);
      flashZombie(zom);
      if (hitmEl) hitmEl.classList.toggle('big', killed);
      if (head) {
        ping();
        if (killed) window.__stopT = 0.05; // brief hit-stop on a manual headshot kill
      }
    },
    step: null,
  };

  // ---- Per-frame update -------------------------------------------------
  const fxStep = (dt) => {
    unityExplosionFx.step(dt);
    for (const p of bolts) {
      if (p.life <= 0) { p.m.visible = false; continue; }
      p.t += dt;
      const pr = p.t / p.T;
      if (pr >= 1 + p.lf) { p.life = 0; p.m.visible = false; continue; }
      const head = p.d * Math.min(1, pr), tail = p.d * Math.max(0, pr - p.lf);
      tmp.copy(p.e).sub(p.s).normalize();
      p.m.position.copy(p.s).addScaledVector(tmp, (head + tail) * 0.5);
      const w = Math.max(p.w, 0.02 * p.m.position.distanceTo(Se.position));
      p.m.scale.set(w, w, Math.max(0.05, head - tail));
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
      p.m.scale.setScalar(0.04 + 0.13 * k);
    }
    for (const p of gore) {
      if (p.life <= 0) continue;
      p.t += dt;
      if (p.t >= p.life) { p.life = 0; p.m.visible = false; continue; }
      p.v.y -= 12 * dt;
      p.m.position.addScaledVector(p.v, dt);
    }
    for (const p of pops) {
      if (p.life <= 0) continue;
      p.t += dt;
      if (p.t >= p.life) { p.life = 0; p.m.visible = false; continue; }
      p.m.scale.setScalar(p.size * (0.4 + 0.6 * (p.t / p.life)));
    }
    for (let i = flashing.length - 1; i >= 0; i--) {
      const zom = flashing[i];
      zom._fxFlash -= dt;
      if (zom._fxFlash <= 0) {
        for (const m of zom._fxMats) { m.emissive.setHex(m.userData._e || 0); m.emissiveIntensity = 1; }
        flashing.splice(i, 1);
      }
    }
  };
  window.__gunFx.step = fxStep;
  let last = performance.now();
  const fxTick = () => {
    requestAnimationFrame(fxTick);
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (Ut.ctx) loadSamples(); // start fetching the recordings as soon as audio is unlocked
    if ((U.weapon | 0) >= 9) warmExplosionSound();
    if (window.__hold) return; // paused with the game
    fxStep(dt);
  };
  requestAnimationFrame(fxTick);
}



// Frame-rate readout (2026-10-24): add ?perf=1 to the URL to show the current fps,
// the CPU time spent in the draw calls, draw-call and triangle counts, plus switches
// (left edge) that turn one cost off at a time, to find what is slow on a device.
if (/[?&]perf=1/.test(location.search)) {
  const hud = document.createElement('div');
  hud.style.cssText = 'position:fixed;right:8px;bottom:4px;z-index:2147483000;font:600 11px ui-monospace,monospace;color:#fff;background:#0007;padding:2px 6px;border-radius:4px;pointer-events:none;white-space:pre';
  document.body.appendChild(hud);
  const flags = { shadow: true, zombie: true, gun: true, fx: true, res: false };
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;left:6px;top:38%;z-index:2147483000;display:flex;flex-direction:column;gap:4px';
  const btns = {};
  const labels = { shadow: '影', zombie: 'ゾンビ', gun: '手前の銃', fx: '煙・光', res: '低解像度' };
  for (const k of Object.keys(labels)) {
    const bt = document.createElement('button');
    bt.style.cssText = 'font:600 11px sans-serif;color:#fff;background:#0a7a;border:1px solid #fff6;border-radius:4px;padding:3px 6px;min-width:64px;touch-action:manipulation';
    const paint = () => { bt.textContent = labels[k] + (k === 'res' ? (flags[k] ? ' ON' : ' OFF') : (flags[k] ? ' 表示' : ' 消す')); bt.style.background = (k === 'res' ? flags[k] : !flags[k]) ? '#c33a' : '#0a7a'; };
    paint();
    for (const ev of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'click']) bt.addEventListener(ev, (e) => e.stopPropagation());
    bt.addEventListener('click', () => {
      flags[k] = !flags[k]; paint();
      const g = window.__game, r = g && g.debug && g.debug.renderer;
      if (k === 'shadow' && r) { for (const o of game.ue.children) if (o.isLight && o.shadow) o.castShadow = flags.shadow; game.ue.traverse((o) => { if (o.material) { const m = Array.isArray(o.material) ? o.material : [o.material]; m.forEach((x) => (x.needsUpdate = true)); } }); }
      if (k === 'res' && r) { if (!r.__pr0) r.__pr0 = r.getPixelRatio(); r.setPixelRatio(flags.res ? r.__pr0 * 0.5 : r.__pr0); }
    });
    btns[k] = bt; panel.appendChild(bt);
  }
  document.body.appendChild(panel);
  let last = performance.now(), sum = 0, n = 0, worst = 0, cpu = 0, calls = 0, tris = 0, wrapped = false;
  const tick = (now) => {
    requestAnimationFrame(tick);
    const g = window.__game, r = g && g.debug && g.debug.renderer;
    if (r && !wrapped) {
      wrapped = true;
      const orig = r.render.bind(r);
      r.render = (scene, cam) => {
        if (scene === game.fo && !flags.gun) return;
        const hidden = [];
        if (scene === game.ue && (!flags.zombie || !flags.fx)) {
          scene.traverse((o) => {
            if (!o.visible) return;
            if ((!flags.zombie && o.isSkinnedMesh) || (!flags.fx && (o.isPoints || o.isSprite || o.isLine))) { o.visible = false; hidden.push(o); }
          });
        }
        const t0 = performance.now();
        orig(scene, cam);
        cpu += performance.now() - t0;
        calls += r.info.render.calls; tris += r.info.render.triangles;
        for (const o of hidden) o.visible = true;
      };
    }
    const dt = now - last; last = now;
    sum += dt; n++; worst = Math.max(worst, dt);
    if (sum >= 1000) {
      hud.textContent = Math.round(n * 1000 / sum) + ' fps · 最大 ' + Math.round(worst) + ' ms\nCPU描画 ' + (cpu / n).toFixed(1) + ' ms · 命令 ' + Math.round(calls / n) + ' · ' + Math.round(tris / n / 1000) + 'k tri';
      sum = 0; n = 0; worst = 0; cpu = 0; calls = 0; tris = 0;
    }
  };
  requestAnimationFrame(tick);
}

// Shadow map refresh every other frame (2026-10-24). The shadow pass redraws every
// shadow caster (about 80% of all draw calls on the canyon map). The static world
// does not change and zombies move little in 1/60 s, so refreshing the map on
// alternate frames is not visible but removes about half of that work.
{
  let frame = 0, wrapped = false;
  const tick = () => {
    requestAnimationFrame(tick);
    const r = window.__game && window.__game.debug && window.__game.debug.renderer;
    if (!r) return;
    if (!wrapped) { r.shadowMap.autoUpdate = false; wrapped = true; }
    // The game renders once per rAF; flag the next render to refresh on even frames only.
    r.shadowMap.needsUpdate = (frame++ & 1) === 0;
  };
  requestAnimationFrame(tick);
}

// Static world merge (2026-10-24). The level is built from one mesh per collision
// box (300-430 of them), each drawn once for the picture and again for the shadow
// map. Boxes that share a material and sit in the same 32 m cell are merged into
// one mesh, so the picture and the shadows cost a few dozen draw calls instead of
// hundreds. Collision data is separate and untouched. Doors (which show/hide),
// hidden meshes, skinned meshes and anything that updates its own matrix are left
// alone. ?nomerge=1 turns this off, for comparison.
{
  try {
    if (!/[?&]nomerge=1/.test(location.search)) {
      const { BufferGeometry, Float32Attribute, Mesh, Vector3: V3 } = game.Geom;
      const scene = ue;
      const doors = new Set(game.jn.filter((n) => n.type === 'door' && n.mesh).map((n) => n.mesh));
      scene.updateMatrixWorld(true);
      const CELL = 32, buckets = new Map(), victims = [], v = new V3();
      scene.traverse((o) => {
        if (!o.isMesh || o.isSkinnedMesh || o.matrixAutoUpdate || !o.visible || doors.has(o)) return;
        if (o.parent !== scene || Array.isArray(o.material)) return;
        const g = o.geometry, a = g.attributes;
        if (!a.position || !a.normal || !a.uv || a.position.isInterleavedBufferAttribute) return;
        if (!g.boundingBox) g.computeBoundingBox();
        g.boundingBox.getCenter(v).applyMatrix4(o.matrixWorld);
        const key = o.material.uuid + '|' + o.castShadow + '|' + o.receiveShadow + '|' + Math.floor(v.x / CELL) + ',' + Math.floor(v.z / CELL);
        let b = buckets.get(key);
        if (!b) buckets.set(key, b = { material: o.material, cast: o.castShadow, recv: o.receiveShadow, items: [] });
        b.items.push(o); victims.push(o);
      });
      let made = 0;
      for (const b of buckets.values()) {
        if (b.items.length < 2) { b.items.forEach((o) => victims.splice(victims.indexOf(o), 1)); continue; }
        let nv = 0, ni = 0;
        for (const o of b.items) { nv += o.geometry.attributes.position.count; ni += o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count; }
        const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni);
        let vo = 0, io = 0;
        for (const o of b.items) {
          const g = o.geometry, m = o.matrixWorld.elements, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
          for (let i = 0; i < P.count; i++) {
            const x = P.getX(i), y = P.getY(i), z = P.getZ(i), nx = N.getX(i), ny = N.getY(i), nz = N.getZ(i);
            const k = (vo + i) * 3;
            pos[k] = m[0] * x + m[4] * y + m[8] * z + m[12];
            pos[k + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
            pos[k + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
            const tx = m[0] * nx + m[4] * ny + m[8] * nz, ty = m[1] * nx + m[5] * ny + m[9] * nz, tz = m[2] * nx + m[6] * ny + m[10] * nz;
            const l = Math.hypot(tx, ty, tz) || 1;
            nor[k] = tx / l; nor[k + 1] = ty / l; nor[k + 2] = tz / l;
            uv[(vo + i) * 2] = U.getX(i); uv[(vo + i) * 2 + 1] = U.getY(i);
          }
          if (g.index) for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.getX(i) + vo;
          else for (let i = 0; i < P.count; i++) idx[io++] = vo + i;
          vo += P.count;
        }
        const geo = new BufferGeometry();
        geo.setAttribute('position', new Float32Attribute(pos, 3));
        geo.setAttribute('normal', new Float32Attribute(nor, 3));
        geo.setAttribute('uv', new Float32Attribute(uv, 2));
        geo.setIndex(Array.from(idx));
        const mesh = new Mesh(geo, b.material);
        mesh.castShadow = b.cast; mesh.receiveShadow = b.recv; mesh.matrixAutoUpdate = false;
        mesh.name = 'Merged static world';
        scene.add(mesh);
        made++;
      }
      for (const o of victims) { o.parent && o.parent.remove(o); o.geometry.dispose(); }
      window.__staticMerge = { merged: victims.length, meshes: made };
    }
  } catch (e) { console.warn('static merge skipped', e); }
}

// ---- 2026-10-25: 全武器を公開・ゾンビの見失い無効・ランキング ----
{
  // 武器12種はURLフラグなしでホーム画面から選べる。
  // 1) ゾンビの見失い・足音/銃声で気づく処理は重いので常にオフ。撒き点は経路コストで数える（index.html の shk2）。
  Object.defineProperty(U, 'loseSight', { get: () => 0, set: () => {}, enumerable: true, configurable: true });
  for (const key of ['loseSight', 'hearR', 'senseT', 'gunHearR']) {
    const input = document.getElementById('s_' + key);
    if (input && input.parentElement) input.parentElement.style.display = 'none';
  }

  // 3) ランキング（クリア有無→得点の順）。受け口は server/worker.js の GET /ranking。
  const RANK_URL = 'https://gunrun-runs.jirisuke0121.workers.dev/ranking';
  const style = document.createElement('style');
  style.textContent = `
.rankbox{margin:10px 0;padding:8px 12px;border-radius:8px;background:rgba(0,0,0,.38);font-size:13px;line-height:1.5;text-align:left}
.rankbox:empty{display:none}
.rankbox h3{margin:0 0 4px;font-size:13px;letter-spacing:.04em}
.rankbox small{display:block;opacity:.7;margin-bottom:4px}
.rankbox ol{margin:0;padding:0;list-style:none}
.rankbox li{display:grid;grid-template-columns:2.6em 3.2em 1fr auto;gap:6px;padding:1px 0}
.rankbox .rank-time{grid-column:2/-1;font-size:12px;color:#cbd7df;margin:0}.rankbox .ghost-button{grid-column:2/-1;justify-self:start;font-size:12px;padding:6px 10px;min-height:38px;margin:2px 0 6px}.rankbox li.me{color:#ffd24a;font-weight:700}
.rankbox .clear{color:#7be08b;font-weight:700}
.rankbox .mine{margin-top:4px;padding-top:4px;border-top:1px solid rgba(255,255,255,.2)}`;
  document.head.appendChild(style);

  const playerId = () => { try { return localStorage.getItem('gunrun-pid') || ''; } catch { return ''; } };
  const esc = (v) => String(v).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const status = (row) => (row.cleared ? '<span class="clear">クリア</span>' : `${row.t}秒`);

  async function fetchRanking() {
    const me = playerId();
    const res = await fetch(RANK_URL + '?rules=' + window.skyChallenge.version + '&difficulty=' + window.skyChallenge.id + '&map=' + (window.SKY_CANYON_MAP ? 'rock-canyon' : 'old-town') + (me ? '&me=' + encodeURIComponent(me) : ''), { cache: 'no-store' });
    if (!res.ok) throw new Error('ranking ' + res.status);
    return res.json();
  }

  function renderRanking(box, data, limit) {
    if (!data || data.difficulty !== window.skyChallenge.id || (window.skyChallenge.id !== 'legacy' && data.rules !== window.skyChallenge.version) || !data.top || !data.top.length) { box.innerHTML = ''; return; }
    const rows = data.top.slice(0, limit).map((row) =>
      `<li class="${row.me ? 'me' : ''}"><span>${row.pos}位</span><span>${esc(row.tag)}</span><span>${status(row)}</span><span>${row.score}点</span><time class="rank-time"${row.playedAt ? ` datetime="${esc(row.playedAt)}"` : ""}>記録 ${esc(formatReplayTime(row.playedAt))}${row.playedAt ? "（日本時間）" : ""}</time>${row.replayId ? `<button type="button" class="ghost-button" data-replay="${esc(row.replayId)}">ゴーストを見る</button>` : '<small style="grid-column:2/-1">ゴースト記録なし</small>'}</li>`).join('');
    const inList = data.top.slice(0, limit).some((row) => row.me);
    const mine = data.me && !inList
      ? `<div class="mine">あなたの最高：${data.me.pos}位（${data.total}人中）　${status(data.me)}　${data.me.score}点<br>記録 ${esc(formatReplayTime(data.me.playedAt))}${data.me.playedAt ? "（日本時間）" : ""}</div>` : '';
    box.innerHTML = `<h3>${esc(window.skyChallenge.name)} ランキング</h3><small>クリア（2分逃げ切り）が上、同じ場合は得点順。このマップ・難易度の記録を表示。記録の送信がオンのプレイが対象です。</small><ol>${rows}</ol>${mine}`;
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('.ghost-button[data-replay]');
    if (button) window.skyReplay.open(button.dataset.replay, button);
  });

  async function refresh(box, limit) {
    try { renderRanking(box, await fetchRanking(), limit); } catch { box.innerHTML = ''; }
  }

  const startPanel = document.getElementById('ovStart');
  const overPanel = document.getElementById('ovOver');
  const titleBox = document.createElement('div');
  titleBox.className = 'rankbox';
  const mapSelect = startPanel && startPanel.querySelector('.map-select');
  if (mapSelect) mapSelect.parentElement.insertBefore(titleBox, mapSelect);
  const overBox = document.createElement('div');
  overBox.className = 'rankbox';
  const overStats = document.getElementById('oStats');
  if (overStats) overStats.parentElement.insertBefore(overBox, overStats);

  if (startPanel) {
    new MutationObserver(() => { if (!startPanel.hidden) refresh(titleBox, 10); })
      .observe(startPanel, { attributes: true, attributeFilter: ['hidden'] });
    if (!startPanel.hidden) refresh(titleBox, 10);
  }

  document.addEventListener('sky-difficulty-change', () => { titleBox.innerHTML = ''; refresh(titleBox, 10); });
  let overToken = 0;
  if (overPanel) {
    new MutationObserver(async () => {
      if (overPanel.hidden || z.mission || !z.final) return;
      const token = ++overToken;
      const total = z.final.total;
      const cleared = z.reason === 'time';
      overBox.innerHTML = '';
      // 記録の送信が終わるまで待ち、自分の最高がこの回以上になったら表示する（最大3回）
      for (const wait of [1200, 2000, 3500]) {
        await new Promise((resolve) => setTimeout(resolve, wait));
        if (token !== overToken || overPanel.hidden) return;
        try {
          const data = await fetchRanking();
          const me = data.me;
          const reflected = me && ((me.cleared ? 1 : 0) > (cleared ? 1 : 0) || ((me.cleared ? 1 : 0) === (cleared ? 1 : 0) && me.score >= total));
          renderRanking(overBox, data, 5);
          if (reflected) return;
        } catch { overBox.innerHTML = ''; return; }
      }
    }).observe(overPanel, { attributes: true, attributeFilter: ['hidden'] });
  }
}
