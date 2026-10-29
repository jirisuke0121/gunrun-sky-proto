// Running style for the existing, baked Unity human. No new model download.
// Asset-space metres: +Y up, +Z forward, the right hand is on -X.
import { actionPose, boneMap, solveLimb, landingPose, LANDING_SECONDS } from './human-actions.js?v=20261030-landing-release-v1';
export { LANDING_SECONDS, releaseAccent } from './human-actions.js?v=20261030-landing-release-v1';
import { landingRollPose, rollTuck, rollTurn, LANDING_ROLL } from './landing-roll.js?v=20261029-edge-assist-v3';
export { createLandingRoll, rollTuck, rollTurn } from './landing-roll.js?v=20261029-edge-assist-v3';
import { wallRunPose, WALLRUN_SAMPLES } from './human-wallrun.js?v=20261027-wallrun-v2';
export { wallRunFrame, WALLRUN_STRIDE } from './human-wallrun.js?v=20261027-wallrun-v2';
export { jumpPhase, ledgeAnchor } from './human-actions.js?v=20261030-landing-release-v1';
export const RUN_STRIDE = 3.36;
export const DASH_STRIDE = 3.8;
export const RUN_SAMPLES = 24;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

export function sampleClip(info, phase) {
  const time = clamp(phase, 0, 1) * info.duration;
  let hi = info.times.findIndex(t => t >= time);
  if (hi < 0) hi = info.times.length - 1;
  const lo = Math.max(0, hi - 1), span = info.times[hi] - info.times[lo];
  return { lo, hi, fraction: span > .00001 ? (time - info.times[lo]) / span : 0 };
}

function rotateX(p, pivot, angle) {
  const y = p[1] - pivot[1], z = p[2] - pivot[2], c = Math.cos(angle), s = Math.sin(angle);
  return [p[0], pivot[1] + y * c - z * s, pivot[2] + y * s + z * c];
}
function rotateY(p, pivot, angle) {
  const x = p[0] - pivot[0], z = p[2] - pivot[2], c = Math.cos(angle), s = Math.sin(angle);
  return [pivot[0] + x * c + z * s, p[1], pivot[2] - x * s + z * c];
}

export function armWeight(p) {
  // Classify once in the unarmed jump-start pose, never in a moving frame.
  // The shoulder fade joins the sleeve to the torso without splitting the mesh.
  const shoulder = smoothstep(1.72, 2.02, p[1]);
  return smoothstep(mix(.29, .17, shoulder), mix(.38, .34, shoulder), Math.abs(p[0]))
    * smoothstep(.70, .92, p[1]) * (1 - smoothstep(1.99, 2.08, p[1]));
}

export function swingArm(p, side, phase) {
  const elbow = [side * .43, 1.55, -.105];
  const shoulder = [side * .28, 1.94, -.075];
  const bend = 1 - smoothstep(1.48, 1.67, p[1]);
  const bent = rotateX(p, elbow, -1.42);
  const flexed = p.map((value, i) => mix(value, bent[i], bend));
  // Opposite arm and leg advance together. Keep the elbows bent on the return.
  return rotateX(flexed, shoulder, -.10 + side * .78 * Math.cos(phase * TAU));
}

export function leanTorso(p, phase, weight = smoothstep(1.06, 1.64, p[1])) {
  const hip = [0, 1.28, -.045];
  let q = rotateY(p, hip, .085 * Math.sin(phase * TAU));
  q = rotateX(q, hip, .42);
  return p.map((value, i) => mix(value, q[i] + (i === 1 ? .025 * Math.cos(phase * TAU * 2) : 0), weight));
}

export function runningVertex(run, unarmed, phase) {
  const arm = armWeight(unarmed);
  const upper = smoothstep(1.22, 1.64, unarmed[1]);
  const swung = swingArm(unarmed, unarmed[0] < 0 ? -1 : 1, phase);
  const p = run.map((value, i) => mix(mix(value, unarmed[i], upper), swung[i], arm));
  return leanTorso(p, phase);
}

