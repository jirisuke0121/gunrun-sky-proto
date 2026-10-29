// A well-timed release rewards the input, without choosing a landing target.
const clamp = x => Math.max(0, Math.min(1, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export function isPerfectRelease(angle, omega, window = [.55, .95]) {
  return omega > 1.1 && angle >= window[0] - .05 && angle <= window[1] + .05;
}
export function releaseCueProgress(angle, omega, window = [.55, .95]) {
  return omega > 0 ? clamp((angle - (window[0] - .6)) / .55) : 0;
}
export function flipPose(age, duration) {
  const phase = clamp(age / duration);
  return { phase, pitch: Math.PI * 2 * smooth(.02, .9, phase),
    tuck: smooth(0, .2, phase) * (1 - smooth(.64, .94, phase)) };
}

// Finish before either a solid or the next grip can take over. This forecast
// controls the visual's length only: it never modifies the ballistic launch.
export function flipDuration(position, velocity, gravity, freeAt, bars, releasedBar, radius) {
  let contact = .72;
  for (let t = 1 / 120; t < .72; t += 1 / 120) {
    const p = position.map((v, k) => v + velocity[k] * t - (k === 1 ? .5 * gravity * t * t : 0));
    if (!freeAt(p[0], p[1] + .03, p[2], radius, 1.75)) { contact = t; break; }
    const nextGrip = bars.some(b => {
      if (b.id === releasedBar) return false;
      const side = [-b.direction[1], b.direction[0]];
      const across = (p[0] - b.at[0]) * side[0] + (p[2] - b.at[2]) * side[1];
      const offset = Math.max(-b.width / 2 + .3, Math.min(b.width / 2 - .3, across));
      const pivot = [b.at[0] + side[0] * offset, b.at[1], b.at[2] + side[1] * offset];
      return pivot[1] - p[1] > .5 && Math.abs(across - offset) < .5 &&
        Math.hypot(...p.map((v, k) => v - pivot[k])) < 3;
    });
    if (nextGrip) { contact = t; break; }
  }
  return Math.max(.12, Math.min(.5, (contact - .045) * .85));
}
