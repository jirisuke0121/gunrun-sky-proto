// The travel heading owns movement/auto-aim; this view never follows the gun or torso.
(() => {
  const game = window.__skyInternals;
  if (!game) return;
  const { c, inputState: touch, keys } = game;
  const storageKey = 'gunrun-follow-camera-v1';
  const coarse = () => matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
  const defaultMode = () => coarse() ? 'after' : 'before';
  const queryMode = new URLSearchParams(location.search).get('camera');
  let savedMode;
  try { savedMode = localStorage.getItem(storageKey); } catch {}
  let mode = [queryMode, savedMode, defaultMode()].find(value => value === 'before' || value === 'after');
  const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
  const angle = n => Math.atan2(Math.sin(n), Math.cos(n));
  const view = { yaw: c.yaw, pitch: c.pitch };
  let manual = false, manualUntil = 0, mouseHeld = false, lastInput = 0;
  const selectors = [];
  const enabled = () => mode === 'after' && !game.demoActive();
  const playing = () => enabled() && game.modeRef() === 'play' && !game.z.over;

  function reset() {
    view.yaw = c.yaw; view.pitch = c.pitch;
    manual = mouseHeld = false; manualUntil = 0; lastInput = 0;
  }
  function input(raw) {
    if (!playing()) return raw;
    const analog = touch.on && raw.tmag > .18;
    const sideways = keys.AltLeft || keys.AltRight;
    const x = raw.strIn, magnitude = Math.abs(x);
    raw.steer = sideways ? 0 : Math.sign(x) * Math.pow(clamp((magnitude - (analog ? .28 : 0)) / (analog ? .72 : 1), 0, 1), 1.15);
    // Keep small thumb corrections lateral; a full sideways deflection turns in place.
    if (!sideways) raw.strIn = analog ? x * clamp((.55 - magnitude) / .27, 0, 1) : 0;
    return raw;
  }
  function step(dt, controls) {
    if (!playing()) return;
    lastInput = Math.max(Math.abs(controls.fwdIn), Math.abs(controls.strIn), Math.abs(controls.steer || 0));
    if (!['normal', 'slide', 'wallrun'].includes(c.state)) return;
    const turn = (controls.steer || 0) * 2.4 * (c.state === 'wallrun' ? .3 : 1);
    c.yaw = angle(c.yaw - turn * Math.min(.05, Math.max(0, dt)));
  }
  function look(yawDelta, pitchDelta) {
    if (!playing()) return false;
    view.yaw = angle(view.yaw - yawDelta);
    view.pitch = clamp(view.pitch - pitchDelta, -1.35, 1.35);
    if (Math.abs(yawDelta) + Math.abs(pitchDelta) > .00001) {
      manual = true; manualUntil = performance.now() + 1100;
    }
    return true;
  }
  function frame(dt) {
    if (!enabled() || ['menu', 'replay'].includes(game.modeRef())) return null;
    if (!playing() || dt <= 0) return view;
    const held = mouseHeld || touch.lookId !== null;
    if (manual && (held || performance.now() < manualUntil || lastInput < .08)) return view;
    manual = false;
    let targetYaw = c.yaw;
    let targetPitch = c.onGround ? -.09 : -.16;
    // Follow only the anchor already selected by the player. Never retarget a hook.
    if (c.state === 'hook' && c.hook) {
      const dx = c.hook[0] - c.pos.x, dz = c.hook[2] - c.pos.z;
      const horizontal = Math.hypot(dx, dz);
      if (horizontal > 2.2) targetYaw = Math.atan2(-dx, -dz);
      else targetYaw = view.yaw;
      targetPitch = clamp(Math.atan2(c.hook[1] - c.pos.y - c.eye, horizontal), -.18, .42);
    }
    const gain = c.state === 'wallrun' ? 4 : c.onGround ? 13 : 7;
    const elapsed = Math.min(.05, Math.max(0, dt));
    view.yaw = angle(view.yaw + clamp(angle(targetYaw - view.yaw) * (1 - Math.exp(-gain * elapsed)), -2.8 * elapsed, 2.8 * elapsed));
    view.pitch += clamp((targetPitch - view.pitch) * (1 - Math.exp(-3 * elapsed)), -.65 * elapsed, .65 * elapsed);
    return view;
  }
  function syncUI() {
    document.body.dataset.skyCameraMode = mode;
    for (const select of selectors) select.value = mode;
    for (const note of document.querySelectorAll('.follow-camera-help')) {
      note.textContent = mode === 'before' ? '従来どおり、移動と視点を別々に操作します。' : coarse()
        ? '左スティックの左右で曲がる。少しだけ倒すと横へ微調整。右スワイプで見回せます。'
        : 'W/S：前後、A/D：曲がる、Alt＋A/D：横移動。マウスで見回せます。';
    }
  }
  function setMode(next, persist = true) {
    if (!['before', 'after'].includes(next)) return;
    if (mode !== next) {
      // Switching back preserves the picture, then the original input path owns it again.
      if (next === 'before') { c.yaw = view.yaw; c.pitch = view.pitch; }
      mode = next; reset();
    }
    if (persist) {
      try { localStorage.setItem(storageKey, mode); } catch {}
      const url = new URL(location.href); url.searchParams.set('camera', mode);
      history.replaceState(history.state, '', url);
    }
    syncUI();
  }
  function control(id, home) {
    const group = document.createElement('section');
    group.className = home ? 'follow-camera-home' : 'set-group follow-camera-settings';
    group.setAttribute('aria-label', home ? 'プレイ前のカメラ操作' : 'カメラ操作');
    group.innerHTML = `${home ? '' : '<h4>カメラ操作</h4>'}<label for="${id}">${home ? 'カメラ' : '操作方式'}</label><select id="${id}" aria-label="${home ? 'プレイ前のカメラ操作' : 'カメラ操作'}"><option value="after">移動に追従</option><option value="before">手動（従来）</option></select><p class="note follow-camera-help"></p>`;
    const select = group.querySelector('select'); selectors.push(select);
    select.addEventListener('change', () => setMode(select.value));
    for (const name of ['pointerdown', 'pointerup', 'touchstart', 'touchend']) group.addEventListener(name, event => event.stopPropagation());
    return group;
  }
  window.skyFollowCamera = {
    input, step, look, frame, reset, setMode,
    holdLook(held) { mouseHeld = held; },
    get active() { return enabled(); },
    get mode() { return mode; },
    get view() { return enabled() ? view : c; },
    get state() { return { mode, yaw: view.yaw, pitch: view.pitch, heading: c.yaw, manual, moving: lastInput }; },
  };
  document.getElementById('humanStatus')?.after(control('cameraModeHome', true));
  document.getElementById('setGrid').prepend(control('cameraMode', false));
  document.getElementById('bReset').addEventListener('click', () => setMode(defaultMode()));
  window.addEventListener('blur', () => { mouseHeld = false; });
  document.addEventListener('visibilitychange', () => { if (document.hidden) mouseHeld = false; });
  syncUI();
})();
