// Where is the pursuit coming from when it is not on screen? A thin edge on the left, right or bottom of the screen
// glows by how close the nearest pursuer on that side is. Pursuers ahead of the camera are already visible, so they
// draw nothing. It reads state only: scores, pursuit and input are untouched. Thin and dark red, so it cannot be
// mistaken for the full-screen red of a bite (#blood) and it avoids the yellow / orange used for markers.
const game = window.__skyInternals, math = window.skyThreatMath, hud = document.getElementById('hud');
if (game && math && hud) {
  const root = document.createElement('div'); root.id = 'threatEdge'; root.setAttribute('aria-hidden', 'true');
  root.innerHTML = '<i data-side="l"></i><i data-side="r"></i><i data-side="b"></i><i data-side="t"></i>';
  hud.prepend(root);
  const bars = { l: root.children[0], r: root.children[1], b: root.children[2], t: root.children[3] }, shown = { l: 0, r: 0, b: 0, t: 0 };
  // A pursuer ahead is on screen unless a wall or floor hides it: then the top edge speaks for it. The line from the camera to its
  // chest is tested against the game's slabs and monoliths, at most 10 times a second.
  const hidden = e => { const o = game.Se.position, boxes = window.__game?.solids; return !!boxes && math.segmentBlocked(o, { x: e.pos.x, y: e.pos.y + 1, z: e.pos.z }, boxes); };
  let lastTime = performance.now(), target = { l: 0, r: 0, b: 0, t: 0 }, isFar = false, nextCalc = 0;
  function frame(now) {
    const dt = Math.min(.1, (now - lastTime) / 1000); lastTime = now;
    const on = game.modeRef() === 'play' && !game.z.over && !window.skyPracticeMode;
    const yaw = window.skyFollowCamera?.view?.yaw ?? game.c.yaw;
    if (!on) { target = { l: 0, r: 0, b: 0, t: 0 }; isFar = false; }
    else if (now >= nextCalc) {
      nextCalc = now + 100;
      const me = { x: game.c.pos.x, z: game.c.pos.z };
      // Somebody within 16 m (any direction): the three-step edges. Nobody: a faint thin marker for pursuers 16-35 m away.
      isFar = math.sample(me, game.Jt).nearest >= math.RANGE;
      target = isFar ? math.far(me, yaw, game.Jt, math.RANGE, math.FAR, hidden) : math.edges(me, yaw, game.Jt, math.RANGE, hidden);
    }
    for (const side of ['l', 'r', 'b', 't']) {
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
