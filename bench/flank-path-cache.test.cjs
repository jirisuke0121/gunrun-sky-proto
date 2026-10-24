const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

for (const file of ['canyon.html', 'dev/canyon.html']) {
  const html = fs.readFileSync(file, 'utf8');
  const start = html.indexOf('const flankDoorRefs=');
  const end = html.indexOf('function go()', start);
  assert.ok(start >= 0 && end > start, `${file}: cache helper missing`);

  const door = { off: true };
  const edges = [{ door }, { jamT: 0 }, {}];
  let searches = 0;
  const context = vm.createContext({
    lt: { E: edges }, Vi: 4, ce: 0, oo: () => 1,
    so: (starts, cost, limit, field) => {
      searches++;
      field.fill(starts[0] + searches);
    },
  });
  vm.runInContext(html.slice(start, end) + '\nthis.path = flankPath; this.jams = flankJamEdges; this.fields = flankPathFields;', context);

  const first = context.path(1);
  assert.equal(context.path(1), first, `${file}: same target and costs should share`);
  assert.equal(searches, 1);
  door.off = false;
  const open = context.path(1);
  assert.notEqual(open, first, `${file}: door change must use another field`);
  assert.equal(searches, 2);
  edges[1].jamT = 20;
  context.jams.add(1);
  const jammed = context.path(1);
  assert.equal(searches, 3);
  assert.equal(context.path(1), jammed);
  context.ce = 21;
  assert.equal(context.path(1), open, `${file}: jam expiry must return to the unjammed field`);
  assert.equal(searches, 3);
  assert.equal(context.path(2), context.path(2), `${file}: another target should share its own field`);
  assert.equal(searches, 4);
  for (let target = 3; target < 15; target++) context.path(target);
  assert.ok(context.fields.size <= 8, `${file}: cache should be bounded`);
  console.log(`${file}: dynamic cache cases passed`);
}
