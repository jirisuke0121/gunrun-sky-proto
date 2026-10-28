import { solveLimb, boneMap } from './human-actions.js?v=20261028-swing-flow-v2';

export const LANDING_ROLL = Object.freeze({ minDrop: 3.2, minImpact: 10, duration: .64, samples: 24 });
const clamp = x => Math.max(0, Math.min(1, x));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a.map((v, k) => mix(v, b[k], t));
const distance = (a, b) => Math.hypot(...a.map((v, k) => v - b[k]));
export const rollTuck = phase => smooth(0, .17, phase) * (1 - smooth(.76, 1, phase));
export const rollTurn = phase => Math.PI * 2 * smooth(.12, .84, phase);

// The tucked shape uses one morph target; the holder turns about the hips.
// This keeps the full model within WebGL2's minimum 256 array-layer limit.
export function landingRollPose(phase) {
  const tuck = rollTuck(phase);
  const arms = {}, legs = {}, hands = {};
  const torso = p => {
    const upper = smooth(1.24, 2.12, p[1]);
    return [p[0], p[1] - tuck * (.14 + .30 * upper), p[2] + tuck * .30 * upper];
  };
  for (const side of [-1, 1]) {
    const shoulder = [side * .28, 1.94, -.075], elbow = [side * .43, 1.55, -.105], hand = [side * .52495, 1.19165, -.0644];
    const root = torso(shoulder), goal = lerp(hand, [side * .30, 1.29, .47], tuck);
    const arm = solveLimb(root, goal, distance(shoulder, elbow), distance(elbow, hand), [side, -.2, .2]);
    arms[side] = { upper: boneMap(shoulder, elbow, root, arm.joint), lower: boneMap(elbow, hand, arm.joint, arm.end) };
    hands[side < 0 ? 'right' : 'left'] = arm.end;
    const hip = [side * .17, 1.23, -.025], knee = [side * .23, .65, -.09], ankle = [side * .24, .12, -.04];
    // Offset the recovery foot to step straight out into the next stride.
    const foot = lerp(ankle, [side * .22, .79, .24 + (side > 0 ? .06 : -.06)], tuck);
    const hipTarget = torso(hip), leg = solveLimb(hipTarget, foot, distance(hip, knee), distance(knee, ankle), [0, .1, 1]);
    legs[side] = { upper: boneMap(hip, knee, hipTarget, leg.joint), lower: boneMap(knee, ankle, leg.joint, leg.end) };
  }
  return { hands, vertex(p, armWeight) {
    const side = p[0] < 0 ? -1 : 1, arm = arms[side], leg = legs[side];
    const a = lerp(arm.upper(p), arm.lower(p), 1 - smooth(1.48, 1.67, p[1]));
    let l = lerp(leg.upper(p), leg.lower(p), 1 - smooth(.55, .77, p[1]));
    if (Math.abs(p[0]) < .1) {
      const other = legs[-side], q = lerp(other.upper(p), other.lower(p), 1 - smooth(.55, .77, p[1]));
      l = side < 0 ? lerp(l, q, smooth(-.1, .1, p[0])) : lerp(q, l, smooth(-.1, .1, p[0]));
    }
    return lerp(lerp(torso(p), l, 1 - smooth(1.12, 1.42, p[1])), a, armWeight);
  } };
}

export function createLandingRoll(game) {
  const { c, z, U } = game;
  let peak = c.pos.y, airTime = 0, elapsed = -1, yaw = 0, snapOut = false, lastPosition = null;
  let drop = 0, impact = 0;
  const active = () => elapsed >= 0 && elapsed < LANDING_ROLL.duration;
  function cancel() { if (active()) snapOut = true; elapsed = -1; }
  function reset() { cancel(); peak = c.pos.y; airTime = 0; lastPosition = null; }
  function step(dt) {
    if (game.modeRef() !== 'play' || z.over) { reset(); return; }
    const speed = Math.hypot(c.vel.x, c.vel.z);
    if (lastPosition && Math.hypot(c.pos.x - lastPosition.x, c.pos.y - lastPosition.y, c.pos.z - lastPosition.z) > Math.max(2, Math.hypot(speed, c.vel.y) * dt * 4)) reset();
    lastPosition = { x: c.pos.x, y: c.pos.y, z: c.pos.z };
    if (active()) {
      if (!c.onGround || c.state !== 'normal' || c.jumpBuf > 0 || c.hookPressed || c.crouchPressed || c.h < 1) cancel();
      else { elapsed += dt; if (speed > .3) yaw = Math.atan2(c.vel.x, c.vel.z); }
    }
    if (c.onGround || c.state !== 'normal') { peak = c.pos.y; airTime = 0; }
    else { peak = Math.max(peak, c.pos.y); airTime += dt; }
  }
  const canLand = velocityY => c.state === 'normal' && c.h >= 1 && airTime >= .22 &&
    peak - c.pos.y >= LANDING_ROLL.minDrop && -velocityY >= LANDING_ROLL.minImpact;
  function land(velocityY) {
    drop = peak - c.pos.y; impact = -velocityY;
    if (!canLand(velocityY)) return false;
    elapsed = 0;
    yaw = Math.hypot(c.vel.x, c.vel.z) > .3 ? Math.atan2(c.vel.x, c.vel.z) : c.yaw + Math.PI;
    game.Mn?.(.16, 850, .6, .30);
    document.body.dataset.skyLandingRoll = JSON.stringify({ drop: +drop.toFixed(2), impact: +impact.toFixed(2), duration: LANDING_ROLL.duration });
    return true;
  }
  function move(dt, x, zz, magnitude) {
    if (!active() || !c.onGround || c.state !== 'normal') return false;
    const speed = Math.hypot(c.vel.x, c.vel.z);
    if (speed < .3) return false;
    const dot = (c.vel.x * x + c.vel.z * zz) / speed;
    if (magnitude > 0 && dot < -.2) { cancel(); return false; }
    // Keep the incoming momentum, with normal collision and steering. No boost
    // is added and jump, hook, crouch and reversing can interrupt immediately.
    const turn = magnitude > 0 ? Math.min(1, dt * 7) : 0;
    const vx = mix(c.vel.x / speed, x, turn), vz = mix(c.vel.z / speed, zz, turn), length = Math.hypot(vx, vz) || 1;
    const coast = Math.max(0, speed - Math.max(.5, U.momentumDecay * .25) * dt);
    c.vel.x = vx / length * coast; c.vel.z = vz / length * coast;
    return true;
  }
  function camera(reduced = false) {
    const phase = active() ? elapsed / LANDING_ROLL.duration : 0;
    const weight = Math.sin(Math.PI * phase), scale = reduced ? .2 : 1;
    return { dip: .24 * weight * scale, pitch: -.085 * weight * scale, bank: .035 * Math.sin(phase * Math.PI * 2) * scale, fov: 3 * weight * scale };
  }
  return { step, land, move, reset, cancel, camera, get active() { return active(); },
    get phase() { return active() ? elapsed / LANDING_ROLL.duration : 1; }, get yaw() { return yaw; },
    takeSnap() { const value = snapOut; snapOut = false; return value; } };
}
