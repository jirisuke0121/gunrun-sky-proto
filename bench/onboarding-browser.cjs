// First visit (NIGHTLINE-style first drive): start card -> 入門 course (canyon.html?learn=1) -> first real run -> one-time nickname prompt.
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
 const ready=page=>page.waitForFunction(()=>window.__game&&window.skyStartReadiness?.ready);
 const endRun=async(page,t=40)=>{await page.evaluate(t=>{__game.GAME.t=t;__game.endGame('caught');__game.advance(1.5)},t);await page.waitForFunction(()=>document.getElementById('unityResultCard').dataset.complete==='true')};
 // The course itself is covered by guided-intro-browser.cjs; here only its entrance (the control choice is on screen) is checked.
 const inCourse=async page=>{await page.waitForURL(/canyon\.html\?.*learn=1/,{timeout:60000});await page.waitForFunction(()=>window.skyGuidedIntro?.choice==='choose'&&__game.mode==='play',null,{timeout:90000})};
 for(const map of ['index.html','canyon.html']){
  // Automated browsers are not interrupted by default. The old in-map intro run (and its home block) is gone.
  let ctx=await mk('ja',false),page=await open(ctx,map);
  assert.equal(await splash(page),false,'automation skips the first-visit card by default');
  assert.equal(await page.locator('#introEntry,#bIntro,#introSkip,#introNext,#ctrlPick').count(),0,'nothing of the old intro run is left on the page');
  if(map==='index.html'){assert.equal(await page.locator('#homeDevelopment').isVisible(),false,'the development tab is hidden without ?dev=1');assert.equal(await page.locator('#homeCredits').isVisible(),true,'the credits link stays on the home screen for players');}
  assert.equal(await page.locator('#homeGuide').isVisible(),true);
  await page.click('#bStart');await page.waitForFunction(()=>__game.mode==='play');await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>skyChallenge.id),'normal','the home start button starts the selected difficulty');
  // An ordinary result card: the old intro-only buttons do not exist.
  await endRun(page);
  assert.equal(await page.textContent('#unityRetry'),'もう一度逃げる');assert.equal(await page.locator('#introNext,#unityAdvicePerf').count(),0);
  assert.deepEqual(page.errors,[]);await ctx.close();

  // A real (non-automated) browser gets the first-visit card with no URL flag; blocked storage never traps it in a loop.
  ctx=await mk('ja',false,()=>Object.defineProperty(navigator,'webdriver',{get:()=>false}));page=await open(ctx,map);
  assert.equal(await splash(page),true,'a real first visit gets the start card without any URL flag');
  assert.equal(await page.locator('#bGuidedIntro').isVisible(),false,'the development tab stays collapsed');await ctx.close();
  ctx=await mk('ja',false,()=>{Object.defineProperty(navigator,'webdriver',{get:()=>false});const f=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='__sky_probe')throw new DOMException('blocked','SecurityError');return f.call(this,k,v)}});
  page=await open(ctx,map);assert.equal(await splash(page),false,'storage that cannot remember the visit skips the card');
  assert.equal(await page.locator('#homeGuide').isVisible(),true,'the course stays reachable from コツ');await ctx.close();

  // First visit: the start card replaces the home screen, there is no form and no skip.
  ctx=await mk('ja',false);page=await open(ctx,map+'?onboarding=auto');
  assert.equal(await splash(page),true,'first visit shows the start card');
  assert.equal(await page.locator('#onbName').isVisible(),false,'no nickname field up front');
  assert.equal(await dialog(page),false);
  assert.equal(await page.textContent('#onbStartLabel'),'タップしてスタート');
  assert.equal(await page.textContent('.onb-splash-intro'),'ゾンビから2分間逃げろ。');assert.match(await page.textContent('.onb-splash-sub'),/銃・アイテム・地形/);assert.equal(await page.locator('#onbSplash kbd').count(),0,'controls are not explained on the start card (they are chosen on the next screen)');
  assert.equal(await page.evaluate(()=>localStorage.getItem('gunrun-onboarding-v1')),null,'not recorded until the player starts');
  await page.click('#onbStart');
  await inCourse(page);
  assert.equal(await page.evaluate(()=>new URLSearchParams(location.search).get('return')),map==='index.html'?'town':'canyon','the course returns to the map it was opened from');
  assert.equal(JSON.parse(await page.evaluate(()=>localStorage.getItem('gunrun-onboarding-v1'))).phase,'started');
  assert.equal(await page.evaluate(()=>localStorage.getItem('gunrun-name')),null,'name is not asked before playing');
  assert.deepEqual(page.errors,[]);assert.equal(ctx.posts(),0,'nothing is uploaded by the first visit');
  // Leaving the course goes back to the map with Easy selected; the first real run ends with the one-time nickname prompt.
  await page.evaluate(()=>skyGuidedIntro.finish());await page.waitForURL(new RegExp(map.replace('.','\\.')+'\\?.*learned=1'),{timeout:60000});await ready(page);
  assert.equal(await splash(page),false);
  await page.waitForFunction(()=>document.getElementById('challengeDifficulty').value==='easy');
  assert.equal(JSON.parse(await page.evaluate(()=>localStorage.getItem('gunrun-onboarding-v1'))).phase,'complete');
  await page.click('#bStart');await page.waitForFunction(()=>__game.mode==='play');
  assert.equal(await page.evaluate(()=>skyChallenge.id),'easy','the run after the course is a real Easy run');
  assert.equal(await dialog(page),false,'no nickname prompt while the post-course run is going');
  await endRun(page);
  await page.waitForFunction(()=>!document.getElementById('onboarding').hidden,null,{timeout:8000});
  assert.equal(await page.evaluate(()=>document.getElementById('onboarding').dataset.mode),'name');
  assert.equal(await page.textContent('#onbTitle'),'ニックネームを決めよう');
  assert.equal(await page.locator('.onb-steps').isVisible(),false,'only the name is asked');
  await page.fill('#onbName','a');await page.click('#onbSave');
  assert.equal(await dialog(page),true,'a bad name keeps the prompt open');assert.match(await page.textContent('#onbError'),/2〜14文字/);
  await page.fill('#onbName','');await page.click('#onbMain');assert.equal(await dialog(page),false,'あとで skips it');
  assert.equal(await page.evaluate(()=>localStorage.getItem('gunrun-name')),null);
  assert.equal(JSON.parse(await page.evaluate(()=>localStorage.getItem('gunrun-onboarding-v1'))).namePrompted,true);
  // Not asked again after another run.
  await page.click('#unityRetry');await page.waitForFunction(()=>__game.mode==='play'&&__game.GAME.t<5);
  await endRun(page);await page.waitForTimeout(2600);assert.equal(await dialog(page),false,'the prompt appears only once');
  assert.deepEqual(page.errors,[]);await ctx.close();

  // Saving a name after the first real run.
  ctx=await mk('ja',false,()=>{if(!localStorage.getItem('gunrun-onboarding-v1'))localStorage.setItem('gunrun-onboarding-v1','{"phase":"complete"}')});page=await open(ctx,map+'?learned=1&onboarding=auto');
  await page.click('#bStart');await page.waitForFunction(()=>__game.mode==='play');await endRun(page);
  await page.waitForFunction(()=>!document.getElementById('onboarding').hidden,null,{timeout:8000});
  await page.fill('#onbName','ｒunner_1');await page.click('#onbSave');
  assert.equal(await dialog(page),false);assert.equal(await page.evaluate(()=>localStorage.getItem('gunrun-name')),'RUNNER_1');
  // Returning: no card, コツ lists the moves and offers the course (controls and name live elsewhere).
  await page.close();page=await open(ctx,map+'?onboarding=auto');
  assert.equal(await splash(page),false,'seen once, never again');
  await page.click('#homeGuide');assert.equal(await page.evaluate(()=>document.getElementById('onboarding').dataset.mode),'again');
  assert.equal(await page.textContent('#onbTitle'),'コツ');assert.equal(await page.locator('.onb-tips').isVisible(),true);
  assert.equal(await page.locator('.onb-steps').isVisible(),false);assert.equal(await page.locator('.onb-name').isVisible(),false);assert.equal(await page.locator('#onbSettings').isVisible(),false);
  assert.equal(await page.locator('#onbTipList button').count(),7);assert.equal(await page.locator('#onbTipStage canvas').count(),1,'one demo at a time');
  await page.click('#onbTipList li:nth-child(3) button');assert.equal(await page.locator('#onbTipStage canvas').count(),1);
  assert.equal(await page.textContent('#onbIntro'),'入門モードで練習する');
  await page.click('#onbMain');assert.equal(await dialog(page),false);
  await page.click('#homeGuide');await page.click('#onbIntro');
  await inCourse(page);
  assert.deepEqual(page.errors,[]);await ctx.close();

  // Anyone with a trace of earlier play is not a first-time player.
  for(const seed of [()=>localStorage.setItem('gunrun-run-history-v1',JSON.stringify([{clientRunId:'x'}])),()=>localStorage.setItem('gunrun-sky-ghost-v1','{}'),()=>localStorage.setItem('gunrun-challenge-difficulty-v1','hard')]){
   ctx=await mk('ja',false,seed);page=await open(ctx,map+'?onboarding=auto');
   assert.equal(await splash(page),false,'existing players are not interrupted');await ctx.close();
  }
  // Special entries (practice etc.) never get the card.
  ctx=await mk('ja',false);page=await open(ctx,map+'?onboarding=auto&oldtown_swing=1');assert.equal(await splash(page),false);await ctx.close();

  // Phone landscape, English: the card fits, touch wording is used, and it leads into the course.
  ctx=await mk('en',true);page=await open(ctx,map+'?onboarding=auto');
  const box=await page.evaluate(()=>{const c=document.querySelector('.onb-splash-card').getBoundingClientRect();return{top:c.top,bottom:c.bottom,h:innerHeight}});
  assert.ok(box.top>=0&&box.bottom<=box.h,'start card fits a 390px-high phone');
  const b=await page.locator('#onbStart').boundingBox();assert.ok(b&&b.y>=0&&b.y+b.height<=box.h,'start button inside the screen');
  assert.equal(await page.textContent('#onbStartLabel'),'Tap to start');
  assert.equal(await page.textContent('.onb-splash-intro'),'Outrun the zombies for two minutes.');
  await page.tap('#onbStart');await inCourse(page);
  await page.waitForTimeout(500);
  assert.deepEqual(page.errors,[]);await ctx.close();
  console.log('PASS',map,'start card (no controls text), straight into the course, Easy after the course, one-time nickname prompt, returning player, phone/English');
 }
}finally{await browser?.close();server?.kill()}})().catch(e=>{console.error(e);process.exitCode=1});
