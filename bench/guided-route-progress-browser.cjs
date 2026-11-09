// Position/action fixtures exercise the live lesson/coach integration. Native
// movement and bar release are covered by guided-intro-cues/swing-landing.
const assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{const b=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});try{
 const base=process.env.RUNNING_QA_URL||'http://127.0.0.1:8882/';
 for(const z of [-3.2,0,3.2]){
  const p=await b.newPage({viewport:{width:844,height:390},hasTouch:true,isMobile:true}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(()=>window.__hold=true);
  await p.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"top":[]}'}));
  await p.goto(base+'canyon.html?learn=1&camera=after&lang=ja&return=canyon');
  await p.waitForFunction(()=>window.skyGuidedIntro?.choice==='choose',null,{timeout:90000});await p.locator('[data-learn-adopt=after]').click();
  const result=await p.evaluate(z=>{
   const g=__game,c=g.P,flow=skyGuidedIntro,steps=[];
   const at=(x,y,side=z,key,onGround=true)=>{c.pos.set(x,y,side);c.vel.set(0,0,0);c.onGround=onGround;c.state='normal';if(key)g.stats[key]=(g.stats[key]||0)+1;flow.beforeFrame();const s={stage:flow.stage,checkpoint:skyPractice.section.id,cue:flow.cue,blocked:flow.blocked,retries:skyPractice.retries};steps.push(s);return s;};
   at(10,2); // the start marker was passed on either side
   at(17,2); // missed the low wall: recover, never stay silently stuck
   at(11,2,z,'vaults');
   at(14.5,2,z,'jumps'); // the gap jump starts before its lesson becomes active
   at(23,2);
   at(28,2);
   at(34.5,4.4,z,'mantles');
   at(50,4.4,z,'wallruns');
   at(65,5.2,z,'hooks');
   at(84,0,z,'slides');
   at(93,4,z,'ladders');
   at(112,2.8,z,'zips');
   at(115.6,2.8,z<0?-4.25:z); // bypass the narrow lateral waypoint at z=-3.2
   const pathCue=flow.cue;
   at(119,4,0,'walljumps');
   at(119.2,4,0,'barJumps'); // a failed swing returns to its own checkpoint
   const retryCue=flow.cue;
   at(124,6,0,'barJumps',false); // early observation on the next attempt
   at(140.5,6.8,z>0?3.2:z<0?-3.2:0); // every part of the connected roof counts
   return {steps,pathCue,retryCue,completed:flow.completed};
  },z);
  assert.equal(result.steps[0].stage,'vault');
  assert.equal(result.steps[1].stage,'vault');assert.equal(result.steps[1].retries,1);
  assert.equal(result.steps[3].stage,'jump');assert.equal(result.steps[4].stage,'crouch','early action survives the lesson boundary');
  assert.equal(result.steps[12].stage,'walljump');assert.equal(result.pathCue.at[2],0,'lateral waypoint does not trap the player');
  assert.equal(result.steps[13].stage,'swing');
  assert.equal(result.steps[14].stage,'swing');assert.equal(result.steps[14].retries,2);assert.equal(result.steps[14].checkpoint,'swing');
  assert.equal(result.steps.at(-1).stage,'dash');assert.equal(result.steps.at(-1).checkpoint,'dash');assert.ok(result.completed.includes('swing'));
  assert.deepEqual(errors,[]);console.log('PASS live lesson fixtures across roof lane',z);await p.close();
 }
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
