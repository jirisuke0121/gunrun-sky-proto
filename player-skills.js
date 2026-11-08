// Skills share a bottom-centre dock on keyboard and touch layouts.
export const FLASH_ICON = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="m18 2-12 16h9l-1 12 12-17h-9z"/></svg>';
const DECOY_ICON = '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M5 26v-7a7 7 0 0 1 14 0v7M23 5a4 4 0 0 1 0 8m1 3a7 7 0 0 1 4 6v4"/></svg>';

export function installSkillDock() {
  const dock = document.createElement('div');
  dock.id = 'skillDock'; dock.setAttribute('role', 'group'); dock.setAttribute('aria-label', 'プレイヤースキル');
  const flash = document.getElementById('tFlash');
  flash.classList.add('player-skill');
  const decoy = document.createElement('button'); decoy.type = 'button'; decoy.id = 'tDecoy'; decoy.className = 'player-skill';
  decoy.innerHTML = `${DECOY_ICON}<span class="skill-value">✓</span><span class="skill-name">分身 <kbd>2</kbd></span>`;
  dock.append(flash, decoy); document.getElementById('hud').append(dock);
  // Keep skill presses out of the stick, camera and firing input handlers.
  for (const type of ['pointerdown', 'pointerup', 'pointermove', 'click', 'contextmenu']) dock.addEventListener(type, e => e.stopPropagation());
  return { dock, flash, decoy };
}

// A press is confirmed when the finger lifts on the button or within this margin around it.
// The old rule (cancel after 14px of drift, lift strictly inside the circle) silently dropped taps made
// while running, so now only sliding clearly off the button cancels. player-skills.css enlarges the
// touch target by the same idea.
export const SKILL_TOUCH_SLOP = 14;

export function bindSkillPress(button, canUse, activate, unavailable = () => {}) {
  let press = null;
  const inside = e => {
    const r = button.getBoundingClientRect(), s = SKILL_TOUCH_SLOP;
    return e.clientX >= r.left - s && e.clientX <= r.right + s && e.clientY >= r.top - s && e.clientY <= r.bottom + s;
  };
  function cancel() {
    const id = press?.id; press = null; button.classList.remove('armed');
    if (id !== undefined && button.hasPointerCapture(id)) button.releasePointerCapture(id);
  }
  button.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    if (press || e.button !== 0) return;
    if (!canUse()) { unavailable(); return; }
    press = { id: e.pointerId };
    button.setPointerCapture(e.pointerId); button.classList.add('armed');
  });
  button.addEventListener('pointermove', e => {
    if (press?.id === e.pointerId && !inside(e)) cancel();
  });
  button.addEventListener('pointerup', e => {
    e.preventDefault(); e.stopPropagation();
    if (press?.id !== e.pointerId) return;
    const confirmed = inside(e);
    cancel(); if (confirmed) { if (canUse()) activate(); else unavailable(); }
  });
  for (const type of ['pointercancel', 'lostpointercapture']) button.addEventListener(type, cancel);
  button.addEventListener('click', e => { if (e.detail === 0) { e.preventDefault(); if (canUse()) activate(); else unavailable(); } });
  button.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('blur', cancel); window.addEventListener('resize', cancel);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
  return cancel;
}
