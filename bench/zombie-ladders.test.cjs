const assert=require('node:assert/strict');
(async()=>{
 const {createZombieLadders}=await import('../zombie-ladders.js');
 const {createZombieClimb}=await import('../zombie-climb.js');
 const vector=(x,y,z)=>({x,y,z,set(x,y,z){Object.assign(this,{x,y,z});}});
 const box=(x0,y0,z0,x1,y1,z1)=>({minX:x0,minY:y0,minZ:z0,maxX:x1,maxY:y1,maxZ:z1,type:'slab'});
 function setup({narrow=false}={}){
  global.window={};class Zombie{update(){}anim(){}}
  const floor=box(-8,-.3,-10,8,0,10),wall=box(narrow?-.3:-4,0,0,narrow?.3:4,4,narrow?1.3:5),solids=[floor,wall];
  const L={x:0,z:0,y0:0,y1:4,nx:0,nz:-1};
  const nodes=[{id:0,x:0,y:0,z:-1},{id:1,x:0,y:4,z:1}],edge={kind:5,from:0,to:1,ladder:L,jamT:0};
  const game={ri:Zombie,c:{state:'normal'},z:{t:10},Jt:[],jn:solids,Geom:{Vector3:class{}},ceRef:()=>game.z.t};
  const runtime={mode:'play',NAV:{nodes,E:[edge],out:[[0],[]]},DOORS:[],near:()=>solids,nodeAt:(x,y,z)=>y>3?1:0};
  let blinded=false,damage=0;game.hurtPlayerFromZombie=()=>damage++;
  const flash={blinded:()=>blinded},climb=createZombieClimb(game,runtime,flash),ladders=createZombieLadders(game,runtime,climb,flash);
  const enemy=(z=-1)=>{const e=Object.assign(new Zombie,{pos:vector(0,.003,z),vel:vector(0,0,0),r:.3,h:1.8,spawnT:0,stun:0,onGround:true,lastHitT:-99,edge:0,touching:()=>true});game.Jt.push(e);return e;};
  const advance=(e,seconds)=>{for(let i=0;i<seconds*60;i++){game.z.t+=1/60;ladders.step(e,1/60);}};
  return {game,runtime,L,edge,solids,climb,ladders,enemy,advance,blind:v=>blinded=v,damage:()=>damage};
 }
 {
  const q=setup(),e=q.enemy();
  assert.ok(Math.abs(q.ladders.edgeCost(q.edge)/6-(.3+4/1.1+.5))<.01,'field price includes actual grab, climb and exit seconds');
  assert.equal(q.ladders.edgeCost({...q.edge,kind:0}),null);
  assert.ok(q.ladders.start(e,q.edge));assert.equal(e.onGround,false);
  q.advance(e,5);assert.equal(e.act,null);assert.ok(e.onGround);assert.ok(Math.abs(e.pos.y-4.003)<.001);
  assert.ok(q.climb.clearLine(e,e.pos,e.pos,true),'completed exit is real supported ground');
 }
 {
  const q=setup(),e=q.enemy();e.stalker=true;e.r=.42;e.h=2.4;
  assert.ok(q.ladders.edgeCost(q.edge,true)<q.ladders.edgeCost(q.edge));assert.ok(q.ladders.start(e,q.edge));
  q.advance(e,2.5);assert.equal(e.act,null,'existing stalker ladder speed is retained');
 }
 {
  const q=setup(),head=q.enemy(),follower=q.enemy(-1.8);
  assert.equal(q.ladders.start(follower,q.edge),false,'followers leave the front approach clear');
  const waiting=q.ladders.waypoint(follower,q.edge);
  assert.ok(waiting.z<head.pos.z-.7);assert.ok(q.climb.clearLine(follower,follower.pos,waiting,true),'queue remains on real reachable floor');
  assert.ok(q.ladders.start(head,q.edge));assert.equal(q.ladders.start(follower,q.edge),false,'a leader needs body-height spacing');
  assert.ok(q.ladders.queueDelay(follower,q.edge)>1);
  q.advance(head,2.2);assert.ok(q.ladders.start(follower,q.edge),'the next actor can climb after the leader clears the rung');
 }
 {
  const q=setup(),line=Array.from({length:8},(_,i)=>q.enemy(-1-i*.85));
  assert.ok(Math.abs(q.ladders.queueDelay(line[7],q.edge)-7*1.95/1.1)<.01,'queue ETA includes every actor ahead, including the back of a long line');
 }
 {
  const q=setup(),e=q.enemy(),block=q.enemy();block.pos.set(0,4.003,1);block.stun=12;
  assert.ok(q.ladders.start(e,q.edge),'a safe adjacent exit avoids an occupied nominal node');q.advance(e,5);
  assert.ok(Math.hypot(e.pos.x-block.pos.x,e.pos.z-block.pos.z)>.6);assert.ok(q.climb.clearLine(e,e.pos,e.pos,true));
 }
 {
  const q=setup({narrow:true}),e=q.enemy(),block=q.enemy();block.pos.set(0,4.003,1);block.stun=12;
  assert.equal(q.ladders.start(e,q.edge),false,'a narrow blocked exit waits instead of overlapping');assert.ok(q.ladders.queueDelay(e,q.edge)>=12);
  block.dead=true;assert.ok(q.ladders.start(e,q.edge),'the queue resumes after the exit clears');
 }
 {
  const q=setup(),e=q.enemy();Object.assign(q.L,{nx:1,nz:0});
  Object.assign(q.runtime.NAV.nodes[0],{x:1,y:2/7,z:0});Object.assign(q.runtime.NAV.nodes[1],{x:-1,y:4,z:0});
  q.solids.splice(1,1,box(-4,0,-2,0,4,2),box(.5,-1.4,-1,1.107142857,2/7,1),box(1.107142857,-1.4,-1,1.714285714,4/7,1));
  Object.assign(e,{stalker:true,r:.42,h:2.4});e.pos.set(1,2/7+.003,0);
  assert.ok(Number.isFinite(q.ladders.edgeCost(q.edge,true)),'a full body stands on the next tread above the thin NAV probe');
  assert.equal(q.ladders.start(e,q.edge),false,'cost validation cannot snap an actor out of terrain');
  assert.equal(e.pos.y,2/7+.003);
  e.pos.y=4/7+.003;assert.ok(q.ladders.start(e,q.edge),'the real supported actor can grab the ladder');
  q.advance(e,2.5);assert.equal(e.act,null);assert.ok(q.climb.clearLine(e,e.pos,e.pos,true));
 }
 {
  const q=setup(),e=q.enemy();q.solids.push(box(-2,2,-1,2,2.2,0));
  assert.equal(q.ladders.edgeCost(q.edge),Infinity,'body sweep rejects terrain through the climb');assert.equal(q.ladders.start(e,q.edge),false);
 }
 {
  const q=setup(),e=q.enemy();q.runtime.INDOOR_ACCESS={revision:1,allowsMove:()=>false};
  assert.equal(q.ladders.edgeCost(q.edge),Infinity,'closed interior permissions also apply to ladders');
  q.runtime.INDOOR_ACCESS={revision:2,allowsMove:()=>true};assert.ok(Number.isFinite(q.ladders.edgeCost(q.edge)),'opening access invalidates cached route validation');
 }
 {
  const q=setup(),e=q.enemy();q.blind(true);assert.equal(q.ladders.start(e,q.edge),false);q.blind(false);assert.ok(q.ladders.start(e,q.edge));
  q.blind(true);assert.equal(q.ladders.step(e,1/60),false);assert.equal(e.act,null);assert.equal(e.onGround,false,'flash interruption returns to real falling physics');
 }
 {
  const q=setup(),e=q.enemy();assert.ok(q.ladders.start(e,q.edge));e.act=null;e.vel.set(3,4,5);
  assert.equal(q.ladders.step(e,1/60),false);assert.deepEqual([e.vel.x,e.vel.y,e.vel.z],[3,4,5],'hurt knockback survives external action cancellation');
 }
 for(const condition of ['dead','remove','stun','mission']){
  const q=setup(),e=q.enemy();assert.ok(q.ladders.start(e,q.edge));
  if(condition==='mission')q.game.z.mission=true;else e[condition]=true;
  assert.equal(q.ladders.step(e,1/60),false);assert.equal(e.act,null,condition+' cancels ownership');
  if(condition==='mission')assert.equal(q.ladders.edgeCost(q.edge),null,'practice retains native authored behavior');
 }
 {
  const q=setup(),e=q.enemy();q.game.c.state='ladder';q.game.c.ladder=q.L;assert.ok(q.ladders.start(e,q.edge));q.advance(e,.1);
  assert.ok(q.damage()>0,'same-ladder attacks use the existing damage function');
 }
 console.log('PASS ladders: actual travel time, real terrain, queue spacing, safe exits, access, stalker speed, interruptions and existing melee');
})().catch(e=>{console.error(e);process.exitCode=1;});
