// 超ベリーハード（試作）のゾンビの種類（zombie-types.js）。順位対象の難易度では何もしないこと、
// 俊足・重装の体力と速さ、押し出しへの強さ、見た目の材質を種類ごとに共有すること、を確かめる。
const assert = require('node:assert/strict');
(async () => {
  const { createZombieTypes } = await import('../zombie-types.js');
  let seed = 5; const random = () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  Math.random = random;
  let clones = 0;
  const material = name => ({ name, color: { r: .5, g: .5, b: .5 }, emissive: { setRGB(...v) { this.v = v; } }, userData: {},
    clone() { clones++; return { ...material(name), source: this }; } });
  const shared = [material('body'), material('head')];
  const models = [{ kind: 'unity-standard' }];
  const body = (kind = 'unity-standard', extra = {}) => {
    const meshes = shared.map(m => ({ isMesh: true, material: m }));
    return { hp: 12, r: .3, dead: false, pushes: [], m: { src: { kind }, root: { scale: { v: 1, multiplyScalar(s) { this.v *= s; } }, traverse(fn) { meshes.forEach(fn); } }, meshes },
      hurt(amount, dx, dz, stun, push) { this.pushes.push(push); }, ...extra };
  };
  const game = { z: { t: 0, mission: null }, Jt: [], zombieModels: () => models };
  let profile = { id: 'hard' };
  global.window = { skyChallenge: { profile: () => profile } };
  const types = createZombieTypes(game, { debug: {} });

  // Ranked tier: nothing is touched.
  game.Jt = [body(), body()]; types.tick();
  assert.ok(game.Jt.every(z => z.kind === undefined && z.hp === 12 && z.m.root.scale.v === 1));
  assert.equal(types.modelChoice(), null, 'the page keeps its own model choice'); assert.equal(types.speed(game.Jt[0], 7), 7);

  // Trial tier without the evolved look loaded: runners and walkers only.
  profile = { id: 'extreme', types: true };
  assert.equal(types.modelChoice(), 'unity-standard');
  game.Jt = Array.from({ length: 400 }, () => body()); types.tick();
  const count = kind => game.Jt.filter(z => z.kind === kind).length;
  assert.equal(count('brute'), 0); assert.ok(Math.abs(count('runner') / 400 - .25) < .06, 'about a quarter are runners: ' + count('runner'));
  const runner = game.Jt.find(z => z.kind === 'runner'), walker = game.Jt.find(z => z.kind === 'walker');
  assert.equal(runner.hp, 6); assert.ok(Math.abs(types.speed(runner, 8) - 8.8) < 1e-9); assert.ok(Math.abs(runner.m.root.scale.v - .92) < 1e-9);
  assert.equal(walker.hp, 12); assert.equal(types.speed(walker, 8), 8); assert.equal(walker.m.root.scale.v, 1);
  assert.ok(runner.m.meshes.every((mesh, i) => mesh.material !== shared[i] && mesh.material.userData.zombieKind === 'runner'), 'runners are tinted');
  assert.ok(walker.m.meshes.every((mesh, i) => mesh.material === shared[i]), 'walkers keep the shared material');
  assert.equal(clones, shared.length, 'one tinted material per source material, shared by every runner');

  // With the evolved look loaded: the model decides the brute, and its share is rolled by the model builder.
  models.push({ kind: 'unity-evolved', scene: { traverse() {} } });
  let evolved = 0; for (let i = 0; i < 2000; i++) if (types.modelChoice() === 'unity-evolved') evolved++;
  assert.ok(Math.abs(evolved / 2000 - .2) < .03, 'a fifth of new bodies get the evolved look: ' + evolved);
  game.Jt = [body('unity-evolved'), ...Array.from({ length: 800 }, () => body())]; types.tick();
  const brute = game.Jt[0];
  assert.equal(brute.kind, 'brute'); assert.equal(brute.hp, 24); assert.ok(Math.abs(types.speed(brute, 8) - 7.04) < 1e-9); assert.equal(brute.r, .34);
  brute.hurt(1, 1, 0, .2, 6.5); assert.deepEqual(brute.pushes, [3.25], 'a brute takes half of every shove');
  assert.ok(brute.m.meshes.every((mesh, i) => mesh.material === shared[i]), 'the brute keeps its own model, no tint');
  // 25 % of all bodies are runners overall: 0.25 / 0.8 of the standard-looking ones.
  assert.ok(Math.abs(count('runner') / 800 - .3125) < .05, 'runner share among standard bodies: ' + count('runner'));

  // Bosses, stalkers and corpses are left alone; a body is dressed once.
  const special = [body('unity-standard', { boss: true }), body('unity-standard', { stalker: true }), body('unity-standard', { dead: true }), body('unity-standard', { born: 'boss' })];
  game.Jt = special; types.tick(); assert.ok(special.every(z => z.kind === undefined && z.hp === 12));
  const once = body('unity-evolved'); game.Jt = [once]; types.tick(); types.tick(); assert.equal(once.hp, 24);
  // Missions: off.
  game.z.mission = {}; const plain = body(); game.Jt = [plain]; types.tick(); assert.equal(plain.kind, undefined);
  console.log('PASS types: inert on ranked tiers, runner 6 hp x1.1 speed, brute 24 hp x0.88 speed half shove, shares, shared tint material, special bodies untouched');
})().catch(e => { console.error(e); process.exit(1); });
