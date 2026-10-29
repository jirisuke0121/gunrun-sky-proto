const assert = require('node:assert/strict'), fs = require('node:fs');
(async () => {
  const { canSeeDecoy, DECOY } = await import('../skill-decoy.js');
  const p = { x: 0, y: 0, z: 0 }, enemy = (x = 4, y = 0) => ({ pos: { x, y, z: 0 }, h: 1.8, spawnT: 0 });
  assert.equal(canSeeDecoy(enemy(), p, () => null), true);
  assert.equal(canSeeDecoy(enemy(), p, () => ({ t: 1 })), false, 'walls block acquisition');
  assert.equal(canSeeDecoy(enemy(17), p, () => null), false);
  assert.equal(canSeeDecoy(enemy(0, 5), p, () => null), false, 'another floor does not acquire through a ceiling');
  for (const flag of ['dead', 'remove', 'rise', 'fall']) assert.equal(canSeeDecoy({ ...enemy(), [flag]: true }, p, () => null), false);
  assert.equal(canSeeDecoy({ ...enemy(), spawnT: 1 }, p, () => null), false);
  assert.ok(DECOY.cooldown > DECOY.duration);
  for (const file of ['index.html', 'canyon.html']) {
    const s = fs.readFileSync(file, 'utf8');
    for (const script of s.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      if (script[1].includes('src=')) continue;
      new (require('node:vm').Script)(script[2].replace(/^import .*;\n/gm, ''));
    }
    assert.ok(s.includes('skyDecoy?.navigationFor(this)'));
  }
  console.log('PASS decoy visibility, occlusion, floors, spawn/death exclusions and both complete game scripts parse');
})().catch(e => { console.error(e); process.exitCode = 1; });
