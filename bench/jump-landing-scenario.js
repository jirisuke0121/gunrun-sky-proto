// Gap-jump takeoff test: run straight at every short roof-to-roof jump link and press jump a set distance before the lip.
(() => {
  const g = __game, c = g.P, s = __skyInternals, U = s.U, N = g.NAV;
  g.S.sendLog = g.S.autoFire = false; c.invuln = Infinity; g.GAME.spawnT = g.GAME.surgeT = Infinity; g.SCR.off = g.PACE.off = g.MARK.off = true;
  for (const z of g.zombies) { s.ue.remove(z.m.root); if (z.pool) s.ue.remove(z.pool); } g.zombies.length = 0;
  const place = (at, yaw = 0) => { g.GAME.t = 0; skySwing.reset(); c.pos.set(...at); c.lastGround.copy(c.pos); c.safe.copy(c.pos); c.vel.set(0, 0, 0); c.state = 'normal'; c.onGround = true; c.h = 1.75; c.eye = 1.62; c.camY = c.pos.y + c.eye; c.yaw = yaw; c.pitch = -.12; c.shake = 0; c.ledge = c.ladder = c.hook = c.zip = c.doorAction = null; c.jumpBuf = c.slideBuf = 0; c.edgeJump = false; c.edgeOff = null; skyFollowCamera.reset(); window.skyFlow?.reset?.(); window.skyLandingRoll?.reset?.(); g.frameOnce(0); };
  const supported = (x, y, z) => !g.freeAt(x, y - .12, z, .1, .1);
  window.gapLinks = (maxLen = 4.3, runup = 3) => { const list = []; for (const e of N.E) { if (e.kind !== 6) continue; const a = N.nodes[e.from], b = N.nodes[e.to], d = Math.hypot(b.x - a.x, b.z - a.z), dy = b.y - a.y; if (d > maxLen || d < (window.GAP_MIN || 0) || dy > .3 || a.y < 2.5) continue; const ux = (b.x - a.x) / d, uz = (b.z - a.z) / d;
      let ok = true; for (let k = 0; k <= runup; k += .5) { const x = a.x - ux * k, z = a.z - uz * k; if (!g.freeAt(x, a.y + .05, z, .32, 1.75) || !supported(x, a.y + .05, z)) { ok = false; break; } }
      // the lip must lie ahead of the take-off node and the far side must be floor
      let lip = null; for (let q = 0; q <= 2.5; q += .05) if (!supported(a.x + ux * q, a.y + .05, a.z + uz * q)) { lip = q; break; }
      if (ok && lip != null) { let gapEnd = null; for (let q = lip; q <= d + 1; q += .05) if (supported(a.x + ux * q, b.y + .05, a.z + uz * q) || supported(a.x + ux * q, a.y + .05, a.z + uz * q)) { gapEnd = q; break; }
        list.push({ from: [a.x, a.y, a.z], to: [b.x, b.y, b.z], d, dy, ux, uz, lip, gap: gapEnd == null ? null : +(gapEnd - lip).toFixed(2) }); } }
    return list; };
  // press: distance before the lip at which jump is pressed. thumb: pushes straight "up" on the stick (screen forward).
  window.runGapJump = (L, press, runup = 3) => { place([L.from[0] - L.ux * runup, L.from[1] + .001, L.from[2] - L.uz * runup], Math.atan2(-L.ux, -L.uz)); const j0 = g.stats.jumps || 0, v0 = g.stats.vaults || 0, m0 = g.stats.mantles || 0, k0 = g.stats.catches || 0; let pressed = false, take = null, landed = false, fell = false, minSpeed = 9, maxAlong = -9, at = null;
    for (let i = 0; i < 200; i++) { Object.assign(s.inputState, { on: true, id: 1, x: 0, y: -1 });
      if (!pressed && c.onGround) { let lip = null; for (let q = 0; q <= 2.6; q += .02) if (!supported(c.pos.x + L.ux * q, c.pos.y + .05, c.pos.z + L.uz * q)) { lip = q; break; } const sp = Math.hypot(c.vel.x, c.vel.z); if (i > 5) minSpeed = Math.min(minSpeed, sp);
        if (lip != null && lip <= press) { pressed = true; c.jumpBuf = U.jumpBuffer; take = { lip: +lip.toFixed(2), speed: +sp.toFixed(2) }; } }
      g.advance(1 / 60); g.cam(1 / 60); skyHumanView.update(1 / 60);
      if (pressed && take.after == null && !c.onGround) take.after = +Math.hypot(c.vel.x, c.vel.z).toFixed(2);
      const along = (c.pos.x - L.from[0]) * L.ux + (c.pos.z - L.from[2]) * L.uz;
      if (pressed && !c.onGround) maxAlong = Math.max(maxAlong, along);
      if (c.state === 'swing' || c.state === 'zip' || c.state === 'ladder') break;
      if (c.pos.y < L.from[1] - 3.4) { fell = true; break; }
      if (pressed && c.onGround && c.state === 'normal' && along > L.lip + .3) { landed = c.pos.y > L.to[1] - .6; fell = !landed; at = +along.toFixed(2); break; } }
    Object.assign(s.inputState, { on: false, id: null, x: 0, y: 0 });
    const far = L.gap == null ? null : L.lip + L.gap; return { landed, fell, pressed, take, at, lipAt: L.lip, why: landed ? 'landed' : c.state === 'swing' || c.state === 'zip' || c.state === 'hook' ? 'grabbed bar/zip' : c.state === 'ladder' ? 'ladder' : !pressed ? 'no press' : far != null && maxAlong < far + .15 ? 'short' : 'past', endY: +c.pos.y.toFixed(1), drop: +(L.to[1] - c.pos.y).toFixed(1), d: L.d, dy: L.dy, gap: L.gap, vault: (g.stats.vaults || 0) - v0, mantle: (g.stats.mantles || 0) - m0, catches: (g.stats.catches || 0) - k0, jumps: (g.stats.jumps || 0) - j0 }; };
})();
