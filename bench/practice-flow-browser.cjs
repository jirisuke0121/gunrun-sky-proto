const assert=require('node:assert/strict');
const {chromium}=require('playwright'),{spawn}=require('child_process'),fs=require('fs');
(async()=>{let b,server;try{
 server=spawn('python3',['-m','http.server','8779','--bind','127.0.0.1'],{stdio:'ignore'});for(let i=0;i<50;i++){if(await fetch('http://127.0.0.1:8779').then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100));}
 b=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const p=await b.newPage(),errors=[];await p.addInitScript(()=>window.__hold=true);p.on('pageerror',e=>errors.push(e.message));await p.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"top":[]}'}));
 await p.goto('http://127.0.0.1:8779/canyon.html?practice=1');await p.waitForFunction(()=>window.skyPractice&&__game.mode==='play',null,{timeout:90000});
 const r=await p.evaluate(()=>{
  const g=__game,c=g.P,dt=1/120,trace=[],stages=[];const runStart=g.GAME.t;
  const key=(code)=>{dispatchEvent(new KeyboardEvent('keydown',{code}));dispatchEvent(new KeyboardEvent('keyup',{code}));};
  const tick=()=>{g.advance(dt);trace.push({t:g.GAME.t,p:c.pos.toArray(),state:c.state,stats:{vaults:g.stats.vaults,mantles:g.stats.mantles,wallruns:g.stats.wallruns},section:skyPractice.section.id});};
  function moveTo(x,z,max=1200,action){g.keys.KeyW=true;for(let i=0;i<max;i++){const dx=x-c.pos.x,dz=z-c.pos.z;if(Math.hypot(dx,dz)<.35){g.keys.KeyW=false;return true;}c.yaw=Math.atan2(-dx,-dz);action?.();tick();}g.keys.KeyW=false;return false;}
  function mark(name){stages.push({name,t:g.GAME.t,pos:c.pos.toArray(),state:c.state,stats:{...g.stats},fall:skyPractice.retries});}
  // One controller trace: no position changes after the entrance.
  let gap=false;moveTo(-11.5,-16,900,()=>{if(!gap&&c.pos.x>-15.75&&c.onGround){key('Space');gap=true;}});mark('vault+gap');
  let slide=false;moveTo(-5.5,-16,600,()=>{if(!slide&&c.pos.x>-11.5&&c.onGround){key('KeyC');slide=true;}});mark('slide');
  let mantle=false;moveTo(1,-16,600,()=>{if(!mantle&&c.pos.x>-4.5&&c.onGround){key('Space');mantle=true;}});mark('mantle');
  moveTo(4,-17.95);let runJump=false;moveTo(17,-17.95,800,()=>{if(!runJump&&c.pos.x>4.5&&c.onGround){key('Space');runJump=true;}});mark('wallrun');
  // Align with the actual hook and invoke the normal input.
  moveTo(18,-16,300);c.yaw=-2.79;c.pitch=.0;g.cam(dt);key('KeyQ');
  for(let i=0;i<400;i++){tick();if(c.state==='normal'&&c.onGround&&c.pos.y>5)break;}mark('hook');
  moveTo(23.5,-1,300);c.yaw=Math.PI/2;key('Space');
  for(let i=0;i<600;i++){tick();if((g.stats.zips||0)>0&&c.state==='normal'&&c.onGround)break;}mark('zip');moveTo(-20,-9.5,400);moveTo(-20.39,-6,400);g.keys.KeyW=false;for(let i=0;i<15;i++)tick();
  c.yaw=-Math.PI/2;g.keys.KeyW=false;key('Space');for(let i=0;i<12;i++)tick();key('Space');g.keys.KeyW=true;
  for(let i=0;i<150;i++){tick();if(c.onGround&&c.pos.y>5&&c.pos.x>-18)break;}mark('wallkick');
  key('Space');const bars=new Set();
  for(let i=0;i<300;i++){const a=skySwing.active;if(a){bars.add(a.bar.id);if(a.angle>=.2&&a.omega>1.1)key('Space');}tick();if(bars.size===2&&c.onGround&&c.pos.y>7.9)break;}mark('swing');
  moveTo(9,-5.4,300);g.keys.KeyW=false;for(let i=0;i<20;i++)tick();moveTo(9,-1.2,600);mark('ladder');
  moveTo(9,18,600);for(let i=0;i<240&&!c.onGround;i++)tick();mark('dash+drop');
  moveTo(8,18);let stomp=false;moveTo(3.5,18,400,()=>{if(!stomp&&c.pos.x<6.75&&c.onGround){key('Space');stomp=true;}});mark('stomp');
  // A separate press during the bounce uses the normal aerial kick.
  for(let i=0;i<120&&!c.onGround;i++)tick();moveTo(8,18,300);g.keys.KeyW=true;c.yaw=Math.PI/2;
  let kicked=false;for(let i=0;i<150;i++){if(!kicked&&c.pos.x<6.6&&c.onGround){key('Space');for(let j=0;j<12;j++)tick();key('Space');kicked=true;}tick();if((g.stats.kicks||0)>0)break;}g.keys.KeyW=false;mark('airkick');
  // Finish the return leg with the same physical barrel/jump-gun actions.
  moveTo(-12,17,600);moveTo(-16.85,17,400);g.keys.KeyW=false;for(let i=0;i<60;i++)tick();mark('barrel-top');
  c.pitch=-1.4;g.cam(dt);skyHumanView.update(dt);
  const v=new __skyInternals.Geom.Vector3(-17,1.14,17).project(__skyInternals.Se),rect=document.getElementById('c').getBoundingClientRect();
  const tapped=skyBlastBarrels.tapAt(rect.left+(v.x+1)*rect.width/2,rect.top+(1-v.y)*rect.height/2);mark('blast-fired:'+tapped);
  moveTo(-23,8.5,500);mark('blast-landing');
  moveTo(-27,5.8,400);g.keys.KeyW=false;for(let i=0;i<20;i++)tick();mark('jumpgun-pickup');
  c.yaw=0;key('KeyE');g.keys.KeyW=true;
  for(let i=0;i<300;i++){tick();if(c.onGround&&c.pos.y>7.9)break;}mark('jumpgun');g.keys.KeyW=false;for(let i=0;i<20;i++)tick();
  moveTo(-30,-16.4,400);moveTo(-30,-23.5,900);moveTo(-26,-23.5,400);moveTo(-26,-16,600);g.keys.KeyW=false;for(let i=0;i<120&&!c.onGround;i++)tick();mark('loop');
  return{stages,trace,falls:skyPractice.retries,time:g.GAME.t-runStart};
 });
 assert.deepEqual(errors,[]);assert.equal(r.falls,0,'the full loop must not use fall recovery or a station teleport');
 const end=r.stages.at(-1);assert.ok(Math.abs(end.pos[1]-2)<.05&&Math.hypot(end.pos[0]+26,end.pos[2]+16)<1,JSON.stringify(end));
 for(const key of ['vaults','mantles','slides','wallruns','walljumps','hooks','zips','barGrabs','barJumps','ladders','dashPickups','stomps','kicks','blastLaunches','jumpGunLaunches'])assert.ok(end.stats[key]>0,'missing actual movement action: '+key);
 fs.mkdirSync('browser-evidence/practice',{recursive:true});fs.writeFileSync('browser-evidence/practice/flow-trace.json',JSON.stringify(r));
 const summary={time:r.time,falls:r.falls,stages:r.stages};fs.writeFileSync('browser-evidence/practice/flow-results.json',JSON.stringify(summary,null,2));
 await p.evaluate(()=>{const g=__game;g.cam(1/60);skyHumanView.update(1/60);g.debug.renderer.clear();g.debug.renderer.render(__skyInternals.ue,__skyInternals.Se);});
 await p.screenshot({path:'browser-evidence/practice/full-loop.png'});
 console.log('PASS: complete physical loop, every movement action, no teleports or recovery; '+r.time.toFixed(2)+' seconds');
}finally{await b?.close();server?.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
