(() => {
 const g=__game,s=__skyInternals,c=g.P,canyon=!!window.SKY_CANYON_MAP;
 let seed=20261102;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 g.startGame();for(const e of g.zombies)s.ue.remove(e.m.root);g.zombies.length=0;
 g.GAME.spawnT=g.GAME.surgeT=1e9;g.SCR.off=g.PACE.off=g.MARK.off=true;g.STALK.spawned=true;
 Object.assign(g.S,{sendLog:false,autoFire:false,aimAuto:false,stalkerOn:false});
 const y=canyon?0:-3.5,z=canyon?-20:-34,at=[0,y+.003,z];
 c.pos.set(...at);c.vel.set(0,0,0);Object.assign(c,{state:'normal',onGround:true,ledge:null,ladder:null,hook:null,zip:null,h:1.75,invuln:0});c.lastGround.copy(c.pos);c.safe.copy(c.pos);
 c.node=g.nodeAt(c.pos.x,c.pos.y+.1,c.pos.z);g.updateField();
 for(const [x,dz,flank] of [[-14,0,false],[-12,-1,true],[-10,1,true]]){
  const e=new g.Zombie(x,y+.003,z+dz);Object.assign(e,{spawnT:0,onGround:true,flank,dropper:false,pz:false,speedMul:1});g.zombies.push(e);
 }
 const goals=[[10,z],[10,z+1],[-10,z+1],[-10,z-1],[10,z-1]],life=c.life,trail=[];
 let destination=0,turns=0,minDistance=Infinity,firstDamage=null,newPenetrations=0;
 g.keys.KeyW=true;
 for(let i=0;i<30*60&&!g.GAME.over;i++){
  const target=goals[destination],dx=target[0]-c.pos.x,dz=target[1]-c.pos.z;
  if(Math.hypot(dx,dz)<.45){destination=(destination+1)%goals.length;turns++;}
  c.yaw=Math.atan2(-dx,-dz);g.advance(1/60);
  for(const e of g.zombies){minDistance=Math.min(minDistance,e.pos.distanceTo(c.pos));if(e.act?.pursuitTraversal&&!s.oe(e.pos.x,e.pos.y+.012,e.pos.z,e.r,e.h))newPenetrations++;}
  if(i%30===0)trail.push({t:g.GAME.t,player:c.pos.toArray(),enemies:g.zombies.map(e=>e.pos.toArray())});
  if(c.life<life){firstDamage=g.GAME.t;break;}
 }
 g.keys.KeyW=false;
 return{firstDamage,turns,minDistance,newPenetrations,player:c.pos.toArray(),trail};
})()
