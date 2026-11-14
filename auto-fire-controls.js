// One combat control: keep firing at nearby enemies, or save ammunition.
const game = window.__skyInternals;
const { U, Et } = game;
const button = document.getElementById('tAutoFire');
// Normal play shows the control as a mark only; the explanation (words + state) belongs to the 入門 / practice screens.
const markOnly = true;
// 2026-11-14: nobody can stop automatic fire any more, in normal play and in the 入門 / practice course alike. A first-time PC playtest found the
// stop mark and X key confusing, so every run fires automatically (the player's aim stays free for manual headshots).
const canStop = false;
document.body.classList.toggle('autofire-mark', markOnly);
const MARK = '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="8"/><path d="M16 3v6M16 23v6M3 16h6M23 16h6"/></svg>';
const MARK_OFF = '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="8"/><path d="M16 3v6M16 23v6M3 16h6M23 16h6"/><path class="slash" d="M6 26 26 6"/></svg>';
const migration = 'gunrun-auto-fire-default-20261030';
game.Jn.autoFire = true;
if (!canStop && U.autoFire === false) { U.autoFire = true; try { game.Ua(); } catch {} }
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
  if (!canStop) enabled = true;
  U.autoFire = !!enabled;
  if (enabled) U.aimAuto = true;
  else cancelPendingShot();
  if (!window.skyPracticeMode) game.Ua();
  game.nl();
  sync();
}
function toggle() {
  if (!canStop) return;
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
  if (!canStop || event.code !== 'KeyX' || event.repeat || event.ctrlKey || event.metaKey || event.altKey ||
      event.target.closest?.('input,select,textarea,[contenteditable="true"]')) return;
  if (game.modeRef() === 'play') { event.preventDefault(); toggle(); }
});
const setting = document.getElementById('t_autoFire');
setting.addEventListener('change', () => setEnabled(setting.checked));
let lastState = '';
function sync() {
  const playing = game.modeRef() === 'play' && !game.z.over;
  const jump = !!game.wpc().jumpGun;
  const visible = playing && U.gunOn && !jump && canStop;
  button.hidden = !visible;
  const state = `${visible}:${U.autoFire}:${U.aimAuto}`;
  if (state !== lastState) {
    const label = U.autoFire ? '自動射撃を停止' : '自動射撃を再開';
    button.innerHTML = markOnly
      ? `${U.autoFire ? MARK : MARK_OFF}<kbd>X</kbd>`
      : `<span>${label} <kbd>X</kbd></span><small>${U.autoFire ? U.aimAuto ? '照準・射撃は自動' : '照準は手動・射撃は自動' : '停止中・弾を温存'}</small>`;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(!!U.autoFire));
    button.setAttribute('aria-keyshortcuts','X');
    button.classList.toggle('is-stopped', !U.autoFire);
    lastState = state;
    window.skyPlayerClarity?.render();
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
