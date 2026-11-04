// Tension music and run-end stingers. All synthesized: no download weight.
//
// Before this the BGM was one quiet drone with a heartbeat pulse every 0.95 s whatever happened, and the end of a run
// (escaped, caught, fell) had no sound of its own. Now:
//   threat    0..1, from the living zombies within 18 m of the player (closer counts more), smoothed: it rises in
//             about 0.3 s and falls in about 1.5 s.
//   BGM       the existing pulse in enhancements.js asks window.skyTension.pulse() for its period (0.95 s calm,
//             0.5 s at full threat) and bgmGain() for its level (x1 calm, x1.6 at full threat).
//   pad       a dark minor-second pair of sawtooths through a low-pass whose cut-off opens with the threat.
//   release   when the threat has been high (> 0.6) and falls away (< 0.25), a short airy swell with a rising
//             fifth: the "got away" feeling the run is built around. At most once per 12 s.
//   stingers  skyStinger.play(reason) is called by the run-end code: 'time' (escaped) a bright rising chord,
//             'fell' a falling whistle and a thud, anything else (caught) a low hit with a sinking drone.
(() => {
  window.addEventListener('load', () => {
    const game = window.__skyInternals;
    if (!game) return;
    const { c, z, Ut, Jt } = game;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const stats = { release: 0, stingers: {}, peak: 0 };

    // ---------- threat ----------
    const RANGE = 18, SATURATE = 2.5;   // 2.5 zombies' worth of weight is "full"
    let value = 0, high = false, lastRelease = -99;
    const playing = () => game.modeRef() === 'play' && !z.over;
    function rawThreat() {
      let sum = 0;
      for (const e of Jt) {
        if (e.dead || e.remove || e.rise || e.spawnT > 0) continue;
        const d = Math.hypot(e.pos.x - c.pos.x, e.pos.z - c.pos.z);
        if (d < RANGE && Math.abs(e.pos.y - c.pos.y) < 12) sum += Math.pow(1 - d / RANGE, 2) * (e.boss ? 2 : 1);
      }
      return clamp(sum / SATURATE, 0, 1);
    }
    // ---------- audio ----------
    let pad = null;
    function makePad(ctx) {
      const out = ctx.createGain(); out.gain.value = 0;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220; lp.Q.value = 1.2;
      const oscs = [55, 58.3, 82.4].map(f => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(); return o; });
      lp.connect(out); out.connect(Ut.master);
      return { out, lp, oscs };
    }
    function swell(ctx) {
      const t = ctx.currentTime;
      const g = ctx.createGain(); g.gain.setValueAtTime(1e-4, t); g.gain.exponentialRampToValueAtTime(.16, t + .35);
      g.gain.exponentialRampToValueAtTime(1e-4, t + 1.8); g.connect(Ut.master);
      for (const f of [440, 659.3, 880]) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f * .97, t); o.frequency.exponentialRampToValueAtTime(f, t + .5);
        const og = ctx.createGain(); og.gain.value = f === 880 ? .25 : .5; o.connect(og); og.connect(g); o.start(t); o.stop(t + 1.9);
      }
      if (Ut.noise) {
        const n = ctx.createBufferSource(); n.buffer = Ut.noise; n.loop = true;
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = .9; f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(3000, t + 1);
        const ng = ctx.createGain(); ng.gain.setValueAtTime(1e-4, t); ng.gain.exponentialRampToValueAtTime(.5, t + .5); ng.gain.exponentialRampToValueAtTime(1e-4, t + 1.2);
        n.connect(f); f.connect(ng); ng.connect(g); n.start(t, Math.random()); n.stop(t + 1.3);
      }
    }
    function tick(dt) {
      const ctx = Ut?.ctx;
      const live = playing();
      const target = live ? rawThreat() : 0;
      value += (target - value) * (1 - Math.exp(-dt / (target > value ? .3 : 1.5)));
      stats.peak = Math.max(stats.peak, value);
      if (live && value > .6) high = true;
      if (live && high && value < .25) {
        high = false;
        const t = performance.now() / 1000;
        if (t - lastRelease > 12 && ctx && Ut.master) { lastRelease = t; stats.release++; try { swell(ctx); } catch {} }
      }
      if (!live) high = false;
      if (ctx && Ut.master) {
        if (live && !pad) { try { pad = makePad(ctx); } catch {} }
        if (pad) {
          const now = ctx.currentTime;
          pad.out.gain.setTargetAtTime(live ? clamp((value - .12) / .88, 0, 1) * .05 : 0, now, .25);
          pad.lp.frequency.setTargetAtTime(220 + 1500 * value * value, now, .25);
        }
      }
    }
    let last = performance.now();
    setInterval(() => { const n = performance.now(); tick(Math.min(.5, (n - last) / 1000)); last = n; }, 200);

    window.skyTension = {
      pulse: () => .95 - .45 * value,
      bgmGain: () => 1 + .6 * value,
      get value() { return value; },
      get high() { return high; },
      tick, rawThreat, stats,
    };

    // ---------- stingers ----------
    const env = (ctx, t, peak, attack, decay, out) => {
      const g = ctx.createGain(); g.gain.setValueAtTime(1e-4, t);
      g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(1e-4, t + attack + decay);
      g.connect(out); return g;
    };
    const osc = (ctx, t, out, { type = 'sine', from, to, dur, peak, attack = .01, filter }) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(from, t);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
      const g = env(ctx, t, peak, attack, dur - attack, out);
      let node = o;
      if (filter) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter; o.connect(f); node = f; }
      node.connect(g); o.start(t); o.stop(t + dur + .05);
    };
    const STINGERS = {
      // escaped: a rising C-major arpeggio over a held chord and a short airy sweep
      time(ctx, t, out) {
        [[261.6, 0], [329.6, .12], [392, .24], [523.3, .36]].forEach(([f, at]) => osc(ctx, t + at, out, { type: 'triangle', from: f, dur: .9, peak: .16, attack: .02 }));
        [261.6, 329.6, 392].forEach(f => osc(ctx, t + .1, out, { type: 'sine', from: f, dur: 2.1, peak: .08, attack: .25 }));
        swell(ctx);
      },
      // fell off the map: a falling whistle, then a thud
      fell(ctx, t, out) {
        osc(ctx, t, out, { type: 'sine', from: 900, to: 180, dur: .9, peak: .14, attack: .03 });
        osc(ctx, t + .85, out, { type: 'sine', from: 90, to: 38, dur: .5, peak: .55, attack: .004 });
      },
      // caught: a low hit and a sinking drone
      caught(ctx, t, out) {
        osc(ctx, t, out, { type: 'sine', from: 80, to: 34, dur: .7, peak: .6, attack: .004 });
        osc(ctx, t + .05, out, { type: 'sawtooth', from: 220, to: 92, dur: 1.6, peak: .12, attack: .05, filter: 420 });
        osc(ctx, t + .05, out, { type: 'sawtooth', from: 233, to: 98, dur: 1.6, peak: .08, attack: .05, filter: 420 });
      },
    };
    window.skyStinger = {
      play(reason) {
        const ctx = Ut?.ctx;
        if (!ctx || !Ut.master) return false;
        const kind = STINGERS[reason] ? reason : 'caught';
        try { STINGERS[kind](ctx, ctx.currentTime, Ut.master); } catch { return false; }
        stats.stingers[kind] = (stats.stingers[kind] || 0) + 1;
        return true;
      },
      kinds: Object.keys(STINGERS),
    };
  });
})();
