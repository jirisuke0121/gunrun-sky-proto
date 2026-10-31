// Optional combat detail. Movement-only v1 recordings remain valid.
export const DETAIL_MAX_BYTES = 128000;
export const DETAIL_ACTORS = 6;
export const ENEMY_CLIPS = ['Walking', 'Running', 'Attack', 'Dead', 'Limping_Walk_1'];
const MAX_FRAMES = 1202, MAX_SHOTS = 2048, TRACK_BYTES = 62000;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const integer = (n, low, high) => Number.isInteger(n) && n >= low && n <= high;
const angle = n => Math.atan2(Math.sin(n), Math.cos(n));
const stamp = n => Math.round(n * 1000) / 1000;
const cm = n => Math.round(n * 100);
const size = value => JSON.stringify(value).length; // Only numeric arrays and fixed ASCII keys.

export function validateReplayDetail(value, duration) {
  if (!value || value.v !== 1 || !Array.isArray(value.shots) || !Array.isArray(value.frames) ||
      value.shots.length > MAX_SHOTS || value.frames.length > MAX_FRAMES || size(value) > DETAIL_MAX_BYTES) return null;
  let previous = -1;
  for (const row of value.shots) {
    if (!Array.isArray(row) || row.length !== 8 || !row.every(finite) || row[0] < previous || row[0] < 0 || row[0] > duration + .11 ||
        !integer(row[1], 0, 12) || !row.slice(2).every(n => integer(n, -1000000, 1000000))) return null;
    previous = row[0];
  }
  previous = -1;
  for (const frame of value.frames) {
    if (!Array.isArray(frame) || frame.length !== 2 || !finite(frame[0]) || frame[0] <= previous || frame[0] < 0 || frame[0] > duration + .11 ||
        !Array.isArray(frame[1]) || frame[1].length > DETAIL_ACTORS) return null;
    previous = frame[0];
    const ids = new Set();
    for (const row of frame[1]) {
      if (!Array.isArray(row) || row.length !== 9 || !row.every(Number.isInteger) || !integer(row[0], 1, 65535) || ids.has(row[0]) ||
          !row.slice(1, 4).every(n => integer(n, -1000000, 1000000)) || !integer(row[4], -3142, 3142) ||
          !integer(row[5], 0, 1) || !integer(row[6], 1, 3000) || !integer(row[7], 0, ENEMY_CLIPS.length - 1) || !integer(row[8], 0, 120000)) return null;
      ids.add(row[0]);
    }
  }
  return { v: 1, shots: value.shots, frames: value.frames, shotsComplete: value.shotsComplete !== false };
}

export function createDetailRecorder(game) {
  let frames, shots, ids, nextId, step, frameBytes, shotBytes, shotsComplete;
  function reset() { frames = []; shots = []; ids = new WeakMap(); nextId = 1; step = .25; frameBytes = shotBytes = 0; shotsComplete = true; }
  reset();
  function capture(force = false) {
    const t = stamp(game.z.t), last = frames.at(-1);
    if (last && (t <= last[0] || (!force && t - last[0] < step - .001))) return;
    const nearby = game.Jt.filter(e => !e.remove && e.spawnT <= 0 && e.m?.root?.visible)
      .sort((a, b) => a.pos.distanceToSquared(game.c.pos) - b.pos.distanceToSquared(game.c.pos)).slice(0, DETAIL_ACTORS);
    const rows = nearby.map(e => {
      if (!ids.has(e)) ids.set(e, nextId++);
      const root = e.m.root;
      return [ids.get(e), cm(root.position.x), cm(root.position.y), cm(root.position.z), Math.round(angle(root.rotation.y) * 1000),
        e.m.src?.kind === 'unity-evolved' ? 1 : 0, Math.round(root.scale.x * 1000),
        Math.max(0, ENEMY_CLIPS.indexOf(e.dead ? 'Dead' : e.m.cur)), Math.round(Math.min(120, e.m.curA?.time || 0) * 1000)];
    });
    const frame = [t, rows]; frames.push(frame); frameBytes += size(frame) + 1;
    if (frameBytes > TRACK_BYTES || frames.length > MAX_FRAMES) {
      // Keep the whole run covered; trade sample rate for size rather than
      // losing the end of a long recording. Preserve both endpoints.
      frames = frames.filter((_, i) => i % 2 === 0 || i === frames.length - 1);
      step *= 2; frameBytes = size(frames);
    }
  }
  function shot(origin, target, weapon) {
    const row = [stamp(game.z.t), weapon, ...origin.toArray().map(cm), ...target.toArray().map(cm)];
    const bytes = size(row) + 1;
    if (shots.length >= MAX_SHOTS || shotBytes + bytes > TRACK_BYTES) { shotsComplete = false; return; }
    shots.push(row); shotBytes += bytes;
  }
  function snapshot() { capture(true); return { v: 1, shots, frames, shotsComplete }; }
  return { reset, capture, shot, snapshot };
}

export function sampleEnemies(frames, time) {
  if (!frames?.length || time < frames[0][0]) return [];
  let lo = 0, hi = frames.length - 1;
  if (time >= frames[hi][0]) return frames[hi][1];
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (frames[mid][0] <= time) lo = mid; else hi = mid; }
  const a = frames[lo], b = frames[hi], f = (time - a[0]) / (b[0] - a[0]);
  const following = new Map(b[1].map(row => [row[0], row]));
  return a[1].map(row => {
    const next = following.get(row[0]), out = row.slice();
    if (!next || Math.hypot(...[1, 2, 3].map(i => next[i] - row[i])) > 600) return out;
    for (const i of [1, 2, 3]) out[i] += (next[i] - row[i]) * f;
    out[4] = row[4] + angle((next[4] - row[4]) / 1000) * 1000 * f;
    if (next[7] === row[7] && next[8] >= row[8]) out[8] += (next[8] - row[8]) * f;
    return out;
  });
}
