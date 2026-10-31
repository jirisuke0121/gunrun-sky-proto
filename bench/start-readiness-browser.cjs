const assert=require('node:assert/strict'),fs=require('node:fs'),{spawn}=require('node:child_process'),{chromium}=require('playwright');
const base='http://127.0.0.1:8796/',out='browser-evidence/start-readiness';fs.mkdirSync(out,{recursive:true});
const deferred=()=>{let release;const promise=new Promise(r=>release=r);return{promise,release}};
(async()=>{let browser,server;const results=[];try{
 server=spawn('python3',['-m','http.server','8796','--bind','127.0.0.1'],{stdio:'ignore'});
 for(let i=0;i<60;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const touch of [false,true])for(const map of ['index.html','canyon.html']){
  const ctx=await browser.newContext({viewport:touch?{width:844,height:390}:{width:1280,height:720},hasTouch:touch,isMobile:touch});
  await ctx.addInitScript(()=>window.__hold=true);const human=deferred(),gun=deferred();let posts=0;const errors=[];
  await ctx.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==new URL(base).origin){if(route.request().method()==='POST')posts++;return route.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"service":"gunrun-runs","recordProtocol":2,"top":[],"total":0,"me":null}'});}
   if(u.pathname.endsWith('human-gunrun-animated.glb.gz')||u.pathname.endsWith('human-gunrun.glb'))await human.promise;
   if(u.pathname.endsWith('hg-meshy-low.glb'))await gun.promise;
   return route.continue();});
  const page=await ctx.newPage();page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.message));
  // Asset requests are deliberately pending; waiting for window.load is unnecessary.
  await page.goto(base+map,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.skyStartReadiness&&window.skyHumanView&&document.body.dataset.skyGameExtensionsReady==='true');
  const blocked=await page.evaluate(()=>({mode:__game.mode,phase:skyStartReadiness.state,normal:document.getElementById('bStart').disabled,intro:document.getElementById('bIntro').disabled}));
  assert.equal(blocked.mode,'menu');assert.equal(blocked.normal,true);assert.equal(blocked.intro,true);assert.match(blocked.phase.message,/人物/);
  await page.evaluate(()=>document.getElementById('bStart').dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true})));
  assert.equal(await page.evaluate(()=>__game.mode),'menu','a queued click cannot start incomplete presentation');
  human.release();await page.waitForFunction(()=>document.body.dataset.skyHumanLoaded==='true');
  assert.equal(await page.locator('#bStart').isDisabled(),true);assert.match(await page.locator('#startReadyStatus').innerText(),/銃/);
  gun.release();await page.waitForFunction(()=>window.skyStartReadiness?.ready&&!document.getElementById('bStart').disabled);
  const click=async selector=>{if(touch)await page.locator(selector).tap();else await page.locator(selector).click()};
  const state=()=>page.evaluate(()=>{__game.frameOnce(0);const held=__skyInternals.ue.getObjectByName('Unity human held weapon');let model=false;held?.traverse(n=>{if(n.name==='Meshy HG mobile LOD')model=true});return{mode:__game.mode,id:skyChallenge.id,life:__game.P.life,hud:document.getElementById('hLife').textContent,view:skyHumanView.view,renderedView:document.body.dataset.skyHumanView,model,held:held?.visible,audio:__skyInternals.Ut.ctx?.state,t:__game.GAME.t,history:skyRunRecording.history.length}});
  await click('#bStart');const normal=await state();assert.equal(normal.mode,'play');assert.equal(normal.id,'normal');assert.equal(normal.life,5);assert.equal(normal.view,'third');assert.equal(normal.model,true);assert.equal(normal.held,true);assert.equal(normal.audio,'running');
  await click('#bSettings');assert.equal((await state()).mode,'pause');await click('#bResume');assert.equal((await state()).mode,'play');
  await click('#bSettings');await click('#bRestart');assert.equal((await state()).life,5);
  await click('#bSettings');await click('#bMenu');await page.waitForFunction(()=>__game.mode==='menu');
  // The settings panel opened before play must return to the home screen.
  await click('#bSettings');await click('#bResume');assert.equal((await state()).mode,'menu');
  await click('#bIntro');const intro=await state();assert.equal(intro.mode,'play');assert.equal(intro.id,'intro');assert.equal(intro.hud,'∞');assert.equal(intro.view,'third');assert.equal(intro.model,true);assert.equal(intro.held,true);
  await page.evaluate(()=>{__game.GAME.t=119.98;__game.advance(.04);__game.advance(.04);__game.advance(1.5)});
  await page.waitForFunction(()=>__game.mode==='over');await click('#unityRetry');assert.equal((await state()).id,'intro');assert.equal((await state()).hud,'∞');
  await click('#bSettings');await click('#bMenu');await page.waitForFunction(()=>__game.mode==='menu');await click('#bStart');const afterIntro=await state();assert.equal(afterIntro.id,'normal');assert.equal(afterIntro.life,5);
  assert.equal(intro.history,afterIntro.history,'intro must not create a stored record');assert.equal(posts,0,'no test records go to the public endpoint');assert.deepEqual(errors,[]);
  await page.screenshot({path:`${out}/${map}-${touch?'touch':'desktop'}.png`});results.push({map,touch,blocked,normal,intro,afterIntro,posts,errors});console.log('PASS',map,touch?'touch':'desktop','cold load, normal, pause/resume/restart, pre-run settings, intro/retry and normal return');await ctx.close();
 }
 // A failed gun request must offer recovery instead of a dead-looking Start button.
 const ctx=await browser.newContext(),page=await ctx.newPage();await ctx.addInitScript(()=>window.__hold=true);let fail=true;
 await ctx.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==new URL(base).origin)return route.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0}'});if(fail&&u.pathname.endsWith('hg-meshy-low.glb'))return route.fulfill({status:404,body:'missing'});return route.continue()});
 await page.goto(base+'index.html');await page.waitForFunction(()=>window.skyStartReadiness?.state.phase==='error');assert.equal(await page.locator('#bStart').isDisabled(),true);assert.match(await page.locator('#startReadyStatus').innerText(),/銃/);fail=false;await page.locator('[data-retry-start]').first().click();await page.waitForFunction(()=>window.skyStartReadiness?.ready,null,{timeout:90000});await page.locator('#bStart').click();assert.equal(await page.evaluate(()=>__game.mode),'play');results.push({failure:'HG 404',reloadRecovered:true});await ctx.close();
 fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));
}finally{await browser?.close();server?.kill()}})().catch(e=>{console.error(e);process.exitCode=1});