// The planted foot travels backwards by the same distance as the root moves
// forwards. Recovery has separate heel-up, knee-drive and touchdown poses.
const SPRINT_CONTACT = .22;
function sprintFoot(phase, stride) {
  const t = ((phase % 1) + 1) % 1;
  if (t <= SPRINT_CONTACT) {
    const toeOff = smoothstep(.15, SPRINT_CONTACT, t), pitch = .5 * toeOff;
    return { y: .12 * Math.cos(pitch) + .20 * Math.sin(pitch),
      z: .50 - stride * t + .20 - (-.12 * Math.sin(pitch) + .20 * Math.cos(pitch)), pitch, planted: true };
  }
  const end = .50 - stride * SPRINT_CONTACT;
  const keys = [[SPRINT_CONTACT, .12 * Math.cos(.5) + .20 * Math.sin(.5), end + .20 - (-.12 * Math.sin(.5) + .20 * Math.cos(.5)), .5],
    [.40, .90, -.47, .85], [.64, .80, .43, -.15], [.84, .38, .77, -.3], [1, .12, .50, 0]];
  let i = 0; while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const a = keys[i], b = keys[i + 1], span = b[0] - a[0], f = (t - a[0]) / span;
  const tangent = (at, axis) => {
    if (at === 0 || at === keys.length - 1) return axis === 2 ? -stride : 0;
    if (axis === 1 && at === 1) return 0;
    return (keys[at + 1][axis] - keys[at - 1][axis]) / (keys[at + 1][0] - keys[at - 1][0]);
  };
  const curve = axis => (2 * f ** 3 - 3 * f ** 2 + 1) * a[axis]
    + (f ** 3 - 2 * f ** 2 + f) * tangent(i, axis) * span
    + (-2 * f ** 3 + 3 * f ** 2) * b[axis]
    + (f ** 3 - f ** 2) * tangent(i + 1, axis) * span;
  return { y: curve(1), z: curve(2), pitch: curve(3), planted: false };
}

