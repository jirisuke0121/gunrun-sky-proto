const assert=require('node:assert/strict');
const spots=require('../start-spots.js');
const {SPOTS,RULE,CENTER}=spots;
assert.ok(SPOTS.length>=8,'enough spots for the start to vary');
assert.equal(new Set(SPOTS.map(s=>s.id)).size,SPOTS.length,'unique ids');
for(const s of SPOTS){
  assert.ok(s.y>=RULE.minY,`${s.id}: high ground (>= ${RULE.minY} m)`);
  const dx=CENTER.x-s.x,dz=CENTER.z-s.z,L=Math.hypot(dx,dz);
  // yaw convention of the game: forward = (-sin yaw, -cos yaw)
  assert.ok((-Math.sin(s.yaw)*dx/L)+(-Math.cos(s.yaw)*dz/L)>.999,`${s.id}: faces the middle of the map`);
}
// Spread: no two spots on the same level within 12 m (the point of randomising is different views and routes).
for(const a of SPOTS)for(const b of SPOTS)if(a<b&&Math.abs(a.y-b.y)<3)assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>=12,`${a.id}/${b.id} too close`);
// Seeded choice: every spot appears, never twice in a row.
let seed=7;const rnd=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const seen=new Set();let prev=null;
for(let i=0;i<400;i++){const s=spots.choose(rnd,prev);assert.notEqual(s.id,prev,'no immediate repeat');seen.add(s.id);prev=s.id}
assert.equal(seen.size,SPOTS.length,'all spots are reachable by the draw');
// Where it applies.
const env=(search,extra={})=>({location:{search},navigator:{webdriver:false},...extra});
assert.equal(spots.enabled(env('')),true,'normal players: on');
assert.equal(spots.enabled(env('?start=default')),false,'?start=default turns it off');
assert.equal(spots.enabled(env('',{SKY_CANYON_MAP:{}})),false,'canyon: off');
assert.equal(spots.enabled(env('',{skyPracticeMode:true})),false,'practice: off');
assert.equal(spots.enabled(env('',{skyOwnerReplay:true})),false,'owner replay: off');
const bot={location:{search:''},navigator:{webdriver:true}};
assert.equal(spots.enabled(bot),false,'automated browsers keep the fixed start');
assert.equal(spots.enabled({...bot,location:{search:'?random_start=1'}}),true,'tests can opt in');
const forced=spots.pick({...bot,location:{search:`?start_spot=${SPOTS[3].id}`}});
assert.deepEqual([forced.x,forced.y,forced.z],[SPOTS[3].x,SPOTS[3].y,SPOTS[3].z],'?start_spot forces one spot');
assert.equal(spots.pick(bot),null,'disabled pick returns null (ordinary start)');
console.log('PASS start-spots: %d high-ground spots, rule, spread, draw, switches',SPOTS.length);
