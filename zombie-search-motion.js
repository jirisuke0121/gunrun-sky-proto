// Add a looking-around pose over the existing walk, without moving the body
// or changing navigation. Restore it before each mixer update, including frames
// whose distant-zombie animation is skipped.
export function createZombieSearchMotion(game, runtime, search, flashbang) {
  const rigs = new WeakMap();
  const key = name => name.replace(/^mixamorig:?/i, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  function rigFor(enemy) {
    const model = enemy.m;
    let rig = rigs.get(model);
    if (rig) return rig;
    const bones = {};
    model.root.traverse(b => { if (b.isBone) bones[key(b.name)] = b; });
    const pick = (...names) => names.map(name => bones[key(name)]).find(Boolean);
    const entries = [
      [pick('Base HumanSpine1', 'Spine', 'spine_01') || (!model.sk && model.torso), 0.12],
      [pick('Base HumanRibcage', 'Spine2', 'spine_03'), 0.18],
      [pick('Base HumanNeck', 'Neck', 'neck_01'), 0.28],
      [pick('Base HumanHead', 'Head', 'head') || (!model.sk && model.neck), 0.42],
    ].filter(([bone]) => bone).map(([bone, share]) => ({ bone, share, base: bone.quaternion.clone() }));
    const Vector = model.root.position.constructor;
    rig = { entries, weight: 0, gaze: 0, applied: false, offset: enemy.phase || 0,
      parent: model.root.quaternion.clone(), turn: model.root.quaternion.clone(),
      up: new Vector(), right: new Vector(), worldRight: new Vector() };
    rigs.set(model, rig);
    return rig;
  }
  function restore(rig) {
    if (!rig?.applied) return;
    for (const entry of rig.entries) entry.bone.quaternion.copy(entry.base);
    rig.applied = false;
  }
  function blocked(enemy) {
    return enemy.dead || enemy.remove || enemy.rise || enemy.fall || enemy.act || enemy.spawnT > 0 ||
      !enemy.onGround || enemy.h < 1 || enemy.stun > 0 || enemy.atkT > 0 || enemy.reach || enemy.bash ||
      flashbang.blinded(enemy) || !!game.searchNav.decoyTarget(enemy);
  }
  function animate(enemy, dt) {
    const rig = rigFor(enemy);
    if (!rig.entries.length) return;
    const phase = search.state(enemy)?.phase;
    const playing = runtime.mode === 'play' && !game.z.over;
    const allowed = game.U.loseSight && !game.z.mission && !blocked(enemy);
    const target = allowed && enemy.lost ? phase === 'search' ? 1 : phase === 'patrol' ? 0.5 : 0 : 0;
    // Combat, stuns and special traversal own the rig immediately. A normal
    // reacquisition blends back into the chase over roughly 0.2 seconds.
    if (!allowed) { rig.weight = 0; return; }
    if (playing) rig.weight += (target - rig.weight) * (1 - Math.exp(-Math.max(0, dt) * 12));
    if (rig.weight < 0.001) { rig.weight = 0; return; }
    const t = game.z.t + rig.offset;
    // A slow left/right scan with a brief hold at either side. Each enemy has
    // its own phase; it does not point at the hidden player's location.
    const gaze = Math.tanh(Math.sin(t * 1.55) * 2) * 0.9 * rig.weight;
    rig.gaze = gaze;
    enemy.m.root.getWorldQuaternion(rig.parent);
    rig.worldRight.set(1, 0, 0).applyQuaternion(rig.parent);
    for (const entry of rig.entries) {
      const { bone, share } = entry;
      entry.base.copy(bone.quaternion);
      bone.parent.getWorldQuaternion(rig.parent).invert();
      // Unity and Mixamo use different bone axes. Turn around world up,
      // expressed in the parent's space, rather than assuming local Y is up.
      rig.up.set(0, 1, 0).applyQuaternion(rig.parent);
      rig.turn.setFromAxisAngle(rig.up, gaze * share);
      bone.quaternion.premultiply(rig.turn);
      rig.right.copy(rig.worldRight).applyQuaternion(rig.parent);
      rig.turn.setFromAxisAngle(rig.right, Math.sin(t * 2.1) * 0.055 * share * rig.weight);
      bone.quaternion.premultiply(rig.turn);
    }
    rig.applied = true;
  }
  const originalAnim = game.ri.prototype.anim;
  game.ri.prototype.anim = function animateZombieSearch(dt) {
    restore(rigs.get(this.m));
    originalAnim.call(this, dt);
    animate(this, dt);
  };
  return { state(enemy) {
    const rig = rigs.get(enemy.m);
    return { weight: rig?.weight || 0, gaze: rig?.applied ? rig.gaze : 0,
      bones: rig?.entries.map(entry => entry.bone.name) || [] };
  } };
}
