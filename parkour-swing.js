// Pendulum traversal is a movement state, not a camera-only animation.
export const SWING_LENGTH = 2.15;
export const MAX_GRIP_SECONDS = 8;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function pendulumPoint(bar, direction, angle, length = SWING_LENGTH) {
  return [bar[0] + direction[0] * length * Math.sin(angle), bar[1] - length * Math.cos(angle),
    bar[2] + direction[1] * length * Math.sin(angle)];
}
export function releaseVelocity(direction, angle, omega, jumpVelocity) {
  // Keep the signed tangent velocity. A press adds a fixed jump impulse;
  // neither the next bar nor a desired arrival height influences this launch.
  const horizontal = SWING_LENGTH * omega * Math.cos(angle) + 3;
  const vertical = SWING_LENGTH * omega * Math.sin(angle) + jumpVelocity * .72;
  return [direction[0] * horizontal, vertical, direction[1] * horizontal];
}
export function isLaunchWindow(angle, omega) {
  return angle >= .2 && angle <= .65 && omega > 1.1;
}
export function createSwing(sky, game, course) {
  if (!course) return { step: () => false, frame() {}, reset() {}, active: null, course };
  const { c, U, z, Geom: T } = sky;
  const bars = course?.bars || [];
  let active = null, cooldown = 0, previous = null, lastBar = '', chain = 0, chainTime = 0;
  let jumpHeld = false, touchHeld = false, jumpPressed = false;
  function press() {
    if (active && sky.modeRef() === 'play' && !z.over) jumpPressed = true;
  }
  const jumpButton = document.getElementById('tJump');
  addEventListener('keydown', e => {
    if (e.code !== 'Space' || e.repeat || jumpHeld) return;
    jumpHeld = true; press();
  });
  addEventListener('keyup', e => { if (e.code === 'Space') jumpHeld = false; });
  jumpButton?.addEventListener('pointerdown', () => { if (!touchHeld) press(); touchHeld = true; });
  for (const name of ['pointerup','pointercancel','pointerleave']) jumpButton?.addEventListener(name, () => { touchHeld = false; });
  addEventListener('blur', () => { jumpHeld = touchHeld = jumpPressed = false; });
  const group = new T.Group(); group.name = 'West ascent swing bars'; sky.ue.add(group);
  const steel = new T.Standard({ color: 0x243c52, metalness: .65, roughness: .4 });
  const orange = new T.Standard({ color: 0xffaa35, emissive: 0x633509, roughness: .5 });
  function label(text, at, scale = 1) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#23364deb'; ctx.fillRect(0,0,512,96);
    ctx.strokeStyle = '#ffb647'; ctx.lineWidth = 6; ctx.strokeRect(3,3,506,90);
    ctx.fillStyle = '#fff1cd'; ctx.font = '700 36px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(text,256,62);
    const sprite = new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(canvas),depthWrite:false}));
    sprite.scale.set(3.5*scale,.66*scale,1); sprite.position.set(...at); group.add(sprite);
  }
  for (const b of bars) {
    const tube = new T.Mesh(new T.Cylinder(.065, .065, b.width + .3, 8), steel);
    tube.rotation.x = Math.PI / 2; tube.position.set(...b.at); group.add(tube);
    for (const offset of [-.35, .35]) {
      const grip = new T.Mesh(new T.Cylinder(.078, .078, .24, 8), orange);
      grip.rotation.x = Math.PI / 2; grip.position.set(b.at[0], b.at[1], b.at[2] + offset); group.add(grip);
    }
    label(b.id.endsWith('1') ? '1  SWING >' : '2  > UPPER', [b.at[0],b.at[1]+.7,b.at[2]], .7);
  }
  if (course) {
    label('WALL > JUMP > SWING', [-20.2,9.15,course.wall.at[2]],.85);
    // Both directions on the existing ring see the optional shortcut before
    // reaching its wall. Painted chevrons carry the eye to the take-off pad.
    label('SWING / 8m', [-17.9,6.5,-10.5], .7);
    label('SWING / 8m', [-17.9,7,-2], .7);
    function arrow(x,y,z,dx,dz) {
      const chevron = new T.Group(); chevron.position.set(x,y,z); chevron.rotation.y=Math.atan2(dx,dz);
      for(const side of [-1,1]) {
        const stroke=new T.Mesh(new T.Box(.08,.025,.62),orange);
        stroke.position.set(side*.19,0,0);stroke.rotation.y=side*.72;chevron.add(stroke);
      }
      group.add(chevron);
    }
    for(const [x,y,z,dir] of course.entryMarkers || []) arrow(x,y,z,0,dir);
    arrow(-16.5,5.225,-6,1,0);
    for(const z of [-7.4,-8.8]) arrow(0,8.025,z,0,-1);
    for(const z of [-4.6,-3.2]) arrow(0,8.025,z,0,1);
    arrow(3.2,8.025,-6.5,-.7,-1);
    arrow(3.2,8.025,-5.5,-.7,1);
    label('<  UPPER  >', [2.8,9.25,-6],.85);
    const pad = new T.Mesh(new T.Torus(.58,.055,5,20),orange);
    pad.position.set(course.pad[0],course.pad[1]+.035,course.pad[2]); pad.rotation.x=Math.PI/2;group.add(pad);
  }
  const style = document.createElement('style');
  style.textContent = '#swingHint{position:fixed;top:24%;left:50%;transform:translateX(-50%);padding:6px 12px;border-radius:8px;color:#fff4d6;background:#25354cdd;font:700 12px system-ui;pointer-events:none;z-index:6;text-align:center;max-width:85vw}body[data-sky-swing] #hint{visibility:hidden}#swingHint[hidden]{display:none}#swingHint[data-ready=true]{color:#d8ffe4;border:1px solid #7ef0aa;background:#163a30ed}#tJump[data-swing-ready=true]{box-shadow:0 0 0 3px #7ef0aa,0 0 18px #7ef0aa80}';
  document.head.appendChild(style);
  const hint = document.createElement('div'); hint.id = 'swingHint'; hint.hidden = true; document.body.appendChild(hint);
  if (bars.length) {
    const rule = document.querySelector('#ovStart .rules .keys');
    if (rule) { const li = document.createElement('li'); li.textContent = '西の橙色ルート：壁蹴り→小足場→鉄棒2本→中央高台。空中で鉄棒を自動つかみ。体が前へ振れた瞬間にジャンプを押して次へ。鉄棒ごとに押し直す。下入力で手を離す。高台で左右へ曲がる'; rule.appendChild(li); }
  }
  function event(type, detail = {}) {
    if (game.RL?.events?.length < 300) game.RL.events.push({ e: type, t: +z.t.toFixed(3), x: c.pos.x, y: c.pos.y, z: c.pos.z, ...detail });
  }
  function reset() {
    if (c.state === 'swing') c.state = 'normal';
    active = null; c.swing = null; cooldown = 0; previous = null; lastBar = ''; chain = 0; chainTime = 0;
    hint.hidden = true;
    jumpHeld = touchHeld = jumpPressed = false;
    delete jumpButton?.dataset.swingReady;
  }
  function detach(drop = false) {
    const a = active;
    if (!a) return;
    c.state = 'normal'; c.swing = null; c.jumpBuf = 0; c.coyote = 0; c.airT = 0; c.catchCD = .25;
    c.hookPressed = false; c.edgeOff = null; cooldown = .3;
    const launch = releaseVelocity(a.direction, a.angle, a.omega, U.jumpVel);
    c.vel.set(...(drop ? [a.direction[0] * 2, -1, a.direction[1] * 2] : launch));
    event(drop ? 'barDrop' : 'barJump', { bar: a.bar.id, chain, angle: +a.angle.toFixed(3), omega: +a.omega.toFixed(3) });
    if (!drop) { window.skyTelemetryProbe?.jumpAccepted(z.t, 'bar_release'); game.stats.barJumps = (game.stats.barJumps || 0) + 1; sky.Tt.jump?.(); }
    active = null; jumpPressed = false; previous = c.pos.toArray(); hint.hidden = true;
    delete jumpButton?.dataset.swingReady;
  }
  function attach(bar, nearest) {
    const direction = [...bar.direction];
    const into = c.vel.x * direction[0] + c.vel.z * direction[1];
    // Bars can be used backwards as an escape, too.
    if (into < -.5) { direction[0] *= -1; direction[1] *= -1; }
    const along = (c.pos.x - nearest[0]) * direction[0] + (c.pos.z - nearest[2]) * direction[1];
    const angle = clamp(Math.atan2(along, bar.at[1] - c.pos.y), -.9, .65);
    const omega = clamp((Math.abs(into) * Math.cos(angle) + c.vel.y * Math.sin(angle)) / SWING_LENGTH, 1.8, 4.1);
    const pivot = [...nearest];
    const p = pendulumPoint(pivot, direction, angle);
    if (Math.hypot(...p.map((v,k)=>v-c.pos.getComponent(k))) > .85 || !sky.oe(p[0], p[1] + .03, p[2], c.r, 1.75)) return false;
    active = { bar, pivot, direction, angle, omega, age: 0 };
    jumpPressed = false; hint.dataset.ready = 'false';
    hint.textContent = '前へ振れたらジャンプ / 下で離す';
    chain = chainTime > 0 && lastBar !== bar.id ? chain + 1 : 1; chainTime = 2; lastBar = bar.id;
    c.state = 'swing'; c.swing = active; c.pos.set(...p); c.onGround = false; c.h = 1.75;
    c.coyote = 0; c.jumpBuf = 0; c.hookPressed = false; c.edgeOff = null;
    game.stats.barGrabs = (game.stats.barGrabs || 0) + 1; event('barGrab', { bar: bar.id, chain });
    sky.Tt.vault?.(); return true;
  }
  function step(dt, input = {}) {
    if (!bars.length) return false;
    if (sky.modeRef() !== 'play' || z.over) { jumpPressed = false; return false; }
    cooldown = Math.max(0, cooldown - dt); if (!active) chainTime = Math.max(0, chainTime - dt);
    if (active && c.state !== 'swing') { active = null; c.swing = null; hint.hidden = true; }
    if (active) {
      const a = active;
      a.age += dt;
      // Approach buffers and held/repeated inputs never release a grip. Only a
      // fresh press made while attached is consumed, at this exact swing phase.
      c.jumpBuf = 0;
      if (jumpPressed) { detach(); return true; }
      if (input.fwdIn < -.55 || c.crouchPressed || a.age >= MAX_GRIP_SECONDS) { c.crouchPressed = false; detach(true); return true; }
      // Pump in the direction of motion, below a bounded swing energy. This
      // lets a missed window come round again without an automatic launch.
      const energy = .5 * SWING_LENGTH ** 2 * a.omega ** 2 + U.gravity * SWING_LENGTH * (1 - Math.cos(a.angle));
      const pump = energy < U.gravity * SWING_LENGTH * (1 - Math.cos(1.1))
        ? (input.fwdIn > .1 ? 2.4 : .9) * Math.sign(a.omega || 1) : 0;
      a.omega += (-U.gravity / SWING_LENGTH * Math.sin(a.angle) + pump - .15 * a.omega) * dt;
      a.angle += a.omega * dt;
      const p = pendulumPoint(a.pivot, a.direction, a.angle);
      if (!sky.oe(p[0], p[1] + .03, p[2], c.r, 1.75)) { detach(true); return true; }
      c.pos.set(...p);
      c.vel.set(a.direction[0] * SWING_LENGTH * Math.cos(a.angle) * a.omega,
        SWING_LENGTH * Math.sin(a.angle) * a.omega, a.direction[1] * SWING_LENGTH * Math.cos(a.angle) * a.omega);
      const ready = isLaunchWindow(a.angle, a.omega);
      hint.hidden = false; hint.dataset.ready = String(ready);
      hint.textContent = ready ? `鉄棒 ${chain}/2　今！ジャンプで次へ` : `鉄棒 ${chain}/2　前へ振れたらジャンプ / 下で離す`;
      if (a.age >= MAX_GRIP_SECONDS - 2) hint.textContent += ` / 手が離れるまで ${Math.ceil(MAX_GRIP_SECONDS - a.age)}秒`;
      if (jumpButton) jumpButton.dataset.swingReady = String(ready);
      document.body.dataset.skySwing = JSON.stringify({ bar: a.bar.id, angle: a.angle, chain, age: a.age });
      previous = c.pos.toArray(); return true;
    }
    const to = [c.pos.x, c.pos.y + SWING_LENGTH, c.pos.z];
    const from = previous ? [previous[0], previous[1] + SWING_LENGTH, previous[2]] : to;
    previous = c.pos.toArray();
    if (cooldown || c.onGround || c.state !== 'normal' || c.vel.y < -8 || Math.hypot(c.vel.x,c.vel.z) < 1) return false;
    for (const b of bars) {
      const pivot = [b.at[0], b.at[1], clamp(c.pos.z, b.at[2] - b.width / 2 + .35, b.at[2] + b.width / 2 - .35)];
      // Sweep the hand path: 30 FPS should not skip a thin crossbar.
      const delta = to.map((v,k)=>v-from[k]), length = delta.reduce((s,v)=>s+v*v,0);
      const t = length ? clamp(delta.reduce((s,v,k)=>s+(pivot[k]-from[k])*v,0)/length,0,1) : 0;
      const distance = Math.hypot(...pivot.map((v,k)=>v-from[k]-t*delta[k]));
      if (distance < .62 && attach(b, pivot)) return true;
    }
    return false;
  }
  function frame() {
    hint.hidden = !active || sky.modeRef() !== 'play' || z.over;
    if (sky.modeRef() !== 'play' || z.over) {
      jumpHeld = touchHeld = jumpPressed = false;
      c.jumpBuf = 0; delete jumpButton?.dataset.swingReady;
    }
    if (!active) delete document.body.dataset.skySwing;
  }
  return { step, frame, reset, get active() { return active; }, get course() { return course; } };
}
