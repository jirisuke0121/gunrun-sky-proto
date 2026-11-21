// Far scenery: what lies beyond (and far below) the old town. Look only: ONE merged mesh, vertex colours,
// no texture, no collision, no shadow, no outline, no light. Off with ?scenery=0 (the previous ring of
// silhouettes and the floating domes come back) and whenever the mood is off (?mood=noon, ?look=classic).
//
// The town stands on its pillars above a SEA OF CLOUDS. Islands of hills rise through the cloud far away,
// with small villages and blossom trees; a castle stands on the peak under the rising sun; a ring of
// mountains closes the horizon (with a gap where the sun comes up).
//
// "Can I go there?" rules (docs/FAR_SCENERY_2026-11-21.md) - nothing here may look like a foothold:
//   1. a gap: nothing but cloud within GAP metres of the playable area
//   2. below: the cloud top is under the fall line (the run already ends above it); land starts far beyond
//   3. drawn differently: no ink outline, colours fade into the haze with distance; cue colours (yellow / orange) are not used
(() => {
  const params = new URLSearchParams(location.search);
  if (params.get('scenery') === '0') return;
  const CX = -4, CZ = -6;      // the middle of the map (same as the old skyline ring)
  const GAP = 150;             // land may rise through the cloud only beyond this radius (map half-length is ~66)
  const CLOUD_Y = -34;         // cloud top; the fall line (fallY) is -22
  const NEAR_TOP = -9;         // islands closer than ~190 m stay under this height: the player always looks DOWN at them
  const FAR = 408;             // outer radius; the sky dome sits at 500 m around the camera

  let seed = 20261121;
  const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const hash = (x, z) => { let h = (Math.imul(x, 374761393) + Math.imul(z, 668265263)) ^ 0x5bf03635; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const smooth = t => t * t * (3 - 2 * t);
  const step = (a, b, x) => smooth(Math.max(0, Math.min(1, (x - a) / (b - a))));
  const noise = (x, z) => {
    const xi = Math.floor(x), zi = Math.floor(z), u = smooth(x - xi), v = smooth(z - zi);
    const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x, z) => noise(x, z) * 0.6 + noise(x * 2.1 + 9.3, z * 2.1 - 4.1) * 0.28 + noise(x * 4.3 - 2.7, z * 4.3 + 7.9) * 0.12;

  function build(game, mood) {
    const { BufferGeometry, Float32Attribute, Mesh, Basic } = game.Geom;
    const lin = hex => { const c = new Basic({ color: hex }).color; return [c.r, c.g, c.b]; }; // hex -> working colour space
    const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const sunLen = Math.hypot(...mood.sun.dir), SUN = mood.sun.dir.map(v => v / sunLen);
    const sunAz = Math.atan2(SUN[2], SUN[0]);
    const HAZE = lin(mood.haze), WARM = lin(mood.glow), COOL = lin(0x9fa6e6), LOW = lin(mood.skyLow);
    const FARTINT = mix(lin(mood.skyline[0]), HAZE, 0.35); // distant land fades to a lavender silhouette, clouds to the horizon colour
    let fade = FARTINT;
    const C = {
      grass: lin(0x5a8f6c), meadow: lin(0x94b97e), rock: lin(0xa58fae), snow: lin(0xf4ecf0),
      cloud: lin(0xfff3ee), stone: lin(0xd8cdc4), castle: lin(0xd9c8cc), window: lin(0xfff2cc), slate: lin(0x56607c), roofRed: lin(0x9c5a5e),
      walls: [0xe6d9c8, 0xd9a6a6, 0xb9c4a6, 0xc9c2bc, 0xa9c2c0].map(lin), blossom: lin(0xf3b4cb), blossom2: lin(0xfad7e2), leaf: lin(0x6f9a72),
    };
    const pos = [], col = [];
    // Aerial perspective: everything fades toward the haze colour with distance from the map.
    const hazeAt = r => 0.1 + Math.pow(Math.max(0, Math.min(1, (r - 215) / 190)), 1.1) * 0.72; // near islands and the castle keep their colour; the mountains fade
    // One flat-shaded triangle. The light is baked: warm on faces toward the sun, cool on the others.
    let wrap = 0.3, crest = 0; // wrap: light reaches a little past the terminator; crest: extra sun on up-facing faces (set per land face)
    let inside = null; // a point inside the solid being built; null = terrain (faces look up)
    const tri = (a, b, c, base, glow = 0) => {
      { const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const out = inside ? nx * (a[0] - inside[0]) + ny * (a[1] - inside[1]) + nz * (a[2] - inside[2]) : ny;
        if (out < 0) { const t = b; b = c; c = t; } }
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const n = Math.hypot(nx, ny, nz) || 1; nx /= n; ny /= n; nz /= n;
      const lit = Math.max(0, (nx * SUN[0] + ny * SUN[1] + nz * SUN[2] + wrap) / (1 + wrap)) + crest * Math.max(0, ny), skyUp = 0.5 + 0.5 * ny;
      const mx = (a[0] + b[0] + c[0]) / 3 - CX, mz = (a[2] + b[2] + c[2]) / 3 - CZ, h = hazeAt(Math.hypot(mx, mz));
      for (const p of [a, b, c]) {
        pos.push(p[0], p[1], p[2]);
        for (let k = 0; k < 3; k++) {
          const shade = base[k] * (COOL[k] * (0.6 + 0.5 * skyUp) + WARM[k] * lit * 1.7);
          col.push((shade + (base[k] - shade) * glow) * (1 - h) + fade[k] * h);
        }
      }
    };
    const quad = (a, b, c, d, base, glow) => { tri(a, b, c, base, glow); tri(a, c, d, base, glow); };

    // --- height of the land -------------------------------------------------------------------
    const PEAK_R = 250, peakX = CX + Math.cos(sunAz) * PEAK_R, peakZ = CZ + Math.sin(sunAz) * PEAK_R, PEAK_Y = 16;
    const height = (x, z) => {
      const dx = x - CX, dz = z - CZ, r = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
      let h = -78 + step(GAP, 235, r) * Math.pow(fbm(x / 95 + 31.7, z / 95 - 12.4), 1.35) * 150; // islands
      h = Math.min(h, NEAR_TOP + step(190, 310, r) * 46 + (h - NEAR_TOP) * 0.12);       // near islands stay below the town's floor
      let da = Math.abs(a - sunAz); if (da > Math.PI) da = Math.PI * 2 - da;
      const open = 1 - 0.9 * Math.exp(-(da * da) / (2 * 0.36 * 0.36));               // the gap for the sunrise
      const ridge = 1 - Math.abs(2 * fbm(x / 70 - 5.5, z / 70 + 19.1) - 1);
      h += step(300, 398, r) * (34 + ridge * 84) * open;                            // mountain ring
      const dp = Math.hypot(x - peakX, z - peakZ);
      h = h + (PEAK_Y + 14 * step(60, 26, dp) - 14 - h) * step(68, 36, dp);          // castle peak with a flat top
      if (dp < 26) h = PEAK_Y;
      return h;
    };
    const landColour = (y, r) => {
      if (y > 96) return C.snow;
      if (y > 44) return mix(C.rock, C.snow, step(78, 96, y));
      if (y > 12) return mix(C.meadow, C.rock, step(14, 44, y));
      return mix(C.grass, C.meadow, step(CLOUD_Y, 12, y));
    };

    // --- 1. sea of clouds: a flat fan, darker under the town and melting into the horizon --------
    {
      const RINGS = [0, 90, 190, 300, 420, 560], SEG = 40, tone = [0.9, 0.95, 0.985, 1, 1, 1];
      const ringColour = i => mix(mix(LOW, C.cloud, 0.5), HAZE, [0.12, 0.18, 0.34, 0.6, 0.86, 1][i]).map(v => v * tone[i]);
      const flat = (a, b, c, ca, cb, cc) => { for (const [p, k] of [[a, ca], [b, cb], [c, cc]]) { pos.push(...p); col.push(...k); } };
      for (let i = 0; i < RINGS.length - 1; i++) for (let j = 0; j < SEG; j++) {
        const a0 = j / SEG * Math.PI * 2, a1 = (j + 1) / SEG * Math.PI * 2, r0 = RINGS[i], r1 = RINGS[i + 1], c0 = ringColour(i), c1 = ringColour(i + 1);
        const p = (r, a) => [CX + Math.cos(a) * r, CLOUD_Y - (r > 420 ? 6 : 0), CZ + Math.sin(a) * r];
        if (r0 > 0) flat(p(r0, a0), p(r1, a1), p(r0, a1), c0, c1, c0);
        flat(p(r0, a0), p(r1, a0), p(r1, a1), c0, c1, c1);
      }
    }

    // The drawn land is coarse, so things placed on it ask the drawn triangles (not the smooth function) for the height.
    const CELL = 32, cells = new Map();
    const landY = (x, z) => {
      for (const [a, b, c] of cells.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) || []) {
        const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]); if (!d) continue;
        const u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d, v = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d, w = 1 - u - v;
        if (u >= -1e-6 && v >= -1e-6 && w >= -1e-6) return u * a[1] + v * b[1] + w * c[1];
      }
      return -999;
    };

    // --- 2. land: a polar grid, hidden under the cloud where it is low ---------------------------
    {
      const RINGS = [GAP - 12, 164, 186, 208, 230, 252, 274, 296, 318, 340, 362, 384, FAR], SEG = 84, grid = [];
      for (let i = 0; i < RINGS.length; i++) {
        const row = [];
        for (let j = 0; j < SEG; j++) {
          const jitterA = i && i < RINGS.length - 1 ? (hash(i, j) - 0.5) * 0.5 : 0, jitterR = i && i < RINGS.length - 1 ? (hash(j, i + 77) - 0.5) * 9 : 0;
          const a = (j + (i % 2) * 0.5 + jitterA) / SEG * Math.PI * 2, r = RINGS[i] + jitterR, x = CX + Math.cos(a) * r, z = CZ + Math.sin(a) * r;
          row.push([x, height(x, z), z]);
        }
        grid.push(row);
      }
      const face = (a, b, c) => {
        const top = Math.max(a[1], b[1], c[1]); if (top < CLOUD_Y - 1) return;         // fully under the cloud
        const minX = Math.floor(Math.min(a[0], b[0], c[0]) / CELL), maxX = Math.floor(Math.max(a[0], b[0], c[0]) / CELL), minZ = Math.floor(Math.min(a[2], b[2], c[2]) / CELL), maxZ = Math.floor(Math.max(a[2], b[2], c[2]) / CELL);
        for (let ix = minX; ix <= maxX; ix++) for (let iz = minZ; iz <= maxZ; iz++) { const key = ix + ',' + iz; if (!cells.has(key)) cells.set(key, []); cells.get(key).push([a, b, c]); }
        const y = (a[1] + b[1] + c[1]) / 3, r = Math.hypot((a[0] + b[0] + c[0]) / 3 - CX, (a[2] + b[2] + c[2]) / 3 - CZ);
        crest = 0.5 * step(CLOUD_Y + 6, CLOUD_Y + 40, top) * step(330, 240, r);
        tri(a, b, c, landColour(y + (hash(Math.round(a[0]), Math.round(c[2])) - 0.5) * 10, r));
        crest = 0;
      };
      for (let i = 0; i < RINGS.length - 1; i++) for (let j = 0; j < SEG; j++) {
        const j1 = (j + 1) % SEG, a = grid[i][j], b = grid[i][j1], c = grid[i + 1][j], d = grid[i + 1][j1];
        if (i % 2) { face(a, c, b); face(b, c, d); } else { face(a, c, d); face(a, d, b); }
      }
    }

    // --- 3. cloud banks: low faceted mounds on the sea, a few of them close under the town --------
    const mound = (cx, cy, cz, rx, ry, rz, base, glow) => {
      const N = 6, top = [cx, cy + ry, cz], ring = [], foot = []; inside = [cx, cy - 3, cz];
      for (let k = 0; k < N; k++) { const a = k / N * Math.PI * 2 + cx; ring.push([cx + Math.cos(a) * rx * 0.72, cy + ry * 0.55, cz + Math.sin(a) * rz * 0.72]); foot.push([cx + Math.cos(a) * rx, cy - 1, cz + Math.sin(a) * rz]); }
      for (let k = 0; k < N; k++) { const k1 = (k + 1) % N; tri(top, ring[k1], ring[k], base, glow); quad(ring[k], ring[k1], foot[k1], foot[k], base, glow); }
    };
    fade = HAZE;
    for (let i = 0; i < 46; i++) {
      const a = rand() * Math.PI * 2, r = i < 12 ? 55 + rand() * 80 : 120 + rand() * 250, x = CX + Math.cos(a) * r, z = CZ + Math.sin(a) * r;
      if (height(x, z) > CLOUD_Y - 8) continue;                                      // not on top of an island
      const s = 0.7 + rand() * 0.9 + r / 420, n = 2 + Math.floor(rand() * 2);
      for (let k = 0; k < n; k++) mound(x + (rand() - 0.5) * 34 * s, CLOUD_Y, z + (rand() - 0.5) * 34 * s, (14 + rand() * 12) * s, (2.6 + rand() * 3.4) * s, (11 + rand() * 10) * s, C.cloud, 0.45);
    }

    // --- 4. villages and trees on the islands -------------------------------------------------
    const OWN = 0.38; // how much of a wall's own colour survives the baked light
    const house = (x, y, z, w, d, h, roof, rot, wall, top, own = OWN) => {
      const c = Math.cos(rot), s = Math.sin(rot), P = (lx, ly, lz) => [x + lx * c - lz * s, y + ly, z + lx * s + lz * c];
      const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2, y0 = -4; inside = [x, y + h * 0.5, z];
      quad(P(x0, y0, z1), P(x1, y0, z1), P(x1, h, z1), P(x0, h, z1), wall, own); quad(P(x1, y0, z0), P(x0, y0, z0), P(x0, h, z0), P(x1, h, z0), wall, own);
      quad(P(x1, y0, z1), P(x1, y0, z0), P(x1, h, z0), P(x1, h, z1), wall, own); quad(P(x0, y0, z0), P(x0, y0, z1), P(x0, h, z1), P(x0, h, z0), wall, own);
      const e = 0.6; // eaves
      tri(P(x0, h, z1), P(x0, h, z0), P(x0, h + roof, 0), wall, own); tri(P(x1, h, z0), P(x1, h, z1), P(x1, h + roof, 0), wall, own);
      quad(P(x0 - e, h - 0.3, z1 + e), P(x1 + e, h - 0.3, z1 + e), P(x1 + e, h + roof, 0), P(x0 - e, h + roof, 0), top);
      quad(P(x1 + e, h - 0.3, z0 - e), P(x0 - e, h - 0.3, z0 - e), P(x0 - e, h + roof, 0), P(x1 + e, h + roof, 0), top);
    };
    const tower = (x, y, z, w, h, spire, wall, top, sides = 4, a0 = 0, own = OWN) => { // a0: direction one flat side faces
      inside = [x, y + h * 0.5, z];
      const ring = yy => Array.from({ length: sides }, (_, k) => { const a = a0 + (k + 0.5) / sides * Math.PI * 2; return [x + Math.cos(a) * w * 0.7, yy, z + Math.sin(a) * w * 0.7]; });
      const lo = ring(y - 4), hi = ring(y + h), eave = Array.from({ length: sides }, (_, k) => { const a = a0 + (k + 0.5) / sides * Math.PI * 2; return [x + Math.cos(a) * w * 0.86, y + h - 0.2, z + Math.sin(a) * w * 0.86]; }), tip = [x, y + h + spire, z];
      for (let k = 0; k < sides; k++) { const k1 = (k + 1) % sides; quad(lo[k1], lo[k], hi[k], hi[k1], wall, own); tri(eave[k1], eave[k], tip, top); }
    };
    const tree = (x, y, z, s, base) => {
      const top = [x, y + 4.6 * s, z], N = 5, ring = [], foot = []; inside = [x, y + 2 * s, z];
      for (let k = 0; k < N; k++) { const a = k / N * Math.PI * 2 + x; ring.push([x + Math.cos(a) * 2.5 * s, y + 2.7 * s, z + Math.sin(a) * 2.5 * s]); foot.push([x + Math.cos(a) * 1.9 * s, y + 0.4 * s, z + Math.sin(a) * 1.9 * s]); }
      for (let k = 0; k < N; k++) { const k1 = (k + 1) % N; tri(top, ring[k1], ring[k], base, 0.4); quad(ring[k], ring[k1], foot[k1], foot[k], base, 0.4); }
    };
    const R_LOW = 185; // closer than this, nothing may stand taller than the town's floor
    const lowEnough = (x, z, y) => Math.hypot(x - CX, z - CZ) > R_LOW || y < -16;
    const flatEnough = (x, z, y) => Math.abs(landY(x + 7, z) - y) + Math.abs(landY(x, z + 7) - y) < 6.5;
    fade = FARTINT;
    let villages = 0, houses = 0, trees = 0;
    for (let tries = 0; tries < 900 && villages < 26; tries++) {
      const a = rand() * Math.PI * 2, r = R_LOW + rand() * 140, vx = CX + Math.cos(a) * r, vz = CZ + Math.sin(a) * r, vy = landY(vx, vz);
      if (vy < CLOUD_Y + 6 || vy > 34 || !flatEnough(vx, vz, vy) || Math.hypot(vx - peakX, vz - peakZ) < 60) continue;
      villages++;
      const count = 5 + Math.floor(rand() * 7), red = rand() < 0.3;
      for (let k = 0; k < count; k++) {
        const x = vx + (rand() - 0.5) * 52, z = vz + (rand() - 0.5) * 52, y = landY(x, z);
        if (y < CLOUD_Y + 4 || !flatEnough(x, z, y) || !lowEnough(x, z, y)) continue;
        const s = 1.3 + r / 420; // a little larger far away so a village still reads as houses on a phone
        house(x, y, z, (7 + rand() * 6) * s, (6 + rand() * 3) * s, (4.5 + rand() * 4) * s, (3 + rand() * 2.5) * s, rand() * Math.PI, C.walls[Math.floor(rand() * C.walls.length)], red ? C.roofRed : C.slate);
        houses++;
      }
      if (r > 215 && rand() < 0.5) tower(vx + (rand() - 0.5) * 16, vy, vz + (rand() - 0.5) * 16, 3.4, 15 + rand() * 9, 9 + rand() * 5, C.stone, C.slate);
      const grove = 4 + Math.floor(rand() * 7), pink = rand() < 0.6;
      for (let k = 0; k < grove; k++) {
        const x = vx + (rand() - 0.5) * 84, z = vz + (rand() - 0.5) * 84, y = landY(x, z);
        if (y < CLOUD_Y + 3 || y > 46 || !lowEnough(x, z, y)) continue;
        tree(x, y, z, 1.1 + rand() * 0.9, pink ? (rand() < 0.5 ? C.blossom : C.blossom2) : C.leaf); trees++;
      }
    }

    // --- 5. the castle on the peak under the sun (the landmark; drawn large so it reads on a phone) ---
    {
      const y = Math.min(landY(peakX, peakZ), landY(peakX + 15, peakZ), landY(peakX - 15, peakZ), landY(peakX, peakZ + 15), landY(peakX, peakZ - 15)) + 1, ax = Math.cos(sunAz), az = Math.sin(sunAz);
      const at = (f, s) => [peakX + ax * f - az * s, peakZ + az * f + ax * s]; // f: away from the town, s: sideways
      const rot = Math.atan2(ax, -az), town = sunAz + Math.PI, CW = 0.2;        // the hall's long side and one side of each tower face the town
      const faced = sides => town - Math.PI / sides;
      const N = 8, wallR = 25, ringAt = (rr, yy) => Array.from({ length: N }, (_, k) => { const a = (k + 0.5) / N * Math.PI * 2; return [peakX + Math.cos(a) * rr, yy, peakZ + Math.sin(a) * rr]; });
      const w0 = ringAt(wallR, y - 8), w1 = ringAt(wallR, y + 7);
      inside = [peakX, y, peakZ];
      for (let k = 0; k < N; k++) { const k1 = (k + 1) % N; quad(w0[k1], w0[k], w1[k], w1[k1], C.castle, CW); }
      for (let k = 0; k < N; k++) tower(w1[k][0], y, w1[k][2], 4.4, 13, 9, C.castle, C.slate, 6, 0, CW);              // wall towers
      const HALL = [5, 0, 30, 16, 20, 11], KEEP = [-3, -12, 9, 44, 22], TALL = [7, 12, 6.4, 62, 34], SMALL = [-11, 7, 4.2, 28, 15];
      let p = at(HALL[0], HALL[1]); house(p[0], y, p[1], HALL[2], HALL[3], HALL[4], HALL[5], rot, C.castle, C.slate, CW);
      p = at(KEEP[0], KEEP[1]); tower(p[0], y, p[1], KEEP[2], KEEP[3], KEEP[4], C.castle, C.slate, 4, faced(4), CW);
      p = at(TALL[0], TALL[1]); tower(p[0], y, p[1], TALL[2], TALL[3], TALL[4], C.castle, C.roofRed, 6, faced(6), CW);
      p = at(SMALL[0], SMALL[1]); tower(p[0], y, p[1], SMALL[2], SMALL[3], SMALL[4], C.castle, C.slate, 6, faced(6), CW);
      // Lit windows on the sides that face the town: pale cream (never the yellow / orange of the route cues), unshaded.
      const W = 2.4, H = 4.6, win = (f, sc, yy) => { const a = at(f, sc - W / 2), b = at(f, sc + W / 2); inside = [a[0] + ax * 9, y + yy, a[1] + az * 9]; quad([a[0], y + yy, a[1]], [b[0], y + yy, b[1]], [b[0], y + yy + H, b[1]], [a[0], y + yy + H, a[1]], C.window, 1); };
      const front = (t, sides) => t[0] - t[2] * 0.7 * Math.cos(Math.PI / sides) - 0.35;
      for (const sc of [-12, -6, 0, 6, 12]) for (const yy of [4, 12]) win(HALL[0] - HALL[3] / 2 - 0.35, sc, yy);
      for (const yy of [24, 34]) win(front(KEEP, 4), KEEP[1], yy);
      for (const yy of [36, 46, 55]) win(front(TALL, 6), TALL[1], yy);
      win(front(SMALL, 6), SMALL[1], 19);
      for (let k = 0; k < 12; k++) { const a = rand() * Math.PI * 2, rr = 31 + rand() * 20, x = peakX + Math.cos(a) * rr, z = peakZ + Math.sin(a) * rr; tree(x, landY(x, z), z, 1.3 + rand() * 0.9, rand() < 0.75 ? C.blossom : C.blossom2); trees++; }
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32Attribute(new Float32Array(pos), 3));
    geometry.setAttribute('color', new Float32Attribute(new Float32Array(col), 3));
    const mesh = new Mesh(geometry, new Basic({ vertexColors: true, fog: false }));
    mesh.name = 'Far scenery'; mesh.frustumCulled = false; mesh.castShadow = mesh.receiveShadow = false; mesh.matrixAutoUpdate = false;
    game.ue.add(mesh);

    // The old floating domes and minarets (enhancements.js) hang in mid-air with nothing under them: hide them.
    let hidden = 0;
    game.ue.traverse(o => {
      if (!o.isMesh || o === mesh || !o.geometry || o.name === 'Far skyline') return;
      const hex = o.material?.color?.getHex?.(); if (hex !== 0xd9bf94 && hex !== 0xc9a46a) return;
      o.geometry.computeBoundingSphere(); const c = o.geometry.boundingSphere.center.clone().applyMatrix4(o.matrixWorld);
      if (Math.hypot(c.x - CX, c.z - CZ) > 110 && o.geometry.boundingSphere.radius < 60) { o.visible = false; hidden++; }
    });
    window.skyFarScenery = { mesh, triangles: pos.length / 9, villages, houses, trees, hidden, gap: GAP, cloudY: CLOUD_Y, peak: [peakX, PEAK_Y, peakZ], height };
    document.body.dataset.skyFarScenery = 'on';
  }

  let tries = 0;
  const timer = setInterval(() => {
    const game = window.__skyInternals, mood = window.skyMood;
    if (window.skyMood === null || window.SKY_CANYON_MAP || ++tries > 400) return clearInterval(timer); // noon / classic / other maps: no scenery
    if (!game?.ue || !game.Geom || !mood || !document.body.dataset.skyMood) return;  // wait until mood.js has set the light
    clearInterval(timer);
    try { build(game, mood); } catch (error) { console.warn('far scenery skipped', error); }
  }, 100);
})();
