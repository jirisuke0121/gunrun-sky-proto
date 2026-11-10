// Real game checks for flow-feel.js.
//  A. Gap auto-jump trial: on every roof-to-roof jump link the map's own navigation graph lists
//     (kind 6, up to 7.2 m), run straight at the gap holding only "forward" – never pressing jump.
//     Compared with the trial off (edge assist stops the runner at the lip).
//  B. FLOW chain: a slide followed by a cleared gap makes a chain of 2, shows the tag, and a hit ends it.
//  C. With ?flowFeel=0 nothing is shown and the view is untouched.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.resolve(process.env.FLOW_FEEL_OUT||path.join(root,'browser-evidence/flow-feel'));
const server=http.createServer(async(req,res)=>{try{const name=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!name.startsWith(root+path.sep))throw Error('path');const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'}[path.extname(name)]||'application/octet-stream';res.writeHead(200,{'content-type':type});res.end(await fs.promises.readFile(name));}catch{res.writeHead(404);res.end();}});
(async()=>{fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/`;let browser;const summary={};
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/google-chrome',args:['--no-sandbox','--enable-unsafe-swiftshader']});
 async function open(map,query){
  const ctx=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,locale:'ja-JP'});
  await ctx.addInitScript(()=>{window.__hold=true});const errors=[];
  await ctx.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0,"ok":true}'}));
  const p=await ctx.newPage();p.setDefaultTimeout(90000);p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base+`${map}?camera=after&lang=ja&controlpick=0&hookGuide=0&dev=1${query}`);
  await p.waitForFunction(()=>window.skyStartReadiness?.ready&&document.body.dataset.skyHumanLoaded==='true'&&document.body.dataset.skyFlowReady==='true');await p.locator('#bStart').tap();
  await p.evaluate(()=>{
   const g=__game,c=g.P,s=__skyInternals;g.S.sendLog=g.S.autoFire=false;c.invuln=Infinity;g.GAME.spawnT=g.GAME.surgeT=Infinity;g.SCR.off=g.PACE.off=g.MARK.off=true;
   for(const z of g.zombies){s.ue.remove(z.m.root);if(z.pool)s.ue.remove(z.pool)}g.zombies.length=0;
   window.place=(at,yaw=0)=>{g.GAME.t=0;skySwing.reset();c.pos.set(...at);c.lastGround.copy(c.pos);c.safe.copy(c.pos);c.vel.set(0,0,0);c.state='normal';c.onGround=true;c.h=1.75;c.eye=1.62;c.camY=c.pos.y+c.eye;c.yaw=yaw;c.pitch=-.12;c.shake=0;c.ledge=c.ladder=c.hook=c.zip=c.doorAction=null;c.jumpBuf=c.slideBuf=0;skyFollowCamera.reset();skyFlow.reset();g.frameOnce(0)};
   window.tick=(n,thumb=true)=>{for(let i=0;i<n;i++){Object.assign(s.inputState,thumb?{on:true,id:1,x:0,y:-1}:{on:false,id:null,x:0,y:0});g.advance(1/60);g.cam(1/60);skyHumanView.update(1/60)}};
   // Jump links with a 3 m straight, supported run-up behind the take-off node.
   window.gapLinks=()=>{const N=g.NAV,list=[];for(const e of N.E){if(e.kind!==6)continue;const a=N.nodes[e.from],b=N.nodes[e.to],d=Math.hypot(b.x-a.x,b.z-a.z),ux=(b.x-a.x)/d,uz=(b.z-a.z)/d;
     let ok=true;for(let k=0;k<=3;k+=.5){const x=a.x-ux*k,z=a.z-uz*k;if(!g.freeAt(x,a.y+.05,z,.32,1.75)||g.freeAt(x,a.y-.12,z,.1,.1)){ok=false;break}}
     if(ok)list.push({from:[a.x,a.y,a.z],to:[b.x,b.y,b.z],d,ux,uz});}return list};
   window.runGap=L=>{place([L.from[0]-L.ux*3,L.from[1]+.001,L.from[2]-L.uz*3],Math.atan2(-L.ux,-L.uz));const jumps=g.stats.jumps||0;let landed=false,fell=false;
     for(let i=0;i<170;i++){tick(1);const along=(c.pos.x-L.from[0])*L.ux+(c.pos.z-L.from[2])*L.uz;
      if(c.pos.y<L.from[1]-3.2){fell=true;break}
      if(c.onGround&&along>L.d-1.2&&c.pos.y>L.to[1]-.6){landed=true;break}}
     return{landed,fell,jumped:(g.stats.jumps||0)>jumps,d:L.d,dy:L.to[1]-L.from[1]}};
  });
  return{ctx,p,errors};
 }
 // ---- A ----
 for(const mode of['off','on']){
  const {ctx,p,errors}=await open('index.html',mode==='on'?'&autoJump=1':'');
  const all=await p.evaluate(()=>gapLinks()),every=Math.max(1,Math.ceil(all.length/Number(process.env.FLOW_FEEL_LINKS||70)));
  const links=all.sort((a,b)=>a.d-b.d||a.from[0]-b.from[0]||a.from[2]-b.from[2]).filter((_,i)=>i%every===0);const rows=[];summary.mapLinks=all.length;
  for(const L of links)rows.push(await p.evaluate(L=>runGap(L),L));
  const near=rows.filter(r=>r.d<=4.2&&r.dy<=.3),far=rows.filter(r=>!(r.d<=4.2&&r.dy<=.3));
  summary[mode]={links:rows.length,landed:rows.filter(r=>r.landed).length,fell:rows.filter(r=>r.fell).length,jumped:rows.filter(r=>r.jumped).length,
   reachable:{links:near.length,landed:near.filter(r=>r.landed).length,fell:near.filter(r=>r.fell).length},beyond:{links:far.length,jumped:far.filter(r=>r.jumped).length,fell:far.filter(r=>r.fell).length}};
  assert.deepEqual(errors,[]);
  if(mode==='off'){assert.equal(summary.off.jumped,0,'without the trial nothing jumps by itself');}
  if(mode==='on'){
   // ---- B ---- on the first link the trial clears
   console.log(JSON.stringify(summary));const L=links.filter((_,i)=>rows[i].landed).sort((a,b)=>b.d-a.d)[0];assert.ok(L,'at least one gap is cleared automatically');
   const state=await p.evaluate(L=>{const g=__game,s=__skyInternals;place([L.from[0]-L.ux*3,L.from[1]+.001,L.from[2]-L.uz*3],Math.atan2(-L.ux,-L.uz));
     tick(8);g.stats.vaults=(g.stats.vaults||0)+1;                      // stand-in for the vault that precedes the gap on a real line
     const shots=[];for(let i=0;i<150;i++){tick(1);if(skyFlow.state.chain>=2&&!shots.length){shots.push({...skyFlow.state,tag:getComputedStyle(document.getElementById('flowTag')).opacity,text:document.getElementById('flowTag').textContent});break}}
     return shots[0]||{...skyFlow.state,missing:true}},L);
   assert.ok(state.chain>=2&&!state.missing,'a move followed by a cleared gap is a chain of 2: '+JSON.stringify(state));assert.match(state.text,/FLOW×2/);
   const frame=await p.evaluate(()=>{const g=__game,s=__skyInternals;tick(6);g.debug.renderer.clear();g.debug.renderer.render(s.ue,g.debug.camera);const r=document.getElementById('flowTag').getBoundingClientRect();return{image:g.debug.renderer.domElement.toDataURL('image/jpeg',.82),tag:[r.x,r.y,r.width,r.height]}});
   fs.writeFileSync(path.join(out,'flow-chain.jpg'),Buffer.from(frame.image.split(',')[1],'base64'));summary.tagBox=frame.tag.map(Math.round);
   await p.screenshot({path:path.join(out,'flow-chain-page.png'),timeout:12000}).catch(()=>{});
   const air=await p.evaluate(L=>{place([L.from[0]-L.ux*3,L.from[1]+.001,L.from[2]-L.uz*3],Math.atan2(-L.ux,-L.uz));let peak=0;for(let i=0;i<120;i++){tick(1);peak=Math.max(peak,skyFlow.state.airView)}tick(40);return{peak,after:skyFlow.state.airView}},L);
   assert.ok(air.peak>.5&&air.after<.05,'air view opens in flight and closes on landing: '+JSON.stringify(air));
   const ended=await p.evaluate(()=>{const g=__game;g.stats.vaults++;g.stats.slides=(g.stats.slides||0)+1;tick(2);const before=skyFlow.state.chain;g.P.life-=1;tick(2);return{before,after:skyFlow.state.chain}});
   assert.ok(ended.before>=2&&ended.after===0,'a hit ends the chain');
   const timed=await p.evaluate(()=>{const g=__game;g.stats.vaults++;g.stats.slides++;tick(2);const before=skyFlow.state.chain;tick(60*4);return{before,after:skyFlow.state.chain}});
   assert.ok(timed.before>=2&&timed.after===0,'the chain runs out after 3.2 s of plain running');
  }
  await ctx.close();
 }
 console.log(JSON.stringify(summary));
 assert.ok(summary.on.landed>summary.off.landed&&summary.on.jumped>0,'trial crosses gaps that plain running does not: '+JSON.stringify(summary));
 assert.equal(summary.on.fell,0,'trial never jumps into a gap it cannot clear');
 // ---- C ----
 {const {ctx,p}=await open('index.html','&flowFeel=0');const off=await p.evaluate(()=>{const g=__game;place([0,8.001,0],0);g.stats.vaults=(g.stats.vaults||0)+1;g.stats.slides=(g.stats.slides||0)+1;tick(3);return{chain:skyFlow.state.chain,tag:getComputedStyle(document.getElementById('flowTag')).opacity,level:skyFlow.state.level}});
  assert.equal(off.tag,'0');assert.equal(off.level,0);await ctx.close();}
 console.log(JSON.stringify(summary,null,1));fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(summary,null,1));
 console.log('PASS flow feel: gap auto-jump trial on the map\'s own jump links, chain tag/notes, air view, hit and timeout, off switch');
}finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
