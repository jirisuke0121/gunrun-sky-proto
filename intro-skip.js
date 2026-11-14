// A skip button for the intro (practice) run: starts the real Easy run right away, exactly like the
// "本番イージーを始める" button on the intro result card. Shown only while an intro run is being played.
// It reuses that existing (already translated) label, so no new copy is needed. No score, rule or
// ranking behaviour changes: the intro run never counts, and the skipped-to run is an ordinary Easy run.
(() => {
  const tl = document.querySelector('#hud .hud-tl');
  if (!tl || document.getElementById('introSkip')) return;
  const $ = id => document.getElementById(id);
  const button = document.createElement('button');
  button.id = 'introSkip'; button.type = 'button'; button.hidden = true;
  button.textContent = '本番イージーを始める';
  tl.append(button);
  // Keep taps on the button from reaching the game's own pointer handlers (look / move / fire).
  for (const type of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'touchmove', 'mousedown', 'mouseup'])
    button.addEventListener(type, event => event.stopPropagation());
  const playingIntro = () => window.skyChallenge?.isIntroRun === true && window.__skyInternals?.modeRef?.() === 'play';
  const sync = () => { const show = playingIntro(); if (button.hidden === show) button.hidden = !show; };
  let busy = false;
  button.addEventListener('click', async () => {
    if (busy || !playingIntro()) return;
    busy = true;
    try {
      window.__game.setMode('menu'); await Promise.resolve();
      const custom = $('challengeCustom'); if (custom?.checked) custom.click();
      $('challengeDifficulty').value = 'easy'; $('challengeDifficulty').dispatchEvent(new Event('change'));
      $('bStart').click();
    } finally { busy = false; button.hidden = true; }
  });
  setInterval(sync, 400);
  window.skyIntroSkip = { button, sync };
})();
