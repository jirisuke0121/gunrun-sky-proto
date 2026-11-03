// Bite and shove: a hit grabs the player for a moment, then the player throws the crowd off.
// Before this, a hit only gave 1.3 s of invulnerability and pushed the player 4 m/s, so a
// player pinned by 3+ zombies at 0.5 m lost every life in about 4.4 s (see README 2026-11-03).
// Now, ~0.35 s after the bite lands, zombies within SHOVE.radius are thrown outward and held
// stunned for ~1 s; the player keeps full control the whole time. Also draws the
// invulnerability cue (blinking body + ground ring, or a screen-edge glow when the body is hidden).
(() => {
  window.addEventListener('load', () => {
    const game = window.__skyInternals;
    if (!game) return;
    const { c, z, Tt } = game;
    const { Torus, Mesh, Basic, Vector3 } = game.Geom;
    const stats = window.__game?.stats;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;

    // Zombie stun decays velocity by exp(-3.5 t), so a push of v m/s travels about v / 3.5 m.
    const SHOVE = Object.freeze({
      delay: .35,      // bite pose before the shove
      recover: .2,     // lunge pose after the shove
      radius: 2.5,     // zombies this close (flat distance) are thrown
      push: 9,         // m/s outward, about 2.6 m of travel
      stun: 1,         // s
      bossPush: 4,     // the boss is heavier: smaller push, shorter stun
      bossStun: .5,
      lean: .3,        // rad: lean away while bitten, lunge toward the zombie on the shove
    });
    const BLINK_HZ = 7, BLINK_VISIBLE = .65, MAX_SHOWN = 10;
    const yUp = new Vector3(0, 1, 0), dir = new Vector3(), axis = new Vector3();

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

    let bite = null;
    let blinkVisible = true, cueOn = false;

    const playing = () => game.modeRef() === 'play' && !z.over;
    const remaining = () => c.invuln - game.ceRef();
    const invulnerable = () => playing() && remaining() > 0 && remaining() < MAX_SHOWN;
    // Computed from the game clock on demand so the human view and the cue agree within a frame.
    const blinkPhaseVisible = () => reducedMotion || ((game.ceRef() * BLINK_HZ) % 1) < BLINK_VISIBLE;

    function biteDirection(zombie, out) {
      out.set(zombie.pos.x - c.pos.x, 0, zombie.pos.z - c.pos.z);
      if (out.lengthSq() < 1e-6) out.set(-Math.sin(c.yaw), 0, -Math.cos(c.yaw));
      return out.normalize();
    }

    // Called from the game's player-hit handler right after the life is lost.
    function onHit(zombie) {
      if (!zombie || zombie.stalker) return false;
      const grounded = !!c.onGround && (c.state === 'normal' || c.state === 'slide');
      bite = { t: 0, zombie, shoved: false, pose: grounded };
      // Replay the bite clip on the zombie that landed it; the invulnerability window stops a second hit.
      zombie.atkT = Math.max(zombie.atkT || 0, SHOVE.delay);
      return true;
    }

    function shove() {
      bite.shoved = true;
      let thrown = 0;
      const t = z.t;
      for (const e of game.Jt) {
        if (e.dead || e.remove || e.fall || e.rise || e.act || e.onBeam) continue;
        const dx = e.pos.x - c.pos.x, dz = e.pos.z - c.pos.z;
        if (Math.abs(e.pos.y - c.pos.y) > 1.8 || dx * dx + dz * dz > SHOVE.radius * SHOVE.radius) continue;
        const d = Math.hypot(dx, dz);
        const nx = d > 1e-3 ? dx / d : -Math.sin(c.yaw), nz = d > 1e-3 ? dz / d : -Math.cos(c.yaw);
        const boss = !!e.boss;
        const push = boss ? SHOVE.bossPush : SHOVE.push;
        e.stun = Math.max(e.stun || 0, boss ? SHOVE.bossStun : SHOVE.stun);
        e.atkT = 0; e.lastHitT = t;   // lastHitT retriggers the knock-back clip
        e.vel.x = nx * push; e.vel.z = nz * push; e.vel.y = Math.max(e.vel.y, 1.2);
        thrown++;
      }
      ringAge = 0;
      try { Tt.thud(.9, 0); } catch {}
      if (stats) { stats.shoves = (stats.shoves || 0) + 1; stats.shoved = (stats.shoved || 0) + thrown; }
    }

    function step(dt) {
      if (!bite) return;
      if (!playing()) { bite = null; return; }
      bite.t += dt;
      if (!bite.shoved && bite.t >= SHOVE.delay) shove();
      if (bite.t >= SHOVE.delay + SHOVE.recover) bite = null;
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

    // Called by the human view each frame after the body pose is set.
    function body(holder, shown) {
      if (!holder || !shown) return;
      if (!bite || !bite.pose || !bite.zombie) return;
      biteDirection(bite.zombie, dir);
      let angle;
      if (!bite.shoved) angle = -SHOVE.lean * Math.min(1, bite.t / SHOVE.delay);          // dragged back
      else angle = SHOVE.lean * 1.2 * Math.max(0, 1 - (bite.t - SHOVE.delay) / SHOVE.recover); // lunge
      if (!angle) return;
      axis.crossVectors(yUp, dir);
      const q = new holder.quaternion.constructor().setFromAxisAngle(axis, angle);
      holder.quaternion.premultiply(q);
    }

    function reset() { bite = null; ringAge = 9; shoveRing.visible = false; cueRing.visible = false; edge.style.opacity = '0'; }

    window.skyBite = {
      SHOVE, onHit, step, body, reset,
      get active() { return true; },
      get biting() { return !!bite; },
      get blinkOff() { return !bite && !reducedMotion && invulnerable() && !blinkPhaseVisible(); },
      get invulnerable() { return invulnerable(); },
    };
  });
})();
