// Town foundation (2026-11-24): the old town looked like a thin tray floating on a few sticks - from a roof edge or
// in a wide shot there was nothing under the paving to say how high up you are. Now the town stands on its old STONE
// footing: a sheer stone wall under the outer edge of the paving (8-14 m deep, like a fortress wall) and massive
// tapering piers that drop through the sea of clouds. Stone = what has always stood (towers, footings, high walls).
//
// Look only: ONE merged mesh, vertex colours, no texture, no collision, no shadow, no outline, no light.
// Off with ?foundation=0 (and whenever far-scenery is off: ?scenery=0, ?mood=noon, the canyon map).
//
// "Can I go there?" rules (same as far-scenery.js / AGENTS.md):
//   - everything is BELOW the paving: the top of the wall sits 0.6 m under the floor it hangs from
//   - it is set at least one 2 m cell IN from the outer edge of the paving, so a body falling off an edge moves away
//     from it, and thin decks / beams over the void get none (the outline is taken from the floor after an opening)
//   - holes inside the town (not connected to the outside) get no wall, so nothing shows through them as a floor
//   - the lower part melts into the deep colour of the sea under the town; no ink outline; cue colours are not used
(() => {
  const params = new URLSearchParams(location.search);
  if (params.get('foundation') === '0' || params.get('scenery') === '0') return;
  const CELL = 2, X0 = -82, X1 = 74, Z0 = -46, Z1 = 32;   // the grid covers the whole town (map half-length ~66)
  const CX = -4, CZ = -6, CLOUD_Y = -34;                  // same middle and cloud top as far-scenery.js

  const hash = (x, z) => { let h = (Math.imul(x, 374761393) + Math.imul(z, 668265263)) ^ 0x2a7c19e3; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const smooth = t => t * t * (3 - 2 * t);
  const step = (a, b, x) => smooth(Math.max(0, Math.min(1, (x - a) / (b - a))));
  const noise = (x, z) => {
    const xi = Math.floor(x), zi = Math.floor(z), u = smooth(x - xi), v = smooth(z - zi);
    const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };

  function build(game, mood) {
    const { BufferGeometry, Float32Attribute, Mesh, Basic } = game.Geom;
    const NX = Math.round((X1 - X0) / CELL), NZ = Math.round((Z1 - Z0) / CELL);
    const id = (i, j) => j * NX + i, inside = (i, j) => i >= 0 && j >= 0 && i < NX && j < NZ;
    // 1) the floor seen from above: the height of the first surface under each cell centre (null = open sky)
    const floor = new Array(NX * NZ).fill(null);
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const x = X0 + (i + .5) * CELL, z = Z0 + (j + .5) * CELL, hit = game.raycast(x, 40, z, 0, -1, 0, 50);
      if (hit && 40 - hit.t > -8) floor[id(i, j)] = 40 - hit.t;
    }
    const solid = floor.map(v => v !== null);
    // 2) opening (erode then dilate): drops thin decks and beams over the void; then erode once more = the inset
    const erode = (src, full) => src.map((on, k) => {
      if (!on) return false; const i = k % NX, j = (k / NX) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!full && di && dj) continue;
        if (!inside(i + di, j + dj) || !src[id(i + di, j + dj)]) return false;
      }
      return true;
    });
    const dilate = src => src.map((on, k) => {
      if (on) return true; const i = k % NX, j = (k / NX) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (inside(i + di, j + dj) && src[id(i + di, j + dj)]) return true;
      return false;
    }).map((on, k) => on && solid[k]);
    const body = erode(dilate(erode(solid, true)), false);
    // 3) outside = open cells reachable from the border (holes inside the town are not outside)
    const outside = new Array(NX * NZ).fill(false), queue = [];
    const seed = (i, j) => { const k = id(i, j); if (!body[k] && !outside[k]) { outside[k] = true; queue.push(k); } };
    for (let i = 0; i < NX; i++) { seed(i, 0); seed(i, NZ - 1); }
    for (let j = 0; j < NZ; j++) { seed(0, j); seed(NX - 1, j); }
    while (queue.length) { const k = queue.pop(), i = k % NX, j = (k / NX) | 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inside(i + di, j + dj)) seed(i + di, j + dj); }

    // colours (working colour space), lit like far-scenery's small built things
    const lin = hex => { const c = new Basic({ color: hex }).color; return [c.r, c.g, c.b]; };
    const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const sunLen = Math.hypot(...mood.sun.dir), SUN = mood.sun.dir.map(v => v / sunLen);
    const WARM = lin(mood.glow), COOL = lin(0x9fa6e6), LOW = lin(mood.skyLow);
    const DEEP = mix(lin(mood.skyTop), LOW, 0.4);
    const STONE = [lin(0xa89e90), lin(0x9a9184), lin(0xb0a596)];          // weathered footing stone, three tones
    const stoneLit = (n, k) => {
      const base = STONE[k], lit = Math.max(0, (n[0] * SUN[0] + n[2] * SUN[2]) * 0.8 + 0.2);
      return [0, 1, 2].map(c => base[c] * (COOL[c] * 0.62 + WARM[c] * lit * 1.05));
    };
    // darker right under the paving (its shadow), then the stone, then melting into the deep sea colour far below
    const shade = (c, y, top) => mix(c.map(v => v * (0.62 + 0.38 * step(top, top - 4, y))), DEEP, step(-9, CLOUD_Y - 2, y) * 0.88);

    const pos = [], col = [];
    const vert = (p, c) => { pos.push(p[0], p[1], p[2]); col.push(c[0], c[1], c[2]); };
    const quad = (a, b, c, d, ca, cb, cc, cd) => { vert(a, ca); vert(b, cb); vert(c, cc); vert(a, ca); vert(c, cc); vert(d, cd); };

    // 4) the sheer wall: one face per cell side between the footing and the outside, in three bands (soft gradient)
    let faces = 0; const rim = [];
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const k = id(i, j); if (!body[k]) continue;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (inside(i + di, j + dj) && !outside[id(i + di, j + dj)]) continue;
        const cx = X0 + (i + .5) * CELL, cz = Z0 + (j + .5) * CELL, h = CELL / 2;
        const a = [cx + di * h - dj * h, 0, cz + dj * h + di * h], b = [cx + di * h + dj * h, 0, cz + dj * h - di * h];
        const top = Math.min(0, floor[k]) - .6;
        // ragged foot: neighbouring faces share a corner height; broad swells (9 m) plus small breaks (2.5 m)
        const foot = p => -7.5 - 5 * noise(p[0] / 9 + 11.3, p[2] / 9 - 4.7) - 2 * noise(p[0] / 2.5, p[2] / 2.5);
        const tone = (hash(i * 3 + di, j * 5 + dj) * 3) | 0, n = [di, 0, dj], base = stoneLit(n, tone);
        const at = (p, y) => [p[0], y, p[2]];
        const fa = foot(a), fb = foot(b);
        const rows = [[top, top], [top - 3.2, top - 3.2], [(top - 3.2 + fa) / 2, (top - 3.2 + fb) / 2], [fa, fb]];
        for (let r = 0; r < 3; r++) {
          const [ya0, yb0] = rows[r], [ya1, yb1] = rows[r + 1];
          quad(at(a, ya0), at(b, yb0), at(b, yb1), at(a, ya1), shade(base, ya0, top), shade(base, yb0, top), shade(base, yb1, top), shade(base, ya1, top));
        }
        faces++; rim.push({ x: cx, z: cz, di, dj, top });
      }
    }

    // 5) piers: tapering eight-sided stone columns down through the clouds, one every ~14 m along the wall
    let piers = 0; const placed = [];
    rim.sort((p, q) => (Math.atan2(p.z - CZ, p.x - CX) - Math.atan2(q.z - CZ, q.x - CX)));
    for (const r of rim) {
      const px = r.x - r.di * 2.6, pz = r.z - r.dj * 2.6;                    // a little in from the wall face
      const ci = Math.floor((px - X0) / CELL), cj = Math.floor((pz - Z0) / CELL);
      if (!inside(ci, cj) || !body[id(ci, cj)] || placed.some(p => Math.hypot(p[0] - px, p[1] - pz) < 14)) continue;
      placed.push([px, pz]);
      const SIDES = 8, top = r.top - 1, bottom = CLOUD_Y - 26, R0 = 2.5 + 0.6 * hash(ci, cj), R1 = 1.5;
      const levels = [top, top - 6, -16, CLOUD_Y + 2, bottom], rad = y => R0 + (R1 - R0) * step(top, bottom, y) + (y > top - 2.2 ? 0.7 * step(top - 2.2, top, y) : 0);
      const tone = (hash(cj, ci) * 3) | 0;
      for (let s = 0; s < SIDES; s++) {
        const a0 = (s / SIDES) * Math.PI * 2, a1 = ((s + 1) / SIDES) * Math.PI * 2, am = (a0 + a1) / 2, n = [Math.cos(am), 0, Math.sin(am)], base = stoneLit(n, tone);
        for (let l = 0; l < levels.length - 1; l++) {
          const y0 = levels[l], y1 = levels[l + 1], r0 = rad(y0), r1 = rad(y1);
          const p = (a, rr, y) => [px + Math.cos(a) * rr, y, pz + Math.sin(a) * rr];
          quad(p(a0, r0, y0), p(a1, r0, y0), p(a1, r1, y1), p(a0, r1, y1), shade(base, y0, top), shade(base, y0, top), shade(base, y1, top), shade(base, y1, top));
        }
      }
      piers++;
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32Attribute(new Float32Array(pos), 3));
    geometry.setAttribute('color', new Float32Attribute(new Float32Array(col), 3));
    const material = new Basic({ vertexColors: true }); material.side = 2;   // fog on, like the town it hangs from
    const mesh = new Mesh(geometry, material);
    mesh.name = 'Town foundation'; mesh.castShadow = mesh.receiveShadow = false; mesh.matrixAutoUpdate = false;
    geometry.computeBoundingSphere();
    game.ue.add(mesh);
    const count = a => a.filter(Boolean).length;
    window.skyTownFoundation = { mesh, triangles: pos.length / 9, faces, piers, cells: count(body), floorCells: count(solid) };
    document.body.dataset.skyTownFoundation = 'on';
  }

  let tries = 0;
  const timer = setInterval(() => {
    const game = window.__skyInternals, mood = window.skyMood;
    if (window.skyMood === null || window.SKY_CANYON_MAP || ++tries > 400) return clearInterval(timer);
    if (!game?.ue || !game.Geom || !game.raycast || !mood || !document.body.dataset.skyMood || !document.body.dataset.skyFarScenery) return;
    clearInterval(timer);
    try { build(game, mood); } catch (error) { console.warn('town foundation skipped', error); }
  }, 100);
})();
