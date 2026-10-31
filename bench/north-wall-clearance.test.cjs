const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const helpers=fs.readFileSync(__dirname+'/central-corners.test.cjs','utf8').split('class Vec')[0];
const ctx={require,__dirname,URLSearchParams,console};vm.runInNewContext(helpers+';this.map=geometry();',ctx);
const map=ctx.map,solids=map.solids.filter(b=>!b.off&&b.solid!==false);
const overlaps=(b,x,y,z)=>x+.32>b.minX+1e-5&&x-.32<b.maxX-1e-5&&z+.32>b.minZ+1e-5&&z-.32<b.maxZ-1e-5&&y+1.75>b.minY+1e-5&&y<b.maxY-1e-5;
const previousLedge={minX:-22,maxX:-15.2,minY:3.9,maxY:4.2,minZ:-17.4,maxZ:-13};
let samples=0,previousHits=0;
for(const height of [.3,1.4,1.8,2.05,3,4,5.6])for(const startZ of [-12,-13.4,-13.9])for(const push of [6,7,8]){
 for(let t=0;t<=.65;t+=1/120){
  const x=-14.36-push*t,y=height+6.84*t-10*t*t,z=startZ-9.3*t;
  if(overlaps(previousLedge,x,y,z))previousHits++;
  const block=solids.find(b=>overlaps(b,x,y,z));
  assert.ok(!block,'wall kick head blocked '+JSON.stringify({height,startZ,push,t,x,y,z,block}));samples++;
 }
}
assert.ok(previousHits>0,'negative control reproduces the old overhead collision');
const route=map.course.routes.find(r=>r.id==='north-corner');
assert.ok(route.exit[0]<=-20,'north swing landing stays outside the wall-jump path');
assert.equal(map.course.bars.filter(b=>b.route==='north-corner').length,2);
assert.equal(map.course.routes.length,8);
console.log('PASS '+samples+' wall-kick capsule samples, low/high takeoffs and early/late inputs; previous ledge would collide '+previousHits+' times');
