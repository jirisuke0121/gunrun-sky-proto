const assert=require('node:assert/strict');
(async()=>{
 const {createZombiePursuit}=await import('../zombie-pursuit.js');global.document={getElementById:()=>null};
 function setup({clear=false,queued=false,bash=false,far=false}={}){
  global.window={skyZombieRouting:{directChase:()=>clear},skyZombieLadders:{state:()=>({queued})}};
  const e={pos:{x:far?5:2,y:0,z:0},onGround:true,spawnT:0,node:0,edge:0,navT:1,bash};
  const game={U:{},Jn:{},Jt:[e],c:{pos:{x:0,y:0,z:0}},z:{t:0},ceRef:()=>game.z.t},jams=[];
  const runtime={FIELD:[2,0],jamNavigationEdge:(id,until)=>jams.push({id,until})};
  const pursuit=createZombiePursuit(game,runtime);
  for(let i=0;i<200;i++){game.z.t+=1/60;pursuit.observe(e,1/60);}
  return {e,jams,pursuit};
 }
 assert.equal(setup({clear:true}).jams.length,0,'normal nearby melee does not reroute');
 const blocked=setup();assert.equal(blocked.jams.length,1,'a nearby wall does not suppress stall recovery');assert.equal(blocked.jams[0].id,0);assert.equal(blocked.e.edge,-1);assert.equal(blocked.e.navT,0);
 assert.equal(setup({queued:true}).jams.length,0,'intentional ladder waits do not close their own route');
 assert.equal(setup({bash:true}).jams.length,0,'door breaking retains its original behavior');
 assert.equal(setup({far:true,clear:true}).jams.length,1,'ordinary distant stalls still reroute');
 console.log('PASS pursuit stalls: nearby obstructed chase, normal melee, intentional ladder queues, doors and distant stalls');
})().catch(e=>{console.error(e);process.exitCode=1;});
