const assert=require('node:assert/strict'),fs=require('node:fs'),{spawn}=require('node:child_process');
const {chromium}=require('playwright');
(async()=>{let browser,server;try{
 server=spawn(process.execPath,['bench/minimap-review-server.cjs'],{env:{...process.env,PORT:'8832'},stdio:'ignore'});
 for(let i=0;i<100;i++){if(await fetch('http://127.0.0.1:8832/').then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100))}
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1280,height:900},locale:'ja-JP'});
 await page.goto('http://127.0.0.1:8832/bench/minimap-review.html');await page.locator('#verify').click();
 await page.waitForFunction(()=>/^(完了|失敗)/.test(document.getElementById('status').textContent),null,{timeout:480000});
 const state=await page.locator('#status').innerText(),text=await page.locator('#results').innerText();
 fs.mkdirSync('browser-evidence/minimap',{recursive:true});fs.writeFileSync('browser-evidence/minimap/results.json',text);
 await page.screenshot({path:'browser-evidence/minimap/last-layout.png',fullPage:true});
 assert.equal(state,'完了',text);const report=JSON.parse(text);assert.equal(report.passed,true);assert.equal(report.results.length,8);
 console.log('PASS 40m nearby enemies, centred follow, heights, floor cache, pause, off, start/retry and non-overlapping HUD on both maps × four layouts');
}finally{await browser?.close();server?.kill()}})().catch(e=>{console.error(e);process.exitCode=1});
