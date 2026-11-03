// Bite and shove: a hit grabs the player for a moment, then the player throws the crowd off.
// Before this, a hit only gave 1.3 s of invulnerability and pushed the player 4 m/s, so a
// player pinned by 3+ zombies at 0.5 m lost every life in about 4.4 s (see README 2026-11-03).
// Now, ~0.35 s after the bite lands, zombies within SHOVE.radius are thrown outward and held
// stunned for ~1 s; the player keeps full control the whole time. The body plays a grab ->
// shove -> stagger pose (human-actions.js `bitePose`), the biter clamps onto the player, and the
// whole thing has sound (CC0 recordings, with a synthesized fallback). Also draws the invulnerability cue (blinking body + ground
// ring, or a screen-edge glow when the body is hidden).
(() => {
  window.addEventListener('load', () => {
    const game = window.__skyInternals;
    if (!game) return;
    const { c, z, Tt, Ut } = game;
    const camera = game.Se;
    const { Torus, Mesh, Basic, Vector3 } = game.Geom;
    const stats = window.__game?.stats;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;

    // Zombie stun decays velocity by exp(-3.5 t), so a push of v m/s travels about v / 3.5 m.
    const SHOVE = Object.freeze({
      delay: .9,       // s the player is held (pushing back, being chewed) before the shove
      after: 1.4,      // s of invulnerability left after the shove (thrown zombies stay stunned for 1 s and must walk back)
      radius: 2.5,     // zombies this close (flat distance) are thrown
      push: 9,         // m/s outward, about 2.6 m of travel
      stun: 1,         // s
      bossPush: 4,     // the boss is heavier: smaller push, shorter stun
      bossStun: .5,
      hold: .62,       // m: the biter is pulled this close (just outside the body-collision distance of 0.6 m, which would push the player) and faces the player
      lunge: .2,       // m: the body steps toward the zombie on the shove
      drag: .05,       // m: the body is dragged back while grabbed
      shake: .03,      // m: camera shake amplitude while grabbed
      kick: .12,       // m: camera kick back on the shove
    });
    // Pose timeline (s since the bite landed). The morph frames are parkourBite_000/001/002.
    const ANIM = Object.freeze({ total: SHOVE.delay + .37, in: .07, out: .27, weight: .92 });
    const BLINK_HZ = 7, BLINK_VISIBLE = .65, MAX_SHOWN = 10;
    const dir = new Vector3(), look = new Vector3();
    const smooth01 = x => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
    const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

    // ---------- sound (synthesized; no sample files) ----------
    const panOf = (x, zz) => {
      const dx = x - c.pos.x, dz = zz - c.pos.z, d = Math.hypot(dx, dz) || 1;
      return Math.max(-1, Math.min(1, (dx * Math.cos(c.yaw) - dz * Math.sin(c.yaw)) / d));
    };
    function voice(build, pan = 0, delay = 0) {
      const ctx = Ut?.ctx;
      if (!ctx || !Ut.master) return;
      try {
        const t = ctx.currentTime + delay;
        const out = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
        if (out) { out.pan.value = pan; out.connect(Ut.master); }
        build(ctx, t, out || Ut.master);
      } catch {}
    }
    const env = (ctx, t, peak, attack, hold, decay, out) => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(1e-4, t);
      g.gain.exponentialRampToValueAtTime(peak, t + attack);
      g.gain.setValueAtTime(peak, t + attack + hold);
      g.gain.exponentialRampToValueAtTime(1e-4, t + attack + hold + decay);
      g.connect(out);
      return g;
    };
    function noiseBurst(ctx, t, out, { type = 'bandpass', from, to, q = 1, peak = .4, attack = .004, hold = 0, decay = .12 }) {
      if (!Ut.noise) return;
      const src = ctx.createBufferSource(); src.buffer = Ut.noise; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(from, t);
      if (to) f.frequency.exponentialRampToValueAtTime(to, t + attack + hold + decay);
      const g = env(ctx, t, peak, attack, hold, decay, out);
      src.connect(f).connect(g); src.start(t, Math.random() * .5); src.stop(t + attack + hold + decay + .05);
    }
    function tone(ctx, t, out, { wave = 'sine', from, to, dur, peak, attack = .006, filter, q = 2, vibrato }) {
      const o = ctx.createOscillator(); o.type = wave;
      o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(to, t + dur);
      let node = o;
      if (vibrato) {
        const l = ctx.createOscillator(), d = ctx.createGain(); l.frequency.value = vibrato.hz; d.gain.value = vibrato.depth;
        l.connect(d).connect(o.frequency); l.start(t); l.stop(t + dur + .05);
      }
      if (filter) { const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = filter; f.Q.value = q; node = o.connect(f); }
      // A bandpass keeps only a few harmonics of the sawtooth (about 0.13 of its amplitude), so make the level back up.
      const g = env(ctx, t, peak * (filter ? 6 : 1), attack, 0, dur - attack, out);
      node.connect(g); o.start(t); o.stop(t + dur + .05);
    }
    // ---------- recorded sounds (CC0, OpenGameArt; see assets/sfx/bite/CREDITS.md) ----------
    // A few KB of mono MP3. Until they have loaded (or if they fail), the synthesized versions below play instead.
    const BANK = { bite: ['bite-1', 'bite-2'], snarl: ['snarl-1', 'snarl-2', 'snarl-3'], thump: ['thump'],
      whoosh: ['whoosh-1', 'whoosh-2'], grunt: ['grunt-1', 'grunt-2'], groan: ['groan-1', 'groan-2'],
      chew: ['chew-1', 'chew-2', 'chew-3', 'chew-4'] };
    const BANK_VERSION = '20261103-bite-v4';
    const bank = {};
    let bankLoading = null;
    function loadBank() {
      const ctx = Ut?.ctx;
      if (!ctx) return Promise.resolve(false);
      if (bankLoading) return bankLoading;
      const loadOne = name => fetch(`./assets/sfx/bite/${name}.mp3?v=${BANK_VERSION}`)
        .then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status))))
        .then(ab => new Promise((ok, no) => ctx.decodeAudioData(ab, ok, no)))
        .catch(() => null);
      bankLoading = Promise.all(Object.entries(BANK).map(async ([kind, names]) => {
        bank[kind] = (await Promise.all(names.map(loadOne))).filter(Boolean);
      })).then(() => Object.values(bank).every(list => list.length > 0)).catch(() => false);
      return bankLoading;
    }
    document.getElementById('bStart')?.addEventListener('click', () => { loadBank(); });
    // Plays one random take of a kind; returns false if that kind is not loaded (the caller then synthesizes).
    function play(kind, { gain = 1, pan = 0, delay = 0, rate = 1 } = {}) {
      const list = bank[kind];
      if (!list?.length || !Ut?.ctx || !Ut.master) return false;
      voice((ctx, t, out) => {
        const src = ctx.createBufferSource(), g = ctx.createGain();
        src.buffer = list[(Math.random() * list.length) | 0];
        src.playbackRate.value = rate * (1 + (Math.random() - .5) * .1);
        g.gain.value = gain;
        src.connect(g).connect(out); src.start(t);
      }, pan, delay);
      return true;
    }
    const lowThump = (gain = 1, delay = 0) => voice((ctx, t, out) => tone(ctx, t, out, { from: 120, to: 42, dur: .22, peak: .55 * gain }), 0, delay);

    // Chewing times (s after the bite lands): evenly spread over the hold, the last one just before the shove.
    const CHEWS = [.16, .34, .52, .70];
    const wetChomp = (pan, at) => voice((ctx, t, out) => {
      noiseBurst(ctx, t, out, { from: 1300, q: 1.2, peak: .3, decay: .1 });
      noiseBurst(ctx, t + .05, out, { from: 800, q: 1, peak: .2, decay: .09 });
    }, pan, at);
    // Teeth and flesh, a body thump, the zombie's snarl and the player's grunt.
    function biteSound(zombie) {
      const pan = zombie ? panOf(zombie.pos.x, zombie.pos.z) : 0;
      if (!Ut?.ctx) return;
      loadBank();
      if (bank.bite?.length && bank.snarl?.length) {
        play('bite', { gain: .6, pan });
        play('snarl', { gain: .5, pan, delay: .03 });
        play('grunt', { gain: .4, delay: .07, rate: .95 });
        lowThump(.8);
        // Held and chewed: wet chomps for as long as the hold lasts, a second snarl and the player's strain.
        CHEWS.forEach((at, i) => { if (!play('chew', { gain: .5 - .04 * i, pan, delay: at })) wetChomp(pan, at); });
        play('snarl', { gain: .35, pan, delay: .5, rate: .9 });
        play('grunt', { gain: .3, delay: .55, rate: 1.05 });
        return;
      }
      voice((ctx, t, out) => {
        noiseBurst(ctx, t, out, { from: 1700, q: 1.3, peak: .5, decay: .13 });
        noiseBurst(ctx, t + .09, out, { from: 1100, q: 1.1, peak: .32, decay: .1 });
        noiseBurst(ctx, t, out, { type: 'highpass', from: 3500, q: .7, peak: .1, attack: .03, decay: .22 });
        tone(ctx, t, out, { from: 110, to: 45, dur: .17, peak: .5 });
      }, pan);
      voice((ctx, t, out) => {
        tone(ctx, t + .02, out, { wave: 'sawtooth', from: 150, to: 92, dur: .5, peak: .34, attack: .05, filter: 900, q: 2.5, vibrato: { hz: 26, depth: 16 } });
        noiseBurst(ctx, t + .02, out, { from: 1200, to: 700, q: 2, peak: .12, attack: .06, decay: .4 });
      }, pan);
      voice((ctx, t, out) => tone(ctx, t + .03, out, { wave: 'sawtooth', from: 210, to: 125, dur: .2, peak: .3, attack: .02, filter: 750, q: 3 }), 0);
      CHEWS.forEach(at => wetChomp(pan, at));
    }
    // Whoosh of the arms, the chest-high impact, the player's effort and the thrown zombies' grunts.
    function shoveSound(thrownZombies) {
      if (!Ut?.ctx) return;
      loadBank();
      const first = thrownZombies.slice(0, 2);
      if (bank.whoosh?.length && bank.thump?.length) {
        play('whoosh', { gain: .6 });
        play('thump', { gain: .75, delay: .05 });
        lowThump(.7, .05);
        play('grunt', { gain: .4, rate: 1.1 });
        first.forEach((e, i) => { if (!play('groan', { gain: .45, pan: panOf(e.pos.x, e.pos.z), delay: .08 + .09 * i, rate: .95 })) { try { Tt.groan(.4, panOf(e.pos.x, e.pos.z), true); } catch {} } });
        return;
      }
      voice((ctx, t, out) => {
        noiseBurst(ctx, t, out, { from: 400, to: 2600, q: .9, peak: .42, attack: .05, decay: .2 });
        noiseBurst(ctx, t + .05, out, { type: 'lowpass', from: 900, q: .7, peak: .5, attack: .004, decay: .09 });
        tone(ctx, t + .05, out, { from: 130, to: 40, dur: .24, peak: .62 });
      }, 0);
      voice((ctx, t, out) => tone(ctx, t, out, { wave: 'sawtooth', from: 175, to: 118, dur: .19, peak: .32, attack: .02, filter: 850, q: 2.5 }), 0);
      first.forEach(e => { try { Tt.groan(.4, panOf(e.pos.x, e.pos.z), true); } catch {} });
    }

    // ---------- blood: spurts from the bite, a puddle under the player, splatter on the screen ----------
    const { Sphere, Cylinder } = game.Geom;
    const BLOOD = 0x7a0b0e;
    const dropGeometry = new Sphere(.05, 6, 4), dropMaterial = new Basic({ color: BLOOD });
    const drops = Array.from({ length: 110 }, () => {
      const m = new Mesh(dropGeometry, dropMaterial); m.visible = false; game.ue.add(m);
      return { m, life: 0, vx: 0, vy: 0, vz: 0, floor: 0, landed: false };
    });
    let dropCursor = 0;
    const decals = Array.from({ length: 8 }, () => {
      const material = new Basic({ color: BLOOD, transparent: true, opacity: .85, depthWrite: false });
      const m = new Mesh(new Cylinder(1, 1, .012, 14), material); m.visible = false; game.ue.add(m);
      return { m, material, age: 99, life: 0, radius: 0 };
    });
    let decalCursor = 0;
    const rnd = (a, b) => a + Math.random() * (b - a);
    const away = new Vector3();

    // Blood leaves the neck / shoulder where the zombie's mouth is, mostly away from the zombie and up.
    function spurt(count, power = 1) {
      biteDirection(anim?.zombie, away);
      for (let i = 0; i < count; i++) {
        const d = drops[dropCursor = (dropCursor + 1) % drops.length];
        d.m.position.set(c.pos.x + away.x * .2 + rnd(-.08, .08), c.pos.y + rnd(1.25, 1.5), c.pos.z + away.z * .2 + rnd(-.08, .08));
        d.vx = -away.x * rnd(.6, 2.6) * power + rnd(-1.2, 1.2); d.vz = -away.z * rnd(.6, 2.6) * power + rnd(-1.2, 1.2);
        d.vy = rnd(1.6, 4.4) * power; d.life = rnd(.7, 1.3); d.floor = c.pos.y + .02; d.landed = false;
        d.m.scale.setScalar(rnd(.8, 2)); d.m.visible = true;
      }
    }
    function puddle() {
      const d = decals[decalCursor = (decalCursor + 1) % decals.length];
      d.m.position.set(c.pos.x + rnd(-.45, .45), c.pos.y + .015, c.pos.z + rnd(-.45, .45));
      d.radius = rnd(.3, .7); d.age = 0; d.life = 7; d.m.scale.set(.05, 1, .05); d.m.visible = true; d.material.opacity = .85;
    }
    // On screen (also in first person): blotches that fade over about three seconds.
    const splatLayer = document.createElement('div');
    splatLayer.id = 'bloodSplat';
    splatLayer.style.cssText = 'position:absolute;inset:0;z-index:5;pointer-events:none;overflow:hidden';
    (document.getElementById('app') || document.body).append(splatLayer);
    function splat(count) {
      for (let i = 0; i < count; i++) {
        const blob = document.createElement('div'), size = rnd(16, 34), edge = Math.random() < .7;
        const x = edge ? (Math.random() < .5 ? rnd(-6, 22) : rnd(78, 100)) : rnd(15, 85), y = rnd(-4, 100);
        blob.style.cssText = `position:absolute;left:${x}%;top:${y}%;width:${size}vw;height:${size}vw;margin:${-size / 2}vw 0 0 ${-size / 2}vw;` +
          'border-radius:50%;opacity:.8;transition:opacity 2.8s ease-in;pointer-events:none;' +
          'background:radial-gradient(circle,rgba(125,8,12,.8) 0%,rgba(125,8,12,.55) 38%,rgba(125,8,12,0) 70%)';
        splatLayer.append(blob);
        requestAnimationFrame(() => requestAnimationFrame(() => { blob.style.opacity = '0'; }));
        setTimeout(() => blob.remove(), 3100);
      }
      while (splatLayer.childElementCount > 24) splatLayer.firstChild.remove();
    }
    function updateBlood(dt) {
      for (const d of drops) {
        if (d.life <= 0) continue;
        d.life -= dt;
        if (d.life <= 0) { d.m.visible = false; continue; }
        if (!d.landed) {
          d.vy -= 14 * dt; d.m.position.x += d.vx * dt; d.m.position.y += d.vy * dt; d.m.position.z += d.vz * dt;
          if (d.m.position.y <= d.floor) { d.m.position.y = d.floor; d.landed = true; d.m.scale.set(d.m.scale.x * 1.8, .18, d.m.scale.z * 1.8); d.life = Math.min(d.life, 1.2); }
        }
      }
      for (const d of decals) {
        if (d.age >= d.life) { d.m.visible = false; continue; }
        d.age += dt;
        d.m.scale.set(d.radius * Math.min(1, d.age / .6), 1, d.radius * Math.min(1, d.age / .6));
        d.material.opacity = .85 * Math.min(1, (d.life - d.age) / 2);
      }
    }
    function clearBlood() {
      for (const d of drops) { d.life = 0; d.m.visible = false; }
      for (const d of decals) { d.age = d.life = 99; d.m.visible = false; }
      splatLayer.replaceChildren();
    }

    // ---------- shove ring on the ground ----------
    const ringMaterial = new Basic({ color: 0xcfe8ff, transparent: true, opacity: 0, depthWrite: false });
    const shoveRing = new Mesh(new Torus(1, .05, 6, 40), ringMaterial);
    shoveRing.rotation.x = Math.PI / 2; shoveRing.visible = false;
    game.ue.add(shoveRing);
    let ringAge = 9;

    // ---------- invulnerability cue ----------
    const cueMaterial = new Basic({ color: 0x9fd4ff, transparent: true, opacity: .6, depthWrite: false });
    const cueRing = new Mesh(new Torus(.55, .035, 6, 36), cueMaterial);
    cueRing.rotation.x = Math.PI / 2; cueRing.visible = false;
    game.ue.add(cueRing);

    const edge = document.createElement('div');
    edge.id = 'invulnEdge';
    edge.style.cssText = 'position:absolute;inset:0;z-index:6;pointer-events:none;opacity:0;' +
      'box-shadow:inset 0 0 70px 10px rgba(140,205,255,.55);transition:none';
    (document.getElementById('app') || document.body).append(edge);

    // bite drives the game-side effect (clamp, shove); anim drives the body pose, camera and facing.
    let bite = null, anim = null, lastShove = [];
    let blinkVisible = true, cueOn = false;

    const playing = () => game.modeRef() === 'play' && !z.over;
    const remaining = () => c.invuln - game.ceRef();
    const invulnerable = () => playing() && remaining() > 0 && remaining() < MAX_SHOWN;
    // Computed from the game clock on demand so the human view and the cue agree within a frame.
    const blinkPhaseVisible = () => reducedMotion || ((game.ceRef() * BLINK_HZ) % 1) < BLINK_VISIBLE;

    function biteDirection(zombie, out) {
      if (zombie) out.set(zombie.pos.x - c.pos.x, 0, zombie.pos.z - c.pos.z);
      else out.set(0, 0, 0);
      if (out.lengthSq() < 1e-6) out.set(anim?.dx ?? -Math.sin(c.yaw), 0, anim?.dz ?? -Math.cos(c.yaw));
      return out.normalize();
    }

    // Called from the game's player-hit handler right after the life is lost.
    function onHit(zombie) {
      if (!zombie || zombie.stalker) return false;
      const grounded = !!c.onGround && (c.state === 'normal' || c.state === 'slide');
      bite = { t: 0, zombie, shoved: false, pose: grounded };
      // The hit's 1.3 s of invulnerability must outlast the hold and cover most of the thrown zombies' stun.
      c.invuln = Math.max(c.invuln, game.ceRef() + SHOVE.delay + SHOVE.after);
      // Held: no walking, jumping, sliding, hooking, barrel jumps or shooting until the shove (look and skills still work).
      anim = { t: 0, chew: 0, zombie, grounded, lock: grounded && c.state === 'normal', dx: zombie.pos.x - c.pos.x, dz: zombie.pos.z - c.pos.z };
      // Replay the bite clip on the zombie that landed it; the invulnerability window stops a second hit.
      zombie.atkT = Math.max(zombie.atkT || 0, SHOVE.delay);
      biteSound(zombie);
      spurt(30, 1.3); splat(3); puddle();
      return true;
    }

    function shove() {
      bite.shoved = true;
      let thrown = 0;
      const t = z.t, pushed = [];
      lastShove = [];
      for (const e of game.Jt) {
        const dx = e.pos.x - c.pos.x, dz = e.pos.z - c.pos.z;
        const skip = e.dead ? 'dead' : e.remove ? 'remove' : e.fall ? 'fall' : e.rise ? 'rise' : e.act ? 'act:' + e.act.kind : e.onBeam ? 'beam' : null;
        if (Math.hypot(dx, dz) < SHOVE.radius + 1) lastShove.push({ d: +Math.hypot(dx, dz).toFixed(2), dy: +(e.pos.y - c.pos.y).toFixed(2), skip, biter: e === bite.zombie });
        const near = Math.abs(e.pos.y - c.pos.y) <= 1.8 && dx * dx + dz * dz <= SHOVE.radius * SHOVE.radius;
        // A zombie mid-drop, jump or climb is not interrupted, but it lands stunned instead of biting again.
        if (skip && skip.startsWith('act') && near && !e.boss) { e.stun = Math.max(e.stun || 0, SHOVE.stun); e.atkT = 0; continue; }
        if (skip || !near) continue;
        const d = Math.hypot(dx, dz);
        const nx = d > 1e-3 ? dx / d : -Math.sin(c.yaw), nz = d > 1e-3 ? dz / d : -Math.cos(c.yaw);
        const boss = !!e.boss;
        const push = boss ? SHOVE.bossPush : SHOVE.push;
        e.stun = Math.max(e.stun || 0, boss ? SHOVE.bossStun : SHOVE.stun);
        e.atkT = 0; e.lastHitT = t;   // lastHitT retriggers the knock-back clip
        e.vel.x = nx * push; e.vel.z = nz * push; e.vel.y = Math.max(e.vel.y, 1.2);
        thrown++; pushed.push(e);
      }
      ringAge = 0;
      if (bite.zombie) bite.zombie.biteHold = false;
      shoveSound(pushed);
      if (stats) { stats.shoves = (stats.shoves || 0) + 1; stats.shoved = (stats.shoved || 0) + thrown; }
    }

    // The biter clamps onto the player (pulled to SHOVE.hold, facing them) until the shove.
    function hold(e, dt) {
      if (!e || !bite.pose || e.dead || e.remove || e.fall || e.rise || e.act || e.onBeam) return;
      const dx = e.pos.x - c.pos.x, dz = e.pos.z - c.pos.z, d = Math.hypot(dx, dz);
      if (d > 1.6 || Math.abs(e.pos.y - c.pos.y) > 1) return;
      const nx = d > 1e-3 ? dx / d : -Math.sin(c.yaw), nz = d > 1e-3 ? dz / d : -Math.cos(c.yaw);
      if (d > SHOVE.hold) {
        const move = Math.min(d - SHOVE.hold, 4 * dt);
        const x = e.pos.x - nx * move, zz = e.pos.z - nz * move;
        if (game.oe(x, e.pos.y + .03, zz, e.r || .3, (e.h || 1.8) - .1)) { e.pos.x = x; e.pos.z = zz; }
      }
      e.vel.x = e.vel.z = 0;
      e.yaw = Math.atan2(nx, nz);          // faces the player (the game's yaw = atan2(-toward.x, -toward.z))
      e.atkT = Math.max(e.atkT || 0, .1);  // keep the attack clip playing until the shove
      e.biteHold = true;                   // ...and make it the biting clip, not the scratching one
    }

    function step(dt) {
      if (anim) {
        anim.t += dt;
        // every chew draws more blood
        while (anim.chew < CHEWS.length && anim.t >= CHEWS[anim.chew] && !bite?.shoved) { spurt(12, 1); splat(1); if (anim.chew % 2) puddle(); anim.chew++; }
        if (anim.t >= ANIM.total || !playing()) anim = null;
      }
      if (!bite) return;
      if (!playing()) { if (bite.zombie) bite.zombie.biteHold = false; bite = null; return; }
      bite.t += dt;
      if (!bite.shoved) hold(bite.zombie, dt);
      if (!bite.shoved && bite.t >= SHOVE.delay) shove();
      if (bite.shoved) bite = null;
    }

    // Overall pose weight: fades in fast, fades out over the last ANIM.out seconds.
    const poseWeight = () => anim && anim.grounded
      ? ANIM.weight * Math.min(smooth01(anim.t / ANIM.in), 1 - smooth01((anim.t - (ANIM.total - ANIM.out)) / ANIM.out)) : 0;

    // Morph-target weights for the human view: while held the body rocks between the two "holding it off" poses
    // (parkourBite_000 / _002); at the shove it cross-fades to the shove pose (_001) and then relaxes.
    function poseTargets() {
      const weight = poseWeight();
      if (weight < .001) return null;
      const t = anim.t, d = SHOVE.delay;
      const held = 1 - smooth01((t - (d - .04)) / .08);
      const rock = reducedMotion ? 0 : .5 + .5 * Math.sin(t * 15);   // about 2.4 push-and-twist cycles per second
      return { weight, targets: { parkourBite_000: held * (1 - rock), parkourBite_001: 1 - held, parkourBite_002: held * rock } };
    }

    // Visual cues run on the display frame so they also clear when the game pauses or ends.
    let lastFrame = performance.now();
    function frame(nowMs) {
      const dt = Math.min(.1, (nowMs - lastFrame) / 1000); lastFrame = nowMs;
      if (ringAge < .4) {
        ringAge += dt;
        const k = Math.min(1, ringAge / .4);
        shoveRing.visible = true;
        shoveRing.position.set(c.pos.x, c.pos.y + .08, c.pos.z);
        shoveRing.scale.setScalar(.5 + (SHOVE.radius + .8) * Math.sqrt(k));
        ringMaterial.opacity = .85 * (1 - k);
      } else shoveRing.visible = false;
      const mode = game.modeRef();
      if (mode === 'menu' || mode === 'replay') clearBlood(); else if (mode !== 'pause') updateBlood(dt);
      cueOn = invulnerable();
      const now = game.ceRef();
      blinkVisible = blinkPhaseVisible();
      cueRing.visible = cueOn;
      if (cueOn) {
        cueRing.position.set(c.pos.x, c.pos.y + .06, c.pos.z);
        cueMaterial.opacity = .35 + .35 * (.5 + .5 * Math.sin(now * 14));
      }
      const bodyHidden = document.body.dataset.skyHumanView !== 'third';
      edge.style.opacity = cueOn && bodyHidden ? String(blinkVisible ? .9 : .25) : '0';
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    // Called by the human view each frame after the body pose and camera are set.
    function body(holder, shown) {
      if (!anim) return;
      const grab = anim.t < SHOVE.delay ? smooth01(anim.t / .12) : 0;                          // held: 0 -> 1 fast
      const f = anim.t < SHOVE.delay ? 0 : Math.max(0, 1 - (anim.t - SHOVE.delay) / .2);       // shove 1 -> 0
      biteDirection(anim.zombie, dir);
      if (shown && holder && anim.grounded) {
        // Face the biter so the pose reads: the model's +Z points to (dx, dz).
        const w = poseWeight() / ANIM.weight;
        holder.rotation.y += wrap(Math.atan2(dir.x, dir.z) - holder.rotation.y) * w;
        holder.position.addScaledVector(dir, f * SHOVE.lunge - grab * SHOVE.drag * (.6 + .4 * Math.sin(anim.t * 15)));
      }
      if (reducedMotion) return;
      // Camera: shake while grabbed, one kick back on the shove.
      const shake = SHOVE.shake * grab * (1 - grab * .3);
      camera.position.x += Math.sin(anim.t * 71) * shake;
      camera.position.y += Math.cos(anim.t * 83) * shake;
      if (f > 0) { camera.getWorldDirection(look); camera.position.addScaledVector(look, -SHOVE.kick * f); }
      camera.updateMatrixWorld();
    }

    function reset() { clearBlood(); bite = null; anim = null; ringAge = 9; shoveRing.visible = false; cueRing.visible = false; edge.style.opacity = '0'; }

    // True from the bite until the shove, on the ground only.
    const locked = () => !!anim && anim.lock && !!bite && !bite.shoved && playing();
    // Called by the player step with this frame's controls: movement input and buffered actions are dropped.
    function lockInput(controls) {
      if (!locked()) return;
      controls.fwdIn = controls.strIn = controls.tmag = 0;
      if ('steer' in controls) controls.steer = 0;
      controls.reversing = controls.reversePending = false;
      c.jumpBuf = 0; c.slideBuf = 0; c.crouchPressed = false; c.hookPressed = false; c.hookPick = null; c.zipWish = 0;
    }

    window.skyBite = {
      SHOVE, ANIM, onHit, step, body, reset, poseTargets, lockInput,
      get locked() { return locked(); },
      sounds: { bite: biteSound, shove: shoveSound }, loadBank,   // exposed for the offline audio check
      get bankInfo() { return Object.fromEntries(Object.entries(bank).map(([k, list]) => [k, list.map(b => +b.duration.toFixed(2))])); },
      get bankReady() { return ['bite', 'snarl', 'thump', 'whoosh', 'grunt', 'groan', 'chew'].every(k => bank[k]?.length); },
      get active() { return true; },
      get biting() { return !!anim; },
      get holster() { return !!anim && anim.grounded; },
      get lastShove() { return lastShove; },
      get bloodActive() { return drops.filter(d => d.life > 0).length; },
      get splatCount() { return splatLayer.childElementCount; },
      get blinkOff() { return !anim && !reducedMotion && invulnerable() && !blinkPhaseVisible(); },
      get invulnerable() { return invulnerable(); },
    };
  });
})();
