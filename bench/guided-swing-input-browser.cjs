// Reproduce the reported retry with native touch/key events after a lesson-entry fixture.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
(async()=>{let browser;const out='browser-evidence/guided-swing-input';fs.mkdirSync(out,{recursive:true});try{
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const cases=[
  {id:'touch-follow-retry',width:844,height:390,touch:true,camera:'after',retry:true},
  {id:'touch-manual-fresh',width:844,height:390,touch:true,camera:'before',retry:false},
  {id:'touch-small-retry',width:640,height:320,touch:true,camera:'after',retry:true,lang:'en'},
  {id:'touch-follow-fresh',width:844,height:390,touch:true,camera:'after',retry:false},
  {id:'pc-follow-fresh',width:1280,height:720,touch:false,camera:'after',retry:false},
  {id:'pc-manual-retry',width:1280,height:720,touch:false,camera:'before',retry:true},
 ];
 const results=[];
 for(const config of cases){
  const p=await browser.newPage({viewport:{width:config.width,height:config.height},hasTouch:config.touch,isMobile:config.touch}),errors=[];
  await p.addInitScript(()=>{window.__hold=true;});
  p.on('pageerror',e=>errors.push(e.message));
  const base=process.env.RUNNING_QA_URL||'http://127.0.0.1:8882/';
  await p.route('https://**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.fulfill({status:200,contentType:'application/json',body:'{"top":[]}'}));
  await p.goto(base+`canyon.html?learn=1&camera=${config.camera}&lang=${config.lang||'ja'}&return=canyon&controlpick=0`);
  await p.waitForFunction(()=>window.skyGuidedIntro?.choice==='choose',null,{timeout:90000});await p.locator(`[data-learn-adopt=${config.camera}]`).click();
  const cdp=config.touch?await p.context().newCDPSession(p):null;
  // Invert the game's own rotation mapping, so these are the same logical thumb gestures in either orientation.
  const points=await p.evaluate(()=>{const zero={clientX:0,clientY:0},x0=__CX(zero),y0=__CY(zero),a=__CX({clientX:1,clientY:0})-x0,b=__CX({clientX:0,clientY:1})-x0,c=__CY({clientX:1,clientY:0})-y0,d=__CY({clientX:0,clientY:1})-y0,det=a*d-b*c;
   const physical=(x,y)=>({x:(d*(x-x0)-b*(y-y0))/det,y:(a*(y-y0)-c*(x-x0))/det,id:1});return{origin:physical(110,__VH()-85),forward:physical(110,__VH()-124.2)};});
  let held=false;
  await p.exposeFunction('swingTestMove',async on=>{
   if(config.touch){if(on){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[points.origin]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[points.forward]});}
    else await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[points.forward]});}
   else if(on)await p.keyboard.down('w');else await p.keyboard.up('w');held=on;
  });
  await p.exposeFunction('swingTestJump',async()=>{
   if(!config.touch)return p.keyboard.press('Space');
   const r=await p.locator('#tJump').boundingBox(),right={x:r.x+r.width/2,y:r.y+r.height/2,id:2};
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:held?[points.forward,right]:[right]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[right]});
  });
  await p.exposeFunction('swingTestWrong',()=>config.touch?p.locator('#tDecoy').tap():p.keyboard.press('2'));
  const result=await p.evaluate(async config=>{
   const g=__game,c=g.P,sky=__skyInternals,flow=skyGuidedIntro,dt=1/30;
   const at=(x,y,key,z=0)=>{c.pos.set(x,y,z);c.vel.set(0,0,0);c.onGround=true;c.state='normal';if(key)g.stats[key]=(g.stats[key]||0)+1;flow.beforeFrame();};
   at(10,2);at(14,2,'vaults');at(23,2,'jumps');at(28,2);at(34.5,4.4,'mantles');at(50,4.4,'wallruns');at(65,5.2,'hooks');at(84,0,'slides');at(93,4,'ladders');at(112,2.8,'zips');at(119,4,'walljumps');
   flow.retrying();flow.restored();
   if(config.retry){c.pos.y=-5;c.onGround=false;g.advance(dt);}
   const resets=[];const originalRetry=flow.retrying;flow.retrying=()=>{resets.push({pos:c.pos.toArray(),vel:c.vel.toArray(),state:c.state,stats:{...g.stats},input:{...sky.inputState}});originalRetry();};const retries=skyPractice.retries,jumps=g.stats.jumps||0,grabs=g.stats.barGrabs||0,releases=g.stats.barJumps||0;
   const snapshot=()=>JSON.stringify({p:c.pos.toArray(),t:g.GAME.t,jumps:g.stats.jumps,flash:skyFlashbang.charges,decoys:skyDecoy.stats.used});
   await window.swingTestMove(true);for(let n=0;n<100&&!flow.blocked;n++){g.advance(dt);g.cam(dt);}if(!flow.blocked||flow.pausedTarget!=='tJump')throw Error('missing takeoff pause');
   await window.swingTestMove(false);const frozen=snapshot();await window.swingTestJump();g.advance(dt);
   if(!flow.blocked||snapshot()!==frozen)throw Error('jump without forward input bypassed the pause');
   await window.swingTestWrong();if(snapshot()!==frozen||!flow.blocked)throw Error('wrong skill bypassed the pause');
   await window.swingTestMove(true);const prepared=!!(config.touch?sky.inputState.on:g.keys.KeyW);
   if(!prepared)throw Error('movement re-press was blocked');for(let n=0;n<60;n++)g.advance(dt);
   if(snapshot()!==frozen||!flow.blocked)throw Error('preparing movement advanced the paused world');
   g.cam(0);g.frameOnce(0);await window.swingTestJump();g.advance(dt);
   if((g.stats.jumps||0)!==jumps+1)throw Error('ground jump did not fire exactly once');
   let last='',presses=1;
   for(let n=0;n<300&&flow.stage==='swing';n++){
    const q=flow.cue,key=q.cue+':'+skySwing.active?.bar.id;
    if(q.action==='tJump'&&q.press&&last!==key){g.cam(0);g.frameOnce(0);await window.swingTestJump();last=key;presses++;}else if(!q.action)last='';
    g.advance(dt);g.cam(dt);
   }
   await window.swingTestMove(false);g.frameOnce(0);
   return{resets,stage:flow.stage,retries:skyPractice.retries-retries,initialRetries:retries,jumps:(g.stats.jumps||0)-jumps,grabs:(g.stats.barGrabs||0)-grabs,releases:(g.stats.barJumps||0)-releases,presses,prepared,frozen:true,pos:c.pos.toArray()};
  },config);
  assert.deepEqual(errors,[]);assert.equal(result.stage,'dash');assert.equal(result.retries,0);assert.equal(result.initialRetries,config.retry?1:0);assert.equal(result.jumps,1);assert.equal(result.grabs,2);assert.equal(result.releases,2);assert.equal(result.presses,3);
  await p.screenshot({path:`${out}/${config.id}.png`});results.push({config,...result});fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));console.log('PASS',config.id,JSON.stringify(result));await p.close();
 }
}finally{await browser?.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
