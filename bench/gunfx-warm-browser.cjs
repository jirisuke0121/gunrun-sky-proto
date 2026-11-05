const assert=require('node:assert/strict'),path=require('node:path'),{spawn}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
// The shader warm-up fires a fake head hit ~3 s after load. It must be silent (no "headshot" voice) even when the
// audio context already exists, while a real head hit still plays the headshot clip.
const dir=path.resolve(__dirname,'..'),port=process.argv[2]||'18842';
(async()=>{
 const server=spawn('python3',['-m','http.server',port,'--bind','127.0.0.1'],{stdio:'ignore',cwd:dir});await new Promise(r=>setTimeout(r,1200));
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
 for(const map of ['index.html','canyon.html']){
  const ctx=await browser.newContext({viewport:{width:800,height:450}});
  await ctx.addInitScript(()=>{window.__hs=0;window.__starts=0;const dec=AudioContext.prototype.decodeAudioData;
   AudioContext.prototype.decodeAudioData=function(ab,ok,no){const size=ab.byteLength;return dec.call(this,ab,buf=>{if(size===9764)buf.__hs=1;ok&&ok(buf)},no)};
   const st=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...a){window.__starts++;if(this.buffer&&this.buffer.__hs)window.__hs++;return st.apply(this,a)}});
  await ctx.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0}'}));
  const page=await ctx.newPage();page.setDefaultTimeout(120000);await page.goto(`http://127.0.0.1:${port}/${map}`);
  await page.waitForFunction(()=>window.__game&&window.skyStartReadiness?.ready);
  await page.locator('#bStart').click();await page.waitForFunction(()=>__game.mode==='play');await page.waitForTimeout(600);
  await page.evaluate(()=>{window.__hs=0;window.__starts=0;window.__gunFxWarm()});await page.waitForTimeout(800);
  const quiet=await page.evaluate(()=>({hs:window.__hs,starts:window.__starts}));
  assert.equal(quiet.hs,0,`${map}: the warm-up plays no headshot clip`);
  // Real head hit: the headshot clip plays (the clip loads on first use, so allow a moment).
  let played=0;
  for(let i=0;i<6&&!played;i++){
   await page.evaluate(()=>{const P=__game.P.pos,z={dead:false,m:null,pos:P.clone?P.clone():P,vel:null};window.__gunFx.hit(true,P.clone?P.clone():P,z,{x:0,y:0,z:-1})});
   await page.waitForTimeout(1500);played=await page.evaluate(()=>window.__hs);}
  assert.ok(played>=1,`${map}: a real head hit plays the headshot clip`);
  console.log('PASS',map,'warm-up silent, real head hit plays the headshot clip');await ctx.close();
 }
 await browser.close();server.kill();
})().catch(e=>{console.error(e);process.exit(1)});
