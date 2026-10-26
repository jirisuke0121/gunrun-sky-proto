// Local Unity human trial for the old town and canyon maps.
import { addParkourRun, sampleClip, strideAdvance, runningBlend } from './human-running.js?v=20261027-run-v1';
const sky = window.__skyInternals;
const { c, Se: camera, ue: world, fo, tl, Geom, mr, ls } = sky;
const { Group, Vector3 } = Geom;
const choiceButtons = [...document.querySelectorAll('#humanSel button')];
const status = document.getElementById('humanStatus');
const loader = new T2.GLTFLoader();
let asset = null, holder = null, model = null, motion = null, grip = null, morphMeshes = [], worldWeapon = null, worldWeaponIndex = -1, view = 'first';
let loading = null, activeClip = '', clipTime = 0, jumpTime = 0, landTime = 0, wasGrounded = true, shotTime = 1, lastAmmo = null, slidePose = 0;
let gripPoint = new Vector3(), muzzleFlash = null;
let gaitPhase = 0, runPose = 0, gripPitch = 0, bodyYawOffset = 0, turnBank = 0;
let motionPosition = null, lastTravelYaw = null;
let parkourRunEnabled = true;
const savedChoice = (() => { try { return sessionStorage.getItem('gunrun-human-trial') || 'existing'; } catch { return 'existing'; } })();
let choice = savedChoice === 'unity' ? 'unity' : 'existing';
if (choice === 'unity') view = 'third';

function readBounds(object) {
  object.updateMatrixWorld(true);
  const low = new Vector3(Infinity, Infinity, Infinity), high = new Vector3(-Infinity, -Infinity, -Infinity);
  let meshes = [];
  object.traverse(node => { if (node.isMesh && node.name.includes('Body_mesh')) meshes.push(node); });
  if (!meshes.length) object.traverse(node => { if (node.isMesh) meshes.push(node); });
  for (const mesh of meshes) {
    const positions = mesh.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const p = new Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
      low.min(p); high.max(p);
    }
  }
  return { low, high };
}

async function readAnimatedHuman() {
  if (!window.DecompressionStream) throw new Error('gzip decompression is unavailable');
  const [response, details] = await Promise.all([
    fetch('./assets/human-gunrun-animated.glb.gz?v=20261025-slide-pose-v5'),
    fetch('./assets/human-gunrun-animated.json?v=20261025-slide-pose-v5').then(r => { if (!r.ok) throw new Error('motion metadata'); return r.json(); })
  ]);
  if (!response.ok) throw new Error('animated human GLB');
  const bytes = await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const gltf = await new Promise((resolve, reject) => loader.parse(bytes, './assets/', resolve, reject));
  return { gltf, details };
}
function loadHuman() {
  if (asset || loading) return loading || Promise.resolve(asset);
  status.textContent = 'Unity人間とアニメーションを読み込み中…';
  loading = readAnimatedHuman().catch(error => {
    console.warn('Animated human unavailable; using static model', error);
    return new Promise((resolve, reject) => loader.load('./assets/human-gunrun.glb', gltf => resolve({ gltf, details: null }), undefined, reject));
  })
    .then(({ gltf, details }) => {
      asset = gltf;
      motion = details;
      holder = new Group();
      holder.name = 'Unity challenge human';
      model = gltf.scene;
      const corrected = model;
      const { low, high } = readBounds(corrected);
      const height = high.y - low.y;
      if (!(height > 0.001 && height < 10)) throw new Error('human bounds');
      corrected.position.set(-(low.x + high.x) / 2, -low.y, -(low.z + high.z) / 2);
      holder.scale.setScalar(1.78 / height);
      holder.add(corrected);
      world.add(holder);
      model.traverse(node => { if (node.isMesh) { node.castShadow = true; node.frustumCulled = false; } });
      if (motion) document.body.dataset.skyHumanRunStyle = addParkourRun(model, motion, Geom.Float32Attribute) ? 'parkour' : 'existing';
      morphMeshes = [];
      model.traverse(node => { if (node.isMesh && node.morphTargetDictionary) morphMeshes.push(node); });
      grip = model.getObjectByName('GunRunRightHandGrip');
      if (motion) gripPoint.set(...motion.grips.idle[0]);
      holder.visible = false;
      document.body.dataset.skyHumanLoaded = 'true';
      document.body.dataset.skyHumanHeight = height.toFixed(3);
      document.body.dataset.skyHumanAnimated = motion && morphMeshes.length ? 'true' : 'fallback';
      if (motion && !morphMeshes.length) throw new Error('human morph targets missing');
      sync();
      return asset;
    }).catch(error => {
      loading = null;
      asset = null;
      status.textContent = 'Unity人間モデルを読み込めませんでした。従来表示を使います。';
      console.error('Unity human load failed', error);
      choice = 'existing'; view = 'first'; sync();
      return null;
    });
  return loading;
}

