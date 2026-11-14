// Auto-fire is always on. 2026-11-14: the stop/resume toggle (button, X key, pause-menu checkbox) was removed everywhere, in normal play and in the
// 入門 / practice course alike, because a first-time PC playtest found it confusing. The player's aim stays free for manual headshots.
// #tAutoFire stays in the markup (hidden) because player-clarity.js hangs the gun-state readout on it.
const game = window.__skyInternals;
const { U, Et } = game;
const button = document.getElementById('tAutoFire');
document.body.classList.add('autofire-mark');
const migration = 'gunrun-auto-fire-default-20261030';
game.Jn.autoFire = true;
// Clear any value saved by an older version that allowed stopping.
if (U.autoFire === false) { U.autoFire = true; try { game.Ua(); } catch {} }
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
game.Jn.aimAuto = true;
button.hidden = true;
