import { renderGearSound } from './gear-audio.js?v=20261026-gear-polish-v1';
// Reuse shipped weapon samples. A separate bus keeps live wind/enemy sounds
// muted and lets pause/seek/close stop every replay voice immediately.
const FILES = ['hg1.wav', 'sg1.wav', 'smgh1.wav', 'mgh1.wav'];
export function createReplayAudio(game) {
  const buffers = new Map(), nodes = new Set();
  let output = null, volume = 0, muted = false, cursor = 0, played = 0, generation = 0;
  function stop() { for (const node of nodes) { try { node.stop(); } catch {} node.disconnect(); } nodes.clear(); }
  function seek(shots, time) { stop(); cursor = 0; while (cursor < shots.length && shots[cursor][0] <= time) cursor++; }
  function gain() { if (output) output.gain.value = muted ? 0 : volume * .65; }
  async function prepare(shots, savedVolume) {
    const token = ++generation;
    stop(); cursor = 0; volume = savedVolume; played = 0;
    game.initAudio?.();
    const ctx = game.Ut.ctx;
    if (!ctx) return;
    if (!output) { output = ctx.createGain(); output.connect(ctx.destination); }
    gain(); ctx.resume().catch(() => {});
    const kinds = new Set(shots.map(row => kind(row[1])));
    await Promise.all([...kinds].map(async index => {
      if (buffers.has(index)) return;
      try {
        if (index === 12) {
          const pcm = renderGearSound('jump', ctx.sampleRate), buffer = ctx.createBuffer(1, pcm.length, ctx.sampleRate);
          buffer.copyToChannel(pcm, 0); buffers.set(index, buffer); return;
        }
        const response = await fetch('./assets/sfx/' + FILES[index] + '?v=20261024-12', { signal: AbortSignal.timeout(8000) });
        if (!response.ok) return;
        const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
        if (token === generation) buffers.set(index, buffer);
      } catch { /* Movement/visual replay remains available if audio fails. */ }
    }));
  }
  // Archived nonstandard weapons use the closest shipped firearm voice.
  const kind = index => index === 12 ? 12 : index === 1 || [5, 9, 10, 11].includes(index) ? 1 : index === 2 || index === 8 ? 2 : index === 3 || index === 6 ? 3 : 0;
  function update(shots, time, playing) {
    if (!playing) { stop(); return; }
    let burst = 0;
    while (cursor < shots.length && shots[cursor][0] <= time) {
      const row = shots[cursor++], buffer = buffers.get(kind(row[1]));
      // Do not dump a backlog after a background tab resumes.
      if (muted || !buffer || time - row[0] > .2 || burst++ >= 4 || !output) continue;
      if (nodes.size >= 12) { const first = nodes.values().next().value; first.stop(); nodes.delete(first); }
      const source = game.Ut.ctx.createBufferSource(); source.buffer = buffer;
      source.connect(output); nodes.add(source);
      source.onended = () => { nodes.delete(source); source.disconnect(); };
      source.start(); played++;
    }
  }
  return { prepare, seek, update, stop, close() { generation++; stop(); if (output) output.gain.value = 0; },
    toggle() { muted = !muted; stop(); gain(); return muted; }, get muted() { return muted; },
    get stats() { return { played, voices: nodes.size, buffers: buffers.size }; } };
}
