const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const source = fs.readFileSync('flashbang.js', 'utf8');
  const { FLASHBANG: config, flashCanReach, flashScreenOpacity } = await import('../flashbang.js');
  const origin = {x:0,y:1.1,z:0};
  const enemy = (x,y,z) => ({pos:{x,y,z},h:1.8,dead:false});
  let rays = [];
  const clear = (...ray) => {rays.push(ray);return null};
  assert.equal(config.duration,4); assert.equal(config.radius,8);
  assert.equal(flashCanReach(origin,enemy(2,0,0),clear),true);
  assert.equal(flashCanReach(origin,enemy(7,0,0),clear),true,'expanded radius reaches seven metres');
  assert.equal(flashCanReach(origin,enemy(8.1,0,0),clear),false);
  assert.equal(flashCanReach(origin,enemy(0,8,0),clear),false,'another floor outside the 3D radius is excluded');
  assert.equal(flashCanReach(origin,enemy(2,0,0),()=>({t:1})),false,'wall blocks flash');
  assert.equal(flashCanReach(origin,{...enemy(2,0,0),dead:true},clear),false);
  assert.equal(flashCanReach(origin,{...enemy(2,0,0),fall:{wait:1}},clear),false,'hidden spawn excluded');
  assert.equal(flashCanReach(origin,{...enemy(2,0,0),rise:{t:-1}},clear),false);
  const ray = rays[0];assert.ok(Math.abs(Math.hypot(...ray.slice(3,6))-1)<1e-9);assert.ok(ray[6]<2.1);
  assert.equal(flashScreenOpacity(0),0.84);
  assert.equal(flashScreenOpacity(0.05),0.84,'brief peak before fading');
  assert.ok(flashScreenOpacity(0.35)>0.4,'visible full-screen afterglow');
  for (const reduced of [false,true]) {
    let previous=1;
    for(let age=0;age<1.1;age+=0.005){const value=flashScreenOpacity(age,reduced);assert.ok(value>=0&&value<=previous,'one pulse fades without strobing');previous=value}
    assert.equal(flashScreenOpacity(reduced?0.4:0.8,reduced),0);
  }
  assert.equal(flashScreenOpacity(0,true),0.22);
  assert.equal(flashScreenOpacity(-1),0);assert.equal(flashScreenOpacity(NaN),0);
  assert.ok(config.burstDuration>=config.screenDuration);
  assert.ok(source.includes('#bddfffad 100%'),'corners retain a visible flash');
  assert.ok(source.includes('pointer-events:none'),'flash does not block controls');
  for (const file of ['index.html','canyon.html']) {
    const html = fs.readFileSync(file,'utf8');
    assert.ok(html.includes('z.t+=n;window.skyFlashbang?.tick(n);'));
    const start = html.lastIndexOf('function ol(');
    assert.ok(start>=0&&html.slice(start,start+250).includes('window.skyFlashbang?.reset();'));
    assert.ok(html.includes('window.skyFlashbang?.modeChanged(n)'));
    assert.ok(html.includes('id="tFlash"')&&html.includes('id="hFlash"'));
    assert.ok(html.includes('周囲8mのゾンビを4秒停止'));
    assert.ok(!html.includes('煙幕'));
  }
  assert.ok(!fs.readFileSync('enhancements.js','utf8').includes('smokeBlocks'));
  console.log('PASS expanded radius, 4s stun, single full-screen pulse/afterglow, reduced motion, height, wall occlusion, simulation/reset/UI integration on both maps');
})();
