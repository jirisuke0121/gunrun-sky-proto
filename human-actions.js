// Asset-space poses for the baked Unity human: +Y up, +Z forward.
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const add = (a, b) => a.map((x, i) => x + b[i]);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const mul = (a, s) => a.map(x => x * s);
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const length = a => Math.hypot(...a);
const unit = a => mul(a, 1 / (length(a) || 1));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp = (a, b, t) => a.map((x, i) => mix(x, b[i], t));

export const LANDING_SECONDS = .22;
// Visual recovery only: no movement state, impulse, or input lock.
export function releaseAccent(age, reduced = false) {
  const weight = smooth(0, .10, age) * (1 - smooth(.16, .38, age)) * (reduced ? .25 : 1);
  return { pitch: .95 * weight, twist: .22 * weight };
}

export function landingPose(phase) {
  const t = clamp(phase), weight = smooth(0, .25, t) * (1 - smooth(.25, 1, t));
  const torso = p => {
    const upper = smooth(1.15, 1.95, p[1]);
    return [p[0], p[1] - .23 * weight, p[2] + .20 * upper * weight];
  };
  const arms = {}, legs = {}, hands = {};
  for (const side of [-1, 1]) {
    const shoulder = [side * .28, 1.94, -.075], elbow = [side * .43, 1.55, -.105], hand = [side * .52495, 1.19165, -.0644];
    const root = torso(shoulder), goal = lerp(hand, [side * .42, 1.35, .34], weight);
    const arm = solveLimb(root, goal, length(sub(elbow, shoulder)), length(sub(hand, elbow)), [side, -.2, -.3]);
    hands[side < 0 ? 'right' : 'left'] = arm.end;
    arms[side] = { upper: boneMap(shoulder, elbow, root, arm.joint), lower: boneMap(elbow, hand, arm.joint, arm.end) };
    const hip = [side * .17, 1.23, -.025], knee = [side * .23, .65, -.09], ankle = [side * .24, .12, -.04];
    // Boots keep their floor height while the hips drop and knees flex.
    const leg = solveLimb(torso(hip), ankle, length(sub(knee, hip)), length(sub(ankle, knee)), [0, .1, 1]);
    legs[side] = { upper: boneMap(hip, knee, torso(hip), leg.joint), lower: boneMap(knee, ankle, leg.joint, leg.end),
      boot: boneMap(ankle, add(ankle, [0, -1, 0]), leg.end, add(leg.end, [0, -1, 0])) };
  }
  return { hands, vertex(p, armWeight) {
    const side = p[0] < 0 ? -1 : 1, arm = arms[side], leg = legs[side];
    const a = lerp(arm.upper(p), arm.lower(p), 1 - smooth(1.48, 1.67, p[1]));
    let l = lerp(leg.upper(p), leg.lower(p), 1 - smooth(.55, .77, p[1]));
    l = lerp(l, leg.boot(p), 1 - smooth(.16, .32, p[1]));
    if (Math.abs(p[0]) < .1) {
      const other = legs[-side];
      let q = lerp(other.upper(p), other.lower(p), 1 - smooth(.55, .77, p[1]));
      q = lerp(q, other.boot(p), 1 - smooth(.16, .32, p[1]));
      l = side < 0 ? lerp(l, q, smooth(-.1, .1, p[0])) : lerp(q, l, smooth(-.1, .1, p[0]));
    }
    return lerp(lerp(torso(p), l, 1 - smooth(1.12, 1.42, p[1])), a, armWeight);
  } };
}

export function solveLimb(root, target, upperLength, lowerLength, hint) {
  const delta = sub(target, root), direction = length(delta) > .00001 ? unit(delta) : [0, -1, 0];
  const distance = clamp(length(sub(target, root)), Math.abs(upperLength - lowerLength) + .001, upperLength + lowerLength - .001);
  let normal = sub(hint, mul(direction, dot(hint, direction)));
  if (length(normal) < .001) normal = cross(direction, Math.abs(direction[0]) < .8 ? [1, 0, 0] : [0, 0, 1]);
  normal = unit(normal);
  const along = (upperLength ** 2 - lowerLength ** 2 + distance ** 2) / (2 * distance);
  return { joint: add(root, add(mul(direction, along), mul(normal, Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2))))), end: add(root, mul(direction, distance)) };
}

