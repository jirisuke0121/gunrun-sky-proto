const assert = require('node:assert/strict');
const {evaluate, createTracker, config} = require('../survival-score.js');
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
// Survival is solely a function of elapsed simulation time and difficulty.
assert.deepEqual([0,1,2].map(i=>evaluate(120,0,i).total),[400,440,480]);
assert.deepEqual([0,1,2].map(i=>evaluate(120,1,i,{damageUnits:4}).total),[508,558,609]);
assert.equal(evaluate(10,0,0,{pressureSeconds:999,chasedSeconds:0}).survival,33,'old threat metrics cannot alter time points');
assert.equal(evaluate(500,0,0).survival,400,'round time is capped at 120 seconds');
assert.equal(evaluate(-2,0,0).total,0);
assert.equal(evaluate(1.234,0,1).survival,4,'each component rounds down');
// Survival is paid out every 30 seconds (100 x multiplier) without changing the total.
assert.equal(config.interval,30);
assert.deepEqual([0,1,2].map(i=>evaluate(30,0,i).tickPoints),[100,110,120]);
for(const d of [0,1,2]) {
  assert.equal(evaluate(120,0,d).ticks,4);
  assert.equal(evaluate(120,0,d).remainder,0,'a full run is entirely paid out in milestones');
  assert.equal(evaluate(120,0,d).live,evaluate(120,0,d).total);
  for(const t of [0,1.234,29.99,30,30.01,45.5,59.99,60,119.99,120]) {
    const b=evaluate(t,2,d,{damageUnits:3});
    assert.equal(b.ticked+b.remainder,b.survival,'milestones plus remainder equal the continuous survival points');
    assert.equal(b.live+b.remainder,b.total,'the live HUD total never exceeds the final total');
    assert.ok(b.remainder>=0&&b.remainder<b.tickPoints,'remainder is less than one milestone');
    assert.equal(b.ticks,Math.floor(t/30));
  }
}
assert.equal(evaluate(29.99,0,0).live,0,'nothing is paid out before the first 30 seconds');
assert.equal(evaluate(30,0,1).live,110);
assert.equal(evaluate(5,0,1).scoring,'time-survival-v2','new arithmetic has its own scoring id');
// The reported run is survival-led, while combat now materially affects the total.
const reported=evaluate(120,1,2,{damageUnits:64.1});
assert.deepEqual([reported.survival,reported.damage,reported.kill,reported.total],[480,153,120,753]);
assert.ok(reported.survival/reported.total>.6&&reported.survival/reported.total<.7);
// Ordinary 1–3 full-health kills leave survival as the largest share at completion.
for(const [difficulty,hp] of [[0,4],[1,8],[2,12]]) {
  for(const kills of [1,2,3]) {
    const b=evaluate(120,kills,difficulty,{damageUnits:hp*kills});
    assert.ok(b.survival>b.damage+b.kill);
  }
  // Active combat can still beat passive completion; survival is preferred, not absolute.
  assert.ok(evaluate(90,1,difficulty,{damageUnits:hp}).total>evaluate(120,0,difficulty).total);
  for(let ms=0;ms<=120000;ms+=137) {
    const b=evaluate(ms/1000,1,difficulty,{damageUnits:4.1});
    assert.equal(b.live+b.remainder,b.total);
    assert.ok(b.remainder>=0&&b.remainder<b.tickPoints);
  }
}
for(const condition of ['idle','far','wall','floor','no-route','swing','ledge','invulnerable','loop','decoy']) {
 const f=fixture();
 if(condition==='far')f.runtime.FIELD[0]=60;
 if(condition==='wall')f.wall(true);
 if(condition==='floor')f.enemy.pos.y=-5;
 if(condition==='no-route')f.runtime.FIELD[0]=Infinity;
 if(['swing','ledge'].includes(condition))f.c.state=condition;
 if(condition==='invulnerable')f.c.invuln=100;
 if(condition==='decoy')f.decoy(true);
 f.tick(30,condition!=='idle',condition==='loop');
 assert.equal(evaluate(f.game.z.t,0,0,f.tracker.snapshot()).survival,100,condition+' does not suppress survival points');
 assert.ok(!('pressureSeconds' in f.tracker.snapshot()),'no threat score is accumulated');
}
const escape=fixture();escape.tick(4);escape.wall(true);escape.tick(3);
assert.equal(escape.escapes(),1);escape.tick(5);assert.equal(escape.escapes(),1,'one cue per pursuit episode');
for(const disable of ['swing','stun','decoy','flash']) {
 const f=fixture();f.tick(4);
 if(disable==='swing')f.c.state='swing';
 if(disable==='stun')f.enemy.stun=4;
 if(disable==='decoy')f.decoy(true);
 if(disable==='flash')global.skyFlashbang={blinded:()=>true};
 try{f.tick(3);assert.equal(f.escapes(),0,disable+' is not actual separation');}finally{delete global.skyFlashbang;}
}
const killed=fixture();killed.tick(4);killed.enemy.dead=true;killed.tick(3);assert.equal(killed.escapes(),0,'kills do not trigger escape');
const damage=fixture();damage.tracker.damaged(1.4);damage.tracker.damaged(-20);damage.tracker.damaged(NaN);
assert.equal(damage.tracker.snapshot().damageUnits,1.4);
console.log('PASS time-only survival, all difficulty multipliers, no distance/state/loop penalties, combat arithmetic and presentation-only escape');

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
 assert.equal(html.match(/z.t\+=n;(?:indoorAccess.observe\(c.pos\);)?window.skyFlashbang\?\.tick\(n\);window.skyGunRecoil\?\.tick\(n\);window.skyChallengeScore.step\(n\)/g)?.length,file==='canyon.html'?2:1);
}
console.log('PASS actual bundled damage/kill hooks, overkill cap, dead/immune targets, shared simulation clock on both maps');
