const assert=require('node:assert/strict'),fs=require('node:fs'),{spawn}=require('node:child_process'),{chromium}=require('playwright');
const base=process.env.RUNNING_QA_URL||'http://127.0.0.1:8778/';
(async()=>{let browser,server;try{
 if(!process.env.RUNNING_QA_URL){server=spawn('python3',['-m','http.server','8778','--bind','127.0.0.1'],{stdio:'ignore'});for(let i=0;i<50;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100));}}
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 fs.mkdirSync('browser-evidence/practice',{recursive:true});
 for(const touch of (process.env.PRACTICE_QA_TOUCH_ONLY?[true]:[false,true])){
  const ctx=await browser.newContext({viewport:touch?{width:844,height:390}:{width:1280,height:720},hasTouch:touch,isMobile:touch});
  const errors=[],posts=[];await ctx.addInitScript(()=>{window.__hold=true;localStorage.setItem('gunrun-sky-proto-v1',JSON.stringify({sprintSpeed:6,sendLog:true}));});
  const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.route('https://**/*',r=>{if(r.request().method()==='POST')posts.push(r.request().url());return r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0,"ok":true}'});});
  await p.goto(base+'index.html');await p.waitForFunction(()=>window.skyHumanView&&window.skySwing);
  await p.getByRole('link',{name:'鉄棒から試す',exact:true}).click();
  await p.waitForFunction(()=>window.skyPractice&&__game.mode==='play',null,{timeout:90000});
  console.log('practice loaded',touch?'touch':'desktop');
  assert.equal(await p.locator('#practiceSection').inputValue(),'swing');
  const initial=await p.evaluate(()=>({at:__game.P.pos.toArray(),sendLog:__game.S.sendLog,profile:skyChallenge.profile(),targets:__game.zombies.length,ranking:document.querySelectorAll('.rankbox').length}));
  assert.ok(Math.abs(initial.at[0]+16.9)<.1&&initial.sendLog===false&&initial.profile===null&&initial.targets===2&&initial.ranking===0,JSON.stringify(initial));
  await p.evaluate(()=>{window.qaTouch=[];for(const name of ['pointerdown','pointerup','pointermove'])document.addEventListener(name,e=>qaTouch.push([name,e.pointerId,e.clientX,e.clientY,e.target.id]),true);});
  const session=touch?await ctx.newCDPSession(p):null,stick={x:140,y:190,id:7};
  await p.evaluate(()=>{
   window.tickPractice=(n=1)=>{for(let i=0;i<n;i++){__game.advance(1/60);__game.cam(1/60);skyHumanView.update(1/60);} };
  });
  if(touch){await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...stick,y:280}]});await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[stick]});}
  else await p.keyboard.down('KeyW');
  await p.evaluate(()=>{tickPractice(4);
  });
  const openControls=async()=>{if(touch)await p.getByRole('button',{name:'技を選ぶ',exact:true}).click();else await p.keyboard.press('Tab');await p.waitForFunction(()=>__game.mode==='pause');};
  const jump=async()=>{if(touch){const b=await p.locator('#tJump').boundingBox(),point={x:b.x+b.width/2,y:b.y+b.height/2,id:8};await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[stick,point]});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[point]});}else await p.keyboard.press('Space');};
  await jump();const bars=new Set();let landed=false,maxSpeed=0;
  for(let i=0;i<160;i++){
   const state=await p.evaluate(()=>{tickPractice();const a=skySwing.active,c=__game.P;return{bar:a?.bar.id,angle:a?.angle,omega:a?.omega,ground:c.onGround,pos:c.pos.toArray(),speed:Math.hypot(c.vel.x,c.vel.z)};});
   maxSpeed=Math.max(maxSpeed,state.speed);if(state.bar)bars.add(state.bar);
   if(state.bar&&state.angle>=.7&&state.omega>1.1)await jump();
   if(bars.size===2&&state.ground&&state.pos[1]>7.9){landed=true;break;}
  }
  if(!landed)console.log(await p.evaluate(()=>({inputs:qaTouch,stick:document.getElementById('stick').className,knob:document.getElementById('knob').style.transform,pos:__game.P.pos.toArray(),velocity:__game.P.vel.toArray(),settings:{sprint:__game.S.sprintSpeed,auto:__game.S.autoSprint},yaw:__game.P.yaw})));
  assert.ok(landed&&maxSpeed>10,JSON.stringify({landed,bars:[...bars],maxSpeed}));
  assert.ok(await p.locator('#dashStatus').isVisible(),'speed reward is visible in practice, whose life panel is hidden');
  assert.match(await p.locator('#dashStatus').innerText(),/^速度 \+\d+% ↑$/);
  assert.ok(await p.locator('#practicePanel #dashStatus').count());
  if(touch)await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await p.keyboard.up('KeyW');
  await p.evaluate(()=>{__game.keys.KeyW=false;tickPractice(2);__game.frameOnce(0);});
  await p.screenshot({path:`browser-evidence/practice/${touch?'touch':'desktop'}-swing.png`});
  // All sections have a real standing surface and can be retried from the UI.
  const sections=await p.locator('#practiceSection option').evaluateAll(es=>es.map(e=>e.value));
  const surfaces=[];
  for(const id of sections){
   await openControls();await p.selectOption('#practiceSection',id);
   const state=await p.evaluate(()=>{tickPractice(2);const g=__game,c=g.P;return{id:skyPractice.section.id,pos:c.pos.toArray(),free:g.freeAt(c.pos.x,c.pos.y+.03,c.pos.z,c.r,1.75),ground:c.onGround};});
   surfaces.push(state);assert.ok(state.free&&state.ground,JSON.stringify(state));
  }
  await openControls();await p.selectOption('#practiceSection','wallrun');
  const permission=await p.evaluate(()=>{const wall=__game.solids.find(s=>s.practice==='run-wall');return __skyCanWallRunOnFace(wall,{x:0,z:1});});assert.equal(permission,true);
  // Physics has no match timer; practice never submits a run or writes match settings/bests.
  await openControls();await p.selectOption('#practiceSection','swing');
  const persistence=await p.evaluate(()=>{
   const before=JSON.stringify(localStorage),c=__game.P;
   __game.GAME.t=130;tickPractice(2);__skyInternals.Ua();__game.runlogSave('quit');
   const alive=!__game.GAME.over;
   c.pos.set(-12,0,-6);c.onGround=true;tickPractice();
   return{alive,after:c.pos.toArray(),before,saved:JSON.stringify(localStorage),falls:JSON.parse(document.body.dataset.skyPractice).falls};
  });
  assert.ok(persistence.alive&&persistence.after[1]>5&&persistence.before===persistence.saved,JSON.stringify(persistence));
  await openControls();await p.locator('#practiceRetry').click();assert.equal(await p.locator('#practiceSection').inputValue(),'swing');
  await openControls();await p.locator('#practiceNext').click();assert.equal(await p.locator('#practiceSection').inputValue(),'ladder');
  await p.evaluate(()=>{__game.frameOnce(0);});
  await p.screenshot({path:`browser-evidence/practice/${touch?'touch':'desktop'}-controls.png`});
  assert.deepEqual(errors,[]);assert.deepEqual(posts,[]);
  console.log(JSON.stringify({touch,initial,maxSpeed,bars:[...bars],surfaces,persistence:{alive:persistence.alive,after:persistence.after}}));
  await session?.detach();await ctx.close();
 }
 console.log('PASS: home → instant swing trial, real keyboard/touch transfers, all station surfaces, retry/next/fall recovery, unlimited practice and no match persistence');
}finally{await browser?.close();server?.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
