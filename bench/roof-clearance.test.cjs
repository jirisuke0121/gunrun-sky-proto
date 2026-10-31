const fs=require('node:fs'),vm=require('node:vm');
// Reuse the real collision/ledge/edge-assist harness, before its stair cases.
const setup=fs.readFileSync(__dirname+'/stair-walk.test.cjs','utf8').split('let cases=0;')[0];
const checks=`
let roofCases=0;
for(const cross of [2,2.9,3.8])for(const reverse of [false,true])for(const speed of [2.6,6]){
 const start=reverse?39:35.45,target=reverse?35.45:39,sign=reverse?-1:1;
 const expected=1.3+(start-35)/4.5*1.7;
 const support=Math.max(...jn.filter(b=>b.hidden&&b.slideSlope&&start+c.r>b.minX&&start-c.r<b.maxX&&cross+c.r>b.minZ&&cross-c.r<b.maxZ&&Math.abs(b.maxY-expected)<.6).map(b=>b.maxY));
 assert.ok(Number.isFinite(support),'locate the original tiled roof');
 reset([start,support,cross],-sign*Math.PI/2,speed);input=0;
 for(let i=0;i<12;i++)ctx.gd(1/120);input=1;let done=false;
 for(let i=0;i<600;i++){
  ctx.gd(1/120);assert.equal(c.state,'normal','standing roof passage '+JSON.stringify(c.pos));
  assert.equal(c.h,1.75,'no forced crouch under the return stairs');assert.ok(c.onGround);
  if((target-c.pos.x)*sign<.12){done=true;break;}
 }
 assert.ok(done,'roof blocked '+JSON.stringify(c.pos));roofCases++;
}
// The rerouted return must meet the pre-existing southern roof at 4.4m.
const foot=jn.find(b=>b.oldTownSwing==='east-pillar-return-foot');
assert.ok(foot.minZ>4.5+.32&&foot.maxX>40.5&&foot.maxY===4.4);
console.log('PASS '+roofCases+' full-height roof traversals, both directions and speeds, original roof collision retained');
`;
vm.runInNewContext(setup+checks,{require,__dirname,URLSearchParams,console});
