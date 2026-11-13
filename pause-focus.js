// Settings / pause screen, laid out for a landscape frame: header buttons on top, then a tab list on the
// left (操作 / 画面・音 / ルール・記録) and one pane at a time on the right, so nothing needs scrolling.
// The ~70 raw tuning sliders stay in setGrid under a developer-only tab (?dev=1).
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
    '<b>目的</b> 2分間ゾンビから逃げ切る　<b>操作</b> <span class="keysAfter"><kbd>W</kbd><kbd>S</kbd> 前後　<kbd>A</kbd><kbd>D</kbd> 曲がる　</span><span class="keysBefore"><kbd>W A S D</kbd> 移動　</span><kbd>Space</kbd> ジャンプ　<kbd>C</kbd> スライド　<kbd>クリック</kbd> ナイフ　<kbd>Q</kbd> フック　<kbd>1</kbd> 閃光弾　<kbd>2</kbd> 分身');
  const keysTouch = make('p', { className: 'note pauseKeys pauseKeysTouch' },
    '<b>目的</b> 2分間ゾンビから逃げ切る　<span class="keysAfter">左スティックで移動（視点は自動）、</span><span class="keysBefore">左ドラッグで移動、右ドラッグで視点、</span>「ジャンプ」で跳ぶ');

  const note = $('challengeSettingsNote');
  const resetButton = $('bReset');
  const toolsRow = resetButton?.closest('.row');
  const copyArea = $('copyArea');
  const chooser = window.skyFollowCamera?.touchDevice ? window.skyControlStyle?.chooser({ compact: true }) : null; // PC: FPS only, nothing to choose

  // ---- Shell: tab list + panes ----
  const defs = [
    { id: 'controls', label: '操作' },
    { id: 'display', label: '画面・音' },
    { id: 'rules', label: 'ルール・記録' },
    { id: 'advanced', label: 'くわしい調整', dev: true },
  ].filter(def => !def.dev || window.skyDevMode);
  const shell = make('div', { id: 'pauseShell', className: 'ps-shell' });
  const tabs = make('div', { id: 'pauseTabs', className: 'ps-tabs', role: 'tablist' });
  tabs.setAttribute('aria-label', '設定の分類'); tabs.setAttribute('aria-orientation', 'vertical');
  const paneBox = make('div', { className: 'ps-panes' });
  const panes = {}, tabButtons = {};
  for (const def of defs) {
    const tab = make('button', { type: 'button', className: 'ps-tab', id: `pauseTab_${def.id}`, role: 'tab' }, def.label);
    tab.setAttribute('aria-controls', `pausePane_${def.id}`);
    const pane = make('section', { id: `pausePane_${def.id}`, className: 'ps-pane', role: 'tabpanel' });
    pane.setAttribute('aria-labelledby', tab.id);
    tab.addEventListener('click', () => show(def.id));
    tabs.append(tab); paneBox.append(pane); panes[def.id] = pane; tabButtons[def.id] = tab;
  }
  tabs.addEventListener('keydown', event => {
    if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const ids = defs.map(def => def.id);
    const at = ids.indexOf(document.activeElement?.id.replace('pauseTab_', ''));
    const next = ids[(at + (event.key === 'ArrowDown' ? 1 : ids.length - 1)) % ids.length];
    show(next); tabButtons[next].focus();
  });
  function show(id) {
    for (const def of defs) {
      const on = def.id === id;
      panes[def.id].hidden = !on;
      tabButtons[def.id].setAttribute('aria-selected', String(on));
      tabButtons[def.id].tabIndex = on ? 0 : -1;
    }
    paneBox.scrollTop = 0;
  }
  shell.append(tabs, paneBox);
  const anchor = $('pauseRunStatus') || plate.querySelector(':scope > .row');
  if (anchor) anchor.after(shell); else plate.prepend(shell);
  show('controls');

  // ---- Fill the panes. Several of these are created later by other scripts, so this re-runs on changes. ----
  const place = (pane, list) => {
    list.filter(Boolean).forEach((el, i) => { if (pane.children[i] !== el) pane.insertBefore(el, pane.children[i] || null); });
  };
  const adopt = () => {
    place(panes.controls, [
      chooser?.box,
      $('s_sensitivity')?.closest('.sl'),
      $('t_invertY')?.closest('label.tg'),
      $('t_aimAuto')?.closest('label.tg'),
      $('t_autoFire')?.closest('label.tg'),
      document.querySelector('.follow-camera-settings'), // the plain <select>; hidden by CSS, kept in sync by follow-camera.js
    ]);
    place(panes.display, [
      $('s_volume')?.closest('.sl'),
      $('s_fov')?.closest('.sl'),
      $('s_renderScale')?.closest('.sl'),
      $('settingsRenderQuality')?.closest('.sky-quality-control') || $('settingsRenderQuality'),
      $('skyMapControls'),
    ]);
    place(panes.rules, [
      keys, keysTouch, note, $('ghostBest'), $('unityScorePause'),
      $('t_sendLog')?.closest('label.tg'),
      resetButton,
    ]);
    if (panes.advanced) place(panes.advanced, [grid, toolsRow && toolsRow !== resetButton ? toolsRow : null, copyArea]);
    else if (grid.parentElement !== plate) plate.append(grid); // keep setGrid in the page, hidden, for the scripts that read it
  };
  adopt();
  new MutationObserver(adopt).observe(panel, { childList: true, subtree: true });
  if (!panes.advanced) { grid.hidden = true; if (toolsRow) toolsRow.hidden = true; if (copyArea) copyArea.hidden = true; }
  document.body.dataset.skyPauseFocus = 'true';
})();
