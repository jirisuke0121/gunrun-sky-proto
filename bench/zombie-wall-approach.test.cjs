const assert = require('node:assert/strict');
(async () => {
  const { createZombieClimb } = await import('../zombie-climb.js');
  const box = (a,b,type='slab') => ({minX:a[0],minY:a[1],minZ:a[2],maxX:b[0],maxY:b[1],maxZ:b[2],type});
  const floor=box([-5,-.4,-5],[5,0,5]),wall=box([-1,-20,-1],[1,5,1],'mono');
  const nodes=[{id:0,x:0,y:0,z:-2},{id:1,x:0,y:0,z:2},{id:2,x:4,y:0,z:4}];
  const player={pos:{x:0,y:5.003,z:0},onGround:true};
  class Zombie {update(){} anim(){}}
  const solids=[floor,wall],runtime={mode:'play',NAV:{nodes,E:[],out:[]},FIELD:new Float32Array(3),
    near:()=>solids,nodeAt:(x,y,z)=>y>1?-1:nodes.find(n=>n.x===x&&n.z===z)?.id??-1};
  global.window={};
  const game={ri:Zombie,c:player,z:{t:10,over:false,mission:false},Jt:[],jn:solids,Geom:{Vector3:class{}},ceRef:()=>10};
  const climb=createZombieClimb(game,runtime,{blinded:()=>false});
  assert.deepEqual(climb.navigationTargets(),[0,1],'off-graph roof routes to supported climb departures');
  const cached=climb.navigationTargets();assert.equal(climb.navigationTargets(),cached,'stationary targets reuse their approaches');
  player.onGround=false;assert.equal(climb.navigationTargets(),null,'airborne players keep ordinary navigation');
  player.onGround=true;game.z.mission=true;assert.equal(climb.navigationTargets(),null,'missions keep authored navigation');
  game.z.mission=false;wall.off=true;assert.equal(climb.navigationTargets(),null,'disabled terrain cannot remain a destination');
  wall.off=false;floor.off=true;player.pos.x=.8;
  assert.equal(climb.navigationTargets(),null,'a roof without supported departures never creates a route over a void');
  assert.equal(climb.navigationTargets(),null,'empty cached departures still fall back to ordinary navigation');
  floor.off=false;player.pos={x:0,y:.003,z:2};
  assert.equal(climb.navigationTargets(),null,'a normal walking node does not use the roof approach');
  console.log('PASS wall approach: supported departures, cache, flight, mission, disabled wall, void and normal floor');
})().catch(e=>{console.error(e);process.exitCode=1});
