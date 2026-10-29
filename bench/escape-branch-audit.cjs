// Diagnostic controller: records successful and unsuccessful traversals without changing game files.
const fs=require('node:fs'),{spawn}=require('node:child_process'),{chromium}=require('playwright');
(async()=>{let browser,server;const output=[];fs.mkdirSync('branch-evidence',{recursive:true});try{
 server=spawn('python3',['-m','http.server','8786','--bind','127.0.0.1'],{stdio:'ignore'});
 for(let i=0;i<60;i++){if(await fetch('http://127.0.0.1:8786/').then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const touch of [false,true])for(const map of ['index','canyon']){
  const context=await browser.newContext({viewport:touch?{width:844,height:390}:{width:1280,height:720},hasTouch:touch,isMobile:touch});
  await context.addInitScript(()=>window.__hold=true);await context.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0,"ok":true}'}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(120000);
  await page.goto('http://127.0.0.1:8786/'+map+'.html?challengeDebug=1');await page.waitForFunction(()=>window.__game&&window.skySwing&&window.skyFollowCamera&&window.skyEscapeRoutes&&window.skyHumanView&&document.body.dataset.skyHumanLoaded==='true');await page.locator('#bStart').click();
  const result=await page.evaluate(({map,touch})=>{
   const g=__game,s=__skyInternals,c=g.P,dt=1/120,results=[];let seed=20261030;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
   function keysOff(){for(const k of Object.keys(g.keys))g.keys[k]=false;}
   const key=(code,type)=>dispatchEvent(new KeyboardEvent(type,{code}));
   function jump(){if(touch){const b=document.querySelector('#tJump');for(const type of ['pointerdown','pointerup'])b.dispatchEvent(new PointerEvent(type,{pointerId:777,pointerType:'touch',bubbles:true,cancelable:true}));}else{key('Space','keydown');key('Space','keyup');}}
   function clearEnemies(){for(const z of s.Jt){s.ue.remove(z.m.root);if(z.pool)s.ue.remove(z.pool);}s.Jt.length=0;}
   function reset(at,yaw=0,enemies=[]){seed=20261030;keysOff();skySwing.reset();skyLandingRoll.reset();skyDash.reset(false);clearEnemies();g.DOOR_FEEDBACK?.reset(g.DOORS||[]);
    g.SCR.off=g.PACE.off=g.MARK.off=true;Object.assign(g.S,{sendLog:false,gunOn:false,autoFire:false,aimAuto:false,stalkerOn:false,stalker2:false,dropShare:0});
    g.GAME.over=false;g.GAME.t=0;g.GAME.spawnT=g.GAME.surgeT=1e9;g.GAME.safeT=0;g.setMode('play');g.placeAt({x:at[0],y:at[1],z:at[2],yaw});
    Object.assign(c,{jumpBuf:0,coyote:0,slideBuf:0,slideCD:0,catchCD:0,hookPressed:false,crouchPressed:false,life:3,invuln:-1,edgeJump:false,edgeOff:null});
    for(let i=0;i<12;i++)g.advance(dt);
    c.node=g.nodeAt(c.pos.x,c.pos.y+.1,c.pos.z);g.updateField();
    for(const p of enemies){const z=new s.ri(...p);Object.assign(z,{spawnT:0,rise:null,hp:1e6,flank:false,dropper:false,stalker:false,onGround:true});z.node=g.nodeAt(...[p[0],p[1]+.1,p[2]]);s.Jt.push(z);}
   }
   function state(){return{t:g.GAME.t,p:c.pos.toArray(),v:c.vel.toArray(),state:c.state,ground:c.onGround,life:c.life,over:g.GAME.over,reason:g.GAME.reason,hookCD:c.hookCD,bodyFree:s.oe(c.pos.x,c.pos.y+.015,c.pos.z,c.r,c.h),ladder:c.ladder?{x:c.ladder.x,z:c.ladder.z,y0:c.ladder.y0,y1:c.ladder.y1}:null};}
   function walk(id,at,waypoints,{jumpZ=null,jumpX=null,enemies=[],maxSeconds=12,climb=false,descend=false}={}){waypoints=waypoints.map(p=>{const floors=g.st(p[0],p[2]).filter(y=>Math.abs(y-p[1])<.65&&s.oe(p[0],y+.02,p[2],c.r,1.75));floors.sort((a,b)=>Math.abs(a-p[1])-Math.abs(b-p[1]));return floors.length?[p[0],floors[0],p[2]]:p;});reset(at,0,enemies);const start=state(),trail=[],states=new Set();const fixtureInvalid=!s.oe(at[0],at[1]+.015,at[2],c.r,1.75)||Math.abs(start.p[1]-at[1])>.15;let i=0,jumped=false,minNearest=Infinity;let climbPressed=false;if(descend){skyEscapeRoutes.update();const b=document.getElementById('tLadderDown');if(b&&!b.hidden)b.click();}
    for(let tick=0;tick<maxSeconds*120&&!g.GAME.over;tick++){
     const dest=waypoints[i],dx=dest[0]-c.pos.x,dz=dest[2]-c.pos.z;
     if(Math.hypot(dx,dz)<.22&&Math.abs(c.pos.y-dest[1])<.2){if(c.state==='ledge'||c.state==='ladder'){g.keys.KeyW=false;g.advance(dt);continue;}i++;if(i===waypoints.length)break;continue;}
     c.yaw=Math.atan2(-dx,-dz);g.keys.KeyW=true;if(climb&&!climbPressed&&Math.hypot(c.pos.x-at[0],c.pos.z-at[2])>.15){jump();climbPressed=true;}
     if(!jumped&&c.onGround&&c.state==='normal'&&((jumpZ!==null&&c.pos.z<jumpZ)||(jumpX!==null&&c.pos.x<jumpX))){jump();jumped=true;}
     g.advance(dt);states.add(c.state);
     for(const z of s.Jt)minNearest=Math.min(minNearest,c.pos.distanceTo(z.pos));
     if(tick%12===0)trail.push({...state(),enemies:s.Jt.map(z=>({p:z.pos.toArray(),act:z.act?.kind}))});
    }
    keysOff();const r={id,kind:'walk',at,waypoints,start,end:state(),waypointsReached:i,complete:i===waypoints.length,fixtureInvalid,states:[...states],jumped,minNearest:Number.isFinite(minNearest)?minNearest:null,trail};results.push(r);return r;
   }
   if(map==='index'){
    walk('gallery-down',[-52.2,6.4,3.6],[[-52.2,4.6,8]],{maxSeconds:2});
    walk('high-east-return',[-35.65,15,-.3],[[-37.6,14.2,-.3],[-37.6,13.4,-2.2]],{maxSeconds:3});
    walk('north-original-inbound',[0,0,-17],[[0,0,-12]],{maxSeconds:4});
    walk('north-original-outbound',[0,0,-12],[[0,0,-19]],{maxSeconds:4});
    walk('north-new-inbound',[12,0,-15.5],[[12,0,-10]],{maxSeconds:4});
    walk('north-upper-west-east',[1.3,4,-12],[[1.3,4,-15.5],[12,4,-15.5],[12,4,-12]],{maxSeconds:8});
    walk('north-upper-east-west',[12,4,-12],[[12,4,-15.5],[1.3,4,-15.5],[1.3,4,-12]],{maxSeconds:8});
    walk('warehouse-ground-west-east',[-65,0,10],[[-49,0,10]],{maxSeconds:6});
    walk('warehouse-south-return',[-52.5,0,10],[[-52.5,0,19],[-46.5,0,19],[-46.5,0,11.5]],{maxSeconds:8});
    walk('east-lower-recovery',[54,-1,2.5],[[44,0,2.5]],{maxSeconds:7});
    walk('east-lower-recovery-south-detour',[54,-1,2.5],[[48,-1,3.6],[44,0,3.6]],{maxSeconds:7});
    walk('east-lower-recovery-jump',[54,-1,2.5],[[44,0,2.5]],{maxSeconds:7,jumpX:47.4});
    walk('pillar-lower-recovery',[29,-1.1,0],[[38,0,0]],{maxSeconds:5});
    walk('east-pillar-stair-return',[36,7,-.3],[[36,3.4,5.4],[38,3,5.4]],{maxSeconds:5});
    walk('north-lower-cross-east',[-30,-3.5,-34],[[38,-3.5,-34]],{maxSeconds:14});
    walk('south-gap-no-jump',[36,0,22.5],[[36,0,14]],{maxSeconds:3});
    for(const jumpZ of [21.5,20.5,19.95])walk('south-gap-jump-'+jumpZ,[36,0,23.5],[[36,0,14]],{jumpZ,maxSeconds:4});
    // Controlled route choices: same rear pressure with/without a northern interceptor.
    for(const mode of ['clear','rear','front-rear']){
     const enemies=mode==='clear'?[]:mode==='rear'?[[56,3.61,2.5]]:[[56,3.61,2.5],[60.7,3.61,-8]];
     walk('east-north-'+mode,[60.7,3.6,.5],[[60.7,3.6,-10.5],[60.7,4.68,-12.8],[43,14.4,-12.8],[43,14.4,-10]],{enemies,maxSeconds:15});
    }
    walk('south-recovery-stair',[36,-3.5,19],[[38.4,-3.5,19],[38.4,0,13.5]],{maxSeconds:6});
    walk('beam-T-roof',[-39.5,4.4,8],[[-42,4.4,8],[-42,3.1,2.8]],{maxSeconds:5});
    walk('east-lower-escape-with-pursuers',[56,3.6,2.5],[[51.8,3.6,2.5],[49,-1,2.5],[49,-1,3.6],[44,0,3.6]],{enemies:[[58,3.61,2.5],[60.7,3.61,-8]],jumpX:52.2,maxSeconds:10});
    walk('beam-T-north',[-39.5,4.4,8],[[-42,4.4,8],[-42,4.4,5]],{maxSeconds:5});
   }else{
    walk('middle-west-to-east',[-19,4,0],[[19,4,0]],{maxSeconds:8});
    walk('ground-west-ramp',[-25,.342857142857,-6],[[-28,1.6,6],[-25,3.3,16],[-20,4,13]],{maxSeconds:10});
    walk('ground-east-ramp',[25,.342857142857,8],[[28,1.6,-4],[25,3.3,-16],[20,4,-13]],{maxSeconds:10});
    walk('upper-spine', [0,8,12],[[0,8,-11]],{maxSeconds:6});
   }
   if(map==='index'){
    reset([54,-1,2.5],Math.PI/2);g.keys.KeyW=true;for(let i=0;i<240;i++)g.advance(dt);const before=state();jump();let airborne=false;
    for(let i=0;i<240&&!g.GAME.over;i++){g.advance(dt);airborne||=!c.onGround;if(c.pos.x<44)break;}keysOff();results.push({id:'east-lower-jump-after-stop',kind:'recovery',before,airborne,end:state()});
   }
   // Every ladder: approach from its ordinary lower side, then try normal roof-side access.
   for(let i=0;i<g.LADDERS.length;i++){
    const L=g.LADDERS[i],bottom=[L.x+L.nx*1.0,L.y0,L.z+L.nz*1.0],top=[L.x-L.nx*.8,L.y1,L.z-L.nz*.8];
    const levels=g.st(bottom[0],bottom[2]).filter(y=>Math.abs(y-L.y0)<.65&&s.oe(bottom[0],y+.015,bottom[2],c.r,1.75));if(levels.length)bottom[1]=levels.sort((a,b)=>Math.abs(a-L.y0)-Math.abs(b-L.y0))[0];
    if(L.sharedDoor){reset(bottom,Math.atan2(-(-L.nx),-(-L.nz)));jump();g.keys.KeyW=true;for(let j=0;j<15;j++)g.advance(dt);results.push({id:'shared-ladder-'+i,kind:'shared-ladder',entered:c.state==='ladder'||c.state==='ledge',end:state()});}
    walk('ladder-'+i+'-up',bottom,[[L.x-L.nx*.9,L.y1,L.z-L.nz*.9]],{maxSeconds:Math.max(5,(L.y1-L.y0)/4.2+4),climb:!!L.sharedDoor});
    walk('ladder-'+i+'-from-top',top,[[L.x+L.nx*.9,bottom[1],L.z+L.nz*.9]],{maxSeconds:Math.max(5,(L.y1-L.y0)/5+4),descend:true});
   }
   // Drop from each real bar after grabbing through its real attachment logic.
   for(const bar of skySwing.course.bars){
    reset([bar.at[0]-.3*bar.direction[0],bar.at[1]-2.15,bar.at[2]-.3*bar.direction[1]],Math.atan2(-bar.direction[0],-bar.direction[1]));
    skySwing.reset();c.pos.set(bar.at[0]-.3*bar.direction[0],bar.at[1]-2.15,bar.at[2]-.3*bar.direction[1]);c.onGround=false;c.vel.set(bar.direction[0]*3,-.2,bar.direction[1]*3);
    for(let i=0;i<10&&!skySwing.active;i++)g.advance(dt);
    const attached=skySwing.active?.bar.id,trail=[];let fell=false,minY=c.pos.y;if(attached)c.crouchPressed=true;
    for(let i=0;i<8*120&&!g.GAME.over;i++){g.advance(dt);minY=Math.min(minY,c.pos.y);if(i%12===0)trail.push(state());if(c.life<3){fell=true;break;}if(i>12&&c.onGround)break;}
    results.push({id:'bar-drop-'+bar.id,kind:'bar-drop',attached,fell,minY,end:state(),trail});
   }
   // Shared zip terminal: record selected target for different headings.
   if(map==='canyon')for(const yaw of [0,-.25,.25,-Math.PI/2,Math.PI/2,Math.PI]){
    reset([0,8,-12],yaw);c.yaw=yaw;jump();let attached=null;for(let i=0;i<45;i++){g.advance(dt);if(c.state==='zip'){attached={a:c.zip.a,b:c.zip.b};break;}}
    results.push({id:'zip-heading-'+yaw,kind:'zip-choice',yaw,attached,end:state()});
   }
   window.auditReset=reset;window.branchAuditResults=results;return{map,touch,ladderExits:g.LADDERS.map((l,i)=>({i,x:l.x,z:l.z,y0:l.y0,y1:l.y1,canExit:s.canExitLadder(l)})),settings:{sprint:g.S.sprintSpeed,jump:g.S.jumpVel,gravity:g.S.gravity,difficulty:skyChallenge.id},results};
  },{map,touch});
  result.errors=errors;const id=`${touch?'touch':'desktop'}-${map}`;fs.writeFileSync(`branch-evidence/${id}.json`,JSON.stringify(result,null,2));
  const assert=require('node:assert/strict'),by=id=>result.results.find(r=>r.id===id);
  for(const r of result.results.filter(r=>r.kind==='walk'&&r.id.startsWith('ladder-'))){if(r.id.endsWith('-from-top')){const n=+r.id.split('-')[1],L=result.ladderExits[n];assert.ok(r.end.state==='normal'&&r.end.ground&&r.end.p[1]<=L.y0+.65&&r.start.p[1]-r.end.p[1]>1,idFor(r));}else assert.equal(r.complete,true,idFor(r));assert.equal(r.end.bodyFree,true,idFor(r));}
  function idFor(r){return `${map}/${touch?'touch':'desktop'}/${r.id}: ${JSON.stringify(r.end)}`;}
  assert.ok(result.ladderExits.every(L=>L.canExit),'every ladder has a safe upper exit');
  if(map==='index')for(const name of ['gallery-down','high-east-return','north-original-inbound','north-original-outbound','north-upper-west-east','north-upper-east-west','east-lower-recovery-south-detour','east-pillar-stair-return','south-recovery-stair','beam-T-roof','east-lower-escape-with-pursuers'])assert.equal(by(name).complete,true,idFor(by(name)));
  if(map==='index')assert.ok(by('east-lower-escape-with-pursuers').end.life>0,'the lower branch must remain usable under the controlled pursuit');
  assert.ok(result.results.filter(r=>r.kind==='bar-drop').every(r=>r.attached&&!r.fell&&r.end.ground),'every tested bar drop reaches a floor without losing life');
  assert.ok(result.results.filter(r=>r.kind==='shared-ladder').every(r=>r.entered),'jump deliberately selects a shared ladder');
  if(map==='canyon')for(const [name,sign]of [['西へジップ',-1],['東へジップ',1]]){
   await page.evaluate(()=>{auditReset([0,8,-12]);skyEscapeRoutes.update();});
   const button=page.getByRole('button',{name,exact:true});if(touch)await button.tap();else await button.click();
   const picked=await page.evaluate(()=>{const trace=[];for(let i=0;i<3;i++){trace.push({state:__game.P.state,pos:__game.P.pos.toArray(),buf:__game.P.jumpBuf,cd:__game.P.setCD,choice:__game.P.zipChoice?.b,over:__game.GAME.over});__game.advance(1/120);}return{selected:__game.P.state==='zip'?__game.P.zip.b:null,trace};});assert.ok(picked.selected&&Math.sign(picked.selected[0])===sign,'explicit zip destination '+name+' '+JSON.stringify(picked));
  }
fs.writeFileSync(`branch-evidence/${id}.json`,JSON.stringify(result,null,2));
  for(const target of ['north-original-inbound','bar-drop-oldtown-east-bar-1','gallery-down','east-lower-recovery','ladder-0-up','ladder-1-up','ladder-2-up']){
   // Separate end-state inspection, without representing this as a continuous video.
   const item=result.results.find(r=>r.id===target);if(!item)continue;
   await page.evaluate(item=>{const g=__game,c=g.P,s=__skyInternals;c.pos.set(...item.end.p);c.state='normal';c.onGround=item.end.ground;c.vel.set(...item.end.v);c.yaw=0;g.cam(1/60);skyHumanView.update(1/60);g.debug.renderer.clear();g.debug.renderer.render(s.ue,s.Se);},item);
   await page.screenshot({path:`branch-evidence/${id}-${target}.png`});
  }
  output.push({id,errors,cases:result.results.length,walks:result.results.filter(r=>r.kind==='walk').map(({trail,...r})=>r),bars:result.results.filter(r=>r.kind==='bar-drop').map(({trail,...r})=>r),zips:result.results.filter(r=>r.kind==='zip-choice')});
  console.log('AUDIT '+id+' '+result.results.length+' cases '+errors.length+' page errors');await context.close();
 }
 fs.writeFileSync('branch-evidence/summary.json',JSON.stringify(output,null,2));
 if(output.some(x=>x.errors.length))throw Error('page error during diagnostic');
}finally{await browser?.close();server?.kill();}})().catch(e=>{console.error(e);process.exitCode=1});
