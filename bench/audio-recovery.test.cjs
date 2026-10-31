const assert = require('node:assert/strict');
(async () => {
  const { installAudioRecovery } = await import('../audio-recovery.js');
  class Events {
    listeners = new Map();
    addEventListener(n, f) { if (!this.listeners.has(n)) this.listeners.set(n, new Set()); this.listeners.get(n).add(f); }
    removeEventListener(n, f) { this.listeners.get(n)?.delete(f); }
    emit(type, isTrusted = false) { for (const f of this.listeners.get(type) || []) f({ type, isTrusted }); }
  }
  const doc = new Events(), win = new Events(), timers = new Map(); let serial = 0;
  win.setTimeout = f => { timers.set(++serial, f); return serial; };
  win.clearTimeout = n => timers.delete(n);
  const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
  const later = () => { const fs = [...timers.values()]; timers.clear(); fs.forEach(f => f()); };
  const ctx = new Events(); ctx.state = 'suspended'; let calls = 0;
  const normal = () => { calls++; ctx.state = 'running'; ctx.emit('statechange'); return Promise.resolve(); };
  ctx.resume = normal;
  const game = { U: { volume: .35 }, Ut: { ctx: null, master: { gain: { value: .35 } }, noise: {} } };
  const r = installAudioRecovery(game, win, doc);
  doc.emit('click', true); assert.equal(calls, 0, 'opening the menu does not create an audio context');
  game.Ut.ctx = ctx; r.resume(); await flush(); assert.equal(ctx.state, 'running');
  const graph = { ...game.Ut };
  for (const state of ['suspended', 'interrupted']) {
    for (const trigger of ['visibilitychange', 'pageshow', 'focus', 'pointerdown', 'touchend', 'click', 'keydown']) {
      ctx.state = state; const before = calls;
      (['focus', 'pageshow'].includes(trigger) ? win : doc).emit(trigger, true);
      await flush(); assert.equal(calls, before + 1, state + ' / ' + trigger); assert.equal(ctx.state, 'running');
      later(); await flush(); assert.equal(calls, before + 1, 'no duplicate loops/resumes while running');
    }
  }
  ctx.state = 'interrupted'; doc.hidden = true;
  doc.emit('visibilitychange'); doc.emit('click', true); ctx.emit('statechange'); later();
  const hiddenCalls = calls; assert.equal(ctx.state, 'interrupted');
  doc.hidden = false; doc.emit('visibilitychange'); await flush(); assert.equal(calls, hiddenCalls + 1);
  // A browser can reject recovery or leave its promise pending until activation.
  ctx.state = 'interrupted'; ctx.resume = () => { calls++; return Promise.reject(Error('blocked')); };
  win.emit('focus'); await flush(); assert.equal(r.stats.failures, 1);
  ctx.resume = normal; doc.emit('keydown', true); await flush(); assert.equal(ctx.state, 'running');
  ctx.state = 'suspended'; ctx.resume = () => { calls++; return new Promise(() => {}); };
  win.emit('focus'); const pendingCalls = calls;
  doc.emit('click', false); assert.equal(calls, pendingCalls, 'synthetic input cannot unlock audio');
  ctx.resume = normal; doc.emit('touchend', true); await flush();
  assert.equal(calls, pendingCalls + 1, 'trusted touch retries even when foreground resume never settles');
  assert.equal(ctx.state, 'running');
  for (const volume of [0, .35]) {
    game.U.volume = game.Ut.master.gain.value = volume;
    ctx.state = 'interrupted'; doc.emit('pointerdown', true); await flush();
    assert.equal(game.U.volume, volume); assert.equal(game.Ut.master.gain.value, volume);
    assert.equal(game.Ut.ctx, graph.ctx); assert.equal(game.Ut.noise, graph.noise); assert.equal(game.Ut.master, graph.master);
  }
  ctx.state = 'closed'; const closedCalls = calls; doc.emit('click', true); assert.equal(calls, closedCalls);
  ctx.state = 'interrupted'; ctx.resume = () => { throw Error('sync failure'); }; doc.emit('click', true);
  assert.equal(r.stats.failures, 2);
  r.dispose(); ctx.resume = normal; doc.emit('click', true); win.emit('focus'); later(); assert.equal(ctx.state, 'interrupted');
  console.log('PASS interrupted/suspended, foreground/input, hidden, rejection/hung promise, preserved graph/volume/mute, cleanup');
})().catch(e => { console.error(e); process.exitCode = 1; });
