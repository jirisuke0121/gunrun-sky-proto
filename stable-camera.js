// Movement and camera share the displayed screen axes. Never rotate those
// axes under an active thumb/key, during braking, or through a parkour action.
export function createStableCamera({player:c,pose,safe,blocked,canTurn=()=>true}) {
  const angle=n=>Math.atan2(Math.sin(n),Math.cos(n));
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const view={...pose};
  let held=false,idle=0,elapsed=0,lastTurn=-3,nextScan=0,targetYaw=pose.yaw,distance=8,last=null,switches=0;
  const point=(yaw,pitch,d)=>({x:c.pos.x+Math.sin(yaw)*Math.cos(pitch)*d,
    y:c.pos.y+1.3-Math.sin(pitch)*d,z:c.pos.z+Math.cos(yaw)*Math.cos(pitch)*d});
  const clear=q=>!blocked(q,{x:c.pos.x,y:c.pos.y+.1,z:c.pos.z})&&
    !blocked(q,{x:c.pos.x,y:c.pos.y+1.5,z:c.pos.z});
  function endpoint(yaw,reveal=false) {
    let best=null;
    for(const pitch of[pose.pitch,-.85,-.45,-1.05,-.22])for(const d of[8,6,4.5,3,10,12,16]){
      const q=point(yaw,pitch,d);if(!safe(q)||reveal&&!clear(q))continue;
      const cost=Math.abs(d-8)+Math.abs(pitch-pose.pitch)*8;
      if(!best||cost<best.cost)best={q,pitch,distance:d,cost};
    }
    return best;
  }
  function reset(){Object.assign(view,pose);held=false;idle=elapsed=switches=nextScan=0;lastTurn=-3;targetYaw=pose.yaw;distance=8;last=null;}
  function resolve(_pivot,wanted,dt){
    const step=clamp(dt,0,.05),cold=!last||Math.hypot(c.pos.x-last.x,c.pos.y-last.y,c.pos.z-last.z)>3;
    elapsed+=step;
    const resting=!held&&canTurn()&&c.onGround&&['normal','slide'].includes(c.state)&&Math.hypot(c.vel.x,c.vel.z)<.15;
    if(!resting){idle=0;targetYaw=view.yaw;}else idle+=step;
    // Short releases/reversals do not start a turn. A new input interrupts an
    // idle turn immediately at the angle already visible to the player.
    if(resting&&idle>=.55&&elapsed>=nextScan&&elapsed-lastTurn>=2.5&&Math.abs(angle(targetYaw-view.yaw))<.015){
      nextScan=elapsed+.25;
      const current=endpoint(view.yaw);
      if(current&&!clear(current.q)){
        let best=null;
        for(const offset of[0,Math.PI/4,-Math.PI/4,Math.PI/2,-Math.PI/2,Math.PI]){
          const yaw=angle(view.yaw+offset),candidate=endpoint(yaw,true);
          if(candidate){
            const cost=candidate.cost+Math.abs(offset)*2;
            if(!best||cost<best.cost)best={yaw,cost};
          }
        }
        if(best&&Math.abs(angle(best.yaw-view.yaw))>.1){targetYaw=best.yaw;lastTurn=elapsed;switches++;}
      }
    }
    const nextYaw=angle(view.yaw+clamp(angle(targetYaw-view.yaw),-.9*step,.9*step));
    let goal=(resting&&idle>=.55?endpoint(nextYaw,true):null)||endpoint(nextYaw);
    // If even a camera endpoint is obstructed, keep the current visible angle.
    if(!goal){targetYaw=view.yaw;goal=endpoint(view.yaw);}
    else view.yaw=nextYaw;
    let q;
    if(goal){
      let pitch=cold?goal.pitch:view.pitch+clamp(goal.pitch-view.pitch,-.8*step,.8*step);
      let d=cold?goal.distance:distance+clamp(goal.distance-distance,-8*step,4*step);
      q=point(view.yaw,pitch,d);
      if(!safe(q)){pitch=goal.pitch;d=goal.distance;q=goal.q;}
      view.pitch=pitch;distance=d;
    }else q=point(view.yaw,view.pitch,distance);
    wanted.set(q.x,q.y,q.z);last={...c.pos};
    return {clear:clear(q),section:'stable',switches,cuts:0,distance,yaw:view.yaw,pitch:view.pitch};
  }
  return {view,resolve,reset,setMoving(value){held=value},get state(){return{section:'stable',switches,cuts:0,distance,idle,turning:Math.abs(angle(targetYaw-view.yaw))>.015}}};
}
