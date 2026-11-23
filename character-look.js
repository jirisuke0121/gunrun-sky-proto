// Character look (2026-11-23): the runner and the zombies are drawn in the town's own style, and no two zombies in
// a pack look the same. Presentation only: positions, speeds, health, hit boxes and scores are untouched.
//
//   1. Painted look. The Unity characters carry detailed photo textures; the town is flat colour with ink lines.
//      The texture is read partly from a coarse mip (small detail melts into colour areas), its saturation comes
//      down a little, the scene's light is allowed to shade the runner (he was fully self-lit), and a rim in the
//      sky's colour lifts the silhouette off the roofs. Fragment shader only: no extra draw calls.
//   2. Ink line around each zombie (inverted hull, one extra draw per zombie). PC only by default: on phones the
//      extra skinned draw is not measured yet, so it stays off there (?charOutline=1 forces it on, =0 off).
//   3. Zombie variety. Each zombie gets one of five shared material variants (skin tone + cloth colour) and its own
//      build (height / width). The evolved Unity look is loaded for every tier, so packs mix the two models.
//      In the trial tier the evolved look still means "brute"; in the ranked tiers it is only a look.
//   4. No two bodies in one spot. Zombies that stand inside each other are drawn a little apart (the drawn body
//      only; the game's own position, pathing and hit box do not move, so ranked behaviour is unchanged).
//   5. The grapple-anchor ring was a pure-metal material with nothing to reflect, so it rendered black ("a tyre").
//      It now reads as dark iron.
//   ?chars=plain   everything above off (comparison).
(() => {
  const query = new URLSearchParams(location.search);
  if (query.get('chars') === 'plain') { window.skyCharacterLook = { enabled: false, reason: 'query' }; return; }
  const sky = window.__skyInternals;
  if (!sky?.ue || !sky.Geom) return;
  const scene = sky.ue, stats = { styled: 0, variants: 0, hulls: 0, dressed: 0, apart: 0 };
  const touch = () => document.documentElement.classList.contains('touch');
  const outlineQuery = query.get('charOutline');
  const outlineOn = () => outlineQuery === '1' || (outlineQuery !== '0' && !touch());

  // ---- 1. painted look -------------------------------------------------------------------------------------
  const HEAD = 'uniform float uLookFlat;uniform float uLookBias;uniform float uLookSat;uniform vec3 uLookSkin;uniform vec3 uLookCloth;uniform float uLookClothAmt;uniform vec3 uLookRim;uniform float uLookRimPow;\n';
  const MAP = `#ifdef USE_MAP
  vec4 sampledDiffuseColor = mix( texture2D( map, vMapUv ), texture2D( map, vMapUv, uLookBias ), uLookFlat );
  {
    float lookL = dot( sampledDiffuseColor.rgb, vec3( .299, .587, .114 ) );
    float lookCloth = uLookClothAmt * ( 1. - smoothstep( .07, .17, lookL ) );
    sampledDiffuseColor.rgb = mix( sampledDiffuseColor.rgb * uLookSkin, uLookCloth * ( lookL * 14. ), lookCloth );
    lookL = dot( sampledDiffuseColor.rgb, vec3( .299, .587, .114 ) );
    sampledDiffuseColor.rgb = mix( vec3( lookL ), sampledDiffuseColor.rgb, uLookSat );
  }
  diffuseColor *= sampledDiffuseColor;
#endif`;
  const EMISSIVE = `#ifdef USE_EMISSIVEMAP
  #ifdef USE_MAP
    totalEmissiveRadiance *= sampledDiffuseColor.rgb;
  #else
    totalEmissiveRadiance *= texture2D( emissiveMap, vEmissiveMapUv ).rgb;
  #endif
#endif`;
  const RIM = `{
    float lookRim = pow( 1. - clamp( dot( normalize( normal ), normalize( vViewPosition ) ), 0., 1. ), uLookRimPow );
    gl_FragColor.rgb += uLookRim * lookRim;
  }
  #include <tonemapping_fragment>`;
  const hooks = new WeakMap(); // material -> the callbacks it had before this file touched it
  function stylize(material, look) {
    if (!material || material.userData.skyLook || !material.isMeshStandardMaterial) return material;
    material.userData.skyLook = 1;
    const own = hooks.get(material) || { before: material.onBeforeCompile, key: material.customProgramCacheKey }; hooks.set(material, own);
    const before = own.before, key = own.key;
    material.onBeforeCompile = (shader, renderer) => {
      before?.call(material, shader, renderer);
      if (!shader.fragmentShader.includes('#include <map_fragment>') || !shader.fragmentShader.includes('#include <tonemapping_fragment>')) return;
      Object.assign(shader.uniforms, { uLookFlat: { value: look.flat }, uLookBias: { value: look.bias }, uLookSat: { value: look.sat }, uLookSkin: { value: look.skin },
        uLookCloth: { value: look.cloth }, uLookClothAmt: { value: look.clothAmt }, uLookRim: { value: look.rim }, uLookRimPow: { value: look.rimPow } });
      shader.fragmentShader = HEAD + shader.fragmentShader.replace('#include <map_fragment>', MAP).replace('#include <emissivemap_fragment>', EMISSIVE).replace('#include <tonemapping_fragment>', RIM);
    };
    material.customProgramCacheKey = () => (key ? key.call(material) : '') + '|sky-character-look-1';
    material.needsUpdate = true; stats.styled++;
    return material;
  }
  const RIM_COLOUR = [.11, .08, .1];
  const ZOMBIE_LOOK = { flat: .6, bias: 3.5, sat: .82, skin: [1, 1, 1], cloth: [0, 0, 0], clothAmt: 0, rim: RIM_COLOUR, rimPow: 2.6 };
  const HUMAN_LOOK = { flat: .5, bias: 4, sat: .9, skin: [1, 1, 1], cloth: [0, 0, 0], clothAmt: 0, rim: [.1, .075, .09], rimPow: 3 };
  // Skin tone (multiplied) and cloth colour (replaces the dark trousers) per variant. Variant 0 keeps the original.
  const VARIANTS = [
    { skin: [1, 1, 1], cloth: [0, 0, 0], clothAmt: 0 },
    { skin: [.8, .95, .78], cloth: [.045, .06, .12], clothAmt: 1 },
    { skin: [.88, .78, .7], cloth: [.085, .1, .055], clothAmt: 1 },
    { skin: [.74, .82, .96], cloth: [.06, .06, .07], clothAmt: 1 },
    { skin: [1, .95, .8], cloth: [.14, .055, .04], clothAmt: 1 },
  ];
  const variantCache = new Map(); // source material -> [materials]
  function variantOf(source, index) {
    let list = variantCache.get(source);
    if (!list) variantCache.set(source, list = [source]);
    if (!list[index]) { const copy = source.clone(), own = hooks.get(source); copy.userData = { ...copy.userData, skyLook: 0, skyLookVariant: index }; if (own) { copy.onBeforeCompile = own.before; copy.customProgramCacheKey = own.key; hooks.set(copy, own); } stylize(copy, { ...ZOMBIE_LOOK, ...VARIANTS[index] }); list[index] = copy; stats.variants++; }
    return list[index];
  }

  // ---- 2. ink hull for skinned characters ------------------------------------------------------------------
  const inkSize = { value: [0, 0] };
  let inkMaterial = null;
  function ink() {
    if (inkMaterial) return inkMaterial;
    inkMaterial = new sky.Geom.Basic({ color: 0x2b2220, side: 1 });
    inkMaterial.onBeforeCompile = shader => {
      shader.uniforms.uInk = inkSize;
      shader.vertexShader = 'uniform vec2 uInk;\n' + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  #ifdef USE_SKINNING
    vec3 inkN = transformedNormal;
    #ifdef FLIP_SIDED
      inkN = - inkN; // the back-side material flips it; the hull has to grow outwards
    #endif
  #else
    vec3 inkN = normalMatrix * normal;
  #endif
  gl_Position.xy += normalize( inkN.xy + vec2( 1e-5 ) ) * uInk * gl_Position.w;`);
    };
    inkMaterial.customProgramCacheKey = () => 'sky-character-ink-1';
    inkMaterial.fog = true;
    return inkMaterial;
  }
  // One hull per body, added when the body is first drawn (not to the source model: the game clones that for every
  // new zombie, and extra objects there would shift the game's own random-number order).
  function addHull(root) {
    const meshes = []; root.traverse(node => { if (node.isSkinnedMesh && !node.userData.skyInkHull) meshes.push(node); });
    for (const mesh of meshes) {
      const hull = new mesh.constructor(mesh.geometry, ink());
      hull.name = 'Character ink hull'; hull.userData.skyInkHull = true; hull.frustumCulled = false; hull.receiveShadow = false;
      // The game walks every skinned mesh of a body to switch shadows and tints; the hull keeps its own.
      const own = ink(); Object.defineProperty(hull, 'castShadow', { get: () => false, set() {} }); Object.defineProperty(hull, 'material', { get: () => own, set() {} });
      hull.position.copy(mesh.position); hull.quaternion.copy(mesh.quaternion); hull.scale.copy(mesh.scale);
      mesh.parent.add(hull); hull.bind(mesh.skeleton, mesh.bindMatrix); stats.hulls++;
    }
  }

  // ---- 3 + 4. per-zombie dress and drawn separation ---------------------------------------------------------
  let seed = 0x2545f491;
  const roll = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) % 10000) / 10000; }; // own sequence: the game's Math.random order is not disturbed
  const offsets = new WeakMap();
  function dress(zombie) {
    const body = zombie.m; body.skyLook = true; stats.dressed++;
    const index = Math.floor(roll() * VARIANTS.length), tall = .95 + roll() * .1, wide = .93 + roll() * .16;
    const plainKind = zombie.kind && zombie.kind !== 'walker';
    body.skyVariant = index; body.skyMeshes = []; body.skyOwnLook = plainKind ? ZOMBIE_LOOK : { ...ZOMBIE_LOOK, ...VARIANTS[index] };
    body.inner.scale.set(body.inner.scale.x * wide, body.inner.scale.y * tall, body.inner.scale.z * wide);
    body.root.traverse(node => {
      if (!node.isSkinnedMesh) return;
      if (node.userData.skyInkHull) { node.visible = outlineOn(); return; }
      if (plainKind) { stylize(node.material, ZOMBIE_LOOK); body.skyMeshes.push(node); return; } // the trial tier's own tints keep their meaning
      const base = variantCache.has(node.material) ? node.material : (stylize(node.material, ZOMBIE_LOOK), node.material);
      node.material = variantOf(base, index); body.skyMeshes.push(node);
    });
    if (outlineOn()) addHull(body.root);
  }
  const SPACE = .62;
  function separate(list) {
    for (const zombie of list) { const o = offsets.get(zombie) || { x: 0, z: 0, tx: 0, tz: 0, ax: 0, az: 0, px: NaN, pz: NaN }; o.tx = o.tz = 0; offsets.set(zombie, o); }
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j]; if (Math.abs(a.pos.y - b.pos.y) > 1.2) continue;
      let dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz); if (d >= SPACE) continue;
      if (d < .02) { const angle = i * 2.4 + j * 1.3; dx = Math.cos(angle); dz = Math.sin(angle); d = 0; } else { dx /= d; dz /= d; }
      const push = Math.min(.3, (SPACE - d) / 2), oa = offsets.get(a), ob = offsets.get(b);
      oa.tx -= dx * push; oa.tz -= dz * push; ob.tx += dx * push; ob.tz += dz * push; stats.apart++;
    }
    for (const zombie of list) { const o = offsets.get(zombie); o.x += (o.tx - o.x) * .2; o.z += (o.tz - o.z) * .2; const at = zombie.m.root.position;
      // The game sets the position every step; when it did not (paused, hit-stop), take the last offset back first.
      if (at.x === o.px && at.z === o.pz) { at.x -= o.ax; at.z -= o.az; }
      at.x += o.x; at.z += o.z; o.ax = o.x; o.az = o.z; o.px = at.x; o.pz = at.z; }
  }

  // ---- the runner's body: stretch at take-off, lean in the air, squash on landing --------------------------
  // Drawn only (the holder of the model; position, speed, camera and collision are untouched). `?bodyFeel=0` turns it off.
  const bodyFeelOn = query.get('bodyFeel') !== '0' && !(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const body = { holder: null, base: 0, ground: true, vy: 0, kick: 0, kickAge: 9, lean: 0, lastX: NaN, lastLean: 0, last: 0 };
  function bodyFeel() {
    const c = sky.c; if (!c?.vel) return;
    if (!body.holder?.parent) { body.holder = scene.getObjectByName('Unity challenge human') || null; if (!body.holder) return; body.base = body.holder.scale.y; }
    const holder = body.holder, now = performance.now(), dt = Math.min(.05, Math.max(0, (now - body.last) / 1000)); body.last = now;
    const plain = c.state === 'normal' && !c.swingFlight && !c.swingFall && holder.visible;
    const ground = !!c.onGround;
    if (plain && ground !== body.ground) {
      if (!ground && c.vel.y > 2) { body.kick = .07; body.kickAge = 0; }                                  // take-off: stretch
      else if (ground && body.vy < -3) { body.kick = -Math.min(.13, .035 + (-body.vy - 3) * .011); body.kickAge = 0; } // landing: squash
    }
    body.ground = ground; body.vy = c.vel.y; body.kickAge += dt;
    const spring = body.kick * Math.exp(-body.kickAge * 9) * Math.cos(body.kickAge * 15);
    const tall = plain ? 1 + spring : 1, wide = 1 / Math.sqrt(tall);
    holder.scale.set(body.base * wide, body.base * tall, body.base * wide);
    const speed = Math.hypot(c.vel.x, c.vel.z), want = plain && !ground ? Math.min(1, speed / 7) * (c.vel.y > 0 ? .13 : -.05) : 0;
    body.lean += (want - body.lean) * (1 - Math.exp(-dt * 9));
    if (holder.rotation.x === body.lastX) holder.rotation.x -= body.lastLean;   // the game did not step since the last draw
    holder.rotation.x += body.lean * LEAN_SIGN; body.lastLean = body.lean * LEAN_SIGN; body.lastX = holder.rotation.x;
    stats.lean = +body.lean.toFixed(3); stats.tall = +tall.toFixed(3);
  }
  const LEAN_SIGN = 1;

  // ---- per frame, just before the scene is drawn ------------------------------------------------------------
  let humanDone = false, anchorsDone = false, evolvedAsked = false, frame = 0;
  const hookBefore = scene.onBeforeRender;
  scene.onBeforeRender = function (renderer, s, camera, target) {
    hookBefore?.call(this, renderer, s, camera, target);
    if (camera !== sky.Se) return;
    // Nothing here may draw from the game's Math.random (three.js takes four numbers for every new object's id).
    const gameRandom = Math.random; Math.random = roll;
    try { beforeDraw(renderer); } finally { Math.random = gameRandom; }
  };
  function beforeDraw(renderer) {
    frame++;
    const size = renderer.getDrawingBufferSize(inkScratch), ratio = renderer.getPixelRatio();
    inkSize.value[0] = 3.2 * ratio / Math.max(1, size.x); inkSize.value[1] = 3.2 * ratio / Math.max(1, size.y);
    for (const model of sky.zombieModels?.() || []) {
      if (model.skyLook) continue; model.skyLook = true;
      model.scene.traverse(node => { if (node.isSkinnedMesh && node.material?.map) stylize(node.material, ZOMBIE_LOOK); });
    }
    if (!evolvedAsked && frame > 30) { evolvedAsked = true; try { window.__skyWantEvolved = true; window.__skyLoadEvolved?.(); } catch {} }
    if (!humanDone || frame % 240 === 0) {
      scene.traverse(node => {
        if (node.name !== 'Unity challenge human') return;
        node.traverse(mesh => { if (mesh.isMesh && mesh.material?.map && !mesh.material.userData.skyLook) { stylize(mesh.material, HUMAN_LOOK); if (mesh.material.emissiveIntensity > .6) mesh.material.emissiveIntensity = .6; humanDone = true; } });
      });
    }
    if (!anchorsDone || frame % 240 === 0) {
      scene.traverse(node => { if (node.name === 'Meshy grapple anchor mobile LOD') node.traverse(mesh => { const m = mesh.material; if (mesh.isMesh && m && !m.userData.skyIron) { m.userData.skyIron = true; m.metalness = .3; m.roughness = .62; m.color?.setRGB(.62, .58, .56); m.emissive?.setRGB(.2, .175, .165); m.emissiveMap = null; m.needsUpdate = true; anchorsDone = true; } }); });
    }
    const live = [];
    for (const zombie of sky.Jt) {
      const body = zombie.m; if (!body?.meshy || !body.root) continue;
      if (!body.skyLook) dress(zombie);
      // A body is reused after its zombie dies, and the game puts the model's own material back: give it its look again.
      // On the first bullet hit the game gives the zombie its own copies of the materials (so only that body flashes);
      // a copy does not carry the shader patch, so the body would fall back to the raw texture. Give the copy its look.
      else for (const mesh of body.skyMeshes) { const material = mesh.material; if (material && !hooks.has(material) && material.isMeshStandardMaterial) { material.userData.skyLook = 0; stylize(material, body.skyOwnLook); } }
      // Looping walk and run cycles start at a different point for each body, so a pack does not step in unison (drawn only).
      const action = body.curA; if (action && action !== body.skyPhased) { body.skyPhased = action; const length = action.getClip?.().duration; if (action.loop === 2201 && length > .2) action.time = (action.time + roll() * length) % length; }
      if (!zombie.dead && body.root.visible && !zombie.rise && !zombie.fall) live.push(zombie);
    }
    if (live.length > 1) separate(live);
    if (bodyFeelOn) bodyFeel();
  };
  const inkScratch = new sky.Geom.Vector3(); // stands in for the Vector2 the renderer fills (x, y only)
  window.skyCharacterLook = { enabled: true, stats, outline: outlineOn, variants: VARIANTS.length, styled: material => hooks.has(material) };
})();
