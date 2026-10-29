// One combat control: keep firing at nearby enemies, or save ammunition.
const game = window.__skyInternals;
const { U, Et } = game;
const button = document.getElementById('tAutoFire');
const migration = 'gunrun-auto-fire-default-20261030';
game.Jn.autoFire = true;
game.Jn.aimAuto = true;
if (!window.skyPracticeMode) {
  try {
    if (!localStorage.getItem(migration)) {
      U.autoFire = true;
      U.aimAuto = true;
      game.Ua();
      localStorage.setItem(migration, '1');
    }
  } catch {
    U.autoFire = true;
    U.aimAuto = true;
  }
}

function cancelPendingShot() {
  Et.trigger = 0;
  Et.held = false;
  // Releasing a charged weapon fires it; stopping must discard that charge.
  window.__easyWeaponPort?.cancelTrigger?.();
}
function setEnabled(enabled) {
  U.autoFire = !!enabled;
  if (enabled) U.aimAuto = true;
  else cancelPendingShot();
  if (!window.skyPracticeMode) game.Ua();
  game.nl();
  sync();
}
function toggle() {
  if (game.modeRef() !== 'play' || game.z.over || !U.gunOn || game.wpc().jumpGun) return;
  setEnabled(!U.autoFire);
}
button.addEventListener('pointerdown', event => event.stopPropagation());
button.addEventListener('click', event => {
  event.preventDefault();
  event.stopPropagation();
  toggle();
});
addEventListener('keydown', event => {
  if (event.code !== 'KeyX' || event.repeat || event.ctrlKey || event.metaKey || event.altKey ||
      event.target.closest?.('input,select,textarea,[contenteditable="true"]')) return;
  if (game.modeRef() === 'play') { event.preventDefault(); toggle(); }
});
const setting = document.getElementById('t_autoFire');
setting.addEventListener('change', () => setEnabled(setting.checked));
let lastState = '';
function sync() {
  const playing = game.modeRef() === 'play' && !game.z.over;
  const jump = !!game.wpc().jumpGun;
  const visible = playing && U.gunOn && !jump;
  button.hidden = !visible;
  const state = `${visible}:${U.autoFire}`;
  if (state !== lastState) {
    const label = U.autoFire ? '自動射撃を停止' : '自動射撃を再開';
    button.innerHTML = `<span>${label}</span><small>${U.autoFire ? '自動射撃中' : '停止中・弾を温存'} <kbd>X</kbd></small>`;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(!!U.autoFire));
    button.classList.toggle('is-stopped', !U.autoFire);
    lastState = state;
  }
}
let wasEnabled = !!U.autoFire;
function frame() {
  if (wasEnabled && !U.autoFire) cancelPendingShot();
  wasEnabled = !!U.autoFire;
  sync();
  requestAnimationFrame(frame);
}
window.skyAutoFire = { setEnabled, toggle };
sync();
requestAnimationFrame(frame);
