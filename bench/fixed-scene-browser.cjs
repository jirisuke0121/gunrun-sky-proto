const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
const out='browser-evidence/fixed-camera';
(async()=>{const b=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});const rows=[];try{
for(const map of ['index.html','canyon.html'])for(const occlusion of ['zoom','fade']){
 const ctx=await b.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,locale:'ja-JP'});
 await ctx.addInitScript(()=>window.__hold=true);await ctx.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0}'}));
 const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:8878/'+map+'?camera=after&cameraTrial=fixed&fixedOcclusion='+occlusion+'&controlpick=0&hookGuide=0&dev=1&lang=ja');
 await p.waitForFunction(()=>window.skyStartReadiness?.ready,null,{timeout:120000});await p.evaluate(()=>document.getElementById('bIntro').click());
 await p.evaluate(()=>{const g=__game;g.S.sendLog=g.S.autoFire=false;g.P.invuln=Infinity;g.GAME.spawnT=Infinity;g.SCR.off=g.PACE.off=g.MARK.off=true;g.STALK.spawned=true;for(const e of g.zombies){e.dead=true;e.remove=true}});
 const perf=await p.evaluate(()=>{
  const g=__game,c=g.P,r=g.debug.renderer,cam=g.debug.camera,s=__skyInternals;
  skySwing.reset();c.pos.set(0,8.01,0);c.vel.set(0,0,0);c.state='normal';c.onGround=true;c.yaw=c.pitch=0;skyFollowCamera.reset();g.frameOnce(0);
  // Equal camera/viewport/pose, not the collision-retreated zoom camera.
  // Draw calls are the useful structural comparison; timings are local only.
  cam.position.set(c.pos.x,c.pos.y+1.3+Math.sin(.65)*8,c.pos.z+Math.cos(.65)*8);skyFixedCamera.camera(cam);cam.updateMatrixWorld();
  const draws=[],times=[];for(let i=0;i<35;i++){r.clear();const t=performance.now();r.render(s.ue,cam);r.getContext().finish();if(i>=5){times.push(performance.now()-t);draws.push(r.info.render.calls)}}
  times.sort((a,b)=>a-b);return{viewport:[innerWidth,innerHeight],camera:cam.position.toArray(),calls:draws[0],callsStable:draws.every(x=>x===draws[0]),medianDrawAndFinishMs:times[15],faded:skyFixedCamera.fadedCount,gl:r.getContext().getError()};
 });assert.equal(perf.gl,0);assert.ok(perf.callsStable);
 let indoor=null;
 if(map==='index.html'){
  await p.evaluate(()=>{const g=__game,c=g.P;skySwing.reset();c.pos.set(-15.5,.01,0);c.lastGround.copy(c.pos);c.safe.copy(c.pos);c.vel.set(0,0,0);c.state='normal';c.onGround=true;c.h=1.75;c.ledge=c.ladder=c.zip=c.hook=c.doorAction=null;c.jumpBuf=c.slideBuf=0;skyFollowCamera.reset();g.frameOnce(0)});
  await p.keyboard.down('d');await p.evaluate(()=>{for(let i=0;i<84;i++)__game.advance(1/60)});await p.keyboard.up('d');
  const crossed=await p.evaluate(()=>{const g=__game;g.frameOnce(0);return{position:g.P.pos.toArray(),entered:g.INDOOR_ACCESS.snapshot()[2].entered,rotation:g.debug.camera.rotation.toArray().slice(0,3),faded:skyFixedCamera.fadedCount}});
  assert.ok(crossed.entered,'screen-right input crosses the west door into the actual room');assert.ok(Math.abs(crossed.rotation[1])<1e-7);
  await p.screenshot({path:out+'/indoor-'+occlusion+'.png'});
  const stopped=await p.evaluate(()=>{for(let i=0;i<60;i++)__game.advance(1/60);__game.frameOnce(0);return{speed:Math.hypot(__game.P.vel.x,__game.P.vel.z),position:__game.P.pos.toArray()}});assert.ok(stopped.speed<.05,'release settles on real floor');
  indoor={crossed,stopped};
 }
 assert.deepEqual(errors,[]);rows.push({map,occlusion,perf,indoor,errors});fs.writeFileSync(out+'/scene-results.json',JSON.stringify(rows,null,2));console.log('PASS',map,occlusion,JSON.stringify({perf,indoor}));await ctx.close();
}}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
