const fs=require('node:fs'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {chromium}=require('playwright');
(async()=>{let browser,server;const results=[];try{
 const base='http://127.0.0.1:8796/';server=spawn('python3',['-m','http.server','8796','--bind','127.0.0.1'],{stdio:'ignore'});
 for(let i=0;i<100;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 fs.mkdirSync('browser-evidence/roof-drop',{recursive:true});
 for(const touch of [false,true]){
  const context=await browser.newContext({viewport:touch?{width:844,height:390}:{width:1536,height:710},hasTouch:touch,isMobile:touch}),page=await context.newPage(),errors=[];
  await page.addInitScript(()=>window.__hold=true);page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"top":[],"total":0}'}));
  await page.goto(base+'index.html');await page.waitForFunction(()=>window.__game&&window.skyHumanView&&!document.getElementById('bStart').disabled);
  await page.evaluate(()=>{
   const g=__game,s=__skyInternals,c=g.P;Object.assign(g.S,g.DEF,{sendLog:false,autoFire:false,aimAuto:false});g.startGame();
   for(const enemy of g.zombies){s.ue.remove(enemy.m.root);if(enemy.pool)s.ue.remove(enemy.pool)}g.zombies.length=0;
   g.SCR.off=g.PACE.off=g.MARK.off=true;g.GAME.spawnT=g.GAME.surgeT=1e9;g.GAME.over=false;
   skyFollowCamera?.setMode('before',false);
   window.roofQA={reset(p,yaw){
    for(const k of Object.keys(g.keys))g.keys[k]=false;Object.assign(s.inputState,{on:false,x:0,y:0,mag:0,slideHeld:false});
    skySwing.reset();g.placeAt({x:p[0],y:p[1],z:p[2],yaw});
    Object.assign(c,{life:3,invuln:1e9,wallDrop:null,wallKey:null,hookPressed:false,jumpBuf:0,coyote:0});
   },render(){g.cam(1/60);skyHumanView.update(1/60);g.debug.renderer.clear();g.debug.renderer.render(s.ue,s.Se)},
   state(){return{p:c.pos.toArray(),v:c.vel.toArray(),state:c.state,h:c.h,ground:c.onGround,jumps:g.stats.walljumps||0}}};
  });
  const roof=await page.evaluate(()=>{
   const g=__game,c=g.P,solids=g.solids,states=[];
   for(const z of [2,2.9,3.8])for(const reverse of [false,true])for(const speed of [2.6,6]){
    const x=reverse?39:35.45,target=reverse?35.45:39,sign=reverse?-1:1,expected=1.3+(x-35)/4.5*1.7;
    const top=Math.max(...solids.filter(b=>b.hidden&&b.slideSlope&&x+c.r>b.minX&&x-c.r<b.maxX&&z+c.r>b.minZ&&z-c.r<b.maxZ&&Math.abs(b.maxY-expected)<.6).map(b=>b.maxY));
    roofQA.reset([x,top+.0001,z],-sign*Math.PI/2);g.S.walkSpeed=g.S.sprintSpeed=speed;
    for(let i=0;i<12;i++)g.playerStep(1/120);g.keys.KeyW=true;let done=false;
    for(let i=0;i<600;i++){
     g.playerStep(1/120);
     if(c.state!=='normal'||c.h!==1.75||!c.onGround)throw Error('roof traversal '+JSON.stringify(roofQA.state()));
     if((target-c.pos.x)*sign<.12){done=true;break;}
    }
    if(!done)throw Error('roof blocked '+JSON.stringify(roofQA.state()));states.push({z,reverse,speed,end:roofQA.state()});
   }
   // Keep the new return connected, with no intermediate position changes.
   roofQA.reset([36,7,-.5],Math.PI);g.S.walkSpeed=g.S.sprintSpeed=6;
   for(let i=0;i<12;i++)g.playerStep(1/120);
   for(const point of [[36,5.8,6],[41,4.4,6]]){
    let done=false;g.keys.KeyW=true;
    for(let i=0;i<900;i++){
     const dx=point[0]-c.pos.x,dz=point[2]-c.pos.z;
     if(Math.hypot(dx,dz)<.18&&Math.abs(c.pos.y-point[1])<.2){done=true;break;}
     c.yaw=Math.atan2(-dx,-dz);g.playerStep(1/120);
     if(c.state!=='normal'||!c.onGround)throw Error('return passage '+JSON.stringify(roofQA.state()));
    }
    if(!done)throw Error('return blocked '+JSON.stringify(roofQA.state()));g.keys.KeyW=false;for(let i=0;i<12;i++)g.playerStep(1/120);
   }
   const returnEnd=roofQA.state();roofQA.reset([35.6,1.65,2.9],-Math.PI/2);roofQA.render();return{states,returnEnd};
  });
  await page.screenshot({path:`browser-evidence/roof-drop/${touch?'touch':'desktop'}-roof-clear.png`});
  console.log('PASS standing roof and connected return',touch?'touch':'desktop');
  const jump=async()=>{if(touch)await page.locator('#tJump').tap();else await page.keyboard.press('Space');};
  // The return passage must also leave the original three-bar lane open.
  await page.evaluate(()=>{roofQA.reset([20.25,5.7,3],-Math.PI/2);for(let i=0;i<12;i++)__game.playerStep(1/120);__game.keys.KeyW=true;for(let i=0;i<24;i++)__game.playerStep(1/120);});
  await jump();const bars=new Set();let threeBarEnd=null;
  for(let i=0;i<360;i++){
   const state=await page.evaluate(()=>{
    for(let i=0;i<4;i++)__game.playerStep(1/120);
    const a=skySwing.active;return{...roofQA.state(),bar:a?.bar.id,angle:a?.angle,omega:a?.omega};
   });
   if(state.bar)bars.add(state.bar);
   if(state.bar&&state.angle>=.7&&state.omega>1.1)await jump();
   if(bars.size&&state.ground){threeBarEnd=state;break;}
  }
  assert.deepEqual([...bars],['oldtown-east-bar-1','oldtown-east-bar-2','oldtown-east-bar-3']);
  assert.ok(threeBarEnd&&threeBarEnd.p[0]>51&&Math.abs(threeBarEnd.p[1]-3.6)<.1,JSON.stringify({bars:[...bars],threeBarEnd}));
  console.log('PASS original three-bar lane',touch?'touch':'desktop',threeBarEnd.p);
  const falls=[];
  // Real gravity from above, approaching the face with normal velocity.
  for(const vertical of [-9,-24,-40])for(const speed of [0,2,6]){
   const caught=await page.evaluate(({vertical,speed})=>{
    const g=__game,c=g.P;roofQA.reset([26,10,-.7],-Math.PI/2);
    c.onGround=false;c.airT=.2;c.vel.set(speed,vertical,-4);g.keys.KeyW=true;
    let frame=0,wasFree=false;
    for(;frame<120&&c.state!=='wallrun';frame++){
     if(c.pos.z+1.5>c.r+.16)wasFree=true;g.playerStep(1/120);
    }
    if(c.state!=='wallrun'||!wasFree||c.vel.y>0)throw Error('falling capture '+JSON.stringify(roofQA.state()));
    roofQA.render();return{frame,before:roofQA.state(),jumpCount:g.stats.walljumps||0};
   },{vertical,speed});
   await jump();
   const after=await page.evaluate(()=>{for(let i=0;i<4;i++)__game.playerStep(1/120);return roofQA.state()});
   assert.equal(after.jumps,caught.jumpCount+1);assert.ok(after.v[1]>0&&after.v[2]>0);assert.equal(after.state,'normal');
   falls.push({vertical,speed,...caught,after});
   console.log('PASS falling catch and jump',touch?'touch':'desktop',vertical,speed);
  }
  // A purely vertical fall can use a buffered jump with no running input.
  await page.evaluate(()=>{roofQA.reset([-14.36,5.6,6.8],Math.PI);const c=__game.P;c.onGround=false;c.airT=.2;c.vel.set(0,-24,0);});
  const before=await page.evaluate(()=>__game.stats.walljumps||0);await jump();
  const verticalJump=await page.evaluate(()=>{for(let i=0;i<4;i++)__game.playerStep(1/120);roofQA.render();return roofQA.state()});
  assert.equal(verticalJump.jumps,before+1);assert.ok(verticalJump.v[0]<0&&verticalJump.v[1]>0);
  await page.screenshot({path:`browser-evidence/roof-drop/${touch?'touch':'desktop'}-fall-wall-jump.png`});
  await jump();const second=await page.evaluate(()=>{for(let i=0;i<4;i++)__game.playerStep(1/120);return roofQA.state()});
  assert.equal(second.jumps,verticalJump.jumps,'one falling catch cannot grant repeated airborne jumps');
  assert.deepEqual(errors,[]);results.push({touch,roof,threeBarEnd,falls,verticalJump});await context.close();
 }
 console.log('PASS roof standing traversal and connected return; falling contact, wallrun and keyboard/touch jump, including zero horizontal speed and no movement input');
}finally{fs.mkdirSync('browser-evidence/roof-drop',{recursive:true});fs.writeFileSync('browser-evidence/roof-drop/results.json',JSON.stringify(results,null,2));await browser?.close();server?.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
