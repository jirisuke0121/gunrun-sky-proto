// Look control for the desktop cases that pointer lock does not cover:
//  - the control trial in the intro (pointer lock is off on purpose so the choice buttons stay clickable),
//  - browsers that cannot grant pointer lock (embedded previews).
// Dragging looks around; the right button always works, and during the trial the left button does too
// (a MacBook trackpad cannot hold a right-drag comfortably, but click-and-drag works everywhere).
// Two-finger scrolling (wheel events) also turns the camera: a trackpad produces no mousemove for it.
window.addEventListener("load", () => {
  const game = window.__skyInternals;
  const canvas = document.getElementById("c");
  const note = document.getElementById("lookNote");
  if (!game || !canvas || !note) return;

  let dragging = false;
  let dragButton = -1;
  let lastX = 0;
  let lastY = 0;
  const unlockedPlay = () => game.modeRef() === "play" && document.pointerLockElement !== canvas;
  // Same condition the game uses to skip requestPointerLock (see el() in index.html / canyon.html).
  const inTrial = () => !!window.skyGuidedMode && window.skyGuidedIntro?.trial !== false;

  // yaw/pitch are mouse-style deltas: positive = turn right / look down, before sensitivity.
  function applyLook(dx, dy) {
    const sensitivity = 0.0022 * game.U.sensitivity;
    const yaw = dx * sensitivity;
    const pitch = dy * sensitivity * (game.U.invertY ? -1 : 1);
    if (!window.skyFollowCamera?.look(yaw, pitch)) {
      // FPS base look gain matches the native mouse/touch handler.
      game.c.yaw -= yaw * 1.5;
      game.c.pitch = Math.max(-1.5, Math.min(1.5, game.c.pitch - pitch * 1.5));
    }
  }

  canvas.addEventListener("mousedown", event => {
    if (!unlockedPlay()) return;
    if (event.button !== 2 && !(event.button === 0 && inTrial())) return;
    dragging = true;
    dragButton = event.button;
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
    applyLook(event.clientX - lastX, event.clientY - lastY);
    lastX = event.clientX;
    lastY = event.clientY;
    event.stopImmediatePropagation();
  }, true);

  const stopDragging = () => { dragging = false; dragButton = -1; window.skyFollowCamera?.holdLook(false); };
  window.addEventListener("mouseup", event => { if (dragging && event.button === dragButton) stopDragging(); }, true);
  window.addEventListener("blur", stopDragging);
  document.addEventListener("pointerlockchange", () => {
    if (document.pointerLockElement === canvas) dragging = false;
  });

  // Two-finger scroll / swipe on a trackpad (also a Magic Mouse). Works with or without pointer lock.
  // Pinch (ctrlKey) stays with the browser. Handling the event also stops the browser's
  // two-finger back/forward swipe from leaving the game.
  const WHEEL_GAIN = 0.6;   // scroll pixels are cheaper than mouse pixels: keep the turn rate near a mouse's
  const WHEEL_CAP = 60;     // one event never turns more than this, so a notched mouse wheel only nudges
  window.addEventListener("wheel", event => {
    if (event.ctrlKey || game.modeRef() !== "play") return;
    if (event.target !== canvas && document.pointerLockElement !== canvas) return;
    // Natural scrolling (the macOS default) reports the content direction, so a swipe to the right
    // arrives as a negative deltaX. Flip it so the camera follows the fingers like the mouse does.
    const direction = event.webkitDirectionInvertedFromDevice === false ? 1 : -1;
    const unit = event.deltaMode === 0 ? 1 : 16; // line-based wheels (Firefox) report lines, not pixels
    const clamp = value => Math.max(-WHEEL_CAP, Math.min(WHEEL_CAP, value));
    applyLook(clamp(event.deltaX * unit) * direction * WHEEL_GAIN, clamp(event.deltaY * unit) * direction * WHEEL_GAIN);
    event.preventDefault();
  }, { passive: false, capture: true });

  // The bundled game only shows this hint after an explicit pointer lock error.
  // Some embedded browsers simply never grant the lock or report an error.
  setInterval(() => { note.hidden = !unlockedPlay() || window.skyFollowCamera?.manualLook === false; }, 250);
});
