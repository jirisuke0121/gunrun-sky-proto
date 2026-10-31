const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
// Reuse the renderer-independent builder used by the existing corner checks.
const prefix=fs.readFileSync(__dirname+'/central-corners.test.cjs','utf8').split('class Vec')[0];
const ctx={require,__dirname,console,URLSearchParams};vm.runInNewContext(prefix+';this.map=geometry();',ctx);
const map=JSON.parse(JSON.stringify(ctx.map)),routes=map.course.routes;
const a=routes.find(r=>r.id==='tower-corner'),b=routes.find(r=>r.id==='north-east-corner');
assert.deepEqual(a.approach,[45,0,-13]);assert.deepEqual(b.approach,[12,0,-15.5]);
assert.equal(Math.round(Math.hypot(a.approach[0]+11,a.approach[1]-8,a.approach[2])),58,'photo 1 rooftop range');
assert.equal(Math.round(Math.hypot(b.approach[0]-4,b.approach[1],b.approach[2]+24)),12,'photo 2 north-beam range');
assert.equal(routes.find(r=>r.id==='south-corner').approach[1],4,'keep route 5');
assert.equal(routes.find(r=>r.id==='north-corner').approach[1],4,'keep route 6');
assert.equal(map.hooks.length,12,'append west hook without replacing old hooks');
assert.deepEqual(map.hooks.slice(0,7),[[-18,9.8,5.5],[-49.5,9,-1],[-13,1.2,-26],[44,15.6,-5],[-68,9.3,13],[-13.6,9.6,8],[44.5,8.4,10.5]]);
const solids=map.solids.filter(b=>!b.off&&b.solid!==false);
const free=(x,y,z,r=.32,h=1.75)=>!solids.some(b=>x+r>b.minX+1e-5&&x-r<b.maxX-1e-5&&z+r>b.minZ+1e-5&&z-r<b.maxZ-1e-5&&y+h>b.minY+1e-5&&y<b.maxY-1e-5);
for(const [x,y,z] of [a.approach,b.approach,[45,0,-16.2],[15.5,0,-15.5],[36.2,3.4,-16.2],[15.5,0,-4.8]])assert.ok(free(x,y+.03,z),'standing room '+[x,y,z]);
for(let x=12;x<=15.5;x+=.1)assert.ok(free(x,.03,-15.5),'lower balcony launch opening');
const eye=[45,1.62,-16.2],anchor=map.hooks.at(-1);for(let f=0;f<.99;f+=.005){const p=eye.map((v,k)=>v+(anchor[k]-v)*f);assert.ok(free(...p,.005,.005),'hook line of sight');}
assert.ok(a.exit[0]<a.approach[0]-8,'photo route must go west, as drawn');
assert.deepEqual(a.hook,[36.2,5.6,-16.2]);
assert.deepEqual(map.hooks.at(-2),[60.9,5.8,-15.25],'retain the earlier east option');
// Reserve the complete wall-run approach, including headroom at its north end.
for(const z of Array.from({length:241},(_,i)=>-14+i*.12))for(const y of [0,.3,1.4,2.3]){
 for(const solid of solids.filter(b=>/^(north|south)-corner/.test(b.oldTownSwing||''))){
  assert.ok(!(-14.32+.32>solid.minX&&-14.32-.32<solid.maxX&&z+.32>solid.minZ&&z-.32<solid.maxZ&&y+1.75>solid.minY&&y<solid.maxY),'existing west wall approach blocked by '+solid.oldTownSwing+' at '+z);
 }
}
for(let y=0;y<7.5;y+=.1)assert.ok(free(0,y+.03,-14.54),'keep north roof ladder');
console.log('PASS photo poses/ranges, lower-floor launch, original hooks/routes/ladder, hook line of sight');
