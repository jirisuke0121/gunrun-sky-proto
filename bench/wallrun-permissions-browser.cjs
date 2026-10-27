const assert=require('node:assert/strict');
const fs=require('node:fs');
const {spawn}=require('node:child_process');
const {chromium}=require('playwright');
(async()=>{
  const base=process.env.RUNNING_QA_URL||'http://127.0.0.1:8773/';
  let server,browser;
  try{
    if(!process.env.RUNNING_QA_URL){
      server=spawn('python3',['-m','http.server','8773','--bind','127.0.0.1'],{stdio:'ignore'});
      for(let i=0;i<100;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100));}
    }
    browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    fs.mkdirSync('browser-evidence',{recursive:true});
    for(const mobile of [false,true])for(const map of ['old','canyon']){
      const context=await browser.newContext({viewport:mobile?{width:844,height:390}:{width:1280,height:720},hasTouch:mobile,isMobile:mobile});
      const page=await context.newPage(),id=`wallrun-${mobile?'touch':'desktop'}-${map}`,errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      try{
        await page.goto(new URL(`bench/human-wallrun-preview.html?map=${map}`,base).href,{waitUntil:'load'});
        await page.waitForFunction(()=>['passed','failed'].includes(document.body.dataset.result),null,{timeout:180000});
        const result=await page.locator('#result').innerText();
        fs.writeFileSync(`browser-evidence/${id}.txt`,result);
        await page.screenshot({path:`browser-evidence/${id}.png`});
        assert.equal(await page.evaluate(()=>document.body.dataset.result),'passed',result);
        assert.deepEqual(errors,[]);
        if(map==='old'){
          assert.equal((result.match(/PASS ショートカット先へ着地/g)||[]).length,5);
          assert.equal((result.match(/PASS 目印の全頂点が実際の壁面内/g)||[]).length,5);
          assert.ok((result.match(/PASS 非許可の壁面では発動しない/g)||[]).length>=8);
        }
        console.log(`PASS ${id}: ${map==='old'?'five shortcut landings, paint contained on its own wall, approved faces only, wall animation/shooting/exit':'existing canyon movement and rendering'}`);
      }finally{await context.close();}
    }
  }finally{await browser?.close();server?.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
