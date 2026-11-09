// Default touch mapping (2026-11-10): the thumb always means a direction in the picture
// currently on screen, and the camera swings calmly behind sideways travel.
// The earlier turn-and-commit mapping stays testable in follow-camera.test.cjs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const DT = 1 / 60;
const wrap = n => Math.atan2(Math.sin(n), Math.cos(n));
const deg = n => n * 180 / Math.PI;

function fixture(search = '') {
  let now = 0;
  const node = () => ({ value: '', textContent: '', dataset: {}, setAttribute() {}, prepend() {}, after() {},
    addEventListener() {}, querySelector() { return this.select ||= node(); } });
  const nodes = new Map();
  const document = { body: { dataset: {} }, hidden: false,
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); },
    querySelectorAll() { return []; }, createElement: node, addEventListener() {} };
  const c = { yaw: 0, pitch: 0, state: 'normal', onGround: true, pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, eye: 1.6 };
  const touch = { on: false, id: null, lookId: null, x: 0, y: 0 };
  const game = { c, inputState: touch, keys: {}, z: { over: false }, U: { groundAccel: 40, groundBrake: 32 }, modeRef: () => 'play', demoActive: () => false };
  const window = { __skyInternals: game, addEventListener() {} };
  const location = { search, href: 'https://fixture.test/index.html' + search };
  vm.runInNewContext(fs.readFileSync(require.resolve('../follow-camera.js'), 'utf8'), { window, document, location, URL, URLSearchParams, Math, Number,
    performance: { now: () => now }, localStorage: { getItem: () => null, setItem() {} },
    history: { state: null, replaceState() {} }, matchMedia: q => ({ matches: q.includes('coarse') }) });
  const api = window.skyFollowCamera;
  // One game frame with the thumb at `a` radians clockwise from straight up (null = lifted).
  function frame(a, magnitude = 1, id = 1) {
    api.frame(DT);
    let out;
    if (a === null) { Object.assign(touch, { on: false, id: null, x: 0, y: 0 }); out = api.input({ strIn: 0, fwdIn: 0, tmag: 0 }); }
    else {
      const x = Math.sin(a) * magnitude, f = Math.cos(a) * magnitude;
      Object.assign(touch, { on: true, id, x, y: -f }); out = api.input({ strIn: x, fwdIn: f, tmag: magnitude });
    }
    api.step(DT, out); now += DT * 1000;
    return out;
  }
  const hold = (a, seconds, magnitude) => { let out; for (let i = 0; i < Math.round(seconds * 60); i++) out = frame(a, magnitude); return out; };
  // Direction the runner travels in the picture: 0 = up the screen, + = right.
  const shown = () => wrap(api.view.yaw - c.yaw);
  return { api, c, touch, frame, hold, shown };
}

// 1. Eight directions: the runner goes where the thumb points in the picture, at running pace.
for (let i = 0; i < 8; i++) {
  const a = wrap(i * Math.PI / 4), f = fixture(), out = f.hold(a, .25);
  assert.ok(Math.abs(deg(wrap(f.shown() - a))) < 12, `thumb ${deg(a)}° shows as ${deg(f.shown()).toFixed(1)}°`);
  assert.equal(out.fwdIn, 1); assert.equal(out.reversing, false);
  assert.equal(f.api.speed(8, out), 8, 'every direction runs at full pace, including toward the camera');
}

// 2. Any thumb path, any length of time: thumb and picture never drift apart.
{
  const f = fixture(); let a = 0, worst = 0, seed = 7;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 60 * 40; i++) {
    a = wrap(a + (random() - .5) * .12 + (i % 300 === 0 ? (random() - .5) * 3 : 0));   // slow roll + an occasional flick
    f.frame(a);
    if (i % 300 > 20 && Math.abs(a) > .3) worst = Math.max(worst, Math.abs(deg(wrap(f.shown() - a))));
  }
  assert.ok(worst < 15, `thumb and picture stay together (worst ${worst.toFixed(1)}°)`);
}

// 3. Realistic tremor (±6° at 4 Hz for 10 s) around "up-left" leaves the bearing in the picture unchanged.
//    The turn-and-commit mapping adds every outward wobble to the heading under the same thumb.
function tremor(search) {
  const f = fixture(search); f.hold(-.6, .5);
  const view0 = f.api.view.yaw, start = wrap(f.c.yaw - view0); let turned = 0, last = f.c.yaw, spread = 0;
  for (let i = 0; i < 600; i++) {
    f.frame(-.6 + .105 * Math.sin(i / 60 * 2 * Math.PI * 4));
    turned += wrap(f.c.yaw - last); last = f.c.yaw;
    spread = Math.max(spread, Math.abs(deg(wrap(f.shown() + .6))));
  }
  return { spread, f, extra: Math.abs(deg(turned)) };
}
{
  const now = tremor('');
  assert.ok(now.spread < 9, `tremor stays tremor in the picture (${now.spread.toFixed(1)}°)`);
  const before = tremor('?cameraTrial=follow-turn');
  assert.ok(before.extra > 180, `turn-and-commit ratchets under the same thumb (${before.extra.toFixed(0)}° of extra turning)`);
}

