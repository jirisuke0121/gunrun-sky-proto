// Local Unity human trial for the old town and canyon maps.
import { addParkourRun, dequantizeMorphs, sampleClip, strideAdvance, runningBlend, jumpPhase, ledgeAnchor, wallRunFrame, WALLRUN_STRIDE, RUN_STRIDE, DASH_STRIDE, LANDING_SECONDS, releaseAccent } from './human-running.js?v=20261114-morph-int16-v1';
import { GRIP_SLIP_SECONDS } from './swing-fatigue.js?v=20261031-grip-v1';
import { createLandingRoll, rollTuck, rollTurn } from './landing-roll.js?v=20261029-edge-assist-v3';
import { buildHeldWeapon, createHumanAim } from './human-aim.js?v=20261030-rotation-cache-v2';
import { flipPose } from './swing-flip.js?v=20261030-frontflip-cue-v2';
import { createHumanOcclusion } from './human-occlusion.js?v=20261108-opaque-v1';
const sky = window.__skyInternals;
const { c, Se: camera, ue: world, fo, tl, Geom, mr, ls } = sky;
const { Group, Vector3 } = Geom;
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
const visualSmooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hipOffset = new Vector3();
const aimInverse = camera.matrixWorld.clone();
const morphBindings = new WeakMap();
let morphBindingBuilds = 0;
const landingRoll = window.skyLandingRoll = createLandingRoll(sky);
const choiceButtons = [...document.querySelectorAll('#humanSel button')];
const status = document.getElementById('humanStatus');
const loader = new T2.GLTFLoader();
let asset = null, holder = null, model = null, motion = null, grip = null, morphMeshes = [], worldWeapon = null, worldWeaponIndex = -1, view = 'first';
let loading = null, activeClip = '', clipTime = 0, jumpTime = 0, landTime = 0, wasGrounded = true, shotTime = 1, lastAmmo = null, slidePose = 0;
let occludedHuman=null;
let gripPoint = new Vector3(), muzzleFlash = null;
let gaitPhase = 0, runPose = 0, gripPitch = 0, bodyYawOffset = 0, turnBank = 0;
let swingLean = 0;
let combatTurn = 0, combatTarget = null;
const wrapAngle = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
function canAimBehind() {
  return choice === 'unity' && view === 'third' && !!aimRig && !!holder?.visible && !c.doorAction &&
    !landingRoll.active && !c.swingFlight && !c.swingFall && (c.state === 'normal' || c.state === 'slide');
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
// Hook and zipline (2026-11-24): the runner holds the rope / the trolley instead of floating beside it in the jump pose.
//   hold.kind  'hook' | 'zip' | 'rope' (the swing ropes) | 'ladder' (hand over hand on the rungs) |
//              'dive' (through the window) | 'blast' (thrown by a barrel): body only, no hand goals | null      hold.blend  eased 0..1 for the body's turn, lean and drop
//   Left hand = rope hand, right hand = gun hand (both hands grip when the gun is put away). Drawn only: position,
//   speed, the camera and the hit box are not touched. `?gripPose=0` turns it off (the old jump pose and camera rope).
const viewQuery = (() => { try { return new URLSearchParams(location.search); } catch { return { get: () => null }; } })();
const gripPoseOn = viewQuery.get('gripPose') !== '0';
const hold = { kind: null, last: null, blend: 0, yaw: 0, pitch: 0, drop: 0, age: 0, sign: 1, swing: 0, target: new Vector3(), hand: new Vector3(), handValid: false };
const gripLocal = new Vector3(), gripRoot = new Vector3(), gripDir = new Vector3(), gripLeft = new Vector3(), gripRight = new Vector3();
let hookRope = null, cameraRope = null;
const holdsOn = () => !!hold.kind && hold.kind !== 'dive' && hold.kind !== 'blast';     // the hands have something to hold
const rungs = { left: null, right: null };     // where each hand is on the ladder (world height), hand over hand
// Body feel (2026-11-24, moved here from character-look.js so that the gun and the hand contacts follow it):
// stretch at take-off, lean in the air, squash on landing, breathing and a slow weight shift while standing.
const bodyFeelOn = viewQuery.get('bodyFeel') !== '0' && !reducedMotion;
const feel = { base: 0, ground: true, vy: 0, kick: 0, kickAge: 9, lean: 0, idle: 0, time: 0, out: [1, 0, 0] };
// The conventional first-person body is kept only as a load-failure fallback.
let choice = 'unity';
// 一人称視点は設定の「おまけ」（first-person-option.js）。人物モデルは三人称のまま読み込み、視点だけを切り替える。
// 一人称で遊んだランは、ランキング・プレイ記録に送らない（firstPersonRun。次のラン開始で戻る）。
const FIRST_PERSON_KEY = 'gunrun-first-person-v1';
let firstPerson = false, firstPersonRun = false;
try { firstPerson = localStorage.getItem(FIRST_PERSON_KEY) === '1'; } catch {}
// 入門コース（skyGuidedMode）は三人称の操作説明なので、設定にかかわらず三人称のまま。固定カメラ（?cameraTrial=fixed）も、
// 見下ろしの固定の向きと「画面の向きへ倒す」操作が組なので三人称のまま。人物を読み込めなかったときの代替表示は一人称。
const desiredView = () => choice === 'unity' ? (firstPerson && !window.skyGuidedMode && !(window.skyFixedCamera && window.skyFollowCamera?.mode === 'after') ? 'first' : 'third') : 'first';
view = desiredView();

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
    fetch('./assets/human-gunrun-animated.glb.gz?v=20261114-morph-int16-v1'),
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
      dequantizeMorphs(model, Geom.Float32Attribute);
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
      const outlineSources=[];model.traverse(node=>{if(node.isMesh)outlineSources.push(node)});
      occludedHuman?.dispose();occludedHuman=createHumanOcclusion(Geom,world,outlineSources,document);
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
  if (status && asset && choice === 'unity') status.textContent = `${view === 'third' ? '三人称' : '一人称'}で表示中${motion ? '（Unityアニメーション）' : '（静止モデル）'}`;
  if (status && choice === 'existing') status.textContent = '';
}
function select(next) {
  choice = next;
  view = desiredView();
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
// Rescue is key 3 (free-hook.js; it was V); the old V view toggle flipped the camera to first person on every Rescue press.

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
    if (!wasGrounded && jumpTime > .16 && c.state === 'normal') landTime = LANDING_SECONDS;
    jumpTime = 0;
    landTime = Math.max(0, landTime - dt);
  } else {
    jumpTime += dt;
    landTime = 0;
  }
  wasGrounded = grounded;
  if (c.state !== 'normal' || c.doorAction) landTime = 0;
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
  const poseYaw = c.yaw + combatTurn;
  const poseFront = -c.vel.x * Math.sin(poseYaw) - c.vel.z * Math.cos(poseYaw);
  const poseSide = c.vel.x * Math.cos(poseYaw) - c.vel.z * Math.sin(poseYaw);
  const pace = walking ? 'walk' : 'run';
  const groundClip = speed <= .2 ? 'idle' : Math.abs(poseSide) > Math.abs(poseFront) * .8
    ? `${pace}${poseSide > 0 ? 'Right' : 'Left'}` : `${pace}${poseFront < -.1 ? 'Back' : 'Forward'}`;
  if (rolling && motion.clips.parkourRoll) next = 'roll';
  else if (c.state === 'swing' && c.swing?.slipAge!==undefined && motion.clips.parkourGripSlip) next = 'gripSlip';
  else if (c.swingFall && !grounded && c.state==='normal' && motion.clips.parkourGripSlip) next = 'swingFall';
  else if (c.state === 'swing' && c.swing && motion.clips.parkourSwing) next = 'swing';
  else if (c.swingFlight && !grounded && c.state === 'normal') next = 'swingFlight';
  else if (c.state === 'ladder') next = 'ladder';
  else if (c.state === 'slide') next = 'slide';
  else if (wallFrame) next = 'wallrun';
  else if (c.state === 'ledge' && c.ledge && parkourRunEnabled && motion.clips.parkourMantle) next = c.ledge.kind === 'vault' ? 'vault' : c.ledge.kind === 'catch' ? 'catch' : 'mantle';
  else if (gripPoseOn && c.state === 'hook' && c.hook) next = 'hook';
  else if (gripPoseOn && c.state === 'zip' && c.zip) next = 'zip';
  else if (gripPoseOn && c.state === 'normal' && !grounded && ropeRide()) next = 'rope';
  else if (gripPoseOn && c.state === 'normal' && !grounded && window.skyWindowDive?.diving?.()) next = 'dive';
  else if (gripPoseOn && c.state === 'normal' && !grounded && hold.kind === 'blast') next = 'blast';
  else if (!grounded || c.state === 'ledge') next = 'jump';
  else if (landTime > 0 && parkourRunEnabled && motion.clips.parkourLand) next = 'landing';
  else if (speed > .2) next = groundClip;
  else if (reload > 0) next = 'reload';
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
    : { roll: 'parkourRoll', landing: 'parkourLand', vault: 'parkourVault', mantle: 'parkourMantle', catch: 'parkourCatch', jump: 'parkourJump', hook: 'parkourJump', zip: 'parkourJump', rope: 'parkourSwing', dive: 'parkourSwing', blast: 'parkourSwing', swing: 'parkourSwing', gripSlip:'parkourGripSlip',swingFall:'parkourGripSlip',swingFlight: 'parkourSwingFlight' }[next];
  const flipping = next === 'swingFlight' && c.swingFlight.perfect && c.swingFlight.flipDuration > 0;
  let selected = flipping ? 'parkourRoll' : (next === 'roll' || next === 'swing' || next==='gripSlip'||next==='swingFall'||next === 'swingFlight' || parkourRunEnabled) && motion.clips[special] ? special : next;
  if ((next === 'hook' || next === 'zip' || next === 'rope' || next === 'dive' || next === 'blast') && !motion.clips[selected]) selected = 'jump';
  const ledgeAction = next === 'swing' || next==='gripSlip'||next === 'vault' || next === 'mantle' || next === 'catch';
  if (next === 'hook' || next === 'zip' || next === 'rope' || next === 'dive' || next === 'blast') { runPose = 0; bodyYawOffset = 0; turnBank = 0; }
  if (rolling) { runPose = 0; bodyYawOffset = 0; turnBank = 0; landTime = 0; }
  // A supported grip has its own contact frame. Ground-turn banking would
  // rotate the two wrists away from a level bar even with a correct midpoint.
  if (ledgeAction) { runPose = 0; bodyYawOffset = 0; turnBank = 0; }
  const info = motion.clips[selected];
  if (!info) return;
  if (next === 'roll') clipTime = info.duration * rollTuck(landingRoll.phase);
  else if (next === 'landing') clipTime = LANDING_SECONDS - landTime;
  else if (next === 'swing') clipTime = info.duration * Math.max(0, Math.min(1, (c.swing.angle + 1.15) / 2.3));
  else if (next==='gripSlip'||next==='swingFall')clipTime=info.duration*Math.min(1,(c.swing?.slipAge??c.swingFall?.age??0)/GRIP_SLIP_SECONDS);
  else if (next === 'swingFlight') clipTime = info.duration * (flipping ? flipPose(c.swingFlight.age, c.swingFlight.flipDuration).tuck : Math.min(1,c.swingFlight.age/.42));
  else if (next === 'vault' || next === 'mantle' || next === 'catch') clipTime = info.duration * Math.max(0, Math.min(1, c.ledge.t));
  else if (next === 'reload') {
    const total = Math.max(.1, sky.wpc().rl || 1.5);
    clipTime = info.duration * Math.max(0, Math.min(1, 1 - reload / total));
  } else if (next === 'shoot') clipTime = info.duration * (.40 + .48 * Math.min(1, shotTime / .24));
  // Pulled by the hook: legs trailing, one knee bent. Under the trolley: knees drawn up.
  else if (next === 'hook') clipTime = info.duration * (selected === 'parkourJump' ? .66 : .5);
  else if (next === 'zip') clipTime = info.duration * (selected === 'parkourJump' ? .43 : .45);
  // The bar-swing clip: legs gather at the bottom and drive out ahead on the way up.
  else if (next === 'blast') clipTime = selected === 'parkourSwing' ? info.duration * .88 : info.duration * .3;
  else if (next === 'dive') clipTime = selected === 'parkourSwing' ? 0 : info.duration * .3;
  else if (next === 'rope') clipTime = info.duration * (selected === 'parkourSwing' ? Math.max(0, Math.min(1, (hold.swing + 1.15) / 2.3)) : .45);
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
  const gripFatigue=next==='swing'&&motion.clips.parkourGripSlip?Math.min(.72,(c.swing.fatigue||0)*.72):0;
  if(gripFatigue){for(const name of Object.keys(targets))targets[name]*=1-gripFatigue;targets[motion.clips.parkourGripSlip.frames[0]]=gripFatigue;}
  const recovery = next === 'landing' ? visualSmooth(.25, 1, 1 - landTime / LANDING_SECONDS) : 1;
  let recoveryGrip = null;
  if (next === 'landing') {
    const ground = motion.clips[groundClip], sample = sampleClip(ground, groundClip === 'idle' ? 0 : gaitPhase);
    for (const name of Object.keys(targets)) targets[name] *= 1 - recovery;
    for (const [i, w] of [[sample.lo, 1 - sample.fraction], [sample.hi, sample.fraction]]) {
      const name = ground.frames[i]; targets[name] = (targets[name] || 0) + w * recovery;
    }
    const a = motion.grips[groundClip][sample.lo], b = motion.grips[groundClip][sample.hi];
    recoveryGrip = a.map((v, k) => v + (b[k] - v) * sample.fraction);
  }
  const runWeight = runPose * recovery;
  const runSamples = [];
  if (runWeight > .0001 && motion.clips.parkourRun) {
    for (const name of Object.keys(targets)) targets[name] *= 1 - runWeight;
    for (const [name, weight] of [['parkourRun', 1 - dashStrength], ['parkourDash', dashStrength]]) {
      if (weight <= 0) continue;
      const run = motion.clips[name], sample = sampleClip(run, gaitPhase);
      runSamples.push({ name, weight, ...sample });
      for (const [index, fraction] of [[sample.lo, 1 - sample.fraction], [sample.hi, sample.fraction]]) {
        const frame = run.frames[index]; targets[frame] = (targets[frame] || 0) + fraction * weight * runWeight;
      }
    }
  }
  // Bite/shove: cross-fade into the grab -> shove -> stagger poses while a zombie has hold of the player.
  const bitePose = window.skyBite?.poseTargets?.();
  if (bitePose) {
    for (const name of Object.keys(targets)) targets[name] *= 1 - bitePose.weight;
    for (const [name, value] of Object.entries(bitePose.targets)) targets[name] = (targets[name] || 0) + value * bitePose.weight;
  }
  const snap = landingRoll.takeSnap();
  // The clip is already interpolated. Filtering a planted foot again delays
  // it behind the player's travel and makes the sole slide across the floor.
  const plantedRun = dashStrength > .001 && runWeight > .99;
  const smooth = ledgeAction || rolling || snap || plantedRun ? 1 : 1 - Math.exp(-dt * (bitePose ? 40 : 18));
  for (const mesh of morphMeshes) {
    const weights = mesh.morphTargetInfluences, names = mesh.morphTargetDictionary;
    // Morph names are fixed for a loaded geometry. Avoid rebuilding hundreds
    // of entry arrays on every animation update; refresh after a rig change.
    let binding = morphBindings.get(mesh);
    if (!binding || binding.dictionary !== names || binding.length !== weights.length) {
      binding = { dictionary: names, length: weights.length, entries: Object.entries(names) };
      morphBindings.set(mesh, binding); morphBindingBuilds++;
    }
    for (let i = 0; i < binding.entries.length; i++) {
      const entry = binding.entries[i], index = entry[1];
      weights[index] += ((targets[entry[0]] || 0) - weights[index]) * smooth;
    }
  }
  const a = motion.grips[selected][lo], b = motion.grips[selected][hi];
  blendedGrip.set(a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction, a[2] + (b[2] - a[2]) * fraction);
  if(gripFatigue)blendedGrip.lerp(hipOffset.set(...motion.grips.parkourGripSlip[0]),gripFatigue);
  if (recoveryGrip) blendedGrip.lerp(hipOffset.set(...recoveryGrip), recovery);
  let wantedPitch = next === 'wallrun' ? -.65 : 0;
  if (runSamples.length) {
    const carry = [0, 0, 0];
    for (const { name, weight, lo, hi, fraction } of runSamples) {
      const grips = motion.grips[name], pitches = motion.gripPitches[name];
      for (let k = 0; k < 3; k++) carry[k] += (grips[lo][k] + (grips[hi][k] - grips[lo][k]) * fraction) * weight;
      wantedPitch += (pitches[lo] + (pitches[hi] - pitches[lo]) * fraction) * weight * runWeight;
    }
    blendedGrip.x += (carry[0] - blendedGrip.x) * runWeight;
    blendedGrip.y += (carry[1] - blendedGrip.y) * runWeight;
    blendedGrip.z += (carry[2] - blendedGrip.z) * runWeight;
  }
  gripPoint.lerp(blendedGrip, smooth);
  gripPitch += (wantedPitch - gripPitch) * smooth;
  contactFrame = null;
  if (next === 'swing'||next==='gripSlip') {
    const handA = motion.hands[selected][lo], handB = motion.hands[selected][hi];
    const left=handA.left.map((v,k)=>v+(handB.left[k]-v)*fraction);
    const middle = [0,1,2].map(k => ((handA.left[k]+handA.right[k])*(1-fraction)+(handB.left[k]+handB.right[k])*fraction)/2);
    if(gripFatigue)for(let k=0;k<3;k++){const tired=motion.hands.parkourGripSlip[0];middle[k]+=(.5*(tired.left[k]+tired.right[k])-middle[k])*gripFatigue;}
    const oneHand=next==='gripSlip'?visualSmooth(.04,.28,clipTime/info.duration):0;
    for(let k=0;k<3;k++)middle[k]+=(left[k]-middle[k])*oneHand;
    const span=.32*(holder?.scale.y||.77)*oneHand;
    contactFrame = { middle, anchor: {x:c.swing.pivot[0]+c.swing.direction[1]*span,y:c.swing.pivot[1],z:c.swing.pivot[2]-c.swing.direction[0]*span}, weight:1 };
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
  document.body.dataset.skyHumanDashBlend = (runSamples.length ? runWeight * dashStrength : 0).toFixed(3);
  document.body.dataset.skyHumanGaitPhase = gaitPhase.toFixed(3);
  document.body.dataset.skyHumanWallSide = wallFrame ? String(wallFrame.side) : '';
  document.body.dataset.skyHumanWallPhase = wallPhase.toFixed(3);
  document.body.dataset.skyHumanRollPhase = rolling ? landingRoll.phase.toFixed(3) : '';
  document.body.dataset.skyHumanLandingPhase = next === 'landing' ? (1 - landTime / LANDING_SECONDS).toFixed(3) : '';
}
const aimPoint = new Vector3(), aimOrigin = new Vector3(), aimDirection = new Vector3(), aimHand = new Vector3(), aimSupport = new Vector3(), aimPalm = new Vector3();
const bore = new Vector3(), gunMuzzle = new Vector3(), actualDirection = new Vector3();
const doorTarget = new Vector3(), doorLean = new Vector3();
// The two swing ropes (rope-swing.js, rope-stations.js) keep the player in the normal airborne state; ask them.
function ropeRide() {
  const a = window.skyRopeSwing?.active?.() ? window.skyRopeSwing.state?.() : null; if (a) return { th: a.th, w: a.w, ex: 1, ez: 0 };
  const b = window.skyRopeStations?.active?.() ? window.skyRopeStations.current?.() : null; return b ? { th: b.th, w: b.w, ex: b.e?.x ?? 1, ez: b.e?.z ?? 0 } : null;
}
// Where the rope / the trolley is this frame, and how the body should turn, lean and hang for it.
function updateGripFrame(dt, third) {
  let kind = null;
  if (gripPoseOn && third && sky.modeRef() === 'play') {
    if (c.state === 'hook' && c.hook) {
      kind = 'hook'; hold.target.set(c.hook[0], c.hook[1], c.hook[2]);
      const dx = c.hook[0] - c.pos.x, dy = c.hook[1] - (c.pos.y + 1.3), dz = c.hook[2] - c.pos.z, flat = Math.hypot(dx, dz);
      if (flat > .3) hold.yaw = Math.atan2(dx, dz);
      hold.pitch = Math.max(0, Math.min(1.1, .72 * (Math.PI / 2 - Math.atan2(dy, flat)))); hold.drop = 0;
    } else if (c.state === 'normal' && ropeRide()) {
      // Hanging from a swing rope: the hands are 1.9 m above the feet (HANDS in rope-swing.js); the body follows the rope's angle.
      kind = 'rope'; const ride = ropeRide();
      if (hold.last !== 'rope' || hold.age === 0) hold.sign = ride.w >= 0 ? 1 : -1;      // faces the way it grabbed on
      hold.yaw = Math.atan2(ride.ex * hold.sign, ride.ez * hold.sign); hold.swing = ride.th * hold.sign;
      hold.pitch = Math.max(-1.2, Math.min(1.2, -hold.swing)); hold.drop = .06;
      hold.target.set(c.pos.x, c.pos.y + 1.9, c.pos.z);
    } else if (c.state === 'ladder' && c.ladder) {
      // Each hand keeps its rung while the body climbs past it, then reaches for the next one (0.7 m apart, the two
      // hands half a step out of phase). The ladder clip (a walk) still moves the legs.
      kind = 'ladder'; const L = c.ladder; hold.yaw = Math.atan2(-L.nx, -L.nz); hold.pitch = 0; hold.drop = 0;
      hold.target.set(c.pos.x - L.nx * .34, c.pos.y, c.pos.z - L.nz * .34);     // the ladder's plane, at the feet's height
      const snap = (offset) => Math.ceil((c.pos.y + 1.22 - offset) / .7) * .7 + offset, ease = 1 - Math.exp(-dt * 20);
      const wantL = snap(0), wantR = snap(.35);
      rungs.left = rungs.left === null ? wantL : rungs.left + (wantL - rungs.left) * ease; rungs.right = rungs.right === null ? wantR : rungs.right + (wantR - rungs.right) * ease;
    } else if (c.state === 'normal' && !c.onGround && (window.skyBlastBarrels?.flightAge?.() ?? -1) >= 0 && window.skyBlastBarrels.flightAge() < .55) {
      // Thrown by a barrel: arms flung up, legs kicked out ahead, body arched back; then the ordinary jump takes over.
      kind = 'blast'; if (Math.hypot(c.vel.x, c.vel.z) > 1) hold.yaw = Math.atan2(c.vel.x, c.vel.z); hold.pitch = -.42; hold.drop = 0;
    } else if (c.state === 'normal' && !c.onGround && window.skyWindowDive?.diving?.()) {
      // Head first through the window: arms out ahead, legs trailing (the bar-swing clip's stretched frame, laid forward).
      kind = 'dive'; if (Math.hypot(c.vel.x, c.vel.z) > 1) hold.yaw = Math.atan2(c.vel.x, c.vel.z); hold.pitch = 1.0; hold.drop = 0;
    } else if (c.state === 'zip' && c.zip) {
      kind = 'zip'; const a = c.zip.a, b = c.zip.b, way = c.zipDir || 1, dx = (b[0] - a[0]) * way, dz = (b[2] - a[2]) * way;
      hold.yaw = Math.atan2(dx, dz); hold.drop = .30;
      // The body swings back as the trolley takes the weight, then settles.
      hold.pitch = -.16 - (reducedMotion ? 0 : .30 * Math.exp(-hold.age * 1.9) * Math.cos(hold.age * 5.2));
      hold.target.set(c.pos.x, c.pos.y + 1.64, c.pos.z);
    }
  }
  hold.age = kind && kind === hold.last ? hold.age + dt : 0;
  hold.kind = kind; if (kind) hold.last = kind;
  hold.blend += ((kind ? 1 : 0) - hold.blend) * (1 - Math.exp(-dt * (kind ? 16 : 11)));
  if (!kind && hold.blend < .002) { hold.blend = 0; hold.last = null; }
  if (!kind) hold.handValid = false;
  if (kind !== 'ladder') rungs.left = rungs.right = null;
}
// Hand goals in the model's own space (after the chest has turned): gripLeft, gripRight.
function gripTargets(inverse) {
  const roots = aimRig.shoulders();
  gripLocal.copy(hold.target).applyMatrix4(inverse);
  if (hold.kind === 'hook') {
    gripRoot.set(...roots[1]); gripDir.copy(gripLocal).sub(gripRoot).normalize();
    gripLeft.copy(gripRoot).addScaledVector(gripDir, .74);                   // left arm almost straight along the rope
    gripRight.copy(gripLeft).addScaledVector(gripDir, -.2);                   // right hand below it on the same rope
  } else if (hold.kind === 'ladder') {
    // Rails 0.17 m either side of the ladder's centre line (the model's own X is its left).
    gripLeft.copy(gripLocal); gripLeft.x += .2; gripRight.copy(gripLocal); gripRight.x -= .2;
    const scale = holder.scale.y || .77; gripLeft.y += (rungs.left - c.pos.y) / scale; gripRight.y += (rungs.right - c.pos.y) / scale;
  } else if (hold.kind === 'rope') {
    gripLeft.copy(gripLocal); gripLeft.x += .03; gripRight.copy(gripLocal); gripRight.x -= .03; gripRight.y -= .2;   // one hand above the other
  } else {
    gripLeft.copy(gripLocal); gripLeft.x += .085; gripRight.copy(gripLocal); gripRight.x -= .085;
  }
  hold.hand.copy(gripLeft); model.localToWorld(hold.hand); hold.handValid = true;
}
// Gun put away (or no gun): both hands hold on.
function updateGripHands() {
  if (!holdsOn() || !aimRig || !holder || !model) return false;
  holder.updateMatrixWorld(true); aimInverse.copy(model.matrixWorld).invert();
  aimRig.prepare(gripLocal.copy(hold.target).applyMatrix4(aimInverse).toArray(), hold.kind === 'hook' ? .5 * hold.blend : 0);
  gripTargets(aimInverse);
  const error = aimRig.apply([gripRight.toArray(), gripLeft.toArray()], hold.kind === 'hook' ? gripDir.toArray() : [0, 1, 0], 1);
  document.body.dataset.skyHumanGripError = ((error || 0) * holder.scale.x).toFixed(4);
  return true;
}
// The hook's rope, from the rope hand to the anchor. The game's own line starts at the camera (it was drawn for
// first person) and is one pixel wide; in third person it is replaced by a thin rope mesh.
function updateHookRope(third) {
  if (!cameraRope) cameraRope = world.children.find(o => o.isLine && o.geometry?.attributes?.position?.count === 2 && o.material?.color?.getHex?.() === 0x2a2724) || null;
  const show = gripPoseOn && third && c.state === 'hook' && !!c.hook && hold.handValid && sky.modeRef() === 'play';
  if (cameraRope?.material) cameraRope.material.visible = !show;
  if (!show) { if (hookRope) hookRope.visible = false; return; }
  if (!hookRope && Geom.Cylinder && Geom.Basic && Geom.Mesh) {
    const shape = new Geom.Cylinder(1, 1, 1, 6, 1, true); shape.translate(0, .5, 0); shape.rotateX(Math.PI / 2);   // along +Z, from the hand
    hookRope = new Geom.Mesh(shape, new Geom.Basic({ color: 0x4a3d33 })); hookRope.name = 'Hook rope'; hookRope.frustumCulled = false; hookRope.castShadow = false;
    world.add(hookRope);
  }
  if (!hookRope) return;
  const length = Math.hypot(c.hook[0] - hold.hand.x, c.hook[1] - hold.hand.y, c.hook[2] - hold.hand.z);
  hookRope.visible = length > .05; hookRope.position.copy(hold.hand); hookRope.lookAt(c.hook[0], c.hook[1], c.hook[2]);
  hookRope.scale.set(.02, .02, length);
  // Twisted strands along the rope (character-look.js draws the small texture); the count follows the length.
  if (!hookRope.material.map && window.skyRopeMap) { hookRope.material.map = window.skyRopeMap(8); hookRope.material.color.setHex(0x8a735e); hookRope.material.needsUpdate = true; }
  if (hookRope.material.map) hookRope.material.map.repeat.set(1, Math.max(2, Math.round(length * 9)));
  hookRope.updateMatrixWorld(true);
  document.body.dataset.skyHookRope = JSON.stringify({ from: hold.hand.toArray().map(v => +v.toFixed(2)), length: +length.toFixed(2) });
}
// Stretch at take-off, lean in the air, squash on landing; breathing and a slow weight shift while standing still.
function updateBodyFeel(dt, third) {
  if (!feel.base) feel.base = holder.scale.y;
  let tall = 1, lean = 0, sway = 0;
  if (bodyFeelOn && third && sky.modeRef() !== 'play') { tall = feel.out[0]; lean = feel.out[1]; sway = feel.out[2]; }   // paused: hold the pose
  else if (bodyFeelOn && third) {
    const plain = c.state === 'normal' && !c.swingFlight && !c.swingFall && !landingRoll.active && !c.doorAction, ground = !!c.onGround;
    if (plain && ground !== feel.ground) {
      if (!ground && c.vel.y > 2) { feel.kick = .07; feel.kickAge = 0; }
      else if (ground && feel.vy < -3) { feel.kick = -Math.min(.13, .035 + (-feel.vy - 3) * .011); feel.kickAge = 0; }
    }
    feel.ground = ground; feel.vy = c.vel.y; feel.kickAge += dt; feel.time += dt;
    const speed = Math.hypot(c.vel.x, c.vel.z);
    if (plain) tall += feel.kick * Math.exp(-feel.kickAge * 9) * Math.cos(feel.kickAge * 15);
    const want = plain && !ground ? Math.min(1, speed / 7) * (c.vel.y > 0 ? .13 : -.05) : 0;
    feel.lean += (want - feel.lean) * (1 - Math.exp(-dt * 9)); lean = feel.lean;
    const still = plain && ground && speed < .25 ? 1 : 0;
    feel.idle += (still - feel.idle) * (1 - Math.exp(-dt * (still ? 2.5 : 12)));
    tall += feel.idle * .007 * Math.sin(feel.time * 2.1);                                   // breathing
    sway = feel.idle * (.020 * Math.sin(feel.time * .83) + .008 * Math.sin(feel.time * 1.9 + 1));   // weight from foot to foot
    lean += feel.idle * .010 * Math.sin(feel.time * 1.27 + .6);
  } else { feel.lean = 0; feel.idle = 0; feel.kickAge = 9; }
  feel.out[0] = tall; feel.out[1] = lean; feel.out[2] = sway;
  const wide = 1 / Math.sqrt(tall);
  holder.scale.set(feel.base * wide, feel.base * tall, feel.base * wide);
  holder.rotation.x += lean; holder.rotation.z += sway;
  document.body.dataset.skyHumanBodyFeel = JSON.stringify({ tall: +tall.toFixed(3), lean: +lean.toFixed(3), sway: +sway.toFixed(3) });
}
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
  // Start the look ray level with the player, not at the camera: with the closer, lower chase camera (11/24) a wall
  // beside the camera could be hit first, which put the aim point behind the gun and turned the held gun around.
  // Only the drawn gun uses this point; the game's own shot is unchanged.
  const depth = Math.max(0, (c.pos.x - camera.position.x) * aimDirection.x + (c.pos.y + c.eye - camera.position.y) * aimDirection.y + (c.pos.z - camera.position.z) * aimDirection.z);
  aimOrigin.copy(camera.position).addScaledVector(aimDirection, depth);
  const hit = sky.raycast?.(aimOrigin.x, aimOrigin.y, aimOrigin.z, aimDirection.x, aimDirection.y, aimDirection.z, range);
  // 11/25: during a wall run the player is against the wall, and the ray can hit it at once; a point that close lies
  // behind the muzzle and turned the held gun around (wallrun-permissions check). Look past such a hit.
  return aimPoint.copy(aimOrigin).addScaledVector(aimDirection, hit && hit.t > 1.2 ? hit.t : range);
}
function aimWeaponAt(target) {
  const carryPosition=worldWeapon.position.clone(),carryRotation=worldWeapon.quaternion.clone();
  // updateWorldWeapon already refreshed the holder hierarchy. Reuse its
  // matrices instead of updating ancestors and inverting the same matrix for
  // each shoulder, hand and muzzle conversion.
  aimInverse.copy(model.matrixWorld).invert();
  const localTarget=target.clone().applyMatrix4(aimInverse);
  // The chest turns first; shoulder roots and both hand goals then share it.
  // While holding the rope and not firing, the chest faces the rope instead of the aim point.
  const ropeChest=hold.kind==='hook'&&aimBlend<.5;
  const torso=ropeChest?aimRig.prepare(gripLocal.copy(hold.target).applyMatrix4(aimInverse).toArray(),.5*hold.blend):aimRig.prepare(localTarget.toArray(),aimBlend);
  document.body.dataset.skyHumanTorso=JSON.stringify(torso);
  const roots = aimRig.shoulders().map(p => new Vector3(...p).applyMatrix4(model.matrixWorld));
  const centre = roots[0].clone().add(roots[1]).multiplyScalar(.5);
  aimDirection.copy(target).sub(centre).normalize();
  right.set(-aimDirection.z, 0, aimDirection.x).normalize();
  // Keep both wrists within reach, including the support grip of long weapons.
  aimHand.copy(centre).addScaledVector(right, .075).addScaledVector(aimDirection, .24 - Math.min(.035, (sky.Et.recoil || 0) * .25));
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
  aimHand.set(...heldWeapon.grip).applyMatrix4(worldWeapon.matrixWorld).applyMatrix4(aimInverse);
  aimSupport.set(...heldWeapon.support).applyMatrix4(worldWeapon.matrixWorld).applyMatrix4(aimInverse);
  aimPalm.set(0,-1,0).applyQuaternion(worldWeapon.quaternion).transformDirection(aimInverse);
  // The left hand leaves the gun for the rope / the trolley; the right hand keeps the gun (carried or aimed).
  if(holdsOn()){gripTargets(aimInverse);aimSupport.copy(gripLeft);}
  const error=aimRig.apply([aimHand.toArray(),aimSupport.toArray()],aimPalm.toArray(),holdsOn()?1:aimBlend);
  gunMuzzle.copy(heldWeapon.muzzle).applyMatrix4(worldWeapon.matrixWorld);
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
  if (!worldWeapon) { if (third && c.doorAction) updateDoorPose(); else if (!(third && updateGripHands())) aimRig?.reset(); if (muzzleFlash) muzzleFlash.visible = false; updateHookRope(third); return; }
  worldWeapon.visible = third && !!sky.U.gunOn && !c.doorAction && !landingRoll.active && !c.swingFlight && !c.swingFall && c.state !== 'ladder' && c.state !== 'ledge' && c.state !== 'swing';
  if (!worldWeapon.visible) { aimBlend=0;if (third && c.doorAction) updateDoorPose(); else if (!(third && updateGripHands())) aimRig?.reset(); if (muzzleFlash) muzzleFlash.visible = false; updateHookRope(third); return; }
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
  if(aimBlend>.0001||(holdsOn()&&aimRig))aimWeaponAt(shotTarget&&shotTime<.12?shotTarget:previewAim());else aimRig?.reset();
  updateHookRope(third);
  // (The loader's own three.js build has no geometry classes, so the flash was never built; it uses the game's now.)
  if (!muzzleFlash && Geom.Sphere && Geom.Basic && Geom.Mesh) {
    muzzleFlash = new Geom.Mesh(new Geom.Sphere(.075, 6, 4), new Geom.Basic({ color: 0xffe2a0, transparent: true, opacity: .9, depthWrite: false, fog: false }));
    muzzleFlash.name = 'Muzzle flash'; muzzleFlash.castShadow = false; world.add(muzzleFlash);
  }
  if (muzzleFlash) {
    muzzleFlash.visible = third && shotTime < .06;
    if (muzzleFlash.visible) { worldWeapon.updateMatrixWorld(true); muzzleFlash.position.copy(heldWeapon.muzzle);worldWeapon.localToWorld(muzzleFlash.position); }
  }
}
function update(dt, preparingShot = false) {
  if (window.skyFixedCamera && !window.skyFixedCamera.active) window.skyFixedCamera.restore();
  if (!c.doorAction) {
    delete document.body.dataset.skyHumanDoorAction;
    delete document.body.dataset.skyHumanDoorPhase;
    delete document.body.dataset.skyHumanDoorReachError;
  }
  const third = choice === 'unity' && view === 'third' && !!holder && sky.modeRef() !== 'menu' && sky.modeRef() !== 'replay' && !window.skySettings?.beforeRun;
  if (view !== desiredView()) { view = desiredView(); sync(); }
  if (choice === 'unity' && view === 'first' && sky.modeRef() === 'play') firstPersonRun = true;
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
    const flight = c.swingFlight||c.swingFall;
    const swingDirection = swinging ? c.swing.direction : flight?.direction;
    const swingYaw = swingDirection ? Math.atan2(swingDirection[0],swingDirection[1]) : null;
    if (sky.modeRef() === 'play') swingLean = swinging ? -c.swing.angle : flight ? -flight.angle*Math.exp(-flight.age*5) : swingLean * Math.exp(-dt * 18);
    const rolling = third && landingRoll.active && !!motion?.rollGround;
    const flip = flight?.perfect && flight.flipDuration > 0 && !c.onGround && c.state === 'normal' ? flipPose(flight.age, flight.flipDuration) : null;
    const accent = flip ? { pitch: flip.pitch, twist: 0 } : flight && !c.onGround && c.state === 'normal' ? releaseAccent(flight.age, reducedMotion) : { pitch: 0, twist: 0 };
    holder.rotation.set(rolling ? rollTurn(landingRoll.phase) : c.state === 'ladder' ? .09 : swingLean, rolling ? landingRoll.yaw : c.state === 'ladder' ? ladderYaw : swingYaw ?? ledgeYaw ?? c.yaw + Math.PI + bodyYawOffset + combatTurn + 1.25 * slidePose, ledgeYaw === null ? turnBank : 0, 'YXZ');
    if(swinging&&c.swing.fatigue){const shake=(Math.sin(c.swing.age*34)*.012+Math.sin(c.swing.age*19)*.006)*c.swing.fatigue*(reducedMotion?.15:1);holder.rotation.z+=shake;}
    updateGripFrame(dt, third);
    if (hold.blend > .001 && hold.last !== 'ladder') {
      // Turn to the rope, lean along it around the hips (not the feet), hang a little lower under the trolley.
      const turn = Math.atan2(Math.sin(hold.yaw - holder.rotation.y), Math.cos(hold.yaw - holder.rotation.y));
      holder.rotation.y += turn * hold.blend;
      const x = holder.rotation.x, yaw = holder.rotation.y, hip = .92;
      hipOffset.set(hip * Math.sin(x) * Math.sin(yaw), hip * Math.cos(x), hip * Math.sin(x) * Math.cos(yaw));
      holder.rotation.x += hold.pitch * hold.blend; holder.rotation.z *= 1 - hold.blend;
      hipOffset.sub(forward.set(0, hip, 0).applyEuler(holder.rotation)); holder.position.add(hipOffset);
      holder.position.y -= hold.drop * hold.blend;
    }
    updateBodyFeel(dt, third);
    document.body.dataset.skyHumanGripFatigue=String(c.swing?.fatigue||0);
    document.body.dataset.skyHumanGripSlip=String(c.swing?.slipAge??c.swingFall?.age??'');
    if (accent.pitch || accent.twist) {
      // Rotate around the visual hips, not the feet/collision capsule. Neither
      // the chase camera nor the player's position and heading follows this.
      const x = holder.rotation.x, yaw = holder.rotation.y, hip = .92;
      hipOffset.set(hip * Math.sin(x) * Math.sin(yaw), hip * Math.cos(x), hip * Math.sin(x) * Math.cos(yaw));
      holder.rotation.x += accent.pitch; holder.rotation.y += accent.twist;
      hipOffset.sub(forward.set(0, hip, 0).applyEuler(holder.rotation)); holder.position.add(hipOffset);
    }
    document.body.dataset.skyHumanReleaseAccent = accent.pitch.toFixed(3);
    document.body.dataset.skyHumanFlipPhase = flip ? flip.phase.toFixed(3) : '';
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
  if (!third) { occludedHuman?.update(false);updateWorldWeapon(false,dt);window.skyFirstPersonView?.update(dt, false); return; }
  // Match Unity's over-shoulder distance while keeping the player in frame.
  pivot.set(c.pos.x, c.camY === undefined ? c.pos.y + c.eye : c.camY, c.pos.z);
  if (c.state === 'swing') pivot.y=c.pos.y+c.eye;
  if (c.state === 'ledge' && holder) pivot.y = holder.position.y + Math.min(c.eye, 1.5);
  if (window.skyFixedCamera?.active) {
    window.skyFixedCamera.camera(camera);
    pivot.set(c.pos.x, c.pos.y + 1.3, c.pos.z);
  }
  forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
  right.set(1, 0, 0).applyQuaternion(camera.quaternion);
  const chase = window.skyFixedCamera?.active ? window.skyFixedCamera.chase : window.skyDash?.camera || { distance: 3.6, shoulder: .62, height: .18 };
  wanted.copy(pivot).addScaledVector(forward, -chase.distance).addScaledVector(right, chase.shoulder);
  wanted.y += chase.height;
  // The maps expose the same solid-field query used by player movement.
  delta.copy(wanted).sub(pivot);
  let safe = 1;
  const fixedClear = window.skyFixedCamera?.active && window.skyFixedCamera.occlusion(pivot, wanted);
  for (let step = 1; !fixedClear && step <= 24; step++) {
    probe.copy(pivot).addScaledVector(delta, step / 24);
    if (!sky.oe(probe.x, probe.y - .16, probe.z, .16, .32)) { safe = Math.max(0, (step - 2) / 24); break; }
  }
  if(window.skyFixedCamera?.active&&window.skyFixedCamera.opaque){
    safe=window.skyFixedCamera.resolveCamera(pivot,wanted,dt);
    delta.copy(wanted).sub(pivot);camera.rotation.set(window.skyFixedCamera.pitch,window.skyFixedCamera.view.yaw,0);
  }
  camera.position.copy(pivot).addScaledVector(delta, safe);
  camera.updateMatrixWorld();
  const follow = window.skyFollowCamera?.active;
  // Hide the avatar before it fills the view, with a wider return threshold
  // so a wall edge does not flicker between a full body and first person.
  const distance = delta.length() * safe;
  closeFollowView = !!follow && distance < (closeFollowView ? 1.95 : 1.65);
  const close = follow ? closeFollowView : safe <= .28;
  // Invulnerability blink hides the body and its held weapon together.
  // The held weapon is holstered while the arms are busy pushing a zombie off.
  const blinkOff = !!window.skyBite?.blinkOff, holster = !!window.skyBite?.holster;
  updateWorldWeapon(!close && !blinkOff && !holster,dt);
  if (holder) holder.visible = !close && !blinkOff;
  occludedHuman?.update(!!window.skyFixedCamera?.active&&window.skyFixedCamera.opaque&&!close&&!blinkOff&&window.skyFixedCamera.bodyOccluded(camera.position));
  window.skyBite?.body(holder, !close && !blinkOff);
  if (worldWeapon && (close || blinkOff || holster)) worldWeapon.visible = false;
  if (ls) ls.root.visible = close && !follow && !!sky.U.showBody;
  for (const arm of mr) arm.root.visible = close && !follow && !!sky.U.showBody;
  document.body.dataset.skyHumanView = close ? 'first-collision' : 'third';
  document.body.dataset.skyHumanCameraClearance = safe.toFixed(2);
  window.skyCameraClearance = safe;
  // A squeezed follow view prioritizes the landing area over body/weapon overlays.
  window.skyFirstPersonView?.update(dt, !close || !!follow);
}
function getMuzzleWorld() {
  if(choice!=='unity'||view!=='third'||!worldWeapon?.visible||!holder?.visible)return null;
  worldWeapon.updateMatrixWorld(true);return worldWeapon.localToWorld(heldWeapon.muzzle.clone());
}
function prepareShot(origin,direction,distance) {
  landingRoll.cancel();
  landTime = 0;
  if(choice!=='unity'||view!=='third'||!holder?.visible||!aimRig)return null;
  // Airborne fire remains available: it takes over the hands from the reach
  // animation on this same frame, before the muzzle/ray are calculated.
  c.swingFlight = null; c.swingFall = null;
  // A practice warp/respawn can be noticed during this same update. Keep the
  // in-flight shot's aim point even when the previous movement pose resets.
  const target=origin.clone().addScaledVector(direction,distance);
  // 11/25: against a wall (wall run, the closer camera) the shot's hit can lie level with the runner, behind the gun,
  // which turned the drawn gun around. Only then does the drawn gun look 1.2 m past the runner along the same line;
  // an ordinary hit in front of the gun is untouched, and the shot itself (muzzle to the real hit, below) never changes.
  const past=(c.pos.x-origin.x)*direction.x+(c.pos.y+c.eye-origin.y)*direction.y+(c.pos.z-origin.z)*direction.z;
  shotTarget=distance<past+.6?origin.clone().addScaledVector(direction,past+1.2):target;shotTime=0;update(0,true);
  const muzzle=getMuzzleWorld();if(!muzzle)return null;
  const corrected=target.clone().sub(muzzle).normalize();
  document.body.dataset.skyHumanShot=JSON.stringify({origin:muzzle.toArray(),direction:corrected.toArray(),target:target.toArray(),gripError:+document.body.dataset.skyHumanGripError,aimError:+document.body.dataset.skyHumanAimError});
  return {origin:muzzle,direction:corrected};
}
// A decoy shares immutable geometry with the runner, but owns its pose,
// materials and animation weights. No second model download is needed.
function createDecoyAvatar(color = 0xff68e2) {
  if (!holder || !model) return null;
  const root = holder.clone(true), meshes = [];
  root.name = 'Player hologram twin'; root.visible = true;
  const material = color === null ? null : new Geom.Basic({ color, transparent: true, opacity: .72, depthWrite: false, fog: false, toneMapped: false, blending: 1 });
  root.traverse(node => {
    if (!node.isMesh) return;
    if (material) node.material = material; node.castShadow = node.receiveShadow = false;
    node.frustumCulled = false;
    if (node.morphTargetInfluences) { node.morphTargetInfluences = [...node.morphTargetInfluences]; meshes.push(node); }
  });
  return { root, material,
    animate(time, moving = true, state = 0) {
      const special = { 1: 'parkourJump', 2: 'slide', 3: 'parkourWallRight', 4: 'parkourVault', 5: 'parkourMantle', 6: 'parkourCatch', 9: 'ladder', 10: 'shoot' }[state];
      const key = motion?.clips[special] ? special : moving ? motion?.clips.parkourRun ? 'parkourRun' : 'runForward' : 'idle';
      const clip = motion?.clips[key];
      if (!clip) return;
      const sample = sampleClip(clip, (time / (clip.duration || .56)) % 1);
      for (const mesh of meshes) {
        mesh.morphTargetInfluences.fill(0);
        const a = mesh.morphTargetDictionary[clip.frames[sample.lo]], b = mesh.morphTargetDictionary[clip.frames[sample.hi]];
        if (a !== undefined) mesh.morphTargetInfluences[a] += 1 - sample.fraction;
        if (b !== undefined) mesh.morphTargetInfluences[b] += sample.fraction;
      }
      if (color === null && motion?.grips[key]) {
        const a = motion.grips[key][sample.lo], b = motion.grips[key][sample.hi];
        const point = new Vector3(...a.map((v, i) => v + (b[i] - v) * sample.fraction));
        root.updateMatrixWorld(true); return root.children[0].localToWorld(point);
      }
    },
    dispose() { root.removeFromParent(); material?.dispose(); }
  };
}
window.skyHumanView = { update, select, getMuzzleWorld, prepareShot, createDecoyAvatar,
  // A scripted shot (blast jump): same shoot pose and muzzle flash as a real round.
  noteShot() { shotTime = 0; },
  createReplayAvatar: () => createDecoyAvatar(null),
  get aimWork() { return aimRig?.work || null; },
  get morphBindingWork() { return { revision: 'dictionary-cache-v1', builds: morphBindingBuilds,
    meshes: morphMeshes.length, entries: morphMeshes.reduce((sum, mesh) => sum + (morphBindings.get(mesh)?.entries.length || 0), 0) }; },
  get canAimBehind() { return canAimBehind(); },
  autoAimReady(target) {
    // Automatic fire waits for the body to unfold. A deliberate shot can still
    // interrupt through prepareShot immediately, as with other parkour poses.
    if (c.swingFall || c.swingFlight?.perfect && c.swingFlight.age < c.swingFlight.flipDuration) return false;
    if (!canAimBehind()) return true;
    const direction = Math.atan2(target.pos.x - c.pos.x, target.pos.z - c.pos.z);
    return holder?.visible && aimBlend > .96 && Math.abs(wrapAngle(direction - holder.rotation.y)) < 1.12;
  },
  get choice() { return choice; }, get view() { return view; },
  get firstPerson() { return firstPerson; },
  setFirstPerson(on) {
    firstPerson = !!on;
    try { localStorage.setItem(FIRST_PERSON_KEY, firstPerson ? '1' : '0'); } catch {}
    view = desiredView();
    sync();
    document.dispatchEvent(new CustomEvent('sky-first-person-change'));
  },
  get firstPersonRun() { return firstPersonRun; },
  resetRun() { firstPersonRun = false; },
  get isFiring() { return shotTime < .28; },
  get runStyle() { return parkourRunEnabled ? 'parkour' : 'existing'; },
  set runStyle(value) { parkourRunEnabled = value !== 'existing'; } };
sync();
if (choice === 'unity') loadHuman();
