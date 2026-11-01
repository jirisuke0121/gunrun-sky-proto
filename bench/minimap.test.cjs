const assert=require('node:assert/strict');
(async()=>{
 const {createMapModel,projectPoint,liveMarkers,levelAt,localViewport,nearbyMarkers,rotateMapPoint,LOCAL_MAP_SIZE}=await import('../minimap-model.js');
 const solids=[{minX:-20,maxX:20,minZ:-10,maxZ:10,minY:-2,maxY:0,type:'slab'},
  {minX:-2,maxX:2,minZ:-5,maxZ:5,minY:7.7,maxY:8,type:'beam'},
  {minX:3,maxX:4,minZ:2,maxZ:3,minY:0,maxY:.3,walkStair:{}},
  {minX:3,maxX:4,minZ:2,maxZ:3,minY:0,maxY:2,type:'door',off:false},
  {minX:NaN,maxX:4,minZ:2,maxZ:3,minY:0,maxY:1}];
 const before=solids.map(b=>({...b})),m=createMapModel(solids);
 assert.deepEqual(solids,before,'map generation must not mutate collision data');
 assert.equal(m.boxes.length,3);assert.deepEqual(m.levels,[0,4,8]);
 assert.equal(m.boxes.some(b=>b.type==='door'),false,'dynamic doors must not be baked into terrain');
 assert.ok(m.pixelWidth>m.pixelHeight,'preserve a wide map without square padding');
 const nw=projectPoint({x:-20,z:-10},m.bounds),se=projectPoint({x:20,z:10},m.bounds);
 assert.ok(nw.x<se.x&&nw.y<se.y,'north (-Z) is up');
 assert.ok(nw.x>0&&se.x<m.pixelWidth&&nw.y>0&&se.y<m.pixelHeight);
 assert.equal(levelAt(3.9,m.levels),4);assert.equal(levelAt(0,m.levels),0);assert.equal(levelAt(80,m.levels),8);
 const p={pos:{x:0,y:4,z:0}},enemy=(x,y,z,extra={})=>({pos:{x,y,z},hp:8,...extra});
 const enemies=[enemy(-19,4,-9),enemy(19,8,9,{stun:4,spawnT:.8}),enemy(0,0,0,{stalker:true}),
  enemy(1,4,1,{dead:true}),enemy(1,4,1,{hp:0}),enemy(1,4,1,{remove:true})];
 const markers=liveMarkers(enemies,p,m.bounds);
 assert.equal(markers.length,3,'all live enemies, including distant/occluded/spawning/stunned enemies');
 assert.deepEqual(markers.map(x=>x.relative),['same','above','below']);assert.equal(markers[2].stalker,true);
 const view=localViewport({x:10,z:-8});assert.equal(view.span,40);
 assert.deepEqual(projectPoint({x:10,z:-8},view,LOCAL_MAP_SIZE),{x:128,y:128},'player is centred');
 const near=nearbyMarkers(markers,view);assert.equal(near.length,2,'local view excludes distant positions, retaining occluded/other-floor enemies in range');
 assert.ok(near.every(m=>m.x>=0&&m.x<=256&&m.y>=0&&m.y<=256));
 assert.equal(nearbyMarkers([{world:{x:29,z:11}}],view).length,0,'radar corners outside the 20m circle are clipped');
 const west=rotateMapPoint({x:96,y:128},Math.PI/2);assert.ok(Math.abs(west.x-128)<1e-8&&Math.abs(west.y-96)<1e-8,'west heading rotates a western enemy to the top');
 const north=rotateMapPoint({x:128,y:96},Math.PI/2);assert.ok(Math.abs(north.x-160)<1e-8&&Math.abs(north.y-128)<1e-8,'terrain and marker rotation share heading');
 const edge=localViewport({x:m.bounds.minX,z:m.bounds.minZ});assert.ok(edge.minX<m.bounds.minX,'map edge does not shift player from centre');
 enemies[0].pos.x=12;assert.equal(liveMarkers(enemies,p,m.bounds)[0].world.x,12,'positions stay live');
 enemies[0].dead=true;assert.equal(liveMarkers(enemies,p,m.bounds).length,2,'dead markers disappear');
 assert.throws(()=>createMapModel([]),/finite runtime terrain/);
 console.log('PASS minimap geometry, Unity 40m range, centred local projection/edge, height bands and live enemy lifecycle');
})().catch(e=>{console.error(e);process.exitCode=1});
