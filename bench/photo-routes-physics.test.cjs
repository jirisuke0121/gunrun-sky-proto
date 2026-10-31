const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function extract(source,name){const at=source.indexOf('function '+name+'(',1600000);assert.ok(at>=0,name);let i=source.indexOf('{',at),d=1,q='';for(++i;d;i++){const c=source[i];if(q){if(c==='\\')i++;else if(c===q)q='';}else if('"\'`'.includes(c))q=c;else if(c==='{')d++;else if(c==='}')d--;}return source.slice(at,i);}
(async()=>{
 const helpers=fs.readFileSync(__dirname+'/central-corners.test.cjs','utf8').split('(async()=>{')[0],hc={require,__dirname,URLSearchParams,console};vm.runInNewContext(helpers+';this.map=geometry();this.V=Vec;this.T=Visual;',hc);
 const {createSwing}=await import('../parkour-swing.js'),Vec=hc.V,Visual=hc.T,map=hc.map,jn=map.solids.filter(b=>!b.off),source=fs.readFileSync('index.html','utf8');
 Vec.prototype.copy=function(v){return this.set(v.x,v.y,v.z)};
 const a=source.indexOf('Jn={walkSpeed:'),end=source.indexOf('},uo=',a),U=vm.runInNewContext('('+source.slice(a+3,end+1)+')');
 const listeners={},c={pos:new Vec,vel:new Vec,lastGround:new Vec,r:.32,h:1.75,yaw:0,state:'normal',onGround:true,slideCD:0,slideT:0,slideBuf:0,jumpBuf:0,coyote:0,catchCD:0,airT:0,eye:1.62,life:3,hookCD:0};
 global.document={body:{dataset:{},appendChild(){}},head:{appendChild(){}},getElementById(){return null},querySelector(){return null},createElement(){return{style:{setProperty(){}},dataset:{},getContext(){return{fillRect(){},strokeRect(){},fillText(){}}}}}};global.addEventListener=(type,fn)=>(listeners[type]??=[]).push(fn);
 let input=0;
 const ctx={window:{},jn,Ja:[],c,U,ft:{topSpeed:0,jumps:0},Tt:{slide(){},step(){},jump(){},wall(){},land(){},vault(){}},ke:.32,sn:1.75,Je:.9,ei:.0001,ie:'play',z:{over:false,t:0},Oe:{},Ot:{on:false},ge:(x,a,b)=>Math.max(a,Math.min(b,x)),Mt:(a,b,t)=>a+(b-a)*t,md:()=>({fwdIn:input,strIn:0,tmag:Math.abs(input)}),zn:()=>jn,jc:()=>null,H_:()=>false,Y_:()=>false,J_:()=>false,ah:()=>false,z_:()=>{},U_:()=>{},D_:()=>{},ja:()=>true};
 vm.createContext(ctx);for(const name of ['Vc','oe','Dn','F_','k_','gd','N_','O_','X_'])vm.runInContext(extract(source,name),ctx);
 ctx.window.__skyTryRegisteredWallJump=()=>false;ctx.window.skyTelemetryProbe={jumpAccepted(){}};
 ctx.window.__skyInternals={c,near:()=>jn,oe:ctx.oe,fallY:-22};vm.runInContext(fs.readFileSync('edge-assist.js','utf8'),ctx);
 global.window=ctx.window;
 const sky={c,U,z:ctx.z,Geom:{Group:Visual,Standard:Visual,Cylinder:Visual,Mesh:Visual,Vector3:Vec,Box:Visual,Torus:Visual,Sprite:Visual,SpriteMaterial:Visual,CanvasTexture:Visual},ue:{add(){}},oe:ctx.oe,modeRef:()=> 'play',Tt:ctx.Tt};
 const swing=createSwing(sky,{stats:ctx.ft,RL:{events:[]}},{...map.course,supports:[],arrows:[]});ctx.window.skySwing=swing;
 const dt=1/120,results=[];
 function step(){ctx.z.t+=dt;ctx.gd(dt);assert.ok(c.pos.y>-22,'no fall reset');assert.ok(c.pos.toArray().every(Number.isFinite));}
 function reset(p,yaw){swing.reset();c.pos.set(p[0],p[1]+.0001,p[2]);c.lastGround.copy(c.pos);c.vel.set(0,0,0);Object.assign(c,{yaw,state:'normal',onGround:true,h:1.75,slideCD:0,slideBuf:0,slideT:0,catchCD:0,jumpBuf:0,coyote:.15,airT:0,edgeOff:null,setCD:0,crouchPressed:false,hookPressed:false,hookCD:0});input=0;ctx.z.t=0;}
 function jump(){c.jumpBuf=U.jumpBuffer;for(const f of listeners.keydown||[])f({code:'Space',repeat:false});for(const f of listeners.keyup||[])f({code:'Space'});}
 function walk(points){for(const p of points){let done=false;for(let i=0;i<1800;i++){const dx=p[0]-c.pos.x,dz=p[2]-c.pos.z;if(Math.hypot(dx,dz)<.18&&Math.abs(c.pos.y-p[1])<.7&&c.onGround){done=true;break;}c.yaw=Math.atan2(-dx,-dz);input=1;step();}assert.ok(done,'walk '+p+' '+JSON.stringify(c.pos.toArray()));input=0;for(let i=0;i<12;i++)step();}}
 // Real hook pulling, release, gravity, braking and capsule collision at defaults.
 reset([45,0,-15.25],-Math.PI/2);c.state='hook';c.hook=map.hooks.at(-2);c.hookT=0;c.onGround=false;
 let landed=false;for(let i=0;i<720;i++){if(c.state==='normal')input=c.vel.x>.4?-1:0;step();if(c.onGround&&Math.abs(c.pos.y-3.6)<.1){landed=true;break;}}
 assert.ok(landed,'default hook reaches outer ledge');results.push({id:'tower-hook-default',p:c.pos.toArray(),seconds:ctx.z.t});
 // The corrected photo line goes west, then rejoins the existing 3.4m beam.
 reset([45,0,-16.2],Math.PI/2);c.state='hook';c.hook=map.hooks.at(-1);c.hookT=0;c.onGround=false;
 landed=false;for(let i=0;i<720;i++){if(c.state==='normal')input=c.vel.x<-.4?-1:0;step();if(c.onGround&&Math.abs(c.pos.y-3.4)<.1){landed=true;break;}}
 assert.ok(landed,'west hook reaches the beam ledge');walk([[36.2,3.4,-15.7],[36.5,3.4,-13],[35.75,3.4,-13],[30.8,7.4,-13],[30.8,7.4,-13.9]]);results.push({id:'tower-west-hook-default',p:c.pos.toArray(),seconds:ctx.z.t});
 for(const angle of [.55,.65,.8])for(const offset of [-.25,0,.25]){
  reset([12,0,-15.5],-Math.PI/2);walk([[15.5+offset,0,-15.5]]);c.yaw=Math.PI;input=1;for(let i=0;i<120&&c.pos.z<-15.05;i++)step();const takeoff={p:c.pos.toArray(),speed:Math.hypot(c.vel.x,c.vel.z)};jump();let grabbed=false,released=false;landed=false;
  for(let i=0;i<840;i++){const active=swing.active;if(active){grabbed=true;if(!released&&active.angle>=angle&&active.omega>1.1){jump();released=true;}}if(grabbed&&!active&&c.state==='normal'&&!c.onGround)input=c.vel.z>.4&&(-3.6-c.pos.z<c.vel.z*c.vel.z/28+.25)?-1:0;step();if(grabbed&&c.onGround&&c.state==='normal'&&Math.abs(c.pos.y)<.1){landed=true;break;}}
  assert.ok(grabbed&&released&&landed,'default swing '+JSON.stringify({angle,offset,takeoff,p:c.pos.toArray(),state:c.state}));
  walk([[15.5,0,-3.7],[12,0,-3.7],[12,0,-9]]);results.push({id:'north-east-default',angle,offset,takeoff,p:c.pos.toArray(),seconds:ctx.z.t});
 }
 reset([12,0,-15.5],-Math.PI/2);walk([[15.5,0,-15.5]]);c.yaw=Math.PI;input=1;for(let i=0;i<120&&c.pos.z<-15.05;i++)step();jump();let dropped=false;landed=false;
 for(let i=0;i<840;i++){if(swing.active){input=-1;dropped=true;}else if(dropped)input=0;step();if(dropped&&c.onGround&&Math.abs(c.pos.y+3.5)<.1){landed=true;break;}}
 assert.ok(landed,'default bar drop reaches recovery floor');walk([[17.3,-3.5,-12.2],[17.3,0,-18.15],[15.2,0,-18.15],[15.2,0,-15.5],[12,0,-15.5]]);results.push({id:'north-east-default-recovery',p:c.pos.toArray(),seconds:ctx.z.t});
 console.log(JSON.stringify({pass:true,settings:{speed:U.sprintSpeed,jump:U.jumpVel,gravity:U.gravity},results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
