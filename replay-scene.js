import { buildHeldWeapon } from './human-aim.js?v=20261030-rotation-cache-v2';
import { DETAIL_ACTORS, ENEMY_CLIPS, sampleEnemies } from './replay-detail.js?v=20261031-ghost-scene-v1';

export function createReplayScene(game, avatar) {
  const { Geom, ue } = game, fallback = [...avatar.children];
  const root = new Geom.Group(); root.name = 'Recorded combat'; root.visible = false; ue.add(root);
  let human = null, held = null, weaponIndex = -1;
  const weaponNames = ['Sky HG', 'Sky SG', 'Sky SMG', 'Sky MG', 'Sky Unity HG', 'Sky Easy Shotgun', 'Sky Easy M4', 'Sky Easy Rail Gun', 'Sky Easy Beam Gun', 'Sky Easy Cluster Launcher', 'Sky Easy Rocket Launcher', 'Sky Easy M79', 'Sky Jump Gun'];
  const gripOffset = new Geom.Vector3();
  const enemies = [];
  const tracerGeometry = new Geom.BufferGeometry(), positions = new Float32Array(6);
  tracerGeometry.setAttribute('position', new Geom.Float32Attribute(positions, 3));
  const tracer = new Geom.Line(tracerGeometry, new Geom.Basic({ color: 0xffd27a, transparent: true, opacity: .85, depthWrite: false }));
  tracer.frustumCulled = false; tracer.visible = false; root.add(tracer);
  function enemyAt(slot, kind) {
    let actor = enemies[slot];
    if (actor?.kind === kind) return actor;
    if (actor) { actor.mixer.stopAllAction(); actor.mixer.uncacheRoot(actor.inner); actor.materials.forEach(m => m.dispose()); actor.root.removeFromParent(); enemies[slot] = null; }
    const sources = game.zombieModels?.() || [], source = sources.find(e => e.kind === (kind ? 'unity-evolved' : 'unity-standard')) || sources[0];
    if (!source || !window.T2?.clone) return null;
    const container = new Geom.Group(), inner = T2.clone(source.scene), materials = [];
    container.name = 'Recorded zombie';
    inner.rotation.y = Math.PI; container.add(inner); root.add(container);
    inner.traverse(node => {
      if (!node.isMesh) return;
      node.castShadow = node.receiveShadow = false;
      const ownMaterial = original => {
        const material = original.clone(); materials.push(material);
        // Match the live model's ambient fill without mutating its materials.
        if (material.emissive && material.map) { material.emissive.setHex(0xffffff); material.emissiveMap = material.map; material.emissiveIntensity = .3; }
        return material;
      };
      node.material = Array.isArray(node.material) ? node.material.map(ownMaterial) : ownMaterial(node.material);
      if (node.isSkinnedMesh && source.lo) node.geometry = source.lo;
    });
    actor = { root: container, inner, mixer: new T2.AnimationMixer(inner), source, kind, materials, clip: null, action: null };
    enemies[slot] = actor; return actor;
  }
  function update(ghost, time, pose, first) {
    root.visible = true;
    const shots = ghost.detail?.shots || [];
    let lo = 0, hi = shots.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (shots[mid][0] <= time) lo = mid + 1; else hi = mid; }
    const shot = shots[lo - 1], firing = !!shot && time - shot[0] < .24;
    let hand = null;
    if (!human) {
      human = window.skyHumanView?.createReplayAvatar?.() || null;
      if (human) { human.root.name = 'Recorded human'; avatar.add(human.root); }
    }
    fallback.forEach(child => { child.visible = !human; });
    if (human) {
      human.root.visible = !first;
      human.root.position.set(0, 0, 0); human.root.rotation.set(0, Math.PI, 0);
      avatar.scale.set(1, 1, 1);
      // The original recording stores locomotion states, not the original rig.
      // State-based animation is deliberately an approximation, even for v1.
      const later = game.sampleReplay(ghost.samples, Math.min(time + .05, ghost.samples.at(-1)[0]));
      const moving = Math.hypot(later[1] - pose[1], later[3] - pose[3]) > .005;
      hand = human.animate(time, moving, firing ? 10 : pose[6]);
    }
    const weapon = shot?.[1] ?? shots[0]?.[1];
    if (weapon !== undefined && weapon !== weaponIndex) {
      held?.root.removeFromParent(); held = null; weaponIndex = weapon;
      const prototype = (weapon < 4 ? game.tl : game.fo).getObjectByName(weaponNames[weapon]);
      if (prototype) { held = buildHeldWeapon(prototype, weapon, Geom); root.add(held.root); }
    }
    if (held) {
      held.root.visible = !!hand && weapon !== undefined && !first && ![4, 5, 6, 9].includes(pose[6]);
      if (held.root.visible) {
        const yaw = firing ? Math.atan2(-(shot[5] - shot[2]), -(shot[7] - shot[4])) : pose[4];
        const pitch = firing ? Math.atan2(shot[6] - shot[3], Math.hypot(shot[5] - shot[2], shot[7] - shot[4])) : -.3;
        held.root.rotation.set(pitch, yaw, 0, 'YXZ');
        gripOffset.set(...held.grip).applyQuaternion(held.root.quaternion);
        held.root.position.copy(hand).sub(gripOffset);
      }
    }
    const rows = sampleEnemies(ghost.detail?.frames, time);
    for (let i = 0; i < DETAIL_ACTORS; i++) {
      const row = rows[i];
      if (!row) { if (enemies[i]) enemies[i].root.visible = false; continue; }
      const actor = enemyAt(i, row[5]); if (!actor) continue;
      actor.root.visible = true; actor.root.position.set(row[1] / 100, row[2] / 100, row[3] / 100);
      actor.root.rotation.y = row[4] / 1000; actor.root.scale.setScalar(row[6] / 1000);
      const clip = actor.source.clips[ENEMY_CLIPS[row[7]]] || actor.source.clips.Walking;
      if (actor.clip !== clip) {
        actor.mixer.stopAllAction(); actor.clip = clip; actor.action = clip ? actor.mixer.clipAction(clip).setLoop(T2.LoopOnce, 1).play() : null;
        if (actor.action) actor.action.clampWhenFinished = true;
      }
      if (actor.action) { actor.action.enabled = true; actor.action.paused = false; actor.action.time = Math.min(Math.max(0, clip.duration - .00001), row[8] / 1000); actor.mixer.update(0); }
    }
    tracer.visible = !!shot && time - shot[0] < .07;
    if (tracer.visible) { for (let i = 0; i < 6; i++) positions[i] = shot[i + 2] / 100; tracerGeometry.attributes.position.needsUpdate = true; }
  }
  function hide() { root.visible = false; if (human) human.root.visible = false; fallback.forEach(child => { child.visible = true; }); }
  return { update, hide, get stats() { return { human: !!human, actors: root.visible ? enemies.filter(e => e?.root.visible).length : 0, allocatedActors: enemies.filter(Boolean).length }; } };
}
