// Contextual instruction on the real course. Q / the existing touch ring launch
// the ordinary hook; its movement, collisions and automatic release are unchanged.
(function (root) {
  const KEY = 'gunrun-hook-guide-v1';
  function createController({ game, intro, candidate, storage, map, forced = false, disabled = false, show = () => {}, releasePointer = () => {}, now = () => performance.now() }) {
    const c = game.c;
    let phase = 'idle', target = null, run = null, skipped = false, seen = false, nextAt = 0, successUntil = 0;
    const playing = () => game.modeRef() === 'play' && !game.z.over;
    const active = () => phase === 'action';
    const clear = () => {
      for (const key of Object.keys(game.keys)) game.keys[key] = false;
      Object.assign(game.inputState, { on: false, id: null, lookId: null, x: 0, y: 0, slideHeld: false });
      c.hookPressed = c.crouchPressed = false; c.hookPick = null; c.jumpBuf = c.slideBuf = c.zipWish = 0;
      game.Et.held = false; game.Et.trigger = 0;
    };
    const read = () => { try { return JSON.parse(storage.getItem(KEY) || '{}')[map] === true; } catch { return false; } };
    function reset() {
      phase = 'idle'; target = null; skipped = false; seen = !forced && read(); nextAt = 0;
    }
    function render() { show({ phase, target, visible: playing() && phase !== 'idle', paused: playing() && active() }); }
    function stop(completed = false) {
      clear();
      if (completed) {
        seen = true; phase = 'success'; successUntil = now() + 2600;
        try { const data = JSON.parse(storage.getItem(KEY) || '{}'); storage.setItem(KEY, JSON.stringify({ ...data, [map]: true })); } catch {}
      } else { phase = 'idle'; target = null; nextAt = game.z.t + 3; }
      render();
    }
    function beforeFrame() {
      if (run !== game.z.challenge) { run = game.z.challenge; reset(); }
      if (game.z.over || game.modeRef() === 'menu' || disabled || !intro()) { if (active()) clear(); phase = 'idle'; render(); return; }
      if (!playing()) { render(); return; }
      if (phase === 'success' && now() >= successUntil) phase = 'idle';
      if (phase === 'idle' && !seen && !skipped && game.z.t >= nextAt && c.state === 'normal' && c.onGround && !(c.hookCD > 0) && !game.demoActive()) {
        const available = candidate();
        if (available) {
          target = available;
          clear(); phase = 'action'; releasePointer();
        }
      }
      if (phase === 'action') { const available = candidate(); if (available) target = available; }
      render();
    }
    function afterFrame() {
      if (!playing() || !intro()) { render(); return; }
      if (phase === 'action' && c.state === 'hook') {
        // Accepted by the unchanged native hook handler, not merely a press.
        // A rescue skill uses a temporary anchor and does not complete this guide.
        if (!game.us.includes(c.hook)) { stop(); return; }
        target = { anchor: c.hook }; stop(true);
      }
      render();
    }
    return {
      beforeFrame, afterFrame,
      skip() { skipped = true; stop(); },
      get active() { return playing() && active(); },
      get worldPaused() { return playing() && active(); },
      get freezePlayer() { return playing() && active(); },
      get acceptsHook() { return playing() && phase === 'action'; },
      get phase() { return phase; }, get target() { return target; },
    };
  }
  if (typeof module === 'object' && module.exports) { module.exports = { createController, KEY }; return; }
  root.addEventListener('load', () => {
    const game = root.__skyInternals;
    if (!game || root.skyPracticeMode || root.skyOwnerReplay) return;
    const params = new URLSearchParams(location.search), app = document.getElementById('app') || document.body;
    const english = () => (root.skyI18n?.lang || document.documentElement.lang) === 'en';
    const touch = () => matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
    const text = (jp, en) => english() ? en : jp;
    const plate = document.createElement('section'); plate.id = 'hookGuide'; plate.hidden = true;
    plate.setAttribute('aria-live', 'polite'); plate.setAttribute('aria-labelledby', 'hookGuideTitle');
    plate.innerHTML = '<div id="hookGuideSpot" aria-hidden="true"><span id="hookGuideTargetLabel"></span></div><div class="hook-guide-card"><header><span id="hookGuideStep"></span><span id="hookGuidePause"></span><button id="hookGuideSkip" type="button">×</button></header><h2 id="hookGuideTitle"></h2><p id="hookGuideText"></p></div>';
    app.append(plate);
    const $ = id => document.getElementById(id), card = plate.querySelector('.hook-guide-card'), spot = $('hookGuideSpot'), skip = $('hookGuideSkip');
    let lastPhase = '', wasVisible = false, tutorial;
    function show({ phase, target, visible, paused }) {
      if (!visible && !wasVisible && lastPhase === phase) return;
      wasVisible = visible;
      plate.hidden = !visible; plate.dataset.phase = phase;
      document.body.classList.toggle('hook-guide-paused', paused);
      if (!visible) { spot.hidden = true; lastPhase = phase; return; }
      plate.setAttribute('role', 'region');
      const copy = {
        action: ['HOOK / GUIDE', text('フックで、ここへ移動できる。', 'Hook onto this point to move up.'), touch() ? text('光る輪をタップするとフックが掛かり、自動で移動します。', 'Tap the highlighted ring to attach your hook and move automatically.') : text('光る輪へ視点を向けて Q キー。フックが掛かると、自動で移動します。', 'Face the highlighted ring and press Q. Your hook will pull you up automatically.')],
        success: ['HOOK / SUCCESS', text('フック成功！', 'HOOK CONNECTED!'), text('そのまま自動で移動。ほかの輪も同じ操作で使えます。', 'Your hook pulls you up automatically. Other rings work the same way.')],
      }[phase];
      if (!copy) return;
      const set = (id, value) => { if ($(id).textContent !== value) $(id).textContent = value; };
      set('hookGuideStep', copy[0]); set('hookGuideTitle', copy[1]); set('hookGuideText', copy[2]);
      set('hookGuidePause', paused ? text('Ⅱ 敵・時間を停止中', 'Ⅱ WORLD PAUSED') : '');
      set('hookGuideTargetLabel', text('ここにフックを掛けられる', 'HOOK POINT'));
      skip.setAttribute('aria-label', text('案内を閉じる', 'Close guide')); skip.hidden = phase === 'success';
      const view = target?.anchor && game.hookAssist().inspect(target.anchor);
      spot.hidden = phase === 'success' || !view || !!view.reason;
      if (!spot.hidden) {
        const bounds = app.getBoundingClientRect(), y = view.y;
        spot.style.left = view.x + 'px'; spot.style.top = y + 'px';
        spot.classList.toggle('label-below', y < 90);
        // Put the card on the opposite side so it never hides the target.
        card.classList.toggle('at-top', y > bounds.height * .58);
      }
      if (lastPhase !== phase && phase === 'action') document.getElementById('c').focus({ preventScroll: true });
      lastPhase = phase;
    }
    tutorial = createController({ game, intro: () => root.skyChallenge?.isIntroRun === true,
      candidate: () => { if(root.skyContextTutorial?.phase&&root.skyContextTutorial.phase!=='idle')return null; const assist = game.hookAssist(), anchor = assist.target(); return anchor && !assist.inspect(anchor).reason ? { anchor } : null; },
      storage: { getItem: k => localStorage.getItem(k), setItem: (k, v) => localStorage.setItem(k, v) },
      map: root.SKY_CANYON_MAP ? 'canyon' : 'old-town', forced: params.get('hookGuide') === '1',
      disabled: params.get('hookGuide') === '0' || (navigator.webdriver === true && params.get('hookGuide') !== '1'),
      releasePointer: () => { document.exitPointerLock?.(); }, show,
    });
    root.skyHookTutorial = tutorial;
    skip.addEventListener('click', () => { tutorial.skip(); document.getElementById('c').focus(); });
    for (const name of ['pointerdown', 'pointerup', 'touchstart', 'touchend']) card.addEventListener(name, e => e.stopPropagation());
    // Keep the instruction focused on the existing action. Escape/P and settings
    // remain available; pointer look and native touch-ring handling stay intact.
    root.addEventListener('keydown', e => {
      if (!tutorial.freezePlayer || e.ctrlKey || e.metaKey) return;
      if (['Tab', 'Enter', 'Space'].includes(e.code) && card.contains(document.activeElement)) return;
      if (['Escape', 'KeyP', 'ArrowLeft', 'ArrowRight'].includes(e.code) || (tutorial.acceptsHook && e.code === 'KeyQ')) return;
      e.preventDefault(); e.stopImmediatePropagation();
    }, true);
  });
})(globalThis);
