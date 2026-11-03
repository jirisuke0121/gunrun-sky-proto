const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
 global.window=global;
 const {createNavWatch,classifyStuck,WATCH}=await import('../nav-watch.js');

 // --- the one-word cause -------------------------------------------------------------
 const base={standingNode:7,playerY:6.7,targets:[[0,6.7,0]],zombieNode:3,zombieField:40,nav:0};
 assert.equal(classifyStuck({...base,standingNode:-1}),'player-no-node','no node under the player: the target is stale');
 assert.equal(classifyStuck({...base,targets:[[0,11.9,0]]}),'target-off-floor','target is on another level');
 assert.equal(classifyStuck({...base,targets:[[0,11.9,0]],nav:2}),'route-exists','approach-node targets are by design');
 assert.equal(classifyStuck({...base,zombieNode:-1}),'zombie-no-node');
 assert.equal(classifyStuck({...base,zombieField:Infinity}),'no-route','no drop link from where it stands');
 assert.equal(classifyStuck(base),'route-exists','a route exists, so look at jams and crowding');

 // --- a stub world ---------------------------------------------------------------------
 class Zombie{update(){}}
 const nodes=[{x:-30,y:11.9,z:1},{x:-22,y:6.7,z:1}];
 const build=(over={})=>{
  const probe={entries:[],stuck(e){this.entries.push(e)}};
  const player={pos:{x:-22.5,y:6.7,z:1.25},onGround:true,state:'normal',node:0};
  const run={t:0,over:false,mission:null};
  const field=new Float32Array(2).fill(Infinity);field[0]=0;
  const runtime={mode:'play',NAV:{nodes},FIELD:field,nodeAt:()=>-1,...over};
  const zombies=[],game={c:player,z:run,Jt:zombies,ri:Zombie};
  const watch=createNavWatch(game,runtime,{probe:()=>probe,devMode:()=>false});
  const zombie=(o={})=>{const z={pos:{x:-30,y:11.9,z:1},spawnT:0,onGround:true,act:null,rise:null,fall:null,stun:0,guard:0,bash:false,node:0,edge:-1,dead:false,remove:false,...o};zombies.push(z);return z};
  const tick=(seconds,each=()=>{})=>{for(let i=0;i<Math.round(seconds*10);i++){run.t+=.1;each(i);for(const z of zombies)Zombie.prototype.update.call(z,.1)}};
  return {probe,player,run,runtime,zombies,zombie,tick,watch};
 };

 // 1) The reported case: roof zombies wait while the player stands on a floor without a node.
 let w=build();let a=w.zombie(),b=w.zombie({pos:{x:-29,y:11.9,z:1.2},node:1});
 w.tick(4.5);assert.equal(w.probe.entries.length,0,'not before 5 s');
 w.tick(1);assert.equal(w.probe.entries.length,1,'one entry per episode');
 let e=w.probe.entries[0];
 assert.equal(e.cause,'player-no-node');assert.equal(e.n,2,'counts every stuck zombie');
 assert.deepEqual(e.player.p,[-22.5,6.7,1.3],'player position');
 assert.equal(e.player.now,-1);assert.equal(e.player.kept,0);assert.deepEqual(e.player.keptAt,[-30,11.9,1],'the stale node is the roof');
 assert.deepEqual(e.targets,[[-30,11.9,1]],'the field still targets the roof');
 assert.equal(e.zombies[0].f,0);assert.equal(e.zombies[1].f,null,'no route = null');
 w.tick(20);assert.equal(w.probe.entries.length,1,'no repeat while they keep standing');
 assert.ok(w.watch.status().nodeless,'the badge state says nodeless');

 // 2) Reasons not to log.
 const quiet=(name,patch,playerPatch={},runPatch={},runtimePatch={})=>{
  const x=build(runtimePatch);Object.assign(x.player,playerPatch);Object.assign(x.run,runPatch);x.zombie(patch);x.tick(7);
  assert.equal(x.probe.entries.length,0,name);
 };
 quiet('zombie on the same level',{pos:{x:-30,y:7.5,z:1}});
 quiet('zombie too far away',{pos:{x:-60,y:11.9,z:1}});
 quiet('player in the air',{},{onGround:false});
 quiet('player on a hook/swing',{},{state:'swing'});
 quiet('zombie climbing',{act:{kind:'pillar'}});
 quiet('zombie stunned',{stun:1});
 quiet('zombie not on ground',{onGround:false});
 quiet('zombie spawning',{spawnT:1});
 quiet('dead zombie',{dead:true});
 quiet('stalker',{stalker:true});
 quiet('mission',{},{},{mission:{}});
 quiet('run over',{},{},{over:true});
 quiet('not playing',{},{},{},{mode:'menu'});
 window.skyFlashbang={blinded:()=>true};quiet('flashbanged',{});delete window.skyFlashbang;
 window.skyDecoy={targetFor:()=>({})};quiet('lured by a decoy',{});delete window.skyDecoy;
 window.skyBite={locked:true};quiet('player is being bitten',{});delete window.skyBite;
 // A zombie that keeps moving is never stuck, however slowly.
 w=build();a=w.zombie();w.tick(12,()=>{a.pos.x+=.1});assert.equal(w.probe.entries.length,0,'1 m/s is walking');
 // A crowd pushing against each other around one node drifts a little but is still stuck.
 w=build();a=w.zombie();b=w.zombie({pos:{x:-29,y:11.9,z:1.2},node:1});
 w.tick(7,i=>{const d=Math.sin(i)*.9;a.pos.x=-30+d;b.pos.z=1.2+d});assert.equal(w.probe.entries.length,1,'jostling within 1 m is not walking');

 // A shove that lifts a zombie off the ground for a moment does not restart the count; a real pause does.
 w=build();a=w.zombie();w.tick(7,i=>{a.onGround=!(i%10<3)});assert.equal(w.probe.entries.length,1,'0.3 s flickers are tolerated');
 w=build();a=w.zombie();w.tick(7,i=>{a.stun=(i%30<10)?1:0});assert.equal(w.probe.entries.length,0,'a 1 s stun restarts the count each time');

 // 3) A floor that has a node is a different story: same zombies, different cause.
 w=build({nodeAt:()=>1});w.player.node=1;w.zombie();w.tick(6);
 assert.equal(w.probe.entries[0].cause,'target-off-floor','with a node under the player, a roof target is reported as off-floor');
 assert.notEqual(w.probe.entries[0].cause,'player-no-node');
 assert.equal(w.watch.status().nodeless,false);

 // 4) At most one entry per 8 s, however many zombies; a new run starts clean.
 w=build();const first=w.zombie();w.tick(6);assert.equal(w.probe.entries.length,1);
 const late=w.zombie({pos:{x:-31,y:11.9,z:1}});w.tick(5.5);assert.equal(w.probe.entries.length,1,'inside 8 s: skipped');assert.equal(w.watch.stats.skipped,1);
 const third=w.zombie({pos:{x:-32,y:11.9,z:1}});w.tick(5.5);assert.equal(w.probe.entries.length,2,'8 s later a new episode logs again');
 w.run.t=0;w.zombies.length=0;w.zombie();w.tick(6);assert.equal(w.probe.entries.length,3,'a new run (clock back at 0) starts clean');

 // 5) The badge only costs anything in developer mode.
 let frames=0;global.requestAnimationFrame=()=>{frames++};
 createNavWatch({c:{pos:{x:0,y:0,z:0}},z:{t:0},Jt:[],ri:Zombie},{NAV:{nodes:[]},FIELD:[],nodeAt:()=>0},{probe:()=>null,devMode:()=>false});
 assert.equal(frames,0,'players: no frame loop');

 // 6) The record keeps at most six entries and says how many were dropped.
 vm.runInThisContext(fs.readFileSync('telemetry-probe.js','utf8'));
 const probe=window.skyTelemetryProbe;probe.reset();
 for(let i=0;i<9;i++)probe.stuck({t:i});
 const snap=probe.snapshot(100);
 assert.equal(snap.stuck.length,6);assert.equal(snap.truncated.stuck,3);
 probe.reset();assert.deepEqual(probe.snapshot(1).stuck,[],'reset clears it');
 console.log('PASS nav-watch: stuck zombies are logged with their cause; healthy waiting is left alone');
})().catch(e=>{console.error(e);process.exitCode=1});
