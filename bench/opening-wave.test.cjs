const assert=require('node:assert/strict');
const wave=require('../opening-wave.js');
const node=(id,x,y,z)=>({id,x,y,z});
const player={x:-30,y:0,z:0};
const nodes=[node(1,-10,8,0),node(2,-8,8,2),node(3,12,8,5),node(4,0,0,0),node(5,-5,8,25),node(6,-30,8,0),node(7,3,5,1)];
// Central high ground only, a useful distance from the player, spread apart.
const first=wave.pick(nodes,player,[],()=>0);assert.equal(first.id,1);
assert.deepEqual(wave.pick(nodes,player,[first],()=>0).id,3,'taken spots exclude neighbours within 6 m');
assert.equal(wave.pick(nodes,{x:-10,y:0,z:1},[],()=>0)?.id!==1,true,'too close to the player is skipped');
assert.equal(wave.pick(nodes.filter(n=>n.y<7||n.id===4),player,[],()=>0),null,'nothing on the high ground: the normal spawn is used');
assert.equal(wave.pick(nodes,player,[],()=>0,n=>n.id!==1).id!==1,true,'game checks (reachable, outdoors) filter candidates');
assert.deepEqual([5,4,3,2,1,0].map(wave.highCount),[2,2,1,1,0,0],'2 of 4+ opening zombies come from the high ground, never all of them');
// spawn(): refuses outside challenge runs and when the slot or the point is not allowed.
const game={NAV:{nodes,out:{1:[1,2,3],2:[1,2,3],3:[1,2,3],4:[1,2,3],5:[1,2,3],6:[1,2,3],7:[1,2,3]}},P:{pos:player},FIELD:{1:50,2:50,3:50,4:50,5:50,6:50,7:50},zombies:[],Zombie:class{constructor(x,y,z){Object.assign(this,{x,y,z})}}};
const challenge=(over={})=>({profile:()=>({}),spawnAllowed:()=>true,reserve:()=>true,...over});
wave.begin();assert.equal(wave.spawn(0,5,game,challenge()),true);
assert.equal(game.zombies[0].dropper,true);assert.equal(game.zombies[0].born,'opening');assert.equal(game.zombies[0].flank,false);
assert.equal(wave.spawn(1,5,game,challenge()),true);assert.equal(wave.spawn(2,5,game,challenge()),false,'only two come from the high ground');
wave.begin();assert.equal(wave.spawn(0,5,game,challenge({profile:()=>null})),false,'no challenge profile (practice/mission): normal spawning');
assert.equal(wave.spawn(0,5,game,challenge({reserve:()=>false})),false,'no free slot');
assert.equal(wave.spawn(0,5,game,challenge({spawnAllowed:()=>false})),false,'indoor/spacing rules still apply');
wave.begin();assert.equal(wave.spawn(0,3,{...game,zombies:[]},challenge()),true);assert.equal(wave.spawn(1,3,{...game,zombies:[]},challenge()),false,'with 3 opening zombies only one is placed on the high ground');
console.log('PASS opening wave: high-ground choice, count limits, safe fallbacks');
