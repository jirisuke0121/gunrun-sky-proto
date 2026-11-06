// Look pass: cool blue sky and haze so distant pillars separate from the sand-coloured foreground,
// and a gentle colour shift per district (west brick, east slate-teal, north moss, south dusty rose)
// so the player can tell where they are. Colour only: no new meshes, lights or textures, so draw
// calls do not change.
//   (default)        sky + haze + district colours
//   ?look=sky        sky + haze only
//   ?look=classic    the previous all-beige look, for comparison
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
  window.skyLook = mode === 'sky' ? 'sky' : 'district';

  const HAZE = 0xbcd2e4, SKY_TOP = 0x6f9fd6, SKY_LOW = 0xa9bccb;
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
      const mix = horizon.clone();
      for (let i = 0; i < position.count; i++) {
        const y = position.getY(i) / 500;
        mix.copy(horizon);
        if (y > 0) mix.lerp(top, Math.pow(y, 0.6)); else mix.lerp(low, Math.min(1, -y * 2));
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

  // Colour is stored per vertex (the world is merged into a few big meshes), so the draw call
  // count stays exactly the same. One material clone per original material turns vertex colours on.
  function tintWorld(game) {
    const scene = game.ue, meshes = [];
    scene.children.forEach(child => { if (child.isMesh && NAMES.has(child.name) && child.geometry?.attributes?.position) meshes.push(child); });
    if (!meshes.length) return 0;
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
    const clones = new Map(), replaced = [], hsl = { h: 0, s: 0, l: 0 };
    let tinted = 0;
    for (const mesh of meshes) {
      const material = mesh.material;
      if (!material || Array.isArray(material) || !material.color || material.transparent || material.vertexColors) continue;
      material.color.getHSL(hsl);
      if (hsl.s > 0.5) continue; // bright accent colours (route cues) keep their colour
      const original = mesh.geometry, position = original.attributes.position, Attribute = position.constructor;
      const colors = new Float32Array(position.count * 3);
      for (let i = 0; i < position.count; i++) {
        const u = clamp((position.getX(i) - cx) / hx, -1, 1), v = clamp((position.getZ(i) - cz) / hz, -1, 1);
        const [r, g, b] = districtTint(u, v);
        colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b;
      }
      const geometry = original.clone(); // a new object the renderer has never seen (see the note at the top)
      geometry.setAttribute('color', new Attribute(colors, 3));
      let clone = clones.get(material.uuid);
      if (!clone) {
        clone = material.clone();
        // Material.copy omits custom shader hooks (e.g. the facade's coping).
        clone.onBeforeCompile = material.onBeforeCompile;
        clone.customProgramCacheKey = material.customProgramCacheKey.bind(material);
        clone.vertexColors = true; clone.needsUpdate = true; clones.set(material.uuid, clone);
      }
      mesh.geometry = geometry;
      mesh.material = clone;
      replaced.push(original);
      tinted++;
    }
    for (const original of replaced) original.dispose(); // free the old GPU copies
    return tinted;
  }

  let tries = 0;
  const timer = setInterval(() => {
    const game = window.__skyInternals;
    if (!game || !game.ue) { if (++tries > 200) clearInterval(timer); return; }
    if (!window.__staticMerge?.materialGroups && ++tries < 150) return; // wait for the static merge
    clearInterval(timer);
    try {
      recolourSky(game);
      window.skyLookInfo = { tinted: window.skyLook === 'district' ? tintWorld(game) : 0 };
      document.body.dataset.skyLook = window.skyLook;
    } catch (error) { console.warn('look pass skipped', error); }
  }, 200);
})();
