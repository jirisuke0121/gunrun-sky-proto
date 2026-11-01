// Follow-camera (touch default): a turn trims the pace by at most 40%, so curves keep flowing.
const assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {chromium}=require('playwright');
const port=8797,base=`http://127.0.0.1:${port}`;
(async()=>{let b,server;try{
 server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});
 for(let i=0;i<50;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100));}
 b=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const p=await b.newPage({viewport:{width:844,height:390}}),errors=[];
 await p.addInitScript(()=>window.__hold=true);p.on('pageerror',e=>errors.push(e.message));
 await p.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"top":[]}'}));
 await p.goto(base+'/canyon.html?practice=1&camera=after');await p.waitForFunction(()=>window.skyPractice&&__game.mode==='play'&&window.skyFollowCamera?.active,null,{timeout:90000});
 const r=await p.evaluate(()=>{
  const g=__game,c=g.P,dt=1/120,s=__skyInternals;
  // Keyboard: forward + full steer on open ground, speed once the turn settles.
  c.pos.set(-26,2,-16);c.vel.set(0,0,0);c.yaw=-Math.PI/2;c.state='normal';c.onGround=true;
  g.keys.KeyW=true;g.keys.KeyD=true;const sp=[];
  for(let i=0;i<90;i++){g.advance(dt);g.cam(dt);sp.push(Math.hypot(c.vel.x,c.vel.z));}
  g.keys.KeyW=false;g.keys.KeyD=false;
  const keyboard=sp.slice(-30).reduce((a,x)=>a+x,0)/30;
  // Analog thumb: forward .8 + sideways .6 (full deflection), what the follow camera turns into a pace scale.
  const touch=s.inputState;touch.on=true;touch.id=1;
  const out=window.skyFollowCamera.input({strIn:.6,fwdIn:.8,tmag:1});
  touch.on=false;
  return{keyboard,analog:out.motionScale,steer:out.steer};
 });
 assert.deepEqual(errors,[]);
 assert.ok(r.keyboard>=3.2,`full keyboard steer pace ${r.keyboard.toFixed(2)} m/s`);
 assert.ok(r.analog>=.58,`analog turn pace scale ${r.analog.toFixed(3)}`);
 console.log(`PASS: full-steer pace ${r.keyboard.toFixed(2)} m/s, analog turn scale ${r.analog.toFixed(3)} (steer ${r.steer.toFixed(2)})`);
}finally{await b?.close();server?.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
