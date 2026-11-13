// Safari's visible viewport can settle after window.resize (especially a Home Screen launch).
// Layout, WebGL and input share one measured rectangle. No resize event is needed to recover it.
(() => {
  const root = document.documentElement, app = document.getElementById('app');
  const listeners = new Set();
  let current, game, resetInput, frame = 0, settle = [], resolutionQuery;
  const touch = () => root.classList.contains('touch') || matchMedia('(pointer: coarse)').matches;
  function measure() {
    const vv = window.visualViewport;
    return {
      width: Math.max(1, Math.round(vv?.width || innerWidth)),
      height: Math.max(1, Math.round(vv?.height || innerHeight)),
      left: vv?.offsetLeft || 0, top: vv?.offsetTop || 0,
      dpr: devicePixelRatio || 1,
    };
  }
  function cancelInput() {
    resetInput?.();
    document.dispatchEvent(new Event('sky-input-reset'));
  }
  function guard() {
    if (blocked() && game?.mode === 'play') {
      cancelInput(); game.setMode('pause');
    }
  }
  function blocked() { return document.hidden || (touch() && current.height > current.width); }
  function sync() {
    frame = 0;
    const next = measure(), old = current;
    const changed = !old || Object.keys(next).some(key => next[key] !== old[key]);
    current = next;
    root.dataset.skyRotation = '0';
    root.dataset.skyPortrait = String(touch() && next.height > next.width);
    if (changed) {
      // Every fixed game surface is local to #app (viewport.css), including button hit targets.
      Object.assign(app.style, { inset: 'auto', left: next.left + 'px', top: next.top + 'px', width: next.width + 'px', height: next.height + 'px' });
      app.style.setProperty('--control-height', next.height + 'px');
      for (const edge of ['left', 'top', 'right', 'bottom']) app.style.setProperty('--control-inset-' + edge, 'env(safe-area-inset-' + edge + ')');
      if (old && (old.width !== next.width || old.height !== next.height || old.left !== next.left || old.top !== next.top)) cancelInput();
      for (const listener of listeners) listener();
      document.dispatchEvent(new Event('sky-viewport-change'));
    }
    guard();
    return changed;
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(sync); }
  function recover() {
    cancelInput(); sync();
    for (const id of settle) clearTimeout(id);
    // iOS may deliver orientation/pageshow before safe-area and viewport values have settled.
    settle = [100, 300, 700].map(delay => setTimeout(sync, delay));
  }
  function watchResolution() {
    resolutionQuery?.removeEventListener('change', resolutionChanged);
    resolutionQuery = matchMedia(`(resolution: ${devicePixelRatio || 1}dppx)`);
    resolutionQuery.addEventListener('change', resolutionChanged);
  }
  function resolutionChanged() { sync(); watchResolution(); }
  window.__VW = () => current.width;
  window.__VH = () => current.height;
  window.__CX = event => event.clientX - current.left;
  window.__CY = event => event.clientY - current.top;
  window.skyViewport = {
    sync, guard, cancelInput, get blocked() { return blocked(); },
    snapshot: () => ({ ...current, blocked: blocked(), standalone: navigator.standalone === true || matchMedia('(display-mode: standalone)').matches }),
    onResize(listener) { listeners.add(listener); listener(); },
    attach(value, reset) { game = value; resetInput = reset; recover(); },
    modeChanged(mode) { if (mode !== 'play') cancelInput(); guard(); },
  };
  sync(); watchResolution();
  addEventListener('resize', recover);
  addEventListener('orientationchange', recover);
  screen.orientation?.addEventListener('change', recover);
  window.visualViewport?.addEventListener('resize', recover);
  window.visualViewport?.addEventListener('scroll', schedule);
  addEventListener('pageshow', recover);
  addEventListener('focus', recover);
  addEventListener('pagehide', () => { cancelInput(); if (game?.mode === 'play') game.setMode('pause'); });
  addEventListener('blur', () => { cancelInput(); if (game?.mode === 'play') game.setMode('pause'); });
  document.addEventListener('visibilitychange', () => {
    cancelInput(); if (document.hidden && game?.mode === 'play') game.setMode('pause');
    if (!document.hidden) recover();
  });
  // Observe late layout/safe-area changes too, without forcing the expensive WebGL resize on every frame.
  new ResizeObserver(schedule).observe(app);
})();
