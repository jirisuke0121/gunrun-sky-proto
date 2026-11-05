(()=>{const g=__game,s=__skyInternals,c=g.P,rows=[];for(const count of [2,8]){
g.startGame();window.skyBite?.reset();for(const key of Object.keys(g.keys))g.keys[key]=false;for(const e of g.zombies)s.ue.remove(e.m.root);g.zombies.length=0;g.GAME.spawnT=g.GAME.surgeT=1e9;g.SCR.off=g.PACE.off=g.MARK.off=true;g.STALK.spawned=true;Object.assign(g.S,{sendLog:false,autoFire:false,aimAuto:false,stalkerOn:false});
c.pos.set(6,4.003,-15.5);c.vel.set(0,0,0);Object.assign(c,{onGround:true,state:'normal',h:1.75,invuln:1e9,ledge:null,ladder:null,hook:null,zip:null});c.lastGround.copy(c.pos);c.safe.copy(c.pos);c.node=g.nodeAt(c.pos.x,c.pos.y+.1,c.pos.z);g.updateField();
for(let j=0;j<count;j++){const e=new g.Zombie(-4+j*.85,8.003,-13.5);Object.assign(e,{spawnT:0,onGround:true,flank:false,dropper:false,stalker:false,pz:false,speedMul:1});g.zombies.push(e);}
let penetrations=0,maxStep=0;const landed=Array(count).fill(null),initial=g.zombies.every(e=>g.freeAt(e.pos.x,e.pos.y+.012,e.pos.z,e.r,e.h)&&skyZombieClimb.clearLine(e,e.pos,e.pos,true));
// Allow a minute for eight physical bodies to queue, replan occupied lanes
// and recover failed intro/easy leaps. Record every arrival, not just a leader.
// Hold the target at the photographed foothold: ordinary crowd collision can
// otherwise push an invulnerable test player into a different doorway.
for(let i=0;i<(window.__descentCrowdLimit||60)*60;i++){c.pos.set(6,4.003,-15.5);c.vel.set(0,0,0);c.onGround=true;const prev=g.zombies.map(e=>e.pos.clone());g.advance(1/60);g.zombies.forEach((e,j)=>{if(e.act?.descentRecovery&&!g.freeAt(e.pos.x,e.pos.y+.012,e.pos.z,e.r,e.h))penetrations++;maxStep=Math.max(maxStep,e.pos.distanceTo(prev[j]));if(e.onGround&&Math.abs(e.pos.y-4)<.1&&landed[j]===null)landed[j]=g.GAME.t;});if(landed.every(t=>t!==null))break;}
rows.push({count,initial,landed,penetrations,maxStep,player:c.pos.toArray(),end:g.zombies.map(e=>({p:e.pos.toArray(),act:e.act?{kind:e.act.kind,index:e.act.index}:null,edge:e.edge,node:e.node}))});}return rows;})()
