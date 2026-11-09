// Real game, real terrain and physics: a simulated thumb that watches the picture drives the
// runner through the old-town west hallway (east 3.5 m, 90° left, north 6 m) and back out.
// Compares the default screen-relative mapping with the earlier turn-and-commit mapping
// (cameraTrial=follow-turn). The thumb model is the one in control-model.cjs; touch delivery
// itself is covered by easy-controls-browser.cjs. Not a physical phone, not a person.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.resolve(process.env.SCREEN_STICK_OUT||path.join(root,'browser-evidence/screen-stick'));
const server=http.createServer(async(req,res)=>{try{const name=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!name.startsWith(root+path.sep))throw Error('path');const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'}[path.extname(name)]||'application/octet-stream';res.writeHead(200,{'content-type':type});res.end(await fs.promises.readFile(name));}catch{res.writeHead(404);res.end();}});
const RUNS=Number(process.env.SCREEN_STICK_RUNS||12);
(async()=>{fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/`;let browser;const table=[];
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/google-chrome',args:['--no-sandbox','--enable-unsafe-swiftshader']});
 for(const variant of(process.env.SCREEN_STICK_ONLY?['']:['follow-turn',''])){
  const ctx=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,locale:'ja-JP'});
  await ctx.addInitScript(()=>{window.__hold=true});const errors=[];
  await ctx.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0,"ok":true}'}));
  const p=await ctx.newPage();p.setDefaultTimeout(90000);p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base+`index.html?camera=after${variant?'&cameraTrial='+variant:''}&lang=ja&controlpick=0&hookGuide=0&dev=1${process.env.SCREEN_STICK_QUERY||''}`);
  await p.waitForFunction(()=>window.skyStartReadiness?.ready&&document.body.dataset.skyHumanLoaded==='true');await p.locator('#bStart').tap();
  await p.evaluate(()=>{
   const g=__game,c=g.P,s=__skyInternals;g.S.sendLog=g.S.autoFire=false;c.invuln=Infinity;g.GAME.spawnT=g.GAME.surgeT=Infinity;g.SCR.off=g.PACE.off=g.MARK.off=true;
   for(const z of g.zombies){s.ue.remove(z.m.root);if(z.pool)s.ue.remove(z.pool)}g.zombies.length=0;
   window.place=(at,yaw=0)=>{skySwing.reset();c.pos.set(...at);c.lastGround.copy(c.pos);c.safe.copy(c.pos);c.vel.set(0,0,0);c.state='normal';c.onGround=true;c.h=1.75;c.eye=1.62;c.camY=c.pos.y+c.eye;c.yaw=yaw;c.pitch=-.12;c.shake=0;c.ledge=c.ladder=c.hook=c.zip=c.doorAction=null;c.jumpBuf=c.slideBuf=0;skyFollowCamera.reset();g.frameOnce(0)};
   const wrap=n=>Math.atan2(Math.sin(n),Math.cos(n));
   // goals: [x,z] list. player: 'pointer' | 'holder'. Returns timing and how well it went.
   window.drive=(start,yaw,goals,player,seed,shots)=>{
    g.GAME.t=0;if(g.GAME.over)throw Error('run ended before the test');place(start,yaw);let r=seed*7919+13>>>0;const rnd=()=>((r=Math.imul(r^r>>>15,0x2c1b3c6d)+0x9e3779b9|0,(r^r>>>13)>>>0)/4294967296);
    const gauss=()=>Math.sqrt(-2*Math.log(rnd()||1e-9))*Math.cos(2*Math.PI*rnd());
    let goal=0,t=0,tremor=0,held=0,next=0,length=0,slow=0,hidden=0,wrong=0,moving=0;const delay=[],marks=[];
    while(t<14&&goal<goals.length){
     const view=skyFollowCamera.view,[gx,gz]=goals[goal];
     const seen=wrap(Math.atan2(gx-c.pos.x,-(gz-c.pos.z))+view.yaw);delay.push(seen);const aimed=delay.length>12?delay.shift():delay[0];
     tremor+=(-tremor*6+gauss()*(player==='pointer'?.30:.17)*Math.sqrt(60))/60;
     if(player==='holder'&&t>=next){held=aimed;next=t+.45}
     const thumb=(player==='pointer'?aimed:held)+tremor;
     Object.assign(s.inputState,{on:true,id:1,x:Math.sin(thumb),y:-Math.cos(thumb)});
     const bx=c.pos.x,bz=c.pos.z;g.advance(1/60);g.cam(1/60);skyHumanView.update(1/60);
     const step=Math.hypot(c.pos.x-bx,c.pos.z-bz);length+=step;if(step<3/60)slow+=1/60;
     if(step>1e-3){moving++;if(Math.abs(wrap(Math.atan2(c.pos.x-bx,-(c.pos.z-bz))+view.yaw-thumb))>Math.PI/3)wrong++}
     if(document.body.dataset.skyHumanView!=='third')hidden+=1/60;
     if(Math.hypot(gx-c.pos.x,gz-c.pos.z)<.9){goal++;marks.push(+t.toFixed(2))}
     t+=1/60;
     if(shots&&Math.round(t*60)%shots===0){g.debug.renderer.clear();g.debug.renderer.render(s.ue,g.debug.camera)}
    }
    Object.assign(s.inputState,{on:false,id:null,x:0,y:0});
    return{done:goal>=goals.length,time:t,length,slow,hidden,wrong:moving?wrong/moving:0,marks,y:c.pos.y};
   };
  });
  const routes={
   'hall in (corner)':{start:[-15.5,.001,0],yaw:-Math.PI/2,goals:[[-12,0],[-12,-6]]},
   'hall out (turn back + corner)':{start:[-12,.001,-6],yaw:0,goals:[[-12,0],[-15.5,0]]},
  };
  for(const[name,route]of Object.entries(routes))for(const player of['pointer','holder']){
   const runs=[];for(let i=1;i<=RUNS;i++)runs.push(await p.evaluate(a=>drive(...a),[route.start,route.yaw,route.goals,player,i,0]));
   const done=runs.filter(r=>r.done),mean=(l,k)=>l.length?l.reduce((a,r)=>a+r[k],0)/l.length:NaN;
   table.push({mapping:variant||'screen (default)',route:name,player,arrived:`${done.length}/${RUNS}`,time:mean(done,'time').toFixed(2),path:mean(done,'length').toFixed(1),slowOrStuck:mean(runs,'slow').toFixed(2),bodyHidden:mean(runs,'hidden').toFixed(2),wrongWay:Math.round(mean(runs,'wrong')*100)+'%'});
  }
  // One pictured run per mapping for the eye.
  const shot=async name=>{const data=await p.evaluate(()=>{const s=__skyInternals,g=__game;g.debug.renderer.clear();g.debug.renderer.render(s.ue,g.debug.camera);return g.debug.renderer.domElement.toDataURL('image/jpeg',.8)});fs.writeFileSync(path.join(out,(variant||'screen')+'-'+name+'.jpg'),Buffer.from(data.split(',')[1],'base64'))};
  await p.evaluate(()=>drive([-15.5,.001,0],-Math.PI/2,[[-12,0]],'pointer',1,0));await shot('corner');
  await p.evaluate(()=>{const s=__skyInternals,g=__game;const wrap=n=>Math.atan2(Math.sin(n),Math.cos(n));for(let i=0;i<50;i++){const v=skyFollowCamera.view,a=wrap(Math.atan2(-12-g.P.pos.x,-(-6-g.P.pos.z))+v.yaw);Object.assign(s.inputState,{on:true,id:1,x:Math.sin(a),y:-Math.cos(a)});g.advance(1/60);g.cam(1/60);skyHumanView.update(1/60)}});
  await shot('hall');
  assert.deepEqual(errors,[],'no page errors');
  await ctx.close();
 }
 console.table(table);if(process.env.SCREEN_STICK_NOASSERT!=='1')for(const row of table.filter(r=>r.mapping.startsWith('screen')))assert.ok(Number(row.arrived.split('/')[0])>=(row.player==='pointer'?RUNS:Math.floor(RUNS*.9)),`default mapping completes ${row.route} as ${row.player}: ${row.arrived}`);
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(table,null,1));
 console.log('PASS screen stick browser: real hallway; the pointing thumb always arrives, the hold-and-re-aim thumb in at least 90% of runs');
}finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
