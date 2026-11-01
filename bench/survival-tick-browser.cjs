// 5-second survival milestones: payout, HUD badge, progress bar, settlement at the end.
// Controlled scene on the native game clock; not a human play test.
const assert=require('node:assert/strict'),fs=require('node:fs'),{spawn}=require('node:child_process');
const {chromium}=require('playwright');
const port=Number(process.env.SKY_TEST_PORT||18799),base=`http://127.0.0.1:${port}/`,out='browser-evidence/survival-tick';
(async()=>{let browser,server;try{
 fs.mkdirSync(out,{recursive:true});
 server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});
 for(let i=0;i<60;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100))}
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const map of ['index.html','canyon.html'])for(const [lang,touch,reduce] of [['ja',false,false],['en',true,false],['ja',false,true]]){
  const context=await browser.newContext({locale:lang==='ja'?'ja-JP':'en-US',viewport:touch?{width:844,height:390}:{width:1280,height:720},hasTouch:touch,isMobile:touch,reducedMotion:reduce?'reduce':'no-preference'});
  await context.addInitScript(()=>window.__hold=true);
  let posts=0;await context.route('https://**/*',r=>{if(r.request().method()==='POST')posts++;return r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0}'})});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(90000);
  // Software GL can stall the compositor on long scenes; screenshots are best-effort evidence only.
  const shot=async o=>{try{await page.screenshot({...o,timeout:20000})}catch{console.log('  (screenshot skipped)',o.path)}};
  await page.goto(base+map);await page.waitForFunction(()=>window.__game&&window.skyStartReadiness?.ready);
  await page.locator('#homeDifficulty [data-difficulty="normal"]').click();
  if(touch)await page.locator('#bStart').tap();else await page.locator('#bStart').click();
  await page.evaluate(()=>{const g=__game,s=__skyInternals;
   for(const e of g.zombies)s.ue.remove(e.m.root);g.zombies.length=0;
   g.GAME.spawnT=g.GAME.surgeT=1e9;g.SCR.off=g.PACE.off=g.MARK.off=true;s.U.autoFire=false;s.U.aimAuto=false;g.P.life=999;
   window.__step=seconds=>{for(let i=0;i<Math.round(seconds*60);i++){g.advance(1/60);skyChallengeScore.sync()}};
   window.__award=()=>{const e=document.getElementById('unityTickAward');return{hidden:e.hidden,text:e.innerText.replace(/\s+/g,' '),major:e.dataset.major}};
   window.__tickCount=()=>skyChallengeScore.feedbackState().ticks;
  });
  const hud=()=>page.evaluate(()=>({total:document.getElementById('unityTotal').textContent.replace(/\D/g,''),rate:document.getElementById('unityTimeFactor').textContent,
    bar:document.getElementById('unityTickBar').firstChild.style.transform,award:__award(),ticks:__tickCount()}));
  await page.evaluate(()=>__step(29.9));
  let h=await hud();assert.equal(h.award.hidden,true,'no badge before 30 s');assert.equal(h.total,'0');assert.equal(h.ticks,0);
  assert.equal(h.rate,lang==='ja'?'+3960/30秒':'+3960 / 30 s');
  assert.match(h.bar,/scaleX\((1|0\.99)\)/,'bar nearly full');
  await page.evaluate(()=>__step(.2));            // crosses 30 s
  h=await hud();assert.equal(h.award.hidden,false,'badge at 30 s');assert.equal(h.award.major,'true','every payout at the 30 s interval is the large one');
  assert.match(h.award.text,lang==='ja'?/\+3,960\s*30秒生存/:/\+3,960\s*30 s survived/);assert.equal(h.ticks,1);
  await page.waitForTimeout(700);
  h=await hud();assert.equal(h.total,'3960','HUD counted the payout');
  await shot({path:`${out}/${map}-${lang}${touch?'-touch':''}${reduce?'-reduced':''}-tick30.png`});
  await page.waitForTimeout(1300);assert.equal((await hud()).award.hidden,true,'badge leaves after its animation');
  // Jump the native clock close to 60 s (a silent resync), then cross the 60 s payout.
  await page.evaluate(()=>{__game.GAME.t=59.8;__step(.05);__step(.4)});
  h=await hud();assert.equal(h.ticks,2,'only the crossed payout is celebrated (the clock jump is silent)');assert.match(h.award.text,lang==='ja'?/60秒生存/:/60 s survived/);
  await page.waitForTimeout(700);
  assert.equal((await hud()).total,String(await page.evaluate(()=>skyChallengeScore.current().live)),'HUD shows paid-out points');
  // A combat event in the same moment as a payout must not break either.
  await page.evaluate(()=>{const g=__game,c=g.P;g.GAME.t=89.7;__step(.05);const e=new g.Zombie(c.pos.x+3,c.pos.y,c.pos.z);e.spawnT=0;e.rise=null;e.hp=4;g.zombies.push(e);e.hurt(1,1,0,.6,0);e.hurt(99,1,0,.6,0);__step(.4)});
  await shot({path:`${out}/${map}-${lang}${touch?'-touch':''}${reduce?'-reduced':''}-tick-with-combat.png`});
  // End mid-interval: the unpaid part is settled and the result equals the continuous formula.
  await page.evaluate(()=>{__step(2.3);__game.endGame('caught');__game.advance(1.5)});
  await page.waitForFunction(()=>document.getElementById('unityResultCard').dataset.complete==='true');
  const r=JSON.parse(await page.locator('#unityResultCard').getAttribute('data-score'));
  assert.equal(r.survival,Math.floor(r.elapsed*120*1.1+1e-7));assert.equal(r.total,r.survival+r.damage+r.kill);
  assert.ok(r.remainder>0&&r.ticked+r.remainder===r.survival);
  const line=await page.locator('#unitySurvivalFormula').innerText();
  assert.match(line,lang==='ja'?/^30秒ごと \d+回 × 3960点 ＋ 端数 \d+点$/:/^Every 30 s: \d+ × 3960 pts \+ partial \d+ pts$/);
  assert.equal(await page.locator('#unityTickAward').isVisible(),false,'badge gone on the result');
  await shot({path:`${out}/${map}-${lang}${touch?'-touch':''}${reduce?'-reduced':''}-result.png`});
  // Retry clears the milestone state.
  if(touch)await page.locator('#unityRetry').tap();else await page.locator('#unityRetry').click();
  await page.waitForFunction(()=>__game.mode==='play');
  h=await hud();assert.equal(h.total,'0');assert.equal(h.award.hidden,true);assert.match(h.bar,/scaleX\(0\)/);
  assert.deepEqual(errors,[]);assert.equal(posts,0);
  console.log('PASS',map,lang,touch?'touch':'pc',reduce?'reduced-motion':'');await context.close();
 }
}finally{await browser?.close();server?.kill()}})().catch(e=>{console.error(e);process.exitCode=1});
