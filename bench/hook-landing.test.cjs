const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
function fixture(floors) {
  const c = { pos: {x: 0, y: 3, z: 0}, vel: {x: 8, y: 4.5, z: 5},
    r: .32, h: 1.75, state: 'normal', onGround: false, jumpBuf: 0, edgeJump: true };
  const game = { c, U: {gravity: 20, hookSpeed: 18, walkSpeed:4.6}, z: {over: false}, fallY:-22,
    near: () => floors, oe: () => true, modeRef: () => 'play' };
  const window = {__skyInternals: game};
  vm.runInNewContext(fs.readFileSync('hook-landing.js', 'utf8'), {window, Math});
  return {c, game, assist: window.skyHookLanding};
}
const floor = {minX:-2,maxX:2,minZ:-30,maxZ:30,maxY:1,solid:true};
{
  const {c,assist,game} = fixture([floor]);
  assert.equal(assist.begin([0,2,0]),true);
  assert.ok(c.vel.x > 0 && c.vel.x < 8, 'shed excess normal speed');
  assert.equal(c.vel.z,5,'retain all safe along-platform momentum');
  assert.equal(c.vel.y,4.5,'keep the arrival arc');
  assert.equal(c.edgeJump,false,'automatic arrivals do not trigger ledge-grab animations');
  for(let i=0;i<150&&c.pos.y>floor.maxY;i++) {
    const dt=1/120; c.vel.x+=14*dt; c.vel.y-=game.U.gravity*dt;
    assist.step(dt); c.pos.x+=c.vel.x*dt; c.pos.z+=c.vel.z*dt; c.pos.y+=c.vel.y*dt;
  }
  assert.ok(c.pos.x<=floor.maxX-.3,'held outward input still reaches the destination');
  c.onGround=true;assist.step(1/120);assert.equal(assist.active,null);
}
{
  const {c,assist}=fixture([{...floor,minX:-30,maxX:30}]);
  assert.ok(assist.begin([0,2,0]));assert.equal(c.vel.x,8);assert.equal(c.vel.z,5);
  c.jumpBuf=.15;assist.step(1/120);assert.equal(assist.active,null,'intentional jump cancels guidance');
  assert.equal(c.vel.x,8);
}
{
  const lower={minX:4,maxX:20,minZ:-20,maxZ:20,maxY:-4,solid:true};
  const {c,assist}=fixture([floor,lower]);
  assert.ok(assist.begin([0,2,0]));
  assert.equal(assist.active.floor,lower,'any safe lower floor can be the destination');
  assert.equal(c.vel.x,8,'retain forward momentum when a later floor will catch the player');
  assert.equal(c.vel.z,5);
}
{
  const next={minX:4,maxX:20,minZ:16,maxZ:25,maxY:-4,solid:true};
  const {c,assist}=fixture([floor,next]);
  assert.ok(assist.begin());assert.equal(assist.active.floor,floor);
  c.vel.x=8;c.vel.z=16;
  assist.step(1/120);
  assert.equal(assist.active.floor,next,'input may lead to a different safe landing');
  assert.equal(c.vel.x,8);assert.equal(c.vel.z,16,'do not pull the player back to the old floor');
}
for(const bad of [{...floor,off:true},{...floor,solid:false},{...floor,maxY:-23}]) {
  const {c,assist}=fixture([bad]);assert.equal(assist.begin([0,2,0]),false);assert.equal(c.vel.x,8);
}
{
  const {c,assist,game}=fixture([floor]);game.oe=()=>false;
  assert.equal(assist.begin([0,2,0]),false,'never guide through a wall or ceiling');
  assert.equal(c.vel.x,8);
}
for(const file of ['index.html','canyon.html']) {
  const html=fs.readFileSync(file,'utf8');
  assert.ok(html.includes('r<1.6&&window.skyHookLanding?.begin(t)'), 'only successful automatic arrivals guide');
  assert.ok(html.includes('function X_(n){window.skyHookLanding?.cancel();'), 'next hook and manual release clear previous guidance');
  assert.ok(html.includes('function N_(){window.skyHookLanding?.cancel();'), 'jump takes control immediately');
  assert.ok(html.includes('function xo(n){window.skyHookLanding?.cancel();'), 'restart/respawn clears previous arrival');
  assert.ok(html.includes('window.skyHookLanding?.step(n);window.skyEdgeAssist?.steer'));
}
console.log('PASS automatic arrival, held input, tangent momentum, free jump, blocked/absent destinations and both map integration');
