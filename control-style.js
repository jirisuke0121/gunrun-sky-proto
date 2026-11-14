// Control type chooser: two cards side by side so the difference is visible at a glance.
//   FPS操作（従来）      : left stick moves, the right side is dragged to turn the camera yourself.
//   かんたん操作（カメラおまかせ）: the stick selects movement; the camera follows that direction.
// Shown in two places: a popup when the intro run starts on a touch device, and the 操作 tab of the
// settings screen (pause-focus.js). It only switches window.skyFollowCamera's existing two modes
// ('before' = FPS操作, 'after' = かんたん操作); movement and camera code are untouched.
// Also keeps #app's data-fit up to date: every screen is designed for a landscape frame, and when a
// phone is held upright the whole app is rotated (see the inline script in index.html), so CSS
// media queries would see the wrong (physical) height. data-fit reflects the frame the player sees.
(() => {
  const fc = window.skyFollowCamera;
  if (!fc || window.skyControlStyle) return;
  const params = new URLSearchParams(location.search);
  const $ = id => document.getElementById(id);
  const app = $('app');
  const touch = fc.touchDevice;
  const make = (tag, props = {}, html = '') => Object.assign(document.createElement(tag), props, html ? { innerHTML: html } : {});
  const scene = location.pathname.endsWith('canyon.html') ? 'canyon' : 'old-town';

  // ---- Logical frame size: roomy (> 520px tall) / normal / tight (< 360px tall) ----
  if (app && 'ResizeObserver' in window) {
    const fit = () => {
      const h = app.clientHeight, w = app.clientWidth;
      app.dataset.fit = h < 360 ? 'tight' : h <= 520 ? 'normal' : 'roomy';
      app.dataset.fitW = w < 640 ? 'narrow' : 'wide';
    };
    new ResizeObserver(fit).observe(app); fit();
  }

  // ---- Card content ----
  const ICON = {
    stick: '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="21" fill="none" stroke="currentColor" stroke-width="3" opacity=".65"/><circle cx="32" cy="32" r="9" fill="currentColor"/><path d="M32 3l6 8H26zM32 61l6-8H26zM3 32l8-6v12zM61 32l-8-6v12z" fill="currentColor" opacity=".85"/></svg>',
    drag: '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="8" fill="currentColor"/><path d="M6 32h16m-6-6l-6 6 6 6M58 32H42m6-6l6 6-6 6M32 6v14m-6-6l6-6 6 6M32 58V44m-6 6l6 6 6-6" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    auto: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 33c6-11 14-16 24-16s18 5 24 16c-6 11-14 16-24 16S14 44 8 33z" fill="none" stroke="currentColor" stroke-width="3.5"/><circle cx="32" cy="33" r="8" fill="currentColor"/><path d="M48 8a28 28 0 0 1 12 14m-5-1l5 1 1-6M16 56A28 28 0 0 1 4 42m5 1l-5-1-1 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    mouse: '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="19" y="6" width="26" height="46" rx="13" fill="none" stroke="currentColor" stroke-width="3.5"/><path d="M32 6v18M19 24h26" fill="none" stroke="currentColor" stroke-width="3"/><path d="M6 36h8m-3-4l-3 4 3 4M58 36h-8m3-4l3 4-3 4" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };
  const keys = list => `<span class="cs-keys">${list.map(k => `<kbd>${k}</kbd>`).join('')}</span>`;
  const moveGesture = '<svg class="cs-move-gesture" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="41" r="18" fill="none" stroke="currentColor" stroke-width="2" opacity=".55"/><path d="M32 34V8m-7 7 7-7 7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle class="cs-thumb" cx="32" cy="43" r="8" fill="currentColor"/></svg>';
  const TYPES = touch ? {
    before: {
      name: 'FPS操作', tag: 'カメラを自分で操作', look: '右側に指を置き、動かして見回す',
      move: `${moveGesture}<b>押したまま移動</b>`, view: `${ICON.drag}<b>指で見回す</b>`, auto: false,
    },
    after: {
      name: params.get('cameraTrial') === 'fixed' ? '固定カメラ（試作）' : 'かんたん操作', tag: params.get('cameraTrial') === 'fixed' ? 'スティックだけ' : 'カメラおまかせ', look: params.get('cameraTrial') === 'fixed' ? '向きは固定・位置だけ追従。右側の視点操作はなし' : params.get('cameraTrial') === 'follow-legacy' ? '進む向きへ自動で回る。右側で見回しもできる' : '進む向きへ自動で追従します。視点操作はありません',
      move: `${moveGesture}<b>押したまま移動</b>`, view: `${ICON.auto}<b>${params.get('cameraTrial') === 'fixed' ? '向き固定' : 'カメラ自動'}</b>`, auto: true,
    },
  } : {
    before: {
      name: 'マウス視点', tag: '従来どおり', look: 'マウスを動かして自分で回す', who: 'FPS・3Dゲームに慣れている人',
      move: `${keys(['W', 'A', 'S', 'D'])}<b>移動</b>`, view: `${ICON.mouse}<b>視点を回す</b>`, auto: false,
    },
    after: {
      name: params.get('cameraTrial') === 'fixed' ? '固定カメラ（試作）' : '自動カメラ', tag: params.get('cameraTrial') === 'fixed' ? 'スティックだけ' : 'FPS未経験の方に', look: params.get('cameraTrial') === 'fixed' ? '向きは固定・位置だけ追従。視点操作はなし' : 'A/Dで曲がると、カメラが自動でついてくる', who: 'はじめて・視点操作が苦手な人',
      move: params.get('cameraTrial') === 'fixed' ? `${keys(['W','A','S','D'])}<b>移動</b>` : `${keys(['W', 'S'])}<b>前後</b>${keys(['A', 'D'])}<b>旋回</b>`, view: `${ICON.auto}<b>${params.get('cameraTrial') === 'fixed' ? '向き固定' : '自動'}</b>`, auto: true,
    },
  };

  if(params.get('cameraTrial')==='hybrid')Object.assign(TYPES.after,{
    name:'区間カメラ（試作）',tag:'見通しを自動で補助',look:params.get('cameraControl')==='legacy'?'普段は固定。見通しが悪い区間だけ向きを変えます。移動中の方向はそのまま':'画面の方向へ移動。移動中は方角を保ち、十分に止まってから見通しを調整します',
    move:touch?`${moveGesture}<b>押したまま移動</b>`:`${keys(['W','A','S','D'])}<b>移動</b>`,view:`${ICON.auto}<b>${params.get('cameraControl')==='legacy'?'区間に合わせる':'停止後に調整'}</b>`,
  });

  function card(mode, compact) {
    const t = TYPES[mode];
    const el = make('button', { type: 'button', className: 'cs-card', role: 'radio' });
    el.dataset.mode = mode; el.setAttribute('aria-checked', 'false');
    el.innerHTML = `<span class="cs-head"><b class="cs-name">${t.name}</b><small class="cs-tag">${t.tag}</small><em class="cs-on">選択中</em></span>
      <span class="cs-screen${t.auto ? ' is-auto' : ''}" aria-hidden="true">
        <span class="cs-zone cs-move">${t.move}</span>
        <span class="cs-zone cs-view">${t.view}</span>
        ${touch ? '<span class="cs-jump">ジャンプ</span>' : ''}
      </span>
      <span class="cs-fact cs-fact-key"><b>視点</b><span>${t.look}</span></span>
      ${compact || touch ? '' : `<span class="cs-fact"><b>向いている人</b><span>${t.who}</span></span>`}`;
    return el;
  }

  const live = [];
  const cardName = mode => TYPES[mode].name;
  function chooser({ compact = false, onPick } = {}) {
    const box = make('div', { className: 'cs-chooser' + (compact ? ' is-compact' : ''), role: 'radiogroup' });
    box.setAttribute('aria-label', '操作タイプ');
    box.style.setProperty('--cs-scene', `url('./assets/lobby/${scene}.svg')`);
    const cards = ['before', 'after'].map(mode => card(mode, compact));
    box.append(...cards);
    if (touch) {
      box.append(make('p', { className: 'cs-touch-help' }, '<b>左手</b><span>左側に指を置く → 上へずらして押したまま前進。離すと止まります。</span>'));
    }
    const sync = value => { for (const el of cards) el.setAttribute('aria-checked', String(el.dataset.mode === value)); };
    for (const el of cards) el.addEventListener('click', () => (onPick || (m => fc.setMode(m)))(el.dataset.mode));
    // Arrow keys move the selection like a radio group.
    box.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const to = cards.find(el => el.dataset.mode !== (document.activeElement?.dataset?.mode || fc.mode));
      to?.focus(); to?.click();
    });
    const api = { box, cards, sync };
    live.push(api); sync(fc.mode);
    return api;
  }
  // Anything that changes the mode (settings cards, the home select, "reset") refreshes every chooser.
  new MutationObserver(() => { for (const api of live) if (!api.manual) api.sync(fc.mode); })
    .observe(document.body, { attributes: true, attributeFilter: ['data-sky-camera-mode'] });

  // ---- Popup: shown when the intro run starts on a touch device ----
  let dialog, picked, onDone, ui;
  function build() {
    dialog = make('div', { id: 'ctrlPick', hidden: true });
    dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-labelledby', 'csTitle');
    dialog.innerHTML = `<div class="cs-dialog">
      <header><h2 id="csTitle">操作のタイプを選ぼう</h2><p class="cs-lead">入門でも本番でも、ここで選んだ操作になります。</p></header>
      <div class="cs-slot"></div>
      <footer><button id="csGo" type="button" class="cs-go"></button><button id="csCancel" type="button" class="cs-cancel">やめる</button></footer>
      <p class="cs-note">あとからメニューの「操作」でいつでも変えられます。</p></div>`;
    (app || document.body).append(dialog);
    ui = chooser({ onPick: mode => select(mode) });
    ui.manual = true; // the popup keeps its own pending choice until "始める"
    dialog.querySelector('.cs-slot').append(ui.box);
    $('csGo').addEventListener('click', () => { const done = onDone; close(); fc.setMode(picked); done?.(); });
    $('csCancel').addEventListener('click', close);
    dialog.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  }
  function select(mode) {
    picked = mode; ui.sync(mode);
    $('csGo').textContent = `${cardName(mode)}で入門を始める`;
  }
  function close() { dialog.hidden = true; document.body.classList.remove('onb-open'); onDone = null; }
  function open(done) {
    if (!dialog) build();
    onDone = done; select(fc.mode);
    dialog.hidden = false; document.body.classList.add('onb-open');
    ui.cards.find(el => el.dataset.mode === picked)?.focus({ preventScroll: true });
  }

  // Every way into the intro run (splash, 遊び方, the home button) clicks #bIntro; ask first (touch and PC).
  // Automated browsers (the bench scripts) skip the popup unless ?controlpick=1.
  const skip = window.skyOwnerReplay || params.has('ownerReplay') || window.skyPracticeMode || params.has('practice') || params.get('controlpick') === '0';
  const ask = () => !window.skyGuidedEntry && !skip && (navigator.webdriver !== true || params.get('controlpick') === '1');
  let passing = false;
  document.addEventListener('click', event => {
    const intro = event.target.closest?.('#bIntro');
    if (!intro || passing || !ask()) return;
    event.preventDefault(); event.stopImmediatePropagation();
    open(() => { passing = true; try { intro.click(); } finally { passing = false; } });
  }, true);

  window.skyControlStyle = { chooser, open, get mode() { return fc.mode; }, get dialogVisible() { return !!dialog && !dialog.hidden; } };
})();
