const assert=require('node:assert/strict'),fs=require('node:fs'),{spawn}=require('node:child_process'),{chromium}=require('playwright');
(async()=>{let server,browser;const rows=[],base='http://127.0.0.1:8896/',out='browser-evidence/hybrid-camera';try{
server=spawn('python3',['-m','http.server','8896','--bind','127.0.0.1'],{stdio:'ignore'});
for(let i=0;i<100;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100));}
browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--enable-unsafe-swiftshader']});
for(const touch of[false,true]){
 const c=await browser.newContext({viewport:touch?{width:844,height:390}:{width:1280,height:720},isMobile:touch,hasTouch:touch,locale:'ja-JP'});await c.addInitScript(()=>window.__hold=true);let posts=0;const errors=[];
 await c.route('https://**/*',r=>{if(r.request().method()==='POST')posts++;return r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0}'});});
 const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'bench/hybrid-camera-review.html');
 const ready=()=>p.waitForFunction(()=>!document.getElementById('play').disabled,null,{timeout:90000});await ready();
 for(const variant of['fixed','hybrid']){await p.locator(`[data-variant="${variant}"]`).click();await ready();assert.equal(await p.evaluate(()=>new URL(document.querySelector('iframe').contentWindow.location.href).searchParams.get('cameraTrial')),variant);}
 await p.locator('#scene').selectOption('street');await ready();await p.locator('#play').click();
 const before=await p.evaluate(()=>document.querySelector('iframe').contentWindow.__game.P.pos.toArray());
 await p.keyboard.down('w');await p.waitForFunction(before=>{const w=document.querySelector('iframe').contentWindow,c=w.__game.P.pos;return Math.hypot(c.x-before[0],c.z-before[2])>.2;},before);await p.keyboard.up('w');
 const state=await p.evaluate(()=>{const w=document.querySelector('iframe').contentWindow;return{mode:w.__game.mode,send:w.__game.S.sendLog,width:document.documentElement.scrollWidth,viewport:innerWidth};});assert.equal(state.mode,'play');assert.equal(state.send,false);assert.ok(state.width<=state.viewport+1);assert.equal(posts,0);assert.deepEqual(errors,[]);
 await p.screenshot({path:`${out}/review-${touch?'touch':'desktop'}.png`});rows.push({touch,state,posts,errors});await c.close();
}fs.writeFileSync(out+'/review-results.json',JSON.stringify(rows,null,2));console.log('PASS hybrid comparison: both variants, scene selection, native play, responsive width, no uploads');
}finally{await browser?.close();server?.kill();}})().catch(e=>{console.error(e);process.exitCode=1});
