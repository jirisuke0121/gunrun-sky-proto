// Town dress (trial, 11/22): real shapes on the grey-box town - not paint. The collision boxes, the routes and every
// surface you can stand on stay exactly as they are; this only adds ONE merged mesh of stone details in places a runner
// never touches:
//   1. buttresses on tall walls (stone piers every few metres, starting above head height wherever a floor runs past)
//   2. a stone moulding under roof edges (a real shadow line where the wall meets the roof)
//   3. brackets under balconies and walkways that jut out of a wall
// Rules that keep it from reading as a foothold or an obstacle (docs/TOWN_DRESS_2026-11-22.md):
//   - nothing above a surface you can stand on, and nothing beside one below 2.3 m (you would run through it)
//   - nothing that sticks out more than 0.5 m; nothing with a flat top
//   - nothing where another box (ladder, rail, stair, door, cue) touches the wall
// Look only: no collision, no shadow casting, no texture.
// TRIAL, OFF BY DEFAULT: ?dress=1 turns it on; ?dress=x0,z0,x1,z1 limits it to a region. The trial showed that details of
// this size change the picture very little (docs/TOWN_DRESS_2026-11-22.md), so it is not part of the default look.
(() => {
  const params = new URLSearchParams(location.search), mode = params.get('dress');
  if (!mode || mode === '0' || params.get('look') === 'classic') return; // a trial: off unless asked for (?dress=1)
  const REGION = mode && mode.includes(',') ? mode.split(',').map(Number) : null;
  const HEAD = 2.3;            // nothing lower than this above a floor
  const PIER = { every: 5.2, width: 0.85, top: 0.42, foot: 0.62, below: 0.65, minLen: 1.9, maxLen: 20 };
  const hash = (a, b) => { let h = (Math.imul(Math.round(a * 16), 374761393) + Math.imul(Math.round(b * 16), 668265263)) ^ 0x5bf03635; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

  function build(game) {
    const { BufferGeometry, Float32Attribute, Mesh, Standard } = game.Geom;
    const all = game.jn.filter(b => !b.off && b.type !== 'door');
    const CELL = 8, grid = new Map(), key = (i, j) => i * 100003 + j;
    for (const b of all) for (let i = Math.floor(b.minX / CELL); i <= Math.floor(b.maxX / CELL); i++) for (let j = Math.floor(b.minZ / CELL); j <= Math.floor(b.maxZ / CELL); j++) { const k = key(i, j); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(b); }
    const near = (x, z) => grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) || [];
    const solidAt = (x, y, z, self) => near(x, z).some(b => b !== self && x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ && y > b.minY && y < b.maxY);
    const rooms = window.skyIndoorAccess?.snapshot?.() || [];
    const indoors = (x, y, z) => rooms.some(r => x > r.minX && x < r.maxX && y > r.minY && y < r.maxY && z > r.minZ && z < r.maxZ);
    // the highest top (of anything) under a small footprint, below yMax: a floor someone may be standing on
    const floorUnder = (x0, z0, x1, z1, yMax, self) => { let top = -1e9; for (const b of near((x0 + x1) / 2, (z0 + z1) / 2)) { if (b === self || b.maxX <= x0 || b.minX >= x1 || b.maxZ <= z0 || b.minZ >= z1) continue; if (b.maxY < yMax && b.maxY > top) top = b.maxY; } return top; };
    const inRegion = b => !REGION || (b.maxX > REGION[0] && b.minX < REGION[2] && b.maxZ > REGION[1] && b.minZ < REGION[3]);

    const pos = [], col = [], nor = [];
    const STONE = [0.46, 0.42, 0.39];
    let tone = 1;
    const tri = (a, b, c) => {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const n = Math.hypot(nx, ny, nz) || 1; nx /= n; ny /= n; nz /= n;
      for (const p of [a, b, c]) { pos.push(p[0], p[1], p[2]); nor.push(nx, ny, nz); col.push(STONE[0] * tone, STONE[1] * tone, STONE[2] * tone); }
    };
    const quad = (a, b, c, d) => { tri(a, b, c); tri(a, c, d); };
    // A wall face as a little frame: o = a point on the wall plane, u = along the wall, n = outward. P(s, y, d) is s metres
    // along, at height y, d metres out of the wall.
    const frame = (ox, oz, ux, uz, nx, nz) => (s, y, d) => [ox + ux * s + nx * d, y, oz + uz * s + nz * d];

    const counts = { piers: 0, mouldings: 0, brackets: 0 };
    const walls = all.filter(b => !b.hidden && !b.shape && b.tint == null && (b.type === 'mono' || b.type === 'slab') && b.maxY - b.minY >= 3 && b.mesh?.visible !== false && inRegion(b));
    for (const b of walls) {
      const faces = [ // [origin x, z, along x, z, outward x, z, length]
        [b.minX, b.minZ, 1, 0, 0, -1, b.maxX - b.minX], [b.maxX, b.maxZ, -1, 0, 0, 1, b.maxX - b.minX],
        [b.maxX, b.minZ, 0, 1, 1, 0, b.maxZ - b.minZ], [b.minX, b.maxZ, 0, -1, -1, 0, b.maxZ - b.minZ],
      ];
      for (const [ox, oz, ux, uz, nx, nz, len] of faces) {
        if (len < 1.6) continue;
        const P = frame(ox, oz, ux, uz, nx, nz), plane = ox * Math.abs(nx) + oz * Math.abs(nz), axis0 = ox * Math.abs(ux) + oz * Math.abs(uz), dir = ux + uz;
        const free = (s, y, d) => { const p = P(s, y, d); return !solidAt(p[0], y, p[2], b) && !indoors(p[0], y, p[2]); };
        const top = b.maxY;

        // --- 2. moulding under the roof edge: only where the wall really ends at a roof and drops at least 2 m outside ---
        if (len >= 2.4 && top - b.minY >= 3) {
          const STEP = 0.8; let run = null;
          const flush = end => { if (run !== null && end - run >= 1.6) { tone = 0.97; const y0 = top - 0.5, y1 = top - 0.16, d = 0.15; quad(P(run, y1, d), P(end, y1, d), P(end, y1, 0), P(run, y1, 0)); quad(P(run, y0 + 0.14, d), P(end, y0 + 0.14, d), P(end, y1, d), P(run, y1, d)); quad(P(run, y0, 0), P(end, y0, 0), P(end, y0 + 0.14, d), P(run, y0 + 0.14, d)); counts.mouldings++; } run = null; };
          for (let s = 0; s <= len + 1e-6; s += STEP) {
            const m = Math.min(len - 0.05, Math.max(0.05, s)), q = P(m, top + 0.4, -0.2);
            const ok = free(m, top - 0.33, 0.25) && free(m, top - 1.2, 0.25) && free(m, top - 2.1, 0.25) && free(m, top + 0.3, 0.25) && !solidAt(q[0], top + 0.4, q[2], null);
            if (ok) { if (run === null) run = Math.max(0, s - STEP / 2); } else flush(Math.min(len, s - STEP / 2));
          }
          flush(len);
        }

        // --- 1. buttresses on a fixed rhythm along the wall plane, so neighbouring boxes of one wall line up ---
        const phase = hash(plane, nx * 7 + nz * 13) * PIER.every;
        const wMin = Math.min(axis0, axis0 + dir * len), wMax = Math.max(axis0, axis0 + dir * len);
        for (let k = Math.ceil((wMin - phase) / PIER.every); k * PIER.every + phase <= wMax; k++) {
          const w = k * PIER.every + phase, s = (w - axis0) * dir; if (s > len - PIER.width / 2 - 0.15 || s < PIER.width / 2 + 0.15) continue;
          // the open stretch of wall under the roof edge, walking down
          let yTop = top - PIER.below, yBot = yTop;
          if (!free(s, top + 0.3, 0.3)) yTop = top; // the wall carries on upward (another box on top): run the pier to the seam
          const clear = y => free(s, y, 0.2) && free(s - 0.3, y, PIER.foot + 0.1) && free(s + 0.3, y, PIER.foot + 0.1);
          if (!clear(yTop - 0.2)) continue;
          for (yBot = yTop - 0.2; yBot > Math.max(b.minY, yTop - PIER.maxLen) && clear(yBot - 0.5); yBot -= 0.5);
          // not beside anyone: stay HEAD above every floor that passes within 1.3 m of the wall here
          const a = P(s - 0.6, 0, 0), c = P(s + 0.6, 0, 1.3), floor = floorUnder(Math.min(a[0], c[0]), Math.min(a[2], c[2]), Math.max(a[0], c[0]), Math.max(a[2], c[2]), yTop - 0.5, b);
          yBot = Math.max(yBot, floor + HEAD);
          if (yTop - yBot < PIER.minLen) continue;
          const hw = PIER.width / 2, taper = Math.min(0.8, (yTop - yBot) * 0.3), dTop = PIER.top, dFoot = PIER.top + (PIER.foot - PIER.top) * Math.min(1, (yTop - yBot) / 8), yT = yBot + taper;
          tone = 0.93 + 0.12 * hash(w, plane);
          quad(P(s - hw, yT, dFoot), P(s + hw, yT, dFoot), P(s + hw, yTop, dTop), P(s - hw, yTop, dTop));               // front (leans in toward the top)
          quad(P(s - hw, yTop, dTop), P(s + hw, yTop, dTop), P(s + hw, yTop + 0.3, 0), P(s - hw, yTop + 0.3, 0));     // sloped cap
          quad(P(s - hw, yBot, 0), P(s + hw, yBot, 0), P(s + hw, yT, dFoot), P(s - hw, yT, dFoot));                   // corbelled foot
          for (const e of [s - hw, s + hw]) { const flip = e < s; const q = [P(e, yBot, 0), P(e, yT, dFoot), P(e, yTop, dTop), P(e, yTop + 0.3, 0)]; if (flip) { tri(q[0], q[2], q[1]); tri(q[0], q[3], q[2]); } else { tri(q[0], q[1], q[2]); tri(q[0], q[2], q[3]); } }
          counts.piers++;
        }
      }
    }

    // --- 3. brackets under thin slabs that jut out of a wall (balconies, walkways) ------------------------------
    const ledges = all.filter(b => !b.hidden && !b.shape && (b.type === 'slab' || b.type === 'beam') && b.maxY - b.minY <= 0.7 && b.maxX - b.minX >= 1 && b.maxZ - b.minZ >= 1 && b.mesh?.visible !== false && inRegion(b));
    for (const b of ledges) {
      const y = b.minY, sides = [ // the wall side: [origin x, z, along x, z, away-from-wall x, z, length, depth]
        [b.minX, b.minZ, 1, 0, 0, 1, b.maxX - b.minX, b.maxZ - b.minZ], [b.maxX, b.maxZ, -1, 0, 0, -1, b.maxX - b.minX, b.maxZ - b.minZ],
        [b.minX, b.maxZ, 0, -1, 1, 0, b.maxZ - b.minZ, b.maxX - b.minX], [b.maxX, b.minZ, 0, 1, -1, 0, b.maxZ - b.minZ, b.maxX - b.minX],
      ];
      for (const [ox, oz, ux, uz, nx, nz, len, depth] of sides) {
        const P = frame(ox, oz, ux, uz, nx, nz), reach = Math.min(1.1, depth * 0.7), drop = Math.min(1.0, reach * 1.1);
        const n = Math.max(1, Math.round(len / 2.6));
        for (let i = 0; i < n; i++) {
          const s = (i + 0.5) * len / n, wall = P(s, y - 0.5, -0.25), air = P(s, y - 0.45, reach * 0.5), tip = P(s, 0, reach);
          if (!solidAt(wall[0], y - 0.5, wall[2], b) || solidAt(air[0], y - 0.45, air[2], b) || solidAt(air[0], y - drop, air[2], b) || indoors(air[0], y - 0.45, air[2])) continue;
          if (floorUnder(Math.min(wall[0], tip[0]) - 0.3, Math.min(wall[2], tip[2]) - 0.3, Math.max(wall[0], tip[0]) + 0.3, Math.max(wall[2], tip[2]) + 0.3, y - 0.05, b) > y - drop - HEAD) continue; // someone could walk under it
          const hw = 0.13; tone = 0.9 + 0.1 * hash(wall[0], wall[2]);
          quad(P(s - hw, y - drop, 0), P(s + hw, y - drop, 0), P(s + hw, y, reach), P(s - hw, y, reach));
          tri(P(s - hw, y - drop, 0), P(s - hw, y, reach), P(s - hw, y, 0)); tri(P(s + hw, y - drop, 0), P(s + hw, y, 0), P(s + hw, y, reach));
          counts.brackets++;
        }
      }
    }

    if (!pos.length) return;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32Attribute(new Float32Array(pos), 3));
    geometry.setAttribute('normal', new Float32Attribute(new Float32Array(nor), 3));
    geometry.setAttribute('color', new Float32Attribute(new Float32Array(col), 3));
    geometry.computeBoundingSphere();
    const material = new Standard({ vertexColors: true, roughness: 1 }); material.side = 2;
    const mesh = new Mesh(geometry, material);
    mesh.name = 'Town dress'; mesh.castShadow = false; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
    game.ue.add(mesh);
    window.skyTownDress = { mesh, triangles: pos.length / 9, ...counts, region: REGION };
  }

  let tries = 0;
  const timer = setInterval(() => {
    const game = window.__skyInternals;
    if (window.SKY_CANYON_MAP || window.skyGuidedScene || ++tries > 400) return clearInterval(timer);
    if (!game?.ue || !game.jn?.length || !game.Geom?.Standard || !window.skyLookInfo) return; // after the static merge and the look pass
    clearInterval(timer);
    try { build(game); } catch (error) { console.warn('town dress skipped', error); }
  }, 100);
})();
