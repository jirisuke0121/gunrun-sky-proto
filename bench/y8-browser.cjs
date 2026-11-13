const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve(process.env.Y8_BUILD_DIR||'.'),base='http://127.0.0.1:8808/';
(async()=>{let browser,server;const results=[];try{
 server=spawn('python3',['-m','http.server','8808','--bind','127.0.0.1','--directory',root],{stdio:'ignore'});
 for(let i=0;i<50;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const out='browser-evidence/y8';fs.mkdirSync(out,{recursive:true});
 for(const mode of ['guest','blocked','auth','late-auth']){
  const ctx=await browser.newContext({locale:'en-US',viewport:{width:844,height:390},isMobile:true,hasTouch:true});
  const errors=[],posts=[];let authCalls=0;
  await ctx.addInitScript(({mode})=>{
   window.__hold=true;window.SKY_PLATFORM={id:'y8'};window.authToken='access-one';window.adRequests=0;
   if(mode==='blocked')return;
   let callback;
   const sdk={init(config,ads){window.sdkConfig={config,adsConfigured:ads!==undefined};},
    onAuth(fn){callback=fn;fn(['auth','late-auth'].includes(mode)?{pid:'untrusted-client-id'}:null);},
    getAccessToken(){return window.authToken;},refreshToken(){window.authToken='access-refreshed';return Promise.resolve();},
    login(){window.loginClicked=true;callback({pid:'untrusted-client-id'});},logout(){callback(null);return Promise.resolve();},
    showAd(){window.adRequests++;throw Error('Advertisements must not be requested');}};
   window.y8={sdk:()=>sdk,emitReadyEvent(){window.dispatchEvent(new Event('y8sdk.ready'));}};
   window.switchY8Account=()=>{window.authToken='access-two';callback({pid:'changed'});};
  },{mode});
  await ctx.route('https://**/*',async r=>{
   const u=new URL(r.request().url());
   if(u.hostname==='cdn.y8.com')return r.fulfill({status:200,contentType:'text/javascript',body:''});
   if(u.pathname==='/auth/y8'){
    authCalls++;const second=r.request().headers().authorization.includes('two');
    if(mode==='late-auth'&&authCalls===1)await new Promise(r=>setTimeout(r,1000));
    return r.fulfill({json:{ok:true,player:'y8_'+(second?'b':'a').repeat(32),name:second?'SECOND':'TEST Y8 PLAYER',session:{token:'session-'+authCalls,expiresAt:Date.now()+3600000}}});
   }
   if(r.request().method()==='POST')posts.push({url:u.pathname,headers:r.request().headers(),body:r.request().postData()});
   return r.fulfill({json:{ok:true,recordProtocol:2,top:[],total:0,me:null}});
  });
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000);
  await page.goto(base+'index.html?dev=1');
  await page.waitForFunction(()=>window.skyY8&&window.skyStartReadiness?.ready);
  assert.equal(await page.evaluate(()=>skyDevMode),false);
  assert.equal(await page.locator('#homeDevelopment').isVisible(),false);
  assert.equal(await page.locator('#homeCredits').isVisible(),true);
  assert.equal(await page.locator('.home-difficulty-trial').count(),0);
  if(mode!=='blocked')assert.deepEqual(await page.evaluate(()=>sdkConfig),{config:{appId:'6af70306dbd7b9b69d28ee0c',autoLogin:true},adsConfigured:false});
  if(mode==='late-auth'){
    await page.evaluate(()=>switchY8Account());
    await page.waitForFunction(()=>skyY8.player()==='y8_'+'b'.repeat(32));
    await page.waitForTimeout(1100);assert.equal(await page.evaluate(()=>skyY8.player()),'y8_'+'b'.repeat(32),'stale account response is ignored');
  }
  if(mode==='auth')await page.waitForFunction(()=>skyY8.qa.auth==='authenticated');
  assert.equal(await page.evaluate(()=>adRequests),0,'no load/menu advertisements');
  if(mode==='guest'){
   await page.locator('#bIntro').click();
   assert.equal(await page.evaluate(()=>adRequests),0,'tutorial entry never requests an advertisement');
   assert.equal(await page.evaluate(()=>skyChallenge.isIntroRun),true,'nested start preserves the actual intro run');
   await page.evaluate(()=>__skyInternals.An('menu'));
   await page.locator('[data-difficulty="normal"]').click();
  }
  await page.locator('#bStart').click();
  await page.waitForFunction(()=>__game.mode==='play');
  const audio=await page.evaluate(()=>({volume:__skyInternals.U.volume,master:__skyInternals.Ut.master.gain.value}));
  await page.evaluate(()=>{window.dispatchEvent(new Event('blur'));});
  assert.equal(await page.evaluate(()=>__game.mode),'pause');
  await page.waitForFunction(()=>__skyInternals.Ut.ctx.state==='suspended');
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  assert.equal(await page.evaluate(()=>__game.mode),'pause','returning does not resume a chase unexpectedly');
  await page.locator('#bResume').click();await page.waitForFunction(()=>__game.mode==='play'&&__skyInternals.Ut.ctx.state==='running');
  assert.deepEqual(await page.evaluate(()=>({volume:__skyInternals.U.volume,master:__skyInternals.Ut.master.gain.value})),audio);
  if(mode==='auth'){
   const first=await page.evaluate(()=>skyY8.runPlayer());
   await page.evaluate(()=>switchY8Account());await page.waitForFunction(()=>skyY8.player()==='y8_'+'b'.repeat(32));
   assert.equal(await page.evaluate(()=>skyY8.runPlayer()),first,'mid-run switch preserves run ownership');
   const rejected=await page.evaluate(async first=>{try{await skyY8.fetch('https://gunrun-runs.jirisuke0121.workers.dev/runs',{method:'POST',body:JSON.stringify({player:first})});return false}catch{return true}},first);
   assert.equal(rejected,true);assert.equal(posts.filter(p=>p.url==='/runs').length,0,'wrong-account run is not transmitted');
   assert.ok(!(await page.evaluate(()=>JSON.stringify(localStorage))).includes('session-'));
  }
  // Re-open Home for actual small-screen layout and account button checks.
  await page.evaluate(()=>__skyInternals.An('menu'));
  await page.setViewportSize({width:667,height:375});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.waitForTimeout(250);
  const rects=await page.evaluate(()=>Object.fromEntries(['homeHero','bStart','y8Account'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return [id,{x:r.x,y:r.y,w:r.width,h:r.height}]})));
  assert.ok(rects.bStart.y+rects.bStart.h<=375,'Start button fits the viewport');
  await page.screenshot({path:path.join(out,mode+'.png')});
  assert.equal(await page.evaluate(()=>adRequests),0,'gameplay does not request ads');
  assert.deepEqual(errors,[]);results.push({mode,rects,authCalls,adRequests:await page.evaluate(()=>adRequests),errors});
  console.log('PASS Y8',mode,'start/focus/audio/layout/account');await ctx.close();
 }
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
}finally{await browser?.close();server?.kill();}})().catch(e=>{console.error(e);process.exitCode=1});
