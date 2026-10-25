const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

for (const file of ['canyon.html', 'index.html']) {
  const html = fs.readFileSync(file, 'utf8');
  const canyon = file.includes('canyon');
  const start = html.indexOf(canyon ? 'const flankDoorRefs=' : 'const pathDoorRefs=');
  const end = html.indexOf('function bi(', start);
  assert.ok(start >= 0 && end > start, `${file}: nav refresh code missing`);
  assert.equal((html.match(/c\.node=dn\(c\.pos\.x,c\.pos\.y\+\.1,c\.pos\.z\),pathFieldKey=null,go\(\)/g) || []).length, 3,
    `${file}: play and mission restarts must refresh the fields`);
  if (!canyon) assert.ok(html.includes('y.jamT=ce+20,pathJamEdges.add(this.edge)'), `${file}: jams must be tracked`);

  const door = { off: true };
  const edges = [{ door }, { jamT: 0 }, {}];
  const player = { pos: { x: 1.2, y: 0, z: 0 }, vel: { x: 0, z: 0 }, node: 1, state: 'normal', ladder: null };
  const near = new Float32Array(5), long = new Float32Array(5);
  let searches = 0;
  const context = vm.createContext({
    lt: { E: edges }, Vi: 5, ce: 0, c: player, Vn: near, Ld: long,
    dn: (x) => Math.floor(x), oo: () => 1, Pd: () => 2,
    so: (starts, cost, limit, field) => {
      searches++;
      field.fill(starts[0] + (door.off ? 0 : 10) + (edges[1].jamT > context.ce ? 100 : 0));
    },
  });
  vm.runInContext(html.slice(start, end), context);
  const go = () => vm.runInContext('go()', context);
  const jam = () => vm.runInContext(canyon ? 'flankJamEdges.add(1)' : 'pathJamEdges.add(1)', context);

  go();
  assert.equal(searches, 2, `${file}: first refresh builds both fields`);
  assert.equal(near[0], 1);
  go();
  player.pos.x = 1.4; go();
  assert.equal(searches, 2, `${file}: same target and graph reuse both fields`);

  player.pos.x = 2.1; go();
  assert.equal(searches, 4, `${file}: new target refreshes both fields`);
  assert.equal(near[0], 2);
  door.off = false; go();
  assert.equal(searches, 6, `${file}: door change refreshes both fields`);
  assert.equal(near[0], 12);
  edges[1].jamT = 20; jam(); go();
  assert.equal(searches, 8, `${file}: new jam refreshes both fields`);
  assert.equal(near[0], 112);
  context.ce = 21; go();
  assert.equal(searches, 10, `${file}: expired jam refreshes both fields`);
  assert.equal(near[0], 12);

  player.state = 'ladder';
  player.ladder = { x: 3.2, nx: 0, y1: 1, z: 0, nz: 0 };
  go();
  assert.equal(searches, 12, `${file}: ladder destination refreshes both fields`);
  assert.equal(near[0], 13);
  vm.runInContext('pathFieldKey=null', context);
  go();
  assert.equal(searches, 14, `${file}: restart forces a fresh field`);
  console.log(`${file}: nav refresh cases passed`);
}
