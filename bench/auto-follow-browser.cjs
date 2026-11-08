const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'browser-evidence/auto-follow');
const server=http.createServer(async(req,res)=>{try{const name=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!name.startsWith(root+path.sep))throw Error('path');const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'}[path.extname(name)]||'application/octet-stream';res.writeHead(200,{'content-type':type});res.end(await fs.promises.readFile(name));}catch{res.writeHead(404);res.end();}});
const angle=n=>Math.atan2(Math.sin(n),Math.cos(n));
(async()=>{fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/`;let browser;const rows=[];
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 for(const variant of(process.env.AUTO_FOLLOW_VARIANT?[process.env.AUTO_FOLLOW_VARIANT]:['follow-legacy','follow']))for(const map of['index.html','canyon.html']){
  const ctx=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,locale:'ja-JP'});
  await ctx.addInitScript(()=>{window.__hold=true;localStorage.setItem('gunrun-fixed-controls-v1','1')});let posts=0;const errors=[];
  await ctx.route('https://**/*',r=>{if(r.request().method()==='POST')posts++;return r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0,"ok":true}'})});
  const p=await ctx.newPage();p.setDefaultTimeout(90000);p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base+map+`?camera=after&cameraTrial=${variant}&lang=ja&controlpick=0&hookGuide=0&dev=1`);
  await p.waitForFunction(()=>window.skyStartReadiness?.ready&&document.body.dataset.skyHumanLoaded==='true');await p.locator('#bStart').tap();
  await p.evaluate(()=>{
   const g=__game,c=g.P,s=__skyInternals;g.S.sendLog=g.S.autoFire=false;c.invuln=Infinity;g.GAME.spawnT=g.GAME.surgeT=Infinity;g.SCR.off=g.PACE.off=g.MARK.off=true;
   for(const z of g.zombies){s.ue.remove(z.m.root);if(z.pool)s.ue.remove(z.pool)}g.zombies.length=0;
   window.placeAuto=(at,yaw=0)=>{skySwing.reset();c.pos.set(...at);c.lastGround.copy(c.pos);c.safe.copy(c.pos);c.vel.set(0,0,0);c.state='normal';c.onGround=true;c.h=1.75;c.eye=1.62;c.camY=c.pos.y+c.eye;c.yaw=yaw;c.pitch=-.12;c.shake=0;c.ledge=c.ladder=c.hook=c.zip=c.doorAction=null;c.jumpBuf=c.slideBuf=0;skyFollowCamera.reset();g.frameOnce(0)};
   window.snapAuto=()=>{const cam=g.debug.camera,foot=c.pos.clone();foot.y+=.1;foot.project(cam);return{pos:c.pos.toArray(),velocity:c.vel.toArray(),heading:c.yaw,ground:c.onGround,state:c.state,input:{...s.inputState},camera:cam.position.toArray(),rotation:cam.rotation.toArray().slice(0,3),follow:{...skyFollowCamera.state},fixed:!!window.skyFixedCamera?.active,cutaway:document.body.dataset.skyCutaway,body:document.body.dataset.skyHumanView,footInFrame:Math.abs(foot.x)<.98&&Math.abs(foot.y)<.98&&Math.abs(foot.z)<1,gl:g.debug.renderer.getContext().getError()}};
   window.tickAuto=n=>{const rows=[];for(let i=0;i<n;i++){g.advance(1/60);g.cam(1/60);skyHumanView.update(1/60);if(i%6===0||i===n-1){g.debug.renderer.clear();g.debug.renderer.render(s.ue,g.debug.camera)}rows.push(snapAuto())}return rows};
   const nodes=[...g.NAV.nodes].sort((a,b)=>Math.hypot(a.x,a.y-8,a.z)-Math.hypot(b.x,b.y-8,b.z));
   window.autoLane=null;
   for(const n of nodes)if([-1.5,-.5,.5,1.5,2.5,3].every(dx=>[-4,-3,-2,-1,0,.5].every(dz=>g.freeAt(n.x+dx,n.y+.03,n.z+dz,.32,1.75)&&!g.freeAt(n.x+dx,n.y-.12,n.z+dz,.1,.1)))){autoLane=[n.x,n.y+.001,n.z];break;}
   if(!autoLane)throw Error('No supported lane');placeAuto(autoLane);
  });
  const cdp=await ctx.newCDPSession(p),origin={id:1,x:110,y:250};let held=false,left=origin;
  const touch=(type,touchPoints)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints});
  async function input(x,f){if(!held){await touch('touchStart',[origin]);held=true;}left={...origin,x:origin.x+x*56,y:origin.y-f*56};await touch('touchMove',[left]);await p.waitForFunction(({x,f})=>__skyInternals.inputState.on&&Math.abs(__skyInternals.inputState.x-x)<.01&&Math.abs(__skyInternals.inputState.y+f)<.01,{x,f});}
  async function release(){if(held)await touch('touchEnd',[]);held=false;await p.waitForFunction(()=>!__skyInternals.inputState.on);await p.evaluate(()=>__game.frameOnce(1/60));}
  const tick=n=>p.evaluate(n=>tickAuto(n),n),snap=()=>p.evaluate(()=>snapAuto()),label=`${variant}-${map.split('.')[0]}`;
  await input(0,1);await tick(12);const beforeLook=await snap();
  const right={id:2,x:600,y:155},looked={...right,x:680,y:135};
  await touch('touchStart',[left,right]);await touch('touchMove',[left,looked]);await p.waitForFunction(()=>__skyInternals.inputState.lx===680);
  await tick(0);await p.evaluate(()=>{__game.cam(0);skyHumanView.update(0)});const afterLook=await snap();
  const lookDelta=angle(afterLook.follow.yaw-beforeLook.follow.yaw);
  if(variant==='follow'){assert.ok(Math.abs(lookDelta)<1e-8,'manual yaw ignored');assert.equal(afterLook.follow.manual,false);}
  else assert.ok(Math.abs(lookDelta)>.05,'legacy comparison really allows manual look');
  await input(.6,.8);await tick(45);const followed=await snap();
  if(variant==='follow')assert.ok(Math.abs(angle(followed.follow.yaw-followed.heading))<.04,'right pointer cannot stop following');
  await touch('touchEnd',[looked]);assert.equal(await p.evaluate(()=>__skyInternals.inputState.on),true);await release();
  await p.screenshot({path:path.join(out,label+'-right-drag.png')});
  // Real two-finger jump, with left-thumb corrections through the flight.
  await p.evaluate(()=>placeAuto(autoLane));await input(0,.55);await tick(2);
  const box=await p.locator('#tJump').boundingBox(),jump={id:2,x:box.x+box.width/2,y:box.y+box.height/2};
  await touch('touchStart',[left,jump]);await touch('touchEnd',[jump]);assert.equal(await p.evaluate(()=>__skyInternals.inputState.on),true,'jump keeps the movement finger');
  const jumpStart=await snap(),flight=[];flight.push(...await tick(10));await input(.25,.49);flight.push(...await tick(8));await input(-.25,.49);flight.push(...await tick(8));
  assert.ok(flight.some(s=>s.pos[1]>jumpStart.pos[1]+.3&&!s.ground),'real jump rises');
  assert.ok(flight.some(s=>s.heading<-.2)&&flight.some(s=>s.heading>.2),'air correction reaches native movement');
  await p.screenshot({path:path.join(out,label+'-air-correction.png')});await release();await tick(45);
  const routes=[];
  // Fixed physical locations, native touch inputs only within each route.
  // These are the known north walkway/west-hall fixtures, not a claim that
  // the latest photos' exact player coordinates have been identified.
  const scenes=map==='index.html'?[{id:'west-door',at:[-15.5,.001,0],yaw:-Math.PI/2},{id:'north',at:[-10.5,4.001,-12],yaw:-Math.PI/2}]:[{id:'crossing',at:[3,.001,0],yaw:0}];
  for(const scene of scenes){
   await release();await p.evaluate(s=>placeAuto(s.at,s.yaw),scene);const start=await snap(),samples=[],segments=[];
   const phases=scene.id==='west-door'?[[0,1,45],[-1,0,40],[0,1,35],[0,-1,30]]:[[0,1,30],[.65,.76,20],[0,1,25],[0,-1,25]];
   for(let i=0;i<phases.length;i++){const[x,f,n]=phases[i];await input(x,f);const a=await tick(n);samples.push(...a);segments.push({command:[x,f],start:a[0],end:a.at(-1)});await p.screenshot({path:path.join(out,label+'-'+scene.id+'-'+i+'.png')});}
   await release();const end=await snap();assert.ok(samples.every(s=>!s.fixed&&s.gl===0),'actual following, no fixed/cutaway substitute');routes.push({id:scene.id,start,end,segments,samples});
  }
  assert.deepEqual(errors,[]);assert.equal(posts,0);const result={variant,map,lane:await p.evaluate(()=>autoLane),lookDelta,beforeLook,afterLook,followed,jump:{start:jumpStart,samples:flight},routes,errors,posts};
  rows.push(result);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(rows,null,2));console.log('PASS auto-follow contract and route capture',variant,map,JSON.stringify({lookDelta,routes:routes.map(r=>({id:r.id,start:r.start.pos,end:r.end.pos,segments:r.segments.map(s=>({command:s.command,end:s.end.pos,heading:s.end.heading,view:s.end.follow.yaw}))}))}));await ctx.close();
 }
}finally{await browser?.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1});
