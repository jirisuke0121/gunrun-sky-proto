const assert=require('node:assert/strict');
class Vec {
 constructor(x=0,y=0,z=0){this.set(x,y,z)}
 set(x,y,z){Object.assign(this,{x,y,z});return this} setScalar(s){return this.set(s,s,s)}
 copy(v){return this.set(v.x,v.y,v.z)} clone(){return new Vec(this.x,this.y,this.z)}
 add(v){return this.set(this.x+v.x,this.y+v.y,this.z+v.z)} multiplyScalar(s){return this.set(this.x*s,this.y*s,this.z*s)}
 normalize(){return this.multiplyScalar(1/(Math.hypot(this.x,this.y,this.z)||1))}
 lerp(v,t){return this.set(this.x+(v.x-this.x)*t,this.y+(v.y-this.y)*t,this.z+(v.z-this.z)*t)} project(){return this}
}
class Visual {
 constructor(geometry,material){Object.assign(this,{geometry,material:material||geometry||{},userData:{},position:new Vec,scale:new Vec,rotation:{x:0},quaternion:{copy(){},setFromUnitVectors(){}},color:{setHex(){}},layers:{disableAll(){}},attributes:{}})}
 add(){} remove(){} dispose(){} clone(){return new Visual}
 setAttribute(k,v){this.attributes[k]=v} setXYZ(){}
}
function element(){
 const listeners={},classes=new Set,attrs={};let capture;
 return {listeners,style:{setProperty(){}},classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),toggle(c,on){on?classes.add(c):classes.delete(c)},contains:c=>classes.has(c)},
 setAttribute(k,v){attrs[k]=v},getAttribute:k=>attrs[k],appendChild(){},addEventListener(k,fn){(listeners[k]??=[]).push(fn)},
 getBoundingClientRect:()=>({left:0,right:80,top:0,bottom:80}),setPointerCapture:id=>capture=id,hasPointerCapture:id=>capture===id,releasePointerCapture:()=>capture=undefined,
 getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){},clearRect(){},beginPath(){},lineTo(){},closePath(){},fill(){}})};
}
(async()=>{
 const {createFlashbang,FLASHBANG}=await import('../flashbang.js');
 const button=element(),count=element(),doc=element();
 global.window=element();global.matchMedia=()=>({matches:false});
 global.document=Object.assign(doc,{getElementById:id=>id==='tFlash'?button:id==='hFlash'?count:element(),createElement:element});
 class Enemy{} Enemy.prototype.update=function(){};Enemy.prototype.touching=function(){};Enemy.prototype.anim=function(){};
 let mode='play';
 const c={pos:new Vec,h:1.75,yaw:0,state:'normal'},game={c,z:{over:false},U:{},ri:Enemy,Jt:[],ue:new Visual,raycast:()=>null,Tt:{swish(){}},rn(){},Se:{quaternion:{}},Ut:{},modeRef:()=>mode,
 Geom:Object.fromEntries(['Group','Mesh','Sphere','Torus','Cylinder','Box','Basic','Sprite','SpriteMaterial','CanvasTexture','PointLight','Line','BufferGeometry','Float32Attribute'].map(k=>[k,Visual]))};
 game.Geom.Vector3=Vec;
 const flash=createFlashbang(game),emit=(node,type,extra={})=>{for(const f of node.listeners[type]||[])f({code:'Digit1',repeat:false,button:0,pointerId:1,clientX:40,clientY:40,detail:0,preventDefault(){},stopPropagation(){},...extra})};
 const refill=()=>{for(let i=0;i<3;i++){c.state='wallrun';flash.tick(0);c.state='normal';flash.tick(0)}};
 const tap=()=>{emit(button,'pointerdown');emit(button,'pointerup')};
 refill();assert.equal(flash.charges,2);tap();assert.equal(flash.stats.thrown,1);assert.equal(flash.charges,1);
 assert.equal(button.getAttribute('aria-disabled'),'true');assert.ok(button.classList.contains('cooling'));assert.ok(button.innerHTML.includes('0.8s'));
 for(let i=0;i<5;i++){tap();emit(doc,'keydown');emit(button,'click');assert.equal(flash.throw(),false)}
 assert.equal(flash.charges,1,'touch, keyboard, assistive click and direct calls all share the same guard');
 refill();assert.equal(flash.charges,2);assert.equal(flash.throw(),false,'earning a charge does not bypass cooldown');
 const remaining=flash.cooldown;mode='pause';flash.tick(100);assert.equal(flash.cooldown,remaining,'pause freezes cooldown');mode='play';
 flash.tick(FLASHBANG.cooldown-.01);assert.equal(flash.throw(),false);flash.tick(.01);
 assert.equal(flash.cooldown,0);assert.equal(button.getAttribute('aria-disabled'),'false');assert.equal(flash.throw(),true,'a fresh activation succeeds after the interval');
 flash.reset();assert.equal(flash.cooldown,0);assert.equal(flash.charges,1);assert.equal(flash.throw(),true,'restart is immediately usable');
 flash.reset();refill();emit(button,'pointerdown');emit(button,'pointermove',{clientX:200});emit(button,'pointerup');assert.equal(flash.charges,2,'dragging off still cancels');
 console.log('PASS 0.8s guard across touch/key/assistive/direct input, refill, pause, expiry, reset and drag cancellation');
})().catch(e=>{console.error(e);process.exitCode=1});
