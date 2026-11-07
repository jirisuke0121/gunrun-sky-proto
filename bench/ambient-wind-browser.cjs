// Measure the actual rendered wind bus, including the real intro -> Easy navigation.
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
(async()=>{const b=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=user-gesture-required']});const results=[];try{
 for(const map of ['index.html','canyon.html'])for(const entry of ['manual','intro']){
  const ctx=await b.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true}),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await ctx.addInitScript(()=>{window.__hold=true;localStorage.setItem('gunrun-quality-check-v1','done');});
  await ctx.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0,"ok":true}'}));
  const base=process.env.RUNNING_QA_URL||'http://127.0.0.1:8882/';
  if(entry==='intro'){
   await p.goto(base+'canyon.html?learn=1&cameraTrial=fixed&camera=after&controlpick=0&guides=0&hookGuide=0&return='+(map==='index.html'?'town':'canyon'));
   await p.waitForFunction(()=>window.skyGuidedIntro&&__game.mode==='play',null,{timeout:120000});await p.locator('[data-learn-adopt=after]').tap();
   await p.waitForFunction(()=>__skyInternals.Ut.ctx?.state==='running');
   await p.evaluate(()=>{__skyInternals.Ut.wind.gain.cancelScheduledValues(__skyInternals.Ut.ctx.currentTime);__skyInternals.Ut.wind.gain.setValueAtTime(.12,__skyInternals.Ut.ctx.currentTime);});
   await p.waitForTimeout(900);const pausedWind=await p.evaluate(()=>({blocked:skyGuidedIntro.blocked,wind:__skyInternals.Ut.wind.gain.value}));
   // Fixture skips the already covered course, then uses its production finish/navigation.
   await p.evaluate(()=>skyGuidedIntro.finish());await p.waitForURL('**/'+map+'?learned=1*');
   await p.waitForFunction(()=>__game?.mode==='play'&&skyChallenge?.id==='easy',null,{timeout:120000});
   results.push({map,entry,pausedWind});
  }else{await p.goto(base+map+'?controlpick=0&guides=0&hookGuide=0');await p.waitForFunction(()=>window.skyStartReadiness?.ready,null,{timeout:120000});await p.locator('#bStart').tap();results.push({map,entry});}
  if(await p.evaluate(()=>__skyInternals.Ut.ctx.state!=='running'))await p.locator('#tAutoFire').tap();await p.waitForFunction(()=>__skyInternals.Ut.ctx.state==='running');
  const r=await p.evaluate(async()=>{const g=__game,{Ut,U}=__skyInternals,before={volume:U.volume,master:Ut.master.gain.value},a=Ut.ctx.createAnalyser();a.fftSize=8192;Ut.wind.connect(a);const rows=[];
   for(const [name,speed,ground]of [['idle',0,true],['ground-run',6,true],['air-run',6,false],['fast-air',20,false],['stopped',0,true]]){
    g.P.state='normal';g.P.onGround=ground;g.P.vel.set(speed,0,0);g.step(0);await new Promise(r=>setTimeout(r,1100));let sum=0,peak=0,count=0;
    for(let k=0;k<5;k++){const pcm=new Float32Array(a.fftSize);a.getFloatTimeDomainData(pcm);for(const x of pcm){sum+=x*x;peak=Math.max(peak,Math.abs(x));count++;}await new Promise(r=>setTimeout(r,60));}
    rows.push({name,speed,ground,rms:Math.sqrt(sum/count),peak,gain:Ut.wind.gain.value});
   }
   Ut.wind.disconnect(a);return{rows,before,after:{volume:U.volume,master:Ut.master.gain.value},mode:g.mode,challenge:skyChallenge.id};});
  Object.assign(results.at(-1),r,{errors});for(const x of r.rows){const limit=['idle','stopped'].includes(x.name)?.0005:x.name==='fast-air'?.028:.016;assert.ok(x.rms<limit,JSON.stringify({map,entry,...x,limit}));}
  if(entry==='intro')assert.ok(results.at(-1).pausedWind.blocked&&results.at(-1).pausedWind.wind<.001,'coaching pause fades the wind');
  assert.deepEqual(r.after,r.before,'do not change the player volume');assert.deepEqual(errors,[]);assert.equal(r.mode,'play');console.log('PASS bounded ambient wind',map,entry,JSON.stringify(r.rows));await ctx.close();
 }
 fs.mkdirSync('browser-evidence',{recursive:true});fs.writeFileSync('browser-evidence/ambient-wind.json',JSON.stringify(results,null,2));
 }finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
