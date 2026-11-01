const assert=require('node:assert/strict');
(async()=>{
 const {createZombieRouting,traversalPoint}=await import('../zombie-routing.js');
 const {createZombieClimb}=await import('../zombie-climb.js');
 const box=(a,b,type='slab')=>({minX:a[0],minY:a[1],minZ:a[2],maxX:b[0],maxY:b[1],maxZ:b[2],type});
 const vector=(x,y,z)=>({x,y,z,set(x,y,z){Object.assign(this,{x,y,z});return this;}});
 function setup({wall=false,ceiling=false,missing=false,kind=6,length=3,rise=0,legacy=false,room=true}={}){
  const top=kind===7?8:0,nodes=[{id:0,x:0,y:top,z:0},{id:1,x:length,y:rise,z:0}],edge={from:0,to:1,kind,len:length,fall:top-rise};
  const solids=[box([-1,top-.4,-1],[.8,top,1])];if(!missing)solids.push(box([length-.8,rise-.4,-1],[length+1,rise,1]));
  if(wall)solids.push(box([1.49,0,-.5],[1.51,5,.5],'mono'));
  if(ceiling)solids.push(box([1.1,1.7,-.8],[1.9,2.3,.8],'mono'));
  class Zombie{update(){}anim(){}}
  global.window={skyLeapOK:()=>legacy};
  const player={pos:vector(length,rise,0),onGround:true},game={ri:Zombie,c:player,z:{t:10},U:{gravity:20,zombieSpeed:6},Jt:[],jn:solids,Geom:{Vector3:class{}},ceRef:()=>10};
  const runtime={mode:'play',NAV:{nodes,E:[edge],out:[[0],[]]},FIELD:[8,0],DOORS:[],INDOOR_ACCESS:{edgeAllowed:()=>room},near:()=>solids,nodeAt:()=>-1};
  const flash={blinded:()=>false},climb=createZombieClimb(game,runtime,flash),routing=createZombieRouting(game,runtime,climb,flash);
  return{game,runtime,routing,edge,flash,solids};
 }
 const valid=setup();assert.ok(Number.isFinite(valid.routing.edgeCost(valid.edge)));
 const count=valid.routing.stats.checked;valid.routing.edgeCost(valid.edge);assert.equal(valid.routing.stats.checked,count,'reuse validated static geometry');
 for(const options of [{wall:true},{ceiling:true},{missing:true},{length:3.3},{rise:.81},{room:false}]){
  const s=setup(options);assert.equal(s.routing.edgeCost(s.edge),Infinity,JSON.stringify(options));
 }
 const drop=setup({kind:7,length:2});assert.ok(Number.isFinite(drop.routing.edgeCost(drop.edge)));
 const legacy=setup({legacy:true,length:6});assert.equal(legacy.routing.edgeCost(legacy.edge),null,'keep authored western capabilities');
 valid.game.z.mission=true;assert.equal(valid.routing.edgeCost(valid.edge),null,'preserve mission routing');valid.game.z.mission=false;
 assert.equal(valid.routing.directChase({pos:vector(0,.003,0),r:.3,h:1.8},vector(3,.003,0)),false,'a nearby gap must still use navigation');
 const enemy={pos:vector(0,.003,0),vel:vector(0,0,0),r:.3,h:1.8,onGround:true,edge:0,stun:0};valid.game.Jt.push(enemy);
 assert.equal(valid.routing.startTraversal(enemy,valid.edge),true);assert.equal(enemy.act.kind,'leap');assert.equal(enemy.act.wait,.18);
 const end=traversalPoint(enemy.act,1);assert.ok(Math.abs(end.x-3)<1e-9&&Math.abs(end.y-.002)<1e-9);
 enemy.stun=1;valid.routing.beforeStep(enemy,1/60);assert.equal(enemy.act,null,'hits interrupt the shortcut instead of overriding stun');
 enemy.stun=0;enemy.onGround=true;valid.routing.startTraversal(enemy,valid.edge);valid.flash.blinded=()=>true;
 valid.routing.beforeStep(enemy,1/60);assert.equal(enemy.act,null,'flash interrupts the shortcut');
 valid.flash.blinded=()=>false;enemy.onGround=true;valid.routing.startTraversal(enemy,valid.edge);valid.solids[1].off=true;
 valid.routing.beforeStep(enemy,1/60);assert.equal(enemy.act,null,'a disappearing landing returns the body to gravity');
 // A flank destination must not send the enemy onto a much longer route.
 const s=setup(),nodes=s.runtime.NAV.nodes,edges=s.runtime.NAV.E;
 nodes.push({id:2,x:0,y:0,z:3});edges.push({from:0,to:2,kind:0,len:3});s.runtime.NAV.out[0]=[0,1];s.runtime.FIELD=[4,0,20];
 const pursuer={node:0,edge:1,pos:vector(0,0,0)};s.routing.afterPick(pursuer,[1,10,0],e=>e.len);
 assert.equal(pursuer.edge,0);assert.equal(s.routing.stats.boundedFlanks,1);
 console.log('PASS routing: swept gap/drop, thin wall, ceiling, landing, limits, access, cache, missions, hit/flash and bounded flank');
})().catch(e=>{console.error(e);process.exitCode=1});
