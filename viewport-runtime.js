// Safari's visible viewport can settle after window.resize (especially a Home Screen launch).
// Layout, WebGL and input share one measured rectangle. No resize event is needed to recover it.
(() => {
  const root = document.documentElement, app = document.getElementById('app');
  const listeners = new Set();
  let current, game, resetInput, frame = 0, settle = [], resolutionQuery, lockPending = false;
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
  function blocked() { return document.hidden; }
  function sync() {
    frame = 0;
    const physical = measure(), old = current;
    const portrait = physical.height > physical.width;
    const bounds = portrait ? { width: physical.height, height: physical.width } : physical;
    const next = { ...physical, width: bounds.width, height: bounds.height, portrait,
      physicalWidth: physical.width, physicalHeight: physical.height };
    const changed = !old || Object.keys(next).some(key => next[key] !== old[key]);
    current = next;
    root.dataset.skyRotation = portrait ? '1' : '0';
    root.dataset.skyPortrait = String(portrait);
    if (changed) {
      root.style.setProperty('--visible-width', physical.width + 'px');
      root.style.setProperty('--visible-height', physical.height + 'px');
      root.style.setProperty('--visible-left', physical.left + 'px');
      root.style.setProperty('--visible-top', physical.top + 'px');
      // Every fixed game surface is local to #app (viewport.css), including button hit targets.
      Object.assign(document.body.style, { position: 'fixed', left: physical.left + 'px', top: physical.top + 'px', width: next.width + 'px', height: next.height + 'px', transformOrigin: '0 0', transform: portrait ? `translateX(${physical.width}px) rotate(90deg)` : 'none' });
      Object.assign(app.style, { inset: 'auto', left: '0px', top: '0px', width: next.width + 'px', height: next.height + 'px' });
      app.style.setProperty('--control-height', next.height + 'px');
      const edges = ['left', 'top', 'right', 'bottom'], physicalEdges = portrait ? ['top', 'right', 'bottom', 'left'] : edges;
      edges.forEach((edge, i) => app.style.setProperty('--control-inset-' + edge, 'env(safe-area-inset-' + physicalEdges[i] + ')'));
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
  window.__CX = event => current.portrait ? event.clientY - current.top : event.clientX - current.left;
  window.__CY = event => current.portrait ? current.physicalWidth - (event.clientX - current.left) : event.clientY - current.top;
  window.skyViewport = {
    sync, guard, cancelInput, get blocked() { return blocked(); },
    snapshot: () => ({ ...current, blocked: blocked(), standalone: navigator.standalone === true || matchMedia('(display-mode: standalone)').matches }),
    onResize(listener) { listeners.add(listener); listener(); },
    attach(value, reset) { game = value; resetInput = reset; recover(); },
    modeChanged(mode) { if (mode !== 'play') cancelInput(); guard(); },
  };
  // Orientation lock is best-effort; iOS browsers can reject or omit it.
  // CSS rotation keeps the game landscape even when the API is unsupported.
  function lockLandscape(event) {
    if (!event.isTrusted || !touch() || lockPending || !screen.orientation?.lock || screen.orientation.type?.startsWith('landscape')) return;
    lockPending = true;
    try { Promise.resolve(screen.orientation.lock('landscape')).catch(() => {}).finally(() => { lockPending = false; }); }
    catch { lockPending = false; }
  }
  for (const name of ['click', 'touchend', 'keydown']) document.addEventListener(name, lockLandscape, { capture: true, passive: true });
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