export function sprintPose(phase, stride = DASH_STRIDE / .77) {
  const theta = phase * TAU, hip = [0, 1.23, -.025];
  const support = ((phase % .5) + .5) % .5;
  const pelvisY = support <= SPRINT_CONTACT ? 1.10 + .025 * Math.sin(support / SPRINT_CONTACT * Math.PI)
    : 1.10 + .14 * Math.sin((support - SPRINT_CONTACT) / (.5 - SPRINT_CONTACT) * Math.PI);
  const pelvisZ = -.04, lean = .46;
  const torso = p => {
    let q = rotateX(rotateY(p, hip, .075 * Math.sin(theta)), hip, lean);
    // Counter-rotate above the neck so the runner looks along the route.
    const neck = rotateX([0, 2.00, -.04], hip, lean), head = rotateX(q, neck, -.24);
    const headWeight = smoothstep(1.96, 2.13, p[1]);
    q = q.map((v, k) => mix(v, head[k], headWeight));
    return [q[0], q[1] + pelvisY - hip[1], q[2] + pelvisZ - hip[2]];
  };
  const arms = {}, legs = {}, hands = {}, feet = {};
  for (const side of [-1, 1]) {
    const t = ((phase + (side < 0 ? 0 : .5)) % 1 + 1) % 1;
    const shoulder = [side * .28, 1.94, -.075], elbow = [side * .43, 1.55, -.105];
    const hand = [side * .52495, 1.19165, -.0644];
    // Same-side arm goes back as the foot lands in front of the pelvis.
    const drive = Math.cos(t * TAU), armAngle = .05 + .72 * drive;
    const bend = -1.65 + .20 * drive;
    const upperArm = p => torso(rotateX(p, shoulder, armAngle));
    const lowerArm = p => torso(rotateX(rotateX(p, elbow, bend), shoulder, armAngle));
    const arm = p => {
      const a = upperArm(p), b = lowerArm(p);
      return a.map((v, k) => mix(v, b[k], 1 - smoothstep(1.48, 1.67, p[1])));
    };
    arms[side] = arm;
    hands[side < 0 ? 'right' : 'left'] = lowerArm(hand);
    const root = [side * .17, 1.23, -.025], knee = [side * .23, .65, -.09], ankle = [side * .24, .12, -.04];
    const foot = sprintFoot(t, stride), rootTarget = [root[0], pelvisY, pelvisZ];
    const goal = [side * .24, foot.y, foot.z];
    const length = (a, b) => Math.hypot(...a.map((v, k) => v - b[k]));
    const ik = solveLimb(rootTarget, goal, length(knee, root), length(ankle, knee), [0, .2, 1]);
    legs[side] = { upper: boneMap(root, knee, rootTarget, ik.joint), lower: boneMap(knee, ankle, ik.joint, ik.end),
      foot: p => rotateX(p, ankle, foot.pitch).map((v, k) => v + ik.end[k] - ankle[k]) };
    feet[side < 0 ? 'right' : 'left'] = { ...foot, ankle: ik.end };
  }
  const rightDrive = Math.cos(theta), rightBend = -1.65 + .20 * rightDrive;
  return { hands, feet, pitch: clamp(-(rightBend + .05 + .72 * rightDrive + lean + Math.PI / 2), -1.5, .8),
    vertex(p) {
      const side = p[0] < 0 ? -1 : 1;
      const legPoint = s => {
        const leg = legs[s], upper = leg.upper(p), lower = leg.lower(p), foot = leg.foot(p);
        return upper.map((v, k) => mix(mix(v, lower[k], 1 - smoothstep(.55, .77, p[1])), foot[k], 1 - smoothstep(.16, .28, p[1])));
      };
      let leg = legPoint(side);
      if (Math.abs(p[0]) < .1) {
        const other = legPoint(-side), t = smoothstep(-.1, .1, p[0]);
        leg = leg.map((v, k) => side < 0 ? mix(v, other[k], t) : mix(other[k], v, t));
      }
      const body = torso(p), arm = arms[side](p), weight = armWeight(p);
      return body.map((v, k) => mix(mix(leg[k], v, smoothstep(1.12, 1.42, p[1])), arm[k], weight));
    }
  };
}

export function strideAdvance(phase, distance, stride = RUN_STRIDE) {
  return ((phase + Math.max(0, distance) / stride) % 1 + 1) % 1;
}

// Blend over a speed interval instead of switching posture at one threshold.
export function runningBlend(speed, walkSpeed, sprintSpeed) {
  return smoothstep(walkSpeed + .08, Math.max(walkSpeed + .35, (walkSpeed + sprintSpeed) / 2), speed);
}

function transform(p, m) {
  return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
}
function point(attribute, index) { return [attribute.getX(index), attribute.getY(index), attribute.getZ(index)]; }
function posedPoint(mesh, frameName, index, matrix) {
  const p = point(mesh.geometry.attributes.position, index);
  const target = mesh.geometry.morphAttributes.position?.[mesh.morphTargetDictionary?.[frameName]];
  if (target) {
    const q = point(target, index);
    for (let i = 0; i < 3; i++) p[i] = mesh.geometry.morphTargetsRelative ? p[i] + q[i] : q[i];
  }
  return transform(p, matrix);
}
function frameNormals(positions, indices, baseNormal) {
  const out = new Float32Array(positions.length);
  const addFace = (a, b, c) => {
    const ab = [positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]];
    const ac = [positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]];
    const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    for (const v of [a, b, c]) for (let k = 0; k < 3; k++) out[v + k] += n[k];
  };
  for (let i = 0; i < (indices?.count || positions.length / 3); i += 3) {
    addFace((indices ? indices.getX(i) : i) * 3, (indices ? indices.getX(i + 1) : i + 1) * 3, (indices ? indices.getX(i + 2) : i + 2) * 3);
  }
  for (let i = 0; i < out.length; i += 3) {
    const length = Math.hypot(out[i], out[i + 1], out[i + 2]) || 1;
    for (let k = 0; k < 3; k++) out[i + k] = out[i + k] / length - baseNormal.array[i + k];
  }
  return out;
}

