const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
const base=process.env.RUNNING_QA_URL||'http://127.0.0.1:8878/';
const out=process.env.FIXED_QA_OUT||'browser-evidence/fixed-camera';fs.mkdirSync(out,{recursive:true});
(async()=>{const b=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});const results=[];
try{for(const map of ['index.html','canyon.html'])for(const preset of [{id:'near',pitch:-.35,distance:3.6},{id:'middle',pitch:-.65,distance:8},{id:'high',pitch:-.95,distance:10}]){
 const ctx=await b.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,locale:'ja-JP'});
 await ctx.addInitScript(()=>window.__hold=true);
 await ctx.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0}'}));
 const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base+map+'?camera=after&cameraTrial=fixed&fixedPitch='+preset.pitch+'&fixedDistance='+preset.distance+'&onboarding=0&controlpick=0&hookGuide=0&dev=1');
 await p.waitForFunction(()=>window.skyStartReadiness?.ready&&window.skyFixedCamera,null,{timeout:120000});
 await p.evaluate(()=>document.getElementById('bIntro').click());
 await p.evaluate(()=>{const g=__game;g.S.sendLog=g.S.autoFire=false;g.P.invuln=Infinity;for(const z of g.zombies){z.dead=true;z.remove=true}g.GAME.spawnT=Infinity;});
 const movement=await p.evaluate(()=>{
  const g=__game,c=g.P,s=__skyInternals,rows=[];
  for(const [x,f]of [[0,1],[1,1],[1,0],[1,-1],[0,-1],[-1,-1],[-1,0],[-1,1]]){
   skySwing.reset();c.pos.set(0,200,0);c.vel.set(0,0,0);c.state='normal';c.yaw=1.2;c.pitch=.4;skyFollowCamera.reset();
   const m=Math.hypot(x,f);Object.assign(s.inputState,{on:true,id:1,lookId:null,x:x/m,y:-f/m});
   for(let i=0;i<90;i++){c.onGround=false;c.pos.y=200;c.vel.y=0;g.playerStep(1/120);g.cam(1/120)}
   c.pos.y=200;g.frameOnce(0);const rotation=g.debug.camera.rotation;
   rows.push({input:[x,f],at:c.pos.toArray(),yaw:rotation.y,pitch:rotation.x,roll:rotation.z});
  }
  const before=g.debug.camera.quaternion.toArray();skyFollowCamera.look(2,1);g.cam(1/60);skyHumanView.update(1/60);const after=g.debug.camera.quaternion.toArray();
  Object.assign(s.inputState,{on:false,id:null,x:0,y:0});return{rows,before,after};
 });
 for(const r of movement.rows){const [x,f]=r.input;assert.ok(r.at[0]*x>=0&&r.at[2]*f<=0,JSON.stringify(r));assert.ok(Math.hypot(r.at[0],r.at[2])>1);assert.ok(Math.abs(r.yaw)<1e-6);assert.ok(Math.abs(r.pitch-preset.pitch)<1e-6);assert.ok(Math.abs(r.roll)<1e-6)}
 movement.before.forEach((v,i)=>assert.ok(Math.abs(v-movement.after[i])<1e-6,'right look is ignored'));
 const targets=map==='index.html'?[['roof',0,8,0],['interior',0,0,0],['north',0,0,-25],['stairs',9,3,17],['west',-30,0,0],['high',42,18,-10]]:[['center',0,8,0],['lower',-26,0,-16],['east',16,9,-7],['south',0,0,20],['west',-30,6,0],['high',20,14,0]];
 const scenes=[];
 for(const [label,x,y,z]of targets){
  const scene=await p.evaluate(({x,y,z})=>{
   const g=__game,c=g.P,s=__skyInternals,T=g.debug.THREE;
   const nodes=g.NAV.nodes.filter(n=>g.freeAt(n.x,n.y+.03,n.z,.3,1.75));
   const n=nodes.reduce((a,b)=>Math.hypot(b.x-x,(b.y-y)*2,b.z-z)<Math.hypot(a.x-x,(a.y-y)*2,a.z-z)?b:a);
   skySwing.reset();c.pos.set(n.x,n.y+.01,n.z);c.lastGround.copy(c.pos);c.vel.set(0,0,0);c.state='normal';c.onGround=true;c.yaw=0;c.pitch=0;skyFollowCamera.reset();g.frameOnce(0);
   const cam=g.debug.camera;
   const check=(x,y,z)=>{const v=c.pos.clone().set(x,y,z),dx=x-cam.position.x,dy=y-cam.position.y,dz=z-cam.position.z,d=Math.hypot(dx,dy,dz);v.project(cam);return{at:[x,y,z],screen:[v.x,v.y,v.z],inFrame:Math.abs(v.x)<.95&&Math.abs(v.y)<.95&&v.z>-1&&v.z<1,blocked:!skyFixedCamera.visible(cam.position,{x,y,z})}};
   const near=nodes.filter(m=>Math.hypot(m.x-n.x,m.z-n.z)>3&&Math.hypot(m.x-n.x,m.z-n.z)<7&&Math.abs(m.y-n.y)<4);
   const samples=[];for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){const candidates=near.filter(m=>(m.x-n.x)*dx+(m.z-n.z)*dz>2.5);if(candidates.length){const m=candidates.reduce((a,b)=>Math.abs((b.x-n.x)*dz-(b.z-n.z)*dx)<Math.abs((a.x-n.x)*dz-(a.z-n.z)*dx)?b:a);samples.push(check(m.x,m.y+.25,m.z))}}
   return{position:c.pos.toArray(),camera:cam.position.toArray(),rotation:[cam.rotation.x,cam.rotation.y,cam.rotation.z],clearance:document.body.dataset.skyHumanCameraClearance,faded:skyFixedCamera.fadedCount,body:check(n.x,n.y+1,n.z),nearby:samples};
  },{x,y,z});
  const name=map.split('.')[0]+'-'+preset.id+'-'+label;await p.screenshot({path:out+'/'+name+'.png'});scenes.push({label,...scene});
 }
 assert.deepEqual(errors,[]);results.push({map,preset,movement,scenes,errors});fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));console.log('PASS',map,preset.id,'8 directions, no rotation, screenshot scenes',scenes.length);await ctx.close();
}}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
