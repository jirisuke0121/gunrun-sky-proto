const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { fixture } = require('./human-running.test.cjs');

(async () => {
  const running = await import('../human-running.js');
  const aim = await import('../human-aim.js');
  const { gltf, motion } = await fixture();
  const Group = gltf.scene.constructor, Vector3 = gltf.scene.position.constructor;
  let body; gltf.scene.traverse(o => { if (o.name.startsWith('Body_mesh')) body = o; });
  const Float32Attribute = body.geometry.attributes.position.constructor;
  gltf.scene.updateMatrixWorld(true);
  const neutralTarget=body.geometry.morphAttributes.position[body.morphTargetDictionary[motion.clips.jump.frames[0]]];
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
    T2: { GLTFLoader: class {} }, console, ...running, ...aim, gltf, motionFixture: motion });
  const source = fs.readFileSync('human-view.js', 'utf8').replace(/^import .*;\n/gm, '');
  vm.runInContext(source + '\nreadAnimatedHuman = async () => ({gltf, details: motionFixture});', context);
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
  c.yaw = 0;
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
  // Real barrel/arm alignment must hold on the first shot, not only after the
  // run has faded out. Use an off-axis target as automatic aim can select one.
  for(const state of ['normal','jump','slide'])for(const pitch of [-1.45,-.6,0,.7,1.45])for(const yaw of [-2.4,0,2.4]){
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
    assert.ok(shot.direction.dot(target.sub(shot.origin).normalize())>1-1e-8);
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
    assert.ok(body.geometry.attributes.position.array.every(Number.isFinite));assert.ok(body.geometry.attributes.normal.array.every(Number.isFinite));
  }
  c.state='normal';c.onGround=true;c.yaw=0;c.pitch=0;sky.Se.rotation.set(0,0,0);update(30,false);
  // Return from first person or a respawn without accumulating an old distance.
  keys.get('keydown')({ code: 'KeyV', repeat: false }); update(1, false); assert.equal(dataset.skyHumanView, 'first');
  keys.get('keydown')({ code: 'KeyV', repeat: false }); c.pos.z -= 100; c.vel.z = -6; update(1, false);
  assert.equal(+dataset.skyHumanGaitPhase, 0);
  assert.ok(body.morphTargetInfluences.every(Number.isFinite));
  console.log('PASS actual human-view integration: moving/blocked feet, walk/run/strafe/back, firing/reload, pause, jump/slide/ladder, ledge contacts, view switch/respawn; 45 first-shot barrel/ray and actual deformed wrist contacts');
})().catch(error => { console.error(error); process.exitCode = 1; });
