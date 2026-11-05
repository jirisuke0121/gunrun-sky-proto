const assert=require('node:assert/strict');
(async()=>{
 const {createZombieDescent}=await import('../zombie-descent.js');
 const {createZombieRouting}=await import('../zombie-routing.js');
 const {createZombieClimb}=await import('../zombie-climb.js');
 const vec=(x,y,z)=>({x,y,z,set(x,y,z){Object.assign(this,{x,y,z});return this;}});
 const box=(x0,y0,z0,x1,y1,z1)=>({minX:x0,minY:y0,minZ:z0,maxX:x1,maxY:y1,maxZ:z1,type:'slab'});
 function setup({wall=false,gap=false,missing=false,unreachable=false}={}){
  global.window={};class Zombie{update(){}anim(){}}
  const roof=box(-4,7.6,-3,0,8,3),floor=box(.1,3.6,-3,5,4,3),solids=[roof];if(!missing)solids.push(floor);
  if(wall)solids.push(box(.1,4,-3,.3,12,3));
  if(gap){roof.maxX=-3;floor.minX=1;solids.push(box(-.8,7.6,-3,0,8,3));}
  const player={pos:vec(3,4.003,0),onGround:true},game={ri:Zombie,c:player,z:{t:10},U:{gravity:20,zombieSpeed:6},Jt:[],jn:solids,Geom:{Vector3:class{}},ceRef:()=>game.z.t};
  const runtime={mode:'play',NAV:{nodes:[],E:[],out:[]},FIELD:[],near:()=>solids,nodeAt:()=>-1};
  if(unreachable)player.pos.z=8;
  const flash={blinded:()=>false},climb=createZombieClimb(game,runtime,flash),routing=createZombieRouting(game,runtime,climb,flash);
  const descent=createZombieDescent(game,runtime,climb,flash,routing);
  const e=Object.assign(new Zombie,{pos:vec(gap?-3.5:-3,8.003,0),vel:vec(0,0,0),r:.3,h:1.8,onGround:true,spawnT:0,stun:0,lastHitT:-99,speedMul:1,node:-1,edge:-1});game.Jt.push(e);
  const step=()=>{game.z.t+=1/60;return descent.step(e,1/60);};
  const until=fn=>{for(let i=0;i<1200;i++){step();if(fn())return true;}return false;};
  return{e,game,runtime,solids,roof,floor,flash,descent,step,until};
 }
 const a=setup();let maxStep=0,prev={...a.e.pos};
 assert.ok(a.until(()=>{maxStep=Math.max(maxStep,Math.hypot(a.e.pos.x-prev.x,a.e.pos.y-prev.y,a.e.pos.z-prev.z));prev={...a.e.pos};return a.descent.stats.landed===1;}),'NAV-less lower floor is reached');
 assert.ok(maxStep<.5,'continuous approach and flight');assert.equal(a.e.onGround,true);assert.equal(a.e.act,null);assert.ok(Math.abs(a.e.pos.y-4.003)<1e-9);assert.ok(a.e.pos.x>0);
 for(const opts of [{wall:true},{gap:true},{missing:true},{unreachable:true}]){const b=setup(opts);b.until(()=>false);assert.equal(b.descent.stats.started,0,JSON.stringify(opts)+' must not invent a route');}
 for(const effect of ['hit','flash','decoy','dead','landing','target','mission']){
  const b=setup();assert.ok(b.until(()=>b.descent.stats.started===1));
  if(effect==='hit'){b.e.act=null;b.e.stun=1;b.e.vel.set(4,2,1);}
  if(effect==='flash')b.flash.blinded=()=>true;
  if(effect==='decoy')window.skyDecoy={targetFor:()=>({})};
  if(effect==='dead')b.e.dead=true;
  if(effect==='landing')b.floor.off=true;
  if(effect==='target')b.game.c.pos.y=8;
  if(effect==='mission')b.game.z.mission={};
  b.step();assert.equal(b.e.act,null,effect+' interrupts');assert.equal(b.descent.stats.interrupted,1,effect);
  if(effect==='hit')assert.deepEqual([b.e.vel.x,b.e.vel.y,b.e.vel.z],[4,2,1],'preserve weapon knockback');
 }
 const crowd=setup();assert.ok(crowd.until(()=>crowd.descent.stats.started===1));
 const other={pos:vec(crowd.e.pos.x+.7,crowd.e.pos.y,crowd.e.pos.z),r:.3,h:1.8};crowd.game.Jt.push(other);const start=crowd.e.pos.x;
 for(let i=0;i<30;i++)crowd.step();assert.ok(crowd.e.pos.x-start<.2,'queue behind a body instead of merging');
 crowd.game.Jt.pop();assert.ok(crowd.until(()=>crowd.descent.stats.landed===1),'resume after the queue clears');
 const tread=setup();
 for(let i=0;i<1200&&!tread.descent.stats.started;i++){
  tread.e.onGround=i%2===0;tread.step();
 }
 assert.equal(tread.descent.stats.started,1,'brief ground-contact flicker pauses the scan without restarting it');
 const narrow=setup();narrow.floor.maxX=.6;narrow.game.c.pos.x=.35;
 assert.ok(narrow.until(()=>narrow.descent.stats.landed===1),'a supported half-meter slab is a valid landing');
 const lower=setup();lower.solids.push(box(.9,7.6,-3,5,8,3));
 lower.runtime.NAV.nodes.push({id:0,x:1,y:8,z:0},{id:1,x:3,y:4,z:0});
 lower.runtime.FIELD.push(0,0);lower.runtime.nodeAt=(x,y)=>y>7?0:y>3?1:-1;
 assert.ok(lower.until(()=>lower.descent.stats.landed===1));
 assert.ok(Math.abs(lower.e.pos.y-4.003)<1e-9,'a supported descent beats a cheap same-roof hop toward a lower target');
 const authored=setup();authored.e.edge=7;authored.e.navT=0;
 // A real wall-climb approach field is current even though the target itself
 // has no NAV node. Never replace it with a walk straight toward a cliff.
 window.skyZombieClimb=undefined;
 // createZombieDescent owns the supplied climb object, not the window alias.
 const {createZombieDescent:factory}=await import('../zombie-descent.js');
 const current=factory(authored.game,authored.runtime,{navigationTargets:()=>[42]},authored.flash,{config:{rise:1.2}});
 current.step(authored.e,1/60);assert.equal(authored.e.edge,7,'preserve authored recovery targets');
 for(const effect of ['hit','flash','decoy','landing','dead']){
  const b=setup();assert.ok(b.until(()=>b.e.act?.descentRecovery&&!b.e.onGround),'begin the flight');
  if(effect==='hit'){b.e.act=null;b.e.stun=1;b.e.vel.set(4,2,1);}
  if(effect==='flash')b.flash.blinded=()=>true;
  if(effect==='decoy')window.skyDecoy={targetFor:()=>({})};
  if(effect==='landing')b.floor.off=true;
  if(effect==='dead')b.e.dead=true;
  b.step();assert.equal(b.e.act,null,effect+' interrupts in midair');
  if(effect==='hit')assert.deepEqual([b.e.vel.x,b.e.vel.y,b.e.vel.z],[4,2,1]);
 }
 // A low ceiling permits ordinary walking but not a jump arc. The missing
 // grid node must still receive a current, nonzero-cost departure field.
 const low=setup();
 low.runtime.NAV.nodes.push({id:0,x:1,y:4,z:0});
 low.solids.push(box(.1,6,-3,5,6.4,3));
 const goals=low.descent.navigationTargets();
 assert.ok(goals.includes(0),'low-ceiling walk to an off-grid target remains routable');
 assert.ok(Math.abs(goals.costs[0]-2)<.001,'departure includes the remaining walk cost');
 assert.ok(low.descent.hasNavigationTarget(low.game.c));
 low.game.c.pos.z+=2;
 assert.equal(low.descent.hasNavigationTarget(low.game.c),false,'moving the player invalidates the local target');
 // The motor can support an overhanging foot, but never a whole path in air.
 const support=setup();
 const {createZombieClimb:climbFactory}=await import('../zombie-climb.js');
 const collision=climbFactory(support.game,support.runtime,support.flash);
 assert.ok(collision.clearLine(support.e,{x:-4.2,y:8.003,z:0},{x:-4.2,y:8.003,z:1},true));
 assert.equal(collision.clearLine(support.e,{x:-4.31,y:8.003,z:0},{x:-4.31,y:8.003,z:1},true),false);
 assert.equal(collision.clearLine(support.e,{x:-3,y:8.003,z:0},{x:-5,y:8.003,z:0},true),false);
 support.runtime.INDOOR_ACCESS={allowsMove:()=>false};
 assert.equal(collision.clearLine(support.e,{x:-3,y:8.003,z:0},{x:-2,y:8.003,z:0}),false,'local traversals obey indoor access');
 console.log('PASS descent: NAV-less floor, continuous/swept motion, wall, unsupported approach, missing/disconnected floor, hit/flash/decoy/death/target/mission interruptions, knockback and crowd');
})().catch(e=>{console.error(e);process.exitCode=1});
