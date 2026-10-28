// Mouse look for browsers that cannot grant pointer lock (including embedded previews).
window.addEventListener("load", () => {
  const game = window.__skyInternals;
  const canvas = document.getElementById("c");
  const note = document.getElementById("lookNote");
  if (!game || !canvas || !note) return;

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  const unlockedPlay = () => game.modeRef() === "play" && document.pointerLockElement !== canvas;

  canvas.addEventListener("mousedown", event => {
    if (event.button !== 2 || !unlockedPlay()) return;
    dragging = true;
    window.skyFollowCamera?.holdLook(true);
    lastX = event.clientX;
    lastY = event.clientY;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  window.addEventListener("mousemove", event => {
    if (!dragging) return;
    if (!unlockedPlay()) {
      dragging = false;
      return;
    }
    const sensitivity = 0.0022 * game.U.sensitivity;
    const yaw = (event.clientX - lastX) * sensitivity;
    const pitch = (event.clientY - lastY) * sensitivity * (game.U.invertY ? -1 : 1);
    if (!window.skyFollowCamera?.look(yaw, pitch)) {
      game.c.yaw -= yaw;
      game.c.pitch = Math.max(-1.5, Math.min(1.5, game.c.pitch - pitch));
    }
    lastX = event.clientX;
    lastY = event.clientY;
    event.stopImmediatePropagation();
  }, true);

  const stopDragging = event => { if (event.button === 2) { dragging = false; window.skyFollowCamera?.holdLook(false); } };
  window.addEventListener("mouseup", stopDragging, true);
  window.addEventListener("blur", () => { dragging = false; window.skyFollowCamera?.holdLook(false); });
  document.addEventListener("pointerlockchange", () => {
    if (document.pointerLockElement === canvas) dragging = false;
  });

  // The bundled game only shows this hint after an explicit pointer lock error.
  // Some embedded browsers simply never grant the lock or report an error.
  setInterval(() => { note.hidden = !unlockedPlay(); }, 250);
});
