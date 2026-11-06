const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
const out='browser-evidence/fixed-camera';
(async()=>{const b=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});const rows=[];try{
for(const touch of [false,true]){
 const ctx=await b.newContext({viewport:touch?{width:844,height:390}:{width:1280,height:720},isMobile:touch,hasTouch:touch,locale:'ja-JP'});
 await ctx.addInitScript(()=>window.__hold=true);let posts=0;
 await ctx.route('https://**/*',r=>{if(r.request().method()==='POST')posts++;return r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0}'})});
 const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:8878/camera-trial.html');
 const ready=kind=>p.waitForFunction(kind=>{const w=document.getElementById('game').contentWindow;return new URL(w.location.href).searchParams.get('cameraTrial')===kind&&w.skyFollowCamera&&w.skyStartReadiness?.ready},kind,{timeout:120000});await ready('fixed');
 for(const kind of ['follow','fps','fixed']){
  await p.locator('[data-kind="'+kind+'"]').click();await ready(kind);
  assert.equal(await p.evaluate(()=>document.getElementById('game').contentWindow.skyFollowCamera.mode),kind==='fps'?'before':'after');
  assert.equal(await p.locator('#view').isDisabled(),kind!=='fixed');
  if(kind==='fixed')assert.match(await p.frameLocator('#game').locator('.home-controls').innerText(),/視点操作なし/);
  assert.match(await p.frameLocator('#game').locator('#homeSendNotice').innerText(),/送信しません/);
 }
 await p.locator('#start').click();const layout=await p.evaluate(()=>{const f=document.getElementById('game'),r=f.getBoundingClientRect(),g=f.contentWindow;g.__game.frameOnce(0);return{mode:g.__game.mode,width:r.width,height:r.height,bottom:r.bottom,viewport:[innerWidth,innerHeight],pageWidth:document.documentElement.scrollWidth,fixed:g.skyFixedCamera.active}});
 assert.equal(layout.mode,'play');assert.equal(layout.fixed,true);assert.ok(layout.pageWidth<=layout.viewport[0]);assert.ok(layout.bottom<=layout.viewport[1]+1);assert.ok(layout.height>=280);
 await p.screenshot({path:out+'/comparison-'+(touch?'phone':'desktop')+'.png'});assert.equal(posts,0);assert.deepEqual(errors,[]);rows.push({touch,layout,posts,errors});console.log('PASS comparison launcher',touch?'phone landscape':'desktop','all three controls, intro launch, contained layout, no external uploads');await ctx.close();
}fs.writeFileSync(out+'/launcher-results.json',JSON.stringify(rows,null,2));}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
