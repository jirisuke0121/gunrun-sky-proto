// Dropping onto a swing bar from above (4 m and 8 m, no run-up) must catch it.
const assert=require('node:assert/strict');
const {chromium}=require('playwright'),{spawn}=require('child_process');
(async()=>{let b,server;try{
 server=spawn('python3',['-m','http.server','8782','--bind','127.0.0.1'],{stdio:'ignore'});for(let i=0;i<50;i++){if(await fetch('http://127.0.0.1:8782').then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100));}
 b=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const p=await b.newPage({viewport:{width:844,height:390}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"top":[]}'}));
 await p.goto('http://127.0.0.1:8782/index.html');await p.waitForFunction(()=>window.__game&&window.skySwing,null,{timeout:120000});
 await p.evaluate(()=>window.__game.startGame());await p.waitForFunction(()=>window.__game.mode==='play',null,{timeout:120000});
 const results=await p.evaluate(()=>{
  const g=window.__game,c=g.P,S=window.skySwing,dt=1/60,out=[];
  for(const bar of S.course.bars)for(const height of [4,8]){
   S.reset?.();c.state='normal';c.swing=null;c.swingFall=null;c.swingFlight=null;
   c.pos.set(bar.at[0],bar.at[1]+height,bar.at[2]);c.vel.set(0,0,0);c.onGround=false;
   let grabbed=false;for(let i=0;i<240;i++){g.advance(dt);if(c.state==='swing'){grabbed=true;break;}if(c.onGround)break;}
   out.push({id:bar.id,height,grabbed});
  }
  return out;});
 assert.deepEqual(errors,[]);
 for(const r of results)assert.ok(r.grabbed,`${r.id}: dropped from ${r.height} m above and fell through the bar`);
 console.log(`PASS: ${results.length} drops onto ${results.length/2} bars (4 m and 8 m above) all caught the bar`);
}finally{await b?.close();server?.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
