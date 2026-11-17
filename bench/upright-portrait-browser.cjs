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
  await context.close();console.log('PASS',map,'portrait startup, upright frame, guided highlight and real drag');
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
