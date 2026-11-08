const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Run the shipped controller, then observe desired world movement rather than
// copying its transformation formulas. Terrain and pointer delivery are covered
// by the browser checks; this fixture isolates camera/input feedback.
function fixture({ touchDevice = true, saved, search = '', yaw = 0 } = {}) {
  let mode = 'play', demo = false, now = 0;
  const listeners = { window: new Map(), document: new Map() };
  const memory = new Map(Object.entries(saved || {}));
  const nodes = new Map();
  const node = () => ({
    value: '', textContent: '', dataset: {}, listeners: new Map(),
    setAttribute() {}, prepend() {}, after() {},
    addEventListener(type, fn) { this.listeners.set(type, fn); },
    querySelector() { return this.select ||= node(); },
  });
  const document = {
    body: { dataset: {} }, hidden: false,
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); },
    querySelectorAll() { return []; }, createElement: node,
    addEventListener(type, fn) { listeners.document.set(type, fn); },
  };
  const c = { yaw, pitch: 0, state: 'normal', onGround: true,
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, eye: 1.6 };
  const inputState = { on: false, id: null, lookId: null, x: 0, y: 0 };
  const game = { c, inputState, keys: {}, z: { over: false }, U: { groundAccel: 40, groundBrake: 32 },
    modeRef: () => mode, demoActive: () => demo };
  const window = { __skyInternals: game, addEventListener(type, fn) { listeners.window.set(type, fn); } };
  const location = { search, href: 'https://fixture.test/index.html' + search };
  const sandbox = { window, document, location, URL, URLSearchParams, Math,
    performance: { now: () => now },
    localStorage: { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) },
    history: { state: null, replaceState(_state, _title, url) { location.href = String(url); } },
    matchMedia: query => ({ matches: query.includes('coarse') ? touchDevice : !touchDevice }),
  };
  vm.runInNewContext(fs.readFileSync(process.env.FOLLOW_CAMERA_SOURCE || require.resolve('../follow-camera.js'), 'utf8'), sandbox);
  const api = window.skyFollowCamera;
  function controls(x, fwd, id = 1) {
    Object.assign(inputState, { on: true, id, x, y: -fwd });
    const out = api.input({ strIn: x, fwdIn: fwd, tmag: Math.hypot(x, fwd) });
    api.step(1 / 60, out);
    return out;
  }
  function world(out) {
    return { x: -Math.sin(c.yaw) * out.fwdIn + Math.cos(c.yaw) * out.strIn,
      z: -Math.cos(c.yaw) * out.fwdIn - Math.sin(c.yaw) * out.strIn };
  }
  function release() {
    Object.assign(inputState, { on: false, id: null, x: 0, y: 0 });
    const out = api.input({ strIn: 0, fwdIn: 0, tmag: 0 });
    api.step(1 / 60, out);
    return out;
  }
  return { api, c, game, inputState, controls, world, release, memory,
    time: value => { now = value; }, setMode: value => { mode = value; }, setDemo: value => { demo = value; },
    emitWindow: name => listeners.window.get(name)?.(),
    hide: () => { document.hidden = true; listeners.document.get('visibilitychange')?.(); },
    show: () => { document.hidden = false; listeners.document.get('visibilitychange')?.(); } };
}
const near = (actual, expected, message, tolerance = 1e-8) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);
const vectorNear = (actual, expected, message) => {
  near(actual.x, expected.x, message + ' x'); near(actual.z, expected.z, message + ' z');
};
const angleError = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// The novice default remains automatic camera, separately from mouse users.
assert.equal(fixture().api.mode, 'after');
assert.equal(fixture().api.manualLook, false, 'ordinary easy mode has automatic view only');
assert.equal(fixture({ touchDevice: false }).api.mode, 'before');
assert.equal(fixture({ touchDevice: false }).api.manualLook, true, 'ordinary PC mouse look remains manual');
assert.equal(fixture({ saved: { 'gunrun-follow-camera-v1': 'before' } }).api.mode, 'before');
assert.equal(fixture({ touchDevice: false, saved: { 'gunrun-follow-camera-v1': 'after' } }).api.mode, 'before');
{
  const touch = fixture(), pc = fixture({ touchDevice: false, saved: { 'gunrun-follow-camera-v1': 'after' } });
  touch.api.setMode('before'); pc.api.setMode('after');
  assert.equal(touch.memory.get('gunrun-follow-camera-v1'), 'before');
  assert.equal(pc.memory.get('gunrun-pc-camera-v1'), 'after');
  assert.equal(pc.memory.get('gunrun-follow-camera-v1'), 'after', 'PC choice does not replace touch choice');
}

