// Exercise the shipped map, collision solver, ledge detector and edge assist.
// This is a physics check; browser/phone feel is verified separately.
const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict');
const path=require('node:path'), root=path.join(__dirname,'..');
const helpers=fs.readFileSync(path.join(__dirname,'central-corners.test.cjs'),'utf8').split('(async()=>{')[0];
const hc={require,__dirname,URLSearchParams,console};
vm.runInNewContext(helpers+';this.map=geometry();this.V=Vec;',hc);
const map=hc.map,Vec=hc.V;
Vec.prototype.copy=function(v){return this.set(v.x,v.y,v.z)};
const source=fs.readFileSync(path.join(root,'index.html'),'utf8');
function extract(name){
  const at=source.indexOf('function '+name+'(',1600000);assert.ok(at>=0,name);
  let i=source.indexOf('{',at),d=1,q='';
  for(++i;d;i++){const c=source[i];if(q){if(c==='\\')i++;else if(c===q)q='';}else if('"\'`'.includes(c))q=c;else if(c==='{')d++;else if(c==='}')d--;}
  return source.slice(at,i);
}
const a=source.indexOf('Jn={walkSpeed:'),end=source.indexOf('},uo=',a),defaults=vm.runInNewContext('('+source.slice(a+3,end+1)+')');
let jn=map.solids.filter(b=>!b.off&&b.solid!==false);
const c={pos:new Vec,vel:new Vec,lastGround:new Vec,r:.32,h:1.75};
let input=1;
const ctx={window:{skyStairWalk:map.stairWalk},jn,c,U:{...defaults},ft:{topSpeed:0,jumps:0},
  Tt:{step(){},jump(){},land(){},slide(){}},ke:.32,sn:1.75,Je:.9,ei:.0001,ie:'play',z:{over:false,t:0},Oe:{},Ot:{on:false},
  ge:(x,a,b)=>Math.max(a,Math.min(b,x)),Mt:(a,b,t)=>a+(b-a)*t,
  md:()=>({fwdIn:input,strIn:0,tmag:Math.abs(input)}),
  zn:(x0,z0,x1,z1)=>jn.filter(b=>b.minX<=x1&&b.maxX>=x0&&b.minZ<=z1&&b.maxZ>=z0),
  H_:()=>false,Y_:()=>false,J_:()=>false,ah:()=>false,z_:()=>{},U_:()=>{},D_:()=>{},ja:()=>true,
  Qa:(ledge,kind)=>{c.state='ledge';throw new Error('unexpected '+kind+' '+JSON.stringify({pos:c.pos,ledge}))}};
