// Real-device frame budget trace. On by default for every device, so real play on real phones shows what is slow.
// It changes nothing about the game or the ranking: runs keep channel "production" and the breakdown rides along in
// diagnostics.perf. Nothing is sent by this file: the run recorder attaches snapshot() and still honours the
// "send play records" setting. A device can stop it with ?perf=0 (remembered) and resume with ?perf=1.
//
// What is recorded, per 10 s of play (game time) and for the slowest frames:
//   iv      requestAnimationFrame interval (what the player feels)
//   cpu     time spent inside our frame callback (iv - cpu is time waiting for the GPU / compositor / vsync)
//   adv     game step: player physics, zombies, path search       cam / hv / render   camera, human view, draw submit
//   ai, so  zombie updates and path searches; both run inside adv, so they are not added to it
//   rest    cpu - adv - cam - hv - render (HUD, minimap, replay, other scripts)
// At most 18 ten-second windows (3 minutes) and 12 slow frames are kept; `truncated` counts frames past the window cap.
// Safari rounds performance.now() to about 1 ms, so a single small section can read 0 or 1 ms; the 10 s means
// are still fair and `timerMs` stores the resolution that was measured.
(function () {
  const KEY = 'gunrun-perf';
  try {
    const query = new URLSearchParams(location.search).get('perf');
    if (query === '0') localStorage.setItem(KEY, '0');
    else if (query === '1') localStorage.removeItem(KEY);
  } catch {}
  let enabled = true;
  try { enabled = localStorage.getItem(KEY) !== '0'; } catch {}
  if (!enabled) {
    window.skyPerfTrace = { on: false, t: (name, fn) => fn(), add() {}, frame() {}, reset() {}, snapshot: () => null, context: null };
    return;
  }

  const SECTIONS = ['adv', 'cam', 'hv', 'render', 'ai', 'so'];
  const CAP = { buckets: 18, worst: 12 };
  const now = () => performance.now();
  const round = v => Math.round(v * 10) / 10;
  const binOf = ms => ms <= 16.7 ? 0 : ms <= 25 ? 1 : ms <= 33.3 ? 2 : ms <= 50 ? 3 : ms <= 100 ? 4 : 5;
  const blank = () => ({ adv: 0, cam: 0, hv: 0, render: 0, ai: 0, so: 0, soCalls: 0 });
  // Measured once, when the first record is built (not at page load): a coarse clock needs up to 1 ms per sample.
  let timerMs;
  const timerResolution = () => {
    if (timerMs !== undefined) return timerMs;
    let best = Infinity;
    for (let i = 0; i < 8; i++) {
      const a = now(); let b = a;
      for (let k = 0; k < 200000 && b === a; k++) b = now();
      if (b > a) best = Math.min(best, b - a);
    }
    return timerMs = Number.isFinite(best) ? Math.round(best * 1000) / 1000 : null;
  };
  let cur = blank(), zMax = { ms: 0 }, run = null, wrapped = false;

  function reset() {
    run = { schema: 1, buckets: [], worst: [], truncated: 0 };
    cur = blank(); zMax = { ms: 0 };
  }
  reset();

  function t(name, fn) {
    const a = now();
    try { return fn(); } finally { cur[name] += now() - a; }
  }
  function add(name, ms) {
    cur[name] += ms;
    if (name === 'so') cur.soCalls++;
  }
  function zombie(z, ms) {
    cur.ai += ms;
    if (ms > zMax.ms) {
      zMax = { ms, x: z.pos.x, y: z.pos.y, z: z.pos.z, act: z.act?.kind || '', fl: z.flank ? 1 : 0, st: z.stalker ? 1 : 0, dr: z.dropper ? 1 : 0 };
    }
  }
  // Wrapped on the first measured frame, after every module has patched update(), so the whole chain is timed.
  function wrapZombies() {
    const ri = window.__skyInternals?.ri;
    if (wrapped || !ri?.prototype?.update) return;
    wrapped = true;
    const original = ri.prototype.update;
    ri.prototype.update = function (dt) {
      const a = now();
      try { return original.call(this, dt); } finally { zombie(this, now() - a); }
    };
  }
  const newBucket = start => ({ start, n: 0, iv: 0, ivMax: 0, cpu: 0, cpuMax: 0, iv33: 0, iv50: 0, cpu17: 0, cpu33: 0,
    bins: [0, 0, 0, 0, 0, 0], sum: SECTIONS.map(() => 0), max: SECTIONS.map(() => 0), soCalls: 0, zMax: 0 });

  function frame(interval, time, active, cpu) {
    const c = cur, z = zMax;
    cur = blank(); zMax = { ms: 0 };
    if (!run || !active || !(interval > 0) || interval > 1000 || !(cpu >= 0)) return;
    wrapZombies();
    const start = Math.floor(time / 10) * 10;
    let b = run.buckets[run.buckets.length - 1];
    if (!b || b.start !== start) {
      if (run.buckets.length >= CAP.buckets) { run.truncated++; b = null; }
      else { b = newBucket(start); run.buckets.push(b); }
    }
    if (b) {
      b.n++; b.iv += interval; b.cpu += cpu;
      if (interval > b.ivMax) b.ivMax = interval;
      if (cpu > b.cpuMax) b.cpuMax = cpu;
      if (interval > 33.3) b.iv33++;
      if (interval > 50) b.iv50++;
      if (cpu > 16.7) b.cpu17++;
      if (cpu > 33.3) b.cpu33++;
      b.bins[binOf(cpu)]++;
      for (let i = 0; i < SECTIONS.length; i++) {
        const v = c[SECTIONS[i]];
        b.sum[i] += v;
        if (v > b.max[i]) b.max[i] = v;
      }
      b.soCalls += c.soCalls;
      if (z.ms > b.zMax) b.zMax = z.ms;
    }
    if (cpu > 33.3 || interval > 66.7) keepWorst(interval, time, cpu, c, z);
  }

  function keepWorst(interval, time, cpu, c, z) {
    const key = Math.max(cpu, interval / 2), list = run.worst;
    let slot = -1;
    if (list.length < CAP.worst) slot = list.length;
    else {
      let low = Infinity;
      for (let i = 0; i < list.length; i++) if (list[i].key < low) { low = list[i].key; slot = i; }
      if (key <= low) return;
    }
    let ctx = null;
    try { ctx = window.skyPerfTrace.context?.() || null; } catch {}
    const entry = {
      key, t: round(time), iv: round(interval), cpu: round(cpu), adv: round(c.adv), cam: round(c.cam), hv: round(c.hv),
      render: round(c.render), ai: round(c.ai), so: round(c.so), soCalls: c.soCalls, rest: round(cpu - c.adv - c.cam - c.hv - c.render),
      zMax: z.ms > 0 ? { ms: round(z.ms), x: round(z.x), y: round(z.y), z: round(z.z), act: z.act, fl: z.fl, st: z.st, dr: z.dr } : null,
      ctx: ctx && { p: ctx.p?.map(round), z: ctx.z, near: ctx.near, m: ctx.m },
    };
    list[slot] = entry;
  }

  function snapshot() {
    if (!run) return null;
    const buckets = run.buckets.map(b => ({
      start: b.start, n: b.n, iv: round(b.iv / b.n), ivMax: round(b.ivMax), cpu: round(b.cpu / b.n), cpuMax: round(b.cpuMax),
      iv33: b.iv33, iv50: b.iv50, cpu17: b.cpu17, cpu33: b.cpu33, bins: b.bins.slice(), soCalls: b.soCalls, zMax: round(b.zMax),
      s: Object.fromEntries(SECTIONS.map((name, i) => [name, [round(b.sum[i] / b.n), round(b.max[i])]])),
    }));
    const worst = run.worst.slice().sort((a, b) => b.key - a.key).map(({ key, ...rest }) => rest);
    return { schema: run.schema, timerMs: timerResolution(), buckets, worst, truncated: run.truncated };
  }

  window.skyPerfTrace = { on: true, t, add, frame, reset, snapshot, context: null, zombie };
})();
