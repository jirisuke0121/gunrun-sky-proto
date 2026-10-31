// Run feel: FOV must hold through vault/mantle, sprint shows speed lines, wind is audible at sprint speed.
const assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {chromium}=require('playwright');
const port=8795,base=`http://127.0.0.1:${port}`;
(async()=>{let b,server;try{
 server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});
 for(let i=0;i<50;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100));}
 b=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--autoplay-policy=no-user-gesture-required','--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const p=await b.newPage({viewport:{width:844,height:390}}),errors=[];
 await p.addInitScript(()=>window.__hold=true);p.on('pageerror',e=>errors.push(e.message));
 await p.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"top":[]}'}));
 await p.goto(base+'/canyon.html?practice=1');await p.waitForFunction(()=>window.skyPractice&&__game.mode==='play',null,{timeout:90000});
 const r=await p.evaluate(()=>{
  const g=__game,c=g.P,dt=1/120,trace=[];
  // Read the gain the game asks for; the audio clock does not advance inside this synchronous loop.
  let target=0;const wp=__skyInternals.Ut.wind?.gain;if(wp){const set=wp.setTargetAtTime.bind(wp);wp.setTargetAtTime=(v,t,k)=>{target=v;return set(v,t,k);};}
  const tick=()=>{g.advance(dt);g.cam(dt);trace.push({st:c.state,gr:c.onGround,sp:Math.hypot(c.vel.x,c.vel.z),fov:g.debug.camera.fov,lines:+(document.getElementById('dashSpeedFx')?.style.opacity||0),wind:target});};
  g.keys.KeyW=true;
  // Straight run into the practice vault (x -26 -> -20), then keep running.
  for(let i=0;i<260;i++){const dx=-11.5-c.pos.x,dz=-16-c.pos.z;c.yaw=Math.atan2(-dx,-dz);tick();}
  g.keys.KeyW=false;return trace;
 });
 assert.deepEqual(errors,[]);
 const at=r.findIndex(x=>x.st==='ledge');assert.ok(at>2,'the run must reach the vault');
 let end=at;while(end<r.length&&r[end].st==='ledge')end++;
 const before=r[at-1].fov,during=Math.min(...r.slice(at,end).map(x=>x.fov));
 assert.ok(before-during<1,`FOV dipped ${(before-during).toFixed(1)} deg during the vault`);
 const sprint=r.filter(x=>x.st==='normal'&&x.gr&&x.sp>5.9);
 const avg=k=>sprint.reduce((s,x)=>s+x[k],0)/sprint.length;
 assert.ok(avg('lines')>.18,`sprint speed lines too faint: ${avg('lines').toFixed(3)}`);
 assert.ok(avg('wind')>.2,`sprint wind too quiet: ${avg('wind').toFixed(3)}`);
 console.log(`PASS: vault FOV dip ${(before-during).toFixed(2)} deg, sprint lines ${avg('lines').toFixed(3)}, sprint wind ${avg('wind').toFixed(3)}`);
}finally{await b?.close();server?.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
