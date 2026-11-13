// How close is the pursuit in real play? Nearest pursuer, pursuers within 10 m and pursuers in view, sampled every 0.25 s
// of game time into 10 s windows. It changes nothing in the game: the numbers ride along in diagnostics.performance.threat
// (through skyPerfTrace.snapshot), so they are sent only where the run record is sent and ?perf=0 turns them off too.
const game = window.__skyInternals, math = window.skyThreatMath;
if (game && math) {
  const trace = math.createTrace(), project = game.Geom?.Vector3 ? new game.Geom.Vector3() : null;
  const inView = e => {
    if (!project) return false;
    project.set(e.pos.x, e.pos.y + 1, e.pos.z).project(game.Se);
    if (!(project.z > -1 && project.z < 1 && Math.abs(project.x) < 1 && Math.abs(project.y) < 1)) return false;
    // In the frame is not enough: a pursuer behind a wall is not in view (the first day's numbers counted those as visible).
    const boxes = window.__game?.solids;
    return !(boxes && math.segmentBlocked(game.Se.position, { x: e.pos.x, y: e.pos.y + 1, z: e.pos.z }, boxes));
  };
  // ?threatHud=1 (dev only): the numbers that are recorded, shown live. Nothing is shown to normal players.
  const hud = new URLSearchParams(location.search).get('threatHud') === '1' ? Object.assign(document.createElement('div'), { id: 'threatHud' }) : null;
  if (hud) { hud.setAttribute('aria-hidden', 'true'); hud.style.cssText = 'position:fixed;left:10px;top:150px;z-index:9;padding:4px 8px;border-radius:6px;background:rgba(0,0,0,.55);color:#fff;font:12px/1.4 monospace;pointer-events:none'; document.body.appendChild(hud); }
  let next = 0, last = -1;
  function frame() {
    const t = game.z.t;
    if (t < last) { trace.reset(); next = 0; }     // a new run starts the clock again
    last = t;
    if (game.modeRef() === 'play' && !game.z.over && !window.skyPracticeMode && t >= next) {
      next = t + .25;
      const sample = math.sample({ x: game.c.pos.x, z: game.c.pos.z }, game.Jt, inView);
      trace.add(t, sample);
      if (hud) hud.textContent = `最寄り ${Number.isFinite(sample.nearest) ? sample.nearest.toFixed(1) : '-'} m / 10m以内 ${sample.within10} / 画面内 ${sample.visible}`;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  const perf = window.skyPerfTrace;
  try {
    if (perf && typeof perf.snapshot === 'function') {
      const original = perf.snapshot.bind(perf);
      perf.snapshot = () => { const s = original(); return s && typeof s === 'object' ? { ...s, threat: trace.snapshot() } : s; };
    }
  } catch {}
  window.skyThreatTrace = trace;
}
