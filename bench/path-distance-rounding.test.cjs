const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function reference(graph, seeds, cost, limit) {
  const field = new Float32Array(graph.nodes.length).fill(Infinity);
  const visited = new Set();
  for (const seed of seeds) if (seed >= 0) field[seed] = 0;
  while (true) {
    let node = -1, distance = Infinity;
    for (let i = 0; i < field.length; i++) {
      if (!visited.has(i) && field[i] < distance) { node = i; distance = field[i]; }
    }
    if (node < 0 || distance > limit) break;
    visited.add(node);
    for (const id of graph.inn[node]) {
      const edge = graph.E[id], next = Math.fround(distance + cost(edge));
      if (next < field[edge.from]) field[edge.from] = next;
    }
  }
  return field;
}

for (const file of ['index.html', 'canyon.html']) {
  const html = fs.readFileSync(file, 'utf8');
  const start = html.indexOf('var io=class');
  const end = html.indexOf('var c={pos:', start);
  assert.ok(start >= 0 && end > start, `${file}: heap and search are present`);
  const graph = { nodes: Array.from({ length: 6 }, (_, id) => ({ id })), E: [], inn: Array.from({ length: 6 }, () => []) };
  const door = { off: true };
  const add = (from, to, len, extra = {}) => {
    const id = graph.E.length;
    graph.E.push({ from, to, len, ...extra }); graph.inn[to].push(id);
  };
  // These alternatives round upward to the same stored value. Without the fix,
  // identical distances re-enter the heap and expand outgoing edges repeatedly.
  for (let layer = 0; layer < 3; layer++) for (let copy = 0; copy < 8; copy++) add(layer + 1, layer, 1.00000008);
  add(4, 0, 3, { door }); add(5, 4, 2, { jamT: 20 }); add(5, 3, 2);
  const context = vm.createContext({ lt: graph });
  vm.runInContext(html.slice(start, end) + '\nthis.search = so;', context);
  let time = 0;
  const cost = edge => edge.len + (edge.door && !edge.door.off ? 14 : 0) + (edge.jamT > time ? 80 : 0);
  for (const state of ['initial', 'door-closed', 'jam-expired']) {
    if (state === 'door-closed') door.off = false;
    if (state === 'jam-expired') time = 21;
    for (const seeds of [[0], [1], [-1, 0, 4]]) for (const limit of [1, 200, 400, 600]) {
      let visits = 0;
      const actual = new Float32Array(graph.nodes.length);
      context.search(seeds, edge => { visits++; return cost(edge); }, limit, actual);
      assert.deepEqual(actual, reference(graph, seeds, cost, limit), `${file}: ${state}, seeds ${seeds}, limit ${limit}`);
      assert.ok(visits <= graph.E.length, `${file}: unchanged distances must not expand the same node again (${visits} edge visits)`);
    }
  }
  console.log(`${file}: Float32 duplicate-expansion and distance cases passed`);
}
