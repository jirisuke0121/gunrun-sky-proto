const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const {execFileSync}=require('node:child_process');
const baselineFiles=new Map();
const archetype=process.env.ASCENT_ARCHETYPE||'normal';
const out=process.env.ASCENT_OUT||'browser-evidence/ascent';fs.mkdirSync(out,{recursive:true});
(async()=>{let browser;const failures=[];try{
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:process.platform==='darwin'?['--no-sandbox']:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const map of (process.env.ASCENT_MAPS||'index,canyon').split(','))for(const difficulty of (process.env.ASCENT_LEVELS||(archetype==='stalker'?'legacy':'hard')).split(',')){
  const touch=['intro','normal'].includes(difficulty),stem=out+'/'+(difficulty==='hard'?'':difficulty+'-')+map;
  const context=await browser.newContext({viewport:touch?{width:844,height:390}:{width:1280,height:720},hasTouch:touch,isMobile:touch});
  await context.addInitScript(id=>{window.__hold=true;localStorage.setItem('gunrun-challenge-difficulty-v1',id==='intro'?'normal':id);localStorage.setItem('gunrun-sky-proto-v1',JSON.stringify({sendLog:false}));},difficulty);
  await context.route('**/*',route=>{
   const u=new URL(route.request().url());
   if(process.env.ASCENT_PUBLIC==='1'&&u.origin==='https://jirisuke0121.github.io')return route.continue();
   if(u.origin==='https://ascent.test'){
    const f=decodeURIComponent(u.pathname).slice(1);if(!f.includes('..')&&fs.existsSync(f)&&fs.statSync(f).isFile())return route.fulfill({status:200,contentType:({html:'text/html',js:'application/javascript',css:'text/css',svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',webp:'image/webp'})[path.extname(f).slice(1)]||'application/octet-stream',body:process.env.ASCENT_BASE_REF?(()=>{if(!baselineFiles.has(f))baselineFiles.set(f,execFileSync('git',['show',process.env.ASCENT_BASE_REF+':'+f],{maxBuffer:16*1024*1024}));return baselineFiles.get(f);})():fs.readFileSync(f)});
    return route.abort();
   }
   return route.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"top":[],"total":0}'});
  });
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));
  const base=process.env.ASCENT_PUBLIC==='1'?'https://jirisuke0121.github.io/gunrun-sky-proto/':'https://ascent.test/';
  await page.goto(base+map+'.html?verify=ascent'+(difficulty==='legacy'?'&dev=1':''));await page.waitForFunction(()=>skyStartReadiness?.ready&&window.skyZombieClimb);
  if(difficulty==='legacy')await page.evaluate(()=>{const custom=document.getElementById('challengeCustom');custom.checked=true;custom.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.locator(difficulty==='intro'?'#bIntro':'#bStart').click();assert.equal(await page.evaluate(()=>skyChallenge.id),difficulty);
  const inventory=await page.evaluate(()=>__game.LADDERS.map((L,i)=>({ladder:i,x:L.x,z:L.z,y0:L.y0,y1:L.y1,nx:L.nx,nz:L.nz,edges:__game.NAV.E.filter(e=>e.kind===5&&e.ladder===L).map(e=>({from:__game.NAV.nodes[e.from],to:__game.NAV.nodes[e.to],len:e.len,climb:e.climb}))})));
  fs.writeFileSync(stem+'-ladders.json',JSON.stringify(inventory,null,2));
  const fixtures=inventory.flatMap(({ladder})=>[{ladder,archetype,count:1,mode:'free'},{ladder,archetype,count:8,mode:'free'},{ladder,archetype,count:8,mode:'entry'},{ladder,archetype,count:8,mode:'exit'}]).filter(f=>!process.env.ASCENT_COUNTS||process.env.ASCENT_COUNTS.split(',').includes(String(f.count))).filter(f=>!process.env.ASCENT_MODES||process.env.ASCENT_MODES.split(',').includes(f.mode)).slice(+process.env.ASCENT_START||0,(+process.env.ASCENT_START||0)+(+process.env.ASCENT_LIMIT||10000));
  const results=[];
  for(const f of fixtures){
   const row=await page.evaluate(({f,seconds,code,retain})=>{window.ascentFixture=f;window.ascentSeconds=seconds;window.ascentRetain=retain;return eval(code);},{f,seconds:+process.env.ASCENT_SECONDS||90,retain:process.env.ASCENT_RETAIN==='1',code:fs.readFileSync('bench/zombie-ascent-scenarios.js','utf8')});
   results.push(row);fs.writeFileSync(stem+'-results.json',JSON.stringify({map,difficulty,touch,archetype,errors,results},null,2));
   console.log(map,difficulty,f.ladder,f.count,f.mode,row.skipped||JSON.stringify({arrived:row.arrived,first:row.firstAction,ladderPenetrations:row.ladderPenetrations,ladderPairOverlaps:row.ladderPairOverlaps,climbs:row.climbs}));
   if(row.skipped||row.arrived.some(t=>t===null)||row.ladderPenetrations||row.ladderPairOverlaps||row.maxStep>=1)failures.push({map,difficulty,...f,skipped:row.skipped,arrived:row.arrived,ladderPairOverlaps:row.ladderPairOverlaps,ownedPenetrations:row.ownedPenetrations,maxStep:row.maxStep});
   if(process.env.ASCENT_DETAIL==='1'){
    await page.evaluate(()=>{const g=__game,L=g.LADDERS[ascentFixture.ladder],y=L.y0+(L.y1-L.y0)/2,target={x:L.x+L.nx*.5,y,z:L.z+L.nz*.5};
      const candidates=[];for(const back of [7,6,5,4,3,2])for(const side of [0,2,-2,4,-4])candidates.push({x:L.x+L.nx*back-L.nz*side,y:y+1,z:L.z+L.nz*back+L.nx*side});
      const camera=candidates.find(p=>skyZombieClimb.clearLine({r:.05,h:.05},p,target))||candidates.at(-1);
      for(const e of g.zombies)e.m.root.visible=true;
      g.debug.camera.fov=90;g.debug.camera.updateProjectionMatrix();g.debug.camera.position.set(camera.x,camera.y,camera.z);g.debug.camera.lookAt(target.x,target.y,target.z);g.debug.renderer.render(g.debug.scene,g.debug.camera);});
    await page.screenshot({path:stem+'-'+f.ladder+'-'+f.count+'-'+f.mode+'.png'});
   }
  }
  if(process.env.ASCENT_ASSERT!=='0'&&archetype==='normal'&&map==='index'&&fixtures.length===40)assert.ok(results.some(r=>r.count===8&&r.climbs>0),map+'/'+difficulty+': crowds also use valid wall routes');
  assert.deepEqual(errors,[]);await context.close();
 }
 if(process.env.ASCENT_ASSERT!=='0')assert.deepEqual(failures,[],'all tested pursuers must reach the upper footing');
}finally{await browser?.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
