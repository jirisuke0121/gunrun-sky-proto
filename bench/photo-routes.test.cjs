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
assert.equal(map.hooks.length,11,'append one hook without replacing old hooks');
assert.deepEqual(map.hooks.slice(0,7),[[-18,9.8,5.5],[-49.5,9,-1],[-13,1.2,-26],[44,15.6,-5],[-68,9.3,13],[-13.6,9.6,8],[44.5,8.4,10.5]]);
const solids=map.solids.filter(b=>!b.off&&b.solid!==false);
const free=(x,y,z,r=.32,h=1.75)=>!solids.some(b=>x+r>b.minX+1e-5&&x-r<b.maxX-1e-5&&z+r>b.minZ+1e-5&&z-r<b.maxZ-1e-5&&y+h>b.minY+1e-5&&y<b.maxY-1e-5);
for(const [x,y,z] of [a.approach,b.approach,[45,0,-15.25],[15.5,0,-15.5],[60.7,3.6,-15.25],[15.5,0,-4.8]])assert.ok(free(x,y+.03,z),'standing room '+[x,y,z]);
for(let x=12;x<=15.5;x+=.1)assert.ok(free(x,.03,-15.5),'lower balcony launch opening');
const eye=[45,1.62,-15.25],anchor=map.hooks.at(-1);for(let f=0;f<.99;f+=.005){const p=eye.map((v,k)=>v+(anchor[k]-v)*f);assert.ok(free(...p,.005,.005),'hook line of sight');}
for(let y=0;y<7.5;y+=.1)assert.ok(free(0,y+.03,-14.54),'keep north roof ladder');
console.log('PASS photo poses/ranges, lower-floor launch, original hooks/routes/ladder, hook line of sight');
