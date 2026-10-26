const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const source = fs.readFileSync('flashbang.js', 'utf8');
  const { FLASHBANG: config, flashCanReach } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const origin = {x:0,y:1.1,z:0};
  const enemy = (x,y,z) => ({pos:{x,y,z},h:1.8,dead:false});
  let rays = [];
  const clear = (...ray) => {rays.push(ray);return null};
  assert.equal(config.duration,3); assert.equal(config.radius,6);
  assert.equal(flashCanReach(origin,enemy(2,0,0),clear),true);
  assert.equal(flashCanReach(origin,enemy(7,0,0),clear),false);
  assert.equal(flashCanReach(origin,enemy(0,8,0),clear),false,'another floor outside the 3D radius is excluded');
  assert.equal(flashCanReach(origin,enemy(2,0,0),()=>({t:1})),false,'wall blocks flash');
  assert.equal(flashCanReach(origin,{...enemy(2,0,0),dead:true},clear),false);
  assert.equal(flashCanReach(origin,{...enemy(2,0,0),fall:{wait:1}},clear),false,'hidden spawn excluded');
  assert.equal(flashCanReach(origin,{...enemy(2,0,0),rise:{t:-1}},clear),false);
  const ray = rays[0];assert.ok(Math.abs(Math.hypot(...ray.slice(3,6))-1)<1e-9);assert.ok(ray[6]<2.1);
  for (const file of ['index.html','canyon.html']) {
    const html = fs.readFileSync(file,'utf8');
    assert.ok(html.includes('z.t+=n;window.skyFlashbang?.tick(n);'));
    assert.ok(html.includes('function ol(){window.skyFlashbang?.reset();'));
    assert.ok(html.includes('window.skyFlashbang?.modeChanged(n)'));
    assert.ok(html.includes('id="tFlash"')&&html.includes('id="hFlash"'));
    assert.ok(!html.includes('煙幕'));
  }
  assert.ok(!fs.readFileSync('enhancements.js','utf8').includes('smokeBlocks'));
  console.log('PASS flash radius, height, wall occlusion, hidden/dead exclusion, simulation/reset/UI integration on both maps');
})();
