// First visit (NIGHTLINE-style first drive): start card -> intro run with coach tips -> one-time nickname prompt.
// Controlled browser checks, not a human first-time-player test.
const assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {chromium}=require('playwright');
const port=Number(process.env.SKY_TEST_PORT||18806),base=`http://127.0.0.1:${port}/`;
(async()=>{let browser,server;try{
 server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});
 for(let i=0;i<60;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100))}
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const open=async(ctx,url)=>{const page=await ctx.newPage();page.setDefaultTimeout(60000);page.errors=[];page.on('pageerror',e=>page.errors.push(e.message));
  await page.goto(base+url);await page.waitForFunction(()=>window.__game&&window.skyStartReadiness?.ready);return page};
 const splash=page=>page.locator('#onbSplash').isVisible();
 const dialog=page=>page.evaluate(()=>!document.getElementById('onboarding').hidden);
 const mk=async(lang,touch,seed)=>{const ctx=await browser.newContext({locale:lang==='ja'?'ja-JP':'en-US',viewport:touch?{width:844,height:390}:{width:1280,height:720},hasTouch:touch,isMobile:touch});
  await ctx.addInitScript(()=>window.__hold=true);if(seed)await ctx.addInitScript(seed);
  let posts=0;await ctx.route('https://**/*',r=>{if(r.request().method()==='POST')posts++;return r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0}'})});ctx.posts=()=>posts;return ctx};
 const coachText=page=>page.evaluate(()=>{const c=document.getElementById('introCoach');return c.hidden?null:[...c.children].find(e=>getComputedStyle(e).display!=='none').textContent});
 const at=async(page,t)=>{await page.evaluate(t=>{__game.GAME.t=t},t);await page.waitForTimeout(450)};
 const endIntro=async page=>{await page.evaluate(()=>{__game.endGame('caught');__game.advance(1.5)});await page.waitForFunction(()=>document.getElementById('unityResultCard').dataset.complete==='true')};
 for(const map of ['index.html','canyon.html']){
  // Automated browsers are not interrupted by default.
  let ctx=await mk('ja',false),page=await open(ctx,map);
  assert.equal(await splash(page),false,'automation skips the first-visit card by default');
  assert.equal(await page.locator('#introEntry').isVisible(),true,'automated browsers keep the home intro block');
  assert.equal(await page.locator('#homeGuide').isVisible(),true);await ctx.close();

  // First visit: the start card replaces the home screen, there is no form and no skip.
  ctx=await mk('ja',false);page=await open(ctx,map+'?onboarding=auto');
  assert.equal(await splash(page),true,'first visit shows the start card');
  assert.equal(await page.locator('#onbName').isVisible(),false,'no nickname field up front');
  assert.equal(await dialog(page),false);
  assert.equal(await page.textContent('#onbStartLabel'),'タップしてスタート');
  assert.equal(await page.evaluate(()=>localStorage.getItem('gunrun-onboarding-v1')),null,'not recorded until the player starts');
  await page.click('#onbStart');
  await page.waitForFunction(()=>__game.mode==='play');
  assert.equal(await page.evaluate(()=>skyChallenge.isIntroRun),true,'the card leads straight into the intro run');
  assert.equal(await splash(page),false);
  assert.equal(JSON.parse(await page.evaluate(()=>localStorage.getItem('gunrun-onboarding-v1'))).phase,'started');
  assert.equal(await page.evaluate(()=>localStorage.getItem('gunrun-name')),null,'name is not asked before playing');
  // Coach: one line per scene.
  await at(page,2);assert.match(await coachText(page),/W A S D で移動/);
  await at(page,12);assert.match(await coachText(page),/マウスで視点/);
  await at(page,25);assert.match(await coachText(page),/フック/);
  await at(page,45);assert.match(await coachText(page),/銃は自動/);
  await at(page,60);assert.equal(await coachText(page),null,'the coach goes away after the first minute');
  // After the run: the nickname is asked once; "あとで" skips it.
  await endIntro(page);
  await page.waitForFunction(()=>!document.getElementById('onboarding').hidden,null,{timeout:8000});
  assert.equal(await page.evaluate(()=>document.getElementById('onboarding').dataset.mode),'name');
  assert.equal(await page.textContent('#onbTitle'),'ニックネームを決めよう');
  assert.equal(await page.locator('.onb-steps').isVisible(),false,'only the name is asked');
  await page.fill('#onbName','a');await page.click('#onbSave');
  assert.equal(await dialog(page),true,'a bad name keeps the prompt open');assert.match(await page.textContent('#onbError'),/2〜14文字/);
  await page.fill('#onbName','');await page.click('#onbMain');assert.equal(await dialog(page),false,'あとで skips it');
  assert.equal(await page.evaluate(()=>localStorage.getItem('gunrun-name')),null);
  assert.equal(JSON.parse(await page.evaluate(()=>localStorage.getItem('gunrun-onboarding-v1'))).namePrompted,true);
  assert.deepEqual(page.errors,[]);assert.equal(ctx.posts(),0,'nothing is uploaded by the first visit');
  // Not asked again after another intro run.
  await page.click('#unityMenu');await page.waitForFunction(()=>__game.mode==='menu');
  await page.click('#homeGuide');await page.click('#onbIntro');await page.waitForFunction(()=>__game.mode==='play');
  await endIntro(page);await page.waitForTimeout(2600);assert.equal(await dialog(page),false,'the prompt appears only once');
  await ctx.close();

  // Saving a name after the first run.
  ctx=await mk('ja',false);page=await open(ctx,map+'?onboarding=auto');
  await page.click('#onbStart');await page.waitForFunction(()=>__game.mode==='play');await endIntro(page);
  await page.waitForFunction(()=>!document.getElementById('onboarding').hidden,null,{timeout:8000});
  await page.fill('#onbName','ｒunner_1');await page.click('#onbSave');
  assert.equal(await dialog(page),false);assert.equal(await page.evaluate(()=>localStorage.getItem('gunrun-name')),'RUNNER_1');
  // Returning: no card, home intro block gone, 遊び方 offers the controls, the name and the intro run.
  await page.close();page=await open(ctx,map+'?onboarding=auto');
  assert.equal(await splash(page),false,'seen once, never again');
  assert.equal(await page.locator('#introEntry').isVisible(),false,'after the first visit the home screen has no intro button');
  await page.click('#homeGuide');assert.equal(await page.evaluate(()=>document.getElementById('onboarding').dataset.mode),'again');
  assert.equal(await page.inputValue('#onbName'),'RUNNER_1');assert.equal(await page.locator('.onb-steps').isVisible(),true);
  assert.equal(await page.textContent('#onbIntro'),'入門モードで練習する');assert.equal(await page.locator('#onbSettings').isVisible(),true);
  await page.click('#onbMain');assert.equal(await dialog(page),false);
  await page.click('#homeGuide');await page.click('#onbIntro');await page.waitForFunction(()=>__game.mode==='play');
  assert.equal(await page.evaluate(()=>skyChallenge.isIntroRun),true);
  await ctx.close();

  // Anyone with a trace of earlier play is not a first-time player.
  for(const seed of [()=>localStorage.setItem('gunrun-run-history-v1',JSON.stringify([{clientRunId:'x'}])),()=>localStorage.setItem('gunrun-sky-ghost-v1','{}'),()=>localStorage.setItem('gunrun-challenge-difficulty-v1','hard')]){
   ctx=await mk('ja',false,seed);page=await open(ctx,map+'?onboarding=auto');
   assert.equal(await splash(page),false,'existing players are not interrupted');
   assert.equal(await page.locator('#introEntry').isVisible(),false);await ctx.close();
  }
  // Special entries (practice etc.) never get the card.
  ctx=await mk('ja',false);page=await open(ctx,map+'?onboarding=auto&oldtown_swing=1');assert.equal(await splash(page),false);await ctx.close();

  // Phone landscape, English: the card fits, the coach is translated, touch wording is used.
  ctx=await mk('en',true);page=await open(ctx,map+'?onboarding=auto');
  const box=await page.evaluate(()=>{const c=document.querySelector('.onb-splash-card').getBoundingClientRect();return{top:c.top,bottom:c.bottom,h:innerHeight}});
  assert.ok(box.top>=0&&box.bottom<=box.h,'start card fits a 390px-high phone');
  const b=await page.locator('#onbStart').boundingBox();assert.ok(b&&b.y>=0&&b.y+b.height<=box.h,'start button inside the screen');
  assert.equal(await page.textContent('#onbStartLabel'),'Tap to start');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('#onbSplash .onb-pc')).display),'none','keyboard wording hidden on touch');
  await page.tap('#onbStart');await page.waitForFunction(()=>__game.mode==='play');
  await at(page,2);assert.equal(await coachText(page),'Drag left to move · Jump button to jump');
  assert.deepEqual(page.errors,[]);await ctx.close();
  console.log('PASS',map,'start card, straight into the intro run, coach tips, one-time nickname prompt, returning player, phone/English');
 }
}finally{await browser?.close();server?.kill()}})().catch(e=>{console.error(e);process.exitCode=1});
