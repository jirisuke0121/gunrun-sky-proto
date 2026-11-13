// 入門（canyon.html?learn=1）の読み込み中に、旧式の開始画面（#ovStart）が一瞬も見えないことを確かめる。
// 覆い（html.sky-learn-booting）が付いていない間に #ovStart が見えたフレームを数え、0であること。
const assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{const b=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});try{
 const base=process.env.RUNNING_QA_URL||'http://127.0.0.1:8882/';
 for(const [width,height,touch] of [[844,390,true],[1280,720,false]]){
  const p=await b.newPage({viewport:{width,height},hasTouch:touch,isMobile:touch,locale:'ja-JP'}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  await p.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0}'}));
  await p.addInitScript(()=>{window.__hold=true;window.__bootBad=0;window.__bootFrames=0;
   const tick=()=>{const d=document,s=d.getElementById('ovStart'),h=d.documentElement,g=window.__game;
    if(s&&d.body&&getComputedStyle(d.body).visibility!=='hidden'){window.__bootFrames++;
     const r=s.getBoundingClientRect(),cs=getComputedStyle(s),shown=cs.display!=='none'&&cs.visibility!=='hidden'&&!s.hidden&&r.width>0;
     if(shown&&!h.classList.contains('sky-learn-booting')&&!(g&&g.mode==='play'))window.__bootBad++;}
    requestAnimationFrame(tick)};requestAnimationFrame(tick);});
  await p.goto(base+'canyon.html?learn=1&camera='+(touch?'after':'before')+'&lang=ja&controlpick=0&guides=0&hookGuide=0');
  assert.equal(await p.evaluate(()=>document.documentElement.classList.contains('sky-learn-booting')),true,'cover is on from the first paint');
  await p.waitForFunction(()=>window.skyGuidedIntro&&__game.mode==='play',null,{timeout:120000});
  await p.waitForFunction(()=>!document.documentElement.classList.contains('sky-learn-booting'),null,{timeout:5000});
  const bad=await p.evaluate(()=>({bad:__bootBad,frames:__bootFrames}));
  assert.equal(bad.bad,0,'old start screen was visible for '+bad.bad+' frame(s)');
  assert.deepEqual(errors,[]);
  console.log('PASS learn boot cover',width,JSON.stringify(bad));await p.close();
 }
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
