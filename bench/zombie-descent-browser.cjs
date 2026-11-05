const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const out=process.env.DESCENT_QA_OUT||'browser-evidence/descent';fs.mkdirSync(out,{recursive:true});
const scenarios=fs.readFileSync('bench/zombie-descent-scenarios.js','utf8');
(async()=>{let browser;const results=[];try{
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:process.platform==='darwin'?['--no-sandbox']:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const map of (process.env.DESCENT_MAPS||'index,canyon').split(','))for(const difficulty of (process.env.DESCENT_LEVELS||'intro,easy,normal,hard').split(',')){
  const touch=['intro','normal'].includes(difficulty),context=await browser.newContext({viewport:touch?{width:844,height:390}:{width:1280,height:720},hasTouch:touch,isMobile:touch});
  await context.addInitScript(id=>{window.__hold=true;localStorage.setItem('gunrun-challenge-difficulty-v1',id==='intro'?'normal':id);localStorage.setItem('gunrun-follow-camera-v1','before');localStorage.setItem('gunrun-pc-camera-v1','before');},difficulty);
  const errors=[];const page=await context.newPage();page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',route=>{
   const u=new URL(route.request().url());
   if(process.env.DESCENT_PUBLIC==='1'&&u.origin==='https://jirisuke0121.github.io')return route.continue();
   if(u.origin==='https://descent.test'){
    const file=decodeURIComponent(u.pathname).slice(1),ext=path.extname(file).slice(1);
    if(!file.includes('..')&&fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({status:200,contentType:({html:'text/html',js:'application/javascript',css:'text/css',svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',webp:'image/webp'})[ext]||'application/octet-stream',body:fs.readFileSync(file)});
    return route.abort();
   }
   return route.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0,"ok":true}'});
  });
  const base=process.env.DESCENT_PUBLIC==='1'?'https://jirisuke0121.github.io/gunrun-sky-proto/':'https://descent.test/';
  await page.goto(base+map+'.html?verify=descent-v1',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.skyStartReadiness?.ready&&window.skyZombieDescent);
  await page.locator(difficulty==='intro'?'#bIntro':'#bStart').click();assert.equal(await page.evaluate(()=>skyChallenge.id),difficulty);
  const rows=await page.evaluate(scenarios),crowds=map==='index'?await page.evaluate(fs.readFileSync('bench/zombie-descent-crowd.js','utf8')):[],stats=await page.evaluate(()=>({...skyZombieDescent.stats}));results.push({map,difficulty,touch,rows,crowds,stats,errors});fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));
  for(const row of rows){assert.ok(row.valid,`${map}/${difficulty}/${row.id}: fixture must stand on real support`);assert.notEqual(row.firstDamage,null,`${map}/${difficulty}/${row.id}: must land and attack`);assert.equal(row.penetrations,0,row.id+': no terrain penetration');assert.ok(row.maxStep<1,row.id+': no teleport');}
  for(const crowd of crowds){assert.ok(crowd.initial,'valid crowd positions');assert.ok(crowd.landed.every(t=>t!==null),'every crowd member lands: '+JSON.stringify(crowd));assert.equal(crowd.penetrations,0);assert.ok(crowd.maxStep<1);}
  assert.deepEqual(errors,[]);console.log(`PASS descent ${map}/${difficulty}/${touch?'touch':'desktop'}: ${rows.length} supported fixtures, all attack, zero penetrations`);
  if(map==='index'&&difficulty==='intro'){
   await page.evaluate(()=>{window.__descentFixtures=[{id:'photo-review',p:[1.3,4,-15.5],e:[-1,8,-13.5]}];window.__descentLimit=.01;});await page.evaluate(scenarios);
   const render=()=>{const g=__game;g.cam(1/60);g.debug.camera.position.set(1.3,5.8,-19);g.debug.camera.lookAt(1.3,6,-12);g.debug.renderer.render(g.debug.scene,g.debug.camera);};await page.evaluate(render);await page.screenshot({path:out+'/photo-before.png'});
   await page.evaluate(()=>window.__descentLimit=12);await page.evaluate(scenarios);await page.evaluate(render);await page.screenshot({path:out+'/photo-after.png'});
  }
  await context.close();
 }
}finally{await browser?.close()}})().catch(e=>{console.error(e);process.exitCode=1});
