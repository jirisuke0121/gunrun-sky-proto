// Skills share a bottom-centre dock on keyboard and touch layouts.
export const FLASH_ICON = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="m18 2-12 16h9l-1 12 12-17h-9z"/></svg>';
const DECOY_ICON = '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M5 26v-7a7 7 0 0 1 14 0v7M23 5a4 4 0 0 1 0 8m1 3a7 7 0 0 1 4 6v4"/></svg>';

export function installSkillDock() {
  const dock = document.createElement('div');
  dock.id = 'skillDock'; dock.setAttribute('role', 'group'); dock.setAttribute('aria-label', 'プレイヤースキル');
  const flash = document.getElementById('tFlash');
  flash.classList.add('player-skill');
  const decoy = document.createElement('button'); decoy.type = 'button'; decoy.id = 'tDecoy'; decoy.className = 'player-skill';
  decoy.innerHTML = `${DECOY_ICON}<span class="skill-value">E</span><span class="skill-name">分身</span>`;
  dock.append(flash, decoy); document.getElementById('hud').append(dock);
  // Keep skill presses out of the stick, camera and firing input handlers.
  for (const type of ['pointerdown', 'pointerup', 'pointermove', 'click', 'contextmenu']) dock.addEventListener(type, e => e.stopPropagation());
  return { dock, flash, decoy };
}

export function bindSkillPress(button, canUse, activate) {
  let press = null;
  const inside = e => { const r = button.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; };
  function cancel() {
    const id = press?.id; press = null; button.classList.remove('armed');
    if (id !== undefined && button.hasPointerCapture(id)) button.releasePointerCapture(id);
  }
  button.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    if (press || e.button !== 0 || !canUse()) return;
    press = { id: e.pointerId, x: e.clientX, y: e.clientY };
    button.setPointerCapture(e.pointerId); button.classList.add('armed');
  });
  button.addEventListener('pointermove', e => {
    if (press?.id === e.pointerId && (!inside(e) || Math.hypot(e.clientX - press.x, e.clientY - press.y) > 14)) cancel();
  });
  button.addEventListener('pointerup', e => {
    e.preventDefault(); e.stopPropagation();
    if (press?.id !== e.pointerId) return;
    const confirmed = inside(e) && Math.hypot(e.clientX - press.x, e.clientY - press.y) <= 14;
    cancel(); if (confirmed && canUse()) activate();
  });
  for (const type of ['pointercancel', 'lostpointercapture']) button.addEventListener(type, cancel);
  button.addEventListener('click', e => { if (e.detail === 0 && canUse()) { e.preventDefault(); activate(); } });
  button.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('blur', cancel); window.addEventListener('resize', cancel);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
  return cancel;
}
