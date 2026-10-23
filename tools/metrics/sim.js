// Chase simulator on the game's own navigation graph.
// One human (profile: skilled / sloppy / ground) vs zombies that follow the
// game's sight rules (hear 8 m, see 40 m unless blocked, lose after 0.6 s
// hidden, sense again after 4 s). Returns survival seconds per run.
window.__sim = (opts = {}) => {
  const G = window.__game, N = G.NAV, I = window.__skyInternals, U = I.U, nodes = N.nodes, n = nodes.length;
  const zs = U.zombieSpeed * 1.05, Jc = U.sprintSpeed;
  const zc = e => e.kind === 6 ? Infinity : e.kind === 7 ? 1.4 + e.len / zs : e.kind === 5 ? (e.climb || 4) / (U.zombieLadder || 2) + .8 : e.kind === 1 ? .9 + e.climb * .45 + e.len / zs : e.kind === 3 ? e.len / (zs * .35) : e.len / zs;
  const pc = e => e.kind === 6 ? e.len / Jc + .15 : e.kind === 5 ? (e.climb || 4) / U.ladderSpeed + .3 : e.kind === 1 ? (e.climb <= U.mantleReach ? .35 : .6) + e.len / Jc : e.kind === 3 ? e.len / 7 : e.len / Jc;
  const J = I.jn.filter(b => !b.off && b.solid !== false);
  const occ = (ax, ay, az, bx, by, bz) => { for (const b of J) { let t0 = 0, t1 = 1; const o = [ax, ay, az], dd = [bx - ax, by - ay, bz - az], mn = [b.minX, b.minY, b.minZ], mx = [b.maxX, b.maxY, b.maxZ]; let ok = true; for (let k = 0; k < 3; k++) { if (Math.abs(dd[k]) < 1e-9) { if (o[k] < mn[k] || o[k] > mx[k]) { ok = false; break } } else { let ta = (mn[k] - o[k]) / dd[k], tb = (mx[k] - o[k]) / dd[k]; if (ta > tb) [ta, tb] = [tb, ta]; t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) { ok = false; break } } } if (ok && t1 > 0.02 && t0 < 0.98) return true } return false };
  // edges: [to, cost, kind]
  const P = Array.from({ length: n }, () => []), Z = Array.from({ length: n }, () => []), ZR = Array.from({ length: n }, () => []);
  for (const e of N.E) { P[e.from].push([e.to, pc(e), e.kind, e.len, e.climb || 0, e.fall || 0]); const z = zc(e); if (z < Infinity) { Z[e.from].push([e.to, z]); ZR[e.to].push([e.from, z]); } }
  if (window.__skyOldTown) { // wall kick-up, player only
    const JJ = I.jn.filter(b => !b.off && b.type !== 'prop' && b.type !== 'rail'), mr = U.mantleReach;
    for (const q of nodes) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const px = q.x + dx * .9, pz = q.z + dz * .9, feet = q.y + .9; let top = -1e9;
      for (const b of JJ) if (px > b.minX && px < b.maxX && pz > b.minZ && pz < b.maxZ && b.minY < feet + 1.2 && b.maxY > feet + .4) top = Math.max(top, b.maxY);
      const h = top - feet; if (!(h > mr + .05 && h <= mr + 1.6)) continue;
      const v = G.nodeAt(px + dx * .6, top + .1, pz + dz * .6); if (v < 0 || Math.abs(nodes[v].y - top) > .3) continue;
      P[q.id].push([v, 1.1, 'kick', 1, h, 0]);
    }
  }
  for (const [u, v, c, k] of (window.__extraMoves ? window.__extraMoves() : [])) P[u].push([v, c, k, 1, 0, 0]);
  // heap Dijkstra; adj entries [to, cost, ...]; filter(edge) -> bool
  function dij(adj, srcs, limit, filter, prev) {
    const d = new Float64Array(n).fill(Infinity), h = [];
    const push = (x, i) => { h.push([x, i]); let k = h.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (h[p][0] <= h[k][0]) break;[h[p], h[k]] = [h[k], h[p]]; k = p } };
    const pop = () => { const t = h[0], l = h.pop(); if (h.length) { h[0] = l; let k = 0; for (; ;) { let a = 2 * k + 1, b = a + 1, m = k; if (a < h.length && h[a][0] < h[m][0]) m = a; if (b < h.length && h[b][0] < h[m][0]) m = b; if (m === k) break;[h[m], h[k]] = [h[k], h[m]]; k = m } } return t };
    for (const [s, t0] of srcs) if (t0 < d[s]) { d[s] = t0; push(t0, s) }
    while (h.length) { const [x, i] = pop(); if (x > d[i] || x > limit) continue; for (const ed of adj[i]) { if (filter && !filter(ed)) continue; const j = ed[0], y = x + ed[1]; if (y < d[j]) { d[j] = y; if (prev) prev[j] = i; push(y, j) } } }
    return d;
  }
  // zombie-reachable set from a central ground node (for spawns and starts)
  const hub = nodes.reduce((a, q) => Math.abs(q.y) < .1 && Math.hypot(q.x, q.z + 20) < Math.hypot(a.x, a.z + 20) ? q : a, nodes[0]).id;
  const zReach = dij(Z, [[hub, 0]], 1e9); const reach = nodes.filter(q => zReach[q.id] < Infinity);

  const esc = new Float64Array(n);
  for (let i = 0; i < n; i++) { let c = 0; for (const ed of P[i]) if (ed[2] === 6 || ed[2] === 'kick' || ed[2] === 'hook' || ed[2] === 'zip' || (ed[2] === 7 && ed[5] >= 2)) c++; esc[i] = c }
  const esc2 = new Float64Array(n); for (let i = 0; i < n; i++) { let c = esc[i]; for (const ed of P[i]) if (ed[2] === 0) c += esc[ed[0]] * .5; esc2[i] = Math.min(6, c) }
  const PROF = {
    skilled: { H: 1.5, top: 2, commit: .2, w: 1.5, ok: (k, len) => k === 6 ? .97 : k === 'kick' ? .95 : 1, edge: () => true },
    sloppy: { H: 2, top: 5, commit: .6, w: .5, ok: (k, len) => k === 6 ? Math.max(.55, .9 - Math.max(0, len - 3) * .07) : k === 'kick' ? .75 : 1, edge: () => true },
    ground: { H: 4, top: 2, commit: .4, w: 0, ok: () => 1, edge: ed => ed[2] === 0 || ed[2] === 2 || ed[2] === 7 || (ed[2] === 1 && ed[4] <= 1.35) },
  };
  const ZM = opts.zMul || 1; const dbg = window.__simDbg = [];
  if (opts.prof) for (const k in opts.prof) Object.assign(PROF[k], opts.prof[k]);
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pos = ent => { const a = nodes[ent.node]; if (ent.to < 0) return [a.x, a.y, a.z]; const b = nodes[ent.to], f = Math.min(1, ent.t / ent.c); return [a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f] };

  function match(profile, s0) {
    seed = s0; const pr = PROF[profile];
    const start = reach[Math.floor(rnd() * reach.length)].id;
    const pl = { node: start, to: -1, t: 0, c: 1, stun: 0, goal: -1, commitUntil: 0 };
    const zomb = []; let nextSpawn = 0;
    let dir = [0, 0], quiet = 0, nextSurge = 40, stalkerOn = false;
    const spawnAt = (q, extra = {}) => zomb.push(Object.assign({ node: q.id, to: -1, t: 0, c: 1, known: true, last: pl.node, hideT: 0, lostT: 0, visT: 0, mul: .85 + rnd() * .3, flank: rnd() < (U.flankShare ?? .5) }, extra));
    const spawn = (ahead = rnd() < (U.aheadShare ?? .4), dmin = 25, dmax = 60) => { const pp = nodes[pl.node]; for (let k = 0; k < 300; k++) { const q = reach[Math.floor(rnd() * reach.length)]; const dx = q.x - pp.x, dz = q.z - pp.z, d = Math.hypot(dx, dz); if (d < dmin || d > dmax) continue; if (ahead && (dx * dir[0] + dz * dir[1]) < d * .5) continue; spawnAt(q); return } };
    for (let k = 0; k < 6; k++) spawn(false); nextSpawn = 5;
    const cache = new Map(); let lostTime = 0, falls = 0, tricks = 0;
    const dt = .1;
    for (let T = 0; T < 120; T += dt) {
      if (T >= nextSpawn && zomb.length < (U.maxZombies || 18)) { spawn(); nextSpawn += 5 }
      if (T >= nextSurge) { for (let k = 0; k < 3 && zomb.length < (U.maxZombies || 18) + 3; k++) spawn(true, 18, 40); nextSurge += (U.surgeEvery || 40) }
      if (!stalkerOn && T >= (U.stalkerAt || 20)) { stalkerOn = true; const pp = nodes[pl.node]; for (let k = 0; k < 300; k++) { const q = reach[Math.floor(rnd() * reach.length)]; if (Math.hypot(q.x - pp.x, q.z - pp.z) > 30) { spawnAt(q, { stalker: true, mul: (U.stalkerSpeed || 7.6) / U.zombieSpeed, flank: false }); break } } }
      if (quiet >= (U.paceGap || 12)) { quiet = 0; spawn(true, 12, 20); spawn(true, 12, 20) }
      if (T - (cache.t || 0) > .5) { cache.clear(); cache.t = T }
      const P0 = pos(pl);
      // --- player
      if (pl.stun > 0) pl.stun -= dt;
      else if (pl.to < 0) {
        const tp = dij(P, [[pl.node, 0]], pr.H, pr.edge, null);
        const srcs = zomb.filter(z => { const q = pos(z); return Math.hypot(q[0] - P0[0], q[2] - P0[2]) < 35 }).map(z => [z.to >= 0 ? z.to : z.node, z.to >= 0 ? Math.max(0, z.c - z.t) / (z.mul * ZM) : 0]);
        const tz = dij(Z, srcs, 20, null, null);
        const cand = [];
        for (let i = 0; i < n; i++) if (tp[i] <= pr.H) { const m = Math.min(tz[i], 12) - tp[i] + pr.w * esc2[i]; cand.push([m + rnd() * .01, i]) }
        cand.sort((a, b) => b[0] - a[0]);
        let goal;
        if (pl.goal >= 0 && T < pl.commitUntil && tp[pl.goal] < Infinity) goal = pl.goal;
        else { goal = cand.length ? cand[Math.floor(rnd() * Math.min(pr.top, cand.length))][1] : pl.node; pl.goal = goal; pl.commitUntil = T + pr.commit }
        if (goal !== pl.node) {
          const prev = new Int32Array(n).fill(-1); dij(P, [[pl.node, 0]], pr.H + .1, pr.edge, prev);
          let k = goal; while (prev[k] !== pl.node && prev[k] >= 0) k = prev[k];
          if (prev[k] === pl.node) {
            let best = null; for (const ed of P[pl.node]) if (ed[0] === k && pr.edge(ed) && (!best || ed[1] < best[1])) best = ed;
            if (best) {
              const trick = best[2] === 6 || best[2] === 'kick';
              if (trick) tricks++;
              if (trick && rnd() > pr.ok(best[2], best[3])) { // failed: fall below the gap or bounce back
                falls++; const a = nodes[pl.node], b = nodes[k];
                const below = G.nodeAt((a.x + b.x) / 2, Math.min(a.y, b.y) - .2, (a.z + b.z) / 2);
                let land = -1; for (let yy = Math.min(a.y, b.y) - .5; yy > -12 && land < 0; yy -= 1) { const c = G.nodeAt((a.x + b.x) / 2, yy, (a.z + b.z) / 2); if (c >= 0 && nodes[c].y < Math.min(a.y, b.y) - .4 && Math.hypot(nodes[c].x - (a.x + b.x) / 2, nodes[c].z - (a.z + b.z) / 2) < 2) land = c }
                if (best[2] === 'kick' || land < 0 && below < 0) { pl.stun = 1.0 } // kick fails: lose a second at the wall
                else { pl.node = land >= 0 ? land : below; pl.stun = 1.2 }
              } else {
                const a = nodes[pl.node], b = nodes[k], dd = Math.hypot(b.x - a.x, b.z - a.z), dl = Math.hypot(dir[0], dir[1]);
                let turn = 0; if (dd > .1 && dl > .3) { const cs = ((b.x - a.x) * dir[0] + (b.z - a.z) * dir[1]) / (dd * dl); turn = Math.acos(Math.max(-1, Math.min(1, cs))) / Math.PI * .5 }
                pl.to = k; pl.t = 0; pl.c = best[1] + turn
              }
            }
          }
        }
      }
      if (pl.to >= 0) { pl.t += dt; if (pl.t >= pl.c) { const a = nodes[pl.node], b = nodes[pl.to], dd = Math.hypot(b.x - a.x, b.z - a.z); if (dd > .1) dir = [dir[0] * .7 + (b.x - a.x) / dd * .3, dir[1] * .7 + (b.z - a.z) / dd * .3]; pl.node = pl.to; pl.to = -1 } }
      const Pp = pos(pl);
      // --- zombies
      let allLost = zomb.length > 0;
      for (const z of zomb) {
        const zp = pos(z);
        if ((z.visT -= dt) <= 0) {
          z.visT = .2;
          const d = Math.hypot(zp[0] - Pp[0], zp[1] - Pp[1], zp[2] - Pp[2]);
          const seen = d < 8 || (d < 40 && !occ(zp[0], zp[1] + 1.5, zp[2], Pp[0], Pp[1] + 1.4, Pp[2]));
          if (seen) { z.known = true; z.hideT = 0; z.last = pl.to >= 0 ? pl.to : pl.node }
          else { z.hideT += .2; if (z.known && z.hideT >= .6) { z.known = false; z.lostT = 0 } }
        }
        if (z.stalker) { z.known = true }
        if (!z.known) { z.lostT += dt; if (z.lostT >= (U.senseT || 4)) { z.known = true; z.hideT = -3; z.last = pl.node } }
        if (z.known) {
          if (!z.stalker) allLost = false;
          z.last = pl.to >= 0 ? pl.to : pl.node;
          const zq = pos(z), dd = Math.hypot(zq[0] - Pp[0], zq[2] - Pp[2]);
          if (z.flank && dd > 10) { const g = G.nodeAt(Pp[0] + dir[0] * 10, Pp[1] + .1, Pp[2] + dir[1] * 10); if (g >= 0 && zReach[g] < Infinity) z.last = g }
        }
        if (z.to < 0) {
          const tgt = z.last; let dist = cache.get(tgt); if (!dist) { dist = dij(ZR, [[tgt, 0]], 60, null, null); cache.set(tgt, dist) }
          let best = -1, bv = Infinity;
          for (const [j, w] of Z[z.node]) { const v = w + dist[j]; if (v < bv - 1e-6) { bv = v; best = j; z.c = w } }
          if (best >= 0) { z.to = best; z.t = 0 }
        }
        if (z.to >= 0) { z.t += dt * z.mul * ZM * (z.known ? 1 : (U.loseSpeed || .75)); if (z.t >= z.c) { z.node = z.to; z.to = -1 } }
        const q = pos(z);
        if (Math.hypot(q[0] - Pp[0], (q[1] - Pp[1]) * 1.5, q[2] - Pp[2]) < 1.6) return { t: +T.toFixed(1), lost: +(lostTime / Math.max(T, .1)).toFixed(2), falls, tricks, start: [nodes[start].x, nodes[start].y, nodes[start].z], end: Pp.map(v => +v.toFixed(1)) };
      }
      if (allLost) lostTime += dt;
      if (opts.debug && Math.abs(T % 10) < dt / 2) { const ds = zomb.map(z => { const q = pos(z); return Math.round(Math.hypot(q[0] - Pp[0], q[2] - Pp[2])) }); dbg.push(`${T.toFixed(0)}s pl(${Pp.map(v => v.toFixed(0))}) moving=${pl.to >= 0} z=${zomb.length} min=${Math.min(...ds)} ` + zomb.slice(0, 4).map(z => `${z.node}->${z.to}:${z.known ? 'K' : 'L'}`).join(' ')) }
      if (zomb.some(z => z.known && !z.stalker && Math.hypot(pos(z)[0] - Pp[0], pos(z)[2] - Pp[2]) < 25)) quiet = 0; else quiet += dt;
    }
    return { t: 120, lost: +(lostTime / 120).toFixed(2), falls, tricks, start: [nodes[start].x, nodes[start].y, nodes[start].z], end: pos(pl).map(v => +v.toFixed(1)) };
  }
  const runs = opts.runs || 20, base = opts.seed || 1000, out = {};
  for (const prof of opts.profiles || ['skilled', 'sloppy', 'ground']) {
    const L = []; for (let r = 0; r < runs; r++) L.push(match(prof, base + r * 7919));
    const ts = L.map(o => o.t).sort((a, b) => a - b);
    out[prof] = { mean: +(ts.reduce((s, v) => s + v, 0) / runs).toFixed(1), median: ts[runs >> 1], escaped: L.filter(o => o.t >= 120).length, lostShare: +(L.reduce((s, o) => s + o.lost, 0) / runs).toFixed(2), falls: +(L.reduce((s, o) => s + o.falls, 0) / runs).toFixed(1), tricks: +(L.reduce((s, o) => s + o.tricks, 0) / runs).toFixed(1), caughtAt: L.filter(o => o.t < 120).map(o => o.end) };
  }
  return out;
};
