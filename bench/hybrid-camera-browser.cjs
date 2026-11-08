const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'browser-evidence/hybrid-camera');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.gz':'application/gzip','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.wav':'audio/wav','.mp3':'audio/mpeg'};
const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))throw Error('path');res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(await fs.promises.readFile(file));}catch{res.writeHead(404);res.end();}});
(async()=>{fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;const rows=[];
try{browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--enable-unsafe-swiftshader']});
for(const touch of[false,true])for(const map of['index.html','canyon.html']){
 const ctx=await browser.newContext({viewport:touch?{width:844,height:390}:{width:1280,height:591},isMobile:touch,hasTouch:touch,locale:'ja-JP'});await ctx.addInitScript(()=>window.__hold=true);await ctx.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0}'}));
 const p=await ctx.newPage(),errors=[],warnings=[];p.setDefaultTimeout(90000);p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')(m.text().startsWith('Ignored attempt to cancel a touchmove event')?warnings:errors).push(m.text())});
 await p.goto(`http://127.0.0.1:${server.address().port}/${map}?camera=after&cameraTrial=hybrid&cameraControl=legacy&onboarding=0&controlpick=0&hookGuide=0&dev=1&lang=ja`);
 await p.waitForFunction(map=>window.skyStartReadiness?.ready&&(map==='canyon.html'||window.skyLookInfo),map,{timeout:90000});await p.locator('#bStart').click();
 await p.evaluate(()=>{const g=__game;g.S.sendLog=g.S.autoFire=false;g.P.invuln=Infinity;g.GAME.spawnT=g.GAME.surgeT=Infinity;g.SCR.off=g.PACE.off=g.MARK.off=true;g.zombies.forEach(e=>{__skyInternals.ue.remove(e.m.root);if(e.pool)__skyInternals.ue.remove(e.pool)});g.zombies.length=0;
 window.placeHybrid=at=>{const c=g.P;skySwing.reset();c.pos.set(...at);c.lastGround.copy(c.pos);c.safe.copy(c.pos);c.vel.set(0,0,0);c.state='normal';c.onGround=true;c.h=1.75;c.yaw=c.pitch=c.shake=0;c.ledge=c.ladder=c.hook=c.zip=c.doorAction=null;c.jumpBuf=c.slideBuf=0;skyFollowCamera.reset();g.frameOnce(0)};
 window.snapHybrid=()=>{const c=g.P,cam=g.debug.camera;return{input:{...__skyInternals.inputState},pos:c.pos.toArray(),velocity:c.vel.toArray(),yaw:c.yaw,state:c.state,ground:c.onGround,camera:cam.position.toArray(),rotation:cam.rotation.toArray().slice(0,3),...skyFixedCamera.hybridState,safe:skyFixedCamera.cameraSafe(cam.position),hidden:document.body.dataset.skyOpaqueFootHidden,outline:document.body.dataset.skyHumanOccluded,gl:g.debug.renderer.getContext().getError()}};
 // Check real physics, input and camera at 60Hz; paint at 10Hz. Queueing
 // hundreds of full renders without yielding can starve screenshots on the
 // software GPU in CI. This changes the harness, not the shipped frame loop.
 window.tickHybrid=n=>{const a=[];for(let i=0;i<n;i++){g.advance(1/60);g.cam(1/60);skyHumanView.update(1/60);
   if(i%6===0||i===n-1){g.debug.renderer.clear();g.debug.renderer.render(__skyInternals.ue,g.debug.camera)}a.push(snapHybrid())}return a};
 });
 const label=`${touch?'touch':'desktop'}-${map.split('.')[0]}`,snapshots=[];
 const scenes=map==='index.html'?(await import('./hybrid-camera-scenes.js')).HYBRID_CAMERA_SCENES:[{id:'crossing',at:[2,.001,0]},{id:'middle',at:[0,4.001,0]},{id:'upper',at:[0,8.001,0]}];
 for(const scene of scenes){await p.evaluate(at=>placeHybrid(at),scene.at);const snap=await p.evaluate(()=>snapHybrid());assert.equal(snap.safe,true,scene.id+' safe');assert.equal(snap.gl,0);assert.equal(snap.hidden,'false',scene.id+' feet and body visible');assert.ok(snap.rotation[0]>=-.66,'no top-down escape');await p.screenshot({path:path.join(out,label+'-'+scene.id+'.png')});snapshots.push({id:scene.id,...snap});}
 const cdp=touch?await ctx.newCDPSession(p):null;
 let held=false,touchAt;
 async function input(x,f){if(touch){if(!held){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:110,y:240}]});held=true;}touchAt={id:1,x:110+x*56,y:240-f*56};await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[touchAt]});await p.waitForFunction(({x,f})=>__skyInternals.inputState.on&&Math.abs(__skyInternals.inputState.x-x)<.01&&Math.abs(__skyInternals.inputState.y+f)<.01,{x,f});}
 else{for(const key of['w','a','s','d'])await p.keyboard.up(key);if(x)await p.keyboard.down(x>0?'d':'a');if(f)await p.keyboard.down(f>0?'w':'s');}}
 async function release(){if(touch){if(held)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});held=false;}else for(const key of['w','a','s','d'])await p.keyboard.up(key);await p.evaluate(()=>__game.frameOnce(1/60));}
 const routes=[];
 if(map==='index.html'){
  // A single held gesture, then an intentional turn and a jump. The real
  // physics/doors remain active; no teleport/reset occurs within the route.
  for(const route of[{id:'north',at:[-12,4.001,-12],segments:[[1,0,220],[-1,0,220]]},{id:'west-door',at:[-15.5,.001,0],segments:[[1,0,65],[0,1,80],[0,-1,80],[-1,0,90]]}]){
   await release();await p.evaluate(at=>placeHybrid(at),route.at);const start=await p.evaluate(()=>snapHybrid()),samples=[];
   for(let i=0;i<route.segments.length;i++){const[x,f,n]=route.segments[i];await input(x,f);if(i===1){if(touch){const r=await p.locator('#tJump').boundingBox(),jump={id:2,x:r.x+r.width/2,y:r.y+r.height/2};await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touchAt,jump]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[jump]});assert.equal(await p.evaluate(()=>__skyInternals.inputState.on),true,'jump does not release left thumb');}else await p.keyboard.press('Space');}samples.push(...await p.evaluate(n=>tickHybrid(n),n));await p.screenshot({path:path.join(out,label+'-'+route.id+'-'+i+'.png')});}
   await release();const end=await p.evaluate(()=>snapHybrid());
   assert.ok(samples.every(s=>s.safe&&s.hidden==='false'&&s.gl===0),'clear camera throughout '+route.id);
   if(route.id==='north')assert.ok(samples.slice(0,220).every(s=>Math.abs(s.pos[2]+12)<1e-6),'held direction stays straight through rotation');
   assert.ok(end.cuts<=2,'at most entry/exit camera cuts');
   for(let i=1;i<samples.length;i++)if(!samples[i].ground&&!samples[i-1].ground){
    const d=samples[i].rotation[1]-samples[i-1].rotation[1];assert.ok(Math.abs(Math.atan2(Math.sin(d),Math.cos(d)))<1e-6,'no aerial yaw change');
   }
   routes.push({id:route.id,start,end,samples});
  }
  // Continue from the actual exit; keep the thumb/key gesture through repeated
  // doorway crossings. No teleport is used for this boundary stress check.
  const basis=await p.evaluate(()=>skyFixedCamera.view.yaw),x=Math.cos(basis)>0?1:-1;
  await input(x,0);await p.evaluate(()=>tickHybrid(68));const before=await p.evaluate(()=>snapHybrid()),wiggle=[];
  for(let i=0;i<8;i++){await input(i%2?-x:x,0);wiggle.push(...await p.evaluate(()=>tickHybrid(9)));}
  await release();const after=await p.evaluate(()=>snapHybrid());
  assert.ok(wiggle.every(s=>s.safe&&s.hidden==='false'),'boundary stays readable');
  assert.ok(after.cuts-before.cuts<=1,'no repeated camera cuts at one boundary');
  routes.push({id:'boundary',start:before,end:after,samples:wiggle});
 }
 await release();await p.evaluate(()=>{skyFollowCamera.setMode('before',false);__game.frameOnce(0)});
 assert.equal(await p.evaluate(()=>skyFixedCamera.active),false);assert.equal(await p.evaluate(()=>document.body.dataset.skyHumanOccluded),'false');
 if(touch&&map==='index.html')for(const route of routes){const pc=rows.find(r=>!r.touch&&r.map===map).routes.find(r=>r.id===route.id);route.end.pos.forEach((v,i)=>assert.ok(Math.abs(v-pc.end.pos[i])<1e-6,'PC/touch reach the same position'));}
 assert.deepEqual(errors,[]);rows.push({touch,map,snapshots,routes,warnings,errors});fs.writeFileSync(path.join(out,'hybrid-results.json'),JSON.stringify(rows,null,2));console.log('PASS snapshots and route capture',label,JSON.stringify(routes.map(r=>({id:r.id,start:r.start.pos,end:r.end.pos,switches:r.end.switches,cuts:r.end.cuts,unsafe:r.samples.filter(s=>!s.safe).length,hidden:r.samples.filter(s=>s.hidden==='true').length}))));await ctx.close();
}
}finally{await browser?.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1});
