const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
const {createHybridCamera}=await import('../hybrid-camera.js');
const source=fs.readFileSync('fixed-camera-trial.js','utf8').replace(/^import .*;\n/gm,'');
const near=(a,b)=>assert.ok(Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)))<1e-8,`${a} != ${b}`);
for(const touch of[false,true])for(const [x,f]of[[1,0],[0,1],[-1,0],[0,-1],[.6,.8]]){
 const view={yaw:0,pitch:-.65},c={yaw:0,pos:{x:0,y:0,z:0},vel:{x:0,y:0,z:0},state:'normal',onGround:true};
 const inputState={on:touch,id:touch?1:null},doc={body:{dataset:{}},documentElement:{dataset:{}},head:{append(){}},createElement:()=>({}),addEventListener(){}};
 const window={__skyInternals:{c,inputState},skyFollowCamera:{mode:'after'},addEventListener(){}};
 vm.runInNewContext(source,{window,document:doc,location:{search:'?cameraTrial=hybrid'},URLSearchParams,Math,
  createHybridCamera:()=>({view,reset(){view.yaw=0},get state(){return {section:'assist'}}})});
 const api=window.skyFixedCamera,raw=(x,f)=>({strIn:x,fwdIn:f});
 const initial=api.input(raw(x,f)).heading;
 for(const yaw of[.1,.6,1.2,Math.PI,-2]){view.yaw=yaw;near(api.input(raw(x,f)).heading,initial);}
 // An intentional direction change still takes effect within the held gesture.
 near(api.input(raw(-f,x)).heading,-Math.atan2(-f,x));
 api.input(raw(0,0));view.yaw=1.2;near(api.input(raw(x,f)).heading,1.2-Math.atan2(x,f));
 c.state='hook';api.input(raw(x,f));c.state='normal';c.vel.x=-4;c.vel.z=0;
 near(api.input(raw(x,f)).heading,Math.PI/2);
 api.reset();view.yaw=-.7;near(api.input(raw(x,f)).heading,-.7-Math.atan2(x,f));
}
// A blocked stretch retains its camera across momentary clear edges. It may
// return only after distance, dwell and grounded-clearance conditions all pass.
const c={pos:{x:-6,y:0,z:0},vel:{x:6,y:0,z:0},state:'normal',onGround:true};
const blocked=(a,b)=>b.x>=0&&b.x<=10&&a.z>.5;
const cam=createHybridCamera({player:c,pose:{yaw:0,pitch:-.65},safe:()=>true,blocked});
const wanted={set(x,y,z){Object.assign(this,{x,y,z})}},pivot=()=>({...c.pos,y:1.3});
cam.resolve(pivot(),wanted,1/60);assert.equal(cam.state.section,'fixed');
for(let i=0;i<120;i++){c.pos.x+=.05;cam.resolve(pivot(),wanted,1/60);}
assert.equal(cam.state.section,'assist');const switches=cam.state.switches;
for(let i=0;i<90;i++){c.pos.x=i%2?10.05:9.95;cam.resolve(pivot(),wanted,1/60);}
assert.equal(cam.state.switches,switches,'no boundary ping-pong');
c.onGround=false;const yaw=cam.view.yaw;c.pos.x=11;
for(let i=0;i<40;i++)cam.resolve(pivot(),wanted,1/60);near(cam.view.yaw,yaw);
assert.equal(cam.state.section,'assist','no aerial return');
c.onGround=true;c.pos.x=16;
for(let i=0;i<240;i++)cam.resolve(pivot(),wanted,1/60);
assert.equal(cam.state.section,'fixed');
console.log('PASS hybrid camera: held keyboard/touch basis, intentional turns, neutral rebase, action exit, reset, boundary hysteresis and aerial lock');
})().catch(e=>{console.error(e);process.exitCode=1});
