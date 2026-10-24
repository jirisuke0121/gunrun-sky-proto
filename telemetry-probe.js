// Diagnostic telemetry for the dev build. Nothing is sent by this file.
// The existing run recorder owns consent, storage, and transmission.
(function () {
  const caps = { jumps: 120, hooks: 100, opportunities: 80, zones: 120, falls: 40, frames: 18 };
  let run = null;
  let nextJump = 0;
  let opportunity = null;
  let seen = 0;
  let missing = 0;
  let activeZone = null;

  function add(key, value) {
    if (!run) return null;
    if (run[key].length >= caps[key]) {
      run.truncated[key] = (run.truncated[key] || 0) + 1;
      return null;
    }
    run[key].push(value);
    return value;
  }

  function reset() {
    run = { schema: 3, jumps: [], hooks: [], opportunities: [], zones: [], falls: [], frames: [], truncated: {} };
    nextJump = 0;
    opportunity = null;
    seen = 0;
    missing = 0;
    activeZone = null;
  }

  function jumpInput(data) {
    add("jumps", { id: ++nextJump, ...data, outcome: "pending" });
  }

  function jumpAccepted(t, kind = "jump") {
    if (!run) return;
    for (let i = run.jumps.length - 1; i >= 0; i--) {
      const item = run.jumps[i];
      if (item.outcome === "pending" && t - item.t <= 0.5 && t + 0.002 >= item.t) {
        item.outcome = kind === "jump" ? "accepted" : "consumed_" + kind;
        item.delayMs = Math.round((t - item.t) * 1000);
        return;
      }
    }
  }

  function hookAttempt(data) {
    add("hooks", data);
  }

  function hookLaunch(data) {
    if (!run) return;
    if (data.source === "canvas") {
      for (let i = run.hooks.length - 1; i >= 0; i--) {
        const item = run.hooks[i];
        if (item.source === "canvas" && item.result === "queued" && data.t - item.t <= 0.5) {
          item.result = data.result;
          item.anchor = data.anchor;
          return;
        }
      }
    }
    hookAttempt(data);
  }

  // Sampled every 0.25 s. Two samples enter or leave an opportunity episode.
  function observeOpportunity(t, anchor, place) {
    if (!run) return;
    if (anchor !== null) {
      seen++;
      missing = 0;
      if (!opportunity && seen >= 2) {
        const episode = { start: Math.max(0, t - 0.25), end: null, seconds: null, anchor, place };
        opportunity = add("opportunities", episode) || episode;
      }
    } else {
      seen = 0;
      missing++;
      if (opportunity && missing >= 2) {
        opportunity.end = t;
        opportunity.seconds = Math.round((t - opportunity.start) * 10) / 10;
        opportunity = null;
      }
    }
  }

  function observeZone(t, place) {
    if (!run || !place || activeZone?.place === place) return;
    if (activeZone) {
      activeZone.end = t;
      activeZone.seconds = Math.round((t - activeZone.start) * 10) / 10;
    }
    const visit = { place, start: t, end: null, seconds: null };
    activeZone = add("zones", visit) || visit;
  }

  function fall(data) {
    if (!run) return;
    const lastJump = [...run.jumps].reverse().find(x => x.t <= data.t);
    const lastHook = [...run.hooks].reverse().find(x => x.t <= data.t);
    add("falls", {
      ...data,
      jumpInputAgo: lastJump ? Math.round((data.t - lastJump.t) * 10) / 10 : null,
      hookAttemptAgo: lastHook ? Math.round((data.t - lastHook.t) * 10) / 10 : null,
    });
  }

  // RequestAnimationFrame intervals are kept separate from physics/recording intervals.
  function frame(ms, t, active) {
    if (!run || !active || !(ms > 0) || ms > 1000) return;
    const windowStart = Math.floor(t / 10) * 10;
    let bucket = run.frames[run.frames.length - 1];
    if (!bucket || bucket.start !== windowStart) {
      bucket = add("frames", { start: windowStart, n: 0, meanMs: 0, over33: 0, over50: 0, maxMs: 0, bins: [0, 0, 0, 0, 0, 0] });
      if (!bucket) return;
    }
    bucket.n++;
    bucket.meanMs += (ms - bucket.meanMs) / bucket.n;
    bucket.over33 += Number(ms > 33.3);
    bucket.over50 += Number(ms > 50);
    bucket.maxMs = Math.max(bucket.maxMs, ms);
    const bin = ms <= 16.7 ? 0 : ms <= 25 ? 1 : ms <= 33.3 ? 2 : ms <= 50 ? 3 : ms <= 100 ? 4 : 5;
    bucket.bins[bin]++;
  }

  function snapshot(t) {
    if (!run) return null;
    if (opportunity) {
      opportunity.end = t;
      opportunity.seconds = Math.round((t - opportunity.start) * 10) / 10;
      opportunity = null;
    }
    if (activeZone) {
      activeZone.end = t;
      activeZone.seconds = Math.round((t - activeZone.start) * 10) / 10;
      activeZone = null;
    }
    for (const item of run.jumps) {
      if (item.outcome === "pending") item.outcome = "not_accepted";
    }
    for (const item of run.hooks) {
      if (item.result === "queued") item.result = "not_started";
    }
    for (const item of run.frames) {
      item.meanMs = Math.round(item.meanMs * 10) / 10;
      item.maxMs = Math.round(item.maxMs * 10) / 10;
    }
    return run;
  }

  function inspect() {
    return run ? JSON.parse(JSON.stringify(run)) : null;
  }

  window.skyTelemetryProbe = { reset, jumpInput, jumpAccepted, hookAttempt, hookLaunch, observeOpportunity, observeZone, fall, frame, snapshot, inspect };
})();