// Horizontal and diagonal inputs mean translation immediately. Holding the
// same stick must not draw a circle as the automatic camera catches up.
for (const [x, fwd] of [[1, 0], [-1, 0], [.6, .8], [0, 1], [0, -1]]) {
  const f = fixture(), first = f.world(f.controls(x, fwd));
  assert.ok(Math.hypot(first.x, first.z) > .5, `input ${x},${fwd} must move`);
  near(first.x / Math.hypot(first.x, first.z), x, 'initial lateral direction');
  near(first.z / Math.hypot(first.x, first.z), -fwd, 'initial forward direction');
  for (let i = 0; i < 300; i++) {
    f.api.frame(1 / 60);
    vectorNear(f.world(f.controls(x, fwd)), first, 'held input keeps world direction');
  }
}

// Looking around with the right thumb neither steers the held left thumb nor
// snaps back after an arbitrary timeout. A fresh move uses the new view.
{
  const f = fixture({ search: '?cameraTrial=follow-legacy' }), original = f.world(f.controls(0, 1));
  f.inputState.lookId = 2;
  f.api.look(-Math.PI / 2, -.2);
  const looked = { ...f.api.view };
  for (let i = 0; i < 30; i++) {
    f.api.frame(1 / 60);
    vectorNear(f.world(f.controls(0, 1)), original, 'right thumb does not steer left');
  }
  f.inputState.lookId = null; f.time(10000);
  for (let i = 0; i < 180; i++) {
    f.api.frame(1 / 60);
    vectorNear(f.world(f.controls(0, 1)), original, 'look release does not steer');
  }
  near(angleError(f.api.view.yaw, looked.yaw), 0, 'manual yaw persists');
  f.release();
  const next = f.world(f.controls(0, 1, 3));
  vectorNear(next, { x: -Math.sin(looked.yaw), z: -Math.cos(looked.yaw) }, 'new gesture follows current view');
}

// Returning the thumb to neutral also starts a new directional choice, without
// requiring the player to lift it. Full release must not retain movement.
{
  const f = fixture(); f.controls(1, 0);
  for (let i = 0; i < 90; i++) f.api.frame(1 / 60);
  const view = f.api.view.yaw;
  f.controls(0, 0);
  vectorNear(f.world(f.controls(0, 1)), { x: -Math.sin(view), z: -Math.cos(view) }, 'neutral rebases');
  const stopped = f.release();
  vectorNear(f.world(stopped), { x: 0, z: 0 }, 'release clears desired movement');
}

// A pointer ID change, a paused run, or losing window focus must not carry a
// previous gesture's world reference into the next input.
for (const interrupt of ['pointer', 'pause', 'blur', 'hidden', 'reset']) {
  const f = fixture({ search: '?cameraTrial=follow-legacy' }); f.controls(1, 0);
  f.inputState.lookId = 2; f.api.look(-.7, 0); f.inputState.lookId = null;
  if (interrupt === 'pause') { f.setMode('pause'); f.api.frame(1 / 60); f.setMode('play'); }
  if (interrupt === 'blur') f.emitWindow('blur');
  if (interrupt === 'hidden') { f.hide(); f.show(); }
  if (interrupt === 'reset') f.api.reset();
  const view = f.api.view.yaw;
  const id = interrupt === 'pointer' ? 99 : 1;
  vectorNear(f.world(f.controls(0, 1, id)), { x: -Math.sin(view), z: -Math.cos(view) }, interrupt + ' rebases');
}

