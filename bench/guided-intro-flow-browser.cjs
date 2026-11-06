const assert=require('node:assert/strict');
const {chromium}=require('playwright'),{spawn}=require('child_process'),fs=require('fs');
(async()=>{let b,server;try{
 const port=process.env.LEARN_PORT||'18831',caseID=(process.env.LEARN_CAMERA||'before')+'-'+(process.env.LEARN_RETURN||'town')+'-'+(process.env.LEARN_LANG||'ja')+(process.env.LEARN_RETRY?'-retry-'+process.env.LEARN_RETRY:'');
 server=spawn('python3',['-m','http.server',port,'--bind','127.0.0.1'],{stdio:'ignore'});for(let i=0;i<50;i++){if(await fetch('http://127.0.0.1:'+port).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100));}
 b=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const p=await b.newPage({viewport:{width:844,height:390},hasTouch:true,isMobile:true}),errors=[];await p.addInitScript(()=>window.__hold=true);p.on('pageerror',e=>errors.push(e.message));await p.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"top":[]}'}));
 await p.goto('http://127.0.0.1:'+port+'/canyon.html?learn=1&cameraTrial=fixed&camera='+ (process.env.LEARN_CAMERA||'before') +'&guides=0&hookGuide=0&controlpick=0&return='+(process.env.LEARN_RETURN||'town')+'&lang='+(process.env.LEARN_LANG||'ja'));await p.waitForFunction(()=>window.skyGuidedIntro&&__game.mode==='play',null,{timeout:90000});
 await p.locator('#learnGo').click();
 await p.exposeFunction('touchWorld',point=>p.touchscreen.tap(point.x,point.y));await p.exposeFunction('touchSkill',id=>p.locator('#'+id).tap());
 const capture=!process.env.LEARN_RETRY&&process.env.LEARN_CAMERA==='after'&&(!process.env.LEARN_RETURN||process.env.LEARN_RETURN==='town')&&(!process.env.LEARN_LANG||process.env.LEARN_LANG==='ja');
 if(capture){fs.mkdirSync('browser-evidence/guided-intro/views',{recursive:true});await p.exposeFunction('captureLesson',name=>p.screenshot({path:'browser-evidence/guided-intro/views/'+name+'.png'}));}
 const r=await p.evaluate(async retryCase=>{
  const g=__game,c=g.P,dt=1/120,trace=[],stages=[];const runStart=g.GAME.t;
  const key=code=>{document.dispatchEvent(new KeyboardEvent('keydown',{code,bubbles:true}));document.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));};
  const tick=()=>{g.advance(dt);trace.push({t:g.GAME.t,p:c.pos.toArray(),state:c.state,section:skyGuidedIntro.stage});};
  const fixed=skyFixedCamera.active,clear=()=>{Object.assign(__skyInternals.inputState,{on:false,x:0,y:0,id:null});for(const k of ['KeyW','KeyS','KeyA','KeyD'])g.keys[k]=false;};
  function moveTo(x,z,max=900,action){clear();g.keys.KeyW=!fixed;for(let i=0;i<max;i++){const dx=x-c.pos.x,dz=z-c.pos.z;if(Math.hypot(dx,dz)<.32){clear();return true;}if(fixed){const yaw=skyFixedCamera.pose.yaw,fx=-Math.sin(yaw)*dx-Math.cos(yaw)*dz,sx=Math.cos(yaw)*dx-Math.sin(yaw)*dz;Object.assign(__skyInternals.inputState,{on:true,id:900,x:sx/Math.hypot(dx,dz),y:-fx/Math.hypot(dx,dz)});}else c.yaw=Math.atan2(-dx,-dz);action?.();tick();}clear();return false;}
  function wait(max,condition){clear();for(let i=0;i<max;i++){tick();if(condition())break;}}
  async function mark(name){stages.push({name,t:g.GAME.t,pos:c.pos.toArray(),state:c.state,ground:c.onGround,coyote:c.coyote,velocity:c.vel.toArray(),stats:{...g.stats},flash:{...skyFlashbang.stats},charges:skyFlashbang.charges,enemies:skyPractice.targets.map(e=>({pos:e.pos.toArray(),dead:e.dead,remove:e.remove})),fall:skyPractice.retries,guide:skyGuidedIntro.stage});const expected={move:'vault',vault:'jump',gap:'crouch',crouch:'mantle',mantle:'wallrun',wallrun:'hook',hook:'downhill',downhill:'ladder',ladder:'zip',zip:'walljump',wallkick:'swing',swing:'dash',dash:'stomp',stomp:'kick',kick:'flash',flash:'decoy',decoy:'blast',blast:'jumpgun','jumpgun-pickup':'jumpgun',jumpgun:'exit'};if(expected[name]&&skyGuidedIntro.stage!==expected[name])throw Error(JSON.stringify(stages.slice(-3)));if(window.captureLesson&&['move','wallrun','hook','zip','wallkick','swing','stomp','kick','flash','decoy','blast','jumpgun'].includes(name)){g.cam(dt);skyHumanView.update(dt);await new Promise(requestAnimationFrame);g.frameOnce(0);await window.captureLesson(name);}}
  const tapWorld=async at=>{g.frameOnce(0);const v=new __skyInternals.Geom.Vector3(...at).project(__skyInternals.Se);await window.touchWorld({x:(v.x+1)*844/2,y:(1-v.y)*390/2});};
  // Native controls only: never move the player by assigning position or selecting stations.
  moveTo(10,0);await mark('move');moveTo(16.8,0);await mark('vault');
  let jumped=false;moveTo(21.5,0,800,()=>{if(!jumped&&c.pos.x>17&&c.onGround){key('Space');jumped=true;}});wait(180,()=>c.onGround);await mark('gap');
  moveTo(28,0);await mark('crouch');
  let mantle=false;moveTo(35.5,0,800,()=>{if(!mantle&&c.pos.x>29&&c.onGround){key('Space');mantle=true;}});await mark('mantle');
  moveTo(37,-1.3);let runJump=false;moveTo(50,-1.3,900,()=>{if(!runJump&&c.pos.x>37.4&&c.onGround){key('Space');runJump=true;}});wait(180,()=>c.onGround&&c.state==='normal');await mark('wallrun');
  moveTo(53,0);c.yaw=-Math.PI/2;c.pitch=0;g.cam(dt);skyHumanView.update(dt);await tapWorld([64,6.6,0]);wait(500,()=>c.onGround&&c.state==='normal'&&c.pos.x>61);await mark('hook');
  moveTo(70.2,0);c.yaw=-Math.PI/2;key('KeyC');moveTo(84,0,900);await mark('downhill');
  moveTo(93.8,0,1000);await mark('ladder');clear();c.yaw=-Math.PI/2;key('Space');wait(800,()=>g.stats.zips>0&&c.onGround&&c.state==='normal');await mark('zip');
  moveTo(115,-3.2);moveTo(115,0);wait(20,()=>false);c.yaw=-Math.PI/2;key('Space');for(let i=0;i<12;i++)tick();key('Space');g.keys.KeyW=true;
  for(let i=0;i<180;i++){tick();if(c.onGround&&c.pos.y>3.9&&c.pos.x>117.7)break;}clear();await mark('wallkick');
  key('Space');g.keys.KeyW=true;const bars=new Set();
  for(let i=0;i<500;i++){const a=skySwing.active;if(a){bars.add(a.bar.id);if(a.angle>=.7&&a.omega>1.1)key('Space');}tick();if(bars.size===2&&c.onGround&&c.pos.y>6.7)break;}clear();await mark('swing');
  if(retryCase==='dash'){moveTo(145,0);wait(180,()=>c.onGround);wait(100,()=>Math.hypot(c.vel.x,c.vel.z)<.05);const n=skyPractice.retries;clear();g.keys[fixed?'KeyD':'KeyW']=true;c.yaw=0;for(let i=0;i<650&&skyPractice.retries===n;i++){if(c.onGround&&i%90===0)key('Space');tick();}clear();if(skyPractice.retries!==n+1||skyGuidedIntro.stage!=='dash')throw Error(JSON.stringify({reason:'collected DASH retry failed',pos:c.pos.toArray(),stage:skyGuidedIntro.stage,retries:skyPractice.retries}));await mark('pickup-retry');}
  moveTo(151.8,0);key('Space');moveTo(163,0,900);wait(200,()=>c.onGround);wait(140,()=>Math.hypot(c.vel.x,c.vel.z)<.05);await mark('dash');
  if(retryCase==='stomp'){const n=skyPractice.retries;clear();g.keys.KeyW=true;c.yaw=-Math.PI/2;for(let i=0;i<500&&skyPractice.retries===n;i++)tick();clear();if(skyPractice.retries!==n+1||skyGuidedIntro.stage!=='stomp')throw Error('missed-action retry did not return to stomp');await mark('overshoot-retry');}
  moveTo(165.5,0);let stomped=false;moveTo(169,0,400,()=>{if(!stomped&&c.pos.x>167.3&&c.onGround){key('Space');stomped=true;}});wait(200,()=>g.stats.stomps>0);await mark('stomp');
  wait(180,()=>c.onGround);moveTo(169,0);for(let i=0;i<8;i++)tick();await mark('kick-ready');key('Space');for(let i=0;i<8;i++)tick();await mark('kick-air');let kicked=false;moveTo(172,.35,400,()=>{if(!kicked&&c.pos.x>170.9&&!c.onGround){key('Space');kicked=true;}});wait(180,()=>c.onGround);await mark('kick');
  c.yaw=-Math.PI/2;await window.touchSkill('tFlash');wait(220,()=>skyGuidedIntro.stage==='decoy');await mark('flash');
  await window.touchSkill('tDecoy');moveTo(181,0,600);wait(60,()=>skyGuidedIntro.stage==='blast');await mark('decoy');
  moveTo(183,0);c.yaw=-Math.PI/2;c.pitch=0;g.cam(dt);skyHumanView.update(dt);await tapWorld([188,1.2,0]);wait(900,()=>g.stats.blastLaunches>0&&c.onGround&&c.pos.x>194);await mark('blast');
  moveTo(201,0);await mark('jumpgun-pickup');c.yaw=-Math.PI/2;await window.touchSkill('tJumpGun');g.keys.KeyW=true;
  for(let i=0;i<360;i++){tick();if(c.onGround&&c.pos.y>7.9)break;}clear();await mark('jumpgun');
  moveTo(227,0,600);await mark('exit');if(skyGuidedIntro.stage==='rescue'){clear();await window.touchSkill('tRescue');wait(600,()=>skyGuidedIntro.finished);await mark('rescue');}
  return{total:skyGuidedIntro.total,finished:skyGuidedIntro.finished,url:location.href,completed:skyGuidedIntro.completed,stage:skyGuidedIntro.stage,stages,trace,falls:skyPractice.retries,time:g.GAME.t-runStart};
 },process.env.LEARN_RETRY||'');
 console.log(r.stages.map(s=>s.name.split(':')[0]+' → '+s.guide).join(' | '));fs.mkdirSync('browser-evidence/guided-intro',{recursive:true});fs.writeFileSync('browser-evidence/guided-intro/flow-'+caseID+'.json',JSON.stringify(r));
 assert.deepEqual(errors,[]);assert.equal(r.falls,process.env.LEARN_RETRY?1:0,'only the explicitly missed-action case may retry');
 const end=r.stages.find(s=>s.name==='exit');assert.ok(Math.abs(end.pos[1]-8)<.05&&Math.hypot(end.pos[0]-227,end.pos[2])<1,JSON.stringify(end));
 for(const key of ['vaults','mantles','slides','wallruns','walljumps','hooks','zips','barGrabs','barJumps','ladders','dashPickups','stomps','kicks','blastLaunches','jumpGunLaunches'])assert.ok(process.env.LEARN_RETRY?r.stages.some(s=>s.stats[key]>0):end.stats[key]>0,'missing actual movement action: '+key);
 assert.equal(r.completed.length,r.total-1,JSON.stringify({stage:r.stage,completed:r.completed}));
 await p.waitForURL('**/*learned=1*',{timeout:20000});await p.waitForFunction(()=>window.__game?.mode==='play'&&window.skyChallenge?.id==='easy'&&!window.skyPracticeMode,null,{timeout:120000}).catch(async e=>{console.log('MAIN',await p.evaluate(()=>({url:location.href,mode:__game?.mode,challenge:skyChallenge?.id})),errors);throw e});
 assert.equal(await p.evaluate(()=>__game.P.life),8);
 fs.mkdirSync('browser-evidence/guided-intro',{recursive:true});
 const summary={time:r.time,falls:r.falls,stages:r.stages};fs.writeFileSync('browser-evidence/guided-intro/results-'+caseID+'.json',JSON.stringify(summary,null,2));
 await p.evaluate(()=>{const g=__game;g.cam(1/60);skyHumanView.update(1/60);g.debug.renderer.clear();g.debug.renderer.render(__skyInternals.ue,__skyInternals.Se);});
 await p.screenshot({path:'browser-evidence/guided-intro/full-loop-'+caseID+'.png'});
 console.log('PASS: complete physical course, every action; '+r.falls+' intentional retries; '+r.time.toFixed(2)+' seconds');
}finally{await b?.close();server?.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
