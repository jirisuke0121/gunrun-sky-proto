// Far scenery: what lies beyond (and far below) the old town. Look only: ONE merged mesh, vertex colours,
// no texture, no collision, no shadow, no outline, no light. Off with ?scenery=0 (the previous ring of
// silhouettes and the floating domes come back) and whenever the mood is off (?mood=noon, ?look=classic).
//
// The town stands on its pillars above a SEA OF CLOUDS. Second version (11/21 evening): the first one was a
// noise terrain of huge random facets ("crumpled paper"), slab clouds that read as snow, and oversized houses.
// Now every shape is deliberate and softly shaded:
//   - a smooth sea of clouds with a path of light toward the sun, and soft billows on it
//   - three layers of mountain ridges, each paler than the one before, fading into mist at the foot,
//     pink where the morning sun hits them (opposite the sun) and dark against the sun
//   - the castle on a slim crag under the sun (the landmark)
//   - three small village islands, low enough that you look down on their roofs
//
// "Can I go there?" rules (docs/FAR_SCENERY_2026-11-21.md) - nothing here may look like a foothold:
//   1. a gap: nothing but cloud within GAP metres of the middle of the map
//   2. below: the cloud top is under the fall line (the run already ends above it); land starts far beyond
//   3. drawn differently: no ink outline, soft gradients, colours fade with distance; cue colours (yellow / orange) are not used
(() => {
  const params = new URLSearchParams(location.search);
  if (params.get('scenery') === '0') return;
  const CX = -4, CZ = -6;      // the middle of the map (same as the old skyline ring)
  const GAP = 150;             // land may rise through the cloud only beyond this radius (map half-length is ~66)
  const CLOUD_Y = -34;         // cloud top; the fall line (fallY) is -22
  const FAR = 408;             // outer radius of the land; the sky dome sits at 500 m around the camera

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
  const angleGap = (a, b) => { let d = Math.abs(a - b) % (Math.PI * 2); return d > Math.PI ? Math.PI * 2 - d : d; };

  function build(game, mood) {
    const { BufferGeometry, Float32Attribute, Mesh, Basic } = game.Geom;
    const lin = hex => { const c = new Basic({ color: hex }).color; return [c.r, c.g, c.b]; }; // hex -> working colour space
    const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
    const sunLen = Math.hypot(...mood.sun.dir), SUN = mood.sun.dir.map(v => v / sunLen), sunAz = Math.atan2(SUN[2], SUN[0]);
    const HAZE = lin(mood.haze), WARM = lin(mood.glow), LOW = lin(mood.skyLow), MID = lin(mood.skyMid), COOL = lin(0x9fa6e6);
    const DEEP = mix(lin(mood.skyTop), LOW, 0.4), PALE_SEA = params.get('sea') === 'pale';
    const C = {
      cloud: lin(0xfff1ea), cloudShade: mix(lin(mood.skyLow), lin(0xfff1ea), 0.5), alpen: lin(0xffb7a3), snow: lin(0xfff0f2),
      ridge: [lin(0x57528c), lin(0x8676ad), lin(0xb394ba)],                    // near -> far: deep violet, lavender, pale rose
      meadow: lin(0x86b184), rock: lin(0x7b7396), slate: lin(0x4d5778), roofRed: lin(0x9c5a5e), castle: lin(0xd9c8cc), window: lin(0xfff2cc),
      walls: [0xe6d9c8, 0xd9a6a6, 0xc9c2bc, 0xb9c4a6].map(lin), blossom: lin(0xf3b4cb), blossom2: lin(0xfad7e2),
    };
    const pos = [], col = [];
    const hazeAt = r => Math.pow(Math.max(0, Math.min(1, (r - 200) / 210)), 1.1) * 0.6;

    // The sea of clouds as a colour field: darker and cooler under the town, melting into the horizon colour far away,
    // with a broad path of light toward the sun. The billows and the feet of the mountains take their colour from it.
    const seaColour = (x, z) => {
      const dx = x - CX, dz = z - CZ, r = Math.hypot(dx, dz), da = angleGap(Math.atan2(dz, dx), sunAz);
      // 11/22: the cloud right under the town was almost white, so the pale walls and paving had nothing to stand out
      // against and the gap below read as an unfinished blank. Under the town the sea is now the deep colour of the sky
      // (DEEP), lifting to the old pale cloud by 260 m; the white billows on it then read as clouds. ?sea=pale = before.
      let c = PALE_SEA ? mix(mix(LOW, C.cloud, 0.42), HAZE, step(40, 520, r)) : mix(mix(DEEP, C.cloud, 0.08 + 0.42 * step(30, 260, r)), HAZE, step(120, 520, r));
      c = mix(c, mix(C.cloud, WARM, 0.35), Math.exp(-(da * da) / (2 * 0.3 * 0.3)) * step(50, 300, r) * 0.6);
      return scale(c, 0.965 + 0.07 * noise(x / 70 + 3.1, z / 70 - 8.2));
    };
    // Smooth-shaded triangle: one colour per corner (soft gradients instead of flat facets).
    const soft = (a, ca, b, cb, c, cc) => { pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); col.push(ca[0], ca[1], ca[2], cb[0], cb[1], cb[2], cc[0], cc[1], cc[2]); };
    const softQuad = (a, ca, b, cb, c, cc, d, cd) => { soft(a, ca, b, cb, c, cc); soft(a, ca, c, cc, d, cd); };
    // Flat-shaded triangle for the small built things (houses, towers, trees): light baked from the face normal.
    let inside = null;
    const tri = (a, b, c, base, own = 0) => {
      let ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if ((inside ? nx * (a[0] - inside[0]) + ny * (a[1] - inside[1]) + nz * (a[2] - inside[2]) : ny) < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const n = Math.hypot(nx, ny, nz) || 1, lit = Math.max(0, ((nx * SUN[0] + ny * SUN[1] + nz * SUN[2]) / n + 0.3) / 1.3), up = 0.5 + 0.5 * ny / n;
      const h = hazeAt(Math.hypot((a[0] + b[0] + c[0]) / 3 - CX, (a[2] + b[2] + c[2]) / 3 - CZ)), out = [0, 0, 0];
      for (let k = 0; k < 3; k++) { const shade = base[k] * (COOL[k] * (0.6 + 0.5 * up) + WARM[k] * lit * 1.7); out[k] = (shade + (base[k] - shade) * own) * (1 - h) + MID[k] * h; }
      soft(a, out, b, out, c, out);
    };
    const quad = (a, b, c, d, base, own) => { tri(a, b, c, base, own); tri(a, c, d, base, own); };

    // --- 1. the sea of clouds --------------------------------------------------------------------
    {
      const RINGS = [0, 55, 110, 170, 240, 320, 420, 560], SEG = 48, at = (i, j) => { const a = j / SEG * Math.PI * 2, r = RINGS[i]; return [CX + Math.cos(a) * r, CLOUD_Y - (i === RINGS.length - 1 ? 8 : 0), CZ + Math.sin(a) * r]; };
      for (let i = 0; i < RINGS.length - 1; i++) for (let j = 0; j < SEG; j++) {
        const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
        if (i === 0) soft(a, seaColour(a[0], a[2]), b, seaColour(b[0], b[2]), c, seaColour(c[0], c[2]));
        else softQuad(a, seaColour(a[0], a[2]), b, seaColour(b[0], b[2]), c, seaColour(c[0], c[2]), d, seaColour(d[0], d[2]));
      }
    }

    // --- 2. billows: soft domes whose feet melt into the sea, bright toward the sun ---------------
    const billow = (cx, cz, rx, ry, rz) => {
      const N = 8, LAT = [0, 0.5, 0.86], rings = LAT.map(s => { const y = s * ry, k = Math.sqrt(1 - s * s); return Array.from({ length: N }, (_, j) => { const a = j / N * Math.PI * 2 + cx * 0.37; return [cx + Math.cos(a) * rx * k, CLOUD_Y - 0.6 + y, cz + Math.sin(a) * rz * k]; }); });
      const top = [cx, CLOUD_Y - 0.6 + ry, cz], h = hazeAt(Math.hypot(cx - CX, cz - CZ)) * 0.8;
      const shade = (p, foot) => {
        if (foot) return seaColour(p[0], p[2]);
        let nx = (p[0] - cx) / (rx * rx), ny = (p[1] - CLOUD_Y) / (ry * ry) * 0.6, nz = (p[2] - cz) / (rz * rz); const n = Math.hypot(nx, ny, nz) || 1;
        const lit = Math.pow(Math.max(0, (nx * SUN[0] + ny * SUN[1] + nz * SUN[2]) / n * 0.5 + 0.5), 1.4);
        return mix(mix(C.cloudShade, mix(C.cloud, WARM, 0.22), lit), HAZE, h);
      };
      for (let i = 0; i < LAT.length - 1; i++) for (let j = 0; j < N; j++) { const j1 = (j + 1) % N, a = rings[i][j], b = rings[i][j1], c = rings[i + 1][j1], d = rings[i + 1][j]; softQuad(a, shade(a, i === 0), b, shade(b, i === 0), c, shade(c), d, shade(d)); }
      const last = rings[LAT.length - 1], ct = shade(top);
      for (let j = 0; j < N; j++) soft(last[j], shade(last[j]), last[(j + 1) % N], shade(last[(j + 1) % N]), top, ct);
    };
    const bank = (x, z, s, n) => { for (let k = 0; k < n; k++) { const rx = (16 + rand() * 16) * s; billow(x + (rand() - 0.5) * 40 * s, z + (rand() - 0.5) * 40 * s, rx, Math.min(8.4, rx * (0.2 + rand() * 0.1)), rx * (0.7 + rand() * 0.3)); } };

    // --- 3. mountain ridges: three layers, each a clean jagged crest with a misty foot -----------------
    const VILLAGES = [1.25, 2.75, -1.55].map(off => sunAz + off);   // azimuths of the village islands (gaps in the near ridge)
    const ridges = [
      { r: 262, w: 46, base: 20, amp: 50, k: 3.1, tone: C.ridge[0], mist: 0.5, gaps: [[sunAz, 0.36], ...VILLAGES.map(a => [a, 0.2])], snowY: 1e9 },
      { r: 330, w: 50, base: 48, amp: 72, k: 2.3, tone: C.ridge[1], mist: 0.6, gaps: [[sunAz, 0.2]], snowY: 1e9 },
      { r: 396, w: 46, base: 76, amp: 102, k: 1.7, tone: C.ridge[2], mist: 0.7, gaps: [[sunAz, 0.3]], snowY: 106 },
    ];
    ridges.forEach((R, layer) => {
      const SEG = 112, crest = [], mid = [], foot = [], back = [], cc = [], cm = [], cf = [], cb = [];
      for (let j = 0; j < SEG; j++) {
        const a = j / SEG * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const n1 = noise(ca * R.k + layer * 17.3 + 40, sa * R.k - layer * 9.1 + 40), n2 = noise(ca * R.k * 3.3 + 80, sa * R.k * 3.3 + 80);
        let open = 1; for (const [g, w] of R.gaps) { const d = angleGap(a, g); open *= 1 - (layer === 0 || g !== sunAz ? 1 : 0.8) * Math.exp(-(d * d) / (2 * w * w)); }
        const rise = (R.base + R.amp * (Math.pow(1 - Math.abs(2 * n1 - 1), 1.5) * 0.72 + 0.28 * n2)) * open, y = CLOUD_Y - 4 + rise;
        const rj = R.r + (hash(j, layer + 5) - 0.5) * 10, at = (rr, yy) => [CX + ca * rr, yy, CZ + sa * rr];
        crest.push(at(rj, y)); mid.push(at(rj - R.w * (0.4 + 0.1 * hash(j, layer + 9)), CLOUD_Y - 4 + rise * (0.5 + 0.14 * hash(j, layer + 13))));
        foot.push(at(rj - R.w, CLOUD_Y - 4)); back.push(at(rj + R.w * 0.7, CLOUD_Y - 4));
        // light: faces look toward the middle of the map, so the ridges opposite the sun catch the morning light (pink),
        // the ones toward the sun are dark with a warm rim on the crest
        const facing = Math.max(0, -Math.cos(a - sunAz)), rim = Math.exp(-(angleGap(a, sunAz) ** 2) / (2 * 0.55 * 0.55));
        const body = mix(R.tone, C.alpen, 0.5 * facing), snow = step(R.snowY, R.snowY + 22, y);
        cc.push(scale(mix(mix(body, C.snow, snow * 0.6), WARM, rim * 0.45), 0.96 + 0.08 * hash(j, layer + 21)));
        cm.push(mix(scale(body, 0.9), seaColour(foot[j][0], foot[j][2]), R.mist * 0.42));
        cf.push(mix(R.tone, seaColour(foot[j][0], foot[j][2]), 0.96)); cb.push(scale(R.tone, 0.85));
      }
      for (let j = 0; j < SEG; j++) {
        const j1 = (j + 1) % SEG; if (Math.max(crest[j][1], crest[j1][1]) < CLOUD_Y + 1) continue; // sunk under the cloud (a gap)
        softQuad(foot[j], cf[j], foot[j1], cf[j1], mid[j1], cm[j1], mid[j], cm[j]);
        softQuad(mid[j], cm[j], mid[j1], cm[j1], crest[j1], cc[j1], crest[j], cc[j]);
        softQuad(crest[j], cc[j], crest[j1], cc[j1], back[j1], cb[j1], back[j], cb[j]);
      }
    });

    // --- 4. small built things (flat-shaded) ------------------------------------------------------
    const OWN = 0.38; // how much of a wall's own colour survives the baked light
    const house = (x, y, z, w, d, h, roof, rot, wall, top, own = OWN) => {
      const c = Math.cos(rot), s = Math.sin(rot), P = (lx, ly, lz) => [x + lx * c - lz * s, y + ly, z + lx * s + lz * c];
      const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2, y0 = -3, e = 0.5; inside = [x, y + h * 0.5, z];
      quad(P(x0, y0, z1), P(x1, y0, z1), P(x1, h, z1), P(x0, h, z1), wall, own); quad(P(x1, y0, z0), P(x0, y0, z0), P(x0, h, z0), P(x1, h, z0), wall, own);
      quad(P(x1, y0, z1), P(x1, y0, z0), P(x1, h, z0), P(x1, h, z1), wall, own); quad(P(x0, y0, z0), P(x0, y0, z1), P(x0, h, z1), P(x0, h, z0), wall, own);
      tri(P(x0, h, z1), P(x0, h, z0), P(x0, h + roof, 0), wall, own); tri(P(x1, h, z0), P(x1, h, z1), P(x1, h + roof, 0), wall, own);
      quad(P(x0 - e, h - 0.3, z1 + e), P(x1 + e, h - 0.3, z1 + e), P(x1 + e, h + roof, 0), P(x0 - e, h + roof, 0), top);
      quad(P(x1 + e, h - 0.3, z0 - e), P(x0 - e, h - 0.3, z0 - e), P(x0 - e, h + roof, 0), P(x1 + e, h + roof, 0), top);
    };
    const tower = (x, y, z, w, h, spire, wall, top, sides = 4, a0 = 0, own = OWN) => { // a0: direction one flat side faces
      inside = [x, y + h * 0.5, z];
      const ring = (yy, k) => Array.from({ length: sides }, (_, i) => { const a = a0 + (i + 0.5) / sides * Math.PI * 2; return [x + Math.cos(a) * w * k, yy, z + Math.sin(a) * w * k]; });
      const lo = ring(y - 3, 0.7), hi = ring(y + h, 0.7), eave = ring(y + h - 0.2, 0.86), tip = [x, y + h + spire, z];
      for (let i = 0; i < sides; i++) { const i1 = (i + 1) % sides; quad(lo[i1], lo[i], hi[i], hi[i1], wall, own); tri(eave[i1], eave[i], tip, top); }
    };
    const tree = (x, y, z, s, base) => {
      const top = [x, y + 4.6 * s, z], N = 5, ring = [], foot = []; inside = [x, y + 2 * s, z];
      for (let k = 0; k < N; k++) { const a = k / N * Math.PI * 2 + x; ring.push([x + Math.cos(a) * 2.5 * s, y + 2.7 * s, z + Math.sin(a) * 2.5 * s]); foot.push([x + Math.cos(a) * 1.9 * s, y + 0.4 * s, z + Math.sin(a) * 1.9 * s]); }
      for (let k = 0; k < N; k++) { const k1 = (k + 1) % N; tri(top, ring[k1], ring[k], base, 0.4); quad(ring[k], ring[k1], foot[k1], foot[k], base, 0.4); }
    };
    // A soft-shaded island: flat green top, rocky flank, foot lost in the mist. Returns the height of the top.
    const island = (x, z, topR, topY, footR, grass, rock) => {
      const N = 14, top = [], shoulder = [], foot = [], ct = [], cs = [], cf = [], h = hazeAt(Math.hypot(x - CX, z - CZ));
      for (let k = 0; k < N; k++) {
        const a = k / N * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), j = 0.86 + 0.28 * hash(k, Math.round(x)), midR = topR + (footR - topR) * 0.42 * j;
        top.push([x + ca * topR * j, topY, z + sa * topR * j]); shoulder.push([x + ca * midR, CLOUD_Y + (topY - CLOUD_Y) * 0.45, z + sa * midR]); foot.push([x + ca * footR * j, CLOUD_Y - 3, z + sa * footR * j]);
        const lit = Math.max(0, (ca * SUN[0] + sa * SUN[2]) * 0.5 + 0.5);
        ct.push(mix(scale(grass, 0.8 + 0.3 * lit), MID, h)); cs.push(mix(mix(scale(rock, 0.62), C.alpen, 0.5 * lit), MID, h)); cf.push(mix(rock, seaColour(foot[k][0], foot[k][2]), 0.95));
      }
      const centre = [x, topY + 0.6, z], cc = mix(scale(grass, 1.05), MID, h);
      for (let k = 0; k < N; k++) { const k1 = (k + 1) % N; soft(centre, cc, top[k], ct[k], top[k1], ct[k1]); softQuad(top[k], ct[k], top[k1], ct[k1], shoulder[k1], cs[k1], shoulder[k], cs[k]); softQuad(shoulder[k], cs[k], shoulder[k1], cs[k1], foot[k1], cf[k1], foot[k], cf[k]); }
    };

    // --- 5. three village islands: low (you look down on the roofs), small, between the near ridges ----
    let houses = 0, trees = 0;
    const VILLAGE_R = 236, VILLAGE_Y = -7;
    const villageAt = VILLAGES.map(a => [CX + Math.cos(a) * VILLAGE_R, CZ + Math.sin(a) * VILLAGE_R]);
    for (const [vx, vz] of villageAt) {
      island(vx, vz, 30, VILLAGE_Y, 54, C.meadow, C.rock);
      const red = rand() < 0.5, church = rand() * Math.PI * 2;
      tower(vx + Math.cos(church) * 6, VILLAGE_Y, vz + Math.sin(church) * 6, 3, 12, 8, C.castle, C.slate);
      for (let k = 0; k < 13; k++) {
        const a = rand() * Math.PI * 2, r = 5 + Math.sqrt(rand()) * 18, x = vx + Math.cos(a) * r, z = vz + Math.sin(a) * r;
        house(x, VILLAGE_Y, z, 6 + rand() * 4, 5 + rand() * 2, 3.6 + rand() * 2.4, 2.4 + rand() * 1.6, rand() * Math.PI, C.walls[Math.floor(rand() * C.walls.length)], red && rand() < 0.7 ? C.roofRed : C.slate); houses++;
      }
      for (let k = 0; k < 7; k++) { const a = rand() * Math.PI * 2, r = 20 + rand() * 7; tree(vx + Math.cos(a) * r, VILLAGE_Y, vz + Math.sin(a) * r, 0.8 + rand() * 0.5, rand() < 0.6 ? C.blossom : C.blossom2); trees++; }
    }

    // --- 6. the castle on a slim crag under the sun (the landmark) ---------------------------------
    const PEAK_R = 250, PEAK_Y = 16, peakX = CX + Math.cos(sunAz) * PEAK_R, peakZ = CZ + Math.sin(sunAz) * PEAK_R;
    {
      island(peakX, peakZ, 29, PEAK_Y, 58, C.meadow, C.rock);
      const y = PEAK_Y, ax = Math.cos(sunAz), az = Math.sin(sunAz), at = (f, s) => [peakX + ax * f - az * s, peakZ + az * f + ax * s]; // f: away from the town, s: sideways
      const rot = Math.atan2(ax, -az), town = sunAz + Math.PI, CW = 0.2, faced = sides => town - Math.PI / sides;
      const N = 8, wallR = 24, ringAt = (rr, yy) => Array.from({ length: N }, (_, k) => { const a = (k + 0.5) / N * Math.PI * 2; return [peakX + Math.cos(a) * rr, yy, peakZ + Math.sin(a) * rr]; });
      const w0 = ringAt(wallR, y - 3), w1 = ringAt(wallR, y + 7);
      inside = [peakX, y, peakZ];
      for (let k = 0; k < N; k++) { const k1 = (k + 1) % N; quad(w0[k1], w0[k], w1[k], w1[k1], C.castle, CW); }
      for (let k = 0; k < N; k++) tower(w1[k][0], y, w1[k][2], 4.4, 13, 9, C.castle, C.slate, 6, 0, CW);              // wall towers
      const HALL = [5, 0, 30, 16, 20, 11], KEEP = [-3, -12, 9, 44, 22], TALL = [7, 12, 6.4, 62, 34], SMALL = [-11, 7, 4.2, 28, 15];
      let p = at(HALL[0], HALL[1]); house(p[0], y, p[1], HALL[2], HALL[3], HALL[4], HALL[5], rot, C.castle, C.slate, CW);
      p = at(KEEP[0], KEEP[1]); tower(p[0], y, p[1], KEEP[2], KEEP[3], KEEP[4], C.castle, C.slate, 4, faced(4), CW);
      p = at(TALL[0], TALL[1]); tower(p[0], y, p[1], TALL[2], TALL[3], TALL[4], C.castle, C.roofRed, 6, faced(6), CW);
      p = at(SMALL[0], SMALL[1]); tower(p[0], y, p[1], SMALL[2], SMALL[3], SMALL[4], C.castle, C.slate, 6, faced(6), CW);
      // Lit windows on the sides that face the town: pale cream (never the yellow / orange of the route cues), unshaded.
      const W = 2.4, H = 4.6, win = (f, sc, yy) => { const a = at(f, sc - W / 2), b = at(f, sc + W / 2); soft([a[0], y + yy, a[1]], C.window, [b[0], y + yy, b[1]], C.window, [b[0], y + yy + H, b[1]], C.window); soft([a[0], y + yy, a[1]], C.window, [b[0], y + yy + H, b[1]], C.window, [a[0], y + yy + H, a[1]], C.window); };
      const front = (t, sides) => t[0] - t[2] * 0.7 * Math.cos(Math.PI / sides) - 0.35;
      for (const sc of [-12, -6, 0, 6, 12]) for (const yy of [4, 12]) win(HALL[0] - HALL[3] / 2 - 0.35, sc, yy);
      for (const yy of [24, 34]) win(front(KEEP, 4), KEEP[1], yy);
      for (const yy of [36, 46, 55]) win(front(TALL, 6), TALL[1], yy);
      win(front(SMALL, 6), SMALL[1], 19);
      for (let k = 0; k < 10; k++) { const a = rand() * Math.PI * 2; tree(peakX + Math.cos(a) * 27.5, PEAK_Y - 1, peakZ + Math.sin(a) * 27.5, 1 + rand() * 0.6, rand() < 0.75 ? C.blossom : C.blossom2); trees++; }
    }

    // --- 7. billows: a few close under the town, a ring lapping at the feet of the land, the rest scattered ---
    const clear = (x, z) => Math.hypot(x - peakX, z - peakZ) > 66 && villageAt.every(v => Math.hypot(x - v[0], z - v[1]) > 60);
    for (let i = 0; i < 9; i++) { const a = rand() * Math.PI * 2, r = 60 + rand() * 75; bank(CX + Math.cos(a) * r, CZ + Math.sin(a) * r, 0.75 + rand() * 0.25, 3); }
    for (let i = 0; i < 16; i++) { const a = (i + rand() * 0.6) / 16 * Math.PI * 2, r = 196 + rand() * 26, x = CX + Math.cos(a) * r, z = CZ + Math.sin(a) * r; if (clear(x, z)) bank(x, z, 1 + rand() * 0.3, 3); }
    for (let i = 0; i < 12; i++) { const a = rand() * Math.PI * 2, r = 280 + rand() * 90, x = CX + Math.cos(a) * r, z = CZ + Math.sin(a) * r; if (clear(x, z)) bank(x, z, 1.3 + rand() * 0.5, 2); }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32Attribute(new Float32Array(pos), 3));
    geometry.setAttribute('color', new Float32Attribute(new Float32Array(col), 3));
    const material = new Basic({ vertexColors: true, fog: false }); material.side = 2; // both sides: the shapes are built without caring about winding
    const mesh = new Mesh(geometry, material);
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
    window.skyFarScenery = { mesh, triangles: pos.length / 9, villages: villageAt.length, houses, trees, ridges: ridges.length, hidden, gap: GAP, cloudY: CLOUD_Y, far: FAR, peak: [peakX, PEAK_Y, peakZ] };
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
