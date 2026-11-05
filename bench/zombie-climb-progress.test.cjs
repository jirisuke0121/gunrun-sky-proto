const assert=require('node:assert/strict');
(async()=>{
 const {createZombieClimb}=await import('../zombie-climb.js');global.window={};
 class Zombie{update(){}anim(){}}
 const vector=(x,y,z)=>({x,y,z,set(x,y,z){Object.assign(this,{x,y,z});}});
 const e=Object.assign(new Zombie,{pos:vector(14,.003,0),vel:vector(0,0,0),r:.3,h:1.8,onGround:true,spawnT:0,stun:0,lastHitT:-99,node:0,edge:-1});
 const c={pos:vector(0,8.003,0),onGround:true},field=new Float32Array([8,10]);
 const game={ri:Zombie,c,z:{t:10},Jt:[e],jn:[],Geom:{Vector3:class{}},ceRef:()=>game.z.t};
 const runtime={mode:'play',NAV:{nodes:[{id:0,x:14,y:0,z:0},{id:1,x:12,y:0,z:0}],E:[],out:[[],[]]},FIELD:field,near:()=>[],nodeAt:x=>x>13?0:1};
 const climb=createZombieClimb(game,runtime,{blinded:()=>false});
 for(let i=0;i<480;i++){e.node=Math.floor(i/30)%2;e.pos.x=e.node?12:14;game.z.t+=1/60;e.update(1/60);}
 assert.ok(climb.state(e).wait>6,'alternating geometric and field improvements on the same loop cannot erase a stall');
 field.fill(2);game.z.t+=1/60;e.update(1/60);assert.ok(climb.state(e).wait<.1,'a new shorter route still counts as progress');
 c.pos.x=4;game.z.t+=1/60;e.update(1/60);assert.ok(climb.state(e).wait<.1,'a moved target establishes a new baseline');
 console.log('PASS climb progress: independent distance/field bests detect loops and preserve real progress and target changes');
})().catch(e=>{console.error(e);process.exitCode=1;});
