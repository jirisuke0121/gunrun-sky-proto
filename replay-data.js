import { validateReplayDetail } from './replay-detail.js?v=20261031-ghost-scene-v1';
// Shared by the recorder, viewer and Worker. Samples use recorded positions;
// playback never re-runs physics or interpolates across a respawn.
export const REPLAY_VERSION = 1;
export const REPLAY_STEP = 0.05;
export const REPLAY_LIMIT = 6002;
export const REPLAY_STATES = ['run', 'air', 'slide', 'wallrun', 'vault', 'mantle', 'catch', 'hook', 'zip', 'ladder'];
export const MAP_VERSIONS = { 'old-town': 'old-town-beams-20261025', 'rock-canyon': 'rock-canyon-v1' };

export function recordMap(record) {
  if (['old-town','rock-canyon'].includes(record.mapKey)) return record.mapKey;
  return record.map?.id === 'rock_canyon_v1' || record.mapVersion === 'rock-canyon-v1' ? 'rock-canyon' : 'old-town';
}

export function validateGhost(value, map, duration) {
  if (!Number.isFinite(duration) || duration < 0 || duration > 300 || !value || value.v !== REPLAY_VERSION || value.map !== map || value.mapVersion !== MAP_VERSIONS[map] ||
      !Array.isArray(value.samples) || value.samples.length < 2 || value.samples.length > REPLAY_LIMIT) return null;
  let previous = -1;
  for (const sample of value.samples) {
    if (!Array.isArray(sample) || sample.length !== 9 || !sample.every(Number.isFinite)) return null;
    const [t, x, y, z, yaw, pitch, state, life, cut] = sample;
    if (t <= previous || t < 0 || t > 300 || t > duration + 0.11 ||
        Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) > 10000 || Math.abs(yaw) > 100000 || Math.abs(pitch) > 1.6 ||
        !Number.isInteger(state) || state < 0 || state >= REPLAY_STATES.length ||
        !Number.isInteger(life) || life < 0 || life > 8 || (cut !== 0 && cut !== 1)) return null;
    previous = t;
  }
  const detail = validateReplayDetail(value.detail, duration);
  return { v: REPLAY_VERSION, map, mapVersion: value.mapVersion, source: 'recorded', samples: value.samples, ...(detail ? { detail } : {}) };
}

export function replayFromRecord(record) {
  const map = recordMap(record);
  const recorded = validateGhost(record.ghost, map, record.t);
  if (recorded) return recorded;
  // Old uploads contain only a one-second trail. Expose it explicitly as an
  // approximate path, without inventing original view angles or technique timing.
  if (!Array.isArray(record.trail) || record.trail.length < 2 || record.trail.length > 301) return null;
  const samples = [];
  for (const row of record.trail) {
    if (!Array.isArray(row) || row.length < 5 || !row.slice(0, 5).every(Number.isFinite)) return null;
    const [t, x, y, z, state] = row;
    if (t < 0 || t > 300 || t > record.t + 0.11 || Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) > 10000 ||
        !Number.isInteger(state) || state < 0 || state >= REPLAY_STATES.length) return null;
    const last = samples.at(-1);
    if (last && t <= last[0]) return null;
    const cut = last && Math.hypot(x - last[1], y - last[2], z - last[3]) > 20 ? 1 : 0;
    const yaw = last && !cut ? Math.atan2(last[1] - x, last[3] - z) : last?.[4] || 0;
    samples.push([t, x, y, z, yaw, 0, state, 3, cut]);
  }
  return { v: 1, map, mapVersion: null, source: 'legacy-trail', samples };
}

export function sampleReplay(samples, time) {
  if (!samples.length) return null;
  let lo = 0, hi = samples.length - 1;
  if (time <= samples[0][0]) return samples[0].slice();
  if (time >= samples[hi][0]) return samples[hi].slice();
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid][0] <= time) lo = mid; else hi = mid;
  }
  const a = samples[lo], b = samples[hi];
  if (b[8]) return a.slice();
  const f = (time - a[0]) / (b[0] - a[0]);
  const pose = a.slice();
  pose[0] = time;
  for (const i of [1, 2, 3, 5]) pose[i] = a[i] + (b[i] - a[i]) * f;
  const turn = Math.atan2(Math.sin(b[4] - a[4]), Math.cos(b[4] - a[4]));
  pose[4] = a[4] + turn * f;
  return pose;
}
