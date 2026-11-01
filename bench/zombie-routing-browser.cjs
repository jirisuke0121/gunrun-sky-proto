const assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync,spawn}=require('node:child_process');
const {chromium}=require('playwright');
const base=process.env.RUNNING_QA_URL||'http://127.0.0.1:8793/',out=process.env.ROUTING_QA_OUT||'browser-evidence/zombie-routing';
const baseline=process.env.ROUTING_BASE_REF||'b159635db76f64194354717a731fef60c3e6d112';
const compare=process.env.ROUTING_COMPARE==='1';
const source=fs.readFileSync('bench/zombie-routing-scenarios.js','utf8');
const movingSource=fs.readFileSync('bench/zombie-routing-moving.js','utf8');
fs.mkdirSync(out,{recursive:true});
(async()=>{let browser,server;
 const results=[];
 try{
 if(!process.env.RUNNING_QA_URL){server=spawn('python3',['-m','http.server','8793','--bind','127.0.0.1'],{stdio:'ignore'});for(let i=0;i<60;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100));}}
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  args:process.platform==='darwin'?['--no-sandbox']:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const map of (process.env.ROUTING_MAPS||'index,canyon').split(','))for(const touch of [false,true])for(const version of compare?['before','after']:['after']){
  const context=await browser.newContext({viewport:touch?{width:844,height:390}:{width:1280,height:720},hasTouch:touch,isMobile:touch});
  await context.addInitScript(()=>{window.__hold=true;localStorage.setItem('gunrun-sky-proto-v1',JSON.stringify({sendLog:false}));});
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.origin!==new URL(base).origin)return route.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0,"ok":true}'});
   const name=url.pathname.split('/').at(-1);
   if(version==='before'&&['index.html','canyon.html','enhancements.js','zombie-climb.js'].includes(name))return route.fulfill({status:200,
    contentType:name.endsWith('.html')?'text/html':'text/javascript',body:execFileSync('git',['show',baseline+':'+name],{encoding:'utf8',maxBuffer:8*1024*1024})});
   return route.continue();
  });
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+map+'.html?lang=ja',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.skyStartReadiness?.ready&&window.skyZombieClimb);
  await page.locator('#bStart').click();
  const rows=await page.evaluate(source=>eval(source),source);
  const moving=await page.evaluate(source=>eval(source),movingSource);
  const stats=await page.evaluate(()=>({routing:window.skyZombieRouting?.stats,climbing:window.skyZombieClimb.stats}));
  results.push({map,touch,version,baseline,rows,moving,stats,errors});fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));
  console.log(JSON.stringify({map,touch,version,rows:rows.map(({id,fixtureFree,firstDamage,length,newPenetrations,maxDisplacement})=>({id,fixtureFree,firstDamage,length,newPenetrations,maxDisplacement})),moving:{firstDamage:moving.firstDamage,turns:moving.turns,newPenetrations:moving.newPenetrations},stats}));
  assert.deepEqual(errors,[]);for(const row of rows){assert.ok(row.fixtureFree,'invalid fixture '+row.id);assert.equal(row.newPenetrations,0,row.id);assert.ok(row.maxDisplacement<1,row.id+' teleported');}
  if(version==='after'){
   assert.ok(moving.firstDamage!==null&&moving.turns>=1,'must reacquire a moving player after a turn');assert.equal(moving.newPenetrations,0);
   const prior=results.find(r=>r.map===map&&r.touch===touch&&r.version==='before');
   for(const row of rows){const before=prior?.rows.find(r=>r.id===row.id);assert.ok(row.firstDamage!==null,'no attack: '+JSON.stringify(row));
    if(before?.firstDamage!=null)assert.ok(row.firstDamage<=before.firstDamage+1,'slower: '+JSON.stringify({before:before.firstDamage,after:row.firstDamage,id:row.id}));}
   if(map==='index'){
    assert.ok(rows.find(r=>r.id==='northwest-short-gap').firstDamage<3);
    assert.ok(rows.find(r=>r.id==='photo-wall').firstDamage<11);
    assert.ok(rows.find(r=>r.id==='tower-to-photo-wall').length<100);
   }else assert.ok(rows.find(r=>r.id==='canyon-ground-to-middle').length<25);
   await page.screenshot({path:out+'/'+map+'-'+(touch?'touch':'desktop')+'.png'});
  }
  await context.close();
 }}finally{await browser?.close();server?.kill();}
})().catch(e=>{console.error(e);process.exitCode=1});
