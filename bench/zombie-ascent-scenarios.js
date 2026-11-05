(() => {
  const g=__game,s=__skyInternals,c=g.P,f=window.ascentFixture,dt=1/60;
  let seed=20261107;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  g.startGame();for(const e of g.zombies)s.ue.remove(e.m.root);g.zombies.length=0;
  for(const k of Object.keys(g.keys))g.keys[k]=false;
  g.GAME.spawnT=g.GAME.surgeT=1e9;g.SCR.off=g.PACE.off=g.MARK.off=true;g.STALK.spawned=true;
  Object.assign(g.S,{sendLog:false,autoFire:false,aimAuto:false,stalkerOn:false});
  const L=g.LADDERS[f.ladder],point=(x,y,z)=>({x,y:y+.003,z});
  const free=p=>g.freeAt(p.x,p.y+.012,p.z,.3,1.8)&&g.near(p.x,p.z,p.x,p.z).some(b=>!b.off&&Math.abs(b.maxY-p.y)<.05&&p.x>=b.minX-.29&&p.x<=b.maxX+.29&&p.z>=b.minZ-.29&&p.z<=b.maxZ+.29);
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),arr=p=>[p.x,p.y,p.z];
  const top=point(L.x-L.nx*1.2,L.y1,L.z-L.nz*1.2),bottom=point(L.x+L.nx*1.2,L.y0,L.z+L.nz*1.2);
  const nodes=g.NAV.nodes.map(n=>point(n.x,n.y,n.z));
  let goal=free(top)?top:nodes.filter(p=>Math.abs(p.y-top.y)<.1&&distance(p,top)<3&&free(p)).sort((a,b)=>distance(a,top)-distance(b,top))[0];
  if(!goal)return {...f,skipped:'no supported upper target',ladderData:{x:L.x,z:L.z,y0:L.y0,y1:L.y1,nx:L.nx,nz:L.nz}};
  let blockerPoint=null;
  if(f.mode==='entry'){
    blockerPoint=point(L.x+L.nx*.4,L.y0,L.z+L.nz*.4);
    if(!free(blockerPoint))blockerPoint=nodes.filter(p=>p.y>=L.y0-.1&&p.y<=L.y0+.65&&distance(p,bottom)<2&&free(p)).sort((a,b)=>distance(a,bottom)-distance(b,bottom))[0];
  }
  if(f.mode==='exit'){
    const edge=g.NAV.E.find(e=>e.kind===5&&e.ladder===L),n=g.NAV.nodes[edge.to];
    blockerPoint=point(n.x,n.y,n.z);
    // This actor is already on the deck: seed the legitimate earlier player visit.
    g.INDOOR_ACCESS?.observe(blockerPoint);
    goal=nodes.filter(p=>Math.abs(p.y-top.y)<.1&&distance(p,blockerPoint)>1.3&&distance(p,top)<4&&free(p)&&skyZombieClimb.clearLine({r:.3,h:1.8},blockerPoint,p,true)).sort((a,b)=>distance(a,top)-distance(b,top))[0];
    if(!goal||!free(blockerPoint))return {...f,skipped:'no separated exit blocker/target'};
  }
  if(blockerPoint&&!free(blockerPoint))return {...f,skipped:'no supported blocker'};
  c.pos.set(goal.x,goal.y,goal.z);c.vel.set(0,0,0);Object.assign(c,{onGround:true,state:'normal',h:1.75,invuln:1e9,ledge:null,ladder:null,hook:null,zip:null});
  c.lastGround.copy(c.pos);c.safe.copy(c.pos);g.INDOOR_ACCESS?.observe(c.pos);g.updateField();
  const starts=[];
  if(blockerPoint)starts.push(blockerPoint);
  const candidates=[bottom,...nodes.filter(p=>Math.abs(p.y-bottom.y)<.1&&distance(p,bottom)<6).sort((a,b)=>distance(a,bottom)-distance(b,bottom))];
  for(const p of candidates)if(starts.length<f.count&&free(p)&&g.INDOOR_ACCESS?.allows(p)!==false&&starts.every(q=>Math.abs(q.y-p.y)>1.8||distance(p,q)>.72))starts.push(p);
  if(starts.length<f.count)return {...f,skipped:'not enough supported starts',available:starts.length};
  const enemies=starts.map(p=>{const e=new g.Zombie(p.x,p.y,p.z);Object.assign(e,{spawnT:0,onGround:true,flank:false,dropper:false,stalker:false,pz:false,speedMul:1});g.zombies.push(e);return e;});
  if(blockerPoint){enemies[0].stun=12;enemies[0].update=function(){this.anim(dt);};}
  const arrived=Array(f.count).fill(null),firstAction=Array(f.count).fill(null),actions=Array.from({length:f.count},()=>[]),last=Array(f.count).fill(null);
  let ladderPenetrations=0,ownedPenetrations=0,ladderBodyOverlaps=0,ladderPairOverlaps=0,ownedBodyOverlaps=0,maxStep=0,released=false;const trail=[];
  const before={climb:skyZombieClimb.stats.started,stalls:skyZombieSearch.stats.stalls};
  for(let i=0;i<(window.ascentSeconds||90)*60;i++){
    c.pos.set(goal.x,goal.y,goal.z);c.vel.set(0,0,0);c.onGround=true;
    if(blockerPoint&&!released&&g.GAME.t>=12){delete enemies[0].update;enemies[0].stun=0;released=true;}
    const prev=enemies.map(e=>e.pos.clone());g.advance(dt);
    enemies.forEach((e,j)=>{
      if(e.remove)return;
      maxStep=Math.max(maxStep,e.pos.distanceTo(prev[j]));
      if(e.act&&e.act!==last[j]){const kind=e.act.kind||'vault';firstAction[j]??={kind,time:g.GAME.t};actions[j].push({kind,time:g.GAME.t,ladder:g.LADDERS.indexOf(e.act.L)});}
      last[j]=e.act;
      if(e.act?.kind==='ladder'){
        if(!g.freeAt(e.pos.x,e.pos.y+.012,e.pos.z,e.r,e.h)){ladderPenetrations++;if(e.act.pursuitLadder)ownedPenetrations++;}
        for(const other of enemies)if(!other.remove&&other!==e&&Math.hypot(e.pos.x-other.pos.x,e.pos.z-other.pos.z)<e.r+other.r-.1&&Math.min(e.pos.y+e.h,other.pos.y+other.h)-Math.max(e.pos.y,other.pos.y)>.2){ladderBodyOverlaps++;if(other.act?.kind==='ladder')ladderPairOverlaps++;if(e.act.pursuitLadder&&other.act?.pursuitLadder)ownedBodyOverlaps++;}
      }
      if(arrived[j]===null&&!e.act&&e.onGround&&Math.abs(e.pos.y-goal.y)<.35&&distance(e.pos,goal)<3.5&&skyZombieClimb.clearLine(e,e.pos,goal,true))arrived[j]=g.GAME.t;
      // Measure flow through the upper exit, then clear the destination area.
      // Eight stationary bodies cannot share a narrow balcony indefinitely.
      if(arrived[j]!==null&&(!blockerPoint||j!==0||released)&&!window.ascentRetain){e.remove=true;s.ue.remove(e.m.root);const k=g.zombies.indexOf(e);if(k>=0)g.zombies.splice(k,1);}
    });
    if(i%120===0)trail.push({t:g.GAME.t,p:arr(c.pos),enemies:enemies.map(e=>({p:arr(e.pos),act:e.act?.kind,node:e.node,edge:e.edge}))});
    if(arrived.every(t=>t!==null))break;
  }
  return {...f,ladderData:{x:L.x,z:L.z,y0:L.y0,y1:L.y1,nx:L.nx,nz:L.nz},goal:arr(goal),starts:starts.map(arr),arrived,firstAction,actions,ladderPenetrations,ownedPenetrations,ladderBodyOverlaps,ladderPairOverlaps,ownedBodyOverlaps,maxStep,climbs:skyZombieClimb.stats.started-before.climb,stalls:skyZombieSearch.stats.stalls-before.stalls,trail};
})()
