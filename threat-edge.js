// Where is the pursuit coming from when it is not on screen? A thin edge on the left, right or bottom of the screen
// glows by how close the nearest pursuer on that side is. Pursuers ahead of the camera are already visible, so they
// draw nothing. It reads state only: scores, pursuit and input are untouched. Thin and dark red, so it cannot be
// mistaken for the full-screen red of a bite (#blood) and it avoids the yellow / orange used for markers.
const game = window.__skyInternals, math = window.skyThreatMath, hud = document.getElementById('hud');
if (game && math && hud) {
  const root = document.createElement('div'); root.id = 'threatEdge'; root.setAttribute('aria-hidden', 'true');
  root.innerHTML = '<i data-side="l"></i><i data-side="r"></i><i data-side="b"></i>';
  hud.prepend(root);
  const bars = { l: root.children[0], r: root.children[1], b: root.children[2] }, shown = { l: 0, r: 0, b: 0 };
  let lastTime = performance.now();
  function frame(now) {
    const dt = Math.min(.1, (now - lastTime) / 1000); lastTime = now;
    const on = game.modeRef() === 'play' && !game.z.over && !window.skyPracticeMode;
    const yaw = window.skyFollowCamera?.view?.yaw ?? game.c.yaw;
    const me = { x: game.c.pos.x, z: game.c.pos.z };
    // Somebody within 16 m (any direction): the three-step edges. Nobody: a faint thin marker for pursuers 16-35 m away.
    const isFar = on && math.sample(me, game.Jt).nearest >= math.RANGE;
    const target = !on ? { l: 0, r: 0, b: 0 } : isFar ? math.far(me, yaw, game.Jt) : math.edges(me, yaw, game.Jt);
    for (const side of ['l', 'r', 'b']) {
      // Rises in about 0.1 s, fades in about 0.5 s: a pursuer passing behind a wall does not make it flicker.
      const rate = target[side] > shown[side] ? 14 : 3.5;
      shown[side] += (target[side] - shown[side]) * Math.min(1, rate * dt);
      const v = shown[side] < .02 ? 0 : shown[side];
      const text = v ? v.toFixed(2) : '0';
      if (bars[side].dataset.v !== text) { bars[side].dataset.v = text; bars[side].style.opacity = String(Math.min(.9, v * 1.15)); }
      const tier = v && isFar ? 'far' : String(math.tier(v));
      if (bars[side].dataset.tier !== tier) bars[side].dataset.tier = tier;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.skyThreatEdge = { shown, math };
}
