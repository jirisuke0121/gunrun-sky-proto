// Cosmetic A+B coverage with real assets, renderer and immediate action exits.
const fs=require('node:fs'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {chromium}=require('playwright');
const base=process.env.RUNNING_QA_URL||'http://127.0.0.1:8782/';
(async()=>{let browser,server;const results=[];fs.mkdirSync('browser-evidence/landing-release',{recursive:true});
try{
 if(!process.env.RUNNING_QA_URL){server=spawn('python3',['-m','http.server','8782','--bind','127.0.0.1'],{stdio:'ignore'});for(let i=0;i<50;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100));}}
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const touch of [false,true])for(const map of ['index.html','canyon.html']){
  const id=`${touch?'touch':'desktop'}-${map.split('.')[0]}`,errors=[];
  const ctx=await browser.newContext({viewport:touch?{width:844,height:390}:{width:1280,height:720},hasTouch:touch,isMobile:touch});
  await ctx.addInitScript(()=>window.__hold=true);await ctx.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0,"ok":true}'}));
  const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base+map);await p.waitForFunction(()=>window.skyHumanView&&document.body.dataset.skyHumanLoaded==='true');await p.locator('#bStart').click();
  await p.evaluate(()=>{
   const s=__skyInternals,g=__game,c=s.c,T=s.Geom;g.S.sendLog=false;g.S.gunOn=false;g.GAME.over=false;c.invuln=Infinity;
   const floor=new T.Mesh(new T.Box(20,.1,20),new T.Standard({color:0x576976}));floor.position.set(0,199.93,0);s.ue.add(floor);
   const state=()=>JSON.stringify({p:c.pos.toArray(),v:c.vel.toArray(),yaw:c.yaw,state:c.state,ground:c.onGround});
   window.motionPhysical=state;
   window.motionFrame=(dt=1/60)=>{
    const before=state();g.cam(dt);skyHumanView.update(dt);if(before!==state())throw Error('cosmetic frame altered player physics');
    // A close side view is an inspection camera; production camera is exercised by the other suites.
    s.Se.position.copy(c.pos).add(new T.Vector3(3.3,1.45,3.8));s.Se.lookAt(c.pos.x,c.pos.y+.9,c.pos.z);s.Se.updateMatrixWorld(true);
    g.debug.renderer.clear();g.debug.renderer.render(s.ue,s.Se);
   };
   window.motionSetup=()=>{skySwing.reset();skyLandingRoll.reset();c.pos.set(0,200,0);c.vel.set(0,0,0);c.onGround=true;c.state='normal';c.h=1.75;c.eye=1.62;c.camY=201.62;c.yaw=0;c.pitch=0;for(let i=0;i<30;i++)motionFrame();};
   window.motionLand=()=>{motionSetup();c.onGround=false;c.vel.y=-5;for(let i=0;i<24;i++)motionFrame();c.onGround=true;c.vel.y=0;motionFrame();};
  });
  await p.evaluate(()=>motionLand());
  await p.screenshot({path:`browser-evidence/landing-release/${id}-touchdown.png`});
  await p.evaluate(()=>{for(let i=0;i<4;i++)motionFrame();});
  const compression=await p.evaluate(()=>({clip:document.body.dataset.skyHumanClip,phase:+document.body.dataset.skyHumanLandingPhase,gl:__game.debug.renderer.getContext().getError()}));
  assert.equal(compression.clip,'landing');assert.ok(compression.phase>.2&&compression.phase<.5);assert.equal(compression.gl,0);
  await p.screenshot({path:`browser-evidence/landing-release/${id}-compress.png`});
  await p.evaluate(()=>{const c=__game.P;c.vel.set(0,0,-6);for(let i=0;i<18;i++){c.pos.addScaledVector(c.vel,1/60);motionFrame();}});
  assert.equal(await p.evaluate(()=>document.body.dataset.skyHumanClip),'runForward');
  await p.screenshot({path:`browser-evidence/landing-release/${id}-stride.png`});
  await p.evaluate(()=>{motionLand();__game.P.onGround=false;__game.P.vel.y=7.2;motionFrame();});
  assert.equal(await p.evaluate(()=>document.body.dataset.skyHumanClip),'jump','the next jump immediately interrupts recovery');
  for(const age of [0,.12,.24,.4]){
   const accent=await p.evaluate(age=>{motionSetup();const c=__game.P;c.onGround=false;c.vel.set(0,4,-8);c.swingFlight={age,angle:.7,direction:[0,-1]};motionFrame();return{accent:+document.body.dataset.skyHumanReleaseAccent,clip:document.body.dataset.skyHumanClip,gl:__game.debug.renderer.getContext().getError()};},age);
   assert.equal(accent.clip,'swingFlight');assert.equal(accent.gl,0);if(age===.12)assert.ok(accent.accent>.9);if(age===.4)assert.equal(accent.accent,0);
   await p.screenshot({path:`browser-evidence/landing-release/${id}-release-${age}.png`});
  }
  // A new grip takes over without retaining the release twist.
  const regrip=await p.evaluate(()=>{const c=__game.P;c.state='swing';c.swing={angle:-.6,direction:[0,-1],pivot:[c.pos.x,c.pos.y+2,c.pos.z]};c.swingFlight=null;motionFrame();return{error:+document.body.dataset.skyHumanHandError,accent:+document.body.dataset.skyHumanReleaseAccent};});
  assert.ok(regrip.error<.002&&regrip.accent===0,JSON.stringify(regrip));
  let realJump=null;
  if(map==='canyon.html'){
   await p.evaluate(()=>{
    const g=__game,c=g.P,s=__skyInternals;g.keys.KeyW=false;skySwing.reset();skyLandingRoll.reset();
    const at=[[10,0,5],[6,0,5],[-6,0,5]].find(([x,y,z])=>s.oe(x,y+.03,z,c.r,3.5));
    if(!at)throw Error('no clear canyon takeoff');g.placeAt({x:at[0],y:at[1],z:at[2],yaw:0});
    c.pos.y=.0001;c.onGround=true;c.state='normal';c.vel.set(0,0,0);c.jumpBuf=0;c.coyote=.15;c.invuln=Infinity;g.S.gunOn=false;
    window.realMotionTick=()=>{g.playerStep(1/120);g.cam(1/120);skyHumanView.update(1/120);};
    for(let i=0;i<30;i++)realMotionTick();
   });
   if(touch)await p.locator('#tJump').tap();else await p.keyboard.press('Space');
   realJump=await p.evaluate(()=>{const c=__game.P,start=c.pos.y;let peak=start,air=false,ticks=0;
    for(;ticks<180;ticks++){realMotionTick();peak=Math.max(peak,c.pos.y);if(!c.onGround)air=true;if(air&&c.onGround)break;}
    return{air,rise:peak-start,ticks,clip:document.body.dataset.skyHumanClip};});
   assert.ok(realJump.air&&realJump.rise>1.2&&realJump.rise<1.35&&realJump.ticks<100,JSON.stringify(realJump));
   assert.equal(realJump.clip,'landing');
   if(touch)await p.locator('#tJump').tap();else await p.keyboard.press('Space');
   const repeat=await p.evaluate(()=>{realMotionTick();return{up:__game.P.vel.y,clip:document.body.dataset.skyHumanClip};});
   assert.ok(repeat.up>6&&repeat.clip==='jump','real next jump input is accepted during visual recovery');
  }
  assert.deepEqual(errors,[]);results.push({id,compression,regrip,realJump});console.log(`PASS ${id}: touchdown/compression/stride, immediate jump, visual release turn/reach/regrip, no physics mutations, WebGL`);
  await ctx.close();
 }
}finally{fs.writeFileSync('browser-evidence/landing-release/results.json',JSON.stringify(results,null,2));await browser?.close();server?.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
