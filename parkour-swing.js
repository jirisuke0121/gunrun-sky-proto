import { isPerfectRelease, releaseCueProgress, flipDuration } from './swing-flip.js?v=20261030-frontflip-cue-v2';
// Pendulum traversal is a movement state, not a camera-only animation.
export const SWING_LENGTH = 2.15;
export const MAX_GRIP_SECONDS = 8;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function pendulumPoint(bar, direction, angle, length = SWING_LENGTH) {
  return [bar[0] + direction[0] * length * Math.sin(angle), bar[1] - length * Math.cos(angle),
    bar[2] + direction[1] * length * Math.sin(angle)];
}
export function releaseVelocity(direction, angle, omega, jumpVelocity, perfect = false) {
  // Keep the signed tangent velocity. A press adds a fixed jump impulse;
  // neither the next bar nor a desired arrival height influences this launch.
  const horizontal = SWING_LENGTH * omega * Math.cos(angle) + 4 + (perfect ? .6 : 0);
  const vertical = SWING_LENGTH * omega * Math.sin(angle) + jumpVelocity * .28 + (perfect ? .2 : 0);
  return [direction[0] * horizontal, vertical, direction[1] * horizontal];
}
export function isLaunchWindow(angle, omega) {
  return angle >= .55 && angle <= .95 && omega > 1.1;
}
export function createSwing(sky, game, course) {
  if (!course) return { step: () => false, frame() {}, reset() {}, active: null, course };
  const { c, U, z, Geom: T } = sky;
  const bars = course?.bars || [];
  let active = null, cooldown = 0, previous = null, lastBar = '', chain = 0, chainTime = 0, releasedBar = '', recatch = 0;
  let jumpHeld = false, touchHeld = false, jumpPressed = false;
  function press() {
    if (active && sky.modeRef() === 'play' && !z.over) jumpPressed = true;
  }
  const jumpButton = document.getElementById('tJump'), jumpLabel=jumpButton?.textContent;
  addEventListener('keydown', e => {
    if (e.code !== 'Space' || e.repeat || jumpHeld) return;
    jumpHeld = true; press();
  });
  addEventListener('keyup', e => { if (e.code === 'Space') jumpHeld = false; });
  jumpButton?.addEventListener('pointerdown', () => { if (!touchHeld) press(); touchHeld = true; });
  for (const name of ['pointerup','pointercancel','pointerleave']) jumpButton?.addEventListener(name, () => { touchHeld = false; });
  addEventListener('blur', () => { jumpHeld = touchHeld = jumpPressed = false; });
  const group = new T.Group(); group.name = course.oldTown ? course.name : 'West ascent swing bars'; sky.ue.add(group);
  const steel = new T.Standard({ color: 0x243c52, metalness: .65, roughness: .4 });
  const orange = new T.Standard({ color: 0xffaa35, emissive: 0x633509, roughness: .5 });
  const gripCues = new Map();
  function setGripCue(id, ready) {
    for (const [barId, material] of gripCues) {
      const green = barId === id && ready;
      if (material.userData.swingReady === green) continue;
      material.userData.swingReady = green;
      material.color.setHex(green ? 0x7ef0aa : 0xffaa35);
      material.emissive.setHex(green ? 0x24743c : 0x633509);
    }
  }
  function label(text, at, scale = 1) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#23364deb'; ctx.fillRect(0,0,512,96);
    ctx.strokeStyle = '#ffb647'; ctx.lineWidth = 6; ctx.strokeRect(3,3,506,90);
    ctx.fillStyle = '#fff1cd'; ctx.font = '700 36px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(text,256,62);
    const sprite = new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(canvas),depthWrite:false}));
    sprite.scale.set(3.5*scale,.66*scale,1); sprite.position.set(...at); group.add(sprite);
  }
  for (const b of bars) {
    const gripMaterial = orange.clone(); gripCues.set(b.id, gripMaterial);
    const tube = new T.Mesh(new T.Cylinder(.065, .065, b.width + .3, 8), steel);
    tube.rotation.z = Math.PI / 2; tube.rotation.y = Math.atan2(b.direction[0], b.direction[1]); tube.position.set(...b.at); group.add(tube);
    for (const offset of [-.35, .35]) {
      const grip = new T.Mesh(new T.Cylinder(.078, .078, .24, 8), gripMaterial);
      grip.userData.swingBar = b.id;
      grip.rotation.copy(tube.rotation); grip.position.set(b.at[0] - b.direction[1] * offset, b.at[1], b.at[2] + b.direction[0] * offset); group.add(grip);
    }
    if (!course.oldTown) label(b.label || (b.id.endsWith('1') ? '1  SWING >' : '2  > UPPER'), [b.at[0],b.at[1]+.45,b.at[2]+2.25], .5);
  }
  for (const {from,to} of course.supports || []) {
    const start=new T.Vector3(...from),end=new T.Vector3(...to),delta=end.clone().sub(start);
    const mount=new T.Mesh(new T.Cylinder(.055,.055,delta.length(),6),steel);
    mount.position.copy(start).add(end).multiplyScalar(.5);
    mount.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());group.add(mount);
  }
  function arrow(x,y,z,dx,dz) {
    const chevron = new T.Group(); chevron.position.set(x,y,z); chevron.rotation.y=Math.atan2(dx,dz)+Math.PI;
    for(const side of [-1,1]) {
      const stroke=new T.Mesh(new T.Box(.08,.025,.62),orange);
      stroke.position.set(side*.19,0,0);stroke.rotation.y=side*.72;chevron.add(stroke);
    }
    group.add(chevron);
  }
  if (course && !course.oldTown) {
    label('WALL > JUMP > SWING', [-20.2,9.15,course.wall.at[2]],.85);
    // Both directions on the existing ring see the optional shortcut before
    // reaching its wall. Painted chevrons carry the eye to the take-off pad.
    label('SWING / 8m', [-17.9,6.5,-10.5], .7);
    label('SWING / 8m', [-17.9,7,-2], .7);
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
  for (const sign of course.signs || []) label(sign.text, sign.at, sign.scale);
  for (const mark of course.arrows || []) arrow(...mark.at, ...mark.direction);
  const style = document.createElement('style');
  style.textContent = '#swingHint{position:fixed;top:24%;left:50%;transform:translateX(-50%);padding:9px 14px;border-radius:8px;color:#fff4d6;background:#25354cf2;font:700 14px system-ui;pointer-events:none;z-index:26;text-align:center;min-width:76px;max-width:85vw;box-sizing:border-box}#swingHint:after{content:"";display:block;height:4px;margin-top:6px;background:currentColor;opacity:.8;transform:scaleX(var(--swing-progress,0));transform-origin:left}body[data-sky-swing] #hint{visibility:hidden}#swingHint[hidden]{display:none}#swingHint[data-expiring=true]:not([data-ready=true]){border:2px solid #ffd67b;box-shadow:0 0 12px #ffd67b66}#swingHint[data-ready=true]{color:#103424;border:2px solid #d5ffe6;background:#7ef0aa;box-shadow:0 0 18px #7ef0aa99;font-size:16px}#tJump[data-swing-ready=true]{color:#103424!important;border-color:#d5ffe6!important;background:#7ef0aa!important;box-shadow:0 0 0 3px #7ef0aa,0 0 18px #7ef0aa80}';
  document.head.appendChild(style);
  const hint = document.createElement('div'); hint.id = 'swingHint'; hint.hidden = true; document.body.appendChild(hint);
  if (bars.length) {
    const rule = document.querySelector('#ovStart .rules .keys');
    if (rule) { const li = document.createElement('li'); li.textContent = (course.instructions || '西の橙色ルート：壁蹴り→小足場→鉄棒2本→中央高台。空中で鉄棒を自動つかみ。体が前へ振れた瞬間にジャンプを押して次へ。鉄棒ごとに押し直す。下入力で手を離す。高台で左右へ曲がる') + ' 緑の合図に合わせてジャンプすると前宙し、少し遠くへ飛べます。成功後は4秒間、移動速度＋8％。'; rule.appendChild(li); }
  }
  function event(type, detail = {}) {
    if (game.RL?.events?.length < 300) game.RL.events.push({ e: type, t: +z.t.toFixed(3), x: c.pos.x, y: c.pos.y, z: c.pos.z, ...detail });
  }
  function reset() {
    if (c.state === 'swing') c.state = 'normal';
    active = null; c.swing = null; c.swingFlight = null; cooldown = 0; previous = null; lastBar = ''; chain = 0; chainTime = 0;
    releasedBar = ''; recatch = 0;
    hint.hidden = true;
    setGripCue(null, false);
    jumpHeld = touchHeld = jumpPressed = false;
    delete jumpButton?.dataset.swingReady;
    if(jumpButton)jumpButton.textContent=jumpLabel;
  }
  function detach(drop = false) {
    const a = active;
    if (!a) return;
    c.edgeJump = !drop;
    c.state = 'normal'; c.swing = null; c.jumpBuf = 0; c.coyote = 0; c.airT = 0; c.catchCD = .25;
    c.hookPressed = false; c.edgeOff = null; cooldown = .08; releasedBar = a.bar.id; recatch = .45;
    const perfect = !drop && isPerfectRelease(a.angle, a.omega, a.bar.launchWindow);
    const launch = releaseVelocity(a.direction, a.angle, a.omega, U.jumpVel, perfect);
    c.vel.set(...(drop ? [a.direction[0] * 2, -1, a.direction[1] * 2] : launch));
    c.swingFlight = drop ? null : { age: 0, angle: a.angle, direction: [...a.direction], perfect,
      flipDuration: perfect ? flipDuration(c.pos.toArray(), launch, U.gravity, sky.oe, bars, a.bar.id, c.r) : 0 };
    if (perfect) window.skyDash?.rewardSwing();
    if (perfect && U.autoFire && sky.Et) sky.Et.trigger = 0;
    event(drop ? 'barDrop' : 'barJump', { bar: a.bar.id, chain, angle: +a.angle.toFixed(3), omega: +a.omega.toFixed(3), perfect });
    if (!drop) { window.skyTelemetryProbe?.jumpAccepted(z.t, 'bar_release'); game.stats.barJumps = (game.stats.barJumps || 0) + 1; sky.Tt.jump?.(); }
    active = null; jumpPressed = false; previous = c.pos.toArray(); hint.hidden = true;
    setGripCue(null, false);
    delete jumpButton?.dataset.swingReady;
    if(jumpButton)jumpButton.textContent=jumpLabel;
  }
  function attach(bar, nearest) {
    const direction = [...bar.direction];
    const into = c.vel.x * direction[0] + c.vel.z * direction[1];
    // Bars can be used backwards as an escape, too.
    if (into < -.5) { direction[0] *= -1; direction[1] *= -1; }
    const along = (c.pos.x - nearest[0]) * direction[0] + (c.pos.z - nearest[2]) * direction[1];
    const angle = clamp(Math.atan2(along, bar.at[1] - c.pos.y), course.oldTown ? -1.25 : -1.05, course.oldTown ? 1.05 : .65);
    const tangent = Math.abs(into) * Math.cos(angle) + c.vel.y * Math.sin(angle);
    const omega = clamp(Math.max(tangent,Math.abs(into)*1.05+1.2)/SWING_LENGTH, 2.8, course.oldTown ? 3.8 : 5.4);
    const pivot = [...nearest];
    const p = pendulumPoint(pivot, direction, angle);
    const correction = Math.hypot(...p.map((v,k)=>v-c.pos.getComponent(k)));
    if (correction > (course.oldTown ? 1.6 : .85)) return false;
    // A wider hand reach must never pull the body through a wall or roof lip.
    for (let i=1;i<=8;i++) {
      const f=i/8, q=p.map((v,k)=>c.pos.getComponent(k)+(v-c.pos.getComponent(k))*f);
      if (!sky.oe(q[0],q[1]+.03,q[2],c.r,1.75)) return false;
    }
    active = { bar, pivot, direction, angle, omega, age: 0 };
    c.swingFlight = null;
    jumpPressed = false; hint.dataset.ready = 'false'; hint.dataset.expiring = 'false'; hint.style.setProperty('--swing-progress', 0);
    setGripCue(bar.id, false);
    hint.textContent = '';
    chain = chainTime > 0 && lastBar !== bar.id ? chain + 1 : 1; chainTime = 2; lastBar = bar.id;
    c.edgeJump = false;
    c.state = 'swing'; c.swing = active; c.pos.set(...p); c.onGround = false; c.h = 1.75;
    c.coyote = 0; c.jumpBuf = 0; c.hookPressed = false; c.edgeOff = null;
    game.stats.barGrabs = (game.stats.barGrabs || 0) + 1; event('barGrab', { bar: bar.id, chain });
    sky.Tt.vault?.(); return true;
  }
  function step(dt, input = {}) {
    if (!bars.length) return false;
    if (sky.modeRef() !== 'play' || z.over) { jumpPressed = false; return false; }
    if (c.swingFlight) {
      c.swingFlight.age += dt;
      if (c.onGround || c.state !== 'normal' || c.swingFlight.age > 1.2) c.swingFlight = null;
    }
    cooldown = Math.max(0, cooldown - dt); recatch = Math.max(0,recatch-dt); if (!active) chainTime = Math.max(0, chainTime - dt);
    if (active && c.state !== 'swing') { active = null; c.swing = null; hint.hidden = true; setGripCue(null, false); }
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
      const launchWindow = a.bar.launchWindow;
      const ready = isPerfectRelease(a.angle, a.omega, launchWindow);
      hint.hidden = false; hint.dataset.ready = String(ready);
      hint.dataset.expiring = String(a.age >= MAX_GRIP_SECONDS - 2);
      hint.style.setProperty('--swing-progress', releaseCueProgress(a.angle, a.omega, launchWindow));
      setGripCue(a.bar.id, ready);
      hint.textContent = ready ? '今！' : '';
      if (jumpButton) { jumpButton.dataset.swingReady = String(ready); jumpButton.textContent = jumpLabel; }
      document.body.dataset.skySwing = JSON.stringify({ bar: a.bar.id, angle: a.angle, chain, age: a.age });
      previous = c.pos.toArray(); return true;
    }
    const to = c.pos.toArray();
    const from = previous || to;
    previous = c.pos.toArray();
    if (cooldown || c.onGround || c.state !== 'normal' || c.vel.y < (course.oldTown ? -12 : -8) || Math.hypot(c.vel.x,c.vel.z) < 1) return false;
    for (const b of bars) {
      if (b.id===releasedBar && recatch>0) continue;
      const side = [-b.direction[1], b.direction[0]];
      const across = (c.pos.x-b.at[0])*side[0]+(c.pos.z-b.at[2])*side[1];
      const margin = course.oldTown ? .3 : .35;
      const offset = clamp(across, -b.width/2+margin, b.width/2-margin);
      const pivot = [b.at[0]+side[0]*offset,b.at[1],b.at[2]+side[1]*offset];
      // Reach forward during the approach, instead of waiting for the feet to
      // pass directly below the bar. The radial reach is the actual pendulum
      // length. Old-town bars allow a wider hand reach, with the entire
      // body correction checked for walls; the next target never affects it.
      const delta = to.map((v,k)=>v-from[k]), length = delta.reduce((s,v)=>s+v*v,0);
      const t = length ? clamp(delta.reduce((s,v,k)=>s+(pivot[k]-from[k])*v,0)/length,0,1) : 0;
      const distance = Math.hypot(...pivot.map((v,k)=>v-from[k]-t*delta[k]));
      const along = (c.pos.x-pivot[0])*b.direction[0]+(c.pos.z-pivot[2])*b.direction[1];
      const into = c.vel.x*b.direction[0]+c.vel.z*b.direction[1];
      const angle = Math.atan2(along, pivot[1]-c.pos.y);
      const lateralReach = course.oldTown ? b.width/2+.45 : .5;
      const sideDistance = course.oldTown ? Math.abs(across) : Math.abs(across-offset);
      const approaching = along*into < 0 || (course.oldTown && Math.abs(along)<.8 && c.vel.y<0);
      if (pivot[1]-c.pos.y > (course.oldTown ? .5 : .95) && sideDistance < lateralReach && approaching && Math.abs(angle)<(course.oldTown ? 1.35 : 1.05) && distance < SWING_LENGTH+(course.oldTown ? .85 : .38) && attach(b,pivot)) return true;
    }
    return false;
  }
  function frame() {
    hint.hidden = !active || sky.modeRef() !== 'play' || z.over;
    if (sky.modeRef() !== 'play' || z.over) {
      setGripCue(null, false);
      jumpHeld = touchHeld = jumpPressed = false;
      c.jumpBuf = 0; delete jumpButton?.dataset.swingReady;
    if(jumpButton)jumpButton.textContent=jumpLabel;
    }
    if (!active) delete document.body.dataset.skySwing;
  }
  return { step, frame, reset, get active() { return active; }, get course() { return course; }, get cameraSpeed() { return active ? Math.max(6,SWING_LENGTH*Math.abs(active.omega)) : 0; } };
}
