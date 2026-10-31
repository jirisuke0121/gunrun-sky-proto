const fs=require('node:fs'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {chromium}=require('playwright');
const base=process.env.RUNNING_QA_URL||'http://127.0.0.1:8778/';
(async()=>{let browser,server;
try{
 if(!process.env.RUNNING_QA_URL){server=spawn('python3',['-m','http.server','8778','--bind','127.0.0.1'],{stdio:'ignore'});for(let i=0;i<50;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100));}}
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[],results=[];
 page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>window.__hold=true);
 await page.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0,"ok":true}'}));
 for(const map of ['index.html','canyon.html?practice=1']){
  await page.goto(base+map);await page.waitForFunction(()=>window.__game&&window.skyStairWalk&&!document.getElementById('bStart').disabled);
  const result=await page.evaluate(()=>{
   const w=window,g=w.__game,c=g.P,failures=[];g.S.sendLog=false;g.startGame();g.GAME.over=false;
   g.GAME.spawnT=g.GAME.surgeT=1e9;Object.assign(g.S,{autoFire:false,aimAuto:false,autoSprint:true});
   for(const key of Object.keys(g.keys))g.keys[key]=false;
   function reset(p,yaw,speed,touch=false){
    w.skySwing?.reset();g.keys.KeyW=false;g.keys.KeyS=false;g.keys.ShiftLeft=false;
    c.pos.set(p[0],p[1]+.0001,p[2]);c.lastGround.copy(c.pos);c.vel.set(0,0,0);
    Object.assign(c,{yaw,pitch:0,state:'normal',onGround:true,h:1.75,slideCD:0,slideBuf:0,slideT:0,catchCD:0,jumpBuf:0,coyote:.15,airT:0,edgeOff:null,setCD:0,crouchPressed:false,hookPressed:false,hookCD:0,life:3,invuln:1e9});
    g.S.sprintSpeed=g.S.walkSpeed=speed;
    const input=w.__skyInternals.inputState;Object.assign(input,{on:touch,x:0,y:0,mag:0,slideHeld:false});
   }
   let cases=0;
   for(const f of w.skyStairWalk.flights)for(const reverse of [false,true])for(const offset of [-.2,0,.2])for(const speed of [2.6,6])for(const touch of [false,true]){
    const axis=f.axis==='x'?'X':'Z',steps=[...f.steps].sort((a,b)=>a['min'+axis]-b['min'+axis]);if(reverse)steps.reverse();
    const first=steps[0],last=steps.at(-1),sign=reverse?-1:1,start=(first['min'+axis]+first['max'+axis])/2,cross=(f.left+f.right)/2+offset;
    let target=(last['min'+axis]+last['max'+axis])/2;if(f.id==='east-tower-stair'&&!reverse)target=60.9;
    reset(f.axis==='x'?[start,first.maxY,cross]:[cross,first.maxY,start],f.axis==='x'?-sign*Math.PI/2:sign>0?Math.PI:0,speed,touch);
    for(let i=0;i<12;i++)g.playerStep(1/120);
    if(touch)Object.assign(w.__skyInternals.inputState,{on:true,x:0,y:-1,mag:1});else g.keys.KeyW=true;
    const distance=Math.abs(target-c.pos[f.axis]);let done=false,error='';
    for(let i=0;i<Math.ceil((distance/speed+1)*120);i++){
     g.playerStep(1/120);
     if(c.state!=='normal'){error='state '+c.state;break;}
     if(!c.onGround){error='airborne';break;}
     if((target-c.pos[f.axis])*sign<=.12){done=true;break;}
    }
    if(!done||error)failures.push({id:f.id,reverse,offset,speed,touch,pos:c.pos.toArray(),error:error||'blocked'});
    cases++;
   }
   // Enter from the real roof and continue onto the widened upper landing.
   if(!w.skyPracticeMode)for(const x of [-60.25,-48.75])for(const touch of [false,true]){
    const west=x<-55;reset([x,west?4.2:4,west?-5.3:-4.7],0,6,touch);
    if(touch)Object.assign(w.__skyInternals.inputState,{on:true,x:0,y:-1,mag:1});else g.keys.KeyW=true;
    let done=false;
    for(let i=0;i<240;i++){g.playerStep(1/120);if(c.state!=='normal'||!c.onGround)break;if(c.pos.z<-11.7){done=true;break;}}
    if(!done)failures.push({id:'tower-entrance',x,touch,pos:c.pos.toArray(),state:c.state,ground:c.onGround});cases++;
   }
   g.keys.KeyW=false;w.__skyInternals.inputState.on=false;g.cam(0);g.frameOnce(0);
   // Editor/export callers must still be able to serialize the solids.
   const stairSolids=g.solids.filter(b=>b.walkStair);
   if(stairSolids.some(b=>Object.getOwnPropertyDescriptor(b,'walkStair')?.enumerable))throw Error('stair metadata is enumerable');
   JSON.stringify(stairSolids.map(({mesh,...b})=>b));
   return{flights:w.skyStairWalk.flights.length,cases,failures};
  });
  results.push({map,...result});
  fs.mkdirSync('browser-evidence/stairs',{recursive:true});
  await page.screenshot({path:'browser-evidence/stairs/'+(map.startsWith('index')?'town':'practice')+'.png'});
 }
 fs.writeFileSync('browser-evidence/stairs/results.json',JSON.stringify({results,errors},null,2));
 console.log(JSON.stringify({results,errors},null,2));
 assert.deepEqual(errors,[]);for(const r of results)assert.deepEqual(r.failures,[],r.map);
}finally{await browser?.close();server?.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
