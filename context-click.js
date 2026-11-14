// Q and right click are one button for "the move that is available right now" (2026-11-14, PC playtest: nobody finds the B / C keys):
//   1. a blast mark (#blastMark) or a jump-pad mark (#padMark) is showing -> blast / pad jump (the B key's job)
//   2. otherwise Q is left to its own handler: the hook (it picks its anchor itself, a mark or not)
//   3. if that found nothing to hook, and you are running on the ground     -> slide (the C key's job, held while Q / the button is held)
// B and C keep working as hidden fallbacks. The knife is not here: it swings by itself (iM: auto fire on, close enemy in front).
// Right click sends a Q key press, so Q and right click can never differ.
const game = window.__skyInternals;
if (game) {
  const { c } = game;
  const SLIDE_GAP = 250;            // ms: Q right after a mark vanished must not become a slide
  let held = null, lastMark = 0;
  const send = (code, type) => document.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }));
  const markOn = id => document.getElementById(id)?.style.opacity === '1';
  const hookMarkOn = () => !!document.getElementById('hookMark')?.classList.contains('on');
  const anyMark = () => markOn('blastMark') || markOn('padMark') || hookMarkOn();
  const watch = () => { if (anyMark()) lastMark = performance.now(); requestAnimationFrame(watch); };
  requestAnimationFrame(watch);
  let qDown = false;
  const canSlide = () => c.state === 'normal' && c.onGround && Math.hypot(c.vel.x, c.vel.z) > 2;
  function release() {
    if (!held) return;
    const code = held; held = null; send(code, 'keyup');
  }
  // The hook handler runs on the next game update. Look again a few frames later: no hook started -> slide.
  function afterHook(frames = 0) {
    if (!qDown || held) return;
    if (c.hookPressed && frames < 6) return requestAnimationFrame(() => afterHook(frames + 1));
    if (c.state !== 'normal' || performance.now() - lastMark < SLIDE_GAP || !canSlide()) return;
    held = 'KeyC'; send('KeyC', 'keydown');
  }
  window.addEventListener('keydown', e => {
    if (e.code !== 'KeyQ' || e.ctrlKey || e.metaKey || game.modeRef() !== 'play' || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) return;
    if (held) { e.preventDefault(); e.stopImmediatePropagation(); return; }   // key repeat while sliding
    if (e.repeat) return;
    qDown = true;
    if (markOn('blastMark') || markOn('padMark')) {
      e.preventDefault(); e.stopImmediatePropagation();
      held = 'KeyB'; send('KeyB', 'keydown'); setTimeout(release, 70);          // a tap
      return;
    }
    requestAnimationFrame(() => afterHook());                                    // the original Q handler (hook) still runs
  }, true);
  window.addEventListener('keyup', e => { if (e.code === 'KeyQ') { qDown = false; release(); } }, true);
  window.addEventListener('blur', () => { qDown = false; release(); });
  const action = () => {
    if (game.modeRef() !== 'play') return false;
    send('KeyQ', 'keydown'); return true;
  };
  action.release = () => { send('KeyQ', 'keyup'); };
  action.markSeen = () => { lastMark = performance.now(); };   // test hook: pretend a mark was showing just now
  window.skyContextAction = action;
}
