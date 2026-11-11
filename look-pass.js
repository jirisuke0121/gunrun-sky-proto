// Look pass: cool blue sky and haze so distant pillars separate from the sand-coloured foreground,
// and a gentle colour shift per district (west brick, east slate-teal, north moss, south dusty rose)
// so the player can tell where they are. Colour only: no new meshes, lights or textures, so draw
// calls do not change.
//   (default)        sky + haze + district colours + town palette (plaster walls per building, slate roofs)
//   ?look=district   sky + haze + district colours only (the previous default)
//   ?look=sky        sky + haze only
//   ?look=classic    the previous all-beige look, for comparison
//   ?look=townDebug  town palette with a random colour per building, to check how buildings were grouped
//
// Why the world gets NEW geometry objects instead of a new attribute on the existing ones:
// three.js creates a GPU buffer for an attribute only when it runs its once-per-frame update for
// that geometry. That update can be skipped for a frame (this game refreshes the shadow map only
// every other frame, and the main pass skips geometries the previous shadow pass already updated).
// If a geometry that has already been drawn gets a "color" attribute in such a frame, its vertex-array
// state is built WITHOUT the colour buffer and then cached as up to date, so the shader reads the
// default colour (0,0,0) and the surface is drawn black for good. A geometry that has never been drawn
// always gets its buffers before its first draw, so we hand the renderer fresh geometry objects.
(() => {
  const mode = new URLSearchParams(location.search).get('look');
  if (mode === 'classic') { window.skyLook = 'classic'; return; }
  window.skyLook = mode === 'sky' ? 'sky' : mode === 'district' ? 'district' : mode === 'townDebug' ? 'townDebug' : 'town';

  const MOOD = window.skyMood; // set by mood.js (?mood=dusk|dawn); null = the noon look
  const HAZE = MOOD?.haze ?? 0xbcd2e4, SKY_TOP = MOOD?.skyTop ?? 0x6f9fd6, SKY_LOW = MOOD?.skyLow ?? 0xa9bccb;
  const NAMES = new Set(['Merged static world', 'Merged static material groups']);
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  function recolourSky(game) {
    const scene = game.ue, camera = game.Se;
    scene.background?.set?.(HAZE);
    scene.fog?.color.set(HAZE);
    // The dome follows the camera and carries a vertical colour gradient in a "color" attribute.
    for (const child of camera?.children || []) {
      const geometry = child.geometry, color = geometry?.attributes?.color, position = geometry?.attributes?.position;
      if (!color || !position) continue;
      const horizon = child.material.color.clone().set(HAZE), top = horizon.clone().set(SKY_TOP), low = horizon.clone().set(SKY_LOW);
      const mix = horizon.clone(), mid = horizon.clone().set(MOOD?.skyMid ?? HAZE);
      for (let i = 0; i < position.count; i++) {
        const y = position.getY(i) / 500;
        mix.copy(horizon);
        if (y > 0 && MOOD?.skyMid) { // three stops: warm horizon glow -> mid band -> deep top
          const t = Math.pow(y, 0.5);
          if (t < 0.5) mix.lerp(mid, t * 2); else { mix.copy(mid); mix.lerp(top, (t - 0.5) * 2); }
        } else if (y > 0) mix.lerp(top, Math.pow(y, 0.6)); else mix.lerp(low, Math.min(1, -y * 2));
        color.setXYZ(i, mix.r, mix.g, mix.b);
      }
      color.needsUpdate = true;
    }
  }

  // West: warm brick. East: cool slate-teal. North: moss. South: dusty rose. Centre stays sand.
  // u, v in [-1, 1] across the playable area; the colour changes smoothly with position.
  function districtTint(u, v) {
    const w = Math.max(0, -u), e = Math.max(0, u), n = Math.max(0, -v), s = Math.max(0, v);
    return [
      clamp(1 + 0.18 * w - 0.40 * e - 0.22 * n + 0.06 * s, 0.45, 1.35),
      clamp(1 - 0.24 * w - 0.12 * e + 0.08 * n - 0.20 * s, 0.45, 1.35),
      clamp(1 - 0.48 * w + 0.20 * e - 0.42 * n - 0.12 * s, 0.45, 1.35),
    ];
  }

  // ---- Town palette -------------------------------------------------------------------------
  // Plaster walls get one colour per building and the stepped terracotta roofs turn slate, so walkable
  // pale roof decks and paving stand out from the walls around them. The merged world no longer knows
  // which box a vertex came from, so we look it up again: a vertex belongs to the collision box whose
  // face it lies on (game.jn). Colour goes into a per-vertex attribute and one fragment-shader line, so
  // there are no new meshes, lights or textures and draw calls stay the same.
  const WALL_HEX = { rose: 0xc0635c, terracotta: 0xd58f50, ochre: 0xd9b765, sage: 0x93a672, teal: 0x74a3a4, stone: 0xd2c6a8 };
  // Plaster choices per district (first listed colour is the district's signature), centre mixes all.
  const DISTRICT_WALLS = {
    west: ['rose', 'terracotta', 'ochre', 'stone'], east: ['teal', 'stone', 'sage', 'ochre'],
    north: ['sage', 'ochre', 'stone', 'teal'], south: ['rose', 'terracotta', 'stone', 'ochre'],
    centre: ['stone', 'ochre', 'terracotta', 'rose', 'sage', 'teal'],
  };
  const SLATE_TOP = 0x5a6975, SLATE_SIDE = 0x424f5a;
  const ROOF_TINT = 0xe39a4a; // tint of the stepped roof boxes in the map data
  const hash = (n) => { n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d); n = Math.imul(n ^ (n >>> 12), 0x297a2d39); return ((n ^ (n >>> 15)) >>> 0) / 4294967296; };
  const sizeOf = (b) => [b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ];

  // wall = plaster building volume, roof = stepped terracotta box, skip = everything that keeps its colour
  function boxRole(b) {
    if (b.hidden || b.shape || !b.mesh?.isMesh || !['slab', 'mono', 'beam'].includes(b.type)) return 'skip';
    if (b.tint === ROOF_TINT) return 'roof';
    if (b.tint != null) return 'skip'; // accents: brick faces, awnings, crates, route cues
    const [w, h, d] = sizeOf(b);
    if (h > 40 || w * d > 700) return 'skip'; // sky pillars and the ground
    return 'wall';
  }

  function buildTown(game, Color) {
    const boxes = game.jn.map((box, index) => ({ box, index, role: boxRole(box) })).filter(entry => entry.role !== 'skip');
    const cell = 6, grid = new Map(), key = (i, j) => i * 4096 + j;
    for (const entry of boxes) {
      const b = entry.box;
      for (let i = Math.floor(b.minX / cell); i <= Math.floor(b.maxX / cell); i++)
        for (let j = Math.floor(b.minZ / cell); j <= Math.floor(b.maxZ / cell); j++) {
          const k = key(i, j); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(entry);
        }
    }
    // Group wall boxes into buildings: volumes that overlap, or are stacked on top of each other.
    const walls = boxes.filter(entry => entry.role === 'wall' && entry.box.type !== 'beam');
    const parent = new Map(walls.map(entry => [entry, entry]));
    const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
    const union = (x, y) => { x = find(x); y = find(y); if (x !== y) parent.set(y, x); };
    const overlap = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);
    const near = (entry, margin) => {
      const b = entry.box, found = new Set();
      for (let i = Math.floor((b.minX - margin) / cell); i <= Math.floor((b.maxX + margin) / cell); i++)
        for (let j = Math.floor((b.minZ - margin) / cell); j <= Math.floor((b.maxZ + margin) / cell); j++)
          for (const other of grid.get(key(i, j)) || []) if (other !== entry) found.add(other);
      return found;
    };
    const joined = (a, b) => {
      const ox = overlap(a.minX, a.maxX, b.minX, b.maxX), oy = overlap(a.minY, a.maxY, b.minY, b.maxY), oz = overlap(a.minZ, a.maxZ, b.minZ, b.maxZ);
      if (ox > .05 && oy > .05 && oz > .05) return true; // interpenetrating volumes
      const footprint = Math.min((a.maxX - a.minX) * (a.maxZ - a.minZ), (b.maxX - b.minX) * (b.maxZ - b.minZ));
      return Math.abs(oy) <= .05 && ox > 0 && oz > 0 && ox * oz >= footprint * .5; // stacked storeys
    };
    for (const entry of walls) for (const other of near(entry, .1)) if (parent.has(other) && joined(entry.box, other.box)) union(entry, other);
    const clusterOf = new Map(), clusters = [];
    for (const entry of walls) {
      const root = find(entry);
      if (!clusterOf.has(root)) { clusterOf.set(root, clusters.length); clusters.push({ id: clusters.length, boxes: [], minX: 1e9, maxX: -1e9, minY: 1e9, minZ: 1e9, maxZ: -1e9, neighbours: new Set() }); }
      const cluster = clusters[clusterOf.get(root)]; cluster.boxes.push(entry); entry.cluster = cluster;
      cluster.minX = Math.min(cluster.minX, entry.box.minX); cluster.maxX = Math.max(cluster.maxX, entry.box.maxX);
      cluster.minZ = Math.min(cluster.minZ, entry.box.minZ); cluster.maxZ = Math.max(cluster.maxZ, entry.box.maxZ);
      cluster.minY = Math.min(cluster.minY, entry.box.minY);
    }
    // Small wall pieces (ledges, chimneys) join the building they touch; loose ones keep their colour.
    for (const entry of boxes) {
      if (entry.role !== 'wall' || entry.cluster) continue;
      const b = entry.box, m = .15;
      for (const other of near(entry, m)) {
        if (!other.cluster) continue;
        const o = other.box;
        if (overlap(b.minX, b.maxX, o.minX - m, o.maxX + m) > 0 && overlap(b.minY, b.maxY, o.minY - m, o.maxY + m) > 0 && overlap(b.minZ, b.maxZ, o.minZ - m, o.maxZ + m) > 0) { entry.cluster = other.cluster; break; }
      }
    }
    // Neighbouring buildings must not share a colour: assign in a stable order, avoiding used ones.
    for (const cluster of clusters) for (const entry of cluster.boxes) for (const other of near(entry, .3))
      if (other.cluster && other.cluster !== cluster) { cluster.neighbours.add(other.cluster); other.cluster.neighbours.add(cluster); }
    // Extent of the playable area for the district split (ignore the far skyline).
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (const entry of boxes) {
      const b = entry.box; if (Math.abs(b.minX) > 110 || Math.abs(b.minZ) > 110 || Math.abs(b.maxX) > 110 || Math.abs(b.maxZ) > 110) continue;
      minX = Math.min(minX, b.minX); maxX = Math.max(maxX, b.maxX); minZ = Math.min(minZ, b.minZ); maxZ = Math.max(maxZ, b.maxZ);
    }
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, hx = Math.max(10, (maxX - minX) / 2), hz = Math.max(10, (maxZ - minZ) / 2);
    const districtOf = (u, v) => {
      const w = -u, e = u, n = -v, s = v, top = Math.max(w, e, n, s);
      return top < .28 ? 'centre' : top === w ? 'west' : top === e ? 'east' : top === n ? 'north' : 'south';
    };
    const colour = (hex) => new Color().set(hex);
    for (const cluster of [...clusters].sort((a, b) => a.minX - b.minX || a.minZ - b.minZ)) {
      const u = clamp(((cluster.minX + cluster.maxX) / 2 - cx) / hx, -1, 1), v = clamp(((cluster.minZ + cluster.maxZ) / 2 - cz) / hz, -1, 1);
      const choices = DISTRICT_WALLS[districtOf(u, v)];
      const taken = new Set([...cluster.neighbours].map(other => other.name).filter(Boolean));
      const start = Math.floor(hash(cluster.id * 7919 + 13) * choices.length);
      let pick = null;
      for (let i = 0; i < choices.length && !pick; i++) { const candidate = choices[(start + i) % choices.length]; if (!taken.has(candidate)) pick = candidate; }
      // every colour of the district is already next door: borrow one from the other districts rather than repeat
      if (!pick) pick = Object.keys(WALL_HEX).find(name => !taken.has(name));
      cluster.name = pick || choices[start];
      cluster.colour = colour(WALL_HEX[cluster.name]);
      cluster.debug = colour(0xffffff).setHSL(hash(cluster.id * 31 + 5), .8, .5);
    }
    let sameColour = 0;
    for (const cluster of clusters) for (const other of cluster.neighbours) if (other.id > cluster.id && other.name === cluster.name) sameColour++;
    return { entries: boxes, grid, key, cell, clusters, sameColour, slateTop: colour(SLATE_TOP), slateSide: colour(SLATE_SIDE), cx, cz, hx, hz };
  }

  // The box whose face the vertex lies on (first match), or null when the vertex belongs to something else.
  function ownerOf(town, x, y, z, nx, ny, nz) {
    const list = town.grid.get(town.key(Math.floor(x / town.cell), Math.floor(z / town.cell)));
    if (!list) return null;
    const eps = .035, ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    let found = null;
    for (const entry of list) {
      const b = entry.box;
      if (x < b.minX - eps || x > b.maxX + eps || y < b.minY - eps || y > b.maxY + eps || z < b.minZ - eps || z > b.maxZ + eps) continue;
      const onFace = ax >= ay && ax >= az ? Math.abs(x - (nx > 0 ? b.maxX : b.minX)) < eps
        : ay >= az ? Math.abs(y - (ny > 0 ? b.maxY : b.minY)) < eps : Math.abs(z - (nz > 0 ? b.maxZ : b.minZ)) < eps;
      if (!onFace) continue;
      if (!found || entry.role === 'roof' || (found.role !== 'roof' && entry.cluster && !found.cluster)) found = entry;
    }
    return found;
  }

  // Palette for one mesh: Float32Array(count*4) rgb + strength, or null when no vertex is recoloured.
  // A face is only recoloured when all three of its corners lie on the same building (or roof box): a
  // cliff side that merely shares a corner with a house wall must not get a colour gradient.
  function paletteFor(town, geometry, debug) {
    const position = geometry.attributes.position, normal = geometry.attributes.normal;
    if (!position || !normal) return null;
    const count = position.count, owners = new Array(count).fill(null), groups = new Array(count).fill(null);
    for (let i = 0; i < count; i++) {
      const nx = normal.getX(i), ny = normal.getY(i), nz = normal.getZ(i);
      const entry = ownerOf(town, position.getX(i), position.getY(i), position.getZ(i), nx, ny, nz);
      if (!entry) continue;
      if (entry.role === 'roof') groups[i] = 'roof'; // stepped roof boxes are stacked and coplanar: any roof box will do
      else if (entry.cluster) groups[i] = 'c' + entry.cluster.id;
      else continue;
      owners[i] = entry;
    }
    const bad = new Uint8Array(count), index = geometry.index, corners = index ? index.count : count;
    for (let t = 0; t + 2 < corners; t += 3) {
      const a = index ? index.getX(t) : t, b = index ? index.getX(t + 1) : t + 1, c = index ? index.getX(t + 2) : t + 2;
      if (groups[a] === null || groups[a] !== groups[b] || groups[a] !== groups[c]) bad[a] = bad[b] = bad[c] = 1;
    }
    const out = new Float32Array(count * 4), band = new Float32Array(count * 2); let hits = 0;
    for (let i = 0; i < count; i++) {
      const entry = owners[i];
      if (!entry || bad[i]) continue;
      const up = normal.getY(i);
      let c, shade;
      if (entry.role === 'roof') { c = up > .5 ? town.slateTop : town.slateSide; shade = .92 + .16 * hash(entry.index * 17 + 3); }
      else if (Math.abs(up) < .5) {
        c = debug ? entry.cluster.debug : entry.cluster.colour; shade = .96 + .08 * hash(entry.index * 29 + 7);
        // painted plinth and cornice bands (colour only) on walls taller than a storey
        if (entry.box.maxY - entry.cluster.minY > 2.2) { band[i * 2] = entry.cluster.minY; band[i * 2 + 1] = entry.box.maxY; }
      }
      else continue; // flat tops stay as paving, undersides untouched
      out[i * 4] = c.r * shade; out[i * 4 + 1] = c.g * shade; out[i * 4 + 2] = c.b * shade; out[i * 4 + 3] = 1; hits++;
    }
    return hits ? { colours: out, band } : null;
  }

  // Terracotta roof tiles are decoration without a collision box, so they are found by their texture:
  // a saturated red-orange average colour. Returns the average in sRGB (0..1), or null if unreadable.
  const averages = new WeakMap();
  function textureAverage(texture) {
    if (!texture?.image) return null;
    if (averages.has(texture)) return averages.get(texture);
    let average = null;
    try {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
      const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(texture.image, 0, 0, 16, 16);
      const data = ctx.getImageData(0, 0, 16, 16).data; let r = 0, g = 0, b = 0;
      for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
      const n = data.length / 4 * 255; average = [r / n, g / n, b / n];
    } catch { average = null; }
    averages.set(texture, average);
    return average;
  }
  const isTerracottaTile = (material) => { const a = textureAverage(material.map); return !!a && a[0] > a[1] * 1.5 && a[1] > a[2] * 1.3 && a[0] > .4; };
  const linearLuma = (r, g, b) => { const f = c => Math.pow((c + .055) / 1.055, 2.4); return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };

  // Every vertex of a terracotta tile mesh becomes slate: tops lighter, sides darker.
  function tilePalette(town, geometry) {
    const position = geometry.attributes.position, normal = geometry.attributes.normal;
    if (!position || !normal) return null;
    const out = new Float32Array(position.count * 4);
    for (let i = 0; i < position.count; i++) {
      const c = normal.getY(i) > .5 ? town.slateTop : town.slateSide;
      const shade = .94 + .12 * hash(Math.floor(position.getX(i) / 2.5) * 73 + Math.floor(position.getZ(i) / 2.5) * 19 + Math.floor(position.getY(i)));
      out[i * 4] = c.r * shade; out[i * 4 + 1] = c.g * shade; out[i * 4 + 2] = c.b * shade; out[i * 4 + 3] = 1;
    }
    return { colours: out, band: new Float32Array(position.count * 2) };
  }

  // Applies the palette inside the material's own shader, after any custom hooks it already has. The
  // surface's own brightness variation (texture detail) is kept, scaled against what that material
  // normally looks like (colour x texture average), so a recoloured wall still shows its texture.
  function paletteMaterial(material, clone) {
    const previous = material.onBeforeCompile, average = textureAverage(material.map);
    const reference = Math.max(.02, linearLuma(material.color.r, material.color.g, material.color.b) * (average ? linearLuma(...average) : 1));
    clone.onBeforeCompile = function (shader, renderer) {
      previous?.call(this, shader, renderer);
      shader.uniforms.townLumaRef = { value: reference };
      shader.vertexShader = 'attribute vec4 aTownPalette;\nattribute vec2 aTownBand;\nvarying vec4 vTownPalette;\nvarying vec2 vTownBand;\nvarying float vTownY;\n' +
        shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvTownPalette = aTownPalette; vTownBand = aTownBand; vTownY = (modelMatrix * vec4(transformed, 1.0)).y;');
      shader.fragmentShader = 'varying vec4 vTownPalette;\nvarying vec2 vTownBand;\nvarying float vTownY;\nuniform float townLumaRef;\n' + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        if (vTownPalette.a > .0) {
          float townLuma = dot(diffuseColor.rgb, vec3(.2126, .7152, .0722));
          vec3 townColour = vTownPalette.rgb * mix(1.0, clamp(townLuma / townLumaRef, .72, 1.28), .45);
          if (vTownBand.y > vTownBand.x) {
            float plinth = 1.0 - smoothstep(vTownBand.x + .50, vTownBand.x + .56, vTownY);
            float cornice = smoothstep(vTownBand.y - .36, vTownBand.y - .32, vTownY);
            float shadow = smoothstep(vTownBand.y - .46, vTownBand.y - .42, vTownY) * (1.0 - cornice);
            townColour *= (1.0 - .24 * plinth) * (1.0 + .16 * cornice) * (1.0 - .16 * shadow);
          }
          diffuseColor.rgb = mix(diffuseColor.rgb, townColour, vTownPalette.a);
        }`);
    };
    const keyBefore = material.customProgramCacheKey.bind(material);
    clone.customProgramCacheKey = () => keyBefore() + '|town-palette-v3';
  }

  // Colour is stored per vertex (the world is merged into a few big meshes), so the draw call
  // count stays exactly the same. One material clone per original material turns vertex colours on.
  function tintWorld(game, townMode) {
    const scene = game.ue, meshes = [];
    scene.children.forEach(child => { if (child.isMesh && NAMES.has(child.name) && child.geometry?.attributes?.position) meshes.push(child); });
    if (!meshes.length) return { tinted: 0 };
    // Extent of the playable area (ignore the far skyline).
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (const mesh of meshes) {
      const position = mesh.geometry.attributes.position;
      for (let i = 0; i < position.count; i += 7) {
        const x = position.getX(i), z = position.getZ(i);
        if (Math.abs(x) > 110 || Math.abs(z) > 110) continue;
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
    }
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const hx = Math.max(10, (maxX - minX) / 2), hz = Math.max(10, (maxZ - minZ) / 2);
    const town = townMode ? buildTown(game, scene.fog.color.constructor) : null;
    const clones = new Map(), replaced = [], hsl = { h: 0, s: 0, l: 0 };
    let tinted = 0, recoloured = 0, tiles = 0;
    for (const mesh of meshes) {
      const material = mesh.material;
      if (!material || Array.isArray(material) || !material.color || material.transparent) continue;
      material.color.getHSL(hsl);
      const district = !material.vertexColors && hsl.s <= .5; // bright accent colours (route cues) keep their colour
      const tile = town && material.map && isTerracottaTile(material);
      const palette = !town ? null : tile ? tilePalette(town, mesh.geometry) : paletteFor(town, mesh.geometry, townMode === 'debug');
      if (!district && !palette) continue;
      const original = mesh.geometry, position = original.attributes.position, Attribute = position.constructor;
      const geometry = original.clone(); // a new object the renderer has never seen (see the note at the top)
      if (district) {
        const colors = new Float32Array(position.count * 3);
        for (let i = 0; i < position.count; i++) {
          const u = clamp((position.getX(i) - cx) / hx, -1, 1), v = clamp((position.getZ(i) - cz) / hz, -1, 1);
          const [r, g, b] = districtTint(u, v);
          colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b;
        }
        geometry.setAttribute('color', new Attribute(colors, 3));
      }
      if (palette) { geometry.setAttribute('aTownPalette', new Attribute(palette.colours, 4)); geometry.setAttribute('aTownBand', new Attribute(palette.band, 2)); }
      const cacheKey = material.uuid + (district ? 'd' : '') + (palette ? 'p' : '');
      let clone = clones.get(cacheKey);
      if (!clone) {
        clone = material.clone();
        // Material.copy omits custom shader hooks (e.g. the facade's coping).
        clone.onBeforeCompile = material.onBeforeCompile;
        clone.customProgramCacheKey = material.customProgramCacheKey.bind(material);
        if (palette) paletteMaterial(material, clone);
        if (district) clone.vertexColors = true;
        clone.needsUpdate = true; clones.set(cacheKey, clone);
      }
      mesh.geometry = geometry;
      mesh.material = clone;
      replaced.push(original);
      if (district) tinted++;
      if (palette) recoloured++;
      if (tile) tiles++;
    }
    for (const original of replaced) original.dispose(); // free the old GPU copies
    return { tinted, recoloured, tiles, buildings: town?.clusters.length ?? 0, sameColour: town?.sameColour ?? 0 };
  }

  let tries = 0;
  const timer = setInterval(() => {
    const game = window.__skyInternals;
    if (!game || !game.ue) { if (++tries > 200) clearInterval(timer); return; }
    if (!window.__staticMerge?.materialGroups && ++tries < 150) return; // wait for the static merge
    clearInterval(timer);
    try {
      recolourSky(game);
      const world = window.skyLook === 'sky' ? { tinted: 0 }
        : tintWorld(game, window.skyLook === 'town' ? 'town' : window.skyLook === 'townDebug' ? 'debug' : null);
      window.skyLookInfo = { tinted: world.tinted, recoloured: world.recoloured ?? 0, tileMeshes: world.tiles ?? 0, buildings: world.buildings ?? 0, sameColourNeighbours: world.sameColour ?? 0 };
      document.body.dataset.skyLook = window.skyLook;
    } catch (error) { console.warn('look pass skipped', error); }
  }, 200);
})();
