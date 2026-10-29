// Downhill movement uses the same collision solver as running and flat slides.
export function slopeAt(player, solids) {
  if (!player.onGround) return null;
  let support = null;
  for (const b of solids) {
    if (b.off || b.solid === false || player.pos.x + player.r <= b.minX ||
      player.pos.x - player.r >= b.maxX || player.pos.z + player.r <= b.minZ ||
      player.pos.z - player.r >= b.maxZ || b.maxY > player.pos.y + .03 ||
      b.maxY < player.pos.y - .45) continue;
    if (!support || b.maxY > support.maxY) support = b;
  }
  const slope = support?.slideSlope;
  return slope && slope.grade >= .12 ? slope : null;
}

export function downhillVelocity(vx, vz, slope, gravity, dt, inputX = 0, inputZ = 0, magnitude = 0) {
  const acceleration = gravity * slope.grade / (1 + slope.grade ** 2);
  vx += slope.dx * acceleration * dt;
  vz += slope.dz * acceleration * dt;
  const speed = Math.hypot(vx, vz);
  const turn = magnitude > 0 ? Math.min(.08, dt * 1.4) : 0;
  let x = vx + inputX * speed * turn, z = vz + inputZ * speed * turn;
  // Allow lateral adjustment, but never turn a gravity slide uphill.
  const along = x * slope.dx + z * slope.dz;
  if (along < speed * .35) { x += slope.dx * (speed * .35 - along); z += slope.dz * (speed * .35 - along); }
  const length = Math.hypot(x, z) || 1, next = Math.min(15, Math.max(4.2, speed - .7 * dt));
  return { x: x / length * next, z: z / length * next };
}

export function createSlopeSlide(game, button = document.getElementById('tSlide')) {
  const { c, U } = game;
  let active = false;
  const current = () => slopeAt(c, game.jn);
  const canStart = () => game.modeRef() === 'play' && !game.z.over &&
    c.state === 'normal' && c.slideCD <= 0 && !!current();
  function prepare() {
    if (game.modeRef() !== 'play' || game.z.over) { active = false; return; }
    if (c.state !== 'slide') active = false;
    if (!c.crouchPressed || !canStart() || c.jumpBuf > 0 || c.hookPressed) return;
    const slope = current(), speed = Math.max(4.2, Math.hypot(c.vel.x, c.vel.z));
    c.vel.x = slope.dx * speed; c.vel.z = slope.dz * speed;
    game.startSlide();
    c.vel.x = slope.dx * speed; c.vel.z = slope.dz * speed;
    c.slideBuf = 0; c.crouchPressed = false;
    window.skyLandingRoll?.cancel(); active = true;
  }
  function move(dt, x, z, magnitude) {
    const slope = current();
    if (!slope || c.jumpBuf > 0 || c.hookPressed) {
      if (active) c.slideT = .55; // Short coast on the exit, with retained momentum.
      active = false; return false;
    }
    const along = c.vel.x * slope.dx + c.vel.z * slope.dz;
    if (!active && along <= .5) return false;
    active = true;
    const velocity = downhillVelocity(c.vel.x, c.vel.z, slope, U.gravity, dt, x, z, magnitude);
    c.vel.x = velocity.x; c.vel.z = velocity.z;
    c.slideT = 0; c.h = .9;
    return true;
  }
  function frame() {
    if (!button) return;
    const playing = game.modeRef() === 'play' && !game.z.over;
    const ready = canStart();
    button.hidden = !playing;
    button.disabled = !ready;
    button.classList.toggle('slope-ready', ready);
    button.classList.toggle('slope-active', active && c.state === 'slide');
    button.textContent = active && c.state === 'slide' ? '滑走中' : '斜面滑り';
    button.setAttribute('aria-label', ready ? '斜面を滑り降りる' : '下り斜面で使用できます');
  }
  return { prepare, move, frame, canStart, get active() { return active && c.state === 'slide'; } };
}

if (typeof window !== 'undefined' && window.__skyInternals) {
  window.skySlopeSlide = createSlopeSlide(window.__skyInternals);
}
