const assert = require('node:assert/strict');
(async () => {
  const { isPerfectRelease, flipPose, flipDuration } = await import('../swing-flip.js');
  const { releaseVelocity } = await import('../parkour-swing.js');
  assert.ok(isPerfectRelease(.75, 3));
  for (const angle of [-.7, .55, .95]) assert.equal(isPerfectRelease(angle, 3), false);
  assert.equal(isPerfectRelease(.75, -3), false);
  assert.ok(isPerfectRelease(.35, 3, [.2, .5]));
  const normal = releaseVelocity([.6, .8], .75, 3, 7.2);
  const good = releaseVelocity([.6, .8], .75, 3, 7.2, true);
  assert.ok(Math.abs(good[0] - normal[0] - .36) < 1e-8);
  assert.ok(Math.abs(good[2] - normal[2] - .48) < 1e-8);
  assert.ok(Math.abs(good[1] - normal[1] - .2) < 1e-8);
  const free = (x, y) => y >= 0;
  const duration = flipDuration([0, 2, 0], [8, 5, 0], 20, free, [], 'a', .3);
  assert.equal(duration, .5);
  const short = flipDuration([0, .1, 0], [8, -1, 0], 20, free, [], 'a', .3);
  assert.ok(short < duration);
  let previous = 0;
  for (let i = 0; i <= 100; i++) {
    const pose = flipPose(i / 100 * duration, duration);
    assert.ok(pose.pitch >= previous && pose.tuck >= 0 && pose.tuck <= 1);
    previous = pose.pitch;
  }
  assert.equal(flipPose(duration * .92, duration).pitch, Math.PI * 2);
  assert.equal(flipPose(duration, duration).tuck, 0);
  console.log('PASS: forward timing, bounded bonus, short-flight recovery, one full forward turn and untuck before touchdown');
})().catch(e => { console.error(e); process.exitCode = 1; });
