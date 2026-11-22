const assert=require('node:assert/strict'),fs=require('node:fs'),{spawn}=require('node:child_process'),{chromium}=require('playwright');
const {revealHomeControl}=require('./home-controls.cjs');
const base='http://127.0.0.1:8796/',out='browser-evidence/start-readiness';fs.mkdirSync(out,{recursive:true});
const deferred=()=>{let release;const promise=new Promise(r=>release=r);return{promise,release}};
(async()=>{let browser,server;const results=[];try{
 server=spawn('python3',['-m','http.server','8796','--bind','127.0.0.1'],{stdio:'ignore'});
 for(let i=0;i<60;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100));}
 for(const file of ['index.html','canyon.html','challenge-score.js'])assert.equal(await fetch(base+file).then(r=>r.text()),fs.readFileSync(file,'utf8'),'local server source: '+file);
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const touch of [false,true])for(const map of ['index.html','canyon.html']){
  const ctx=await browser.newContext({locale:'ja-JP',viewport:touch?{width:844,height:390}:{width:1280,height:720},hasTouch:touch,isMobile:touch});
  await ctx.addInitScript(()=>window.__hold=true);const human=deferred(),gun=deferred(),feedback=deferred();let posts=0;const errors=[];
  await ctx.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==new URL(base).origin){if(route.request().method()==='POST')posts++;return route.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"service":"gunrun-runs","recordProtocol":2,"top":[],"total":0,"me":null}'});}
   if(u.pathname.endsWith('human-gunrun-animated.glb.gz')||u.pathname.endsWith('human-gunrun.glb'))await human.promise;
   if(u.pathname.endsWith('hg-meshy-low.glb'))await gun.promise;
   if(u.pathname.endsWith('/combat-feedback/Kill.flac'))await feedback.promise;
   return route.continue();});
  const page=await ctx.newPage();page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.message));
  // Asset requests are deliberately pending; waiting for window.load is unnecessary.
  await page.goto(base+map,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.skyStartReadiness&&window.skyHumanView&&document.body.dataset.skyGameExtensionsReady==='true');
  const blocked=await page.evaluate(()=>({mode:__game.mode,phase:skyStartReadiness.state,normal:document.getElementById('bStart').disabled}));
  assert.equal(blocked.mode,'menu');assert.equal(blocked.normal,true);assert.match(blocked.phase.message,/人物/);
  await page.evaluate(()=>document.getElementById('bStart').dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true})));
  assert.equal(await page.evaluate(()=>__game.mode),'menu','a queued click cannot start incomplete presentation');
  human.release();await page.waitForFunction(()=>document.body.dataset.skyHumanLoaded==='true');
  assert.equal(await page.locator('#bStart').isDisabled(),true);assert.match(await page.locator('#startReadyStatus').innerText(),/銃/);
  gun.release();await page.waitForFunction(()=>document.body.dataset.skyZombieReady==='true'&&window.__skyUpgrade?.loaded?.hg);
  assert.equal(await page.locator('#bStart').isDisabled(),true);assert.match(await page.locator('#startReadyStatus').innerText(),/演出/);feedback.release();
  await page.waitForFunction(()=>window.skyStartReadiness?.ready&&!document.getElementById('bStart').disabled);
  const click=async selector=>{
   // A locked desktop pointer targets the canvas. Use the real PC pause key;
   // touch users open the same panel with its on-screen button.
   if(selector==='#bSettings'&&await page.evaluate(()=>__game.mode==='menu')&&await page.locator('#homeSettings').isVisible())selector='#homeSettings';
   if(selector==='#bSettings'&&!touch&&await page.evaluate(()=>__game.mode==='play')){
    await page.keyboard.press('p');await page.waitForFunction(()=>__game.mode==='pause'&&!document.pointerLockElement);return;
   }
   await revealHomeControl(page,selector);
   if(touch)await page.locator(selector).tap();else await page.locator(selector).click();
  };
  const state=()=>page.evaluate(()=>{__game.frameOnce(0);const held=__skyInternals.ue.getObjectByName('Unity human held weapon');let model=false;held?.traverse(n=>{if(n.name==='Meshy HG mobile LOD')model=true});return{mode:__game.mode,id:skyChallenge.id,life:__game.P.life,hud:document.getElementById('hLife').textContent,view:skyHumanView.view,renderedView:document.body.dataset.skyHumanView,model,held:held?.visible,audio:__skyInternals.Ut.ctx?.state,t:__game.GAME.t,history:skyRunRecording.history.length}});
  await click('#bStart');const normal=await state();assert.equal(normal.mode,'play');assert.equal(normal.id,'normal');assert.equal(normal.life,5);assert.equal(normal.view,'third');assert.equal(normal.model,true);assert.equal(normal.held,true);assert.equal(normal.audio,'running');
  await click('#bSettings');assert.equal((await state()).mode,'pause');await click('#bResume');assert.equal((await state()).mode,'play');
  await click('#bSettings');await click('#bRestart');assert.equal((await state()).life,5);
  await click('#bSettings');await click('#bMenu');await page.waitForFunction(()=>__game.mode==='menu');
  // The settings panel opened before play must return to the home screen.
  await click('#bSettings');await click('#bResume');assert.equal((await state()).mode,'menu');
  // 2回目のラン：群れの上限、時間切れのリザルト、「もう一度」、ホームへの戻り。
  await click('#bStart');await page.evaluate(()=>{__game.S.sendLog=false});const second=await state();assert.equal(second.mode,'play');assert.equal(second.id,'normal');assert.equal(second.life,5);assert.equal(second.view,'third');assert.equal(second.model,true);assert.equal(second.held,true);
  assert.equal(await page.evaluate(()=>__skyInternals.Jt.filter(e=>!e.dead).length),4,'normal initially spawns four pursuers');
  const population=await page.evaluate(()=>{
   const g=__game,rows=[];
   for(const t of [0,40,80]){g.GAME.t=t;for(let i=0;i<20;i++)g.spawnZombie(12);rows.push({t,alive:__skyInternals.Jt.filter(e=>!e.dead).length,rendered:__skyInternals.Jt.length,cap:skyChallenge.cap(0)});}
   g.GAME.t=0;return rows;
  });
  assert.deepEqual(population.map(r=>r.cap),[4,5,6]);assert.deepEqual(population.map(r=>r.alive),[4,5,6]);assert.ok(population.every(r=>r.rendered<=6));
  await page.evaluate(()=>{__game.P.invuln=Infinity;__game.GAME.t=119.98;__game.advance(.04);__game.advance(.04);__game.advance(1.5)});
  await page.waitForFunction(()=>__game.mode==='over');await click('#unityRetry');assert.equal((await state()).id,'normal');assert.equal((await state()).life,5);assert.equal(await page.evaluate(()=>__skyInternals.Jt.filter(e=>!e.dead).length),4,'retry starts with four pursuers');
  await click('#bSettings');await click('#bMenu');await page.waitForFunction(()=>__game.mode==='menu');await click('#bStart');const afterRetry=await state();assert.equal(afterRetry.id,'normal');assert.equal(afterRetry.life,5);
  assert.equal(posts,0,'no test records go to the public endpoint');assert.deepEqual(errors,[]);
  await page.screenshot({path:`${out}/${map}-${touch?'touch':'desktop'}.png`});results.push({map,touch,blocked,normal,second,population,afterRetry,posts,errors});console.log('PASS',map,touch?'touch':'desktop','cold load, normal, pause/resume/restart, pre-run settings, population, time-up result/retry and home return');await ctx.close();
 }
 // A failed gun request must offer recovery instead of a dead-looking Start button.
 const ctx=await browser.newContext({locale:'ja-JP'}),page=await ctx.newPage();await ctx.addInitScript(()=>window.__hold=true);let fail='gun';
 await ctx.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==new URL(base).origin)return route.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0}'});if((fail==='gun'&&u.pathname.endsWith('hg-meshy-low.glb'))||(fail==='feedback'&&u.pathname.endsWith('/combat-feedback/Kill.flac')))return route.fulfill({status:404,body:'missing'});return route.continue()});
 await page.goto(base+'index.html');await page.waitForFunction(()=>window.skyStartReadiness?.state.phase==='error');assert.equal(await page.locator('#bStart').isDisabled(),true);assert.match(await page.locator('#startReadyStatus').innerText(),/銃/);fail=false;await page.locator('[data-retry-start]').first().click();await page.waitForFunction(()=>window.skyStartReadiness?.ready,null,{timeout:90000});await page.locator('#bStart').click();assert.equal(await page.evaluate(()=>__game.mode),'play');results.push({failure:'HG 404',reloadRecovered:true});
 fail='feedback';await page.reload();await page.waitForFunction(()=>window.skyStartReadiness?.state.phase==='error');assert.match(await page.locator('#startReadyStatus').innerText(),/演出/);assert.equal(await page.locator('#bStart').isDisabled(),true);
 fail=false;await page.locator('[data-retry-start]').first().click();await page.waitForFunction(()=>window.skyStartReadiness?.ready,null,{timeout:90000});await page.locator('#bStart').click();assert.equal(await page.evaluate(()=>__game.mode),'play');results.push({failure:'feedback sample 404',reloadRecovered:true});await ctx.close();
 fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));
}finally{await browser?.close();server?.kill()}})().catch(e=>{console.error(e);process.exitCode=1});
