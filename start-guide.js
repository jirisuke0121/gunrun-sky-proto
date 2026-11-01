// First seconds of a run: say the goal and the basic controls, for the first few runs only.
// Read-only toward the game: it only watches the run clock and mode.
(() => {
  const SHOW_RUNS = 3, SHOW_SECONDS = 7;
  const KEY = 'sky.startGuideRuns';
  const read = () => { try { return Number(localStorage.getItem(KEY)) || 0; } catch { return 0; } };
  const write = n => { try { localStorage.setItem(KEY, String(n)); } catch { /* storage may be unavailable */ } };
  const card = document.createElement('div');
  card.id = 'startGuide';
  card.hidden = true;
  card.setAttribute('role', 'status');
  card.innerHTML = '<p class="sgGoal">2分間、ゾンビから逃げ切れ</p>' +
    '<p class="sgKeys sgDesktop"><kbd>W A S D</kbd> 移動　<kbd>Space</kbd> ジャンプ　<kbd>マウス</kbd> 視点</p>' +
    '<p class="sgKeys sgTouch">左ドラッグ 移動　右ドラッグ 視点　「ジャンプ」で跳ぶ</p>' +
    '<p class="sgTip">隙間や段差を跳んで、ゾンビを引き離そう</p>';
  (document.getElementById('hud') || document.body).append(card);

  let lastMode = '', lastT = Infinity, shownAt = 0;
  const hide = () => { card.hidden = true; shownAt = 0; };
  const tick = () => {
    const game = window.__skyInternals;
    if (!game) return;
    const mode = game.modeRef(), t = Number(game.z?.t) || 0;
    const started = mode === 'play' && (lastMode !== 'play' && t < 1.5 || t < lastT - 0.5);
    if (started && !window.skyPracticeMode && !game.z?.mission && read() < SHOW_RUNS) {
      write(read() + 1);
      card.hidden = false;
      shownAt = performance.now();
    }
    if (!card.hidden && (mode !== 'play' || performance.now() - shownAt > SHOW_SECONDS * 1000)) hide();
    lastMode = mode; lastT = t;
  };
  setInterval(tick, 200);
  document.body.dataset.skyStartGuide = 'true';
})();
