const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { fixture } = require('./human-running.test.cjs');

(async () => {
  const running = await import('../human-running.js');
  const { gltf, motion } = await fixture();
  const Group = gltf.scene.constructor, Vector3 = gltf.scene.position.constructor;
  let body; gltf.scene.traverse(o => { if (o.name.startsWith('Body_mesh')) body = o; });
  const Float32Attribute = body.geometry.attributes.position.constructor;
  const c = { pos: new Vector3(), vel: new Vector3(0, 0, -6), yaw: 0, pitch: 0, eye: 1.62, onGround: true, state: 'normal' };
  let mode = 'play';
  const sky = { c, U: { weapon: 0, gunOn: true, walkSpeed: 4.6, sprintSpeed: 6, jumpVel: 7.2, gravity: 20 },
    Et: { ammo: 12, reloadT: 0 }, wpc: () => ({ rl: 1.5 }), modeRef: () => mode,
    Se: new Group(), ue: new Group(), fo: new Group(), tl: new Group(), Geom: { Group, Vector3, Float32Attribute }, oe: () => true, mr: [] };
  const nodes = new Map(), keys = new Map(), dataset = {};
  const document = { body: { dataset }, querySelectorAll: () => [],
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, { textContent: '', addEventListener() {} }); return nodes.get(id); },
    addEventListener(type, listener) { keys.set(type, listener); } };
  const context = vm.createContext({ window: { __skyInternals: sky }, document, sessionStorage: { getItem() { return null; }, setItem() {} },
    T2: { GLTFLoader: class {} }, console, ...running, gltf, motionFixture: motion });
  const source = fs.readFileSync('human-view.js', 'utf8').replace(/^import .*;\n/m, '');
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
  // Return from first person or a respawn without accumulating an old distance.
  keys.get('keydown')({ code: 'KeyV', repeat: false }); update(1, false); assert.equal(dataset.skyHumanView, 'first');
  keys.get('keydown')({ code: 'KeyV', repeat: false }); c.pos.z -= 100; c.vel.z = -6; update(1, false);
  assert.equal(+dataset.skyHumanGaitPhase, 0);
  assert.ok(body.morphTargetInfluences.every(Number.isFinite));
  console.log('PASS actual human-view integration: moving/blocked feet, walk/run/strafe/back, firing/reload, pause, existing jump/slide/ladder, stop, view switch and respawn');
})().catch(error => { console.error(error); process.exitCode = 1; });
