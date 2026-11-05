const assert=require('node:assert/strict'),path=require('node:path'),{spawn}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {SPOTS}=require('../start-spots.js');
// Every run starts on a random high-ground spot of the old town; canyon, ?start=default and plain automation keep the old start.
const dir=path.resolve(__dirname,'..'),port=process.argv[2]||'18841';
(async()=>{
 const server=spawn('python3',['-m','http.server',port,'--bind','127.0.0.1'],{stdio:'ignore',cwd:dir});await new Promise(r=>setTimeout(r,1200));
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const open=async(url,{difficulty='normal'}={})=>{
  const ctx=await browser.newContext({viewport:{width:800,height:450}});await ctx.addInitScript(()=>window.__hold=true);
  await ctx.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0}'}));
  const page=await ctx.newPage();page.setDefaultTimeout(120000);await page.goto(`http://127.0.0.1:${port}/${url}`);
  await page.waitForFunction(()=>window.__game&&window.skyStartReadiness?.ready);
  if(difficulty==='intro')await page.locator('#bIntro').click();else{await page.locator(`#homeDifficulty [data-difficulty="${difficulty}"]`).click();await page.locator('#bStart').click()}
  await page.waitForFunction(()=>__game.mode==='play');return{ctx,page}};
 const where=page=>page.evaluate(()=>({x:+__game.P.pos.x.toFixed(1),y:+__game.P.pos.y.toFixed(1),z:+__game.P.pos.z.toFixed(1)}));
 const isSpot=p=>SPOTS.find(s=>Math.hypot(s.x-p.x,s.z-p.z)<.6&&Math.abs(s.y-p.y)<.3);
 // 1. All difficulties incl. Beginner start on a listed high-ground spot and stay there (no fall, no clipping).
 for(const difficulty of ['easy','normal','hard','intro']){
  const {ctx,page}=await open('index.html?random_start=1',{difficulty});
  const p0=await where(page);assert.ok(isSpot(p0),`${difficulty}: start ${JSON.stringify(p0)} is a listed spot`);assert.ok(p0.y>=4,`${difficulty}: high ground`);
  await page.evaluate(()=>{__game.P.invuln=1e9;for(let i=0;i<120;i++)__game.advance(1/60)});
  const p1=await where(page);assert.ok(Math.hypot(p1.x-p0.x,p1.z-p0.z)<.6&&Math.abs(p1.y-p0.y)<.3,`${difficulty}: stable after 2 s`);
  assert.ok(await page.evaluate(()=>__game.zombies.filter(e=>!e.dead).length)>0,`${difficulty}: chasers exist`);
  console.log('PASS start',difficulty,JSON.stringify(p0));await ctx.close();
 }
 // 2. It varies: 14 runs -> several spots, never the same one twice in a row; the restart button re-rolls too.
 {const {ctx,page}=await open('index.html?random_start=1');const seen=[];
  for(let i=0;i<14;i++){await page.evaluate(()=>__game.startGame());const s=isSpot(await where(page));assert.ok(s,'listed spot');seen.push(s.id)}
  assert.ok(new Set(seen).size>=5,`varies: ${seen.join(',')}`);for(let i=1;i<seen.length;i++)assert.notEqual(seen[i],seen[i-1],'no immediate repeat');
  const before=isSpot(await where(page)).id;await page.evaluate(()=>{__game.P.invuln=1e9});
  await page.evaluate(()=>document.getElementById('bRestart')?.click());await page.waitForFunction(()=>__game.mode==='play');
  const after=isSpot(await where(page));assert.ok(after&&after.id!==before,'restart re-rolls the spot');
  console.log('PASS varies',seen.join(','));await ctx.close();}
 // 3. Switches.
 for(const [url,expect] of [['index.html?start=default&random_start=1','default'],['index.html','default'],['canyon.html?random_start=1','default']]){
  const {ctx,page}=await open(url);const p=await where(page);assert.equal(isSpot(p),undefined,`${url}: not a random spot`);assert.ok(p.y<1,`${url}: street start ${JSON.stringify(p)}`);console.log('PASS',url,JSON.stringify(p));await ctx.close();}
 {const id=SPOTS[2].id,{ctx,page}=await open(`index.html?start_spot=${id}`);assert.equal(isSpot(await where(page)).id,id,'?start_spot forces a spot');await ctx.close();}
 await browser.close();server.kill();console.log('PASS start-spots browser');
})().catch(e=>{console.error(e);process.exit(1)});
