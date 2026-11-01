const assert = require('node:assert/strict');
const {evaluate, createTracker, config} = require('../threat-score.js');
function fixture() {
  let now = 0, escapes = 0, blocked = false, distracted = false;
  const c = {pos:{x:0,y:0,z:0},state:'normal',invuln:0};
  const enemy = {pos:{x:3,y:0,z:0},node:0,spawnT:0,stun:0};
  const game = {c,z:{t:0},Jt:[enemy],ceRef:()=>now,raycast:()=>blocked,
    searchNav:{decoyTarget:()=>distracted}};
  const runtime = {FIELD:[3]}, tracker = createTracker(game,runtime,()=>escapes++);
  const tick = (seconds, move=true, circle=false) => {
    for(let n=0;n<Math.round(seconds/.05);n++) {
      now += .05; game.z.t += .05;
      if(move) {c.pos.x=circle?Math.sin(now)*3:c.pos.x+.3;c.pos.z=circle?Math.cos(now)*3:0;}
      enemy.pos.x=c.pos.x+3;enemy.pos.z=c.pos.z;
      tracker.step(.05);
    }
    return tracker.snapshot();
  };
  return {game,c,enemy,runtime,tracker,tick,escapes:()=>escapes,wall:v=>blocked=v,decoy:v=>distracted=v};
}
const one=fixture(),moving=one.tick(6);
assert.ok(moving.pressureSeconds>3);assert.equal(moving.count,1);assert.ok(moving.rate>80);
const idle=fixture();assert.equal(idle.tick(30,false).pressureSeconds,0,'standing still earns no pursuit points');
const stopped=fixture();stopped.tick(3);const stoppedAt=stopped.tracker.snapshot().pressureSeconds;
assert.equal(stopped.tick(1.5,false).pressureSeconds,stoppedAt,'stopping after movement leaves no residual scoring');
assert.equal(stopped.tracker.snapshot().rate,0,'the HUD rate stops with actual motion');
for(const state of ['swing','ledge']) {const f=fixture();f.c.state=state;assert.equal(f.tick(10).pressureSeconds,0,state);}
const inv=fixture();inv.c.invuln=100;assert.equal(inv.tick(10).pressureSeconds,0);
for(const flag of ['dead','remove','rise','fall']) {const f=fixture();f.enemy[flag]=true;assert.equal(f.tick(3).count,0,flag);}
for(const [key,value] of [['spawnT',1],['stun',4]]) {const f=fixture();f.enemy[key]=value;assert.equal(f.tick(3).count,0,key);}
const floor=fixture();floor.enemy.pos.y=-5;assert.equal(floor.tick(3).pressureSeconds,0,'other floor');
const farRoute=fixture();farRoute.runtime.FIELD[0]=60;assert.equal(farRoute.tick(3).pressureSeconds,0,'short straight distance, long real route');
const noRoute=fixture();noRoute.runtime.FIELD[0]=Infinity;assert.equal(noRoute.tick(3).pressureSeconds,0,'unreachable platform');
const wall=fixture();wall.wall(true);assert.equal(wall.tick(3).pressureSeconds,0,'wall blocks threat');
const decoy=fixture();decoy.decoy(true);assert.equal(decoy.tick(3).pressureSeconds,0,'decoy is the target');
const many=fixture();many.game.Jt=Array.from({length:30},()=>({...many.enemy,pos:many.enemy.pos}));
assert.equal(many.tick(3).pressure,3,'crowd pressure is capped');
const loop=fixture(),at20=loop.tick(22,true,true).pressureSeconds;
assert.equal(loop.tick(10,true,true).pressureSeconds,at20,'small loops and cell-boundary crossings exhaust the same budget');
loop.decoy(true);loop.tick(4);loop.decoy(false);assert.equal(loop.tick(3,true,true).pressureSeconds,at20,'reacquiring does not refill the local budget');
const escape=fixture();escape.tick(4);const before=escape.tracker.snapshot().pressureSeconds;
escape.wall(true);escape.tick(3);assert.equal(escape.escapes(),1);assert.equal(escape.tracker.snapshot().pressureSeconds,before,'ESCAPED itself awards nothing');
escape.tick(5);assert.equal(escape.escapes(),1,'one cue per pursuit episode');
const swingEscape=fixture();swingEscape.tick(4);swingEscape.c.state='swing';swingEscape.tick(3);assert.equal(swingEscape.escapes(),0,'hanging beside a pursuer is not an escape');
const kill=fixture();kill.tick(4);kill.enemy.dead=true;kill.tick(3);assert.equal(kill.escapes(),0,'kills do not also trigger escape');
const damage=fixture();damage.tracker.damaged(1.4);damage.tracker.damaged(-20);damage.tracker.damaged(NaN);
assert.equal(damage.tracker.snapshot().damageUnits,1.4);
assert.deepEqual([0,1,2].map(i=>evaluate(120,1,i,{pressureSeconds:10,damageUnits:4}).total),[1308,1438,1569]);
assert.equal(evaluate(120,0,0).total,0,'safe survival alone is not the main score');
assert.ok(evaluate(10,0,0,{pressureSeconds:20}).total > evaluate(10,3,0,{damageUnits:24}).total,'credible pursuit beats ordinary combat');
assert.equal(evaluate(2,0,0,{pressureSeconds:999}).survival,2*3*config.perSecond);
console.log('PASS threat distance/route/floor/occlusion, live targets, movement, invulnerability, crowd cap, loop budget, escape presentation and combat arithmetic');

// Exercise the actual common damage hook in each bundled game (overkill, death,
// already-dead targets and immune stalkers), not a duplicate damage calculator.
const fs=require('node:fs'),vm=require('node:vm');
for(const file of ['index.html','canyon.html']) {
 const html=fs.readFileSync(file,'utf8');
 const start=html.indexOf('hurt(t,e,i,s,r){'),end=html.indexOf('die(t){',start);
 const effects=[];const target={hp:4,dead:false,stun:0,vel:{x:0,y:0,z:0},die(){this.dead=true;effects.push('kill')}};
 const context={window:{skyChallengeScore:{damaged:n=>effects.push(n)}},Math,z:{t:1},Hv:()=>effects.push('immune')};
 const hurt=vm.runInNewContext('(function '+html.slice(start,end)+')',context);
 hurt.call(target,1,1,0,0,0);hurt.call(target,99,1,0,0,0);hurt.call(target,99,1,0,0,0);
 assert.deepEqual(effects,[1,3,'kill'],file+': only actual health removed earns damage');
 target.dead=false;target.stalker=true;hurt.call(target,99,1,0,0,0);assert.equal(effects.at(-1),'immune');
 assert.equal(html.match(/z.t\+=n;window.skyFlashbang\?\.tick\(n\);window.skyChallengeScore.step\(n\)/g)?.length,file==='canyon.html'?2:1);
}
console.log('PASS actual bundled damage/kill hooks, overkill cap, dead/immune targets, shared simulation clock on both maps');
