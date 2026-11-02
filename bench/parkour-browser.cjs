// Parkour clear (full run, no gun shots, no kills => subtotal x1.3): HUD hint, result row, equation, both maps, ja/en.
// Controlled scene on the native game clock; shots are injected through the shared stats counter, not a human play test.
const assert=require('node:assert/strict'),fs=require('node:fs'),{spawn}=require('node:child_process');
const {chromium}=require('playwright');
const port=Number(process.env.SKY_TEST_PORT||18811),base=`http://127.0.0.1:${port}/`,out='browser-evidence/parkour';
(async()=>{let browser,server;try{
 fs.mkdirSync(out,{recursive:true});
 server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});
 for(let i=0;i<60;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100))}
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const map of ['index.html','canyon.html'])for(const lang of ['ja','en'])for(const scenario of ['clean','shot','jumpgun']){
  const context=await browser.newContext({locale:lang==='ja'?'ja-JP':'en-US',viewport:{width:1280,height:720}});
  await context.addInitScript(()=>window.__hold=true);
  await context.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0}'}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(90000);
  await page.goto(base+map);await page.waitForFunction(()=>window.__game&&window.skyStartReadiness?.ready);
  await page.locator('#homeDifficulty [data-difficulty="hard"]').click();
  await page.locator('#bStart').click();
  await page.evaluate(()=>{const g=__game,s=__skyInternals;
   for(const e of g.zombies)s.ue.remove(e.m.root);g.zombies.length=0;
   g.GAME.spawnT=g.GAME.surgeT=1e9;g.SCR.off=g.PACE.off=g.MARK.off=true;s.U.autoFire=false;s.U.aimAuto=false;g.P.life=999;
   window.__step=seconds=>{for(let i=0;i<Math.round(seconds*60);i++){g.advance(1/60);skyChallengeScore.sync()}};});
  await page.evaluate(()=>__step(5));
  const hudText=()=>page.locator('#unityDifficulty').innerText();
  assert.match(await hudText(),lang==='ja'?/パルクール ×1\.3/:/Parkour ×1\.3/,'hint shows while eligible');
  if(scenario==='shot'){await page.evaluate(()=>{__game.stats.shots=3});await page.evaluate(()=>__step(.2));
   assert.doesNotMatch(await hudText(),/パルクール|Parkour/,'hint disappears after firing');}
  if(scenario==='jumpgun'){await page.evaluate(()=>{__game.stats.shots=2;__game.stats.jumpGunLaunches=2});await page.evaluate(()=>__step(.2));
   assert.match(await hudText(),lang==='ja'?/パルクール/:/Parkour/,'jump gun does not break the bonus');}
  // Cross the real round-end boundary (not a full human run).
  await page.evaluate(()=>{__game.GAME.t=119.95;__game.advance(.2);__game.advance(1.5)});
  await page.waitForFunction(()=>document.getElementById('unityResultCard').dataset.complete==='true',null,{timeout:60000});
  const r=JSON.parse(await page.locator('#unityResultCard').getAttribute('data-score'));
  const sub=r.survival+r.damage+r.kill,expected=scenario==='shot'?0:Math.floor(sub*.3+1e-7);
  assert.equal(r.elapsed,120);assert.equal(r.parkour,scenario!=='shot');assert.equal(r.parkourBonus,expected);assert.equal(r.total,sub+expected);
  assert.equal(await page.locator('#unityParkourRow').isVisible(),scenario!=='shot');
  const eq=await page.locator('#unityResultEquation').innerText();
  if(scenario!=='shot'){
   assert.ok(eq.includes('+ '+expected.toLocaleString('ja-JP'))||eq.includes(expected.toLocaleString('ja-JP')),'equation lists the bonus: '+eq);
   assert.equal((await page.locator('#unityResultTotal').innerText()).replace(/\D/g,''),String(r.total));
   assert.match(await page.locator('#unityParkourFormula').innerText(),lang==='ja'?/銃撃・撃破なしで完走　小計 × 1\.3/:/no shots and no kills/);
  } else assert.equal(r.total,sub);
  try{await page.screenshot({path:`${out}/${map}-${lang}-${scenario}.png`,timeout:20000})}catch{console.log('  (screenshot skipped)')}
  assert.deepEqual(errors,[]);
  console.log('PASS',map,lang,scenario,r.total);
  await context.close();
 }
}finally{await browser?.close();server?.kill()}})().catch(e=>{console.error(e);process.exit(1)});
