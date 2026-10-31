const fs=require('node:fs'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {chromium}=require('playwright');
const base=process.env.RUNNING_QA_URL||'http://127.0.0.1:8789/';
const out='browser-evidence/swing-fatigue';fs.mkdirSync(out,{recursive:true});
(async()=>{let browser,server;const results=[];
try{
 if(!process.env.RUNNING_QA_URL){server=spawn('python3',['-m','http.server','8789','--bind','127.0.0.1'],{stdio:'ignore'});for(let i=0;i<50;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100));}}
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const map of ['canyon.html','index.html'])for(const touch of [false,true]){
  const id=map.split('.')[0]+'-'+(touch?'touch':'desktop'),ctx=await browser.newContext({viewport:touch?{width:844,height:390}:{width:1280,height:720},hasTouch:touch,isMobile:touch}),errors=[];
  await ctx.addInitScript(()=>window.__hold=true);
  await ctx.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0,"ok":true}'}));
  const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base+map);await p.waitForFunction(()=>window.skySwing&&document.body.dataset.skyHumanLoaded==='true',null,{timeout:120000});await p.locator('#bStart').click();
  await p.evaluate(({touch})=>{
   const g=__game,c=g.P,s=__skyInternals,dt=1/30;
   Object.assign(g.S,{sendLog:false,autoFire:false,aimAuto:false,gunOn:true});c.invuln=Infinity;
   window.gripSetup=()=>{
    skySwing.reset();skyLandingRoll.reset();skyDash.reset(false);g.setMode('play');
    for(const k of Object.keys(g.keys))g.keys[k]=false;
    Object.assign(s.inputState,{on:touch,x:0,y:0,slideHeld:false});
    const b=skySwing.course.bars[0],d=b.direction;
    c.pos.set(b.at[0]-d[0],b.at[1]-2,b.at[2]-d[1]);c.vel.set(d[0]*5,0,d[1]*5);
    Object.assign(c,{yaw:Math.atan2(-d[0],-d[1]),pitch:0,state:'normal',onGround:false,h:1.75,jumpBuf:0,catchCD:0,coyote:0,crouchPressed:false,hookPressed:false,edgeOff:null,life:3,invuln:Infinity});
    skyFollowCamera?.reset();g.playerStep(1/120);if(!skySwing.active)throw Error('real bar was not caught');
    return skySwing.active.bar.id;
   };
   window.gripTick=()=>{
    for(let i=0;i<4;i++)g.playerStep(1/120);
    g.cam(dt);skyHumanView.update(dt);skySwing.frame();
    const a=skySwing.active,trace={pos:c.pos.toArray(),vel:c.vel.toArray(),state:c.state,ground:c.onGround,bar:a?.bar.id,turns:a?.turns,fatigue:a?.fatigue,slipAge:a?.slipAge,
      fall:c.swingFall&&{...c.swingFall},clip:document.body.dataset.skyHumanClip,action:document.body.dataset.skyHumanAction,
      handError:+document.body.dataset.skyHumanHandError,firstHands:[skySwing.handPose(-1),skySwing.handPose(1)],
      warning:document.getElementById('swingGripStatus').textContent,heldSeconds:a?.heldSeconds};
    return trace;
   };
   window.gripRender=()=>{g.debug.renderer.clear();g.debug.renderer.render(s.ue,s.Se);g.debug.renderer.clearDepth();if(document.body.dataset.skyHumanView==='first')g.debug.renderer.render(s.fo,s.za);return g.debug.renderer.getContext().getError();};
  },{touch});
  const run=await p.evaluate(()=>{
   gripSetup();let trace=[],pause=false,detached=false;const before=__game.stats.barExhaustions||0;
   for(let i=0;i<300;i++){
    const a=skySwing.active;
    if(a?.slipAge>.07&&!pause){
     const snapshot=JSON.stringify({pos:__game.P.pos.toArray(),age:a.slipAge,held:a.heldSeconds});__game.setMode('pause');for(let j=0;j<60;j++)gripTick();
     if(snapshot!==JSON.stringify({pos:__game.P.pos.toArray(),age:a.slipAge,held:a.heldSeconds}))throw Error('pause changed grip exhaustion');__game.setMode('play');pause=true;
    }
    const t=gripTick();trace.push(t);if(!skySwing.active&&t.fall)detached=true;
    if(detached&&!t.fall)break;
   }
   return{trace,pause,exhaustions:(__game.stats.barExhaustions||0)-before};
  });
  assert.ok(run.pause&&run.exhaustions===1,id);
  assert.ok(run.trace.some(t=>t.fatigue>.65&&t.warning.includes('手が滑る')),id+' fatigue warning');
  assert.ok(run.trace.some(t=>t.clip==='gripSlip'&&t.slipAge>.1&&t.handError<.01),id+' one-hand slip');
  assert.ok(run.trace.some(t=>t.clip==='swingFall'&&t.fall&&t.vel[1]<0),id+' falls with release animation');
  assert.ok(run.trace.some(t=>t.turns===6),id+' three round trips');
  const last=run.trace.at(-1);assert.ok(last.pos[1]<run.trace.find(t=>t.fall).pos[1]-.3,id+' real gravity descent');
  assert.ok(run.trace.every(t=>t.pos.every(Number.isFinite)&&t.vel.every(Number.isFinite)),id+' finite physics');
  // A fresh jump during the warning must still release at the actual phase.
  await p.evaluate(()=>{gripSetup();for(let i=0;i<250&&skySwing.active.turns<4;i++)gripTick();});
  if(touch)await p.locator('#tJump').tap();else await p.keyboard.press('Space');
  const escape=await p.evaluate(()=>{const t=gripTick();return{...t,flight:__game.P.swingFlight};});assert.ok(escape.flight&&!escape.fall,id+' warning permits an intentional jump');
  // Capture the actual poses from a second uninterrupted grip, including
  // first-person hands. These are rendered frames, not mock artwork.
  await p.evaluate(()=>gripSetup());const shotStages=new Set();
  for(let i=0;i<260;i++){
   const t=await p.evaluate(()=>gripTick());
   let stage=t.fall&&t.fall.age>.55?'fall':t.fall?'released':t.slipAge>.17?'one-hand':t.fatigue>.85?'tired':null;
   if(stage&&!shotStages.has(stage)){shotStages.add(stage);const gl=await p.evaluate(()=>gripRender());assert.equal(gl,0);await p.screenshot({path:`${out}/${id}-${stage}.png`});}
   if(stage==='fall')break;
  }
  const layers=await p.evaluate(()=>{let max=0;__skyInternals.ue.traverse(o=>{if(o.isMesh)max=Math.max(max,o.geometry?.morphAttributes?.position?.length||0)});return max;});assert.ok(layers<=256,id+' WebGL2 layers');
  const first=await p.evaluate(()=>{document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyV'}));gripSetup();for(let i=0;i<250;i++){const t=gripTick();if(t.slipAge>.17)return t;}throw Error('no first-person slip');});
  assert.ok(first.firstHands.every(Boolean));const gl=await p.evaluate(()=>gripRender());assert.equal(gl,0);await p.screenshot({path:`${out}/${id}-first-person.png`});
  assert.deepEqual(errors,[]);results.push({id,exhaustions:run.exhaustions,pause:run.pause,frames:run.trace.length,stages:[...shotStages],layers,errors});
  fs.writeFileSync(`${out}/${id}-trace.json`,JSON.stringify(run,null,2));await ctx.close();
 }
 fs.writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{await browser?.close();server?.kill();}})().catch(e=>{console.error(e);process.exitCode=1});