function sync() {
  choiceButtons.forEach(button => button.classList.toggle('on', button.dataset.human === choice));
  document.body.dataset.skyHumanTrial = choice;
  document.body.dataset.skyHumanView = choice === 'unity' && asset ? view : 'first';
  if (status && asset && choice === 'unity') status.textContent = `${view === 'third' ? '三人称' : '一人称'}で表示中${motion ? '（Unityアニメーション）' : '（静止モデル）'}。プレイ中は V で視点切替`;
  if (status && choice === 'existing') status.textContent = '';
}
function select(next) {
  choice = next;
  view = next === 'unity' ? 'third' : 'first';
  try { sessionStorage.setItem('gunrun-human-trial', next); } catch {}
  sync();
  if (next === 'unity') loadHuman();
}
choiceButtons.forEach(button => button.addEventListener('click', () => select(button.dataset.human)));
document.getElementById('bStart')?.addEventListener('click', event => {
  if (choice === 'unity' && !asset) {
    event.preventDefault();
    event.stopImmediatePropagation();
    status.textContent = 'Unity人間モデルを読み込み中です。少し待ってから開始してください。';
  }
}, true);
document.addEventListener('keydown', event => {
  if (event.code === 'KeyV' && !event.repeat && choice === 'unity' && sky.modeRef() === 'play') {
    view = view === 'third' ? 'first' : 'third';
    sync();
  }
});

