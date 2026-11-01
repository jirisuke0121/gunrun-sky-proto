const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
function fixture() {
  const window = {};
  vm.runInNewContext(fs.readFileSync('indoor-access.js', 'utf8'), { window });
  return window.createSkyIndoorAccess([
    { minX: 0, maxX: 10, minY: -.5, maxY: 8, minZ: 0, maxZ: 10, entryInset: .95 },
    { minX: 20, maxX: 30, minY: -.5, maxY: 3, minZ: 0, maxZ: 10 },
  ]);
}
const p = (x, y = 0, z = 5) => ({ x, y, z });

test('each building unlocks on interior entry, across storeys, until round reset', () => {
  const access = fixture(), upper = p(5, 4), other = p(25);
  for (const outside of [p(-.01), p(.4), p(5, 0, .4), p(5, 8), p(5, -1)]) access.observe(outside);
  assert.equal(access.allows(upper), false, 'door recesses, roofs, streets and space below the floor do not unlock a building');
  const revision = access.revision;
  access.observe(upper);
  assert.equal(access.allows(p(5)), true, 'entry upstairs also enables the ground floor of the same building');
  assert.equal(access.allows(other), false);
  assert.ok(access.revision > revision, 'entering invalidates cached navigation');
  access.observe(p(-5));
  assert.equal(access.allows(p(5)), true, 'pursuit remains enabled after the human leaves');
  access.reset();
  assert.equal(access.allows(p(5)), false);
  access.reset(other);
  assert.equal(access.allows(other), true, 'an indoor spawn counts as human entry');
  assert.equal(access.allows(p(5)), false);
});

test('protected interiors block crossings, drop entries and cached navigation, but leave rooftops usable', () => {
  const access = fixture(), nav = { nodes: [p(-1), p(11), p(-1, 9), p(11, 9)] };
  const across = { from: 0, to: 1 }, rooftop = { from: 2, to: 3 };
  assert.equal(access.allowsMove(p(-1), p(11)), false, 'a fast action cannot tunnel straight through a building');
  assert.equal(access.allowsMove(p(5, 9), p(5, 4)), false, 'drop entries obey protection');
  assert.equal(access.edgeAllowed(across, nav), false);
  assert.equal(access.edgeAllowed(rooftop, nav), true);
  assert.equal(access.allowsMove(p(-1), p(-2)), true);
  access.observe(p(5));
  assert.equal(access.edgeAllowed(across, nav), true, 'cached membership must reflect the new permission');
  access.reset();
  assert.equal(access.edgeAllowed(across, nav), false);
  assert.equal(access.doorAllowed({ minX: -.1, maxX: .1, minY: 0, maxY: 3, minZ: 4, maxZ: 6 }), false);
});

test('enemy action and knockback guard clears an illegal action and permits pursuit after human entry', () => {
  const access = fixture();
  const vector = (x, y, z) => ({ x, y, z, set(x, y, z) { Object.assign(this, { x, y, z }); } });
  const enemy = { pos: vector(-1, 0, 5), vel: vector(20, 0, 0), act: {}, fall: {}, rise: {},
    update() { this.pos.set(11, 0, 5); }, anim() {} };
  access.updateZombie(enemy, .1);
  assert.equal(enemy.pos.x, -1);
  assert.equal(enemy.vel.x, 0);
  assert.equal(enemy.act, null);
  access.observe(p(5));
  access.updateZombie(enemy, .1);
  assert.equal(enemy.pos.x, 11);
});
