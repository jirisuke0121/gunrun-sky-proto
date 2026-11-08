const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
const {createStableCamera}=await import('../stable-camera.js');
const source=fs.readFileSync('fixed-camera-trial.js','utf8').replace(/^import .*;\n/gm,'');
const near=(a,b)=>assert.ok(Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)))<1e-8,`${a} != ${b}`);
for(const touch of[false,true]){
 const view={yaw:0,pitch:-.65},c={yaw:0,pos:{x:0,y:0,z:0},vel:{x:0,y:0,z:0},state:'normal',onGround:true};
 const inputState={on:touch,id:touch?1:null},doc={body:{dataset:{}},documentElement:{dataset:{}},head:{append(){}},createElement:()=>({}),addEventListener(){}};
 const window={__skyInternals:{c,inputState},skyFollowCamera:{mode:'after'},addEventListener(){}};let held;
 vm.runInNewContext(source,{window,document:doc,location:{search:'?cameraTrial=hybrid'},URLSearchParams,Math,
   createStableCamera:()=>({view,setMoving(v){held=v},reset(){view.yaw=0},get state(){return{}}}),createCameraCutaway:()=>({disable(){}})});
 const api=window.skyFixedCamera,raw=(x,f)=>({strIn:x,fwdIn:f});
 // Every stick direction uses the visible view, including the first input
 // interrupting an idle turn and the first input after releasing the thumb.
 for(const yaw of[0,.6,1.2,Math.PI,-2]){
   view.yaw=yaw;
   for(const [x,f]of[[1,0],[0,1],[-1,0],[0,-1],[.6,.8]]){
     near(api.input(raw(x,f)).heading,yaw-Math.atan2(x,f));assert.equal(held,true);
     api.input(raw(0,0));assert.equal(held,false);
     near(api.input(raw(x,f)).heading,yaw-Math.atan2(x,f));
   }
 }
 c.state='hook';api.input(raw(1,0));c.state='normal';c.vel.x=-4;
 near(api.input(raw(1,0)).heading,view.yaw-Math.PI/2);
}
const c={pos:{x:0,y:0,z:0},vel:{x:6,y:0,z:0},state:'normal',onGround:true};
let biting=false;
const cam=createStableCamera({player:c,pose:{yaw:0,pitch:-.65},safe:()=>true,blocked:a=>a.z>.1,canTurn:()=>!biting});
const wanted={set(x,y,z){Object.assign(this,{x,y,z})}},tick=n=>{for(let i=0;i<n;i++)cam.resolve(null,wanted,1/60)};
cam.setMoving(true);tick(120);near(cam.view.yaw,0);
// Neutral input while braking is still movement. Repeated short pauses must
// not become repeated camera switches at a narrow doorway.
cam.setMoving(false);tick(60);near(cam.view.yaw,0);
c.vel.x=0;
for(let i=0;i<12;i++){cam.setMoving(false);tick(12);cam.setMoving(true);tick(1)}
near(cam.view.yaw,0);assert.equal(cam.state.switches,0);
cam.setMoving(false);tick(60);assert.ok(cam.view.yaw!==0,'turn only after sustained rest');
const yaw=cam.view.yaw;cam.setMoving(true);tick(20);near(cam.view.yaw,yaw);
cam.setMoving(false);c.onGround=false;tick(120);near(cam.view.yaw,yaw);
c.onGround=true;c.state='ladder';tick(120);near(cam.view.yaw,yaw);
c.state='normal';biting=true;tick(120);near(cam.view.yaw,yaw);biting=false;
tick(240);assert.equal(cam.state.switches,2);assert.equal(cam.state.turning,false);
near(cam.view.yaw,yaw+Math.PI/2);
tick(240);assert.equal(cam.state.switches,2,'clear idle view stays put');
cam.reset();near(cam.view.yaw,0);
console.log('PASS stable camera: screen-relative keyboard/touch input, no neutral rebase, braking, repeated short pauses, idle turn interruption, aerial/native lock');
})().catch(e=>{console.error(e);process.exitCode=1});
