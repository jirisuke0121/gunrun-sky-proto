import { playGearSound } from './gear-audio.js?v=20261026-gear-polish-v1';
// Defensive flashbang. Simulation time owns the fuse and stun, including pause.
export const FLASHBANG = Object.freeze({ radius: 8, duration: 4, fuse: 0.22, maxCharges: 2, burstDuration: 1, screenDuration: 0.8, reducedScreenDuration: 0.4 });

// One bright pulse, then a smooth afterglow across the entire screen.
export function flashScreenOpacity(age, reducedMotion = false) {
  if (!Number.isFinite(age) || age < 0) return 0;
  const duration = reducedMotion ? FLASHBANG.reducedScreenDuration : FLASHBANG.screenDuration;
  const hold = reducedMotion ? 0 : 0.065;
  const fade = Math.max(0, 1 - Math.max(0, age - hold) / (duration - hold));
  return (reducedMotion ? 0.22 : 0.84) * Math.pow(fade, 1.35);
}

export function flashCanReach(origin, enemy, raycast) {
  if (enemy.dead || enemy.remove || enemy.rise?.t < 0 || enemy.fall?.wait > 0) return false;
  const dx = enemy.pos.x - origin.x, dy = enemy.pos.y + Math.min(1.5, enemy.h * 0.8) - origin.y, dz = enemy.pos.z - origin.z;
  const distance = Math.hypot(dx, dy, dz);
  return distance <= FLASHBANG.radius && (distance < 0.05 || !raycast(origin.x, origin.y, origin.z, dx / distance, dy / distance, dz / distance, Math.max(0, distance - 0.1)));
}

