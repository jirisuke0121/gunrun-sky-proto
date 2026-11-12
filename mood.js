// Mood: the time of day of the old town. ONE switch, ?mood=noon|dusk|dawn (default dawn; noon = the look
// before this file existed). Only numbers change: sun direction / colour / strength, sky and ground
// ambient colour, fog and sky-gradient colours. No new meshes, lights, textures or draw calls.
//
// Why: the sun stood at ~64 degrees with a strong flat ambient (2.0), so shadows were short and every
// face got nearly the same brightness. Low warm sun + cool shadow side gives form and depth.
//
// Hooks in index.html (two tiny patches):
//   window.skySunDir   the game's sun direction vector (target -> sun); the game moves the sun along it every frame
//   window.skyAmbient  outdoor strength of the hemisphere light (indoors the game still lifts it to 5)
// look-pass.js reads window.skyMood for the sky gradient and fog colour.
(() => {
  const params = new URLSearchParams(location.search);
  const name = params.get('mood') || 'dawn'; // ?mood=noon is the previous look
  const mode = params.get('look');
  // Horizontal heading of the original sun (-.45, .35); the mood only lowers it (elevation) or swings it (azimuth).
  const HEAD = Math.atan2(.35, -.45);
  const dir = (elevationDeg, swing = 0) => {
    const e = elevationDeg * Math.PI / 180, a = HEAD + swing * Math.PI / 180;
    return [Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)];
  };
  const MOODS = {
    dusk: {
      haze: 0xf0a982, skyMid: 0xc98fa6, skyTop: 0x3a4f94, skyLow: 0xb07a78,
      sun: { dir: dir(19), color: 0xff9650, intensity: 2.4 },
      hemi: { sky: 0xb2bcf4, ground: 0xa8827e, ambient: 1.95 }, exposure: 1.42,
      glow: 0xffa466, skyline: [0xa4759a, 0xc795a8],
    },
    dawn: {
      haze: 0xf3c19d, skyMid: 0xe3a5b6, skyTop: 0x6c88cc, skyLow: 0xc19aa0,
      sun: { dir: dir(13, 150), color: 0xffbd86, intensity: 2.3 },
      hemi: { sky: 0xc0c8f6, ground: 0xa88a84, ambient: 1.95 }, exposure: 1.4,
      glow: 0xffc890, skyline: [0xb48e9f, 0xd2a8ac],
    },
  };
  const mood = mode === 'classic' ? null : MOODS[name] || null;
  window.skyMoodName = mood ? name : 'noon';
  window.skyMood = mood;
  if (!mood) return;
  window.skyAmbient = mood.hemi.ambient;

  // One additive sprite toward the sun: a soft halo and a small bright core, drawn from a canvas
  // gradient (no image file). It sits 420 m out along the sun direction and is occluded by the world.
  function addSunGlow(game, mood) {
    const { Sprite, SpriteMaterial, CanvasTexture } = game.Geom;
    const size = 256, canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d'), c = new game.Geom.Basic({ color: mood.glow }).color;
    const rgb = `${Math.round(c.r ** (1 / 2.2) * 255)},${Math.round(c.g ** (1 / 2.2) * 255)},${Math.round(c.b ** (1 / 2.2) * 255)}`;
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,244,222,0.9)'); grad.addColorStop(0.05, `rgba(${rgb},0.7)`);
    grad.addColorStop(0.18, `rgba(${rgb},0.26)`); grad.addColorStop(0.5, `rgba(${rgb},0.07)`); grad.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, size, size);
    const material = new SpriteMaterial({ map: new CanvasTexture(canvas), transparent: true, depthWrite: false, fog: false });
    material.blending = 2; // AdditiveBlending
    const glow = new Sprite(material);
    glow.name = 'Sun glow'; glow.scale.set(420, 420, 1); glow.frustumCulled = false; glow.renderOrder = 1;
    glow.onBeforeRender = (renderer, scene, camera) => { glow.position.copy(camera.position).addScaledVector(window.skySunDir, 420); glow.updateMatrixWorld(); };
    game.ue.add(glow);
  }

  // A ring of far rooftops and towers beyond the play area, as ONE merged mesh in two haze layers
  // (the far one lighter). Colour only, no collision, no texture; ~1500 triangles.
  function addSkyline(game, mood) {
    const { BufferGeometry, Float32Attribute, Mesh, Basic } = game.Geom;
    const pos = [], col = [];
    let seed = 20261112; const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const quad = (a, b, c, d, color) => { for (const p of [a, b, c, a, c, d]) { pos.push(...p); col.push(color.r, color.g, color.b); } };
    const tri = (a, b, c, color) => { for (const p of [a, b, c]) { pos.push(...p); col.push(color.r, color.g, color.b); } };
    const house = (cx, cz, w, d, h, roof, color) => {
      const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y0 = -30, y1 = h, ry = h + roof;
      quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], color); quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], color);
      quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], color); quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], color);
      if (roof > 0) { // gable roof along x
        tri([x0, y1, z1], [x1, y1, z1], [(x0 + x1) / 2 + 0, ry, cz], color); tri([x1, y1, z0], [x0, y1, z0], [(x0 + x1) / 2, ry, cz], color);
        quad([x1, y1, z1], [x0, y1, z1], [x0, ry, cz], [x1, ry, cz], color); quad([x0, y1, z0], [x1, y1, z0], [x1, ry, cz], [x0, ry, cz], color);
      }
    };
    const tower = (cx, cz, w, h, spire, color) => { // slim tower with a pointed top
      const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - w / 2, z1 = cz + w / 2, y0 = -30;
      quad([x0, y0, z1], [x1, y0, z1], [x1, h, z1], [x0, h, z1], color); quad([x1, y0, z0], [x0, y0, z0], [x0, h, z0], [x1, h, z0], color);
      quad([x1, y0, z1], [x1, y0, z0], [x1, h, z0], [x1, h, z1], color); quad([x0, y0, z0], [x0, y0, z1], [x0, h, z1], [x0, h, z0], color);
      for (const [a, b] of [[[x0, z1], [x1, z1]], [[x1, z1], [x1, z0]], [[x1, z0], [x0, z0]], [[x0, z0], [x0, z1]]]) tri([a[0], h, a[1]], [b[0], h, b[1]], [cx, h + spire, cz], color);
    };
    const cx = -4, cz = -6; // the middle of the map
    [[250, mood.skyline[0], 46, 0.7], [330, mood.skyline[1], 64, 0.9]].forEach(([radius, hex, count, scale]) => {
      const color = new Basic({ color: hex }).color;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + rand() * 0.12, r = radius + rand() * 40;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (rand() < 0.14) tower(x, z, (5 + rand() * 4) * scale, (38 + rand() * 40) * scale, (14 + rand() * 12) * scale, color);
        else house(x, z, (14 + rand() * 18) * scale, (12 + rand() * 12) * scale, (14 + rand() * 30) * scale, rand() < 0.7 ? (6 + rand() * 8) * scale : 0, color);
      }
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32Attribute(new Float32Array(pos), 3));
    geometry.setAttribute('color', new Float32Attribute(new Float32Array(col), 3));
    const material = new Basic({ vertexColors: true, fog: false });
    const mesh = new Mesh(geometry, material);
    mesh.name = 'Far skyline'; mesh.frustumCulled = false; mesh.castShadow = mesh.receiveShadow = false;
    game.ue.add(mesh);
    window.skySkyline = { triangles: pos.length / 9 };
  }

  // Drifting dust motes that catch the low sun: 160 camera-facing quads in ONE mesh, animated entirely in
  // the vertex shader (they wrap around the camera inside a 48 x 20 x 48 m box). Pale gold and tiny so they
  // never read as the yellow/orange route cues. Off in the lowest render quality (?motes=1 forces them on).
  function addMotes(game, mood) {
    const { BufferGeometry, Float32Attribute, Mesh, Basic } = game.Geom;
    const COUNT = 160, centre = new Float32Array(COUNT * 4 * 3), corner = new Float32Array(COUNT * 4 * 2), seedA = new Float32Array(COUNT * 4);
    const index = [];
    let seed = 777; const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < COUNT; i++) {
      const x = rand() * 48, y = rand() * 20, z = rand() * 48, phase = rand() * 6.283;
      for (let k = 0; k < 4; k++) {
        const v = i * 4 + k;
        centre.set([x, y, z], v * 3); corner.set([k === 0 || k === 3 ? -1 : 1, k < 2 ? -1 : 1], v * 2); seedA[v] = phase;
      }
      index.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32Attribute(centre, 3));
    geometry.setAttribute('aCorner', new Float32Attribute(corner, 2));
    geometry.setAttribute('aSeed', new Float32Attribute(seedA, 1));
    geometry.setIndex(index);
    const material = new Basic({ color: mood.motes ?? 0xffe9bd, transparent: true, depthWrite: false, fog: false });
    material.blending = 2; // additive
    const uniforms = { uCam: { value: [0, 0, 0] }, uTime: { value: 0 } };
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'attribute vec2 aCorner; attribute float aSeed; uniform vec3 uCam; uniform float uTime; varying vec2 vCorner; varying float vTwinkle;\nvoid main() {')
        .replace('#include <project_vertex>', `
          vec3 box = vec3(48., 20., 48.);
          vec3 drift = vec3(sin(uTime * .21 + aSeed) * 1.6, uTime * .35, cos(uTime * .17 + aSeed * 1.7) * 1.6);
          vec3 local = mod(position + drift - uCam + box * .5, box) - box * .5;
          local.y = mod(position.y + drift.y - uCam.y + 8., 20.) - 8.;
          vec4 mvPosition = viewMatrix * vec4(uCam + local, 1.0);
          float depth = max(-mvPosition.z, 1.);
          mvPosition.xy += aCorner * (.05 + .004 * depth);
          gl_Position = projectionMatrix * mvPosition;
          vCorner = aCorner; vTwinkle = .55 + .45 * sin(uTime * 1.3 + aSeed * 9.);
          vTwinkle *= smoothstep(30., 8., depth) * smoothstep(.8, 2.5, depth);`);
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', 'varying vec2 vCorner; varying float vTwinkle;\nvoid main() {')
        .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.a *= smoothstep(1., .15, length(vCorner)) * vTwinkle * .8;');
    };
    material.customProgramCacheKey = () => 'sky-motes-v1';
    const mesh = new Mesh(geometry, material);
    mesh.name = 'Dust motes'; mesh.frustumCulled = false; mesh.castShadow = mesh.receiveShadow = false; mesh.renderOrder = 2;
    mesh.onBeforeRender = (renderer, scene, camera) => { uniforms.uCam.value = camera.position.toArray(); uniforms.uTime.value = performance.now() / 1000; };
    const apply = () => { mesh.visible = params.get('motes') === '1' || (params.get('motes') !== '0' && document.body.dataset.skyRenderQuality !== 'minimum'); };
    apply(); document.addEventListener('sky-render-quality-change', apply);
    game.ue.add(mesh);
    window.skyMotes = { mesh, count: COUNT };
  }

  let tries = 0;
  const timer = setInterval(() => {
    const game = window.__skyInternals;
    if (!game?.ue || !window.skySunDir) { if (++tries > 200) clearInterval(timer); return; }
    clearInterval(timer);
    let sun = null, hemi = null;
    game.ue.traverse(o => {
      if (o.isDirectionalLight && o.castShadow && !sun) sun = o;
      else if (o.isHemisphereLight && !hemi) hemi = o;
    });
    if (!sun || !hemi) { console.warn('mood skipped: light not found'); return; }
    window.skySunDir.set(...mood.sun.dir).normalize();
    sun.color.set(mood.sun.color); sun.intensity = mood.sun.intensity;
    hemi.color.set(mood.hemi.sky); hemi.groundColor.set(mood.hemi.ground);
    const renderer = window.__game?.debug?.renderer;
    if (renderer && mood.exposure) renderer.toneMappingExposure = mood.exposure; // the game sets 1.25 once and never changes it
    try { addSunGlow(game, mood); addSkyline(game, mood); addMotes(game, mood); } catch (error) { console.warn('mood decoration skipped', error); }
    document.body.dataset.skyMood = window.skyMoodName;
  }, 100);
})();
