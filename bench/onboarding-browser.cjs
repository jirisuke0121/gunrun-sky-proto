// First-visit guide: first-visit rule, nickname check, hand-off to the intro run, re-opening from home.
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
 const visible=page=>page.evaluate(()=>!document.getElementById('onboarding').hidden);
 const mk=async(lang,touch,seed)=>{const ctx=await browser.newContext({locale:lang==='ja'?'ja-JP':'en-US',viewport:touch?{width:844,height:390}:{width:1280,height:720},hasTouch:touch,isMobile:touch});
  await ctx.addInitScript(()=>window.__hold=true);if(seed)await ctx.addInitScript(seed);
  let posts=0;await ctx.route('https://**/*',r=>{if(r.request().method()==='POST')posts++;return r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0}'})});ctx.posts=()=>posts;return ctx};
 for(const map of ['index.html','canyon.html']){
  // Existing automated runs are not blocked by the guide.
  let ctx=await mk('ja',false),page=await open(ctx,map);
  assert.equal(await visible(page),false,'automation skips the guide by default');
  assert.equal(await page.evaluate(()=>!!document.getElementById('homeGuide')),true,'the home screen always offers 遊び方');
  await ctx.close();

  // First visit: invalid name is refused, valid name saves and starts the intro run.
  ctx=await mk('ja',false);page=await open(ctx,map+'?onboarding=auto');
  assert.equal(await visible(page),true,'first visit shows the guide');
  assert.equal(await page.evaluate(()=>document.getElementById('onbTitle').textContent),'はじめに');
  await page.fill('#onbName','a');await page.click('#onbIntro');
  assert.equal(await visible(page),true,'a bad name keeps the guide open');
  assert.match(await page.textContent('#onbError'),/2〜14文字/);
  assert.equal(await page.evaluate(()=>localStorage.getItem('gunrun-onboarding-v1')),null,'nothing is marked seen yet');
  await page.fill('#onbName','ｒunner_1');await page.click('#onbIntro');
  await page.waitForFunction(()=>__game.mode==='play');
  assert.equal(await page.evaluate(()=>skyChallenge.isIntroRun),true,'the guide leads into the intro run');
  assert.equal(await visible(page),false);
  assert.equal(await page.evaluate(()=>localStorage.getItem('gunrun-name')),'RUNNER_1');
  assert.equal(JSON.parse(await page.evaluate(()=>localStorage.getItem('gunrun-onboarding-v1'))).how,'intro');
  assert.deepEqual(page.errors,[]);assert.equal(ctx.posts(),0,'nothing is uploaded by the guide');
  await page.close();

  // Returning on the same device: no guide; 遊び方 reopens it with the saved name and does not change the record.
  page=await open(ctx,map+'?onboarding=auto');
  assert.equal(await visible(page),false,'seen once, never forced again');
  const seen=await page.evaluate(()=>localStorage.getItem('gunrun-onboarding-v1'));
  await page.click('#homeGuide');
  assert.equal(await visible(page),true);assert.equal(await page.evaluate(()=>document.getElementById('onbTitle').textContent),'遊び方');
  assert.equal(await page.inputValue('#onbName'),'RUNNER_1');
  assert.equal(await page.textContent('#onbMain'),'閉じる');
  await page.fill('#onbName','');await page.click('#onbMain');
  assert.equal(await visible(page),false);
  assert.equal(await page.evaluate(()=>localStorage.getItem('gunrun-onboarding-v1')),seen,'reopening does not rewrite the first-visit record');
  assert.equal(await page.evaluate(()=>localStorage.getItem('gunrun-name')),'RUNNER_1','an empty field keeps the saved name');
  await ctx.close();

  // Someone with finished runs is not a first-time player.
  ctx=await mk('ja',false,()=>localStorage.setItem('gunrun-run-history-v1',JSON.stringify([{clientRunId:'x',score:1}])));
  page=await open(ctx,map+'?onboarding=auto');assert.equal(await visible(page),false,'existing players are not interrupted');await ctx.close();

  // Skipping to the real run goes to the normal home screen without starting anything.
  ctx=await mk('ja',false);page=await open(ctx,map+'?onboarding=auto');
  await page.click('#onbMain');assert.equal(await visible(page),false);
  assert.equal(await page.evaluate(()=>__game.mode),'menu');
  assert.equal(JSON.parse(await page.evaluate(()=>localStorage.getItem('gunrun-onboarding-v1'))).how,'main');
  assert.equal(await page.evaluate(()=>localStorage.getItem('gunrun-name')),null,'name is optional');
  await ctx.close();

  // Phone landscape, English: fits the screen, buttons reachable, error translated.
  ctx=await mk('en',true);page=await open(ctx,map+'?onboarding=auto');
  const box=await page.evaluate(()=>{const c=document.querySelector('.onb-card').getBoundingClientRect();return{top:c.top,bottom:c.bottom,h:innerHeight}});
  assert.ok(box.top>=0&&box.bottom<=box.h,'guide fits a 390px-high phone without scrolling');
  for(const id of ['onbIntro','onbMain','onbSettings']){const b=await page.locator('#'+id).boundingBox();assert.ok(b&&b.y>=0&&b.y+b.height<=box.h,id+' inside the screen')}
  assert.equal(await page.textContent('#onbTitle'),'Welcome');
  await page.fill('#onbName','x');await page.tap('#onbIntro');
  assert.match(await page.textContent('#onbError'),/Use 2-14 letters/);
  assert.notEqual(await page.evaluate(()=>getComputedStyle(document.querySelector('.onb-touch')).display),'none','touch text shown on a touch device');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.onb-pc')).display),'none','keyboard text hidden on a touch device');
  assert.deepEqual(page.errors,[]);await ctx.close();
  console.log('PASS',map,'first-visit rule, nickname check, intro hand-off, reopen, skip, phone/English');
 }
}finally{await browser?.close();server?.kill()}})().catch(e=>{console.error(e);process.exitCode=1});
