// Pause screen: Resume / Restart / Title first, then the few settings a player actually needs.
// The ~70 tuning sliders stay available, folded under "くわしい調整".
// Only re-parents existing elements, so ids and listeners keep working.
(() => {
  const panel = document.getElementById('ovPause');
  const plate = panel?.querySelector('.plate');
  const grid = document.getElementById('setGrid');
  if (!plate || !grid || plate.dataset.pauseFocus) return;
  plate.dataset.pauseFocus = 'true';
  const $ = id => document.getElementById(id);
  const make = (tag, props = {}, html = '') => Object.assign(document.createElement(tag), props, html ? { innerHTML: html } : {});

  const keys = make('p', { className: 'note pauseKeys pauseKeysDesktop' },
    '<b>目的</b> 2分間ゾンビから逃げ切る　<b>操作</b> <span class="keysAfter"><kbd>W</kbd><kbd>S</kbd> 前後　<kbd>A</kbd><kbd>D</kbd> 曲がる　</span><span class="keysBefore"><kbd>W A S D</kbd> 移動　</span><kbd>Space</kbd> ジャンプ　<kbd>C</kbd> スライド　<kbd>クリック</kbd> ナイフ　<kbd>Q</kbd> フック　<kbd>E</kbd> 分身　<kbd>G</kbd> 閃光弾');
  const keysTouch = make('p', { className: 'note pauseKeys pauseKeysTouch' },
    '<b>目的</b> 2分間ゾンビから逃げ切る　左ドラッグで移動、右ドラッグで視点、「ジャンプ」で跳ぶ');

  const basic = make('section', { id: 'pauseBasic', className: 'setgrid', ariaLabel: 'かんたん設定' });
  basic.append(make('h4', {}, 'かんたん設定'));

  const advanced = make('details', { id: 'pauseAdvanced' });
  advanced.append(make('summary', {}, 'くわしい調整（ゲームの数値を細かく変えられます）'));
  const toolsRow = $('bReset')?.closest('.row');
  const copyArea = $('copyArea');
  const note = $('challengeSettingsNote');
  advanced.append(grid);
  // Players get "reset to defaults"; the raw-value copy tool is developer-only.
  const resetButton = $('bReset');
  if (toolsRow) advanced.append(toolsRow);
  if (copyArea) advanced.append(copyArea);
  advanced.hidden = !window.skyDevMode;

  // Keep the order: buttons row, keys, note, basic settings, advanced.
  const firstRow = plate.querySelector(':scope > .row');
  if (firstRow) firstRow.after(keys, keysTouch);
  if (note) note.after(basic); else keysTouch.after(basic);
  basic.after(advanced);

  // Player-facing settings. Others (zombie counts, gravity, score thresholds...) stay in "くわしい調整".
  const wanted = () => [
    document.querySelector('.follow-camera-settings'),
    $('s_sensitivity')?.closest('.sl'),
    $('s_volume')?.closest('.sl'),
    $('s_fov')?.closest('.sl'),
    $('s_renderScale')?.closest('.sl'),
    $('settingsRenderQuality')?.closest('.sky-quality-control') || $('settingsRenderQuality'),
    $('t_invertY')?.closest('label.tg'),
    $('t_aimAuto')?.closest('label.tg'),
    $('t_autoFire')?.closest('label.tg'),
    $('t_sendLog')?.closest('label.tg'),
  ].filter(Boolean);
  const adopt = () => {
    for (const el of wanted()) if (el.parentElement !== basic) basic.append(el);
    if (resetButton && resetButton.parentElement !== basic) basic.append(resetButton);
  };
  adopt();
  // Some of these are created later by other scripts (camera mode, render quality).
  new MutationObserver(adopt).observe(panel, { childList: true, subtree: true });
  document.body.dataset.skyPauseFocus = 'true';
})();
