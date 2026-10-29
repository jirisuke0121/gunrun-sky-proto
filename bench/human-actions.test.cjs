const assert = require('node:assert/strict');
const { fixture } = require('./human-running.test.cjs');
(async () => {
  const { solveLimb, actionPose, jumpPhase, ledgeAnchor, landingPose, releaseAccent } = await import('../human-actions.js');
  const { addParkourRun } = await import('../human-running.js');
  const distance = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));
  for (const target of [[0, 0, 0], [0, 4, 0], [.4, .2, .4], [-1, -.4, 0]]) {
    const s = solveLimb([0, 0, 0], target, .45, .4, [0, 0, 1]);
    assert.ok(Math.abs(distance([0, 0, 0], s.joint) - .45) < .00001);
    assert.ok(Math.abs(distance(s.joint, s.end) - .4) < .00001);
  }
  assert.ok(jumpPhase(7.2, 7.2, 0) < jumpPhase(1, 7.2, 0));
  assert.ok(jumpPhase(-4, 7.2, 0) > jumpPhase(0, 7.2, 0));
  assert.ok(jumpPhase(0, 7.2, .14) > .8);
  const compressed = landingPose(.25), upright = landingPose(1);
  assert.ok(compressed.vertex([0, 1.23, -.025], 0)[1] < upright.vertex([0, 1.23, -.025], 0)[1] - .18);
  for (const side of [-1, 1]) assert.ok(Math.abs(compressed.vertex([side*.24,.12,-.04],0)[1]-.12)<.003,'boots remain grounded under flexed knees');
  assert.equal(releaseAccent(0).pitch,0);assert.equal(releaseAccent(.4).pitch,0);
  assert.ok(releaseAccent(.12).pitch>.9&&releaseAccent(.12).twist>.2);
  assert.equal(releaseAccent(.12,true).pitch,releaseAccent(.12).pitch*.25);
  const anchor = ledgeAnchor({ sx: 0, sz: 0, tx: 1, tz: 0, ty: 2.002, dx: 1, dz: 0 }, [{ minX: .6, maxX: 2, minZ: -1, maxZ: 1, maxY: 2 }]);
  assert.ok(Math.abs(anchor.x - .625) < .001); assert.equal(anchor.y, 2.015);
  const { gltf, motion } = await fixture(); let body;
  gltf.scene.traverse(o => { if (o.name.startsWith('Body_mesh')) body = o; });
  addParkourRun(gltf.scene, motion, body.geometry.attributes.position.constructor);
  for (const kind of ['parkourJump', 'parkourVault', 'parkourMantle', 'parkourCatch']) {
    assert.equal(motion.clips[kind].frames.length, 13);
    assert.equal(motion.hands[kind].length, 13);
    gltf.scene.traverse(mesh => {
      if (!mesh.isMesh) return;
      for (const name of motion.clips[kind].frames) {
        const index = mesh.morphTargetDictionary[name]; assert.ok(Number.isInteger(index));
        assert.ok(mesh.geometry.morphAttributes.position[index].array.every(Number.isFinite));
        assert.ok(mesh.geometry.morphAttributes.normal[index].array.every(Number.isFinite));
      }
      assert.ok(mesh.geometry.morphAttributes.position.length <= 256, 'within minimum WebGL2 texture-array layer limit');
    });
    for (let i = 0; i <= 12; i++) {
      const p = actionPose(kind, i / 12);
      assert.ok(Object.values(p.hands).every(h => h.every(Number.isFinite)));
      assert.ok(p.contactWeight >= 0 && p.contactWeight <= 1);
      if (kind !== 'parkourJump' && i <= 6) assert.equal(p.contactWeight, 1);
      if (i === 12) assert.equal(p.contactWeight, 0);
    }
  }
  for(const kind of ['parkourSwing','parkourSwingFlight']) {
    for(const name of motion.clips[kind].frames)gltf.scene.traverse(mesh=>{
      if(!mesh.isMesh)return;
      const index=mesh.morphTargetDictionary[name];assert.ok(Number.isInteger(index));
      assert.ok(mesh.geometry.morphAttributes.position[index].array.every(Number.isFinite));
      assert.ok(mesh.geometry.morphAttributes.normal[index].array.every(Number.isFinite));
    });
  }
  const reach=actionPose('parkourSwingFlight',.5),settle=actionPose('parkourSwingFlight',1);
  assert.ok(reach.hands.left[1]>settle.hands.left[1]+.4,'airborne reach settles into a landing posture');
  const back=actionPose('parkourSwing',0),front=actionPose('parkourSwing',1),foot=[.24,.12,-.04];
  assert.ok(front.vertex(foot,0)[2]>back.vertex(foot,0)[2]+.7,'feet drive forward across the swing arc');
  console.log('PASS action poses: reachable limb lengths, rise/apex/fall/land, collision-edge anchor, 4 × 13 poses on 7 real meshes, finite normals and WebGL2 layer bounds');
})().catch(e => { console.error(e); process.exitCode = 1; });