export function addParkourRun(model, motion, Attribute) {
  const meshes = [];
  model.updateMatrixWorld(true);
  model.traverse(node => { if (node.isMesh && node.geometry.attributes.position) meshes.push(node); });
  const body = meshes.find(node => node.name.startsWith('Body_mesh'));
  const source = motion?.clips?.runForward, unarmed = motion?.clips?.jump?.frames?.[0];
  if (!body || !source || !unarmed || body.morphTargetDictionary?.[unarmed] === undefined) return false;
  const inverseModel = model.matrixWorld.clone().invert();
  const matrices = new Map(meshes.map(mesh => [mesh, inverseModel.clone().multiply(mesh.matrixWorld)]));
  const bodyMatrix = matrices.get(body).elements;
  const originalBodyNames = Object.entries(body.morphTargetDictionary).sort((a,b)=>a[1]-b[1]).map(([name])=>name);
  const bodyBase = [], bodyUnarmed = [], bodyFrames = [];
  const count = body.geometry.attributes.position.count;
  for (let i = 0; i < count; i++) {
    bodyBase.push(transform(point(body.geometry.attributes.position, i), bodyMatrix));
    bodyUnarmed.push(posedPoint(body, unarmed, i, bodyMatrix));
  }
  const sourceFrames = source.frames.map(name => Array.from({ length: count }, (_, i) => posedPoint(body, name, i, bodyMatrix)));
  const frames = [], times = [], grips = [], pitches = [];
  for (let frame = 0; frame <= RUN_SAMPLES; frame++) {
    const phase = frame === RUN_SAMPLES ? 0 : frame / RUN_SAMPLES, { lo, hi, fraction } = sampleClip(source, phase);
    frames.push(`parkourRun_${String(frame).padStart(3, '0')}`);
    times.push(frame / RUN_SAMPLES * .56);
    bodyFrames.push(bodyUnarmed.map((p, i) => runningVertex(sourceFrames[lo][i].map((v, k) => mix(v, sourceFrames[hi][i][k], fraction)), p, phase)));
    grips.push(leanTorso(swingArm(motion.grips.jump[0], -1, phase), phase, 1));
    pitches.push(clamp(-(-1.42 - .10 - .78 * Math.cos(phase * TAU) + .42 + Math.PI / 2), -1.35, .6));
  }
  const actionClips = {}, actionGrips = {}, actionHands = {};
  for (const side of [-1, 1]) {
    const kind = side < 0 ? 'parkourWallLeft' : 'parkourWallRight';
    const names = [], seconds = [], rightHands = [], bothHands = [];
    for (let i = 0; i <= WALLRUN_SAMPLES; i++) {
      const pose = wallRunPose(side, i === WALLRUN_SAMPLES ? 0 : i / WALLRUN_SAMPLES);
      const name = `${kind}_${String(i).padStart(3, '0')}`;
      names.push(name); seconds.push(i / WALLRUN_SAMPLES); frames.push(name);
      bodyFrames.push(bodyUnarmed.map(p => pose.vertex(p, armWeight(p))));
      rightHands.push(pose.hands.right); bothHands.push(pose.hands);
    }
    actionClips[kind] = { frames: names, times: seconds, duration: 1, source: 'distance-synchronised wall contact cycle' };
    actionGrips[kind] = rightHands; actionHands[kind] = bothHands;
  }
  for (const kind of ['parkourJump', 'parkourVault', 'parkourMantle', 'parkourCatch', 'parkourSwing', 'parkourSwingFlight']) {
    const names = [], seconds = [], rightHands = [], bothHands = [];
    const samples=kind==='parkourSwingFlight'?4:kind==='parkourSwing'?8:12;
    for (let i = 0; i <= samples; i++) {
      const phase = i / samples, pose = actionPose(kind, phase), name = `${kind}_${String(i).padStart(3, '0')}`;
      names.push(name); seconds.push(phase); frames.push(name);
      bodyFrames.push(bodyUnarmed.map(p => pose.vertex(p, armWeight(p))));
      rightHands.push(pose.hands.right); bothHands.push(pose.hands);
    }
    actionClips[kind] = { frames: names, times: seconds, duration: 1, source: 'reference-inspired two-bone limb poses' };
    actionGrips[kind] = rightHands; actionHands[kind] = bothHands;
  }
  {
    // One additional target reaches, but does not exceed, the 256-layer floor.
    const pose = landingPose(.25), name = 'parkourLand_compress';
    frames.push(name); bodyFrames.push(bodyUnarmed.map(p => pose.vertex(p, armWeight(p))));
    actionClips.parkourLand = { frames: [unarmed, name, unarmed], times: [0, .055, LANDING_SECONDS], duration: LANDING_SECONDS, source: 'grounded knee compression and stride recovery' };
    actionGrips.parkourLand = [motion.grips.jump[0], pose.hands.right, motion.grips.jump[0]];
    actionHands.parkourLand = [landingPose(0).hands, pose.hands, landingPose(1).hands];
  }
  {
    const pose = landingRollPose(.5), name = 'parkourRoll_tuck';
    const vertices = bodyUnarmed.map(p => pose.vertex(p, armWeight(p)));
    frames.push(name); bodyFrames.push(vertices);
    actionClips.parkourRoll = { frames: [unarmed, name], times: [0, LANDING_ROLL.duration], duration: LANDING_ROLL.duration, source: 'tucked landing roll with continuous root rotation' };
    actionGrips.parkourRoll = [motion.grips.jump[0], pose.hands.right];
    actionHands.parkourRoll = [pose.hands, pose.hands];
    motion.rollGround = [];
    for (let i = 0; i <= LANDING_ROLL.samples; i++) {
      const phase = i / LANDING_ROLL.samples, tuck = rollTuck(phase), angle = rollTurn(phase), co = Math.cos(angle), si = Math.sin(angle);
      const floor = Math.min(...bodyUnarmed.map((p, j) => {
        const y = mix(p[1], vertices[j][1], tuck) + model.position.y, z = mix(p[2], vertices[j][2], tuck) + model.position.z;
        return y * co - z * si;
      }));
      const hipY = 1.02 + model.position.y, hipZ = .1 + model.position.z;
      motion.rollGround.push({ y: .025 - floor, z: hipZ - (hipY * si + hipZ * co) });
    }
  }
  const dashNames = [], dashGrips = [], dashPitches = [];
  for (let i = 0; i <= RUN_SAMPLES; i++) {
    const name = `parkourDash_${String(i).padStart(3, '0')}`;
    const pose = sprintPose(i === RUN_SAMPLES ? 0 : i / RUN_SAMPLES, DASH_STRIDE / (model.parent?.scale.y || .77));
    const vertices = bodyUnarmed.map(p => pose.vertex(p));
    const lift = Math.max(0, -Math.min(...vertices.map(p => p[1] + model.position.y)));
    dashNames.push(name); frames.push(name);
    bodyFrames.push(vertices.map(p => [p[0], p[1] + lift, p[2]]));
    dashGrips.push([pose.hands.right[0], pose.hands.right[1] + lift, pose.hands.right[2]]);
    dashPitches.push(pose.pitch);
  }
  for (const mesh of meshes) {
    const geometry = mesh.geometry, base = geometry.attributes.position, matrix = matrices.get(mesh);
    const inverse = matrix.clone().invert().elements;
    const positions = geometry.morphAttributes.position || [];
    const names = geometry.userData.targetNames || Object.entries(mesh.morphTargetDictionary || {}).sort((a, b) => a[1] - b[1]).map(([name]) => name);
    if (geometry.morphTargetsRelative === false && positions.length) throw new Error('Parkour run requires relative morph targets');
    geometry.morphTargetsRelative = true;
    const zero = new Attribute(new Float32Array(base.count * 3), 3);
    const normals = geometry.morphAttributes.normal || positions.map(() => zero);
    // Static masks/eyes/knee pads follow the same body surface. This also prevents
    // a leaning face from leaving its mask behind. Bind each vertex once at load.
    const bindings = mesh === body ? null : Array.from({ length: base.count }, (_, i) => {
      const p = transform(point(base, i), matrix.elements), nearest = [];
      for (let j = 0; j < count; j++) {
        const distance = Math.hypot(...p.map((v, k) => v - bodyBase[j][k]));
        if (nearest.length < 3 || distance < nearest[2].distance) {
          nearest.push({ index: j, distance }); nearest.sort((a, b) => a.distance - b.distance); nearest.length = Math.min(3, nearest.length);
        }
      }
      const total = nearest.reduce((sum, n) => sum + 1 / Math.max(.0001, n.distance ** 2), 0);
      return { p, nearest: nearest.map(n => ({ index: n.index, weight: 1 / Math.max(.0001, n.distance ** 2) / total })) };
    });
    // The export only baked Body/Hood/Backpack. Static mask/eyes/knee pads
    // must also follow the original slide and armed clips, not just new poses.
    const missingOriginal = positions.length ? [] : originalBodyNames;
    const frameNames = [...missingOriginal, ...frames];
    for (let frame = 0; frame < frameNames.length; frame++) {
      const absolute = new Float32Array(base.count * 3), delta = new Float32Array(base.count * 3);
      for (let i = 0; i < base.count; i++) {
        let p;
        if (mesh === body) p = bodyFrames[frame][i];
        else if (bindings) {
          const binding = bindings[i];
          const follows = binding.nearest.map(n => ({...n, p:frame < missingOriginal.length ? posedPoint(body, frameNames[frame], n.index, bodyMatrix) : bodyFrames[frame - missingOriginal.length][n.index]}));
          p = binding.p.map((v, k) => v + follows.reduce((sum, n) => sum + n.weight * (n.p[k] - bodyBase[n.index][k]), 0));
        }
        const local = transform(p, inverse);
        for (let k = 0; k < 3; k++) { absolute[i * 3 + k] = local[k]; delta[i * 3 + k] = local[k] - base.array[i * 3 + k]; }
      }
      const target = new Attribute(delta, 3);
      target.name = frameNames[frame];
      positions.push(target);
      normals.push(new Attribute(frameNormals(absolute, geometry.index, geometry.attributes.normal), 3));
      names.push(frameNames[frame]);
    }
    geometry.morphAttributes.position = positions;
    geometry.morphAttributes.normal = normals;
    geometry.userData.targetNames = names;
    mesh.updateMorphTargets();
    // GLTFLoader restores exported names separately from updateMorphTargets.
    mesh.morphTargetDictionary = Object.fromEntries(names.map((name, i) => [name, i]));
  }
  motion.clips.parkourRun = { frames: frames.slice(0, RUN_SAMPLES + 1), times, duration: .56, source: 'procedural reference run over existing Unity run legs' };
  motion.grips.parkourRun = grips;
  motion.gripPitches = { ...motion.gripPitches, parkourRun: pitches };
  motion.clips.parkourDash = { frames: dashNames, times: [...times], duration: .56, source: 'reference sprint: deep lean, arm drive, high knees and folded recovery leg' };
  motion.grips.parkourDash = dashGrips;
  motion.gripPitches.parkourDash = dashPitches;
  Object.assign(motion.clips, actionClips); Object.assign(motion.grips, actionGrips);
  motion.hands = { ...motion.hands, ...actionHands };
  return true;
}
