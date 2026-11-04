const assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync,spawn}=require('node:child_process');
const {chromium}=require('playwright');
const base=process.env.RUNNING_QA_URL||'http://127.0.0.1:8793/';
const baseline=process.env.WALL_APPROACH_BASELINE==='1',out=process.env.WALL_APPROACH_OUT||'browser-evidence/zombie-wall-approach';
const baselineRef=process.env.WALL_APPROACH_BASE_REF||'8b1eda4';
const changed=['index.html','enhancements.js','zombie-climb.js'];
fs.mkdirSync(out,{recursive:true});
(async()=>{let browser,server;
 const results=[];
 try{
  if(!process.env.RUNNING_QA_URL){
   server=spawn('python3',['-m','http.server','8793','--bind','127.0.0.1'],{stdio:'ignore'});
   for(let i=0;i<60;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100));}
  }
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
   args:process.platform==='darwin'?['--no-sandbox']:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  for(const touch of baseline?[true]:[false,true]){
  const context=await browser.newContext({viewport:touch?{width:1280,height:591}:{width:1280,height:720},hasTouch:touch,isMobile:touch});
  await context.addInitScript(()=>{window.__hold=true;localStorage.setItem('gunrun-sky-proto-v1',JSON.stringify({sendLog:false}));});
  await context.route('**/*',route=>{
   const u=new URL(route.request().url());
   if(u.origin!==new URL(base).origin)return route.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0,"ok":true}'});
   const name=u.pathname.split('/').at(-1);
   if(baseline&&changed.includes(name))return route.fulfill({status:200,contentType:name.endsWith('.html')?'text/html':'text/javascript',body:execFileSync('git',['show',baselineRef+':'+name],{encoding:'utf8',maxBuffer:8*1024*1024})});
   return route.continue();
  });
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'index.html?lang=ja',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.skyStartReadiness?.ready&&window.skyZombieClimb);
  await page.locator('#bStart').click();
  const result=await page.evaluate(({baseline})=>{
   const g=__game,s=__skyInternals,c=g.P,dt=1/60;
   function seed(value){let state=value;Math.random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);}
   function place(p){c.pos.set(...p);c.vel.set(0,0,0);Object.assign(c,{state:'normal',onGround:true,h:1.75,ledge:null,ladder:null,zip:null,hook:null,jumpBuf:0,slideBuf:0,invuln:0,yaw:Math.PI,pitch:0});c.lastGround.copy(c.pos);c.safe.copy(c.pos);g.updateField();skyFollowCamera.reset();}
   function start(value,natural=false){seed(value);g.startGame();g.S.sendLog=false;g.S.autoFire=g.S.aimAuto=false;
    if(!natural){for(const e of g.zombies)s.ue.remove(e.m.root);g.zombies.length=0;g.GAME.spawnT=1e9;g.SCR.off=g.PACE.off=g.MARK.off=true;g.STALK.spawned=true;}
   }
   const fixtures=[{id:'south-right',p:[30,5.003,-26.3],e:[34,.003,-24]},
    {id:'south-left',p:[30,5.003,-26.3],e:[24,.003,-24]},
    {id:'lower-ring-flanker',p:[30,5.003,-26.3],e:[30,-3.497,-34],flank:true},
    {id:'right-end',p:[35,5.003,-26.3],e:[37,.003,-24]},
    {id:'left-end',p:[24,5.003,-26.3],e:[21,.003,-24]},
    {id:'wall-lip-after-shove',p:[27.33,5.0001,-27.66],e:[33.25,.003,-24.9]},
    {id:'tower-descent',p:[30,5.003,-26.3],e:[43,14.403,-9],seconds:80}];
   const rows=[];
   for(const fixture of baseline?fixtures.slice(0,1):fixtures){
    start(20261102);place(fixture.p);const e=new g.Zombie(...fixture.e);
    Object.assign(e,{spawnT:0,onGround:true,flank:!!fixture.flank,dropper:false,stalker:false,lastHitT:-99});g.zombies.push(e);
    const before={...skyZombieClimb.stats},life=c.life;let penetrations=0;
    for(let i=0;i<(fixture.seconds||40)/dt&&!g.GAME.over&&c.life===life;i++){
     g.advance(dt);if(e.act?.kind==='pillar'&&!s.oe(e.pos.x,e.pos.y+.012,e.pos.z,e.r,e.h))penetrations++;
    }
    rows.push({...fixture,damaged:c.life<life,time:g.GAME.t,life:c.life,player:c.pos.toArray(),enemy:e.pos.toArray(),
     climbs:skyZombieClimb.stats.started-before.started,finished:skyZombieClimb.stats.finished-before.finished,penetrations});
   }
   const natural=[];
   if(!baseline){
    g.setMode('menu');const selector=document.getElementById('challengeDifficulty');selector.value='hard';selector.dispatchEvent(new Event('change',{bubbles:true}));
    for(const value of [20261102,20261103,20261104]){
     start(value,true);place([30,5.003,-26.3]);const life=c.life;let firstDamage=null,penetrations=0;
     for(let i=0;i<120/dt&&!g.GAME.over;i++){
      g.advance(dt);if(c.life<life&&firstDamage===null)firstDamage=g.GAME.t;
      for(const e of g.zombies)if(e.act?.kind==='pillar'&&!s.oe(e.pos.x,e.pos.y+.012,e.pos.z,e.r,e.h))penetrations++;
     }
     const result={seed:value,difficulty:skyChallenge.id,firstDamage,life:c.life,over:g.GAME.over,time:g.GAME.t,penetrations};
     if (!result.over) {
      result.player=c.pos.toArray();
      result.playerNode=c.node;
      result.approach=skyZombieClimb.navigationTargets();
      result.enemies=g.zombies.filter(e=>!e.dead).map(e=>({pos:e.pos.toArray(),node:e.node,action:e.act?.kind,climb:skyZombieClimb.state(e)}));
     }
     natural.push(result);
    }
   }
   g.cam(0);g.frameOnce(0);return {rows,natural,gl:g.debug.renderer.getContext().getError()};
  },{baseline});
  results.push({touch,baseline,...result,errors});fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));
  await page.screenshot({path:out+'/'+(touch?'touch':'desktop')+'.png'});
  assert.deepEqual(errors,[]);assert.equal(result.gl,0);
  for(const row of result.rows){assert.equal(row.damaged,!baseline,JSON.stringify(row));assert.equal(row.penetrations,0);if(!baseline)assert.ok(row.finished>0,JSON.stringify(row));}
  for(const row of result.natural){assert.equal(row.difficulty,'hard');assert.ok(row.firstDamage!==null&&row.life===0&&row.over,JSON.stringify(row));assert.equal(row.penetrations,0);}
  console.log(JSON.stringify({touch,baseline,rows:result.rows.map(({id,time,damaged})=>({id,time,damaged})),natural:result.natural}));
  await context.close();
 }}finally{await browser?.close();server?.kill();}
})().catch(e=>{console.error(e);process.exitCode=1});
