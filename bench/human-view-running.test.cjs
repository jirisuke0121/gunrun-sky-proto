const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { fixture } = require('./human-running.test.cjs');

(async () => {
  const running = await import('../human-running.js');
  const aim = await import('../human-aim.js');
  const flip = await import('../swing-flip.js');
  const { gltf, motion } = await fixture();
  const Group = gltf.scene.constructor, Vector3 = gltf.scene.position.constructor;
  let body; gltf.scene.traverse(o => { if (o.name.startsWith('Body_mesh')) body = o; });
  const Float32Attribute = body.geometry.attributes.position.constructor;
  gltf.scene.updateMatrixWorld(true);
  const neutralTarget=body.geometry.morphAttributes.position[body.morphTargetDictionary[motion.clips.jump.frames[0]]];
  const originalBody=body.geometry.attributes.position.array.slice();
  const neutralPoints=Array.from({length:body.geometry.attributes.position.count},(_,i)=>new Vector3().fromBufferAttribute(body.geometry.attributes.position,i).add(new Vector3().fromBufferAttribute(neutralTarget,i)).applyMatrix4(body.matrixWorld));
  const chestMarkers=[[0,1.8,.14],[0,1.8,-.23]].map(goal=>neutralPoints.reduce((best,p,i)=>p.distanceTo(new Vector3(...goal))<neutralPoints[best].distanceTo(new Vector3(...goal))?i:best,0));
  const footVertices=neutralPoints.flatMap((p,i)=>p.y<.5?[i]:[]);
  function deformed(mesh,i,base=mesh.geometry.attributes.position.array){
    const p=new Vector3().fromArray(base,i*3);
    mesh.morphTargetInfluences.forEach((w,k)=>p.addScaledVector(new Vector3().fromBufferAttribute(mesh.geometry.morphAttributes.position[k],i),w));
    return p;
  }
  const handVertices=[-1,1].map(side=>{
    let best=0,nearest=Infinity;
    for(let i=0;i<body.geometry.attributes.position.count;i++){
      const p=new Vector3().fromBufferAttribute(body.geometry.attributes.position,i).add(new Vector3().fromBufferAttribute(neutralTarget,i)).applyMatrix4(body.matrixWorld);
      const d=p.distanceTo(new Vector3(side*.52495,1.19165,-.0644));if(d<nearest){nearest=d;best=i;}
    }return best;
  });
  const weaponGeometry = new body.geometry.constructor();
  weaponGeometry.setAttribute('position', new Float32Attribute(new Float32Array([-.04,-.08,0,.04,-.08,0,-.04,.04,0,.04,.04,0,-.04,-.08,-.3,.04,-.08,-.3,-.04,.04,-.3,.04,.04,-.3]),3));
  const c = { pos: new Vector3(), vel: new Vector3(0, 0, -6), yaw: 0, pitch: 0, eye: 1.62, onGround: true, state: 'normal' };
  let mode = 'play';
  const sky = { c, U: { weapon: 0, gunOn: true, walkSpeed: 4.6, sprintSpeed: 6, jumpVel: 7.2, gravity: 20 },
    Et: { ammo: 12, reloadT: 0 }, wpc: () => ({ rl: 1.5 }), modeRef: () => mode,
    Se: new Group(), ue: new Group(), fo: new Group(), tl: new Group(), Geom: { Group, Vector3, Float32Attribute }, oe: () => true, mr: [] };
  const prototype=new Group();prototype.name='Sky HG';prototype.add(new body.constructor(weaponGeometry,body.material));sky.tl.add(prototype);
  const nodes = new Map(), keys = new Map(), dataset = {};
  const document = { body: { dataset }, querySelectorAll: () => [],
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, { textContent: '', addEventListener() {} }); return nodes.get(id); },
    addEventListener(type, listener) { keys.set(type, listener); } };
  const context = vm.createContext({ window: { __skyInternals: sky }, document, sessionStorage: { getItem() { return null; }, setItem() {} },
    T2: { GLTFLoader: class {} }, console, ...running, ...aim, ...flip, gltf, motionFixture: motion });
  const source = fs.readFileSync('human-view.js', 'utf8').replace(/^import .*;\n/gm, '');
  // Function declarations are hoisted: replace loading before the module's
  // default Unity model starts, rather than after its initial async call.
  vm.runInContext('readAnimatedHuman = async () => ({gltf, details: motionFixture});\n' + source, context);
  context.window.skyHumanView.select('unity');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(dataset.skyHumanRunStyle, 'parkour');
  const update = (frames = 1, moving = true) => {
    for (let i = 0; i < frames; i++) {
      if (moving) c.pos.addScaledVector(c.vel, 1 / 60);
      context.window.skyHumanView.update(1 / 60);
    }
  };
  update(60);
  assert.equal(dataset.skyHumanClip, 'runForward'); assert.ok(+dataset.skyHumanRunBlend > .99);
  const phase = +dataset.skyHumanGaitPhase;
  assert.ok(phase > .65 && phase < .9, 'actual covered distance drives the running phase');
  const weights = body.morphTargetInfluences;
  assert.ok(Math.abs(weights.reduce((a, b) => a + b, 0) - 1) < .001);
  context.window.skyDash={boost:1,camera:{distance:5.05,shoulder:.24,height:-.19}};update(30,false);
  assert.equal(dataset.skyHumanRunClip,'parkourDash');
  context.window.skyDash=null;update(30,false);

  // Pause while still holding forward: feet and animation must freeze together.
  mode = 'pause'; const paused = [...weights]; update(30, false);
  assert.deepEqual([...weights], paused); assert.equal(+dataset.skyHumanGaitPhase, phase); mode = 'play';
  // A wall can block actual travel even while input/velocity remains nonzero.
  update(10, false); assert.equal(+dataset.skyHumanGaitPhase, phase);
  // Shooting and reloading restore the armed run, then free arms return.
  sky.Et.ammo--; update(6); assert.ok(+dataset.skyHumanRunBlend < .1);
  update(40); assert.ok(+dataset.skyHumanRunBlend > .99);
  sky.Et.reloadT = 1; update(6); assert.ok(+dataset.skyHumanRunBlend < .1); sky.Et.reloadT = 0;
  update(40);
  for (let i = 0; i < 30; i++) { c.yaw += .015; c.vel.set(-Math.sin(c.yaw) * 6, 0, -Math.cos(c.yaw) * 6); update(); }
  const holder = sky.ue.children.find(o => o.name === 'Unity challenge human');
  assert.ok(holder.rotation.z < -.02 && holder.rotation.z >= -.2, 'body banks inside a continuous turn');
  // A turn immediately before catching a bar must not tilt the grip line.
  // Check the two transformed hand contacts, rather than the midpoint metric.
  c.state = 'swing'; c.onGround = false; c.yaw = -Math.PI / 2;
  c.swing = { direction: [1, 0], angle: -.6, pivot: [c.pos.x + 1.2, c.pos.y + 1.8, c.pos.z] };
  c.vel.set(5, -3, 0); update(1, false);
  holder.updateMatrixWorld(true);
  const sample = running.sampleClip(motion.clips.parkourSwing, (c.swing.angle + 1.15) / 2.3);
  const contacts = ['left', 'right'].map(side => {
    const a = motion.hands.parkourSwing[sample.lo][side], b = motion.hands.parkourSwing[sample.hi][side];
    return gltf.scene.localToWorld(new Vector3(...a.map((v, k) => v + (b[k] - v) * sample.fraction)));
  });
  assert.ok(Math.abs(contacts[1].y - contacts[0].y) < .001,
    `both hands share the horizontal bar after turning (${Math.abs(contacts[1].y - contacts[0].y)})`);
  const carried = sky.ue.children.find(o => o.name === 'Unity human held weapon');
  assert.equal(carried.visible, false, 'both hands are occupied on a bar');
  c.state = 'normal'; c.swing = null; c.swingFlight = { age: .1, angle: .7, direction: [1, 0] };
  c.vel.set(8, 4, 0); update(1, false);
  assert.equal(dataset.skyHumanClip, 'swingFlight');
  assert.equal(carried.visible, false, 'the two-hand release/reach pose has no dangling gun');
  const physicalFlight = JSON.stringify({ pos: c.pos.toArray(), vel: c.vel.toArray(), yaw: c.yaw });
  for (const age of [0, .125, .25, .375, .5]) {
    c.swingFlight = { age, angle: .7, direction: [1, 0], perfect: true, flipDuration: .5 };
    update(1, false);
    assert.equal(JSON.stringify({ pos: c.pos.toArray(), vel: c.vel.toArray(), yaw: c.yaw }), physicalFlight);
    assert.equal(+dataset.skyHumanFlipPhase, age / .5);
    assert.ok(Math.abs(+dataset.skyHumanReleaseAccent - flip.flipPose(age, .5).pitch) < .001);
    assert.equal(context.window.skyHumanView.autoAimReady({ pos: new Vector3(20, 3, 0) }), age >= .5,
      'automatic fire waits for the full turn, then resumes immediately');
  }
  c.swingFlight.age = .125;
  const flightShot = context.window.skyHumanView.prepareShot(new Vector3(0, 3, 4), new Vector3(0, 0, -1), 20);
  assert.ok(flightShot, 'an intentional airborne shot remains available');
  assert.equal(c.swingFlight, null, 'shooting immediately gives the hands back to the weapon pose');
  assert.equal(carried.visible, true);
  assert.ok(+dataset.skyHumanGripError < .04, 'the first shot after release has matching visible grips');
  c.state = 'normal'; c.swing = c.swingFlight = null; c.onGround = true;
  c.yaw = 0; c.vel.set(0, 0, 0); update(60, false);
  // Walking and strafing keep their original clips with a continuous foot phase.
  c.vel.set(0, 0, -4.6); const beforeWalk = +dataset.skyHumanGaitPhase; update();
  assert.equal(dataset.skyHumanClip, 'walkForward'); assert.notEqual(+dataset.skyHumanGaitPhase, 0); assert.notEqual(+dataset.skyHumanGaitPhase, beforeWalk);
  c.vel.set(6, 0, 0); update(20); assert.equal(dataset.skyHumanClip, 'runRight'); assert.ok(+dataset.skyHumanRunBlend < .02);
  c.vel.set(0, 0, 6); update(20); assert.equal(dataset.skyHumanClip, 'runBack'); assert.ok(+dataset.skyHumanRunBlend < .02);
  // New moves are out of scope: retain each of the already implemented actions.
  c.onGround = false; c.vel.set(0, 7.2, -6); update(10); assert.equal(dataset.skyHumanClip, 'jump');
  c.state = 'slide'; c.onGround = true; update(10); assert.equal(dataset.skyHumanClip, 'slide');
  c.state = 'ladder'; c.vel.set(0, 4.2, 0); update(10); assert.equal(dataset.skyHumanClip, 'ladder');
  c.state = 'normal'; c.vel.set(0, 0, 0); update(30); assert.equal(dataset.skyHumanClip, 'idle'); assert.ok(+dataset.skyHumanRunBlend < .01);
  for (const kind of ['vault', 'mantle', 'catch']) {
    c.state = 'ledge'; c.onGround = false;
    c.ledge = { kind, sx: c.pos.x, sy: c.pos.y, sz: c.pos.z, tx: c.pos.x, ty: c.pos.y + 1.5, tz: c.pos.z - .8, dx: 0, dz: -1, t: .3, dur: .5 };
    c.vel.set(0, 0, 0); update(1, false);
    assert.equal(dataset.skyHumanClip, kind); assert.ok(+dataset.skyHumanHandError < .001, 'hands pinned to the ledge during support');
    mode = 'pause'; const pausedPosition = holder.position.toArray(); update(1, false); assert.ok(holder.position.toArray().every((v, i) => Math.abs(v - pausedPosition[i]) < 1e-10)); mode = 'play';
  }
  c.state = 'normal'; c.ledge = null; c.onGround = true; update(30, false);
  // Wall pose uses the wall normal and tangential travel, independently of aim.
  for (const normal of [{x:1,z:0},{x:-1,z:0},{x:0,z:1},{x:0,z:-1}]) {
    c.state='wallrun';c.onGround=false;c.wallN=normal;c.vel.set(-normal.z*8,0,normal.x*8);c.yaw=.7;
    update(20);
    assert.equal(dataset.skyHumanClip,'wallrun');
    assert.ok(['parkourWallLeft','parkourWallRight'].includes(dataset.skyHumanAction));
    const yaw=holder.rotation.y, phase=+dataset.skyHumanWallPhase;
    assert.ok(Math.abs(Math.sin(yaw)*normal.x+Math.cos(yaw)*normal.z)<1e-9,'body faces along wall');
    c.yaw-=1.1;update(1,false);
    assert.ok(Math.abs(Math.atan2(Math.sin(holder.rotation.y-yaw),Math.cos(holder.rotation.y-yaw)))<1e-9,'looking around cannot turn feet into wall');
    assert.equal(+dataset.skyHumanWallPhase,phase,'blocked player does not tread in place');
    mode='pause';const frozen=[...weights];update(5,false);assert.deepEqual([...weights],frozen);mode='play';
    c.state='normal';c.vel.y=6;update(10);assert.equal(dataset.skyHumanAction,'parkourJump');
    c.onGround=true;c.vel.set(0,0,-6);update(30);assert.equal(dataset.skyHumanClip,'runForward');
  }
  // Real barrel/arm alignment must hold on the first shot, not only after the
  // run has faded out. Use an off-axis target as automatic aim can select one.
  for(const state of ['normal','jump','slide','wallrun'])for(const pitch of [-1.45,-.6,0,.7,1.45])for(const yaw of [-2.4,0,2.4]){
    c.state=state==='jump'?'normal':state;c.onGround=state!=='jump';c.pitch=pitch;c.yaw=yaw;
    c.vel.set(0,state==='jump'?3:0,-6);c.slideT=.5;sky.Se.rotation.set(pitch,yaw,0,'YXZ');update(1,false);
    const origin=sky.Se.position.clone(),direction=new Vector3(.18,.02,-1).normalize().applyQuaternion(sky.Se.quaternion);
    const target=origin.clone().addScaledVector(direction,18);
    const shot=context.window.skyHumanView.prepareShot(origin,direction,18);
    assert.ok(shot,'third-person shot uses the rendered weapon');
    const weapon=sky.ue.children.find(o=>o.name==='Unity human held weapon');
    const bore=new Vector3(0,0,-1).applyQuaternion(weapon.quaternion);
    assert.ok(bore.dot(shot.direction)>1-1e-8,`${state}/${pitch}/${yaw}: barrel follows actual ray`);
    assert.ok(shot.origin.distanceTo(context.window.skyHumanView.getMuzzleWorld())<1e-8);
    assert.ok(shot.direction.dot(target.clone().sub(shot.origin).normalize())>1-1e-8);
    assert.ok(+dataset.skyHumanGripError<.04,`${state}/${pitch}/${yaw}: both hands reach their grips (${dataset.skyHumanGripError})`);
    // Inspect the final deformed mesh independently of the IK error metric.
    const profile=vm.runInContext('heldWeapon',context);
    holder.updateMatrixWorld(true);
    for(let j=0;j<2;j++){
      const i=handVertices[j],p=new Vector3().fromBufferAttribute(body.geometry.attributes.position,i);
      body.morphTargetInfluences.forEach((w,k)=>p.addScaledVector(new Vector3().fromBufferAttribute(body.geometry.morphAttributes.position[k],i),w));
      p.applyMatrix4(body.matrixWorld);
      const target=weapon.localToWorld(new Vector3(...(j===0?profile.grip:profile.support)));
      assert.ok(p.distanceTo(target)<.065,`${state}/${pitch}/${yaw}: visible wrist ${j} contacts gun (${p.distanceTo(target)})`);
    }
    const chest=chestMarkers.map(i=>deformed(body,i).applyMatrix4(body.matrixWorld));
    const chestForward=chest[0].clone().sub(chest[1]).normalize();
    const towardsTarget=target.clone().sub(chest[0].clone().add(chest[1]).multiplyScalar(.5)).normalize();
    assert.ok(chestForward.dot(towardsTarget)>.84,`${state}/${pitch}/${yaw}: visible chest follows target (${chestForward.dot(towardsTarget)})`);
    for(const i of footVertices)assert.ok(deformed(body,i).distanceTo(deformed(body,i,originalBody))<1e-6,'aim leaves visible feet in their movement pose');
    for(const name of ['Eyes_mesh001','Gaz_mask_mesh001001','Hood_mesh001']){
      const attachment=gltf.scene.getObjectByName(name);
      assert.ok(attachment.geometry.attributes.position.array.every(Number.isFinite),`${name} follows upper body with finite vertices`);
    }
    assert.ok(body.geometry.attributes.position.array.every(Number.isFinite));assert.ok(body.geometry.attributes.normal.array.every(Number.isFinite));
  }
  c.state='normal';c.onGround=true;c.yaw=0;c.pitch=0;sky.Se.rotation.set(0,0,0);update(30,false);
  sky.U.gunOn=false;c.vel.set(0,0,0);update(30,false);
  c.onGround=false;c.vel.y=-5;update(20,false);
  c.onGround=true;c.vel.set(0,0,0);
  const physical=JSON.stringify({p:c.pos.toArray(),v:c.vel.toArray(),yaw:c.yaw,state:c.state});
  update(3,false);
  assert.equal(dataset.skyHumanClip,'landing');
  const landWeight=weights[body.morphTargetDictionary.parkourLand_compress];
  assert.ok(landWeight>.3,'the real mesh visibly compresses on ordinary touchdown');
  holder.updateMatrixWorld(true);
  const minBoot=Math.min(...footVertices.map(i=>deformed(body,i).applyMatrix4(body.matrixWorld).y))-c.pos.y;
  assert.ok(minBoot>-.06,`landing boots stay above the floor (${minBoot})`);
  assert.equal(JSON.stringify({p:c.pos.toArray(),v:c.vel.toArray(),yaw:c.yaw,state:c.state}),physical,'landing visuals never move the player capsule');
  mode='pause';const heldLand=[...weights];update(10,false);assert.deepEqual([...weights],heldLand);mode='play';
  c.vel.set(0,0,-6);update(20);assert.equal(dataset.skyHumanClip,'runForward');
  c.onGround=false;c.swingFlight={age:.12,angle:.7,direction:[0,-1]};update(1,false);
  assert.ok(+dataset.skyHumanReleaseAccent>.9,'bar release adds a visible compact turn');
  const flightState=JSON.stringify({p:c.pos.toArray(),v:c.vel.toArray(),yaw:c.yaw,state:c.state});
  update(1,false);assert.equal(JSON.stringify({p:c.pos.toArray(),v:c.vel.toArray(),yaw:c.yaw,state:c.state}),flightState);
  c.swingFlight=null;c.onGround=false;update(1,false);assert.equal(+dataset.skyHumanReleaseAccent,0,'another airborne action cancels the visual turn immediately');
  c.onGround=true;c.vel.set(0,0,0);update(20,false);sky.U.gunOn=true;
  // Return from first person or a respawn without accumulating an old distance.
  keys.get('keydown')({ code: 'KeyV', repeat: false }); update(1, false); assert.equal(dataset.skyHumanView, 'first');
  keys.get('keydown')({ code: 'KeyV', repeat: false }); c.pos.z -= 100; c.vel.z = -6; update(1, false);
  assert.equal(+dataset.skyHumanGaitPhase, 0);
  assert.ok(body.morphTargetInfluences.every(Number.isFinite));
  console.log('PASS actual human-view integration: moving/blocked feet, walk/run/strafe/back, firing/reload, pause, jump/slide/ladder, ledge contacts, wall run/look/pause/exit, view switch/respawn; level two-hand bar contact after a turn, unarmed release/reach and same-frame airborne fire; 60 first-shot barrel/ray, visible chest direction, foot preservation and actual deformed wrist contacts');
})().catch(error => { console.error(error); process.exitCode = 1; });
