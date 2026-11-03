(() => {
 const g=__game,s=__skyInternals,c=g.P;
 let seed=20261102;const reseed=()=>{seed=20261102;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);};
 const fixtures=[{"id": "center-front", "p": [-27, 4.4, -27], "e": [-27, -3.5, -35]}, {"id": "center-left", "p": [-27, 4.4, -27], "e": [-32, -3.5, -33]}, {"id": "center-right", "p": [-27, 4.4, -27], "e": [-23, -3.5, -33]}, {"id": "center-launch", "p": [-27, 4.4, -27], "e": [-27, 4.2, -14]}, {"id": "center-roof", "p": [-27, 4.4, -27], "e": [-27, 0, -23]}, {"id": "nw-front", "p": [-28.4, 4.4, -29.2], "e": [-27, -3.5, -35]}, {"id": "nw-left", "p": [-28.4, 4.4, -29.2], "e": [-32, -3.5, -33]}, {"id": "nw-right", "p": [-28.4, 4.4, -29.2], "e": [-23, -3.5, -33]}, {"id": "nw-launch", "p": [-28.4, 4.4, -29.2], "e": [-27, 4.2, -14]}, {"id": "nw-roof", "p": [-28.4, 4.4, -29.2], "e": [-27, 0, -23]}, {"id": "ne-front", "p": [-25.6, 4.4, -29.2], "e": [-27, -3.5, -35]}, {"id": "ne-left", "p": [-25.6, 4.4, -29.2], "e": [-32, -3.5, -33]}, {"id": "ne-right", "p": [-25.6, 4.4, -29.2], "e": [-23, -3.5, -33]}, {"id": "ne-launch", "p": [-25.6, 4.4, -29.2], "e": [-27, 4.2, -14]}, {"id": "ne-roof", "p": [-25.6, 4.4, -29.2], "e": [-27, 0, -23]}, {"id": "sw-front", "p": [-28.4, 4.4, -24.2], "e": [-27, -3.5, -35]}, {"id": "sw-left", "p": [-28.4, 4.4, -24.2], "e": [-32, -3.5, -33]}, {"id": "sw-right", "p": [-28.4, 4.4, -24.2], "e": [-23, -3.5, -33]}, {"id": "sw-launch", "p": [-28.4, 4.4, -24.2], "e": [-27, 4.2, -14]}, {"id": "sw-roof", "p": [-28.4, 4.4, -24.2], "e": [-27, 0, -23]}, {"id": "se-front", "p": [-25.6, 4.4, -24.2], "e": [-27, -3.5, -35]}, {"id": "se-left", "p": [-25.6, 4.4, -24.2], "e": [-32, -3.5, -33]}, {"id": "se-right", "p": [-25.6, 4.4, -24.2], "e": [-23, -3.5, -33]}, {"id": "se-launch", "p": [-25.6, 4.4, -24.2], "e": [-27, 4.2, -14]}, {"id": "se-roof", "p": [-25.6, 4.4, -24.2], "e": [-27, 0, -23]}];
 const rows=[];
 for(const f of fixtures){
  reseed();g.startGame();for(const e of g.zombies)s.ue.remove(e.m.root);g.zombies.length=0;
  g.GAME.spawnT=g.GAME.surgeT=1e9;g.SCR.off=g.PACE.off=g.MARK.off=true;g.STALK.spawned=true;
  Object.assign(g.S,{sendLog:false,autoFire:false,aimAuto:false,stalkerOn:false});
  c.pos.set(f.p[0],f.p[1]+.003,f.p[2]);c.vel.set(0,0,0);Object.assign(c,{onGround:true,state:'normal',h:1.75,invuln:0,ledge:null,ladder:null,hook:null,zip:null});c.lastGround.copy(c.pos);c.safe.copy(c.pos);
  c.node=g.nodeAt(c.pos.x,c.pos.y+.1,c.pos.z);g.updateField();
  const e=new g.Zombie(f.e[0],f.e[1]+.003,f.e[2]);Object.assign(e,{spawnT:0,onGround:true,flank:false,dropper:false,stalker:false,pz:false,speedMul:1});g.zombies.push(e);
  const fixtureFree=s.oe(e.pos.x,e.pos.y+.012,e.pos.z,e.r,e.h)&&s.oe(c.pos.x,c.pos.y+.012,c.pos.z,c.r,c.h);
  const life=c.life,origin=e.pos.clone(),trail=[],actions={};let length=0,penetrations=0,newPenetrations=0,maxDisplacement=0,firstDamage=null,maxStepMs=0;
  for(let i=0;i<60*60&&!g.GAME.over;i++){
   const prev=e.pos.clone(),owned=e.act?.pursuitTraversal,start=performance.now();g.advance(1/60);maxStepMs=Math.max(maxStepMs,performance.now()-start);
   const moved=e.pos.distanceTo(prev);length+=moved;maxDisplacement=Math.max(maxDisplacement,moved);const kind=e.act?.kind||'walk';actions[kind]=(actions[kind]||0)+1;
   if(e.act&&!s.oe(e.pos.x,e.pos.y+.012,e.pos.z,e.r,e.h))penetrations++;
   if((owned||e.act?.pursuitTraversal)&&!s.oe(e.pos.x,e.pos.y+.012,e.pos.z,e.r,e.h))newPenetrations++;
   if(i%60===0)trail.push({t:g.GAME.t,p:e.pos.toArray(),kind,edge:e.edge});
   if(c.life<life){firstDamage=g.GAME.t;break;}
  }
  rows.push({...f,fixtureFree,firstDamage,length,straight:origin.distanceTo(c.pos),penetrations,newPenetrations,maxDisplacement,actions,end:e.pos.toArray(),player:c.pos.toArray(),maxStepMs,trail});
 }
 window.navAuditHistory=rows;
 return rows;
})()
