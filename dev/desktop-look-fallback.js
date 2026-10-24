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
    game.c.yaw -= (event.clientX - lastX) * sensitivity;
    game.c.pitch = Math.max(-1.5, Math.min(1.5,
      game.c.pitch - (event.clientY - lastY) * sensitivity * (game.U.invertY ? -1 : 1)));
    lastX = event.clientX;
    lastY = event.clientY;
    event.stopImmediatePropagation();
  }, true);

  const stopDragging = event => { if (event.button === 2) dragging = false; };
  window.addEventListener("mouseup", stopDragging, true);
  window.addEventListener("blur", () => { dragging = false; });
  document.addEventListener("pointerlockchange", () => {
    if (document.pointerLockElement === canvas) dragging = false;
  });

  // The bundled game only shows this hint after an explicit pointer lock error.
  // Some embedded browsers simply never grant the lock or report an error.
  setInterval(() => { note.hidden = !unlockedPlay(); }, 250);
});