export function boneMap(a, b, targetA, targetB) {
  const u = unit(sub(b, a)), v = unit(sub(targetB, targetA)), cosine = clamp(dot(u, v), -1, 1);
  let axis = cross(u, v), sine = length(axis);
  if (sine < .000001 && cosine < 0) { axis = unit(cross(u, Math.abs(u[0]) < .8 ? [1, 0, 0] : [0, 1, 0])); }
  else axis = sine > .000001 ? mul(axis, 1 / sine) : [1, 0, 0];
  return p => {
    const q = sub(p, a);
    return add(targetA, add(add(mul(q, cosine), mul(cross(axis, q), sine)), mul(axis, dot(axis, q) * (1 - cosine))));
  };
}

export function actionPose(kind, phase) {
  if (kind === 'parkourSwing') return swingPose(phase);
  if (kind === 'parkourSwingFlight') return swingFlightPose(phase);
  const t = clamp(phase), jump = kind === 'parkourJump', vault = kind === 'parkourVault';
  const release = jump ? smooth(.78, 1, t) : smooth(.74, 1, t);
  const tuck = jump ? Math.sin(Math.PI * clamp(t / .86)) : Math.sin(Math.PI * t);
  const lean = jump ? .14 * (1 - release) : (vault ? .58 : .48) * Math.sin(Math.PI * t);
  const drop = jump ? .06 * smooth(.78, .9, t) * (1 - smooth(.9, 1, t)) : (vault ? .25 : .14) * Math.sin(Math.PI * t);
  const torso = p => {
    const weight = smooth(1.05, 1.7, p[1]);
    const y = p[1] - 1.26, z = p[2] + .045;
    return [p[0], mix(p[1], 1.26 + y * Math.cos(lean) - z * Math.sin(lean), weight) - drop,
      mix(p[2], -.045 + y * Math.sin(lean) + z * Math.cos(lean), weight)];
  };
  const arms = {}, legs = {}, hands = {};
  for (const side of [-1, 1]) {
    const shoulder = [side * .28, 1.94, -.075], elbow = [side * .43, 1.55, -.105];
    const hand = [side * .52495, 1.19165, -.0644];
    let goal;
    if (jump) {
      const spread = .48 + .14 * Math.sin(Math.PI * clamp(t / .85));
      goal = lerp([side * spread, 1.63 + .25 * Math.sin(Math.PI * t / .85) + (side > 0 ? .08 : -.08) * tuck, .23 + .14 * tuck], hand, release);
    } else {
      const height = vault ? mix(1.13, .72, smooth(.08, .65, t)) : mix(2.35, .78, smooth(.08, .76, t));
      goal = lerp([side * .30, height, vault ? .65 : .48], hand, release);
    }
    const shoulderTarget = torso(shoulder);
    const ik = solveLimb(shoulderTarget, goal, length(sub(elbow, shoulder)), length(sub(hand, elbow)), [side, -.15, -.3]);
    hands[side < 0 ? 'right' : 'left'] = ik.end;
    const fingers = lerp([0, -.02, 1], [0, -1, 0], release);
    arms[side] = { upper: boneMap(shoulder, elbow, shoulderTarget, ik.joint), lower: boneMap(elbow, hand, ik.joint, ik.end),
      palm: boneMap(hand, add(hand, [0, -1, 0]), ik.end, add(ik.end, fingers)) };
    const hip = [side * .17, 1.23, -.025], knee = [side * .23, .65, -.09], ankle = [side * .24, .12, -.04];
    const lift = jump ? .42 * tuck * (side > 0 ? 1.15 : .8) : (vault ? .66 : .45) * tuck * (side > 0 ? 1 : .65);
    const foot = [side * (.24 + .04 * tuck), .12 + lift, -.04 + (jump ? .23 : .37) * tuck * (side > 0 ? 1 : -.35)];
    const hipTarget = torso(hip);
    const legIK = solveLimb(hipTarget, foot, length(sub(knee, hip)), length(sub(ankle, knee)), [0, .1, 1]);
    legs[side] = { upper: boneMap(hip, knee, hipTarget, legIK.joint), lower: boneMap(knee, ankle, legIK.joint, legIK.end) };
  }
  return { hands, contactWeight: jump ? 0 : 1 - smooth(.72, .94, t),
    vertex(p, armWeight) {
      const side = p[0] < 0 ? -1 : 1, arm = arms[side], leg = legs[side];
      let a = lerp(arm.upper(p), arm.lower(p), 1 - smooth(1.48, 1.67, p[1]));
      // Lay the palm/fingers along the top surface instead of leaving the
      // unarmed model's downward fingers pointing into the obstacle.
      if (!jump) a = lerp(a, arm.palm(p), 1 - smooth(1.21, 1.34, p[1]));
      let l = lerp(leg.upper(p), leg.lower(p), 1 - smooth(.55, .77, p[1]));
      if (Math.abs(p[0]) < .1) {
        const other = legs[-side], q = lerp(other.upper(p), other.lower(p), 1 - smooth(.55, .77, p[1]));
        l = side < 0 ? lerp(l, q, smooth(-.1, .1, p[0])) : lerp(q, l, smooth(-.1, .1, p[0]));
      }
      const body = lerp(torso(p), l, 1 - smooth(1.12, 1.42, p[1]));
      return lerp(body, a, armWeight);
    }
  };
}

