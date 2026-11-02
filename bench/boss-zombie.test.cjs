const assert = require('node:assert/strict');
const boss = require('../boss-zombie.js');
const c = boss.CONFIG;
// Health is exactly five times a hard zombie's (12 pistol rounds -> 60).
assert.equal(boss.health(12), 60);
// Placement: far enough, not too far, and the game's own checks decide.
const nodes = [{ id: 1, x: 5, z: 0 }, { id: 2, x: 30, z: 0 }, { id: 3, x: 60, z: 0 }, { id: 4, x: 0, z: -40 }];
const player = { x: 0, z: 0 };
assert.equal(boss.pick(nodes, player, () => 0).id, 2, 'closer than the minimum is skipped');
assert.equal(boss.pick(nodes, player, () => .99).id, 4, 'farther than the maximum is skipped');
assert.equal(boss.pick(nodes, player, () => 0, n => n.id !== 2).id, 4, 'game checks filter candidates');
assert.equal(boss.pick(nodes, player, () => 0, () => false), null);
// Light hits do not stun-lock or shove; kicks (stun 1.2, push 9) still move it, at half strength.
assert.deepEqual(boss.reaction(.6, 7.8), [0, 7.8 * c.shoveLight], 'pistol');
assert.deepEqual(boss.reaction(.7, 7.5), [0, 7.5 * c.shoveLight], 'knife');
assert.deepEqual(boss.reaction(1.2, 9), [1.2 * c.stunHeavy, 9 * c.shoveHeavy], 'kick');
// HUD fraction is clamped.
assert.equal(boss.fraction(30, 60), .5); assert.equal(boss.fraction(-5, 60), 0); assert.equal(boss.fraction(99, 60), 1); assert.equal(boss.fraction(1, 0), 0);
// spawn(): refuses outside challenge runs, without a slot, or when the point is not allowed; marks the body.
class Zombie { constructor(x, y, z) { this.pos = { x, y, z }; this.hp = 12; this.m = { root: { scale: { setScalar: v => { this.scaled = v; } }, traverse() {} } }; this.hurtArgs = null; }
  hurt(...a) { this.hurtArgs = a; } }
const field = {}; const outs = {}; for (const n of nodes) { field[n.id] = 20; outs[n.id] = [1, 2, 3]; }
const game = () => ({ NAV: { nodes, out: outs }, P: { pos: player }, FIELD: field, zombies: [], Zombie });
const challenge = (over = {}) => ({ profile: () => ({}), spawnAllowed: () => true, reserve: () => true, value: () => 12, ...over });
const sky = { rn() {}, Tt: {}, U: {} };
boss.reset(); assert.equal(boss.spawn(game(), sky, challenge({ profile: () => null })), false, 'practice / mission: no boss');
assert.equal(boss.spawn(game(), sky, challenge({ reserve: () => false })), false, 'no free slot');
assert.equal(boss.spawn(game(), sky, challenge({ spawnAllowed: () => false })), false, 'spacing rules still apply');
assert.equal(boss.request(), true); assert.equal(boss.pending(), true);
const g = game(); assert.equal(boss.spawn(g, sky, challenge()), true);
const z = g.zombies[0];
assert.equal(z.boss, true); assert.equal(z.hp, 60); assert.equal(z.maxHp, 60); assert.equal(z.scaled, c.scale);
assert.equal(z.r, c.radius); assert.equal(z.h, c.height); assert.equal(z.flank, false); assert.equal(z.dropper, false);
assert.equal(boss.pending(), false, 'once on the field it no longer holds a slot back');
assert.equal(boss.spawn(g, sky, challenge()), false, 'only one boss per run');
z.hurt(1, 1, 0, .6, 7.8); assert.deepEqual(z.hurtArgs, [1, 1, 0, 0, 7.8 * c.shoveLight], 'hurt goes through the heavy-body reaction');
boss.begin(); assert.equal(boss.boss, null, 'a new run starts without a boss');
console.log('PASS boss zombie: health x5, placement, light-hit reaction, one per run, safe fallbacks');
