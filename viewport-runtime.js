// Safari's visible viewport can settle after window.resize (especially a Home Screen launch).
// Layout, WebGL and input share one measured rectangle. No resize event is needed to recover it.
(() => {
  const root = document.documentElement, app = document.getElementById('app');
  const listeners = new Set();
  let current, game, resetInput, frame = 0, settle = [], resolutionQuery;
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
    const scale = Math.min(1, physical.width / bounds.width, physical.height / bounds.height);
    const gapX = (physical.width - bounds.width * scale) / 2;
    const gapY = (physical.height - bounds.height * scale) / 2;
    const next = { ...physical, width: bounds.width, height: bounds.height, portrait, scale,
      contentLeft: physical.left + gapX, contentTop: physical.top + gapY,
      physicalWidth: physical.width, physicalHeight: physical.height };
    const changed = !old || Object.keys(next).some(key => next[key] !== old[key]);
    current = next;
    root.dataset.skyRotation = '0';
    root.dataset.skyPortrait = String(portrait);
    if (changed) {
      root.style.setProperty('--visible-width', physical.width + 'px');
      root.style.setProperty('--visible-height', physical.height + 'px');
      root.style.setProperty('--visible-left', physical.left + 'px');
      root.style.setProperty('--visible-top', physical.top + 'px');
      // Every fixed game surface is local to #app (viewport.css), including button hit targets.
      Object.assign(document.body.style, { position: 'fixed', left: next.contentLeft + 'px', top: next.contentTop + 'px', width: next.width + 'px', height: next.height + 'px', transformOrigin: '0 0', transform: scale < 1 ? `scale(${scale})` : 'none' });
      Object.assign(app.style, { inset: 'auto', left: '0px', top: '0px', width: next.width + 'px', height: next.height + 'px' });
      app.style.setProperty('--control-height', next.height + 'px');
      for (const edge of ['left', 'top', 'right', 'bottom']) {
        const gap = edge === 'left' || edge === 'right' ? gapX : gapY;
        app.style.setProperty('--control-inset-' + edge, scale === 1 ? `env(safe-area-inset-${edge})` : `max(0px, calc((env(safe-area-inset-${edge}) - ${gap}px) / ${scale}))`);
      }
      if (old && (old.width !== next.width || old.height !== next.height || old.contentLeft !== next.contentLeft || old.contentTop !== next.contentTop || old.scale !== next.scale)) cancelInput();
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
  window.__CX = event => (event.clientX - current.contentLeft) / current.scale;
  window.__CY = event => (event.clientY - current.contentTop) / current.scale;
  window.skyViewport = {
    sync, guard, cancelInput, get blocked() { return blocked(); },
    snapshot: () => ({ ...current, blocked: blocked(), standalone: navigator.standalone === true || matchMedia('(display-mode: standalone)').matches }),
    onResize(listener) { listeners.add(listener); listener(); },
    attach(value, reset) { game = value; resetInput = reset; recover(); },
    modeChanged(mode) { if (mode !== 'play') cancelInput(); guard(); },
  };
  // Leave screen direction under the player's control. Portrait fits the same
  // upright landscape frame; neither CSS nor an input-triggered lock rotates it.
  for (const name of ['pointerdown', 'mousedown', 'touchstart']) document.addEventListener(name, event => {
    const point = event.changedTouches?.[0] || event;
    if (current.scale === 1 || !Number.isFinite(point.clientX)) return;
    const x = window.__CX(point), y = window.__CY(point);
    if (x >= 0 && y >= 0 && x <= current.width && y <= current.height) return;
    // Tapping the letterbox must not start movement or turn the camera.
    event.preventDefault(); event.stopImmediatePropagation();
  }, { capture: true, passive: false });
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