export function createFlashbang(game) {
  const { c, z, U, ri, Jt, ue, Geom, raycast, Tt, rn } = game;
  const { Group, Mesh, Sphere, Torus, Cylinder, Box, Basic, Sprite, SpriteMaterial, CanvasTexture, Vector3, PointLight, Line, BufferGeometry, Float32Attribute } = Geom;
  const root = new Group(); root.name = 'Flashbang effects'; ue.add(root);
  const grenades = [], bursts = [], affected = new Map();
  const stats = { thrown: 0, detonated: 0, affected: 0 };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const light = new PointLight(0xbceeff, 0, 13, 2); light.castShadow = false; root.add(light);
  const materials = {
    yellow: new Basic({ color: 0xffd453, fog: false }),
    dark: new Basic({ color: 0x192c35 }),
    white: new Basic({ color: 0xfff5bc, transparent: true, opacity: 1, depthWrite: false, fog: false }),
  };
  const ring = new Torus(1, 0.025, 5, 40), box = new Box(1, 1, 1);
  function glowTexture(star = false) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d'), gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(0.12, '#e5ffff');
    gradient.addColorStop(0.32, '#81dbffb0'); gradient.addColorStop(1, '#429bff00');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
    if (star) {
      ctx.clearRect(0, 0, 128, 128); ctx.shadowColor = '#8eeaff'; ctx.shadowBlur = 7;
      ctx.fillStyle = '#efffff'; ctx.beginPath();
      for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8, r = i % 2 ? 7 : i % 4 ? 28 : 59; ctx.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
      ctx.closePath(); ctx.fill();
    }
    return new CanvasTexture(canvas);
  }
  const haloTexture = glowTexture(), starTexture = glowTexture(true);
  const haloMaterial = new SpriteMaterial({ map: haloTexture, color: 0xd1faff, transparent: true, opacity: 1, depthWrite: false, blending: 2, fog: false, toneMapped: false });
  const starMaterial = new SpriteMaterial({ map: starTexture, color: 0xe6faff, depthWrite: false, blending: 2, fog: false, toneMapped: false });
  const glow = document.createElement('div'); glow.id = 'flashGlow'; glow.setAttribute('aria-hidden', 'true');
  glow.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:0;z-index:7;mix-blend-mode:screen';
  document.getElementById('app').appendChild(glow);
  const can = new Cylinder(0.08, 0.08, 0.23, 8);
  let charges = 1, skills = 0, previousSkill = 'none', grenadeTemplate = null;
  const button = document.getElementById('tFlash'), count = document.getElementById('hFlash');
  const notice = document.createElement('div');
  notice.id = 'flashNotice'; notice.setAttribute('role', 'status');
  notice.style.cssText = 'position:absolute;left:50%;top:auto;bottom:20%;transform:translateX(-50%);padding:9px 18px;border:1px solid #ffe080;border-radius:8px;background:#182631e8;color:#ffe080;font:bold 17px sans-serif;pointer-events:none;white-space:nowrap;display:none;z-index:16';
  document.getElementById('app').appendChild(notice);
  let noticeTime = 0;
  const playing = () => game.modeRef() === 'play' && !z.over;
  const blinded = enemy => !enemy.dead && (affected.get(enemy)?.remaining || 0) > 0;
  function hud() {
    if (count) count.textContent = String(charges);
    if (button) {
      button.textContent = `閃光弾 ${charges}（技${skills}/3）`;
      button.classList.toggle('empty', charges === 0);
      button.setAttribute('aria-label', `閃光弾 残り${charges}個 周囲${FLASHBANG.radius}mのゾンビを${FLASHBANG.duration}秒停止`);
    }
  }
  function message(text, seconds = 1.3) { notice.textContent = text; noticeTime = seconds; notice.style.display = ''; }
  function removeEffect(effect) {
    root.remove(effect.model); if (effect.aura) root.remove(effect.aura);
    for (const mat of effect.ownedMaterials || []) mat.dispose();
    if (effect.trail) { root.remove(effect.trail); effect.trail.geometry.dispose(); }
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
    notice.style.display = 'none'; noticeTime = 0; glow.style.opacity = '0'; light.intensity = 0;
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
    for (let i = 0; i < 4; i++) {
      const star = new Sprite(starMaterial); star.scale.setScalar(0.23); model.add(star); stars.push(star);
    }
    const halo = new Mesh(ring, materials.yellow); halo.scale.setScalar(0.46); halo.rotation.x = Math.PI / 2; model.add(halo);
    const auraMaterial = haloMaterial.clone(); auraMaterial.opacity = 0.2;
    const aura = new Sprite(auraMaterial); aura.scale.set(1.25, enemy.h * 1.4, 1); root.add(aura);
    return { model, canvas, texture, bar, stars, halo, aura, remaining: FLASHBANG.duration, labelTime: -1, pose: [], ownedMaterials: [mat, auraMaterial], auraMaterial };
  }

  function updateMarker(enemy, state) {
    state.model.position.set(enemy.pos.x, enemy.pos.y + enemy.h + 0.45, enemy.pos.z);
    state.aura.position.set(enemy.pos.x, enemy.pos.y + enemy.h * 0.5, enemy.pos.z);
    const elapsed = FLASHBANG.duration - state.remaining;
    state.auraMaterial.opacity = (0.08 + 0.2 * Math.exp(-elapsed * 5)) * Math.min(1, state.remaining / 0.3);
    state.halo.rotation.z = elapsed * 1.6;
    state.model.quaternion.copy(game.Se.quaternion); // legible from any camera angle, depth tested behind walls
    state.bar.scale.x = 1.2 * state.remaining / FLASHBANG.duration;
    state.bar.position.x = -0.6 + state.bar.scale.x / 2;
    const phase = (FLASHBANG.duration - state.remaining) * 3;
    state.stars.forEach((star, i) => { const a = phase + i * Math.PI * 2 / 4; star.position.set(Math.cos(a) * 0.55, -0.2 + Math.sin(a) * 0.09, 0);  });
    const tenth = Math.ceil(state.remaining * 10 - 1e-6);
    if (tenth !== state.labelTime) {
      state.labelTime = tenth;
      const ctx = state.canvas.getContext('2d'); ctx.clearRect(0, 0, 256, 80);
      ctx.fillStyle = '#142936'; ctx.fillRect(0, 0, 256, 80);
      ctx.strokeStyle = '#91eaff'; ctx.lineWidth = 5; ctx.strokeRect(3, 3, 250, 74);
      ctx.fillStyle = '#ffe080'; ctx.font = 'bold 37px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`停止 ${(tenth / 10).toFixed(1)}秒`, 128, 40); state.texture.needsUpdate = true;
    }
  }
  function detonate(grenade) {
    stats.detonated++;
    const center = grenade.end, model = new Group(); model.name = 'Flashbang burst'; model.position.copy(center); root.add(model);
    const flashMat = starMaterial.clone(), ringMat = materials.white.clone(); ringMat.color.setHex(0x9deeff); ringMat.toneMapped = false;
    const core = new Sprite(flashMat); model.add(core);
    const haloMat = haloMaterial.clone(), halo = new Sprite(haloMat); model.add(halo);
    const wave = new Mesh(ring, ringMat); wave.rotation.x = Math.PI / 2; model.add(wave);
    const vertical = new Mesh(ring, ringMat); vertical.quaternion.copy(game.Se.quaternion); model.add(vertical);
    const rays = [];
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI * 2 / 16, direction = new Vector3(Math.cos(a), Math.sin(a * 3) * 0.4, Math.sin(a)).normalize();
      const ray = new Mesh(box, ringMat); ray.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), direction); ray.userData.direction = direction; model.add(ray); rays.push(ray);
    }
    bursts.push({ model, core, halo, wave, vertical, rays, age: 0, ownedMaterials: [flashMat, haloMat, ringMat] });
    light.position.copy(center); light.intensity = 10;
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
    message(hits ? `閃光！ ${hits}体が${FLASHBANG.duration}秒停止` : '閃光！ 命中なし');
    playGearSound(game, 'flash');
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
    const beacon = new Sprite(haloMaterial); beacon.scale.setScalar(0.6); model.add(beacon);
    const trailGeometry = new BufferGeometry(); trailGeometry.setAttribute('position', new Float32Attribute(new Float32Array(18), 3));
    const trailMaterial = new Basic({ color: 0x8feaff, transparent: true, opacity: 0.75, depthWrite: false, fog: false, toneMapped: false });
    const trail = new Line(trailGeometry, trailMaterial); trail.frustumCulled = false; root.add(trail);
    root.add(model); grenades.push({ model, start, end, trail, age: 0, ownedMaterials: [trailMaterial] });
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
      if (effect.age >= FLASHBANG.burstDuration) { removeEffect(effect); bursts.splice(i, 1); continue; }
      const p = effect.age / FLASHBANG.burstDuration;
      effect.core.scale.setScalar(1.5 + Math.min(1, effect.age / 0.09) * 5.5);
      effect.core.material.opacity = Math.max(0, 1 - effect.age / 0.28);
      effect.halo.scale.setScalar(2 + p * 16); effect.halo.material.opacity = Math.exp(-p * 5) * 0.9;
      const radius = 0.25 + Math.min(1, effect.age / 0.6) * FLASHBANG.radius;
      effect.wave.scale.setScalar(radius); effect.vertical.scale.setScalar(radius * 0.85); effect.wave.material.opacity = (1 - p) * 0.85;
      effect.rays.forEach(ray => { ray.position.copy(ray.userData.direction).multiplyScalar(0.2 + p * 7); ray.scale.set(0.012 * (1 - p), 0.012 * (1 - p), 0.2 + (1 - p) * 0.7); });
    }
    for (let i = grenades.length - 1; i >= 0; i--) {
      const grenade = grenades[i]; grenade.age += dt;
      const p = Math.min(1, grenade.age / FLASHBANG.fuse);
      grenade.model.position.copy(grenade.start).lerp(grenade.end, p); grenade.model.position.y += Math.sin(p * Math.PI) * 0.35;
      grenade.model.rotation.x += dt * 14;
      const positions = grenade.trail.geometry.attributes.position;
      for (let j = 0; j < 6; j++) {
        const t = Math.max(0, p - j * 0.065), point = grenade.start.clone().lerp(grenade.end, t); point.y += Math.sin(t * Math.PI) * 0.35;
        positions.setXYZ(j, point.x, point.y, point.z);
      }
      positions.needsUpdate = true;
      if (p === 1) { detonate(grenade); removeEffect(grenade); grenades.splice(i, 1); }
    }
    // Update after detonation so the screen flashes on the same rendered frame.
    const newest = bursts.at(-1);
    light.intensity = newest ? (reducedMotion ? 4 : 10) * Math.exp(-newest.age * 11) : 0;
    if (newest && flashScreenOpacity(newest.age, reducedMotion) > 0) {
      const point = newest.model.position.clone().project(game.Se), x = Math.max(5, Math.min(95, (point.x + 1) * 50)), y = Math.max(5, Math.min(95, (1 - point.y) * 50));
      // Opaque color at every stop also lights the corners; only the center is white.
      glow.style.background = `radial-gradient(ellipse farthest-corner at ${x}% ${y}%,#ffffff 0%,#f3fcfff0 38%,#d6eeffc9 72%,#bddfffad 100%)`;
      glow.style.opacity = String(flashScreenOpacity(newest.age, reducedMotion));
    } else glow.style.opacity = '0';
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
