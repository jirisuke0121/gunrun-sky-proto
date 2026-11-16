// Execute the shipped rope controllers without a renderer: isolate angle-limit
// releases from collisions, climbing, bite holds and actual grip exhaustion.
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
class Vec {
  constructor(x=0,y=0,z=0){this.set(x,y,z)}
  set(x,y,z){Object.assign(this,{x,y,z});return this}
  clone(){return new Vec(this.x,this.y,this.z)}
  distanceTo(v){return Math.hypot(this.x-v.x,this.y-v.y,this.z-v.z)}
}
class Visual {
  constructor(){this.position=new Vec;this.scale={setScalar(){},y:1};this.rotation={};this.color={setHex(){}};this.children=[];}
  add(...nodes){this.children.push(...nodes)}
}
function fixture() {
  const listeners={},node=()=>({style:{},textContent:'',appendChild(){},addEventListener(){}});
  const c={pos:new Vec,vel:new Vec,r:.32,h:1.75,state:'normal',onGround:false,lastGround:new Vec};
  let mode='play';
  const game={c,U:{gravity:20},z:{t:0,over:false},modeRef:()=>mode,oe:()=>true,ue:{add(){}},Geom:Object.fromEntries(['Box','Torus','Mesh','Group','Basic','Standard'].map(k=>[k,Visual]))};
  const window={__skyInternals:game,__game:{stats:{}},skyOldTownSwingCourse:{}};
  const env={window,document:{createElement:node,body:{appendChild(){}},getElementById:()=>null},addEventListener:(name,fn)=>(listeners[name]??=[]).push(fn),console};
  vm.createContext(env);
  for(const name of ['rope-swing.js','rope-stations.js'])vm.runInContext(fs.readFileSync(name,'utf8'),env,{filename:name});
  for(const fn of listeners.load)fn();
  const step=(dt,input={fwdIn:1})=>{game.z.t+=dt;return window.skyRopeSwing.step(dt,input)};
  const key=(type)=>{for(const fn of listeners[type]||[])fn({code:'Space',repeat:false})};
  return {window,c,game,step,key,setMode:v=>mode=v};
}
const traces=[];
for(const fps of [20,30,60,120]) {
  const f=fixture(),w=f.window,s=w.SKY_ROPE_STATIONS.STATIONS[0],api=w.skyRopeStations;
  f.c.pos.set(s.px,s.parkY,s.pz);f.c.vel.set(s.dx*4,0,s.dz*4);
  f.step(1/fps);assert.ok(api.active(),'station attaches');
  let maxAngle=0;
  for(let i=0;i<6*fps;i++){
    f.step(1/fps);assert.ok(api.active(),`must stay attached with stamina remaining at ${fps}fps / ${i/fps}s`);
    maxAngle=Math.max(maxAngle,Math.abs(api.current().th));
  }
  assert.ok(api.grip()>.2);assert.ok(maxAngle<=75*Math.PI/180+1e-9,'swing stays inside the existing safety angle');
  traces.push({fps,seconds:6,grip:+api.grip().toFixed(3),maxDegrees:+(maxAngle*180/Math.PI).toFixed(1)});
  // A deliberate jump still releases immediately.
  f.key('keydown');f.step(1/fps);f.key('keyup');assert.equal(api.active(),false);
  // Actual stamina exhaustion still releases, without a key press.
  w.skyRopeSwing.cancel();f.c.state='normal';f.c.onGround=false;
  f.c.pos.set(s.px,s.parkY,s.pz);f.c.vel.set(s.dx*4,0,s.dz*4);f.step(1/fps);
  for(let i=0;i<9*fps && api.active();i++)f.step(1/fps);
  assert.equal(api.active(),false);assert.ok(api.grip()<=0,'only real exhaustion releases this isolated ride');
}
// The large two-way rope also retains its grip at the angle cap.
{
 const f=fixture(),w=f.window,s=w.SKY_ROPE_SWING.SIDES.A;
 f.c.pos.set(s.parkX,s.parkY,w.SKY_ROPE_SWING.Z);f.c.vel.set(11.5,0,0);f.step(1/120);
 assert.equal(w.skyRopeSwing.side(),'A');
 for(let i=0;i<7*120;i++){f.step(1/120);assert.ok(w.skyRopeSwing.active());assert.ok(Math.abs(w.skyRopeSwing.state().th)<=75*Math.PI/180+1e-9);}
 assert.ok(w.skyRopeStations.grip()>0 && w.skyRopeStations.grip()<.15,'large rope consumes the displayed shared stamina');
 for(let i=0;i<2*120 && w.skyRopeSwing.active();i++)f.step(1/120);
 assert.equal(w.skyRopeSwing.active(),false);assert.equal(w.skyRopeStations.grip(),0,'large rope only expires with the shared gauge empty');
 // A depleted station budget also prevents grabbing the large rope.
 w.skyRopeStations.cancel();
 w.skyRopeStations.spendGrip(8);
 f.c.pos.set(s.parkX,s.parkY,w.SKY_ROPE_SWING.Z);f.c.vel.set(11.5,0,0);f.c.onGround=false;f.c.state='normal';
 f.step(1/120);assert.equal(w.skyRopeSwing.active(),false);
}
console.log('PASS no angle-triggered grip loss; jump release and exhaustion preserved',JSON.stringify(traces));
