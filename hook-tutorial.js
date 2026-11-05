// Contextual instruction on the real course. Q / the existing touch ring launch
// the ordinary hook; its movement, collisions and automatic release are unchanged.
(function (root) {
  const KEY = 'gunrun-hook-guide-v1';
  function createController({ game, intro, candidate, storage, map, forced = false, disabled = false, show = () => {}, releasePointer = () => {}, now = () => performance.now() }) {
    const c = game.c;
    let phase = 'idle', target = null, run = null, skipped = false, seen = false, origin = null, flight = 0, nextAt = 0, successUntil = 0;
    const playing = () => game.modeRef() === 'play' && !game.z.over;
    const active = () => ['explain', 'action', 'flight'].includes(phase);
    const clear = () => {
      for (const key of Object.keys(game.keys)) game.keys[key] = false;
      Object.assign(game.inputState, { on: false, id: null, lookId: null, x: 0, y: 0, slideHeld: false });
      c.hookPressed = c.crouchPressed = false; c.hookPick = null; c.jumpBuf = c.slideBuf = c.zipWish = 0;
      game.Et.held = false; game.Et.trigger = 0;
    };
    const read = () => { try { return JSON.parse(storage.getItem(KEY) || '{}')[map] === true; } catch { return false; } };
    function reset() {
      phase = 'idle'; target = origin = null; skipped = false; seen = !forced && read(); flight = nextAt = 0;
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
          target = available; origin = { x: c.pos.x, y: c.pos.y, z: c.pos.z };
          clear(); phase = 'explain'; releasePointer();
        }
      }
      if (phase === 'action') { const available = candidate(); if (available) target = available; }
      render();
    }
    function afterFrame(dt) {
      if (!playing() || !intro()) { render(); return; }
      if (phase === 'action' && c.state === 'hook') {
        // Only an existing map anchor counts (the separate rescue skill does not).
        if (!game.us.includes(c.hook)) { stop(); return; }
        target = { anchor: c.hook }; phase = 'flight'; flight = 0; clear();
      } else if (phase === 'flight') {
        flight += dt;
        const moved = Math.hypot(c.pos.x - origin.x, c.pos.y - origin.y, c.pos.z - origin.z);
        const a = target.anchor;
        if (c.state === 'normal' && c.onGround) {
          stop(moved > 2 && Math.hypot(c.pos.x - a[0], c.pos.z - a[2]) < 6 && c.pos.y >= a[1] - 3);
          return;
        }
        // Failed/interrupted hooks resume the ordinary fall/respawn path. No
        // new movement, safety platform, teleport or tutorial-only pull button.
        if (flight > 8 || c.pos.y < game.fallY + 1) { stop(); return; }
      }
      render();
    }
    return {
      beforeFrame, afterFrame,
      tryAction() { if (phase !== 'explain' || !playing()) return; clear(); phase = 'action'; render(); },
      skip() { skipped = true; stop(); },
      get active() { return playing() && active(); },
      get worldPaused() { return playing() && active(); },
      get freezePlayer() { return playing() && ['explain', 'action'].includes(phase); },
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
    plate.innerHTML = '<div id="hookGuideSpot" aria-hidden="true"><span id="hookGuideTargetLabel"></span></div><div class="hook-guide-card"><header><span id="hookGuideStep"></span><span id="hookGuidePause"></span></header><h2 id="hookGuideTitle"></h2><p id="hookGuideText"></p><footer><button id="hookGuideSkip" type="button"></button><button id="hookGuideTry" type="button"></button></footer></div>';
    app.append(plate);
    const $ = id => document.getElementById(id), card = plate.querySelector('.hook-guide-card'), spot = $('hookGuideSpot'), tryButton = $('hookGuideTry'), skip = $('hookGuideSkip');
    let lastPhase = '', tutorial;
    function show({ phase, target, visible, paused }) {
      plate.hidden = !visible; plate.dataset.phase = phase;
      document.body.classList.toggle('hook-guide-paused', paused);
      if (!visible) { spot.hidden = true; lastPhase = phase; return; }
      plate.setAttribute('role', phase === 'explain' ? 'dialog' : 'region');
      if (phase === 'explain') plate.setAttribute('aria-modal', 'true'); else plate.removeAttribute('aria-modal');
      const copy = {
        explain: ['HOOK / 01', text('ここは、フックで登れる。', 'Use a hook to reach this platform.'), text('光る輪がフックを掛けられる場所です。掛けると自動で引き寄せられ、高い足場へ移動できます。', 'The highlighted ring is a hook point. Attach your hook and it will automatically pull you up to the platform.')],
        action: ['HOOK / 02', text('フックを掛けてみよう。', 'Attach your hook.'), touch() ? text('光る輪をタップしてください。その後の移動は自動です。', 'Tap the highlighted ring. Movement is automatic after that.') : text('光る輪が見えている状態で Q キー。掛けた後の移動は自動です。', 'Press Q while the highlighted ring is in view. Movement is automatic after that.')],
        flight: ['HOOK / 03', text('フックで移動中。', 'Your hook is pulling you up.'), text('追加の操作は不要です。足場に着くまで、敵と時間は止まっています。', 'No extra input needed. Enemies and the clock stay paused until you land.')],
        success: ['HOOK / COMPLETE', text('フックで足場へ移動できた！', 'You reached the platform!'), text('敵と時間が動き出します。ほかの輪も、同じ操作で使えます。', 'Enemies and the clock resume. Other rings work with the same controls.')],
      }[phase];
      if (!copy) return;
      const set = (id, value) => { if ($(id).textContent !== value) $(id).textContent = value; };
      set('hookGuideStep', copy[0]); set('hookGuideTitle', copy[1]); set('hookGuideText', copy[2]);
      set('hookGuidePause', paused ? text('Ⅱ 敵・時間を停止中', 'Ⅱ WORLD PAUSED') : '');
      set('hookGuideTargetLabel', text('ここにフックを掛けられる', 'HOOK POINT'));
      set('hookGuideSkip', text('今回は閉じる', 'Skip for this run')); set('hookGuideTry', text('試してみる', 'Try it'));
      tryButton.hidden = phase !== 'explain'; skip.hidden = phase === 'success';
      const view = target?.anchor && game.hookAssist().inspect(target.anchor);
      spot.hidden = phase === 'flight' || phase === 'success' || !view || !!view.reason;
      if (!spot.hidden) {
        const bounds = app.getBoundingClientRect(), y = view.y;
        spot.style.left = view.x + 'px'; spot.style.top = y + 'px';
        spot.classList.toggle('label-below', y < 90);
        // Put the card on the opposite side so it never hides the target.
        card.classList.toggle('at-top', y > bounds.height * .58);
      }
      if (lastPhase !== phase && phase === 'explain') tryButton.focus({ preventScroll: true });
      lastPhase = phase;
    }
    tutorial = createController({ game, intro: () => root.skyChallenge?.isIntroRun === true,
      candidate: () => { const assist = game.hookAssist(), anchor = assist.target(); return anchor && !assist.inspect(anchor).reason ? { anchor } : null; },
      storage: { getItem: k => localStorage.getItem(k), setItem: (k, v) => localStorage.setItem(k, v) },
      map: root.SKY_CANYON_MAP ? 'canyon' : 'old-town', forced: params.get('hookGuide') === '1',
      disabled: params.get('hookGuide') === '0' || (navigator.webdriver === true && params.get('hookGuide') !== '1'),
      releasePointer: () => { document.exitPointerLock?.(); }, show,
    });
    root.skyHookTutorial = tutorial;
    tryButton.addEventListener('click', () => { tutorial.tryAction(); document.getElementById('c').focus(); });
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
