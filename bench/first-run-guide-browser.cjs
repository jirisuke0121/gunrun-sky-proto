// First-run lights (first-run-guide.js): clock lit at the first real run, multipliers lit at the next home screen,
// Easy preselected for a first-timer who goes home after the intro run. Each shows once. Controlled browser checks,
// not a human first-time-player test. SKY_SHOT_DIR=/tmp/x also saves screenshots.
const assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {chromium}=require('playwright');
const port=Number(process.env.SKY_TEST_PORT||18811),base=`http://127.0.0.1:${port}/`,shots=process.env.SKY_SHOT_DIR;
(async()=>{let browser,server;try{
 server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});
 for(let i=0;i<60;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100))}
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const mk=async touch=>{const ctx=await browser.newContext({locale:'ja-JP',viewport:touch?{width:844,height:390}:{width:1280,height:720},hasTouch:touch,isMobile:touch});
  await ctx.addInitScript(()=>window.__hold=true);
  await ctx.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0}'}));return ctx};
 const open=async(ctx,url)=>{const page=await ctx.newPage();page.setDefaultTimeout(60000);page.errors=[];page.on('pageerror',e=>page.errors.push(e.message));
  await page.goto(base+url);await page.waitForFunction(()=>window.__game&&window.skyStartReadiness?.ready);return page};
 const kind=page=>page.evaluate(()=>window.skyFirstRunGuide.kind);
 const state=page=>page.evaluate(()=>window.skyFirstRunGuide.state);
 const wait=(page,k)=>page.waitForFunction(k=>window.skyFirstRunGuide.kind===k,k,{timeout:8000});
 const settled=page=>page.waitForFunction(()=>document.getElementById('unityResultCard').dataset.complete==='true');
 const shot=async(page,name)=>{if(shots)await page.screenshot({path:`${shots}/${name}.png`})};
 const endRun=async(page,reason='caught')=>{await page.evaluate(r=>{__game.endGame(r);__game.advance(1.5)},reason);await settled(page)};
 const litBoxes=page=>page.evaluate(()=>[...document.querySelectorAll('#firstRunGuide .fg-ring')].map(r=>r.getBoundingClientRect()).map(r=>({x:r.x,y:r.y,w:r.width,h:r.height})));
 for(const touch of [false,true]){
  const label=touch?'touch':'desktop';
  for(const map of ['index.html','canyon.html']){
   const tag=`${map.split('.')[0]}-${label}`;
   // ---- A first-timer: card -> intro -> home (not 本番イージー) -> Easy preselected -> first real run -> home ----
   let ctx=await mk(touch),page=await open(ctx,map+'?onboarding=auto');
   assert.deepEqual(await state(page),{},`${tag}: a first-timer starts with nothing shown`);
   await page.click('#onbStart');await page.waitForFunction(()=>__game.mode==='play');
   assert.equal(await kind(page),null,`${tag}: the intro run gets no mission light`);
   await endRun(page);
   assert.equal((await state(page)).introDone,1,`${tag}: the intro result is remembered`);
   await page.waitForTimeout(2000);if(await page.evaluate(()=>!document.getElementById('onboarding').hidden))await page.click('#onbMain');
   await page.click('#unityMenu');await page.waitForFunction(()=>__game.mode==='menu');await page.waitForTimeout(700);
   assert.equal(await page.evaluate(()=>document.getElementById('challengeDifficulty').value),'easy',`${tag}: Easy is preselected after the intro`);
   assert.equal(await page.evaluate(()=>skyChallenge.selected),'easy');
   assert.equal(await kind(page),null,`${tag}: the multiplier light waits for a real run`);
   await page.click('#bStart');await page.waitForFunction(()=>__game.mode==='play'&&skyChallenge.id==='easy'&&!skyChallenge.isIntroRun);
   await wait(page,'mission');
   const clock=await page.evaluate(()=>{const r=document.querySelector('#unityScoreHud .unity-counter').getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}});
   const rings=await litBoxes(page);assert.equal(rings.length,1,`${tag}: one ring`);
   assert.ok(rings[0].x<=clock.x&&rings[0].y<=clock.y&&rings[0].x+rings[0].w>=clock.x+clock.w&&rings[0].y+rings[0].h>=clock.y+clock.h,`${tag}: the ring surrounds the clock`);
   assert.match(await page.textContent('#firstRunGuide h2'),/2分間、生き残れ/);
   assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('firstRunGuide')).pointerEvents),'none',`${tag}: the mission light never blocks play`);
   await shot(page,`${tag}-mission`);
   assert.equal((await state(page)).mission,1);
   await page.waitForFunction(()=>window.skyFirstRunGuide.kind===null,null,{timeout:9000});
   await endRun(page);await page.click('#unityMenu');await page.waitForFunction(()=>__game.mode==='menu');
   await wait(page,'bonus');
   const lit=await litBoxes(page);assert.equal(lit.length,3,`${tag}: Easy, Normal and Hard multipliers are lit`);
   const texts=await page.evaluate(()=>['easy','normal','hard'].map(id=>document.querySelector(`#homeDifficulty button[data-difficulty="${id}"] strong b`).textContent));
   assert.deepEqual(texts,['×1.0','×1.1','×1.2']);
   assert.match(await page.textContent('#firstRunGuide h2'),/難しいほど/);
   const card=await page.evaluate(()=>{const r=document.querySelector('#firstRunGuide .fg-card').getBoundingClientRect(),a=document.getElementById('app').getBoundingClientRect();return{top:r.top-a.top,bottom:r.bottom-a.top,h:a.height}});
   assert.ok(card.top>=0&&card.bottom<=card.h,`${tag}: the card stays on screen (${JSON.stringify(card)})`);
   await shot(page,`${tag}-bonus`);
   await page.click('#firstRunGuide .fg-ok');assert.equal(await kind(page),null);
   assert.equal((await state(page)).bonus,1);
   await page.waitForTimeout(800);assert.equal(await kind(page),null,`${tag}: shown once`);
   await page.reload();await page.waitForFunction(()=>window.__game&&window.skyStartReadiness?.ready);await page.waitForTimeout(800);
   assert.equal(await kind(page),null,`${tag}: nothing again after a reload`);
   assert.deepEqual(page.errors,[],`${tag}: no page errors`);await ctx.close();

   // ---- 本番イージー straight from the intro result (the normal path) also gets the mission light ----
   ctx=await mk(touch);page=await open(ctx,map+'?onboarding=auto');
   await page.click('#onbStart');await page.waitForFunction(()=>__game.mode==='play');
   await page.evaluate(()=>{__game.GAME.t=75});await page.waitForTimeout(450);await endRun(page);
   assert.ok(await page.evaluate(()=>document.getElementById('introNext').classList.contains('is-recommended')));
   await page.waitForTimeout(2000);if(await page.evaluate(()=>!document.getElementById('onboarding').hidden))await page.click('#onbMain');
   await page.click('#introNext');await page.waitForFunction(()=>__game.mode==='play'&&skyChallenge.id==='easy'&&!skyChallenge.isIntroRun);
   await wait(page,'mission');await ctx.close();

   // ---- Returning players and automated browsers are not interrupted ----
   ctx=await mk(touch);page=await open(ctx,map);
   assert.deepEqual(await state(page),{mission:1,bonus:1,easy:1},`${tag}: not a first-timer -> everything marked as seen`);
   await page.click('#bStart');await page.waitForFunction(()=>__game.mode==='play');await page.waitForTimeout(600);
   assert.equal(await kind(page),null);await endRun(page);await page.click('#unityMenu');await page.waitForTimeout(800);assert.equal(await kind(page),null);await ctx.close();
   ctx=await mk(touch);page=await open(ctx,map+'?firstGuide=1');
   assert.deepEqual(await state(page),{},`${tag}: ?firstGuide=1 forces the guide`);await ctx.close();
  }
 }
 // ---- The light is translated like the rest of the screen ----
 for(const [lang,mission,bonus] of [['en',/Mission: survive for 2 minutes/,/bigger the score bonus/],['th',/ภารกิจ/,/โบนัสคะแนน/]]){
  const ctx=await mk(false),page=await open(ctx,`index.html?onboarding=auto&lang=${lang}`);
  await page.click('#onbStart');await page.waitForFunction(()=>__game.mode==='play');await endRun(page);
  await page.waitForTimeout(2000);if(await page.evaluate(()=>!document.getElementById('onboarding').hidden))await page.click('#onbMain');
  await page.click('#introNext');await page.waitForFunction(()=>__game.mode==='play'&&!skyChallenge.isIntroRun);await wait(page,'mission');
  await page.waitForTimeout(300);assert.match(await page.textContent('#firstRunGuide h2'),mission,`${lang}: mission title`);
  await endRun(page);await page.click('#unityMenu');await wait(page,'bonus');await page.waitForTimeout(300);
  assert.match(await page.textContent('#firstRunGuide h2'),bonus,`${lang}: bonus title`);
  assert.equal(/[぀-ヿ一-鿿]/.test(await page.textContent('#firstRunGuide')),false,`${lang}: no Japanese left in the light`);
  await ctx.close();
 }
 console.log('first-run-guide browser ok');
}finally{await browser?.close();server?.kill()}})().catch(e=>{console.error(e);process.exit(1)});
