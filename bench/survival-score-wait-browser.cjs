// A quiet start and the following real chase both earn time-based survival points.
// Native terrain, movement and pursuers; no position corrections after setup.
const assert=require('node:assert/strict'),fs=require('node:fs'),{spawn}=require('node:child_process');
const {chromium}=require('playwright');
const port=18801,base=`http://127.0.0.1:${port}/`,out='browser-evidence/survival-wait';
(async()=>{let browser,server;const rows=[];try{
 fs.mkdirSync(out,{recursive:true});
 server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});
 for(let i=0;i<60;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100));}
 for(const file of ['index.html','canyon.html','survival-score.js','challenge-score.js'])assert.equal(await fetch(base+file).then(r=>r.text()),fs.readFileSync(file,'utf8'),'local source: '+file);
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const map of ['index.html','canyon.html'])for(const resetTracker of [true,false]){
  const context=await browser.newContext({locale:'ja-JP',viewport:{width:1280,height:720}});
  await context.addInitScript(()=>{window.__hold=true;let seed=105;Math.random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296)});
  let posts=0;await context.route('https://**/*',r=>{if(r.request().method()==='POST')posts++;return r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0}'})});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(90000);
  await page.goto(base+map);await page.waitForFunction(()=>window.__game&&window.skyStartReadiness?.ready);await page.locator('#bStart').click();
  const result=await page.evaluate(resetTracker=>{
   const g=__game,s=__skyInternals,c=g.P,N=g.NAV,dt=1/60;
   const start=N.nodes.find(n=>Math.abs(n.y)<.1&&Array.from({length:71},(_,i)=>i*.5-5).every(dx=>{
    const node=g.nodeAt(n.x+dx,.1,n.z);return node>=0&&Math.abs(N.nodes[node].y)<.1&&g.freeAt(n.x+dx,.01,n.z,.45,1.8);
   }));
   if(!start)throw Error('No walkable strip');
   for(const e of g.zombies){s.ue.remove(e.m.root);e.remove=true;}g.zombies.length=0;
   g.GAME.spawnT=g.GAME.surgeT=1e9;g.SCR.off=g.PACE.off=g.MARK.off=true;
   s.U.autoFire=false;s.U.aimAuto=false;g.placeAt({...start,yaw:-Math.PI/2});
   skyChallengeScore.reset();
   for(let i=0;i<1260;i++)g.advance(dt);
   const before={...skyChallengeScore.current()};
   if(resetTracker)skyChallengeScore.reset();
   for(const dz of [-.5,.5]){
    const e=new g.Zombie(start.x-4,.0001,start.z+dz);
    Object.assign(e,{spawnT:0,rise:null,onGround:true,flank:false,dropper:false,speedMul:1,navT:0});
    e.node=g.nodeAt(e.pos.x,e.pos.y+.1,e.pos.z);g.zombies.push(e);
   }
   const from=c.pos.toArray(),trace=[];g.keys.KeyW=true;
   for(let i=0;i<120&&!g.GAME.over;i++){
    g.advance(dt);g.cam(dt);
    if(i%9===8)trace.push({t:g.GAME.t,p:c.pos.toArray(),life:c.life,state:c.state,...skyChallengeScore.pursuit()});
   }
   g.keys.KeyW=false;g.frameOnce(0);
   return{resetTracker,before,from,to:c.pos.toArray(),life:c.life,score:skyChallengeScore.current(),trace};
  },resetTracker);
  rows.push({map,...result,posts,errors});fs.writeFileSync(out+'/results.json',JSON.stringify(rows,null,2));
  assert.deepEqual(errors,[]);assert.equal(posts,0);assert.ok(result.before.survival>=2700,'quiet waiting earns survival points');
  assert.ok(result.trace.some(r=>r.count>0),'a real nearby pursuer must be counted');
  assert.ok(result.to[0]-result.from[0]>5,'real movement must leave the starting point');
  assert.ok(result.score.survival>0,'the first chase after quiet waiting must earn');
  assert.equal(result.score.survival,Math.floor(result.score.elapsed*120*result.score.difficulty+1e-7),'chase state does not affect survival points');
  await page.screenshot({path:`${out}/${map}-${resetTracker?'control':'wait'}.png`});
  console.log('PASS',map,resetTracker?'fresh damage/feedback tracker control':'21s quiet wait then first native chase',result.score.survival,'survival points');
  await context.close();
 }
}finally{await browser?.close();server?.kill();}})().catch(e=>{console.error(e);process.exitCode=1});
