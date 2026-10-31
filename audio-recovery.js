// Resume the existing graph: replacing the context would strand cached music,
// wind and equipment nodes. Never change the player's volume to recover audio.
export function installAudioRecovery(game, win = window, doc = document) {
  const audio = game.Ut;
  let observed = null, pending = null, retry = null, disposed = false;
  const stats = { attempts: 0, failures: 0, state: 'uninitialized', reason: null };
  const visible = () => !doc.hidden;
  function observe(ctx) {
    if (ctx === observed) return;
    observed?.removeEventListener?.('statechange', stateChanged);
    observed = ctx;
    ctx.addEventListener?.('statechange', stateChanged);
  }
  function stateChanged() {
    stats.state = observed.state;
    if (visible() && stats.state === 'interrupted') scheduleRetry();
  }
  function resume(reason = 'start', gesture = false) {
    const ctx = audio.ctx;
    if (disposed || !ctx) return;
    observe(ctx);
    stats.state = ctx.state;
    if (!visible() || !['suspended', 'interrupted'].includes(ctx.state)) return;
    // A foreground resume can remain pending until user activation on Safari.
    // A real input must be allowed to retry it synchronously inside its handler.
    if (!gesture && pending?.ctx === ctx && Date.now() - pending.at < 1500) return;
    const attempt = { ctx, at: Date.now() };
    pending = attempt;
    stats.attempts++;
    stats.reason = reason;
    const failed = () => { stats.failures++; };
    const finished = () => {
      if (pending === attempt) pending = null;
      stats.state = audio.ctx?.state || 'uninitialized';
    };
    try { Promise.resolve(ctx.resume()).catch(failed).then(finished); }
    catch { failed(); finished(); }
  }
  function scheduleRetry() {
    if (retry !== null) win.clearTimeout(retry);
    retry = win.setTimeout(() => { retry = null; resume('foreground-retry'); }, 300);
  }
  function foreground(event) {
    if (!visible()) {
      if (retry !== null) win.clearTimeout(retry);
      retry = null;
      return;
    }
    resume(event.type);
    scheduleRetry();
  }
  function input(event) {
    if (event.isTrusted) resume(event.type, true);
  }
  const inputs = ['pointerdown', 'touchend', 'click', 'keydown'];
  const options = { capture: true, passive: true };
  for (const name of inputs) doc.addEventListener(name, input, options);
  doc.addEventListener('visibilitychange', foreground);
  win.addEventListener('pageshow', foreground);
  win.addEventListener('focus', foreground);
  resume('install');
  return { resume, stats, dispose() {
    disposed = true;
    if (retry !== null) win.clearTimeout(retry);
    observed?.removeEventListener?.('statechange', stateChanged);
    for (const name of inputs) doc.removeEventListener(name, input, options);
    doc.removeEventListener('visibilitychange', foreground);
    win.removeEventListener('pageshow', foreground);
    win.removeEventListener('focus', foreground);
  } };
}

if (typeof window !== 'undefined' && window.__skyInternals) {
  window.skyAudioRecovery = installAudioRecovery(window.__skyInternals);
}
