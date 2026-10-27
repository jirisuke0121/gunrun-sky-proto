const assert=require('node:assert/strict');
const {fixture}=require('./human-running.test.cjs');
(async()=>{
 const {boostEnvelope,segmentDistance,pickupNodes,createDash}=await import('../dash-boost.js');
 assert.equal(boostEnvelope(0),0);assert.equal(boostEnvelope(5),0);assert.equal(boostEnvelope(4),1);
 assert.ok(boostEnvelope(.2)>0&&boostEnvelope(.2)<1);assert.ok(boostEnvelope(4.92)>0&&boostEnvelope(4.92)<1);
 assert.equal(segmentDistance([2,0,0],[0,0,0],[4,0,0]),0);assert.equal(segmentDistance([2,1,0],[0,0,0],[4,0,0]),1);
 const graph={nodes:[],out:[],E:[]},ids=new Map();
 for(let x=-8;x<=8;x++)for(let z=-60;z<=8;z++){const id=graph.nodes.length;graph.nodes.push({id,x,y:0,z});ids.set(`${x},${z}`,id);graph.out.push([]);}
 for(const n of graph.nodes)for(const [dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]]){
  const to=ids.get(`${n.x+dx},${n.z+dz}`);if(to===undefined)continue;
  graph.out[n.id].push(graph.E.length);graph.E.push({from:n.id,to,kind:0,len:1});
 }
 const disconnected={id:graph.nodes.length,x:0,y:0,z:-6.01};graph.nodes.push(disconnected);graph.out.push([]);
 const selected=pickupNodes(graph,{x:0,y:0,z:0},0,()=>true);
 assert.equal(selected.length,4);assert.equal(selected[0].x,0);assert.equal(selected[0].z,-6);
 assert.ok(!selected.includes(disconnected));assert.equal(pickupNodes(graph,{x:0,y:0,z:0},0,()=>false).length,0);
 const {gltf}=await fixture();let body;gltf.scene.traverse(n=>{if(n.name.startsWith('Body_mesh'))body=n;});
 const Vector3=gltf.scene.position.constructor,Geometry=body.geometry.constructor;
 class Material{constructor(o){Object.assign(this,o);}clone(){return new Material({...this});}}
 const Geom={Vector3,Group:gltf.scene.constructor,Mesh:body.constructor,Torus:Geometry,Box:Geometry,Basic:Material,BufferGeometry:Geometry,Float32Attribute:body.geometry.attributes.position.constructor};
 const node=()=>({style:{},hidden:false,append(){},appendChild(){}});
 global.document={head:node(),body:{...node(),dataset:{}},createElement:()=>node(),querySelector:()=>null};
 global.window={matchMedia:()=>({matches:false})};
 let mode='play';const c={pos:new Vector3(),vel:new Vector3(),onGround:true,state:'normal',yaw:0};
 const U={walkSpeed:4.6,sprintSpeed:6,fov:88,fovKick:16},game={NAV:graph,stats:{shots:0}},sky={c,U,Et:{reloadT:0},z:{over:false},Geom,ue:new Geom.Group(),Tt:{mark(){}},oe:()=>true,modeRef:()=>mode};
 const dash=createDash(sky,game);dash.reset(true);dash.placePickups(c.pos,0);
 assert.equal(dash.pickups.length,4);c.pos.fromArray(dash.pickups[0].position);dash.step(0);
 assert.equal(dash.remaining,5);assert.equal(game.stats.dashPickups,1);assert.equal(dash.pickups[0].cooldown,18);
 dash.step(.2);assert.equal(dash.speed(6),10.2);c.vel.z=-10.2;dash.frame(.5);
 assert.ok(dash.camera.distance>4.05);assert.ok(dash.fov(93)>105);assert.ok(dash.boost>.99);
 mode='pause';const paused=dash.remaining;dash.step(2);dash.frame(2);assert.equal(dash.remaining,paused);
 mode='play';c.pos.fromArray(dash.pickups[1].position);dash.step(0);assert.equal(dash.remaining,5);assert.equal(dash.speed(6),10.2,'collecting another ring refreshes duration without a speed dip or stacking');for(let i=0;i<51;i++)dash.step(.1);
 assert.equal(dash.remaining,0);assert.ok(Math.abs(c.vel.length()-6)<1e-8,'item speed returns smoothly to normal');
 assert.deepEqual(U,{walkSpeed:4.6,sprintSpeed:6,fov:88,fovKick:16},'settings are never overwritten');
 dash.reset(false);assert.ok(dash.pickups[0].cooldown>0,'respawn clears boost without restoring used pickups');
 dash.reset(true);assert.ok(dash.pickups.every(p=>p.cooldown===0));assert.equal(game.stats.dashPickups,0);
 console.log('PASS DASH: connected placements, swept collection, 5s/1.7x envelope, camera, pause, decay, respawn and settings preservation');
})().catch(e=>{console.error(e);process.exitCode=1;});
