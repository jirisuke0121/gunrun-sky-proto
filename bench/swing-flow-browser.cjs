// Test the design's operating claims, not whether it is subjectively fun.
const fs=require('node:fs'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {chromium}=require('playwright');
const base=process.env.RUNNING_QA_URL||'http://127.0.0.1:8775/';
(async()=>{let browser,server,result;
try{
 if(!process.env.RUNNING_QA_URL){server=spawn('python3',['-m','http.server','8775','--bind','127.0.0.1'],{stdio:'ignore'});for(let i=0;i<50;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100));}}
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>window.__hold=true);
 await page.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0,"ok":true}'}));
 await page.goto(base+'canyon.html');await page.waitForFunction(()=>window.skySwing&&window.__game&&!document.getElementById('bStart').disabled);
 await page.locator('#bStart').click();
 result=await page.evaluate(()=>{
  const g=__game,s=__skyInternals,c=g.P,dt=1/60,N=g.NAV;
  const node=p=>N.nodes.reduce((best,n)=>Math.hypot(n.x-p[0],n.y-p[1],n.z-p[2])<Math.hypot(N.nodes[best].x-p[0],N.nodes[best].y-p[1],N.nodes[best].z-p[2])?n.id:best,0);
  const key=(name,type)=>dispatchEvent(new KeyboardEvent(type,{code:name}));
  function clearEnemies(){for(const z of s.Jt){s.ue.remove(z.m.root);if(z.pool)s.ue.remove(z.pool);}s.Jt.length=0;}
  function setup(offset=0){
   key('Space','keyup');let seed=20261027;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
   g.S.sendLog=false;g.startGame();skySwing.reset();clearEnemies();
   for(const e of N.E)if(e.jamT)e.jamT=0;
   g.SCR.off=g.PACE.off=g.MARK.off=true;g.GAME.spawnT=g.GAME.surgeT=1e9;g.GAME.over=false;g.GAME.t=0;
   Object.assign(g.S,{sendLog:false,stalkerOn:false,stalker2:false,dropShare:0,autoFire:false,aimAuto:false,loseSight:1});
   Object.keys(g.keys).forEach(k=>g.keys[k]=false);
   c.pos.set(-20.39,4.0001,-6+offset);c.vel.set(0,0,0);c.state='normal';c.onGround=true;c.h=1.75;c.jumpBuf=0;c.coyote=.15;c.edgeOff=null;c.hookPressed=false;c.catchCD=0;c.life=3;c.invuln=1e9;c.yaw=-Math.PI/2;c.pitch=0;
   c.node=node(c.pos.toArray());g.updateField();
  }
  const tick=()=>{g.advance(dt);if(!c.pos.toArray().every(Number.isFinite))throw Error('nonfinite player');};
  function route({offset=0,yaw=0,angle=.7,waitCycle=false,backward=false,enemy=false,knownTarget=false}={}){
   setup(offset);const bars=new Set(),trail=[];let input=0,landed=false;
   // A separate navigation-only probe retains the original arrival bound.
   // Normal gameplay must let this real parkour escape break visual contact.
   if(knownTarget)g.S.loseSight=0;
   if(enemy){
    let from={x:-20,y:4,z:-11};
    if(!knownTarget){
     from=N.nodes.find(p=>{
      const dx=c.pos.x-p.x,dy=c.pos.y+1.25-(p.y+1.5),dz=c.pos.z-p.z,d=Math.hypot(dx,dy,dz);
      return Math.abs(p.y-c.pos.y)<.1&&p.x<=c.pos.x+.5&&d>3&&d<6&&s.oe(p.x,p.y+.03,p.z,.3,1.8)&&!s.raycast(p.x,p.y+1.5,p.z,dx/d,dy/d,dz/d,d-.1);
     });
     if(!from)throw Error('No visible, supported chase start for the real swing escape');
    }
    const z=new s.ri(from.x,from.y+.01,from.z);z.spawnT=0;z.rise=null;z.node=node(z.pos.toArray());z.hp=1e6;z.flank=z.dropper=z.stalker=false;z.onGround=true;
    z.yaw=Math.atan2(z.pos.x-c.pos.x,z.pos.z-c.pos.z);s.Jt.push(z);
    if(!knownTarget){
     // Establish an actual sighted chase before testing whether the parkour
     // route breaks it. Randomly facing away is an unaware patrol, not escape.
     z.stun=2;for(let i=0;i<48;i++)tick();z.stun=0;
     if(skyZombieSearch.state(z)?.phase!=='chase')throw Error('Swing escape did not start from a confirmed visual chase');
    }
   }
   key('Space','keydown');key('Space','keyup');input++;
   for(let i=0;i<6;i++)tick();
   key('Space','keydown');key('Space','keyup');input++;g.keys.KeyW=true;
   let pad=false;for(let i=0;i<80;i++){tick();if(c.onGround&&c.pos.x>-18&&c.pos.y>5){pad=true;break;}}
   if(!pad)return{landed:false,phase:'pad',pos:c.pos.toArray()};
   c.yaw+=yaw;key('Space','keydown');key('Space','keyup');input++;
   const released=new Set();
   for(let i=0;i<720;i++){
    const a=skySwing.active;
    if(a){bars.add(a.bar.id);if(!released.has(a.bar.id)&&(backward ? a.angle>.35&&a.omega<-2 : a.angle>=angle&&a.omega>1.1)&&(!waitCycle||a.age>1.5)){released.add(a.bar.id);key('Space','keydown');key('Space','keyup');input++;}}
    tick();trail.push({t:g.GAME.t,pos:c.pos.toArray(),state:c.state,bar:skySwing.active?.bar.id});
    if(bars.size===2&&c.onGround&&c.pos.y>7.9){landed=true;break;}
    if(c.onGround&&c.pos.y<1)break;
   }
   key('Space','keyup');const at=c.pos.toArray(),time=g.GAME.t;
   let caughtAt=null,enemyPath=[];
   if(enemy&&landed){
    g.keys.KeyW=false;c.vel.set(0,0,0);
    for(let i=0;i<2100;i++){tick();const z=s.Jt[0];if(!z)break;if(i%60===0)enemyPath.push({t:g.GAME.t,pos:z.pos.toArray(),state:z.act?.kind,awareness:skyZombieSearch.state(z)?.phase});if(Math.abs(z.pos.y-c.pos.y)<1.2&&Math.hypot(z.pos.x-c.pos.x,z.pos.z-c.pos.z)<1.5){caughtAt=g.GAME.t;break;}}
   }
   return{landed,pad,bars:[...bars],offset,yaw,angle,waitCycle,backward,input,time,at,caughtAt,enemyPath,escapes:skyZombieSearch.stats.escapes,trail};
  }
  const cases=[{}, {angle:.55}, {angle:.85}, {waitCycle:true}, {offset:.35,yaw:.06}, {offset:-.35,yaw:-.06}].map(route);
  const mistimed=[{angle:-1}, {backward:true}].map(route);
  const chase=route({enemy:true});
  const informedChase=route({enemy:true,knownTarget:true});
  // Estimate the existing walk/climb route with the game's own traversal costs;
  // exclude hooks, ziplines and the new swing state from this baseline.
  setup();const start=node([-20.39,4,-6]),goal=node(skySwingCourse.exit),dist=new Float64Array(N.nodes.length).fill(Infinity),used=new Set();dist[start]=0;
  for(let it=0;it<N.nodes.length;it++){
   let best=-1;for(let j=0;j<dist.length;j++)if(!used.has(j)&&(best<0||dist[j]<dist[best]))best=j;
   if(best<0||!Number.isFinite(dist[best])||best===goal)break;used.add(best);
   for(const id of N.out[best]){const e=N.E[id];const t=e.kind===5?(e.climb||4)/g.S.ladderSpeed:skyChallenge.travelCost(e,e.len/g.S.sprintSpeed);if(dist[best]+t<dist[e.to])dist[e.to]=dist[best]+t;}
  }
  // Brake on the landing, recenter, and leave through the existing spine
  // without an extra jump or camera turn.
  route();g.keys.KeyW=false;const exitFrom=c.pos.toArray();
  // Brake the carried swing momentum, then follow the deck chevrons inward.
  for(let i=0;i<8;i++)tick();
  g.keys.KeyS=true;for(let i=0;i<90&&c.pos.x>.7;i++)tick();g.keys.KeyS=false;g.keys.KeyA=true;
  for(let i=0;i<60;i++)tick();const exitTo=c.pos.toArray(),exitGround=c.onGround;
  // Deliberately skip release: drop to the existing floor, no fall/respawn.
  setup();c.pos.set(-12.9,6.05,-6);c.onGround=false;c.vel.set(5,0,0);g.playerStep(dt);
  const grabbed=!!skySwing.active,life=c.life;c.crouchPressed=true;g.keys.KeyW=false;
  for(let i=0;i<180&&!c.onGround;i++)tick();const fallback={grabbed,lifeBefore:life,lifeAfter:c.life,pos:c.pos.toArray(),ground:c.onGround};
  // Structural visibility from both approaches: signs lie inside a normal
  // horizontal field of view and have no collision wall between eye and sign.
  const visibility=[{from:[-20,5.62,-13],sign:[-17.9,6.5,-10.5],facing:[0,1]}, {from:[-20,5.62,1],sign:[-17.9,7,-2],facing:[0,-1]}].map(v=>{
    const delta=v.sign.map((x,k)=>x-v.from[k]),length=Math.hypot(...delta),hit=s.raycast(...v.from,...delta.map(x=>x/length),length-.15);
    return{...v,visible:!hit,angle:Math.acos((delta[0]*v.facing[0]+delta[2]*v.facing[1])/Math.hypot(delta[0],delta[2]))};
  });
  return{cases,mistimed,chase,informedChase,walkEstimate:dist[goal],exit:{from:exitFrom,to:exitTo,ground:exitGround},fallback,visibility,settings:{difficulty:skyChallenge.id,sprint:g.S.sprintSpeed},note:'Synthetic controller: normal visual escape plus a separate known-target navigation arrival probe; not a human fun study.'};
 });
 fs.mkdirSync('browser-evidence/swing',{recursive:true});fs.writeFileSync('browser-evidence/swing/flow-results.json',JSON.stringify(result,null,2));
 assert.ok(result.cases.every(x=>x.landed),JSON.stringify(result.cases.map(({trail,...r})=>r)));
 assert.ok(result.mistimed.every(x=>!x.landed&&x.input===4&&x.bars.length===1),'early/returning presses must not be corrected into a successful chain');
 assert.ok(Number.isFinite(result.walkEstimate)&&result.walkEstimate-result.cases[0].time>2,'at least two seconds saved against an optimistic walk/climb lower bound (ladder exit overhead omitted)');
 assert.ok(result.chase.landed&&result.chase.caughtAt===null&&result.chase.escapes>0&&result.chase.enemyPath.some(p=>p.awareness==='search')&&result.chase.enemyPath.some(p=>p.awareness==='patrol'),JSON.stringify({...result.chase,trail:undefined}));
 assert.ok(result.informedChase.landed&&result.informedChase.caughtAt>result.informedChase.time+2&&result.informedChase.caughtAt<35,JSON.stringify({...result.informedChase,trail:undefined}));
 assert.ok(result.fallback.ground&&result.fallback.lifeBefore===result.fallback.lifeAfter);
 assert.ok(result.visibility.every(v=>v.visible&&v.angle<Math.PI/3.6));
 assert.ok(result.exit.to[1]>7.9&&Math.abs(result.exit.to[2]-result.exit.from[2])>4,'leave the landing through the existing spine');
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({cases:result.cases.map(({trail,...r})=>r),mistimed:result.mistimed.map(({trail,...r})=>r),walkEstimate:result.walkEstimate,chase:{time:result.chase.time,caughtAt:result.chase.caughtAt},exit:result.exit,fallback:result.fallback,visibility:result.visibility}));
}finally{await browser?.close();server?.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
