const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
const base=process.env.RUNNING_QA_URL||'http://127.0.0.1:8878/';
const out=process.env.FIXED_QA_OUT||'browser-evidence/fixed-camera';fs.mkdirSync(out,{recursive:true});
(async()=>{const b=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});const rows=[];try{
for(const map of ['index.html','canyon.html'])for(const startsPortrait of [false,true]){
 const ctx=await b.newContext({viewport:startsPortrait?{width:390,height:844}:{width:844,height:390},isMobile:true,hasTouch:true,locale:'ja-JP'});
 await ctx.addInitScript(()=>{window.__hold=true});
 await ctx.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0}'}));
 const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base+map+'?camera=after&cameraTrial=fixed&controlpick=0&hookGuide=0&dev=1');
 await p.waitForFunction(()=>window.skyStartReadiness?.ready&&window.skyFixedCamera,null,{timeout:120000});
 // This game supports landscape only. Verify the portrait guard, then the
 // supported transition into landscape rather than forcing past that guard.
 if(startsPortrait){await p.locator('#rotate').waitFor({state:'visible'});await p.setViewportSize({width:844,height:390});await p.locator('#rotate').waitFor({state:'hidden'})}
 await p.evaluate(()=>document.getElementById('bIntro').click());
 await p.evaluate(()=>{const g=__game,c=g.P;g.S.sendLog=g.S.autoFire=false;c.invuln=Infinity;for(const z of g.zombies){z.dead=true;z.remove=true}g.GAME.spawnT=Infinity;
 window.fixedTick=n=>{for(let i=0;i<n;i++){c.onGround=false;c.pos.y=200;c.vel.y=0;g.playerStep(1/120);g.cam(1/120)}c.pos.y=200;g.frameOnce(0)};
 window.fixedReset=()=>{skySwing.reset();c.pos.set(0,200,0);c.vel.set(0,0,0);c.onGround=false;c.state='normal';c.yaw=.9;c.pitch=.2;skyFollowCamera.reset()};});
 const cdp=await ctx.newCDPSession(p),send=(type,touchPoints)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints});
 const point=(x,y,id=1)=>p.evaluate(({x,y,id})=>{const r=+document.documentElement.dataset.skyRotation||0;return{id,x:r>0?innerWidth-y:r<0?y:x,y:r>0?x:r<0?innerHeight-x:y}},{x,y,id});
 const snap=()=>p.evaluate(()=>{skyMinimap.frame(performance.now(),true);const m=skyMinimap.snapshot();return{pos:__game.P.pos.toArray(),input:{...__skyInternals.inputState},rotation:__game.debug.camera.rotation.toArray().slice(0,3),map:{headingUp:m.headingUp,playerYaw:m.playerLocal?.yaw,worldYaw:__game.P.yaw}}});
 const inputs=[];
 for(const [x,f]of [[0,1],[1,1],[1,0],[1,-1],[0,-1],[-1,-1],[-1,0],[-1,1]]){
  await p.evaluate(()=>fixedReset());const m=Math.hypot(x,f),a=await point(110,240),end=await point(110+x/m*56,240-f/m*56);
  await send('touchStart',[a]);await send('touchMove',[end]);await p.waitForFunction(({x,f})=>Math.abs(__skyInternals.inputState.x-x)<.01&&Math.abs(__skyInternals.inputState.y+f)<.01,{x:x/m,f:f/m});
  await p.evaluate(()=>fixedTick(60));const s=await snap();assert.ok(Math.hypot(s.pos[0],s.pos[2])>1);assert.ok(Math.abs(s.pos[0]*f+s.pos[2]*x)<.001);assert.ok(s.pos[0]*x-s.pos[2]*f>0);assert.ok(Math.abs(s.rotation[1])<1e-7&&Math.abs(s.rotation[2])<1e-7);
  assert.equal(s.map.headingUp,false);assert.ok(Math.abs(s.map.playerYaw-s.map.worldYaw)<1e-7,'radar arrow keeps screen-relative heading');
  inputs.push({direction:[x,f],...s});await send('touchEnd',[]);await p.waitForFunction(()=>!__skyInternals.inputState.on);
 }
 // Keep the left thumb down: changing its direction does not need a reset,
 // and a second-finger swipe cannot rotate the camera or reinterpret input.
 await p.evaluate(()=>fixedReset());const a=await point(110,240),right=await point(166,240),up=await point(110,184),r=await point(610,160,2),r2=await point(680,210,2);
 await send('touchStart',[a]);await send('touchMove',[right]);await p.waitForFunction(()=>__skyInternals.inputState.x>.99);await p.evaluate(()=>fixedTick(20));
 await send('touchMove',[up]);await p.waitForFunction(()=>__skyInternals.inputState.y<-.99);await p.evaluate(()=>fixedTick(120));const before=await snap();
 await send('touchStart',[up,r]);await send('touchMove',[up,r2]);await p.waitForFunction(()=>__skyInternals.inputState.lookId!==null);await p.evaluate(()=>fixedTick(30));const peek=await snap();assert.deepEqual(peek.rotation,before.rotation);
 await send('touchCancel',[]);await p.waitForFunction(()=>!__skyInternals.inputState.on);const cancelled=await snap();assert.equal(cancelled.input.x,0);assert.equal(cancelled.input.y,0);
 // Actual map floor and native Jump button; the collision data must stay intact.
 const ground=await p.evaluate(()=>{const g=__game,c=g.P;const n=g.NAV.nodes.find(n=>g.freeAt(n.x,n.y+.03,n.z,.3,1.75));c.pos.set(n.x,n.y+.01,n.z);c.lastGround.copy(c.pos);c.vel.set(0,0,0);c.state='normal';c.onGround=true;c.jumpBuf=0;skyFollowCamera.reset();g.frameOnce(0);window.fixedBoxes=g.solids.map(b=>[b.minX,b.minY,b.minZ,b.maxX,b.maxY,b.maxZ,b.off]);return{y:c.pos.y,jumps:g.stats.jumps};});
 await p.locator('#tJump').tap();await p.evaluate(()=>__game.frameOnce(1/30));const jump=await p.evaluate(()=>({y:__game.P.pos.y,jumps:__game.stats.jumps,rotation:__game.debug.camera.rotation.toArray().slice(0,3),boxesMatch:JSON.stringify(fixedBoxes)===JSON.stringify(__game.solids.map(b=>[b.minX,b.minY,b.minZ,b.maxX,b.maxY,b.maxZ,b.off]))}));
 assert.ok(jump.y>ground.y&&jump.jumps>ground.jumps,'native jump accepted');assert.ok(jump.boxesMatch,'fade cannot alter collision boxes');assert.ok(Math.abs(jump.rotation[1])<1e-7&&Math.abs(jump.rotation[2])<1e-7);
 await p.evaluate(()=>{skyFollowCamera.setMode('before',false);skyHumanView.update(0)});assert.equal(await p.evaluate(()=>skyFixedCamera.fadedCount),0,'switching away restores materials');
 assert.deepEqual(errors,[]);rows.push({map,startsPortrait,inputs,before,peek,cancelled,ground,jump,errors});fs.writeFileSync(out+'/input-results.json',JSON.stringify(rows,null,2));console.log('PASS',map,startsPortrait?'portrait-to-landscape':'landscape','actual touch 8 directions, continuous change, no right look, cancellation, native jump, collision preservation, restore');await ctx.close();
}}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
