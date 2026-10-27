const assert = require('node:assert/strict');
const { fixture } = require('./human-running.test.cjs');
(async () => {
  const { wallRunPose, wallRunFrame } = await import('../human-wallrun.js');
  const { addParkourRun } = await import('../human-running.js');
  for (const normal of [{x:1,z:0},{x:-1,z:0},{x:0,z:1},{x:0,z:-1}]) for (const sign of [-1,1]) {
    const velocity={x:-normal.z*8*sign-normal.x*1.5,z:normal.x*8*sign-normal.z*1.5};
    const frame=wallRunFrame(normal,velocity);
    assert.ok(Math.abs(Math.sin(frame.yaw)*normal.x+Math.cos(frame.yaw)*normal.z)<1e-10);
    assert.ok((-normal.x*Math.cos(frame.yaw)+normal.z*Math.sin(frame.yaw))*frame.side>.99);
  }
  for (const side of [-1,1]) for (let i=0;i<16;i++) {
    const pose=wallRunPose(side,i/16), opposite=wallRunPose(side,(i/16+.5)%1);
    assert.ok(Math.hypot(...pose.feet[-1].map((v,k)=>v-opposite.feet[-1][k]))>.3,'boots cycle');
    const palm=pose.hands[side<0?'right':'left'];
    assert.ok(Math.abs(palm[0]-side*.43)<.001,'wall palm remains on the surface');
    for(const foot of Object.values(pose.feet))assert.ok(foot[0]*side<=.431,'boot does not penetrate the wall');
  }
  const {gltf,motion}=await fixture(),meshes=[];gltf.scene.traverse(o=>{if(o.isMesh)meshes.push(o);});
  addParkourRun(gltf.scene,motion,meshes[0].geometry.attributes.position.constructor);
  for(const kind of ['parkourWallLeft','parkourWallRight']){
    const clip=motion.clips[kind];assert.equal(clip.frames.length,17);
    for(const mesh of meshes){
      const targets=clip.frames.map(n=>mesh.geometry.morphAttributes.position[mesh.morphTargetDictionary[n]]);
      for(const t of targets)assert.ok(t.array.every(Number.isFinite),`${mesh.name}: finite wall pose`);
      assert.deepEqual(targets[0].array,targets.at(-1).array,`${mesh.name}: seamless loop`);
      assert.ok(targets.some(t=>t.array.some((v,i)=>Math.abs(v-targets[0].array[i])>.01)),`${mesh.name}: follows the pose`);
    }
  }
  console.log('PASS wall run: 8 wall/direction combinations, alternating boots, wall palm, 7 meshes / 34 finite poses with seamless loops');
})().catch(error=>{console.error(error);process.exitCode=1;});
