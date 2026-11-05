// Authored ladders share the same travel-time scale as other route choices.
// Terrain is checked separately from temporary queues. Committed ladder
// climbers keep body-height spacing while waiting actors leave the approach clear.
export function createZombieLadders(game, runtime, climb, flashbang) {
  const config=Object.freeze({speed:1.1,stalkerSpeed:2.5,grab:.3,exit:.5,fieldScale:6,spacing:.15});
  const stats={checked:0,rejected:0,started:0,finished:0,interrupted:0,queued:0,blocked:0};
  const owned=new WeakMap(),waiting=new WeakMap(),starts=new WeakMap();
  let validated=new WeakMap(),terrainStamp='';
  const point=(x,y,z)=>({x,y,z}),copy=p=>point(p.x,p.y,p.z);
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
  const enabled=()=>!game.z.mission;
  const speed=e=>e.stalker?config.stalkerSpeed:config.speed;
  const stamp=()=>String(runtime.INDOOR_ACCESS?.revision||0)+'|'+(runtime.DOORS||[]).map(d=>d.b.off?'1':'0').join('');
  function revisionKey(){return 'ladder-1:'+stamp();}
  const live=e=>!e.dead&&!e.remove&&game.Jt.includes(e);
  const eligible=e=>enabled()&&runtime.mode==='play'&&!game.z.over&&live(e)&&!e.rise&&!e.fall&&!e.guard&&
    e.spawnT<=0&&!(e.stun>0)&&game.z.t-e.lastHitT>1&&!flashbang.blinded(e);
  function build(body,edge,origin) {
    const L=edge?.ladder,to=runtime.NAV.nodes[edge?.to];
    if(!L||!to||L.y1<=L.y0||Math.abs(to.y-L.y1)>.35)return null;
    const pad=Math.max(.4,body.r+.09),attach=point(L.x+L.nx*pad,Math.max(L.y0,origin.y),L.z+L.nz*pad);
    // A ladder can start beside a sloped tread. Preserve the actor's real
    // footing instead of pulling it down through that tread to authored y0.
    const maxAttach=attach.y+.45;
    for(const b of runtime.near(attach.x-body.r,attach.z-body.r,attach.x+body.r,attach.z+body.r))
      if(!b.off&&b.maxY<=maxAttach&&b.maxY>=attach.y-.05&&attach.x+body.r>b.minX&&attach.x-body.r<b.maxX&&attach.z+body.r>b.minZ&&attach.z-body.r<b.maxZ)
        attach.y=Math.max(attach.y,b.maxY+.003);
    if(attach.y>L.y1-.05)return null;
    const top=point(attach.x,L.y1+.003,attach.z),finish=point(to.x,to.y+.003,to.z);
    if(!climb.clearLine(body,finish,finish,true))return null;
    const approach=[];
    if(climb.clearLine(body,origin,attach))approach.push(attach);
    else {
      const raised=point(origin.x,attach.y,origin.z);
      if(!climb.clearLine(body,origin,raised)||!climb.clearLine(body,raised,attach))return null;
      approach.push(raised,attach);
    }
    const parts=[];let from=copy(origin),total=0;
    const approachLength=approach.reduce((sum,p,i)=>sum+distance(i?approach[i-1]:origin,p),0);
    for(const p of approach){const duration=approachLength>.001?config.grab*distance(from,p)/approachLength:config.grab;parts.push({from,to:p,duration});total+=duration;from=p;}
    if(!climb.clearLine(body,attach,top)||!climb.clearLine(body,top,finish))return null;
    const duration=(top.y-attach.y)/speed(body);
    parts.push({from:attach,to:top,duration},{from:top,to:finish,duration:config.exit});total+=duration+config.exit;
    return {L,parts,total,finish,attach};
  }
  function template(edge,stalker=false) {
    const key=stamp();if(key!==terrainStamp){terrainStamp=key;validated=new WeakMap();}
    let cache=validated.get(edge);if(!cache){cache=new Map();validated.set(edge,cache);}
    const variant=stalker?'stalker':'normal';if(cache.has(variant))return cache.get(variant);
    const from=runtime.NAV.nodes[edge.from],body={r:stalker?.42:.3,h:stalker?2.4:1.8,stalker};
    let origin=null;
    if(from){
      origin=point(from.x,from.y+.003,from.z);const maxFoot=from.y+.45;
      // NAV uses a thin probe. A full body can overlap the next tread and
      // stand higher than that probe; validate from the real supported pose.
      for(const b of runtime.near(from.x-body.r,from.z-body.r,from.x+body.r,from.z+body.r))
        if(!b.off&&b.maxY<=maxFoot&&b.maxY>=from.y-.05&&from.x+body.r>b.minX&&from.x-body.r<b.maxX&&from.z+body.r>b.minZ&&from.z-body.r<b.maxZ)
          origin.y=Math.max(origin.y,b.maxY+.003);
    }
    const result=origin?build(body,edge,origin):null;
    cache.set(variant,result);stats.checked++;if(!result)stats.rejected++;return result;
  }
  function edgeCost(edge,stalker=false) {
    if(!enabled()||edge?.kind!==5)return null;
    const route=template(edge,stalker);
    return route?route.total*config.fieldScale+(edge.jamT>game.ceRef()?80:0):Infinity;
  }
  function waitFor(enemy,edge) {
    const w=waiting.get(enemy),from=runtime.NAV.nodes[edge.from];
    return !!w&&w.edge===edge&&game.ceRef()-w.at<.4&&from&&Math.abs(enemy.pos.y-from.y)<.65&&Math.hypot(enemy.pos.x-from.x,enemy.pos.z-from.z)<1.5;
  }
  function queueDelay(enemy,edge) {
    if(!enabled()||edge?.kind!==5)return 0;
    const route=template(edge,!!enemy.stalker);if(!route)return 0;
    const from=runtime.NAV.nodes[edge.from],range=Math.hypot(enemy.pos.x-from.x,enemy.pos.z-from.z);
    if(range>7||Math.abs(enemy.pos.y-from.y)>.65)return 0;
    let delay=0;const line=queue(enemy,edge),rank=line.indexOf(enemy);
    const waitingAhead=line.slice(0,Math.max(0,rank)).reduce((sum,e)=>sum+(e.h+config.spacing)/speed(e),0);
    for(const other of game.Jt){
      if(other===enemy||!live(other))continue;
      if(other.act?.kind==='ladder'&&other.act.L===edge.ladder){
        delay=Math.max(delay,Math.max(0,other.h+config.spacing-(other.pos.y-route.attach.y))/speed(other));
        continue;
      }
      const atExit=Math.hypot(other.pos.x-route.finish.x,other.pos.z-route.finish.z)<other.r+enemy.r+.12&&Math.abs(other.pos.y-route.finish.y)<other.h;
      if(atExit)delay=Math.max(delay,other.stun>0?Math.min(12,other.stun):1.5);
      if(Math.abs(other.pos.y-from.y)>.65)continue;
      const atEntry=Math.hypot(other.pos.x-route.attach.x,other.pos.z-route.attach.z)<other.r+enemy.r+.12;
      if(atEntry&&other.stun>0)delay=Math.max(delay,Math.min(12,other.stun));
      if(atEntry&&!line.includes(other))delay=Math.max(delay,1.5);
    }
    return delay+waitingAhead;
  }
  function penetration(body,p,other) {
    return Math.max(0,body.r+other.r+.03-Math.hypot(p.x-other.pos.x,p.z-other.pos.z))*
      Math.max(0,Math.min(p.y+body.h,other.pos.y+other.h)-Math.max(p.y,other.pos.y));
  }
  function bodiesClear(enemy,from,to) {
    return game.Jt.every(other=>other===enemy||!live(other)||penetration(enemy,to,other)<=penetration(enemy,from,other)+1e-6);
  }
  function entranceClear(enemy,route) {
    // Followers can use the same ladder once there is room below the leader.
    for(const other of game.Jt)if(other!==enemy&&live(other)&&other.act?.kind==='ladder'&&other.act.L===route.L&&
      Math.abs(other.pos.y-route.attach.y)<enemy.h+config.spacing)return false;
    let from=enemy.pos;
    for(const part of route.parts.slice(0,-2)){
      // Test the entire approach against stationary bodies, not just its end.
      const steps=Math.max(1,Math.ceil(distance(from,part.to)/.1));
      for(let i=1;i<=steps;i++){
        const t=i/steps,p=point(from.x+(part.to.x-from.x)*t,from.y+(part.to.y-from.y)*t,from.z+(part.to.z-from.z)*t);
        if(!bodiesClear(enemy,enemy.pos,p))return false;
      }
      from=part.to;
    }
    return true;
  }
  function queue(enemy,edge) {
    const from=runtime.NAV.nodes[edge.from];
    return game.Jt.filter(e=>live(e)&&!e.act&&!(e.stun>0)&&Math.abs(e.pos.y-from.y)<.65&&
      Math.hypot(e.pos.x-from.x,e.pos.z-from.z)<7&&
      (e===enemy||waitFor(e,edge)||runtime.NAV.E[e.edge]?.ladder===edge.ladder));
  }
  function chooseExit(enemy,route) {
    const {L}=route,top=route.parts.at(-1).from,finish=route.finish;
    const candidates=[finish];
    for(const offset of [.8,-.8,1.6,-1.6])candidates.push(point(finish.x-L.nz*offset,finish.y,finish.z+L.nx*offset));
    candidates.push(point(finish.x-L.nx*.8,finish.y,finish.z-L.nz*.8));
    for(const p of candidates)if(climb.clearLine(enemy,top,p)&&climb.clearLine(enemy,p,p,true)&&
      game.Jt.every(other=>other===enemy||!live(other)||penetration(enemy,p,other)<1e-6)){
      return {...route,finish:p,parts:route.parts.map((part,i)=>i===route.parts.length-1?{...part,to:p}:part)};
    }
    return null;
  }
  function start(enemy,edge) {
    if(!eligible(enemy)||enemy.act||!enemy.onGround||edge?.kind!==5)return false;
    const from=runtime.NAV.nodes[edge.from];
    if(!from||Math.hypot(enemy.pos.x-from.x,enemy.pos.z-from.z)>1.3||Math.abs(enemy.pos.y-from.y)>.65)return false;
    const now=game.ceRef(),old=starts.get(enemy);
    let route;
    if(old&&old.edge===edge&&old.h===enemy.h&&old.key===stamp()&&distance(old.origin,enemy.pos)<.08)route=old.route;
    else {route=build(enemy,edge,enemy.pos);starts.set(enemy,{edge,h:enemy.h,key:stamp(),origin:copy(enemy.pos),route});}
    if(!route){waiting.delete(enemy);return false;}
    const exit=chooseExit(enemy,route);
    if(queue(enemy,edge)[0]!==enemy||!entranceClear(enemy,route)||!exit){
      const w=waiting.get(enemy);if(!w||w.edge!==edge)stats.queued++;
      waiting.set(enemy,{edge,at:now});return false;
    }
    route=exit;
    const parts=route.parts.map(p=>({...p,from:copy(p.from),to:copy(p.to)}));parts[0].from=copy(enemy.pos);
    if(!climb.clearLine(enemy,enemy.pos,parts[0].to))return false;
    const action={kind:'ladder',pursuitLadder:true,L:route.L,parts,index:0,elapsed:0,blocked:0,edge,node:runtime.nodeAt(route.finish.x,route.finish.y+.1,route.finish.z)};
    enemy.act=action;owned.set(enemy,action);waiting.delete(enemy);
    enemy.vel.set(0,0,0);enemy.onGround=false;enemy.atkT=0;stats.started++;return true;
  }
  function interrupt(enemy,action) {
    if(enemy.act===action){enemy.act=null;enemy.onGround=false;enemy.vel.set(0,0,0);enemy.edge=-1;enemy.navT=0;}
    owned.delete(enemy);stats.interrupted++;
  }
  function finish(enemy,action) {
    enemy.act=null;owned.delete(enemy);enemy.onGround=true;enemy.vel.set(0,0,0);enemy.node=action.node;enemy.edge=-1;enemy.navT=0;
    enemy.stuckT=enemy.guardT=enemy.sideT=0;stats.finished++;
  }
  function step(enemy,dt) {
    const action=owned.get(enemy);if(!action)return false;
    // hurt() replaces the action and assigns knockback before this update.
    if(enemy.act!==action){owned.delete(enemy);stats.interrupted++;return false;}
    if(!eligible(enemy)){interrupt(enemy,action);return false;}
    const part=action.parts[action.index],elapsed=Math.min(part.duration,action.elapsed+dt),t=part.duration>.00001?elapsed/part.duration:1;
    const next=point(part.from.x+(part.to.x-part.from.x)*t,part.from.y+(part.to.y-part.from.y)*t,part.from.z+(part.to.z-part.from.z)*t);
    if(!climb.clearLine(enemy,enemy.pos,next)){interrupt(enemy,action);return false;}
    if(!bodiesClear(enemy,enemy.pos,next)){
      // The feet may already be safely on the deck while another pursuer
      // occupies the nominal exit node. Resume the ordinary walking solver
      // from that real foothold instead of blocking the whole ladder chain.
      if(action.index===action.parts.length-1&&climb.clearLine(enemy,enemy.pos,part.to,true)){
        action.node=runtime.nodeAt(enemy.pos.x,enemy.pos.y+.1,enemy.pos.z);finish(enemy,action);return false;
      }
      action.blocked+=dt;stats.blocked++;enemy.vel.set(0,0,0);enemy.anim(dt);return true;
    }
    action.blocked=0;action.elapsed=elapsed;enemy.pos.set(next.x,next.y,next.z);enemy.vel.set(0,0,0);enemy.onGround=false;
    enemy.yaw=Math.atan2(action.L.nx,action.L.nz);
    if(game.c.state==='ladder'&&game.c.ladder===action.L&&enemy.touching(1.2))game.hurtPlayerFromZombie?.(enemy);
    enemy.anim(dt);
    if(elapsed>=part.duration){
      if(++action.index>=action.parts.length){
        if(!climb.clearLine(enemy,enemy.pos,enemy.pos,true)){interrupt(enemy,action);return false;}
        finish(enemy,action);
      }else action.elapsed=0;
    }
    return true;
  }
  return {config,stats,enabled,edgeCost,revisionKey,start,step,queueDelay,
    waypoint(enemy,edge){
      const route=template(edge,!!enemy.stalker);if(!route)return runtime.NAV.nodes[edge.from];
      const rank=queue(enemy,edge).indexOf(enemy);if(rank<=0)return route.attach;
      // Give the front actor an unobstructed approach. Waiting bodies occupy
      // separate real floor positions rather than forming a knot on the rung.
      const {L}=route,back=.9+rank*(enemy.r*2+.25);
      for(const side of [0,.8,-.8,1.6,-1.6]){
        const p=point(route.attach.x+L.nx*back-L.nz*side,enemy.pos.y,route.attach.z+L.nz*back+L.nx*side);
        if(climb.clearLine(enemy,enemy.pos,p,true))return p;
      }
      return enemy.pos;
    },
    state(enemy){const a=owned.get(enemy),w=waiting.get(enemy);return {climbing:!!a,phase:a?.index,blocked:a?.blocked||0,queued:!!w&&waitFor(enemy,w.edge)};}};
}
