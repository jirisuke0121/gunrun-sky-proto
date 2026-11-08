const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
const base=process.env.RUNNING_QA_URL||'http://127.0.0.1:8895/',out=process.env.AUTO_FOLLOW_OUT||'browser-evidence/auto-follow-release';
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--enable-unsafe-swiftshader']});const rows=[];
try{for(const [map,lang]of[['index.html','ja'],['index.html','en'],['canyon.html','ja'],['canyon.html','en']]){
 const ctx=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,locale:lang==='ja'?'ja-JP':'en-US'});let posts=0;const errors=[];
 await ctx.addInitScript(()=>{window.__hold=true;localStorage.setItem('gunrun-fixed-controls-v1','1')});
 await ctx.route('https://**/*',r=>{if(r.request().method()==='POST')posts++;return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"top":[],"total":0}'})});
 const p=await ctx.newPage();p.setDefaultTimeout(90000);p.on('pageerror',e=>errors.push(e.message));
 const normalURL=base+map+`?camera=after&lang=${lang}&controlpick=0&hookGuide=0&dev=1`,url=normalURL+'&cameraTrial=follow';
 const ready=()=>p.waitForFunction(()=>window.skyStartReadiness?.ready);
 const check=async(label,trial='follow')=>{const s=await p.evaluate(()=>({trial:new URL(location.href).searchParams.get('cameraTrial'),mode:skyFollowCamera.mode,manualLook:skyFollowCamera.manualLook,fixed:!!window.skyFixedCamera?.active,savedFixed:localStorage.getItem('gunrun-fixed-controls-v1')}));assert.equal(s.trial,trial,label);assert.equal(s.mode,'after');assert.equal(s.manualLook,trial==='follow-legacy');assert.equal(s.fixed,false);assert.equal(s.savedFixed,null);return s;};
 await p.goto(normalURL);await ready();const normal=await check('normal baseline',null);
 await p.goto(url);await ready();const candidate=await check('candidate start');
 await p.locator('#homeGuide').tap();
 const helpText=lang==='ja'?'カメラは進む向きへ自動で追従します。視点操作はありません':'The camera follows your travel direction automatically. No camera controls.';
 await p.waitForFunction(text=>document.getElementById('onbTouchLook').textContent===text,helpText);
 assert.equal(await p.locator('#onbLookTitle').textContent(),lang==='ja'?'カメラは自動':'Automatic camera');
 assert.equal(await p.locator('#onbPcLook').textContent(),helpText);await p.locator('#onbMain').tap();
 await p.locator('#bStart').tap();await p.waitForFunction(()=>__game.mode==='play');await p.evaluate(()=>{__game.S.sendLog=false;__game.frameOnce(0)});
 await p.locator('#bSettings').tap();await p.waitForFunction(()=>__game.mode==='pause');await p.locator('#bRestart').tap();await p.waitForFunction(()=>__game.mode==='play');const retry=await check('retry');
 await p.goto(url);await ready();await p.locator('#homeDevelopment summary').click();await p.locator('#bGuidedIntro').click();await p.waitForURL('**/canyon.html?learn=1*');await p.waitForFunction(()=>window.skyGuidedIntro&&__game.mode==='play');
 const tutorialChoice=await check('tutorial choice');await p.locator('[data-learn-adopt=after]').click();
 assert.equal(await p.evaluate(()=>localStorage.getItem('gunrun-fixed-controls-v1')),null,'tutorial must not write the obsolete fixed flag');
 // Native movement advances the actual first lesson; no lesson-completion
 // counter or practice position is assigned by this harness.
 await p.keyboard.down('w');await p.evaluate(()=>{for(let i=0;i<180&&skyGuidedIntro.stage==='move';i++)__game.advance(1/60)});await p.keyboard.up('w');assert.equal(await p.evaluate(()=>skyGuidedIntro.stage),'vault');
 await p.locator('#bSettings').tap();await p.waitForFunction(()=>__game.mode==='pause');await p.locator('#learnSkip').click();await p.waitForURL(u=>u.pathname.endsWith(map)&&u.searchParams.get('learned')==='1');await ready();await p.waitForFunction(()=>__game.mode==='play');const returned=await check('tutorial return');
 await p.screenshot({path:`${out}/entry-${map}-${lang}.png`});assert.deepEqual(errors,[]);assert.equal(posts,0);rows.push({map,lang,normal,candidate,helpText,retry,tutorialChoice,returned,firstLesson:'vault',posts,errors});console.log('PASS auto-follow normal, bilingual help, retry, tutorial, native first lesson and return',map,lang);await ctx.close();
}fs.writeFileSync(out+'/entry-results.json',JSON.stringify(rows,null,2));}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
