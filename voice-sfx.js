// Presence pass: recorded voices, impacts and tired breathing on top of the synthesized sounds.
// Before this, a zombie dying made a sine "thud", a jump made a puff of noise, the player never made a sound
// when landing or hurt (outside a bite), bullets that hit the world were silent.
// Every sound here is a CC0 recording (assets/sfx/voice/CREDITS.md, about 225 KB in all). Until a take has loaded
// (or if it fails) the original synthesized sound plays instead, so nothing goes silent.
//
// What this adds, and where it hooks in:
//   player:  spent-casing tick after each shot (Tt.hg), jump / hard landing effort (Tt.jump, Tt.land), pain when hurt (Tt.hurt; during a bite a second pain
//            cry half-way through the chewing), tired breathing + a red screen
//            edge pulsing with the BGM heartbeat on the last life
//   zombies: death cry (skyVoice.death, called from the zombie's die()), pain grunt + flesh impact on every bullet hit (__gunFx.hit), idle groan
//            (Tt.groan), effort when it leaps / drops / climbs (startAct), roar layer (Tt.roar), body fall
//            (Tt.thud), faint far-away groans so the town is never silent
//            (2026-11-05) zombie footsteps (Tt.zstep), HG reload + dry-fire click (Tt.reload, Tt.empty), a gun kill
//            throws the body (see deathFling)
//   world:   bullet impact tick on metal / wood (called from the shot code as skyVoice.impact), crows and
//            creaks every so often (no siren)
//   feel:    a 30 ms hit-stop on a gun kill close to the player (the same __stopT the headshot kill uses)
// Zombie sounds are placed in space: pan from the camera yaw, volume and brightness fall with distance, and a
// sound whose line to the player is blocked by a building is quieter and muffled.
(() => {
  window.addEventListener('load', () => {
    const game = window.__skyInternals;
    if (!game) return;
    const { c, z, Tt, Ut } = game;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const rand = (a, b) => a + Math.random() * (b - a);
    const now = () => performance.now() / 1000;

    // ---------- recorded takes ----------
    const names = (stem, n) => Array.from({ length: n }, (_, i) => `${stem}-${i + 1}`);
    const BANK = {
      jump: names('jump', 4), land: names('land', 2), hurt: names('hurt', 3),
      zdie: names('zdie', 5), zhit: names('zhit', 5), zgroan: names('zgroan', 4), zalert: names('zalert', 3), zroar: ['zroar'],
      flesh: names('flesh', 3), imp: names('imp', 5), impw: names('impw', 3), breath: ['breath'],
      zstep: names('zstep', 6), reload: names('reload', 1), click: names('click', 1),
      crow: names('crow', 2), creak: names('creak', 3),
    };
    const BANK_VERSION = '20261105-voice-v3';
    const bank = {};
    let bankLoading = null;
    function loadBank() {
      const ctx = Ut?.ctx;
      if (!ctx) return Promise.resolve(false);
      if (bankLoading) return bankLoading;
      const loadOne = name => fetch(`./assets/sfx/voice/${name}.mp3?v=${BANK_VERSION}`)
        .then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status))))
        .then(ab => new Promise((ok, no) => ctx.decodeAudioData(ab, ok, no)))
        .catch(() => null);
      bankLoading = Promise.all(Object.entries(BANK).map(async ([kind, list]) => {
        bank[kind] = (await Promise.all(list.map(loadOne))).filter(Boolean);
      })).then(() => Object.values(bank).every(list => list.length > 0)).catch(() => false);
      return bankLoading;
    }
    document.getElementById('bStart')?.addEventListener('click', () => { loadBank(); });
    const ready = kind => !!bank[kind]?.length;

    // Plays one random take of a kind. Returns the running voice ({ src, gain }) or null if the kind is not loaded
    // (the caller then falls back to the synthesized sound).
    function play(kind, { gain = 1, pan = 0, delay = 0, rate = 1, lp = 0 } = {}) {
      const ctx = Ut?.ctx;
      if (!ctx || !Ut.master) return null;
      if (!bankLoading) loadBank();
      const list = bank[kind];
      if (!list?.length) return null;
      try {
        const t = ctx.currentTime + delay;
        const src = ctx.createBufferSource(), g = ctx.createGain();
        src.buffer = list[(Math.random() * list.length) | 0];
        src.playbackRate.value = rate;
        g.gain.value = gain;
        let node = src.connect(g);
        if (lp > 0) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; node = node.connect(f); }
        if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); node = node.connect(p); }
        node.connect(Ut.master);
        src.start(t);
        stats.played[kind] = (stats.played[kind] || 0) + 1;
        return { src, gain: g };
      } catch { return null; }
    }
    const stats = { played: {}, occluded: 0, hitStops: 0 };

    // ---------- placing a sound in the world ----------
    const panOf = (x, zz) => {
      const dx = x - c.pos.x, dz = zz - c.pos.z, d = Math.hypot(dx, dz) || 1;
      return clamp((dx * Math.cos(c.yaw) - dz * Math.sin(c.yaw)) / d, -1, 1);
    };
    // gain falls as 1 / (1 + d / 8) (0.57 at 8 m, 0.29 at 24 m); brightness falls with distance; a wall in between
    // halves the level and muffles it to 700 Hz.
    function spatial(x, y, zz) {
      const dx = x - c.pos.x, dy = y - (c.pos.y + 1.5), dz = zz - c.pos.z, d = Math.hypot(dx, dy, dz);
      let gain = clamp(1.15 / (1 + d / 8), 0, 1), lp = 9000 / (1 + d / 15), blocked = false;
      if (d > 2 && game.raycast) {
        try {
          const hit = game.raycast(c.pos.x, c.pos.y + 1.5, c.pos.z, dx / d, dy / d, dz / d, d - .3);
          if (hit) { blocked = true; gain *= .55; lp = Math.min(lp, 700); stats.occluded++; }
        } catch {}
      }
      return { d, gain, lp: Math.max(500, lp), pan: panOf(x, zz), blocked };
    }
    const lastAt = {};
    const gate = (key, gap) => { const t = now(); if (t - (lastAt[key] || -9) < gap) return false; lastAt[key] = t; return true; };

    // ---------- player ----------
    const wrap = (name, make) => { const prev = Tt[name]; Tt[name] = make(typeof prev === 'function' ? prev : () => {}); };
    wrap('jump', prev => (...a) => {
      prev(...a);
      // Not every jump: a voice on each one turns into a tic when hopping along a roof line.
      if (gate('jump', .75) && Math.random() < .55) play('jump', { gain: rand(.34, .46), rate: rand(.94, 1.08) });
    });
    wrap('land', prev => (n, ...a) => {
      prev(n, ...a);
      if (n >= .5 && gate('land', .4)) play('land', { gain: .3 + .5 * Math.min(1, n), rate: rand(.92, 1.04) });
    });
    wrap('hurt', prev => (...a) => {
      prev(...a);
      // The bite code decides on the same call whether this is a bite; it already has its own grunt, so only
      // add a second, later cry when the bite is held (the player is being chewed).
      setTimeout(() => {
        if (window.skyBite?.biting) {
          if (window.skyBite.bankReady) setTimeout(() => { if (window.skyBite?.biting) play('hurt', { gain: .5, rate: rand(.95, 1.05) }); }, 430);
        } else play('hurt', { gain: .75, rate: rand(.95, 1.05) });
      }, 0);
    });

    // A spent casing ticking on the ground a moment after the shot (the metal tick, pitched up and quiet).
    wrap('hg', prev => (...a) => {
      prev(...a);
      if (ready('imp') && gate('casing', .12)) play('imp', { gain: rand(.1, .16), pan: rand(-.3, .3), rate: rand(1.9, 2.4), delay: rand(.28, .42), lp: 7000 });
    });

    // ---------- 2026-11-05: zombie steps, reload, dry fire ----------
    // Zombie footsteps: the recorded step replaces the synthesized one (same gain and pan the game passes).
    wrap('zstep', prev => (n, pan, ...a) => {
      if (!ready('zstep')) return prev(n, pan, ...a);
      play('zstep', { gain: clamp(n * 2.4, 0, .9), pan: pan || 0, rate: rand(.92, 1.08), lp: 3200 });
    });
    // HG reload: the recording is cut to 1.1 s to fit the 1.15 s reload. Other weapons keep their own sound.
    wrap('reload', prev => (...a) => {
      let hg = false; try { hg = game.wpc?.().n === 'HG'; } catch {}
      if (hg && ready('reload')) play('reload', { gain: .6, rate: rand(.98, 1.02) }); else prev(...a);
    });
    wrap('empty', prev => (...a) => {
      if (ready('click')) play('click', { gain: .5, rate: rand(.95, 1.05) }); else prev(...a);
    });

    // ---------- zombies ----------
    function deathVoice(zom) {
      if (!zom?.pos) return;
      const sp = spatial(zom.pos.x, zom.pos.y + 1.1, zom.pos.z);
      // Hit-stop: a gun kill close to the player lands with a tiny freeze. Rate-limited so a crowd is not sluggish.
      if (sp.d < 14 && z.t - (zom.gunT || -99) < .3 && gate('stop', .5)) {
        window.__stopT = Math.max(window.__stopT || 0, .03); stats.hitStops++;
      }
      if (sp.d > 50) return;
      // At most three death cries in 0.35 s: more than that is mush.
      const t = now(); deathVoice.times = (deathVoice.times || []).filter(x => t - x < .35);
      if (deathVoice.times.length >= 3) return;
      deathVoice.times.push(t);
      const big = !!(zom.boss || zom.stalker);
      if (big) play('zroar', { gain: Math.min(1, sp.gain * 1.1), pan: sp.pan, rate: .82, lp: sp.lp });
      play('zdie', { gain: sp.gain * .85, pan: sp.pan, rate: big ? .72 : rand(.9, 1.15), lp: sp.lp });
    }
    // (Not hooked through Tt.kill: combat-feedback.js re-wraps Tt.kill every frame and drops its arguments while playing.
    // The die() code calls skyVoice.death(zombie) directly instead.)

    // Bullet hit on a living zombie: flesh impact + a pain grunt, at the hit point.
    function hitVoice(head, pt, zom) {
      if (!zom || zom.dead || !pt || !gate('zhit', .07)) return;
      const t = now(); if (t - (zom._vhit || -9) < .22) return; zom._vhit = t;
      const sp = spatial(pt.x, pt.y, pt.z);
      if (sp.d > 60) return;
      play('flesh', { gain: sp.gain * .65, pan: sp.pan, rate: head ? 1.18 : rand(.92, 1.02), lp: sp.lp });
      play('zhit', { gain: sp.gain * (head ? .7 : .5), pan: sp.pan, rate: head ? rand(1.08, 1.2) : rand(.92, 1.06), lp: sp.lp, delay: .02 });
    }
    // A gun kill throws the body along the shot: 3.8 m/s (about 1.3 m of slide) for a body hit, 6.5 m/s plus a
    // little more lift for a headshot. The dead zombie already slides on its own velocity, with collision.
    function deathFling(head, pt, zom, dir) {
      if (!zom?.dead || zom._flung || !dir || !zom.vel) return;
      zom._flung = true;
      const k = head ? 6.5 : 3.8;
      zom.vel.x += dir.x * k; zom.vel.z += dir.z * k; zom.vel.y = Math.max(zom.vel.y, head ? 3.4 : 2.4);
      stats.flung = (stats.flung || 0) + 1;
    }
    const fx = window.__gunFx;
    if (fx && typeof fx.hit === 'function') {
      const prevHit = fx.hit;
      fx.hit = function (...a) { const r = prevHit.apply(this, a); if (window.__gunFxWarming) return r; try { hitVoice(...a); deathFling(...a); } catch {} return r; };
    }

    // Bullet into the world (the shot code calls this for a hit on a building): a short metal or wood tick.
    function impact(pt) {
      if (!pt || !gate('imp', .05)) return;
      const sp = spatial(pt.x, pt.y, pt.z);
      if (sp.d > 90) return;
      const metal = Math.random() < .6;
      play(metal ? 'imp' : 'impw', { gain: sp.gain * .6, pan: sp.pan, rate: rand(.85, 1.25), lp: sp.lp });
    }

    wrap('groan', prev => (n, pan, close) => {
      const g = clamp(n, 0, 1);
      if (!play('zgroan', { gain: g * (close ? .75 : .6), pan: pan || 0, rate: (close ? .92 : 1) * rand(.9, 1.1), lp: 900 + 5200 * g * g })) prev(n, pan, close);
    });
    wrap('roar', prev => (pan, gain = 1, ...a) => {
      prev(pan, gain, ...a);
      play('zroar', { gain: clamp(gain, 0, 1) * .8, pan: pan || 0, rate: rand(.88, 1) });
    });
    // Landing after being knocked off high ground (the .9 thud; a zombie's own drop and its spawn puff are lighter).
    wrap('thud', prev => (n, pan, ...a) => {
      prev(n, pan, ...a);
      if (n >= .85) play('flesh', { gain: .6 * n, pan: pan || 0, rate: .7, lp: 2500 });
    });

    // Effort cry when a zombie leaps, drops or climbs (not when it rises from the ground at spawn).
    const proto = game.ri?.prototype;
    if (proto && typeof proto.startAct === 'function') {
      const prevAct = proto.startAct;
      proto.startAct = function (...a) {
        const r = prevAct.apply(this, a);
        const zom = this;
        queueMicrotask(() => {
          try {
            if (!zom.act || zom.act.emerge || zom.dead || zom.stalker || Math.random() > .4 || !gate('zact', .12)) return;
            const sp = spatial(zom.pos.x, zom.pos.y + 1.1, zom.pos.z);
            if (sp.d > 28) return;
            const jump = zom.act.kind === 'jumpdown' || zom.act.kind === 'drop' || zom.act.kind === 'leap';
            play(jump ? 'zalert' : 'zgroan', { gain: sp.gain * (jump ? .5 : .4), pan: sp.pan, rate: jump ? rand(.95, 1.1) : rand(1.05, 1.2), lp: sp.lp });
          } catch {}
        });
        return r;
      };
    }

    // ---------- the town is never silent: faint zombie groans far away ----------
    let nextFar = now() + 6;
    // Rarer town sounds, each on its own timer: crows, a creak.
    const town = { crow: now() + rand(14, 30), creak: now() + rand(9, 20) };
    // ---------- last life: tired breathing and a red screen edge pulsing on the 0.95 s period of the BGM's own heartbeat
    // (enhancements.js already thumps a 62 Hz pulse every 0.95 s; a second heartbeat of ours would beat against it) ----------
    const style = document.createElement('style');
    style.textContent = `#lowHpEdge{position:fixed;inset:0;pointer-events:none;z-index:6;opacity:0;transition:opacity .6s;
      box-shadow:inset 0 0 14vmin 3vmin rgba(150,0,0,.6)}
      #lowHpEdge.on{opacity:1;animation:lowHpBeat .95s ease-in-out infinite}
      @keyframes lowHpBeat{0%,100%{opacity:.55}18%{opacity:1}34%{opacity:.6}50%{opacity:.9}}
      @media (prefers-reduced-motion: reduce){#lowHpEdge.on{animation:none;opacity:.8}}`;
    document.head.appendChild(style);
    const edge = document.createElement('div'); edge.id = 'lowHpEdge'; document.body.appendChild(edge);
    let low = false, nextBreath = 0, breathVoice = null;
    const maxLives = () => { try { return window.skyChallenge?.maxLives?.(3) ?? 3; } catch { return 3; } };
    // ---------- chased from behind: a zombie 3.5-13 m away and out of the player's view gets a sharp cue that is not muffled
    // by distance (the normal idle groan is a dull 4-11 s one); closer means more often. Forward is (-sin yaw, -cos yaw). ----------
    function rearCue(t) {
      if (t < (rear.next || 0)) return;
      let best = null, bd = 1e9;
      for (const e of game.Jt) {
        if (e.dead || e.remove || e.rise || e.spawnT > 0) continue;
        const dx = e.pos.x - c.pos.x, dz = e.pos.z - c.pos.z, d = Math.hypot(dx, dz);
        if (d < 3.5 || d > 13 || Math.abs(e.pos.y - c.pos.y) > 10 || d >= bd) continue;
        if ((-Math.sin(c.yaw) * dx - Math.cos(c.yaw) * dz) / d > .1) continue;   // in front: the player can see it
        best = e; bd = d;
      }
      if (!best) { rear.next = t + .4; return; }
      rear.next = t + 1.4 + bd * .18;
      const sp = spatial(best.pos.x, best.pos.y + 1.1, best.pos.z);
      rear.n++; stats.rear = rear.n; rear.flip = !rear.flip;
      play(rear.flip ? 'zalert' : 'zgroan', { gain: clamp(Math.max(sp.gain, .35) * .8, 0, .8), pan: sp.pan, rate: rand(.92, 1.05), lp: Math.max(sp.lp, 2200) });
    }
    const rear = { next: 0, n: 0, flip: false };
    function tick() {
      const t = now(), live = game.modeRef() === 'play' && !z.over;
      if (live && t > nextFar) {
        nextFar = t + rand(8, 18);
        play('zgroan', { gain: rand(.1, .2), pan: rand(-.9, .9), rate: rand(.72, .9), lp: 650 });
      }
      if (live) {
        if (t > town.crow) { town.crow = t + rand(25, 50); play('crow', { gain: rand(.1, .18), pan: rand(-.9, .9), rate: rand(.9, 1.05), lp: 4200 }); }
        if (t > town.creak) { town.creak = t + rand(15, 35); play('creak', { gain: rand(.1, .18), pan: rand(-.9, .9), rate: rand(.85, 1.1), lp: 2600 }); }
      }
      if (live) rearCue(t);
      const wantLow = live && maxLives() >= 2 && c.life === 1;
      if (wantLow !== low) {
        low = wantLow; edge.classList.toggle('on', low);
        if (!low && breathVoice) {
          try { const ctx = Ut.ctx; breathVoice.gain.gain.setTargetAtTime(0, ctx.currentTime, .25); } catch {}
          breathVoice = null;
        }
        nextBreath = t;
      }
      if (!low) return;
      edge.style.animationDuration = (window.skyTension?.pulse?.() ?? .95) + 's';
      if (t >= nextBreath) { nextBreath = t + 2.85; breathVoice = play('breath', { gain: .55, rate: rand(.97, 1.04) }) || breathVoice; }
    }
    setInterval(tick, 120);

    window.skyVoice = {
      loadBank, play, impact, spatial, death: deathVoice, hitVoice,
      stats, BANK, BANK_VERSION,
      get bankReady() { return Object.keys(BANK).every(ready); },
      get bankInfo() { return Object.fromEntries(Object.entries(bank).map(([k, list]) => [k, list.map(b => +b.duration.toFixed(2))])); },
      get lowHealth() { return low; },
    };
  });
})();
