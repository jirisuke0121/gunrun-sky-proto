// Ink outline: a dark line around the silhouette of every static building, roof and ledge, so each
// footing reads against the wall or sky behind it. Drawn as ONE extra mesh ("inverted hull"): the static
// world's triangles are copied once, pushed out along a smoothed normal and drawn back-face only in flat
// ink colour, so the front faces cover everything but the rim. One draw call, no textures, no lights.
//   (default)    on, except in the lightest render-quality preset ("minimum")
//   ?outline=0   off, for comparison
//   ?outline=1   on in every render-quality preset
// The line is a fixed ~1.7 CSS pixels wide at any distance. It is pushed out in SCREEN space, not along the
// surface in the world: a shell with real thickness puts a camera that stands right next to a wall inside
// the shell, and the wall then shows up black. In screen space the hull keeps the wall's own depth, so
// nothing can come between the camera and a wall it is hugging. When the camera is inside a box or within
// ~0.4 m of one (its near plane then cuts the box open), the back faces of that box would show as solid ink,
// so the outline is skipped for those frames; the line comes back as soon as the camera is clear again.
(() => {
  if (location.pathname.endsWith('canyon.html')) return;
  const query = new URLSearchParams(location.search).get('outline');
  if (query === '0') { window.skyInkOutline = { enabled: false, reason: 'query' }; return; }
  const NAMES = new Set(['Merged static world', 'Merged static material groups']);
  const INK = 0x2b2220, BACK_SIDE = 1, WIDTH = 1.7, CLEARANCE = .4;

  function build(game) {
    const { BufferGeometry, Float32Attribute, Mesh, Basic } = game.Geom, scene = game.ue;
    scene.updateMatrixWorld(true);
    // Only faces that lie on the outside of a real collision box get an outline. Hand-made shapes (the sloped
    // roof wedges) are wound inside-out, so an inverted hull over them would be a black patch in front of the
    // wall; faces that match no box (decoration, slopes) simply keep no line.
    const cell = 8, grid = new Map(), cellKey = (i, j) => i * 4096 + j;
    for (const box of game.jn) {
      if (box.hidden || box.shape || !['slab', 'mono', 'beam'].includes(box.type)) continue;
      for (let i = Math.floor(box.minX / cell); i <= Math.floor(box.maxX / cell); i++)
        for (let j = Math.floor(box.minZ / cell); j <= Math.floor(box.maxZ / cell); j++) {
          const k = cellKey(i, j); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(box);
        }
    }
    const EPS = .03, lo = [ 'minX', 'minY', 'minZ' ], hi = [ 'maxX', 'maxY', 'maxZ' ];
    const outsideFace = (tri) => {
      const e1 = [tri[1][0] - tri[0][0], tri[1][1] - tri[0][1], tri[1][2] - tri[0][2]], e2 = [tri[2][0] - tri[0][0], tri[2][1] - tri[0][1], tri[2][2] - tri[0][2]];
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], len = Math.hypot(...n);
      if (!len) return false;
      let axis = 0; for (let a = 1; a < 3; a++) if (Math.abs(n[a]) > Math.abs(n[axis])) axis = a;
      if (Math.abs(n[axis]) / len < .999) return false; // slopes and other non-box faces
      const c = tri[0][axis], sign = n[axis] > 0 ? 1 : -1, u = (axis + 1) % 3, v = (axis + 2) % 3;
      if (Math.abs(tri[1][axis] - c) > 1e-3 || Math.abs(tri[2][axis] - c) > 1e-3) return false;
      const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, cz = (tri[0][2] + tri[1][2] + tri[2][2]) / 3;
      for (const box of grid.get(cellKey(Math.floor(cx / cell), Math.floor(cz / cell))) || []) {
        if (Math.abs(c - box[sign > 0 ? hi[axis] : lo[axis]]) > EPS) continue;
        if (tri.every(q => q[u] >= box[lo[u]] - EPS && q[u] <= box[hi[u]] + EPS && q[v] >= box[lo[v]] - EPS && q[v] <= box[hi[v]] + EPS)) return true;
      }
      return false;
    };
    const sources = []; let skipped = 0;
    scene.children.forEach(child => { if (child.isMesh && NAMES.has(child.name) && !child.material?.transparent && child.geometry?.attributes?.position && child.geometry.attributes.normal) sources.push(child); });
    if (!sources.length) return null;
    const m = new Float32Array(16), p = [0, 0, 0], q = [0, 0, 0];
    // 1) smoothed direction per welded position, so box corners push outward together instead of splitting
    const smooth = new Map(), weld = (x, y, z) => Math.round(x * 50) + ',' + Math.round(y * 50) + ',' + Math.round(z * 50);
    const triangles = [];
    for (const mesh of sources) {
      const geometry = mesh.geometry, position = geometry.attributes.position, normal = geometry.attributes.normal, index = geometry.index;
      mesh.matrixWorld.toArray(m);
      const world = (i, out) => {
        const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
        out[0] = m[0] * x + m[4] * y + m[8] * z + m[12]; out[1] = m[1] * x + m[5] * y + m[9] * z + m[13]; out[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
      };
      const corners = index ? index.count : position.count;
      for (let t = 0; t + 2 < corners; t += 3) {
        const ids = [0, 1, 2].map(k => index ? index.getX(t + k) : t + k), tri = [];
        let keep = true;
        for (const i of ids) {
          world(i, p);
          // skip the far sky pillars below the island and anything far outside the playable area
          if (p[1] < -4 || Math.abs(p[0]) > 120 || Math.abs(p[2]) > 120) { keep = false; break; }
          tri.push([p[0], p[1], p[2], normal.getX(i), normal.getY(i), normal.getZ(i)]);
        }
        if (!keep) continue;
        if (!outsideFace(tri)) { skipped++; continue; }
        for (const v of tri) {
          const key = weld(v[0], v[1], v[2]), sum = smooth.get(key) || (smooth.set(key, [0, 0, 0]), smooth.get(key));
          sum[0] += v[3]; sum[1] += v[4]; sum[2] += v[5];
        }
        triangles.push(tri);
      }
    }
    if (!triangles.length) return null;
    const positions = new Float32Array(triangles.length * 9), directions = new Float32Array(triangles.length * 9);
    triangles.forEach((tri, t) => tri.forEach((v, k) => {
      const sum = smooth.get(weld(v[0], v[1], v[2])), len = Math.hypot(sum[0], sum[1], sum[2]) || 1, at = (t * 3 + k) * 3;
      positions[at] = v[0]; positions[at + 1] = v[1]; positions[at + 2] = v[2];
      directions[at] = sum[0] / len; directions[at + 1] = sum[1] / len; directions[at + 2] = sum[2] / len;
    }));
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32Attribute(positions, 3));
    geometry.setAttribute('aInkDirection', new Float32Attribute(directions, 3));
    const material = new Basic({ color: INK, side: BACK_SIDE });
    const pixel = { value: [0, 0] }, off = { value: 0 };
    material.onBeforeCompile = shader => {
      shader.uniforms.inkPixel = pixel; shader.uniforms.inkOff = off;
      shader.vertexShader = 'attribute vec3 aInkDirection;\nuniform vec2 inkPixel;\nuniform float inkOff;\n' + shader.vertexShader.replace('#include <project_vertex>', `
        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
        vec4 inkClip = projectionMatrix * mvPosition;
        vec2 inkAway = (projectionMatrix * vec4(mat3(modelViewMatrix) * aInkDirection, 0.0)).xy;
        float inkLength = length(inkAway);
        if (inkLength > 1e-5) inkClip.xy += inkAway / inkLength * inkPixel * max(inkClip.w, 0.0);
        if (inkOff > .5) inkClip = vec4(2.0, 2.0, 2.0, 1.0); // camera is touching a box: draw nothing this frame
        gl_Position = inkClip;`);
    };
    material.customProgramCacheKey = () => 'ink-outline-v7';
    const mesh = new Mesh(geometry, material);
    mesh.name = 'Ink outline'; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.matrixAutoUpdate = false;
    const touching = (x, y, z) => {
      for (let i = Math.floor((x - CLEARANCE) / cell); i <= Math.floor((x + CLEARANCE) / cell); i++)
        for (let j = Math.floor((z - CLEARANCE) / cell); j <= Math.floor((z + CLEARANCE) / cell); j++)
          for (const box of grid.get(cellKey(i, j)) || [])
            if (x > box.minX - CLEARANCE && x < box.maxX + CLEARANCE && y > box.minY - CLEARANCE && y < box.maxY + CLEARANCE && z > box.minZ - CLEARANCE && z < box.maxZ + CLEARANCE) return true;
      return false;
    };
    mesh.onBeforeRender = (renderer, _scene, camera) => {
      const size = renderer.domElement, ratio = renderer.getPixelRatio(); // buffer pixels for WIDTH css pixels
      pixel.value = [2 * WIDTH * ratio / Math.max(1, size.width), 2 * WIDTH * ratio / Math.max(1, size.height)];
      off.value = touching(camera.position.x, camera.position.y, camera.position.z) ? 1 : 0;
    };
    scene.add(mesh);
    return { mesh, triangles: triangles.length, unmatched: skipped };
  }

  let tries = 0;
  const timer = setInterval(() => {
    const game = window.__skyInternals;
    if (!game?.ue || !window.skyLookInfo) { if (++tries > 300) clearInterval(timer); return; }
    clearInterval(timer);
    try {
      const made = build(game);
      if (!made) { window.skyInkOutline = { enabled: false, reason: 'no world' }; return; }
      const apply = () => {
        const light = window.skyRenderQuality?.mode === 'minimum' && query !== '1';
        made.mesh.visible = !light;
        window.skyInkOutline = { enabled: !light, triangles: made.triangles, unmatched: made.unmatched };
        document.body.dataset.skyInk = light ? 'off' : 'on';
      };
      document.addEventListener('sky-render-quality-change', apply);
      apply();
    } catch (error) { console.warn('ink outline skipped', error); }
  }, 200);
})();
