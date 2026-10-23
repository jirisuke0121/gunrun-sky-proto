// Player-only moves the nav graph leaves out: ziplines and hooks.
// Returns [[from, to, cost, kind]] using the game's own anchors and lines.
window.__extraMoves = () => {
  const G = window.__game, I = window.__skyInternals, U = I.U, nodes = G.NAV.nodes;
  const J = I.jn.filter(b => !b.off && b.solid !== false);
  const occ = (ax, ay, az, bx, by, bz) => { for (const b of J) { let t0 = 0, t1 = 1; const o = [ax, ay, az], dd = [bx - ax, by - ay, bz - az], mn = [b.minX, b.minY, b.minZ], mx = [b.maxX, b.maxY, b.maxZ]; let ok = true; for (let k = 0; k < 3; k++) { if (Math.abs(dd[k]) < 1e-9) { if (o[k] < mn[k] || o[k] > mx[k]) { ok = false; break } } else { let ta = (mn[k] - o[k]) / dd[k], tb = (mx[k] - o[k]) / dd[k]; if (ta > tb) [ta, tb] = [tb, ta]; t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) { ok = false; break } } } if (ok && t1 > 0.02 && t0 < 0.98) return true } return false };
  const near = (x, y, z) => { let best = -1, bd = 1e9; for (const q of nodes) { const d = Math.hypot(q.x - x, (q.y - y) * 2, q.z - z); if (d < bd) { bd = d; best = q.id } } return bd < 4 ? best : -1 };
  const out = [];
  for (const zl of G.ZIPS || []) { const u = near(zl.a[0], zl.a[1] - 1.7, zl.a[2]), v = near(zl.b[0], zl.b[1] - 2.3, zl.b[2]); if (u >= 0 && v >= 0) out.push([u, v, zl.len / U.zipSpeed + .5, 'zip']); }
  for (const a of G.HOOKS || []) {
    const t = G.nodeAt(a[0], a[1] - .8, a[2]); if (t < 0) continue;
    for (const e of nodes) {
      if (e.id === t) continue; const sy = e.y + 1.62, d = Math.hypot(a[0] - e.x, a[1] - sy, a[2] - e.z);
      if (d < 2.5 || d > U.hookRange) continue;
      const k = (d - .6) / d; if (occ(e.x, sy, e.z, e.x + (a[0] - e.x) * k, sy + (a[1] - sy) * k, e.z + (a[2] - e.z) * k)) continue;
      out.push([e.id, t, d / U.hookSpeed + .4, 'hook']);
    }
  }
  return out;
};
