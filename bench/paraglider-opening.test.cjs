const assert=require('node:assert/strict');
const P=require('../paraglider-opening.js');
const {CONFIG}=P;
// enabled: same switches as the random start; automation only with ?paraglider=1.
const env=(search='',extra={})=>({location:{search},navigator:{webdriver:false},...extra});
assert.equal(P.enabled(env()),true);
assert.equal(P.enabled(env('?paraglider=0')),false);
assert.equal(P.enabled(env('?start=default')),false);
assert.equal(P.enabled(env('?start_spot=west-mid')),false);
assert.equal(P.enabled(env('',{SKY_CANYON_MAP:true})),false);
assert.equal(P.enabled(env('',{skyPracticeMode:true})),false);
assert.equal(P.enabled(env('',{skyOwnerReplay:true})),false);
assert.equal(P.enabled({location:{search:''},navigator:{webdriver:true}}),false);
assert.equal(P.enabled({location:{search:'?paraglider=1'},navigator:{webdriver:true}}),true);
// bounds + contain
const box=P.bounds([{x:-10,z:-5},{x:20,z:8}],2);assert.deepEqual(box,{minX:-8,maxX:18,minZ:-3,maxZ:6});
assert.equal(P.bounds([]),null);
{const pos={x:30,z:0},vel={x:5,z:1};assert.equal(P.contain(pos,vel,box),true);assert.equal(pos.x,18);assert.equal(vel.x,0);assert.equal(vel.z,1);
 const in2={x:0,z:0},v2={x:-3,z:3};assert.equal(P.contain(in2,v2,box),false);assert.deepEqual(v2,{x:-3,z:3});}
// steer: camera-relative, capped at glideSpeed, constant sink.
{let v={x:0,y:0,z:0};for(let i=0;i<600;i++)v=P.steer(v,{fwdIn:1,strIn:0},0,1/120);
 assert.ok(Math.abs(v.z+CONFIG.glideSpeed)<.01&&Math.abs(v.x)<1e-9,'yaw 0 forward is -z at glideSpeed');assert.equal(v.y,-CONFIG.glideSink);
 v={x:0,y:0,z:0};for(let i=0;i<600;i++)v=P.steer(v,{fwdIn:0,strIn:1},0,1/120);assert.ok(Math.abs(v.x-CONFIG.glideSpeed)<.01,'right is +x at yaw 0');
 v={x:0,y:0,z:0};for(let i=0;i<600;i++)v=P.steer(v,{fwdIn:1,strIn:1},Math.PI/2,1/120);assert.ok(Math.abs(Math.hypot(v.x,v.z)-CONFIG.glideSpeed)<.01,'diagonal is not faster');
 v={x:4,y:-9,z:0};v=P.steer(v,{fwdIn:0,strIn:0},0,1/120);assert.ok(v.x<4&&v.x>3.8,'no input slows down gradually');}
// plane: passes over the drop point at planeSeconds, flying along the angle.
{const drop={x:1,y:CONFIG.dropY,z:-2},p=P.planeAt(drop,0,CONFIG.planeSeconds);assert.deepEqual([p.x,p.y,p.z],[1,CONFIG.dropY,-2]);
 const before=P.planeAt(drop,Math.PI/2,0);assert.ok(Math.abs(before.x-1)<1e-9&&Math.abs(before.z-(-2-CONFIG.planeSeconds*CONFIG.planeSpeed))<1e-9);
 assert.ok(Math.abs(P.yawFor(0,-1))<1e-9,'yaw 0 faces -z');}
// rankDanger: most zombies nearby -> strongest weapon (MG=2), spaced apart, never on top of a zombie.
{const node=(id,x,z,y=4)=>({id,x,y,z});
 const nodes=[node(1,0,0),node(2,5,0),node(3,40,0),node(4,80,0),node(5,0,30),node(6,120,0)];
 const zombies=[{x:8,y:4,z:0},{x:9,y:4,z:3},{x:42,y:4,z:6},{x:2,y:4,z:39}];
 const picks=P.rankDanger(nodes,zombies);
 assert.deepEqual(picks.map(p=>p.node.id),[1,3,5]);assert.deepEqual(picks.map(p=>p.type),[2,1,0]);
 assert.ok(picks[0].danger>picks[1].danger&&picks[1].danger>=picks[2].danger);
 assert.ok(!picks.some(p=>p.node.id===2),'node 2 stands 3 m from a zombie');
 assert.ok(P.rankDanger([node(9,0,0)],[{x:1,y:4,z:1}]).length===0,'never on top of a zombie');
 assert.equal(P.rankDanger(nodes,[]).length,3,'no zombies: still three crates');}
console.log('paraglider-opening rules: ok');
