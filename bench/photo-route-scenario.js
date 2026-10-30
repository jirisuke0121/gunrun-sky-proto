// Full-game, input-driven traversal. The review page disables recording/storage.
export async function run(w) {
  const g=w.__game,s=w.__skyInternals,c=g.P,dt=1/120,results=[];
  const pause=()=>new Promise(r=>setTimeout(r,0));let ticks=0,trail=[],teleports=0;
  const off=()=>{for(const k of Object.keys(g.keys))g.keys[k]=false;};
  const state=()=>({p:c.pos.toArray().map(n=>+n.toFixed(3)),v:c.vel.toArray().map(n=>+n.toFixed(3)),state:c.state,ground:c.onGround,life:c.life,t:+g.GAME.t.toFixed(3)});
  async function step(){const p=c.pos.clone();g.advance(dt);if(c.pos.distanceTo(p)>2)teleports++;if(++ticks%12===0)trail.push(state());if(ticks%120===0)await pause();if(g.GAME.over||c.life<3||teleports)throw Error('movement failed '+JSON.stringify(state()));}
  async function settle(n=12){off();for(let i=0;i<n;i++)await step();}
  function render(){g.cam(1/60);w.skyHumanView?.update(1/60);g.debug.renderer.clear();g.debug.renderer.render(s.ue,s.Se);}
  async function reset(at,yaw){off();Object.assign(g.S,g.DEF);w.skyFollowCamera?.setMode('before',false);g.startGame();g.zombies.forEach(z=>{s.ue.remove(z.m.root);if(z.pool)s.ue.remove(z.pool)});g.zombies.length=0;g.SCR.off=g.PACE.off=g.MARK.off=true;Object.assign(g.S,{sendLog:false,autoFire:false,aimAuto:false,stalkerOn:false,stalker2:false,dropShare:0});g.GAME.spawnT=g.GAME.surgeT=1e9;g.GAME.safeT=0;g.GAME.over=false;g.GAME.t=0;g.placeAt({x:at[0],y:at[1],z:at[2],yaw});c.life=3;c.invuln=-1;teleports=0;ticks=0;trail=[];await settle();}
  async function walk(points,maxSeconds=10){for(const p of points){let done=false;for(let i=0;i<maxSeconds*120;i++){const dx=p[0]-c.pos.x,dz=p[2]-c.pos.z;if(Math.hypot(dx,dz)<.18&&Math.abs(c.pos.y-p[1])<1&&c.onGround&&c.state==='normal'){done=true;break;}c.yaw=Math.atan2(-dx,-dz);g.keys.KeyW=true;await step();}off();if(!done)throw Error('walk target '+p+' '+JSON.stringify(state()));await settle(8);}}
  function press(code){for(const type of ['keydown','keyup'])w.dispatchEvent(new w.KeyboardEvent(type,{code,bubbles:true}));}
  function jump(touch){if(touch){const b=w.document.getElementById('tJump');for(const type of ['pointerdown','pointerup'])b.dispatchEvent(new w.PointerEvent(type,{pointerId:777,pointerType:'touch',bubbles:true,cancelable:true}));}else press('Space');}
  async function tower(touch){await reset([45,0,-13],-Math.PI/2);await walk([[45,0,-15.25]]);const anchor=g.HOOKS.find(a=>Math.abs(a[0]-60.9)<.01&&Math.abs(a[2]+15.25)<.01);if(!anchor)throw Error('new tower hook missing');
    c.yaw=Math.atan2(c.pos.x-anchor[0],c.pos.z-anchor[2]);c.pitch=Math.atan2(anchor[1]-c.pos.y-c.eye,Math.hypot(anchor[0]-c.pos.x,anchor[2]-c.pos.z));render();
    let queued;if(touch){const p=new s.Geom.Vector3(...anchor).project(s.Se);queued=g.hookTap((p.x+1)*w.innerWidth/2,(1-p.y)*w.innerHeight/2);}else{queued=g.hookTarget()===anchor;press('KeyQ');}
    if(!queued)throw Error('hook target unavailable '+JSON.stringify(state()));let hooked=false,landed=false;
    for(let i=0;i<720;i++){if(c.state==='hook')hooked=true;if(hooked&&c.state==='normal'&&!c.onGround){g.keys.KeyS=c.vel.x>.4;g.keys.KeyW=false;}await step();if(hooked&&c.onGround&&Math.abs(c.pos.y-3.6)<.12){landed=true;break;}}
    off();if(!landed)throw Error('hook landing failed '+JSON.stringify(state()));const landing=state();await walk([[60.7,3.6,-14.7],[60.7,4.4,-13],[60.7,3.6,-10],[60.7,3.6,-7]],8);render();return{id:'tower-corner',touch,hooked,landing,end:state(),teleports,trail};
  }
  async function north({touch=false,angle=.65,offset=0,drop=false}={}){await reset([12,0,-15.5],-Math.PI/2);await walk([[15.5+offset,0,-15.5]]);c.yaw=Math.PI;g.keys.KeyW=true;for(let i=0;i<120&&c.pos.z<-15.05;i++)await step();jump(touch);let grabbed=false,released=false,landed=false;
    for(let i=0;i<840;i++){const a=w.skySwing.active;if(a){grabbed=a.bar.id==='oldtown-north-east-bar';if(!grabbed)throw Error('unexpected bar '+a.bar.id);if(drop){off();g.keys.KeyS=true;}else if(!released&&a.angle>=angle&&a.omega>1.1){jump(touch);released=true;}}
      if(grabbed&&!a&&c.state==='normal'&&!c.onGround){if(drop){off();}else{g.keys.KeyW=false;g.keys.KeyS=c.vel.z>.4&&(-3.6-c.pos.z<c.vel.z*c.vel.z/28+.25);}}
      await step();if(grabbed&&c.onGround&&c.state==='normal'&&Math.abs(c.pos.y-(drop?-3.5:0))<.15){landed=true;break;}}
    off();if(!grabbed||!landed)throw Error('swing '+(drop?'drop':'landing')+' failed '+JSON.stringify(state()));const landing=state();
    if(drop)await walk([[17.3,-3.5,-12.2],[17.3,0,-18.15],[15.2,0,-18.15],[15.2,0,-15.5],[12,0,-15.5]],10);
    else await walk([[15.5,0,-3.7],[12,0,-3.7],[12,0,-9]],8);
    render();return{id:'north-east-corner',touch,angle,offset,drop,grabbed,released,landing,end:state(),teleports,trail};
  }
  for(const test of [()=>tower(false),()=>tower(true),()=>north(),()=>north({touch:true}),()=>north({angle:.55,offset:-.25}),()=>north({angle:.8,offset:.25}),()=>north({touch:true,drop:true})]){
    try{results.push({pass:true,...await test()});}catch(e){results.push({pass:false,error:e.message,end:state(),trail});render();return{pass:false,results};}await pause();
  }
  return{pass:true,settings:{sprintSpeed:g.S.sprintSpeed,jumpVel:g.S.jumpVel,gravity:g.S.gravity,hookSpeed:g.S.hookSpeed},results};
}
