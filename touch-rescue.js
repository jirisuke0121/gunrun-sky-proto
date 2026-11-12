// A press on a touch button that the browser hands to the canvas instead of the button.
// Play records (2026-11-08..11, iPhone Safari) show bursts of taps at the exact centre of the jump button arriving
// as canvas taps with no jump recorded: 68 lost jump presses in 3 runs, each run ending caught shortly after
// (docs/HITCHES_2026-11-12.md). The cause on the device is not known. Whatever it is, a touch that starts inside a
// visible, enabled button is that button's press, so it is forwarded to the button and never treated as camera/hook.
// In a browser that delivers the press to the button (the normal case) the canvas never sees it and nothing here runs.
(() => {
  const IDS = ['tJump', 'tSlide'];
  const held = new Map();
  const stats = { rescued: 0, byButton: {} };
  function usable(button) {
    if (!button || button.hidden || button.disabled || !button.getClientRects().length) return false;
    const style = getComputedStyle(button);
    return style.visibility !== 'hidden' && style.pointerEvents !== 'none' && style.display !== 'none';
  }
  // The buttons are round: only the drawn circle counts, so the corners keep working as camera drag.
  function buttonAt(x, y) {
    for (const id of IDS) {
      const button = document.getElementById(id);
      if (!usable(button)) continue;
      const r = button.getBoundingClientRect();
      if (Math.hypot(x - (r.left + r.right) / 2, y - (r.top + r.bottom) / 2) <= Math.min(r.width, r.height) / 2) return button;
    }
    return null;
  }
  const forward = (button, type, event) => button.dispatchEvent(new PointerEvent(type, {
    pointerId: event.pointerId, pointerType: event.pointerType, isPrimary: event.isPrimary,
    clientX: event.clientX, clientY: event.clientY, button: 0, buttons: type === 'pointerdown' ? 1 : 0,
    bubbles: false, cancelable: true }));
  window.skyTouchRescue = {
    stats,
    // Called by the canvas for every touch that starts on it during play. True: the press belonged to a button.
    down(event) {
      if (event.pointerType !== 'touch') return false;
      const button = buttonAt(event.clientX, event.clientY);
      if (!button) return false;
      event.preventDefault();
      held.set(event.pointerId, button);
      stats.rescued++; stats.byButton[button.id] = (stats.byButton[button.id] || 0) + 1;
      forward(button, 'pointerdown', event);
      return true;
    },
    // Called by the canvas when a touch ends or is cancelled.
    up(event) {
      const button = held.get(event.pointerId);
      if (!button) return false;
      held.delete(event.pointerId);
      forward(button, event.type === 'pointercancel' ? 'pointercancel' : 'pointerup', event);
      return true;
    },
    reset() { held.clear(); },
  };
})();
