// Native game clock/damage and real menus. Controlled scenes are not human play tests.
const assert=require('node:assert/strict'),fs=require('node:fs'),{spawn}=require('node:child_process');
const {chromium}=require('playwright');
const port=Number(process.env.SKY_TEST_PORT||18798),base=`http://127.0.0.1:${port}/`,out='browser-evidence/survival-score';
(async()=>{let browser,server;const results=[];try{
 fs.mkdirSync(out,{recursive:true});
 server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});
 for(let i=0;i<60;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100))}
 for(const f of ['index.html','canyon.html','survival-score.js','challenge-score.js'])assert.equal(await fetch(base+f).then(r=>r.text()),fs.readFileSync(f,'utf8'));
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const map of ['index.html','canyon.html'])for(const [difficulty,lang,touch] of [['easy','ja',false],['normal','en',true],['hard','ja',true]]){
  console.log('START',map,difficulty,lang);
  const context=await browser.newContext({locale:lang==='ja'?'ja-JP':'en-US',viewport:touch?{width:844,height:390}:{width:1280,height:720},hasTouch:touch,isMobile:touch});
  await context.addInitScript(()=>window.__hold=true);
  let posts=0;await context.route('https://**/*',r=>{if(r.request().method()==='POST')posts++;return r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0}'})});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE',e.message)});page.setDefaultTimeout(90000);
  await page.goto(base+map);await page.waitForFunction(()=>window.__game&&window.skyStartReadiness?.ready);
  await page.locator(`#homeDifficulty [data-difficulty="${difficulty}"]`).click();
  if(touch)await page.locator('#bStart').tap();else await page.locator('#bStart').click();
  const evidence=await page.evaluate(async()=>{
   const g=__game,s=__skyInternals,c=g.P,score=skyChallengeScore;
   for(const e of g.zombies)s.ue.remove(e.m.root);g.zombies.length=0;
   g.GAME.spawnT=g.GAME.surgeT=1e9;g.SCR.off=g.PACE.off=g.MARK.off=true;s.U.autoFire=false;s.U.aimAuto=false;
   c.life=999;
   const advance=seconds=>{for(let i=0;i<Math.round(seconds*60);i++)g.advance(1/60);score.sync()};
   advance(21);
   const waiting={...score.current()};
   if(waiting.survival!==Math.floor(waiting.elapsed*15*waiting.difficulty+1e-7)||waiting.survival<70)throw Error('Safe stationary survival did not earn');
   if(document.getElementById('threatScoreHud'))throw Error('Threat HUD still exists');
   if(score.pursuit().pressureSeconds!==undefined)throw Error('Threat score still accumulated');
   // The real enemy hurt/die hook must award only actual HP removed, once.
   const enemy=new g.Zombie(c.pos.x+3,c.pos.y,c.pos.z);enemy.spawnT=0;enemy.rise=null;enemy.hp=4;g.zombies.push(enemy);
   enemy.hurt(1,1,0,.6,0);enemy.hurt(99,1,0,.6,0);enemy.hurt(99,1,0,.6,0);score.sync();
   const combat={...score.current()};
   if(combat.damageUnits!==4||combat.kills!==1||combat.damage!==Math.floor(8*combat.difficulty+1e-7)||combat.kill!==Math.floor(30*combat.difficulty+1e-7))throw Error('Combat arithmetic/overkill');
   const total=combat.total;for(let i=0;i<4;i++)score.sync();if(score.current().total!==total)throw Error('Rendering awarded score');
   g.setMode('pause');advance(3);const paused={...score.current()};
   if(paused.total!==total||paused.elapsed!==combat.elapsed)throw Error('Pause advanced score');
   const pauseText=document.getElementById('unityScorePause').textContent;
   if(/脅威|threat|small loops/i.test(pauseText))throw Error('Old pause explanation');
   g.setMode('play');advance(2);const resumed={...score.current()};
   if(resumed.survival<=paused.survival)throw Error('Resume did not earn');
   Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));
   if(g.mode!=='pause')throw Error('Background did not pause');advance(2);
   if(score.current().total!==resumed.total)throw Error('Background earned');
   delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));g.setMode('play');
   advance(9);const milestone={...score.current()};
   if(milestone.ticks!==1||milestone.tickPoints!==Math.floor(450*milestone.difficulty+1e-7)||milestone.live!==milestone.tickPoints+milestone.damage+milestone.kill)throw Error('30-second payout mismatch');
   g.cam(0);g.frameOnce(0);score.sync();
   // Dynamic UI text is translated by the MutationObserver after this JS turn.
   await Promise.resolve();
   return{waiting,combat,paused,resumed,milestone,pauseText,lang:document.documentElement.lang,hudTotal:document.getElementById('unityTotal').textContent,rate:document.getElementById('unityTimeFactor').textContent};
  });
  assert.equal(evidence.lang,lang);assert.equal(Number(evidence.hudTotal.replace(/\D/g,'')),evidence.milestone.live,'HUD counts paid-out 30-second milestones plus combat');assert.equal(evidence.rate,lang==='ja'?`+${evidence.resumed.tickPoints}/30秒`:`+${evidence.resumed.tickPoints} / 30 s`);
  await page.screenshot({path:`${out}/${map}-${difficulty}-play.png`});
  await page.evaluate(()=>{__game.endGame('caught');__game.advance(1.5)});
  await page.waitForFunction(()=>document.getElementById('unityResultCard').dataset.complete==='true');
  const result=await page.locator('#unityResultCard').getAttribute('data-score');assert.equal(JSON.parse(result).total,evidence.milestone.total);
  assert.equal(await page.locator('.uc-breakdown>div').count(),4);
  const resultText=await page.locator('#unityResultCard').innerText();assert.doesNotMatch(resultText,/脅威|threat weight|chaser distance/i);
  if(lang==='en')assert.doesNotMatch(resultText,/[\u3040-\u30ff\u4e00-\u9fff]/,'result and equations translated');
  for(const id of ['unitySurvivalFormula','unityDamageFormula','unityKillFormula','unityResultEquation'])assert.equal(await page.locator('#'+id).isVisible(),true,'all calculations visible');
  await page.screenshot({path:`${out}/${map}-${difficulty}-result.png`});
  if(touch){await page.setViewportSize({width:844,height:320});await page.waitForFunction(()=>document.getElementById('unityResultCard').dataset.tiny==='true');
   for(const id of ['unityRetry','unityMenu','unityMore']){const b=await page.locator('#'+id).boundingBox();assert.ok(b&&b.y>=0&&b.y+b.height<=320,id+' inside short viewport')}
  }
  if(touch)await page.locator('#unityRetry').tap();else await page.locator('#unityRetry').click();
  await page.waitForFunction(()=>__game.mode==='play');
  assert.equal(await page.evaluate(()=>skyChallengeScore.current().total),0,'retry resets time and combat');
  assert.equal(await page.evaluate(()=>skyChallengeScore.pursuit().damageUnits),0);
  // Cross the real round-end boundary; this does not represent a full human run.
  await page.evaluate(()=>{__game.GAME.t=119.95;__game.advance(.2);__game.advance(1.5)});
  await page.waitForFunction(()=>document.getElementById('unityResultCard').dataset.complete==='true');
  const complete=JSON.parse(await page.locator('#unityResultCard').getAttribute('data-score'));
  assert.equal(complete.elapsed,120);assert.equal(complete.survival,Math.floor(1800*complete.difficulty+1e-7));assert.equal(complete.damageUnits,0);assert.equal(complete.kills,0);
  assert.equal(await page.locator('#unityResultCard').getAttribute('data-failed'),'false');
  if(difficulty==='hard'){
   // Reproduce the user's actual damage/kill totals through the live damage hook.
   await page.locator('#unityRetry').tap();await page.waitForFunction(()=>__game.mode==='play');
   await page.evaluate(()=>{
    const g=__game,s=__skyInternals,c=g.P;
    for(const e of g.zombies)s.ue.remove(e.m.root);g.zombies.length=0;
    const e=new g.Zombie(c.pos.x+3,c.pos.y,c.pos.z);e.spawnT=0;e.rise=null;e.hp=64.1;g.zombies.push(e);
    e.hurt(100,1,0,.6,0);g.GAME.t=119.95;g.advance(.2);g.advance(1.5);
   });
   await page.waitForFunction(()=>document.getElementById('unityResultCard').dataset.complete==='true');
   const reported=JSON.parse(await page.locator('#unityResultCard').getAttribute('data-score'));
   assert.deepEqual([reported.survival,reported.damage,reported.kill,reported.total],[2160,153,36,2349]);
   assert.equal((await page.locator('#unityResultTotal').innerText()).replace(/,/g,''),'2349');
   await page.screenshot({path:`${out}/${map}-reported-result.png`});
  }
  assert.deepEqual(errors,[]);assert.equal(posts,0);
  results.push({map,difficulty,lang,touch,...evidence,result:JSON.parse(result),complete,posts,errors});
  fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));
  console.log('PASS',map,difficulty,lang,'native time, stationary survival, actual damage/kill, pause/resume, result and retry');await context.close();
 }
}finally{await browser?.close();server?.kill()}})().catch(e=>{console.error(e);process.exitCode=1});
