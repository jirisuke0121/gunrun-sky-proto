// One owner for the two home-screen start buttons. Assets may arrive in any order.
(() => {
  window.installSkyStartReadiness = (game, win = window, doc = document) => {
    const start = doc.getElementById('bStart'), intro = doc.getElementById('bIntro');
    const statuses = ['startReadyStatus', 'introReadyStatus'].map(id => doc.getElementById(id));
    const retry = [...doc.querySelectorAll('[data-retry-start]')];
    let state, pageLoaded = doc.readyState === 'complete';
    function inspect() {
      const models = win.__skyUpgrade?.loaded;
      if (pageLoaded && (!win.skyHumanView || !models || doc.body.dataset.skyGameExtensionsReady !== 'true' || !win.skySettings || !win.skyFollowCamera)) {
        return { phase: 'error', message: 'ゲームを読み込めませんでした。再読み込みしてください。' };
      }
      if (win.skyHumanView?.choice === 'existing') return { phase: 'error', message: '人物を読み込めませんでした。再読み込みしてください。' };
      if (!models?.hg && models?.error?.startsWith('hg:')) return { phase: 'error', message: '銃を読み込めませんでした。再読み込みしてください。' };
      if (doc.body.dataset.skyHumanLoaded !== 'true' || !win.skyHumanView) return { phase: 'loading', message: '人物を読み込み中…' };
      if (!models?.hg) return { phase: 'loading', message: '銃を読み込み中…' };
      if (doc.body.dataset.skyGameExtensionsReady !== 'true' || !win.skySettings || !win.skyFollowCamera) return { phase: 'loading', message: 'ゲームを準備中…' };
      if (doc.body.dataset.skyZombieReady !== 'true') return { phase: 'loading', message: 'ゾンビを読み込み中…' };
      return { phase: 'ready', message: '' };
    }
    function sync() {
      state = inspect();
      const ready = state.phase === 'ready';
      for (const button of [start, intro]) {
        button.disabled = !ready;
        button.setAttribute('aria-busy', String(state.phase === 'loading'));
      }
      start.textContent = ready ? win.skyPracticeMode ? '練習をはじめる' : '本番をはじめる（2分）' : state.message;
      intro.textContent = ready ? '入門モードで試す（ライフ無限）' : state.message;
      for (const status of statuses) {
        status.hidden = ready;
        status.textContent = state.message;
      }
      for (const button of retry) button.hidden = state.phase !== 'error';
      doc.body.dataset.skyStartReadiness = JSON.stringify(state);
      return ready;
    }
    // Protect programmatic clicks as well as real taps. A rapid second tap
    // cannot reset the run that the first tap has just started.
    start.addEventListener('click', event => {
      if (!sync() || game.modeRef() !== 'menu') {
        event.preventDefault(); event.stopImmediatePropagation();
      }
    }, true);
    for (const button of retry) button.addEventListener('click', () => win.location.reload());
    new win.MutationObserver(sync).observe(doc.body, { attributes: true, attributeFilter: [
      'data-sky-human-loaded', 'data-sky-human-trial', 'data-sky-models',
      'data-sky-game-extensions-ready', 'data-sky-zombie-ready',
    ] });
    win.addEventListener('load', () => { pageLoaded = true; sync(); });
    const api = { sync, get ready() { return inspect().phase === 'ready'; }, get state() { return inspect(); } };
    win.skyStartReadiness = api;
    sync();
    return api;
  };
})();
