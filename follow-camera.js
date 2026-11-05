// The travel heading owns movement/auto-aim; this view never follows the gun or torso.
(() => {
  const game = window.__skyInternals;
  if (!game) return;
  const { c, inputState: touch, keys } = game;
  const coarse = () => matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
  // The shared key once defaulted PCs to follow/steer controls. Keep touch
  // preferences, but start mouse users on WASD + mouse even if that value remains.
  const storageKey = coarse() ? 'gunrun-follow-camera-v1' : 'gunrun-pc-camera-v1';
  const defaultMode = () => coarse() ? 'after' : 'before';
  const queryMode = new URLSearchParams(location.search).get('camera');
  let savedMode;
  try { savedMode = localStorage.getItem(storageKey); } catch {}
  let mode = [queryMode, savedMode, defaultMode()].find(value => value === 'before' || value === 'after');
  const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
  const angle = n => Math.atan2(Math.sin(n), Math.cos(n));
  const view = { yaw: c.yaw, pitch: c.pitch };
  let manual = false, manualTouch = false, manualUntil = 0, mouseHeld = false, lastInput = 0;
  // A turn gesture cannot become reverse until the thumb returns to neutral.
  let gesture = 'idle', gestureId = null, reverseTime = 0;
  let direct = false, basis = c.yaw, desiredYaw = c.yaw, directReverse = false, fromAction = false;
  const nativeStates = ['ladder', 'zip', 'hook', 'swing', 'ledge', 'wallrun'];
  const selectors = [];
  const enabled = () => mode === 'after' && !game.demoActive();
  const playing = () => enabled() && game.modeRef() === 'play' && !game.z.over;

  function reset() {
    view.yaw = c.yaw; view.pitch = c.pitch;
    manual = manualTouch = mouseHeld = false; manualUntil = 0; lastInput = 0;
    gesture = 'idle'; gestureId = null; reverseTime = 0;
    direct = false; fromAction = false; basis = desiredYaw = c.yaw; directReverse = false;
  }
  function legacyInput(raw) {
    if (!playing()) return raw;
    // These actions own forward/back input (e.g. descending a ladder).
    if (['ladder', 'zip', 'hook', 'swing'].includes(c.state)) return raw;
    const analog = touch.on && raw.tmag > .18;
    const sideways = keys.AltLeft || keys.AltRight;
    const x = raw.strIn, magnitude = Math.abs(x), forward = raw.fwdIn;
    if (!analog || touch.id !== gestureId) {
      gesture = 'idle'; reverseTime = 0; gestureId = touch.id;
    }
    if (analog) {
      // Enter a narrow reverse cone from neutral, then hold briefly. Rolling a
      // forward/turn gesture into the lower half is always a brake/pivot.
      const down = forward < 0 && magnitude < -forward * .35;
      if (gesture === 'idle') gesture = down ? 'pending' : 'drive';
      if ((gesture === 'pending' || gesture === 'reverse') && !down) {
        gesture = 'drive'; reverseTime = 0;
      }
      raw.reversePending = gesture === 'pending' && forward < -.55;
      raw.reversing = gesture === 'reverse';
      raw.fwdIn = raw.reversing ? forward : Math.max(0, forward);
    }
    const lowerTurn = analog && forward < 0 && gesture === 'drive';
    const pivotBlend = lowerTurn ? clamp(-forward / .5, 0, 1) : 0;
    const deadzone = analog ? .28 - .2 * pivotBlend : 0;
    const range = analog ? .72 - .22 * pivotBlend : 1;
    raw.steer = sideways || raw.reversePending || raw.reversing ? 0
      : Math.sign(x) * Math.pow(clamp((magnitude - deadzone) / range, 0, 1), 1.15);
    // A small horizontal correction remains lateral. In the lower half, use
    // horizontal intent only to pivot; never strafe or walk backwards.
    if (!sideways) raw.strIn = analog && forward >= 0 ? x * clamp((.55 - magnitude) / .27, 0, 1) : 0;
    if (raw.reversePending) raw.fwdIn = raw.strIn = 0;
    raw.motionScale = analog ? clamp((Math.hypot(raw.fwdIn, raw.strIn) - .12) / .88, 0, 1) : 1;
    // Turning used to cut the pace by up to 75% because the player could slip off an edge. Edge assist now
    // keeps normal walking on the surface, so a turn only trims the pace by up to 40% and keeps the run flowing.
    raw.motionScale *= 1 - .4 * Math.pow(Math.abs(raw.steer), .8);
    raw.precise = analog || Math.abs(raw.steer) > .01;
    return raw;
  }
  function legacyStep(dt, controls) {
    if (!playing()) return;
    if (controls.reversePending && c.onGround && c.state === 'normal') {
      reverseTime += Math.min(.05, Math.max(0, dt));
      if (reverseTime >= .18) gesture = 'reverse';
    } else reverseTime = 0;
    lastInput = Math.max(Math.abs(controls.fwdIn), Math.abs(controls.strIn), Math.abs(controls.steer || 0));
    if (!['normal', 'slide', 'wallrun'].includes(c.state)) return;
    const turn = (controls.steer || 0) * 2.4 * (c.state === 'wallrun' ? .3 : 1);
    c.yaw = angle(c.yaw - turn * Math.min(.05, Math.max(0, dt)));
  }
  // A touch gesture chooses a world direction once. Camera following must not
  // feed back into that held direction and create a continuously curving path.
  // Keyboard auto-camera retains its W/S drive + A/D steer mapping.
  function input(raw) {
    if (!playing()) { direct = false; fromAction = false; gestureId = null; return raw; }
    if (!touch.on) {
      direct = false; fromAction = false; gestureId = null;
      return legacyInput(raw);
    }
    const magnitude = Math.min(1, raw.tmag);
    if (nativeStates.includes(c.state)) {
      // A sideways approach can attach to a ladder after being converted to
      // forward travel. Keep climbing for that held gesture; neutral/release
      // hands the ladder back to its ordinary up/down controls.
      const climbing = c.state === 'ladder' && direct && !directReverse && gestureId === touch.id && magnitude > .18;
      if (magnitude <= .18) direct = false;
      fromAction = true; gestureId = touch.id;
      return climbing ? { ...raw, fwdIn: magnitude } : raw;
    }
    if (magnitude <= .18) {
      direct = false; fromAction = false; gestureId = null; gesture = 'idle';
      return { ...raw, fwdIn: 0, strIn: 0, motionScale: 0, precise: true, steer: 0 };
    }
    const stickAngle = Math.atan2(raw.strIn, raw.fwdIn);
    const fresh = !direct || gestureId !== touch.id;
    if (fresh) directReverse = raw.fwdIn < -Math.abs(raw.strIn);
    if (fromAction && gestureId === touch.id) {
      // An action owns its exit heading. Keep held input on that exit path;
      // only a new/neutralised gesture adopts the current view again.
      directReverse = false;
      const exitSpeed = Math.hypot(c.vel.x, c.vel.z);
      const exitYaw = exitSpeed > .1 ? Math.atan2(-c.vel.x, -c.vel.z) : c.yaw;
      basis = angle(exitYaw + stickAngle);
    } else if (fresh) {
      basis = view.yaw;
      if (!mouseHeld && touch.lookId === null) manual = manualTouch = false;
    }
    fromAction = false; direct = true; gestureId = touch.id;
    gesture = directReverse ? 'reverse' : 'drive';
    desiredYaw = angle(basis - stickAngle + (directReverse ? Math.PI : 0));
    return { ...raw, fwdIn: magnitude * (directReverse ? -1 : 1), strIn: 0,
      motionScale: clamp((magnitude - .12) / .88, 0, 1),
      precise: true, steer: 0, reversing: directReverse, direct: true };
  }
  function step(dt, controls) {
    if (!playing()) { direct = false; fromAction = false; gestureId = null; return; }
    if (!controls.direct) { legacyStep(dt, controls); return; }
    lastInput = Math.abs(controls.fwdIn);
    if (['normal', 'slide'].includes(c.state)) c.yaw = desiredYaw;
  }
  function speed(base, controls) {
    if (!playing() || !c.onGround || c.state !== 'normal') return base;
    const scaled = base * (controls.motionScale ?? 1);
    return controls.reversing ? Math.min(2.2, scaled) : scaled;
  }
  function move(dt, x, z, magnitude, target, controls) {
    if (!playing() || !c.onGround || c.state !== 'normal' || !controls.precise ||
        (controls.motionScale >= .99 && !controls.reversing)) return false;
    // Respect the reduced target immediately through braking, instead of the
    // normal momentum-preservation path that carries a runner past a corner.
    const dx = x * target - c.vel.x, dz = z * target - c.vel.z;
    const difference = Math.hypot(dx, dz);
    const braking = Math.hypot(c.vel.x, c.vel.z) > target || magnitude === 0;
    const amount = Math.min(1, (braking ? Math.max(32, game.U.groundBrake) : game.U.groundAccel) * dt / (difference || 1));
    c.vel.x += dx * amount; c.vel.z += dz * amount;
    return true;
  }
  function look(yawDelta, pitchDelta) {
    if (!playing()) return false;
    view.yaw = angle(view.yaw - yawDelta);
    view.pitch = clamp(view.pitch - pitchDelta, -1.35, 1.35);
    if (Math.abs(yawDelta) + Math.abs(pitchDelta) > .00001) {
      manual = true; manualTouch = coarse() || touch.on || touch.lookId !== null;
      manualUntil = performance.now() + 1100;
    }
    return true;
  }
  function frame(dt) {
    if (!enabled() || ['menu', 'replay'].includes(game.modeRef())) return null;
    if (!playing()) { direct = false; fromAction = false; gestureId = null; return view; }
    if (dt <= 0) return view;
    const held = mouseHeld || touch.lookId !== null;
    // On touch, looking is deliberate: hold that view until the next left
    // gesture. Do not spring back on a hidden timer while the same thumb runs.
    if (manual && (manualTouch || held || performance.now() < manualUntil || lastInput < .08)) return view;
    manual = false;
    let targetYaw = c.yaw;
    let targetPitch = c.state === 'ledge' ? -.24 : c.onGround ? -.09 : -.16;
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
  // Plain names for the two control types (the cards in control-style.js use the same words).
  const NAMES = coarse()
    ? { before: 'FPS操作（右側をドラッグして視点を回す）', after: 'かんたん操作（左で移動・カメラおまかせ）' }
    : { before: 'マウス視点（WASD＋マウス・従来）', after: '自動カメラ（W/S 前後・A/D 旋回）' };
  function syncUI() {
    document.body.dataset.skyCameraMode = mode;
    for (const select of selectors) select.value = mode;
    for (const note of document.querySelectorAll('.follow-camera-help')) {
      note.textContent = mode === 'before'
        ? (coarse() ? '左スティックで移動、右側のドラッグで視点を自分で回します。' : 'WASDで移動、マウスで視点を回します。')
        : coarse()
          ? '左側に指を置き、進みたい方向へずらして押したまま。離すと止まります。カメラは進む向きへ追従。右側で見回した後は、左の指を離して進む向きを選び直せます。'
          : 'W/S：前後、A/D：減速して曲がる、Alt＋A/D：横移動。マウスで見回せます。';
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
    group.setAttribute('aria-label', home ? 'プレイ前の操作タイプ' : '操作タイプ');
    group.innerHTML = `${home ? '' : '<h4>操作タイプ</h4>'}<label for="${id}">操作タイプ</label><select id="${id}" aria-label="操作タイプ"><option value="before">${NAMES.before}</option><option value="after">${NAMES.after}</option></select><p class="note follow-camera-help"></p>`;
    const select = group.querySelector('select'); selectors.push(select);
    select.addEventListener('change', () => setMode(select.value));
    for (const name of ['pointerdown', 'pointerup', 'touchstart', 'touchend']) group.addEventListener(name, event => event.stopPropagation());
    return group;
  }
  window.skyFollowCamera = {
    input, step, speed, move, look, frame, reset, setMode,
    holdLook(held) { mouseHeld = held; },
    get active() { return enabled(); },
    get mode() { return mode; },
    get touchDevice() { return coarse(); },
    get view() { return enabled() ? view : c; },
    get state() { return { mode, yaw: view.yaw, pitch: view.pitch, heading: c.yaw, manual, moving: lastInput, gesture }; },
  };
  document.getElementById('humanStatus')?.after(control('cameraModeHome', true));
  document.getElementById('setGrid').prepend(control('cameraMode', false));
  document.getElementById('bReset').addEventListener('click', () => setMode(defaultMode()));
  window.addEventListener('blur', reset);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
  syncUI();
})();
