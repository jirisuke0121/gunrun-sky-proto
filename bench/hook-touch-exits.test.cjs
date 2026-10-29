const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({ globalThis: {}, Math });
vm.runInContext(fs.readFileSync('hook-targeting.js', 'utf8'), context);
const create = context.globalThis.SkyHookAssist.create;
const player = { pos: { x: 0, y: 0, z: 0 }, eye: 1.6, yaw: 0, pitch: 0, state: 'normal' };
const anchors = [[9, 1.6, -8]];
let isTouch = true, blocked = false;
const assist = create({ player, settings: { hookRange: 22 }, anchors, touch: () => isTouch,
  screen: () => ({ width: 844, height: 390 }),
  project: a => ({ x: a[0] / 12, y: 0, z: a[2] < 0 ? 0 : 2 }), occluded: () => blocked });
assert.equal(assist.target(), anchors[0], '48 degrees is inside the expanded touch recognition cone');
isTouch = false;
assert.equal(assist.target(), null, 'desktop keeps the former 35 degree cone');
isTouch = true;
assert.equal(assist.tapRadius(), 104);
const x = (9 / 12 + 1) * 844 / 2;
assert.equal(assist.pick(x - 95, 195), anchors[0], 'tap 95px away is accepted');
assert.equal(assist.pick(x - 110, 195), null, 'outside the enlarged target still misses');
isTouch = false;
assert.equal(assist.pick(x - 95, 195), null);
isTouch = true;
blocked = true;
assert.equal(assist.target(), null);
assert.equal(assist.pick(x, 195), null);
assert.equal(assist.valid(anchors[0]), false, 'latched touch cannot launch through a newly intervening wall');
blocked = false;
const saved = anchors[0]; anchors[0] = [0, 1.6, -23];
assert.equal(assist.target(), null, 'world distance limit is enforced');
anchors[0] = [0, 1.6, 10];
assert.equal(assist.target(), null, 'no target behind the player');
anchors[0] = [0, 1.6, -2];
assert.equal(assist.target(), null, 'too-close targets stay invalid');
anchors[0] = saved;
assert.equal(assist.valid(saved), true);
player.state = 'ledge'; assert.equal(assist.target(), null);
player.state = 'normal';

// A small camera drift keeps a selected mark, but not across a wall/offscreen.
anchors.splice(0, anchors.length, [-1, 1.6, -10], [1, 1.6, -10]);
player.yaw = 0.01;
const first = assist.target(); player.yaw = -0.01;
assert.equal(assist.target(), first);
anchors.splice(anchors.indexOf(first), 1);
assert.notEqual(assist.target(), first, 'editor changes cannot leave a stale target');

for (const file of ['index.html', 'canyon.html']) {
  const html = fs.readFileSync(file, 'utf8');
  assert.ok(html.includes('getSkyHookAssist().pick(x,y)'));
  assert.ok(html.includes('hook:G_(__CX(n),__CY(n)),moved:0'));
  assert.ok(html.includes('&&yd(t.x,t.y,t.hook)'));
  assert.ok(html.includes('Math.max(t.moved,Math.hypot(__CX(n)-t.x,__CY(n)-t.y))<28'));
}

const solids = [
  [-70, -.4, -12, -22, 0, 18],
  [-63, 0, 11, -60, 5.5, 18], [-58, 0, 12, -53.5, 4.4, 18],
  [-51, 0, 11, -48, 5, 18], [-60, 0, -1, -52, 3, 6],
].map(([minX,minY,minZ,maxX,maxY,maxZ]) => ({minX,minY,minZ,maxX,maxY,maxZ,type:'slab'}));
// Central corridor walls are required by the current town builder, even
// though the assertions below exercise the warehouse escape loops.
solids.push(...[-14,13].map(minX=>({minX,maxX:minX+1,minY:0,maxY:8,minZ:-14,maxZ:14,type:'mono'})));
// Match the real north facade, including the existing ground doorway lintel.
solids.push(...[[-13,-1.5,0],[-1.5,1.5,3.2],[1.5,13,0]].map(([minX,maxX,minY])=>({minX,maxX,minY,maxY:8,minZ:-14,maxZ:-13,type:'mono'})));
const window = {};
vm.runInNewContext(fs.readFileSync('town-heights.js', 'utf8'), { window, Math });
const ne = (minX,minY,minZ,maxX,maxY,maxZ,type) => { const b = {minX,minY,minZ,maxX,maxY,maxZ,type}; solids.push(b); return b; };
window.buildSkyTowers({ ne, Mh() {}, ld() {}, us: [], mo: [], jn: solids });
const clear = (x,y,z) => !solids.some(b => x + .32 > b.minX && x - .32 < b.maxX && z + .32 > b.minZ && z - .32 < b.maxZ && y < b.maxY && y + 1.8 > b.minY);
for (const exit of window.skyIndoorExits) {
  const route = [exit.from, ...exit.route];
  for (let i=1;i<route.length;i++) for (let t = 0; t <= 1.001; t += .025) {
    const x = route[i-1][0] + (route[i][0] - route[i-1][0]) * t;
    const z = route[i-1][2] + (route[i][2] - route[i-1][2]) * t;
    assert.ok(clear(x, .01, z), exit.id + ' leads all the way to clear exterior ground');
    assert.ok(solids.some(b=>x>=b.minX&&x<=b.maxX&&z>=b.minZ&&z<=b.maxZ&&b.maxY===0), exit.id+' has ground below the entire escape loop');
  }
}
assert.equal(clear(-62, .01, 8), false, 'intact wall remains solid');
assert.equal(clear(-57.3, 2.6, 8), false, 'lintel and roof remain solid');
assert.equal(clear(-61.5, .01, 14), false, 'the adjacent building was not erased');
console.log('PASS touch hook cone/radius, moving-target validation, wall/range bounds, target stability, two indoor escape openings');
