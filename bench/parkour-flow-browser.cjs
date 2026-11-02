// Actual movement/AI regression scenarios. No position/velocity corrections
// after the fixture is placed; releases read the visible green cue.
const fs=require('node:fs'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{chromium}=require('playwright');
const base=process.env.RUNNING_QA_URL||'http://127.0.0.1:8797/',out='browser-evidence/parkour-flow';
(async()=>{let browser,server;const results=[];try{
if(!process.env.RUNNING_QA_URL){server=spawn('python3',['-m','http.server','8797','--bind','127.0.0.1'],{stdio:'ignore'});for(let i=0;i<60;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100));}}
browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});fs.mkdirSync(out,{recursive:true});
for(const touch of [false,true]){
 const ctx=await browser.newContext({viewport:touch?{width:844,height:390}:{width:1280,height:720},hasTouch:touch,isMobile:touch});await ctx.addInitScript(()=>window.__hold=true);await ctx.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0,"ok":true}'}));
 const page=await ctx.newPage(),errors=[];page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'index.html');await page.waitForFunction(()=>window.skyStartReadiness?.ready&&window.skySwing);await page.locator('#bStart').click();
 const result=await page.evaluate(({touch})=>{
  const g=__game,s=__skyInternals,c=g.P,dt=1/120,rows=[];
  const off=()=>{for(const key of Object.keys(g.keys))g.keys[key]=false;Object.assign(s.inputState,{on:false,x:0,y:0,mag:0});};
  function jump(){if(touch){const b=document.getElementById('tJump');for(const type of ['pointerdown','pointerup'])b.dispatchEvent(new PointerEvent(type,{pointerId:777,pointerType:'touch',bubbles:true,cancelable:true}));}else for(const type of ['keydown','keyup'])dispatchEvent(new KeyboardEvent(type,{code:'Space',bubbles:true}));}
  function setup(id,{offset=0,yaw=0,seed=20261101,oldEntry=false,enemies=[]}={}){
   off();let random=seed;Math.random=()=>((random=(Math.imul(random,1664525)+1013904223)>>>0)/4294967296);g.S.sendLog=false;g.startGame();skySwing.reset();skyDash.reset(false);
   for(const z of [...g.zombies]){s.ue.remove(z.m.root);if(z.pool)s.ue.remove(z.pool);z.remove=true;}g.zombies.length=0;
   g.SCR.off=g.PACE.off=g.MARK.off=true;g.GAME.spawnT=g.GAME.surgeT=1e9;g.GAME.safeT=0;Object.assign(g.S,{sendLog:false,autoFire:false,aimAuto:false,stalkerOn:false,stalker2:false,dropShare:0});
   const route=skySwing.course.routes.find(r=>r.id===id),at=oldEntry?[20.25,5.7,3]:route.approach;
   g.placeAt({x:at[0]+Math.cos(route.yaw)*offset,y:at[1]+.0001,z:at[2]-Math.sin(route.yaw)*offset,yaw:route.yaw+yaw*Math.PI/180});skyFollowCamera.reset();
   Object.assign(c,{life:skyChallenge.maxLives(3),invuln:-1,jumpBuf:0,coyote:.15,catchCD:0,crouchPressed:false,hookPressed:false,edgeOff:null});
   for(let i=0;i<30;i++)g.advance(dt);g.GAME.t=0;c.node=g.nodeAt(c.pos.x,c.pos.y+.1,c.pos.z);g.updateField();
   for(const p of enemies){const z=new s.ri(p[0],p[1]+.01,p[2]);Object.assign(z,{spawnT:0,rise:null,onGround:true,flank:false,dropper:false,stalker:false});z.node=g.nodeAt(p[0],p[1]+.1,p[2]);g.zombies.push(z);}
   return route;
  }
  function run(id,opts={}){
   const route=setup(id,opts),life=c.life,cap=g.solids.find(b=>b.oldTownSwing===(id==='north-corner'?'north-corner-ledge':'east-arrival')),warm=id==='north-corner'?60:0;
   const bars=new Set(),trail=[],initialYaw=c.yaw;let due=null,latch=false,landed=false,recovered=false,dropStarted=false;
   g.keys.KeyW=true;
   for(let tick=0;tick<1200&&!g.GAME.over;tick++){
    if(tick===warm)jump();const a=skySwing.active;
    if(a)bars.add(a.bar.id);
    if(opts.drop&&a&&!dropStarted){g.keys.KeyW=false;g.keys.KeyS=true;dropStarted=true;}
    else if(opts.drop&&dropStarted&&!a){g.keys.KeyS=false;}
    const ready=document.getElementById('swingHint').dataset.ready==='true'&&!document.getElementById('swingHint').hidden;
    if(!opts.drop&&ready&&!latch){due=tick+Math.round((opts.delay||0)/dt);latch=true;}
    if(due!==null&&tick>=due){jump();due=null;}if(!ready&&due===null)latch=false;
    g.advance(dt);
    if(tick%12===0)trail.push({t:g.GAME.t,p:c.pos.toArray(),state:c.state,life:c.life,bar:skySwing.active?.bar.id});
    if(c.life!==life)break;
    if(bars.size===(id==='north-corner'?2:3)&&c.onGround&&c.state==='normal'&&Math.abs(c.pos.y-cap.maxY)<.1&&c.pos.x>=cap.minX&&c.pos.x<=cap.maxX&&c.pos.z>=cap.minZ&&c.pos.z<=cap.maxZ){landed=true;break;}
    if(opts.drop&&dropStarted&&c.onGround&&Math.abs(c.pos.y+3.5)<.1){recovered=true;break;}
   }
   off();return{id,opts,landed,recovered,lifeBefore:life,lifeAfter:c.life,bars:[...bars],yawDrift:Math.abs(c.yaw-initialYaw),end:c.pos.toArray(),trail};
  }
  for(const id of ['north-corner','east'])for(const oldEntry of id==='east'?[false,true]:[false])for(const offset of [-.35,0,.35])for(const yaw of [-5,0,5])rows.push(run(id,{oldEntry,offset,yaw}));
  for(const delay of [.025,.05,.075])rows.push(run('north-corner',{delay}));
  const drop=run('north-corner',{drop:true});
  // Recover from the actual failed movement, then rejoin the ground exit.
  let recoveryWalk=false;
  if(drop.recovered){
   for(const target of [[-18.6,-3.5,-15.5],[-18.6,0,-7.5],[-18.6,0,-6.8]]){
    let done=false;for(let i=0;i<1800&&!g.GAME.over;i++){
     const dx=target[0]-c.pos.x,dz=target[2]-c.pos.z;if(Math.hypot(dx,dz)<.25&&Math.abs(c.pos.y-target[1])<.35&&c.onGround){done=true;break;}
     c.yaw=Math.atan2(-dx,-dz);g.keys.KeyW=true;g.advance(dt);
    }off();if(!done)break;if(target[2]===-6.8)recoveryWalk=true;
   }
  }
  const recovery={...drop,recoveryWalk,walkEnd:c.pos.toArray(),walkLife:c.life};
  const pursuit=[];
  for(const seed of [20261101,20261102,20261103]){
   const run=runPursuit(seed);pursuit.push(run);
  }
  function runPursuit(seed){
   const traversal=run('north-corner',{seed,enemies:[[5,4,-16]]}),start=g.GAME.t,life=c.life;
   let near=null,firstDamage=null,dropFrames=0,blockedDropFrames=0;
   for(let i=0;i<30*120&&!g.GAME.over;i++){
    g.advance(dt);const enemy=g.zombies[0];
    // A pursuer can now choose a checked higher descent instead of the old
    // fixed drop link. Both must descend in real space without penetration.
    if(enemy?.act&&['drop','jumpdown'].includes(enemy.act.kind)&&enemy.act.ty<enemy.act.sy){dropFrames++;if(!g.freeAt(enemy.pos.x,enemy.pos.y+.015,enemy.pos.z,enemy.r,enemy.h))blockedDropFrames++;}
    if(near===null&&enemy&&Math.abs(enemy.pos.y-c.pos.y)<1.2&&Math.hypot(enemy.pos.x-c.pos.x,enemy.pos.z-c.pos.z)<1.5)near=g.GAME.t-start;
    if(firstDamage===null&&c.life<life)firstDamage=g.GAME.t-start;
   }
   return{seed,landed:traversal.landed,near,firstDamage,dropFrames,blockedDropFrames};
  }
  g.cam(0);g.frameOnce(0);
  return{touch,rows,recovery,pursuit,gl:g.debug.renderer.getContext().getError()};
 },{touch});
 results.push(result);fs.writeFileSync(out+'/results.json',JSON.stringify({results},null,2));await page.screenshot({path:`${out}/${touch?'touch':'desktop'}.png`});
 assert.deepEqual(errors,[]);assert.equal(result.gl,0);for(const r of result.rows){assert.ok(r.landed,JSON.stringify({touch,id:r.id,opts:r.opts,end:r.end,bars:r.bars}));assert.equal(r.lifeAfter,r.lifeBefore);assert.ok(r.yawDrift<1e-7);}
 assert.ok(result.recovery.recovered&&result.recovery.recoveryWalk,JSON.stringify(result.recovery));assert.equal(result.recovery.walkLife,result.recovery.lifeBefore);
 for(const r of result.pursuit){assert.ok(r.landed&&r.near>=3&&r.firstDamage<20,JSON.stringify(r));assert.ok(r.dropFrames>0);assert.equal(r.blockedDropFrames,0,JSON.stringify(r));}
 console.log(`PASS parkour flow ${touch?'touch':'desktop'}: ${result.rows.length} cue/entry cases, drop → lower stairs → ground, three seeded pursuers return after a respite`);await ctx.close();
}
}finally{await browser?.close();server?.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
