// Local Unity human trial for the old town and canyon maps.
import { addParkourRun, sampleClip, strideAdvance, runningBlend, jumpPhase, ledgeAnchor, wallRunFrame, WALLRUN_STRIDE, RUN_STRIDE, DASH_STRIDE } from './human-running.js?v=20261030-boost-sprint-v1';
import { createLandingRoll, rollTuck, rollTurn } from './landing-roll.js?v=20261029-edge-assist-v3';
import { buildHeldWeapon, createHumanAim } from './human-aim.js?v=20261029-door-motion-v1';
const sky = window.__skyInternals;
const { c, Se: camera, ue: world, fo, tl, Geom, mr, ls } = sky;
const { Group, Vector3 } = Geom;
const landingRoll = window.skyLandingRoll = createLandingRoll(sky);
const choiceButtons = [...document.querySelectorAll('#humanSel button')];
const status = document.getElementById('humanStatus');
const loader = new T2.GLTFLoader();
let asset = null, holder = null, model = null, motion = null, grip = null, morphMeshes = [], worldWeapon = null, worldWeaponIndex = -1, view = 'first';
let loading = null, activeClip = '', clipTime = 0, jumpTime = 0, landTime = 0, wasGrounded = true, shotTime = 1, lastAmmo = null, slidePose = 0;
let gripPoint = new Vector3(), muzzleFlash = null;
let gaitPhase = 0, runPose = 0, gripPitch = 0, bodyYawOffset = 0, turnBank = 0;
let swingLean = 0;
let combatTurn = 0, combatTarget = null;
const wrapAngle = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
function canAimBehind() {
  return choice === 'unity' && view === 'third' && !!aimRig && !!holder?.visible && !c.doorAction &&
    !landingRoll.active && !c.swingFlight && (c.state === 'normal' || c.state === 'slide');
}
function updateCombatTurn(dt, third, preparingShot = false) {
  if (third && sky.modeRef() === 'pause') return;
  if (motionPosition && c.pos.distanceTo(motionPosition) > Math.max(2, Math.hypot(c.vel.x, c.vel.z) * dt * 3)) {
    combatTurn = 0;
    if (!preparingShot) shotTarget = null;
  }
  combatTarget = third && sky.U.gunOn && sky.U.aimAuto && !sky.wpc().jumpGun &&
    sky.Et.reloadT <= 0 && sky.Et.ammo > 0 && canAimBehind() &&
    !window.skyBlastBarrels?.aimedAt(camera, sky.raycast) ? sky.aimTarget?.() : null;
  const target = combatTarget ? new Vector3(combatTarget.pos.x, combatTarget.pos.y + 1.1, combatTarget.pos.z)
    : shotTarget && shotTime < .28 && third && canAimBehind() ? shotTarget : null;
  let desired = combatTurn + wrapAngle(-combatTurn);
  if (target) {
    const bodyBase = c.yaw + Math.PI + bodyYawOffset + 1.25 * slidePose;
    const angle = wrapAngle(Math.atan2(target.x - c.pos.x, target.z - c.pos.z) - bodyBase);
    const error = wrapAngle(angle - combatTurn);
    // Turn the pelvis only as far as needed for a comfortable chest twist.
    // Measuring from its current pose keeps the same shoulder across +/-pi.
    desired = Math.abs(angle) < .88 ? combatTurn + wrapAngle(-combatTurn)
      : combatTurn + error - Math.max(-.88, Math.min(.88, error));
  }
  if (!third || !canAimBehind()) combatTurn = 0;
  else if (shotTime === 0 && target) combatTurn = desired;
  else combatTurn += (desired - combatTurn) * (1 - Math.exp(-dt * (target ? 13 : 9)));
  combatTurn = wrapAngle(combatTurn);
  document.body.dataset.skyHumanCombatTurn = combatTurn.toFixed(4);
}
let motionPosition = null, lastTravelYaw = null;
let closeFollowView = false;
let wallFrame = null, wallPhase = 0;
let parkourRunEnabled = true;
let contactFrame = null, trackedLedge = null, handAnchor = null;
let aimRig = null, heldWeapon = null, aimBlend = 0, shotTarget = null;
const contactOffset = new Vector3(), contactWorld = new Vector3();
// The conventional first-person body is kept only as a load-failure fallback.
let choice = 'unity';
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
      if (motion) aimRig = createHumanAim(model, motion, Geom);
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
  const rolling = landingRoll.active;
  const normalGround = grounded && c.state === 'normal' && !rolling;
  const distance = motionPosition ? Math.hypot(c.pos.x - motionPosition.x, c.pos.z - motionPosition.z) : 0;
  const teleported = distance > Math.max(1.5, speed * dt * 3);
  if (!motionPosition) motionPosition = new Vector3();
  motionPosition.copy(c.pos);
  if (teleported) { gaitPhase = 0; runPose = 0; bodyYawOffset = 0; turnBank = 0; lastTravelYaw = null; }
  wallFrame = c.state === 'wallrun' && parkourRunEnabled ? wallRunFrame(c.wallN, c.vel, c.yaw) : null;
  if (wallFrame) {
    if (activeClip !== 'wallrun' || teleported) wallPhase = 0;
    else wallPhase = strideAdvance(wallPhase, distance, WALLRUN_STRIDE);
  }
  const firing = !!sky.U.gunOn && (reload > 0 || shotTime < .28 || !!combatTarget);
  const runTarget = parkourRunEnabled && normalGround && front > speed * .6 && !firing && motion.clips.parkourRun
    ? runningBlend(speed, sky.U.walkSpeed, sky.U.sprintSpeed) : 0;
  runPose += (runTarget - runPose) * (1 - Math.exp(-dt * (firing ? 30 : 16)));
  const dashStrength = runTarget > 0 && motion.clips.parkourDash ? Math.max(0, Math.min(1, window.skyDash?.boost || 0)) : 0;
  if (normalGround && !teleported && speed > .2) gaitPhase = strideAdvance(gaitPhase, distance, speed < sky.U.walkSpeed + .15 ? 1.8 : RUN_STRIDE + (DASH_STRIDE - RUN_STRIDE) * dashStrength);
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
  if (wallFrame) {
    const angle = wallFrame.yaw - c.yaw - Math.PI;
    bodyYawOffset = Math.atan2(Math.sin(angle), Math.cos(angle));
    turnBank = 0; runPose = 0;
  }
  let next = 'idle';
  const walking = speed < (sky.U.walkSpeed + sky.U.sprintSpeed) / 2;
  if (rolling && motion.clips.parkourRoll) next = 'roll';
  else if (c.state === 'swing' && c.swing && motion.clips.parkourSwing) next = 'swing';
  else if (c.swingFlight && !grounded && c.state === 'normal') next = 'swingFlight';
  else if (c.state === 'ladder') next = 'ladder';
  else if (c.state === 'slide') next = 'slide';
  else if (wallFrame) next = 'wallrun';
  else if (c.state === 'ledge' && c.ledge && parkourRunEnabled && motion.clips.parkourMantle) next = c.ledge.kind === 'vault' ? 'vault' : c.ledge.kind === 'catch' ? 'catch' : 'mantle';
  else if (!grounded || landTime > 0 || c.state === 'ledge') next = 'jump';
  else if (speed > .2) {
    const pace = walking ? 'walk' : 'run';
    const poseYaw = c.yaw + combatTurn;
    const poseFront = -c.vel.x * Math.sin(poseYaw) - c.vel.z * Math.cos(poseYaw);
    const poseSide = c.vel.x * Math.cos(poseYaw) - c.vel.z * Math.sin(poseYaw);
    if (Math.abs(poseSide) > Math.abs(poseFront) * .8) next = `${pace}${poseSide > 0 ? 'Right' : 'Left'}`;
    else next = `${pace}${poseFront < -.1 ? 'Back' : 'Forward'}`;
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
  const special = next === 'wallrun' ? (wallFrame.side < 0 ? 'parkourWallLeft' : 'parkourWallRight')
    : { roll: 'parkourRoll', vault: 'parkourVault', mantle: 'parkourMantle', catch: 'parkourCatch', jump: 'parkourJump', swing: 'parkourSwing', swingFlight: 'parkourSwingFlight' }[next];
  const selected = (next === 'roll' || next === 'swing' || next === 'swingFlight' || parkourRunEnabled) && motion.clips[special] ? special : next;
  const ledgeAction = next === 'swing' || next === 'vault' || next === 'mantle' || next === 'catch';
  if (rolling) { runPose = 0; bodyYawOffset = 0; turnBank = 0; landTime = 0; }
  // A supported grip has its own contact frame. Ground-turn banking would
  // rotate the two wrists away from a level bar even with a correct midpoint.
  if (ledgeAction) { runPose = 0; bodyYawOffset = 0; turnBank = 0; }
  const info = motion.clips[selected];
  if (!info) return;
  if (next === 'roll') clipTime = info.duration * rollTuck(landingRoll.phase);
  else if (next === 'swing') clipTime = info.duration * Math.max(0, Math.min(1, (c.swing.angle + 1.15) / 2.3));
  else if (next === 'swingFlight') clipTime = info.duration * Math.min(1,c.swingFlight.age/.42);
  else if (next === 'vault' || next === 'mantle' || next === 'catch') clipTime = info.duration * Math.max(0, Math.min(1, c.ledge.t));
  else if (next === 'reload') {
    const total = Math.max(.1, sky.wpc().rl || 1.5);
    clipTime = info.duration * Math.max(0, Math.min(1, 1 - reload / total));
  } else if (next === 'shoot') clipTime = info.duration * (.40 + .48 * Math.min(1, shotTime / .24));
  else if (next === 'jump') {
    if (selected === 'parkourJump') clipTime = info.duration * jumpPhase(c.vel.y, sky.U.jumpVel, grounded ? landTime : 0);
    else {
    // The Unity clip is 1.7s, while a normal game jump lasts about 0.7s.
    // Reach the airborne poses before landing and show its final frames on touchdown.
    const flight = Math.max(.45, Math.min(1.4, 2 * sky.U.jumpVel / sky.U.gravity));
    const riseAndFall = Math.min(.86, jumpTime / flight * .86);
    const descent = c.vel.y < 0 ? .43 + .43 * Math.min(1, -c.vel.y / Math.max(1, sky.U.jumpVel)) : 0;
    clipTime = info.duration * (grounded ? .86 + .14 * (1 - landTime / .14) : Math.max(riseAndFall, descent));
    }
  } else if (next === 'wallrun') clipTime = wallPhase * info.duration;
  else if (next === 'slide') clipTime = Math.min(info.duration * .99, (c.slideT || 0) * info.duration / 1.2);
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
  const runSamples = [];
  if (runPose > .0001 && motion.clips.parkourRun) {
    for (const name of Object.keys(targets)) targets[name] *= 1 - runPose;
    for (const [name, weight] of [['parkourRun', 1 - dashStrength], ['parkourDash', dashStrength]]) {
      if (weight <= 0) continue;
      const run = motion.clips[name], sample = sampleClip(run, gaitPhase);
      runSamples.push({ name, weight, ...sample });
      for (const [index, fraction] of [[sample.lo, 1 - sample.fraction], [sample.hi, sample.fraction]]) {
        const frame = run.frames[index]; targets[frame] = (targets[frame] || 0) + fraction * weight * runPose;
      }
    }
  }
  const snap = landingRoll.takeSnap();
  const smooth = ledgeAction || rolling || snap ? 1 : 1 - Math.exp(-dt * 18);
  for (const mesh of morphMeshes) {
    const weights = mesh.morphTargetInfluences, names = mesh.morphTargetDictionary;
    for (const [name, index] of Object.entries(names)) weights[index] += ((targets[name] || 0) - weights[index]) * smooth;
  }
  const a = motion.grips[selected][lo], b = motion.grips[selected][hi];
  blendedGrip.set(a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction, a[2] + (b[2] - a[2]) * fraction);
  let wantedPitch = next === 'wallrun' ? -.65 : 0;
  if (runSamples.length) {
    const carry = [0, 0, 0];
    for (const { name, weight, lo, hi, fraction } of runSamples) {
      const grips = motion.grips[name], pitches = motion.gripPitches[name];
      for (let k = 0; k < 3; k++) carry[k] += (grips[lo][k] + (grips[hi][k] - grips[lo][k]) * fraction) * weight;
      wantedPitch += (pitches[lo] + (pitches[hi] - pitches[lo]) * fraction) * weight * runPose;
    }
    blendedGrip.x += (carry[0] - blendedGrip.x) * runPose;
    blendedGrip.y += (carry[1] - blendedGrip.y) * runPose;
    blendedGrip.z += (carry[2] - blendedGrip.z) * runPose;
  }
  gripPoint.lerp(blendedGrip, smooth);
  gripPitch += (wantedPitch - gripPitch) * smooth;
  contactFrame = null;
  if (next === 'swing') {
    const handA = motion.hands[selected][lo], handB = motion.hands[selected][hi];
    const middle = [0,1,2].map(k => ((handA.left[k]+handA.right[k])*(1-fraction)+(handB.left[k]+handB.right[k])*fraction)/2);
    contactFrame = { middle, anchor: {x:c.swing.pivot[0],y:c.swing.pivot[1],z:c.swing.pivot[2]}, weight:1 };
  } else if (ledgeAction) {
    if (trackedLedge !== c.ledge) { trackedLedge = c.ledge; handAnchor = ledgeAnchor(c.ledge, sky.jn); }
    const handA = motion.hands[selected][lo], handB = motion.hands[selected][hi];
    const middle = [0, 1, 2].map(k => ((handA.left[k] + handA.right[k]) * (1 - fraction) + (handB.left[k] + handB.right[k]) * fraction) / 2);
    const phase = Math.max(0, Math.min(1, c.ledge.t)), release = Math.max(0, Math.min(1, (phase - .72) / .22));
    contactFrame = { middle, anchor: handAnchor, weight: 1 - release * release * (3 - 2 * release) };
  } else { trackedLedge = null; handAnchor = null; }
  document.body.dataset.skyHumanClip = next;
  document.body.dataset.skyHumanAction = selected;
  if (selected === 'parkourJump') document.body.dataset.skyHumanJumpPhase = (clipTime / info.duration).toFixed(3);
  document.body.dataset.skyHumanRunBlend = runPose.toFixed(3);
  document.body.dataset.skyHumanRunClip = runSamples.length ? dashStrength > .001 ? 'parkourDash' : 'parkourRun' : 'existing';
  document.body.dataset.skyHumanDashBlend = (runSamples.length ? runPose * dashStrength : 0).toFixed(3);
  document.body.dataset.skyHumanGaitPhase = gaitPhase.toFixed(3);
  document.body.dataset.skyHumanWallSide = wallFrame ? String(wallFrame.side) : '';
  document.body.dataset.skyHumanWallPhase = wallPhase.toFixed(3);
  document.body.dataset.skyHumanRollPhase = rolling ? landingRoll.phase.toFixed(3) : '';
}
const aimPoint = new Vector3(), aimDirection = new Vector3(), aimHand = new Vector3(), aimSupport = new Vector3(), aimPalm = new Vector3();
const bore = new Vector3(), gunMuzzle = new Vector3(), actualDirection = new Vector3();
const doorTarget = new Vector3(), doorLean = new Vector3();
function updateDoorPose() {
  const action = c.doorAction;
  if (!action || !aimRig || !holder || !model) return;
  holder.updateMatrixWorld(true);
  doorTarget.set(action.contact.x, action.contact.y, action.contact.z);
  model.worldToLocal(doorTarget);
  const weight = action.weight;
  aimRig.prepare(doorTarget.toArray(), weight * .9, weight * (action.kind === 'close' ? .45 : .12));
  const roots = aimRig.shoulders();
  const left = [roots[1][0], roots[1][1] - .55, roots[1][2] + .12];
  // Reach with the right palm; the other arm lowers while the gun is stowed.
  const error = aimRig.apply([doorTarget.toArray(), left], [0, .12, 1], weight);
  document.body.dataset.skyHumanDoorAction = action.kind;
  document.body.dataset.skyHumanDoorPhase = action.phase.toFixed(3);
  document.body.dataset.skyHumanDoorReachError = ((error || 0) * holder.scale.x).toFixed(4);
  document.body.dataset.skyHumanAction = action.kind === 'open' ? 'doorOpen' : 'doorClose';
}
function previewAim() {
  aimDirection.set(0, 0, -1).applyQuaternion(camera.quaternion);
  const range = sky.wpc().range || 90;
  const lock = sky.U.aimAuto && !sky.wpc().jumpGun && !window.skyBlastBarrels?.aimedAt(camera, sky.raycast) ? sky.aimTarget?.() : null;
  if (lock) return aimPoint.set(lock.pos.x, lock.pos.y + 1.1, lock.pos.z);
  const hit = sky.raycast?.(camera.position.x, camera.position.y, camera.position.z, aimDirection.x, aimDirection.y, aimDirection.z, range);
  return aimPoint.copy(camera.position).addScaledVector(aimDirection, hit ? hit.t : range);
}
function aimWeaponAt(target) {
  const carryPosition=worldWeapon.position.clone(),carryRotation=worldWeapon.quaternion.clone();
  const localTarget=model.worldToLocal(target.clone());
  // The chest turns first; shoulder roots and both hand goals then share it.
  const torso=aimRig.prepare(localTarget.toArray(),aimBlend);
  document.body.dataset.skyHumanTorso=JSON.stringify(torso);
  const roots = aimRig.shoulders().map(p => model.localToWorld(new Vector3(...p)));
  const centre = roots[0].clone().add(roots[1]).multiplyScalar(.5);
  aimDirection.copy(target).sub(centre).normalize();
  right.set(-aimDirection.z, 0, aimDirection.x).normalize();
  // Keep both wrists within reach, including the support grip of long weapons.
  aimHand.copy(centre).addScaledVector(right, .075).addScaledVector(aimDirection, .24);
  aimHand.y -= .075;
  // Re-anchor the gun's trigger grip after solving its direction.
  const handGoal=aimHand.clone();
  bore.set(...heldWeapon.grip).applyQuaternion(worldWeapon.quaternion);
  worldWeapon.position.copy(handGoal).sub(bore);
  // Refine orientation and position together without moving the desired hand.
  for(let i=0;i<8;i++){
    aimDirection.copy(target).sub(worldWeapon.position).normalize();
    worldWeapon.rotation.set(Math.atan2(aimDirection.y,Math.hypot(aimDirection.x,aimDirection.z)),Math.atan2(-aimDirection.x,-aimDirection.z),0,'YXZ');
    bore.set(...heldWeapon.grip).applyQuaternion(worldWeapon.quaternion);worldWeapon.position.copy(handGoal).sub(bore);
  }
  if(aimBlend<1){worldWeapon.position.lerpVectors(carryPosition,worldWeapon.position,aimBlend);worldWeapon.quaternion.slerpQuaternions(carryRotation,worldWeapon.quaternion,aimBlend);}
  worldWeapon.updateMatrixWorld(true);
  aimHand.set(...heldWeapon.grip);worldWeapon.localToWorld(aimHand);model.worldToLocal(aimHand);
  aimSupport.set(...heldWeapon.support);worldWeapon.localToWorld(aimSupport);model.worldToLocal(aimSupport);
  aimPalm.set(0,-1,0).applyQuaternion(worldWeapon.quaternion).transformDirection(model.matrixWorld.clone().invert());
  const error=aimRig.apply([aimHand.toArray(),aimSupport.toArray()],aimPalm.toArray(),aimBlend);
  gunMuzzle.copy(heldWeapon.muzzle);worldWeapon.localToWorld(gunMuzzle);
  actualDirection.set(0,0,-1).applyQuaternion(worldWeapon.quaternion);
  aimDirection.copy(target).sub(gunMuzzle).normalize();
  document.body.dataset.skyHumanAimError=Math.acos(Math.max(-1,Math.min(1,actualDirection.dot(aimDirection)))).toFixed(7);
  document.body.dataset.skyHumanGripError=(error*holder.scale.x).toFixed(4);
  document.body.dataset.skyHumanAimBlend=aimBlend.toFixed(3);
}
function updateWorldWeapon(third, dt = 0) {
  const index = sky.U.weapon | 0;
  const prototype = (index < 4 ? tl : fo).getObjectByName(weaponNames[index]);
  if (index !== worldWeaponIndex || (prototype && worldWeapon?.userData.sourceChildren !== prototype.children.length)) {
    if (worldWeapon) world.remove(worldWeapon);
    worldWeapon = null;
    worldWeaponIndex = index;
    if (prototype) {
      heldWeapon = buildHeldWeapon(prototype, index, Geom);
      worldWeapon = heldWeapon.root;
      world.add(worldWeapon);
    }
  }
  if (!worldWeapon) { if (third && c.doorAction) updateDoorPose(); else aimRig?.reset(); if (muzzleFlash) muzzleFlash.visible = false; return; }
  worldWeapon.visible = third && !!sky.U.gunOn && !c.doorAction && !landingRoll.active && !c.swingFlight && c.state !== 'ladder' && c.state !== 'ledge' && c.state !== 'swing';
  if (!worldWeapon.visible) { aimBlend=0;if (third && c.doorAction) updateDoorPose(); else aimRig?.reset(); if (muzzleFlash) muzzleFlash.visible = false; return; }
  const aiming=aimRig && sky.Et.reloadT<=0 && (combatTarget || shotTime<.28 || Math.abs(combatTurn)>.01 || (c.onGround && c.state==='normal' && runPose<.01));
  // A shot must already have a matching pose on its first visible frame.
  aimBlend=shotTime<.28&&aiming?1:aimBlend+((aiming?1:0)-aimBlend)*(1-Math.exp(-dt*18));
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
  worldWeapon.rotation.set(c.pitch * .45 * (1 - runPose) + gripPitch, c.yaw + bodyYawOffset + combatTurn, turnBank, 'YXZ');
  // Position the normalized trigger at the animated palm in a lowered carry.
  bore.set(...heldWeapon.grip).applyQuaternion(worldWeapon.quaternion);worldWeapon.position.sub(bore);
  if (sky.Et.reloadT > 0) worldWeapon.rotation.z = Math.sin(Math.min(1, sky.Et.reloadT / Math.max(.1, sky.wpc().rl || 1.5)) * Math.PI) * .2;
  if(aimBlend>.0001)aimWeaponAt(shotTarget&&shotTime<.12?shotTarget:previewAim());else aimRig?.reset();
  if (!muzzleFlash && T2.SphereGeometry && T2.MeshBasicMaterial) {
    muzzleFlash = new T2.Mesh(new T2.SphereGeometry(.055, 5, 4), new T2.MeshBasicMaterial({ color: 0xffcd69, transparent: true, opacity: .85, depthWrite: false }));
    world.add(muzzleFlash);
  }
  if (muzzleFlash) {
    muzzleFlash.visible = third && shotTime < .06;
    if (muzzleFlash.visible) { worldWeapon.updateMatrixWorld(true); muzzleFlash.position.copy(heldWeapon.muzzle);worldWeapon.localToWorld(muzzleFlash.position); }
  }
}
function update(dt, preparingShot = false) {
  if (!c.doorAction) {
    delete document.body.dataset.skyHumanDoorAction;
    delete document.body.dataset.skyHumanDoorPhase;
    delete document.body.dataset.skyHumanDoorReachError;
  }
  const third = choice === 'unity' && view === 'third' && !!holder && sky.modeRef() !== 'menu' && sky.modeRef() !== 'replay' && !window.skySettings?.beforeRun;
  updateCombatTurn(dt, third, preparingShot);
  if (holder) {
    holder.visible = third;
    const speed = Math.hypot(c.vel.x, c.vel.z);
    if (third && sky.modeRef() === 'play') updateMotion(dt, speed);
    else if (!third) {
      lastAmmo = sky.Et.ammo; shotTime = 1; jumpTime = 0; landTime = 0; wasGrounded = !!c.onGround;
      motionPosition = null; lastTravelYaw = null; runPose = 0; gaitPhase = 0; gripPitch = 0; bodyYawOffset = 0; turnBank = 0;
      wallFrame = null; wallPhase = 0;
      swingLean = 0;
      contactFrame = null; trackedLedge = null; handAnchor = null; contactOffset.set(0, 0, 0);
      aimRig?.reset();aimBlend=0;shotTarget=null;
    }
    const sliding = third && c.state === 'slide';
    slidePose += ((sliding ? 1 : 0) - slidePose) * (1 - Math.exp(-dt * (sliding ? 20 : 14)));
    holder.position.set(c.pos.x, c.pos.y - .12 * slidePose, c.pos.z);
    const ladderYaw = c.ladder ? Math.atan2(-c.ladder.nx, -c.ladder.nz) : c.yaw + Math.PI;
    const ledgeYaw = c.state === 'ledge' && c.ledge ? Math.atan2(c.ledge.dx, c.ledge.dz) : null;
    const swinging = c.state === 'swing' && c.swing;
    const flight = c.swingFlight;
    const swingDirection = swinging ? c.swing.direction : flight?.direction;
    const swingYaw = swingDirection ? Math.atan2(swingDirection[0],swingDirection[1]) : null;
    if (sky.modeRef() === 'play') swingLean = swinging ? -c.swing.angle : flight ? -flight.angle*Math.exp(-flight.age*5) : swingLean * Math.exp(-dt * 18);
    const rolling = third && landingRoll.active && !!motion?.rollGround;
    holder.rotation.set(rolling ? rollTurn(landingRoll.phase) : c.state === 'ladder' ? .09 : swingLean, rolling ? landingRoll.yaw : c.state === 'ladder' ? ladderYaw : swingYaw ?? ledgeYaw ?? c.yaw + Math.PI + bodyYawOffset + combatTurn + 1.25 * slidePose, ledgeYaw === null ? turnBank : 0, 'YXZ');
    if (third && c.doorAction) {
      const action = c.doorAction, base = c.yaw + Math.PI;
      const turn = Math.atan2(Math.sin(action.yaw - base), Math.cos(action.yaw - base));
      holder.rotation.y = base + turn * Math.min(1, action.phase / .18) * (1 - Math.max(0, (action.phase - .8) / .2));
      doorLean.set(action.contact.x - c.pos.x, 0, action.contact.z - c.pos.z).normalize().multiplyScalar(.22 * action.weight);
      holder.position.add(doorLean);
    }
    if (rolling) {
      const frame = landingRoll.phase * (motion.rollGround.length - 1), i = Math.floor(frame), fraction = frame - i;
      const a = motion.rollGround[i], b = motion.rollGround[Math.min(i + 1, motion.rollGround.length - 1)];
      holder.position.y += (a.y + (b.y - a.y) * fraction) * holder.scale.y;
      const z = (a.z + (b.z - a.z) * fraction) * holder.scale.z;
      holder.position.x += Math.sin(landingRoll.yaw) * z;
      holder.position.z += Math.cos(landingRoll.yaw) * z;
    }
    if (third && contactFrame) {
      holder.updateMatrixWorld(true);
      contactWorld.set(...contactFrame.middle); model.localToWorld(contactWorld);
      contactOffset.set(contactFrame.anchor.x - contactWorld.x, contactFrame.anchor.y - contactWorld.y, contactFrame.anchor.z - contactWorld.z).multiplyScalar(contactFrame.weight);
    } else if (sky.modeRef() === 'play') contactOffset.multiplyScalar(Math.exp(-dt * 22));
    holder.position.add(contactOffset);
    if (contactFrame) {
      holder.updateMatrixWorld(true); contactWorld.set(...contactFrame.middle); model.localToWorld(contactWorld);
      document.body.dataset.skyHumanHandError = Math.hypot(contactWorld.x - contactFrame.anchor.x, contactWorld.y - contactFrame.anchor.y, contactWorld.z - contactFrame.anchor.z).toFixed(4);
    } else delete document.body.dataset.skyHumanHandError;
  }
  if (!third) { updateWorldWeapon(false,dt);window.skyFirstPersonView?.update(dt, false); return; }
  // Match Unity's over-shoulder distance while keeping the player in frame.
  pivot.set(c.pos.x, c.camY === undefined ? c.pos.y + c.eye : c.camY, c.pos.z);
  if (c.state === 'swing') pivot.y=c.pos.y+c.eye;
  if (c.state === 'ledge' && holder) pivot.y = holder.position.y + Math.min(c.eye, 1.5);
  forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
  right.set(1, 0, 0).applyQuaternion(camera.quaternion);
  const chase = window.skyDash?.camera || { distance: 3.6, shoulder: .62, height: .18 };
  wanted.copy(pivot).addScaledVector(forward, -chase.distance).addScaledVector(right, chase.shoulder);
  wanted.y += chase.height;
  // The maps expose the same solid-field query used by player movement.
  delta.copy(wanted).sub(pivot);
  let safe = 1;
  for (let step = 1; step <= 24; step++) {
    probe.copy(pivot).addScaledVector(delta, step / 24);
    if (!sky.oe(probe.x, probe.y - .16, probe.z, .16, .32)) { safe = Math.max(0, (step - 2) / 24); break; }
  }
  camera.position.copy(pivot).addScaledVector(delta, safe);
  camera.updateMatrixWorld();
  const follow = window.skyFollowCamera?.active;
  // Hide the avatar before it fills the view, with a wider return threshold
  // so a wall edge does not flicker between a full body and first person.
  const distance = delta.length() * safe;
  closeFollowView = !!follow && distance < (closeFollowView ? 1.95 : 1.65);
  const close = follow ? closeFollowView : safe <= .28;
  updateWorldWeapon(!close,dt);
  if (holder) holder.visible = !close;
  if (worldWeapon && close) worldWeapon.visible = false;
  if (ls) ls.root.visible = close && !follow && !!sky.U.showBody;
  for (const arm of mr) arm.root.visible = close && !follow && !!sky.U.showBody;
  document.body.dataset.skyHumanView = close ? 'first-collision' : 'third';
  document.body.dataset.skyHumanCameraClearance = safe.toFixed(2);
  // A squeezed follow view prioritizes the landing area over body/weapon overlays.
  window.skyFirstPersonView?.update(dt, !close || !!follow);
}
function getMuzzleWorld() {
  if(choice!=='unity'||view!=='third'||!worldWeapon?.visible||!holder?.visible)return null;
  worldWeapon.updateMatrixWorld(true);return worldWeapon.localToWorld(heldWeapon.muzzle.clone());
}
function prepareShot(origin,direction,distance) {
  landingRoll.cancel();
  if(choice!=='unity'||view!=='third'||!holder?.visible||!aimRig)return null;
  // Airborne fire remains available: it takes over the hands from the reach
  // animation on this same frame, before the muzzle/ray are calculated.
  c.swingFlight = null;
  // A practice warp/respawn can be noticed during this same update. Keep the
  // in-flight shot's aim point even when the previous movement pose resets.
  const target=origin.clone().addScaledVector(direction,distance);
  shotTarget=target;shotTime=0;update(0,true);
  const muzzle=getMuzzleWorld();if(!muzzle)return null;
  const corrected=target.clone().sub(muzzle).normalize();
  document.body.dataset.skyHumanShot=JSON.stringify({origin:muzzle.toArray(),direction:corrected.toArray(),target:target.toArray(),gripError:+document.body.dataset.skyHumanGripError,aimError:+document.body.dataset.skyHumanAimError});
  return {origin:muzzle,direction:corrected};
}
window.skyHumanView = { update, select, getMuzzleWorld, prepareShot,
  get canAimBehind() { return canAimBehind(); },
  autoAimReady(target) {
    if (!canAimBehind()) return true;
    const direction = Math.atan2(target.pos.x - c.pos.x, target.pos.z - c.pos.z);
    return holder?.visible && aimBlend > .96 && Math.abs(wrapAngle(direction - holder.rotation.y)) < 1.12;
  },
  get choice() { return choice; }, get view() { return view; },
  get isFiring() { return shotTime < .28; },
  get runStyle() { return parkourRunEnabled ? 'parkour' : 'existing'; },
  set runStyle(value) { parkourRunEnabled = value !== 'existing'; } };
sync();
if (choice === 'unity') loadHuman();
