const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({});
vm.runInContext('window=globalThis',context);
vm.runInContext(fs.readFileSync('wall-jump-spots.js','utf8'),context);
vm.runInContext(fs.readFileSync('wall-jump-candidates.js','utf8'),context);
const w=context.window;
const jumpHandler=w.__skyTryRegisteredWallJump;
vm.runInContext(fs.readFileSync('hook-targeting.js','utf8'),context);
assert.equal(w.__skyTryRegisteredWallJump,jumpHandler,'hook targeting cannot overwrite current permissions');
const spots=JSON.parse(JSON.stringify(w.__skyWallRunSpots));
assert.deepEqual(spots,JSON.parse(JSON.stringify(w.skyWallJumpCandidates.filter(p=>p.status==='ok').map(({at,normal})=>({at,normal})))),'permissions match the four shortcut routes selected by the user');
const faces=[];
for(const {at:[x,y,z],normal:[nx,nz]} of spots){
  const wall={type:'mono',minX:nx?x-(nx>0?2:0):x-8,maxX:nx?x+(nx<0?2:0):x+8,minZ:nz?z-(nz>0?2:0):z-8,maxZ:nz?z+(nz<0?2:0):z+8,minY:0,maxY:7};
  const normal={x:nx,z:nz};faces.push({wall,normal});
  assert.equal(w.__skyCanWallRunOnFace(wall,normal),true);
  assert.equal(w.__skyCanWallRunOnFace(wall,{x:-nx,z:-nz}),false,'opposite face is not implicitly allowed');
  assert.equal(w.__skyCanWallRunOnFace({...wall,type:'box'},normal),false);
  assert.equal(w.__skyCanWallRunOnFace({...wall,off:true},normal),false);
  const shift=nx?{minX:wall.minX+1,maxX:wall.maxX+1}:{minZ:wall.minZ+1,maxZ:wall.maxZ+1};
  assert.equal(w.__skyCanWallRunOnFace({...wall,...shift},normal),false,'nearby parallel wall is denied');
  const player={r:.34,pos:{x:x+nx*.72,y,z:z+nz*.72}};
  assert.equal(w.__skyCanWallJumpAtSpot(player,()=>wall,normal),true);
  assert.equal(w.__skyCanWallJumpAtSpot({...player,pos:{x:player.pos.x+(nx?0:5),y,z:player.pos.z+(nx?5:0)}},()=>wall,normal),false,'jump remains limited to the marked take-off area');
}
assert.equal(w.__skyCanWallRunOnFace({type:'mono',minX:11,maxX:14,minZ:-14,maxZ:-1,minY:0,maxY:7},{x:1,z:0}),false,'old north-east marker is not a shortcut permission');
// Exercise the actual bundled entry/continuation functions against the gate,
// including a failed/missing permission script and a move onto a denied wall.
const html=fs.readFileSync('index.html','utf8'),start=html.indexOf('function Qc(n,t,e)'),end=html.indexOf('var Fe=',start);
assert.ok(start>0&&end>start);
const wall=faces[0].wall,normal=faces[0].normal;
Object.assign(context,{c:{pos:{x:26,y:1.9,z:-1.5+.38},vel:{x:8,y:1.8,z:0},airT:.1,wallKey:null,state:'normal',onGround:false,jumpBuf:0},ke:.34,U:{wallRunSpeed:9.3,wallRunTime:1.5,gravity:20,wallRunGravity:.15},jn:[wall],zn:()=>[wall],ge:(v,a,b)=>Math.max(a,Math.min(b,v)),Dn:()=>{},ft:{wallruns:0},Tt:{wall(){}},z:{t:0}});
vm.runInContext(html.slice(start,end),context);
vm.runInContext('J_(8)',context);assert.equal(context.c.state,'wallrun');
context.window.__skyCanWallRunOnFace=()=>false;
vm.runInContext('K_(1/60,1)',context);assert.equal(context.c.state,'normal','continued runs stop at an unapproved face');
context.c.wallKey=null;vm.runInContext('J_(8)',context);assert.equal(context.c.state,'normal','unapproved face cannot start a run');
delete context.window.__skyCanWallRunOnFace;
vm.runInContext('J_(8)',context);assert.equal(context.c.state,'normal','missing registry cannot enable arbitrary walls');
console.log('PASS four shortcut permissions: allowed face only, opposite/nearby/old faces denied, marked jump area, actual entry/continuation and missing-registry checks');
