// Position-following cameras with a latched direction for each obstructed stretch.
// Input uses a separate gesture basis; changing this view never steers the player.
export function createHybridCamera({ player: c, pose, safe, blocked, regionCamera }) {
  const angle = n => Math.atan2(Math.sin(n), Math.cos(n));
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const view = { yaw: pose.yaw, pitch: pose.pitch };
  let distance = 8, section = 'fixed', sectionYaw = pose.yaw;
  let elapsed = 0, entered = 0, clearTime = 0, badTime = 0, nextScan = 0;
  let last = null, lastBlocked = null, target = null, switches = 0, cuts = 0, region=null;
  const airborne = () => !c.onGround || !['normal', 'slide'].includes(c.state);
  const point = (at, yaw, pitch, d) => ({
    x: at.x + Math.sin(yaw) * Math.cos(pitch) * d,
    y: at.y + 1.3 - Math.sin(pitch) * d,
    z: at.z + Math.cos(yaw) * Math.cos(pitch) * d,
  });
  function usable(q, at) {
    return safe(q) && !blocked(q, { x: at.x, y: at.y + .12, z: at.z }) &&
      !blocked(q, { x: at.x, y: at.y + 1.5, z: at.z });
  }
  function candidate(at, yaw, fixed = false) {
    let best = null;
    const offsets=fixed?[0]:[0,-.5,.5,-1,1,-1.5,1.5,-2,2];
    const shifted=(at,pitch,d,offset)=>{const q=point(at,yaw,pitch,d);
      q.x+=Math.cos(yaw)*offset;q.z-=Math.sin(yaw)*offset;return q;};
    for (const pitch of fixed ? [pose.pitch] : [pose.pitch, -.4, -.22]) {
      for (const d of [8, 6, 4.5, 3]) {
        const speed=Math.hypot(c.vel.x,c.vel.z);
        const continuity=offset=>{
          let score=0;
          if(!fixed&&at===c.pos&&speed>1)for(const lead of[1.5,3.5]){
            const next={x:at.x+c.vel.x/speed*lead,y:at.y,z:at.z+c.vel.z/speed*lead};
            if(safe({x:next.x,y:next.y+.5,z:next.z}))score+=usable(shifted(next,pitch,d,offset),next)?2:-6;
          }
          return score;
        };
        const available=offsets.filter(offset=>usable(shifted(at,pitch,d,offset),at));
        const offset=available.reduce((best,o)=>{
          if(best===undefined)return o;
          const previous=last&&at===c.pos?{x:last.camera.x+at.x-last.x,y:last.camera.y+at.y-last.y,z:last.camera.z+at.z-last.z}:null;
          const cost=o=>{const q=shifted(at,pitch,d,o);return (previous?Math.hypot(q.x-previous.x,q.y-previous.y,q.z-previous.z)*.2:0)+Math.abs(o)*.1-continuity(o);};
          return cost(o)<cost(best)?o:best;
        },undefined);
        if(offset===undefined)continue;
        const q=shifted(at,pitch,d,offset);
        let ground = 0;
        for (const [x,z] of [[.7,0],[-.7,0],[0,.7],[0,-.7]]) {
          const foot = { x: at.x+x, y: at.y+.12, z: at.z+z };
          // Do not penalise a view for failing to see through a neighbouring wall.
          if (safe({ ...foot, y: foot.y+.4 }) && !blocked(q,foot)) ground++;
        }
        const score = d + ground*.45 - Math.abs(pitch-pose.pitch)*2-Math.abs(offset)*.5;
        const total=score+continuity(offset);
        if (!best || total > best.score) best = {
          axisYaw:yaw,yaw:Math.atan2(q.x-at.x,q.z-at.z),pitch:-Math.atan2(q.y-at.y-1.3,Math.hypot(q.x-at.x,q.z-at.z)),
          distance:Math.hypot(d,offset),score:total,q };
      }
    }
    return best;
  }
  function choose(at) {
    const options = [sectionYaw, pose.yaw, pose.yaw+Math.PI/2, pose.yaw-Math.PI/2,
      pose.yaw+Math.PI, pose.yaw+Math.PI/4, pose.yaw-Math.PI/4,
      pose.yaw+3*Math.PI/4, pose.yaw-3*Math.PI/4];
    let best = null;
    for (const yaw of new Set(options.map(angle))) {
      const q = candidate(at,yaw);
      if (!q) continue;
      q.score -= Math.abs(angle(yaw-view.yaw))*.7;
      if (!best || q.score > best.score) best=q;
    }
    return best;
  }
  function reset() {
    Object.assign(view,pose); distance=8; section='fixed'; sectionYaw=pose.yaw;
    elapsed=entered=clearTime=badTime=nextScan=switches=cuts=0;
    last=lastBlocked=target=region=null;
  }
  function resolve(pivot,wanted,dt) {
    const previousYaw=view.yaw;
    const step=clamp(dt,0,.05), cold=!last||Math.hypot(c.pos.x-last.x,c.pos.y-last.y,c.pos.z-last.z)>3;
    elapsed+=step;
    const hint=regionCamera?.(usable);
    if(hint){
      if(region!==hint.id){switches++;entered=elapsed;}
      region=hint.id;section='assist';sectionYaw=hint.axisYaw;
      const q=hint.q,dx=q.x-c.pos.x,dz=q.z-c.pos.z,dy=q.y-c.pos.y-1.3;
      target={q,axisYaw:hint.axisYaw,yaw:Math.atan2(dx,dz),pitch:-Math.atan2(dy,Math.hypot(dx,dz)),distance:Math.hypot(dx,dy,dz)};
      lastBlocked={...c.pos};clearTime=0;
    }
    if (!hint&&(cold || elapsed>=nextScan)) {
      nextScan=elapsed+.12;
      const base=candidate(c.pos,pose.yaw,true);
      const speed=Math.hypot(c.vel.x,c.vel.z);
      // Look a little ahead while grounded so the orbit starts before the wall
      // hides the player. Do not predict across a jump or a different floor.
      const ahead={x:c.pos.x+c.vel.x/(speed||1)*2,y:c.pos.y,z:c.pos.z+c.vel.z/(speed||1)*2};
      const future=speed>1&&!airborne()&&safe({x:ahead.x,y:ahead.y+.5,z:ahead.z}) ? candidate(ahead,pose.yaw,true) : base;
      const obstructed=!base||!future;
      if(obstructed){lastBlocked={...c.pos};clearTime=0;}else clearTime+=.12;
      if(section==='fixed' && obstructed && (cold||!airborne())) {
        const alternate=choose(c.pos);
        if(alternate){section='assist';sectionYaw=alternate.axisYaw;entered=elapsed;target=alternate;switches++;}
      }
      if(section==='assist') {
        const current=candidate(c.pos,sectionYaw);
        badTime=current?0:badTime+.12;
        if(current)target=current;
        // Brief edges retain the section. Re-orient only after a genuinely
        // blocked stretch, and never during a jump, swing, ladder or landing.
        else if((cold||badTime>=.36)&&!airborne()) {
          const alternate=choose(c.pos);
          if(alternate && Math.abs(angle(alternate.axisYaw-sectionYaw))>.1){sectionYaw=alternate.axisYaw;target=alternate;entered=elapsed;switches++;badTime=0;}
        }
        const away=lastBlocked?Math.hypot(c.pos.x-lastBlocked.x,c.pos.z-lastBlocked.z):Infinity;
        if(base&&base.distance>=6&&clearTime>=1.2&&elapsed-entered>=2.5&&away>=5&&!airborne()){
          section='fixed';sectionYaw=pose.yaw;target=base;switches++;
        }
      }else target=base||target;
      if(cold)target=(section==='assist'?candidate(c.pos,sectionYaw):base)||choose(c.pos)||target;
    }
    let nextYaw=view.yaw,nextPitch=view.pitch,nextDistance=distance;
    if(target){
      // Direction remains fixed through aerial actions; distance/pitch may
      // still protect the camera from scenery as the player rises.
      nextYaw=cold?target.yaw:airborne()?view.yaw:angle(view.yaw+clamp(angle(target.yaw-view.yaw),-1.4*step,1.4*step));
      nextPitch=cold?target.pitch:view.pitch+clamp(target.pitch-view.pitch,-.7*step,.7*step);
      nextDistance=cold?target.distance:distance+clamp(target.distance-distance,-8*step,3*step);
    }
    let q=point(c.pos,nextYaw,nextPitch,nextDistance);
    // Shorten the orbit when a wall would intersect the interpolation. The
    // swept test checks the camera volume, not just its final point.
    const swept=to=>{if(!last)return true;const from=last.camera,
      n=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.y-from.y,to.z-from.z)/.1));
      for(let i=1;i<=n;i++)if(!safe({x:from.x+(to.x-from.x)*i/n,y:from.y+(to.y-from.y)*i/n,z:from.z+(to.z-from.z)*i/n}))return false;
      return true;};
    let clear=usable(q,c.pos)&&(cold||swept(q));
    if(!clear)for(const d of[6,4.5,3]){
      if(d>nextDistance)continue;const near=point(c.pos,nextYaw,nextPitch,d);
      if(usable(near,c.pos)&&(cold||swept(near))){q=near;nextDistance=d;clear=true;break;}
    }
    if(!clear&&last&&Math.hypot(last.camera.x-pivot.x,last.camera.y-pivot.y,last.camera.z-pivot.z)>=3&&usable(last.camera,c.pos)){
      // At a doorway, let the player pass the frame edge before moving the
      // camera. Keeping a still, clear camera avoids alternating sides when
      // the player nudges back and forth across the same boundary.
      q={...last.camera};clear=true;
      nextDistance=Math.hypot(q.x-pivot.x,q.y-pivot.y,q.z-pivot.z);
    }
    if(!clear){
      // Scans choose the section at a modest cadence, but clearance reacts on
      // every rendered frame. A narrow ceiling must not hide the feet while
      // waiting for the next section scan.
      let recover=hint?target:candidate(c.pos,section==='assist'?sectionYaw:nextYaw);
      if(recover&&!airborne()&&elapsed-entered>=2.5&&(recover.distance<4.5||Math.abs(angle(recover.yaw-view.yaw))>.5)){
        const alternate=choose(c.pos);
        if(alternate&&alternate.score>recover.score+2&&Math.abs(angle(alternate.axisYaw-sectionYaw))>.1){
          section='assist';sectionYaw=alternate.axisYaw;entered=elapsed;target=alternate;switches++;recover=alternate;
        }
      }
      if(recover){
        q=recover.q;nextYaw=recover.yaw;nextPitch=recover.pitch;nextDistance=recover.distance;
        clear=true;if(!cold&&!swept(q))cuts++;
      }else if(!airborne()){
        const alternate=choose(c.pos);
        if(alternate){
          if(section!=='assist'||Math.abs(angle(alternate.axisYaw-sectionYaw))>.1)switches++;
          section='assist';sectionYaw=alternate.axisYaw;entered=elapsed;target=alternate;
          nextYaw=alternate.yaw;nextPitch=alternate.pitch;nextDistance=alternate.distance;q=alternate.q;
          clear=true;if(!cold)cuts++;
        }
      }
    }
    if(!clear&&target&&usable(point(c.pos,target.yaw,target.pitch,target.distance),c.pos)){
      // An already occluded starting view can be separated by a solid wall.
      // Cut to the clear view rather than drawing an interpolation through it.
      // Once inside a section this does not repeat at each obstruction edge.
      if(cold||!airborne()){
        nextYaw=target.yaw;nextPitch=target.pitch;nextDistance=target.distance;
        q=point(c.pos,nextYaw,nextPitch,nextDistance);clear=true;if(!cold)cuts++;
      }
    }
    if(!safe(q)&&last&&safe(last.camera))q={...last.camera};
    view.yaw=angle(nextYaw);view.pitch=nextPitch;distance=nextDistance;
    // A held world-space camera point needs a matching look angle.
    const dx=q.x-pivot.x,dy=q.y-pivot.y,dz=q.z-pivot.z;
    if(cold||!airborne())view.yaw=Math.atan2(dx,dz);
    else view.yaw=previousYaw;
    view.pitch=-Math.atan2(dy,Math.hypot(dx,dz));
    wanted.set(q.x,q.y,q.z);last={...c.pos,camera:{...q}};
    return { clear, section, switches, cuts, distance, yaw:view.yaw, pitch:view.pitch };
  }
  return {view,resolve,reset,get state(){return{section,switches,cuts,distance,sectionYaw,inputYaw:view.yaw}}};
}