// Hands stay above the shoulders; the movement state's angle rotates the whole
// body about this grip. Legs tuck and extend through the pendulum's arc.
function swingPose(phase) {
  const angle = clamp(phase)*2.3-1.15;
  const front = smooth(-.15,.95,angle), back = smooth(.1,.95,-angle);
  const tuck = 1-smooth(.15,.95,Math.abs(angle)), arms = {}, legs = {}, hands = {};
  for (const side of [-1, 1]) {
    const shoulder = [side * .28, 1.94, -.075], elbow = [side * .43, 1.55, -.105], hand = [side * .52495, 1.19165, -.0644];
    const goal = [side * .32, 2.62, .03];
    const arm = solveLimb(shoulder, goal, length(sub(elbow, shoulder)), length(sub(hand, elbow)), [side, 0, -.3]);
    hands[side < 0 ? 'right' : 'left'] = arm.end;
    arms[side] = { upper: boneMap(shoulder, elbow, shoulder, arm.joint), lower: boneMap(elbow, hand, arm.joint, arm.end),
      palm: boneMap(hand, add(hand, [0,-1,0]), arm.end, add(arm.end, [0,0,1])) };
    const hip = [side * .17, 1.23, -.025], knee = [side * .23, .65, -.09], ankle = [side * .24, .12, -.04];
    // Compress through the bottom, then drive the feet out ahead of the hips.
    // The split legs make the acceleration readable even from three quarters.
    const foot = [side * (.23+.05*front), .12 + .55*tuck + .12*front,
      -.04 + (.62+side*.16)*front - .42*back];
    const leg = solveLimb(hip, foot, length(sub(knee, hip)), length(sub(ankle, knee)), [0,.1,1]);
    legs[side] = { upper: boneMap(hip,knee,hip,leg.joint), lower: boneMap(knee,ankle,leg.joint,leg.end) };
  }
  return { hands, contactWeight: 1, vertex(p, armWeight) {
    const side = p[0] < 0 ? -1 : 1, arm = arms[side], leg = legs[side];
    let a = lerp(arm.upper(p),arm.lower(p),1-smooth(1.48,1.67,p[1]));
    a = lerp(a,arm.palm(p),1-smooth(1.21,1.34,p[1]));
    const l = lerp(leg.upper(p),leg.lower(p),1-smooth(.55,.77,p[1]));
    return lerp(lerp(p,l,1-smooth(1.12,1.42,p[1])),a,armWeight);
  } };
}

