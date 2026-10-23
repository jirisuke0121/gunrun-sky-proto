// Dead-end check on the game's navigation graph.
// A "platform" is a set of high nodes (y >= 1.5) joined by plain walking.
// Exits = distinct places a human can leave to with one move; zombie
// entrances = distinct places zombies come in from. Narrow nodes (beams)
// report the walking distance to the nearest exit.
window.__exits = () => {
  const G = window.__game, N = G.NAV, nodes = N.nodes, n = nodes.length, U = window.__skyInternals.U;
  const comp = new Int32Array(n).fill(-1); let C = 0;
  const walk = Array.from({ length: n }, () => []);
  for (const e of N.E) if (e.kind === 0) walk[e.from].push(e.to);
  for (let i = 0; i < n; i++) {
    if (comp[i] >= 0) continue; const st = [i]; comp[i] = C;
    while (st.length) { const u = st.pop(); for (const v of walk[u]) if (comp[v] < 0) { comp[v] = C; st.push(v) } }
    C++;
  }
  const size = new Int32Array(C); for (let i = 0; i < n; i++) size[comp[i]]++;
  const exits = Array.from({ length: C }, () => new Set()), zin = Array.from({ length: C }, () => new Set()), spots = Array.from({ length: C }, () => new Set());
  const exitNode = new Uint8Array(n);
  for (const e of N.E) {
    const a = comp[e.from], b = comp[e.to]; if (a === b) continue;
    exits[a].add(b); exitNode[e.from] = 1; spots[a].add(Math.round(nodes[e.to].x / 4) + ',' + Math.round(nodes[e.to].z / 4) + ',' + b);
    if (e.kind !== 6) zin[b].add(a);
  }
  for (const [u, v] of (window.__extraMoves ? window.__extraMoves() : [])) { const a = comp[u], b = comp[v]; if (a === b) continue; exits[a].add(b); exitNode[u] = 1; spots[a].add(Math.round(nodes[v].x / 4) + ',' + Math.round(nodes[v].z / 4) + ',' + b); }
  // narrow nodes: fewer than 3 walkable neighbours across the beam
  const out = { platforms: [], narrow: [] };
  for (let c = 0; c < C; c++) {
    const members = []; for (let i = 0; i < n; i++) if (comp[i] === c) members.push(i);
    const y = nodes[members[0]].y; if (y < 1.5 || members.length < 2) continue;
    const xs = members.map(i => nodes[i].x), zs = members.map(i => nodes[i].z);
    out.platforms.push({ c, y: +y.toFixed(1), size: members.length, x: [Math.min(...xs), Math.max(...xs)], z: [Math.min(...zs), Math.max(...zs)], exits: exits[c].size, spots: spots[c].size, zIn: zin[c].size });
  }
  // walking distance to nearest exit node for narrow nodes (BFS on walk graph)
  const dist = new Float64Array(n).fill(Infinity), q = [];
  for (let i = 0; i < n; i++) if (exitNode[i]) { dist[i] = 0; q.push(i) }
  for (let h = 0; h < q.length; h++) { const u = q[h]; for (const v of walk[u]) { const d = dist[u] + Math.hypot(nodes[v].x - nodes[u].x, nodes[v].z - nodes[u].z); if (d < dist[v]) { dist[v] = d; q.push(v) } } }
  for (let i = 0; i < n; i++) {
    const p = nodes[i]; if (p.y < 1.5) continue;
    const nb = walk[i].filter(j => Math.abs(nodes[j].x - p.x) + Math.abs(nodes[j].z - p.z) <= 1.01).length;
    if (nb <= 2 && dist[i] > 9) out.narrow.push([p.x, p.y, p.z, +dist[i].toFixed(1)]);
  }
  out.deadEnds = out.platforms.filter(p => p.spots <= 1);
  out.summary = { platforms: out.platforms.length, deadEnds: out.deadEnds.length, narrowFar: out.narrow.length };
  return out;
};
