const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
 const {advanceGrip,GRIP_TURNS,GRIP_LET_GO_SECONDS,GRIP_SLIP_SECONDS,MAX_GRIP_SECONDS}=await import('../swing-fatigue.js');
 const {createSwing}=await import('../parkour-swing.js');
 const {gripSlipPose}=await import('../human-actions.js');
 const hc={require,__dirname,URLSearchParams,console};
 vm.runInNewContext(fs.readFileSync(__dirname+'/central-corners.test.cjs','utf8').split('(async()=>{')[0]+';this.V=Vec;this.T=Visual;',hc);
 const Vec=hc.V,T=hc.T;Vec.prototype.copy=function(p){return this.set(p.x,p.y,p.z)};
 const fake=()=>({hidden:false,textContent:'',dataset:{},style:{setProperty(){}},setAttribute(){},querySelector(){return fake()},addEventListener(){},getContext(){return{fillRect(){},strokeRect(){},fillText(){}}}});
 let mode='play';const listeners={};
 global.window={matchMedia:()=>({matches:false})};
 global.document={body:{dataset:{},appendChild(){}},head:{appendChild(){}},getElementById(){return null},querySelector(){return null},createElement:fake};
 global.addEventListener=(type,fn)=>(listeners[type]??=[]).push(fn);
 const c={pos:new Vec(-1,6,0),vel:new Vec(5,0,0),r:.32,h:1.75,state:'normal',onGround:false};
 const sky={c,U:{gravity:20,jumpVel:7.2},z:{t:0,over:false},Geom:{Group:T,Standard:T,Cylinder:T,Mesh:T,Vector3:Vec,Box:T,Torus:T,Sprite:T,SpriteMaterial:T,CanvasTexture:T},ue:{add(){}},oe:()=>true,modeRef:()=>mode,Tt:{}};
 const game={stats:{},RL:{events:[]}},course={oldTown:true,bars:[{id:'a',at:[0,8,0],direction:[1,0],width:2.6},{id:'b',at:[8,8,0],direction:[1,0],width:2.6}]};
 const swing=createSwing(sky,game,course),traces=[];
 function approach(x=-1){c.pos.set(x,6,0);c.vel.set(5,0,0);c.state='normal';c.onGround=false;assert.ok(swing.step(1/120,{fwdIn:1}));assert.ok(swing.active);}
 function press(){for(const f of listeners.keydown||[])f({code:'Space',repeat:false});for(const f of listeners.keyup||[])f({code:'Space'});}
 for(const fps of [20,30,60,120])for(const fwdIn of [0,1]){
  swing.reset();approach();const dt=1/fps;let elapsed=0,warning=false,slip=false,turns=0,slipAt=0;
  while(swing.active&&elapsed<MAX_GRIP_SECONDS+1){
   swing.step(dt,{fwdIn});elapsed+=dt;
   if(swing.active){turns=swing.active.turns;warning ||= swing.active.fatigue>.65;
    if(swing.active.slipAge!==undefined&&!slip){slip=true;slipAt=elapsed;assert.ok(turns===GRIP_TURNS||swing.active.heldSeconds>=MAX_GRIP_SECONDS);}
   }
  }
  assert.ok(!swing.active&&warning&&slip);assert.equal(c.state,'normal');assert.ok(c.vel.y<0);assert.equal(c.edgeJump,false);assert.equal(c.jumpBuf,0);
  assert.ok(elapsed-slipAt>=GRIP_LET_GO_SECONDS-dt-.001);assert.ok(c.swingFall?.age>=GRIP_LET_GO_SECONDS);
  assert.equal(game.stats.barJumps||0,0,'exhaustion is not a jump or timing reward');
  assert.equal(game.RL.events.at(-1).e,'barExhausted');
  // A fall does not immediately regenerate grip by catching the same bar.
  for(let i=0;i<80;i++)swing.step(dt,{fwdIn:0});c.pos.set(-1,6,0);c.vel.set(5,0,0);
  assert.equal(swing.step(dt,{fwdIn:1}),false);assert.equal(swing.active,null);
  c.onGround=true;swing.step(dt,{});approach();assert.equal(swing.active.turns,0);
  traces.push({fps,fwdIn,elapsed,turns});
 }
 // Pausing neither spends grip nor advances the release animation.
 swing.reset();approach();const age=swing.active.age;mode='pause';swing.step(3,{fwdIn:1});assert.equal(swing.active.age,age);mode='play';
 // A brief jump/drop and regrab of the same bar carries its spent budget.
 while(swing.active.turns<2)swing.step(1/120,{fwdIn:1});const spent=swing.active.heldSeconds,turns=swing.active.turns;
 press();swing.step(1/120,{fwdIn:1});assert.ok(!swing.active&&c.swingFlight);
 for(let i=0;i<60;i++)swing.step(1/120,{fwdIn:0});approach();assert.equal(swing.active.turns,turns);assert.equal(swing.active.heldSeconds,spent);
 // Actually moving to the other bar grants a fresh budget.
 press();swing.step(1/120,{fwdIn:1});for(let i=0;i<60;i++)swing.step(1/120,{fwdIn:0});approach(7);assert.equal(swing.active.bar.id,'b');assert.equal(swing.active.turns,0);
 // Forward release still launches immediately, even during the warning.
 while(swing.active.turns<4)swing.step(1/120,{fwdIn:1});press();swing.step(1/120,{fwdIn:1});assert.ok(c.swingFlight&&!c.swingFall&&c.edgeJump);
 swing.reset();assert.equal(c.swingFall,null);assert.equal(swing.handPose(1),null);
 // Tiny velocity chatter on the same side never counts as a round trip.
 const chatter={turns:0,turnSide:0,angle:.4,omega:-.01,heldSeconds:0};
 for(let i=0;i<100;i++){chatter.omega*=-1;advanceGrip(chatter,1/120,-chatter.omega);}assert.equal(chatter.turns,1);
 const p0=gripSlipPose(0),p1=gripSlipPose(1/3),p2=gripSlipPose(2/3);
 assert.ok(p1.hands.right[1]<p0.hands.right[1]-.7&&p1.hands.left[1]>2.5,'right hand slips before the left');
 assert.ok(p2.hands.left[1]<p0.hands.left[1]-.7,'both hands release before falling recovery');
 assert.ok(GRIP_SLIP_SECONDS>GRIP_LET_GO_SECONDS);
 console.log(JSON.stringify({pass:true,traces}));
})().catch(e=>{console.error(e);process.exitCode=1});
