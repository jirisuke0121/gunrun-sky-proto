const assert=require('node:assert/strict');
(async()=>{
 const {FALL,fallDamage,createZombieFall}=await import('../zombie-fall.js');
 // Damage grows with the drop: nothing up to 1.5 m, half at 3 m, everything from 4.5 m.
 assert.equal(fallDamage(1.5,8),0);assert.equal(fallDamage(0.2,8),0);
 assert.equal(fallDamage(3,8),4);assert.equal(fallDamage(3,12),6,'share of full health, so every difficulty scales');
 assert.equal(fallDamage(4.5,8),8);assert.equal(fallDamage(30,8),8,'capped at full health');
 assert.equal(fallDamage(Infinity,8),8);assert.equal(fallDamage(NaN,8),0);assert.equal(fallDamage(5,0),0);
 assert.deepEqual([FALL.free,FALL.lethal],[1.5,4.5]);

 class Zombie{
  constructor(){Object.assign(this,{pos:{x:0,y:0,z:0},vel:{x:0,y:0,z:0},onGround:true,stun:0,lastHitT:-99,hp:8,dead:false,act:null,hits:[]});}
  update(){this.moved?.();}
  hurt(damage,x,z,stun,push){this.hits.push({damage,stun});this.hp-=damage;this.lastHitT=game.z.t;this.vel.y=Math.max(this.vel.y,1.2);if(this.hp<=0)this.dead=true;}
 }
 const game={ri:Zombie,z:{t:10},U:{zombieHealth:8},Tt:{thud(){this.n=(this.n||0)+1;}}};
 global.window={};
 const fall=createZombieFall(game);
 // Run a fall: leave the ground at y=from (knocked or not), land at y=to.
 function run({from=6,to=0,stun=0,hit=-99,act=null,stalker=false,hp=8}={}){
  const z=new Zombie();z.pos.y=from;z.stun=stun;z.lastHitT=hit;z.hp=hp;z.stalker=stalker;
  const frames=[];for(let y=from;y>to;y-=.5)frames.push(y);
  let i=0;z.moved=function(){if(i<frames.length){this.onGround=false;this.pos.y=Math.max(to,frames[i++]-.5);this.act=act;}else{this.pos.y=to;this.onGround=true;this.act=null;}};
  z.onGround=true;for(let k=0;k<frames.length+3;k++)z.update(1/60);
  return z;
 }
 // A zombie that steps or drops down by itself takes nothing, however high.
 let z=run({from:12});assert.equal(z.hits.length,0,'self-initiated fall');
 // A knocked fall (stunned at take-off, or hit a moment ago) is punished by height.
 z=run({from:6,stun:.5});assert.equal(z.hits.length,1);assert.equal(z.dead,true,'6 m is lethal');
 z=run({from:3,stun:.5});assert.equal(z.hits.length,1);assert.equal(z.hits[0].damage,4,'3 m is half of 8 health');
 assert.ok(z.hits[0].stun>=FALL.stun&&z.hits[0].stun<=FALL.maxStun);assert.equal(z.dead,false);assert.ok(z.vel.y<=0,'no bounce after the hit');
 z=run({from:3,hit:9.5});assert.equal(z.hits.length,1,'hit 0.5 s before take-off still counts');
 z=run({from:3,hit:8});assert.equal(z.hits.length,0,'a hit 2 s earlier does not');
 z=run({from:1,stun:.5});assert.equal(z.hits.length,0,'short knocked fall');
 // Scripted moves are never fall damage; stalkers are exempt.
 z=run({from:6,stun:.5,act:{kind:'pillar'}});assert.equal(z.hits.length,0,'climbing/jumping acts');
 z=run({from:6,stun:.5,stalker:true});assert.equal(z.hits.length,0,'stalker');
 // Health share follows the difficulty setting, and a higher max health survives longer.
 game.U.zombieHealth=12;z=run({from:3,stun:.5,hp:12});assert.equal(z.hits[0].damage,6);assert.equal(z.dead,false);
 assert.ok(fall.stats.damaged>=4&&fall.stats.killed>=1);assert.ok(game.Tt.n>=4,'landing thud');
 console.log('PASS zombie fall damage: height curve, knocked-only, scripted moves exempt, difficulty share');
})().catch(e=>{console.error(e);process.exitCode=1});
