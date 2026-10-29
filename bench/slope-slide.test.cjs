const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function extract(source, name) {
  const at = source.indexOf(`function ${name}(`, 1600000);
  assert.ok(at >= 0, name);
  let i = source.indexOf('{', at), depth = 1, quote = '';
  for (++i; depth; i++) {
    const c = source[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; }
    else if ('"\'`'.includes(c)) quote = c;
    else if (c === '{') depth++;
    else if (c === '}') depth--;
  }
  return source.slice(at, i);
}
(async () => {
  const {slopeAt, downhillVelocity, createSlopeSlide} = await import('../slope-slide.js');
  const slope = {grade:.4,dx:-1,dz:0};
  const floor = {minX:-30,maxX:1,minZ:-2,maxZ:2,minY:-1,maxY:8,slideSlope:slope};
  const player = {pos:{x:0,y:8.0001,z:0},r:.32,onGround:true};
  assert.equal(slopeAt(player,[floor]),slope);
  assert.equal(slopeAt({...player,onGround:false},[floor]),null);
  assert.equal(slopeAt(player,[floor,{...floor,maxY:8.01,slideSlope:null}]),null,'ordinary surface above the slope blocks activation');
  assert.equal(slopeAt({...player,pos:{x:0,y:10,z:0}},[floor]),null,'a slope below the player is not contact');
  let v={x:-4.2,z:0};
  for(let i=0;i<360;i++)v=downhillVelocity(v.x,v.z,slope,24,1/120,1,0,1);
  assert.ok(v.x<0&&Math.hypot(v.x,v.z)<=15.00001,'even reversed input cannot accelerate uphill or exceed cap');
  for (const file of ['index.html','canyon.html']) {
    const source=fs.readFileSync(file,'utf8');
    const jn=[],Ja=[];
    const c={...player,pos:{x:0,y:8.0001,z:0},vel:{x:0,y:0,z:0},yaw:Math.PI/2,h:1.75,state:'normal',slideCD:0,slideT:0,slideBuf:0,crouchPressed:true,jumpBuf:0,coyote:0,catchCD:0,lastGround:{copy(){}},airT:0};
    const U={gravity:24,slideBoost:9,slideFriction:4,coyote:.1,mantleReach:2.2,sprintSpeed:6,walkSpeed:4,groundAccel:30,groundBrake:20,airAccel:4,momentumDecay:2,autoSprint:true,jumpVel:12};
    const ctx={window:{},jn,Ja,c,U,ft:{slides:0,topSpeed:0,jumps:0},Tt:{slide(){},step(){},jump(){}},ke:.32,sn:1.75,Je:.9,ei:.0001,ie:'play',z:{over:false,t:0},Oe:{},Ot:{on:false},ge:(x,a,b)=>Math.max(a,Math.min(b,x)),Mt:(a,b,t)=>a+(b-a)*t,md:()=>({fwdIn:0,strIn:0,tmag:0}),zn:()=>jn,jc:()=>null,H_:()=>false,Y_:()=>false,J_:()=>false,ah:()=>false,z_:()=>{},U_:()=>{},D_:()=>{},ja:()=>true};
    ctx.window.skyTelemetryProbe={jumpAccepted(){}};
    vm.createContext(ctx);
    for(const name of ['ne','hd','Vc','oe','Dn','F_','k_','gd','N_','O_'])vm.runInContext(extract(source,name),ctx);
    ctx.window.__skyTryRegisteredWallJump=()=>false;
    vm.runInContext('hd("x",-20,0,-2,2,0,8,.3)',ctx);
    c.pos.x=-.5;c.pos.y=7.9001;
    const button={hidden:true,disabled:true,classList:{toggle(){}},setAttribute(){}};
    global.window=ctx.window;
    const api=createSlopeSlide({c,U,jn,z:ctx.z,modeRef:()=>ctx.ie,startSlide:ctx.F_},button);
    ctx.window.skySlopeSlide=api;
    api.frame();assert.equal(button.disabled,false);
    const start=c.pos.y;
    ctx.gd(1/120);assert.equal(c.state,'slide');
    let longest=0;
    for(let i=0;i<300;i++) {ctx.gd(1/120);if(c.state==='slide')longest++;}
    assert.ok(longest>144,`${file}: slope slide continues beyond old 1.2 second cutoff (${longest})`);
    assert.ok(c.pos.y<start-5,`${file}: descends actual collision steps (${c.pos.y})`);
    assert.ok(c.pos.x<-15,`${file}: travels down slope`);
    assert.ok(Math.hypot(c.vel.x,c.vel.z)>6,`${file}: gravity preserves speed`);
    c.pos={x:-5,y:6.1001,z:0};c.state='normal';c.onGround=true;c.slideCD=0;c.crouchPressed=true;c.vel={x:0,y:0,z:0};
    ctx.gd(1/120);c.jumpBuf=.1;ctx.gd(1/120);
    assert.equal(c.state,'normal');assert.equal(c.onGround,false);assert.ok(c.vel.y>0,'jump exits slide');
    api.frame();assert.equal(button.disabled,true);
    c.pos={x:-.5,y:7.9001,z:0};c.onGround=true;c.state='normal';c.slideCD=0;c.crouchPressed=false;c.jumpBuf=0;c.vel={x:0,y:0,z:0};
    ctx.gd(1/120);assert.equal(c.state,'normal','no automatic downhill slide without input');
    c.state='normal';c.onGround=true;ctx.ie='pause';api.frame();assert.equal(button.hidden,true);assert.equal(button.disabled,true);
    if (file === 'canyon.html') {
      // Exercise the shipped practice geometry, including all neighbouring tools.
      jn.length=0;Ja.length=0;
      ctx.location={search:'?practice=1'};ctx.URLSearchParams=URLSearchParams;
      ctx.window.buildSwingCourse=()=>{};
      vm.runInContext(fs.readFileSync('practice-world.js','utf8'),ctx);
      ctx.window.buildSkyCanyon({ne:ctx.ne,hd:ctx.hd,Mh(){},ld(){},us:[],jn});
      const section=ctx.window.skyPracticeCourse.sections.find(s=>s.id==='downhill');
      c.pos={x:section.at[0],y:section.at[1]+.0001,z:section.at[2]};c.vel={x:0,y:0,z:0};
      c.state='normal';c.onGround=true;c.slideCD=0;c.crouchPressed=true;c.jumpBuf=0;ctx.ie='play';
      assert.ok(api.canStart(),'practice selector places the player on an activatable slope');
      for(let i=0;i<420;i++)ctx.gd(1/120);
      assert.ok(c.pos.x<14 && c.pos.y<.2,'practice slide reaches the ground through actual neighbouring geometry');
      assert.ok(c.pos.y>=section.floor-.8,'successful descent does not trigger practice fall retry');
      assert.ok(!jn.some(b=>b.slideSlope && b.minX < -16 && b.maxX > -18 && b.minZ < 18 && b.maxZ > 16),'blast jump remains clear');
    }
    console.log('PASS',file,'real movement + collision: downhill >1.2s, descent, acceleration, jump exit, input-only activation, pause button');
  }
})().catch(e=>{console.error(e);process.exitCode=1});
