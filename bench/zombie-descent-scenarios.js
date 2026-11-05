(()=>{const g=__game,s=__skyInternals,c=g.P;
const fixtures=window.__descentFixtures || (window.SKY_CANYON_MAP?[
{id:'upper-to-ground',p:[0,0,-18],e:[0,8,-6]},
{id:'upper-to-middle',p:[0,4,0],e:[0,8,-6]},
{id:'east-upper',p:[12,4,13],e:[12,8,13]},
{id:'middle-to-ground',p:[23,0,0],e:[20,4,0]},
{id:'cross-to-ground',p:[3,0,0],e:[0,4,0]},
{id:'west-upper',p:[-12,4,13],e:[-12,8,13]},
]:[
...[1.3,6,11.5].flatMap(px=>[-8,-4,-1].map(ex=>({id:`photo-${px}-${ex}`,p:[px,4,-15.5],e:[ex,8,-13.5]}))),
{id:'stair-no-node',p:[-22.5,6.7,1.25],e:[-30,11.9,1]},
{id:'small-slab-no-node',p:[30.75,7.4,-12.15],e:[31,12.3,-8]},
{id:'west-control',p:[-29,4.2,-9],e:[-31,11.9,-10]},
{id:'roof-south',p:[1,4,15],e:[-3,8,12]},
{id:'roof-west',p:[-16,0,0],e:[-12,8,0]},
{id:'roof-east',p:[16,0,-3],e:[12,8,-3]},
]);let seed=20261105;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const rows=[];for(const f of fixtures){g.startGame();window.skyBite?.reset();for(const key of Object.keys(g.keys))g.keys[key]=false;for(const e of g.zombies)s.ue.remove(e.m.root);g.zombies.length=0;g.GAME.spawnT=g.GAME.surgeT=1e9;g.SCR.off=g.PACE.off=g.MARK.off=true;g.STALK.spawned=true;Object.assign(g.S,{sendLog:false,autoFire:false,aimAuto:false,stalkerOn:false});
c.pos.set(f.p[0],f.p[1]+.003,f.p[2]);c.vel.set(0,0,0);Object.assign(c,{onGround:true,state:'normal',h:1.75,invuln:0,ledge:null,ladder:null,hook:null,zip:null});c.lastGround.copy(c.pos);c.safe.copy(c.pos);c.node=g.nodeAt(c.pos.x,c.pos.y+.1,c.pos.z);g.updateField();const life=c.life;
const e=new g.Zombie(f.e[0],f.e[1]+.003,f.e[2]);Object.assign(e,{spawnT:0,onGround:true,flank:false,dropper:false,stalker:false,pz:false,speedMul:1});g.zombies.push(e);const valid=g.freeAt(e.pos.x,e.pos.y+.012,e.pos.z,e.r,e.h)&&g.freeAt(c.pos.x,c.pos.y+.012,c.pos.z,c.r,c.h)&&skyZombieClimb.clearLine(e,e.pos,e.pos,true)&&skyZombieClimb.clearLine(c,c.pos,c.pos,true);const trail=[];let firstDamage=null,firstLower=null,penetrations=0,maxStep=0;const before={...window.window.skyZombieDescent?.stats};
for(let i=0;i<(window.__descentLimit||45)*60&&!g.GAME.over;i++){const prev=e.pos.clone();g.advance(1/60);maxStep=Math.max(maxStep,e.pos.distanceTo(prev));if(e.act?.descentRecovery&&!g.freeAt(e.pos.x,e.pos.y+.012,e.pos.z,e.r,e.h))penetrations++;if(e.pos.y<f.e[1]-1&&firstLower===null)firstLower=g.GAME.t;if(i%120===0)trail.push({t:g.GAME.t,p:e.pos.toArray(),edge:e.edge,act:e.act?.kind,player:c.pos.toArray()});if(c.life<life||g.GAME.bloodT>0){firstDamage=g.GAME.t;break;}}
rows.push({...f,valid,firstDamage,firstLower,penetrations,maxStep,started:(window.skyZombieDescent?.stats.started||0)-(before.started||0),landed:(window.skyZombieDescent?.stats.landed||0)-(before.landed||0),end:e.pos.toArray(),trail});}return rows;})()
