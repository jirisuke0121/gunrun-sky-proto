// Landing weight and mantle pace on the practice flow: jump landing dips the camera, mantle takes <= .40 s.
const assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {chromium}=require('playwright');
const port=8796,base=`http://127.0.0.1:${port}`;
(async()=>{let b,server;try{
 server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});
 for(let i=0;i<50;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100));}
 b=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const p=await b.newPage({viewport:{width:844,height:390}}),errors=[];
 await p.addInitScript(()=>window.__hold=true);p.on('pageerror',e=>errors.push(e.message));
 await p.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"top":[]}'}));
 await p.goto(base+'/canyon.html?practice=1');await p.waitForFunction(()=>window.skyPractice&&__game.mode==='play',null,{timeout:90000});
 const r=await p.evaluate(()=>{
  const g=__game,c=g.P,dt=1/120,trace=[];
  const key=code=>{dispatchEvent(new KeyboardEvent('keydown',{code}));dispatchEvent(new KeyboardEvent('keyup',{code}));};
  const tick=()=>{g.advance(dt);g.cam(dt);trace.push({st:c.state,gr:c.onGround,dip:c.landDip,sp:Math.hypot(c.vel.x,c.vel.z)});};
  function moveTo(x,z,max,action){g.keys.KeyW=true;for(let i=0;i<max;i++){const dx=x-c.pos.x,dz=z-c.pos.z;if(Math.hypot(dx,dz)<.35){g.keys.KeyW=false;return;}c.yaw=Math.atan2(-dx,-dz);action?.();tick();}g.keys.KeyW=false;}
  let gap=false;moveTo(-11.5,-16,900,()=>{if(!gap&&c.pos.x>-15.75&&c.onGround){key('Space');gap=true;}});
  const afterGap=trace.length;
  let slide=false;moveTo(-5.5,-16,600,()=>{if(!slide&&c.pos.x>-11.5&&c.onGround){key('KeyC');slide=true;}});
  let mantle=false;moveTo(1,-16,600,()=>{if(!mantle&&c.pos.x>-4.5&&c.onGround){key('Space');mantle=true;}});
  return{trace,afterGap};
 });
 assert.deepEqual(errors,[]);
 const T=r.trace,runs=[];let cur=null;
 T.forEach((x,i)=>{if(x.st==='ledge'){if(cur===null)cur=i;}else if(cur!==null){runs.push([cur,i]);cur=null;}});
 assert.equal(runs.length,2,'one vault and one mantle expected');
 const mantle=(runs[1][1]-runs[1][0])/120;
 assert.ok(mantle<=.40,`mantle took ${mantle.toFixed(2)} s`);
 const dip=Math.max(...T.slice(runs[0][1]).map(x=>x.dip));
 assert.ok(dip>=.15,`jump landing camera dip too small: ${dip.toFixed(3)} m`);
 const exit=T[runs[1][1]+1].sp;assert.ok(exit>=5.9,`speed after mantle ${exit.toFixed(2)}`);
 console.log(`PASS: mantle ${mantle.toFixed(2)} s, jump-landing dip ${dip.toFixed(3)} m, speed after mantle ${exit.toFixed(2)}`);
}finally{await b?.close();server?.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
