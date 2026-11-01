// NIGHTLINE's rendered-frame policy, with no React, GPU queries or frame logs.
export const AUTO_RESOLUTION_POLICY = Object.freeze({ warmupMs: 5000, windowMs: 1000, windows: 10, slowWindows: 6, thresholdFps: 45, interruptionMs: 1000 });
export function createAutoResolutionMonitor() {
  let started = null, previous = null, windowStart = null, frames = 0, qualified = false;
  const windows = [];
  const reset = () => { started = previous = windowStart = null; frames = 0; windows.length = 0; };
  return {
    sample(now, active, rendered) {
      if (qualified) return;
      if (!active || !Number.isFinite(now)) { reset(); return; }
      if (previous !== null && (now <= previous || now - previous > AUTO_RESOLUTION_POLICY.interruptionMs)) reset();
      previous = now; started ??= now;
      if (now - started < AUTO_RESOLUTION_POLICY.warmupMs) return;
      if (windowStart === null) { windowStart = now; return; }
      if (rendered) frames++;
      const elapsed = now - windowStart;
      if (elapsed < AUTO_RESOLUTION_POLICY.windowMs) return;
      windows.push(frames * 1000 / elapsed < AUTO_RESOLUTION_POLICY.thresholdFps);
      if (windows.length > AUTO_RESOLUTION_POLICY.windows) windows.shift();
      qualified = windows.length === AUTO_RESOLUTION_POLICY.windows && windows.filter(Boolean).length >= AUTO_RESOLUTION_POLICY.slowWindows;
      frames = 0; windowStart = now;
    },
    get shouldReduce() { return qualified; },
    get evaluated() { return windows.length === AUTO_RESOLUTION_POLICY.windows; },
  };
}
