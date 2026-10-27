const fs=require('node:fs'),os=require('node:os'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {chromium}=require('playwright');
const map=process.env.BENCH_MAP||'index.html',density=process.env.BENCH_DENSITY||'cluster';
(async()=>{let server,browser;try{
 server=spawn('python3',['-m','http.server','8774','--bind','127.0.0.1'],{stdio:'ignore'});
 for(let i=0;i<100;i++){if(await fetch('http://127.0.0.1:8774/').then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,channel:'chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:1});await context.addInitScript(()=>{window.__hold=true;});
 await context.route('**/*',route=>{const u=route.request().url();if(!u.startsWith('http://127.0.0.1:8774/'))return route.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0,"ok":true}'});if(u.endsWith('/'+map)){
  let s=fs.readFileSync(map,'utf8');s=s.replace('window.__skyInternals={','window.__skyInternals={benchModels:()=>zMeshy,');
  const a=s.indexOf('function so(n,t,e,i){'),b=s.indexOf('var c={pos:',a),fn=s.slice(a,b).replace('function so(','function benchSearch(');
  s=s.slice(0,a)+fn+'function so(...args){const p=performance.now();try{return benchSearch(...args)}finally{window.__navMs=(window.__navMs||0)+performance.now()-p}}'+s.slice(b);
  return route.fulfill({status:200,contentType:'text/html',body:s});}return route.continue();});
 const page=await context.newPage();page.setDefaultTimeout(60000);await page.goto('http://127.0.0.1:8774/'+map);
 await page.waitForFunction(()=>window.__skyInternals?.benchModels().length>=4&&window.__skyUpgrade?.loaded?.mg);
 await page.locator('#humanSel [data-human="unity"]').click();await page.waitForFunction(()=>document.body.dataset.skyHumanLoaded==='true');await page.locator('#bStart').click();await page.waitForFunction(()=>Object.keys(window.skyZombieNear?.results||{}).length===4&&window.__skyInternals.zombieModels().every(e=>e.lo));
 const result=await page.evaluate(async({density,map})=>{
  const g=window.__game,s=window.__skyInternals,c=g.P,r=g.debug.renderer,T=s.Geom;
  Object.assign(g.S,{sendLog:false,stalkerOn:false,stalker2:false,dropShare:0,gunOn:true,autoFire:false,aimAuto:false});
  g.SCR.off=g.PACE.off=g.MARK.off=true;g.GAME.spawnT=g.GAME.surgeT=1e9;c.invuln=1e9;
  const start=c.pos.clone(),nodes=g.NAV.nodes.filter(n=>Math.abs(n.y-start.y)<.2&&Math.hypot(n.x-start.x,n.z-start.z)<25&&s.oe(n.x,n.y+.05,n.z,.34,1.8));
  nodes.sort((a,b)=>Math.hypot(a.x-start.x,a.z-start.z)-Math.hypot(b.x-start.x,b.z-start.z));
  const centre=nodes.find(n=>!s.raycast(start.x,start.y+1.2,start.z,(n.x-start.x)/Math.hypot(n.x-start.x,n.z-start.z),0,(n.z-start.z)/Math.hypot(n.x-start.x,n.z-start.z),Math.hypot(n.x-start.x,n.z-start.z))&&[-2,0,2].every(dx=>[-2,0,2].every(dz=>s.oe(n.x+dx,n.y+.05,n.z+dz,.32,1.8)))&&Math.hypot(n.x-start.x,n.z-start.z)>5)||nodes[0];
  const locations=Array.from({length:20},(_,i)=>density==='cluster'?{x:centre.x+(i%5-2)*.61,y:centre.y,z:centre.z+(Math.floor(i/5)-1.5)*.61}:nodes[Math.floor((i+1)*nodes.length/21)]);
  const origin=start.clone(),initial=new Map();let aiMs=0;
  const update=s.ri.prototype.update;s.ri.prototype.update=function(dt){const t=performance.now();try{return update.call(this,dt)}finally{aiMs+=performance.now()-t}};
  const quant=(a,p)=>{const x=[...a].sort((a,b)=>a-b);return x[Math.min(x.length-1,Math.floor(x.length*p))]||0;};
  const summary=a=>({median:quant(a,.5),p95:quant(a,.95),p99:quant(a,.99),mean:a.reduce((s,x)=>s+x,0)/a.length});
  const trials=[];
  for(let repeat=0;repeat<3;repeat++)for(const mode of (repeat%2?['near','original']:['original','near']))for(const count of [8,12,20]){
   for(const e of s.zombieModels()){if(e.originalHi){e.hi=mode==='near'?e.nearHi:e.originalHi;e.nearRevision++;}}
   for(const z of s.Jt){s.ue.remove(z.m.root);if(z.pool)s.ue.remove(z.pool);}s.Jt.length=0;g.S.maxZombies=count;
   let seed=123456+repeat;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
   for(let i=0;i<count;i++){const p=locations[i],z=new s.ri(p.x,p.y+.01,p.z);z.hp=1e6;z.spawnT=0;z.dropper=false;z.stalker=false;z.flank=false;s.Jt.push(z);}
   const cpu=[],ai=[],nav=[],submit=[],gpuWait=[],calls=[],triangles=[];
   for(let frame=0;frame<360;frame++){
    const t=frame/60;c.pos.copy(origin);c.pos.x+=Math.sin(t)*1.2;c.vel.set(Math.cos(t)*1.2,0,0);c.state='normal';c.onGround=true;c.yaw=Math.atan2(-(centre.x-c.pos.x),-(centre.z-c.pos.z));c.pitch=-.25;c.life=3;c.invuln=1e9;c.node=g.nodeAt(c.pos.x,c.pos.y+.1,c.pos.z);g.GAME.t=5;g.GAME.spawnT=g.GAME.surgeT=1e9;
    if(frame%120===0)for(let i=0;i<count;i++){const z=s.Jt[i],p=locations[i];z.pos.set(p.x,p.y+.01,p.z);z.vel.set(0,0,0);z.node=g.nodeAt(z.pos.x,z.pos.y+.1,z.pos.z);z.navT=0;}
    aiMs=0;window.__navMs=0;const now=performance.now();g.advance(1/60);g.cam(1/60);window.skyHumanView.update(1/60);const elapsed=performance.now()-now;
    if(s.Jt.length!==count)throw Error('Enemy count changed '+s.Jt.length+' vs '+count);
    if(frame>=60){cpu.push(elapsed);ai.push(aiMs);nav.push(window.__navMs);}
    if(frame>=60&&frame%60===0){r.clear();let now=performance.now();r.render(s.ue,s.Se);submit.push(performance.now()-now);now=performance.now();r.getContext().finish();gpuWait.push(performance.now()-now);calls.push(r.info.render.calls);triangles.push(r.info.render.triangles);}
   }
   trials.push({mode,count,repeat,cpu:summary(cpu),ai:summary(ai),nav:summary(nav),renderSubmit:summary(submit),softwareGpuWait:summary(gpuWait),calls:summary(calls),triangles:summary(triangles),models:s.Jt.filter(z=>z.m.meshy).length});
  }
  const gl=r.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
  return{map,density,trials,renderer:gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),userAgent:navigator.userAgent,viewport:[innerWidth,innerHeight],settings:{maxZombies:g.S.maxZombies,zLook:g.S.zLook},locations,origin:origin.toArray()};
 },{map,density});
 fs.mkdirSync('near-evidence',{recursive:true});fs.writeFileSync(`near-evidence/${map}-${density}.json`,JSON.stringify({...result,host:{cpu:os.cpus()[0].model,threads:os.cpus().length}},null,2));
 console.log(JSON.stringify(result.trials.map(t=>({mode:t.mode,n:t.count,rep:t.repeat,cpu:t.cpu,ai:t.ai,nav:t.nav,calls:t.calls.mean,tris:t.triangles.mean,gpu:t.softwareGpuWait.mean,models:t.models}))));
 }finally{await browser?.close();server?.kill();}})().catch(e=>{console.error(e);process.exitCode=1});
