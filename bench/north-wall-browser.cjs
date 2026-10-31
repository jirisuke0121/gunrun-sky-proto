const fs=require('node:fs'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {chromium}=require('playwright');
(async()=>{let browser,server;const results=[];try{
 const base='http://127.0.0.1:8797/';server=spawn('python3',['-m','http.server','8797','--bind','127.0.0.1'],{stdio:'ignore'});
 for(let i=0;i<100;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 fs.mkdirSync('browser-evidence/north-wall',{recursive:true});
 for(const touch of [false,true]){
  const context=await browser.newContext({viewport:touch?{width:844,height:390}:{width:1536,height:710},hasTouch:touch,isMobile:touch}),page=await context.newPage(),errors=[];
  await page.addInitScript(()=>window.__hold=true);page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"top":[],"total":0}'}));
  await page.goto(base+'index.html');await page.waitForFunction(()=>window.__game&&window.skyHumanView&&!document.getElementById('bStart').disabled);
  await page.evaluate(()=>{
   const g=__game,s=__skyInternals,c=g.P;Object.assign(g.S,g.DEF,{sendLog:false,autoFire:false,aimAuto:false});g.startGame();
   for(const enemy of g.zombies){s.ue.remove(enemy.m.root);if(enemy.pool)s.ue.remove(enemy.pool)}g.zombies.length=0;
   g.SCR.off=g.PACE.off=g.MARK.off=true;g.GAME.spawnT=g.GAME.surgeT=1e9;g.GAME.over=false;skyFollowCamera?.setMode('before',false);
   window.northQA={reset(p,yaw){
    for(const k of Object.keys(g.keys))g.keys[k]=false;Object.assign(s.inputState,{on:false,x:0,y:0,mag:0,slideHeld:false});
    skySwing.reset();skyDash.reset(false);g.placeAt({x:p[0],y:p[1],z:p[2],yaw});
    Object.assign(c,{life:3,invuln:1e9,wallDrop:null,wallKey:null,hookPressed:false,jumpBuf:0,coyote:0});
   },render(){g.cam(1/60);skyHumanView.update(1/60);g.debug.renderer.clear();g.debug.renderer.render(s.ue,s.Se)},
   state(){return{p:c.pos.toArray(),v:c.vel.toArray(),state:c.state,h:c.h,ground:c.onGround,life:c.life,jumps:g.stats.walljumps||0}}};
  });
  const jump=async()=>{if(touch)await page.locator('#tJump').tap();else await page.keyboard.press('Space');};
  const record={touch,kicks:[]};results.push(record);
  // The old test only started at y=.3. The video takes off higher: cover the
  // full original take-off height/window, without moving the player midflight.
  for(const height of [1.4,1.8,2.05])for(const z of [-12,-13.4,-13.9]){
   const before=await page.evaluate(({height,z})=>{
    const g=__game,c=g.P;northQA.reset([-14.36,height,z],-.3);
    c.onGround=false;c.airT=.12;c.vel.set(0,1.8,-9.3);g.keys.KeyW=true;g.playerStep(1/120);
    if(c.state!=='wallrun')throw Error('wall approach '+JSON.stringify(northQA.state()));return northQA.state();
   },{height,z});
   await jump();
   const after=await page.evaluate(()=>{for(let i=0;i<25;i++)__game.playerStep(1/120);northQA.render();return northQA.state()});
   assert.equal(after.jumps,before.jumps+1);assert.ok(after.v[1]>2.5,'head impact cancelled the jump '+JSON.stringify({height,z,before,after}));
   assert.ok(after.p[1]>before.p[1]+.8&&after.p[0]<before.p[0]-1,'wall kick must rise and move outward');
   record.kicks.push({height,z,before,after});
   if(height===1.8&&z===-13.4){
    await page.screenshot({path:`browser-evidence/north-wall/${touch?'touch':'desktop'}-head-clear.png`});
    const landing=await page.evaluate(()=>{
     const g=__game,c=g.P;
     for(let i=0;i<600;i++){
      c.yaw=Math.atan2(c.pos.x+18,c.pos.z+23.1);g.playerStep(1/120);
      if(c.onGround||c.pos.y<-10)break;
     }
     return northQA.state();
    });
    assert.ok(landing.ground&&Math.abs(landing.p[1])<.15&&landing.p[2]<-22&&landing.life===3,JSON.stringify(landing));record.videoLikeLanding=landing;
   }
  }
  console.log('PASS higher north wall-kick takeoffs and original beam landing',touch?'touch':'desktop');
  // Real capsule movement through the exact removed end, at head height.
  record.circledEnd = await page.evaluate(() => {
   const g=__game,c=g.P,old={minX:-24,maxX:-20,minY:3.9,maxY:4.2,minZ:-17.4,maxZ:-13};
   northQA.reset([-19.55,2.3,-14.5],Math.PI/2);
   c.onGround=false;c.airT=.3;c.vel.set(-10,.8,-2);g.keys.KeyW=true;
   let previousHits=0;const frames=[];
   for(let i=0;i<48;i++){
    const previous=c.vel.y;g.playerStep(1/120);
    const p=c.pos;
    if(p.x+.32>old.minX&&p.x-.32<old.maxX&&p.z+.32>old.minZ&&p.z-.32<old.maxZ&&p.y+1.75>old.minY&&p.y<old.maxY)previousHits++;
    if(previous>.2&&c.vel.y<.01)throw Error('head was stopped at circled end');
    frames.push(northQA.state());
   }
   northQA.render();return{previousHits,frames};
  });
  assert.ok(record.circledEnd.previousHits>0,'real flight must overlap the removed end');
  assert.ok(record.circledEnd.frames.at(-1).p[0]<-21.5,'must pass the former obstacle');
  await page.screenshot({path:`browser-evidence/north-wall/${touch?'touch':'desktop'}-circled-end-clear.png`});

  // Keep ⑥ usable as a two-bar chain to its relocated outer landing.
  await page.evaluate(()=>{
   const g=__game,c=g.P;northQA.reset([2,4,-15.5],Math.PI/2);
   for(let i=0;i<12;i++)g.playerStep(1/120);g.keys.KeyW=true;
   for(let i=0;i<180&&c.pos.x>-.55;i++)g.playerStep(1/120);
  });
  await jump();const bars=new Set();let releasedSecond=false,landing=null;
  for(let i=0;i<360;i++){
   const s=await page.evaluate(()=>{
    const g=__game,c=g.P;
    for(let i=0;i<4;i++){
     if(window.northBrake&&!skySwing.active){g.keys.KeyW=false;g.keys.KeyS=c.vel.x<-.4&&c.pos.x+22.5<c.vel.x*c.vel.x/28+.2;}
     g.playerStep(1/120);
    }
    const a=skySwing.active;return{...northQA.state(),bar:a?.bar.id,angle:a?.angle,omega:a?.omega};
   });
   if(s.bar)bars.add(s.bar);
   if(s.bar&&s.angle>=.65&&s.omega>1.1){
    if(s.bar==='oldtown-north-corner-bar-2'){releasedSecond=true;await page.evaluate(()=>window.northBrake=true);}
    await jump();
   }
   if(bars.size&&s.ground){landing=s;break;}
  }
  assert.deepEqual([...bars],['oldtown-north-corner-bar','oldtown-north-corner-bar-2']);
  assert.ok(releasedSecond&&landing&&landing.p[0]<-20&&Math.abs(landing.p[1]-4.2)<.1,JSON.stringify({landing,releasedSecond}));
  record.swingLanding=landing;
  record.returnEnd=await page.evaluate(()=>{
   const g=__game,c=g.P;g.keys.KeyS=false;
   const points=skySwing.course.routes.find(r=>r.id==='north-corner').escape;
   for(const p of points){let done=false;
    for(let i=0;i<900;i++){
     const dx=p[0]-c.pos.x,dz=p[2]-c.pos.z;
     if(Math.hypot(dx,dz)<.18&&Math.abs(c.pos.y-p[1])<.3&&c.onGround){done=true;break;}
     c.yaw=Math.atan2(-dx,-dz);g.keys.KeyW=true;g.playerStep(1/120);
    }
    g.keys.KeyW=false;if(!done)throw Error('north return '+JSON.stringify(northQA.state()));for(let i=0;i<12;i++)g.playerStep(1/120);
   }
   northQA.render();return northQA.state();
  });
  assert.equal(record.returnEnd.life,3);assert.deepEqual(errors,[]);
  console.log('PASS north two-bar escape and standing return',touch?'touch':'desktop');await context.close();
 }
}finally{fs.mkdirSync('browser-evidence/north-wall',{recursive:true});fs.writeFileSync('browser-evidence/north-wall/results.json',JSON.stringify(results,null,2));await browser?.close();server?.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
