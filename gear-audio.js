// Original synthesized equipment sounds. No firearm recording is used here.
export function renderGearSound(kind, sampleRate = 48000) {
  const jump = kind === 'jump';
  if (!jump && kind !== 'flash') throw new Error('Unknown equipment sound');
  const duration = jump ? 0.56 : 0.66, pcm = new Float32Array(Math.ceil(duration * sampleRate));
  let seed = 81473, low = 0, bodyPhase = 0, chargePhase = 0, shimmerPhase = 0;
  for (let i = 0; i < pcm.length; i++) {
    const t = i / sampleRate, attack = Math.min(1, t / 0.003);
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    const noise = (seed >>> 0) / 2147483648 - 1;
    low += (noise - low) * Math.min(1, 2200 / sampleRate);
    bodyPhase += Math.PI * 2 * (jump ? 42 + 115 * Math.exp(-t * 18) : 65 + 160 * Math.exp(-t * 28)) / sampleRate;
    chargePhase += Math.PI * 2 * (jump ? 190 + 760 * Math.exp(-t * 13) : 1450 + 1700 * Math.exp(-t * 26)) / sampleRate;
    shimmerPhase += Math.PI * 2 * (jump ? 125 + 390 * Math.exp(-t * 5) : 2150 - 850 * t) / sampleRate;
    const pressure = low * (jump ? 4 : 2.8) * Math.exp(-t * (jump ? 8 : 18));
    const crack = (noise - low) * Math.exp(-t * (jump ? 55 : 100)) * (jump ? 0.12 : 0.46);
    const body = Math.sin(bodyPhase) * Math.exp(-t * (jump ? 11 : 15)) * 0.65;
    const charge = Math.sin(chargePhase) * Math.exp(-t * (jump ? 10 : 18)) * (jump ? 0.26 : 0.2);
    const tail = Math.sin(shimmerPhase) * Math.exp(-t * 8) * (jump ? 0.1 : 0.14);
    const fade = Math.min(1, (duration - t) / 0.035);
    pcm[i] = Math.tanh((pressure + crack + body + charge + tail) * attack) * 0.88 * fade;
  }
  return pcm;
}
const buffers = new WeakMap();
export function playGearSound(game, kind) {
  const { ctx, master } = game.Ut;
  if (!ctx || !master) return false;
  let sounds = buffers.get(ctx);
  if (!sounds) { sounds = new Map(); buffers.set(ctx, sounds); }
  if (!sounds.has(kind)) {
    const pcm = renderGearSound(kind, ctx.sampleRate), buffer = ctx.createBuffer(1, pcm.length, ctx.sampleRate);
    buffer.copyToChannel(pcm, 0); sounds.set(kind, buffer);
  }
  const source = ctx.createBufferSource(), gain = ctx.createGain();
  source.buffer = sounds.get(kind); gain.gain.value = kind === 'jump' ? 0.8 : 0.65;
  source.connect(gain); gain.connect(master);
  source.onended = () => { source.disconnect(); gain.disconnect(); };
  source.start();
  document.body.dataset.skyGearSound = JSON.stringify({ kind, duration: source.buffer.duration, source: 'original-synthesis' });
  return true;
}
