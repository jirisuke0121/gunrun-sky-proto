// Direction edges and the pursuit trace: pure math (threat-math.js).
const assert = require('node:assert/strict');
const m = require('../threat-math.js');
const P = { x: 0, z: 0 };
const at = (dx, dz, extra = {}) => ({ pos: { x: dx, y: 0, z: dz }, ...extra });
// yaw 0 looks toward -z (ahead), +x is to the right.
assert.ok(Math.abs(m.relativeAngle(0, 0, 0, -5, 0)) < 1e-9, 'ahead = 0');
assert.ok(Math.abs(m.relativeAngle(0, 0, 5, 0, 0) - Math.PI / 2) < 1e-9, 'right = +pi/2');
assert.ok(Math.abs(m.relativeAngle(0, 0, -5, 0, 0) + Math.PI / 2) < 1e-9, 'left = -pi/2');
assert.ok(Math.abs(Math.abs(m.relativeAngle(0, 0, 0, 5, 0)) - Math.PI) < 1e-9, 'behind = pi');
// Turning the camera turns the edges with it: after yaw = pi/2 the old "right" is behind.
assert.ok(Math.abs(m.relativeAngle(0, 0, 5, 0, Math.PI / 2)) > m.BACK, 'yaw rotates the frame');

let e = m.edges(P, 0, [at(0, -6)]);
assert.deepEqual(e, { l: 0, r: 0, b: 0 }, 'a pursuer ahead is visible: no edge');
e = m.edges(P, 0, [at(0, 6)]);
assert.ok(e.b > .3 && e.l === 0 && e.r === 0, 'behind lights the bottom edge: ' + JSON.stringify(e));
e = m.edges(P, 0, [at(6, 0)]);
assert.ok(e.r > .3 && e.l === 0 && e.b === 0, 'right');
e = m.edges(P, 0, [at(-6, 0)]);
assert.ok(e.l > .3 && e.r === 0 && e.b === 0, 'left');
// Closer is stronger; beyond the range nothing.
assert.ok(m.edges(P, 0, [at(0, 3)]).b > m.edges(P, 0, [at(0, 9)]).b, 'closer is stronger');
assert.equal(m.edges(P, 0, [at(0, 17)]).b, 0, 'out of range');
// Only living pursuers count; the strongest one on a side wins (no summing, so a crowd does not turn the edge solid).
for (const dead of [{ dead: true }, { remove: true }, { rise: {} }, { spawnT: 1 }]) assert.deepEqual(m.edges(P, 0, [at(0, 4, dead)]), { l: 0, r: 0, b: 0 }, JSON.stringify(dead));
const one = m.edges(P, 0, [at(0, 5)]).b;
assert.equal(m.edges(P, 0, [at(0, 5), at(1, 8), at(-2, 9)]).b, one, 'strongest wins');
// A pursuer on a diagonal ahead (within 50 degrees) is on screen.
assert.deepEqual(m.edges(P, 0, [at(4, -6)]), { l: 0, r: 0, b: 0 }, 'front diagonal');

// Sample + trace.
const s = m.sample(P, [at(0, -4), at(8, 0), at(30, 0), at(0, 2, { dead: true })], z => z.pos.z < 0);
assert.equal(s.nearest, 4); assert.equal(s.within10, 2);
assert.equal(s.visible, 1, 'in view counts only living pursuers the callback accepts');
const t = m.createTrace(3);
t.add(1, { nearest: 4, within10: 2, visible: 1 });
t.add(2, { nearest: 10, within10: 0, visible: 0 });
t.add(12, { nearest: 5, within10: 1, visible: 0 });
t.add(35, { nearest: 1, within10: 1, visible: 1 });        // window 3 is past the cap
t.add(1, { nearest: Infinity, within10: 0, visible: 0 });  // nobody alive: not a sample
const snap = t.snapshot();
assert.equal(snap.w.length, 2);
assert.deepEqual(snap.w[0], { i: 0, n: 2, near: 7, min: 4, in10: 1, vis: .5, none: .5, c6: .5 });
assert.deepEqual(snap.w[1], { i: 1, n: 1, near: 5, min: 5, in10: 1, vis: 0, none: 1, c6: 1 });
assert.ok(JSON.stringify(snap).length < 400, 'the record stays tiny');
t.reset(); assert.equal(t.snapshot().w.length, 0);
console.log('PASS threat-math: edge sides/angles/range/strength, alive-only, trace windows and cap');

// Three steps by distance (range 16): 10-16 m thin, 6-10 m wider, under 6 m widest.
const strengthAt = d => m.edges(P, 0, [at(0, d)]).b;
assert.equal(m.tier(0), 0);
assert.equal(m.tier(strengthAt(14)), 1);
assert.equal(m.tier(strengthAt(10.5)), 1);
assert.equal(m.tier(strengthAt(9.5)), 2);
assert.equal(m.tier(strengthAt(6.5)), 2);
assert.equal(m.tier(strengthAt(5.5)), 3);
assert.equal(m.tier(strengthAt(1)), 3);
assert.ok(Math.abs(m.distanceOf(strengthAt(8)) - 8) < 1e-9);
console.log('PASS threat-math: distance steps');

// Far marker: 16-35 m only, same sides, faint and growing as it gets closer, alive-only, none in front.
const farB = d => m.far(P, 0, [at(0, d)]).b;
assert.equal(farB(15.9), 0);
assert.equal(farB(35), 0);
assert.ok(farB(16) > farB(25) && farB(25) > farB(34) && farB(34) >= 0.12 && farB(16) <= 0.37 + 1e-9);
assert.equal(m.far(P, 0, [at(0, -25)]).b + m.far(P, 0, [at(0, -25)]).l + m.far(P, 0, [at(0, -25)]).r, 0, 'ahead draws nothing');
assert.ok(m.far(P, 0, [at(25, 0)]).r > 0 && m.far(P, 0, [at(-25, 0)]).l > 0);
assert.equal(m.far(P, 0, [at(0, 25, { dead: true })]).b, 0);
console.log('PASS threat-math: far marker');