const pivot = new Vector3(), wanted = new Vector3(), delta = new Vector3(), probe = new Vector3(), forward = new Vector3(), right = new Vector3();
const weaponNames = ['Sky HG','Sky SG','Sky SMG','Sky MG','Sky Unity HG','Sky Easy Shotgun','Sky Easy M4','Sky Easy Rail Gun','Sky Easy Beam Gun','Sky Easy Cluster Launcher','Sky Easy Rocket Launcher','Sky Easy M79','Sky Jump Gun'];
const blendedGrip = new Vector3();
let previousWeapon = -1;
function updateMotion(dt, speed) {
  if (!motion || !morphMeshes.length) return;
  const ammo = sky.Et.ammo;
  const weapon = sky.U.weapon | 0;
  const reload = sky.Et.reloadT || 0;
  if (weapon !== previousWeapon) { previousWeapon = weapon; lastAmmo = ammo; }
  if (lastAmmo !== null && ammo < lastAmmo && reload <= 0) shotTime = 0;
  lastAmmo = ammo;
  shotTime += dt;
  const grounded = !!c.onGround;
  if (grounded) {
    if (!wasGrounded && jumpTime > .16) landTime = .14;
    jumpTime = 0;
    landTime = Math.max(0, landTime - dt);
  } else {
    jumpTime += dt;
    landTime = 0;
  }
  wasGrounded = grounded;
  forward.set(-Math.sin(c.yaw), 0, -Math.cos(c.yaw));
  right.set(Math.cos(c.yaw), 0, -Math.sin(c.yaw));
  const front = c.vel.x * forward.x + c.vel.z * forward.z;
  const side = c.vel.x * right.x + c.vel.z * right.z;
  const normalGround = grounded && c.state === 'normal';
  const distance = motionPosition ? Math.hypot(c.pos.x - motionPosition.x, c.pos.z - motionPosition.z) : 0;
  const teleported = distance > Math.max(1.5, speed * dt * 3);
  if (!motionPosition) motionPosition = new Vector3();
  motionPosition.copy(c.pos);
  if (teleported) { gaitPhase = 0; runPose = 0; bodyYawOffset = 0; turnBank = 0; lastTravelYaw = null; }
  const firing = !!sky.U.gunOn && (reload > 0 || shotTime < .28);
  const runTarget = parkourRunEnabled && normalGround && front > speed * .6 && !firing && motion.clips.parkourRun
    ? runningBlend(speed, sky.U.walkSpeed, sky.U.sprintSpeed) : 0;
  runPose += (runTarget - runPose) * (1 - Math.exp(-dt * (firing ? 30 : 16)));
  if (normalGround && !teleported && speed > .2) gaitPhase = strideAdvance(gaitPhase, distance, speed < sky.U.walkSpeed + .15 ? 1.8 : 3.36);
  if (normalGround && speed > .5) {
    const yaw = Math.atan2(c.vel.x, c.vel.z);
    const angle = yaw - (c.yaw + Math.PI);
    const offset = Math.max(-1.05, Math.min(1.05, Math.atan2(Math.sin(angle), Math.cos(angle)))) * runPose;
    bodyYawOffset += (offset - bodyYawOffset) * (1 - Math.exp(-dt * 14));
    const change = lastTravelYaw === null ? 0 : Math.atan2(Math.sin(yaw - lastTravelYaw), Math.cos(yaw - lastTravelYaw));
    const bank = Math.max(-.20, Math.min(.20, -change / Math.max(.001, dt) * .075)) * runPose;
    turnBank += (bank - turnBank) * (1 - Math.exp(-dt * 12));
    lastTravelYaw = yaw;
  } else {
    bodyYawOffset *= Math.exp(-dt * 18); turnBank *= Math.exp(-dt * 18); lastTravelYaw = null;
  }
  let next = 'idle';
  const walking = speed < (sky.U.walkSpeed + sky.U.sprintSpeed) / 2;
  if (c.state === 'ladder') next = 'ladder';
  else if (c.state === 'slide') next = 'slide';
  else if (!grounded || landTime > 0 || c.state === 'ledge') next = 'jump';
  else if (speed > .2) {
    const pace = walking ? 'walk' : 'run';
    if (Math.abs(side) > Math.abs(front) * .8) next = `${pace}${side > 0 ? 'Right' : 'Left'}`;
    else next = `${pace}${front < -.1 ? 'Back' : 'Forward'}`;
  } else if (reload > 0) next = 'reload';
  else if (shotTime < .24) next = 'shoot';
  if (next !== activeClip) {
    activeClip = next;
    // Changing speed or direction must not restart the same foot at phase zero.
    if (!(next.startsWith('walk') || next.startsWith('run'))) clipTime = 0;
    if (next === 'jump') document.body.dataset.skyHumanJumpSeen = 'true';
    if (next === 'slide') document.body.dataset.skyHumanSlideSeen = 'true';
    if (next === 'ladder') document.body.dataset.skyHumanLadderSeen = 'true';
  }
  const info = motion.clips[next];
  if (!info) return;
  if (next === 'reload') {
    const total = Math.max(.1, sky.wpc().rl || 1.5);
    clipTime = info.duration * Math.max(0, Math.min(1, 1 - reload / total));
  } else if (next === 'shoot') clipTime = info.duration * (.40 + .48 * Math.min(1, shotTime / .24));
  else if (next === 'jump') {
    // The Unity clip is 1.7s, while a normal game jump lasts about 0.7s.
    // Reach the airborne poses before landing and show its final frames on touchdown.
    const flight = Math.max(.45, Math.min(1.4, 2 * sky.U.jumpVel / sky.U.gravity));
    const riseAndFall = Math.min(.86, jumpTime / flight * .86);
    const descent = c.vel.y < 0 ? .43 + .43 * Math.min(1, -c.vel.y / Math.max(1, sky.U.jumpVel)) : 0;
    clipTime = info.duration * (grounded ? .86 + .14 * (1 - landTime / .14) : Math.max(riseAndFall, descent));
  } else if (next === 'slide') clipTime = Math.min(info.duration * .99, (c.slideT || 0) * info.duration / 1.2);
  else if (next === 'ladder') clipTime += c.vel.y * dt * info.duration / 1.5;
  else if (next.startsWith('walk') || next.startsWith('run')) clipTime = gaitPhase * info.duration;
  else {
    const baseSpeed = next.startsWith('walk') ? sky.U.walkSpeed : next.startsWith('run') ? sky.U.sprintSpeed : 1;
    clipTime += dt * (next === 'idle' ? 1 : Math.max(.6, Math.min(1.5, speed / baseSpeed)));
  }
  const looping = next === 'ladder' || next === 'idle' || next.startsWith('walk') || next.startsWith('run');
  const time = looping ? ((clipTime % info.duration) + info.duration) % info.duration : Math.min(info.duration, clipTime);
  let hi = info.times.findIndex(t => t >= time);
  if (hi < 0) hi = info.times.length - 1;
  const lo = Math.max(0, hi - 1);
  const span = info.times[hi] - info.times[lo];
  const fraction = span > .0001 ? (time - info.times[lo]) / span : 0;
  const targets = { [info.frames[lo]]: 1 - fraction };
  targets[info.frames[hi]] = (targets[info.frames[hi]] || 0) + fraction;
  let runSample = null;
  if (runPose > .0001 && motion.clips.parkourRun) {
    const run = motion.clips.parkourRun;
    runSample = sampleClip(run, gaitPhase);
    for (const name of Object.keys(targets)) targets[name] *= 1 - runPose;
    for (const [index, weight] of [[runSample.lo, 1 - runSample.fraction], [runSample.hi, runSample.fraction]]) {
      const name = run.frames[index]; targets[name] = (targets[name] || 0) + weight * runPose;
    }
  }
  const smooth = 1 - Math.exp(-dt * 18);
  for (const mesh of morphMeshes) {
    const weights = mesh.morphTargetInfluences, names = mesh.morphTargetDictionary;
    for (const [name, index] of Object.entries(names)) weights[index] += ((targets[name] || 0) - weights[index]) * smooth;
  }
  const a = motion.grips[next][lo], b = motion.grips[next][hi];
  blendedGrip.set(a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction, a[2] + (b[2] - a[2]) * fraction);
  let wantedPitch = 0;
  if (runSample) {
    const { lo, hi, fraction } = runSample, grips = motion.grips.parkourRun, pitches = motion.gripPitches.parkourRun;
    blendedGrip.x += (grips[lo][0] + (grips[hi][0] - grips[lo][0]) * fraction - blendedGrip.x) * runPose;
    blendedGrip.y += (grips[lo][1] + (grips[hi][1] - grips[lo][1]) * fraction - blendedGrip.y) * runPose;
    blendedGrip.z += (grips[lo][2] + (grips[hi][2] - grips[lo][2]) * fraction - blendedGrip.z) * runPose;
    wantedPitch = (pitches[lo] + (pitches[hi] - pitches[lo]) * fraction) * runPose;
  }
  gripPoint.lerp(blendedGrip, smooth);
  gripPitch += (wantedPitch - gripPitch) * smooth;
  document.body.dataset.skyHumanClip = next;
  document.body.dataset.skyHumanRunBlend = runPose.toFixed(3);
  document.body.dataset.skyHumanGaitPhase = gaitPhase.toFixed(3);
}
function updateWorldWeapon(third) {
  const index = sky.U.weapon | 0;
  const prototype = (index < 4 ? tl : fo).getObjectByName(weaponNames[index]);
  if (index !== worldWeaponIndex || (prototype && worldWeapon?.userData.sourceChildren !== prototype.children.length)) {
    if (worldWeapon) world.remove(worldWeapon);
    worldWeapon = null;
    worldWeaponIndex = index;
    if (prototype) {
      worldWeapon = prototype.clone(true);
      worldWeapon.name = 'Unity human held weapon';
      worldWeapon.userData.sourceChildren = prototype.children.length;
      worldWeapon.scale.setScalar(index < 4 ? 1.45 : 1.0);
      world.add(worldWeapon);
    }
  }
  if (!worldWeapon) { if (muzzleFlash) muzzleFlash.visible = false; return; }
  worldWeapon.visible = third && !!sky.U.gunOn && c.state !== 'ladder';
  if (!worldWeapon.visible) { if (muzzleFlash) muzzleFlash.visible = false; return; }
  forward.set(-Math.sin(c.yaw), 0, -Math.cos(c.yaw));
  right.set(Math.cos(c.yaw), 0, -Math.sin(c.yaw));
  if (motion && model && holder) {
    holder.updateMatrixWorld(true);
    worldWeapon.position.copy(gripPoint);
    model.localToWorld(worldWeapon.position);
    worldWeapon.position.addScaledVector(forward, .07);
  } else if (grip) {
    holder.updateMatrixWorld(true);
    grip.getWorldPosition(worldWeapon.position);
    worldWeapon.position.addScaledVector(forward, .07);
  } else worldWeapon.position.set(c.pos.x, c.pos.y + 1.2, c.pos.z).addScaledVector(right, .25).addScaledVector(forward, .2);
  worldWeapon.rotation.set(c.pitch * .45 * (1 - runPose) + gripPitch, c.yaw + bodyYawOffset, turnBank, 'YXZ');
  if (shotTime < .12) worldWeapon.position.addScaledVector(forward, -.06 * (1 - shotTime / .12));
  if (sky.Et.reloadT > 0) worldWeapon.rotation.z = Math.sin(Math.min(1, sky.Et.reloadT / Math.max(.1, sky.wpc().rl || 1.5)) * Math.PI) * .2;
  if (!muzzleFlash && T2.SphereGeometry && T2.MeshBasicMaterial) {
    muzzleFlash = new T2.Mesh(new T2.SphereGeometry(.055, 5, 4), new T2.MeshBasicMaterial({ color: 0xffcd69, transparent: true, opacity: .85, depthWrite: false }));
    world.add(muzzleFlash);
  }
  if (muzzleFlash) {
    muzzleFlash.visible = third && shotTime < .06;
    if (muzzleFlash.visible) muzzleFlash.position.copy(worldWeapon.position).addScaledVector(forward, .5);
  }
}
function update(dt) {
  const third = choice === 'unity' && view === 'third' && !!holder && sky.modeRef() !== 'menu' && sky.modeRef() !== 'replay' && !window.skySettings?.beforeRun;
  if (holder) {
    holder.visible = third;
    const speed = Math.hypot(c.vel.x, c.vel.z);
    if (third && sky.modeRef() === 'play') updateMotion(dt, speed);
    else if (!third) {
      lastAmmo = sky.Et.ammo; shotTime = 1; jumpTime = 0; landTime = 0; wasGrounded = !!c.onGround;
      motionPosition = null; lastTravelYaw = null; runPose = 0; gaitPhase = 0; gripPitch = 0; bodyYawOffset = 0; turnBank = 0;
    }
    const sliding = third && c.state === 'slide';
    slidePose += ((sliding ? 1 : 0) - slidePose) * (1 - Math.exp(-dt * (sliding ? 20 : 14)));
    holder.position.set(c.pos.x, c.pos.y - .12 * slidePose, c.pos.z);
    const ladderYaw = c.ladder ? Math.atan2(-c.ladder.nx, -c.ladder.nz) : c.yaw + Math.PI;
    holder.rotation.set(c.state === 'ladder' ? .09 : 0, c.state === 'ladder' ? ladderYaw : c.yaw + Math.PI + bodyYawOffset + 1.25 * slidePose, turnBank, 'YXZ');
  }
  updateWorldWeapon(third);
  if (!third) { window.skyFirstPersonView?.update(dt, false); return; }
  // Match Unity's over-shoulder distance while keeping the player in frame.
  pivot.set(c.pos.x, c.camY === undefined ? c.pos.y + c.eye : c.camY, c.pos.z);
  forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
  right.set(1, 0, 0).applyQuaternion(camera.quaternion);
  wanted.copy(pivot).addScaledVector(forward, -3.6).addScaledVector(right, .62);
  wanted.y += .18;
  // The maps expose the same solid-field query used by player movement.
  delta.copy(wanted).sub(pivot);
  let safe = 1;
  for (let step = 1; step <= 24; step++) {
    probe.copy(pivot).addScaledVector(delta, step / 24);
    if (!sky.oe(probe.x, probe.y - .16, probe.z, .16, .32)) { safe = Math.max(0, (step - 2) / 24); break; }
  }
  camera.position.copy(pivot).addScaledVector(delta, safe);
  camera.updateMatrixWorld();
  const close = safe <= .28;
  if (holder) holder.visible = !close;
  if (worldWeapon && close) worldWeapon.visible = false;
  if (ls) ls.root.visible = close && !!sky.U.showBody;
  for (const arm of mr) arm.root.visible = close && !!sky.U.showBody;
  document.body.dataset.skyHumanView = close ? 'first-collision' : 'third';
  document.body.dataset.skyHumanCameraClearance = safe.toFixed(2);
  window.skyFirstPersonView?.update(dt, !close);
}
window.skyHumanView = { update, select, get choice() { return choice; }, get view() { return view; },
  get runStyle() { return parkourRunEnabled ? 'parkour' : 'existing'; },
  set runStyle(value) { parkourRunEnabled = value !== 'existing'; } };
sync();
if (choice === 'unity') loadHuman();
