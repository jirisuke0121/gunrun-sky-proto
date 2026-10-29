// Original hologram sound design: a split/transmission burst and seamless hum.
export function renderDecoySound(kind, rate = 48000) {
  if (!['cast', 'loop'].includes(kind)) throw Error('Unknown decoy sound');
  const loop = kind === 'loop', duration = loop ? 1 : .72;
  const pcm = new Float32Array(Math.round(rate * duration));
  let seed = 1729, phase = 0, low = 0;
  for (let i = 0; i < pcm.length; i++) {
    const t = i / rate;
    if (loop) {
      const pulse = .65 + .35 * Math.cos(2 * Math.PI * 2 * t);
      pcm[i] = pulse * (.095 * Math.sin(2 * Math.PI * 180 * t) + .045 * Math.sin(2 * Math.PI * 360 * t)
        + .025 * Math.sin(2 * Math.PI * 900 * t + 1.5 * Math.sin(2 * Math.PI * 4 * t)));
    } else {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      const noise = (seed >>> 0) / 2147483648 - 1; low += (noise - low) * .16;
      phase += 2 * Math.PI * (160 + 1500 * Math.min(1, t / .25)) / rate;
      const attack = Math.min(1, t / .008), tail = Math.min(1, (duration - t) / .06);
      const sweep = Math.sin(phase) * Math.exp(-t * 5) * .38;
      const split = Math.sin(phase * 1.507) * Math.exp(-Math.max(0, t - .08) * 7) * .18;
      const air = (noise - low) * Math.exp(-t * 9) * .35;
      pcm[i] = Math.tanh((sweep + split + air) * 1.5) * attack * tail;
    }
  }
  return pcm;
}
export function createDecoyAudio(audio) {
  let hum = null;
  const nodes = new Set(), cache = new WeakMap();
  const stats = { casts: 0, loops: 0, stopped: 0 };
  function play(kind, offset = 0) {
    const { ctx, master } = audio;
    if (!ctx || !master) return null;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    let buffers = cache.get(ctx); if (!buffers) { buffers = {}; cache.set(ctx, buffers); }
    if (!buffers[kind]) {
      const pcm = renderDecoySound(kind, ctx.sampleRate), buffer = ctx.createBuffer(1, pcm.length, ctx.sampleRate);
      buffer.copyToChannel(pcm, 0); buffers[kind] = buffer;
    }
    const source = ctx.createBufferSource(), gain = ctx.createGain(), now = ctx.currentTime;
    source.buffer = buffers[kind]; source.loop = kind === 'loop';
    gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(kind === 'loop' ? .85 : .8, now + .035);
    source.connect(gain); gain.connect(master);
    const node = { source, gain, stopping: false }; nodes.add(node);
    source.onended = () => { nodes.delete(node); source.disconnect(); gain.disconnect(); };
    source.start(0, source.loop ? offset % 1 : 0); return node;
  }
  function stop() {
    hum = null;
    for (const node of nodes) {
      if (node.stopping) continue;
      node.stopping = true; const now = audio.ctx.currentTime;
      node.gain.gain.cancelScheduledValues(now); node.gain.gain.setValueAtTime(node.gain.gain.value, now);
      node.gain.gain.linearRampToValueAtTime(0, now + .04); node.source.stop(now + .05); stats.stopped++;
    }
  }
  return { stats, stop,
    start() { stop(); if (play('cast')) stats.casts++; hum = play('loop'); if (hum) stats.loops++; },
    sync(enabled, age = 0) { if (!enabled) { stop(); return; } if (!hum) { hum = play('loop', age); if (hum) stats.loops++; } },
    get active() { return !!hum; }
  };
}
