// Optional controlled GPU benchmark, not an ordinary-play or real-device study.
// Six native pursuers and real movement/rendering. Only initial life is raised
// to keep the same load running; no position/velocity corrections after setup.
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {spawn}=require('node:child_process'),{chromium}=require('playwright');
const port=18802,base=`http://127.0.0.1:${port}/`,out='browser-evidence/threat-load';
const seconds=Number(process.env.THREAT_BENCH_SECONDS||30),longSeconds=Number(process.env.THREAT_BENCH_LONG_SECONDS||120);
const maps=(process.env.THREAT_BENCH_MAPS||'index.html,canyon.html').split(',');
const modes=process.env.THREAT_BENCH_PROBE==='1'?[true]:[true,false,false,true];
(async()=>{let browser,server;const rows=[];try{
 fs.mkdirSync(out,{recursive:true});
 server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});
 for(let i=0;i<60;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100));}
 const provenance={};
 for(const file of ['index.html','canyon.html','threat-score.js','challenge-score.js']){
  const source=fs.readFileSync(file);assert.equal(await fetch(base+file).then(r=>r.text()),source.toString(),'local source: '+file);
  provenance[file]=crypto.createHash('sha256').update(source).digest('hex');
 }
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  args:['--no-sandbox','--use-gl=angle',process.platform==='darwin'?'--use-angle=metal':'--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const map of maps){
  const cases=modes.map((enabled,index)=>({enabled,seconds,index}));
  if(longSeconds>0)cases.push({enabled:true,seconds:longSeconds,index:'long'});
  for(const test of cases){
   const context=await browser.newContext({locale:'ja-JP',viewport:{width:1280,height:720}});
   await context.addInitScript(()=>window.__hold=true);
   let posts=0;await context.route('https://**/*',r=>{if(r.request().method()==='POST')posts++;return r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0}'})});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(90000);
   await page.goto(base+map);await page.waitForFunction(()=>window.__game&&window.skyStartReadiness?.ready);await page.locator('#bStart').click();
   const result=await page.evaluate(async test=>{
    const g=__game,s=__skyInternals,c=g.P,N=g.NAV,dt=1/60;
    let seed=105;Math.random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);g.startGame();
    let center,radius;
    for(const r of [4,3,2]){
     const offsets=[];for(let x=-r;x<=r;x++)for(let z=-r;z<=r;z++)offsets.push([x,z]);
     center=N.nodes.find(n=>Math.abs(n.y)<.1&&offsets.every(([x,z])=>{
      const node=g.nodeAt(n.x+x,n.y+.1,n.z+z);
      return node>=0&&Math.abs(N.nodes[node].y-n.y)<.1&&g.freeAt(n.x+x,n.y+.01,n.z+z,.35,1.8);
     }));
     if(center){radius=r;break;}
    }
    if(!center)throw Error('No supported open load area');
    for(const e of g.zombies){s.ue.remove(e.m.root);e.remove=true;}g.zombies.length=0;
    g.GAME.spawnT=g.GAME.surgeT=1e9;g.SCR.off=g.PACE.off=g.MARK.off=true;
    s.U.autoFire=false;s.U.aimAuto=false;g.placeAt({...center,yaw:-Math.PI/2});
    c.life=999;c.invuln=0;
    for(let i=0;i<6;i++){
     const angle=i*Math.PI/3,spawnRadius=radius*.8;
     const e=new g.Zombie(center.x+Math.cos(angle)*spawnRadius,.0001,center.z+Math.sin(angle)*spawnRadius);
     Object.assign(e,{spawnT:0,rise:null,onGround:true,flank:false,dropper:false,speedMul:1,navT:0});
     e.node=g.nodeAt(e.pos.x,e.pos.y+.1,e.pos.z);g.zombies.push(e);
    }
    skyChallengeScore.reset();
    const scoreCpu=[],nativeScoreStep=test.enabled?skyChallengeScore.step:()=>{};
    skyChallengeScore.step=dt=>{const at=performance.now();nativeScoreStep(dt);scoreCpu.push(performance.now()-at)};
    if(!test.enabled)skyChallengeScore.sync=()=>{};
    const gl=g.debug.renderer.getContext(),extension=gl.getExtension('WEBGL_debug_renderer_info');
    const renderer=extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
    for(let i=0;i<20;i++){await new Promise(requestAnimationFrame);g.frameOnce(0)}
    scoreCpu.length=0;
    const intervals=[],cpu=[],activeIntervals=[],trace=[];let previous,travel=0,last=c.pos.clone(),qualified=0;
    const frames=Math.round(test.seconds/dt),orbit=Math.min(2.2,radius*.6);
    for(let frame=0;frame<frames&&!g.GAME.over;frame++){
     const now=await new Promise(requestAnimationFrame),angle=Math.atan2(c.pos.z-center.z,c.pos.x-center.x)+.8;
     const x=center.x+Math.cos(angle)*orbit,z=center.z+Math.sin(angle)*orbit;
     c.yaw=Math.atan2(c.pos.x-x,c.pos.z-z);g.keys.KeyW=true;
     const started=performance.now();g.frameOnce(dt);cpu.push(performance.now()-started);
     travel+=c.pos.distanceTo(last);last.copy(c.pos);
     const threat=skyChallengeScore.threat(),near=g.zombies.filter(e=>!e.dead&&Math.abs(e.pos.y-c.pos.y)<3&&e.pos.distanceTo(c.pos)<18).length;
     if(previous!==undefined){const span=now-previous;intervals.push(span);if((test.enabled?threat.count:near)>=3){qualified++;activeIntervals.push(span)}}
     previous=now;
     if(frame%60===59)trace.push({frame,t:g.GAME.t,p:c.pos.toArray(),life:c.life,near,
      count:test.enabled?threat.count:null,pressure:test.enabled?threat.pressure:null,rate:test.enabled?threat.rate:null,repetition:test.enabled?threat.repetition:null,
      enemies:g.zombies.filter(e=>!e.dead).map(e=>({p:e.pos.toArray(),node:e.node,act:e.act?.kind||null,stun:e.stun}))});
    }
    g.keys.KeyW=false;
    const summarize=values=>{const sorted=[...values].sort((a,b)=>a-b),sum=values.reduce((a,b)=>a+b,0);return{
     frames:values.length,fps:values.length*1000/sum,meanMs:sum/values.length,
     p50:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],p99:sorted[Math.floor(sorted.length*.99)],
     over33ms:values.filter(n=>n>33.4).length};};
    const cpuStats=summarize(cpu),scoreStats=summarize(scoreCpu);delete cpuStats.fps;delete scoreStats.fps;
    return{...test,renderer,center:[center.x,center.y,center.z],radius,travel,gameSeconds:g.GAME.t,
     life:c.life,falls:g.stats.falls,alive:g.zombies.filter(e=>!e.dead).length,frames:summarize(intervals),cpu:cpuStats,scoreCpu:scoreStats,
     qualified,activeFrames:summarize(activeIntervals),trace,score:skyChallengeScore.current(),
     renderInfo:{calls:g.debug.renderer.info.render.calls,triangles:g.debug.renderer.info.render.triangles},
     quality:window.skyRenderQuality?.snapshot(),viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio,buffer:[gl.drawingBufferWidth,gl.drawingBufferHeight]},glError:gl.getError()};
   },test);
   result.worldHash=crypto.createHash('sha256').update(JSON.stringify(result.trace.map(t=>[t.frame,t.p.map(n=>+n.toFixed(3)),t.life,t.enemies.map(e=>e.p.map(n=>+n.toFixed(3)))]))).digest('hex');
   result.map=map;result.posts=posts;result.errors=errors;rows.push(result);
   fs.writeFileSync(out+'/results.json',JSON.stringify({provenance,fixture:'6 native pursuers, fixed-step native movement/render, initial life 999, no shooting or director spawns',rows},null,2));
   await page.screenshot({path:`${out}/${map}-${test.index}.png`});
   assert.equal(posts,0);assert.deepEqual(errors,[]);assert.equal(result.glError,0);
   assert.equal(result.alive,6,'all six native pursuers must survive');
   if(test.enabled)assert.ok(result.qualified>result.frames.frames*.5,'the load run must actually contain three or more eligible pursuers');
   console.log(JSON.stringify({map,index:test.index,enabled:test.enabled,seconds:result.gameSeconds,alive:result.alive,travel:result.travel,qualified:result.qualified,frames:result.frames,cpu:result.cpu,worldHash:result.worldHash}));
   await context.close();
  }
 }
}finally{await browser?.close();server?.kill();}})().catch(e=>{console.error(e);process.exitCode=1});