// Native movement states own their controls. The easy-mode adapter must not
// turn descending a ladder or releasing a swing into a directional run.
for (const state of ['ladder', 'zip', 'hook', 'swing', 'wallrun', 'ledge']) {
  const f = fixture(); f.c.state = state;
  Object.assign(f.inputState, { on: true, id: 1 });
  const raw = { strIn: .6, fwdIn: -.8, tmag: 1 };
  assert.equal(f.api.input(raw), raw, state + ' keeps native control object');
  near(raw.strIn, .6, state + ' lateral'); near(raw.fwdIn, -.8, state + ' forward');
}

// Releasing a traversal action may assign a new travel heading. A thumb that
// stayed down through that action continues the exit, not a stale old bearing.
for (const state of ['ladder', 'zip', 'hook', 'swing', 'wallrun', 'ledge']) for (const [x, forward] of [[.6, .8], [0, -1]]) {
  const f = fixture(); f.controls(x, forward);
  f.c.state = state; f.controls(x, forward);
  f.c.yaw = .9; f.c.state = 'normal';
  const next = f.world(f.controls(x, forward));
  vectorNear(next, { x: -Math.sin(.9), z: -Math.cos(.9) }, state + ` exit from ${x},${forward} preserves native travel heading`);
}

// A zip/other native action can leave a stale body yaw while its velocity owns
// the actual exit direction. Continuing a held gesture follows that velocity.
for (const state of ['zip', 'hook', 'swing', 'ledge', 'wallrun', 'ladder']) {
  const f = fixture(); f.controls(.6, .8); f.c.state = state; f.controls(.6, .8);
  f.c.yaw = -.4; f.c.vel.x = 4; f.c.vel.z = -3; f.c.state = 'normal';
  vectorNear(f.world(f.controls(.6, .8)), { x: .8, z: -.6 }, state + ' moving exit follows velocity');
}
// A sideways/lower-diagonal approach becomes forward movement in easy mode.
// Preserve that intent when it attaches to a ladder, then allow deliberate
// native descent once the thumb goes neutral and is pushed down.
for (const [x, forward] of [[1, 0], [.8, -.6]]) {
  const f = fixture(); f.controls(x, forward); f.c.state = 'ladder';
  near(f.controls(x, forward).fwdIn, 1, 'held approach continues climbing');
  f.controls(0, 0);
  near(f.controls(0, -1).fwdIn, -1, 'neutral then down descends ladder');
}

// A quick lift/repress can change pointer ID between simulation frames. It
// must end the carried climb intent for every later frame of the new gesture.
{
  const f = fixture(); f.controls(1, 0, 1); f.c.state = 'ladder'; f.controls(1, 0, 1);
  near(f.controls(0, -1, 2).fwdIn, -1, 'new ladder finger can descend');
  near(f.controls(0, -1, 2).fwdIn, -1, 'descent remains native on following frames');
}

// Dragging down means backing away, rather than a sudden half-turn or a wait
// for a hidden reverse timer. Its lower target speed is intentional.
{
  const f = fixture(), raw = f.controls(0, -1);
  vectorNear(f.world(raw), { x: 0, z: 1 }, 'reverse direction');
  near(f.c.yaw, 0, 'reverse does not turn the camera by 180 degrees');
  assert.ok(f.api.speed(6, raw) <= 2.2, 'reverse retains the bounded backing-away pace');
  for (let i = 0; i < 180; i++) { f.api.frame(1 / 60); f.controls(0, -1); }
  near(angleError(f.api.view.yaw, 0), 0, 'backing away does not auto-spin view');
}

