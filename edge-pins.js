// Direction pins at the screen edge (2026-11-14, from a first-time PC playtest):
//  - pursuers that are off screen get a pinpoint arrow (nearest three, red) instead of relying on the soft red edge alone;
//  - when ammo is nearly gone, the nearest landed supply crate gets a pin (cyan/white, never yellow/orange: those are marker colours)
//    and, once the gun is completely empty, a click sound and a short "out of ammo" line.
// It reads state only: scores, pursuit, input and ammunition are untouched.
const game = window.__skyInternals, hud = document.getElementById('hud');
if (game && hud) {
  const { c, Et, U, Tt, Se, Jt } = game;
  const ARROW = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3 28 27 16 21 4 27z"/></svg>';
  const make = (cls, html) => { const el = document.createElement('div'); el.className = 'edge-pin ' + cls; el.hidden = true; if (html) el.innerHTML = html; hud.append(el); return el; };
  const pursuerPins = [make('pursuer', ARROW), make('pursuer', ARROW), make('pursuer', ARROW)];
  const ammoPin = make('ammo', '<span class="edge-pin-arrow">' + ARROW + '</span><b>AMMO</b><i></i>');
  const note = document.createElement('div'); note.id = 'ammoEmptyNote'; note.hidden = true; note.textContent = '弾切れ · 光る武器箱で補給'; hud.append(note);
  const RANGE = 35;
  const alive = e => e && !e.dead && !e.remove && !e.rise && !(e.spawnT > 0);
  const Vec = game.Geom.Vector3, proj = new Vec(), dir = new Vec();
  // Screen position of a world point: on screen -> its own pixel; off screen -> the screen edge in that direction.
  function place(el, x, y, z, margin, bottomMargin = margin) {
    const w = hud.clientWidth, h = hud.clientHeight;
    const f = Se.getWorldDirection(dir), fl = Math.hypot(f.x, f.z) || 1, fx = f.x / fl, fz = f.z / fl;
    const dx = x - Se.position.x, dz = z - Se.position.z;
    const lx = dx * -fz + dz * fx, lz = dx * fx + dz * fz;      // right / ahead in the camera's horizontal frame
    proj.set(x, y, z).project(Se);
    const onScreen = proj.z < 1 && Math.abs(proj.x) < .94 && Math.abs(proj.y) < .9;
    let px, py, angle;
    if (onScreen) { px = (proj.x * .5 + .5) * w; py = (-proj.y * .5 + .5) * h; angle = 0; }
    else {
      let vx = lx, vy = -lz; const len = Math.hypot(vx, vy);
      if (len < 1e-4) { vx = 0; vy = 1; } else { vx /= len; vy /= len; }
      const hx = w / 2 - margin, hy = (vy > 0 ? h / 2 - bottomMargin : h / 2 - margin), t = Math.min(vx ? hx / Math.abs(vx) : Infinity, vy ? hy / Math.abs(vy) : Infinity);
      px = w / 2 + vx * t; py = h / 2 + vy * t; angle = Math.atan2(vy, vx) * 180 / Math.PI + 90;
    }
    el.style.transform = `translate(${px.toFixed(1)}px,${py.toFixed(1)}px) translate(-50%,-50%)`;
    el.style.setProperty('--turn', angle.toFixed(1) + 'deg');
    return onScreen;
  }
  function playing() { return game.modeRef() === 'play' && !game.z.over && !window.skyPracticeMode && !game.z.mission; }
  // Total rounds left, or Infinity with unlimited reserve.
  const finite = () => U.reserveAmmo < 99;
  let nextClick = 0;
  function frame(now) {
    const on = playing();
    if (!on) {
      for (const el of pursuerPins) el.hidden = true;
      ammoPin.hidden = note.hidden = true;
      requestAnimationFrame(frame); return;
    }
    // ---- pursuers: nearest three that are off screen ----
    const near = [];
    for (const e of Jt) {
      if (!alive(e)) continue;
      const d = Math.hypot(e.pos.x - c.pos.x, e.pos.z - c.pos.z);
      if (d < RANGE && Math.abs(e.pos.y - c.pos.y) < 12) near.push({ e, d });
    }
    near.sort((a, b) => a.d - b.d);
    let used = 0;
    for (const { e, d } of near) {
      if (used >= pursuerPins.length) break;
      const el = pursuerPins[used];
      const visible = place(el, e.pos.x, e.pos.y + 1.1, e.pos.z, 46, 130);
      if (visible) continue;                                   // on screen: the zombie itself is the marker
      el.hidden = false; used++;
      el.dataset.tier = d < 6 ? '3' : d < 12 ? '2' : '1';
    }
    for (let i = used; i < pursuerPins.length; i++) pursuerPins[i].hidden = true;
    // ---- ammo: low (one magazine or less in total) or empty ----
    const left = Et.ammo + Math.max(0, Et.reserve || 0);
    const low = U.gunOn && finite() && !game.wpc().jumpGun && left <= Math.max(3, Et.mag || 8);
    const dry = U.gunOn && finite() && Et.ammo <= 0 && (Et.reserve || 0) <= 0 && Et.reloadT <= 0;
    const crates = window.skyWeaponDrops?.crates?.() || [];
    let best = null, bd = Infinity;
    for (const k of crates) { const d = Math.hypot(k.x - c.pos.x, k.z - c.pos.z); if (d < bd) { bd = d; best = k; } }
    if ((low || dry) && best) {
      const visible = place(ammoPin, best.x, best.y + 1.2, best.z, 56, 140);
      ammoPin.hidden = false; ammoPin.classList.toggle('on-screen', visible);
      ammoPin.querySelector('i').textContent = Math.round(bd) + 'm';
    } else ammoPin.hidden = true;
    // ---- empty: click + note, only while an enemy is close enough that auto-fire would have fired ----
    note.hidden = !dry;
    if (dry && near.length && near[0].d < 22 && now >= nextClick) { nextClick = now + 1100; try { Tt.empty(); } catch {} }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.skyEdgePins = { pursuerPins, ammoPin, note };
}
