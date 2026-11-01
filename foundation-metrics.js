// Compact counters only. Pauses and hidden-page intervals are not frame time.
export function createFrameMetrics() {
  let previous = null, frames = 0, durationMs = 0, below30 = 0, maxFrameMs = 0;
  return {
    sample(now, active) {
      if (!active || !Number.isFinite(now)) { previous = null; return; }
      const delta = previous === null ? 0 : now - previous; previous = now;
      if (delta <= 0 || delta > 1000) return;
      frames++; durationMs += delta; maxFrameMs = Math.max(maxFrameMs, delta);
      if (delta > 1000 / 30) below30++;
    },
    snapshot() {
      return frames < 2 || durationMs < 100 ? null : {
        frameCount: frames, durationMs: Math.round(durationMs), averageFps: Math.round(frames * 100000 / durationMs) / 100,
        below30Count: below30, maxFrameMs: Math.round(maxFrameMs * 100) / 100,
      };
    },
  };
}