// FPS retains camera-relative movement and the core owns its manual look.
{
  const f = fixture({ search: '?camera=before', yaw: .4 });
  Object.assign(f.inputState, { on: true, id: 1 });
  const raw = { strIn: .6, fwdIn: .8, tmag: 1 };
  assert.equal(f.api.input(raw), raw); f.api.step(1 / 60, raw);
  near(f.c.yaw, .4, 'FPS stick never turns the camera');
  assert.equal(f.api.look(.2, .1), false); assert.equal(f.api.frame(1 / 60), null);
}
// PC's explicit auto-camera choice retains W/S drive and A/D steering.
{
  const f = fixture({ touchDevice: false, search: '?camera=after' });
  f.game.keys.KeyW = f.game.keys.KeyD = true;
  const raw = f.api.input({ strIn: 1, fwdIn: 1, tmag: 0 });
  f.api.step(.05, raw);
  assert.ok(f.c.yaw < 0, 'keyboard auto mode still steers');
}
// Automatic following has one camera owner. A second finger/mouse may not
// rotate it or freeze following, including while the left thumb changes course.
for (const touchDevice of [false, true]) {
  const f = fixture({ touchDevice, search: '?camera=after&cameraTrial=follow' });
  f.controls(0, 1); const start = { ...f.api.view };
  f.inputState.lookId = 2; f.api.holdLook(true);
  assert.equal(f.api.look(-.8, .4), true, 'auto consumes manual look');
  near(f.api.view.yaw, start.yaw, 'manual yaw ignored'); near(f.api.view.pitch, start.pitch, 'manual pitch ignored');
  assert.equal(f.api.state.manual, false); assert.equal(f.api.manualLook, false);
  f.controls(1, 0);
  for (let i = 0; i < 120; i++) f.api.frame(1 / 60);
  near(angleError(f.api.view.yaw, f.c.yaw), 0, 'camera still follows with right pointer down', .001);
  assert.equal(f.api.state.lookPolicy, 'auto');
  f.api.setMode('before', false); assert.equal(f.api.look(.2, .1), false); assert.equal(f.api.manualLook, true);
  f.api.setMode('after', false); assert.equal(f.api.look(.2, .1), true); assert.equal(f.api.state.manual, false);
}
// A continuous corner must not require a neutral/release. Test the gradual
// physical return as well as a one-event return, so fixing only the final
// up sample cannot hide an unwanted turn during the thumb's return arc.
for (const side of [-1, 1]) for (const returnFrames of [1, 30]) {
  const f = fixture({ search: '?camera=after&cameraTrial=follow' });
  f.controls(0, 1);
  for (let i = 1; i <= 30; i++) {
    const a = side * Math.PI / 2 * i / 30;
    f.controls(Math.sin(a), Math.cos(a)); f.api.frame(1 / 60);
  }
  const heading = f.c.yaw;
  for (let i = 1; i <= returnFrames; i++) {
    const a = side * Math.PI / 2 * (1 - i / returnFrames);
    f.controls(Math.sin(a), Math.cos(a)); f.api.frame(1 / 60);
    near(angleError(f.c.yaw, heading), 0, 'returning upward continues the corner', .04);
  }
  for (let i = 0; i < 120; i++) { f.controls(0, 1); f.api.frame(1 / 60); }
  near(angleError(f.api.view.yaw, heading), 0, 'camera catches the continuing heading', .001);
  const raw = f.controls(0, -1);
  near(angleError(f.c.yaw, heading), 0, 'same-finger backing never turns the body');
  near(raw.fwdIn, -1, 'same-finger down immediately backs away');
  f.controls(0, 1); near(angleError(f.c.yaw, heading), 0, 'up resumes the same heading');
  // An opposite corner and another return can be chained with the same finger.
  f.controls(-side, 0); const second = f.c.yaw;
  near(angleError(second, heading + side * Math.PI / 2), 0, 'opposite corner uses current travel direction');
  f.controls(0, 1); near(angleError(f.c.yaw, second), 0, 'second return keeps the new direction');
}
// Holding an input with one-pixel angular jitter cannot accumulate camera
// feedback or repeated tiny turn strokes. Radius-only changes are speed only.
{
  const f = fixture({ search: '?camera=after&cameraTrial=follow' });
  f.controls(.6, .8); const heading = f.c.yaw;
  for (let i = 0; i < 600; i++) {
    const a = Math.atan2(.6, .8) + (i % 2 ? 1 : -1) / 56;
    f.controls(Math.sin(a), Math.cos(a)); f.api.frame(1 / 60);
    near(angleError(f.c.yaw, heading), 0, 'touch jitter cannot ratchet heading', .001);
  }
  for (const r of [.3, .6, 1, .4]) {
    f.controls(.6*r, .8*r); near(angleError(f.c.yaw, heading), 0, 'radius changes only speed');
  }
}
console.log('PASS follow camera: continuous corners/returns/reverse, jitter, stable held heading, manual legacy, native traversal, FPS and PC isolation');
