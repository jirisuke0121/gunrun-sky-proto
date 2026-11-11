// How many seconds of breathing room does one roof-to-roof jump buy against a pursuer right behind?
(() => {
  const g = __game, c = g.P, s = __skyInternals, U = s.U;
  const clear = () => { for (const z of g.zombies) { s.ue.remove(z.m.root); if (z.pool) s.ue.remove(z.pool); } g.zombies.length = 0; };
  const supported = (x, y, z) => !g.freeAt(x, y - .12, z, .1, .1);
  const place = (at, yaw) => { g.GAME.t = 0; skySwing.reset(); skyEscapeRoutes.reset(); c.pos.set(...at); c.lastGround.copy(c.pos); c.safe.copy(c.pos); c.vel.set(0, 0, 0); c.state = 'normal'; c.onGround = true; c.h = 1.75; c.eye = 1.62; c.camY = c.pos.y + c.eye; c.yaw = yaw; c.pitch = -.12; c.ledge = c.ladder = c.hook = c.zip = c.doorAction = null; c.jumpBuf = c.slideBuf = 0; c.edgeJump = false; c.edgeOff = null; c.setCD = 0; skyFollowCamera.reset(); g.frameOnce(0); };
  const chaser = (x, y, z, mul) => { const e = new g.Zombie(x, y + .003, z); Object.assign(e, { spawnT: 0, onGround: true, flank: false, dropper: false, stalker: false, pz: false, speedMul: mul }); g.zombies.push(e); return e; };
  const step = fwd => { Object.assign(s.inputState, fwd ? { on: true, id: 1, x: 0, y: -1 } : { on: false, id: null, x: 0, y: 0 }); g.advance(1 / 60); g.cam(1 / 60); skyHumanView.update(1 / 60); };
  const near = e => Math.hypot(e.pos.x - c.pos.x, e.pos.z - c.pos.z) < 1.7 && Math.abs(e.pos.y - c.pos.y) < 1.3;
  // Flat chase on a straight street: the pursuer's real pace for a given multiplier.
  window.flatChase = mul => { let best = window.__flat || null; if (!best) { const nodes = g.NAV.nodes.filter(n => n.y < .6 && n.y > -.2); search: for (let k = 0; k < nodes.length; k += 7) { const n = nodes[k]; for (let a = 0; a < 8; a++) { const ux = Math.sin(a * Math.PI / 4), uz = Math.cos(a * Math.PI / 4); let ok = true; for (let q = -6; q <= 22; q += .5) if (!g.freeAt(n.x + ux * q, n.y + .06, n.z + uz * q, .4, 1.75) || !supported(n.x + ux * q, n.y + .06, n.z + uz * q)) { ok = false; break; } if (ok) { best = window.__flat = { o: [n.x, n.y, n.z], ux, uz }; break search; } } } }
    if (!best) return null; const { o, ux, uz } = best; clear(); place([o[0], o[1] + .01, o[2]], Math.atan2(-ux, -uz)); const e = chaser(o[0] - ux * 5, o[1], o[2] - uz * 5, mul); const d = []; let p0 = null;
    for (let i = 0; i < 240; i++) { step(true); const gap = Math.hypot(e.pos.x - c.pos.x, e.pos.z - c.pos.z); if (i === 60) p0 = [e.pos.x, e.pos.z, c.pos.x, c.pos.z]; if (i === 150) { clear(); return { zombie: Math.hypot(e.pos.x - p0[0], e.pos.z - p0[1]) / 1.5, player: Math.hypot(c.pos.x - p0[2], c.pos.z - p0[3]) / 1.5, gap60: d[60], gap180: gap }; } d.push(gap); if (near(e)) { clear(); return { caughtAt: i / 60 }; } }
    clear(); return null; };
  window.chaseJump = (L, mul, lead = 3) => { const runup = 3, zx = L.from[0] - L.ux * (runup + lead), zz = L.from[2] - L.uz * (runup + lead);
    if (!supported(zx, L.from[1] + .05, zz) || !g.freeAt(zx, L.from[1] + .05, zz, .4, 1.75)) return { skip: true };
    clear(); c.invuln = -1; c.life = 5; let life0 = null; window.skyBite?.reset?.(); place([L.from[0] - L.ux * runup, L.from[1] + .001, L.from[2] - L.uz * runup], Math.atan2(-L.ux, -L.uz)); const e = chaser(zx, L.from[1], zz, mul);
    let close = null, pressed = false, landT = null, t = 0, contact = null, minAfter = 99, hold = 0, how = new Set();
    for (let i = 0; i < 60 * 22; i++) { const fwd = landT == null || hold < .5;
      if (!pressed && c.onGround) { let lip = null; for (let q = 0; q <= 2.6; q += .02) if (!supported(c.pos.x + L.ux * q, c.pos.y + .05, c.pos.z + L.uz * q)) { lip = q; break; } if (lip != null && lip <= .25) { pressed = true; c.jumpBuf = U.jumpBuffer; } }
      step(fwd); t += 1 / 60; if (landT != null) hold += 1 / 60;
      if (e.state && typeof e.state === 'string') how.add(e.state); if (e.leap || e.jumpT > 0) how.add('leap'); if (e.climb || e.climbing) how.add('climb');
      if (life0 == null) life0 = c.life; if (c.life < life0 && landT == null) return { caughtBefore: true };
      if (pressed && landT == null && c.onGround && c.state === 'normal') { const along = (c.pos.x - L.from[0]) * L.ux + (c.pos.z - L.from[2]) * L.uz; if (along > L.lip + .3) { if (c.pos.y < L.to[1] - .6) return { missed: true }; landT = t; } }
      if (landT != null) { const d = Math.hypot(e.pos.x - c.pos.x, e.pos.y - c.pos.y, e.pos.z - c.pos.z); minAfter = Math.min(minAfter, d); if (c.life < life0) { contact = t - landT; break; } if (near(e) && close == null) close = t - landT; if (t - landT > 15) break; if (!g.zombies.includes(e) || e.dead || e.hp <= 0) { how.add('lost'); break; } }
      if (landT == null && t > 4) return { missed: true }; }
    const r = { close, respite: contact, never: contact == null, how: [...how], zy: +e.pos.y.toFixed(1) }; clear(); return r; };
  // Time for one pursuer to get from a move's take-off to a player standing at its landing (first real hit).
  window.pursuerTime = (a, b, mul) => { const N = g.NAV, snap = (x, y, z) => { let best = null, bd = 1e9; for (const n of N.nodes) { const d = Math.hypot(n.x - x, n.z - z) + Math.abs(n.y - y) * 2; if (d < bd) { bd = d; best = n; } } return best; };
    const A = snap(...a), B = snap(...b); clear(); place([B.x, B.y + .01, B.z], 0); c.invuln = -1; c.life = 5; const e = chaser(A.x, A.y, A.z, mul); let life = null, t = 0;
    for (let i = 0; i < 60 * 40; i++) { step(false); t += 1 / 60; if (life == null) life = c.life; if (c.life < life) { clear(); return +t.toFixed(1); } if (!g.zombies.includes(e)) break; }
    clear(); return null; };
  window.gimmickMoves = () => { const list = [{ name: 'rope swing (east tower -> south roof)', a: [42, 14.4, -7.5], b: [42, 4.4, 10.4], player: 1.6 }, { name: 'window dive (north-west pad -> corridor)', a: [-18.5, 4.2, -12], b: [-11, 4, -12], player: .7 }, { name: 'tower tunnel (slide top -> west plaza roof)', a: [15, 8, -8], b: [-19, 8, -8], player: 4 }];
    for (const z of g.ZIPS) list.push({ name: 'zip ' + z.a.map(v => v.toFixed(0)).join(',') + ' -> ' + z.b.map(v => v.toFixed(0)).join(','), a: [z.a[0], z.a[1] - 2, z.a[2]], b: [z.b[0], z.b[1] - 2, z.b[2]], player: Math.hypot(z.b[0] - z.a[0], z.b[1] - z.a[1], z.b[2] - z.a[2]) / U.zipSpeed + .6 });
    for (const r of window.skyOldTownSwingCourse?.routes || []) if (r.approach && r.exit) list.push({ name: 'bars ' + r.id, a: r.approach, b: r.exit, player: 3 });
    return list; };
})();
