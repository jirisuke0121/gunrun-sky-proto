// Blast-jump sequence on every barrel of the old town and the canyon: the mark
// appears, one tap runs the player to the barrel, hops on, aims down, shoots,
// and the blast lands the player on the barrel's roof within half a metre.
const assert=require('node:assert/strict');
const {chromium}=require('playwright'),{spawn}=require('child_process');
(async()=>{let server;try{
 server=spawn('python3',['-m','http.server','8781','--bind','127.0.0.1'],{stdio:'ignore'});for(let i=0;i<50;i++){if(await fetch('http://127.0.0.1:8781').then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100));}
 for(const page of process.argv[2]?[process.argv[2]]:['index.html','canyon.html']){
  // A fresh browser per page keeps the software GL renderer within memory.
  const b=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const p=await b.newPage({viewport:{width:844,height:390}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"top":[]}'}));
  await p.goto('http://127.0.0.1:8781/'+page);await p.waitForFunction(()=>window.__game&&window.skyBlastBarrels,null,{timeout:120000});
  await p.evaluate(()=>window.__game.startGame());await p.waitForFunction(()=>window.__game.mode==='play',null,{timeout:120000});
  const results=await p.evaluate(()=>{
   const g=window.__game,c=g.P,I=window.__skyInternals,B=window.skyBlastBarrels,dt=1/60,out=[];
   for(const barrel of B.barrels){
    let tried=null;
    for(const [ox,oz] of [[-4,0],[4,0],[0,4],[0,-4],[-3,-3],[3,3]]){
     B.reset();I.U.gunOn=false;
     c.pos.set(barrel.x+ox,barrel.y||0,barrel.z+oz);c.vel.set(0,0,0);c.state='normal';c.onGround=true;
     c.yaw=Math.atan2(-(barrel.x-c.pos.x),-(barrel.z-c.pos.z));c.pitch=-.1;window.skyFollowCamera?.reset();
     for(let i=0;i<20;i++){g.advance(dt);g.cam(dt);}
     if(c.onGround&&Math.abs(c.pos.y-(barrel.y||0))<.2&&B.assistTarget()?.barrel===barrel){tried=[ox,oz];break;}
    }
    if(!tried){out.push({id:barrel.id,error:'no usable start'});continue;}
    const phases=[];B.startAuto(barrel);let launched=-1;
    for(let i=0;i<400;i++){g.advance(dt);g.cam(dt);const s=B.sequence;if(s&&phases.at(-1)!==s.phase)phases.push(s.phase);
     if(!s&&launched<0&&(g.stats.blastLaunches||0)>0)launched=i*dt;
     if(!s&&launched>=0&&c.onGround&&i*dt>launched+.3)break;}
    out.push({id:barrel.id,phases,launched,gunRestored:I.U.gunOn===false,land:barrel.land,
      error:barrel.land?Math.hypot(c.pos.x-barrel.land[0],c.pos.z-barrel.land[2]):null,y:c.pos.y});
   }
   return out;});
  assert.deepEqual(errors,[]);
  for(const r of results){
   assert.ok(!r.error||typeof r.error==='number',`${page} ${r.id}: ${r.error}`);
   assert.ok(r.phases[0]==='run'&&r.phases.at(-1)==='aim'&&r.phases.length<=3,`${page} ${r.id} phases ${r.phases}`);
   assert.ok(r.launched>0&&r.launched<1.6,`${page} ${r.id} launch time ${r.launched}`);
   assert.ok(r.gunRestored,`${page} ${r.id} gun setting restored`);
   assert.ok(r.error<.5&&Math.abs(r.y-r.land[1])<.1,`${page} ${r.id} landing ${JSON.stringify(r)}`);
  }
  console.log(`PASS ${page}: `+results.map(r=>`${r.id} ${r.launched.toFixed(2)}s err ${r.error.toFixed(2)}m`).join(', '));
  await b.close();
 }
}finally{server?.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
