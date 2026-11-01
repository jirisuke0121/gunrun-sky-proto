const assert = require('node:assert/strict');
(async () => {
  const { createZombieClimb } = await import('../zombie-climb.js');
  const box = (a,b) => ({ minX:a[0],minY:a[1],minZ:a[2],maxX:b[0],maxY:b[1],maxZ:b[2],type:'slab' });
  function scenario({ wall=false, floor=true, stun=0, kind=2, x=0 }={}) {
    class Zombie { update() {} anim() {} startAct(tx,ty,tz,dur){this.act={sx:this.pos.x,sy:this.pos.y,sz:this.pos.z,tx,ty,tz,dur,t:0};} }
    const solids=[box([-2,-.3,-2],[.25,0,2])];
    if(floor)solids.push(box([1.2,-3.8,-2],[3,-3.5,2]));
    if(wall)solids.push(box([.7,-3.5,-1],[1.3,3,1]));
    const player={pos:{x:2,y:-3.5,z:0},onGround:true},run={t:10,over:false};
    const enemy=Object.assign(new Zombie,{pos:{x,y:.0001,z:0},r:.3,h:1.8,onGround:true,spawnT:0,stun,lastHitT:-99,node:0,edge:0});
    global.window={};
    const jammed=[];
    const runtime={mode:'play',NAV:{nodes:[{x:0,y:0,z:0},{x:2,y:-3.5,z:0}],E:[{from:0,to:1,kind}],out:[[0],[]]},FIELD:[3,0],near:()=>solids,nodeAt:()=>0,jamNavigationEdge:(id,until)=>jammed.push({id,until})};
    const game={ri:Zombie,c:player,z:run,Jt:[enemy],jn:solids,Geom:{Vector3:class{}},ceRef:()=>10};
    const climb=createZombieClimb(game,runtime,{blinded:()=>false});
    enemy.update(1/120);
    return {enemy,climb,jammed};
  }
  const valid=scenario();
  assert.equal(valid.enemy.act.kind,'drop','an open descent commits without a wall collision');
  assert.equal(valid.enemy.act.ty,-3.498);assert.equal(valid.climb.stats.navDrops,1);
  for(const opts of [{wall:true},{floor:false},{stun:1},{kind:0},{x:-1.2}]){
    const r=scenario(opts);assert.equal(r.enemy.act,undefined,JSON.stringify(opts));assert.equal(r.climb.stats.navDrops,0);
    assert.deepEqual(r.jammed,opts.wall?[{id:0,until:30}]:[],'only a body-obstructed trajectory is temporarily removed from navigation');
  }
  console.log('PASS drop entry: open departure, swept wall obstruction, landing support, stun, ordinary edge and distant departure');
})().catch(e=>{console.error(e);process.exitCode=1});
