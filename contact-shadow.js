// Contact shadow: a soft dark band on the ground where a wall meets the floor. Without it the floor looks
// lit right up to the wall and the building seems to float. It is ONE transparent mesh built from the
// collision boxes at load: for every wall box (>= 1.4 m high) and each of its four sides, runs of 0.5 m
// samples are kept only where a floor top lies at the wall's foot and no other box stands in the way.
// Colour only: no texture, no collision, no shadow casting. +1 draw call, a few hundred triangles.
//   ?contact=0   off      (also off with ?look=classic; hidden in the lowest render quality unless ?contact=1)
(() => {
  const params = new URLSearchParams(location.search);
  if (params.get('contact') === '0' || params.get('look') === 'classic') return;
  const WIDTH = 1.0, LIFT = .014, STEP = .5, INK = 0x2a1a28, STRENGTH = .62;

  function build(game) {
    const { BufferGeometry, Float32Attribute, Mesh, Basic } = game.Geom;
    const boxes = game.jn.filter(b => !b.hidden && !b.shape);
    const CELL = 8, grid = new Map(), key = (i, j) => i * 100003 + j;
    for (const b of boxes) for (let i = Math.floor(b.minX / CELL); i <= Math.floor(b.maxX / CELL); i++) for (let j = Math.floor(b.minZ / CELL); j <= Math.floor(b.maxZ / CELL); j++) {
      const k = key(i, j); (grid.get(k) || grid.set(k, []).get(k)).push(b);
    }
    const near = (x, z) => grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) || [];
    const inside = (b, x, z) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ;
    // the floor top at (x, z) that lies at height y (walkable surfaces only: slabs, solid blocks)
    const floorAt = (x, z, y, self) => near(x, z).find(b => b !== self && (b.type === 'slab' || b.type === 'mono') && Math.abs(b.maxY - y) < .12 && inside(b, x, z));
    const blocked = (x, z, y, self, floor) => near(x, z).some(b => b !== self && b !== floor && inside(b, x, z) && b.minY < y + 1.2 && b.maxY > y + .06);
    const pos = [], shade = [];
    const quad = (a, b, c, d, sa, sb) => { // a-b along the wall (shade sa), c-d outer edge (shade 0)
      for (const [p, s] of [[a, sa], [b, sb], [c, 0], [a, sa], [c, 0], [d, 0]]) { pos.push(p[0], p[1], p[2]); shade.push(s); }
    };
    let runs = 0;
    for (const w of boxes) {
      if (w.type !== 'slab' && w.type !== 'mono' && w.type !== 'beam') continue;
      const height = w.maxY - w.minY, footprint = (w.maxX - w.minX) * (w.maxZ - w.minZ);
      if (w.tint || height < 1.4 || height > 40 || footprint > 700) continue;
      // [fixed axis value, outward sign, range start, range end, is the fixed axis x]
      for (const [fixed, sign, lo, hi, fixedIsX] of [[w.minX, -1, w.minZ, w.maxZ, true], [w.maxX, 1, w.minZ, w.maxZ, true], [w.minZ, -1, w.minX, w.maxX, false], [w.maxZ, 1, w.minX, w.maxX, false]]) {
        const y = w.minY + LIFT; let start = null, last = null;
        const flush = () => {
          if (start === null) return;
          const a = start, b = last + STEP * .5, at = (t, d) => fixedIsX ? [fixed + sign * d, y, t] : [t, y, fixed + sign * d];
          quad(at(a, 0), at(b, 0), at(a, WIDTH), at(b, WIDTH), 1, 1); runs++; start = null;
        };
        for (let t = lo + STEP / 2; t < hi; t += STEP) {
          const ox = fixedIsX ? fixed + sign * WIDTH * .5 : t, oz = fixedIsX ? t : fixed + sign * WIDTH * .5;
          const floor = floorAt(ox, oz, w.minY, w);
          const ok = floor && !blocked(ox, oz, w.minY, w, floor) && !blocked(fixedIsX ? fixed + sign * WIDTH : t, fixedIsX ? t : fixed + sign * WIDTH, w.minY, w, floor);
          if (ok) { if (start === null) start = t - STEP / 2; last = t; } else flush();
        }
        flush();
      }
    }
    if (!pos.length) return null;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32Attribute(new Float32Array(pos), 3));
    geometry.setAttribute('aShade', new Float32Attribute(new Float32Array(shade), 1));
    const material = new Basic({ color: INK, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    material.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('void main() {', 'attribute float aShade; varying float vShade;\nvoid main() {').replace('#include <begin_vertex>', '#include <begin_vertex>\nvShade = aShade;');
      shader.fragmentShader = shader.fragmentShader.replace('void main() {', 'varying float vShade;\nvoid main() {').replace('#include <color_fragment>', `#include <color_fragment>\n diffuseColor.a *= ${STRENGTH.toFixed(2)} * pow(vShade, 1.5);`);
    };
    material.customProgramCacheKey = () => 'sky-contact-shadow-v1';
    const mesh = new Mesh(geometry, material);
    mesh.name = 'Contact shadow'; mesh.frustumCulled = false; mesh.castShadow = mesh.receiveShadow = false; mesh.renderOrder = 1;
    const apply = () => { mesh.visible = params.get('contact') === '1' || document.body.dataset.skyRenderQuality !== 'minimum'; };
    apply(); document.addEventListener('sky-render-quality-change', apply);
    game.ue.add(mesh);
    window.skyContactShadow = { runs, triangles: pos.length / 9, mesh };
    return mesh;
  }

  let tries = 0;
  const timer = setInterval(() => {
    const game = window.__skyInternals;
    if (!game?.ue || !game.jn?.length || !game.Geom) { if (++tries > 200) clearInterval(timer); return; }
    if (!window.skyLookInfo && ++tries < 150) return; // after the look pass, so the walls are final
    clearInterval(timer);
    try { build(game); } catch (error) { console.warn('contact shadow skipped', error); }
  }, 200);
})();