vm.createContext(ctx);
for(const name of ['Vc','oe','Dn','jc','F_','k_','gd','N_','O_'])vm.runInContext(extract(name),ctx);
ctx.window.__skyInternals={c,near:ctx.zn,oe:ctx.oe,fallY:-22};
vm.runInContext(fs.readFileSync(path.join(root,'edge-assist.js'),'utf8'),ctx);
function reset(p,yaw,speed){
 c.pos.set(p[0],p[1]+.0001,p[2]);c.lastGround.copy(c.pos);c.vel.set(0,0,0);
 Object.assign(c,{yaw,state:'normal',onGround:true,h:1.75,slideCD:0,slideBuf:0,slideT:0,catchCD:0,jumpBuf:0,coyote:.15,airT:0,edgeOff:null,setCD:0,crouchPressed:false,hookPressed:false,hookCD:0});
 ctx.U.sprintSpeed=speed;ctx.U.walkSpeed=speed;ctx.Ot.on=false;ctx.z.t=0;input=1;
}
function traverse(flight,reverse,offset,speed){
 const along=flight.axis==='x'?'X':'Z',across=flight.axis==='x'?'Z':'X';
 const steps=[...flight.steps].sort((a,b)=>a['min'+along]-b['min'+along]);
 if(reverse)steps.reverse();
 const first=steps[0],last=steps.at(-1),sign=reverse?-1:1;
 const start=(first['min'+along]+first['max'+along])/2;
 let target=(last['min'+along]+last['max'+along])/2;if(flight.id==='east-tower-stair'&&!reverse)target=60.9;
 const cross=(flight.left+flight.right)/2+offset;
 const p=flight.axis==='x'?[start,first.maxY,cross]:[cross,first.maxY,start];
 reset(p,flight.axis==='x'?-sign*Math.PI/2:sign>0?Math.PI:0,speed);
 // A real capsule settles on every overlapped tread, not just its centre.
 for(let i=0;i<12;i++){input=0;ctx.gd(1/120);}input=1;
 const distance=Math.abs(target-c.pos[flight.axis]);
 const limit=Math.ceil((distance/speed+1)*120);
 let minSpeed=Infinity;
 for(let i=0;i<limit;i++){
  ctx.z.t+=1/120;ctx.gd(1/120);
  assert.equal(c.state,'normal',flight.id);
  assert.ok(c.onGround,flight.id+' stays grounded '+JSON.stringify(c.pos));
  if(i>30&&Math.abs(target-c.pos[flight.axis])>2.5)minSpeed=Math.min(minSpeed,Math.hypot(c.vel.x,c.vel.z));
  if((target-c.pos[flight.axis])*sign<=.12){
   const support=Math.max(...jn.filter(b=>b.maxY<=c.pos.y+.02&&c.pos.x+c.r>b.minX&&c.pos.x-c.r<b.maxX&&c.pos.z+c.r>b.minZ&&c.pos.z-c.r<b.maxZ).map(b=>b.maxY));assert.ok(Math.abs(c.pos.y-support)<.12,flight.id+' reaches landing '+JSON.stringify({p:c.pos,support}));
   assert.ok(minSpeed>speed*.9,flight.id+' keeps pace '+minSpeed);
   return;
  }
 }
 throw new Error(flight.id+' blocked '+JSON.stringify(c.pos)+' target '+target);
}
let cases=0;const failures=[];
for(const f of map.stairWalk.flights){
 for(const reverse of [false,true])for(const offset of [-.2,0,.2])for(const speed of [2.6,6]){
  try{traverse(f,reverse,offset,speed);cases++;}catch(e){failures.push({id:f.id,reverse,offset,speed,error:e.message});}
 }
}
// Include the roof/crate-to-first-tread seams, not only starts on the stairs.
for(const x of [-60.25,-48.75])for(const offset of [-.2,0,.2])for(const speed of [2.6,6]){
 const west=x<-55;reset([x+offset,west?4.2:4,west?-5.3:-4.7],0,speed);
 let done=false;
 for(let i=0;i<600;i++){
  ctx.gd(1/120);assert.equal(c.state,'normal');assert.ok(c.onGround,'tower entrance stays grounded');
  if(c.pos.z<-11.7){done=true;break;}
 }
 assert.ok(done,'tower entrance '+x);cases++;
}
// Grounded wall/crate vaults and airborne catches must still be eligible.
const tower=map.stairWalk.flights.find(f=>f.id==='tower--49.5'),step=tower.steps[30];
reset([-48.75,step.maxY,-8],0,6);c.onGround=false;
assert.equal(map.stairWalk.canWalk(c,0,-1,step),false);
c.onGround=true;assert.equal(map.stairWalk.canWalk(c,1,0,step),false);
assert.equal(map.stairWalk.canWalk(c,0,-1,{maxY:2}),false);
JSON.stringify(map.solids);
// Load the real practice builders with renderer-independent box storage.
const practice={window:{},location:{search:'?practice=1'},URLSearchParams,console,Ja:[],solids:[]};
practice.ne=(x0,y0,z0,x1,y1,z1,type)=>{
 const b={minX:Math.min(x0,x1),maxX:Math.max(x0,x1),minY:Math.min(y0,y1),maxY:Math.max(y0,y1),minZ:Math.min(z0,z1),maxZ:Math.max(z0,z1),type};practice.solids.push(b);return b;
};
vm.createContext(practice);
for(const file of ['stair-walk.js','parkour-course.js','practice-world.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),practice);
vm.runInContext(extract('hd'),practice);
practice.window.buildSkyCanyon({ne:practice.ne,Mh(){},ld(){},us:[],jn:practice.solids,hd:practice.hd});
jn=practice.solids;ctx.window.skyStairWalk=practice.window.skyStairWalk;
for(const f of practice.window.skyStairWalk.flights)for(const reverse of [false,true])for(const offset of [-.2,0,.2])for(const speed of [2.6,6]){
 try{traverse(f,reverse,offset,speed);cases++;}catch(e){failures.push({id:f.id,reverse,offset,speed,error:e.message});}
}
console.log(JSON.stringify({pass:!failures.length,flights:map.stairWalk.flights.length+practice.window.skyStairWalk.flights.length,cases,failures},null,2));assert.equal(failures.length,0);