// 4. "Up" always means "go where the camera is looking" – after a turn, a stop, anything.
{
  const f = fixture(); f.hold(0, .5); f.hold(-Math.PI / 2, .4); f.hold(0, .3);
  assert.ok(Math.abs(deg(f.shown())) < 1, 'up after a left turn runs straight into the picture');
  const heading = f.c.yaw; f.hold(0, 2);
  assert.ok(Math.abs(deg(wrap(f.c.yaw - heading))) < .5, 'holding up is a straight line');
}

// 5. Camera: calm swing behind sideways travel, none when running at the camera, slower in the air.
{
  const f = fixture(); f.hold(Math.PI / 2, .2); const a = f.api.view.yaw; f.hold(Math.PI / 2, 1);
  const rate = Math.abs(wrap(f.api.view.yaw - a));
  assert.ok(rate > 1.2 && rate < 1.75, `sideways hold swings the view at ${rate.toFixed(2)} rad/s (limit 1.7)`);
  const g = fixture(); g.hold(Math.PI, 1); const turnedBack = g.api.view.yaw; g.hold(Math.PI, 2);
  assert.ok(Math.abs(deg(turnedBack)) < 15, `turning back nudges the view only briefly (${deg(turnedBack).toFixed(1)}°)`);
  assert.ok(Math.abs(deg(wrap(g.api.view.yaw - turnedBack))) < 1, 'running toward the camera does not spin the picture');
  const h = fixture(); h.c.onGround = false; h.hold(Math.PI / 2, .2); const b = h.api.view.yaw; h.hold(Math.PI / 2, 1);
  assert.ok(Math.abs(wrap(h.api.view.yaw - b)) < rate * .65, 'the view turns more slowly during a jump');
}

// 6. Small corrections arrive (no dead zone) but are gentler than the thumb near straight up.
{
  const f = fixture(); f.hold(.09, .2);
  const got = deg(f.shown());
  assert.ok(got > 1.5 && got < deg(.09) * .75, `5° of thumb steers ${got.toFixed(1)}°`);
  const g = fixture(); g.hold(.4, .2);
  assert.ok(Math.abs(deg(g.shown()) - deg(.4)) < 3, 'beyond 16° the thumb angle is used as is');
}

// 7. Lifting the thumb: the runner keeps facing its way, and the view settles behind it for the next push.
{
  const f = fixture(); f.hold(-Math.PI / 2, .3); const heading = f.c.yaw;
  const out = f.hold(null, .2); assert.equal(out.fwdIn, 0);
  const paused = f.api.view.yaw; f.hold(null, 2);
  assert.ok(Math.abs(deg(wrap(f.c.yaw - heading))) < .01, 'release does not turn the runner');
  assert.ok(Math.abs(deg(wrap(f.api.view.yaw - heading))) < 2, 'view settles behind the runner');
  assert.ok(Math.abs(wrap(f.api.view.yaw - paused)) > .5, 'it waits a moment before moving');
  f.hold(0, .2); assert.ok(Math.abs(deg(wrap(f.c.yaw - heading))) < 3, 'next push up continues ahead');
}

// 8. Ladder/zip/hook/swing/ledge/wallrun keep their own controls; a held thumb leaves them along
//    the exit path and eases to its screen direction without a jump in heading.
for (const state of ['ladder', 'zip', 'hook', 'swing', 'wallrun', 'ledge']) {
  const f = fixture(); f.touch.on = true; f.touch.id = 1; f.c.state = state;
  const raw = { strIn: .6, fwdIn: -.8, tmag: 1 };
  assert.equal(f.api.input(raw), raw, state + ' keeps native input');
  const g = fixture(); g.hold(.9, .2); g.c.state = state; g.frame(.9);
  g.c.vel.x = 4; g.c.vel.z = -3; g.c.state = 'normal';
  const exit = Math.atan2(-4, 3); let previous = exit, jump = 0;
  g.c.yaw = exit;
  for (let i = 0; i < 90; i++) { g.frame(.9); jump = Math.max(jump, Math.abs(wrap(g.c.yaw - previous))); previous = g.c.yaw; }
  assert.ok(deg(jump) < 6, `${state} exit eases (largest step ${deg(jump).toFixed(1)}°/frame)`);
  assert.ok(Math.abs(deg(wrap(g.shown() - .9))) < 8, state + ' exit ends on the thumb\'s screen direction');
}
{
  const f = fixture(); f.hold(Math.PI / 2, .1); f.c.state = 'ladder';
  assert.equal(f.frame(Math.PI / 2).fwdIn, 1, 'held approach keeps climbing the ladder');
}

// 9. Neutral thumb stops; stick distance is pace only; the right finger cannot move the view.
{
  const f = fixture(); f.hold(.8, .3);
  const stop = f.frame(.8, .1); assert.equal(stop.fwdIn, 0); assert.equal(stop.motionScale, 0);
  const slow = f.frame(.8, .5); assert.ok(slow.motionScale > .3 && slow.motionScale < .6);
  const view = { ...f.api.view }; f.touch.lookId = 2;
  assert.equal(f.api.look(-.8, .4), true); assert.equal(f.api.view.yaw, view.yaw); assert.equal(f.api.manualLook, false);
}
console.log('PASS screen stick: 8 directions, thumb=picture over 40 s, tremor, up=view, calm camera, soft centre, release, action exits');
