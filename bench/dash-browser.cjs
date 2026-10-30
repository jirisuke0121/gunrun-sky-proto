const assert=require('node:assert/strict'),fs=require('node:fs'),{spawn}=require('node:child_process');
const {chromium}=require('playwright');
const base=process.env.RUNNING_QA_URL||'http://127.0.0.1:8773/';
fs.mkdirSync('browser-evidence',{recursive:true});
(async()=>{
 let server,browser;const results=[];
 try{
  if(!process.env.RUNNING_QA_URL){server=spawn('python3',['-m','http.server','8773','--bind','127.0.0.1'],{stdio:'ignore'});for(let i=0;i<100;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100));}}
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:process.platform==='darwin'?['--no-sandbox']:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  for(const touch of [false,true])for(const map of ['index.html','canyon.html']){
   const id=`dash-${touch?'touch':'desktop'}-${map.split('.')[0]}`;
   const context=await browser.newContext({viewport:touch?{width:844,height:390}:{width:1280,height:720},hasTouch:touch,isMobile:touch,deviceScaleFactor:1});
   await context.addInitScript(()=>{window.__hold=true;});
   await context.route('**/*',route=>{const url=route.request().url();if(new URL(url).hostname==='gunrun-runs.jirisuke0121.workers.dev')return route.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0,"me":null,"ok":true}'});if(new URL(url).pathname==='/favicon.ico')return route.fulfill({status:204,body:''});return url.startsWith(base)||/^(blob|data):/.test(url)?route.continue():route.abort();});
   const page=await context.newPage(),errors=[];page.setDefaultTimeout(60000);
   page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
   const capture=name=>page.screenshot({path:`browser-evidence/${id}-${name}.png`});
   try{
    await page.goto(new URL(map,base).href);await page.waitForFunction(()=>window.__game&&window.skyDash&&window.skyHumanView);
    if(await page.locator('#humanSel [data-human="unity"]').count()) await page.locator('#humanSel [data-human="unity"]').click();await page.waitForFunction(()=>window.skyHumanView.choice==='unity'&&document.body.dataset.skyHumanLoaded==='true');await page.locator('#bStart').click();
    const placements=await page.evaluate(()=>{
     const g=window.__game,sky=window.__skyInternals,c=g.P;g.S.sendLog=false;g.S.autoSprint=true;c.invuln=1e9;
     // This measures sprint/boost FOV. Autonomous combat deliberately narrows
     // that FOV while firing, so keep combat out of this movement-only scene.
     g.S.autoFire=false;g.S.aimAuto=false;g.S.aimAssist=false;
     g.SCR.off=g.PACE.off=g.MARK.off=true;g.GAME.spawnT=g.GAME.surgeT=1e9;
     for(const z of sky.Jt){z.dead=true;z.m.root.visible=false;}
     g.frameOnce(1/60);
     const placements=window.skyDash.pickups;
     const graph=g.NAV, goal=placements[0].nodeId,start=g.nodeAt(c.pos.x,c.pos.y+.1,c.pos.z);
     const parent=new Map([[start,-1]]),queue=[start];
     for(let i=0;i<queue.length&&!parent.has(goal);i++)for(const id of graph.out[queue[i]]){const e=graph.E[id];if(e.kind===0&&!parent.has(e.to)){parent.set(e.to,queue[i]);queue.push(e.to);}}
     if(!parent.has(goal))throw Error('First pickup is unreachable from spawn');
     const path=[];for(let n=goal;n>=0;n=parent.get(n))path.unshift(graph.nodes[n]);
     window.__dashPath={path,index:1};
     window.__dashFollow=()=>{
      const state=window.__dashPath;
      while(state.index<state.path.length-1&&Math.hypot(c.pos.x-state.path[state.index].x,c.pos.z-state.path[state.index].z)<.38)state.index++;
      const target=state.path[Math.min(state.index,state.path.length-1)];
      c.yaw=Math.atan2(-(target.x-c.pos.x),-(target.z-c.pos.z));c.pitch=-.12;
      g.advance(1/60);g.cam(1/60);window.skyHumanView.update(1/60);
      return{collected:g.stats.dashPickups||0,speed:Math.hypot(c.vel.x,c.vel.z),...JSON.parse(document.body.dataset.skyDash)};
     };
     window.__dashFrames=count=>{for(let i=0;i<count;i++){g.advance(1/60);g.cam(1/60);window.skyHumanView.update(1/60);}g.frameOnce(0);return window.__dashState();};
     window.__dashState=()=>({ ...JSON.parse(document.body.dataset.skyDash),speed:Math.hypot(c.vel.x,c.vel.z),fov:g.debug.camera.fov,clip:document.body.dataset.skyHumanRunClip,gl:g.debug.renderer.getContext().getError(),clearance:+document.body.dataset.skyHumanCameraClearance });
     return placements.map(i=>({...i,clear:sky.oe(i.position[0],i.position[1]+.05,i.position[2],.3,1.8)}));
    });
    assert.ok(placements.length>=2&&placements.every(p=>p.clear),JSON.stringify(placements));
    await page.keyboard.down('w');
    let collected=false,baseline=0;
    for(let i=0;i<400;i++){
     const state=await page.evaluate(()=>window.__dashFollow());baseline=Math.max(baseline,state.speed);
     if(state.collected){collected=true;break;}
    }
    assert.ok(collected,'actual keyboard movement and collision collect the placed ring');
    await page.keyboard.up('w');await page.evaluate(()=>window.__game.frameOnce(0));await capture('pickup');
    // Find a real, flat map corridor for an uncontaminated speed measurement.
    const lane=await page.evaluate(()=>{
     const g=window.__game,c=g.P,sky=window.__skyInternals;
     const nodes=[...g.NAV.nodes].sort((a,b)=>Math.hypot(a.x-c.pos.x,a.z-c.pos.z)-Math.hypot(b.x-c.pos.x,b.z-c.pos.z));
     for(const n of nodes)for(const [dx,dz]of[[0,-1],[1,0],[0,1],[-1,0]]){
      const length=window.SKY_CANYON_MAP?13:20;
      const nearby=window.skyDash.pickups.some(item=>{const p=item.position,t=Math.max(0,Math.min(length,(p[0]-n.x)*dx+(p[2]-n.z)*dz));return Math.hypot(p[0]-n.x-dx*t,p[1]-n.y+.15,p[2]-n.z-dz*t)<1.2;});
      if(nearby)continue;
      const route=g.wp(n,n.x+dx*length,n.z+dz*length,n.y);
      if(!route||route.climb>.05||route.drop>.05||!sky.oe(n.x,n.y+.05,n.z,.3,1.8))continue;
      // A planner route can detour around a hole. The speed probe itself
      // goes straight, so require a continuous, full-height walking lane.
      const floors=g.solids.filter(s=>s.solid&&!s.off&&s.type!=='mono'&&Math.abs(s.maxY-n.y)<.05);
      const supported=(x,z)=>floors.some(s=>x>s.minX+.02&&x<s.maxX-.02&&z>s.minZ+.02&&z<s.maxZ-.02);
      let clear=true;
      for(let d=0;d<=length;d+=.2){
       const x=n.x+dx*d,z=n.z+dz*d;
       if(!sky.oe(x,n.y+.03,z,c.r,1.8)||![0,-.2,.2].every(side=>supported(x-dz*side,z+dx*side))){clear=false;break;}
      }
      if(!clear)continue;
      window.__dashPlaceLane=l=>{
       c.pos.set(l.x,l.y+.01,l.z);c.vel.set(0,0,0);c.state='normal';c.onGround=true;c.h=1.75;
       c.ledge=c.ladder=c.zip=c.hook=null;c.jumpBuf=c.slideBuf=c.slideT=0;c.crouchPressed=false;c.edgeJump=false;c.edgeOff=null;
       c.yaw=Math.atan2(-l.dx,-l.dz);c.pitch=-.12;c.camY=undefined;c.invuln=1e9;
       c.lastGround.copy(c.pos);c.safe?.copy(c.pos);window.skySwing?.reset();window.skyLandingRoll?.reset();window.skyFollowCamera?.reset();
      };
      const lane={x:n.x,y:n.y,z:n.z,dx,dz};window.__dashPlaceLane(lane);return lane;
     }throw Error('No real flat corridor for boost verification');
    });
    await page.keyboard.down('w');
    const running=await page.evaluate(()=>window.__dashFrames(35));
    assert.ok(Math.abs(running.speed-7.8)<.05,JSON.stringify(running));
    assert.match(await page.locator('#dashStatus').innerText(),/速度 \+30% ↑/);
    assert.equal(running.clip,'parkourDash');assert.ok(running.distance>4.05&&running.fov>106,JSON.stringify(running));assert.equal(running.gl,0);
    await capture('boost');
    if(!touch&&map==='index.html'){
     fs.mkdirSync('browser-evidence/dash-motion',{recursive:true});
     for(let i=0;i<36;i++){
      await page.evaluate(()=>window.__game.frameOnce(1/30));
      await page.screenshot({path:`browser-evidence/dash-motion/${String(i).padStart(3,'0')}.png`});
     }
    }
    await page.keyboard.up('w');
    const paused=await page.evaluate(()=>{window.__game.setMode('pause');const t=window.skyDash.remaining;window.__dashFrames(30);return{before:t,after:window.skyDash.remaining};});
    assert.equal(paused.after,paused.before,'pause freezes boost duration');
    await page.evaluate(()=>{window.__game.setMode('play');window.__game.P.vel.set(0,0,0);window.__dashFrames(420);});
    const ended=await page.evaluate(()=>window.__dashState());assert.equal(ended.remaining,0);assert.equal(ended.boost,0);assert.ok(ended.fov<105,JSON.stringify(ended));assert.equal(ended.gl,0);
    await capture('ended');
    // The same lane returns to the configured sprint speed after expiry.
    await page.evaluate(l=>window.__dashPlaceLane(l),lane);
    await page.keyboard.down('w');
    const normal=await page.evaluate(()=>window.__dashFrames(35));await page.keyboard.up('w');
    assert.ok(Math.abs(normal.speed-6)<.05&&normal.fov>98&&normal.distance>3.8,JSON.stringify(normal));await capture('sprint');
    await page.evaluate(l=>{window.__dashPlaceLane(l);window.skyDash.rewardSwing();},lane);
    await page.keyboard.down('w');const swing=await page.evaluate(()=>window.__dashFrames(35));await page.keyboard.up('w');
    assert.ok(Math.abs(swing.speed-6.48)<.05&&swing.swingRemaining>3,JSON.stringify(swing));
    assert.match(await page.locator('#dashStatus').innerText(),/速度 \+8% ↑/);await capture('swing-reward');
    await page.evaluate(l=>__dashPlaceLane(l),lane);await page.keyboard.down('Shift');await page.keyboard.down('w');
    const swingWalk=await page.evaluate(()=>__dashFrames(35));await page.keyboard.up('w');await page.keyboard.up('Shift');
    assert.ok(Math.abs(swingWalk.speed-4.968)<.05,JSON.stringify(swingWalk));
    const refresh=await page.evaluate(()=>{skyDash.rewardSwing();return{remaining:skyDash.swingRemaining,speed:skyDash.speed(6)};});
    assert.equal(refresh.remaining,4);assert.equal(refresh.speed,6.48);
    const pauseSwing=await page.evaluate(()=>{__game.setMode('pause');const before=skyDash.swingRemaining;__dashFrames(30);const after=skyDash.swingRemaining;__game.setMode('play');return{before,after};});
    assert.equal(pauseSwing.before,pauseSwing.after);
    await page.evaluate(()=>{__game.P.vel.set(0,0,0);__dashFrames(250);});
    assert.equal(await page.evaluate(()=>skyDash.swingRemaining),0);assert.ok(await page.locator('#dashStatus').isVisible());assert.equal(await page.locator('#dashStatus').innerText(),'速度 +0%');
    await page.evaluate(l=>__dashPlaceLane(l),lane);await page.keyboard.down('w');
    const afterSwing=await page.evaluate(()=>__dashFrames(35));await page.keyboard.up('w');assert.ok(Math.abs(afterSwing.speed-6)<.05);
    await page.keyboard.press('v');await page.evaluate(()=>window.__game.frameOnce(1/60));assert.equal(await page.evaluate(()=>document.body.dataset.skyHumanView),'first');
    await page.evaluate(()=>window.__game.startGame());
    assert.equal(await page.evaluate(()=>window.skyDash.remaining),0);assert.ok(await page.evaluate(()=>window.skyDash.pickups.every(p=>p.cooldown===0)));
    assert.deepEqual(errors,[]);results.push({id,placements,lane,baseline,boost:running,normal,swing,swingWalk,refresh,pauseSwing,afterSwing,paused,ended,status:'passed'});
    console.log(`PASS ${id}: connected real-map pickups, keyboard collection, ${running.speed.toFixed(2)}m/s boost → ${normal.speed.toFixed(2)}m/s normal, camera/FOV, dash morph, expiry/pause/reset, first person, WebGL`);
   }catch(e){await capture('failure').catch(()=>{});results.push({id,status:'failed',error:e.message,errors});throw e;}finally{await context.close();}
  }
 }finally{fs.writeFileSync('browser-evidence/dash-results.json',JSON.stringify(results,null,2));await browser?.close();server?.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
