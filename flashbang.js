// Defensive flashbang. Simulation time owns the fuse and stun, including pause.
export const FLASHBANG = Object.freeze({ radius: 6, duration: 3, fuse: 0.22, maxCharges: 2 });

export function flashCanReach(origin, enemy, raycast) {
  if (enemy.dead || enemy.remove || enemy.rise?.t < 0 || enemy.fall?.wait > 0) return false;
  const dx = enemy.pos.x - origin.x, dy = enemy.pos.y + Math.min(1.5, enemy.h * 0.8) - origin.y, dz = enemy.pos.z - origin.z;
  const distance = Math.hypot(dx, dy, dz);
  return distance <= FLASHBANG.radius && (distance < 0.05 || !raycast(origin.x, origin.y, origin.z, dx / distance, dy / distance, dz / distance, Math.max(0, distance - 0.1)));
}

export function createFlashbang(game) {
  const { c, z, U, ri, Jt, ue, Geom, raycast, Tt, rn } = game;
  const { Group, Mesh, Sphere, Torus, Cylinder, Box, Basic, Sprite, SpriteMaterial, CanvasTexture, Vector3 } = Geom;
  const root = new Group(); root.name = 'Flashbang effects'; ue.add(root);
  const grenades = [], bursts = [], affected = new Map();
  const stats = { thrown: 0, detonated: 0, affected: 0 };
  const materials = {
    yellow: new Basic({ color: 0xffd453, fog: false }),
    dark: new Basic({ color: 0x192c35 }),
    white: new Basic({ color: 0xfff5bc, transparent: true, opacity: 1, depthWrite: false, fog: false }),
  };
  const sphere = new Sphere(1, 10, 6), ring = new Torus(1, 0.025, 5, 40), box = new Box(1, 1, 1);
  const can = new Cylinder(0.08, 0.08, 0.23, 8);
  let charges = 1, skills = 0, previousSkill = 'none', grenadeTemplate = null;
  const button = document.getElementById('tFlash'), count = document.getElementById('hFlash');
  const notice = document.createElement('div');
  notice.id = 'flashNotice'; notice.setAttribute('role', 'status');
  notice.style.cssText = 'position:absolute;left:50%;top:25%;transform:translateX(-50%);padding:9px 18px;border:1px solid #ffe080;border-radius:8px;background:#182631e8;color:#ffe080;font:bold 17px sans-serif;pointer-events:none;white-space:nowrap;display:none;z-index:16';
  document.getElementById('app').appendChild(notice);
  let noticeTime = 0;
  const playing = () => game.modeRef() === 'play' && !z.over;
  const blinded = enemy => !enemy.dead && (affected.get(enemy)?.remaining || 0) > 0;
  function hud() {
    if (count) count.textContent = String(charges);
    if (button) {
      button.textContent = `閃光弾 ${charges}（技${skills}/3）`;
      button.classList.toggle('empty', charges === 0);
      button.setAttribute('aria-label', `閃光弾 残り${charges}個 周囲のゾンビを3秒停止`);
    }
  }
  function message(text, seconds = 1.3) { notice.textContent = text; noticeTime = seconds; notice.style.display = ''; }
  function removeEffect(effect) {
    root.remove(effect.model);
    for (const mat of effect.ownedMaterials || []) mat.dispose();
  }
  function restorePose(state) {
    for (const [bone, quaternion] of state.pose || []) bone.quaternion.copy(quaternion);
    state.pose = [];
  }
  function clear() {
    for (const state of affected.values()) { restorePose(state); removeEffect(state); state.texture.dispose(); }
    affected.clear();
    for (const effect of [...grenades, ...bursts]) removeEffect(effect);
    grenades.length = bursts.length = 0;
    notice.style.display = 'none'; noticeTime = 0;
  }
  function reset() { clear(); charges = 1; skills = 0; previousSkill = 'none'; hud(); }
  function marker(enemy) {
    const model = new Group(); model.name = 'Flash stunned zombie'; root.add(model);
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 80;
    const texture = new CanvasTexture(canvas), mat = new SpriteMaterial({ map: texture, depthWrite: false, fog: false, toneMapped: false });
    texture.generateMipmaps = false; texture.minFilter = 1006; // THREE.LinearFilter
    const label = new Sprite(mat); label.scale.set(1.1, 0.344, 1); label.position.y = 0.4; model.add(label);
    const bar = new Mesh(box, materials.yellow); bar.scale.set(1.2, 0.07, 0.06); model.add(bar);
    const stars = [];
    for (let i = 0; i < 3; i++) {
      const star = new Mesh(box, materials.yellow); star.scale.set(0.12, 0.12, 0.06); model.add(star); stars.push(star);
    }
    return { model, canvas, texture, bar, stars, remaining: FLASHBANG.duration, labelTime: -1, pose: [], ownedMaterials: [mat] };
  }
  function updateMarker(enemy, state) {
    state.model.position.set(enemy.pos.x, enemy.pos.y + enemy.h + 0.45, enemy.pos.z);
    state.model.quaternion.copy(game.Se.quaternion); // legible from any camera angle, depth tested behind walls
    state.bar.scale.x = 1.2 * state.remaining / FLASHBANG.duration;
    state.bar.position.x = -0.6 + state.bar.scale.x / 2;
    const phase = (FLASHBANG.duration - state.remaining) * 3;
    state.stars.forEach((star, i) => { const a = phase + i * Math.PI * 2 / 3; star.position.set(Math.cos(a) * 0.55, -0.2 + Math.sin(a) * 0.09, 0); star.rotation.z = a + Math.PI / 4; });
    const tenth = Math.ceil(state.remaining * 10 - 1e-6);
    if (tenth !== state.labelTime) {
      state.labelTime = tenth;
      const ctx = state.canvas.getContext('2d'); ctx.clearRect(0, 0, 256, 80);
      ctx.fillStyle = '#182631'; ctx.fillRect(0, 0, 256, 80);
      ctx.strokeStyle = '#ffda65'; ctx.lineWidth = 5; ctx.strokeRect(3, 3, 250, 74);
      ctx.fillStyle = '#ffe080'; ctx.font = 'bold 37px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`停止 ${(tenth / 10).toFixed(1)}秒`, 128, 40); state.texture.needsUpdate = true;
    }
  }
  function detonate(grenade) {
    stats.detonated++;
    const center = grenade.end, model = new Group(); model.name = 'Flashbang burst'; model.position.copy(center); root.add(model);
    const flashMat = materials.white.clone(), ringMat = materials.white.clone(); ringMat.color.setHex(0xffd453);
    const core = new Mesh(sphere, flashMat); model.add(core);
    const wave = new Mesh(ring, ringMat); wave.rotation.x = Math.PI / 2; model.add(wave);
    const rays = [];
    for (let i = 0; i < 12; i++) { const ray = new Mesh(box, ringMat); ray.rotation.y = i * Math.PI / 6; model.add(ray); rays.push(ray); }
    bursts.push({ model, core, wave, rays, age: 0, ownedMaterials: [flashMat, ringMat] });
    let hits = 0;
    for (const enemy of Jt) {
      if (!flashCanReach(center, enemy, raycast)) continue;
      let state = affected.get(enemy);
      if (!state) { state = marker(enemy); affected.set(enemy, state); }
      state.remaining = FLASHBANG.duration;
      // Cancel traversal and attacks, then let native stunned physics handle gravity/collisions.
      enemy.act = null; enemy.rise = null; enemy.fall = null;
      enemy.atkT = 0; enemy.reach = false; enemy.bash = false;
      enemy.vel.x = enemy.vel.z = 0; enemy.navT = 0;
      enemy.stun = Math.max(enemy.stun, 0.05);
      updateMarker(enemy, state); hits++;
    }
    stats.affected += hits;
    message(hits ? `閃光！ ${hits}体が3秒停止` : '閃光！ 命中なし');
    // One short report, with no long smoke hiss or player screen whiteout.
    if (game.Ut.ctx) { game.Mn(0.5, 2600, 0.7, 0.1, 'bandpass'); game.ni(0.45, 170, 0.1); }
    if (window.__skyAudio) window.__skyAudio.flashbang++;
  }
  function throwFlashbang() {
    if (!playing() || charges <= 0) return false;
    const start = new Vector3(c.pos.x, c.pos.y + Math.min(c.h * 0.7, 1.1), c.pos.z);
    const dx = -Math.sin(c.yaw), dz = -Math.cos(c.yaw);
    const wall = raycast(start.x, start.y, start.z, dx, 0, dz, 2);
    const distance = wall ? Math.max(0, wall.t - 0.2) : 2;
    const end = start.clone().add(new Vector3(dx * distance, 0, dz * distance));
    const model = new Group(); model.name = 'Flashbang grenade'; model.position.copy(start);
    if (grenadeTemplate) { const detail = grenadeTemplate.clone(true); detail.scale.setScalar(0.12); model.add(detail); }
    else model.add(new Mesh(can, materials.dark));
    const stripe = new Mesh(can, materials.yellow); stripe.scale.set(1.1, 0.22, 1.1); model.add(stripe);
    root.add(model); grenades.push({ model, start, end, age: 0 });
    charges--; stats.thrown++; Tt.swish(); hud(); return true;
  }
  const skillStates = ['wallrun', 'slide', 'ledge', 'ladder', 'zip', 'hook'];
  function tick(dt) {
    if (!playing()) return;
    if (c.state !== previousSkill) {
      if (skillStates.includes(c.state)) {
        skills = Math.min(3, skills + 1);
        if (skills >= 3 && charges < FLASHBANG.maxCharges) { skills = 0; charges++; rn('技で閃光弾+1'); }
        hud();
      }
      previousSkill = c.state;
    }
    noticeTime = Math.max(0, noticeTime - dt); if (!noticeTime) notice.style.display = 'none';
    for (const [enemy, state] of affected) {
      state.remaining = Math.max(0, state.remaining - dt);
      if (!state.remaining || enemy.dead || enemy.remove || !Jt.includes(enemy)) {
        restorePose(state); removeEffect(state); state.texture.dispose(); affected.delete(enemy); continue;
      }
      updateMarker(enemy, state);
    }
    for (let i = bursts.length - 1; i >= 0; i--) {
      const effect = bursts[i]; effect.age += dt;
      if (effect.age >= 0.55) { removeEffect(effect); bursts.splice(i, 1); continue; }
      const p = effect.age / 0.55;
      effect.core.scale.setScalar(0.2 + Math.min(1, p * 5));
      effect.core.material.opacity = Math.max(0, 1 - p * 4);
      const radius = 0.2 + p * FLASHBANG.radius;
      effect.wave.scale.setScalar(radius); effect.wave.material.opacity = (1 - p) * 0.9;
      effect.rays.forEach((ray, i) => { const a = i * Math.PI / 6; ray.position.set(Math.sin(a) * radius * 0.6, 0, Math.cos(a) * radius * 0.6); ray.scale.set(0.045, 0.045, radius * 0.6); });
    }
    for (let i = grenades.length - 1; i >= 0; i--) {
      const grenade = grenades[i]; grenade.age += dt;
      const p = Math.min(1, grenade.age / FLASHBANG.fuse);
      grenade.model.position.copy(grenade.start).lerp(grenade.end, p); grenade.model.position.y += Math.sin(p * Math.PI) * 0.35;
      grenade.model.rotation.x += dt * 14;
      if (p === 1) { detonate(grenade); removeEffect(grenade); grenades.splice(i, 1); }
    }
  }

  // All zombie types use the same movement and attack gate. Never freeze vertical physics.
  const originalUpdate = ri.prototype.update, originalTouching = ri.prototype.touching, originalAnim = ri.prototype.anim;
  ri.prototype.update = function updateWithFlashbang(dt) {
    const stopped = blinded(this);
    if (stopped) {
      this.stun = Math.max(this.stun, dt + 0.001);
      this.vel.x = this.vel.z = 0; this.atkT = 0;
      this.act = this.rise = this.fall = null; this.reach = this.bash = false;
    }
    const result = originalUpdate.call(this, dt);
    if (stopped) this.vel.x = this.vel.z = 0;
    return result;
  };
  ri.prototype.touching = function touchingWithFlashbang(distance) { return !blinded(this) && originalTouching.call(this, distance); };
  function coverEyes(enemy, state) {
    const m = enemy.m;
    if (!m.sk) {
      for (const [bone, x, zz] of [[m.armL.arm, 2.6, -0.45], [m.armR.arm, 2.6, 0.45], [m.armL.fore, -1.55, 0], [m.armR.fore, -1.55, 0]]) {
        state.pose.push([bone, bone.quaternion.clone()]); bone.rotation.x = x; bone.rotation.z = zz;
      }
      return;
    }
    if (!state.bones) {
      state.bones = {};
      m.root.traverse(bone => { if (!bone.isBone) return; const name = bone.name.replace(/^mixamorig:?/, ''); state.bones[name] = bone; });
    }
    const bones = state.bones, head = bones.Head;
    if (!head) return;
    m.root.updateMatrixWorld(true);
    const headPos = head.getWorldPosition(new Vector3());
    const forward = new Vector3(-Math.sin(enemy.yaw), 0, -Math.cos(enemy.yaw));
    const side = new Vector3(Math.cos(enemy.yaw), 0, -Math.sin(enemy.yaw));
    const aim = (bone, child, target) => {
      if (!bone || !child) return;
      state.pose.push([bone, bone.quaternion.clone()]);
      const from = bone.getWorldPosition(new Vector3()), direction = child.getWorldPosition(new Vector3()).sub(from).normalize();
      const turn = bone.quaternion.clone().setFromUnitVectors(direction, target.clone().sub(from).normalize());
      const world = bone.getWorldQuaternion(bone.quaternion.clone()).premultiply(turn);
      bone.quaternion.copy(bone.parent.getWorldQuaternion(bone.quaternion.clone()).invert().multiply(world));
      bone.updateMatrixWorld(true);
    };
    for (const [prefix, sign] of [['Left', -1], ['Right', 1]]) {
      const elbow = headPos.clone().addScaledVector(side, sign * 0.3).addScaledVector(forward, 0.22); elbow.y -= 0.28;
      const hand = headPos.clone().addScaledVector(side, sign * 0.09).addScaledVector(forward, 0.16);
      aim(bones[prefix + 'Arm'], bones[prefix + 'ForeArm'], elbow);
      aim(bones[prefix + 'ForeArm'], bones[prefix + 'Hand'], hand);
    }
  }
  ri.prototype.anim = function animateFlashbang(dt) {
    const state = affected.get(this);
    if (state) restorePose(state);
    originalAnim.call(this, dt);
    if (state && blinded(this)) { coverEyes(this, state); updateMarker(this, state); }
  };
  document.addEventListener('keydown', event => {
    if (event.code === 'KeyG' && !event.repeat && playing()) { event.preventDefault(); throwFlashbang(); }
  });
  button?.addEventListener('pointerdown', event => { event.preventDefault(); event.stopPropagation(); throwFlashbang(); });
  hud();
  return { tick, reset, clear, throw: throwFlashbang, stats, grenades, bursts, affected, blinded, config: FLASHBANG,
    get charges() { return charges; }, get skillCount() { return skills; }, setGrenadeTemplate(template) { grenadeTemplate = template; },
    modeChanged(mode) { if (mode === 'menu' || mode === 'over') clear(); }
  };
}
