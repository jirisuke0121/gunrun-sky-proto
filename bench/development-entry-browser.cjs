const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{const results=[],base=process.env.RUNNING_QA_URL||'http://127.0.0.1:8882/';fs.mkdirSync('browser-evidence/development-entry',{recursive:true});
for(const map of ['index.html','canyon.html'])for(const lang of ['ja','en'])for(const [width,height,touch]of [[844,390,true],[640,320,true],[1280,720,false]]){
 const p=await browser.newPage({viewport:{width,height},hasTouch:touch,isMobile:touch,locale:lang==='ja'?'ja-JP':'en-US'}),errors=[];
 // Reproduce the missing secure-context API on LAN HTTP without changing randomness.
 await p.addInitScript(()=>{window.__hold=true;Object.defineProperty(crypto,'randomUUID',{value:undefined});});
 await p.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0}'}));p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base+map+`?lang=${lang}&controlpick=0&guides=0&hookGuide=0`);await p.waitForFunction(()=>window.skyStartReadiness?.ready,null,{timeout:90000});
 assert.ok(new URL(p.url()).pathname.endsWith(map));assert.equal(await p.locator('#onbSplash').isVisible(),false);assert.equal(await p.locator('#bStart').isVisible(),true);assert.equal(await p.locator('#introEntry').isVisible(),false);assert.equal(await p.locator('#bGuidedIntro').isVisible(),false);
 if(map==='index.html'&&lang==='ja'&&width===844)await p.screenshot({path:'browser-evidence/development-entry/home.png'});
 await p.locator('#homeDevelopment summary').click();assert.equal(await p.locator('#bGuidedIntro').isVisible(),true);
 assert.match(await p.locator('#bGuidedIntro').innerText(),lang==='ja'?/入門モードで遊ぶ/:/guided tutorial/);
 if(map==='index.html'&&lang==='ja'&&width===844)await p.screenshot({path:'browser-evidence/development-entry/development.png'});
 await p.locator('#bGuidedIntro').click();await p.waitForURL('**/canyon.html?learn=1*');await p.waitForFunction(()=>window.skyGuidedIntro&&__game.mode==='play',null,{timeout:90000});
 await p.locator('#learnGo').click();await p.keyboard.down('w');await p.evaluate(()=>{for(let i=0;i<180&&skyGuidedIntro.stage==='move';i++)__game.advance(1/60)});await p.keyboard.up('w');assert.equal(await p.evaluate(()=>skyGuidedIntro.stage),'vault');assert.deepEqual(errors,[]);
 results.push({map,lang,width,height,touch,readyWithoutRandomUUID:true,developmentEntry:true});console.log('PASS development entry',map,lang,width);await p.close();
}fs.writeFileSync('browser-evidence/development-entry/results.json',JSON.stringify(results,null,2));}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
