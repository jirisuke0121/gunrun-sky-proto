// Asset coordinates: +Y up, +Z forward. side is the wall's local X sign.
import { solveLimb, boneMap } from './human-actions.js?v=20261027-aim-v1';

export const WALLRUN_STRIDE = 2.8;
export const WALLRUN_SAMPLES = 16;
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a.map((v, k) => mix(v, b[k], t));
const distance = (a, b) => Math.hypot(...a.map((v, k) => v - b[k]));

export function wallRunFrame(normal, velocity, fallbackYaw = 0) {
  if (!normal) return null;
  const into = velocity.x * normal.x + velocity.z * normal.z;
  const x = velocity.x - normal.x * into, z = velocity.z - normal.z * into;
  const yaw = Math.hypot(x, z) > .1 ? Math.atan2(x, z) : fallbackYaw + Math.PI;
  const side = -normal.x * Math.cos(yaw) + normal.z * Math.sin(yaw) < 0 ? -1 : 1;
  return { yaw, side };
}

export function wallRunPose(side, phase) {
  const cycle = phase * Math.PI * 2, arms = {}, legs = {}, hands = {}, feet = {};
  // The chest leans away from the wall while the hips stay near the footholds.
  const torso = p => {
    const weight = smooth(.95, 1.8, p[1]);
    return [p[0] - side * (.06 + .18 * weight), p[1] - .13 + .018 * Math.cos(cycle * 2), p[2] + .10 * weight];
  };
  for (const limb of [-1, 1]) {
    const wallHand = limb === side;
    const shoulder = [limb * .28, 1.94, -.075], elbow = [limb * .43, 1.55, -.105], hand = [limb * .52495, 1.19165, -.0644];
    const goal = wallHand ? [side * .43, 1.65, .30] : [-side * .42, 1.43 + .10 * Math.sin(cycle), .32 + .12 * Math.cos(cycle)];
    const root = torso(shoulder), ik = solveLimb(root, goal, distance(shoulder, elbow), distance(elbow, hand), [limb, -.2, -.4]);
    hands[limb < 0 ? 'right' : 'left'] = ik.end;
    // Fingers point along the wall and palms face it.
    arms[limb] = { upper: boneMap(shoulder, elbow, root, ik.joint), lower: boneMap(elbow, hand, ik.joint, ik.end),
      palm: boneMap(hand, [hand[0], hand[1] - 1, hand[2]], ik.end, [ik.end[0], ik.end[1], ik.end[2] + 1]) };
    const hip = [limb * .17, 1.23, -.025], knee = [limb * .23, .65, -.09], ankle = [limb * .24, .12, -.04];
    const angle = cycle + (limb === side ? 0 : Math.PI), swing = Math.max(0, Math.sin(angle));
    // The planted half-cycle travels backwards along the wall; the return
    // lifts the boot away from the surface instead of pushing it through it.
    const foot = [side * (.32 - .19 * swing), .39 + .25 * swing, .04 + .39 * Math.cos(angle)];
    const hipTarget = torso(hip), leg = solveLimb(hipTarget, foot, distance(hip, knee), distance(knee, ankle), [-side * .2, .2, 1]);
    feet[limb] = leg.end;
    legs[limb] = { upper: boneMap(hip, knee, hipTarget, leg.joint), lower: boneMap(knee, ankle, leg.joint, leg.end),
      boot: boneMap(ankle, [ankle[0], ankle[1] - 1, ankle[2]], leg.end, [leg.end[0] + side, leg.end[1], leg.end[2]]) };
  }
  return { hands, feet, vertex(p, armWeight) {
    const limb = p[0] < 0 ? -1 : 1, arm = arms[limb], leg = legs[limb];
    let a = lerp(arm.upper(p), arm.lower(p), 1 - smooth(1.48, 1.67, p[1]));
    a = lerp(a, arm.palm(p), 1 - smooth(1.21, 1.34, p[1]));
    let l = lerp(leg.upper(p), leg.lower(p), 1 - smooth(.55, .77, p[1]));
    l = lerp(l, leg.boot(p), 1 - smooth(.16, .32, p[1]));
    if (Math.abs(p[0]) < .1) {
      const other = legs[-limb];
      let q = lerp(other.upper(p), other.lower(p), 1 - smooth(.55, .77, p[1]));
      q = lerp(q, other.boot(p), 1 - smooth(.16, .32, p[1]));
      l = limb < 0 ? lerp(l, q, smooth(-.1, .1, p[0])) : lerp(q, l, smooth(-.1, .1, p[0]));
    }
    return lerp(lerp(torso(p), l, 1 - smooth(1.12, 1.42, p[1])), a, armWeight);
  } };
}
