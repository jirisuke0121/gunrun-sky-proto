// How close is the pursuit in real play? Nearest pursuer, pursuers within 10 m and pursuers in view, sampled every 0.25 s
// of game time into 10 s windows. It changes nothing in the game: the numbers ride along in diagnostics.performance.threat
// (through skyPerfTrace.snapshot), so they are sent only where the run record is sent and ?perf=0 turns them off too.
const game = window.__skyInternals, math = window.skyThreatMath;
if (game && math) {
  const trace = math.createTrace(), project = game.Geom?.Vector3 ? new game.Geom.Vector3() : null;
  const inView = e => {
    if (!project) return false;
    project.set(e.pos.x, e.pos.y + 1, e.pos.z).project(game.Se);
    return project.z > -1 && project.z < 1 && Math.abs(project.x) < 1 && Math.abs(project.y) < 1;
  };
  let next = 0, last = -1;
  function frame() {
    const t = game.z.t;
    if (t < last) { trace.reset(); next = 0; }     // a new run starts the clock again
    last = t;
    if (game.modeRef() === 'play' && !game.z.over && !window.skyPracticeMode && t >= next) {
      next = t + .25;
      trace.add(t, math.sample({ x: game.c.pos.x, z: game.c.pos.z }, game.Jt, inView));
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
