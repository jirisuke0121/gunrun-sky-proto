// Renderer-independent layout checks. Uses the real map builders and swing
// controller; ordinary flight below is a bounded physics probe, not browser QA.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const path=require('node:path'),root=path.join(__dirname,'..');
function geometry(){
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const env={window:{},location:{search:''},URLSearchParams,addEventListener(){},console};
  vm.createContext(env);
  for(const name of ['old-town-swing.js','town-heights.js'])vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'),env);
  let build=html.slice(html.indexOf('ms(-70,-12,-22,18,0)'),html.indexOf('var fd={'));
  // This block only draws the original south handrails. It creates no solids.
  const visual=build.indexOf('{let n=new ze({color:3814962');
  const after=build.indexOf('pn(14,-1.5,20,1.5,0)',visual);
  assert.ok(visual>0&&after>visual,'find the known render-only block');
  build=build.slice(0,visual)+build.slice(after);
  const declarations=html.slice(html.indexOf('var pn=(n,t,e,i,s,r=1.4)'),html.indexOf('var Ja=[]'));
  const walls=html.slice(html.indexOf('function Ka(n,t,e,i,s,r,a,o=[]'),html.indexOf('ms(-70,-12,-22,18,0)'));
  vm.runInContext(`var jn=[],A_=[],Ja=[];function ne(n,t,e,i,s,r,a,o=true){const b={minX:Math.min(n,i),minY:Math.min(t,s),minZ:Math.min(e,r),maxX:Math.max(n,i),maxY:Math.max(t,s),maxZ:Math.max(e,r),type:a,solid:o};(o?jn:A_).push(b);return b;}\n${declarations}\n${walls}\n${build}`,env);
  return{solids:env.jn,hooks:env.us,ladders:env.mo,course:env.window.skyOldTownSwingCourse};
}
class Vec{
  constructor(x=0,y=0,z=0){this.set(x,y,z)}
  set(x,y,z){Object.assign(this,{x,y,z});return this} toArray(){return[this.x,this.y,this.z]}
  getComponent(k){return this.toArray()[k]} clone(){return new Vec(this.x,this.y,this.z)}
  sub(v){return this.set(this.x-v.x,this.y-v.y,this.z-v.z)} add(v){return this.set(this.x+v.x,this.y+v.y,this.z+v.z)}
  multiplyScalar(k){return this.set(this.x*k,this.y*k,this.z*k)} length(){return Math.hypot(...this.toArray())}
  normalize(){return this.multiplyScalar(1/this.length())}
}
class Visual{
  constructor(){this.userData={};this.position=new Vec;this.scale=new Vec;this.rotation={copy(){}};this.quaternion={setFromUnitVectors(){}};this.color=this.emissive={setHex(){}}}
  add(){} clone(){return new Visual}
}
(async()=>{
  const {createSwing}=await import('../parkour-swing.js');
  const map=geometry(),solids=map.solids.filter(b=>!b.off&&b.solid!==false);
  const free=(x,y,z,r=.32,h=1.75)=>!solids.some(b=>x+r>b.minX+1e-5&&x-r<b.maxX-1e-5&&z+r>b.minZ+1e-5&&z-r<b.maxZ-1e-5&&y+h>b.minY+1e-5&&y<b.maxY-1e-5);
  const floorAt=(x,z,y)=>Math.max(-Infinity,...solids.filter(b=>x>=b.minX-1e-5&&x<=b.maxX+1e-5&&z>=b.minZ-1e-5&&z<=b.maxZ+1e-5&&b.maxY<=y+.42).map(b=>b.maxY));
  const listeners={};global.addEventListener=(name,fn)=>(listeners[name]??=[]).push(fn);
  global.document={body:{dataset:{},appendChild(){}},head:{appendChild(){}},getElementById(){return null},querySelector(){return null},createElement(){return{style:{setProperty(){}},dataset:{},getContext(){return{fillRect(){},strokeRect(){},fillText(){}}}}}};
  global.window={skyTelemetryProbe:{jumpAccepted(){}}};
  function probe(id,{grip=true,angle=.65,offset=0,brake=true,speed=6}={}){
    const route=map.course.routes.find(r=>r.id===id),bar=map.course.bars.find(b=>b.route===id);
    const x=id==='south-corner'?-3.75:speed<4?-2.85:-.55,z=bar.at[2]+offset;
    const c={pos:new Vec(x,4.0001,z),vel:new Vec(-speed,7.2,0),r:.32,h:1.75,state:'normal',onGround:false};
    const game={stats:{},RL:{events:[]}},clock={t:0,over:false},U={gravity:20,jumpVel:7.2};
    const sky={c,U,z:clock,Geom:{Group:Visual,Standard:Visual,Cylinder:Visual,Mesh:Visual,Vector3:Vec,Box:Visual,Torus:Visual,Sprite:Visual,SpriteMaterial:Visual,CanvasTexture:Visual},ue:{add(){}},oe:free,modeRef:()=> 'play',Tt:{}};
    const swing=createSwing(sky,game,{...map.course,bars:grip?[bar]:[],supports:[],arrows:[]});
    let released=false,collision=null,land=null,maxY=c.pos.y;const dt=1/120;
    for(let i=0;i<900;i++){
      clock.t+=dt;
      if(swing.active&&!released&&swing.active.angle>=angle&&swing.active.omega>1.1){
        for(const fn of listeners.keydown||[])fn({code:'Space',repeat:false});
        for(const fn of listeners.keyup||[])fn({code:'Space'});
        released=true;
      }
      const previous=c.pos.toArray(),handled=swing.step(dt,{fwdIn:1});
      if(!handled){
        // Opposite input slows the flight when stopping distance reaches the ledge.
        if(released&&brake&&c.pos.x+15.8<c.vel.x*c.vel.x/28+.2)c.vel.x=Math.min(0,c.vel.x+14*dt);
        c.vel.y-=20*dt;c.pos.x+=c.vel.x*dt;c.pos.y+=c.vel.y*dt;c.pos.z+=c.vel.z*dt;
        if(c.vel.y<0){
          const top=floorAt(c.pos.x,c.pos.z,previous[1]);
          if(c.pos.y<=top&&previous[1]>=top){c.pos.y=top;c.onGround=true;land=c.pos.toArray();break;}
        }
      }
      maxY=Math.max(maxY,c.pos.y);
      if(!free(c.pos.x,c.pos.y+.03,c.pos.z)){collision={at:c.pos.toArray(),state:c.state};break;}
      if(c.pos.y<-22)break;
    }
    return{id,grip,angle,offset,speed,grabs:game.stats.barGrabs||0,released,land,collision,maxY};
  }
  const results=[];
  for(const id of ['south-corner','north-corner']){
    for(const speed of [2.5,6])for(const angle of [.55,.65,.8])for(const offset of [-.35,0,.35]){
      const r=probe(id,{angle,offset,speed});results.push(r);
      assert.equal(r.collision,null,JSON.stringify(r));assert.equal(r.grabs,1,JSON.stringify(r));
      assert.ok(r.land&&Math.abs(r.land[1]-4.2)<.01&&r.land[0]<-14,JSON.stringify(r));
    }
    const without=probe(id,{grip:false});results.push(without);
    assert.ok(!without.land||without.land[1]<4,'ordinary jump cannot replace the bar');
    const r=map.course.routes.find(r=>r.id===id);
    // Sample the intended landing-to-street route at 10cm intervals. Standing
    // clearance and <=42cm steps must both hold, including the corner turns.
    let y=r.exit[1];
    const points=[r.exit,...r.escape];
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],n=Math.ceil(Math.hypot(b[0]-a[0],b[2]-a[2])/.1);
      for(let j=1;j<=n;j++){
        const x=a[0]+(b[0]-a[0])*j/n,z=a[2]+(b[2]-a[2])*j/n,top=floorAt(x,z,y);
        assert.ok(Number.isFinite(top)&&Math.abs(top-y)<=.42,`${id}: unsupported return at ${x},${y},${z} => ${top}`);
        assert.ok(free(x,top+.43,z,.32,1.35),`${id}: blocked standing return at ${x},${top},${z}`);y=top;
      }
    }
  }
  // Original IDs/positions and ladder shafts are independent of the additions.
  assert.deepEqual(Array.from(map.course.bars.slice(2,5),b=>Array.from(b.at)),[[24,8.4,1.5],[32,8.4,1.5],[39.5,9.2,1.5]]);
  for(const ladder of map.ladders.filter(l=>l.x===-14&&l.z===-5.5))
    for(let y=0;y<7.5;y+=.25)assert.ok(free(-14.55,y+.03,-5.5,.25,1.75),'west roof ladder clearance');
  for(let y=0;y<7.5;y+=.1)assert.ok(free(0,y+.03,-14.54,.32,1.75),'north roof ladder clearance');
  console.log(JSON.stringify({checks:'36 swing trajectories, including slow takeoffs, no-grip comparison, sampled standing returns, existing bars/ladder',results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