// Release -> compact flight -> reach. This clip is used only after a bar jump;
// ordinary jumps keep their existing animation and controls.
function swingFlightPose(phase) {
  const t=clamp(phase), fold=smooth(0,.35,t)*(1-smooth(.5,.9,t));
  const reach=smooth(.25,.65,t), settle=smooth(.7,1,t), arms={},legs={},hands={};
  for(const side of [-1,1]) {
    const shoulder=[side*.28,1.94,-.075],elbow=[side*.43,1.55,-.105],hand=[side*.52495,1.19165,-.0644];
    const goal=lerp([side*mix(.32,.27,reach),2.6-.5*fold,.03+.55*fold+.28*reach],
      [side*.42,1.42,.28],settle);
    const arm=solveLimb(shoulder,goal,length(sub(elbow,shoulder)),length(sub(hand,elbow)),[side,0,-.3]);
    hands[side<0?'right':'left']=arm.end;
    arms[side]={upper:boneMap(shoulder,elbow,shoulder,arm.joint),lower:boneMap(elbow,hand,arm.joint,arm.end),
      palm:boneMap(hand,add(hand,[0,-1,0]),arm.end,add(arm.end,[0,0,1]))};
    const hip=[side*.17,1.23,-.025],knee=[side*.23,.65,-.09],ankle=[side*.24,.12,-.04];
    const foot=[side*.25,.15+.6*fold*(side>0?1:.72),.15+.5*fold+side*.22*(1-fold)];
    const leg=solveLimb(hip,foot,length(sub(knee,hip)),length(sub(ankle,knee)),[0,.1,1]);
    legs[side]={upper:boneMap(hip,knee,hip,leg.joint),lower:boneMap(knee,ankle,leg.joint,leg.end)};
  }
  return {hands,contactWeight:0,vertex(p,armWeight){
    const side=p[0]<0?-1:1,arm=arms[side],leg=legs[side];
    let a=lerp(arm.upper(p),arm.lower(p),1-smooth(1.48,1.67,p[1]));
    a=lerp(a,arm.palm(p),1-smooth(1.21,1.34,p[1]));
    const l=lerp(leg.upper(p),leg.lower(p),1-smooth(.55,.77,p[1]));
    return lerp(lerp(p,l,1-smooth(1.12,1.42,p[1])),a,armWeight);
  }};
}

export function jumpPhase(velocityY, jumpVelocity, landingTime) {
  if (landingTime > 0) return .82 + .18 * (1 - clamp(landingTime / .14));
  return velocityY > 0 ? .08 + .38 * (1 - clamp(velocityY / Math.max(1, jumpVelocity)))
    : .48 + .32 * clamp(-velocityY / Math.max(1, jumpVelocity));
}

export function ledgeAnchor(ledge, solids = []) {
  let best = Infinity, anchor = null;
  const dx = ledge.tx - ledge.sx, dz = ledge.tz - ledge.sz;
  for (const solid of solids) {
    if (solid.off || solid.type === 'rail' || solid.type === 'mono' || solid.maxY > ledge.ty + .03 || solid.maxY < ledge.ty - .46) continue;
    let near = 0, far = 1, valid = true;
    for (const [start, delta, low, high] of [[ledge.sx, dx, solid.minX, solid.maxX], [ledge.sz, dz, solid.minZ, solid.maxZ]]) {
      if (Math.abs(delta) < .00001) { if (start < low || start > high) valid = false; continue; }
      const a = (low - start) / delta, b = (high - start) / delta;
      near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
    }
    if (valid && near <= far && near < best) {
      best = near;
      anchor = { x: ledge.sx + dx * near + (ledge.dx || 0) * .025, y: solid.maxY + .015, z: ledge.sz + dz * near + (ledge.dz || 0) * .025 };
    }
  }
  return anchor || { x: mix(ledge.sx, ledge.tx, .6), y: ledge.ty + .015, z: mix(ledge.sz, ledge.tz, .6) };
}
