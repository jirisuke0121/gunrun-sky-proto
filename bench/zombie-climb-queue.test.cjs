const assert = require('node:assert/strict');
(async () => {
  const { createZombieClimb } = await import('../zombie-climb.js');
  global.window = {};
  const vector = (x,y,z) => ({x,y,z,set(x,y,z){Object.assign(this,{x,y,z});}});
  const box = (x0,y0,z0,x1,y1,z1,type='slab') => ({minX:x0,minY:y0,minZ:z0,maxX:x1,maxY:y1,maxZ:z1,type});
  const floor=box(-5,-.4,-5,5,0,5), wall=box(-1,0,-1,1,5,1,'mono');
  const solids=[floor,wall,...Array.from({length:100},(_,i)=>box(10+i*3,0,0,11+i*3,3,1))];
  class Zombie {update(){} anim(){}}
  const enemy=Object.assign(new Zombie,{pos:vector(0,.003,-2),vel:vector(0,0,0),r:.3,h:1.8,
    spawnT:0,stun:0,onGround:true,lastHitT:-99,node:0,edge:-1,navT:0,anim(){}});
  const player={pos:vector(0,5.003,0),onGround:true};
  const zombies=[enemy];
  // All four climbing faces are occupied. The terrain route exists, and the
  // follower must release the shared planner rather than scan the whole map.
  for(const v of [-.9,-.3,.3,.9]) for(const [x,z] of [[v,-1.4],[v,1.4],[-1.4,v],[1.4,v]])
    zombies.push({pos:vector(x,0,z),r:.3,h:1.8,onGround:true});
  const nodes=[{id:0,x:0,y:0,z:-2},{id:1,x:0,y:0,z:2}];
  const game={ri:Zombie,c:player,z:{t:10},Jt:zombies,jn:solids,Geom:{Vector3:class{}},ceRef:()=>game.z.t};
  const runtime={mode:'play',NAV:{nodes,E:[],out:[]},FIELD:new Float32Array(2),near:()=>solids,
    nodeAt:(x,y,z)=>y>1?-1:z<0?0:1};
  const climb=createZombieClimb(game,runtime,{blinded:()=>false});
  let previous=false,found=false,before=0;
  for(let i=0;i<1200;i++){
    game.z.t+=1/60;enemy.update(1/60);
    const state=climb.state(enemy);
    if(!previous&&state.searching&&state.wait>4.5){found=true;before=climb.stats.candidates;break;}
    previous=state.searching;
  }
  assert.ok(found,'a stalled follower requests a recovery');
  for(let i=0;i<1200&&climb.state(enemy).searching;i++){game.z.t+=1/60;enemy.update(1/60);}
  assert.equal(climb.state(enemy).searching,false,'occupied terrain releases the shared planner');
  assert.ok(climb.stats.candidates-before<=climb.config.planCandidates,'a queue cannot monopolize unbounded map search');
  assert.equal(enemy.act,undefined,'a follower cannot start through the occupied approach');
  function beginScan(){
    for(let i=0;i<600;i++){
      game.z.t+=1/60;enemy.update(1/60);
      if(climb.state(enemy).searching)return;
    }
    throw new Error('expected another recovery scan');
  }
  beginScan();enemy.pos.y+=1;enemy.onGround=false;game.z.t+=1/60;enemy.update(1/60);
  assert.equal(climb.state(enemy).searching,false,'changing floors discards candidates for the old elevation');
  enemy.pos.y=.003;enemy.onGround=true;beginScan();
  zombies.splice(zombies.indexOf(enemy),1);game.z.t+=1/60;enemy.update(1/60);
  assert.equal(climb.state(enemy).searching,false,'a removed pursuer cannot retain the shared search after retry');
  console.log('PASS climb queue: bounded occupied search, floor changes and removed pursuers');
})().catch(e=>{console.error(e);process.exitCode=1;});
