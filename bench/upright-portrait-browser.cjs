// Actual portrait startup and guided highlight alignment inside the fitted frame.
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
const base=process.env.VIEWPORT_URL||'http://127.0.0.1:8894/';
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});try{
 fs.mkdirSync('evidence',{recursive:true});
 for(const map of ['index.html','canyon.html']){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'ja-JP'});
  await context.addInitScript(()=>window.__hold=true);
  await context.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"top":[],"total":0}'}));
  const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base+map+'?guidedEntry=1&lang=ja');
  await p.waitForFunction(()=>window.skyGuidedIntro?.choice==='choose'&&__game.mode==='play',null,{timeout:120000});
  const app=await p.locator('#app').boundingBox();assert.ok(app.width>app.height&&app.y>0&&app.x>=0&&app.x+app.width<=390.1);
  await p.locator('[data-learn-adopt="after"]').tap();await p.evaluate(()=>__game.advance(0));
  await p.waitForFunction(()=>skyGuidedIntro.blocked&&skyGuidedIntro.pausedTarget==='stick');
  const stick=await p.locator('#stick').boundingBox(),ring=await p.locator('#learnSpotlight').boundingBox();
  assert.ok(Math.abs(stick.x+stick.width/2-ring.x-ring.width/2)<1,'highlight remains centred on the real stick');
  assert.ok(Math.abs(stick.y+stick.height/2-ring.y-ring.height/2)<1,'highlight has the same vertical centre');
  assert.ok(ring.width>stick.width&&ring.width-stick.width<8,'highlight padding is scaled once');
  const cdp=await context.newCDPSession(p),v=await p.evaluate(()=>skyViewport.snapshot());
  const point=(x,y)=>({x:v.contentLeft+x*v.scale,y:v.contentTop+y*v.scale,id:1});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(75,325)]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(75,270)]});
  await p.evaluate(()=>{for(let i=0;i<4;i++)__game.advance(1/60)});
  assert.equal(await p.evaluate(()=>skyGuidedIntro.blocked),false,'a real drag resumes the portrait lesson');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.equal(await p.evaluate(()=>document.documentElement.dataset.skyRotation),'0');
  assert.doesNotMatch(await p.evaluate(()=>document.body.style.transform),/rotate/);
  assert.deepEqual(errors,[]);await p.screenshot({path:'evidence/'+map+'-portrait-intro.png'});
  // The main canvas supplies logical coordinates to barrel taps as well.
  await p.goto(base+map);await p.waitForFunction(()=>window.skyStartReadiness?.ready,null,{timeout:120000});await p.locator('#bStart').tap();
  const mark=await p.evaluate(()=>{
   const g=__game,c=g.P,B=skyBlastBarrels,I=__skyInternals;
   g.S.sendLog=g.S.gunOn=g.S.autoFire=false;g.SCR.off=g.PACE.off=g.MARK.off=true;g.GAME.spawnT=g.GAME.surgeT=1e9;
   for(const enemy of g.zombies){enemy.dead=true;enemy.remove=true;}
   for(const barrel of B.barrels)for(const [ox,oz]of [[-4,0],[4,0],[0,4],[0,-4],[-3,-3],[3,3]]){
    B.reset();c.pos.set(barrel.x+ox,barrel.y||0,barrel.z+oz);c.vel.set(0,0,0);c.state='normal';c.onGround=true;
    c.yaw=Math.atan2(-(barrel.x-c.pos.x),-(barrel.z-c.pos.z));c.pitch=-.1;skyFollowCamera.reset();
    for(let i=0;i<20;i++){g.advance(1/60);g.cam(1/60);}
    const a=B.assistTarget();if(a?.barrel===barrel&&a.sx>150&&a.sx<__VW()-100&&a.sy>65&&a.sy<__VH()-100)return {x:a.sx,y:a.sy,v:skyViewport.snapshot()};
   }return null;
  });
  assert.ok(mark,'a visible barrel tap target is available');
  await p.touchscreen.tap(mark.v.contentLeft+mark.x*mark.v.scale,mark.v.contentTop+mark.y*mark.v.scale);
  assert.ok(await p.evaluate(()=>!!skyBlastBarrels.sequence),'the physical portrait tap starts the actual barrel action');
  assert.deepEqual(errors,[]);
  await context.close();console.log('PASS',map,'portrait startup, upright frame, guided highlight, real drag and barrel tap');
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
