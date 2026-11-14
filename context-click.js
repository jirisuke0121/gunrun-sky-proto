// Q / right click and E, split by job (2026-11-14, PC playtest: nobody finds the B / C keys):
//   Q or right click = "the move available right now":
//     1. a blast mark (#blastMark) or a jump-pad mark (#padMark) is showing -> blast / pad jump (the B key's job)
//     2. otherwise Q is left to its own handler: the hook (it picks its anchor itself, a mark or not)
//   E = slide, held while E is held (the C key's job). Slide is not on Q: a Q that found nothing to hook used to slide by mistake.
// B and C keep working as hidden fallbacks. The knife is not here: it swings by itself (iM: auto fire on, close enemy in front).
// The gun fires by itself; left click is the manual shot, so E is free.
// Right click sends a Q key press, so Q and right click can never differ.
const game = window.__skyInternals;
if (game) {
  const send = (code, type) => document.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }));
  const markOn = id => document.getElementById(id)?.style.opacity === '1';
  const typing = e => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '');
  let blastTimer = 0, slideHeld = false;
  window.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || game.modeRef() !== 'play' || typing(e)) return;
    if (e.code === 'KeyQ') {
      if (e.repeat) return;
      if (markOn('blastMark') || markOn('padMark')) {
        e.preventDefault(); e.stopImmediatePropagation();
        send('KeyB', 'keydown'); clearTimeout(blastTimer); blastTimer = setTimeout(() => send('KeyB', 'keyup'), 70);   // a tap
      }
      return;                                                                                                        // else: the original Q handler (hook)
    }
    if (e.code === 'KeyE') {
      e.preventDefault(); e.stopImmediatePropagation();
      if (!e.repeat && !slideHeld) { slideHeld = true; send('KeyC', 'keydown'); }
    }
  }, true);
  const releaseSlide = () => { if (slideHeld) { slideHeld = false; send('KeyC', 'keyup'); } };
  window.addEventListener('keyup', e => { if (e.code === 'KeyE') { releaseSlide(); } }, true);
  window.addEventListener('blur', releaseSlide);
  const action = () => {
    if (game.modeRef() !== 'play') return false;
    send('KeyQ', 'keydown'); return true;
  };
  action.release = () => { send('KeyQ', 'keyup'); };
  window.skyContextAction = action;
}
