const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {DatabaseSync}=require('node:sqlite');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'browser-evidence/foundation'),base='http://127.0.0.1:8991';
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const {default:worker}=await import('../server/worker.js');
 const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync(path.join(root,'server/schema.sql'),'utf8'));sql.exec(fs.readFileSync(path.join(root,'server/telemetry-schema.sql'),'utf8'));
 const DB={prepare(query){let values=[];return{bind(...args){values=args;return this},async first(){return sql.prepare(query).get(...values)||null},async all(){return{results:sql.prepare(query).all(...values)}},async run(){return sql.prepare(query).run(...values)}}}};
 const env={DB,ADMIN_TOKEN:'local-fixture-only',ALLOWED_ORIGINS:base};
 const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.gz':'application/gzip','.png':'image/png','.webp':'image/webp','.ogg':'audio/ogg','.mp3':'audio/mpeg'};
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,base);
  if(url.pathname==='/telemetry'||url.pathname==='/admin/overview'){
   let body='';for await(const chunk of req)body+=chunk;
   const response=await worker.fetch(new Request(url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body}:{})}),env,{});
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  const data=await fs.promises.readFile(file);res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(data);
 }catch(error){res.writeHead(404);res.end('not found');}});
 let browser;const results=[];
 try{
  await new Promise(resolve=>server.listen(8991,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  for(const [map,touch] of [['index.html',false],['canyon.html',true]]){
   const context=await browser.newContext({locale:'ja-JP',viewport:touch?{width:844,height:390}:{width:1280,height:720},hasTouch:touch,isMobile:touch,deviceScaleFactor:2});
   await context.addInitScript(()=>window.__hold=true);
   let externalPosts=0;await context.route('https://**/*',route=>{if(route.request().method()==='POST')externalPosts++;return route.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0,"ok":true,"recordProtocol":2}'});});
   const page=await context.newPage(),errors=[];page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/'+map);await page.waitForFunction(()=>window.skyStartReadiness?.ready&&window.skyFoundation);
   const click=async selector=>{
    if(selector==='#bSettings'&&await page.evaluate(()=>__game.mode==='menu')&&await page.locator('#homeSettings').isVisible())selector='#homeSettings';
   if(selector==='#bSettings'&&!touch&&await page.evaluate(()=>__game.mode==='play')){await page.keyboard.press('p');await page.waitForFunction(()=>__game.mode==='pause');return;}
    if(touch)await page.locator(selector).tap();else await page.locator(selector).click();
   };
   const snapshot=()=>page.evaluate(()=>skyRenderQuality.snapshot());
   assert.equal((await snapshot()).mode,'high');
   if(await page.locator('#homeSettings').count()){
    await click('#homeSettings');
    assert.doesNotMatch(await page.locator('#unityScorePause').innerText(),/NaN|undefined/);
    await click('#bResume');
   }
   await click('#bStart');assert.equal(await page.evaluate(()=>__game.mode),'play');
   const high=await snapshot();assert.equal(high.shadows,true);assert.equal(high.pixelRatio,touch?1.5:2);
   await click('#bSettings');await page.locator('#settingsRenderQuality').selectOption('performance');
   assert.equal((await snapshot()).pixelRatio,high.pixelRatio);assert.match(await page.locator('#settingsRenderQualityDescription').innerText(),/次のプレイ/);
   await page.setViewportSize(touch?{width:812,height:375}:{width:1200,height:700});assert.equal((await snapshot()).pixelRatio,high.pixelRatio);
   await click('#bRestart');assert.equal((await snapshot()).pixelRatio,.7);
   await click('#bSettings');await click('#bMenu');await page.waitForFunction(()=>__game.mode==='menu');
   if(await page.locator('#homeMore').count())await page.locator('#homeMore > summary').click();
   await page.locator('#homeRenderQuality').selectOption('high');await click('#bStart');
   // Controlled timestamps validate decision/transition wiring, not device FPS.
   await page.evaluate(()=>{for(let i=0;i<=800;i++)skyFoundation.frame(i*25,true)});
   assert.equal(await page.locator('#qualitySuggestion').count(),0);
   await click('#bSettings');assert.equal(await page.locator('#qualitySuggestion').count(),0);
   await click('#bMenu');await page.waitForSelector('#qualitySuggestion[open]');
   assert.equal((await snapshot()).selectedMode,'high');
   await page.screenshot({path:path.join(out,map+'-suggestion.png')});
   await click('#qualityKeep');assert.equal((await snapshot()).selectedMode,'high');
   assert.equal(await page.evaluate(()=>localStorage.getItem('gunrun-quality-check-v1')),'done');
   await click('#bSettings');
   if(await page.locator('#pauseAdvanced').isVisible())await page.locator('#pauseAdvanced > summary').click();
   await click('#bReset');await click('#bResume');
   await click('#bIntro');assert.equal(await page.evaluate(()=>skyChallenge.isIntroRun),true);
   await page.evaluate(()=>{for(let i=0;i<=800;i++)skyFoundation.frame(i*25,true)});
   await click('#bSettings');await click('#bMenu');await page.waitForSelector('#qualitySuggestion[open]');
   await click('#qualityAccept');assert.equal((await snapshot()).selectedMode,'performance');
   await click('#bStart');assert.equal((await snapshot()).pixelRatio,.7);
   assert.equal(externalPosts,0);assert.deepEqual(errors,[]);
   results.push({map,touch,initial:high,final:await snapshot(),manualPending:true,decline:true,introAccept:true,externalPosts,errors});
   console.log('PASS',map,'high default, pending manual change/resize, restart, home-only decline, intro local diagnosis and accept');await context.close();
  }
  const session=crypto.randomUUID(),run=crypto.randomUUID();
  const seed=async(event,extra={})=>{const r=await fetch(base+'/telemetry',{method:'POST',body:JSON.stringify({v:1,id:crypto.randomUUID(),session,event,build:'browser-fixture',map:'old-town',source:'github',device:'desktop',difficulty:'normal',run,...extra})});assert.equal(r.status,200)};
  await seed('boot');await seed('home');await seed('start');await seed('finish',{reason:'time',performance:{frameCount:600,durationMs:10000,averageFps:60,below30Count:0,maxFrameMs:17,quality:'high',ratio:1,width:1280,height:720,nativeRatio:1,viewportWidth:1280,viewportHeight:720}});await seed('error',{error:'resource'});
  const context=await browser.newContext({locale:'ja-JP'}),page=await context.newPage();page.setDefaultTimeout(15000);await page.goto(base+'/owner.html');
  await page.locator('#endpoint').fill(base);await page.locator('#token').fill('wrong');await page.locator('#refresh').click();await page.waitForFunction(()=>document.getElementById('status').textContent.includes('トークンを確認'));
  await page.locator('#token').fill('local-fixture-only');await page.locator('#refresh').click();await page.waitForFunction(()=>document.getElementById('performanceRows').textContent.includes('60.0'));
  assert.match(await page.locator('#errorRows').innerText(),/ファイル読み込み/);await page.screenshot({path:path.join(out,'owner-desktop.png'),fullPage:true});
  await page.locator('#map').selectOption('rock-canyon');await page.locator('#refresh').click();await page.waitForFunction(()=>document.getElementById('performanceRows').textContent.includes('対象の計測はありません'));
  await page.locator('#map').selectOption('old-town');await page.locator('#refresh').click();await page.waitForFunction(()=>document.getElementById('performanceRows').textContent.includes('60.0'));
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(out,'owner-mobile.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>JSON.stringify(localStorage).includes('local-fixture-only')),false);assert.ok(!page.url().includes('local-fixture-only'));
  await page.locator('#disconnect').click();assert.equal(await page.locator('#token').inputValue(),'');assert.equal(await page.locator('#performanceRows').innerText(),'');
  results.push({owner:{authenticated:true,filterEmpty:true,responsive:true,tokenNotPersisted:true}});await context.close();
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log('PASS authenticated owner API, filters/empty state, narrow layout and memory-only token');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));sql.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
